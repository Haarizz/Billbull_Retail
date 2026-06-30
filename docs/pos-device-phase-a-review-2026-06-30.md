# POS Device Manager — Phase A Review Report

Date: 2026-06-30
Scope: Phase A only ("Device Manager spine" — see [pos-device-architecture-specification-v2-2026-06-30.md](pos-device-architecture-specification-v2-2026-06-30.md) §14/§16). Phase B has not started.

---

## 1. Files Added

| File | Purpose |
|---|---|
| `billbull-backend/src/main/resources/db/migration/V22__pos_device_manager_phase_a.sql` | Flyway migration: extends `pos_devices` into the shared Device-parent table, adds `pos_printers.device_id`, creates `pos_device_event_log`, backfills existing printer rows. |
| `billbull-backend/.../pos/device/PosDeviceType.java` | New enum identifying a device row's kind (`PRINTER, SCANNER, CASH_DRAWER, CARD_TERMINAL, CUSTOMER_DISPLAY, SCALE, GENERIC`). |
| `billbull-backend/.../pos/device/PosDeviceRuntimeHealth.java` | New enum for system-observed health (`UNKNOWN, ONLINE, OFFLINE, BUSY, DISCONNECTED, ERROR, PAPER_OUT, COVER_OPEN`), separate from the admin-controlled lifecycle `PosDeviceStatus`. |
| `billbull-backend/.../pos/devicemanager/PosDeviceEventType.java` | Enum of the full device lifecycle event taxonomy (registration, health, print lifecycle, card lifecycle, agent lifecycle — 23 values). |
| `billbull-backend/.../pos/devicemanager/PosDeviceEventResult.java` | Small `SUCCESS/FAILED/INFO` enum for event outcomes. |
| `billbull-backend/.../pos/devicemanager/PosDeviceEventLog.java` | Append-only entity for `pos_device_event_log` — one row per device lifecycle event. |
| `billbull-backend/.../pos/devicemanager/PosDeviceEventLogRepository.java` | Repository: `findTop50ByDeviceIdOrderByCreatedAtDesc`. |
| `billbull-backend/.../pos/devicemanager/PosDeviceEventLogService.java` | Writes event rows, stamping the current authenticated user; exposes `tailFor(deviceId)`. |
| `billbull-backend/.../pos/devicemanager/DeviceManager.java` | The facade itself — see §5 below. |
| `billbull-backend/.../pos/devicemanager/DeviceManagerController.java` | Exposes `GET /api/pos/devices/dashboard` and `GET /api/pos/devices/{id}/events`. |
| `billbull-backend/src/test/.../pos/devicemanager/PosDeviceEventLogServiceTest.java` | Unit tests for the event log service (record + tail). |
| `billbull-backend/src/test/.../pos/devicemanager/DeviceManagerTest.java` | Unit tests for `DeviceManager` (create-sync, update-sync, health-change logging, dashboard filtering). |
| `billbull-backend/src/test/.../pos/printer/PosPrinterServiceTest.java` | New test class (none existed before) covering the printer→device sync side effect and validation. |
| `docs/pos-device-architecture-research-2026-06-30.md` | Phase 1–8 current-state research report (prior turn). |
| `docs/pos-device-architecture-specification-v2-2026-06-30.md` | The approved v2 architecture blueprint Phase A implements against. |

No frontend files were added. No files outside `billbull-backend` (other than `docs/`) were touched.

---

## 2. Files Modified

