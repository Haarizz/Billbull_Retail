import fs from 'node:fs';
import path from 'node:path';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  AlertCircle, ArrowRightCircle, Banknote, CheckCircle, CreditCard, Landmark, Mail, MessageCircle,
  Printer, RotateCcw, ShoppingCart, Smartphone, User, X,
} from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReceiptShareModal from '../../../../components/pos/ReceiptShareModal';
import { CurrencyAmount, DirhamSymbol } from '../POSCurrency';
import { WALK_IN_CUSTOMER } from '../posConstants';
import { paymentBlockRows } from '../payments/paymentPresentation';
import PaymentModalShell from '../payments/modals/PaymentModalShell';
import CheckoutCompleteSummary from '../features/checkout/CheckoutCompleteSummary';
import CheckoutCompleteActions from '../features/checkout/CheckoutCompleteActions';
import CheckoutSettlementSummary from '../features/checkout/CheckoutSettlementSummary';
import CheckoutPaymentHeader from '../features/checkout/CheckoutPaymentHeader';
import CheckoutPaymentFooter from '../features/checkout/CheckoutPaymentFooter';
import CheckoutRemarks from '../features/checkout/CheckoutRemarks';
import CheckoutPaymentPreview from '../features/checkout/CheckoutPaymentPreview';

// The preview column's inner content now lives in CheckoutPaymentPreview, which imports the
// scaled previews itself; the §13 stubs are substituted at the module boundary instead of via props.
const { StubThermalScaledPreview, StubA4ScaledPreview } = vi.hoisted(() => ({
  StubThermalScaledPreview: ({ src, paperSize }) => <div data-testid="thermal-preview" data-src={src} data-paper={paperSize} />,
  StubA4ScaledPreview: ({ src, fillWidth }) => <div data-testid="a4-preview" data-src={src} data-fill-width={String(fillWidth)} />,
}));
vi.mock('../POSPrintPreview', async (importOriginal) => ({
  ...(await importOriginal()),
  A4ScaledPreview: StubA4ScaledPreview,
  ThermalScaledPreview: StubThermalScaledPreview,
}));

/**
 * Characterization of the POSSales.jsx CHECKOUT SCREEN — the `{showPaymentDialog && (() => {…})()}`
 * IIFE that renders both the payment phase and the payment-complete phase. READ-ONLY: nothing
 * here is extracted, and no production file is touched.
 *
 * Scope is the JSX wiring only. The settle sequence, failure routing, finalisation and printing
 * branch selection inside processPayment are owned by useCheckout.characterization.test.js
 * (currently baseline-failing — see known-baseline-failures.txt), print dispatch by
 * usePosPrinting.characterization.test.js and payment row maths by
 * paymentPresentation.characterization.test.js. They are deliberately not repeated here.
 *
 * Structure:
 *   1. `OriginalCheckoutMarkup` — the POSSales region copied VERBATIM (enforced line-for-line by
 *      the source block at the bottom). Every closure read is lifted to a prop under its
 *      original name; lucide icons, DirhamSymbol/CurrencyAmount, WALK_IN_CUSTOMER,
 *      paymentBlockRows and ReceiptShareModal are the real modules.
 *   2. `CheckoutHarness` — owns the state the region reads, with logging setters, plus the
 *      verbatim POSSales receiptShareInitialValue memo, both handleCheckout openers and the
 *      one-second session tick (each enforced by the source block).
 *
 * Known current behaviours/defects pinned as-is (do NOT fix here):
 *   - Complete-screen Print Receipt omits paymentBlock/depositApplied/balanceDue/shippingCharge/
 *     isReprint/cashierNameOverride, never kicks the drawer, has no in-flight guard, and reports
 *     failure through window.alert.
 *   - Its A4 branch hard-codes currency 'AED' and hands generateDocumentPrintHtml's return value
 *     straight to printHtml without awaiting it.
 *   - showA4CheckoutPreview is a hard-coded `false`; the A4 preview branch is dead.
 *   - The orders-list "checkout" opener sets showPaymentDialog without resetting checkoutPhase.
 *   - The header X and the footer Cancel close differently (X keeps the error and the tenders).
 */

// ── the verbatim region ─────────────────────────────────────────────────────────────────
function OriginalCheckoutMarkup({
  showPaymentDialog, checkoutPhase, lastPaidInvoice,
  setShowPaymentDialog, setCheckoutPhase, setCheckoutSettling, setCheckoutFinalizing,
  setReceiptShareChannel, setSelectedCustomer, checkoutFinalizing, formatCurrencyStr,
  getSalesInvoiceById, tplInvoicePaper, resolveInvoiceA4TemplateFor, buildPosPrintData,
  tplInvoiceFooter, customerOptions, isTaxInvoiceDocument, tplInvoiceHeader, tplReceiptHeader,
  tplOutletName, effectiveOutletTrn, tplOutletAddress, tplOutletPhone, tplLogoDataUrl, company,
  tplStampDataUrl, USE_NEW_POS_PRINT_TEMPLATE, tplInvoiceShowStamp, printHtml, generateDocumentPrintHtml,
  buildThermalReceiptArtifacts, printThermalReceiptWithConfiguredPrinter, setShowReprintModal,
  receiptShareChannel, receiptShareInitialValue, handleReceiptShareSend,
  shippingCharge, currentInvoice, activeLayawayDeposit, checkoutEffectiveDue, previewInvoiceNo,
  checkoutPayment, checkoutCompatibility, showA4CheckoutPreview, checkoutA4Html, checkoutA4BlobUrl,
  checkoutPreviewBlobUrl, PaymentAllocationPanel,
  loadPosCustomers, selectedCustomer, selectedCustomerData, checkoutOnlineBankAccounts,
  checkoutOnlineBankAccountsLoading, checkoutRemarks, setCheckoutRemarks, checkoutPaymentFields,
  checkoutError, setCheckoutError, cancelCheckoutTenders, processPayment, checkoutLoading,
}) {
  return (
    <>
      {/* VERBATIM-START */}
      {/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}
      {showPaymentDialog && (() => {
        // ── Payment Complete phase: render in the SAME overlay to avoid DOM churn ──
        if (checkoutPhase === 'complete' && lastPaidInvoice) {
          const closeComplete = () => {
            setShowPaymentDialog(false);
            setCheckoutPhase('payment');
            setCheckoutSettling(false);
            // Clear the finalize indicator on close — the receipt print is a
            // fire-and-forget background task and doesn't need to block closing.
            setCheckoutFinalizing(false);
            setReceiptShareChannel(null);
            setSelectedCustomer(WALK_IN_CUSTOMER.id);
          };
          
          const paymentRows = lastPaidInvoice.paymentBlock ? paymentBlockRows(lastPaidInvoice.paymentBlock) : [];
          const usedMethods = paymentRows.filter(r => r.label !== 'Total Received' && r.label !== 'Change Returned');

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* 1. Redesigned Success Header */}
                <div className="bg-gradient-to-b from-[#F5C742] to-[#E5B532] px-6 pt-5 pb-4 text-center shrink-0">
                  <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest mb-0.5">Payment Complete</p>
                  <p className="text-white font-bold text-lg">{lastPaidInvoice.id}</p>
                </div>

                {/* 2. Amount Paid (Primary Financial Highlight) */}
                <div className="bg-[#FFFBEB] border-b border-amber-100/50 px-6 py-4 text-center shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/60 mb-0.5">Amount Paid</p>
                  <p className="text-3xl font-black text-[#1E293B]">
                    <DirhamSymbol /> {(lastPaidInvoice.paidAmount ?? lastPaidInvoice.total ?? 0).toFixed(2)}
                  </p>
                </div>

                {/* Background finalize indicator */}
                {checkoutFinalizing && (
                  <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-center gap-2 shrink-0">
                    <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
                    <span className="text-[11px] font-bold text-amber-600">Printing receipt…</span>
                  </div>
                )}

                <CheckoutCompleteSummary
                  lastPaidInvoice={lastPaidInvoice}
                  paymentRows={paymentRows}
                  usedMethods={usedMethods}
                  formatCurrencyStr={formatCurrencyStr}
                />

                {/* 6. Action Priority */}
                <CheckoutCompleteActions
                  onNewSale={closeComplete}
                  onPrintReceipt={async () => {
                    if (!lastPaidInvoice?.invoice?.id) return;
                    try {
                      const full = await getSalesInvoiceById(lastPaidInvoice.invoice.id);
                      if (tplInvoicePaper === 'A4') {
                        const template = resolveInvoiceA4TemplateFor(full);
                        const data = buildPosPrintData(full, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(full) ? tplInvoiceHeader : tplReceiptHeader);
                        const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
                        printHtml(generateDocumentPrintHtml(template, data, options));
                      } else {
                        const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                          full, cashGiven: lastPaidInvoice?.paidAmount, changeAmount: lastPaidInvoice?.changeAmount, customerNameOverride: (lastPaidInvoice?.customer && lastPaidInvoice.customer.id !== 'walk-in') ? lastPaidInvoice.customer.name : null, customerPhone: lastPaidInvoice?.customer?.phone, customerEmail: lastPaidInvoice?.customer?.email, customerTrn: lastPaidInvoice?.customer?.trn, customerAddress: lastPaidInvoice?.customer?.address, creditPreviousBalance: lastPaidInvoice?.creditPreviousBalance ?? null, creditInvoiceCredit: lastPaidInvoice?.creditInvoiceCredit ?? null, creditAmountPaid: lastPaidInvoice?.creditAmountPaid ?? null, creditUpdatedBalance: lastPaidInvoice?.creditUpdatedBalance ?? null,
                        });
                        await printThermalReceiptWithConfiguredPrinter({
                          full, text, escPosBase64, title: `Receipt ${full.invoiceNumber || ''}`.trim(),
                        });
                      }
                    } catch (err) { console.warn('POS print error', err); alert(`Print failed: ${err?.message || 'printer error'}.`); }
                  }}
                  onReprint={() => {
                    closeComplete();
                    setShowReprintModal(true);
                  }}
                  onShare={(key) => setReceiptShareChannel(key)}
                />
              </div>

              {/* Share Receipt dialog — one component, three configured channels. */}
              {receiptShareChannel && (
                <ReceiptShareModal
                  key={receiptShareChannel}
                  channel={receiptShareChannel}
                  initialValue={receiptShareInitialValue}
                  onClose={() => setReceiptShareChannel(null)}
                  onSend={handleReceiptShareSend}
                />
              )}
            </div>
          );
        }

        const shippingChargeNum = Number(shippingCharge) || 0;
        const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
        // Owned by the Payment Manager (checkoutEffectiveDue) so the screen and the manager
        // measure every allocation against exactly the same amount due.
        const effectiveDue = checkoutEffectiveDue;
        // Real next number from the backend sequence (fetched when the dialog
        // opened); blank until it lands so no fabricated number is shown.
        const invoiceNo = previewInvoiceNo || '';

        // Every payment figure below comes from the Payment Manager, which owns the
        // cashier's allocations. See CheckoutPaymentManager for the allocation UI itself.
        // Settlement needs both a fully-allocated bill and a server that will record it.
        const canSettle = checkoutPayment.canSettle && checkoutCompatibility.canSettle;

        return (
          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">

            {/* ══ LEFT: Invoice Preview ════════════════════════════════ */}
            <div className={`w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 ${
              showA4CheckoutPreview ? 'lg:w-[400px] xl:w-[500px] 2xl:w-[600px]' :
              'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'
            }`}>
              <CheckoutPaymentPreview
                showA4CheckoutPreview={showA4CheckoutPreview}
                checkoutA4Html={checkoutA4Html}
                checkoutA4BlobUrl={checkoutA4BlobUrl}
                checkoutPreviewBlobUrl={checkoutPreviewBlobUrl}
              />
            </div>

            {/* ══ RIGHT: Payment & Settlement ═══════════════════════ */}
            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">

              {/* Right header */}
              <CheckoutPaymentHeader
                itemCount={currentInvoice.items.length}
                invoiceNo={invoiceNo}
                depositAmt={depositAmt}
                effectiveDue={effectiveDue}
                grandTotal={grandTotal}
                onClose={() => setShowPaymentDialog(false)}
              />

              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-3">

                  {/* ── Settlement summary (shipping and/or layaway-hold deposit) ── */}
                  {(depositAmt > 0 || shippingChargeNum > 0) && (
                    <CheckoutSettlementSummary
                      itemsTotal={currentInvoice.total || 0}
                      shippingChargeNum={shippingChargeNum}
                      grandTotal={grandTotal}
                      depositAmt={depositAmt}
                      effectiveDue={effectiveDue}
                    />
                  )}

                  {/* ══ Progressive Payment Allocation ══════════════════════
                      Pick a method, enter an amount, confirm — repeat until Remaining
                      reaches zero. There is no "Mixed" mode: a sale settled two ways is
                      simply a sale with two allocations. */}
                  <PaymentAllocationPanel
                    payment={checkoutPayment}
                    compatibility={checkoutCompatibility}
                    customers={customerOptions}
                    onCustomerCreated={loadPosCustomers}
                    selectedCustomerId={selectedCustomer}
                    selectedCustomerName={selectedCustomerData?.name}
                    bankAccounts={checkoutOnlineBankAccounts}
                    bankAccountsLoading={checkoutOnlineBankAccountsLoading}
                  />


                  {/* ── Remarks ── */}
                  <CheckoutRemarks
                    checkoutRemarks={checkoutRemarks}
                    setCheckoutRemarks={setCheckoutRemarks}
                  />



                </div>
              </div>

              {/* ── Settlement footer ── */}
              <CheckoutPaymentFooter
                changeDue={checkoutPaymentFields.changeDue}
                checkoutError={checkoutError}
                canSettle={canSettle}
                itemCount={currentInvoice.items.length}
                checkoutLoading={checkoutLoading}
                effectiveDue={checkoutEffectiveDue}
                onCancel={() => {
                  setShowPaymentDialog(false);
                  setCheckoutError(null);
                  cancelCheckoutTenders();
                }}
                onSettle={() => processPayment()}
              />

            </div>
          </div>
        );
      })()}
      {/* VERBATIM-END */}
    </>
  );
}

