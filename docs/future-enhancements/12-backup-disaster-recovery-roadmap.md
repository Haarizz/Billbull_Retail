# Backup & Disaster Recovery — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`12-backup-disaster-recovery.md`](12-backup-disaster-recovery.md) (treat backup/DR as two aligned domains — **Postgres per tenant** and the **`uploads/` filesystem**; start operationally with scheduled `pg_dump --blobs` + encrypted incremental `restic`/`borg` of `uploads/`, both offsite + verified, plus a DR runbook with per-tier RTO/RPO; then reduce RPO with PITR; longer-term add a `StorageService` abstraction to move uploads to versioned object storage, and hot standby for critical tenants). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **This roadmap is mostly operational.** Phases 1–4 and 7 are **ops/infrastructure with no application code** — they change deployment, not the app. Only Phases 5, 8, and the optional admin surfaces touch the codebase. Each phase is independently deliverable and reversible; steps 1–4 change **no app behaviour**.
>
> **Golden rules for every phase below**
> - **Backups are worthless until a restore is proven** — automated restore verification is mandatory, not optional.
> - **`uploads/` on local disk is today's biggest single point of failure** — prioritize getting it offsite.
> - **DB and file backups must be time-aligned** (or reconciled) so a restored DB's `uploads/` paths aren't dangling.
> - **Everything encrypted at rest + in transit, offsite**; keys held separately from the data.
> - **LOBs/OIDs must be in the dump** (`pg_dump -Fc --blobs`) — print templates live as Postgres large objects.
> - Any app-orchestrated backup runs on the **Topic-07 job queue** with **Topic-04 audit** and **Topic-06/09 alerting** — never on a request thread.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| Postgres, one DB per tenant (profile-per-client) | ✅ (CLAUDE.md multi-tenant note) | Backup automation iterates all tenant DBs. |
| `uploads/` local filesystem (`upload.path=uploads/`, `FileUploadUtil`) | ✅ (per design §1) | Second backup domain; SPOF today. |
| Print templates as Postgres LOB/OID (`V30__print_template_lob_oid_repair.sql`) | ✅ (CLAUDE.md migrations) | Must be in `--blobs` dump. |
| No app-level backup/restore code, no DR runbook | ✅ (per design §1) | Backup is ops responsibility, uncodified. |
| Flyway + `ddl-auto=update` idempotent on restore | ✅ (CLAUDE.md — guarded additive migrations) | Restore → boot → reconcile is safe. |
| Topic-07 queue / Topic-04 audit for app-orchestrated path | ⚠️ dependency | Only if backups become app-orchestrated (Phase 5/8). |

---

## Phase map

| # | Phase | App code? | Reversible? | Complexity |
|---|---|---|---|---|
| 0 | Inventory + RTO/RPO tiers + hosting decisions | No | n/a | S |
| 1 | Scheduled `pg_dump --blobs` per tenant (encrypted, offsite, retention) | No (ops) | Yes | M |
| 2 | Encrypted incremental `restic`/`borg` of `uploads/` (offsite) | No (ops) | Yes | M |
| 3 | Backup monitoring + alerting + `backup_run` log | No (ops) / optional table | Yes | S |
| 4 | Automated restore verification (weekly) | No (ops) | Yes | M |
| 5 | DR runbook + (optional) admin backup dashboard | Optional app | Yes | M |
| 6 | PITR (WAL archiving / pgBackRest) for lower-RPO tiers | No (ops) | Yes | L |
| 7 | (Optional) `StorageService` abstraction → object storage | Yes (app) | Yes | L |
| 8 | (Premium) Postgres hot standby / HA | No (ops) | Yes | L |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+ (ops or eng).

---

## Phase 0 — Inventory + RTO/RPO tiers + hosting decisions

**Objective.** Enumerate every tenant DB + `uploads/` location, set RTO/RPO tiers, and decide hosting/orchestration/storage questions. No code.

**Scope.** Written inventory + decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Missing a tenant DB or an `uploads/` path → unprotected data. Mitigation: this phase is the exhaustive inventory gate.

