-- V46 — Add the missing foreign key from branch_tax_configuration.branch_id to branches.id.
--
-- V45 created branch_tax_configuration without a FK (matching the pre-existing pos_settings
-- convention at the time), but branches can be hard-deleted (BranchService.delete()) and other
-- branch-scoped tables in this codebase (stock_movements, inventory_balance, inventory_master —
-- see V34/V35/V36) already enforce this relationship. Adding it here closes the orphan-row gap
-- for tax configuration specifically.
--
-- Same guarded pattern as V34: skip (don't fail the boot) if orphan rows already exist, so an
-- unexpected tenant-DB state never blocks startup — just logs a NOTICE for manual cleanup.

DO $$
DECLARE
    orphans INT;
BEGIN
    IF to_regclass('public.branch_tax_configuration') IS NULL OR to_regclass('public.branches') IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'branch_tax_configuration'
          AND constraint_name = 'fk_branch_tax_configuration_branch'
    ) THEN
        RETURN; -- already applied
    END IF;

    SELECT count(*) INTO orphans
      FROM public.branch_tax_configuration btc
     WHERE NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = btc.branch_id);
    IF orphans > 0 THEN
        RAISE NOTICE 'V46: skipped fk_branch_tax_configuration_branch — % orphan branch_id row(s) in branch_tax_configuration have no branches parent (clean up, then re-run).', orphans;
        RETURN;
    END IF;

    ALTER TABLE public.branch_tax_configuration
        ADD CONSTRAINT fk_branch_tax_configuration_branch FOREIGN KEY (branch_id) REFERENCES public.branches (id);
    RAISE NOTICE 'V46: added fk_branch_tax_configuration_branch (branch_tax_configuration.branch_id -> branches.id).';
END $$;
