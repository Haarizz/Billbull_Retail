# Sales Return — Reporting Audit & Fix

**Date:** 2026-10-02
**Scope:** how an approved Sales Return is represented across Sales Reports, POS X/Z Reports,
Day Close, Inventory Reports, Financial/GL Reports, Customer Statements, VAT reports and exports.
**Out of scope (unchanged):** the Sales Return transaction flow itself — eligibility, approval,
authorization, the economic split, restock planning, journal shapes, refund settlement.

---

## 1. The reporting basis, decided

The brief flagged a basis mismatch and asked for one documented answer. The answer is taken from
the shipped Back Office Sales Report contract rather than invented:

| | Definition | Basis |
|---|---|---|
| Gross Sales | `Σ SalesInvoice.invoiceTotal` (recognized invoices) | **VAT-inclusive** |
| Returns | `Σ SalesReturn.totalAmount` (APPROVED) | **VAT-inclusive** |
| Net Sales | `Gross Sales − Returns` | **VAT-inclusive** |

`sales_returns.total_amount` is VAT-inclusive, so the subtraction is like-for-like with no
conversion. The ex-VAT figures are derived by netting tax off **both** sides —
`(gross − salesTax) − (returnValue − returnTax)` — never by subtracting a VAT-inclusive return
from an ex-VAT sales figure.

`netSalesBasis: "VAT_INCLUSIVE"` is now published in the POS report payload itself, so a
consumer can assert which basis it was handed instead of assuming one.

**What was deliberately not redefined.** The POS summary's existing `netSalesExTax` /
`salesAmountExTax` / `taxableSales` keys keep their current meaning — the taxable base *before*
returns. That is what the X-Report's VAT section needs and what `pos_day_close.net_sales` has
always stored. Redefining them in place would silently restate every historical Z-Report. The
returns-aware figures are additive and separately named (`reporting*`).

---

## 2. Audit findings

### 2.1 Sales Report (Back Office)

| Field | Value |
|---|---|
| **Report** | Sales Summary, Daily Sales, Customer/Item/Branch summaries |
| **Current source** | `SalesReportDataService`, `data.returns` ← `SalesReturnRepository.findForReports(from,to)` |
| **Current formula** | `netSales = Σ invoiceTotal − Σ return.totalAmount`; `VAT Collected = Σ invoice.taxTotal` |
| **Expected formula** | same, but branch-scoped, APPROVED-only, and VAT net of return VAT |
| **Defect 1 — HIGH** | `data.returns` had **no branch filter**. Invoices and delivery notes were branch-filtered; returns were not. On a multi-branch tenant, selecting Branch A subtracted *every* branch's returns from Branch A's sales. A branch that took no returns at all could still show Net Sales reduced; only the all-branches total was right. |
| **Defect 2 — MEDIUM** | `isApprovedReturn()` returned true when `status == null`, so a row with no status counted as a return. DRAFT/CANCELLED were excluded, null was not. |
| **Defect 3 — MEDIUM** | The Sales Summary "VAT Collected" card showed **gross** output VAT, while the Tax Summary report over the same dates showed `vat − returnVat`. Two reports, one date range, two VAT answers. |
| **Fix** | Added `matchesReturnBranch()`; `isApprovedReturn()` delegates to the one shared rule (APPROVED only); the card now publishes `netTax` from the shared block. |

Verified correct and left alone: `taxSummary` already nets returns at ex-VAT base
(`subTotal`/`taxAmount`, not `totalAmount`); customer/item/branch rows already net returns;
date filtering is on `returnDate`.

### 2.2 POS X Report

