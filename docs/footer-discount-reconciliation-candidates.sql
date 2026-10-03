-- Footer discount — historical reconciliation CANDIDATES (READ-ONLY).
-- docs/footer-discount-audit-2026-10-01.md, finding N1.
--
-- Before the server-side allocator (V108), saving an invoice, then confirming it from the same
-- screen (e.g. the Fast Sale batch flow) could re-apply the footer discount to the line money
-- the browser re-derived from the saved lines. The posted invoice then carries the footer
-- discount roughly twice.
--
-- Signature of an affected EXCLUSIVE-VAT invoice:
--   * header sub_total should equal Σ line (qty × price − item discount) — the pre-footer base.
--     A doubled invoice has sub_total ≈ base − bill_discount_amount instead.
--   * and/or Σ line footer_discount drifts from the header bill_discount_amount.
--
-- This query only LISTS candidates for a finance review. It changes nothing. Any correction of a
-- posted invoice is a controlled finance process (credit/debit note), never a data patch.
--
-- Caveats: FOC lines are not valued here (they reduce the base), and VAT-inclusive invoices
-- had a different legacy footer meaning — both are flagged separately for manual review.

WITH line_totals AS (
    SELECT
        it.sales_invoice_id,
        SUM(ROUND(COALESCE(it.quantity, 0) * COALESCE(it.price, 0)
                  * (1 - COALESCE(it.discount, 0) / 100.0), 2))      AS recomputed_base,
        SUM(COALESCE(it.footer_discount, 0))                         AS line_footer_total,
        SUM(COALESCE(it.net_amount, 0))                              AS line_net_total,
        BOOL_OR(COALESCE(it.foc, 0) > 0)                             AS has_foc
    FROM sales_invoice_items it
    WHERE COALESCE(it.voided, FALSE) = FALSE
    GROUP BY it.sales_invoice_id
)
SELECT
    i.id,
    i.invoice_number,
    i.invoice_date,
    i.status,
    i.sales_type,
    i.vat_mode,
    i.bill_discount_type,
    i.bill_discount_amount                                   AS header_footer_discount,
    lt.line_footer_total,
    i.sub_total,
    lt.recomputed_base,
    ROUND(lt.recomputed_base - i.sub_total, 2)               AS base_shortfall,
    i.invoice_total,
    lt.has_foc,
    CASE
        WHEN COALESCE(i.vat_mode, 'EXCLUSIVE') = 'EXCLUSIVE'
         AND ABS((lt.recomputed_base - i.sub_total) - i.bill_discount_amount) <= 0.05
            THEN 'LIKELY DOUBLE FOOTER DISCOUNT'
        WHEN ABS(lt.line_footer_total - i.bill_discount_amount) > 0.05
            THEN 'LINE SHARES DO NOT RECONCILE TO HEADER'
        ELSE 'REVIEW'
    END                                                      AS candidate_reason
FROM sales_invoices i
JOIN line_totals lt ON lt.sales_invoice_id = i.id
WHERE COALESCE(i.bill_discount_amount, 0) > 0
  AND COALESCE(i.sales_type, '') <> 'POS_SALE'           -- POS bill discount is header-only by design
  AND i.status NOT IN ('DRAFT', 'CANCELLED')
  AND (
        -- base check is only meaningful for VAT-exclusive invoices (INCLUSIVE sub_total is ex-VAT)
        (COALESCE(i.vat_mode, 'EXCLUSIVE') = 'EXCLUSIVE' AND ABS(lt.recomputed_base - i.sub_total) > 0.05)
     OR ABS(lt.line_footer_total - i.bill_discount_amount) > 0.05
  )
ORDER BY i.invoice_date DESC, i.invoice_number;
