/**
 * Business Day helpers for a *specific* POS session — the frontend mirror of the
 * backend's `BusinessDayContinuationGate`.
 *
 * Two dates are easy to confuse and must never be substituted for one another:
 *
 *  - **Session Business/Trading Date** — the historical Business Day the session
 *    belongs to (`tradingDate`, falling back to the legacy `sessionDate` bucket for
 *    sessions written before Trading Dates existed). Immutable.
 *  - **Current Business Day** — the branch's currently resolved Business Day
 *    (`day-status.candidateBusinessDay`). Changes as days roll over.
 *
 * Anything that describes a selected session (X-Report / Close Session) must read the
 * first; only "what day are we trading on now" reads the second.
 */

/** The Business Day a session belongs to. Same fallback order as the backend's
 *  `BusinessDayContinuationGate.sessionBusinessDay`. */
export function sessionBusinessDay(session) {
  if (!session) return null;
  return session.tradingDate || session.sessionDate || null;
}

/** Business Date to display on the session-specific X-Report / Close Session screen.
 *  The session's own date is the single source of truth — never today's date. Returns
 *  null (render as '—') rather than silently substituting the current day. */
export function resolveSessionBusinessDate(xReportData, currentSession) {
  return sessionBusinessDay(xReportData?.session)
    || xReportData?.sessionInfo?.businessDate
    || sessionBusinessDay(currentSession)
    || null;
}

/** Statuses that mean a session could still be *used* for selling. A CLOSED session is
 *  never blocked — closing/reporting on a previous day is exactly the legitimate path. */
const CONTINUABLE = new Set(['OPEN', 'SUSPENDED', 'active']);

/**
 * True when `session` belongs to a Business Day strictly earlier than
 * `currentBusinessDay` and is still in a continuable state — i.e. the backend's
 * continuation gate will refuse it with PREVIOUS_DAY_SESSION_OPEN.
 *
 * Unknown inputs (no session, no resolved current day, no session date) return false:
 * this is the proactive UX layer, and the backend gate remains the authority.
 */
export function isPreviousBusinessDaySession(session, currentBusinessDay) {
  if (!session || !currentBusinessDay) return false;
  if (!CONTINUABLE.has(session.status)) return false;
  const day = sessionBusinessDay(session);
  if (!day) return false;
  return String(day) < String(currentBusinessDay); // ISO yyyy-MM-dd sorts lexicographically
}

/**
 * Whether a session may be handed to the POS *selling* screen.
 *
 * `blockedSessionId` is the id the backend named in its PREVIOUS_DAY_SESSION_OPEN
 * refusal (or in `day-status.previousBusinessDaySession`). It is kept alongside the
 * date comparison so a session already refused by the server stays blocked even if the
 * current Business Day could not be resolved on this client.
 */
export function isSessionUsableForSelling(session, { currentBusinessDay, blockedSessionId } = {}) {
  if (!session) return false;
  if (!CONTINUABLE.has(session.status)) return false;
  if (blockedSessionId != null && Number(session.id) === Number(blockedSessionId)) return false;
  return !isPreviousBusinessDaySession(session, currentBusinessDay);
}
