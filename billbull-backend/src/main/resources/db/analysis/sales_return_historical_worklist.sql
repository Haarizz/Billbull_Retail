-- ============================================================================
-- Sales Return — historical worklist (row-level)
--
-- READ-ONLY. Every statement in this file is a SELECT. Nothing is inserted,
-- updated or deleted, and no remediation is attempted or implied.
--
-- RELATIONSHIP TO THE EXISTING ANALYSIS FILES
-- -------------------------------------------
--   sales_return_phase0_quantification.sql        — HOW MANY / HOW MUCH (counts, sums)
--   sales_return_phase2_incompatible_history.sql  — which rows the Phase 2 economic
--                                                   model would have settled differently
--   sales_return_phase2_stale_invoice_status.sql  — invoice-status exposure (a separate
--                                                   population; never add it to the above)
--   this file                                     — WHICH ROWS, named, one line per
--                                                   return, so each can be reviewed and
--                                                   repaired individually
--
-- Query 0 is the master worklist: one row per approved return with a flag per known
-- failure mode and a defect_count. Run it first, sort by defect_count DESC, then use
-- queries 1..16 for the per-return evidence behind whichever flag you are working on.
-- Query 0b is the histogram that says which flag to work on first.
--
--   psql -h <host> -U <user> -d <tenant_db> -f sales_return_historical_worklist.sql
--
-- NOTES ON THE SCHEMA THESE ARE WRITTEN AGAINST
--   * sales_returns.return_number is tenant-configurable (SalesDocumentNumberingService),
--     so nothing here matches a literal 'SR%' prefix — journals are found by joining
--     journal_entries.reference to return_number (and to return_number || '-INV' / '-RFND').
--   * GL references posted per return (PostingEngineService):
--       {return_number}          revenue/VAT reversal, Cr AR 1100
--       {return_number}-INV      Dr Inventory 1200 / Cr COGS 5001  (restock only)
--       {return_number}-RFND     Dr AR 1100 / Cr 1013 or 1010      (card / bank only)
--     Cash refunds clear the AR credit through the drawer DROP_OUT category posting;
--     vouchers through CREDIT_VOUCHER-ISSUE-{voucherId}; CUSTOMER_CREDIT by design has
--     no settlement entry, because the credit on the account IS the settlement.
--   * refund_method IS NULL means a legacy row written before the column existed
--     (V78 backfilled what it could from internal_notes).
--   * A scrap return (Damaged/Opened/Defective/Expired) legitimately has no stock
--     movement and no -INV entry. Query 0's inventory flags are written so a scrap
--     return does not raise them.
-- ============================================================================

