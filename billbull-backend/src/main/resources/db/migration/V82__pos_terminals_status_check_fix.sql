-- V82 POS Terminal Status Check Fix
-- Updates the pos_terminals status check constraint to include all current lifecycle statuses
-- (adds 'STALE' and ensures 'ARCHIVED' is permitted).

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
        'STALE'::text,
        'DECOMMISSIONED'::text,
        'ARCHIVED'::text
    ])
);
