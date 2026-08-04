# Business Day Engine — Production Shadow Soak & Pilot Enforcement Runbook

**Status of the system this runbook governs:** Stage 3B.2B complete — enforcement is **implemented and code-ready**, but **no branch's flag has been enabled in production**. `BusinessDayValidationService` runs on every `openSession()` attempt; for a flag-OFF branch (every branch today) it remains purely observational, byte-identical to Stage 3B.2A.6. The fail-open (Infrastructure Failure → legacy fallback) / fail-closed (`UNEXPECTED_STATE` → block) policy described in `docs/business-day-architecture.md` §15–16 is now real code, not a design document — this resolves the rollback-criterion gap §7 used to list ("fail-open enforcement code not yet implemented").

This runbook has two phases: **Part A — Shadow Soak** (§1–8, unchanged in substance from the original version, governs the observation period every branch must complete before its flag can be considered) and **Part B — Pilot Branch Enforcement** (§9, new — the actual procedure for enabling the flag once soak evidence supports it).

**Companion document:** `docs/business-day-architecture.md` — read that first for what each metric/component actually means. This runbook is the *process* around watching them and rolling out enforcement; the architecture doc is the *reference* for what they are.

---

## 1. Recommended Soak Duration

| | Duration | Rationale |
|---|---|---|
| **Minimum** | 14 days | Must cover at least two full weekly cycles — retail trading patterns (weekday vs. weekend volume, any weekly stock-take or promotion day) can surface edge cases a single week misses. Anything shorter is not defensible as "production evidence" per the Stage 3B.2B readiness review's own standard. |
| **Recommended** | 30 days | Covers a full monthly cycle (month-end/month-start volume changes, any monthly reconciliation or reporting day a branch runs differently) and gives enough volume for the rarer verdict/failure categories (`unexpected_state`, `settings_error`) to either occur at least once (worth investigating) or be credibly absent. |
| **Maximum** | 60 days | Beyond this, soaking longer stops adding evidence and starts being avoidance — if 60 days of clean metrics haven't produced confidence, the blocker is a process/review problem, not a data problem, and should be escalated rather than extended indefinitely. |

**Special case — overnight-configured branches:** per branch, the soak must include **at least one full overnight-crossing trading day** regardless of calendar duration. If the `pos_settings` query from the Phase 3A readiness review found overnight branches, their individual soak clock does not "complete" until this has happened at least once, even if the 14/30-day calendar window has passed for every other branch.

---

## 2. Metrics Review Cadence

| Cadence | Scope | Who / What |
|---|---|---|
| **Daily** | All `businessday.validation.*` and `businessday.shadow.*` counters, aggregated across all branches | Automated dashboard glance — no meeting required, but a human must look, not just trust "no alert fired" (alerts cover thresholds, not trends) |
| **Weekly** | Same metrics, broken out **per branch**, plus a week-over-week trend comparison | A short written or verbal check-in — is the disagreement rate flat, growing, or shrinking? Is any one branch an outlier? |
| **Per branch** | Every branch gets its own row/panel, always — never only an aggregate. A single noisy branch can hide inside a healthy aggregate. | Ongoing, via the dashboard (§3) |
| **Per overnight branch** | Extra scrutiny: `diff_new_blocks`/`diff_new_allows` are *expected* to be nonzero here (per the documented overnight-correction behavior) — review each occurrence individually against the specific session pair involved (Terminal A/B timestamps), not just the count | Weekly at minimum; daily during the first week after an overnight branch's flag would ever be considered for enablement |

---

## 3. Production Dashboards

One dashboard, structured as:

**Panel group 1 — Volume & Verdict (per branch, stacked over time)**
- `businessday.validation.allow`
- `businessday.validation.block`
- `businessday.validation.unexpected_state`

**Panel group 2 — Agreement with Legacy (per branch)**
- `businessday.validation.match_allow`
- `businessday.validation.match_block`
- `businessday.validation.diff_new_blocks` — highlighted/emphasized styling; this is the single most important line on the whole dashboard
- `businessday.validation.diff_new_allows` — same emphasis

**Panel group 3 — Infrastructure Health (per branch)**
- `businessday.validation.infrastructure_error` (umbrella)
- `businessday.validation.repository_error`
- `businessday.validation.settings_error`
- `businessday.validation.error` (legacy/umbrella, kept for continuity with Stage 3B.2A dashboards)

**Panel group 4 — Engine/Pointer Agreement (Phase 2/3A shadow metrics, still relevant context)**
- `businessday.shadow.match`
- `businessday.shadow.differ`
- `businessday.shadow.no_active_business_day`
- `businessday.shadow.overnight_resolution`

