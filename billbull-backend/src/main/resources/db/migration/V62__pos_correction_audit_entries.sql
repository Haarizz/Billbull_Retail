-- STORY-104 - Immutable Audit Trail for POS Administration
CREATE TABLE pos_correction_audit_entries (
    id BIGSERIAL PRIMARY KEY,
    correction_request_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    notes VARCHAR(1000)
);

CREATE INDEX idx_pos_correction_audit_req_id ON pos_correction_audit_entries(correction_request_id);
