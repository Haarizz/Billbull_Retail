-- V121 — POS Delivery Workflow (BillBull Console → Behavior → Delivery Workflow).
--
-- Additive and idempotent (IF NOT EXISTS, to_regclass guards) because Flyway runs before
-- Hibernate on every boot and ddl-auto is still `update` on tenants not yet baselined.
-- V120 is the highest applied version, so this takes V121; nothing is renumbered.
--
--   pos_settings.delivery_workflow_mode   DEFAULT_SETTLEMENT (the delivery is a sale when it goes
--                                         out — how every branch worked before this) or PI_FLOW
--                                         (going out issues a Pro-forma Invoice; settlement
--                                         converts it into the final sales invoice).
--   sales_invoices.pos_proforma_*         marks a DRAFT invoice as a POS Pro-forma Invoice awaiting
--                                         Delivery Settlement, and when it was issued / converted.
--
-- Existing rows are backfilled to DEFAULT_SETTLEMENT so every branch keeps its current behaviour.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS delivery_workflow_mode VARCHAR(30);
        UPDATE pos_settings SET delivery_workflow_mode = 'DEFAULT_SETTLEMENT'
            WHERE delivery_workflow_mode IS NULL;
    END IF;

    IF to_regclass('public.sales_invoices') IS NOT NULL THEN
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS pos_proforma_pending BOOLEAN;
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS pos_proforma_issued_at TIMESTAMP;
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS pos_proforma_converted_at TIMESTAMP;
        -- Delivery Settlement lists pending PIs on every open; keep that lookup off a full scan.
        CREATE INDEX IF NOT EXISTS idx_sales_invoices_pos_proforma_pending
            ON sales_invoices (pos_proforma_pending)
            WHERE pos_proforma_pending = TRUE;
    END IF;
END $$;
