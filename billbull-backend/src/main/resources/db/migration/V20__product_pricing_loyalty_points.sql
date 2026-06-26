ALTER TABLE product_pricing
    ADD COLUMN IF NOT EXISTS loyalty_points NUMERIC;
