-- ============================================================================
-- Sales Return ↔ Invoice ↔ Customer Statement — consistency verification
--
-- READ-ONLY. Every statement is a SELECT.
--
--   sudo -u postgres psql
--   \c billbull_royaltools
--   \i /tmp/sales-return-invoice-statement-verification.sql
--
-- Scoped to the two documents under review and the customer behind them:
--   INV-2026-1581  ← SR-2026-0010  (130.00, CARD_REFUND)
--   INV-2026-1757  ← SR-2026-0009  (226.00, CARD_REFUND)
--   customer 89, LAGHOTAIH PASTIRIES
-- Change the three \set values below to check any other pair.
--
-- WHAT "WORKS PROPERLY" MEANS HERE
-- --------------------------------
-- Four surfaces have to agree, and they are computed four different ways:
--
--   1. sales_invoices stored fields        amount_paid / return_credited / balance / status
--   2. the canonical recomputation         InvoiceBalanceService: receipts + applied advances
--                                          + applied return credits, floored at zero
--   3. the customer statement              StatementService: a credit for the FULL return value,
--                                          plus a debit for the paid portion when the return
--                                          settles outside the receivable
--   4. the general ledger                  account 1100 for this customer's documents
--
-- The statement deliberately shows a return as TWO rows, not one. A card refund credits the
-- customer the full return value and then debits back the paid portion, because the money was
-- physically handed over — the two net to zero on the statement, which is correct, and is why a
-- customer refunded for goods they never paid for still shows the invoice as owed.
-- ============================================================================

\set inv_a '''INV-2026-1581'''
\set inv_b '''INV-2026-1757'''
\set cust  '''89'''

\pset pager off

\echo '== 1. The two invoices: stored vs canonical recomputation =================='
-- Mirrors InvoiceBalanceService.recomputeInvoiceBalance exactly. Any non-zero *_variance means
-- the stored field disagrees with what the allocation ledgers derive, and the next event that
-- touches the invoice will silently change it.
WITH derived AS (
    SELECT si.id, si.invoice_number, si.customer_code, si.invoice_date, si.status,
           si.invoice_total, si.amount_paid, si.return_credited, si.balance,
           COALESCE((SELECT SUM(rv.amount) FROM sales_receipt_vouchers rv
                     WHERE rv.sales_invoice_id = si.id
                       AND LOWER(TRIM(rv.status)) = 'completed'), 0)        AS receipts,
           COALESCE((SELECT SUM(aa.applied_amount) FROM advance_applications aa
                     WHERE aa.invoice_number = si.invoice_number
                       AND aa.status = 'APPLIED'), 0)                       AS advances,
           COALESCE((SELECT SUM(ca.applied_amount) FROM sales_return_credit_applications ca
                     WHERE ca.invoice_number = si.invoice_number
                       AND ca.status = 'APPLIED'), 0)                       AS return_credits
    FROM sales_invoices si
    WHERE si.invoice_number IN (:inv_a, :inv_b)
)
SELECT invoice_number, invoice_date, status,
       invoice_total,
       amount_paid                                   AS stored_paid,
       receipts + advances                           AS derived_paid,
       COALESCE(amount_paid, 0) - (receipts + advances)           AS paid_variance,
       return_credited                               AS stored_credited,
       return_credits                                AS derived_credited,
       COALESCE(return_credited, 0) - return_credits AS credited_variance,
       balance                                       AS stored_balance,
       GREATEST(invoice_total - receipts - advances - return_credits, 0) AS derived_balance,
       COALESCE(balance, 0)
         - GREATEST(invoice_total - receipts - advances - return_credits, 0) AS balance_variance
FROM derived
ORDER BY invoice_number;

\echo '== 2. Every allocation and receipt behind them ============================'
-- What the recomputation above is reading. Empty is a valid answer and means the invoice has
-- never been paid or credited — which is itself the finding for these two.
SELECT 'receipt' AS kind, si.invoice_number, rv.date AS dated, rv.amount, rv.status, rv.payment_mode AS detail
FROM sales_receipt_vouchers rv JOIN sales_invoices si ON si.id = rv.sales_invoice_id
WHERE si.invoice_number IN (:inv_a, :inv_b)
UNION ALL
SELECT 'advance', aa.invoice_number, aa.applied_date, aa.applied_amount, aa.status, NULL
FROM advance_applications aa WHERE aa.invoice_number IN (:inv_a, :inv_b)
UNION ALL
SELECT 'return credit', ca.invoice_number, ca.applied_date, ca.applied_amount, ca.status::text, ca.return_number
FROM sales_return_credit_applications ca WHERE ca.invoice_number IN (:inv_a, :inv_b)
ORDER BY invoice_number, dated;

