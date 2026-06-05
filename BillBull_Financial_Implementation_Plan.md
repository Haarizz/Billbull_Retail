# BillBull Financial Flow — Phase-by-Phase Implementation Plan

> Source spec: `BillBull_Financial_Flow.pdf` (v1.0)
> Generated: 2026-05-29
> Scope: backend (`billbull-backend/`) + frontend (`billbull-frontend/`) financial subsystem

---

## 0. Current vs Target — High-Level Snapshot

| Area | Current State (code) | PDF Target | Gap Severity |
|---|---|---|---|
| Posting Engine | `PostingEngineService` with idempotency by `reference` and per-flow methods (Sales Invoice, DN, GRN, PI, Receipt, Payment, Expense, Sales Return, Card Settlement, Stock Transfer) | Single gateway with mandatory period+dimension+balance validation; voucher numbering; audit trail | **Medium** — engine exists but several validations are advisory, not enforced |
| Chart of Accounts | Hierarchical `Account` entity with tax role, control-account flag, COA tree | 5-group COA with fixed code ranges (1000–7999) | **Low** — structure exists; only code ranges differ |
| Fiscal Year | `AccountingPeriod` (status Open/Closed) only — no parent fiscal year, no Closing state | Fiscal Year master with Open/Closing/Closed states; nested periods | **Medium** |
| Currency | No `Currency` master; amounts stored as plain `BigDecimal` | Multi-currency with dated exchange rates; FX columns on every line | **High** if multi-currency required; **Low** if AED-only acceptable for MVP |
| Period Lock | `AccountingPeriod.status` exists but **not enforced inside** `PostingEngineService.post()` | Hard rejection at posting gateway, even for system entries | **High** |
| Dimensions | `Branch` on `JournalEntry`; `costCenter` is an optional `String` on `JournalLine`; no Outlet | Branch + Outlet + CostCenter mandatory per line; validated against dimension matrix | **High** |
| Voucher Numbers | `journalEntryService.generateEntryNumber()` (sequence-style, not per-branch / per-type) | Format `{TYPE}-{BRANCH}-{YYYY}-{NNNNNN}`, per-branch + per-type DB sequence, row-locked | **High** |
| Customer Advance | Receipt posts to `Customer Advance (2104)` | Apply-against-invoice flow + refund flow | **High** — application missing |
| Vendor Advance | No vendor advance module | `Vendor Advances Paid (1105)` ledger + apply + refund | **High** |
| GRN → Purchase Invoice (3-way match) | `GRN Clearing (2103)` accrual works; PI clears it correctly | Same + post Purchase Price Variance (PPV) when invoice cost ≠ GRN cost | **Medium** |
| Settlement Discount | None | Discount Allowed (expense, on customer receipt) / Discount Received (income, on vendor payment) | **High** |
| Sales Return COGS | `costOfGoodsReturned` passed in by caller, currently from product master | Original sale cost (FEFO/WAC batch consumed at sale time) | **Medium** |
| Card Settlement | Implemented (`CardSettlement` + journal: net to bank, fee to expense, clear merchant clearing) | Same | ✅ |
| PDC | `PdcEntry` + status transitions, but **transitions log only, no GL** | CLEARED → Dr Bank / Cr CUC; BOUNCED → reverse | **High** |
| Bank Reconciliation | `ReconciliationSession` entity + service | Match + auto-journal for bank charges / interest / bounced cheque | **Medium** |
| Payroll | `salaryadvance`, `salarypayments` packages exist | Advance → Salary JV (gross expense + advance offset + deductions) → WPS payment | **Medium** — journal completeness to verify |
| Inter-branch | Stock transfer uses single `Inventory (1120)` + cost center tag (in-transit / source / destination) | Inter-Branch Receivable (1150) / Payable (2150) accounts | **Low** — variant approach is defensible; documentation gap |
| Reports | `TrialBalanceDTO`, `BalanceSheetDTO`, `ProfitLossDTO`, `CashFlowDTO`, `TaxReconciliationDTO`, `ExpenseAnalysisDTO` | Same + control-account vs sub-ledger reconciliation report | **Medium** |
| Pre-aggregated balances | None — computed live from `journal_lines` | `gl_account_balances` per (account, period, dimensions) | **High** at scale |
| Manual JV maker-checker | `validateManualEntry` blocks control accounts; no approval workflow | Maker-checker w/ amount threshold | **High** |

---

## Phase 1 — Foundational Controls (Posting Engine Hardening)

**Goal:** Make the existing posting engine bulletproof per PDF §1, §4, §21A.
**Estimate:** 1.5 sprints (1 engineer)
**Priority:** P0 — blocks correctness in production today

### Task 1.1 — Centralize and harden `PostingEngineService.post()`

**Current:** `post(JournalEntry)` saves and immediately calls `journalEntryService.postEntry()`. No balance check, no period check, no dimension check inside this gateway. Validations are scattered.

**Target:** Single gateway that runs the full pre-validation pipeline. Refuse on any failure with a descriptive `PostingException` carrying a stable error code.

**Sub-tasks:**
1. Introduce `PostingException(String code, String message)` with codes: `PERIOD_LOCKED`, `UNBALANCED_ENTRY`, `MISSING_DIMENSION`, `ACCOUNT_INACTIVE`, `INVALID_FX_RATE`, `CREDIT_LIMIT_BREACH`.
2. Refactor `post()` into:
   - `validate(entry)` — calls each guard in order.
   - `assignVoucherNumber(entry)` — Phase 1.4.
   - `persist(entry)` — atomic write to header + lines + balance summary.
   - `notify(entry)` — status update, audit log.
3. Wrap all of the above in `@Transactional(propagation = REQUIRED, rollbackFor = Exception.class)`.

**Files:**
- `billbull-backend/src/main/java/com/billbull/backend/financials/generalledger/postingengine/PostingEngineService.java`
- New: `.../postingengine/PostingException.java`
- New: `.../postingengine/PostingErrorCode.java` (enum)

**Tests:** `PostingEngineServiceTest` — assert exception code per scenario.

---

### Task 1.2 — Period-lock enforcement

**Current:** `AccountingPeriod.status` is set but never read at posting time. A journal dated inside a Closed period will post silently.

**Target:** Any posting attempt to a date within a Closed period is rejected with `PERIOD_LOCKED`.

