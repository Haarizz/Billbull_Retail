# POS Business Day Architecture — Phase 3B.3A: Pilot Branch Enablement

Operational execution plan. This document contains no code changes — it is a checklist,
SQL reference, and reporting template for whoever holds production database and
dashboard access. Authoritative source: `business-day-migration-completion-report.md`,
`docs/business-day-architecture.md`, `docs/business-day-shadow-soak-runbook.md`, and the
Post Stage 3B.2B Validation Review.

## 0. Implementation fact this plan depends on

`business_day_login_gate_v2_enabled` (`PosSettings.java:174-175`) has **no admin UI or
API endpoint** — `PosSettingsController` does not expose it. It can only be changed by a
direct SQL `UPDATE` against the pilot branch's `pos_settings` row. This is consistent
with the runbook's rollback instruction ("no code changes"), so enablement uses the same
mechanism. No `PosSettingsController` change is in scope for this phase — if a toggle UI
is ever wanted, that is a separate, later decision, not part of 3B.3A.

## 1. Pre-Enablement Checklist

To be completed and signed off by the operator before running the enablement SQL. Each
item requires evidence (a screenshot, a link, a name), not just a checkmark.

- [ ] Enforcement dashboards display: feature flag requests, enforcement decisions,
      enforcement fallback, infrastructure failures, unexpected_state — confirmed against
      live data (can use shadow-mode data from any branch, since those metrics already
      flow pre-enablement).
- [ ] Alerts configured for: fallback-rate threshold, unexpected_state occurrence.
- [ ] Support team briefed on which branch is the pilot and what "enforcement mode" means
      operationally (a session-open block they may not have seen before).
- [ ] Rollback procedure (§5 below) documented and reachable by on-call without needing
      this document open.
- [ ] On-call engineer named for the pilot window, with DB access to execute rollback.
- [ ] Legacy rollback path re-verified working (flip flag OFF on a non-pilot branch in a
      staging/test environment, confirm `openSession()` behaves exactly as before —
      sanity check, not a new test).
- [ ] Pilot branch and pilot window approved by stakeholders in writing (email/ticket
      reference).

**Do not run the enablement SQL until every box above has evidence attached.**

## 2. Pilot Branch Selection

Record the answer to each criterion for the candidate branch, then the final decision:

| Criterion | Notes |
|---|---|
| Actively used (real daily sessions) | |
| Representative workload (not an outlier branch) | |
| Local support available on-site/on-call | |
| Willing pilot users (staff briefed and opted in) | |
| No concurrent major POS changes planned during pilot window | |

**Selected branch:** _(branch id + name)_
**Reason for selection:** _(one paragraph, referencing the criteria above)_

## 3. Enablement

Run against the target database only, scoped to the single pilot branch id. Do not use
a broader `WHERE` clause.

```sql
-- Enable enforcement for exactly one branch. Replace :pilot_branch_id.
UPDATE pos_settings
SET business_day_login_gate_v2_enabled = TRUE
WHERE branch_id = :pilot_branch_id;
```

Verify immediately after:

```sql
-- Confirm exactly one row changed, and it's the intended branch.
SELECT branch_id, business_day_login_gate_v2_enabled
FROM pos_settings
WHERE business_day_login_gate_v2_enabled = TRUE;
```

Expect exactly one row: the pilot branch. If any other branch shows `TRUE`, stop and
investigate before proceeding — do not assume it's safe to leave and fix later.

No application restart is required — `BusinessDayFeatureFlagService.isLoginGateV2Enabled`
reads `PosSettingsRepository.findByBranchId` fresh on every `openSession()` call.

## 4. Post-Enablement Verification (immediate)

Within the first few sessions opened on the pilot branch, confirm:

- [ ] Session opening succeeds for legitimate operators (no unexpected blocks).
- [ ] `recordFeatureFlagRequest(branchId, enabled=true)` is incrementing for the pilot
      branch specifically.
- [ ] `recordEnforcementDecision` is firing (ALLOW, and BLOCK only when a real blocking
      condition exists).
- [ ] No `recordEnforcementFallback` events (would indicate infra failure on first use).
- [ ] No `UNEXPECTED_STATE` verdicts.
- [ ] Checkout flow downstream of session open is unaffected (sessionDate/tradingDate
      stamping, GL posting, receipt printing — all untouched by this flag, but confirm
      empirically on the pilot branch's first few transactions).

If any item fails, follow §5 rollback immediately rather than "watching a bit longer."

## 5. Monitoring (during the agreed pilot period)

Track continuously, scoped to the pilot branch:

- `enforcement.allow`, `enforcement.block`, `enforcement.unexpected_state`,
  `enforcement.fallback_to_legacy` counters (exact metric names per
  `BusinessDayStateService`).
- `infrastructure_error` / `repository_error` / `settings_error` breakdowns within
  fallback events.
- Support incidents referencing login/session-open on the pilot branch.
- Direct operator feedback (informal — ask, don't just wait for tickets).
- Any rollback events (should be zero if the pilot goes cleanly; record if not).

## 6. Rollback Criteria and Procedure

Roll back immediately — do not wait for pilot-period end — if any of:

- `UNEXPECTED_STATE` occurs when it should not be reachable given known data state.
- Infrastructure fallback rate exceeds the agreed threshold (set this number explicitly
  before the pilot starts, in the sign-off referenced in the pre-enablement checklist).
- Enforcement blocks a legitimate user/session.
- Any support incident traces to enforcement behavior and isn't immediately resolvable.
- A stakeholder requests rollback for any reason.

Rollback is config-only:

```sql
UPDATE pos_settings
SET business_day_login_gate_v2_enabled = FALSE
WHERE branch_id = :pilot_branch_id;
```

No code deploy, no data repair, no restart. Confirm with the same verification query as
§3 (expect zero rows with `TRUE`, or however many other branches were already enabled —
none should be, per this phase's scope).

## 7. Pilot Report Template

To be filled in at the end of the pilot window:

1. **Pilot duration:** start/end timestamps.
2. **Sessions opened** on the pilot branch during the window.
3. **Enforcement decisions:** ALLOW count, BLOCK count (by reason).
4. **Legacy fallbacks:** count, broken down by category (repository/settings/unexpected).
5. **`UNEXPECTED_STATE` events:** count, and for each, the branch/session context that
   produced it.
6. **Support incidents:** count and summary, with resolution status.
7. **Rollback events:** count, cause, and how quickly resolved.
8. **Observed differences from legacy:** anything enforcement did differently than the
   legacy gate would have, even if not a failure (e.g. blocked something legacy would
   have silently allowed, or vice versa via shadow-diff logs).
9. **Recommendation:** GO / GO WITH CONDITIONS / NO-GO, with the operational evidence
   above cited directly — not a restatement of the architecture review.

## 8. Out of Scope (unchanged from the request)

No additional branches, no legacy-gate removal, no `PosDayStatusService` changes, no
`PosBusinessDateService` retirement, no changes to `BusinessDayValidationService`,
`BusinessDayResolver`, metrics, or logging, no Phase 4 work.

## 9. Success Criteria

One pilot branch completes a controlled operational evaluation with objective evidence
(§7) collected, rollback proven if exercised, and a supported GO/GO-WITH-CONDITIONS/NO-GO
recommendation for wider rollout.
