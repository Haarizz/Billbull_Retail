import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CheckCircle } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Characterization of the REMAINING (still-inline) JSX of the POSSales.jsx checkout COMPLETE phase,
 * region by region, to choose the next extraction boundary. READ-ONLY: no production file is
 * touched and nothing is extracted here.
 *
 * Candidate regions of the complete branch, top to bottom:
 *   C0  guard + closeComplete + derivation  `if (checkoutPhase === 'complete' …)` → `usedMethods`  (logic, not JSX)
 *   C1  complete root                       `<div className="fixed inset-0 z-50 …">`               (must not change)
 *   C2  card                                `<div className="bg-white rounded-3xl …">`             (must not change)
 *   C3  success header                      `{/* 1. Redesigned Success Header *}` → its `</div>`
 *   C4  Amount Paid band                    `{/* 2. Amount Paid …*}` → its `</div>`
 *   C5  finalize indicator                  `{/* Background finalize indicator *}` → `)}`
 *   C6  CheckoutCompleteSummary call        (already extracted — call site only)
 *   C7  CheckoutCompleteActions call        (already extracted — call site, keeps the print body)
 *   C8  ReceiptShareModal                   the guard, the key and the two callbacks
 *
 * Structure: `OriginalCheckoutMarkup` is the POSSales region copied VERBATIM (enforced byte for
 * byte by §1). Every closure read is lifted to a prop under its original name; the lucide icons,
 * DirhamSymbol, WALK_IN_CUSTOMER, paymentBlockRows, ReceiptShareModal and the already-extracted
 * Checkout* components are the real modules. CheckoutCompleteSummary / CheckoutCompleteActions are
 * wrapped in pass-through spies so the call-site props can be read without changing what renders.
 *
 * Deliberately NOT repeated (owned elsewhere): the phase guard, root DOM reuse, z-index, the
 * closeComplete setter sequence, the summary/actions/indicator markup, the ReceiptShareModal
 * seeding rules and the Print Receipt argument payloads — CheckoutScreen.characterization.test.jsx,
 * CheckoutCompleteSummary.characterization.test.jsx and CheckoutCompleteActions.characterization.
 * test.jsx. This suite covers per-region DOM identity, dependency surface and lifecycle edges.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - A non-numeric lastPaidInvoice.paidAmount/total throws out of render (`.toFixed` is not a
 *     function): the complete screen has no error boundary of its own.
 *   - paymentRows/usedMethods are re-derived on every render — the two child components receive
 *     brand-new array references each time, and closeComplete is a new function each time.
 *   - The complete branch never reads checkoutLoading: nothing on the screen disables while a
 *     manual Print Receipt is in flight, and the "Printing receipt…" indicator is driven only by
 *     checkoutFinalizing (set by useCheckout's auto-print), never by the manual Print button.
 *   - An in-flight manual print is not cancelled by closing the screen: it still prints, and still
 *     alerts on failure, after the overlay is gone.
 */

// The preview column's inner content lives in CheckoutPaymentPreview, which imports the scaled
// previews itself; stub them at the module boundary so the payment phase renders in jsdom.
const { StubThermalScaledPreview, StubA4ScaledPreview } = vi.hoisted(() => ({
  StubThermalScaledPreview: ({ src, paperSize }) => <div data-testid="thermal-preview" data-src={src} data-paper={paperSize} />,
  StubA4ScaledPreview: ({ src, fillWidth }) => <div data-testid="a4-preview" data-src={src} data-fill-width={String(fillWidth)} />,
}));
vi.mock('../POSPrintPreview', async (importOriginal) => ({
  ...(await importOriginal()),
  A4ScaledPreview: StubA4ScaledPreview,
  ThermalScaledPreview: StubThermalScaledPreview,
}));

// Pass-through spies: the REAL components render, and their call-site props are recorded.
const { summarySpy, actionsSpy } = vi.hoisted(() => ({ summarySpy: { calls: [] }, actionsSpy: { calls: [] } }));
vi.mock('../features/checkout/CheckoutCompleteSummary', async (importOriginal) => {
  const { default: Real } = await importOriginal();
  return { default: (props) => { summarySpy.calls.push(props); return React.createElement(Real, props); } };
});
vi.mock('../features/checkout/CheckoutCompleteActions', async (importOriginal) => {
  const { default: Real } = await importOriginal();
  return { default: (props) => { actionsSpy.calls.push(props); return React.createElement(Real, props); } };
});

import ReceiptShareModal from '../../../../components/pos/ReceiptShareModal';
import { DirhamSymbol } from '../POSCurrency';
import { WALK_IN_CUSTOMER } from '../posConstants';
import { paymentBlockRows } from '../payments/paymentPresentation';
import CheckoutCompleteSummary from '../features/checkout/CheckoutCompleteSummary';
import CheckoutCompleteActions from '../features/checkout/CheckoutCompleteActions';
import CheckoutSettlementSummary from '../features/checkout/CheckoutSettlementSummary';
import CheckoutPaymentHeader from '../features/checkout/CheckoutPaymentHeader';
import CheckoutPaymentFooter from '../features/checkout/CheckoutPaymentFooter';
import CheckoutRemarks from '../features/checkout/CheckoutRemarks';
import CheckoutPaymentPreview from '../features/checkout/CheckoutPaymentPreview';

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

// ── fixtures / helpers ──────────────────────────────────────────────────────────────────
const PanelStub = () => <div data-testid="allocation-panel" />;
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
    PaymentAllocationPanel: PanelStub,
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
const attrNames = (el) => Array.from(el.attributes).map((a) => a.name).sort();
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// complete-phase anatomy — by DOM position, so a region that moved would fail loudly
const card = (root) => root.children[0];
const header = (root) => card(root).children[0];
const amount = (root) => card(root).children[1];
const indicator = (root) => (screen.queryByText('Printing receipt…') ? card(root).children[2] : null);
const summaryRegion = (root) => card(root).children[indicator(root) ? 3 : 2];
const actionsRegion = (root) => card(root).children[indicator(root) ? 4 : 3];
const shareOverlay = (root) => root.children[1] ?? null;
const button = (name) => screen.getByRole('button', { name });
const shareInput = () => within(screen.getByRole('dialog')).getByRole('textbox');

const HEADER_CLASS = 'bg-gradient-to-b from-[#F5C742] to-[#E5B532] px-6 pt-5 pb-4 text-center shrink-0';
const AMOUNT_CLASS = 'bg-[#FFFBEB] border-b border-amber-100/50 px-6 py-4 text-center shrink-0';
const INDICATOR_CLASS = 'bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-center gap-2 shrink-0';
const COMPLETE_ROOT_CLASS = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
const COMPLETE_CARD_CLASS = 'bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]';

beforeEach(() => {
  summarySpy.calls = [];
  actionsSpy.calls = [];
  vi.stubGlobal('alert', vi.fn());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── 2. per-region DOM identity ──────────────────────────────────────────────────────────
describe('2. per-region DOM identity across phase switches and re-renders', () => {
  it('payment → complete: root and card survive (card recycles the preview column); every complete region is a NEW node', () => {
    const view = renderMarkup(makeProps());
    const root = view.root();
    const previewColumn = root.children[0];
    view.rerenderWith(completeProps({ checkoutFinalizing: true }));
    expect(view.root()).toBe(root);
    expect(card(root)).toBe(previewColumn);
    expect(cls(card(root))).toBe(COMPLETE_CARD_CLASS);
    // C3/C4/C5 and the two extracted children all mount fresh: nothing below the card is reused.
    for (const region of [header(root), amount(root), indicator(root), summaryRegion(root), actionsRegion(root)]) {
      expect(region.isConnected).toBe(true);
    }
    expect(screen.queryByTestId('thermal-preview')).toBeNull();
    expect(screen.queryByTestId('allocation-panel')).toBeNull();
  });

  it('complete → payment: root and card survive, the card becoming the preview column again; the share modal unmounts', () => {
    const view = renderMarkup(completeProps({ receiptShareChannel: 'sms' }));
    const root = view.root();
    const theCard = card(root);
    const dialog = screen.getByRole('dialog');
    view.rerenderWith(makeProps({ lastPaidInvoice: PAID }));
    expect(view.root()).toBe(root);
    expect(root.children[0]).toBe(theCard);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dialog.isConnected).toBe(false);
    expect(screen.getByTestId('thermal-preview')).toBeInTheDocument();
  });

  it('within the complete phase every region keeps its node across re-renders — invoice change, finalizing toggle, channel change', () => {
    const view = renderMarkup(completeProps());
    const root = view.root();
    const nodes = { card: card(root), header: header(root), amount: amount(root), summary: summaryRegion(root), actions: actionsRegion(root) };

    view.rerenderWith(completeProps({ lastPaidInvoice: { ...PAID, id: 'SI-POS-000999', paidAmount: 7 } }));
    view.rerenderWith(completeProps({ lastPaidInvoice: { ...PAID, id: 'SI-POS-000999', paidAmount: 7 }, receiptShareChannel: 'email' }));
    expect(view.root()).toBe(root);
    expect({ card: card(root), header: header(root), amount: amount(root), summary: summaryRegion(root), actions: actionsRegion(root) }).toEqual(nodes);
    expect(header(root).children[2].textContent).toBe('SI-POS-000999');
    expect(amount(root).children[1].textContent.trim()).toBe('7.00');
  });

  it('the finalize indicator is a conditional SLOT: toggling it re-uses summary and actions rather than shifting them', () => {
    const view = renderMarkup(completeProps());
    const root = view.root();
    const summary = summaryRegion(root);
    const actions = actionsRegion(root);
    const details = root.querySelector('details');
    details.open = true;

    view.rerenderWith(completeProps({ checkoutFinalizing: true }));
    expect(card(root).children).toHaveLength(5);
    expect(summaryRegion(root)).toBe(summary);
    expect(actionsRegion(root)).toBe(actions);
    expect(root.querySelector('details').open).toBe(true);

    view.rerenderWith(completeProps({ checkoutFinalizing: false }));
    expect(card(root).children).toHaveLength(4);
    expect(summaryRegion(root)).toBe(summary);
    expect(actionsRegion(root)).toBe(actions);
    expect(root.querySelector('details').open).toBe(true);
  });

  it('HAZARD model: collapsing C3+C4+C5 into ONE component that returns a fragment does not shift the summary slot, but wrapping ONLY C3 in a component does remount it', () => {
    // Why this matters: whatever the next extraction does, the complete-phase children must keep
    // their identity across a finalizing toggle. Both shapes below are safe on that count; the
    // second shows the cost of swapping an element TYPE in a slot (header remounts).
    const Bands = ({ finalizing }) => (<>{<div className="h" />}{<div className="a" />}{finalizing ? <div className="f" /> : null}</>);
    const fragment = (finalizing) => <div><Bands finalizing={finalizing} /><div className="s" /></div>;
    const fView = render(fragment(false));
    const summary = fView.container.querySelector('.s');
    fView.rerender(fragment(true));
    expect(fView.container.querySelector('.s')).toBe(summary);
    cleanup();

    const Header = () => <div className="h" />;
    const swap = (wrapped) => <div>{wrapped ? <Header /> : <div className="h" />}</div>;
    const sView = render(swap(false));
    const raw = sView.container.querySelector('.h');
    sView.rerender(swap(true));
    expect(sView.container.querySelector('.h')).not.toBe(raw);
  });
});

// ── 3. C3 success header ────────────────────────────────────────────────────────────────
describe('3. C3 success header — presentation only, one value read', () => {
  it('exact shape: class-only <div> > [icon circle, caption, id]; the only value read is lastPaidInvoice.id', () => {
    const root = renderMarkup(completeProps()).root();
    const h = header(root);
    expect(cls(h)).toBe(HEADER_CLASS);
    expect(attrNames(h)).toEqual(['class']);
    expect(Array.from(h.children).map((c) => c.tagName)).toEqual(['DIV', 'P', 'P']);
    expect(h.querySelectorAll('svg')).toHaveLength(1);
    expect(h.textContent).toBe('Payment CompleteSI-POS-000123');
    expect(h.querySelector('button')).toBeNull();
  });

  it.each([
    ['a numeric id renders as text', 4321, '4321'],
    ['an absent id renders an EMPTY paragraph (no placeholder, no dash)', undefined, ''],
    ['a null id renders empty', null, ''],
    ['an id is never escaped or truncated', 'SI/POS<2026>-0001 & more', 'SI/POS<2026>-0001 & more'],
  ])('%s', (_label, id, expected) => {
    const root = renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, id } })).root();
    expect(header(root).children[2].textContent).toBe(expected);
    expect(cls(header(root).children[2])).toBe('text-white font-bold text-lg');
  });

  it('the header never changes with finalizing, channel, loading or error state', () => {
    const root = renderMarkup(completeProps({ checkoutFinalizing: true, receiptShareChannel: 'sms', checkoutLoading: true, checkoutError: 'stale' })).root();
    expect(header(root).textContent).toBe('Payment CompleteSI-POS-000123');
    expect(cls(header(root))).toBe(HEADER_CLASS);
  });
});

