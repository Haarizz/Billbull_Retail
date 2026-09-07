-- =====================================================================================
-- BillBull — Transactional Data Reset
-- =====================================================================================
-- Target   : PostgreSQL (verified against PostgreSQL 18, schema "public", 171 tables)
-- Purpose  : Remove ALL business/transactional history while preserving every master,
--            configuration and reference record, so the tenant can immediately start
--            processing fresh sales and purchases.
-- Derived  : From the live schema (pg_constraint FK graph, pg_trigger, pg_sequences)
--            cross-checked against the JPA entities in com.billbull.backend.*
--
-- !! READ BEFORE RUNNING !!
--   0. NEVER PASTE THIS FILE INTO AN INTERACTIVE psql SESSION. Run it only with
--      `psql -v ON_ERROR_STOP=1 -f <this file>`. Pasting lets terminal echo shred the
--      multi-line statements: BEGIN and the ALTER TABLE ... DISABLE TRIGGER get lost, so
--      every DELETE runs in autocommit with no transaction to roll back, and the DO
--      blocks fragment into syntax errors. This has actually happened — do not risk it.
--   1. TAKE A FULL BACKUP:  pg_dump -Fc -h <host> -U <user> -d <db> -f pre_reset.dump
--   2. STOP the BillBull backend. Scheduled jobs (PosSessionScheduler,
--      PosDeviceHealthSweepJob, PosPrintJobTimeoutSweepJob, GlBalanceRebuildJob,
--      AuditLogRetentionJob) and the POS terminals must not be writing during the run.
--   3. Run the DRY-RUN block (Section 0) first and eyeball the numbers.
--
-- HOW TO RUN — two passes of this same file, always with -v ON_ERROR_STOP=1:
--   Pass 1 (rehearsal): run the file as-is. Section 1 deletes inside ONE transaction,
--           Section 2 validates inside that same open transaction, then ROLLBACK undoes
--           everything. Read the PASS/FAIL output. Nothing is changed. Section 1B ends
--           the run with a deliberate 'ABORT: N transactional rows still present' — that
--           is the guard doing its job, not a failure.
--   Pass 2 (commit):    swap the final ROLLBACK for COMMIT and re-run the whole file.
--           The deletes commit, and Section 1B then resets the sequences automatically
--           because its guard now sees zero rows. Sequence resets live outside the
--           transaction because setval() is NOT transactional — see the note there.
--
--   -v ON_ERROR_STOP=1 is required on Pass 2: without it, a failure part-way through
--   Section 1 would still reach COMMIT and commit a partial reset.
--
-- Requires : a role able to ALTER TABLE ... DISABLE TRIGGER on pos_day_closes
--            (table owner or superuser). Nothing else needs elevated rights.
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — DRY RUN (read-only; safe to run any time, on a live system)
-- =====================================================================================
-- 0.1 Row counts for every table that WILL BE CLEARED.
SELECT t.tbl AS table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.tbl),
                           false, true, '')))[1]::text::bigint AS row_count
FROM (VALUES
  -- POS
  ('pos_layaway_payments'),('pos_layaway_items'),('pos_layaways'),('pos_held_sales'),
  ('pos_cash_movements'),('pos_session_denomination_corrections'),
  ('pos_correction_audit_entries'),('pos_correction_overlays'),('pos_correction_requests'),
  ('pos_transaction_corrections'),('pos_session_transfer_log'),('pos_session_terminal_history'),
  ('pos_x_report_snapshots'),('pos_report_sequences'),('pos_print_jobs'),
  ('pos_stock_reservations'),('pos_device_event_log'),('pos_device_health_snapshot'),
  ('pos_discovered_device'),('pos_audit_log'),('pos_business_day_override'),
  ('pos_day_closes'),('pos_sessions'),('pos_business_dates'),
  -- Sales
  ('delivery_note_batch_consumptions'),('delivery_note_items'),('delivery_notes'),
  ('sales_return_item_batches'),('sales_return_items'),('sales_returns'),
  ('credit_voucher_transactions'),('credit_vouchers'),('advance_applications'),
  ('sales_receipt_vouchers'),('sales_payments'),('sales_invoice_history_events'),
  ('sales_invoice_items'),('sales_invoices'),('sales_order_attachments'),('sales_order_items'),
  ('sales_orders'),('sales_quotation_attachments'),('sales_quotation_revisions'),
  ('sales_quotation_items'),('sales_quotations'),('proforma_invoice_items'),('proforma_invoices'),
  ('inquiry_followups'),('inquiry_items'),('customer_inquiries'),
  -- Purchase
  ('invoice_payments'),('invoice_landed_costs'),('purchase_invoice_item_serials'),
  ('purchase_invoice_items'),('payment_vouchers'),('purchase_invoices'),
  ('purchase_return_items'),('purchase_returns'),('grn_item_serials'),('grn_items'),('grns'),
  ('lpo_items'),('lpos'),('vendor_advances'),('approval_history'),
  -- Inventory
  ('batch_print_queue'),('batch_allocation'),('batch_master'),('serial_master'),('bin_stock'),
  ('stock_take_unit_scans'),('stock_take_expected_units'),('stock_take_item_batches'),
  ('stock_take_items'),('stock_take_sessions'),('stock_transfer_items'),('stock_transfers'),
  ('stock_movements'),('inventory_balances'),
  -- Financials
  ('financial_audit_logs'),('tax_filings'),('bank_statement_lines'),('bank_statements'),
  ('reconciliation_sessions'),('card_settlements'),('pdc_entries'),('expense_voucher_lines'),
  ('expense_vouchers'),('expenses'),('prepaid_expenses'),('fixed_assets'),
  ('journal_lines'),('journal_entries'),('ledger_entries'),('gl_account_balances'),
  ('voucher_sequences'),
  -- HR
  ('salary_repayment_schedules'),('salary_advance'),('salary_payments'),
  -- Operational noise
  ('notifications'),('message_logs'),('user_tasks')
) AS t(tbl)
ORDER BY 2 DESC, 1;

