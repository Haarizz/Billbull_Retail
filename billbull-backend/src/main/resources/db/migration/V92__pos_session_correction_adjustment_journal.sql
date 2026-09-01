-- V92 — Link an applied denomination correction to the adjustment journal it produced.
--
-- A denomination correction used to be display-only: its own javadoc stated it changed "no
-- sales, payment, cash movement, journal, or inventory record". That was true when written.
-- It stopped being true once the reconciliation service began reading the correction overlay:
-- a correction now moves effective counted cash and therefore effective variance, while the
-- posted SCL-{sessionId} journal still described the original count. Reports and ledger
-- disagreed, and nothing recorded that they did.
--
-- Applying a correction now posts one adjustment journal, SCLADJ-{sessionId}-v{version},
-- containing a full reversal of the original close entry plus the corrected one. The original
-- is never modified or deleted -- an already-posted journal is a historical fact, and rewriting
-- it would destroy the evidence of what was originally counted and approved.
--
--   adjustment_journal_reference  the SCLADJ reference, so the correction is traceable to its
--                                 entry without parsing anything. Also the idempotency key: a
--                                 retried apply resolves to the same reference and posts once.
--   adjustment_posted_at          when it posted.
--   adjustment_posting_error      the failure, kept rather than swallowed, so a correction whose
--                                 accounting did not land is visible and retryable instead of
--                                 silently leaving the ledger stale.
--
-- Backward compatibility: all nullable, no backfill. Corrections applied before this migration
-- keep NULL, which reads as "predates adjustment posting" -- not as a failed posting. No
-- historical financial value is rewritten.
--
-- Additive and idempotent, per the repo convention.

DO $$
DECLARE
    col TEXT;
    ddl TEXT;
BEGIN
    IF to_regclass('public.pos_session_denomination_corrections') IS NULL THEN
        RETURN;
    END IF;

    FOR col, ddl IN
        SELECT * FROM (VALUES
            ('adjustment_journal_reference', 'VARCHAR(100)'),
            ('adjustment_posted_at',         'TIMESTAMP'),
            ('adjustment_posting_error',     'VARCHAR(1000)')
        ) AS t(col, ddl)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_session_denomination_corrections' AND column_name = col
        ) THEN
            EXECUTE format('ALTER TABLE pos_session_denomination_corrections ADD COLUMN %I %s NULL',
                           col, ddl);
        END IF;
    END LOOP;
END $$;
