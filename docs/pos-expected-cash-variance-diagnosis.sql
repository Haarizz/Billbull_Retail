-- ============================================================================
-- POS Expected Cash — "where did the extra money come from?" diagnosis
-- ============================================================================
-- Read-only. Safe to run on a client production database.
--
-- Symptom this answers: Expected Cash is higher than the cash the cashier can
-- account for from the invoices they see in Reprint Previous Invoices, so the
-- drawer reports Short by the difference (screenshot: expected 642.00,
-- counted 410.00, short 232.00, while the day's cash invoices visible to the
-- cashier add to 457.00).
--
-- The formula, from PosCashReconciliationService#reconcile — four terms and
-- nothing else:
--
--   Expected Closing Cash = L1  pos_sessions.opening_cash
--                         + L2  cash tender collected  (sales_payments
--                               + ADVANCE_RECEIVED sales_receipt_vouchers)
--                         + L3  ACTIVE pos_cash_movements DROP_IN
--                         - L3  ACTIVE pos_cash_movements DROP_OUT
--
-- L2 is keyed on sales_payments.pos_session_id — the COLLECTION session, not
-- sales_invoices.pos_session_id (the SALE session). That is the most common
-- source of a gap the cashier cannot see: money collected at this till against
-- a document created somewhere else, or on another day, never appears in the
-- Reprint list (which lists invoices) but is in Expected Cash.
--
-- Run section 0, put the session id into :sid, then run 1 through 9 in order.
-- Section 1 tells you which of the four terms carries the excess; the rest
-- explain that term line by line. Section 9 is the one-screen verdict.
-- ============================================================================

-- psql: run section 0 first, then SET THE VARIABLE before anything else:
--
--     \set sid 191
--
-- Without it psql passes :sid through literally and every section from 1 on
-- fails with "syntax error at or near :". Section 0 still runs, because it is
-- the only section that does not reference :sid.
--
-- Any other client: replace :sid throughout with the numeric id.


-- ----------------------------------------------------------------------------
-- 0. Find the session
-- ----------------------------------------------------------------------------
-- Match on what the screenshot shows: the counter, the trading date, and an
-- OPEN status. trading_date is the business day; session_date is the calendar
-- day the row was created, and the two differ for an overnight session — which
-- is itself a reason a cashier sees "yesterday's" money in today's drawer.
SELECT s.id,
       s.branch_id,
       s.branch_name,
       s.terminal_id,
       s.counter_name,
       s.status,
       s.session_date,
       s.trading_date,
       s.opened_at,
       s.closed_at,
       s.opened_by,
       s.opening_cash,
       s.expected_cash   AS frozen_expected_cash,  -- only meaningful once CLOSED
       s.closing_cash    AS counted_cash,
       s.counted_at
FROM pos_sessions s
WHERE s.counter_name = 'Counter 5'
  AND (s.trading_date = DATE '2026-10-05' OR s.session_date = DATE '2026-10-05')
ORDER BY s.opened_at DESC;


