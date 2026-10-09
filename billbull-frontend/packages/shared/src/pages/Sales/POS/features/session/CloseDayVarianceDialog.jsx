// Extracted verbatim from POSSales.jsx (R20 - Close Day Reconciliation Variance Dialog).
// Behaviour is unchanged; only the location moved. The Dialog's open expression and its
// onOpenChange handler are still written in POSSales and passed straight through.

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Dialog, DialogContent } from '../../../../../components/ui/dialog';

function CloseDayVarianceDialog({ open, onOpenChange, closeDayVariance, onClose }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">
                    {closeDayVariance?.stage === 'CASH' ? 'Cash Reconciliation Failed' : 'Sales Reconciliation Failed'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Close day was blocked — review the variance breakdown below</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {closeDayVariance?.breakdown && Object.entries(closeDayVariance.breakdown).map(([key, value]) => {
              const isVariance = key === 'variance';
              const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
              const num = Number(value);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg ${isVariance ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}
                >
                  <span className={`text-sm ${isVariance ? 'font-semibold text-red-600' : 'text-gray-600'}`}>{label}</span>
                  <span className={`text-sm font-mono ${isVariance ? 'font-bold text-red-600' : 'text-[#1E293B]'}`}>
                    {Number.isFinite(num) ? num.toFixed(2) : String(value)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
  );
}

export default CloseDayVarianceDialog;
