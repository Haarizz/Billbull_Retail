-- V108 — Footer discount line allocation (docs/footer-discount-audit-2026-10-01.md §R).
--
-- The document-level footer discount is now allocated server-side by
-- sales/common/FooterDiscountAllocator and stored per line. Most of the schema already
-- existed (sales_invoice_items / sales_order_items / quotation_items.footer_discount); this
-- script adds only what was missing:
--
--   * sales_invoice_items.taxable_amount  — post-footer ex-VAT taxable value. Without it the
--     frontend re-derived "taxable" as netAmount − taxAmount, which is already post-footer,
--     and applied the footer discount a second time (audit N1).
--   * sales_invoice_items.foc_unit / quotation_items.foc_unit — the FOC unit the editor
--     already sends; needed so the server can value FOC exactly as the browser does.
--   * proforma_invoices.bill_discount_amount / bill_discount_type and
--     proforma_invoice_items.footer_discount — Proforma parity (% or amount, allocated).
--   * quotation money columns that Hibernate created without an explicit scale are pinned to
--     numeric(15,2), matching every other sales document (only footer_discount and
--     bill_discount_amount; widened ONLY when currently a different numeric/double type).
--
-- ADDITIVE AND IDEMPOTENT: every column is nullable, added with IF NOT EXISTS, and guarded by
-- to_regclass so a tenant that has not created the table yet is a no-op (Hibernate creates it
-- with the same definitions from the entities). No existing row is recalculated: historical
-- documents keep their stored values; NULL in a new column means "pre-allocation document".

DO $$
BEGIN
    IF to_regclass('public.sales_invoice_items') IS NOT NULL THEN
        ALTER TABLE public.sales_invoice_items ADD COLUMN IF NOT EXISTS taxable_amount numeric(15,2);
        ALTER TABLE public.sales_invoice_items ADD COLUMN IF NOT EXISTS foc_unit varchar(50);
    END IF;

    IF to_regclass('public.quotation_items') IS NOT NULL THEN
        ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS foc_unit varchar(50);
    END IF;

    IF to_regclass('public.proforma_invoices') IS NOT NULL THEN
        ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS bill_discount_amount numeric(15,2);
        ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS bill_discount_type varchar(20);
    END IF;

    IF to_regclass('public.proforma_invoice_items') IS NOT NULL THEN
        ALTER TABLE public.proforma_invoice_items ADD COLUMN IF NOT EXISTS footer_discount numeric(15,2);
    END IF;
END $$;

DO $$
DECLARE
    money_cols CONSTANT text[][] := ARRAY[
        ['quotation_items', 'footer_discount'],
        ['quotations',      'bill_discount_amount']
    ];
    pair text[];
BEGIN
    FOREACH pair SLICE 1 IN ARRAY money_cols LOOP
        IF to_regclass('public.' || pair[1]) IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name   = pair[1]
                 AND column_name  = pair[2]
                 AND (data_type = 'double precision'
                      OR (data_type = 'numeric'
                          AND (numeric_precision IS DISTINCT FROM 15 OR numeric_scale IS DISTINCT FROM 2)))
           )
        THEN
            EXECUTE format(
                'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(15,2) USING round(%I::numeric, 2)',
                pair[1], pair[2], pair[2]
            );
            RAISE NOTICE 'V108: pinned %.% to numeric(15,2)', pair[1], pair[2];
        END IF;
    END LOOP;
END $$;