// ── 4. C4 Amount Paid ───────────────────────────────────────────────────────────────────
describe('4. C4 Amount Paid band — presentation only, one derived figure', () => {
  it('exact shape: class-only <div> > [caption, figure]; the figure is DirhamSymbol + a space + the fixed(2) amount', () => {
    const root = renderMarkup(completeProps()).root();
    const a = amount(root);
    expect(cls(a)).toBe(AMOUNT_CLASS);
    expect(attrNames(a)).toEqual(['class']);
    expect(Array.from(a.children).map((c) => c.tagName)).toEqual(['P', 'P']);
    expect(a.children[0].textContent).toBe('Amount Paid');
    const figure = a.children[1];
    expect(figure.childNodes[0].nodeType).toBe(Node.ELEMENT_NODE);
    expect(figure.querySelector('[data-bb-currency-symbol]')).not.toBeNull();
    expect(figure.textContent.trim()).toBe('105.00');
  });

  it.each([
    ['a negative paid amount is shown as-is (no clamp, no parentheses)', { paidAmount: -12.5 }, '-12.50'],
    ['rounding is plain toFixed half-up-ish at 2dp', { paidAmount: 10.005 }, '10.01'],
    ['a large amount gets no thousands separator', { paidAmount: 1234567.5 }, '1234567.50'],
    ['total is used only when paidAmount is null/undefined', { paidAmount: undefined, total: 42 }, '42.00'],
    ['NaN survives to the screen', { paidAmount: NaN }, 'NaN'],
  ])('%s', (_label, fields, expected) => {
    const root = renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, ...fields } })).root();
    expect(amount(root).children[1].textContent.trim()).toBe(expected);
  });

  it('KNOWN DEFECT: a STRING paidAmount throws out of render — there is no error boundary on the complete screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, paidAmount: '105' } }))).toThrow(TypeError);
    cleanup();
    expect(() => renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, paidAmount: null, total: '100' } }))).toThrow(TypeError);
  });

  it('the band reads nothing else: shipping, deposit, change and credit fields do not alter it', () => {
    const root = renderMarkup(completeProps({
      lastPaidInvoice: { ...PAID, changeAmount: 5, depositAmount: 25, creditBalance: 40, creditUpdatedBalance: 140, shippingCharge: 15 },
    })).root();
    expect(amount(root).children[1].textContent.trim()).toBe('105.00');
  });
});

