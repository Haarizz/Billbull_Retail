-- V57: Enterprise Console > POS Administration > Session Denomination Corrections (Phase 3).
--
-- New pos_session_denomination_corrections table — an append-only overlay on top of a closed
-- PosSession's cash denomination breakdown (architectural review §3/§15 Phase 3). This
-- migration is purely additive: it creates one new table and touches nothing else. It does
-- NOT alter pos_sessions, pos_x_report_snapshots, or pos_day_closes in any way — those remain
-- the untouched, immutable historical source of truth. correction_request_id references the
-- Phase 1 pos_correction_requests table (application-level FK; no DB-level foreign key added,
-- consistent with the rest of this schema's convention of not enforcing cross-module FKs at
-- the DB layer).
--
-- All DDL is guarded/idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS pos_session_denomination_corrections (
    id BIGSERIAL PRIMARY KEY,
    correction_request_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    branch_id BIGINT,
    original_denomination_json TEXT NOT NULL,
    corrected_denomination_json TEXT NOT NULL,
    original_total NUMERIC(15,2) NOT NULL,
    corrected_total NUMERIC(15,2) NOT NULL,
    difference NUMERIC(15,2) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',

    requested_by VARCHAR(100),
    requested_at TIMESTAMP,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    rejected_by VARCHAR(100),
    rejected_at TIMESTAMP,
    rejection_reason VARCHAR(1000),
    applied_by VARCHAR(100),
    applied_at TIMESTAMP,

    created_at TIMESTAMP,
    created_by VARCHAR(100),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uk_pos_session_denom_corr_request UNIQUE (correction_request_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_session_denom_corr_session ON pos_session_denomination_corrections (session_id);
CREATE INDEX IF NOT EXISTS idx_pos_session_denom_corr_status ON pos_session_denomination_corrections (status);
CREATE INDEX IF NOT EXISTS idx_pos_session_denom_corr_branch ON pos_session_denomination_corrections (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_session_denom_corr_applied_at ON pos_session_denomination_corrections (session_id, applied_at);
