-- V10 — Stock ledger quantity: widen stock_movements.quantity integer -> numeric(18,3)
--       (ARCHFIX §1.11).
--
-- The StockMovement.quantity field was Integer; it is now BigDecimal(18,3) to support fractional
-- units (kg / L / length) and to avoid SUM(int) overflow on the highest-volume ledger table. On a
-- FRESH DB Hibernate already creates the column as NUMERIC. On an EXISTING tenant DB ddl-auto=update
-- does NOT alter an existing column's type, so this migration performs the one-time widening.
--
-- IDEMPOTENT & SAFE: only alters when the column exists AND is still an integer type. The
-- integer -> numeric(18,3) cast is value-preserving (every integer is an exact numeric). Already-
-- numeric columns (fresh DBs / re-runs) and absent tables are skipped. The sign convention
-- (+inbound / -deduction) and all SUM(quantity) aggregates are unaffected — Postgres SUM over
-- numeric returns numeric, which the app already consumes via ((Number) row[n]) and BigDecimal
-- finder return types.

DO $$
BEGIN
    IF to_regclass('public.stock_movements') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name   = 'stock_movements'
             AND column_name  = 'quantity'
             AND data_type IN ('integer', 'bigint', 'smallint')
       )
    THEN
        ALTER TABLE public.stock_movements
            ALTER COLUMN quantity TYPE numeric(18,3) USING quantity::numeric(18,3);
        RAISE NOTICE 'V10: widened stock_movements.quantity to numeric(18,3)';
    END IF;
END $$;
