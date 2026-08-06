# Phase 10 — Reports, Dashboards & Final Payment Architecture Cleanup

**Date:** 2026-08-06
**Branch:** `feature/posclient`
**Status:** Complete. Backend 835/835 tests green, frontend 111/111 green, both builds succeed.

> **Note on the handover.** No Phase 1–9 architecture handover document exists in the repository
> (`docs/` has no payment-architecture phase docs, and nothing matching is untracked). The
> architecture was therefore re-derived from the Phase 1–9 code already in the working tree —
> principally `PosPaymentAllocationResolver`, `PosPaymentPlan`, `InvoicePaymentSummaryService`,
> `PaymentReconciliationService` and the frontend `POS/payments/` module, all of which are
> heavily documented. Nothing already-completed was redesigned. This document is the handover
> for Phase 10.

---

## 1. What Phase 10 changed, and why

Phases 1–9 made payment **allocations** the way money is captured and recorded. Three consumers
were still deriving payment facts from the invoice's `paymentMode` *label* rather than from the
recorded allocations:

| Consumer | Defect before Phase 10 |
|---|---|
| `PosSessionService.recordInvoiceOnSession` | Classified the **whole invoice total** into one bucket by pattern-matching the mode string. A 200 Cash+Card sale put 200 into `totalMixedSales` and **zero** into cash and card — so the drawer expectation the cashier is counted against excluded cash the cashier was physically holding. |
| `SalesReportDataService.posPaymentMode` / `paymentModeRows` | Grouped invoices by their mode label, inventing a "Cash + Card" pseudo-bucket whose total reconciled with neither the cash drawer nor the card settlement. |
| POS checkout (Customer Advance) | `ADVANCE` was still a live allocation type, a legacy `advanceAmount` scalar, and an orphan modal — contradicting the decision that Customer Advance is a Customer-module workflow. |

X and Z reports were **already** allocation-derived (`aggregateTender` reads `sales_payments`
per leg); they needed no migration, only de-duplication of their bucket-mapping logic.

---

## 2. Files created

| File | Purpose |
|---|---|
| `billbull-backend/.../sales/payment/TenderBucket.java` | The single authority mapping a recorded per-leg payment mode onto a canonical report bucket, plus display names, card-network normalisation, per-invoice grouping, and `summaryLabel()` — which builds "Cash + Card" from the tenders themselves and **can never produce "Mixed"**. Previously duplicated privately inside `PosSessionService`. |
| `docs/pos-payment-allocation-phase-10-report.md` | This document. |

## 3. Files modified

### Backend

| File | Change |
|---|---|
| `pos/checkout/PosPaymentAllocationType.java` | Removed the `ADVANCE` member. Added `isRetiredAdvanceAlias()` so a stale client gets an actionable error, never acceptance. |
| `pos/checkout/PosPaymentAllocationResolver.java` | Rejects both the `ADVANCE` allocation type and the legacy `advanceAmount` scalar with a message pointing at Customer > Customer Advance Management. Removed all advance arithmetic from both the allocation and legacy paths. |
| `pos/checkout/PosPaymentPlan.java` | Dropped `advanceAmount`. Added `amountFor(type)`, which sums the **capped** allocations — what actually got recorded — so anything built from it reconciles with `sales_payments`. |
| `pos/checkout/PosCheckoutController.java` | Removed the advance-application branch and the now-unused `AdvanceApplicationService` dependency. Passes the `PosPaymentPlan` into `recordInvoiceOnSession`. |
| `pos/session/PosSessionService.java` | **Core fix.** `recordInvoiceOnSession(sessionId, invoice, plan)` splits session tender counters by allocation amount; `mixedDelta` is now always zero. Two-arg overload retained for plan-less callers. `tenderBucket`/`cardTypeLabel` delegate to `TenderBucket`. |
| `pos/session/PosSession.java` | `totalMixedSales` field + accessors marked `@Deprecated` with an explanation of why it is readable but never written. |
| `sales/reports/SalesReportDataService.java` | Loads tenders for the dataset in one query (`loadTenders`), grouped by invoice. `paymentModeRows`, `posPaymentMode` and the per-invoice `paymentMode` columns now derive from tenders, with a documented stored-label fallback. Added `PosTenderAgg`. |

### Frontend

