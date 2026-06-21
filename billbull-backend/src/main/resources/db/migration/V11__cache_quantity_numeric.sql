-- V11 — Cache table quantities: widen integer -> numeric(18,3)
--       (ARCHFIX §1.10).
--
-- inventory_balances.on_hand_qty and bin_stock.quantity/reserved_quantity
-- were Integer; now BigDecimal(18,3) to match the stock_movements ledger
-- widened in V10, and to support fractional units (kg/L/length).
--
-- IDEMPOTENT: only alters when column exists AND is still an integer type.
-- Value-preserving: every integer is an exact numeric(18,3).

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (table_name, column_name) IN (
                   ('inventory_balances', 'on_hand_qty'),
                   ('bin_stock', 'quantity'),
                   ('bin_stock', 'reserved_quantity')
               )
           AND data_type IN ('integer', 'bigint', 'smallint')
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(18,3) USING %I::numeric(18,3)',
            r.table_name, r.column_name, r.column_name
        );
        RAISE NOTICE 'V11: widened %.% to numeric(18,3)', r.table_name, r.column_name;
    END LOOP;
END $$;
