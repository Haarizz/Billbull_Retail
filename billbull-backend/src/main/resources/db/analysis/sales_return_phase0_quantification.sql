-- ============================================================================
-- Sales Return — Phase 0 historical quantification
--
-- Read-only. Every statement here is a SELECT; nothing is inserted, updated or
-- deleted, and no remediation is attempted or implied. These are the §05 queries
-- from POS_SALES_RETURN_ECONOMIC_MODEL.html, written against the current schema
-- so they can be run per tenant database before any later phase touches history.
--
--   psql -h <host> -U <user> -d <tenant_db> -f sales_return_phase0_quantification.sql
--
-- Historical remediation belongs at the END of the overall project, after the
-- target model exists to post toward and with accounting sign-off on the posting
-- dates. Run these, record the numbers, change nothing.
-- ============================================================================

\echo '== 1. Card/bank returns with no refund-settlement journal =================='
-- These show a netted-to-zero customer statement against a GL that still carries
-- an unsettled credit on 1100. Anyone reconciling a pre-fix period finds a
-- difference the code no longer explains.
SELECT count(*)            AS return_count,
       COALESCE(SUM(r.total_amount), 0) AS total_amount
FROM   sales_returns r
WHERE  r.status = 'APPROVED'
  AND  r.refund_method IN ('CARD_REFUND', 'BANK_TRANSFER')
  AND  NOT EXISTS (SELECT 1 FROM journal_entries je
                   WHERE je.reference = r.return_number || '-RFND');

\echo '== 2. Cash returns with no ACTIVE drawer payout ============================'
-- Same inverted discrepancy, plus a drawer that never recorded the payout.
SELECT count(*)            AS return_count,
       COALESCE(SUM(r.total_amount), 0) AS total_amount
FROM   sales_returns r
WHERE  r.status = 'APPROVED'
  AND  r.refund_method = 'CASH_REFUND'
  AND  NOT EXISTS (SELECT 1 FROM pos_cash_movements m
                   WHERE m.reference = r.return_number
                     AND m.movement_type = 'DROP_OUT'
                     AND m.status = 'ACTIVE');

\echo '== 3. Legacy voucher returns counted twice ================================='
-- A row matched by the sumLedgerCredit* fallback AND holding a 2061 liability:
-- the credit reduces outstanding while the voucher is still redeemable. V78
-- backfilled refund_method from internal_notes, so this is expected to be empty.
SELECT count(*) AS return_count,
       COALESCE(SUM(r.total_amount), 0) AS total_amount
FROM   sales_returns r
JOIN   credit_vouchers cv ON cv.source_return_number = r.return_number
WHERE  r.status = 'APPROVED'
  AND  r.refund_method IS NULL
  AND  UPPER(COALESCE(r.return_action, '')) LIKE '%CREDIT%';

\echo '== 4. Restocked returns with no stock movement ============================='
-- GL 1200 debited, on-hand never rose. No safe automated repair: this needs a
-- physical stock take per branch.
SELECT count(*) AS return_count
FROM   sales_returns r
WHERE  r.status = 'APPROVED'
  AND  EXISTS (SELECT 1 FROM sales_return_items i
               WHERE i.sales_return_id = r.id
                 AND i.item_status = 'Good'
                 AND COALESCE(i.return_qty, 0) > 0)
  AND  EXISTS (SELECT 1 FROM journal_entries je
               WHERE je.reference = r.return_number || '-INV')
  AND  NOT EXISTS (SELECT 1 FROM stock_movements sm
                   WHERE sm.reference_no = r.return_number
                     AND sm.quantity > 0);

\echo '== 5. Every restocked return ever — the reconcileInventory offset =========='
-- Σ {ref}-INV journal debits. Backfilling historical unit_cost would move
-- historical WAC, so the recommendation is to document this as an opening
-- difference at the cut-over date and stamp costs from then on.
SELECT count(DISTINCT je.id)        AS inventory_journal_count,
       COALESCE(SUM(jl.debit), 0)   AS total_inventory_debit
FROM   journal_entries je
JOIN   journal_lines jl ON jl.journal_entry_id = je.id
WHERE  je.reference LIKE 'SR%-INV'
  AND  jl.account_code = '1200';

