-- ============================================================================
-- Sales Return GL repair — historical rows approved before the Phase 2 change
--
-- THIS SCRIPT WRITES. Part A is read-only pre-flight. Part B posts journals.
-- Run Part A, read it, decide, then run Part B. Part B is one transaction and
-- ends with COMMIT on a line of its own — leave it as ROLLBACK for a rehearsal.
--
--   psql -h localhost -U postgres -d billbull_royaltools -f sales-return-gl-repair-2026-10-04.sql
--
-- WHAT IT REPAIRS, AND WHY THESE ARE INSERTS AND NOT UPDATES
-- ---------------------------------------------------------
-- Nothing stored on sales_returns is wrong, so there is no row to UPDATE. What is
-- missing are journal entries that were never written:
--
--   1. {returnNumber}-RFND    Dr 1100 / Cr 1013 (card) or 1010 (bank)
--      A card or bank refund left 1100 credited for money that had physically
--      left the business, and the merchant/bank account never moved.
--
--   2. {returnNumber}-INVREV  Dr 5001 / Cr 1200
--      Reverses a {returnNumber}-INV entry whose goods never came back. A return
--      raised to correct a payment method or a duplicated sale restocks nothing,
--      but the old code debited 1200 and reversed COGS anyway.
--
-- One posting through the application writes FIVE places. This script writes all
-- five, in the same order and with the same arithmetic as PostingEngineService:
--
--   voucher_sequences      last_number bumped, entry_number built from it
--   journal_entries        entry_type SYSTEM, status Posted
--   journal_lines          two lines, balanced
--   ledger_entries         one row per line, with running_balance
--   accounts               balance_amount / balance_type advanced per line
--   gl_account_balances    debit_total / credit_total / closing_balance upserted
--
-- Miss any one of them and the trial balance, the account ledger view and the
-- dashboards stop agreeing with each other. That is the whole reason this file is
-- 300 lines instead of two UPDATEs.
--
-- A SAFER ALTERNATIVE, IF IT IS OPEN TO YOU
-- -----------------------------------------
-- Check this first:
--     SELECT code, name, control_account, tax_role FROM accounts
--     WHERE code IN ('1100','1200','5001','1013','1010');
-- If control_account is false and tax_role is null on those rows, then manual
-- journal vouchers on them are NOT blocked, and you can post this repair through
-- Financials → Journal Voucher instead, letting the application do all five
-- writes itself. Set each JV's Reference to the exact string ({SR}-RFND or
-- {SR}-INVREV) so the worklist queries stop flagging the row. That is lower risk
-- than this script and leaves a normal audit trail. Use this script only if those
-- accounts are flagged as control accounts, where the application refuses them.
--
-- WHAT THIS SCRIPT DOES NOT DO
-- ----------------------------
--   * It does not touch sales_returns, sales_invoices, stock_movements or
--     sales_return_credit_applications. No invoice balance or status changes.
--   * It does not post for a return whose linked invoice still has a balance: the
--     customer never paid, so there was no paid portion to refund and the row
--     needs an accounting decision first. Those are REFUSED and listed.
--   * It does not reverse the inventory leg of a return that DOES have inbound
--     stock movements — there the -INV entry is right and the gap is on the stock
--     side, which a GL reversal would make worse.
--   * It does not invent a posting date. See v_posting_date below.
--
-- PERIOD LOCK
-- -----------
-- journal_entries and ledger_entries both carry the trg_period_lock trigger, so a
-- date inside a Closed accounting period is refused here exactly as it is in the
-- application. Part A query 4 shows which dates are open.
-- ============================================================================


-- ============================================================================
-- PART A — READ-ONLY PRE-FLIGHT. Run this first and read every result.
-- ============================================================================

\echo '== A1. The returns, and what each one is missing ==========================='
SELECT r.return_number,
       r.return_date,
       r.refund_method,
       r.total_amount,
       b.code                                   AS branch_code,
       EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number)
                                                AS has_base_journal,
       EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-RFND')
                                                AS has_rfnd,
       EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-INV')
                                                AS has_inv,
       EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = r.return_number || '-INVREV')
                                                AS has_invrev,
       (SELECT COUNT(*) FROM stock_movements sm
        WHERE sm.reference_no = r.return_number AND sm.quantity > 0)
                                                AS inbound_movements,
       (SELECT COALESCE(SUM(jl.debit), 0) FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.reference = r.return_number || '-INV' AND jl.account_code = '1200')
                                                AS inv_debit_1200
