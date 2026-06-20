-- V3 — Missing index pack (ARCHFIX P1 §3).
--
-- Every statement is guarded by to_regclass so it no-ops on a fresh DB where Hibernate has
-- not yet created the table (Flyway runs before Hibernate). All indexes use IF NOT EXISTS
-- so re-runs and Hibernate-created duplicates are harmless.
--
-- NOTE ON LOCKING: these use plain CREATE INDEX (transactional, brief ACCESS SHARE-blocking
-- lock). On a large, live production table prefer running the equivalent
-- CREATE INDEX CONCURRENTLY ... by hand during a maintenance window instead; this script is
-- safe for the typical per-tenant DB sizes and for fresh installs.

DO $$
BEGIN
    -- ============ SOFT-DELETE hot filter (is_active) ============
    IF to_regclass('public.customers')        IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_customers_active        ON customers(is_active); END IF;
    IF to_regclass('public.vendors')          IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_vendors_active          ON vendors(is_active); END IF;
    IF to_regclass('public.sales_orders')     IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_sales_orders_active     ON sales_orders(is_active); END IF;
    IF to_regclass('public.delivery_notes')   IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_delivery_notes_active   ON delivery_notes(is_active); END IF;
    IF to_regclass('public.lpos')             IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_lpos_active             ON lpos(is_active); END IF;
    IF to_regclass('public.grns')             IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_grns_active             ON grns(is_active); END IF;
    IF to_regclass('public.purchase_invoices')IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_purchase_invoices_active ON purchase_invoices(is_active); END IF;

    -- ============ GENERAL LEDGER — the biggest win ============
    IF to_regclass('public.ledger_entries') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_ledger_acct_date ON ledger_entries(account_code, transaction_date);
        CREATE INDEX IF NOT EXISTS idx_ledger_date      ON ledger_entries(transaction_date);
        CREATE INDEX IF NOT EXISTS idx_ledger_journal   ON ledger_entries(journal_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_unrecon   ON ledger_entries(account_code) WHERE is_reconciled = false;
    END IF;
    IF to_regclass('public.journal_entries') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_je_type_status ON journal_entries(entry_type, status);
    END IF;

    -- ============ CHILD TABLES — FK columns used in JOIN FETCH / cascade ============
    IF to_regclass('public.sales_invoice_items')   IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_sii_invoice    ON sales_invoice_items(sales_invoice_id); END IF;
    IF to_regclass('public.sales_order_items')     IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_soi_order      ON sales_order_items(sales_order_id); END IF;
    IF to_regclass('public.delivery_note_items')   IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_dni_dn      ON delivery_note_items(delivery_note_id);
        CREATE INDEX IF NOT EXISTS idx_dni_product ON delivery_note_items(product_id);
    END IF;
    IF to_regclass('public.sales_quotation_items') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_qi_quotation   ON sales_quotation_items(quotation_id); END IF;
    IF to_regclass('public.purchase_invoice_items')IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_pii_invoice    ON purchase_invoice_items(invoice_id); END IF;
    IF to_regclass('public.lpo_items')             IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_lpoi_lpo       ON lpo_items(lpo_id); END IF;
    IF to_regclass('public.grn_items')             IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_grni_grn       ON grn_items(grn_id); END IF;
    IF to_regclass('public.contact_person')        IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_contact_cust   ON contact_person(customer_id); END IF;
    IF to_regclass('public.saved_address')         IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_savedaddr_cust ON saved_address(customer_id); END IF;

    -- ============ DOCUMENT LOOKUPS / STATUS / DATES ============
    IF to_regclass('public.customers') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
        CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
        CREATE INDEX IF NOT EXISTS idx_customers_email  ON customers(email);
    END IF;
    IF to_regclass('public.sales_quotations') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_quotation_date   ON sales_quotations(date);
        CREATE INDEX IF NOT EXISTS idx_quotation_status ON sales_quotations(status);
    END IF;
    IF to_regclass('public.purchase_invoices') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_pinv_lpo ON purchase_invoices(lpo_id);
        CREATE INDEX IF NOT EXISTS idx_pinv_grn ON purchase_invoices(grn_id);
    END IF;
    IF to_regclass('public.payment_vouchers') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_pv_invoice ON payment_vouchers(invoice_id); END IF;
    IF to_regclass('public.grns')             IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_grn_reference ON grns(reference_id, source_type); END IF;

    -- ============ INVENTORY / POS ============
    IF to_regclass('public.bin_stock')         IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_binstock_bin_prod ON bin_stock(bin_id, product_id); END IF;
    IF to_regclass('public.stock_movements')   IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_sm_expiry ON stock_movements(expiry_date) WHERE quantity > 0;
        CREATE INDEX IF NOT EXISTS idx_sm_source ON stock_movements(source_type, source_id);
    END IF;
    IF to_regclass('public.stock_take_items')  IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_sti_session_prod ON stock_take_items(session_id, product_id); END IF;
    IF to_regclass('public.pos_sessions')      IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_pos_sess_lookup  ON pos_sessions(branch_id, terminal_id, status); END IF;
    IF to_regclass('public.warehouse_zones')   IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_zone_wh      ON warehouse_zones(warehouse_id); END IF;
    IF to_regclass('public.warehouse_locators')IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_locator_zone ON warehouse_locators(zone_id); END IF;
    IF to_regclass('public.warehouse_bins')    IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_bin_locator  ON warehouse_bins(locator_id); END IF;

    -- ============ AUDIT / TASKS ============
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_audit_user_time   ON audit_logs(username, access_time DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_branch_time ON audit_logs(branch_id, access_time DESC);
    END IF;
    IF to_regclass('public.user_tasks') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_task_creator ON user_tasks(created_by, is_active); END IF;
END $$;
