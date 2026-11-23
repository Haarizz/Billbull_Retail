import { useEffect, useRef, useState } from 'react';
import { CloudOff, Cloud, Printer, RefreshCw, X } from 'lucide-react';
import {
  canEnrollHere, enrollThisTill, estimatedServerNow, maybePrepare, retryReviewRecords, runSync, subscribeOffline,
} from './offlineRuntime';
import { OfflineReceiptPrintBusy, printOfflineReceipt, wasSentToPrinter } from './offlineReceiptPrint';

const money = (minor) => `AED ${((minor || 0) / 100).toFixed(2)}`;

// The stored offline receipt stays printable until the sale has a server invoice (then the tax
// invoice is reprinted the normal way).
const canPrintOfflineReceipt = (r) => r.syncState !== 'SYNCED' && !r.invoiceNumber;

// "Sent to printer", never "printed": the agent only knows Windows accepted the job.
const printStatus = (r) => {
  if (wasSentToPrinter(r.printState)) {
    const at = r.lastPrintAt ? ` ${new Date(r.lastPrintAt).toLocaleTimeString()}` : '';
    const times = r.printCount > 1 ? ` (${r.printCount} times)` : '';
    return `Receipt sent to printer${at}${times}`;
  }
  if (r.printState === 'FAILED') return `Receipt not printed${r.printError ? `: ${r.printError}` : ''}`;
  return 'Receipt not printed yet';
};

const SYNC_LABEL = {
  PENDING: 'Saved offline · awaiting sync',
  SENDING: 'Synchronizing…',
  RETRY: 'Awaiting sync (will retry)',
  RECEIVED: 'Received by server · posting',
  SYNCED: 'Synced',
  REVIEW: 'Needs supervisor',
  REJECTED: 'Rejected · needs supervisor',
};
const SYNC_TONE = {
  PENDING: 'text-amber-700 bg-amber-50 border-amber-200',
  SENDING: 'text-sky-700 bg-sky-50 border-sky-200',
  RETRY: 'text-amber-700 bg-amber-50 border-amber-200',
  RECEIVED: 'text-sky-700 bg-sky-50 border-sky-200',
  SYNCED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  REVIEW: 'text-red-700 bg-red-50 border-red-200',
  REJECTED: 'text-red-700 bg-red-50 border-red-200',
};

export function useOfflineState() {
  const [s, setS] = useState(null);
  useEffect(() => subscribeOffline(setS), []);
  return s;
}

