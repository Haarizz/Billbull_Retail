-- V77: POS Session Closure Workflow marker.
--
-- Problem this closes: "Close Session" navigates the cashier to the X-Report / Close
-- Session screen, but the session deliberately stays OPEN in the database until the final
-- close succeeds (the X-Report and every close validation operate on the open session).
-- Nothing prevented the cashier from walking back to the dashboard, pressing "Continue
-- Session" and carrying on selling — a session-close bypass.
--
-- Why a new column rather than an existing one:
--   * pos_sessions.status has no value for this, and adding one is wrong — the session IS
--     genuinely still OPEN, and every existing OPEN/SUSPENDED/CLOSED consumer (Day Close
--     resolution, Z-Report gating, previous-Business-Day blocking, terminal locking) must
--     keep classifying it exactly as it does today.
--   * x_report_generated_at means something else entirely. The X-Report is an INFORMATIONAL,
--     optional, mid-shift read: it is stamped by merely opening the X-Report view, a session
--     may be closed having never run one (close_session back-stamps it), and selling after
--     one has always been allowed. Using it as a closure marker would lock a session the
--     moment a cashier glanced at a mid-shift report.
--
-- Semantics:
--   status = OPEN   AND closing_started_at IS NULL      → normal active session; selling allowed
--   status = OPEN   AND closing_started_at IS NOT NULL  → closure workflow started; normal POS
--                                                          operations locked, closure operations
--                                                          (X-Report, denomination entry,
--                                                          approval, close) all still allowed
--   status = CLOSED                                     → session fully closed
--
-- closing_started_by stores the username, matching the identity convention of the existing
-- opened_by / closed_by / x_report_generated_by columns (VARCHAR(255), app-level only, never
-- an FK) rather than the newer *_user_id columns, because the closure-authorization rules in
-- PosSessionAuthorizationService compare against session.openedBy by username.
--
-- SAFETY (per project_stale_schema_upgrade_hazard convention, mirroring V54/V59/V68):
--   * ADDITIVE + NULLABLE only. No NOT NULL, no default, no FK, no existing column altered.
--   * IDEMPOTENT — ADD COLUMN IF NOT EXISTS, so a re-run or a tenant whose Hibernate
--     ddl-auto=update already created the columns is a no-op.
--   * GUARDED — checks to_regclass so a fresh DB (Hibernate not yet run) skips cleanly.
--   * NO BACKFILL, deliberately: NULL is the correct value for every existing row. A session
--     open at upgrade time has not started closure, and back-dating one would lock a live
--     till mid-shift on deploy.

DO $$
BEGIN
    IF to_regclass('public.pos_sessions') IS NOT NULL THEN
        ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS closing_started_at TIMESTAMP;
        ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS closing_started_by VARCHAR(255);

        -- Partial index over the locked set only. Sessions in the closure workflow are a
        -- handful at any moment (one per till mid-close), so this stays tiny while letting
        -- an operations query for "which tills are mid-closure" avoid a scan. The gate
        -- itself never needs it — it always arrives with the session already loaded by
        -- id/terminal. Inside the guard, because it references columns this block just
        -- added on a table that may not exist yet.
        CREATE INDEX IF NOT EXISTS idx_pos_session_closing_started
            ON public.pos_sessions (branch_id, closing_started_at)
            WHERE closing_started_at IS NOT NULL;

        RAISE NOTICE 'V77: pos_sessions closure-workflow columns ensured.';
    ELSE
        RAISE NOTICE 'V77: pos_sessions absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;
