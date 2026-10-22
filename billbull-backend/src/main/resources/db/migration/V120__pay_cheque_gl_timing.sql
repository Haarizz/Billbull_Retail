-- V120 — Pay Cheques: move the ledger movement of a cheque payment from the Pay Invoices
-- allotment to the cheque itself.
--
-- Additive and idempotent (IF EXISTS / IF NOT EXISTS, to_regclass guards) because Flyway runs
-- before Hibernate on every boot and ddl-auto is still `update` on tenants not yet baselined.
-- V119 is the highest applied version, so this takes V120; nothing is renumbered.
--
-- New accounting for a CHEQUE-mode vendor payment:
--   Pay Invoices allotment → voucher status CHEQUE_PENDING: invoices reserved, no GL.
--   Cheque ISSUED          → Dr 2001 Accounts Payable / Cr 2150 AP – Post-Dated Cheques;
--                            the voucher becomes POSTED and is applied to its invoice.
--   Cheque PAID            → Dr 2150 / Cr the cheque book's bank ledger (on the paid date).
--   Issued cheque CANCELLED→ Dr 2150 / Cr 2001; the voucher goes back to CHEQUE_PENDING.
-- Vouchers posted before this change already credited the bank directly; their allocations
-- carry posts_gl = false so the cheque posts nothing for them.

DO $$
BEGIN
    -- 1. CHEQUE_PENDING is a new PaymentStatus. Hibernate generated payment_vouchers_status_check
    --    from the old four values; drop it and Hibernate regenerates it from the current enum on
    --    the next boot (same approach as V113 for sales_returns). IF EXISTS because a tenant
    --    whose schema was built differently may not have it.
    IF to_regclass('public.payment_vouchers') IS NOT NULL THEN
        ALTER TABLE payment_vouchers DROP CONSTRAINT IF EXISTS payment_vouchers_status_check;
    END IF;

    -- 2. Link an invoice payment row to the voucher that created it, so cancelling an issued
    --    cheque can remove exactly that row.
    IF to_regclass('public.invoice_payments') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'invoice_payments' AND column_name = 'payment_voucher_id') THEN
        ALTER TABLE invoice_payments ADD COLUMN payment_voucher_id BIGINT NULL;
    END IF;
    IF to_regclass('public.invoice_payments') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_invoice_payments_voucher ON invoice_payments (payment_voucher_id);
    END IF;

    -- 3. Whether a cheque allocation's ledger movement belongs to the cheque (true) or was
    --    already posted by its source payment (false: legacy vouchers / expenses).
    IF to_regclass('public.pay_cheque_allocations') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pay_cheque_allocations' AND column_name = 'posts_gl') THEN
        ALTER TABLE pay_cheque_allocations ADD COLUMN posts_gl BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;
