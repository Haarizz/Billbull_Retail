# Topic — Backup & Disaster Recovery

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: design a complete backup and disaster-recovery (DR) strategy grounded in the current stack.

---

## 1. Current system behavior / existing analysis

- **Database:** PostgreSQL, **one database per tenant** (`application-{client}.properties` each points at its own Postgres DB; base dev default `jdbc:postgresql://localhost:5432/testdb`). Schema managed by Hibernate `ddl-auto=update` + **Flyway** (`baseline-on-migrate`, additive guarded migrations `V1..V30`).
- **File storage is local filesystem:** `upload.path=uploads/`; `FileUploadUtil` writes to `uploads/avatars`; product/brand images, logos (`logoUrl`), stamps (`stampUrl`), and documents are served from `/uploads/**` (permitAll static). **No object storage (S3/Azure Blob) integration** — assets live on the app server's disk.
- **Print templates / LOBs:** stored in DB (Flyway `V30__print_template_lob_oid_repair.sql` indicates large-object/OID template data in Postgres).
- **No application-level backup/restore code, no scheduled backup job, no DR runbook** found in the repo. Backups (if any) are handled at the infrastructure/ops layer (not represented in code).
- **Deployment docs exist** (`DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_8_CLIENTS.md`) — multi-client on-prem/VPS style deployment implied.

**Implication:** two backup domains — **Postgres (per tenant)** and the **`uploads/` filesystem** — plus DB-stored LOBs. Backup/DR is currently an **ops responsibility with no codified strategy**.

## 2. Missing functionality

- No **automated, scheduled DB backups** (per tenant) with retention.
- No **file-storage backup** for `uploads/` (images/logos/stamps/documents/avatars).
- No **incremental / point-in-time recovery (PITR)** (Postgres WAL archiving not configured in-repo).
- No **backup verification** or **restore testing**.
- No **documented DR plan**, RTO/RPO targets, or **high-availability** (single Postgres, single app server implied).
- No **encryption/offsite** policy for backups.
- No **monitoring/alerting** on backup success/failure.

## 3. Challenges and edge cases

1. **Per-tenant multiplicity** — each client is a separate DB; backup automation must iterate all tenant DBs and keep them independently restorable.
2. **DB + files must be consistent** — a restored DB references `uploads/` paths; DB and file backups should be time-aligned (or reconciled) to avoid dangling references.
3. **LOBs in Postgres** — large-object/OID data must be included in `pg_dump` (`--blobs`/appropriate format).
4. **On-prem vs. cloud** — some tenants may be on-prem VPS; DR strategy must not assume a specific cloud.
5. **Restore correctness with Flyway + `ddl-auto`** — restoring a dump then booting the app (which runs Flyway + Hibernate update) must be idempotent (migrations are already guarded).
6. **RPO vs. cost** — nightly dumps = up to 24h data loss; PITR (WAL) = minutes but more setup.
7. **Encryption & security** — backups contain PII, credentials-adjacent data, encrypted columns; must be encrypted at rest + offsite.
8. **Growth** — full dumps of large tenant DBs get slow; need incremental/PITR.
9. **Uploads volume** — image-heavy tenants make full file copies expensive → incremental sync.

## 4. Possible approaches / technologies (comparison)

### Database
| Option | RPO | Pros | Cons |
|---|---|---|---|
| **`pg_dump` scheduled (logical) — baseline (RECOMMENDED start)** | ~24h (or per-schedule) | Simple, portable, per-DB, restore-anywhere; includes blobs | Full each run; not PITR |
| **WAL archiving + base backup (PITR) — RECOMMENDED target** | seconds–minutes | Point-in-time recovery; incremental | More setup; storage for WAL |
| **`pgBackRest` / Barman** | minutes | Managed incremental + PITR + retention + verification | Tooling to operate |
| **Streaming replication / hot standby (HA)** | ~0 (failover) | High availability, minimal downtime | Second server per tenant; ops cost |
| **Managed Postgres (RDS/Cloud SQL) automated backups** | minutes | Backups/PITR/HA handled by provider | Only for cloud-hosted tenants |

