/**
 * Phase 0 / M2.2.2 — the shared checkout-operation lifecycle against real IndexedDB transaction
 * semantics (fake-indexeddb, a fresh database per test; see src/setupTests.js).
 *
 * A "reload" here drops the module's connection (resetPendingCheckoutStoreConnection) and continues
 * with nothing but what is in IndexedDB: this module keeps no other state. The real-browser reload
 * runs are tools/pos-checkout-recovery (headless Chrome, real page reloads).
 *
 * The fake server keeps one invoice per checkout key, like PosCheckoutController, so "how many
 * invoices exist" is the assertion that matters.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  abandonPendingCheckout, acknowledgeServerCheckout, checkoutContext, CheckoutBlockedError, discoverServerCheckouts,
  dismissPendingCheckout, heldByAnotherTab, LEASE_MS, listPendingCheckouts, OPERATION_TYPES, PendingCheckoutStorageError,
  reconcilePendingCheckout, replayPendingCheckout, scopeKeyOf, STATES, submitCheckout,
} from '../features/checkout/checkoutOperation';
import * as store from '../features/checkout/pendingCheckoutStore';

const answer = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const timeoutError = () => Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });

const ctx = (over = {}) => ({
  ...checkoutContext({
    currentSession: { id: over.sessionId ?? 51 },
    currentTerminal: { terminalId: over.terminalId ?? 'T001', branchId: over.branchId ?? 1 },
  }, { operator: over.operator ?? 'cashier1@test.com' }),
  ...(over.tenant ? { tenant: over.tenant } : {}),
});

const sale = (over = {}) => ({
  customerCode: 'WALK-IN', paymentMode: 'Cash', sessionId: 51, terminalId: 'T001', branchId: 1,
  salespersonEmployeeCode: 'EMP1257', paymentAllocations: [{ type: 'CASH', amount: 100 }],
  items: [{ itemCode: '08747', quantity: 1, price: 100 }], ...over,
});

/** One invoice per checkout key, like the real controller. */
const fakeServer = () => {
  const byKey = new Map();
  const invoices = [];
  const server = {
    invoices,
    byKey,
    requests: [],
    record(body) {
      server.requests.push(body);
      if (byKey.has(body.checkoutKey)) return byKey.get(body.checkoutKey).invoice;
      const invoice = { id: invoices.length + 1, invoiceNumber: `SI-POS-${invoices.length + 1}`, invoiceTotal: 100 };
      invoices.push(invoice);
      byKey.set(body.checkoutKey, { invoice, body });
      return invoice;
    },
    lookup: vi.fn(async (body) => {
      const e = byKey.get(body.checkoutKey);
      return e
        ? { checkoutKey: body.checkoutKey, found: true, state: 'COMPLETED', recorded: 'YES', sameRequest: true, invoiceId: e.invoice.id, invoiceNumber: e.invoice.invoiceNumber }
        : { checkoutKey: body.checkoutKey, found: false, state: null, recorded: 'NO', sameRequest: null };
    }),
  };
  return server;
};

const reload = () => store.resetPendingCheckoutStoreConnection();

const rowsOf = async (c = ctx()) => store.listOperations(scopeKeyOf(c));

