ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS require_price_override_approval BOOLEAN DEFAULT FALSE;
