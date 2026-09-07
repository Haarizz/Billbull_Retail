-- Units are soft-deleted (is_active = false), but the partial unique indexes created by V37
-- (ux_units_name_global / _branch, ux_units_symbol_global / _branch) have no is_active predicate.
-- A soft-deleted unit therefore keeps holding its name and symbol forever: re-creating "Packet"
-- after deleting "Packet" passes the service check (which filters on isActive = true) and then
-- fails on the DB index, surfacing as the 409 "already in use, possibly by a previously deleted
-- record" message.
--
-- Rebuild the four indexes with `AND is_active` so uniqueness only covers live rows, matching what
-- UnitService.create already enforces in Java. Idempotent: drops by exact name and recreates.
DO $$
DECLARE
    col text;
BEGIN
    IF to_regclass('public.units') IS NULL THEN
        RETURN;
    END IF;

    -- Schema drift guard — nothing to do safely if either column is missing.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'is_active')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'branch_id') THEN
        RETURN;
    END IF;

    FOREACH col IN ARRAY ARRAY['name', 'symbol'] LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', 'ux_units_' || col || '_global');
        EXECUTE format('DROP INDEX IF EXISTS public.%I', 'ux_units_' || col || '_branch');

        -- Global tier: unique among live branch-less (shared) rows.
        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.units (%I) WHERE branch_id IS NULL AND is_active',
            'ux_units_' || col || '_global', col);

        -- Branch tier: unique per (col, branch_id) among live branch-owned rows.
        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.units (%I, branch_id) WHERE branch_id IS NOT NULL AND is_active',
            'ux_units_' || col || '_branch', col);

        RAISE NOTICE 'V97: rebuilt units unique indexes on % with is_active predicate', col;
    END LOOP;
END $$;
