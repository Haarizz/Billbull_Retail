// Closing Approval dialog — an administrator signs off a session close (X-Report) or a
// Business Day Close (Z-Report). State and submission live in useAdminCloseApproval; the server
// verifies the credentials and the administrator role, this dialog only collects them.
import React from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';

const COPY = {
  SESSION_CLOSE: {
    title: 'Administrator Approval',
    subtitle: 'An administrator must approve closing this session (X-Report).',
  },
  DAY_CLOSE: {
    title: 'Administrator Approval',
    subtitle: 'An administrator must approve the Business Day Close (Z-Report).',
  },
};

function AdminCloseApprovalDialog({ approval }) {
  const { pending, username, setUsername, password, setPassword, error, setError, busy, submit, cancel } = approval;
  if (!pending) return null;
  const copy = COPY[pending.action] || COPY.SESSION_CLOSE;
  const onKeyDown = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div className="fixed inset-0 bg-black/50 z-[320] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="admin-close-approval-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 id="admin-close-approval-title" className="text-base font-bold text-white leading-tight">{copy.title}</h2>
              <p className="text-[11px] text-amber-100 mt-0.5 leading-tight">{copy.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Own <form> + autocomplete hints keep the browser's password manager from filling the
            cashier's saved login in here. */}
        <form className="p-5 space-y-3" autoComplete="off" onSubmit={e => { e.preventDefault(); submit(); }}>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
              Administrator Email / Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              onKeyDown={onKeyDown}
              autoFocus
              autoComplete="off"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
              Administrator Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={onKeyDown}
              autoComplete="new-password"
              maxLength={128}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>
          {error && (
            <p className="text-[11px] font-medium text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />{error}
            </p>
          )}
          <div className="pt-1 space-y-2">
            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
            >{busy ? 'Verifying…' : 'Approve'}</button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminCloseApprovalDialog;