-- ----------------------------------------------------------------------------
-- 1. The four terms, recomputed exactly as the backend computes them
-- ----------------------------------------------------------------------------
-- This is the whole answer at the top level: whichever term is larger than the
-- cashier expects is the one to drill into. Compare expected_cash_recomputed
-- against the figure on screen; if they differ, the session is CLOSED and the
-- screen is showing the FROZEN pos_sessions.expected_cash instead (section 8).
--
-- The CASH bucket test below reproduces TenderBucket.of in SQL, including its
-- ordering: BNPL and card-ish labels are claimed BEFORE 'cash', so a mode of
-- 'Cash Card' buckets to CARD, not CASH. Keep the branches in this order.
--
-- sales_receipt_vouchers.receipt_purpose has no @Enumerated, so JPA stores it
-- ORDINAL, as a smallint: 0 CASH_SALE, 1 AGAINST_INVOICE, 2 ADVANCE_RECEIVED,
-- 3 REFUND_IN. Comparing it to the string 'ADVANCE_RECEIVED' raises
-- "invalid input syntax for type smallint". Confirm the mapping on the tenant
-- before trusting the number:
--
--   SELECT receipt_purpose, COUNT(*) FROM sales_receipt_vouchers
--   GROUP BY 1 ORDER BY 1;
WITH tender AS (
    SELECT COALESCE(SUM(p.amount), 0) AS cash_tender
    FROM sales_payments p
    WHERE p.pos_session_id = :sid
      AND p.payment_type = 'RECEIVED'
      AND p.status NOT IN ('CANCELLED', 'FAILED')
      AND CASE
            WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'bnpl|buy now|tabby|tamara|postpay|spotii|cashew' THEN 'bnpl'
            WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'card|visa|master|amex|mada' THEN 'card'
            WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) LIKE '%cash%' THEN 'cash'
            ELSE 'other'
          END = 'cash'
),
advances AS (
    SELECT COALESCE(SUM(rv.amount), 0) AS advance_cash
    FROM sales_receipt_vouchers rv
    WHERE rv.pos_session_id = :sid
      AND rv.receipt_purpose = 2  -- ADVANCE_RECEIVED; ORDINAL-mapped, see note at section 1
      AND CASE
            WHEN LOWER(COALESCE(rv.payment_mode, '')) ~ 'bnpl|buy now|tabby|tamara|postpay|spotii|cashew' THEN 'bnpl'
            WHEN LOWER(COALESCE(rv.payment_mode, '')) ~ 'card|visa|master|amex|mada' THEN 'card'
            WHEN LOWER(COALESCE(rv.payment_mode, '')) LIKE '%cash%' THEN 'cash'
            ELSE 'other'
          END = 'cash'
),
moves AS (
    SELECT COALESCE(SUM(CASE WHEN m.movement_type = 'DROP_IN'  THEN m.amount END), 0) AS cash_in,
           COALESCE(SUM(CASE WHEN m.movement_type = 'DROP_OUT' THEN m.amount END), 0) AS cash_out
    FROM pos_cash_movements m
    WHERE m.pos_session_id = :sid
      AND (m.status IS NULL OR m.status = 'ACTIVE')
)
SELECT s.id                                         AS session_id,
       s.status,
       COALESCE(s.opening_cash, 0)                  AS l1_opening_float,
       t.cash_tender                                AS l2_payments_cash,
       a.advance_cash                               AS l2_advance_receipts_cash,
       t.cash_tender + a.advance_cash               AS l2_cash_tender_total,
       mv.cash_in                                   AS l3_cash_in,
       mv.cash_out                                  AS l3_cash_out,
       COALESCE(s.opening_cash, 0) + t.cash_tender + a.advance_cash
           + mv.cash_in - mv.cash_out               AS expected_cash_recomputed,
       s.expected_cash                              AS expected_cash_frozen_on_row,
       s.closing_cash                               AS counted_cash,
       s.closing_cash - (COALESCE(s.opening_cash, 0) + t.cash_tender + a.advance_cash
           + mv.cash_in - mv.cash_out)              AS variance_recomputed
FROM pos_sessions s, tender t, advances a, moves mv
WHERE s.id = :sid;


-- ----------------------------------------------------------------------------
-- 2. Every cash tender row in the drawer, line by line
-- ----------------------------------------------------------------------------
-- The itemised L2. Sum the amount column and it must equal l2_payments_cash
-- from section 1. Read the visible_to_cashier column: rows marked
-- NOT_IN_REPRINT_LIST are real money in Expected Cash that the Reprint
-- Previous Invoices dialog does not show, because that dialog lists invoices
-- created in this session, not payments collected in it.
SELECT p.id,
       p.payment_number,
       p.payment_date,
       p.created_date,
       p.payment_mode,
       p.amount,
       p.status,
       p.linked_invoice,
       p.customer_name,
       p.split_group_id,
       p.receipt_voucher_record_id,
       i.id                AS invoice_id,
       i.pos_session_id    AS invoice_sale_session,
       i.invoice_date,
       i.status            AS invoice_status,
       i.invoice_total,
       CASE
         WHEN p.linked_invoice IS NULL OR p.linked_invoice = ''
              THEN 'NOT_IN_REPRINT_LIST (no invoice — advance / on-account receipt)'
         WHEN i.id IS NULL
              THEN 'NOT_IN_REPRINT_LIST (invoice number does not resolve)'
         WHEN i.pos_session_id IS DISTINCT FROM p.pos_session_id
              THEN 'NOT_IN_REPRINT_LIST (sale belongs to session '
                   || COALESCE(i.pos_session_id::text, 'NULL') || ')'
         WHEN i.invoice_date <> (SELECT COALESCE(s.trading_date, s.session_date)
                                 FROM pos_sessions s WHERE s.id = :sid)
              THEN 'NOT_IN_REPRINT_LIST (invoice dated ' || i.invoice_date || ')'
         ELSE 'visible'
       END AS visible_to_cashier
