import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  verifyPosSupervisorPin: vi.fn(),
  verifySupervisorAuth: vi.fn(),
  verifySessionClosurePermission: vi.fn(),
}));

import {
  verifyPosSupervisorPin,
  verifySessionClosurePermission,
  verifySupervisorAuth,
} from '../../../api/posApi';
import { useSupervisorApproval } from '../POS/features/approval/useSupervisorApproval';

/**
 * CHARACTERIZATION — the supervisor-PIN approval queue.
 *
 * This was eight useState calls, handleSupervisorPinSubmit and requireLayawayApproval
 * inside POSSales.jsx, and therefore unreachable from any test. The extraction moved them
 * verbatim into a hook, so the credential branches, the pending-slot drain order, the
 * exact error strings and the layaway-abort closure can now be asserted.
 *
 * The dispatcher's continuations are supplied at submit time (they are owned by cart,
 * product entry, checkout, delivery, Day Close and session closure, all of which are
 * declared below the queue in POSSales), so each test builds the ctx it needs.
 *
 * These tests describe CURRENT behaviour. Session closure, the variance workflow,
 * terminal takeover and the POS lock screen are separate credential flows and are
 * deliberately out of scope.
 */

/** Every continuation the dispatcher can call, as spies. */
const makeCtx = (over = {}) => ({
  supervisorApprovalMode: 'PIN',
  currentTerminal: { terminalId: 'T-1' },
  cashierDisplayName: 'Aisha Khan',
  forceCloseReason: '',
  forceCloseAuditAcknowledged: false,
  sessionToClose: null,
  currentSession: { id: 42 },
  closureAuthGrantRef: { current: null },
  forceCloseContextRef: { current: null },
  setCurrentView: vi.fn(),
  unlockAdvancedRange: vi.fn(),
  applyVoid: vi.fn(),
  addToInvoice: vi.fn(),
  updateItemPrice: vi.fn(),
  updateDiscount: vi.fn(),
  processPayment: vi.fn(),
  clearLayawayConversion: vi.fn(),
  handleCloseDay: vi.fn(),
  ...over,
});

/** Type the PIN the dialog's keypad/input would have set, then submit. */
const enterAndSubmit = async (result, ctx, { pin = '1234', email } = {}) => {
  act(() => {
    result.current.setSupervisorPinValue(pin);
    if (email !== undefined) result.current.setSupervisorPinEmail(email);
  });
  await act(async () => { await result.current.submitSupervisorApproval(ctx); });
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyPosSupervisorPin.mockResolvedValue(true);
  verifySupervisorAuth.mockResolvedValue({ valid: true });
  verifySessionClosurePermission.mockResolvedValue({ authorized: true, authorizationToken: 'grant-1' });
});

describe('initial state', () => {
  it('starts closed with an empty credential and every pending slot unset', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.supervisorPinValue).toBe('');
    expect(result.current.supervisorPinEmail).toBe('');
    expect(result.current.supervisorPinError).toBe('');
    expect(result.current.pendingVoidItemId).toBeNull();
    expect(result.current.pendingPriceOverride).toBeNull();
    expect(result.current.pendingLayawayAbortAction).toBeNull();
    expect(result.current.pendingLayawayAbortIsFullClear).toBe(false);
    expect(result.current.pendingSupervisorAction).toBeNull();
    expect(result.current.pendingUnlockAdvancedRange).toBe(false);
  });
});

