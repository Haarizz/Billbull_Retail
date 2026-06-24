-- V12 — PostgreSQL sequences for batch-insert-eligible entities (ARCHFIX §4.4).
--
-- Switching GenerationType.IDENTITY → SEQUENCE (allocationSize=50) on JournalLine and
-- SalesInvoiceItem enables Hibernate JDBC batching on these two high-volume insert tables.
-- With IDENTITY, Hibernate must round-trip to the DB after EVERY insert to retrieve the
-- generated id; with a pooled SEQUENCE it pre-allocates 50 ids per block and batches them.
--
-- The sequences start above the current max id in each table so there is no PK conflict.
-- IDEMPOTENT: CREATE SEQUENCE IF NOT EXISTS; the SETVAL is only applied when the sequence
-- already exists at a lower value than the current max (safe to re-run).

DO $$
DECLARE
    max_jl  bigint;
    max_sii bigint;
BEGIN
    -- journal_lines
    IF to_regclass('public.journal_lines') IS NOT NULL THEN
        SELECT COALESCE(MAX(id), 0) INTO max_jl FROM public.journal_lines;
        -- Round up to next allocationSize=50 boundary so the pooled allocator doesn't collide
        max_jl := ((max_jl / 50) + 1) * 50;
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.seq_journal_lines START %s INCREMENT 50', max_jl + 1);
        PERFORM setval('public.seq_journal_lines', GREATEST(max_jl, nextval('public.seq_journal_lines') - 50), false);
        RAISE NOTICE 'V12: seq_journal_lines ready (start >= %)', max_jl + 1;
    END IF;

    -- sales_invoice_items
    IF to_regclass('public.sales_invoice_items') IS NOT NULL THEN
        SELECT COALESCE(MAX(id), 0) INTO max_sii FROM public.sales_invoice_items;
        max_sii := ((max_sii / 50) + 1) * 50;
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.seq_sales_invoice_items START %s INCREMENT 50', max_sii + 1);
        PERFORM setval('public.seq_sales_invoice_items', GREATEST(max_sii, nextval('public.seq_sales_invoice_items') - 50), false);
        RAISE NOTICE 'V12: seq_sales_invoice_items ready (start >= %)', max_sii + 1;
    END IF;
END $$;
