-- Access-control audit ledger: who changed a role, a permission, or a user's role/branch
-- assignment, with the value before and after, the reason given, the users affected, and the
-- request context (IP, user agent, branch, tenant host).
--
-- Deliberately a separate table from audit_logs:
--   * audit_logs is written asynchronously (a failed write is lost) and is pruned by
--     AuditLogRetentionJob when audit.retention.months > 0. Access-control history must be
--     complete and permanent, so this table is written in the SAME transaction as the change
--     (the change and its audit row commit or roll back together) and no job deletes from it.
--   * It is append-only at the database level: the triggers below reject UPDATE, DELETE and
--     TRUNCATE from every application connection, so an administrator (or a bug) can neither edit
--     nor erase history through the app. A database owner could still drop the trigger, which is
--     why every row also carries a SHA-256 hash chain (prev_hash -> row_hash) that
--     GET /api/access-audit/verify re-computes: any edited, deleted or re-ordered row breaks it.
--
-- Additive and idempotent: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

CREATE TABLE IF NOT EXISTS access_audit_events (
    id                  BIGSERIAL PRIMARY KEY,
    occurred_at         TIMESTAMP(6)  NOT NULL,
    actor_user_id       BIGINT,
    actor_username      VARCHAR(120)  NOT NULL,
    actor_roles         VARCHAR(500),
    action              VARCHAR(60)   NOT NULL,
    target_type         VARCHAR(40)   NOT NULL,
    target_id           VARCHAR(120),
    target_label        VARCHAR(255),
    role_name           VARCHAR(120),
    module              VARCHAR(160),
    previous_value      TEXT,
    new_value           TEXT,
    change_summary      VARCHAR(1000),
    reason              VARCHAR(1000),
    affected_user_ids   TEXT,
    affected_usernames  TEXT,
    affected_user_count INTEGER       NOT NULL DEFAULT 0,
    branch_id           BIGINT,
    tenant              VARCHAR(200),
    ip_address          VARCHAR(80),
    user_agent          VARCHAR(500),
    request_id          VARCHAR(120),
    change_set_id       VARCHAR(64),
    prev_hash           VARCHAR(64),
    row_hash            VARCHAR(64)   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_audit_time        ON access_audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_role_time   ON access_audit_events (role_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_actor_time  ON access_audit_events (actor_username, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_action_time ON access_audit_events (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_change_set  ON access_audit_events (change_set_id);

CREATE OR REPLACE FUNCTION access_audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    RAISE EXCEPTION 'access_audit_events is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END
$fn$;

DROP TRIGGER IF EXISTS trg_access_audit_no_update_delete ON access_audit_events;
CREATE TRIGGER trg_access_audit_no_update_delete
    BEFORE UPDATE OR DELETE ON access_audit_events
    FOR EACH ROW EXECUTE FUNCTION access_audit_events_append_only();

DROP TRIGGER IF EXISTS trg_access_audit_no_truncate ON access_audit_events;
CREATE TRIGGER trg_access_audit_no_truncate
    BEFORE TRUNCATE ON access_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION access_audit_events_append_only();
