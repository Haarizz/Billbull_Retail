# Global Search — Details Panel Decisions

**Status: settled.** These are product decisions, not open questions. A future change to any of
them is a new decision, not a bug fix — the shapes and labels below are deliberate and each one
has a reason recorded beside it.

This document covers the **shipped** global search (`components/search/GlobalSearchModal.jsx` +
`api/globalSearchApi.js` + `api/entityDetailApi.js`). It is unrelated to
`docs/future-enhancements/08-search-and-indexing*.md`, which are research/design notes for a
different (trigram + ranked UNION) architecture that has not been built.

---

## Customer

| Field | Definition |
|---|---|
| Opening balance | `Customer.balance` — the balance carried in at setup. Not "the balance". |
| Outstanding | Invoice outstanding + opening outstanding. What is owed now. |
| Total sales | Opening balance + lifetime invoiced. |
| **Total paid** | **`totalSales - outstanding`**, lifetime, **computed server-side**. |
| **Overdue amount / count** | Invoices with `dueDate < today` **and** `balance > 0`, within the same status window as Outstanding (`NOT IN (CANCELLED, PAID)`). One grouped query. |
| **Last Invoice** | Date (and number) at the head of the bounded recent-invoice list. |

**Total Paid is not a receipt-voucher sum.** A receipt-voucher total misses any sale settled at
the till without one, and could contradict the Outstanding shown beside it. `totalSales -
outstanding` is consistent with the other two figures by construction. The client does **not**
perform the subtraction — it echoes the server's number, so there is exactly one definition.

**Overdue is strictly `<` today.** An invoice due today has not yet fallen due. Invoices with no
`dueDate` cannot be aged and are excluded. The amount sums the invoices' own persisted `balance`,
never `invoiceTotal`. It deliberately does **not** use `countOverdueInvoices`, which is global
(no customer predicate) and ages from `invoiceDate` — a different definition entirely.

**Due Amount is omitted, permanently.** It would be Outstanding under a second label, and one
number under two names reads as two facts.

**"Last Transaction" does not exist.** A union across invoices, receipts, JVs and credit notes
produces a figure no reader can interpret without asking what went into it. The panel names the
document it actually shows: Last Invoice.

---

## Vendor

| Field | Definition |
|---|---|
| Opening balance | `Vendor.openingBalance` as entered. |
| Remaining opening outstanding | `max(0, openingBalance − on-account payments)`. |
| Payable | Invoice outstanding + remaining opening outstanding. |
| **Total paid** | Lifetime POSTED/CLEARED payment vouchers. **No date predicate.** |
| **Invoices past due** | **Count only.** POSTED, `paymentStatus <> PAID`, `dueDate < today`. |
| **Last LPO** | Date (and number) at the head of the bounded recent-LPO list. |

**There is no vendor overdue amount, and there must never be one.** `PurchaseInvoice` stores no
per-invoice balance the way `SalesInvoice` does. The gross `grandTotal` is not a remaining
balance, and netting vendor-level payments against particular invoices would attribute money to
documents it was never applied to. The **count** needs none of that: whether an invoice is settled
is a fact it already carries in its own `paymentStatus`.

This is why the customer panel shows an overdue amount and the vendor panel does not. The
asymmetry is the data model, not an oversight — and the same applies to Total Paid, which reaches
its figure by a different route on each side because vendor and customer accounting are not
mirrors of each other.

---

## Employee

**Identity only.** Name, employee code, designation, department, branch, status.

**Never shown:** basic salary, allowances, deductions, net pay, salary YTD, payslips,
performance, attendance, leave. Attendance and leave have no module behind them at all.

The panel enforces this structurally rather than by omission: it **issues no request**. It renders
from the search row, which comes from `EmployeeSearchResponse` — a projection carrying identity
only. `GET /api/employees/{id}` returns the whole `Employee` including salary columns and is never
called from the detail layer, so that payload never exists in the browser.

**Permission:** `hr.employee` only, which already gates the search that produced the row. No
payroll permission is required because no payroll data is exposed.

Global search is reachable by keyboard from every screen and is frequently on-screen in shared and
counter contexts. The cost of a shoulder-surf there is a personnel incident, not a wrong number.
Anyone who needs the rest of the record opens the HR page, where each field sits behind its own
gate.

---

## Branch behaviour

**Who is restricted** is decided by the JWT's `isAllBranches` claim, which `JwtUtil` sets for
`ADMIN` and `SUPER_ADMIN` only. Every other role — **`BRANCH_ADMIN` included** — is confined to
its primary plus additional branches. No search predicate tests a role name.

- **Restricted users** see only records of a branch they can reach, plus records with no branch
  attribution (legacy rows stay visible, as everywhere else).
- **Everyone else** searches across branches, with the branch shown on the row so the destination
  is predictable before the click.