// ── stubs, fixtures, helpers ────────────────────────────────────────────────────────────
const PanelSpy = vi.fn(() => <div data-testid="allocation-panel" />);
const lastPanelProps = () => PanelSpy.mock.lastCall[0];

/** A panel that opens a real PaymentModalShell, the way the Cash/Card/Online/Voucher modals do. */
function PanelWithShell() {
  return (
    <div data-testid="allocation-panel">
      <PaymentModalShell title="Cash Payment" icon={Banknote} accent="#16A34A" amount="10"
        onAmountKey={() => {}} onAmountSet={() => {}} confirmLabel="Add Cash" confirmDisabled={false}
        onConfirm={() => {}} onCancel={() => {}} />
    </div>
  );
}

const panelMounts = { count: 0 };
function MountProbePanel() {
  useEffect(() => { panelMounts.count += 1; }, []);
  return <div data-testid="allocation-panel" />;
}

// Same body as the POSSales local, with activeCurrency = 'AED'.
const formatCurrencyStr = (amount) => `AED ${Number(amount || 0).toFixed(2)}`;

const PAYMENT_BLOCK = {
  details: [{ label: 'Cash', amount: 60 }, { label: 'Visa Card', amount: 40 }],
  changeAmount: 5,
  totalReceived: 105,
  hasReceivable: true,
  invoiceTotal: 100,
};
const PAID = {
  id: 'SI-POS-000123',
  total: 100,
  paidAmount: 105,
  changeAmount: 5,
  creditBalance: 0,
  creditUpdatedBalance: null,
  depositAmount: 0,
  paymentMode: 'MIXED',
  paymentBlock: PAYMENT_BLOCK,
  invoice: { id: 987 },
  customer: { id: 'walk-in', name: 'Walk-in Customer' },
};
const FULL = { id: 987, invoiceNumber: 'SI-POS-000123' };

function makeProps(overrides = {}) {
  return {
    showPaymentDialog: true,
    checkoutPhase: 'payment',
    lastPaidInvoice: null,
    setShowPaymentDialog: vi.fn(),
    setCheckoutPhase: vi.fn(),
    setCheckoutSettling: vi.fn(),
    setCheckoutFinalizing: vi.fn(),
    setReceiptShareChannel: vi.fn(),
    setSelectedCustomer: vi.fn(),
    checkoutFinalizing: false,
    formatCurrencyStr,
    getSalesInvoiceById: vi.fn(async () => FULL),
    tplInvoicePaper: '80mm',
    resolveInvoiceA4TemplateFor: vi.fn(() => ({ id: 'tpl-a4' })),
    buildPosPrintData: vi.fn(() => ({ printData: true })),
    tplInvoiceFooter: { footerText: 'Thanks' },
    customerOptions: [{ id: 'c-1' }],
    isTaxInvoiceDocument: vi.fn(() => true),
    tplInvoiceHeader: 'INVOICE-HEADER',
    tplReceiptHeader: 'RECEIPT-HEADER',
    tplOutletName: 'Main Outlet',
    effectiveOutletTrn: '100200300400003',
    tplOutletAddress: 'Dubai',
    tplOutletPhone: '04-000000',
    tplLogoDataUrl: '',
    company: { logoUrl: 'company-logo.png' },
    tplStampDataUrl: '',
    USE_NEW_POS_PRINT_TEMPLATE: true,
    tplInvoiceShowStamp: true,
    printHtml: vi.fn(),
    generateDocumentPrintHtml: vi.fn(() => '<html>a4</html>'),
    buildThermalReceiptArtifacts: vi.fn(async () => ({ text: 'RECEIPT TEXT', escPosBase64: 'RVNDUE9T' })),
    printThermalReceiptWithConfiguredPrinter: vi.fn(async () => {}),
    setShowReprintModal: vi.fn(),
    receiptShareChannel: null,
    receiptShareInitialValue: '',
    handleReceiptShareSend: vi.fn(async () => {}),
    shippingCharge: '',
    currentInvoice: { items: [{ id: 1 }, { id: 2 }], total: 100 },
    activeLayawayDeposit: 0,
    checkoutEffectiveDue: 100,
    previewInvoiceNo: 'SI-POS-000124',
    checkoutPayment: { canSettle: true },
    checkoutCompatibility: { canSettle: true },
    showA4CheckoutPreview: false,
    checkoutA4Html: '',
    checkoutA4BlobUrl: null,
    checkoutPreviewBlobUrl: 'blob:thermal-preview',
    PaymentAllocationPanel: PanelSpy,
    loadPosCustomers: vi.fn(),
    selectedCustomer: 'walk-in',
    selectedCustomerData: { id: 'walk-in', name: 'Walk-in Customer' },
    checkoutOnlineBankAccounts: [{ id: 'bank-1' }],
    checkoutOnlineBankAccountsLoading: false,
    checkoutRemarks: '',
    setCheckoutRemarks: vi.fn(),
    checkoutPaymentFields: { changeDue: 0 },
    checkoutError: null,
    setCheckoutError: vi.fn(),
    cancelCheckoutTenders: vi.fn(),
    processPayment: vi.fn(),
    checkoutLoading: false,
    ...overrides,
  };
}
const completeProps = (overrides = {}) => makeProps({ checkoutPhase: 'complete', lastPaidInvoice: PAID, ...overrides });

const renderMarkup = (props) => {
  const view = render(<OriginalCheckoutMarkup {...props} />);
  return { ...view, root: () => view.container.firstElementChild, rerenderWith: (p) => view.rerender(<OriginalCheckoutMarkup {...p} />) };
};
const cls = (el) => el.getAttribute('class');
const childClasses = (el) => Array.from(el.children).map(cls);
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

/** Asserts an <svg> is the given lucide icon carrying exactly `className`. */
const bareIconTokens = (Icon) => {
  const host = document.createElement('div');
  const view = render(<Icon />, { container: host });
  const tokens = host.querySelector('svg').getAttribute('class').split(/\s+/).filter(Boolean);
  view.unmount();
  return tokens;
};
const expectIcon = (svg, Icon, className) => {
  expect(svg.tagName.toLowerCase()).toBe('svg');
  expect(svg.getAttribute('class').split(/\s+/).filter(Boolean)).toEqual([...bareIconTokens(Icon), ...className.split(' ')]);
};

