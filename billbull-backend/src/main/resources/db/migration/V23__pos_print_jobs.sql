-- V23 POS Device Manager — Phase B: print job spine
-- See docs/pos-device-architecture-specification-v2-2026-06-30.md §7 / §9 / §14 (Phase B)

CREATE TABLE IF NOT EXISTS pos_print_jobs (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMP,
    created_by      VARCHAR(255),
    updated_at      TIMESTAMP,
    updated_by      VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    job_type        VARCHAR(20) NOT NULL,
    priority        VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    printer_id      BIGINT NOT NULL REFERENCES pos_printers(id),
    branch_id       BIGINT,
    terminal_id     VARCHAR(80),
    counter_name    VARCHAR(120),

    source_type     VARCHAR(30),
    source_ref_id   BIGINT,

    payload         TEXT NOT NULL,
    payload_format  VARCHAR(20) NOT NULL DEFAULT 'ESC_POS_TEXT',

    status          VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    attempt_count   INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 3,
    last_error      VARCHAR(500),
    dispatched_at   TIMESTAMP,
    completed_at    TIMESTAMP,
    scheduled_for   TIMESTAMP,

    requested_by    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_status_printer ON pos_print_jobs (status, printer_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_branch_terminal ON pos_print_jobs (branch_id, terminal_id);