\echo '== 0. MASTER WORKLIST — one row per approved return, with defect flags ====='
WITH r AS (
    SELECT sr.id,
           sr.return_number,
           sr.return_date,
           sr.trading_date,
           sr.branch_id,
           b.name                AS branch_name,
           sr.customer_code,
           sr.customer_name,
           sr.linked_invoice,
           sr.refund_method,
           sr.return_action,
           sr.entry_point,
           sr.pos_session_id,
           COALESCE(sr.total_amount, 0)  AS total_amount,
           sr.refund_amount,
           sr.authorized_at
    FROM   sales_returns sr
    LEFT   JOIN branches b ON b.id = sr.branch_id
    WHERE  sr.status = 'APPROVED'
), flags AS (
    SELECT r.*,
           -- the base return journal itself is missing: the sale is still fully recognised
           NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number)
                AS f_no_return_journal,
           -- card/bank refund with no -RFND settlement: AR still credited for money that left
           (r.refund_method IN ('CARD_REFUND','BANK_TRANSFER')
            AND NOT EXISTS (SELECT 1 FROM journal_entries je
                            WHERE je.reference = r.return_number || '-RFND'))
                AS f_no_refund_settlement,
           -- cash refund with no live drawer payout
           (r.refund_method = 'CASH_REFUND'
            AND NOT EXISTS (SELECT 1 FROM pos_cash_movements m
                            WHERE m.reference = r.return_number
                              AND m.movement_type = 'DROP_OUT'
                              AND m.status = 'ACTIVE'))
                AS f_no_drawer_payout,
           -- a voucher was issued AND the row still reads as a ledger credit → counted twice
           (r.refund_method IS NULL
            AND UPPER(COALESCE(r.return_action,'')) LIKE '%CREDIT%'
            AND EXISTS (SELECT 1 FROM credit_vouchers cv
                        WHERE cv.source_return_number = r.return_number))
                AS f_voucher_double_counted,
           -- 1200 debited but no stock ever came in
           (EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-INV')
            AND NOT EXISTS (SELECT 1 FROM stock_movements sm
                            WHERE sm.reference_no = r.return_number
                              AND sm.quantity > 0))
                AS f_inv_posted_no_stock,
           -- stock came in with no -INV entry: on-hand rose with nothing in the GL behind it
           (EXISTS (SELECT 1 FROM stock_movements sm
                    WHERE sm.reference_no = r.return_number
                      AND sm.source_type = 'SALES_RETURN'
                      AND sm.quantity > 0)
            AND NOT EXISTS (SELECT 1 FROM journal_entries je
                            WHERE je.reference = r.return_number || '-INV'))
                AS f_stock_no_inv_journal,
           -- inbound movement with no cost: quantity rose, inventory value did not
           EXISTS (SELECT 1 FROM stock_movements sm
                   WHERE sm.reference_no = r.return_number
                     AND sm.source_type = 'SALES_RETURN'
                     AND sm.quantity > 0
                     AND (sm.unit_cost IS NULL OR sm.unit_cost = 0))
                AS f_inbound_zero_cost,
           -- POS trading date disagrees with the calendar date it was booked on (R8 / R16)
           (r.trading_date IS NOT NULL AND r.trading_date <> r.return_date)
                AS f_day_boundary_split,
           -- no invoice behind the return at all (§20)
           (r.linked_invoice IS NULL OR r.linked_invoice = '')
                AS f_unlinked,
           -- returned at a branch other than the one that raised the invoice (§19)
           EXISTS (SELECT 1 FROM sales_invoices si
                   WHERE si.invoice_number = r.linked_invoice
                     AND si.branch_id IS NOT NULL
                     AND r.branch_id IS NOT NULL
                     AND si.branch_id <> r.branch_id)
                AS f_cross_branch,
           -- return exceeds what the invoice still owes → the Phase 2 paid/unpaid split
           -- would have moved part of this as money and part as an allocation
           EXISTS (SELECT 1 FROM sales_invoices si
                   WHERE si.invoice_number = r.linked_invoice
                     AND r.total_amount > COALESCE(si.balance, 0))
                AS f_exceeds_outstanding,
           -- the inverse, and the more serious case: a money-moving refund method on a return
           -- with an UNPAID portion. The customer had not paid for these goods, so under the
           -- Phase 2 model the return has no paid portion for CASH/CARD/BANK/VOUCHER to move
           -- (SalesReturnRefundMethod.movesValueToCustomer) — the customer was refunded AND is
           -- still billed. Only CUSTOMER_CREDIT is legitimate here.
           (r.refund_method IN ('CASH_REFUND','CARD_REFUND','BANK_TRANSFER','CREDIT_VOUCHER')
            AND EXISTS (SELECT 1 FROM sales_invoices si
                        WHERE si.invoice_number = r.linked_invoice
                          AND COALESCE(si.balance, 0) > 0))
                AS f_money_refund_on_unpaid,
           -- pre-Phase-2: no allocation row exists for the receivable leg
           (r.linked_invoice IS NOT NULL AND r.linked_invoice <> ''
            AND NOT EXISTS (SELECT 1 FROM sales_return_credit_applications ca
                            WHERE ca.return_number = r.return_number
                              AND ca.status = 'APPLIED'))
                AS f_no_credit_application,
           -- header money fields disagree with each other
           (r.refund_amount IS NOT NULL AND r.refund_amount <> r.total_amount)
                AS f_refund_amount_mismatch
    FROM r
)
SELECT return_number, return_date, trading_date, branch_name, customer_code, customer_name,
       linked_invoice, refund_method, return_action, entry_point, total_amount, refund_amount,
       (f_no_return_journal::int + f_no_refund_settlement::int + f_no_drawer_payout::int
        + f_voucher_double_counted::int + f_inv_posted_no_stock::int + f_stock_no_inv_journal::int
        + f_inbound_zero_cost::int + f_day_boundary_split::int + f_unlinked::int
        + f_cross_branch::int + f_exceeds_outstanding::int + f_money_refund_on_unpaid::int
        + f_no_credit_application::int
        + f_refund_amount_mismatch::int)                       AS defect_count,
       f_no_return_journal, f_no_refund_settlement, f_no_drawer_payout,
       f_voucher_double_counted, f_inv_posted_no_stock, f_stock_no_inv_journal,
       f_inbound_zero_cost, f_day_boundary_split, f_unlinked, f_cross_branch,
       f_exceeds_outstanding, f_money_refund_on_unpaid, f_no_credit_application,
       f_refund_amount_mismatch,
       id AS sales_return_id, pos_session_id, authorized_at
