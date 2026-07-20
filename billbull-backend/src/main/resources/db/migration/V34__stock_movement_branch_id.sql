-- V34 — Branch-Level Inventory, Phase 1: denormalized branch_id on the stock ledger.
--
-- Adds a NULLABLE branch_id to stock_movements (the append-only inventory source of truth),
-- backfilled from the receiving/issuing warehouse's branch, plus two composite indexes and a
-- guarded FK to branches. NOTHING reads this column yet — this migration is behaviourally inert
-- (Phase 1 of docs/future-enhancements/01-branch-level-inventory-roadmap.md). Its only job is to
-- make branch a cheap indexed predicate on the highest-volume table instead of a join through
-- warehouses.branch_id.
--
-- SAFETY (per the project stale-schema convention + the Phase 0 audit go/no-go):
--   * ADDITIVE + NULLABLE only — never NOT NULL, never a drop/narrow. Safe for the
--     ddl-auto=update fleet: legacy/global rows stay NULL and remain visible under the
--     "null = shared/global" rule already used by BranchAccessService.
--   * IDEMPOTENT — re-running on an already-migrated DB is a no-op (IF NOT EXISTS on the
--     column/indexes; the FK block skips when a constraint already covers the column).
--   * GUARDED like V8__fk_constraints.sql — every step checks table/column presence first, so
--     it is safe on a drifted multi-DB fleet where Flyway runs before Hibernate on a fresh DB
--     (stock_movements may not exist yet -> the whole script no-ops out).
--   * ORPHAN-TOLERANT — the backfill LEFT-JOINs warehouses (a movement whose warehouse is
--     missing simply stays NULL), and the FK is only added when NO orphan branch_id exists,
--     exactly mirroring V8's orphan guard (skip + NOTICE, never abort boot).
--
-- LOCKING: the backfill is a single UPDATE and the indexes use plain CREATE INDEX (brief locks),
-- fine for typical per-tenant DB sizes and fresh installs. For a very large production tenant,
-- prefer a batched out-of-band backfill + CREATE INDEX CONCURRENTLY during a maintenance window,
-- then let this migration no-op (column/indexes already present). Size per tenant first
-- (see the Phase 0 per-tenant audit script) — this is the B-1 advisory from the Phase 0 report.

DO $$
DECLARE
    has_fk   int;
    orphans  bigint;
BEGIN
    -- Fresh DB (Flyway before Hibernate) or a tenant without the ledger yet: nothing to do.
    IF to_regclass('public.stock_movements') IS NULL THEN
        RAISE NOTICE 'V34: stock_movements absent — skipping (fresh DB, Hibernate will create it).';
        RETURN;
    END IF;

    -- 1) Additive, nullable column (idempotent).
    ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS branch_id BIGINT;

    -- 2) Backfill from the warehouse's branch. LEFT-JOIN semantics via the correlated lookup:
    --    a movement whose warehouse is missing (orphan) or whose warehouse has no branch stays
    --    NULL (= global/visible). Only touch rows not already stamped so re-runs are cheap.
    UPDATE public.stock_movements sm
       SET branch_id = w.branch_id
      FROM public.warehouses w
     WHERE sm.warehouse_id = w.id
       AND sm.branch_id IS NULL
       AND w.branch_id IS NOT NULL;

    -- 3) Composite indexes for the branch-scoped aggregates Phase 3 will add (idempotent).
    CREATE INDEX IF NOT EXISTS idx_sm_branch_product   ON public.stock_movements (branch_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_sm_branch_warehouse ON public.stock_movements (branch_id, warehouse_id);

    -- 4) FK stock_movements.branch_id -> branches.id, guarded exactly like V8__fk_constraints.sql.
    --    Skip when: branches table absent · an FK already covers branch_id · orphan branch_id
    --    values exist (never ADD a constraint that would fail validation and abort boot).
    IF to_regclass('public.branches') IS NULL THEN
        RAISE NOTICE 'V34: branches absent — column + indexes added, FK skipped.';
        RETURN;
    END IF;

    SELECT count(*) INTO has_fk
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
     WHERE con.contype = 'f'
       AND con.conrelid = 'public.stock_movements'::regclass
       AND a.attname = 'branch_id';
    IF has_fk > 0 THEN
        RETURN;  -- already constrained (prior run) — idempotent no-op.
    END IF;

    SELECT count(*) INTO orphans
      FROM public.stock_movements sm
     WHERE sm.branch_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = sm.branch_id);
    IF orphans > 0 THEN
        RAISE NOTICE 'V34: skipped fk_sm_branch — % orphan branch_id row(s) in stock_movements have no branches parent (clean up, then re-run).', orphans;
        RETURN;
    END IF;

    ALTER TABLE public.stock_movements
        ADD CONSTRAINT fk_sm_branch FOREIGN KEY (branch_id) REFERENCES public.branches (id);
    RAISE NOTICE 'V34: added fk_sm_branch (stock_movements.branch_id -> branches.id).';
END $$;