-- 0.2 Row counts for the PROTECTED master tables — record these, they must NOT change.
SELECT t.tbl AS protected_table,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.tbl),
                           false, true, '')))[1]::text::bigint AS row_count
FROM (VALUES
  ('products'),('product_barcodes'),('product_packings'),('product_pricing'),('product_tax'),
  ('product_media'),('product_branch_pricing'),('product_inventory_policy'),
  ('brands'),('brand_tags'),('departments'),('sub_departments'),('units'),
  ('customers'),('contact_person'),('saved_address'),('customer_document'),
  ('customer_branch_allocations'),('opening_invoice'),
  ('vendors'),('vendor_branch_allocations'),
  ('warehouses'),('warehouse_zones'),('warehouse_locators'),('warehouse_bins'),
  ('branches'),('outlets'),('company_profile'),('email_config'),
  ('users'),('user_roles'),('user_branches'),('roles'),('role_permissions'),
  ('user_favourite_products'),('employees'),
  ('accounts'),('cost_centers'),('currencies'),('exchange_rates'),
  ('fiscal_years'),('accounting_periods'),('payment_methods'),('payment_terms'),
  ('posting_rules'),('tax_configurations'),('tax_configuration_accounts'),
  ('branch_tax_configuration'),
  ('pos_terminals'),('pos_counters'),('pos_printers'),('pos_scanners'),('pos_devices'),
  ('pos_cash_drawers'),('pos_cash_movement_categories'),('pos_settings'),
  ('pos_hardware_profile'),('pos_hardware_profile_device'),
  ('print_templates'),('barcode_templates'),('message_templates'),
  ('sales_settings'),('sales_document_number_settings'),
  ('purchase_settings'),('purchase_document_number_settings'),
  ('inventory_settings'),('approval_workflow_steps'),
  ('audit_logs'),('flyway_schema_history')
) AS t(tbl)
ORDER BY 1;


-- =====================================================================================
-- SECTION 1 — DESTRUCTIVE RESET (one transaction, dependency-ordered)
-- =====================================================================================
BEGIN;

-- Fail fast rather than queue behind a live POS terminal holding a row lock.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30min';

-- ---------------------------------------------------------------------------------
-- 1.0  Trigger handling
-- ---------------------------------------------------------------------------------
-- pos_day_closes carries trg_pos_day_close_immutable — a BEFORE DELETE OR UPDATE
-- trigger that unconditionally RAISEs 'DAY_CLOSE_IMMUTABLE'. It exists to stop
-- tampering with closed Z-report data; a deliberate, backed-up reset is exactly the
-- case it is not meant to cover, so it is disabled for this table only and restored
-- at the end of the same transaction. If this transaction rolls back, the DISABLE
-- rolls back with it — the guard can never be left off by a failed run.
ALTER TABLE public.pos_day_closes DISABLE TRIGGER trg_pos_day_close_immutable;

-- NOT disabled, deliberately:
--   * trg_period_lock (journal_entries, ledger_entries) — BEFORE INSERT/UPDATE only,
--     so DELETEs pass through untouched.
--   * trg_double_entry_balance (journal_lines) — a DEFERRABLE INITIALLY DEFERRED
--     constraint trigger. Deleting every line of an entry leaves SUM(debit)=SUM(credit)=0,
--     which the function explicitly treats as balanced. Because it is deferred, the
--     check runs at COMMIT, after journal_lines is already empty. No action needed.
-- Foreign keys are NOT disabled anywhere: every FK in this schema is ON DELETE NO ACTION,
-- and the order below deletes children before parents, so referential integrity is
-- enforced by the database throughout the run.

