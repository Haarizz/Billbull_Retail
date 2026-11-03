-- V126 — Configurable named Price Levels (Pricing Phase 1).
--
--   price_levels             tenant-wide named levels (custom names, rename, activate/deactivate).
--                            Exactly one row is the system default level: it has no prices of its own
--                            and stands for the product's existing effective selling price
--                            (branch price -> global price), so behaviour is unchanged until a
--                            business configures other levels.
--   product_level_prices     a product's selling price under a level, either for every branch
--                            (branch_id NULL) or for one branch (branch_id set, wins over the
--                            all-branches row for that branch).
--   customers.price_level_id the customer's default level. The legacy free-text price_list column is
--                            kept as it is; every distinct value becomes a level and the customers
--                            that carried it are linked to it.
--   sales_invoices.*         the level the transaction priced at, and why (TRANSACTION / CUSTOMER / DEFAULT).
--   sales_invoice_items.*    the level, price source and resolved price each line was priced from,
--                            stamped at save time. The charged price stays in sales_invoice_items.price,
--                            so later price-level changes never rewrite history.
--
-- Additive and idempotent (to_regclass guards, IF NOT EXISTS, NOT EXISTS checks). V125 is the
-- highest version before this.

DO $$
BEGIN
    IF to_regclass('public.price_levels') IS NULL THEN
        CREATE TABLE price_levels (
            id                  BIGSERIAL PRIMARY KEY,
            code                VARCHAR(50)  NOT NULL,
            name                VARCHAR(100) NOT NULL,
            description         VARCHAR(500),
            sort_order          INTEGER      NOT NULL DEFAULT 0,
            system_default      BOOLEAN      NOT NULL DEFAULT FALSE,
            is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMP,
            created_by          VARCHAR(255),
            created_by_user_id  BIGINT,
            updated_at          TIMESTAMP,
            updated_by          VARCHAR(255)
        );
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uk_price_levels_code ON price_levels (lower(code));
    CREATE UNIQUE INDEX IF NOT EXISTS uk_price_levels_name ON price_levels (lower(name));
    CREATE UNIQUE INDEX IF NOT EXISTS uk_price_levels_single_default ON price_levels (system_default) WHERE system_default;

    IF to_regclass('public.product_level_prices') IS NULL THEN
        CREATE TABLE product_level_prices (
            id                  BIGSERIAL PRIMARY KEY,
            product_id          BIGINT         NOT NULL,
            price_level_id      BIGINT         NOT NULL REFERENCES price_levels (id),
            branch_id           BIGINT,
            price               NUMERIC(15, 2) NOT NULL,
            is_active           BOOLEAN        NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMP,
            created_by          VARCHAR(255),
            created_by_user_id  BIGINT,
            updated_at          TIMESTAMP,
            updated_by          VARCHAR(255)
        );
        IF to_regclass('public.products') IS NOT NULL THEN
            ALTER TABLE product_level_prices
                ADD CONSTRAINT fk_product_level_prices_product FOREIGN KEY (product_id) REFERENCES products (id);
        END IF;
        IF to_regclass('public.branches') IS NOT NULL THEN
            ALTER TABLE product_level_prices
                ADD CONSTRAINT fk_product_level_prices_branch FOREIGN KEY (branch_id) REFERENCES branches (id);
        END IF;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_product_level_prices_product ON product_level_prices (product_id);
    CREATE INDEX IF NOT EXISTS idx_product_level_prices_level ON product_level_prices (price_level_id);
    -- One all-branches row and at most one row per branch, per product and level.
    CREATE UNIQUE INDEX IF NOT EXISTS uk_product_level_prices_global
        ON product_level_prices (product_id, price_level_id) WHERE branch_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uk_product_level_prices_branch
        ON product_level_prices (product_id, price_level_id, branch_id) WHERE branch_id IS NOT NULL;

    -- The system default level.
    IF NOT EXISTS (SELECT 1 FROM price_levels WHERE system_default) THEN
        IF EXISTS (SELECT 1 FROM price_levels WHERE lower(name) = 'retail' OR lower(code) = 'retail') THEN
            UPDATE price_levels SET system_default = TRUE, is_active = TRUE
             WHERE id = (SELECT id FROM price_levels WHERE lower(name) = 'retail' OR lower(code) = 'retail'
                          ORDER BY id LIMIT 1);
        ELSE
            INSERT INTO price_levels (code, name, description, sort_order, system_default, is_active, created_at, created_by)
            VALUES ('RETAIL', 'Retail', 'Default selling price (the product''s retail / branch price).', 0, TRUE, TRUE, now(), 'system');
        END IF;
    END IF;

    IF to_regclass('public.customers') IS NOT NULL THEN
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_price_level') THEN
            ALTER TABLE customers
                ADD CONSTRAINT fk_customers_price_level FOREIGN KEY (price_level_id) REFERENCES price_levels (id);
        END IF;
        CREATE INDEX IF NOT EXISTS idx_customers_price_level ON customers (price_level_id);
    END IF;

    IF to_regclass('public.sales_invoices') IS NOT NULL THEN
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS price_level_source VARCHAR(20);
    END IF;

    IF to_regclass('public.sales_invoice_items') IS NOT NULL THEN
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS price_level_id BIGINT;
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS price_level_name VARCHAR(100);
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS price_source VARCHAR(30);
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS resolved_unit_price NUMERIC(15, 2);
        ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS price_overridden BOOLEAN;
    END IF;
