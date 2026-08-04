-- Day Close session-driven resolution: PosSession.tradingDate is the real calendar
-- day a session opened on (openedAt::date), immutable, set once at creation. It is
-- the single source of truth for the Day Close domain only (PosPendingDayCloseResolver,
-- closeDay(), Day Close Summary, dynamic Z-Report session grouping) — deliberately
-- independent of session_date, the Business-Date-derived accounting bucket that
-- everything outside Day Close (cash movements/GL, X-Report numbering, advance
-- receipts) continues to use unchanged.
ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS trading_date DATE;

-- Backfill strategy for historical rows: trading_date = DATE(opened_at) where opened_at
-- is present (the true, immutable record of when the session was actually opened —
-- more accurate than session_date, which may already reflect an accumulated Business
-- Date lag for rows written before this feature existed). Falls back to session_date
-- only for the rare legacy row missing opened_at, so no row is left null.
UPDATE pos_sessions
SET trading_date = COALESCE(opened_at::date, session_date)
WHERE trading_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_pos_session_trading_date ON pos_sessions (branch_id, trading_date);