const COMPLETE_ROOT_CLASS = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
const PAYMENT_ROOT_CLASS = 'fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]';
const COMPLETE_CARD_CLASS = 'bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]';
const CARD_HEADER_CLASS = 'bg-gradient-to-b from-[#F5C742] to-[#E5B532] px-6 pt-5 pb-4 text-center shrink-0';
const CARD_AMOUNT_CLASS = 'bg-[#FFFBEB] border-b border-amber-100/50 px-6 py-4 text-center shrink-0';
const CARD_FINALIZING_CLASS = 'bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-center gap-2 shrink-0';
const CARD_SCROLL_CLASS = 'flex-1 overflow-y-auto';
const CARD_ACTIONS_CLASS = 'px-6 pb-6 pt-4 bg-white border-t border-gray-50 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]';
const LEFT_THERMAL_CLASS = 'w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 lg:w-[280px] xl:w-[340px] 2xl:w-[400px]';
const LEFT_A4_CLASS = 'w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 lg:w-[400px] xl:w-[500px] 2xl:w-[600px]';
const RIGHT_CLASS = 'flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0';
const RIGHT_HEADER_CLASS = 'bg-[#F5C742] px-3 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0';
const RIGHT_FOOTER_CLASS = 'bg-white border-t-2 border-[#F5C742]/30 px-3 sm:px-5 py-4 shrink-0';
const SUMMARY_CLASS = 'bg-white rounded-2xl border border-[#F5C742]/50 p-4 shadow-sm';
const REMARKS_CLASS = 'bg-white rounded-2xl border border-gray-200 p-4 shadow-sm';
const CHANGE_DUE_CLASS = 'mb-3 flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl';
const ERROR_CLASS = 'mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2';
const ACTIONS_CLASS = 'flex items-stretch gap-3';
const SECONDARY_BUTTON_CLASS = 'flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors';
const SETTLE_BASE = 'flex-1 min-w-0 min-h-[64px] px-5 rounded-xl font-black flex items-center justify-center gap-3 transition-all duration-200 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F5C742]/60 motion-reduce:transform-none';
const SETTLE_READY = 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] shadow-lg shadow-[#F5C742]/30 hover:shadow-xl hover:shadow-[#F5C742]/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]';
const SETTLE_BLOCKED = 'bg-gray-200 text-gray-400 cursor-not-allowed';
const SHARE_BASE = 'flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const GREEN_TONE = 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500';
const BLUE_TONE = 'border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 hover:border-blue-300 focus-visible:ring-blue-500';

// payment-phase anatomy
const leftPanel = (root) => root.children[0];
const rightPanel = (root) => root.children[1];
const rightHeader = (root) => rightPanel(root).children[0];
const rightScrollBody = (root) => rightPanel(root).children[1].children[0];
const rightFooter = (root) => rightPanel(root).children[2];
const headerXButton = (root) => rightHeader(root).querySelector('button');
const cancelButton = () => screen.getByRole('button', { name: 'Cancel checkout' });
const settleButton = () => screen.getByRole('button', { name: /^Settle payment of / });
const remarksInput = () => screen.getByPlaceholderText('Tap to enter note…');
// complete-phase anatomy
const card = (root) => root.children[0];
const detailsEl = (root) => root.querySelector('details');
const detailRows = (root) => Array.from(detailsEl(root).querySelector('div').children)
  .filter((row) => row.children.length === 2)
  .map((row) => [row.children[0].textContent, row.children[1].textContent]);
const summarySection = () => screen.getByText('Payment Summary').parentElement;
const summaryRows = () => Array.from(summarySection().children[1].children);

beforeEach(() => {
  PanelSpy.mockClear();
  panelMounts.count = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── 1. phase guard ──────────────────────────────────────────────────────────────────────
describe('1. phase guard', () => {
  it.each(['payment', 'complete'])('renders nothing at all when showPaymentDialog is false (phase %s)', (checkoutPhase) => {
    const { container } = renderMarkup(makeProps({ showPaymentDialog: false, checkoutPhase, lastPaidInvoice: PAID }));
    expect(container.innerHTML).toBe('');
  });

  it('complete phase WITH lastPaidInvoice renders the Payment Complete screen and no payment UI', () => {
    const { root } = renderMarkup(completeProps());
    expect(cls(root())).toBe(COMPLETE_ROOT_CLASS);
    expect(screen.getByText('Payment Complete')).toBeInTheDocument();
    expect(screen.queryByText('Checkout')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Settle payment of / })).toBeNull();
    expect(PanelSpy).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 0, ''])('complete phase with lastPaidInvoice === %s renders the PAYMENT screen, not the complete screen', (lastPaidInvoice) => {
    const { root } = renderMarkup(makeProps({ checkoutPhase: 'complete', lastPaidInvoice }));
    expect(cls(root())).toBe(PAYMENT_ROOT_CLASS);
    expect(screen.getByText('Checkout')).toBeInTheDocument();
    expect(settleButton()).toBeInTheDocument();
    expect(screen.queryByText('Payment Complete')).toBeNull();
  });

  it.each(['payment', 'Complete', 'COMPLETE', undefined])('any phase other than exactly "complete" (%s) renders the payment screen even with a paid invoice', (checkoutPhase) => {
    const { root } = renderMarkup(makeProps({ checkoutPhase, lastPaidInvoice: PAID }));
    expect(cls(root())).toBe(PAYMENT_ROOT_CLASS);
    expect(screen.queryByText('Payment Complete')).toBeNull();
  });
});

// ── 2. root DOM reuse ───────────────────────────────────────────────────────────────────
describe('2. root DOM reuse across the phase switch', () => {
  it('payment → complete keeps the SAME root <div> node; only its class and children change', () => {
    const view = renderMarkup(makeProps());
    const before = view.root();
    const paymentLeft = before.children[0];
    const paymentRight = before.children[1];
    expect(before.tagName).toBe('DIV');
    expect(cls(before)).toBe(PAYMENT_ROOT_CLASS);

    view.rerenderWith(completeProps());
    const after = view.root();
    expect(after).toBe(before);
    expect(view.container.children).toHaveLength(1);
    expect(cls(after)).toBe(COMPLETE_ROOT_CLASS);
    // The reuse goes one level deeper: both branches put an unkeyed <div> first, so React
    // recycles the payment preview column's node as the complete card. The right column goes.
    expect(after.children[0]).toBe(paymentLeft);
    expect(cls(paymentLeft)).toBe(COMPLETE_CARD_CLASS);
    expect(screen.queryByTestId('thermal-preview')).toBeNull();
    expect(paymentRight.isConnected).toBe(false);
  });

  it('complete → payment (the phase a closeComplete resets to) also reuses the root node', () => {
    const view = renderMarkup(completeProps());
    const before = view.root();
    view.rerenderWith(makeProps({ lastPaidInvoice: PAID }));
    expect(view.root()).toBe(before);
    expect(cls(view.root())).toBe(PAYMENT_ROOT_CLASS);
  });

  it('z-index moves from z-[60] (payment) to z-50 (complete) on the same element', () => {
    const view = renderMarkup(makeProps());
    const root = view.root();
    expect(root.classList.contains('z-[60]')).toBe(true);
    expect(root.classList.contains('z-50')).toBe(false);
    view.rerenderWith(completeProps());
    expect(root.classList.contains('z-50')).toBe(true);
    expect(root.classList.contains('z-[60]')).toBe(false);
  });

  it('only toggling showPaymentDialog itself unmounts the root — reopening creates a new node', () => {
    const view = renderMarkup(makeProps());
    const first = view.root();
    view.rerenderWith(makeProps({ showPaymentDialog: false }));
    expect(view.root()).toBeNull();
    view.rerenderWith(makeProps());
    expect(view.root()).not.toBe(first);
  });
});

// ── 3. z-index / root structure ─────────────────────────────────────────────────────────
describe('3. root structure', () => {
  it('complete root: one card child; the card holds header, amount, scroll body and actions in order', () => {
    const { root } = renderMarkup(completeProps());
    expect(childClasses(root())).toEqual([COMPLETE_CARD_CLASS]);
    expect(childClasses(card(root()))).toEqual([CARD_HEADER_CLASS, CARD_AMOUNT_CLASS, CARD_SCROLL_CLASS, CARD_ACTIONS_CLASS]);
  });

  it('complete root: ReceiptShareModal is the root\'s SECOND direct child (a sibling of the card, inside the root)', () => {
    const { root } = renderMarkup(completeProps({ receiptShareChannel: 'sms' }));
    expect(root().children).toHaveLength(2);
    expect(root().children[0]).toBe(card(root()));
    expect(cls(root().children[1])).toBe('fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 overflow-y-auto');
    expect(root().children[1].contains(screen.getByRole('dialog'))).toBe(true);
  });

  it('payment root: left preview + right settlement; right = header, scroll body, footer', () => {
    const { root } = renderMarkup(makeProps());
    expect(childClasses(root())).toEqual([LEFT_THERMAL_CLASS, RIGHT_CLASS]);
    expect(childClasses(rightPanel(root()))).toEqual([RIGHT_HEADER_CLASS, CARD_SCROLL_CLASS, RIGHT_FOOTER_CLASS]);
    expect(cls(rightScrollBody(root()))).toBe('p-4 space-y-3');
  });

  it('payment root: PaymentAllocationPanel sits in the scroll body between the settlement summary and remarks', () => {
    const { root } = renderMarkup(makeProps({ shippingCharge: '10' }));
    const body = rightScrollBody(root());
    expect(body.children).toHaveLength(3);
    expect(cls(body.children[0])).toBe(SUMMARY_CLASS);
    expect(body.children[1]).toBe(screen.getByTestId('allocation-panel'));
    expect(cls(body.children[2])).toBe(REMARKS_CLASS);
  });

  it('payment root: a PaymentModalShell opened by the panel renders INSIDE the checkout root (no portal), at z-[70]', () => {
    const { root } = renderMarkup(makeProps({ PaymentAllocationPanel: PanelWithShell }));
    const dialog = screen.getByRole('dialog', { name: 'Cash Payment' });
    expect(root().contains(dialog)).toBe(true);
    expect(rightScrollBody(root()).children[0]).toBe(screen.getByTestId('allocation-panel'));
    expect(cls(dialog.parentElement)).toBe('fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4');
  });

  it('footer: change due, error, then the action row — each present only when its condition holds', () => {
    const { root } = renderMarkup(makeProps({ checkoutPaymentFields: { changeDue: 2.5 }, checkoutError: 'Card declined' }));
    expect(childClasses(rightFooter(root()))).toEqual([CHANGE_DUE_CLASS, ERROR_CLASS, ACTIONS_CLASS]);
    cleanup();
    const second = renderMarkup(makeProps());
    expect(childClasses(rightFooter(second.root()))).toEqual([ACTIONS_CLASS]);
  });
});

// ── 4. complete screen ──────────────────────────────────────────────────────────────────
describe('4. complete screen', () => {
  it('header: CheckCircle, the "Payment Complete" caption and the invoice id', () => {
    const { root } = renderMarkup(completeProps());
    const header = card(root()).children[0];
    expectIcon(header.querySelector('svg'), CheckCircle, 'h-6 w-6 text-white');
    expect(cls(header.children[0])).toBe('w-11 h-11 rounded-full bg-white/25 flex items-center justify-center mx-auto mb-2');
    expect(header.children[1]).toHaveTextContent('Payment Complete');
    expect(cls(header.children[1])).toBe('text-white/80 text-[10px] font-medium uppercase tracking-widest mb-0.5');
    expect(header.children[2].textContent).toBe('SI-POS-000123');
    expect(cls(header.children[2])).toBe('text-white font-bold text-lg');
  });

  it.each([
    ['paidAmount wins', { paidAmount: 105, total: 100 }, '105.00'],
    ['?? falls back to total when paidAmount is null', { paidAmount: null, total: 100 }, '100.00'],
    ['?? keeps a zero paidAmount (not ||)', { paidAmount: 0, total: 100 }, '0.00'],
    ['0 when both are missing', { paidAmount: undefined, total: undefined }, '0.00'],
  ])('Amount Paid: %s', (_label, fields, expected) => {
    const { root } = renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, ...fields } }));
    const amount = card(root()).children[1];
    expect(amount.children[0]).toHaveTextContent('Amount Paid');
    expect(cls(amount.children[1])).toBe('text-3xl font-black text-[#1E293B]');
    expect(amount.children[1].querySelector('[data-bb-currency-symbol]')).not.toBeNull();
    expect(amount.children[1].textContent.trim()).toBe(expected);
  });

  it.each([[5, true], [0, false], [undefined, false], [-1, false]])('Change Due row for changeAmount %s → %s', (changeAmount, shown) => {
    renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, changeAmount } }));
    const label = screen.queryByText('Change Due');
    expect(!!label).toBe(shown);
    if (shown) {
      expect(cls(label.parentElement)).toBe('bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between');
      expect(label.nextElementSibling.textContent.trim()).toBe('5.00');
    }
  });

  it.each([
    ['hidden with no receivable', { creditBalance: 0, creditUpdatedBalance: null }, null],
    ['This Invoice only when the updated balance is null', { creditBalance: 40, creditUpdatedBalance: null }, [['This Invoice', '40.00']]],
    ['both rows', { creditBalance: 40, creditUpdatedBalance: 140 }, [['This Invoice', '40.00'], ['Customer Outstanding', '140.00']]],
    ['shown by an outstanding balance alone, This Invoice reads 0.00', { creditBalance: 0, creditUpdatedBalance: 90 }, [['This Invoice', '0.00'], ['Customer Outstanding', '90.00']]],
    ['a zero updated balance alone does not open the section', { creditBalance: 0, creditUpdatedBalance: 0 }, null],
  ])('Accounts Receivable: %s', (_label, fields, rows) => {
    renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, ...fields } }));
    const heading = screen.queryByText('Accounts Receivable');
    if (rows === null) {
      expect(heading).toBeNull();
      return;
    }
    expect(cls(heading.parentElement)).toBe('px-6 py-3 border-b border-gray-100');
    const rendered = Array.from(heading.nextElementSibling.children).map((r) => [r.children[0].textContent, r.children[1].textContent.trim()]);
    expect(rendered).toEqual(rows);
  });

  it('Payment Summary lists only the used methods (no Change Returned / Total Received rows)', () => {
    renderMarkup(completeProps());
    expect(cls(summarySection())).toBe('px-6 py-3 border-b border-gray-50');
    const rows = summaryRows();
    expect(rows.map((r) => [r.children[0].textContent, r.children[1].textContent])).toEqual([
      ['Cash', 'AED 60.00'],
      ['Visa Card', 'AED 40.00'],
    ]);
    expect(cls(rows[0])).toBe('flex justify-between items-center text-sm');
    expect(cls(rows[0].children[1])).toBe('font-bold text-[#1E293B]');
  });

  it.each([
    ['Cash', Banknote],
    ['Visa', CreditCard],
    ['MasterCard', CreditCard],
    ['Credit Card', CreditCard],
    ['Online Transfer', Landmark],
    ['Bank Deposit', Landmark],
    ['Customer Credit', User],
    ['Gift Voucher', Banknote],
  ])('Payment Summary icon for "%s"', (label, Icon) => {
    renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, paymentBlock: { ...PAYMENT_BLOCK, details: [{ label, amount: 100 }], changeAmount: 0 } } }));
    expectIcon(summaryRows()[0].querySelector('svg'), Icon, 'h-4 w-4 text-gray-400');
  });

  it('Payment Summary is absent without a paymentBlock, and duplicate labels render without a key collision', () => {
    renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, paymentBlock: null } }));
    expect(screen.queryByText('Payment Summary')).toBeNull();
    cleanup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, paymentBlock: { ...PAYMENT_BLOCK, details: [{ label: 'Cash', amount: 50 }, { label: 'Cash', amount: 50 }] } } }));
    expect(summaryRows()).toHaveLength(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('details: a native closed <details> with the two summary captions and the full row list', () => {
    const { root } = renderMarkup(completeProps());
    const details = detailsEl(root());
    expect(details.open).toBe(false);
    expect(cls(details)).toBe('group rounded-lg bg-gray-50 transition-all');
    expect(Array.from(details.querySelector('summary').children).map((s) => [s.textContent, cls(s)])).toEqual([
      ['▼ View Financial Details', 'group-open:hidden'],
      ['▲ Hide Financial Details', 'hidden group-open:inline'],
    ]);
    expect(detailRows(root())).toEqual([
      ['Cash', 'AED 60.00'],
      ['Visa Card', 'AED 40.00'],
      ['Change Returned', 'AED 5.00'],
      ['Total Received', 'AED 105.00'],
      ['Invoice Total', 'AED 100.00'],
      ['Sale Amount', 'AED 100.00'],
      ['Payment Mode', 'MIXED'],
    ]);
    const emphasis = Array.from(details.querySelectorAll('span.font-bold')).slice(0, 4).map(cls);
    expect(emphasis).toEqual(['font-bold text-[#1E293B]', 'font-bold text-[#1E293B]', 'font-bold text-emerald-600', 'font-bold text-emerald-600']);
  });

  it('details: deposit and customer-outstanding rows, no Invoice Total without a receivable', () => {
    const { root } = renderMarkup(completeProps({
      lastPaidInvoice: {
        ...PAID,
        depositAmount: 25,
        creditBalance: 30,
        creditUpdatedBalance: 130,
        paymentBlock: { details: [{ label: 'Cash', amount: 45 }], changeAmount: 0, totalReceived: 45, hasReceivable: false },
      },
    }));
    expect(detailRows(root())).toEqual([
      ['Cash', 'AED 45.00'],
      ['Sale Amount', 'AED 100.00'],
      ['Deposit Applied', '−AED 25.00'],
      ['Customer Total Outstanding', 'AED 130.00'],
      ['Payment Mode', 'MIXED'],
    ]);
    expect(cls(screen.getByText('−AED 25.00'))).toBe('font-bold text-[#327F74]');
  });

  it('shows no customer, shipping, or remarks information on the complete screen', () => {
    renderMarkup(completeProps({
      lastPaidInvoice: { ...PAID, customer: { id: 'c-9', name: 'Jane Doe', phone: '0501234567', email: 'jane@shop.test' }, shippingCharge: 15 },
      checkoutRemarks: 'leave at door',
      shippingCharge: '15',
      checkoutError: 'stale error',
    }));
    for (const text of ['Jane Doe', '0501234567', 'jane@shop.test', 'Shipping', 'leave at door', 'stale error', 'Settlement Summary']) {
      expect(screen.queryByText(text, { exact: false })).toBeNull();
    }
  });

  it('actions: New Sale, Print Receipt, Reprint Inv. and the three share buttons, in order, with exact classes and icons', () => {
    const { root } = renderMarkup(completeProps());
    const actions = card(root()).children[3];
    const buttons = Array.from(actions.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['New Sale', 'Print Receipt', 'Reprint Inv.', 'SMS', 'WhatsApp', 'Email']);
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true);

    expect(cls(buttons[0])).toBe('w-full py-3.5 mb-3 rounded-xl bg-[#F5C742] hover:bg-[#E5B532] text-white font-black text-sm transition-colors flex items-center justify-center gap-2 shadow-sm');
    expectIcon(buttons[0].querySelector('svg'), ArrowRightCircle, 'h-5 w-5');
    expect(cls(buttons[1])).toBe(SECONDARY_BUTTON_CLASS);
    expectIcon(buttons[1].querySelector('svg'), Printer, 'h-4 w-4');
    expect(cls(buttons[2])).toBe(SECONDARY_BUTTON_CLASS);
    expectIcon(buttons[2].querySelector('svg'), RotateCcw, 'h-4 w-4');
    expect(cls(buttons[1].parentElement)).toBe('grid grid-cols-2 gap-2 mb-4');

    expect(screen.getByText('Share Receipt').parentElement).toBe(buttons[3].parentElement.parentElement);
    expect(cls(buttons[3].parentElement)).toBe('grid grid-cols-3 gap-2');
    [[buttons[3], Smartphone, GREEN_TONE], [buttons[4], MessageCircle, GREEN_TONE], [buttons[5], Mail, BLUE_TONE]].forEach(([button, Icon, tone]) => {
      expect(cls(button)).toBe(`${SHARE_BASE} ${tone}`);
      expectIcon(button.querySelector('svg'), Icon, 'h-4 w-4');
      expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('share buttons set the channel to sms / whatsapp / email and touch nothing else', () => {
    const props = completeProps();
    renderMarkup(props);
    ['SMS', 'WhatsApp', 'Email'].forEach((name) => fireEvent.click(screen.getByRole('button', { name })));
    expect(props.setReceiptShareChannel.mock.calls).toEqual([['sms'], ['whatsapp'], ['email']]);
    for (const setter of ['setShowPaymentDialog', 'setCheckoutPhase', 'setCheckoutSettling', 'setCheckoutFinalizing', 'setSelectedCustomer', 'setShowReprintModal']) {
      expect(props[setter], setter).not.toHaveBeenCalled();
    }
  });
});

// ── harness ─────────────────────────────────────────────────────────────────────────────
/**
 * Stateful harness. Bodies between the *-START/END markers are copied from POSSales.jsx and
 * enforced line-for-line by the source block below.
 */
function CheckoutHarness({ base, log, initial = {} }) {
  const logged = (name, raw) => (value) => { log.push([name, value]); raw(value); };
  const [showPaymentDialog, rawShowPaymentDialog] = useState(initial.showPaymentDialog ?? true);
  const [checkoutPhase, rawCheckoutPhase] = useState(initial.checkoutPhase ?? 'complete');
  const [lastPaidInvoice] = useState(initial.lastPaidInvoice === undefined ? PAID : initial.lastPaidInvoice);
  const [checkoutSettling, rawCheckoutSettling] = useState(initial.checkoutSettling ?? true);
  const [checkoutFinalizing, rawCheckoutFinalizing] = useState(initial.checkoutFinalizing ?? true);
  const [receiptShareChannel, rawReceiptShareChannel] = useState(initial.receiptShareChannel ?? null);
  const [selectedCustomer, rawSelectedCustomer] = useState(initial.selectedCustomer ?? 'c-9');
  const [showReprintModal, rawShowReprintModal] = useState(false);
  const [checkoutError, rawCheckoutError] = useState(initial.checkoutError ?? null);
  const [checkoutRemarks, rawCheckoutRemarks] = useState('');
  const [sessionNowMs, setSessionNowMs] = useState(() => Date.now());
  const currentSession = initial.currentSession ?? null;
  const setShowPaymentDialog = logged('setShowPaymentDialog', rawShowPaymentDialog);
  const setCheckoutPhase = logged('setCheckoutPhase', rawCheckoutPhase);
  const setCheckoutSettling = logged('setCheckoutSettling', rawCheckoutSettling);
  const setCheckoutFinalizing = logged('setCheckoutFinalizing', rawCheckoutFinalizing);
  const setReceiptShareChannel = logged('setReceiptShareChannel', rawReceiptShareChannel);
  const setSelectedCustomer = logged('setSelectedCustomer', rawSelectedCustomer);
  const setShowReprintModal = logged('setShowReprintModal', rawShowReprintModal);
  const setCheckoutError = logged('setCheckoutError', rawCheckoutError);
  const setCheckoutRemarks = logged('setCheckoutRemarks', rawCheckoutRemarks);
  const cancelCheckoutTenders = () => { log.push(['cancelCheckoutTenders']); base.cancelCheckoutTenders(); };
  const { handleOpenOrder } = base;
  // SHARE-INITIAL-START
  const receiptShareInitialValue = useMemo(() => {
    const cust = lastPaidInvoice?.customer;
    if (!cust || cust.id === WALK_IN_CUSTOMER.id) return '';
    return (receiptShareChannel === 'email' ? cust.email : cust.phone || cust.mobile) || '';
  }, [lastPaidInvoice, receiptShareChannel]);
  // SHARE-INITIAL-END

  // HANDLE-CHECKOUT-START
  const handleCheckout = useCallback(() => {
    setCheckoutPhase('payment');
    setShowPaymentDialog(true);
    // The Payment Manager starts with no allocations — the cashier picks a method and
    // enters an amount, so there is nothing to pre-seed here any more.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // HANDLE-CHECKOUT-END

  const ordersListCheckout = (() => {
    // ORDERS-CHECKOUT-START
    const handleCheckout = async () => {
      await handleOpenOrder();
      setShowPaymentDialog(true);
    };
    // ORDERS-CHECKOUT-END
    return handleCheckout;
  })();

  // TICK-START
  useEffect(() => {
    const isActive = currentSession?.status === 'OPEN' || currentSession?.status === 'active';
    if (!isActive || !currentSession?.openedAt) {
      setSessionNowMs(Date.now());
      return undefined;
    }
    setSessionNowMs(Date.now());
    const timer = window.setInterval(() => setSessionNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentSession?.id, currentSession?.openedAt, currentSession?.status]);
  // TICK-END

  return (
    <>
      <div data-testid="checkout-slot">
        <OriginalCheckoutMarkup
          {...base}
          showPaymentDialog={showPaymentDialog} setShowPaymentDialog={setShowPaymentDialog}
          checkoutPhase={checkoutPhase} setCheckoutPhase={setCheckoutPhase}
          lastPaidInvoice={lastPaidInvoice}
          setCheckoutSettling={setCheckoutSettling}
          checkoutFinalizing={checkoutFinalizing} setCheckoutFinalizing={setCheckoutFinalizing}
          receiptShareChannel={receiptShareChannel} setReceiptShareChannel={setReceiptShareChannel}
          receiptShareInitialValue={receiptShareInitialValue}
          selectedCustomer={selectedCustomer} setSelectedCustomer={setSelectedCustomer}
          setShowReprintModal={setShowReprintModal}
          checkoutError={checkoutError} setCheckoutError={setCheckoutError}
          checkoutRemarks={checkoutRemarks} setCheckoutRemarks={setCheckoutRemarks}
          cancelCheckoutTenders={cancelCheckoutTenders}
        />
      </div>
      <output data-testid="state">{JSON.stringify({
        showPaymentDialog, checkoutPhase, checkoutSettling, checkoutFinalizing, receiptShareChannel,
        selectedCustomer, showReprintModal, checkoutError, checkoutRemarks, lastPaidInvoiceId: lastPaidInvoice?.id ?? null,
      })}</output>
      <output data-testid="tick">{sessionNowMs}</output>
      <button type="button" data-testid="open-checkout" onClick={handleCheckout} />
      <button type="button" data-testid="orders-list-checkout" onClick={ordersListCheckout} />
    </>
  );
}

const renderHarness = (initial = {}, baseOverrides = {}) => {
  const log = [];
  const base = makeProps({ handleOpenOrder: vi.fn(async () => {}), ...baseOverrides });
  const view = render(<CheckoutHarness base={base} log={log} initial={initial} />);
  return { ...view, log, base, root: () => screen.getByTestId('checkout-slot').firstElementChild };
};
const harnessState = () => JSON.parse(screen.getByTestId('state').textContent);

// ── 5. closeComplete ────────────────────────────────────────────────────────────────────
describe('5. closeComplete (real body, via New Sale)', () => {
  const CLOSE_SEQUENCE = [
    ['setShowPaymentDialog', false],
    ['setCheckoutPhase', 'payment'],
    ['setCheckoutSettling', false],
    ['setCheckoutFinalizing', false],
    ['setReceiptShareChannel', null],
    ['setSelectedCustomer', WALK_IN_CUSTOMER.id],
  ];

  it('WALK_IN_CUSTOMER.id is the "walk-in" literal the Print Receipt override compares against', () => {
    expect(WALK_IN_CUSTOMER.id).toBe('walk-in');
  });

  it('New Sale runs exactly the six setters, in order, and nothing else', () => {
    const { log, base } = renderHarness({ receiptShareChannel: 'email', checkoutError: 'old' });
    fireEvent.click(screen.getByRole('button', { name: 'New Sale' }));
    expect(log).toEqual(CLOSE_SEQUENCE);
    expect(base.cancelCheckoutTenders).not.toHaveBeenCalled();
    expect(base.processPayment).not.toHaveBeenCalled();
  });

  it('closes the overlay and resets state, but does NOT clear lastPaidInvoice or checkoutError', () => {
    const { root } = renderHarness({ receiptShareChannel: 'sms', checkoutError: 'old' });
    fireEvent.click(screen.getByRole('button', { name: 'New Sale' }));
    expect(root()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(harnessState()).toEqual({
      showPaymentDialog: false,
      checkoutPhase: 'payment',
      checkoutSettling: false,
      checkoutFinalizing: false,
      receiptShareChannel: null,
      selectedCustomer: 'walk-in',
      showReprintModal: false,
      checkoutError: 'old',
      checkoutRemarks: '',
      lastPaidInvoiceId: 'SI-POS-000123',
    });
  });

  it('Reprint Inv. runs closeComplete() THEN setShowReprintModal(true)', () => {
    const { log } = renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'Reprint Inv.' }));
    expect(log).toEqual([...CLOSE_SEQUENCE, ['setShowReprintModal', true]]);
    expect(harnessState()).toMatchObject({ showPaymentDialog: false, showReprintModal: true, lastPaidInvoiceId: 'SI-POS-000123' });
  });

  it('reopening through handleCheckout after a close shows the payment screen, with the old invoice still retained', () => {
    const { root } = renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'New Sale' }));
    fireEvent.click(screen.getByTestId('open-checkout'));
    expect(cls(root())).toBe(PAYMENT_ROOT_CLASS);
    expect(harnessState().lastPaidInvoiceId).toBe('SI-POS-000123');
  });
});