FROM   flags
WHERE  (f_no_return_journal OR f_no_refund_settlement OR f_no_drawer_payout
        OR f_voucher_double_counted OR f_inv_posted_no_stock OR f_stock_no_inv_journal
        OR f_inbound_zero_cost OR f_day_boundary_split OR f_unlinked OR f_cross_branch
        OR f_exceeds_outstanding OR f_money_refund_on_unpaid OR f_no_credit_application
        OR f_refund_amount_mismatch)
ORDER  BY defect_count DESC, return_date DESC, return_number;

\echo '== 0b. Defect histogram — which failure mode to work on first =============='
WITH r AS (
    SELECT sr.id, sr.return_number, sr.return_date, COALESCE(sr.total_amount, 0) AS total_amount,
           sr.refund_method, sr.return_action, sr.linked_invoice, sr.trading_date, sr.branch_id
    FROM   sales_returns sr WHERE sr.status = 'APPROVED'
)
SELECT 'no base return journal' AS defect, count(*) AS returns, COALESCE(SUM(total_amount),0) AS amount
FROM r WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number)
UNION ALL
SELECT 'card/bank, no -RFND', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE refund_method IN ('CARD_REFUND','BANK_TRANSFER')
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-RFND')
UNION ALL
SELECT 'cash, no ACTIVE DROP_OUT', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE refund_method = 'CASH_REFUND'
  AND NOT EXISTS (SELECT 1 FROM pos_cash_movements m WHERE m.reference = r.return_number
                    AND m.movement_type = 'DROP_OUT' AND m.status = 'ACTIVE')
UNION ALL
SELECT 'voucher counted twice', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE refund_method IS NULL AND UPPER(COALESCE(return_action,'')) LIKE '%CREDIT%'
  AND EXISTS (SELECT 1 FROM credit_vouchers cv WHERE cv.source_return_number = r.return_number)
UNION ALL
SELECT '-INV posted, no stock in', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-INV')
  AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.reference_no = r.return_number
                    AND sm.quantity > 0)
UNION ALL
SELECT 'stock in, no -INV journal', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.reference_no = r.return_number
                       AND sm.source_type = 'SALES_RETURN' AND sm.quantity > 0)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-INV')
UNION ALL
SELECT 'inbound movement, zero cost', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.reference_no = r.return_number
                       AND sm.source_type = 'SALES_RETURN' AND sm.quantity > 0
                       AND (sm.unit_cost IS NULL OR sm.unit_cost = 0))
UNION ALL
SELECT 'trading_date <> return_date', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE trading_date IS NOT NULL AND trading_date <> return_date
UNION ALL
SELECT 'unlinked return', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE linked_invoice IS NULL OR linked_invoice = ''
UNION ALL
SELECT 'cross-branch return', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE EXISTS (SELECT 1 FROM sales_invoices si WHERE si.invoice_number = r.linked_invoice
                       AND si.branch_id IS NOT NULL AND r.branch_id IS NOT NULL
                       AND si.branch_id <> r.branch_id)
UNION ALL
SELECT 'exceeds invoice outstanding', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE EXISTS (SELECT 1 FROM sales_invoices si WHERE si.invoice_number = r.linked_invoice
                       AND r.total_amount > COALESCE(si.balance, 0))
UNION ALL
SELECT 'money refund on unpaid invoice', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE refund_method IN ('CASH_REFUND','CARD_REFUND','BANK_TRANSFER','CREDIT_VOUCHER')
  AND EXISTS (SELECT 1 FROM sales_invoices si WHERE si.invoice_number = r.linked_invoice
                AND COALESCE(si.balance, 0) > 0)
