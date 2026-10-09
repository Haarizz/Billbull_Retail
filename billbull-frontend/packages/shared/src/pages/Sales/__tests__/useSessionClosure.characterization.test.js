import fs from 'node:fs';
import path from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  authorizePosVariance: vi.fn(),
  beginPosSessionClosure: vi.fn(),
  cancelPosSessionClosure: vi.fn(),
  closePosSession: vi.fn(),
  verifySessionClosurePermission: vi.fn(),
}));

import {
  authorizePosVariance,
  beginPosSessionClosure,
  cancelPosSessionClosure,
  closePosSession,
  verifySessionClosurePermission,
} from '../../../api/posApi';
import { emptyDenominations } from '../../../utils/cashDenominations';
import { useSessionClosure } from '../POS/features/session/useSessionClosure';

/**
 * CHARACTERIZATION — POS session closure workflow.
 *
 * Session Owner Verification (authorize-closure → begin-closure), the Close Session dialog,
 * the close request itself, variance approval and Cancel Closure were handlers inside
 * POSSales.jsx and therefore unreachable from any test. The Phase 3 extraction moved them
 * verbatim into useSessionClosure; sessionToClose, the four closure refs, the X-Report
 * declaration fields and the lifecycle setters are passed in, and loadXReport /
 * loadDaySummary / syncPosData are late-bound through `loadersRef`.
 *
 * Every expectation below describes CURRENT behaviour, including the quirks noted inline.
 * Sequences are recorded from the calls as they happen, not from a desired order.
 */

const CURRENT = { id: 42, status: 'OPEN', terminalId: 'TERM-01', terminalName: 'Till 1', openedBy: 'aisha', cashier: 'aisha.k' };
const OTHER = { id: 77, status: 'OPEN', terminalId: 'TERM-02', openedBy: 'omar' };

const httpErr = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let events;
const spy = (name, impl) => vi.fn((...args) => { events.push(name); return impl ? impl(...args) : undefined; });

const makeLoaders = (tag = '') => ({
  loadXReport: spy(`loadXReport${tag}`),
  loadDaySummary: spy(`loadDaySummary${tag}`),
  syncPosData: spy(`syncPosData${tag}`, () => Promise.resolve()),
});

const makeArgs = (over = {}) => ({
  currentSession: CURRENT,
  setCurrentSession: spy('setCurrentSession'),
  sessionToClose: null,
  setSessionToClose: spy('setSessionToClose'),
  closureAuthGrantRef: { current: null },
  varianceGrantRef: { current: null },
  forceCloseContextRef: { current: null },
  cashierAuthTargetRef: { current: null },
  report: {
    xReportVarianceRemarks: '',
    xReportCardBatchNo: 'BATCH-9',
    xReportCardVerified: true,
    xReportCashierName: 'Aisha Khan',
    xReportSupervisorName: '',
    xReportClosingRemarks: 'eod',
    pendingXAutoPrintRef: { current: null },
    zReportDate: '2026-09-11',
  },
  setCurrentView: spy('setCurrentView'),
  setSessionNowMs: spy('setSessionNowMs'),
  businessDayRefreshRef: { current: spy('businessDayRefresh') },
  loadersRef: { current: makeLoaders() },
  ...over,
});

const setup = (over = {}) => {
  const args = makeArgs(over);
  const view = renderHook((props) => useSessionClosure(props), { initialProps: args });
  return { args, result: view.result, rerender: view.rerender };
};

