-- V7 — Money types: widen monetary columns from double precision -> numeric(15,2).
--
-- The Double -> BigDecimal entity conversion (feature/db-money-bigdecimal, slices 1-5)
-- changed every money field's @Column to precision=15, scale=2. On a FRESH DB Hibernate
-- already creates these as NUMERIC. But on an EXISTING tenant DB, ddl-auto=update will NOT
-- alter an existing column's type (it only adds new columns) — so legacy money columns stay
-- `double precision`, reintroducing exactly the float-rounding the conversion set out to kill.
-- This migration performs that one-time widening for adopted DBs.
--
-- IDEMPOTENT & SAFE BY CONSTRUCTION: each column is altered ONLY when it (a) exists and
-- (b) is currently `double precision`. Therefore:
--   * already-numeric columns (fresh DBs, or a re-run)        -> skipped
--   * columns absent on this tenant (table never created)     -> skipped
--   * genuine legacy double-precision money columns           -> widened
-- The double -> numeric cast is value-preserving for the magnitudes we store; numeric(15,2)
-- rounds to 2 dp, which is the intended money scale (any sub-cent float noise is dropped).
--
-- DELIBERATELY EXCLUDED (must remain double precision): non-money rate/quantity columns that
-- were intentionally left as Double in the conversion — e.g. tax_rate, quantity, discount,
-- and any percentage/rate field. Only the (table, column) pairs listed below are touched.
--
-- Runs before Hibernate (Flyway ordering); the to_regclass / information_schema guards make a
-- not-yet-created table a no-op. USING cast is explicit so PostgreSQL never has to guess.

DO $$
DECLARE
    -- (table, column) money pairs converted to BigDecimal across slices 1-5.
    money_cols CONSTANT text[][] := ARRAY[
        -- ---- Sales: invoice header (sales_invoices) ----
        ['sales_invoices',     'sub_total'],
        ['sales_invoices',     'tax_total'],
        ['sales_invoices',     'invoice_total'],
        ['sales_invoices',     'amount_paid'],
        ['sales_invoices',     'balance'],
        ['sales_invoices',     'bill_discount_amount'],
        ['sales_invoices',     'delivery_charge'],
        ['sales_invoices',     'round_off'],
        ['sales_invoices',     'credit_limit'],
        -- ---- Sales: invoice lines (sales_invoice_items) ----
        ['sales_invoice_items','price'],
        ['sales_invoice_items','cost'],
        ['sales_invoice_items','footer_discount'],
        ['sales_invoice_items','tax_amount'],
        ['sales_invoice_items','gross_amount'],
        ['sales_invoice_items','net_amount'],
        ['sales_invoice_items','recognized_revenue'],
        ['sales_invoice_items','recognized_cogs'],
        -- ---- Sales: order header (sales_orders) ----
        ['sales_orders',       'sub_total'],
        ['sales_orders',       'tax_total'],
        ['sales_orders',       'order_total'],
        ['sales_orders',       'advance_amount'],
        ['sales_orders',       'balance_due'],
        ['sales_orders',       'bill_discount_amount'],
        -- ---- Sales: order lines (sales_order_items) ----
        ['sales_order_items',  'price'],
        ['sales_order_items',  'cost'],
        ['sales_order_items',  'footer_discount'],
        ['sales_order_items',  'tax_amount'],
        ['sales_order_items',  'line_total'],
        -- ---- Sales: payments (sales_payments) ----
        ['sales_payments',     'invoice_amount'],
        ['sales_payments',     'invoice_balance'],
        ['sales_payments',     'amount'],
        -- ---- Sales: returns header (sales_returns) ----
        ['sales_returns',      'sub_total'],
        ['sales_returns',      'tax_amount'],
        ['sales_returns',      'total_amount'],
        -- ---- Sales: return lines (sales_return_items) ----
        ['sales_return_items', 'price'],
        ['sales_return_items', 'tax_amount'],
        ['sales_return_items', 'total'],
        -- ---- Sales: delivery note lines (delivery_note_items) ----
        ['delivery_note_items','price'],
        ['delivery_note_items','cost'],
        -- ---- Financials: expense (expenses) — tax_rate stays double ----
        ['expenses',           'amount'],
        ['expenses',           'tax_amount'],
        ['expenses',           'total'],
        -- ---- Financials: tax filing (tax_filings) ----
        ['tax_filings',        'amount'],
        -- ---- HR: employee (employees) ----
        ['employees',          'basic_salary'],
        -- ---- Customer: inquiry lines (inquiry_items) — quantity stays double ----
        ['inquiry_items',      'price'],
        -- ---- POS: session (pos_sessions) ----
        ['pos_sessions',       'opening_cash'],
        ['pos_sessions',       'closing_cash'],
        ['pos_sessions',       'expected_cash'],
        ['pos_sessions',       'cash_difference'],
        ['pos_sessions',       'total_sales'],
        ['pos_sessions',       'total_cash_sales'],
        ['pos_sessions',       'total_card_sales'],
        ['pos_sessions',       'total_credit_sales'],
        ['pos_sessions',       'total_mixed_sales'],
        ['pos_sessions',       'total_refunds'],
        -- ---- POS: held sale (pos_held_sales) ----
        ['pos_held_sales',     'total'],
        -- ---- POS: layaway header (pos_layaways) ----
        ['pos_layaways',       'sale_total'],
        ['pos_layaways',       'tax_total'],
        ['pos_layaways',       'bill_discount_amount'],
        ['pos_layaways',       'deposit_amount'],
        ['pos_layaways',       'balance_amount'],
        -- ---- POS: layaway lines (pos_layaway_items) — discount, tax_rate stay double ----
        ['pos_layaway_items',  'price']
    ];
    pair   text[];
    tbl    text;
    col    text;
BEGIN
    FOREACH pair SLICE 1 IN ARRAY money_cols LOOP
        tbl := pair[1];
        col := pair[2];

        -- Only act when the table exists AND the column is still double precision.
        IF to_regclass('public.' || tbl) IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name   = tbl
                 AND column_name  = col
                 AND data_type    = 'double precision'
           )
        THEN
            EXECUTE format(
                'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(15,2) USING %I::numeric(15,2)',
                tbl, col, col
            );
            RAISE NOTICE 'V7: widened %.% to numeric(15,2)', tbl, col;
        END IF;
    END LOOP;
END $$;
