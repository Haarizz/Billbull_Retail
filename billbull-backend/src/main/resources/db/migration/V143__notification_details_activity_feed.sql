-- Notifications redesign + user activity feed.
--
-- notifications gains:
--   branch_id — the branch the triggering user was acting on, so the inbox can say where it happened;
--   metadata  — a small JSON object of the event's key facts (amount, customer, vendor, qty, ...),
--               rendered as detail chips instead of being buried in the message text.
-- The actor is not a new column: BaseEntity.created_by already records who triggered the row.
--
-- Two read indexes:
--   idx_notif_user_created — the inbox list is always "this user's rows, newest first";
--   idx_audit_event_time   — the activity feed reads audit_logs by event_type, newest first
--                            (idx_audit_user_time / idx_audit_branch_time only cover the filtered
--                            per-user / per-branch views).
-- Additive and idempotent: every statement is guarded and IF NOT EXISTS.

DO $$
BEGIN
    IF to_regclass('public.notifications') IS NOT NULL THEN
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS branch_id BIGINT;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata TEXT;
        CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications (target_username, created_at DESC);
    END IF;

    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_logs (event_type, access_time DESC);
    END IF;
END $$;
