-- V91 — Variance approval and accounting-posting state on the session close snapshot.
--
-- Two gaps this closes.
--
-- 1. Approval was a client boolean. closeSession's threshold gate was satisfied by
--    `"supervisorApproved": true` in the request body: no credential check, no approver
--    identity, no record of what was approved. Any caller could close an arbitrarily large
--    variance, and the product could not even satisfy the gate through its own UI. These
--    columns record who authorized which variance, and on what basis.
--
-- 2. GL posting failures vanished. The session-close journal was wrapped in an empty catch, so
--    a session could report itself fully reconciled while no accounting entry existed. The
--    posting status makes that state visible and recoverable instead of silent.
--
--   variance_approval_status  NOT_REQUIRED / REQUIRED / APPROVED. Null on historical rows.
--   variance_approved_by      username of the approver, resolved server-side from verified
--                             credentials -- never a name supplied by the client.
--   variance_approved_by_user_id  stable id counterpart.
--   variance_approved_at      when the grant was issued.
--   variance_approval_reason  the approver's stated reason.
--   gl_posting_status         PENDING / POSTED / FAILED / NOT_REQUIRED.
--   gl_posting_reference      the journal reference (SCL-{sessionId}), so the close is
--                             traceable to its entry without parsing anything.
--   gl_posting_error          the failure, kept for diagnosis and retry.
--   gl_posted_at              when posting succeeded.
--
-- Backward compatibility: all nullable, no backfill. Historical sessions keep NULL, which reads
-- as "predates this tracking" rather than as an unapproved variance or a failed posting. No
-- existing financial value is rewritten.
--
-- Additive and idempotent, per the repo convention.

DO $$
DECLARE
    col TEXT;
    ddl TEXT;
BEGIN
    IF to_regclass('public.pos_sessions') IS NULL THEN
        RETURN;
    END IF;

    FOR col, ddl IN
        SELECT * FROM (VALUES
            ('variance_approval_status',     'VARCHAR(20)'),
            ('variance_approved_by',         'VARCHAR(100)'),
            ('variance_approved_by_user_id', 'BIGINT'),
            ('variance_approved_at',         'TIMESTAMP'),
            ('variance_approval_reason',     'VARCHAR(500)'),
            ('gl_posting_status',            'VARCHAR(20)'),
            ('gl_posting_reference',         'VARCHAR(100)'),
            ('gl_posting_error',             'VARCHAR(1000)'),
            ('gl_posted_at',                 'TIMESTAMP')
        ) AS t(col, ddl)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pos_sessions' AND column_name = col
        ) THEN
            EXECUTE format('ALTER TABLE pos_sessions ADD COLUMN %I %s NULL', col, ddl);
        END IF;
    END LOOP;
END $$;
