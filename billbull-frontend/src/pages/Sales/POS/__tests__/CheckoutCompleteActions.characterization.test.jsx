import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ArrowRightCircle, Mail, MessageCircle, Printer, RotateCcw, Smartphone } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CheckoutCompleteActions from '../features/checkout/CheckoutCompleteActions';

/**
 * Characterization of the POSSales.jsx payment-complete ACTION BLOCK — New Sale, Print Receipt,
 * Reprint Inv. and the three Share Receipt buttons — now rendered by CheckoutCompleteActions.
 *
 * The extraction is presentation-only: the child RECEIVES onNewSale / onPrintReceipt / onReprint /
 * onShare. closeComplete, the Print Receipt async body, setShowReprintModal, setReceiptShareChannel
 * and ReceiptShareModal all stay in POSSales.
 *
 * Not repeated here (owned by CheckoutScreen.characterization.test.jsx): phase guard, z-50 root,
 * root DOM reuse, the closeComplete setter order, and the ReceiptShareModal lifecycle.
 *
 * Structure — every behavioural test (sections 1–5) runs against BOTH variants:
 *   `OriginalActionBlock` — the pre-extraction POSSales block, kept VERBATIM as the behavioural
 *   reference. The source section proves the component body is this block with exactly four
 *   callback substitutions. Every render-time closure it reads is lifted to a prop under its
 *   original name. `closeComplete` is a prop, NOT a copy of its body, so reference identity can
 *   be observed.
 *   `ExtractedActionBlock` — the live POSSales call site copied VERBATIM (enforced byte-for-byte),
 *   rendering the real CheckoutCompleteActions with the same props.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - Print Receipt has no in-flight guard, never disables, never kicks the drawer, reports
 *     failure via window.alert, and compares tplInvoicePaper strictly against 'A4'.
 */

