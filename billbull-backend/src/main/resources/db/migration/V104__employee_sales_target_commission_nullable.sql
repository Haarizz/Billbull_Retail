-- employee_sales_targets.commission_rate: NULL now means "commission not configured".
--
-- V101 created the column as `numeric(5,2) NOT NULL DEFAULT 0`, which cannot express the
-- difference between:
--
--     0.00   commission configured, and the rate is zero   -> a COMPLETE configuration
--     NULL   commission never configured                   -> an INCOMPLETE configuration
--
-- Phase 2's target-readiness rule has to tell those apart: a deliberate 0% commission must not
-- block POS sales, an unset one must. Dropping NOT NULL and the DEFAULT is what makes the
-- distinction representable.
--
-- EXISTING DATA IS NOT REWRITTEN. Every current zero stays an explicit zero, because the only
-- writer that has ever existed (the Set Targets grid) always sent a number — those rows are
-- configured-zero, not placeholders. Converting them to NULL would fabricate a blocking condition
-- for tenants who did nothing wrong. Admins who genuinely never configured commission for an
-- employee will find no target row for them at all, which readiness already reports as missing.
--
-- Guarded and idempotent: re-running is a no-op, and a tenant whose table does not exist yet gets
-- the nullable column from the JPA entity instead.
DO $$
BEGIN
    IF to_regclass('public.employee_sales_targets') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE public.employee_sales_targets
        ALTER COLUMN commission_rate DROP DEFAULT;

    ALTER TABLE public.employee_sales_targets
        ALTER COLUMN commission_rate DROP NOT NULL;
END $$;
