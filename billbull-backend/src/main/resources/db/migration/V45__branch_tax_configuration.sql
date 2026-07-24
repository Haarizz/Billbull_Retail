-- V45 — Move tax configuration ownership from PosSettings to a dedicated Branch-level
-- BranchTaxConfiguration table. Tax (Tax Enabled / Tax Mode / Branch Default VAT Rate) is a
-- branch-wide ERP configuration used by POS, Sales Invoice, Quotation, Sales Order, Delivery
-- Note, Proforma, Product Pricing, Financials, and Reports — not a POS-specific setting.
--
-- Steps:
--   1. Create branch_tax_configuration (one row per branch, mirrors the pos_settings pattern).
--   2. Backfill from pos_settings (branch_default_vat_rate, tax_inclusive) for every branch that
--      already has a pos_settings row, preserving existing customer configuration exactly.
--      tax_enabled is new — every migrated branch defaults to true (tax was always effectively
--      "on" before this refactor), so behavior is unchanged for existing branches.
--   3. Drop the now-superseded columns from pos_settings — POS Settings no longer owns these
--      values; BranchTaxConfiguration (via BranchTaxResolutionService) is the single source of
--      truth from this point on.
--
-- Fully guarded/idempotent (to_regclass + information_schema checks) so it's a no-op on any
-- tenant DB where a table/column is missing or the migration has already partially applied.

CREATE TABLE IF NOT EXISTS public.branch_tax_configuration (
    id                       BIGSERIAL PRIMARY KEY,
    branch_id                BIGINT NOT NULL UNIQUE,
    tax_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    tax_inclusive            BOOLEAN NOT NULL DEFAULT FALSE,
    branch_default_vat_rate  DOUBLE PRECISION DEFAULT 0,
    created_at               TIMESTAMP,
    created_by               VARCHAR(255),
    updated_at               TIMESTAMP,
    updated_by               VARCHAR(255),
    is_active                BOOLEAN DEFAULT TRUE
);

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'pos_settings' AND column_name = 'branch_default_vat_rate'
       ) THEN
        INSERT INTO public.branch_tax_configuration
            (branch_id, tax_enabled, tax_inclusive, branch_default_vat_rate, created_at, updated_at, is_active)
        SELECT
            ps.branch_id,
            TRUE,
            COALESCE(ps.tax_inclusive, FALSE),
            COALESCE(ps.branch_default_vat_rate, 0),
            now(),
            now(),
            TRUE
        FROM public.pos_settings ps
        WHERE ps.branch_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.branch_tax_configuration btc WHERE btc.branch_id = ps.branch_id
          );
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE public.pos_settings DROP COLUMN IF EXISTS branch_default_vat_rate;
        ALTER TABLE public.pos_settings DROP COLUMN IF EXISTS tax_inclusive;
    END IF;
END $$;
