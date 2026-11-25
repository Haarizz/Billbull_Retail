// Administrator-only "Abandon offline lease" step inside the Close Session dialog.
//
// Shown only when the close was refused with OFFLINE_LEASE_OUTSTANDING and the signed-in user
// holds a role the server accepts for abandonment. The server stays the authority: it re-checks
// the role, requires the reason, checks the lease's branch and writes OFFLINE_LEASE_ABANDONED to
// the POS audit log. Abandoning does not close the session; the user presses Close again.
//
// Pilot restriction R11 (docs/standalone-pos/OFFLINE_MVP_ACCEPTANCE.md): abandon only once the
// lease has expired, or with the till switched off / offline selling confirmed stopped. The till
// is never told about the abandonment, and anything it syncs afterwards is HELD for review.

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

import { abandonOfflineLease } from '../../../../../api/posOfflineApi';
import { parseOutstandingLeaseRefusal } from './offlineLeaseRefusal';

export default function AbandonOfflineLeasePanel({ closeError, canAbandon, branchId, onAbandoned }) {
  const lease = useMemo(() => parseOutstandingLeaseRefusal(closeError), [closeError]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  // A fresh refusal (a new attempt, another lease) starts the panel over.
  useEffect(() => {
    if (!closeError) return;
    setOpen(false);
    setReason('');
    setConfirmed(false);
    setError('');
    setDone(null);
  }, [closeError]);

  if (done) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        {done.status === 'ABANDONED' ? (
          <span>
            Offline lease {done.leaseId} abandoned. Press <b>Close Session</b> again to close the session.
            Any offline sales the till sends later will be held for review, not posted.
          </span>
        ) : (
          <span>
            Offline lease {done.leaseId} was already {String(done.status).toLowerCase()}.
            Press <b>Close Session</b> again.
          </span>
        )}
      </div>
    );
  }

  if (!lease || !canAbandon) return null;

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-red-700 border border-red-300 rounded-md px-3 py-1.5 hover:bg-red-50"
        >
          Abandon offline lease…
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!reason.trim()) { setError('A reason is required.'); return; }
    if (!confirmed) { setError('Confirm the till has stopped selling offline first.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await abandonOfflineLease(lease.leaseId, reason.trim(), { branchId });
      // A lease that was no longer ACTIVE (the till settled it meanwhile, say) comes back with its
      // current status instead. Either way it no longer blocks the close.
      setDone({ leaseId: lease.leaseId, status: res?.status || 'ABANDONED' });
      onAbandoned?.({ leaseId: lease.leaseId, status: res?.status });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message;
      setError(typeof msg === 'string' && msg ? msg : 'Could not abandon the lease.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-white px-3 py-3 space-y-2" data-testid="abandon-offline-lease-panel">
      <div className="flex items-start gap-2 text-xs text-gray-700">
        <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-gray-900">Abandon offline lease on {lease.terminalId}</div>
          <div>
            Prefer bringing the till online: it uploads its offline sales and settles the lease itself.
            Abandon only if that is not possible. The server has received {lease.receivedCount} offline
            sale(s) under this lease; any still stored on the till will be <b>held for review</b>, not posted.
          </div>
          {!lease.expired && (
            <div className="font-semibold text-red-700">
              This lease is still valid{lease.validUntil ? ` until ${lease.validUntil}` : ''}. The till can keep
              selling offline and will not be told. Switch the till off before abandoning.
            </div>
          )}
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>I confirm {lease.terminalId} is switched off or no longer selling offline.</span>
      </label>
      <textarea
        rows={2}
        placeholder="Reason (required, recorded in the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
      />
      {error && <div className="text-xs font-medium text-[#E63946]">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          disabled={busy}
          className="text-xs font-medium text-gray-700 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !reason.trim() || !confirmed}
          className="text-xs font-semibold text-white bg-[#E63946] hover:bg-[#d32f3d] disabled:opacity-50 rounded-md px-3 py-1.5"
        >
          {busy ? 'Abandoning…' : 'Abandon lease'}
        </button>
      </div>
    </div>
  );
}
