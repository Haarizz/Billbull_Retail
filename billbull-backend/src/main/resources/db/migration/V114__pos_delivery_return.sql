-- V114 — Returning a delivery order from POS Delivery Settlement.
--
-- A retail delivery is not a finished transaction when the invoice is raised. The goods leave
-- with a driver against a CONFIRMED, unpaid invoice, and the sale only completes when the
-- cashier settles it on the Delivery Settlement screen. Until then the customer may simply
-- refuse the delivery at the door, and the driver brings the goods back.
--
-- That case was previously handled by sending the cashier to the back-office Sales Return
-- module — the wrong surface for an order that never completed, and one that leaves the order
-- sitting in the "out for delivery" list afterwards, because a sales return does not and should
-- not change the linked invoice's status.
--
-- Two parts:
--
-- 1. pos_settings.delivery_return_charge_policy
--    Whether the delivery charge survives the return. The goods are always credited by the
--    return lines; the trip the driver actually made is a commercial decision, so it is a
--    per-branch setting (WAIVE / RETAIN / ASK) rather than an implicit answer baked into code.
--    Defaults to WAIVE: an unconfigured branch cancels the charge with the order rather than
--    leaving a few dirhams of uncollectable balance behind in the delivery list forever.
--
-- 2. sales_invoices.pos_delivery_returned_at / pos_delivery_return_number
--    What takes a fully returned order out of the pending-delivery list. The invoice STATUS is
--    deliberately untouched: the sale happened, its journals stand, and the return's own credit
--    note is what reverses it. What changed is only that there is no longer a delivery to
--    settle, which is a delivery-lifecycle fact and belongs in a delivery-lifecycle column.
--
--    Set only when the order owes nothing after the return. A return that leaves the delivery
--    charge payable (RETAIN), or that returns only some of the lines, leaves these null on
--    purpose — the cashier still has a balance to collect, so the order must stay in the list.
--
-- Both parts are additive and idempotent, guarded the same way as every other script here.

-- 1. Per-branch delivery-charge policy -------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_settings'
                         AND column_name = 'delivery_return_charge_policy') THEN
        ALTER TABLE pos_settings ADD COLUMN delivery_return_charge_policy VARCHAR(20);
    END IF;
END $$;

-- Backfill existing rows to the default. Done as a separate statement from the ADD COLUMN so a
-- re-run over an already-migrated database is a no-op rather than overwriting a branch that has
-- since chosen RETAIN or ASK.
UPDATE pos_settings
   SET delivery_return_charge_policy = 'WAIVE'
 WHERE delivery_return_charge_policy IS NULL;

-- 2. Delivery-return close-out marker on the invoice -----------------------------------------
DO $$
BEGIN
    IF to_regclass('public.sales_invoices') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'sales_invoices'
                         AND column_name = 'pos_delivery_returned_at') THEN
            ALTER TABLE sales_invoices ADD COLUMN pos_delivery_returned_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'sales_invoices'
                         AND column_name = 'pos_delivery_return_number') THEN
            ALTER TABLE sales_invoices ADD COLUMN pos_delivery_return_number VARCHAR(50);
        END IF;
    END IF;
END $$;

-- The pending-delivery list filters on this column on every POS Delivery Settlement open, and
-- always alongside status and branch. Partial index: only the handful of closed-out rows are
-- indexed, and the common case (null) is answered from the existing status/branch predicates.
DO $$
BEGIN
    IF to_regclass('public.sales_invoices') IS NOT NULL
       AND to_regclass('public.idx_sales_invoices_delivery_returned') IS NULL THEN
        CREATE INDEX idx_sales_invoices_delivery_returned
            ON sales_invoices (pos_delivery_returned_at)
         WHERE pos_delivery_returned_at IS NOT NULL;
    END IF;
END $$;
