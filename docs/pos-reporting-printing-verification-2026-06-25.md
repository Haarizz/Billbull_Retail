# POS Reporting & Printing — End-to-End Verification Report

**Date:** 2026-06-25
**Branch:** feature/jun25
**Scope:** X-Report, Z-Report, thermal/A4 printing, void reporting, currency, print architecture
**Method:** traced DB → entity → repository → service → DTO/Map → API → frontend VM → print generator for every displayed field. No value assumed correct.

---

## 0. Files in the data path

| Layer | File |
|---|---|
| Entity | `pos/session/PosSession.java`, `pos/session/PosCashMovement.java`, `pos/audit/PosAuditLog.java` |
| Repo | `pos/session/PosSessionRepository.java`, `sales/invoice/SalesInvoiceRepository.java`, `pos/audit/PosAuditLogRepository.java` |
| Service | `pos/session/PosSessionService.getXReport` / `getZReport` / `closeSession` |
| Audit | `pos/audit/PosAuditService.java` (writes `pos_audit_log`) |
| API | `pos/session/PosSessionController.java` |
| Frontend VM | `pages/Sales/POSSales.jsx` → `buildXReportViewModel` / `buildZReportViewModel` / `*ExcelRows` |
| Print engine | `utils/printGenerator.js` (`generateReportA4Html`), `utils/documentTemplateRenderer.js`, `utils/overlayInvoiceRenderer.js` |
| Schema | `db/migration/V14__pos_audit_return_void.sql` |

---

## 1. Field-by-field verification (X & Z Report)

Legend: ✅ wired & correct · ⚠️ wired but wrong/partial · ❌ not wired (stub / hardcoded / missing source)

### Session Information
| Field | Status | Evidence |
|---|---|---|
| Session Number | ✅ | `session.id` → `SESS-%06d` in VM |
| Open Time | ✅ | `PosSession.openedAt` |
| Close Time | ⚠️ | `closedAt` exists but **not surfaced** in X-Report VM note/KPIs |
| Terminal | ✅ | `terminalId` |
| Counter | ✅ | `counterName` |
| Cashier | ⚠️ | VM uses `openedBy`; a multi-cashier session shows only the opener, not per-invoice cashier |
| Branch | ✅ | `branchName` |
| Device | ❌ | No `PosDevice` join in report; `pos_device` exists but unreferenced |
| Shift | ❌ | No shift concept in `PosSession` |
| Opening Cash | ✅ | `openingCash` |
| Closing Cash | ⚠️ | only present after close (`closingCash`); X-Report recomputes from denominations client-side |

### Sales Summary
| Field | Status | Evidence |
|---|---|---|
| Gross Sales | ⚠️ | VM labels `totalSales` (incl. VAT) as "Gross Sales"; true gross (before discount) not computed |
| Net Sales | ⚠️ | `salesAmountExTax = totalSales − totalTax`; correct only if no rounding/charges |
| Taxable Sales | ⚠️ | same as Net; no exempt/zero-rated split |
| VAT Amount | ✅ | `Σ invoice.taxTotal` |
| Discount Amount | ⚠️ | `Σ invoice.billDiscountAmount` only — **line/item discounts excluded** |
| Item / Invoice / Manual / Promotion / Coupon Discount | ❌ | not separated; single `totalDiscount` |
| Round Off | ❌ | not aggregated |
| Delivery / Service Charges | ❌ | not aggregated |
| Deposit Applied | ❌ | not aggregated |
| Credit Sales | ✅ | `totalCreditSales` |
| Layaway Sales | ❌ | `pos_layaway` exists; never joined into report |

### Payment Summary
| Field | Status | Evidence |
|---|---|---|
| Cash / Card / Credit / Mixed | ✅ | session bucket columns, incremented atomically in `recordInvoiceOnSession` |
| Wallet / Bank Transfer / Gift Voucher / Loyalty / Store Credit | ❌ | classifier collapses everything else into `cash` (fallback at `recordInvoiceOnSession` line ~264) |
| **Total Paid = Σ completed payments (not invoice total)** | ⚠️ | session buckets are incremented by **`invoice.invoiceTotal`**, not by actual tender — wrong for partial payment / deposit / credit-balance settlement |

