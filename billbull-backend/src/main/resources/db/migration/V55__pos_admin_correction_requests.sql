-- V55: Enterprise Console > POS Administration — Phase 1 foundations.
--
-- New pos_correction_requests table: the single, generic, append-only correction-request
-- record backing every future correction type (session denomination, transaction, cash
-- movement category) per the architectural review
-- (docs/pos-administration-architecture-review-2026-07-29.md §5/§8/§11/§15 Phase 1).
--
-- This migration is purely additive — it creates one new table and touches nothing else.
-- No existing table/column is altered or dropped. The correction request row is designed to
-- be the audit trail itself (§11): lifecycle actor/timestamp columns are only ever
-- forward-appended by CorrectionRequestService, never reset.
--
-- All DDL is guarded/idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS pos_correction_requests (
    id BIGSERIAL PRIMARY KEY,
    request_number VARCHAR(60) NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    target_id BIGINT NOT NULL,
    correction_type VARCHAR(30) NOT NULL,
    original_values_json TEXT,
    proposed_values_json TEXT,
    reason VARCHAR(1000),
    branch_id BIGINT,
    business_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',

    requested_by VARCHAR(100),
    requested_at TIMESTAMP,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    approval_notes VARCHAR(1000),
    rejected_by VARCHAR(100),
    rejected_at TIMESTAMP,
    rejection_reason VARCHAR(1000),
    cancelled_by VARCHAR(100),
    cancelled_at TIMESTAMP,
    executed_by VARCHAR(100),
    executed_at TIMESTAMP,
    failure_reason VARCHAR(1000),

    created_at TIMESTAMP,
    created_by VARCHAR(100),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uk_pos_correction_requests_request_number UNIQUE (request_number)
);

CREATE INDEX IF NOT EXISTS idx_pos_correction_requests_status ON pos_correction_requests (status);
CREATE INDEX IF NOT EXISTS idx_pos_correction_requests_target ON pos_correction_requests (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_pos_correction_requests_branch ON pos_correction_requests (branch_id);
