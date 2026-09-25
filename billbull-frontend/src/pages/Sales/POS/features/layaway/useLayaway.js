// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// Layaway browsing, conversion and cancellation. Moved unchanged: the getLayaways filter
// params, the STATUS_LABEL_TO_ENUM mapping, the detail fetch and its cancellation guard,
// the convertible-status gate, the cart-item projection, the bill-discount reconciliation,
// the alert texts, the confirm-dialog wiring and the 403 message.
//
// DELIBERATELY NOT MOVED: saveCurrentLayaway and the Save-Layaway modal state. That
// handler's dependencies are the printing subsystem (tplReceiptPaper, printHtml,
// buildLayawayReceiptHtml/Text, buildEscPosDocumentBase64, printer resolution,
// notifyPrintFallback) rather than layaway itself, so moving it here would drag ~10
// print inputs through this boundary. It stays in POSSales and consumes loadLayaways
// from this hook. It should move once printing is extracted.
//
// LATE-BOUND syncPosData. Both cancellation and (in POSSales) save re-sync POS data, but
// syncPosData depends on the loadHeldSales that useHeldSales returns. The existing
// syncPosDataRef preserves that late binding exactly, as it already does for held sales.
import { useCallback, useEffect, useState } from 'react';

import { cancelLayaway, getLayaway, getLayaways } from '../../../../../api/posApi';
import { STATUS_LABEL_TO_ENUM } from '../../posConstants';
import { toNumber } from '../../posUtils';

/**
 * @param {object}   args
 * @param {object|null} args.currentSession
 * @param {object|null} args.currentTerminal
 * @param {object|null} args.posSettings
 * @param {Function} args.recalculateInvoice   cart totals recompute (POSSales-owned)
 * @param {Function} args.setCurrentInvoice    cart setter, written on conversion
 * @param {Array}    args.customerOptions      loaded customers, to match the layaway's
 * @param {Function} args.setSelectedCustomer  customer selection setter
 * @param {Function} args.setConfirmAction     outer confirm-dialog state setter
 * @param {object}   args.syncPosDataRef       ref holding POSSales' syncPosData
 */
