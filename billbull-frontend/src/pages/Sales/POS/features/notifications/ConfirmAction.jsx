// Extracted verbatim from POSSales.jsx (the Confirm Action modal - the window.confirm replacement
// for delete/cancel actions). Behaviour is unchanged; only the location moved. The confirmAction
// state stays in POSSales, and so does the truthiness guard at the call site, so this component is
// only ever rendered with a non-null confirmAction. The two feature hooks that write it
// (useLayaway.handleCancelLayaway, useHeldSales.deleteHeldBill) are untouched: they still receive
// setConfirmAction from POSSales and drive title/message/busy/error through it.

import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

function ConfirmAction({
  confirmAction,
  setConfirmAction,
}) {
  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !confirmAction.busy && setConfirmAction(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95">
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-[#1E293B] mb-1">{confirmAction.title}</h3>
          <p className="text-sm text-gray-500">{confirmAction.message}</p>
          {confirmAction.error && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
              {confirmAction.error}
            </div>
          )}
        </div>
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => setConfirmAction(null)}
            disabled={confirmAction.busy}
            className="flex-1 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={confirmAction.onConfirm}
            disabled={confirmAction.busy}
            className="flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {confirmAction.busy ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Deleting…</>
            ) : (
              <><Trash2 className="h-3.5 w-3.5" />Delete</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmAction;
