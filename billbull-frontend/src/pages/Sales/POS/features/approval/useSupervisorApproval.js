// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// The supervisor-PIN approval queue: the dialog's credential state, the pending-request
// slots that describe what was interrupted, and handleSupervisorPinSubmit — the single
// dispatcher that verifies the credential and resumes the interrupted action.
//
// Moved unchanged: the FORCE_CLOSE_SESSION pre-flight branch and its early return, the
// PASSWORD-vs-PIN verification split, every error string, the clear-on-success ordering
// and the exact order in which the five pending slots are drained.
//
// SUBMIT-TIME CONTEXT, NOT CONSTRUCTION-TIME INPUTS. The dispatcher resumes work owned by
// cart, product entry, checkout, delivery, Day Close and session closure — handlers that
// in POSSales are declared *below* the approval state they consume (processPayment and
// handleCloseDay are ~900 lines further down). The original code reached them through
// component-scope closures resolved at click time. Passing them at submit time reproduces
// that late binding exactly and keeps this hook callable from the top of POSSales, where
// businessDayClosureFlowActive already reads showSupervisorPin. Taking them as hook
// arguments instead would put the call below its own consumers and put every one of those
// handlers in the temporal dead zone.
//
// DELIBERATELY NOT MOVED: session-closure ownership. closureAuthGrantRef and
// forceCloseContextRef are written by the FORCE_CLOSE_SESSION branch but stay owned by
// POSSales (and later useSessionClosure) — they are passed in and written through, exactly
// as before. The variance workflow, the cashier-auth dialog, terminal takeover and the POS
// lock screen are separate credential flows and are not part of this queue.
//
// pendingLayawayAbortAction IS A CLOSURE, and stays one. requireLayawayApproval receives a
// thunk built at the call site (`() => applyVoid(itemId)`, or clearInvoice itself) that has
// already captured the values live at request time; the dispatcher invokes it after a
// successful verification. It is stored with the functional-setState guard
// (`setPendingLayawayAbortAction(() => action)`) so React stores the function rather than
// calling it. Every other pending slot is a serialisable request object.
import { useCallback, useState } from 'react';

import {
  verifyPosSupervisorPin,
  verifySessionClosurePermission,
  verifySupervisorAuth,
} from '../../../../../api/posApi';

/**
 * Owns the supervisor-PIN approval queue and its dispatcher.
 *
 * Takes no construction inputs: every dependency of the dispatcher is supplied at submit
 * time (see the note above), so the hook can be called before any of its consumers.
 */
