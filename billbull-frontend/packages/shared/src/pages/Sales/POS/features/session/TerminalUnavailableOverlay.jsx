// Extracted verbatim from POSSales.jsx (R1 - Terminal Registration Rejected Overlay).
// Behaviour is unchanged; only the location moved. The terminalRegistrationError guard and the
// register-new handler (confirm, localStorage reset, reload) stay in POSSales.

import React from 'react';
import { AlertCircle } from 'lucide-react';

import { resolveTerminalUnavailableConfig } from '../terminal/terminalUnavailable';

function TerminalUnavailableOverlay({ reason, onRegisterNew }) {
  const cfg = resolveTerminalUnavailableConfig(reason);
  return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner">
                <AlertCircle className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">{cfg.title}</h2>
              <p className="text-white/80 text-xs sm:text-sm font-medium">This device cannot register a session until this is resolved</p>
            </div>
            <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-sm text-slate-700">
                {cfg.message}
              </div>
              {cfg.hint && (
                <p className="text-xs text-slate-500 leading-relaxed">{cfg.hint}</p>
              )}
              {cfg.allowRegisterNew ? (
                <button
                  type="button"
                  onClick={onRegisterNew}
                  className="w-full py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm transition-all shadow-md"
                >
                  {cfg.registerLabel}
                </button>
              ) : (
                <div className="w-full py-3 sm:py-3.5 rounded-2xl bg-slate-100 text-slate-500 font-semibold text-sm text-center border border-slate-200">
                  Contact Administrator
                </div>
              )}
            </div>
          </div>
        </div>
  );
}

export default TerminalUnavailableOverlay;
