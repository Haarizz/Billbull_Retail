# Topic — Background Jobs & Queue System

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: identify operations to move off the request thread into background jobs, compare technologies, and design queue/retry/monitoring.

---

## 1. Current system behavior / existing analysis

- **Spring scheduling + async already enabled:** `@EnableScheduling` + `@EnableAsync` on `BillbullBackendApplication`.
- **Existing scheduled jobs** (`@Scheduled`): `AuditLogRetentionJob` (nightly 03:30), `GlBalanceRebuildJob`, `PosDeviceHealthSweepJob`, `PosPrintJobTimeoutSweepJob`, `PosSessionScheduler`, `PosTerminalScheduler`, notification cleanup, quotation expiry.
- **Existing async work:** `AuditLogWriter` (`@Async`).
- **Existing in-process job pattern with progress tracking:** `ProductImportService` uses a **dedicated `ExecutorService` (single-thread)** + an in-memory `ImportJobStatus` registry (`jobId`, `status` QUEUED/…, `totalRows`, `processedRows`, counts, `errors` `CopyOnWriteArrayList`) — the frontend polls status. **This is the template to generalize.**
- **`PosPrintJob`** is effectively a persisted job/queue spine (status/priority/type/payload enums, timeout sweep recovers stuck DISPATCHED → FAILED).
- **Synchronous heavy operations on request threads today:** Excel export (POI), PDF generation (Playwright, `HtmlPdfService` — launches a browser), receipt/document generation, email sending (`spring-boot-starter-mail`, `DocumentEmailSender`, `QuotationEmailService`), notification processing, report generation.
- **No Redis, no Quartz, no external broker (RabbitMQ/Kafka), no Spring Batch.** Everything is in-JVM.

## 2. Missing functionality