FROM   sales_returns r
LEFT   JOIN branches b ON b.id = r.branch_id
WHERE  r.status = 'APPROVED'
ORDER  BY r.return_number;

\echo '== A2. Paid portion per return — the only amount a refund may move ========='
-- Mirrors InvoiceBalanceService.effectiveOutstanding exactly: receipts + applied
-- advances reduce it, applied return credits reduce it, floored at zero. A row whose
-- would_be_paid_portion is 0.00 is REFUSED by Part B.
SELECT r.return_number,
       r.refund_method,
       r.total_amount                                                   AS return_value,
       si.invoice_number, si.invoice_total, si.status                   AS invoice_status,
       GREATEST(COALESCE(si.invoice_total, 0)
                - COALESCE(rv.paid, 0) - COALESCE(aa.applied, 0)
                - COALESCE(rc.applied, 0), 0)                           AS effective_outstanding,
       LEAST(r.total_amount,
             GREATEST(COALESCE(si.invoice_total, 0)
                      - COALESCE(rv.paid, 0) - COALESCE(aa.applied, 0)
                      - COALESCE(rc.applied, 0), 0))                    AS would_be_unpaid_portion,
       r.total_amount - LEAST(r.total_amount,
             GREATEST(COALESCE(si.invoice_total, 0)
                      - COALESCE(rv.paid, 0) - COALESCE(aa.applied, 0)
                      - COALESCE(rc.applied, 0), 0))                    AS would_be_paid_portion
FROM   sales_returns r
LEFT   JOIN sales_invoices si ON si.invoice_number = r.linked_invoice
LEFT   JOIN (SELECT sales_invoice_id, SUM(amount) AS paid FROM sales_receipt_vouchers
             WHERE LOWER(TRIM(status)) = 'completed' GROUP BY sales_invoice_id) rv
            ON rv.sales_invoice_id = si.id
LEFT   JOIN (SELECT invoice_number, SUM(applied_amount) AS applied FROM advance_applications
             WHERE status = 'APPLIED' GROUP BY invoice_number) aa
            ON aa.invoice_number = si.invoice_number
LEFT   JOIN (SELECT invoice_number, SUM(applied_amount) AS applied
             FROM sales_return_credit_applications
             WHERE status = 'APPLIED' GROUP BY invoice_number) rc
            ON rc.invoice_number = si.invoice_number
WHERE  r.status = 'APPROVED'
  AND  r.refund_method IN ('CARD_REFUND','BANK_TRANSFER')
ORDER  BY r.return_number;

\echo '== A3. Balances BEFORE — keep this output to compare against afterwards ===='
SELECT a.code, a.name, a.balance_amount, a.balance_type,
       (SELECT COALESCE(SUM(debit_total), 0) FROM gl_account_balances g WHERE g.account_code = a.code)
            AS gl_debit_total,
       (SELECT COALESCE(SUM(credit_total), 0) FROM gl_account_balances g WHERE g.account_code = a.code)
            AS gl_credit_total,
       (SELECT COALESCE(SUM(debit_amount), 0) FROM ledger_entries l WHERE l.account_code = a.code)
            AS ledger_debit_total,
       (SELECT COALESCE(SUM(credit_amount), 0) FROM ledger_entries l WHERE l.account_code = a.code)
            AS ledger_credit_total
FROM   accounts a
WHERE  a.code IN ('1100','1200','5001','1013','1010')
ORDER  BY a.code;

\echo '== A4. Closed periods — any posting date inside one of these is refused ===='
SELECT period_name, start_date, end_date, status, closed_at, closed_by
FROM   accounting_periods
ORDER  BY start_date;

\echo '== A5. Voucher sequence state — Part B bumps these ========================='
SELECT transaction_type, branch_code, fiscal_year, last_number
FROM   voucher_sequences
WHERE  transaction_type = 'CN'
ORDER  BY branch_code, fiscal_year;

\echo '== A6. Control-account flags — decides if the safer JV route is open ======='
SELECT code, name, control_account, tax_role
FROM   accounts
WHERE  code IN ('1100','1200','5001','1013','1010')
ORDER  BY code;


