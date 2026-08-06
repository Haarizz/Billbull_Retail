import React, { useMemo, useState } from 'react';
import { Banknote } from 'lucide-react';

import { PAYMENT_TYPES, toAmount } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import { confirmActionLabel } from '../paymentFlow';
import { DirhamSymbol } from '../../POSCurrency';
import PaymentModalShell, { applyAmountKey } from './PaymentModalShell';

const ACCENT = '#16a34a';
/** Standard AED note denominations — the amounts a customer actually hands over. */
const NOTES = [50, 100, 200, 500, 1000];

/**
 * Collects one cash allocation.
 *
 * Cash is the only tender allowed to exceed what is still owed — the excess is the
 * customer's change, shown live here so the cashier knows what to hand back before
 * confirming rather than after.
 */
export default function CashPaymentModal({ remaining, editingLine, offeredTypes, onConfirm, onCancel }) {
  // What this allocation is being asked to cover: the remaining balance, plus whatever this
  // line already contributed when editing (otherwise editing a line would see its own
  // amount as already allocated and read the remaining balance as zero).
  const target = allocationTarget(remaining, editingLine);

  const [amount, setAmount] = useState(
    editingLine ? String(editingLine.amount) : (target > 0 ? target.toFixed(2) : ''),
  );

  const tendered = toAmount(amount);
  const applied = Math.min(tendered, target);
  const change = Math.max(0, tendered - target);
  const stillDue = Math.max(0, target - tendered);

  const quickAmounts = useMemo(() => {
    const exact = target > 0 ? [{ label: `Exact (${target.toFixed(2)})`, value: target.toFixed(2) }] : [];
    return exact.concat(NOTES.map((n) => ({ label: String(n), value: String(n) })));
  }, [target]);

  return (
    <PaymentModalShell
      title="Cash Payment"
      subtitle={`Remaining to allocate ${target.toFixed(2)}`}
      icon={Banknote}
      accent={ACCENT}
      amount={amount}
      amountLabel="Cash Received"
      onAmountKey={(k) => setAmount((cur) => applyAmountKey(cur, k))}
      onAmountSet={setAmount}
      quickAmounts={quickAmounts}
      onQuickAmount={setAmount}
      confirmLabel={confirmActionLabel({
        currentType: PAYMENT_TYPES.CASH,
        remainingAfter: stillDue,
        offeredTypes,
        editing: Boolean(editingLine),
      })}
      confirmDisabled={tendered <= 0}
      onConfirm={() => onConfirm({ paymentType: PAYMENT_TYPES.CASH, amount: tendered })}
      onCancel={onCancel}
      footer={(
        <div className="space-y-1 text-sm">
          <Row label="Tendered" value={tendered} />
          <Row label="Applied to bill" value={applied} strong />
          {stillDue > 0 && (
            <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700">
              <span>Still remaining after this</span>
              <span><DirhamSymbol /> {stillDue.toFixed(2)}</span>
            </div>
          )}
          {change > 0 && (
            <div className="flex justify-between rounded-lg bg-green-50 px-3 py-2 font-bold text-green-700">
              <span>Change to return</span>
              <span><DirhamSymbol /> {change.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    />
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex justify-between text-gray-500">
      <span>{label}</span>
      <span className={strong ? 'font-bold text-[#1E293B]' : 'text-[#1E293B]'}>
        <DirhamSymbol /> {value.toFixed(2)}
      </span>
    </div>
  );
}