-- ---------------------------------------------------------------------------------
-- 1.1  POS operations  (sessions, day closes, corrections, device telemetry)
-- ---------------------------------------------------------------------------------
DELETE FROM public.pos_layaway_payments;
DELETE FROM public.pos_layaway_items;
DELETE FROM public.pos_layaways;
DELETE FROM public.pos_held_sales;
DELETE FROM public.pos_cash_movements;                    -- FK -> pos_sessions
DELETE FROM public.pos_session_denomination_corrections;
DELETE FROM public.pos_correction_audit_entries;
DELETE FROM public.pos_correction_overlays;
DELETE FROM public.pos_correction_requests;
DELETE FROM public.pos_transaction_corrections;
DELETE FROM public.pos_session_transfer_log;
DELETE FROM public.pos_session_terminal_history;
DELETE FROM public.pos_x_report_snapshots;
DELETE FROM public.pos_report_sequences;                  -- per-day X/Z numbering
DELETE FROM public.pos_print_jobs;
DELETE FROM public.pos_stock_reservations;
DELETE FROM public.pos_device_event_log;
DELETE FROM public.pos_device_health_snapshot;
DELETE FROM public.pos_discovered_device;                 -- rediscovered by DiscoveryService
DELETE FROM public.pos_audit_log;
DELETE FROM public.pos_business_day_override;
DELETE FROM public.pos_day_closes;                        -- trigger disabled above
DELETE FROM public.pos_sessions;
DELETE FROM public.pos_business_dates;                    -- re-seeds to clock.now() per branch

-- ---------------------------------------------------------------------------------
-- 1.2  Sales cycle  (children -> allocations -> payments -> headers)
-- ---------------------------------------------------------------------------------
DELETE FROM public.delivery_note_batch_consumptions;
DELETE FROM public.delivery_note_items;                   -- FK -> delivery_notes, products
DELETE FROM public.delivery_notes;                        -- FK -> sales_invoices (delete first)
DELETE FROM public.sales_return_item_batches;
DELETE FROM public.sales_return_items;
DELETE FROM public.sales_returns;
DELETE FROM public.credit_voucher_transactions;           -- redemption ledger
DELETE FROM public.credit_vouchers;                       -- issued from returns = transactional
DELETE FROM public.advance_applications;                  -- advance receipt -> invoice allocation
DELETE FROM public.sales_receipt_vouchers;                -- customer receipts (RV)
DELETE FROM public.sales_payments;
DELETE FROM public.sales_invoice_history_events;
DELETE FROM public.sales_invoice_items;
DELETE FROM public.sales_invoices;
DELETE FROM public.sales_order_attachments;
DELETE FROM public.sales_order_items;
DELETE FROM public.sales_orders;
DELETE FROM public.sales_quotation_attachments;
DELETE FROM public.sales_quotation_revisions;
DELETE FROM public.sales_quotation_items;
DELETE FROM public.sales_quotations;
DELETE FROM public.proforma_invoice_items;
DELETE FROM public.proforma_invoices;
-- CRM inquiry pipeline. See Section C — comment these three out to retain open leads.
DELETE FROM public.inquiry_followups;
DELETE FROM public.inquiry_items;
DELETE FROM public.customer_inquiries;

-- ---------------------------------------------------------------------------------
-- 1.3  Purchase cycle
-- ---------------------------------------------------------------------------------
DELETE FROM public.invoice_payments;                      -- FK -> purchase_invoices
DELETE FROM public.invoice_landed_costs;                  -- FK -> purchase_invoices
DELETE FROM public.purchase_invoice_item_serials;
DELETE FROM public.purchase_invoice_items;
DELETE FROM public.payment_vouchers;                      -- FK -> purchase_invoices (delete first)
DELETE FROM public.purchase_invoices;                     -- FK -> grns, lpos, vendors
DELETE FROM public.purchase_return_items;
DELETE FROM public.purchase_returns;
DELETE FROM public.grn_item_serials;
DELETE FROM public.grn_items;
DELETE FROM public.grns;                                  -- FK -> lpos, vendors
DELETE FROM public.lpo_items;
DELETE FROM public.lpos;
DELETE FROM public.vendor_advances;
DELETE FROM public.approval_history;                      -- LPO approval trail (instances)
-- NOTE: approval_workflow_steps is the workflow DEFINITION -> KEPT.

-- ---------------------------------------------------------------------------------
-- 1.4  Inventory movement, lots, serials and derived balances
-- ---------------------------------------------------------------------------------
DELETE FROM public.batch_print_queue;
DELETE FROM public.batch_allocation;                      -- FK -> batch_master
DELETE FROM public.batch_master;                          -- lots created by receipts/stock-take
DELETE FROM public.serial_master;                         -- serials created by receipts
DELETE FROM public.bin_stock;                             -- per-bin on-hand state
DELETE FROM public.stock_take_unit_scans;
DELETE FROM public.stock_take_expected_units;
DELETE FROM public.stock_take_item_batches;
DELETE FROM public.stock_take_items;
DELETE FROM public.stock_take_sessions;
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_transfers;
DELETE FROM public.stock_movements;                       -- THE inventory source of truth
DELETE FROM public.inventory_balances;                    -- SUM(stock_movements) cache

