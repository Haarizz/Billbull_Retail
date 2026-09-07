-- ---------------------------------------------------------------------------------
-- Realign every "<table>.id" sequence in the public schema so the next nextval()
-- returns MAX(id)+1. Idempotent and safe to run at any time.
--
-- WHEN YOU NEED THIS: setval() is NOT transactional in PostgreSQL. If a script that
-- calls setval() is rolled back, the rows come back but the sequences stay reset, and
-- the next insert collides with an existing id. Run this to repair that state.
-- ---------------------------------------------------------------------------------
DO $$
DECLARE r record; v_seq text; v_max bigint; n int := 0;
BEGIN
    FOR r IN
        SELECT c.relname AS tbl
          FROM pg_class c
          JOIN pg_namespace ns ON ns.oid = c.relnamespace
          JOIN pg_attribute a  ON a.attrelid = c.oid AND a.attname = 'id' AND a.attnum > 0
         WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT a.attisdropped
         ORDER BY 1
    LOOP
        v_seq := pg_get_serial_sequence('public.' || quote_ident(r.tbl), 'id');
        CONTINUE WHEN v_seq IS NULL;   -- id column is not sequence-backed
        EXECUTE format('SELECT COALESCE(MAX(id),0) FROM public.%I', r.tbl) INTO v_max;
        IF v_max > 0 THEN PERFORM setval(v_seq, v_max, true);   -- next = max+1
        ELSE              PERFORM setval(v_seq, 1, false);      -- empty table, next = 1
        END IF;
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'realigned % identity sequences', n;
END $$;

-- The two standalone Hibernate @SequenceGenerator sequences (allocationSize = 50).
SELECT setval('public.seq_journal_lines',
              GREATEST((SELECT COALESCE(MAX(id),0) FROM public.journal_lines), 1), true);
SELECT setval('public.seq_sales_invoice_items',
              GREATEST((SELECT COALESCE(MAX(id),0) FROM public.sales_invoice_items), 1), true);
