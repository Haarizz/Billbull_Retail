-- BillBull Platform control plane — initial schema. This database belongs to the control plane
-- only; it never holds tenant business data. Flyway owns the schema (ddl-auto=validate).

CREATE TABLE plans (
    id                        bigserial     PRIMARY KEY,
    code                      varchar(40)   NOT NULL UNIQUE,
    name                      varchar(120)  NOT NULL,
    description               varchar(500),
    modules                   varchar(200)  NOT NULL DEFAULT '',
    max_users                 integer,
    max_branches              integer,
    max_terminals_per_branch  integer,
    monthly_price             numeric(12, 2),
    currency                  varchar(3)    NOT NULL DEFAULT 'AED',
    active                    boolean       NOT NULL DEFAULT true,
    created_at                timestamptz   NOT NULL DEFAULT now(),
    updated_at                timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
    id                        bigserial     PRIMARY KEY,
    code                      varchar(40)   NOT NULL UNIQUE,
    name                      varchar(200)  NOT NULL,
    status                    varchar(20)   NOT NULL DEFAULT 'ONBOARDING',
    status_reason             varchar(500),
    status_message            varchar(500),
    status_changed_at         timestamptz,
    plan_id                  bigint        REFERENCES plans (id),
    app_url                   varchar(300),
    agent_url                 varchar(300),
    agent_secret_enc          varchar(500),
    agent_secret_set_at       timestamptz,
    server_label              varchar(120),
    spring_profile            varchar(60),
    backend_port              integer,
    database_name             varchar(100),
    contact_name              varchar(150),
    contact_email             varchar(200),
    contact_phone             varchar(50),
    notes                     text,
    max_users                 integer,
    max_branches              integer,
    max_terminals_per_branch  integer,
    config_version            bigint        NOT NULL DEFAULT 1,
    applied_config_version    bigint        NOT NULL DEFAULT 0,
    last_sync_at              timestamptz,
    last_sync_error           varchar(1000),
    last_health_status        varchar(20),
    last_health_at            timestamptz,
    created_at                timestamptz   NOT NULL DEFAULT now(),
    updated_at                timestamptz   NOT NULL DEFAULT now(),
    created_by                varchar(200),
    CONSTRAINT chk_tenants_code CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
    CONSTRAINT chk_tenants_status CHECK (status IN ('ONBOARDING', 'ACTIVE', 'READ_ONLY', 'SUSPENDED', 'ARCHIVED'))
);

-- Per-tenant module overrides on top of the plan: absent row = follow the plan.
CREATE TABLE tenant_module_overrides (
    tenant_id  bigint       NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    module     varchar(40)  NOT NULL,
    enabled    boolean      NOT NULL,
    PRIMARY KEY (tenant_id, module)
);