UNION ALL
SELECT 'no APPLIED credit application', count(*), COALESCE(SUM(total_amount),0)
FROM r WHERE linked_invoice IS NOT NULL AND linked_invoice <> ''
  AND NOT EXISTS (SELECT 1 FROM sales_return_credit_applications ca
                    WHERE ca.return_number = r.return_number AND ca.status = 'APPLIED')
ORDER BY returns DESC;

\echo '== 1. Card/bank refunds with no -RFND settlement journal — detail =========='
-- Repair shape: Dr 1100 / Cr 1013 (card) or 1010 (bank) for the refunded amount, dated
-- per accounting sign-off. settlement_account says which side faces AR.
SELECT r.return_number, r.return_date, r.branch_id, r.customer_code, r.customer_name,
       r.linked_invoice, r.refund_method,
       r.total_amount, r.refund_amount,
       CASE WHEN r.refund_method = 'BANK_TRANSFER' THEN '1010 Bank'
            ELSE '1013 Merchant Clearing' END               AS settlement_account,
       je.entry_number                                      AS return_journal,
       je.date                                              AS return_journal_date,
       r.linked_receipt_number, r.pos_session_id, r.internal_notes
FROM   sales_returns r
LEFT   JOIN journal_entries je ON je.reference = r.return_number
WHERE  r.status = 'APPROVED'
  AND  r.refund_method IN ('CARD_REFUND','BANK_TRANSFER')
  AND  NOT EXISTS (SELECT 1 FROM journal_entries x WHERE x.reference = r.return_number || '-RFND')
ORDER  BY r.return_date, r.return_number;

\echo '== 2. Cash refunds with no ACTIVE drawer payout — detail ==================='
-- The voided_payout_* columns separate the two cases: a DROP_OUT that was voided (an
-- audited decision, with a reason and an actor) versus one never written at all (the defect).
SELECT r.return_number, r.return_date, r.trading_date, r.branch_id,
       r.customer_code, r.linked_invoice, r.total_amount, r.refund_amount,
       r.pos_session_id, r.pos_terminal_id, r.pos_counter_name,
       m.id              AS voided_payout_id,
       m.status          AS voided_payout_status,
       m.amount          AS voided_payout_amount,
       m.void_reason, m.voided_by, m.voided_at,
       m.posted_account_code
FROM   sales_returns r
LEFT   JOIN pos_cash_movements m
       ON  m.reference = r.return_number
       AND m.movement_type = 'DROP_OUT'
       AND m.status <> 'ACTIVE'
WHERE  r.status = 'APPROVED'
  AND  r.refund_method = 'CASH_REFUND'
  AND  NOT EXISTS (SELECT 1 FROM pos_cash_movements a
                   WHERE a.reference = r.return_number
                     AND a.movement_type = 'DROP_OUT'
                     AND a.status = 'ACTIVE')
ORDER  BY r.return_date, r.return_number;

\echo '== 3. Legacy voucher returns counted twice — detail ========================'
-- The credit reduced the customer's outstanding AND a redeemable voucher exists.
-- remaining_amount is what is still live, i.e. what the double count is worth today.
SELECT r.return_number, r.return_date, r.customer_code, r.customer_name,
       r.total_amount, r.refund_method, r.return_action,
       cv.voucher_number, cv.status            AS voucher_status,
       cv.original_amount, cv.used_amount, cv.remaining_amount,
       cv.issue_date, cv.expiry_date,
       r.internal_notes
FROM   sales_returns r
JOIN   credit_vouchers cv ON cv.source_return_number = r.return_number
WHERE  r.status = 'APPROVED'
  AND  r.refund_method IS NULL
  AND  UPPER(COALESCE(r.return_action,'')) LIKE '%CREDIT%'
ORDER  BY cv.remaining_amount DESC, r.return_date;

\echo '== 4. -INV journal posted but no stock came back — detail, per line ========'
-- GL 1200 debited, on-hand never rose. No safe automated repair: this needs a physical
-- stock take per branch. inventory_debit is the GL amount at risk on each return.
SELECT r.return_number, r.return_date, r.branch_id, r.linked_invoice,
       i.item_code, i.item_name, i.item_status, i.return_condition, i.return_qty,
       jl.debit                                AS inventory_debit,
       je.entry_number                         AS inv_journal