END $$;

-- Preserve existing customer price_list values: each distinct value becomes a level (unless a level
-- of that name already exists) and its customers are linked to it. 'General' and 'Default' were the
-- importer's placeholders for "no particular list" and stay unlinked, so those customers keep the
-- default price; 'Retail' links to the system default level created above.
DO $$
DECLARE
    v_name      TEXT;
    v_code      TEXT;
    v_base      TEXT;
    v_suffix    INTEGER;
    v_sort      INTEGER;
BEGIN
    IF to_regclass('public.customers') IS NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'customers' AND column_name = 'price_list') THEN
        RETURN;
    END IF;

    SELECT COALESCE(MAX(sort_order), 0) INTO v_sort FROM price_levels;

    FOR v_name IN
        -- One level per case-insensitive value, named by its most used spelling.
        SELECT DISTINCT ON (lower(s.v)) s.v
          FROM (SELECT left(btrim(price_list), 100) AS v, count(*) AS n
                  FROM customers
                 WHERE price_list IS NOT NULL
                   AND btrim(price_list) <> ''
                   AND lower(btrim(price_list)) NOT IN ('general', 'default')
                 GROUP BY 1) s
         ORDER BY lower(s.v), s.n DESC, s.v
    LOOP
        IF EXISTS (SELECT 1 FROM price_levels WHERE lower(name) = lower(v_name)) THEN
            CONTINUE;
        END IF;
        v_code := left(upper(regexp_replace(v_name, '[^A-Za-z0-9]+', '_', 'g')), 40);
        v_code := btrim(v_code, '_');
        IF v_code = '' THEN
            v_code := 'LEVEL';
        END IF;
        v_base := v_code;
        v_suffix := 1;
        WHILE EXISTS (SELECT 1 FROM price_levels WHERE lower(code) = lower(v_code)) LOOP
            v_suffix := v_suffix + 1;
            v_code := v_base || '_' || v_suffix;
        END LOOP;
        v_sort := v_sort + 10;
        INSERT INTO price_levels (code, name, description, sort_order, system_default, is_active, created_at, created_by)
        VALUES (v_code, v_name, 'Created from existing customer price lists.', v_sort, FALSE, TRUE, now(), 'system');
    END LOOP;

    UPDATE customers c
       SET price_level_id = pl.id
      FROM price_levels pl
     WHERE c.price_level_id IS NULL
       AND c.price_list IS NOT NULL
       AND lower(btrim(c.price_list)) = lower(pl.name)
       AND lower(btrim(c.price_list)) NOT IN ('general', 'default');
END $$;
