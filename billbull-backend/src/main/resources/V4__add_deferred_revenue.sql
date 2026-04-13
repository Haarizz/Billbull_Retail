-- ============================================================
-- BillBull ERP — Add Deferred Revenue Account (2107)
-- Required for IFRS 15 compliant revenue recognition:
-- Invoice posting defers revenue to 2107 (Liability).
-- Revenue is recognized only when Delivery Note is DELIVERED.
-- ============================================================

INSERT INTO accounts (id, code, name, account_group, account_type, parent_code, level, is_group, normal_balance, sub_group, balance_amount, balance_type, status, cash_flag, control_account, tax_role, allow_manualjv, report_group)
VALUES ('acc-2107', '2107', 'Deferred Revenue', 'Liabilities', 'Liability', '2100', 3, false, 'Cr', 'Current Liabilities', 0, 'Cr', 'active', false, false, NULL, false, 'CURRENT_LIABILITIES')
ON CONFLICT (id) DO NOTHING;
