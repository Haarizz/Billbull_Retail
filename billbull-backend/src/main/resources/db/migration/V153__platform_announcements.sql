-- Platform control plane (admin.billbull.app) → tenant announcements.
-- Additive and idempotent: two new tables, nothing existing is touched. Written by the
-- platform agent (com.billbull.backend.platform.PlatformAnnouncementService) only; no Hibernate
-- entity maps them.
--
-- platform_announcements: the control plane pushes this tenant's complete set of live
-- announcements; anything it no longer sends is marked inactive (kept, so the seen history
-- survives). id is the control plane's announcement id.
CREATE TABLE IF NOT EXISTS public.platform_announcements (
    id           bigint        PRIMARY KEY,
    version      integer       NOT NULL DEFAULT 1,
    title        varchar(150)  NOT NULL,
    message      text          NOT NULL,
    kind         varchar(20)   NOT NULL DEFAULT 'INFO',
    audience     varchar(20)   NOT NULL DEFAULT 'EVERYONE',
    starts_at    timestamptz,
    ends_at      timestamptz,
    active       boolean       NOT NULL DEFAULT true,
    published_at timestamptz,
    received_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_platform_announcements_audience CHECK (audience IN ('EVERYONE', 'ADMINS'))
);

-- platform_announcement_views: one row per user who has dismissed an announcement. An
-- announcement pops up once per user; the counts are reported back to the control plane.
CREATE TABLE IF NOT EXISTS public.platform_announcement_views (
    announcement_id bigint        NOT NULL,
    username        varchar(100)  NOT NULL,
    version_seen    integer       NOT NULL DEFAULT 1,
    seen_at         timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, username)
);
