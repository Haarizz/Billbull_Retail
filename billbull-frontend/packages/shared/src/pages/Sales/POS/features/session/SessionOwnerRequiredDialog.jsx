// Extracted verbatim from POSSales.jsx (R13 - Session Owner Required Dialog).
// Behaviour is unchanged; only the location moved. The showSessionOwnerRequiredDialog guard,
// the `sessionToClose || currentSession` target fallback and the
// setShowSessionOwnerRequiredDialog(false) close call are still written in POSSales and
// passed straight through.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';

function SessionOwnerRequiredDialog({ targetSession, onClose }) {
  return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-base font-bold text-white">Session Owner Required</h2>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-600">
              <p>
                This session can only be closed normally by the cashier who opened it.
              </p>

              {(() => {
                const tgt = targetSession;
                if (!tgt) return null;
                return (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-500">Terminal:</span> <span className="font-semibold text-slate-800">{tgt.terminalName || tgt.terminalId}</span></div>
                    <div><span className="text-slate-500">Session:</span> <span className="font-semibold text-slate-800">{tgt.sessionNo || (tgt.id ? `SESS-${tgt.id}` : '—')}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Cashier:</span> <span className="font-semibold text-slate-800">{tgt.cashier || tgt.openedBy || tgt.userId || '—'}</span></div>
                  </div>
                );
              })()}

              <p className="text-xs">
                To close this session as a supervisor, please use the <strong>Force Close</strong> option from the menu.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <Button
                variant="default"
                className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
  );
}

export default SessionOwnerRequiredDialog;
