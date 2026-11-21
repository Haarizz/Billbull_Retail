/**
 * Recovery of checkout operations persisted by checkoutOperation.submitCheckout (Phase 0 / M2.2.2,
 * M2.2.3).
 *
 * When the till knows its terminal (and on every change of tenant, branch, terminal, session or
 * operator), this loads the operations of that tenant/branch/terminal that are still unresolved,
 * asks the server about each one with the read-only lookup, asks the server which checkouts it holds
 * that this till no longer has (after local data loss), and exposes both for the notice. Another
 * tab's change (a BroadcastChannel hint) reloads the list; IndexedDB stays the source of truth.
 * It never sends a sale by itself: re-sending one (same key, same stored payload) is the cashier's
 * explicit "Send again", and abandoning one is an explicit, server-confirmed action. Nothing here
 * generates a key.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  abandonPendingCheckout, acknowledgeServerCheckout, checkoutContext, discoverServerCheckouts,
  dismissPendingCheckout, heldByAnotherTab, listPendingCheckouts, purgeOldPendingCheckouts,
  reconcilePendingCheckout, replayPendingCheckout, scopeKeyOf, STATES, TAB_ID,
} from './checkoutOperation';
import { onChanged } from './pendingCheckoutStore';

const errorText = (err) => {
  const msg = err?.response?.data?.message || err?.message || 'The action failed.';
  return typeof msg === 'string' ? msg : 'The action failed.';
};

export function usePendingCheckouts({ currentSession, currentTerminal, operator, deps } = {}) {
  const context = checkoutContext({ currentSession, currentTerminal }, operator === undefined ? {} : { operator });
  const contextKey = `${scopeKeyOf(context)}|${context.sessionId ?? '-'}|${context.operator ?? '-'}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableContext = useMemo(() => context, [contextKey]);
  const ready = !!stableContext.terminalId;

  const [records, setRecords] = useState([]);
  const [serverOnly, setServerOnly] = useState([]);
  const [storageError, setStorageError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [notice, setNotice] = useState(null); // { key, tone: 'error'|'success'|'info', text }
  const latest = useRef(contextKey);
  latest.current = contextKey;

  const load = useCallback(async () => {
    if (!ready) { setRecords([]); return []; }
    const asked = contextKey;
    try {
      const rows = await listPendingCheckouts(stableContext, deps);
      if (latest.current === asked) { setRecords(rows); setStorageError(null); }
      return rows;
    } catch (err) {
      if (latest.current === asked) setStorageError(err?.message || String(err));
      return [];
    }
  }, [ready, contextKey, stableContext, deps]);

  const discover = useCallback(async () => {
    if (!ready) { setServerOnly([]); return []; }
    const asked = contextKey;
    try {
      const rows = await discoverServerCheckouts(stableContext, deps);
      if (latest.current === asked) setServerOnly(rows);
      return rows;
    } catch {
      return []; // best effort: an older server, no permission, offline
    }
  }, [ready, contextKey, stableContext, deps]);

  // On (re)load of the till, and whenever its scope changes: reconcile what is unresolved.
  useEffect(() => {
    if (!ready) { setRecords([]); setServerOnly([]); return undefined; }
    let cancelled = false;
    (async () => {
      try { await purgeOldPendingCheckouts(deps); } catch { /* best effort */ }
      const rows = await load();
      for (const r of rows) {
        if (cancelled) return;
        if (r.state === STATES.COMPLETED) continue;
        try { await reconcilePendingCheckout(r.checkoutKey, stableContext, deps); } catch { /* shown as unresolved */ }
      }
      if (!cancelled) { await load(); await discover(); }
    })();
    return () => { cancelled = true; };
  }, [ready, contextKey, stableContext, deps, load, discover]);

  // Another tab changed something: re-read IndexedDB (the hint itself carries no state).
  useEffect(() => (ready ? onChanged(() => { load(); }) : undefined), [ready, load]);

  // A record leased by another tab is re-read when that lease runs out, so a crashed or closed
  // tab's sale becomes actionable here without a reload.
  useEffect(() => {
    const myTab = deps?.tabId ?? TAB_ID;
    const now = Date.now();
    const expiries = records.filter((r) => heldByAnotherTab(r, { tabId: myTab, now })).map((r) => r.owner.leaseUntil);
    if (!expiries.length) return undefined;
    const timer = setTimeout(() => { load(); }, Math.max(0, Math.min(...expiries) - now) + 250);
    return () => clearTimeout(timer);
  }, [records, deps, load]);

  const act = useCallback(async (checkoutKey, fn, success) => {
    setBusyKey(checkoutKey);
    setNotice(null);
    try {
      const out = await fn();
      const text = success?.(out);
      if (text) setNotice({ key: checkoutKey, tone: 'success', text });
    } catch (err) {
      setNotice({ key: checkoutKey, tone: 'error', text: errorText(err) });
    } finally {
      setBusyKey(null);
      await load();
    }
  }, [load]);

  const check = useCallback((checkoutKey) => act(checkoutKey,
    () => reconcilePendingCheckout(checkoutKey, stableContext, deps),
    (r) => (r?.state === STATES.COMPLETED ? `Recorded on the server as ${r.result?.invoiceNumber || 'an invoice'}.`
      : r?.state === STATES.ABANDONED ? 'Abandoned on the server: nothing was recorded.'
        : r?.lookup?.recorded === 'NO' ? 'The server has no sale under this checkout yet. It may still arrive: send it again, or abandon it.'
          : r?.lookup?.error ? `The server could not be asked: ${r.lookup.error}` : 'Still unresolved on the server.')),
  [act, stableContext, deps]);

  const retry = useCallback((checkoutKey) => act(checkoutKey,
    () => replayPendingCheckout(checkoutKey, stableContext, {}, deps),
    (invoice) => `Sent again under its original key: ${invoice?.invoiceNumber || 'recorded'}.`),
  [act, stableContext, deps]);

  const abandon = useCallback((checkoutKey, reason) => act(checkoutKey,
    () => abandonPendingCheckout(checkoutKey, stableContext, { reason }, deps),
    () => 'Abandoned on the server: this sale was not recorded and never will be under this checkout.'),
  [act, stableContext, deps]);

  const dismiss = useCallback((checkoutKey, reason) => act(checkoutKey,
    () => dismissPendingCheckout(checkoutKey, stableContext, { reason }, deps), () => null),
  [act, stableContext, deps]);

  const acknowledgeServer = useCallback(async (attempt) => {
    setBusyKey(attempt.checkoutKey);
    try {
      await acknowledgeServerCheckout(attempt, stableContext, deps);
    } catch (err) {
      setNotice({ key: attempt.checkoutKey, tone: 'error', text: errorText(err) });
    } finally {
      setBusyKey(null);
      await discover();
    }
  }, [stableContext, deps, discover]);

  /** Acknowledges every server-found sale that is recorded (after a wipe a session can have many). */
  const acknowledgeAllRecorded = useCallback(async () => {
    const recorded = serverOnly.filter((a) => a.recorded === 'YES');
    for (const a of recorded) {
      try { await acknowledgeServerCheckout(a, stableContext, deps); } catch { /* left listed */ }
    }
    await discover();
  }, [serverOnly, stableContext, deps, discover]);

  const isHeldElsewhere = useCallback((r) => heldByAnotherTab(r, { tabId: deps?.tabId ?? TAB_ID, now: Date.now() }), [deps]);

  return {
    context: stableContext, records, serverOnly, storageError, busyKey, notice,
    refresh: load, discover, check, retry, abandon, dismiss, acknowledgeServer, acknowledgeAllRecorded, isHeldElsewhere,
  };
}

export default usePendingCheckouts;
