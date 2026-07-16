-- V38 — Sales Invoice activity trail (append-only).
--
-- Backs the "Invoice History" timeline on the Transaction Preview screen: created /
-- edited (with field-level change list) / status changes / payments received /
-- prints / document-lineage links.
--
-- Purpose-built rather than reusing financial_audit_logs / audit_logs / pos_audit_log:
-- those carry freeform TEXT details, whereas a document timeline needs typed columns
-- (amount, linked document number+type, change list) to render without parsing a blob.
-- (Those three trails also have no sales call sites today.)
--
-- event_type is VARCHAR with NO CHECK constraint ON PURPOSE: tenant DBs run with
-- ddl-auto=update, which will not widen a CHECK, so a future event type would break
-- their upgrade. Validation lives in the Java enum (SalesInvoiceHistoryEventType).
--
-- Purely additive + idempotent: new table only, no ALTER to sales_invoices (the
-- reprint_count / last_reprinted_by / last_reprinted_at columns this feature reads
-- already exist from V31).

CREATE TABLE IF NOT EXISTS sales_invoice_history_events (
    id                     BIGSERIAL PRIMARY KEY,
    invoice_id             BIGINT        NOT NULL,
    branch_id              BIGINT,
    event_type             VARCHAR(40)   NOT NULL,
    title                  VARCHAR(500)  NOT NULL,
    linked_document_number VARCHAR(255),
    linked_document_type   VARCHAR(255),
    amount                 NUMERIC(19,2),
    change_details         TEXT,
    username               VARCHAR(255),
    event_timestamp        TIMESTAMP     NOT NULL
);

-- Per-invoice lookup (the only read pattern: fetch one invoice's trail, oldest first).
CREATE INDEX IF NOT EXISTS ix_sales_invoice_history_invoice
    ON sales_invoice_history_events (invoice_id);

CREATE INDEX IF NOT EXISTS ix_sales_invoice_history_invoice_ts
    ON sales_invoice_history_events (invoice_id, event_timestamp);
