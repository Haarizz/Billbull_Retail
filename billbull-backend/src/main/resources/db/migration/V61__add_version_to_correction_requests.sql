-- STORY-101 (ADR-002) - Add optimistic locking to CorrectionRequest
--
-- Guarded/idempotent per the repo convention: on tenants where Hibernate's ddl-auto=update
-- already created the column (e.g. billbull_demo, which is only now being baselined and
-- replays every shared script over a Hibernate-built schema), a bare ADD COLUMN aborts the
-- whole migration with 42701 "column already exists" and the app fails to boot.
DO $$
BEGIN
    IF to_regclass('public.pos_correction_requests') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_correction_requests' AND column_name = 'version'
        ) THEN
            ALTER TABLE pos_correction_requests
            ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
        END IF;
    END IF;
END $$;
