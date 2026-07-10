# Background Jobs & Queue System — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`07-background-jobs-queue-system.md`](07-background-jobs-queue-system.md) (generalize the proven in-house patterns — `ProductImportService` executor + `PosPrintJob` persistent queue — into one **DB-backed `background_jobs` table + bounded `ThreadPoolTaskExecutor`** framework with retry, progress polling, recovery, and results cleanup; no new infrastructure). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable**; `jobs.enabled=false` restores today's synchronous behaviour, and every migrated op keeps a **sync fallback** for small/fast cases.
> - **Jobs are DB-backed and durable** — nothing lives only in memory (the current `ProductImportService` weakness); jobs survive restart.
> - **Bounded pools, separate by workload** — CPU-heavy (PDF/POI) vs. IO (email) never starve each other; mass-enqueue can't exhaust resources (ties to Topic 03).
> - Handlers are **idempotent** and run in the **correct tenant datasource context** (per-profile) even on async threads.
> - Schema changes are **additive, Flyway-guarded**; no existing table altered.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| `@EnableScheduling` + `@EnableAsync` on `BillbullBackendApplication` | ✅ (per design §1) | Reuse; no infra change. |
| `ProductImportService` = single-thread executor + in-memory `ImportJobStatus` (polled) | ✅ (per design §1) | The template to generalize; currently non-durable. |
| `PosPrintJob` = persistent job/queue spine (status/priority/type enums, timeout sweep) | ✅ (CLAUDE.md + memory) | The durable-queue template. |
| Heavy sync ops: POI Excel, Playwright PDF (`HtmlPdfService`), email (`DocumentEmailSender`), reports | ✅ (per design §1) | Offload targets. |
| No Redis/Quartz/broker/Spring Batch | ✅ (per design §1) | Stay in-JVM + DB. |
| Next Flyway version | ⚠️ | Docs say "V30"; tree at **V33** → new migration **V34**. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Library vs. hand-roll decision + always-async list | No | n/a | S |
| 1 | Schema + `JobQueueService`/`JobHandler`/dispatcher (dormant) | No (toggle off) | Yes | M |
| 2 | Generalize `ProductImportService` onto the framework | Yes (behind toggle) | Yes | M |
| 3 | Migrate Excel export → queue (first heavy op) | Yes (behind toggle) | Yes | M |
| 4 | Migrate PDF (pooled Playwright), report, email handlers | Yes (behind toggle) | Yes | L |
| 5 | Retry/backoff + recovery sweep + results cleanup | Yes | Config | M |
| 6 | Generic Jobs/Tasks frontend panel | Yes | Follows | M |
| 7 | Per-tenant enable | Yes (opt-in) | Flip | S |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Library vs. hand-roll decision + always-async list

**Objective.** Decide JobRunr vs. hand-rolled, which ops stay synchronous, and where result files live. No code.

**Scope.** Written decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Choosing a library that complicates per-tenant datasource wiring. Mitigation: default to hand-rolled on existing patterns (design recommendation); JobRunr only if a turnkey dashboard is strongly wanted.

**Testing checklist.**
- [ ] JobRunr vs. hand-roll decided (§17.1) — default hand-roll.
- [ ] Ops that must stay synchronous (small receipts/PDFs) listed (§17.4).
- [ ] Result-file location + retention decided (§17.3, ties Topic 12).
- [ ] Completion-notify channel (in-app vs. email) decided (§17.5, ties Topic 09).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §17.1/§17.3/§17.4/§17.5.

---

## Phase 1 — Schema + `JobQueueService`/`JobHandler`/dispatcher (dormant)

**Objective.** Land the durable job spine + framework, all inert until `jobs.enabled`.

**Scope.** `background_jobs` table + core framework.

**Files/modules affected.**
- `.../db/migration/V34__background_jobs.sql` (new).
- New `BackgroundJob` entity; `JobQueueService` (`enqueue`), `JobHandler` interface, dispatcher (`@Scheduled` poll or `@Async` submit), bounded `ThreadPoolTaskExecutor` beans (CPU + IO pools).
- `application.properties` — `jobs.enabled=false`, `jobs.pool.cpu`, `jobs.pool.io`, `jobs.retry.max-attempts`, backoff, `jobs.result.retention-hours`, dispatcher poll interval.

**Database changes.** `background_jobs` (id, type, status, priority, payload_json, progress_percent, result_ref, error, attempts, max_attempts, next_run_at, branch_id, created_by, timestamps) + indexes `(status, priority, next_run_at)`, `(type, status)`, `(created_by)` — additive, guarded. Mirrors `PosPrintJob`'s proven shape.

**Backend changes.** Framework only; no op migrated. Dispatcher picks QUEUED by priority and runs handlers on bounded pools. Ensure tenant datasource context propagates to async threads.

**Frontend/API changes.** None.

