# Enterprise Console → POS Administration — Architectural Review

**Status: Review only. No implementation.**
**Date: 2026-07-29**

Scope: architectural review of a proposed "POS Administration" module (Session
Denomination Corrections, Transaction Corrections, Cash Movement Categories,
Correction Approvals) under Enterprise Console, per the 15-part requirement
brief. This document is the pre-implementation deliverable — sections below
map 1:1 onto the brief's numbering.

---

## 1. Current Financial Lifecycle (fact-finding)

### 1.1 POS session / cash / reporting chain

| Entity | Table | Nature | Mutability after the fact |
|---|---|---|---|
| `PosSession` | `pos_sessions` | Live during OPEN/SUSPENDED, becomes historical at CLOSED | Opening float is a single scalar `openingCash` — **no structured denomination breakdown at open**. Closing denominations exist only as an **opaque `closingDenominationsJson` TEXT blob**, written once in `closeSession()` (`PosSessionService.java:393-395`). No `reopenSession()` exists; `suspend/resume` are blocked once CLOSED. |
| `PosXReportSnapshot` | `pos_x_report_snapshots` | **Persisted immutable snapshot** — doc comment says "never updated after creation" | Entire report payload is a `reportJson` TEXT blob — no structured/queryable denomination fields. First X-Report call on an OPEN session creates the row; there is no update path in the repository. |
| Z-Report | *(no dedicated entity)* | Live-computed via `getZReport()` until a Day Close exists, then the Z-Report **is** `PosDayClose` | See below. |
| `PosDayClose` | `pos_day_closes` | **Persisted computed snapshot**, unique on (branch, close_date) | Aggregated totals + `zReportJson` blob + resolved session range (`startSessionId`/`endSessionId`). Repository exposes only find/exists/search — **no update query exists**. Concurrency protected only by the unique constraint, not a row lock. |
| `PosCashMovement` | `pos_cash_movements` | Drop-in/drop-out, append-only with a **void workflow** | `status` ACTIVE/VOIDED; `voidReason/voidedBy/voidedAt`; edit tracking (`editedBy/editedAt/editCount`, `originalDescription/originalReference`) but entity comment explicitly states amount/type/session/business-date must **never** be mutated. **No category field exists today.** No GL FK stored on the row — GL posting happens transiently at creation via `PostingEngineService.createJournalFromCashMovement`. |
| "Consolidated Cash Position" | *(no entity)* | **Always live-computed**, never persisted | `PosSessionService.buildCashPosition()`, called from both X and Z report paths. Explicitly flags `cashRefundsSupported=false` because `SalesReturn` has no payment-mode field yet. |
| `PosCashDrawer` | — | Hardware registration only (device code, printer, kick status) | Not a cash-total entity at all — don't confuse with cash position. |

**Key finding:** denomination data is a **JSON blob inside an otherwise-immutable
snapshot row**, not a structured, correctable table. Any "denomination
correction" feature is correcting *inside* a blob field of a row whose own
doc comment says it's never updated. That's the central design tension this
review has to resolve (see §3).

### 1.2 Sales / receipts / advances / GL chain

