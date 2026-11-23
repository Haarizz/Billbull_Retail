/**
 * Standalone POS offline runtime (M3). Installed by apps/pos only (installOfflineRuntime); the
 * embedded Retail /sales/pos never installs it, so there every function here is inert and the
 * online checkout runs exactly as before.
 *
 * Owns: connectivity, the device signing key and its enrolment, offline preparation (catalogue +
 * server-signed lease), the offline sign-in profile, and the sync worker. The sale itself is built
 * and committed by offlineSale.js; the axios adapter that answers GETs offline is offlineAdapter.js.
 *
 * Nothing here decides that a sale succeeded except an IndexedDB transaction that completed.
 */
import {
  closeOfflineLease, enrollOfflineKey, getOfflineCatalog, getOfflineStatus, issueOfflineLease, syncOfflineSales,
} from '../../../../api/posOfflineApi';
import { generateSigningKey, signCanonical, verifyLeaseJws } from './offlineCrypto';
import { getAllOutbox, getCatalog, getMeta, probeStorage, putCatalog, putMeta, deleteMeta, updateOutboxSync } from './offlineDb';
import { loadCatalogIndex } from './offlineCatalog';

export const SYNC_STATES = Object.freeze({
  PENDING: 'PENDING',     // committed locally, not yet sent (or sent without an answer)
  SENDING: 'SENDING',
  RETRY: 'RETRY',         // the server could not take it now; resent automatically
  RECEIVED: 'RECEIVED',   // the server holds it; posting has not finished yet
  SYNCED: 'SYNCED',       // posted: carries the official invoice number
  REVIEW: 'REVIEW',       // held or blocked on the server: needs a supervisor
  REJECTED: 'REJECTED',   // refused by the server (signature, conflict): needs a supervisor
});
const OPEN_STATES = new Set(['PENDING', 'SENDING', 'RETRY', 'RECEIVED']);

const CATALOG_MAX_AGE_MS = 30 * 60 * 1000;
const PROBE_ONLINE_MS = 30000;
const PROBE_OFFLINE_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;
const CLOCK_TOLERANCE_MS = 2 * 60 * 1000;
export const OFFLINE_ENTRY_KEY = 'billbull.pos.offlineEntry';

const state = {
  installed: false,
  connectivity: 'unknown',  // 'online' | 'offline' | 'unknown'
  enabled: null,            // server says offline selling is enabled for this branch
  device: null,             // { keyId, terminalId, spki, serverKey, tenant, origin } (never the private key)
  enrolledOnServer: null,
  lease: null,              // { leaseId, jws, claims, serverOffsetMs, verified }
  counter: null,            // { leaseId, nextSeq, count, valueMinor, chainHead, lastCapturedAt }
  catalog: null,            // { version, count, generatedAt, branchId }
  storage: { ready: null, persisted: null, quota: null, usage: null, error: null },
  outbox: { pending: 0, review: 0, rejected: 0, synced: 0, total: 0 },
  syncing: false,
  lastSyncAt: null,
  lastSyncError: null,
  needsSignIn: false,
  preparing: false,
  prepareError: null,
  preparedAt: null,
  till: null,               // { terminalId, branchId, sessionId, sessionStatus, operator }
};
let privateKey = null;
const listeners = new Set();
let probeTimer = null;
let api = null;

const emit = () => { const snap = getOfflineState(); listeners.forEach((fn) => { try { fn(snap); } catch { /* listener */ } }); };
export const subscribeOffline = (fn) => { listeners.add(fn); fn(getOfflineState()); return () => listeners.delete(fn); };
export const getOfflineState = () => JSON.parse(JSON.stringify({ ...state, lease: state.lease ? { ...state.lease, jws: undefined } : null }));
export const isOfflineRuntimeInstalled = () => state.installed;
export const getSigningKey = () => privateKey;
export const getRawState = () => state;

// ------------------------------------------------------------------ connectivity

export const isOffline = () => state.installed && state.connectivity === 'offline';

