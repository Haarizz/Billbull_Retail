import React, { memo } from 'react';
import { AlertCircle, Banknote, CreditCard, Landmark, Pencil, Users, X } from 'lucide-react';

import { PAYMENT_TYPES } from './paymentModel';
import { CurrencyAmount } from '../POSCurrency';

const TYPE_STYLE = {
  [PAYMENT_TYPES.CASH]: { icon: Banknote, accent: '#16a34a', label: 'Cash' },
  [PAYMENT_TYPES.CARD]: { icon: CreditCard, accent: '#2563eb', label: 'Card' },
  [PAYMENT_TYPES.ONLINE]: { icon: Landmark, accent: '#0891b2', label: 'Online' },
  // Credit is not money collected — spelling that out on the row is what stops a cashier
  // reading a settled-looking bill as paid when part of it is still owed.
  [PAYMENT_TYPES.CREDIT]: { icon: Users, accent: '#9333ea', label: 'Transferred to Accounts Receivable' },
};

/**
 * One allocated tender. The whole row is the edit affordance — tapping it reopens the modal
 * it came from with its values loaded, so correcting an amount never means deleting and
 * re-adding (which would move the tender to the end of the list and lose its place in the
 * order the receipt prints).
 */
function PaymentAllocationRow({ line, error, onEdit, onRemove }) {
  const style = TYPE_STYLE[line.paymentType] || TYPE_STYLE[PAYMENT_TYPES.CASH];
  const Icon = style.icon;
  const detail = [
    line.paymentSubtype,
    line.customerName,
    line.reference && `Ref ${line.reference}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition-all ${
      error ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-white hover:border-gray-200'
    }`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${style.accent}1A` }}>
        <Icon className="h-4 w-4" style={{ color: style.accent }} />
      </div>

      <button type="button" onClick={() => onEdit(line)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold" style={{ color: style.accent }}>
          {style.label}{line.paymentSubtype ? ` · ${line.paymentSubtype}` : ''}
        </span>
        {detail && <span className="block truncate text-[10px] text-gray-400">{detail}</span>}
        {error && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-700">
            <AlertCircle className="h-3 w-3 shrink-0" />{error}
          </span>
        )}
      </button>

      <span className="shrink-0 text-base font-black" style={{ color: style.accent }}>
        <CurrencyAmount amount={line.amount} />
      </span>

      <button type="button" onClick={() => onEdit(line)} aria-label="Edit allocation"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onRemove(line.id)} aria-label="Remove allocation"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Memoised: a keystroke in one modal re-renders the manager, and without this every
// allocation row would re-render with it. The props are primitives plus stable callbacks,
// so the comparison is cheap and almost always short-circuits.
export default memo(PaymentAllocationRow);
