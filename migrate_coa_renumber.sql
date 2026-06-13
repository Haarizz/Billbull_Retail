-- ============================================================
-- BillBull COA Renumbering Migration (v2 — seeder-already-ran)
-- The backend ran once, so both old-code and new-code rows exist
-- in the accounts table. Strategy:
--   1. Delete the empty seeder-created new-code rows (no journal data)
--   2. Rename the old-code rows to the new codes (preserves history)
--   3. Re-point parent_code references
--   4. Clean up retired groups
--   5. Fix tax config
--   6. Fix gl_account_balances cache
-- Run in pgAdmin query tool. Wrapped in a transaction — rolls back on any error.
-- ============================================================

BEGIN;

-- ── Step 1: Remove seeder-created new-code accounts ────────
-- These were inserted by SystemAccountSeeder after the code change
-- but have no journal history. We delete them so we can rename
-- the old rows (which carry history) into the same codes.
DELETE FROM accounts WHERE code IN (
    '1001','1010','1011','1012','1013',   -- new cash/bank
    '1100','1101',                         -- new AR Control, AR-PDC
    '1105','1106','1107',                  -- vendor/salary advances, CUC (codes unchanged but re-seeded)
    '1200','1201',                         -- new Inventory
    '1310','1320',                         -- new VAT Input, Prepaid (1320 unchanged)
    '2001','2002',                         -- new AP Control, GRN Clearing
    '2051','2060',                         -- new Deferred Revenue, Customer Advances
    '2100','2101',                         -- new VAT Output, VAT Payable
    '2150','2200','2201','2210','2250',    -- PDC, Salary/Deductions/Gratuity/Accrued (some unchanged)
    '3001','3100',                         -- Equity (unchanged codes, re-seeded)
    '4001','4002','4003','4004',           -- new Revenue
    '5001','5002','5003','5004','5005','5006','5999',  -- new COGS
    '6001','6002','6003','6004','6005','6006','6007','6008','6009',
    '6010','6020','6030','6040','6050','6099',          -- Op Expenses
    '7001','7002','7003','7004',           -- Other Income
    '7501','7502'                          -- Other Expenses
);

-- Also remove seeder-created new group rows that conflict with old groups
DELETE FROM accounts WHERE code IN ('1050','6000','7000','7500') AND is_group = true;

-- ── Step 2: Rename old-code accounts to new codes ──────────

-- Assets
UPDATE accounts SET code = '1001' WHERE code = '1101' AND is_group = false;  -- Cash on Hand
UPDATE accounts SET code = '1010' WHERE code = '1102' AND is_group = false;  -- Bank Account (Main)
UPDATE accounts SET code = '1011' WHERE code = '1103' AND is_group = false;  -- Bank Account (Collection)
UPDATE accounts SET code = '1013' WHERE code = '1104' AND is_group = false;  -- Merchant Clearing
UPDATE accounts SET code = '1012' WHERE code = '1108' AND is_group = false;  -- Petty Cash - Branch
UPDATE accounts SET code = '1100' WHERE code = '1110' AND is_group = false;  -- Accounts Receivable Control
UPDATE accounts SET code = '1101' WHERE code = '1150' AND is_group = false;  -- AR – Post-Dated Cheques
UPDATE accounts SET code = '1200' WHERE code = '1120' AND is_group = false;  -- Inventory – Raw/Retail
UPDATE accounts SET code = '1310' WHERE code = '1130' AND is_group = false;  -- VAT Input Tax

-- Liabilities
UPDATE accounts SET code = '2001' WHERE code = '2101' AND is_group = false;  -- Accounts Payable Control
UPDATE accounts SET code = '2002' WHERE code = '2103' AND is_group = false;  -- GRN Clearing
UPDATE accounts SET code = '2060' WHERE code = '2104' AND is_group = false;  -- Customer Advances Received
UPDATE accounts SET code = '2051' WHERE code = '2107' AND is_group = false;  -- Deferred Revenue
UPDATE accounts SET code = '2100' WHERE code = '2102' AND is_group = false;  -- VAT Output Tax
UPDATE accounts SET code = '2101' WHERE code = '2108' AND is_group = false;  -- VAT Payable (Net)
UPDATE accounts SET code = '2250' WHERE code = '7503' AND is_group = false;  -- Accrued Liabilities