| File | What changed | Additive or behavioral? |
|---|---|---|
| `pos/device/PosDeviceStatus.java` | Added `NEW`, `MAINTENANCE`, `DISABLED` to the existing `ACTIVE/INACTIVE/DECOMMISSIONED` enum. | **Additive.** No existing value removed or renamed; no DB `CHECK` constraint exists on this column (confirmed by reading `V16__pos_remaining_gaps.sql` — `status VARCHAR(20)`, no constraint), so this is not the "widened CHECK constraint" hazard flagged elsewhere in this repo's history. |
| `pos/device/PosDevice.java` | Added three fields: `deviceType` (default `GENERIC`), `terminalId`, `runtimeHealth` (default `UNKNOWN`) + getters/setters + two new index annotations. Updated the class Javadoc (it previously described the entity, inaccurately, as being about terminal/session gating — corrected to describe its actual new role as the shared device parent row). | **Additive.** Existing fields (`deviceCode`, `deviceName`, `branchId`, `branchName`, `counterName`, `status`, `lastHeartbeat`, `notes`) are untouched; new fields all have defaults, so existing rows deserialize/serialize without error. |
| `pos/printer/PosPrinter.java` | Added one field: `deviceId` (nullable `Long`) + getter/setter. | **Additive.** No existing field changed. |
| `pos/printer/PosPrinterService.java` | (a) Constructor now also takes `DeviceManager` (Spring-injected, no manual call sites exist — confirmed via repo-wide search, zero hits for `new PosPrinterService(`). (b) `create()`, `update()`, and `decommission()` each now call a new private `syncDeviceRecord(printer)` helper, which calls `deviceManager.syncDeviceRecord(...)` and (for create/update) sets `printer.setDeviceId(...)` before saving. | **Behavioral, but additive in effect** — see exact diff and explanation in §6. No existing validation, response shape, or error condition was changed; a new internal side effect (keeping the parent device row in sync) was added. |

Exact diff for the only file with real logic change:
```diff
+    private final DeviceManager deviceManager;
-    public PosPrinterService(PosPrinterRepository repo) {
+    public PosPrinterService(PosPrinterRepository repo, DeviceManager deviceManager) {
         this.repo = repo;
+        this.deviceManager = deviceManager;
     }
@@ create()
         printer.setRuntimeStatus(PosPrinterRuntimeStatus.UNKNOWN);
+        PosDevice device = syncDeviceRecord(printer);
+        printer.setDeviceId(device.getId());
         return repo.save(printer);
@@ update()
         apply(printer, req);
+        PosDevice device = syncDeviceRecord(printer);
+        printer.setDeviceId(device.getId());
         return repo.save(printer);
@@ decommission()
         printer.setActive(false);
+        syncDeviceRecord(printer);
         return repo.save(printer);
```

---

## 3. Database Changes

**New/altered tables:**
- `pos_devices` (altered): + `device_type VARCHAR(30) NOT NULL DEFAULT 'GENERIC'`, + `terminal_id VARCHAR(80)`, + `runtime_health VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN'`.
- `pos_printers` (altered): + `device_id BIGINT REFERENCES pos_devices(id)`.
- `pos_device_event_log` (new table): `id, created_at, created_by, updated_at, updated_by, is_active, device_id (NOT NULL, FK), event_type, operation, result, error_message, branch_id, terminal_id, actor_user`.

**New indexes:** `idx_pos_device_type`, `idx_pos_device_terminal` (on `pos_devices`); `idx_pos_printer_device` (on `pos_printers`); `idx_device_event_log_device`, `idx_device_event_log_type` (on `pos_device_event_log`).

**New enums (Java-side, `VARCHAR` columns, no DB `CHECK` constraints added):** `PosDeviceType`, `PosDeviceRuntimeHealth`, `PosDeviceEventType`, `PosDeviceEventResult`; plus the three new values appended to `PosDeviceStatus`.

**New constraints:** one new FK (`pos_printers.device_id → pos_devices.id`), one new FK (`pos_device_event_log.device_id → pos_devices.id`, `NOT NULL`). No new `UNIQUE` or `CHECK` constraints.

**Migration file:** `V22__pos_device_manager_phase_a.sql`, using `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` throughout — idempotent and safe to re-run.

**Backward compatibility:** Yes, by construction — every new column is nullable or has a default, every new table is additive, and no existing column/table/constraint was altered or dropped. Existing `SELECT *`/ORM-mapped reads of `pos_devices` or `pos_printers` are unaffected; existing INSERTs that don't mention the new columns continue to work because all new columns have defaults or accept `NULL`.