FROM   sales_returns r
JOIN   sales_return_items i ON i.sales_return_id = r.id
JOIN   journal_entries je   ON je.reference = r.return_number || '-INV'
LEFT   JOIN journal_lines jl ON jl.journal_entry_id = je.id AND jl.account_code = '1200'
WHERE  r.status = 'APPROVED'
  AND  COALESCE(i.return_qty, 0) > 0
  AND  NOT EXISTS (SELECT 1 FROM stock_movements sm
                   WHERE sm.reference_no = r.return_number
                     AND sm.quantity > 0)
ORDER  BY r.return_date, r.return_number, i.item_code;

\echo '== 4b. Stock came back but no -INV journal — the mirror image =============='
-- On-hand rose with nothing in the GL behind it: inventory understated in the accounts.
SELECT r.return_number, r.return_date, r.branch_id,
       sm.id            AS stock_movement_id,
       sm.product_id, p.code AS product_code, p.name AS product_name,
       sm.warehouse_id, sm.batch_number, sm.serial_number,
       sm.quantity, sm.unit_cost,
       (sm.quantity * COALESCE(sm.unit_cost, 0)) AS unposted_inventory_value,
       sm.movement_date
FROM   sales_returns r
JOIN   stock_movements sm ON sm.reference_no = r.return_number
                        AND sm.source_type = 'SALES_RETURN'
                        AND sm.quantity > 0
LEFT   JOIN products p ON p.id = sm.product_id
WHERE  r.status = 'APPROVED'
  AND  NOT EXISTS (SELECT 1 FROM journal_entries je
                   WHERE je.reference = r.return_number || '-INV')
ORDER  BY r.return_date, r.return_number;

\echo '== 5. Inbound return movements carrying no unit cost — detail =============='
-- Inventory quantity rose, inventory VALUE did not. Backfilling historical unit_cost moves
-- historical WAC, so this is an accounting decision before it is a data repair.
SELECT r.return_number, r.return_date, r.branch_id,
       sm.id            AS stock_movement_id,
       sm.product_id, p.code AS product_code, p.name AS product_name,
       sm.warehouse_id, sm.batch_number, sm.serial_number,
       sm.quantity, sm.unit_cost, sm.movement_date
FROM   stock_movements sm
JOIN   sales_returns r ON r.return_number = sm.reference_no
LEFT   JOIN products p ON p.id = sm.product_id
WHERE  sm.source_type = 'SALES_RETURN'
  AND  sm.quantity > 0
  AND  (sm.unit_cost IS NULL OR sm.unit_cost = 0)
ORDER  BY r.return_date, r.return_number, p.code;

\echo '== 6. Day-boundary splits (R8 / R16) — detail =============================='
-- The drawer payout sits on the trading date, the GL on the return date. These are the
-- closed days whose Z report and GL will not agree without a note.
SELECT r.return_number, r.return_date, r.trading_date,
       (r.return_date - r.trading_date) AS day_offset,
       r.branch_id, r.pos_session_id, r.pos_terminal_id,
       r.refund_method, r.total_amount,
       m.business_date  AS drawer_business_date,
       m.amount         AS drawer_amount,
       je.date          AS gl_date
FROM   sales_returns r
LEFT   JOIN pos_cash_movements m ON m.reference = r.return_number
                               AND m.movement_type = 'DROP_OUT'
                               AND m.status = 'ACTIVE'
LEFT   JOIN journal_entries je ON je.reference = r.return_number
WHERE  r.status = 'APPROVED'
  AND  r.trading_date IS NOT NULL
  AND  r.trading_date <> r.return_date
ORDER  BY r.return_date DESC, r.return_number;

\echo '== 7. Returns exceeding invoice outstanding — the Phase 2 split, restated =='
-- What the current model WOULD have done with each row: would_be_unpaid_portion becomes an
-- allocation against the receivable, would_be_paid_portion is the only amount a refund
-- method may move. Computed against the invoice's CURRENT balance, which is what the
-- schema can answer today — it is an approximation of the balance at return time.
SELECT r.return_number, r.return_date, r.customer_code, r.customer_name,
       r.linked_invoice, r.refund_method, r.return_action,
       r.total_amount                                          AS return_value,
       si.invoice_total, si.amount_paid, si.return_credited,
       COALESCE(si.balance, 0)                                 AS invoice_outstanding_now,
       si.status                                               AS invoice_status,
       LEAST(r.total_amount, COALESCE(si.balance, 0))           AS would_be_unpaid_portion,
       r.total_amount - LEAST(r.total_amount, COALESCE(si.balance, 0))
                                                               AS would_be_paid_portion,
       r.total_amount - COALESCE(si.balance, 0)                AS excess_over_outstanding
