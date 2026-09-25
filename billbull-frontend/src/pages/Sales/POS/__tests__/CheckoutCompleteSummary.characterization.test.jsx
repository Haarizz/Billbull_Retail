import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { Banknote, CreditCard, Landmark, User } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirhamSymbol } from '../POSCurrency';
import { paymentBlockRows } from '../payments/paymentPresentation';
import CheckoutCompleteSummary from '../features/checkout/CheckoutCompleteSummary';

/**
 * Characterization of the payment-complete SUMMARY BODY inside the POSSales.jsx checkout IIFE —
 * the `<div className="flex-1 overflow-y-auto">` holding Change Due, Accounts Receivable, Payment
 * Summary and the Financial Details `<details>`. Pinned against a verbatim copy before extraction.
 *
 * Out of scope (owned by CheckoutScreen.characterization.test.jsx and not repeated here): the phase
 * guard, root DOM reuse across the phase switch, the success header, Amount Paid, the finalizing
 * indicator, New Sale / Print Receipt / Reprint / Share and ReceiptShareModal.
 *
 * `paymentRows` / `usedMethods` are derived in POSSales next to closeComplete; the ROWS block below
 * is that derivation copied verbatim (enforced by the source block) so fixtures match production.
 */

// ── the verbatim region ─────────────────────────────────────────────────────────────────
function OriginalCompleteSummaryMarkup({ lastPaidInvoice, paymentRows, usedMethods, formatCurrencyStr }) {
  return (
    <>
      {/* VERBATIM-START */}
                <div className="flex-1 overflow-y-auto">
                  {/* Change Due alert */}
                  {(lastPaidInvoice.changeAmount || 0) > 0 && (
                    <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Change Due</span>
                      <span className="text-lg font-black text-emerald-700">
                        <DirhamSymbol /> {(lastPaidInvoice.changeAmount || 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* 3. Accounts Receivable (Compact, aligned) */}
                  {((lastPaidInvoice.creditBalance || 0) > 0 || (lastPaidInvoice.creditUpdatedBalance || 0) > 0) && (
                    <div className="px-6 py-3 border-b border-gray-100">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Accounts Receivable</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 font-medium">This Invoice</span>
                          <span className="font-bold text-[#1E293B]">
                            <DirhamSymbol /> {(lastPaidInvoice.creditBalance || 0).toFixed(2)}
                          </span>
                        </div>
                        {lastPaidInvoice.creditUpdatedBalance != null && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 font-medium">Customer Outstanding</span>
                            <span className="font-bold text-[#1E293B]">
                              <DirhamSymbol /> {lastPaidInvoice.creditUpdatedBalance.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Payment Summary (Compact) */}
                  {usedMethods.length > 0 && (
                    <div className="px-6 py-3 border-b border-gray-50">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Payment Summary</p>
                      <div className="space-y-1">
                        {usedMethods.map((row, i) => {
                          const lbl = String(row.label).toLowerCase();
                          let Icon = Banknote;
                          if (lbl.includes('card') || lbl.includes('mastercard') || lbl.includes('visa')) Icon = CreditCard;
                          else if (lbl.includes('online') || lbl.includes('bank') || lbl.includes('transfer')) Icon = Landmark;
                          else if (lbl.includes('credit')) Icon = User;

                          return (
                            <div key={`${row.label}-${i}`} className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2 text-gray-700 font-medium">
                                <Icon className="h-4 w-4 text-gray-400" />
                                <span>{row.label}</span>
                              </div>
                              <span className="font-bold text-[#1E293B]">
                                {formatCurrencyStr(row.amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 5. Financial Details (Scrollable when expanded) */}
                  <div className="px-6 py-3">
                    <details className="group rounded-lg bg-gray-50 transition-all">
                      <summary className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-500 uppercase cursor-pointer list-none select-none hover:bg-gray-100 rounded-lg">
                        <span className="group-open:hidden">▼ View Financial Details</span>
                        <span className="hidden group-open:inline">▲ Hide Financial Details</span>
                      </summary>
                      <div className="px-4 py-2 space-y-1.5 border-t border-gray-100 text-sm max-h-[220px] overflow-y-auto mt-1">
                        {lastPaidInvoice.paymentBlock && paymentRows.map((row, i) => (
                          <div key={`detail-${row.label}-${i}`} className="flex justify-between items-end gap-3">
                            <span className="text-gray-500">{row.label}</span>
                            <span className={`font-bold ${row.emphasis ? 'text-emerald-600' : 'text-[#1E293B]'}`}>
                              {formatCurrencyStr(row.amount)}
                            </span>
                          </div>
                        ))}
                        {lastPaidInvoice.paymentBlock?.hasReceivable && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Invoice Total</span>
                            <span className="font-bold text-[#1E293B]">{formatCurrencyStr(lastPaidInvoice.paymentBlock.invoiceTotal)}</span>
                          </div>
                        )}
                        <div className="h-px bg-gray-100 my-1"></div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Sale Amount</span>
                          <span className="font-bold text-[#1E293B]">{formatCurrencyStr(lastPaidInvoice.total)}</span>
                        </div>
                        {lastPaidInvoice.depositAmount > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Deposit Applied</span>
                            <span className="font-bold text-[#327F74]">−{formatCurrencyStr(lastPaidInvoice.depositAmount)}</span>
                          </div>
                        )}
                        {(lastPaidInvoice.creditBalance > 0 && lastPaidInvoice.creditUpdatedBalance != null) && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Customer Total Outstanding</span>
                            <span className="font-bold text-[#1E293B]">{formatCurrencyStr(lastPaidInvoice.creditUpdatedBalance)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Payment Mode</span>
                          <span className="font-bold text-[#1E293B]">{lastPaidInvoice.paymentMode}</span>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
      {/* VERBATIM-END */}
    </>
  );
}

// ── fixtures and helpers ────────────────────────────────────────────────────────────────
// Same body as the POSSales local, with activeCurrency = 'AED'.
const formatCurrencyStr = (amount) => `AED ${Number(amount || 0).toFixed(2)}`;

/** The POSSales derivation (verbatim between the ROWS markers), fed by the real paymentBlockRows. */
function deriveRows(lastPaidInvoice) {
  // ROWS-START
          const paymentRows = lastPaidInvoice.paymentBlock ? paymentBlockRows(lastPaidInvoice.paymentBlock) : [];
          const usedMethods = paymentRows.filter(r => r.label !== 'Total Received' && r.label !== 'Change Returned');
  // ROWS-END
  return { paymentRows, usedMethods };
}
const propsFor = (lastPaidInvoice) => ({ lastPaidInvoice, ...deriveRows(lastPaidInvoice), formatCurrencyStr });

const MIXED_BLOCK = {
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
  paymentBlock: MIXED_BLOCK,
};

const SCENARIOS = {
  'mixed cash + card with change and receivable': PAID,
  'no paymentBlock, nothing optional': { ...PAID, changeAmount: 0, paymentBlock: null, paymentMode: 'CASH' },
  'credit sale with deposit and outstanding balance': {
    ...PAID,
    changeAmount: 0,
    creditBalance: 40,
    creditUpdatedBalance: 140,
    depositAmount: 25,
    paymentMode: 'CREDIT',
    paymentBlock: { details: [{ label: 'Customer Credit', amount: 40 }, { label: 'Cash', amount: 35 }], changeAmount: 0, totalReceived: 75, hasReceivable: true, invoiceTotal: 100 },
  },
  'outstanding balance only, single tender': {
    ...PAID,
    changeAmount: undefined,
    creditBalance: 0,
    creditUpdatedBalance: 90,
    paymentMode: undefined,
    paymentBlock: { details: [{ label: 'Online Transfer', amount: 100 }], changeAmount: 0, totalReceived: 100, hasReceivable: false },
  },
  'duplicate labels, zero updated balance, missing amounts': {
    ...PAID,
    total: undefined,
    changeAmount: -1,
    creditBalance: 0,
    creditUpdatedBalance: 0,
    depositAmount: 0,
    paymentBlock: { details: [{ label: 'Cash', amount: 50 }, { label: 'Cash', amount: undefined }], changeAmount: 0, totalReceived: 50, hasReceivable: false },
  },
};
const SCENARIO_ENTRIES = Object.entries(SCENARIOS);

const renderOriginal = (invoice) => render(<OriginalCompleteSummaryMarkup {...propsFor(invoice)} />);
const body = (container) => container.firstElementChild;
const cls = (el) => el.getAttribute('class');
const sectionByHeading = (container, heading) => Array.from(container.querySelectorAll('p')).find((p) => p.textContent === heading)?.parentElement ?? null;
const detailsEl = (container) => container.querySelector('details');
const detailRows = (container) => Array.from(detailsEl(container).querySelector('div').children)
  .filter((row) => row.children.length === 2)
  .map((row) => [row.children[0].textContent, row.children[1].textContent]);

/** Keys of every keyed element in a rendered tree, in document order (the region has no hooks). */
const keysIn = (node, out = []) => {
  if (Array.isArray(node)) { node.forEach((n) => keysIn(n, out)); return out; }
  if (!React.isValidElement(node)) return out;
  if (node.key != null) out.push(node.key);
  keysIn(node.props.children, out);
  return out;
};

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
describe('1. original complete-summary markup', () => {
  it.each(SCENARIO_ENTRIES)('exact HTML: %s', (_name, invoice) => {
    const { container } = renderOriginal(invoice);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it.each(SCENARIO_ENTRIES)('exact text: %s', (_name, invoice) => {
    const { container } = renderOriginal(invoice);
    expect(container.textContent).toMatchSnapshot();
  });

  it('root and section classes, in child order', () => {
    const { container } = renderOriginal(SCENARIOS['credit sale with deposit and outstanding balance']);
    expect(container.children).toHaveLength(1);
    expect(cls(body(container))).toBe('flex-1 overflow-y-auto');
    expect(Array.from(body(container).children).map(cls)).toEqual([
      'px-6 py-3 border-b border-gray-100',
      'px-6 py-3 border-b border-gray-50',
      'px-6 py-3',
    ]);
  });

  it.each([[5, true], [0, false], [undefined, false], [-1, false], [0.004, true]])('Change Due for changeAmount %s → %s', (changeAmount, shown) => {
    const { container } = renderOriginal({ ...PAID, changeAmount });
    const label = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'Change Due');
    expect(!!label).toBe(shown);
    if (!shown) return;
    expect(cls(label)).toBe('text-xs font-bold uppercase tracking-wider text-emerald-800');
    expect(cls(label.parentElement)).toBe('bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between');
    expect(cls(label.nextElementSibling)).toBe('text-lg font-black text-emerald-700');
    expect(label.nextElementSibling.querySelector('[data-bb-currency-symbol]')).not.toBeNull();
    expect(label.nextElementSibling.textContent.trim()).toBe(changeAmount.toFixed(2));
  });

  it.each([
    ['hidden with no receivable', { creditBalance: 0, creditUpdatedBalance: null }, null],
    ['This Invoice only when the updated balance is null', { creditBalance: 40, creditUpdatedBalance: null }, [['This Invoice', '40.00']]],
    ['This Invoice only when the updated balance is undefined', { creditBalance: 40, creditUpdatedBalance: undefined }, [['This Invoice', '40.00']]],
    ['both rows', { creditBalance: 40, creditUpdatedBalance: 140 }, [['This Invoice', '40.00'], ['Customer Outstanding', '140.00']]],
    ['opened by the outstanding balance alone; This Invoice reads 0.00', { creditBalance: undefined, creditUpdatedBalance: 90 }, [['This Invoice', '0.00'], ['Customer Outstanding', '90.00']]],
    ['a zero updated balance alone does not open it', { creditBalance: 0, creditUpdatedBalance: 0 }, null],
  ])('Accounts Receivable: %s', (_label, fields, rows) => {
    const { container } = renderOriginal({ ...PAID, ...fields });
    const section = sectionByHeading(container, 'Accounts Receivable');
    if (rows === null) {
      expect(section).toBeNull();
      return;
    }
    expect(cls(section)).toBe('px-6 py-3 border-b border-gray-100');
    expect(cls(section.children[0])).toBe('text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2');
    expect(cls(section.children[1])).toBe('space-y-1');
    const rendered = Array.from(section.children[1].children);
    expect(rendered.map((r) => [r.children[0].textContent, r.children[1].textContent.trim()])).toEqual(rows);
    rendered.forEach((r) => {
      expect(cls(r)).toBe('flex justify-between items-center text-sm');
      expect(cls(r.children[0])).toBe('text-gray-600 font-medium');
      expect(cls(r.children[1])).toBe('font-bold text-[#1E293B]');
      expect(r.children[1].querySelector('[data-bb-currency-symbol]')).not.toBeNull();
    });
  });

  it('Payment Summary lists only the used methods, formatted, with exact classes', () => {
    const { container } = renderOriginal(PAID);
    const section = sectionByHeading(container, 'Payment Summary');
    expect(cls(section)).toBe('px-6 py-3 border-b border-gray-50');
    expect(cls(section.children[0])).toBe('text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2');
    expect(cls(section.children[1])).toBe('space-y-1');
    const rows = Array.from(section.children[1].children);
    expect(rows.map((r) => [r.children[0].textContent, r.children[1].textContent])).toEqual([['Cash', 'AED 60.00'], ['Visa Card', 'AED 40.00']]);
    rows.forEach((r) => {
      expect(cls(r)).toBe('flex justify-between items-center text-sm');
      expect(cls(r.children[0])).toBe('flex items-center gap-2 text-gray-700 font-medium');
      expect(cls(r.children[1])).toBe('font-bold text-[#1E293B]');
    });
  });

  it('Payment Summary is absent when every row is a Change Returned / Total Received row or there is no block', () => {
    let view = renderOriginal({ ...PAID, paymentBlock: null });
    expect(sectionByHeading(view.container, 'Payment Summary')).toBeNull();
    cleanup();
    view = renderOriginal({ ...PAID, paymentBlock: { ...MIXED_BLOCK, details: [] } });
    expect(sectionByHeading(view.container, 'Payment Summary')).toBeNull();
  });

  it.each([
    ['Cash', Banknote],
    ['Visa', CreditCard],
    ['MasterCard', CreditCard],
    ['Credit Card', CreditCard],
    ['Online Transfer', Landmark],
    ['Bank Deposit', Landmark],
    ['TRANSFER', Landmark],
    ['Customer Credit', User],
    ['Gift Voucher', Banknote],
    [42, Banknote],
  ])('Payment Summary icon for %s', (label, Icon) => {
    const { container } = renderOriginal({ ...PAID, paymentBlock: { ...MIXED_BLOCK, details: [{ label, amount: 100 }], changeAmount: 0 } });
    const row = sectionByHeading(container, 'Payment Summary').children[1].children[0];
    expectIcon(row.querySelector('svg'), Icon, 'h-4 w-4 text-gray-400');
    expect(row.children[0].children[1].textContent).toBe(String(label));
  });

  it('details: native, closed, exact captions and classes, full row list with emphasis', () => {
    const { container } = renderOriginal(PAID);
    const details = detailsEl(container);
    expect(details.open).toBe(false);
    expect(cls(details)).toBe('group rounded-lg bg-gray-50 transition-all');
    expect(cls(details.parentElement)).toBe('px-6 py-3');
    const summary = details.querySelector('summary');
    expect(cls(summary)).toBe('flex items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-500 uppercase cursor-pointer list-none select-none hover:bg-gray-100 rounded-lg');
    expect(Array.from(summary.children).map((s) => [s.textContent, cls(s)])).toEqual([
      ['▼ View Financial Details', 'group-open:hidden'],
      ['▲ Hide Financial Details', 'hidden group-open:inline'],
    ]);
    expect(Array.from(details.children).map((c) => c.tagName)).toEqual(['SUMMARY', 'DIV']);
    expect(cls(details.children[1])).toBe('px-4 py-2 space-y-1.5 border-t border-gray-100 text-sm max-h-[220px] overflow-y-auto mt-1');
    expect(detailRows(container)).toEqual([
      ['Cash', 'AED 60.00'],
      ['Visa Card', 'AED 40.00'],
      ['Change Returned', 'AED 5.00'],
      ['Total Received', 'AED 105.00'],
      ['Invoice Total', 'AED 100.00'],
      ['Sale Amount', 'AED 100.00'],
      ['Payment Mode', 'MIXED'],
    ]);
    const rows = Array.from(details.children[1].children);
    expect(rows.map(cls)).toEqual([
      'flex justify-between items-end gap-3',
      'flex justify-between items-end gap-3',
      'flex justify-between items-end gap-3',
      'flex justify-between items-end gap-3',
      'flex justify-between items-center text-sm',
      'h-px bg-gray-100 my-1',
      'flex justify-between items-center',
      'flex justify-between items-center',
    ]);
    expect(rows.slice(0, 4).map((r) => cls(r.children[1]))).toEqual(['font-bold text-[#1E293B]', 'font-bold text-[#1E293B]', 'font-bold text-emerald-600', 'font-bold text-emerald-600']);
  });

  it('details: deposit and customer-outstanding rows, no Invoice Total without a receivable', () => {
    const { container } = renderOriginal(SCENARIOS['credit sale with deposit and outstanding balance']);
    expect(detailRows(container)).toEqual([
      ['Customer Credit', 'AED 40.00'],
      ['Cash', 'AED 35.00'],
      ['Total Received', 'AED 75.00'],
      ['Invoice Total', 'AED 100.00'],
      ['Sale Amount', 'AED 100.00'],
      ['Deposit Applied', '−AED 25.00'],
      ['Customer Total Outstanding', 'AED 140.00'],
      ['Payment Mode', 'CREDIT'],
    ]);
    const deposit = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === '−AED 25.00');
    expect(cls(deposit)).toBe('font-bold text-[#327F74]');
  });

  it('details: no paymentBlock → only Sale Amount and Payment Mode; outstanding without creditBalance is not listed', () => {
    let view = renderOriginal({ ...PAID, paymentBlock: null, total: 12.345 });
    expect(detailRows(view.container)).toEqual([['Sale Amount', 'AED 12.35'], ['Payment Mode', 'MIXED']]);
    cleanup();
    view = renderOriginal(SCENARIOS['outstanding balance only, single tender']);
    expect(detailRows(view.container)).toEqual([['Online Transfer', 'AED 100.00'], ['Sale Amount', 'AED 100.00'], ['Payment Mode', '']]);
  });

  it('keys: summary rows `${label}-${i}`, detail rows `detail-${label}-${i}`, nothing else keyed', () => {
    expect(keysIn(OriginalCompleteSummaryMarkup(propsFor(PAID)))).toEqual([
      'Cash-0', 'Visa Card-1',
      'detail-Cash-0', 'detail-Visa Card-1', 'detail-Change Returned-2', 'detail-Total Received-3',
    ]);
    expect(keysIn(OriginalCompleteSummaryMarkup(propsFor(SCENARIOS['duplicate labels, zero updated balance, missing amounts'])))).toEqual([
      'Cash-0', 'Cash-1', 'detail-Cash-0', 'detail-Cash-1', 'detail-Total Received-2',
    ]);
  });

  it('duplicate labels render without a key warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderOriginal(SCENARIOS['duplicate labels, zero updated balance, missing amounts']);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('the <details> node survives re-renders with an unrelated shape and keeps its open state', () => {
    const view = renderOriginal(PAID);
    const details = detailsEl(view.container);
    details.open = true;
    for (const [, invoice] of SCENARIO_ENTRIES) {
      view.rerender(<OriginalCompleteSummaryMarkup {...propsFor(invoice)} />);
      expect(detailsEl(view.container)).toBe(details);
      expect(details.open).toBe(true);
    }
  });

  it('is inert: no buttons, inputs or links, and reading props has no side effects', () => {
    const invoice = Object.freeze({ ...PAID, paymentBlock: Object.freeze({ ...MIXED_BLOCK }) });
    const format = vi.fn(formatCurrencyStr);
    const { container } = render(<OriginalCompleteSummaryMarkup {...propsFor(invoice)} formatCurrencyStr={format} />);
    expect(container.querySelectorAll('button, input, a, select, textarea')).toHaveLength(0);
    // 2 summary rows + 4 detail rows + Invoice Total + Sale Amount
    expect(format.mock.calls).toEqual([[60], [40], [60], [40], [5], [105], [100], [100]]);
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
const COPY = () => between(SELF, '{/* VERBATIM-START */}\n', '\n      {/* VERBATIM-END */}');
const ROWS = () => between(SELF, '// ROWS-START\n', '\n  // ROWS-END');

// ── 2. extracted component ──────────────────────────────────────────────────────────────
describe('2. CheckoutCompleteSummary DOM parity', () => {
  it.each(SCENARIO_ENTRIES)('renders HTML identical to the pre-extraction markup: %s', (_name, invoice) => {
    const original = renderOriginal(invoice).container.innerHTML;
    cleanup();
    const { container } = render(<CheckoutCompleteSummary {...propsFor(invoice)} />);
    expect(container.innerHTML).toBe(original);
  });

  it.each(SCENARIO_ENTRIES)('produces the same keys as the pre-extraction markup: %s', (_name, invoice) => {
    expect(keysIn(CheckoutCompleteSummary(propsFor(invoice)))).toEqual(keysIn(OriginalCompleteSummaryMarkup(propsFor(invoice))));
  });

  it('keeps the same <details> node and its open state across re-renders', () => {
    const view = render(<CheckoutCompleteSummary {...propsFor(PAID)} />);
    const details = detailsEl(view.container);
    details.open = true;
    for (const [, invoice] of SCENARIO_ENTRIES) {
      view.rerender(<CheckoutCompleteSummary {...propsFor(invoice)} />);
      expect(detailsEl(view.container)).toBe(details);
      expect(details.open).toBe(true);
    }
  });
});

// ── source ──────────────────────────────────────────────────────────────────────────────
/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary is
 * asserted against source.
 */
describe('source — CheckoutCompleteSummary', () => {
  const SOURCE = readSource('../features/checkout/CheckoutCompleteSummary.jsx');

  it('its return body is the verbatim copy, byte for byte (109 lines)', () => {
    expect(COPY().split('\n')).toHaveLength(109);
    expect(count(SOURCE, `  return (\n${COPY()}\n  );\n}`)).toBe(1);
  });

  it('props are exactly lastPaidInvoice, paymentRows, usedMethods, formatCurrencyStr', () => {
    expect(SOURCE).toContain('function CheckoutCompleteSummary({\n  lastPaidInvoice,\n  paymentRows,\n  usedMethods,\n  formatCurrencyStr,\n}) {');
  });

  it('has no hooks, context, memo, effects, async, API calls or transactional handlers', () => {
    expect(SOURCE).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(SOURCE).not.toMatch(/\bmemo\b|createContext|useContext|forwardRef/);
    expect(SOURCE).not.toMatch(/\basync\b|\bawait\b|fetch\(|axios|\/api\/|setTimeout|setInterval/);
    // The header comment names what stayed behind in POSSales, so check code only.
    const code = SOURCE.replace(/\r\n/g, '\n').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('import { paymentBlockRows');
    for (const absent of ['onClick', 'closeComplete', 'processPayment', 'setShowReprintModal', 'setReceiptShareChannel', 'ReceiptShareModal', 'PaymentAllocationPanel', 'getSalesInvoiceById', 'Print Receipt', 'Reprint', 'Share Receipt', 'checkoutPhase', 'showPaymentDialog', 'paymentBlockRows']) {
      expect(code, absent).not.toContain(absent);
    }
  });
});

describe('source — POSSales wiring (CheckoutCompleteSummary boundary)', () => {
  const CALL = [
    '                <CheckoutCompleteSummary',
    '                  lastPaidInvoice={lastPaidInvoice}',
    '                  paymentRows={paymentRows}',
    '                  usedMethods={usedMethods}',
    '                  formatCurrencyStr={formatCurrencyStr}',
    '                />',
  ].join('\n');

  it('imports it once and renders it exactly once', () => {
    expect(count(POS_SALES, "import CheckoutCompleteSummary from './POS/features/checkout/CheckoutCompleteSummary';\n")).toBe(1);
    expect(POS_SALES.match(/<CheckoutCompleteSummary\b/g)).toHaveLength(1);
    expect(count(POS_SALES, CALL)).toBe(1);
  });

  it('sits in the same root-card slot: after the finalize indicator, before the action block', () => {
    expect(POS_SALES).toContain([
      '                {/* Background finalize indicator */}',
      '                {checkoutFinalizing && (',
      '                  <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-center gap-2 shrink-0">',
      '                    <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />',
      '                    <span className="text-[11px] font-bold text-amber-600">Printing receipt…</span>',
      '                  </div>',
      '                )}',
      '',
      CALL,
      '',
      '                {/* 6. Action Priority */}',
    ].join('\n'));
  });

  it('keeps the guard, root, closeComplete and the ROWS derivation in POSSales, in order', () => {
    const guard = POS_SALES.indexOf("        if (checkoutPhase === 'complete' && lastPaidInvoice) {\n          const closeComplete = () => {");
    const rows = POS_SALES.indexOf(`${ROWS()}\n\n          return (\n            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">`);
    const call = POS_SALES.indexOf(CALL);
    expect(guard).toBeGreaterThan(0);
    expect(rows).toBeGreaterThan(guard);
    expect(call).toBeGreaterThan(rows);
    expect(count(POS_SALES, ROWS())).toBe(1);
  });

  it('no longer contains the moved markup; action handlers and share stay in POSSales (buttons render via CheckoutCompleteActions)', () => {
    for (const moved of ['View Financial Details', 'Accounts Receivable</p>', 'Payment Summary</p>', 'Customer Outstanding</span>','<details className="group rounded-lg bg-gray-50 transition-all">',
      '<ArrowRightCircle className="h-5 w-5" />New Sale', '<Printer className="h-4 w-4" />Print Receipt']) {
      expect(POS_SALES, moved).not.toContain(moved);
    }
    for (const kept of ['<CheckoutCompleteActions\n', 'onNewSale={closeComplete}', 'onPrintReceipt={async () => {', "alert(`Print failed: ${err?.message || 'printer error'}.`)",
      'onReprint={() => {\n                    closeComplete();\n                    setShowReprintModal(true);\n                  }}', 'onShare={(key) => setReceiptShareChannel(key)}', '<ReceiptShareModal']) {
      expect(count(POS_SALES, kept), kept).toBe(1);
    }
  });
});
