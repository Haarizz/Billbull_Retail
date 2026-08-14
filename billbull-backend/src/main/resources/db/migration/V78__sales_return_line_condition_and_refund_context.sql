-- V78 — Sales Return: per-line condition (§12), structured refund method (§14),
-- entry-point/POS context (§6, §20), and authorization columns (§15).
--
-- Additive and idempotent, per the repo convention: guarded with to_regclass so it is a
-- no-op on tenant databases where Hibernate's ddl-auto has already created the columns,
-- and safe to re-run on databases baselined at different points.

DO $$
BEGIN
    IF to_regclass('public.sales_return_items') IS NOT NULL THEN
        ALTER TABLE sales_return_items
            ADD COLUMN IF NOT EXISTS return_condition varchar(20);
    END IF;

    IF to_regclass('public.sales_returns') IS NOT NULL THEN
        ALTER TABLE sales_returns
            ADD COLUMN IF NOT EXISTS refund_method          varchar(30),
            ADD COLUMN IF NOT EXISTS refund_amount          numeric(15, 2),
            ADD COLUMN IF NOT EXISTS entry_point            varchar(20),
            ADD COLUMN IF NOT EXISTS pos_session_id         bigint,
            ADD COLUMN IF NOT EXISTS pos_terminal_id        varchar(100),
            ADD COLUMN IF NOT EXISTS pos_counter_name       varchar(100),
            ADD COLUMN IF NOT EXISTS trading_date           date,
            ADD COLUMN IF NOT EXISTS customer_mobile        varchar(50),
            ADD COLUMN IF NOT EXISTS linked_receipt_number  varchar(100),
            ADD COLUMN IF NOT EXISTS authorized_by_user_id  bigint,
            ADD COLUMN IF NOT EXISTS authorized_by_username varchar(150),
            ADD COLUMN IF NOT EXISTS authorized_at          timestamp,
            ADD COLUMN IF NOT EXISTS authorization_reason   varchar(100);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill 1: per-line condition from the legacy itemStatus free-text column.
--
-- itemStatus already drives real behaviour in SalesReturnService — 'Good' restocks and
-- reverses COGS, anything else is scrapped. The mapping below preserves that exactly:
-- only an explicit 'Good' becomes GOOD. Anything else (including NULL on very old rows)
-- becomes DAMAGED, so a historic scrap line can never be silently promoted to saleable.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.sales_return_items') IS NOT NULL THEN
        UPDATE sales_return_items
           SET return_condition = CASE
                   WHEN lower(btrim(coalesce(item_status, ''))) = 'good' THEN 'GOOD'
                   ELSE 'DAMAGED'
               END
         WHERE return_condition IS NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill 2: copy the header-level reason down onto any line that has none, so the
-- new per-line UI renders historic returns with a populated reason rather than blanks.
-- Lines that already carry their own return_reason are left alone.
--
-- The header `reason` is free text from the old UI and does not map onto the
-- SalesReturnReasonCode vocabulary; it is preserved verbatim in return_reason_notes
-- (which is already free text) and the code column is set to OTHER, so no historic
-- string is misrepresented as a structured code it never was.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.sales_return_items') IS NOT NULL
       AND to_regclass('public.sales_returns') IS NOT NULL THEN
        UPDATE sales_return_items i
           SET return_reason = 'OTHER',
               return_reason_notes = coalesce(
                   nullif(btrim(i.return_reason_notes), ''),
                   r.reason)
          FROM sales_returns r
         WHERE i.sales_return_id = r.id
           AND coalesce(btrim(i.return_reason), '') = ''
           AND coalesce(btrim(r.reason), '') <> '';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill 3: structured refund method from the prose the old POS wizard wrote into
-- internalNotes, e.g. "Refund method: Cash Back. POS terminal T-01."
--
-- Mirrors SalesReturnRefundMethod.fromLegacyLabel(): "Cash Back" and "Cash Return" were
-- two labels for one physical drawer cash-out and both collapse onto CASH_REFUND (§14).
-- Rows whose notes match nothing are left NULL rather than guessed at.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.sales_returns') IS NOT NULL THEN
        UPDATE sales_returns
           SET refund_method = CASE
                   WHEN internal_notes ILIKE '%Refund method: Cash Back%'      THEN 'CASH_REFUND'
                   WHEN internal_notes ILIKE '%Refund method: Cash Return%'    THEN 'CASH_REFUND'
                   WHEN internal_notes ILIKE '%Refund method: Cash%'           THEN 'CASH_REFUND'
                   WHEN internal_notes ILIKE '%Refund method: Card%'           THEN 'CARD_REFUND'
                   WHEN internal_notes ILIKE '%Refund method: Bank%'           THEN 'BANK_TRANSFER'
                   WHEN internal_notes ILIKE '%Refund method: Credit Voucher%' THEN 'CREDIT_VOUCHER'
                   WHEN internal_notes ILIKE '%Refund method: Customer Credit%' THEN 'CUSTOMER_CREDIT'
                   ELSE NULL
               END
         WHERE refund_method IS NULL
           AND internal_notes IS NOT NULL;

        -- Refunded value for historic rows is the return total; there was no partial-settlement
        -- concept before this change, so total is exact rather than an approximation.
        UPDATE sales_returns
           SET refund_amount = total_amount
         WHERE refund_amount IS NULL
           AND refund_method IS NOT NULL
           AND total_amount IS NOT NULL;

        -- Entry point: returns carrying the old POS wizard's terminal annotation came from POS;
        -- everything else predates the distinction and is attributed to the back-office screen.
        UPDATE sales_returns
           SET entry_point = CASE
                   WHEN internal_notes ILIKE '%POS terminal%' THEN 'POS'
                   ELSE 'SALES_RETURN'
               END
         WHERE entry_point IS NULL;
    END IF;
END $$;

-- Search support for §8 (invoice/receipt/customer/mobile lookup) and the returnable-quantity
-- aggregation, which currently scans by linked_invoice on every eligibility check.
CREATE INDEX IF NOT EXISTS idx_sales_return_linked_invoice
    ON sales_returns (linked_invoice);

CREATE INDEX IF NOT EXISTS idx_sales_return_pos_session
    ON sales_returns (pos_session_id);