FROM   sales_returns r
JOIN   sales_invoices si ON si.invoice_number = r.linked_invoice
WHERE  r.status = 'APPROVED'
  AND  r.total_amount > COALESCE(si.balance, 0)
ORDER  BY (r.total_amount - COALESCE(si.balance, 0)) DESC;

\echo '== 7b. Money refunded against an invoice that was never paid — detail ======'
-- The worst class of row in this file. The invoice still carries a balance, so the customer
-- had not paid for these goods, yet a money-moving method (cash / card / bank / voucher)
-- handed value back: refunded AND still billed. Under Phase 2 the whole unpaid portion would
-- have been an AR allocation and CUSTOMER_CREDIT would have been the only legal settlement.
-- still_billed is the double exposure on each row.
SELECT r.return_number, r.return_date, r.customer_code, r.customer_name,
       r.linked_invoice, r.refund_method,
       r.total_amount                                       AS refunded_value,
       si.invoice_total, si.amount_paid, si.balance          AS invoice_balance_now,
       si.status                                            AS invoice_status,
       LEAST(r.total_amount, COALESCE(si.balance, 0))        AS unpaid_portion_refunded,
       r.total_amount - LEAST(r.total_amount, COALESCE(si.balance, 0))
                                                            AS legitimate_paid_portion,
       LEAST(r.total_amount, COALESCE(si.balance, 0))        AS still_billed,
       EXISTS (SELECT 1 FROM journal_entries je
               WHERE je.reference = r.return_number || '-RFND')
                                                            AS refund_settlement_posted,
       r.internal_notes
FROM   sales_returns r
JOIN   sales_invoices si ON si.invoice_number = r.linked_invoice
WHERE  r.status = 'APPROVED'
  AND  r.refund_method IN ('CASH_REFUND','CARD_REFUND','BANK_TRANSFER','CREDIT_VOUCHER')
  AND  COALESCE(si.balance, 0) > 0
ORDER  BY LEAST(r.total_amount, COALESCE(si.balance, 0)) DESC;

\echo '== 8. Customers whose effective outstanding is negative (R1b) — detail ====='
-- Held customer credit the pre-split model pushed below zero. net_effective is what the
-- customer statement shows today; ledger_credit is how much of it came from returns.
WITH invoice_balances AS (
    SELECT customer_code, COALESCE(SUM(balance), 0) AS open_balance
    FROM   sales_invoices
    WHERE  customer_code IS NOT NULL
    GROUP  BY customer_code
), return_credits AS (
    SELECT customer_code,
           COALESCE(SUM(total_amount), 0) AS ledger_credit,
           count(*)                       AS credit_return_count,
           MIN(return_date)               AS first_credit_return,
           MAX(return_date)               AS last_credit_return
    FROM   sales_returns
    WHERE  customer_code IS NOT NULL
      AND  status = 'APPROVED'
      AND  (refund_method = 'CUSTOMER_CREDIT'
            OR (refund_method IS NULL
                AND (return_action IS NULL OR UPPER(return_action) LIKE '%CREDIT%')))
    GROUP  BY customer_code
)
SELECT rc.customer_code,
       c.name                                              AS customer_name,
       COALESCE(ib.open_balance, 0)                        AS open_invoice_balance,
       rc.ledger_credit,
       COALESCE(ib.open_balance, 0) - rc.ledger_credit     AS net_effective,
       rc.credit_return_count, rc.first_credit_return, rc.last_credit_return
FROM   return_credits rc
LEFT   JOIN invoice_balances ib ON ib.customer_code = rc.customer_code
LEFT   JOIN customers c ON c.code = rc.customer_code
WHERE  COALESCE(ib.open_balance, 0) - rc.ledger_credit < 0
ORDER  BY (COALESCE(ib.open_balance, 0) - rc.ledger_credit);

\echo '== 9. Cross-branch returns (§19) — detail =================================='
-- Returned at a branch other than the one that raised the invoice. Each row is a P&L
-- restatement between two branches, not a data repair.
SELECT r.return_number, r.return_date, r.total_amount, r.refund_method,
       r.branch_id            AS return_branch_id,
       rb.name                AS return_branch,
       si.invoice_number, si.invoice_date,
       si.branch_id           AS invoice_branch_id,
       ib.name                AS invoice_branch,
       r.customer_code, r.customer_name
