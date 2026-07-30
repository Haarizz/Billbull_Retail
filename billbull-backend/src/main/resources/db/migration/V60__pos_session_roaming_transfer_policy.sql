-- V60: POS Session Roaming — Phase 9 (Supervisor Authorization Policy).
--
-- Adds the single new column the transfer policy needs: a per-branch toggle for whether a
-- cross-branch session transfer requires supervisor authorization. No other schema changes —
-- the ALLOWED/SUPERVISOR_REQUIRED/DENIED decision itself is computed in application code
-- (pos.session.PosSessionTransferPolicy) and never persisted.
--
-- SAFETY (per project_stale_schema_upgrade_hazard convention, mirroring V59):
--   * ADDITIVE + NULLABLE only. No NOT NULL, no FK constraints.
--   * IDEMPOTENT — ADD COLUMN IF NOT EXISTS.
--   * GUARDED — checks to_regclass so a fresh DB (Hibernate not yet run) is a no-op.

DO $$
BEGIN
    IF to_regclass('public.pos_settings') IS NOT NULL THEN
        ALTER TABLE public.pos_settings
            ADD COLUMN IF NOT EXISTS require_supervisor_for_cross_branch_transfer BOOLEAN NOT NULL DEFAULT TRUE;

        RAISE NOTICE 'V60: pos_settings.require_supervisor_for_cross_branch_transfer ensured.';
    ELSE
        RAISE NOTICE 'V60: pos_settings absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;
