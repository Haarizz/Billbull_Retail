-- V13: POS Phase-1 Safety Fixes
-- 1. Checkout idempotency key on sales_invoices (prevents duplicate-charge on network retry)
-- 2. Layaway deposit journal ID (links the deposit GL posting for reversal on cancel)
-- 3. Unique OPEN-session-per-terminal constraint on pos_sessions
--
-- All DDL is guarded: already-present columns/indexes are skipped, absent tables no-op.

DO $$
DECLARE
    v_table TEXT;
BEGIN

    -- ── 1. pos_checkout_key on sales_invoices ────────────────────────────────
    v_table := 'sales_invoices';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'pos_checkout_key'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN pos_checkout_key VARCHAR(100)', v_table);
            EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS uq_si_pos_checkout_key ON %I (pos_checkout_key) WHERE pos_checkout_key IS NOT NULL', v_table);
            RAISE NOTICE 'Added pos_checkout_key to %', v_table;
        ELSE
            RAISE NOTICE 'pos_checkout_key already present on %', v_table;
        END IF;
    END IF;

    -- ── 2. deposit_journal_id on pos_layaways ────────────────────────────────
    v_table := 'pos_layaways';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = v_table AND column_name = 'deposit_journal_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN deposit_journal_id BIGINT', v_table);
            RAISE NOTICE 'Added deposit_journal_id to %', v_table;
        ELSE
            RAISE NOTICE 'deposit_journal_id already present on %', v_table;
        END IF;
    END IF;

    -- ── 3. Unique open session per terminal on pos_sessions ──────────────────
    -- Partial unique index enforces the constraint without blocking CLOSED duplicates
    -- (same terminal can have multiple historical CLOSED sessions).
    v_table := 'pos_sessions';
    IF to_regclass(v_table) IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = v_table AND indexname = 'uq_pos_session_terminal_open'
        ) THEN
            -- Only safe to create if there are no current duplicate OPEN rows.
            -- If duplicates exist, log a warning and skip (manual cleanup required).
            IF (
                SELECT COUNT(*) FROM (
                    SELECT terminal_id FROM pos_sessions WHERE status = 'OPEN'
                    GROUP BY terminal_id HAVING COUNT(*) > 1
                ) dups
            ) = 0 THEN
                EXECUTE 'CREATE UNIQUE INDEX uq_pos_session_terminal_open ON pos_sessions (terminal_id) WHERE status = ''OPEN''';
                RAISE NOTICE 'Created uq_pos_session_terminal_open';
            ELSE
                RAISE WARNING 'Duplicate OPEN sessions exist for some terminals — skipping uq_pos_session_terminal_open. Resolve duplicates manually before re-running.';
            END IF;
        ELSE
            RAISE NOTICE 'uq_pos_session_terminal_open already present';
        END IF;
    END IF;

END $$;
