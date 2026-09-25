// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// POS session / terminal LIFECYCLE: which terminal this device is, which session is live on
// it, which Business Day the branch is on, and whether the backend has taken that session
// away. Moved unchanged: the registration payload and branch-scoped terminal_id cache key,
// the resume-error routing order (PREVIOUS_DAY_SESSION_OPEN → SESSION_CLOSING_WORKFLOW →
// other 409), the day-status pass that runs after it, the 5s sync poll and its reset list,
// the branch-changed re-resolution, the settings-then-register init order and the
// unmount guards on every async continuation.
//
// ONE OWNER. currentSession, currentTerminal and currentBusinessDay are declared here and
// nowhere else. POSSales destructures them under their original names, so every consumer
// (useProductCatalog, useLayaway, useHeldSales, useDelivery, useCheckout, usePosPrinting, the
// prop bags and the JSX) reads the same binding it always did. setCurrentSession and
// setCurrentTerminal are returned because they have writers outside the lifecycle — session
// closure, the closure/previous-day block dialogs, supervisor takeover and POSConsole's
// terminal rename — which stay where they are.
//
// DELIBERATELY NOT MOVED
//   - Session OPEN (handleStartSession) and session TRANSFER (handleSessionTransfer). Both
//     bank the opening denomination count and reset report/closure state (denominations,
//     closingDenominations, xReportData, zReportData) — all excluded from this boundary — and
//     the transfer path checks a branch-staleness gate *between* openPosSession and
//     setCurrentSession, so no shared "open" primitive can serve both without reordering.
//     They stay in POSSales and write through setCurrentSession.
//   - Discovery dialog state (discoveryResponse/Busy/Error/SupervisorPin). Produced by the
//     open path and consumed only by the takeover dialog. The branch-changed listener still
//     clears it, through handlers.resetDiscovery.
//   - The previous-day and closure-required block modals. Registration raises them through
//     handlers.showPreviousDayBlock / showClosureRequiredBlock; the modals, their state and
//     prevDayBlockedSessionId remain POSSales-owned (they belong to the closure boundary).
//   - Idle lock, supervisor takeover dialog and shift-handover credentials. handover consumes
//     clearTerminalLock and resumeTerminalSession from here.
//   - Everything in the session-closure workflow.
//
// LATE-BOUND HANDLERS, NOT CONSTRUCTION-TIME INPUTS. This hook must be called at the top of
// POSSales, above the first reader of currentSession. The work it hands back to POSSales
// lives far below that point: the invalidation reset writes setCheckoutPhase/setCheckoutError
// (returned by useCheckout ~3,300 lines further down), the init settings loader calls
// applyPrintTemplateConfig (useTemplateSettings), and the block helpers/discovery reset are
// declared ~1,500 lines down. Passing them as arguments would put every one of them in the
// temporal dead zone. The original code reached them through component-scope closures that
// ran only at effect/event time; `handlersRef` reproduces exactly that late binding — the same
// pattern as syncPosDataRef / showFeedbackRef. It is read only inside effects, async
// continuations and event handlers, never during render, and POSSales assigns it during
// render, so it is always populated before any of those can run. Every handler it carries
// only calls stable setters or []-memoised callbacks, so reading the latest render's copy is
// indistinguishable from the first render's copy the original closures captured.
//
//   handlersRef.current = {
//     loadInitialPosSettings(isCancelled) — async; the settings/tax/layout/template seeding
//                                          that runs before registration on mount
//     showPreviousDayBlock(msg, sessionId?)
//     showClosureRequiredBlock(msg, sessionId?)
//     resetDiscovery()                   — clears the session-roaming discovery dialog
//     resetForInvalidatedSession()       — cart/customer/dialog/checkout reset after the
//                                          backend reports the session is no longer valid
//   }
//
// REFS
//   posTerminalMountedRef — internal. Async registration continuations outlive an unmount and
//     must read the live mounted flag, not a render snapshot; set true on every (re-)mount so
//     StrictMode's mount→cleanup→mount does not leave it false.
//   businessDayRefreshRef — returned. Its WRITER is BusinessDayStatusProvider, a *descendant*
//     rendered by POSSales, which parks its refresh() on the ref; its readers are the
//     Behaviour-settings save (usePosBehaviourSettings) and handleCloseSession. A parent cannot
//     receive a callback from a child's state any other way, so this cannot become an ordinary
//     callback without lifting Business Day status out of the provider — a redesign, not an
//     extraction. Ownership moved here because the provider is keyed to this hook's terminal.
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getActivePosSession,
  getPosDayStatus,
  getPosSessionById,
  registerPosTerminal,
  syncPosSession,
} from '../../../../../api/posApi';
import { useHeartbeat } from '../../../../../hooks/useHeartbeat';
import { isClosureWorkflowError } from './sessionWorkflowErrors';

