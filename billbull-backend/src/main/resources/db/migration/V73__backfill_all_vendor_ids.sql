-- Backfill missing vendor_id for legacy purchase transactions
-- For purchase invoices
UPDATE purchase_invoices pi
SET vendor_id = v.id
FROM vendors v
WHERE pi.vendor_id IS NULL 
AND v.name = pi.vendor_name;

-- For LPOs
UPDATE lpos l
SET vendor_id = v.id
FROM vendors v
WHERE l.vendor_id IS NULL 
AND v.name = l.vendor_name;

-- For GRNs
UPDATE grns g
SET vendor_id = v.id
FROM vendors v
WHERE g.vendor_id IS NULL 
AND v.name = g.vendor_name;
