import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
   searchReturnInvoices,
   getReturnEligibility,
   getReturnOptions,
} from '../../../api/salesReturnApi';
import {
   FALLBACK_CONDITIONS,
   FALLBACK_REASONS,
   FALLBACK_REFUND_METHODS,
   SCAN_STATE,
} from './constants';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n) => Number(n) || 0;

/**
 * All Sales Return workflow state and behaviour, shared verbatim by both entry points.
 *
 * The container component renders it; POS and the Customer & Sales page differ only in the
 * `context` they pass in and where they navigate on completion (§7). No business rule lives
 * in either caller.
 *
 * @param {object}   options
 * @param {string}   options.entryPoint  ENTRY_POINT.POS | ENTRY_POINT.SALES_RETURN
 * @param {object}   options.posContext  Active branch/terminal/session/trading date/cashier.
 *                                       Required for POS, absent for back-office.
 */
export function useSalesReturn({ entryPoint, posContext = null } = {}) {
   // ---- Vocabularies (backend-owned, §12/§14) -------------------------------
   const [conditions, setConditions] = useState(FALLBACK_CONDITIONS);
   const [reasons, setReasons] = useState(FALLBACK_REASONS);
   const [refundMethods, setRefundMethods] = useState(FALLBACK_REFUND_METHODS);

   // ---- Invoice search / selection ------------------------------------------
   const [searchQuery, setSearchQuery] = useState('');
   const [searchResults, setSearchResults] = useState([]);
   const [searching, setSearching] = useState(false);
   const [searched, setSearched] = useState(false);
   const [searchError, setSearchError] = useState(null);

   const [eligibility, setEligibility] = useState(null);
   const [loadingEligibility, setLoadingEligibility] = useState(false);

   // ---- Return lines ---------------------------------------------------------
   // Keyed by itemCode. Each entry carries its own condition/reason/remarks (§12).
   const [returnLines, setReturnLines] = useState([]);

   const [scanState, setScanState] = useState(SCAN_STATE.IDLE);
   const [scanMessage, setScanMessage] = useState('');
   const scanTimerRef = useRef(null);

   // ---- Settlement -----------------------------------------------------------
   const [refundMethod, setRefundMethod] = useState('');
   const [headerRemarks, setHeaderRemarks] = useState('');

   const [submitting, setSubmitting] = useState(false);
   const [completedReturn, setCompletedReturn] = useState(null);

   // ---- Draft being edited ---------------------------------------------------
   // Identity of an existing unposted return loaded back into the workflow. Its presence is
   // what makes buildPayload an UPDATE rather than a create — without it, editing a draft
   // would quietly post a second return against the same invoice.
   const [editing, setEditing] = useState(null);

   // Load the backend vocabularies once. Failure is non-fatal — the fallbacks in
   // constants.js keep the screen usable rather than blocking a refund on a lookup call.
   useEffect(() => {
      let cancelled = false;
      getReturnOptions()
         .then((opts) => {
            if (cancelled || !opts) return;
            if (opts.conditions?.length) setConditions(opts.conditions);
            if (opts.reasons?.length) setReasons(opts.reasons);
            if (opts.refundMethods?.length) setRefundMethods(opts.refundMethods);
         })
         .catch(() => {
            /* fallbacks already in state */
         });
      return () => { cancelled = true; };
   }, []);

   useEffect(() => () => clearTimeout(scanTimerRef.current), []);

   // =========================================================================
   // §9 Eligibility
   //
   // Declared before the search below, which auto-selects an unambiguous single hit.
   // =========================================================================

   const selectInvoice = useCallback(async (invoiceOrNumber) => {
      const invoiceNumber = typeof invoiceOrNumber === 'string'
         ? invoiceOrNumber
         : invoiceOrNumber?.invoiceNumber;
      if (!invoiceNumber) return;

      setLoadingEligibility(true);
      setReturnLines([]);
      setCompletedReturn(null);
      // Picking an invoice by hand starts a new return: whatever draft was open is no longer
      // the thing being edited, and keeping its id would overwrite that draft with the new work.
      setEditing(null);
      // Settlement depends on who the invoice was to — a method picked against the previous
      // invoice (Customer Credit, say) may not be legal against this one.
      setRefundMethod('');
      try {
         const result = await getReturnEligibility(invoiceNumber);
         setEligibility(result);
         setSearchResults([]);
         setSearchQuery(invoiceNumber);

         if (result && !result.eligible) {
            toast.error(result.ineligibleReason || 'This invoice cannot be returned against.');
         }
         (result?.warnings || []).forEach((w) => toast.warning(w));
      } catch (err) {
         const msg = err?.response?.data?.message
            || `Could not load invoice ${invoiceNumber}. Please try again.`;
         toast.error(msg);
         setEligibility(null);
      } finally {
         setLoadingEligibility(false);
      }
   }, []);

   // =========================================================================
   // §8 Invoice search
   // =========================================================================

   const doSearch = useCallback(async (rawQuery) => {
      const q = (rawQuery ?? searchQuery ?? '').trim();
      if (!q) return;
      setSearching(true);
      setSearchError(null);
      try {
         const results = await searchReturnInvoices(q);
         setSearchResults(results || []);
         setSearched(true);

         // A single exact invoice/receipt match is unambiguous — scanning a receipt
         // barcode should land straight on the return screen, not on a one-row list.
         if (results?.length === 1) {
            const only = results[0];
            const exact = [only.invoiceNumber, only.receiptNumber]
               .filter(Boolean)
               .some((v) => v.toLowerCase() === q.toLowerCase());
            if (exact) await selectInvoice(only);
         }
      } catch (err) {
         const msg = err?.response?.data?.message || 'Invoice search failed. Please try again.';
         setSearchError(msg);
         setSearchResults([]);
         setSearched(true);
      } finally {
         setSearching(false);
      }
   }, [searchQuery, selectInvoice]);

   /**
    * Loads an existing unposted return back into the workflow for editing.
    *
    * <p>The draft is not trusted as a snapshot of what is still returnable. It is replayed
    * against a freshly fetched eligibility response, because an approved return raised against
    * the same invoice since the draft was written may have consumed quantity the draft still
    * claims. Lines that no longer fit are clamped or dropped and the user is told which —
    * silently posting the draft's stale numbers would over-refund.
    *
    * <p>Only the draft's own identity is carried forward. Prices, discounts and VAT are taken
    * from the invoice as always (§13), never from the saved draft rows, so an edit reverses the
    * same figures a fresh return would.
    *
    * @returns {Promise<boolean>} true when the draft is loaded and editable.
    */
   const loadDraft = useCallback(async (draft) => {
      if (!draft?.linkedInvoice) {
         toast.error('This return has no linked invoice and cannot be edited.');
         return false;
      }

      setLoadingEligibility(true);
      setCompletedReturn(null);
      try {
         const result = await getReturnEligibility(draft.linkedInvoice);
         setEligibility(result);
         setSearchResults([]);
         setSearchQuery(draft.linkedInvoice);

         const soldByCode = new Map((result?.lines || []).map((l) => [l.itemCode, l]));
         const lines = [];
         const dropped = [];
         const clamped = [];

         for (const item of draft.items || []) {
            const sold = soldByCode.get(item.itemCode);
            const label = item.itemName || item.itemCode;
            if (!sold || sold.availableQty <= 0 || sold.lineBlocked) {
               dropped.push(label);
               continue;
            }
            const wanted = Math.max(1, num(item.returnQty));
            const qty = Math.min(wanted, sold.availableQty);
            if (qty !== wanted) clamped.push(`${label} (${wanted} → ${qty})`);

            lines.push({
               ...buildReturnLine(sold),
               returnQty: qty,
               condition: item.condition || 'GOOD',
               reason: item.returnReason || '',
               remarks: item.returnReasonNotes || '',
               // Batch selections only survive intact; a clamped quantity would no longer sum
               // to the line, so those are re-picked rather than carried over wrong.
               batches: qty === wanted
                  ? (item.batches || []).map((b) => ({
                     allocationId: b.originalAllocationId,
                     originalAllocationId: b.originalAllocationId,
                     batchMasterId: b.batchMasterId,
                     batchNumber: b.batchNumber,
                     binCode: b.binCode,
                     expiryDate: b.expiryDate,
                     quantity: num(b.quantity),
                  }))
                  : [],
            });
         }

         setReturnLines(lines);
         setRefundMethod(draft.refundMethod || '');
         setHeaderRemarks(draft.internalNotes || '');
         setEditing({ id: draft.id, returnNumber: draft.returnNumber });

         if (dropped.length) {
            toast.warning(`No longer returnable, removed from this draft: ${dropped.join(', ')}.`);
         }
         if (clamped.length) {
            toast.warning(`Quantity reduced to what is still returnable: ${clamped.join(', ')}.`);
         }
         if (result && !result.eligible) {
            toast.error(result.ineligibleReason || 'This invoice can no longer be returned against.');
         }
         return true;
      } catch (err) {
         const msg = err?.response?.data?.message
            || `Could not load return ${draft.returnNumber || ''}. Please try again.`;
         toast.error(msg);
         setEligibility(null);
         setEditing(null);
         return false;
      } finally {
         setLoadingEligibility(false);
      }
   }, []);

   const clearInvoice = useCallback(() => {
      setEligibility(null);
      setEditing(null);
      setReturnLines([]);
      setSearchQuery('');
      setSearchResults([]);
      setSearched(false);
      setSearchError(null);
      setRefundMethod('');
      setHeaderRemarks('');
      setCompletedReturn(null);
      setScanState(SCAN_STATE.IDLE);
   }, []);

   // =========================================================================
   // §10/§11 Scan-first item selection
   // =========================================================================

   const flashScan = useCallback((state, message) => {
      clearTimeout(scanTimerRef.current);
      setScanState(state);
      setScanMessage(message);
      scanTimerRef.current = setTimeout(
         () => setScanState(SCAN_STATE.IDLE),
         state === SCAN_STATE.FOUND ? 1400 : 2600,
      );
   }, []);

   /** Sold lines from the eligibility payload, indexed for scan resolution. */
   const soldLines = eligibility?.lines || [];

   /**
    * Resolves a scanned token to a sold line. Barcode and item code are matched exactly
    * first — a scanner emits one of those — before falling back to a name substring, so a
    * scan can never be captured by an unrelated product whose name happens to contain the
    * digits.
    */
   const resolveScannedLine = useCallback((token) => {
      const t = token.trim().toLowerCase();
      if (!t) return null;
      const exact = soldLines.find(
         (l) => l.barcode?.toLowerCase() === t || l.itemCode?.toLowerCase() === t,
      );
      if (exact) return exact;
      return soldLines.find((l) => l.itemName?.toLowerCase().includes(t)) || null;
   }, [soldLines]);

   /**
    * Adds one unit of the scanned item to the return, or increments it.
    *
    * The ceiling is `availableQty` from the eligibility payload (sold − already returned).
    * This is the §11 client-side guard; the backend enforces the same limit independently
    * under row locks at confirmation, which is what actually prevents the §29 race.
    */
   const scanItem = useCallback((token) => {
      if (!eligibility) return;
      if (!eligibility.eligible) {
         flashScan(SCAN_STATE.BLOCKED, eligibility.ineligibleReason || 'Invoice is not returnable');
         return;
      }

      const line = resolveScannedLine(token);
      if (!line) {
         flashScan(SCAN_STATE.NOT_FOUND, 'Item not found in original invoice');
         return;
      }
      if (line.lineBlocked) {
         flashScan(SCAN_STATE.BLOCKED, line.lineBlockedReason || `${line.itemName} cannot be returned`);
         return;
      }
      if (line.availableQty <= 0) {
         flashScan(SCAN_STATE.MAX_REACHED, `Maximum return quantity reached: ${line.itemName}`);
         return;
      }

      setReturnLines((prev) => {
         const existing = prev.find((rl) => rl.itemCode === line.itemCode);
         if (existing) {
            if (existing.returnQty >= line.availableQty) {
               flashScan(SCAN_STATE.MAX_REACHED, `Maximum return quantity reached: ${line.itemName}`);
               return prev;
            }
            flashScan(SCAN_STATE.FOUND, `Added: ${line.itemName}`);
            return prev.map((rl) => rl.itemCode === line.itemCode
               ? { ...rl, returnQty: rl.returnQty + 1 }
               : rl);
         }
         flashScan(SCAN_STATE.FOUND, `Added: ${line.itemName}`);
         return [...prev, buildReturnLine(line)];
      });
   }, [eligibility, resolveScannedLine, flashScan]);

   const changeQty = useCallback((itemCode, delta) => {
      setReturnLines((prev) => prev.map((rl) => {
         if (rl.itemCode !== itemCode) return rl;
         const next = Math.min(rl.availableQty, Math.max(1, rl.returnQty + delta));
         return { ...rl, returnQty: next };
      }));
   }, []);

   const setQty = useCallback((itemCode, value) => {
      setReturnLines((prev) => prev.map((rl) => {
         if (rl.itemCode !== itemCode) return rl;
         const parsed = Math.floor(Number(value));
         if (!Number.isFinite(parsed)) return rl;
         return { ...rl, returnQty: Math.min(rl.availableQty, Math.max(1, parsed)) };
      }));
   }, []);

   const removeLine = useCallback((itemCode) => {
      setReturnLines((prev) => prev.filter((rl) => rl.itemCode !== itemCode));
   }, []);

   /** §12 — per-line condition, reason, and remarks. */
   const updateLine = useCallback((itemCode, patch) => {
      setReturnLines((prev) => prev.map((rl) => rl.itemCode === itemCode ? { ...rl, ...patch } : rl));
   }, []);

   /** Batch lot selection for batch-controlled lines; must sum to returnQty. */
   const setLineBatches = useCallback((itemCode, batches) => {
      setReturnLines((prev) => prev.map((rl) => rl.itemCode === itemCode ? { ...rl, batches } : rl));
   }, []);

   // =========================================================================
   // §13 Return summary — reverses the ORIGINAL invoice amounts
   // =========================================================================

   /**
    * Every figure below is prorated from what was actually invoiced, never recomputed from
    * a rate applied at return time. That matters because the original line may have carried
    * a bespoke discount, a zero-rated tax, or a rate that has since changed in the product
    * master — the customer is owed what they paid.
    *
    * VAT mode changes what "total" means, matching computeLineTaxTotals in utils/vatMath.js:
    *   EXCLUSIVE — the invoiced price excludes VAT, so VAT is ADDED to reach the refund.
    *   INCLUSIVE — the invoiced price already contains VAT, so VAT is shown as the portion
    *               contained within the refund, not added on top. Adding it would refund the
    *               tax twice.
    */
   const summary = useMemo(() => {
      const taxInclusive = Boolean(eligibility?.taxInclusive);

      let gross = 0;
      let discountReversal = 0;
      let vatReversal = 0;
      let totalQty = 0;

      for (const rl of returnLines) {
         const qty = num(rl.returnQty);
         const soldQty = num(rl.soldQty) || 1;
         const ratio = qty / soldQty;

         gross += num(rl.unitPrice) * qty;
         discountReversal += num(rl.lineDiscount) * ratio;
         vatReversal += num(rl.lineVat) * ratio;
         totalQty += qty;
      }

      const netOfDiscount = gross - discountReversal;
      const totalRefund = taxInclusive ? netOfDiscount : netOfDiscount + vatReversal;

      return {
         count: returnLines.length,
         totalQty,
         subtotal: round2(gross),
         discountReversal: round2(discountReversal),
         vatReversal: round2(vatReversal),
         taxInclusive,
         totalRefund: round2(Math.max(0, totalRefund)),
      };
   }, [returnLines, eligibility]);

   // =========================================================================
   // Validation
   // =========================================================================

   /**
    * Blocking problems, in the order a cashier would hit them. Returned as a list so the
    * UI can show the specific obstacle rather than a disabled button with no explanation.
    */
   const validationErrors = useMemo(() => {
      const errors = [];
      if (!eligibility) return ['Select an invoice to begin.'];
      if (!eligibility.eligible) {
         errors.push(eligibility.ineligibleReason || 'This invoice cannot be returned against.');
      }
      if (returnLines.length === 0) {
         errors.push('Add at least one item to return.');
      }

      // §12 — condition and reason are per line, not global.
      for (const rl of returnLines) {
         if (!rl.condition) errors.push(`Select a condition for ${rl.itemName}.`);
         if (!rl.reason) errors.push(`Select a reason for ${rl.itemName}.`);
         // "Other" carries no meaning on its own — the detail has to be written down or the
         // line is unauditable (§31).
         if (rl.reason === 'OTHER' && !rl.remarks?.trim()) {
            errors.push(`Enter remarks for ${rl.itemName} — the reason is "Other".`);
         }
         if (rl.returnQty > rl.availableQty) {
            errors.push(`${rl.itemName}: return quantity exceeds the ${rl.availableQty} available.`);
         }
         if (rl.batchControlled && (rl.batches?.length || 0) > 0) {
            const sum = rl.batches.reduce((s, b) => s + num(b.quantity), 0);
            if (sum !== rl.returnQty) {
               errors.push(`${rl.itemName}: batch quantities (${sum}) must equal the return quantity (${rl.returnQty}).`);
            }
         }
      }

      if (!refundMethod) errors.push('Select a refund method.');

      // §14 — a method the backend has already said this sale cannot settle with (Customer
      // Credit on a walk-in, which has no ledger to credit). Repeated here so a method selected
      // before the invoice changed cannot survive into the payload.
      const blockedReason = eligibility?.blockedRefundMethods?.[refundMethod];
      if (blockedReason) errors.push(blockedReason);

      // §6/§23 — a cash refund physically opens the drawer, so it needs a live POS session.
      // Enforced rather than silently bypassed: the alternative is cash leaving the drawer
      // with nothing to reconcile it against at day close.
      const method = refundMethods.find((m) => m.value === refundMethod);
      if (method?.affectsCashDrawer && !posContext?.sessionId) {
         errors.push('Cash Refund requires an open POS session. Choose another refund method or open a session.');
      }

      return errors;
   }, [eligibility, returnLines, refundMethod, refundMethods, posContext]);

   const canConfirm = validationErrors.length === 0 && !submitting;

   /** True when this return will need supervisor sign-off before it posts (§15). */
   const authorizationRequired = useMemo(() => {
      if (eligibility?.authorizationRequired) return true;
      return false;
   }, [eligibility]);

   // =========================================================================
   // Payload assembly
   // =========================================================================

   /**
    * Builds the SalesReturn payload. Shared by both entry points — the only difference is
    * the entryPoint marker and the POS context block, which is omitted entirely for
    * back-office returns rather than sent as nulls.
    */
   const buildPayload = useCallback(() => {
      const inv = eligibility;
      const method = refundMethods.find((m) => m.value === refundMethod);

      const items = returnLines.map((rl) => {
         const qty = num(rl.returnQty);
         const soldQty = num(rl.soldQty) || 1;
         const ratio = qty / soldQty;
         const condition = conditions.find((c) => c.value === rl.condition);

         return {
            itemCode: rl.itemCode,
            itemName: rl.itemName,
            unit: rl.unit,
            soldQty: rl.soldQty,
            returnQty: qty,
            price: rl.unitPrice,
            discountAmount: round2(num(rl.lineDiscount) * ratio),
            taxRate: rl.taxRate,
            taxAmount: round2(num(rl.lineVat) * ratio),
            total: round2(num(rl.unitPrice) * qty - num(rl.lineDiscount) * ratio),

            // §12 — structured condition and reason on the line itself.
            condition: rl.condition,
            returnReason: rl.reason,
            returnReasonNotes: rl.remarks || null,

            // The legacy free-text status the existing inventory/COGS logic branches on.
            // Sent alongside `condition` so a backend that has not yet been migrated still
            // scraps and restocks correctly.
            itemStatus: condition?.restockable ? 'Good' : 'Damaged',

            batches: (rl.batches || []).map((b) => ({
               originalAllocationId: b.allocationId ?? b.originalAllocationId,
               batchMasterId: b.batchMasterId,
               batchNumber: b.batchNumber,
               binId: b.binId,
               binCode: b.binCode,
               expiryDate: b.expiryDate,
               quantity: b.quantity,
            })),
         };
      });

      const payload = {
         // Present only when an existing draft is being edited — this is what makes the POST
         // an update instead of a second return against the same invoice. The number rides
         // along so the backend keeps it rather than re-issuing one.
         ...(editing?.id ? { id: editing.id, returnNumber: editing.returnNumber } : {}),

         returnDate: new Date().toISOString().slice(0, 10),
         linkedInvoice: inv?.invoiceNumber,
         linkedReceiptNumber: inv?.receiptNumber || null,
         customerCode: inv?.customerCode,
         customerName: inv?.customerName,
         customerMobile: inv?.customerMobile || null,

         subTotal: summary.subtotal,
         taxAmount: summary.vatReversal,
         totalAmount: summary.totalRefund,
         taxInclusive: summary.taxInclusive,

         refundMethod,
         refundAmount: summary.totalRefund,
         returnAction: refundMethod === 'CREDIT_VOUCHER' ? 'Credit Note' : 'Refund',

         // Header reason is retained for the returns register, but the authoritative
         // per-line reasons live on the items above (§12).
         reason: returnLines[0]?.reason || null,
         internalNotes: headerRemarks || null,

         entryPoint,
         items,
      };

      if (entryPoint === 'POS' && posContext) {
         payload.posSessionId = posContext.sessionId ?? null;
         payload.posTerminalId = posContext.terminalId ?? null;
         payload.posCounterName = posContext.counterName ?? null;
         payload.tradingDate = posContext.tradingDate ?? null;
      }

      // Advisory: the backend decides for itself whether sign-off is needed.
      if (method?.affectsCashDrawer) {
         payload.authorizationReason = eligibility?.authorizationReason || null;
      }

      return payload;
   }, [eligibility, returnLines, refundMethod, refundMethods, conditions,
      summary, headerRemarks, entryPoint, posContext, editing]);

   return {
      // vocabularies
      conditions, reasons, refundMethods,

      // search
      searchQuery, setSearchQuery, searchResults, searching, searched, searchError,
      doSearch, selectInvoice, clearInvoice,

      // invoice
      eligibility, loadingEligibility, soldLines,

      // draft editing
      editing, loadDraft,

      // lines
      returnLines, scanItem, changeQty, setQty, removeLine, updateLine, setLineBatches,
      scanState, scanMessage,

      // settlement
      refundMethod, setRefundMethod, headerRemarks, setHeaderRemarks,

      // derived
      summary, validationErrors, canConfirm, authorizationRequired,

      // submission
      submitting, setSubmitting, completedReturn, setCompletedReturn, buildPayload,
   };
}

/** Seeds a return line from a sold invoice line, defaulting condition to Good (§12). */
function buildReturnLine(line) {
   return {
      itemCode: line.itemCode,
      itemName: line.itemName,
      barcode: line.barcode,
      unit: line.unit,
      soldQty: line.soldQty,
      availableQty: line.availableQty,
      returnQty: 1,
      unitPrice: num(line.unitPrice),
      lineDiscount: num(line.lineDiscount),
      lineVat: num(line.lineVat),
      lineTotal: num(line.lineTotal),
      taxRate: line.taxRate,
      batchControlled: Boolean(line.batchControlled),
      serialControlled: Boolean(line.serialControlled),
      availableBatches: line.batches || [],
      batches: [],
      condition: 'GOOD',
      reason: '',
      remarks: '',
   };
}
