// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// POS session CLOSURE workflow: Session Owner Verification (cashier auth → begin-closure),
// the Close Session dialog (cash count / card settlement tabs, close error), the
// over-threshold variance approval panel, the Force Close reason/acknowledgement fields the
// supervisor dialog reads, and supervisor-authorized Cancel Closure. Moved unchanged: every
// API payload (authorize-closure, begin-closure, close, authorize-variance, cancel-closure),
// every error string, the VARIANCE_APPROVAL_REQUIRED structured-code branch, the
// CLOSED-target short-circuit, the success-path reset order, the X-Report auto-print arming,
// the Business Day re-poll and the current-vs-other-session navigation split.
//
// Session LIFECYCLE is not owned here. currentSession / setCurrentSession come from
// usePosSession and are written through, exactly as before.
//
// DELIBERATELY NOT MOVED (still POSSales-owned, passed in or left alone)
//   - sessionToClose. The closure target is read far outside this workflow: loadXReport
//     picks the report session from it, the supervisor dispatcher's FORCE_CLOSE_SESSION
//     branch targets it, the terminal-card menu writes it and businessDayClosureFlowActive
//     derives from it. It is passed in with its setter.
//   - closureAuthGrantRef, varianceGrantRef, forceCloseContextRef, cashierAuthTargetRef.
//     Written by the terminal-card Force Close menu, the Close Session dialog's Cancel, the
//     Cashier Auth dialog's Cancel and the useSupervisorApproval dispatcher, and read during
//     render by the Session Owner Verification dialog. Passed in and written through.
//   - showPreviousDayBlock / showClosureRequiredBlock and their modal state. They are
//     late-bound into usePosSession and passed into useCheckout, and belong as much to the
//     Business Day gate as to closure.
//   - openingCash (never written) and denominations (the OPENING count, owned by session
//     open/transfer, which stay in POSSales).
//   - closeDayVariance. Written only by handleCloseDay — Day Close reconciliation, not
//     session closure.
//   - The card-settlement → xReportCardVerified sync effect and the X-Report hydration
//     effect. Both write X-Report declaration state, and they must keep their relative
//     order: when the report's session changes while the Close Session dialog is open, the
//     hydration effect runs first and the sync effect's write wins. Moving the sync effect
//     into a hook called above the hydration effect would reverse that.
//   - Every inline JSX handler (dialog Cancel buttons, the Force Close menu item). No JSX
//     is extracted in this phase; they write through the setters returned here.
//
// LATE-BOUND LOADERS. loadXReport, loadDaySummary and syncPosData are declared ~2,000 lines
// below the call site (syncPosData depends on hooks further down still), so passing them as
// arguments would put them in the temporal dead zone. POSSales parks them on `loadersRef`
// during render, below syncPosData. Unlike usePosSession's handlers these are NOT stable —
// they close over the render's sessionToClose/currentSession/rangeOverride — and the
// original handlers used the copy from the render they were created in, including after an
// await. So each handler snapshots `loadersRef.current` synchronously on entry and uses that
// snapshot throughout; handleAuthorizeVariance hands its entry snapshot to the close it
// chains into, just as the original called the same render's handleCloseSession.
//
// Handlers are plain per-render functions, not useCallback, as they were in POSSales.
import { useState } from 'react';

import {
  authorizePosVariance,
  beginPosSessionClosure,
  cancelPosSessionClosure,
  closePosSession,
  verifySessionClosurePermission,
} from '../../../../../api/posApi';
import { emptyDenominations } from '../../../../../utils/cashDenominations';

/**
 * Owns the POS session-closure workflow state and handlers.
 *
 * @param {object}      args
 * @param {object|null} args.currentSession        usePosSession
 * @param {Function}    args.setCurrentSession     usePosSession
 * @param {object|null} args.sessionToClose        POSSales-owned closure target
 * @param {Function}    args.setSessionToClose
 * @param {object}      args.closureAuthGrantRef   POSSales-owned, written through
 * @param {object}      args.varianceGrantRef      POSSales-owned, written through
 * @param {object}      args.forceCloseContextRef  POSSales-owned, written through
 * @param {object}      args.cashierAuthTargetRef  POSSales-owned, written through
 * @param {object}      args.report  X-Report declaration fields the close request carries,
 *                                   pendingXAutoPrintRef and zReportDate
 * @param {Function}    args.setCurrentView
 * @param {Function}    args.setSessionNowMs
 * @param {object}      args.businessDayRefreshRef usePosSession
 * @param {object}      args.loadersRef  { loadXReport, loadDaySummary, syncPosData }, see above
 */
