-- V107 — RETIRED. Intentionally a no-op; do not renumber or reuse this version.
--
-- This script originally created a composite index on sales_invoices (customer_code,
-- due_date) for SalesInvoiceRepository.overdueSummaryForCustomerCode(). That was written
-- on a wrong assumption: SalesInvoice.dueDate is mapped to the DELIVERY_DATE column
-- (@Column(name = "delivery_date")), not to a due_date column. sales_invoices has no
-- due_date column and never had one, so the guard in the original script skipped on every
-- tenant and the index was never created anywhere.
--
-- The query is already covered by the pre-existing idx_sales_invoice_customer_due on
-- (customer_code, delivery_date), which is exactly the columns the JPQL filters on. No new
-- index is needed.
--
-- Kept as an applied no-op rather than deleted, because tenants have already recorded
-- version 107 in flyway_schema_history.

DO $$
BEGIN
    RAISE NOTICE 'V107: retired no-op (sales_invoices.dueDate is the delivery_date column; idx_sales_invoice_customer_due already covers it).';
END $$;
