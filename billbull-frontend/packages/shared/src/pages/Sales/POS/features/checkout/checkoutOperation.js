/**
 * The one checkout-operation lifecycle for POST /api/pos/checkout (Phase 0 / M2.2.2, M2.2.3). Every
 * caller that records an invoice through that endpoint goes through submitCheckout: the main settle
 * (useCheckout.processPayment) and Out for Delivery (POSSales.handleOutForDelivery). There is no
 * other key generation or retry policy.
 *
 * Lifecycle of one operation (one checkout key, one immutable payload):
 *
 *   submitCheckout ─▶ PENDING (committed to IndexedDB) ─▶ SENT ─▶ POST /api/pos/checkout
 *                                                              │
 *       200 ───────────────────────────────────────────────────┼─▶ COMPLETED   (resolved, archived)
 *       proven refusal, no earlier request unaccounted for ────┼─▶ REFUSED     (resolved, same key reusable)
 *       409 CHECKOUT_ABANDONED ────────────────────────────────┼─▶ ABANDONED   (resolved, key dead)
 *       no answer / timeout / 408 / 5xx / IN_PROGRESS / ...  ──┼─▶ UNCERTAIN   (unresolved: kept)
 *       a refusal while an earlier request may still arrive ───┼─▶ UNCERTAIN
 *       CHECKOUT_KEY_REUSED (or lookup: key holds another sale)┴─▶ KEY_CONFLICT (unresolved: explicit)
 *   cashier abandons it and the SERVER confirms ABANDONED ─────────▶ ABANDONED (resolved)
 *   cashier acknowledges a KEY_CONFLICT ───────────────────────────▶ DISMISSED (resolved)
 *
 * Rules:
 *  - The record (key + exact payload + hash + context) is committed before the request goes out.
 *    If it cannot be, nothing is sent (PendingCheckoutStorageError). There is no fallback that
 *    sends an unprotected checkout.
 *  - The same sale (same payload hash, same tenant/branch/terminal/session/operator, same type)
 *    while an operation is unresolved, or after a proven refusal, reuses that operation: same key,
 *    same stored payload. The decision and the creation run in ONE IndexedDB readwrite transaction
 *    (pendingCheckoutStore.findOrCreateOperation), so two tabs of the same till can never create two
 *    keys for the same pending sale. Supervisor credentials ride along but are never stored.
 *  - A different sale while one is unresolved is not sent until the caller confirms it is a new,
 *    separate sale (confirmSeparateSale). It then gets a new key.
 *  - Only one tab sends an operation at a time: sending takes a lease on the record (owner tab id +
 *    expiry, renewed while the request is out, released when it ends or the page is hidden). A lease
 *    of a tab that crashed or closed expires and is reclaimed by the next send. The lease is
 *    coordination only: correctness still rests on the server's idempotency and fencing, and every
 *    send, from any tab, uses the original key and the exact stored payload.
 *  - A refusal (`recorded: false`) or a lookup that finds nothing proves only that the request it
 *    answered recorded nothing. While an earlier request of the operation is unaccounted for (it got
 *    no answer, or the page died with it out), such an answer never resolves the operation. It is
 *    resolved only by a recorded sale (COMPLETED) or by the server confirming the key is ABANDONED,
 *    which makes any late copy of the request harmless (the server refuses it before any write).
 *  - Nothing generates a replacement key for an unresolved operation.
 *  - Records are scoped by tenant (the API origin), branch and terminal, and carry the session and
 *    the operator. A replay is refused when the signed-in operator, tenant, branch or terminal
 *    differs from the record's. Signing out deletes nothing.
 *  - After local data loss (site data cleared, another browser profile), discoverServerCheckouts
 *    lists what the server received under keys this till no longer has. A sale whose request never
 *    reached the server cannot be reconstructed from anywhere.
 */
import api from '../../../../../api/axiosConfig';
import { getUsernameFromToken } from '../../../../../api/auth';
import * as posApi from '../../../../../api/posApi';
import {
  classifyCheckoutFailure, credentialsOf, newCheckoutKey, PAYLOAD_HASH_ALGORITHM, payloadHash, saleOf,
} from './checkoutKey';
import * as defaultStore from './pendingCheckoutStore';
import { PendingCheckoutStorageError } from './pendingCheckoutStore';

export { PendingCheckoutStorageError };