| Entity | Mutability |
|---|---|
| `SalesInvoice` | `paymentMode` is **mutated in place** at checkout when multiple payment legs are recorded (re-stamped per leg, `PosCheckoutController.java:196-224`). `amountPaid/balance/status` are also **recomputed and overwritten in place** whenever an advance is applied (`ReceiptVoucherService.syncInvoiceAfterAdvanceApplication`). So the invoice header is **not** immutable today — it's a live cache of derived state. |
| `Payment` (payment-leg) | One row per leg (cash/card/online/advance), grouped by `splitGroupId`. **Append-only** — no update/delete path found. |
| `SalesReturn` | New independent document; `linkedInvoice` is a plain string, not an FK. Original `SalesInvoice` is **never mutated** by a return — confirmed no `salesInvoiceRepository.save()` call anywhere in `SalesReturnService`. |
| `ReceiptVoucher` | **Editable after posting** — `updateReceipt()` mutates amount/paymentMode/status/invoice-links directly. Correction is handled by **reverse-and-repost** at the GL layer (`postingEngineService.reverseAndRepostReceiptVoucher`), not a same-row GL edit. Every mutation logs to `FinancialAuditService` as a **free-text message**, not a structured diff. |
| `AdvanceApplication` | Fully **append-only** — `apply()`/`refund()` only ever insert new rows; balances are derived by summing them. |
| `JournalEntry`/`JournalVoucher` | **Cannot be edited once Posted** — `updateJournalVoucher` throws if status is Posted. Corrections are always a **new offsetting journal entry** (reverse pattern used consistently: `reverseJournalFromInvoiceCancellation`, `reverseAndRepostReceiptVoucher`, `reverseJournalFromCashMovementVoid`, etc). Posting is idempotent by reference-key dedup. |
| Customer Ledger / Statement | **No materialized ledger table exists.** `StatementService.getCustomerStatement()` computes the statement dynamically on every call from `SalesInvoice`+`ReceiptVoucher`+`AdvanceApplication`+`OpeningInvoice`. `Customer.balance` is a cached scalar kept in sync by side-effecting writes, not a ledger. |
| `AuditLog` (general security trail) | Structured actor/entity/action/timestamp fields, but **`details` is free text** — no `oldValue`/`newValue` column pair. Not sufficient as-is for correction audit (see §11). |
| `AccountingPeriod` | Status is a plain String, enforced by **both** an application guard and a Postgres `BEFORE INSERT/UPDATE` trigger on `journal_entries`/`ledger_entries` (`PeriodLockTriggerInstaller`). It blocks **GL posting only** — POS-side writes (sessions, cash movements) are not themselves period-aware; they'd only fail indirectly if their GL posting call hits a locked period. |

### 1.3 Existing correction/approval precedent

No `Correction`/`Adjustment`/`Reversal` **entity** exists anywhere yet. Two
reusable precedents:

- **Reversal-via-new-entry** is the codebase's one consistent convention for
  "undo something already posted" — used for JV voids, invoice
  cancellations, DN cancellations, receipt voucher amount changes, cash
  movement voids. This is a strong signal for §5.
- **Approval state machines** exist in two independent, non-unified forms:
  LPO's multi-step `ApprovalHistory`/`ApprovalWorkflowService` (role-keyed
  sequential steps), and JV's single-step threshold-triggered
  `submitForApproval/approve/reject` in `JournalEntryService`. Neither is
  generic/reusable as a library — a new correction-approval workflow would
  most likely be its own implementation modeled on the JV one, not a shared
  abstraction (no shared abstraction exists to plug into).

### 1.4 Lifecycle lock points (as they exist today)

| Event | What actually becomes locked today |
|---|---|
| X Report generated | Nothing is blocked — X-Report is informational; the session stays OPEN and cash movements/edits continue. |
| Z Report generated | Same — computed live, no lock side-effect (no persisted Z entity to lock). |
| Day Close completed | `PosDayClose` row created; no code path updates it afterward, but nothing actively *prevents* a new session being opened for the same business date outside the resolved range, beyond the unique constraint. |
| GL Posted | Journal becomes immutable at the JV layer (`status=Posted` blocks `updateJournalVoucher`). This is the **only** hard-enforced lock in the system today. |
| Accounting Period Locked | Blocks new GL postings dated inside the period, via DB trigger — the strongest enforcement point in the whole system. |

**Conclusion of §1:** today's "immutability" is inconsistent — GL journals
and X-Report snapshots are truly immutable by convention/doc-comment;
Day Close is immutable by omission (no update method, not by explicit
guard); sessions, cash movements, receipt vouchers, and invoices are all
still directly mutable in various ways. A correction module has to be
layered onto this mixed reality, not onto a clean "everything is frozen"
model — because that model doesn't exist yet.

---

## 2. Enterprise Console Placement

**Recommendation: Enterprise Console → POS Administration is correct, and
requires no new nav infrastructure.**

An **"Enterprise Console" group already exists** in the sidebar
(`Sidebar.jsx:259-273`), gated to `module: "userManagement"`, `roles:
["ADMIN"]`, with sub-items Branch/Outlets, Administration, Data Management.
A new "POS Administration" sub-item slots in directly alongside these,
following the identical `userManagement.*` (or a new `pos.admin.*`) module
key convention already used by `ModulePermissionService`'s dot-namespaced
resolution.

