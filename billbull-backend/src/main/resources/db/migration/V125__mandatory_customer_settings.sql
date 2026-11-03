-- V125 — Mandatory customer selection.
--
--   pos_settings.require_customer                       per branch (POS Console > Behavior): a POS
--                                                       sale cannot be settled for the walk-in customer
--   sales_settings.customer_required_on_sales_invoice   tenant-wide (Sales > Configure & customize):
--                                                       back-office Sales Invoices must name a real customer
--
-- Both default to false, so existing tenants behave exactly as before.
-- Additive and idempotent (to_regclass guards, IF NOT EXISTS). V124 is the highest version before this.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS require_customer BOOLEAN DEFAULT FALSE;
    END IF;

    IF to_regclass('public.sales_settings') IS NOT NULL THEN
        ALTER TABLE sales_settings
            ADD COLUMN IF NOT EXISTS customer_required_on_sales_invoice boolean NOT NULL DEFAULT false;
    END IF;
END $$;
