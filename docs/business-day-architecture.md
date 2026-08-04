# POS Business Day Architecture

**Status:** Phase 1 (infrastructure), Phase 2 (read-only status integration, shadow mode), Phase 3A (Business Day persistence on new sessions), Phase 3B.1 (Previous Unclosed Business Day detection), Stage 3B.2A (Shadow Validation), Stage 3B.2A.5 (feature flag infrastructure), Stage 3B.2A.6 (Infrastructure Failure Policy), and **Stage 3B.2B (Enforcement, feature-flag controlled)** implemented and shipped. `BusinessDayFeatureFlagService.isLoginGateV2Enabled(branchId)` now actually gates `openSession()`'s decision: for any branch with the flag OFF (the default — every branch today), behavior remains byte-identical to Stage 3B.2A.6. For a branch with the flag ON, `BusinessDayValidationService`'s verdict becomes authoritative, with the documented fail-open (Infrastructure Failure → legacy fallback) / fail-closed (`UNEXPECTED_STATE` → block) policy now actually implemented, not just designed. No branch's flag has been enabled outside test environments as of this writing — enabling any branch's flag is a live, production-facing decision and must follow the shadow-soak runbook's rollout procedure.
**Authoritative reference** for all later Business Day phases. Update this document as each phase lands.

## 1. Why This Exists

The POS previously drove Day Close, session dating, and login gating off `PosBusinessDate.currentBusinessDate` — a per-branch pointer advanced by exactly one calendar day at the tail of every Day Close (`PosBusinessDateService.advanceBusinessDate`). This unconditionally manufactured a "Business Day" for every calendar date a branch passed through, whether or not it ever traded — the root cause of the original Skip Date workflow, and, even after Skip Date's removal via `PosSession.tradingDate`, the source of a further defect in how overnight-crossing shifts were dated.

The Business Day Engine replaces that model with a **computed, on-demand** definition: a Business Day is not counted forward — it is only ever what a real session's opening moment resolves to, under the branch's configured trading-hours window.

## 2. Terminology

| Term | Definition |
|---|---|
| **Candidate Business Day** | The `LocalDate` `BusinessDayResolver` computes from a timestamp + `BusinessDaySettings`. A *proposal only* — carries no state, commits nothing, and may never become Active if validation fails or no session is ultimately created. |
| **Active Business Day** | The Business Day a branch is actually operating under — evidenced by at least one committed `PosSession` bearing that date, with no matching `PosDayClose` yet. Comes into existence **only** at the moment a session is successfully persisted — never at resolver-execution time, never at login-screen render time, never on first sale. |
| **No Active Business Day** | The branch's resting state: every session-bearing date has been closed, or no session has ever been created. This is the default state, not an edge case. |
| **Previous Unclosed Business Day** | An Active (or past) Business Day that has sessions but no matching `PosDayClose` — the thing that must block a new Candidate Business Day from becoming Active. |

Never use "Business Day" unqualified in code, comments, or discussion once later phases wire this in — always say *Candidate* or *Active* so the two are never conflated.

## 3. Business Day Lifecycle

```
No Active Business Day
   │
Login attempt
   │
   BusinessDayResolver.resolve(now, settings) → Candidate Business Day D
   │
   BusinessDayStateService: previous unclosed Business Day exists?
   │
   ├── YES, and it != D ──► BLOCK: "Previous Business Day (X) must be closed."
   │                         (D is discarded — no state change)
   │
   └── NO (or already == D)
        │
        Session creation attempted
        │
        ├── fails (lock conflict / discovery-blocked / DB error) ──► no state change,
        │                                                             D never became Active
        │
        └── succeeds — PosSession committed, dated D
             │
             ▼
        Active Business Day = D          ← activation happens HERE only
             │
        Sales / additional sessions open on D (each independently resolves
        Candidate Business Day = D, confirming rather than re-activating)
             │
        Day Close performed for D
             │
        PosDayClose(closeDate=D) committed
             │
             ▼
        No Active Business Day
```

**Gap example** (the scenario this architecture exists for): branch closes June 21, no sessions June 22/23. State stays "No Active Business Day" through both — nothing is ever computed or stored for them, because `BusinessDayResolver` is only ever invoked when a real session-open attempt happens. On June 24, the first login attempt resolves Candidate Business Day = June 24, finds June 21 still unclosed, and blocks until it's closed — then the same attempt succeeds and June 24 (not June 22/23) becomes Active.