### Invoice Summary
| Field | Status |
|---|---|
| Total Invoices | ✅ (`invoiceCount`) |
| Completed | ⚠️ implied = total; no status filter |
| Draft / Cancelled / Returned / Refunded | ❌ |
| Held Orders | ❌ (`pos_held_sale` not joined) |
| Layaways | ❌ |
| Quotations | ❌ |

### Tax Summary
VAT % ❌ hardcoded "VAT 5%" in VM · VAT Amount ✅ · Taxable ⚠️ · Tax Exclusive/Inclusive ❌ · Zero-Rated ❌ · Exempt ❌

### Item Summary
Total Items Sold ⚠️ (counts line rows, not Σqty consistently) · Qty Sold ⚠️ · Qty Returned ❌ · Average Basket ❌ · Average Invoice ❌ · Highest/Lowest Invoice ❌

### Cash Movement
Cash In/Out/Drop ✅ (`PosCashMovement` DROP_IN/DROP_OUT) · Petty Cash ❌ · Float ✅ · Opening/Expected ✅ · Actual ✅ (client denom count) · Difference ✅

### Stock Summary
Items Sold ⚠️ · Items Returned ❌ · Stock Deducted ❌ (not read from `StockMovement`) · Reserved/Released ❌ · Warehouse ❌ · Batch Movement ❌ · Serial Movement ❌ — **entire section absent from report service**

### Audit Information
Voids ❌ · Deleted/Removed Items ❌ · Cancelled Payments ❌ · Reprints ❌ · Refunds ❌ · Discount/Price Overrides ❌ · Manager Approvals ❌ · Login/Logout ❌
> All of these are **already captured** in `pos_audit_log` (see `PosAuditService`), but **`getXReport`/`getZReport` never query that table.** This is the single biggest wiring gap.

---

## 2. Confirmed defects (root-caused)

1. **Void count hardcoded.** `PosSessionService.getXReport` line ~328: `summary.put("voidItemCount", 0); // tracked via audit log in future`. Z-Report omits it entirely.
2. **`totalVoids` / `totalRefunds` never incremented.** Columns exist on `pos_sessions` (V14) and the entity, and the frontend VM reads `sess.totalVoids`/`sess.totalRefunds` — but no code path ever writes them. They are permanently `0`. So §8/§10 of the X-Report (Returns/Voids) are always zero.
3. **Detailed void list not implemented.** Prompt requires per-line void detail (invoice, time, cashier, SKU, batch, serial, reason, approver, removed-from-cart vs voided-after-post). Source data exists: `sales_invoice_items.void_reason/voided_by/voided_at` + `pos_audit_log` (ITEM_VOIDED). Neither is read into either report.
4. **No "removed from cart (never posted)" vs "voided after invoice" distinction.** Cart `isVoided` lines are dropped before save (POSSales.jsx ~1563); only audit-logged removals survive. Report does not differentiate — prompt explicitly requires separation.
5. **Session totals keyed off `invoiceTotal`, not tender.** `recordInvoiceOnSession` adds the whole invoice total to one payment bucket. Partial payments, deposits, and credit settlements make "Total Paid" diverge from actual cash/card collected.
6. **Currency hardcoded `AED`.** Every VM builder: `const fmt = (n) => \`AED ${...}\``. The print engine (`renderTextWithCurrencySymbols` / `resolveCurrencyDisplayConfig`) *can* swap the symbol, but it only rewrites the literal token "AED"; non-AED currencies (€, ₹, $) are never produced because the source is AED-locked and the resolver keys on the AED token.
7. **No thermal (58/80mm) renderer for X/Z reports.** Only `generateReportA4Html` (A4 portrait) exists. The screenshots show users printing the X-Report through the A4 path to "Microsoft Print to PDF" — there is no receipt-printer template.
8. **Two report HTML generators coexist.** `generateReportA4Html` (new, VM-based) and `generateReportPrintHtml` (legacy landscape, column-based). POS uses the former; other reports still use the latter — duplicated layout/format logic, a real divergence risk per the prompt's architecture concern.