// ── 5. C5 finalize indicator ────────────────────────────────────────────────────────────
describe('5. C5 finalize indicator — driven only by checkoutFinalizing', () => {
  it.each([
    [true, true], [false, false], [undefined, false], [null, false], [0, false], ['', false], ['printing', true], [1, true],
  ])('checkoutFinalizing %j → rendered %s (a plain && on the raw value)', (checkoutFinalizing, shown) => {
    const root = renderMarkup(completeProps({ checkoutFinalizing })).root();
    expect(!!screen.queryByText('Printing receipt…')).toBe(shown);
    expect(card(root).children).toHaveLength(shown ? 5 : 4);
    if (shown) expect(cls(card(root).children[2])).toBe(INDICATOR_CLASS);
  });

  it('KNOWN EDGE: `checkoutFinalizing === 0` LEAKS a literal "0" text node into the card; "", null and undefined render nothing', () => {
    const baseline = renderMarkup(completeProps({ checkoutFinalizing: false })).root().innerHTML;
    cleanup();
    for (const checkoutFinalizing of ['', null, undefined]) {
      const root = renderMarkup(completeProps({ checkoutFinalizing })).root();
      expect(root.innerHTML, String(checkoutFinalizing)).toBe(baseline);
      cleanup();
    }
    // A numeric 0 is a valid React child, so `{0 && …}` renders the 0 itself.
    const zero = renderMarkup(completeProps({ checkoutFinalizing: 0 })).root();
    expect(zero.innerHTML).not.toBe(baseline);
    const leaked = Array.from(card(zero).childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(leaked.map((n) => n.textContent)).toEqual(['0']);
    expect(card(zero).children).toHaveLength(4);
    expect(screen.queryByText('Printing receipt…')).toBeNull();
  });

  it('KNOWN GAP: a manual Print Receipt never raises the indicator — checkoutFinalizing is set only by the auto-print in useCheckout', async () => {
    const fetch = deferred();
    const props = completeProps({ getSalesInvoiceById: vi.fn(() => fetch.promise) });
    const root = renderMarkup(props).root();
    fireEvent.click(button('Print Receipt'));
    expect(screen.queryByText('Printing receipt…')).toBeNull();
    expect(props.setCheckoutFinalizing).not.toHaveBeenCalled();
    expect(card(root).children).toHaveLength(4);
    await act(async () => { fetch.resolve(FULL); });
    await flush();
    expect(screen.queryByText('Printing receipt…')).toBeNull();
    expect(props.setCheckoutFinalizing).not.toHaveBeenCalled();
  });

  it('the indicator blocks nothing: every action button stays enabled while it shows', () => {
    renderMarkup(completeProps({ checkoutFinalizing: true }));
    for (const name of ['New Sale', 'Print Receipt', 'Reprint Inv.', 'SMS', 'WhatsApp', 'Email']) {
      expect(button(name).disabled, name).toBe(false);
    }
  });
});

// ── 6. C0 derivation → the two extracted children ───────────────────────────────────────
describe('6. C0 derivation and the call-site props it feeds', () => {
  it('CheckoutCompleteSummary receives exactly four props: the invoice, both row lists and the formatter', () => {
    const props = completeProps();
    renderMarkup(props);
    expect(summarySpy.calls).toHaveLength(1);
    const p = summarySpy.calls[0];
    expect(Object.keys(p).sort()).toEqual(['formatCurrencyStr', 'lastPaidInvoice', 'paymentRows', 'usedMethods']);
    expect(p.lastPaidInvoice).toBe(props.lastPaidInvoice);
    expect(p.formatCurrencyStr).toBe(props.formatCurrencyStr);
    expect(p.paymentRows.map((r) => r.label)).toEqual(['Cash', 'Visa Card', 'Change Returned', 'Total Received']);
    expect(p.usedMethods.map((r) => r.label)).toEqual(['Cash', 'Visa Card']);
  });

  it('usedMethods drops only the two EXACT labels — the match is case- and whitespace-sensitive', () => {
    renderMarkup(completeProps({
      lastPaidInvoice: {
        ...PAID,
        paymentBlock: { details: [{ label: 'total received', amount: 1 }, { label: 'Change Returned ', amount: 2 }], changeAmount: 0, totalReceived: 3, hasReceivable: false },
      },
    }));
    const p = summarySpy.calls[0];
    expect(p.usedMethods.map((r) => r.label)).toEqual(p.paymentRows.map((r) => r.label).filter((l) => l !== 'Total Received' && l !== 'Change Returned'));
    expect(p.usedMethods.map((r) => r.label)).toContain('total received');
    expect(p.usedMethods.map((r) => r.label)).toContain('Change Returned ');
  });

  it('no paymentBlock → both lists are empty arrays (never null), and usedMethods is a distinct array', () => {
    renderMarkup(completeProps({ lastPaidInvoice: { ...PAID, paymentBlock: null } }));
    const p = summarySpy.calls[0];
    expect(p.paymentRows).toEqual([]);
    expect(p.usedMethods).toEqual([]);
    expect(p.usedMethods).not.toBe(p.paymentRows);
    expect(screen.queryByText('Payment Summary')).toBeNull();
  });

  it('KNOWN COST: both lists and closeComplete are rebuilt on EVERY render — new references each time (no memoisation)', () => {
    const view = renderMarkup(completeProps());
    view.rerenderWith(completeProps());
    expect(summarySpy.calls).toHaveLength(2);
    expect(summarySpy.calls[1].paymentRows).not.toBe(summarySpy.calls[0].paymentRows);
    expect(summarySpy.calls[1].paymentRows).toEqual(summarySpy.calls[0].paymentRows);
    expect(summarySpy.calls[1].usedMethods).not.toBe(summarySpy.calls[0].usedMethods);
    expect(actionsSpy.calls[1].onNewSale).not.toBe(actionsSpy.calls[0].onNewSale);
    expect(actionsSpy.calls[1].onPrintReceipt).not.toBe(actionsSpy.calls[0].onPrintReceipt);
    expect(actionsSpy.calls[1].onReprint).not.toBe(actionsSpy.calls[0].onReprint);
    expect(actionsSpy.calls[1].onShare).not.toBe(actionsSpy.calls[0].onShare);
  });

  it('CheckoutCompleteActions receives exactly the four callbacks — no invoice, no flags, no loading state', () => {
    renderMarkup(completeProps({ checkoutLoading: true, checkoutFinalizing: true }));
    expect(Object.keys(actionsSpy.calls[0]).sort()).toEqual(['onNewSale', 'onPrintReceipt', 'onReprint', 'onShare']);
    for (const key of Object.keys(actionsSpy.calls[0])) expect(typeof actionsSpy.calls[0][key]).toBe('function');
  });

  it('onNewSale IS closeComplete by reference, and onReprint is a different function that calls it', () => {
    const props = completeProps();
    renderMarkup(props);
    const { onNewSale, onReprint } = actionsSpy.calls[0];
    expect(onReprint).not.toBe(onNewSale);
    onReprint();
    expect(props.setShowPaymentDialog.mock.calls).toEqual([[false]]);
    expect(props.setShowReprintModal.mock.calls).toEqual([[true]]);
    expect(props.setSelectedCustomer.mock.calls).toEqual([[WALK_IN_CUSTOMER.id]]);
  });
});

// ── 7. C8 ReceiptShareModal ─────────────────────────────────────────────────────────────
describe('7. C8 ReceiptShareModal — placement and lifecycle inside the complete root', () => {
  it('it is a sibling of the card INSIDE the root (never inside the card), so the card can stay overflow-hidden', () => {
    const root = renderMarkup(completeProps({ receiptShareChannel: 'sms' })).root();
    expect(root.children).toHaveLength(2);
    expect(shareOverlay(root)).not.toBe(card(root));
    expect(card(root).contains(screen.getByRole('dialog'))).toBe(false);
    expect(root.contains(screen.getByRole('dialog'))).toBe(true);
  });

  it('the open dialog survives an invoice change and a finalizing toggle — typed text is kept', () => {
    const view = renderMarkup(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(shareInput(), { target: { value: '0509999999' } });
    view.rerenderWith(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111', checkoutFinalizing: true, lastPaidInvoice: { ...PAID, id: 'SI-POS-000999' } }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(shareInput().value).toBe('0509999999');
  });

  it('a re-render keeps the SAME modal instance wired to the CURRENT handleReceiptShareSend', async () => {
    const props = completeProps({ receiptShareChannel: 'email' });
    const view = renderMarkup(props);
    const dialog = screen.getByRole('dialog');
    const next = vi.fn(async () => {});
    view.rerenderWith({ ...props, handleReceiptShareSend: next });
    expect(screen.getByRole('dialog')).toBe(dialog);
    fireEvent.change(shareInput(), { target: { value: '  jane@shop.test  ' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /Send/ })); });
    expect(next.mock.calls).toEqual([['jane@shop.test']]);
    expect(props.handleReceiptShareSend).not.toHaveBeenCalled();
  });

  it('a phase flip while the dialog is open unmounts it WITHOUT clearing the channel — flipping back re-mounts it re-seeded', () => {
    const view = renderMarkup(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111' }));
    fireEvent.change(shareInput(), { target: { value: '0509999999' } });
    view.rerenderWith(makeProps({ lastPaidInvoice: PAID, receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerenderWith(completeProps({ receiptShareChannel: 'sms', receiptShareInitialValue: '0501111111' }));
    expect(shareInput().value).toBe('0501111111');
  });

  it('closing the whole overlay mid-send still resolves the send, which then calls onClose a second time', async () => {
    const send = deferred();
    const props = completeProps({ receiptShareChannel: 'whatsapp', handleReceiptShareSend: vi.fn(() => send.promise) });
    const view = renderMarkup(props);
    fireEvent.change(shareInput(), { target: { value: '0501234567' } });
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Send/ })); });
    expect(props.handleReceiptShareSend).toHaveBeenCalledTimes(1);
    // closeComplete would clear the channel and hide the dialog while the send is still open.
    view.rerenderWith(completeProps({ receiptShareChannel: null }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { send.resolve(); });
    await flush();
    expect(props.setReceiptShareChannel.mock.calls).toEqual([[null]]);
  });

  it('the three share buttons only set the channel — they do not open the dialog by themselves (POSSales state does)', () => {
    const props = completeProps();
    const root = renderMarkup(props).root();
    fireEvent.click(button('Email'));
    expect(props.setReceiptShareChannel.mock.calls).toEqual([['email']]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root.children).toHaveLength(1);
  });
});

// ── 8. C7 print / reprint / new sale at the JSX boundary ────────────────────────────────
describe('8. C7 print, reprint and close at the JSX boundary', () => {
  it('the print handler captures the RENDER-TIME invoice: a mid-flight invoice change does not redirect it', async () => {
    const fetch = deferred();
    const props = completeProps({ getSalesInvoiceById: vi.fn(() => fetch.promise) });
    const view = renderMarkup(props);
    fireEvent.click(button('Print Receipt'));
    view.rerenderWith(completeProps({ getSalesInvoiceById: props.getSalesInvoiceById, buildThermalReceiptArtifacts: props.buildThermalReceiptArtifacts, printThermalReceiptWithConfiguredPrinter: props.printThermalReceiptWithConfiguredPrinter, lastPaidInvoice: { ...PAID, paidAmount: 999, invoice: { id: 111 } } }));
    await act(async () => { fetch.resolve(FULL); });
    await flush();
    expect(props.getSalesInvoiceById.mock.calls).toEqual([[987]]);
    expect(props.buildThermalReceiptArtifacts.mock.calls[0][0].cashGiven).toBe(105);
  });

  it('KNOWN GAP: closing the screen does not cancel an in-flight print — it completes after unmount', async () => {
    const fetch = deferred();
    const props = completeProps({ getSalesInvoiceById: vi.fn(() => fetch.promise) });
    const view = renderMarkup(props);
    fireEvent.click(button('Print Receipt'));
    view.rerenderWith(completeProps({ showPaymentDialog: false, getSalesInvoiceById: props.getSalesInvoiceById, buildThermalReceiptArtifacts: props.buildThermalReceiptArtifacts, printThermalReceiptWithConfiguredPrinter: props.printThermalReceiptWithConfiguredPrinter }));
    expect(view.root()).toBeNull();
    await act(async () => { fetch.resolve(FULL); });
    await flush();
    expect(props.printThermalReceiptWithConfiguredPrinter).toHaveBeenCalledTimes(1);
  });

  it('KNOWN GAP: a print that fails after the screen closed still alerts, with the overlay gone', async () => {
    const fetch = deferred();
    const props = completeProps({ getSalesInvoiceById: vi.fn(() => fetch.promise) });
    const view = renderMarkup(props);
    fireEvent.click(button('Print Receipt'));
    view.rerenderWith(completeProps({ showPaymentDialog: false, getSalesInvoiceById: props.getSalesInvoiceById }));
    await act(async () => { fetch.reject(new Error('No printer')); });
    await flush();
    expect(globalThis.alert.mock.calls).toEqual([['Print failed: No printer.']]);
    expect(view.root()).toBeNull();
  });

  it('checkoutLoading is not read by the complete branch: nothing disables, and Settle/Cancel do not exist here', () => {
    const props = completeProps({ checkoutLoading: true });
    renderMarkup(props);
    for (const name of ['New Sale', 'Print Receipt', 'Reprint Inv.', 'SMS', 'WhatsApp', 'Email']) {
      expect(button(name).disabled, name).toBe(false);
    }
    expect(screen.queryByRole('button', { name: /^Settle payment of / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel checkout' })).toBeNull();
    expect(props.processPayment).not.toHaveBeenCalled();
  });

  it('nothing on the complete screen touches the payment-phase handlers', () => {
    const props = completeProps({ receiptShareChannel: null });
    renderMarkup(props);
    for (const name of ['Print Receipt', 'SMS']) fireEvent.click(button(name));
    for (const fn of ['processPayment', 'cancelCheckoutTenders', 'setCheckoutError', 'setCheckoutRemarks', 'loadPosCustomers']) {
      expect(props[fn], fn).not.toHaveBeenCalled();
    }
  });
});

// ── 9. empty / minimal invoice ──────────────────────────────────────────────────────────
describe('9. minimal and empty complete-phase state', () => {
  it('a bare truthy invoice ({}) still renders all four regions: empty id, 0.00, no summary sections', () => {
    const root = renderMarkup(completeProps({ lastPaidInvoice: {} })).root();
    expect(cls(root)).toBe(COMPLETE_ROOT_CLASS);
    expect(card(root).children).toHaveLength(4);
    expect(header(root).children[2].textContent).toBe('');
    expect(amount(root).children[1].textContent.trim()).toBe('0.00');
    expect(screen.queryByText('Payment Summary')).toBeNull();
    expect(screen.queryByText('Change Due')).toBeNull();
    expect(screen.queryByText('Accounts Receivable')).toBeNull();
    expect(button('New Sale')).toBeInTheDocument();
  });

  it('a paymentBlock with no details renders the details list empty but keeps the section order', () => {
    const root = renderMarkup(completeProps({
      lastPaidInvoice: { ...PAID, changeAmount: 0, paymentBlock: { details: [], changeAmount: 0, totalReceived: 0, hasReceivable: false } },
    })).root();
    expect(summarySpy.calls[0].usedMethods).toEqual([]);
    expect(screen.queryByText('Payment Summary')).toBeNull();
    expect(root.querySelector('details')).not.toBeNull();
    expect(Array.from(card(root).children).map(cls)).toEqual([
      HEADER_CLASS, AMOUNT_CLASS, 'flex-1 overflow-y-auto',
      'px-6 pb-6 pt-4 bg-white border-t border-gray-50 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]',
    ]);
  });

  it('with every optional region on, the card children are header, amount, indicator, summary, actions — in that order', () => {
    const root = renderMarkup(completeProps({
      checkoutFinalizing: true,
      receiptShareChannel: 'sms',
      lastPaidInvoice: { ...PAID, changeAmount: 5, creditBalance: 40, creditUpdatedBalance: 140, depositAmount: 25 },
    })).root();
    expect(Array.from(card(root).children).map(cls)).toEqual([
      HEADER_CLASS, AMOUNT_CLASS, INDICATOR_CLASS, 'flex-1 overflow-y-auto',
      'px-6 pb-6 pt-4 bg-white border-t border-gray-50 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]',
    ]);
    expect(root.children).toHaveLength(2);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// ── 1. source anchors ───────────────────────────────────────────────────────────────────
// EOL-normalised: sources are checked out with CRLF on Windows.
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const count = (src, needle) => src.split(needle).length - 1;
/** Source with `//` comment lines dropped — header comments name what stayed behind. */
const codeOnly = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};

const REGION_START = '      {/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}\n';
const REGION_END = '      })()}';
const REGION = (() => {
  const i = POS_SALES.indexOf(REGION_START);
  return POS_SALES.slice(i, POS_SALES.indexOf(`\n${REGION_END}`, i) + REGION_END.length + 1);
})();
/** The complete branch: the guard through the `}` that closes it, before the payment derivation. */
const COMPLETE_BRANCH = REGION.slice(
  REGION.indexOf("        if (checkoutPhase === 'complete' && lastPaidInvoice) {"),
  REGION.indexOf('        const shippingChargeNum = Number(shippingCharge) || 0;'),
);

const C0_CLOSE = [
  '          const closeComplete = () => {',
  '            setShowPaymentDialog(false);',
  "            setCheckoutPhase('payment');",
  '            setCheckoutSettling(false);',
  '            // Clear the finalize indicator on close — the receipt print is a',
  "            // fire-and-forget background task and doesn't need to block closing.",
  '            setCheckoutFinalizing(false);',
  '            setReceiptShareChannel(null);',
  '            setSelectedCustomer(WALK_IN_CUSTOMER.id);',
  '          };',
].join('\n');
const C0_ROWS = [
  '          const paymentRows = lastPaidInvoice.paymentBlock ? paymentBlockRows(lastPaidInvoice.paymentBlock) : [];',
  "          const usedMethods = paymentRows.filter(r => r.label !== 'Total Received' && r.label !== 'Change Returned');",
].join('\n');
const C1_ROOT = '            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">';
const C2_CARD = '              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">';
const C3_HEADER = [
  '                {/* 1. Redesigned Success Header */}',
  '                <div className="bg-gradient-to-b from-[#F5C742] to-[#E5B532] px-6 pt-5 pb-4 text-center shrink-0">',
  '                  <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center mx-auto mb-2">',
  '                    <CheckCircle className="h-6 w-6 text-white" />',
  '                  </div>',
  '                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest mb-0.5">Payment Complete</p>',
  '                  <p className="text-white font-bold text-lg">{lastPaidInvoice.id}</p>',
  '                </div>',
].join('\n');
const C4_AMOUNT = [
  '                {/* 2. Amount Paid (Primary Financial Highlight) */}',
  '                <div className="bg-[#FFFBEB] border-b border-amber-100/50 px-6 py-4 text-center shrink-0">',
  '                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/60 mb-0.5">Amount Paid</p>',
  '                  <p className="text-3xl font-black text-[#1E293B]">',
  '                    <DirhamSymbol /> {(lastPaidInvoice.paidAmount ?? lastPaidInvoice.total ?? 0).toFixed(2)}',
  '                  </p>',
  '                </div>',
].join('\n');
const C5_INDICATOR = [
  '                {/* Background finalize indicator */}',
  '                {checkoutFinalizing && (',
  '                  <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-center gap-2 shrink-0">',
  '                    <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />',
  '                    <span className="text-[11px] font-bold text-amber-600">Printing receipt…</span>',
  '                  </div>',
  '                )}',
].join('\n');
const C6_SUMMARY = [
  '                <CheckoutCompleteSummary',
  '                  lastPaidInvoice={lastPaidInvoice}',
  '                  paymentRows={paymentRows}',
  '                  usedMethods={usedMethods}',
  '                  formatCurrencyStr={formatCurrencyStr}',
  '                />',
].join('\n');
const C8_MODAL = [
  '              {/* Share Receipt dialog — one component, three configured channels. */}',
  '              {receiptShareChannel && (',
  '                <ReceiptShareModal',
  '                  key={receiptShareChannel}',
  '                  channel={receiptShareChannel}',
  '                  initialValue={receiptShareInitialValue}',
  '                  onClose={() => setReceiptShareChannel(null)}',
  '                  onSend={handleReceiptShareSend}',
  '                />',
  '              )}',
].join('\n');

/** Identifiers a region reads from the enclosing POSSales scope. */
const PARENT_LOCALS = [
  'closeComplete', 'paymentRows', 'usedMethods', 'lastPaidInvoice', 'checkoutPhase', 'checkoutFinalizing',
  'checkoutLoading', 'checkoutError', 'checkoutSettling', 'showPaymentDialog', 'receiptShareChannel',
  'receiptShareInitialValue', 'handleReceiptShareSend', 'formatCurrencyStr', 'processPayment',
  'setShowPaymentDialog', 'setCheckoutPhase', 'setCheckoutSettling', 'setCheckoutFinalizing',
  'setReceiptShareChannel', 'setSelectedCustomer', 'setShowReprintModal', 'getSalesInvoiceById',
  'tplInvoicePaper', 'currentInvoice', 'checkoutPayment', 'checkoutEffectiveDue', 'checkoutRemarks',
];
const readsOf = (src) => PARENT_LOCALS.filter((id) => new RegExp(`\\b${id}\\b`).test(src));

describe('1. source — the copy and the complete-phase region map', () => {
  it('the verbatim copy in this file is the live POSSales checkout region, byte for byte (203 lines)', () => {
    const copy = between(SELF, '{/* VERBATIM-START */}\n', '\n      {/* VERBATIM-END */}');
    expect(copy).toBe(REGION);
    expect(REGION.split('\n')).toHaveLength(203);
    expect(count(POS_SALES, REGION_START)).toBe(1);
  });

  it('the complete branch is 96 lines: guard, closeComplete, derivation, return, root, card, C3–C8', () => {
    expect(COMPLETE_BRANCH.split('\n')).toHaveLength(96);
    expect(COMPLETE_BRANCH.startsWith("        if (checkoutPhase === 'complete' && lastPaidInvoice) {\n")).toBe(true);
    const order = [
      C0_CLOSE, C0_ROWS, '          return (', C1_ROOT, C2_CARD, C3_HEADER, C4_AMOUNT, C5_INDICATOR, C6_SUMMARY,
      '                {/* 6. Action Priority */}', '                <CheckoutCompleteActions',
      '              </div>', C8_MODAL, '            </div>', '          );', '        }',
    ];
    // Whole-line anchors: a 14-space `</div>` is a substring of an 18-space one.
    const idx = order.map((needle) => COMPLETE_BRANCH.indexOf(`\n${needle}\n`));
    expect(idx.filter((v) => v < 0)).toEqual([]);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    for (const needle of [C0_CLOSE, C0_ROWS, C1_ROOT, C2_CARD, C3_HEADER, C4_AMOUNT, C5_INDICATOR, C6_SUMMARY, C8_MODAL]) {
      expect(count(COMPLETE_BRANCH, needle), needle.split('\n')[0]).toBe(1);
    }
  });

  it('two whitespace-only lines separate C0 from the rows and C2 from C3 — a copy must keep them', () => {
    expect(COMPLETE_BRANCH).toContain(`${C0_CLOSE}\n          \n${C0_ROWS}\n`);
    expect(COMPLETE_BRANCH).toContain(`${C2_CARD}\n                \n${C3_HEADER}`);
  });

  it('the regions are contiguous: C3 → C4 → C5 → C6 → C7, one blank line apart', () => {
    expect(COMPLETE_BRANCH).toContain(`${C3_HEADER}\n\n${C4_AMOUNT}\n\n${C5_INDICATOR}\n\n${C6_SUMMARY}\n\n                {/* 6. Action Priority */}\n                <CheckoutCompleteActions\n`);
  });

  it('C8 sits between the card close and the root close, as the root\'s second child', () => {
    expect(COMPLETE_BRANCH).toContain(`                  onShare={(key) => setReceiptShareChannel(key)}\n                />\n              </div>\n\n${C8_MODAL}\n            </div>\n          );\n        }\n`);
    expect(count(COMPLETE_BRANCH, 'key={receiptShareChannel}')).toBe(1);
  });

  it('the complete branch declares no hooks, refs or list keys other than the modal key', () => {
    expect(COMPLETE_BRANCH).not.toMatch(/\buse[A-Z]\w*\(|\bref=|createContext|useContext|\.Provider|\bmemo\(/);
    expect(COMPLETE_BRANCH.match(/\bkey=/g)).toHaveLength(1);
    expect(COMPLETE_BRANCH).not.toMatch(/\bconst [A-Z]\w*\s*=\s*\(|\bfunction [A-Z]\w*\(/);
  });

  it('dependency map: C3 reads one value, C4 one, C5 one; the transactional reads stay in C0/C7/C8', () => {
    expect(readsOf(C3_HEADER)).toEqual(['lastPaidInvoice']);
    expect(readsOf(C4_AMOUNT)).toEqual(['lastPaidInvoice']);
    expect(readsOf(C5_INDICATOR)).toEqual(['checkoutFinalizing']);
    for (const region of [C3_HEADER, C4_AMOUNT, C5_INDICATOR]) {
      expect(region).not.toMatch(/on[A-Z]\w*=|\basync\b|\bawait\b|alert\(/);
    }
    expect(readsOf(C0_CLOSE)).toEqual([
      'closeComplete', 'setShowPaymentDialog', 'setCheckoutPhase', 'setCheckoutSettling', 'setCheckoutFinalizing',
      'setReceiptShareChannel', 'setSelectedCustomer',
    ]);
    expect(readsOf(C0_ROWS)).toEqual(['paymentRows', 'usedMethods', 'lastPaidInvoice']);
    expect(readsOf(C6_SUMMARY)).toEqual(['paymentRows', 'usedMethods', 'lastPaidInvoice', 'formatCurrencyStr']);
    expect(readsOf(C8_MODAL)).toEqual(['receiptShareChannel', 'receiptShareInitialValue', 'handleReceiptShareSend', 'setReceiptShareChannel']);
  });

  it('the complete branch never reads checkoutLoading, checkoutError, checkoutSettling or the cart', () => {
    for (const absent of ['checkoutLoading', 'checkoutError', 'checkoutSettling', 'currentInvoice', 'checkoutRemarks', 'processPayment', 'checkoutEffectiveDue']) {
      expect(COMPLETE_BRANCH, absent).not.toContain(absent);
    }
  });

  it('the already-extracted children are module components rendered once each, and POSSales imports them together', () => {
    expect(typeof CheckoutCompleteSummary).toBe('function');
    expect(typeof CheckoutCompleteActions).toBe('function');
    expect(POS_SALES).toContain("import CheckoutCompleteSummary from './POS/features/checkout/CheckoutCompleteSummary';\nimport CheckoutCompleteActions from './POS/features/checkout/CheckoutCompleteActions';\n");
    expect(POS_SALES.match(/<CheckoutCompleteSummary\b/g)).toHaveLength(1);
    expect(POS_SALES.match(/<CheckoutCompleteActions\b/g)).toHaveLength(1);
    for (const rel of ['../features/checkout/CheckoutCompleteSummary.jsx', '../features/checkout/CheckoutCompleteActions.jsx']) {
      expect(readSource(rel), rel).not.toMatch(/\buse[A-Z]\w*\(|createContext|useContext|\bmemo\(/);
    }
  });

  it('the icons and currency glyph C3/C4 need are POSSales-level imports, not region-local', () => {
    expect(POS_SALES).toContain('  CheckCircle,\n');
    expect(POS_SALES).toContain("import { DirhamSymbol, DenominationLabel, CurrencyAmount, DenominationAmount, renderAED, setActiveCurrency } from './POS/POSCurrency';");
    expect(POS_SALES).toContain("import { buildPaymentBlock, buildPaymentBlockFromRecords, paymentBlockRows, matchesPaymentFilter, PAYMENT_FILTERS } from './POS/payments/paymentPresentation';");
    expect(POS_SALES).toContain("import { WALK_IN_CUSTOMER, STATUS_ENUM_TO_LABEL } from './POS/posConstants';");
    expect(POS_SALES).toContain("import ReceiptShareModal from '../../components/pos/ReceiptShareModal';");
  });

  it('the finalize flag is owned by useCheckout: set true on success, cleared in the print finally, and by closeComplete', () => {
    const USE_CHECKOUT = readSource('../features/checkout/useCheckout.js');
    expect(count(USE_CHECKOUT, '  const [checkoutFinalizing, setCheckoutFinalizing] = useState(false);\n')).toBe(1);
    expect(USE_CHECKOUT).toContain('      setLastPaidInvoice(paid);\n      setCheckoutFinalizing(true);\n');
    expect(USE_CHECKOUT).toContain('        } finally {\n          setCheckoutFinalizing(false);\n        }\n');
    expect(codeOnly(USE_CHECKOUT).match(/setCheckoutFinalizing\(/g)).toHaveLength(2);
    // POSSales only clears it, inside closeComplete.
    expect(count(POS_SALES, '            setCheckoutFinalizing(false);\n')).toBe(1);
    expect(POS_SALES.match(/setCheckoutFinalizing\(/g)).toHaveLength(1);
  });
});
