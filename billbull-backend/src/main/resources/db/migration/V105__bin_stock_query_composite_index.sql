-- V105 — Composite index on stock_movements for the BinStockService optimized query.
--
-- BinStockService.getStockByBin() now filters by (warehouse_id, product_id IN ...)
-- and groups by (product_id, bin_id). The existing single-column indexes
-- idx_sm_warehouse_id (warehouse_id) and idx_sm_product_id (product_id) cannot
-- efficiently satisfy this combined predicate + grouping.
--
-- This composite index lets PostgreSQL seek directly to the matching
-- (warehouse, product) rows and then sort/group by bin_id without a second lookup.

DO $$
BEGIN
    IF to_regclass('public.stock_movements') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_sm_wh_product_bin
            ON public.stock_movements (warehouse_id, product_id, bin_id);
        RAISE NOTICE 'V105: created composite index idx_sm_wh_product_bin on stock_movements(warehouse_id, product_id, bin_id).';
    ELSE
        RAISE NOTICE 'V105: stock_movements absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;
