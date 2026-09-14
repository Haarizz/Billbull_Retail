-- V95 Realign the pooled Hibernate sequences (repairs V12 drift).
--
-- seq_journal_lines / seq_sales_invoice_items are pooled allocators (INCREMENT 50):
-- Hibernate takes one nextval and hands out the 50 ids below it. setval() is NOT
-- transactional, so any rolled-back maintenance script that reset these sequences
-- leaves them pointing back inside a range of ids that already exist. The next GL
-- posting then dies with
--   duplicate key value violates unique constraint "journal_lines_pkey"
-- which, for auto-posted advance receipts, is swallowed and silently loses the voucher.
--
-- The pooled optimizer hands out the block (last_value - 50, last_value], so the sequence
-- is only safe when last_value - 50 >= MAX(id). Repair: push it to the next 50-boundary
-- above MAX(id) so the following nextval opens a block entirely above the existing ids.
-- No-op when already safe — safe to re-run.

DO $$
DECLARE
    v_max  bigint;
    v_next bigint;
BEGIN
    IF to_regclass('public.seq_journal_lines') IS NOT NULL
       AND to_regclass('public.journal_lines') IS NOT NULL THEN
        SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.journal_lines;
        SELECT last_value INTO v_next FROM public.seq_journal_lines;
        IF v_next - 50 < v_max THEN
            PERFORM setval('public.seq_journal_lines', ((v_max / 50) + 1) * 50, true);
            RAISE NOTICE 'V95: seq_journal_lines realigned past max id %', v_max;
        END IF;
    END IF;

    IF to_regclass('public.seq_sales_invoice_items') IS NOT NULL
       AND to_regclass('public.sales_invoice_items') IS NOT NULL THEN
        SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.sales_invoice_items;
        SELECT last_value INTO v_next FROM public.seq_sales_invoice_items;
        IF v_next - 50 < v_max THEN
            PERFORM setval('public.seq_sales_invoice_items', ((v_max / 50) + 1) * 50, true);
            RAISE NOTICE 'V95: seq_sales_invoice_items realigned past max id %', v_max;
        END IF;
    END IF;
END $$;
