-- V44 — Rename PosSettings.defaultTaxRate to branchDefaultVatRate for clarity.
--
-- "defaultTaxRate" was ambiguous (default for what?). The field represents the branch's
-- fallback VAT rate, used only when a product has no Sales Tax of its own configured.
-- Renamed to branch_default_vat_rate to make that unambiguous everywhere (entity, DTOs,
-- frontend, UI labels). A plain column rename preserves existing per-branch values.
--
-- Guarded (to_regclass / information_schema check) so it's a no-op on any tenant DB where
-- the table doesn't exist yet, or has already been renamed, or never had the old column.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'pos_settings' AND column_name = 'default_tax_rate'
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'pos_settings' AND column_name = 'branch_default_vat_rate'
        ) THEN
            ALTER TABLE public.pos_settings RENAME COLUMN default_tax_rate TO branch_default_vat_rate;
        END IF;
    END IF;
END $$;
