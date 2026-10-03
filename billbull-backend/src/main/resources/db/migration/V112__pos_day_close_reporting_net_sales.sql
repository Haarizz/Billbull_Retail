-- V112 — Day Close persists the returns-aware reporting figures (Defect 6).
--
-- The problem: pos_day_closes has exactly two structured sales columns, and neither carries
-- the reporting basis the Sales Report / X / Z reports now publish:
--
--   gross_sales   set from the Z-Report summary's `grossSales` — the POS LINE GROSS, summed
--                 BEFORE discount. Not Σ invoiceTotal, and not net of returns.
--   net_sales     set from the Z-Report summary's `netSalesExTax` — the taxable base BEFORE
--                 returns (totalSales − totalTax). Despite the name it has never been a
--                 returns-netted figure.
--
-- Both meanings are load-bearing for every historical row, so neither is redefined here.
-- (See NetSalesReportingBlock for why the POS summary's netSalesExTax / salesAmountExTax /
-- taxableSales keys keep their pre-returns meaning too: the X-Report VAT section needs that
-- base, and restating it in place would silently restate every Z-Report ever issued.)
--
-- Instead the reporting basis gets its own explicitly named, additive columns, sourced from
-- the one shared NetSalesReportingBlock the reports already publish — so the day's authoritative
-- Net Sales is queryable and indexable rather than reachable only by parsing z_report_json:
--
--   reporting_gross_sales      Σ invoiceTotal, VAT-INCLUSIVE, before returns
--   reporting_return_value     approved Sales Returns for the branch+business date, VAT-inclusive
--   reporting_net_sales        reporting_gross_sales − reporting_return_value  (declared basis)
--   reporting_sales_tax        output VAT on the sales above
--   reporting_return_tax       VAT on the returns above
--   reporting_net_tax          reporting_sales_tax − reporting_return_tax
--   reporting_net_sales_ex_tax (gross − sales tax) − (returns − return tax)
--
-- Declared reporting basis: VAT_INCLUSIVE (SalesReturnReportingTotals.NET_SALES_BASIS).
--
-- Backward compatibility: every column is NULLABLE with NO backfill and NO default. A NULL
-- states "this snapshot was taken before the reporting basis was persisted" — which is the
-- truth — whereas a zero or a defaulted value would assert a reported figure that was never
-- reported. Historical rows are byte-for-byte untouched; the Z-Report reader keeps serving
-- them from their stored z_report_json exactly as before and never reinterprets gross_sales
-- or net_sales as the new basis.
--
-- Forward-fill only. Note that pos_day_closes rows are immutable at the DB level
-- (PosDayCloseLockTriggerInstaller installs a trigger rejecting every UPDATE/DELETE), so a
-- historical backfill is not merely undesirable here, it is structurally blocked — it would
-- require dropping the immutability trigger, which is exactly the kind of rewrite of closed
-- financial periods that needs an explicit Finance decision, not a migration.
--
-- Additive and idempotent, per the repo convention: re-running against an already-migrated
-- tenant is a no-op. Modeled on V90.

DO $$
BEGIN
    IF to_regclass('public.pos_day_closes') IS NOT NULL THEN

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_gross_sales') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_gross_sales NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_return_value') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_return_value NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_net_sales') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_net_sales NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_sales_tax') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_sales_tax NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_return_tax') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_return_tax NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_net_tax') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_net_tax NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_net_sales_ex_tax') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_net_sales_ex_tax NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'reporting_net_sales_basis') THEN
            ALTER TABLE pos_day_closes ADD COLUMN reporting_net_sales_basis VARCHAR(20) NULL;
        END IF;

    END IF;
END $$;
