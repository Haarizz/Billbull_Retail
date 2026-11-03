-- V128 — Customer-specific product prices (Pricing Phase 2).
--
--   customer_product_prices        a negotiated selling price (per base unit, like product_level_prices)
--                                  for one customer and product, either for every branch (branch_id NULL)
--                                  or for one branch (branch_id set, wins over the all-branches row there).
--                                  Valid from effective_from to effective_to (inclusive, NULL = open-ended).
--                                  enabled = the Activate / Deactivate switch; is_active = FALSE is the
--                                  usual BillBull soft delete (a removed mapping).
--   sales_invoice_items.customer_price_id
--                                  the mapping a line was priced from, stamped at save time next to the
--                                  V126 columns (price_source = CUSTOMER_SPECIFIC / CUSTOMER_SPECIFIC_BRANCH).
--                                  No foreign key on purpose: the charged price lives on the line, and a
--                                  mapping changed or removed later never touches an issued invoice.
--
-- Overlap prevention: two live mappings (is_active AND enabled) for the same customer, product and
-- branch scope may not cover the same day. The application checks this under a row lock; the database
-- enforces it too, with an exclusion constraint when btree_gist can be installed and, always, with a
-- partial unique index on open-ended rows.
--
-- Additive and idempotent (to_regclass guards, IF NOT EXISTS). V127 is the highest version before this.

DO $$
BEGIN
    IF to_regclass('public.customer_product_prices') IS NULL THEN
        CREATE TABLE customer_product_prices (
            id                  BIGSERIAL PRIMARY KEY,
            customer_id         BIGINT         NOT NULL,
            product_id          BIGINT         NOT NULL,
            branch_id           BIGINT,
            price               NUMERIC(15, 2) NOT NULL,
            effective_from      DATE           NOT NULL,
            effective_to        DATE,
            enabled             BOOLEAN        NOT NULL DEFAULT TRUE,
            notes               VARCHAR(500),
            is_active           BOOLEAN        NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMP,
            created_by          VARCHAR(255),
            created_by_user_id  BIGINT,
            updated_at          TIMESTAMP,
            updated_by          VARCHAR(255),
            CONSTRAINT ck_customer_product_prices_price CHECK (price > 0),
            CONSTRAINT ck_customer_product_prices_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
        );
        IF to_regclass('public.customers') IS NOT NULL THEN
            ALTER TABLE customer_product_prices
                ADD CONSTRAINT fk_customer_product_prices_customer FOREIGN KEY (customer_id) REFERENCES customers (id);
        END IF;
        IF to_regclass('public.products') IS NOT NULL THEN
            ALTER TABLE customer_product_prices
                ADD CONSTRAINT fk_customer_product_prices_product FOREIGN KEY (product_id) REFERENCES products (id);
        END IF;
        IF to_regclass('public.branches') IS NOT NULL THEN
            ALTER TABLE customer_product_prices
                ADD CONSTRAINT fk_customer_product_prices_branch FOREIGN KEY (branch_id) REFERENCES branches (id);
        END IF;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_customer_product_prices_customer ON customer_product_prices (customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_product_prices_product ON customer_product_prices (product_id);
    CREATE INDEX IF NOT EXISTS idx_customer_product_prices_branch ON customer_product_prices (branch_id);
    -- The resolver's lookup: one customer's live rows for the cart's products.
    CREATE INDEX IF NOT EXISTS idx_customer_product_prices_live
        ON customer_product_prices (customer_id, product_id, effective_from)
        WHERE is_active AND enabled;
    -- At most one open-ended live row per customer, product and branch scope.
    CREATE UNIQUE INDEX IF NOT EXISTS uk_customer_product_prices_open
        ON customer_product_prices (customer_id, product_id, COALESCE(branch_id, 0))
        WHERE is_active AND enabled AND effective_to IS NULL;

    IF to_regclass('public.sales_invoice_items') IS NOT NULL THEN
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS customer_price_id BIGINT;
    END IF;
END $$;

-- Full date-range overlap prevention. btree_gist is a trusted extension (PG 13+), so a database owner
-- can install it; where that is not allowed the application check and the index above still apply.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_customer_product_prices_overlap') THEN
        BEGIN
            CREATE EXTENSION IF NOT EXISTS btree_gist;
            ALTER TABLE customer_product_prices
                ADD CONSTRAINT ex_customer_product_prices_overlap EXCLUDE USING gist (
                    customer_id WITH =,
                    product_id WITH =,
                    (COALESCE(branch_id, 0)) WITH =,
                    daterange(effective_from, effective_to, '[]') WITH &&
                ) WHERE (is_active AND enabled);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'customer_product_prices: overlap exclusion constraint not created (%); application check applies.', SQLERRM;
        END;
    END IF;
END $$;