### Files (`uploads/`)
| Option | Pros | Cons |
|---|---|---|
| **Migrate to object storage (S3/Azure/MinIO) + versioning (RECOMMENDED long-term)** | Durable, versioned, offsite, lifecycle; decouples from app disk | Requires code change to storage abstraction |
| **`rsync`/`restic`/`borg` incremental to offsite** | Simple, incremental, encrypted (restic/borg) | Still file-server-centric |
| **Snapshot the volume** | Whole-disk PITR-ish | Coarse; cloud/VM dependent |

**Recommendation:** Start with **scheduled `pg_dump` (with blobs) per tenant + `restic`/`borg` encrypted incremental backups of `uploads/`**, both offsite and verified. Progress to **PITR (WAL archiving / pgBackRest)** for low RPO, and to **hot standby** where HA is required. Long-term, introduce a **storage abstraction** so `uploads/` can move to **object storage** (S3/MinIO) with built-in versioning/durability.

## 5. Recommended architecture / DR plan

- **Tiered backups:**
  - **Full logical dump** nightly per tenant DB (`pg_dump -Fc --blobs`), retained (e.g. 7 daily / 4 weekly / 12 monthly).
  - **PITR** via WAL archiving (target state) for minute-level RPO.
  - **File backups:** `uploads/` incremental (restic/borg) hourly/daily, encrypted, offsite; or object storage with versioning.
- **Offsite + encryption:** all backups encrypted at rest (AES-256), stored offsite/second region; keys managed separately.
- **Verification:** automated restore of a random tenant to a scratch instance weekly; checksum/row-count sanity; alert on mismatch.
- **DR runbook:** documented restore procedure (DB dump restore → point uploads → boot app → Flyway/Hibernate reconcile → smoke test), with RTO/RPO targets per tenant tier.
- **Monitoring/alerting:** backup job success/failure + age alerts (ties to Topic 06 Notification / Topic 07 jobs / Topic 04 audit).
- **HA (optional, premium tenants):** Postgres streaming replica + failover; multi-AZ if cloud.

### RTO / RPO targets (proposal — confirm per tenant)
| Tier | RPO | RTO | Mechanism |
|---|---|---|---|
| Standard | 24h | 4–8h | nightly dump + daily file backup |
| Business | 1h | 1–2h | PITR (WAL) + hourly file sync |
| Critical | ~0 | <30m | hot standby + PITR + object storage |

## 6. Database / schema impact (design only)

- **None to app schema.** DR is operational. Optional: a small `backup_run` audit table (status/size/duration/checksum) if backup orchestration is app-driven (ties to Topic 07 jobs + Topic 04 audit). Optional metadata for a future storage abstraction (file keys) if migrating uploads to object storage.

## 7. Backend changes

- **Optional (recommended long-term):** introduce a **`StorageService` abstraction** (local ↔ S3/MinIO) so `FileUploadUtil` writes through it; enables versioned/durable object storage without touching callers.
- **Optional:** an app-triggered backup job (Topic 07) that shells `pg_dump`/`restic` and records `backup_run` + notifies on failure — only if backups are app-orchestrated rather than pure ops/cron.
- Otherwise **no code changes** — backup/DR is infrastructure.

## 8. Frontend changes

- Minimal: optional admin **backup status dashboard** (last backup time, success/failure, verification status) if app-orchestrated. Otherwise none.

## 9. API changes

- Optional admin endpoints: `GET /api/admin/backups` (status/history), `POST /api/admin/backups/run` (manual trigger), gated by a `BACKUP_ADMIN` permission. Only if app-orchestrated.

## 10. Security considerations

- **Encrypt backups at rest** (they contain PII + encrypted-column ciphertext + business data) and **in transit** to offsite.
- **Access control** on backup storage + keys (least privilege, separate key custody).
- **Restore drills** must use isolated/scrubbed environments to avoid leaking prod data.
- **Retention/compliance** — align retention with legal/tax requirements (retail/VAT records).
- Backup admin actions audited (Topic 04); manual triggers rate-limited (Topic 03).

## 11. Performance considerations

