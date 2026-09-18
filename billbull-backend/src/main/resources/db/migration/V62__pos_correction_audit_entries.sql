-- STORY-104 - Immutable Audit Trail for POS Administration
--
-- IF NOT EXISTS per the repo convention: tenants whose schema was built by Hibernate
-- ddl-auto=update before being Flyway-baselined already have this table, and a bare
-- CREATE TABLE would abort the migration on boot.
CREATE TABLE IF NOT EXISTS pos_correction_audit_entries (
    id BIGSERIAL PRIMARY KEY,
    correction_request_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    notes VARCHAR(1000)
);

CREATE INDEX IF NOT EXISTS idx_pos_correction_audit_req_id ON pos_correction_audit_entries(correction_request_id);
