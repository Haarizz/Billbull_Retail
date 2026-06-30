-- V25 POS Device Manager — Phase D: Hardware Profiles
-- See docs/pos-device-architecture-specification-v2-2026-06-30.md §5 / §14 (Phase D)
--
-- Hierarchy realized by this migration: Branch -> Terminal -> Hardware Profile -> Devices.
-- (Company maps to the existing CompanyProfile singleton per the v2 spec §5 — no schema
-- change needed there.) Terminal keeps its existing direct device-scoping fields
-- (pos_printers.terminal_id etc.) untouched — hardware_profile_id is an ADDITIVE, nullable
-- assignment column so existing terminals keep working exactly as before until explicitly
-- migrated onto a profile (backward-compatibility requirement).

CREATE TABLE IF NOT EXISTS pos_hardware_profile (
    id           BIGSERIAL PRIMARY KEY,
    created_at   TIMESTAMP,
    created_by   VARCHAR(255),
    updated_at   TIMESTAMP,
    updated_by   VARCHAR(255),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    profile_name VARCHAR(120) NOT NULL,
    branch_id    BIGINT,                          -- nullable: a branch-scoped profile, or a
                                                    -- global/reusable-across-branches template
    description  VARCHAR(500),
    status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_hardware_profile_branch ON pos_hardware_profile (branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hardware_profile_branch_name
    ON pos_hardware_profile (branch_id, profile_name) WHERE branch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pos_hardware_profile_device (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    hardware_profile_id  BIGINT NOT NULL REFERENCES pos_hardware_profile(id),
    device_id            BIGINT NOT NULL REFERENCES pos_devices(id),
    role                 VARCHAR(50) NOT NULL,     -- e.g. PRIMARY_RECEIPT_PRINTER, KITCHEN_PRINTER_1
    CONSTRAINT uq_hardware_profile_role UNIQUE (hardware_profile_id, role)
);

CREATE INDEX IF NOT EXISTS idx_hardware_profile_device_profile ON pos_hardware_profile_device (hardware_profile_id);
CREATE INDEX IF NOT EXISTS idx_hardware_profile_device_device  ON pos_hardware_profile_device (device_id);

-- Terminal -> Hardware Profile assignment (nullable: a terminal with no profile keeps using
-- its existing direct-assignment fields exactly as before — see PosTerminalService/
-- HardwareProfileAssignmentEngine for the precedence rule).
ALTER TABLE pos_terminals
    ADD COLUMN IF NOT EXISTS hardware_profile_id BIGINT REFERENCES pos_hardware_profile(id);

CREATE INDEX IF NOT EXISTS idx_pos_terminal_hardware_profile ON pos_terminals (hardware_profile_id);