**Risks.** Async threads losing tenant datasource context. Mitigation: propagate the datasource/tenant context into pool threads; unit-test a handler writes to the correct DB.

**Testing checklist.**
- [ ] Migration idempotent; table + indexes created.
- [ ] `enqueue` persists QUEUED; dispatcher runs a no-op handler on the bounded pool.
- [ ] Tenant datasource context correct on async thread.
- [ ] Toggle off → dispatcher inert, no jobs run.
- [ ] `mvn -o test` green.

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** Durable queue + framework merged, dormant with toggle off, datasource-context-safe.

---

## Phase 2 — Generalize `ProductImportService` onto the framework

**Objective.** Make import durable (survives restart) on the new framework — the natural first migration since it already has the polling UX.

**Scope.** Import service + generic status endpoint.

**Files/modules affected.** `ProductImportService` (enqueue a `BackgroundJob` instead of in-memory registry; `ImportJobHandler` implements `JobHandler`); generic `GET /api/jobs/{id}` status.

**Database changes.** None (uses `background_jobs`).

**Backend changes.** Import runs as a durable job with `progress_percent` updates; errors recorded on the job. Keep the existing polling contract (frontend polls the generic status endpoint). Sync path retained for tiny imports if desired.

**Frontend changes.** Point import-progress polling at the generic endpoint (Phase 6 generalizes the panel). **API changes.** Generic job status endpoint (import UI adopts it).

**Risks.** Regressing the working import UX. Mitigation: preserve the status shape the frontend expects; toggle-gated; validate a full import end-to-end.

**Testing checklist.**
- [ ] Import runs as a durable job; progress updates persist.
- [ ] Import survives an app restart mid-run (resumable/idempotent or safely restartable).
- [ ] Existing import-progress UX still works.
- [ ] Toggle off → legacy in-memory path.

**Estimated complexity.** M. **Dependencies.** Phase 1.

**Exit criteria.** Import is durable on the framework with unchanged UX; restart-safe.

---

## Phase 3 — Migrate Excel export → queue (first heavy op)

**Objective.** Offload the first heavy synchronous op; validate the enqueue→run→result-download→notify loop end-to-end.

**Scope.** Excel export → job.

**Files/modules affected.** Excel export services (POI) → `ExcelExportHandler`; enqueue endpoint + result download.

**Database changes.** None.

**Backend changes.** Large exports enqueue a job; handler writes the file to the results store; `result_ref` + signed download link. Small exports keep the sync path. Completion notification (Topic 09).

**Frontend changes.** "Export" for large datasets switches to "queued → notify/download when ready" (Phase 6 panel). **API changes.** `POST /api/jobs/{type}` (enqueue), `GET /api/jobs/{id}/result` (download).

**Risks.** Result files leaking / never cleaned. Mitigation: access-controlled, expiring result store (Phase 5 cleanup; ties Topic 12 storage); owner-only download (Topic 02).

**Testing checklist.**
- [ ] Large Excel export runs as a job; file downloadable by owner only.
- [ ] Small export still sync.
- [ ] Completion notification fires.
- [ ] Toggle off → sync export.

**Estimated complexity.** M. **Dependencies.** Phase 1; Topic 09 (notify), Topic 12 (result store).

**Exit criteria.** Excel export offloaded end-to-end with secure, downloadable results and completion notify.

---

## Phase 4 — Migrate PDF (pooled Playwright), report, email handlers

**Objective.** Offload the remaining heavy ops onto the framework.

**Scope.** PDF/report/email handlers.

**Files/modules affected.** `HtmlPdfService` (warm/pooled Playwright — shared with Topic 06 Phase 9) → `PdfJobHandler`; report generation → `ReportJobHandler`; `DocumentEmailSender`/`QuotationEmailService` → `EmailJobHandler` (IO pool).

**Database changes.** None.

**Backend changes.** Each heavy op enqueues; CPU pool for PDF/report, IO pool for email. Warm Playwright pool. Sync fast path for small receipts/PDFs (§17.4).

**Frontend changes.** Same queued-UX (Phase 6). **API changes.** Enqueue endpoints per type.

**Risks.** Resource contention / browser-pool leaks. Mitigation: separate bounded pools; recycle Playwright contexts; monitor (Topic 06).

**Testing checklist.**
- [ ] PDF/report/email each run as jobs on the correct pool.
- [ ] Small/fast ops stay sync.
- [ ] Email retries on transient failure (Phase 5).
- [ ] Pools bounded; no starvation across workloads.
- [ ] Toggle off → sync paths.

**Estimated complexity.** L. **Dependencies.** Phase 1; Topic 06 Phase 9 (Playwright pool).

**Exit criteria.** PDF/report/email offloaded on bounded pools; sync fast paths intact; no cross-workload starvation.

---

