// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// THE CART BOUNDARY. This owns the one authoritative live cart object and the operations
// that are purely cart-domain. It is deliberately small: the shared surface that checkout,
// held sales, layaway and delivery all consume is `currentInvoice`, `recalculateInvoice`
// and `cartItemsToPayload`, and that is what this isolates.
//
// ONE AUTHORITATIVE STATE. `currentInvoice` lives here and nowhere else. POSSales
// destructures it back under the same name, so every existing consumer — the JSX, the
// POSTouchScreen and TradePOS prop bags, and all four feature hooks — reads the same
// object through the same binding. No mirror, no copy.
//
// WHAT IS DELIBERATELY *NOT* HERE, and why:
//
//   clearInvoice        Resets the cart AND setShippingCharge(0) AND the payment
//                       manager's allocations. That is a workspace reset spanning three
//                       domains, not a cart operation. POSSales keeps the composite and
//                       calls resetCartState() below for the cart half. (It also could
//                       not live here without a ref: the payment manager is declared
//                       after the first cart read.)
//   addToInvoice        ~190 lines of batch/serial resolution, price-floor warnings and
//                       supervisor gating. Cart is its output, not its domain.
//   voidFromInvoice     Supervisor-PIN and layaway-abort gated; writes four
//                       approval-domain states.
//   updateDiscount /    Both route a below-floor change into the price-override approval
//   updateItemPrice     dialog before touching the cart.
//   updateQuantity      Emits UI feedback via showFeedback and enforces the
//                       batch-controlled rule.
//
// Each of those stays in POSSales and mutates the cart through this boundary, which is
// the point: they are gated *actions*, and the cart is what they act on.
//
// Nothing was normalised while moving. The totals still come from the single shared
// computePosCartTotals, the payload projection keeps its voidMode/taxEnabled semantics
// and its existing dependency array, and cartItemsToPayload remains distinct from
// buildPosCheckoutItems — the two were characterized as deliberately different.
import { useCallback, useEffect, useRef, useState } from 'react';

import { computePosCartTotals, toNumber } from '../../posUtils';

/** The empty-cart shape. Identical to the original initial state and to clearInvoice's. */
const EMPTY_CART = {
  items: [],
  subtotal: 0,
  totalDiscount: 0,
  tax: 0,
  total: 0,
  billDiscountAmount: 0,
};

/**
 * @param {object}      args
 * @param {object|null} args.posSettings the live POS settings — supplies the VAT mode and
 *                      branch default rate for totals, and voidMode/taxEnabled for the
 *                      payload projection.
 */
export function useCart({ posSettings } = {}) {
  const [currentInvoice, setCurrentInvoice] = useState({ ...EMPTY_CART });
  const currentInvoiceRef = useRef(null);

  useEffect(() => { currentInvoiceRef.current = currentInvoice; }, [currentInvoice]);

  // Global VAT mode: Inclusive means the entered price already contains VAT,
  // Exclusive means VAT is added on top. Fallback rate from the branch's Tax
  // Configuration — 0 outright when Tax Enabled is off (kill switch), regardless
  // of the configured Branch Default VAT Rate. The math itself lives in
  // posUtils.computePosCartTotals so it can be unit-tested; this reads the live
  // posSettings (every cart mutation re-runs it, so a scan always uses the
  // current mode, never a mount-time snapshot).
  const recalculateInvoice = (items, billDiscountAmount = 0) =>
    computePosCartTotals(items, billDiscountAmount, posSettings);

  /**
   * The cart half of POSSales' clearInvoice. Kept separate because the full reset also
   * clears the order-level shipping charge and the payment allocations, which are not
   * cart state.
   */
  const resetCartState = () => {
    setCurrentInvoice({ ...EMPTY_CART });
  };

  const removeFromInvoice = (itemId) => {
    setCurrentInvoice(prev => {
      const newItems = prev.items.filter(item => item.id !== itemId);
      return recalculateInvoice(newItems);
    });
  };

  const applyVoid = (itemId) => {
    // DELETE mode physically removes the line; VOID mode (default) keeps it
    // marked so it stays visible on the receipt / audit log / reports.
    if (posSettings?.voidMode === 'DELETE') {
      removeFromInvoice(itemId);
      return;
    }
    setCurrentInvoice(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId ? { ...item, isVoided: true } : item
      );
      return recalculateInvoice(newItems);
    });
  };

  // Map live cart lines to the backend item shape shared by checkout + layaway.
  // (Voided lines are dropped — a layaway only reserves what's actually being sold.)
  const cartItemsToPayload = useCallback((items) => {
    const isDeleteMode = posSettings?.voidMode === 'DELETE';
    return items
      .filter(item => !isDeleteMode || !item.isVoided)
      .map(item => ({
        itemCode: item.code || item.productId || item.id,
        itemName: item.name,
        quantity: item.quantity,
        unit: 'Each',
        price: item.price,
        discount: item.discount || 0,
        taxRate: toNumber(item.taxRate, posSettings?.taxEnabled === false ? 0 : toNumber(posSettings?.branchDefaultVatRate, 0)),
        batchNumber: item.isVoided ? null : (item.pinnedBatchNumber || null),
        serialNumber: item.isVoided ? null : (item.serialNumber || null),
        voided: !!item.isVoided,
      }));
    // Dependency array preserved verbatim: it omits posSettings?.taxEnabled even though
    // the body reads it. Adding it would change when this callback refreshes — a
    // behaviour change and a defect fix, both out of scope for this extraction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSettings?.voidMode, posSettings?.branchDefaultVatRate]);

  return {
    currentInvoice,
    setCurrentInvoice,
    currentInvoiceRef,
    recalculateInvoice,
    resetCartState,
    removeFromInvoice,
    applyVoid,
    cartItemsToPayload,
  };
}

export default useCart;