/**
 * Owns POS session / terminal lifecycle state and orchestration.
 *
 * @param {object}      args
 * @param {object|null} args.posSettings  live POS settings (heartbeat interval only)
 * @param {object}      args.handlersRef  stable ref to the late-bound POSSales handlers
 *                                        described above
 */
export function usePosSession({ posSettings, handlersRef }) {
  const [currentSession, setCurrentSession] = useState(null);
  // Phase 12 - Session synchronization lock state
  const [sessionInvalidated, setSessionInvalidated] = useState(false);
  const [sessionInvalidReason, setSessionInvalidReason] = useState(null);

  // Branch's currently resolved Business Day (day-status). Used ONLY to decide whether a
  // session belongs to an earlier Business Day — never to label a session's own date.
  const [currentBusinessDay, setCurrentBusinessDay] = useState(null);

  // Filled by BusinessDayStatusProvider (rendered below POSSales' body), so a Business Day
  // schedule change can re-poll the status immediately.
  const businessDayRefreshRef = useRef(null);

  const [currentTerminal, setCurrentTerminal] = useState(null);
  const [terminalLockedBy, setTerminalLockedBy] = useState(null);
  // Set when the previous business date is still open past configured operating hours
  // and the caller owns none of those open sessions — blocks POS entry with an
  // informational popup listing the unclosed session(s) until Day Close runs.
  const [openSessionsBlock, setOpenSessionsBlock] = useState(null); // { currentBusinessDate, openSessions } | null

  // Phase 12 - Session Synchronization (Polling)
  useEffect(() => {
    // Once this terminal has closed the session itself, stop polling — the
    // X-Report screen keeps `currentSession` around (status CLOSED) so the
    // cashier can still Print/Export/History the just-closed report, and the
    // sync check would otherwise treat "closed by us" the same as "closed/
    // transferred remotely" and boot them out mid-review (see "Session No
    // Longer Available" overlay).
    if (!currentSession || currentSession.status === 'CLOSED' || !currentTerminal?.terminalId || sessionInvalidated) return;
    let aborted = false;

    const poll = async () => {
      if (aborted || !currentSession || currentSession.status === 'CLOSED' || !currentTerminal?.terminalId || sessionInvalidated) return;

      // Do not poll if we are viewing a session from a DIFFERENT terminal
      // (e.g. clicking "Go to Close Session" on the PREVIOUS_DAY_SESSION_OPEN modal
      // to close a stale session left open on another machine). Polling here would
      // immediately invalidate the session with "TRANSFERRED" since terminalId doesn't match.
      if (currentSession.terminalId && currentSession.terminalId !== currentTerminal.terminalId) {
        if (!aborted && currentSession && !sessionInvalidated) {
          setTimeout(poll, 5000);
        }
        return;
      }

      try {
        const terminalId = currentTerminal.terminalId;
        if (terminalId) {
          const res = await syncPosSession(currentSession.id, terminalId);
          if (res && res.sessionValid === false) {
            setSessionInvalidated(true);
            setSessionInvalidReason(res.message || 'This session has been transferred to another terminal.');
            setCurrentSession(null);
            // Cart, customer, open dialogs and checkout phase — all POSSales/useCart/
            // useCheckout-owned, reset in the original order by the late-bound handler.
            handlersRef.current.resetForInvalidatedSession();
          }
        }
      } catch (err) {
        // Ignore network failures, allow it to retry on next tick
      }
      if (!aborted && currentSession && !sessionInvalidated) {
        setTimeout(poll, 5000);
      }
    };

    const timer = setTimeout(poll, 5000);
    return () => {
      aborted = true;
      clearTimeout(timer);
    };
  }, [currentSession, currentTerminal, sessionInvalidated, handlersRef]);
  // Set when this device's cached terminal_id was rejected (403 — terminal is ARCHIVED,
  // BLOCKED, DECOMMISSIONED, or in MAINTENANCE). Surfaces the reason instead of silently
  // leaving currentTerminal null, which previously let handleStartSession fabricate a
  // fake, unregistered terminalId and open an orphaned "phantom" session (see
  // docs/pos-terminal-branch-switch-investigation-2026-07-24.html follow-up).
  const [terminalRegistrationError, setTerminalRegistrationError] = useState(null);
  // Guards state updates in registerTerminalAndResumeSession, which can be invoked from either
  // the mount-time init effect or the branch-changed listener below, both of which may outlive
  // an unmount. Must set current = true on (re-)mount, not just clear it on cleanup — StrictMode
  // (dev only) mounts every effect, fires its cleanup immediately, then mounts again, so a
  // cleanup-only assignment left this permanently false for the rest of the real session.
  const posTerminalMountedRef = useRef(true);
  useEffect(() => {
    posTerminalMountedRef.current = true;
    return () => { posTerminalMountedRef.current = false; };
  }, []);
  const [posInitLoading, setPosInitLoading] = useState(true);

  // Heartbeat — keeps the terminal ACTIVE on the server
  useHeartbeat(
    currentTerminal?.terminalId,
    (posSettings?.heartbeatIntervalSeconds ?? 60) * 1000,
  );

  // Registers (or resumes) this device's terminal for the CURRENTLY ACTIVE branch and, if one
  // exists, restores the open session on it. Terminal identity is per-branch — the same device
  // holds an independent terminal in every branch it's used in — so the cached terminal_id is
  // scoped by branch, not global (see docs/pos-terminal-branch-switch-investigation-2026-07-24.html).
  // Invoked on initial POS mount and again whenever the active branch changes, so a live branch
  // switch reconnects the correct branch's terminal/session immediately rather than only on the
  // next full remount.
  const registerTerminalAndResumeSession = useCallback(async () => {
    const activeBranchIdRaw = sessionStorage.getItem('activeBranchId');
    const activeBranchId = activeBranchIdRaw && activeBranchIdRaw !== 'ALL' ? activeBranchIdRaw : 'default';

    const nav = window.navigator;
    let fp = localStorage.getItem('billbull:pos:device_fingerprint');
    if (!fp) {
      fp = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
      localStorage.setItem('billbull:pos:device_fingerprint', fp);
    }
    const terminalIdKey = `billbull:pos:terminal_id:${activeBranchId}`;
    const cachedTerminalId = localStorage.getItem(terminalIdKey) || null;
    const deviceInfo = `${nav.userAgent.split('(')[1]?.split(')')[0] || 'Unknown'} – ${screen.width}×${screen.height}`;

    let regResult = null;
    try {
      regResult = await registerPosTerminal({ terminalId: cachedTerminalId, deviceFingerprint: fp, deviceInfo });
    } catch (err) {
      if (posTerminalMountedRef.current && err?.response?.status === 403) {
        setTerminalRegistrationError(
          err.response?.data?.message || err.response?.data
            || 'This device\'s registered terminal is no longer active.'
        );
      }
      return;
    }
    if (!posTerminalMountedRef.current || !regResult?.terminal) return;
    setTerminalRegistrationError(null);
    setCurrentTerminal(regResult.terminal);
    localStorage.setItem(terminalIdKey, regResult.terminal.terminalId);

    // Try to resume an existing open session for this terminal
    const termId = regResult.terminal.terminalId;
    try {
      const active = await getActivePosSession(termId);
      if (posTerminalMountedRef.current && active?.id) {
        setCurrentSession(active);
      }
    } catch (err) {
      const activeErrMsg = err?.response?.data?.message || err?.response?.data;
      if (err.response?.status === 409 && typeof activeErrMsg === 'string'
          && activeErrMsg.includes('PREVIOUS_DAY_SESSION_OPEN') && posTerminalMountedRef.current) {
        // The existing session belongs to a previous Business Day, so the backend
        // refuses to hand it back for "Continue Session". Same blocking flow as
        // Start Session — never a second, differently-worded warning. The refused session
        // is never adopted as the active selling session.
        setCurrentSession(null);
        handlersRef.current.showPreviousDayBlock(activeErrMsg);
      } else if (isClosureWorkflowError(err) && posTerminalMountedRef.current) {
        // The session has entered its close workflow, so the backend refuses to hand it
        // back for "Continue Session". Load it through the ungated by-id endpoint anyway:
        // the dashboard needs the session to render "Close Session Required", and the
        // X-Report / Close Session screen needs it to finish the closure. This is the
        // whole point of the session staying OPEN in the database.
        const closingId = Number(String(activeErrMsg).match(/Session ID\s*:\s*(\d+)/)?.[1]) || null;
        if (closingId) {
          try {
            const closingSession = await getPosSessionById(closingId);
            if (posTerminalMountedRef.current) setCurrentSession(closingSession);
          } catch {
            // Non-fatal — the block modal below still routes the cashier to closure.
          }
        }
        if (posTerminalMountedRef.current) handlersRef.current.showClosureRequiredBlock(activeErrMsg, closingId);
      } else if (err.response?.status === 409 && posTerminalMountedRef.current) {
        setTerminalLockedBy(activeErrMsg || 'Another active cashier');
      }
    }

    // Business-date / operating-hours check: if the previous business date is still
    // open past configured operating hours and this cashier owns none of the unclosed
    // sessions, block POS entry with an informational popup naming them.
    try {
      const dayStatus = await getPosDayStatus(termId);
      if (posTerminalMountedRef.current) {
        setOpenSessionsBlock(dayStatus?.blocked ? dayStatus : null);
        // Server-resolved Business Day — the same value BusinessDayContinuationGate
        // compares against, so the dashboard can classify an already-loaded session
        // (e.g. after a browser refresh) without a second date calculation of its own.
        setCurrentBusinessDay(dayStatus?.candidateBusinessDay || dayStatus?.currentBusinessDate || null);
        // Proactive form of the same rule the backend enforces on every continuation
        // call: this terminal's existing session belongs to a previous Business Day,
        // so raise "Previous Day Not Closed" at mount instead of waiting for the
        // cashier to hit a refused endpoint. The message is built server-side, so the
        // modal and the API refusal always read identically.
        const prevDayBlock = dayStatus?.previousBusinessDaySession;
        if (prevDayBlock?.message) {
          setCurrentSession(null);
          handlersRef.current.showPreviousDayBlock(prevDayBlock.message, prevDayBlock.sessionId);
        }
      }
    } catch {
      // Non-blocking — day-status is a UX convenience layered on top of the
      // authoritative server-side guards already enforced in openSession/closeDay.
    }
  }, [handlersRef]);

  // Shift handover: the handover unlocks the terminal but the ongoing session (owned by the
  // previous cashier) still exists — resume it rather than falling through to "Start
  // Session". Moved verbatim out of handleHandoverSubmit, which stays in POSSales with its
  // supervisor credentials; unlike registration this path has never had a mounted guard or
  // error routing, and still has neither.
  const resumeTerminalSession = useCallback(async () => {
    if (currentTerminal?.terminalId) {
      try {
        const active = await getActivePosSession(currentTerminal.terminalId);
        if (active?.id) setCurrentSession(active);
      } catch { /* no active session to resume */ }
    }
  }, [currentTerminal]);

  const clearTerminalLock = useCallback(() => setTerminalLockedBy(null), []);
  const dismissOpenSessionsBlock = useCallback(() => setOpenSessionsBlock(null), []);
  // "Return to Dashboard" on the Session No Longer Available overlay. POSSales navigates.
  const acknowledgeSessionInvalidation = useCallback(() => {
    setSessionInvalidated(false);
    setSessionInvalidReason(null);
  }, []);

  // Re-run terminal/session resolution whenever the active branch changes while POS stays
  // mounted — without this, switching branches leaves the previous branch's terminal/session in
  // memory until the page is remounted.
  useEffect(() => {
    const handleBranchChanged = () => {
      setCurrentTerminal(null);
      setCurrentSession(null);
      setTerminalLockedBy(null);
      setOpenSessionsBlock(null);
      // Session Roaming Phase 11 — dismiss any open discovery dialog when the
      // branch switches so stale cross-branch data doesn't linger.
      handlersRef.current.resetDiscovery();
      registerTerminalAndResumeSession();
    };
    window.addEventListener('billbull:branch-changed', handleBranchChanged);
    return () => window.removeEventListener('billbull:branch-changed', handleBranchChanged);
  }, [registerTerminalAndResumeSession, handlersRef]);

  // ── POS initialization: load settings + register terminal + resume session ──
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        // Load POS settings (POSSales-owned: settings, branch tax, layout and print-template
        // seeding). It checks isCancelled() exactly where the original checked `cancelled`.
        await handlersRef.current.loadInitialPosSettings(() => cancelled);

        if (!cancelled) {
          await registerTerminalAndResumeSession();
        }
      } catch (e) {
        console.warn('POS init error', e);
      } finally {
        if (!cancelled) setPosInitLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
    // Mount-only, as before: re-running would re-register the terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    currentSession, setCurrentSession,
    currentTerminal, setCurrentTerminal,
    currentBusinessDay,
    sessionInvalidated, sessionInvalidReason, acknowledgeSessionInvalidation,
    terminalRegistrationError,
    terminalLockedBy, clearTerminalLock,
    openSessionsBlock, dismissOpenSessionsBlock,
    posInitLoading,
    businessDayRefreshRef,
    resumeTerminalSession,
  };
}

export default usePosSession;
