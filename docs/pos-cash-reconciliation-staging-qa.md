# POS Cash Reconciliation — Staging QA Checklist

Release candidate. Run every section on staging before any production decision.

**Before you start:** configure `cash_variance_threshold` per branch. At the shipped default of
`0` (zero tolerance) *every* discrepancy demands supervisor authorization — see
`pos-cash-variance-threshold-audit.sql` and §0 below. Several cases here assume a non-zero
tolerance on the test branch.

Record for each case: date, tester, branch, terminal, session id, PASS/FAIL, notes.

---

## 0. Threshold configuration (do this first)

Run `docs/pos-cash-variance-threshold-audit.sql` against the staging database and record:

| | Value |
|---|---|
| Branches at zero tolerance | |
| Branches with a configured tolerance | |
| Closed counted sessions | |
| Sessions with a real variance | |
| Sessions that would require approval | |
| Largest historical variance | |

Then set a deliberate threshold on the QA branch (suggested: `20.00`) so cases B–D are
distinguishable. **Do not** change thresholds on branches you are not testing.

---

## A. Balanced session

1. Open a session with float **1,000**.
2. Ring up a cash sale of **500**.
3. Close, counting denominations totalling **1,500**.

**Expect:** closes with no approval prompt · `expectedCash = 1500` · `countedCash = 1500` ·
`variance = 0` · `reconciliationStatus = BALANCED` · X-Report and Z-Report agree.

**Ledger:** `SCL-{id}` = `Dr Bank 1,500 / Cr Cash in Hand 1,500`. **No** Cash Short or Cash Over
line. Session-open journal `SESSOPEN-{id}` = `Dr Cash in Hand 1,000 / Cr Petty Cash 1,000`.

---

## B. Small variance within tolerance

Threshold `20.00`. Repeat A but count **1,510**.

**Expect:** closes with **no** approval prompt · `variance = +10` · status `OVER`.
**Ledger:** `Dr Bank 1,510 / Cr Cash in Hand 1,500 + Cr Cash Over 10`.

---

## C. Overage requiring approval

Threshold `20.00`. Count **1,600** against expected **1,500**.

**Expect:** close refused. Approval panel appears showing **server** values: expected 1,500,
counted 1,600, variance 100, threshold 20. Session stays **OPEN**; nothing persisted.

---

## D. Shortage requiring approval

Count **1,350** against expected **1,500**.

**Expect:** panel shows variance 150, direction **SHORT**. Session stays OPEN.

---

## E. Wrong supervisor credentials

From case D, enter a bad password and submit.

**Expect:** actionable error in the panel · session still **OPEN** · no journal · no
`variance_approval_status` written · nothing in `cash_difference`. Confirm no partial state.

---

## F. Correct credentials

From case D, enter valid supervisor credentials **and a reason**, then authorize.

**Expect:** session closes. Verify on the session row:
`variance_approval_status = APPROVED` · `variance_approved_by` = the **supervisor's** username,
not the cashier's · `variance_approved_at` set · `variance_approval_reason` = what was typed.

**Ledger:** `Dr Bank 1,350 + Dr Cash Short 150 / Cr Cash in Hand 1,500`.

**Also confirm:** submitting without a reason is rejected before any request is sent.

---

## G. Retry after approval — the recount rule

1. Reach the approval panel with a variance (case D).
2. Authorize successfully, but **before** closing, change the denomination count.
3. Attempt to close.

**Expect:** refused again. The grant was bound to the earlier count, so a recount invalidates
it and a **new** authorization is required. This is the control that stops an approval for a
small discrepancy being spent on a large one.

---

## H. Refresh during approval

Reach the approval panel, then reload the browser.

**Expect:** the token is gone (it lives in memory only). Closing again re-triggers the approval
requirement. **Verify in DevTools that no variance token appears in `localStorage` or
`sessionStorage`.**

---

## I. Duplicate close attempt

1. Close a session normally.
2. Click Close again / replay the request / open a second tab and close the same session.

**Expect:** exactly one CLOSED session · a deterministic "Session is already closed" refusal ·
**exactly one** `SCL-{id}` journal · one close audit entry. No duplicate GL.

---

## J. Post-close correction

1. Close a session with a counted shortage (e.g. expected 1,500, counted 1,350, authorized).
2. Raise a denomination correction in Enterprise Console → POS Administration restating the
   count as **1,500**.
3. Approve and apply it.

**Expect:**
- `SCL-{id}` is **byte-for-byte unchanged** — verify the original journal was not edited.
- A new `SCLADJ-{id}-v1` exists containing a full reversal of `SCL-{id}` **plus** the corrected
  posting.
- Net of both = `Dr Bank 1,500 / Cr Cash in Hand 1,500`; Cash Short nets to **0**.
- Session `variance_approval_status = SUPERSEDED_BY_CORRECTION`, with the original approver,
  timestamp and reason **still present**.
- Correction row carries `adjustment_journal_reference = SCLADJ-{id}-v1` and
  `adjustment_posted_at`.
- Re-applying the correction is refused (`Only APPROVED corrections can be applied`) — no second
  adjustment journal.

Repeat for at least one direction change: shortage → **overage**.

---

## K. Z-Report verification

For the test day's sessions confirm the Z-Report shows:

- `expectedCash` = Σ frozen session expected
- `countedCash` = Σ counted sessions only
- `cashVariance` — and that it is **blank/—** if any session was uncounted
- `uncountedSessionCount` and `sessionsWithVariance` correct
- Back-office receipts/advances appear under the **non-drawer** section and are **not** summed
  into any drawer figure
- No "Net Cash Position" composite anywhere

---

## L. Day Close verification

- `expected_cash`, `counted_cash`, `cash_variance`, `variance_status`,
  `sessions_with_variance`, `uncounted_session_count` all persisted as **columns**
- The "Cash Variance Within Limits" checklist item reflects the real reconciliation — force a
  failure by leaving an over-threshold session in the day and confirm it goes red
- A day containing any uncounted session is **NOT_COUNTED**, never BALANCED

---

## M. GL verification

For the test day, confirm in the ledger:

- Every `SESSOPEN`, `SCL` and `SCLADJ` entry **balances** (Σ debits = Σ credits)
- **Cash in Hand nets to zero** across a completed balanced session
- Cash Short (6060) / Cash Over (7005) carry exactly the discrepancies from C, D and B
- No variance touched Sales Revenue, VAT Output or Accounts Receivable
- `gl_posting_status = POSTED` and `gl_posting_reference = SCL-{id}` on every closed session

**Failure path:** if any session shows `gl_posting_status = FAILED`, `gl_posting_error` must
name the cause. A session must never read as reconciled with no journal behind it.

---

## Financial reconciliation — single-session deep check

Pick one closed staging session with a variance and confirm **all of these describe the same
state**:

| Source | Field | Value |
|---|---|---|
| Session row | `expected_cash` | |
| Session row | `closing_cash` (counted) | |
| Session row | `cash_difference` | |
| Session row | `closing_denominations_json` | Σ must equal `closing_cash` |
| Session row | `variance_approval_status` / approver | |
| X-Report | expected / counted / variance | |
| Z-Report | session row figures | |
| Day Close | contribution to day totals | |
| GL | `SCL-{id}` lines | |
| GL | `SCLADJ-{id}-v*` if corrected | |
| GL | Cash in Hand net | |
| GL | Cash Short / Cash Over | |

**Any disagreement between these is a defect — stop and report it, do not adjust data.**

---

## Reporting a defect

Do not patch during validation. Record: reproduction steps · exact cause if known · affected
file · business impact · proposed fix. Then stop.
