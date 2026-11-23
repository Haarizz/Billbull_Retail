# Control plane — security model

## Identities kept apart

| Who | Signs in at | Key | Can reach |
|---|---|---|---|
| Client user | `<client>.billbull.app` | that client's `jwt.secret`; token carries `tid=<client>` | that client's `/api/**` (never `/api/platform/**`) |
| BillBull staff | `admin.billbull.app` | `PLATFORM_JWT_SECRET`, audience `billbull-platform` | the platform API only |
| Platform service | — | per-client agent secret (HMAC) | that client's `/api/platform/**` only |

A tenant ADMIN token is refused by the agent (the JWT filter skips that path and the HMAC filter
requires a signature). A platform token means nothing to a tenant (different key and audience).
`SUPER_ADMIN` inside a tenant database remains a tenant role and grants nothing on the platform.

## Platform sign-in

- Email + password (bcrypt cost 12, 12+ characters), then TOTP (RFC 6238). MFA is mandatory
  (`platform.security.require-mfa=true`); a code is accepted once.
- 5 wrong passwords lock the account for 15 minutes; 20 attempts per IP per minute. Unknown emails
  get the same answer and the same bcrypt delay as wrong passwords.
- Sessions last 8 h. The user row is re-read on every request: deactivating a user, changing their
  role, resetting their password/MFA or "Sign out everywhere" ends their sessions immediately.
- Roles: VIEWER (read) ⊂ OPERATOR (change clients, support) ⊂ OWNER (users, plans, secrets, archive).
  The last active OWNER can't be removed; nobody can change their own role.
- The SPA keeps its token in `sessionStorage` on its own origin; nginx sets a strict CSP, HSTS,
  `X-Frame-Options: DENY` and `no-referrer`.

## Agent calls

HMAC-SHA256 over method, path, timestamp, nonce and body hash; ±300 s clock window; nonces are
single-use. The agent refuses every call if its secret is missing or under 32 characters. The
provisioning kit's nginx block also allow-lists the control plane's IPs on `/api/platform/`.
Agent secrets and TOTP seeds are stored AES-256-GCM-encrypted under `PLATFORM_ENC_KEY`.

## What remains to do on the servers (from the architecture audit)

These need server access and a maintenance window; the code no longer depends on them, but they
are the biggest remaining risks:

1. **Rotate every committed secret** (`jwt.secret`, DB passwords in `application-*.properties`) and
   move them to `/etc/billbull/<client>.env`. Changing `jwt.secret` signs that client's users out once.
2. After every client runs the `tid` build and users have signed in again (24 h), set
   `BILLBULL_JWT_REQUIRE_TENANT_CLAIM=true` on each client.
3. **One database role per client** instead of a shared superuser.
4. **Separate working directories** (`/srv/billbull/<client>`) so `./uploads` and `./logs` stop being shared.
5. Heap caps (`-Xmx`), swap, and patching VPS2.

New clients get all of this from the provisioning kit.
