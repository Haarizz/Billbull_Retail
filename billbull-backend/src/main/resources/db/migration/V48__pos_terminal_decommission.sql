-- V48 — Complete the POS Terminal DECOMMISSION workflow.
--
-- PosTerminalStatus.DECOMMISSIONED has existed since the terminal lifecycle was introduced and is
-- already checked/excluded everywhere ARCHIVED is (registration, heartbeat, slot counting,
-- auto-archive sweep candidacy) — but nothing has ever set a terminal TO this status. This
-- migration adds the timestamp/reason columns needed to actually assign it, mirroring the existing
-- archived_at / archive_reason pair. See docs — BillBull-POS-Terminal-Archive-Lifecycle-Review.html.
--
-- Unlike ARCHIVED (reversible), DECOMMISSIONED is permanent by design: no restore path is added
-- for it anywhere in the service layer.
--
-- SAFETY (per project_stale_schema_upgrade_hazard convention, mirroring V40):
--   * ADDITIVE + NULLABLE only.
--   * IDEMPOTENT — ADD COLUMN IF NOT EXISTS.
--   * GUARDED — checks to_regclass so a fresh DB (Hibernate not yet run) is a no-op.

DO $$
BEGIN
    IF to_regclass('public.pos_terminals') IS NOT NULL THEN
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS decommissioned_at TIMESTAMP;
        ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS decommission_reason VARCHAR(255);

        RAISE NOTICE 'V48: pos_terminals decommission columns ensured.';
    ELSE
        RAISE NOTICE 'V48: pos_terminals absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;
