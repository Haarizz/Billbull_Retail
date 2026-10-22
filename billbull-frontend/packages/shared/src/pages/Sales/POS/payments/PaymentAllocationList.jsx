import React, { memo } from 'react';
import { Wallet } from 'lucide-react';

import PaymentAllocationRow from './PaymentAllocationRow';

/**
 * The tenders allocated so far, in the order the cashier entered them.
 *
 * Order is meaningful and never re-sorted: the receipt, the settlement summary and the
 * payment history all read back in this same sequence, so a cashier reconciling a drawer
 * sees the same story on screen and on paper.
 */
function PaymentAllocationList({ lines, lineErrors, onEdit, onRemove }) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center">
        <Wallet className="h-7 w-7 text-gray-300" />
        <p className="text-sm font-bold text-gray-400">No payments added yet</p>
        <p className="text-xs text-gray-400">Pick a payment method above to start allocating.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <PaymentAllocationRow
          key={line.id}
          line={line}
          error={lineErrors[line.id]}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

// Memoised alongside the rows so typing in a modal doesn't re-render the whole entry list.
export default memo(PaymentAllocationList);