Placement rationale against the two alternatives named in the brief:

- **Not "Customers & Sales"** — that section is transaction-creation/day-to-day
  operational (invoices, returns, customer records). Corrections here are
  explicitly *post-transaction governance*, performed by roles above the
  cashier/sales level, often after the business date has closed. Putting it
  under Customers & Sales would make it discoverable to cashiers, which is
  the opposite of the intent.
- **Not "POS Operations"** — POS Operations (terminals, sessions, live
  registers) is real-time/shift-scoped. Denomination and transaction
  corrections in this brief explicitly target **closed** sessions/reports,
  i.e. things POS Operations has already finished with. Co-locating them
  would blur "what's still live" with "what's historical governance,"
  which is exactly the ambiguity Enterprise Console exists to separate out
  (it already separates Branch/Outlet setup and Data Management from
  day-to-day operational pages the same way).

This is Enterprise Governance + Financial Administration, not Operational
POS — matches Enterprise Console's existing charter.

One gap to flag for §12/§6: RBAC today has **only one scoping dimension —
branch** (`BranchContextHolder`/`BranchScope`). There is no formal
Region/Enterprise scope type; "Enterprise" access today just means
`isAllBranches=true` on an ADMIN-type role layered on the same single
dimension. If the brief's Branch/Region/Enterprise permission tiering (§12)
is taken literally, that's new scoping infrastructure, not a reuse of
something that exists — flagged as a real scope decision, not a detail.

---

## 3. Session Denomination Corrections

**Current state, precisely:**

- Denominations are **not** stored as a structured, queryable snapshot
  anywhere. They exist only as JSON blobs (`PosSession.closingDenominationsJson`,
  and buried inside `PosXReportSnapshot.reportJson` / `PosDayClose.zReportJson`).
- They are technically *editable* right now in the trivial sense that
  nothing stops a direct DB write — but there is no application-level edit
  path, and the entities' own doc comments assert immutability.
- Dependents: X-Report display, Z-Report display, Day Close display, and
  Cash Drawer/Cash Position reconciliation views all *read* the
  denomination breakdown for display, but **no downstream financial
  calculation consumes denomination counts** — `expectedCash`/`actualCash`/
  `cashDifference` are scalar totals computed independently of the
  denomination array. This is actually good news: **denomination is
  presentation/reconciliation detail, not a financial-total input** in the
  current schema. That materially de-risks the brief's "financial totals
  must never change" constraint — the current architecture already keeps
  them decoupled; the correction feature's job is to *keep them decoupled*,
  not to newly decouple them.

**Recommended architecture:**

1. Do **not** edit `closingDenominationsJson` / the JSON blobs in place, and
   do **not** open an update path on `PosXReportSnapshot`/`PosDayClose` —
   both are explicitly documented as append-only/immutable and other code
   already relies on that (e.g. no cache invalidation exists for those
   blobs anywhere).
2. Introduce a new, dedicated **`PosDenominationCorrection`** entity
   (append-only), referencing the session/X-Report/Day Close it corrects,
   storing: original denomination breakdown (copied at correction time, not
   re-derived later), corrected breakdown, reason, requested/approved/applied
   by+at. This is additive — it never touches the original snapshot rows.
3. Reports (X/Z/Day Close viewers) render the **original snapshot** plus,
   if a correction exists for it, an overlay/badge showing the corrected
   breakdown and a link to the correction record — never silently swap the
   displayed numbers. This satisfies §10's "never silently rewritten" rule
   for free, because the source blob is untouched.
4. Guard rail worth stating explicitly in the workflow UI: since
   `expectedCash`/`cashDifference` don't derive from denominations today,
   a denomination correction **cannot** be allowed to also adjust those
   scalar totals — if a correction implies the cash total was actually
   wrong, that is a **Transaction Correction** (cash movement / session
   total), a different, more consequential workflow, not this one. This
   boundary needs to be enforced in validation, not just documentation,
   or the "totals never change" guarantee silently breaks.

---

## 4. Transaction Corrections — field-by-field