**Sub-tasks:**
1. Add `AccountingPeriodService.assertOpen(LocalDate date)` — throws `PostingException(PERIOD_LOCKED)` if no Open period covers the date or covering period is Closed.
2. Call from `PostingEngineService.validate()` as the first guard.
3. Add `AccountingPeriodService.findCoveringPeriod(LocalDate)` for diagnostics.
4. UI: surface error code in the toast/error banner.
5. Backdated entries: introduce `permissions.posting.backdate-into-locked` RBAC permission. If user has it, allow with audit-log entry.

**Files:**
- `.../financials/period/AccountingPeriodService.java`
- `.../financials/generalledger/postingengine/PostingEngineService.java`
- `billbull-frontend/src/api/journalApi.js` (error handling)
- `billbull-frontend/src/pages/Financials/JournalEntry.jsx`

**Tests:**
- Posting to Closed period → throws.
- Posting to Open period → succeeds.
- Posting to date with no defined period → throws (configurable: auto-create Open period or reject).
- RBAC override path.

---

### Task 1.3 — Balance check guard

**Current:** No explicit `Σ debit == Σ credit` assertion in `post()`. Relies on caller to add balanced lines.

**Target:** Hard guard with rounding-absorption logic.

**Sub-tasks:**
1. Compute `totalDebit = Σ line.debit`, `totalCredit = Σ line.credit`.
2. If `|totalDebit − totalCredit| > 0.01`, throw `UNBALANCED_ENTRY`.
3. If `0 < diff ≤ 0.01` (rounding from FX or tax calc), absorb into a designated `Rounding (5xxx)` account line.
4. Add `ACC_ROUNDING = "5999"` constant and seed account in `FinancialsDefaultSeeder`.
5. Unit test asserting that every `createJournalFrom*` method emits a balanced entry — parameterized across all flows.

**Files:**
- `.../postingengine/PostingEngineService.java`
- `.../config/FinancialsDefaultSeeder.java`
- `.../postingengine/PostingEngineBalanceTest.java` (new)

---

### Task 1.4 — Dimension validation

**Current:** `JournalLine.costCenter` is a free-text string, optional. `JournalEntry.branch` exists but is not validated mandatory at the line level.

**Target:** Branch on every line mandatory; CostCenter mandatory on revenue/COGS/expense lines; Outlet mandatory on revenue/COGS lines (Phase 2 introduces Outlet).

**Sub-tasks:**
1. Add `branch_id` (FK) to `JournalLine` (currently only on header).
2. Build `DimensionMatrixService` — validates `(accountCode, branch, outlet, costCenter)` against an allow-list.
3. `validate()` rejects entries with missing mandatory dimensions per the account's `costCenterRequired` and a new `outletRequired` flag on `Account`.
4. Reject — do not silently default. The PDF §4 explicitly forbids silent defaults.
5. Backfill existing rows with `branch_id` from header during migration.

**Files:**
- `.../generalledger/JournalLine.java` — add `Branch branch`, `Outlet outlet`.
- `.../chartofaccounts/Account.java` — add `outletRequired` boolean.
- New: `.../postingengine/DimensionMatrixService.java`
- `.../postingengine/PostingEngineService.addLine()` — accept branch/outlet/costCenter triple.

**Migration:**
- Add columns (`ddl-auto=update` will handle).
- One-shot data migration in a seeder: copy `journal_entries.branch_id` → `journal_lines.branch_id` for all existing rows.

---

### Task 1.5 — Voucher number redesign

**Current:** `JournalEntryService.generateEntryNumber()` produces a single global sequence (e.g. `JV-000123`). Not per-branch / per-type. PDF requires e.g. `SI-DXB-2024-000123`.

**Target:** Per-branch, per-transaction-type, per-fiscal-year sequences using DB-level row locking.

**Sub-tasks:**
1. New entity `VoucherSequence(transactionType, branchCode, fiscalYear, lastNumber)` with unique constraint on the triple.
2. `VoucherSequenceService.nextVoucherNumber(type, branchCode, date)`:
   - `SELECT ... FOR UPDATE` on the triple row.
   - Increment `lastNumber`, save, return formatted string `"{TYPE}-{BRANCH}-{YYYY}-{NNNNNN}"`.
   - Create row on first use (race-safe via unique-violation retry).
3. Replace `entry.setEntryNumber(journalEntryService.generateEntryNumber())` with `entry.setEntryNumber(voucherSequenceService.nextVoucherNumber(...))` in `createBaseEntry()`.
4. Map transaction types: `SI` (Sales Invoice), `CS` (Cash Sale), `PI` (Purchase Invoice), `GRN`, `RV` (Receipt Voucher), `PV` (Payment Voucher), `EXP`, `JV` (Manual Journal), `CN` (Credit Note), `DN` (Debit Note), `CARD`, `ST` (Stock Transfer).
5. Concurrent-posting test: spawn 50 threads posting against the same branch+type; assert zero duplicates.

**Files:**
- New: `.../generalledger/voucher/VoucherSequence.java`
- New: `.../generalledger/voucher/VoucherSequenceRepository.java`
- New: `.../generalledger/voucher/VoucherSequenceService.java`
- `.../postingengine/PostingEngineService.createBaseEntry()`
- `.../generalledger/JournalEntryService.java` — keep `generateEntryNumber()` as deprecated fallback for manual JVs in old flow.

---

### Task 1.6 — Automated balance test harness

**Current:** No systematic assertion that every flow emits a balanced entry.

**Target:** Single table-driven test that exercises every `createJournalFrom*` method with realistic fixtures and asserts balance + dimension + period checks.

**Sub-tasks:**
1. New `PostingEngineContractTest` with one test method per flow.
2. Fixtures via builder methods (follow existing `StockTakeServiceTest` convention).
3. Assertions per posting:
   - `Σ debit == Σ credit`.
   - Branch set on every line.
   - All account codes resolve to active accounts.
   - Voucher number matches expected format.
4. Wire into the CI build via `mvn test`.

**Files:** new `.../postingengine/PostingEngineContractTest.java`

---

## Phase 2 — Masters Completion

**Goal:** Fill the master-data gaps from PDF §2.
**Estimate:** 1 sprint
**Priority:** P1

### Task 2.1 — Fiscal Year master

**Current:** `AccountingPeriod` only. No grouping under fiscal year. No `Closing` intermediate state.

**Target:** `FiscalYear(code, startDate, endDate, status: Open|Closing|Closed)` parent; periods belong to a fiscal year.

