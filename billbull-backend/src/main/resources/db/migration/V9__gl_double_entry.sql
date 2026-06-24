-- V9 — DB-level double-entry enforcement: SUM(debit) = SUM(credit) per journal entry
--      (ARCHFIX §5.5 / §1.14). The app-layer balanceGuard already enforces this, but direct
--      SQL (or a future code path) could bypass it; this makes the invariant a database law.
--
-- MECHANISM: a DEFERRABLE INITIALLY DEFERRED constraint trigger on journal_lines. Double-entry
-- is a MULTI-ROW invariant — it only holds once ALL lines of an entry are present — so the
-- check must run at COMMIT, not per-row. A normal (non-deferred) trigger would fire after the
-- first line insert, see 1 line, and wrongly reject the (still in-progress) entry. Deferring to
-- transaction commit lets the posting engine insert every line first; the balance is then
-- asserted exactly once per touched entry. Money is NUMERIC(15,2) (exact) so the comparison is
-- exact — no epsilon. Entries with zero lines sum to 0 = 0 and pass.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before CREATE. Guarded so it
-- no-ops when journal_lines does not yet exist (Flyway runs before Hibernate on a fresh DB).
--
-- SAFETY: validated against live data first — testdb had 0 unbalanced entries. If a tenant DB
-- somehow holds a pre-existing unbalanced entry, this trigger does NOT retro-validate existing
-- rows (a constraint trigger only fires on future INSERT/UPDATE/DELETE), so install never fails;
-- the bad entry only surfaces when something next modifies its lines. A separate report query
-- (SUM(debit) <> SUM(credit) GROUP BY journal_entry_id) can be run to find any legacy drift.

DO $$
BEGIN
    IF to_regclass('public.journal_lines') IS NULL THEN
        RAISE NOTICE 'V9: journal_lines absent — skipping double-entry trigger (fresh DB, Hibernate not yet run).';
        RETURN;
    END IF;

    -- Trigger function: assert the touched entry balances. Runs at COMMIT (deferred).
    CREATE OR REPLACE FUNCTION enforce_double_entry_balance()
    RETURNS TRIGGER AS $fn$
    DECLARE
        v_entry_id BIGINT;
        v_debit    NUMERIC(15,2);
        v_credit   NUMERIC(15,2);
    BEGIN
        -- The entry whose lines changed: NEW for INSERT/UPDATE, OLD for DELETE.
        v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
        IF v_entry_id IS NULL THEN
            RETURN NULL;
        END IF;

        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO   v_debit, v_credit
        FROM   journal_lines
        WHERE  journal_entry_id = v_entry_id;

        -- An entry fully deleted (no remaining lines) yields 0 = 0 and passes.
        IF v_debit <> v_credit THEN
            RAISE EXCEPTION
                'UNBALANCED_JOURNAL: journal_entry_id % debit % <> credit % (double-entry violated).',
                v_entry_id, v_debit, v_credit
                USING ERRCODE = 'P0001';
        END IF;

        RETURN NULL; -- AFTER trigger: return value is ignored
    END;
    $fn$ LANGUAGE plpgsql;

    -- (Re)create the deferred constraint trigger.
    DROP TRIGGER IF EXISTS trg_double_entry_balance ON journal_lines;

    CREATE CONSTRAINT TRIGGER trg_double_entry_balance
        AFTER INSERT OR UPDATE OR DELETE ON journal_lines
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION enforce_double_entry_balance();

    RAISE NOTICE 'V9: double-entry balance constraint trigger installed on journal_lines.';
END $$;
