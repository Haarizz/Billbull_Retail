-- V56: Enterprise Console > POS Administration > Cash Movement Categories (Phase 2).
--
-- 1. New pos_cash_movement_categories table — centrally managed Enterprise master data
--    (architectural review §7). Not tenant/branch-scoped.
-- 2. Nullable category_id, posted_account_code, posted_account_name added to
--    pos_cash_movements. category_id is NEVER backfilled — historical movements remain
--    genuinely uncategorized and are rendered "Uncategorized (Legacy)" by the UI, never
--    guessed. posted_account_code/name denormalize which GL account a movement's non-cash
--    leg actually posted to, so a later void reversal can mirror it exactly even if the
--    category's mapping changes afterward.
-- 3. Nullable require_cash_movement_category added to pos_settings (per-branch feature
--    toggle, defaulting false — existing deployments keep working unchanged until a branch
--    opts in; staged rollout across multi-tenant client databases per branch, not a single
--    global cutover).
--
-- All DDL is guarded/idempotent: CREATE TABLE IF NOT EXISTS, ALTER ADD COLUMN only when the
-- column is absent. No existing table/column is altered or dropped, and no historical row's
-- category_id is ever written by this migration.

CREATE TABLE IF NOT EXISTS pos_cash_movement_categories (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(500),
    movement_type VARCHAR(20) NOT NULL,
    gl_account_id VARCHAR(60),
    display_order INTEGER DEFAULT 0,
    notes_required BOOLEAN NOT NULL DEFAULT FALSE,
    approval_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    created_by VARCHAR(100),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    CONSTRAINT uk_pos_cash_movement_categories_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_pos_cash_movement_categories_active ON pos_cash_movement_categories (is_active);
CREATE INDEX IF NOT EXISTS idx_pos_cash_movement_categories_movement_type ON pos_cash_movement_categories (movement_type);

DO $$
BEGIN
    IF to_regclass('pos_cash_movements') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_cash_movements' AND column_name = 'category_id'
        ) THEN
            ALTER TABLE pos_cash_movements ADD COLUMN category_id BIGINT;
            RAISE NOTICE 'Added category_id to pos_cash_movements (nullable, never backfilled)';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_cash_movements' AND column_name = 'posted_account_code'
        ) THEN
            ALTER TABLE pos_cash_movements ADD COLUMN posted_account_code VARCHAR(20);
            RAISE NOTICE 'Added posted_account_code to pos_cash_movements';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_cash_movements' AND column_name = 'posted_account_name'
        ) THEN
            ALTER TABLE pos_cash_movements ADD COLUMN posted_account_name VARCHAR(150);
            RAISE NOTICE 'Added posted_account_name to pos_cash_movements';
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_category ON pos_cash_movements (category_id);

DO $$
BEGIN
    IF to_regclass('pos_settings') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_settings' AND column_name = 'require_cash_movement_category'
        ) THEN
            ALTER TABLE pos_settings ADD COLUMN require_cash_movement_category BOOLEAN NOT NULL DEFAULT FALSE;
            RAISE NOTICE 'Added require_cash_movement_category to pos_settings (default false)';
        END IF;
    END IF;
END $$;
