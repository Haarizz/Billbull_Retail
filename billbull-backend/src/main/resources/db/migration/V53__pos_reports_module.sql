-- V53: POS Reports module (back-office historical X/Z report browser).
--
-- 1. Formalizes pos_day_closes with an explicit CREATE TABLE IF NOT EXISTS (previously
--    only Hibernate ddl-auto=update managed it, per the V51/V52 notes) and adds
--    report_number for immutable Z-Report numbering.
-- 2. New pos_x_report_snapshots table — persists the complete X-Report JSON the first
--    time a session's X-Report is explicitly generated (see PosSessionService.generateXReport),
--    closing the gap where X-Reports had no stored, immutable snapshot.
-- 3. New pos_report_sequences table — per (report_type, branch_id, business_date) running
--    counter backing XR-/ZR- report numbers, same locking pattern as VoucherSequence.
--
-- All DDL is guarded/idempotent: CREATE TABLE IF NOT EXISTS, and ALTER ADD COLUMN only
-- when the column is absent. No existing table/column is altered or dropped.

CREATE TABLE IF NOT EXISTS pos_day_closes (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL,
    close_date DATE NOT NULL,
    closed_by VARCHAR(100),
    closed_at TIMESTAMP NOT NULL,
    report_version VARCHAR(50),
    app_version VARCHAR(50),
    branch_name VARCHAR(100),
    branch_code VARCHAR(50),
    time_zone VARCHAR(50),
    z_report_json TEXT,
    gross_sales NUMERIC(19,4) DEFAULT 0,
    net_sales NUMERIC(19,4) DEFAULT 0,
    total_discount NUMERIC(19,4) DEFAULT 0,
    total_vat NUMERIC(19,4) DEFAULT 0,
    cash_sales NUMERIC(19,4) DEFAULT 0,
    card_sales NUMERIC(19,4) DEFAULT 0,
    credit_sales NUMERIC(19,4) DEFAULT 0,
    other_sales NUMERIC(19,4) DEFAULT 0,
    expected_cash NUMERIC(19,4) DEFAULT 0,
    total_invoices INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    start_session_id BIGINT,
    end_session_id BIGINT,
    CONSTRAINT uk_pos_day_close_branch_date UNIQUE (branch_id, close_date)
);

CREATE TABLE IF NOT EXISTS pos_x_report_snapshots (
    id BIGSERIAL PRIMARY KEY,
    report_number VARCHAR(50) NOT NULL,
    session_id BIGINT NOT NULL,
    branch_id BIGINT NOT NULL,
    branch_name VARCHAR(100),
    terminal_id VARCHAR(100),
    counter_id BIGINT,
    counter_name VARCHAR(100),
    cashier_name VARCHAR(100),
    business_date DATE NOT NULL,
    generated_by VARCHAR(100),
    generated_at TIMESTAMP NOT NULL,
    report_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uk_pos_x_report_number UNIQUE (report_number)
);

CREATE TABLE IF NOT EXISTS pos_report_sequences (
    id BIGSERIAL PRIMARY KEY,
    report_type VARCHAR(10) NOT NULL,
    branch_id BIGINT NOT NULL,
    business_date DATE NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_pos_report_sequence UNIQUE (report_type, branch_id, business_date)
);

DO $$
BEGIN
    IF to_regclass('pos_day_closes') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_day_closes' AND column_name = 'report_number'
        ) THEN
            ALTER TABLE pos_day_closes ADD COLUMN report_number VARCHAR(50);
            RAISE NOTICE 'Added report_number to pos_day_closes';
        END IF;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_pos_day_close_report_number
    ON pos_day_closes (report_number) WHERE report_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_day_close_branch_date ON pos_day_closes (branch_id, close_date);
CREATE INDEX IF NOT EXISTS idx_pos_x_report_branch_date ON pos_x_report_snapshots (branch_id, business_date);
CREATE INDEX IF NOT EXISTS idx_pos_x_report_session ON pos_x_report_snapshots (session_id);
CREATE INDEX IF NOT EXISTS idx_pos_x_report_generated_by ON pos_x_report_snapshots (generated_by);
