/**
 * Free-trial expiry helpers. Which clients are on a trial, and when it ends, is
 * configured only in config/clientConfig.js (`trial.expiresAt`).
 */

/** sessionStorage flag set by a successful login; cleared when the warning is dismissed. */
export const TRIAL_NOTICE_PENDING_KEY = "trialNoticePending";

/**
 * Time left until `expiresAt`, never negative. Seconds are rounded up so the
 * trial only reads as expired once the expiry instant has actually passed.
 * Returns null when `expiresAt` is missing or unparseable.
 */
export function getTrialRemaining(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return null;

  const totalSeconds = Math.max(0, Math.ceil((expiry - now) / 1000));
  return {
    totalSeconds,
    expired: totalSeconds === 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** "2 Days 14 Hours 32 Minutes 18 Seconds" (singular units for 1). */
export function formatTrialRemaining({ days, hours, minutes, seconds }) {
  const unit = (value, label) => `${value} ${label}${value === 1 ? "" : "s"}`;
  return [
    unit(days, "Day"),
    unit(hours, "Hour"),
    unit(minutes, "Minute"),
    unit(seconds, "Second"),
  ].join(" ");
}
