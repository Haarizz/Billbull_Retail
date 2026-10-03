# Footer Discount — Audit & Target Architecture

**Date:** 2026-10-01 · **Branch audited:** `feature/posclient` @ `031ac383` · **Scope:** Quotation, Sales Order, Proforma, Sales Invoice, Sales Return, POS, shared calc, GL, print, reports
**Status:** Audit only. No code, schema, API or UI has been changed.

Figures marked **[run]** were produced by executing the real `documentSummaryUtils.js` / `vatMath.js` against the example from the screenshot (Product A: 1 × 3,500, 20% disc, 5% VAT; Product B: 1 × 200, 10% disc, 20% VAT; footer AED 100). The rest comes from reading the code. Nothing was tested against a live database.

---

## A. Executive Summary

1. **Line-level allocation already exists, but only in the browser.** For Invoice, Quotation and Sales Order, `allocateFooterDiscount()` (frontend) splits the footer discount across lines in proportion to each line's pre-footer, ex-VAT taxable value. It sends the result as `footerDiscount` on each line, and that value is saved in `*_items.footer_discount`. The backend never calculates, checks or rounds that split. It stores whatever the client sends.
2. **Users can't see the split.** No item table, preview or print shows a line's footer share. Line totals on screen are pre-footer, so in the screenshot the 2,940.00 line total is before any footer discount. The figures saved to the database are post-footer.
3. **The modules don't agree on what footer discount means:**
   - **Invoice, Quotation, Sales Order:** applied before VAT and allocated to lines. Both % and fixed amount are supported.
   - **Proforma:** % only. VAT is calculated *before* the discount, so the discount doesn't reduce VAT, and nothing is allocated to lines.
   - **POS:** fixed amount only. It's subtracted *after* VAT as a header-level figure, so VAT isn't reduced and nothing is allocated to lines.
4. **Confirmed defects** (details in N):
   - **Double discount after save.** After save (and when printing from the invoice list), the footer discount is applied a second time. **[run]** The net shown/printed drops from 3,050.09 to 2,944.19. If the user then confirms from the same screen, the doubled figure is saved.
   - **Allocations don't reconcile.** Shares are sent as unrounded floats and then rounded separately per line. The sum of line shares can differ from the header (**[run]** 0.10 split across 3 lines → 0.09).
   - **Conversions lose the discount.** QTN/SO → Proforma drops it entirely. Several SO → Invoice and PI → Invoice paths drop fixed-amount discounts or carry over the wrong % / amount type.
   - **Reports add up percentages as if they were money** for "discount".
   - **Fixed-amount discounts in VAT-inclusive mode reduce the total by more than the entered amount.** A fixed AED 100 reduces the customer's total by AED 100 × (1 + VAT rate) (**[run]** 2,980 → 2,874.20 instead of 2,880).
5. **Most of the schema we need already exists.** Invoice, SO and Quotation lines have `footer_discount`. The main gaps are Proforma (no line field and no discount type) and a `taxable_amount` column on invoice lines. That missing column is the root cause of the double-discount bug.

**Recommendation:** make the backend calculate the allocation in one shared `FooterDiscountAllocator`, keep the allocation basis BillBull already uses, use deterministic rounding that puts the remainder on one line, reuse the existing `footer_discount` columns, and show the split on screen and in print. Some business decisions are needed first (O.2).

---

## B. Current Footer Discount Architecture

```
UI input (billDiscount + billDiscountType)            ── React state, per page
   │
   ├─ summarizeSalesItems()  utils/documentSummaryUtils.js:34   → on-screen totals (float, unrounded)
   ├─ allocateFooterDiscount() utils/documentSummaryUtils.js:229 → per-line share (float, unrounded)
   │
   ▼ payload: header {billDiscount %, billDiscountAmount, billDiscountType, billDiscountFixed}
   │          lines  {footerDiscount, taxAmount, netAmount|lineTotal}   ← all computed client-side
   │
Backend service  ── trusts line net/tax/footer; recomputes ONLY header sums
   │   subTotal = Σ(net − tax + footerDiscount)    (= pre-footer taxable)
   │   total    = subTotal − billDiscountAmount + Σtax + delivery + shipping + roundOff
   ▼
DB: header bill_discount_amount (money), bill_discount (%), bill_discount_type
    line footer_discount (money)  — no constraint tying Σ line to header
   │
GL: PostingEngineService uses HEADER figures only (revenue = subTotal − billDiscountAmount)
DN revenue recognition / Returns use LINE figures (netAmount, footerDiscount)
```