export function markNetworkFailure() {
  if (!state.installed) return;
  if (state.connectivity !== 'offline') {
    state.connectivity = 'offline';
    emit();
  }
  scheduleProbe(PROBE_OFFLINE_MS);
}

export function markNetworkSuccess() {
  if (!state.installed) return;
  if (state.connectivity !== 'online') {
    state.connectivity = 'online';
    emit();
    void afterReconnect();
  }
}

const hasToken = () => !!sessionStorage.getItem('token');

/** Any HTTP answer means the server is reachable; only a network failure or timeout means offline. */
export async function probeConnectivity() {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctrl?.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${window.location.origin}/api/pos/checkout/capabilities?probe=${Date.now()}`, {
      cache: 'no-store', credentials: 'omit', signal: ctrl?.signal,
    });
    markNetworkSuccess();
    if (hasToken() && state.needsSignIn) {
      // Signed in again (SessionLock or the login screen) after an offline sign-in.
      state.needsSignIn = false;
      sessionStorage.removeItem(OFFLINE_ENTRY_KEY);
      emit();
      void maybePrepare();
    }
    if (hasToken() && state.outbox.pending > 0 && !state.syncing) void runSync();
    scheduleProbe(state.needsSignIn || state.outbox.pending > 0 ? PROBE_OFFLINE_MS : PROBE_ONLINE_MS);
    return true;
  } catch {
    markNetworkFailure();
    return false;
  } finally {
    clearTimeout(t);
  }
}

function scheduleProbe(ms) {
  if (!state.installed) return;
  clearTimeout(probeTimer);
  probeTimer = setTimeout(() => { void probeConnectivity(); }, ms);
}

async function afterReconnect() {
  await refreshOutboxCounts();
  if (!hasToken()) {
    // Signed in offline: the first authenticated call answers 401, which raises the till's
    // SessionLock so the cashier signs in again in place, without losing the screen.
    state.needsSignIn = state.outbox.pending > 0 || isOfflineEntry();
    emit();
    // Only inside the till after an offline sign-in (SessionLock is mounted there to catch the 401).
    // On the login screen there is nothing to unlock: the normal sign-in does it.
    if (api && isOfflineEntry()) api.get('/api/pos/offline/status', { offlineBypass: true, params: { terminalId: state.till?.terminalId || state.device?.terminalId || '' } }).catch(() => {});
    return;
  }
  state.needsSignIn = false;
  sessionStorage.removeItem(OFFLINE_ENTRY_KEY);
  await runSync();
  await maybePrepare();
}

// ------------------------------------------------------------------ install

export async function installOfflineRuntime({ apiInstance } = {}) {
  if (state.installed) return;
  state.installed = true;
  api = apiInstance || null;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { void probeConnectivity(); });
    window.addEventListener('offline', () => markNetworkFailure());
    if (navigator.onLine === false) state.connectivity = 'offline';
  }
  await loadLocalState();
  void checkStorage();
  void probeConnectivity();
}

async function loadLocalState() {
  try {
    const device = await getMeta('device');
    if (device && device.origin === window.location.origin) {
      privateKey = device.privateKey || null;
      state.device = { keyId: device.keyId, terminalId: device.terminalId, spki: device.spki, serverKey: device.serverKey, tenant: device.tenant, origin: device.origin };
    }
    const lease = await getMeta('lease');
    if (lease) state.lease = lease;
    state.counter = await getMeta('counter');
    const snapshot = await getCatalog();
    if (snapshot) {
      loadCatalogIndex(snapshot);
      state.catalog = { version: snapshot.version, count: snapshot.products?.length || 0, generatedAt: snapshot.generatedAt, branchId: snapshot.branchId };
    }
    await refreshOutboxCounts();
  } catch (err) {
    state.storage = { ...state.storage, ready: false, error: err?.message || String(err) };
  }
  emit();
}

export async function checkStorage() {
  const s = { ready: false, persisted: null, quota: null, usage: null, error: null };
  try {
    await probeStorage();
    s.ready = true;
    if (navigator.storage?.persist) {
      s.persisted = await navigator.storage.persisted();
      if (!s.persisted) s.persisted = await navigator.storage.persist();
    }
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      s.quota = est.quota ?? null;
      s.usage = est.usage ?? null;
    }
  } catch (err) {
    s.ready = false;
    s.error = err?.message || String(err);
  }
  state.storage = s;
  emit();
  return s;
}

export async function refreshOutboxCounts() {
  try {
    const rows = await getAllOutbox();
    state.outbox = {
      total: rows.length,
      pending: rows.filter((r) => OPEN_STATES.has(r.syncState)).length,
      review: rows.filter((r) => r.syncState === 'REVIEW').length,
      rejected: rows.filter((r) => r.syncState === 'REJECTED').length,
      synced: rows.filter((r) => r.syncState === 'SYNCED').length,
      recent: rows.slice(-20).reverse().map((r) => ({
        rid: r.rid, seq: r.seq, ref: r.record?.ref, totalMinor: r.record?.totalMinor, syncState: r.syncState,
        syncCode: r.syncCode || null, syncMessage: r.syncMessage || null, invoiceNumber: r.invoiceNumber || null,
        at: r.record?.at,
        printState: r.printState || null, printError: r.printError || null, lastPrintAt: r.lastPrintAt || null,
        printCount: r.printCount || 0,
      })),
    };
  } catch { /* storage error is reported by checkStorage */ }
  emit();
  return state.outbox;
}

// ------------------------------------------------------------------ till context (from the workspace)

/** Called by the POS workspace with its live terminal and session (useOfflineTillBridge). */
export function registerTillContext({ terminal, session } = {}) {
  if (!state.installed) return;
  const next = terminal?.terminalId ? {
    terminalId: terminal.terminalId,
    branchId: terminal.branchId ?? session?.branchId ?? null,
    sessionId: session?.id ?? null,
    sessionStatus: session?.status ?? null,
    operator: session?.openedBy ?? null,
  } : null;
  if (JSON.stringify(next) === JSON.stringify(state.till)) return;
  state.till = next;
  emit();
  void maybePrepare();
}

// ------------------------------------------------------------------ preparation

const isAdmin = () => ['ADMIN', 'SUPER_ADMIN', 'BRANCH_ADMIN'].some((r) => {
  const role = (sessionStorage.getItem('role') || '').toUpperCase();
  const primary = (sessionStorage.getItem('primaryRole') || '').toUpperCase();
  return role.split(',').map((x) => x.trim().replace(/^ROLE_/, '')).includes(r) || primary.replace(/^ROLE_/, '') === r;
});
export const canEnrollHere = () => isAdmin();

/** Generates this till's signing key and registers its public half (administrator only). */
export async function enrollThisTill() {
  const terminalId = state.till?.terminalId;
  if (!terminalId) throw new Error('Open the till first so it knows its terminal.');
  const { privateKey: pk, spki } = await generateSigningKey();
  const res = await enrollOfflineKey({ terminalId, publicKeySpki: spki });
  const device = { keyId: res.keyId, terminalId, spki, serverKey: res.serverKey, tenant: res.tenant, origin: window.location.origin, privateKey: pk };
  await putMeta('device', device);
  privateKey = pk;
  state.device = { keyId: res.keyId, terminalId, spki, serverKey: res.serverKey, tenant: res.tenant, origin: device.origin };
  state.enrolledOnServer = true;
  emit();
  await maybePrepare({ force: true });
  return state.device;
}

let preparePromise = null;
export function maybePrepare({ force = false } = {}) {
  if (!state.installed || preparePromise) return preparePromise || Promise.resolve();
  preparePromise = prepare({ force }).finally(() => { preparePromise = null; });
  return preparePromise;
}

async function prepare({ force }) {
  const till = state.till;
  if (!till?.terminalId || !till.sessionId || till.sessionStatus !== 'OPEN') return;
  if (!hasToken() || state.connectivity === 'offline') return;
  state.preparing = true;
  state.prepareError = null;
  emit();
  try {
    const status = await getOfflineStatus(till.terminalId);
    state.enabled = !!status.enabled;
    if (!state.enabled) return;
    const local = state.device;
    state.enrolledOnServer = !!status.keyId && local?.keyId === status.keyId && local?.terminalId === till.terminalId && !!privateKey;
    if (!state.enrolledOnServer) return; // an administrator must enable offline on this till first

    // Catalogue: refreshed when missing, stale or for another branch.
    const snapshot = await getCatalog();
    const stale = !snapshot || snapshot.branchId !== till.branchId
      || Date.now() - Date.parse(snapshot.generatedAt || 0) > CATALOG_MAX_AGE_MS;
    if (stale || force) {
      const fresh = await getOfflineCatalog();
      await putCatalog(fresh);
      loadCatalogIndex(fresh);
      state.catalog = { version: fresh.version, count: fresh.products?.length || 0, generatedAt: fresh.generatedAt, branchId: fresh.branchId };
    }

    // Lease: keep a valid one for this session; otherwise settle the old one and get a new one.
    const lease = state.lease;
    const sameSession = lease && lease.claims.sid === till.sessionId && lease.claims.term === till.terminalId
      && lease.claims.kid === state.device.keyId;
    const remainingMs = lease ? lease.claims.exp * 1000 - estimatedServerNow() : 0;
    const usedUp = state.counter && lease && state.counter.leaseId === lease.leaseId
      && state.counter.nextSeq >= lease.claims.seqEnd;
    if (lease && (!sameSession || remainingMs < 30 * 60 * 1000 || usedUp)) {
      await runSync();
      const settled = await settleLease();
      if (!settled) return; // records still outstanding: keep selling under nothing new until they sync
    }
    if (!state.lease) await obtainLease(till);
    await saveProfile(till);
    // Warm the cache for reads the till makes only at checkout time (the adapter remembers them).
    if (api) await api.get('/api/pos/checkout/capabilities').catch(() => {});
    // Re-read the active session (same request as posApi.getActivePosSession). A till that opened
    // its session in this sitting last asked before the session existed, so the remembered answer
    // is "no session" (204) and an offline start would land on Start Session instead of selling.
    if (api) await api.get('/api/pos/sessions/active', { params: { terminalId: till.terminalId } }).catch(() => {});
    state.preparedAt = new Date().toISOString();
  } catch (err) {
    state.prepareError = err?.response?.data?.message || err?.message || String(err);
  } finally {
    state.preparing = false;
    emit();
  }
}

async function obtainLease(till) {
  const res = await issueOfflineLease({ terminalId: till.terminalId, sessionId: till.sessionId, catalogVersion: state.catalog?.version });
  // The lease must be signed by the server key pinned at enrolment.
  if (res.serverKey?.spki !== state.device.serverKey?.spki) throw new Error('The server lease key changed since this till was enrolled. Re-enrol the till.');
  const { claims } = await verifyLeaseJws(res.jws, state.device.serverKey.spki);
  if (claims.lid !== res.leaseId || claims.term !== till.terminalId || claims.sid !== till.sessionId) {
    throw new Error('The lease does not match this till.');
  }
  const serverOffsetMs = Date.parse(res.serverTime) - Date.now();
  const lease = { leaseId: res.leaseId, jws: res.jws, claims, serverOffsetMs, verified: true, receivedAt: new Date().toISOString() };
  const prevCounter = await getMeta('counter');
  const counter = prevCounter && prevCounter.leaseId === res.leaseId ? prevCounter : {
    leaseId: res.leaseId,
    nextSeq: claims.seqStart + (res.receivedCount || 0),
    count: res.receivedCount || 0,
    valueMinor: res.receivedValueMinor || 0,
    chainHead: prevCounter?.chainHead || 'GENESIS',
    lastCapturedAt: prevCounter?.lastCapturedAt || null,
  };
  await putMeta('lease', lease);
  await putMeta('counter', counter);
  state.lease = lease;
  state.counter = counter;
}

async function saveProfile(till) {
  await putMeta('profile', {
    user: sessionStorage.getItem('user'),
    fullName: sessionStorage.getItem('fullName'),
    role: sessionStorage.getItem('role'),
    primaryRole: sessionStorage.getItem('primaryRole'),
    activeBranchId: sessionStorage.getItem('activeBranchId') || String(till.branchId ?? ''),
    terminalId: till.terminalId,
    sessionId: till.sessionId,
    origin: window.location.origin,
  });
}

/**
 * Ends the current lease on a signed summary once every record under it has been posted. Returns
 * true when there is no lease any more (settled, or the server already had it settled).
 */
export async function settleLease() {
  const lease = state.lease;
  if (!lease) return true;
  const rows = (await getAllOutbox()).filter((r) => r.record?.lid === lease.leaseId);
  if (rows.some((r) => r.syncState !== 'SYNCED')) return false;
  const summary = {
    typ: 'bb.pos.offline.lease-close', v: 1, lid: lease.leaseId,
    count: rows.length,
    lastSeq: rows.length ? Math.max(...rows.map((r) => r.seq)) : lease.claims.seqStart - 1,
    valueMinor: rows.reduce((s, r) => s + (r.record?.totalMinor || 0), 0),
  };
  const { sig } = await signCanonical(privateKey, summary);
  await closeOfflineLease(lease.leaseId, { summary, sig });
  await deleteMeta('lease');
  state.lease = null;
  emit();
  return true;
}

/** Before a session closes: send everything, then settle the lease. Throws when that is not possible. */
export async function releaseOfflineLeaseForClosure(sessionId) {
  if (!state.installed || !state.lease || state.lease.claims.sid !== Number(sessionId)) return;
  await runSync();
  if (!(await settleLease())) {
    throw new Error('Offline sales from this till are still waiting to synchronise or need supervisor review, so the session cannot close yet.');
  }
}

// ------------------------------------------------------------------ lease checks used by the sale

export const estimatedServerNow = () => Date.now() + (state.lease?.serverOffsetMs || 0);

/** Why a new offline sale cannot be taken now, or null. Values are integer minor units. */
export function leaseRefusal(totalMinor = 0) {
  const lease = state.lease;
  if (!state.storage.ready) return `browser storage is not available (${state.storage.error || 'not checked yet'})`;
  if (!privateKey || !state.device?.keyId) return 'this till is not enrolled for offline selling';
  if (!lease?.verified) return 'there is no offline authorisation on this till (prepare it while online)';
  const c = lease.claims;
  const now = estimatedServerNow();
  const floor = Math.max(c.iat * 1000, state.counter?.lastCapturedAt ? Date.parse(state.counter.lastCapturedAt) : 0);
  if (now + CLOCK_TOLERANCE_MS < floor) return 'the device clock is behind the last trusted time; correct the clock';
  if (now >= c.exp * 1000) return `the offline authorisation expired at ${new Date(c.exp * 1000).toLocaleString()}`;
  const counter = state.counter;
  if (!counter || counter.leaseId !== lease.leaseId) return 'the offline sequence counter is missing';
  if (counter.nextSeq >= c.seqEnd) return `the offline sale limit (${c.maxSales}) is used up`;
  if (counter.valueMinor + totalMinor > c.maxValue) {
    return `the offline value limit is reached (AED ${((c.maxValue - counter.valueMinor) / 100).toFixed(2)} left)`;
  }
  return null;
}

export const setCounter = (counter) => { state.counter = counter; emit(); };

// ------------------------------------------------------------------ offline sign-in

export const isOfflineEntry = () => sessionStorage.getItem(OFFLINE_ENTRY_KEY) === '1';

/** The profile an offline sign-in would use, when a valid lease allows one. */
export async function offlineEntryProfile() {
  const profile = await getMeta('profile').catch(() => null);
  if (!profile || profile.origin !== window.location.origin) return null;
  if (!state.lease || state.lease.claims.op !== profile.user) return null;
  if (estimatedServerNow() >= state.lease.claims.exp * 1000) return null;
  return profile;
}

/** Signs the session owner in without the server (D12: the session owner only; no token). */
export async function enterOffline() {
  const profile = await offlineEntryProfile();
  if (!profile) throw new Error('This till has no valid offline authorisation for an offline sign-in.');
  ['user', 'fullName', 'role', 'primaryRole', 'activeBranchId'].forEach((k) => {
    if (profile[k] != null) sessionStorage.setItem(k, profile[k]);
  });
  sessionStorage.removeItem('token');
  sessionStorage.setItem(OFFLINE_ENTRY_KEY, '1');
  return profile;
}

// ------------------------------------------------------------------ sync

let syncPromise = null;
export function runSync() {
  if (!state.installed) return Promise.resolve();
  if (syncPromise) return syncPromise;
  const work = async () => { syncPromise = doSync().finally(() => { syncPromise = null; }); return syncPromise; };
  if (navigator.locks?.request) {
    return navigator.locks.request('billbull-pos-offline-sync', { ifAvailable: true }, (lock) => (lock ? work() : undefined));
  }
  return work();
}

async function doSync() {
  if (!hasToken()) { await refreshOutboxCounts(); return; }
  const rows = (await getAllOutbox()).filter((r) => OPEN_STATES.has(r.syncState));
  if (!rows.length) { await refreshOutboxCounts(); return; }
  state.syncing = true;
  state.lastSyncError = null;
  emit();
  try {
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      for (const r of batch) await updateOutboxSync(r.rid, { syncState: 'SENDING', lastAttemptAt: new Date().toISOString(), attempts: (r.attempts || 0) + 1 });
      await refreshOutboxCounts();
      let data;
      try {
        data = await syncOfflineSales(batch.map((r) => ({ record: r.record, sig: r.sig })), { branchId: batch[0].record.br });
      } catch (err) {
        // Unknown whether it arrived: back to PENDING; the same records are resent unchanged.
        for (const r of batch) await updateOutboxSync(r.rid, { syncState: 'PENDING' });
        if (!err?.response) markNetworkFailure();
        if (err?.response?.status === 401) state.needsSignIn = true;
        state.lastSyncError = err?.response?.data?.message || err?.message || 'sync failed';
        return;
      }
      markNetworkSuccess();
      for (const result of data?.results || []) {
        const patch = { syncCode: result.code || null, syncMessage: result.message || null };
        switch (result.status) {
          case 'POSTED':
            Object.assign(patch, { syncState: 'SYNCED', invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, syncedAt: new Date().toISOString() });
            break;
          case 'RECEIVED': patch.syncState = 'RECEIVED'; break;
          case 'HELD': case 'BLOCKED': patch.syncState = 'REVIEW'; break;
          case 'REJECTED': patch.syncState = 'REJECTED'; break;
          default: patch.syncState = 'RETRY';
        }
        await updateOutboxSync(result.recordId, patch);
      }
    }
    state.lastSyncAt = new Date().toISOString();
  } finally {
    state.syncing = false;
    await refreshOutboxCounts();
  }
}

/** Sends held/blocked records again (the server re-checks and re-posts blocked ones). */
export async function retryReviewRecords() {
  const rows = (await getAllOutbox()).filter((r) => r.syncState === 'REVIEW');
  for (const r of rows) await updateOutboxSync(r.rid, { syncState: 'RETRY' });
  await runSync();
}

/** For tests only. */
export function __resetOfflineRuntimeForTests() {
  clearTimeout(probeTimer);
  Object.assign(state, {
    installed: false, connectivity: 'unknown', enabled: null, device: null, enrolledOnServer: null, lease: null,
    counter: null, catalog: null, storage: { ready: null, persisted: null, quota: null, usage: null, error: null },
    outbox: { pending: 0, review: 0, rejected: 0, synced: 0, total: 0 }, syncing: false, lastSyncAt: null,
    lastSyncError: null, needsSignIn: false, preparing: false, prepareError: null, preparedAt: null, till: null,
  });
  privateKey = null;
  api = null;
  listeners.clear();
}
export const __setStateForTests = (patch, key) => { Object.assign(state, patch); if (key !== undefined) privateKey = key; };
