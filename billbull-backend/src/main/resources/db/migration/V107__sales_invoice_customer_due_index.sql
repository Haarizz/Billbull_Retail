-- V107 — Composite index on sales_invoices for the customer details panel's overdue read.
--
-- SalesInvoiceRepository.overdueSummaryForCustomerCode() filters by customer_code and
-- due_date in one grouped aggregate (count + sum of balance).
--
-- The existing sales_invoices indexes are idx_sales_invoice_branch (branch_id),
-- idx_sales_invoice_date (invoice_date), idx_sales_invoice_customer (customer_code),
-- idx_sales_invoice_status (status), idx_sales_invoice_customer_due (customer_code,
-- delivery_date) and idx_sales_invoice_number (invoice_number).
--
-- Note idx_sales_invoice_customer_due despite its name covers DELIVERY_date, not
-- due_date, so it does not serve this query. idx_sales_invoice_customer leads with the
-- right column but leaves the date as a filter on every one of that customer's invoices.
-- (customer_code, due_date) lets PostgreSQL seek straight to the overdue range.
--
-- Additive and idempotent. This is a new index, not a replacement: nothing existing is
-- dropped or renamed.

DO $$
BEGIN
    IF to_regclass('public.sales_invoices') IS NULL THEN
        RAISE NOTICE 'V107: sales_invoices absent — skipping (fresh DB, Hibernate will create it).';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_invoices' AND column_name = 'due_date'
    ) THEN
        -- Flyway runs BEFORE Hibernate on every boot, so on a tenant whose sales_invoices
        -- predates SalesInvoice.dueDate the column is not there yet and indexing it would
        -- abort the migration (and the whole boot). Skipping is safe: SalesInvoice declares
        -- this same index as @Index(name = "idx_sales_invoice_customer_duedate"), so
        -- ddl-auto=update creates the column and the index moments later, and this script
        -- is a no-op on the next boot once the column exists.
        RAISE NOTICE 'V107: sales_invoices.due_date not present yet — skipping (Hibernate creates column + index this boot).';
    ELSE
        CREATE INDEX IF NOT EXISTS idx_sales_invoice_customer_duedate
            ON public.sales_invoices (customer_code, due_date);
        RAISE NOTICE 'V107: created composite index idx_sales_invoice_customer_duedate on sales_invoices(customer_code, due_date).';
    END IF;
END $$;
