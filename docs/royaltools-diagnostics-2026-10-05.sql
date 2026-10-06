-- ============================================================================
-- royaltools — read-only diagnostics, 2026-10-05
--
-- EVERY STATEMENT IS A SELECT. Nothing is inserted, updated or deleted. Safe to
-- run on the live database at any time, including inside a maintenance window.
--
--   sudo -u postgres psql
--   \c billbull_royaltools
--   \i /tmp/royaltools-diagnostics-2026-10-05.sql
--
-- Output is wide. Either run with the pager off and redirect to a file:
--   \pset pager off
--   \o /tmp/royaltools-diag.txt
--   \i /tmp/royaltools-diagnostics-2026-10-05.sql
--   \o
-- or paste each section's result back as you go.
--
-- WHY THESE QUERIES
-- -----------------
-- The sales-return work surfaced something larger than the returns: from
-- 2026-09-23 onward, customer 89's POS delivery invoices stopped being receipted
-- entirely (six invoices, 1,520.00, all CONFIRMED with amount_paid NULL). Section 1
-- establishes whether that is one customer or the whole delivery channel, which is
-- the question that decides how big the problem is. Sections 2-4 close the two
-- open items on SR-2026-0009 / SR-2026-0010. Sections 5-8 are a general integrity
-- sweep over the same tables, to catch anything adjacent before repairs are posted.
--
-- The per-return defect worklist is NOT repeated here — that is
-- db/analysis/sales_return_historical_worklist.sql, already run.
-- ============================================================================

\pset pager off

-- ============================================================================
-- 1. THE DELIVERY-PAYMENT GAP — one customer, or the whole channel?
-- ============================================================================

\echo '== 1a. Unreceipted invoices by payment mode and sales type ================='
-- An invoice with no receipt row in ANY status has never had a collection recorded
-- against it. For payment_mode = Delivery that is the expected state only until the
-- driver returns; a month-old DELIVERED invoice with no receipt is a gap.
SELECT COALESCE(si.payment_mode, '(null)')       AS payment_mode,
       COALESCE(si.sales_type, '(null)')         AS sales_type,
       si.status,
       COUNT(*)                                   AS invoices,
       SUM(si.invoice_total)                      AS total_value,
       COUNT(*) FILTER (WHERE rv.cnt IS NULL)     AS without_any_receipt,
       SUM(si.invoice_total) FILTER (WHERE rv.cnt IS NULL) AS value_without_receipt,
       MIN(si.invoice_date)                       AS earliest,
       MAX(si.invoice_date)                       AS latest
FROM   sales_invoices si
LEFT   JOIN (SELECT sales_invoice_id, COUNT(*) AS cnt
             FROM   sales_receipt_vouchers
             GROUP  BY sales_invoice_id) rv ON rv.sales_invoice_id = si.id
WHERE  si.status NOT IN ('CANCELLED','DRAFT')
GROUP  BY 1, 2, 3
ORDER  BY value_without_receipt DESC NULLS LAST;

\echo '== 1b. When did it start? Unreceipted DELIVERED invoices by week ==========='
SELECT DATE_TRUNC('week', si.invoice_date)::date AS week_starting,
       COUNT(*)                                  AS delivered_invoices,
       COUNT(*) FILTER (WHERE rv.cnt IS NULL)    AS without_receipt,
       SUM(si.invoice_total) FILTER (WHERE rv.cnt IS NULL) AS value_without_receipt
FROM   sales_invoices si
LEFT   JOIN (SELECT sales_invoice_id, COUNT(*) AS cnt
             FROM   sales_receipt_vouchers
             GROUP  BY sales_invoice_id) rv ON rv.sales_invoice_id = si.id
WHERE  si.status NOT IN ('CANCELLED','DRAFT')
  AND  si.payment_mode = 'Delivery'
GROUP  BY 1
ORDER  BY 1;

\echo '== 1c. Which customers carry it, and how much ============================='
SELECT si.customer_code,
       MAX(si.customer_name)                     AS customer_name,
       COUNT(*)                                  AS unreceipted_invoices,
       SUM(si.invoice_total)                     AS unreceipted_value,
       MIN(si.invoice_date)                      AS earliest,
       MAX(si.invoice_date)                      AS latest,
       MAX(si.payment_mode)                      AS payment_mode
