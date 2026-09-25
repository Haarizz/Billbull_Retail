import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CurrencyAmount } from '../POSCurrency';
import CheckoutSettlementSummary from '../features/checkout/CheckoutSettlementSummary';

/**
 * Characterization of the payment-phase SETTLEMENT SUMMARY inside the POSSales.jsx checkout IIFE —
 * the `bg-white rounded-2xl border border-[#F5C742]/50` card listing Items Total, Shipping, Order
 * Total, Deposit Paid and Balance Due Now / Total Payable, together with the
 * `(depositAmt > 0 || shippingChargeNum > 0)` guard that shows it. Pinned against a verbatim copy
 * before extraction.
 *
 * Out of scope (owned by CheckoutScreen.characterization.test.jsx and not repeated here): the
 * payment root, the preview column, the payment header, PaymentAllocationPanel, remarks and the
 * settlement footer.
 *
 * shippingChargeNum / grandTotal / depositAmt / effectiveDue are derived in POSSales at the top of
 * the payment branch; the DERIVE block below is that derivation copied verbatim (enforced by the
 * source block) so fixtures match production.
 */

// ── the verbatim region ─────────────────────────────────────────────────────────────────
function OriginalSettlementSummaryMarkup({ currentInvoice, shippingChargeNum, grandTotal, depositAmt, effectiveDue }) {
  return (
    <>
      {/* VERBATIM-START */}
                  {(depositAmt > 0 || shippingChargeNum > 0) && (
                    // INNER-START
                    <div className="bg-white rounded-2xl border border-[#F5C742]/50 p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Settlement Summary</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Items Total</span>
                          <span className="font-semibold text-[#1E293B]"><CurrencyAmount amount={currentInvoice.total || 0} /></span>
                        </div>
                        {shippingChargeNum > 0 && (
                          <div className="flex justify-between text-gray-600">
                            <span>Shipping</span>
                            <span className="font-semibold text-[#1E293B]"><CurrencyAmount amount={shippingChargeNum} /></span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#1E293B] border-t border-gray-100 pt-1.5">
                          <span className="font-semibold">Order Total</span>
                          <span className="font-semibold"><CurrencyAmount amount={grandTotal} /></span>
                        </div>
                        {depositAmt > 0 && (
                          <div className="flex justify-between text-green-700">
                            <span>Deposit Paid</span>
                            <span className="font-semibold">− <CurrencyAmount amount={depositAmt} /></span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-[#1E293B]">
                          <span className="font-bold">{depositAmt > 0 ? 'Balance Due Now' : 'Total Payable'}</span>
                          <span className="font-black text-[#F5C742]"><CurrencyAmount amount={effectiveDue} /></span>
                        </div>
                      </div>
                    </div>
                    // INNER-END
                  )}
      {/* VERBATIM-END */}
    </>
  );
}

// ── fixtures and helpers ────────────────────────────────────────────────────────────────
/** The POSSales derivation (verbatim between the DERIVE markers). */
function derive({ shippingCharge, currentInvoice, activeLayawayDeposit, checkoutEffectiveDue }) {
  // DERIVE-START
        const shippingChargeNum = Number(shippingCharge) || 0;
        const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
        // Owned by the Payment Manager (checkoutEffectiveDue) so the screen and the manager
        // measure every allocation against exactly the same amount due.
        const effectiveDue = checkoutEffectiveDue;
  // DERIVE-END
  return { currentInvoice, shippingChargeNum, grandTotal, depositAmt, effectiveDue };
}

const BASE = { shippingCharge: '', currentInvoice: { items: [{ id: 1 }], total: 100 }, activeLayawayDeposit: 0, checkoutEffectiveDue: 100 };
const inputs = (overrides = {}) => ({ ...BASE, ...overrides });

const SHOWN = {
  'shipping only': inputs({ shippingCharge: '15', checkoutEffectiveDue: 115 }),
  'deposit only': inputs({ activeLayawayDeposit: 30, checkoutEffectiveDue: 70 }),
  'shipping and deposit': inputs({ shippingCharge: 10, activeLayawayDeposit: 30, checkoutEffectiveDue: 80 }),
  'zero items total, zero effective due': inputs({ shippingCharge: '5', currentInvoice: { items: [], total: 0 }, checkoutEffectiveDue: 0 }),
  'undefined items total and undefined effective due': inputs({ shippingCharge: '5', currentInvoice: { items: [] }, checkoutEffectiveDue: undefined }),
  'fractional rounding': inputs({ shippingCharge: '2.005', currentInvoice: { items: [], total: 12.345 }, activeLayawayDeposit: 0.125, checkoutEffectiveDue: 14.225 }),
};
const HIDDEN = {
  'neither shipping nor deposit': inputs(),
  'non-numeric shipping, no deposit': inputs({ shippingCharge: 'abc' }),
  'negative shipping and negative deposit': inputs({ shippingCharge: '-3', activeLayawayDeposit: -5 }),
  'null shipping, undefined deposit': inputs({ shippingCharge: null, activeLayawayDeposit: undefined }),
};
const SHOWN_ENTRIES = Object.entries(SHOWN);
const ALL_ENTRIES = [...SHOWN_ENTRIES, ...Object.entries(HIDDEN)];

const renderOriginal = (raw) => render(<OriginalSettlementSummaryMarkup {...derive(raw)} />);
const cls = (el) => el.getAttribute('class');
const card = (container) => container.firstElementChild;
const rowsOf = (container) => Array.from(card(container).children[1].children);
const rowText = (row) => [row.children[0].textContent, row.children[1].textContent];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── 1. original markup ──────────────────────────────────────────────────────────────────
describe('1. original settlement-summary markup', () => {
  it.each(ALL_ENTRIES)('exact HTML: %s', (_name, raw) => {
    const { container } = renderOriginal(raw);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it.each(Object.entries(HIDDEN))('guard false → nothing rendered: %s', (_name, raw) => {
    const { container } = renderOriginal(raw);
    expect(container.innerHTML).toBe('');
  });

  it.each(SHOWN_ENTRIES)('guard true → exactly one card: %s', (_name, raw) => {
    const { container } = renderOriginal(raw);
    expect(container.children).toHaveLength(1);
    expect(cls(card(container))).toBe('bg-white rounded-2xl border border-[#F5C742]/50 p-4 shadow-sm');
    expect(Array.from(card(container).children).map((c) => c.tagName)).toEqual(['P', 'DIV']);
    expect(card(container).children[0].textContent).toBe('Settlement Summary');
    expect(cls(card(container).children[0])).toBe('text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3');
    expect(cls(card(container).children[1])).toBe('space-y-1.5 text-sm');
  });

  it.each([
    ['shipping only', [['Items Total', '100.00'], ['Shipping', '15.00'], ['Order Total', '115.00'], ['Total Payable', '115.00']]],
    ['deposit only', [['Items Total', '100.00'], ['Order Total', '100.00'], ['Deposit Paid', '− 30.00'], ['Balance Due Now', '70.00']]],
    ['shipping and deposit', [['Items Total', '100.00'], ['Shipping', '10.00'], ['Order Total', '110.00'], ['Deposit Paid', '− 30.00'], ['Balance Due Now', '80.00']]],
    ['zero items total, zero effective due', [['Items Total', '0.00'], ['Shipping', '5.00'], ['Order Total', '5.00'], ['Total Payable', '0.00']]],
    ['undefined items total and undefined effective due', [['Items Total', '0.00'], ['Shipping', '5.00'], ['Order Total', '5.00'], ['Total Payable', '0.00']]],
    ['fractional rounding', [['Items Total', '12.35'], ['Shipping', '2.00'], ['Order Total', '14.35'], ['Deposit Paid', '− 0.13'], ['Balance Due Now', '14.22']]],
  ])('rows, order and exact text: %s', (name, rows) => {
    const { container } = renderOriginal(SHOWN[name]);
    expect(rowsOf(container).map(rowText)).toEqual(rows);
  });

  it('row classes, in order, with every conditional row present', () => {
    const { container } = renderOriginal(SHOWN['shipping and deposit']);
    const rows = rowsOf(container);
    expect(rows.map(cls)).toEqual([
      'flex justify-between text-gray-600',
      'flex justify-between text-gray-600',
      'flex justify-between text-[#1E293B] border-t border-gray-100 pt-1.5',
      'flex justify-between text-green-700',
      'flex justify-between border-t border-gray-100 pt-1.5 text-[#1E293B]',
    ]);
    expect(rows.map((r) => [r.children[0].getAttribute('class'), cls(r.children[1])])).toEqual([
      [null, 'font-semibold text-[#1E293B]'],
      [null, 'font-semibold text-[#1E293B]'],
      ['font-semibold', 'font-semibold'],
      [null, 'font-semibold'],
      ['font-bold', 'font-black text-[#F5C742]'],
    ]);
  });

  it('every figure is the real CurrencyAmount; Deposit Paid prefixes "− " as a text node', () => {
    const { container } = renderOriginal(SHOWN['shipping and deposit']);
    const reference = document.createElement('div');
    const refView = render(<CurrencyAmount amount={30} />, { container: reference });
    const deposit = rowsOf(container)[3].children[1];
    expect(deposit.innerHTML).toBe(`− ${reference.innerHTML}`);
    expect(deposit.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    refView.unmount();
    rowsOf(container).forEach((r) => {
      expect(r.children[1].querySelectorAll('[data-bb-currency-symbol]')).toHaveLength(1);
    });
  });

  it('is inert: no buttons, inputs, links or keyed elements', () => {
    const { container } = renderOriginal(SHOWN['shipping and deposit']);
    expect(container.querySelectorAll('button, input, a, select, textarea')).toHaveLength(0);
  });
});

// ── 2. extracted component ──────────────────────────────────────────────────────────────
/** The POSSales call site: guard kept in the parent, parent-computed values passed down. */
function ParentWiring({ currentInvoice, shippingChargeNum, grandTotal, depositAmt, effectiveDue }) {
  return (
    <>
                  {(depositAmt > 0 || shippingChargeNum > 0) && (
                    <CheckoutSettlementSummary
                      itemsTotal={currentInvoice.total || 0}
                      shippingChargeNum={shippingChargeNum}
                      grandTotal={grandTotal}
                      depositAmt={depositAmt}
                      effectiveDue={effectiveDue}
                    />
                  )}
    </>
  );
}

describe('2. CheckoutSettlementSummary DOM parity', () => {
  it.each(ALL_ENTRIES)('parent guard + component renders HTML identical to the pre-extraction markup: %s', (_name, raw) => {
    const original = renderOriginal(raw).container.innerHTML;
    cleanup();
    const { container } = render(<ParentWiring {...derive(raw)} />);
    expect(container.innerHTML).toBe(original);
  });

  it('the component itself has no guard: it renders the card even when the parent guard would be false', () => {
    const { container } = render(<CheckoutSettlementSummary itemsTotal={100} shippingChargeNum={0} grandTotal={100} depositAmt={0} effectiveDue={100} />);
    expect(rowsOf(container).map(rowText)).toEqual([['Items Total', '100.00'], ['Order Total', '100.00'], ['Total Payable', '100.00']]);
  });

  it('renders the passed values as-is, without recomputing them', () => {
    const { container } = render(<CheckoutSettlementSummary itemsTotal={1} shippingChargeNum={2} grandTotal={999} depositAmt={4} effectiveDue={777} />);
    expect(rowsOf(container).map(rowText)).toEqual([['Items Total', '1.00'], ['Shipping', '2.00'], ['Order Total', '999.00'], ['Deposit Paid', '− 4.00'], ['Balance Due Now', '777.00']]);
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
const INNER = () => between(SELF, '// INNER-START\n', '\n                    // INNER-END');
const DERIVE = () => between(SELF, '// DERIVE-START\n', '\n  // DERIVE-END');
const GUARD = '                  {(depositAmt > 0 || shippingChargeNum > 0) && (\n';
const CALL = [
  '                    <CheckoutSettlementSummary',
  '                      itemsTotal={currentInvoice.total || 0}',
  '                      shippingChargeNum={shippingChargeNum}',
  '                      grandTotal={grandTotal}',
  '                      depositAmt={depositAmt}',
  '                      effectiveDue={effectiveDue}',
  '                    />',
].join('\n');

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary is
 * asserted against source.
 */
describe('source — CheckoutSettlementSummary', () => {
  const SOURCE = readSource('../features/checkout/CheckoutSettlementSummary.jsx');

  it('its return body is the verbatim copy except the one Items Total prop substitution (29 lines)', () => {
    expect(INNER().split('\n')).toHaveLength(29);
    const substituted = INNER().replace('<CurrencyAmount amount={currentInvoice.total || 0} />', '<CurrencyAmount amount={itemsTotal} />');
    expect(substituted).not.toBe(INNER());
    expect(count(SOURCE, `  return (\n${substituted}\n  );\n}`)).toBe(1);
  });

  it('the ParentWiring call site in this file is the POSSales call site, byte for byte', () => {
    const site = `${GUARD}${CALL}\n                  )}`;
    expect(count(SELF, site)).toBe(1);
    expect(count(POS_SALES, site)).toBe(1);
  });

  it('props are exactly itemsTotal, shippingChargeNum, grandTotal, depositAmt, effectiveDue', () => {
    expect(SOURCE).toContain('function CheckoutSettlementSummary({\n  itemsTotal,\n  shippingChargeNum,\n  grandTotal,\n  depositAmt,\n  effectiveDue,\n}) {');
  });

  it('has no hooks, context, memo, effects, async, API calls, handlers, guard or derivation', () => {
    const code = SOURCE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(code).not.toMatch(/\bmemo\b|createContext|useContext|forwardRef/);
    expect(code).not.toMatch(/\basync\b|\bawait\b|fetch\(|axios|\/api\/|setTimeout|setInterval/);
    for (const absent of ['onClick', 'onChange', 'Number(', 'shippingCharge)', 'activeLayawayDeposit', 'checkoutEffectiveDue', 'currentInvoice', '|| 0', ' + ', 'depositAmt > 0 || shippingChargeNum > 0', 'processPayment', 'cancelCheckoutTenders', 'PaymentAllocationPanel', 'setShowPaymentDialog']) {
      expect(code, absent).not.toContain(absent);
    }
    expect(code).toContain("import { CurrencyAmount } from '../../POSCurrency';");
  });
});

describe('source — POSSales wiring (CheckoutSettlementSummary boundary)', () => {
  it('imports it once and renders it exactly once', () => {
    expect(count(POS_SALES, "import CheckoutSettlementSummary from './POS/features/checkout/CheckoutSettlementSummary';\n")).toBe(1);
    expect(POS_SALES.match(/<CheckoutSettlementSummary\b/g)).toHaveLength(1);
    expect(count(POS_SALES, CALL)).toBe(1);
  });

  it('keeps the guard in POSSales, wrapping the call, in the same slot before PaymentAllocationPanel', () => {
    expect(count(POS_SALES, GUARD)).toBe(1);
    expect(POS_SALES).toContain([
      '              <div className="flex-1 overflow-y-auto">',
      '                <div className="p-4 space-y-3">',
      '',
      '                  {/* ── Settlement summary (shipping and/or layaway-hold deposit) ── */}',
      `${GUARD}${CALL}`,
      '                  )}',
      '',
      '                  {/* ══ Progressive Payment Allocation ══════════════════════',
      '                      Pick a method, enter an amount, confirm — repeat until Remaining',
      '                      reaches zero. There is no "Mixed" mode: a sale settled two ways is',
      '                      simply a sale with two allocations. */}',
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
    ].join('\n'));
  });

  it('keeps the derivation in POSSales, before the unchanged payment root, which precedes the call', () => {
    const derive = POS_SALES.indexOf(`${DERIVE()}\n        // Real next number from the backend sequence`);
    const root = POS_SALES.indexOf('        return (\n          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n', derive);
    const call = POS_SALES.indexOf(CALL);
    expect(derive).toBeGreaterThan(0);
    expect(root).toBeGreaterThan(derive);
    expect(call).toBeGreaterThan(root);
    expect(count(POS_SALES, '<div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">')).toBe(1);
  });

  it('no longer contains the moved markup; the header figures that share the derived values are fed from POSSales', () => {
    for (const moved of ['Settlement Summary</p>', '<span>Items Total</span>', '<span>Deposit Paid</span>', "'Balance Due Now' : 'Total Payable'", '<CurrencyAmount amount={currentInvoice.total || 0} />']) {
      expect(POS_SALES, moved).not.toContain(moved);
    }
    // The header figures later moved to CheckoutPaymentHeader; POSSales still passes it the same derived values.
    const HEADER = readSource('../features/checkout/CheckoutPaymentHeader.jsx');
    for (const kept of ["{depositAmt > 0 ? 'Balance Due' : 'Total Amount'}", '<CurrencyAmount amount={depositAmt > 0 ? effectiveDue : grandTotal} />']) {
      expect(count(HEADER, kept), kept).toBe(1);
    }
    expect(count(POS_SALES, '                depositAmt={depositAmt}\n                effectiveDue={effectiveDue}\n                grandTotal={grandTotal}\n')).toBe(1);
  });
});