describe('1. the pending record is committed before the HTTP request begins', () => {
  it('a separate connection already sees the record, key and exact payload when the request starts', async () => {
    let seenAtSend = null;
    const send = vi.fn(async (body) => {
      // Read through a NEW connection: only committed data is visible to it.
      reload();
      seenAtSend = await store.getOperation(body.checkoutKey);
      return { id: 1, invoiceNumber: 'SI-1' };
    });
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(seenAtSend).not.toBeNull();
    expect(seenAtSend.state).toBe(STATES.SENT);
    expect(seenAtSend.payload).toEqual(sale());
    expect(seenAtSend.context).toEqual(ctx());
    const { checkoutKey, ...sentSale } = send.mock.calls[0][0];
    expect(checkoutKey).toBe(seenAtSend.checkoutKey);
    expect(sentSale).toEqual(seenAtSend.payload);
  });

  it('opens its write transactions with strict durability', async () => {
    const real = IDBDatabase.prototype.transaction;
    const modes = [];
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (names, mode, opts) {
      modes.push({ mode, opts });
      return real.call(this, names, mode, opts);
    });
    try {
      await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => ({ id: 1 }) });
    } finally { spy.mockRestore(); }
    const writes = modes.filter((m) => m.mode === 'readwrite');
    expect(writes.length).toBeGreaterThanOrEqual(2);
    writes.forEach((w) => expect(w.opts).toEqual({ durability: 'strict' }));
  });

  it('falls back to default durability where the browser rejects the option argument', async () => {
    const real = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (names, mode, opts) {
      if (opts) throw new TypeError('Failed to execute transaction: 3 arguments');
      return real.call(this, names, mode);
    });
    try {
      const inv = await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => ({ id: 7 }) });
      expect(inv.id).toBe(7);
    } finally { spy.mockRestore(); }
  });
});

describe('2. a successful checkout closes the operation', () => {
  it('archives it as COMPLETED with the invoice, and it is no longer pending', async () => {
    const server = fakeServer();
    const inv = await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async (b) => server.record(b) });
    const [row] = await rowsOf();
    expect(row.state).toBe(STATES.COMPLETED);
    expect(row.result.invoiceNumber).toBe(inv.invoiceNumber);
    expect(await listPendingCheckouts(ctx())).toEqual([]);
  });

  it('the next identical basket is a new sale with a new key', async () => {
    const server = fakeServer();
    const deps = { send: async (b) => server.record(b) };
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, deps);
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, deps);
    expect(server.invoices).toHaveLength(2);
    expect(server.requests[0].checkoutKey).not.toBe(server.requests[1].checkoutKey);
  });
});

describe('3/4. lost response or timeout, then reload', () => {
  it.each([
    ['a lost response', networkError],
    ['a client timeout', timeoutError],
    ['a 504', () => answer(504, '')],
  ])('after %s the server recorded the sale once; the reload reuses the exact key and payload, and no second invoice exists', async (_l, makeErr) => {
    const server = fakeServer();
    // The server records the sale, then the answer is lost on the way back.
    const lossy = { send: async (b) => { server.record(b); throw makeErr(); }, lookup: server.lookup };
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, lossy))
      .rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    const [before] = await rowsOf();
    expect(before.state).toBe(STATES.UNCERTAIN);

    reload();
    // The till comes back: the pending list holds the operation, untouched.
    const [pending] = await listPendingCheckouts(ctx());
    expect(pending.checkoutKey).toBe(before.checkoutKey);
    expect(pending.payload).toEqual(before.payload);

    // The cashier presses "Send again": same key, same payload, answered with the recorded invoice.
    const healthy = { send: async (b) => server.record(b), lookup: server.lookup };
    const inv = await replayPendingCheckout(pending.checkoutKey, ctx(), {}, healthy);
    expect(inv.invoiceNumber).toBe('SI-POS-1');
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]).toEqual(server.requests[0]);
    expect(server.invoices).toHaveLength(1);
    expect((await rowsOf())[0].state).toBe(STATES.COMPLETED);
  });

  it('ringing the identical sale again after the reload also reuses the stored operation', async () => {
    const server = fakeServer();
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async (b) => { server.record(b); throw timeoutError(); } }).catch(() => {});
    reload();
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async (b) => server.record(b) });
    expect(server.requests[1].checkoutKey).toBe(server.requests[0].checkoutKey);
    expect(server.invoices).toHaveLength(1);
  });
});

