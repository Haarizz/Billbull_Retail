# Standalone POS — deployment

> **Status:** ready for review. **No production server, nginx vhost, certificate or tenant backend has been touched.** Running the steps below on a live server needs explicit rollout authorization.

The POS is a static bundle served at `/pos/` on each tenant's **existing** origin. It needs no new backend, database, port, certificate, CORS entry or Spring profile. The `/api/` and `/uploads/` proxy rules stay exactly as they are.

**Backend prerequisite (permission audit).** This branch adds a `sales.pos` check and branch scope to the existing POS endpoints, and makes adding, changing or removing cash drawers and printers need `pos.devices` / `pos.printers`. There is no schema or data change. Before deploying the backend to a tenant, run the read-only checks in [PERMISSIONS.md](PERMISSIONS.md#before-rollout) and resolve what they return. Otherwise users in those roles will get a 403 when they try to sell or to set up till hardware. The third pass (2026-10-10) adds checks 3–6. Counter, scanner and settings setup move to the `pos.*` keys. A network printer whose address is not a private LAN address on port 9100–9109 is refused, so correct it first. The defaults can be widened with `pos.printer.network.allowed-ports` / `allow-loopback` / `allow-public`; leave `allow-loopback` off outside development. There is still no schema or data change.

## 1. Build (on the server, alongside the usual Retail build)

```bash
cd /root/billbull/billbull-frontend
npm install            # links the @billbull/shared and @billbull/pos workspaces
npm run build          # Retail  → dist/            (unchanged)
npm run build:pos      # POS     → apps/pos/dist/   (new)
```

The POS bundle holds no tenant name, host, port or database, so one build serves every tenant on the server.

## 2. Install the bundle

The bundle goes **outside** `/var/www/billbull`, because the Retail update step runs `rm -rf /var/www/billbull/*`. It sits under a `pos/` folder so nginx can serve it with `root`, which avoids nginx's alias/try_files pitfalls.

```bash
mkdir -p /var/www/billbull-pos/pos
rm -rf /var/www/billbull-pos/pos/*
cp -r /root/billbull/billbull-frontend/apps/pos/dist/* /var/www/billbull-pos/pos/
ls -la /var/www/billbull-pos/pos/          # index.html, assets/
```


## 3. nginx (once per tenant vhost)

Add the four `location` blocks from [`nginx-pos-locations.conf`](nginx-pos-locations.conf) inside each tenant's 443 `server { }` block. Place them before `location / { try_files $uri $uri/ /index.html; }`. Leave `location /`, `/assets/`, `/uploads/` and `/api/` unchanged.

```nginx
location = /pos { return 301 /pos/; }

location = /pos/index.html {
    root /var/www/billbull-pos;
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

location ^~ /pos/assets/ {
    root /var/www/billbull-pos;
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location ^~ /pos/ {
    root /var/www/billbull-pos;
    try_files $uri /pos/index.html;
}
```

Then:

```bash
nginx -t && systemctl reload nginx
```

### What the snippet was verified to do

These were checked against nginx 1.26.3 locally, with the real Retail and POS builds staged as above and the four blocks included in a vhost shaped like `DEPLOYMENT_GUIDE.md`'s:

| Request | Result |
|---|---|
| `nginx -t` | syntax ok, test successful |
| `/pos` | 301 → `/pos/` |
| `/pos/`, `/pos/login`, `/pos/any/deep/route`, `/pos/index.html` | 200, POS app shell, `Cache-Control: no-store, no-cache, must-revalidate` |
| `/pos/assets/index-<hash>.js` | 200, `application/javascript`, a single `Cache-Control: public, max-age=31536000, immutable` |
| `/pos/assets/missing.js` | 404 (never the app shell) |
| `/`, `/sales/pos`, `/dashboard`, `/assets/<retail>.js` | Retail, unchanged |
| `/api/auth/profile` | proxied to the backend unchanged (401 without a token) |

The built POS `index.html` references `/pos/assets/...`. Its API calls are same-origin `/api/...`, never `/pos/api/...`.

## 4. Smoke check after deploy

1. Open `https://<tenant-host>/pos/`. The till sign-in appears.
2. Sign in as a cashier. The till opens on the POS dashboard, with the branch code in the left rail.
3. `https://<tenant-host>/sales/pos` still works for the same user.
4. In DevTools → Network, requests go to `https://<tenant-host>/api/...`.

## 5. Updating later

Repeat steps 1 and 2. No nginx reload is needed: `index.html` is never cached, and new assets have new hashes.

To update both apps on a server in one go, add these lines after the existing frontend copy in `UPDATE_RUNNING_CLIENTS.md`:

```bash
cd /root/billbull/billbull-frontend && npm run build:pos \
  && mkdir -p /var/www/billbull-pos/pos && rm -rf /var/www/billbull-pos/pos/* \
  && cp -r apps/pos/dist/* /var/www/billbull-pos/pos/
```

## 6. Docker image (if used)

The Retail `billbull-frontend/Dockerfile` now copies both workspace manifests before `npm ci`. A POS image, if one is ever wanted, is the same build with `npm run build:pos` and `apps/pos/dist` served under `/pos/`. None has been built.

## 7. Browser storage, checkout recovery and abandonment

Both till paths (`/pos/` and `/sales/pos`) save every sale in the browser **before** sending it. These requirements apply to every till browser.

### IndexedDB is required

- The till keeps each sale it sends in IndexedDB (database `billbull-pos-checkout`, store `operations`): the checkout key, the exact request and its state. The record is written to disk first (strict durability where the browser supports it), and the request is sent only after that.
- If IndexedDB is missing, blocked, or full, **the till refuses to send the sale.** The cashier sees "could not save the sale safely … NOT sent". There is no fallback that sends a sale without its saved record.
- Use a normal (not private/incognito) browser profile. Do not apply policies that block site storage for the tenant origin, such as `DefaultCookiesSetting=2` or storage-blocking extensions. Leave a few MB of free disk space.
- The record holds the sale only. Supervisor PINs and passwords are never stored. It is kept per tenant origin, branch and terminal. Signing out deletes nothing.
- Resolved records are purged automatically after 14 days. Unresolved ones are never purged automatically.

### Several tabs on one till

Two tabs or windows of the same till share one IndexedDB. The same sale settled in both tabs still gets **one** checkout key, because the key is chosen inside an IndexedDB transaction.

While one tab is sending a sale, it holds a 30-second lease on it, renewed every 10 seconds. The other tab shows "Being sent from another tab or window" and cannot send or abandon that sale. If a tab crashes or is closed, its lease runs out within 30 seconds. The sale then becomes actionable again, with the same key and the exact saved request. The server's idempotency and fencing still decide every outcome.

### What the cashier sees after a reload, crash or lost answer

The "Unconfirmed checkouts on this till" notice lists every sale the server has not confirmed. It offers:

- **Check status:** a read-only lookup.
- **Send again:** the same key and the same saved request. Only the user who started the sale can do this.
- **Abandon on server.**

The two-minute "Dismiss" of earlier builds is gone. "The server has no sale under this checkout" is **not** proof that the sale was not recorded, because an earlier copy of the request can still arrive. Such a sale stays listed until one of two things happens:

- it is confirmed as recorded (shown once, with its invoice number), or
- the server confirms that its key is **ABANDONED**.

**Abandon on server** (`POST /api/pos/checkout/attempts/abandon`) reserves the key for good. Any later request under that key is refused (`409 CHECKOUT_ABANDONED`) before anything is written. The server refuses to abandon a sale that is:

- recorded,
- still being recorded (ACTIVE), or
- partly recorded (STALLED). A supervisor must review and release a STALLED attempt first.

The sale then stays on the notice.

Only three people can look up, abandon or list a checkout: the user who started it, the current owner of its session, or a supervisor (SUPERVISOR/MANAGER/ADMIN) of its branch. The caller must also have access to the branch. Anyone else gets `403`.

### Clearing site data, or a new browser or profile

Clearing the browser's site data for the tenant (or moving the till to another browser or profile) deletes the till's saved sales.

**Before clearing site data on a till, open the till and make sure the unconfirmed-checkouts notice is empty.**

After a clear, the till asks the server (`GET /api/pos/checkout/attempts/recoverable`, last 72 hours) and lists, under "Found on the server, not saved on this till", what it received under keys the till no longer holds:

- recorded sales of this session or terminal, with their invoice numbers;
- sales still being recorded;
- stalled sales;
- sales that were not recorded.

These can be acknowledged, but not sent again. The server never stores a sale's request, only its outcome. **A sale whose request never reached the server cannot be recovered from the server.** If site data is cleared while such a sale is unconfirmed, that sale exists nowhere and must be rung up again if the customer still wants it.

Clearing site data also clears the till's terminal identity and pairing (localStorage). The till then registers as a new terminal and asks to transfer the open session.

### Server side

- Attempt states: `ACTIVE`, `COMPLETED`, `FAILED`, `STALLED`, `RELEASED`, `ABANDONED`.
  - An attempt whose lease expires with nothing recorded becomes `FAILED`. It can be retried with the same key and the same request.
  - `ABANDONED` comes only from an explicit abandonment, and it is terminal.
- Schema: V138/V139 (no new migration). `pos.checkout.attempt.lease-seconds` (default 120) is unchanged.
- Abandonments are written to the POS audit log as `CHECKOUT_ATTEMPT_ABANDONED`. Refused checkouts under an abandoned key are logged as `CHECKOUT_ABANDONED`.

## Rollback

POS rollback never touches the backend or database, because both apps use the same API and data.

- **Per till:** point the till's bookmark or shortcut back to `https://<tenant-host>/sales/pos`. The device fingerprint and terminal id are the same on both paths (same origin, same localStorage keys), so the till keeps its terminal, and an open POS session can be continued there.
- **Per tenant:** remove the four `/pos` `location` blocks and run `nginx -t && systemctl reload nginx`. `/pos/` then falls through to Retail, and a signed-in user lands on the Retail app.
- **Server-wide:** additionally `rm -rf /var/www/billbull-pos`.

Do **not** remove `/sales/pos` during rollout or pilot. See `PILOT_AND_ROLLBACK.md`.
