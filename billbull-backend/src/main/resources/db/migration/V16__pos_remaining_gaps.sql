-- V16 POS remaining gap-analysis items
-- §2.7  POS device registry
-- §3.4  Layaway partial payment history
-- §4.1  Receipt QR archival column on sales_invoices

-- ─── §2.7 pos_devices ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_devices (
    id                BIGSERIAL PRIMARY KEY,
    created_at        TIMESTAMP,
    created_by        VARCHAR(255),
    updated_at        TIMESTAMP,
    updated_by        VARCHAR(255),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    device_code       VARCHAR(50)  NOT NULL,
    device_name       VARCHAR(100),
    branch_id         BIGINT,
    branch_name       VARCHAR(100),
    counter_name      VARCHAR(100),
    status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    last_heartbeat    TIMESTAMP,
    notes             VARCHAR(500),
    CONSTRAINT uq_pos_device_code UNIQUE (device_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_device_code   ON pos_devices (device_code);
CREATE INDEX IF NOT EXISTS idx_pos_device_branch ON pos_devices (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_device_status ON pos_devices (status);

-- ─── §3.4 pos_layaway_payments ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_layaway_payments (
    id                BIGSERIAL PRIMARY KEY,
    created_at        TIMESTAMP,
    created_by        VARCHAR(255),
    updated_at        TIMESTAMP,
    updated_by        VARCHAR(255),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    layaway_id        BIGINT  NOT NULL REFERENCES pos_layaways(id),
    payment_date      DATE    NOT NULL,
    payment_mode      VARCHAR(50),
    amount            NUMERIC(18,2) NOT NULL,
    journal_id        BIGINT,
    reference_number  VARCHAR(100),
    notes             VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_layaway_payment_layaway ON pos_layaway_payments (layaway_id);
CREATE INDEX IF NOT EXISTS idx_layaway_payment_date    ON pos_layaway_payments (payment_date);

-- ─── §4.1 sales_invoices.pos_receipt_qr ──────────────────────────────────────

ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS pos_receipt_qr VARCHAR(500);
