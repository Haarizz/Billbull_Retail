-- 1. Insert Cash Vendor if not exists
INSERT INTO vendors (
    code, name, status, vendor_group, is_preferred, is_active, created_at, created_by, updated_at
)
SELECT 'CASH_VENDOR', 'Cash Vendor', 'Active', 'Local Supplier', false, true, CURRENT_TIMESTAMP, 'SYSTEM', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM vendors WHERE code = 'CASH_VENDOR' OR name = 'Cash Vendor'
);

-- 2. Backfill legacy Cash Vendor transactions that couldn't be migrated in V70
UPDATE purchase_invoices 
SET vendor_id = (SELECT id FROM vendors WHERE code = 'CASH_VENDOR' LIMIT 1)
WHERE vendor_id IS NULL AND vendor_name ILIKE '%cash vendor%';

UPDATE lpos 
SET vendor_id = (SELECT id FROM vendors WHERE code = 'CASH_VENDOR' LIMIT 1)
WHERE vendor_id IS NULL AND vendor_name ILIKE '%cash vendor%';

UPDATE grns 
SET vendor_id = (SELECT id FROM vendors WHERE code = 'CASH_VENDOR' LIMIT 1)
WHERE vendor_id IS NULL AND vendor_name ILIKE '%cash vendor%';
