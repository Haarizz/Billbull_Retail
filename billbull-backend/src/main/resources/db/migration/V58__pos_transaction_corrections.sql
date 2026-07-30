-- V58: Enterprise Console > POS Administration > Transaction Corrections (Phase 4).
--
-- New pos_transaction_corrections table — an append-only overlay for a governed correction to
-- a completed ReceiptVoucher, AdvanceApplication, or PosCashMovement (architectural review
-- §4/§5/§15 Phase 4). This migration is purely additive: it creates one new table and touches
-- nothing else. It does NOT alter sales_receipt_vouchers, advance_applications,
-- pos_cash_movements, journal_entries, or any stock/inventory table. correction_request_id
-- references the Phase 1 pos_correction_requests table (application-level FK, consistent with
-- the rest of this schema's convention of not enforcing cross-module FKs at the DB layer).
--
-- All DDL is guarded/idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS pos_transaction_corrections (
    id BIGSERIAL PRIMARY KEY,
    correction_request_id BIGINT NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    target_id BIGINT NOT NULL,
    correction_type VARCHAR(30) NOT NULL,
    branch_id BIGINT,
    original_snapshot_json TEXT NOT NULL,
    corrected_snapshot_json TEXT NOT NULL,
    difference_summary_json TEXT,
    reason VARCHAR(1000) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
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
    execution_error VARCHAR(1000),

    created_at TIMESTAMP,
    created_by VARCHAR(100),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uk_pos_txn_corr_request UNIQUE (correction_request_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_txn_corr_target ON pos_transaction_corrections (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_pos_txn_corr_status ON pos_transaction_corrections (status);
CREATE INDEX IF NOT EXISTS idx_pos_txn_corr_branch ON pos_transaction_corrections (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_txn_corr_applied_at ON pos_transaction_corrections (target_type, target_id, applied_at);
