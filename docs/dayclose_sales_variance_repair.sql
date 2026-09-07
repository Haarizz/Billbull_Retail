-- ---------------------------------------------------------------------------------
-- Day Close "Sales Reconciliation Failed" - diagnose and repair.
-- Target: billbull_demo, business date 2026-08-29, Main Branch (terminal T002-B9FA).
--
-- THE IDENTITY closeDay() ENFORCES (PosSessionService.closeDay, ~line 2484):
--
--     variance = SUM(invoice.invoice_total)                        -- expected
--              - ( cash + card + credit + other - out_of_period )  -- computed
--
--   cash/card/other = SUM(sales_payments.amount) over RECEIVED, non-CANCELLED/FAILED
--                     rows whose pos_session_id is one of the day's sessions
--   credit          = SUM(sales_invoices.balance) where balance > 0
--   out_of_period   = collections taken today against an invoice from an earlier day,
--                     plus customer advances (receipt vouchers)
--
-- Close is blocked when ABS(variance) > 0.05.
--
-- The reported screen (expected 3194.00, computed 175.50, credit 175.50,
-- cash = card = online = other = 0) says: 7 invoices totalling 3194.00 exist, only
-- 175.50 sits in invoice balances, and NOT ONE payment row is attributed to the day's
-- sessions. So the money is either (A) recorded with a NULL/wrong pos_session_id, or
-- (B) never recorded while the invoices were nonetheless flagged settled. A and B
-- need different fixes - run section 1 before changing anything.
--
-- Day Close resolves its sessions by pos_sessions.trading_date, NOT session_date -
-- the two differ for a session that crosses midnight, which this one did (trading
-- span started 01:45 AM). Every query below keys on trading_date to match.
--
-- DIAGNOSIS RESULT (run 2026-09-03 against billbull_demo):
--   Cause (A) confirmed. Session 19 (T002-B9FA / Counter 2, trading_date 2026-08-29)
--   owns 8 invoices totalling 3194.00. All 11 RECEIVED payments settling them carry
--   pos_session_id = NULL, and they sum to exactly 3018.50 - the reported variance.
--   No money is missing; only the collection-session link was never written.
--
--   >>> BUT ONLY 10 OF THOSE 11 PAYMENTS BELONG TO THIS SESSION. <<<
--   Session 19's own running counters, written as each sale was rung up, say
--   invoice_count = 7 and total_sales = 944.00 (698.00 cash + 70.50 card + 175.50
--   credit). Query 1b returned EIGHT invoices totalling 3194.00. The extra one is
--   INV-2026-0110: dated 2026-07-09, paid 2026-07-09 with PAY-2026-0105 for 2250.00,
--   yet carrying pos_session_id = 19. And 3194.00 - 944.00 = 2250.00 exactly, while
--   the seven August invoices sum to 944.00 exactly, matching the counter.
--
--   So the bad link is on the INVOICE, not only on the payments: a July sale was
--   stamped onto an August session it was never rung up in. That is what inflates
--   "Expected Total Sales" to 3194.00. Section 2 fixes that (recommended). Section 2B
--   is the alternative that instead pulls July's 2250.00 into this drawer - it also
--   clears the dialog, and it is the wrong answer; it is written out only so the
--   difference between the two is explicit.
--
--   >>> NEITHER RELINK IS SUFFICIENT ON ITS OWN. <<<
--   Clearing the SALES check moves the day straight into the CASH check that follows
--   it (closeDay, ~line 2535). That check compares a live re-derivation
--       openingCash + cashSales + dropIn - dropOut
--   against the FROZEN pos_sessions.expected_cash of each closed session, and blocks
--   on a drift > 0.05. Session 19 was frozen at expected_cash = 0.00 because the cash
--   was invisible at close time; once the relink makes its cash tender visible (667.50
--   under section 2, or 2917.50 under 2B), the drift becomes that amount and Day Close
--   fails again with "Cash reconciliation failed". Each repair therefore has TWO
--   mandatory steps - run both inside one transaction.
--
-- Backup first:  pg_dump -Fc billbull_demo > billbull_demo_pre_variance_fix.dump
-- ---------------------------------------------------------------------------------

\set biz '2026-08-29'

-- Add "AND branch_id = <id>" to the pos_sessions subqueries if the demo DB carries
-- more than one branch with sessions on this date.