describe('requestApproval — opening the dialog', () => {
  it('stores the request, clears the PIN and the error, and opens the dialog', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    act(() => { result.current.setSupervisorPinValue('stale'); result.current.setSupervisorPinError('old error'); });
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });

    expect(result.current.showSupervisorPin).toBe(true);
    expect(result.current.pendingVoidItemId).toBe('line-7');
    expect(result.current.supervisorPinValue).toBe('');
    expect(result.current.supervisorPinError).toBe('');
  });

  it('CHARACTERIZED: leaves supervisorPinEmail alone unless resetEmail is asked for', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    act(() => { result.current.setSupervisorPinEmail('manager@shop.test'); });

    // Cart / product-entry / advanced-range gates never cleared the email.
    act(() => { result.current.requestApproval({ priceOverride: { type: 'UPDATE_PRICE', itemId: 'i1', newPrice: 5 } }); });
    expect(result.current.supervisorPinEmail).toBe('manager@shop.test');

    // Day Close, Force Close, delivery settlement and the checkout gates did.
    act(() => { result.current.requestApproval({ supervisorAction: { type: 'DAY_CLOSE' }, resetEmail: true }); });
    expect(result.current.supervisorPinEmail).toBe('');
  });

  it('only writes the slots named in the request', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    act(() => { result.current.requestApproval({ unlockAdvancedRange: true }); });

    expect(result.current.pendingVoidItemId).toBe('line-7');
    expect(result.current.pendingUnlockAdvancedRange).toBe(true);
    expect(result.current.pendingPriceOverride).toBeNull();
  });
});

describe('validation failures — nothing is verified and nothing is dispatched', () => {
  it('PASSWORD mode refuses a missing email or password with the exact prompt', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx({ supervisorApprovalMode: 'PASSWORD' });
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });

    await enterAndSubmit(result, ctx, { pin: '' });
    expect(result.current.supervisorPinError).toBe('Enter supervisor email/username and password.');
    expect(verifySupervisorAuth).not.toHaveBeenCalled();
    expect(ctx.applyVoid).not.toHaveBeenCalled();
    expect(result.current.showSupervisorPin).toBe(true);
  });

  it('PIN mode treats an empty PIN as invalid without calling the API', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });

    await enterAndSubmit(result, ctx, { pin: '' });
    expect(verifyPosSupervisorPin).not.toHaveBeenCalled();
    expect(result.current.supervisorPinError).toBe('Incorrect PIN. Please try again.');
    expect(ctx.applyVoid).not.toHaveBeenCalled();
  });
});

describe('credential verification', () => {
  it('PIN mode verifies the branch PIN alone', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx, { pin: '4321' });

    expect(verifyPosSupervisorPin).toHaveBeenCalledWith('4321');
    expect(verifySupervisorAuth).not.toHaveBeenCalled();
  });

  it('PASSWORD mode authenticates a named account with the terminal and cashier attached', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx({ supervisorApprovalMode: 'PASSWORD' });
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx, { pin: 'hunter2', email: 'manager@shop.test' });

    expect(verifySupervisorAuth).toHaveBeenCalledWith({
      email: 'manager@shop.test',
      password: 'hunter2',
      terminalId: 'T-1',
      lockedBy: 'Aisha Khan',
    });
  });

  it('an incorrect PIN reports the PIN-mode message and dispatches nothing', async () => {
    verifyPosSupervisorPin.mockResolvedValue(false);
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx);

    expect(result.current.supervisorPinError).toBe('Incorrect PIN. Please try again.');
    expect(result.current.showSupervisorPin).toBe(true);
    expect(result.current.pendingVoidItemId).toBe('line-7');
    expect(ctx.applyVoid).not.toHaveBeenCalled();
  });

  it('an incorrect password reports the PASSWORD-mode message, or the server reason when given', async () => {
    verifySupervisorAuth.mockResolvedValue({ valid: false });
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx({ supervisorApprovalMode: 'PASSWORD' });
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx, { pin: 'nope', email: 'manager@shop.test' });
    expect(result.current.supervisorPinError).toBe('Incorrect password. Please try again.');

    verifySupervisorAuth.mockResolvedValue({ valid: false, reason: 'Account is locked.' });
    await enterAndSubmit(result, ctx, { pin: 'nope', email: 'manager@shop.test' });
    expect(result.current.supervisorPinError).toBe('Account is locked.');
  });

  it('a thrown verification is reported without dispatching', async () => {
    verifyPosSupervisorPin.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx);

    expect(result.current.supervisorPinError).toBe('Could not verify approval. Please try again.');
    expect(ctx.applyVoid).not.toHaveBeenCalled();
    expect(result.current.showSupervisorPin).toBe(true);
  });
});

