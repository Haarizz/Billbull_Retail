-- V90 — Day Close finally reconciles physical cash.
--
-- Until now pos_day_closes stored expected_cash and nothing else about the drawer. Its only
-- cash check compared one derivation of EXPECTED against another derivation of EXPECTED
-- (expectedCashComputed vs Σ session.expected_cash), which can detect data drifting after a
-- close but can never detect that the money is not there. The day has never held a counted
-- figure at all, so no day-level over/short has ever been recorded.
--
-- These columns let the day carry the same reconciliation the sessions already carry, summed
-- from their frozen snapshots rather than re-derived:
--
--   counted_cash            Σ frozen counted cash over the COUNTED sessions only. NULL when no
--                           session was counted -- zero would assert that drawers were checked
--                           and found empty.
--   cash_variance           counted_cash - expected_cash, and NULL unless every session was
--                           counted. Subtracting the expected cash of all drawers from the
--                           counted cash of some reports the uncounted tills as an enormous
--                           shortage: a number that looks like a finding and is an artifact.
--   variance_status         NOT_COUNTED / BALANCED / OVER / SHORT. A day with any uncounted
--                           drawer is NOT_COUNTED, never BALANCED.
--   sessions_with_variance  how many counted drawers did not balance.
--   uncounted_session_count how many were never counted -- keeps the gap visible instead of
--                           folded into the totals.
--   status                  GENERATED / REVIEWED / FINALIZED.
--
-- Deliberately NOT added: approval_status, approved_by, approved_at. Variance approval is a
-- later phase and dead columns invite being filled in by something that was never designed.
-- expected_cash already exists and is reused.
--
-- Backward compatibility: every column is nullable with no backfill. Existing day closes keep
-- NULL counted_cash and NULL cash_variance and render as "not counted" -- their drawers really
-- were never counted at the day level, and inventing a figure for them would be fabricating a
-- physical count that never happened. No historical financial value is rewritten.
--
-- Additive and idempotent, per the repo convention: guarded so re-running against an
-- already-migrated tenant is a no-op.

DO $$
BEGIN
    IF to_regclass('public.pos_day_closes') IS NOT NULL THEN

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'counted_cash') THEN
            ALTER TABLE pos_day_closes ADD COLUMN counted_cash NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'cash_variance') THEN
            ALTER TABLE pos_day_closes ADD COLUMN cash_variance NUMERIC(19,4) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'variance_status') THEN
            ALTER TABLE pos_day_closes ADD COLUMN variance_status VARCHAR(20) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'sessions_with_variance') THEN
            ALTER TABLE pos_day_closes ADD COLUMN sessions_with_variance INTEGER NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'uncounted_session_count') THEN
            ALTER TABLE pos_day_closes ADD COLUMN uncounted_session_count INTEGER NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_day_closes' AND column_name = 'status') THEN
            ALTER TABLE pos_day_closes ADD COLUMN status VARCHAR(20) NULL;
        END IF;

    END IF;
END $$;
