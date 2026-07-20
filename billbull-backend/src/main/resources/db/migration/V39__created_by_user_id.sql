-- V39 — User-Based Data Visibility (Ownership Filtering), Phase 1: stable owner column.
--
-- Adds a NULLABLE created_by_user_id BIGINT to every BaseEntity-backed table, backfills it from
-- the existing created_by username, and indexes it (plus a composite (branch_id, created_by_user_id)
-- where a branch_id column exists, since ownership and branch filters are always applied together).
-- NOTHING reads this column yet — this migration is behaviourally inert (Phase 1 of
-- docs/future-enhancements/02-user-based-data-visibility-roadmap.md). Its only job is to give the
-- ownership filter a stable, rename-proof owner id to key on instead of the brittle created_by
-- username string.
--
-- SAFETY (per the project stale-schema convention — project_stale_schema_upgrade_hazard —
-- and mirroring V34__stock_movement_branch_id.sql):
--   * ADDITIVE + NULLABLE only — never NOT NULL, never a drop/narrow. Safe for the ddl- auto=update
--     fleet: legacy rows whose created_by does not resolve to a users.username stay NULL and are
--     treated as unowned (visible to VIEW_ALL_RECORDS holders only when filtering is enabled).
--   * IDEMPOTENT — re-running on an already-migrated DB is a no-op (ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS; the backfill only touches still-NULL rows).
--   * GUARDED — the whole thing runs table-by-table over information_schema, so it self-adapts to
--     a drifted multi-DB fleet (a tenant missing a given table simply contributes no work) and to a
--     fresh DB where Flyway runs before Hibernate (only the users table + already-created tables are
--     touched; Hibernate adds created_by_user_id to the rest via ddl-auto, then a later boot's
--     re-run backfills them). No hard-coded table list to drift out of sync with the entity model.
--   * DATA-DRIVEN TABLE SET — every table that has a created_by column IS a BaseEntity table, so
--     "add the owner column wherever created_by exists" is exactly the intended scope with zero
--     maintenance. The users table itself is included (a user can be created by another user).
--
-- LOCKING: per-table ADD COLUMN is a fast catalog-only change (nullable, no default). The backfill
-- is one correlated UPDATE per table; CREATE INDEX takes a brief lock. Fine for typical per-tenant
-- DB sizes. For a very large tenant, pre-run the column adds + CREATE INDEX CONCURRENTLY out of band
-- during a window, then let this migration no-op.

DO $$
DECLARE
    tbl            text;
    has_branch     boolean;
    backfilled     bigint;
BEGIN
    -- Guard: the users table must exist to resolve created_by → users.id. On a truly empty fresh DB
    -- (Flyway before Hibernate) it may not — skip entirely; a later boot re-runs and backfills.
    IF to_regclass('public.users') IS NULL THEN
        RAISE NOTICE 'V39: users table absent — skipping (fresh DB, Hibernate will create tables; re-run backfills).';
        RETURN;
    END IF;

    FOR tbl IN
        SELECT c.table_name
          FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.column_name = 'created_by'
         ORDER BY c.table_name
    LOOP
        -- 1) Additive, nullable owner column (idempotent).
        EXECUTE format(
            'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT',
            tbl);

        -- 2) Backfill from the created_by username, best-effort. Rows whose created_by is NULL
        --    (system/seeder writes) or does not match any users.username (deleted/renamed user)
        --    stay NULL and are treated as unowned. Only touch still-NULL rows so re-runs are cheap.
        EXECUTE format(
            'UPDATE public.%I t
                SET created_by_user_id = u.id
               FROM public.users u
              WHERE t.created_by = u.username
                AND t.created_by_user_id IS NULL',
            tbl);
        GET DIAGNOSTICS backfilled = ROW_COUNT;

        -- 3) Single-column index for owner-only list predicates (idempotent).
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_created_by_user ON public.%I (created_by_user_id)',
            tbl, tbl);

        -- 4) Composite (branch_id, created_by_user_id) where the table is branch-scoped — the two
        --    filters are ANDed together on every scoped list, so a composite is the hot-path index.
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'branch_id'
        ) INTO has_branch;
        IF has_branch THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_%s_branch_owner ON public.%I (branch_id, created_by_user_id)',
                tbl, tbl);
        END IF;

        IF backfilled > 0 THEN
            RAISE NOTICE 'V39: % — backfilled % owner id(s) from created_by username.', tbl, backfilled;
        END IF;
    END LOOP;

    RAISE NOTICE 'V39: created_by_user_id column + indexes ensured on all BaseEntity tables.';

    -- 5) Standalone owner tables. Several high-volume aggregate roots (sales_invoices, sales_orders,
    --    sales_quotations, proforma_invoices, delivery_notes, sales_returns, sales_payments,
    --    journal_entries, expenses, purchase payment_vouchers) do NOT extend BaseEntity and have no
    --    created_by column — so the loop above skipped them. Their created_by_user_id column is added
    --    by Hibernate ddl-auto (they implement OwnedEntity), but Hibernate won't create the ownership
    --    indexes. Ensure the index on ANY table that already has a created_by_user_id column but was
    --    not covered above (i.e. lacks the created_by column). No backfill is possible for these (no
    --    username to resolve) — legacy rows stay unowned, which is the intended null-owner behaviour.
    FOR tbl IN
        SELECT c.table_name
          FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.column_name = 'created_by_user_id'
           AND NOT EXISTS (
               SELECT 1 FROM information_schema.columns c2
                WHERE c2.table_schema = 'public' AND c2.table_name = c.table_name
                  AND c2.column_name = 'created_by')
         ORDER BY c.table_name
    LOOP
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_created_by_user ON public.%I (created_by_user_id)',
            tbl, tbl);
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'branch_id'
        ) INTO has_branch;
        IF has_branch THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_%s_branch_owner ON public.%I (branch_id, created_by_user_id)',
                tbl, tbl);
        END IF;
    END LOOP;
    RAISE NOTICE 'V39: ownership indexes ensured on standalone (non-BaseEntity) owner tables.';
END $$;