| Transaction | Correctable fields | Must remain permanently immutable |
|---|---|---|
| Sales Invoice | Payment mode (with new leg/reversal, not overwrite), Customer (walk-in → named customer) | Item lines, quantities, prices, tax, invoice number, original invoice date, original totals |
| Sales Return | Reason/notes, categorization | Linked invoice reference, returned quantities/items, refund amount, return number |
| Customer Receipt (`ReceiptVoucher`) | Already correctable today (amount, payment mode) via reverse-and-repost — bring this under the new approval/audit regime rather than rebuilding it | Voucher number, original posting date |
| Advance Payment | New correction record only (append-only already) — no in-place field is safe to touch given balances are derived from the row set | The `AdvanceApplication` row itself — never edit, only supersede via a new row (already the pattern) |

**Cross-cutting implication (payment mode Cash→Card, worked through):**
Today, changing payment mode after the fact has no correction path at all —
`paymentMode` on `SalesInvoice` is only ever *re-stamped* during checkout,
never post-hoc. A correction here is **not a field edit**; it is a new
financial event: void/reduce the cash-side effect, create a card-side
effect, and everything downstream (Cash Drawer expected cash, Cash
Position, X/Z Report, Day Close, GL, Card Settlement reconciliation) has
to re-derive from that new event, not from mutating `SalesInvoice.paymentMode`
directly. If the session/day/period is already closed, this also has to
run through the reversal pattern already used for cash movement voids and
receipt voucher amount changes — i.e. this is fundamentally a GL-and-cash
reversal problem wearing a "correction" label, not a cosmetic data fix.

**Customer correction (Walk-In → named customer):** since there's no
materialized ledger, retargeting the customer is naturally handled by the
existing dynamic-statement computation — as soon as the invoice/receipt
correction record points at the new customer, `StatementService` picks it
up on next read. No ledger backfill job is needed *if* corrections are
modeled as new linked records rather than blob edits (again favors §5
Option B).

---

## 5. Transaction Correction Strategy — Option A vs B

**Recommendation: Option B — append-only correction records referencing the
original transaction. This is not a close call.**

The codebase already enforces this pattern everywhere it matters:
`JournalVoucher` cannot be edited once Posted (hard `throw`), every GL
correction anywhere in `PostingEngineService` is a new offsetting entry, and
even the one place that *does* allow direct mutation today
(`ReceiptVoucher.updateReceipt`) still routes its financial effect through
reverse-and-repost rather than editing GL in place. Building Option A
(direct update) for the new correction module would be introducing the
**one** genuinely new mutability pattern into a codebase that has
deliberately avoided it everywhere else — inconsistent with existing
conventions and strictly worse for audit/compliance with no offsetting
benefit for this feature (post-transaction governance has no performance or
UX reason to prefer in-place edits).

Comparison, briefly:

| | Option A (mutate) | Option B (append-only correction) |
|---|---|---|
| Audit | Requires bolting a diff log onto every mutated field, retroactively, on tables not designed for it | Audit is structural — the correction record *is* the audit trail |
| Historical reports | X/Z/Day Close snapshots would need special-casing to know whether their source data changed under them | Snapshots stay untouched; reports overlay corrections explicitly (§10) |
| GL | Already impossible to edit Posted journals — Option A would be inconsistent with this at the transaction layer while GL stays append-only underneath it, an awkward half-measure | Naturally symmetric with GL's existing reversal convention |
| Compliance/traceability | Weak — "what did this invoice originally say" requires log archaeology | Strong — original row is always the original row |

---

## 6. Financial Cut-off Rules