So two things are treated as the truth at once: header totals (used by the GL) and line amounts (used for delivery-note revenue recognition and returns). Nothing checks that they agree.

---

## C. Exact Current Calculation Flow

### C.1 Invoice / Quotation / Sales Order (frontend `summarizeSalesItems` + save mappers)

| Step | Formula (code) | Where |
|---|---|---|
| Gross | `qty × price` | `documentSummaryUtils.js:60`; `SalesInvoice.jsx:1814` (`calculateRow`) |
| FOC | `price × focQty` (unit-converted) | `documentSummaryUtils.js:10-27`, `SalesInvoice.jsx:1815-1827` |
| Pre-discount | `max(0, gross − foc)` | `:62` |
| Item discount | `preDisc × disc%` (on the *entered* price, inclusive or exclusive) | `:75`, `SalesInvoice.jsx:1830` |
| Net before footer (taxable) | EXCL: `preDisc − itemDisc`; INCL: `(preDisc − itemDisc)/(1+r)` | `vatMath.js:21-47` |
| Footer total | amount: `min(value, Σtaxable)`; percent: `Σtaxable × pct` | `documentSummaryUtils.js:136-140` |
| Line share | `taxable_i / Σtaxable × footerTotal` — voided lines excluded, **no rounding** | `:141,147`, `:260-263` |
| Taxable after footer | `max(0, taxable_i − share_i)` | `:148`, `SalesInvoice.jsx:2180` |
| VAT | `taxableAfterFooter × r` (both modes, because the taxable value is already ex-VAT) | `:155`, `SalesInvoice.jsx:2182` |
| Line total | `taxableAfterFooter + VAT` | `:156`, `SalesInvoice.jsx:2183` |
| Grand total | `Σtaxable − Σshare + ΣVAT + delivery + roundOff` | `:194` |

**Order:** Gross → FOC → Item Discount → (INCL: extract VAT) → Footer share → VAT → Line total. **VAT is calculated after the footer discount.**

Backend header (`SalesInvoiceService.java:452-457`, `finalizeInvoiceTotals` `:818-855`; `SalesOrderService.java:198-221`; `QuotationService.recalculateTotals` `:752-783`, which uses `double` arithmetic):
`subTotal = round2(Σ(net − tax + footerDiscount))`, `total = subTotal − billDiscountAmount + round2(Σtax) + charges + roundOff`. If `billDiscountAmount` is 0 and `billDiscount%` > 0, it recalculates the amount as `subTotal × %`.

Backend line recompute happens **only if `netAmount` is missing or zero**:
- Invoice: `normalizeInvoiceItemFinancials` `:933-958` → `VatCalculator.compute(..., footerDisc, ...)`.
- Quotation: `completeMissingLineAmounts` `:431-459`. It always uses the exclusive formula and ignores `vatMode`.
- Sales Order: never recomputes.

### C.2 Proforma (backend-authoritative, `ProformaService.java:241-306`)
Line: `VatCalculator.compute(1, preDisc, disc%, footer=0, r, incl)`. Header: `billDiscAmt = taxableTotal × billDiscount%`, `tax = Σ line tax` (**before the discount**), `grandTotal = taxable − billDiscAmt + tax`. The frontend (`ProformaInvoice.jsx:347`) previews with `summarizeSalesItems`, which reduces VAT. **The preview and the saved figures disagree whenever a footer discount is set.**

### C.3 POS (`posUtils.js:173-220` → `PosCheckoutController.buildInvoice:767-935`)
`total = Σgross − ΣitemDisc − billDiscountAmount + (EXCL ? tax : 0)`. VAT is calculated on the value **before** the bill discount. Lines are sent with no `footerDiscount`. The backend recomputes each line through `VatCalculator` with footer = 0, then `finalizeInvoiceTotals` subtracts `billDiscountAmount` at header level.