FROM   sales_returns r
JOIN   sales_invoices si ON si.invoice_number = r.linked_invoice
LEFT   JOIN branches rb ON rb.id = r.branch_id
LEFT   JOIN branches ib ON ib.id = si.branch_id
WHERE  r.status = 'APPROVED'
  AND  r.branch_id IS NOT NULL
  AND  si.branch_id IS NOT NULL
  AND  r.branch_id <> si.branch_id
ORDER  BY r.return_date DESC, r.return_number;

\echo '== 10. Unlinked returns (§20) — detail ====================================='
-- No invoice behind them, so no outstanding to split and no eligibility to check. If staff
-- used this path for goodwill credits, closing it needs the manual credit note shipped first.
SELECT r.return_number, r.return_date, r.status, r.branch_id, r.entry_point,
       r.customer_code, r.customer_name, r.customer_mobile,
       r.total_amount, r.refund_method, r.return_action, r.reason,
       r.authorized_by_username, r.authorized_at, r.authorization_reason,
       r.created_by_user_id,
       (SELECT count(*) FROM sales_return_items i WHERE i.sales_return_id = r.id) AS line_count,
       r.internal_notes
FROM   sales_returns r
WHERE  r.linked_invoice IS NULL OR r.linked_invoice = ''
ORDER  BY r.return_date DESC, r.return_number;

\echo '== 11. Approved returns with no GL at all =================================='
-- The base {return_number} entry is missing: the revenue/VAT reversal never happened, so
-- the sale is still fully recognised. Highest-severity flag in query 0.
SELECT r.return_number, r.return_date, r.branch_id, r.customer_code, r.linked_invoice,
       r.sub_total, r.tax_amount, r.total_amount, r.refund_method, r.entry_point,
       r.authorized_at,
       EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-INV')
            AS has_inv_journal,
       EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-RFND')
            AS has_rfnd_journal,
       EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.reference_no = r.return_number)
            AS has_stock_movement
FROM   sales_returns r
WHERE  r.status = 'APPROVED'
  AND  NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number)
ORDER  BY r.total_amount DESC;

\echo '== 12. GL 1100 credit vs stored total_amount, per return ==================='
-- Reconciles each return against its own journal. A non-zero variance means the header was
-- edited after posting, or the entry was posted from different numbers.
SELECT r.return_number, r.return_date, r.total_amount,
       je.entry_number, je.date AS journal_date, je.status AS journal_status,
       COALESCE(SUM(jl.credit), 0)                        AS ar_credit,
       COALESCE(SUM(jl.credit), 0) - r.total_amount        AS variance
FROM   sales_returns r
JOIN   journal_entries je ON je.reference = r.return_number
LEFT   JOIN journal_lines jl ON jl.journal_entry_id = je.id AND jl.account_code = '1100'
WHERE  r.status = 'APPROVED'
GROUP  BY r.return_number, r.return_date, r.total_amount,
          je.entry_number, je.date, je.status
HAVING COALESCE(SUM(jl.credit), 0) <> r.total_amount
ORDER  BY ABS(COALESCE(SUM(jl.credit), 0) - r.total_amount) DESC;

\echo '== 13. Returns with no APPLIED credit application (pre-Phase-2 rows) ======='
-- The receivable leg exists only in the GL, with no allocation row, so
-- sales_invoices.return_credited cannot have been derived for it. These are the rows the
-- canonical recomputation will reclassify the moment anything touches the invoice.
SELECT r.return_number, r.return_date, r.customer_code, r.linked_invoice,
       r.total_amount, r.refund_method,
       si.invoice_total, si.amount_paid, si.return_credited, si.balance, si.status,
       (SELECT COALESCE(SUM(ca.applied_amount), 0)
        FROM   sales_return_credit_applications ca
        WHERE  ca.invoice_number = si.invoice_number AND ca.status = 'APPLIED')
            AS invoice_applied_credit_total
FROM   sales_returns r
JOIN   sales_invoices si ON si.invoice_number = r.linked_invoice
WHERE  r.status = 'APPROVED'
  AND  NOT EXISTS (SELECT 1 FROM sales_return_credit_applications ca
                   WHERE ca.return_number = r.return_number AND ca.status = 'APPLIED')
