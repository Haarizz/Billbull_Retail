import fs from 'node:fs';
import path from 'node:path';
import { createElement, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ShoppingCart } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Characterization of the REMAINING payment-phase JSX of the POSSales.jsx checkout IIFE, region
 * by region, to choose the next extraction boundary. R6 (the Remarks card) has since moved to
 * CheckoutRemarks; the pre-extraction markup is kept below (REMARKS-ORIGINAL) and rendered side
 * by side with the component. R3's inner content has since moved to CheckoutPaymentPreview (its
 * pre-extraction column is kept below as PREVIEW; the outer column <div> stays inline). R1, R2, R4
 * and R5 are unchanged.
 *
 * Candidate regions (payment phase, top to bottom):
 *   R1  derived figures            `const shippingChargeNum = …` → `const canSettle = …`   (logic, not JSX)
 *   R2  payment root               `<div className="fixed inset-0 z-[60] …">`             (must not change)
 *   R3  LEFT preview column        the "LEFT: Invoice Preview" comment → its `</div>`
 *   R4  RIGHT column shell         header call + scroll body + footer call
 *   R5  scroll body                `<div className="flex-1 overflow-y-auto">` → its `</div>`
 *   R6  Remarks card               the "── Remarks ──" comment → its `</div>`              (inside R5)
 *
 * R3 and R5 are copied VERBATIM below (PREVIEW / SCROLL markers, enforced byte-for-byte by the
 * source block) and rendered with the real CheckoutSettlementSummary, PaymentAllocationPanel and
 * ThermalScaledPreview. Only the six payment modals are mocked. R6 is exercised inside R5.
 *
 * Already owned elsewhere and NOT repeated: root DOM reuse / z-index / phase guard / the base
 * remarks round-trip / the three preview branches (CheckoutScreen), the header, summary and
 * footer components (their own suites), PaymentAllocationPanel internals (its own suite).
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - checkoutRemarks is never sent anywhere: useCheckout only declares, returns and resets it.
 *   - The "Remarks / Reference" <label> is not associated with its <input> (no htmlFor/id).
 *   - The remarks <input> has no type/name/id/maxLength and is not in a <form>.
 *   - Remarks are not an input to either checkout preview memo.
 *   - Three blank lines follow the Remarks card and two follow the PaymentAllocationPanel call.
 */

const { modalSpy, modalMock } = vi.hoisted(() => {
  const spy = { calls: [] };
  return {
    modalSpy: spy,
    modalMock: (name) => ({ default: (p) => { spy.calls.push({ name, props: p }); return <div data-testid="modal">{name}</div>; } }),
  };
});
vi.mock('../payments/modals/CashPaymentModal', () => modalMock('CashPaymentModal'));
vi.mock('../payments/modals/CardPaymentModal', () => modalMock('CardPaymentModal'));
vi.mock('../payments/modals/OnlinePaymentModal', () => modalMock('OnlinePaymentModal'));
vi.mock('../payments/modals/CreditPaymentModal', () => modalMock('CreditPaymentModal'));
vi.mock('../payments/modals/VoucherPaymentModal', () => modalMock('VoucherPaymentModal'));
vi.mock('../payments/modals/BnplPaymentModal', () => modalMock('BnplPaymentModal'));

import CheckoutSettlementSummary from '../features/checkout/CheckoutSettlementSummary';
import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import { ThermalScaledPreview } from '../POSPrintPreview';
import CheckoutRemarks from '../features/checkout/CheckoutRemarks';

// ── R3: the verbatim LEFT preview column ────────────────────────────────────────────────
function OriginalPreviewColumn({
  showA4CheckoutPreview, checkoutA4Html, checkoutA4BlobUrl, checkoutPreviewBlobUrl, A4ScaledPreview,
}) {
  return (
    <>
      {/* PREVIEW-START */}
            {/* ══ LEFT: Invoice Preview ════════════════════════════════ */}
            <div className={`w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 ${
              showA4CheckoutPreview ? 'lg:w-[400px] xl:w-[500px] 2xl:w-[600px]' :
              'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'
            }`}>
              {showA4CheckoutPreview ? (
                checkoutA4Html ? (
                  <A4ScaledPreview src={checkoutA4BlobUrl} fillWidth />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                    <ShoppingCart className="h-10 w-10 mb-2" />
                    <p className="text-xs">Add items to preview</p>
                  </div>
                )
              ) : checkoutPreviewBlobUrl ? (
                // User request: always use 80mm print preview in the checkout window.
                <ThermalScaledPreview src={checkoutPreviewBlobUrl} paperSize="80mm" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-xs">Add items to preview</p>
                </div>
              )}
            </div>
      {/* PREVIEW-END */}
    </>
  );
}

// ── R5 (contains R6): the verbatim scroll body ──────────────────────────────────────────
function OriginalScrollBody({
  depositAmt, shippingChargeNum, currentInvoice, grandTotal, effectiveDue,
  checkoutPayment, checkoutCompatibility, customerOptions, loadPosCustomers, selectedCustomer,
  selectedCustomerData, checkoutOnlineBankAccounts, checkoutOnlineBankAccountsLoading,
  checkoutRemarks, setCheckoutRemarks,
}) {
  return (
    <>
      {/* SCROLL-START */}
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
      {/* SCROLL-END */}
    </>
  );
}