### C.4 Mode differences
| | Basis | VAT before/after footer | Types |
|---|---|---|---|
| Invoice / QTN / SO | ex-VAT taxable after item discount | after (reduces VAT) | % and amount |
| Proforma | ex-VAT taxable after item discount | **before** (VAT not reduced) | % only |
| POS | n/a (header only) | **before** (VAT not reduced) | amount only |

---

## D. Frontend Findings

| # | Finding | Location |
|---|---|---|
| D1 | Shared allocator exists, proportional to pre-footer ex-VAT taxable value, voided lines excluded | `utils/documentSummaryUtils.js:229 allocateFooterDiscount`, `:34 summarizeSalesItems` |
| D2 | No rounding and no remainder handling. Raw floats go into the payload | `:262`; `SalesInvoice.jsx:2177-2204`, `Quotations.jsx:1579-1599`, `SalesOrders.jsx:1290-1307` |
| D3 | Invoice save calls `allocateFooterDiscount(items, fd)` **without `vatMode`**. This is harmless only because `taxableAmount` is always present | `SalesInvoice.jsx:2177` |
| D4 | Each module rebuilds post-footer tax differently. Invoice uses `taxableAmount`. QTN and SO use `total − taxAmt`. These agree today, but it's three copies of the same rule | the three mappers above |
| D5 | **`mapServerInvoiceItem` sets `taxableAmount = netAmount − taxAmount` (post-footer)**. After save (`:2260`) and batch save (`:2289`), rows aren't passed back through `calculateRow`, so the footer discount is applied again | `SalesInvoice.jsx:455-482`, `:2260`, `:2289` |
| D6 | **List-row print and PDF pass raw API items** (no taxable field) to `summarizeSalesItems`. Taxable is then derived from post-footer `netAmount`, and the footer is applied again to totals (lines print correctly, the totals don't) | `SalesInvoice.jsx:2945-3070`, `handlePrintClick:3153`, `handleDownloadClick:3138` |
| D7 | The editor's margin uses pre-footer taxable, so profit is overstated by the footer discount | `SalesInvoice.jsx:1270-1272` |
| D8 | `billDiscountFixed` is sent by every page but there's no backend field for it, so it's silently dropped. Reload falls back to `billDiscountAmount` | `SalesInvoice.jsx:2163` etc.; no match in backend |
| D9 | Proforma has no % / amount toggle. `summarizeSalesItems(items, billDiscount)` treats a bare number as a percentage | `ProformaInvoice.jsx:347` |
| D10 | POS keeps the bill discount as a header-only absolute amount (coupons, promotions) | `useCart.js:70`, `useCheckout.js:238` |
| D11 | No unit tests cover `summarizeSalesItems` / `allocateFooterDiscount` | — |

## E. Backend Findings

| # | Finding | Location |
|---|---|---|
| E1 | `VatCalculator.compute` accepts an "already allocated" `footerDiscount` and subtracts it from the **discounted value in the document's VAT mode** (VAT-inclusive in INCL). The frontend allocates **ex-VAT** amounts. The two meanings differ in INCL mode (this only matters when the backend recompute path runs) | `sales/common/VatCalculator.java:46-57` |
| E2 | No backend code ever calls `setFooterDiscount`. The allocation comes entirely from the client | grep: only setters defined |
| E3 | No check that `Σ line.footerDiscount == header.billDiscountAmount`, and no check that line net/tax match qty × price × disc × rate | `SalesInvoiceService.java:452-457`, `SalesOrderService.java:198-203`, `QuotationService.java:752-783` |
| E4 | Quotation header math uses `double`, and its line fallback ignores INCLUSIVE mode | `QuotationService.java:431-459, 752-783` |
| E5 | Proforma VAT isn't reduced by the bill discount, and Proforma has no line allocation | `ProformaService.java:300-304` |
| E6 | POS bill discount is header-only. Lines have `footer_discount = null` | `PosCheckoutController.java:792, 902-935` |
| E7 | Return eligibility counts `lineDiscount = itemDisc + footerDiscount` (good). `SalesReturnService.prorateDiscountFromInvoice` prorates **only** the item discount (it ignores footer) and only runs when the caller sends no discount | `SalesReturnEligibilityService.java:364-377`; `SalesReturnService.java:259-299` |
| E8 | Reports: `invoiceDiscount = billDiscount(%) + Σ item.discount(%)`. That adds **percentages as money**, and amount-type footer discounts (`billDiscount` = 0) disappear | `sales/reports/SalesReportDataService.java:2011-2014` (used at :448, :1270-1279, :1384, :1650) |

## F. Database Findings

| Table | Header columns | Line columns | Notes |
|---|---|---|---|
| `sales_invoices` / `_items` | `bill_discount` (float %), `bill_discount_amount` numeric(15,2), `bill_discount_type`, `tax_inclusive` + `vat_mode` | `footer_discount` numeric(15,2), `tax_amount`, `net_amount`, `gross_amount`; `discount` is a float **%**; **no `taxable_amount`** | money types from `V7__money_types.sql:35,42` |
| `sales_orders` / `_items` | same shape | `footer_discount` (15,2), **`taxable_amount` (15,2) exists but nothing writes to it** (the frontend doesn't send it, the service doesn't set it) | `V7:54,58` |
| `quotations` / `_items` | `bill_discount` numeric (%), `bill_discount_amount`, `bill_discount_type` | `footer_discount` (Hibernate default precision), `tax_amount`, `line_total` | not in V7 money list |
| `proforma_invoices` / `_items` | `bill_discount` (%) only; **no amount and no type** | **no footer column**; has `taxable_amount` | |
| `sales_returns` / `_items` | no header discount | `discount_amount` (item + footer, from client) | |

Highest migration is V107, so the next free number is **V108**.

## G. Tax / VAT Findings

- **Invoice / QTN / SO (EXCL):** per-line VAT is calculated on `taxable − share` at each line's own rate. Example **[run]**, AED 100 footer: A share 93.96 → VAT 135.30; B share 6.04 → VAT 34.79; total VAT 170.09 (176.00 without the footer). Multiple VAT rates are handled correctly, because each line keeps its own rate after the share is taken off.
- **INCL:** the share is calculated on ex-VAT values, so a "fixed AED 100" reduces the customer total by about 105.8 (**[run]** 2,980 → 2,874.20). Item discounts in INCL mode, by contrast, are taken off the VAT-inclusive price. The two discounts work in different VAT bases, and the user can't tell which one they're entering.
- **Proforma and POS:** VAT is charged on the value *before* the bill discount. Under UAE VAT (Art. 36, discounts given at the time of supply reduce the taxable value) this **overstates output VAT and the VAT shown to the customer**. This is the main tax risk. In a tax-exclusive POS, the customer also pays VAT on value they didn't pay for.
- Because Proforma behaves differently from Invoice, a PI → Invoice conversion with a footer % shows different VAT on the two documents.

## H. Allocation Findings

- **Basis in use (Invoice / QTN / SO):** net line value after item discount and FOC, before footer, **ex-VAT** (option D in the brief; the same as C in EXCL mode). It's applied the same way in all three modules because they share one utility.
- **Eligible lines:** every non-voided line. Zero-value lines get 0 automatically. Service, zero-rated and exempt lines **do** take part. There's no "non-discountable" flag (`Product` has none), no special handling for negative lines (they're clamped with `max(0, …)`), and no special handling for manually overridden lines.
- **Excess:** amount type is capped at Σtaxable. Percent has no cap in code (the UI input has `max=100`). Each line's taxable is floored at 0.
- **Not allocated:** Proforma, POS.