- Run dumps in **low-traffic windows**; use `-Fc` (compressed custom format) for speed/size.
- **Incremental** file backups (restic/borg dedup) avoid re-copying image-heavy `uploads/`.
- **PITR/pgBackRest** reduces full-dump load via incrementals.
- Backups should not contend with the app DB — throttle / use a replica for dumps where possible.
- App-orchestrated backups belong in the **background job queue** (Topic 07), never on request threads.

## 12. Configuration requirements

- Backup schedules, retention, offsite target + credentials (encrypted), encryption keys, RTO/RPO per tenant tier, WAL archive location (for PITR), object-storage config (if adopted). Follow existing per-tenant profile + encrypted-config conventions.

## 13. Migration strategy

1. **Codify baseline ops backups:** scheduled `pg_dump --blobs` per tenant + `restic` encrypted incremental of `uploads/`, offsite, with retention. 2. Add **automated restore verification** + alerting. 3. Write the **DR runbook** + RTO/RPO per tenant. 4. Introduce **PITR (WAL/pgBackRest)** for lower RPO. 5. (Optional) build **`StorageService`** abstraction → migrate `uploads/` to **object storage** with versioning. 6. (Premium) add **hot standby/HA**. Each step independent; no app behavior change for steps 1–4.

## 14. Risks and dependencies

- Risk: **DB/file backup time skew** → dangling upload references. Mitigate: align schedules / reconcile; object-storage versioning reduces this.
- Risk: **untested backups** → unrecoverable. Mitigate: mandatory weekly restore verification.
- Risk: **local disk loss = image loss** (single point of failure today). Mitigate: prioritize `uploads/` offsite backup / object storage.
- Risk: **unencrypted offsite backups** → data breach. Mitigate: encryption + key custody.
- Dependencies: offsite storage + credentials; ops tooling (pg_dump/restic/pgBackRest); Topic 07 (if app-orchestrated), Topic 04 (audit), Topic 06 (alerts).

## 15. Step-by-step implementation plan

1. Inventory per-tenant DBs + `uploads/` locations; define RTO/RPO tiers.
2. Stand up scheduled `pg_dump -Fc --blobs` per tenant with retention, encrypted + offsite.
3. Stand up `restic`/`borg` encrypted incremental backups of `uploads/`, offsite.
4. Add backup success/failure monitoring + alerts; record a `backup_run` log.
5. Implement automated weekly restore-verification to a scratch instance.
6. Author the DR runbook (restore DB → files → boot → Flyway/Hibernate reconcile → smoke test).
7. Add PITR (WAL archiving / pgBackRest) for lower-RPO tiers.
8. (Optional) build `StorageService` + migrate uploads to object storage with versioning.
9. (Premium) add Postgres hot standby / failover.

## 16. Open questions

1. Hosting model per tenant — cloud (managed Postgres available?) vs. on-prem/VPS? Determines managed-backup vs. self-managed.
2. RTO/RPO targets per tenant tier (drives PITR vs. nightly, HA vs. none)?
3. Is migrating `uploads/` to object storage (S3/MinIO) acceptable, or must files stay on the app server?
4. Retention/compliance window for financial/VAT records per jurisdiction?
5. Should backups be **app-orchestrated** (code + admin UI) or purely **ops/cron** (no code)?
6. Offsite/second-region target and encryption key custody?
7. Is HA (hot standby) required for any tenant now?

## 17. Recommendation

Treat backup/DR as **two aligned domains — Postgres (per tenant) and the `uploads/` filesystem** — since both hold irreplaceable data and `uploads/` on local disk is today's biggest single point of failure. **Start operationally (no code):** scheduled `pg_dump --blobs` per tenant + encrypted incremental `restic`/`borg` backups of `uploads/`, both offsite, with **automated restore verification**, monitoring, and a written **DR runbook with per-tier RTO/RPO**. **Then reduce RPO** with PITR (WAL archiving / pgBackRest) and, longer-term, introduce a **`StorageService` abstraction** to move uploads to **versioned object storage**, adding **hot standby/HA** for critical tenants. Keep any app-orchestrated backup jobs on the Topic-07 queue with Topic-04 auditing and Topic-06 alerting.
