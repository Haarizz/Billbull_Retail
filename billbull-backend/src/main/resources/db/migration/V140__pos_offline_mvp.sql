-- V140 — M3: Standalone POS offline MVP (cash sales under a server-issued offline lease).
--
--   pos_offline_terminal_keys   the public half of each till's ECDSA P-256 signing key. The private
--                               key is generated inside the till (WebCrypto, non-extractable) and
--                               never leaves it, so this table holds nothing secret. Keys are never
--                               deleted: a revoked or retired key stays so its old records verify.
--   pos_offline_leases          the server-side register of offline authorisation. A lease binds one
--                               terminal, session, operator, business date and key to a sequence
--                               window and a count/value cap. The till's signed copy (jws) is only a
--                               convenience: ingest always loads the lease from here.
--   pos_offline_sales           every signed offline record the server has received, with its raw
--                               canonical payload, signature and posting outcome. Posting goes
--                               through the normal checkout pipeline under the record's own
--                               checkout key, so the M2 attempt journal (V138/V139) still applies.
--
-- tenant_db defaults to current_database(), the same tenant identity as pos_checkout_attempts.
-- Deliberately no foreign keys (same reason as V138): this is evidence and must outlive session or
-- terminal cleanup. Times are timestamptz and written from the database clock.
--
-- Additive and idempotent. V139 is the highest version before this.

CREATE TABLE IF NOT EXISTS pos_offline_terminal_keys (
    id                      UUID PRIMARY KEY,
    tenant_db               VARCHAR(128) NOT NULL DEFAULT current_database(),
    terminal_id             VARCHAR(100) NOT NULL,
    terminal_pk             BIGINT,
    branch_id               BIGINT       NOT NULL,
    algorithm               VARCHAR(16)  NOT NULL DEFAULT 'ES256',
    public_key_spki         TEXT         NOT NULL,
    public_key_sha256       VARCHAR(64)  NOT NULL,
    status                  VARCHAR(16)  NOT NULL,
    enrolled_by             VARCHAR(150),
    enrolled_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    revoked_by              VARCHAR(150),
    revoked_at              TIMESTAMPTZ,
    revoke_reason           VARCHAR(500),
    seq_at_revocation       BIGINT,
    CONSTRAINT ck_pos_offline_terminal_keys_status CHECK (status IN ('ACTIVE', 'RETIRED', 'REVOKED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_offline_terminal_keys_pub
    ON pos_offline_terminal_keys (public_key_sha256);

-- One signing key in use per terminal; older ones are RETIRED (verify-only).
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_offline_terminal_keys_active
    ON pos_offline_terminal_keys (terminal_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS pos_offline_leases (
    id                      UUID PRIMARY KEY,
    tenant_db               VARCHAR(128) NOT NULL DEFAULT current_database(),
    branch_id               BIGINT       NOT NULL,
    terminal_id             VARCHAR(100) NOT NULL,
    terminal_pk             BIGINT,
    session_id              BIGINT       NOT NULL,
    key_id                  UUID         NOT NULL,
    operator_username       VARCHAR(150) NOT NULL,
    business_date           DATE         NOT NULL,
    issued_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    not_after               TIMESTAMPTZ  NOT NULL,
    grace_until             TIMESTAMPTZ  NOT NULL,
    max_sales               INTEGER      NOT NULL,
    max_value_minor         BIGINT       NOT NULL,
    seq_start               BIGINT       NOT NULL,
    seq_end                 BIGINT       NOT NULL,
    tender_types            VARCHAR(100) NOT NULL,
    product_policy          VARCHAR(100) NOT NULL,
    catalog_version         VARCHAR(64),
    policy_version          INTEGER      NOT NULL,
    signing_key_id          VARCHAR(64)  NOT NULL,
    jws                     TEXT         NOT NULL,
    status                  VARCHAR(16)  NOT NULL,
    issued_by               VARCHAR(150),
    closed_at               TIMESTAMPTZ,
    closed_by               VARCHAR(150),
    close_reason            VARCHAR(500),
    close_summary           TEXT,
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_pos_offline_leases_status CHECK (status IN ('ACTIVE', 'CLOSED', 'ABANDONED', 'REVOKED')),
    CONSTRAINT ck_pos_offline_leases_window CHECK (seq_end > seq_start AND max_sales = seq_end - seq_start)
);

-- At most one outstanding lease per terminal.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_offline_leases_active_terminal
    ON pos_offline_leases (terminal_id) WHERE status = 'ACTIVE';

-- The session-transition and Day Close gates: "does this session / branch-date have a live lease?"
CREATE INDEX IF NOT EXISTS ix_pos_offline_leases_session_active
    ON pos_offline_leases (session_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS ix_pos_offline_leases_branch_date
    ON pos_offline_leases (branch_id, business_date);
CREATE INDEX IF NOT EXISTS ix_pos_offline_leases_key
    ON pos_offline_leases (key_id);

CREATE TABLE IF NOT EXISTS pos_offline_sales (
    id                      UUID PRIMARY KEY,
    tenant_db               VARCHAR(128) NOT NULL DEFAULT current_database(),
    lease_id                UUID         NOT NULL,
    key_id                  UUID         NOT NULL,
    local_seq               BIGINT       NOT NULL,
    checkout_key            VARCHAR(100) NOT NULL,
    payload_sha256          VARCHAR(64)  NOT NULL,
    payload                 TEXT         NOT NULL,
    signature               TEXT         NOT NULL,
    branch_id               BIGINT       NOT NULL,
    terminal_id             VARCHAR(100) NOT NULL,
    session_id              BIGINT       NOT NULL,
    total_minor             BIGINT       NOT NULL,
    captured_at_device      TIMESTAMPTZ,
    received_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    received_by             VARCHAR(150),
    state                   VARCHAR(16)  NOT NULL,
    reason_code             VARCHAR(48),
    reason_detail           VARCHAR(1000),
    invoice_id              BIGINT,
    invoice_number          VARCHAR(64),
    posted_at               TIMESTAMPTZ,
    post_attempts           INTEGER      NOT NULL DEFAULT 0,
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_pos_offline_sales_state
        CHECK (state IN ('RECEIVED', 'POSTED', 'HELD', 'BLOCKED', 'RESOLVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_offline_sales_checkout_key
    ON pos_offline_sales (checkout_key);
-- One record per sequence number per signing key (a re-enrolled key starts its own sequence).
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_offline_sales_key_seq
    ON pos_offline_sales (key_id, local_seq);
CREATE INDEX IF NOT EXISTS ix_pos_offline_sales_lease
    ON pos_offline_sales (lease_id);
CREATE INDEX IF NOT EXISTS ix_pos_offline_sales_review
    ON pos_offline_sales (branch_id, state) WHERE state IN ('HELD', 'BLOCKED', 'RECEIVED');