// ── 6. X vs Cancel ──────────────────────────────────────────────────────────────────────
describe('6. header X vs footer Cancel', () => {
  it('X only closes: no setCheckoutError, no cancelCheckoutTenders', () => {
    const props = makeProps({ checkoutError: 'Card declined' });
    const { root } = renderMarkup(props);
    const x = headerXButton(root());
    expect(cls(x)).toBe('w-9 h-9 rounded-xl bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors');
    expect(x.getAttribute('aria-label')).toBeNull();
    expectIcon(x.querySelector('svg'), X, 'h-5 w-5 text-[#1E293B]');
    fireEvent.click(x);
    expect(props.setShowPaymentDialog.mock.calls).toEqual([[false]]);
    expect(props.setCheckoutError).not.toHaveBeenCalled();
    expect(props.cancelCheckoutTenders).not.toHaveBeenCalled();
  });

  it('Cancel closes, clears the error, then cancels the tenders — in that order', () => {
    const { log, base, root } = renderHarness({ checkoutPhase: 'payment', lastPaidInvoice: null, checkoutError: 'Card declined' });
    expect(cls(cancelButton())).toBe('flex-none w-28 sm:w-36 min-h-[64px] rounded-xl border-2 border-gray-300 bg-white text-gray-600 font-bold text-base transition-all duration-200 ease-out hover:bg-gray-100 hover:border-gray-400 hover:text-gray-800 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300 motion-reduce:transform-none');
    fireEvent.click(cancelButton());
    expect(log).toEqual([['setShowPaymentDialog', false], ['setCheckoutError', null], ['cancelCheckoutTenders']]);
    expect(base.cancelCheckoutTenders).toHaveBeenCalledWith();
    expect(root()).toBeNull();
  });

  it('after X the error is still shown on reopen; after Cancel it is gone', () => {
    const first = renderHarness({ checkoutPhase: 'payment', lastPaidInvoice: null, checkoutError: 'Card declined' });
    fireEvent.click(headerXButton(first.root()));
    fireEvent.click(screen.getByTestId('open-checkout'));
    expect(screen.getByText('Card declined')).toBeInTheDocument();
    cleanup();

    renderHarness({ checkoutPhase: 'payment', lastPaidInvoice: null, checkoutError: 'Card declined' });
    fireEvent.click(cancelButton());
    fireEvent.click(screen.getByTestId('open-checkout'));
    expect(screen.queryByText('Card declined')).toBeNull();
  });
});