- **The Branch Selector does not narrow search.** It narrows list pages for everyone, admins
  included (`currentListScope`). Search uses `currentSearchScope()` instead, which ignores it:
  someone looking up a record they know exists should not be told it does not exist because a
  selector elsewhere in the UI points at another branch.
- **Search never switches the active branch** and never mutates branch context. Navigation is
  navigation.

Enforcement is **server-side, in the query** — `VendorRepository.searchVendors`,
`EmployeeRepository.searchEmployees`, `CustomerRepository.searchAllFields`. The frontend applies no
branch filter of its own and is not trusted to.

For customers and vendors the predicate also checks **branch allocations**, not just the branch FK:
the FK is only the default branch, and a party allocated to the caller's branch must not vanish
because its default is elsewhere.

### The detail panels are scoped too — with one deliberate exception

The panel is assembled from more than one read, and they do not all answer the same kind of
question, so they do not all get the same treatment.

**Branch-scoped (document and voucher reads).** These return branch-attributed rows, and every
other read of the same entity in the app is scoped, so the panel is not allowed to be the one
place a restricted caller sees another branch's records:

| Read | Query |
|---|---|
| Customer → recent invoices | `SalesInvoiceRepository.findRecentByCustomerCodeScoped` |
| Vendor → recent LPOs | `LpoRepository.findRecentByVendorId` |
| Ledger account → recent transactions | `LedgerEntryRepository.findRecentByAccountCodeScoped` |

Each uses `currentSearchScope()`, the same predicate as search, so a row that could not be found
cannot be read either. `findRecentByCustomerCode` (unscoped) stays as the POS History tab's query:
a till already runs inside one branch, and global search does not.

**Deliberately company-wide (party financial summaries).** Customer Outstanding / Total Sales /
Total Paid / Overdue and Vendor Payable / Total Paid are company-wide figures, because the customer
and vendor **list pages compute them company-wide too**. Scoping them here would make the panel
disagree with the page it links to, and a per-branch party balance is an undefined figure — see
**Deferred** below. A restricted user therefore sees a party's whole-company balance and only their
own branches' documents beneath it. That asymmetry is intentional and is the boundary between this
decision and the deferred one.

**Open — ledger account balances.** `GET /api/ledger/accounts/{code}/summary` returns the account's
company-wide debit/credit totals plus a **per-branch breakdown of every branch**, and it is not
scoped. That is a live inconsistency, not a settled decision: the COA tree deliberately shows a
branch-scoped balance (`LedgerService.resolveBranchScopedBalances` — "a branch with no transactions
on an account must show zero, not the company-wide total"), so a branch-restricted user with
`finance.ledger` sees more in this panel than on the Ledger page. Scoping the balance rows and the
totals to the caller's branches would resolve it and keep the rows adding up to the total, at the
cost of changing the figures this panel currently shows. **Needs a product decision before
release.**

---

## Dashboard search

The dashboard dropdown and the modal share one service (`api/globalSearchApi.js`) but not one
source list. The dropdown searches `DASHBOARD_SEARCH_SOURCE_KEYS`:

**Included:** products, customers, invoices, LPOs, GRNs, quotations, **vendors, ledger accounts**.
Vendors and ledger accounts joined the list in Phase 2B-3, once `entityNavigation` had a verified
route contract for both (`vendor-detail` → Vendor.jsx's `vendorId`, `ledger-account-detail` →
Ledger.jsx's `accountCode`). A source belongs on the dropdown only when its rows can actually be
opened; before that it would return rows that do nothing when clicked.

**Excluded: employees.** The route exists — this is about visibility, not capability. The dashboard
dropdown is the most ambiently-visible search surface in the app; the modal is one a user opens on
purpose, and that is where employee records belong.

**Known gap:** the dropdown passes no permission predicate, so it requests every pinned source and
a user without `purchases.vendor` or `finance.ledger` collects a 403 toast per denied source per
search. The modal filters by `canView` before dispatching. Worth closing; not a security issue
(the backend denies correctly either way).

---

## Deferred

- **Per-branch breakdown for customers and vendors** (activity / outstanding / paid by branch).
  The ledger panel's branch breakdown stays — that one is real GL data. The party equivalents need
  a definition nobody has settled and are not shipped with a guessed one.
- **Cross-branch navigation outcome.** A result from another branch opens a destination page whose
  own filter may be active-branch-scoped. All five destination pages resolve the incoming id
  against the roster they have already loaded and **no-op when it is absent** — the user lands on
  the page with nothing opened and no explanation. The branch is shown on the search row so the
  click is not blind, but the silent no-op is a real rough edge. A one-line "this record belongs to
  another branch" notice on the destination page would explain it without changing any business
  behaviour; no branch-switch workflow has been or should be invented.
- **Employees on the dashboard dropdown.** The route exists; the decision not to is about
  visibility, not capability.
