// Extracted verbatim from POSSales.jsx (Supervisor PIN Dialog).
// Behaviour is unchanged; only the location moved. The approval queue and credential state stay in
// useSupervisorApproval, the force-close fields in useSessionClosure, and the showSupervisorPin guard,
// handleSupervisorPinSubmit and cancelApproval in POSSales. The only edits are the handler names:
// Enter and the keypad call onSubmit() with no arguments; Authorize and Cancel pass onSubmit/onCancel
// by reference. Known approval defects are preserved on purpose — see the characterization test.

import React from 'react';
import { AlertCircle, Shield } from 'lucide-react';

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
  onSubmit,
  onCancel,
}) {
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

              <div className="space-y-3">
                {supervisorApprovalMode === 'PASSWORD' && (
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                    {supervisorApprovalMode === 'PASSWORD' ? 'Supervisor Password' : 'Supervisor PIN'}
                  </label>
                  <input
                    type="password"
                    value={supervisorPinValue}
                    onChange={e => { setSupervisorPinValue(e.target.value); setSupervisorPinError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
                    autoFocus={supervisorApprovalMode !== 'PASSWORD'}
                    maxLength={supervisorApprovalMode === 'PASSWORD' ? 64 : 8}
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 ${supervisorApprovalMode === 'PASSWORD' ? 'text-sm' : 'text-center text-lg tracking-[0.5em]'}`}
                    placeholder={supervisorApprovalMode === 'PASSWORD' ? '' : '····'}
                  />
                  {supervisorPinError && (
                    <p className="text-[11px] font-medium text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{supervisorPinError}
                    </p>
                  )}
                </div>
              </div>

              {supervisorApprovalMode !== 'PASSWORD' && (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map(k => (
                    <button
                      key={k}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (k === 'C') { setSupervisorPinValue(''); setSupervisorPinError(''); }
                        else if (k === '✓') onSubmit();
                        else setSupervisorPinValue(p => (p + k).slice(0, 8));
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
              {supervisorApprovalMode === 'PASSWORD' && (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={
                    !supervisorPinEmail || !supervisorPinValue ||
                    (pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' && (!forceCloseReason || forceCloseReason === '' || !forceCloseAuditAcknowledged))
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