export function useSupervisorApproval() {
  // Supervisor PIN dialog for void
  const [showSupervisorPin, setShowSupervisorPin] = useState(false);
  const [supervisorPinValue, setSupervisorPinValue] = useState('');
  // Only used when supervisorApprovalMode === 'PASSWORD' — identifies who is authorizing,
  // since verifySupervisorAuth (unlike verifyPosSupervisorPin) checks a specific account.
  const [supervisorPinEmail, setSupervisorPinEmail] = useState('');
  const [supervisorPinError, setSupervisorPinError] = useState('');
  const [pendingVoidItemId, setPendingVoidItemId] = useState(null);
  // Price-override approval pending supervisor sign-off. Serializable request object
  // (never a closure) describing what to do once approved — see submitSupervisorApproval.
  //   { type: 'ADD_ITEM', product, quantity, batch, serial, expiry, overrides, minPrice, attemptedPrice }
  //   { type: 'UPDATE_PRICE', itemId, newPrice, itemName, minPrice }
  const [pendingPriceOverride, setPendingPriceOverride] = useState(null);
  const [pendingLayawayAbortAction, setPendingLayawayAbortAction] = useState(null);
  // Generic supervisor action for future reuse (replaces dedicated pending flags)
  const [pendingSupervisorAction, setPendingSupervisorAction] = useState(null);
  // true = action is a full cart clear (should also reset layaway conversion state)
  const [pendingLayawayAbortIsFullClear, setPendingLayawayAbortIsFullClear] = useState(false);
  const [pendingUnlockAdvancedRange, setPendingUnlockAdvancedRange] = useState(false);

  /**
   * Enqueue a request and open the dialog. Replaces the four/five-setter block every
   * producer used to inline; the sequence (pending slot → PIN value → email → error →
   * open) is the one those call sites already ran.
   *
   * `resetEmail` is opt-in because the producers genuinely differ: the cart, product-entry
   * and advanced-range gates never cleared supervisorPinEmail, while Day Close, Force
   * Close, delivery settlement and the two checkout gates did. That difference is
   * preserved, not normalised.
   */
  const requestApproval = useCallback((request = {}) => {
    const { priceOverride, voidItemId, supervisorAction, unlockAdvancedRange, resetEmail = false } = request;
    if (priceOverride !== undefined) setPendingPriceOverride(priceOverride);
    if (voidItemId !== undefined) setPendingVoidItemId(voidItemId);
    if (supervisorAction !== undefined) setPendingSupervisorAction(supervisorAction);
    if (unlockAdvancedRange !== undefined) setPendingUnlockAdvancedRange(unlockAdvancedRange);
    setSupervisorPinValue('');
    if (resetEmail) setSupervisorPinEmail('');
    setSupervisorPinError('');
    setShowSupervisorPin(true);
  }, []);

  // Gate Clear / Remove / Void actions behind supervisor approval when a layaway
  // conversion is in progress, so reserved items can't be silently dumped.
  const requireLayawayApproval = useCallback((action, isFullClear = false) => {
    setPendingLayawayAbortAction(() => action);
    setPendingLayawayAbortIsFullClear(isFullClear);
    setSupervisorPinValue('');
    setSupervisorPinError('');
    setShowSupervisorPin(true);
  }, []);

  /**
   * The dialog's Cancel button. Clears the credential fields and the two slots it always
   * cleared — deliberately NOT pendingSupervisorAction, pendingLayawayAbortAction or
   * pendingUnlockAdvancedRange, which the original Cancel handler also left behind.
   */
  const cancelApproval = useCallback(() => {
    setShowSupervisorPin(false);
    setPendingVoidItemId(null);
    setPendingPriceOverride(null);
    setSupervisorPinValue('');
    setSupervisorPinEmail('');
    setSupervisorPinError('');
  }, []);

  /**
   * Verify the entered credential and resume whatever is queued.
   *
   * @param {object} ctx submit-time bindings, all resolved by POSSales at click time
   * @param {string} ctx.supervisorApprovalMode  'PIN' | 'PASSWORD'
   * @param {object|null} ctx.currentTerminal
   * @param {string} ctx.cashierDisplayName
   * @param {string} ctx.forceCloseReason              FORCE_CLOSE_SESSION pre-flight
   * @param {boolean} ctx.forceCloseAuditAcknowledged  FORCE_CLOSE_SESSION pre-flight
   * @param {object|null} ctx.sessionToClose
   * @param {object|null} ctx.currentSession
   * @param {object} ctx.closureAuthGrantRef   session-closure ref, written through
   * @param {object} ctx.forceCloseContextRef  session-closure ref, written through
   * @param {Function} ctx.setCurrentView
   * @param {Function} ctx.unlockAdvancedRange     Day Close advanced-range continuation
   * @param {Function} ctx.applyVoid               cart owner's void
   * @param {Function} ctx.addToInvoice            product-entry owner's add
   * @param {Function} ctx.updateItemPrice         cart line editor
   * @param {Function} ctx.updateDiscount          cart line editor
   * @param {Function} ctx.processPayment          checkout continuation
   * @param {Function} ctx.clearLayawayConversion  full-clear layaway reset
   * @param {Function} ctx.handleCloseDay          Day Close continuation
   */
  const submitSupervisorApproval = useCallback(async (ctx) => {
    const {
      supervisorApprovalMode, currentTerminal, cashierDisplayName,
      forceCloseReason, forceCloseAuditAcknowledged, sessionToClose, currentSession,
      closureAuthGrantRef, forceCloseContextRef, setCurrentView,
      unlockAdvancedRange, applyVoid, addToInvoice, updateItemPrice, updateDiscount,
      processPayment, clearLayawayConversion, handleCloseDay,
    } = ctx;

    if (pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION') {
      try {
        if (!supervisorPinEmail || !supervisorPinValue) {
          setSupervisorPinError('Enter supervisor email/username and password.');
          return;
        }
        if (!forceCloseReason || forceCloseReason === '') {
          setSupervisorPinError('Please select a force close reason.');
          return;
        }
        if (!forceCloseAuditAcknowledged) {
          setSupervisorPinError('Please confirm that you understand this action will be recorded in the audit trail.');
          return;
        }
        const targetSession = sessionToClose || currentSession;
        const response = await verifySessionClosurePermission(targetSession.id, supervisorPinEmail, supervisorPinValue);
        if (response.authorized) {
          // Same shape as the normal-close flow: the verified supervisor's grant
          // authorizes the eventual close, so the logged-in cashier can perform it.
          closureAuthGrantRef.current = response.authorizationToken
            ? { sessionId: targetSession.id, token: response.authorizationToken }
            : null;
          forceCloseContextRef.current = { sessionId: targetSession.id, reason: forceCloseReason, supervisor: supervisorPinEmail };
          setShowSupervisorPin(false);
          setPendingSupervisorAction(null);
          setSupervisorPinValue('');
          setSupervisorPinEmail('');
          setSupervisorPinError('');
          // Land on the X-Report for the target session — identical to Normal Close.
          // The supervisor authorizes here; the count/settlement and the actual
          // closure still happen on the X-Report page.
          setCurrentView('x-report');
        } else {
          setSupervisorPinError(response.message || 'Not authorized to force close this session.');
        }
      } catch (err) {
        setSupervisorPinError(err.response?.data?.message || err.message || 'Authorization failed');
      }
      return;
    }

    // ARCHFIX S5: verified server-side — the PIN/password is never shipped to the client.
    // PASSWORD mode authenticates a specific supervisor account (needs email + password);
    // PIN mode just checks the branch-wide PIN against the BCrypt hash.
    let valid = false;
    let failureReason = null;
    try {
      if (supervisorApprovalMode === 'PASSWORD') {
        if (!supervisorPinEmail || !supervisorPinValue) {
          setSupervisorPinError('Enter supervisor email/username and password.');
          return;
        }
        const result = await verifySupervisorAuth({
          email: supervisorPinEmail,
          password: supervisorPinValue,
          terminalId: currentTerminal?.terminalId || '',
          lockedBy: cashierDisplayName || '',
        });
        valid = !!result?.valid;
        failureReason = result?.reason || null;
      } else {
        valid = supervisorPinValue ? await verifyPosSupervisorPin(supervisorPinValue) : false;
      }
    } catch {
      setSupervisorPinError('Could not verify approval. Please try again.');
      return;
    }
    if (valid) {
      setShowSupervisorPin(false);
      if (pendingUnlockAdvancedRange) {
        unlockAdvancedRange();
        setPendingUnlockAdvancedRange(false);
      }
      if (pendingVoidItemId) {
        applyVoid(pendingVoidItemId);
        setPendingVoidItemId(null);
      }
      if (pendingPriceOverride) {
        const req = pendingPriceOverride;
        setPendingPriceOverride(null);
        if (req.type === 'ADD_ITEM') {
          // Resumption of an add that already passed through handleProductSelection
          // (and, in dialog mode, was already confirmed) — not a new selection, so
          // it must not be re-routed through the Product Entry Mode decision.
          addToInvoice(req.product, req.quantity, req.batch, req.serial, req.expiry, { ...req.overrides, approved: true });
        } else if (req.type === 'UPDATE_PRICE') {
          updateItemPrice(req.itemId, req.newPrice, true);
        } else if (req.type === 'UPDATE_DISCOUNT') {
          updateDiscount(req.itemId, req.newDiscount, true);
        } else if (req.type === 'CHECKOUT') {
          // Re-run checkout with the just-verified credentials attached so the backend's
          // §2.4 gate (PosCheckoutController) can independently confirm and bypass it —
          // never trust the client-side verify above alone for a money-moving action.
          processPayment(
            supervisorApprovalMode === 'PASSWORD'
              ? { email: supervisorPinEmail, password: supervisorPinValue }
              : { pin: supervisorPinValue }
          );
        }
      }
      if (pendingLayawayAbortAction) {
        const action = pendingLayawayAbortAction;
        const isFullClear = pendingLayawayAbortIsFullClear;
        setPendingLayawayAbortAction(null);
        setPendingLayawayAbortIsFullClear(false);
        action();
        // Full clear aborts the conversion; void/remove keeps layaway active.
        if (isFullClear) {
          clearLayawayConversion();
        }
      }
      if (pendingSupervisorAction) {
        const action = pendingSupervisorAction;
        setPendingSupervisorAction(null);
        if (action.type === 'DAY_CLOSE') {
          handleCloseDay(action.payload?.acknowledgeExclusions);
        } else if (action.type === 'DELIVERY_SETTLEMENT') {
          action.retry(
            supervisorApprovalMode === 'PASSWORD'
              ? { email: supervisorPinEmail, password: supervisorPinValue }
              : { pin: supervisorPinValue }
          );
        }
      }
      setSupervisorPinValue('');
      setSupervisorPinEmail('');
      setSupervisorPinError('');
    } else {
      setSupervisorPinError(failureReason || (
        supervisorApprovalMode === 'PASSWORD'
          ? 'Incorrect password. Please try again.'
          : 'Incorrect PIN. Please try again.'
      ));
    }
  }, [
    supervisorPinEmail, supervisorPinValue,
    pendingSupervisorAction, pendingUnlockAdvancedRange, pendingVoidItemId,
    pendingPriceOverride, pendingLayawayAbortAction, pendingLayawayAbortIsFullClear,
  ]);

  return {
    showSupervisorPin, setShowSupervisorPin,
    supervisorPinValue, setSupervisorPinValue,
    supervisorPinEmail, setSupervisorPinEmail,
    supervisorPinError, setSupervisorPinError,
    pendingVoidItemId,
    pendingPriceOverride,
    pendingLayawayAbortAction,
    pendingLayawayAbortIsFullClear,
    pendingSupervisorAction,
    pendingUnlockAdvancedRange,
    requestApproval,
    requireLayawayApproval,
    cancelApproval,
    submitSupervisorApproval,
  };
}