export const OPERATION_TYPES = Object.freeze({ SALE: 'SALE', DELIVERY: 'DELIVERY' });
/** A local placeholder for an attempt found on the server after local data loss (no payload). */
export const SERVER_RECOVERED = 'SERVER_RECOVERED';

export const STATES = Object.freeze({
  PENDING: 'PENDING',
  SENT: 'SENT',
  UNCERTAIN: 'UNCERTAIN',
  KEY_CONFLICT: 'KEY_CONFLICT',
  COMPLETED: 'COMPLETED',
  REFUSED: 'REFUSED',
  ABANDONED: 'ABANDONED',
  DISMISSED: 'DISMISSED',
});

const UNRESOLVED = new Set([STATES.PENDING, STATES.SENT, STATES.UNCERTAIN, STATES.KEY_CONFLICT]);
export const isUnresolved = (r) => !!r && UNRESOLVED.has(r.state);
export const isResolved = (r) => !!r && !UNRESOLVED.has(r.state);

/** Resolved records are kept this long (for the recovery notice and for support), then purged. */
export const RESOLVED_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** How long a tab's send lease lasts without renewal, and how often a live send renews it. */
export const LEASE_MS = 30 * 1000;
export const LEASE_RENEW_MS = 10 * 1000;

/** How far back the server is asked about checkouts this till no longer holds. */
export const SERVER_DISCOVERY_HOURS = 72;

/** This page load. A reload or a second tab is a different id; a crashed tab's lease simply expires. */
export const TAB_ID = newCheckoutKey();

/** A new sale was refused because an earlier one on this till is unresolved, or the action is not allowed. */
export class CheckoutBlockedError extends Error {
  constructor(message, { code, blockers = [], record = null } = {}) {
    super(message);
    this.name = 'CheckoutBlockedError';
    this.code = code;
    this.blockers = blockers;
    this.record = record;
  }
}

const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));

/**
 * The context a checkout belongs to. Identifiers only; the operator is the JWT subject, read from
 * the token rather than from anything the page can edit.
 */
export const checkoutContext = ({ currentSession, currentTerminal } = {}, { operator } = {}) => {
  let tenant = null;
  try {
    tenant = str(api?.defaults?.baseURL) || (typeof window !== 'undefined' ? window.location.origin : null);
  } catch { /* no window */ }
  let op = operator;
  if (op === undefined) {
    try { op = getUsernameFromToken(); } catch { op = null; }
  }
  return {
    tenant: str(tenant),
    branchId: str(currentTerminal?.branchId ?? currentSession?.branchId),
    terminalId: str(currentTerminal?.terminalId ?? currentSession?.terminalId),
    sessionId: str(currentSession?.id),
    operator: str(op),
  };
};

export const scopeKeyOf = (ctx) => [ctx?.tenant, ctx?.branchId, ctx?.terminalId].map((v) => v ?? '-').join('|');

const sameContext = (a, b) => a && b
  && a.tenant === b.tenant && a.branchId === b.branchId && a.terminalId === b.terminalId
  && a.sessionId === b.sessionId && a.operator === b.operator;

const responseSummary = (err, classification, at) => {
  const res = err?.response;
  const data = res?.data && typeof res.data === 'object' ? res.data : null;
  const message = data?.message || (typeof res?.data === 'string' ? res.data : null) || err?.message || null;
  return {
    classification,
    status: res?.status ?? null,
    code: data?.code ?? null,
    message: typeof message === 'string' ? message.slice(0, 500) : null,
    invoiceNumber: data?.invoiceNumber ?? null,
    at,
  };
};

// Resolved at call time, through the module namespace, so a test that mocks posApi only has to
// provide the calls it actually exercises.
const defaults = {
  store: defaultStore,
  send: (body) => posApi.posCheckout(body),
  lookup: (body) => posApi.lookupPosCheckoutAttempt(body),
  abandon: (body, reason) => posApi.abandonPosCheckoutAttempt(body, reason),
  recoverable: (params) => posApi.listRecoverablePosCheckoutAttempts(params),
  now: () => Date.now(),
  tabId: TAB_ID,
  renewMs: LEASE_RENEW_MS,
};
const withDeps = (deps) => ({ ...defaults, ...(deps || {}) });

const notify = (d, key) => { try { d.store.notifyChanged?.(key); } catch { /* best effort */ } };