// ── R6 pre-extraction: the Remarks card exactly as it stood in POSSales ─────────────────
function OriginalRemarksMarkup({ checkoutRemarks, setCheckoutRemarks }) {
  return (
    <>
      {/* REMARKS-ORIGINAL-START */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Remarks / Reference</label>
                    <input value={checkoutRemarks} onChange={e => setCheckoutRemarks(e.target.value)}
                      placeholder="Tap to enter note…"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />
                  </div>
      {/* REMARKS-ORIGINAL-END */}
    </>
  );
}

// ── fixtures / harness ──────────────────────────────────────────────────────────────────
const makePayment = (overrides = {}) => ({
  paymentLines: [], invoiceTotal: 100, remainingBalance: 100, changeAmount: 0, totalAllocated: 0,
  totalCredit: 0, paymentSummary: null, lineErrors: {}, isOverAllocated: false, canSettle: false,
  addLine: vi.fn(), updateLine: vi.fn(), removeLine: vi.fn(),
  ...overrides,
});

const scrollProps = (overrides = {}) => ({
  depositAmt: 0,
  shippingChargeNum: 0,
  currentInvoice: { items: [{ id: 1 }], total: 100 },
  grandTotal: 100,
  effectiveDue: 100,
  checkoutPayment: makePayment(),
  checkoutCompatibility: { status: 'supported', canSettle: true, message: null, retry: vi.fn() },
  customerOptions: [{ id: 'walk-in', name: 'Walk-in Customer' }],
  loadPosCustomers: vi.fn(),
  selectedCustomer: 'walk-in',
  selectedCustomerData: { id: 'walk-in', name: 'Walk-in Customer' },
  checkoutOnlineBankAccounts: [],
  checkoutOnlineBankAccountsLoading: false,
  ...overrides,
});

/** Owns checkoutRemarks exactly as useCheckout does (a plain useState('') pair). */
const remarksLog = [];
function ScrollHarness({ tick, initialRemarks = '', ...rest }) {
  const [checkoutRemarks, rawSetCheckoutRemarks] = useState(initialRemarks);
  const setCheckoutRemarks = (v) => { remarksLog.push(v); rawSetCheckoutRemarks(v); };
  return (
    <div data-tick={tick}>
      <OriginalScrollBody {...scrollProps(rest)} checkoutRemarks={checkoutRemarks} setCheckoutRemarks={setCheckoutRemarks} />
    </div>
  );
}

const StubA4 = ({ src, fillWidth }) => <div data-testid="a4-preview" data-src={src} data-fill-width={String(fillWidth)} />;
const previewProps = (overrides = {}) => ({
  showA4CheckoutPreview: false, checkoutA4Html: '', checkoutA4BlobUrl: '', checkoutPreviewBlobUrl: 'blob:thermal-1', A4ScaledPreview: StubA4,
  ...overrides,
});

const remarksInput = () => screen.getByPlaceholderText('Tap to enter note…');
const remarksCard = () => remarksInput().parentElement;
const body = (container) => container.querySelector('.p-4.space-y-3');
const modalText = () => screen.queryByTestId('modal')?.textContent ?? null;
const keydown = (target, key) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
};

