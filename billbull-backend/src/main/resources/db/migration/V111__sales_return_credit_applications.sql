-- V111 — Sales Return Phase 2: the return-credit allocation ledger.
--
-- Additive and idempotent, like every script in this directory (guarded with to_regclass /
-- IF NOT EXISTS), because Flyway runs before Hibernate on every boot and ddl-auto is still
-- `update` on tenants that have not been baselined.
--
-- V110 is the highest applied version, so this takes V111. Nothing below is renumbered: with
-- spring.flyway.out-of-order unset, moving a script down into one of the retired gaps
-- (V2/V4/V5/V98) fails the migration on every tenant that already ran a higher version.
--
-- Economics this supports (POS_SALES_RETURN_ECONOMIC_MODEL.html §C/§D):
--     unpaidPortion = min(returnValue, invoiceOutstanding)   -> a row in this table
--     paidPortion   = returnValue - unpaidPortion            -> the external settlement
-- A row here is credit ACTUALLY APPLIED to a named invoice. It is not held customer credit,
-- which is a liability and a separate instrument; no row is ever written with a synthetic
-- invoice number to stand in for unapplied credit.

-- ---------------------------------------------------------------------------
-- 1. The allocation ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_return_credit_applications (
    id               BIGSERIAL PRIMARY KEY,
    sales_return_id  BIGINT        NOT NULL,
    return_number    VARCHAR(100)  NOT NULL,
    invoice_number   VARCHAR(100)  NOT NULL,
    customer_code    VARCHAR(100)  NOT NULL,
    applied_amount   NUMERIC(15,2) NOT NULL,
    applied_date     DATE          NOT NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'APPLIED',
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Rows are immutable: a reversal is a new row, never an update. Same contract as
-- advance_applications, whose status vocabulary this extends with REVERSED.
DO $$
BEGIN
    IF to_regclass('public.sales_return_credit_applications') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'ck_srca_status'
       ) THEN
        ALTER TABLE sales_return_credit_applications
            ADD CONSTRAINT ck_srca_status
            CHECK (status IN ('APPLIED', 'REVERSED', 'REFUNDED'));
    END IF;
END $$;

-- FK to the return document. Not cascading: an approved return is never deleted (deleteReturn
-- refuses an APPROVED row), so a cascade would only ever mask a bug.
DO $$
BEGIN
    IF to_regclass('public.sales_returns') IS NOT NULL
       AND to_regclass('public.sales_return_credit_applications') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_srca_sales_return'
       ) THEN
        ALTER TABLE sales_return_credit_applications
            ADD CONSTRAINT fk_srca_sales_return
            FOREIGN KEY (sales_return_id) REFERENCES sales_returns (id);
    END IF;
END $$;

-- Read paths: by invoice (the balance recompute), by return (traceability and the
-- double-approval guard), by customer+status (the statement's brought-forward term).
CREATE INDEX IF NOT EXISTS idx_srca_invoice  ON sales_return_credit_applications (invoice_number);
CREATE INDEX IF NOT EXISTS idx_srca_return   ON sales_return_credit_applications (return_number);
CREATE INDEX IF NOT EXISTS idx_srca_customer ON sales_return_credit_applications (customer_code, status);

-- Idempotency (§21): one approved return allocates against one invoice exactly once. The
-- approval row lock is the primary guard; this is the one that holds even if the lock is ever
-- bypassed. Partial, so a later REVERSED/REFUNDED row for the same pair is still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS ux_srca_return_invoice_applied
    ON sales_return_credit_applications (return_number, invoice_number)
    WHERE status = 'APPLIED';

-- ---------------------------------------------------------------------------
-- 2. sales_invoices.return_credited — the display term of the recompute
-- ---------------------------------------------------------------------------
-- Derived (it is the sum of this invoice's APPLIED rows above) and therefore not required for
-- correctness. Stored because an invoice that shows a reduced balance with no visible reason is
-- a support ticket, whereas total 10,000 / paid 6,000 / credited 2,000 / balance 2,000 explains
-- itself. Owned by InvoiceBalanceService.recomputeInvoiceBalance and by nothing else.
ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS return_credited NUMERIC(15,2);

-- ---------------------------------------------------------------------------
-- 3. sales_return_items.invoice_item_id — line identity for proration
-- ---------------------------------------------------------------------------
-- Proration, cost resolution and restock used to key on item code alone, so when the same
-- product appeared on an invoice twice at different prices the first matching line always won
-- and the other line's discount/cost was applied to both. The eligibility response already
-- carries the originating invoice line's id per line; persisting it makes the strongest
-- available identity usable at approval. Nullable forever: legacy rows and any client that does
-- not send it fall back to the item-code match.
ALTER TABLE sales_return_items
    ADD COLUMN IF NOT EXISTS invoice_item_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_sri_invoice_item
    ON sales_return_items (invoice_item_id);