**Testing checklist.**
- [ ] Every tenant DB + `uploads/` path inventoried.
- [ ] Hosting per tenant: cloud (managed Postgres?) vs. on-prem/VPS (§16.1).
- [ ] RTO/RPO tier per tenant (Standard/Business/Critical) (§16.2).
- [ ] `uploads/` → object storage acceptable, or must stay on app server? (§16.3).
- [ ] Retention/compliance window for financial/VAT records (§16.4).
- [ ] App-orchestrated vs. pure ops/cron (§16.5).
- [ ] Offsite target + encryption-key custody (§16.6).
- [ ] HA required for any tenant now? (§16.7).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Complete inventory + signed decisions on §16.1–16.7; per-tier RTO/RPO table.

---

## Phase 1 — Scheduled `pg_dump --blobs` per tenant

**Objective.** Codified logical DB backups for every tenant — encrypted, offsite, retained. The baseline safety net.

**Scope.** Ops (cron/scheduler + scripts). No app code.

**Files/modules affected.** None in-repo (deployment/ops scripts).

**Database changes.** None (read-only dumps).

**Backend changes.** None.

**Frontend/API changes.** None.

**Risks.** Missing LOBs (print templates) or a tenant; dumps contending with the live DB. Mitigation: `pg_dump -Fc --blobs` (includes OIDs); iterate all tenants from the Phase-0 inventory; run in low-traffic windows / from a replica where possible; encrypt (AES-256) + offsite.

**Testing checklist.**
- [ ] Every tenant DB dumped nightly (`-Fc --blobs`).
- [ ] Dump includes large objects (print templates present in a test restore).
- [ ] Backups encrypted at rest + offsite.
- [ ] Retention applied (e.g. 7 daily / 4 weekly / 12 monthly).
- [ ] Dump does not degrade live DB performance (windowed / replica).

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** All tenants dumped on schedule, encrypted + offsite + retained, blobs included, no live-perf impact.

---

## Phase 2 — Encrypted incremental `restic`/`borg` of `uploads/`

**Objective.** Get the `uploads/` filesystem (images/logos/stamps/documents/avatars) offsite — closing today's biggest SPOF.

**Scope.** Ops (backup tool + schedule). No app code.

**Files/modules affected.** None in-repo.

**Database changes.** None.

**Backend/Frontend/API changes.** None.

**Risks.** DB/file backup time skew → dangling upload references (design §14). Mitigation: align `uploads/` backup schedule with the DB dump window (or reconcile); `restic`/`borg` dedup makes frequent runs cheap; encrypt + offsite.

**Testing checklist.**
- [ ] `uploads/` backed up incrementally (dedup) per tenant/server.
- [ ] Encrypted + offsite.
- [ ] Schedule aligned with DB dumps (minimal skew).
- [ ] A restored `uploads/` + restored DB have no dangling references (spot-check).

**Estimated complexity.** M. **Dependencies.** Phase 0 (locations); align with Phase 1.

**Exit criteria.** `uploads/` backed up incrementally, encrypted, offsite, time-aligned with DB backups.

---

## Phase 3 — Backup monitoring + alerting + `backup_run` log

**Objective.** Know when a backup fails or goes stale.

**Scope.** Ops monitoring (+ optional app table if orchestrated).

**Files/modules affected.** Ops alerting; **optional** `.../db/migration/V34__backup_run.sql` (`backup_run` audit table: status/size/duration/checksum) only if backups are app-orchestrated (§16.5).

**Database changes.** Optional `backup_run` table (additive, guarded) — only if app-orchestrated.

**Backend changes.** None (pure ops) unless app-orchestrated (then record `backup_run` + notify via Topic 09).

**Frontend/API changes.** None (dashboard is Phase 5).

**Risks.** Silent backup failure. Mitigation: success/failure + age alerts; alert if last backup older than the tier's RPO.

**Testing checklist.**
- [ ] Backup success + failure both alert.
- [ ] Stale-backup (age > RPO) alerts.
- [ ] `backup_run` recorded (if app-orchestrated).

