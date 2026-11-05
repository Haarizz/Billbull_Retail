-- V134 — length of the employee's till PIN (4–6), so the till keypad shows that many dots and
-- signs in on the last digit instead of waiting for Enter. Only the length is stored, never the
-- digits. Rows hashed before this column existed stay NULL until the next successful PIN sign-in
-- fills it in (PosPinLoginService.login); the till falls back to "press Enter" for those.
--
-- Additive and idempotent (to_regclass guard, IF NOT EXISTS).

DO $$
BEGIN
    IF to_regclass('public.employees') IS NOT NULL THEN
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS pos_pin_length SMALLINT;
    END IF;
END $$;