**Sub-tasks:**
1. New `FiscalYear` entity + repository + service + controller.
2. Add `fiscalYearId` FK to `AccountingPeriod`.
3. `FiscalYearService.closeYear()`: transitions to `Closing`, refuses new postings except adjustment JVs from authorized users, then to `Closed`.
4. Year-end retained-earnings roll-up: on close, post `Dr/Cr Retained Earnings (3100)` from all P&L account balances; reset P&L balances for new year.
5. Seed default fiscal year for existing data on startup (one-shot migration).

**Files:**
- New: `.../financials/period/FiscalYear.java`, `.../FiscalYearRepository.java`, `.../FiscalYearService.java`, `.../FiscalYearController.java`
- `.../period/AccountingPeriod.java` — add `fiscalYearId`
- `.../config/FinancialsDefaultSeeder.java` — backfill default FY

---

### Task 2.2 — Currency master + exchange rate history

**Current:** Plain `BigDecimal` amounts; assumed base currency. No FX columns.

**Target:** `Currency(code, name, symbol, isBase)` + `ExchangeRate(fromCurrency, toCurrency, rateDate, rate)`. Every journal line stores foreign amount + FX rate + base amount.

**Sub-tasks:**
1. New entities + repos + services for `Currency` and `ExchangeRate`.
2. Add columns to `JournalLine`:
   - `currency` (3-char ISO)
   - `fxRate` (numeric 18,8)
   - `baseDebit`, `baseCredit` (15,2)
3. `ExchangeRateService.getRate(from, to, date)` — picks rate effective on or before date.
4. Posting engine: if `currency != baseCurrency`, lookup FX, populate `baseDebit/baseCredit`; throw `INVALID_FX_RATE` if none found.
5. Reports must sum base columns, not foreign.
6. UI: currency picker on Receipt/Payment/Invoice forms; FX-rate override with audit trail.

**Files:**
- New: `.../financials/currency/Currency.java`, `.../CurrencyRepository.java`, `.../CurrencyService.java`, `.../CurrencyController.java`
- New: `.../financials/currency/ExchangeRate.java`, `.../ExchangeRateRepository.java`, `.../ExchangeRateService.java`, `.../ExchangeRateController.java`
- `.../generalledger/JournalLine.java`
- `.../postingengine/PostingEngineService.java` — populate FX columns
- `billbull-frontend/src/api/currencyApi.js` (new)

**Note:** If multi-currency is out of scope for MVP, populate `currency = "AED"`, `fxRate = 1`, `base* = foreign*` and defer FX validation.

---

### Task 2.3 — Payment Terms master

**Current:** None.

**Target:** `PaymentTerms(code, name, netDays, earlyPaymentDiscountPercent, earlyPaymentDiscountDays)` linked to Customer and Vendor master; drives invoice due date and settlement-discount calc.

**Sub-tasks:**
1. New entity + repo + service + controller for `PaymentTerms`.
2. Add `paymentTermsId` to `Customer` and `Vendor`.
3. `SalesInvoiceService` / `PurchaseInvoiceService` — compute `dueDate = invoiceDate + netDays`.
4. Receipt/Payment screen reads `earlyPaymentDiscount*` to suggest the discount amount when paying within window.
5. Seed common terms: `NET_0`, `NET_15`, `NET_30`, `NET_60`, `2_10_NET_30`.

**Files:**
- New: `.../financials/paymentterms/PaymentTerms.java` + repo + service + controller
- `.../customer/Customer.java` — add `paymentTermsId`
- `.../purchase/vendor/Vendor.java` — add `paymentTermsId`
- `.../sales/invoice/SalesInvoiceService.java` — due date calc
- `.../purchase/invoice/PurchaseInvoiceService.java` — due date calc

---

### Task 2.4 — Outlet dimension

**Current:** Branch exists in `settings.branch`; no Outlet level.

**Target:** Outlet under Branch; mandatory dimension for revenue/COGS lines.

**Sub-tasks:**
1. New entity `Outlet(code, name, branchId, type)` in `settings.outlet`.
2. Add `outletId` to: `SalesInvoice`, `SalesOrder`, `DeliveryNote`, `JournalLine`.
3. Backfill: create one default outlet per branch; assign all existing transactions.
4. Update `DimensionMatrixService` (Phase 1.4) to require Outlet on revenue/COGS accounts.
5. UI: outlet picker on POS, sales screens; reports group-by outlet.

**Files:**
- New: `.../settings/outlet/Outlet.java`, repo, service, controller
- `.../sales/invoice/SalesInvoice.java`
- `.../sales/salesorder/SalesOrder.java`
- `.../sales/delivery/DeliveryNote.java`
- `.../generalledger/JournalLine.java`
- One-shot backfill seeder

---

### Task 2.5 — COA code-range alignment (decision)

**Current:** Codes are `1101` (Cash), `2101` (AP), `4101` (Sales Revenue), `5101` (COGS) etc. PDF prescribes `1001`, `2001`, `4001`, `5001`.

**Decision required:** Migrate codes vs keep current.

**Recommendation:** **Keep current codes** to avoid data migration risk; add a `pdfReportGroup` field on `Account` (e.g. `CURRENT_ASSETS`, `REVENUE`, `COGS`) that the reports module uses for grouping, instead of relying on code prefix. Document the BillBull→PDF code mapping in a project memory.

**Sub-tasks if migrating (NOT recommended for MVP):**
1. Add `pdfCode` alongside `code`.
2. Dual-write period: posting writes both; reads use one.
3. Cutover after a full cycle.

**Sub-tasks if keeping (recommended):**
1. Add `reportGroup` field (already exists on `Account`!) — confirm usage in `FinancialReportService`.
2. Ensure all seeded accounts have `reportGroup` set.
3. Add mapping doc as a project memory.

---

## Phase 3 — Sales Flow Completion

**Goal:** PDF §5–§8 fully covered.
**Estimate:** 1 sprint
**Priority:** P0

### Task 3.1 — Customer advance application against invoice

**Current:** `ReceiptVoucher` with `ReceiptPurpose.ADVANCE_RECEIVED` posts `Dr Bank / Cr Customer Advance (2104)`. No mechanism to consume the advance against a later invoice.

**Target:** When a sales invoice is posted for a customer with open advances, application entry: `Dr Customer Advance (2104) / Cr Accounts Receivable (1110)` for the applied amount, with traceability to source receipt.

