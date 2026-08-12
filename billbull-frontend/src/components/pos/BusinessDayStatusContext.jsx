import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPosDayStatus } from '../../api/posApi';

/**
 * Single source of Business Day state for the POS screen.
 *
 * The phase surface is rendered in two places now — the blocking/announcement
 * overlays (BusinessDayStatusBanner) and the compact header chip
 * (BusinessDayStatusChip) — so the poll, the 1s ticker and the derived phase
 * live here once. Both consumers read the same server-resolved numbers; neither
 * recomputes ACTIVE/EXTENSION/CLOSED locally.
 *
 * The two rules that shaped the original banner still hold:
 *
 * 1. **The backend owns the phase.** A till whose clock or timezone differs from
 *    the configured Business Day timezone would otherwise disagree with what the
 *    server actually enforces. Only the seconds display ticks locally, down from
 *    the server's own reading.
 * 2. **A failed poll must never block the POS.** The UI is layered on top of the
 *    authoritative gates in openSession/checkout.
 */

const POLL_INTERVAL_MS = 60_000;

const BusinessDayStatusContext = createContext(null);

/** "01:59:59" — HH:MM:SS, zero-padded and ticking every second. */
export function formatCountdown(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "21:00" from an ISO local date-time, without dragging in a date library. */
export function formatTime(isoDateTime) {
  if (!isoDateTime) return null;
  const timePart = String(isoDateTime).split('T')[1];
  return timePart ? timePart.slice(0, 5) : null;
}

/**
 * `refreshRef` is an escape hatch for callers that sit *outside* the provider —
 * notably the Behaviour-tab settings save in POSSales, which changes the very
 * schedule this status is derived from and must not leave the chip/banner stale
 * for up to a full poll interval. The provider parks its `refresh` on the ref;
 * anything inside the tree should use `useBusinessDayStatus().refresh` instead.
 */
export function BusinessDayStatusProvider({ terminalId, refreshRef, children }) {
  const [status, setStatus] = useState(null);
  const [elapsedSinceFetch, setElapsedSinceFetch] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getPosDayStatus(terminalId || '');
      if (mountedRef.current) {
        setStatus(next);
        setElapsedSinceFetch(0);
      }
    } catch {
      // Non-fatal — worst case the operator sees a slightly stale phase and the
      // backend still refuses what it should.
    }
  }, [terminalId]);

  useEffect(() => {
    if (!refreshRef) return undefined;
    refreshRef.current = refresh;
    return () => { refreshRef.current = null; };
  }, [refreshRef, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const poll = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(poll);
    };
  }, [refresh]);

  // Local 1s ticker so countdowns move between polls. It only advances a local
  // offset applied to the server's numbers — it never derives the phase itself.
  useEffect(() => {
    const tick = window.setInterval(() => setElapsedSinceFetch((s) => s + 1), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const businessDay = status?.businessDay;
  const phase = businessDay?.phase;

  const secondsUntilClosure = businessDay?.secondsUntilClosure != null
    ? businessDay.secondsUntilClosure - elapsedSinceFetch : null;
  const secondsUntilNextStart = businessDay?.secondsUntilNextStart != null
    ? businessDay.secondsUntilNextStart - elapsedSinceFetch : null;

  // When a countdown reaches zero between polls the phase has almost certainly
  // changed server-side; re-poll immediately rather than waiting out the interval.
  useEffect(() => {
    if (secondsUntilClosure != null && secondsUntilClosure <= 0) refresh();
    if (secondsUntilNextStart != null && secondsUntilNextStart <= 0) refresh();
  }, [secondsUntilClosure, secondsUntilNextStart, refresh]);

  // "Approaching end" is a soft hint, shown only in the last stretch of the
  // active phase — early enough to matter, late enough not to become wallpaper.
  const approachingEnd = useMemo(() => {
    if (phase !== 'ACTIVE' || secondsUntilClosure == null) return false;
    const extensionSeconds = (businessDay?.extensionMinutes || 0) * 60;
    const untilScheduledEnd = secondsUntilClosure - extensionSeconds;
    return untilScheduledEnd > 0 && untilScheduledEnd <= 30 * 60;
  }, [phase, secondsUntilClosure, businessDay]);

  // No window configured, or enforcement off for this branch: consumers render
  // nothing at all rather than a reassuring "active" chrome that would imply a
  // schedule exists. This is the default for most branches.
  const enforced = Boolean(businessDay) && phase !== 'UNRESTRICTED' && Boolean(businessDay?.enforcementEnabled);

  const value = useMemo(() => ({
    status,
    businessDay,
    phase,
    enforced,
    approachingEnd,
    secondsUntilClosure,
    secondsUntilNextStart,
    scheduledEndTime: formatTime(businessDay?.scheduledEnd),
    closureTime: formatTime(businessDay?.closureAt),
    nextStartTime: formatTime(businessDay?.nextWindowStart),
    sessionsRequiringClosure: status?.sessionsRequiringClosure || [],
    // Backend-derived, so every till agrees: the day has ended, nothing is left to
    // close, and only the Day Close/Z-Report remains. Never inferred here from an
    // empty sessionsRequiringClosure — that cannot tell "Day Close done" apart
    // from "Day Close still pending".
    dayCloseRequired: Boolean(status?.dayCloseRequired),
    pendingDayCloseDate: status?.pendingDayCloseDate || null,
    refresh,
  }), [status, businessDay, phase, enforced, approachingEnd, secondsUntilClosure, secondsUntilNextStart, refresh]);

  return (
    <BusinessDayStatusContext.Provider value={value}>
      {children}
    </BusinessDayStatusContext.Provider>
  );
}

/** Returns null outside a provider, so consumers can render nothing safely. */
export function useBusinessDayStatus() {
  return useContext(BusinessDayStatusContext);
}