-- Revenue
UPDATE accounts SET code = '4001' WHERE code = '4101' AND is_group = false;  -- Sales Revenue
UPDATE accounts SET code = '4002' WHERE code = '4102' AND is_group = false;  -- Sales Returns (old 4102)
UPDATE accounts SET code = '4004' WHERE code = '4103' AND is_group = false;  -- Delivery Income
UPDATE accounts SET code = '7003' WHERE code = '4301' AND is_group = false;  -- Trade Discount Income
UPDATE accounts SET code = '7004' WHERE code = '4302' AND is_group = false;  -- Gain on Disposal

-- COGS / Expenses
UPDATE accounts SET code = '5001' WHERE code = '5101' AND is_group = false;  -- Purchase / COGS
UPDATE accounts SET code = '5003' WHERE code = '5103' AND is_group = false;  -- Purchase Price Variance
UPDATE accounts SET code = '5004' WHERE code = '5110' AND is_group = false;  -- PPV – Returns
UPDATE accounts SET code = '5005' WHERE code = '5104' AND is_group = false;  -- Inventory Write-off
UPDATE accounts SET code = '5006' WHERE code = '5105' AND is_group = false;  -- Inventory Adjustment
UPDATE accounts SET code = '6099' WHERE code = '5403' AND is_group = false;  -- General Expense

-- ── Step 3: Rename / insert missing group accounts ─────────
-- Rename old Current Assets group 1100 → 1050
UPDATE accounts SET code = '1050' WHERE code = '1100' AND is_group = true;
-- Rename old Current Liabilities group 2100 → 2050
UPDATE accounts SET code = '2050' WHERE code = '2100' AND is_group = true;
-- Rename old Operating Expenses group 5400 → 6000
UPDATE accounts SET code = '6000' WHERE code = '5400' AND is_group = true;
-- Rename old Other Income group 4200 → 7000
UPDATE accounts SET code = '7000' WHERE code = '4200' AND is_group = true;

-- ── Step 4: Fix parent_code references ─────────────────────
-- Children that pointed to old group 1100 → now point to 1050
UPDATE accounts SET parent_code = '1050' WHERE parent_code = '1100';
-- Children that pointed to old group 2100 → now point to 2050
UPDATE accounts SET parent_code = '2050' WHERE parent_code = '2100';
-- Children that pointed to old group 5400 → now point to 6000
UPDATE accounts SET parent_code = '6000' WHERE parent_code = '5400';
-- Children that pointed to old group 4200 → now point to 7000
UPDATE accounts SET parent_code = '7000' WHERE parent_code = '4200';
-- Accounts that had no parent or wrong parent for the 7000/7500 range
UPDATE accounts SET parent_code = '7000' WHERE code IN ('7001','7002','7003','7004');
UPDATE accounts SET parent_code = '7500' WHERE code IN ('7501','7502');

-- ── Step 5: Rename codes in journal_lines ──────────────────
-- (Only needed if there are existing posted journals)
UPDATE journal_lines SET account_code = '1001' WHERE account_code = '1101';
UPDATE journal_lines SET account_code = '1010' WHERE account_code = '1102';
UPDATE journal_lines SET account_code = '1011' WHERE account_code = '1103';
UPDATE journal_lines SET account_code = '1013' WHERE account_code = '1104';
UPDATE journal_lines SET account_code = '1012' WHERE account_code = '1108';
UPDATE journal_lines SET account_code = '1100' WHERE account_code = '1110';
UPDATE journal_lines SET account_code = '1101' WHERE account_code = '1150';
UPDATE journal_lines SET account_code = '1200' WHERE account_code = '1120';
UPDATE journal_lines SET account_code = '1310' WHERE account_code = '1130';
UPDATE journal_lines SET account_code = '2001' WHERE account_code = '2101';
UPDATE journal_lines SET account_code = '2002' WHERE account_code = '2103';
UPDATE journal_lines SET account_code = '2060' WHERE account_code = '2104';
UPDATE journal_lines SET account_code = '2051' WHERE account_code = '2107';
UPDATE journal_lines SET account_code = '2100' WHERE account_code = '2102';
UPDATE journal_lines SET account_code = '2101' WHERE account_code = '2108';
UPDATE journal_lines SET account_code = '4001' WHERE account_code = '4101';
UPDATE journal_lines SET account_code = '4002' WHERE account_code = '4102';
UPDATE journal_lines SET account_code = '4004' WHERE account_code = '4103';
UPDATE journal_lines SET account_code = '7003' WHERE account_code = '4301';
UPDATE journal_lines SET account_code = '7004' WHERE account_code = '4302';
UPDATE journal_lines SET account_code = '5001' WHERE account_code = '5101';
UPDATE journal_lines SET account_code = '5003' WHERE account_code = '5103';
UPDATE journal_lines SET account_code = '5004' WHERE account_code = '5110';
UPDATE journal_lines SET account_code = '5005' WHERE account_code = '5104';
UPDATE journal_lines SET account_code = '5006' WHERE account_code = '5105';
UPDATE journal_lines SET account_code = '6099' WHERE account_code = '5403';
UPDATE journal_lines SET account_code = '2250' WHERE account_code = '7503';