// ── 7. settle event semantics ───────────────────────────────────────────────────────────
describe('7. Settle wiring', () => {
  it('calls processPayment() with NO arguments — the click event is not forwarded as override credentials', () => {
    const props = makeProps();
    renderMarkup(props);
    fireEvent.click(settleButton());
    expect(props.processPayment).toHaveBeenCalledTimes(1);
    expect(props.processPayment.mock.calls[0]).toEqual([]);
  });

  it('contrast: a by-reference onClick would hand the browser event to the callback', () => {
    const byReference = vi.fn();
    render(<button type="button" onClick={byReference}>ref</button>);
    fireEvent.click(screen.getByRole('button', { name: 'ref' }));
    expect(byReference.mock.calls[0]).toHaveLength(1);
    expect(byReference.mock.calls[0][0]).toHaveProperty('type', 'click');
  });

  it('a disabled Settle does not call processPayment', () => {
    const props = makeProps({ checkoutLoading: true });
    renderMarkup(props);
    fireEvent.click(settleButton());
    expect(props.processPayment).not.toHaveBeenCalled();
  });
});

// ── 8. remarks event ────────────────────────────────────────────────────────────────────
describe('8. Remarks input', () => {
  it('forwards e.target.value (a string, not the event) to setCheckoutRemarks', () => {
    const props = makeProps({ checkoutRemarks: 'REF-1' });
    renderMarkup(props);
    const input = remarksInput();
    expect(input.value).toBe('REF-1');
    expect(cls(input)).toBe('mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]');
    expect(input.previousElementSibling).toHaveTextContent('Remarks / Reference');
    fireEvent.change(input, { target: { value: 'REF-12' } });
    expect(props.setCheckoutRemarks.mock.calls).toEqual([['REF-12']]);
  });

  it('is controlled: the harness state round-trips into the input value', () => {
    renderHarness({ checkoutPhase: 'payment', lastPaidInvoice: null });
    fireEvent.change(remarksInput(), { target: { value: 'gift wrap' } });
    expect(remarksInput().value).toBe('gift wrap');
    expect(harnessState().checkoutRemarks).toBe('gift wrap');
  });
});

// ── 9. settle disabled logic ────────────────────────────────────────────────────────────
describe('9. settleReady = checkoutPayment.canSettle && checkoutCompatibility.canSettle && items > 0 && !checkoutLoading', () => {
  const combos = [];
  for (const paymentCan of [true, false]) {
    for (const compatCan of [true, false]) {
      for (const itemCount of [2, 0]) {
        for (const loading of [false, true]) {
          combos.push([paymentCan, compatCan, itemCount, loading, paymentCan && compatCan && itemCount > 0 && !loading]);
        }
      }
    }
  }

  it.each(combos)('payment.canSettle=%s compat.canSettle=%s items=%s loading=%s → enabled=%s', (paymentCan, compatCan, itemCount, loading, enabled) => {
    renderMarkup(makeProps({
      checkoutPayment: { canSettle: paymentCan },
      checkoutCompatibility: { canSettle: compatCan },
      currentInvoice: { items: Array.from({ length: itemCount }, (_, i) => ({ id: i })), total: 100 },
      checkoutLoading: loading,
    }));
    const button = settleButton();
    expect(button.disabled).toBe(!enabled);
    expect(cls(button)).toBe(`${SETTLE_BASE} ${enabled ? SETTLE_READY : SETTLE_BLOCKED}`);
  });

  it.each([
    ['truthy non-booleans enable', { checkoutPayment: { canSettle: 1 }, checkoutCompatibility: { canSettle: 'yes' } }, true],
    ['undefined canSettle disables', { checkoutPayment: {}, checkoutCompatibility: { canSettle: true } }, false],
  ])('%s', (_label, overrides, enabled) => {
    renderMarkup(makeProps(overrides));
    expect(settleButton().disabled).toBe(!enabled);
  });

  it('label, pill and aria-label: Settle Payment + due amount; Processing… while loading', () => {
    renderMarkup(makeProps({ checkoutEffectiveDue: 87.5 }));
    const button = settleButton();
    expect(button.getAttribute('aria-label')).toBe('Settle payment of 87.50');
    expectIcon(button.children[0], CheckCircle, 'h-6 w-6 shrink-0');
    expect(button.children[1].textContent).toBe('Settle Payment');
    expect(cls(button.children[1])).toBe('text-base sm:text-lg truncate');
    expect(cls(button.children[2])).toBe('shrink-0 rounded-lg px-3 py-1 text-lg sm:text-2xl tabular-nums bg-white/40');
    expect(button.children[2].textContent.trim()).toBe('87.50');
    cleanup();

    renderMarkup(makeProps({ checkoutEffectiveDue: 87.5, checkoutPayment: { canSettle: false } }));
    expect(cls(settleButton().children[2])).toBe('shrink-0 rounded-lg px-3 py-1 text-lg sm:text-2xl tabular-nums bg-white/50');
    cleanup();

    renderMarkup(makeProps({ checkoutEffectiveDue: 87.5, checkoutLoading: true }));
    const loading = settleButton();
    expect(loading.children).toHaveLength(2);
    expect(cls(loading.children[0])).toBe('w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin shrink-0');
    expect(loading.children[1].textContent).toBe('Processing…');
    expect(screen.queryByText('Settle Payment')).toBeNull();
  });
});

// ── 10. finalizing ──────────────────────────────────────────────────────────────────────
describe('10. finalizing indicator', () => {
  it('complete + checkoutFinalizing renders "Printing receipt…" as the card\'s third child', () => {
    const { root } = renderMarkup(completeProps({ checkoutFinalizing: true }));
    expect(childClasses(card(root()))).toEqual([CARD_HEADER_CLASS, CARD_AMOUNT_CLASS, CARD_FINALIZING_CLASS, CARD_SCROLL_CLASS, CARD_ACTIONS_CLASS]);
    const indicator = card(root()).children[2];
    expect(cls(indicator.children[0])).toBe('w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin');
    expect(indicator.children[1].textContent).toBe('Printing receipt…');
    expect(cls(indicator.children[1])).toBe('text-[11px] font-bold text-amber-600');
  });

  it('toggles in place without remounting the root or the card', () => {
    const view = renderMarkup(completeProps({ checkoutFinalizing: true }));
    const root = view.root();
    const theCard = card(root);
    view.rerenderWith(completeProps({ checkoutFinalizing: false }));
    expect(screen.queryByText('Printing receipt…')).toBeNull();
    view.rerenderWith(completeProps({ checkoutFinalizing: true }));
    expect(screen.getByText('Printing receipt…')).toBeInTheDocument();
    expect(view.root()).toBe(root);
    expect(card(view.root())).toBe(theCard);
  });

  it('is never shown on the payment phase, whatever checkoutFinalizing says', () => {
    renderMarkup(makeProps({ checkoutFinalizing: true }));
    expect(screen.queryByText('Printing receipt…')).toBeNull();
  });
});

