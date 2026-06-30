-- V27 POS Device Manager — Phase E: Scanner & Cash Drawer registration
-- See docs/pos-device-architecture-specification-v2-2026-06-30.md §8.8 (scanner — lightweight,
-- visibility only) and the cash-drawer model (attached to a printer, kick confirmation).
--
-- Both tables are brand new — there is no pre-existing pos_scanners/pos_cash_drawers data, so
-- unlike V22's pos_printers backfill, no legacy-data migration is needed here. Every row from
-- this point forward gets its pos_devices parent row created synchronously by the owning
-- service (PosScannerService/PosCashDrawerService), mirroring PosPrinterService's Phase A wiring.

CREATE TABLE IF NOT EXISTS pos_scanners (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMP,
    created_by      VARCHAR(255),
    updated_at      TIMESTAMP,
    updated_by      VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    device_code     VARCHAR(50) NOT NULL,
    device_id       BIGINT REFERENCES pos_devices(id),
    device_name     VARCHAR(100) NOT NULL,
    branch_id       BIGINT NOT NULL,
    branch_name     VARCHAR(120),
    terminal_id     VARCHAR(80),
    counter_name    VARCHAR(120),
    connection_type VARCHAR(20) NOT NULL DEFAULT 'USB',
    input_mode      VARCHAR(20) NOT NULL DEFAULT 'KEYBOARD_WEDGE',
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_seen_at    TIMESTAMP,
    notes           VARCHAR(500),
    CONSTRAINT uq_pos_scanner_code UNIQUE (device_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_scanner_branch   ON pos_scanners (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_scanner_terminal  ON pos_scanners (terminal_id);
CREATE INDEX IF NOT EXISTS idx_pos_scanner_device    ON pos_scanners (device_id);

CREATE TABLE IF NOT EXISTS pos_cash_drawers (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    device_code          VARCHAR(50) NOT NULL,
    device_id            BIGINT REFERENCES pos_devices(id),
    device_name          VARCHAR(100) NOT NULL,
    branch_id            BIGINT NOT NULL,
    branch_name          VARCHAR(120),
    terminal_id          VARCHAR(80),
    counter_name         VARCHAR(120),
    attached_printer_id  BIGINT NOT NULL REFERENCES pos_printers(id),
    status               VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_kick_at         TIMESTAMP,
    last_kick_result     VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    notes                VARCHAR(500),
    CONSTRAINT uq_pos_cash_drawer_code UNIQUE (device_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_cash_drawer_branch   ON pos_cash_drawers (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_cash_drawer_terminal ON pos_cash_drawers (terminal_id);
CREATE INDEX IF NOT EXISTS idx_pos_cash_drawer_device   ON pos_cash_drawers (device_id);
CREATE INDEX IF NOT EXISTS idx_pos_cash_drawer_printer  ON pos_cash_drawers (attached_printer_id);
