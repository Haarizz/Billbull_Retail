-- V37 — Branch-Level Inventory, Phase 6A (part 2 of 2): per-branch + global-null uniqueness.
--
-- Replaces the GLOBAL unique constraints on master-data business keys with PAIRED PARTIAL UNIQUE
-- INDEXES so that:
--   * global (branch_id IS NULL) rows stay unique among themselves   -> ux_<t>_<col>_global
--   * each branch may reuse a key exactly once (branch_id IS NOT NULL) -> ux_<t>_<col>_branch
-- Existing data is entirely branch_id NULL, so the global-tier index is satisfied immediately and
-- nothing is rejected. This is the ONLY non-purely-additive step in the whole topic: it DROPS the
-- global unique constraints — but no data is deleted, and the replacement indexes are
-- stricter-or-equal for the existing (all-null) rows.
--
-- Runs AFTER V36 (branch_id must already exist on these tables).
--
-- DYNAMIC CONSTRAINT NAMES: Hibernate names unique constraints uk<hash>, which differ per schema
-- and per tenant. We therefore NEVER hard-code a constraint name — for each (table, column-set)
-- target we look up the matching contype='u' constraint by its EXACT column set and drop that.
-- Dropping the constraint also drops its backing unique index. Guarded + idempotent throughout.
--
-- Targets (business keys only; brand.barcode, barcode_templates.system_key, product_barcodes.barcode
-- are intentionally NOT relaxed here — they are not per-branch business codes):
--   products(code) · departments(code) · sub_departments(code) · sub_departments(name,department_id)
--   · brands(code) · brands(name) · units(name) · units(symbol)

DO $$
DECLARE
    target      record;
    conname     text;
    ix_global   text;
    ix_branch   text;
    col_key     text;   -- underscore-joined column list for index naming
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            ('products',        ARRAY['code']),
            ('departments',     ARRAY['code']),
            ('sub_departments', ARRAY['code']),
            ('sub_departments', ARRAY['name','department_id']),
            ('brands',          ARRAY['code']),
            ('brands',          ARRAY['name']),
            ('units',           ARRAY['name']),
            ('units',           ARRAY['symbol'])
        ) AS t(tbl, cols)
    LOOP
        -- Skip a table absent on this tenant/DB.
        CONTINUE WHEN to_regclass('public.' || target.tbl) IS NULL;

        -- Skip if any target column is missing (schema drift) — nothing to relax safely.
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM unnest(target.cols) c
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=target.tbl AND column_name=c));

        -- All targets require branch_id (added by V36); skip defensively if it's absent.
        CONTINUE WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name=target.tbl AND column_name='branch_id');

        col_key := array_to_string(target.cols, '_');

        -- 1) Find the GLOBAL unique constraint on exactly this column set and drop it (name-agnostic).
        --    Matches a contype='u' constraint whose set of column names equals target.cols.
        SELECT con.conname INTO conname
        FROM pg_constraint con
        WHERE con.contype = 'u'
          AND con.conrelid = ('public.' || target.tbl)::regclass
          AND (
                SELECT array_agg(att.attname::text ORDER BY att.attname::text)
                FROM unnest(con.conkey) k
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
              ) = (SELECT array_agg(c ORDER BY c) FROM unnest(target.cols) c)
        LIMIT 1;

        IF conname IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', target.tbl, conname);
            RAISE NOTICE 'V37: dropped global unique % on %(%)', conname, target.tbl, array_to_string(target.cols, ',');
        END IF;

        -- 1b) Also drop a bare UNIQUE INDEX on exactly this column set that is NOT tied to a
        --     constraint (e.g. Hibernate @Column(unique=true) sometimes yields a standalone index).
        FOR conname IN
            SELECT ix.relname
            FROM pg_index i
            JOIN pg_class ix  ON ix.oid = i.indexrelid
            JOIN pg_class tb  ON tb.oid = i.indrelid
            WHERE i.indisunique
              AND NOT i.indisprimary
              AND tb.relname = target.tbl
              AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
              AND (
                    SELECT array_agg(att.attname::text ORDER BY att.attname::text)
                    FROM unnest(i.indkey) k
                    JOIN pg_attribute att ON att.attrelid = i.indrelid AND att.attnum = k
                  ) = (SELECT array_agg(c ORDER BY c) FROM unnest(target.cols) c)
        LOOP
            EXECUTE format('DROP INDEX IF EXISTS public.%I', conname);
            RAISE NOTICE 'V37: dropped standalone unique index % on %(%)', conname, target.tbl, array_to_string(target.cols, ',');
        END LOOP;

        -- 2) Create the paired partial unique indexes (idempotent).
        ix_global := 'ux_' || target.tbl || '_' || col_key || '_global';
        ix_branch := 'ux_' || target.tbl || '_' || col_key || '_branch';

        -- Global tier: unique among branch-less (shared) rows.
        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%s) WHERE branch_id IS NULL',
            ix_global, target.tbl,
            (SELECT string_agg(quote_ident(c), ', ') FROM unnest(target.cols) c));

        -- Branch tier: unique per (cols, branch_id) among branch-owned rows.
        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%s, branch_id) WHERE branch_id IS NOT NULL',
            ix_branch, target.tbl,
            (SELECT string_agg(quote_ident(c), ', ') FROM unnest(target.cols) c));

        RAISE NOTICE 'V37: created % + % on %(%)', ix_global, ix_branch, target.tbl, array_to_string(target.cols, ',');
    END LOOP;
END $$;
