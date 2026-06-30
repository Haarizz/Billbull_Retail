# POS Device Manager — Phase D Review Report

Date: 2026-06-30
Scope: Phase D only ("Hardware Profiles" — [pos-device-architecture-specification-v2-2026-06-30.md](pos-device-architecture-specification-v2-2026-06-30.md) §5/§14/§16). Builds on completed and approved [Phase A](pos-device-phase-a-review-2026-06-30.md), [Phase B/B.5](pos-device-phase-b-review-2026-06-30.md), and [Phase C](pos-device-phase-c-review-2026-06-30.md). The Device Dashboard phase (F) has not started.

---

## 1. Files Added

| File | Purpose |
|---|---|
| `db/migration/V25__pos_hardware_profiles.sql` | Creates `pos_hardware_profile`, `pos_hardware_profile_device`, adds `pos_terminals.hardware_profile_id`. |
| `pos/devicemanager/PosHardwareProfileStatus.java` | Enum `ACTIVE, INACTIVE, DECOMMISSIONED`. |
| `pos/devicemanager/PosHardwareProfile.java` | The reusable profile entity itself — name, optional branch scope, status. |
| `pos/devicemanager/PosHardwareProfileDevice.java` | One role slot within a profile (e.g. `PRIMARY_RECEIPT_PRINTER` → device #7). |
| `pos/devicemanager/PosHardwareProfileRepository.java` | Branch-scoped + global-template queries. |
| `pos/devicemanager/PosHardwareProfileDeviceRepository.java` | Role-slot lookups, including reverse lookup by device (needed for conflict detection). |
| `pos/devicemanager/HardwareProfileService.java` | CRUD for profiles + role-slot assignment. Owns name-uniqueness validation; does not touch terminals. |
| `pos/devicemanager/HardwareProfileAssignmentEngine.java` | The assignment workflow itself — see §5. |
| `pos/devicemanager/HardwareProfileController.java` | REST surface for both of the above. |
| `billbull-backend/src/test/.../devicemanager/HardwareProfileServiceTest.java` | 6 tests. |
| `billbull-backend/src/test/.../devicemanager/HardwareProfileAssignmentEngineTest.java` | 11 tests. |

No new frontend files — Phase D, like A/B/C, is backend-only. A "pick a profile and assign it" UI is Dashboard-phase (F) work.

---

## 2. Files Modified

| File | Exact change | Breaking? |
|---|---|---|
| `pos/terminal/PosTerminal.java` | Added one nullable field: `hardwareProfileId` (`Long`) + getter/setter. | **No** — additive field, default `null`. Existing terminal rows are unaffected; `PosTerminalService`/`PosTerminalController` (zero-trust registration, rename, status, set-main) were **not touched at all**. |
| `pos/terminal/PosTerminalRepository.java` | Added one query method: `findByHardwareProfileId(Long)`. | **No** — new method only, used solely by the assignment engine's conflict detection. |
| `pos/printer/PosPrinterRepository.java` | Added one query method: `findByDeviceId(Long)`. | **No** — new method only, used solely by the assignment engine's runtime-refresh step. `PosPrinterService` was **not touched**. |

No file from Phase A/B/B.5/C was otherwise modified. No frontend file was touched.

---

## 3. Database Design

```sql
pos_hardware_profile
  id, created_at, ..., is_active,
  profile_name VARCHAR(120) NOT NULL,
  branch_id    BIGINT,                 -- NULL = global template assignable to any branch
  description  VARCHAR(500),
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
  -- partial unique index: (branch_id, profile_name) WHERE branch_id IS NOT NULL

pos_hardware_profile_device
  id, created_at, ..., is_active,
  hardware_profile_id BIGINT NOT NULL REFERENCES pos_hardware_profile(id),
  device_id            BIGINT NOT NULL REFERENCES pos_devices(id),
  role                  VARCHAR(50) NOT NULL,
  UNIQUE (hardware_profile_id, role)    -- one device per role per profile

pos_terminals
  + hardware_profile_id BIGINT REFERENCES pos_hardware_profile(id)   -- nullable, additive
```

**Why `branch_id` is nullable on the profile itself, not a hard requirement:** this directly realizes the v2 spec's reusability requirement (§5: "A profile should represent a reusable hardware configuration that can be assigned to multiple terminals") — a `branch_id IS NULL` profile is a global template (e.g. "Standard Counter") that any branch's terminals can adopt, while a `branch_id`-scoped profile is specific to one branch's hardware. `HardwareProfileService.listForBranch(branchId)` returns the union of both, which is what a "pick a profile for this terminal" UI would need later.

**The partial unique index** (`WHERE branch_id IS NOT NULL`) is a known, deliberate limitation: Postgres treats every `NULL` as distinct, so a plain `UNIQUE(branch_id, profile_name)` would **not** catch two global templates both named "Standard Counter" — only branch-scoped duplicates are protected at the DB level. `HardwareProfileService.validateUniqueName` closes this gap at the application layer (it explicitly checks the global-template set in Java when `branchId == null`), so duplicate prevention is enforced either way — just by two different mechanisms depending on scope, which is documented here rather than left implicit.

**Why a role is a free-text `VARCHAR`, not an enum:** roles like `PRIMARY_RECEIPT_PRINTER`/`KITCHEN_PRINTER_1`/`SCANNER_1` are open-ended by design (the spec's own examples include numbered roles for multiple printers of the same kind) — an enum would need a migration every time a new role naming convention is needed. Uniqueness is enforced per-profile via the DB constraint, not vocabulary.

**Migration safety:** identical pattern to V22–V24 — every statement is `CREATE TABLE/INDEX IF NOT EXISTS` or `ADD COLUMN IF NOT EXISTS`, fully additive, no existing table/column altered or dropped. The two new FKs (`pos_hardware_profile_device.device_id → pos_devices.id`, `pos_terminals.hardware_profile_id → pos_hardware_profile.id`) only matter at write time. As with every migration since V22, this repo's `spring.flyway.enabled=false` default means the schema is actually realized via Hibernate `ddl-auto=update` reading the entity annotations rather than Flyway executing this script — and, like V23/V24, this migration carries **no DML**, so there is no Phase-A-style backfill gap here.

**Rollback strategy:** `ALTER TABLE pos_terminals DROP COLUMN hardware_profile_id`, then drop both new tables — safe at any point, since nothing outside Phase D's own files reads `hardware_profile_id` or either table (the runtime-refresh bridge writes *to* `pos_printers`, not the reverse — dropping the profile tables doesn't orphan anything in `pos_printers`, it just stops future syncs).

---

## 4. Assignment Workflow

`HardwareProfileAssignmentEngine.assign(terminalId, profileId)` — a single `@Transactional` method, in this exact order:

1. **Validate the terminal** — must exist (`404`), must not be `BLOCKED`/`DECOMMISSIONED` (`409`).
2. **Validate the profile** — must exist and be `ACTIVE` (`404`/`409`).
3. **Validate the profile isn't empty** — a profile with zero role slots is rejected (`400`) rather than silently "succeeding" at assigning nothing.
4. **For every role slot in the profile:**
   a. **Validate device availability** — the device must exist and be `ACTIVE` (`409` naming the specific role/device that's unavailable).
   b. **Detect conflicts** — see §6.
5. **Persist** — `terminal.hardwareProfileId = profile.id`, single save.
6. **Generate device events** — one `CONFIGURATION_UPDATED` event per device (via the existing `PosDeviceEventLogService` built in Phase A), tagged `hardwareProfileAssign:{profileId}:role={role}`.
7. **Refresh runtime state** — see §7.

All validation happens **before** any write — if any role slot fails validation or detects a conflict, the whole assignment is rejected and nothing is persisted (the `@Transactional` boundary also guarantees this at the DB level even if a later step somehow threw).

---

## 5. Validation Rules

| Rule | Enforced by | HTTP status on failure |
|---|---|---|
| Terminal must exist | `validateTerminal` | 404 |
| Terminal must not be BLOCKED or DECOMMISSIONED | `validateTerminal` | 409 |
| Profile must exist | `validateProfile` | 404 |
| Profile must be ACTIVE | `validateProfile` | 409 |
| Profile must have at least one role slot | `assign` (top-level check) | 400 |
| Every role's device must exist | `validateDeviceAvailable` | 409 (phrased as the slot pointing at a device that no longer exists — a data-integrity case, not a normal validation failure) |
| Every role's device must be ACTIVE | `validateDeviceAvailable` | 409, names the device and role |
| Profile name required, non-blank | `HardwareProfileService.create/update` | 400 |
| Profile name unique within its scope (branch or global) | `HardwareProfileService.validateUniqueName` | 409 |
| Role required on slot assignment | `HardwareProfileService.assignDeviceToRole` | 400 |
| Device required on slot assignment | `HardwareProfileService.assignDeviceToRole` | 400 |
| Device referenced in slot assignment must exist | `HardwareProfileService.assignDeviceToRole` | 404 |

---

## 6. Conflict Detection

A device conflicts if it's claimed by a **different** profile that is **currently assigned to a different, non-decommissioned terminal**:

```
for each device D in the profile being assigned:
    for each OTHER profile P' that also has a role slot pointing at D:
        for each terminal T' currently bound to P':
            if T' == the terminal being assigned to        -> not a conflict (switching this
                                                                 terminal's own profile)
            if T'.status == DECOMMISSIONED                  -> not a conflict (a decommissioned
                                                                 terminal's old binding doesn't
                                                                 block reuse of its hardware)
            otherwise                                        -> 409 Conflict, names the device
                                                                 and the conflicting terminal
```

**What this deliberately allows:** the same physical device can appear in more than one profile (e.g. a shared spare-printer profile used as a fallback by several counters) without any conflict, as long as only one of the terminals using those profiles is actually active/bound at a time. **What this deliberately rejects:** two different terminals simultaneously claiming the same physical printer as, say, their `PRIMARY_RECEIPT_PRINTER` via two different profiles — a real-world impossibility (a printer can only sit at one counter) that the engine catches before persisting anything.

**Idempotent re-assignment:** assigning a terminal to the *same* profile it's already on is always allowed — the conflict check explicitly skips a slot's binding to the terminal currently being assigned (`otherTerminal.getId().equals(terminal.getId())` → skip), so re-running the same assignment (e.g. retrying after a transient error) never falsely conflicts with itself.

---

## 7. Runtime Behavior — what "refresh runtime state" actually does

Rather than inventing a new runtime-resolution path the frontend would need to learn, assigning a profile **materializes each profile device's role onto the exact same fields the existing direct-assignment model already reads**: `PosPrinter.terminalId`, `branchId`, `branchName`, `counterName`. Concretely, for every `PRINTER`-type device in the profile, the engine finds that device's `PosPrinter` row (via the new `findByDeviceId` reverse lookup) and overwrites those four fields to match the terminal being assigned.

**Why this matters:** the frontend's existing `resolvePrinterForContext` (in `localPrintAgent.js`, built long before this phase) already ranks printers by `terminalId`/`branchId`/`defaultPrinter`. By writing into the *same* fields it already reads, a Hardware Profile assignment takes effect for receipt printing **immediately, with zero frontend changes** — the POS UI doesn't need to know Hardware Profiles exist yet.

**Known, documented limitation:** this only works for `PosDeviceType.PRINTER` today, because `PosPrinter` is the only type-specific entity that exists. A `SCANNER`/`CASH_DRAWER`/`CARD_TERMINAL` role slot in a profile is fully persisted (the slot row, the device event) but has **no runtime entity to refresh** — `refreshRuntimeState` explicitly no-ops for any non-`PRINTER` device type (verified by `nonPrinterDeviceTypesAreNotRefreshedYet`). This isn't a bug; those entities don't exist until Phase E builds them, at which point the exact same sync pattern applies.

---

## 8. Backward Compatibility

This was a hard requirement, treated as such throughout:

- **`PosTerminal.hardwareProfileId` is nullable and defaults to unset.** A terminal that has never been assigned a profile is completely untouched by any Phase D code — `PosTerminalService`/`PosTerminalController` (registration, rename, status, set-main) were not modified at all, and the frontend's existing printer-resolution path keeps working exactly as it always has.
- **No flag-day cutover, no migration script forcing existing terminals onto a profile.** Adoption is purely additive and per-terminal: call `POST /api/pos/hardware-profiles/{id}/assign/{terminalId}` whenever a given terminal is ready to move; everything else keeps running on the legacy direct-assignment model in the meantime.
- **The assignment engine never deletes or weakens the legacy path.** Even after a terminal is assigned a profile, the printer rows it touches still have a normal `terminalId`/`branchId`/`counterName` — those fields are simply now *kept in sync by the profile* rather than hand-edited per printer. An operator could, in principle, still hand-edit a printer's `terminalId` directly via the existing `PosPrinterController` after a profile assignment; the next profile (re-)assignment would overwrite it back to match the profile. This precedence (profile wins on assignment) is implicit in the current design and worth knowing, not hidden — see Known Limitations.

---

## 9. Testing

**Unit tests:** `HardwareProfileServiceTest` (6) + `HardwareProfileAssignmentEngineTest` (11) — **17 new tests, all pass.** Coverage:
- Service: blank-name rejection, duplicate-name-within-branch rejection, same-name-different-branch allowed, unknown-device rejection on role assignment, new-slot creation, existing-slot replacement (same role, different device).
- Engine: unknown terminal, blocked terminal, unknown profile, inactive profile, empty profile, inactive device, conflict with another active terminal's profile, idempotent same-terminal-same-profile reassignment, decommissioned-terminal conflict exemption, full successful assignment (persist + event logged + printer runtime fields refreshed), non-printer device type correctly skipped during runtime refresh.

**Full backend suite:** `mvn -o test` → **224 tests run (207 prior + 17 new), 2 failures + 3 errors** — same pre-existing, unrelated `WarehouseServiceTest`/`LedgerServiceBankAccountTest` failures carried through every phase. Zero new regressions. `BillbullBackendApplicationTests.contextLoads` passes.

**Manual verification:**
- `mvn -o compile` — clean.
- Real Spring Boot boot against the configured Postgres datasource: `Started BillbullBackendApplication`, no `AmbiguousMappingException`, no `BeanCreationException`.
- Live HTTP smoke tests against the running instance: `POST /api/pos/hardware-profiles` → `403`; `GET /api/pos/hardware-profiles?branchId=1` → `403`; `POST /api/pos/hardware-profiles/1/devices` → `403`; `POST /api/pos/hardware-profiles/1/assign/T001` → `403`. All four are unauthenticated-rejection responses, confirming the routes are registered and security-gated rather than missing or broken.

---

## 10. Known Limitations

1. **Runtime refresh only covers `PRINTER`-type devices** (§7) — scanner/cash-drawer/card-terminal role slots are persisted but inert at runtime until Phase E.
2. **No "unassign profile from terminal" endpoint.** A terminal currently can only move *to* a profile (or to a different profile, overwriting the old binding); there's no explicit `DELETE` that returns a terminal to "no profile / legacy mode." Re-assigning a profile is fully supported; reverting to *no* profile is not exposed as an action (would currently require a direct DB write or a small follow-up endpoint).
3. **Profile precedence after manual printer edits isn't enforced, only directional.** If an operator hand-edits a `PosPrinter`'s `terminalId` via the existing printer-config UI/API after a profile assignment, nothing currently re-syncs it back — the drift is only corrected the next time that *same* profile is (re-)assigned to that terminal. There's no "this printer's terminal scope is locked because it's profile-managed" guard.
4. **`HardwareProfileService.validateUniqueName`'s global-template check is an in-memory `findAll()` filter**, not a dedicated repository query — consistent with the same pragmatic style already used in Phase A's `DeviceManager.getDashboard` and Phase A's `validateUniqueName`-equivalent in `PosPrinterService`, fine at this scale, but worth knowing if the global-template set ever grows large.
5. **No bulk "clone this profile" or "apply this profile to every terminal in a branch" operation.** Each assignment is one terminal at a time via the `assign` endpoint; multi-terminal rollout is a per-terminal API call today.

---

## 11. Technical Debt

| Item | Why it exists | When to address | Owning future phase |
|---|---|---|---|
| No "unassign" endpoint | Wasn't asked for in this phase's scope; assign-to-a-different-profile covers the common case | When an operator-facing "revert to legacy/no profile" need is identified, likely surfaced by Phase F's dashboard | Phase F (Device Dashboard) |
| Runtime refresh limited to PRINTER | Other device-type entities don't exist yet | The same change that builds `PosScanner`/`PosCashDrawer`/`PosCardTerminal` should extend `refreshRuntimeState` with the identical pattern | Phase E (Scanner & Cash Drawer registration) and the (unscheduled) Card Terminal phase |
| No drift-reconciliation between profile and manually-edited printer rows | Out of scope for this phase; the existing printer CRUD wasn't restricted | If profile-managed drift becomes a real operational problem, add either a guard on direct printer edits or a periodic reconciliation sweep (same `@Scheduled` pattern already used three times in Phases B.5/C) | Whichever phase first needs to make profile assignment authoritative rather than advisory |
| No bulk-apply-to-branch operation | Single-terminal `assign` endpoint covers the immediate need; bulk rollout UX wasn't specified | When the Dashboard (Phase F) wants a "roll this profile out to every terminal in this branch" button | Phase F |

---

Phase D is complete. Awaiting review before proceeding to the Device Dashboard phase (F) per the roadmap.