-- ── Step 6: Fix tax configuration ──────────────────────────
-- accounts is an @ElementCollection stored in a join table (tax_configuration_accounts).
-- Find the VAT config id, then update the two account code rows in the join table.
UPDATE tax_configuration_accounts
   SET accounts = '1310'
 WHERE accounts = '1130'
   AND tax_configuration_id = (SELECT id FROM tax_configurations WHERE type = 'VAT');

UPDATE tax_configuration_accounts
   SET accounts = '2100'
 WHERE accounts = '2102'
   AND tax_configuration_id = (SELECT id FROM tax_configurations WHERE type = 'VAT');

-- ── Step 7: Fix gl_account_balances cache ──────────────────
UPDATE gl_account_balances SET account_code = '1001' WHERE account_code = '1101';
UPDATE gl_account_balances SET account_code = '1010' WHERE account_code = '1102';
UPDATE gl_account_balances SET account_code = '1011' WHERE account_code = '1103';
UPDATE gl_account_balances SET account_code = '1013' WHERE account_code = '1104';
UPDATE gl_account_balances SET account_code = '1012' WHERE account_code = '1108';
UPDATE gl_account_balances SET account_code = '1100' WHERE account_code = '1110';
UPDATE gl_account_balances SET account_code = '1101' WHERE account_code = '1150';
UPDATE gl_account_balances SET account_code = '1200' WHERE account_code = '1120';
UPDATE gl_account_balances SET account_code = '1310' WHERE account_code = '1130';
UPDATE gl_account_balances SET account_code = '2001' WHERE account_code = '2101';
UPDATE gl_account_balances SET account_code = '2002' WHERE account_code = '2103';
UPDATE gl_account_balances SET account_code = '2060' WHERE account_code = '2104';
UPDATE gl_account_balances SET account_code = '2051' WHERE account_code = '2107';
UPDATE gl_account_balances SET account_code = '2100' WHERE account_code = '2102';
UPDATE gl_account_balances SET account_code = '2101' WHERE account_code = '2108';
UPDATE gl_account_balances SET account_code = '4001' WHERE account_code = '4101';
UPDATE gl_account_balances SET account_code = '4002' WHERE account_code = '4102';
UPDATE gl_account_balances SET account_code = '4004' WHERE account_code = '4103';
UPDATE gl_account_balances SET account_code = '7003' WHERE account_code = '4301';
UPDATE gl_account_balances SET account_code = '7004' WHERE account_code = '4302';
UPDATE gl_account_balances SET account_code = '5001' WHERE account_code = '5101';
UPDATE gl_account_balances SET account_code = '5003' WHERE account_code = '5103';
UPDATE gl_account_balances SET account_code = '5004' WHERE account_code = '5110';
UPDATE gl_account_balances SET account_code = '5005' WHERE account_code = '5104';
UPDATE gl_account_balances SET account_code = '5006' WHERE account_code = '5105';
UPDATE gl_account_balances SET account_code = '6099' WHERE account_code = '5403';
UPDATE gl_account_balances SET account_code = '2250' WHERE account_code = '7503';

COMMIT;
