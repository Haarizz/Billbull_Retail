# Database console (admin.billbull.app)

Run SQL, find what to optimise, watch live sessions, run maintenance and take backups on one
client's database at a time: **Database console** in the sidebar, or a client → **Database** tab.

The control plane still never connects to a tenant database. Every action goes
platform → that client's HMAC-signed agent (`/api/platform/db/**`) → its own database, and is
recorded twice: in the platform's hash-chained audit log and in the client's own audit log
(entity `PlatformDatabase`, naming the BillBull staff member).

## What is on, and who switches it

| Capability | Without any switch | Client server switch (`/etc/billbull/<client>.env`) | Platform role |
|---|---|---|---|
| Overview, tables, columns/indexes, optimisation insights | yes | — | VIEWER |
| VACUUM / ANALYZE / REINDEX CONCURRENTLY (background job) | yes | — | OPERATOR |
| Live sessions, locks; cancel a query / end a session | yes (query text hidden) | console switch shows query text | OPERATOR |
| SQL console, read only (SELECT/WITH/EXPLAIN/SHOW) | no | `BILLBULL_PLATFORM_DB_CONSOLE_ENABLED=true` | OPERATOR |
| SQL console, writes (DML, DDL) | no | also `BILLBULL_PLATFORM_DB_CONSOLE_ALLOW_WRITES=true` | OWNER + reason + authenticator code |
| On-demand `pg_dump` backups | no | `BILLBULL_PLATFORM_BACKUPS_ENABLED=true` | OPERATOR to take, OWNER + code to download, OWNER to delete |

Restart the client's backend after changing a switch. The agent itself must be on
(`BILLBULL_PLATFORM_AGENT_ENABLED=true`), and the client must run a backend build that has the
database tools (otherwise the console says `AGENT_NO_DB_TOOLS`).

Optional tenant settings (defaults in brackets):

```
billbull.platform.db-console.read-role=            # run read queries as this role (SET LOCAL ROLE), e.g. a pg_read_all_data role
billbull.platform.db-console.max-rows=5000         # most rows one query returns
billbull.platform.db-console.max-timeout-seconds=120
billbull.platform.db-console.maintenance-max-minutes=60
billbull.platform.backups.dir=backups/platform     # relative to the backend's working directory
billbull.platform.backups.pg-dump=pg_dump          # full path if not on PATH; must be >= the server's major version
billbull.platform.backups.pg-restore=pg_restore
billbull.platform.backups.keep=7                   # newest successful dumps kept
billbull.platform.backups.max-minutes=120
```

## How a statement is kept safe

- **Read mode** runs in a `READ ONLY` transaction that is always rolled back. PostgreSQL itself
  refuses any write, including data-modifying CTEs and `EXPLAIN ANALYZE` of a DML statement.
- Every statement runs on **its own connection** (`application_name=billbull-platform-console`),
  closed afterwards, with `statement_timeout`, `lock_timeout=5s` and
  `idle_in_transaction_session_timeout=60s`. Nothing leaks into the application's pool.
- **One statement per run.** The guard (`SqlGuard`) strips comments and literals, then refuses
  more than one statement and anything that reaches outside the client's data or switches off its
  safeguards, in every mode: `COPY`, server file functions, `lo_*`, `dblink`, `pg_terminate_backend`
  and friends, `set_config`, `SET ROLE`, `session_replication_role`, `DISABLE TRIGGER` (the audit
  ledgers depend on triggers), `ALTER SYSTEM`, roles/databases/extensions, functions/procedures,
  `DO`, `CALL`, `BEGIN/COMMIT`, `GRANT`, temp tables.
- **Writes** need: the client's switch, the OWNER role, a reason (10+ characters), and — to
  commit — an authenticator code (re-asked after 5 minutes). "Preview only" (default) runs the
  statement and rolls it back, showing how many rows it would change. `DROP`/`TRUNCATE`, and
  `UPDATE`/`DELETE` without `WHERE`, also need the client code typed in. `VACUUM` and
  `… CONCURRENTLY` can't run in a transaction, so they can't be previewed.
- Results: at most `max-rows`, cells cut at 4,000 characters, numerics returned as exact text.

The guard is a second line of defence. Most clients' backends still sign in as a PostgreSQL
superuser; the real fix is one non-superuser role per client (SECURITY.md, item 3). The Overview
tab warns when the login is a superuser.

## Optimise tab

Checks run on demand from PostgreSQL's catalogue and statistics (no business rows):
foreign keys without an index, duplicate and invalid indexes, unused indexes (excluding unique and
constraint ones), tables with >10% dead rows, stale planner statistics, heavy sequential scans,
sequences over half used, cache hit ratios, transaction-ID wraparound, and — when the
`pg_stat_statements` extension is installed — the slowest queries. Each finding has a ready fix:
index changes open in the console (write mode, `CONCURRENTLY`, for an OWNER to review and run);
vacuum/analyze run as a background job. Usage counters start at the last statistics reset or
server restart — check over a representative period before dropping an "unused" index.

## Backups

**Back up now** runs `pg_dump -Fc` on the client's server into `billbull.platform.backups.dir`
(`<client>-<UTC stamp>.dump`), verifies it with `pg_restore --list`, records size and SHA-256 in a
`.json` sidecar, and keeps the newest `keep`. It refuses to start when free disk is below half the
database size + 200 MB. Finished dumps also appear under **Backups** (location `agent:<file>`), so
the dashboard's "no backup reported" warning clears.

**Download** (OWNER + authenticator code) returns a single-use link valid for 2 minutes; the
platform streams the file from the agent without storing it. Restore with
`pg_restore --clean --if-exists -d <database> <file>` after checking the SHA-256.

These dumps sit on the database server's own disk. They complement the nightly
`billbull-backup` script (which should copy off-server); they don't replace it.

## Reverse proxies

Both nginx configs allow 660 s reads (statements may run up to 10 minutes): the provisioning kit's
`/api/platform/` block (`proxy_read_timeout 660s; proxy_buffering off;`) and admin.billbull.app's
`/api/` block, plus an unbuffered `/api/db-downloads/` block. Existing clients' nginx needs the
two lines added by hand.

## Platform API

| Call | Role |
|---|---|
| `GET /api/tenants/{id}/db/overview`, `/tables`, `/insights`, `/jobs`, `/backups`; `POST …/db/table` | VIEWER |
| `GET …/db/activity`, `POST …/db/activity/{pid}/cancel` `{terminate, reason}` | OPERATOR |
| `POST …/db/query` `{sql, mode READ/WRITE, maxRows, timeoutSeconds, dryRun, confirmDestructive, reason, code}` | OPERATOR (READ) / OWNER (WRITE) |
| `POST …/db/explain` `{sql, analyze, timeoutSeconds}`, `POST …/db/maintenance` `{action, schema, table}`, `POST …/db/backups` `{note}` | OPERATOR |
| `POST …/db/backups/{name}/download` `{code}` → `{url}`; `POST …/db/backups/{name}/delete` | OWNER |
| `GET /api/db-downloads/{ticket}` | the ticket |

A missing or stale authenticator code answers **403** `STEP_UP_REQUIRED` / `STEP_UP_INVALID`
(not 401, which would sign the user out); the admin app prompts and retries.