-- ===================================================================================
-- 1. DIAGNOSIS  (read-only - run all four)
-- ===================================================================================

-- 1a. The sessions Day Close resolved for that date.
SELECT id, terminal_id, counter_name, status, branch_id, session_date, trading_date,
       opened_at, closed_at, invoice_count, opening_cash, expected_cash, closing_cash,
       total_sales, total_cash_sales, total_card_sales, total_credit_sales
  FROM pos_sessions
 WHERE trading_date = DATE :'biz'
 ORDER BY id;

-- 1b. The invoices behind "Expected Total Sales" = 3194.00, each with the tender
--     actually recorded against it. "unexplained" > 0 marks an invoice showing as
--     settled with no collection behind it.
SELECT i.id, i.invoice_number, i.invoice_date, i.status, i.pos_session_id,
       i.invoice_total, i.balance,
       COALESCE(p.paid, 0)                               AS payments_recorded,
       COALESCE(p.paid_on_day_session, 0)                AS counted_by_day_close,
       i.invoice_total - i.balance - COALESCE(p.paid, 0) AS unexplained
  FROM sales_invoices i
  LEFT JOIN LATERAL (
        SELECT SUM(sp.amount) AS paid,
               SUM(sp.amount) FILTER (
                   WHERE sp.pos_session_id IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz')
               ) AS paid_on_day_session
          FROM sales_payments sp
         WHERE sp.linked_invoice = i.invoice_number
           AND sp.payment_type = 'RECEIVED'
           AND sp.status NOT IN ('CANCELLED', 'FAILED')
       ) p ON TRUE
 WHERE i.pos_session_id IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz')
   AND i.status NOT IN ('CANCELLED', 'DRAFT')
 ORDER BY i.id;

