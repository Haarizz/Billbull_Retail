-- Add available_in_pos column to products table for POS availability toggling
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_in_pos BOOLEAN NOT NULL DEFAULT TRUE;

-- Create index for faster filtering during POS lookups
CREATE INDEX IF NOT EXISTS idx_products_available_in_pos ON products(available_in_pos);