// ── 11. ReceiptShareModal ───────────────────────────────────────────────────────────────
describe('11. ReceiptShareModal', () => {
  const shareInput = () => within(screen.getByRole('dialog')).getByRole('textbox');

  it('is absent while receiptShareChannel is null', () => {
    renderMarkup(completeProps());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['sms', 'Send by SMS', 'tel'],
    ['whatsapp', 'Send via WhatsApp', 'tel'],
    ['email', 'Send by Email', 'email'],
  ])('channel %s opens the configured dialog, seeded from initialValue, nested inside the complete root', (channel, title, type) => {
    const { root } = renderMarkup(completeProps({ receiptShareChannel: channel, receiptShareInitialValue: 'seed-value' }));
    const dialog = screen.getByRole('dialog', { name: title });
    expect(root().contains(dialog)).toBe(true);
    expect(shareInput().value).toBe('seed-value');
    expect(shareInput().getAttribute('type')).toBe(type);
  });

  it('is only rendered in the complete phase — a channel on the payment phase shows nothing', () => {
    renderMarkup(makeProps({ receiptShareChannel: 'sms', lastPaidInvoice: PAID }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('same channel + new initialValue does NOT re-seed (no remount; typed text survives)', () => {
    const view = renderMarkup(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(shareInput(), { target: { value: '0509999999' } });
    view.rerenderWith(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0502222222' }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(shareInput().value).toBe('0509999999');
  });

  it('key={receiptShareChannel}: a channel change remounts and re-seeds from the new initialValue', () => {
    const view = renderMarkup(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(shareInput(), { target: { value: '0509999999' } });
    view.rerenderWith(completeProps({ receiptShareChannel: 'whatsapp', receiptShareInitialValue: '0501111111' }));
    expect(screen.getByRole('dialog')).not.toBe(dialog);
    expect(dialog.isConnected).toBe(false);
    expect(shareInput().value).toBe('0501111111');
  });

  it('close-and-reopen of the same channel re-seeds (unmount on null)', () => {
    const view = renderMarkup(completeProps({ receiptShareChannel: 'email', receiptShareInitialValue: 'a@shop.test' }));
    fireEvent.change(shareInput(), { target: { value: 'typed@shop.test' } });
    view.rerenderWith(completeProps({ receiptShareChannel: null }));
    view.rerenderWith(completeProps({ receiptShareChannel: 'email', receiptShareInitialValue: 'a@shop.test' }));
    expect(shareInput().value).toBe('a@shop.test');
  });

  it('onClose is `() => setReceiptShareChannel(null)` — Close, Cancel and Escape all route to it', () => {
    const props = completeProps({ receiptShareChannel: 'sms' });
    renderMarkup(props);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.setReceiptShareChannel.mock.calls).toEqual([[null], [null], [null]]);
  });

  it('onSend is handleReceiptShareSend by reference: trimmed value, then onClose on success', async () => {
    const props = completeProps({ receiptShareChannel: 'whatsapp' });
    renderMarkup(props);
    fireEvent.change(shareInput(), { target: { value: '  0501234567  ' } });
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' })); });
    expect(props.handleReceiptShareSend.mock.calls).toEqual([['0501234567']]);
    expect(props.setReceiptShareChannel.mock.calls).toEqual([[null]]);
    expect(props.handleReceiptShareSend.mock.invocationCallOrder[0]).toBeLessThan(props.setReceiptShareChannel.mock.invocationCallOrder[0]);
  });

  it('a throwing onSend keeps the dialog open and does not clear the channel', async () => {
    const props = completeProps({ receiptShareChannel: 'email', handleReceiptShareSend: vi.fn(async () => { throw new Error('Invoice is not available to email yet.'); }) });
    renderMarkup(props);
    fireEvent.change(shareInput(), { target: { value: 'jane@shop.test' } });
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' })); });
    expect(props.setReceiptShareChannel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Invoice is not available to email yet.');
  });

  describe('harness: channel ownership and POSSales receiptShareInitialValue', () => {
    const CUSTOMER = { id: 'c-9', name: 'Jane Doe', phone: '0501234567', mobile: '0559999999', email: 'jane@shop.test' };

    it.each([
      ['SMS', 'Send by SMS', '0501234567'],
      ['WhatsApp', 'Send via WhatsApp', '0501234567'],
      ['Email', 'Send by Email', 'jane@shop.test'],
    ])('%s share button opens the modal seeded from the paid customer', (name, title, seeded) => {
      renderHarness({ lastPaidInvoice: { ...PAID, customer: CUSTOMER } });
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
      expect(shareInput().value).toBe(seeded);
    });

    it.each([
      ['walk-in customer', { id: 'walk-in', phone: '0501234567', email: 'w@shop.test' }, 'sms', ''],
      ['no customer', null, 'email', ''],
      ['phone falls back to mobile', { id: 'c-9', mobile: '0559999999' }, 'whatsapp', '0559999999'],
      ['email channel never falls back to phone', { id: 'c-9', phone: '0501234567' }, 'email', ''],
    ])('seeding: %s', (_label, customer, channel, seeded) => {
      renderHarness({ lastPaidInvoice: { ...PAID, customer }, receiptShareChannel: channel });
      expect(shareInput().value).toBe(seeded);
    });

    it('switching SMS → Email while open remounts and re-seeds to the email address', () => {
      renderHarness({ lastPaidInvoice: { ...PAID, customer: CUSTOMER }, receiptShareChannel: 'sms' });
      fireEvent.change(shareInput(), { target: { value: '0500000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Email' }));
      expect(screen.getByRole('dialog', { name: 'Send by Email' })).toBeInTheDocument();
      expect(shareInput().value).toBe('jane@shop.test');
    });
  });
});

// ── 12. complete-screen Print Receipt ───────────────────────────────────────────────────
describe('12. complete-screen Print Receipt', () => {
  const clickPrint = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Print Receipt' })); });
    await flush();
  };
  const THERMAL_ARG_KEYS = [
    'full', 'cashGiven', 'changeAmount', 'customerNameOverride', 'customerPhone', 'customerEmail', 'customerTrn',
    'customerAddress', 'creditPreviousBalance', 'creditInvoiceCredit', 'creditAmountPaid', 'creditUpdatedBalance',
  ];

  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('A. thermal branch (tplInvoicePaper !== "A4")', () => {
    it('fetches the full invoice, builds thermal artifacts with the exact 12-key argument, then prints', async () => {
      const props = completeProps();
      renderMarkup(props);
      await clickPrint();

      expect(props.getSalesInvoiceById.mock.calls).toEqual([[987]]);
      expect(props.buildThermalReceiptArtifacts).toHaveBeenCalledTimes(1);
      const arg = props.buildThermalReceiptArtifacts.mock.calls[0][0];
      expect(Object.keys(arg)).toEqual(THERMAL_ARG_KEYS);
      expect(arg.full).toBe(FULL);
      expect(arg).toEqual({
        full: FULL, cashGiven: 105, changeAmount: 5, customerNameOverride: null,
        customerPhone: undefined, customerEmail: undefined, customerTrn: undefined, customerAddress: undefined,
        creditPreviousBalance: null, creditInvoiceCredit: null, creditAmountPaid: null, creditUpdatedBalance: null,
      });
      expect(props.printThermalReceiptWithConfiguredPrinter.mock.calls).toEqual([[
        { full: FULL, text: 'RECEIPT TEXT', escPosBase64: 'RVNDUE9T', title: 'Receipt SI-POS-000123' },
      ]]);
      expect(props.buildThermalReceiptArtifacts.mock.invocationCallOrder[0])
        .toBeLessThan(props.printThermalReceiptWithConfiguredPrinter.mock.invocationCallOrder[0]);
    });

    it.each(['paymentBlock', 'depositApplied', 'balanceDue', 'shippingCharge', 'isReprint', 'cashierNameOverride'])(
      'KNOWN GAP: omits %s from the thermal build argument', async (key) => {
        const props = completeProps({ lastPaidInvoice: { ...PAID, depositAmount: 20, shippingCharge: 15 }, shippingCharge: '15' });
        renderMarkup(props);
        await clickPrint();
        expect(props.buildThermalReceiptArtifacts.mock.calls[0][0]).not.toHaveProperty(key);
      },
    );

    it('forwards a named customer and the credit snapshot with `?? null` semantics (zero survives)', async () => {
      const customer = { id: 'c-9', name: 'Jane Doe', phone: '0501234567', email: 'jane@shop.test', trn: 'TRN-9', address: 'Marina' };
      const props = completeProps({
        lastPaidInvoice: { ...PAID, customer, creditPreviousBalance: 0, creditInvoiceCredit: 40, creditAmountPaid: undefined, creditUpdatedBalance: 140 },
      });
      renderMarkup(props);
      await clickPrint();
      expect(props.buildThermalReceiptArtifacts.mock.calls[0][0]).toEqual({
        full: FULL, cashGiven: 105, changeAmount: 5, customerNameOverride: 'Jane Doe',
        customerPhone: '0501234567', customerEmail: 'jane@shop.test', customerTrn: 'TRN-9', customerAddress: 'Marina',
        creditPreviousBalance: 0, creditInvoiceCredit: 40, creditAmountPaid: null, creditUpdatedBalance: 140,
      });
    });

    it('title trims to "Receipt" when the full invoice has no number', async () => {
      const props = completeProps({ getSalesInvoiceById: vi.fn(async () => ({ id: 987 })) });
      renderMarkup(props);
      await clickPrint();
      expect(props.printThermalReceiptWithConfiguredPrinter.mock.calls[0][0].title).toBe('Receipt');
    });

    it('never touches the A4 helpers, any setter, or a cash drawer', async () => {
      const props = completeProps({ openCashDrawer: vi.fn() });
      renderMarkup(props);
      await clickPrint();
      for (const fn of ['resolveInvoiceA4TemplateFor', 'buildPosPrintData', 'isTaxInvoiceDocument', 'generateDocumentPrintHtml', 'printHtml', 'openCashDrawer',
        'setShowPaymentDialog', 'setCheckoutPhase', 'setCheckoutFinalizing', 'setReceiptShareChannel']) {
        expect(props[fn], fn).not.toHaveBeenCalled();
      }
    });

    it('is a no-op without lastPaidInvoice.invoice.id', async () => {
      const props = completeProps({ lastPaidInvoice: { ...PAID, invoice: null } });
      renderMarkup(props);
      await clickPrint();
      expect(props.getSalesInvoiceById).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it('KNOWN GAP: no in-flight guard — a double click fetches and prints twice', async () => {
      const fetch = deferred();
      const props = completeProps({ getSalesInvoiceById: vi.fn(() => fetch.promise) });
      renderMarkup(props);
      const button = screen.getByRole('button', { name: 'Print Receipt' });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(button.disabled).toBe(false);
      expect(props.getSalesInvoiceById).toHaveBeenCalledTimes(2);
      await act(async () => { fetch.resolve(FULL); });
      await flush();
      expect(props.buildThermalReceiptArtifacts).toHaveBeenCalledTimes(2);
      expect(props.printThermalReceiptWithConfiguredPrinter).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['fetch', { getSalesInvoiceById: vi.fn(async () => { throw new Error('offline'); }) }, 'Print failed: offline.'],
      ['build', { buildThermalReceiptArtifacts: vi.fn(async () => { throw new Error('bad template'); }) }, 'Print failed: bad template.'],
      ['print', { printThermalReceiptWithConfiguredPrinter: vi.fn(async () => { throw new Error('No printer'); }) }, 'Print failed: No printer.'],
      ['message-less', { getSalesInvoiceById: vi.fn(async () => { throw {}; }) }, 'Print failed: printer error.'],
    ])('a %s failure warns and alerts, and leaves the screen open', async (_label, overrides, message) => {
      const props = completeProps(overrides);
      const { root } = renderMarkup(props);
      await clickPrint();
      expect(console.warn).toHaveBeenCalledWith('POS print error', expect.anything());
      expect(globalThis.alert.mock.calls).toEqual([[message]]);
      expect(cls(root())).toBe(COMPLETE_ROOT_CLASS);
    });
  });

  describe('B. A4 branch (tplInvoicePaper === "A4")', () => {
    const OPTIONS = {
      companyProfile: {
        companyName: 'Main Outlet', trn: '100200300400003', address: 'Dubai', phone: '04-000000', currency: 'AED',
        logoUrl: 'company-logo.png', stampUrl: undefined, showStampInPrint: false,
      },
    };

    it('resolves the template, builds print data with the tax header, and prints generateDocumentPrintHtml(template, data, options)', async () => {
      const props = completeProps({ tplInvoicePaper: 'A4' });
      renderMarkup(props);
      await clickPrint();
      expect(props.getSalesInvoiceById.mock.calls).toEqual([[987]]);
      expect(props.resolveInvoiceA4TemplateFor.mock.calls).toEqual([[FULL]]);
      expect(props.isTaxInvoiceDocument.mock.calls).toEqual([[FULL]]);
      expect(props.buildPosPrintData.mock.calls).toEqual([[FULL, props.tplInvoiceFooter, props.customerOptions, 'INVOICE-HEADER']]);
      expect(props.generateDocumentPrintHtml.mock.calls).toEqual([[{ id: 'tpl-a4' }, { printData: true }, OPTIONS]]);
      expect(Object.keys(props.generateDocumentPrintHtml.mock.calls[0][2].companyProfile)).toEqual(
        ['companyName', 'trn', 'address', 'phone', 'currency', 'logoUrl', 'stampUrl', 'showStampInPrint'],
      );
      expect(props.printHtml.mock.calls).toEqual([['<html>a4</html>']]);
      expect(props.buildThermalReceiptArtifacts).not.toHaveBeenCalled();
      expect(props.printThermalReceiptWithConfiguredPrinter).not.toHaveBeenCalled();
    });

    it('a non-tax document uses the receipt header', async () => {
      const props = completeProps({ tplInvoicePaper: 'A4', isTaxInvoiceDocument: vi.fn(() => false) });
      renderMarkup(props);
      await clickPrint();
      expect(props.buildPosPrintData.mock.calls[0][3]).toBe('RECEIPT-HEADER');
    });

    it('KNOWN BEHAVIOUR: generateDocumentPrintHtml is used synchronously — a returned promise is handed to printHtml unawaited', async () => {
      const pending = new Promise(() => {});
      const props = completeProps({ tplInvoicePaper: 'A4', generateDocumentPrintHtml: vi.fn(() => pending) });
      renderMarkup(props);
      await clickPrint();
      expect(props.printHtml).toHaveBeenCalledTimes(1);
      expect(props.printHtml.mock.calls[0][0]).toBe(pending);
    });

    it.each([
      ['data-url logo wins over company logo', { tplLogoDataUrl: 'data:logo' }, { logoUrl: 'data:logo' }],
      ['no logo anywhere → undefined', { company: null }, { logoUrl: undefined }],
      ['stamp data url is forwarded', { tplStampDataUrl: 'data:stamp' }, { stampUrl: 'data:stamp', showStampInPrint: true }],
      ['legacy template uses tplInvoiceShowStamp', { USE_NEW_POS_PRINT_TEMPLATE: false, tplInvoiceShowStamp: true }, { showStampInPrint: true }],
      ['legacy template, stamp toggle off', { USE_NEW_POS_PRINT_TEMPLATE: false, tplInvoiceShowStamp: false, tplStampDataUrl: 'data:stamp' }, { showStampInPrint: false }],
    ])('options: %s', async (_label, overrides, expected) => {
      const props = completeProps({ tplInvoicePaper: 'A4', ...overrides });
      renderMarkup(props);
      await clickPrint();
      expect(props.generateDocumentPrintHtml.mock.calls[0][2].companyProfile).toMatchObject({ currency: 'AED', ...expected });
    });

    it('never kicks a drawer or closes the screen', async () => {
      const props = completeProps({ tplInvoicePaper: 'A4', openCashDrawer: vi.fn() });
      renderMarkup(props);
      await clickPrint();
      expect(props.openCashDrawer).not.toHaveBeenCalled();
      expect(props.setShowPaymentDialog).not.toHaveBeenCalled();
    });

    it('the paper check is strict: lowercase "a4" takes the thermal branch', async () => {
      const props = completeProps({ tplInvoicePaper: 'a4' });
      renderMarkup(props);
      await clickPrint();
      expect(props.resolveInvoiceA4TemplateFor).not.toHaveBeenCalled();
      expect(props.buildThermalReceiptArtifacts).toHaveBeenCalledTimes(1);
    });

    it('a synchronous render failure goes through the same alert path', async () => {
      const props = completeProps({ tplInvoicePaper: 'A4', generateDocumentPrintHtml: vi.fn(() => { throw new Error('template missing'); }) });
      renderMarkup(props);
      await clickPrint();
      expect(props.printHtml).not.toHaveBeenCalled();
      expect(globalThis.alert.mock.calls).toEqual([['Print failed: template missing.']]);
    });
  });
});

// ── 13. A4 preview ──────────────────────────────────────────────────────────────────────
describe('13. checkout preview column', () => {
  it('with showA4CheckoutPreview false, the thermal 80mm preview renders even when A4 html/blob exist', () => {
    const { root } = renderMarkup(makeProps({ checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' }));
    expect(cls(leftPanel(root()))).toBe(LEFT_THERMAL_CLASS);
    const preview = screen.getByTestId('thermal-preview');
    expect(preview.dataset).toMatchObject({ src: 'blob:thermal-preview', paper: '80mm' });
    expect(leftPanel(root()).children).toHaveLength(1);
    expect(screen.queryByTestId('a4-preview')).toBeNull();
  });

  it('without a thermal blob it shows the "Add items to preview" placeholder', () => {
    const { root } = renderMarkup(makeProps({ checkoutPreviewBlobUrl: null, checkoutA4Html: '<html>a4</html>' }));
    const placeholder = leftPanel(root()).children[0];
    expect(cls(placeholder)).toBe('flex-1 flex flex-col items-center justify-center text-gray-300');
    expectIcon(placeholder.querySelector('svg'), ShoppingCart, 'h-10 w-10 mb-2');
    expect(placeholder).toHaveTextContent('Add items to preview');
    expect(screen.queryByTestId('thermal-preview')).toBeNull();
  });

  it('(dormant branch, only reachable by flipping the constant) the A4 preview would render with fillWidth and the wider column', () => {
    const { root } = renderMarkup(makeProps({ showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' }));
    expect(cls(leftPanel(root()))).toBe(LEFT_A4_CLASS);
    expect(screen.getByTestId('a4-preview').dataset).toMatchObject({ src: 'blob:a4', fillWidth: 'true' });
    expect(screen.queryByTestId('thermal-preview')).toBeNull();
  });
});

// ── 14. payments / nested structure ─────────────────────────────────────────────────────
describe('14. PaymentAllocationPanel wiring and native <details> state', () => {
  it('receives exactly the eight props, unchanged', () => {
    const props = makeProps({ selectedCustomer: 'c-9', selectedCustomerData: { id: 'c-9', name: 'Jane Doe' }, checkoutOnlineBankAccountsLoading: true });
    renderMarkup(props);
    const panel = lastPanelProps();
    expect(Object.keys(panel)).toEqual(['payment', 'compatibility', 'customers', 'onCustomerCreated', 'selectedCustomerId', 'selectedCustomerName', 'bankAccounts', 'bankAccountsLoading']);
    expect(panel.payment).toBe(props.checkoutPayment);
    expect(panel.compatibility).toBe(props.checkoutCompatibility);
    expect(panel.customers).toBe(props.customerOptions);
    expect(panel.onCustomerCreated).toBe(props.loadPosCustomers);
    expect(panel.selectedCustomerId).toBe('c-9');
    expect(panel.selectedCustomerName).toBe('Jane Doe');
    expect(panel.bankAccounts).toBe(props.checkoutOnlineBankAccounts);
    expect(panel.bankAccountsLoading).toBe(true);
  });

  it('selectedCustomerName is undefined when there is no selected customer data', () => {
    renderMarkup(makeProps({ selectedCustomerData: null }));
    expect(lastPanelProps().selectedCustomerName).toBeUndefined();
  });

  it('a stable panel is not remounted by a parent re-render', () => {
    const view = renderMarkup(makeProps({ PaymentAllocationPanel: MountProbePanel }));
    view.rerenderWith(makeProps({ PaymentAllocationPanel: MountProbePanel, checkoutRemarks: 'x', checkoutError: 'e' }));
    expect(panelMounts.count).toBe(1);
  });

  it('an opened <details> stays open across re-renders of the complete phase', () => {
    const view = renderMarkup(completeProps());
    const details = detailsEl(view.root());
    details.open = true;
    view.rerenderWith(completeProps({ checkoutFinalizing: true }));
    view.rerenderWith(completeProps({ checkoutFinalizing: false, receiptShareChannel: 'sms' }));
    expect(detailsEl(view.root())).toBe(details);
    expect(details.open).toBe(true);
  });

  it('leaving the complete phase discards it; the next complete screen starts closed', () => {
    const view = renderMarkup(completeProps());
    detailsEl(view.root()).open = true;
    view.rerenderWith(makeProps({ lastPaidInvoice: PAID }));
    view.rerenderWith(completeProps());
    expect(detailsEl(view.root()).open).toBe(false);
  });
});

// ── 15. one-second tick ─────────────────────────────────────────────────────────────────
describe('15. the POSSales one-second session tick', () => {
  const OPEN_SESSION = { id: 11, status: 'OPEN', openedAt: '2026-09-14T08:00:00Z' };

  it('re-renders every second without remounting the complete root, the open <details> or the share modal', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { root } = renderHarness({ currentSession: OPEN_SESSION, receiptShareChannel: 'sms' });
    const before = { root: root(), details: detailsEl(root()), dialog: screen.getByRole('dialog') };
    before.details.open = true;
    fireEvent.change(within(before.dialog).getByRole('textbox'), { target: { value: '0507777777' } });
    const tick0 = screen.getByTestId('tick').textContent;

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByTestId('tick').textContent).not.toBe(tick0);
    expect(root()).toBe(before.root);
    expect(detailsEl(root())).toBe(before.details);
    expect(before.details.open).toBe(true);
    expect(screen.getByRole('dialog')).toBe(before.dialog);
    expect(within(before.dialog).getByRole('textbox').value).toBe('0507777777');
  });

  it('re-renders every second without remounting the payment root, the remarks input or the panel', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { root } = renderHarness({ currentSession: OPEN_SESSION, checkoutPhase: 'payment', lastPaidInvoice: null }, { PaymentAllocationPanel: MountProbePanel });
    const before = { root: root(), input: remarksInput(), panel: screen.getByTestId('allocation-panel') };
    const tick0 = screen.getByTestId('tick').textContent;

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByTestId('tick').textContent).not.toBe(tick0);
    expect(root()).toBe(before.root);
    expect(remarksInput()).toBe(before.input);
    expect(screen.getByTestId('allocation-panel')).toBe(before.panel);
    expect(panelMounts.count).toBe(1);
  });
});

// ── 16. orders-list open edge case ──────────────────────────────────────────────────────
describe('16. openers', () => {
  it('handleCheckout resets the phase before opening', () => {
    const { log, root } = renderHarness({ showPaymentDialog: false, checkoutPhase: 'complete' });
    fireEvent.click(screen.getByTestId('open-checkout'));
    expect(log).toEqual([['setCheckoutPhase', 'payment'], ['setShowPaymentDialog', true]]);
    expect(cls(root())).toBe(PAYMENT_ROOT_CLASS);
  });

  it('KNOWN EDGE: the orders-list opener sets showPaymentDialog alone, so a stale "complete" phase re-shows the previous sale', async () => {
    // Characterized, not endorsed. This opener does not reset the phase, so opening an order while
    // the previous sale's "complete" screen is still the phase re-shows that sale instead of the
    // payment screen. Recorded here as existing behaviour the decomposition preserved verbatim.
    const { log, base, root } = renderHarness({ showPaymentDialog: false, checkoutPhase: 'complete' });
    await act(async () => { fireEvent.click(screen.getByTestId('orders-list-checkout')); });
    expect(base.handleOpenOrder).toHaveBeenCalledTimes(1);
    expect(log).toEqual([['setShowPaymentDialog', true]]);
    expect(cls(root())).toBe(COMPLETE_ROOT_CLASS);
  });

  it('the orders-list opener awaits handleOpenOrder before opening', async () => {
    const open = deferred();
    const { root } = renderHarness({ showPaymentDialog: false, checkoutPhase: 'payment' }, { handleOpenOrder: vi.fn(() => open.promise) });
    fireEvent.click(screen.getByTestId('orders-list-checkout'));
    expect(root()).toBeNull();
    await act(async () => { open.resolve(); });
    expect(cls(root())).toBe(PAYMENT_ROOT_CLASS);
  });
});

// ── 17. failure routing visible to JSX ──────────────────────────────────────────────────
describe('17. rendered failure consequences', () => {
  it('checkoutError renders in the footer with AlertCircle, above the action row', () => {
    const { root } = renderMarkup(makeProps({ checkoutError: 'The sale was NOT recorded.' }));
    const error = rightFooter(root()).children[0];
    expect(cls(error)).toBe(ERROR_CLASS);
    expectIcon(error.querySelector('svg'), AlertCircle, 'h-4 w-4 shrink-0');
    expect(error.textContent).toBe('The sale was NOT recorded.');
    expect(cls(error.nextElementSibling)).toBe(ACTIONS_CLASS);
  });

  it('change due renders from checkoutPaymentFields.changeDue only when positive', () => {
    const { root } = renderMarkup(makeProps({ checkoutPaymentFields: { changeDue: 12.345 } }));
    const change = rightFooter(root()).children[0];
    expect(cls(change)).toBe(CHANGE_DUE_CLASS);
    expect(change.children[0].textContent).toBe('Change Due');
    expect(change.children[1].textContent.trim()).toBe('12.35');
    cleanup();
    renderMarkup(makeProps({ checkoutPaymentFields: { changeDue: 0 } }));
    expect(screen.queryByText('Change Due')).toBeNull();
  });

  it('a failure that closes the dialog (setShowPaymentDialog(false)) unmounts the whole checkout root', () => {
    const view = renderMarkup(makeProps({ checkoutError: 'x' }));
    view.rerenderWith(makeProps({ checkoutError: 'x', showPaymentDialog: false }));
    expect(view.container.innerHTML).toBe('');
  });
});

// ── payment header and settlement summary ───────────────────────────────────────────────
describe('payment header and settlement summary', () => {
  const headerCaption = (root) => rightHeader(root).children[0].querySelectorAll('p')[1].textContent;
  const headerTotal = (root) => rightHeader(root).children[1].children[0];

  it.each([
    [2, 'SI-POS-000124', '2 items · SI-POS-000124'],
    [1, 'SI-POS-000124', '1 item · SI-POS-000124'],
    [0, '', '0 items'],
    [3, null, '3 items'],
  ])('caption for %s items and invoice no %s', (count, previewInvoiceNo, caption) => {
    const { root } = renderMarkup(makeProps({ previewInvoiceNo, currentInvoice: { items: Array.from({ length: count }, (_, i) => ({ id: i })), total: 100 } }));
    expect(headerCaption(root())).toBe(caption);
    expectIcon(rightHeader(root()).querySelector('svg'), CreditCard, 'h-5 w-5 text-[#F5C742]');
  });

  it.each([
    ['no deposit → Total Amount = items + shipping', { shippingCharge: '15', checkoutEffectiveDue: 999 }, 'Total Amount', '115.00'],
    ['non-numeric shipping counts as 0', { shippingCharge: 'abc' }, 'Total Amount', '100.00'],
    ['deposit → Balance Due = checkoutEffectiveDue', { activeLayawayDeposit: 30, checkoutEffectiveDue: 70 }, 'Balance Due', '70.00'],
    ['a negative deposit is ignored', { activeLayawayDeposit: -5, checkoutEffectiveDue: 70 }, 'Total Amount', '100.00'],
  ])('header total: %s', (_label, overrides, label, amount) => {
    const { root } = renderMarkup(makeProps(overrides));
    expect(headerTotal(root()).children[0].textContent).toBe(label);
    expect(headerTotal(root()).children[1].textContent.trim()).toBe(amount);
  });

  it('settlement summary is absent without shipping or deposit', () => {
    renderMarkup(makeProps());
    expect(screen.queryByText('Settlement Summary')).toBeNull();
  });

  it.each([
    ['shipping only', { shippingCharge: '15', checkoutEffectiveDue: 115 }, [['Items Total', '100.00'], ['Shipping', '15.00'], ['Order Total', '115.00'], ['Total Payable', '115.00']]],
    ['deposit only', { activeLayawayDeposit: 30, checkoutEffectiveDue: 70 }, [['Items Total', '100.00'], ['Order Total', '100.00'], ['Deposit Paid', '− 30.00'], ['Balance Due Now', '70.00']]],
    ['both', { shippingCharge: 10, activeLayawayDeposit: 30, checkoutEffectiveDue: 80 }, [['Items Total', '100.00'], ['Shipping', '10.00'], ['Order Total', '110.00'], ['Deposit Paid', '− 30.00'], ['Balance Due Now', '80.00']]],
  ])('settlement summary rows: %s', (_label, overrides, rows) => {
    renderMarkup(makeProps(overrides));
    const section = screen.getByText('Settlement Summary').parentElement;
    expect(cls(section)).toBe(SUMMARY_CLASS);
    const rendered = Array.from(section.children[1].children).map((r) => [r.children[0].textContent, r.children[1].textContent.replace(/\s+/g, ' ').trim()]);
    expect(rendered).toEqual(rows);
  });

  it('uses the real CurrencyAmount/DirhamSymbol for the figures', () => {
    const { root } = renderMarkup(makeProps());
    const figure = headerTotal(root()).children[1].children[0];
    const reference = document.createElement('div');
    const refView = render(<CurrencyAmount amount={100} />, { container: reference });
    expect(figure.outerHTML).toBe(reference.firstElementChild.outerHTML);
    refView.unmount();
    expect(typeof DirhamSymbol).toBe('function');
    expect(paymentBlockRows(PAYMENT_BLOCK).map((r) => r.label)).toEqual(['Cash', 'Visa Card', 'Change Returned', 'Total Received']);
  });
});

// ── 18. source anchors ──────────────────────────────────────────────────────────────────
/**
 * POSSales.jsx is not rendered by this project's test setup, so the copied region, the harness
 * bodies and every source-placement anchor other suites depend on are asserted against source.
 */
// EOL-normalised: sources are checked out with CRLF on Windows.
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const REGION_START = '      {/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}\n';
const REGION_END = '\n      })()}';
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};
const block = (src, startLine, endLine) => {
  const i = src.indexOf(startLine);
  expect(i, startLine).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(endLine, i);
  expect(j, endLine).toBeGreaterThan(i);
  return src.slice(i, j + endLine.length);
};
const region = () => block(POS_SALES, REGION_START, REGION_END);
const codeLines = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('// eslint-disable'));
const count = (src, needle) => src.split(needle).length - 1;

describe('18. source anchors — the copy', () => {
  it('the verbatim copy is the live POSSales checkout region, byte for byte (203 lines)', () => {
    const copy = between(SELF, '{/* VERBATIM-START */}\n', '\n      {/* VERBATIM-END */}');
    expect(copy).toBe(region());
    // 423 before the complete-phase summary body moved to CheckoutCompleteSummary (109 lines → a 6-line call);
    // 320 before the action block moved to CheckoutCompleteActions (60 lines → a 28-line call whose
    // onPrintReceipt prop keeps the Print Receipt async body in POSSales);
    // 288 before the payment-phase settlement summary card moved to CheckoutSettlementSummary
    // (29 lines → a 7-line call; the guard stays in POSSales);
    // 266 before the payment-phase header bar moved to CheckoutPaymentHeader (20 lines → an 8-line
    // call; the derived figures and the setShowPaymentDialog(false) callback stay in POSSales);
    // 254 before the payment-phase settlement footer moved to CheckoutPaymentFooter (51 lines → a
    // 14-line call; the Cancel arrow and the zero-argument Settle arrow stay in POSSales);
    // 217 before the payment-phase Remarks card moved to CheckoutRemarks (6 lines → a 4-line call;
    // the Remarks comment and the surrounding blank lines stay in POSSales);
    // 215 before the preview column's inner content moved to CheckoutPaymentPreview (18 lines → a
    // 6-line call; the outer column <div> and its class template stay in POSSales).
    expect(region().split('\n')).toHaveLength(203);
    expect(count(region(), '<CheckoutPaymentPreview\n')).toBe(1);
    expect(region()).toContain("              'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'\n            }`}>\n              <CheckoutPaymentPreview\n                showA4CheckoutPreview={showA4CheckoutPreview}\n                checkoutA4Html={checkoutA4Html}\n                checkoutA4BlobUrl={checkoutA4BlobUrl}\n                checkoutPreviewBlobUrl={checkoutPreviewBlobUrl}\n              />\n            </div>\n\n            {/* ══ RIGHT: Payment & Settlement");
    expect(region()).not.toMatch(/<A4ScaledPreview|<ThermalScaledPreview|Add items to preview/);
    expect(count(region(), '<CheckoutPaymentFooter\n')).toBe(1);
    expect(region()).toContain('                onSettle={() => processPayment()}\n              />\n\n            </div>\n          </div>\n        );\n      })()}');
    expect(count(region(), '<CheckoutCompleteSummary\n')).toBe(1);
    expect(count(region(), '<CheckoutCompleteActions\n')).toBe(1);
    expect(count(region(), '<CheckoutSettlementSummary\n')).toBe(1);
    expect(count(region(), '<CheckoutPaymentHeader\n')).toBe(1);
    expect(region()).toContain('            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">\n\n              {/* Right header */}\n              <CheckoutPaymentHeader\n');
    expect(region()).toContain('                onClose={() => setShowPaymentDialog(false)}\n              />\n\n              <div className="flex-1 overflow-y-auto">\n                <div className="p-4 space-y-3">\n\n                  {/* ── Settlement summary (shipping and/or layaway-hold deposit) ── */}\n');
    expect(count(region(), '                  {(depositAmt > 0 || shippingChargeNum > 0) && (\n                    <CheckoutSettlementSummary\n')).toBe(1);
    expect(count(region(), '                      itemsTotal={currentInvoice.total || 0}\n')).toBe(1);
    expect(count(region(), '                    />\n                  )}\n\n                  {/* ══ Progressive Payment Allocation ══')).toBe(1);
    expect(count(region(), 'onNewSale={closeComplete}\n')).toBe(1);
    expect(count(region(), '                  onPrintReceipt={async () => {\n')).toBe(1);
    expect(count(region(), '                  onReprint={() => {\n                    closeComplete();\n                    setShowReprintModal(true);\n                  }}\n')).toBe(1);
    expect(count(region(), 'onShare={(key) => setReceiptShareChannel(key)}')).toBe(1);
    expect(region()).toContain('                  onShare={(key) => setReceiptShareChannel(key)}\n                />\n              </div>\n\n              {/* Share Receipt dialog — one component, three configured channels. */}\n              {receiptShareChannel && (\n                <ReceiptShareModal');
    expect(count(POS_SALES, REGION_START)).toBe(1);
    expect(count(POS_SALES, '{showPaymentDialog && (() => {')).toBe(1);
  });

  it.each([
    ['SHARE-INITIAL', '  const receiptShareInitialValue = useMemo(() => {', '\n  }, [lastPaidInvoice, receiptShareChannel]);'],
    ['HANDLE-CHECKOUT', '  const handleCheckout = useCallback(() => {', '\n  }, []);'],
    ['ORDERS-CHECKOUT', '        const handleCheckout = async () => {', '\n        };'],
    ['TICK', '  useEffect(() => {\n    const isActive = currentSession?.status === \'OPEN\'', '\n  }, [currentSession?.id, currentSession?.openedAt, currentSession?.status]);'],
  ])('harness block %s is identical to POSSales', (marker, start, end) => {
    const copy = between(SELF, `// ${marker}-START\n`, `// ${marker}-END`);
    expect(codeLines(copy)).toEqual(codeLines(block(POS_SALES, start, end)));
  });
});

describe('18. source anchors — invariants the extraction must keep', () => {
  it('the IIFE closes immediately before the Supervisor PIN Dialog comment (SupervisorPinDialog suite anchor)', () => {
    const i = POS_SALES.indexOf(REGION_START) + region().length;
    expect(POS_SALES.slice(i, i + '\n\n      {/* Supervisor PIN Dialog */}'.length)).toBe('\n\n      {/* Supervisor PIN Dialog */}');
    expect(POS_SALES.slice(0, POS_SALES.indexOf(REGION_START))).toMatch(/<\/Dialog>\n\n$/);
  });

  it('JSX wiring counts', () => {
    const r = region();
    // the footer Settle now reaches processPayment() through CheckoutPaymentFooter's onSettle
    expect(count(r, 'onSettle={() => processPayment()}')).toBe(1);
    expect(count(r, 'onClick={() => processPayment()}')).toBe(0);
    expect(count(r, 'onSettle={processPayment}')).toBe(0);
    expect(count(r, 'onClick={processPayment}')).toBe(0);
    expect(count(r, '<CheckoutPaymentFooter')).toBe(1);
    // the remarks onChange arrow now lives in CheckoutRemarks, which receives the setter unchanged
    expect(count(r, 'onChange={e => setCheckoutRemarks(e.target.value)}')).toBe(0);
    expect(count(r, '                  <CheckoutRemarks\n                    checkoutRemarks={checkoutRemarks}\n                    setCheckoutRemarks={setCheckoutRemarks}\n                  />\n')).toBe(1);
    expect(count(r, 'key={receiptShareChannel}')).toBe(1);
    expect(count(r, 'onSend={handleReceiptShareSend}')).toBe(1);
    expect(count(r, 'onClose={() => setReceiptShareChannel(null)}')).toBe(1);
    expect(count(r, 'const closeComplete = () => {')).toBe(1);
    expect(r.match(/\bcloseComplete\b/g)).toHaveLength(3);
    expect(count(r, "if (checkoutPhase === 'complete' && lastPaidInvoice) {")).toBe(1);
    // the header X now reaches setShowPaymentDialog(false) through CheckoutPaymentHeader's onClose
    expect(count(r, 'onClick={() => setShowPaymentDialog(false)}')).toBe(0);
    expect(count(r, 'onClose={() => setShowPaymentDialog(false)}')).toBe(1);
    expect(count(r, '<CheckoutPaymentHeader')).toBe(1);
    // the footer Cancel keeps its three calls, in order, in POSSales — now as CheckoutPaymentFooter's onCancel
    expect(count(r, 'onClick={() => { setShowPaymentDialog(false); setCheckoutError(null); cancelCheckoutTenders(); }}')).toBe(0);
    expect(count(r, '                onCancel={() => {\n                  setShowPaymentDialog(false);\n                  setCheckoutError(null);\n                  cancelCheckoutTenders();\n                }}\n')).toBe(1);
    expect(count(r, '<PaymentAllocationPanel')).toBe(1);
    expect(count(r, '<CheckoutSettlementSummary')).toBe(1);
    expect(count(r, '<ReceiptShareModal')).toBe(1);
  });

  it('things the region deliberately does not do', () => {
    const r = region();
    for (const absent of ['openCashDrawer', 'setLastPaidInvoice', 'requestApproval', 'SupervisorPin', 'PaymentModalShell', 'createPortal', 'useState', 'useEffect', 'useMemo']) {
      expect(r, absent).not.toContain(absent);
    }
    expect(r).toContain('alert(`Print failed: ${err?.message || \'printer error\'}.`)');
    expect(r).toContain("currency: 'AED'");
    expect(r).toContain('printHtml(generateDocumentPrintHtml(template, data, options));');
  });

  it('the A4 checkout preview stays hard-disabled while its html memo and blob hook still run', () => {
    expect(count(POS_SALES, '  const showA4CheckoutPreview = false;\n')).toBe(1);
    expect(POS_SALES).toContain("  const checkoutA4Html = useMemo(() => {\n    if (!showA4CheckoutPreview) return '';\n");
    expect(count(POS_SALES, '  const checkoutA4BlobUrl = useA4BlobUrl(checkoutA4Html);\n')).toBe(1);
    expect(POS_SALES.indexOf('const checkoutA4BlobUrl = useA4BlobUrl')).toBeLessThan(POS_SALES.indexOf(REGION_START));
  });

  it('ownership outside the region: useCheckout owns phase/error/finalizing/remarks; POSSales owns channel, settling, dialog', () => {
    expect(POS_SALES).toContain([
      '  const {',
      '    checkoutLoading,',
      '    checkoutError, setCheckoutError,',
      '    checkoutPhase, setCheckoutPhase,',
      '    checkoutFinalizing, setCheckoutFinalizing,',
      '    lastPaidInvoice,',
      '    checkoutRemarks, setCheckoutRemarks,',
      '    processPayment,',
      '  } = useCheckout({',
    ].join('\n'));
    expect(count(POS_SALES, '  const [showPaymentDialog, setShowPaymentDialog] = useState(false);')).toBe(1);
    expect(count(POS_SALES, '  const [receiptShareChannel, setReceiptShareChannel] = useState(null);')).toBe(1);
    expect(count(POS_SALES, '  const [checkoutSettling, setCheckoutSettling] = useState(false);')).toBe(1);
    expect(count(POS_SALES, '  const cancelCheckoutTenders = useCallback(() => {')).toBe(1);
    expect(count(POS_SALES, '  const handleReceiptShareSend = useCallback(async (value) => {')).toBe(1);
    expect(POS_SALES).toContain('  useEffect(() => {\n    if (!showPaymentDialog && checkoutSettling) setCheckoutSettling(false);\n  }, [showPaymentDialog, checkoutSettling]);');
  });

  it('PaymentModalShell reaches the checkout root only through PaymentAllocationPanel, rendered inline (no portal)', () => {
    const PANEL = readSource('../payments/PaymentAllocationPanel.jsx');
    for (const modal of ['CashPaymentModal', 'CardPaymentModal', 'OnlinePaymentModal', 'CreditPaymentModal', 'VoucherPaymentModal', 'BnplPaymentModal']) {
      expect(PANEL, modal).toContain(`import ${modal} from './modals/${modal}';`);
      expect(readSource(`../payments/modals/${modal}.jsx`), modal).not.toContain('createPortal');
    }
    expect(PANEL).not.toContain('createPortal');
    expect(readSource('../payments/modals/PaymentModalShell.jsx')).not.toContain('createPortal');
    expect(readSource('../../../../components/pos/ReceiptShareModal.jsx')).not.toContain('createPortal');
  });
});

describe('18. source anchors — other suites that depend on checkout placement (inventory, read-only)', () => {
  it('SupervisorPinDialog suite pins the IIFE close + comment adjacency and CHECKOUT SCREEN ordering', () => {
    const suite = readSource('./SupervisorPinDialog.characterization.test.jsx');
    expect(suite).toContain("it('sits between the checkout-screen IIFE and CashDropDialog, behind its comment, with two blank lines after'");
    expect(suite).toContain(String.raw`/\n {6}\}\)\(\)\}\n\n {6}\{\/\* Supervisor PIN Dialog \*\/\}\n`);
    expect(suite).toContain("expect(POS_SALES.indexOf('{/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}')).toBeLessThan(POS_SALES.indexOf('{/* Supervisor PIN Dialog */}'));");
    // its HANDLER copy binds processPayment into handleSupervisorPinSubmit
    expect(between(suite, '// HANDLER-START\n', '  // HANDLER-END')).toContain('    processPayment,\n');
  });

  it('usePosSession suite requires the useCheckout destructure before sessionLifecycleHandlersRef.current', () => {
    const suite = readSource('../../__tests__/usePosSession.characterization.test.js');
    expect(suite).toContain("'checkoutPhase, setCheckoutPhase,', 'checkoutError, setCheckoutError,'");
    expect(POS_SALES.indexOf('    checkoutPhase, setCheckoutPhase,')).toBeLessThan(POS_SALES.indexOf('  sessionLifecycleHandlersRef.current = {'));
  });

  it('useSupervisorApproval suite exercises the CHECKOUT continuation into processPayment', () => {
    const suite = readSource('../../__tests__/useSupervisorApproval.characterization.test.js');
    expect(suite).toContain("it('pendingPriceOverride CHECKOUT → processPayment carrying the verified credential'");
  });
});