\echo '== 5b. Inbound return stock movements carrying no unit cost ================'
-- The population whose inventory value is missing from inventory_balances while
-- the GL has already debited 1200 for it.
SELECT count(*)                      AS movement_count,
       COALESCE(SUM(sm.quantity), 0)  AS total_quantity
FROM   stock_movements sm
WHERE  sm.source_type = 'SALES_RETURN'
  AND  sm.quantity > 0
  AND  (sm.unit_cost IS NULL OR sm.unit_cost = 0);

\echo '== 6. Day-boundary splits (R8 / R16) ======================================'
-- Returns whose POS trading date disagrees with the calendar date they were
-- booked on. Directly sizes how many closed days have a drawer payout with no
-- return behind them.
SELECT count(*) AS return_count,
       MIN(r.return_date) AS earliest,
       MAX(r.return_date) AS latest
FROM   sales_returns r
WHERE  r.trading_date IS NOT NULL
  AND  r.trading_date <> r.return_date;

\echo '== 7. Returns exceeding their invoice outstanding =========================='
-- Approximated by the invoice's CURRENT balance, which is what the schema can
-- answer today. The single most useful number for the Phase 2 business decision:
-- it says how often the paid/unpaid policy question actually arises.
SELECT count(*) AS return_count,
       COALESCE(SUM(r.total_amount - COALESCE(si.balance, 0)), 0) AS excess_amount
FROM   sales_returns r
JOIN   sales_invoices si ON si.invoice_number = r.linked_invoice
WHERE  r.status = 'APPROVED'
  AND  r.total_amount > COALESCE(si.balance, 0);

\echo '== 8. Customers with negative effective outstanding (R1b) =================='
-- Sizes the floor defect, and says how much held customer credit would exist on
-- day one of the new model.
WITH invoice_balances AS (
    SELECT customer_code, COALESCE(SUM(balance), 0) AS open_balance
    FROM   sales_invoices
    WHERE  customer_code IS NOT NULL
    GROUP  BY customer_code
), return_credits AS (
    SELECT customer_code, COALESCE(SUM(total_amount), 0) AS ledger_credit
    FROM   sales_returns
    WHERE  customer_code IS NOT NULL
      AND  status = 'APPROVED'
      AND  (refund_method = 'CUSTOMER_CREDIT'
            OR (refund_method IS NULL
                AND (return_action IS NULL OR UPPER(return_action) LIKE '%CREDIT%')))
    GROUP  BY customer_code
)
SELECT count(*) AS customer_count,
       COALESCE(SUM(COALESCE(ib.open_balance, 0) - rc.ledger_credit), 0) AS net_negative
FROM   return_credits rc
LEFT   JOIN invoice_balances ib ON ib.customer_code = rc.customer_code
WHERE  COALESCE(ib.open_balance, 0) - rc.ledger_credit < 0;

\echo '== 9. Cross-branch returns (§19) =========================================='
-- If this is zero, the branch guard is a rule with no migration behind it. If
-- not, it is a P&L restatement conversation.
SELECT count(*) AS return_count,
       COALESCE(SUM(r.total_amount), 0) AS total_amount
FROM   sales_returns r
JOIN   sales_invoices si ON si.invoice_number = r.linked_invoice
WHERE  r.status = 'APPROVED'
  AND  r.branch_id IS NOT NULL
  AND  si.branch_id IS NOT NULL
  AND  r.branch_id <> si.branch_id;

\echo '== 10. Unlinked returns (§20, Phase 3 prerequisite) ======================='
-- Quantifies decision 9: if staff use this path for goodwill credits, closing it
-- leaves them nowhere to go, so the manual credit note has to ship alongside.
SELECT count(*) AS return_count,
       COALESCE(SUM(total_amount), 0) AS total_amount
FROM   sales_returns
WHERE  linked_invoice IS NULL OR linked_invoice = '';

\echo '== 11. Baseline: approved returns by refund method ========================'
-- Context for all of the above, and the population the corrected X/Z buckets
-- now classify.
SELECT COALESCE(refund_method, '(null — legacy)') AS refund_method,
       count(*)                                   AS return_count,
       COALESCE(SUM(total_amount), 0)             AS total_amount,
       COALESCE(SUM(refund_amount), 0)            AS refund_amount
FROM   sales_returns
WHERE  status = 'APPROVED'
GROUP  BY refund_method
ORDER  BY refund_method;