FROM sales_payments p
LEFT JOIN sales_invoices i ON i.invoice_number = p.linked_invoice
WHERE p.pos_session_id = :sid
  AND p.payment_type = 'RECEIVED'
  AND p.status NOT IN ('CANCELLED', 'FAILED')
  AND CASE
        WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'bnpl|buy now|tabby|tamara|postpay|spotii|cashew' THEN 'bnpl'
        WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'card|visa|master|amex|mada' THEN 'card'
        WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) LIKE '%cash%' THEN 'cash'
        ELSE 'other'
      END = 'cash'
ORDER BY p.id;


-- ----------------------------------------------------------------------------
-- 3. Suspect A — duplicate tender rows (one sale banked twice)
-- ----------------------------------------------------------------------------
-- A retried checkout, a double-submitted payment dialog or a split-payment
-- group written twice all land here: the same invoice carrying more cash than
-- its own total, or two identical amounts against one invoice. The excess
-- column is money in Expected Cash that was never physically taken.
SELECT p.linked_invoice,
       i.invoice_total,
       i.status                              AS invoice_status,
       COUNT(*)                              AS cash_rows,
       SUM(p.amount)                         AS cash_collected,
       SUM(p.amount) - COALESCE(i.invoice_total, 0) AS excess_over_invoice_total,
       STRING_AGG(p.id::text || ':' || p.amount::text
                  || COALESCE(' [' || p.split_group_id || ']', ''), ', ' ORDER BY p.id) AS rows_detail
FROM sales_payments p
LEFT JOIN sales_invoices i ON i.invoice_number = p.linked_invoice
WHERE p.pos_session_id = :sid
  AND p.payment_type = 'RECEIVED'
  AND p.status NOT IN ('CANCELLED', 'FAILED')
  AND p.linked_invoice IS NOT NULL
GROUP BY p.linked_invoice, i.invoice_total, i.status
HAVING COUNT(*) > 1
    OR SUM(p.amount) > COALESCE(i.invoice_total, 0) + 0.005
ORDER BY excess_over_invoice_total DESC NULLS LAST;


-- ----------------------------------------------------------------------------
-- 4. Suspect B — tender on a cancelled / returned / voided invoice
-- ----------------------------------------------------------------------------
-- The invoice was cancelled or fully returned but its payment row was left
-- RECEIVED and not CANCELLED, so the cash is still counted in. The cashier
-- refunded the money out of the drawer; Expected Cash never learned.
SELECT p.id,
       p.payment_number,
       p.amount,
       p.payment_mode,
       p.status            AS payment_status,
       p.linked_invoice,
       i.status            AS invoice_status,
       i.invoice_total,
       i.amount_paid,
       i.return_credited,
       i.balance
FROM sales_payments p
JOIN sales_invoices i ON i.invoice_number = p.linked_invoice
WHERE p.pos_session_id = :sid
  AND p.payment_type = 'RECEIVED'
  AND p.status NOT IN ('CANCELLED', 'FAILED')
  AND (i.status IN ('CANCELLED', 'VOID', 'VOIDED', 'RETURNED', 'DRAFT')
       OR COALESCE(i.return_credited, 0) > 0)
ORDER BY p.id;


