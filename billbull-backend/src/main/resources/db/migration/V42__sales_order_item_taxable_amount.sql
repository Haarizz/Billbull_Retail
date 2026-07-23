-- V42 — Sales Order line-item financial snapshot: add taxable_amount.
--
-- POS "Save as Order" now persists the full per-line tax snapshot (price, discount,
-- taxRate, taxableAmount, taxAmount, lineTotal) instead of a self-cancelling taxAmount
-- formula that always evaluated to 0. taxable_amount (net-of-discount, pre-tax base the
-- tax % is applied to) had no column to land in — Hibernate ddl-auto would add it on next
-- boot, but per project convention new columns get an explicit, additive migration.
--
-- ADDITIVE + NULLABLE only, idempotent (IF NOT EXISTS / to_regclass guard).

DO $$
BEGIN
    IF to_regclass('public.sales_order_items') IS NOT NULL THEN
        ALTER TABLE public.sales_order_items
            ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(15,2);
    END IF;
END $$;
