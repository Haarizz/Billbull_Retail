-- V122 — Branch Default Purchase Tax Rate on branch_tax_configuration.
-- Mirrors branch_default_vat_rate for the purchasing side: LPO / GRN / Purchase Invoice lines
-- whose product has no Purchase Tax configured now fall back to this rate (see
-- PurchaseTaxResolutionService). Defaults to 0 so existing branches behave exactly as before
-- (unconfigured product Purchase Tax resolved to 0%).
--
-- Guarded/idempotent: no-op when the table is missing or the column already exists.

DO $$
BEGIN
    IF to_regclass('public.branch_tax_configuration') IS NOT NULL THEN
        ALTER TABLE public.branch_tax_configuration
            ADD COLUMN IF NOT EXISTS branch_default_purchase_tax_rate DOUBLE PRECISION DEFAULT 0;
    END IF;
END $$;