describe('pending slot dispatch', () => {
  it('pendingVoidItemId → applyVoid, then the slot is cleared', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx);

    expect(ctx.applyVoid).toHaveBeenCalledWith('line-7');
    expect(result.current.pendingVoidItemId).toBeNull();
  });

  it('pendingPriceOverride ADD_ITEM → addToInvoice with approved:true merged into overrides', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    const product = { id: 'p1', name: 'Widget' };
    act(() => {
      result.current.requestApproval({
        priceOverride: {
          type: 'ADD_ITEM',
          product, quantity: 3, batch: 'B-1', serial: 'S-1', expiry: '2027-01-01',
          overrides: { price: 4 },
        },
      });
    });
    await enterAndSubmit(result, ctx);

    expect(ctx.addToInvoice).toHaveBeenCalledWith(product, 3, 'B-1', 'S-1', '2027-01-01', { price: 4, approved: true });
    expect(result.current.pendingPriceOverride).toBeNull();
  });

  it('pendingPriceOverride UPDATE_PRICE / UPDATE_DISCOUNT → the cart editor with approved=true', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();

    act(() => { result.current.requestApproval({ priceOverride: { type: 'UPDATE_PRICE', itemId: 'i1', newPrice: 9.5 } }); });
    await enterAndSubmit(result, ctx);
    expect(ctx.updateItemPrice).toHaveBeenCalledWith('i1', 9.5, true);

    act(() => { result.current.requestApproval({ priceOverride: { type: 'UPDATE_DISCOUNT', itemId: 'i2', newDiscount: 40 } }); });
    await enterAndSubmit(result, ctx);
    expect(ctx.updateDiscount).toHaveBeenCalledWith('i2', 40, true);
  });

  it('pendingPriceOverride CHECKOUT → processPayment carrying the verified credential', async () => {
    const { result } = renderHook(() => useSupervisorApproval());

    const pinCtx = makeCtx();
    act(() => { result.current.requestApproval({ priceOverride: { type: 'CHECKOUT' }, resetEmail: true }); });
    await enterAndSubmit(result, pinCtx, { pin: '2468' });
    expect(pinCtx.processPayment).toHaveBeenCalledWith({ pin: '2468' });

    const pwCtx = makeCtx({ supervisorApprovalMode: 'PASSWORD' });
    act(() => { result.current.requestApproval({ priceOverride: { type: 'CHECKOUT' }, resetEmail: true }); });
    await enterAndSubmit(result, pwCtx, { pin: 'hunter2', email: 'manager@shop.test' });
    expect(pwCtx.processPayment).toHaveBeenCalledWith({ email: 'manager@shop.test', password: 'hunter2' });
  });

  it('BUSINESS_DAY_CLOSED carries no dispatch of its own — it only drives the dialog copy', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ priceOverride: { type: 'BUSINESS_DAY_CLOSED', closedAt: 'x' }, resetEmail: true }); });
    expect(result.current.pendingPriceOverride.type).toBe('BUSINESS_DAY_CLOSED');

    await enterAndSubmit(result, ctx);
    expect(ctx.processPayment).not.toHaveBeenCalled();
    expect(ctx.addToInvoice).not.toHaveBeenCalled();
    expect(result.current.pendingPriceOverride).toBeNull();
  });

  it('pendingUnlockAdvancedRange → the unlock continuation, then the flag is cleared', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({ unlockAdvancedRange: true }); });
    await enterAndSubmit(result, ctx);

    expect(ctx.unlockAdvancedRange).toHaveBeenCalledTimes(1);
    expect(result.current.pendingUnlockAdvancedRange).toBe(false);
  });

  it('pendingSupervisorAction DAY_CLOSE → handleCloseDay with the acknowledgement flag', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => {
      result.current.requestApproval({
        supervisorAction: { type: 'DAY_CLOSE', payload: { acknowledgeExclusions: true } },
        resetEmail: true,
      });
    });
    await enterAndSubmit(result, ctx);

    expect(ctx.handleCloseDay).toHaveBeenCalledWith(true);
    expect(result.current.pendingSupervisorAction).toBeNull();
  });

  it('pendingSupervisorAction DELIVERY_SETTLEMENT → its own retry with the verified credential', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    const retry = vi.fn();
    act(() => { result.current.requestApproval({ supervisorAction: { type: 'DELIVERY_SETTLEMENT', retry }, resetEmail: true }); });
    await enterAndSubmit(result, ctx, { pin: '1357' });

    expect(retry).toHaveBeenCalledWith({ pin: '1357' });
    expect(result.current.pendingSupervisorAction).toBeNull();
  });

  it('with nothing pending, a valid credential just closes the dialog', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    act(() => { result.current.requestApproval({}); });
    await enterAndSubmit(result, ctx);

    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.supervisorPinError).toBe('');
    Object.values(ctx).filter(v => typeof v === 'function').forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});