\echo '== 3. The returns against them, and their economic split =================='
-- would_be_unpaid_portion is what SHOULD have become an allocation row; would_be_paid_portion is
-- the only part a card or bank refund may legitimately move. A return whose unpaid portion is
-- non-zero and whose allocation row count is zero is one the Phase 2 model would have split.
SELECT r.return_number, r.return_date, r.status, r.refund_method, r.return_action,
       r.total_amount, r.refund_amount, r.linked_invoice,
       si.balance                                              AS invoice_balance_now,
       LEAST(r.total_amount, COALESCE(si.balance, 0))           AS would_be_unpaid_portion,
       r.total_amount - LEAST(r.total_amount, COALESCE(si.balance, 0)) AS would_be_paid_portion,
       (SELECT COUNT(*) FROM sales_return_credit_applications ca
        WHERE ca.return_number = r.return_number AND ca.status = 'APPLIED') AS applied_allocations,
       -- Mirrors SalesReturn.settlesOutsideReceivable(): anything but CUSTOMER_CREDIT, falling
       -- back to the legacy return_action text when refund_method is null.
       CASE WHEN r.refund_method IS NOT NULL THEN r.refund_method <> 'CUSTOMER_CREDIT'
            WHEN COALESCE(r.return_action, '') = '' THEN false
            ELSE UPPER(r.return_action) NOT LIKE '%CREDIT%' END AS settles_outside_receivable
FROM sales_returns r
LEFT JOIN sales_invoices si ON si.invoice_number = r.linked_invoice
WHERE r.linked_invoice IN (:inv_a, :inv_b)
ORDER BY r.return_number;

