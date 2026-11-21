/**
 * IndexedDB for the Standalone POS offline MVP (M3). Separate from the M2 pending-checkout database
 * ('billbull-pos-checkout'), which it never touches.
 *
 *   meta     { k, v }       device signing key (CryptoKey, non-extractable), enrolment, lease,
 *                           sequence counter / chain head, offline sign-in profile, clock floor
 *   outbox   { rid, ... }   every offline sale, immutable once written, plus its sync state
 *   cache    { key, ... }   boot-time GET responses the till may replay while offline (allow-list)
 *   catalog  { k, v }       the offline product catalogue snapshot
 *
 * Same write rules as pendingCheckoutStore: readwrite transactions ask for durability 'strict', and
 * a write resolves only on the transaction's `complete` event. Storage that cannot be opened or
 * written rejects with OfflineStorageError; an offline sale must never be reported then.
 */
export const OFFLINE_DB_NAME = 'billbull-pos-offline';
export const OFFLINE_DB_VERSION = 1;

export class OfflineStorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'OfflineStorageError';
    this.code = 'OFFLINE_NOT_PERSISTED';
    this.cause = cause;
  }
}

const describe = (err) => {
  if (!err) return 'unknown error';
  if (err.name === 'QuotaExceededError') return 'browser storage is full (quota exceeded)';
  return `${err.name || 'Error'}: ${err.message || err}`;
};

let cached = null;
const factory = () => (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);

export const openOfflineDb = () => {
  const idb = factory();
  if (!idb || typeof idb.open !== 'function') {
    return Promise.reject(new OfflineStorageError('IndexedDB is not available in this browser'));
  }
  if (cached && cached.factory === idb) return cached.promise;
  const promise = new Promise((resolve, reject) => {
    let req;
    try {
      req = idb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    } catch (err) {
      reject(new OfflineStorageError(`IndexedDB could not be opened (${describe(err)})`, err));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('outbox')) {
        const os = db.createObjectStore('outbox', { keyPath: 'rid' });
        os.createIndex('seq', 'seq', { unique: false });
      }
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog', { keyPath: 'k' });
    };
    req.onblocked = () => reject(new OfflineStorageError('IndexedDB upgrade is blocked by another open tab'));
    req.onerror = () => reject(new OfflineStorageError(`IndexedDB could not be opened (${describe(req.error)})`, req.error));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); if (cached?.promise === promise) cached = null; };
      db.onclose = () => { if (cached?.promise === promise) cached = null; };
      resolve(db);
    };
  });
  cached = { factory: idb, promise };
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise;
};

const openTx = (db, stores, mode) => {
  if (mode !== 'readwrite') return db.transaction(stores, mode);
  try {
    return db.transaction(stores, mode, { durability: 'strict' });
  } catch (err) {
    if (err && err.name === 'TypeError') return db.transaction(stores, mode);
    throw err;
  }
};

/**
 * Runs `work(stores, box, tx)` in one transaction over `storeNames` and resolves with `box.result`
 * after `complete`. `stores` maps each name to its object store. `work` must only issue IndexedDB
 * requests (no other awaits), or the transaction commits early.
 */
export const runTx = async (storeNames, mode, work) => {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = openTx(db, storeNames, mode);
    } catch (err) {
      reject(new OfflineStorageError(`IndexedDB transaction failed (${describe(err)})`, err));
      return;
    }
    const box = { result: undefined, error: null };
    tx.oncomplete = () => (box.error ? reject(box.error) : resolve(box.result));
    tx.onabort = () => reject(box.error || new OfflineStorageError(`IndexedDB write was aborted (${describe(tx.error)})`, tx.error));
    tx.onerror = () => { /* surfaces as abort */ };
    try {
      const stores = Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]));
      work(stores, box, tx);
    } catch (err) {
      box.error = err instanceof OfflineStorageError ? err : new OfflineStorageError(describe(err), err);
      try { tx.abort(); } catch { /* already finished */ }
    }
  });
};

const reqResult = (request, box, map = (v) => v) => {
  request.onsuccess = () => { box.result = map(request.result); };
};

export const getMeta = (k) => runTx(['meta'], 'readonly', (s, box) => reqResult(s.meta.get(k), box, (r) => r?.v ?? null));
export const putMeta = (k, v) => runTx(['meta'], 'readwrite', (s) => { s.meta.put({ k, v }); });
export const deleteMeta = (k) => runTx(['meta'], 'readwrite', (s) => { s.meta.delete(k); });

export const getAllOutbox = () => runTx(['outbox'], 'readonly', (s, box) => reqResult(s.outbox.getAll(), box,
  (rows) => (rows || []).sort((a, b) => a.seq - b.seq)));
export const getOutbox = (rid) => runTx(['outbox'], 'readonly', (s, box) => reqResult(s.outbox.get(rid), box));

/**
 * Updates only the mutable sync and receipt-print fields of an outbox row; the signed record itself
 * never changes. Read and write happen in one transaction, so a print-only patch never overwrites
 * what synchronisation wrote in between (and vice versa).
 */
export const updateOutboxSync = (rid, patch) => runTx(['outbox'], 'readwrite', (s, box) => {
  const req = s.outbox.get(rid);
  req.onsuccess = () => {
    const row = req.result;
    if (!row) { box.error = new OfflineStorageError(`Offline sale ${rid} is missing`); return; }
    const allowed = ['syncState', 'syncCode', 'syncMessage', 'invoiceId', 'invoiceNumber', 'syncedAt', 'attempts',
      'lastAttemptAt', 'printState', 'printError', 'lastPrintAt', 'printCount'];
    const next = { ...row };
    for (const k of allowed) if (k in patch) next[k] = patch[k];
    s.outbox.put(next);
    box.result = next;
  };
});

export const getCached = (key) => runTx(['cache'], 'readonly', (s, box) => reqResult(s.cache.get(key), box));
export const putCached = (row) => runTx(['cache'], 'readwrite', (s) => { s.cache.put(row); });

export const getCatalog = () => runTx(['catalog'], 'readonly', (s, box) => reqResult(s.catalog.get('current'), box, (r) => r?.v ?? null));
export const putCatalog = (v) => runTx(['catalog'], 'readwrite', (s) => { s.catalog.put({ k: 'current', v }); });

/** Write-then-read probe with strict durability: the storage-readiness condition for offline cash. */
export async function probeStorage() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await putMeta('probe', token);
  const back = await getMeta('probe');
  if (back !== token) throw new OfflineStorageError('IndexedDB did not return what was written');
  return true;
}

/** For tests only: forget the cached connection (fake-indexeddb gives each test a new factory). */
export const __resetOfflineDbForTests = () => { cached = null; };