**Important caveat found during this review (not a Phase A regression, but a pre-existing repo-wide condition that affects how this migration actually behaves today):** `spring.flyway.enabled=false` in the default `application.properties` and in three of the per-client profiles (`client1`/`client2`/etc. inherit the default; `leroyalflowers`, `leroyalgifts`, `royaltools` explicitly repeat `false`). **No profile in this repo currently sets `spring.flyway.enabled=true`.** This means:
- The new columns/table in V22 **do** get created on a normal boot, but via Hibernate's `ddl-auto=update` schema sync (which reads the updated `@Entity` mappings I added), **not** by Flyway executing the SQL file.
- The **backfill `INSERT`/`UPDATE` statements** in V22 (linking existing `pos_printers` rows to a new `pos_devices` parent row) are plain DML inside a Flyway script — `ddl-auto=update` never executes them. With Flyway disabled, **that backfill does not run automatically.**
- Net effect: existing printer rows will have `device_id = NULL` until each row is next saved through `PosPrinterService.update()` (or `create()`/`decommission()` for new/removed rows), at which point the new sync code path populates it. This is a **functional gap for already-existing printers that are never edited again**, not a data-corruption risk — `device_id` is nullable and nothing in Phase A yet depends on it being populated for every row.
- I verified this is pre-existing, repo-wide behavior (not something this change introduced) by checking `application.properties` directly; it matches this repo's documented convention ("Schema is JPA-managed... No Flyway/Liquibase migrations" in CLAUDE.md) even though an earlier memory note describes a past effort to activate Flyway — the present on-disk config has it off.