-- ---------------------------------------------------------------------------------
-- 1.5  Financials / GL
-- ---------------------------------------------------------------------------------
DELETE FROM public.financial_audit_logs;                  -- finance business-event trail
DELETE FROM public.tax_filings;                           -- FK -> tax_configurations (kept)
DELETE FROM public.bank_statement_lines;
DELETE FROM public.bank_statements;
DELETE FROM public.reconciliation_sessions;
DELETE FROM public.card_settlements;
DELETE FROM public.pdc_entries;
DELETE FROM public.expense_voucher_lines;
DELETE FROM public.expense_vouchers;
DELETE FROM public.expenses;
DELETE FROM public.prepaid_expenses;                      -- see Section C before running
DELETE FROM public.fixed_assets;                          -- see Section C before running
DELETE FROM public.journal_lines;                         -- deferred balance trigger passes at 0=0
DELETE FROM public.journal_entries;
DELETE FROM public.ledger_entries;
DELETE FROM public.gl_account_balances;                   -- SUM(journal_lines) cache
DELETE FROM public.voucher_sequences;                     -- per branch/FY last_number

-- ---------------------------------------------------------------------------------
-- 1.6  HR payroll transactions
-- ---------------------------------------------------------------------------------
DELETE FROM public.salary_repayment_schedules;            -- FK -> salary_advance
DELETE FROM public.salary_advance;
DELETE FROM public.salary_payments;

-- ---------------------------------------------------------------------------------
-- 1.7  Operational noise generated by transactions
-- ---------------------------------------------------------------------------------
DELETE FROM public.notifications;
DELETE FROM public.message_logs;                          -- sent-message log (templates kept)
DELETE FROM public.user_tasks;
-- security.AuditLog (audit_logs) is intentionally NOT cleared — see Section C / §7.
-- To purge it too (compliance sign-off required), uncomment:
-- DELETE FROM public.audit_logs;

-- ---------------------------------------------------------------------------------
-- 1.8  Derived / accumulated state carried on MASTER rows
--      (the rows stay; only transaction-derived columns are reset)
-- ---------------------------------------------------------------------------------

-- Product sales accumulators (Product.totalQuantitySold / lastSoldAt).
UPDATE public.products
   SET total_quantity_sold = 0,
       last_sold_at        = NULL
 WHERE total_quantity_sold <> 0 OR last_sold_at IS NOT NULL;

-- Customer opening balances.
-- Customer.balance is NOT "sales outstanding" — it is SUM(opening_invoice.outstanding),
-- maintained by ReceiptVoucherService.syncCustomerOpeningBalance(). Receipts we just
-- deleted had decremented opening_invoice.outstanding, so restore each opening invoice
-- to its full unpaid amount first, then recompute the customer roll-up.
-- resolveOpeningBalanceAmount() precedence: opening_balance_amount > outstanding > amount.
UPDATE public.opening_invoice
   SET outstanding = COALESCE(NULLIF(opening_balance_amount, 0),
                              NULLIF(outstanding, 0),
                              amount,
                              0);

UPDATE public.customers c
   SET balance = COALESCE((SELECT SUM(GREATEST(oi.outstanding, 0))
                             FROM public.opening_invoice oi
                            WHERE oi.customer_id = c.id), 0);

-- Customer.totalSales is recomputed on every list call as (balance + SUM(invoice totals));
-- zero the stored column so a stale value can never be shown before the first refresh.
UPDATE public.customers SET total_sales = 0 WHERE total_sales <> 0;

-- Vendor running balance is transaction-derived; the migrated opening balance is master.
UPDATE public.vendors
   SET balance = COALESCE(opening_balance, 0)
 WHERE balance IS DISTINCT FROM COALESCE(opening_balance, 0);

-- POS terminals: drop dangling references to the sessions we just deleted, and clear
-- any supervisor lock left over from a live session. Terminal identity/registration is
-- master data and is preserved.
UPDATE public.pos_terminals
   SET current_open_session_id = NULL,
       locked_session_id       = NULL,
       locked_at               = NULL,
       locked_reason           = NULL
 WHERE current_open_session_id IS NOT NULL
    OR locked_session_id IS NOT NULL
    OR locked_at IS NOT NULL
    OR locked_reason IS NOT NULL;

-- Cash drawer kick telemetry (device config itself is master).
-- Nullability of these two columns differs between tenants — last_kick_result is NOT NULL
-- on some deployments — so each column is cleared only where the schema allows NULL.
-- Purely cosmetic telemetry; a tenant that cannot null it simply keeps the last value.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='pos_cash_drawers'
                  AND column_name='last_kick_at' AND is_nullable='YES') THEN
        UPDATE public.pos_cash_drawers SET last_kick_at = NULL WHERE last_kick_at IS NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='pos_cash_drawers'
                  AND column_name='last_kick_result' AND is_nullable='YES') THEN
        UPDATE public.pos_cash_drawers SET last_kick_result = NULL WHERE last_kick_result IS NOT NULL;
    END IF;
END $$;

