-- SystemAccountSeeder seeded the Equity *sub-group* and the Retained Earnings *leaf* on the same
-- account code, 3100. Groups are seeded first, so the leaf seed found the code taken, fell through
-- to its patch branch, and set the group's parent_code to the seed's parent — 3100, the group's own
-- code. Two consequences on every tenant seeded this way:
--
--   1. Retained Earnings (3100) does not exist as a postable account. It is the contra account
--      every opening-balance journal plugs against (PostingEngineService.ACC_RETAINED_EARNINGS),
--      so the balancing half of each opening balance lands on a group node instead.
--   2. The self-parented group is never reached from a root in LedgerService.getAccountTree
--      (roots are the parent_code IS NULL rows), so all of Equity is invisible in the COA tree.
--
-- The seeder now files the sub-group under 3050, matching Current Assets (1050) and Current
-- Liabilities (2050), which leaves 3100 free for Retained Earnings to be seeded on the next boot.
-- Repair the rows already written. Ledger entries already posted to 3100 are deliberately left
-- alone: they were opening-balance plugs meant for Retained Earnings, and 3100 becomes exactly
-- that account once the seeder runs.
--
-- Idempotent: every statement is guarded on the row still holding the old code.
DO $$
BEGIN
    IF to_regclass('public.accounts') IS NULL THEN
        RETURN;
    END IF;

    -- Nothing to repair unless the sub-group still occupies 3100.
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = 'SYS-GRP-3100' AND code = '3100') THEN
        RETURN;
    END IF;

    -- Bail out rather than collide if a tenant already put something on 3050.
    IF EXISTS (SELECT 1 FROM accounts WHERE code = '3050') THEN
        RAISE NOTICE 'V99: account code 3050 is already in use - leaving the Equity sub-group on 3100. Retained Earnings must be created manually.';
        RETURN;
    END IF;

    -- The Equity root group is a root: the patch loop wrongly gave it a parent.
    UPDATE accounts SET parent_code = NULL
     WHERE id = 'SYS-GRP-3000' AND parent_code = '3100';

    -- Move the sub-group to 3050 and re-seat it under the Equity root.
    UPDATE accounts SET code = '3050', parent_code = '3000', level = 2
     WHERE id = 'SYS-GRP-3100' AND code = '3100';

    -- Everything that hung off the old sub-group code follows it. The renamed row now carries
    -- parent_code '3000', so it cannot match itself here.
    UPDATE accounts SET parent_code = '3050'
     WHERE parent_code = '3100' AND id <> 'SYS-GRP-3100';
END $$;
