/**
 * Durable record of every invoice-producing checkout this browser has sent or is about to send
 * (Phase 0 / M2.2.2). One IndexedDB object store, keyed by checkout key.
 *
 * Why IndexedDB: the record must survive a reload, a crash and a tab close, and be written to
 * disk before the request goes out. React state, refs and sessionStorage do not survive all of
 * those (sessionStorage dies with the tab), so none of them is the authoritative record.
 *
 * Every write:
 *   - runs in its own readwrite transaction opened with `{ durability: 'strict' }` where the browser
 *     supports it (Chromium flushes to disk before `complete`). A browser that does not know the
 *     option ignores the dictionary member; one that rejects the argument outright is retried with
 *     no options, which is that browser's default durability;
 *   - resolves only on the transaction's `complete` event, never on a request's `success`, so a
 *     resolved promise means the record is committed.
 *
 * Immutable after creation: checkoutKey, operationType, payload, payloadHash, hashAlgorithm,
 * scopeKey, context, summary and createdAt. `update` refuses to change them.
 *
 * Never stored: passwords, PINs, tokens or other credentials. The payload is the sale only
 * (checkoutKey.saleOf strips the supervisor override fields), and context holds identifiers.
 *
 * Unavailable storage (no indexedDB, a private mode that refuses to open it, a quota error, a
 * blocked upgrade) rejects with PendingCheckoutStorageError. Callers must not send a checkout then.
 */

export const DB_NAME = 'billbull-pos-checkout';
export const DB_VERSION = 1;
export const STORE = 'operations';

const IMMUTABLE = ['checkoutKey', 'operationType', 'payload', 'payloadHash', 'hashAlgorithm', 'scopeKey', 'context', 'summary', 'createdAt'];

export class PendingCheckoutStorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PendingCheckoutStorageError';
    this.code = 'CHECKOUT_NOT_PERSISTED';
    this.cause = cause;
  }
}

const describe = (err) => {
  if (!err) return 'unknown error';
  if (err.name === 'QuotaExceededError') return 'browser storage is full (quota exceeded)';
  return `${err.name || 'Error'}: ${err.message || err}`;
};

let cached = null; // { factory, promise }

const factory = () => (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);

const openDb = () => {
  const idb = factory();
  if (!idb || typeof idb.open !== 'function') {
    return Promise.reject(new PendingCheckoutStorageError('IndexedDB is not available in this browser'));
  }
  if (cached && cached.factory === idb) return cached.promise;
  const promise = new Promise((resolve, reject) => {
    let req;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new PendingCheckoutStorageError(`IndexedDB could not be opened (${describe(err)})`, err));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'checkoutKey' });
        os.createIndex('scopeKey', 'scopeKey', { unique: false });
      }
    };
    req.onblocked = () => reject(new PendingCheckoutStorageError('IndexedDB upgrade is blocked by another open tab'));
    req.onerror = () => reject(new PendingCheckoutStorageError(`IndexedDB could not be opened (${describe(req.error)})`, req.error));
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading, or the browser closing the connection: drop it and reopen next time.
      db.onversionchange = () => { db.close(); if (cached?.promise === promise) cached = null; };
      db.onclose = () => { if (cached?.promise === promise) cached = null; };
      resolve(db);
    };
  });
  cached = { factory: idb, promise };
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise;
};

const transaction = (db, mode) => {
  if (mode !== 'readwrite') return db.transaction(STORE, mode);
  try {
    return db.transaction(STORE, mode, { durability: 'strict' });
  } catch (err) {
    if (err && err.name === 'TypeError') return db.transaction(STORE, mode);
    throw err;
  }
};

/**
 * Runs `work(objectStore, tx)` in one transaction and resolves with what `work` set as the result,
 * after the transaction completes.
 */
const run = async (mode, work) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = transaction(db, mode);
    } catch (err) {
      reject(new PendingCheckoutStorageError(`IndexedDB transaction failed (${describe(err)})`, err));
      return;
    }
    const box = { result: undefined, error: null };
    tx.oncomplete = () => (box.error ? reject(box.error) : resolve(box.result));
    tx.onabort = () => reject(box.error || new PendingCheckoutStorageError(`IndexedDB write was aborted (${describe(tx.error)})`, tx.error));
    tx.onerror = () => { /* surfaces as abort */ };
    try {
      work(tx.objectStore(STORE), box, tx);
    } catch (err) {
      box.error = err;
      try { tx.abort(); } catch { /* already finished */ }
    }
  });
};

const reqResult = (request, onValue) => {
  request.onsuccess = () => onValue(request.result);
};

/** Creates a record. Rejects if the key already exists (keys are never overwritten). */
export const addOperation = (record) => run('readwrite', (os, box) => {
  reqResult(os.add(record), () => { box.result = record; });
});