## Phase 5 — Retry/backoff + recovery sweep + results cleanup

**Objective.** Make the framework robust: retry transient failures, reclaim stuck jobs, clean up result files.

**Scope.** Retry logic + two scheduled sweeps.

**Files/modules affected.** `JobQueueService` (retry/backoff); recovery `@Scheduled` sweep (mirroring `PosPrintJobTimeoutSweepJob`); results-cleanup `@Scheduled` job.

**Database changes.** None.

**Backend changes.** Transient failure → `attempts++`, `next_run_at = now + backoff`; permanent failure → FAILED (no requeue) + notify. Recovery sweep reclaims stuck RUNNING jobs after timeout. Cleanup deletes result files past `jobs.result.retention-hours`.

**Frontend changes.** None. **API changes.** `POST /api/jobs/{id}/cancel`.

**Risks.** Infinite retry on a permanent failure; distinguishing transient vs. permanent. Mitigation: `max_attempts` cap; classify failures (network/IO = transient, bad-data = permanent).

**Testing checklist.**
- [ ] Transient failure retries with backoff up to `max_attempts`.
- [ ] Permanent failure → FAILED, no requeue, notify.
- [ ] Stuck RUNNING job reclaimed by recovery sweep.
- [ ] Result files deleted past retention.
- [ ] Cancel transitions a QUEUED/RUNNING job to CANCELLED.

**Estimated complexity.** M. **Dependencies.** Phases 1–4.

**Exit criteria.** Retry/recovery/cleanup all validated; no stuck jobs, no orphaned result files, no infinite retry.

---

## Phase 6 — Generic Jobs/Tasks frontend panel

**Objective.** One panel for a user's jobs (status/progress/download), generalizing the import-progress UX.

**Scope.** Jobs panel + queued-UX for heavy buttons.

**Files/modules affected.** New Jobs/Tasks panel (list of user's jobs, status/progress/download, completion toast); "Export/Print" buttons for large ops switch to "queued → notify when ready".

**Database/Backend changes.** None (consumes `GET /api/jobs`, `/api/jobs/{id}`, `/result`). **API changes.** None new.

**Frontend changes.** Panel + queued UX.

**Risks.** Users not noticing a completed job. Mitigation: completion toast/notification (Topic 09); persistent panel badge.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green.
- [ ] Panel lists the user's jobs with live progress.
- [ ] Download available on completion; owner-only.
- [ ] Completion notification surfaces.

**Estimated complexity.** M. **Dependencies.** Phases 2–5.

**Exit criteria.** Users track and download their jobs from one panel; heavy ops feel non-blocking.

---

## Phase 7 — Per-tenant enable

**Objective.** Turn on `jobs.enabled` per tenant; validate durability + resource behaviour.

**Scope.** Config + validation.

**Files/modules affected.** Per-tenant `application-<client>.properties` — `jobs.enabled=true` + pool sizes.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Pool sizing wrong for the tenant's hardware. Mitigation: conservative pool defaults; monitor (Topic 06); tune per tenant.

**Testing checklist (before/after flip).**
- [ ] Heavy ops run as jobs; sync fast paths intact.
- [ ] Jobs survive restart.
- [ ] No resource exhaustion under concurrent enqueue.
- [ ] Rollback (toggle off) → all-sync behaviour.

**Estimated complexity.** S. **Dependencies.** Phases 1–6.

**Exit criteria.** Pilot tenant validated; durability + resource limits confirmed; rollout runbook written.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §17) | Needed by | Recommended default |
|---|---|---|
| §17.1 JobRunr vs. hand-roll | Phase 0/1 | Hand-roll on existing patterns |
| §17.3 Result-file location + retention | Phase 3/5 | Temp/results store + `jobs.result.retention-hours` (ties Topic 12) |
| §17.4 Which ops stay synchronous | Phase 4 | Small receipts/PDFs stay sync |
| §17.5 Completion notify channel | Phase 3/6 | In-app first (Topic 09); email optional |
| §17.2 Multi-instance tenants? | (only if scaled) | Single-instance → in-JVM; Redis/distributed deferred |

---

## Cross-cutting testing strategy

- **Toggle-off = all-sync invariance** — with `jobs.enabled=false`, every migrated op runs synchronously exactly as today. Proven at every migration phase.
- **Durability test** — a job survives an app restart mid-run (the core improvement over the in-memory status registry). Standing test.
- **Tenant-context test** — an async handler writes to the correct tenant datasource (never cross-tenant).
- **Pool-isolation test** — saturating the CPU pool (PDF/POI) does not block IO-pool (email) jobs, and vice versa.
- **Result-access test** — job results are downloadable only by the owner/authorized roles (ties Topic 02), and expire per retention.
- **Retry-classification test** — transient failures retry with backoff; permanent failures don't; `max_attempts` caps.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 6.