## I. Rounding Findings

- Shares are floats. JSON sends 15+ decimal places. Invoice/SO columns round to 2 dp on insert, and the quotation column uses Hibernate's default scale.
- The header `billDiscountAmount` is the unrounded total (stored at 2 dp). `Σ round2(share_i)` can differ from it by up to n × 0.005. **[run]** 0.10 split over 3 equal lines → 0.03 + 0.03 + 0.03 = 0.09.
- Nothing puts the rounding remainder anywhere. The invoice header still balances only because it adds back the *raw* (pre-persist) share before rounding (`SalesInvoiceService.java:456`).
- When the last delivery note on an invoice is delivered, any gap of 0.10 or less between recognised and invoiced revenue is snapped (`DeliveryNoteService.java:955-977`). This hides small mismatches rather than reconciling them.
- Currency: AED, 2 dp everywhere. Exchange rates aren't involved in these calculations.

## J. Cross-Module Comparison

| Module | Current behaviour | Line allocation? | Tax impact | Method | Issues |
|---|---|---|---|---|---|
| Quotation | % or amount, before VAT | Yes (client) | Reduces VAT | Proportional to ex-VAT taxable | `double` math; INCL ignored in backend fallback; no rounding |
| Sales Order | % or amount, before VAT | Yes (client) | Reduces VAT | same | `taxable_amount` column unused; no rounding |
| Proforma | **% only**, header | **No** | **VAT not reduced** | header × % | Preview ≠ saved; source discount dropped on import |
| Sales Invoice | % or amount, before VAT | Yes (client) | Reduces VAT | same | Double discount after save/print; no rounding; no backend check |
| POS | **amount only**, after VAT | **No** | **VAT not reduced** | flat header subtraction | Returns over-refund the discount share; Z-report counts it separately |
| Sales Return | uses invoice line `footer_discount` | inherits | VAT reversal from stored line tax | proration by qty | Backend backfill ignores footer; POS bill discount never reversed |

