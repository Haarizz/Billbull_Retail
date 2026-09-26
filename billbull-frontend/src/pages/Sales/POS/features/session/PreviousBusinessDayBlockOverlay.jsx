// Extracted verbatim from POSSales.jsx (R6 - Previous Business Date Still Open Overlay).
// Behaviour is unchanged; only the location moved. The openSessionsBlock guard and the
// session-row deep-link handler (terminal-id storage key, reload) stay in POSSales.

import React from 'react';
import { AlertTriangle, ChevronRight, Clock, MapPin, Users } from 'lucide-react';

function PreviousBusinessDayBlockOverlay({ block, onDismiss, onSelectSession }) {
  return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner">
                <AlertTriangle className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">Previous Business Day Not Closed</h2>
              <p className="text-white/80 text-xs sm:text-sm font-medium">
                Business date {block.currentBusinessDate} still has open session(s) past operating hours.
              </p>
            </div>
            <div className="p-4 sm:p-8 space-y-3 sm:space-y-4">
              <p className="text-xs sm:text-sm text-slate-600">
                POS entry is blocked until a supervisor runs Day Close for the session(s) below.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(block.openSessions || []).map((s) => (
                  <button
                    key={s.sessionId}
                    type="button"
                    onClick={() => onSelectSession(s)}
                    className="w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl p-3 sm:p-4 flex items-center gap-3 shadow-sm transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {s.counterName || 'Counter'} · {s.terminalName || s.terminalId}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Users className="h-3 w-3 shrink-0" />{s.openedBy}
                        <span className="text-slate-300">•</span>
                        <Clock className="h-3 w-3 shrink-0" />
                        {s.openedAt ? new Date(s.openedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-semibold text-xs hover:bg-slate-50 hover:text-slate-700 transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
  );
}

export default PreviousBusinessDayBlockOverlay;
