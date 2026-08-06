import React, { memo } from 'react';

import { paymentBlockRows } from './paymentPresentation';

/**
 * The payment breakdown for a recorded sale, shared by every back-office screen that shows
 * one: sales list detail, invoice details, transaction preview, customer history.
 *
 * Renders exactly the rows the receipt printed — same source (`paymentBlockRows`), same
 * order, same labels — so a user comparing a screen against the customer's copy sees the
 * same thing. That is the whole reason this is a component rather than a snippet repeated
 * per screen.
 *
 * Falls back to the invoice's stored payment-mode text for sales with no recorded tender
 * (an unpaid credit invoice), and for anything else it cannot reconstruct.
 */
function PaymentDetailsPanel({ block, storedMode, compact = false, className = '' }) {
  if (!block) {
    if (!storedMode) return null;
    return (
      <div className={`text-xs text-slate-500 ${className}`}>
        <span className="font-semibold text-slate-700">Payment Mode:</span> {storedMode}
      </div>
    );
  }

  const rows = paymentBlockRows(block);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-bold uppercase tracking-wide text-slate-400 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          Payment Mode
        </span>
        <span className={`font-bold text-slate-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {block.summaryLabel}
        </span>
      </div>

      <div className={`mt-1.5 space-y-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-end justify-between gap-3">
            {/* Wraps at word boundaries rather than truncating: a long tender name
                ("Transferred to Accounts Receivable") must stay readable, and the amount
                stays in its column because it can't shrink. */}
            <span className="min-w-0 break-words text-slate-500">{row.label}</span>
            <span className={`shrink-0 tabular-nums ${row.emphasis ? 'font-bold text-slate-800' : 'text-slate-700'}`}>
              {row.amount.toFixed(2)}
            </span>
          </div>
        ))}
        {block.hasReceivable && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
            <span className="text-slate-500">Invoice Total</span>
            <span className="shrink-0 tabular-nums font-bold text-slate-800">
              {block.invoiceTotal.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PaymentDetailsPanel);