describe('5. reload while the server says IN_PROGRESS', () => {
  it('stays unresolved through the lookup and through a replay answered CHECKOUT_IN_PROGRESS', async () => {
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async () => { throw networkError(); } }).catch(() => {});
    reload();
    const [r] = await listPendingCheckouts(ctx());
    const lookup = vi.fn(async () => ({ found: true, state: 'ACTIVE', recorded: 'UNKNOWN', sameRequest: true }));
    const checked = await reconcilePendingCheckout(r.checkoutKey, ctx(), { lookup });
    expect(checked.state).toBe(STATES.UNCERTAIN);
    expect(checked.lookup.recorded).toBe('UNKNOWN');

    const send = vi.fn(async () => { throw answer(409, { code: 'CHECKOUT_IN_PROGRESS', retryable: true }); });
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send, lookup })).rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    expect(send.mock.calls[0][0].checkoutKey).toBe(r.checkoutKey);
    const [still] = await listPendingCheckouts(ctx());
    expect(still.state).toBe(STATES.UNCERTAIN);
    await expect(dismissPendingCheckout(r.checkoutKey, ctx())).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_UNKNOWN' });
  });

  it.each(['CHECKOUT_STALLED', 'CHECKOUT_ATTEMPT_SUPERSEDED'])('%s keeps the operation pending', async (code) => {
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async () => { throw answer(409, { code }); } })).rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    expect((await rowsOf())[0].state).toBe(STATES.UNCERTAIN);
  });
});

describe('6. reload after the server completed but before local cleanup', () => {
  it('the record still says SENT; the reload reconciles it to COMPLETED without sending anything', async () => {
    const server = fakeServer();
    const failingClose = {
      ...store,
      updateOperation: async (key, patch) => {
        if (patch.state === STATES.COMPLETED) throw new Error('tab closed before the write');
        return store.updateOperation(key, patch);
      },
    };
    const send = vi.fn(async (b) => server.record(b));
    const inv = await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send, store: failingClose });
    expect(inv.invoiceNumber).toBe('SI-POS-1');
    expect((await rowsOf())[0].state).toBe(STATES.SENT);

    reload();
    const [r] = await listPendingCheckouts(ctx());
    const after = await reconcilePendingCheckout(r.checkoutKey, ctx(), { lookup: server.lookup, send });
    expect(after.state).toBe(STATES.COMPLETED);
    expect(after.result.invoiceNumber).toBe('SI-POS-1');
    expect(after.recoveredAfterReload).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(server.invoices).toHaveLength(1);
    // Shown once to the cashier, then acknowledged away.
    expect((await listPendingCheckouts(ctx())).map((x) => x.state)).toEqual([STATES.COMPLETED]);
    await dismissPendingCheckout(r.checkoutKey, ctx());
    expect(await listPendingCheckouts(ctx())).toEqual([]);
  });
});

describe('7. reload after an explicit pre-write refusal', () => {
  it('a proven refusal releases the operation: nothing to recover after the reload', async () => {
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async () => { throw answer(409, { code: 'SESSION_NOT_OPEN', recorded: false }); } }))
      .rejects.toMatchObject({ checkoutOutcome: 'refused' });
    reload();
    expect(await listPendingCheckouts(ctx())).toEqual([]);
    expect((await rowsOf())[0].state).toBe(STATES.REFUSED);
  });

  it('after the refusal an identical retry (e.g. with supervisor credentials) reuses the key; the credentials are sent but not stored', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(answer(403, { message: 'Supervisor override required (pos_price_override).' }))
      .mockResolvedValueOnce({ id: 3, invoiceNumber: 'SI-3' });
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send }).catch(() => {});
    reload();
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: { ...sale(), supervisorOverridePin: '8642' }, context: ctx() }, { send });
    expect(send.mock.calls[1][0].checkoutKey).toBe(send.mock.calls[0][0].checkoutKey);
    expect(send.mock.calls[1][0].supervisorOverridePin).toBe('8642');
    expect(JSON.stringify(await rowsOf())).not.toContain('8642');
  });

  it('an unexplained refusal is released only after the lookup says nothing stands under the key', async () => {
    const lookup = vi.fn(async () => ({ found: true, state: 'FAILED', recorded: 'NO', sameRequest: true }));
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async () => { throw answer(400, { message: 'Insufficient stock' }); }, lookup }))
      .rejects.toMatchObject({ checkoutOutcome: 'refused' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await rowsOf())[0].state).toBe(STATES.REFUSED);
  });

  it.each([
    ['partly recorded', async () => ({ found: true, state: 'STALLED', recorded: 'PARTIAL', sameRequest: true })],
    ['still active', async () => ({ found: true, state: 'ACTIVE', recorded: 'UNKNOWN', sameRequest: true })],
    ['lookup unreachable', async () => { throw networkError(); }],
  ])('an unexplained refusal stays pending when the lookup says %s', async (_l, lookup) => {
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() },
      { send: async () => { throw answer(409, { message: 'SESSION_CLOSING_WORKFLOW' }); }, lookup }))
      .rejects.toMatchObject({ checkoutOutcome: 'uncertain' });
    expect((await rowsOf())[0].state).toBe(STATES.UNCERTAIN);
  });
});

