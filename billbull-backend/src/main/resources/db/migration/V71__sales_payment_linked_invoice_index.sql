-- Index for reconstructing an invoice's payment allocations from its tender rows.
--
-- Every back-office screen that shows how a sale was paid (sales list, invoice preview,
-- customer history, exports, the reconciliation diagnostics) resolves it through
-- PaymentRepository.findTenderForInvoices, which filters sales_payments on
--     linked_invoice IN (...) AND payment_type = 'RECEIVED' AND status NOT IN (...)
-- Without an index that is a sequential scan of the whole payments table per page of
-- invoices — cheap on a new tenant, progressively worse on one with years of history,
-- which is exactly the tenant most likely to browse old sales.
--
-- linked_invoice leads because it is the selective column: an invoice has a handful of
-- tender rows out of millions. payment_type follows so the RECEIVED filter is satisfied
-- from the index rather than by fetching the row.
--
-- Idempotent and non-blocking-safe: IF NOT EXISTS means re-running the migration on an
-- already-baselined tenant is a no-op.

CREATE INDEX IF NOT EXISTS idx_sales_payment_linked_invoice
    ON sales_payments (linked_invoice, payment_type);
