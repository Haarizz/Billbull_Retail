// Extracted verbatim from POSSales.jsx (Supervisor PIN Dialog).
// Behaviour is unchanged; only the location moved. The approval queue and credential state stay in
// useSupervisorApproval, the force-close fields in useSessionClosure, and the showSupervisorPin guard,
// handleSupervisorPinSubmit and cancelApproval in POSSales. The only edits are the handler names:
// Enter and the keypad call onSubmit() with no arguments; Authorize and Cancel pass onSubmit/onCancel
// by reference. Known approval defects are preserved on purpose — see the characterization test.

import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Shield } from 'lucide-react';

import { getPosPinApprovers } from '../../../../../api/posApi';

/**
 * Personal PIN mode: who may approve here. Loaded once per dialog opening; a failure leaves
 * an empty list with a message rather than blocking the dialog.
 */
function useApprovers(enabled) {
  const [state, setState] = useState({ loading: enabled, list: [], error: '' });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getPosPinApprovers()
      .then(list => { if (!cancelled) setState({ loading: false, list, error: '' }); })
      .catch(() => { if (!cancelled) setState({ loading: false, list: [], error: 'Could not load supervisors. Try again.' }); });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}

function SupervisorPinDialog({
  pendingPriceOverride,
  pendingSupervisorAction,
  pendingLayawayAbortAction,
  supervisorApprovalMode,
  sessionToClose,
  forceCloseReason,
  setForceCloseReason,
  forceCloseAuditAcknowledged,
  setForceCloseAuditAcknowledged,
  supervisorPinEmail,
  setSupervisorPinEmail,
  supervisorPinValue,
  setSupervisorPinValue,
  supervisorPinError,
  setSupervisorPinError,
  supervisorApprover = null,
  setSupervisorApprover = () => {},
  onSubmit,
  onCancel,
}) {
  const isForceClose = pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION';
  const usesPersonalPin = supervisorApprovalMode === 'PERSONAL_PIN';
  // Force Close has to name the approver, which the shared Branch PIN cannot, so in Branch PIN
  // mode it asks for the supervisor's own username + password instead (Personal PIN names them).
  const usesPassword = supervisorApprovalMode === 'PASSWORD' || (isForceClose && !usesPersonalPin);
  const approvers = useApprovers(usesPersonalPin);
  const pinMax = usesPersonalPin ? 6 : 8;
  const showPinEntry = !usesPersonalPin || !!supervisorApprover;

  return (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-2xl px-5 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/20">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">Supervisor Approval</h2>
                  <p className="text-[11px] text-amber-100 mt-0.5 leading-tight">
                    {pendingPriceOverride?.type === 'BUSINESS_DAY_CLOSED'
                      ? `The Business Day has closed. ${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to authorize this pending transaction only — normal selling stays blocked.`
                      : pendingPriceOverride?.type === 'CHECKOUT'
                      ? `${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to approve the below-minimum price override`
                      : pendingPriceOverride
                      ? `${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to approve price override${pendingPriceOverride.itemName ? ` for ${pendingPriceOverride.itemName}` : ''} (below min ${pendingPriceOverride.minPrice})`
                      : pendingSupervisorAction?.type === 'DAY_CLOSE'
                      ? (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to authorize Business Day Close' : 'Enter PIN to authorize Business Day Close')
                      : pendingSupervisorAction?.type === 'DELIVERY_SETTLEMENT'
                      ? `Supervisor authorization is required to settle this delivery because it was created by another user.`
                      : pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION'
                      ? 'Authorize force closure of this session.'
                      : pendingSupervisorAction?.type === 'POS_FUNCTION'
                      ? `${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to open ${pendingSupervisorAction.label || 'this function'}`
                      : pendingLayawayAbortAction
                      ? (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to clear layaway cart' : 'Enter PIN to clear layaway cart')
                      : (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to authorize void' : 'Enter PIN to authorize void')}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 space-y-3 overflow-y-auto">
              {pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' && sessionToClose && (
                <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                  <p className="text-[9px] text-amber-800/80 font-bold mb-1 uppercase tracking-wide">Target Session</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-amber-700/60">Terminal</span> <span className="font-semibold text-amber-900">{sessionToClose.terminalName || sessionToClose.terminalId}</span></div>
                    <div className="flex justify-between"><span className="text-amber-700/60">Counter</span> <span className="font-semibold text-amber-900">{sessionToClose.counterName || sessionToClose.counter || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-amber-700/60">Session</span> <span className="font-semibold text-amber-900">{sessionToClose.sessionNo || (sessionToClose.id ? `SESS-${sessionToClose.id}` : '—')}</span></div>
                    <div className="flex justify-between"><span className="text-amber-700/60">Cashier</span> <span className="font-semibold text-amber-900">{sessionToClose.cashier || sessionToClose.openedBy || sessionToClose.userId || '—'}</span></div>
                  </div>
                </div>
              )}

              {pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 block">
                      Force Close Reason <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={forceCloseReason}
                      onChange={e => { setForceCloseReason(e.target.value); setSupervisorPinError(''); }}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-white"
                    >
                      <option value="" disabled>Select reason... ▼</option>
                      <option value="Cashier unavailable">Cashier unavailable</option>
                      <option value="Cashier forgot to close session">Cashier forgot to close session</option>
                      <option value="Terminal malfunction">Terminal malfunction</option>
                      <option value="Shift handover">Shift handover</option>
                      <option value="Emergency closure">Emergency closure</option>
                      <option value="Other operational reason">Other operational reason</option>
                    </select>
                  </div>
                  
                  <div className="bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={forceCloseAuditAcknowledged}
                        onChange={e => { setForceCloseAuditAcknowledged(e.target.checked); setSupervisorPinError(''); }}
                        className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-[11px] font-medium text-amber-900 leading-none">
                        I understand this Force Close will be recorded in the audit trail.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Own <form> + explicit autocomplete hints keep Chrome's password manager out:
                  without them it autofilled the saved login password into the PIN field and
                  paired the nearest text input — the POS product search — as the "username". */}
              {usesPersonalPin && !supervisorApprover && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Who is approving?</p>
                  {approvers.loading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500 py-3"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading supervisors…</div>
                  ) : approvers.list.length === 0 ? (
                    <p className="text-[11px] text-gray-500 py-2">
                      {approvers.error || 'No supervisor at this branch has a POS PIN. Set one in HR → Employees → Access (supervisor, manager or admin role).'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                      {approvers.list.map(a => (
                        <button
                          key={a.employeeId}
                          type="button"
                          onClick={() => { setSupervisorApprover(a); setSupervisorPinValue(''); setSupervisorPinError(''); }}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 hover:border-amber-400 hover:bg-amber-50 px-2.5 py-2 text-left transition-colors"
                        >
                          <span className="h-8 w-8 shrink-0 rounded-full bg-[#1E293B] text-white text-[11px] font-bold flex items-center justify-center">{a.initials || '?'}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#1E293B] truncate">{a.name}</span>
                            {a.role && <span className="block text-[10px] text-gray-500 truncate">{a.role}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {supervisorPinError && (
                    <p className="text-[11px] font-medium text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{supervisorPinError}
                    </p>
                  )}
                </div>
              )}

              {usesPersonalPin && supervisorApprover && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50/60 border border-amber-100 px-2.5 py-2">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-[#1E293B] text-white text-[11px] font-bold flex items-center justify-center">{supervisorApprover.initials || '?'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#1E293B] truncate">{supervisorApprover.name}</span>
                    <span className="block text-[10px] text-gray-500">Enter your POS PIN</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSupervisorApprover(null); setSupervisorPinValue(''); setSupervisorPinError(''); }}
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-900"
                  >Change</button>
                </div>
              )}

              {showPinEntry && (
              <form className="space-y-3" autoComplete="off" onSubmit={e => e.preventDefault()}>
                {usesPassword && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                      Supervisor Email / Username
                    </label>
                    <input
                      type="text"
                      value={supervisorPinEmail}
                      onChange={e => { setSupervisorPinEmail(e.target.value); setSupervisorPinError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
                      autoFocus
                      autoComplete="off"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                    {usesPassword ? 'Supervisor Password' : usesPersonalPin ? 'Your POS PIN' : 'Supervisor PIN'}
                  </label>
                  <input
                    type="password"
                    value={supervisorPinValue}
                    onChange={e => {
                      // A personal POS PIN is digits only. The branch PIN was never restricted, so
                      // it (and a password) is taken as typed.
                      setSupervisorPinValue(usesPersonalPin ? e.target.value.replace(/\D/g, '').slice(0, pinMax) : e.target.value);
                      setSupervisorPinError('');
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
                    autoFocus={!usesPassword}
                    maxLength={usesPassword ? 64 : pinMax}
                    autoComplete={usesPassword ? 'new-password' : 'one-time-code'}
                    inputMode={usesPassword ? undefined : 'numeric'}
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 ${usesPassword ? 'text-sm' : 'text-center text-lg tracking-[0.5em]'}`}
                    placeholder={usesPassword ? '' : '····'}
                  />
                  {supervisorPinError && (
                    <p className="text-[11px] font-medium text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{supervisorPinError}
                    </p>
                  )}
                </div>
              </form>
              )}

              {!usesPassword && showPinEntry && (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map(k => (
                    <button
                      key={k}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (k === 'C') { setSupervisorPinValue(''); setSupervisorPinError(''); }
                        else if (k === '✓') onSubmit();
                        else setSupervisorPinValue(p => (p + k).slice(0, pinMax));
                      }}
                      className={`py-2 rounded-lg text-sm font-bold transition-colors ${k === '✓' ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                          k === 'C' ? 'bg-red-100 hover:bg-red-200 text-red-600' :
                            'bg-gray-100 hover:bg-gray-200 text-[#1E293B]'
                        }`}
                    >{k}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 shrink-0 space-y-2">
              {usesPassword && (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={
                    !supervisorPinEmail || !supervisorPinValue ||
                    (isForceClose && (!forceCloseReason || forceCloseReason === '' || !forceCloseAuditAcknowledged))
                  }
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
                >
                  {pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' ? 'Authorize Force Close' : 'Authorize'}
                </button>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >Cancel</button>
            </div>
          </div>
        </div>
  );
}

export default SupervisorPinDialog;
