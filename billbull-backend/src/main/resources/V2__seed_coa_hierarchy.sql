-- ============================================================
-- BillBull ERP — IFRS/GAAP Chart of Accounts Seed Data
-- COA Hierarchy with parentCode, level, isGroup, accountType, normalBalance
-- ============================================================

-- ===================== LEVEL 1: ROOT GROUPS =====================

INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-1000', '1000', 'Assets', 'Assets', 'Asset', NULL, 1, true, 'Dr', NULL, 0, 'Dr', 'active', false, true, NULL, false, 'ASSETS'),
('acc-2000', '2000', 'Liabilities', 'Liabilities', 'Liability', NULL, 1, true, 'Cr', NULL, 0, 'Cr', 'active', false, true, NULL, false, 'LIABILITIES'),
('acc-3000', '3000', 'Equity', 'Equity', 'Equity', NULL, 1, true, 'Cr', NULL, 0, 'Cr', 'active', false, true, NULL, false, 'EQUITY'),
('acc-4000', '4000', 'Income', 'Income', 'Income', NULL, 1, true, 'Cr', NULL, 0, 'Cr', 'active', false, true, NULL, false, 'INCOME'),
('acc-5000', '5000', 'Expenses', 'Expenses', 'Expense', NULL, 1, true, 'Dr', NULL, 0, 'Dr', 'active', false, true, NULL, false, 'EXPENSES');

-- ===================== LEVEL 2: SUB-GROUPS =====================

-- Assets Sub-Groups
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-1100', '1100', 'Current Assets', 'Assets', 'Asset', '1000', 2, true, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1500', '1500', 'Fixed Assets', 'Assets', 'Asset', '1000', 2, true, 'Dr', 'Fixed Assets', 0, 'Dr', 'active', false, true, NULL, false, 'NON_CURRENT_ASSETS');

-- Liabilities Sub-Groups
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-2100', '2100', 'Current Liabilities', 'Liabilities', 'Liability', '2000', 2, true, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'CURRENT_LIABILITIES'),
('acc-2500', '2500', 'Long-Term Liabilities', 'Liabilities', 'Liability', '2000', 2, true, 'Cr', 'Long-Term Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'NON_CURRENT_LIABILITIES');

-- Equity Sub-Groups
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-3100', '3100', 'Owner Capital', 'Equity', 'Equity', '3000', 2, true, 'Cr', 'Capital', 0, 'Cr', 'active', false, true, NULL, false, 'EQUITY'),
('acc-3200', '3200', 'Retained Earnings', 'Equity', 'Equity', '3000', 2, true, 'Cr', 'Retained Earnings', 0, 'Cr', 'active', false, true, NULL, false, 'EQUITY');

-- Income Sub-Groups
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-4100', '4100', 'Operating Revenue', 'Income', 'Income', '4000', 2, true, 'Cr', 'Operating Revenue', 0, 'Cr', 'active', false, true, NULL, false, 'REVENUE'),
('acc-4500', '4500', 'Other Income', 'Income', 'Income', '4000', 2, true, 'Cr', 'Other Income', 0, 'Cr', 'active', false, true, NULL, false, 'OTHER_INCOME');

-- Expense Sub-Groups
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-5100', '5100', 'Cost of Goods Sold', 'Expenses', 'Expense', '5000', 2, true, 'Dr', 'COGS', 0, 'Dr', 'active', false, true, NULL, false, 'COGS'),
('acc-5200', '5200', 'Operating Expenses', 'Expenses', 'Expense', '5000', 2, true, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, true, NULL, false, 'OPERATING_EXPENSES'),
('acc-5400', '5400', 'Administrative Expenses', 'Expenses', 'Expense', '5000', 2, true, 'Dr', 'Admin Expenses', 0, 'Dr', 'active', false, true, NULL, false, 'ADMIN_EXPENSES');

-- ===================== LEVEL 3: LEAF ACCOUNTS (TRANSACTABLE) =====================

-- Current Assets
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-1101', '1101', 'Cash', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', true, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1102', '1102', 'Bank', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', true, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1103', '1103', 'Petty Cash', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', true, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1104', '1104', 'Merchant Clearing Account', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1110', '1110', 'Accounts Receivable', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1111', '1111', 'PDC in Hand', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1112', '1112', 'PDC Deposited/Clearing', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, NULL, false, 'CURRENT_ASSETS'),
('acc-1120', '1120', 'Inventory', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, 'TAXABLE_PURCHASE', false, 'CURRENT_ASSETS'),
('acc-1130', '1130', 'VAT Input (Recoverable)', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, true, 'INPUT_TAX', false, 'CURRENT_ASSETS'),
('acc-1140', '1140', 'Prepaid Expenses', 'Assets', 'Asset', '1100', 3, false, 'Dr', 'Current Assets', 0, 'Dr', 'active', false, false, NULL, true, 'CURRENT_ASSETS');