**Overnight example**: Business Day window 08:00 → 02:00. Terminal A opens 11:00 PM July 29 → Candidate = July 29. Terminal B opens 12:30 AM July 30 (same overnight window) → Candidate = July 29 too (the early-morning tail of yesterday's window). Both sessions correctly land on the same Business Day.

## 4. Design Rules (the ten Business Day invariants)

1. A Business Day is never created by advancing a pointer — it exists only because a session was committed against it.
2. `BusinessDayResolver` is a pure function: no repository access, no Spring state, no database access, thread-safe, deterministic for a given `(timestamp, settings)` pair.
3. `BusinessDayResolver`'s output is always a Candidate — never persisted or treated as fact by the resolver itself.
4. Activation is a side effect of successful session creation, never of computation, validation, or login-screen rendering.
5. "Active Business Day" is a derived query (`BusinessDayStateService`), never stored state — there is no table row meaning "the current Business Day."
6. `BusinessDayStateService` reports on state; it does not own, create, or mutate it.
7. Business Day Settings (`operatingHoursEnabled`/`operatingStartTime`/`operatingEndTime`) are the sole authority for what `BusinessDayResolver` computes — no other input influences a Candidate Business Day.
8. Overnight-window detection has exactly one implementation (`PosOperatingHoursCalculator.isOvernightWindow`), shared by every component that needs it — never re-derived independently.
9. `sessionDate` (the accounting bucket) and `tradingDate`/Business Day (the Day Close domain's date) remain deliberately separate fields — this project does not merge them; their consumers are disjoint and reviewed separately.
10. Nothing in the Business Day Engine changes runtime behavior until a phase explicitly and narrowly wires a specific piece of it into a specific decision path — every other phase stays purely additive, and each wiring step must leave existing tests green and change only the one decision it was scoped to. (Phase 3B.1 is the first exception: it wires `BusinessDayStateService` into exactly one decision inside `openSession()` — see §11.)

## 5. Components (Phase 1)

| Component | File | Role |
|---|---|---|
| `BusinessDaySettings` | `pos/businessdate/BusinessDaySettings.java` | Immutable value object (`enabled`, `startTime`, `endTime`) decoupling the resolver from the `PosSettings` JPA entity. `BusinessDaySettings.from(PosSettings)` factory. |
| `BusinessDayResolver` | `pos/businessdate/BusinessDayResolver.java` | Pure static `resolve(LocalDateTime, BusinessDaySettings) -> LocalDate`. Reuses `PosOperatingHoursCalculator.isOvernightWindow` — never duplicates the overnight rule. |
| `PosOperatingHoursCalculator.isOvernightWindow` | `pos/businessdate/PosOperatingHoursCalculator.java` | Extracted from the existing `isWithinOperatingHours`, behavior-preserving — the single shared definition of "does this window cross midnight." |
| `BusinessDayStateService` | `pos/businessdate/BusinessDayStateService.java` | Read-only Spring service: `findUnclosedBusinessDay(branchId)`, `hasNoActiveBusinessDay(branchId)`, plus `logShadowComparison(...)` for future shadow-mode wiring. |
| `PosSessionRepository.findOldestUnclosedTradingDate` | `pos/session/PosSessionRepository.java` | New query backing `BusinessDayStateService` — oldest `tradingDate` with no matching `PosDayClose`. |

**Deliberately reuses `tradingDate`**, not a new column — per invariant 9, `sessionDate`/`tradingDate` stay separate, and `tradingDate` already represents exactly what a Business Day should mean for Day Close purposes. No migration was needed for Phase 1.

## 6. Shadow Mode

Nothing in Phase 1 is called from a production decision path. `BusinessDayStateService.logShadowComparison(branchId, currentPointer, candidate)` exists and is unit-tested, but is invoked by nothing in production — it's built so a later phase can call it alongside existing `PosBusinessDateService` call sites (e.g. inside `PosDayStatusService` or `openSession()`) to log, at DEBUG level only, how the legacy pointer's answer compares to the new engine's answer on live traffic, before anything depends on the new engine's answer.

## 7. What Changed vs. What Didn't

**Changed (all additive):**
- New files: `BusinessDaySettings.java`, `BusinessDayResolver.java`, `BusinessDayStateService.java`, plus three new test classes.
- `PosOperatingHoursCalculator.java`: internal refactor only (`isWithinOperatingHours`'s same-day branch now calls the extracted `isOvernightWindow` instead of inlining `start.isBefore(end)`) — behavior-preserving, verified by `PosOperatingHoursCalculatorTest`.
- `PosSessionRepository.java`: one new query method, `findOldestUnclosedTradingDate`.

**Unchanged — verified by the full existing test suite passing unmodified:**
- Login, `openSession()`, session opening, Day Close, Pending Day Close, `PosBusinessDate`/`PosBusinessDateService`/`advanceBusinessDate()`, Day Status, Reports, Cash Movements, X-Reports, Z-Reports, GL, Inventory, and every existing API contract.

## 8. Phase 2 — Read-Only Status Integration (Shadow Mode)

**Goal:** prove the engine against live production traffic through the informational Day Status endpoint only, with zero effect on any operator-facing decision.

**What changed:**
- `PosDayStatusService` now additionally computes, per `GET /api/pos/sessions/day-status` request: `candidateBusinessDay` (`BusinessDayResolver.resolve(now, BusinessDaySettings.from(settings))`) and `activeBusinessDay`/`hasActiveBusinessDay` (`BusinessDayStateService.findUnclosedBusinessDay(branchId)`).
- `DayStatusResponse` gained four new fields — `candidateBusinessDay`, `activeBusinessDay`, `hasActiveBusinessDay`, `businessDaySource` — additive, no existing field removed or reinterpreted.
- `BusinessDayStateService` gained `recordShadowValidation(branchId, legacyBusinessDate, candidateBusinessDay, overnightWindowConfigured)` and `recordNoActiveBusinessDay(branchId)`: always-on Micrometer counters (`businessday.shadow.match`, `businessday.shadow.differ`, `businessday.shadow.no_active_business_day`, `businessday.shadow.overnight_resolution`), plus a DEBUG-only log line emitted **only when the legacy pointer and the Candidate Business Day disagree** — never on every request.

**Per-field source (Day Status response):**

| Field | Source | Changed in Phase 2? |
|---|---|---|
| `currentBusinessDate` | `PosBusinessDateService.getCurrentBusinessDate` | No — unchanged |
| `businessDateStatus` | `PosBusinessDateService.isDateClosed` | No — unchanged |
| `blocked` | Operating-hours + stale-session check, keyed on the legacy pointer's `businessDate` | No — unchanged |
| `totalOpenSessions`, `openSessions`, `currentTerminalSession` | `PosSessionRepository`, keyed on the legacy pointer's `businessDate` | No — unchanged |
| `pendingDayCloseDate`, `hasPendingDayClose` | `PosPendingDayCloseResolver` (Day Close domain, `tradingDate`-based) | No — unchanged, pre-existing from an earlier project |
| `candidateBusinessDay` | **New** — `BusinessDayResolver` | New field |
| `activeBusinessDay`, `hasActiveBusinessDay` | **New** — `BusinessDayStateService` | New field |
| `businessDaySource` | Constant `"LEGACY_POINTER"` — documents that every decision-bearing field above is still pointer-driven | New field |

**Current coexistence model:**
- Services still fully on the legacy pointer for every decision: `PosSessionService.openSession()` (login/session-opening gate), `closeDay()`/`resolveSessionRange()` (unaffected — already `tradingDate`-based from an earlier project, not part of this Business Day Engine work), `PosDayStatusService`'s `blocked`/`currentBusinessDate`/`businessDateStatus`.
- Services now also consuming the Business Day Engine (read-only, observational): `PosDayStatusService` (Phase 2, this phase).
- Metrics/logs are safe to enable in production immediately — they add read-only queries (`findOldestUnclosedTradingDate`) and counter increments per Day Status call, no writes, no new decisions.

## 9. Phase 3A — Business Day Persistence

**Goal:** start writing a trustworthy, resolver-computed Business Day onto every new session, without any consumer reading it differently than before. Pure data accumulation — this phase creates data, it does not spend it.

**Field decision:** no new column was introduced. `PosSession.tradingDate` — already the Day Close domain's agreed target field from an earlier project — is now populated from `BusinessDayResolver.resolve(now, BusinessDaySettings.from(settings))` instead of a raw `now.toLocalDate()` stamp. This is the "leave the existing field, document that it now represents Business Day" path explicitly preferred over adding a duplicate column.

**What changed:** `PosSessionService.openSession()` — immediately before `PosSession` is constructed, computes `candidateBusinessDay` via the resolver (reusing the `PosSettings` snapshot the method already loads for idle-timeout purposes — no extra query) and writes it to `session.tradingDate`. Immediately after `repo.save(session)`, calls `BusinessDayStateService.recordShadowValidation(branchId, legacyBusinessDate, candidateBusinessDay, overnightWindowConfigured)` — diagnostics only, matching the Phase 2 pattern (always-on counters, DEBUG-only log on divergence).

**What did not change:** `sessionDate` (still the pointer-derived accounting bucket, written exactly as before); the pointer-gating logic (`getCurrentBusinessDate`/`isDateClosed`, still called identically); the stale-session guard; terminal locking/discovery/roaming; `resolveSessionRange()`, `closeDay()`, `PosPendingDayCloseResolver`, Day Close Summary, Z-Report generation, X-Reports, cash movements, GL, inventory, reports — **none of these were touched**, and none of them read `tradingDate` any differently than before this phase (they already read it, from the prior `tradingDate` project; this phase only changed *what value* gets written at creation time, not who reads it or how).

**Practical impact today:** for any branch without operating-hours configured (`operatingHoursEnabled=false`, the default on every install), `BusinessDayResolver.resolve` returns exactly `now.toLocalDate()` — byte-identical to the old stamp. **Zero observable change for the default configuration.** For a branch that has explicitly configured an overnight operating-hours window, the persisted `tradingDate` will now correctly reflect the Business Day per that window rather than the raw calendar date of the timestamp — this is a disclosed, intentional consequence of consolidating on the agreed target field, not an accidental side effect. No branch is known to have such a configuration in production at the time of this phase; if one exists, Day Close's grouping for that branch's *future* sessions will begin reflecting the corrected value.

**Immutability:** `tradingDate` is set exactly once, at `openSession()`, and no other method in the codebase calls `PosSession.setTradingDate(...)` afterward (verified by repo-wide search) — `closeSession()`, `suspendSession()`, `resumeSession()`, `supervisorTakeover()`, `transferSession()` all leave it untouched, confirmed by `tradingDateIsNeverModifiedByCloseSession` in `PosSessionServiceTest`. If Business Day Settings change later, only sessions created after the change pick up the new configuration — every already-persisted `tradingDate` value is permanent.

## 10. Phase 3B — Scope Correction: "Business Day Lifecycle Integration"

A post-3A consumer audit found that `resolveSessionRange()`, `closeDay()`, `PosPendingDayCloseResolver`, Day Close Summary, and dynamic Z-Report generation were **already** reading `tradingDate` before Phase 3A — that wiring is from an earlier project, not unstarted work. Phase 3A only changed the *value* flowing into that already-live pipeline (conditionally, for overnight-configured branches — see §9). There is nothing left in the Day Close domain to migrate.

**Phase 3B is therefore renamed from "Day Close Migration" to "Business Day Lifecycle Integration."** The real remaining work is entirely at the session-creation/login boundary: Previous Unclosed Business Day detection, the login/session-opening gate itself, and Day Status's decision-bearing fields. It is split into sub-phases by risk:

- **3B.1** (this phase) — Previous Unclosed Business Day detection only.
- **3B.2, Stage A** — Shadow Validation: a new `BusinessDayValidationService` computes a full Candidate-Business-Day-aware verdict (`ALLOW`/`WOULD_BLOCK_PREVIOUS_DAY`/`WOULD_BLOCK_ALREADY_CLOSED`/`UNEXPECTED_STATE`) and records it, but never drives the real decision.
- **3B.2, Stage B** — Enforcement: `BusinessDayValidationService` becomes authoritative for the login/session-opening gate, flagged, pilot-branch-first.
- **3B.3** — Day Status's `currentBusinessDate`/`businessDateStatus`/`blocked` fields stop computing a second, separate answer and reflect what the (by then authoritative) engine used.

## 11. Phase 3B.1 — Previous Unclosed Business Day Detection

**Goal:** migrate exactly one responsibility — "does a previous Business Day remain unclosed" — from the legacy pointer-based scan to `BusinessDayStateService`. Nothing else changes.

**What changed:** `PosSessionService.openSession()`'s "0b" guard (`PosSessionService.java`, ~line 257) now sources its detection from `businessDayStateService.findUnclosedBusinessDay(branchId)` instead of `repo.findUnclosedSessionsBeforeDate(branchId, businessDate)`. The gate condition mirrors the legacy query's semantics exactly: an unclosed day only blocks if it is **strictly before** the current Business Date pointer (`isPriorUnclosedDay = unclosedBusinessDay.isPresent() && unclosedBusinessDay.get().isBefore(businessDate)`) — an unclosed day equal to today's own in-progress pointer value must never block a second session opening the same day. This mirroring was essential: `BusinessDayStateService.findUnclosedBusinessDay` reports *any* unclosed date (today's included, since Day Close naturally hasn't run yet mid-shift), unlike the legacy query which only ever looked *before* the pointer — a naive presence-only swap would have blocked every session after the first, every day. The blocking session's details (id, terminal, status) needed for the identical error message are fetched via the existing `findByBranchIdAndTradingDateOrderByOpenedAtDesc` query (already present from the Day Close domain — no new query written), picking the earliest-opened session for message parity with the legacy "oldest" pick.

**Why `BusinessDayStateService` is now authoritative for this one question:** it already existed (Phase 1) specifically to answer "does this branch have an unclosed Business Day" via `findOldestUnclosedTradingDate` — a session-driven query, immune to the pointer's own staleness. Using it here is the direct, minimal-risk application of the engine to the one place in `openSession()` that was asking exactly this question by hand by scanning `sessionDate`.

**What did not change:** the "is the pointer's current date already closed" check (`businessDateService.isDateClosed(...)`, still fully legacy) remains untouched; exception type (`ResponseStatusException`), HTTP status (`409 CONFLICT`), and message format (`"PREVIOUS_DAY_SESSION_OPEN: Session #..."`) are byte-identical; `PosDayStatusService`, Day Close, Pending Day Close, and every other consumer are untouched; no `BusinessDayValidationService`, no Candidate Business Day comparison, no `ALLOW`/`WOULD_BLOCK` verdicts — those are explicitly Stage 3B.2's scope, not introduced here.

**Observability:** the legacy scan is still executed (not removed from the code) purely as a shadow-diagnostic comparison — `BusinessDayStateService.logPreviousUnclosedDayDisagreement(branchId, legacyDetected, newUnclosedBusinessDay)` logs at DEBUG **only when the two detection methods disagree** (never on agreement, never unconditionally), with no new metrics (deliberately deferred to 3B.2, which introduces the full validation-result metric set).

**`BusinessDayValidationService` is intentionally deferred to Stage 3B.2** — not introduced, not stubbed, not referenced anywhere in this phase.

## 12. Stage 3B.2A — Shadow Validation

**Goal:** introduce `BusinessDayValidationService` and run it on every session-opening attempt, purely for observation, with an ironclad guarantee that its result can never affect a real login.

### `BusinessDayValidationService`

`pos/businessdate/BusinessDayValidationService.java` — composes `BusinessDayResolver` (Candidate Business Day) and `BusinessDayStateService` (`findUnclosedBusinessDay`, `isBusinessDayClosed`) into one verdict via `validate(branchId, now, settings)`. No persistence, no session creation, no Business Day mutation — `validate()` only computes and returns a value.

Decision table:

| Previous Unclosed Business Day | Comparison to Candidate | Verdict | Blocking Reason |
|---|---|---|---|
| none | Candidate itself already closed | `BLOCK` | `BUSINESS_DAY_ALREADY_CLOSED` |
| none | Candidate not closed | `ALLOW` | `NONE` |
| present | strictly before Candidate | `BLOCK` | `PREVIOUS_BUSINESS_DAY_OPEN` |
| present | equal to Candidate (today's own in-progress day) | `ALLOW` | `NONE` |
| present | strictly after Candidate (anomalous) | `UNEXPECTED_STATE` | `UNEXPECTED_STATE` |

### `BusinessDayValidationResult`

`pos/businessdate/BusinessDayValidationResult.java` — immutable Java `record`: `candidateBusinessDay`, `previousUnclosedBusinessDay` (`Optional<LocalDate>`), `verdict` (`BusinessDayValidationVerdict`: `ALLOW`/`BLOCK`/`UNEXPECTED_STATE`), `blockingReason` (`BusinessDayBlockingReason`: `NONE`/`PREVIOUS_BUSINESS_DAY_OPEN`/`BUSINESS_DAY_ALREADY_CLOSED`/`UNEXPECTED_STATE`). No human-readable message field by design — `PosSessionService` builds messages, as it always has.

### Shadow Execution

`PosSessionService.openSession()`'s legacy gate (the `isDateClosed` check and the 3B.1 previous-unclosed-day check) is now wrapped in a `try/catch(ResponseStatusException)` that records whether it allowed or blocked (and the exact exception, unmodified) without changing its own logic. Immediately after — win or lose — a second, independent `try/catch(Exception)` block calls `businessDayValidationService.validate(...)` and `businessDayStateService.recordValidationOutcome(branchId, legacyAllowed, shadowResult)`. Only after both blocks complete does the method either continue (legacy allowed) or re-throw the *original, untouched* legacy exception (legacy blocked). The shadow result is read by nothing else in the method — no `if`, no `throw`, no `return` consults it.

### Exception Safety

The shadow `try/catch(Exception)` catches everything, calls `businessDayStateService.recordValidationError(branchId, error)` (increments `businessday.validation.error`, logs at ERROR), and continues — a bug in the new engine can never prevent a real cashier from opening a session. Verified by `openSessionSwallowsShadowValidationExceptionsAndStillOpensTheSession` (`PosSessionServiceTest`).

### Metrics (all branch-tagged)

| Metric | Meaning |
|---|---|
| `businessday.validation.allow` | This attempt's verdict was `ALLOW` |
| `businessday.validation.block` | This attempt's verdict was `BLOCK` |
| `businessday.validation.unexpected_state` | This attempt's verdict was `UNEXPECTED_STATE` |
| `businessday.validation.error` | Shadow validation itself threw |
| `businessday.validation.match_allow` | Legacy allowed, new would allow |
| `businessday.validation.match_block` | Legacy blocked, new would block (`BLOCK` or `UNEXPECTED_STATE`) |
| `businessday.validation.diff_new_blocks` | Legacy allowed, new would block — **highest rollout risk**, watch this one |
| `businessday.validation.diff_new_allows` | Legacy blocked, new would allow — potential policy divergence |

### Logging

DEBUG only, and only for `DIFF_NEW_BLOCKS`, `DIFF_NEW_ALLOWS`, and `UNEXPECTED_STATE` — never on a match, never unconditionally. Implemented in `BusinessDayStateService.recordValidationOutcome`.

### Validation Invariants

1. `BusinessDayValidationService` performs no persistence.
2. `BusinessDayValidationService` never creates sessions.
3. `BusinessDayValidationService` never modifies Business Days.
4. `BusinessDayValidationResult` is immutable (Java `record`).
5. `BusinessDayValidationService` is deterministic for identical inputs (modulo what `BusinessDayStateService` reads at call time — real session/`PosDayClose` data, not wall-clock jitter within the call).
6. Shadow Validation never changes runtime behavior — enforced structurally: `validate()`'s return value is consumed only by `recordValidationOutcome`/`recordValidationError`, never by a conditional in `openSession()`.

### What Stage 3B.2A Does Not Do

No enforcement, no feature flag, no exception type/HTTP status/message change, no controller change, no Day Close/Pending Day Close change, no Business Day activation logic, no retirement of `PosBusinessDateService`/`advanceBusinessDate()`. All of that is Stage 3B.2B, gated on this stage's metrics showing a stable, understood agreement rate first.

## 13. Stage 3B.2A.5 — Feature Flag Infrastructure

**Goal:** build the per-branch rollout mechanism Stage 3B.2B's readiness review identified as a hard, missing prerequisite — without enabling, consulting, or otherwise activating it.

**Flag:** `pos.businessday.login-gate.v2-enabled`, stored as `PosSettings.businessDayLoginGateV2Enabled` (`pos_settings.business_day_login_gate_v2_enabled`, migration `V69__pos_settings_business_day_login_gate_flag.sql`). `NOT NULL DEFAULT FALSE` — every existing and new branch starts OFF, matching the "default OFF" and "backward compatible" requirements exactly.

**Why this storage location:** `PosSettings` is already the per-branch, database-backed configuration entity every other Business Day input (`operatingHoursEnabled`, `operatingStartTime`, `operatingEndTime`) lives on — adding the flag here means it is automatically branch-configurable through the existing generic `POST /api/pos/settings` save endpoint (`PosSettingsController.save`, which persists the whole `PosSettings` object) with no new endpoint, and automatically requires no restart to change, since every `openSession()`-adjacent read already goes through `PosSettingsRepository.findByBranchId` fresh, not a cached/startup-loaded value.

**Lookup:** `BusinessDayFeatureFlagService.isLoginGateV2Enabled(branchId)` (`pos/businessdate/BusinessDayFeatureFlagService.java`) — reads `PosSettingsRepository`, defaults to `false` for a branch with no settings row or a `null` column value (covers both a brand-new branch and a pre-migration existing branch consistently).

**Consultation status: none.** `BusinessDayFeatureFlagService` is not injected into `PosSessionService`, `PosDayStatusService`, or any controller. Confirmed by a repository-wide search — the class is referenced only by its own test file. Flipping the flag for any branch today, through the existing settings UI/API, has **zero** observable effect on login, session opening, or any other behavior; it only changes what a future Stage 3B.2B read would see once that read is actually added.

**What remains for Stage 3B.2B itself:** wire `BusinessDayFeatureFlagService.isLoginGateV2Enabled(branchId)` into `openSession()`'s decision path (per-branch: only branches with the flag on would have `BusinessDayValidationService`'s verdict become authoritative), plus everything else the Stage 3B.2B readiness review's prerequisite list still requires (production soak evidence — the Infrastructure Failure *policy* is now designed and implemented as of §15, but production evidence of its behavior is still outstanding) — none of that is included here.

## 15. Stage 3B.2A.6 — Infrastructure Failure Policy

**Goal:** close the gap the Stage 3B.2B readiness review identified — no design existed for what should happen when the new engine's *dependencies* fail (as opposed to when it successfully computes an anomalous-but-valid result).

### Business Rule Failure vs. Infrastructure Failure

These are two fundamentally different kinds of event and must never be conflated:

| | Business Rule outcome | Infrastructure Failure |
|---|---|---|
| **What it means** | A fact about the branch's *data* — the Business Day Engine successfully computed an answer, and that answer happens to be anomalous | The engine could not compute an answer at all — a *dependency* broke |
| **Representation** | A normal `BusinessDayValidationResult` (verdict `ALLOW`/`BLOCK`/`UNEXPECTED_STATE`) — never throws | `BusinessDayInfrastructureException` — always thrown, never returned as a result |
| **Example** | `UNEXPECTED_STATE`: an unclosed Business Day exists "in the future" relative to the Candidate — anomalous data, but the query itself succeeded | A repository timeout, the database being unavailable, a `PosSettings` lookup failure, or any other unclassified dependency exception |
| **Intended Stage 3B.2B enforcement behavior** | **Fail closed** — block the session. Something about the branch's actual data is wrong; letting a session through would compound whatever produced the anomaly. (Already agreed in an earlier round; unchanged here.) | **Fail open** — fall back to the legacy gate's own, independently-computed decision. An outage in the *new* engine must never become an availability regression for a real cashier — the legacy `PosBusinessDateService` path doesn't depend on the new engine's health, so it remains a safe fallback. |

This table is the *design*, not yet the *implementation* — Stage 3B.2A.6 defines and observes this distinction; it does not enable the "intended enforcement behavior" column, which only takes effect in Stage 3B.2B.

### Design: Dedicated Exception, Not a Result Type

`BusinessDayInfrastructureException` (`pos/businessdate/BusinessDayInfrastructureException.java`) — an unchecked exception carrying a `FailureCategory` (`REPOSITORY`, `SETTINGS`, `UNEXPECTED`), used purely for metric/log routing, never for a decision. A dedicated *result type* was considered and rejected: `BusinessDayValidationResult` already has a fixed, closed set of Business Rule verdicts, and giving it a synthetic "couldn't compute" verdict would force every consumer to distinguish "real" verdicts from "failed to compute" ones by checking a value instead of by the type system — an exception makes that distinction impossible to accidentally ignore.

`BusinessDayValidationService.validate()` wraps its two `BusinessDayStateService` calls (`findUnclosedBusinessDay`, `isBusinessDayClosed`) individually, classifying any `RuntimeException` from either as `FailureCategory.REPOSITORY` (an already-classified `BusinessDayInfrastructureException`, e.g. thrown by `BusinessDayStateService` itself, passes through unwrapped rather than being double-wrapped). `PosSessionService.openSession()`'s shadow block separately wraps its own `PosSettings` lookup (`FailureCategory.SETTINGS`) from the `validate()` call, and falls back to `FailureCategory.UNEXPECTED` for anything not already a `BusinessDayInfrastructureException`.

The existing clean separation is preserved: `BusinessDayResolver` is untouched (still pure, still never throws anything but `IllegalArgumentException` for a null timestamp — a caller-input-validation error, not an infrastructure concern); `BusinessDayStateService` is untouched (its methods still just throw whatever the underlying repository throws — classification happens in its *caller*, `BusinessDayValidationService`, keeping `BusinessDayStateService` a thin, honest reporter); `PosSessionService` gained no new responsibility beyond routing an already-classified exception to the right metric call.

### Metrics (additive — nothing removed)

| Metric | Meaning |
|---|---|
| `businessday.validation.infrastructure_error` | Umbrella — any infrastructure failure, any category |
| `businessday.validation.repository_error` | `BusinessDayStateService`/repository-layer failure |
| `businessday.validation.settings_error` | `PosSettings` lookup failure |
| `businessday.validation.error` | **Unchanged, still incremented** — every infrastructure failure also increments this pre-existing metric internally (`recordInfrastructureFailure` calls `recordValidationError`), so any dashboard/alert built on it from Stage 3B.2A keeps working without modification |

`FailureCategory.UNEXPECTED` increments only the umbrella (and the legacy `error` metric) — no dedicated per-category counter, since "unexpected" is by definition not a stable, actionable bucket the way `REPOSITORY`/`SETTINGS` are.

### Rollback Safety

Unchanged from Stage 3B.2A.5: the feature flag stays OFF, is consulted by nothing, and this phase adds no new call sites into `openSession()`'s actual decision path — only additional categorization *inside* the already-existing, already-swallowed shadow `try/catch`. Reverting this phase (or any phase back through 3B.2A) requires no data migration and no flag change, only a code deploy.

### What Stage 3B.2A.6 Does Not Do

Does not consult the feature flag, does not change `openSession()`'s actual decision, does not implement the "fail closed"/"fail open" enforcement behavior described in the table above (design only), does not modify Day Close, Pending Day Close, or retire `PosBusinessDateService`.

## 16. Stage 3B.2B — Enforcement (Feature-Flag Controlled)

**Goal:** make `BusinessDayValidationService`'s verdict authoritative for `openSession()`'s login/session-opening decision, for the first time — but **only** for a branch whose `pos.businessday.login-gate.v2-enabled` flag is `TRUE`. Every branch with the flag OFF (the default, and every branch today) is unaffected.

### Control Flow

```
openSession()
  │
  enforcementEnabled = BusinessDayFeatureFlagService.isLoginGateV2Enabled(branchId)
  │   (a flag-lookup failure itself fails open to OFF — same philosophy as everything below)
  │
  ├── OFF (default) ─────────────────────────────────────────────────────
  │     blockingException = runLegacyGate(branchId, businessDate)   ← unchanged since 3B.1
  │     runShadowValidation(branchId, legacyAllowed)                ← unchanged since 3B.2A.6
  │     (BusinessDayValidationService's result is STILL never consulted for the decision)
  │
  └── ON ────────────────────────────────────────────────────────────────
        try:
          settings = loadSettingsOrFail(branchId)                  ← may throw SETTINGS infra failure
          result = BusinessDayValidationService.validate(branchId, now, settings)
          recordEnforcementDecision(branchId, result)
          blockingException = toEnforcementException(branchId, result)
                                  ALLOW              → null (proceed)
                                  BLOCK/ALREADY_CLOSED → 403, same message as legacy
                                  BLOCK/PREVIOUS_OPEN  → 409, same message as legacy
                                  UNEXPECTED_STATE      → 409, new message, FAILS CLOSED
        catch (BusinessDayInfrastructureException | any other Exception):
          recordEnforcementFallback(branchId, category, error)
          blockingException = runLegacyGate(branchId, businessDate)   ← FAILS OPEN to legacy

if blockingException != null: throw it (unchanged exception type/status/message shape)
else: continue to session creation exactly as every prior phase
```

### Enforcement Policy (now implemented, not just designed)

| Business Rule outcome | Enforcement behavior |
|---|---|
| `ALLOW` | Session opens normally. |
| `BLOCK` / `BUSINESS_DAY_ALREADY_CLOSED` | Throws the identical `403 FORBIDDEN`, `"Cannot open session: The business day has already been closed."` the legacy gate has always thrown for this case. |
| `BLOCK` / `PREVIOUS_BUSINESS_DAY_OPEN` | Throws the identical `409 CONFLICT`, `"PREVIOUS_DAY_SESSION_OPEN: Session #... is still ..."` message shape — the blocking session's details are looked up the same way `runLegacyGate` always has (`PosSessionRepository.findByBranchIdAndTradingDateOrderByOpenedAtDesc`, earliest-opened session picked), so a client cannot tell from the response alone whether legacy or the new engine produced it. |
| `UNEXPECTED_STATE` | **Fails closed** — `409 CONFLICT`, a new message (`BUSINESS_DAY_UNEXPECTED_STATE: ...`) with no legacy equivalent, since this case never existed under the old pointer model. Also logged at WARN (`BusinessDayStateService.recordEnforcementDecision`) — the one verdict that is never expected in normal operation. |
| `BusinessDayInfrastructureException` (any category) or any other unclassified exception from the enforcement attempt | **Fails open** — falls back to `runLegacyGate`, the exact same method the OFF path uses, for this one request. A bug or outage in the new engine can never itself block a real cashier. |

### Legacy Fallback

`runLegacyGate` and `runShadowValidation` (renamed/extracted from Stage 3B.2A.6's inline code, behavior unchanged) are now shared private methods on `PosSessionService`, reused by:
1. The OFF path, as the primary (and only) decision source.
2. The ON path, as the fail-open fallback when the new engine cannot produce a result.

`PosBusinessDateService`/`advanceBusinessDate()` are untouched and remain fully operational — they are what `runLegacyGate` calls, on both paths above.

### Metrics (additive)

| Metric | Meaning |
|---|---|
| `businessday.enforcement.flag_enabled_requests` | Requests routed through the ON (enforcement) path |
| `businessday.enforcement.flag_disabled_requests` | Requests routed through the OFF (legacy + shadow) path |
| `businessday.enforcement.allow` | Enforcement-mode `ALLOW` verdicts |
| `businessday.enforcement.block` | Enforcement-mode `BLOCK` verdicts |
| `businessday.enforcement.unexpected_state` | Enforcement-mode `UNEXPECTED_STATE` verdicts (fail-closed) |
| `businessday.enforcement.fallback_to_legacy` | Enforcement attempts that fell back to the legacy gate (also increments the existing `businessday.validation.infrastructure_error`/`repository_error`/`settings_error`/`error` metrics via the same `recordInfrastructureFailure` call Stage 3B.2A.6 introduced) |

Nothing from Phase 2 through Stage 3B.2A.6 was removed or renamed.

### Logging

No per-request logging for `ALLOW`/`BLOCK`/flag-routing (would be noisy). WARN-level logging only for `UNEXPECTED_STATE`; ERROR-level logging only for an enforcement-mode fallback (`recordEnforcementFallback`) — both rare, both actionable.

### What Stage 3B.2B Does Not Do

Does not change `BusinessDayResolver`, `BusinessDayStateService`'s query logic, or `BusinessDayValidationService`'s decision rules. Does not touch Day Close, Pending Day Close, Trading Date persistence, cash movements, GL, reports, or session history. Does not retire `PosBusinessDateService`/`advanceBusinessDate()` — both remain the fallback path for every enforcement-mode request and the sole path for every flag-OFF branch. Does not enable any branch's flag in production — that is an operational decision governed by `docs/business-day-shadow-soak-runbook.md`, not a code change.
