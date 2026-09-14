-- Brands used a single `active` column for two different things: the user-facing Active/Inactive
-- status AND soft-deletion. Setting a brand Inactive therefore removed it from the list entirely,
-- so the list's "Inactive" status filter could never match a row.
--
-- Split them: `deleted` now carries soft-deletion, `active` keeps only the user-facing status.
-- Existing active = false rows are migrated to deleted = true, which preserves exactly what those
-- rows look like today (hidden); nothing silently reappears in a list on upgrade.
DO $$
BEGIN
    IF to_regclass('public.brands') IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'deleted') THEN
        ALTER TABLE public.brands ADD COLUMN deleted boolean NOT NULL DEFAULT false;
        UPDATE public.brands SET deleted = true WHERE active = false;
    END IF;
END $$;