-- ============================================================================
-- PART B — THE WRITE. Edit the two lists and the posting date, then run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- EDIT THESE THREE THINGS AND NOTHING ELSE.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE sr_repair_plan (return_number text, action text) ON COMMIT DROP;

-- 1. Returns to settle (post the missing -RFND). From A1: has_rfnd = false.
--    Leave out any row A2 shows with would_be_paid_portion = 0.00 — Part B refuses
--    them anyway, this just keeps the log quiet.
INSERT INTO sr_repair_plan VALUES
    ('SR-2026-0001', 'SETTLE'),
    ('SR-2026-0002', 'SETTLE'),
    ('SR-2026-0003', 'SETTLE'),
    ('SR-2026-0004', 'SETTLE'),
    ('SR-2026-0005', 'SETTLE'),
    ('SR-2026-0006', 'SETTLE'),
    ('SR-2026-0007', 'SETTLE'),
    ('SR-2026-0008', 'SETTLE');

-- 2. Returns whose goods never came back (reverse the -INV). ONLY the ones the
--    branch has confirmed. A return where the customer handed goods back is NOT
--    in this list — there the -INV entry is correct.
INSERT INTO sr_repair_plan VALUES
    ('SR-2026-0002', 'REVERSE_INV'),
    ('SR-2026-0003', 'REVERSE_INV'),
    ('SR-2026-0005', 'REVERSE_INV'),
    ('SR-2026-0007', 'REVERSE_INV'),
    ('SR-2026-0008', 'REVERSE_INV'),
    ('SR-2026-0010', 'REVERSE_INV');

-- 3. The posting date. Must be in an OPEN period (A4) or the trigger refuses it.
--    The original return dates are the honest dates but usually sit in closed
--    periods; a current date with the narration pointing back is the normal
--    compromise. This is an accounting decision, not a technical one.
CREATE TEMP TABLE sr_repair_cfg (posting_date date) ON COMMIT DROP;
INSERT INTO sr_repair_cfg VALUES (DATE '2026-10-04');

-- ---------------------------------------------------------------------------
-- Nothing below needs editing.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE sr_repair_log (
    return_number text, action text, outcome text, reference text,
    entry_number text, amount numeric(15,2), detail text
) ON COMMIT DROP;

DO $repair$
DECLARE
    v_posting_date date;
    v_plan         record;
    v_ret          record;
    v_amount       numeric(15,2);
    v_outstanding  numeric(15,2);
    v_ref          text;
    v_entry_no     text;
    v_entry_id     bigint;
    v_branch_code  text;
    v_seq          bigint;
    v_fy           integer;
    v_dr_code      text;
    v_dr_name      text;
    v_cr_code      text;
    v_cr_name      text;
    v_line         record;
    v_acc          record;
    v_net_dr       numeric(38,2);
    v_net_cr       numeric(38,2);
    v_new_bal      numeric(38,2);
    v_new_type     text;
    v_period_id    bigint;
    v_inbound      bigint;
