-- Error logs collected from every tenant's platform agent (GET /api/platform/errors) and explained
-- in ERP terms by com.billbull.platform.errors.ErrorExplainer. Written only through JdbcTemplate
-- by ErrorSyncService / ErrorLogController; no JPA entity maps these tables.
--
-- error_groups: one row per distinct fault per tenant (the tenant's fingerprint). The technical
-- fields mirror the tenant; module/category/severity/rule_code/title are this control plane's
-- classification (recomputed on every sync and at startup, so improving the catalogue re-labels
-- old rows); status/note are the support team's triage.

CREATE TABLE error_groups (
    id                  bigserial      PRIMARY KEY,
    tenant_id           bigint         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    remote_id           bigint         NOT NULL,
    fingerprint         varchar(64)    NOT NULL,
    source              varchar(20)    NOT NULL,
    exception_class     varchar(200),
    root_cause_class    varchar(200),
    cause_chain         varchar(600),
    message             varchar(2000),
    root_cause_message  varchar(2000),
    error_code          varchar(80),
    sql_state           varchar(10),
    http_method         varchar(10),
    path_template       varchar(300),
    http_status         integer,
    logger              varchar(200),
    top_frame           varchar(400),
    stack_trace         text,
    app_version         varchar(60),
    first_seen_at       timestamptz    NOT NULL,
    last_seen_at        timestamptz    NOT NULL,
    occurrences         bigint         NOT NULL DEFAULT 1,
    last_request_id     varchar(120),
    last_username       varchar(100),
    last_branch_id      bigint,
    module              varchar(40)    NOT NULL DEFAULT 'GENERAL',
    category            varchar(40)    NOT NULL DEFAULT 'APPLICATION_BUG',
    severity            varchar(10)    NOT NULL DEFAULT 'MEDIUM',
    rule_code           varchar(60)    NOT NULL DEFAULT 'UNCLASSIFIED',
    title               varchar(200)   NOT NULL DEFAULT '',
    status              varchar(20)    NOT NULL DEFAULT 'OPEN',
    regressed           boolean        NOT NULL DEFAULT false,
    status_note         varchar(1000),
    status_changed_at   timestamptz,
    status_changed_by   varchar(200),
    synced_at           timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_error_groups_tenant_fp UNIQUE (tenant_id, fingerprint),
    CONSTRAINT chk_error_groups_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')),
    CONSTRAINT chk_error_groups_severity CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))
);
CREATE INDEX idx_error_groups_last_seen ON error_groups (last_seen_at DESC);
CREATE INDEX idx_error_groups_tenant ON error_groups (tenant_id, last_seen_at DESC);
CREATE INDEX idx_error_groups_remote ON error_groups (tenant_id, remote_id);

CREATE TABLE error_events (
    id           bigserial     PRIMARY KEY,
    group_id     bigint        NOT NULL REFERENCES error_groups (id) ON DELETE CASCADE,
    tenant_id    bigint        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    remote_id    bigint        NOT NULL,
    occurred_at  timestamptz   NOT NULL,
    request_id   varchar(120),
    username     varchar(100),
    branch_id    bigint,
    http_method  varchar(10),
    path         varchar(300),
    http_status  integer,
    message      varchar(2000),
    client_url   varchar(300),
    CONSTRAINT uq_error_events_tenant_remote UNIQUE (tenant_id, remote_id)
);
CREATE INDEX idx_error_events_group ON error_events (group_id, occurred_at DESC);
CREATE INDEX idx_error_events_time ON error_events (occurred_at DESC);

-- Per-tenant pull cursors and the outcome of the last pull.
CREATE TABLE error_sync_state (
    tenant_id        bigint         PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    after_group_seq  bigint         NOT NULL DEFAULT 0,
    after_event_id   bigint         NOT NULL DEFAULT 0,
    last_sync_at     timestamptz,
    last_status      varchar(20),
    last_error       varchar(1000),
    tenant_app_version varchar(60)
);