FROM   sales_invoices si
LEFT   JOIN (SELECT sales_invoice_id, COUNT(*) AS cnt
             FROM   sales_receipt_vouchers
             GROUP  BY sales_invoice_id) rv ON rv.sales_invoice_id = si.id
WHERE  si.status NOT IN ('CANCELLED','DRAFT')
  AND  rv.cnt IS NULL
  AND  COALESCE(si.amount_paid, 0) = 0
GROUP  BY si.customer_code
HAVING SUM(si.invoice_total) > 0
ORDER  BY unreceipted_value DESC
LIMIT  40;

\echo '== 1d. The same cut by driver — is it one route or one person? ============='
SELECT COALESCE(si.pos_driver_name, '(none recorded)') AS driver,
       si.pos_driver_employee_code,
       COUNT(*)                                        AS delivered_invoices,
       COUNT(*) FILTER (WHERE rv.cnt IS NULL)          AS without_receipt,
       SUM(si.invoice_total) FILTER (WHERE rv.cnt IS NULL) AS value_without_receipt,
       MIN(si.invoice_date) AS earliest, MAX(si.invoice_date) AS latest
FROM   sales_invoices si
LEFT   JOIN (SELECT sales_invoice_id, COUNT(*) AS cnt
             FROM   sales_receipt_vouchers
             GROUP  BY sales_invoice_id) rv ON rv.sales_invoice_id = si.id
WHERE  si.status NOT IN ('CANCELLED','DRAFT')
  AND  si.payment_mode = 'Delivery'
GROUP  BY 1, 2
ORDER  BY value_without_receipt DESC NULLS LAST;

\echo '== 1e. Customer 89 in full — every invoice, receipted or not =============='
SELECT si.invoice_number, si.invoice_date, si.status, si.payment_mode,
       si.invoice_total, si.amount_paid, si.balance, si.delivery_status,
       si.pos_session_id, si.pos_driver_name,
       COALESCE(rv.cnt, 0) AS receipt_rows, rv.receipt_total
FROM   sales_invoices si
LEFT   JOIN (SELECT sales_invoice_id, COUNT(*) AS cnt, SUM(amount) AS receipt_total
             FROM   sales_receipt_vouchers
             GROUP  BY sales_invoice_id) rv ON rv.sales_invoice_id = si.id
WHERE  si.customer_code = '89'
ORDER  BY si.invoice_date DESC, si.invoice_number DESC;

\echo '== 1f. Is customer 89 duplicated under another code? ======================'
SELECT code, name, status, mobile
FROM   customers
WHERE  code = '89'
   OR  UPPER(name) LIKE '%LAGHOTAIH%'
   OR  UPPER(name) LIKE '%PASTIR%'
ORDER  BY code;


-- ============================================================================
-- 2. SR-2026-0010 — is INV-2026-1581 a duplicate? ("da5al mrten")
-- ============================================================================

\echo '== 2a. Customer 89 invoice lines around the date, to spot the twin ========'
SELECT si.invoice_number, si.invoice_date, si.status, si.invoice_total, si.amount_paid,
       ii.item_code, ii.item_name, ii.quantity, ii.price, ii.net_amount, ii.voided
FROM   sales_invoices si
JOIN   sales_invoice_items ii ON ii.sales_invoice_id = si.id
WHERE  si.customer_code = '89'
  AND  si.invoice_date BETWEEN DATE '2026-09-10' AND DATE '2026-10-02'
ORDER  BY si.invoice_date, si.invoice_number, ii.item_code;

\echo '== 2b. Every invoice anywhere containing that exact item, same period ====='
-- If a second invoice carries VWCC191116 qty 2 for the same customer, 1581 is the
-- duplicate and the return cancelled it. If not, the duplicate theory is wrong.
SELECT si.invoice_number, si.invoice_date, si.customer_code, si.status,
       si.invoice_total, si.amount_paid, ii.quantity, ii.price
FROM   sales_invoice_items ii
JOIN   sales_invoices si ON si.id = ii.sales_invoice_id
WHERE  ii.item_code = 'VWCC191116'
  AND  si.invoice_date BETWEEN DATE '2026-09-01' AND DATE '2026-10-05'
ORDER  BY si.invoice_date;


-- ============================================================================
-- 3. SR-2026-0009 — did the fondant physically come back?
-- ============================================================================