/** The body closePosSession received for its only call. */
const closeBody = () => {
  expect(closePosSession).toHaveBeenCalledTimes(1);
  return closePosSession.mock.calls[0][1];
};

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  closePosSession.mockImplementation(async (id) => { events.push('closePosSession'); return { id, status: 'CLOSED' }; });
  verifySessionClosurePermission.mockImplementation(async () => { events.push('verifySessionClosurePermission'); return { authorized: true, authorizationToken: 'owner-grant' }; });
  beginPosSessionClosure.mockImplementation(async (id) => { events.push('beginPosSessionClosure'); return { id, awaitingClosure: true }; });
  cancelPosSessionClosure.mockImplementation(async (id) => { events.push('cancelPosSessionClosure'); return { id, awaitingClosure: false }; });
  authorizePosVariance.mockImplementation(async () => { events.push('authorizePosVariance'); return { authorized: true, varianceApprovalToken: 'var-grant' }; });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('initial / default state', () => {
  it('starts with every dialog closed, empty credentials and a zeroed closing count', () => {
    const { result } = setup();
    const r = result.current;
    expect(r.showCloseSessionDialog).toBe(false);
    expect(r.showCashierAuthDialog).toBe(false);
    expect(r.showCancelClosureDialog).toBe(false);
    expect(r.showSessionOwnerRequiredDialog).toBe(false);
    expect(r.closeSessionError).toBe('');
    expect(r.closeSessionTab).toBe('cash');
    expect(r.closingDenominations).toEqual(emptyDenominations());
    expect(r.cardSettlementAmount).toBe('');
    expect(r.varianceApproval).toBeNull();
    expect(r.varianceApprovalBusy).toBe(false);
    expect(r.varianceApprovalError).toBe('');
    expect(r.varianceSupervisorUser).toBe('');
    expect(r.varianceSupervisorPassword).toBe('');
    expect(r.varianceApprovalReason).toBe('');
    expect(r.closureAction).toBeNull();
    expect(r.forceCloseReason).toBe('');
    expect(r.forceCloseAuditAcknowledged).toBe(false);
    expect(r.cashierAuthUsername).toBe('');
    expect(r.cashierAuthPassword).toBe('');
    expect(r.cashierAuthError).toBe('');
    expect(r.cashierAuthLoading).toBe(false);
    expect(r.cancelClosureUsername).toBe('');
    expect(r.cancelClosurePassword).toBe('');
    expect(r.cancelClosureReason).toBe('');
    expect(r.cancelClosureError).toBe('');
    expect(r.cancelClosureLoading).toBe(false);
  });

  it('makes no API call and touches no loader on mount', () => {
    const { args } = setup();
    expect(events).toEqual([]);
    expect(args.loadersRef.current.loadXReport).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('normal close entry — handleDayCloseNormalClose', () => {
  it.each(['OPEN', 'active', 'SUSPENDED'])('opens Session Owner Verification for a %s session', (status) => {
    const target = { ...OTHER, status };
    const { args, result } = setup();
    args.closureAuthGrantRef.current = { sessionId: 1, token: 'stale' };
    args.forceCloseContextRef.current = { sessionId: 1, reason: 'stale' };
    act(() => { result.current.setCashierAuthPassword('left-over'); result.current.setCashierAuthError('old'); });

    act(() => { result.current.handleDayCloseNormalClose(target); });

    expect(result.current.showCashierAuthDialog).toBe(true);
    expect(args.closureAuthGrantRef.current).toBeNull();
    expect(args.forceCloseContextRef.current).toBeNull();
    expect(args.cashierAuthTargetRef.current).toBe(target);
    expect(args.setSessionToClose).toHaveBeenCalledWith(target);
    // Prefilled with the session's owner (openedBy, since this target has no `cashier`).
    expect(result.current.cashierAuthUsername).toBe('omar');
    expect(result.current.cashierAuthPassword).toBe('');
    expect(result.current.cashierAuthError).toBe('');
  });

  it('prefers `cashier` over `openedBy` for the prefill', () => {
    const { result } = setup();
    act(() => { result.current.handleDayCloseNormalClose(CURRENT); });
    expect(result.current.cashierAuthUsername).toBe('aisha.k');
  });

  it.each(['CLOSED', undefined])('does nothing for a %s session', (status) => {
    const { args, result } = setup({ currentSession: { ...CURRENT, status } });
    act(() => { result.current.handleDayCloseNormalClose(); });
    expect(result.current.showCashierAuthDialog).toBe(false);
    expect(args.cashierAuthTargetRef.current).toBeNull();
    expect(args.setSessionToClose).not.toHaveBeenCalled();
  });

  it('ignores a SyntheticEvent argument and falls back to sessionToClose, without re-setting it', () => {
    const { args, result } = setup({ sessionToClose: OTHER });
    act(() => { result.current.handleDayCloseNormalClose({ nativeEvent: {}, target: {} }); });
    expect(args.cashierAuthTargetRef.current).toBe(OTHER);
    expect(args.setSessionToClose).not.toHaveBeenCalled();
    expect(result.current.showCashierAuthDialog).toBe(true);
  });

  it('falls back to currentSession when there is no explicit target and no sessionToClose', () => {
    const { args, result } = setup();
    act(() => { result.current.handleDayCloseNormalClose(null); });
    expect(args.cashierAuthTargetRef.current).toBe(CURRENT);
  });
});

describe('Trading-Period-Ended close — handleTradingEndedCloseSession', () => {
  it('ignores an entry with no sessionId', () => {
    const { args, result } = setup();
    act(() => { result.current.handleTradingEndedCloseSession({ terminalId: 'X' }); });
    act(() => { result.current.handleTradingEndedCloseSession(null); });
    expect(result.current.closureAction).toBeNull();
    expect(args.setSessionToClose).not.toHaveBeenCalled();
  });

  it('normalises the wire DTO and enters the single normal-close path', () => {
    const { args, result } = setup();
    const pending = {
      sessionId: 91, terminalId: 'TERM-09', terminalName: 'Till 9', counterName: 'C9',
      openedBy: 'lina', openedAt: '2026-09-10T08:00:00', extra: 'dropped',
    };
    act(() => { result.current.handleTradingEndedCloseSession(pending); });

    const expected = {
      id: 91, status: 'OPEN', terminalId: 'TERM-09', terminalName: 'Till 9', counterName: 'C9',
      openedBy: 'lina', cashier: 'lina', openedAt: '2026-09-10T08:00:00',
    };
    expect(result.current.closureAction).toBe('NORMAL_CLOSE');
    // Quirk preserved: setSessionToClose runs twice with the same target — once here and
    // once inside handleDayCloseNormalClose's explicit-target branch.
    expect(args.setSessionToClose).toHaveBeenCalledTimes(2);
    expect(args.setSessionToClose.mock.calls[0][0]).toEqual(expected);
    expect(args.setSessionToClose.mock.calls[1][0]).toBe(args.setSessionToClose.mock.calls[0][0]);
    expect(args.cashierAuthTargetRef.current).toEqual(expected);
    expect(result.current.showCashierAuthDialog).toBe(true);
    expect(result.current.cashierAuthUsername).toBe('lina');
  });

  it('keeps a non-OPEN status from the DTO, which then does not open verification', () => {
    const { result } = setup();
    act(() => { result.current.handleTradingEndedCloseSession({ sessionId: 5, status: 'CLOSED' }); });
    expect(result.current.closureAction).toBe('NORMAL_CLOSE');
    expect(result.current.showCashierAuthDialog).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('cashier / closure authentication — handleCashierAuthSubmit', () => {
  const openFor = (result, target) => act(() => { result.current.handleDayCloseNormalClose(target); });
  const typeCreds = (result, user = 'aisha', pass = 'pw') => act(() => {
    result.current.setCashierAuthUsername(user);
    result.current.setCashierAuthPassword(pass);
  });
  const submit = (result) => act(async () => { await result.current.handleCashierAuthSubmit(); });

  it('requires both username and password, without calling the server', async () => {
    const { result } = setup();
    openFor(result, CURRENT);
    typeCreds(result, 'aisha', '');
    await submit(result);
    expect(result.current.cashierAuthError).toBe('Please enter email/username and password');
    expect(verifySessionClosurePermission).not.toHaveBeenCalled();
    expect(result.current.cashierAuthLoading).toBe(false);
  });

  it('verifies, begins the closure with the grant, merges the session and lands on the X-Report', async () => {
    const { args, result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    // Opening with an explicit target already recorded setSessionToClose; sequence the submit only.
    events.length = 0;
    await submit(result);

    expect(verifySessionClosurePermission).toHaveBeenCalledWith(42, 'aisha', 'pw');
    expect(beginPosSessionClosure).toHaveBeenCalledWith(42, { closureAuthToken: 'owner-grant' });
    expect(events).toEqual([
      'verifySessionClosurePermission', 'beginPosSessionClosure', 'setCurrentSession', 'setCurrentView',
    ]);
    // Grant kept for the close call to spend.
    expect(args.closureAuthGrantRef.current).toEqual({ sessionId: 42, token: 'owner-grant' });
    // Functional merge, only onto the matching session.
    const updater = args.setCurrentSession.mock.calls[0][0];
    expect(updater({ id: 42, status: 'OPEN', x: 1 })).toEqual({ id: 42, status: 'OPEN', x: 1, awaitingClosure: true });
    const unrelated = { id: 9 };
    expect(updater(unrelated)).toBe(unrelated);
    expect(updater(null)).toBeNull();

    expect(args.setCurrentView).toHaveBeenCalledWith('x-report');
    expect(result.current.showCashierAuthDialog).toBe(false);
    expect(args.cashierAuthTargetRef.current).toBeNull();
    expect(result.current.cashierAuthUsername).toBe('');
    expect(result.current.cashierAuthPassword).toBe('');
    expect(result.current.cashierAuthLoading).toBe(false);
  });

  it('targets cashierAuthTargetRef over sessionToClose over currentSession', async () => {
    const { args, result } = setup({ sessionToClose: OTHER });
    typeCreds(result);
    args.cashierAuthTargetRef.current = { id: 500, status: 'OPEN' };
    await submit(result);
    expect(verifySessionClosurePermission.mock.calls[0][0]).toBe(500);

    // A successful submit clears the typed credentials, so they are entered again.
    vi.clearAllMocks();
    args.cashierAuthTargetRef.current = null;
    typeCreds(result);
    await submit(result);
    expect(verifySessionClosurePermission.mock.calls[0][0]).toBe(77);
  });

  it('stores a null grant when the server authorizes without a token, and still begins closure', async () => {
    verifySessionClosurePermission.mockResolvedValueOnce({ authorized: true });
    const { args, result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    await submit(result);
    expect(args.closureAuthGrantRef.current).toBeNull();
    expect(beginPosSessionClosure).toHaveBeenCalledWith(42, { closureAuthToken: undefined });
  });

  it('stays in the dialog with the server reason when begin-closure is refused (e.g. Business Day block)', async () => {
    beginPosSessionClosure.mockRejectedValueOnce(httpErr(409, { message: 'PREVIOUS_DAY_SESSION_OPEN: close it first' }));
    const { args, result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    await submit(result);

    expect(result.current.cashierAuthError).toBe('PREVIOUS_DAY_SESSION_OPEN: close it first');
    expect(result.current.showCashierAuthDialog).toBe(true);
    expect(args.setCurrentView).not.toHaveBeenCalled();
    expect(args.setCurrentSession).not.toHaveBeenCalled();
    // Quirk preserved: the verified grant and the target are NOT cleared on this path.
    expect(args.closureAuthGrantRef.current).toEqual({ sessionId: 42, token: 'owner-grant' });
    expect(args.cashierAuthTargetRef.current).toBe(CURRENT);
    expect(result.current.cashierAuthPassword).toBe('pw');
    expect(result.current.cashierAuthLoading).toBe(false);
  });

  it.each([
    ['server message', httpErr(403, { message: 'Not OPEN' }), 'Not OPEN'],
    ['error message', new Error('network down'), 'network down'],
    ['fallback', Object.assign(new Error(''), { message: '' }), 'Could not start the closure workflow for this session.'],
  ])('begin-closure refusal message: %s', async (_l, err, expected) => {
    beginPosSessionClosure.mockRejectedValueOnce(err);
    const { result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    await submit(result);
    expect(result.current.cashierAuthError).toBe(expected);
  });

  it('shows the refusal when the owner is not authorized, without beginning closure', async () => {
    verifySessionClosurePermission.mockResolvedValueOnce({ authorized: false, message: 'Wrong owner' });
    const { args, result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    await submit(result);
    expect(result.current.cashierAuthError).toBe('Wrong owner');
    expect(beginPosSessionClosure).not.toHaveBeenCalled();
    expect(args.closureAuthGrantRef.current).toBeNull();

    verifySessionClosurePermission.mockResolvedValueOnce({ authorized: false });
    await submit(result);
    expect(result.current.cashierAuthError).toBe('Not authorized to close this session');
  });

  it.each([
    ['server message', httpErr(401, { message: 'Bad credentials' }), 'Bad credentials'],
    ['error message', new Error('timeout'), 'timeout'],
    ['fallback', Object.assign(new Error(''), { message: '' }), 'Authorization failed'],
  ])('verification failure message: %s', async (_l, err, expected) => {
    verifySessionClosurePermission.mockRejectedValueOnce(err);
    const { result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    await submit(result);
    expect(result.current.cashierAuthError).toBe(expected);
    expect(result.current.cashierAuthLoading).toBe(false);
  });

  it('shows loading while verification is in flight', async () => {
    const d = deferred();
    verifySessionClosurePermission.mockReturnValueOnce(d.promise);
    const { result } = setup();
    openFor(result, CURRENT);
    typeCreds(result);
    let pending;
    act(() => { pending = result.current.handleCashierAuthSubmit(); });
    expect(result.current.cashierAuthLoading).toBe(true);
    await act(async () => { d.resolve({ authorized: false }); await pending; });
    expect(result.current.cashierAuthLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('opening the Close Session dialog — proceedToCloseSessionDialog', () => {
  it('clears the error and card settlement, opens the dialog and loads the X-Report', () => {
    const { args, result } = setup();
    act(() => { result.current.setCloseSessionError('old'); result.current.setCardSettlementAmount('12'); });
    act(() => { result.current.proceedToCloseSessionDialog(); });
    expect(result.current.closeSessionError).toBe('');
    expect(result.current.cardSettlementAmount).toBe('');
    expect(result.current.showCloseSessionDialog).toBe(true);
    expect(args.loadersRef.current.loadXReport).toHaveBeenCalledTimes(1);
    expect(args.loadersRef.current.loadXReport).toHaveBeenCalledWith();
  });

  it('does not reset the counted denominations or the tab', () => {
    const { result } = setup();
    act(() => {
      result.current.setClosingDenominations({ ...emptyDenominations(), 100: 3 });
      result.current.setCloseSessionTab('card');
    });
    act(() => { result.current.proceedToCloseSessionDialog(); });
    expect(result.current.closingDenominations['100']).toBe(3);
    expect(result.current.closeSessionTab).toBe('card');
  });

  it('reads the loader parked on the ref at call time', () => {
    const { args, result } = setup();
    const late = makeLoaders('-late');
    args.loadersRef.current = late;
    act(() => { result.current.proceedToCloseSessionDialog(); });
    expect(late.loadXReport).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('close-session API invocation — handleCloseSession', () => {
  const close = (result) => act(async () => { await result.current.handleCloseSession(); });

  it('does nothing without a target', async () => {
    const { args, result } = setup({ currentSession: null });
    await close(result);
    expect(events).toEqual([]);
    expect(args.setCurrentView).not.toHaveBeenCalled();
  });

  it('sends the exact close payload for a normal close', async () => {
    const { args, result } = setup();
    const counted = { ...emptyDenominations(), 500: 2, 1: 7 };
    act(() => { result.current.setClosingDenominations(counted); result.current.setCardSettlementAmount('250.75'); });
    args.closureAuthGrantRef.current = { sessionId: 42, token: 'owner-grant' };
    await close(result);

    expect(closePosSession.mock.calls[0][0]).toBe(42);
    expect(closeBody()).toEqual({
      closingDenominations: counted,
      notes: '',
      cardBatchNo: 'BATCH-9',
      cardSettlementVerified: true,
      cardClosingCash: 250.75,
      closingCashierName: 'Aisha Khan',
      closingSupervisorName: null,
      closingRemarks: 'eod',
      closureAuthToken: 'owner-grant',
      varianceApprovalToken: undefined,
    });
  });

  it.each([
    ['empty', '', null],
    ['decimal', '12.5', 12.5],
    ['non-numeric', 'abc', 0],
    ['zero', '0', 0],
  ])('card settlement amount %s → cardClosingCash', async (_l, typed, expected) => {
    const { result } = setup();
    act(() => { result.current.setCardSettlementAmount(typed); });
    await close(result);
    expect(closeBody().cardClosingCash).toBe(expected);
  });

  it('sends closure/variance tokens only when they were issued for THIS session', async () => {
    const { args, result } = setup();
    args.closureAuthGrantRef.current = { sessionId: 77, token: 'other-owner' };
    args.varianceGrantRef.current = { sessionId: 77, token: 'other-var' };
    await close(result);
    expect(closeBody().closureAuthToken).toBeUndefined();
    expect(closeBody().varianceApprovalToken).toBeUndefined();
  });

  it('sends the variance grant for the matching session', async () => {
    const { args, result } = setup();
    args.varianceGrantRef.current = { sessionId: 42, token: 'var-grant' };
    await close(result);
    expect(closeBody().varianceApprovalToken).toBe('var-grant');
  });

  it('targets sessionToClose over currentSession', async () => {
    const { result } = setup({ sessionToClose: OTHER });
    await close(result);
    expect(closePosSession.mock.calls[0][0]).toBe(77);
  });

  it('uses the declaration supervisor name when one was typed', async () => {
    const args = makeArgs();
    args.report = { ...args.report, xReportSupervisorName: 'Mona' };
    args.forceCloseContextRef.current = { sessionId: 42, reason: 'Shift abandoned', supervisor: 'sup@shop' };
    const { result } = renderHook((p) => useSessionClosure(p), { initialProps: args });
    await close(result);
    expect(closeBody().closingSupervisorName).toBe('Mona');
  });

  describe('force close continuation', () => {
    it('prefixes the reason onto the variance remarks and records the verifying supervisor', async () => {
      const args = makeArgs();
      args.report = { ...args.report, xReportVarianceRemarks: 'short 5' };
      args.forceCloseContextRef.current = { sessionId: 42, reason: 'Cashier unavailable', supervisor: 'sup@shop' };
      args.closureAuthGrantRef.current = { sessionId: 42, token: 'sup-grant' };
      const { result } = renderHook((p) => useSessionClosure(p), { initialProps: args });
      await close(result);
      expect(closeBody().notes).toBe('Force Close: Cashier unavailable — short 5');
      expect(closeBody().closingSupervisorName).toBe('sup@shop');
      expect(closeBody().closureAuthToken).toBe('sup-grant');
    });

    it('omits the separator when there are no variance remarks', async () => {
      const { args, result } = setup();
      args.forceCloseContextRef.current = { sessionId: 42, reason: 'Till fault', supervisor: 'sup@shop' };
      await close(result);
      expect(closeBody().notes).toBe('Force Close: Till fault');
    });

    it('ignores a force-close context recorded for a different session', async () => {
      const args = makeArgs();
      args.report = { ...args.report, xReportVarianceRemarks: 'r' };
      args.forceCloseContextRef.current = { sessionId: 77, reason: 'Other', supervisor: 'sup@shop' };
      const { result } = renderHook((p) => useSessionClosure(p), { initialProps: args });
      await close(result);
      expect(closeBody().notes).toBe('r');
      expect(closeBody().closingSupervisorName).toBeNull();
    });
  });

  describe('success — close/report sequencing', () => {
    it('current session: adopts the closed session, arms X-Report auto-print, resets and lands on the X-Report', async () => {
      const { args, result } = setup();
      args.closureAuthGrantRef.current = { sessionId: 42, token: 'owner-grant' };
      args.forceCloseContextRef.current = { sessionId: 42, reason: 'x', supervisor: 's' };
      args.varianceGrantRef.current = { sessionId: 42, token: 'v' };
      act(() => {
        result.current.setShowCloseSessionDialog(true);
        result.current.setVarianceSupervisorUser('sup');
        result.current.setVarianceSupervisorPassword('pw');
        result.current.setVarianceApprovalReason('miscount');
      });
      await close(result);

      expect(events).toEqual([
        'closePosSession', 'setCurrentSession', 'setSessionToClose', 'setSessionNowMs',
        'businessDayRefresh', 'setCurrentView', 'syncPosData',
      ]);
      expect(args.setCurrentSession).toHaveBeenCalledWith({ id: 42, status: 'CLOSED' });
      expect(args.report.pendingXAutoPrintRef.current).toBe(42);
      expect(args.closureAuthGrantRef.current).toBeNull();
      expect(args.forceCloseContextRef.current).toBeNull();
      expect(args.varianceGrantRef.current).toBeNull();
      expect(args.setSessionToClose).toHaveBeenCalledWith(null);
      expect(args.setCurrentView).toHaveBeenCalledWith('x-report');
      expect(args.loadersRef.current.loadDaySummary).not.toHaveBeenCalled();
      expect(result.current.showCloseSessionDialog).toBe(false);
      expect(result.current.varianceApproval).toBeNull();
      expect(result.current.varianceSupervisorUser).toBe('');
      expect(result.current.varianceSupervisorPassword).toBe('');
      expect(result.current.varianceApprovalReason).toBe('');
    });

    it("another terminal's session: no adoption, no auto-print, reloads the Day Close summary and goes to the Z-Report", async () => {
      const { args, result } = setup({ sessionToClose: OTHER });
      await close(result);
      expect(events).toEqual([
        'closePosSession', 'setSessionToClose', 'setSessionNowMs', 'businessDayRefresh',
        'loadDaySummary', 'setCurrentView', 'syncPosData',
      ]);
      expect(args.setCurrentSession).not.toHaveBeenCalled();
      expect(args.report.pendingXAutoPrintRef.current).toBeNull();
      expect(args.loadersRef.current.loadDaySummary).toHaveBeenCalledWith('2026-09-11');
      expect(args.setCurrentView).toHaveBeenCalledWith('z-report');
    });

    it('does not clear the counted denominations or the card settlement amount', async () => {
      const { result } = setup();
      act(() => { result.current.setClosingDenominations({ ...emptyDenominations(), 50: 4 }); result.current.setCardSettlementAmount('9'); });
      await close(result);
      expect(result.current.closingDenominations['50']).toBe(4);
      expect(result.current.cardSettlementAmount).toBe('9');
    });

    it('tolerates an unset Business Day refresh ref', async () => {
      const { args, result } = setup({ businessDayRefreshRef: { current: null } });
      await close(result);
      expect(args.setCurrentView).toHaveBeenCalledWith('x-report');
    });

    it('fires syncPosData without awaiting it (background finalization)', async () => {
      const never = new Promise(() => {});
      const loaders = makeLoaders();
      loaders.syncPosData.mockImplementation(() => { events.push('syncPosData'); return never; });
      const { result } = setup({ loadersRef: { current: loaders } });
      let settled = false;
      await act(async () => { await result.current.handleCloseSession().then(() => { settled = true; }); });
      expect(settled).toBe(true);
      expect(loaders.syncPosData).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-numeric session id', () => {
    it('makes no API call and marks the current session CLOSED locally before the success path', async () => {
      const local = { ...CURRENT, id: 'SES-1700000000' };
      const { args, result } = setup({ currentSession: local });
      await close(result);
      expect(closePosSession).not.toHaveBeenCalled();
      expect(args.setCurrentSession).toHaveBeenCalledWith({ ...local, status: 'CLOSED' });
      expect(args.report.pendingXAutoPrintRef.current).toBeNull();
      expect(args.setCurrentView).toHaveBeenCalledWith('x-report');
      expect(args.loadersRef.current.syncPosData).toHaveBeenCalledTimes(1);
    });
  });

  describe('already CLOSED target', () => {
    it('current session: closes the dialog and shows its X-Report without calling the server', async () => {
      const { args, result } = setup({ currentSession: { ...CURRENT, status: 'CLOSED' } });
      act(() => { result.current.setShowCloseSessionDialog(true); });
      await close(result);
      expect(closePosSession).not.toHaveBeenCalled();
      expect(result.current.showCloseSessionDialog).toBe(false);
      expect(events).toEqual(['setSessionToClose', 'setCurrentView']);
      expect(args.setCurrentView).toHaveBeenCalledWith('x-report');
      expect(args.loadersRef.current.syncPosData).not.toHaveBeenCalled();
      expect(args.businessDayRefreshRef.current).not.toHaveBeenCalled();
    });

    it('other session: reloads the Day Close summary and stays on the current view', async () => {
      const { args, result } = setup({ sessionToClose: { ...OTHER, status: 'CLOSED' } });
      await close(result);
      expect(events).toEqual(['setSessionToClose', 'loadDaySummary']);
      expect(args.loadersRef.current.loadDaySummary).toHaveBeenCalledWith('2026-09-11');
      expect(args.setCurrentView).not.toHaveBeenCalled();
    });
  });

  describe('closure errors', () => {
    it('switches to the variance approval panel on VARIANCE_APPROVAL_REQUIRED and stays in the dialog', async () => {
      const refusal = { code: 'VARIANCE_APPROVAL_REQUIRED', message: 'Over threshold', expectedCash: 500, countedCash: 450, varianceAmount: 50, threshold: 10 };
      closePosSession.mockRejectedValueOnce(httpErr(409, refusal));
      const { args, result } = setup();
      args.varianceGrantRef.current = { sessionId: 42, token: 'spent' };
      args.closureAuthGrantRef.current = { sessionId: 42, token: 'owner-grant' };
      act(() => { result.current.setShowCloseSessionDialog(true); result.current.setVarianceApprovalError('old'); });
      await close(result);

      expect(result.current.varianceApproval).toEqual(refusal);
      expect(result.current.varianceApprovalError).toBe('');
      expect(result.current.closeSessionError).toBe('');
      expect(result.current.showCloseSessionDialog).toBe(true);
      expect(args.varianceGrantRef.current).toBeNull();
      // Quirk preserved: the owner grant survives a refused close, so the retry can spend it.
      expect(args.closureAuthGrantRef.current).toEqual({ sessionId: 42, token: 'owner-grant' });
      expect(args.setCurrentView).not.toHaveBeenCalled();
      expect(args.setSessionToClose).not.toHaveBeenCalled();
      expect(args.loadersRef.current.syncPosData).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('Close session API error', expect.any(Error));
    });

    it.each([
      ['data.message', httpErr(400, { message: 'Invalid denomination 3' }), 'Invalid denomination 3'],
      ['data.error', httpErr(500, { error: 'Internal Server Error' }), 'Internal Server Error'],
      ['err.message', new Error('Network Error'), 'Network Error'],
      ['non-string message', httpErr(400, { message: { detail: 'x' } }), 'Failed to close the session. Please try again.'],
      ['fallback', Object.assign(new Error(''), { message: '' }), 'Failed to close the session. Please try again.'],
    ])('shows %s and leaves the session open', async (_l, err, expected) => {
      closePosSession.mockRejectedValueOnce(err);
      const { args, result } = setup();
      act(() => { result.current.setShowCloseSessionDialog(true); });
      await close(result);
      expect(result.current.closeSessionError).toBe(expected);
      expect(result.current.showCloseSessionDialog).toBe(true);
      expect(result.current.varianceApproval).toBeNull();
      expect(args.setCurrentSession).not.toHaveBeenCalled();
      expect(args.report.pendingXAutoPrintRef.current).toBeNull();
      expect(args.setCurrentView).not.toHaveBeenCalled();
    });

    it('clears a previous close error when a retry starts', async () => {
      closePosSession.mockRejectedValueOnce(httpErr(400, { message: 'first' }));
      const { result } = setup();
      await close(result);
      expect(result.current.closeSessionError).toBe('first');
      const d = deferred();
      closePosSession.mockReturnValueOnce(d.promise);
      let pending;
      act(() => { pending = result.current.handleCloseSession(); });
      expect(result.current.closeSessionError).toBe('');
      await act(async () => { d.resolve({ id: 42, status: 'CLOSED' }); await pending; });
    });
  });

  it('uses the loaders snapshotted when the close began, not ones parked during the request', async () => {
    const d = deferred();
    closePosSession.mockReturnValueOnce(d.promise);
    const { args, result } = setup({ sessionToClose: OTHER });
    const original = args.loadersRef.current;
    let pending;
    act(() => { pending = result.current.handleCloseSession(); });
    const late = makeLoaders('-late');
    args.loadersRef.current = late;
    await act(async () => { d.resolve({ id: 77, status: 'CLOSED' }); await pending; });
    expect(original.loadDaySummary).toHaveBeenCalledTimes(1);
    expect(original.syncPosData).toHaveBeenCalledTimes(1);
    expect(late.loadDaySummary).not.toHaveBeenCalled();
    expect(late.syncPosData).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('variance authorization — handleAuthorizeVariance', () => {
  const REFUSAL = { code: 'VARIANCE_APPROVAL_REQUIRED', message: 'Over threshold', expectedCash: 500, countedCash: 450 };

  /** Reach the approval panel the way the product does: a refused close. */
  const refuseFirstClose = async (result) => {
    closePosSession.mockRejectedValueOnce(httpErr(409, REFUSAL));
    await act(async () => { await result.current.handleCloseSession(); });
    expect(result.current.varianceApproval).toEqual(REFUSAL);
    vi.clearAllMocks();
    closePosSession.mockImplementation(async (id) => { events.push('closePosSession'); return { id, status: 'CLOSED' }; });
    authorizePosVariance.mockImplementation(async () => { events.push('authorizePosVariance'); return { authorized: true, varianceApprovalToken: 'var-grant' }; });
    events.length = 0;
  };
  const fill = (result, { user = 'sup', pass = 'pw', reason = '  miscount  ' } = {}) => act(() => {
    result.current.setVarianceSupervisorUser(user);
    result.current.setVarianceSupervisorPassword(pass);
    result.current.setVarianceApprovalReason(reason);
  });
  const authorize = (result) => act(async () => { await result.current.handleAuthorizeVariance(); });

  it('does nothing when no variance was refused', async () => {
    const { result } = setup();
    fill(result);
    await authorize(result);
    expect(authorizePosVariance).not.toHaveBeenCalled();
    expect(result.current.varianceApprovalError).toBe('');
  });

  it('does nothing when there is no target session id', async () => {
    const { result } = setup({ currentSession: { status: 'OPEN' } });
    act(() => { result.current.setVarianceApproval(REFUSAL); });
    fill(result);
    await authorize(result);
    expect(authorizePosVariance).not.toHaveBeenCalled();
  });

  it.each([
    ['no user', { user: '' }],
    ['no password', { pass: '' }],
  ])('requires supervisor credentials (%s)', async (_l, creds) => {
    const { result } = setup();
    await refuseFirstClose(result);
    fill(result, creds);
    await authorize(result);
    expect(result.current.varianceApprovalError).toBe('Enter the supervisor username and password.');
    expect(authorizePosVariance).not.toHaveBeenCalled();
  });

  it('requires a non-blank reason', async () => {
    const { result } = setup();
    await refuseFirstClose(result);
    fill(result, { reason: '   ' });
    await authorize(result);
    expect(result.current.varianceApprovalError).toBe('A reason is required to authorize a cash variance.');
    expect(authorizePosVariance).not.toHaveBeenCalled();
  });

  it('sends credentials, the trimmed reason and the counted denominations — no figures', async () => {
    const { result } = setup();
    const counted = { ...emptyDenominations(), 200: 2, 50: 1 };
    act(() => { result.current.setClosingDenominations(counted); });
    await refuseFirstClose(result);
    fill(result);
    await authorize(result);
    expect(authorizePosVariance).toHaveBeenCalledWith(42, {
      usernameOrEmail: 'sup', password: 'pw', reason: 'miscount', closingDenominations: counted,
    });
  });

  it('on authorization: stores the grant, drops credentials, then retries the close with the grant', async () => {
    const { args, result } = setup();
    await refuseFirstClose(result);
    fill(result);
    await authorize(result);

    expect(events).toEqual([
      'authorizePosVariance', 'closePosSession', 'setCurrentSession', 'setSessionToClose',
      'setSessionNowMs', 'businessDayRefresh', 'setCurrentView', 'syncPosData',
    ]);
    expect(closeBody().varianceApprovalToken).toBe('var-grant');
    // Consumed by the successful close.
    expect(args.varianceGrantRef.current).toBeNull();
    expect(result.current.varianceApproval).toBeNull();
    expect(result.current.varianceSupervisorUser).toBe('');
    expect(result.current.varianceSupervisorPassword).toBe('');
    expect(result.current.varianceApprovalBusy).toBe(false);
    expect(args.setCurrentView).toHaveBeenCalledWith('x-report');
  });

  it('keeps the grant for the retry even when the chained close is refused again', async () => {
    const { args, result } = setup();
    await refuseFirstClose(result);
    closePosSession.mockRejectedValueOnce(httpErr(400, { message: 'Recount required' }));
    fill(result);
    await authorize(result);
    expect(result.current.closeSessionError).toBe('Recount required');
    expect(args.varianceGrantRef.current).toEqual({ sessionId: 42, token: 'var-grant' });
    expect(result.current.varianceApprovalError).toBe('');
    expect(result.current.varianceApprovalBusy).toBe(false);
  });

  it('stores a null grant when authorized without a token', async () => {
    const { args, result } = setup();
    await refuseFirstClose(result);
    authorizePosVariance.mockResolvedValueOnce({ authorized: true });
    closePosSession.mockRejectedValueOnce(httpErr(400, { message: 'still refused' }));
    fill(result);
    await authorize(result);
    expect(args.varianceGrantRef.current).toBeNull();
    expect(closeBody().varianceApprovalToken).toBeUndefined();
  });

  it('leaves the session open and the panel up when authorization is refused', async () => {
    const { result } = setup();
    await refuseFirstClose(result);
    authorizePosVariance.mockResolvedValueOnce({ authorized: false, message: 'Supervisor lacks POS approval' });
    fill(result);
    await authorize(result);
    expect(result.current.varianceApprovalError).toBe('Supervisor lacks POS approval');
    expect(result.current.varianceApproval).toEqual(REFUSAL);
    expect(closePosSession).not.toHaveBeenCalled();
    // Credentials are only dropped on success.
    expect(result.current.varianceSupervisorPassword).toBe('pw');

    authorizePosVariance.mockResolvedValueOnce(null);
    await authorize(result);
    expect(result.current.varianceApprovalError).toBe('Authorization was refused.');
  });

  it.each([
    ['server message', httpErr(401, { message: 'Bad supervisor password' }), 'Bad supervisor password'],
    ['error message', new Error('offline'), 'offline'],
    ['fallback', Object.assign(new Error(''), { message: '' }), 'Authorization failed. Please try again.'],
  ])('authorization request failure: %s', async (_l, err, expected) => {
    const { result } = setup();
    await refuseFirstClose(result);
    authorizePosVariance.mockRejectedValueOnce(err);
    fill(result);
    await authorize(result);
    expect(result.current.varianceApprovalError).toBe(expected);
    expect(result.current.varianceApprovalBusy).toBe(false);
    expect(closePosSession).not.toHaveBeenCalled();
  });

  it('is busy while the authorization request is in flight', async () => {
    const { result } = setup();
    await refuseFirstClose(result);
    const d = deferred();
    authorizePosVariance.mockReturnValueOnce(d.promise);
    fill(result);
    let pending;
    act(() => { pending = result.current.handleAuthorizeVariance(); });
    expect(result.current.varianceApprovalBusy).toBe(true);
    expect(result.current.varianceApprovalError).toBe('');
    await act(async () => { d.resolve({ authorized: false }); await pending; });
    expect(result.current.varianceApprovalBusy).toBe(false);
  });

  it('chains into a close that uses the loaders snapshotted when authorization began', async () => {
    const { args, result } = setup({ sessionToClose: OTHER });
    await refuseFirstClose(result);
    const original = args.loadersRef.current;
    const d = deferred();
    authorizePosVariance.mockReturnValueOnce(d.promise);
    fill(result);
    let pending;
    act(() => { pending = result.current.handleAuthorizeVariance(); });
    const late = makeLoaders('-late');
    args.loadersRef.current = late;
    await act(async () => { d.resolve({ authorized: true, varianceApprovalToken: 't' }); await pending; });
    expect(original.loadDaySummary).toHaveBeenCalledWith('2026-09-11');
    expect(original.syncPosData).toHaveBeenCalledTimes(1);
    expect(late.syncPosData).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('cancel closure', () => {
  it('opening the dialog clears every credential field', () => {
    const { result } = setup();
    act(() => {
      result.current.setCancelClosureUsername('u');
      result.current.setCancelClosurePassword('p');
      result.current.setCancelClosureReason('r');
    });
    act(() => { result.current.openCancelClosureDialog(); });
    expect(result.current.showCancelClosureDialog).toBe(true);
    expect(result.current.cancelClosureUsername).toBe('');
    expect(result.current.cancelClosurePassword).toBe('');
    expect(result.current.cancelClosureReason).toBe('');
    expect(result.current.cancelClosureError).toBe('');
  });

  it('does nothing without a current session id — it never targets sessionToClose', async () => {
    const { result } = setup({ currentSession: null, sessionToClose: OTHER });
    await act(async () => { await result.current.handleCancelClosureSubmit(); });
    expect(cancelPosSessionClosure).not.toHaveBeenCalled();
  });

  it('sends blank fields as undefined', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handleCancelClosureSubmit(); });
    expect(cancelPosSessionClosure).toHaveBeenCalledWith(42, { reason: undefined, usernameOrEmail: undefined, password: undefined });
  });

  it('cancels with supervisor credentials, merges the session and closes the dialog', async () => {
    const { args, result } = setup({ sessionToClose: OTHER });
    act(() => { result.current.openCancelClosureDialog(); });
    act(() => {
      result.current.setCancelClosureUsername('sup');
      result.current.setCancelClosurePassword('pw');
      result.current.setCancelClosureReason('opened by mistake');
    });
    await act(async () => { await result.current.handleCancelClosureSubmit(); });

    expect(cancelPosSessionClosure).toHaveBeenCalledWith(42, { reason: 'opened by mistake', usernameOrEmail: 'sup', password: 'pw' });
    const updater = args.setCurrentSession.mock.calls[0][0];
    expect(updater({ id: 42, awaitingClosure: true, status: 'OPEN' })).toEqual({ id: 42, awaitingClosure: false, status: 'OPEN' });
    const other = { id: 1 };
    expect(updater(other)).toBe(other);
    expect(result.current.showCancelClosureDialog).toBe(false);
    expect(result.current.cancelClosureUsername).toBe('');
    expect(result.current.cancelClosurePassword).toBe('');
    expect(result.current.cancelClosureReason).toBe('');
    expect(result.current.cancelClosureLoading).toBe(false);
    expect(args.setCurrentView).not.toHaveBeenCalled();
  });

  it.each([
    ['server message', httpErr(403, { message: 'Supervisor role required' }), 'Supervisor role required'],
    ['error message', new Error('offline'), 'offline'],
    ['fallback', Object.assign(new Error(''), { message: '' }), 'Could not cancel the closure. A supervisor must authorize this.'],
  ])('keeps the dialog open on refusal: %s', async (_l, err, expected) => {
    cancelPosSessionClosure.mockRejectedValueOnce(err);
    const { args, result } = setup();
    act(() => { result.current.openCancelClosureDialog(); });
    act(() => { result.current.setCancelClosurePassword('pw'); });
    await act(async () => { await result.current.handleCancelClosureSubmit(); });
    expect(result.current.cancelClosureError).toBe(expected);
    expect(result.current.showCancelClosureDialog).toBe(true);
    expect(result.current.cancelClosurePassword).toBe('pw');
    expect(result.current.cancelClosureLoading).toBe(false);
    expect(args.setCurrentSession).not.toHaveBeenCalled();
  });

  it('is loading while the request is in flight', async () => {
    const d = deferred();
    cancelPosSessionClosure.mockReturnValueOnce(d.promise);
    const { result } = setup();
    let pending;
    act(() => { pending = result.current.handleCancelClosureSubmit(); });
    expect(result.current.cancelClosureLoading).toBe(true);
    await act(async () => { d.resolve({ id: 42 }); await pending; });
    expect(result.current.cancelClosureLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('force close fields and closing count state', () => {
  it('exposes the Force Close reason / acknowledgement read by the supervisor dispatcher', () => {
    const { result } = setup();
    act(() => { result.current.setForceCloseReason('Cashier unavailable'); result.current.setForceCloseAuditAcknowledged(true); result.current.setClosureAction('FORCE_CLOSE'); });
    expect(result.current.forceCloseReason).toBe('Cashier unavailable');
    expect(result.current.forceCloseAuditAcknowledged).toBe(true);
    expect(result.current.closureAction).toBe('FORCE_CLOSE');
  });

  it('closing denominations start as a fresh zeroed map per hook instance', () => {
    const a = setup();
    const b = setup();
    expect(a.result.current.closingDenominations).not.toBe(b.result.current.closingDenominations);
    act(() => { a.result.current.setClosingDenominations({ ...a.result.current.closingDenominations, 1000: 1 }); });
    expect(b.result.current.closingDenominations['1000']).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * POSSales.jsx is not rendered by this project's test setup, so the boundary — what moved,
 * what intentionally stayed, and the call order that keeps everything out of the temporal
 * dead zone — is asserted against its source.
 */
describe('POSSales wiring (boundary, hook order)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../POSSales.jsx');
  const HOOK = read('../POS/features/session/useSessionClosure.js');
  // The hook's header comment names the POSSales-owned pieces it does NOT own; exclusion
  // checks run against its code only.
  const HOOK_CODE = HOOK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const at = (needle) => {
    const i = POS_SALES.indexOf(needle);
    expect(i, `missing: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  const MOVED_STATE = [
    'showCancelClosureDialog', 'cancelClosureUsername', 'cancelClosurePassword', 'cancelClosureReason',
    'cancelClosureError', 'cancelClosureLoading', 'showCloseSessionDialog', 'closeSessionError',
    'varianceApproval', 'varianceApprovalBusy', 'varianceApprovalError', 'varianceSupervisorUser',
    'varianceSupervisorPassword', 'varianceApprovalReason', 'closureAction', 'forceCloseReason',
    'forceCloseAuditAcknowledged', 'showSessionOwnerRequiredDialog', 'closeSessionTab',
    'showCashierAuthDialog', 'cashierAuthUsername', 'cashierAuthPassword', 'cashierAuthError',
    'cashierAuthLoading', 'closingDenominations', 'cardSettlementAmount',
  ];
  const MOVED_HANDLERS = [
    'openCancelClosureDialog', 'handleCancelClosureSubmit', 'handleAuthorizeVariance', 'handleCloseSession',
    'proceedToCloseSessionDialog', 'handleDayCloseNormalClose', 'handleTradingEndedCloseSession',
    'handleCashierAuthSubmit',
  ];

  it.each(MOVED_STATE)('%s is declared in the hook, not in POSSales', (name) => {
    expect(POS_SALES).not.toContain(`const [${name},`);
    expect(HOOK).toContain(`const [${name},`);
  });

  it.each(MOVED_HANDLERS)('%s is defined in the hook, not in POSSales', (name) => {
    expect(POS_SALES).not.toMatch(new RegExp(`const ${name} = `));
    expect(HOOK).toMatch(new RegExp(`const ${name} = `));
  });

  it('POSSales no longer calls any closure endpoint directly', () => {
    for (const api of ['closePosSession', 'beginPosSessionClosure', 'cancelPosSessionClosure',
      'authorizePosVariance', 'verifySessionClosurePermission']) {
      expect(POS_SALES, api).not.toMatch(new RegExp(`\\b${api}\\b`));
    }
    expect(POS_SALES.match(/\} = useSessionClosure\(/g)).toHaveLength(1);
  });

  it('keeps sessionToClose, the four closure refs, opening count and Day Close variance in POSSales', () => {
    for (const kept of [
      'const [sessionToClose, setSessionToClose] = useState(null);',
      'const closureAuthGrantRef = useRef(null);',
      'const varianceGrantRef = useRef(null);',
      'const forceCloseContextRef = useRef(null);',
      'const cashierAuthTargetRef = useRef(null);',
      "const [openingCash, setOpeningCash] = useState('');",
      'const [denominations, setDenominations] = useState(emptyDenominations);',
      'const [closeDayVariance, setCloseDayVariance] = useState(null);',
      "setCloseDayVariance({ stage: body.stage, message: body.message, breakdown: body.breakdown });",
    ]) {
      expect(POS_SALES, kept).toContain(kept);
    }
    for (const excluded of ['sessionToClose', 'closureAuthGrantRef', 'varianceGrantRef', 'forceCloseContextRef',
      'cashierAuthTargetRef', 'openingCash', 'denominations', 'closeDayVariance']) {
      expect(HOOK_CODE, excluded).not.toMatch(new RegExp(`\\b(const|let)\\s*\\[?\\s*${excluded}\\b\\s*(=|,)`));
    }
    expect(HOOK_CODE).not.toContain('useRef');
  });

  it('keeps the previous-day / closure-required blocks and Business Day gating out of the hook', () => {
    expect(POS_SALES).toContain('const showPreviousDayBlock = useCallback(');
    expect(POS_SALES).toContain('const showClosureRequiredBlock = useCallback(');
    expect(POS_SALES).toContain('const [prevDaySessionOpenMsg, setPrevDaySessionOpenMsg] = useState(null);');
    expect(POS_SALES).toContain('const [closureRequiredMsg, setClosureRequiredMsg] = useState(null);');
    expect(POS_SALES).toContain('showCashierAuthDialog || showCloseSessionDialog || showSupervisorPin || sessionToClose');
    for (const excluded of ['showPreviousDayBlock', 'showClosureRequiredBlock', 'prevDaySessionOpenMsg',
      'closureRequiredMsg', 'businessDayClosureFlowActive =', 'PREVIOUS_DAY_SESSION_OPEN', 'SESSION_CLOSING_WORKFLOW']) {
      expect(HOOK_CODE, excluded).not.toContain(excluded);
    }
  });

  it('does not own session lifecycle', () => {
    for (const excluded of ['const [currentSession,', 'const [currentTerminal,', 'registerPosTerminal',
      'getActivePosSession', 'syncPosSession', 'useHeartbeat', 'openPosSession', 'transferPosSession']) {
      expect(HOOK_CODE, excluded).not.toContain(excluded);
    }
  });

  it('has no effects; the X-Report hydration and card-settlement sync effects stay in POSSales, in order', () => {
    expect(HOOK_CODE).not.toMatch(/useEffect|useLayoutEffect/);
    const hydration = at('}, [xReportData?.session?.id]);');
    const cardSync = at('}, [cardSettlementAmount, showCloseSessionDialog, xReportData]);');
    expect(hydration).toBeLessThan(cardSync);
    expect(at('setClosingDenominations(saved ? { ...emptyDenominations(), ...saved } : emptyDenominations());')).toBeLessThan(cardSync);
  });

  it('is called after every construction input is declared', () => {
    const call = at('} = useSessionClosure(');
    for (const decl of [
      "const [currentView, setCurrentView] = useState('dashboard');",
      '} = usePosSession(',
      'const [sessionNowMs, setSessionNowMs] = useState(() => Date.now());',
      'const pendingXAutoPrintRef = useRef(null);',
      'const [zReportDate, setZReportDate] = useState(',
      'const [sessionToClose, setSessionToClose] = useState(null);',
      'const cashierAuthTargetRef = useRef(null);',
      'const closureAuthGrantRef = useRef(null);',
      'const varianceGrantRef = useRef(null);',
      'const forceCloseContextRef = useRef(null);',
      "const [xReportVarianceRemarks, setXReportVarianceRemarks] = useState('');",
      "const [xReportClosingRemarks, setXReportClosingRemarks] = useState('');",
      'const sessionClosureLoadersRef = useRef(null);',
    ]) {
      expect(at(decl), decl).toBeLessThan(call);
    }
  });

  it('is called before every render-time or construction-time consumer of its values', () => {
    const call = at('} = useSessionClosure(');
    for (const consumer of [
      'const getReportClosingDenominations = useCallback(',
      '}, [xReportData?.session?.id]);',
      'const handleStartSession = async () => {',
      'const businessDayClosureFlowActive = Boolean(',
      'sessionLifecycleHandlersRef.current = {',
      'const handleSupervisorPinSubmit = () => submitSupervisorApproval({',
    ]) {
      expect(at(consumer), consumer).toBeGreaterThan(call);
    }
  });

  it('late-binds the loaders after all three are declared', () => {
    const assign = at('sessionClosureLoadersRef.current = { loadXReport, loadDaySummary, syncPosData };');
    for (const decl of ['const loadXReport = async', 'const loadDaySummary = async', 'const syncPosData = useCallback(']) {
      expect(at(decl), decl).toBeLessThan(assign);
    }
    expect(POS_SALES).toContain('loadersRef: sessionClosureLoadersRef,');
    // The hook never reads the ref during render.
    expect(HOOK).not.toMatch(/^\s{2}const \{[^}]*\} = loadersRef\.current;/m);
  });

  it('still hands the Force Close fields and closure refs to the supervisor dispatcher at submit time', () => {
    expect(POS_SALES).toContain(
      'forceCloseReason, forceCloseAuditAcknowledged, sessionToClose, currentSession,\n'
      + '    closureAuthGrantRef, forceCloseContextRef, setCurrentView,',
    );
  });

  it('arms the X-Report auto-print from the hook; the auto-print effect stays in POSSales', () => {
    expect(HOOK).toContain('pendingXAutoPrintRef.current = targetSession.id;');
    expect(POS_SALES).toContain('if (!pendingXAutoPrintRef.current) return;');
  });
});
