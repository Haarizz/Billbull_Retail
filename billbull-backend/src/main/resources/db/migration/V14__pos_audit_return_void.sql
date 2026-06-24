-- V14: POS Phase-2 Audit, Void Attribution, Return Reasons, Z-Report Snapshot, Variance Gate
--
-- 1. pos_audit_log table (fire-and-forget audit trail for POS events)
-- 2. Void attribution columns on sales_invoice_items
-- 3. Return reason columns on sales_return_items
-- 4. Z-Report snapshot column on pos_sessions
-- 5. Cash variance threshold column on pos_settings
--
-- All DDL is guarded: existing tables/columns are skipped safely.

DO $$
DECLARE
    v_table TEXT;
BEGIN

    -- ── 1. pos_audit_log ──────────────────────────────────────────────────────
    IF to_regclass('pos_audit_log') IS NULL THEN
        CREATE TABLE pos_audit_log (
            id          BIGSERIAL PRIMARY KEY,
            session_id  BIGINT,
            terminal_id VARCHAR(100),
            branch_id   BIGINT,
            user_id     VARCHAR(100),
            action      VARCHAR(50) NOT NULL,
            entity_type VARCHAR(50),
            entity_id   VARCHAR(100),
            description VARCHAR(500),
            old_value_json TEXT,
            new_value_json TEXT,
            created_at  TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pal_session      ON pos_audit_log (session_id);
        CREATE INDEX IF NOT EXISTS idx_pal_branch_action ON pos_audit_log (branch_id, action);
        CREATE INDEX IF NOT EXISTS idx_pal_created       ON pos_audit_log (created_at);
        RAISE NOTICE 'Created pos_audit_log';
    ELSE
        RAISE NOTICE 'pos_audit_log already exists';
    END IF;

    -- ── 2. Void attribution on sales_invoice_items ────────────────────────────
    v_table := 'sales_invoice_items';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'void_reason'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN void_reason VARCHAR(500)', v_table);
            RAISE NOTICE 'Added void_reason to %', v_table;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'voided_by'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN voided_by VARCHAR(100)', v_table);
            RAISE NOTICE 'Added voided_by to %', v_table;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'voided_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN voided_at TIMESTAMP', v_table);
            RAISE NOTICE 'Added voided_at to %', v_table;
        END IF;
    END IF;

    -- ── 3. Return reason columns on sales_return_items ────────────────────────
    v_table := 'sales_return_items';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'return_reason'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN return_reason VARCHAR(100)', v_table);
            RAISE NOTICE 'Added return_reason to %', v_table;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'return_reason_notes'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN return_reason_notes TEXT', v_table);
            RAISE NOTICE 'Added return_reason_notes to %', v_table;
        END IF;
    END IF;

    -- ── 4. Z-Report snapshot column on pos_sessions ───────────────────────────
    v_table := 'pos_sessions';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'z_report_json'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN z_report_json TEXT', v_table);
            RAISE NOTICE 'Added z_report_json to %', v_table;
        END IF;
    END IF;

    -- ── 5. Cash variance threshold column on pos_settings ─────────────────────
    v_table := 'pos_settings';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'cash_variance_threshold'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN cash_variance_threshold NUMERIC(15,2) DEFAULT 0', v_table);
            RAISE NOTICE 'Added cash_variance_threshold to %', v_table;
        END IF;
    END IF;

END $$;
