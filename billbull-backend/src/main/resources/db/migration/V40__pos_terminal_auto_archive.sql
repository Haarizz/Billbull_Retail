-- V40 — Terminal Auto-Archive Lifecycle.
--
-- Adds the schema needed to move a POS terminal through ACTIVE -> OFFLINE -> STALE -> ARCHIVED
-- automatically after a configurable period of inactivity, with a warning grace period, a
-- per-terminal opt-out, and a structured archive-context snapshot for troubleshooting. Nothing
-- runs against this schema until an admin explicitly enables pos_settings.terminal_auto_archive_enabled
-- for their branch — the feature is fully opt-in and behaviourally inert on every existing install
-- until then (see docs/future-enhancements — Terminal Auto Archive Lifecycle plan).
--
-- SAFETY (per the project stale-schema convention — project_stale_schema_upgrade_hazard —
-- and mirroring V39__created_by_user_id.sql):
--   * ADDITIVE + NULLABLE (or safely-defaulted boolean/integer) only — never NOT NULL without a
--     default, never a drop/narrow.
--   * IDEMPOTENT — ADD COLUMN IF NOT EXISTS throughout; the one-time last_activity_at backfill
--     only touches rows that are still NULL, so re-running this migration is a no-op.
--   * GUARDED — checks to_regclass for both tables before acting, so a fresh DB where Flyway runs
--     before Hibernate creates pos_terminals/pos_settings simply skips (Hibernate creates the
--     columns via ddl-auto on that first boot; a later boot's re-run backfills last_activity_at).
--
-- LOCKING: all ADD COLUMN calls here are nullable/defaulted catalog-only changes; the backfill is a
-- single UPDATE over pos_terminals. Fine for typical per-tenant DB sizes.

DO $$
BEGIN
    IF to_regclass('public.pos_terminals') IS NOT NULL THEN
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS stale_at TIMESTAMP;
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS stale_warning_sent_at TIMESTAMP;
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP;
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS auto_archive_exempt BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS archive_context_json TEXT;

        CREATE INDEX IF NOT EXISTS idx_pos_terminal_last_activity ON public.pos_terminals (last_activity_at);

        -- One-time backfill so existing terminals aren't spuriously flagged stale on day one:
        -- seed last_activity_at from whichever of last_heartbeat_at / last_seen_at is more recent.
        UPDATE public.pos_terminals
           SET last_activity_at = GREATEST(
                   COALESCE(last_heartbeat_at, TIMESTAMP '1970-01-01'),
                   COALESCE(last_seen_at, TIMESTAMP '1970-01-01')
               )
         WHERE last_activity_at IS NULL
           AND (last_heartbeat_at IS NOT NULL OR last_seen_at IS NOT NULL);

        RAISE NOTICE 'V40: pos_terminals auto-archive lifecycle columns ensured + last_activity_at backfilled.';
    ELSE
        RAISE NOTICE 'V40: pos_terminals absent — skipping (fresh DB, Hibernate will create it; re-run backfills).';
    END IF;

    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS terminal_auto_archive_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS terminal_archive_after_days INTEGER NOT NULL DEFAULT 30;
        ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS terminal_archive_notify_before BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS terminal_archive_warning_days INTEGER NOT NULL DEFAULT 5;

        RAISE NOTICE 'V40: pos_settings terminal auto-archive configuration columns ensured (feature OFF by default).';
    ELSE
        RAISE NOTICE 'V40: pos_settings absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;