-- Document numbering: the CONFIGURATION rows (prefix, label, enabled flag) are master and
-- stay; only the counters restart, which is safe because every document that consumed a
-- number has been deleted above. Do NOT run this half of the reset without the other.
UPDATE public.sales_document_number_settings    SET next_number = 1 WHERE next_number <> 1;
UPDATE public.purchase_document_number_settings SET next_number = 1 WHERE next_number <> 1;

-- Reopen closed accounting periods so fresh postings are not rejected by trg_period_lock.
-- Comment out if the client intends to keep prior periods locked.
UPDATE public.accounting_periods SET status = 'Open' WHERE status = 'Closed';

-- ---------------------------------------------------------------------------------
-- 1.9  Restore the day-close immutability guard, then end the transaction.
--      NOTE: sequence resets deliberately do NOT live in here — see SECTION 1B.
-- ---------------------------------------------------------------------------------
ALTER TABLE public.pos_day_closes ENABLE TRIGGER trg_pos_day_close_immutable;

-- (transaction deliberately left OPEN — Section 2 validates inside it, and the
--  ROLLBACK/COMMIT decision is the very last statement of this file.)


-- =====================================================================================
-- SECTION 2 — POST-CLEANUP VALIDATION  (runs INSIDE the still-open transaction)
-- Every row of 2.1 and 2.2 must read PASS. Because the transaction is still open, this
-- is a full rehearsal: run the file as-is, read the results, and only then flip the
-- final ROLLBACK to COMMIT. The same section can be re-run standalone after COMMIT.
-- =====================================================================================

-- 2.1 Transactional tables must be empty.
WITH checks(label, n) AS (
  SELECT 'sales invoices',        (SELECT count(*) FROM public.sales_invoices)
                                + (SELECT count(*) FROM public.sales_invoice_items)
                                + (SELECT count(*) FROM public.sales_invoice_history_events)
  UNION ALL SELECT 'sales returns / credit vouchers',
                                  (SELECT count(*) FROM public.sales_returns)
                                + (SELECT count(*) FROM public.sales_return_items)
                                + (SELECT count(*) FROM public.credit_vouchers)
                                + (SELECT count(*) FROM public.credit_voucher_transactions)
  UNION ALL SELECT 'sales orders / quotations / proforma',
                                  (SELECT count(*) FROM public.sales_orders)
                                + (SELECT count(*) FROM public.sales_quotations)
                                + (SELECT count(*) FROM public.proforma_invoices)
  UNION ALL SELECT 'purchase transactions',
                                  (SELECT count(*) FROM public.lpos)
                                + (SELECT count(*) FROM public.grns)
                                + (SELECT count(*) FROM public.purchase_invoices)
                                + (SELECT count(*) FROM public.purchase_returns)
  UNION ALL SELECT 'POS sessions & day closes',
                                  (SELECT count(*) FROM public.pos_sessions)
                                + (SELECT count(*) FROM public.pos_day_closes)
                                + (SELECT count(*) FROM public.pos_x_report_snapshots)
  UNION ALL SELECT 'cash movements',
                                  (SELECT count(*) FROM public.pos_cash_movements)
  UNION ALL SELECT 'payment / receipt transactions',
                                  (SELECT count(*) FROM public.sales_payments)
                                + (SELECT count(*) FROM public.sales_receipt_vouchers)
                                + (SELECT count(*) FROM public.payment_vouchers)
                                + (SELECT count(*) FROM public.invoice_payments)
                                + (SELECT count(*) FROM public.advance_applications)
                                + (SELECT count(*) FROM public.vendor_advances)
  UNION ALL SELECT 'delivery transactions',
                                  (SELECT count(*) FROM public.delivery_notes)
                                + (SELECT count(*) FROM public.delivery_note_items)
                                + (SELECT count(*) FROM public.delivery_note_batch_consumptions)
  UNION ALL SELECT 'inventory movements & lots',
                                  (SELECT count(*) FROM public.stock_movements)
                                + (SELECT count(*) FROM public.inventory_balances)
                                + (SELECT count(*) FROM public.bin_stock)
                                + (SELECT count(*) FROM public.batch_master)
                                + (SELECT count(*) FROM public.serial_master)
                                + (SELECT count(*) FROM public.stock_transfers)
                                + (SELECT count(*) FROM public.stock_take_sessions)
  UNION ALL SELECT 'accounting postings',
                                  (SELECT count(*) FROM public.journal_entries)
                                + (SELECT count(*) FROM public.journal_lines)
                                + (SELECT count(*) FROM public.ledger_entries)
                                + (SELECT count(*) FROM public.gl_account_balances)
  UNION ALL SELECT 'expenses / assets / PDC / settlements',
                                  (SELECT count(*) FROM public.expenses)
                                + (SELECT count(*) FROM public.expense_vouchers)
                                + (SELECT count(*) FROM public.prepaid_expenses)
                                + (SELECT count(*) FROM public.fixed_assets)
                                + (SELECT count(*) FROM public.pdc_entries)
                                + (SELECT count(*) FROM public.card_settlements)
  UNION ALL SELECT 'layaway (BNPL-equivalent) transactions',
                                  (SELECT count(*) FROM public.pos_layaways)
                                + (SELECT count(*) FROM public.pos_layaway_items)
                                + (SELECT count(*) FROM public.pos_layaway_payments)
  UNION ALL SELECT 'HR payroll transactions',
                                  (SELECT count(*) FROM public.salary_advance)
                                + (SELECT count(*) FROM public.salary_payments)
                                + (SELECT count(*) FROM public.salary_repayment_schedules)
  UNION ALL SELECT 'transactional audit trails (pos + finance)',
                                  (SELECT count(*) FROM public.pos_audit_log)
                                + (SELECT count(*) FROM public.financial_audit_logs)
                                + (SELECT count(*) FROM public.pos_device_event_log)
  UNION ALL SELECT 'transaction-derived numbering state',
                                  (SELECT count(*) FROM public.voucher_sequences)
                                + (SELECT count(*) FROM public.pos_report_sequences)
)
SELECT label, n AS remaining_rows,
       CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks ORDER BY 3 DESC, 1;