**Sub-tasks:**
1. New `AdvanceApplication(advanceReceiptId, invoiceNumber, appliedAmount, appliedDate)` entity.
2. New `AdvanceApplicationService`:
   - `findOpenAdvances(customerId)` — `Customer Advance` ledger balance per receipt.
   - `apply(advanceId, invoiceId, amount)` — validates ≤ open amount, ≤ invoice balance.
   - Calls `PostingEngineService.createJournalFromAdvanceApplication()`.
3. New posting method on `PostingEngineService`:
   ```
   Dr Customer Advance (2104) [amount]
   Cr Accounts Receivable (1110) [amount]
   Reference: "APPLY-ADV-{advanceId}-INV-{invoiceNumber}"
   ```
4. `SalesInvoiceService.create()` — after posting, auto-apply open advances FIFO (configurable per customer).
5. Customer ledger view shows advance + invoice separately until matched.
6. UI: "Apply Advance" button on customer statement screen.

**Files:**
- New: `.../sales/advance/AdvanceApplication.java`, repo, service, controller
- `.../financials/generalledger/postingengine/PostingEngineService.java` — new method
- `.../sales/invoice/SalesInvoiceService.java` — auto-apply hook
- `billbull-frontend/src/pages/Sales/CustomerStatement.jsx`

---

### Task 3.2 — Customer advance refund

**Current:** Not implemented.

**Target:** When an order is cancelled before delivery, refund the advance: `Dr Customer Advance / Cr Bank`.

**Sub-tasks:**
1. `AdvanceApplicationService.refund(advanceId, amount, paymentMode)` — validates open balance.
2. New posting method `createJournalFromAdvanceRefund()`:
   ```
   Dr Customer Advance (2104) [refundAmount]
   Cr Bank/Cash [refundAmount]
   Reference: "REFUND-ADV-{advanceId}"
   ```
3. UI button on customer ledger row: "Refund advance".
4. Audit log entry mandatory; require manager approval above threshold.

---

### Task 3.3 — Sales Return COGS = original sale cost

