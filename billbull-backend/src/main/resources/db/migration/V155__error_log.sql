-- Error log: unexpected server errors, failed background jobs and browser crashes, grouped by
-- fingerprint so one recurring fault is one row with a count. Additive and idempotent; written
-- only by com.billbull.backend.errorlog.ErrorLogService through JdbcTemplate (no Hibernate entity
-- maps these tables). The control plane (admin.billbull.app) reads them through the signed
-- platform agent (GET /api/platform/errors), where they are explained in ERP terms.
--
-- Nothing here holds request bodies. Messages and stack traces are redacted (e-mail addresses,
-- long digit runs, tokens) before they are written.

CREATE SEQUENCE IF NOT EXISTS public.error_log_change_seq;

CREATE TABLE IF NOT EXISTS public.error_log_groups (
    id                  bigserial      PRIMARY KEY,
    fingerprint         varchar(64)    NOT NULL UNIQUE,
    source              varchar(20)    NOT NULL,            -- SERVER, CLIENT, JOB, LOG
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
    change_seq          bigint         NOT NULL DEFAULT nextval('public.error_log_change_seq')
);
CREATE INDEX IF NOT EXISTS idx_error_log_groups_change ON public.error_log_groups (change_seq);
CREATE INDEX IF NOT EXISTS idx_error_log_groups_last_seen ON public.error_log_groups (last_seen_at);

CREATE TABLE IF NOT EXISTS public.error_log_events (
    id           bigserial     PRIMARY KEY,
    group_id     bigint        NOT NULL REFERENCES public.error_log_groups (id) ON DELETE CASCADE,
    occurred_at  timestamptz   NOT NULL,
    request_id   varchar(120),
    username     varchar(100),
    branch_id    bigint,
    http_method  varchar(10),
    path         varchar(300),
    http_status  integer,
    message      varchar(2000),
    client_url   varchar(300)
);
CREATE INDEX IF NOT EXISTS idx_error_log_events_group ON public.error_log_events (group_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_events_time ON public.error_log_events (occurred_at);