/**
 * Changes the mutable fields of one record and returns the record as stored. Rejects if the record
 * is missing or if `patch` touches an immutable field.
 */
export const updateOperation = (checkoutKey, patch) => run('readwrite', (os, box, tx) => {
  const bad = Object.keys(patch || {}).filter((k) => IMMUTABLE.includes(k));
  if (bad.length) throw new Error(`pending checkout ${checkoutKey}: ${bad.join(', ')} cannot change`);
  reqResult(os.get(checkoutKey), (current) => {
    if (!current) {
      box.error = new PendingCheckoutStorageError(`pending checkout ${checkoutKey} not found`);
      tx.abort();
      return;
    }
    const next = { ...current, ...patch };
    reqResult(os.put(next), () => { box.result = next; });
  });
});

/**
 * Read-modify-write of one record in ONE readwrite transaction (M2.2.3). IndexedDB runs readwrite
 * transactions on the same store one at a time, across every tab of the origin, so `decide` sees the
 * record as no other tab can change it until this transaction completes. `decide(current)` must be
 * synchronous and returns the patch to apply, or `null` to leave the record unchanged; it may throw to
 * refuse (the transaction aborts, nothing is written). Resolves with { record, changed }.
 */
export const mutateOperation = (checkoutKey, decide) => run('readwrite', (os, box, tx) => {
  reqResult(os.get(checkoutKey), (current) => {
    let patch;
    try {
      patch = decide(current || null);
    } catch (err) {
      box.error = err;
      try { tx.abort(); } catch { /* already finished */ }
      return;
    }
    if (!patch) { box.result = { record: current || null, changed: false }; return; }
    if (!current) {
      box.error = new PendingCheckoutStorageError(`pending checkout ${checkoutKey} not found`);
      tx.abort();
      return;
    }
    const bad = Object.keys(patch).filter((k) => IMMUTABLE.includes(k));
    if (bad.length) {
      box.error = new Error(`pending checkout ${checkoutKey}: ${bad.join(', ')} cannot change`);
      tx.abort();
      return;
    }
    const next = { ...current, ...patch };
    reqResult(os.put(next), () => { box.result = { record: next, changed: true }; });
  });
});

/**
 * Find-or-create in ONE readwrite transaction over a scope's records (M2.2.3), so two tabs of the
 * same till can never each create a different key for the same sale: the second tab's transaction
 * starts only after the first one's record is committed, and finds it. `decide(rows)` is synchronous
 * and returns { use: existingRecord } or { create: newRecord }; it may throw to refuse.
 * Resolves with { record, created }.
 */
export const findOrCreateOperation = (scopeKey, decide) => run('readwrite', (os, box, tx) => {
  reqResult(os.index('scopeKey').getAll(scopeKey), (rows) => {
    let choice;
    try {
      choice = decide((rows || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    } catch (err) {
      box.error = err;
      try { tx.abort(); } catch { /* already finished */ }
      return;
    }
    if (choice?.use) { box.result = { record: choice.use, created: false }; return; }
    reqResult(os.add(choice.create), () => { box.result = { record: choice.create, created: true }; });
  });
});

export const getOperation = (checkoutKey) => run('readonly', (os, box) => {
  reqResult(os.get(checkoutKey), (v) => { box.result = v || null; });
});

/** Every record of one tenant/branch/terminal scope, oldest first. */
export const listOperations = (scopeKey) => run('readonly', (os, box) => {
  reqResult(os.index('scopeKey').getAll(scopeKey), (rows) => {
    box.result = (rows || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  });
});

/** Deletes resolved records older than `olderThan` (epoch ms). Unresolved ones are never purged. */
export const purgeResolved = (isResolved, olderThan) => run('readwrite', (os, box) => {
  let removed = 0;
  const cursorReq = os.openCursor();
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) { box.result = removed; return; }
    const r = cursor.value;
    if (isResolved(r) && (r.updatedAt || r.createdAt || 0) < olderThan) {
      cursor.delete();
      removed += 1;
    }
    cursor.continue();
  };
});

// ------------------------------------------------------------------ cross-tab change signal

const CHANNEL = 'billbull-pos-checkout';
let channel;
const getChannel = () => {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  } catch { channel = null; }
  return channel;
};

/** Tells other tabs of this origin that pending checkouts changed. A hint only: IndexedDB is the truth. */
export const notifyChanged = (checkoutKey) => {
  try { getChannel()?.postMessage({ type: 'changed', checkoutKey: checkoutKey || null }); } catch { /* best effort */ }
};

/** Subscribes to other tabs' change hints. Returns the unsubscribe function. */
export const onChanged = (listener) => {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (ev) => { if (ev?.data?.type === 'changed') listener(ev.data.checkoutKey); };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
};

/** Test hook: forget the cached connection (e.g. after swapping globalThis.indexedDB). */
export const resetPendingCheckoutStoreConnection = () => { cached = null; };
