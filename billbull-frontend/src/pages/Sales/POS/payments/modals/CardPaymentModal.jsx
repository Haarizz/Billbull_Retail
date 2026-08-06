import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';

import { PAYMENT_TYPES, toAmount } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import { confirmActionLabel, remainingAfterAllocation } from '../paymentFlow';
import PaymentModalShell, { applyAmountKey } from './PaymentModalShell';

const ACCENT = '#2563eb';
const CARD_BRANDS = ['Visa', 'Mastercard', 'JCB', 'Amex', 'Apple Pay', 'Google Pay', 'Samsung Pay', 'Other'];

/**
 * Collects one card allocation. Splitting a bill across several cards is just several of
 * these — each gets its own brand, reference and approval code, and each posts as its own
 * card receipt.
 */
export default function CardPaymentModal({ remaining, editingLine, offeredTypes, onConfirm, onCancel }) {
  const target = allocationTarget(remaining, editingLine);
  const [amount, setAmount] = useState(
    editingLine ? String(editingLine.amount) : (target > 0 ? target.toFixed(2) : ''),
  );
  const [brand, setBrand] = useState(editingLine?.paymentSubtype || '');
  const [reference, setReference] = useState(editingLine?.reference || '');
  const [approvalCode, setApprovalCode] = useState(editingLine?.metadata?.approvalCode || '');

  const numeric = toAmount(amount);
  // A card cannot be over-tendered: there is no change to give on a card terminal, so an
  // over-allocation would have to be refunded through a separate channel.
  const exceedsRemaining = numeric > target + 0.005;
  const error = exceedsRemaining
    ? `Card cannot exceed the remaining ${target.toFixed(2)}.`
    : (!brand && numeric > 0 ? 'Please select a card type' : null);

  return (
    <PaymentModalShell
      title="Card Payment"
      subtitle={`Remaining to allocate ${target.toFixed(2)}`}
      icon={CreditCard}
      accent={ACCENT}
      amount={amount}
      onAmountKey={(k) => setAmount((cur) => applyAmountKey(cur, k))}
      onAmountSet={setAmount}
      error={error}
      confirmLabel={confirmActionLabel({
        currentType: PAYMENT_TYPES.CARD,
        remainingAfter: remainingAfterAllocation(target, numeric),
        offeredTypes,
        editing: Boolean(editingLine),
      })}
      confirmDisabled={numeric <= 0 || !brand || exceedsRemaining}
      onConfirm={() => onConfirm({
        paymentType: PAYMENT_TYPES.CARD,
        paymentSubtype: brand,
        amount: numeric,
        reference: reference.trim() || null,
        metadata: approvalCode.trim() ? { approvalCode: approvalCode.trim() } : null,
      })}
      onCancel={onCancel}
    >
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Card / Payment Type</p>
        <div className="grid grid-cols-4 gap-2">
          {CARD_BRANDS.map((b) => (
            <button key={b} type="button" onClick={() => setBrand(b)}
              className={`rounded-xl border-2 px-1 py-2 text-[11px] font-bold transition-all ${
                brand === b ? 'border-transparent bg-[#2563eb] text-white' : 'border-gray-200 text-gray-600 hover:border-[#2563eb]/50'
              }`}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase text-gray-400">Approval Code</label>
          <input type="text" autoComplete="off" value={approvalCode} placeholder="e.g. 123456"
            onChange={(e) => setApprovalCode(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-gray-400">Reference</label>
          <input type="text" autoComplete="off" value={reference} placeholder="e.g. TXN-001"
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
        </div>
      </div>
    </PaymentModalShell>
  );
}
