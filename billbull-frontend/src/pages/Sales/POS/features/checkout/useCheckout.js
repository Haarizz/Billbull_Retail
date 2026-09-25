// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// CHECKOUT ORCHESTRATION. This owns the settle-the-sale sequence and nothing else: the
// guards, the payload assembly, the posCheckout call, the success commit and the
// deliberately backgrounded finalisation. It builds no document, resolves no printer and
// computes no payment figure - those boundaries (buildThermalReceiptArtifacts,
// usePosPrinting, the payment manager) already exist and are consumed as inputs.
//
// THE SEQUENCE IS LOAD-BEARING AND IS PRESERVED EXACTLY:
//
//   1. guards        empty cart / already loading -> return (no state touched)
//                    compatibility probe -> setCheckoutError, return
//                    no payment lines   -> setCheckoutError, return
//                    reconcile preflight -> console.error + setCheckoutError, return
//   2. commit to UI  setCheckoutLoading(true), setCheckoutError(null),
//                    freeze the A4 preview ref, setCheckoutSettling(true)
//   3. pre-post      shipping/grand-total/deposit maths, payment-field projection,
//                    settled payment block, customer snapshot,
//                    posCreditBalance() read - MUST precede the post, or the lookup
//                    returns the balance AFTER this sale
//   4. payload       buildPosCheckoutItems(...) plus the scalar fields
//   5. === PAYMENT CONFIRMED ===  await posCheckout(payload)
//   6. derive        credit invoice/paid/updated figures, the `paid` success object,
//                    snapshot layawayId + printPaper into locals BEFORE the resets
//   7. success now   setLastPaidInvoice, setCheckoutFinalizing(true), invoiceCounter++,
//                    clearInvoice(), syncPosData(), four field resets,
//                    checkoutPayment.clearLines(), layaway reset,
//                    queueMicrotask(() => setCheckoutPhase('complete'))
//   8. background    void (async () => { cash drawer -> print -> layaway convert }
//                    finally setCheckoutFinalizing(false) })()
//                    NOT awaited: step 9 runs immediately so the till is released.
//   9. finally       setCheckoutLoading(false)
//
// Step 8 is fire-and-forget on purpose - the sale is already committed, and awaiting the
// printer round-trip was the bulk of the old 3-5 second wait. Turning it into an await
// would regress till latency. Its print failure has its own inner try/catch (warn +
// alert) and the layaway convert has another (warn only), so neither reaches the outer
// catch.
//
// Inputs are grouped by domain and destructured back to their original local names, so
// the body below is byte-identical to the component version.
import { useState } from 'react';

import { convertLayaway, posCheckout, posCreditBalance } from '../../../../../api/posApi';
import { buildPosPrintData, USE_NEW_POS_PRINT_TEMPLATE } from '../../posPrintUtils';
import { buildPosCheckoutItems } from '../../posUtils';
import { buildPaymentBlock, paymentAuditSnapshot, reconcilePaymentBlock } from '../../payments/paymentPresentation';
import { isTaxInvoiceDocument } from '../../../../../utils/documentTaxType';
import { generatePrintHtmlAsync, printHtml } from '../../../../../utils/printGenerator';

/**
 * @param {object} args grouped domain inputs - see each group's members below.
 */
