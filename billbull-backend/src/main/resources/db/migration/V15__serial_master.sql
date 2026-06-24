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