// ── the verbatim block ──────────────────────────────────────────────────────────────────
function OriginalActionBlock({
  closeComplete, lastPaidInvoice, getSalesInvoiceById, tplInvoicePaper, resolveInvoiceA4TemplateFor,
  buildPosPrintData, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument, tplInvoiceHeader,
  tplReceiptHeader, tplOutletName, effectiveOutletTrn, tplOutletAddress, tplOutletPhone, tplLogoDataUrl,
  company, tplStampDataUrl, USE_NEW_POS_PRINT_TEMPLATE, tplInvoiceShowStamp, printHtml,
  generateDocumentPrintHtml, buildThermalReceiptArtifacts, printThermalReceiptWithConfiguredPrinter,
  setShowReprintModal, setReceiptShareChannel,
}) {
  return (
    <>
                {/* ACTIONS-VERBATIM-START */}
                {/* 6. Action Priority */}
                <div className="px-6 pb-6 pt-4 bg-white border-t border-gray-50 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]">
                  {/* Primary Action */}
                  <button type="button" onClick={closeComplete}
                    className="w-full py-3.5 mb-3 rounded-xl bg-[#F5C742] hover:bg-[#E5B532] text-white font-black text-sm transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <ArrowRightCircle className="h-5 w-5" />New Sale
                  </button>

                  {/* Secondary Actions */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button type="button" onClick={async () => {
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
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <Printer className="h-4 w-4" />Print Receipt
                    </button>
                    <button type="button" onClick={() => { closeComplete(); setShowReprintModal(true); }}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <RotateCcw className="h-4 w-4" />Reprint Inv.
                    </button>
                  </div>

                  {/* Share Receipt - Tertiary (Figma style preserved) */}
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Share Receipt</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'sms', label: 'SMS', Icon: Smartphone, tone: 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500' },
                        { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, tone: 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500' },
                        { key: 'email', label: 'Email', Icon: Mail, tone: 'border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 hover:border-blue-300 focus-visible:ring-blue-500' },
                      ].map(({ key, label, Icon, tone }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setReceiptShareChannel(key)}
                          className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${tone}`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* ACTIONS-VERBATIM-END */}
    </>
  );
}

// ── the verbatim POSSales call site ─────────────────────────────────────────────────────
function ExtractedActionBlock({
  closeComplete, lastPaidInvoice, getSalesInvoiceById, tplInvoicePaper, resolveInvoiceA4TemplateFor,
  buildPosPrintData, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument, tplInvoiceHeader,
  tplReceiptHeader, tplOutletName, effectiveOutletTrn, tplOutletAddress, tplOutletPhone, tplLogoDataUrl,
  company, tplStampDataUrl, USE_NEW_POS_PRINT_TEMPLATE, tplInvoiceShowStamp, printHtml,
  generateDocumentPrintHtml, buildThermalReceiptArtifacts, printThermalReceiptWithConfiguredPrinter,
  setShowReprintModal, setReceiptShareChannel,
}) {
  return (
    <>
                {/* CALL-VERBATIM-START */}
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
                {/* CALL-VERBATIM-END */}
    </>
  );
}

const VARIANTS = [
  ['original markup', OriginalActionBlock],
  ['extracted CheckoutCompleteActions via the POSSales call site', ExtractedActionBlock],
];

// ── fixtures, helpers ───────────────────────────────────────────────────────────────────
const PAID = {
  id: 'SI-POS-000123',
  total: 100,
  paidAmount: 105,
  changeAmount: 5,
  invoice: { id: 987 },
  customer: { id: 'walk-in', name: 'Walk-in Customer' },
};
const FULL = { id: 987, invoiceNumber: 'SI-POS-000123' };

function makeProps(overrides = {}) {
  return {
    closeComplete: vi.fn(),
    lastPaidInvoice: PAID,
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
    setReceiptShareChannel: vi.fn(),
    ...overrides,
  };
}
const FN_PROPS = Object.entries(makeProps()).filter(([, v]) => typeof v === 'function').map(([k]) => k);

const makeRenderBlock = (Block) => (props) => {
  const view = render(<Block {...props} />);
  return { ...view, wrapper: () => view.container.firstElementChild, rerenderWith: (p) => view.rerender(<Block {...p} />) };
};
const cls = (el) => el.getAttribute('class');
const attrNames = (el) => Array.from(el.attributes).map((a) => a.name).sort();
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};
/** React's props object for a host element — lets us compare the exact onClick function. */
const reactProps = (el) => el[Object.keys(el).find((k) => k.startsWith('__reactProps$'))];
const reactKey = (el) => el[Object.keys(el).find((k) => k.startsWith('__reactFiber$'))].key;

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

const ACTIONS_CLASS = 'px-6 pb-6 pt-4 bg-white border-t border-gray-50 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]';
const NEW_SALE_CLASS = 'w-full py-3.5 mb-3 rounded-xl bg-[#F5C742] hover:bg-[#E5B532] text-white font-black text-sm transition-colors flex items-center justify-center gap-2 shadow-sm';
const SECONDARY_GRID_CLASS = 'grid grid-cols-2 gap-2 mb-4';
const SECONDARY_BUTTON_CLASS = 'flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors';
const SHARE_SECTION_CLASS = 'pt-3 border-t border-gray-100';
const SHARE_LABEL_CLASS = 'text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2';
const SHARE_GRID_CLASS = 'grid grid-cols-3 gap-2';
const SHARE_BASE = 'flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const GREEN_TONE = 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500';
const BLUE_TONE = 'border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 hover:border-blue-300 focus-visible:ring-blue-500';
const SHARE_CONFIG = [
  { key: 'sms', label: 'SMS', Icon: Smartphone, tone: GREEN_TONE },
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, tone: GREEN_TONE },
  { key: 'email', label: 'Email', Icon: Mail, tone: BLUE_TONE },
];

// anatomy
const newSaleButton = (w) => w.children[0];
const secondaryGrid = (w) => w.children[1];
const printButton = (w) => secondaryGrid(w).children[0];
const reprintButton = (w) => secondaryGrid(w).children[1];
const shareSection = (w) => w.children[2];
const shareGrid = (w) => shareSection(w).children[1];
const shareButtons = (w) => Array.from(shareGrid(w).children);
const allButtons = (w) => [newSaleButton(w), printButton(w), reprintButton(w), ...shareButtons(w)];

beforeEach(() => {
  vi.stubGlobal('alert', vi.fn());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(VARIANTS)('%s', (_variant, Block) => {
  const renderBlock = makeRenderBlock(Block);

  // ── 1. DOM shape ────────────────────────────────────────────────────────────────────────
  describe('1. DOM shape — exact three-level structure', () => {
    it('renders exactly one element: the action wrapper, with children [New Sale button, 2-col grid, share section]', () => {
      const { container, wrapper } = renderBlock(makeProps());
      expect(container.children).toHaveLength(1);
      const w = wrapper();
      expect(w.tagName).toBe('DIV');
      expect(cls(w)).toBe(ACTIONS_CLASS);
      expect(attrNames(w)).toEqual(['class']);
      expect(Array.from(w.children).map((c) => c.tagName)).toEqual(['BUTTON', 'DIV', 'DIV']);
      expect(w.childNodes).toHaveLength(3);
      expect(w.textContent).toBe('New SalePrint ReceiptReprint Inv.Share ReceiptSMSWhatsAppEmail');
    });

    it('A. New Sale: full-width primary button, ArrowRightCircle h-5 w-5, then the label', () => {
      const { wrapper } = renderBlock(makeProps());
      const b = newSaleButton(wrapper());
      expect(cls(b)).toBe(NEW_SALE_CLASS);
      expect(attrNames(b)).toEqual(['class', 'type']);
      expect(b.getAttribute('type')).toBe('button');
      expect(b.childNodes).toHaveLength(2);
      expectIcon(b.childNodes[0], ArrowRightCircle, 'h-5 w-5');
      expect(b.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
      expect(b.childNodes[1].textContent).toBe('New Sale');
    });

    it('B. secondary grid: grid-cols-2 with exactly [Print Receipt, Reprint Inv.], same class, Printer / RotateCcw h-4 w-4', () => {
      const { wrapper } = renderBlock(makeProps());
      const grid = secondaryGrid(wrapper());
      expect(cls(grid)).toBe(SECONDARY_GRID_CLASS);
      expect(attrNames(grid)).toEqual(['class']);
      expect(grid.children).toHaveLength(2);
      [[printButton(wrapper()), Printer, 'Print Receipt'], [reprintButton(wrapper()), RotateCcw, 'Reprint Inv.']].forEach(([b, Icon, label]) => {
        expect(b.tagName).toBe('BUTTON');
        expect(cls(b)).toBe(SECONDARY_BUTTON_CLASS);
        expect(attrNames(b)).toEqual(['class', 'type']);
        expect(b.getAttribute('type')).toBe('button');
        expect(b.childNodes).toHaveLength(2);
        expectIcon(b.childNodes[0], Icon, 'h-4 w-4');
        expect(b.childNodes[1].textContent).toBe(label);
      });
    });

    it('C. share section: [label <p>, grid-cols-3] with exactly three share buttons', () => {
      const { wrapper } = renderBlock(makeProps());
      const section = shareSection(wrapper());
      expect(cls(section)).toBe(SHARE_SECTION_CLASS);
      expect(attrNames(section)).toEqual(['class']);
      expect(Array.from(section.children).map((c) => c.tagName)).toEqual(['P', 'DIV']);
      expect(cls(section.children[0])).toBe(SHARE_LABEL_CLASS);
      expect(section.children[0].textContent).toBe('Share Receipt');
      expect(cls(shareGrid(wrapper()))).toBe(SHARE_GRID_CLASS);
      expect(attrNames(shareGrid(wrapper()))).toEqual(['class']);
      expect(shareButtons(wrapper())).toHaveLength(3);
    });

    it('C. each share button: base + tone class, icon h-4 w-4 aria-hidden, then the label text node', () => {
      const { wrapper } = renderBlock(makeProps());
      shareButtons(wrapper()).forEach((b, i) => {
        const { label, Icon, tone } = SHARE_CONFIG[i];
        expect(b.tagName).toBe('BUTTON');
        expect(cls(b)).toBe(`${SHARE_BASE} ${tone}`);
        expect(attrNames(b)).toEqual(['class', 'type']);
        expect(b.getAttribute('type')).toBe('button');
        expect(b.childNodes).toHaveLength(2);
        expectIcon(b.childNodes[0], Icon, 'h-4 w-4');
        expect(b.childNodes[0].getAttribute('aria-hidden')).toBe('true');
        expect(b.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
        expect(b.childNodes[1].textContent).toBe(label);
      });
    });

    it('exactly six buttons, in order; none disabled, none with aria-label/title/role', () => {
      const { container, wrapper } = renderBlock(makeProps());
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons).toEqual(allButtons(wrapper()));
      expect(buttons.map((b) => b.textContent)).toEqual(['New Sale', 'Print Receipt', 'Reprint Inv.', 'SMS', 'WhatsApp', 'Email']);
      for (const b of buttons) {
        expect(b.disabled).toBe(false);
        for (const attr of ['aria-label', 'title', 'role', 'disabled', 'aria-disabled']) expect(b.hasAttribute(attr), attr).toBe(false);
      }
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['New Sale', 'Print Receipt', 'Reprint Inv.', 'SMS', 'WhatsApp', 'Email']);
    });

    it('rendering fires no callback at all', () => {
      const props = makeProps();
      renderBlock(props);
      for (const fn of FN_PROPS) expect(props[fn], fn).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });
  });

  // ── 2. New Sale ─────────────────────────────────────────────────────────────────────────
  describe('2. New Sale — onClick={closeComplete} by reference', () => {
    it('the button\'s onClick IS the closeComplete function (same reference, no wrapper)', () => {
      const props = makeProps();
      const { wrapper } = renderBlock(props);
      expect(reactProps(newSaleButton(wrapper())).onClick).toBe(props.closeComplete);
    });

    it('a click calls closeComplete once with the click event (a `() => closeComplete()` wrapper would pass nothing)', () => {
      const props = makeProps();
      const { wrapper } = renderBlock(props);
      fireEvent.click(newSaleButton(wrapper()));
      expect(props.closeComplete).toHaveBeenCalledTimes(1);
      expect(props.closeComplete.mock.calls[0]).toHaveLength(1);
      expect(props.closeComplete.mock.calls[0][0].type).toBe('click');
      for (const fn of FN_PROPS.filter((f) => f !== 'closeComplete')) expect(props[fn], fn).not.toHaveBeenCalled();
    });

    it('render-time closure: a re-render with a new closeComplete hands the new reference to the button', () => {
      const props = makeProps();
      const { wrapper, rerenderWith } = renderBlock(props);
      const next = vi.fn();
      rerenderWith({ ...props, closeComplete: next });
      expect(reactProps(newSaleButton(wrapper())).onClick).toBe(next);
      fireEvent.click(newSaleButton(wrapper()));
      expect(next).toHaveBeenCalledTimes(1);
      expect(props.closeComplete).not.toHaveBeenCalled();
    });
  });

  // ── 3. Print Receipt ────────────────────────────────────────────────────────────────────
  describe('3. Print Receipt — the inline async handler owned by the button', () => {
    const clickPrint = async (w) => {
      await act(async () => { fireEvent.click(printButton(w)); });
      await flush();
    };
    const THERMAL_ARG_KEYS = [
      'full', 'cashGiven', 'changeAmount', 'customerNameOverride', 'customerPhone', 'customerEmail', 'customerTrn',
      'customerAddress', 'creditPreviousBalance', 'creditInvoiceCredit', 'creditAmountPaid', 'creditUpdatedBalance',
    ];

    describe('ownership', () => {
      it('Print Receipt is the only button whose onClick is async (returns a promise) and it is no prop function', async () => {
        const props = makeProps({ getSalesInvoiceById: vi.fn(() => new Promise(() => {})) });
        const { wrapper } = renderBlock(props);
        const onClicks = allButtons(wrapper()).map((b) => reactProps(b).onClick);
        const propFns = FN_PROPS.map((f) => props[f]);
        const returned = [];
        await act(async () => { onClicks.forEach((fn) => returned.push(fn({ type: 'click' }))); });
        expect(returned.map((r) => typeof r?.then === 'function')).toEqual([false, true, false, false, false, false]);
        expect(propFns).not.toContain(onClicks[1]);
        expect(onClicks[1].prototype).toBeUndefined();
      });

      it('the alert belongs to Print Receipt: a failing fetch alerts only via that button, never via the other five', async () => {
        const props = makeProps({ getSalesInvoiceById: vi.fn(async () => { throw new Error('offline'); }) });
        const { wrapper } = renderBlock(props);
        for (const b of [newSaleButton, reprintButton].map((f) => f(wrapper())).concat(shareButtons(wrapper()))) {
          await act(async () => { fireEvent.click(b); });
        }
        await flush();
        expect(props.getSalesInvoiceById).not.toHaveBeenCalled();
        expect(globalThis.alert).not.toHaveBeenCalled();

        await clickPrint(wrapper());
        expect(props.getSalesInvoiceById.mock.calls).toEqual([[987]]);
        expect(console.warn.mock.calls).toEqual([['POS print error', new Error('offline')]]);
        expect(globalThis.alert.mock.calls).toEqual([['Print failed: offline.']]);
      });
    });

    describe('thermal branch (tplInvoicePaper !== "A4")', () => {
      it('fetches, builds the exact 12-key thermal argument, then prints with the exact payload', async () => {
        const props = makeProps();
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.getSalesInvoiceById.mock.calls).toEqual([[987]]);
        const arg = props.buildThermalReceiptArtifacts.mock.calls[0][0];
        expect(props.buildThermalReceiptArtifacts).toHaveBeenCalledTimes(1);
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
        expect(Object.keys(props.printThermalReceiptWithConfiguredPrinter.mock.calls[0][0])).toEqual(['full', 'text', 'escPosBase64', 'title']);
        expect(props.getSalesInvoiceById.mock.invocationCallOrder[0]).toBeLessThan(props.buildThermalReceiptArtifacts.mock.invocationCallOrder[0]);
        expect(props.buildThermalReceiptArtifacts.mock.invocationCallOrder[0]).toBeLessThan(props.printThermalReceiptWithConfiguredPrinter.mock.invocationCallOrder[0]);
        for (const fn of ['resolveInvoiceA4TemplateFor', 'buildPosPrintData', 'isTaxInvoiceDocument', 'generateDocumentPrintHtml', 'printHtml']) {
          expect(props[fn], fn).not.toHaveBeenCalled();
        }
        expect(globalThis.alert).not.toHaveBeenCalled();
      });

      it('named customer and credit snapshot use `?? null` (zero survives, undefined → null)', async () => {
        const customer = { id: 'c-9', name: 'Jane Doe', phone: '0501234567', email: 'jane@shop.test', trn: 'TRN-9', address: 'Marina' };
        const props = makeProps({
          lastPaidInvoice: { ...PAID, customer, creditPreviousBalance: 0, creditInvoiceCredit: 40, creditAmountPaid: undefined, creditUpdatedBalance: 140 },
        });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.buildThermalReceiptArtifacts.mock.calls[0][0]).toEqual({
          full: FULL, cashGiven: 105, changeAmount: 5, customerNameOverride: 'Jane Doe',
          customerPhone: '0501234567', customerEmail: 'jane@shop.test', customerTrn: 'TRN-9', customerAddress: 'Marina',
          creditPreviousBalance: 0, creditInvoiceCredit: 40, creditAmountPaid: null, creditUpdatedBalance: 140,
        });
      });

      it('a customer whose id is the literal "walk-in" gets no name override', async () => {
        const props = makeProps({ lastPaidInvoice: { ...PAID, customer: { id: 'walk-in', name: 'Somebody' } } });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.buildThermalReceiptArtifacts.mock.calls[0][0].customerNameOverride).toBeNull();
      });

      it('title trims to "Receipt" when the full invoice has no number', async () => {
        const props = makeProps({ getSalesInvoiceById: vi.fn(async () => ({ id: 987 })) });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.printThermalReceiptWithConfiguredPrinter.mock.calls[0][0].title).toBe('Receipt');
      });

      it.each(['a4', 'A4 ', '80mm', undefined])('strict paper check: %j takes the thermal branch', async (paper) => {
        const props = makeProps({ tplInvoicePaper: paper });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.resolveInvoiceA4TemplateFor).not.toHaveBeenCalled();
        expect(props.buildThermalReceiptArtifacts).toHaveBeenCalledTimes(1);
      });
    });

    describe('A4 branch (tplInvoicePaper === "A4")', () => {
      const OPTIONS = {
        companyProfile: {
          companyName: 'Main Outlet', trn: '100200300400003', address: 'Dubai', phone: '04-000000', currency: 'AED',
          logoUrl: 'company-logo.png', stampUrl: undefined, showStampInPrint: false,
        },
      };

      it('resolves the template, builds data with the tax header, and prints generateDocumentPrintHtml(template, data, options)', async () => {
        const props = makeProps({ tplInvoicePaper: 'A4' });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.getSalesInvoiceById.mock.calls).toEqual([[987]]);
        expect(props.resolveInvoiceA4TemplateFor.mock.calls).toEqual([[FULL]]);
        expect(props.isTaxInvoiceDocument.mock.calls).toEqual([[FULL]]);
        expect(props.buildPosPrintData.mock.calls).toEqual([[FULL, props.tplInvoiceFooter, props.customerOptions, 'INVOICE-HEADER']]);
        expect(props.generateDocumentPrintHtml.mock.calls).toEqual([[{ id: 'tpl-a4' }, { printData: true }, OPTIONS]]);
        expect(Object.keys(props.generateDocumentPrintHtml.mock.calls[0][2])).toEqual(['companyProfile']);
        expect(Object.keys(props.generateDocumentPrintHtml.mock.calls[0][2].companyProfile)).toEqual(
          ['companyName', 'trn', 'address', 'phone', 'currency', 'logoUrl', 'stampUrl', 'showStampInPrint'],
        );
        expect(props.printHtml.mock.calls).toEqual([['<html>a4</html>']]);
        expect(props.buildThermalReceiptArtifacts).not.toHaveBeenCalled();
        expect(props.printThermalReceiptWithConfiguredPrinter).not.toHaveBeenCalled();
      });

      it('a non-tax document uses the receipt header', async () => {
        const props = makeProps({ tplInvoicePaper: 'A4', isTaxInvoiceDocument: vi.fn(() => false) });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.buildPosPrintData.mock.calls[0][3]).toBe('RECEIPT-HEADER');
      });

      it.each([
        ['data-url logo wins over company logo', { tplLogoDataUrl: 'data:logo' }, { logoUrl: 'data:logo' }],
        ['no logo anywhere → undefined', { company: null }, { logoUrl: undefined }],
        ['new template: stamp url present → showStampInPrint true', { tplStampDataUrl: 'data:stamp' }, { stampUrl: 'data:stamp', showStampInPrint: true }],
        ['legacy template uses tplInvoiceShowStamp (true)', { USE_NEW_POS_PRINT_TEMPLATE: false, tplInvoiceShowStamp: true }, { showStampInPrint: true }],
        ['legacy template, toggle off even with a stamp', { USE_NEW_POS_PRINT_TEMPLATE: false, tplInvoiceShowStamp: false, tplStampDataUrl: 'data:stamp' }, { showStampInPrint: false }],
      ])('options: %s', async (_label, overrides, expected) => {
        const props = makeProps({ tplInvoicePaper: 'A4', ...overrides });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.generateDocumentPrintHtml.mock.calls[0][2].companyProfile).toMatchObject({ currency: 'AED', ...expected });
      });

      it('generateDocumentPrintHtml\'s return value goes to printHtml unawaited', async () => {
        const pending = new Promise(() => {});
        const props = makeProps({ tplInvoicePaper: 'A4', generateDocumentPrintHtml: vi.fn(() => pending) });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.printHtml.mock.calls[0][0]).toBe(pending);
      });
    });

    describe('guards, side effects and failures', () => {
      it.each([
        ['no lastPaidInvoice', null],
        ['no invoice', { ...PAID, invoice: null }],
        ['no invoice id', { ...PAID, invoice: {} }],
      ])('%s → silent no-op (no fetch, no alert)', async (_label, lastPaidInvoice) => {
        const props = makeProps({ lastPaidInvoice });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.getSalesInvoiceById).not.toHaveBeenCalled();
        expect(globalThis.alert).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
      });

      it.each(['80mm', 'A4'])('paper %s: no drawer kick, no setter, no close — success or failure', async (tplInvoicePaper) => {
        const props = makeProps({ tplInvoicePaper, openCashDrawer: vi.fn() });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(props.openCashDrawer).not.toHaveBeenCalled();
        for (const fn of ['closeComplete', 'setShowReprintModal', 'setReceiptShareChannel']) expect(props[fn], fn).not.toHaveBeenCalled();
      });

      it('KNOWN GAP: no in-flight guard — double click starts two fetches and two prints, button never disables', async () => {
        const fetch = deferred();
        const props = makeProps({ getSalesInvoiceById: vi.fn(() => fetch.promise) });
        const { wrapper } = renderBlock(props);
        const button = printButton(wrapper());
        fireEvent.click(button);
        fireEvent.click(button);
        expect(button.disabled).toBe(false);
        expect(button.hasAttribute('aria-busy')).toBe(false);
        expect(button.textContent).toBe('Print Receipt');
        expect(props.getSalesInvoiceById).toHaveBeenCalledTimes(2);
        await act(async () => { fetch.resolve(FULL); });
        await flush();
        expect(props.buildThermalReceiptArtifacts).toHaveBeenCalledTimes(2);
        expect(props.printThermalReceiptWithConfiguredPrinter).toHaveBeenCalledTimes(2);
      });

      it.each([
        ['fetch', '80mm', { getSalesInvoiceById: vi.fn(async () => { throw new Error('offline'); }) }, 'Print failed: offline.'],
        ['thermal build', '80mm', { buildThermalReceiptArtifacts: vi.fn(async () => { throw new Error('bad template'); }) }, 'Print failed: bad template.'],
        ['thermal print', '80mm', { printThermalReceiptWithConfiguredPrinter: vi.fn(async () => { throw new Error('No printer'); }) }, 'Print failed: No printer.'],
        ['A4 render (sync)', 'A4', { generateDocumentPrintHtml: vi.fn(() => { throw new Error('template missing'); }) }, 'Print failed: template missing.'],
        ['A4 printHtml (sync)', 'A4', { printHtml: vi.fn(() => { throw new Error('popup blocked'); }) }, 'Print failed: popup blocked.'],
        ['message-less', '80mm', { getSalesInvoiceById: vi.fn(async () => { throw {}; }) }, 'Print failed: printer error.'],
        ['empty message', '80mm', { getSalesInvoiceById: vi.fn(async () => { throw new Error(''); }) }, 'Print failed: printer error.'],
      ])('a %s failure → console.warn("POS print error", err) then exactly one alert', async (_label, tplInvoicePaper, overrides, message) => {
        const props = makeProps({ tplInvoicePaper, ...overrides });
        const { wrapper } = renderBlock(props);
        await clickPrint(wrapper());
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn.mock.calls[0][0]).toBe('POS print error');
        expect(globalThis.alert.mock.calls).toEqual([[message]]);
        expect(console.warn.mock.invocationCallOrder[0]).toBeLessThan(globalThis.alert.mock.invocationCallOrder[0]);
        expect(props.closeComplete).not.toHaveBeenCalled();
        expect(wrapper()).not.toBeNull();
      });
    });
  });

  // ── 4. Reprint Inv. ─────────────────────────────────────────────────────────────────────
  describe('4. Reprint Inv. — arrow calling closeComplete() then setShowReprintModal(true)', () => {
    it('calls closeComplete with NO arguments, then setShowReprintModal(true), in that order, once each', () => {
      const props = makeProps();
      const { wrapper } = renderBlock(props);
      fireEvent.click(reprintButton(wrapper()));
      expect(props.closeComplete.mock.calls).toEqual([[]]);
      expect(props.setShowReprintModal.mock.calls).toEqual([[true]]);
      expect(props.closeComplete.mock.invocationCallOrder[0]).toBeLessThan(props.setShowReprintModal.mock.invocationCallOrder[0]);
      for (const fn of FN_PROPS.filter((f) => !['closeComplete', 'setShowReprintModal'].includes(f))) expect(props[fn], fn).not.toHaveBeenCalled();
    });

    it('the onClick is a zero-arity arrow, distinct from closeComplete and setShowReprintModal', () => {
      const props = makeProps();
      const { wrapper } = renderBlock(props);
      const onClick = reactProps(reprintButton(wrapper())).onClick;
      expect(typeof onClick).toBe('function');
      expect(onClick.prototype).toBeUndefined();
      expect(onClick).toHaveLength(0);
      expect(FN_PROPS.map((f) => props[f])).not.toContain(onClick);
      expect(onClick({ type: 'click' })).toBeUndefined();
    });

    it('uses the render-time closeComplete / setShowReprintModal after a re-render', () => {
      const props = makeProps();
      const { wrapper, rerenderWith } = renderBlock(props);
      const next = { closeComplete: vi.fn(), setShowReprintModal: vi.fn() };
      rerenderWith({ ...props, ...next });
      fireEvent.click(reprintButton(wrapper()));
      expect(next.closeComplete.mock.calls).toEqual([[]]);
      expect(next.setShowReprintModal.mock.calls).toEqual([[true]]);
      expect(props.closeComplete).not.toHaveBeenCalled();
    });
  });

  // ── 5. Share config ─────────────────────────────────────────────────────────────────────
  describe('5. Share config — sms / whatsapp / email', () => {
    it('React list keys, labels, icons and tones follow the static config order exactly', () => {
      const { wrapper } = renderBlock(makeProps());
      const buttons = shareButtons(wrapper());
      expect(buttons.map(reactKey)).toEqual(['sms', 'whatsapp', 'email']);
      buttons.forEach((b, i) => {
        expect(b.textContent).toBe(SHARE_CONFIG[i].label);
        expectIcon(b.querySelector('svg'), SHARE_CONFIG[i].Icon, 'h-4 w-4');
        expect(cls(b)).toBe(`${SHARE_BASE} ${SHARE_CONFIG[i].tone}`);
      });
    });

    it('each button calls setReceiptShareChannel with its own mapped key — one argument, no event forwarded', () => {
      const props = makeProps();
      const { wrapper } = renderBlock(props);
      const [sms, whatsapp, email] = shareButtons(wrapper());
      fireEvent.click(email);
      fireEvent.click(sms);
      fireEvent.click(whatsapp);
      fireEvent.click(sms);
      expect(props.setReceiptShareChannel.mock.calls).toEqual([['email'], ['sms'], ['whatsapp'], ['sms']]);
      for (const fn of FN_PROPS.filter((f) => f !== 'setReceiptShareChannel')) expect(props[fn], fn).not.toHaveBeenCalled();
    });

    it('three distinct zero-arity arrows, none of them a prop function', () => {
      const props = makeProps();
      const { wrapper } = renderBlock(props);
      const handlers = shareButtons(wrapper()).map((b) => reactProps(b).onClick);
      expect(new Set(handlers).size).toBe(3);
      for (const h of handlers) {
        expect(h.prototype).toBeUndefined();
        expect(h).toHaveLength(0);
        expect(FN_PROPS.map((f) => props[f])).not.toContain(h);
      }
    });

    it('uses the render-time setReceiptShareChannel after a re-render', () => {
      const props = makeProps();
      const { wrapper, rerenderWith } = renderBlock(props);
      const next = vi.fn();
      rerenderWith({ ...props, setReceiptShareChannel: next });
      fireEvent.click(shareButtons(wrapper())[2]);
      expect(next.mock.calls).toEqual([['email']]);
      expect(props.setReceiptShareChannel).not.toHaveBeenCalled();
    });
  });
});

// ── 6. source anchors ───────────────────────────────────────────────────────────────────
// EOL-normalised: sources are checked out with CRLF on Windows.
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const COMPONENT = readSource('../features/checkout/CheckoutCompleteActions.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const count = (src, needle) => src.split(needle).length - 1;
const words = (src, word) => (src.match(new RegExp(`(?<![\\w$])${word.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;
/** Source with `//` comment lines dropped — the component header names what stayed in POSSales. */
const codeOnly = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};

const BLOCK_START = '                {/* 6. Action Priority */}\n';
const AFTER_BLOCK = [
  '',
  '              </div>',
  '',
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
  '            </div>',
  '          );',
  '        }',
].join('\n');
const SUMMARY_CALL = [
  '                <CheckoutCompleteSummary',
  '                  lastPaidInvoice={lastPaidInvoice}',
  '                  paymentRows={paymentRows}',
  '                  usedMethods={usedMethods}',
  '                  formatCurrencyStr={formatCurrencyStr}',
  '                />',
].join('\n');
const GUARD = "        if (checkoutPhase === 'complete' && lastPaidInvoice) {\n          const closeComplete = () => {";
const PAYMENT_PHASE_START = '        const shippingChargeNum = Number(shippingCharge) || 0;';

/** The live POSSales call site: the `6. Action Priority` comment through the component's `/>`. */
const callSite = () => {
  const i = POS_SALES.indexOf(BLOCK_START);
  expect(i, 'call site start').toBeGreaterThan(0);
  const j = POS_SALES.indexOf(AFTER_BLOCK, i);
  expect(j, 'call site end').toBeGreaterThan(i);
  return POS_SALES.slice(i, j);
};
const originalCopy = () => between(SELF, '{/* ACTIONS-VERBATIM-START */}\n', '\n                {/* ACTIONS-VERBATIM-END */}');
const callCopy = () => between(SELF, '{/* CALL-VERBATIM-START */}\n', '\n                {/* CALL-VERBATIM-END */}');

// Print Receipt handler body: inside the original button, and inside the POSSales prop.
const ORIGINAL_PRINT_OPEN = '                    <button type="button" onClick={async () => {\n';
const ORIGINAL_PRINT_CLOSE = '\n                    }}\n';
const CALL_PRINT_OPEN = '                  onPrintReceipt={async () => {\n';
const CALL_PRINT_CLOSE = '\n                  }}\n                  onReprint={() => {\n';
const originalPrintBody = () => between(originalCopy(), ORIGINAL_PRINT_OPEN, ORIGINAL_PRINT_CLOSE);
const callPrintBody = () => between(callSite(), CALL_PRINT_OPEN, CALL_PRINT_CLOSE);

/** The four — and only four — edits between the original block and the component body. */
const SUBSTITUTIONS = () => [
  ['                  <button type="button" onClick={closeComplete}\n', '                  <button type="button" onClick={onNewSale}\n'],
  [`${ORIGINAL_PRINT_OPEN}${originalPrintBody()}${ORIGINAL_PRINT_CLOSE}`, '                    <button type="button" onClick={onPrintReceipt}\n'],
  ['                    <button type="button" onClick={() => { closeComplete(); setShowReprintModal(true); }}\n', '                    <button type="button" onClick={onReprint}\n'],
  ['                          onClick={() => setReceiptShareChannel(key)}\n', '                          onClick={() => onShare(key)}\n'],
];
const expectedComponentBody = () => {
  let body = originalCopy();
  expect(body.startsWith(BLOCK_START)).toBe(true);
  body = body.slice(BLOCK_START.length);
  for (const [from, to] of SUBSTITUTIONS()) {
    expect(count(body, from), from).toBe(1);
    body = body.replace(from, () => to);
  }
  return body;
};

const ALERT = "alert(`Print failed: ${err?.message || 'printer error'}.`)";
/** Every render-time closure the block reads from POSSales (excluding lucide icons). */
const BLOCK_DEPENDENCIES = [
  'closeComplete', 'lastPaidInvoice', 'getSalesInvoiceById', 'tplInvoicePaper', 'resolveInvoiceA4TemplateFor',
  'buildPosPrintData', 'tplInvoiceFooter', 'customerOptions', 'isTaxInvoiceDocument', 'tplInvoiceHeader',
  'tplReceiptHeader', 'tplOutletName', 'effectiveOutletTrn', 'tplOutletAddress', 'tplOutletPhone', 'tplLogoDataUrl',
  'company', 'tplStampDataUrl', 'USE_NEW_POS_PRINT_TEMPLATE', 'tplInvoiceShowStamp', 'printHtml',
  'generateDocumentPrintHtml', 'buildThermalReceiptArtifacts', 'printThermalReceiptWithConfiguredPrinter',
  'setShowReprintModal', 'setReceiptShareChannel',
];
const PRINT_DEPENDENCIES = BLOCK_DEPENDENCIES.filter((d) => !['closeComplete', 'setShowReprintModal', 'setReceiptShareChannel'].includes(d));
const BLOCK_ICONS = ['ArrowRightCircle', 'Printer', 'RotateCcw', 'Smartphone', 'MessageCircle', 'Mail'];
const COMPONENT_PROPS = ['onNewSale', 'onPrintReceipt', 'onReprint', 'onShare'];
const signature = (fnName) => {
  const open = `function ${fnName}({`;
  const i = SELF.indexOf(open);
  expect(i, fnName).toBeGreaterThan(0);
  return SELF.slice(i + open.length, SELF.indexOf('}) {', i)).split(',').map((s) => s.trim()).filter(Boolean);
};

describe('6. source — the copies', () => {
  it('the original copy is the pre-extraction block (60 lines, 22-line Print Receipt button)', () => {
    expect(originalCopy().split('\n')).toHaveLength(60);
    expect(originalPrintBody().split('\n')).toHaveLength(17);
    expect(count(originalCopy(), ALERT)).toBe(1);
  });

  it('the component return body is the original block with exactly the four callback substitutions (41 lines)', () => {
    const body = expectedComponentBody();
    expect(body.split('\n')).toHaveLength(41);
    expect(count(COMPONENT, `  return (\n${body}\n  );\n}`)).toBe(1);
    // Nothing else changed: undoing the four substitutions on the live component restores the original block.
    let restored = between(COMPONENT, '  return (\n', '\n  );\n}');
    for (const [from, to] of SUBSTITUTIONS()) {
      expect(count(restored, to), to).toBe(1);
      restored = restored.replace(to, () => from);
    }
    expect(`${BLOCK_START}${restored}`).toBe(originalCopy());
  });

  it('the call-site copy in this file is the live POSSales call site, byte for byte (28 lines)', () => {
    expect(callCopy()).toBe(callSite());
    expect(callSite().split('\n')).toHaveLength(28);
    expect(count(POS_SALES, BLOCK_START)).toBe(1);
    expect(count(POS_SALES, '{/* 6. Action Priority */}')).toBe(1);
  });

  it('the POSSales Print Receipt handler is the original inline body, only de-indented by two spaces', () => {
    const original = originalPrintBody().split('\n');
    for (const line of original) expect(line.startsWith('  '), line).toBe(true);
    expect(callPrintBody()).toBe(original.map((l) => l.slice(2)).join('\n'));
    expect(callPrintBody().split('\n')).toHaveLength(17);
  });

  it('both harness prop lists are exactly the block\'s POSSales dependencies, all read by the call site', () => {
    expect([...signature('OriginalActionBlock')].sort()).toEqual([...BLOCK_DEPENDENCIES].sort());
    expect([...signature('ExtractedActionBlock')].sort()).toEqual([...BLOCK_DEPENDENCIES].sort());
    for (const dep of BLOCK_DEPENDENCIES) {
      expect(words(originalCopy(), dep), dep).toBeGreaterThan(0);
      expect(words(callSite(), dep), dep).toBeGreaterThan(0);
    }
  });
});

describe('6. source — CheckoutCompleteActions', () => {
  it('props are exactly onNewSale, onPrintReceipt, onReprint, onShare', () => {
    expect(COMPONENT).toContain('function CheckoutCompleteActions({\n  onNewSale,\n  onPrintReceipt,\n  onReprint,\n  onShare,\n}) {');
    expect(count(COMPONENT, 'function ')).toBe(1);
    expect(COMPONENT).toContain('\nexport default CheckoutCompleteActions;\n');
  });

  it('imports only React and the six lucide icons', () => {
    const imports = COMPONENT.split('\n').filter((l) => l.startsWith('import '));
    expect(imports).toEqual([
      "import React from 'react';",
      "import { ArrowRightCircle, Mail, MessageCircle, Printer, RotateCcw, Smartphone } from 'lucide-react';",
    ]);
    for (const icon of BLOCK_ICONS) expect(words(codeOnly(COMPONENT), icon), icon).toBeGreaterThan(1);
  });

  it('has no hooks, state, context, effects, async, API calls or timers', () => {
    const code = codeOnly(COMPONENT);
    expect(code).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(code).not.toMatch(/\bmemo\b|createContext|useContext|forwardRef|useState|useEffect|useRef/);
    expect(code).not.toMatch(/\basync\b|\bawait\b|fetch\(|axios|\/api\/|setTimeout|setInterval|Promise/);
  });

  it('owns none of the POSSales handlers, state or dialogs', () => {
    const code = codeOnly(COMPONENT);
    for (const absent of ['ReceiptShareModal', 'handlePrintReceipt', 'closeComplete', 'receiptShareChannel', 'setReceiptShareChannel',
      'showReprintModal', 'setShowReprintModal', 'handleReceiptShareSend', 'alert(', 'console.', 'getSalesInvoiceById', 'lastPaidInvoice',
      'tplInvoicePaper', 'printHtml', 'buildThermalReceiptArtifacts', 'printThermalReceiptWithConfiguredPrinter', 'processPayment',
      'checkoutPhase', 'showPaymentDialog', 'setShowPaymentDialog', 'openCashDrawer', 'disabled', 'aria-label']) {
      expect(code, absent).not.toContain(absent);
    }
  });

  it('handler wiring: New Sale / Print / Reprint by reference, share buttons call onShare(key)', () => {
    const code = codeOnly(COMPONENT);
    expect(count(code, 'onClick=')).toBe(4);
    expect(count(code, '<button type="button" onClick={onNewSale}\n')).toBe(1);
    expect(count(code, '<button type="button" onClick={onPrintReceipt}\n')).toBe(1);
    expect(count(code, '<button type="button" onClick={onReprint}\n')).toBe(1);
    expect(count(code, 'onClick={() => onShare(key)}')).toBe(1);
    expect(code).not.toMatch(/onNewSale\(|onPrintReceipt\(|onReprint\(/);
    expect(code).not.toMatch(/onShare\((?!key\))/);
    for (const prop of COMPONENT_PROPS) expect(words(code, prop), prop).toBe(2);
  });
});

describe('6. source — POSSales call site, location and boundary', () => {
  it('imports CheckoutCompleteActions once and renders it exactly once', () => {
    expect(count(POS_SALES, "import CheckoutCompleteActions from './POS/features/checkout/CheckoutCompleteActions';\n")).toBe(1);
    expect(POS_SALES.match(/<CheckoutCompleteActions\b/g)).toHaveLength(1);
    expect(words(POS_SALES, 'CheckoutCompleteActions')).toBe(3); // import name + import path + JSX tag
  });

  it('the call passes exactly the four props, in order, with the specified expressions', () => {
    const c = callSite();
    expect(c.startsWith(`${BLOCK_START}                <CheckoutCompleteActions\n                  onNewSale={closeComplete}\n${CALL_PRINT_OPEN}`)).toBe(true);
    expect(c.endsWith([
      '                  }}',
      '                  onReprint={() => {',
      '                    closeComplete();',
      '                    setShowReprintModal(true);',
      '                  }}',
      '                  onShare={(key) => setReceiptShareChannel(key)}',
      '                />',
    ].join('\n'))).toBe(true);
    expect(c.split('\n').filter((l) => /^ {18}\w+=/.test(l)).map((l) => l.trim().split('=')[0])).toEqual(COMPONENT_PROPS);
  });

  it('sits directly after the CheckoutCompleteSummary call (one blank line between)', () => {
    expect(count(POS_SALES, `${SUMMARY_CALL}\n\n${BLOCK_START}                <CheckoutCompleteActions\n`)).toBe(1);
  });

  it('ends directly before the card close, and the ReceiptShareModal conditional follows immediately, OUTSIDE the component', () => {
    expect(count(POS_SALES, `${callSite()}${AFTER_BLOCK}`)).toBe(1);
    expect(callSite().endsWith('\n                />')).toBe(true);
  });

  it('lives inside the complete-phase branch, in order: guard → closeComplete → summary → actions → share modal → payment phase', () => {
    const guard = POS_SALES.indexOf(GUARD);
    const summary = POS_SALES.indexOf(SUMMARY_CALL);
    const actions = POS_SALES.indexOf(BLOCK_START);
    const actionsEnd = actions + callSite().length;
    const modal = POS_SALES.indexOf('              {receiptShareChannel && (\n                <ReceiptShareModal');
    const payment = POS_SALES.indexOf(PAYMENT_PHASE_START);
    expect(guard).toBeGreaterThan(0);
    expect([guard, summary, actions, actionsEnd, modal, payment]).toEqual([...[guard, summary, actions, actionsEnd, modal, payment]].sort((a, b) => a - b));
    expect(new Set([guard, summary, actions, actionsEnd, modal, payment]).size).toBe(6);
    expect(count(POS_SALES, GUARD)).toBe(1);
    expect(count(POS_SALES, PAYMENT_PHASE_START)).toBe(1);
  });

  it('wiring counts inside the call site', () => {
    const c = callSite();
    expect(count(c, '<button')).toBe(0);
    expect(count(c, 'onClick=')).toBe(0);
    expect(count(c, 'onNewSale={closeComplete}\n')).toBe(1);
    expect(words(c, 'closeComplete')).toBe(2);
    expect(count(c, 'closeComplete()')).toBe(1);
    expect(count(c, 'onNewSale={() =>')).toBe(0);
    expect(words(c, 'setShowReprintModal')).toBe(1);
    expect(words(c, 'setReceiptShareChannel')).toBe(1);
    expect(count(c, 'onPrintReceipt={async () => {')).toBe(1);
    expect(count(c, 'async')).toBe(1);
    expect(count(c, "tplInvoicePaper === 'A4'")).toBe(1);
  });

  it('things the call site deliberately does not contain', () => {
    const c = callSite();
    for (const absent of ['ReceiptShareModal', 'handleReceiptShareSend', 'setReceiptShareChannel(null)', 'receiptShareInitialValue',
      'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'processPayment', 'PaymentAllocationPanel', 'CheckoutCompleteSummary',
      'checkoutPhase', 'showPaymentDialog', 'setShowPaymentDialog', 'setCheckoutPhase', 'setSelectedCustomer', 'openCashDrawer',
      'disabled', 'aria-label', 'const closeComplete', 'z-50', 'paymentBlockRows', 'setLastPaidInvoice', 'className', 'New Sale',
      'Share Receipt', "key: 'sms'"]) {
      expect(c, absent).not.toContain(absent);
    }
    expect(words(c, 'receiptShareChannel')).toBe(0);
    for (const icon of BLOCK_ICONS) expect(words(c, icon), icon).toBe(0);
  });
});

describe('6. source — Print Receipt alert ownership', () => {
  it('the alert exists exactly once in all of POSSales, inside the onPrintReceipt handler, and never in the component', () => {
    expect(count(POS_SALES, ALERT)).toBe(1);
    expect(count(callPrintBody(), ALERT)).toBe(1);
    expect(count(callSite().replace(callPrintBody(), ''), 'alert(')).toBe(0);
    expect(codeOnly(COMPONENT)).not.toContain('alert');
  });

  it('the POSSales onPrintReceipt handler holds the whole async body: guard, fetch, both branches, warn + alert', () => {
    const print = callPrintBody();
    for (const needle of [
      '                    if (!lastPaidInvoice?.invoice?.id) return;',
      '                      const full = await getSalesInvoiceById(lastPaidInvoice.invoice.id);',
      "                      if (tplInvoicePaper === 'A4') {",
      '                        printHtml(generateDocumentPrintHtml(template, data, options));',
      '                        const { text, escPosBase64 } = await buildThermalReceiptArtifacts({',
      '                        await printThermalReceiptWithConfiguredPrinter({',
      "                          full, text, escPosBase64, title: `Receipt ${full.invoiceNumber || ''}`.trim(),",
      `                    } catch (err) { console.warn('POS print error', err); ${ALERT}; }`,
    ]) {
      expect(count(print, needle), needle).toBe(1);
    }
    for (const dep of PRINT_DEPENDENCIES) expect(words(print, dep), dep).toBeGreaterThan(0);
    for (const absent of ['closeComplete', 'setShowReprintModal', 'setReceiptShareChannel', 'openCashDrawer', 'disabled', 'finally']) {
      expect(print, absent).not.toContain(absent);
    }
  });

  it('the child only forwards the click: onClick={onPrintReceipt} on the Print Receipt button', () => {
    expect(COMPONENT).toContain([
      '                    <button type="button" onClick={onPrintReceipt}',
      '                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">',
      '                      <Printer className="h-4 w-4" />Print Receipt',
      '                    </button>',
    ].join('\n'));
  });

  it('no named Print Receipt handler exists anywhere in POSSales or the component', () => {
    for (const src of [POS_SALES, COMPONENT]) {
      expect(src).not.toMatch(/\bhandlePrintReceipt\b/);
      expect(src).not.toMatch(/\bhandleCompletePrintReceipt\b/);
    }
  });
});

describe('6. source — ownership stays in POSSales', () => {
  it('closeComplete is defined once, inside the complete branch, before the call site', () => {
    expect(count(POS_SALES, '          const closeComplete = () => {')).toBe(1);
    const branch = POS_SALES.slice(POS_SALES.indexOf(GUARD), POS_SALES.indexOf(PAYMENT_PHASE_START));
    expect(words(branch, 'closeComplete')).toBe(3); // definition + onNewSale + onReprint
    expect(words(POS_SALES, 'closeComplete')).toBe(3);
    expect(POS_SALES.indexOf('const closeComplete = () => {')).toBeLessThan(POS_SALES.indexOf(BLOCK_START));
    expect(words(codeOnly(COMPONENT), 'closeComplete')).toBe(0);
  });

  it('state and handlers the block reads are owned by POSSales / useCheckout, not by the component', () => {
    expect(count(POS_SALES, '  const [showReprintModal, setShowReprintModal] = useState(false);')).toBe(1);
    expect(count(POS_SALES, '  const [receiptShareChannel, setReceiptShareChannel] = useState(null);')).toBe(1);
    expect(count(POS_SALES, '  const handleReceiptShareSend = useCallback(async (value) => {')).toBe(1);
    expect(POS_SALES).toMatch(/\n {4}lastPaidInvoice,\n[\s\S]*?\} = useCheckout\(\{/);
    expect(POS_SALES).toMatch(/^import \{[^}]*\bgetSalesInvoiceById\b[^}]*\} from '\.\.\/\.\.\/api\/salesInvoiceApi';$/m);
  });

  it('every block dependency is declared in POSSales outside the call site', () => {
    const outside = POS_SALES.replace(callSite(), '');
    for (const dep of BLOCK_DEPENDENCIES) expect(words(outside, dep), dep).toBeGreaterThan(0);
  });

  it('ReceiptShareModal: rendered once, conditionally, keyed by receiptShareChannel — outside the call site and the component', () => {
    const outside = POS_SALES.replace(callSite(), '');
    expect(count(POS_SALES, '<ReceiptShareModal')).toBe(1);
    expect(count(outside, '<ReceiptShareModal')).toBe(1);
    expect(count(outside, '{receiptShareChannel && (\n                <ReceiptShareModal\n                  key={receiptShareChannel}')).toBe(1);
    expect(count(outside, 'onClose={() => setReceiptShareChannel(null)}')).toBe(1);
    expect(count(outside, 'onSend={handleReceiptShareSend}')).toBe(1);
    expect(codeOnly(COMPONENT)).not.toContain('ReceiptShareModal');
  });
});
