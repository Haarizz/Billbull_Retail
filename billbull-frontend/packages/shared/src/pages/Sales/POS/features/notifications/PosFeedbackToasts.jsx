// Extracted verbatim from POSSales.jsx (R27 - Cash Drop / Share Receipt / Print fallback toasts).
// Behaviour is unchanged; only the location moved. The three feedback values, their timers and
// cleanup effect, and the setter behind onDismissPrintFeedback stay in POSSales (printFeedback via
// usePosPrinting). Rendered as a fragment so the toasts stay direct siblings in the POSSales root,
// in the same order: receipt-share z-[220] above both z-[200] toasts, print above cash-drop by DOM order.

import React from 'react';
import { CheckCircle, Printer, X, XCircle } from 'lucide-react';

function PosFeedbackToasts({ cashDropFeedback, receiptShareFeedback, printFeedback, onDismissPrintFeedback }) {
  return (
    <>
      {/* Cash Drop feedback toast */}
      {cashDropFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${cashDropFeedback.type === 'success' ? 'bg-[#327F74] text-white' : 'bg-red-500 text-white'}`}>
          {cashDropFeedback.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {cashDropFeedback.message}
        </div>
      )}

      {/* Share Receipt feedback toast */}
      {receiptShareFeedback && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[220] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${receiptShareFeedback.type === 'success' ? 'bg-[#327F74] text-white' : 'bg-red-500 text-white'}`}
        >
          {receiptShareFeedback.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {receiptShareFeedback.message}
        </div>
      )}

      {/* Print fallback toast — explains why a browser print-preview just opened
          (no printer configured, or the configured one/agent didn't respond). */}
      {printFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md ${printFeedback.type === 'warning' ? 'bg-amber-500 text-gray-900' : 'bg-red-500 text-white'}`}>
          <Printer className="h-4 w-4 shrink-0" />
          <span>{printFeedback.message}</span>
          <button type="button" onClick={onDismissPrintFeedback} className="ml-1 shrink-0 opacity-80 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

export default PosFeedbackToasts;