export function useCheckout({
  payment,        // { checkoutPayment, checkoutPaymentFields, checkoutEffectiveDue, checkoutCompatibility }
  cart,           // { currentInvoice, clearInvoice, setInvoiceCounter, checkoutThermalHtml }
  previewFreeze,  // { checkoutSettling, setCheckoutSettling, checkoutPreviewFreezeRef } - owned by the
                  //   caller (not this hook) because checkoutThermalHtml itself reads checkoutSettling/
                  //   checkoutPreviewFreezeRef to decide whether to return the frozen preview; this hook
                  //   receives checkoutThermalHtml as an input, so the state can't originate here without
                  //   creating a circular "hook needs a memo that needs the hook" dependency.
  customerCtx,    // { selectedCustomerData, customerOptions }
  sessionCtx,     // { currentSession, currentTerminal, posSettings }
  layaway,        // { activeLayawayId, activeLayawayDeposit, setActiveLayawayId, setActiveLayawayDeposit }
  shipping,       // { shippingCharge, shippingAddress, deliveryAddress, deliveryDriver, deliveryNotes }
  printing,       // { resolveInvoiceA4TemplateFor, printThermalReceiptWithConfiguredPrinter,
                  //   buildThermalReceiptArtifacts, openCashDrawer }
  a4Template,     // the tpl*/outlet values the A4 print branch reads, plus company
  errorRouting,   // { isClosureWorkflowError, showClosureRequiredBlock, setShowPaymentDialog,
                  //   requestApproval }
  posReset,       // { syncPosData, setReceivedAmount, setSelectedCardType,
                  //   setSelectedCreditCustomer, setLastScannedItem }
} = {}) {
  // Checkout-owned state. Every setter is exposed: POSSales has other writers (the
  // dialog-close effects, the reprint path) and POSTouchScreen drives three of them
  // through the prop bag.
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [checkoutPhase, setCheckoutPhase] = useState('payment'); // 'payment' | 'complete'
  const [checkoutFinalizing, setCheckoutFinalizing] = useState(false);
  const [lastPaidInvoice, setLastPaidInvoice] = useState(null);
  const [checkoutRemarks, setCheckoutRemarks] = useState('');

  // Destructured to the original names so the orchestration body is unchanged.
  const { setCheckoutSettling, checkoutPreviewFreezeRef } = previewFreeze;
  const { checkoutPayment, checkoutPaymentFields, checkoutEffectiveDue, checkoutCompatibility } = payment;
  const { currentInvoice, clearInvoice, setInvoiceCounter, checkoutThermalHtml } = cart;
  const { selectedCustomerData, customerOptions } = customerCtx;
  const { currentSession, currentTerminal, posSettings } = sessionCtx;
  const { activeLayawayId, activeLayawayDeposit, setActiveLayawayId, setActiveLayawayDeposit } = layaway;
  const { shippingCharge, shippingAddress, deliveryAddress, deliveryDriver, deliveryNotes } = shipping;
  const {
    resolveInvoiceA4TemplateFor, printThermalReceiptWithConfiguredPrinter,
    buildThermalReceiptArtifacts, openCashDrawer,
  } = printing;
  const {
    tplInvoicePaper, tplInvoiceFooter, tplInvoiceHeader, tplReceiptHeader,
    tplInvoiceShowStamp, tplOutletName, tplOutletAddress, tplOutletPhone,
    tplLogoDataUrl, tplStampDataUrl, tplInvoiceShowBankDetails, effectiveOutletTrn, company,
  } = a4Template;
  const {
    isClosureWorkflowError, showClosureRequiredBlock, setShowPaymentDialog,
    requestApproval,
  } = errorRouting;
  const {
    syncPosData, setReceivedAmount, setSelectedCardType,
    setSelectedCreditCustomer, setLastScannedItem,
  } = posReset;

  const processPayment = async (overrideCreds = null) => {
    if (currentInvoice.items.length === 0 || checkoutLoading) return;
    // Refuse to post a payment the server would not record. Reaching here means the button
    // was driven by something other than a click (a stale render, a keyboard shortcut), so
    // fail loudly rather than posting a sale whose tender would be silently dropped.
    if (!checkoutCompatibility.canSettle) {
      setCheckoutError(checkoutCompatibility.message
        || 'Server compatibility could not be verified. Payment was not taken.');
      return;
    }
    if (checkoutPayment.paymentLines.length === 0) {
      setCheckoutError('Add at least one payment before settling.');
      return;
    }
    // Last cheap point to catch a payment that does not add up. Reaching here with an
    // inconsistent block would post figures the receipt and the ledger then disagree about,
    // so refuse and say exactly which identity failed rather than continuing silently.
    const preflight = reconcilePaymentBlock(buildPaymentBlock(checkoutPayment.paymentLines, {
      invoiceTotal: checkoutEffectiveDue,
    }));
    if (!preflight.consistent) {
      const detail = preflight.findings.filter(f => f.severity === 'error').map(f => f.message).join(' ');
      console.error('POS settlement blocked — payment does not reconcile', {
        invoiceTotal: checkoutEffectiveDue,
        audit: paymentAuditSnapshot(buildPaymentBlock(checkoutPayment.paymentLines, {
          invoiceTotal: checkoutEffectiveDue,
        })),
      });
      setCheckoutError(`Payment does not reconcile and was not taken. ${detail}`);
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError(null);
    // Freeze the A4 preview on its current render BEFORE we touch the cart, so the
    // clearInvoice()/phase-switch below can't tear the live iframe src out from
    // under React (the removeChild crash). Snapshot the latest html into the ref
    // in case the memo hasn't run yet this render.
    if (checkoutThermalHtml) checkoutPreviewFreezeRef.current = checkoutThermalHtml;
    setCheckoutSettling(true);
    try {
      // Shipping is an untaxed flat add on top of the product total (not a cart line).
      const shippingChargeNum = Number(shippingCharge) || 0;
      const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
      const depositSnapshot = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
      const effectiveDueAmt = Math.max(0, grandTotal - depositSnapshot);

      // Every payment figure comes from the cashier's allocations — one projection, so the
      // amounts posted are exactly the ones the Remaining-To-Allocate panel was showing.
      // Each allocation becomes its own backend payment record (Payment row + Receipt
      // Voucher + GL posting), which is what makes several cards, or a cash overpayment
      // alongside a credit balance, expressible at all.
      const {
        paymentAllocations, paymentMode, combinedPaymentMode,
        changeDue, paidAmount, creditBalance, creditAppliedAmount,
        cashTaken,
      } = checkoutPaymentFields;

      // The payment block every renderer prints, and the same rows the success screen
      // shows — built once from the allocations that were actually settled.
      const settledPaymentBlock = buildPaymentBlock(checkoutPayment.paymentLines, {
        invoiceTotal: effectiveDueAmt,
      });

      const customer = selectedCustomerData;

      // Credit account "Previous Balance" must be read BEFORE posCheckout() posts
      // this invoice below — otherwise the lookup returns the balance AFTER this
      // sale was added to the ledger, which is the Updated Balance, not Previous.
      let creditPrevBalAuto = null;
      if (tplInvoiceShowBankDetails && customer?.id !== 'walk-in') {
        creditPrevBalAuto = 0;
        const custCodeForBalance = customer?.code || customer?.id;
        if (custCodeForBalance) {
          try {
            const cr = await posCreditBalance(custCodeForBalance);
            if (cr?.found && cr.outstanding != null) creditPrevBalAuto = parseFloat(cr.outstanding) || 0;
          } catch (_) { /* keep the 0 fallback so the section still renders */ }
        }
      }

      // Voided lines are still sent (flagged) so they remain on the receipt,
      // audit log and reports. The backend excludes them from totals & stock.
      // Projection lives in posUtils.buildPosCheckoutItems so it can be unit-tested.
      const items = buildPosCheckoutItems(currentInvoice.items, posSettings);

      const payload = {
        customerCode: customer.id !== 'walk-in' ? (customer.code || customer.id) : 'WALK-IN',
        customerName: customer.name,
        paymentMode,
        combinedPaymentMode,
        // Ordered tender allocations — the backend's source of truth for the payment
        // (PosCheckoutRequest.paymentAllocations). Each becomes its own Payment row,
        // Receipt Voucher and GL posting. The legacy per-mode scalars are not sent: the
        // backend ignores them whenever allocations are present, and they cannot express
        // several cards, repeated tenders of one type, or a cash overpayment alongside a
        // credit balance — all of which the allocation UI allows.
        paymentAllocations,
        sessionId: currentSession?.id || null,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        branchId: currentTerminal?.branchId || null,
        branchName: currentTerminal?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        shippingAddress: deliveryAddress || shippingAddress || null,
        shippingCharge: shippingChargeNum > 0 ? shippingChargeNum : null,
        taxInclusive: !!posSettings?.taxInclusive,
        driverName: (deliveryDriver && deliveryDriver !== 'Unassigned') ? deliveryDriver : null,
        deliveryNotes: deliveryNotes || null,
        items,
        supervisorOverridePin: overrideCreds?.pin || undefined,
        supervisorOverrideEmail: overrideCreds?.email || undefined,
        supervisorOverridePassword: overrideCreds?.password || undefined,
      };

      // ── PAYMENT CONFIRMED HERE ────────────────────────────────────────────
      // posCheckout resolving is the backend's authoritative confirmation that
      // the sale posted (GL, stock, receivable all committed). Everything below
      // — cash drawer, receipt printing, layaway conversion — is a post-success
      // side-effect that does NOT gate whether the payment succeeded. So we show
      // the success screen the moment this resolves and run those side-effects in
      // the background, instead of making the cashier wait on the printer round-
      // trip (the bulk of the old 3–5 s). No false success: this only runs after
      // the await above resolves; a rejection skips straight to catch().
      const savedInvoice = await posCheckout(payload);

      // Credit account posting for THIS invoice — same formula for every payment
      // mode: Invoice Credit is the invoice's due amount (net of any layaway deposit
      // already collected), Amount Paid is what was actually received against it now.
      // A fully-settled cash/card/online/mixed sale nets to 0 (balance unchanged);
      // an unpaid or partially-paid Credit sale carries the remainder forward.
      const creditInvoiceCreditAuto = creditPrevBalAuto != null ? effectiveDueAmt : null;
      const creditAmountPaidAuto = creditPrevBalAuto != null ? creditAppliedAmount : null;
      const creditUpdatedBalanceAuto = creditPrevBalAuto != null
        ? creditPrevBalAuto + creditInvoiceCreditAuto - creditAmountPaidAuto
        : null;

      const paid = {
        id: savedInvoice.invoiceNumber,
        total: savedInvoice.invoiceTotal,
        items: currentInvoice.items.length,
        invoice: savedInvoice,
        changeAmount: changeDue,
        customer,
        paymentMode,
        depositAmount: depositSnapshot,
        paidAmount,
        creditBalance,
        // The same block the receipt prints, so the success screen and the paper the
        // customer walks away with cannot state different figures.
        paymentBlock: settledPaymentBlock,
        // Snapshotted here so the "Print Receipt" / "Last Receipt" reprint actions
        // (which reuse lastPaidInvoice) show the same correct figures instead of
        // re-querying the customer's balance, which by then already reflects this
        // invoice and would be mislabeled as "previous".
        creditPreviousBalance: creditPrevBalAuto,
        creditInvoiceCredit: creditInvoiceCreditAuto,
        creditAmountPaid: creditAmountPaidAuto,
        creditUpdatedBalance: creditUpdatedBalanceAuto,
      };

      // Snapshot everything the background finalize needs into locals BEFORE the
      // state resets below wipe the React state it was reading from (customer,
      // amounts, layaway id). savedInvoice/paid/changeDue etc. are already locals.
      const layawayIdSnapshot = activeLayawayId;
      const printPaper = tplInvoicePaper;

      // ── Show success immediately, then finalize in the background ───────────
      // The payment is already confirmed (posCheckout resolved). Commit the
      // success state + clear the cart NOW so the cashier sees "Payment Complete"
      // without waiting on the printer. checkoutFinalizing drives the subtle
      // "Printing receipt…" indicator on the complete screen until printing ends.
      setLastPaidInvoice(paid);
      setCheckoutFinalizing(true);
      setInvoiceCounter(c => c + 1);
      clearInvoice();
      syncPosData();
      setReceivedAmount('');
      setSelectedCardType('');
      setSelectedCreditCustomer('');
      setLastScannedItem(null);
      setCheckoutRemarks('');
      // Drop the allocations so the next sale starts from an empty payment panel.
      checkoutPayment.clearLines();
      if (layawayIdSnapshot) { setActiveLayawayId(null); setActiveLayawayDeposit(0); }
      // Transition the checkout overlay to the "complete" screen in-place.
      // Deferred to a separate React commit (queueMicrotask) so the state
      // resets above (clearInvoice, clearLines, etc.) are committed
      // and painted BEFORE React unmounts the payment form subtree and mounts
      // the complete screen. Without this, React 18's automatic batching
      // tries to reconcile DOM changes inside the payment-form buttons (e.g.
      // indicator divs) while simultaneously unmounting those buttons — which
      // throws "Failed to execute 'removeChild' on 'Node'".
      queueMicrotask(() => setCheckoutPhase('complete'));

      // Post-success side-effects: cash drawer, receipt print, layaway convert.
      // Fire-and-forget — the success screen is already up; failures here surface
      // as a non-blocking notice (the sale itself is safely posted). NOT awaited,
      // so the checkout handler's finally{} releases checkoutLoading right away.
      void (async () => {
        try {
          // Cash drawer — open on cash settlement, and again if change is due.
          if (cashTaken) {
            openCashDrawer('CASH_SETTLEMENT');
            openCashDrawer('CASH_PAYMENT');
          }
          if (changeDue > 0) openCashDrawer('CHANGE_RETURN');

          try {
            if (printPaper === 'A4') {
              const template = resolveInvoiceA4TemplateFor(savedInvoice);
              const data = buildPosPrintData(savedInvoice, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(savedInvoice) ? tplInvoiceHeader : tplReceiptHeader);
              const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
              printHtml(await generatePrintHtmlAsync(template, data, options));
              openCashDrawer('RECEIPT_PRINT');
            } else {
              // Credit account fields ALL come from the single pre-checkout snapshot
              // (creditPrevBalAuto, read at line ~3280 BEFORE posCheckout posted this
              // invoice) so Previous Balance + Invoice Credit − Amount Paid = Updated
              // Balance holds internally. Do NOT re-query posCreditBalance here: after
              // checkout the ledger already includes this invoice, so the re-queried
              // value is the NEW balance — passing it as "Previous Balance" while the
              // other three fields stay on the pre-sale snapshot made the printed math
              // contradict itself (Previous showed the post-sale balance, Updated the
              // pre-sale one).

              const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                full: savedInvoice,
                cashGiven: paid.paidAmount,
                changeAmount: changeDue,
                paymentBlock: settledPaymentBlock,
                // Print the actual selected customer's name (client item 3) — the same
                // `customer` object the checkout preview rendered. Walk-in stays null so
                // the builders fall back to "Walk-in Customer" only for a genuine walk-in.
                customerNameOverride: (customer && customer.id !== 'walk-in') ? customer.name : null,
                customerPhone: customer?.phone,
                customerEmail: customer?.email,
                customerTrn: customer?.trn,
                customerAddress: customer?.address,
                creditPreviousBalance: creditPrevBalAuto,
                creditInvoiceCredit: creditInvoiceCreditAuto,
                creditAmountPaid: creditAmountPaidAuto,
                creditUpdatedBalance: creditUpdatedBalanceAuto,
                depositApplied: depositSnapshot > 0 ? depositSnapshot : null,
                balanceDue: depositSnapshot > 0 ? effectiveDueAmt : null,
                shippingCharge: shippingChargeNum > 0 ? shippingChargeNum : null,
              });
              await printThermalReceiptWithConfiguredPrinter({
                full: savedInvoice,
                text,
                escPosBase64,
                title: `Receipt ${savedInvoice.invoiceNumber || ''}`.trim(),
              });
              openCashDrawer('RECEIPT_PRINT');
            }
          } catch (autoPrintErr) {
            console.warn('Automatic receipt print failed', autoPrintErr);
            alert(`Sale saved, but the receipt didn't print: ${autoPrintErr?.message || 'printer error'}. Use "Print Receipt" to retry.`);
          }

          // If this checkout settled a layaway, stamp it converted (releases its
          // reservations; the sale re-reserved its own batches). Best-effort — the
          // sale already posted, so a failure here just leaves the layaway open.
          if (layawayIdSnapshot) {
            try {
              await convertLayaway(layawayIdSnapshot, {
                invoiceId: savedInvoice.id,
                invoiceNumber: savedInvoice.invoiceNumber,
              });
            } catch (convErr) {
              console.warn('Layaway mark-converted failed', convErr);
            }
          }
        } finally {
          setCheckoutFinalizing(false);
        }
      })();
    } catch (err) {
      // Settle failed — the cart is untouched (clearInvoice only runs on success).
      // Do NOT unfreeze the preview here: flipping checkoutSettling false in the
      // same render that mounts the error banner swaps the live iframe's blob src
      // while React is reconciling, which races the iframe's external DOM mutation
      // and throws "Failed to execute 'removeChild' on 'Node'". The freeze is
      // released safely when the payment dialog closes (effect on showPaymentDialog),
      // so the cashier can read the error / retry against the still-frozen preview.
      // The allocations are deliberately left intact on every failure path — the cashier
      // retries the same payment rather than re-entering every tender from scratch.
      const isNetworkFailure = !err?.response;
      const msg = err?.response?.data?.message || err?.response?.data || err?.message || 'Checkout failed. Please try again.';
      const msgStr = isNetworkFailure
        ? 'Could not reach the server. The sale was NOT recorded — check the connection and settle again. Your payment entries have been kept.'
        : (typeof msg === 'string' ? msg : 'Checkout failed. Please try again.');
      // Backend §2.4 gate (PosCheckoutController) rejected a below-minimum line because the
      // cashier lacks the pos_price_override permission — route into the same supervisor-
      // approval dialog used at cart-add time instead of a dead-end error, so the checkout can
      // be retried with a verified PIN/password attached (see processPayment's overrideCreds).
      if (isClosureWorkflowError(err)) {
        // The session entered its close workflow (its X-Report was generated, possibly on
        // another tab/terminal) while this sale was being rung up. There is no supervisor
        // override for this — unlike BUSINESS_DAY_CLOSED below — because no credential can
        // un-issue a numbered X-Report. Route the cashier to finish the closure; the cart
        // is left intact, as on every other failure path.
        setShowPaymentDialog(false);
        showClosureRequiredBlock(msgStr);
      } else if (err?.response?.status === 403 && msgStr.includes('pos_price_override')) {
        requestApproval({ priceOverride: { type: 'CHECKOUT' }, resetEmail: true });
      } else if (err?.response?.status === 423
                 && err?.response?.data?.code === 'BUSINESS_DAY_CLOSED'
                 && err?.response?.data?.supervisorAuthorizationAvailable) {
        // The Business Day closed while this sale was being rung up. Route into the
        // SAME supervisor-approval dialog the price-override gate uses — retrying
        // attaches the verified credentials to this one checkout (see processPayment's
        // overrideCreds). Deliberately per-transaction: releasing this sale grants the
        // till nothing afterwards, so the next checkout is refused again unless a
        // supervisor authorizes that one too.
        requestApproval({
          priceOverride: {
            type: 'BUSINESS_DAY_CLOSED',
            closedAt: err.response.data.closedAt,
            nextStartAt: err.response.data.nextStartAt,
          },
          resetEmail: true,
        });
      } else {
        setCheckoutError(msgStr);
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  return {
    checkoutLoading, setCheckoutLoading,
    checkoutError, setCheckoutError,
    checkoutPhase, setCheckoutPhase,
    checkoutFinalizing, setCheckoutFinalizing,
    lastPaidInvoice, setLastPaidInvoice,
    checkoutRemarks, setCheckoutRemarks,
    processPayment,
  };
}

export default useCheckout;
