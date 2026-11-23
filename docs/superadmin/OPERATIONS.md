# Operating the control plane

## Daily

The **Dashboard** lists what needs attention: health not UP, failed sync, failed or pending Flyway
migrations, heap above 90%, disk under 10% free, and backups that failed, are older than 26 h or were
never reported. "Deployed builds" groups clients by jar SHA-256, so a client left on an old build stands out.

## Health results

| Result | Meaning | Usual fix |
|---|---|---|
| UP | Agent answered; DB and migrations fine | — |
| DEGRADED | Answered, but a metric failed or a migration is pending/failed | Read "Problems" on the client's Health tab |
| DOWN | Answered, but its database is unreachable | Check PostgreSQL on that server |
| UNREACHABLE | No answer (connection refused, DNS, timeout) | Is the service running? Is nginx up? |
| AUTH_FAILED | Signature refused (401) or agent secret missing (503) | Secret mismatch after rotation, or server clock off by >5 min (`timedatectl`) |
| AGENT_OFF | 404 — agent disabled | `BILLBULL_PLATFORM_AGENT_ENABLED=true` in the env file, restart |
| NOT_CONFIGURED | No agent URL/secret in the registry | Edit the client |

## Suspending and read-only

Status → READ_ONLY or SUSPENDED needs an internal reason (10+ characters, audited) and a typed
confirmation of the client code. The optional customer message is what their users see. Users are
cut off on their next request (the client caches state for up to 15 s). Nothing is deleted;
ACTIVE restores everything at once.

## Support sessions

Client page → Support access → reason, ticket, 15/30/60 minutes → **Open**. The link signs you in on
the client's own site in a new tab; don't paste it anywhere. End sessions early from the same tab or
the Support access page. The client sees every session under Settings → BillBull Account.

## Rotating a client's agent secret

Provisioning → Rotate (OWNER). Put the new value in `/etc/billbull/<code>.env`, restart the client
backend, then Check health. Until then the client shows AUTH_FAILED; its enforcement is unaffected.

## Backups

`docs/superadmin/billbull-backup.sh` (one per server) dumps each listed database with `pg_dump -Fc`,
checks it with `pg_restore --list`, archives the client's `uploads/`, and reports each result to
`POST /api/backups/report` with `X-Backup-Token`. Install it as described at the top of the script and
list the server's clients in `TENANTS`. Copy `/var/backups/billbull` off the server.

Test a restore at least monthly, into a scratch database, never over a live one:
```bash
createdb restore_check && pg_restore --no-owner -d restore_check /var/backups/billbull/<code>-<stamp>.dump
psql -d restore_check -c "select max(version::int) from flyway_schema_history where success"
dropdb restore_check
```

## Audit log

Every sign-in (and failed attempt), status/plan/module/limit change, support session, secret rotation
and user change is recorded. The table refuses UPDATE/DELETE/TRUNCATE; **Verify integrity**
recomputes the SHA-256 chain and names the first altered event.

## Platform's own backup

Add `billbull_platform` to the backup script on the platform's server, and keep `PLATFORM_ENC_KEY`
in the password manager: without it the stored agent secrets and MFA seeds can't be decrypted.
