-- V28 POS Terminal Status Check Fix
-- Updates the pos_terminals status check constraint to include the new 'OFFLINE' status.

ALTER TABLE pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_status_check;

ALTER TABLE pos_terminals ADD CONSTRAINT pos_terminals_status_check CHECK (
    status::text = ANY (ARRAY[
        'NEW'::text,
        'PENDING_REGISTRATION'::text,
        'ACTIVE'::text,
        'IDLE'::text,
        'OFFLINE'::text,
        'INACTIVE'::text,
        'MAINTENANCE'::text,
        'BLOCKED'::text,
        'DECOMMISSIONED'::text,
        'ARCHIVED'::text
    ])
);
