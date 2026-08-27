-- ============================================================================
-- BillBull — Truncate ALL transactional data, keep master / configuration data
-- ----------------------------------------------------------------------------
-- DESTRUCTIVE AND IRREVERSIBLE. Take a full backup first:
--     pg_dump -Fc -d <db> -f backup_before_truncate.dump
-- Run against ONE tenant database at a time.
--
-- Keeps: products (+pricing/barcodes/packing/tax/media/policy), brands,
--        departments, sub-departments, units, warehouses/zones/bins/locators,
--        customers, vendors, employees, users/roles/permissions, branches,
--        company profile, outlets, chart of accounts, cost centers, currencies,
--        exchange rates, payment methods/terms, tax config, posting rules,
--        fiscal years / accounting periods, all *_settings, print & barcode &
--        message templates, POS hardware (terminals, counters, printers,
--        scanners, drawers, devices, hardware profiles), email config,
--        fixed assets.
--
-- Wipes: sales, purchases, inventory movements/stock, POS sessions & activity,
--        GL/journals/ledgers, payments/vouchers, HR payroll runs, all audit
--        logs, notifications, document sequences.
--
-- Missing tables are skipped automatically (to_regclass guard), so the same
-- script is safe across tenants on different schema versions.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    t            text;
    present      text[] := '{}';
    tables       text[] := ARRAY[

    -- ---------- SALES ----------
    'sales_invoices', 'sales_invoice_items',
    'sales_invoice_history_events', 'sales_invoice_history_event',
    'sales_orders', 'sales_order_items', 'sales_order_attachments',
    'sales_quotations', 'sales_quotation_items',
    'sales_quotation_revisions', 'sales_quotation_attachments',
    'proforma_invoices', 'proforma_invoice_items',
    'delivery_notes', 'delivery_note_items', 'delivery_note_batch_consumption',
    'sales_returns', 'sales_return_items', 'sales_return_item_batches',
    'sales_payments', 'sales_receipt_vouchers', 'receipt_vouchers',
    'credit_vouchers', 'credit_voucher_transactions',
    'advance_application',
    'customer_inquiries', 'inquiry_items', 'inquiry_followups',
    'message_logs',

    -- ---------- PURCHASE ----------
    'lpos', 'lpo_items', 'approval_history', 'approval_workflow_steps',
    'grns', 'grn_items', 'grn_item_serials',
    'purchase_invoices', 'purchase_invoice_items', 'purchase_invoice_item_serials',
    'invoice_payments', 'invoice_landed_costs',
    'purchase_returns', 'purchase_return_items',
    'payment_vouchers', 'vendor_advance',

    -- ---------- INVENTORY (movements & derived stock) ----------
    'stock_movements',
    'bin_stock', 'inventory_balance',
    'batch_master', 'batch_allocation', 'batch_print_queue',
    'serial_master',
    'stock_take_sessions', 'stock_take_items', 'stock_take_item_batches',
    'stock_take_expected_unit', 'stock_take_unit_scan',
    'stock_transfers', 'stock_transfer_items',
    'pos_stock_reservations',

    -- ---------- FINANCIALS ----------
    'journal_entries', 'journal_lines', 'journal_voucher',
    'ledger_entries', 'gl_account_balance',
    'expenses', 'expense_vouchers', 'expense_voucher_lines',
    'prepaid_expenses',
    'pdc_entries', 'card_settlements',
    'bank_statements', 'bank_statement_lines',
    'reconciliation_sessions',
    'tax_filings',
    'financial_audit_logs',
    'voucher_sequences',

    -- ---------- POS ----------
    'pos_sessions', 'pos_cash_movements', 'pos_day_closes',
    'pos_held_sales',
    'pos_layaways', 'pos_layaway_items', 'pos_layaway_payments',
    'pos_print_jobs', 'pos_audit_log',
    'pos_x_report_snapshots', 'pos_report_sequences',
    'pos_business_dates', 'pos_business_day_override',
    'pos_session_terminal_history', 'pos_session_transfer_log',
    'pos_session_denomination_corrections',
    'pos_transaction_corrections',
    'pos_correction_requests', 'pos_correction_overlays',
    'pos_correction_audit_entries',
    'pos_device_event_log', 'pos_device_health_snapshot', 'pos_discovered_device',

    -- ---------- HR (payroll transactions) ----------
    'salary_advance', 'salary_repayment_schedules', 'salary_payments',

    -- ---------- LOGS / MISC ----------
    'audit_logs', 'notifications', 'user_tasks'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
            present := present || quote_ident(t);
        ELSE
            RAISE NOTICE 'skipped (not present): %', t;
        END IF;
    END LOOP;

    IF array_length(present, 1) IS NULL THEN
        RAISE EXCEPTION 'No matching tables found — wrong database?';
    END IF;

    -- Single statement so FK order does not matter; CASCADE pulls in any
    -- child table that references one of these and was not listed.
    EXECUTE 'TRUNCATE TABLE ' || array_to_string(present, ', ')
            || ' RESTART IDENTITY CASCADE';

    RAISE NOTICE 'Truncated % tables.', array_length(present, 1);
END $$;

-- ---------------------------------------------------------------------------
-- Reset denormalised balances cached on master records
-- ---------------------------------------------------------------------------
UPDATE customer SET balance = 0, total_sales = 0;
UPDATE vendor   SET balance = COALESCE(opening_balance, 0);

COMMIT;

-- ---------------------------------------------------------------------------
-- OPTIONAL — restart document numbering from scratch.
-- Only run if you want invoice/LPO/GRN numbers to begin again at 1.
-- ---------------------------------------------------------------------------
-- UPDATE sales_document_number_settings    SET last_number = 0;
-- UPDATE purchase_document_number_settings SET last_number = 0;

-- ---------------------------------------------------------------------------
-- OPTIONAL — also clear customer opening balances (kept by default, since they
-- are part of customer master setup rather than posted transactions).
-- ---------------------------------------------------------------------------
-- TRUNCATE TABLE opening_invoice CASCADE;

-- ---------------------------------------------------------------------------
-- After running: restart the backend so the startup seeders
-- (SystemAccountSeeder, FinancialsDefaultSeeder, RBACInitializer,
--  RolePermissionInitializer) re-create anything they own, and so
-- GlBalanceRebuildJob rebuilds gl_account_balance from an empty ledger.
-- ---------------------------------------------------------------------------