beforeEach(() => {
  modalSpy.calls = [];
  remarksLog.length = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── R6. Remarks card ────────────────────────────────────────────────────────────────────
describe('R6. Remarks card — render contract', () => {
  it('card > label + input, with the exact classes and copy', () => {
    render(<ScrollHarness initialRemarks="REF-1" />);
    const card = remarksCard();
    expect(card.className).toBe('bg-white rounded-2xl border border-gray-200 p-4 shadow-sm');
    expect(card.children).toHaveLength(2);
    expect(card.children[0].tagName).toBe('LABEL');
    expect(card.children[0].className).toBe('text-[10px] font-bold text-gray-400 uppercase');
    expect(card.children[0].textContent).toBe('Remarks / Reference');
    expect(card.children[1]).toBe(remarksInput());
    expect(remarksInput().value).toBe('REF-1');
  });

  it('the input carries only value/placeholder/class — no type, name, id, maxLength, aria or form', () => {
    render(<ScrollHarness />);
    const input = remarksInput();
    expect(input.getAttributeNames().sort()).toEqual(['class', 'placeholder', 'value']);
    expect(input.type).toBe('text');
    expect(input.maxLength).toBe(-1);
    expect(input.form).toBeNull();
    expect(input.closest('form')).toBeNull();
  });

  it('the label is NOT associated with the input: no accessible name, label click does not focus', () => {
    render(<ScrollHarness />);
    expect(screen.queryByLabelText('Remarks / Reference')).toBeNull();
    expect(remarksInput().labels).toHaveLength(0);
    fireEvent.click(remarksCard().children[0]);
    expect(document.activeElement).not.toBe(remarksInput());
  });

  it('each change forwards e.target.value (a string) once; the value is controlled and never trimmed', () => {
    render(<ScrollHarness />);
    fireEvent.change(remarksInput(), { target: { value: '  gift wrap  ' } });
    fireEvent.change(remarksInput(), { target: { value: '' } });
    fireEvent.change(remarksInput(), { target: { value: 'ﻣﺮﺣﺒﺎ 🎁' } });
    expect(remarksLog).toEqual(['  gift wrap  ', '', 'ﻣﺮﺣﺒﺎ 🎁']);
    expect(remarksInput().value).toBe('ﻣﺮﺣﺒﺎ 🎁');
  });

  it('a very long value is accepted unchanged', () => {
    render(<ScrollHarness />);
    const long = 'x'.repeat(5000);
    fireEvent.change(remarksInput(), { target: { value: long } });
    expect(remarksInput().value).toBe(long);
  });

  it('Enter in the input submits nothing and calls no setter', () => {
    render(<ScrollHarness />);
    const event = keydown(remarksInput(), 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(remarksLog).toEqual([]);
  });
});

describe('R6. Remarks card — identity, focus and keyboard interplay', () => {
  it('parent re-renders keep the SAME input node, its focus and its caret', () => {
    const { rerender } = render(<ScrollHarness tick={1} initialRemarks="abcdef" />);
    const input = remarksInput();
    input.focus();
    input.setSelectionRange(2, 4);
    rerender(<ScrollHarness tick={2} initialRemarks="ignored" />);
    rerender(<ScrollHarness tick={3} checkoutPayment={makePayment({ remainingBalance: 50 })} />);
    expect(remarksInput()).toBe(input);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
    expect(input.value).toBe('abcdef');
  });

  it('typing keeps focus on the same node', () => {
    render(<ScrollHarness />);
    const input = remarksInput();
    input.focus();
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(remarksInput()).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('HAZARD: the same markup behind a wrapper type re-created per parent render remounts the input and drops focus', () => {
    const makeInline = () => ({ value, onChange }) => createElement('input', { value, onChange, placeholder: 'Tap to enter note…' });
    const parent = ({ tick }) => createElement('div', { 'data-tick': tick }, createElement(makeInline(), { value: 'x', onChange: () => {} }));
    const { rerender } = render(createElement(parent, { tick: 1 }));
    const input = remarksInput();
    input.focus();
    rerender(createElement(parent, { tick: 2 }));
    expect(remarksInput()).not.toBe(input);
    expect(document.activeElement).not.toBe(remarksInput());
  });

  it('PaymentAllocationPanel hotkeys are ignored while typing in remarks (INPUT target), live elsewhere', () => {
    const { container } = render(<ScrollHarness />);
    for (const key of ['c', 'd', 'o', 'r', 'b']) {
      expect(keydown(remarksInput(), key).defaultPrevented).toBe(false);
    }
    expect(modalText()).toBeNull();
    expect(keydown(remarksCard(), 'c').defaultPrevented).toBe(true);
    expect(modalText()).toBe('CashPaymentModal');
    expect(body(container).contains(screen.getByTestId('modal'))).toBe(true);
  });

  it('typing in remarks does not close or reset an open panel modal', () => {
    render(<ScrollHarness />);
    fireEvent.click(screen.getByText('Online').closest('button'));
    expect(modalText()).toBe('OnlinePaymentModal');
    fireEvent.change(remarksInput(), { target: { value: 'ref 77' } });
    expect(modalText()).toBe('OnlinePaymentModal');
    expect(remarksInput().value).toBe('ref 77');
  });

  it('an open panel modal does not disable, clear or hide remarks', () => {
    render(<ScrollHarness initialRemarks="kept" />);
    fireEvent.click(screen.getByText('Cash').closest('button'));
    expect(remarksInput().disabled).toBe(false);
    expect(remarksInput().value).toBe('kept');
  });
});

// ── R5. scroll body ─────────────────────────────────────────────────────────────────────
describe('R5. scroll body', () => {
  it('outer overflow wrapper > p-4 body; children = [summary?] + panel root + remarks card', () => {
    const { container } = render(<ScrollHarness />);
    const outer = container.firstElementChild.firstElementChild;
    expect(outer.className).toBe('flex-1 overflow-y-auto');
    expect(outer.children).toHaveLength(1);
    expect(outer.children[0].className).toBe('p-4 space-y-3');
    expect([...body(container).children].map((c) => c.className)).toEqual([
      'space-y-3',
      'bg-white rounded-2xl border border-gray-200 p-4 shadow-sm',
    ]);
  });

  it.each([
    [{ depositAmt: 5 }, true],
    [{ shippingChargeNum: 10 }, true],
    [{ depositAmt: 0, shippingChargeNum: 0 }, false],
    [{ depositAmt: -1, shippingChargeNum: -1 }, false],
  ])('settlement-summary guard %j → rendered %s, always before panel and remarks', (props, shown) => {
    const { container } = render(<ScrollHarness {...props} />);
    const kids = [...body(container).children];
    expect(kids).toHaveLength(shown ? 3 : 2);
    expect(kids[kids.length - 1]).toBe(remarksCard());
    expect(kids[kids.length - 2].className).toBe('space-y-3');
  });

  it('toggling the summary guard keeps the panel (and its open modal) and the remarks input mounted', () => {
    const { rerender } = render(<ScrollHarness tick={1} />);
    fireEvent.click(screen.getByText('Card').closest('button'));
    const input = remarksInput();
    rerender(<ScrollHarness tick={2} shippingChargeNum={15} grandTotal={115} effectiveDue={115} />);
    expect(modalText()).toBe('CardPaymentModal');
    expect(remarksInput()).toBe(input);
    rerender(<ScrollHarness tick={3} />);
    expect(modalText()).toBe('CardPaymentModal');
    expect(remarksInput()).toBe(input);
  });

  it('the panel receives the eight call-site props (checked through the modal it opens)', () => {
    const bank = [{ id: 'b1' }];
    const load = vi.fn();
    render(<ScrollHarness checkoutOnlineBankAccounts={bank} checkoutOnlineBankAccountsLoading loadPosCustomers={load} selectedCustomer="c-9" />);
    fireEvent.click(screen.getByText('Credit').closest('button'));
    const p = modalSpy.calls.at(-1).props;
    expect(p.bankAccounts).toBe(bank);
    expect(p.bankAccountsLoading).toBe(true);
    expect(p.onCustomerCreated).toBe(load);
    expect(p.defaultCustomerId).toBe('c-9');
  });
});

// ── R3. preview column ──────────────────────────────────────────────────────────────────
describe('R3. preview column — lifecycle with the real ThermalScaledPreview', () => {
  const iframe = (c) => c.querySelector('iframe');

  it('thermal branch renders one 80mm iframe with the blob src', () => {
    const { container } = render(<OriginalPreviewColumn {...previewProps()} />);
    expect(container.firstElementChild.children).toHaveLength(1);
    expect(iframe(container).getAttribute('src')).toBe('blob:thermal-1');
    expect(iframe(container).title).toBe('Thermal Receipt Preview');
    expect(container.querySelector('.w-\\[340px\\]')).not.toBeNull();
  });

  it('re-rendering with the same src keeps the SAME iframe node', () => {
    const { container, rerender } = render(<OriginalPreviewColumn {...previewProps()} />);
    const frame = iframe(container);
    rerender(<OriginalPreviewColumn {...previewProps()} />);
    expect(iframe(container)).toBe(frame);
  });

  it('a new blob URL updates the src in place — no remount', () => {
    const { container, rerender } = render(<OriginalPreviewColumn {...previewProps()} />);
    const frame = iframe(container);
    rerender(<OriginalPreviewColumn {...previewProps({ checkoutPreviewBlobUrl: 'blob:thermal-2' })} />);
    expect(iframe(container)).toBe(frame);
    expect(frame.getAttribute('src')).toBe('blob:thermal-2');
  });

  it.each([[''], [null], [undefined]])('blob %j → placeholder; the iframe unmounts and returns as a NEW node', (blank) => {
    const { container, rerender } = render(<OriginalPreviewColumn {...previewProps()} />);
    const frame = iframe(container);
    const column = container.firstElementChild;
    rerender(<OriginalPreviewColumn {...previewProps({ checkoutPreviewBlobUrl: blank })} />);
    expect(iframe(container)).toBeNull();
    expect(frame.isConnected).toBe(false);
    expect(column.textContent).toBe('Add items to preview');
    expect(container.firstElementChild).toBe(column);
    rerender(<OriginalPreviewColumn {...previewProps()} />);
    expect(iframe(container)).not.toBe(frame);
  });

  it('the column <div> itself survives every branch switch, only its class changes', () => {
    const { container, rerender } = render(<OriginalPreviewColumn {...previewProps()} />);
    const column = container.firstElementChild;
    rerender(<OriginalPreviewColumn {...previewProps({ showA4CheckoutPreview: true, checkoutA4Html: '<html/>', checkoutA4BlobUrl: 'blob:a4' })} />);
    expect(container.firstElementChild).toBe(column);
    expect(column.className).toContain('lg:w-[400px] xl:w-[500px] 2xl:w-[600px]');
    expect(screen.getByTestId('a4-preview').dataset).toMatchObject({ src: 'blob:a4', fillWidth: 'true' });
    rerender(<OriginalPreviewColumn {...previewProps({ showA4CheckoutPreview: true, checkoutA4Html: '' })} />);
    expect(container.firstElementChild).toBe(column);
    expect(column.textContent).toBe('Add items to preview');
  });

  it('HAZARD model: a raw unkeyed <div> first child is recycled across the phase switch; a component in that slot is not', () => {
    const Column = ({ className }) => <div className={className} />;
    const view = (phase, wrapped) => (
      <div>{phase === 'payment' ? (wrapped ? <Column className="left" /> : <div className="left" />) : <div className="card" />}</div>
    );
    const raw = render(view('payment', false));
    const rawNode = raw.container.firstElementChild.firstElementChild;
    raw.rerender(view('complete', false));
    expect(raw.container.firstElementChild.firstElementChild).toBe(rawNode);
    cleanup();
    const wrapped = render(view('payment', true));
    const wrappedNode = wrapped.container.firstElementChild.firstElementChild;
    wrapped.rerender(view('complete', true));
    expect(wrapped.container.firstElementChild.firstElementChild).not.toBe(wrappedNode);
  });
});

// ── source ──────────────────────────────────────────────────────────────────────────────
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const USE_CHECKOUT = readSource('../features/checkout/useCheckout.js');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const count = (src, needle) => src.split(needle).length - 1;
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};
const REGION_START = '      {/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}\n';
const REGION = (() => {
  const i = POS_SALES.indexOf(REGION_START);
  return POS_SALES.slice(i, POS_SALES.indexOf('\n      })()}', i));
})();
const PAYMENT_PHASE = REGION.slice(REGION.indexOf('        const shippingChargeNum = Number(shippingCharge) || 0;\n'));

const PREVIEW = () => between(SELF, '{/* PREVIEW-START */}\n', '\n      {/* PREVIEW-END */}');
/** The CheckoutPaymentPreview call that replaced the column's 18-line inner expression in POSSales. */
const PREVIEW_CALL = [
  '              <CheckoutPaymentPreview',
  '                showA4CheckoutPreview={showA4CheckoutPreview}',
  '                checkoutA4Html={checkoutA4Html}',
  '                checkoutA4BlobUrl={checkoutA4BlobUrl}',
  '                checkoutPreviewBlobUrl={checkoutPreviewBlobUrl}',
  '              />',
].join('\n');
/** The live R3: the LEFT comment, the unchanged outer column opener, the call, the unchanged close. */
const LIVE_PREVIEW = () => {
  const lines = PREVIEW().split('\n');
  return [...lines.slice(0, 5), PREVIEW_CALL, ...lines.slice(23)].join('\n');
};
const SCROLL = () => between(SELF, '{/* SCROLL-START */}\n', '\n      {/* SCROLL-END */}');
/** The R6 call site in POSSales: the kept Remarks comment plus the CheckoutRemarks call. */
const REMARKS = [
  '                  {/* ── Remarks ── */}',
  '                  <CheckoutRemarks',
  '                    checkoutRemarks={checkoutRemarks}',
  '                    setCheckoutRemarks={setCheckoutRemarks}',
  '                  />',
].join('\n');
/** The six-line card body that used to follow the comment in POSSales, now CheckoutRemarks' return body. */
const ORIGINAL_REMARKS = [
  '                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">',
  '                    <label className="text-[10px] font-bold text-gray-400 uppercase">Remarks / Reference</label>',
  '                    <input value={checkoutRemarks} onChange={e => setCheckoutRemarks(e.target.value)}',
  '                      placeholder="Tap to enter note…"',
  '                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />',
  '                  </div>',
].join('\n');
const COMPONENT = readSource('../features/checkout/CheckoutRemarks.jsx');
const DERIVE = [
  '        const shippingChargeNum = Number(shippingCharge) || 0;',
  '        const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;',
  '        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;',
  '        // Owned by the Payment Manager (checkoutEffectiveDue) so the screen and the manager',
  '        // measure every allocation against exactly the same amount due.',
  '        const effectiveDue = checkoutEffectiveDue;',
  '        // Real next number from the backend sequence (fetched when the dialog',
  '        // opened); blank until it lands so no fabricated number is shown.',
  "        const invoiceNo = previewInvoiceNo || '';",
  '',
  '        // Every payment figure below comes from the Payment Manager, which owns the',
  "        // cashier's allocations. See CheckoutPaymentManager for the allocation UI itself.",
  '        // Settlement needs both a fully-allocated bill and a server that will record it.',
  '        const canSettle = checkoutPayment.canSettle && checkoutCompatibility.canSettle;',
].join('\n');

/** Identifiers read from enclosing scope, minus JSX tags/attributes and string/comment content. */
const PARENT_LOCALS = [
  'shippingChargeNum', 'grandTotal', 'depositAmt', 'effectiveDue', 'invoiceNo', 'canSettle',
  'currentInvoice', 'checkoutPayment', 'checkoutCompatibility', 'checkoutPaymentFields', 'checkoutEffectiveDue',
  'checkoutError', 'setCheckoutError', 'checkoutLoading', 'processPayment', 'cancelCheckoutTenders',
  'setShowPaymentDialog', 'showPaymentDialog', 'checkoutSettling', 'setCheckoutSettling', 'checkoutPreviewFreezeRef',
  'checkoutPhase', 'lastPaidInvoice', 'customerOptions', 'loadPosCustomers', 'selectedCustomer', 'selectedCustomerData',
  'checkoutOnlineBankAccounts', 'checkoutOnlineBankAccountsLoading', 'checkoutRemarks', 'setCheckoutRemarks',
  'showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl', 'checkoutThermalHtml',
  'shippingCharge', 'activeLayawayDeposit', 'previewInvoiceNo',
];
const readsOf = (src) => PARENT_LOCALS.filter((id) => new RegExp(`\\b${id}\\b`).test(src));

describe('source — verbatim copies are the live POSSales regions', () => {
  it('R3 preview column: byte for byte (24 lines; 12 live now that the inner content is CheckoutPaymentPreview), immediately after the z-[60] root opens', () => {
    expect(PREVIEW().split('\n')).toHaveLength(24);
    expect(LIVE_PREVIEW().split('\n')).toHaveLength(12);
    expect(count(POS_SALES, PREVIEW())).toBe(0);
    expect(count(POS_SALES, LIVE_PREVIEW())).toBe(1);
    expect(PAYMENT_PHASE).toContain(`          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n\n${LIVE_PREVIEW()}\n\n            {/* ══ RIGHT: Payment & Settlement ═══════════════════════ */}\n`);
  });

  it('R5 scroll body: byte for byte (40 lines; 42 before R6 moved to CheckoutRemarks), between the header call and the footer call', () => {
    expect(SCROLL().split('\n')).toHaveLength(40);
    expect(count(POS_SALES, SCROLL())).toBe(1);
    expect(PAYMENT_PHASE).toContain(`                onClose={() => setShowPaymentDialog(false)}\n              />\n\n${SCROLL()}\n\n              {/* ── Settlement footer ── */}\n              <CheckoutPaymentFooter\n`);
  });

  it('R6 remarks: the kept comment + 4-line call inside R5, after the panel call + two blank lines, followed by three blank lines and the body close', () => {
    expect(count(POS_SALES, REMARKS)).toBe(1);
    expect(SCROLL()).toContain(`                  />\n\n\n${REMARKS}\n\n\n\n                </div>\n              </div>`);
  });

  it('R1 derivation: 14 lines, directly before `return (` and the z-[60] root', () => {
    expect(count(POS_SALES, DERIVE)).toBe(1);
    expect(PAYMENT_PHASE.startsWith(`${DERIVE}\n\n        return (\n          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n`)).toBe(true);
  });

  it('R4 right column: header comment + call, scroll body, footer comment + call, then close', () => {
    const right = between(PAYMENT_PHASE, '            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">\n', '\n          </div>\n        );');
    const order = ['{/* Right header */}', '<CheckoutPaymentHeader', '<div className="flex-1 overflow-y-auto">', '{/* ── Settlement footer ── */}', '<CheckoutPaymentFooter'];
    const idx = order.map((n) => right.indexOf(n));
    expect(idx.every((v) => v >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(right.endsWith('                onSettle={() => processPayment()}\n              />\n\n            </div>')).toBe(true);
  });
});

describe('source — closures, ownership and lifecycle per region', () => {
  it('R6 remarks reads exactly checkoutRemarks + setCheckoutRemarks, has one handler (now inside CheckoutRemarks), no hooks', () => {
    expect(readsOf(REMARKS)).toEqual(['checkoutRemarks', 'setCheckoutRemarks']);
    expect(count(REMARKS, 'onChange=')).toBe(0);
    expect(REMARKS).not.toMatch(/onClick|onKey|onBlur|onFocus|ref=|key=|use[A-Z]/);
    expect(readsOf(ORIGINAL_REMARKS)).toEqual(['checkoutRemarks', 'setCheckoutRemarks']);
    expect(count(ORIGINAL_REMARKS, 'onChange=')).toBe(1);
    expect(ORIGINAL_REMARKS).not.toMatch(/onClick|onKey|onBlur|onFocus|ref=|key=|use[A-Z]/);
  });

  it('R3 preview reads only the four preview values; icons/previews come from module imports', () => {
    expect(readsOf(PREVIEW())).toEqual(['showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl']);
    expect(PREVIEW()).not.toMatch(/on[A-Z]\w*=|ref=|key=/);
    expect(readsOf(LIVE_PREVIEW())).toEqual(['showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl']);
    expect(LIVE_PREVIEW()).not.toMatch(/on[A-Z]\w*=|ref=|key=/);
    // the scaled previews and the placeholder icon are now imported by CheckoutPaymentPreview, not POSSales
    expect(POS_SALES).toContain("import CheckoutRemarks from './POS/features/checkout/CheckoutRemarks';\nimport CheckoutPaymentPreview from './POS/features/checkout/CheckoutPaymentPreview';\n");
    expect(POS_SALES).not.toMatch(/\bA4ScaledPreview\b|\bThermalScaledPreview\b/);
    expect(readSource('../features/checkout/CheckoutPaymentPreview.jsx')).toContain("import { A4ScaledPreview, ThermalScaledPreview } from '../../POSPrintPreview';\n");
  });

  it('R5 scroll body reads the summary/panel/remarks inputs, but no settle, cancel, dialog or preview state', () => {
    expect(readsOf(SCROLL())).toEqual([
      'shippingChargeNum', 'grandTotal', 'depositAmt', 'effectiveDue', 'currentInvoice', 'checkoutPayment',
      'checkoutCompatibility', 'customerOptions', 'loadPosCustomers', 'selectedCustomer', 'selectedCustomerData',
      'checkoutOnlineBankAccounts', 'checkoutOnlineBankAccountsLoading', 'checkoutRemarks', 'setCheckoutRemarks',
    ]);
  });

  it('R4 right column closes over the dialog, cancel and settle handlers (ownership traps)', () => {
    const right = between(PAYMENT_PHASE, '<div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">', '\n          </div>\n        );');
    expect(readsOf(right)).toEqual(expect.arrayContaining(['setShowPaymentDialog', 'setCheckoutError', 'cancelCheckoutTenders', 'processPayment', 'canSettle', 'invoiceNo']));
  });

  it('remarks ownership: useCheckout useState(\'\'), reset once on the success path, returned, never sent or previewed', () => {
    expect(count(USE_CHECKOUT, "  const [checkoutRemarks, setCheckoutRemarks] = useState('');\n")).toBe(1);
    expect(USE_CHECKOUT.match(/\bcheckoutRemarks\b/g)).toHaveLength(2);
    expect(USE_CHECKOUT.match(/\bsetCheckoutRemarks\(/g)).toHaveLength(1);
    expect(USE_CHECKOUT).toContain("      setLastScannedItem(null);\n      setCheckoutRemarks('');\n      // Drop the allocations so the next sale starts from an empty payment panel.\n");
    expect(USE_CHECKOUT.indexOf("setCheckoutRemarks('')")).toBeGreaterThan(USE_CHECKOUT.indexOf('      setLastPaidInvoice(paid);\n'));
    expect(USE_CHECKOUT).not.toMatch(/remarks\s*:/i);
    // destructure + both sides of the CheckoutRemarks prop (was destructure + the inline input's two uses)
    expect(POS_SALES.match(/\bcheckoutRemarks\b/g)).toHaveLength(3);
    expect(POS_SALES.match(/\bsetCheckoutRemarks\b/g)).toHaveLength(3);
    expect(POS_SALES).toContain('    checkoutRemarks, setCheckoutRemarks,\n    processPayment,\n  } = useCheckout({');
  });

  it('preview lifecycle stays outside the region: blob hooks and the settling freeze are POSSales top-level', () => {
    const regionAt = POS_SALES.indexOf(REGION_START);
    for (const decl of [
      '  const [checkoutSettling, setCheckoutSettling] = useState(false);\n',
      "  const checkoutPreviewFreezeRef = useRef('');\n",
      '    if (checkoutSettling) return checkoutPreviewFreezeRef.current;\n',
      '\n        checkoutPreviewFreezeRef.current = html;\n',
      '\n      checkoutPreviewFreezeRef.current = html;\n',
      '  const checkoutPreviewBlobUrl = useA4BlobUrl(checkoutThermalHtml);\n',
      '  const showA4CheckoutPreview = false;\n',
      "    if (checkoutSettling) return checkoutPreviewFreezeRef.current || '';\n",
      '  const checkoutA4BlobUrl = useA4BlobUrl(checkoutA4Html);\n',
      '    previewFreeze: { checkoutSettling, setCheckoutSettling, checkoutPreviewFreezeRef },\n',
    ]) {
      expect(count(POS_SALES, decl), decl).toBe(1);
      expect(POS_SALES.indexOf(decl), decl).toBeLessThan(regionAt);
    }
    // two freeze writes (Template 2 branch, then the Template 1 path), both inside the thermal memo
    expect(POS_SALES.match(/checkoutPreviewFreezeRef\.current = html;/g)).toHaveLength(2);
    expect(REGION).not.toMatch(/useA4BlobUrl|checkoutPreviewFreezeRef|checkoutThermalHtml|checkoutSettling/);
  });

  it('neither preview memo depends on remarks, so typing never rebuilds the preview', () => {
    const thermalDeps = between(POS_SALES, '\n      checkoutPreviewFreezeRef.current = html;\n', '  const checkoutPreviewBlobUrl');
    expect(thermalDeps).toContain('}, [checkoutSettling, currentInvoice,');
    expect(thermalDeps).not.toContain('checkoutRemarks');
    const a4 = between(POS_SALES, '  const checkoutA4Html = useMemo(() => {', '  const checkoutA4BlobUrl');
    expect(a4).not.toContain('checkoutRemarks');
  });

  it('the payment branch has no hooks, keys or refs of its own; the root and left column are raw unkeyed <div>s', () => {
    expect(PAYMENT_PHASE).not.toMatch(/\buse[A-Z]\w*\(|\bref=|\bkey=/);
    const complete = REGION.slice(0, REGION.indexOf('        const shippingChargeNum'));
    expect(complete).toContain('            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">\n              <div className="bg-white rounded-3xl');
    expect(PAYMENT_PHASE).toContain('          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n\n            {/* ══ LEFT: Invoice Preview ════════════════════════════════ */}\n            <div className={`w-full shrink-0');
  });

  it('no inline component, memo or context in the region; PaymentAllocationPanel stays a direct module JSX tag', () => {
    expect(REGION).not.toMatch(/\bconst [A-Z]\w*\s*=\s*\(|\bfunction [A-Z]\w*\(|\bmemo\(|createContext|useContext|\.Provider/);
    expect(count(REGION, '<PaymentAllocationPanel\n')).toBe(1);
  });
});

describe('source — suites that anchor on R6 (inventory, read-only)', () => {
  it('lists the remarks anchors, updated for the CheckoutRemarks call', () => {
    expect(readSource('./CheckoutScreen.characterization.test.jsx')).toContain("expect(count(r, 'onChange={e => setCheckoutRemarks(e.target.value)}')).toBe(0);");
    expect(readSource('./CheckoutScreen.characterization.test.jsx')).toContain("import CheckoutRemarks from '../features/checkout/CheckoutRemarks';");
    expect(readSource('./CheckoutPaymentFooter.characterization.test.jsx')).toContain("      '                  {/* ── Remarks ── */}',\n      '                  <CheckoutRemarks',");
    expect(readSource('./PaymentAllocationPanel.characterization.test.jsx')).toContain('{\\/\\* ── Remarks ── \\*\\/\\}\\n {18}<CheckoutRemarks\\n/');
  });
});

// ── R6 extraction: original markup vs CheckoutRemarks ───────────────────────────────────
describe('R6 extraction — the pre-extraction markup and CheckoutRemarks render equivalently', () => {
  const VALUES = ['', 'REF-1', '  gift wrap  ', 'ﻣﺮﺣﺒﺎ 🎁', '<b>not html</b>', 'x'.repeat(500)];

  it.each(VALUES)('identical DOM for %j', (value) => {
    const original = render(<OriginalRemarksMarkup checkoutRemarks={value} setCheckoutRemarks={() => {}} />);
    const originalHtml = original.container.innerHTML;
    const originalValue = original.container.querySelector('input').value;
    cleanup();
    const extracted = render(<CheckoutRemarks checkoutRemarks={value} setCheckoutRemarks={() => {}} />);
    expect(extracted.container.innerHTML).toBe(originalHtml);
    expect(extracted.container.querySelector('input').value).toBe(originalValue);
    expect(originalValue).toBe(value);
  });

  it('identical onChange forwarding: one call per change, the raw string, straight to the given setter', () => {
    const typed = ['a', 'ab', '', '  ref  '];
    const run = (Component) => {
      const setter = vi.fn();
      render(<Component checkoutRemarks="" setCheckoutRemarks={setter} />);
      for (const v of typed) fireEvent.change(remarksInput(), { target: { value: v } });
      cleanup();
      return setter.mock.calls;
    };
    const original = run(OriginalRemarksMarkup);
    expect(run(CheckoutRemarks)).toEqual(original);
    // The value prop stays '' (the setter is a spy), so the controlled input snaps back after each
    // change and a change to '' is not a change at all: React fires nothing for it, in both.
    expect(original).toEqual([['a'], ['ab'], ['  ref  ']]);
  });

  it('identical controlled round-trip under a useState owner, keeping the same node and focus', () => {
    const Owner = ({ Component }) => {
      const [checkoutRemarks, setCheckoutRemarks] = useState('');
      return <Component checkoutRemarks={checkoutRemarks} setCheckoutRemarks={setCheckoutRemarks} />;
    };
    for (const Component of [OriginalRemarksMarkup, CheckoutRemarks]) {
      render(<Owner Component={Component} />);
      const input = remarksInput();
      input.focus();
      fireEvent.change(input, { target: { value: 'note 1' } });
      expect(remarksInput()).toBe(input);
      expect(input.value).toBe('note 1');
      expect(document.activeElement).toBe(input);
      cleanup();
    }
  });

  it('the label stays unassociated in both', () => {
    for (const Component of [OriginalRemarksMarkup, CheckoutRemarks]) {
      render(<Component checkoutRemarks="" setCheckoutRemarks={() => {}} />);
      expect(screen.queryByLabelText('Remarks / Reference')).toBeNull();
      expect(remarksInput().labels).toHaveLength(0);
      expect(remarksInput().getAttributeNames().sort()).toEqual(['class', 'placeholder', 'value']);
      cleanup();
    }
  });

  it('renders standalone with only its two props — no provider, context or parent scope needed', () => {
    const setter = vi.fn();
    const { container } = render(<CheckoutRemarks checkoutRemarks="solo" setCheckoutRemarks={setter} />);
    expect(container.children).toHaveLength(1);
    expect(remarksInput().value).toBe('solo');
    fireEvent.change(remarksInput(), { target: { value: 'solo!' } });
    expect(setter).toHaveBeenCalledWith('solo!');
  });
});

describe('source — CheckoutRemarks', () => {
  const code = () => COMPONENT.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('the REMARKS-ORIGINAL copy is the pre-extraction card body, and POSSales no longer contains it', () => {
    expect(between(SELF, '{/* REMARKS-ORIGINAL-START */}\n', '\n      {/* REMARKS-ORIGINAL-END */}')).toBe(ORIGINAL_REMARKS);
    expect(count(POS_SALES, ORIGINAL_REMARKS)).toBe(0);
    for (const moved of ['Remarks / Reference', 'placeholder="Tap to enter note…"', 'onChange={e => setCheckoutRemarks(e.target.value)}']) {
      expect(POS_SALES, moved).not.toContain(moved);
    }
  });

  it('its return body is the original card body, byte for byte (no substitutions needed: the props keep the POSSales names)', () => {
    expect(count(COMPONENT, `  return (\n${ORIGINAL_REMARKS}\n  );\n}\n\nexport default CheckoutRemarks;\n`)).toBe(1);
  });

  it('props are exactly checkoutRemarks and setCheckoutRemarks', () => {
    expect(COMPONENT).toContain('function CheckoutRemarks({\n  checkoutRemarks,\n  setCheckoutRemarks,\n}) {');
    expect(COMPONENT.match(/function \w+\(/g)).toEqual(['function CheckoutRemarks(']);
  });

  it('module-level plain function default export: no hooks, memo, context, effects, refs, keys or other imports', () => {
    expect(typeof CheckoutRemarks).toBe('function');
    expect(CheckoutRemarks.$$typeof).toBeUndefined();
    expect(code()).not.toMatch(/\buse[A-Z]\w*\(|\bmemo\b|createContext|useContext|forwardRef|\bref=|\bkey=/);
    expect(code()).not.toMatch(/\basync\b|\bawait\b|fetch\(|axios|setTimeout|setInterval/);
    expect(code().match(/^import .*$/gm)).toEqual(["import React from 'react';"]);
    expect(readsOf(code())).toEqual(['checkoutRemarks', 'setCheckoutRemarks']);
    expect(count(code(), 'onChange=')).toBe(1);
    expect(code()).not.toMatch(/\b(type|name|id|htmlFor|maxLength|form)=/);
  });

  it('POSSales imports it once, after CheckoutPaymentFooter, and renders it once at the R6 call site', () => {
    expect(count(POS_SALES, "import CheckoutPaymentFooter from './POS/features/checkout/CheckoutPaymentFooter';\nimport CheckoutRemarks from './POS/features/checkout/CheckoutRemarks';\n")).toBe(1);
    expect(POS_SALES.match(/\bCheckoutRemarks\b/g)).toHaveLength(3); // import binding, import path, JSX tag
    expect(count(POS_SALES, `\n${REMARKS}\n`)).toBe(1);
    expect(count(PAYMENT_PHASE, '<CheckoutRemarks\n')).toBe(1);
  });
});