## K. Conversion Findings

All conversions happen in the frontend: the source document pre-fills the target editor, and the target is recalculated and saved as a new document. No backend conversion service exists. **Line shares are never copied.** Only the header type/value is carried over, and the allocation is recalculated on the target.

| Path | Code | Result |
|---|---|---|
| QTN → Invoice | `SalesInvoice.jsx:919-923` | Type and value preserved ✔. **Also:** `tax: Number(i.tax) \|\| 5` (`:877`, `:963`) turns zero-rated lines into 5% |
| QTN → SO | `SalesOrders.jsx:1466-1468` | Preserved ✔ |
| SO → Invoice (nav state) | `SalesInvoice.jsx:1018-1019` | Type is set, but the value comes from the `%` field → **amount-type discount lost** |
| SO → Invoice (SO dropdown) | `handleSOChange :1533` | Value from `%` field, **type not set** → amount type lost; a stale type can reinterpret the value |
| SO → Invoice (other paths) | `:1437-1440`, `:1608-1611` | Correct ✔ |
| PI → Invoice | `handlePIChange :1776`; PI → SO `SalesOrders.jsx:1506` | % only, **type not set** |
| QTN → PI / SO → PI | `ProformaInvoice.jsx:1256-1310` | **Footer discount dropped entirely** |
| Invoice → Return | `SalesReturnEligibilityService:255-260` | Line footer share carried ✔ (the only path that uses line allocations) |

Recalculating on the target gives the same split only if the lines are identical. Partial SO → Invoice or edited lines will legitimately give a different split. That's acceptable, but it should be the rule we write down.

## L. UI / UX Findings

- **Shown today:** line `Disc %` and `Tax x% (amount)` chips plus the pre-footer line total (screenshot: 2,940.00 / 216.00). The totals panel shows Subtotal (gross), Total Discount (item), Footer Discount input and amount, Taxable Amount, Total Tax and Net.
- **Missing:** each line's footer share, each line's taxable value after footer, and a post-footer line total. The line totals on screen don't add up to Net Invoice Amount once a footer discount is set. Nothing on screen explains that the footer discount also reduces VAT.
- **Labels differ:** "Subtotal" on screen is gross, but `sub_total` in the database is the pre-footer taxable value.
- Items tables (`components/InvoiceItemsTable.jsx`, `QuotationItemsTable.jsx`, `SalesOrderItemsTable.jsx`, `ProformaItemsTable.jsx`) have no footer column.

## M. Printing / Reporting Findings

