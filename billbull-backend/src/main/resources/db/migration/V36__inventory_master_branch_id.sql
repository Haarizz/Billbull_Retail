-- V36 — Branch-Level Inventory, Phase 6A (part 1 of 2): nullable branch_id on master-data tables.
--
-- Adds a NULLABLE branch_id to the inventory master tables that lack one, each backed by a guarded
-- FK to branches and a (branch_id) index. (products + warehouses already have branch_id.) This is
-- purely additive and behaviourally inert — no read path consults these columns until Phase 6B
-- (gated by inventory.branch-scope.enabled). No backfill: existing master rows stay branch_id NULL
-- = shared/global, visible in every branch (the confirmed backward-compatibility decision).
--
-- Runs BEFORE V37 (which creates the per-branch partial unique indexes that reference branch_id).
--
-- SAFETY (identical guarantees to V8/V34/V35):
--   * ADDITIVE + NULLABLE only. IDEMPOTENT (IF NOT EXISTS; FK block skips when already present).
--   * GUARDED — skips a table that does not exist (fresh DB / drift); FK skipped if branches absent
--     or if orphan branch_id rows exist (none can exist here — column is new and all-null).

DO $$
DECLARE
    tbl      text;
    fkname   text;
    idxname  text;
    tables   text[] := ARRAY['departments','sub_departments','brands','units','barcode_templates','product_barcodes'];
    has_fk   int;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        -- Skip a table that doesn't exist on this tenant/DB yet.
        CONTINUE WHEN to_regclass('public.' || tbl) IS NULL;

        -- 1) Additive nullable column (idempotent).
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS branch_id BIGINT', tbl);

        -- 2) Supporting index on branch_id (list filtering target).
        idxname := 'idx_' || tbl || '_branch';
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (branch_id)', idxname, tbl);

        -- 3) Guarded FK -> branches.id (skip if branches absent or an FK already covers branch_id).
        IF to_regclass('public.branches') IS NOT NULL THEN
            SELECT count(*) INTO has_fk
              FROM pg_constraint con
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
             WHERE con.contype = 'f'
               AND con.conrelid = ('public.' || tbl)::regclass
               AND a.attname = 'branch_id';
            IF has_fk = 0 THEN
                fkname := 'fk_' || tbl || '_branch';
                EXECUTE format(
                    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (branch_id) REFERENCES public.branches (id)',
                    tbl, fkname);
                RAISE NOTICE 'V36: added % (%.branch_id -> branches.id)', fkname, tbl;
            END IF;
        END IF;
    END LOOP;
END $$;