| File | Change |
|---|---|
| `POS/payments/paymentModel.js` | Removed `ADVANCE` from `PAYMENT_TYPES` and labels; `validateLine` no longer takes advance options. Documents *why* advance is absent. |
| `POS/payments/paymentSelectors.js` | Dropped the now-unused `options` parameter from `lineErrors` / `canSettle`. |
| `POS/payments/usePaymentManager.js` | Removed `availableAdvanceBalance` plumbing and `totalAdvance`. |
| `POS/payments/paymentPresentation.js` | Removed ADVANCE label branches (EN + AR). `Advance` filter is now explicitly historical-only, matching the stored label alone. |
| `POS/payments/PaymentAllocationRow.jsx` | Removed the Advance style entry and its now-unused `Coins` icon import. |
| `POS/payments/PaymentAllocationPanel.jsx` | Removed the dead `availableAdvanceBalance` destructure. |
| `Sales/POSSales.jsx` | Dropped `availableAdvanceBalance` from the checkout manager and the now-dead `customerAdvanceSummary` state. Corrected the stale Z-report `totalMixedSales` comment. |
| Tests: `posPaymentManager.test.js`, `posPaymentPresentation.test.js`, `PosCheckoutControllerTest`, `PosPaymentAllocationResolverTest`, `PosSessionServiceTest` | Advance-as-tender tests replaced with rejection tests; new tests for allocation-split session totals. |

## 4. Files deleted

- `billbull-frontend/src/pages/Sales/POS/payments/modals/AdvancePaymentModal.jsx` — orphaned; nothing imported it (the LPO "advance payment modal" hits are vendor advances, a different domain).

---

## 5. Repository audit

Searched for `paymentMode ==`, `paymentMode.equals`, `contains("Mixed")`, `"Mixed"`,
`totalMixedSales`, `switch(paymentMode)`, `if(paymentMode)` across both modules.

### SAFE — per-leg or foreign-domain, not invoice-label business logic

| Location | Classification |
|---|---|
| `TenderBucket.of()` and its callers in `PosSessionService` (X/Z tender aggregation) | **SAFE.** Maps a *per-tender* recorded mode ("Visa") to a report column. The amount is already unambiguous; this only picks the column. Not logic on a combined label. |
| `PostingEngineService:820` `resolveExpenseSettlementAccount` | **SAFE.** Expense-voucher domain — a single-mode expense entry choosing its settlement GL account. Unrelated to POS sales. |
| `PostingEngineService:2243` `normalizePaymentMode` | **SAFE.** Same domain, string normalisation helper. |
| `SalesInvoice.jsx:417`, `Payment.jsx:115`, `CustomerLedger.jsx:1477` `paymentMode === 'Cheque'` / `'Cash'` | **SAFE.** Local **form state** in A/R receipt-entry dialogs, where the user picks one mode. Not the invoice's stored label. |
| `PosPaymentAllocationResolver.isMixed()` | **SAFE.** Strips a client-sent "Mixed" so it is never persisted. Defensive, correct. |
| `paymentPresentation.js` `filter === 'Mixed'` | **SAFE.** Back-office filter meaning "settled with more than one tender"; prefers allocations, stored label only as fallback. |

### Historical compatibility — intentional, documented

| Location | Classification |
|---|---|
| `PosSessionService.recordInvoiceOnSession` else-branch | **Historical compatibility.** Only reached when no plan is supplied (replay / plan-less caller). |
| `SalesReportDataService` stored-label fallbacks (3 sites) | **Historical compatibility.** Only for invoices with zero tender rows. |
| `InvoicePaymentSummaryService`, `PaymentController` "Mixed" mentions | **Historical compatibility.** Reconstruct real allocations for pre-Phase-1 sales. |
| `PaymentReconciliationService:189` (`equalsIgnoreCase("Mixed")`) | **Historical compatibility / diagnostic.** Deliberately *detects* stale "Mixed" labels — removing it would remove the detector. |
| `paymentPresentation.js` `Advance` filter, `PAYMENT_FILTERS` | **Historical compatibility.** Keeps pre-retirement advance-settled invoices findable. |

### Deprecated

| Location | Classification |
|---|---|
| `PosSession.totalMixedSales` (field, getter, setter, `total_mixed_sales` column, `incrementSessionTotals` param) | **Deprecated.** Never incremented by any current path. Readable so pre-Phase-10 closed sessions still report the totals they were closed with. |
| `PosCheckoutRequest.advanceAmount` | **Deprecated.** Retained per instruction 8 (legacy request scalar), but now rejected rather than honoured. |

### Needs migration

**None remaining.** No business logic, report, dashboard or export derives a payment fact from an
invoice `paymentMode` string.