- Templates (`utils/documentTemplateRenderer.js:1111-1180`) show **header-only** "Discount" and "Footer Discount (x%)" rows. There's no per-line footer column (the available columns are in `:786`). Line `taxableAmount` falls back to `total − tax`, which is post-footer, while the totals block shows pre-footer Taxable. The two don't match.
- Invoice list print / PDF: the totals block applies the footer discount twice (D6). The "Footer Discount" row uses the stored amount, so the printed rows don't add up to the printed Net.
- Quotation, SO and Proforma print run through the same `summarizeSalesItems`. Quotation list print (`Quotations.jsx:2369`, `:2452`) passes raw items with `lineTotal`/`taxAmount` (post-footer), so it's exposed to the same double application.
- POS receipts: the bill discount is a header line (`posPrintUtils.js`, `escPosReceipt.js`).
- GL (`PostingEngineService.java:300-316`, `:375-385`, `:500-505`): revenue is posted net (`subTotal − billDiscountAmount`), with no Discount Allowed account (an IFRS 15 net presentation). VAT Output = header `taxTotal`. AR = `invoiceTotal`. **Line shares aren't used** in the posting, but delivery-note revenue recognition uses line `netAmount` (`DeliveryNoteService.java:921-944`).
- Reports: "discount" figures are wrong (E8).
- Stock valuation / COGS: not affected (WAC from the stock ledger). Customer outstanding: correct (`invoiceTotal`/`balance` include the footer discount).

## N. Identified Problems (ranked)

| # | Severity | Problem | Evidence |
|---|---|---|---|
| N1 | **Critical** | Footer applied twice after save, after batch selection and in list-row print/PDF. A confirm right after a draft save (the Fast Sale batch flow) can persist the doubled discount | D5/D6; **[run]** 3,050.09 → 2,944.19 |
| N2 | **High (tax)** | Proforma and POS don't reduce VAT by the bill discount | C.2, C.3, G |
| N3 | **High** | The backend trusts client line money and has no allocation invariant | E2, E3 |
| N4 | **High** | Conversions drop or misread the discount (QTN/SO → PI; SO/PI → Invoice amount type) | K |
| N5 | High | Reports sum discount percentages as money | E8 |
| N6 | Medium | No rounding or remainder rule; Σ shares ≠ header | I, **[run]** |
| N7 | Medium | INCL mode: fixed footer amount is ex-VAT, item discount is inclusive. Backend `VatCalculator` uses the other meaning | E1, G |
| N8 | Medium | POS returns don't reverse the bill-discount share (over-refund); backend return backfill ignores footer | E6, E7 |
| N9 | Medium | Line total shown ≠ stored line total; no per-line visibility | L |
| N10 | Low | `billDiscountFixed` silently dropped; SO `taxable_amount` never written; Quotation `double` math | D8, F, E4 |
| N11 | Medium (adjacent) | QTN → Invoice turns zero-rated lines into 5% (`\|\| 5`) | K |

**Adjacent observations (outside footer scope, from code reading only — worth checking against a real ledger before acting):**
- (a) The delivery-note revenue entry debits Deferred Revenue by Σ line `netAmount`, which **includes VAT**. The invoice entry credits Deferred Revenue ex-VAT (`subTotal − billDiscountAmount`). On a VAT-bearing invoice that would overstate Sales Revenue and leave Deferred Revenue negative by the VAT amount. See `DeliveryNoteService.java:921-944` and the comment at `PostingEngineService.java:296-299`.
- (b) `SalesReportDataService.valuationFactor` (`:1998-2008`) multiplies COGS by hard-coded factors (FIFO 0.964, LIFO 1.038, …).

---

## O. Target-State Definition

### O.1 Invariants (all sales documents)
For every non-voided eligible line *i*, in document currency at 2 dp:
```
base_i            = line value after FOC and item discount, before footer (see O.2-Q1 for VAT basis)
share_i           = deterministic allocation of F over base_i      (2 dp)
Σ share_i         = F  (header bill_discount_amount)               — exact, enforced server-side
taxable_i         = exVat(base_i − share_i)
vat_i             = round2(taxable_i × r_i)   (EXCL)   |  extracted (INCL)
lineTotal_i       = taxable_i + vat_i
Σ lineTotal_i + delivery + shipping + roundOff = invoiceTotal
```
`F` is calculated once, on the server, from (`type`, `value`, Σ base), and is capped at Σ base.

### O.2 Decisions needed before implementation
- **Q1 — INCL basis.** Is a fixed footer amount in an INCLUSIVE document VAT-inclusive ("AED 100 off what you pay") or ex-VAT?
  - *Recommendation:* VAT-inclusive. Allocate over the VAT-inclusive line values, then extract VAT per line. That matches how item discounts already work in INCL mode, matches `VatCalculator`'s existing meaning, and makes "100 off" mean 100 off.
  - In EXCL mode both readings give the same result.