**Derived panels (computed, not raw counters):**
- Disagreement rate = `(diff_new_blocks + diff_new_allows) / (allow + block)`, per branch, per day — the single trend line the weekly review should look at first.
- Infrastructure error rate = `infrastructure_error / (allow + block + unexpected_state)` — should be indistinguishable from zero.

Every panel filterable/splittable by the `branchId` tag already emitted on every metric — no new instrumentation required, this is a dashboarding recommendation only.

---

## 4. Alert Thresholds

| Alert | Condition | Priority | Rationale |
|---|---|---|---|
| Business Rule anomaly | `businessday.validation.unexpected_state > 0` (any branch, any occurrence) | High — investigate within 1 business day | Every design round agreed this must never be silently absorbed; it's rare enough that any occurrence is worth a look, not a threshold |
| Repository failure spike | `businessday.validation.repository_error` rate increase beyond baseline (e.g. >0 sustained over a 15-minute window, or a sudden count jump) | High | Signals the new engine's dependencies are unhealthy — worth fixing regardless of enforcement status |
| Settings failure spike | `businessday.validation.settings_error` rate increase beyond baseline | High | Same rationale as above, isolated to the settings dependency specifically |
| Highest-risk divergence | Any `businessday.validation.diff_new_blocks > 0` on a branch **not** documented as overnight-configured | Critical — same-day investigation | This is the exact signal that would mean Stage B locks someone out who legacy would have let in |
| Divergence spike | `businessday.validation.diff_new_allows > 0`, any branch, any occurrence | Critical — same-day investigation | This is the exact signal that would mean Stage B lets someone in whom legacy blocks — zero tolerance, not a rate threshold |
| Infrastructure umbrella | `businessday.validation.infrastructure_error > 0` sustained over a rolling window (catches anything not caught by the two category-specific alerts above, including `UNEXPECTED` category) | Medium | Backstop alert |

All thresholds are `> 0` or "any occurrence," not percentages — consistent with the Stage 3B.2B readiness review's own acceptance bar, which treats these as zero-tolerance signals, not statistically-noisy metrics to average out.

---

## 5. Operational Checklist

**Daily review (5–10 minutes, no meeting needed):**
- [ ] Open the dashboard; confirm no alert fired overnight.
- [ ] Glance at `unexpected_state`, `diff_new_blocks`, `diff_new_allows` aggregate counts — confirm still zero (or, for documented overnight branches, still within the expected/explained pattern).
- [ ] Confirm `infrastructure_error`/`repository_error`/`settings_error` are flat at zero.
- [ ] Note the day in a running soak log (date, any anomaly, any action taken) — this log is what feeds the end-of-soak review.

**Weekly review (30 minutes, short sync or async write-up):**
- [ ] Per-branch breakdown reviewed, not just aggregate.
- [ ] Week-over-week trend compared — flat/improving/worsening.
- [ ] Every `diff_new_blocks`/`diff_new_allows` occurrence from the week individually explained in the soak log (branch, timestamp, session IDs involved, root cause).
- [ ] Overnight-configured branches specifically checked for at least one overnight-crossing trading day having occurred since last review.
- [ ] Decide: continue soak as planned, extend, or flag for early escalation.

**End-of-soak review (formal, before any GO/NO-GO discussion):**
- [ ] Full soak log compiled and attached to the sign-off record.
- [ ] Every item in the Acceptance Criteria checklist (§6) evaluated explicitly, with evidence (a dashboard screenshot or exported query result, not a verbal "looked fine").
- [ ] Overnight-branch-specific validation checklist (from the original Stage 3B readiness review) re-run and confirmed.
- [ ] Written summary produced for the GO/NO-GO template (§8).

---

## 6. Acceptance Criteria (all must hold for the full soak window)

- [ ] `businessday.validation.unexpected_state == 0` for every branch, for the entire soak window.
- [ ] `businessday.validation.infrastructure_error == 0` (and therefore its sub-metrics `repository_error`/`settings_error` == 0) for every branch, for the entire soak window.
- [ ] `businessday.validation.diff_new_blocks == 0` for every branch **not** documented as overnight-configured.
- [ ] Every `diff_new_blocks` occurrence on a documented overnight branch is individually reviewed and matches the expected overnight-correction pattern — no unexplained instance.
- [ ] `businessday.validation.diff_new_allows == 0`, or every occurrence (any branch) individually reviewed and explained in writing — zero unexplained instances.
- [ ] `businessday.validation.match_allow` accounts for effectively all `ALLOW` traffic; `match_block` accounts for effectively all legacy-block traffic (no unexplained gap between verdict counts and agreement counts).
- [ ] Every branch has completed the minimum soak duration (§1), and every overnight-configured branch has had at least one full overnight-crossing trading day observed within the window.
- [ ] The `pos_settings` overnight-branch query has been (re-)run at the end of the soak window and its result matches what was assumed at the start — no branch silently enabled overnight hours mid-soak without the team's knowledge.
- [ ] The daily/weekly soak log is complete for the full window, with no unreviewed gaps.