describe('pendingLayawayAbortAction — the one closure-valued slot', () => {
  it('stores the thunk itself rather than calling it', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const action = vi.fn();
    act(() => { result.current.requireLayawayApproval(action, false); });

    expect(result.current.pendingLayawayAbortAction).toBe(action);
    expect(action).not.toHaveBeenCalled();
    expect(result.current.showSupervisorPin).toBe(true);
    expect(result.current.pendingLayawayAbortIsFullClear).toBe(false);
  });

  it('executes the closure only after a successful verification', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    const action = vi.fn();
    act(() => { result.current.requireLayawayApproval(action, false); });
    await enterAndSubmit(result, ctx);

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.pendingLayawayAbortAction).toBeNull();
  });

  it('CHARACTERIZED: the closure targets the line captured when approval was requested', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    // Exactly the shape voidFromInvoice builds: the itemId is that handler's parameter,
    // so each request closes over its own binding and a later request cannot retarget an
    // already-queued abort.
    const queueVoid = (itemId) => result.current.requireLayawayApproval(() => ctx.applyVoid(itemId), false);
    act(() => { queueVoid('line-7'); });
    const firstThunk = result.current.pendingLayawayAbortAction;
    act(() => { queueVoid('line-99'); }); // supersedes the slot, but does not mutate the first thunk

    await enterAndSubmit(result, ctx);
    expect(ctx.applyVoid).toHaveBeenCalledTimes(1);
    expect(ctx.applyVoid).toHaveBeenCalledWith('line-99');

    // The superseded thunk still carries the line it captured at request time.
    ctx.applyVoid.mockClear();
    firstThunk();
    expect(ctx.applyVoid).toHaveBeenCalledWith('line-7');
  });

  it('a failed verification does not execute the closure and keeps it queued', async () => {
    verifyPosSupervisorPin.mockResolvedValue(false);
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    const action = vi.fn();
    act(() => { result.current.requireLayawayApproval(action, true); });
    await enterAndSubmit(result, ctx);

    expect(action).not.toHaveBeenCalled();
    expect(result.current.pendingLayawayAbortAction).toBe(action);
    expect(ctx.clearLayawayConversion).not.toHaveBeenCalled();
  });

  it('a full clear also resets the layaway conversion, after the closure has run', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const order = [];
    const ctx = makeCtx({ clearLayawayConversion: vi.fn(() => order.push('reset')) });
    const action = vi.fn(() => order.push('clearCart'));
    act(() => { result.current.requireLayawayApproval(action, true); });
    await enterAndSubmit(result, ctx);

    expect(order).toEqual(['clearCart', 'reset']);
    expect(result.current.pendingLayawayAbortIsFullClear).toBe(false);
  });

  it('a partial abort (void/remove) runs the closure but keeps the conversion active', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx();
    const action = vi.fn();
    act(() => { result.current.requireLayawayApproval(action, false); });
    await enterAndSubmit(result, ctx);

    expect(action).toHaveBeenCalledTimes(1);
    expect(ctx.clearLayawayConversion).not.toHaveBeenCalled();
  });

  it('CHARACTERIZED: Cancel does not clear the queued layaway abort', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const action = vi.fn();
    act(() => { result.current.requireLayawayApproval(action, true); });
    act(() => { result.current.cancelApproval(); });

    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.pendingLayawayAbortAction).toBe(action);
    expect(action).not.toHaveBeenCalled();
  });
});

