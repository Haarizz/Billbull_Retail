-- V51: Day Close session-range traceability.
-- 1. pos_sessions.day_close_id — links a session to the Day Close it was resolved
--    into, so membership is queryable directly instead of only reconstructable by
--    parsing pos_day_closes.z_report_json.
-- 2. pos_day_closes.start_session_id / end_session_id — audit record of the resolved
--    range boundary (auto-computed or supervisor-adjusted) a close was generated from.
--
-- All DDL is guarded: already-present columns are skipped.

DO $$
BEGIN

    IF to_regclass('pos_sessions') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_sessions' AND column_name = 'day_close_id'
        ) THEN
            ALTER TABLE pos_sessions ADD COLUMN day_close_id BIGINT;
            RAISE NOTICE 'Added day_close_id to pos_sessions';
        END IF;
    END IF;

    IF to_regclass('pos_day_closes') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_day_closes' AND column_name = 'start_session_id'
        ) THEN
            ALTER TABLE pos_day_closes ADD COLUMN start_session_id BIGINT;
            RAISE NOTICE 'Added start_session_id to pos_day_closes';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_day_closes' AND column_name = 'end_session_id'
        ) THEN
            ALTER TABLE pos_day_closes ADD COLUMN end_session_id BIGINT;
            RAISE NOTICE 'Added end_session_id to pos_day_closes';
        END IF;
    END IF;

END $$;

CREATE INDEX IF NOT EXISTS idx_pos_session_day_close ON pos_sessions (day_close_id);
