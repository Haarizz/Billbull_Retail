-- V15: Serial number registry + serial_number column on sales_invoice_items
-- All blocks are guarded for idempotency (re-runnable on an existing schema).

DO $$
BEGIN

  -- serial_master table
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'serial_master') THEN
    CREATE TABLE serial_master (
        id                  BIGSERIAL PRIMARY KEY,
        serial_number       VARCHAR(120) NOT NULL,
        product_code        VARCHAR(80)  NOT NULL,
        product_name        VARCHAR(255),
        status              VARCHAR(20)  NOT NULL DEFAULT 'AVAILABLE',
        warehouse_code      VARCHAR(50),
        branch_code         VARCHAR(50),
        purchase_reference  VARCHAR(100),
        sold_invoice_id     BIGINT,
        sold_invoice_number VARCHAR(60),
        sold_at             TIMESTAMP,
        returned_at         TIMESTAMP,
        notes               TEXT,
        is_active           BOOLEAN DEFAULT TRUE,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by          VARCHAR(100),
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by          VARCHAR(100)
    );
  END IF;

  -- Backfill columns for databases where serial_master was created before this migration.
  ALTER TABLE serial_master
    ADD COLUMN IF NOT EXISTS serial_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS product_code VARCHAR(80),
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'AVAILABLE',
    ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS branch_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS purchase_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS source_document_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_document_id BIGINT,
    ADD COLUMN IF NOT EXISTS source_line_id BIGINT,
    ADD COLUMN IF NOT EXISTS source_ref_no VARCHAR(100),
    ADD COLUMN IF NOT EXISTS warehouse_id BIGINT,
    ADD COLUMN IF NOT EXISTS zone_id BIGINT,
    ADD COLUMN IF NOT EXISTS locator_id BIGINT,
    ADD COLUMN IF NOT EXISTS bin_id BIGINT,
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15, 4),
    ADD COLUMN IF NOT EXISTS manufacturing_date DATE,
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS sold_invoice_id BIGINT,
    ADD COLUMN IF NOT EXISTS sold_invoice_number VARCHAR(60),
    ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

  -- Unique index on serial_number
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sm_serial_number') THEN
    CREATE UNIQUE INDEX idx_sm_serial_number ON serial_master (serial_number);
  END IF;

  -- Product code index
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sm_product_code') THEN
    CREATE INDEX idx_sm_product_code ON serial_master (product_code);
  END IF;

  -- Status index
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sm_status') THEN
    CREATE INDEX idx_sm_status ON serial_master (status);
  END IF;

  -- Branch index
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sm_branch') THEN
    CREATE INDEX idx_sm_branch ON serial_master (branch_code);
  END IF;

  -- serial_number column on sales_invoice_items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sales_invoice_items'
                   AND column_name = 'serial_number') THEN
    ALTER TABLE sales_invoice_items ADD COLUMN serial_number VARCHAR(120);
  END IF;

END $$;
