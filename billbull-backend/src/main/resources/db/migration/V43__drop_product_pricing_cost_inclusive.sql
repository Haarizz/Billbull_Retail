-- V43 — Remove the dead "Cost Inclusive of Tax" flag from product_pricing.
--
-- is_cost_inclusive was stored, loaded, and round-tripped through the API/UI but never
-- consumed by any pricing, costing, inventory, purchasing, or financial calculation.
-- All application references (entity, DTO mapping, import/export, frontend checkbox)
-- have been removed; the column itself was never tracked by an earlier Flyway migration
-- (added ad hoc by Hibernate ddl-auto=update), so this migration retires it explicitly.
--
-- Guarded (to_regclass / IF EXISTS) so it's a no-op on any tenant DB where the table or
-- column doesn't exist.

DO $$
BEGIN
    IF to_regclass('public.product_pricing') IS NOT NULL THEN
        ALTER TABLE public.product_pricing
            DROP COLUMN IF EXISTS is_cost_inclusive;
    END IF;
END $$;
