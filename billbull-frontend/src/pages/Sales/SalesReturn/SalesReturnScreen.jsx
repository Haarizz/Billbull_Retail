import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
   RotateCcw, CheckCircle2, X, Printer, Loader2, AlertCircle, ShieldCheck, Store, Building2,
} from 'lucide-react';
import { saveSalesReturn, updateSalesReturnStatus } from '../../../api/salesReturnApi';
import { useSalesReturn } from './useSalesReturn';
import { C, ENTRY_POINT } from './constants';
import InvoiceSearch from './components/InvoiceSearch';
import InvoiceSummary from './components/InvoiceSummary';
import SoldItemsPane from './components/SoldItemsPane';
import ReturnItemsPane from './components/ReturnItemsPane';
import ReturnSummary from './components/ReturnSummary';
import RefundMethodSelector from './components/RefundMethodSelector';
import AuthorizationModal from './components/AuthorizationModal';
import CreditVoucherModal from './components/CreditVoucherModal';
import { printSalesReturnReceipt, printCreditVoucher } from '../../../utils/salesReturnPrint';
import { getPosPrinters } from '../../../api/posPrinterApi';
import { getCreditVoucherByReturn } from '../../../api/creditVoucherApi';

/**
 * The single Sales Return workflow, shared by both entry points (§7, §26, §34):
 *
 *   POS → Actions → Return              renders this with entryPoint="POS" + posContext
 *   Customer & Sales → Sales Return     renders this with entryPoint="SALES_RETURN"
 *
 * There is no second implementation. The two callers differ only in the context they pass
 * and where `onClose` / `onComplete` take the user afterwards — every business rule,
 * validation, calculation and API call lives here and in useSalesReturn.
 *
 * @param {string}   entryPoint   ENTRY_POINT.POS | ENTRY_POINT.SALES_RETURN
 * @param {object}   posContext   { branchId, terminalId, counterName, sessionId, tradingDate, cashierName }
 *                                Required when entryPoint is POS.
 * @param {Function} onClose      Cancel — return the user to where they came from.
 * @param {Function} onComplete   Called with the saved return once it posts successfully.
 * @param {boolean}  embedded     True when hosted inside a POS modal (suppresses the page chrome).
 * @param {object}   draft        An existing unposted return to edit. Confirming updates that
 *                                record rather than creating a new one. Approved returns are
 *                                immutable and must never be passed here.
 */
