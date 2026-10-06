-- V116 — Indexes behind the global search modal's activity-ranked preview.
--
-- Opening the modal with an empty box now shows each category's MOST ACTIVE rows rather
-- than its first few alphabetically: products by stock movements, customers by sales
-- invoices, vendors by LPOs, ledger accounts by journal lines, employees by POS sessions.
-- Each ranking is "count the rows in the last 90 days, GROUP BY the entity key".
--
-- Those are the five reads this script exists for. Without them every ranking is a
-- sequential scan of its transaction table on every modal open — unnoticeable on a small
-- tenant, a full scan of millions of rows on a large one. Each index leads with the
-- timestamp the window filters on and carries the grouping key, so the plan narrows to
-- the window first and aggregates from the index.
--
-- Existing indexes that do NOT serve these queries, and why:
--   idx_sm_product_source_created (product_id, source_type, created_at) — created_at is
--     the third column, so it cannot narrow a created_at-leading filter.
--   idx_journal_line_account_code (account_code) — no timestamp; the window lives on
--     journal_entries, which had no index on created_at at all.
--
-- Additive and idempotent, guarded the same way as every other script here. Indexes only —
-- no table, column or data is touched, so this is safe to run on a live tenant.

DO $$
BEGIN
    -- Products ranked over the stock-movement ledger.
    IF to_regclass('public.stock_movements') IS NOT NULL
       AND to_regclass('public.idx_sm_created_product') IS NULL THEN
        CREATE INDEX idx_sm_created_product ON stock_movements (created_at, product_id);
    END IF;

    -- Customers ranked over sales invoices.
    IF to_regclass('public.sales_invoices') IS NOT NULL
       AND to_regclass('public.idx_sales_invoice_created_customer') IS NULL THEN
        CREATE INDEX idx_sales_invoice_created_customer
            ON sales_invoices (created_at, customer_code);
    END IF;

    -- Vendors ranked over LPOs.
    IF to_regclass('public.lpos') IS NOT NULL
       AND to_regclass('public.idx_lpo_created_vendor') IS NULL THEN
        CREATE INDEX idx_lpo_created_vendor ON lpos (created_at, vendor_id);
    END IF;

    -- Ledger accounts ranked over journal lines. The window filter sits on the entry, so
    -- the entry side is what needs the index; the line side already has
    -- idx_journal_line_entry_id for the join and idx_journal_line_account_code for the key.
    IF to_regclass('public.journal_entries') IS NOT NULL
       AND to_regclass('public.idx_journal_entry_created') IS NULL THEN
        CREATE INDEX idx_journal_entry_created ON journal_entries (created_at);
    END IF;

    -- Employees ranked over POS sessions. opened_at, not created_at: a session is ranked
    -- by when it was opened for trading, which is what PosSessionRepository filters on.
    IF to_regclass('public.pos_sessions') IS NOT NULL
       AND to_regclass('public.idx_pos_session_opened_owner') IS NULL THEN
        CREATE INDEX idx_pos_session_opened_owner
            ON pos_sessions (opened_at, owner_user_id);
    END IF;
END $$;