**Current:** [`createJournalFromSalesReturn()`](billbull-backend/src/main/java/com/billbull/backend/financials/generalledger/postingengine/PostingEngineService.java#L621) takes `costOfGoodsReturned` from caller. Caller resolves from product master (current avg cost), not original sale cost.

**Target:** Use cost of the specific batches consumed at original sale time. Prevents WAC distortion.

**Sub-tasks:**
1. `DeliveryNoteService` already does FEFO consumption — persist the `(batchId, qty, unitCost)` consumed per DN line in a new `DeliveryNoteBatchConsumption` table.
2. `SalesReturnService.resolveOriginalCost(returnLine)` — sums the `unitCost × returnedQty` from the source DN's consumption rows.
3. Replace caller's product-master lookup with this resolution.
4. Edge case: legacy DN rows without consumption history → fall back to product cost with audit-log warning.
5. Unit test verifying COGS reversal amount equals original sale cost, not current avg.

**Files:**
- New: `.../sales/delivery/DeliveryNoteBatchConsumption.java`, repo
- `.../sales/delivery/DeliveryNoteService.java` — persist consumption
- `.../sales/returns/SalesReturnService.java` — `resolveOriginalCost()`
- Migration seeder for legacy data

---

### Task 3.4 — Credit-limit pre-post check at posting layer

**Current:** Credit-limit check exists in customer module but not invoked from posting engine.

**Target:** `PostingEngineService.validate()` calls `CustomerCreditService.assertWithinLimit(customer, additionalAR)` for any posting that increases AR.

**Sub-tasks:**
1. New `CustomerCreditService.assertWithinLimit()` — throws `CREDIT_LIMIT_BREACH` if open AR + this transaction > limit.
2. Hook into Sales Invoice and Sales Order confirmation paths.
3. RBAC permission `permissions.sales.override-credit-limit` for managers; if held, allow with audit log.
4. UI: surface block reason in invoice creation dialog; show current open AR vs limit.

---

### Task 3.5 — Trade vs settlement discount split (verify)

**Current:** Sales invoice posts net revenue (trade discount already excluded). Settlement discount = Phase 4.

**Target:** Verify revenue is always net of trade discount; settlement discount is never netted into invoice revenue.

**Sub-tasks:**
1. Audit `SalesInvoiceService` to confirm trade discount reduces `subTotal` before VAT calc.
2. Add assertion test: invoice with `lineDiscount > 0` posts revenue at net price.
3. Document policy in code comment + project memory.

---

## Phase 4 — Purchase, Receipts & Payments

**Goal:** PDF §9–§12.
**Estimate:** 1 sprint
**Priority:** P0

### Task 4.1 — Vendor advance module

**Current:** No vendor advance.

**Target:** Pay → apply against PI → optional refund. Mirrors customer advance.

**Sub-tasks:**
1. New entity `VendorAdvance(vendorId, lpoId, amount, paidDate, status)`.
2. New posting methods:
   - **Pay:** `Dr Vendor Advances Paid (1105) / Cr Bank` — `Reference: "VADV-{id}"`.
   - **Apply to invoice:** `Dr Accounts Payable (2101) / Cr Vendor Advances Paid (1105)` — `Reference: "APPLY-VADV-{id}-PI-{piNumber}"`.
   - **Refund:** `Dr Bank / Cr Vendor Advances Paid (1105)` — `Reference: "REFUND-VADV-{id}"`.
3. Add `Vendor Advances Paid (1105)` to COA seeder.
4. Add LPO reference (mandatory per PDF §10).
5. AP sub-ledger shows advance amounts separately from invoice amounts.
6. UI: vendor advance entry screen under Purchase → Vendor Advance.

**Files:**
- New: `.../purchase/advance/VendorAdvance.java`, repo, service, controller
- `.../postingengine/PostingEngineService.java` — three new methods
- `.../config/FinancialsDefaultSeeder.java`
- `billbull-frontend/src/api/vendorAdvanceApi.js` + page

---

### Task 4.2 — Purchase Price Variance (PPV)

**Current:** `createJournalFromPurchaseInvoice()` handles GRN-clearing via `2103` correctly, but if invoice cost ≠ GRN cost, the difference is absorbed into Inventory silently (or the journal won't balance).

**Target:** When `invoice.grandTotal − invoice.taxTotal ≠ GRN value`, post the difference to `Purchase Price Variance (5xxx)`.

**Sub-tasks:**
1. Add `Purchase Price Variance (5103)` account in COA seeder.
2. In `createJournalFromPurchaseInvoice()` AGAINST_GRN branch:
   - Compute `expectedClearance = grn.amount`.
   - Compute `actualNet = grandTotal − taxTotal`.
   - `variance = actualNet − expectedClearance`.
   - If `variance > 0`: extra debit to PPV (5103). If `< 0`: credit to PPV.
3. Investigate-flag on the GRN: surface in a Variance Report.
4. Test: PI with cost 10% higher than GRN → variance posted to PPV; ledger balances.

**Files:**
- `.../postingengine/PostingEngineService.java#L113`
- `.../config/FinancialsDefaultSeeder.java`
- New: `.../financials/reports/PurchasePriceVarianceReportService.java`

---

### Task 4.3 — Settlement discount on customer receipt

**Current:** `ReceiptVoucher` posts simple `Dr Bank / Cr AR`. No discount handling.

**Target:** When customer pays early and takes the discount, post:
```
Dr Bank/Cash         [net received]
Dr Discount Allowed  [discount amount] (6050)
Cr Accounts Receivable [full invoice amount]
```

**Sub-tasks:**
1. Add `discountAmount` to `ReceiptVoucher` entity.
2. Add `Discount Allowed (6050)` to COA seeder.
3. Modify `createJournalFromReceiptVoucher()` to post the three-line entry when `discountAmount > 0`.
4. UI: receipt screen shows suggested discount based on Customer.paymentTerms and invoice age.
5. VAT-adjustment toggle (per UAE rules — PDF §7) — out of scope for v1, document as future enhancement.

**Files:**
- `.../financials/receiptvoucher/ReceiptVoucher.java`
- `.../postingengine/PostingEngineService.java#L570`
- `billbull-frontend/src/pages/Financials/ReceiptVoucher.jsx`

---

### Task 4.4 — Settlement discount on vendor payment

**Current:** `PaymentVoucher` posts simple `Dr AP / Cr Bank`. No discount handling.

**Target:** When BillBull pays vendor early and takes the discount, post:
```
Dr Accounts Payable  [full invoice amount]
Cr Bank              [net paid]
Cr Discount Received [discount amount] (7001)
```

**Sub-tasks:**
1. Add `discountAmount` to `PaymentVoucher` entity.
2. Add `Discount Received (7001)` to COA seeder.
3. Modify `createJournalFromPaymentVoucher()` for the three-line entry.
4. UI: payment screen suggests discount based on Vendor.paymentTerms.

**Files:**
- `.../purchase/payment/PaymentVoucher.java`
- `.../postingengine/PostingEngineService.java#L546`
- `billbull-frontend/src/pages/Financials/PaymentVoucher.jsx`

---

### Task 4.5 — Post-dated cheque GL postings

**Current:** [`createJournalFromPdcTransition()`](billbull-backend/src/main/java/com/billbull/backend/financials/generalledger/postingengine/PostingEngineService.java#L701) **only logs** — no GL entry on any transition.

**Target:** Implement real posting on `RECEIVED`, `CLEARED`, `BOUNCED`.

**Sub-tasks:**
1. Add `Cheques Under Collection (CUC, 1107)` to COA seeder.
2. On `RECEIVED` (incoming PDC): `Dr CUC (1107) / Cr Accounts Receivable (1110)`. Reference: `"PDC-RECV-{pdcId}"`.
3. On `CLEARED`: `Dr Bank (1102) / Cr CUC (1107)`. Reference: `"PDC-CLEAR-{pdcId}"`.
4. On `BOUNCED`: reverse the CLEARED entry (if any) then reverse the RECEIVED entry: `Dr AR / Cr CUC`. Reference: `"PDC-BOUNCE-{pdcId}"`. Customer is re-charged; AR re-opens.
5. For outgoing PDCs (vendor): mirror with `Cheques Issued Not Cleared` liability account.
6. Bank reconciliation (Phase 7) treats CUC as interim — clears against actual bank statement on settlement.

**Files:**
- `.../postingengine/PostingEngineService.java#L701`
- `.../financials/pdc/PdcService.java` — call posting engine on each transition
- `.../config/FinancialsDefaultSeeder.java`

**Tests:**
- Full lifecycle: RECEIVED → CLEARED → ledger ends with Bank ↑, AR ↓, CUC = 0.
- RECEIVED → BOUNCED → ledger ends with AR re-opened, CUC = 0.

---

## Phase 5 — Inventory & COGS Accuracy

**Goal:** PDF §16.
**Estimate:** 1 sprint
**Priority:** P1

### Task 5.1 — Weighted Average Cost recalc

**Current:** WAC computation may live in inventory module; needs audit for atomicity with GRN posting.

**Target:** Every GRN updates `inventory_balances.avg_cost` atomically within the same DB transaction as the GRN journal.

**Sub-tasks:**
1. Audit `purchase/grn/GrnService` and `inventory/batch/`.
2. Ensure `GrnService.post()` and `PostingEngineService.createJournalFromGRN()` run in the same `@Transactional` boundary as the inventory balance update.
3. Formula: `newAvg = (existingQty * existingAvg + receivedQty * receivedUnitCost) / (existingQty + receivedQty)`.
4. Test: receive 100 units @ AED 10, then 100 @ AED 12 → new avg = AED 11.
5. Concurrent receipt test: two GRNs posted simultaneously → final avg correct (use row lock on inventory_balance row).

---

### Task 5.2 — FEFO batch allocation for COGS

**Current:** `DeliveryNoteService` uses FEFO/FIFO for stock release, but COGS journal uses aggregate cost (recently improved per Phase 3.3).

**Target:** Already covered in Phase 3.3 — persist `(batchId, qty, unitCost)` per DN line, sum to compute exact COGS.

**Sub-tasks (additional, beyond 3.3):**
1. Add COGS-per-line breakdown to delivery note PDF (already touched files: `billbull-frontend/src/pages/Sales/DeliveryNote.jsx`).
2. Stock valuation report uses `Σ (remaining_qty × batch_unit_cost)`, not `qty × current_avg`.

---

### Task 5.3 — Inter-branch stock transfer (decision: keep current or migrate)

**Current:** Stock transfer uses single `Inventory (1120)` account with cost-center dimension to model in-transit / source / destination.

**Target (PDF strict):** Inter-Branch Receivable (1150) / Inter-Branch Payable (2150) accounts; sending branch credits Inventory + debits Inter-Branch Receivable; receiving branch debits Inventory + credits Inter-Branch Payable.

**Recommendation:** **Keep current cost-center model** — it correctly preserves total inventory value at the entity level and uses the dimensional model the PDF endorses elsewhere. Document the variant. Migrate only if statutory consolidation requires the dual-account model.

**Sub-tasks if keeping (recommended):**
1. Add inline doc comment explaining the chosen model.
2. Project memory: `feedback_inter_branch_model.md`.
3. Ensure cost-center filter on Inventory account in reports produces correct branch-level inventory.

**Sub-tasks if migrating (PDF strict):**
1. Add `Inter-Branch Receivable (1150)`, `Inter-Branch Payable (2150)` to COA seeder.
2. Refactor `createJournalFromStockTransferSent` and `Received` methods.
3. Add inter-branch reconciliation report — receivable on sending side must equal payable on receiving side.

---

### Task 5.4 — Expiry write-off journal

**Current:** Stock-take has expiry tracking; write-off journal may be missing.

**Target:** When stock is written off due to expiry, post `Dr Inventory Write-off (5xxx) / Cr Inventory (1120)` at the **specific batch cost** of the expired units.

**Sub-tasks:**
1. Add `Inventory Write-off (5104)` to COA seeder.
2. New posting method `createJournalFromInventoryWriteoff(StockTakeAdjustment)`:
   ```
   Dr Inventory Write-off (5104) [cost of expired]
   Cr Inventory (1120) [cost of expired]
   Reference: "WRITEOFF-{stockTakeId}-{lineId}"
   ```
3. Hook from stock-take approval flow.
4. Expiry-write-off report showing items, batches, cost, dates.

**Files:**
- `.../inventory/stocktake/StockTakeService.java` — hook
- `.../postingengine/PostingEngineService.java` — new method
- `.../config/FinancialsDefaultSeeder.java`

---

## Phase 6 — Payroll Completeness

**Goal:** PDF §13.
**Estimate:** 0.5 sprint
**Priority:** P1

### Task 6.1 — Audit and complete salary journal

**Current:** `hr/salaryadvance` and `hr/salarypayments` packages exist; journal completeness unverified.

**Target:** End-of-month payroll run produces:
```
Dr Salary Expense          [gross salary]
Cr Salary Payable          [net payable to employee]
Cr Salary Advances         [advances deducted]   (1106)
Cr Other Deductions Payable [loans, fines, etc.] (2201)
```

**Sub-tasks:**
1. Audit `SalaryPaymentService` for journal posting completeness.
2. Add `Salary Expense (6010)`, `Salary Payable (2200)`, `Salary Advances (1106)`, `Other Deductions Payable (2201)` if missing.
3. New posting method `createJournalFromPayrollRun(PayrollRun)` if not already present.
4. Each employee row tagged with their department cost center for departmental P&L.

---

### Task 6.2 — Salary advance posting

**Current:** `SalaryAdvanceService` may not post to GL.

**Target:** When employee takes advance: `Dr Salary Advances (1106) / Cr Cash/Bank`.

**Sub-tasks:**
1. Hook posting engine call into `SalaryAdvanceService.approve()`.
2. New posting method `createJournalFromSalaryAdvance()`.
3. Reference: `"SADV-{advanceId}"`.

---

### Task 6.3 — WPS payment posting

**Current:** Verify.

**Target:** When WPS file is generated and bank confirms: `Dr Salary Payable / Cr Bank` for the net disbursement.

**Sub-tasks:**
1. New posting method `createJournalFromWpsDisbursement()`.
2. Hook into WPS file confirmation flow.
3. Reference: `"WPS-{runId}-{date}"`.

---

## Phase 7 — Reports & Reconciliation

**Goal:** PDF §15, §17, §21J.
**Estimate:** 1 sprint
**Priority:** P1

### Task 7.1 — Sub-ledger ↔ control account reconciliation report

**Current:** No reconciliation report.

**Target:** Single screen showing for each control account:
- GL balance.
- Sub-ledger total.
- Difference (must be zero).
- Drill-down on mismatch.

**Sub-tasks:**
1. New `SubLedgerReconciliationService` with methods:
   - `reconcileAR()` — `AR control (1110)` vs sum of open `customer_ledger` rows.
   - `reconcileAP()` — `AP control (2101)` vs sum of open `vendor_ledger` rows.
   - `reconcileInventory()` — `Inventory (1120)` vs `Σ (qty × avg_cost)` in inventory balances.
   - `reconcileVATOutput()` / `reconcileVATInput()` vs tax sub-ledger.
2. New report endpoint `/api/reports/reconciliation`.
3. UI page under Financials → Reconciliation Health.
4. Alert if difference > AED 1 — surface in dashboard.

**Files:**
- New: `.../financials/reports/SubLedgerReconciliationService.java`, DTO, controller endpoint
- `billbull-frontend/src/pages/Financials/ReconciliationHealth.jsx`

---

### Task 7.2 — Bank reconciliation auto-posting

**Current:** `ReconciliationSession` entity + service exist; auto-posting incomplete.

**Target:** When accountant accepts an unmatched bank statement line, post the appropriate journal automatically.

**Sub-tasks:**
1. Statement-line categorization UI: `Bank Charge` / `Interest Income` / `Bounced Cheque` / `Other`.
2. Per-category posting:
   - **Bank Charge:** `Dr Bank Charges (7501) / Cr Bank (1102)`.
   - **Interest Income:** `Dr Bank (1102) / Cr Interest Income (7002)`.
   - **Bounced Cheque:** call PDC bounce flow (Phase 4.5).
3. Reference key: `"RECON-{sessionId}-{lineId}"`.
4. Period-end alert if reconciliation has > 30-day-old unmatched items.

**Files:**
- `.../financials/reconciliation/ReconciliationService.java`
- `.../postingengine/PostingEngineService.java` — new helpers for bank charges / interest

---

### Task 7.3 — Cash flow indirect method tie-back

**Current:** `CashFlowDTO` exists.

**Target:** Closing cash on the Cash Flow Statement equals `Cash (1101) + Bank (1102)` on the Balance Sheet for the same date.

**Sub-tasks:**
1. `FinancialReportService.generateCashFlow()` returns opening cash, net change, closing cash.
2. Reconciliation assertion in the report itself: surface a "Tie-out: PASS/FAIL" badge.
3. Test: post a series of representative transactions; assert closing cash matches BS.

---

### Task 7.4 — Cash flow classification flag on Account

**Current:** `JournalLine.cfBucket` exists (per-line), but no `Account`-level classification.

**Target:** `Account.cashFlowSection ∈ {OPERATING, INVESTING, FINANCING, NONE}` — single source of truth for cash flow generation.

**Sub-tasks:**
1. Add `cashFlowSection` enum to `Account`.
2. Seed defaults: Fixed Assets → INVESTING, Owner's Equity / Loans → FINANCING, everything else operating.
3. `FinancialReportService.generateCashFlow()` reads from account classification instead of per-line bucket.
4. Deprecate `JournalLine.cfBucket` (keep for backward compat).

---

## Phase 8 — Performance & Audit

**Goal:** PDF §20.
**Estimate:** 1 sprint
**Priority:** P2 — needed before scale, not before correctness

### Task 8.1 — `gl_account_balances` pre-aggregated table

**Current:** Reports compute balances by aggregating `journal_lines` live.

**Target:** Maintain a `gl_account_balances(account_id, fiscal_period_id, branch_id, outlet_id, cost_center_id, debit_total, credit_total, closing_balance)` table updated atomically with every posting.

**Sub-tasks:**
1. New entity `GlAccountBalance` with composite unique key.
2. In `PostingEngineService.persist()`, after writing lines, upsert balance rows.
3. Use DB-level row lock or `INSERT ... ON CONFLICT ... DO UPDATE` (PostgreSQL).
4. Migrate existing data: one-shot rebuild from `journal_lines`.
5. Reports read from this table for performance; transaction lines only for drill-down.
6. Nightly job to verify summary matches sum of lines — alert on drift.

**Files:**
- New: `.../generalledger/GlAccountBalance.java`, repo
- `.../postingengine/PostingEngineService.java`
- `.../financials/reports/FinancialReportService.java`
- New: `.../config/GlBalanceRebuildJob.java` (Spring `@Scheduled`)

---

### Task 8.2 — Critical indexes per PDF §20

**Current:** Some indexes exist (`idx_journal_entry_branch`).

**Target:** Index table per PDF §20 fully applied.

**Sub-tasks (apply via `@Index` on entities, which `ddl-auto=update` will create):**
- `gl_transaction_header`: `(branch_id, transaction_date)`; unique `voucher_no`; `(ref_doc_no, transaction_type)`.
- `gl_transaction_lines`: `(account_id, period_id)`; `(header_id, line_no)`; `(branch_id, cost_center_id)`.
- `ar_ledger`: `(customer_id, due_date)`; partial index on `outstanding_amt > 0`.
- `ap_ledger`: `(vendor_id, due_date)`.
- `inventory_movements`: `(item_id, branch_id, posting_date)`.
- `inventory_balances`: `(item_id, batch_id, branch_id)`; partial index on `expiry_date IS NOT NULL`.

Run `EXPLAIN ANALYZE` on slow queries before/after to validate.

---

### Task 8.3 — Partition large tables by fiscal year

**Current:** Single table for all years.

**Target:** Partition `journal_lines` by fiscal year for fast year-end reports.

**Sub-tasks (PostgreSQL):**
1. Use declarative partitioning: `PARTITION BY RANGE (date)`.
2. One partition per fiscal year.
3. Auto-create next year's partition on year-rollover (admin task or scheduled job).
4. Test query plans: year-end TB scans only the current year's partition.

**Note:** Hibernate doesn't manage partitioning — apply via raw SQL migration in `config/SchemaInitializer` or external migration. Document the deviation from `ddl-auto=update` convention.

---

### Task 8.4 — Period-end lock at DB trigger level

**Current:** Period lock at application layer only.

**Target:** DB trigger rejects inserts into `journal_lines` where `entry.date` falls in a Closed period — defense against direct SQL / ETL.

**Sub-tasks:**
1. SQL trigger function `fn_check_period_open()` raises exception if posting to closed period.
2. Trigger `trg_journal_line_period_check BEFORE INSERT ON journal_lines`.
3. Document override procedure (drop trigger + post + recreate) for emergency adjustments.

---

### Task 8.5 — Manual JV maker-checker workflow

**Current:** `JournalEntry.status ∈ {Draft, Posted}`. `validateManualEntry` blocks control accounts. No approval workflow.

**Target:** Manual JVs above a configurable threshold (default AED 10,000) require a second approver before posting.

**Sub-tasks:**
1. Extend `JournalEntry.status` to include `PENDING_APPROVAL`.
2. `JournalEntryService.submitForApproval(entry)` — sets status if amount > threshold; otherwise posts directly.
3. `JournalEntryService.approve(entry, approver)` — checks approver ≠ preparer; posts.
4. RBAC permissions: `permissions.journal.create`, `permissions.journal.approve`, `permissions.journal.approve-high-value`.
5. Settings page: configure threshold per branch.
6. UI: pending-approval queue for accountants/managers.

**Files:**
- `.../generalledger/JournalEntry.java` — status enum
- `.../generalledger/JournalEntryService.java` — workflow methods
- `.../security/RolePermissionInitializer.java` — new permissions
- `billbull-frontend/src/pages/Financials/JournalEntryApprovalQueue.jsx`

---

## Phase 9 — QA & Compliance Sign-off

**Goal:** Execute the full PDF §21 checklist as automated integration tests.
**Estimate:** 0.5 sprint
**Priority:** P2 — gate before any production release

### Task 9.1 — Posting Engine integration tests (PDF §21 A)
- Every posted transaction has Σdebit = Σcredit (verify across all flows).
- Posting to locked period rejected with code `PERIOD_LOCKED`.
- Missing Branch dimension rejected with `MISSING_DIMENSION`.
- Concurrent posting (50 threads) produces no duplicate voucher numbers.
- Database failure mid-write rolls back fully — assert no partial entries.

### Task 9.2 — Sales flow tests (PDF §21 B)
- Sales Invoice posting creates AR Dr, Deferred Revenue Cr, VAT Output Cr at correct amounts.
- COGS posted on DN delivery — Inventory Cr = COGS Dr.
- Credit sale exceeding credit limit blocked.
- VAT calculated on net amount after trade discount.
- POS cash sale → Cash/Card Dr (not AR).

### Task 9.3 — Customer advance tests (PDF §21 C)
- Advance receipt → no Revenue posting; Customer Advance (2104) Cr.
- Apply advance to invoice → both AR and Customer Advance reduce correctly.
- Refund → Cash Cr + Customer Advance Dr.

### Task 9.4 — Purchase flow tests (PDF §21 D)
- GRN creates inventory entry only — no P&L impact.
- PI clears GRNI and creates AP; input VAT recorded as asset.
- Price variance posted to PPV.

### Task 9.5 — Returns tests (PDF §21 E)
- Sales CN reduces AR, Revenue, VAT Output; restores Inventory at **original cost**.
- Purchase DN reduces AP, Inventory, VAT Input.
- Return entries reference original invoice number.

### Task 9.6 — Settlement discount tests (PDF §21 F)
- Customer receipt with discount: Bank Dr (net), Discount Allowed Dr, AR Cr (full).
- Vendor payment with discount: AP Dr (full), Bank Cr (net), Discount Received Cr.

### Task 9.7 — Payroll tests (PDF §21 G)
- Salary JV balances: Σdebit (gross) = Σcredit (net payable + advances + deductions).
- WPS payment reduces Salary Payable to zero and reduces Bank by net amount.
- Employee advance visible as current asset until deducted.

### Task 9.8 — Bank reconciliation tests (PDF §21 H)
- Book bank balance = sum of all bank account postings.
- Unreconciled items listed with aging.
- Bounced cheque re-opens AR.

### Task 9.9 — Inventory & COGS tests (PDF §21 I)
- WAC recalculates correctly after every GRN.
- FEFO allocates earliest-expiring batch.
- Expiry write-off debits write-off expense, credits Inventory at correct batch cost.
- Branch transfer leaves total company inventory unchanged.

### Task 9.10 — Financial reports tests (PDF §21 J)
- BS: Total Assets = Total Liabilities + Equity for any date.
- TB: Σdebits = Σcredits for any period.
- P&L Net Profit = movement in Retained Earnings on BS.
- Cash Flow closing = BS Cash + Bank.
- AR Aging total = AR control balance.
- AP Aging total = AP control balance.
- Inventory Report total = Inventory account balance.

**Deliverable:** `mvn -o test` in `billbull-backend/` runs all 50+ assertions; CI blocks merge on failure.

---

## Recommended Sequencing & Effort

| Priority | Phases | Why | Effort (1 dev) |
|---|---|---|---|
| **P0 (start immediately)** | 1 (engine hardening), 3 (sales completion), 4 (purchase + discounts + PDC) | Fixes correctness gaps in flows already in production today | ~3.5 sprints |
| **P1** | 2 (masters), 5 (inventory accuracy), 6 (payroll), 7 (reports + recon) | Structural completeness; required for audited financials | ~3.5 sprints |
| **P2** | 8 (performance + maker-checker), 9 (full QA) | Scale + compliance sign-off; can be deferred until v1 features are stable | ~1.5 sprints |
| **Total** | | | **~8.5 sprints** for one engineer; **~4.5 sprints** with two engineers parallelising (P0 + P1) |

---

## Cross-cutting Concerns

### A. Database migrations strategy
- The repo uses `spring.jpa.hibernate.ddl-auto=update`. Most new entities will be auto-created.
- **One-shot data migrations** (default fiscal year creation, dimension backfill, GL balance rebuild) must go in seeders (`config/*Seeder.java`) following the existing convention (`SystemAccountSeeder`, `FinancialsDefaultSeeder`).
- **Schema migrations requiring raw SQL** (partitioning, triggers) are not naturally handled by `ddl-auto=update`. Document and apply manually OR introduce Flyway for these cases. Discuss with team before adding Flyway — it's a project-wide convention shift.

### B. RBAC permissions to add
| Permission | Module | Used in |
|---|---|---|
| `permissions.posting.backdate-into-locked` | financials | Phase 1.2 |
| `permissions.sales.override-credit-limit` | sales | Phase 3.4 |
| `permissions.journal.create` | financials | Phase 8.5 |
| `permissions.journal.approve` | financials | Phase 8.5 |
| `permissions.journal.approve-high-value` | financials | Phase 8.5 |
| `permissions.vendor.advance` | purchase | Phase 4.1 |
| `permissions.customer.advance.refund` | sales | Phase 3.2 |

Register all in `security/RolePermissionInitializer.java`.

### C. Frontend touchpoints
- `src/api/`: add `journalApi.js`, `vendorAdvanceApi.js`, `currencyApi.js`, `paymentTermsApi.js`, `outletApi.js`.
- `src/pages/Financials/`: new pages for ReconciliationHealth, JournalEntryApprovalQueue, VendorAdvance.
- `src/pages/Sales/CustomerStatement.jsx`: apply-advance button.
- `src/pages/Settings/`: FiscalYear management, Currency master, PaymentTerms master, Outlet management.
- Tailwind v4 brand palette: keep `#F5C742`, `bg-[#FFF8E7]`, `border-[#FDE6A9]`.

### D. Backwards compatibility
- Existing journal entries lack: branch_id on lines, currency/FX columns, outlet, fiscalYearId on period. Plan a one-shot backfill seeder per migration.
- Do NOT delete existing data. Use additive schema changes only.
- Existing voucher numbers (single sequence) coexist with new per-branch/per-type numbers — disambiguate by storing the format version on the entry.

### E. Decisions requiring stakeholder sign-off before starting

1. **COA code-range migration** (Phase 2.5) — keep current `1101/2101` or migrate to PDF `1001/2001`. **Recommendation: keep.**
2. **Multi-currency scope** (Phase 2.2) — full implementation now or AED-only with column placeholders for later. **Recommendation: column placeholders, deferred FX.**
3. **Inter-branch accounting model** (Phase 5.3) — keep cost-center variant or migrate to inter-branch receivable/payable. **Recommendation: keep cost-center.**
4. **Manual JV approval threshold** (Phase 8.5) — default value. **Recommendation: AED 10,000, configurable per branch.**
5. **DB migration tool** (Cross-cutting A) — stay on `ddl-auto=update` + seeders, or introduce Flyway for SQL migrations. **Recommendation: keep current convention; add raw SQL via `SchemaInitializer` for the few cases needing it.**

---

## Final Note

Every numbered task above maps directly to a section in `BillBull_Financial_Flow.pdf`. The QA checklist in Phase 9 is a near-verbatim port of PDF §21 and represents the production-readiness gate. The accounting engine is not a feature — it is the foundation.

Build it right. Test it thoroughly. Never compromise on the double-entry balance check.