---

## 7. Rollback Criteria — Stage 3B.2B Must NOT Begin If

- Any single `businessday.validation.unexpected_state` occurrence remains unexplained at end-of-soak.
- Any `diff_new_blocks` occurrence on a non-overnight branch remains unexplained.
- Any `diff_new_allows` occurrence, on any branch, remains unexplained.
- `businessday.validation.infrastructure_error` (any sub-category) shows a nonzero rate at any point during the final week of the soak window, even if earlier weeks were clean — recency matters more than a clean historical average.
- The soak window has gaps in monitoring (an outage in the metrics pipeline itself, not the Business Day Engine) that prevent confidently asserting the acceptance criteria held throughout.
- The per-branch feature flag mechanism itself has not been independently tested (flip on/off in a non-production environment, confirm it's readable, confirm default-OFF behavior) in the **specific environment** the pilot branch will run in — Stage 3B.2A.5 built the storage/lookup and Stage 3B.2B unit-tests the enforcement code path, but neither substitutes for an operator having actually flipped the flag once, end to end, outside a unit test.
- ~~The infrastructure-failure fail-open policy has not yet been implemented in code~~ — **resolved as of Stage 3B.2B**; the policy is now real, tested code (`docs/business-day-architecture.md` §16). This bullet is kept, struck through, as a record that it was once a real blocker, not silently deleted.
- Any branch's soak duration is short of the minimum (§1) at the time GO/NO-GO is being decided — no exceptions for "the metrics looked fine early."

**If any of the above is true, the correct action is: do not proceed, document which criterion failed and why, remediate, and restart the soak clock for the affected scope (branch-level restart is acceptable if the issue was isolated to one branch; global restart if the issue was systemic).**

---

## 8. Final GO / NO-GO Sign-Off Template

```
BUSINESS DAY ENGINE — STAGE 3B.2B ENFORCEMENT READINESS
Sign-off record

Soak window:            [start date] – [end date]  (____ days)
Branches covered:        [ list, or "all production branches" ]
Overnight branches:      [ list, or "none identified" — cite the pos_settings query run on: ____ ]

ACCEPTANCE CRITERIA (§6)                                    STATUS   EVIDENCE
[ ] unexpected_state == 0, all branches, full window          
[ ] infrastructure_error == 0, all branches, full window      
[ ] diff_new_blocks == 0 on non-overnight branches             
[ ] diff_new_blocks on overnight branches — all explained      
[ ] diff_new_allows == 0, or all occurrences explained         
[ ] match_allow / match_block account for all traffic          
[ ] minimum soak duration met, all branches                    
[ ] overnight branches: ≥1 full overnight cycle observed       
[ ] pos_settings overnight query re-verified at soak end       
[ ] daily/weekly soak log complete, no gaps                    

ROLLBACK CRITERIA (§7) — confirm NONE apply                  STATUS
[ ] No unexplained unexpected_state                            
[ ] No unexplained diff_new_blocks (non-overnight)              
[ ] No unexplained diff_new_allows                              
[ ] No infrastructure_error in final week                       
[ ] No monitoring gaps during soak                               
[ ] Feature flag mechanism independently tested                 
[ ] Fail-open enforcement code implemented and reviewed          
[ ] All branches meet minimum soak duration                      

PREPARED BY:            ______________________   DATE: __________
REVIEWED BY:             ______________________   DATE: __________
APPROVED BY:             ______________________   DATE: __________
                         (sign-off authorizes Stage 3B.2B implementation
                          planning to begin — NOT flag enablement itself;
                          a separate, second sign-off is required before
                          the flag is flipped for the first pilot branch)

DECISION:   [ ] GO — proceed to Stage 3B.2B implementation
            [ ] GO WITH CONDITIONS — list below
            [ ] NO-GO — list blocking criteria above and remediation plan

CONDITIONS / BLOCKING ITEMS:
_________________________________________________________________
_________________________________________________________________
```

**Note on the two-signoff structure:** this template's approval authorized *starting Stage 3B.2B's implementation work*, not enabling the flag for real traffic. That implementation is now complete (§16 of the architecture doc). A **second, separate sign-off** — the Part B procedure below — is required before any branch's flag is actually flipped. Conflating the two would let a clean soak record substitute for reviewing code that didn't exist yet at the time of the first sign-off.

---

# Part B — Pilot Branch Enforcement Procedure

This part governs the actual act of enabling `pos.businessday.login-gate.v2-enabled` for a real branch, now that Stage 3B.2B's code exists, is tested, and is deployed. **Nothing in Part A changes** — every branch must still complete its shadow soak and pass the acceptance criteria (§6) before it is eligible for anything below.

## 9. Pilot Enablement Procedure

**Step 1 — Confirm eligibility.** The candidate branch must have: passed every item in §6's Acceptance Criteria for its full soak window; a completed, signed §8 sign-off with `DECISION: GO` or `GO WITH CONDITIONS` (conditions resolved); no open item in §7's Rollback Criteria.

**Step 2 — Pre-flip verification (non-production).** In a staging/test environment configured to mirror the pilot branch's operating-hours settings: flip the flag on for a test branch, confirm `openSession()` routes through enforcement (`businessday.enforcement.flag_enabled_requests` increments), confirm a normal login still succeeds (`ALLOW`), and — if feasible — simulate an infrastructure failure (e.g. a temporarily unreachable settings/session repository) to confirm the fallback path actually engages (`businessday.enforcement.fallback_to_legacy` increments, login still succeeds via legacy).

**Step 3 — Enable for the pilot branch.** Flip `business_day_login_gate_v2_enabled = true` for exactly one branch, via the existing `PosSettings` save flow. Do this at a low-traffic time for that branch, with the on-call/monitoring owner aware and watching in real time for at least the first hour.

**Step 4 — Intensive post-enablement monitoring (first 24–48 hours).**
- [ ] `businessday.enforcement.allow`/`block` volumes roughly match the branch's normal login volume (a large drop in `allow` would mean real cashiers are being blocked).
- [ ] `businessday.enforcement.unexpected_state == 0`.
- [ ] `businessday.enforcement.fallback_to_legacy == 0`, or every occurrence individually explained.
- [ ] No cashier-reported login issues for this branch (check support/helpdesk channel, not just metrics).
- [ ] At least one real Day Close has been completed successfully for this branch since enablement.

**Step 5 — Extended observation (1–2 weeks).** Continue the same daily/weekly review cadence as Part A (§2), now watching the `businessday.enforcement.*` metrics as the primary signal for this branch instead of `businessday.validation.*` (which continues recording in shadow form for every other, still-OFF branch).

**Step 6 — Expand or hold.** If the pilot branch's extended observation is clean: select the next branch(es) and repeat Steps 1–5. If not: flip the pilot branch's flag back to OFF (instant, no code change, no data migration — this is exactly what the flag exists for), document what went wrong, and do not proceed to any other branch until root-caused.

## 10. Pilot Rollback Procedure

Flipping a branch's flag back to OFF is the entire rollback mechanism — no deploy, no migration, no downtime. Do this immediately (do not wait for a scheduled review) if, for the pilot branch:
- Any `businessday.enforcement.unexpected_state` occurrence is observed and cannot be explained within the same business day.
- `businessday.enforcement.fallback_to_legacy` shows a sustained nonzero rate (a one-off, promptly explained occurrence — e.g. a transient deploy-time blip — does not by itself require rollback, but a pattern does).
- Any cashier-reported inability to log in traces back to this branch's enforcement path.
- A real Day Close for this branch fails or behaves unexpectedly in any way traceable to the enforcement gate.

After rollback: the branch reverts to exactly its pre-pilot behavior (legacy-primary, shadow-observational) — no cleanup, no data repair needed, since `PosBusinessDateService` was never stopped from operating normally for this branch even while its flag was on.

## 11. Pilot Sign-Off Template

```
BUSINESS DAY ENGINE — PILOT BRANCH ENFORCEMENT ENABLEMENT
Sign-off record

Branch:                  ______________________
Prior soak sign-off ref: ______________________  (§8 record, DECISION: ______)
Non-production verification (Step 2) completed on: __________

STEP 4 — 24–48 HOUR POST-ENABLEMENT CHECK              STATUS
[ ] allow/block volume matches historical login volume
[ ] unexpected_state == 0
[ ] fallback_to_legacy == 0 or fully explained
[ ] no cashier-reported login issues
[ ] ≥1 real Day Close completed successfully

STEP 5 — EXTENDED OBSERVATION (1–2 weeks)               STATUS
[ ] Clean throughout — no rollback triggers from §10 hit

DECISION:  [ ] EXPAND to additional branches
           [ ] HOLD at current branch(es), continue observing
           [ ] ROLLBACK — reason: ______________________

APPROVED BY: ______________________   DATE: __________
```