| After... | Denomination correction | Transaction correction |
|---|---|---|
| Open session | N/A (not closed yet — use normal session flows) | Normal edit flows apply, not this module |
| Closed session, no X-Report yet | Allowed, low friction (single supervisor approval) | Allowed, single approval |
| X Report generated | Allowed, requires approval | Allowed, requires approval + reason code |
| Z Report generated | Allowed, requires approval + reason code | Allowed, requires approval + reason code; GL reversal may already exist and must be re-checked |
| Day Close completed | Allowed, requires approval; correction must reference the Day Close explicitly since it's the top of the snapshot chain | Allowed, requires approval; must trigger GL reversal, not silent adjustment |
| Business date closed | Same as Day Close (same event in this system) | Same |
| GL Posted | N/A (denominations never touched GL) | **Requires a GL reversal entry** — cannot be "corrected" without one, per §5/existing convention |
| Accounting Period Locked | Allowed at the POS/denomination layer (doesn't touch GL) — correction record can still be created for record-keeping, but... | The **DB trigger will hard-block** any reversal journal dated inside the locked period. Correction must either (a) be rejected outright with a clear error, or (b) post the reversal at *current* date referencing the original period, never backdated. This needs to be a first-class validation, not a caught exception — the existing Postgres trigger will throw `PERIOD_LOCKED` and the correction workflow must treat that as "prohibited," not "retry." |

**Recommendation:** corrections should never be silently permitted once GL
is posted or the period is locked — they must always require approval, and
period-locked corrections should be flatly prohibited (matching the brief's
"permanently prohibited" tier) rather than attempting a backdated
reversal that the DB trigger would reject anyway.

---

## 7. Cash Movement Categories

**Current state:** `PosCashMovement` has zero category concept — only
`movementType` (DROP_IN/DROP_OUT) and free-text `description`. No GL
account mapping exists on the row (posting happens inline at creation,
`PostingEngineService.createJournalFromCashMovement`).

**Recommendation: yes, make categories Enterprise Master Data**, consistent
with how the rest of the system treats reference data (chart of accounts,
posting rules, payment methods are all master-data-managed centrally, not
per-branch). Proposed shape matches the brief's field list closely; the
one addition worth calling out: **GL Account Mapping should be optional at
category level with a fallback to the existing default cash-movement
posting rule**, because `createJournalFromCashMovement` already resolves an
account today with zero category info — categories should be able to
override that resolution, not replace the whole posting-rule mechanism
(reuse `PostingRule`/`DimensionMatrixService`, don't build a parallel
account-resolution path).

**Backward compatibility for movements without a category:** since
`PosCashMovement` explicitly forbids mutating `movementType`/`session`/etc.
post-creation, a `categoryId` column should be **nullable**, added via a
new Flyway migration (matching the checked-in `V54__pos_cashier_display_names.sql`
convention already in progress on this branch), with existing rows left
`NULL` — not backfilled with a guessed category, since that would fabricate
history. Reports should render `NULL` as "Uncategorized (legacy)" rather
than blocking on it. Whether new movements *require* a category should be
a feature-toggled cutover (`pos.cashmovement.category-required`, defaulting
false until categories are seeded per tenant), not a hard `NOT NULL` from
day one across all multi-tenant profiles — the CLAUDE.md multi-tenant list
has 13+ separate client databases, each needing its own migration window.

---

## 8. Correction Approvals

**Current state:** no unified approval engine exists — LPO and JV each
have their own bespoke implementation (§1.3). Building a **third** one-off
state machine for corrections would be the third divergent approval
pattern in the codebase; that's a real cost worth naming, but building a
shared abstraction now (retrofitting LPO and JV onto it) is out of scope
for this module and would be a much larger, riskier change than the brief
asks for. Recommendation: **build correction approval as its own
JV-style single implementation** (closest precedent, since threshold/role
gating is similar), and explicitly flag "unify approval engines" as a
separate future backlog item — not bundled into this delivery.

**State machine** — the brief's proposed states map cleanly onto the
JV precedent's shape:

`REQUESTED → PENDING → APPROVED → APPLIED`, with `REJECTED` and `CANCELLED`
as terminal branches off `PENDING`. Recommend **not** allowing
`APPROVED → CANCELLED` (once approved, a correction should be applied or
explicitly rejected-after-approval via a new reason-coded state, not
silently cancelled) — cancellation should only be available pre-approval,
matching how `JournalEntryService`'s approval flow already only allows
reject prior to posting.

**Approval hierarchy:** Cashier should never approve (they can only
*request*, consistent with them having no `pos.admin.*` access at all).
Supervisor/Branch Manager can approve **within-branch, low-materiality**
corrections (denomination corrections, cash movement recategorization).
Finance/Enterprise Admin required for anything touching GL/posted
journals or crossing a closed period. This maps directly onto the RBAC
recommendation in §12.

**Configurability:** recommend a simple threshold-based rule
(mirroring `financials.jv.approval-threshold-aed`) rather than a
fully generic configurable workflow engine — e.g.
`pos.admin.correction.approval-threshold-aed`, plus a hardcoded
"anything touching Posted GL always needs Finance" rule. A fully
configurable workflow-builder is disproportionate to this module's
scope and isn't precedented anywhere else in the codebase.

---

## 9. Financial Integrity — posting recalculation

**Payment Mode correction (Cash → Card):** must **not** be a silent
recalculation. It must generate:
1. A reversing entry against the original cash-side GL posting.
2. A new card-side GL posting + `Payment` leg row + Card Settlement
   linkage.
3. A `PosCashMovement`-equivalent adjustment or explicit note so Expected
   Cash for the *original* session reconciles (the session is closed, so
   this likely posts as an out-of-session adjustment tagged to the
   original session for reporting, rather than reopening it — reopening a
   closed session is explicitly not supported today and shouldn't be
   introduced just for this).
4. X/Z Report and Day Close numbers are **not** rewritten — the
   correction appears as a delta layered on top, per §10.

**Customer correction (Walk-In → named customer):** since Customer Ledger
and Statement are already dynamically computed (§1.2), retargeting the
customer reference on the correction record is sufficient — no ledger
"update" job needed, confirming Option B's advantage in §5.

---

## 10. Historical Reports

**Recommendation: originals stay immutable; reports display Original →
Correction → Current Effective State, never overwrite.** This is already
the path of least resistance given §1's finding that X-Report/Day Close
are blob snapshots with no update path — building a rewrite capability
would be *more* engineering effort than building the overlay, not less.
Report viewers should:
- Always render the persisted snapshot as-is.
- Query for any correction records referencing that snapshot/session/day
  and render them as a clearly labeled adjustment section, with a link to
  the correction's approval trail.
- Never merge corrected values back into the original JSON blob.

---

## 11. Audit Trail

**Recommendation: dedicated correction entities are required** — the
existing `AuditLog.details` free-text field (§1.2) is not structured
enough to reconstruct "what changed" reliably, and it's also the
*general security* audit trail (distinct from `FinancialAuditService` and
`PosAuditLog` per CLAUDE.md's three-subsystem note), so overloading it for
financial correction detail would blur an already-split audit
architecture further. Each correction entity should carry, as first-class
columns (not JSON): original value, corrected value, correction type,
reason, requested/approved/applied by+at, affected transaction FK,
session FK, business date. This also gives clean queryability for §13
reporting, which free-text audit logs don't.

---

## 12. RBAC

Proposed permissions from the brief map cleanly onto the existing
dot-namespaced module convention (`pos.admin.*`), consistent with how
`permissions.pos.terminal.approve` already works. Suggested role mapping:

| Permission | Cashier | Supervisor | Branch Manager | Finance | Enterprise Admin |
|---|---|---|---|---|---|
| `pos.admin.view` | ✗ | ✓ | ✓ | ✓ | ✓ |
| `pos.admin.session.correct` (denomination) | ✗ | ✓ (request) | ✓ (approve, in-branch) | ✓ | ✓ |
| `pos.admin.transaction.correct` | ✗ | ✓ (request) | ✓ (request) | ✓ (approve) | ✓ |
| `pos.admin.cashmovement.category.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pos.admin.cashmovement.category.manage` | ✗ | ✗ | ✗ | ✓ | ✓ (master data — Enterprise-level) |
| `pos.admin.approvals.view` | ✗ | ✓ | ✓ | ✓ | ✓ |
| `pos.admin.approvals.approve` / `.reject` | ✗ | ✓ (low-materiality only) | ✓ (branch) | ✓ (GL-touching) | ✓ |
| `pos.admin.audit.view` | ✗ | ✗ | ✓ (own branch) | ✓ | ✓ |

**Should permissions differ by Branch/Region/Enterprise?** As flagged in
§2: the system today only has a **branch** scope dimension — there is no
Region concept anywhere in `BranchScope`/`BranchContextHolder`. If Region
is genuinely required (brief mentions it explicitly in §12), that's new
infrastructure, not a reuse — worth confirming with the requester whether
"Region" is a real near-term need or can be deferred, since introducing a
new scope tier touches `ModulePermissionService` resolution logic broadly,
not just this module. Recommendation for v1: implement Branch vs
Enterprise-wide only (matches what exists), and treat Region as a phase-2
item once real multi-region tenants require it.

---

## 13. Reporting Impact

Recommendation: reports should show **effective state by default**, with
an explicit drill-down to Original/Correction/Adjustment detail — not both
inline everywhere, which would clutter every report screen for the common
case of "nothing was corrected." Cash Reports, Day Close, X/Z Reports,
Customer Ledger/Statement, Debtors Summary should all carry a
correction-indicator badge when a correction exists, linking to the
correction's full audit trail (§11) rather than expanding it inline.

---

## 14. Backward Compatibility

Because §5 (append-only) and §7 (nullable category, feature-toggled
requirement) are both purely additive, none of the flows listed in the
brief (POS Checkout, Cash Movements, Customer Ledger, Receipt Voucher,
Customer Advances, Sales Invoice, Sales Return, Payment Allocation, GL
Posting, X/Z Report, Day Close) require any change to their existing write
paths — the correction module reads their data and writes new,
independent tables. The one behavior change to sequence carefully: once
`pos.admin.cashmovement.category-required` flips true for a tenant, the
cash-movement creation endpoint gains a new required field — that's a
frontend+backend coordinated release, not a silent schema change, and
should ship per-tenant via the existing per-profile deployment model
(CLAUDE.md's 13-profile list), not globally on merge.

---

## 15. Deliverables Summary / Phased Roadmap

This review satisfies items 1–2 of the requested deliverable list
(current architecture, Enterprise POS Administration placement) in full,
and gives concrete direction for 3–14. Recommended phasing for actual
implementation (future work, not started):

**Phase 1 — Foundations (no user-facing correction flow yet)**
- New Flyway migrations: `PosDenominationCorrection`, `PosTransactionCorrection`
  (or per-type tables — TBD in design), `PosCashMovementCategory`, correction
  approval state machine table(s).
- `pos.admin.*` RBAC permissions + `rbac.pos.enabled` toggle wired into
  `RolePermissionInitializer`/`ModulePermissionService`.
- Enterprise Console → POS Administration nav shell (empty pages), gated.

**Phase 2 — Cash Movement Categories** (lowest risk, no GL/reversal complexity)
- Master data CRUD, optional GL mapping, nullable `categoryId` migration,
  per-tenant cutover toggle.

**Phase 3 — Session Denomination Corrections**
- Correction entity + approval workflow + report overlay rendering
  (§3, §10). No GL involvement — good second step to validate the
  approval engine before GL-touching corrections.

**Phase 4 — Transaction Corrections + GL reversal integration**
- Highest risk/complexity: payment-mode and customer corrections, wired
  through `PostingEngineService`'s existing reversal methods, period-lock
  validation (§6), Cash Position/X/Z Report overlay rendering.

**Phase 5 — Reporting & audit polish**
- Structured audit views (§11), correction-indicator badges across
  Customer Ledger/Statement/Debtors/Day Close/GL reports (§13).

### Key risks

- **Denomination-vs-total decoupling must be enforced in validation**, not
  just assumed — see §3 guard rail. If violated, this reopens the exact
  problem the brief is trying to prevent.
- **Period-lock interaction**: the existing Postgres trigger will hard-fail
  any reversal dated inside a locked period; the correction workflow must
  treat that as a designed rejection, not an error to work around.
- **Three divergent approval engines** (LPO, JV, and this new one) is an
  accepted, explicitly-scoped-out tech debt item, not an oversight — flag
  it, don't silently absorb it into this module's scope.
- **Region-level RBAC** doesn't exist yet; confirm whether it's truly
  required before building it, since it's the one piece of this brief that
  isn't a reuse of existing infrastructure.

### Key edge cases to design against explicitly (not resolved here)

- Correcting a transaction whose session/day/period spans a Day Close
  boundary that itself later gets corrected (correction-of-a-correction
  chaining — recommend disallowing corrections *on* correction records;
  only originals are correctable, corrections are terminal).
- A correction approved by Branch Manager where the underlying GL turns
  out already period-locked by the time it's applied (approval and apply
  are not atomic) — apply step must re-validate, not trust the approval
  snapshot.
- Multi-tenant rollout: category-required toggle and new RBAC permissions
  need per-profile sequencing across the 13+ client databases, not a
  single global cutover.
