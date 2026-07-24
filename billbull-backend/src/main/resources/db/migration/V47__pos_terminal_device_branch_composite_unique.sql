-- V47 — POS Terminal identity becomes per-branch, not global.
--
-- Root cause of the branch-switch terminal/session-loss bug: pos_terminals.device_fingerprint
-- carried a GLOBAL unique constraint, so the same physical device could only ever hold ONE live
-- terminal row across the whole company. PosTerminalService.registerOrRefresh() worked around
-- this by nulling out device_fingerprint on the "losing" branch's terminal every time the device
-- registered against a different branch — a one-way, destructive hand-off that orphaned the old
-- terminal (burning a terminal slot there forever) and made the previously-open session on it
-- unreachable. See docs/pos-terminal-branch-switch-investigation-2026-07-24.html.
--
-- Fix: replace the global unique constraint on (device_fingerprint) with a composite unique
-- constraint on (device_fingerprint, branch_id), matching the already-documented intended design
-- in docs/pos-terminal-counter-architecture-review-2026-06-25.md §5 ("Same device in Branch B
-- gets a new terminal row for that branch" / "Slot limits are per-branch"). This lets one device
-- hold one terminal per branch simultaneously, with no destructive unlinking required.
--
-- SAFETY (per project_stale_schema_upgrade_hazard convention, mirroring V37's approach):
--   * Constraint/index names are Hibernate-generated and vary per schema/tenant, so we locate the
--     existing unique constraint or standalone unique index on exactly the (device_fingerprint)
--     column set by introspecting pg_constraint/pg_index rather than hard-coding a name.
--   * Guarded with to_regclass so a fresh DB (Hibernate not yet run) is a no-op.
--   * Existing data already satisfies the new, less restrictive composite constraint (a global
--     unique fingerprint is trivially unique per (fingerprint, branch) too), so nothing is
--     rejected on upgrade.
--   * IDEMPOTENT — safe to re-run.

DO $$
DECLARE
    conname text;
BEGIN
    IF to_regclass('public.pos_terminals') IS NULL THEN
        RAISE NOTICE 'V47: pos_terminals absent — skipping (fresh DB, Hibernate will create the composite index).';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pos_terminals' AND column_name = 'device_fingerprint'
    ) THEN
        RAISE NOTICE 'V47: pos_terminals.device_fingerprint absent — skipping.';
        RETURN;
    END IF;

    -- 1) Drop the GLOBAL unique constraint on exactly (device_fingerprint), if one exists.
    SELECT con.conname INTO conname
    FROM pg_constraint con
    WHERE con.contype = 'u'
      AND con.conrelid = 'public.pos_terminals'::regclass
      AND (
            SELECT array_agg(att.attname::text ORDER BY att.attname::text)
            FROM unnest(con.conkey) k
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
          ) = ARRAY['device_fingerprint']
    LIMIT 1;

    IF conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.pos_terminals DROP CONSTRAINT IF EXISTS %I', conname);
        RAISE NOTICE 'V47: dropped global unique constraint % on pos_terminals(device_fingerprint)', conname;
    END IF;

    -- 1b) Also drop a bare unique index on exactly (device_fingerprint) not backed by a constraint
    --     (Hibernate's @Index(unique = true) produces one of these, not a table constraint).
    FOR conname IN
        SELECT ix.relname
        FROM pg_index i
        JOIN pg_class ix ON ix.oid = i.indexrelid
        JOIN pg_class tb ON tb.oid = i.indrelid
        WHERE i.indisunique
          AND NOT i.indisprimary
          AND tb.relname = 'pos_terminals'
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
          AND (
                SELECT array_agg(att.attname::text ORDER BY att.attname::text)
                FROM unnest(i.indkey) k
                JOIN pg_attribute att ON att.attrelid = i.indrelid AND att.attnum = k
              ) = ARRAY['device_fingerprint']
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', conname);
        RAISE NOTICE 'V47: dropped standalone unique index % on pos_terminals(device_fingerprint)', conname;
    END LOOP;

    -- 2) Ensure a plain (non-unique) lookup index still exists on device_fingerprint alone.
    CREATE INDEX IF NOT EXISTS idx_pos_terminal_device ON public.pos_terminals (device_fingerprint);

    -- 3) Create the composite unique index: one live terminal per (device_fingerprint, branch_id).
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_terminal_device_branch
        ON public.pos_terminals (device_fingerprint, branch_id);

    RAISE NOTICE 'V47: pos_terminals device_fingerprint is now unique per (device_fingerprint, branch_id).';
END $$;