\echo '== 4. The customer statement, rebuilt exactly as StatementService builds it ='
-- Row types and signs match StatementService: invoices debit, receipts credit, advance
-- applications credit, a return credits its FULL value, and a return that settles outside the
-- receivable then debits back its paid portion (refund_amount).
WITH ledger AS (
    SELECT si.invoice_date AS dated, 2 AS sort_priority, 'INVOICE' AS entry_type,
           si.invoice_number AS reference, si.invoice_total AS debit, 0::numeric AS credit,
           'Sales Invoice ' || si.invoice_number AS description
    FROM sales_invoices si
    WHERE si.customer_code = :cust AND si.status NOT IN ('CANCELLED', 'DRAFT')

    UNION ALL
    SELECT rv.date, 4, 'RECEIPT', COALESCE(si.invoice_number, rv.reference), 0, rv.amount,
           'Receipt ' || COALESCE(rv.reference, '')
    FROM sales_receipt_vouchers rv
    LEFT JOIN sales_invoices si ON si.id = rv.sales_invoice_id
    WHERE rv.customer_code = :cust AND LOWER(TRIM(rv.status)) = 'completed'

    UNION ALL
    SELECT aa.applied_date, 3, 'ADVANCE_APPLIED', aa.invoice_number, 0, aa.applied_amount,
           'Advance applied to ' || aa.invoice_number
    FROM advance_applications aa
    JOIN sales_invoices si ON si.invoice_number = aa.invoice_number
    WHERE si.customer_code = :cust AND aa.status = 'APPLIED'

    UNION ALL
    SELECT r.return_date, 6, 'RETURN_CREDIT',
           COALESCE(NULLIF(r.linked_invoice, ''), '-'), 0, r.total_amount,
           'Sales Return ' || r.return_number
             || CASE WHEN COALESCE(r.linked_invoice,'') = '' THEN ''
                     ELSE ' against ' || r.linked_invoice END
    FROM sales_returns r
    WHERE r.customer_code = :cust AND r.status = 'APPROVED'
      AND COALESCE(r.total_amount, 0) > 0

    UNION ALL
    SELECT r.return_date, 7, 'RETURN_REFUND', r.return_number, r.refund_amount, 0,
           'Return settled by ' || COALESCE(r.refund_method, r.return_action, 'Refund')
    FROM sales_returns r
    WHERE r.customer_code = :cust AND r.status = 'APPROVED'
      AND COALESCE(r.refund_amount, 0) > 0
      AND (CASE WHEN r.refund_method IS NOT NULL THEN r.refund_method <> 'CUSTOMER_CREDIT'
                WHEN COALESCE(r.return_action, '') = '' THEN false
                ELSE UPPER(r.return_action) NOT LIKE '%CREDIT%' END)
)
SELECT dated, entry_type, reference, description, debit, credit,
       SUM(debit - credit) OVER (ORDER BY dated, sort_priority, reference
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM ledger
ORDER BY dated, sort_priority, reference;

\echo '== 5. Statement closing vs open invoice balances vs GL 1100 ==============='
-- The three numbers that must agree for this customer. They are derived independently:
--   statement_closing  the running balance from query 4
--   open_invoices      Σ sales_invoices.balance
--   gl_1100_net        this customer's documents in the general ledger
-- A difference between the first two is a statement/allocation disagreement. A difference against
-- the third is a sub-ledger vs GL break.
WITH ledger AS (
    SELECT si.invoice_total AS debit, 0::numeric AS credit
    FROM sales_invoices si
    WHERE si.customer_code = :cust AND si.status NOT IN ('CANCELLED', 'DRAFT')
    UNION ALL
    SELECT 0, rv.amount FROM sales_receipt_vouchers rv
    WHERE rv.customer_code = :cust AND LOWER(TRIM(rv.status)) = 'completed'
    UNION ALL
    SELECT 0, aa.applied_amount FROM advance_applications aa
    JOIN sales_invoices si ON si.invoice_number = aa.invoice_number
    WHERE si.customer_code = :cust AND aa.status = 'APPLIED'
    UNION ALL
    SELECT 0, r.total_amount FROM sales_returns r
    WHERE r.customer_code = :cust AND r.status = 'APPROVED' AND COALESCE(r.total_amount,0) > 0
    UNION ALL
    SELECT r.refund_amount, 0 FROM sales_returns r
    WHERE r.customer_code = :cust AND r.status = 'APPROVED' AND COALESCE(r.refund_amount,0) > 0
      AND (CASE WHEN r.refund_method IS NOT NULL THEN r.refund_method <> 'CUSTOMER_CREDIT'
                WHEN COALESCE(r.return_action, '') = '' THEN false
                ELSE UPPER(r.return_action) NOT LIKE '%CREDIT%' END)
)
SELECT (SELECT COALESCE(SUM(debit - credit), 0) FROM ledger)                   AS statement_closing,
       (SELECT COALESCE(SUM(balance), 0) FROM sales_invoices
         WHERE customer_code = :cust AND status NOT IN ('CANCELLED','DRAFT'))  AS open_invoice_balances,
       (SELECT COALESCE(SUM(debit - credit), 0) FROM ledger)
         - (SELECT COALESCE(SUM(balance), 0) FROM sales_invoices
             WHERE customer_code = :cust AND status NOT IN ('CANCELLED','DRAFT')) AS variance;

\echo '== 5b. GL 1100 for this customer''s documents =============================='
-- Separate because the GL is keyed by document reference, not customer: fast sales post as
-- FS-{invoice}, returns as {returnNumber}, settlements as {returnNumber}-RFND.
SELECT je.reference, je.entry_number, je.date, je.narration,
       SUM(jl.debit) AS dr, SUM(jl.credit) AS cr, SUM(jl.debit - jl.credit) AS net_dr
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE jl.account_code = '1100'
  AND je.status = 'Posted'
  AND (je.reference IN (SELECT invoice_number FROM sales_invoices WHERE customer_code = :cust)
    OR je.reference IN (SELECT 'FS-' || invoice_number FROM sales_invoices WHERE customer_code = :cust)
    OR je.reference IN (SELECT return_number FROM sales_returns WHERE customer_code = :cust)
    OR je.reference IN (SELECT return_number || '-RFND' FROM sales_returns WHERE customer_code = :cust)
    OR je.reference IN (SELECT return_number || '-REV' FROM sales_returns WHERE customer_code = :cust))
GROUP BY je.reference, je.entry_number, je.date, je.narration
ORDER BY je.date, je.reference;

\echo '== 6. Return quantities vs what the invoice actually sold ================='
-- Over-returning is an eligibility defect that no balance check would catch.
SELECT i.invoice_number, ri.item_code, ri.item_name,
       MAX(ii.quantity)            AS sold_qty,
       SUM(ri.return_qty)          AS returned_qty,
       SUM(ri.return_qty) - MAX(ii.quantity) AS over_returned_by
FROM sales_returns r
JOIN sales_return_items ri ON ri.sales_return_id = r.id
JOIN sales_invoices i      ON i.invoice_number = r.linked_invoice
LEFT JOIN sales_invoice_items ii ON ii.sales_invoice_id = i.id AND ii.item_code = ri.item_code
WHERE r.status = 'APPROVED' AND r.linked_invoice IN (:inv_a, :inv_b)
GROUP BY i.invoice_number, ri.item_code, ri.item_name
ORDER BY i.invoice_number, ri.item_code;

\echo '== 7. Stock: did the returned goods actually come back? =================='
SELECT r.return_number, ri.item_code, ri.return_qty, ri.item_status, ri.return_condition,
       COALESCE(sm.movements, 0)     AS inbound_movements,
       COALESCE(sm.qty, 0)           AS inbound_qty
FROM sales_returns r
JOIN sales_return_items ri ON ri.sales_return_id = r.id
LEFT JOIN (SELECT reference_no, COUNT(*) AS movements, SUM(quantity) AS qty
           FROM stock_movements WHERE quantity > 0 GROUP BY reference_no) sm
       ON sm.reference_no = r.return_number
WHERE r.linked_invoice IN (:inv_a, :inv_b)
ORDER BY r.return_number, ri.item_code;
