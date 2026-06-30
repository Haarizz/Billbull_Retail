-- V24 POS Device Manager — Phase C: Health & Discovery
-- See docs/pos-device-architecture-specification-v2-2026-06-30.md §9 / §11 / §14 (Phase C)

CREATE TABLE IF NOT EXISTS pos_device_health_snapshot (
    id               BIGSERIAL PRIMARY KEY,
    created_at       TIMESTAMP,
    created_by       VARCHAR(255),
    updated_at       TIMESTAMP,
    updated_by       VARCHAR(255),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    device_id        BIGINT NOT NULL REFERENCES pos_devices(id),
    health_state     VARCHAR(20) NOT NULL,
    driver_status    VARCHAR(100),
    firmware_version VARCHAR(50),
    paper_status     VARCHAR(20),
    cover_status     VARCHAR(20),
    busy             BOOLEAN NOT NULL DEFAULT FALSE,
    queue_length     INT,
    captured_at      TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_health_snapshot_device ON pos_device_health_snapshot (device_id, captured_at);

CREATE TABLE IF NOT EXISTS pos_discovered_device (
    id                     BIGSERIAL PRIMARY KEY,
    created_at             TIMESTAMP,
    created_by             VARCHAR(255),
    updated_at             TIMESTAMP,
    updated_by             VARCHAR(255),
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    agent_identifier       VARCHAR(120) NOT NULL,
    discovery_method       VARCHAR(20) NOT NULL,
    raw_identifier         VARCHAR(200) NOT NULL,
    suggested_device_type  VARCHAR(30),
    status                 VARCHAR(20) NOT NULL DEFAULT 'NEW',
    first_seen_at          TIMESTAMP NOT NULL,
    last_seen_at           TIMESTAMP NOT NULL,
    CONSTRAINT uq_discovered_device UNIQUE (agent_identifier, raw_identifier)
);

CREATE INDEX IF NOT EXISTS idx_discovered_device_status ON pos_discovered_device (status);
