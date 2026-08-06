ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS vendor_id BIGINT;
ALTER TABLE lpos ADD COLUMN IF NOT EXISTS vendor_id BIGINT;
ALTER TABLE grns ADD COLUMN IF NOT EXISTS vendor_id BIGINT;

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
