/**
 * The till's notice for checkouts the server has not confirmed (Phase 0 / M2.2.2, M2.2.3). Lists each
 * unresolved operation of this tenant/branch/terminal with what is known about it, and offers only
 * the actions that are safe for its state:
 *   - Check status: read-only lookup, any operator.
 *   - Send again: the stored payload under its own key, only for the operator who started it and
 *     only while no other tab is sending it.
 *   - Abandon: asks the server to abandon the key for good (stored key + payload). The record is
 *     closed only once the server confirms ABANDONED; a recorded, in-progress or stalled sale is not
 *     abandoned and stays listed with what the server said.
 *   - Acknowledge: a key conflict (the key holds another sale) or a recovered completion.
 * It also lists what the server holds under keys this till no longer has (local data loss).
 */
import { STATES } from './checkoutOperation';

const TYPE_LABEL = { SALE: 'Sale', DELIVERY: 'Delivery order' };

const describeState = (r, heldElsewhere) => {
  if (r.state === STATES.COMPLETED) return `Recorded on the server as ${r.result?.invoiceNumber || 'an invoice'}, once. Reprint the receipt from Invoices if the customer needs one.`;
  if (heldElsewhere) return 'Being sent from another tab or window of this till. Wait for it there.';
  if (r.state === STATES.KEY_CONFLICT) return 'The server says this checkout key already belongs to a different sale. This sale was not recorded under it. Ring it again only as a new sale.';
  if (r.lookup?.recorded === 'PARTIAL' || r.lastResponse?.code === 'CHECKOUT_STALLED' || r.lastAbandon?.code === 'CHECKOUT_STALLED') return 'Only partly recorded on the server. A supervisor must review and release it before anything else is done with it.';
  if (r.lookup?.recorded === 'UNKNOWN' || r.lastResponse?.code === 'CHECKOUT_IN_PROGRESS' || r.lastAbandon?.code === 'CHECKOUT_IN_PROGRESS') return 'The server is still recording it. Check again in a moment.';
  if (r.lookup?.recorded === 'NO') return 'The server has no sale under this checkout yet. An earlier request may still arrive, so it is not closed: send it again, or abandon it on the server.';
  if (r.lookup?.error) return `The server could not be asked (${r.lookup.error}). It may or may not have been recorded.`;
  return 'Sent, but the server did not confirm it. It may or may not have been recorded.';
};

const describeServer = (a) => {
  if (a.recorded === 'YES') return `Recorded on the server as ${a.invoiceNumber || 'an invoice'}. This till lost its own copy of the sale.`;
  if (a.state === 'ACTIVE') return 'The server is still recording it.';
  if (a.state === 'STALLED') return 'Only partly recorded on the server. A supervisor must review and release it.';
  return 'Not recorded on the server. This till no longer holds the sale, so it cannot be sent again from here; ring it up again as a new sale if the customer still wants it.';
};

const money = (v) => (v == null || Number.isNaN(Number(v)) ? null : `AED ${Number(v).toFixed(2)}`);

