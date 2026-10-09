// Extracted verbatim from POSSales.jsx (R21 - Session Range Exclusion Confirmation).
// Behaviour is unchanged; only the location moved. The Dialog's open expression, its
// onOpenChange handler and the handleCloseDay(true) confirm call are still written in
// POSSales and passed straight through.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent } from '../../../../../components/ui/dialog';

function RangeExclusionConfirmDialog({ open, onOpenChange, rangeExclusionConfirm, onCancel, onConfirm }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1E293B]">Sessions Outside Selected Range</h2>
                <p className="text-xs text-gray-400 mt-0.5">{rangeExclusionConfirm?.message}</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-2 max-h-[50vh] overflow-y-auto">
            {(rangeExclusionConfirm?.excludedSessions || []).map((s) => (
              <div key={s.sessionId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs">
                <span className="text-[#1E293B] font-medium">{s.sessionNo || `SESS-${s.sessionId}`} · {s.cashier || '—'}</span>
                <span className="text-gray-500">{s.status}</span>
              </div>
            ))}
          </div>
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="h-10 px-5 text-sm font-medium text-[#1E293B] bg-[#F5C742] hover:bg-[#e6b838] rounded-xl transition-colors"
            >
              Close Day Anyway
            </button>
          </div>
        </DialogContent>
      </Dialog>
  );
}

export default RangeExclusionConfirmDialog;
