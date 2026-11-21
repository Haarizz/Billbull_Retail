-- V139 — Phase 0 / M2.1: evidence for the post-settlement checkout steps.
--
--   serials_step_required / serials_marked_at          fenced SERIALS_MARK step (serial → SOLD)
--   sales_order_step_required / sales_order_completed_at
--   sales_order_outcome                                 fenced SALES_ORDER step; a recorded failure
--                                                       counts as decided (the sale stands with a
--                                                       visible balance, as before M2)
--   qr_archived_at / stats_recorded_at                  once-markers for the derived post-completion
--                                                       tasks (receipt QR, sale statistics)
--
-- Additive and idempotent. V138 is the highest version before this.

DO $$
BEGIN
    IF to_regclass('public.pos_checkout_attempts') IS NOT NULL THEN
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS serials_step_required BOOLEAN;
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS serials_marked_at TIMESTAMPTZ;
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS sales_order_step_required BOOLEAN;
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS sales_order_completed_at TIMESTAMPTZ;
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS sales_order_outcome VARCHAR(1000);
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS qr_archived_at TIMESTAMPTZ;
        ALTER TABLE pos_checkout_attempts ADD COLUMN IF NOT EXISTS stats_recorded_at TIMESTAMPTZ;
    END IF;
END $$;