\echo '== 3a. Movement history of the three returned items ======================='
-- The return recorded no inbound movement. If these items were re-sold afterwards,
-- they were physically on the shelf, which means the stock ledger is understated
-- and the -INV journal is correct — the opposite of a GL problem.
SELECT sm.movement_date, sm.reference_no, sm.source_type, p.code AS item_code,
       p.name AS item_name, sm.quantity, sm.unit_cost, sm.warehouse_id, sm.batch_number
FROM   stock_movements sm
JOIN   products p ON p.id = sm.product_id
WHERE  p.code IN ('80940751','80940758','8681438090706','VWCC191116')
  AND  sm.movement_date BETWEEN DATE '2026-09-20' AND DATE '2026-10-05'
ORDER  BY p.code, sm.movement_date, sm.id;

\echo '== 3b. Current derived on-hand for those items ============================'
SELECT p.code AS item_code, p.name AS item_name, sm.warehouse_id,
       SUM(sm.quantity) AS on_hand_derived
FROM   stock_movements sm
JOIN   products p ON p.id = sm.product_id
WHERE  p.code IN ('80940751','80940758','8681438090706','VWCC191116')
GROUP  BY p.code, p.name, sm.warehouse_id
ORDER  BY p.code, sm.warehouse_id;

\echo '== 3c. Was a replacement sale raised? ("wanted other items") =============='
SELECT si.invoice_number, si.invoice_date, si.status, si.invoice_total, si.amount_paid,
       si.payment_mode, si.pos_session_id, si.pos_counter_name
FROM   sales_invoices si
WHERE  si.customer_code = '89'
  AND  si.invoice_date BETWEEN DATE '2026-09-29' AND DATE '2026-10-03'
ORDER  BY si.invoice_date, si.invoice_number;


-- ============================================================================
-- 4. The POS sessions behind the two returns
-- ============================================================================

\echo '== 4a. Sessions 164 and 178 ==============================================='
SELECT * FROM pos_sessions WHERE id IN (164, 178);

\echo '== 4b. Cash movements in those sessions ==================================='
SELECT m.id, m.pos_session_id, m.movement_type, m.amount, m.reference, m.description,
       m.status, m.business_date, m.performed_by, m.performed_at, m.posted_account_code
FROM   pos_cash_movements m
WHERE  m.pos_session_id IN (164, 178)
ORDER  BY m.pos_session_id, m.id;


-- ============================================================================
-- 5. AR: does the subledger agree with GL 1100?
-- ============================================================================

\echo '== 5a. GL 1100 vs the sum of open invoice balances ========================'
-- These will not match while the 10 returns carry no allocation rows; the point is
-- to record the size of the difference before anything is posted.
SELECT (SELECT COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0)
        FROM   ledger_entries WHERE account_code = '1100')          AS gl_1100_net_dr,
       (SELECT COALESCE(SUM(balance), 0) FROM sales_invoices
        WHERE  status NOT IN ('CANCELLED','DRAFT','PAID'))          AS open_invoice_balances,
       (SELECT COALESCE(SUM(total_amount), 0) FROM sales_returns
        WHERE  status = 'APPROVED')                                 AS approved_returns_total;

\echo '== 5b. Invoices with a balance but no GL entry ============================'
SELECT si.invoice_number, si.invoice_date, si.customer_code, si.status,
       si.invoice_total, si.amount_paid, si.balance
FROM   sales_invoices si
WHERE  si.status NOT IN ('CANCELLED','DRAFT')
  AND  NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = si.invoice_number)
ORDER  BY si.invoice_date DESC
LIMIT  50;

\echo '== 5c. Stored amount_paid vs the receipt ledger ==========================='
SELECT si.invoice_number, si.invoice_date, si.customer_code, si.status,
       si.invoice_total, si.amount_paid, si.balance,
       COALESCE(rv.completed_total, 0)                        AS completed_receipts,
       COALESCE(si.amount_paid, 0) - COALESCE(rv.completed_total, 0) AS variance
FROM   sales_invoices si
LEFT   JOIN (SELECT sales_invoice_id, SUM(amount) AS completed_total
             FROM   sales_receipt_vouchers
             WHERE  LOWER(TRIM(status)) = 'completed'
             GROUP  BY sales_invoice_id) rv ON rv.sales_invoice_id = si.id
