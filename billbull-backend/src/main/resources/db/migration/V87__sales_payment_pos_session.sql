-- V87 — Cross-session delivery settlement fix: give Payment its own COLLECTION session,
-- independent of the SALE session already stamped on SalesInvoice.
--
-- Root cause this closes: sales_payments has never carried any POS session reference. Every
-- POS X/Z-Report tender figure was derived by joining Payment -> linked_invoice ->
-- SalesInvoice.pos_session_id (see V71's index comment), i.e. a payment's session was always
-- whatever session the SALE was originally rung up in. That is correct for an ordinary
-- same-session checkout, but wrong for a delivery order created in one POS session and settled
-- (cash physically collected) in a LATER session after the original session has already closed
-- and frozen its expected-cash: the late payment was invisible to both sessions' reports and
-- only surfaced as an unexplained variance at Day Close.
--
-- pos_session_id here is deliberately nullable and carries NO foreign key, matching every other
-- soft POS-session reference in this schema (receipt_vouchers.pos_session_id, sales_returns.
-- pos_session_id, pos_held_sales.pos_session_id, credit_voucher_transactions.pos_session_id) —
-- null is a legitimate, permanent value for a back-office payment that was never collected
-- through a POS drawer/session at all, not a placeholder to be backfilled later.
--
-- Additive and idempotent, per the repo convention: guarded so re-running against an
-- already-migrated tenant is a no-op.

DO $$
BEGIN
    IF to_regclass('public.sales_payments') IS NOT NULL THEN

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'sales_payments' AND column_name = 'pos_session_id') THEN
            ALTER TABLE sales_payments ADD COLUMN pos_session_id BIGINT;
        END IF;

        -- Backfill existing rows to reproduce today's (pre-fix) attribution exactly — the
        -- session the payment's invoice was created in — so no historical session/X-Report/
        -- Z-Report figure changes as a side effect of this migration. This is a compatibility
        -- backfill, not a retroactive correction: it does not attempt to guess which session
        -- actually collected a historical late/cross-session payment.
        UPDATE sales_payments p
        SET pos_session_id = si.pos_session_id
        FROM sales_invoices si
        WHERE p.linked_invoice = si.invoice_number
          AND p.pos_session_id IS NULL
          AND si.pos_session_id IS NOT NULL;

    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_payment_pos_session ON sales_payments (pos_session_id);
