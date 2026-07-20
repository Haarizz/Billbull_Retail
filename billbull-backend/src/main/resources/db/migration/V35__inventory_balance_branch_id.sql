-- V35 — Branch-Level Inventory, Phase 4: denormalized branch_id on the materialized balance table.
--
-- Adds a NULLABLE branch_id to inventory_balances (the pre-aggregated on-hand table, one row per
-- product+warehouse), backfilled from the warehouse's branch, plus an index and a guarded FK to
-- branches. Mirrors V34's treatment of stock_movements. The read-path use of this column is gated
-- behind inventory.branch-scope.enabled (default off) — this migration itself is behaviourally
-- inert (Phase 4 of docs/future-enhancements/01-branch-level-inventory-roadmap.md).
--
-- SAFETY (identical guarantees to V34):
--   * ADDITIVE + NULLABLE only — never NOT NULL, never a drop/narrow. Global/branchless rows stay
--     NULL and remain visible under the "null = shared/global" rule.
--   * IDEMPOTENT — IF NOT EXISTS on the column/index; the FK block skips when already present.
--   * GUARDED like V8/V34 — checks table/column presence first; safe on a drifted fleet and on a
--     fresh DB where Flyway runs before Hibernate (table may not exist yet -> no-op).
--   * ORPHAN-TOLERANT — backfill leaves NULL when the warehouse is missing or branchless; the FK
--     is added only when NO orphan branch_id exists (skip + NOTICE, never abort boot).

DO $$
DECLARE
    has_fk   int;
    orphans  bigint;
BEGIN
    -- Fresh DB (Flyway before Hibernate) or a tenant without the table yet: nothing to do.
    IF to_regclass('public.inventory_balances') IS NULL THEN
        RAISE NOTICE 'V35: inventory_balances absent — skipping (fresh DB, Hibernate will create it).';
        RETURN;
    END IF;

    -- 1) Additive, nullable column (idempotent).
    ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS branch_id BIGINT;

    -- 2) Backfill from the warehouse's branch. A balance row whose warehouse is missing (orphan)
    --    or whose warehouse has no branch stays NULL (= global/visible). Only touch unstamped rows.
    UPDATE public.inventory_balances ib
       SET branch_id = w.branch_id
      FROM public.warehouses w
     WHERE ib.warehouse_id = w.id
       AND ib.branch_id IS NULL
       AND w.branch_id IS NOT NULL;

    -- 3) Index backing the branch-scoped balance aggregates Phase 4 reads (idempotent).
    CREATE INDEX IF NOT EXISTS idx_inv_bal_branch_product ON public.inventory_balances (branch_id, product_id);

    -- 4) FK inventory_balances.branch_id -> branches.id, guarded exactly like V8/V34.
    IF to_regclass('public.branches') IS NULL THEN
        RAISE NOTICE 'V35: branches absent — column + index added, FK skipped.';
        RETURN;
    END IF;

    SELECT count(*) INTO has_fk
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
     WHERE con.contype = 'f'
       AND con.conrelid = 'public.inventory_balances'::regclass
       AND a.attname = 'branch_id';
    IF has_fk > 0 THEN
        RETURN;  -- already constrained (prior run) — idempotent no-op.
    END IF;

    SELECT count(*) INTO orphans
      FROM public.inventory_balances ib
     WHERE ib.branch_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = ib.branch_id);
    IF orphans > 0 THEN
        RAISE NOTICE 'V35: skipped fk_inv_bal_branch — % orphan branch_id row(s) in inventory_balances have no branches parent (clean up, then re-run).', orphans;
        RETURN;
    END IF;

    ALTER TABLE public.inventory_balances
        ADD CONSTRAINT fk_inv_bal_branch FOREIGN KEY (branch_id) REFERENCES public.branches (id);
    RAISE NOTICE 'V35: added fk_inv_bal_branch (inventory_balances.branch_id -> branches.id).';
END $$;
