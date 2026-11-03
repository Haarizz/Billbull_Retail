-- V130 — POS Quick Checkout layout toggle.
--
-- pos_settings.layout_quick_checkout: when TRUE, the Classic and Cart Focus till screens show the
-- Quick Checkout tender rail (Cash / Card / Credit / Online / BNPL + Add-ons) in place of the
-- Functions panel and Checkout button; FALSE keeps the Functions panel with a Checkout button.
-- Existing branches get TRUE. Additive and idempotent (to_regclass guard, IF NOT EXISTS);
-- V129 (quantity tier pricing) is the highest applied version.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS layout_quick_checkout BOOLEAN DEFAULT TRUE;
        UPDATE pos_settings SET layout_quick_checkout = TRUE WHERE layout_quick_checkout IS NULL;
    END IF;
END $$;
