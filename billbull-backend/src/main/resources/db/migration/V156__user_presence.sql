-- Live presence: one row per signed-in device (user + browser/app), refreshed at most once a
-- minute while the device makes authenticated requests. Read only by the platform agent's
-- GET /api/platform/presence (Live Clients on admin.billbull.app) and the health snapshot's
-- online counts. Rows not seen for 30 days are pruned by UserPresenceService.
CREATE TABLE IF NOT EXISTS user_presence (
    device_key          varchar(64)   PRIMARY KEY,
    user_id             bigint,
    username            varchar(150)  NOT NULL,
    roles               varchar(300),
    branch_id           bigint,
    app                 varchar(20)   NOT NULL,
    user_agent          varchar(400),
    ip_address          varchar(64),
    support_session_id  bigint,
    first_seen_at       timestamptz   NOT NULL DEFAULT now(),
    last_seen_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence (last_seen_at DESC);