/** Rail button + panel for the Standalone POS (M3). Renders nothing until the runtime is installed. */
export default function OfflineStatusPanel() {
  const s = useOfflineState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [printing, setPrinting] = useState(() => new Set());
  // Synchronous guard: two clicks in one tick both see the old `printing` state.
  const printingRef = useRef(new Set());
  if (!s?.installed) return null;

  // Prints the stored receipt again. Never touches the sale; printOfflineReceipt also refuses a
  // second submission for the same sale while one is in flight (automatic print included).
  const printReceipt = async (r) => {
    if (printingRef.current.has(r.rid)) return;
    printingRef.current.add(r.rid);
    setPrinting(new Set(printingRef.current));
    setError('');
    setNotice('');
    try {
      await printOfflineReceipt(r.rid);
      setNotice(`Receipt for ${r.ref} sent to the printer. Check that it came out.`);
    } catch (e) {
      if (e instanceof OfflineReceiptPrintBusy) setNotice(e.message);
      else setError(`The sale ${r.ref} is saved; only the receipt failed: ${e?.response?.data?.message || e?.message || String(e)}`);
    } finally {
      printingRef.current.delete(r.rid);
      setPrinting(new Set(printingRef.current));
    }
  };

  const offline = s.connectivity === 'offline';
  const lease = s.lease;
  const now = estimatedServerNow();
  const leaseValid = !!lease && now < lease.claims.exp * 1000;
  const counter = s.counter && lease && s.counter.leaseId === lease.leaseId ? s.counter : null;
  const salesLeft = lease && counter ? lease.claims.seqEnd - counter.nextSeq : null;
  const valueLeft = lease && counter ? lease.claims.maxValue - counter.valueMinor : null;
  const attention = s.outbox.review + s.outbox.rejected;

  const act = async (label, fn) => {
    setBusy(label);
    setError('');
    try { await fn(); } catch (e) { setError(e?.response?.data?.message || e?.message || String(e)); } finally { setBusy(''); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="offline-status-button"
        data-connectivity={s.connectivity} data-pending={s.outbox.pending} data-attention={attention}
        title={offline ? 'Offline' : 'Online'} aria-label={`Connection: ${offline ? 'offline' : 'online'}. ${s.outbox.pending} offline sales pending.`}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${offline ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-[#CBD5E1] text-emerald-600 hover:bg-emerald-50'}`}>
        {offline ? <CloudOff className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
        {(s.outbox.pending > 0 || attention > 0) && (
          <span className={`absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-[10px] font-bold text-white ${attention ? 'bg-red-600' : 'bg-amber-500'}`}>
            {s.outbox.pending + attention}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Offline selling" data-testid="offline-panel"
          className="fixed inset-0 z-[10500] flex items-start justify-start bg-slate-900/30" onClick={() => setOpen(false)}>
          <div className="ml-20 mt-16 w-[420px] max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#26333C]">Offline selling</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row label="Connection" value={offline ? 'OFFLINE — server unreachable' : s.connectivity === 'online' ? 'Online' : 'Checking…'} testid="offline-connectivity" strong={offline} />
              <Row label="Offline authorisation" testid="offline-lease" value={
                s.enabled === false ? 'Not enabled for this branch'
                  : !s.device ? 'This till is not enrolled'
                    : !lease ? 'None (prepare while online)'
                      : leaseValid ? `Valid until ${new Date(lease.claims.exp * 1000).toLocaleTimeString()}` : `Expired ${new Date(lease.claims.exp * 1000).toLocaleTimeString()}`} />
              {lease && <Row label="Sales left" value={`${salesLeft ?? '—'} of ${lease.claims.maxSales}`} testid="offline-sales-left" />}
              {lease && <Row label="Value left" value={valueLeft != null ? money(valueLeft) : '—'} testid="offline-value-left" />}
              <Row label="Catalogue" value={s.catalog ? `${s.catalog.count} items · ${new Date(s.catalog.generatedAt).toLocaleTimeString()}` : 'Not downloaded'} />
              <Row label="Local storage" value={s.storage.ready ? `Ready${s.storage.persisted ? ' · persistent' : ' · not persistent'}` : `Unavailable${s.storage.error ? ` (${s.storage.error})` : ''}`} testid="offline-storage" />
              <Row label="Pending sync" value={String(s.outbox.pending)} testid="offline-pending" strong={s.outbox.pending > 0} />
              <Row label="Needs supervisor" value={String(attention)} testid="offline-attention" strong={attention > 0} />
              <Row label="Synchronization" value={s.syncing ? 'Synchronizing…' : s.lastSyncError ? `Failed: ${s.lastSyncError}` : s.lastSyncAt ? `Last ${new Date(s.lastSyncAt).toLocaleTimeString()}` : '—'} testid="offline-sync" />
            </dl>
            {s.needsSignIn && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">The server is back. Sign in again to synchronise the offline sales.</p>
            )}
            {s.prepareError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{s.prepareError}</p>}
            {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700" role="alert">{error}</p>}
            {notice && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800" role="status" data-testid="offline-print-notice">{notice}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {!offline && !s.device && canEnrollHere() && s.enabled !== false && (
                <Btn testid="offline-enroll" busy={busy === 'enroll'} onClick={() => act('enroll', enrollThisTill)}>Enable offline on this till</Btn>
              )}
              {!offline && <Btn testid="offline-prepare" busy={busy === 'prepare'} onClick={() => act('prepare', () => maybePrepare({ force: true }))}>Prepare now</Btn>}
              {!offline && <Btn testid="offline-sync-now" busy={busy === 'sync'} onClick={() => act('sync', runSync)}>Sync now</Btn>}
              {!offline && attention > 0 && <Btn busy={busy === 'retry'} onClick={() => act('retry', retryReviewRecords)}>Retry review items</Btn>}
            </div>
            {s.outbox.recent?.length > 0 && (
              <ul className="mt-4 space-y-1.5" data-testid="offline-sales-list">
                {s.outbox.recent.map((r) => (
                  <li key={r.rid} data-testid="offline-sale-row" data-sync-state={r.syncState} data-invoice={r.invoiceNumber || ''}
                    data-print-state={r.printState || ''}
                    className={`rounded-lg border px-3 py-2 text-xs ${SYNC_TONE[r.syncState] || ''}`}>
                    <div className="flex justify-between font-semibold"><span>{r.ref}</span><span>{money(r.totalMinor)}</span></div>
                    <div>{SYNC_LABEL[r.syncState] || r.syncState}{r.invoiceNumber ? ` · Invoice ${r.invoiceNumber}` : ''}{r.syncCode && r.syncState !== 'SYNCED' ? ` · ${r.syncCode}` : ''}</div>
                    {r.syncMessage && (r.syncState === 'REVIEW' || r.syncState === 'REJECTED') && <div className="opacity-80">{r.syncMessage}</div>}
                    {canPrintOfflineReceipt(r) && (
                      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-current/10 pt-1.5">
                        <span data-testid="offline-print-status" className={r.printState === 'FAILED' ? 'font-semibold text-red-700' : 'text-gray-600'}>{printStatus(r)}</span>
                        <button type="button" data-testid="offline-print-receipt" disabled={printing.has(r.rid)} onClick={() => printReceipt(r)}
                          aria-label={`${wasSentToPrinter(r.printState) ? 'Print again' : 'Print receipt'} for offline sale ${r.ref}`}
                          className="flex shrink-0 items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 font-semibold text-[#334155] hover:border-[#F5C742] hover:bg-[#FFF8E7] disabled:opacity-50">
                          {printing.has(r.rid) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                          {printing.has(r.rid) ? 'Sending…' : wasSentToPrinter(r.printState) ? 'Print again' : 'Print receipt'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, strong, testid }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd data-testid={testid} className={`text-right ${strong ? 'font-semibold text-[#1E293B]' : 'text-[#334155]'}`}>{value}</dd>
    </div>
  );
}

function Btn({ children, onClick, busy, testid }) {
  return (
    <button type="button" data-testid={testid} disabled={!!busy} onClick={onClick}
      className="flex items-center gap-1 rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-xs font-semibold text-[#334155] hover:border-[#F5C742] hover:bg-[#FFF8E7] disabled:opacity-50">
      {busy && <RefreshCw className="h-3 w-3 animate-spin" />}{children}
    </button>
  );
}