- **Q2 — POS.** Should POS bill discounts (manual, coupon, promotion) become allocated footer discounts that reduce VAT?
  - *Recommendation:* yes, for VAT correctness. It changes POS totals in tax-exclusive branches and the Z-report presentation, so make it its own phase.
- **Q3 — Proforma.** Bring Proforma to full parity (% or amount, allocated, VAT reduced)?
  - *Recommendation:* yes.
- **Q4 — Eligibility.** Do we need a "non-discountable" product or line flag (e.g. gift cards, deposits, services)?
  - Today every non-voided line is eligible. If no flag is needed, keep the current rule and write it down.
- **Q5 — Historical documents.** Leave posted documents exactly as stored and only display a share where one exists?
  - *Recommendation:* yes; see V.

---

## P. Recommended Architecture

1. **`sales/common/FooterDiscountAllocator`** (new, pure, no Spring dependencies, sitting next to `VatCalculator`):
   - Input: lines (`base`, `rate`, `eligible`), `type`, `value`, `vatMode`.
   - Output: `F`, `share_i`, `taxable_i`, `vat_i`, `total_i`.
   - Rounding: round each share HALF_UP to 2 dp, then add the leftover cents to lines in order of largest fractional remainder. Ties go to the larger base, then to the lower line index. This makes the result deterministic and keeps Σ = F.
2. **Every sales service calls the allocator before its header math:** `SalesInvoiceService`, `SalesOrderService`, `QuotationService`, `ProformaService`, and POS via `SalesInvoiceService`. Client-sent `footerDiscount`/`netAmount`/`taxAmount` are **ignored** for non-voided lines, or compared and logged during a transition window.
   - This makes the backend the source of truth, as the brief requires.
   - `VatCalculator.compute` already accepts the share, so it stays the single line formula.
3. **Header derives from lines:** `bill_discount_amount = Σ share_i`, `sub_total = Σ base_i` (current meaning), `tax_total = Σ vat_i`. Add an assertion that Σ lines + charges = total.
4. **Frontend:**
   - The live preview keeps `summarizeSalesItems`, changed to round shares the same way. One shared JS port of the allocator, mirrored and tested against the same fixtures as the Java version.
   - Saved, printed and reloaded documents **display the server's figures** instead of recalculating them.
   - Fix `mapServerInvoiceItem` so pre-footer taxable = `net − tax + footerDiscount`, or read a stored `taxable_amount`.
5. **Conversion rule:** carry header `{type, value}`; recalculate on the target with the same allocator. Put this in one helper (`resolveSourceFooterDiscount(src)`) used by every pre-fill path.
6. **GL unchanged in shape** (net revenue, header-level). It becomes trustworthy because header = Σ lines is enforced.

## Q. Required Code Changes (for approval — not done)

| Area | Change |
|---|---|
| Backend | New `FooterDiscountAllocator` + tests. Wire it into `SalesInvoiceService` (save path `:452-457`, `normalizeInvoiceItemFinancials`), `SalesOrderService:198-221`, `QuotationService:431-459, 752-783` (also move to BigDecimal), `ProformaService:241-306`, POS `buildInvoice` (after Q2). Fix `SalesReturnService.prorateDiscountFromInvoice` to include the footer share. Fix `SalesReportDataService.invoiceDiscount` to use money (`Σ item disc amt + bill_discount_amount`). |
| Frontend | Round allocations in `documentSummaryUtils`. Fix `mapServerInvoiceItem` + post-save `setItems` (`SalesInvoice.jsx:455-482, 2260, 2289`). Fix list-row print to use stored line figures (`:2945-3070`) and do the same for Quotation list print. Add a single `resolveSourceFooterDiscount` used at `SalesInvoice.jsx:1018, 1533, 1776`, `SalesOrders.jsx:1506`, `ProformaInvoice.jsx:1256-1310`. Add Proforma % / amount toggle. Remove `\|\| 5` tax fallback (`SalesInvoice.jsx:877, 963`). |
| Print | Add optional columns "Footer Disc." and "Taxable (after footer)" in `documentTemplateRenderer.js` (column registry `:786`, cells `:1001-1028`) and keep the template designer preview in step (dual-renderer note). |