**Rollback strategy:**
- *If only `ddl-auto=update` ran (today's actual default behavior):* rollback is a manual `ALTER TABLE ... DROP COLUMN` / `DROP TABLE pos_device_event_log` — no Flyway rollback mechanism is in play since Flyway never ran. Safe at any time: nothing else reads the new columns/table yet except the new code itself.
- *If Flyway is later enabled and V22 has run:* Flyway has no native "down" migration; rollback would be a new forward migration (e.g. `V23__revert_pos_device_manager_phase_a.sql`) dropping the added columns/table/indexes — standard practice for this repo's existing migrations, none of which carry a corresponding "down" script either.
- In both cases, rollback is low-risk because every change is additive (no existing column dropped/renamed, no existing data mutated by the DDL itself — only the *optional* backfill DML touches existing rows, and only to populate a previously-nonexistent, nullable column).

---

## 4. API Changes

**New endpoints:**
| Method & path | Description |
|---|---|
| `GET /api/pos/devices/dashboard?branchId=` | Returns all `PosDevice` rows for a branch (Phase A minimal version — no health/profile/job aggregation yet, that's Phase C/D/F). |
| `GET /api/pos/devices/{id}/events` | Returns the latest 50 `PosDeviceEventLog` rows for a device. |

**Existing endpoint contracts:** Unchanged. Specifically checked:
- `PosPrinterController` (`/api/pos/printers/**`): same routes, same request DTOs (`UpsertRequest`, `RuntimeRequest` — neither was modified), same response type (`PosPrinter`) — which now additively carries a `deviceId` field in its JSON. No field was removed or renamed, no request DTO field was added/required, no status code or validation rule changed.
- `PosDeviceController` (`/api/pos/devices/**`, pre-existing): untouched file. Its `PosDevice` response shape additively gains `deviceType` (defaults to `GENERIC`), `terminalId` (defaults to `null`), `runtimeHealth` (defaults to `UNKNOWN`) — same non-breaking pattern.
- **Route collision check**: `DeviceManagerController` adds `GET /api/pos/devices/dashboard` and `GET /api/pos/devices/{id}/events` under the same `/api/pos/devices` base path already used by the pre-existing `PosDeviceController` (which has `GET /api/pos/devices/{id}`). I verified this does not produce an ambiguous-mapping error by actually booting the full Spring context (see §8) — Spring's path matcher resolves the literal `/dashboard` segment in preference to the `{id}` variable pattern, which is standard, well-defined behavior (the same pattern many Spring apps rely on for `/users/me` vs `/users/{id}`), and the app started cleanly with no `AmbiguousMappingException`.

No frontend API client file (`*.js` under `src/api/`) was touched, since nothing in the frontend calls these new endpoints yet (intentionally — Phase A is backend-only foundation).

---

## 5. DeviceManager Review

**Responsibilities implemented in Phase A** (a deliberate subset of the full §6.2 responsibility table in the spec — the rest land in later phases):
- `syncDeviceRecord(...)` — create-or-update the shared parent row for a type-specific device, keyed by `deviceCode`. This is the **only** write path into `pos_devices` for type-specific services going forward.
- `updateRuntimeHealth(...)` — update a device's system-observed health, logging a `HEALTH_CHANGED` event only when the value actually transitions (not on every poll).
- `getDashboard(branchId)` — read-only aggregate of devices for a branch.
- `getEvents(deviceId)` — read-only tail of a device's event log.

**Confirmed it does not duplicate or own business logic:**
- It has no knowledge of printer-specific concepts (connection type, paper size, print templates, default-printer-per-scope rules) — all of that validation and behavior remains entirely inside `PosPrinterService`, unchanged.
- It does not call `PosPrinterRepository` or any other type-specific repository — its only repository dependencies are `PosDeviceRepository` and `PosDeviceEventLogRepository`.
- `PosPrinterService` calls *into* `DeviceManager` (one-directional dependency); `DeviceManager` has zero dependency on `pos.printer` or any other feature package. This matches the orchestrator role from the spec (§6.1: "It does not itself implement printer/scanner/drawer/card logic — it routes to the appropriate sub-service") — though in Phase A there is, by design, no scanner/drawer/card-terminal sub-service yet to route to; that routing role activates in Phase E/G.
- It contains no HTTP/printing/hardware code of any kind.

---

## 6. PosPrinterService Review

**Every modification, explained:**
1. **Constructor gained a `DeviceManager` parameter.** Pure dependency injection; Spring wires it automatically (confirmed no manual `new PosPrinterService(...)` call sites exist anywhere in `src/main`).
2. **`create()`**: after the printer object is built (`apply(printer, req)`) and before `repo.save(printer)`, it now calls `syncDeviceRecord(printer)`, which creates a new `pos_devices` row (since the `deviceCode` doesn't exist yet) and returns it; `printer.setDeviceId(device.getId())` links the two rows. The printer is then saved exactly as before, just with one additional populated field.
3. **`update()`**: same pattern — `syncDeviceRecord(printer)` now *updates* the existing `pos_devices` row (matched by `deviceCode`) with the printer's current name/branch/terminal/counter/status, and re-confirms `deviceId` (a no-op if already set, self-healing if it was somehow null).
4. **`decommission()`**: calls `syncDeviceRecord(printer)` after setting `status = DECOMMISSIONED` and `isActive = false`, so the parent device row's status is kept consistent with the printer's decommissioned state.
5. **New private helper `syncDeviceRecord(PosPrinter)`**: maps `PosPrinterStatus` → `PosDeviceStatus` via `PosDeviceStatus.valueOf(printer.getStatus().name())` — safe because every `PosPrinterStatus` value (`ACTIVE, INACTIVE, DECOMMISSIONED`) has an identically-named counterpart in the now-expanded `PosDeviceStatus` enum.

**Confirmed receipt printing behavior is unchanged:** `PosPrinterService` has no print-execution code (printing happens entirely client-side via `localPrintAgent.js`/`zebraZpl.js`, calling printer *configuration* read endpoints, not this service's write methods). The only methods touched are configuration CRUD (`create`, `update`, `decommission`) — `list()`, `get()`, and `updateRuntime()` (the method that records actual print-test results today) are **byte-for-byte unchanged**. No printer's `connectionType`, `systemPrinterName`, `ipAddress`, `paperSize`, or `printTemplate` field — the fields that actually drive how a receipt prints — was touched by this change.

**How the new DEVICE parent record is synchronized:** matched by `deviceCode` (unique across the system), upserted on every printer create/update/decommission, mapping `deviceName/branchId/branchName/terminalId/counterName/status` 1:1 from the printer to its parent device row. This keeps the two records consistent as long as a printer is touched through the service layer — see §3's Flyway caveat for the one case (pre-existing, never-edited-again printer rows under a Flyway-disabled boot) where this sync hasn't happened yet for historical data.

---

## 7. Compatibility Check

| Area | Status | Basis |
|---|---|---|
| POS login | **Unaffected** | No file in `auth`/`security`/`user` packages was touched. |
| Terminal assignment | **Unaffected** | `PosTerminal`/`PosTerminalService`/`PosTerminalController` were not touched. `PosDevice.terminalId` is a new, separate field on a different entity — it does not read from or write to `PosTerminal`. |
| Device registration | **Unaffected, additively extended** | `PosDeviceController`'s existing register/list/update/status/heartbeat/delete endpoints are byte-for-byte unchanged; the entity they operate on gained three new defaulted fields, which a JSON client safely ignores if it doesn't know about them. |
| Receipt printing | **Unaffected** | Confirmed in §6 — no print-execution code path was touched; only printer-configuration CRUD gained a side effect that doesn't change its return value or error behavior. |
| Existing APIs | **No breaking changes** | Verified in §4 — no existing route, request DTO, or response field was removed/renamed; new fields are additive. |
| Existing frontend | **Unaffected** | Zero frontend files touched (`git status` confirms no changes under `billbull-frontend/`). |
| Existing database data | **Unaffected (additive only)** | No existing column, table, or row value was altered or deleted by either the migration SQL or by the `ddl-auto=update` path that actually ran. The only data write is the *optional* backfill DML, which only fills a previously-nonexistent, nullable column — it does not alter `pos_printers`' existing columns. |

---

## 8. Testing Report

**Unit test results:**
- New tests added this phase: `PosDeviceEventLogServiceTest` (2 tests), `DeviceManagerTest` (5 tests), `PosPrinterServiceTest` (2 tests) — **all pass.**
- Full backend suite: `mvn -o test` → **174 tests run, 2 failures + 3 errors**, all in `WarehouseServiceTest` and `LedgerServiceBankAccountTest` — **pre-existing and unrelated to this change.** Verified by `git stash`-ing every Phase A change and re-running just those two test classes against the unmodified codebase: identical failure count and identical stack traces (Mockito strict-stubbing argument mismatches in `WarehouseService`, and an NPE in `LedgerServiceBankAccountTest` from a missing mock) — confirming these are not regressions introduced here.

**Integration test results:** No dedicated integration test exists for this phase (none was written, consistent with this repo's testing convention of Mockito-based unit tests; the one `@SpringBootTest` in the repo, `BillbullBackendApplicationTests.contextLoads`, was not specifically run in isolation here but is covered by the full-context boot below, which is a stronger check).

**Manual verification performed:**
- `mvn -o compile` — clean.
- Booted the full Spring Boot application against the configured local Postgres datasource (`jdbc:postgresql://localhost:5432/testdb`) on a scratch port. **Result: `Started BillbullBackendApplication` — no `AmbiguousMappingException`, no `BeanCreationException`, no schema-validation failure.** This is the strongest available confirmation that (a) the new `@Entity`/`@Index` annotations are valid and Hibernate could apply them via `ddl-auto=update`, (b) the new `DeviceManager`/`DeviceManagerController` beans wire correctly with no circular dependency, and (c) the new `/api/pos/devices/dashboard` route does not collide with the pre-existing `/api/pos/devices/{id}` route. The process was stopped immediately after confirming startup; it was not exercised with live HTTP requests in this review.
- Did **not** directly inspect the resulting table schema via `psql` (no `psql` client available in this shell) — schema correctness is inferred from the successful boot plus the explicit Hibernate `@Column`/`@Table` annotations reviewed by hand, not from a raw DB introspection.

**Known issues:**
1. **Flyway is disabled in this repo's default and all client profiles today**, so `V22`'s backfill DML does not execute automatically anywhere right now — see §3. This is a pre-existing repo condition, not something Phase A broke, but it means the migration's data-backfill half is currently dormant rather than verified end-to-end against real Flyway execution.
2. Existing `pos_printers` rows created before this change will have `device_id = NULL` until next edited (lazy backfill via the new service code), under the current Flyway-disabled default.

**Remaining risks:**
- If a future phase (Hardware Profile resolution, Dashboard read for printers specifically) assumes every printer has a non-null `device_id`, it will need to handle the lazy-backfill gap above — flagged for Phase D's risk list already in the approved spec (§15), now confirmed concretely rather than theoretically.
- The Phase A `getDashboard()`/`/dashboard` endpoint was not exercised with a live HTTP call (only confirmed to register without route conflict) — recommend an explicit manual `curl`/Postman check before relying on it in Phase B/C work.

---

## 9. Phase A Acceptance Checklist

| Item | Status |
|---|---|
| Database migration safe (additive, idempotent, backward compatible) | ✔ |
| Existing functionality preserved (login, terminals, device registration, receipt printing, existing APIs, frontend, existing data) | ✔ |
| No breaking API changes | ✔ |
| No UI changes | ✔ |
| New-code unit tests passed | ✔ |
| Full suite has no *new* regressions (pre-existing 2 failures/3 errors confirmed unrelated) | ✔ |
| Full Spring context boots cleanly with the new beans/routes/entities | ✔ |
| Legacy backfill mechanism (replaces the Flyway-DML question) | ✔ — see §10 |
| Live HTTP smoke test of the two new endpoints | ✖ — **not performed**, route-collision-free registration confirmed via boot log only |

**Recommendation (resolved 2026-06-30):** Phase A's one open item — how `device_id` gets backfilled for printers that existed before this change, given Flyway stays disabled — is resolved by the startup seeder documented in §10. Phase A is considered fully complete.

---

## 10. Legacy Backfill Follow-up (resolves the open item above)

**Decision:** do not enable Flyway. Instead, add a startup seeder — `PosPrinterDeviceBackfillSeeder` (`pos/devicemanager/PosPrinterDeviceBackfillSeeder.java`) — that performs the same linking work V22's dormant DML would have, using the pattern this repo already established for exactly this situation.

**Why a startup task, not a maintenance endpoint or a one-off migration utility:**
CLAUDE.md documents the repo's standing convention for this exact scenario: *"Schema is JPA-managed (`ddl-auto=update`). No Flyway/Liquibase migrations. ... data migrations are done in seeders ... which run at startup."* There is direct, in-repo precedent of the same shape — `inventory/stocktake/StockTakeBatchMasterBackfillSeeder.java` — an `@Component` that listens for `ApplicationReadyEvent` and idempotently reconciles legacy rows on every boot. Following that precedent rather than inventing a new mechanism means:
- No operator action is required, ever — every restart self-heals any rows that are still missing a `device_id` (including ones that slipped through if a future bulk-import or direct-DB-write bypasses the service layer).
- It doesn't need a maintenance endpoint to be remembered, secured, and invoked manually — a class of mechanism this repo doesn't otherwise have for this kind of one-time-per-row cleanup.
- It doesn't touch `spring.flyway.enabled`, which you explicitly asked to leave alone, and it doesn't add a parallel "migration utility" concept the team would need to learn on top of the seeders that already exist.

**How it works:**
1. `PosPrinterRepository.findByDeviceIdIsNull()` (new query method) selects every printer — active or decommissioned — that doesn't yet have a parent device row linked.
2. For each, it calls the same `DeviceManager.syncDeviceRecord(...)` that `PosPrinterService` already uses for live create/update — so a backfilled device row is built with identical logic to the one a freshly-created printer gets, including the `DEVICE_REGISTERED` event log entry.
3. `printer.setDeviceId(device.getId())` and a direct `printerRepo.save(printer)` — bypassing `PosPrinterService` entirely, so none of its validation or default-printer-uniqueness rules run against historical data, and no field other than `device_id` is touched.
4. Each printer is wrapped in its own `try/catch`; one failure is logged and counted, processing continues to the next row.
5. A summary line logs `processed / linked / skipped / failed` counts every run (`skipped` = rows with a blank `device_code`, which shouldn't occur given the column's `NOT NULL` constraint but is guarded defensively; `failed` = any exception during sync/save).

**Idempotency:** the seeder's only selection criterion is `device_id IS NULL`. Once a row is linked, it permanently drops out of that query, so re-running the seeder — which happens automatically on every application restart — is always a safe no-op for already-processed rows. Verified directly: a unit test (`noOrphanedPrintersDoesNothing`) asserts zero calls to `DeviceManager`/`save()` when the query returns an empty list, which is exactly the state every row reaches after its first successful run.

**Verification performed:**
- 4 new unit tests (`PosPrinterDeviceBackfillSeederTest`): empty-set no-op, successful link, blank-device-code skip, and partial-failure resilience (one printer throws, the next still gets processed and linked) — **all pass.**
- Booted the full Spring Boot application against the real configured datasource a second time. The seeder ran automatically post-startup and logged `No legacy printers pending a Device Manager parent record` (this dev database currently has no printer rows predating the change, or none were left unlinked from earlier manual testing in this session) — confirms the `ApplicationReadyEvent` wiring fires correctly and the zero-rows path is exception-free in a real context, not just under mocks.
- Re-ran the full backend suite: **178 tests run (174 + 4 new), 2 failures + 3 errors** — identical pre-existing `WarehouseServiceTest`/`LedgerServiceBankAccountTest` failures, zero new regressions.

**Does not modify existing printer behavior:** confirmed — the seeder never calls `PosPrinterService`, never touches `connectionType`/`status`/`paperSize`/`printTemplate`/any field other than `deviceId`, and runs as a side effect of application startup rather than inside any request path a user or the POS UI exercises.
