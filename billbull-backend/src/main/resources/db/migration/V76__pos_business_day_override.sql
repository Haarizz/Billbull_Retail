-- V76: Supervisor-authorized Business Day override.
--
-- A one-off, time-boxed grant of extra trading time for ONE Business Day, used when
-- an authorized supervisor needs operation to continue past the configured closure.
-- Deliberately NOT a settings change: the branch's schedule is untouched, the grant
-- expires on its own, and the following Business Day returns to the configured
-- timings with no cleanup step for anyone to forget.
--
-- This is the only PERSISTED Business Day state. Phase and Trading Date remain
-- derived on demand from (now, start, end, extension) — there is still no row in
-- this schema meaning "the current Business Day".

CREATE TABLE IF NOT EXISTS pos_business_day_override (
    id                      BIGSERIAL PRIMARY KEY,
    branch_id               BIGINT       NOT NULL,
    -- The Business Day being extended. Matches pos_sessions.trading_date, so an
    -- override can never be mistakenly applied to a different Business Day than the
    -- sessions it is meant to keep alive.
    trading_date            DATE         NOT NULL,
    -- New effective closure time. The Business Day stays in its EXTENSION phase
    -- until this moment instead of closing at its configured closure time.
    extended_until          TIMESTAMP    NOT NULL,
    -- What closure time was in force when the override was granted, so the audit
    -- trail shows exactly how much extra time was given and from what baseline.
    previous_closure_at     TIMESTAMP    NOT NULL,
    extension_minutes       INTEGER      NOT NULL,
    reason                  VARCHAR(500),
    authorized_by           VARCHAR(255) NOT NULL,
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    -- Set when a supervisor revokes the grant early; a revoked row stops applying
    -- immediately but is never deleted, preserving the audit trail.
    revoked_at              TIMESTAMP,
    revoked_by              VARCHAR(255)
);

-- Supports the single hot-path lookup: "is there a live override for this branch's
-- current Business Day right now" — evaluated on every session-open and checkout
-- attempt during the CLOSED phase.
CREATE INDEX IF NOT EXISTS idx_pbdo_branch_trading_date
    ON pos_business_day_override (branch_id, trading_date);