-- 2.2 Master data must still be present.
WITH checks(label, n) AS (
  SELECT 'products',        (SELECT count(*) FROM public.products)
  UNION ALL SELECT 'customers',      (SELECT count(*) FROM public.customers)
  UNION ALL SELECT 'vendors',        (SELECT count(*) FROM public.vendors)
  UNION ALL SELECT 'warehouses',     (SELECT count(*) FROM public.warehouses)
  UNION ALL SELECT 'branches',       (SELECT count(*) FROM public.branches)
  UNION ALL SELECT 'pos terminals',  (SELECT count(*) FROM public.pos_terminals)
  UNION ALL SELECT 'pos counters',   (SELECT count(*) FROM public.pos_counters)
  UNION ALL SELECT 'users',          (SELECT count(*) FROM public.users)
  UNION ALL SELECT 'roles',          (SELECT count(*) FROM public.roles)
  UNION ALL SELECT 'role permissions',(SELECT count(*) FROM public.role_permissions)
  UNION ALL SELECT 'chart of accounts',(SELECT count(*) FROM public.accounts)
  UNION ALL SELECT 'tax configurations',(SELECT count(*) FROM public.tax_configurations)
  UNION ALL SELECT 'units',          (SELECT count(*) FROM public.units)
  UNION ALL SELECT 'brands',         (SELECT count(*) FROM public.brands)
  UNION ALL SELECT 'departments',    (SELECT count(*) FROM public.departments)
  UNION ALL SELECT 'product pricing',(SELECT count(*) FROM public.product_pricing)
  UNION ALL SELECT 'product barcodes',(SELECT count(*) FROM public.product_barcodes)
  UNION ALL SELECT 'company profile',(SELECT count(*) FROM public.company_profile)
  UNION ALL SELECT 'print templates',(SELECT count(*) FROM public.print_templates)
  UNION ALL SELECT 'fiscal years',   (SELECT count(*) FROM public.fiscal_years)
)
SELECT label, n AS row_count,
       CASE WHEN n > 0 THEN 'PASS' ELSE 'FAIL (was this table populated before?)' END AS result
FROM checks ORDER BY 3 DESC, 1;

-- 2.3 Orphan check — every surviving FK reference must still resolve.
--     Generates and runs one anti-join per FK constraint in the schema; any non-zero
--     count is an orphan and must be investigated before the system is used.
SELECT c.conrelid::regclass::text AS child_table,
       c.conname                  AS constraint_name,
       (xpath('/row/c/text()', query_to_xml(
          format('SELECT count(*) AS c FROM ONLY %s x WHERE %s AND NOT EXISTS '
                 '(SELECT 1 FROM ONLY %s y WHERE %s)',
                 c.conrelid::regclass,
                 (SELECT string_agg(format('x.%I IS NOT NULL', a.attname), ' AND ')
                    FROM unnest(c.conkey) k JOIN pg_attribute a
                      ON a.attrelid = c.conrelid AND a.attnum = k),
                 c.confrelid::regclass,
                 (SELECT string_agg(format('y.%I = x.%I', fa.attname, a.attname), ' AND ')
                    FROM unnest(c.conkey, c.confkey) WITH ORDINALITY AS u(ck, fk, ord)
                    JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = u.ck
                    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = u.fk)),
          false, true, '')))[1]::text::bigint AS orphan_rows
FROM pg_constraint c
WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
ORDER BY 3 DESC, 1;
-- Expected: orphan_rows = 0 for every constraint.

-- 2.4 Derived-state consistency.
SELECT 'products with stale sales accumulators' AS check_name,
       count(*) AS bad_rows
  FROM public.products WHERE total_quantity_sold <> 0 OR last_sold_at IS NOT NULL
UNION ALL
SELECT 'customers whose balance <> SUM(opening_invoice.outstanding)',
       count(*)
  FROM public.customers c
 WHERE COALESCE(c.balance, 0) <> COALESCE(
        (SELECT SUM(GREATEST(oi.outstanding, 0)) FROM public.opening_invoice oi
          WHERE oi.customer_id = c.id), 0)
