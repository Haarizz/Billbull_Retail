# POS Device Manager — Phase C Review Report

Date: 2026-06-30
Scope: Phase C only ("Health & Discovery" — [pos-device-architecture-specification-v2-2026-06-30.md](pos-device-architecture-specification-v2-2026-06-30.md) §9/§11/§14/§16). Builds on completed and approved [Phase A](pos-device-phase-a-review-2026-06-30.md) and [Phase B (incl. B.5 hardening)](pos-device-phase-b-review-2026-06-30.md). Phase D has not started.

---

## 1. Files Added

| File | Purpose |
|---|---|
| `db/migration/V24__pos_device_health_discovery.sql` | Creates `pos_device_health_snapshot` and `pos_discovered_device`, idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`). |
| `pos/devicemanager/PosDeviceHealthSnapshot.java` | One row per health reading pushed for a device — driver/firmware/paper/cover status, busy flag, queue length, captured timestamp. |
| `pos/devicemanager/PosDeviceHealthSnapshotRepository.java` | `findTop50ByDeviceIdOrderByCapturedAtDesc` for the history endpoint. |
| `pos/devicemanager/HealthService.java` | Ingests a snapshot, stamps the device's `lastHeartbeat`, and delegates the current-health update to `DeviceManager.updateRuntimeHealth` (reusing Phase A's change-detection/event-logging rather than duplicating it). |
| `pos/devicemanager/PosDeviceHealthSweepJob.java` | Scheduled (every 60s) offline-detection sweep — the gap Phase A's review explicitly deferred ("no heartbeat sweep"), now closed. |
| `pos/devicemanager/DiscoveredDeviceStatus.java` | Enum `NEW, IGNORED, REGISTERED`. |
| `pos/devicemanager/DiscoveryMethod.java` | Enum `USB, BLUETOOTH, SERIAL, NETWORK, WINDOWS_QUEUE`. |
| `pos/devicemanager/PosDiscoveredDevice.java` | A hardware candidate an agent reported but that isn't yet matched to a registered device. |
| `pos/devicemanager/PosDiscoveredDeviceRepository.java` | Upsert-key lookup (`agentIdentifier` + `rawIdentifier`) and `NEW`-status listing. |
| `pos/devicemanager/DiscoveryService.java` | Ingests/upserts candidates, lists ones awaiting registration, marks ignored. |
| `billbull-backend/src/test/.../devicemanager/HealthServiceTest.java` | 4 tests. |
| `billbull-backend/src/test/.../devicemanager/DiscoveryServiceTest.java` | 5 tests. |
| `billbull-backend/src/test/.../devicemanager/PosDeviceHealthSweepJobTest.java` | 4 tests. |

No new frontend files — Phase C, like A and B, is backend-only. The Device Dashboard UI that will actually surface health/discovery data to an operator is Phase F, not this phase.

---

## 2. Files Modified

| File | Exact change | Breaking? |
|---|---|---|
| `pos/devicemanager/DeviceManagerController.java` | Gained two new constructor dependencies (`HealthService`, `DiscoveryService`) and five new endpoints: `POST /{id}/health`, `GET /{id}/health/history`, `POST /discovery`, `GET /discovery/awaiting`, `PUT /discovery/{id}/ignore`. The two Phase A endpoints (`/dashboard`, `/{id}/events`) are untouched. | **No** — additive routes only; verified no path collision the same way Phase A's `/dashboard` vs `/{id}` was verified (see §9). |
| `application.properties` | Added `pos.device.health-offline-threshold-minutes=5`, alongside the Phase B.5 `pos.printjob.dispatch-timeout-minutes` property, same declared-with-default convention as `audit.retention.months`. | **No** — new property, default matches the `@Value` fallback so omitting it changes nothing. |

No other file from Phase A/B (entities, services, controllers) was touched in Phase C.

---

## 3. Database Review

```sql
pos_device_health_snapshot
  id, created_at, created_by, updated_at, updated_by, is_active,   -- BaseEntity columns
  device_id        BIGINT NOT NULL REFERENCES pos_devices(id),
  health_state     VARCHAR(20) NOT NULL,        -- PosDeviceRuntimeHealth (Phase A enum, reused)
  driver_status    VARCHAR(100),
  firmware_version VARCHAR(50),
  paper_status     VARCHAR(20),
  cover_status     VARCHAR(20),
  busy             BOOLEAN NOT NULL DEFAULT FALSE,
  queue_length     INT,
  captured_at      TIMESTAMP NOT NULL
  -- index: (device_id, captured_at)

