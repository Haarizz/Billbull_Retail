-- V138 — Phase 0 / M2: POS checkout attempt journal.
--
--   pos_checkout_attempts   one row per checkout key. A checkout claims its row in a short
--                           transaction that holds the session row lock, then every write step
--                           re-proves ownership against owner_token + fence in its own
--                           transaction. Session close / begin-closure / suspend refuse while the
--                           session has an ACTIVE or STALLED attempt. See
--                           com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.
--
-- Uniqueness: checkout_key is unique across the whole table. That is the same scope as
-- uq_si_pos_checkout_key on sales_invoices (V13): a tenant is one database, so a key is unique per
-- tenant, across every branch and session.
--
-- Deliberately no foreign keys. The journal is evidence and must survive the compensating delete
-- of a DRAFT invoice (SalesInvoiceService.delete is a hard delete) and any later session cleanup.
--
-- Times are timestamptz and are always written from the database clock (now()), never from a JVM,
-- so leases compare correctly across backend instances with skewed clocks.
--
-- Additive and idempotent. V137 is the highest version before this.

CREATE TABLE IF NOT EXISTS pos_checkout_attempts (
    id                       UUID PRIMARY KEY,
    checkout_key             VARCHAR(100) NOT NULL,
    key_source               VARCHAR(16)  NOT NULL,
    request_hash             VARCHAR(64)  NOT NULL,
    hash_version             SMALLINT     NOT NULL,
    tenant_db                VARCHAR(128) NOT NULL DEFAULT current_database(),
    branch_id                BIGINT,
    session_id               BIGINT,
    terminal_id              VARCHAR(100),
    initiated_by             VARCHAR(150),
    initiated_by_user_id     BIGINT,
    state                    VARCHAR(16)  NOT NULL,
    owner_token              UUID         NOT NULL,
    fence                    BIGINT       NOT NULL DEFAULT 1,
    owner_instance           VARCHAR(200) NOT NULL,
    lease_expires_at         TIMESTAMPTZ  NOT NULL,
    attempt_count            INTEGER      NOT NULL DEFAULT 1,
    last_step                VARCHAR(32),
    heartbeat_at             TIMESTAMPTZ,
    invoice_id               BIGINT,
    invoice_number           VARCHAR(64),
    invoice_saved_at         TIMESTAMPTZ,
    invoice_posted_at        TIMESTAMPTZ,
    payment_legs_expected    INTEGER,
    payment_legs_recorded    INTEGER      NOT NULL DEFAULT 0,
    session_step_required    BOOLEAN,
    session_recorded_at      TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    outcome_detail           VARCHAR(1000),
    resolved_by              VARCHAR(150),
    resolved_at              TIMESTAMPTZ,
    resolution_reason        VARCHAR(1000),
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_pos_checkout_attempts_state
        CHECK (state IN ('ACTIVE', 'COMPLETED', 'FAILED', 'ABANDONED', 'STALLED', 'RELEASED')),
    CONSTRAINT ck_pos_checkout_attempts_key_source
        CHECK (key_source IN ('CLIENT', 'SERVER'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_checkout_attempts_key
    ON pos_checkout_attempts (checkout_key);

-- The session-transition barrier's query: "does this session have a blocking attempt?"
CREATE INDEX IF NOT EXISTS ix_pos_checkout_attempts_blocking
    ON pos_checkout_attempts (session_id)
    WHERE state IN ('ACTIVE', 'STALLED');
