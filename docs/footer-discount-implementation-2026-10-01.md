# Footer Discount — Implementation Report

**Date:** 2026-10-01 · **Branch:** `feature/posclient` (base `031ac383`, uncommitted) · **Spec:** [footer-discount-audit-2026-10-01.md](footer-discount-audit-2026-10-01.md)

## 1. Calculation model (one model, two mirrored implementations)

Backend `sales/common/FooterDiscountAllocator.java` ⇄ frontend `src/utils/footerDiscountAllocator.js`, both pinned to `billbull-backend/src/test/resources/footer-discount-fixtures.json`.

```
gross        = round2(qty × price)
focDeduction = round2(price × FOC-in-selling-units)
preDiscount  = max(0, gross − focDeduction)
itemDiscount = min(preDiscount, round2(preDiscount × disc%))
base         = preDiscount − itemDiscount              (VAT-inclusive under INCLUSIVE)
F            = amount : min(round2(value), Σ eligible base)
               percent: round2(Σ eligible base × min(pct,100)%)
share_i      = largest-remainder apportionment of F over eligible base_i   (Σ share_i == F)
EXCLUSIVE    : taxable = base − share ; VAT = round2(taxable × r) ; total = taxable + VAT
INCLUSIVE    : total = base − share   ; taxable = round2(total ÷ (1+r)) ; VAT = total − taxable
header       : subTotal = Σ(taxable + share)  ·  total = subTotal − F + ΣVAT + delivery + shipping + roundOff = Σ line totals + charges
```

- **Eligible lines:** every non-voided line. Voided lines keep their own figures, take no share, and are excluded from totals. Zero-value lines take 0.
- **Rounding:** each exact share is floored to the cent. The leftover cents (always fewer than the number of lines) go one each to the lines with the largest discarded fraction; ties go to the larger base, then the lower line index. The result is deterministic and repeatable.
- **INCLUSIVE:** a fixed footer amount is the customer-facing amount. AED 100 off makes the customer pay exactly 100 less.

## 2. Where the allocation runs

| Document | Server allocates on save when | Otherwise |
|---|---|---|
| Sales Invoice | new or DRAFT, and not `POS_SALE` | CONFIRMED/PAID/… edits and POS keep the legacy path (stored values untouched) |
| Sales Order | new, DRAFT or CONFIRMED | PAID/DELIVERED/INVOICED keep their stored values |
| Quotation | any status except CONVERTED / INVOICED / EXPIRED | stored values summed as-is (BigDecimal) |
| Proforma | every save (ISSUED Proformas are already locked against editing) | — |

Client-sent `footerDiscount` / `netAmount` / `taxAmount` / `lineTotal` are still accepted for compatibility. On allocated saves they are overwritten.

## 3. Schema — `V108__footer_discount_line_allocation.sql`

Additive and idempotent, with nullable columns guarded by `to_regclass`:

| Change | Why |
|---|---|
| `sales_invoice_items.taxable_amount` | Post-footer taxable is now stored. Deriving it as net − tax caused the double discount. |
| `sales_invoice_items.foc_unit`, `quotation_items.foc_unit` | Lets the server value FOC in another unit exactly as the editor does. The editor already sent this field, but it was dropped. |
| `proforma_invoices.bill_discount_amount`, `bill_discount_type` | Proforma % / amount parity. |
| `proforma_invoice_items.footer_discount` | Per-line share on Proforma. |
| `quotation_items.footer_discount`, `quotations.bill_discount_amount` → `numeric(15,2)` | Only converted when they are currently a different numeric/double type. |

No allocation table was added. `footer_discount` on the line is the single per-line value, and the header `bill_discount_amount` always equals the sum of the lines.

## 4. Historical documents

- Nothing is recalculated on read or on deploy. `NULL` in a new column means the document was saved before allocation existed.
- Saved, reloaded, printed and PDF'd documents display **stored** line money (`summarizeStoredSalesItems`).
- Documents with only a header-level discount (POS, very old documents) show that discount from the header, with no per-line share.
- `docs/footer-discount-reconciliation-candidates.sql` is a **read-only** query that lists posted invoices showing the old double-discount signature, for finance review. It changes nothing.

## 5. Deliberately out of scope (POS phase)

POS still applies its bill discount header-only, after VAT. Moving POS onto line allocation changes:
- cart totals and tendering (the backend rejects a payment that exceeds the invoice total)
- receipts, layaways and held sales
- X and Z reports

All of these must change together, in a release at a period boundary. The code is isolated for that phase: `SalesInvoiceService.shouldAllocateFooterDiscount` excludes `POS_SALE` in one place. POS **returns** already benefit from this change: the header discount is apportioned with the same allocator (`InvoiceFooterDiscountShares`).