- No **general, persistent job queue** — `ProductImportService`'s pattern is in-memory only (lost on restart, single-node).
- No **retry/backoff** framework (except `PosPrintJob`'s manual timeout sweep, which never auto-requeues).
- No **unified job monitoring/progress** across job types.
- Heavy synchronous operations (PDF/Excel/email/reports) block request threads and risk timeouts under load.

## 3. Operations that should move to background

| Operation | Current | Priority to offload |
|---|---|---|
| Excel export (POI) | Sync | High (large datasets) |
| PDF generation (Playwright) | Sync, launches browser | High (slow, resource-heavy) |
| Receipt generation | Mostly client/agent | Medium |
| Email sending | Sync-ish | High (network latency) |
| Notification processing | Partly sync | Medium |
| Import processing | Async in-memory | Make persistent |
| Inventory recalculation | On demand | Medium (batch) |
| Stock synchronization | — | Medium |
| Report generation | Sync | High |
| Scheduled tasks | `@Scheduled` | Already background |
| Cleanup jobs | `@Scheduled` | Already background |
| Backup jobs | External/none | See Topic 09 |
| Audit cleanup | `@Scheduled` retention | Already background |

## 4. Challenges and edge cases

1. **Single-instance-per-tenant** deployment → an in-JVM queue is viable; a broker adds ops overhead. But in-memory queues lose jobs on restart.
2. **Persistence for durability** — long jobs (big imports/exports) must survive restarts and be resumable/idempotent.
3. **Progress reporting** — frontend already polls `ImportJobStatus`; generalize to any job.
4. **Resource contention** — Playwright/POI are memory-heavy; concurrency must be bounded (dedicated bounded pools).
5. **Result delivery** — exports/PDFs produce files; need a temp store + download link + expiry (ties to file storage in Topic 09).
6. **Failure/retry** — transient (email/network) vs. permanent (bad data) failures need different handling.
7. **Multi-tenant isolation** — jobs must run in the correct tenant DB context (per-profile datasource).
8. **Ordering/priority** — `PosPrintJob` already models priority; generalize.

## 5. Possible technologies (comparison)

| Option | Fit | Pros | Cons |
|---|---|---|---|
| **Spring `@Async` + `ThreadPoolTaskExecutor` + DB-backed job table (RECOMMENDED)** | Very high | No new infra; matches existing patterns (`PosPrintJob`, `ProductImportService`); durable via DB; per-tenant naturally | Single-node; no cross-instance distribution |
| **Spring Scheduling (`@Scheduled`)** | High (already used) | Native, simple for periodic jobs | Not a queue; no ad-hoc enqueue |
| **Quartz Scheduler** | Medium | Persistent scheduling, clustering, cron | Heavier; overkill if single-node |
| **Spring Batch** | Medium | Chunked, restartable batch (great for imports/recalc) | Verbose; best for large ETL specifically |
| **Redis + a queue lib (e.g. Redisson/JobRunr)** | Medium | Distributed, retries, dashboard (JobRunr has UI) | New infra (Redis); multi-tenant keyspacing |
| **RabbitMQ/Kafka** | Low | True distributed messaging | Major infra; unjustified at current scale |
| **JobRunr (DB-backed, built-in dashboard)** | High (if a library is acceptable) | Persistent, retries, scheduling, monitoring UI, works with existing DB | New dependency; per-tenant DB wiring |

**Recommendation:** **DB-backed job table + bounded `ThreadPoolTaskExecutor`**, generalizing the `ProductImportService`/`PosPrintJob` patterns. Consider **JobRunr** if a ready-made persistent queue + dashboard + retry is preferred without hand-rolling. Avoid brokers (RabbitMQ/Kafka) — unjustified for single-instance-per-tenant.

## 6. Recommended architecture

- **`BackgroundJob` entity/table**: `id`, `type` (EXPORT/PDF/EMAIL/IMPORT/REPORT/RECALC…), `status` (QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED), `priority`, `payloadJson`, `progressPercent`, `resultRef` (file path/id), `error`, `attempts`, `maxAttempts`, `nextRunAt`, `branchId`, `createdBy`, timestamps. (Mirrors `PosPrintJob`'s proven shape.)
- **`JobQueueService`**: `enqueue(type, payload)` → persists QUEUED; a poller/`@Scheduled` dispatcher (or `@Async` submit) picks up jobs by priority and runs handlers on a **bounded executor** (separate pools for CPU-heavy PDF/POI vs. IO email).
- **Handlers** per type implement `JobHandler` with idempotent `run(job, progressCallback)`.
- **Retry**: on transient failure, increment `attempts`, set `nextRunAt = now + backoff`; permanent failure → FAILED (no requeue), notify (Topic 06 Notification).
- **Progress**: handlers update `progressPercent`; frontend polls `GET /api/jobs/{id}` (generalizing today's import-status polling).
- **Results**: files written to a temp/results store with a signed download link + retention cleanup job.
- **Recovery sweep**: like `PosPrintJobTimeoutSweepJob`, reclaim stuck RUNNING jobs after a timeout.

## 7. Database / schema impact (design only)

- New `background_jobs` table + indexes `(status, priority, next_run_at)`, `(type, status)`, `(created_by)`. Additive; Flyway-guarded. No changes to existing tables.

## 8. Backend changes

- Add `JobQueueService`, `JobHandler` interface, per-type handlers, dispatcher (`@Scheduled` poll or executor submit), bounded `ThreadPoolTaskExecutor` beans (sized per workload).
- Refactor `HtmlPdfService`, Excel export services, `DocumentEmailSender`, report services, `ProductImportService`, inventory recalcs to **enqueue** rather than run inline (keep a sync fallback for small/fast cases).
- Warm/pooled Playwright for PDF handler.
- Recovery + results-cleanup scheduled jobs.

## 9. Frontend changes

- Generic **Jobs/Tasks panel**: list of the user's jobs with status/progress/download; reuse the existing import-progress UX. Toasts/notifications on completion. "Export/Print" buttons switch to "queued → notify when ready" for large operations.

## 10. API changes

- `POST /api/jobs/{type}` (enqueue), `GET /api/jobs/{id}` (status/progress), `GET /api/jobs` (my jobs), `GET /api/jobs/{id}/result` (download), `POST /api/jobs/{id}/cancel`. Existing sync export/PDF endpoints kept for small payloads.

## 11. Security considerations

- Jobs run under the enqueuing user's identity/branch; results downloadable only by owner/authorized roles (ties to Topic 02 ownership).
- Payloads must not embed secrets; result files access-controlled + expiring.
- Bound concurrency to prevent resource-exhaustion DoS via mass enqueue (ties to Topic 03 rate limiting).

## 12. Performance considerations

- Separate bounded pools (CPU: PDF/POI; IO: email) prevent one workload starving others.
- Offloading heavy work frees request threads → better API latency/throughput.
- Idempotent, chunked handlers for large imports/recalcs (Spring Batch optional here).

## 13. Configuration requirements

- `jobs.enabled`, pool sizes (`jobs.pool.cpu`, `jobs.pool.io`), `jobs.retry.max-attempts`, backoff, `jobs.result.retention-hours`, dispatcher poll interval. Toggle convention as existing.

## 14. Migration strategy

1. Add `background_jobs` table + `JobQueueService`/handlers behind `jobs.enabled=false`. 2. Migrate one op (Excel export) to the queue; validate. 3. Migrate PDF/report/email/import. 4. Add recovery + cleanup sweeps. 5. Enable per tenant. Sync paths remain as fallback → reversible.

## 15. Risks and dependencies

- Risk: in-memory-only would lose jobs on restart → use DB-backed persistence.
- Risk: resource exhaustion from heavy handlers → bounded pools + concurrency caps.
- Risk: multi-tenant datasource context in async threads → ensure tenant/datasource propagation.
- Dependency: file/results storage + cleanup (Topic 09), Notification framework (exists).

## 16. Step-by-step implementation plan

1. Create `background_jobs` table + indexes (Flyway, guarded).
2. Build `JobQueueService`, `JobHandler`, dispatcher, bounded executors.
3. Generalize `ProductImportService` onto the framework; add generic status endpoint + UI panel.
4. Migrate Excel export → queue (first heavy op); validate end-to-end.
5. Migrate PDF (pooled Playwright), report, email handlers.
6. Add retry/backoff, recovery sweep, results cleanup, completion notifications.
7. Enable per tenant behind `jobs.enabled`.

## 17. Open questions

1. Accept a library (JobRunr) for a ready-made persistent queue + dashboard, or hand-roll on the existing patterns?
2. Any tenant multi-instance (would push toward Redis/distributed)?
3. Where do result files live and for how long (ties to Topic 09 storage)?
4. Which operations must stay synchronous (small receipts/PDFs) vs. always-async?
5. Notify on completion via in-app only, or email too (Topic 06)?

## 18. Recommendation

Generalize the **already-proven in-house patterns** (`ProductImportService` executor + `PosPrintJob` persistent queue) into a single **DB-backed `background_jobs` table + bounded `ThreadPoolTaskExecutor`** framework with retry, progress polling, recovery, and results cleanup — no new infrastructure required and a perfect fit for the single-instance-per-tenant deployment. Offload Excel/PDF/report/email/import first. Consider **JobRunr** only if a turnkey persistent queue with a monitoring dashboard is preferred over hand-rolling. Defer brokers (RabbitMQ/Kafka) until horizontal scale is real.
