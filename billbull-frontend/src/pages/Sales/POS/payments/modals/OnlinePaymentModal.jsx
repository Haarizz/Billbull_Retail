import React, { useState } from 'react';
import { Landmark } from 'lucide-react';

import { PAYMENT_TYPES, toAmount } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import { confirmActionLabel, remainingAfterAllocation } from '../paymentFlow';
import PaymentModalShell, { applyAmountKey } from './PaymentModalShell';

const ACCENT = '#0891b2';

/**
 * Collects one online / bank-transfer allocation.
 *
 * The receiving account matters beyond bookkeeping: it is sent as "{code} - {name}" so the
 * backend can resolve the exact Chart-of-Accounts row to post against, which is what makes
 * the transfer reconcilable later.
 */
export default function OnlinePaymentModal({
  remaining, editingLine, offeredTypes, bankAccounts, bankAccountsLoading, onConfirm, onCancel,
}) {
  const target = allocationTarget(remaining, editingLine);
  const [amount, setAmount] = useState(
    editingLine ? String(editingLine.amount) : (target > 0 ? target.toFixed(2) : ''),
  );
  const [bankAccountId, setBankAccountId] = useState(editingLine?.bankAccountId || '');
  const [reference, setReference] = useState(editingLine?.reference || '');

  const numeric = toAmount(amount);
  const exceedsRemaining = numeric > target + 0.005;
  const error = exceedsRemaining
    ? `Transfer cannot exceed the remaining ${target.toFixed(2)}.`
    : (!bankAccountId && numeric > 0 ? 'Please select a bank account' : null);

  const selected = bankAccounts.find((a) => String(a.id) === String(bankAccountId));
  const bankAccountName = selected
    ? `${selected.code || selected.accountCode || ''} - ${selected.name}`.trim()
    : null;

  return (
    <PaymentModalShell
      title="Online / Bank Transfer"
      subtitle={`Remaining to allocate ${target.toFixed(2)}`}
      icon={Landmark}
      accent={ACCENT}
      amount={amount}
      onAmountKey={(k) => setAmount((cur) => applyAmountKey(cur, k))}
      onAmountSet={setAmount}
      error={error}
      confirmLabel={confirmActionLabel({
        currentType: PAYMENT_TYPES.ONLINE,
        remainingAfter: remainingAfterAllocation(target, numeric),
        offeredTypes,
        editing: Boolean(editingLine),
      })}
      confirmDisabled={numeric <= 0 || !bankAccountId || exceedsRemaining}
      onConfirm={() => onConfirm({
        paymentType: PAYMENT_TYPES.ONLINE,
        paymentSubtype: selected?.name || null,
        amount: numeric,
        reference: reference.trim() || null,
        bankAccountId,
        bankAccountName,
      })}
      onCancel={onCancel}
    >
      <div>
        <label className="text-[10px] font-bold uppercase text-gray-400">Receiving Bank Account</label>
        <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#0891b2]">
          <option value="" disabled>
            {bankAccountsLoading
              ? 'Loading bank accounts…'
              : bankAccounts.length === 0
                ? 'No bank accounts configured'
                : '— Select bank account —'}
          </option>
          {bankAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>{acc.name} ({acc.code || acc.accountCode || '-'})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase text-gray-400">Transfer Reference (optional)</label>
        <input type="text" autoComplete="off" value={reference} placeholder="e.g. WIRE-2024-001"
          onChange={(e) => setReference(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#0891b2]" />
      </div>
    </PaymentModalShell>
  );
}
