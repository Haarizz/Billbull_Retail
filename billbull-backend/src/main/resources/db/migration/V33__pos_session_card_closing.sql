ALTER TABLE pos_sessions
    ADD COLUMN IF NOT EXISTS card_closing_cash NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS card_difference NUMERIC(15,2);