**Estimated complexity.** S. **Dependencies.** Phases 1–2; Topic 09 (alerts) if app-orchestrated.

**Exit criteria.** Backup failures/staleness alert reliably per tenant.

---

## Phase 4 — Automated restore verification (weekly)

**Objective.** Prove backups actually restore — the step that makes the whole strategy real.

**Scope.** Ops (scheduled restore to a scratch instance).

**Files/modules affected.** None in-repo (ops automation).

**Database changes.** None (restores to an isolated scratch DB).

**Backend/Frontend/API changes.** None.

**Risks.** Restore drill leaking prod data / untested backups being unrecoverable (design §14). Mitigation: restore to an **isolated/scrubbed** environment; checksum/row-count sanity; alert on mismatch.

**Testing checklist.**
- [ ] Weekly restore of a random tenant to a scratch instance succeeds.
- [ ] Restored DB boots (Flyway/Hibernate reconcile idempotent).
- [ ] Row-count/checksum sanity passes; mismatch alerts.
- [ ] Scratch environment isolated (no prod-data leak).

**Estimated complexity.** M. **Dependencies.** Phases 1–2.

**Exit criteria.** Automated weekly restore verification passing with sanity checks and mismatch alerting.

---

## Phase 5 — DR runbook + (optional) admin backup dashboard

**Objective.** A documented, rehearsed restore procedure + optional in-app visibility.

**Scope.** Runbook (docs) + optional admin dashboard/endpoints.

**Files/modules affected.** New DR runbook under `docs/`; **optional** admin surface: `GET /api/admin/backups` (status/history), `POST /api/admin/backups/run` (manual trigger, via Topic-07 queue), gated by `BACKUP_ADMIN`; frontend backup-status dashboard.

**Database changes.** None (reuses optional `backup_run`).

**Backend changes.** Optional admin endpoints (only if app-orchestrated); manual trigger rate-limited (Topic 03) + audited (Topic 04).

**Frontend changes.** Optional backup-status dashboard (last backup time, success/failure, verification status).

**API changes.** Optional `admin/backups` endpoints.

**Risks.** An unrehearsed runbook failing under real DR pressure. Mitigation: dry-run the runbook end-to-end (restore DB → point uploads → boot → Flyway/Hibernate reconcile → smoke test) with per-tier RTO/RPO targets.

**Testing checklist.**
- [ ] Runbook dry-run completes within the tier's RTO.
- [ ] Restore → files → boot → reconcile → smoke test all pass.
- [ ] (If built) admin dashboard shows accurate status; manual trigger `BACKUP_ADMIN`-gated, rate-limited, audited.

**Estimated complexity.** M. **Dependencies.** Phases 1–4.

**Exit criteria.** Rehearsed DR runbook with per-tier RTO/RPO; optional dashboard live + secured.

---

## Phase 6 — PITR (WAL archiving / pgBackRest) for lower-RPO tiers

**Objective.** Reduce RPO from ~24h to minutes for Business/Critical tiers.

**Scope.** Ops (WAL archiving + base backups / pgBackRest).

**Files/modules affected.** None in-repo (Postgres/ops config).

**Database changes.** None to schema (WAL archive config + base backups).

**Backend/Frontend/API changes.** None.

**Risks.** WAL storage growth / archive misconfiguration. Mitigation: pgBackRest/Barman manage incrementals + retention + verification; monitor WAL archive location.

**Testing checklist.**
- [ ] Point-in-time restore to an arbitrary timestamp succeeds on a scratch instance.
- [ ] RPO meets the tier target (minutes).
- [ ] WAL archive retained + monitored.

**Estimated complexity.** L. **Dependencies.** Phases 1–4; §16.2 tiers.

**Exit criteria.** PITR validated for lower-RPO tiers; minute-level RPO demonstrated.

---

## Phase 7 — (Optional) `StorageService` abstraction → object storage

**Objective.** Decouple `uploads/` from the app server; move to versioned, durable object storage. The one substantial app-code phase.

**Scope.** Storage abstraction + migration.

