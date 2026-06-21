-- V8 — Foreign-key constraints for genuine bare-Long FK columns (ARCHFIX P1 §1.7 / §2.2).
-- (Review labelled this "V4"; numbered V8 here to stay strictly sequential after the already-
--  applied V7 — Flyway rejects out-of-order versions by default and the number is pure ordering.)
--
-- Dozens of FK-shaped columns are plain scalars (no @ManyToOne, no DB FK), so the DB cannot
-- guarantee the referenced row exists and orphans accumulate. This migration adds DB-level
-- FOREIGN KEY constraints WITHOUT changing JPA (the scalar column stays) — the least-invasive
-- path. Only columns that are NOT already mapped as @ManyToOne are targeted; Hibernate already
-- emits fk<hash> constraints for real associations, and we never duplicate those.
--
-- SAFE-BY-CONSTRUCTION on a drifting multi-DB fleet. For each desired FK we skip when:
--   * the child or parent table does not exist                          -> skip
--   * the child or parent column does not exist                         -> skip
--   * an FK already covers the child column (Hibernate or a prior run)  -> skip (idempotent)
--   * ORPHAN rows exist (child value with no matching parent)           -> skip + NOTICE
-- The orphan guard is critical: a hard ADD CONSTRAINT on a drifted tenant with even one
-- dangling row would throw and abort boot (exactly the failure mode V3 hit on a missing
-- column). Skipping leaves the orphan visible via the NOTICE for manual cleanup; re-running
-- the migration after cleanup will then add the constraint. We also create a supporting index
-- on the child column (FK columns are almost always join/filter targets) when absent.
--
-- POLYMORPHIC columns (stock_movements.source_id/source_type, *.document_id, GL account_code
-- snapshots) are DELIBERATELY NOT constrained — they reference different tables by a
-- discriminator. §3/V3 already indexes (source_type, source_id); a COMMENT documents intent.

DO $$
DECLARE
    fk record;
    has_fk int;
    orphans bigint;
BEGIN
    FOR fk IN
        SELECT * FROM (VALUES
            -- constraint_name,           child_table,          child_col,        parent_table,       parent_col, index_name
            ('fk_sm_product',             'stock_movements',     'product_id',     'products',          'id', 'idx_sm_product_id'),
            ('fk_sm_warehouse',           'stock_movements',     'warehouse_id',   'warehouses',        'id', 'idx_sm_warehouse_id'),
            ('fk_ib_product',             'inventory_balances',  'product_id',     'products',          'id', 'idx_ib_product_id'),
            ('fk_ib_warehouse',           'inventory_balances',  'warehouse_id',   'warehouses',        'id', 'idx_ib_warehouse_id'),
            ('fk_binstock_product',       'bin_stock',           'product_id',     'products',          'id', 'idx_binstock_product_id'),
            ('fk_bm_product',             'batch_master',        'product_id',     'products',          'id', 'idx_bm_product_id'),
            ('fk_bm_warehouse',           'batch_master',        'warehouse_id',   'warehouses',        'id', 'idx_bm_warehouse_id'),
            ('fk_pinv_lpo',               'purchase_invoices',   'lpo_id',         'lpos',              'id', 'idx_pinv_lpo_id'),
            ('fk_pinv_grn',               'purchase_invoices',   'grn_id',         'grns',              'id', 'idx_pinv_grn_id'),
            ('fk_pv_invoice',             'payment_vouchers',    'invoice_id',     'purchase_invoices', 'id', 'idx_pv_invoice_id'),
            ('fk_customers_payterms',     'customers',           'payment_terms_id','payment_terms',    'id', 'idx_customers_payterms_id'),
            ('fk_vendors_payterms',       'vendors',             'payment_terms_id','payment_terms',    'id', 'idx_vendors_payterms_id')
        ) AS t(con, ct, cc, pt, pc, idx)
    LOOP
        -- tables present?
        CONTINUE WHEN to_regclass('public.' || fk.ct) IS NULL OR to_regclass('public.' || fk.pt) IS NULL;

        -- both columns present?
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                                  WHERE table_schema='public' AND table_name=fk.ct AND column_name=fk.cc);
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                                  WHERE table_schema='public' AND table_name=fk.pt AND column_name=fk.pc);

        -- an FK already covering this child column (Hibernate-generated or a prior V4 run)?
        SELECT count(*) INTO has_fk
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        WHERE con.contype = 'f'
          AND con.conrelid = ('public.' || fk.ct)::regclass
          AND a.attname = fk.cc;
        IF has_fk > 0 THEN
            CONTINUE;  -- already constrained; nothing to do
        END IF;

        -- orphan guard: never add a constraint that would fail validation
        EXECUTE format(
            'SELECT count(*) FROM public.%I c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%I p WHERE p.%I = c.%I)',
            fk.ct, fk.cc, fk.pt, fk.pc, fk.cc
        ) INTO orphans;
        IF orphans > 0 THEN
            RAISE NOTICE 'V8: skipped % — % orphan row(s) in %.% have no %.% parent (clean up, then re-run)',
                fk.con, orphans, fk.ct, fk.cc, fk.pt, fk.pc;
            CONTINUE;
        END IF;

        -- supporting index on the FK column (skip if any index already leads with it / IF NOT EXISTS handles dupes)
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', fk.idx, fk.ct, fk.cc);

        -- finally, the constraint
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (%I)',
                       fk.ct, fk.con, fk.cc, fk.pt, fk.pc);
        RAISE NOTICE 'V8: added % (%.% -> %.%)', fk.con, fk.ct, fk.cc, fk.pt, fk.pc;
    END LOOP;

    -- Document the polymorphic columns that intentionally have NO FK (idempotent).
    IF to_regclass('public.stock_movements') IS NOT NULL THEN
        EXECUTE 'COMMENT ON COLUMN public.stock_movements.source_id IS ''Polymorphic ref: resolves against a table chosen by source_type. No FK by design (ARCHFIX §1.7). Indexed via idx_sm_source on (source_type, source_id).''';
    END IF;
END $$;
