-- Idempotency key for manually recorded ledger transactions
-- (Finance -> Ledger -> Record Transaction).
--
-- QA found that submitting the transaction form repeatedly (rapid/double clicks, or a
-- retry after a slow response) creates one ledger entry per click, each with a different
-- client-generated voucher number, so nothing downstream could tell them apart. The
-- account balance and cost-center spend are advanced once per duplicate too, which
-- silently corrupts the ledger.
--
-- The client now sends a UUID minted once per open form; the server treats a second POST
-- carrying a key it has already stored as a replay and returns the entry it wrote the
-- first time. The unique index is what makes that safe under genuinely concurrent
-- double-submits, where the pre-check on both requests can miss.
--
-- Nullable + partial index: rows written before this migration, and any writer that does
-- not supply a key (posting engine, opening balances, backfills), are unaffected.
--
-- Idempotent: IF NOT EXISTS on both statements, so re-running on a baselined tenant is a no-op.

ALTER TABLE ledger_entries
    ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entry_client_request_id
    ON ledger_entries (client_request_id)
    WHERE client_request_id IS NOT NULL;
