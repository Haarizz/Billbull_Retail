import { useCallback, useMemo, useState } from 'react';

import { PAYMENT_TYPES, createPaymentLine, toAmount } from './paymentModel';
import {
  canSettle as selectCanSettle,
  changeAmount as selectChangeAmount,
  isFullyAllocated as selectIsFullyAllocated,
  isOverAllocated as selectIsOverAllocated,
  lineErrors as selectLineErrors,
  paymentSummary as selectPaymentSummary,
  remainingBalance as selectRemainingBalance,
  totalAllocated as selectTotalAllocated,
  totalOfType,
} from './paymentSelectors';

/**
 * The Checkout Payment Manager — sole owner of POS checkout payment state.
 *
 * Holds one thing: `paymentLines`, the ordered list of tenders the cashier has allocated.
 * Everything else it returns is derived on demand, so no total, remaining balance or
 * summary label is ever stored twice and they cannot fall out of sync.
 *
 * @param {number} invoiceTotal            amount due (net of any layaway deposit)
 */
export function usePaymentManager({ invoiceTotal = 0 } = {}) {
  const [paymentLines, setPaymentLines] = useState([]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  // All keyed by line id, never array index, so deleting one tender cannot silently
  // retarget an edit at another.

  /** Appends a tender. Insertion order is the allocation order and is never re-sorted. */
  const addLine = useCallback((draft) => {
    const created = createPaymentLine(draft);
    setPaymentLines((prev) => [...prev, created]);
    return created;
  }, []);

  /** Edits a tender in place — the cashier can fix an amount or reference without
   *  deleting and re-adding, which would move it to the end of the list. */
  const updateLine = useCallback((id, patch) => {
    setPaymentLines((prev) => prev.map((l) => (
      l.id === id
        ? { ...l, ...patch, ...(patch.amount !== undefined ? { amount: toAmount(patch.amount) } : {}) }
        : l
    )));
  }, []);

  const removeLine = useCallback((id) => {
    setPaymentLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clearLines = useCallback(() => setPaymentLines([]), []);

  // ── Derived values ─────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    totalCash: totalOfType(paymentLines, PAYMENT_TYPES.CASH),
    totalCard: totalOfType(paymentLines, PAYMENT_TYPES.CARD),
    totalOnline: totalOfType(paymentLines, PAYMENT_TYPES.ONLINE),
    totalCredit: totalOfType(paymentLines, PAYMENT_TYPES.CREDIT),
    totalAllocated: selectTotalAllocated(paymentLines),
  }), [paymentLines]);

  const remaining = useMemo(
    () => selectRemainingBalance(paymentLines, invoiceTotal),
    [paymentLines, invoiceTotal],
  );

  const change = useMemo(
    () => selectChangeAmount(paymentLines, invoiceTotal),
    [paymentLines, invoiceTotal],
  );

  const errors = useMemo(
    () => selectLineErrors(paymentLines),
    [paymentLines],
  );

  const summary = useMemo(() => selectPaymentSummary(paymentLines), [paymentLines]);

  const fullyAllocated = useMemo(
    () => selectIsFullyAllocated(paymentLines, invoiceTotal),
    [paymentLines, invoiceTotal],
  );
  const overAllocated = useMemo(
    () => selectIsOverAllocated(paymentLines, invoiceTotal),
    [paymentLines, invoiceTotal],
  );
  const settleReady = useMemo(
    () => selectCanSettle(paymentLines, invoiceTotal),
    [paymentLines, invoiceTotal],
  );

  return {
    paymentLines,
    invoiceTotal,
    addLine,
    updateLine,
    removeLine,
    clearLines,
    ...totals,
    remainingBalance: remaining,
    changeAmount: change,
    paymentSummary: summary,
    lineErrors: errors,
    isFullyAllocated: fullyAllocated,
    isOverAllocated: overAllocated,
    canSettle: settleReady,
  };
}

export default usePaymentManager;
