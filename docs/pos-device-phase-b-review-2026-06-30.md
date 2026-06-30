# POS Device Manager — Phase B Review Report

Date: 2026-06-30
Scope: Phase B only ("Print Job spine" — [pos-device-architecture-specification-v2-2026-06-30.md](pos-device-architecture-specification-v2-2026-06-30.md) §7/§9/§14/§16). Builds on the completed and approved [Phase A](pos-device-phase-a-review-2026-06-30.md). Phase C has not started.

---

## 1. Files Added

| File | Purpose | Why introduced |
|---|---|---|
| `billbull-backend/src/main/resources/db/migration/V23__pos_print_jobs.sql` | Creates `pos_print_jobs` with all v2-spec columns (job type, priority, payload, attempt tracking, scheduling) + two indexes. | The schema foundation for Phase B — without it nothing else in this phase has anywhere to write. |
| `pos/printjob/PrintJobType.java` | Enum `RECEIPT, KITCHEN, LABEL, BACKGROUND, SCHEDULED`. | Identifies what kind of print a job represents (Phase B only ever creates `RECEIPT`; the rest are modeled now so the column/enum doesn't need a later migration). |
| `pos/printjob/PrintJobPriority.java` | Enum `HIGH, NORMAL, LOW`. | Drives the agent-poll ordering (`ORDER BY priority ASC` — declaration order puts `HIGH` first). |
| `pos/printjob/PrintJobStatus.java` | Enum `QUEUED, DISPATCHED, SUCCEEDED, FAILED, CANCELLED`. | The job lifecycle state machine — see §5. |
| `pos/printjob/PrintPayloadFormat.java` | Enum `ESC_POS_TEXT, ZPL, RAW_HTML`. | Lets a job's payload be self-describing without the consumer needing to infer format from job type. |
| `pos/printjob/PosPrintJob.java` | The entity itself, `extends BaseEntity` per repo convention. | One row per print attempt — the thing that didn't exist before Phase B: a server-side record of every print request. |
| `pos/printjob/PosPrintJobRepository.java` | Three finder methods for the QUEUED-by-scope queries the service and agent-poll endpoint need. | Keeps query logic declarative and out of the service. |
| `pos/printjob/PosPrintJobService.java` | `enqueue / get / listQueued / dispatch / reportResult / retry`. | The actual state-machine owner — see §3 of the original Phase B implementation and §5/§6 below. |
| `pos/printjob/PosPrintJobController.java` | REST surface for all of the above. | The API contract the browser (and, eventually, the real Local Device Agent) calls against. |
| `billbull-backend/src/test/.../pos/printjob/PosPrintJobServiceTest.java` | 8 unit tests covering enqueue validation, dispatch claim rules, success/failure/retry transitions, and manual retry. | Test coverage for the new state machine — see §9. |
| `billbull-frontend/src/api/posPrintJobApi.js` | Thin axios wrappers: `createPrintJob, getPrintJob, dispatchPrintJob, reportPrintJobResult, retryPrintJob`. | One file per backend feature, per this repo's `src/api/` convention — mirrors `posPrinterApi.js`. |

No new frontend pages, components, or routes were added — Phase B is API + one existing-file refactor on the frontend, by design (no UI change yet).

---

## 2. Files Modified

| File | Exact change | Breaking? |
|---|---|---|
| `billbull-frontend/src/utils/localPrintAgent.js` | `sendReceiptToConfiguredPrinter` now (a) creates a `pos_print_jobs` row, (b) dispatches it, (c) performs the **same** direct `printReceiptThroughAgent` call as before, then (d) reports success/failure back to that job — all job-tracking calls wrapped in a `trackPrintJobSafely` helper that swallows errors. Function signature gained two new optional destructured params (`sourceType`, `sourceRefId`), defaulting to `undefined`/`null`. See full diff and behavioral analysis in §7. | **No** — see §7's explicit confirmation. |

No other existing file (backend or frontend) was touched in Phase B. (Phase A's modifications to `PosDevice`, `PosDeviceStatus`, `PosPrinter`, `PosPrinterRepository`, `PosPrinterService` are unchanged in this phase and already reviewed/approved separately.)

---

## 3. Database Review

**`pos_print_jobs` schema** (from `V23__pos_print_jobs.sql`):
```
id, created_at, created_by, updated_at, updated_by, is_active   -- standard BaseEntity columns
job_type        VARCHAR(20)  NOT NULL                            -- RECEIPT|KITCHEN|LABEL|BACKGROUND|SCHEDULED
priority        VARCHAR(10)  NOT NULL DEFAULT 'NORMAL'            -- HIGH|NORMAL|LOW
printer_id      BIGINT       NOT NULL REFERENCES pos_printers(id)
branch_id       BIGINT
terminal_id     VARCHAR(80)
counter_name    VARCHAR(120)
source_type     VARCHAR(30)                                      -- e.g. SALES_INVOICE, MANUAL_TEST
source_ref_id   BIGINT
payload         TEXT         NOT NULL
payload_format  VARCHAR(20)  NOT NULL DEFAULT 'ESC_POS_TEXT'
status          VARCHAR(20)  NOT NULL DEFAULT 'QUEUED'
attempt_count   INT          NOT NULL DEFAULT 0
max_attempts    INT          NOT NULL DEFAULT 3
last_error      VARCHAR(500)
dispatched_at   TIMESTAMP
completed_at    TIMESTAMP
scheduled_for   TIMESTAMP                                         -- reserved for SCHEDULED job_type; unused by any code path yet
requested_by    VARCHAR(100)
```

**Indexes:** `idx_print_jobs_status_printer (status, printer_id)` — supports the dispatch-claim lookup and per-printer job history; `idx_print_jobs_branch_terminal (branch_id, terminal_id)` — supports the agent-poll query scoped to a terminal.

**Constraints:** one `NOT NULL` FK, `printer_id → pos_printers(id)` (no `ON DELETE` clause — a printer row can't currently be hard-deleted in this codebase, only decommissioned/soft-deleted via `isActive`, so this is safe as-is). No `UNIQUE` constraint and no `CHECK` constraint on any enum-backed column — consistent with this repo's established pattern of enforcing enum validity at the Java layer (`@Enumerated(EnumType.STRING)`) rather than via DB `CHECK`, which CLAUDE.md's "stale-schema upgrade hazard" memory explicitly warns against widening later.

**Retry fields:** `attempt_count` (starts at 0, incremented on every reported failure), `max_attempts` (per-job, defaults to 3, not currently configurable via the API — see §6), `last_error` (overwritten on every failure, cleared on success).

**Scheduling fields:** `scheduled_for` exists in the schema (per the v2 spec's `SCHEDULED` job type) but **is not yet read or acted on by any code** — `enqueue()` accepts and stores it, but `listQueued()` does not filter out jobs whose `scheduled_for` is in the future, and no scheduler defers dispatch until that time. This is a deliberately incomplete stub: the column exists so a future phase doesn't need another migration, but nothing in Phase B claims `SCHEDULED` jobs actually work yet. Flagged again in §10/§12.

**Migration safety:** `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` — idempotent, safe to re-run. The table is wholly new (no existing table altered), so there is zero risk to existing data; the only coupling to existing data is the `printer_id` FK, which only matters at insert time (enforced by Postgres, not by this migration script) and never on read.

**Note on whether this migration actually executes:** identical situation to Phase A's `V22` — this repo runs with `spring.flyway.enabled=false` by default (Phase A review §3), so in practice the `pos_print_jobs` table is created by Hibernate's `ddl-auto=update` reading the new `@Entity` mapping, not by Flyway running `V23` itself. This doesn't matter for `V23` specifically the way it mattered for `V22`: `V23` contains **no DML** (no backfill, nothing to "miss") — it's pure `CREATE TABLE`/`CREATE INDEX`, which `ddl-auto=update` reproduces faithfully from the entity annotations. There is no Phase-B equivalent of the Phase A backfill problem.

**Rollback strategy:** drop the table (`DROP TABLE pos_print_jobs`) and its two indexes — safe at any point in Phase B, since nothing outside this table references it (the FK direction is `pos_print_jobs → pos_printers`, not the reverse) and no other phase has built on it yet. As with `V22`, Flyway has no native "down" migration in this repo's pattern; a rollback would be a new forward migration, matching the convention every other migration here already follows.

---

## 4. API Review

| Endpoint | Request | Response | Security | Validation | Error handling |
|---|---|---|---|---|---|
| `POST /api/pos/print-jobs` | `CreateRequest{printerId, jobType, priority, sourceType, sourceRefId, payload, payloadFormat, scheduledFor}` | `201 Created` + the created `PosPrintJob` | `@PreAuthorize("isAuthenticated()")` | `printerId` required and must resolve to an active printer (`404` if not); `jobType` required (`400`); `payload` required/non-blank (`400`) | All validation failures throw `ResponseStatusException` with the matching HTTP status; no silent fallback |
| `GET /api/pos/print-jobs/{id}` | path `id` | the `PosPrintJob` | `isAuthenticated()` | none beyond existence | `404` if the job doesn't exist |
| `GET /api/pos/print-jobs?branchId=&terminalId=&status=` | query params, `status` defaults to `QUEUED` | `List<PosPrintJob>` | `isAuthenticated()` | `status` is rejected with `400` unless it's exactly `QUEUED` (case-insensitive) — Phase B deliberately doesn't support listing other statuses yet (see §1's note on the controller) | `400 Bad Request` for any other status value |
| `PUT /api/pos/print-jobs/{id}/dispatch` | path `id`, no body | the updated `PosPrintJob` (status `DISPATCHED`) | `isAuthenticated()` | job must currently be `QUEUED` | `409 Conflict` if not `QUEUED` (e.g. already dispatched, or completed) |
| `PUT /api/pos/print-jobs/{id}/result` | `ResultRequest{success, errorMessage}` | the updated `PosPrintJob` | `isAuthenticated()` | none on the request shape itself (a `false` success with `null` errorMessage is accepted — logged as a failure with no message rather than rejected) | No explicit error path beyond `404` if the job doesn't exist; this endpoint cannot be called on a job in any particular prior state — see §5 for why that's intentionally permissive |
| `POST /api/pos/print-jobs/{id}/retry` | path `id`, no body | the updated `PosPrintJob` (status `QUEUED`, `attemptCount` reset to 0) | `isAuthenticated()` | job must currently be `FAILED` | `409 Conflict` otherwise |

**No existing endpoint's contract changed.** `PosPrinterController`, `PosDeviceController`, `DeviceManagerController` (all pre-existing or Phase A) are untouched by Phase B. The new `/api/pos/print-jobs/**` routes don't share a path prefix with any existing controller, so there's no route-collision question to investigate this time (unlike Phase A's `/api/pos/devices/dashboard` vs `/api/pos/devices/{id}`).

**Security note worth surfacing explicitly:** every Phase B endpoint is gated by the generic `isAuthenticated()` check, not a dedicated permission (e.g. there is no `POS_PRINT_JOB_MANAGEMENT` authority). This matches the precedent set by `PosPrinterController` itself (also just `isAuthenticated()`), so it's consistent with the existing module rather than a regression — but it does mean any authenticated user can call `dispatch`/`result`/`retry` on any job, including ones for a printer in another branch. This is flagged as a Risk in §10, not fixed in Phase B, because Phase A's printer endpoints have the identical property today and fixing it here alone would be inconsistent scope.

---

## 5. Print Job Lifecycle

**Implemented state machine** (the actual `PrintJobStatus` enum, not the example in the request — see the note below on where it differs):

```
        enqueue()
           │
           ▼
        QUEUED ──────────────────┐
           │  dispatch()         │  retry() [from FAILED only]
           ▼                     │
       DISPATCHED                │
           │                     │
   reportResult(success=true)    │
           │                     │
           ▼                     │
       SUCCEEDED  (terminal)     │
                                  │
   reportResult(success=false)   │
           │                     │
   attemptCount < maxAttempts? ──┤
       │ yes            │ no    │
       ▼                ▼       │
     QUEUED           FAILED ───┘
   (auto re-queued)   (terminal until
                        manual retry)
```

**Every transition, explained:**
- `QUEUED` is the entry state, set by `enqueue()`. Nothing reads `scheduled_for` yet (§3), so a `SCHEDULED` job sits in `QUEUED` exactly like any other job — it is *not* actually deferred.
- `QUEUED → DISPATCHED` happens only via `dispatch(id)`, and only if the job's current status is exactly `QUEUED` — anything else throws `409`. This is the "claim" step; in the architecture this is meant to be the point where an agent (or, today, the browser itself in the interim dual-path — §7) takes ownership of executing the print.
- `DISPATCHED → SUCCEEDED` via `reportResult(id, {success: true})`. Terminal state. `completedAt` is set, `lastError` cleared.
- `DISPATCHED → QUEUED` (the "retry" loop) via `reportResult(id, {success: false, ...})` **when** `attemptCount + 1 < maxAttempts`. `attemptCount` increments, `dispatchedAt` is cleared (so the job looks freshly queued again), `lastError` is set, and a `RETRY` event is logged.
- `DISPATCHED → FAILED` via the same `reportResult` call **when** the incremented `attemptCount` has reached `maxAttempts`. Terminal until a human intervenes. `completedAt` is set, a `PRINT_FAILED` event is logged.
- `FAILED → QUEUED` via `retry(id)` only — the manual path. Resets `attemptCount` to 0 (a deliberate choice: a human asking for a retry gets a fresh attempt budget, not a continuation of the exhausted one), clears `lastError`/`dispatchedAt`/`completedAt`, logs a `RETRY` event with detail `"Manual retry"`.
- `CANCELLED` exists in the enum but **no code path ever sets it.** It's reserved for a future "operator cancels a stuck job" action that Phase B doesn't build.

**Where this differs from the example diagram in the request, and why:**
- There is no separate `PRINTING` state between `DISPATCHED` and the outcome. The architecture's interim execution model (§7) performs the actual print synchronously within the same call that dispatches the job, so there is no observable window where a job is "printing" as a distinct, queryable state — by the time anything could poll for it, the result is already known. A true `PRINTING` state becomes meaningful once a real agent claims a job, prints asynchronously, and reports back later — tracked as a Phase C+ concern, not a Phase B gap.
- There is no separate `FAILED_PERMANENT` status — `FAILED` *is* the permanent state once `maxAttempts` is reached; `RETRY` is not a status at all, it's a logged event describing the `DISPATCHED → QUEUED` transition.

---

## 6. Retry Logic

- **Automatic retry:** triggered by `reportResult(id, {success: false})` whenever `attemptCount` (after incrementing) is still below `maxAttempts`. No backoff delay is implemented — a re-queued job is immediately eligible for `dispatch()` again. No exponential/linear backoff exists in Phase B.
- **Manual retry:** `POST /{id}/retry`, only legal from `FAILED`, resets the attempt budget to 0.
- **Maximum attempts:** `maxAttempts` defaults to 3, set once at job creation (`PosPrintJob` field default; not exposed as a `CreateRequest` parameter, so every job today gets exactly 3). Not configurable per printer or per job type yet.
- **Duplicate prevention — honest assessment, not just an assertion:** the architecture spec's intent (§7) was "a job moves `QUEUED → DISPATCHED` atomically (single UPDATE with a `WHERE status='QUEUED'` guard) so... no job is double-claimed." **What's actually implemented in `PosPrintJobService.dispatch()` is a read-then-check-then-write** (`findById` → check `status == QUEUED` in Java → `save`), not a single conditional `UPDATE` statement. Under genuine concurrent calls (two callers invoking `dispatch(id)` for the same job at the same instant), there is a narrow race window where both could read `QUEUED` before either writes `DISPATCHED`, resulting in both proceeding. **In Phase B's actual call pattern this risk is currently theoretical, not practical** — the only caller of `dispatch()` today is the browser's own synchronous `sendReceiptToConfiguredPrinter` flow, which calls `dispatch()` exactly once per print attempt from a single request; there is no second, independent caller (e.g. a real polling agent) yet that could race it. This is called out explicitly here and in §10/§12 because it must be closed (via `@Transactional` + a proper conditional update, or a DB-level optimistic lock on `PosPrintJob`) **before** Phase C/D introduces a real multi-consumer agent, not because it's exploitable today.
- **Timeout handling:** **not implemented.** A job that reaches `DISPATCHED` and then never receives a `reportResult` call (e.g. the browser tab closes mid-print, or — in a future real-agent world — the agent crashes after claiming a job) will sit in `DISPATCHED` forever; there is no sweep that detects a stale dispatch and reverts it to `QUEUED` or `FAILED`. The `QUEUE_TIMEOUT` event type exists in the Phase A `PosDeviceEventType` enum but nothing in Phase B ever fires it. Flagged in §10 as a risk and §12 as technical debt.

---

## 7. `localPrintAgent.js` Review

**Exactly what changed:** `sendReceiptToConfiguredPrinter` previously made one network call — directly to the local agent's `http://127.0.0.1:19777/print/receipt` via `printReceiptThroughAgent`. It now does that **same** call, unchanged, but wraps it with three additional, best-effort backend calls: create a `pos_print_jobs` row before printing, dispatch it, and report the outcome (success or failure) after the direct agent call resolves or throws. The two new optional parameters (`sourceType`, `sourceRefId`) are purely additive — the existing single call site in `POSSales.jsx` (`sendReceiptToConfiguredPrinter(printer, { receiptText: text, title })`) doesn't pass them and needed zero changes.

**Why the temporary dual-path architecture was chosen:** the Local Device Agent executable that actually talks to the physical printer lives **outside this repository** (confirmed in the original architecture research — it's a separately maintained workstation install). The "correct" end-state per the approved spec is the agent polling the backend for queued jobs and executing them itself, with the browser never calling `127.0.0.1:19777` at all. That end-state requires an agent release this repo cannot produce or ship. Cutting the browser's direct call today, before that agent update exists anywhere, would mean **no receipt prints at all** in any real deployment until every workstation's agent is separately upgraded — an unacceptable regression for a system in active production use. The dual path gets the actual deliverable value of Phase B (a server-side record of every print attempt, with retry tracking) immediately, without waiting on or coordinating an external release.

**Confirmations requested:**
- **Existing receipt printing behavior is unchanged.** The `printReceiptThroughAgent` call — same function, same arguments, same endpoint, same paper-width/connection-type/IP/port plumbing — executes exactly as it did before Phase B. Nothing about *how* a receipt physically prints was touched.
- **The queue cannot prevent printing.** `createPrintJob`/`dispatchPrintJob` are both invoked *before* the real print call but are wrapped in `trackPrintJobSafely`, which catches any error and returns `null` rather than throwing. If `job` ends up `null` (creation or dispatch failed, or `printer.id` was missing), the code falls through and calls `printReceiptThroughAgent` anyway, unconditionally — there is no `if (job)` gate around the actual print call, only around the *result-reporting* calls.
- **Queue failures cannot block the cashier.** Verified by reading the control flow directly: the only `await` that the print's success/failure depends on is the `printReceiptThroughAgent` call inside the `try` block; the job-tracking calls before and after it are either already-resolved best-effort promises (`trackPrintJobSafely` never re-throws) or, in the failure-reporting branch, happen *after* the real error has already been captured and is about to be re-thrown regardless of whether the report succeeds. A backend that is completely unreachable for job-tracking purposes (e.g. `posPrintJobApi` calls timing out) degrades Phase B to "behaves exactly like before Phase B existed" — not to "can't print."

---

## 8. Compatibility Review

| Area | Status | Basis |
|---|---|---|
| Receipt printing | **Unchanged** | §7 — same underlying agent call, unconditionally reached |
| Existing POS workflow | **Unchanged** | Single call site (`POSSales.jsx`) required zero edits; checkout, cart, payment flows untouched |
| Existing APIs | **No regression** | §4 — all new routes are additive under a new path prefix; no existing controller touched |
| Existing Local Device Agent | **Unaffected** | The agent's actual contract (`/health`, `/printers`, `/test-print`, `/print/receipt`) is called exactly as before; it has no awareness that job-tracking now wraps around it, and needs no update for Phase B to be safe |
| Existing terminals | **Unaffected** | No file in `pos/terminal` was touched in Phase B |
| Existing printers | **Unaffected** | No file in `pos/printer` was touched in Phase B (only Phase A touched it, already reviewed); `PosPrintJobService` only *reads* `PosPrinterRepository`, never writes to a printer row |

---

## 9. Testing Report

**Unit tests:** `PosPrintJobServiceTest` — 8 tests: unknown-printer rejection, successful enqueue inheriting printer scope (branch/terminal/counter), dispatch-only-from-QUEUED guard, successful dispatch, success result, failure-then-requeue-then-permanent-failure across `maxAttempts=2`, manual-retry-only-from-FAILED guard, manual retry resetting attempt count. **All pass.**

**Full backend suite:** `mvn -o test` → **186 tests run (178 prior + 8 new), 2 failures + 3 errors** — identical to the count and identical stack traces already confirmed pre-existing and unrelated in the Phase A review (`WarehouseServiceTest`, `LedgerServiceBankAccountTest`). Zero new regressions. `BillbullBackendApplicationTests.contextLoads` passes.

**Integration tests:** none written, consistent with this repo's Mockito-only testing convention (same as Phase A).

**Manual verification performed:**
- `mvn -o compile` — clean.
- Booted the full Spring Boot application against the real configured Postgres datasource on a scratch port: `Started BillbullBackendApplication`, no `AmbiguousMappingException`, no `BeanCreationException`. The Phase A backfill seeder also ran and logged its now-familiar "no legacy printers pending" line, confirming Phase B's new beans didn't disturb Phase A's startup behavior.
- Live HTTP smoke test: `GET /api/pos/print-jobs?branchId=1` against the running instance returned `403` (unauthenticated, no token supplied) — confirms the route is registered and reaches Spring Security, rather than `404` (no mapping) or `500` (wiring failure).
- Frontend: `npx eslint` on both changed/new files — clean. `npm run build` — succeeded (pre-existing, unrelated chunk-size warnings only).

**Known limitations (carried into §10/§12, not hidden here):**
1. `dispatch()`'s QUEUED→DISPATCHED claim is not atomic at the database level (read-then-write, not a guarded `UPDATE`) — a real race only matters once a second concurrent caller (a real polling agent) exists, which it doesn't yet.
2. No timeout/stale-dispatch sweep — a job stuck in `DISPATCHED` with no result ever reported stays there forever.
3. `scheduled_for` is stored but never acted upon.
4. `CANCELLED` status is modeled but unreachable.
5. No dedicated permission for print-job endpoints (matches the existing printer-endpoint pattern, but is broader than ideal).

---

## 10. Risks

- ~~**Concurrency race in `dispatch()`**~~ — **closed in Phase B.5** (§13.1): the read-then-write was replaced with a single guarded `UPDATE`.
- ~~**No stale-job recovery**~~ — **closed in Phase B.5** (§13.2): a scheduled sweep now recovers jobs stuck in `DISPATCHED`.
- **Dual-path printing is a standing dependency on the external agent never being updated mid-flight** — if someone updates the external Local Device Agent to start polling the job queue *without* also being told to stop expecting the browser's direct call, both the browser and the agent could end up trying to execute the same print job, risking a duplicate physical receipt. This isn't possible today (no such agent update exists) but is a coordination risk for whoever eventually builds that agent update. **Still open** — tracked as technical debt in §12, unchanged by Phase B.5.
- **Print-job endpoints are authenticated but not finely permissioned** — any logged-in user can dispatch/retry/report-result on any branch's print job, identical in scope to the pre-existing printer-CRUD endpoints' permission model, not a new gap but not improved either. **Still open.**
- **`payload` is unbounded `TEXT`** with no size validation — a pathological client could enqueue an oversized payload; low practical risk given the only caller is this repo's own receipt-text builder, but worth noting since the column has no constraint. **Still open.**
- **New in Phase B.5 — `reportResult`'s idempotency guard is a status check, not a DB-level atomic guard** (§13.4): it correctly rejects a duplicate/late result report once the job has left `DISPATCHED`, but — unlike the new `dispatch()`/sweep guards — it doesn't use a conditional `UPDATE`. Two genuinely concurrent `reportResult` calls for the same job (not currently possible, since only one caller reports a result per print attempt) could both pass the in-Java check before either writes. Lower priority than the two closed items because, unlike `dispatch()`, there is no foreseeable near-term caller that would make this concurrent — flagged for completeness, not escalated to a blocking risk.

---

## 11. Phase B Acceptance Checklist

| Item | Status |
|---|---|
| Database migration safe (additive, idempotent, no existing table altered) | ✔ |
| Existing printing preserved (same agent call, unconditionally reached) | ✔ |
| Queue works (create → dispatch → result, verified by 8 passing unit tests + live boot) | ✔ |
| Retry works (automatic up to `maxAttempts`, manual from `FAILED`) | ✔ |
| No duplicate prints (dispatch claim now DB-atomic; stale jobs fail rather than auto-requeue — §13) | ✔ |
| No UI regression (zero UI files touched; one existing JS function's internals changed behind an unchanged public call site) | ✔ |
| No API regression (no existing endpoint's contract changed; verified by reviewing every pre-existing controller for overlap) | ✔ |
| Ready for Phase C | ✔ — unconditional. Both gaps that previously made this conditional (dispatch atomicity, stale-job recovery) are closed as of Phase B.5 (§13). |

---

## 12. Phase B Technical Debt

| Workaround | Why it exists | When to remove | Owning future phase |
|---|---|---|---|
| **Dual-path printing** (browser still calls the agent directly for the actual print, in parallel with creating/dispatching/resolving a backend job) | The external Local Device Agent executable (outside this repo) doesn't yet poll the job queue; cutting the direct call today would stop all receipt printing in production with no replacement. | Once the external agent is updated to poll `GET /api/pos/print-jobs?...status=QUEUED`, claim via `dispatch`, execute, and report via `result` — at that point the browser's direct `printReceiptThroughAgent` call inside `sendReceiptToConfiguredPrinter` should be deleted entirely, leaving only job creation + polling for the result. | Whichever phase coordinates the actual Local Device Agent binary update — not explicitly numbered in the current roadmap (§14/§16 of the v2 spec name it as a dependency, not a phase of its own); should be scheduled alongside or before Phase E (Scanner & Cash Drawer registration), since that phase's dashboard work will want the agent's richer health/discovery reporting too. |
| ~~**Non-atomic dispatch claim**~~ | — | **Resolved in Phase B.5** (§13.1). | — |
| ~~**No stale-dispatch timeout sweep**~~ | — | **Resolved in Phase B.5** (§13.2). | — |
| **`scheduled_for` column exists but is inert** | Stored now so a future `SCHEDULED` job type doesn't need another migration; no scheduler logic was in Phase B's scope. | When `SCHEDULED` job types are actually needed (e.g. an automatic end-of-day Z-report print) — not currently scheduled in the roadmap. | Unassigned — should be picked up only when a concrete `SCHEDULED` use case exists, not built speculatively. |
| **`CANCELLED` status modeled but unreachable** | Added for lifecycle completeness per the spec's enum, no "operator cancels a job" UI/endpoint exists yet. | When the Device Dashboard (Phase F) gets a cancel action for a stuck/unwanted job. | Phase F (Device Dashboard UI). |
| **`reportResult` idempotency is a status check, not a DB-atomic guard** (new, introduced *by* Phase B.5's own hardening — see §10) | A full conditional-`UPDATE` guard wasn't built for this path because there's no foreseeable concurrent caller yet (unlike `dispatch()`, which Phase C/D's future polling agent will make genuinely concurrent). | If/when a second independent caller of `reportResult` for the same job becomes possible. | Whichever phase introduces that second caller — likely the same one that removes the dual-path printing workaround. |

---

## 13. Phase B.5 — Print Queue Hardening

Closes the two blocking gaps identified in this report's original §6/§10/§12 before Phase C begins. No schema change was required — both fixes are query/service-layer.

### 13.1 Atomic dispatch claim

`PosPrintJobService.dispatch()` no longer does a `findById` → check-in-Java → `save()`. It now calls a new guarded native query, `PosPrintJobRepository.claimForDispatch(id, now)`:
```sql
UPDATE pos_print_jobs SET status = 'DISPATCHED', dispatched_at = :now
WHERE id = :id AND status = 'QUEUED'
```
This single statement is the atomic unit — the database, not application code, decides whether the claim succeeds, and it can only succeed for one caller even under genuine concurrency (Postgres's row-level locking during the `UPDATE` serializes any racing attempts; the second one simply matches zero rows once the first commits). `dispatch()` checks the returned row count: `1` means this caller won the claim and it re-fetches the now-`DISPATCHED` row to return/log against; `0` means someone (or something) else already had it, and the existing `409 Conflict` behavior is preserved — same external contract, no client-visible change. The whole method is now `@Transactional`, matching the established repo precedent for this exact pattern (`PosSessionRepository.incrementSessionTotals`, used by `PosSessionService.recordInvoiceOnSession`).

### 13.2 Timeout recovery

New scheduled component, `PosPrintJobTimeoutSweepJob`, runs every 60 seconds (`@Scheduled(fixedRate = 60000)`, scheduling already enabled app-wide via the existing `@EnableScheduling`) and:
1. Queries `pos_print_jobs` for `status = 'DISPATCHED' AND dispatched_at < cutoff`, where `cutoff = now - pos.printjob.dispatch-timeout-minutes` (**configurable**, new property, default `5`, declared in `application.properties` next to the existing `audit.retention.months` precedent).
2. For each candidate, calls a second guarded native `UPDATE` (`failStaleDispatch`) — same atomic-claim pattern as 13.1 — that only takes effect if the job is *still* `DISPATCHED` and *still* past the cutoff at the instant of the write.
3. If the guarded update affected a row, logs a `QUEUE_TIMEOUT` device event (`PosDeviceEventLogService`, against the printer's parent device row) and a single summary `WARN` log line for the whole sweep batch.

### 13.3 Dead-letter handling

There is no separate dead-letter table. A timed-out job's terminal home is the existing `FAILED` status with `last_error = "Dispatch timed out after Nm with no result reported."` — `FAILED` already functions as this system's dead-letter state for every failure path (exhausted auto-retries *and* now timeouts), and it's already queryable/retryable via the existing `retry()` endpoint. Introducing a second, distinct dead-letter concept alongside `FAILED` was deliberately avoided as unnecessary duplication for the current scale and use case.

### 13.4 Idempotency

Two layers, of different strength:
- **`dispatch()` and the timeout sweep's recovery write** are both DB-atomic guarded `UPDATE`s (13.1/13.2) — idempotent by construction, since a second attempt to apply the same transition simply matches zero rows.
- **`reportResult()`** gained an application-level idempotency guard: it now checks the job's current status first and is a no-op (returns the job unchanged) unless the job is currently `DISPATCHED`. A duplicate or late-arriving result report for a job that already reached `SUCCEEDED`/`FAILED` can no longer re-run the attempt-count/status logic a second time. This is a status check, not a conditional `UPDATE` — see the new technical-debt entry above for why that's an accepted, lower-priority gap rather than a blocking one.

### 13.5 Duplicate prevention

The combination of 13.1 (can't double-claim) and the timeout sweep's explicit **never-auto-requeue** policy (§ design note in `PosPrintJobTimeoutSweepJob`'s Javadoc) is what actually prevents a duplicate physical print: a timed-out job's real-world outcome is unknown (the print may have silently succeeded with only the result report lost), so the sweep always lands it in terminal `FAILED` rather than guessing and re-queuing it for another automatic dispatch. Resubmission only happens via the existing manual `retry()` endpoint — a deliberate, human-in-the-loop decision made after checking whether the physical receipt already printed, not an automatic one.

### 13.6 Queue metrics

Not built in Phase B.5 — no new metrics/observability endpoint was added. What's available today for ad hoc visibility: the per-sweep `WARN` log line (count of recovered jobs), the existing `pos_device_event_log` table (queryable via `GET /api/pos/devices/{id}/events` for `QUEUE_TIMEOUT`/`PRINT_FAILED`/`RETRY` history per device), and direct queries against `pos_print_jobs` (e.g. `COUNT(*) GROUP BY status` for a queue-depth snapshot). A dedicated metrics surface (queue depth, average time-to-dispatch, failure rate) is left for the Device Dashboard work (Phase F) rather than built speculatively now.

### Verification performed for Phase B.5
- 2 new unit tests added to `PosPrintJobServiceTest` (now 11 total) covering the atomic-claim race and `reportResult` idempotency on already-`SUCCEEDED`/`FAILED` jobs.
- New `PosPrintJobTimeoutSweepJobTest` (5 tests): no-op when nothing stale, successful recovery + event logging, never calls `save()`/`claimForDispatch()` (proving no requeue path exists), skip when the guarded update is concurrently lost to a real result, and cutoff respects the configured timeout value.
- Full backend suite: **194 tests run (186 prior + 8 new), 2 failures + 3 errors** — same pre-existing, unrelated `WarehouseServiceTest`/`LedgerServiceBankAccountTest` failures as every prior phase. Zero new regressions.
- Real application boot, left running long enough to span at least one 60-second sweep cycle: no exceptions, no `AmbiguousMappingException`, no `BeanCreationException`. The sweep is silent (by design) when there's nothing stale to recover, which was the actual state of the dev database during this run.

---

Phase B is now fully complete, including this hardening pass. Proceeding to Phase C (Health & Discovery) per the roadmap.
