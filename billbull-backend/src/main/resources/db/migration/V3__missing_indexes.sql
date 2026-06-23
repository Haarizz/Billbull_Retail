-- V3 — Missing index pack (ARCHFIX P1 §3).
--
-- Guarded so it is safe on ANY tenant DB regardless of schema drift:
--   * table absent (fresh DB, Flyway runs before Hibernate)      -> skipped
--   * a referenced COLUMN absent (older DB pre-dating a field)    -> skipped
-- The column guard matters: on a multi-DB fleet under ddl-auto=update some legacy tables
-- never got later BaseEntity columns (e.g. customers/sales_orders/delivery_notes can lack
-- is_active), so a table-only guard would still throw "column does not exist" and abort the
-- whole migration. We create each index only when every column it references exists.
--
-- All indexes use IF NOT EXISTS so re-runs and Hibernate-created duplicates are harmless.
--
-- NOTE ON LOCKING: these use plain CREATE INDEX (transactional, brief ACCESS SHARE-blocking
-- lock). On a large, live production table prefer running the equivalent
-- CREATE INDEX CONCURRENTLY ... by hand during a maintenance window instead; this script is
-- safe for the typical per-tenant DB sizes and for fresh installs.

DO $$
DECLARE
    -- One row per desired index: index name, table, column list it depends on, and the full
    -- CREATE INDEX statement. The index is created only when the table and ALL listed columns
    -- exist. cols are the bare column names that must be present (predicate columns included).
    idx record;
    missing boolean;
    c text;