pos_discovered_device
  id, created_at, ..., is_active,
  agent_identifier      VARCHAR(120) NOT NULL,   -- opaque agent-supplied string (e.g. hostname)
  discovery_method      VARCHAR(20)  NOT NULL,
  raw_identifier         VARCHAR(200) NOT NULL,
  suggested_device_type VARCHAR(30),
  status                 VARCHAR(20)  NOT NULL DEFAULT 'NEW',
  first_seen_at          TIMESTAMP NOT NULL,
  last_seen_at           TIMESTAMP NOT NULL,
  UNIQUE (agent_identifier, raw_identifier)        -- the upsert key
  -- index: status
```

Both tables reuse Phase A's `PosDeviceRuntimeHealth`/`PosDeviceType` enums where applicable rather than inventing parallel vocabularies — consistent with the shared-vocabulary principle the v2 spec set out for the Device Manager.

**Migration safety:** identical pattern to V22/V23 — `CREATE TABLE/INDEX IF NOT EXISTS`, fully additive, no existing table touched. The one `FOREIGN KEY` (`pos_device_health_snapshot.device_id → pos_devices.id`) only matters at insert time. As with V22/V23, this repo's `spring.flyway.enabled=false` default means the table is actually created via Hibernate `ddl-auto=update` reading the entity mapping rather than Flyway running this script — but, exactly like V23, this migration contains **no DML**, so there's no Phase-A-style backfill gap to worry about here.

**Rollback strategy:** drop both tables — safe at any point, nothing outside this phase references either (no other table has an FK pointing *at* `pos_device_health_snapshot` or `pos_discovered_device`).

---

## 4. API Review

| Endpoint | Request | Response | Security | Validation |
|---|---|---|---|---|
| `POST /api/pos/devices/{id}/health` | `SnapshotRequest{healthState, driverStatus, firmwareVersion, paperStatus, coverStatus, busy, queueLength}` | `201 Created` + the saved snapshot | `isAuthenticated()` | `healthState` required (`400`); device must exist (`404`) |
| `GET /api/pos/devices/{id}/health/history` | path `id` | latest 50 snapshots, newest first | `isAuthenticated()` | none beyond the path variable |
| `POST /api/pos/devices/discovery?agentIdentifier=` | `CandidateRequest{discoveryMethod, rawIdentifier, suggestedDeviceType}` | the upserted `PosDiscoveredDevice` | `isAuthenticated()` | `agentIdentifier`, `rawIdentifier`, `discoveryMethod` all required (`400`) |
| `GET /api/pos/devices/discovery/awaiting` | none | all `NEW`-status candidates, most recently seen first | `isAuthenticated()` | none |
| `PUT /api/pos/devices/discovery/{id}/ignore` | path `id` | the updated candidate (`IGNORED`) | `isAuthenticated()` | candidate must exist (`404`) |

**No existing endpoint's contract changed** — same security model (plain `isAuthenticated()`, matching the precedent already set and already flagged as broad-but-consistent in the Phase B review) and no path collision with any pre-existing route (verified via a real boot + live `403` smoke tests on all three new POST/GET routes — §9).

**Note on batch ingestion:** `DiscoveryService.ingestBatch(...)` exists in the service layer (accepts a `List<CandidateRequest>` and ingests each) but **is not wired to a controller endpoint** in this phase — only the single-candidate `POST /discovery` is exposed. This was a deliberate choice: a real agent reporting many candidates at once is exactly the kind of contract decision that should be made once the actual agent's discovery-reporting shape is known, not guessed at now. The method is there, tested implicitly via the single-ingest path it delegates to, ready to wire up without further service-layer work whenever that's needed.

---

## 5. HealthService / Offline Sweep Review

**HealthService responsibilities implemented:** snapshot ingestion (validates device exists + `healthState` present), persists the snapshot row, stamps `PosDevice.lastHeartbeat`, and calls `DeviceManager.updateRuntimeHealth` — which already contains the "only log `HEALTH_CHANGED` if the value actually changed" logic built in Phase A. **Nothing in Phase C duplicates that logic**; it's a straight reuse, which is the same "shared parent + facade" payoff the v2 spec's §6.5/§13.4 argued for.

**Offline sweep (`PosDeviceHealthSweepJob`):**
- Runs every 60 seconds via `@Scheduled(fixedRate = 60000)` (scheduling already enabled app-wide via the existing `@EnableScheduling` on `BillbullBackendApplication`, confirmed before adding this — no new enabling annotation needed).
- Threshold is configurable (`pos.device.health-offline-threshold-minutes`, default 5), same pattern as `audit.retention.months` and the Phase B.5 print-job timeout.
- Iterates `ACTIVE` devices (via the pre-existing `PosDeviceRepository.findAllByStatus`, no new query needed), skips any already `OFFLINE` (avoids a redundant write + event on every sweep cycle for a device that's been down for hours), and flips anything whose `lastHeartbeat` is null or older than the cutoff.
- **A device with no heartbeat at all (`lastHeartbeat == null`) is treated as stale, not skipped.** This is a deliberate behavior worth flagging explicitly: on the very first sweep after this code is deployed, *every* existing device that has never reported a Phase C health snapshot will be marked `OFFLINE` in one pass (each logged as an individual `HEALTH_CHANGED` event). This is honest, intended behavior — a device that has never been monitored under this model genuinely has unknown/absent health — but it does mean the first sweep after rollout will generate a burst of `HEALTH_CHANGED` events rather than a gradual trickle. Not a bug; flagged so it isn't mistaken for one when reviewing the event log after deployment.

---

## 6. DiscoveryService Review

- **Idempotent ingestion**: upsert key is `(agentIdentifier, rawIdentifier)` (DB `UNIQUE` constraint + repository lookup before insert) — re-reporting the same physical device on every discovery cycle just refreshes `lastSeenAt`, never creates a duplicate row.
- **Deliberately no identity-matching against already-registered devices.** A discovered candidate is never automatically correlated with an existing `PosPrinter`/`PosDevice` row — there's no reliable rule yet for inferring "this raw USB string is printer #12," and guessing wrong would silently miscategorize real hardware. This mirrors the same "don't build speculative logic" discipline applied throughout Phases A–C (e.g. Phase B's `scheduled_for` column, Phase A's deferred `Counter` entity).
- **Status transitions are operator-driven, never automatic**: a `NEW` candidate only becomes `IGNORED` via the explicit `ignore` endpoint; re-discovery of an already-`IGNORED` (or, once a future phase adds it, `REGISTERED`) candidate does not resurrect it to `NEW` — a prior human decision about a candidate stands until explicitly changed. Verified by `reDiscoveryDoesNotResurrectIgnoredCandidate`.
- **`REGISTERED` status is modeled but, like Phase B's `CANCELLED`, currently unreachable** — nothing in Phase C ever sets it, because "turn a candidate into an actual registered printer/scanner" requires picking a branch/terminal/device-type, which is Hardware Profile + Dashboard UI territory (Phase D/F), not Health & Discovery. Flagged in §10/Known Limitations, not silently left undocumented.

---

## 7. Compatibility Review

| Area | Status | Basis |
|---|---|---|
| Phase A device registry/dashboard | **Unaffected** | `DeviceManager`, `PosDevice`, `PosDeviceEventLogService` files untouched; `DeviceManagerController` only gained new routes, the two Phase A routes are byte-for-byte unchanged |
| Phase B/B.5 print job spine | **Unaffected** | No file under `pos/printjob` was touched in Phase C |
| Receipt printing | **Unaffected** | No file under `pos/printer` or `localPrintAgent.js` was touched in Phase C |
| Existing APIs | **No regression** | All five new routes are additive; verified no collision via real boot + live smoke tests |
| Existing terminals | **Unaffected** | No file under `pos/terminal` touched |
| Existing frontend | **Unaffected** | Zero frontend files touched in this phase |
| Existing database data | **Unaffected (additive only)** | Two wholly new tables; no existing table altered |

---

## 8. Testing Report

**Unit tests:** `HealthServiceTest` (4), `DiscoveryServiceTest` (5), `PosDeviceHealthSweepJobTest` (4) — **13 new tests, all pass.** Coverage includes: unknown-device/missing-healthState rejection, snapshot persistence + heartbeat stamp + runtime-health delegation, history retrieval, candidate validation, new-vs-existing upsert behavior, ignored-candidate non-resurrection, ignore-transition, stale/never-heartbeat/recent-heartbeat/already-offline sweep branches.

**Full backend suite:** `mvn -o test` → **207 tests run (194 prior + 13 new), 2 failures + 3 errors** — same pre-existing, unrelated `WarehouseServiceTest`/`LedgerServiceBankAccountTest` failures carried through every phase so far. Zero new regressions. `BillbullBackendApplicationTests.contextLoads` passes.

**Manual verification:**
- `mvn -o compile` — clean.
- Real Spring Boot boot against the configured Postgres datasource, left running ~95s to span at least one 60-second sweep cycle: `Started BillbullBackendApplication`, no `AmbiguousMappingException`, no `BeanCreationException`, no uncaught exception in either sweep job's window. The health-offline sweep logged nothing (correct: zero `ACTIVE` devices exist in this dev DB right now, matching the Phase A backfill seeder's own "no legacy printers" finding every prior boot has shown).
- Live HTTP smoke tests against the running instance: `POST /api/pos/devices/discovery?agentIdentifier=TEST-AGENT` → `403`; `GET /api/pos/devices/discovery/awaiting` → `403`; `POST /api/pos/devices/1/health` → `403`. All three are unauthenticated-rejection responses (no token supplied), confirming the routes are registered and security-gated rather than missing (`404`) or broken (`500`).

**Known limitations:**
1. `DiscoveryService.ingestBatch` exists but has no controller endpoint (§4) — single-candidate ingestion only, by design, until a real agent's batch-reporting shape is known.
2. No cross-matching between a discovered candidate and an already-registered device — entirely manual/future (§6).
3. `DiscoveredDeviceStatus.REGISTERED` is unreachable until Phase D/F builds the "register from candidate" flow.
4. No aging-out of stale `NEW` candidates that stop being re-discovered (the v2 spec's §11.1 mentions this as a DiscoveryService responsibility — not built in Phase C; a `NEW` candidate that an agent stops seeing just sits there indefinitely). Flagged here rather than silently omitted.
5. The offline sweep's "never-heartbeat = stale" behavior produces a one-time event burst on first deploy (§5) — expected, not a defect, but worth knowing before reading the event log post-rollout.

---

## 9. Risks

- **First-sweep event burst** (§5) — cosmetic/log-volume only, not a functional risk; every existing device transitions `UNKNOWN`/whatever → `OFFLINE` in one pass the first time this code runs against a populated `pos_devices` table.
- **No stale-candidate aging** (§8.4) — a `pos_discovered_device` table could grow slowly over time with candidates an agent no longer sees (e.g. unplugged hardware) and nobody ever explicitly ignored. Low practical risk at current scale; worth a follow-up if discovery is ever wired to a real, frequently-polling agent.
- **`agentIdentifier` is a free-text, agent-supplied string with no registration/validation of its own** — nothing currently verifies an agent claiming "AGENT-1" is the workstation it says it is (this mirrors the same un-finely-permissioned pattern already flagged for print-job endpoints in the Phase B review, not a new category of gap).
- **Route surface on `DeviceManagerController` continues to grow** (now 7 endpoints across Phase A + C) without a dedicated permission — same standing observation as Phase B's risk list, not worsened by this phase but not improved either.

---

## 10. Phase C Acceptance Checklist

| Item | Status |
|---|---|
| Database migration safe (additive, idempotent, no existing table altered) | ✔ |
| HealthService reuses Phase A's change-detection/event-logging rather than duplicating it | ✔ |
| Offline sweep configurable, scheduled, verified via real boot | ✔ |
| DiscoveryService idempotent ingestion, no speculative auto-matching, no auto-resurrection of operator decisions | ✔ |
| No existing functionality (Phase A/B/B.5, printing, terminals, frontend) regressed | ✔ |
| No API regression (new routes only, verified collision-free) | ✔ |
| No UI work (correctly out of scope — Phase F) | ✔ |
| Tests passed (13 new, 207 total, same pre-existing unrelated failures) | ✔ |
| Known limitations documented rather than silently deferred | ✔ |
| Ready for Phase D | ✔ |

---

## 11. Phase C Technical Debt

| Item | Why it exists | When to address | Owning future phase |
|---|---|---|---|
| `ingestBatch` has no endpoint | Real agent's batch-reporting contract isn't known yet | When the actual Local Device Agent update (already tracked as Phase B's biggest piece of technical debt) is scoped | Same phase that builds the real polling agent |
| No discovered-candidate ↔ registered-device matching | No reliable matching rule defined; guessing risks miscategorizing real hardware | When/if a concrete matching heuristic (e.g. exact `rawIdentifier` == printer `deviceIdentifier`) is deliberately designed | Phase D (Hardware Profiles) or F (Dashboard), whichever first needs "pre-fill registration from a discovered candidate" |
| `REGISTERED` status unreachable | Requires branch/terminal/type selection UI that doesn't exist yet | When the Dashboard's "Register" action is built | Phase F |
| No stale-`NEW`-candidate aging/cleanup | Not needed at current scale; no real agent is polling frequently yet | Once a real agent is reporting discovery on a real cadence and the table's growth becomes observable | Whichever phase owns ongoing DeviceManager operational concerns (likely alongside Phase F's dashboard, or a maintenance job similar to `AuditLogRetentionJob`) |

---

Phase C is complete. Awaiting review before proceeding to Phase D (Hardware Profiles) per the roadmap.