---

## 3. What is actually correct (verified, no change needed)

- Cash/Card/Credit/Mixed bucketing math and the atomic `incrementSessionTotals` UPDATE (no hot-row contention).
- Expected-cash formula `opening + cashSales + dropIn − dropOut` (X-Report and `closeSession` agree).
- Cash-variance threshold gate with supervisor override (`closeSession`).
- Z-Report immutable snapshot captured at close (`z_report_json`).
- `normalizeReportSection` correctly bridges the legacy `{cols,rows,footer}` VM shape into the keyed A4 renderer (fixes the earlier print crash).
- Session-close and cash-movement GL postings are wired.

---

## 4. Scalability / correctness concerns for production

- `getXReport` loads **all invoices + items** for a session into memory to derive tax/discount/item counts. For 100+ line sessions across a busy day this is an N+1 / large-fetch risk; should be `SUM`/`COUNT` projections in the repository.
- Item-discount exclusion (defect #2/§Sales) means VAT-inclusive totals can silently disagree with the GL — a reconciliation hazard.
- Tender-vs-invoice-total mismatch (#5) means the Z-Report cash line will not tie to the cash GL account on any non-fully-paid sale.

---

## 5. Recommended build order (deliverables #1–#9)

**P0 (correctness — reports currently lie):**
1. Backend: query `pos_audit_log` + `sales_invoice_items` void columns; expose `voids[]` detail + counts; split "removed-from-cart" vs "voided-after-post". (Deliverables #1, #3)
2. Backend: increment `totalVoids`/`totalRefunds`; fix Total-Paid to sum tender not invoice total. (#1)
3. Backend: add missing summary projections (net/taxable/discount breakdown, deposit, layaway, item/basket averages, stock movement). (#1)

**P0 (printing):**
4. New 58/80mm thermal X/Z templates + A4 enterprise template, fed by the same VM. (#2)
5. Shared print engine refactor so preview = print = PDF = reprint = email. (#9, P2)

**P1 (receipt polish):**
6. Currency from company/branch config through a single formatter. (#6)
7. Receipt item layout Qty × Name / Unit / Line + optional SKU/batch/serial. (#5)
8. Configurable QR/Stamp placement before/after footer. (#4)

---

## 5a. P0 BACKEND WIRING — IMPLEMENTED (2026-06-25)

Stakeholder decisions applied: **Total Paid = actual tender collected**; **per-invoice cashier + Device + Shift in scope**.

**Tender model (defect #5, #Payment §) — fixed**
- `PaymentRepository.sumTenderByModeForInvoices` / `findTenderForInvoices`: aggregate RECEIVED, non-CANCELLED/non-FAILED `sales_payments` joined to the session by invoice number (`linkedInvoice`). This is the authoritative collected-tender source (per-leg cash + card rows that POS checkout already creates).
- `PosSessionService.aggregateTender` buckets free-text modes (cash/card/credit/bankTransfer/wallet/voucher/cheque/loyalty/storeCredit/other) — "credit card" correctly resolves to CARD.
- X & Z payment summary (`cashSales/cardSales/creditSales/…`, `totalPaid`) now reflect **collected tender**, not invoice value. `expectedCash` uses actual cash tender (consistent with `closeSession`).

**Void / refund reporting (defects #1–#4) — fixed**
- `voidItemCount` no longer hardcoded 0. `total_voids` is now incremented atomically per checkout in `incrementSessionTotals` (added `voidDelta`).
- `buildVoidReport` returns two separate buckets (ERP requirement — never mixed):
  - `voids[]` = **posted-then-voided** lines from `sales_invoice_items` (voided=true) with full detail: invoice, item, sku, serial, qty, unit price, line total, reason, voidedBy, voidedAt.
  - `cartRemovals[]` = **removed-from-cart** ITEM_VOIDED audit rows with no matching posted line (audit detail only).
- Counts surfaced: `postedVoidCount`, `cartRemovalCount`, `voidAmount`, `totalRefunds`.

**Missing projections (defect §Sales/§Item) — added**
- `buildSalesSummary`: grossSales (line gross), netSalesExTax/taxableSales, **lineDiscount + billDiscount split** (line discount = gross × discount%), deliveryCharge, roundOff, totalItemsSold (Σqty net of voids), lineCount, averageInvoice, averageBasket, highest/lowest invoice. All voided lines excluded from every figure.
- Per-cashier collection attribution (`cashiers[]`) keyed by `Payment.createdBy` — supports multi-cashier sessions.

**Frontend (POSSales.jsx) — surfaced**
- X-Report VM: §3 footer now "Total Collected" = actual tender; §10 split into "Voided (Posted then Voided)" with full audit columns, §11 "Removed From Cart (Never Posted)", §12 "Cashier Attribution".
- Z-Report VM: added §10a cashier collection attribution, §10b/§10c void detail; §13 Total Collection uses actual tender.
- Response shape is backward-compatible (all prior summary keys retained as aliases).

**Tests:** `PosSessionServiceTest` updated for the new constructor + tender-based contract; all 12 pass. Full POS package green. Frontend lints clean (0 errors).

**Still deferred (next phases per agreed order):** Device/Shift dimensions need a source field on `PosSession` (not yet added — placeholder only); thermal 58/80mm X/Z templates (#2); shared print-engine refactor (#9); currency-from-config formatter (#6); receipt item layout (#5); QR/stamp placement (#4). Scalability: `getXReport` still loads invoices+items in memory — projection-based SUM/COUNT is a follow-up.

---

## 5b. DEVICE/SHIFT + P0 PRINTING — IMPLEMENTED (2026-06-25)

**Device & Shift dimensions (source-backed, no fabricated data)**
- Device resolves from the registered `PosTerminal` (`terminalName` + `deviceInfo`) keyed by `session.terminalId` — no new schema. `PosTerminalRepository.findByTerminalId` already existed.
- Shift derived from `session.openedAt` time band (Morning 05–12 / Afternoon 12–17 / Evening 17–22 / Night). No master, no migration.
- `PosSessionService.buildSessionInfo` exposes sessionNo/terminal/counter/cashier/branch/device/deviceInfo/shift/openedAt/closedAt/opening+closing cash. Added to X (`sessionInfo` object) and Z (`sessionInfo` list) responses.
- Frontend X-Report VM gains a "0. Session Information" section showing all of the above incl. Device + Shift + Closed At.

**Thermal 58/80mm X/Z template — NEW**
- `printGenerator.generateReportThermalHtml(vm, cp, { paper })` consumes the **same view-model** as the A4 renderer. Monospace, fixed-width (58mm=32ch, 80mm=48ch), label/value layout: first col=label, last col=amount (right-aligned), middle cols folded into `(a/b)`. `padThermalRow` wraps over-width labels (no clip), `pre-wrap` prevents overflow. Centered company/title header, KPI block, per-section blocks with dashed footers, "END OF REPORT".

**A4 enterprise template — enhanced**
- Existing `generateReportA4Html` already had the amber header, KPI strip, sectioned tables, page-break-safe rows, footer. Added: CSS `@page` page-numbers (`Page N of M`) and `meta.orientation: 'landscape'` support (swaps `@page size`).

**Single-engine wiring**
- New `reportPrintMode` state ('a4'|'80mm'|'58mm') with a format `<select>` in both X and Z report headers.
- `renderReportHtml(vm, cp, meta)` dispatches A4 vs thermal from one view-model. Preview + Print both route through it. PDF export stays A4 (a thermal-roll PDF isn't useful). No duplicated report templates.

**Verified:** backend compiles, full POS test package green; frontend `npm run build` succeeds, 0 lint errors.

**Still pending (P1):** currency-from-config formatter (#6 — VM `fmt` still emits literal "AED"; thermal+A4 both run text through `renderTextWithCurrencySymbols` so the symbol *image* swaps for AED, but non-AED currencies need the formatter); receipt (invoice) item layout qty×name/unit/line (#5); QR/stamp placement before/after footer (#4). Perf: getXReport still in-memory.

---

## 5c. P1 RECEIPT POLISH — IMPLEMENTED (2026-06-25)

**Currency from config (#6)**
- Source = `CompanyProfile.currency` / `currencySymbol` via `useCompany()` context (was hardcoded 'AED' everywhere).
- Print engine `renderTextWithCurrencySymbols` rewired: builds the token pattern from the **configured** currency code (plus AED for legacy strings) instead of a hardcoded AED regex — so USD/EUR/INR tokens swap to their narrow symbol; AED still renders the dirham image.
- Report VM `fmt` helpers + `formatCurrencyStr` + Excel "Amount (CUR)" headers now emit `activeCurrency` (the code), which the engine converts to symbol.
- On-screen renderers (`POSCurrency.jsx`): `DirhamSymbol`/`CurrencyAmount`/`renderAED` made currency-aware via `setActiveCurrency(code)` (called from a POSSales effect). AED → mask image; others → text symbol. Backward-compatible (defaults to AED).

**Receipt item layout (#5)**
- `buildThermalReceiptHtml` line items now render two rows: "Qty x Name" then "@ <unit>  =  <line total>" (unit price was previously missing). Optional SKU / description / serial / batch sub-lines retained. Live preview `buildThermalSampleHtml` updated to match (preview = print).

**QR / stamp placement (#4)**
- Found & fixed a dead-wiring bug: the "QR / Image Position (Before/After Footer Text)" toggle in the print designer (POSConsole) was bound to the unrelated `showBarcode` field. Rewired to a real `qrPlacement` ('before'|'after') field.
- New `tplInvoiceQrPlacement` state in POSSales, persisted in `printTemplateConfig` (`invoiceQrPlacement`), passed to all 4 `buildThermalReceiptHtml` call sites.
- `buildThermalReceiptHtml` now emits the QR/stamp/footer-image block either before (default) or after the footer text per `qrPlacement`.

**Verified:** frontend `npm run build` succeeds, 0 lint errors across all 5 changed files.

**Still pending / known limits:** A4 document receipt renderer (`documentTemplateRenderer`) currency still flows via its own `companyProfile.currency` — report A4/thermal + POS thermal receipt are covered, but a full audit of every non-POS document (LPO/GRN/Quotation) currency is out of this scope. Perf: `getXReport` still loads invoices+items in memory (SUM/COUNT projection is the remaining follow-up). The QR-placement field is shared across receipt/invoice/return tabs (single setting) by design.

---

## 5d. REPORT PERFORMANCE — FIXED (2026-06-25)

Re-investigation refined the original §4 concern: the report is **bounded** (one cashier's session for X; one branch-day for Z), so row *count* is not the cliff. The real defect was an **N+1**: `findByPosSessionId` returns invoices but `items` is LAZY, so `buildSalesSummary`/`buildVoidReport` streaming items fired one extra SELECT per invoice.

- Added `findByPosSessionIdWithItems` + `findByBranchIdAndPosSessionIdInWithItems` (`LEFT JOIN FETCH i.items`) and switched X/Z report to them → items load in a single query.
- Deliberately **kept** the invoice-row load (did NOT replace with pure SUM/COUNT projections): the void detail, per-cashier attribution, tender lines, and invoice-range features all require row-level data, and pure aggregates would break them. The JOIN FETCH removes the N+1 without losing any detail.

**Verified:** POS + sales test suites green; frontend build clean. (Two unrelated pre-existing failures elsewhere — `WarehouseServiceTest`, `LedgerServiceBankAccountTest` — are not in this changeset.)

---

## 6. Open decisions needed from stakeholder

- Tender model: is "Total Paid" meant to equal collected tender or invoice value? (changes #5)
- Is multi-cashier-per-session in scope, or one cashier per session? (changes Cashier field)
- Are Shift and Device dimensions required now, or deferred? (no source today)
