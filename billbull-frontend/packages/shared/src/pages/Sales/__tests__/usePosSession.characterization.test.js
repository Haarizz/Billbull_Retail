import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  registerPosTerminal: vi.fn(),
  getActivePosSession: vi.fn(),
  getPosSessionById: vi.fn(),
  getPosDayStatus: vi.fn(),
  syncPosSession: vi.fn(),
  heartbeatPosTerminal: vi.fn(),
}));

import {
  getActivePosSession, getPosDayStatus, getPosSessionById, heartbeatPosTerminal,
  registerPosTerminal, syncPosSession,
} from '../../../api/posApi';
import { usePosSession } from '../POS/features/session/usePosSession';
import { isClosureWorkflowError } from '../POS/features/session/sessionWorkflowErrors';

/**
 * CHARACTERIZATION — POS session / terminal lifecycle.
 *
 * Terminal registration, session resume, the day-status pass, the 5s sync poll, the
 * heartbeat, branch-changed re-resolution and the mount-time init sequence were effects and
 * callbacks inside POSSales.jsx and therefore unreachable from any test. The Phase 3
 * extraction moved them verbatim into usePosSession, with the POSSales-owned work they
 * trigger (settings loader, block modals, discovery reset, invalidated-session reset)
 * late-bound through `handlersRef`.
 *
 * Every expectation below describes CURRENT behaviour, including the quirks noted inline.
 * Sequences are recorded from the calls as they happen, not from a desired order.
 *
 * `waitFor` polls on real timers and deadlocks under fake timers, so every wait is an
 * explicit timer advance inside act().
 */

const TERMINAL = { terminalId: 'TERM-01', branchId: 7, branchName: 'Main', counterName: 'Counter 1' };
const SESSION = { id: 42, status: 'OPEN', terminalId: 'TERM-01', branchId: 7 };

const httpErr = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let events;

const flush = async (ms = 0) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
};

const makeHandlers = (over = {}) => ({
  loadInitialPosSettings: vi.fn(async () => { events.push('settings-loaded'); }),
  showPreviousDayBlock: vi.fn(() => { events.push('prev-day-block'); }),
  showClosureRequiredBlock: vi.fn(() => { events.push('closure-required-block'); }),
  resetDiscovery: vi.fn(() => { events.push('discovery-reset'); }),
  resetForInvalidatedSession: vi.fn(() => { events.push('invalidated-reset'); }),
  ...over,
});

const setup = ({ posSettings = null, handlers = {}, strict = false } = {}) => {
  const handlersRef = { current: makeHandlers(handlers) };
  const view = renderHook(
    (props) => usePosSession(props),
    {
      initialProps: { posSettings, handlersRef },
      ...(strict ? { wrapper: React.StrictMode } : {}),
    },
  );
  return { view, handlersRef, h: handlersRef.current };
};