-- ----------------------------------------------------------------------------
-- 5. Suspect C — cash collected here for a sale made elsewhere
-- ----------------------------------------------------------------------------
-- Legitimate money, invisible to the cashier: a delivery note settled at this
-- till, an old credit invoice paid off, a customer advance. All of it is in
-- Expected Cash by design (the collection session owns the cash), and none of
-- it is in the Reprint list. This is the expected explanation when sections 3
-- and 4 come back empty.
SELECT 'payment_for_other_session_invoice' AS kind,
       p.id, p.payment_number, p.amount, p.payment_mode,
       p.linked_invoice, p.customer_name, p.notes,
       i.invoice_date, i.pos_session_id AS sale_session_id
FROM sales_payments p
LEFT JOIN sales_invoices i ON i.invoice_number = p.linked_invoice
WHERE p.pos_session_id = :sid
  AND p.payment_type = 'RECEIVED'
  AND p.status NOT IN ('CANCELLED', 'FAILED')
  AND CASE
        WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'bnpl|buy now|tabby|tamara|postpay|spotii|cashew' THEN 'bnpl'
        WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'card|visa|master|amex|mada' THEN 'card'
        WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) LIKE '%cash%' THEN 'cash'
        ELSE 'other'
      END = 'cash'
  AND (i.id IS NULL OR i.pos_session_id IS DISTINCT FROM p.pos_session_id)

UNION ALL

SELECT 'advance_receipt_voucher' AS kind,
       rv.id, rv.voucher_id, rv.amount, rv.payment_mode,
       NULL, rv.member_name, rv.reference,
       rv.date, NULL
FROM sales_receipt_vouchers rv
WHERE rv.pos_session_id = :sid
  AND rv.receipt_purpose = 2  -- ADVANCE_RECEIVED; ORDINAL-mapped, see note at section 1
ORDER BY kind, 3 DESC;


-- ----------------------------------------------------------------------------
-- 6. Suspect D — drawer movements
-- ----------------------------------------------------------------------------
-- A DROP_IN adds to Expected Cash; a DROP_OUT subtracts. A float top-up
-- entered as a DROP_IN that never physically reached the drawer, or a payout
-- that was voided after the money left, both show as a short till. Voided rows
-- are listed too, so you can spot one that SHOULD have been voided and wasn't.
SELECT m.id,
       m.movement_type,
       m.amount,
       m.status,
       m.category_id,
       c.name AS category_name,
       m.description,
       m.reference,
       m.performed_by,
       m.performed_at,
       m.business_date,
       m.void_reason,
       m.voided_by,
       m.voided_at,
       m.edit_count,
       m.posted_account_code,
       CASE WHEN m.status IS NULL OR m.status = 'ACTIVE'
            THEN 'counted in expected cash' ELSE 'excluded' END AS effect
FROM pos_cash_movements m
LEFT JOIN pos_cash_movement_categories c ON c.id = m.category_id
WHERE m.pos_session_id = :sid
ORDER BY m.performed_at, m.id;


-- ----------------------------------------------------------------------------
-- 7. Suspect E — the opening float
-- ----------------------------------------------------------------------------
-- opening_cash is taken as declared at open; nothing validates it against the
-- previous drawer. A float keyed as 200 when the drawer held 0 produces
-- exactly this symptom, for exactly 200, every day, until someone fixes it.
-- Compare this session's float with the previous session on the same counter
-- and with what that session was actually counted at.
SELECT s.id,
       s.counter_name,
       s.terminal_id,
       s.trading_date,
       s.opened_at,
       s.opened_by,
       s.opening_cash,
       s.closing_cash,
       s.expected_cash,
       s.closing_cash - s.expected_cash            AS variance,
       LAG(s.closing_cash) OVER w                  AS prev_session_counted,
       s.opening_cash - LAG(s.closing_cash) OVER w AS float_vs_prev_count
FROM pos_sessions s
WHERE s.counter_name = (SELECT counter_name FROM pos_sessions WHERE id = :sid)
  AND s.branch_id IS NOT DISTINCT FROM (SELECT branch_id FROM pos_sessions WHERE id = :sid)
WINDOW w AS (ORDER BY s.opened_at)
ORDER BY s.opened_at DESC
LIMIT 15;


