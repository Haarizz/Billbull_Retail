-- V131 — Terms & Conditions on Sales Invoices.
--
-- Each invoice keeps the terms it was issued with. New invoices are pre-filled from the default
-- Sales Invoice print template (print_templates.terms_content) and can be edited per invoice.
-- Nullable: existing invoices stay NULL and keep printing the template's terms, exactly as before.
-- Additive and idempotent (to_regclass guard, IF NOT EXISTS); V130 is the highest applied version.

DO $$
BEGIN
    IF to_regclass('public.sales_invoices') IS NOT NULL THEN
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
    END IF;
END $$;
