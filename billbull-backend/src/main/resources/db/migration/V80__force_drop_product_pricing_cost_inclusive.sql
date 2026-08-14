DO $$
BEGIN
    IF to_regclass('public.product_pricing') IS NOT NULL THEN
        ALTER TABLE public.product_pricing
            DROP COLUMN IF EXISTS is_cost_inclusive;
    END IF;
END $$;
