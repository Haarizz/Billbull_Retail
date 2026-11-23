-- Console > Terminals & Counters: show who is signed in on each terminal, and serve a
-- per-terminal recent-activity feed from pos_audit_log.
-- Additive and idempotent, like every migration that must run on tenants of differing age.

ALTER TABLE IF EXISTS pos_terminals ADD COLUMN IF NOT EXISTS last_user VARCHAR(100);
ALTER TABLE IF EXISTS pos_terminals ADD COLUMN IF NOT EXISTS last_user_at TIMESTAMP;

DO $$
BEGIN
    IF to_regclass('public.pos_audit_log') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_pal_branch_terminal_created
            ON pos_audit_log (branch_id, terminal_id, created_at DESC);
    END IF;
END $$;