WHERE  si.status NOT IN ('CANCELLED','DRAFT')
  AND  ABS(COALESCE(si.amount_paid, 0) - COALESCE(rv.completed_total, 0)) > 0.01
ORDER  BY ABS(COALESCE(si.amount_paid, 0) - COALESCE(rv.completed_total, 0)) DESC
LIMIT  50;


-- ============================================================================
-- 6. GL internal consistency
-- ============================================================================

\echo '== 6a. Unbalanced journal entries (must be empty) ========================='
SELECT je.entry_number, je.reference, je.date, je.status,
       SUM(jl.debit) AS total_debit, SUM(jl.credit) AS total_credit,
       SUM(jl.debit) - SUM(jl.credit) AS variance
FROM   journal_entries je
JOIN   journal_lines jl ON jl.journal_entry_id = je.id
GROUP  BY je.entry_number, je.reference, je.date, je.status
HAVING SUM(jl.debit) <> SUM(jl.credit)
ORDER  BY ABS(SUM(jl.debit) - SUM(jl.credit)) DESC;

\echo '== 6b. journal_lines vs ledger_entries per account ========================'
-- The two must agree account by account. A difference means a posting wrote one
-- and not the other, which is exactly what a hand-written SQL insert causes.
SELECT COALESCE(jl.account_code, le.account_code)   AS account_code,
       COALESCE(jl.dr, 0) AS journal_debit, COALESCE(le.dr, 0) AS ledger_debit,
       COALESCE(jl.cr, 0) AS journal_credit, COALESCE(le.cr, 0) AS ledger_credit,
       COALESCE(jl.dr, 0) - COALESCE(le.dr, 0)      AS debit_variance,
       COALESCE(jl.cr, 0) - COALESCE(le.cr, 0)      AS credit_variance
FROM  (SELECT l.account_code, SUM(l.debit) AS dr, SUM(l.credit) AS cr
       FROM   journal_lines l
       JOIN   journal_entries e ON e.id = l.journal_entry_id
       WHERE  e.status = 'Posted'
       GROUP  BY l.account_code) jl
FULL  OUTER JOIN
      (SELECT account_code, SUM(debit_amount) AS dr, SUM(credit_amount) AS cr
       FROM   ledger_entries GROUP BY account_code) le
      ON le.account_code = jl.account_code
WHERE  ABS(COALESCE(jl.dr, 0) - COALESCE(le.dr, 0)) > 0.01
   OR  ABS(COALESCE(jl.cr, 0) - COALESCE(le.cr, 0)) > 0.01
ORDER  BY ABS(COALESCE(jl.dr, 0) - COALESCE(le.dr, 0))
        + ABS(COALESCE(jl.cr, 0) - COALESCE(le.cr, 0)) DESC;

\echo '== 6c. gl_account_balances vs journal_lines ==============================='
SELECT g.account_code,
       SUM(g.debit_total)  AS balance_debit, SUM(g.credit_total) AS balance_credit,
       COALESCE(jl.dr, 0)  AS journal_debit, COALESCE(jl.cr, 0)  AS journal_credit,
       SUM(g.debit_total) - COALESCE(jl.dr, 0)  AS debit_variance,
       SUM(g.credit_total) - COALESCE(jl.cr, 0) AS credit_variance
FROM   gl_account_balances g
LEFT   JOIN (SELECT l.account_code, SUM(l.debit) AS dr, SUM(l.credit) AS cr
             FROM   journal_lines l
             JOIN   journal_entries e ON e.id = l.journal_entry_id
             WHERE  e.status = 'Posted'
             GROUP  BY l.account_code) jl ON jl.account_code = g.account_code
GROUP  BY g.account_code, jl.dr, jl.cr
HAVING ABS(SUM(g.debit_total) - COALESCE(jl.dr, 0)) > 0.01
    OR ABS(SUM(g.credit_total) - COALESCE(jl.cr, 0)) > 0.01
ORDER  BY 1;

\echo '== 6d. accounts.balance_amount vs the ledger ============================='
SELECT a.code, a.name, a.balance_amount, a.balance_type,
       COALESCE(le.dr, 0) - COALESCE(le.cr, 0) AS ledger_net_dr,
       CASE WHEN a.balance_type = 'Dr' THEN COALESCE(a.balance_amount, 0)
            ELSE -COALESCE(a.balance_amount, 0) END
       - (COALESCE(le.dr, 0) - COALESCE(le.cr, 0)) AS variance