-- Fixed Assets
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-1501', '1501', 'Equipment', 'Assets', 'Asset', '1500', 3, false, 'Dr', 'Fixed Assets', 0, 'Dr', 'active', false, false, NULL, true, 'NON_CURRENT_ASSETS'),
('acc-1502', '1502', 'Vehicles', 'Assets', 'Asset', '1500', 3, false, 'Dr', 'Fixed Assets', 0, 'Dr', 'active', false, false, NULL, true, 'NON_CURRENT_ASSETS'),
('acc-1503', '1503', 'Accumulated Depreciation', 'Assets', 'Asset', '1500', 3, false, 'Cr', 'Fixed Assets', 0, 'Cr', 'active', false, true, NULL, false, 'NON_CURRENT_ASSETS');

-- Current Liabilities
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-2101', '2101', 'Accounts Payable', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'CURRENT_LIABILITIES'),
('acc-2102', '2102', 'VAT Output (Payable)', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, 'OUTPUT_TAX', false, 'CURRENT_LIABILITIES'),
('acc-2103', '2103', 'GRN Clearing', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'CURRENT_LIABILITIES'),
('acc-2104', '2104', 'Customer Advance', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'CURRENT_LIABILITIES'),
('acc-2105', '2105', 'Accrued Expenses', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'CURRENT_LIABILITIES'),
('acc-2106', '2106', 'Salary Payable', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'CURRENT_LIABILITIES');

-- Long-Term Liabilities
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-2501', '2501', 'Bank Loan', 'Liabilities', 'Liability', '2500', 3, false, 'Cr', 'Long-Term Liabilities', 0, 'Cr', 'active', false, true, NULL, false, 'NON_CURRENT_LIABILITIES');

-- Equity
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-3101', '3101', 'Owner Capital', 'Equity', 'Equity', '3100', 3, false, 'Cr', 'Capital', 0, 'Cr', 'active', false, true, NULL, false, 'EQUITY'),
('acc-3201', '3201', 'Retained Earnings', 'Equity', 'Equity', '3200', 3, false, 'Cr', 'Retained Earnings', 0, 'Cr', 'active', false, true, NULL, false, 'EQUITY');

-- Operating Revenue
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-4101', '4101', 'Sales Revenue', 'Income', 'Income', '4100', 3, false, 'Cr', 'Operating Revenue', 0, 'Cr', 'active', false, false, 'TAXABLE_SALES', true, 'REVENUE'),
('acc-4102', '4102', 'Service Revenue', 'Income', 'Income', '4100', 3, false, 'Cr', 'Operating Revenue', 0, 'Cr', 'active', false, false, 'TAXABLE_SALES', true, 'REVENUE');

-- Other Income
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-4501', '4501', 'Interest Income', 'Income', 'Income', '4500', 3, false, 'Cr', 'Other Income', 0, 'Cr', 'active', false, false, NULL, true, 'OTHER_INCOME'),
('acc-4502', '4502', 'Other Income', 'Income', 'Income', '4500', 3, false, 'Cr', 'Other Income', 0, 'Cr', 'active', false, false, NULL, true, 'OTHER_INCOME');

-- COGS
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-5101', '5101', 'Cost of Goods Sold', 'Expenses', 'Expense', '5100', 3, false, 'Dr', 'COGS', 0, 'Dr', 'active', false, true, NULL, false, 'COGS'),
('acc-5102', '5102', 'Purchase Returns', 'Expenses', 'Expense', '5100', 3, false, 'Cr', 'COGS', 0, 'Cr', 'active', false, true, NULL, false, 'COGS');

-- Operating Expenses
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-5201', '5201', 'Salaries Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'OPERATING_EXPENSES'),
('acc-5202', '5202', 'Rent Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'OPERATING_EXPENSES'),
('acc-5203', '5203', 'Utilities Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'OPERATING_EXPENSES'),
('acc-5204', '5204', 'Marketing Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'OPERATING_EXPENSES'),
('acc-5205', '5205', 'Travel Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'OPERATING_EXPENSES'),
('acc-5206', '5206', 'Office Supplies Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'OPERATING_EXPENSES'),
('acc-5207', '5207', 'Depreciation Expense', 'Expenses', 'Expense', '5200', 3, false, 'Dr', 'Operating Expenses', 0, 'Dr', 'active', false, true, NULL, false, 'OPERATING_EXPENSES');

-- Administrative Expenses
INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group) VALUES
('acc-5401', '5401', 'Insurance Expense', 'Expenses', 'Expense', '5400', 3, false, 'Dr', 'Admin Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'ADMIN_EXPENSES'),
('acc-5402', '5402', 'Repairs & Maintenance', 'Expenses', 'Expense', '5400', 3, false, 'Dr', 'Admin Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'ADMIN_EXPENSES'),
('acc-5403', '5403', 'General Expense', 'Expenses', 'Expense', '5400', 3, false, 'Dr', 'Admin Expenses', 0, 'Dr', 'active', false, false, NULL, true, 'ADMIN_EXPENSES');
