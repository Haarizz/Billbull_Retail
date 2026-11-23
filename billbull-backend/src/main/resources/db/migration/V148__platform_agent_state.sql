-- Platform control plane (admin.billbull.app) → tenant agent state.
-- Additive and idempotent: two new tables, nothing existing is touched. Written by the
-- platform agent (com.billbull.backend.platform) only; no Hibernate entity maps them.
--
-- platform_tenant_state: a single row (id = 1) holding what the control plane last pushed:
-- lifecycle status, plan, module entitlements and limits. No row = unmanaged tenant, which
-- behaves exactly as before (every module on, no limits).
CREATE TABLE IF NOT EXISTS public.platform_tenant_state (
    id              smallint     PRIMARY KEY,
    status          varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    status_message  varchar(500),
    plan_code       varchar(64),
    modules_json    text,
    limits_json     text,
    config_version  bigint       NOT NULL DEFAULT 0,
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    updated_by      varchar(200),
    CONSTRAINT chk_platform_tenant_state_singleton CHECK (id = 1),
    CONSTRAINT chk_platform_tenant_state_status CHECK (status IN ('ACTIVE', 'READ_ONLY', 'SUSPENDED'))
);

-- platform_support_sessions: every time-boxed support sign-in the control plane asked for.
-- The tenant keeps its own record so its admins can see (and revoke) platform access without
-- trusting the control plane's log.
CREATE TABLE IF NOT EXISTS public.platform_support_sessions (
    id               bigserial     PRIMARY KEY,
    platform_user    varchar(200)  NOT NULL,
    reason           varchar(1000) NOT NULL,
    ticket_ref       varchar(100),
    tenant_username  varchar(100)  NOT NULL,
    issued_at        timestamptz   NOT NULL DEFAULT now(),
    expires_at       timestamptz   NOT NULL,
    revoked_at       timestamptz,
    revoked_by       varchar(200)
);

CREATE INDEX IF NOT EXISTS idx_platform_support_sessions_issued
    ON public.platform_support_sessions (issued_at DESC);
