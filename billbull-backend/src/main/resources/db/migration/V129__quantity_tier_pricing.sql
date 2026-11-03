-- V129 — Quantity-based (tier) pricing (Pricing Phase 3) and pricing records on the back-office
-- sales documents (Pricing Phase 2.1).
--
--   product_quantity_tiers     a product's unit price (per base unit, like product_level_prices) under one
--                              price level once the transaction buys at least min_quantity base units.
--                              branch_id NULL = all branches; a branch row wins over the all-branches row
--                              with the same min_quantity for that branch. The highest min_quantity at or
--                              below the eligible quantity applies; below the first tier the level's own
--                              price applies. is_active = FALSE is a deactivated tier (kept on record).
--   *_items pricing columns    how each line was priced, stamped by the server at save time:
--                              the level, the price source, the resolved price, whether the charged price
--                              was a manual override, the customer price mapping and the quantity tier used
--                              (with its threshold and the eligible base-unit quantity). sales_invoice_items
--                              already has the V126/V128 columns and gains the tier ones; the quotation,
--                              sales-order and pro-forma lines gain all of them.
--   sales_quotations / sales_orders / proforma_invoices
--                              the level the document priced at (explicit choice, customer default, default).
--
-- No foreign key from any document line to a tier, level price or customer price on purpose: the charged
-- price lives on the line, so editing, deactivating or removing pricing configuration never touches an
-- issued document. Nothing is backfilled.
--
-- Additive and idempotent (to_regclass guards, IF NOT EXISTS). V128 is the highest version before this.

DO $$
BEGIN
    IF to_regclass('public.product_quantity_tiers') IS NULL THEN
        CREATE TABLE product_quantity_tiers (
            id                  BIGSERIAL PRIMARY KEY,
            product_id          BIGINT         NOT NULL,
            price_level_id      BIGINT         NOT NULL REFERENCES price_levels (id),
            branch_id           BIGINT,
            min_quantity        NUMERIC(15, 3) NOT NULL,
            price               NUMERIC(15, 2) NOT NULL,
            is_active           BOOLEAN        NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMP,
            created_by          VARCHAR(255),
            created_by_user_id  BIGINT,
            updated_at          TIMESTAMP,
            updated_by          VARCHAR(255),
            CONSTRAINT ck_product_quantity_tiers_min_qty CHECK (min_quantity > 0),
            CONSTRAINT ck_product_quantity_tiers_price CHECK (price > 0)
        );
        IF to_regclass('public.products') IS NOT NULL THEN
            ALTER TABLE product_quantity_tiers
                ADD CONSTRAINT fk_product_quantity_tiers_product FOREIGN KEY (product_id) REFERENCES products (id);
        END IF;
        IF to_regclass('public.branches') IS NOT NULL THEN
            ALTER TABLE product_quantity_tiers
                ADD CONSTRAINT fk_product_quantity_tiers_branch FOREIGN KEY (branch_id) REFERENCES branches (id);
        END IF;
    END IF;

    -- The resolver's lookup: the cart's products under one level.
    CREATE INDEX IF NOT EXISTS idx_product_quantity_tiers_lookup
        ON product_quantity_tiers (price_level_id, product_id) WHERE is_active;
    CREATE INDEX IF NOT EXISTS idx_product_quantity_tiers_product ON product_quantity_tiers (product_id);
    -- One live tier per product, level, branch scope and threshold.
    CREATE UNIQUE INDEX IF NOT EXISTS uk_product_quantity_tiers_global
        ON product_quantity_tiers (product_id, price_level_id, min_quantity)
        WHERE branch_id IS NULL AND is_active;
    CREATE UNIQUE INDEX IF NOT EXISTS uk_product_quantity_tiers_branch
        ON product_quantity_tiers (product_id, price_level_id, branch_id, min_quantity)
        WHERE branch_id IS NOT NULL AND is_active;

    IF to_regclass('public.sales_invoice_items') IS NOT NULL THEN
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS quantity_tier_id BIGINT;
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS tier_min_quantity NUMERIC(15, 3);
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS tier_eligible_quantity NUMERIC(15, 3);
    END IF;

    IF to_regclass('public.sales_quotation_items') IS NOT NULL THEN
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS price_source VARCHAR(30);
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS resolved_unit_price NUMERIC(15, 2);
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS price_overridden BOOLEAN;
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS customer_price_id BIGINT;
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS quantity_tier_id BIGINT;
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS tier_min_quantity NUMERIC(15, 3);
        ALTER TABLE sales_quotation_items ADD COLUMN IF NOT EXISTS tier_eligible_quantity NUMERIC(15, 3);
    END IF;

    IF to_regclass('public.sales_order_items') IS NOT NULL THEN
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS price_source VARCHAR(30);
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS resolved_unit_price NUMERIC(15, 2);
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS price_overridden BOOLEAN;
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS customer_price_id BIGINT;
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS quantity_tier_id BIGINT;
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS tier_min_quantity NUMERIC(15, 3);
        ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS tier_eligible_quantity NUMERIC(15, 3);
    END IF;

    IF to_regclass('public.proforma_invoice_items') IS NOT NULL THEN
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS price_source VARCHAR(30);
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS resolved_unit_price NUMERIC(15, 2);
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS price_overridden BOOLEAN;
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS customer_price_id BIGINT;
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS quantity_tier_id BIGINT;
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS tier_min_quantity NUMERIC(15, 3);
        ALTER TABLE proforma_invoice_items ADD COLUMN IF NOT EXISTS tier_eligible_quantity NUMERIC(15, 3);
    END IF;

    IF to_regclass('public.sales_quotations') IS NOT NULL THEN
        ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS price_level_source VARCHAR(20);
    END IF;
    IF to_regclass('public.sales_orders') IS NOT NULL THEN
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS price_level_source VARCHAR(20);
    END IF;
    IF to_regclass('public.proforma_invoices') IS NOT NULL THEN
        ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS price_level_source VARCHAR(20);
    END IF;
END $$;