ORDER  BY r.return_date DESC, r.return_number;

\echo '== 14. Invoices whose return_credited disagrees with the allocation ledger ='
-- Restricted to invoices an approved return has actually touched, so it does not overlap
-- the separate stale-invoice-status population in the Phase 2 file.
SELECT si.invoice_number, si.customer_code, si.invoice_date,
       si.invoice_total, si.amount_paid, si.return_credited, si.balance, si.status,
       COALESCE(ca.applied, 0)                                   AS applied_credit_ledger,
       COALESCE(si.return_credited, 0) - COALESCE(ca.applied, 0)  AS variance,
       COALESCE(sr.return_total, 0)                              AS approved_return_total,
       sr.return_numbers
FROM   sales_invoices si
LEFT   JOIN (SELECT invoice_number, SUM(applied_amount) AS applied
             FROM   sales_return_credit_applications WHERE status = 'APPLIED'
             GROUP  BY invoice_number) ca ON ca.invoice_number = si.invoice_number
JOIN   (SELECT linked_invoice,
               SUM(total_amount)                                      AS return_total,
               STRING_AGG(return_number, ', ' ORDER BY return_number) AS return_numbers
        FROM   sales_returns
        WHERE  status = 'APPROVED' AND linked_invoice IS NOT NULL AND linked_invoice <> ''
        GROUP  BY linked_invoice) sr ON sr.linked_invoice = si.invoice_number
WHERE  COALESCE(si.return_credited, 0) <> COALESCE(ca.applied, 0)
ORDER  BY ABS(COALESCE(si.return_credited, 0) - COALESCE(ca.applied, 0)) DESC;

\echo '== 15. Header vs line totals, and header money fields ======================'
-- Catches returns whose stored header no longer matches its own lines, plus the
-- null/mismatched refund_amount rows the X/Z buckets have to classify.
SELECT r.return_number, r.return_date, r.refund_method, r.return_action,
       r.sub_total, r.tax_amount, r.total_amount, r.refund_amount, r.tax_inclusive,
       COALESCE(i.line_total, 0)                       AS sum_of_line_totals,
       r.total_amount - COALESCE(i.line_total, 0)      AS header_line_variance,
       CASE WHEN r.refund_amount IS NULL THEN 'null refund_amount'
            WHEN r.refund_amount <> r.total_amount THEN 'refund_amount <> total_amount'
            ELSE 'ok' END                              AS refund_amount_state,
       i.line_count
FROM   sales_returns r
LEFT   JOIN (SELECT sales_return_id, SUM(total) AS line_total, count(*) AS line_count
             FROM sales_return_items GROUP BY sales_return_id) i ON i.sales_return_id = r.id
WHERE  r.status = 'APPROVED'
  AND  (r.refund_amount IS NULL
        OR r.refund_amount <> r.total_amount
        OR ABS(r.total_amount - COALESCE(i.line_total, 0)) > 0.01)
ORDER  BY ABS(r.total_amount - COALESCE(i.line_total, 0)) DESC, r.return_date DESC;

\echo '== 16. Over-returned invoice lines (cumulative qty across all returns) ====='
-- Quantity returned exceeds quantity sold on the same invoice line — an eligibility defect
-- rather than a posting one, and the one that most often explains a stock variance.
SELECT i.invoice_number, i.item_code,
       MAX(i.sold_qty)                            AS sold_qty,
       SUM(i.return_qty)                          AS total_returned_qty,
       SUM(i.return_qty) - MAX(i.sold_qty)        AS over_returned_by,
       count(DISTINCT i.return_number)            AS return_count,
       STRING_AGG(DISTINCT i.return_number, ', ') AS return_numbers
FROM  (SELECT r.linked_invoice AS invoice_number, r.return_number,
              it.item_code, COALESCE(it.sold_qty, 0) AS sold_qty,
              COALESCE(it.return_qty, 0) AS return_qty
       FROM   sales_returns r
       JOIN   sales_return_items it ON it.sales_return_id = r.id
       WHERE  r.status = 'APPROVED'
         AND  r.linked_invoice IS NOT NULL AND r.linked_invoice <> '') i
GROUP  BY i.invoice_number, i.item_code
HAVING SUM(i.return_qty) > MAX(i.sold_qty)
ORDER  BY (SUM(i.return_qty) - MAX(i.sold_qty)) DESC;