export function useSessionClosure({
  currentSession, setCurrentSession,
  sessionToClose, setSessionToClose,
  closureAuthGrantRef, varianceGrantRef, forceCloseContextRef, cashierAuthTargetRef,
  report: {
    xReportVarianceRemarks, xReportCardBatchNo, xReportCardVerified,
    xReportCashierName, xReportSupervisorName, xReportClosingRemarks,
    pendingXAutoPrintRef, zReportDate,
  },
  setCurrentView, setSessionNowMs, businessDayRefreshRef,
  loadersRef,
}) {
  // Supervisor-authorized "Cancel Closure". Credentials are verified server-side against a
  // supervisor role — this dialog only collects them, it never decides anything.
  const [showCancelClosureDialog, setShowCancelClosureDialog] = useState(false);
  const [cancelClosureUsername, setCancelClosureUsername] = useState('');
  const [cancelClosurePassword, setCancelClosurePassword] = useState('');
  const [cancelClosureReason, setCancelClosureReason] = useState('');
  const [cancelClosureError, setCancelClosureError] = useState('');
  const [cancelClosureLoading, setCancelClosureLoading] = useState(false);
  const [showCloseSessionDialog, setShowCloseSessionDialog] = useState(false);
  const [closeSessionError, setCloseSessionError] = useState('');
  // The server's refusal, verbatim: expected / counted / variance / threshold. Every number the
  // approval panel shows comes from here, so the figure a supervisor authorizes is exactly the
  // one the close was evaluated against. The frontend computes none of it.
  const [varianceApproval, setVarianceApproval] = useState(null);
  const [varianceApprovalBusy, setVarianceApprovalBusy] = useState(false);
  const [varianceApprovalError, setVarianceApprovalError] = useState('');
  const [varianceSupervisorUser, setVarianceSupervisorUser] = useState('');
  const [varianceSupervisorPassword, setVarianceSupervisorPassword] = useState('');
  const [varianceApprovalReason, setVarianceApprovalReason] = useState('');
  const [closureAction, setClosureAction] = useState(null); // 'NORMAL_CLOSE' or 'FORCE_CLOSE'
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [forceCloseAuditAcknowledged, setForceCloseAuditAcknowledged] = useState(false);
  const [showSessionOwnerRequiredDialog, setShowSessionOwnerRequiredDialog] = useState(false);
  const [closeSessionTab, setCloseSessionTab] = useState('cash'); // 'cash' | 'card'

  const [showCashierAuthDialog, setShowCashierAuthDialog] = useState(false);
  const [cashierAuthUsername, setCashierAuthUsername] = useState('');
  const [cashierAuthPassword, setCashierAuthPassword] = useState('');
  const [cashierAuthError, setCashierAuthError] = useState('');
  const [cashierAuthLoading, setCashierAuthLoading] = useState(false);

  // Session closing states
  const [closingDenominations, setClosingDenominations] = useState(emptyDenominations);
  const [cardSettlementAmount, setCardSettlementAmount] = useState('');

  const openCancelClosureDialog = () => {
    setCancelClosureUsername('');
    setCancelClosurePassword('');
    setCancelClosureReason('');
    setCancelClosureError('');
    setShowCancelClosureDialog(true);
  };

  /** Cancel a started closure. Supervisor authorization is enforced by the backend; a
   *  non-supervisor's credentials come back 403 and the session stays locked. */
  const handleCancelClosureSubmit = async () => {
    const targetId = currentSession?.id;
    if (!targetId) return;
    setCancelClosureLoading(true);
    setCancelClosureError('');
    try {
      const updated = await cancelPosSessionClosure(targetId, {
        reason: cancelClosureReason || undefined,
        usernameOrEmail: cancelClosureUsername || undefined,
        password: cancelClosurePassword || undefined,
      });
      setCurrentSession(prev => (prev?.id === targetId ? { ...prev, ...updated } : prev));
      setShowCancelClosureDialog(false);
      setCancelClosureUsername('');
      setCancelClosurePassword('');
      setCancelClosureReason('');
    } catch (err) {
      setCancelClosureError(err?.response?.data?.message || err.message
        || 'Could not cancel the closure. A supervisor must authorize this.');
    } finally {
      setCancelClosureLoading(false);
    }
  };

  /**
   * Obtains a supervisor's authorization for the variance the server just refused on, then
   * retries the close with the resulting grant.
   *
   * Sends the counted denominations so the server re-derives expected and counted itself — the
   * grant is bound to figures it computed, not to any number this page supplied.
   */
  const handleAuthorizeVariance = async () => {
    const loaders = loadersRef.current;
    if (!varianceApproval) return;
    const targetSession = sessionToClose || currentSession;
    if (!targetSession?.id) return;
    if (!varianceSupervisorUser || !varianceSupervisorPassword) {
      setVarianceApprovalError('Enter the supervisor username and password.');
      return;
    }
    if (!varianceApprovalReason.trim()) {
      setVarianceApprovalError('A reason is required to authorize a cash variance.');
      return;
    }
    setVarianceApprovalBusy(true);
    setVarianceApprovalError('');
    try {
      const result = await authorizePosVariance(targetSession.id, {
        usernameOrEmail: varianceSupervisorUser,
        password: varianceSupervisorPassword,
        reason: varianceApprovalReason.trim(),
        closingDenominations,
      });
      if (!result?.authorized) {
        // Not closed, and no cash fact touched. The panel stays open with the reason.
        setVarianceApprovalError(result?.message || 'Authorization was refused.');
        return;
      }
      varianceGrantRef.current = result.varianceApprovalToken
        ? { sessionId: targetSession.id, token: result.varianceApprovalToken }
        : null;
      // Credentials are never retained beyond the request that used them.
      setVarianceSupervisorUser('');
      setVarianceSupervisorPassword('');
      setVarianceApproval(null);
      await closeSession(loaders);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message;
      setVarianceApprovalError(typeof msg === 'string' && msg ? msg : 'Authorization failed. Please try again.');
    } finally {
      setVarianceApprovalBusy(false);
    }
  };

  // Body of handleCloseSession. `loaders` is the snapshot taken when the user action began
  // (see LATE-BOUND LOADERS above).
  const closeSession = async ({ loadDaySummary, syncPosData }) => {
    const targetSession = sessionToClose || currentSession;
    if (targetSession) {
      if (targetSession.status === 'CLOSED') {
        setShowCloseSessionDialog(false);
        setSessionToClose(null);
        if (targetSession.id === currentSession?.id) {
          setCurrentView('x-report');
        } else {
          loadDaySummary(zReportDate);
        }
        return;
      }
      setCloseSessionError('');
      try {
        if (targetSession.id && typeof targetSession.id === 'number') {
          const grant = closureAuthGrantRef.current;
          const forceCtx = forceCloseContextRef.current?.sessionId === targetSession.id
            ? forceCloseContextRef.current : null;
          // A force close keeps its supervisor-stated reason on the session record.
          const notes = forceCtx?.reason
            ? [`Force Close: ${forceCtx.reason}`, xReportVarianceRemarks].filter(Boolean).join(' — ')
            : xReportVarianceRemarks;
          const closed = await closePosSession(targetSession.id, {
            // Quantities only. The server validates them against the drawer's denomination
            // ladder and derives Counted Cash; a total posted from here would be unverifiable.
            closingDenominations,
            notes,
            cardBatchNo: xReportCardBatchNo,
            cardSettlementVerified: xReportCardVerified,
            cardClosingCash: cardSettlementAmount !== '' ? (parseFloat(cardSettlementAmount) || 0) : null,
            closingCashierName: xReportCashierName,
            closingSupervisorName: xReportSupervisorName || forceCtx?.supervisor || null,
            closingRemarks: xReportClosingRemarks,
            // Proof that the session owner's credentials were verified for THIS session.
            closureAuthToken: grant?.sessionId === targetSession.id ? grant.token : undefined,
            // Present only after a supervisor authorized this exact count. The server consumes
            // it once; a second tab retrying the same close is refused again.
            varianceApprovalToken: varianceGrantRef.current?.sessionId === targetSession.id
              ? varianceGrantRef.current.token : undefined,
          });
          // The grant is single-use server-side; drop it either way.
          closureAuthGrantRef.current = null;
          forceCloseContextRef.current = null;

          if (targetSession.id === currentSession?.id) {
            setCurrentSession(closed);
            // Arm the X-Report auto-print
            pendingXAutoPrintRef.current = targetSession.id;
          }
        } else {
          if (targetSession.id === currentSession?.id) {
            setCurrentSession({ ...currentSession, status: 'CLOSED' });
          }
        }
      } catch (err) {
        // The session is NOT closed if the server refused. Previously this fell through
        // and marked it closed locally, so the close silently didn't stick and Day Close
        // kept asking to close it again — surface the reason and stay in the dialog.
        console.warn('Close session API error', err);
        const data = err?.response?.data;
        // A discrepancy over the branch threshold is an exception, not a failure: the server
        // hands back the exact financial state it is refusing on, and the dialog switches to
        // the approval panel instead of just showing red text the cashier cannot act on.
        if (data?.code === 'VARIANCE_APPROVAL_REQUIRED') {
          varianceGrantRef.current = null;
          setVarianceApproval(data);
          setVarianceApprovalError('');
          setCloseSessionError('');
          return;
        }
        const msg = data?.message || data?.error || err?.message;
        setCloseSessionError(typeof msg === 'string' && msg ? msg : 'Failed to close the session. Please try again.');
        return;
      }
      setShowCloseSessionDialog(false);
      setSessionToClose(null);
      varianceGrantRef.current = null;
      setVarianceApproval(null);
      setVarianceSupervisorUser('');
      setVarianceSupervisorPassword('');
      setVarianceApprovalReason('');
      setSessionNowMs(Date.now());
      // Re-evaluate the Business Day immediately: this close may have been the last
      // session pending closure, and the overlay must not keep naming a session that
      // is now closed for up to a full poll interval.
      businessDayRefreshRef.current?.();
      if (targetSession.id === currentSession?.id) {
        setCurrentView('x-report');
      } else {
        loadDaySummary(zReportDate);
        setCurrentView('z-report');
      }
      syncPosData();
    }
  };

  const handleCloseSession = () => closeSession(loadersRef.current);

  const proceedToCloseSessionDialog = () => {
    setCloseSessionError('');
    setCardSettlementAmount('');
    setShowCloseSessionDialog(true);
    loadersRef.current.loadXReport();
  };

  // Day Close Flow: Validates ownership before allowing entry into the X-Report UI
  const handleDayCloseNormalClose = (target = null) => {
    // If called directly via onClick, target may be a React SyntheticEvent. Ignore it.
    const explicitTarget = (target && target.nativeEvent) ? null : target;
    const targetSession = explicitTarget || sessionToClose || currentSession;

    if (targetSession?.status === 'active' || targetSession?.status === 'OPEN'
        || targetSession?.status === 'SUSPENDED') {
      // Any authorized user may *initiate* a normal close. The Session Owner
      // Verification modal is itself the gate: the credentials typed there are
      // checked against the target session by /authorize-closure. So we never
      // pre-check "logged-in user === session owner" here.
      // Starting a fresh normal close — drop anything left over from an earlier
      // (possibly abandoned) close attempt.
      closureAuthGrantRef.current = null;
      forceCloseContextRef.current = null;
      cashierAuthTargetRef.current = targetSession;
      if (explicitTarget) setSessionToClose(explicitTarget);
      setShowCashierAuthDialog(true);
      // Prefill with the session's own owner, not the logged-in user.
      setCashierAuthUsername(targetSession?.cashier || targetSession?.openedBy || '');
      setCashierAuthPassword('');
      setCashierAuthError('');
    }
  };

  /**
   * "Close Session" from the Trading-Period-Ended overlay.
   *
   * The overlay lists sessions straight off `day-status.sessionsRequiringClosure`,
   * so the entry is a wire DTO (sessionId/terminalId/…), not one of the session
   * objects the rest of this screen passes around. Normalise it and hand it to the
   * one existing closure entry point — Session Owner Verification, then
   * begin-closure, then the X-Report/denomination screen — rather than opening a
   * second, parallel close path. The overlay is suppressed for the duration by
   * `businessDayClosureFlowActive` in POSSales, so the denomination UI is never covered.
   */
  const handleTradingEndedCloseSession = (pending) => {
    if (!pending?.sessionId) return;
    const target = {
      id: pending.sessionId,
      status: pending.status || 'OPEN',
      terminalId: pending.terminalId,
      terminalName: pending.terminalName,
      counterName: pending.counterName,
      openedBy: pending.openedBy,
      cashier: pending.openedBy,
      openedAt: pending.openedAt,
    };
    setClosureAction('NORMAL_CLOSE');
    setSessionToClose(target);
    handleDayCloseNormalClose(target);
  };

  const handleCashierAuthSubmit = async () => {
    if (!cashierAuthUsername || !cashierAuthPassword) {
      setCashierAuthError('Please enter email/username and password');
      return;
    }
    setCashierAuthLoading(true);
    setCashierAuthError('');
    try {
      const targetSession = cashierAuthTargetRef.current || sessionToClose || currentSession;
      const response = await verifySessionClosurePermission(targetSession.id, cashierAuthUsername, cashierAuthPassword);
      if (response.authorized) {
        closureAuthGrantRef.current = response.authorizationToken
          ? { sessionId: targetSession.id, token: response.authorizationToken }
          : null;
        // Owner verification successful — START the closure workflow before navigating.
        // This, and only this, is what persists the closure: begin-closure stamps
        // closingStartedAt server-side, which is what the backend gate reads to refuse
        // further selling. Without it, walking back to the dashboard would leave the
        // session freely sellable — the bypass this flow exists to close.
        //
        // Note this is NOT an X-Report call. Generating an X-Report is informational and
        // deliberately leaves the till operational; conflating the two would lock a session
        // the moment anyone glanced at a mid-shift report.
        //
        // The grant is passed so a non-owner (Day Close closing another cashier's session)
        // is authorized by the credentials just verified. The backend verifies it without
        // consuming it, so the close call still has it to spend.
        try {
          const started = await beginPosSessionClosure(targetSession.id, {
            closureAuthToken: closureAuthGrantRef.current?.token,
          });
          setCurrentSession(prev => (prev?.id === targetSession.id ? { ...prev, ...started } : prev));
        } catch (beginErr) {
          // Do not navigate into a closure we failed to start — that is exactly the
          // inconsistent half-state this change removes. The auth dialog stays open with
          // the server's reason (Business Day block, not authorized, not OPEN, …).
          setCashierAuthError(beginErr?.response?.data?.message || beginErr.message
            || 'Could not start the closure workflow for this session.');
          return;
        }
        setShowCashierAuthDialog(false);
        cashierAuthTargetRef.current = null;
        setCashierAuthUsername('');
        setCashierAuthPassword('');
        setCurrentView('x-report');
      } else {
        setCashierAuthError(response.message || 'Not authorized to close this session');
      }
    } catch (err) {
      setCashierAuthError(err.response?.data?.message || err.message || 'Authorization failed');
    } finally {
      setCashierAuthLoading(false);
    }
  };

  return {
    // Cancel Closure
    showCancelClosureDialog, setShowCancelClosureDialog,
    cancelClosureUsername, setCancelClosureUsername,
    cancelClosurePassword, setCancelClosurePassword,
    cancelClosureReason, setCancelClosureReason,
    cancelClosureError,
    cancelClosureLoading,
    openCancelClosureDialog, handleCancelClosureSubmit,
    // Close Session dialog
    showCloseSessionDialog, setShowCloseSessionDialog,
    closeSessionError, setCloseSessionError,
    closeSessionTab, setCloseSessionTab,
    closingDenominations, setClosingDenominations,
    cardSettlementAmount, setCardSettlementAmount,
    proceedToCloseSessionDialog, handleCloseSession,
    // Variance approval
    varianceApproval, setVarianceApproval,
    varianceApprovalBusy,
    varianceApprovalError, setVarianceApprovalError,
    varianceSupervisorUser, setVarianceSupervisorUser,
    varianceSupervisorPassword, setVarianceSupervisorPassword,
    varianceApprovalReason, setVarianceApprovalReason,
    handleAuthorizeVariance,
    // Normal / Force Close entry
    closureAction, setClosureAction,
    forceCloseReason, setForceCloseReason,
    forceCloseAuditAcknowledged, setForceCloseAuditAcknowledged,
    showSessionOwnerRequiredDialog, setShowSessionOwnerRequiredDialog,
    handleDayCloseNormalClose, handleTradingEndedCloseSession,
    // Session Owner Verification
    showCashierAuthDialog, setShowCashierAuthDialog,
    cashierAuthUsername, setCashierAuthUsername,
    cashierAuthPassword, setCashierAuthPassword,
    cashierAuthError, setCashierAuthError,
    cashierAuthLoading,
    handleCashierAuthSubmit,
  };
}

export default useSessionClosure;