CREATE TABLE tenant_domains (
    id              bigserial     PRIMARY KEY,
    tenant_id       bigint        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    host            varchar(253)  NOT NULL UNIQUE,
    kind            varchar(20)   NOT NULL DEFAULT 'APP',
    primary_domain  boolean       NOT NULL DEFAULT false,
    created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_domains_tenant ON tenant_domains (tenant_id);

CREATE TABLE health_snapshots (
    id                       bigserial     PRIMARY KEY,
    tenant_id                bigint        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    checked_at               timestamptz   NOT NULL DEFAULT now(),
    status                   varchar(20)   NOT NULL,
    http_status              integer,
    latency_ms               bigint,
    app_version              varchar(60),
    artifact_sha256          varchar(64),
    artifact_time            varchar(40),
    flyway_version           varchar(30),
    flyway_pending           integer,
    flyway_failed            integer,
    db_size_bytes            bigint,
    active_users             bigint,
    branches                 bigint,
    terminals                bigint,
    open_sessions            bigint,
    invoices_30d             bigint,
    last_invoice_at          varchar(40),
    heap_used_bytes          bigint,
    heap_max_bytes           bigint,
    disk_free_bytes          bigint,
    disk_total_bytes         bigint,
    uptime_seconds           bigint,
    reported_status          varchar(20),
    reported_config_version  bigint,
    error                    varchar(1000)
);
CREATE INDEX idx_health_snapshots_tenant_time ON health_snapshots (tenant_id, checked_at DESC);

CREATE TABLE platform_users (
    id                      bigserial     PRIMARY KEY,
    email                   varchar(200)  NOT NULL UNIQUE,
    full_name               varchar(150)  NOT NULL,
    password_hash           varchar(100)  NOT NULL,
    role                    varchar(20)   NOT NULL,
    active                  boolean       NOT NULL DEFAULT true,
    mfa_enabled             boolean       NOT NULL DEFAULT false,
    mfa_secret_enc          varchar(500),
    mfa_pending_secret_enc  varchar(500),
    failed_attempts         integer       NOT NULL DEFAULT 0,
    locked_until            timestamptz,
    last_login_at           timestamptz,
    last_login_ip           varchar(64),
    password_changed_at     timestamptz,
    must_change_password    boolean       NOT NULL DEFAULT false,
    token_version           integer       NOT NULL DEFAULT 0,
    created_at              timestamptz   NOT NULL DEFAULT now(),
    updated_at              timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_platform_users_role CHECK (role IN ('OWNER', 'OPERATOR', 'VIEWER'))
);

-- Append-only, hash-chained audit trail of every control-plane action.
CREATE TABLE platform_audit_events (
    id           bigserial     PRIMARY KEY,
    occurred_at  timestamptz   NOT NULL,
    actor_id     bigint,
    actor_email  varchar(200),
    action       varchar(60)   NOT NULL,
    target_type  varchar(40),
    target_id    varchar(100),
    tenant_id    bigint,
    detail       text,
    ip           varchar(64),
    prev_hash    varchar(64),
    hash         varchar(64)   NOT NULL
);
CREATE INDEX idx_platform_audit_tenant ON platform_audit_events (tenant_id, id DESC);
CREATE INDEX idx_platform_audit_time ON platform_audit_events (occurred_at DESC);

CREATE FUNCTION platform_audit_events_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'platform_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_platform_audit_no_update_delete
    BEFORE UPDATE OR DELETE ON platform_audit_events
    FOR EACH ROW EXECUTE FUNCTION platform_audit_events_immutable();
CREATE TRIGGER trg_platform_audit_no_truncate
    BEFORE TRUNCATE ON platform_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_events_immutable();

CREATE TABLE support_sessions (
    id                   bigserial      PRIMARY KEY,
    tenant_id            bigint         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    platform_user_id     bigint,
    platform_user_email  varchar(200),
    reason               varchar(1000)  NOT NULL,
    ticket_ref           varchar(100),
    minutes              integer        NOT NULL,
    tenant_session_id    bigint,
    expires_at           timestamptz    NOT NULL,
    created_at           timestamptz    NOT NULL DEFAULT now(),
    revoked_at           timestamptz,
    revoked_by           varchar(200)
);
CREATE INDEX idx_support_sessions_tenant ON support_sessions (tenant_id, created_at DESC);

CREATE TABLE backup_reports (
    id               bigserial      PRIMARY KEY,
    tenant_id        bigint         REFERENCES tenants (id) ON DELETE SET NULL,
    tenant_code      varchar(40),
    database_name    varchar(100),
    kind             varchar(20)    NOT NULL DEFAULT 'DATABASE',
    status           varchar(20)    NOT NULL,
    started_at       timestamptz,
    finished_at      timestamptz,
    size_bytes       bigint,
    location         varchar(500),
    checksum_sha256  varchar(64),
    message          varchar(1000),
    reported_at      timestamptz    NOT NULL DEFAULT now(),
    reporter_ip      varchar(64),
    CONSTRAINT chk_backup_reports_kind CHECK (kind IN ('DATABASE', 'UPLOADS')),
    CONSTRAINT chk_backup_reports_status CHECK (status IN ('SUCCESS', 'FAILED'))
);
CREATE INDEX idx_backup_reports_tenant ON backup_reports (tenant_id, reported_at DESC);

-- Starting plans. Modules are the tenant's optional modules (PlatformModules on the tenant side);
-- sales, inventory, dashboard and user management are always included.
INSERT INTO plans (code, name, description, modules, max_users, max_branches, max_terminals_per_branch, monthly_price)
VALUES
    ('STARTER', 'Starter', 'One shop: sales, inventory and the POS till.', 'pos', 5, 1, 2, NULL),
    ('GROWTH', 'Growth', 'Adds purchasing and full accounting for a few branches.', 'pos,purchases,finance', 20, 3, 5, NULL),
    ('ENTERPRISE', 'Enterprise', 'Every module, no limits.', 'pos,purchases,finance,hr,customer', NULL, NULL, NULL, NULL);