describe('FORCE_CLOSE_SESSION — pre-flight and early return', () => {
  const forceCtx = (over = {}) => makeCtx({
    supervisorApprovalMode: 'PASSWORD',
    forceCloseReason: 'Terminal malfunction',
    forceCloseAuditAcknowledged: true,
    sessionToClose: { id: 77 },
    ...over,
  });

  const queueForceClose = (result) => act(() => {
    result.current.requestApproval({ supervisorAction: { type: 'FORCE_CLOSE_SESSION' }, resetEmail: true });
  });

  it('demands a reason and an audit acknowledgement before verifying anything', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    queueForceClose(result);

    await enterAndSubmit(result, forceCtx({ forceCloseReason: '' }), { pin: 'pw', email: 'm@shop.test' });
    expect(result.current.supervisorPinError).toBe('Please select a force close reason.');

    await enterAndSubmit(result, forceCtx({ forceCloseAuditAcknowledged: false }), { pin: 'pw', email: 'm@shop.test' });
    expect(result.current.supervisorPinError)
      .toBe('Please confirm that you understand this action will be recorded in the audit trail.');

    expect(verifySessionClosurePermission).not.toHaveBeenCalled();
  });

  it('takes the closure-permission path, never the PIN/password path', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = forceCtx();
    queueForceClose(result);
    await enterAndSubmit(result, ctx, { pin: 'pw', email: 'm@shop.test' });

    expect(verifySessionClosurePermission).toHaveBeenCalledWith(77, 'm@shop.test', 'pw');
    expect(verifySupervisorAuth).not.toHaveBeenCalled();
    expect(verifyPosSupervisorPin).not.toHaveBeenCalled();
  });

  it('writes the grant and the force-close context through the session-closure refs, then routes to the X-Report', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = forceCtx();
    queueForceClose(result);
    await enterAndSubmit(result, ctx, { pin: 'pw', email: 'm@shop.test' });

    expect(ctx.closureAuthGrantRef.current).toEqual({ sessionId: 77, token: 'grant-1' });
    expect(ctx.forceCloseContextRef.current)
      .toEqual({ sessionId: 77, reason: 'Terminal malfunction', supervisor: 'm@shop.test' });
    expect(ctx.setCurrentView).toHaveBeenCalledWith('x-report');
    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.pendingSupervisorAction).toBeNull();
    expect(result.current.supervisorPinValue).toBe('');
    expect(result.current.supervisorPinEmail).toBe('');
  });

  it('falls back to currentSession when no explicit session is targeted', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    queueForceClose(result);
    await enterAndSubmit(result, forceCtx({ sessionToClose: null }), { pin: 'pw', email: 'm@shop.test' });
    expect(verifySessionClosurePermission).toHaveBeenCalledWith(42, 'm@shop.test', 'pw');
  });

  it('a refusal surfaces the server message and leaves the refs untouched', async () => {
    verifySessionClosurePermission.mockResolvedValue({ authorized: false, message: 'Not a supervisor for this branch.' });
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = forceCtx();
    queueForceClose(result);
    await enterAndSubmit(result, ctx, { pin: 'pw', email: 'm@shop.test' });

    expect(result.current.supervisorPinError).toBe('Not a supervisor for this branch.');
    expect(ctx.closureAuthGrantRef.current).toBeNull();
    expect(ctx.setCurrentView).not.toHaveBeenCalled();
    expect(result.current.showSupervisorPin).toBe(true);
  });

  it('a thrown request surfaces the server message, then the generic fallback', async () => {
    verifySessionClosurePermission.mockRejectedValue({ response: { data: { message: 'Session already closed.' } } });
    const { result } = renderHook(() => useSupervisorApproval());
    queueForceClose(result);
    await enterAndSubmit(result, forceCtx(), { pin: 'pw', email: 'm@shop.test' });
    expect(result.current.supervisorPinError).toBe('Session already closed.');

    verifySessionClosurePermission.mockRejectedValue({});
    await enterAndSubmit(result, forceCtx(), { pin: 'pw', email: 'm@shop.test' });
    expect(result.current.supervisorPinError).toBe('Authorization failed');
  });

  it('CHARACTERIZED: the force-close branch returns early — other queued slots are never drained', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = forceCtx();
    act(() => {
      result.current.requestApproval({
        supervisorAction: { type: 'FORCE_CLOSE_SESSION' },
        voidItemId: 'line-7',
        resetEmail: true,
      });
    });
    await enterAndSubmit(result, ctx, { pin: 'pw', email: 'm@shop.test' });

    expect(ctx.applyVoid).not.toHaveBeenCalled();
    expect(result.current.pendingVoidItemId).toBe('line-7');
  });
});