describe('8. a changed cart while an earlier operation is unresolved', () => {
  it('is not sent without confirmation, and the original payload is never overwritten', async () => {
    const send = vi.fn(async () => { throw networkError(); });
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send }).catch(() => {});
    const changed = sale({ items: [{ itemCode: '08747', quantity: 2, price: 100 }] });
    const confirmSeparateSale = vi.fn(() => false);
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: changed, context: ctx(), confirmSeparateSale }, { send }))
      .rejects.toBeInstanceOf(CheckoutBlockedError);
    expect(confirmSeparateSale).toHaveBeenCalledWith([expect.objectContaining({ state: STATES.UNCERTAIN })]);
    expect(send).toHaveBeenCalledTimes(1);
    const rows = await rowsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual(sale());
    // Immutable at the store too.
    await expect(store.updateOperation(rows[0].checkoutKey, { payload: changed })).rejects.toThrow(/cannot change/);
  });
});

describe('9. CHECKOUT_KEY_REUSED needs an explicit resolution', () => {
  it('is kept as KEY_CONFLICT, never silently replaced by a new key, never replayed, and only an acknowledgement closes it', async () => {
    const send = vi.fn(async () => { throw answer(409, { code: 'CHECKOUT_KEY_REUSED', recorded: false, invoiceNumber: 'SI-9' }); });
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send }))
      .rejects.toMatchObject({ checkoutOutcome: 'keyConflict' });
    const [conflict] = await listPendingCheckouts(ctx());
    expect(conflict.state).toBe(STATES.KEY_CONFLICT);

    // The same basket again is not quietly sent under the old key or a new one.
    const confirmSeparateSale = vi.fn(() => false);
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx(), confirmSeparateSale }, { send }))
      .rejects.toMatchObject({ code: 'EARLIER_CHECKOUT_UNRESOLVED' });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(replayPendingCheckout(conflict.checkoutKey, ctx(), {}, { send })).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_CONFLICT' });

    // Only as an intentionally new sale does it get a new key.
    const ok = vi.fn(async (b) => ({ id: 10, invoiceNumber: 'SI-10', key: b.checkoutKey }));
    const inv = await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx(), confirmSeparateSale: () => true }, { send: ok });
    expect(inv.key).not.toBe(conflict.checkoutKey);
    expect((await store.getOperation(conflict.checkoutKey)).state).toBe(STATES.KEY_CONFLICT);

    await dismissPendingCheckout(conflict.checkoutKey, ctx(), { reason: 'original is SI-9' });
    const closed = await store.getOperation(conflict.checkoutKey);
    expect(closed.state).toBe(STATES.DISMISSED);
    expect(closed.resolution).toMatchObject({ by: 'cashier1@test.com', reason: 'original is SI-9', fromState: STATES.KEY_CONFLICT });
  });

  it('a lookup that finds a different request under the key is a conflict too', async () => {
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => { throw networkError(); } }).catch(() => {});
    const [r] = await rowsOf();
    const after = await reconcilePendingCheckout(r.checkoutKey, ctx(), {
      lookup: async () => ({ found: true, state: 'COMPLETED', recorded: 'YES', sameRequest: false, invoiceNumber: 'SI-X' }),
    });
    expect(after.state).toBe(STATES.KEY_CONFLICT);
  });
});

