-- Product category master (inventory.category.ProductCategory).
--
-- products.category stays a plain varchar name (no FK) so imports, reports and existing rows are
-- untouched; this table is the pick-list behind it. Names are unique case-insensitively among
-- active rows (soft-deleted rows may share a name and are restored on re-create).
--
-- Seeded with the three defaults the product form used to hard-code plus every distinct category
-- already on a product, so no existing value goes missing from the list.
--
-- Additive and idempotent.
DO $$
BEGIN
    IF to_regclass('public.product_categories') IS NULL THEN
        CREATE TABLE public.product_categories (
            id                  bigserial     PRIMARY KEY,
            name                varchar(100)  NOT NULL,
            description         text,
            is_active           boolean       NOT NULL DEFAULT true,
            created_at          timestamp,
            created_by          varchar(255),
            created_by_user_id  bigint,
            updated_at          timestamp,
            updated_by          varchar(255)
        );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_categories_name_active
    ON public.product_categories (lower(name))
    WHERE is_active = true;

DO $$
BEGIN
    INSERT INTO public.product_categories (name, is_active, created_at, created_by)
    SELECT unnest(ARRAY['General', 'Premium', 'Clearance']), true, now(), 'system'
    WHERE NOT EXISTS (SELECT 1 FROM public.product_categories);

    -- Fresh databases get products from Hibernate after Flyway, so it may not exist yet.
    IF to_regclass('public.products') IS NOT NULL THEN
        INSERT INTO public.product_categories (name, is_active, created_at, created_by)
        SELECT seed.name, true, now(), 'system'
        FROM (
            SELECT DISTINCT ON (lower(n)) n AS name
            FROM (
                SELECT left(regexp_replace(trim(category), '\s+', ' ', 'g'), 100) AS n
                FROM public.products
                WHERE category IS NOT NULL AND trim(category) <> ''
            ) src
            ORDER BY lower(n), n
        ) seed
        WHERE NOT EXISTS (
            SELECT 1 FROM public.product_categories pc
            WHERE lower(pc.name) = lower(seed.name) AND pc.is_active = true
        );
    END IF;
END $$;
