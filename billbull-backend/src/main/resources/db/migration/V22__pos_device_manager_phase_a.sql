-- V22 POS Device Manager — Phase A: shared Device parent + backfill from pos_printers
-- See docs/pos-device-architecture-specification-v2-2026-06-30.md §6.5 / §14 (Phase A)

-- ─── Extend pos_devices into the shared "Device" parent table ───────────────

ALTER TABLE pos_devices
    ADD COLUMN IF NOT EXISTS device_type     VARCHAR(30) NOT NULL DEFAULT 'GENERIC',
    ADD COLUMN IF NOT EXISTS terminal_id     VARCHAR(80),
    ADD COLUMN IF NOT EXISTS runtime_health  VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN';

CREATE INDEX IF NOT EXISTS idx_pos_device_type     ON pos_devices (device_type);
CREATE INDEX IF NOT EXISTS idx_pos_device_terminal ON pos_devices (terminal_id);

-- ─── Link pos_printers to their parent device row ────────────────────────────

ALTER TABLE pos_printers
    ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES pos_devices(id);

CREATE INDEX IF NOT EXISTS idx_pos_printer_device ON pos_printers (device_id);

-- ─── Device event log (operational/technical lifecycle log) ─────────────────

CREATE TABLE IF NOT EXISTS pos_device_event_log (
    id            BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMP,
    created_by    VARCHAR(255),
    updated_at    TIMESTAMP,
    updated_by    VARCHAR(255),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    device_id     BIGINT NOT NULL REFERENCES pos_devices(id),
    event_type    VARCHAR(40) NOT NULL,
    operation     VARCHAR(100),
    result        VARCHAR(20),
    error_message VARCHAR(500),
    branch_id     BIGINT,
    terminal_id   VARCHAR(80),
    actor_user    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_device_event_log_device ON pos_device_event_log (device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_device_event_log_type   ON pos_device_event_log (event_type);

-- ─── Backfill: create a parent pos_devices row for every existing printer ───
-- pos_devices is not yet consumed by the POS UI today, so a device_code collision
-- against a real printer is not expected; ON CONFLICT guards it regardless.

INSERT INTO pos_devices (created_at, is_active, device_code, device_name, branch_id, branch_name,
                          counter_name, status, device_type, terminal_id, runtime_health)
SELECT p.created_at, p.is_active, p.device_code, p.device_name, p.branch_id, p.branch_name,
       p.counter_name,
       CASE p.status
           WHEN 'DECOMMISSIONED' THEN 'DECOMMISSIONED'
           WHEN 'INACTIVE' THEN 'INACTIVE'
           ELSE 'ACTIVE'
       END,
       'PRINTER',
       p.terminal_id,
       CASE p.runtime_status
           WHEN 'ONLINE' THEN 'ONLINE'
           WHEN 'OFFLINE' THEN 'OFFLINE'
           WHEN 'NOT_FOUND' THEN 'DISCONNECTED'
           WHEN 'DRIVER_ERROR' THEN 'ERROR'
           ELSE 'UNKNOWN'
       END
FROM pos_printers p
WHERE NOT EXISTS (SELECT 1 FROM pos_devices d WHERE d.device_code = p.device_code)
ON CONFLICT (device_code) DO NOTHING;

UPDATE pos_printers p
SET device_id = d.id
FROM pos_devices d
WHERE d.device_code = p.device_code
  AND p.device_id IS NULL;
