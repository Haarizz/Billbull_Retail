-- Add tax_inclusive column to pos_layaways table to properly track if the stored sale_total/tax_total
-- were generated from tax-inclusive prices (prevents double-taxing on display and conversion).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'pos_layaways'
          AND column_name = 'tax_inclusive'
    ) THEN
        ALTER TABLE pos_layaways ADD COLUMN tax_inclusive BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
