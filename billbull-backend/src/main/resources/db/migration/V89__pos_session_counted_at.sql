-- V89 — Server-authoritative denomination counting: record WHEN a drawer was physically
-- counted, and in WHICH currency, as facts of their own.
--
-- Why these are not duplicates of existing columns:
--
--   counted_at vs closed_at
--     Today a drawer is only ever counted as part of closing, so the two timestamps coincide
--     and closed_at has been doing double duty. They are different facts: closed_at is when the
--     session ended, counted_at is when someone physically counted the notes. Once counting can
--     happen independently of closing they diverge, and more immediately, counted_at is what
--     distinguishes "not counted" from "counted and found empty" without inferring it from
--     whether closing_cash happens to be zero.
--
--   counted_currency_code
--     A "500" denomination key means different money in different currencies. Storing the
--     currency makes the snapshot self-describing, so re-totalling a stored count (corrections,
--     replayed reports) cannot silently use today's company currency for yesterday's count.
--
-- Deliberately NOT added here: closing_cash, closing_denominations_json, expected_cash and
-- cash_difference already exist and are reused as-is — closing_cash simply stops being a
-- client-supplied number and becomes the server's computed denomination total. No
-- variance_status (variance workflow is a later phase) and no opening_denominations_json
-- (opening float is out of this phase's scope).
--
-- Backward compatibility: both columns are nullable with no backfill and no rewrite of any
-- historical financial value. Sessions closed before this migration keep counted_at NULL while
-- still carrying a closing_denominations_json; the read path treats a present snapshot with a
-- NULL counted_at as counted at closed_at, so historical sessions do not regress to "not
-- counted". Nothing here changes a single existing amount.
--
-- Additive and idempotent, per the repo convention: guarded so re-running against an
-- already-migrated tenant is a no-op.

DO $$
BEGIN
    IF to_regclass('public.pos_sessions') IS NOT NULL THEN

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_sessions' AND column_name = 'counted_at'
        ) THEN
            ALTER TABLE pos_sessions ADD COLUMN counted_at TIMESTAMP NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_sessions' AND column_name = 'counted_currency_code'
        ) THEN
            ALTER TABLE pos_sessions ADD COLUMN counted_currency_code VARCHAR(3) NULL;
        END IF;

    END IF;
END $$;
