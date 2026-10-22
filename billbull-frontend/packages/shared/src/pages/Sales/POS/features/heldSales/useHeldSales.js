// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// Held sales ("Hold"/recall of a parked bill). A Hold is a zero-deposit layaway
// (hold=true) that reuses the layaway reservation workflow, so every call here goes to
// the layaway endpoints — that is the existing contract and is preserved exactly.
//
// Moved unchanged: the ACTIVE+hold+session filter, the pill projection, the createLayaway
// payload, the alert texts, the confirm-dialog wiring, the 403 message, and the ordering
// of clearInvoice -> loadHeldSales -> syncPosData.
//
// LATE-BOUND syncPosData. syncPosData is declared *after* this hook's call site in
// POSSales and depends on the loadHeldSales this hook returns, so it is reached through
// a ref. The original code reached it through the component closure, which resolves at
// event time rather than render time; the ref preserves exactly that, and breaks what
// would otherwise be a circular call-site dependency.
//
// startLayawayConversion is NOT late-bound: useLayaway now owns it and is called before
// this hook, so it arrives as an ordinary argument.
import { useCallback, useEffect, useState } from 'react';

import { cancelLayaway, createLayaway, getLayaways } from '../../../../../api/posApi';
import { WALK_IN_CUSTOMER } from '../../posConstants';

/**
 * @param {object}   args
 * @param {number|null} args.sessionId            the numeric POS session id, or null
 * @param {object|null} args.currentSession
 * @param {object|null} args.currentTerminal
 * @param {object}   args.currentInvoice            the live cart (read-only here)
 * @param {object|null} args.selectedCustomerData
 * @param {object|null} args.posSettings
 * @param {Function} args.cartItemsToPayload        cart -> wire items projection
 * @param {Function} args.clearInvoice              empties the live cart after a hold
 * @param {Function} args.setConfirmAction          outer confirm-dialog state setter
 * @param {object}   args.syncPosDataRef            ref holding POSSales' syncPosData
 * @param {Function} args.startLayawayConversion   from useLayaway, called on recall
 */
export function useHeldSales({
  sessionId,
  currentSession,
  currentTerminal,
  currentInvoice,
  selectedCustomerData,
  posSettings,
  cartItemsToPayload,
  clearInvoice,
  setConfirmAction,
  syncPosDataRef,
  startLayawayConversion,
} = {}) {
  const [heldSales, setHeldSales] = useState([]);
  const [holdBusy, setHoldBusy] = useState(false);

  const loadHeldSales = useCallback(async () => {
    if (!sessionId) { setHeldSales([]); return; }
    try {
      // A "Hold" is a zero-deposit layaway (hold=true). The quick-recall pills show
      // this session's open holds; full layaways live in the Layaways list.
      const branchId = currentTerminal?.branchId || currentSession?.branchId || null;
      const all = await getLayaways({ branchId, status: 'ACTIVE' });
      const holds = (all || [])
        .filter(l => l.hold === true && l.posSessionId === sessionId)
        .map(l => ({
          id: l.id,
          label: l.layawayNumber,
          total: l.saleTotal || 0,
          itemCount: (l.items || []).length,
          customerName: l.customerName,
        }));
      setHeldSales(holds);
    } catch (err) {
      console.warn('Held sales load failed', err);
    }
  }, [sessionId, currentTerminal, currentSession]);

  useEffect(() => { loadHeldSales(); }, [loadHeldSales]);

  // Hold = a zero-deposit layaway. Reuses the layaway reservation workflow (stock is
  // reserved, it shows in the Layaways list) but takes no deposit and allows Walk-in.
  const holdInvoice = async () => {
    if (currentInvoice.items.length === 0 || holdBusy) return;
    if (!sessionId) { alert('Open a POS session before holding a bill.'); return; }
    setHoldBusy(true);
    try {
      const isWalkIn = !selectedCustomerData || selectedCustomerData.id === WALK_IN_CUSTOMER.id;
      await createLayaway({
        hold: true,
        customerCode: isWalkIn ? 'WALK-IN' : (selectedCustomerData.code || selectedCustomerData.id),
        customerName: isWalkIn ? 'Walk-in Customer' : selectedCustomerData.name,
        customerPhone: isWalkIn ? null : (selectedCustomerData.phone || null),
        branchId: currentTerminal?.branchId || currentSession?.branchId || null,
        branchName: currentTerminal?.branchName || currentSession?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        sessionId,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        depositRequired: false,
        depositAmount: 0,
        reserveStockRequested: true,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        taxInclusive: posSettings?.taxInclusive === true,
        items: cartItemsToPayload(currentInvoice.items),
      });
      clearInvoice();
      await loadHeldSales();
      syncPosDataRef.current();
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to hold the bill.');
    } finally {
      setHoldBusy(false);
    }
  };

  // Recall a held bill: load its hold-layaway back into the live cart for completion
  // (checkout marks the hold converted, releasing its reservation).
  const recallInvoice = async (id) => {
    try {
      await startLayawayConversion(id);
      await loadHeldSales();
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to recall the held bill.');
    }
  };

  // Delete a held bill: cancel the underlying layaway (releases reserved stock)
  // and refresh the held-sales list so the pill disappears.
  const deleteHeldBill = (id) => {
    const heldBill = heldSales.find(h => h.id === id);
    setConfirmAction({
      title: 'Delete Held Bill',
      message: `Delete ${heldBill?.label || 'this held bill'}? Reserved stock will be released.`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, busy: true }));
        try {
          await cancelLayaway(id, currentSession?.id ?? null);
          await loadHeldSales();
          syncPosDataRef.current();
          setConfirmAction(null);
        } catch (err) {
          const status = err?.response?.status;
          setConfirmAction(prev => ({
            ...prev, busy: false,
            error: status === 403
              ? 'You do not have permission to delete a held bill (supervisor required).'
              : (err?.response?.data?.message || 'Failed to delete held bill.'),
          }));
        }
      },
    });
  };

  return { heldSales, holdBusy, loadHeldSales, holdInvoice, recallInvoice, deleteHeldBill };
}

export default useHeldSales;
