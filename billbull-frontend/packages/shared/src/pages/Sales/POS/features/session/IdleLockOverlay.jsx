// Extracted verbatim from POSSales.jsx (R2 - Idle Lock Overlay).
// Behaviour is unchanged; only the location moved. The isIdleLocked guard stays in POSSales.

import React from 'react';
import { Lock } from 'lucide-react';

function IdleLockOverlay({ onResume, onSupervisorTakeover }) {
  return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 text-center p-8 space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Session Locked</h2>
            <p className="text-sm text-gray-500">This terminal was locked due to inactivity.</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={onResume}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600"
              >
                Resume My Session
              </button>
              <button
                onClick={onSupervisorTakeover}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50"
              >
                Supervisor Takeover
              </button>
            </div>
          </div>
        </div>
  );
}

export default IdleLockOverlay;