## R. Required Database Changes (proposal, V108+)

Reuse what exists; add only what's missing.
- `proforma_invoice_items.footer_discount numeric(15,2)`, plus `proforma_invoices.bill_discount_amount numeric(15,2)` and `bill_discount_type varchar(20)`.
- `sales_invoice_items.taxable_amount numeric(15,2)` (nullable; this removes the derived-taxable ambiguity behind N1).
- Fix the type of `quotation_items.footer_discount` (and the quotation header money fields) to numeric(15,2), in the same guarded style as V7.
- **No** new allocation table: one column per line is enough, and avoids a second source of truth. All changes nullable and additive, with `to_regclass` guards per the Flyway convention.

## S. Required API Changes
- Request: clients keep sending `billDiscountType` + value. Line `footerDiscount`/`netAmount`/`taxAmount` become ignored on input (but still accepted, so nothing breaks).
- Response: lines include `footerDiscount` and `taxableAmount` (the new or populated column). Proforma request/response gain `billDiscountType` and `billDiscountAmount`.
- Either persist `billDiscountFixed` properly or drop it from payloads.

## T. Required UI Changes
- Item tables: a separate **"Footer Disc."** column (or a chip under the line, like the existing `Tax`/`Disc` chips), visually distinct from item `Disc %`. Also "Taxable" and a post-footer line total. A tooltip on the totals-panel Footer Discount row: "Allocated across N lines in proportion to their net value; reduces VAT."
- Proforma gets the % / AED toggle used by the other documents.
- Before save, show the server's allocation by previewing it with the mirrored JS allocator. After save, show the server's figures.

## U. Required Test Coverage
- **Java (Mockito / pure):**
  - Allocator: equal lines with an indivisible amount (0.10 / 3), mixed VAT rates (5% / 20% / 0%), INCL and EXCL, voided lines, zero-value lines, amount > Σ base (cap), percent = 100, single line, determinism across runs.
  - `finalizeInvoiceTotals` with a footer discount (currently untested in `SalesInvoiceTotalsTest`).
  - Header = Σ lines invariant for Invoice, SO, QTN and PI.
  - Return proration including the footer share.
  - Report discount in money.
- **JS (vitest):**
  - `summarizeSalesItems` / `allocateFooterDiscount` parity fixtures shared with Java (the same JSON).
  - `mapServerInvoiceItem` round-trip (save → reload → totals unchanged), which reproduces N1.
  - List-row print totals = stored totals.
  - Each conversion path keeps type and value.
- **Regression fixture:** the screenshot invoice with AED 100 and with 10% footer, EXCL and INCL. Expected EXCL / AED 100: shares 93.96 / 6.04, VAT 135.30 / 34.79, net 3,050.09 (before round-off).

## V. Migration / Backward-Compatibility Risks

- **Historical posted invoices:** their GL entries are final. Never recalculate CONFIRMED / PAID / POSTED documents on read. Show the stored `footer_discount` where it exists. For POS and Proforma history (no line share), show the header-only discount as today.
- **Documents already affected by N1:** some confirmed invoices may already carry a doubled discount. Find candidates with a query where `Σ footer_discount ≠ bill_discount_amount`, or where `sub_total − bill_discount_amount + tax_total + charges ≠ invoice_total`. Fixing those is a finance decision (credit/debit notes), not a data patch.
- **Drafts:** recalculated by the server on next save. Safe.
- **Rounding change:** totals may move by ±0.01 on re-saved drafts. Communicate this.
- **POS change (Q2):** changes VAT and totals for tax-exclusive branches mid-period. Release at a period boundary, and update Z/X reports and receipt templates together.
- **Proforma VAT change:** the same PI saved again will show lower VAT. Existing PIs keep their stored figures.
- **Returns:** after the POS change, returns against *old* POS invoices still have no line share. Keep the header-proration fallback for those.
- **Edited confirmed documents:** follow the current edit rules unchanged. The allocator runs on any save the rules already allow.
- **Print templates:** new columns default to off, so existing client templates render exactly as today.