const mount = async (opts) => {
  const ctx = setup(opts);
  await flush();
  return ctx;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  events = [];
  localStorage.clear();
  sessionStorage.clear();
  registerPosTerminal.mockImplementation(async () => { events.push('registerPosTerminal'); return { terminal: TERMINAL }; });
  getActivePosSession.mockImplementation(async () => { events.push('getActivePosSession'); return SESSION; });
  getPosSessionById.mockImplementation(async (id) => { events.push('getPosSessionById'); return { ...SESSION, id, awaitingClosure: true }; });
  getPosDayStatus.mockImplementation(async () => { events.push('getPosDayStatus'); return { blocked: false, candidateBusinessDay: '2026-09-11' }; });
  syncPosSession.mockImplementation(async () => { events.push('syncPosSession'); return { sessionValid: true }; });
  heartbeatPosTerminal.mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('initial / default state', () => {
  it('starts with no terminal, no session, no Business Day and init loading', () => {
    const { view } = setup({ handlers: { loadInitialPosSettings: vi.fn(() => new Promise(() => {})) } });
    const r = view.result.current;
    expect(r.currentSession).toBeNull();
    expect(r.currentTerminal).toBeNull();
    expect(r.currentBusinessDay).toBeNull();
    expect(r.sessionInvalidated).toBe(false);
    expect(r.sessionInvalidReason).toBeNull();
    expect(r.terminalRegistrationError).toBeNull();
    expect(r.terminalLockedBy).toBeNull();
    expect(r.openSessionsBlock).toBeNull();
    expect(r.posInitLoading).toBe(true);
    expect(r.businessDayRefreshRef).toEqual({ current: null });
  });

  it('exposes exactly the lifecycle surface — no closure, approval or discovery state', () => {
    const { view } = setup({ handlers: { loadInitialPosSettings: vi.fn(() => new Promise(() => {})) } });
    expect(Object.keys(view.result.current).sort()).toEqual([
      'acknowledgeSessionInvalidation', 'businessDayRefreshRef', 'clearTerminalLock',
      'currentBusinessDay', 'currentSession', 'currentTerminal', 'dismissOpenSessionsBlock',
      'openSessionsBlock', 'posInitLoading', 'resumeTerminalSession', 'sessionInvalidReason',
      'sessionInvalidated', 'setCurrentSession', 'setCurrentTerminal', 'terminalLockedBy',
      'terminalRegistrationError',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('initial POS mount sequence', () => {
  it('loads settings, registers, resumes, checks day status, then clears init loading', async () => {
    const { view } = await mount();
    expect(events).toEqual([
      'settings-loaded',
      'registerPosTerminal',
      'getActivePosSession',
      'getPosDayStatus',
    ]);
    expect(view.result.current.currentTerminal).toEqual(TERMINAL);
    expect(view.result.current.currentSession).toEqual(SESSION);
    expect(view.result.current.currentBusinessDay).toBe('2026-09-11');
    expect(view.result.current.posInitLoading).toBe(false);
  });

  it('keeps init loading true until the day-status call settles', async () => {
    const day = deferred();
    getPosDayStatus.mockImplementation(() => day.promise);
    const { view } = await mount();
    expect(view.result.current.currentSession).toEqual(SESSION);
    expect(view.result.current.posInitLoading).toBe(true);
    await act(async () => { day.resolve({ blocked: false }); });
    await flush();
    expect(view.result.current.posInitLoading).toBe(false);
  });

  it('passes the settings loader an isCancelled accessor that is false while mounted', async () => {
    const { h } = await mount();
    expect(h.loadInitialPosSettings).toHaveBeenCalledTimes(1);
    const [isCancelled] = h.loadInitialPosSettings.mock.calls[0];
    expect(typeof isCancelled).toBe('function');
    expect(isCancelled()).toBe(false);
  });

  it('a settings-loader failure warns, skips registration and still clears init loading', async () => {
    const boom = new Error('settings exploded');
    const { view } = await mount({ handlers: { loadInitialPosSettings: vi.fn(async () => { throw boom; }) } });
    expect(console.warn).toHaveBeenCalledWith('POS init error', boom);
    expect(registerPosTerminal).not.toHaveBeenCalled();
    expect(view.result.current.posInitLoading).toBe(false);
  });

  it('unmounting before settings resolve cancels registration and flips isCancelled', async () => {
    const settings = deferred();
    const loader = vi.fn(() => settings.promise);
    const { view } = setup({ handlers: { loadInitialPosSettings: loader } });
    await flush();
    view.unmount();
    await act(async () => { settings.resolve(); });
    await flush();
    expect(loader.mock.calls[0][0]()).toBe(true);
    expect(registerPosTerminal).not.toHaveBeenCalled();
  });

  it('StrictMode mount→cleanup→mount runs the loader twice but registers once and applies state', async () => {
    const { view, h } = await mount({ strict: true });
    expect(h.loadInitialPosSettings).toHaveBeenCalledTimes(2);
    expect(registerPosTerminal).toHaveBeenCalledTimes(1);
    // posTerminalMountedRef is re-armed on re-mount, so the registration state still lands.
    expect(view.result.current.currentTerminal).toEqual(TERMINAL);
    expect(view.result.current.currentSession).toEqual(SESSION);
    expect(view.result.current.posInitLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('terminal discovery (device identity) and registration payload', () => {
  it('reuses the stored fingerprint and the branch-scoped cached terminal id', async () => {
    localStorage.setItem('billbull:pos:device_fingerprint', 'fp-1');
    localStorage.setItem('billbull:pos:terminal_id:7', 'TERM-CACHED');
    sessionStorage.setItem('activeBranchId', '7');
    await mount();
    expect(registerPosTerminal).toHaveBeenCalledWith({
      terminalId: 'TERM-CACHED',
      deviceFingerprint: 'fp-1',
      deviceInfo: expect.stringMatching(/ – \d+×\d+$/),
    });
  });

  it.each([
    ['no active branch', null],
    ['"All Branches"', 'ALL'],
  ])('uses the "default" terminal key with %s', async (_label, branch) => {
    if (branch) sessionStorage.setItem('activeBranchId', branch);
    localStorage.setItem('billbull:pos:terminal_id:default', 'TERM-DEFAULT');
    await mount();
    expect(registerPosTerminal.mock.calls[0][0].terminalId).toBe('TERM-DEFAULT');
    expect(localStorage.getItem('billbull:pos:terminal_id:default')).toBe('TERM-01');
  });

  it('sends a null terminal id when nothing is cached for the branch', async () => {
    sessionStorage.setItem('activeBranchId', '9');
    localStorage.setItem('billbull:pos:terminal_id:7', 'OTHER-BRANCH');
    await mount();
    expect(registerPosTerminal.mock.calls[0][0].terminalId).toBeNull();
  });

  it('mints and persists a fingerprint when none is stored', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('minted-uuid');
    await mount();
    expect(localStorage.getItem('billbull:pos:device_fingerprint')).toBe('minted-uuid');
    expect(registerPosTerminal.mock.calls[0][0].deviceFingerprint).toBe('minted-uuid');
  });

  it('caches the server-assigned terminal id under the branch key after registering', async () => {
    sessionStorage.setItem('activeBranchId', '7');
    registerPosTerminal.mockResolvedValue({ terminal: { ...TERMINAL, terminalId: 'TERM-NEW' } });
    await mount();
    expect(localStorage.getItem('billbull:pos:terminal_id:7')).toBe('TERM-NEW');
    expect(getActivePosSession).toHaveBeenCalledWith('TERM-NEW');
    expect(getPosDayStatus).toHaveBeenCalledWith('TERM-NEW');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('terminal registration failures', () => {
  it.each([
    ['server message', { message: 'Terminal is ARCHIVED' }, 'Terminal is ARCHIVED'],
    ['plain string body', 'Terminal is BLOCKED', 'Terminal is BLOCKED'],
    ['empty body', '', 'This device\'s registered terminal is no longer active.'],
  ])('a 403 (%s) surfaces terminalRegistrationError and stops', async (_l, data, expected) => {
    registerPosTerminal.mockRejectedValue(httpErr(403, data));
    const { view } = await mount();
    expect(view.result.current.terminalRegistrationError).toBe(expected);
    expect(view.result.current.currentTerminal).toBeNull();
    expect(getActivePosSession).not.toHaveBeenCalled();
    expect(getPosDayStatus).not.toHaveBeenCalled();
    expect(view.result.current.posInitLoading).toBe(false);
  });

  it('a non-403 failure is silent: no error, no terminal, no follow-up calls', async () => {
    registerPosTerminal.mockRejectedValue(httpErr(500, { message: 'down' }));
    const { view } = await mount();
    expect(view.result.current.terminalRegistrationError).toBeNull();
    expect(view.result.current.currentTerminal).toBeNull();
    expect(getActivePosSession).not.toHaveBeenCalled();
    expect(view.result.current.posInitLoading).toBe(false);
  });

  it('a response without a terminal stops before resume', async () => {
    registerPosTerminal.mockResolvedValue({});
    const { view } = await mount();
    expect(view.result.current.currentTerminal).toBeNull();
    expect(getActivePosSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('billbull:pos:terminal_id:default')).toBeNull();
  });

  it('a later successful registration clears a previous registration error', async () => {
    registerPosTerminal.mockRejectedValueOnce(httpErr(403, 'Terminal is MAINTENANCE'));
    const { view } = await mount();
    expect(view.result.current.terminalRegistrationError).toBe('Terminal is MAINTENANCE');
    await act(async () => { window.dispatchEvent(new Event('billbull:branch-changed')); });
    await flush();
    expect(view.result.current.terminalRegistrationError).toBeNull();
    expect(view.result.current.currentTerminal).toEqual(TERMINAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('active session lookup / resume', () => {
  it.each([
    ['null', null],
    ['an object without id', {}],
  ])('an active lookup returning %s leaves currentSession null', async (_l, value) => {
    getActivePosSession.mockResolvedValue(value);
    const { view } = await mount();
    expect(view.result.current.currentSession).toBeNull();
  });

  it.each([
    ['object message', { message: 'PREVIOUS_DAY_SESSION_OPEN: Session #5 is still open' }],
    ['plain string body', 'PREVIOUS_DAY_SESSION_OPEN: Session #5 is still open'],
  ])('PREVIOUS_DAY_SESSION_OPEN (%s) clears the session and raises the previous-day block with the raw message only', async (_l, data) => {
    getActivePosSession.mockRejectedValue(httpErr(409, data));
    const { view, h } = await mount();
    expect(view.result.current.currentSession).toBeNull();
    expect(h.showPreviousDayBlock).toHaveBeenCalledTimes(1);
    expect(h.showPreviousDayBlock.mock.calls[0]).toEqual(['PREVIOUS_DAY_SESSION_OPEN: Session #5 is still open']);
    // Day status still runs afterwards.
    expect(events).toEqual(['settings-loaded', 'registerPosTerminal', 'prev-day-block', 'getPosDayStatus']);
    expect(view.result.current.terminalLockedBy).toBeNull();
  });

  it('SESSION_CLOSING_WORKFLOW loads the closing session by id, then raises the closure block', async () => {
    const msg = 'SESSION_CLOSING_WORKFLOW: Session ID : 12 is mid-closure';
    getActivePosSession.mockRejectedValue(httpErr(409, { message: msg }));
    const { view, h } = await mount();
    expect(getPosSessionById).toHaveBeenCalledWith(12);
    expect(view.result.current.currentSession).toEqual({ ...SESSION, id: 12, awaitingClosure: true });
    expect(h.showClosureRequiredBlock).toHaveBeenCalledWith(msg, 12);
    expect(events).toEqual([
      'settings-loaded', 'registerPosTerminal', 'getPosSessionById', 'closure-required-block', 'getPosDayStatus',
    ]);
  });

  it('SESSION_CLOSING_WORKFLOW still raises the block when loading the session fails', async () => {
    const msg = 'SESSION_CLOSING_WORKFLOW: Session ID : 12';
    getActivePosSession.mockRejectedValue(httpErr(409, msg));
    getPosSessionById.mockRejectedValue(new Error('gone'));
    const { view, h } = await mount();
    expect(view.result.current.currentSession).toBeNull();
    expect(h.showClosureRequiredBlock).toHaveBeenCalledWith(msg, 12);
  });

  it('QUIRK: the closing-session id is parsed only from "Session ID : n", not "Session #n"', async () => {
    const msg = 'SESSION_CLOSING_WORKFLOW: Session #12 is mid-closure';
    getActivePosSession.mockRejectedValue(httpErr(409, { message: msg }));
    const { h } = await mount();
    expect(getPosSessionById).not.toHaveBeenCalled();
    expect(h.showClosureRequiredBlock).toHaveBeenCalledWith(msg, null);
  });

  it.each([
    ['with a message', { message: 'Locked by cashier Aisha' }, 'Locked by cashier Aisha'],
    ['without a body', undefined, 'Another active cashier'],
  ])('any other 409 (%s) locks the terminal', async (_l, data, expected) => {
    getActivePosSession.mockRejectedValue(httpErr(409, data));
    const { view, h } = await mount();
    expect(view.result.current.terminalLockedBy).toBe(expected);
    expect(h.showPreviousDayBlock).not.toHaveBeenCalled();
    expect(h.showClosureRequiredBlock).not.toHaveBeenCalled();
    expect(getPosDayStatus).toHaveBeenCalled();
  });

  it('a non-409 lookup failure is silent and day status still runs', async () => {
    getActivePosSession.mockRejectedValue(httpErr(500, { message: 'boom' }));
    const { view, h } = await mount();
    expect(view.result.current.currentSession).toBeNull();
    expect(view.result.current.terminalLockedBy).toBeNull();
    expect(h.showPreviousDayBlock).not.toHaveBeenCalled();
    expect(getPosDayStatus).toHaveBeenCalledWith('TERM-01');
    expect(view.result.current.posInitLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('Business Day / day-status pass', () => {
  it('a blocked day status becomes openSessionsBlock verbatim', async () => {
    const status = { blocked: true, currentBusinessDate: '2026-09-10', openSessions: [{ sessionId: 3 }] };
    getPosDayStatus.mockResolvedValue(status);
    const { view } = await mount();
    expect(view.result.current.openSessionsBlock).toBe(status);
  });

  it.each([
    ['candidateBusinessDay wins', { candidateBusinessDay: '2026-09-11', currentBusinessDate: '2026-09-10' }, '2026-09-11'],
    ['falls back to currentBusinessDate', { currentBusinessDate: '2026-09-10' }, '2026-09-10'],
    ['null when neither is present', {}, null],
  ])('currentBusinessDay: %s', async (_l, status, expected) => {
    getPosDayStatus.mockResolvedValue(status);
    const { view } = await mount();
    expect(view.result.current.currentBusinessDay).toBe(expected);
    expect(view.result.current.openSessionsBlock).toBeNull();
  });

  it('previous-day blocking: a previousBusinessDaySession clears the just-resumed session and raises the block with its id', async () => {
    getPosDayStatus.mockImplementation(async () => {
      events.push('getPosDayStatus');
      return {
        candidateBusinessDay: '2026-09-11',
        previousBusinessDaySession: { message: 'Previous Day Not Closed: Session ID : 40', sessionId: 40 },
      };
    });
    const { view, h } = await mount();
    expect(view.result.current.currentSession).toBeNull();
    expect(h.showPreviousDayBlock).toHaveBeenCalledWith('Previous Day Not Closed: Session ID : 40', 40);
    expect(events).toEqual(['settings-loaded', 'registerPosTerminal', 'getActivePosSession', 'getPosDayStatus', 'prev-day-block']);
    expect(view.result.current.currentBusinessDay).toBe('2026-09-11');
  });

  it('a day-status failure is non-blocking: session kept, Business Day unset, loading cleared', async () => {
    getPosDayStatus.mockRejectedValue(new Error('offline'));
    const { view } = await mount();
    expect(view.result.current.currentSession).toEqual(SESSION);
    expect(view.result.current.currentBusinessDay).toBeNull();
    expect(view.result.current.posInitLoading).toBe(false);
  });

  it('businessDayRefreshRef is a stable ref the hook never calls itself (the provider writes it)', async () => {
    const { view } = await mount();
    const ref = view.result.current.businessDayRefreshRef;
    const refresh = vi.fn();
    ref.current = refresh;
    view.rerender({ posSettings: { heartbeatIntervalSeconds: 60 }, handlersRef: { current: makeHandlers() } });
    await flush(15000);
    expect(view.result.current.businessDayRefreshRef).toBe(ref);
    expect(refresh).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('unmount guards (posTerminalMountedRef)', () => {
  it('unmount during registration: no resume, no terminal id cached', async () => {
    const reg = deferred();
    registerPosTerminal.mockImplementation(() => reg.promise);
    const { view } = setup();
    await flush();
    view.unmount();
    await act(async () => { reg.resolve({ terminal: TERMINAL }); });
    await flush();
    expect(getActivePosSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('billbull:pos:terminal_id:default')).toBeNull();
  });

  it('QUIRK: unmount during resume suppresses the block, but day status is still requested', async () => {
    const active = deferred();
    getActivePosSession.mockImplementation(() => active.promise);
    const { view, h } = setup();
    await flush();
    view.unmount();
    await act(async () => { active.reject(httpErr(409, 'PREVIOUS_DAY_SESSION_OPEN: Session #5')); });
    await flush();
    expect(h.showPreviousDayBlock).not.toHaveBeenCalled();
    expect(getPosDayStatus).toHaveBeenCalledWith('TERM-01');
  });

  it('unmount during a 403 registration failure records no error', async () => {
    const reg = deferred();
    registerPosTerminal.mockImplementation(() => reg.promise);
    const { view } = setup();
    await flush();
    view.unmount();
    await act(async () => { reg.reject(httpErr(403, 'Terminal is ARCHIVED')); });
    await flush();
    expect(view.result.current.terminalRegistrationError).toBeNull();
    expect(getActivePosSession).not.toHaveBeenCalled();
    expect(getPosDayStatus).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('session synchronization poll', () => {
  it('polls every 5s with (session id, terminal id) while the session is valid', async () => {
    await mount();
    expect(syncPosSession).not.toHaveBeenCalled();
    await flush(5000);
    expect(syncPosSession).toHaveBeenCalledWith(42, 'TERM-01');
    await flush(5000);
    expect(syncPosSession).toHaveBeenCalledTimes(2);
  });

  it('invalidation: flags + reason, clears the session, then hands the reset to POSSales once', async () => {
    syncPosSession.mockResolvedValue({ sessionValid: false, message: 'Transferred to TERM-02' });
    const { view, h } = await mount();
    await flush(5000);
    expect(view.result.current.sessionInvalidated).toBe(true);
    expect(view.result.current.sessionInvalidReason).toBe('Transferred to TERM-02');
    expect(view.result.current.currentSession).toBeNull();
    expect(h.resetForInvalidatedSession).toHaveBeenCalledTimes(1);
    // Terminal identity survives an invalidated session.
    expect(view.result.current.currentTerminal).toEqual(TERMINAL);
  });

  it('invalidation without a server message uses the fallback reason', async () => {
    syncPosSession.mockResolvedValue({ sessionValid: false });
    const { view } = await mount();
    await flush(5000);
    expect(view.result.current.sessionInvalidReason).toBe('This session has been transferred to another terminal.');
  });

  it('stops polling after invalidation, and acknowledging does not restart it', async () => {
    syncPosSession.mockResolvedValue({ sessionValid: false, message: 'gone' });
    const { view } = await mount();
    await flush(5000);
    await flush(15000);
    expect(syncPosSession).toHaveBeenCalledTimes(1);
    act(() => view.result.current.acknowledgeSessionInvalidation());
    expect(view.result.current.sessionInvalidated).toBe(false);
    expect(view.result.current.sessionInvalidReason).toBeNull();
    await flush(15000);
    expect(syncPosSession).toHaveBeenCalledTimes(1);
  });

  it('only an explicit sessionValid === false invalidates (null / missing flag keep polling)', async () => {
    syncPosSession.mockResolvedValueOnce(null).mockResolvedValueOnce({}).mockResolvedValue({ sessionValid: true });
    const { view, h } = await mount();
    await flush(5000);
    await flush(5000);
    await flush(5000);
    expect(syncPosSession).toHaveBeenCalledTimes(3);
    expect(view.result.current.sessionInvalidated).toBe(false);
    expect(h.resetForInvalidatedSession).not.toHaveBeenCalled();
  });

  it('retry/recovery: a network failure is ignored and the next tick polls again', async () => {
    syncPosSession.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ sessionValid: true });
    const { view } = await mount();
    await flush(5000);
    await flush(5000);
    expect(syncPosSession).toHaveBeenCalledTimes(2);
    expect(view.result.current.currentSession).toEqual(SESSION);
  });

  it('does not poll a CLOSED session', async () => {
    const { view } = await mount();
    act(() => view.result.current.setCurrentSession({ ...SESSION, status: 'CLOSED' }));
    await flush(15000);
    expect(syncPosSession).not.toHaveBeenCalled();
  });

  it('does not sync a session that belongs to a different terminal (keeps re-checking)', async () => {
    const { view } = await mount();
    act(() => view.result.current.setCurrentSession({ ...SESSION, terminalId: 'TERM-OTHER' }));
    await flush(20000);
    expect(syncPosSession).not.toHaveBeenCalled();
    expect(view.result.current.sessionInvalidated).toBe(false);
  });

  it('does not poll without a registered terminal', async () => {
    registerPosTerminal.mockRejectedValue(httpErr(500));
    const { view } = await mount();
    act(() => view.result.current.setCurrentSession(SESSION));
    await flush(15000);
    expect(syncPosSession).not.toHaveBeenCalled();
  });

  it('a replaced session aborts the old loop and polls the new id on its own 5s clock', async () => {
    const { view } = await mount();
    await flush(5000);                                   // t=5s  sync(42), reschedules for t=10s
    await flush(1000);                                   // t=6s
    act(() => view.result.current.setCurrentSession({ ...SESSION, id: 43 }));
    await flush(4000);                                   // t=10s old timer fires but is aborted
    expect(syncPosSession.mock.calls.map((c) => c[0])).toEqual([42]);
    await flush(1000);                                   // t=11s new loop's first tick
    expect(syncPosSession.mock.calls.map((c) => c[0])).toEqual([42, 43]);
  });

  it('cleanup: unmount cancels the pending poll', async () => {
    const { view } = await mount();
    view.unmount();
    await flush(20000);
    expect(syncPosSession).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('heartbeat', () => {
  it('beats immediately once a terminal is registered, then every 60s by default', async () => {
    await mount();
    expect(heartbeatPosTerminal).toHaveBeenCalledTimes(1);
    expect(heartbeatPosTerminal).toHaveBeenCalledWith('TERM-01');
    await flush(59000);
    expect(heartbeatPosTerminal).toHaveBeenCalledTimes(1);
    await flush(1000);
    expect(heartbeatPosTerminal).toHaveBeenCalledTimes(2);
  });

  it('uses posSettings.heartbeatIntervalSeconds', async () => {
    await mount({ posSettings: { heartbeatIntervalSeconds: 30 } });
    await flush(30000);
    expect(heartbeatPosTerminal).toHaveBeenCalledTimes(2);
  });

  it('does not beat without a terminal', async () => {
    registerPosTerminal.mockRejectedValue(httpErr(403, 'Terminal is BLOCKED'));
    await mount();
    await flush(120000);
    expect(heartbeatPosTerminal).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('branch change re-resolution', () => {
  it('resets lifecycle state, clears discovery, then re-registers for the new branch', async () => {
    getActivePosSession.mockRejectedValueOnce(httpErr(409, 'Locked by Aisha'));
    getPosDayStatus.mockResolvedValueOnce({ blocked: true, candidateBusinessDay: '2026-09-11' });
    const { view, h } = await mount();
    expect(view.result.current.terminalLockedBy).toBe('Locked by Aisha');
    expect(view.result.current.openSessionsBlock).not.toBeNull();

    const reg = deferred();
    registerPosTerminal.mockImplementation(() => { events.push('registerPosTerminal'); return reg.promise; });
    sessionStorage.setItem('activeBranchId', '9');
    localStorage.setItem('billbull:pos:terminal_id:9', 'TERM-B9');
    events = [];
    await act(async () => { window.dispatchEvent(new Event('billbull:branch-changed')); });

    expect(view.result.current.currentTerminal).toBeNull();
    expect(view.result.current.currentSession).toBeNull();
    expect(view.result.current.terminalLockedBy).toBeNull();
    expect(view.result.current.openSessionsBlock).toBeNull();
    expect(h.resetDiscovery).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['discovery-reset', 'registerPosTerminal']);
    expect(registerPosTerminal.mock.calls.at(-1)[0].terminalId).toBe('TERM-B9');
    // Not reset by a branch change: init loading and the last resolved Business Day.
    expect(view.result.current.posInitLoading).toBe(false);
    expect(view.result.current.currentBusinessDay).toBe('2026-09-11');

    await act(async () => { reg.resolve({ terminal: { ...TERMINAL, terminalId: 'TERM-B9', branchId: 9 } }); });
    await flush();
    expect(view.result.current.currentTerminal).toEqual({ ...TERMINAL, terminalId: 'TERM-B9', branchId: 9 });
    expect(getActivePosSession).toHaveBeenLastCalledWith('TERM-B9');
  });

  it('does not reload settings on a branch change', async () => {
    const { h } = await mount();
    await act(async () => { window.dispatchEvent(new Event('billbull:branch-changed')); });
    await flush();
    expect(h.loadInitialPosSettings).toHaveBeenCalledTimes(1);
    expect(registerPosTerminal).toHaveBeenCalledTimes(2);
  });

  it('cleanup: the listener is removed on unmount', async () => {
    const { view } = await mount();
    view.unmount();
    await act(async () => { window.dispatchEvent(new Event('billbull:branch-changed')); });
    await flush();
    expect(registerPosTerminal).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('lifecycle actions consumed by POSSales', () => {
  it('resumeTerminalSession (shift handover) resumes the active session on the current terminal', async () => {
    getActivePosSession.mockRejectedValueOnce(httpErr(409, 'Locked by Aisha'));
    const { view } = await mount();
    expect(view.result.current.currentSession).toBeNull();
    act(() => view.result.current.clearTerminalLock());
    expect(view.result.current.terminalLockedBy).toBeNull();
    await act(async () => { await view.result.current.resumeTerminalSession(); });
    expect(getActivePosSession).toHaveBeenLastCalledWith('TERM-01');
    expect(view.result.current.currentSession).toEqual(SESSION);
  });

  it('resumeTerminalSession is a no-op without a terminal and swallows lookup errors', async () => {
    registerPosTerminal.mockRejectedValue(httpErr(500));
    const { view } = await mount();
    await act(async () => { await view.result.current.resumeTerminalSession(); });
    expect(getActivePosSession).not.toHaveBeenCalled();

    act(() => view.result.current.setCurrentTerminal(TERMINAL));
    getActivePosSession.mockRejectedValueOnce(httpErr(409, 'PREVIOUS_DAY_SESSION_OPEN: x'));
    await act(async () => { await view.result.current.resumeTerminalSession(); });
    expect(view.result.current.currentSession).toBeNull();
  });

  it('dismissOpenSessionsBlock clears the block', async () => {
    getPosDayStatus.mockResolvedValue({ blocked: true, openSessions: [] });
    const { view } = await mount();
    act(() => view.result.current.dismissOpenSessionsBlock());
    expect(view.result.current.openSessionsBlock).toBeNull();
  });

  it('setCurrentSession / setCurrentTerminal are the authoritative writers (functional updates too)', async () => {
    const { view } = await mount();
    act(() => view.result.current.setCurrentSession((prev) => ({ ...prev, awaitingClosure: true })));
    expect(view.result.current.currentSession).toEqual({ ...SESSION, awaitingClosure: true });
    act(() => view.result.current.setCurrentTerminal((prev) => ({ ...prev, counterName: 'Renamed' })));
    expect(view.result.current.currentTerminal.counterName).toBe('Renamed');
  });

  it('action identities are stable across renders', async () => {
    const { view } = await mount();
    const first = view.result.current;
    view.rerender({ posSettings: null, handlersRef: { current: makeHandlers() } });
    expect(view.result.current.clearTerminalLock).toBe(first.clearTerminalLock);
    expect(view.result.current.dismissOpenSessionsBlock).toBe(first.dismissOpenSessionsBlock);
    expect(view.result.current.acknowledgeSessionInvalidation).toBe(first.acknowledgeSessionInvalidation);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('isClosureWorkflowError', () => {
  it.each([
    ['409 + message', httpErr(409, { message: 'SESSION_CLOSING_WORKFLOW: Session ID : 1' }), true],
    ['409 + string body', httpErr(409, 'SESSION_CLOSING_WORKFLOW'), true],
    ['409 + other message', httpErr(409, { message: 'PREVIOUS_DAY_SESSION_OPEN' }), false],
    ['409 + non-string body', httpErr(409, { code: 'SESSION_CLOSING_WORKFLOW' }), false],
    ['400 + matching message', httpErr(400, { message: 'SESSION_CLOSING_WORKFLOW' }), false],
    ['no response', new Error('network'), false],
    ['undefined', undefined, false],
  ])('%s → %s', (_l, err, expected) => {
    expect(isClosureWorkflowError(err)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * POSSales.jsx is not rendered by this project's test setup, so single ownership and the
 * directed dependencies into downstream hooks are asserted against its source.
 */
describe('POSSales wiring (single owner, hook order)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../POSSales.jsx');
  const HOOK = read('../POS/features/session/usePosSession.js');
  const at = (needle) => {
    const i = POS_SALES.indexOf(needle);
    expect(i, `missing: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it.each(['currentSession', 'currentTerminal', 'currentBusinessDay', 'sessionInvalidated',
    'sessionInvalidReason', 'terminalRegistrationError', 'terminalLockedBy', 'openSessionsBlock',
    'posInitLoading'])('POSSales declares no local state for %s', (name) => {
    expect(POS_SALES).not.toMatch(new RegExp(`const \\[${name},`));
    expect(POS_SALES).not.toMatch(new RegExp(`useState\\([^)]*\\);[^\\n]*\\b${name}\\b`));
  });

  it('POSSales no longer writes lifecycle-only setters or owns the lifecycle refs', () => {
    for (const s of ['setCurrentBusinessDay', 'setSessionInvalidated', 'setSessionInvalidReason',
      'setTerminalRegistrationError', 'setTerminalLockedBy', 'setOpenSessionsBlock', 'setPosInitLoading']) {
      expect(POS_SALES, s).not.toContain(s);
    }
    expect(POS_SALES).not.toContain('posTerminalMountedRef');
    expect(POS_SALES).not.toContain('const businessDayRefreshRef');
    expect(POS_SALES).not.toContain('registerPosTerminal');
    expect(POS_SALES).not.toContain('syncPosSession');
    expect(POS_SALES).not.toContain('useHeartbeat');
    expect(POS_SALES.match(/\} = usePosSession\(/g)).toHaveLength(1);
  });

  it('usePosSession is called before every consumer of its values', () => {
    const call = at('} = usePosSession(');
    for (const consumer of [
      'const isSessionActive = currentSession',
      'usePosBehaviourSettings({ posSettings, setPosSettings, businessDayRefreshRef })',
      'useProductCatalog({ currentTerminal, currentSession,',
      'printerConfigs, currentTerminal,',
      'currentSession, currentTerminal, posSettings,\n    recalculateInvoice',
      'sessionId, currentSession, currentTerminal, currentInvoice',
      'sessionCtx: { currentSession, currentTerminal, posSettings }',
      'refreshRef={businessDayRefreshRef}',
    ]) {
      expect(at(consumer), consumer).toBeGreaterThan(call);
    }
  });

  it('its construction inputs are declared before the call; late-bound handlers are assigned after useCheckout', () => {
    const call = at('} = usePosSession(');
    expect(at('const [posSettings, setPosSettings] = useState(null);')).toBeLessThan(call);
    expect(at('const sessionLifecycleHandlersRef = useRef(null);')).toBeLessThan(call);
    const assign = at('sessionLifecycleHandlersRef.current = {');
    for (const decl of [
      'const loadInitialPosSettings =', 'const showPreviousDayBlock =', 'const showClosureRequiredBlock =',
      'const handleDiscoveryDismiss =', 'checkoutPhase, setCheckoutPhase,', 'checkoutError, setCheckoutError,',
      'currentInvoice, setCurrentInvoice,',
    ]) {
      expect(at(decl), decl).toBeLessThan(assign);
    }
  });

  it('closure, approval, discovery and open/transfer state are NOT in the lifecycle hook', () => {
    for (const excluded of [
      'showCloseSessionDialog', 'showCancelClosureDialog', 'sessionToClose', 'closeSessionError',
      'closeSessionTab', 'openingCash', 'denominations', 'closingDenominations', 'cardSettlementAmount',
      'closeDayVariance', 'varianceApproval', 'cashierAuthTargetRef', 'closureAuthGrantRef',
      'varianceGrantRef', 'forceCloseContextRef', 'forceCloseReason', 'discoverySupervisorPin',
      'discoveryResponse', 'showSupervisorPin', 'openPosSession', 'transferPosSession',
      'xReportData', 'zReportData',
    ]) {
      expect(HOOK, excluded).not.toMatch(new RegExp(`\\b(const|let)\\s*\\[?\\s*${excluded}\\b|\\b${excluded}\\(|import[^;]*\\b${excluded}\\b`));
    }
    // ...and they are still declared in POSSales.
    for (const kept of ['const [sessionToClose,', 'const [openingCash,', 'const [discoverySupervisorPin,',
      'const closureAuthGrantRef = useRef', 'const forceCloseContextRef = useRef']) {
      expect(POS_SALES, kept).toContain(kept);
    }
  });
});
