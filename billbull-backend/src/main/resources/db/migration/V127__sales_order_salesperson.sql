-- V127 — Salesperson on Sales Orders.
--
-- The employee the order is attributed to, with the same meaning and shape as
-- sales_invoices.salesperson_employee_id/_code/_name. When the order is invoiced (back office) or
-- taken up at the POS (checkout, Process Delivery, PI Flow), the invoice inherits it, so the sale
-- counts toward that employee's performance and commission. Nullable: existing orders stay
-- unattributed. Additive and idempotent (to_regclass guard, IF NOT EXISTS); V126 (price levels)
-- is the highest applied version.

DO $$
BEGIN
    IF to_regclass('public.sales_orders') IS NOT NULL THEN
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS salesperson_employee_id BIGINT;
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS salesperson_employee_code VARCHAR(100);
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(200);
    END IF;
END $$;