UNION ALL
SELECT 'customers with stale total_sales', count(*)
  FROM public.customers WHERE total_sales <> 0
UNION ALL
SELECT 'vendors whose balance <> opening_balance', count(*)
  FROM public.vendors WHERE COALESCE(balance,0) <> COALESCE(opening_balance,0)
UNION ALL
SELECT 'pos_terminals still referencing a session', count(*)
  FROM public.pos_terminals
 WHERE current_open_session_id IS NOT NULL OR locked_session_id IS NOT NULL
UNION ALL
SELECT 'document counters not reset', count(*)
  FROM (SELECT next_number FROM public.sales_document_number_settings
        UNION ALL
        SELECT next_number FROM public.purchase_document_number_settings) s
 WHERE next_number <> 1;
-- Expected: bad_rows = 0 on every line.

-- 2.5 Trigger guard restored (must return exactly one enabled row).
SELECT c.relname::text AS table_name, t.tgname, t.tgenabled
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal AND t.tgname = 'trg_pos_day_close_immutable';
-- Expected: tgenabled = 'O' (enabled / origin).

-- 2.6 Sequence state is NOT checked here — sequences are still untouched at this point
--     by design. They are reset in SECTION 1B, which runs only after COMMIT, and
--     verified by check 1B.2 there. See the note in Section 1B for why.


-- =====================================================================================
-- THE DECISION POINT — nothing above this line is permanent yet.
-- Read Section 2's output. If every check reads PASS and the counts match expectations,
-- swap the two lines below (comment ROLLBACK, uncomment COMMIT) and re-run the file.
-- =====================================================================================
ROLLBACK;
-- COMMIT;


-- =====================================================================================
-- SECTION 1B — IDENTITY / SEQUENCE RESET
--
-- *** RUN THIS ONLY AFTER SECTION 1 HAS BEEN COMMITTED. DO NOT RUN IT ON A REHEARSAL. ***
--
-- Why it is a separate phase, outside the transaction:
--   setval() is NOT transactional in PostgreSQL. A setval() inside a transaction that
--   later ROLLBACKs still takes effect permanently — the rows come back but the counters
--   stay at 1, and the next insert collides with an existing id. (This was reproduced
--   during rehearsal: sequences for sales_invoices, stock_movements and journal_entries
--   were left at 1 while all 190 invoices were restored by the rollback.) Keeping the
--   resets out of the transaction means a rehearsal or an aborted run leaves the
--   sequences exactly as it found them.
--
-- If you ever do get that state, repair it with realign_sequences.sql, which pushes
-- every <table>.id sequence back to MAX(id)+1.
--
-- The inclusion list below is explicit and hard-coded. No master table appears in it,
-- so this block cannot restart a master sequence even if edited carelessly.
-- =====================================================================================

-- 1B.1  Guard + reset, deliberately in ONE statement.
--       The guard refuses to run if Section 1 was not committed: any surviving
--       transactional row means this is a rehearsal (or a failed run) and the sequences
--       must be left alone. It lives inside the same DO block as the resets on purpose —
--       as a separate statement, psql without -v ON_ERROR_STOP=1 would report the error
--       and then happily run the reset anyway.
DO $$
DECLARE
    v_rows bigint;
    v_tbl  text;
    v_seq  text;
    v_list text[] := ARRAY[
      'pos_layaway_payments','pos_layaway_items','pos_layaways','pos_held_sales',
      'pos_cash_movements','pos_session_denomination_corrections',
      'pos_correction_audit_entries','pos_correction_overlays','pos_correction_requests',
      'pos_transaction_corrections','pos_session_transfer_log','pos_session_terminal_history',
      'pos_x_report_snapshots','pos_report_sequences','pos_print_jobs','pos_stock_reservations',
      'pos_device_event_log','pos_device_health_snapshot','pos_discovered_device',
      'pos_audit_log','pos_business_day_override','pos_day_closes','pos_sessions',
      'pos_business_dates',
      'delivery_note_batch_consumptions','delivery_note_items','delivery_notes',
      'sales_return_item_batches','sales_return_items','sales_returns',
      'credit_voucher_transactions','credit_vouchers','advance_applications',
      'sales_receipt_vouchers','sales_payments','sales_invoice_history_events',
      'sales_invoice_items','sales_invoices','sales_order_attachments','sales_order_items',
      'sales_orders','sales_quotation_attachments','sales_quotation_revisions',
      'sales_quotation_items','sales_quotations','proforma_invoice_items','proforma_invoices',
      'inquiry_followups','inquiry_items','customer_inquiries',
      'invoice_payments','invoice_landed_costs','purchase_invoice_item_serials',
      'purchase_invoice_items','payment_vouchers','purchase_invoices','purchase_return_items',
      'purchase_returns','grn_item_serials','grn_items','grns','lpo_items','lpos',
      'vendor_advances','approval_history',
      'batch_print_queue','batch_allocation','batch_master','serial_master','bin_stock',
      'stock_take_unit_scans','stock_take_expected_units','stock_take_item_batches',
      'stock_take_items','stock_take_sessions','stock_transfer_items','stock_transfers',
      'stock_movements','inventory_balances',
      'financial_audit_logs','tax_filings','bank_statement_lines','bank_statements',
      'reconciliation_sessions','card_settlements','pdc_entries','expense_voucher_lines',
      'expense_vouchers','expenses','prepaid_expenses','fixed_assets',
      'journal_lines','journal_entries','ledger_entries','gl_account_balances',
      'voucher_sequences',
      'salary_repayment_schedules','salary_advance','salary_payments',
      'notifications','message_logs','user_tasks'
    ];
    n int := 0;