FROM   accounts a
LEFT   JOIN (SELECT account_code, SUM(debit_amount) AS dr, SUM(credit_amount) AS cr
             FROM   ledger_entries GROUP BY account_code) le ON le.account_code = a.code
WHERE  ABS(CASE WHEN a.balance_type = 'Dr' THEN COALESCE(a.balance_amount, 0)
                ELSE -COALESCE(a.balance_amount, 0) END
           - (COALESCE(le.dr, 0) - COALESCE(le.cr, 0))) > 0.01
ORDER  BY 1;


-- ============================================================================
-- 7. Inventory: GL 1200 vs the stock ledger
-- ============================================================================

\echo '== 7a. Movements with no cost — value missing from inventory =============='
SELECT sm.source_type, COUNT(*) AS movements, SUM(sm.quantity) AS total_quantity,
       MIN(sm.movement_date) AS earliest, MAX(sm.movement_date) AS latest
FROM   stock_movements sm
WHERE  sm.quantity > 0
  AND  (sm.unit_cost IS NULL OR sm.unit_cost = 0)
GROUP  BY sm.source_type
ORDER  BY movements DESC;

\echo '== 7b. Negative derived on-hand by item and warehouse ===================='
SELECT p.code AS item_code, p.name AS item_name, sm.warehouse_id,
       SUM(sm.quantity) AS on_hand_derived
FROM   stock_movements sm
JOIN   products p ON p.id = sm.product_id
GROUP  BY p.code, p.name, sm.warehouse_id
HAVING SUM(sm.quantity) < 0
ORDER  BY SUM(sm.quantity)
LIMIT  50;

\echo '== 7c. Stock movements whose reference has no GL entry ===================='
SELECT sm.source_type, COUNT(*) AS movements,
       COUNT(DISTINCT sm.reference_no) AS distinct_references,
       MIN(sm.movement_date) AS earliest, MAX(sm.movement_date) AS latest
FROM   stock_movements sm
WHERE  sm.reference_no IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM journal_entries je
                   WHERE je.reference = sm.reference_no
                      OR je.reference = sm.reference_no || '-INV')
GROUP  BY sm.source_type
ORDER  BY movements DESC;


-- ============================================================================
-- 8. Period and sequence state — what a repair would run into
-- ============================================================================

\echo '== 8a. Fiscal years and periods =========================================='
SELECT ap.id, ap.period_name, ap.start_date, ap.end_date, ap.status,
       ap.closed_at, ap.closed_by, ap.fiscal_year_id
FROM   accounting_periods ap
ORDER  BY ap.start_date;

\echo '== 8b. Identity sequences behind MAX(id) — a direct INSERT would collide =='
SELECT c.relname AS table_name,
       pg_get_serial_sequence('public.' || quote_ident(c.relname), 'id') AS seq,
       (SELECT last_value FROM pg_sequences s
        WHERE s.schemaname = 'public'
          AND s.sequencename = split_part(
                pg_get_serial_sequence('public.' || quote_ident(c.relname), 'id'), '.', 2)) AS seq_last_value
FROM   pg_class c
JOIN   pg_namespace ns ON ns.oid = c.relnamespace
JOIN   pg_attribute a  ON a.attrelid = c.oid AND a.attname = 'id' AND a.attnum > 0
WHERE  ns.nspname = 'public' AND c.relkind = 'r' AND NOT a.attisdropped
  AND  c.relname IN ('journal_entries','journal_lines','ledger_entries',
                     'gl_account_balances','voucher_sequences','sales_returns',
                     'sales_invoices','stock_movements')
  AND  pg_get_serial_sequence('public.' || quote_ident(c.relname), 'id') IS NOT NULL
ORDER  BY 1;

\echo '== 8c. Control-account flags — decides if the JV route is open ============'
SELECT code, name, control_account, tax_role, status
FROM   accounts
WHERE  code IN ('1010','1013','1100','1200','2100','4001','5001')
ORDER  BY code;

\echo '== 8d. Voucher sequence state ============================================'
SELECT transaction_type, branch_code, fiscal_year, last_number
FROM   voucher_sequences
ORDER  BY transaction_type, branch_code, fiscal_year;
