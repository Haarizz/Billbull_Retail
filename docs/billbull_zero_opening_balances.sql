-- =====================================================================================
-- BillBull — Zero the Chart-of-Accounts opening balances
-- =====================================================================================
-- Companion to billbull_transactional_reset.sql. Run this AFTER that reset, when the
-- Financials → Ledgers tiles still show non-zero Assets / Liabilities / Equity / Expenses
-- even though every leaf account reads 0.00 and the General Ledger is empty.
--
-- WHY THOSE TILES ARE NON-ZERO
--   The tiles sum accounts.balance_amount — the legacy per-account opening-balance field
--   (Account.balanceAmount). It is NOT derived from journal_lines, so clearing the GL
--   leaves it untouched. Every GL-derived view (COA tree, Trial Balance, Balance Sheet)
--   correctly reads zero; only this stored column keeps the old figures alive.
--
-- WHY A JOURNAL VOUCHER REAPPEARED AFTER THE RESET
--   Saving Financials → Ledgers → opening balances calls
--   POST /api/.../accounts/opening-balance, which does two things:
--     1. LedgerService.saveOpeningBalances()  -> writes accounts.balance_amount
--     2. PostingEngineService.postOpeningBalances() -> posts a real double-entry JV
--        ("Opening balance - <code>" + "Plug - Opening Entry <year>" against Retained
--        Earnings), idempotent per year under reference 'OB-<year>'.
--   Deleting that JV without zeroing balance_amount is pointless: the next save of that
--   screen recreates it. Both halves are cleared here, in one transaction.
--
--   Note the idempotency guard cuts both ways — postOpeningBalances() short-circuits on
--   an existing 'OB-<year>' reference, so the JV must be deleted (not just zeroed) or a
--   later, legitimate opening-balance entry for the same year would be silently skipped.
--
-- SAFETY
--   * Chart of accounts itself is untouched — account rows, codes, hierarchy, types and
--     all configuration flags survive. Only the stored balance figure is zeroed.
--   * Runs in ONE transaction ending in ROLLBACK. Read the Section 2 output, then swap
--     the last statement to COMMIT.
--   * NEVER PASTE THIS INTO AN INTERACTIVE psql SESSION. Run it only as:
--       psql -v ON_ERROR_STOP=1 -d <db> -f billbull_zero_opening_balances.sql
--   * Take a backup first:  pg_dump -Fc -d <db> -f pre_zero_ob.dump
--   * Stop the backend, or at least make sure nobody has the Ledgers screen open.
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — BEFORE (read-only; run this first and keep the output)
-- =====================================================================================
SELECT account_group,
       count(*)                                        AS accounts,
       count(*) FILTER (WHERE COALESCE(balance_amount,0) <> 0) AS with_balance,
       SUM(COALESCE(balance_amount,0))                 AS total_balance_amount
  FROM public.accounts
 GROUP BY account_group
 ORDER BY 1;

SELECT code, name, account_group, balance_amount, balance_type
  FROM public.accounts
 WHERE COALESCE(balance_amount,0) <> 0
 ORDER BY account_group, code;

SELECT id, entry_number, date, reference, narration, status
  FROM public.journal_entries
 ORDER BY id;


-- =====================================================================================
-- SECTION 1 — ZERO THEM
-- =====================================================================================
BEGIN;

SET LOCAL lock_timeout = '10s';

-- 1.1  Remove the opening-balance journal(s) and everything derived from them.
--      After the main reset the GL should hold nothing else, so these deletes are
--      scoped to the whole GL deliberately: the target state is an empty ledger.
--      To remove ONLY opening-balance journals and keep anything else that has been
--      posted since, replace 1.1 with the narrower block in the comment underneath.
DELETE FROM public.journal_lines;      -- deferred double-entry trigger passes at 0 = 0
DELETE FROM public.journal_entries;
DELETE FROM public.ledger_entries;
DELETE FROM public.gl_account_balances;  -- SUM(journal_lines) cache; rebuilds from empty
DELETE FROM public.voucher_sequences;    -- per branch/FY numbering, so JV numbering restarts

-- NARROWER ALTERNATIVE — use instead of the five statements above if the GL contains
-- other journals you want to keep:
--   DELETE FROM public.journal_lines
--    WHERE journal_entry_id IN (SELECT id FROM public.journal_entries
--                                WHERE reference LIKE 'OB-%');
--   DELETE FROM public.journal_entries WHERE reference LIKE 'OB-%';
--   -- then re-derive gl_account_balances, and prune ledger_entries by voucher number.

-- 1.2  Zero the legacy stored opening balance on every account.
--      balance_type is set to NULL: with a zero amount the Dr/Cr side is meaningless,
--      and leaving a stale 'Dr'/'Cr' makes the Ledgers form re-submit a direction.
UPDATE public.accounts
   SET balance_amount = 0,
       balance_type   = NULL
 WHERE COALESCE(balance_amount, 0) <> 0
    OR balance_type IS NOT NULL;


-- =====================================================================================
-- SECTION 2 — VALIDATION (inside the still-open transaction)
-- Every row must read PASS.
-- =====================================================================================
WITH checks(label, n) AS (
  SELECT 'accounts with a non-zero stored balance',
         (SELECT count(*) FROM public.accounts WHERE COALESCE(balance_amount,0) <> 0)
  UNION ALL SELECT 'accounts with a leftover balance_type',
         (SELECT count(*) FROM public.accounts WHERE balance_type IS NOT NULL)
  UNION ALL SELECT 'journal entries remaining',
         (SELECT count(*) FROM public.journal_entries)
  UNION ALL SELECT 'journal lines remaining',
         (SELECT count(*) FROM public.journal_lines)
  UNION ALL SELECT 'ledger entries remaining',
         (SELECT count(*) FROM public.ledger_entries)
  UNION ALL SELECT 'gl account balances remaining',
         (SELECT count(*) FROM public.gl_account_balances)
  UNION ALL SELECT 'voucher sequences remaining',
         (SELECT count(*) FROM public.voucher_sequences)
)
SELECT label, n AS remaining, CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM checks ORDER BY 3 DESC, 1;

-- The chart of accounts itself must be fully intact.
SELECT count(*) AS accounts_still_present,
       count(*) FILTER (WHERE is_group)     AS group_accounts,
       count(*) FILTER (WHERE NOT is_group) AS leaf_accounts,
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL — accounts were deleted!' END AS result
  FROM public.accounts;


-- =====================================================================================
-- Swap these two lines once Section 2 reads all PASS, then re-run.
-- =====================================================================================
ROLLBACK;
-- COMMIT;


-- =====================================================================================
-- SECTION 3 — AFTER COMMIT
-- =====================================================================================
-- 1. Restart the backend so nothing holds a cached balance.
-- 2. Reload Financials → Ledgers. All five tiles (Assets, Liabilities, Income, Expenses,
--    Equity) should read 0, the COA tree should read 0.00 on every node, and both the
--    General Ledger and Journal Voucher screens should be empty.
-- 3. When the client is ready to enter real opening balances, use the Ledgers →
--    opening-balance screen ONCE. It will write accounts.balance_amount and post a fresh
--    'OB-<year>' journal in the same action, keeping the tiles and the GL in agreement.
-- =====================================================================================