### Not business logic

- `pages/dashboards/member-history-analytics.tsx:456` — `mode: 'Mixed'` is hardcoded **mock data**
  in an unrouted, never-imported prototype file. Left untouched as out of scope.

---

## 6. Verification

| Surface | Result |
|---|---|
| Checkout | Allocation-driven; session totals now split per tender. Advance rejected. `PosCheckoutControllerTest` 22/22. |
| Delivery Settlement | Unchanged — already used `resolveAllocations`, the shared engine. |
| Layaway | Unchanged — same engine. `PosLayawayServiceTest` green. |
| Receipts / Invoice Preview / Reprints | Unchanged — already rendered from `buildPaymentBlock`. Advance label branches removed (unreachable). |
| Backoffice | `InvoicePaymentSummaryService` unchanged and green (7/7). |
| Diagnostics | `PaymentReconciliationService` unchanged and green (17/17); still detects stale "Mixed". |
| Reports | POS Payment Mode, POS Transaction, POS Void/Cancellation, and all `paymentModeRows` charts now tender-derived. |
| X Report / Z Report | Already tender-derived; bucket logic de-duplicated into `TenderBucket`. `PosSessionServiceTest` 88/88. |
| Dashboard | Backend `dashboard/` package has **no** `paymentMode` references. Frontend dashboards clean apart from the dead prototype above. |
| Exports | `paymentDetailsForExport` unchanged — already block-derived. |

**Build status:** `mvn -o test` → `Tests run: 835, Failures: 0, Errors: 0` / BUILD SUCCESS.
`npm run build` → built in 43s. `npx vitest run` → 111 passed (6 files).

---

## 7. Remaining technical debt

1. **`total_mixed_sales` column and its `incrementSessionTotals` parameter.** Always passed zero
   now. Dropping the column needs a Flyway migration and a decision on whether historical
   sessions must keep reporting the figure they were closed with. Deliberately left.
2. **Legacy checkout scalars** (`cashAmount`, `cardAmount`, `cardLegs`, `onlineAmount`,
   `amountTendered`). Per instruction 8, retained until every terminal has cycled.
3. **`PosSessionService` is 2,650 lines.** The X/Z report builders are a natural extraction, but
   that is a refactor, not a Phase 10 objective.
4. **`utils/supabase/customer-connect-service.ts`** — still unverified as live or leftover
   (pre-existing, flagged in `CLAUDE.md`).

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A terminal not reloaded since deploy posting `advanceAmount` or an `ADVANCE` allocation now gets a **400** instead of settling. | Medium | Deliberate: the alternatives are settling from the customer ledger behind the Customer module's back, or posting the invoice short. The error names the correct workflow. No current client sends either field — verified by grep. |
| POS Payment Mode report's **Bills** column now sums to more than the transaction count when sales were split. | Low | Intended and documented; the Bills *card* reports distinct invoices separately. |
| Session counters and pre-Phase-10 counters are not directly comparable across the cutover for split sales. | Low | Correct direction — the old figures were the wrong ones. Reports that must reconcile (X/Z, cashier-wise) read `sales_payments` and are unaffected. |
| Sales reports now issue one extra `findTenderForInvoices` query per dataset load. | Low | One batched query for the whole date-bounded dataset, not per invoice. |

## 9. Final architecture summary

- **Payment Allocations are the only payment model.** A sale is an ordered list of tenders; a
  sale paid two ways is a sale with two allocations. There is no "mixed" mode, and no `MIXED`
  enum member on either side of the wire.
- **The active POS checkout tenders are Cash, Card, Online, Credit** — and only those. Customer
  Advance is a Customer-module workflow (Customer Advance Management / Customer Ledger /
  back-office Financials) and is rejected, not ignored, at checkout.
- **`sales_payments` is the reporting source of truth.** Every payment figure — X report, Z
  report, session counters, sales reports, cashier attribution, dashboards, exports — is
  aggregated from recorded tender rows.
- **`TenderBucket` is the single normalisation authority.** One place decides which column a
  recorded tender lands in, so the same sale cannot read "Card" on one screen and "Other" on the
  next.
- **`paymentMode` is a display label, nowhere a decision input.** It survives only as the
  fallback for invoices with no tender rows — which is exactly, and only, the historical case.
- **Payment summaries read** `Cash`, `Card`, `Cash + Card`, `Cash + Card + Online`,
  `Cash + Card + Online + Credit` — derived from the allocations, never "Mixed", never
  "+ Advance".