describe('10. two pending operations stay isolated', () => {
  it('each keeps its own key and payload and each replay sends exactly its own', async () => {
    const server = fakeServer();
    const lossy = { send: async (b) => { server.record(b); throw networkError(); } };
    const a = sale();
    const b = sale({ customerCode: '02650', items: [{ itemCode: 'X', quantity: 3, price: 5 }] });
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: a, context: ctx() }, lossy).catch(() => {});
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: b, context: ctx(), confirmSeparateSale: () => true }, lossy).catch(() => {});
    reload();
    const pending = await listPendingCheckouts(ctx());
    expect(pending).toHaveLength(2);
    expect(pending[0].checkoutKey).not.toBe(pending[1].checkoutKey);
    const healthy = { send: async (x) => server.record(x) };
    for (const r of pending) await replayPendingCheckout(r.checkoutKey, ctx(), {}, healthy);
    expect(server.invoices).toHaveLength(2);
    const sentA = server.requests.filter((x) => x.checkoutKey === pending[0].checkoutKey);
    const sentB = server.requests.filter((x) => x.checkoutKey === pending[1].checkoutKey);
    expect(sentA.every((x) => x.customerCode === 'WALK-IN')).toBe(true);
    expect(sentB.every((x) => x.customerCode === '02650')).toBe(true);
  });

  it('a pending delivery order and a pending counter sale do not gate or reuse each other', async () => {
    const lossy = { send: async () => { throw networkError(); } };
    await submitCheckout({ operationType: OPERATION_TYPES.DELIVERY, payload: sale({ paymentMode: 'Delivery' }), context: ctx() }, lossy).catch(() => {});
    const confirmSeparateSale = vi.fn(() => false);
    const send = vi.fn(async () => ({ id: 2 }));
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx(), confirmSeparateSale }, { send });
    expect(confirmSeparateSale).not.toHaveBeenCalled();
    const rows = await rowsOf();
    expect(new Set(rows.map((r) => r.checkoutKey)).size).toBe(2);
  });
});

describe('11. tenant, branch, terminal, session and operator boundaries', () => {
  const pendOne = async (c) => submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: c }, { send: async () => { throw networkError(); } }).catch(() => {});

  it.each([
    ['tenant', { tenant: 'https://other-tenant.example' }],
    ['branch', { branchId: 2 }],
    ['terminal', { terminalId: 'T002' }],
  ])('a different %s neither lists nor replays the record', async (_l, over) => {
    await pendOne(ctx());
    const [r] = await rowsOf();
    expect(await listPendingCheckouts(ctx(over))).toEqual([]);
    await expect(replayPendingCheckout(r.checkoutKey, ctx(over), {}, { send: vi.fn() })).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_OTHER_SCOPE' });
    await expect(reconcilePendingCheckout(r.checkoutKey, ctx(over), { lookup: vi.fn() })).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_OTHER_SCOPE' });
  });

  it('a different session never reuses the record\'s key and is not gated by it', async () => {
    await pendOne(ctx());
    const confirmSeparateSale = vi.fn(() => false);
    const send = vi.fn(async () => ({ id: 1 }));
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx({ sessionId: 52 }), confirmSeparateSale }, { send });
    const [old] = (await rowsOf()).filter((r) => r.context.sessionId === '51');
    expect(send.mock.calls[0][0].checkoutKey).not.toBe(old.checkoutKey);
    expect(old.state).toBe(STATES.UNCERTAIN);
    expect(confirmSeparateSale).not.toHaveBeenCalled();
  });

  it('another operator (after a sign-out and sign-in) sees it, can check it, but cannot send it as theirs', async () => {
    await pendOne(ctx());
    const other = ctx({ operator: 'admin' });
    const [r] = await listPendingCheckouts(other);
    expect(r.context.operator).toBe('cashier1@test.com');
    const send = vi.fn();
    await expect(replayPendingCheckout(r.checkoutKey, other, {}, { send })).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_OTHER_OPERATOR' });
    expect(send).not.toHaveBeenCalled();
    // Identical basket rung by the other operator: never the first operator's key.
    const send2 = vi.fn(async () => ({ id: 1 }));
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: other, confirmSeparateSale: () => true }, { send: send2 });
    expect(send2.mock.calls[0][0].checkoutKey).not.toBe(r.checkoutKey);
    // The read-only check is allowed.
    const checked = await reconcilePendingCheckout(r.checkoutKey, other, { lookup: async () => ({ found: false, recorded: 'NO' }) });
    expect(checked.lookup.recorded).toBe('NO');
  });

  it('signing out deletes nothing: the record is still there for the next sign-in', async () => {
    await pendOne(ctx());
    sessionStorage.removeItem('token');
    reload();
    expect(await listPendingCheckouts(ctx())).toHaveLength(1);
  });
});

