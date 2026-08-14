import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Loader2, ScanLine, Search, ShieldCheck, AlertTriangle, X } from 'lucide-react';

import { PAYMENT_TYPES, toAmount } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import { confirmActionLabel, remainingAfterAllocation } from '../paymentFlow';
import PaymentModalShell, { applyAmountKey } from './PaymentModalShell';
import { lookupCreditVoucher } from '../../../../../api/creditVoucherApi';

const ACCENT = '#8B5CF6';

/**
 * Redeems a Credit Voucher against the current sale.
 *
 * <p>Two stages, deliberately: the voucher must be looked up and shown to the cashier before
 * any amount can be allocated, because the applicable amount depends on a balance only the
 * server knows. Until lookup succeeds there is nothing to allocate.
 *
 * <p><b>Nothing here spends the voucher.</b> Confirming adds a pending allocation carrying the
 * voucher code; the backend redeems it under a row lock during checkout. That is why a cashier
 * can add a voucher, change their mind, remove the line, and the voucher is untouched.
 *
 * <p>The balance shown is a snapshot. Checkout re-validates it server-side, so a voucher spent
 * on another till in between is still correctly refused — the till is never the authority.
 */
export default function VoucherPaymentModal({ remaining, editingLine, offeredTypes, onConfirm, onCancel }) {
  const target = allocationTarget(remaining, editingLine);

  const [code, setCode] = useState(editingLine?.reference || '');
  const [voucher, setVoucher] = useState(editingLine?.metadata?.voucher || null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [amount, setAmount] = useState(editingLine ? String(editingLine.amount) : '');

  const inputRef = useRef(null);

  // Autofocus so a keyboard-wedge scanner's output lands in the field with no click. This is a
  // scoped input focus, not a global key listener — a global one would swallow the product
  // scanner while the modal is open.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const doLookup = useCallback(async () => {
    const token = code.trim();
    if (!token || looking) return;

    setLooking(true);
    setLookupError(null);
    setVoucher(null);

    const result = await lookupCreditVoucher(token);

    if (!result.ok) {
      setLookupError(result.error);
      setLooking(false);
      inputRef.current?.select();
      return;
    }

    const found = result.voucher;
    if (!found.redeemable) {
      // Expired, cancelled, spent, or restricted to another branch — the backend decides
      // which, and its message is shown verbatim rather than re-derived here.
      setLookupError(found.notRedeemableReason || 'This voucher cannot be redeemed.');
      setVoucher(found);
      setLooking(false);
      return;
    }

    setVoucher(found);
    // Pre-fill the most useful amount: the whole bill, or the whole voucher if it is smaller.
    const applicable = Math.min(target, Number(found.remainingAmount) || 0);
    setAmount(applicable > 0 ? applicable.toFixed(2) : '');
    setLooking(false);
  }, [code, looking, target]);

  const clearVoucher = () => {
    setVoucher(null);
    setLookupError(null);
    setAmount('');
    setCode('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const numeric = toAmount(amount);
  const available = Number(voucher?.remainingAmount) || 0;
  // The ceiling is whichever runs out first: the bill or the voucher.
  const maxApplicable = Math.min(target, available);

  const exceedsVoucher = voucher && numeric > available + 0.005;
  const exceedsRemaining = numeric > target + 0.005;

  const amountError = exceedsVoucher
    ? `Voucher only has ${available.toFixed(2)} remaining.`
    : exceedsRemaining
      // A voucher over-allocation cannot become change — the surplus stays on the voucher.
      ? `Cannot exceed the remaining ${target.toFixed(2)}. The unused balance stays on the voucher.`
      : null;

  const canConfirm = Boolean(voucher?.redeemable) && numeric > 0 && !exceedsVoucher && !exceedsRemaining;

  return (
    <PaymentModalShell
      title="Credit Voucher"
      subtitle={voucher
        ? `Applying up to ${maxApplicable.toFixed(2)}`
        : `Remaining to allocate ${target.toFixed(2)}`}
      icon={Gift}
      accent={ACCENT}
      amount={amount}
      onAmountKey={(k) => voucher?.redeemable && setAmount((cur) => applyAmountKey(cur, k))}
      onAmountSet={(v) => voucher?.redeemable && setAmount(v)}
      error={amountError}
      confirmLabel={confirmActionLabel({
        currentType: PAYMENT_TYPES.VOUCHER,
        remainingAfter: remainingAfterAllocation(target, numeric),
        offeredTypes,
        editing: Boolean(editingLine),
      })}
      confirmDisabled={!canConfirm}
      onConfirm={() => onConfirm({
        paymentType: PAYMENT_TYPES.VOUCHER,
        amount: numeric,
        // The code the backend redeems against. This is the whole contract of the allocation.
        reference: voucher.voucherCode,
        // Display-only, so the summary row and receipt can name the voucher without a refetch.
        // Never read as authority for balance or eligibility.
        metadata: { voucher, voucherNumber: voucher.voucherNumber },
      })}
      onCancel={onCancel}
    >
      {/* ── Scan / enter ───────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Scan or Enter Voucher Code
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B5CF6]" />
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={code}
              placeholder="Scan barcode or type e.g. EDZH-PBCR-8C65"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                // A keyboard-wedge scanner ends its output with Enter, so this single handler
                // serves both scanning and manual entry.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  doLookup();
                }
              }}
              disabled={looking}
              aria-label="Voucher code"
              className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 font-mono text-sm uppercase outline-none focus:border-[#8B5CF6] disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={doLookup}
            disabled={looking || !code.trim()}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black text-white transition-all disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look Up
          </button>
        </div>
      </div>

      {lookupError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-red-500" />
          <p className="text-xs font-semibold text-red-600">{lookupError}</p>
        </div>
      )}

      {/* ── Resolved voucher ───────────────────────────────────────── */}
      {voucher && (
        <div className="rounded-xl border-2 p-3"
          style={{ borderColor: `${ACCENT}40`, background: `${ACCENT}08` }}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Voucher</p>
              <p className="text-sm font-black text-slate-800">{voucher.voucherNumber}</p>
              <p className="font-mono text-[10px] text-gray-500">{voucher.voucherCode}</p>
            </div>
            <button type="button" onClick={clearVoucher}
              className="rounded-lg p-1 hover:bg-white/70" aria-label="Clear voucher">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <span className="text-gray-500">Available Balance</span>
            <span className="text-right font-black text-slate-800">{available.toFixed(2)}</span>

            <span className="text-gray-500">Original Amount</span>
            <span className="text-right font-semibold text-slate-600">
              {(Number(voucher.originalAmount) || 0).toFixed(2)}
            </span>

            {Number(voucher.usedAmount) > 0 && (
              <>
                <span className="text-gray-500">Already Used</span>
                <span className="text-right font-semibold text-slate-600">
                  {(Number(voucher.usedAmount) || 0).toFixed(2)}
                </span>
              </>
            )}

            <span className="text-gray-500">Expires</span>
            <span className="text-right font-semibold text-slate-600">
              {voucher.expiryDate || 'No expiry'}
            </span>

            {voucher.customerName && (
              <>
                <span className="text-gray-500">Customer</span>
                <span className="text-right font-semibold text-slate-600">{voucher.customerName}</span>
              </>
            )}
          </div>

          {voucher.redeemable && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <p className="text-[11px] font-semibold text-emerald-700">
                {available > target
                  ? `Applying ${maxApplicable.toFixed(2)} — ${(available - maxApplicable).toFixed(2)} stays on the voucher`
                  : 'Voucher can be applied to this sale'}
              </p>
            </div>
          )}
        </div>
      )}

      {!voucher && !lookupError && (
        <p className="text-center text-[11px] text-gray-400">
          Scan the voucher barcode or type its code, then press Enter.
        </p>
      )}
    </PaymentModalShell>
  );
}