-- ----------------------------------------------------------------------------
-- 8. Approved corrections overlaying this session
-- ----------------------------------------------------------------------------
-- A correction restates a value at display time without changing the base row,
-- so a figure on screen can legitimately differ from what sections 1–6 compute.
-- If anything comes back here, the screen is right and the raw rows are stale —
-- read corrected_snapshot_json, not the table.
SELECT o.id,
       o.target_type,
       o.target_id,
       o.version,
       o.status,
       o.original_snapshot_json,
       o.corrected_snapshot_json
FROM pos_correction_overlays o
WHERE (o.target_type = 'POS_SESSION'     AND o.target_id = :sid)
   OR (o.target_type = 'CASH_MOVEMENT'   AND o.target_id IN
          (SELECT id FROM pos_cash_movements WHERE pos_session_id = :sid))
   OR (o.target_type = 'RECEIPT_VOUCHER' AND o.target_id IN
          (SELECT id FROM sales_receipt_vouchers WHERE pos_session_id = :sid))
ORDER BY o.target_type, o.target_id, o.version;


-- ----------------------------------------------------------------------------
-- 9. The verdict — reconciles the screen against the cashier's own arithmetic
-- ----------------------------------------------------------------------------
-- cash_the_cashier_can_see    = cash tender on invoices created AND settled in
--                               this session (what the Reprint list shows)
-- cash_the_cashier_cannot_see = everything else in L2
--
-- unexplained_excess is the number to chase. If it is zero, Expected Cash is
-- arithmetically correct and the difference is either the opening float
-- (section 7) or genuinely missing money.
WITH cash_rows AS (
    SELECT p.id, p.amount, p.linked_invoice, i.pos_session_id AS sale_session, i.invoice_date
    FROM sales_payments p
    LEFT JOIN sales_invoices i ON i.invoice_number = p.linked_invoice
    WHERE p.pos_session_id = :sid
      AND p.payment_type = 'RECEIVED'
      AND p.status NOT IN ('CANCELLED', 'FAILED')
      AND CASE
            WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'bnpl|buy now|tabby|tamara|postpay|spotii|cashew' THEN 'bnpl'
            WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) ~ 'card|visa|master|amex|mada' THEN 'card'
            WHEN LOWER(COALESCE(p.payment_mode, 'Cash')) LIKE '%cash%' THEN 'cash'
            ELSE 'other'
          END = 'cash'
),
movements AS (
    SELECT COALESCE(SUM(CASE WHEN movement_type = 'DROP_IN'  THEN amount
                             WHEN movement_type = 'DROP_OUT' THEN -amount END), 0) AS net_movements
    FROM pos_cash_movements
    WHERE pos_session_id = :sid
      AND (status IS NULL OR status = 'ACTIVE')
),
adv AS (
    SELECT COALESCE(SUM(rv.amount), 0) AS advances
    FROM sales_receipt_vouchers rv
    WHERE rv.pos_session_id = :sid
      AND rv.receipt_purpose = 2  -- ADVANCE_RECEIVED; ORDINAL-mapped, see note at section 1
      AND LOWER(COALESCE(rv.payment_mode, '')) LIKE '%cash%'
),
visible AS (
    SELECT COALESCE(SUM(amount), 0) AS seen
    FROM cash_rows WHERE sale_session = :sid
),
hidden AS (
    SELECT COALESCE(SUM(amount), 0) AS unseen
    FROM cash_rows WHERE sale_session IS DISTINCT FROM :sid
)
SELECT COALESCE(s.opening_cash, 0)                  AS opening_float,
       v.seen                                       AS cash_the_cashier_can_see,
       h.unseen                                     AS cash_the_cashier_cannot_see,
       a.advances,
       mv.net_movements,
       s.closing_cash                               AS counted,
       -- what the drawer should hold if ONLY what the cashier can see is real
       COALESCE(s.opening_cash, 0) + v.seen + mv.net_movements
                                                    AS expected_if_only_visible_sales,
       -- the gap the cashier is being asked to explain
       h.unseen + a.advances                        AS unexplained_excess
FROM pos_sessions s, visible v, hidden h, adv a, movements mv
WHERE s.id = :sid;
