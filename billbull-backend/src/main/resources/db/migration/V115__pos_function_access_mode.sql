-- V115 — Who may use the POS Functions/Actions buttons.
--
-- The right-hand Actions panel (Classic, Cart Focus) and the Functions slide-over (Compact)
-- expose Returns, Layaways, Cash Drawer, Reprint, Delivery Settlement and the rest of the
-- shared function set. Until now every signed-in POS user could use all of them, which is
-- right for a small counter and wrong for a branch where the cashier on shift should not be
-- able to raise a return or pop the drawer unsupervised.
--
-- One branch-wide setting, three modes (see PosFunctionAccessMode):
--
--   ALL_USERS            — any POS user. The historical behaviour, and the default, so an
--                          unmigrated branch behaves exactly as it does today.
--   SUPERVISOR_PASSWORD  — any POS user, but each use is authorized first with the supervisor
--                          credential (PIN or password, per supervisor_approval_mode). Users
--                          who already hold a supervisor role are not asked for their own.
--   SUPERVISOR_ONLY      — only supervisor-capable roles; refused outright for everyone else.
--
-- The mode is deliberately not per-template: all three screen templates read the same column,
-- so the rule cannot be weakened by switching layouts.
--
-- Additive and idempotent, guarded the same way as every other script here.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pos_settings'
                         AND column_name = 'pos_function_access_mode') THEN
        ALTER TABLE pos_settings ADD COLUMN pos_function_access_mode VARCHAR(30);
    END IF;
END $$;

-- Backfill as a separate statement so a re-run over an already-migrated database is a no-op
-- rather than resetting a branch that has since chosen a restricted mode.
UPDATE pos_settings
   SET pos_function_access_mode = 'ALL_USERS'
 WHERE pos_function_access_mode IS NULL;