**Files/modules affected.** New `StorageService` (local ↔ S3/MinIO/Azure) that `FileUploadUtil` writes through; callers unchanged; migration of existing `uploads/` to the bucket; optional file-key metadata.

**Database changes.** Optional file-key metadata (additive, guarded).

**Backend changes.** `FileUploadUtil` routes through `StorageService`; `/uploads/**` serving reads through it. Versioning/lifecycle via the bucket.

**Frontend changes.** None (URLs still resolve). **API changes.** None (transparent).

**Risks.** Breaking existing `/uploads/**` URLs / logo/stamp paths. Mitigation: keep URL shape stable; dual-read (local + bucket) during migration; verify logo/stamp/document rendering across print flows.

**Testing checklist.**
- [ ] New uploads land in object storage; existing URLs still resolve.
- [ ] Logo/stamp/document rendering unaffected (print flows).
- [ ] Bucket versioning/lifecycle configured.
- [ ] `mvn -o test` green; app boots with `StorageService`.

**Estimated complexity.** L. **Dependencies.** Phase 0 (§16.3 decision). **Optional** — only if object storage is accepted.

**Exit criteria.** Uploads served from versioned object storage with no broken URLs; local disk no longer the SPOF.

---

## Phase 8 — (Premium) Postgres hot standby / HA

**Objective.** Near-zero RPO + fast failover for Critical-tier tenants.

**Scope.** Ops (streaming replication + failover).

**Files/modules affected.** None in-repo (Postgres/infra).

**Database changes.** None to schema (replication config).

**Backend/Frontend/API changes.** None (app points at the primary; failover promotes standby).

**Risks.** Failover complexity / split-brain. Mitigation: managed failover tooling; documented promotion procedure; multi-AZ if cloud.

**Testing checklist.**
- [ ] Standby stays in sync with primary.
- [ ] Failover promotes standby within the Critical-tier RTO (<30m).
- [ ] App reconnects to the promoted primary.

**Estimated complexity.** L. **Dependencies.** Phase 6; §16.7 (HA needed). **Premium** — only for tenants requiring it.

**Exit criteria.** Hot standby with rehearsed failover meeting Critical-tier RTO/RPO.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §16) | Needed by | Recommended default |
|---|---|---|
| §16.1 Hosting per tenant (cloud managed vs. on-prem) | Phase 0/1/6 | Self-managed `pg_dump`+PITR; managed backups where cloud |
| §16.2 RTO/RPO per tier | Phase 0/6/8 | Standard 24h/4–8h; Business 1h/1–2h; Critical ~0/<30m |
| §16.3 `uploads/` → object storage acceptable | Phase 7 | Yes long-term; keep local + backup near-term |
| §16.4 Retention/compliance window | Phase 0/1 | Per jurisdiction (VAT/tax); default generous |
| §16.5 App-orchestrated vs. pure ops/cron | Phase 3/5 | Pure ops first; app-orchestrated optional |
| §16.6 Offsite target + key custody | Phase 0/1/2 | Encrypted offsite; keys held separately |
| §16.7 HA required now? | Phase 8 | Only for Critical-tier tenants |

---

## Cross-cutting testing strategy

- **Restore-is-the-test** — no backup is "done" until an automated restore of it succeeds (Phase 4). This is the single most important guard; a green backup job that never restores is a false comfort.
- **Blobs-included** — every restore verification confirms print-template LOBs/OIDs are present (a `--blobs` regression would silently lose templates).
- **DB/file alignment** — a restored DB + restored `uploads/` have no dangling references (skew check).
- **Boot-after-restore** — a restored DB boots cleanly (Flyway/Hibernate reconcile idempotent) — proves the restore is usable, not just present.
- **Encryption + isolation** — backups are encrypted at rest/in transit; restore drills run in isolated/scrubbed environments (no prod-data leak).
- **RTO/RPO conformance** — each tier's restore meets its documented targets, re-verified when PITR/HA land.
- Application-touching phases (5 admin surface, 7): run `mvn -o test`; `npm run build` + `npm run lint` for any UI.