BEGIN
    SELECT posting_date INTO v_posting_date FROM sr_repair_cfg;
    v_fy := EXTRACT(YEAR FROM v_posting_date)::int;

    SELECT id INTO v_period_id FROM accounting_periods
    WHERE v_posting_date BETWEEN start_date AND end_date
    ORDER BY id LIMIT 1;

    FOR v_plan IN SELECT * FROM sr_repair_plan ORDER BY action, return_number LOOP

        SELECT r.*, b.code AS branch_code INTO v_ret
        FROM sales_returns r LEFT JOIN branches b ON b.id = r.branch_id
        WHERE r.return_number = v_plan.return_number;

        IF NOT FOUND THEN
            INSERT INTO sr_repair_log VALUES (v_plan.return_number, v_plan.action,
                'SKIPPED', NULL, NULL, NULL, 'no such return');
            CONTINUE;
        END IF;
        IF v_ret.status <> 'APPROVED' THEN
            INSERT INTO sr_repair_log VALUES (v_plan.return_number, v_plan.action,
                'SKIPPED', NULL, NULL, NULL, 'status is ' || v_ret.status);
            CONTINUE;
        END IF;

        v_branch_code := COALESCE(v_ret.branch_code, 'HO');

        -- ------------------------------------------------------------------
        -- Decide the reference, the amount and the two accounts.
        -- ------------------------------------------------------------------
        IF v_plan.action = 'SETTLE' THEN
            v_ref := v_ret.return_number || '-RFND';

            IF v_ret.refund_method NOT IN ('CARD_REFUND','BANK_TRANSFER') THEN
                INSERT INTO sr_repair_log VALUES (v_plan.return_number, 'SETTLE',
                    'SKIPPED', v_ref, NULL, NULL,
                    'refund method ' || COALESCE(v_ret.refund_method,'(null)')
                    || ' is not settled by a -RFND entry');
                CONTINUE;
            END IF;

            -- effectiveOutstanding, mirrored from InvoiceBalanceService.
            SELECT GREATEST(COALESCE(si.invoice_total,0)
                            - COALESCE((SELECT SUM(amount) FROM sales_receipt_vouchers rv
                                        WHERE rv.sales_invoice_id = si.id
                                          AND LOWER(TRIM(rv.status)) = 'completed'), 0)
                            - COALESCE((SELECT SUM(applied_amount) FROM advance_applications aa
                                        WHERE aa.invoice_number = si.invoice_number
                                          AND aa.status = 'APPLIED'), 0)
                            - COALESCE((SELECT SUM(applied_amount) FROM sales_return_credit_applications ca
                                        WHERE ca.invoice_number = si.invoice_number
                                          AND ca.status = 'APPLIED'), 0), 0)
            INTO v_outstanding
            FROM sales_invoices si
            WHERE si.invoice_number = v_ret.linked_invoice
              AND si.status NOT IN ('CANCELLED','DRAFT');
            v_outstanding := COALESCE(v_outstanding, 0);

            v_amount := v_ret.total_amount - LEAST(v_ret.total_amount, v_outstanding);

            IF v_amount <= 0 THEN
                INSERT INTO sr_repair_log VALUES (v_plan.return_number, 'SETTLE',
                    'REFUSED', v_ref, NULL, 0,
                    'invoice ' || COALESCE(v_ret.linked_invoice,'(none)') || ' still owes '
                    || v_outstanding || ' so there is no paid portion to refund — the customer '
                    || 'was paid out AND is still billed. Needs an accounting decision first.');
                CONTINUE;
            END IF;

            v_dr_code := '1100'; v_dr_name := 'Accounts Receivable';
            IF v_ret.refund_method = 'BANK_TRANSFER' THEN
                v_cr_code := '1010'; v_cr_name := 'Bank Account';
            ELSE
                v_cr_code := '1013'; v_cr_name := 'Merchant Clearing';
            END IF;

        ELSIF v_plan.action = 'REVERSE_INV' THEN
            v_ref := v_ret.return_number || '-INVREV';

            IF NOT EXISTS (SELECT 1 FROM journal_entries
                           WHERE reference = v_ret.return_number || '-INV') THEN
                INSERT INTO sr_repair_log VALUES (v_plan.return_number, 'REVERSE_INV',
                    'SKIPPED', v_ref, NULL, NULL, 'no -INV entry exists to reverse');
                CONTINUE;
            END IF;

            -- Interlock: if stock DID come back, the -INV entry is right.
            SELECT COUNT(*) INTO v_inbound FROM stock_movements
            WHERE reference_no = v_ret.return_number AND quantity > 0;
            IF v_inbound > 0 THEN
                INSERT INTO sr_repair_log VALUES (v_plan.return_number, 'REVERSE_INV',
                    'REFUSED', v_ref, NULL, NULL,
                    v_inbound || ' inbound stock movement(s) exist, so goods DID come back and '
                    || 'the -INV entry is correct. Fix the stock side, not the GL.');
                CONTINUE;
            END IF;

            SELECT COALESCE(SUM(jl.debit), 0) INTO v_amount
            FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE je.reference = v_ret.return_number || '-INV' AND jl.account_code = '1200';

            IF v_amount <= 0 THEN
                INSERT INTO sr_repair_log VALUES (v_plan.return_number, 'REVERSE_INV',
                    'SKIPPED', v_ref, NULL, v_amount, '-INV entry has no 1200 debit');
                CONTINUE;
            END IF;

            v_dr_code := '5001'; v_dr_name := 'COGS';
            v_cr_code := '1200'; v_cr_name := 'Inventory';
        ELSE
            INSERT INTO sr_repair_log VALUES (v_plan.return_number, v_plan.action,
                'SKIPPED', NULL, NULL, NULL, 'unknown action');
            CONTINUE;
        END IF;

        -- Idempotency: same guard as PostingEngineService.findDuplicate.
        IF EXISTS (SELECT 1 FROM journal_entries WHERE reference = v_ref) THEN
            INSERT INTO sr_repair_log VALUES (v_plan.return_number, v_plan.action,
                'ALREADY_POSTED', v_ref, NULL, v_amount, 'nothing to do');
            CONTINUE;
        END IF;

        -- ------------------------------------------------------------------
        -- 1. Entry number from the branch voucher sequence (CN = credit note).
        -- ------------------------------------------------------------------
        INSERT INTO voucher_sequences (transaction_type, branch_code, fiscal_year, last_number)
        VALUES ('CN', v_branch_code, v_fy, 1)
        ON CONFLICT (transaction_type, branch_code, fiscal_year)
        DO UPDATE SET last_number = voucher_sequences.last_number + 1
        RETURNING last_number INTO v_seq;

        v_entry_no := 'CN-' || v_branch_code || '-' || v_fy || '-' || LPAD(v_seq::text, 6, '0');

        -- ------------------------------------------------------------------
        -- 2. The journal entry. entry_type SYSTEM, posted immediately, exactly
        --    as the posting engine does for every automatic entry.
        -- ------------------------------------------------------------------
        INSERT INTO journal_entries (entry_type, created_at, date, entry_number, narration,
                                     posted_at, posted_by, prepared_by, reference, status,
                                     updated_at, branch_id)
        VALUES ('SYSTEM', now(), v_posting_date, v_entry_no,
                CASE WHEN v_plan.action = 'SETTLE'
                     THEN 'Sales Return refund ' || v_ret.return_number
                          || ' (GL repair, original return date ' || v_ret.return_date || ')'
                     ELSE 'Reverse inventory leg of ' || v_ret.return_number
                          || ' - no goods returned (GL repair, original return date '
                          || v_ret.return_date || ')'
                END,
                now(), 'System', 'System', v_ref, 'Posted', now(), v_ret.branch_id)
        RETURNING id INTO v_entry_id;

        -- ------------------------------------------------------------------
        -- 3. The two lines.
        -- ------------------------------------------------------------------
        INSERT INTO journal_lines (account, account_code, debit, credit, description,
                                   journal_entry_id, branch_id, is_reconciled)
        VALUES (v_dr_name, v_dr_code, v_amount, 0,
                CASE WHEN v_plan.action = 'SETTLE'
                     THEN 'Settle return by ' || v_cr_name
                     ELSE 'Restore COGS - no goods returned on ' || v_ret.return_number END,
                v_entry_id, v_ret.branch_id, false),
               (v_cr_name, v_cr_code, 0, v_amount,
                CASE WHEN v_plan.action = 'SETTLE'
                     THEN 'Refund paid for ' || v_ret.return_number
                     ELSE 'Reverse inventory increase for ' || v_ret.return_number END,
                v_entry_id, v_ret.branch_id, false);

        -- ------------------------------------------------------------------
        -- 4 + 5 + 6. Per line: advance accounts, write ledger_entries with the
        --    running balance, upsert gl_account_balances. Order and arithmetic
        --    lifted from LedgerService.recordTransaction and applyGlBalanceDelta.
        -- ------------------------------------------------------------------
        FOR v_line IN
            SELECT * FROM journal_lines WHERE journal_entry_id = v_entry_id ORDER BY id
        LOOP
            SELECT code, name, COALESCE(balance_amount, 0) AS balance_amount,
                   COALESCE(balance_type, 'Dr') AS balance_type, cost_center_code
            INTO v_acc FROM accounts WHERE code = v_line.account_code FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Account code % not found — chart of accounts differs from '
                    'the expected one, aborting.', v_line.account_code;
            END IF;

            v_net_dr := CASE WHEN v_acc.balance_type = 'Dr' THEN v_acc.balance_amount ELSE 0 END
                        + v_line.debit;
            v_net_cr := CASE WHEN v_acc.balance_type = 'Cr' THEN v_acc.balance_amount ELSE 0 END
                        + v_line.credit;

            IF v_net_dr >= v_net_cr THEN
                v_new_bal := v_net_dr - v_net_cr; v_new_type := 'Dr';
            ELSE
                v_new_bal := v_net_cr - v_net_dr; v_new_type := 'Cr';
            END IF;

            UPDATE accounts SET balance_amount = v_new_bal, balance_type = v_new_type
            WHERE code = v_line.account_code;

            -- Cost-center spend, debit side only, as recordTransaction step 4 does.
            IF v_line.debit > 0 AND v_acc.cost_center_code IS NOT NULL
               AND v_acc.cost_center_code <> '-' THEN
                UPDATE cost_centers SET spent = COALESCE(spent, 0) + v_line.debit
                WHERE code = v_acc.cost_center_code;
            END IF;

            INSERT INTO ledger_entries (id, account_code, account_name, balance_type, cost_center,
                                        credit_amount, debit_amount, description, journal_id,
                                        is_reconciled, running_balance, transaction_date, type,
                                        voucher_no, branch_id)
            VALUES (gen_random_uuid()::text, v_line.account_code, v_acc.name, v_new_type,
                    v_line.cost_center, v_line.credit, v_line.debit, v_line.description,
                    v_entry_id::text, false, v_new_bal, v_posting_date,
                    CASE WHEN v_line.debit > 0 THEN 'Debit' ELSE 'Credit' END,
                    v_entry_no, v_ret.branch_id);

            INSERT INTO gl_account_balances (account_code, branch_id, fiscal_period_id,
                                             debit_total, credit_total, closing_balance, last_updated)
            VALUES (v_line.account_code, v_ret.branch_id, v_period_id,
                    v_line.debit, v_line.credit, v_line.debit - v_line.credit, now())
            ON CONFLICT (account_code, fiscal_period_id, branch_id) DO UPDATE
            SET debit_total     = gl_account_balances.debit_total  + EXCLUDED.debit_total,
                credit_total    = gl_account_balances.credit_total + EXCLUDED.credit_total,
                closing_balance = (gl_account_balances.debit_total  + EXCLUDED.debit_total)
                                - (gl_account_balances.credit_total + EXCLUDED.credit_total),
                last_updated    = now();
        END LOOP;

        INSERT INTO sr_repair_log VALUES (v_plan.return_number, v_plan.action, 'POSTED',
            v_ref, v_entry_no, v_amount,
            'Dr ' || v_dr_code || ' / Cr ' || v_cr_code);
    END LOOP;
