-- V124 — Closing approval (POS Console > Behavior).
--
-- Two per-branch switches: when on, closing a POS session (X-Report close) or the Business Day
-- (Z-Report close) only goes through once an administrator has approved it. Both default to
-- false, so existing branches behave exactly as before.
-- Additive and idempotent (to_regclass guard, IF NOT EXISTS); V123 (sales order delivery charge) is the highest applied version.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS require_admin_approval_for_session_close BOOLEAN DEFAULT FALSE;
        ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS require_admin_approval_for_day_close BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
