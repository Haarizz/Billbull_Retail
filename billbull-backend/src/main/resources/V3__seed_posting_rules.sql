-- ============================================================
-- BillBull ERP — Default Posting Rules Seed Data
-- Maps transaction types to COA accounts
-- ============================================================

-- ===================== SALES INVOICE =====================
INSERT INTO posting_rules (transaction_type, line_label, debit_account_code, credit_account_code, description, is_active, sort_order) VALUES
('SALES_INVOICE', 'Accounts Receivable', '1110', NULL, 'Debit AR for invoice total', true, 1),
('SALES_INVOICE', 'Sales Revenue', NULL, '4101', 'Credit Sales Revenue for subtotal', true, 2),
('SALES_INVOICE', 'VAT Output', NULL, '2102', 'Credit VAT Output for tax amount', true, 3);

-- ===================== PURCHASE INVOICE =====================
INSERT INTO posting_rules (transaction_type, line_label, debit_account_code, credit_account_code, description, is_active, sort_order) VALUES
('PURCHASE_INVOICE', 'Inventory', '1120', NULL, 'Debit Inventory for subtotal', true, 1),
('PURCHASE_INVOICE', 'VAT Input', '1130', NULL, 'Debit VAT Input for tax amount', true, 2),
('PURCHASE_INVOICE', 'Accounts Payable', NULL, '2101', 'Credit AP for grand total', true, 3);

-- ===================== PAYMENT VOUCHER =====================
INSERT INTO posting_rules (transaction_type, line_label, debit_account_code, credit_account_code, description, is_active, sort_order) VALUES
('PAYMENT_VOUCHER', 'Accounts Payable', '2101', NULL, 'Debit AP to reduce payable', true, 1),
('PAYMENT_VOUCHER', 'Bank', NULL, '1102', 'Credit Bank for payment amount', true, 2);

-- ===================== RECEIPT VOUCHER =====================
INSERT INTO posting_rules (transaction_type, line_label, debit_account_code, credit_account_code, description, is_active, sort_order) VALUES
('RECEIPT_VOUCHER', 'Bank', '1102', NULL, 'Debit Bank for receipt amount', true, 1),
('RECEIPT_VOUCHER', 'Accounts Receivable', NULL, '1110', 'Credit AR to reduce receivable', true, 2);

-- ===================== EXPENSE =====================
INSERT INTO posting_rules (transaction_type, line_label, debit_account_code, credit_account_code, description, is_active, sort_order) VALUES
('EXPENSE', 'Expense Account', '5403', NULL, 'Debit Expense account for amount', true, 1),
('EXPENSE', 'VAT Input', '1130', NULL, 'Debit VAT Input for tax amount', true, 2),
('EXPENSE', 'Bank', NULL, '1102', 'Credit Bank for total payment', true, 3);

-- ===================== GRN =====================
INSERT INTO posting_rules (transaction_type, line_label, debit_account_code, credit_account_code, description, is_active, sort_order) VALUES
('GRN', 'Inventory', '1120', NULL, 'Debit Inventory for goods received', true, 1),
('GRN', 'GRN Clearing', NULL, '2103', 'Credit GRN Clearing (cleared on Purchase Invoice)', true, 2);

-- ===================== DEFAULT PAYMENT METHODS =====================
INSERT INTO payment_methods (name, code, account_code, is_active, description) VALUES
('Cash', 'CASH', '1101', true, 'Cash payment from Cash account'),
('Bank Transfer', 'BANK', '1102', true, 'Bank transfer from Bank account'),
('Credit Card', 'CARD', '1150', true, 'Credit card payment through Card Clearing Account'),
('Online Gateway', 'ONLINE', '1160', true, 'Online payment through Payment Gateway Account'),
('Petty Cash', 'PETTY', '1103', true, 'Petty cash payment');
