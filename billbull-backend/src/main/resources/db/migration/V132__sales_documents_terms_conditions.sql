-- V132 — Terms & Conditions on Quotations, Sales Orders, Proforma Invoices and Delivery Notes.
--
-- Same model as V131 (Sales Invoice): each document keeps the terms it was issued with, pre-filled
-- from the default print template of its category and editable per document. Nullable: existing
-- documents stay NULL and keep printing the template's terms, exactly as before.
-- Additive and idempotent (to_regclass guards, IF NOT EXISTS); V131 is the highest applied version.

DO $$
BEGIN
    IF to_regclass('public.sales_quotations') IS NOT NULL THEN
        ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
    END IF;
    IF to_regclass('public.sales_orders') IS NOT NULL THEN
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
    END IF;
    IF to_regclass('public.proforma_invoices') IS NOT NULL THEN
        ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
    END IF;
    IF to_regclass('public.delivery_notes') IS NOT NULL THEN
        ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
    END IF;
END $$;
