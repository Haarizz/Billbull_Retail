-- V75: Business Day extension period + window enforcement switch.
--
-- Splits what used to be one ambiguous setting ("Business Day End Time") into the
-- three distinct concepts the Business Day now models:
--   * operating_start_time            — when the Business Day begins
--   * operating_end_time              — SCHEDULED END. Ends normal operation.
--                                       Does NOT close the Business Day.
--   * business_day_extension_minutes  — controlled grace period after the Scheduled
--                                       End, during which trading continues on the
--                                       SAME Trading Date.
-- Actual closure = operating_end_time + business_day_extension_minutes. That, and
-- only that, is the point at which new sessions are refused.

ALTER TABLE pos_settings
    ADD COLUMN IF NOT EXISTS business_day_extension_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos_settings
    ADD COLUMN IF NOT EXISTS business_day_window_enforcement_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- Deploy-day safety backfill.
--
-- Enforcement ships ON for any branch with a configured Business Day Window. A
-- branch that configured a window BEFORE this migration did so when the End Time
-- was purely advisory — it never implied closure, and no operator ever chose an
-- extension. Leaving those branches on the column default of 0 would silently
-- convert their existing End Time into a hard lockout the moment this deploys:
-- a 21:00 End Time would stop the tills at 21:00 that same evening, from a value
-- nobody opted into.
--
-- Existing configured branches are therefore backfilled with a 2-hour extension —
-- a deliberate, conservative grace period, not a default anyone chose — so the
-- first evening after deploy behaves sanely and admins can set their real value in
-- the settings UI. Branches created after this migration keep the column default
-- of 0 (closure exactly at the Scheduled End Time), which is the honest default
-- for a setting the operator now sees and chooses explicitly.
--
-- Guarded so re-running is a no-op: only rows that still hold the column default
-- are touched, never a value an admin has since set.
-- ---------------------------------------------------------------------------
UPDATE pos_settings
SET business_day_extension_minutes = 120
WHERE operating_hours_enabled = TRUE
  AND business_day_extension_minutes = 0
  AND operating_start_time IS NOT NULL
  AND operating_end_time IS NOT NULL
  -- Never backfill a 24-hour window: it has no closure to extend.
  AND operating_start_time <> operating_end_time;