/** The stored payload is intact: recompute its hash. */
export const verifyIntegrity = (record) => !!record && record.hashAlgorithm === PAYLOAD_HASH_ALGORITHM
  && payloadHash(record.payload) === record.payloadHash;

/** Another live tab (not this page load) is sending this operation right now. */
export const heldByAnotherTab = (record, { tabId = TAB_ID, now = Date.now() } = {}) => !!record?.owner
  && record.owner.tabId !== tabId && (record.owner.leaseUntil || 0) > now;

/**
 * Some request of this operation went out and is unaccounted for: it got no answer, or the page died
 * while it was out. Such a request can still reach the server later.
 */
const unaccountedFor = (record) => !!record && (!!record.unaccounted || record.state === STATES.SENT);

/**
 * Maps a lookup answer onto the record. `requestEnded` says the till's own request has just been
 * answered; `mayStillArrive` says an earlier request is unaccounted for. "Nothing under this key" is
 * final only when the request ended AND no earlier one is unaccounted for.
 */
const applyLookup = (status, { requestEnded, mayStillArrive }) => {
  const lookup = {
    recorded: status?.recorded ?? null,
    found: !!status?.found,
    serverState: status?.state ?? null,
    sameRequest: status?.sameRequest ?? null,
    invoiceNumber: status?.invoiceNumber ?? null,
  };
  // Terminal on the server: no request under this key can ever record a sale.
  if (status?.state === 'ABANDONED') return { state: STATES.ABANDONED, lookup };
  // The key's journal row belongs to a different request: whatever its state, this sale can never
  // be recorded under this key (the server would answer CHECKOUT_KEY_REUSED). Explicit resolution.
  if (status?.found && status.sameRequest === false) return { state: STATES.KEY_CONFLICT, lookup };
  if (status?.recorded === 'YES') {
    return { state: STATES.COMPLETED, lookup, result: { invoiceId: status.invoiceId ?? null, invoiceNumber: status.invoiceNumber ?? null } };
  }
  if (status?.recorded === 'NO') {
    if (requestEnded && !mayStillArrive) return { state: STATES.REFUSED, lookup };
    return { state: null, lookup }; // not proof: an earlier request may still arrive
  }
  return { state: STATES.UNCERTAIN, lookup }; // PARTIAL (stalled) or UNKNOWN (in progress)
};

// ------------------------------------------------------------------ tab lease

const heldKeys = new Set();
let pagehideBound = false;

