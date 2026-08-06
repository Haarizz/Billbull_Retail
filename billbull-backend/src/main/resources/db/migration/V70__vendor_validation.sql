-- Add vendor_id columns if they don't exist
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS vendor_id BIGINT;
ALTER TABLE lpos ADD COLUMN IF NOT EXISTS vendor_id BIGINT;
ALTER TABLE grns ADD COLUMN IF NOT EXISTS vendor_id BIGINT;

-- Backfill vendor_id from vendor_name using exact match
UPDATE purchase_invoices pi
SET vendor_id = v.id
FROM vendors v
WHERE pi.vendor_name = v.name AND pi.vendor_id IS NULL;

UPDATE lpos l
SET vendor_id = v.id
FROM vendors v
WHERE l.vendor_name = v.name AND l.vendor_id IS NULL;

UPDATE grns g
SET vendor_id = v.id
FROM vendors v
WHERE g.vendor_name = v.name AND g.vendor_id IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pi_vendor_id ON purchase_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_lpo_vendor_id ON lpos(vendor_id);
CREATE INDEX IF NOT EXISTS idx_grn_vendor_id ON grns(vendor_id);

-- Check and add constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pi_vendor_id') THEN
        ALTER TABLE purchase_invoices ADD CONSTRAINT fk_pi_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lpo_vendor_id') THEN
        ALTER TABLE lpos ADD CONSTRAINT fk_lpo_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_grn_vendor_id') THEN
        ALTER TABLE grns ADD CONSTRAINT fk_grn_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
END $$;
