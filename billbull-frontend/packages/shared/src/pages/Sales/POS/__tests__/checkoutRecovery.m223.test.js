/**
 * Phase 0 / M2.2.3 — explicit abandonment, cross-tab coordination, crash recovery and server
 * recovery after local data loss, against real IndexedDB transaction semantics (fake-indexeddb, a
 * fresh database per test; see src/setupTests.js). Two "tabs" are two tab ids sharing one database,
 * exactly as two tabs of one origin share it. The real-browser runs (two real tabs, a real crash, a
 * real site-data wipe) are tools/pos-checkout-recovery.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  abandonPendingCheckout, acknowledgeServerCheckout, checkoutContext, CheckoutBlockedError, discoverServerCheckouts,
  dismissPendingCheckout, heldByAnotherTab, LEASE_MS, listPendingCheckouts, OPERATION_TYPES, reconcilePendingCheckout,
  replayPendingCheckout, scopeKeyOf, STATES, submitCheckout,
} from '../features/checkout/checkoutOperation';
import * as store from '../features/checkout/pendingCheckoutStore';

const answer = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

const ctx = () => checkoutContext({
  currentSession: { id: 51 }, currentTerminal: { terminalId: 'T001', branchId: 1 },
}, { operator: 'cashier1@test.com' });

const sale = (over = {}) => ({
  customerCode: 'WALK-IN', paymentMode: 'Cash', sessionId: 51, terminalId: 'T001', branchId: 1,
  salespersonEmployeeCode: 'EMP1257', paymentAllocations: [{ type: 'CASH', amount: 100 }],
  items: [{ itemCode: '08747', quantity: 1, price: 100 }], ...over,
});

const rowsOf = async () => store.listOperations(scopeKeyOf(ctx()));
const pendOne = async (deps = {}) => {
  await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
    { send: async () => { throw networkError(); }, ...deps }).catch(() => {});
  return (await rowsOf())[0];
};
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('decision 3: recorded:false and NOT_FOUND never clear an uncertain operation', () => {
  it('a refusal of a retry, after an unanswered first request, keeps the operation unresolved', async () => {
    const r = await pendOne();
    expect(r).toMatchObject({ state: STATES.UNCERTAIN, unaccounted: true });
    const send = vi.fn(async () => { throw answer(409, { code: 'SESSION_NOT_OPEN', recorded: false }); });
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send })).rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    const after = await store.getOperation(r.checkoutKey);
    expect(after.state).toBe(STATES.UNCERTAIN);
    expect(after.lastResponse.classification).toMatch(/earlier request may still arrive/);
  });

  it('an unexplained refusal whose lookup finds nothing stays unresolved when an earlier request is unaccounted for', async () => {
    const r = await pendOne();
    const send = async () => { throw answer(400, { message: 'Insufficient stock' }); };
    const lookup = async () => ({ found: false, recorded: 'NO' });
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send, lookup })).rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    expect((await store.getOperation(r.checkoutKey)).state).toBe(STATES.UNCERTAIN);
  });

  it('a page that died with its request out (record still SENT) is treated as unaccounted for', async () => {
    const gate = deferred();
    const p = submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: () => gate.promise, renewMs: 1e9 });
    await vi.waitFor(async () => expect((await rowsOf())[0]?.state).toBe(STATES.SENT));
    store.resetPendingCheckoutStoreConnection(); // the page is gone; only IndexedDB remains
    const [r] = await rowsOf();
    const later = Date.now() + LEASE_MS + 1;
    const send = vi.fn(async () => { throw answer(409, { code: 'SESSION_NOT_OPEN', recorded: false }); });
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send, tabId: 'reloaded', now: () => later }))
      .rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    expect((await store.getOperation(r.checkoutKey)).state).toBe(STATES.UNCERTAIN);
    gate.reject(networkError());
    await p.catch(() => {});
  });

  it('the first and only request, answered with a proven refusal, still releases the operation', async () => {
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async () => { throw answer(409, { code: 'SESSION_NOT_OPEN', recorded: false }); } }))
      .rejects.toMatchObject({ checkoutOutcome: 'refused' });
    expect((await rowsOf())[0].state).toBe(STATES.REFUSED);
  });
});

describe('explicit abandonment: resolved only when the server confirms ABANDONED', () => {
  it('sends the stored key and the exact stored payload, and closes the record on a terminal answer', async () => {
    const r = await pendOne();
    const abandon = vi.fn(async () => ({ outcome: 'ABANDONED', terminal: true, status: { state: 'ABANDONED', recorded: 'NO', sameRequest: true } }));
    const out = await abandonPendingCheckout(r.checkoutKey, ctx(), { reason: 'customer left' }, { abandon });
    expect(abandon).toHaveBeenCalledWith({ ...r.payload, checkoutKey: r.checkoutKey }, 'customer left');
    expect(out).toMatchObject({ state: STATES.ABANDONED, unaccounted: false, resolution: { reason: 'customer left', fromState: STATES.UNCERTAIN } });
    expect(await listPendingCheckouts(ctx())).toEqual([]);
  });

  it.each([
    ['in progress', 'CHECKOUT_IN_PROGRESS', { found: true, state: 'ACTIVE', recorded: 'UNKNOWN', sameRequest: true }, STATES.UNCERTAIN],
    ['stalled', 'CHECKOUT_STALLED', { found: true, state: 'STALLED', recorded: 'PARTIAL', sameRequest: true }, STATES.UNCERTAIN],
    ['recorded', 'CHECKOUT_RECORDED', { found: true, state: 'COMPLETED', recorded: 'YES', sameRequest: true, invoiceId: 9, invoiceNumber: 'SI-9' }, STATES.COMPLETED],
  ])('a server that refuses because the sale is %s keeps (or completes) the record, never abandons it', async (_l, code, status, expected) => {
    const r = await pendOne();
    const abandon = async () => { throw answer(409, { code, status, outcome: 'REFUSED', terminal: false }); };
    await expect(abandonPendingCheckout(r.checkoutKey, ctx(), {}, { abandon })).rejects.toBeTruthy();
    const after = await store.getOperation(r.checkoutKey);
    expect(after.state).toBe(expected);
    expect(after.lastAbandon.code).toBe(code);
    if (expected === STATES.COMPLETED) expect(after.result.invoiceNumber).toBe('SI-9');
  });

  it('no answer to the abandonment leaves the record exactly as unresolved as it was', async () => {
    const r = await pendOne();
    await expect(abandonPendingCheckout(r.checkoutKey, ctx(), {}, { abandon: async () => { throw networkError(); } })).rejects.toBeTruthy();
    expect((await store.getOperation(r.checkoutKey)).state).toBe(STATES.UNCERTAIN);
  });

  it('a 200 without a terminal outcome is not treated as abandonment', async () => {
    const r = await pendOne();
    await expect(abandonPendingCheckout(r.checkoutKey, ctx(), {}, { abandon: async () => ({ outcome: 'REFUSED', terminal: false }) }))
      .rejects.toMatchObject({ code: 'PENDING_CHECKOUT_NOT_ABANDONED' });
    expect((await store.getOperation(r.checkoutKey)).state).toBe(STATES.UNCERTAIN);
  });

  it('a lookup or a checkout answer reporting ABANDONED closes the record; the same basket later gets a new key', async () => {
    const r = await pendOne();
    const viaLookup = await reconcilePendingCheckout(r.checkoutKey, ctx(), { lookup: async () => ({ found: true, state: 'ABANDONED', recorded: 'NO', sameRequest: true }) });
    expect(viaLookup.state).toBe(STATES.ABANDONED);
    const send = vi.fn(async (b) => ({ id: 2, invoiceNumber: 'SI-2', key: b.checkoutKey }));
    const inv = await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send });
    expect(inv.key).not.toBe(r.checkoutKey);
  });

  it('a late copy answered 409 CHECKOUT_ABANDONED resolves as ABANDONED', async () => {
    const r = await pendOne();
    const send = async () => { throw answer(409, { code: 'CHECKOUT_ABANDONED', recorded: false, terminal: true }); };
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send })).rejects.toMatchObject({ checkoutOutcome: 'abandoned' });
    expect((await store.getOperation(r.checkoutKey)).state).toBe(STATES.ABANDONED);
  });

  it('the old two-minute dismissal is gone: an unresolved record can only be abandoned on the server', async () => {
    const r = await pendOne();
    await reconcilePendingCheckout(r.checkoutKey, ctx(), { lookup: async () => ({ found: false, recorded: 'NO' }), now: () => Date.now() + 3_600_000 });
    await expect(dismissPendingCheckout(r.checkoutKey, ctx())).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_UNKNOWN' });
  });
});

describe('two tabs of the same till', () => {
  it('submitting the same sale at the same moment creates ONE key; the second tab does not send while the first is', async () => {
    const gate = deferred();
    const sendA = vi.fn(() => gate.promise);
    const sendB = vi.fn(() => gate.promise);
    const args = { operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() };
    const [a, b] = await Promise.allSettled([
      Promise.race([submitCheckout(args, { send: sendA, tabId: 'tab-A', renewMs: 1e9 }), new Promise((res) => setTimeout(() => res('A-sending'), 200))]),
      Promise.race([submitCheckout(args, { send: sendB, tabId: 'tab-B', renewMs: 1e9 }), new Promise((res) => setTimeout(() => res('B-sending'), 200))]),
    ]);
    const rows = await rowsOf();
    expect(rows).toHaveLength(1);
    expect(sendA.mock.calls.length + sendB.mock.calls.length).toBe(1);
    // Whichever tab won the record sends; the other is refused as "another tab".
    const blocked = [a, b].find((x) => x.status === 'rejected');
    expect(blocked.reason).toBeInstanceOf(CheckoutBlockedError);
    expect(blocked.reason.code).toBe('PENDING_CHECKOUT_OTHER_TAB');
    expect(rows[0].owner.tabId).toBe(sendA.mock.calls.length ? 'tab-A' : 'tab-B');
    gate.resolve({ id: 1, invoiceNumber: 'SI-1' });
  });

  it('the second tab sees the first tab\'s live lease, and can send once that send has ended', async () => {
    const gate = deferred();
    const pA = submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: () => gate.promise, tabId: 'tab-A', renewMs: 1e9 });
    await vi.waitFor(async () => expect((await rowsOf())[0]?.state).toBe(STATES.SENT));
    const [r] = await rowsOf();
    expect(heldByAnotherTab(r, { tabId: 'tab-B' })).toBe(true);
    expect(heldByAnotherTab(r, { tabId: 'tab-A' })).toBe(false);
    const sendB = vi.fn();
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send: sendB, tabId: 'tab-B' })).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_OTHER_TAB' });
    expect(sendB).not.toHaveBeenCalled();
    gate.reject(networkError());
    await pA.catch(() => {});
    const after = await store.getOperation(r.checkoutKey);
    expect(after.owner).toBeNull();
    const sendB2 = vi.fn(async (body) => ({ id: 1, invoiceNumber: 'SI-1', body }));
    const inv = await replayPendingCheckout(r.checkoutKey, ctx(), {}, { send: sendB2, tabId: 'tab-B' });
    expect(inv.body).toEqual({ ...r.payload, checkoutKey: r.checkoutKey });
  });

  it('a sale completed in one tab is not sent again by the other tab\'s stale cart', async () => {
    const r = await pendOne();
    // Tab B read the record as pending; tab A completes it before B's transaction runs.
    const original = store.findOrCreateOperation;
    const raced = {
      ...store,
      findOrCreateOperation: async (scope, decide) => {
        await store.updateOperation(r.checkoutKey, { state: STATES.COMPLETED, result: { invoiceNumber: 'SI-7' } });
        return original(scope, decide);
      },
    };
    const send = vi.fn();
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send, store: raced, tabId: 'tab-B' }))
      .rejects.toMatchObject({ code: 'PENDING_CHECKOUT_ALREADY_RECORDED' });
    expect(send).not.toHaveBeenCalled();
    expect(await rowsOf()).toHaveLength(1);
  });
});

describe('browser crash: safe recovery of the original operation', () => {
  it('a crashed tab\'s lease expires; the next tab replays the same key and the byte-identical payload', async () => {
    const t0 = Date.now();
    const never = new Promise(() => {}); // the crashed tab never hears back
    submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: () => never, tabId: 'crashed', renewMs: 1e9, now: () => t0 });
    await vi.waitFor(async () => expect((await rowsOf())[0]?.state).toBe(STATES.SENT));
    store.resetPendingCheckoutStoreConnection();
    const [r] = await rowsOf();
    const sendEarly = vi.fn();
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send: sendEarly, tabId: 'new', now: () => t0 + 1000 }))
      .rejects.toMatchObject({ code: 'PENDING_CHECKOUT_OTHER_TAB' });
    const send = vi.fn(async (body) => ({ id: 1, invoiceNumber: 'SI-1', body }));
    const inv = await replayPendingCheckout(r.checkoutKey, ctx(), {}, { send, tabId: 'new', now: () => t0 + LEASE_MS + 1 });
    expect(JSON.stringify(inv.body)).toBe(JSON.stringify({ ...r.payload, checkoutKey: r.checkoutKey }));
    expect((await store.getOperation(r.checkoutKey))).toMatchObject({ state: STATES.COMPLETED, attempts: 2, owner: null });
  });
});

describe('server recovery after local IndexedDB data loss', () => {
  const attempts = [
    { checkoutKey: 'done-this-session', state: 'COMPLETED', recorded: 'YES', invoiceNumber: 'SI-1', sessionId: 51, terminalId: 'OLD' },
    { checkoutKey: 'done-other-till', state: 'COMPLETED', recorded: 'YES', invoiceNumber: 'SI-2', sessionId: 60, terminalId: 'T009' },
    { checkoutKey: 'active', state: 'ACTIVE', recorded: 'UNKNOWN', sessionId: 51 },
    { checkoutKey: 'stalled', state: 'STALLED', recorded: 'PARTIAL', sessionId: 51 },
    { checkoutKey: 'failed', state: 'FAILED', recorded: 'NO', sessionId: 51 },
    { checkoutKey: 'released-recorded', state: 'RELEASED', recorded: 'YES', invoiceNumber: 'SI-3', sessionId: 51 },
    { checkoutKey: 'abandoned', state: 'ABANDONED', recorded: 'NO', sessionId: 51 },
  ];

  it('after the local store is wiped, the till discovers what the server received, and acknowledging hides it', async () => {
    const r = await pendOne(); // this one is local
    globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)(); // site data cleared
    store.resetPendingCheckoutStoreConnection();
    expect(await rowsOf()).toEqual([]);
    const recoverable = vi.fn(async () => ({ attempts: [...attempts, { checkoutKey: r.checkoutKey, state: 'FAILED', recorded: 'NO', sessionId: 51 }] }));
    const found = await discoverServerCheckouts(ctx(), { recoverable });
    expect(recoverable).toHaveBeenCalledWith({ branchId: '1', sinceHours: 72, limit: 200 });
    expect(found.map((a) => a.checkoutKey)).toEqual(['done-this-session', 'active', 'stalled', 'failed', 'released-recorded', r.checkoutKey]);
    await acknowledgeServerCheckout(found[0], ctx());
    const again = await discoverServerCheckouts(ctx(), { recoverable });
    expect(again.map((a) => a.checkoutKey)).not.toContain('done-this-session');
    expect(await listPendingCheckouts(ctx())).toEqual([]); // the placeholder is not a pending sale
  });

  it('keys still held locally are not listed twice', async () => {
    const r = await pendOne();
    const found = await discoverServerCheckouts(ctx(), { recoverable: async () => ({ attempts: [{ checkoutKey: r.checkoutKey, state: 'FAILED', recorded: 'NO' }] }) });
    expect(found).toEqual([]);
  });
});
