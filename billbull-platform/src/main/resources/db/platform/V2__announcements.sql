-- Announcements: messages the control plane shows to clients' users (new features, updates,
-- maintenance). Each client receives its complete live set through its platform agent
-- (PUT /api/platform/announcements) and pops each one up once per user.

CREATE TABLE announcements (
    id            bigserial     PRIMARY KEY,
    title         varchar(150)  NOT NULL,
    message       text          NOT NULL,
    kind          varchar(20)   NOT NULL DEFAULT 'INFO',
    audience      varchar(20)   NOT NULL DEFAULT 'EVERYONE',
    target_all    boolean       NOT NULL DEFAULT true,
    status        varchar(20)   NOT NULL DEFAULT 'LIVE',
    version       integer       NOT NULL DEFAULT 1,
    starts_at     timestamptz,
    ends_at       timestamptz,
    created_by    varchar(200),
    updated_by    varchar(200),
    published_at  timestamptz,
    archived_at   timestamptz,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_announcements_kind CHECK (kind IN ('INFO', 'FEATURE', 'UPDATE', 'MAINTENANCE', 'ALERT')),
    CONSTRAINT chk_announcements_audience CHECK (audience IN ('EVERYONE', 'ADMINS')),
    CONSTRAINT chk_announcements_status CHECK (status IN ('LIVE', 'ARCHIVED', 'DELETED')),
    CONSTRAINT chk_announcements_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX idx_announcements_status ON announcements (status, created_at DESC);

-- The chosen clients when target_all is false.
CREATE TABLE announcement_targets (
    announcement_id  bigint  NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
    tenant_id        bigint  NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    PRIMARY KEY (announcement_id, tenant_id)
);

-- Per client and announcement: which version the client acknowledged, and its seen counts as
-- reported back in the reply to each push.
CREATE TABLE announcement_tenant_stats (
    announcement_id    bigint       NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
    tenant_id          bigint       NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    delivered_version  integer,
    delivered_at       timestamptz,
    seen_users         bigint       NOT NULL DEFAULT 0,
    first_seen_at      timestamptz,
    last_seen_at       timestamptz,
    reported_at        timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, tenant_id)
);

-- Per client: the hash of the last announcement set it accepted, so unchanged sets are only
-- re-sent periodically (to refresh the seen counts).
CREATE TABLE announcement_sync (
    tenant_id        bigint        PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    payload_hash     varchar(64),
    synced_at        timestamptz,
    last_attempt_at  timestamptz,
    last_error       varchar(1000)
);