BEGIN
    FOR idx IN
        SELECT * FROM (VALUES
            -- name,                  table,                  cols (text[]),                                   ddl
            -- ============ SOFT-DELETE hot filter (is_active) ============
            ('idx_customers_active',        'customers',            ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active)'),
            ('idx_vendors_active',          'vendors',              ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active)'),
            ('idx_sales_orders_active',     'sales_orders',         ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_sales_orders_active ON sales_orders(is_active)'),
            ('idx_delivery_notes_active',   'delivery_notes',       ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_delivery_notes_active ON delivery_notes(is_active)'),
            ('idx_lpos_active',             'lpos',                 ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_lpos_active ON lpos(is_active)'),
            ('idx_grns_active',             'grns',                 ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_grns_active ON grns(is_active)'),
            ('idx_purchase_invoices_active','purchase_invoices',    ARRAY['is_active'],                         'CREATE INDEX IF NOT EXISTS idx_purchase_invoices_active ON purchase_invoices(is_active)'),

            -- ============ GENERAL LEDGER — the biggest win ============
            ('idx_ledger_acct_date',        'ledger_entries',       ARRAY['account_code','transaction_date'],   'CREATE INDEX IF NOT EXISTS idx_ledger_acct_date ON ledger_entries(account_code, transaction_date)'),
            ('idx_ledger_date',             'ledger_entries',       ARRAY['transaction_date'],                  'CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(transaction_date)'),
            ('idx_ledger_journal',          'ledger_entries',       ARRAY['journal_id'],                        'CREATE INDEX IF NOT EXISTS idx_ledger_journal ON ledger_entries(journal_id)'),
            ('idx_ledger_unrecon',          'ledger_entries',       ARRAY['account_code','is_reconciled'],      'CREATE INDEX IF NOT EXISTS idx_ledger_unrecon ON ledger_entries(account_code) WHERE is_reconciled = false'),
            ('idx_je_type_status',          'journal_entries',      ARRAY['entry_type','status'],               'CREATE INDEX IF NOT EXISTS idx_je_type_status ON journal_entries(entry_type, status)'),

            -- ============ CHILD TABLES — FK columns used in JOIN FETCH / cascade ============
            ('idx_sii_invoice',             'sales_invoice_items',  ARRAY['sales_invoice_id'],                  'CREATE INDEX IF NOT EXISTS idx_sii_invoice ON sales_invoice_items(sales_invoice_id)'),
            ('idx_soi_order',               'sales_order_items',    ARRAY['sales_order_id'],                    'CREATE INDEX IF NOT EXISTS idx_soi_order ON sales_order_items(sales_order_id)'),
            ('idx_dni_dn',                  'delivery_note_items',  ARRAY['delivery_note_id'],                  'CREATE INDEX IF NOT EXISTS idx_dni_dn ON delivery_note_items(delivery_note_id)'),
            ('idx_dni_product',             'delivery_note_items',  ARRAY['product_id'],                        'CREATE INDEX IF NOT EXISTS idx_dni_product ON delivery_note_items(product_id)'),
            ('idx_qi_quotation',            'sales_quotation_items',ARRAY['quotation_id'],                      'CREATE INDEX IF NOT EXISTS idx_qi_quotation ON sales_quotation_items(quotation_id)'),
            ('idx_pii_invoice',             'purchase_invoice_items',ARRAY['invoice_id'],                       'CREATE INDEX IF NOT EXISTS idx_pii_invoice ON purchase_invoice_items(invoice_id)'),
            ('idx_lpoi_lpo',                'lpo_items',            ARRAY['lpo_id'],                            'CREATE INDEX IF NOT EXISTS idx_lpoi_lpo ON lpo_items(lpo_id)'),
            ('idx_grni_grn',                'grn_items',            ARRAY['grn_id'],                            'CREATE INDEX IF NOT EXISTS idx_grni_grn ON grn_items(grn_id)'),
            ('idx_contact_cust',            'contact_person',       ARRAY['customer_id'],                       'CREATE INDEX IF NOT EXISTS idx_contact_cust ON contact_person(customer_id)'),
            ('idx_savedaddr_cust',          'saved_address',        ARRAY['customer_id'],                       'CREATE INDEX IF NOT EXISTS idx_savedaddr_cust ON saved_address(customer_id)'),

            -- ============ DOCUMENT LOOKUPS / STATUS / DATES ============
            ('idx_customers_status',        'customers',            ARRAY['status'],                           'CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)'),
            ('idx_customers_mobile',        'customers',            ARRAY['mobile'],                           'CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile)'),
            ('idx_customers_email',         'customers',            ARRAY['email'],                            'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)'),
            ('idx_quotation_date',          'sales_quotations',     ARRAY['date'],                             'CREATE INDEX IF NOT EXISTS idx_quotation_date ON sales_quotations(date)'),
            ('idx_quotation_status',        'sales_quotations',     ARRAY['status'],                           'CREATE INDEX IF NOT EXISTS idx_quotation_status ON sales_quotations(status)'),
            ('idx_pinv_lpo',                'purchase_invoices',    ARRAY['lpo_id'],                           'CREATE INDEX IF NOT EXISTS idx_pinv_lpo ON purchase_invoices(lpo_id)'),
            ('idx_pinv_grn',                'purchase_invoices',    ARRAY['grn_id'],                           'CREATE INDEX IF NOT EXISTS idx_pinv_grn ON purchase_invoices(grn_id)'),
            ('idx_pv_invoice',              'payment_vouchers',     ARRAY['invoice_id'],                       'CREATE INDEX IF NOT EXISTS idx_pv_invoice ON payment_vouchers(invoice_id)'),
            ('idx_grn_reference',           'grns',                 ARRAY['reference_id','source_type'],        'CREATE INDEX IF NOT EXISTS idx_grn_reference ON grns(reference_id, source_type)'),

            -- ============ INVENTORY / POS ============
            ('idx_binstock_bin_prod',       'bin_stock',            ARRAY['bin_id','product_id'],               'CREATE INDEX IF NOT EXISTS idx_binstock_bin_prod ON bin_stock(bin_id, product_id)'),
            ('idx_sm_expiry',               'stock_movements',      ARRAY['expiry_date','quantity'],            'CREATE INDEX IF NOT EXISTS idx_sm_expiry ON stock_movements(expiry_date) WHERE quantity > 0'),
            ('idx_sm_source',               'stock_movements',      ARRAY['source_type','source_id'],           'CREATE INDEX IF NOT EXISTS idx_sm_source ON stock_movements(source_type, source_id)'),
            ('idx_sti_session_prod',        'stock_take_items',     ARRAY['session_id','product_id'],           'CREATE INDEX IF NOT EXISTS idx_sti_session_prod ON stock_take_items(session_id, product_id)'),
            ('idx_pos_sess_lookup',         'pos_sessions',         ARRAY['branch_id','terminal_id','status'],  'CREATE INDEX IF NOT EXISTS idx_pos_sess_lookup ON pos_sessions(branch_id, terminal_id, status)'),
            ('idx_zone_wh',                 'warehouse_zones',      ARRAY['warehouse_id'],                      'CREATE INDEX IF NOT EXISTS idx_zone_wh ON warehouse_zones(warehouse_id)'),
            ('idx_locator_zone',            'warehouse_locators',   ARRAY['zone_id'],                          'CREATE INDEX IF NOT EXISTS idx_locator_zone ON warehouse_locators(zone_id)'),
            ('idx_bin_locator',             'warehouse_bins',       ARRAY['locator_id'],                       'CREATE INDEX IF NOT EXISTS idx_bin_locator ON warehouse_bins(locator_id)'),

            -- ============ AUDIT / TASKS ============
            ('idx_audit_user_time',         'audit_logs',           ARRAY['username','access_time'],            'CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_logs(username, access_time DESC)'),
            ('idx_audit_branch_time',       'audit_logs',           ARRAY['branch_id','access_time'],           'CREATE INDEX IF NOT EXISTS idx_audit_branch_time ON audit_logs(branch_id, access_time DESC)'),
            ('idx_task_creator',            'user_tasks',           ARRAY['created_by','is_active'],            'CREATE INDEX IF NOT EXISTS idx_task_creator ON user_tasks(created_by, is_active)')
        ) AS t(name, tbl, cols, ddl)
    LOOP
        -- skip if the table does not exist on this tenant DB
        CONTINUE WHEN to_regclass('public.' || idx.tbl) IS NULL;

        -- skip if any referenced column is missing (schema drift across the fleet)
        missing := false;
        FOREACH c IN ARRAY idx.cols LOOP
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = idx.tbl AND column_name = c
            ) THEN
                missing := true;
                EXIT;
            END IF;
        END LOOP;
        IF missing THEN
            RAISE NOTICE 'V3: skipped % (table % missing a referenced column)', idx.name, idx.tbl;
            CONTINUE;
        END IF;

        EXECUTE idx.ddl;
    END LOOP;
END $$;
