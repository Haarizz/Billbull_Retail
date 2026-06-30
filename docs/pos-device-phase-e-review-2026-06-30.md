# POS Device Manager — Phase E Review Report

Date: 2026-06-30
Scope: Two small Phase D architectural enhancements (Hardware Profile versioning, Configuration Changed domain event) plus Phase E in full ("Scanner & Cash Drawer" — [pos-device-architecture-specification-v2-2026-06-30.md](pos-device-architecture-specification-v2-2026-06-30.md) §8.8/§14/§16). Builds on completed and approved [Phase A](pos-device-phase-a-review-2026-06-30.md), [Phase B/B.5](pos-device-phase-b-review-2026-06-30.md), [Phase C](pos-device-phase-c-review-2026-06-30.md), and [Phase D](pos-device-phase-d-review-2026-06-30.md). The Device Dashboard phase (F) has not started.

---

## Part 1 — Phase D Enhancements (prerequisite to this round)

### 1.1 Hardware Profile versioning

**What changed:** `PosHardwareProfile` gained a `version` column (`int`, default 1). `PosTerminal` gained `assignedProfileVersion` (nullable `Integer`) — the profile's version *at the moment it was assigned* to that terminal.

- `HardwareProfileService.update()` increments `version` whenever a profile's name/branch/description changes.
- `HardwareProfileService.assignDeviceToRole()` increments `version` whenever a role-slot's device assignment changes (the profile's device composition is as much "the configuration" as its name).
- `HardwareProfileAssignmentEngine.assign()` stamps `terminal.assignedProfileVersion = profile.getVersion()` at persist time.
- New `HardwareProfileService.isTerminalSynced(PosTerminal)` and `getSyncStatus(String terminalId)` compare a terminal's stamped version against the profile's *current* version. A terminal with no profile is reported as not-in-sync (there's nothing to be "in sync" with on the legacy path — this is a deliberate definition, not an oversight).
- New endpoint: `GET /api/pos/hardware-profiles/sync-status/{terminalId}` → `{terminalId, hardwareProfileId, assignedVersion, currentVersion, inSync}`.

**Migration:** `V26__pos_hardware_profile_versioning.sql` — two `ADD COLUMN IF NOT EXISTS` statements, fully additive, no existing data affected (`version` defaults to 1 for every pre-existing profile row; `assignedProfileVersion` defaults to `NULL`, consistent with "not synced" until a terminal is next (re)assigned).

**Why this matters going forward:** this is the foundation for agent-side config refresh (an agent can poll "is my terminal's config stale?" cheaply via the sync-status endpoint instead of re-fetching and diffing the full profile every time) and for a future Dashboard staleness indicator — neither is built yet, but the data model now supports them without another migration.

### 1.2 Configuration Changed domain event

**What changed:** introduced `PosConfigurationChangedEvent` (a plain POJO — Spring has supported arbitrary event objects since 4.2, no need to extend `ApplicationEvent`) carrying `terminalId, branchId, hardwareProfileId, profileVersion, reason, occurredAt`. `HardwareProfileAssignmentEngine.assign()` publishes one of these via the standard `ApplicationEventPublisher` after a successful assignment (persist + device events + runtime refresh all completed).

**First-of-its-kind in this repo:** I confirmed via a targeted search that no custom domain event or `ApplicationEventPublisher` usage existed anywhere in this codebase before this change — every prior `@EventListener` is a framework lifecycle hook (`ApplicationReadyEvent`, used by the three backfill/seeder/constraint-fixer jobs). This establishes the pattern fresh rather than following an existing convention.

**The stub:** `PosConfigurationChangedEventListener` (`@Component`, `@EventListener`) subscribes and logs at `INFO` — nothing more. This is deliberate, not an oversight: it proves the publish/subscribe wiring works end-to-end (verified by booting the app and by a unit test capturing the published event with an `ArgumentCaptor`) without building the real integrations named in your request — Local Device Agent push, Dashboard live refresh, audit trail, future notifications — none of which this round needs or was asked to build. The class's Javadoc explicitly states its job is to *exist as the documented extension point*, not to be a finished implementation of any of those four.

### 1.3 Testing for the enhancements

5 new tests in `HardwareProfileServiceTest` (version bump on update, version bump on role assignment, sync-status in-sync, sync-status out-of-sync, sync-status with no profile) + 1 new test in `HardwareProfileAssignmentEngineTest` (`successfulAssignmentStampsAssignedProfileVersionAndPublishesConfigurationChangedEvent`, asserting both the stamped version on the returned terminal and the captured event's fields). All pass.

---

## Part 2 — Phase E: Scanner & Cash Drawer

### 2. Files Added

| File | Purpose |
|---|---|
| `db/migration/V27__pos_scanners_cash_drawers.sql` | Creates `pos_scanners` and `pos_cash_drawers`. |
| `pos/scanner/PosScannerConnectionType.java` | Enum `USB, BLUETOOTH`. |
| `pos/scanner/PosScannerInputMode.java` | Enum with exactly one value, `KEYBOARD_WEDGE` — see §3. |
| `pos/scanner/PosScannerStatus.java` | Enum `ACTIVE, INACTIVE, DECOMMISSIONED`. |
| `pos/scanner/PosScanner.java` | The registration entity itself. |
| `pos/scanner/PosScannerRepository.java` | CRUD queries + `findByDeviceId` (the runtime-refresh reverse lookup, mirroring `PosPrinterRepository`'s Phase D addition). |
| `pos/scanner/PosScannerService.java` | CRUD, syncs the shared `PosDevice` parent row on create/update/decommission — mirrors `PosPrinterService`'s Phase A wiring exactly. |
| `pos/scanner/PosScannerController.java` | REST surface, mirrors `PosPrinterController`'s shape. |
| `pos/cashdrawer/PosCashDrawerStatus.java` | Enum `ACTIVE, INACTIVE, DECOMMISSIONED`. |
| `pos/cashdrawer/PosCashDrawerKickResult.java` | Enum `UNKNOWN, SUCCESS, FAILED`. |
| `pos/cashdrawer/PosCashDrawer.java` | The registration entity — `attachedPrinterId` is mandatory (a kick rides the printer's cable). |
| `pos/cashdrawer/PosCashDrawerRepository.java` | CRUD queries + `findByDeviceId`. |
| `pos/cashdrawer/PosCashDrawerService.java` | CRUD + `recordKickResult` (closes the "no confirmation" gap named in the original architecture research). |
| `pos/cashdrawer/PosCashDrawerController.java` | REST surface, including `PUT /{id}/kick-result`. |
| `billbull-backend/src/test/.../scanner/PosScannerServiceTest.java` | 2 tests. |
| `billbull-backend/src/test/.../cashdrawer/PosCashDrawerServiceTest.java` | 5 tests. |
| 3 new tests in `HardwareProfileAssignmentEngineTest` | Scanner refresh, cash-drawer refresh, card-terminal still-not-refreshed (replacing the now-inaccurate `nonPrinterDeviceTypesAreNotRefreshedYet` test). |

No new frontend files — Phase E, like every backend phase before it, ships no UI. A scanner/cash-drawer tab analogous to the existing printer tab in `POSConsole.jsx` is Dashboard-phase (F) work, and — per the v1/v2 architecture research — would be largely cosmetic anyway, since scanning itself needs no driver-level configuration (see §3).

### 3. Files Modified

| File | Exact change | Breaking? |
|---|---|---|
| `pos/devicemanager/HardwareProfileAssignmentEngine.java` | `refreshRuntimeState` rewritten from an `if (type != PRINTER) return` early-exit into a `switch` over `PosDeviceType` with three live cases (`PRINTER`, `SCANNER`, `CASH_DRAWER`) and a `default` no-op for the rest (`CARD_TERMINAL`/`CUSTOMER_DISPLAY`/`SCALE`/`GENERIC`). Constructor gained two new dependencies (`PosScannerRepository`, `PosCashDrawerRepository`). | **No** — the `PRINTER` case's behavior is byte-for-byte identical to before; the new cases only activate for device types that had zero runtime entity (and thus zero behavior) before this phase, so nothing that worked before can have changed. |

No file from Phase A/B/B.5/C/D was otherwise modified. `PosPrinterService`/`PosPrinterController` were **not touched** in this phase.

### 4. Why these are brand-new tables, not a backfill scenario

Unlike `pos_printers` in Phase A — which already had real production rows before `device_id` existed, requiring the `PosPrinterDeviceBackfillSeeder` startup job — `pos_scanners` and `pos_cash_drawers` are **wholly new tables with zero pre-existing rows**. Every row created from this point forward gets its `device_id` set synchronously by `PosScannerService`/`PosCashDrawerService` at creation time (mirroring `PosPrinterService`'s Phase A pattern). **There is no Phase E equivalent of the Phase A backfill seeder, and none is needed** — this is stated explicitly here because it's the kind of gap a reviewer should expect to see addressed, not silently absent.

### 5. Scanner model — deliberately inert by design, not by omission

`PosScanner` is registration metadata only. Per the original architecture research (carried through every phase since): a USB/Bluetooth HID "keyboard wedge" scanner needs no driver and no runtime configuration to actually function — it emulates a keyboard, and the POS's scan input already listens for a fast keystroke burst ending in Enter, completely independent of anything in this new table. `PosScannerInputMode` has exactly one enum value (`KEYBOARD_WEDGE`) specifically to make this explicit in code, not just in a comment — there is no other mode this architecture supports, and adding a scanner row, editing its `connectionType`, or decommissioning it has **zero effect** on how scanning works in the POS UI today. The entity's only value is Device Manager visibility: branch/terminal scoping, Hardware Profile membership, and (once Phase F builds it) dashboard listing.

### 6. Cash drawer model — attached-printer requirement and kick confirmation

`PosCashDrawer.attachedPrinterId` is **mandatory**, not optional, and validated against `PosPrinterRepository` at create/update time (`404` if the referenced printer doesn't exist or is inactive). This directly encodes the real-world constraint already established in every prior phase's documentation: a cash drawer has no standalone "open" connection — its kick rides the same cable as the receipt printer's ESC/POS commands. Modeling it any other way (e.g. an independent device with no required printer link) would misrepresent the actual hardware topology.

`recordKickResult(id, success)` is the confirmation mechanism flagged as missing in the very first architecture research document (the original "no confirmation, only implicit reliance on whether the receipt printed" gap). It stamps `lastKickAt`/`lastKickResult` and logs a `DRAWER_KICK` device event via the existing `PosDeviceEventLogService` — closing that gap, though it's worth being precise about what "closing" means here: **this endpoint only records whatever the calling agent reports**; it doesn't independently verify the drawer physically opened. The actual confirmation signal still has to come from wherever the print agent integration eventually reports back (the same dual-path/interim-agent caveat that's applied to every hardware-execution path since Phase B).

### 7. Runtime Behavior — extending the Phase D bridge

Exactly the same materialization pattern Phase D built for printers now applies to scanners and cash drawers: assigning a Hardware Profile containing a `SCANNER`- or `CASH_DRAWER`-type role slot writes that terminal's `terminalId/branchId/branchName/counterName` onto the matching `PosScanner`/`PosCashDrawer` row (via the new `findByDeviceId` reverse lookups), exactly as it already did for `PosPrinter`. This was the literal Phase D "known limitation" promised to be closed "the same change that builds `PosScanner`/`PosCashDrawer`... should extend `refreshRuntimeState` with the identical pattern" — done as described, no design deviation.

**What's still not refreshed:** `CARD_TERMINAL` (no type-specific entity exists at all — there is no card-terminal phase scheduled yet), `CUSTOMER_DISPLAY`, `SCALE` (both explicitly out of scope, named only as future extension points in the original architecture spec). The `switch`'s `default` branch covers all three with a single no-op, verified by `cardTerminalDeviceTypeIsStillNotRefreshed`.

### 8. Backward Compatibility

No backward-compatibility risk was introduced by Phase E specifically, because there was no prior scanner/cash-drawer runtime behavior to preserve — the "scanner config" that existed before this entire architecture effort began (per the original research) was a frontend-only `localStorage` stub in `POSConsole.jsx` that was already documented as having zero functional effect; this backend phase doesn't touch that frontend code at all, so that stub (if still present) continues to do nothing, same as before. The Phase D backward-compatibility guarantee (a terminal with no Hardware Profile is untouched by any of this machinery) extends unchanged to Phase E's new device types.

### 9. Testing

**Unit tests:** `PosScannerServiceTest` (2), `PosCashDrawerServiceTest` (5), plus 4 net-new/replaced tests in `HardwareProfileAssignmentEngineTest` for the runtime-refresh extension, plus the 6 Phase D enhancement tests from Part 1 — **15 new tests this round, all pass.**

**Full backend suite:** `mvn -o test` → **239 tests run (224 prior + 15 new), 2 failures + 3 errors** — same pre-existing, unrelated `WarehouseServiceTest`/`LedgerServiceBankAccountTest` failures carried through every phase. Zero new regressions. `BillbullBackendApplicationTests.contextLoads` passes.

**Manual verification:**
- `mvn -o compile` — clean.
- Real Spring Boot boot against the configured Postgres datasource, left running ~95s to span a sweep cycle: `Started BillbullBackendApplication`, no `AmbiguousMappingException`, no `BeanCreationException`.
- Live HTTP smoke tests: `POST /api/pos/scanners` → `403`; `GET /api/pos/scanners?branchId=1` → `403`; `POST /api/pos/cash-drawers` → `403`; `PUT /api/pos/cash-drawers/1/kick-result` → `403`; `GET /api/pos/hardware-profiles/sync-status/T001` → `403`. All five are unauthenticated-rejection responses, confirming every new route is registered and security-gated rather than missing or broken.

### 10. Known Limitations

1. **No backend enforcement that a cash drawer's attached printer is itself a `RECEIPT_PRINTER`-type device** — `PosCashDrawerService` only checks the printer exists and is active, not its `deviceType` (e.g. nothing stops attaching a drawer to a `LABEL_PRINTER`, which has no drawer-kick cable in practice). Low practical risk (an operator registering a drawer would presumably pick the right printer), but not validated.
2. **Scanner/cash-drawer CRUD has no dedicated permission**, same standing observation made in every prior phase's review about the printer/print-job/device-manager/hardware-profile endpoints — `isAuthenticated()` only.
3. **`recordKickResult` trusts whatever the caller reports** (§6) — it's a confirmation *record*, not an independent verification mechanism.
4. **No scanner connectivity/health signal** — unlike printers (which get `runtimeStatus` from print-job results, §Phase B) and the generic device health snapshot system (Phase C), nothing currently pushes a health snapshot for a scanner, since there's no agent-side scanner polling defined. A scanner's `PosDevice.runtimeHealth` will sit at whatever the Phase C offline-sweep last set it to (`UNKNOWN` → eventually `OFFLINE` on the first sweep, identical to every never-reporting device — see Phase C's documented "first-sweep event burst" behavior).
5. **The "scanner is inert" framing depends on the existing POS scan-input code continuing to use keystroke-burst detection.** If a future requirement introduces a scanner type that genuinely needs driver-level configuration (e.g. a 2D imager needing a specific decode profile), `PosScannerInputMode`'s single-value enum would need to grow — flagged so a future maintainer doesn't assume the inertness is a permanent architectural law rather than a reflection of today's hardware reality.

### 11. Technical Debt

| Item | Why it exists | When to address | Owning future phase |
|---|---|---|---|
| No `deviceType` check on a cash drawer's attached printer | Not requested, low practical risk | If a misconfiguration is ever actually reported | Whichever phase next touches `PosCashDrawerService` validation |
| No scanner health/connectivity signal | No agent-side scanner polling exists yet | When/if a real Local Device Agent update adds scanner presence detection | The same (unscheduled) phase that builds the real polling agent, tracked since Phase B's technical debt table |
| `PosConfigurationChangedEventListener` is a log-only stub | Deliberately scoped per your request — "may initially be a stub" | When the Local Device Agent, Dashboard, audit, or notification integrations are actually built | Phase F (Dashboard) for the dashboard-refresh listener; the agent-update phase for the agent-push listener; unscheduled for audit/notifications |
| No "unassign profile" endpoint (carried over from Phase D, unchanged) | Out of this round's scope | Same as Phase D's entry | Phase F |
| Sync-status is pull-only (no push when a profile becomes stale) | The Configuration Changed event (Part 1.2) is the seam for this, but nothing consumes it yet beyond the log stub | Once a real subscriber exists to act on staleness | Phase F / agent-update phase |

### 12. Phase E Acceptance Checklist

| Item | Status |
|---|---|
| Hardware Profile versioning implemented and tested | ✔ |
| Configuration Changed event published and tested (stub subscriber, by design) | ✔ |
| Database migrations safe (additive, idempotent, no existing table altered) | ✔ |
| No backfill gap for new tables (verified there's nothing to backfill) | ✔ |
| Scanner registration correctly inert at runtime (verified by design + tests) | ✔ |
| Cash drawer attached-printer requirement enforced | ✔ |
| Cash drawer kick confirmation mechanism exists | ✔ |
| Hardware Profile runtime refresh extended to SCANNER/CASH_DRAWER | ✔ |
| CARD_TERMINAL/CUSTOMER_DISPLAY/SCALE correctly still not refreshed (no entity yet) | ✔ |
| No regression to Phase A/B/B.5/C/D functionality | ✔ |
| No API regression | ✔ |
| No UI work (correctly out of scope) | ✔ |
| Tests passed (15 new, 239 total, same pre-existing unrelated failures) | ✔ |
| Ready for Phase F | ✔ |

---

Phase E (and the two Phase D enhancements) are complete. Awaiting review before proceeding to the Device Dashboard phase (F) per the roadmap.