END
$repair$;

\echo '== B1. What happened — read this before deciding to commit ================='
SELECT * FROM sr_repair_log ORDER BY action, return_number;

\echo '== B2. Every entry written here balances (must return zero rows) ==========='
SELECT je.entry_number, je.reference,
       SUM(jl.debit) AS total_debit, SUM(jl.credit) AS total_credit
FROM   journal_entries je
JOIN   journal_lines jl ON jl.journal_entry_id = je.id
WHERE  je.reference IN (SELECT reference FROM sr_repair_log WHERE outcome = 'POSTED')
GROUP  BY je.entry_number, je.reference
HAVING SUM(jl.debit) <> SUM(jl.credit);

\echo '== B3. accounts vs ledger_entries vs gl_account_balances ==================='
-- The three surfaces must have moved by the same amounts. Compare the deltas against
-- what A3 printed before the run.
SELECT a.code, a.name, a.balance_amount, a.balance_type,
       (SELECT COALESCE(SUM(debit_total), 0) FROM gl_account_balances g WHERE g.account_code = a.code)
            AS gl_debit_total,
       (SELECT COALESCE(SUM(credit_total), 0) FROM gl_account_balances g WHERE g.account_code = a.code)
            AS gl_credit_total,
       (SELECT COALESCE(SUM(debit_amount), 0) FROM ledger_entries l WHERE l.account_code = a.code)
            AS ledger_debit_total,
       (SELECT COALESCE(SUM(credit_amount), 0) FROM ledger_entries l WHERE l.account_code = a.code)
            AS ledger_credit_total
FROM   accounts a
WHERE  a.code IN ('1100','1200','5001','1013','1010')
ORDER  BY a.code;

-- ---------------------------------------------------------------------------
-- Rehearse with ROLLBACK. Swap to COMMIT only once B1/B2/B3 all read correctly.
-- ---------------------------------------------------------------------------
ROLLBACK;
-- COMMIT;
