import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CreditCard, X } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CurrencyAmount } from '../POSCurrency';
import CheckoutPaymentHeader from '../features/checkout/CheckoutPaymentHeader';

/**
 * Characterization of the payment-phase HEADER inside the POSSales.jsx checkout IIFE — the
 * `bg-[#F5C742]` bar with the CreditCard badge, the "Checkout" title, the item-count / invoice-no
 * caption, the Balance Due / Total Amount figure and the header X. Pinned against a verbatim copy
 * before extraction.
 *
 * Out of scope (owned by CheckoutScreen.characterization.test.jsx and not repeated here): the
 * payment root, the preview column, the settlement summary, PaymentAllocationPanel, remarks, the
 * settlement footer and the X-vs-Cancel comparison.
 *
 * invoiceNo / grandTotal / depositAmt / effectiveDue are derived in POSSales at the top of the
 * payment branch; the DERIVE block below is that derivation copied verbatim (enforced by the
 * source block) so fixtures match production.
 */

// ── the verbatim region ─────────────────────────────────────────────────────────────────
function OriginalPaymentHeaderMarkup({ currentInvoice, invoiceNo, depositAmt, effectiveDue, grandTotal, setShowPaymentDialog }) {
  return (
    <>
      {/* VERBATIM-START */}
              <div className="bg-[#F5C742] px-3 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1E293B] flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-[#F5C742]" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base leading-none">Checkout</p>
                    <p className="text-[#1E293B]/60 text-[10px] mt-0.5">{currentInvoice.items.length} item{currentInvoice.items.length !== 1 ? 's' : ''}{invoiceNo ? ` · ${invoiceNo}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[#1E293B]/60 text-[10px]">{depositAmt > 0 ? 'Balance Due' : 'Total Amount'}</p>
                    <p className="text-white font-black text-2xl leading-none"><CurrencyAmount amount={depositAmt > 0 ? effectiveDue : grandTotal} /></p>
                  </div>
                  <button type="button" onClick={() => setShowPaymentDialog(false)} className="w-9 h-9 rounded-xl bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors">
                    <X className="h-5 w-5 text-[#1E293B]" />
                  </button>
                </div>
              </div>
      {/* VERBATIM-END */}
    </>
  );
}

// ── fixtures and helpers ────────────────────────────────────────────────────────────────
/** The POSSales derivation (verbatim between the DERIVE markers). */
function derive({ shippingCharge, currentInvoice, activeLayawayDeposit, checkoutEffectiveDue, previewInvoiceNo }) {
  // DERIVE-START
        const shippingChargeNum = Number(shippingCharge) || 0;
        const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
        // Owned by the Payment Manager (checkoutEffectiveDue) so the screen and the manager
        // measure every allocation against exactly the same amount due.
        const effectiveDue = checkoutEffectiveDue;
        // Real next number from the backend sequence (fetched when the dialog
        // opened); blank until it lands so no fabricated number is shown.
        const invoiceNo = previewInvoiceNo || '';
  // DERIVE-END
  return { currentInvoice, invoiceNo, depositAmt, effectiveDue, grandTotal };
}

const items = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const BASE = { shippingCharge: '', currentInvoice: { items: items(2), total: 100 }, activeLayawayDeposit: 0, checkoutEffectiveDue: 100, previewInvoiceNo: 'SI-POS-000124' };
const inputs = (overrides = {}) => ({ ...BASE, ...overrides });

const CASES = {
  'two items, invoice no, no deposit': inputs(),
  'one item (singular)': inputs({ currentInvoice: { items: items(1), total: 100 } }),
  'zero items, empty invoice no': inputs({ currentInvoice: { items: [], total: 0 }, previewInvoiceNo: '', checkoutEffectiveDue: 0 }),
  'null invoice no': inputs({ previewInvoiceNo: null }),
  'undefined invoice no, undefined total': inputs({ previewInvoiceNo: undefined, currentInvoice: { items: items(3) } }),
  'shipping, no deposit (effectiveDue ignored)': inputs({ shippingCharge: '15', checkoutEffectiveDue: 999 }),
  'non-numeric shipping': inputs({ shippingCharge: 'abc' }),
  'deposit → effectiveDue': inputs({ activeLayawayDeposit: 30, checkoutEffectiveDue: 70 }),
  'deposit with zero effectiveDue': inputs({ activeLayawayDeposit: 30, checkoutEffectiveDue: 0 }),
  'deposit with undefined effectiveDue': inputs({ activeLayawayDeposit: 30, checkoutEffectiveDue: undefined }),
  'negative deposit ignored': inputs({ activeLayawayDeposit: -5, checkoutEffectiveDue: 70 }),
  'fractional rounding': inputs({ shippingCharge: '2.005', currentInvoice: { items: items(1), total: 12.345 }, activeLayawayDeposit: 0.125, checkoutEffectiveDue: 14.225 }),
};
const ENTRIES = Object.entries(CASES);

const renderOriginal = (raw, setShowPaymentDialog = vi.fn()) =>
  render(<OriginalPaymentHeaderMarkup {...derive(raw)} setShowPaymentDialog={setShowPaymentDialog} />);
const cls = (el) => el.getAttribute('class');
const header = (container) => container.firstElementChild;
const caption = (container) => header(container).children[0].children[1].children[1];
const figureBlock = (container) => header(container).children[1].children[0];
const xButton = (container) => header(container).querySelector('button');

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── 1. original markup ──────────────────────────────────────────────────────────────────
describe('1. original payment-header markup', () => {
  it.each(ENTRIES)('exact HTML: %s', (_name, raw) => {
    const { container } = renderOriginal(raw);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('structure and exact classes', () => {
    const { container } = renderOriginal(CASES['two items, invoice no, no deposit']);
    expect(container.children).toHaveLength(1);
    const h = header(container);
    expect(h.tagName).toBe('DIV');
    expect(cls(h)).toBe('bg-[#F5C742] px-3 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0');
    expect(Array.from(h.children).map(cls)).toEqual(['flex items-center gap-3', 'flex items-center gap-3']);
    const [left, right] = h.children;
    expect(cls(left.children[0])).toBe('w-9 h-9 rounded-xl bg-[#1E293B] flex items-center justify-center');
    expect(left.children[1].getAttribute('class')).toBeNull();
    expect(Array.from(left.children[1].children).map(cls)).toEqual(['text-white font-bold text-base leading-none', 'text-[#1E293B]/60 text-[10px] mt-0.5']);
    expect(Array.from(right.children).map((c) => c.tagName)).toEqual(['DIV', 'BUTTON']);
    expect(cls(right.children[0])).toBe('text-right');
    expect(Array.from(right.children[0].children).map(cls)).toEqual(['text-[#1E293B]/60 text-[10px]', 'text-white font-black text-2xl leading-none']);
  });

  it('title is exactly "Checkout" and the badge icon is CreditCard', () => {
    const { container } = renderOriginal(CASES['two items, invoice no, no deposit']);
    expect(header(container).children[0].children[1].children[0].textContent).toBe('Checkout');
    const badge = header(container).children[0].children[0];
    expect(badge.children).toHaveLength(1);
    expectIcon(badge.firstElementChild, CreditCard, 'h-5 w-5 text-[#F5C742]');
  });

  it.each([
    ['two items, invoice no, no deposit', '2 items · SI-POS-000124'],
    ['one item (singular)', '1 item · SI-POS-000124'],
    ['zero items, empty invoice no', '0 items'],
    ['null invoice no', '2 items'],
    ['undefined invoice no, undefined total', '3 items'],
  ])('caption: %s', (name, text) => {
    const { container } = renderOriginal(CASES[name]);
    expect(caption(container).textContent).toBe(text);
  });

  it.each([
    ['two items, invoice no, no deposit', 'Total Amount', '100.00'],
    ['zero items, empty invoice no', 'Total Amount', '0.00'],
    ['undefined invoice no, undefined total', 'Total Amount', '0.00'],
    ['shipping, no deposit (effectiveDue ignored)', 'Total Amount', '115.00'],
    ['non-numeric shipping', 'Total Amount', '100.00'],
    ['deposit → effectiveDue', 'Balance Due', '70.00'],
    ['deposit with zero effectiveDue', 'Balance Due', '0.00'],
    ['deposit with undefined effectiveDue', 'Balance Due', '0.00'],
    ['negative deposit ignored', 'Total Amount', '100.00'],
    ['fractional rounding', 'Balance Due', '14.22'],
  ])('figure label and amount: %s', (name, label, amount) => {
    const { container } = renderOriginal(CASES[name]);
    expect(figureBlock(container).children[0].textContent).toBe(label);
    expect(figureBlock(container).children[1].textContent.trim()).toBe(amount);
  });

  it('the figure is the real CurrencyAmount', () => {
    const { container } = renderOriginal(CASES['deposit → effectiveDue']);
    const reference = document.createElement('div');
    const refView = render(<CurrencyAmount amount={70} />, { container: reference });
    expect(figureBlock(container).children[1].innerHTML).toBe(reference.innerHTML);
    refView.unmount();
  });

  it('X button: exact attributes and icon, and the only interactive element', () => {
    const { container } = renderOriginal(CASES['two items, invoice no, no deposit']);
    const x = xButton(container);
    expect(Array.from(x.attributes).map((a) => [a.name, a.value])).toEqual([
      ['type', 'button'],
      ['class', 'w-9 h-9 rounded-xl bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors'],
    ]);
    expect(x.children).toHaveLength(1);
    expect(x.textContent).toBe('');
    expectIcon(x.firstElementChild, X, 'h-5 w-5 text-[#1E293B]');
    expect(container.querySelectorAll('button, input, a, select, textarea')).toHaveLength(1);
  });

  it('X calls setShowPaymentDialog(false) exactly once — no event, nothing else', () => {
    const setShowPaymentDialog = vi.fn();
    const { container } = renderOriginal(CASES['deposit → effectiveDue'], setShowPaymentDialog);
    fireEvent.click(xButton(container));
    expect(setShowPaymentDialog.mock.calls).toEqual([[false]]);
  });
});

// ── 2. extracted component ──────────────────────────────────────────────────────────────
/** The POSSales call site (enforced byte-for-byte below): parent-computed values passed down. */
function ParentWiring({ currentInvoice, invoiceNo, depositAmt, effectiveDue, grandTotal, setShowPaymentDialog }) {
  return (
    <>
              <CheckoutPaymentHeader
                itemCount={currentInvoice.items.length}
                invoiceNo={invoiceNo}
                depositAmt={depositAmt}
                effectiveDue={effectiveDue}
                grandTotal={grandTotal}
                onClose={() => setShowPaymentDialog(false)}
              />
    </>
  );
}
const renderExtracted = (raw, setShowPaymentDialog = vi.fn()) =>
  render(<ParentWiring {...derive(raw)} setShowPaymentDialog={setShowPaymentDialog} />);

describe('2. CheckoutPaymentHeader DOM parity', () => {
  it.each(ENTRIES)('POSSales-shaped call site renders HTML identical to the pre-extraction markup: %s', (_name, raw) => {
    const original = renderOriginal(raw).container.innerHTML;
    cleanup();
    const { container } = renderExtracted(raw);
    expect(container.innerHTML).toBe(original);
  });

  it('X through the call site calls setShowPaymentDialog(false) exactly once, like the original', () => {
    const setShowPaymentDialog = vi.fn();
    const { container } = renderExtracted(CASES['deposit → effectiveDue'], setShowPaymentDialog);
    fireEvent.click(xButton(container));
    expect(setShowPaymentDialog.mock.calls).toEqual([[false]]);
  });

  it('the component hands the click straight to onClose (the parent arrow is what discards the event)', () => {
    const onClose = vi.fn();
    const { container } = render(<CheckoutPaymentHeader itemCount={1} invoiceNo="" depositAmt={0} effectiveDue={0} grandTotal={0} onClose={onClose} />);
    fireEvent.click(xButton(container));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the passed values as-is, without recomputing them', () => {
    const { container } = render(<CheckoutPaymentHeader itemCount={7} invoiceNo="INV-9" depositAmt={0} effectiveDue={1} grandTotal={999} onClose={vi.fn()} />);
    expect(caption(container).textContent).toBe('7 items · INV-9');
    expect(figureBlock(container).children[0].textContent).toBe('Total Amount');
    expect(figureBlock(container).children[1].textContent.trim()).toBe('999.00');
    cleanup();
    const deposit = render(<CheckoutPaymentHeader itemCount={0} invoiceNo={undefined} depositAmt={4} effectiveDue={777} grandTotal={1} onClose={vi.fn()} />);
    expect(caption(deposit.container).textContent).toBe('0 items');
    expect(figureBlock(deposit.container).children[0].textContent).toBe('Balance Due');
    expect(figureBlock(deposit.container).children[1].textContent.trim()).toBe('777.00');
  });
});

// ── source ──────────────────────────────────────────────────────────────────────────────
// EOL-normalised: sources are checked out with CRLF on Windows.
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};
const count = (src, needle) => src.split(needle).length - 1;
const VERBATIM = () => between(SELF, '{/* VERBATIM-START */}\n', '\n      {/* VERBATIM-END */}');
const DERIVE = () => between(SELF, '// DERIVE-START\n', '\n  // DERIVE-END');
const CALL = [
  '              <CheckoutPaymentHeader',
  '                itemCount={currentInvoice.items.length}',
  '                invoiceNo={invoiceNo}',
  '                depositAmt={depositAmt}',
  '                effectiveDue={effectiveDue}',
  '                grandTotal={grandTotal}',
  '                onClose={() => setShowPaymentDialog(false)}',
  '              />',
].join('\n');
const PANEL_CALL = [
  '                  <PaymentAllocationPanel',
  '                    payment={checkoutPayment}',
  '                    compatibility={checkoutCompatibility}',
  '                    customers={customerOptions}',
  '                    onCustomerCreated={loadPosCustomers}',
  '                    selectedCustomerId={selectedCustomer}',
  '                    selectedCustomerName={selectedCustomerData?.name}',
  '                    bankAccounts={checkoutOnlineBankAccounts}',
  '                    bankAccountsLoading={checkoutOnlineBankAccountsLoading}',
  '                  />',
].join('\n');

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary is
 * asserted against source.
 */
describe('source — CheckoutPaymentHeader', () => {
  const SOURCE = readSource('../features/checkout/CheckoutPaymentHeader.jsx');

  it('its return body is the verbatim copy except the itemCount and onClose substitutions (20 lines)', () => {
    expect(VERBATIM().split('\n')).toHaveLength(20);
    const substituted = VERBATIM()
      .replaceAll('{currentInvoice.items.length}', '{itemCount}')
      .replace('currentInvoice.items.length !== 1', 'itemCount !== 1')
      .replace('onClick={() => setShowPaymentDialog(false)}', 'onClick={onClose}');
    expect(substituted).not.toContain('currentInvoice');
    expect(substituted).not.toContain('setShowPaymentDialog');
    expect(count(SOURCE, `  return (\n${substituted}\n  );\n}`)).toBe(1);
  });

  it('the ParentWiring call site in this file is the POSSales call site, byte for byte', () => {
    expect(count(SELF, CALL)).toBe(1);
    expect(count(POS_SALES, CALL)).toBe(1);
  });

  it('props are exactly itemCount, invoiceNo, depositAmt, effectiveDue, grandTotal, onClose', () => {
    expect(SOURCE).toContain('function CheckoutPaymentHeader({\n  itemCount,\n  invoiceNo,\n  depositAmt,\n  effectiveDue,\n  grandTotal,\n  onClose,\n}) {');
  });

  it('has no hooks, state, context, memo, effects, async, API calls or derivation', () => {
    const code = SOURCE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(code).not.toMatch(/\bmemo\b|createContext|useContext|forwardRef/);
    expect(code).not.toMatch(/\basync\b|\bawait\b|fetch\(|axios|\/api\/|setTimeout|setInterval/);
    for (const absent of ['currentInvoice', 'checkoutPayment', 'checkoutPhase', 'showPaymentDialog', 'ShowPaymentDialog', 'Number(', 'shippingCharge', 'activeLayawayDeposit', 'checkoutEffectiveDue', 'previewInvoiceNo', '|| 0', ' + ', 'setCheckoutError', 'cancelCheckoutTenders', 'processPayment', 'PaymentAllocationPanel', 'onChange']) {
      expect(code, absent).not.toContain(absent);
    }
    expect(count(code, 'onClick=')).toBe(1);
    expect(code).toContain("import { CreditCard, X } from 'lucide-react';");
    expect(code).toContain("import { CurrencyAmount } from '../../POSCurrency';");
  });
});

describe('source — POSSales wiring (CheckoutPaymentHeader boundary)', () => {
  it('imports it once and renders it exactly once', () => {
    expect(count(POS_SALES, "import CheckoutPaymentHeader from './POS/features/checkout/CheckoutPaymentHeader';\n")).toBe(1);
    expect(POS_SALES.match(/<CheckoutPaymentHeader\b/g)).toHaveLength(1);
  });

  it('keeps the derivation in POSSales, before the unchanged raw-<div> payment root, which precedes the call', () => {
    const derivation = POS_SALES.indexOf(`${DERIVE()}\n\n        // Every payment figure below comes from the Payment Manager`);
    const root = POS_SALES.indexOf('        return (\n          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n', derivation);
    const call = POS_SALES.indexOf(CALL);
    expect(derivation).toBeGreaterThan(0);
    expect(root).toBeGreaterThan(derivation);
    expect(call).toBeGreaterThan(root);
    expect(count(POS_SALES, '<div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">')).toBe(1);
  });

  it('is the first child of the right column, followed by the scroll body, settlement summary and unchanged PaymentAllocationPanel', () => {
    expect(POS_SALES).toContain([
      '            {/* ══ RIGHT: Payment & Settlement ═══════════════════════ */}',
      '            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">',
      '',
      '              {/* Right header */}',
      CALL,
      '',
      '              <div className="flex-1 overflow-y-auto">',
      '                <div className="p-4 space-y-3">',
      '',
      '                  {/* ── Settlement summary (shipping and/or layaway-hold deposit) ── */}',
      '                  {(depositAmt > 0 || shippingChargeNum > 0) && (',
      '                    <CheckoutSettlementSummary',
      '                      itemsTotal={currentInvoice.total || 0}',
      '                      shippingChargeNum={shippingChargeNum}',
      '                      grandTotal={grandTotal}',
      '                      depositAmt={depositAmt}',
      '                      effectiveDue={effectiveDue}',
      '                    />',
      '                  )}',
      '',
      '                  {/* ══ Progressive Payment Allocation ══════════════════════',
      '                      Pick a method, enter an amount, confirm — repeat until Remaining',
      '                      reaches zero. There is no "Mixed" mode: a sale settled two ways is',
      '                      simply a sale with two allocations. */}',
      PANEL_CALL,
    ].join('\n'));
  });

  it('no longer contains the moved markup; the footer Cancel close stays in POSSales untouched', () => {
    for (const moved of ['<p className="text-white font-bold text-base leading-none">Checkout</p>', "{depositAmt > 0 ? 'Balance Due' : 'Total Amount'}", 'onClick={() => setShowPaymentDialog(false)}', '{currentInvoice.items.length} item{']) {
      expect(POS_SALES, moved).not.toContain(moved);
    }
    // Both footer handlers are still written in POSSales, now as CheckoutPaymentFooter props.
    expect(count(POS_SALES, [
      '                onCancel={() => {',
      '                  setShowPaymentDialog(false);',
      '                  setCheckoutError(null);',
      '                  cancelCheckoutTenders();',
      '                }}',
    ].join('\n'))).toBe(1);
    expect(count(POS_SALES, 'onSettle={() => processPayment()}')).toBe(1);
    expect(count(POS_SALES, 'onSettle={processPayment}')).toBe(0);
    expect(count(POS_SALES, 'onClick={processPayment}')).toBe(0);
  });
});
