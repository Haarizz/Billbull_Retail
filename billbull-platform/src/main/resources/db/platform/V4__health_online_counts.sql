-- Live presence counts reported in each tenant's health usage (tenant V156 user_presence), kept
-- with the snapshot so Live Clients can draw the last 24 hours of activity.
ALTER TABLE health_snapshots ADD COLUMN IF NOT EXISTS online_devices bigint;
ALTER TABLE health_snapshots ADD COLUMN IF NOT EXISTS online_users bigint;
