-- V59: POS Session Roaming — Phase 1 (Schema Foundation).
--
-- Purely additive schema for the User-Centric Session architecture (see
-- pos-session-roaming-architecture-blueprint.html / pos-session-roaming-implementation-roadmap.html,
-- Phase 1). No application code reads or writes any of these columns/tables yet — this migration
-- changes no runtime behavior. Every new column is nullable; every new table starts empty.
--
--   * pos_sessions.owner_user_id            — stable owner of a session across terminal moves.
--   * pos_sessions.current_hosting_refreshed_at — last time the session's current-terminal
--       "hosting" pointer was refreshed (used by later phases; unread for now).
--   * pos_cash_movements.performed_by_user_id — stable-id counterpart to the existing
--       performed_by username column.
--   * pos_terminals.locked_reason / locked_at / locked_session_id — support columns for the
--       future LOCKED terminal status (Phase 6); unreachable/unused this phase.
--   * pos_session_terminal_history — append-only log of which terminal/counter hosted a
--       session over time.
--   * pos_session_transfer_log — append-only log of session-transfer events between terminals.
--
-- SAFETY (per project_stale_schema_upgrade_hazard convention, mirroring V48/V57/V58):
--   * ADDITIVE + NULLABLE only. No NOT NULL, no FK constraints (app-level FKs only, consistent
--     with the rest of this schema's convention of not enforcing cross-module FKs at the DB layer).
--   * IDEMPOTENT — ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   * GUARDED — checks to_regclass so a fresh DB (Hibernate not yet run) is a no-op for the
--     ALTER TABLE blocks; the CREATE TABLE statements are unconditional since these tables are new.

DO $$
BEGIN
    IF to_regclass('public.pos_sessions') IS NOT NULL THEN
        ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;
        ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS current_hosting_refreshed_at TIMESTAMP;

        RAISE NOTICE 'V59: pos_sessions roaming columns ensured.';
    ELSE
        RAISE NOTICE 'V59: pos_sessions absent — skipping (fresh DB, Hibernate will create it).';
    END IF;

    IF to_regclass('public.pos_cash_movements') IS NOT NULL THEN
        ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS performed_by_user_id BIGINT;

        RAISE NOTICE 'V59: pos_cash_movements roaming columns ensured.';
    ELSE
        RAISE NOTICE 'V59: pos_cash_movements absent — skipping (fresh DB, Hibernate will create it).';
    END IF;

    IF to_regclass('public.pos_terminals') IS NOT NULL THEN
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS locked_reason VARCHAR(255);
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS locked_session_id BIGINT;

        RAISE NOTICE 'V59: pos_terminals LOCKED-support columns ensured.';
    ELSE
        RAISE NOTICE 'V59: pos_terminals absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS pos_session_terminal_history (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    terminal_id BIGINT,
    counter_id BIGINT,
    counter_name VARCHAR(100),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,

    created_at TIMESTAMP,
    created_by VARCHAR(100),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pos_sess_term_hist_session ON pos_session_terminal_history (session_id);
CREATE INDEX IF NOT EXISTS idx_pos_sess_term_hist_terminal ON pos_session_terminal_history (terminal_id);
CREATE INDEX IF NOT EXISTS idx_pos_sess_term_hist_open ON pos_session_terminal_history (session_id, ended_at);

CREATE TABLE IF NOT EXISTS pos_session_transfer_log (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    from_terminal_id BIGINT,
    to_terminal_id BIGINT,
    initiated_by_user_id BIGINT,
    supervisor_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP,
    created_by VARCHAR(100),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pos_sess_transfer_log_session ON pos_session_transfer_log (session_id);
CREATE INDEX IF NOT EXISTS idx_pos_sess_transfer_log_from_terminal ON pos_session_transfer_log (from_terminal_id);
CREATE INDEX IF NOT EXISTS idx_pos_sess_transfer_log_to_terminal ON pos_session_transfer_log (to_terminal_id);