describe('drain order and cleanup', () => {
  it('CHARACTERIZED ORDER: unlock → void → price override → layaway abort → supervisor action', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const order = [];
    const ctx = makeCtx({
      unlockAdvancedRange: vi.fn(() => order.push('unlock')),
      applyVoid: vi.fn(() => order.push('void')),
      updateItemPrice: vi.fn(() => order.push('price')),
      handleCloseDay: vi.fn(() => order.push('dayClose')),
    });
    const abort = vi.fn(() => order.push('layaway'));

    act(() => {
      result.current.requestApproval({
        unlockAdvancedRange: true,
        voidItemId: 'line-7',
        priceOverride: { type: 'UPDATE_PRICE', itemId: 'i1', newPrice: 1 },
        supervisorAction: { type: 'DAY_CLOSE', payload: {} },
      });
      result.current.requireLayawayApproval(abort, false);
    });
    await enterAndSubmit(result, ctx);

    expect(order).toEqual(['unlock', 'void', 'price', 'layaway', 'dayClose']);
  });

  it('closes the dialog and clears every credential field on success', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx({ supervisorApprovalMode: 'PASSWORD' });
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    await enterAndSubmit(result, ctx, { pin: 'hunter2', email: 'manager@shop.test' });

    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.supervisorPinValue).toBe('');
    expect(result.current.supervisorPinEmail).toBe('');
    expect(result.current.supervisorPinError).toBe('');
  });

  it('CHARACTERIZED: a queued continuation that throws is not guarded — it escapes the dispatcher', async () => {
    const { result } = renderHook(() => useSupervisorApproval());
    const ctx = makeCtx({ applyVoid: vi.fn(() => { throw new Error('cart blew up'); }) });
    act(() => { result.current.requestApproval({ voidItemId: 'line-7' }); });
    act(() => { result.current.setSupervisorPinValue('1234'); });

    let thrown = null;
    await act(async () => {
      await result.current.submitSupervisorApproval(ctx).catch(err => { thrown = err; });
    });

    expect(thrown?.message).toBe('cart blew up');
    // applyVoid runs BEFORE its slot is cleared, so a throw leaves the dialog closed but
    // the void still queued and the credential still typed. Documented, not fixed.
    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.pendingVoidItemId).toBe('line-7');
    expect(result.current.supervisorPinValue).toBe('1234');
  });

  it('cancelApproval clears the credential fields and the two slots it has always cleared', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    act(() => {
      result.current.requestApproval({
        voidItemId: 'line-7',
        priceOverride: { type: 'UPDATE_PRICE', itemId: 'i1', newPrice: 1 },
        supervisorAction: { type: 'DAY_CLOSE', payload: {} },
        unlockAdvancedRange: true,
      });
      result.current.setSupervisorPinEmail('manager@shop.test');
      result.current.setSupervisorPinError('Incorrect PIN. Please try again.');
    });
    act(() => { result.current.cancelApproval(); });

    expect(result.current.showSupervisorPin).toBe(false);
    expect(result.current.pendingVoidItemId).toBeNull();
    expect(result.current.pendingPriceOverride).toBeNull();
    expect(result.current.supervisorPinValue).toBe('');
    expect(result.current.supervisorPinEmail).toBe('');
    expect(result.current.supervisorPinError).toBe('');
    // CHARACTERIZED: Cancel never cleared these. Re-opening the dialog for anything else
    // and approving it will still dispatch them.
    expect(result.current.pendingSupervisorAction).toEqual({ type: 'DAY_CLOSE', payload: {} });
    expect(result.current.pendingUnlockAdvancedRange).toBe(true);
  });

  it('a stale error is cleared by the next request, not left on screen', () => {
    const { result } = renderHook(() => useSupervisorApproval());
    act(() => { result.current.setSupervisorPinError('Incorrect PIN. Please try again.'); });
    act(() => { result.current.requestApproval({ voidItemId: 'line-8' }); });
    expect(result.current.supervisorPinError).toBe('');
  });
});