export default function SalesReturnScreen({
   entryPoint = ENTRY_POINT.SALES_RETURN,
   posContext = null,
   onClose,
   onComplete,
   embedded = false,
   draft = null,
}) {
   const sr = useSalesReturn({ entryPoint, posContext });
   const [showErrors, setShowErrors] = useState(false);
   // Set when the backend rejects an approval for want of supervisor sign-off. Holds the
   // already-saved draft so authorizing re-approves it rather than creating a duplicate.
   const [pendingAuth, setPendingAuth] = useState(null);
   const [authSubmitting, setAuthSubmitting] = useState(false);
   const [authError, setAuthError] = useState(null);
   // The persisted voucher returned by a CREDIT_VOUCHER approval — never fabricated here.
   const [issuedVoucher, setIssuedVoucher] = useState(null);
   // §18 voucher sub-state: the return can be posted while its voucher is still being
   // resolved, or while resolving it has failed. Those are distinct from "no voucher",
   // and the cashier must be able to tell them apart.
   const [voucherLoading, setVoucherLoading] = useState(false);
   const [voucherError, setVoucherError] = useState(null);
   const [printing, setPrinting] = useState(false);

   const isPos = entryPoint === ENTRY_POINT.POS;
   const readOnly = sr.submitting || Boolean(sr.completedReturn);

   // Load a draft handed in for editing. Keyed on the id alone: re-running this on every
   // render of the same draft would wipe the edits in progress.
   const { loadDraft } = sr;
   const draftId = draft?.id ?? null;
   useEffect(() => {
      if (draftId) loadDraft(draft);
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [draftId, loadDraft]);

   // =========================================================================
   // Confirmation
   // =========================================================================

   /**
    * Saves the return, then approves it — approval is the step that actually moves stock,
    * posts to the GL, and settles the refund, and it is where the backend re-validates
    * returnable quantity under row locks (§29).
    *
    * The save is deliberately not silent-retried on failure: a partially-applied return is
    * far worse than a failed one, and the cashier needs to know which state they are in.
    *
    * <p>A 403 from the approval means policy requires supervisor sign-off. The draft is already
    * saved at that point, so the dialog re-approves that same draft rather than creating a
    * second one.
    */
   /**
    * Resolves the voucher a CREDIT_VOUCHER return issued, and opens the voucher card.
    *
    * The approval response normally carries the whole voucher, so the common path costs no
    * extra request. The by-return lookup is the fallback for a response that names the
    * voucher without embedding it — it reads the voucher the return already issued and can
    * never mint a second one (§20), because issuance is keyed on the return number.
    *
    * Failure here is reported as exactly what it is: the return posted, the voucher exists,
    * but we could not read it back. It never renders a fabricated voucher (§6).
    */
   const loadIssuedVoucher = useCallback(async (result) => {
      setVoucherError(null);

      if (result?.issuedVoucher) {
         setIssuedVoucher(result.issuedVoucher);
         return;
      }

      setVoucherLoading(true);
      try {
         const voucher = await getCreditVoucherByReturn(result.returnNumber);
         if (!voucher) throw new Error('No voucher is recorded against this return.');
         setIssuedVoucher(voucher);
      } catch (err) {
         setVoucherError({
            returnNumber: result?.returnNumber,
            message: err?.response?.data?.message || err?.message
               || 'The voucher details could not be loaded.',
         });
      } finally {
         setVoucherLoading(false);
      }
   }, []);

   const approveDraft = useCallback(async (draft, authorization) => {
      try {
         const approved = await updateSalesReturnStatus(draft.id, 'APPROVED', authorization);
         const result = approved || draft;
         setPendingAuth(null);
         setAuthError(null);
         sr.setCompletedReturn(result);

         // §23/§26/§29 — a voucher-settled return is only truly complete once the cashier can
         // actually see the voucher. The toast is secondary feedback; the voucher card is the
         // success presentation, so the return always ends by opening it (or by saying plainly
         // that it could not be opened).
         if (result.refundMethod === 'CREDIT_VOUCHER') {
            if (result.issuedVoucher) {
               toast.success(`Return ${result.returnNumber} confirmed · voucher ${result.issuedVoucher.voucherNumber} issued.`);
            } else {
               toast.success(`Return ${result.returnNumber} confirmed.`);
            }
            await loadIssuedVoucher(result);
         } else {
            toast.success(`Return ${result.returnNumber} confirmed.`);
         }

         onComplete?.(result);
         return true;
      } catch (err) {
         const status = err?.response?.status;
         const msg = err?.response?.data?.message || 'Approval failed.';

         // 403 = sign-off required (or the credentials lacked supervisor rights).
         // 401 = credentials were wrong. Both keep the dialog open to retry.
         if (status === 403 || status === 401) {
            setPendingAuth({
               draft,
               reasonCode: sr.eligibility?.authorizationReason || 'HIGH_VALUE_CASH_REFUND',
            });
            setAuthError(authorization ? msg : null);
            return false;
         }

         // Anything else: the draft exists but did not post. Say so explicitly — the
         // alternative is a cashier assuming the refund went through when nothing moved.
         toast.error(
            `Return ${draft.returnNumber} was saved as a draft but could not be posted: ${msg} `
            + 'No stock or refund has been processed.',
         );
         sr.setCompletedReturn(null);
         return false;
      }
   }, [sr, onComplete, loadIssuedVoucher]);

   const handleConfirm = useCallback(async () => {
      if (!sr.canConfirm) {
         setShowErrors(true);
         toast.error(sr.validationErrors[0] || 'Complete the return before confirming.');
         return;
      }

      sr.setSubmitting(true);
      let saved = null;
      try {
         saved = await saveSalesReturn(sr.buildPayload());
      } catch (err) {
         sr.setSubmitting(false);
         toast.error(err?.response?.data?.message || 'Could not save the return. Nothing was posted.');
         return;
      }

      try {
         await approveDraft(saved, null);
      } finally {
         sr.setSubmitting(false);
      }
   }, [sr, approveDraft]);

   /** Retries approval of the already-saved draft with supervisor credentials. */
   const handleAuthorize = useCallback(async (authorization) => {
      if (!pendingAuth?.draft) return;
      setAuthSubmitting(true);
      try {
         await approveDraft(pendingAuth.draft, authorization);
      } finally {
         setAuthSubmitting(false);
      }
   }, [pendingAuth, approveDraft]);

   /**
    * Abandoning authorization leaves the draft saved and unposted. Told plainly, because a
    * cashier who thinks the return vanished will otherwise raise a second one.
    */
   const handleCancelAuthorization = useCallback(() => {
      const number = pendingAuth?.draft?.returnNumber;
      setPendingAuth(null);
      setAuthError(null);
      if (number) {
         toast.info(`Return ${number} is saved as an unposted draft. `
            + 'It can be approved later from the Sales Return list.');
      }
   }, [pendingAuth]);

   const handleCancel = useCallback(() => {
      sr.clearInvoice();
      onClose?.();
   }, [sr, onClose]);

   // =========================================================================
   // Printing (§22) — production pipeline, shared by both entry points
   // =========================================================================

   /**
    * Prints through the same POS pipeline sale receipts use: resolve the configured printer,
    * build ESC/POS, create a print job, dispatch, report the result.
    *
    * Printing is downstream of the transaction. A failure here reports the failure and offers
    * a reprint — it never rolls back a return that has already posted.
    */
   const runPrint = useCallback(async (job, { label }) => {
      setPrinting(true);
      try {
         const printers = await getPosPrinters({
            branchId: posContext?.branchId ?? sr.eligibility?.branchId ?? undefined,
            terminalId: posContext?.terminalId ?? undefined,
         });
         const printer = await job(printers || []);
         toast.success(`${label} sent to ${printer?.deviceName || 'printer'}.`);
      } catch (err) {
         toast.error(`${label} could not be printed: ${err?.message || 'printer error'}. `
            + 'The transaction is unaffected — you can reprint.');
      } finally {
         setPrinting(false);
      }
   }, [posContext, sr.eligibility]);

   const handlePrintReceipt = useCallback((isReprint = false) => {
      const ret = sr.completedReturn;
      if (!ret) return;
      return runPrint(
         (printers) => printSalesReturnReceipt(ret, {
            printers,
            branchId: posContext?.branchId ?? sr.eligibility?.branchId ?? null,
            terminalId: posContext?.terminalId ?? null,
            isReprint,
            voucher: issuedVoucher,
         }),
         { label: `Return receipt ${ret.returnNumber}` },
      );
   }, [sr.completedReturn, sr.eligibility, posContext, issuedVoucher, runPrint]);

   const handlePrintVoucher = useCallback((voucher, { reprint = false } = {}) => {
      if (!voucher) return;
      return runPrint(
         (printers) => printCreditVoucher(voucher, {
            printers,
            branchId: posContext?.branchId ?? sr.eligibility?.branchId ?? null,
            terminalId: posContext?.terminalId ?? null,
            isReprint: reprint,
         }),
         { label: `Voucher ${voucher.voucherNumber}` },
      );
   }, [sr.eligibility, posContext, runPrint]);

   // =========================================================================
   // Render
   // =========================================================================

   return (
      <div className="flex flex-col overflow-hidden"
         style={{ height: embedded ? '100%' : 'calc(100vh - 64px)', background: C.bg }}>

         {/* ---- Header ---- */}
         <div className="flex items-center justify-between px-5 py-2 bg-white border-b shrink-0"
            style={{ borderColor: C.border }}>
            <div className="flex items-center gap-3">
               <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: C.accentSoft, border: `1px solid ${C.accentBorder}` }}>
                  <RotateCcw className="h-4 w-4" style={{ color: C.accentInk }} />
               </div>
               <div>
                  <h1 className="text-sm font-black" style={{ color: C.dark }}>
                     {sr.editing ? `Editing ${sr.editing.returnNumber}` : 'Sales Return'}
                  </h1>
                  <p className="text-[10px] flex items-center gap-1.5" style={{ color: C.muted }}>
                     {isPos ? <Store className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                     {isPos
                        ? `POS · ${posContext?.counterName || posContext?.terminalId || 'Terminal'}`
                        + (posContext?.sessionId ? ` · Session ${posContext.sessionId}` : ' · No open session')
                        : 'Customer & Sales'}
                  </p>
               </div>
            </div>

            <div className="flex items-center gap-2">
               {sr.authorizationRequired && !sr.completedReturn && (
                  <span className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl"
                     style={{ background: '#FEF9ED', color: C.warnInk }}>
                     <ShieldCheck className="h-4 w-4" />Approval required
                  </span>
               )}
               {sr.completedReturn && (
                  <span className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl"
                     style={{ background: '#ECFDF5', color: C.green }}>
                     <CheckCircle2 className="h-4 w-4" />
                     {sr.completedReturn.returnNumber} confirmed
                  </span>
               )}
               {onClose && (
                  <button
                     onClick={handleCancel}
                     className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                     aria-label="Close Sales Return"
                  >
                     <X className="h-4 w-4" style={{ color: C.muted }} />
                  </button>
               )}
            </div>
         </div>

         {/* ---- Invoice search / summary ---- */}
         <div className="bg-white border-b shrink-0" style={{ borderColor: C.border }}>
            {!sr.eligibility ? (
               <InvoiceSearch
                  query={sr.searchQuery}
                  setQuery={sr.setSearchQuery}
                  results={sr.searchResults}
                  searching={sr.searching}
                  searched={sr.searched}
                  error={sr.searchError}
                  onSearch={sr.doSearch}
                  onSelect={sr.selectInvoice}
               />
            ) : (
               <InvoiceSummary eligibility={sr.eligibility} onClear={sr.clearInvoice} />
            )}
         </div>

         {/* ---- Body ---- */}
         {sr.loadingEligibility ? (
            <div className="flex-1 flex items-center justify-center">
               <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.accentInk }} />
            </div>
         ) : sr.eligibility ? (
            <div className="flex flex-1 overflow-hidden">

               {/* LEFT — sold items */}
               <div className="w-1/2 flex flex-col overflow-hidden border-r" style={{ borderColor: C.border }}>
                  <SoldItemsPane
                     lines={sr.soldLines}
                     onAdd={sr.scanItem}
                     disabled={readOnly || !sr.eligibility.eligible}
                  />
               </div>

               {/* RIGHT — return basket + settlement.
                   One scroll region for everything, with the actions pinned below it. The
                   previous split (basket scrolling independently above a panel capped at a
                   percentage of the height) meant neither got enough room on a laptop screen:
                   the basket collapsed to a sliver and Confirm sat below the fold. */}
               <div className="w-1/2 flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto bg-white">
                     <ReturnItemsPane
                        returnLines={sr.returnLines}
                        conditions={sr.conditions}
                        reasons={sr.reasons}
                        scanState={sr.scanState}
                        scanMessage={sr.scanMessage}
                        onScan={sr.scanItem}
                        onQtyChange={sr.changeQty}
                        onQtySet={sr.setQty}
                        onRemove={sr.removeLine}
                        onUpdateLine={sr.updateLine}
                        disabled={readOnly || !sr.eligibility.eligible}
                     />

                     <div className="border-t" style={{ borderColor: C.border }}>
                        <ReturnSummary summary={sr.summary} />

                        <RefundMethodSelector
                           methods={sr.refundMethods}
                           value={sr.refundMethod}
                           onChange={sr.setRefundMethod}
                           hasPosSession={Boolean(posContext?.sessionId)}
                           blockedMethods={sr.eligibility.blockedRefundMethods || {}}
                           disabled={readOnly}
                        />

                        {/* Header remarks — per-line reasons live on each row (§12) */}
                        <div className="px-4 py-3 border-b" style={{ borderColor: C.border }}>
                           <p className="text-[10px] font-black uppercase tracking-widest mb-2"
                              style={{ color: C.muted }}>
                              Return Notes
                           </p>
                           <textarea
                              value={sr.headerRemarks}
                              onChange={(e) => sr.setHeaderRemarks(e.target.value)}
                              disabled={readOnly}
                              rows={2}
                              placeholder="Optional notes for the whole return…"
                              className="w-full text-xs px-3 py-2 rounded-xl border resize-none focus:outline-none disabled:bg-slate-50"
                              style={{ borderColor: C.border }}
                           />
                        </div>

                        {/* Blocking problems, listed explicitly rather than left implicit
                            in a disabled button. */}
                        {showErrors && sr.validationErrors.length > 0 && !sr.completedReturn && (
                           <div className="px-4 py-2.5" style={{ borderColor: C.border }}>
                              <div className="rounded-xl px-3 py-2" style={{ background: '#FEF2F2' }}>
                                 {sr.validationErrors.map((e) => (
                                    <p key={e} className="flex items-start gap-1.5 text-[11px] font-semibold"
                                       style={{ color: C.red }}>
                                       <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />{e}
                                    </p>
                                 ))}
                              </div>
                           </div>
                        )}
                     </div>
                  </div>

                  {/* Actions — pinned outside the scroll region so Confirm is always on screen,
                      whatever the basket length. */}
                  <div className="px-4 py-3 flex gap-2 shrink-0 border-t bg-white"
                     style={{ borderColor: C.border }}>
                     <button
                        onClick={handleCancel}
                        disabled={sr.submitting}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black border-2 hover:bg-gray-50 disabled:opacity-50"
                        style={{ borderColor: C.border, color: C.muted }}
                     >
                        <X className="h-3.5 w-3.5" />
                        {sr.completedReturn
                           ? (isPos ? 'Back to POS' : 'Done')
                           : (isPos ? 'Back to POS' : 'Cancel')}
                     </button>

                     {sr.completedReturn ? (
                        <button
                           onClick={() => handlePrintReceipt(false)}
                           disabled={printing}
                           className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black disabled:opacity-60"
                           style={{ background: C.accent, color: C.onAccent }}
                        >
                           {printing
                              ? <><Loader2 className="h-4 w-4 animate-spin" />Printing…</>
                              : <><Printer className="h-4 w-4" />Print Return Receipt</>}
                        </button>
                     ) : (
                        <button
                           onClick={handleConfirm}
                           disabled={sr.submitting}
                           onMouseEnter={() => setShowErrors(true)}
                           className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all"
                           style={{
                              background: sr.canConfirm ? C.accent : C.muted,
                              // Amber is a light surface: dark ink on the live button, white only
                              // on the muted disabled one.
                              color: sr.canConfirm ? C.onAccent : '#FFFFFF',
                              cursor: sr.canConfirm ? 'pointer' : 'not-allowed',
                           }}
                        >
                           {sr.submitting
                              ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</>
                              : <>
                                 <CheckCircle2 className="h-4 w-4" />
                                 {sr.editing ? 'Update & Confirm Return' : 'Confirm Sales Return'}
                              </>}
                        </button>
                     )}
                  </div>
               </div>
            </div>
         ) : (
            <div className="flex-1 flex items-center justify-center">
               <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                     style={{ background: C.accentSoft, border: `1px solid ${C.accentBorder}` }}>
                     <RotateCcw className="h-8 w-8" style={{ color: C.accent }} />
                  </div>
                  <p className="text-sm font-black mb-1" style={{ color: C.dark }}>Sales Return</p>
                  <p className="text-xs" style={{ color: C.muted }}>
                     Scan a receipt or search for an invoice above to begin.
                  </p>
               </div>
            </div>
         )}

         {/* §15 — opens only when the backend refuses the approval for want of sign-off.
             It never decides on its own that approval is needed; the server does. */}
         <AuthorizationModal
            open={Boolean(pendingAuth)}
            reasonCode={pendingAuth?.reasonCode}
            returnNumber={pendingAuth?.draft?.returnNumber}
            refundAmount={sr.summary.totalRefund}
            submitting={authSubmitting}
            error={authError}
            onCancel={handleCancelAuthorization}
            onAuthorize={handleAuthorize}
         />

         {/* §24 — the issued voucher, rendered entirely from persisted backend data.
             Opens on its own as the success presentation of a CREDIT_VOUCHER return;
             closing it leaves the posted return and the voucher untouched (§19). */}
         <CreditVoucherModal
            voucher={issuedVoucher}
            loading={voucherLoading}
            error={voucherError}
            branchName={sr.eligibility?.branchName}
            onClose={() => { setIssuedVoucher(null); setVoucherError(null); }}
            onRetry={() => sr.completedReturn && loadIssuedVoucher(sr.completedReturn)}
            onPrint={handlePrintVoucher}
            printing={printing}
         />
      </div>
   );
}