export function useLayaway({
  currentSession,
  currentTerminal,
  posSettings,
  recalculateInvoice,
  setCurrentInvoice,
  customerOptions,
  setSelectedCustomer,
  setConfirmAction,
  syncPosDataRef,
} = {}) {
  // Layaways list modal
  const [showLayawaysList, setShowLayawaysList] = useState(false);
  const [layawaysFilterStatus, setLayawaysFilterStatus] = useState('All');
  const [layawaysFilterCustomer, setLayawaysFilterCustomer] = useState('');
  const [layawaysFilterNo, setLayawaysFilterNo] = useState('');
  const [selectedLayawayId, setSelectedLayawayId] = useState(null);
  const [layawaysList, setLayawaysList] = useState([]);
  const [layawaysLoading, setLayawaysLoading] = useState(false);
  const [layawaysError, setLayawaysError] = useState(null);
  const [selectedLayawayDetail, setSelectedLayawayDetail] = useState(null);
  const [layawayBusyId, setLayawayBusyId] = useState(null);
  // Conversion: when a layaway is loaded into the cart for settlement, remember
  // which layaway it came from (mark-converted after checkout) and the deposit
  // already collected (pre-credited against the balance to settle).
  const [activeLayawayId, setActiveLayawayId] = useState(null);
  const [activeLayawayDeposit, setActiveLayawayDeposit] = useState(0);

  const loadLayaways = useCallback(async () => {
    setLayawaysLoading(true);
    setLayawaysError(null);
    try {
      const params = {};
      const branchId = currentTerminal?.branchId || currentSession?.branchId;
      if (branchId) params.branchId = branchId;
      if (layawaysFilterStatus && layawaysFilterStatus !== 'All') {
        params.status = STATUS_LABEL_TO_ENUM[layawaysFilterStatus] || layawaysFilterStatus;
      }
      if (layawaysFilterCustomer.trim()) params.customer = layawaysFilterCustomer.trim();
      if (layawaysFilterNo.trim()) params.number = layawaysFilterNo.trim();
      setLayawaysList(await getLayaways(params));
    } catch (err) {
      setLayawaysError(err?.response?.data?.message || 'Failed to load layaways.');
      setLayawaysList([]);
    } finally {
      setLayawaysLoading(false);
    }
  }, [currentTerminal, currentSession, layawaysFilterStatus, layawaysFilterCustomer, layawaysFilterNo]);

  // Load list + detail when the modal opens / selection changes.
  useEffect(() => {
    if (showLayawaysList) loadLayaways();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLayawaysList]);


  useEffect(() => {
    if (!selectedLayawayId) { setSelectedLayawayDetail(null); return; }
    let cancelled = false;
    getLayaway(selectedLayawayId)
      .then(d => { if (!cancelled) setSelectedLayawayDetail(d); })
      .catch(() => { if (!cancelled) setSelectedLayawayDetail(null); });
    return () => { cancelled = true; };
  }, [selectedLayawayId]);

  // Convert: load the layaway's items + customer into the live cart, pre-credit the
  // deposit, and tag the cart so checkout marks the layaway converted afterwards.
  const startLayawayConversion = async (layawayId) => {
    try {
      const ly = await getLayaway(layawayId);
      if (ly.status && ly.status !== 'ACTIVE' && ly.status !== 'PARTIALLY_PAID' && ly.status !== 'READY_TO_CONVERT') {
        alert(`This layaway is ${ly.status.toLowerCase().replace(/_/g, ' ')} and cannot be converted.`);
        return;
      }
      const items = (ly.items || []).map(it => ({
        id: it.pinnedBatchNumber ? `${it.itemCode}::${it.pinnedBatchNumber}` : it.itemCode,
        productId: it.itemCode,
        name: it.itemName,
        barcode: it.itemCode,
        code: it.itemCode,
        image: null,
        price: it.price || 0,
        quantity: it.quantity || 0,
        discount: it.discount || 0,
        taxRate: it.taxRate != null ? it.taxRate : (posSettings?.taxEnabled === false ? 0 : toNumber(posSettings?.branchDefaultVatRate, 0)),
        total: (it.price || 0) * (it.quantity || 0) * (1 - (it.discount || 0) / 100),
        pinnedBatchNumber: it.pinnedBatchNumber || null,
        serialNumber: it.serialNumber || null,
        expiryDate: it.expiryDate || null,
        isVoided: !!it.voided,
      }));
      // Compute bill discount needed so the cart total matches the stored saleTotal exactly.
      const tempInvoice = recalculateInvoice(items, 0);
      const storedTotal = ly.saleTotal || 0;
      const storedBillDiscount = ly.billDiscountAmount || 0;
      // Prefer the stored billDiscountAmount; if the recalculated total still doesn't
      // match saleTotal (e.g. items were saved differently), derive the diff as extra discount.
      const derivedBillDiscount = Math.max(0, (tempInvoice.subtotal - tempInvoice.totalDiscount + (tempInvoice.taxInclusive ? 0 : tempInvoice.tax)) - storedTotal);
      const billDiscountAmount = storedBillDiscount > 0 ? storedBillDiscount : derivedBillDiscount;
      setCurrentInvoice(recalculateInvoice(items, billDiscountAmount));
      // Select the layaway's customer if we have it loaded.
      const match = customerOptions.find(c =>
        (c.code && c.code === ly.customerCode) || c.id === ly.customerCode);
      if (match) setSelectedCustomer(match.id);
      setActiveLayawayId(ly.id);
      setActiveLayawayDeposit(ly.depositAmount || 0);
      setShowLayawaysList(false);
      setSelectedLayawayId(null);
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to load layaway for conversion.');
    }
  };

  const handleCancelLayaway = (layawayId) => {
    const lay = (layawaysList || []).find(l => l.id === layawayId);
    setConfirmAction({
      title: 'Cancel Layaway',
      message: `Cancel ${lay?.layawayNumber || 'this layaway'}? Reserved stock will be released.`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, busy: true }));
        setLayawayBusyId(layawayId);
        try {
          await cancelLayaway(layawayId, currentSession?.id ?? null);
          if (selectedLayawayId === layawayId) setSelectedLayawayId(null);
          await loadLayaways();
          syncPosDataRef.current();
          setConfirmAction(null);
        } catch (err) {
          const status = err?.response?.status;
          setConfirmAction(prev => ({
            ...prev, busy: false,
            error: status === 403
              ? 'You do not have permission to cancel a layaway (supervisor required).'
              : (err?.response?.data?.message || 'Failed to cancel layaway.'),
          }));
        } finally {
          setLayawayBusyId(null);
        }
      },
    });
  };

  return {
    // list modal
    showLayawaysList, setShowLayawaysList,
    layawaysFilterStatus, setLayawaysFilterStatus,
    layawaysFilterCustomer, setLayawaysFilterCustomer,
    layawaysFilterNo, setLayawaysFilterNo,
    selectedLayawayId, setSelectedLayawayId,
    layawaysList, layawaysLoading, layawaysError,
    selectedLayawayDetail, layawayBusyId,
    // conversion tagging — read and reset by checkout and the cart-clear gate
    activeLayawayId, setActiveLayawayId,
    activeLayawayDeposit, setActiveLayawayDeposit,
    // actions
    loadLayaways, startLayawayConversion, handleCancelLayaway,
  };
}

export default useLayaway;