export default function PendingCheckoutNotice({ pending }) {
  if (!pending) return null;
  const { records, serverOnly = [], storageError, busyKey, notice, context, check, retry, abandon, dismiss, acknowledgeServer, acknowledgeAllRecorded, isHeldElsewhere } = pending;
  const recordedOnServer = serverOnly.filter((a) => a.recorded === 'YES').length;
  if (!storageError && (!records || records.length === 0) && serverOnly.length === 0) return null;

  const confirmAbandon = (r) => {
    if (!window.confirm('Abandon this sale on the server? Only do this if the customer did not pay, or will be rung up again as a new sale. '
      + 'The server refuses if the sale was recorded or is still being recorded.')) return;
    abandon(r.checkoutKey);
  };
  const confirmAcknowledge = (r) => {
    if (r.state === STATES.KEY_CONFLICT
      && !window.confirm('Acknowledge that this checkout was NOT recorded under its key (the key belongs to another sale)? The cart it held is not restored.')) return;
    dismiss(r.checkoutKey);
  };

  return (
    <div
      role="alert"
      data-testid="pending-checkout-notice"
      className="fixed bottom-4 right-4 z-[70] max-h-[70vh] w-[420px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-xl"
    >
      <div className="mb-2 font-semibold">Unconfirmed checkouts on this till</div>
      {storageError && (
        <div className="mb-2 rounded border border-red-300 bg-red-50 p-2 text-red-800">
          Saved checkouts could not be read ({storageError}). New sales cannot be sent safely until browser storage works.
        </div>
      )}
      <ul className="space-y-2">
        {(records || []).map((r) => {
          const s = r.summary || {};
          const own = r.context?.operator === context?.operator;
          const busy = busyKey === r.checkoutKey;
          const resolved = r.state === STATES.COMPLETED;
          const elsewhere = !resolved && !!isHeldElsewhere?.(r);
          const stalled = r.lookup?.recorded === 'PARTIAL';
          const canRetry = !resolved && !elsewhere && r.state !== STATES.KEY_CONFLICT && own && !stalled;
          const canAbandon = !resolved && !elsewhere && r.state !== STATES.KEY_CONFLICT && !stalled;
          const canAcknowledge = resolved || r.state === STATES.KEY_CONFLICT;
          return (
            <li key={r.checkoutKey} data-checkout-key={r.checkoutKey} data-state={r.state} className="rounded-lg border border-amber-200 bg-white p-2">
              <div className="flex justify-between gap-2 font-medium">
                <span>{TYPE_LABEL[r.operationType] || r.operationType}{s.customerName ? ` · ${s.customerName}` : ''}</span>
                <span>{money(s.total) || ''}</span>
              </div>
              <div className="text-xs text-gray-600">
                {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                {s.itemCount != null ? ` · ${s.itemCount} item${s.itemCount === 1 ? '' : 's'}` : ''}
                {r.context?.sessionId ? ` · session ${r.context.sessionId}` : ''}
                {r.context?.operator ? ` · by ${r.context.operator}` : ''}
              </div>
              <div className="mt-1" data-testid="pending-checkout-state">{describeState(r, elsewhere)}</div>
              {!own && !resolved && (
                <div className="mt-1 text-xs text-gray-700">Started by another user: only they can send it again.</div>
              )}
              {notice?.key === r.checkoutKey && (
                <div className={`mt-1 text-xs ${notice.tone === 'error' ? 'text-red-700' : 'text-green-700'}`}>{notice.text}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {!resolved && (
                  <button type="button" disabled={busy} onClick={() => check(r.checkoutKey)}
                    className="rounded border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50">
                    Check status
                  </button>
                )}
                {canRetry && (
                  <button type="button" disabled={busy} onClick={() => retry(r.checkoutKey)}
                    className="rounded bg-[#F5C742] px-2 py-1 text-xs font-semibold hover:brightness-95 disabled:opacity-50">
                    Send again (same sale)
                  </button>
                )}
                {canAbandon && (
                  <button type="button" disabled={busy} onClick={() => confirmAbandon(r)} data-action="abandon"
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50">
                    Abandon on server
                  </button>
                )}
                {canAcknowledge && (
                  <button type="button" disabled={busy} onClick={() => confirmAcknowledge(r)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50">
                    {resolved ? 'OK' : 'Acknowledge'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {serverOnly.length > 0 && (
        <div className="mt-3" data-testid="server-recovered-checkouts">
          <div className="mb-1 flex items-center justify-between gap-2 font-semibold">
            <span>Found on the server, not saved on this till</span>
            {recordedOnServer > 1 && acknowledgeAllRecorded && (
              <button type="button" data-action="ack-all-recorded" onClick={() => acknowledgeAllRecorded()}
                className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-normal hover:bg-gray-100">
                OK, all recorded ({recordedOnServer})
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {serverOnly.map((a) => (
              <li key={a.checkoutKey} data-checkout-key={a.checkoutKey} data-server-state={a.state} className="rounded-lg border border-amber-200 bg-white p-2">
                <div className="text-xs text-gray-600">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                  {a.sessionId ? ` · session ${a.sessionId}` : ''}
                  {a.terminalId ? ` · terminal ${a.terminalId}` : ''}
                  {a.initiatedBy ? ` · by ${a.initiatedBy}` : ''}
                </div>
                <div className="mt-1">{describeServer(a)}</div>
                {a.state !== 'ACTIVE' && a.state !== 'STALLED' && (
                  <button type="button" disabled={busyKey === a.checkoutKey} onClick={() => acknowledgeServer(a)}
                    className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50">
                    OK
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
