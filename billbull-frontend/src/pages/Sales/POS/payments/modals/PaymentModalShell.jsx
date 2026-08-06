import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import { DirhamSymbol } from '../../POSCurrency';

/**
 * Shared chrome for the five payment-allocation modals: coloured header, amount display,
 * numeric keypad and the confirm/cancel footer.
 *
 * Each modal supplies only the fields that belong to its own tender type — the keypad and
 * the amount readout are the only things they have in common, so those live here and
 * nothing else does.
 *
 * Keyboard-first, because a busy till is driven by a keyboard and a scanner rather than a
 * touchscreen: digits type straight into the amount without the cashier having to click it,
 * Enter confirms, Escape cancels. Nothing here needs a mouse.
 */
export default function PaymentModalShell({
  title,
  subtitle,
  icon: Icon,
  accent,
  amount,
  amountLabel = 'Amount',
  onAmountKey,
  onAmountSet,
  quickAmounts = null,
  onQuickAmount = null,
  children,
  footer = null,
  error = null,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
}) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];
  const dialogRef = useRef(null);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter') {
      // Enter always means "commit this allocation", wherever focus happens to be —
      // except inside a <select>, where the browser uses it to pick an option.
      if (event.target.tagName === 'SELECT') return;
      event.preventDefault();
      if (!confirmDisabled) onConfirm();
      return;
    }
    // Typing digits anywhere outside a text field goes to the amount, so the cashier can
    // open the modal and start keying the amount immediately.
    const isTextField = event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA';
    if (isTextField) return;
    if (/^[0-9]$/.test(event.key) || event.key === '.') {
      event.preventDefault();
      onAmountKey(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      onAmountKey('⌫');
    } else if (event.key.toLowerCase() === 'c') {
      event.preventDefault();
      onAmountSet('');
    }
  }, [confirmDisabled, onCancel, onConfirm, onAmountKey, onAmountSet]);

  // Focus the dialog on open so the key handler receives input without a click first.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <PaymentModalFrame
      title={title}
      subtitle={subtitle}
      icon={Icon}
      accent={accent}
      onCancel={onCancel}
      dialogRef={dialogRef}
      onKeyDown={handleKeyDown}
      footer={(
        <>
          <button type="button" onClick={onCancel}
            className="rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled}
            className="flex-1 rounded-xl py-3 text-sm font-black text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-300"
            style={confirmDisabled ? undefined : { backgroundColor: accent }}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3 p-5">
          <div className="flex items-center justify-between rounded-xl border-2 px-4 py-3"
            style={{ borderColor: accent }}>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{amountLabel}</span>
            <span className="text-2xl font-black text-[#1E293B]">
              <DirhamSymbol /> {amount || '0'}
            </span>
          </div>

          {quickAmounts && quickAmounts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map(({ label, value }) => (
                <button key={label} type="button" onClick={() => onQuickAmount(value)}
                  className="rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-all hover:bg-gray-50"
                  style={{ borderColor: accent, color: accent }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {keys.map((k) => (
              <button key={k} type="button" tabIndex={-1} onClick={() => onAmountKey(k)}
                className={`rounded-xl py-3 text-lg font-bold transition-all ${
                  k === '⌫' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-gray-50 text-[#1E293B] hover:bg-gray-100'
                }`}>
                {k}
              </button>
            ))}
          </div>

          {children}

          {footer}

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {error}
            </div>
          )}
        </div>
    </PaymentModalFrame>
  );
}

/**
 * The chrome every payment modal shares: overlay, coloured header, scroll body and the
 * footer button row — everything except the keypad.
 *
 * Split out of the shell so a modal that needs a different body (the credit modal's customer
 * step has no amount to key yet) still looks and behaves like part of the same payment
 * system, instead of being a second dialog design that drifts.
 */
export function PaymentModalFrame({
  title,
  subtitle,
  icon: Icon,
  accent,
  onCancel,
  children,
  footer,
  hint = 'Type to enter the amount · Enter to confirm · Esc to cancel',
  dialogRef = null,
  onKeyDown = null,
}) {
  const fallbackRef = useRef(null);
  const ref = dialogRef || fallbackRef;

  // Focus the dialog on open so the key handler receives input without a click first.
  useEffect(() => {
    if (!dialogRef) ref.current?.focus();
  }, [dialogRef, ref]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown || undefined}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none"
      >
        <div className="flex items-center gap-3 rounded-t-2xl px-5 py-4 text-white" style={{ backgroundColor: accent }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-wide">{title}</p>
            {subtitle && <p className="truncate text-xs opacity-90">{subtitle}</p>}
          </div>
          <button type="button" onClick={onCancel} aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}

        <div className="flex items-center gap-2 border-t border-gray-100 p-4">
          {footer}
        </div>
        {hint && (
          <p className="px-4 pb-3 text-center text-[10px] text-gray-400">{hint}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Applies one keypad press to an amount string. Shared by every modal so backspace,
 * the decimal guard and clear behave identically wherever the cashier is typing.
 */
export function applyAmountKey(current, key) {
  if (key === 'C') return '';
  if (key === '⌫') return current.slice(0, -1);
  if (key === '.' && current.includes('.')) return current;
  return current + key;
}
