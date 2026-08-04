-- The "Skip Non-Trading Day" workflow was replaced by session-driven Day Close
-- resolution (a calendar date with no POS sessions is now never surfaced as
-- pending, so nothing needs to be explicitly skipped). is_skipped/skip_reason are
-- kept — historical rows still render in the POS Reports browser — but the
-- application no longer writes new ones. Not dropped here; candidates for a
-- future cleanup migration once no client has rows referencing them.
COMMENT ON COLUMN pos_day_closes.is_skipped IS 'OBSOLETE: retired Skip Non-Trading Day workflow. Read-only for historical rows; no code path sets this anymore.';
COMMENT ON COLUMN pos_day_closes.skip_reason IS 'OBSOLETE: retired Skip Non-Trading Day workflow. Read-only for historical rows; no code path sets this anymore.';
