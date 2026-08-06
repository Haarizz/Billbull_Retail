ALTER TABLE pos_settings
    ADD COLUMN IF NOT EXISTS require_supervisor_for_day_close BOOLEAN NOT NULL DEFAULT FALSE;
