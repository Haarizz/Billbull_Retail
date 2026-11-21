-- Every in-service POS terminal now points at a real pos_counters row.
--
-- Until now a new terminal got only the text "Counter <seq>" in pos_terminals.counter_name and no
-- counter_id. PosCounterBackfillRunner created counters once per branch and never again, so the
-- Terminals list showed counters that did not exist and the counter filter in POS reports matched
-- nothing. PosTerminalService now links at registration, rename and restore. This script repairs
-- the rows written before that:
--   1. links to soft-deleted counters are dropped;
--   2. in-service terminals (not ARCHIVED/DECOMMISSIONED) are linked to the counter of the same
--      name in their branch, and a counter is created for each name that has none;
--   3. every linked terminal's counter_name is copied from its counter.
-- Archived terminals are left unlinked; restoring one links it (PosTerminalService.restore).
-- Idempotent: a second run finds nothing to link and nothing to rename.

DO $$
BEGIN
    IF to_regclass('public.pos_terminals') IS NULL OR to_regclass('public.pos_counters') IS NULL THEN
        RETURN;
    END IF;

    -- 1. Links to deleted counters.
    UPDATE pos_terminals t
       SET counter_id = NULL
     WHERE t.counter_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pos_counters c WHERE c.id = t.counter_id AND c.is_active);

    -- 2a. Link by name to an existing live counter.
    UPDATE pos_terminals t
       SET counter_id = (SELECT min(c.id)
                           FROM pos_counters c
                          WHERE c.branch_id = t.branch_id
                            AND c.is_active
                            AND lower(trim(c.counter_name))
                                = lower(COALESCE(NULLIF(trim(t.counter_name), ''), 'Counter 1')))
     WHERE t.counter_id IS NULL
       AND t.status NOT IN ('ARCHIVED', 'DECOMMISSIONED');

    -- 2b. Create a counter for each name still unmatched. Codes continue after the branch's
    --     highest CTR-NNN, soft-deleted rows included, so a deleted code is never reused.
    INSERT INTO pos_counters (created_at, created_by, is_active, branch_id, branch_name,
                              counter_code, counter_name, display_order, status)
    SELECT now(), 'system', true, n.branch_id, n.branch_name,
           'CTR-' || lpad((COALESCE(mx.max_seq, 0) + n.rn)::text, 3, '0'),
           n.counter_name,
           COALESCE(cnt.total, 0) + n.rn,
           'ACTIVE'
      FROM (SELECT x.branch_id,
                   max(x.branch_name) AS branch_name,
                   min(x.name) AS counter_name,
                   row_number() OVER (PARTITION BY x.branch_id ORDER BY lower(x.name)) AS rn
              FROM (SELECT branch_id, branch_name,
                           COALESCE(NULLIF(trim(counter_name), ''), 'Counter 1') AS name
                      FROM pos_terminals
                     WHERE counter_id IS NULL
                       AND status NOT IN ('ARCHIVED', 'DECOMMISSIONED')) x
             GROUP BY x.branch_id, lower(x.name)) n
      LEFT JOIN (SELECT branch_id, max(substring(counter_code FROM '^CTR-([0-9]+)$')::int) AS max_seq
                   FROM pos_counters
                  GROUP BY branch_id) mx ON mx.branch_id = n.branch_id
      LEFT JOIN (SELECT branch_id, count(*) AS total
                   FROM pos_counters
                  GROUP BY branch_id) cnt ON cnt.branch_id = n.branch_id;

    -- 2c. Link the terminals whose counter was just created.
    UPDATE pos_terminals t
       SET counter_id = (SELECT min(c.id)
                           FROM pos_counters c
                          WHERE c.branch_id = t.branch_id
                            AND c.is_active
                            AND lower(trim(c.counter_name))
                                = lower(COALESCE(NULLIF(trim(t.counter_name), ''), 'Counter 1')))
     WHERE t.counter_id IS NULL
       AND t.status NOT IN ('ARCHIVED', 'DECOMMISSIONED');

    -- 3. The cached name follows the linked counter.
    UPDATE pos_terminals t
       SET counter_name = c.counter_name
      FROM pos_counters c
     WHERE c.id = t.counter_id
       AND t.counter_name IS DISTINCT FROM c.counter_name;
END $$;
