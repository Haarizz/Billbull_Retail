-- V18 POS printer configuration and runtime test tracking

CREATE TABLE IF NOT EXISTS pos_printers (
    id                  BIGSERIAL PRIMARY KEY,
    created_at          TIMESTAMP,
    created_by          VARCHAR(255),
    updated_at          TIMESTAMP,
    updated_by          VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    device_code         VARCHAR(50)  NOT NULL,
    device_type         VARCHAR(40)  NOT NULL,
    device_name         VARCHAR(120) NOT NULL,
    model_name          VARCHAR(120),
    branch_id           BIGINT       NOT NULL,
    branch_name         VARCHAR(120),
    terminal_id         VARCHAR(80),
    terminal_name       VARCHAR(120),
    counter_name        VARCHAR(120),
    connection_type     VARCHAR(40)  NOT NULL,
    system_printer_name VARCHAR(200),
    device_identifier   VARCHAR(200),
    ip_address          VARCHAR(100),
    port_number         INTEGER,
    paper_size          VARCHAR(40),
    print_template      VARCHAR(80),
    is_default_printer  BOOLEAN      NOT NULL DEFAULT FALSE,
    status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    runtime_status      VARCHAR(20)  NOT NULL DEFAULT 'UNKNOWN',
    last_test_result    VARCHAR(500),
    last_tested_at      TIMESTAMP,
    last_seen_at        TIMESTAMP,
    notes               VARCHAR(500),
    CONSTRAINT uq_pos_printer_device_code UNIQUE (device_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_printer_branch   ON pos_printers (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_printer_terminal ON pos_printers (terminal_id);
CREATE INDEX IF NOT EXISTS idx_pos_printer_type     ON pos_printers (device_type);
CREATE INDEX IF NOT EXISTS idx_pos_printer_status   ON pos_printers (status);
