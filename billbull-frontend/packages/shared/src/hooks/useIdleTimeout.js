import { useEffect, useRef, useCallback } from "react";
import { touchSessionActivity } from "../api/posApi";

/**
 * Monitors user activity and fires onIdle() when no activity is detected
 * for `timeoutMs` milliseconds. Also touches the server-side session activity
 * timestamp every `touchIntervalMs` so the backend idle-detection scheduler
 * stays in sync with real usage.
 *
 * @param {object} opts
 * @param {number}   opts.timeoutMs        - ms of inactivity before onIdle fires (0 = disabled)
 * @param {number}   opts.touchIntervalMs  - how often to sync lastActivityAt to the server
 * @param {string}   opts.sessionId        - the current POS session id
 * @param {Function} opts.onIdle           - called when the idle threshold is reached
 */
export function useIdleTimeout({
  timeoutMs = 0,
  touchIntervalMs = 30_000,
  sessionId,
  onIdle,
}) {
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const touchTimerRef = useRef(null);

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!timeoutMs || timeoutMs <= 0) return;

    const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    EVENTS.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));

    idleTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        onIdle?.();
      }
    }, 10_000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, resetIdle));
      clearInterval(idleTimerRef.current);
    };
  }, [timeoutMs, resetIdle, onIdle]);

  // Server-side activity touch
  useEffect(() => {
    if (!sessionId) return;

    touchTimerRef.current = setInterval(() => {
      touchSessionActivity(sessionId).catch(() => {});
    }, touchIntervalMs);

    return () => clearInterval(touchTimerRef.current);
  }, [sessionId, touchIntervalMs]);
}
