-- Add sales-tracking columns that the Product entity expects
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_sold_at    TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_quantity_sold BIGINT NOT NULL DEFAULT 0;
