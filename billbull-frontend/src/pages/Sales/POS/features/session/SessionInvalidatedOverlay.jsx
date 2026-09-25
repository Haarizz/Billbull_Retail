// Extracted verbatim from POSSales.jsx (Phase 12 - Session Transferred/Invalidated Overlay).
// Behaviour is unchanged; only the location moved. The sessionInvalidated guard stays in POSSales.

import React from 'react';
import { Lock } from 'lucide-react';

function SessionInvalidatedOverlay({ sessionInvalidReason, onReturnToDashboard }) {
  return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Session No Longer Available</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              {sessionInvalidReason || 'Your active POS session has been transferred to another terminal or closed remotely. This terminal can no longer continue using that session.'}
            </p>
            <button
              onClick={onReturnToDashboard}
              className="w-full py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors focus:ring-4 focus:ring-gray-200"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
  );
}

export default SessionInvalidatedOverlay;
