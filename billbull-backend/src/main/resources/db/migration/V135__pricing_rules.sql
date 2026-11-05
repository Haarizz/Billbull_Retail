-- V135 — Global pricing rules (Price Levels workspace).
--
--   sales_settings.pricing_min_margin_percent  gross-margin % below which a selling price is flagged
--                                             as a margin alert (level prices, retail prices and
--                                             customer prices; cost must be known).
--   sales_settings.pricing_block_below_cost    when TRUE, a price-level price or a negotiated customer
--                                             price below the product's cost is refused on save.
--   sales_settings.pricing_round_to            the rounding step bulk price changes default to.
--
-- Additive and idempotent. V134 is the highest version before this.

DO $$
BEGIN
    IF to_regclass('public.sales_settings') IS NOT NULL THEN
        ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS pricing_min_margin_percent NUMERIC(7, 2) NOT NULL DEFAULT 15;
        ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS pricing_block_below_cost BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS pricing_round_to NUMERIC(10, 2) NOT NULL DEFAULT 0.01;
    END IF;
END $$;