describe('12. no durable state, no request', () => {
  it('IndexedDB missing: refuses before sending', async () => {
    const saved = globalThis.indexedDB;
    globalThis.indexedDB = undefined;
    const send = vi.fn();
    try {
      await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send }))
        .rejects.toBeInstanceOf(PendingCheckoutStorageError);
    } finally { globalThis.indexedDB = saved; }
    expect(send).not.toHaveBeenCalled();
  });

  it('IndexedDB refusing to open (private mode): refuses before sending', async () => {
    const saved = globalThis.indexedDB;
    globalThis.indexedDB = { open: () => { throw Object.assign(new Error('The user denied permission'), { name: 'InvalidStateError' }); } };
    const send = vi.fn();
    try {
      await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send }))
        .rejects.toMatchObject({ code: 'CHECKOUT_NOT_PERSISTED' });
    } finally { globalThis.indexedDB = saved; }
    expect(send).not.toHaveBeenCalled();
  });

  it('quota exceeded on the write: refuses before sending', async () => {
    const send = vi.fn();
    const full = { ...store, findOrCreateOperation: async () => { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); } };
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send, store: full }))
      .rejects.toBeInstanceOf(PendingCheckoutStorageError);
    expect(send).not.toHaveBeenCalled();
  });

  it('the SENT transition failing: refuses before sending', async () => {
    const send = vi.fn();
    const broken = { ...store, mutateOperation: async () => { throw new store.PendingCheckoutStorageError('write aborted'); } };
    await expect(submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send, store: broken }))
      .rejects.toBeInstanceOf(PendingCheckoutStorageError);
    expect(send).not.toHaveBeenCalled();
  });

  it('a tampered saved payload is never replayed', async () => {
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => { throw networkError(); } }).catch(() => {});
    const [r] = await rowsOf();
    // Edit the stored payload behind the module's back.
    const db = await new Promise((res) => { const q = indexedDB.open(store.DB_NAME, store.DB_VERSION); q.onsuccess = () => res(q.result); });
    await new Promise((res) => { const tx = db.transaction(store.STORE, 'readwrite'); tx.objectStore(store.STORE).put({ ...r, payload: { ...r.payload, customerCode: 'EVIL' } }); tx.oncomplete = res; });
    db.close();
    const send = vi.fn();
    await expect(replayPendingCheckout(r.checkoutKey, ctx(), {}, { send })).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_CORRUPT' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('dismissal rules (M2.2.3: "nothing found" never closes a record)', () => {
  it('a record the server has no sale for cannot be dismissed, however long ago it was sent', async () => {
    let now = 1_000_000;
    const deps = { now: () => now, send: async () => { throw networkError(); } };
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, deps).catch(() => {});
    const [r] = await rowsOf();
    now += 24 * 60 * 60 * 1000;
    const checked = await reconcilePendingCheckout(r.checkoutKey, ctx(), { ...deps, lookup: async () => ({ found: false, recorded: 'NO' }) });
    expect(checked.state).toBe(STATES.UNCERTAIN);
    await expect(dismissPendingCheckout(r.checkoutKey, ctx(), {}, deps)).rejects.toMatchObject({ code: 'PENDING_CHECKOUT_UNKNOWN' });
    expect((await store.getOperation(r.checkoutKey)).state).toBe(STATES.UNCERTAIN);
  });

  it.each(['FAILED', 'RELEASED'])('a server attempt %s with nothing recorded does not close the record on the reload check', async (state) => {
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => { throw networkError(); } }).catch(() => {});
    const [r] = await rowsOf();
    const after = await reconcilePendingCheckout(r.checkoutKey, ctx(), { lookup: async () => ({ found: true, state, recorded: 'NO', sameRequest: true }) });
    expect(after.state).toBe(STATES.UNCERTAIN);
    expect(after.lookup).toMatchObject({ recorded: 'NO', serverState: state });
  });
});

