-- Sales Settings: the "SalesPerson & SetTargets" group on Sales → Configure & customize.
--
-- Three independent tenant-level switches on the existing sales_settings singleton (id = 1):
--
--   salesperson_required_at_pos          every POS sale must carry a barcode-verified,
--                                        eligible salesperson before it may settle
--   salesperson_required_at_back_office  back-office Sales Invoices offer an eligible-salesperson
--                                        selector (manual, no barcode)
--   monthly_target_required              block POS sales until EVERY active salesperson-eligible
--                                        employee has a current-month target + an explicitly
--                                        configured commission rate
--
-- All three default to FALSE, so every existing tenant keeps its current behaviour until an admin
-- turns one on. NOT NULL with a DEFAULT so the pre-existing singleton row backfills to false in
-- the same statement rather than needing a separate UPDATE.
--
-- Additive, guarded and idempotent. Nothing existing is read, rewritten or dropped.
DO $$
BEGIN
    IF to_regclass('public.sales_settings') IS NULL THEN
        -- Table not created yet on this tenant (Hibernate ddl-auto will create it with these
        -- columns from the entity's columnDefinition). Nothing to alter.
        RETURN;
    END IF;

    ALTER TABLE public.sales_settings
        ADD COLUMN IF NOT EXISTS salesperson_required_at_pos
            boolean NOT NULL DEFAULT false;

    ALTER TABLE public.sales_settings
        ADD COLUMN IF NOT EXISTS salesperson_required_at_back_office
            boolean NOT NULL DEFAULT false;

    ALTER TABLE public.sales_settings
        ADD COLUMN IF NOT EXISTS monthly_target_required
            boolean NOT NULL DEFAULT false;
END $$;