BEGIN
    SELECT (SELECT count(*) FROM public.sales_invoices)
         + (SELECT count(*) FROM public.purchase_invoices)
         + (SELECT count(*) FROM public.stock_movements)
         + (SELECT count(*) FROM public.journal_entries)
         + (SELECT count(*) FROM public.pos_sessions)
      INTO v_rows;
    IF v_rows > 0 THEN
        RAISE EXCEPTION
          'ABORT: % transactional rows still present — Section 1 was not committed. '
          'No sequence was touched (this is the safe outcome).', v_rows;
    END IF;

    FOREACH v_tbl IN ARRAY v_list LOOP
        CONTINUE WHEN to_regclass('public.' || quote_ident(v_tbl)) IS NULL;  -- absent in tenant
        -- pg_get_serial_sequence raises if the column is missing, so check first.
        CONTINUE WHEN NOT EXISTS (
            SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = to_regclass('public.' || quote_ident(v_tbl))
               AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped);
        v_seq := pg_get_serial_sequence('public.' || quote_ident(v_tbl), 'id');
        IF v_seq IS NOT NULL THEN
            PERFORM setval(v_seq, 1, false);   -- is_called=false => next id is exactly 1
            n := n + 1;
        END IF;
    END LOOP;
    -- Two tables use standalone Hibernate @SequenceGenerator sequences rather than their
    -- identity sequence (JournalLine -> seq_journal_lines, SalesInvoiceItem ->
    -- seq_sales_invoice_items, both allocationSize=50). config/DatabaseFixConfig realigns
    -- them to MAX(id)+1 at boot; reset them here so the first post-reset boot is clean.
    -- Inside this DO block so the guard above covers them too.
    PERFORM setval('public.seq_journal_lines', 1, false);
    PERFORM setval('public.seq_sales_invoice_items', 1, false);

    RAISE NOTICE 'reset % transactional identity sequences (+2 Hibernate sequences)', n;
END $$;

-- 1B.2  Verify. pg_sequences.last_value is NULL while is_called = false, which is
--       exactly the state setval(seq, 1, false) leaves behind: next nextval() returns 1.
-- On a REHEARSAL this check correctly reports 'NOT RESET' for every row: the guard above
-- refused to touch anything. That is the expected, healthy rehearsal output.
SELECT s.sequencename,
       s.last_value,
       CASE WHEN s.last_value IS NULL OR s.last_value = 1
            THEN 'PASS' ELSE 'NOT RESET' END AS result
  FROM pg_sequences s
 WHERE s.schemaname = 'public'
   AND s.sequencename IN ('sales_invoices_id_seq','purchase_invoices_id_seq',
                          'stock_movements_id_seq','journal_entries_id_seq',
                          'pos_sessions_id_seq','seq_journal_lines','seq_sales_invoice_items')
 ORDER BY 1;
-- Expected: last_value IS NULL (never called since reset) -> next id is 1.


-- =====================================================================================
-- SECTION 3 — POST-RUN OPERATIONAL STEPS (application side, after COMMIT)
-- =====================================================================================
-- 1. Restart the backend. On boot it will:
--      - realign seq_journal_lines / seq_sales_invoice_items (config/DatabaseFixConfig)
--      - reinstall trg_period_lock / trg_double_entry_balance (PeriodLockTriggerInstaller)
--      - re-seed system accounts and financial defaults
--        (SystemAccountSeeder, FinancialsDefaultSeeder, RBACInitializer,
--         RolePermissionInitializer) — these are idempotent and only re-add missing rows.
-- 2. inventory_balances and gl_account_balances stay empty until the first movement /
--    posting; both are pure caches over stock_movements and journal_lines respectively,
--    and both are now consistent at zero. No manual rebuild is required.
-- 3. pos_business_dates re-seeds per branch on first POS use
--    (PosBusinessDateService.seed -> clock.now()). Confirm each branch's business date
--    reads as today before the first sale.
-- 4. Re-enter opening stock via a stock-take OS session, or via opening GRNs, so
--    stock_movements is rebuilt as the single source of truth.
-- 5. Post opening balances (customer/vendor/bank) as fresh journal entries if the client
--    wants a non-zero opening trial balance.
-- =====================================================================================
