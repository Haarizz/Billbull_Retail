-- V50: POS Business Date + Operating Hours
-- 1. pos_business_dates: per-branch Business Date, independent of the server clock.
-- 2. Operating-hours columns on pos_settings (opt-in per branch, OFF by default).
--
-- All DDL is guarded: already-present tables/columns are skipped.

DO $$
BEGIN

    -- ── 1. pos_business_dates ────────────────────────────────────────────────
    IF to_regclass('pos_business_dates') IS NULL THEN
        CREATE TABLE pos_business_dates (
            id                     BIGSERIAL PRIMARY KEY,
            branch_id              BIGINT NOT NULL,
            current_business_date  DATE NOT NULL,
            last_advanced_at       TIMESTAMP,
            last_advanced_by       VARCHAR(100),
            CONSTRAINT uk_pos_business_date_branch UNIQUE (branch_id)
        );
        RAISE NOTICE 'Created pos_business_dates';
    ELSE
        RAISE NOTICE 'pos_business_dates already present';
    END IF;

    -- ── 2. Operating-hours columns on pos_settings ───────────────────────────
    IF to_regclass('pos_settings') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_settings' AND column_name = 'operating_hours_enabled'
        ) THEN
            ALTER TABLE pos_settings ADD COLUMN operating_hours_enabled BOOLEAN DEFAULT FALSE;
            RAISE NOTICE 'Added operating_hours_enabled to pos_settings';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_settings' AND column_name = 'operating_start_time'
        ) THEN
            ALTER TABLE pos_settings ADD COLUMN operating_start_time TIME;
            RAISE NOTICE 'Added operating_start_time to pos_settings';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_settings' AND column_name = 'operating_end_time'
        ) THEN
            ALTER TABLE pos_settings ADD COLUMN operating_end_time TIME;
            RAISE NOTICE 'Added operating_end_time to pos_settings';
        END IF;
    END IF;

END $$;