/** Best effort: a page being hidden (reload, close, navigation) gives its leases up at once. */
const bindPagehide = (d) => {
  if (pagehideBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  pagehideBound = true;
  window.addEventListener('pagehide', () => {
    heldKeys.forEach((key) => {
      d.store.mutateOperation(key, (cur) => (cur?.owner?.tabId === d.tabId ? { owner: null } : null)).catch(() => {});
    });
  });
};

const ALREADY = Symbol('already-resolved');

const send = async (record, credentials, d, { recovery = false } = {}) => {
  const at = d.now();
  // The durable state change and the lease come first, atomically: a record that says SENT is one
  // whose request may be out, and no other tab may send it while this tab's lease is live.
  let sent;
  try {
    ({ record: sent } = await d.store.mutateOperation(record.checkoutKey, (cur) => {
      if (!cur) throw new CheckoutBlockedError('That checkout is no longer saved on this till.', { code: 'PENDING_CHECKOUT_MISSING' });
      if (!isUnresolved(cur) && cur.state !== STATES.REFUSED) {
        throw Object.assign(new CheckoutBlockedError(cur.state === STATES.COMPLETED
          ? `This sale is already recorded${cur.result?.invoiceNumber ? ` as ${cur.result.invoiceNumber}` : ''}. It was not sent again.`
          : 'This sale was closed on this till (abandoned or dismissed). It was not sent.',
        { code: cur.state === STATES.COMPLETED ? 'PENDING_CHECKOUT_ALREADY_RECORDED' : 'PENDING_CHECKOUT_CLOSED', record: cur }), { [ALREADY]: true });
      }
      if (cur.state === STATES.KEY_CONFLICT) {
        throw new CheckoutBlockedError('This checkout key already belongs to a different sale on the server. It cannot be sent again; resolve it instead.', { code: 'PENDING_CHECKOUT_CONFLICT', record: cur });
      }
      if (heldByAnotherTab(cur, { tabId: d.tabId, now: at })) {
        throw new CheckoutBlockedError('This sale is being sent from another tab or window of this till. Wait for it there; it was not sent again here.', { code: 'PENDING_CHECKOUT_OTHER_TAB', record: cur });
      }
      return {
        state: STATES.SENT,
        attempts: (cur.attempts || 0) + 1,
        lastSentAt: at,
        updatedAt: at,
        unaccounted: unaccountedFor(cur),
        owner: { tabId: d.tabId, leaseUntil: at + LEASE_MS },
      };
    }));
  } catch (err) {
    if (err instanceof CheckoutBlockedError || err instanceof PendingCheckoutStorageError) throw err;
    throw new PendingCheckoutStorageError(`the sale could not be marked as sent on this till (${err?.message || err})`, err);
  }
  notify(d, sent.checkoutKey);
  heldKeys.add(sent.checkoutKey);
  bindPagehide(d);
  const renew = setInterval(() => {
    d.store.mutateOperation(sent.checkoutKey, (cur) => (cur?.owner?.tabId === d.tabId && cur.state === STATES.SENT
      ? { owner: { tabId: d.tabId, leaseUntil: d.now() + LEASE_MS } } : null)).catch(() => {});
  }, d.renewMs);
  try {
    const invoice = await d.send({ ...sent.payload, checkoutKey: sent.checkoutKey, ...credentials });
    const done = d.now();
    try {
      await d.store.updateOperation(sent.checkoutKey, {
        state: STATES.COMPLETED,
        result: { invoiceId: invoice?.id ?? null, invoiceNumber: invoice?.invoiceNumber ?? null, invoiceTotal: invoice?.invoiceTotal ?? null },
        lastResponse: { classification: 'completed', status: 200, at: done },
        updatedAt: done,
        unaccounted: false,
        owner: null,
        // Finished from the recovery notice: keep it on the notice until the cashier acknowledges it.
        ...(recovery ? { recoveredAfterReload: true } : {}),
      });
    } catch (err) {
      // The sale stands. The record still says SENT, so the next load reconciles it to COMPLETED.
      console.warn('POS checkout recorded, but its pending record could not be closed', err);
    }
    return invoice;
  } catch (err) {
    if (err instanceof PendingCheckoutStorageError) throw err;
    await resolveFailure(sent, err, d);
    throw err;
  } finally {
    clearInterval(renew);
    heldKeys.delete(sent.checkoutKey);
    notify(d, sent.checkoutKey);
  }
};

const resolveFailure = async (record, err, d) => {
  let classification = classifyCheckoutFailure(err);
  const at = d.now();
  const status = err?.response?.status;
  // This request's own fate: unknown without an answer, or behind a gateway timeout/error.
  const thisMayArrive = classification === 'uncertain' && (!err?.response || status === 408 || status >= 500);
  const earlierMayArrive = !!record.unaccounted;
  const patch = {
    lastResponse: responseSummary(err, classification, at), updatedAt: at, owner: null,
    unaccounted: earlierMayArrive || thisMayArrive,
  };
  if (classification === 'abandoned') patch.state = STATES.ABANDONED;
  else if (classification === 'uncertain') patch.state = STATES.UNCERTAIN;
  else if (classification === 'keyConflict') patch.state = STATES.KEY_CONFLICT;
  else if (classification === 'refused') {
    // Proves only that THIS request recorded nothing. An earlier one may still arrive.
    patch.state = earlierMayArrive ? STATES.UNCERTAIN : STATES.REFUSED;
    if (earlierMayArrive) {
      classification = 'uncertain';
      patch.lastResponse = { ...patch.lastResponse, classification: 'refused→uncertain (an earlier request may still arrive)' };
    }
  } else {
    // Unexplained refusal: ask the server, read-only, whether anything stands under the key.
    try {
      if (typeof d.lookup !== 'function') throw new Error('status lookup unavailable');
      const st = await d.lookup({ ...record.payload, checkoutKey: record.checkoutKey });
      const applied = applyLookup(st, { requestEnded: true, mayStillArrive: earlierMayArrive });
      patch.state = applied.state || STATES.UNCERTAIN;
      patch.lookup = { ...applied.lookup, at };
      if (applied.result) patch.result = applied.result;
      classification = patch.state === STATES.REFUSED ? 'refused'
        : patch.state === STATES.ABANDONED ? 'abandoned' : 'uncertain';
    } catch (lookupErr) {
      patch.state = STATES.UNCERTAIN;
      patch.lookup = { error: String(lookupErr?.message || lookupErr).slice(0, 200), at };
      classification = 'uncertain';
    }
    patch.lastResponse = { ...patch.lastResponse, classification: `unverified→${classification}` };
  }
  if (patch.state === STATES.ABANDONED) {
    patch.resolution = { by: null, at, reason: 'the server reports this checkout key as abandoned', fromState: record.state };
    patch.unaccounted = false;
  }
  try {
    await d.store.updateOperation(record.checkoutKey, patch);
  } catch (storeErr) {
    // The record stays as it was (SENT, unresolved), which is the safe side.
    console.warn('POS checkout pending record could not be updated', storeErr);
  }
  err.checkoutOutcome = patch.state === STATES.REFUSED ? 'refused'
    : patch.state === STATES.ABANDONED ? 'abandoned'
      : patch.state === STATES.KEY_CONFLICT ? 'keyConflict' : 'uncertain';
  err.pendingCheckout = { ...record, ...patch };
};

/**
 * Persists, then sends, one invoice-producing checkout. Resolves with the server's invoice.
 *
 * @param {object} args
 * @param {'SALE'|'DELIVERY'} args.operationType
 * @param {object} args.payload   the request as built, supervisor credentials included if any
 * @param {object} args.context   checkoutContext(...)
 * @param {object} [args.summary] display-only facts (customerName, itemCount, total)
 * @param {(blockers: object[]) => boolean|Promise<boolean>} [args.confirmSeparateSale]
 *        asked when a different sale is submitted while an earlier one is unresolved
 * @throws PendingCheckoutStorageError nothing was sent: the record could not be committed
 * @throws CheckoutBlockedError        nothing was sent: an earlier sale is unresolved, or another tab
 *                                     is sending this one
 * @throws the request error, with err.checkoutOutcome ('uncertain'|'keyConflict'|'refused'|'abandoned')
 *         and err.pendingCheckout (the record as now stored)
 */
export const submitCheckout = async ({ operationType, payload, context, summary = null, confirmSeparateSale } = {}, deps) => {
  const d = withDeps(deps);
  const sale = saleOf(payload);
  const credentials = credentialsOf(payload);
  const hash = payloadHash(sale);
  const scopeKey = scopeKeyOf(context);

  const isSameSale = (r) => r.operationType === operationType && r.payloadHash === hash
    && sameContext(r.context, context) && ((isUnresolved(r) && r.state !== STATES.KEY_CONFLICT) || r.state === STATES.REFUSED);
  const blockersOf = (rows) => rows.filter((r) => isUnresolved(r) && r.operationType === operationType
    && r.context?.sessionId === context?.sessionId);

  // A first, read-only look decides whether the cashier must be asked (that cannot happen inside a
  // transaction). The decision that counts is taken again below, atomically.
  let records;
  try {
    records = await d.store.listOperations(scopeKey);
  } catch (err) {
    throw err instanceof PendingCheckoutStorageError ? err
      : new PendingCheckoutStorageError(`pending checkouts could not be read (${err?.message || err})`, err);
  }
  const seenSame = records.find(isSameSale) || null;
  const confirmed = new Set();
  if (!seenSame) {
    const blockers = blockersOf(records);
    if (blockers.length) {
      const ok = confirmSeparateSale ? await confirmSeparateSale(blockers) : false;
      if (!ok) {
        throw new CheckoutBlockedError(
          'An earlier sale on this till has not been confirmed by the server, so this one was not sent. '
          + 'Resolve the earlier sale first (see the unresolved checkout notice), or settle again and confirm this is a new, separate sale.',
          { code: 'EARLIER_CHECKOUT_UNRESOLVED', blockers },
        );
      }
      blockers.forEach((b) => confirmed.add(b.checkoutKey));
    }
  }

  const at = d.now();
  let chosen;
  try {
    chosen = await d.store.findOrCreateOperation(scopeKey, (rows) => {
      const same = rows.find(isSameSale);
      if (same) return { use: same };
      if (seenSame) {
        // The operation seen a moment ago was resolved meanwhile (another tab finished it).
        const now = rows.find((r) => r.checkoutKey === seenSame.checkoutKey);
        if (now?.state === STATES.COMPLETED) {
          throw new CheckoutBlockedError(`This sale was just recorded${now.result?.invoiceNumber ? ` as ${now.result.invoiceNumber}` : ''} from another tab of this till. It was not sent again.`,
            { code: 'PENDING_CHECKOUT_ALREADY_RECORDED', record: now });
        }
      }
      const blockers = blockersOf(rows);
      const unconfirmed = blockers.filter((b) => !confirmed.has(b.checkoutKey));
      if (unconfirmed.length) {
        throw new CheckoutBlockedError(
          'Another sale on this till became unresolved a moment ago (another tab?), so this one was not sent. Check the unresolved checkout notice, then settle again.',
          { code: 'EARLIER_CHECKOUT_UNRESOLVED', blockers: unconfirmed },
        );
      }
      return {
        create: {
          checkoutKey: newCheckoutKey(),
          schemaVersion: 1,
          operationType,
          payload: sale,
          payloadHash: hash,
          hashAlgorithm: PAYLOAD_HASH_ALGORITHM,
          scopeKey,
          context: { ...context },
          summary: summary ? JSON.parse(JSON.stringify(summary)) : null,
          createdAt: at,
          updatedAt: at,
          state: STATES.PENDING,
          attempts: 0,
          lastResponse: null,
          owner: null,
          unaccounted: false,
          separateFrom: blockers.map((b) => b.checkoutKey),
        },
      };
    });
  } catch (err) {
    if (err instanceof CheckoutBlockedError || err instanceof PendingCheckoutStorageError) throw err;
    throw new PendingCheckoutStorageError(`the sale could not be saved on this till (${err?.message || err})`, err);
  }
  const record = chosen.record;
  if (!chosen.created && !verifyIntegrity(record)) {
    throw new CheckoutBlockedError('The saved copy of this sale failed its integrity check, so it was not sent. Ask a supervisor.', {
      code: 'PENDING_CHECKOUT_CORRUPT', record,
    });
  }
  if (chosen.created) notify(d, record.checkoutKey);
  return send(record, credentials, d);
};

/** Records of the context's tenant/branch/terminal: unresolved ones, plus unacknowledged recoveries. */
export const listPendingCheckouts = async (context, deps) => {
  const d = withDeps(deps);
  const rows = await d.store.listOperations(scopeKeyOf(context));
  return rows.filter((r) => isUnresolved(r) || (r.recoveredAfterReload && !r.acknowledgedAt));
};

/** Deletes resolved records past retention. Unresolved records are never deleted. */
export const purgeOldPendingCheckouts = async (deps) => {
  const d = withDeps(deps);
  return d.store.purgeResolved(isResolved, d.now() - RESOLVED_RETENTION_MS);
};

const assertOwnScope = (record, context) => {
  if (!record) throw new CheckoutBlockedError('That checkout is no longer saved on this till.', { code: 'PENDING_CHECKOUT_MISSING' });
  const c = record.context || {};
  if (c.tenant !== context?.tenant || c.branchId !== context?.branchId || c.terminalId !== context?.terminalId) {
    throw new CheckoutBlockedError('That checkout belongs to another server, branch or terminal.', { code: 'PENDING_CHECKOUT_OTHER_SCOPE', record });
  }
};

/**
 * Asks the server, read-only, what stands under an unresolved record's key, and stores the answer.
 * Allowed for any operator of the same scope: it records nothing. "Nothing under this key" never
 * resolves a record here: the request may still be on its way.
 */
export const reconcilePendingCheckout = async (checkoutKey, context, deps, { afterReload = true } = {}) => {
  const d = withDeps(deps);
  const record = await d.store.getOperation(checkoutKey);
  assertOwnScope(record, context);
  if (!isUnresolved(record)) return record;
  const at = d.now();
  let patch;
  try {
    const status = await d.lookup({ ...record.payload, checkoutKey: record.checkoutKey });
    const applied = applyLookup(status, { requestEnded: false, mayStillArrive: true });
    patch = { lookup: { ...applied.lookup, at }, updatedAt: at };
    if (applied.state) patch.state = applied.state;
    if (applied.result) patch.result = applied.result;
    if (applied.state === STATES.COMPLETED && afterReload) patch.recoveredAfterReload = true;
    if (applied.state === STATES.ABANDONED) {
      patch.resolution = { by: null, at, reason: 'the server reports this checkout key as abandoned', fromState: record.state };
    }
    if (applied.state === STATES.COMPLETED || applied.state === STATES.ABANDONED) {
      patch.unaccounted = false;
      if (!heldByAnotherTab(record, { tabId: d.tabId, now: at })) patch.owner = null;
    }
  } catch (err) {
    patch = { lookup: { error: String(err?.response?.data?.message || err?.message || err).slice(0, 200), at }, updatedAt: at };
  }
  // Applied only if the record is still unresolved: another tab may have finished it meanwhile.
  const { record: out } = await d.store.mutateOperation(checkoutKey, (cur) => (isUnresolved(cur) ? patch : null));
  notify(d, checkoutKey);
  return out;
};

/**
 * Re-sends an unresolved record exactly as saved, under its own key. Only for the operator who
 * started it, on the same tenant/branch/terminal, and only while no other tab is sending it.
 * Supervisor credentials, if the cashier enters them for this retry, ride along but are not stored.
 */
export const replayPendingCheckout = async (checkoutKey, context, { credentials = {} } = {}, deps) => {
  const d = withDeps(deps);
  const record = await d.store.getOperation(checkoutKey);
  assertOwnScope(record, context);
  if (!isUnresolved(record)) return record.result || null;
  if (record.state === STATES.KEY_CONFLICT) {
    throw new CheckoutBlockedError('This checkout key already belongs to a different sale on the server. It cannot be sent again; resolve it instead.', { code: 'PENDING_CHECKOUT_CONFLICT', record });
  }
  if (record.context?.operator !== context?.operator) {
    throw new CheckoutBlockedError(`This sale was started by ${record.context?.operator || 'another user'}. Only they can send it again; you can check its status.`, { code: 'PENDING_CHECKOUT_OTHER_OPERATOR', record });
  }
  if (!verifyIntegrity(record)) {
    throw new CheckoutBlockedError('The saved copy of this sale failed its integrity check, so it was not sent. Ask a supervisor.', { code: 'PENDING_CHECKOUT_CORRUPT', record });
  }
  return send(record, credentialsOf(credentials), d, { recovery: true });
};

/**
 * Explicit abandonment (M2.2.3): asks the server to abandon the key, with the stored key and exact
 * payload. The record is resolved (ABANDONED) only when the server confirms the key is terminally
 * ABANDONED. Any other answer (recorded, in progress, stalled, another request's key, no answer)
 * keeps the record, updated with what the server said; a recorded sale becomes COMPLETED.
 */
export const abandonPendingCheckout = async (checkoutKey, context, { reason } = {}, deps) => {
  const d = withDeps(deps);
  const record = await d.store.getOperation(checkoutKey);
  assertOwnScope(record, context);
  if (!isUnresolved(record)) return record;
  if (!verifyIntegrity(record)) {
    throw new CheckoutBlockedError('The saved copy of this sale failed its integrity check. Ask a supervisor.', { code: 'PENDING_CHECKOUT_CORRUPT', record });
  }
  let res;
  try {
    res = await d.abandon({ ...record.payload, checkoutKey: record.checkoutKey }, reason || undefined);
  } catch (err) {
    const data = err?.response?.data && typeof err.response.data === 'object' ? err.response.data : null;
    if (data?.status) {
      const at = d.now();
      const applied = applyLookup(data.status, { requestEnded: false, mayStillArrive: true });
      const patch = { lookup: { ...applied.lookup, at }, lastAbandon: { code: data.code ?? null, message: data.message ?? null, at }, updatedAt: at };
      if (applied.state) patch.state = applied.state;
      if (applied.result) { patch.result = applied.result; patch.recoveredAfterReload = true; }
      const { record: out } = await d.store.mutateOperation(checkoutKey, (cur) => (isUnresolved(cur) ? patch : null));
      notify(d, checkoutKey);
      err.pendingCheckout = out;
    }
    throw err;
  }
  if (!res?.terminal) {
    throw new CheckoutBlockedError('The server did not confirm the abandonment, so this sale stays unresolved.', { code: 'PENDING_CHECKOUT_NOT_ABANDONED', record });
  }
  const at = d.now();
  const { record: out } = await d.store.mutateOperation(checkoutKey, (cur) => (isUnresolved(cur) ? {
    state: STATES.ABANDONED,
    resolution: { by: context?.operator ?? null, at, reason: reason || 'abandoned on the server from the till', fromState: cur.state, serverOutcome: res.outcome ?? null },
    lookup: { recorded: 'NO', found: true, serverState: 'ABANDONED', sameRequest: res.status?.sameRequest ?? null, at },
    unaccounted: false,
    owner: null,
    updatedAt: at,
  } : null));
  notify(d, checkoutKey);
  return out;
};

/**
 * Closes a record by an explicit decision of the cashier, where that is safe without the server:
 * acknowledging a recovered completion, or a key conflict (the key holds another sale, so this sale
 * can never be recorded under it). Anything else must be abandoned on the server instead
 * (abandonPendingCheckout): "nothing found" does not prove that the request cannot still arrive.
 */
export const dismissPendingCheckout = async (checkoutKey, context, { reason } = {}, deps) => {
  const d = withDeps(deps);
  const record = await d.store.getOperation(checkoutKey);
  assertOwnScope(record, context);
  const at = d.now();
  if (record.state === STATES.COMPLETED) {
    await d.store.updateOperation(checkoutKey, { acknowledgedAt: at, acknowledgedBy: context?.operator ?? null, updatedAt: at });
    notify(d, checkoutKey);
    return d.store.getOperation(checkoutKey);
  }
  if (!isUnresolved(record)) return record;
  if (record.state !== STATES.KEY_CONFLICT) {
    throw new CheckoutBlockedError('The server has not confirmed what happened to this sale, so it cannot simply be dismissed. Check its status, or abandon it on the server.', { code: 'PENDING_CHECKOUT_UNKNOWN', record });
  }
  const out = await d.store.updateOperation(checkoutKey, {
    state: STATES.DISMISSED,
    resolution: { by: context?.operator ?? null, at, reason: reason || 'key conflict acknowledged', fromState: record.state },
    owner: null,
    updatedAt: at,
  });
  notify(d, checkoutKey);
  return out;
};

// ------------------------------------------------------------------ server recovery after local data loss

/**
 * What the server received for this branch (that the signed-in user may see) under keys this till
 * no longer holds locally: unresolved ones (in progress, stalled, failed/released and not recorded)
 * from any terminal, and recorded sales of this session or terminal. Abandoned keys are omitted
 * (nothing to do). A sale whose request never reached the server is not, and cannot be, listed.
 */
export const discoverServerCheckouts = async (context, deps) => {
  const d = withDeps(deps);
  if (!context?.branchId || typeof d.recoverable !== 'function') return [];
  const res = await d.recoverable({ branchId: context.branchId, sinceHours: SERVER_DISCOVERY_HOURS, limit: 200 });
  const local = new Set((await d.store.listOperations(scopeKeyOf(context))).map((r) => r.checkoutKey));
  return (res?.attempts || []).filter((a) => a && !local.has(a.checkoutKey)).filter((a) => {
    if (a.state === 'ABANDONED') return false;
    if (a.recorded === 'YES') {
      return (a.sessionId != null && String(a.sessionId) === context.sessionId)
        || (a.terminalId != null && String(a.terminalId) === context.terminalId);
    }
    return true;
  });
};

/** Hides a server-discovered checkout from the notice by keeping a payload-less local placeholder. */
export const acknowledgeServerCheckout = async (attempt, context, deps) => {
  const d = withDeps(deps);
  const at = d.now();
  const recorded = attempt?.recorded === 'YES';
  const placeholder = {
    checkoutKey: attempt.checkoutKey,
    schemaVersion: 1,
    operationType: SERVER_RECOVERED,
    payload: null,
    payloadHash: null,
    hashAlgorithm: null,
    scopeKey: scopeKeyOf(context),
    context: { ...context },
    summary: null,
    createdAt: at,
    updatedAt: at,
    state: recorded ? STATES.COMPLETED : STATES.DISMISSED,
    result: recorded ? { invoiceId: attempt.invoiceId ?? null, invoiceNumber: attempt.invoiceNumber ?? null } : null,
    serverState: attempt.state ?? null,
    acknowledgedAt: at,
    acknowledgedBy: context?.operator ?? null,
    resolution: recorded ? null : { by: context?.operator ?? null, at, reason: `acknowledged server state ${attempt.state}`, fromState: null },
  };
  try {
    await d.store.addOperation(placeholder);
  } catch (err) {
    if (err?.name !== 'ConstraintError') throw err; // already acknowledged in another tab
  }
  notify(d, attempt.checkoutKey);
  return placeholder;
};