| Field | Value |
|---|---|
| **Report** | X-Report (active/selected session) |
| **Current source** | `PosSessionService.getXReport` → `buildSessionReturnsSummary` (branch+date, filtered to this session's invoices) |
| **Current formula** | per-method buckets from `refund_method`; `netSalesExTax = totalSales − totalTax` |
| **Expected formula** | returns deducted from Net Sales on the declared basis |
| **Already correct** | Classification keys on `refund_method` with a legacy-label fallback, not on free-text `returnAction`; cash refunds come from `Σ refundAmount where refund_method = CASH_REFUND`, which is the same population the drawer's `SALES_RETURN_REFUND` DROP_OUT movements are booked from; non-cash refunds imply no cash movement; session scoping prevents another session's same-day return leaking in. |
| **Defect 4 — HIGH** | **Returns were never deducted from any sales figure.** The published Net Sales was `totalSales − totalTax`, before returns. |
| **Defect 5 — MEDIUM (frontend)** | The "Returns" KPI tile read `totalRefunds` — refund *Payment* rows against this session's invoices — while the Returns/Refund section below read `salesReturnTotal`. The headline and the detail of the same report disagreed, on different populations. |
| **Fix** | Publishes the shared `NetSalesReportingBlock`; the KPI reads `salesReturnTotal`; a "Net Sales" KPI (inc. VAT, after returns) was added, read from the backend and never recomputed client-side. |

### 2.3 POS Z Report / Day Close

| Field | Value |
|---|---|
| **Report** | Z-Report, Day Close summary, `pos_day_close` snapshot |
| **Current source** | `buildReturnsSummary(branchId, date)` → `findByReturnDateAndBranchWithItems` |
| **Current formula** | as X, plus `netQuantitySold = totalItemsSold − totalQtyReturned` |
| **Defect 4 (same as X) — HIGH** | Z-Report "Net Sales Including VAT" **repeated Gross Sales verbatim**. A day with returns exported the same Net Sales as a day without any. Quantity was netted; value was not. |
| **Defect 6 — LOW / FLAGGED** | `pos_day_close.net_sales` stores `netSalesExTax` (ex-tax, before returns) and `gross_sales` stores the POS line-gross pre-discount — a third basis again, and there are no return columns on the snapshot. Left as-is: changing the column meaning would restate historical Day Close records. The report payload now carries the correct figures; persisting them needs a migration and a Finance decision. |
| **Fix** | Same shared block; Z view-model and Excel export now emit `Sales Returns`, `Net Sales Before VAT` and `Net Sales Including VAT` from backend figures. Business-date resolution untouched (`BusinessDayClock` / `BusinessDayWindowService`). |

### 2.4 Dashboard & Sales Analytics

| Field | Value |
|---|---|
| **Current source** | `DashboardService` and `SalesAnalyticsService` → `getTotalReturnsBetweenDates`, `findDailyReturnsTrend`, `findDayReturnSnapshot` |
| **Defect 7 — HIGH** | `getTotalReturnsBetweenDates` and `findDailyReturnsTrend` had **no status predicate at all** — DRAFT and CANCELLED returns were reported as value returned. A cancelled return permanently inflated the Returns KPI and the trend chart. |
| **Defect 8 — HIGH** | `SalesAnalyticsService` called the **branch-less overload**, so a branch-filtered analytics view subtracted the whole group's returns while every other metric in the same response was branch-scoped. Its return *count* was a raw row count over `findByReturnDateBetween` — DRAFT and CANCELLED included. |
| **Defect 9 — MEDIUM** | `findDayReturnSnapshot` (the POS card badge) excluded CANCELLED but **included DRAFT**. |
| **Fix** | All three queries are APPROVED-only; the branch-less overloads were deleted so no caller can opt out of branch scope; a new `countApprovedBetweenDates(from,to,branchId)` replaces the row count. |

### 2.5 Inventory Reports — no defect found

Traced `Sales Return → stock_movements → balance → reports`. Correct as shipped:

- `source_type = SALES_RETURN`, inbound quantity positive, via `reverseOutboundStock`.
- `movementDate = salesReturn.getReturnDate()` — the server-authoritative business date, passed
  explicitly rather than defaulted to `now()`.
- `unitCost` comes from `SalesReturnRestockPlan`, and approval is **refused** when any
  resaleable line has no resolvable cost (`assertRestockCostsResolved`), so quantity never rises
  with nothing to value it at.
- Warehouse, bin, batch number and expiry are carried from the original allocation.
- **No double counting:** `applyNonBatchStockReturns` skips any line with batches, which
  `applyBatchReturns` owns. Inventory reports aggregate `stock_movements` generically, so the
  return appears exactly once; `movementLabel` maps `SALES_RETURN → "Return"`.
- A scrap return posts no stock movement *and* no inventory journal — one `restocksInventory`
  verdict drives both, so they cannot disagree.

### 2.6 Financial / GL Reports

Journals verified against the GL, not re-derived:

```
Return journal (ref = returnNumber)
  Dr Sales Revenue 4001 (or Deferred Revenue 4005)   netRevenue
  Dr VAT Output                                      taxAmount
  Cr Accounts Receivable 1100                        totalAmount

Inventory journal (ref = returnNumber + "-INV"), only when something restocked
  Dr Inventory / Cr COGS                             costOfGoodsReturned

Settlement (card/bank, ref = returnNumber + "-RFND")
  Dr Accounts Receivable / Cr Merchant Clearing or Bank    paidPortion
```

Cash clears AR via the drawer DROP_OUT category; a voucher via the voucher-issue journal
(`Dr AR / Cr Credit Vouchers Issued 2061`); CUSTOMER_CREDIT deliberately leaves the credit on
AR. Net AR credit therefore equals the unpaid portion, which is exactly what the allocation row
reduces the invoice balance by — GL AR and the AR sub-ledger agree by construction. Receivable
uses the single canonical `InvoiceBalanceService.effectiveOutstanding`; no second balance
formula was introduced. VAT reports read ledger entries, so return VAT reverses automatically —
no parallel tax calculation was created.

| **Defect 10 — FLAGGED, NOT CHANGED** |
|---|
| The return journal debits **4001 Sales Revenue** directly, not the contra-revenue account **4002 Sales Returns** that exists in the chart and that `createJournalFromCreditVoucherCancellation` credits. Consequence: the revenue reversal is buried inside 4001's net balance, so there is **no way to read a period's Return Revenue Reversal out of the GL**, and a P&L "Sales Returns" line reads ~zero. The §13 reconciliation "Sales Report return value = GL return revenue reversal" is therefore not satisfiable from account balances today — it reconciles against the `sales_returns` ledger instead. P&L *bottom line* and the trial balance are correct either way. Redirecting the debit to 4002 changes GL history comparability and the meaning of two accounts; that is a Finance decision, not a reporting fix, so it is reported and left alone. |

### 2.7 Customer Statement — no defect found

`StatementService.buildSalesReturnEntries` matches the intended model:

- `RETURN_CREDIT` = full return value, credit, one row per approved return.
- `RETURN_REFUND` = `refundAmount` (the server-derived paid portion), debit, emitted **only**
  when that is positive **and** `settlesOutsideReceivable()`.
- Net receivable reduction = `value − paidPortion` = the unpaid portion. Correct, and not
  double-counted.
- Both rows are dated on `returnDate` with explicit `sortPriority`, and the query is
  APPROVED-only (`findApprovedForStatement`).

### 2.8 Date / time consistency — no defect found

`SalesReturnService.stampAuthoritativeBusinessDate` writes **one** value to both `returnDate`
and `tradingDate`, resolved by `resolveAuthoritativeBusinessDate` as
`COALESCE(session.tradingDate, session.sessionDate, branch Business Day)` — the same rule POS
checkout stamps on the invoice, reading the configured POS timezone rather than the server's.
It is stamped on creation only, so approving after midnight cannot move the accounting date.
Every report path queries `returnDate`, and the dashboard's `COALESCE(tradingDate, returnDate)`
is the same date because the two columns are equal by construction. No new timezone mechanism
was introduced and none was needed.

---

## 3. Single return reporting model

Three independent copies of the return arithmetic were replaced by one:

- `sales/returns/reporting/SalesReturnReportingTotals` — one scope's approved returns:
  `count, value, base, tax, discount, quantity`, per-method refund buckets, the legacy/
  unclassified residue, `refundsPaidOut()` and `creditNotesIssued()`. Invariant
  `value == base − discount + tax`.
- `sales/returns/reporting/SalesReturnReportingService` — the only place `sales_returns` becomes
  report figures. Owns the APPROVED-only rule (`isReportable`) and the `refund_method` + legacy
  label resolution, so no caller can opt out of either.
- `sales/returns/reporting/NetSalesReportingBlock` — `grossSales / returnValue / netSales /
  salesTax / returnTax / netTax / grossSalesExTax / returnValueExTax / netSalesExTax /
  salesQuantity / returnQuantity / netQuantity` plus `cashRefund / cardRefund / bankRefund /
  creditVoucherRefund / customerCredit`, and the declared `netSalesBasis`.

`PosSessionService`'s private `ReturnsSummary` class and `aggregateReturns`/`resolveRefundMethod`
methods were deleted; that file now decides only the **scope** (branch+date for Z, filtered to
the session's invoices for X). `SalesReportDataService` reads the same service.

---

## 4. Decision gates honoured

- Decision 1 (over-refund behaviour) — untouched.
- Decision 3 (held credit in available limit) — untouched.
- Decision 7 (customer-credit liability account) — **not implemented.** CUSTOMER_CREDIT with a
  paid portion remains blocked with a stated reason in `assertSettlementMethodMatchesSplit`.
- No historical data was read, rewritten, corrected or migrated. No schema change was made.

---

## 5. Remaining known issues

1. **Defect 10** — return revenue reversal is not separable in the GL (4001 vs 4002). Needs
   Finance sign-off before any posting change. **Status: BLOCKED — FINANCE DECISION REQUIRED.**
   See §6.
2. **Defect 6** — `pos_day_closes` persisted `net_sales`/`gross_sales` on two bases that are
   neither of them the reporting basis, and had no return columns. **Status: RESOLVED** by
   additive columns in `V112__pos_day_close_reporting_net_sales.sql`. See §6.
3. Historical rows written before `refund_method` existed are reported as a visible
   `returnLegacyPaidOut` / `returnLegacyLedgerCredit` / `returnUnclassified` residue rather than
   attributed to a bucket. This is deliberate; it is also why per-method rows need not add up to
   Refunds Processed on a historical day.
4. Any report figure that was wrong before this change stays wrong for periods already closed.
   Correcting them is the separate Finance-approved remediation task.

---

## 6. Follow-up: Defect 6 resolved, Defect 10 blocked (2026-10-02)

### Defect 10 — 4001 vs 4002: BLOCKED — FINANCE DECISION REQUIRED

No Finance decision was available, so **no posting was changed**: the Sales Return journal still
debits 4001. Nothing was migrated, no corrective journal was created, no closed period was
touched. The findings that a decision needs to weigh:

| | |
|---|---|
| Current return posting | `PostingEngineService.createJournalFromSalesReturn` debits **4001 Sales Revenue** when revenue was recognized, or **2051 Deferred Revenue** when it was not. (Note: there is no 4005 — Deferred Revenue is the liability 2051, not a revenue account.) |
| Only existing 4002 poster | Exactly one path credits 4002: `createJournalFromCreditVoucherCancellation`, releasing an unredeemed voucher balance. 4002 therefore carries **credits only** today, and in the dev tenant has no ledger activity at all (4001: 201 lines, Dr 25,885.73 / Cr 295,284.47 — the Dr side being the return reversals). |
| Historical meaning of 4001 | Sales revenue **net of returns**. Every return reversal since inception is inside its net balance. |
| Historical meaning of 4002 | A declared contra-revenue account (`normalBalance = Dr`, group REVENUE) that has only ever been used, in one narrow case, with the opposite sign. |
| Cancellation behavior | An APPROVED sales return cannot be cancelled — `assertCreationStatusAllowed` permits CANCELLED only for a draft, which has no journal. So there is no reversal path that would need a matching 4002 treatment. |
| P&L presentation | **Blocking prerequisite.** `FinancialReportService` folds the REVENUE group as `totalRevenue += netBal.negate()` where `netBal = Σcredit − Σdebit`. A Dr-balance account in that group is therefore **added** to revenue, not subtracted. Redirecting returns to 4002 today would *inflate* reported revenue by the return value instead of reducing it. 4003 (Trade Discounts Given) is declared the same way and is equally unused, so the gap is currently dormant. Contra-revenue handling must be fixed in the P&L builder **before** any 4001 → 4002 change. |
| Trial balance impact | None. Both accounts are PL/REVENUE and the entry balances either way. |
| GL reporting impact | The upside of the change: a period's Return Revenue Reversal becomes readable from account balances. Today it is only obtainable from the `sales_returns` ledger, which is what the §13 reconciliation uses. |
| Comparability impact | A mid-life switch splits one series into two: 4001 before the cut-over means "net of returns", after it means "gross". Any year-on-year revenue comparison spanning the cut-over needs both accounts summed. |
| Required migration | **None, and none was written.** Were the change ever approved, the correct scope is forward-only from a Finance-chosen date, plus the P&L contra-revenue fix above. Restating history would mean rewriting closed-period journals. |

### Defect 6 — `pos_day_closes` reporting snapshot: RESOLVED (additive)

- `V112__pos_day_close_reporting_net_sales.sql` adds eight **nullable, un-defaulted** columns:
  `reporting_gross_sales`, `reporting_return_value`, `reporting_net_sales`,
  `reporting_sales_tax`, `reporting_return_tax`, `reporting_net_tax`,
  `reporting_net_sales_ex_tax`, `reporting_net_sales_basis`.
- `gross_sales` and `net_sales` keep their existing meanings (POS line gross pre-discount; the
  pre-returns taxable base). Nothing is redefined and no historical row is written.
- `closeDay` fills the new columns by reading the Z-Report's own
  `NetSalesReportingBlock` back out via `NetSalesReportingBlock.fromSummaryMap` — the
  persistence layer performs no sales arithmetic, so there is still exactly one implementation
  of the calculation.
- Forward-fill only, and structurally so: `PosDayCloseLockTriggerInstaller` makes
  `pos_day_closes` rows immutable at the database level, so a backfill would require dropping
  that trigger. Historical rows read back with NULLs, and `GET /api/pos/reports/z/{id}` returns
  `persistedReporting: null` for them rather than reinterpreting their `net_sales`.