describe('13. every caller of POST /api/pos/checkout uses the shared operation', () => {
  // Source-level: the only code that may call posApi.posCheckout is checkoutOperation.js.
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../../../..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
    return /\.(js|jsx|ts|tsx)$/.test(e.name) ? [p] : [];
  });

  it('useCheckout (counter sale) and POSSales.handleOutForDelivery (delivery) both call submitCheckout', () => {
    const useCheckout = read('pages/Sales/POS/features/checkout/useCheckout.js');
    const posSales = read('pages/Sales/POSSales.jsx');
    expect(useCheckout).toMatch(/await submitCheckout\(\{\s*operationType: OPERATION_TYPES\.SALE,/);
    const delivery = posSales.slice(posSales.indexOf('const handleOutForDelivery = useCallback('));
    expect(delivery.slice(0, delivery.indexOf('}, ['))).toMatch(/await submitCheckout\(\{\s*operationType: OPERATION_TYPES\.DELIVERY,/);
  });

  it('no production module other than checkoutOperation.js calls posCheckout or builds a checkout key', () => {
    const offenders = walk(root).filter((f) => !f.endsWith(path.join('checkout', 'checkoutOperation.js')))
      .filter((f) => !f.endsWith(path.join('api', 'posApi.js')))
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        return /\bposCheckout\s*\(/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))
          || /newCheckoutKey\s*\(/.test(src) && !f.endsWith(path.join('checkout', 'checkoutKey.js'));
      });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe('found in the browser run (tools/pos-checkout-recovery)', () => {
  it('a key held by a DIFFERENT request is a conflict in every server state, not "in progress"', async () => {
    for (const state of ['ACTIVE', 'STALLED', 'FAILED']) {
      globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
      await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => { throw networkError(); } }).catch(() => {});
      const [r] = await rowsOf();
      const recorded = { ACTIVE: 'UNKNOWN', STALLED: 'PARTIAL', FAILED: 'NO' }[state];
      const after = await reconcilePendingCheckout(r.checkoutKey, ctx(), { lookup: async () => ({ found: true, state, recorded, sameRequest: false }) });
      expect(after.state, state).toBe(STATES.KEY_CONFLICT);
    }
  });

  it('a sale finished with "Send again" stays on the notice, with its invoice, until acknowledged', async () => {
    await submitCheckout({ operationType: OPERATION_TYPES.SALE, payload: sale(), context: ctx() }, { send: async () => { throw networkError(); } }).catch(() => {});
    const [r] = await listPendingCheckouts(ctx());
    await replayPendingCheckout(r.checkoutKey, ctx(), {}, { send: async () => ({ id: 5, invoiceNumber: 'SI-5' }) });
    const [shown] = await listPendingCheckouts(ctx());
    expect(shown).toMatchObject({ state: STATES.COMPLETED, result: { invoiceNumber: 'SI-5' } });
    await dismissPendingCheckout(r.checkoutKey, ctx());
    expect(await listPendingCheckouts(ctx())).toEqual([]);
  });
});