-- 1c. THE DECIDING QUERY: payment rows settling those invoices that Day Close cannot
--     see, because their pos_session_id is NULL or points elsewhere.
--       rows summing to ~3018.50  -> cause (A), go to section 2
--       no rows                   -> cause (B), go to section 3
SELECT sp.id, sp.payment_number, sp.payment_date, sp.linked_invoice, sp.payment_mode,
       sp.amount, sp.status, sp.pos_session_id, sp.created_by
  FROM sales_payments sp
  JOIN sales_invoices i ON i.invoice_number = sp.linked_invoice
 WHERE i.pos_session_id IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz')
   AND i.status NOT IN ('CANCELLED', 'DRAFT')
   AND sp.payment_type = 'RECEIVED'
   AND sp.status NOT IN ('CANCELLED', 'FAILED')
   AND (sp.pos_session_id IS NULL
        OR sp.pos_session_id NOT IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz'))
 ORDER BY sp.id;

-- 1e. Corroborates that INV-2026-0110 does not belong to session 19: compare the
--     session's own running counters (written as each sale was rung up) against the
--     invoices now pointing at it, and check whether the stray invoice has a session
--     of its own date to go back to.
SELECT s.id, s.invoice_count AS counter_invoices, s.total_sales AS counter_sales,
       s.total_cash_sales, s.total_card_sales, s.total_credit_sales,
       COUNT(i.id) AS linked_invoices, COALESCE(SUM(i.invoice_total), 0) AS linked_total
  FROM pos_sessions s
  LEFT JOIN sales_invoices i
         ON i.pos_session_id = s.id AND i.status NOT IN ('CANCELLED', 'DRAFT')
 WHERE s.trading_date = DATE :'biz'
 GROUP BY s.id, s.invoice_count, s.total_sales, s.total_cash_sales,
          s.total_card_sales, s.total_credit_sales;
-- counter_invoices/counter_sales (7 / 944.00) are the truth of what was rung up;
-- linked_invoices/linked_total (8 / 3194.00) include the misattributed July invoice.

-- Any session actually open on the stray invoice's own date, to move it back to?
-- A NULL result is fine - section 2 clears the bad link rather than inventing one.
SELECT id, terminal_id, counter_name, status, session_date, trading_date,
       opened_at, closed_at
  FROM pos_sessions
 WHERE trading_date = DATE '2026-07-09' OR session_date = DATE '2026-07-09'
 ORDER BY id;

-- 1d. Reproduces the backend arithmetic exactly. Run it before the repair (it should
--     print variance = 3018.50, matching the dialog) and again after - the repair is
--     correct only when ABS(variance) <= 0.05.
WITH s AS (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz'),
     inv AS (
        SELECT COALESCE(SUM(invoice_total), 0)                      AS total_sales,
               COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS credit_sales
          FROM sales_invoices
         WHERE pos_session_id IN (SELECT id FROM s)
           AND status NOT IN ('CANCELLED', 'DRAFT')),
     tnd AS (   -- cash + card + other: all non-credit tender on the day's sessions
        SELECT COALESCE(SUM(amount), 0) AS tender,
               -- money collected today against an invoice NOT sold today
               COALESCE(SUM(amount) FILTER (
                   WHERE linked_invoice IS NULL OR linked_invoice NOT IN (
                       SELECT invoice_number FROM sales_invoices
                        WHERE pos_session_id IN (SELECT id FROM s)
                          AND status NOT IN ('CANCELLED', 'DRAFT'))), 0) AS earlier_invoice
          FROM sales_payments
         WHERE pos_session_id IN (SELECT id FROM s)
           AND payment_type = 'RECEIVED'
           AND status NOT IN ('CANCELLED', 'FAILED')
           -- Mirrors TenderBucket.of(): only a mode that lands in the CREDIT bucket is
           -- dropped, and "Credit Card" is CARD (the card test runs first), so it stays.
           AND NOT (COALESCE(payment_mode, 'Cash') ILIKE '%credit%'
                    AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%card%'
                    AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%visa%'
                    AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%master%'
                    AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%amex%'
                    AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%mada%'
                    AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%cash%')),
     adv AS (   -- customer advances collected through the day's sessions.
                -- ReceiptVoucher.purpose has no @Enumerated, so it persists as an
                -- ORDINAL: 0=CASH_SALE 1=AGAINST_INVOICE 2=ADVANCE_RECEIVED 3=REFUND_IN.
        SELECT COALESCE(SUM(amount), 0) AS advances
          FROM sales_receipt_vouchers
         WHERE pos_session_id IN (SELECT id FROM s)
           AND receipt_purpose = 2)
SELECT inv.total_sales AS expected_total_sales,
       tnd.tender + inv.credit_sales - tnd.earlier_invoice - adv.advances AS computed_total_sales,
       tnd.earlier_invoice AS earlier_invoice_collections,
       adv.advances        AS advance_collections,
       inv.total_sales - (tnd.tender + inv.credit_sales - tnd.earlier_invoice - adv.advances) AS variance
  FROM inv, tnd, adv;

-- ===================================================================================
-- 2. REPAIR (RECOMMENDED) - detach the misattributed July invoice, then relink the
--    seven August sales' own tender.
--    All three steps run in ONE transaction: 2a+2b alone leave the day blocked on the
--    CASH check instead of the SALES check (see DIAGNOSIS RESULT above).
--
--    After this: expected sales 944.00 = tender 768.50 + credit 175.50, variance 0.00.
-- ===================================================================================
BEGIN;

-- 2a. Unstamp the July sale from the August session. Its own July payment stays
--     exactly as it is - untouched, still settling the invoice, still 2250.00. Only
--     the claim that this sale happened on session 19 goes away, which is the claim
--     that was false. Expect 1 row.
--     If query 1e found a genuine July session, set pos_session_id to that id instead
--     of NULL; do not invent one.
UPDATE sales_invoices
   SET pos_session_id = NULL
 WHERE invoice_number = 'INV-2026-0110'
   AND pos_session_id = 19;

-- 2b. Write the link recordPayment() should have written for the sales that DID
--     happen on this session: each payment is attributed to the session its own
--     invoice was rung up in. No amount changes, no money is created.
--     Expect 10 rows (the 11 from 1c, less PAY-2026-0105 which 2a just detached).
UPDATE sales_payments sp
   SET pos_session_id = i.pos_session_id
  FROM sales_invoices i
 WHERE i.invoice_number = sp.linked_invoice
   AND i.pos_session_id IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz')
   AND i.status NOT IN ('CANCELLED', 'DRAFT')
   AND sp.payment_type = 'RECEIVED'
   AND sp.status NOT IN ('CANCELLED', 'FAILED')
   AND sp.pos_session_id IS NULL;
-- If the row count is lower than expected, some payments carry a WRONG session id
-- rather than NULL - inspect those individually before widening this UPDATE; moving
-- tender between two real sessions restates BOTH drawers' expected cash.

-- 2c. Re-freeze each session's expected cash on the tender that is now visible.
--     This is the same formula PosCashReconciliationService.reconcile() uses:
--         opening float + cash-bucket tender + DROP_IN - DROP_OUT
--     Only the CASH bucket counts (TenderBucket.of): "Cash" -> CASH; "Mastercard"
--     -> CARD; "JCB" matches none of card/visa/master/amex/mada and falls through to
--     OTHER. Session 19's six remaining Cash rows: 45.50 + 45.00 + 12.00 + 12.00 +
--     12.00 + 541.00 = 667.50. (Under section 2B it would be 2917.50 instead, because
--     July's 2250.00 cash would then be counted into this drawer.)
--     cash_difference stays counted - expected, the convention closeSession writes.
UPDATE pos_sessions ps
   SET expected_cash    = calc.expected,
       cash_difference  = CASE WHEN ps.counted_at IS NULL
                                AND (ps.closing_denominations_json IS NULL
                                     OR ps.closing_denominations_json = '')
                               THEN NULL                                   -- never counted
                               ELSE COALESCE(ps.closing_cash, 0) - calc.expected
                          END
  FROM (
        SELECT s.id,
               COALESCE(s.opening_cash, 0)
             + COALESCE((SELECT SUM(p.amount)
                           FROM sales_payments p
                          WHERE p.pos_session_id = s.id
                            AND p.payment_type = 'RECEIVED'
                            AND p.status NOT IN ('CANCELLED', 'FAILED')
                            AND COALESCE(p.payment_mode, 'Cash') ILIKE '%cash%'
                            AND COALESCE(p.payment_mode, 'Cash') NOT ILIKE '%cashew%'
                            AND COALESCE(p.payment_mode, 'Cash') NOT ILIKE '%card%'), 0)
             + COALESCE((SELECT SUM(rv.amount)
                           FROM sales_receipt_vouchers rv
                          WHERE rv.pos_session_id = s.id
                            AND rv.receipt_purpose = 2                     -- ADVANCE_RECEIVED
                            AND COALESCE(rv.payment_mode, 'Cash') ILIKE '%cash%'
                            AND COALESCE(rv.payment_mode, 'Cash') NOT ILIKE '%cashew%'
                            AND COALESCE(rv.payment_mode, 'Cash') NOT ILIKE '%card%'), 0)
             + COALESCE((SELECT SUM(cm.amount) FROM pos_cash_movements cm
                          WHERE cm.pos_session_id = s.id AND cm.movement_type = 'DROP_IN'
                            AND (cm.status IS NULL OR cm.status = 'ACTIVE')), 0)
             - COALESCE((SELECT SUM(cm.amount) FROM pos_cash_movements cm
                          WHERE cm.pos_session_id = s.id AND cm.movement_type = 'DROP_OUT'
                            AND (cm.status IS NULL OR cm.status = 'ACTIVE')), 0)
               AS expected
          FROM pos_sessions s
         WHERE s.trading_date = DATE :'biz'
       ) calc
 WHERE ps.id = calc.id;

-- 2d. VERIFY BEFORE COMMITTING - both must hold:
--       * re-run query 1d           -> variance within +/-0.05
--       * the query below           -> integrity_drift within +/-0.05
--     COMMIT only if both pass; otherwise ROLLBACK.
WITH s AS (SELECT * FROM pos_sessions WHERE trading_date = DATE :'biz'),
     cash AS (
        SELECT COALESCE(SUM(amount), 0) AS cash_sales
          FROM sales_payments
         WHERE pos_session_id IN (SELECT id FROM s)
           AND payment_type = 'RECEIVED'
           AND status NOT IN ('CANCELLED', 'FAILED')
           AND COALESCE(payment_mode, 'Cash') ILIKE '%cash%'
           AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%cashew%'
           AND COALESCE(payment_mode, 'Cash') NOT ILIKE '%card%')
SELECT (SELECT COALESCE(SUM(opening_cash), 0) FROM s)  AS opening_cash,
       cash.cash_sales,
       (SELECT COALESCE(SUM(expected_cash), 0) FROM s) AS expected_cash_frozen,
       (SELECT COALESCE(SUM(opening_cash), 0) FROM s) + cash.cash_sales
         - (SELECT COALESCE(SUM(expected_cash), 0) FROM s) AS integrity_drift
  FROM cash;
-- (Add the DROP_IN/DROP_OUT terms above if the day had drawer movements; session 19
--  has none, which is why they are left out of this cross-check.)

COMMIT;

-- AFTER COMMITTING, the day closes - but note what it will now report: session 19's
-- expected cash is 667.50 against a physical count of 0.00, so the Z-Report shows a
-- 667.50 SHORT drawer and the "Cash Variance Within Limits" checklist row turns red.
-- That is advisory, not a blocker (closeDay blocks only on the integrity drift above),
-- and it is the truthful reading of this data: the till was counted as empty while
-- 2917.50 of cash tender was recorded against it.
--
-- Do NOT "fix" that by overwriting closing_cash to match - that fabricates a physical
-- count nobody took, which is exactly the audit trail this module exists to protect.
-- If this demo tenant needs a clean-looking drawer, the legitimate route is the
-- supervisor denomination-correction workflow (PosSessionDenominationCorrectionService),
-- which restates a count through an approval that stays on the record.

-- ===================================================================================
-- 2B. THE ALTERNATIVE, NOT RECOMMENDED - keep the July invoice on session 19 and pull
--     its 2250.00 into this drawer. It clears the dialog just as section 2 does:
--     expected sales 3194.00 = tender 3018.50 + credit 175.50.
--
--     Why it is the wrong answer: it asserts that 2250.00 was collected at Counter 2
--     on 2026-08-30 when the payment row says 2026-07-09. That inflates the day's
--     sales by 2250.00, moves July revenue into an August Z-Report (and into whatever
--     GL period the Day Close posts to), and leaves the drawer 2917.50 short instead
--     of 667.50. Use it only if 1e shows the July date on the invoice is itself the
--     error and the sale really was rung up on this session.
-- ===================================================================================
-- BEGIN;
-- UPDATE sales_payments sp
--    SET pos_session_id = i.pos_session_id
--   FROM sales_invoices i
--  WHERE i.invoice_number = sp.linked_invoice
--    AND i.pos_session_id IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz')
--    AND i.status NOT IN ('CANCELLED', 'DRAFT')
--    AND sp.payment_type = 'RECEIVED'
--    AND sp.status NOT IN ('CANCELLED', 'FAILED')
--    AND sp.pos_session_id IS NULL;                       -- expect 11 rows
-- -- then run step 2c unchanged (it recomputes expected_cash from whatever is linked,
-- -- yielding 2917.50 here), then 2d, then COMMIT or ROLLBACK.
-- COMMIT;

-- ===================================================================================
-- 3. REPAIR (B) - no tender was ever recorded
--     RULED OUT for this incident: 1c returned all 11 payments and 1b's "unexplained"
--     column was 0.00 on every invoice, so no money is missing. Kept for the next time
--     this dialog appears, when 1c may well come back empty.
--     Run ONLY if 1c returned nothing. Then 3018.50 of goods left the shop against
--     invoices flagged settled with no collection behind them. Do NOT invent payment
--     rows to paper over it: the honest repair is to put the uncollected amount back
--     on the customer as an outstanding balance, which balances the identity because
--     unpaid balance is exactly what "credit sales" means here.
--
--     This moves 3018.50 into customer receivables - get the client's sign-off, and
--     confirm from 1b's "unexplained" column which invoices genuinely went
--     uncollected before filling in the invoice list below.
-- ===================================================================================
-- BEGIN;
-- UPDATE sales_invoices i
--    SET balance = i.invoice_total - COALESCE((
--            SELECT SUM(sp.amount)
--              FROM sales_payments sp
--             WHERE sp.linked_invoice = i.invoice_number
--               AND sp.payment_type = 'RECEIVED'
--               AND sp.status NOT IN ('CANCELLED', 'FAILED')), 0)
--  WHERE i.pos_session_id IN (SELECT id FROM pos_sessions WHERE trading_date = DATE :'biz')
--    AND i.status NOT IN ('CANCELLED', 'DRAFT')
--    AND i.invoice_number IN ( /* the specific invoice numbers from 1b */ );
-- -- Re-run 1d, then COMMIT or ROLLBACK.
-- COMMIT;
