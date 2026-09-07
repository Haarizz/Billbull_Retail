-- Price levels live in product_pricing / product_branch_pricing and are updated in place, so the
-- value a price held before an edit was unrecoverable. The Price Level / Price Change Audit report
-- consequently rendered the current price in both its Old Price and New Price columns and a
-- constant 0% change. This table is the missing trail: one append-only row per price level that
-- actually changed, carrying both sides of the edit.
--
-- Additive and idempotent — no existing data is touched. History starts accumulating from the
-- first price edit after this migration runs; edits made before it cannot be reconstructed.
DO $$
BEGIN
    IF to_regclass('public.product_price_changes') IS NOT NULL THEN
        RETURN;
    END IF;

    CREATE TABLE public.product_price_changes (
        id                 bigserial PRIMARY KEY,
        product_id         bigint        NOT NULL,
        branch_id          bigint,
        price_level        varchar(32)   NOT NULL,
        old_price          numeric(19,4),
        new_price          numeric(19,4),
        created_at         timestamp,
        created_by         varchar(255),
        created_by_user_id bigint,
        updated_at         timestamp,
        updated_by         varchar(255),
        is_active          boolean       NOT NULL DEFAULT true
    );

    -- The audit report filters by change date and (optionally) drills into one product.
    CREATE INDEX idx_product_price_changes_created_at ON public.product_price_changes (created_at);
    CREATE INDEX idx_product_price_changes_product    ON public.product_price_changes (product_id);
END $$;
