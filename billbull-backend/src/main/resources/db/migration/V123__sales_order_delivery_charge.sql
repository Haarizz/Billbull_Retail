-- V123 — Delivery charge on Sales Orders.
--
-- A flat, untaxed charge for delivering the order, included in order_total, with the same meaning
-- as sales_invoices.delivery_charge (which it becomes when the order is invoiced or sent out from
-- the POS). Nullable: existing orders have no charge and their totals are unchanged.
-- Additive and idempotent (to_regclass guard, IF NOT EXISTS); V122 (branch default purchase tax rate) is the highest applied version.

DO $$
BEGIN
    IF to_regclass('public.sales_orders') IS NOT NULL THEN
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(15, 2);
    END IF;
END $$;
