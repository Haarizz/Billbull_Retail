import fs from 'node:fs';
import path from 'node:path';
import React, { useCallback, useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirhamSymbol } from '../POSCurrency';
import { PAYMENT_TYPES } from '../payments/paymentModel';
import CheckoutPaymentHeader from '../features/checkout/CheckoutPaymentHeader';
import CheckoutPaymentFooter from '../features/checkout/CheckoutPaymentFooter';

/**
 * Characterization of the payment-phase SETTLEMENT FOOTER of the POSSales.jsx checkout IIFE —
 * the `border-t-2 border-[#F5C742]/30` block holding Change Due, the checkoutError banner and the
 * Cancel / Settle action row — now rendered by CheckoutPaymentFooter.
 *
 * Every behaviour block (sections 1–6) runs twice: against the pre-extraction markup copied
 * VERBATIM (FOOTER markers) and against the extracted component through the POSSales call site
 * (CALL block, enforced byte-for-byte against POSSales by the source block).
 *
 * Already owned by CheckoutScreen.characterization.test.jsx and deliberately NOT repeated here:
 * the payment root / z-[60], the preview column, PaymentAllocationPanel props, remarks wiring,
 * phase behaviour, the base Cancel class + log order, the base 16-row settleReady table, the
 * truthy-non-boolean canSettle rows and the Processing… children.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - Cancel stays enabled while checkoutLoading is true and closes the dialog mid-settle;
 *     it neither aborts processPayment nor resets checkoutLoading. The header X does the same
 *     with even less clean-up (error and tenders kept).
 *   - Cancel does not clear remarks, and keeps VOUCHER allocations.
 *   - A numeric checkoutError of 0 leaks a stray "0" text node into the footer.
 *   - Change Due shows for any positive value, even one that rounds to 0.00.
 */

// ── the verbatim pre-extraction region ──────────────────────────────────────────────────
function OriginalFooterMarkup({
  checkoutPaymentFields, checkoutError, canSettle, currentInvoice, checkoutLoading, effectiveDue,
  setShowPaymentDialog, setCheckoutError, cancelCheckoutTenders, processPayment,
}) {
  return (
    <>
      {/* FOOTER-START */}
              {/* ── Settlement footer ── */}
              <div className="bg-white border-t-2 border-[#F5C742]/30 px-3 sm:px-5 py-4 shrink-0">
                {/* Change due — the only figure the cashier still needs at this point
                    (total/paid/remaining already live in the allocation panel above). */}
                {checkoutPaymentFields.changeDue > 0 && (
                  <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Change Due</span>
                    <span className="text-lg font-black text-blue-700 tabular-nums">
                      <DirhamSymbol /> {checkoutPaymentFields.changeDue.toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Error display */}
                {checkoutError && (
                  <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {checkoutError}
                  </div>
                )}
                {/* Action buttons */}
                {(() => {
                  const settleReady = canSettle && currentInvoice.items.length > 0 && !checkoutLoading;
                  return (
                    <div className="flex items-stretch gap-3">
                      <button type="button" onClick={() => { setShowPaymentDialog(false); setCheckoutError(null); cancelCheckoutTenders(); }}
                        aria-label="Cancel checkout"
                        className="flex-none w-28 sm:w-36 min-h-[64px] rounded-xl border-2 border-gray-300 bg-white text-gray-600 font-bold text-base transition-all duration-200 ease-out hover:bg-gray-100 hover:border-gray-400 hover:text-gray-800 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300 motion-reduce:transform-none">
                        Cancel
                      </button>
                      <button type="button" onClick={() => processPayment()} disabled={!settleReady}
                        aria-label={`Settle payment of ${effectiveDue.toFixed(2)}`}
                        className={`flex-1 min-w-0 min-h-[64px] px-5 rounded-xl font-black flex items-center justify-center gap-3 transition-all duration-200 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F5C742]/60 motion-reduce:transform-none ${
                          settleReady
                            ? 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] shadow-lg shadow-[#F5C742]/30 hover:shadow-xl hover:shadow-[#F5C742]/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                        {checkoutLoading
                          ? <><div className="w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin shrink-0" /><span className="text-lg">Processing…</span></>
                          : <>
                              <CheckCircle className="h-6 w-6 shrink-0" />
                              <span className="text-base sm:text-lg truncate">Settle Payment</span>
                              {/* The amount sits in its own pill so it stays readable at a
                                  glance and never gets truncated with the label. */}
                              <span className={`shrink-0 rounded-lg px-3 py-1 text-lg sm:text-2xl tabular-nums ${settleReady ? 'bg-white/40' : 'bg-white/50'}`}>
                                <DirhamSymbol /> {effectiveDue.toFixed(2)}
                              </span>
                            </>
                        }
                      </button>
                    </div>
                  );
                })()}
              </div>
      {/* FOOTER-END */}
    </>
  );
}

// ── the extracted component through the POSSales call site ──────────────────────────────
/**
 * The POSSales call site (enforced byte-for-byte below). POSSales passes checkoutEffectiveDue,
 * which its payment branch also aliases as `effectiveDue`; the fixtures' `effectiveDue` is
 * mapped onto that name so both variants see the same value.
 */
function ExtractedCallSite({
  checkoutPaymentFields, checkoutError, canSettle, currentInvoice, checkoutLoading, effectiveDue: checkoutEffectiveDue,
  setShowPaymentDialog, setCheckoutError, cancelCheckoutTenders, processPayment,
}) {
  return (
    <>
      {/* CALL-START */}
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
      {/* CALL-END */}
    </>
  );
}

const VARIANTS = [
  ['original markup', OriginalFooterMarkup],
  ['extracted CheckoutPaymentFooter via POSSales call site', ExtractedCallSite],
];
const variant = { Markup: OriginalFooterMarkup };
/** Registers `body` once per variant; `variant.Markup` is what every render below uses. */
const describeBoth = (name, body) => describe.each(VARIANTS)(`%s — ${name}`, (_label, Markup) => {
  beforeEach(() => { variant.Markup = Markup; });
  body();
});

/** The POSSales canSettle derivation (verbatim between the CAN-SETTLE markers). */
function deriveCanSettle({ checkoutPayment, checkoutCompatibility }) {
  // CAN-SETTLE-START
        const canSettle = checkoutPayment.canSettle && checkoutCompatibility.canSettle;
  // CAN-SETTLE-END
  return canSettle;
}

// ── fixtures and helpers ────────────────────────────────────────────────────────────────
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

function makeProps(overrides = {}) {
  const { checkoutPayment = { canSettle: true }, checkoutCompatibility = { canSettle: true }, ...rest } = overrides;
  return {
    checkoutPaymentFields: { changeDue: 0 },
    checkoutError: null,
    canSettle: deriveCanSettle({ checkoutPayment, checkoutCompatibility }),
    currentInvoice: { items: items(2), total: 100 },
    checkoutLoading: false,
    effectiveDue: 100,
    setShowPaymentDialog: vi.fn(),
    setCheckoutError: vi.fn(),
    cancelCheckoutTenders: vi.fn(),
    processPayment: vi.fn(),
    ...rest,
  };
}

const renderFooter = (props) => {
  const view = render(<variant.Markup {...props} />);
  return { ...view, footer: () => view.container.firstElementChild };
};
const cls = (el) => el.getAttribute('class');
const attrs = (el) => Array.from(el.attributes).map((a) => [a.name, a.value]);
const actionRow = (footer) => footer.lastElementChild;
const cancelButton = () => screen.getByRole('button', { name: 'Cancel checkout' });
const settleButton = () => screen.getByRole('button', { name: /^Settle payment of / });

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
const symbolHtml = () => {
  const host = document.createElement('div');
  const view = render(<DirhamSymbol />, { container: host });
  const html = host.innerHTML;
  view.unmount();
  return html;
};

const FOOTER_CLASS = 'bg-white border-t-2 border-[#F5C742]/30 px-3 sm:px-5 py-4 shrink-0';
const CHANGE_DUE_CLASS = 'mb-3 flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl';
const ERROR_CLASS = 'mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2';
const ACTIONS_CLASS = 'flex items-stretch gap-3';
const CANCEL_CLASS = 'flex-none w-28 sm:w-36 min-h-[64px] rounded-xl border-2 border-gray-300 bg-white text-gray-600 font-bold text-base transition-all duration-200 ease-out hover:bg-gray-100 hover:border-gray-400 hover:text-gray-800 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300 motion-reduce:transform-none';
const SETTLE_BASE = 'flex-1 min-w-0 min-h-[64px] px-5 rounded-xl font-black flex items-center justify-center gap-3 transition-all duration-200 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F5C742]/60 motion-reduce:transform-none';
const SETTLE_READY = 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] shadow-lg shadow-[#F5C742]/30 hover:shadow-xl hover:shadow-[#F5C742]/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]';
const SETTLE_BLOCKED = 'bg-gray-200 text-gray-400 cursor-not-allowed';
const PILL = 'shrink-0 rounded-lg px-3 py-1 text-lg sm:text-2xl tabular-nums';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── 1. DOM structure ────────────────────────────────────────────────────────────────────
describeBoth('1. DOM structure', () => {
  it('a single <div> footer root with the exact class and no other attributes', () => {
    const { container, footer } = renderFooter(makeProps());
    expect(container.children).toHaveLength(1);
    expect(footer().tagName).toBe('DIV');
    expect(attrs(footer())).toEqual([['class', FOOTER_CLASS]]);
  });

  it.each([
    ['neither', {}, [ACTIONS_CLASS]],
    ['change due only', { checkoutPaymentFields: { changeDue: 3 } }, [CHANGE_DUE_CLASS, ACTIONS_CLASS]],
    ['error only', { checkoutError: 'Card declined' }, [ERROR_CLASS, ACTIONS_CLASS]],
    ['both', { checkoutPaymentFields: { changeDue: 3 }, checkoutError: 'Card declined' }, [CHANGE_DUE_CLASS, ERROR_CLASS, ACTIONS_CLASS]],
  ])('child order (%s): change due → error → action row, action row always last', (_label, overrides, order) => {
    const { footer } = renderFooter(makeProps(overrides));
    expect(Array.from(footer().children).map(cls)).toEqual(order);
    // no stray text nodes between sections
    expect(footer().childNodes).toHaveLength(order.length);
    expect(Array.from(footer().children).every((c) => c.tagName === 'DIV')).toBe(true);
  });

  it('action row: exactly [Cancel, Settle] buttons, no attributes but its class', () => {
    const { footer } = renderFooter(makeProps());
    const row = actionRow(footer());
    expect(attrs(row)).toEqual([['class', ACTIONS_CLASS]]);
    expect(Array.from(row.children).map((b) => [b.tagName, b.getAttribute('aria-label')])).toEqual([
      ['BUTTON', 'Cancel checkout'],
      ['BUTTON', 'Settle payment of 100.00'],
    ]);
    expect(footer().querySelectorAll('button, input, a, select, textarea')).toHaveLength(2);
  });

  it('Cancel: exact attribute list and order, text "Cancel", no icon, never disabled', () => {
    renderFooter(makeProps());
    const button = cancelButton();
    expect(attrs(button)).toEqual([
      ['type', 'button'],
      ['aria-label', 'Cancel checkout'],
      ['class', CANCEL_CLASS],
    ]);
    expect(button.childNodes).toHaveLength(1);
    expect(button.textContent).toBe('Cancel');
    expect(button.querySelector('svg')).toBeNull();
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('Settle (ready): exact attribute list, CheckCircle → label → amount pill', () => {
    renderFooter(makeProps({ effectiveDue: 42 }));
    const button = settleButton();
    expect(attrs(button)).toEqual([
      ['type', 'button'],
      ['aria-label', 'Settle payment of 42.00'],
      ['class', `${SETTLE_BASE} ${SETTLE_READY}`],
    ]);
    expect(Array.from(button.children).map((c) => c.tagName.toLowerCase())).toEqual(['svg', 'span', 'span']);
    expectIcon(button.children[0], CheckCircle, 'h-6 w-6 shrink-0');
    expect(attrs(button.children[1])).toEqual([['class', 'text-base sm:text-lg truncate']]);
    expect(button.children[1].textContent).toBe('Settle Payment');
    expect(attrs(button.children[2])).toEqual([['class', `${PILL} bg-white/40`]]);
    expect(button.children[2].innerHTML).toBe(`${symbolHtml()} 42.00`);
  });

  it('Settle (blocked): the disabled attribute is added between type and aria-label', () => {
    renderFooter(makeProps({ checkoutPayment: { canSettle: false }, effectiveDue: 42 }));
    expect(attrs(settleButton())).toEqual([
      ['type', 'button'],
      ['disabled', ''],
      ['aria-label', 'Settle payment of 42.00'],
      ['class', `${SETTLE_BASE} ${SETTLE_BLOCKED}`],
    ]);
  });

  it('Settle (loading): spinner <div> + "Processing…" span with exact attributes; no icon, label or pill', () => {
    renderFooter(makeProps({ checkoutLoading: true, effectiveDue: 42 }));
    const button = settleButton();
    expect(button.childNodes).toHaveLength(2);
    expect(attrs(button.children[0])).toEqual([['class', 'w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin shrink-0']]);
    expect(button.children[0].childNodes).toHaveLength(0);
    expect(attrs(button.children[1])).toEqual([['class', 'text-lg']]);
    expect(button.children[1].textContent).toBe('Processing…');
    expect(button.querySelector('svg')).toBeNull();
    expect(button.querySelector('[data-bb-currency-symbol]')).toBeNull();
    expect(button.textContent).not.toContain('42.00');
  });

  it('uses DirhamSymbol (not CurrencyAmount) for both figures, and only lucide AlertCircle / CheckCircle icons', () => {
    renderFooter(makeProps({ checkoutPaymentFields: { changeDue: 1 }, checkoutError: 'e' }));
    const svgs = Array.from(document.querySelectorAll('svg'));
    expect(svgs).toHaveLength(2);
    expectIcon(svgs[0], AlertCircle, 'h-4 w-4 shrink-0');
    expectIcon(svgs[1], CheckCircle, 'h-6 w-6 shrink-0');
    expect(document.querySelectorAll('[data-bb-currency-symbol]')).toHaveLength(2);
  });
});

// ── 2. change due ───────────────────────────────────────────────────────────────────────
describeBoth('2. Change Due — `changeDue > 0`', () => {
  it.each([
    [5, '5.00'],
    [0.5, '0.50'],
    [1234.5, '1234.50'],
    [1.005, '1.00'],
    [0.001, '0.00'],
  ])('changeDue %s → shown as "<symbol> %s"', (changeDue, text) => {
    const { footer } = renderFooter(makeProps({ checkoutPaymentFields: { changeDue } }));
    const row = footer().children[0];
    expect(attrs(row)).toEqual([['class', CHANGE_DUE_CLASS]]);
    expect(row.children).toHaveLength(2);
    expect(attrs(row.children[0])).toEqual([['class', 'text-xs font-bold uppercase tracking-wide text-blue-700']]);
    expect(row.children[0].textContent).toBe('Change Due');
    expect(attrs(row.children[1])).toEqual([['class', 'text-lg font-black text-blue-700 tabular-nums']]);
    expect(row.children[1].innerHTML).toBe(`${symbolHtml()} ${text}`);
  });

  it.each([0, -0, -3, -0.01, undefined, null, NaN])('changeDue %s → no row, no stray text', (changeDue) => {
    const { footer } = renderFooter(makeProps({ checkoutPaymentFields: { changeDue } }));
    expect(screen.queryByText('Change Due')).toBeNull();
    expect(footer().childNodes).toHaveLength(1);
  });

  it('does not number-format with separators and does not read effectiveDue', () => {
    renderFooter(makeProps({ checkoutPaymentFields: { changeDue: 10000 }, effectiveDue: 7 }));
    expect(screen.getByText('Change Due').nextElementSibling.textContent.trim()).toBe('10000.00');
  });

  it('change due does not affect Settle readiness', () => {
    renderFooter(makeProps({ checkoutPaymentFields: { changeDue: 9 } }));
    expect(settleButton().disabled).toBe(false);
  });
});

// ── 3. error banner ─────────────────────────────────────────────────────────────────────
describeBoth('3. error banner — `checkoutError && …`', () => {
  it('exact markup: AlertCircle svg then the raw message text, placed directly before the action row', () => {
    const { footer } = renderFooter(makeProps({ checkoutError: 'Payment does not reconcile and was not taken. x' }));
    const banner = footer().children[0];
    expect(attrs(banner)).toEqual([['class', ERROR_CLASS]]);
    expect(banner.childNodes).toHaveLength(2);
    expectIcon(banner.childNodes[0], AlertCircle, 'h-4 w-4 shrink-0');
    expect(banner.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
    expect(banner.childNodes[1].textContent).toBe('Payment does not reconcile and was not taken. x');
    expect(banner.nextElementSibling).toBe(actionRow(footer()));
  });

  it('the message is rendered as text, not HTML, with no prefix or trimming', () => {
    renderFooter(makeProps({ checkoutError: '  <b>bold</b>  ' }));
    expect(document.querySelector('b')).toBeNull();
    const banner = document.querySelector(`.bg-red-50`);
    expect(banner.childNodes[1].textContent).toBe('  <b>bold</b>  ');
  });

  it.each([null, undefined, '', false])('checkoutError %s → no banner and no stray text', (checkoutError) => {
    const { footer } = renderFooter(makeProps({ checkoutError }));
    expect(footer().querySelector('.bg-red-50')).toBeNull();
    expect(footer().childNodes).toHaveLength(1);
  });

  it('KNOWN EDGE: checkoutError === 0 renders no banner but leaks a stray "0" text node before the action row', () => {
    const { footer } = renderFooter(makeProps({ checkoutError: 0 }));
    expect(footer().querySelector('.bg-red-50')).toBeNull();
    expect(footer().childNodes).toHaveLength(2);
    expect(footer().childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(footer().childNodes[0].textContent).toBe('0');
  });

  it('an error does not disable Settle or Cancel', () => {
    renderFooter(makeProps({ checkoutError: 'Card declined' }));
    expect(settleButton().disabled).toBe(false);
    expect(cancelButton().disabled).toBe(false);
  });
});

// ── harness ─────────────────────────────────────────────────────────────────────────────
const LINES = [
  { id: 'l-cash', paymentType: PAYMENT_TYPES.CASH, amount: 40 },
  { id: 'l-voucher', paymentType: PAYMENT_TYPES.VOUCHER, amount: 25, reference: 'CV-1' },
  { id: 'l-card', paymentType: PAYMENT_TYPES.CARD, amount: 35 },
];

/**
 * Stateful harness: the header X (real CheckoutPaymentHeader behind the POSSales arrow) and the
 * current footer variant, over state shaped like POSSales/useCheckout. Every setter logs its full
 * argument list so an accidentally forwarded click event would show up.
 */
function FooterHarness({ log, initial = {}, processPayment = vi.fn() }) {
  const [showPaymentDialog, rawShowPaymentDialog] = useState(true);
  const [checkoutError, rawCheckoutError] = useState(initial.checkoutError ?? null);
  const [checkoutRemarks] = useState(initial.checkoutRemarks ?? '');
  const [paymentLines, setPaymentLines] = useState(initial.paymentLines ?? LINES);
  const [checkoutLoading] = useState(initial.checkoutLoading ?? false);

  const setShowPaymentDialog = (...args) => { log.push(['setShowPaymentDialog', ...args]); rawShowPaymentDialog(...args); };
  const setCheckoutError = (...args) => { log.push(['setCheckoutError', ...args]); rawCheckoutError(...args); };
  const removeCheckoutLine = useCallback((id) => {
    log.push(['removeCheckoutLine', id]);
    setPaymentLines((lines) => lines.filter((l) => l.id !== id));
  }, [log]);
  const checkoutPaymentLinesRef = useRef(paymentLines);
  checkoutPaymentLinesRef.current = paymentLines;

  // CANCEL-START
  const cancelCheckoutTenders = useCallback(() => {
    (checkoutPaymentLinesRef.current || []).forEach((l) => {
      if (l.paymentType !== PAYMENT_TYPES.VOUCHER) removeCheckoutLine(l.id);
    });
  }, [removeCheckoutLine]);
  // CANCEL-END
  const loggedCancelCheckoutTenders = (...args) => { log.push(['cancelCheckoutTenders', ...args]); cancelCheckoutTenders(...args); };

  return (
    <>
      <output data-testid="state">{JSON.stringify({
        showPaymentDialog, checkoutError, checkoutRemarks, checkoutLoading, lineIds: paymentLines.map((l) => l.id),
      })}</output>
      <button type="button" data-testid="reopen" onClick={() => rawShowPaymentDialog(true)}>reopen</button>
      {showPaymentDialog && (
        <div data-testid="dialog">
          <CheckoutPaymentHeader
            itemCount={2}
            invoiceNo="SI-POS-000124"
            depositAmt={0}
            effectiveDue={100}
            grandTotal={100}
            onClose={() => setShowPaymentDialog(false)}
          />
          <variant.Markup
            checkoutPaymentFields={{ changeDue: 0 }}
            checkoutError={checkoutError}
            canSettle
            currentInvoice={{ items: items(2), total: 100 }}
            checkoutLoading={checkoutLoading}
            effectiveDue={100}
            setShowPaymentDialog={setShowPaymentDialog}
            setCheckoutError={setCheckoutError}
            cancelCheckoutTenders={loggedCancelCheckoutTenders}
            processPayment={processPayment}
          />
        </div>
      )}
    </>
  );
}

const renderHarness = (initial, processPayment) => {
  const log = [];
  render(<FooterHarness log={log} initial={initial} processPayment={processPayment} />);
  return { log };
};
const state = () => JSON.parse(screen.getByTestId('state').textContent);
const xButton = () => screen.getByTestId('dialog').firstElementChild.querySelector('button');

// ── 4. Cancel ───────────────────────────────────────────────────────────────────────────
describeBoth('4. Cancel — `setShowPaymentDialog(false); setCheckoutError(null); cancelCheckoutTenders();`', () => {
  it('exact sequence; no argument (click event included) reaches any of the three calls', () => {
    const { log } = renderHarness({ checkoutError: 'Card declined' });
    fireEvent.click(cancelButton());
    expect(log).toEqual([
      ['setShowPaymentDialog', false],
      ['setCheckoutError', null],
      ['cancelCheckoutTenders'],
      ['removeCheckoutLine', 'l-cash'],
      ['removeCheckoutLine', 'l-card'],
    ]);
  });

  it('with mocks: each callee is called once with exactly its literal argument list', () => {
    const props = makeProps({ checkoutError: 'x' });
    renderFooter(props);
    fireEvent.click(cancelButton());
    expect(props.setShowPaymentDialog.mock.calls).toEqual([[false]]);
    expect(props.setCheckoutError.mock.calls).toEqual([[null]]);
    expect(props.cancelCheckoutTenders.mock.calls).toEqual([[]]);
    expect(props.processPayment).not.toHaveBeenCalled();
  });

  it('closes, clears the error, drops non-voucher tenders — but keeps remarks and the VOUCHER line', () => {
    renderHarness({ checkoutError: 'Card declined', checkoutRemarks: 'gift wrap' });
    fireEvent.click(cancelButton());
    expect(state()).toEqual({
      showPaymentDialog: false,
      checkoutError: null,
      checkoutRemarks: 'gift wrap',
      checkoutLoading: false,
      lineIds: ['l-voucher'],
    });
    fireEvent.click(screen.getByTestId('reopen'));
    expect(screen.queryByText('Card declined')).toBeNull();
  });

  it('with no tenders, cancelCheckoutTenders still runs and removes nothing', () => {
    const { log } = renderHarness({ paymentLines: [] });
    fireEvent.click(cancelButton());
    expect(log).toEqual([['setShowPaymentDialog', false], ['setCheckoutError', null], ['cancelCheckoutTenders']]);
  });

  it('is enabled across every settleReady combination (it has no disabled binding)', () => {
    for (const canSettle of [true, false]) {
      for (const n of [0, 2]) {
        for (const checkoutLoading of [false, true]) {
          renderFooter(makeProps({ canSettle, currentInvoice: { items: items(n) }, checkoutLoading }));
          expect(cancelButton().disabled).toBe(false);
          cleanup();
        }
      }
    }
  });
});

// ── 5. Settle ───────────────────────────────────────────────────────────────────────────
describeBoth('5. Settle — `() => processPayment()`', () => {
  it('the callback receives zero arguments (arguments.length === 0), so no event and no override credentials', () => {
    const seen = [];
    const processPayment = function processPaymentProbe() { seen.push(arguments.length); };
    renderFooter(makeProps({ processPayment }));
    fireEvent.click(settleButton());
    expect(seen).toEqual([0]);
  });

  it('against the real useCheckout signature `async (overrideCreds = null)`, overrideCreds is null', async () => {
    const received = [];
    const processPayment = async (overrideCreds = null) => { received.push(overrideCreds); };
    renderFooter(makeProps({ processPayment }));
    fireEvent.click(settleButton());
    expect(received).toEqual([null]);
  });

  it('its return value (a promise) is discarded — a rejection does not throw out of the click', () => {
    const processPayment = vi.fn(() => Promise.resolve('ignored'));
    renderFooter(makeProps({ processPayment }));
    expect(() => fireEvent.click(settleButton())).not.toThrow();
    expect(processPayment.mock.calls).toEqual([[]]);
  });

  it('touches no footer setter and does not change the footer by itself', () => {
    const props = makeProps();
    const { footer } = renderFooter(props);
    const before = footer().innerHTML;
    fireEvent.click(settleButton());
    for (const setter of ['setShowPaymentDialog', 'setCheckoutError', 'cancelCheckoutTenders']) {
      expect(props[setter], setter).not.toHaveBeenCalled();
    }
    expect(footer().innerHTML).toBe(before);
  });

  it('each click calls it again — the footer has no own double-click guard (the guard is checkoutLoading)', () => {
    const props = makeProps();
    renderFooter(props);
    fireEvent.click(settleButton());
    fireEvent.click(settleButton());
    expect(props.processPayment.mock.calls).toEqual([[], []]);
  });

  describe('16-row truth table through the verbatim canSettle derivation', () => {
    const combos = [];
    for (const paymentCan of [true, false]) {
      for (const compatCan of [true, false]) {
        for (const itemCount of [1, 0]) {
          for (const loading of [false, true]) {
            combos.push([paymentCan, compatCan, itemCount, loading, paymentCan && compatCan && itemCount > 0 && !loading]);
          }
        }
      }
    }

    it('has exactly 16 rows and exactly one enabled row', () => {
      expect(combos).toHaveLength(16);
      expect(combos.filter((c) => c[4])).toHaveLength(1);
    });

    it.each(combos)('payment=%s compat=%s items=%s loading=%s → enabled=%s (click, pill, content)', (paymentCan, compatCan, itemCount, loading, enabled) => {
      const props = makeProps({
        checkoutPayment: { canSettle: paymentCan },
        checkoutCompatibility: { canSettle: compatCan },
        currentInvoice: { items: items(itemCount) },
        checkoutLoading: loading,
        effectiveDue: 12.5,
      });
      renderFooter(props);
      const button = settleButton();
      expect(button.disabled).toBe(!enabled);
      expect(cls(button)).toBe(`${SETTLE_BASE} ${enabled ? SETTLE_READY : SETTLE_BLOCKED}`);
      expect(button.getAttribute('aria-label')).toBe('Settle payment of 12.50');
      fireEvent.click(button);
      expect(props.processPayment).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (loading) {
        expect(screen.getByText('Processing…')).toBeInTheDocument();
        expect(button.children).toHaveLength(2);
      } else {
        expect(cls(button.children[2])).toBe(`${PILL} ${enabled ? 'bg-white/40' : 'bg-white/50'}`);
      }
    });
  });

  it.each([
    ['1', 1, true],
    ['"yes"', 'yes', true],
    ['0', 0, false],
    ['""', '', false],
    ['undefined', undefined, false],
    ['null', null, false],
  ])('loose checkoutLoading %s: loading content iff truthy; enabled iff falsy', (_label, checkoutLoading, isLoading) => {
    renderFooter(makeProps({ checkoutLoading }));
    const button = settleButton();
    expect(button.disabled).toBe(isLoading);
    expect(!!screen.queryByText('Processing…')).toBe(isLoading);
    expect(!!screen.queryByText('Settle Payment')).toBe(!isLoading);
  });

  it.each([
    ['null payment canSettle', { checkoutPayment: { canSettle: null } }, false],
    ['0 compat canSettle', { checkoutCompatibility: { canSettle: 0 } }, false],
    ['object canSettle values', { checkoutPayment: { canSettle: {} }, checkoutCompatibility: { canSettle: [] } }, true],
  ])('loose canSettle (not in CheckoutScreen): %s', (_label, overrides, enabled) => {
    renderFooter(makeProps(overrides));
    expect(settleButton().disabled).toBe(!enabled);
  });

  it('the canSettle derivation returns the second operand as-is (&&), not a boolean', () => {
    expect(deriveCanSettle({ checkoutPayment: { canSettle: 'a' }, checkoutCompatibility: { canSettle: 'b' } })).toBe('b');
    expect(deriveCanSettle({ checkoutPayment: { canSettle: 0 }, checkoutCompatibility: { canSettle: true } })).toBe(0);
  });

  it('aria-label keeps the amount while loading even though the pill disappears', () => {
    const view = renderFooter(makeProps({ effectiveDue: 87.5 }));
    expect(settleButton().textContent).toContain('87.50');
    view.rerender(<variant.Markup {...makeProps({ effectiveDue: 87.5, checkoutLoading: true })} />);
    const button = settleButton();
    expect(button.getAttribute('aria-label')).toBe('Settle payment of 87.50');
    expect(button.textContent).toBe('Processing…');
  });

  it('loading → idle swaps content in place on the same <button> node', () => {
    const view = renderFooter(makeProps({ checkoutLoading: true }));
    const before = settleButton();
    view.rerender(<variant.Markup {...makeProps()} />);
    expect(settleButton()).toBe(before);
    expect(settleButton().textContent).toContain('Settle Payment');
  });

  it('effectiveDue must be a number — the footer calls .toFixed on it unguarded', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderFooter(makeProps({ effectiveDue: undefined }))).toThrow(TypeError);
  });
});

// ── 6. loading edge cases ───────────────────────────────────────────────────────────────
describeBoth('6. Cancel / X while checkoutLoading is true (current gap — pinned, not fixed)', () => {
  it('C. both are enabled while Settle shows Processing… and is disabled', () => {
    renderHarness({ checkoutLoading: true });
    expect(settleButton().disabled).toBe(true);
    expect(screen.getByText('Processing…')).toBeInTheDocument();
    expect(cancelButton().disabled).toBe(false);
    expect(xButton().disabled).toBe(false);
    expect(xButton().hasAttribute('disabled')).toBe(false);
  });

  it('A. Cancel mid-settle runs the full sequence: closes, clears error, drops non-voucher tenders; checkoutLoading untouched; processPayment not called', () => {
    const processPayment = vi.fn();
    const { log } = renderHarness({ checkoutLoading: true, checkoutError: 'stale', checkoutRemarks: 'note' }, processPayment);
    fireEvent.click(cancelButton());
    expect(log).toEqual([
      ['setShowPaymentDialog', false],
      ['setCheckoutError', null],
      ['cancelCheckoutTenders'],
      ['removeCheckoutLine', 'l-cash'],
      ['removeCheckoutLine', 'l-card'],
    ]);
    expect(state()).toEqual({ showPaymentDialog: false, checkoutError: null, checkoutRemarks: 'note', checkoutLoading: true, lineIds: ['l-voucher'] });
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('B. X mid-settle only closes: error, all tenders and checkoutLoading kept; processPayment not called', () => {
    const processPayment = vi.fn();
    const { log } = renderHarness({ checkoutLoading: true, checkoutError: 'stale', checkoutRemarks: 'note' }, processPayment);
    fireEvent.click(xButton());
    expect(log).toEqual([['setShowPaymentDialog', false]]);
    expect(state()).toEqual({ showPaymentDialog: false, checkoutError: 'stale', checkoutRemarks: 'note', checkoutLoading: true, lineIds: ['l-cash', 'l-voucher', 'l-card'] });
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('D. reopening after each shows the difference: X → error + Processing… still shown; Cancel → no error, still Processing…', () => {
    renderHarness({ checkoutLoading: true, checkoutError: 'stale' });
    fireEvent.click(xButton());
    fireEvent.click(screen.getByTestId('reopen'));
    expect(screen.getByText('stale')).toBeInTheDocument();
    expect(screen.getByText('Processing…')).toBeInTheDocument();
    cleanup();

    renderHarness({ checkoutLoading: true, checkoutError: 'stale' });
    fireEvent.click(cancelButton());
    fireEvent.click(screen.getByTestId('reopen'));
    expect(screen.queryByText('stale')).toBeNull();
    expect(screen.getByText('Processing…')).toBeInTheDocument();
    expect(state().lineIds).toEqual(['l-voucher']);
  });

  it('the same split holds when not loading (baseline for comparison)', () => {
    renderHarness({ checkoutError: 'stale' });
    fireEvent.click(xButton());
    expect(state()).toMatchObject({ showPaymentDialog: false, checkoutError: 'stale', lineIds: ['l-cash', 'l-voucher', 'l-card'] });
    cleanup();
    renderHarness({ checkoutError: 'stale' });
    fireEvent.click(cancelButton());
    expect(state()).toMatchObject({ showPaymentDialog: false, checkoutError: null, lineIds: ['l-voucher'] });
  });
});

// ── 7. parity and component contract ────────────────────────────────────────────────────
describe('7. DOM parity and component contract', () => {
  const PARITY_CASES = [
    ['default', {}],
    ['change due + error', { checkoutPaymentFields: { changeDue: 12.345 }, checkoutError: 'Card declined' }],
    ['blocked', { checkoutPayment: { canSettle: false } }],
    ['no items', { currentInvoice: { items: [] } }],
    ['loading', { checkoutLoading: true }],
    ['stray zero error', { checkoutError: 0 }],
    ['raw canSettle operand', { checkoutPayment: { canSettle: 'a' }, checkoutCompatibility: { canSettle: 'b' } }],
  ];

  it.each(PARITY_CASES)('POSSales-shaped call site renders HTML identical to the pre-extraction markup: %s', (_label, overrides) => {
    const original = render(<OriginalFooterMarkup {...makeProps(overrides)} />).container.innerHTML;
    cleanup();
    const { container } = render(<ExtractedCallSite {...makeProps(overrides)} />);
    expect(container.innerHTML).toBe(original);
  });

  it('the component hands the click straight to onSettle and onCancel (the parent arrows discard the event)', () => {
    const onSettle = vi.fn();
    const onCancel = vi.fn();
    render(<CheckoutPaymentFooter changeDue={0} checkoutError={null} canSettle itemCount={1} checkoutLoading={false} effectiveDue={5} onCancel={onCancel} onSettle={onSettle} />);
    fireEvent.click(settleButton());
    fireEvent.click(cancelButton());
    expect(onSettle.mock.calls).toHaveLength(1);
    expect(onSettle.mock.calls[0][0]).toHaveProperty('type', 'click');
    expect(onCancel.mock.calls).toHaveLength(1);
    expect(onCancel.mock.calls[0][0]).toHaveProperty('type', 'click');
  });

  it('renders the passed values as-is: itemCount is compared, never recomputed; canSettle is not normalised', () => {
    render(<CheckoutPaymentFooter changeDue={3} checkoutError="E" canSettle="yes" itemCount={7} checkoutLoading={0} effectiveDue={9} onCancel={vi.fn()} onSettle={vi.fn()} />);
    expect(settleButton().disabled).toBe(false);
    expect(settleButton().getAttribute('aria-label')).toBe('Settle payment of 9.00');
    expect(screen.getByText('Change Due').nextElementSibling.textContent.trim()).toBe('3.00');
    cleanup();
    render(<CheckoutPaymentFooter changeDue={0} checkoutError={null} canSettle itemCount={0} checkoutLoading={false} effectiveDue={9} onCancel={vi.fn()} onSettle={vi.fn()} />);
    expect(settleButton().disabled).toBe(true);
  });

  it('a disabled Settle does not reach onSettle', () => {
    const onSettle = vi.fn();
    render(<CheckoutPaymentFooter changeDue={0} checkoutError={null} canSettle={false} itemCount={1} checkoutLoading={false} effectiveDue={1} onCancel={vi.fn()} onSettle={onSettle} />);
    fireEvent.click(settleButton());
    expect(onSettle).not.toHaveBeenCalled();
  });
});

// ── source ──────────────────────────────────────────────────────────────────────────────
/**
 * POSSales.jsx is not rendered by this project's test setup, so the copies, the callback shapes
 * and the extraction boundary are asserted against source.
 */
// EOL-normalised: sources are checked out with CRLF on Windows.
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const USE_CHECKOUT = readSource('../features/checkout/useCheckout.js');
const COMPONENT = readSource('../features/checkout/CheckoutPaymentFooter.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};
const count = (src, needle) => src.split(needle).length - 1;
const FOOTER = () => between(SELF, '{/* FOOTER-START */}\n', '\n      {/* FOOTER-END */}');
const CALL = () => between(SELF, '{/* CALL-START */}\n', '\n      {/* CALL-END */}');
const FOOTER_COMMENT = '              {/* ── Settlement footer ── */}\n';
const CANCEL_ARROW = [
  '                onCancel={() => {',
  '                  setShowPaymentDialog(false);',
  '                  setCheckoutError(null);',
  '                  cancelCheckoutTenders();',
  '                }}',
].join('\n');
const OLD_CANCEL_HANDLER = 'onClick={() => { setShowPaymentDialog(false); setCheckoutError(null); cancelCheckoutTenders(); }}';
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('source — CheckoutPaymentFooter', () => {
  it('its return body is the verbatim footer except the changeDue / itemCount / onCancel / onSettle substitutions (51 lines)', () => {
    expect(FOOTER().split('\n')).toHaveLength(52);
    const body = FOOTER().slice(FOOTER_COMMENT.length);
    expect(body.split('\n')).toHaveLength(51);
    const substituted = body
      .replaceAll('checkoutPaymentFields.changeDue', 'changeDue')
      .replace('currentInvoice.items.length > 0', 'itemCount > 0')
      .replace(OLD_CANCEL_HANDLER, 'onClick={onCancel}')
      .replace('onClick={() => processPayment()}', 'onClick={onSettle}');
    for (const gone of ['checkoutPaymentFields', 'currentInvoice', 'setShowPaymentDialog', 'setCheckoutError', 'cancelCheckoutTenders', 'processPayment']) {
      expect(substituted, gone).not.toContain(gone);
    }
    expect(count(COMPONENT, `  return (\n${substituted}\n  );\n}`)).toBe(1);
  });

  it('props are exactly the 8: changeDue, checkoutError, canSettle, itemCount, checkoutLoading, effectiveDue, onCancel, onSettle', () => {
    expect(COMPONENT).toContain('function CheckoutPaymentFooter({\n  changeDue,\n  checkoutError,\n  canSettle,\n  itemCount,\n  checkoutLoading,\n  effectiveDue,\n  onCancel,\n  onSettle,\n}) {');
    expect(COMPONENT.match(/function CheckoutPaymentFooter\(\{([^}]*)\}\)/)[1].split(',').map((s) => s.trim()).filter(Boolean)).toHaveLength(8);
    expect(count(COMPONENT, 'export default CheckoutPaymentFooter;')).toBe(1);
  });

  it('buttons bind onClick={onCancel} and onClick={onSettle} directly — no wrapper', () => {
    const c = code(COMPONENT);
    expect(count(c, 'onClick={onCancel}')).toBe(1);
    expect(count(c, 'onClick={onSettle}')).toBe(1);
    expect(count(c, 'onClick=')).toBe(2);
    expect(c).not.toMatch(/onSettle\(|onCancel\(|=>\s*onSettle|=>\s*onCancel/);
  });

  it('keeps settleReady and its inline wrapper, unnormalised', () => {
    const c = code(COMPONENT);
    expect(count(c, '                {(() => {\n                  const settleReady = canSettle && itemCount > 0 && !checkoutLoading;\n')).toBe(1);
    expect(c.match(/\bsettleReady\b/g)).toHaveLength(4);
    expect(c).not.toMatch(/Boolean\(|!!/);
  });

  it('has no checkout business logic, hooks, state, context, memo, effects, async or API calls', () => {
    const c = code(COMPONENT);
    expect(c).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(c).not.toMatch(/\bmemo\b|createContext|useContext|forwardRef/);
    expect(c).not.toMatch(/\basync\b|\bawait\b|fetch\(|axios|\/api\/|setTimeout|setInterval/);
    for (const absent of [
      'processPayment', 'cancelCheckoutTenders', 'setShowPaymentDialog', 'setCheckoutError', 'checkoutPaymentFields',
      'currentInvoice', 'checkoutCompatibility', 'checkoutPayment', 'checkoutEffectiveDue', 'PAYMENT_TYPES',
      'paymentLines', 'checkoutRemarks', 'CurrencyAmount', 'X,',
    ]) {
      expect(c, absent).not.toContain(absent);
    }
    expect(c).toContain("import { AlertCircle, CheckCircle } from 'lucide-react';");
    expect(c).toContain("import { DirhamSymbol } from '../../POSCurrency';");
  });

  it('CAN-SETTLE and CANCEL harness blocks are identical to POSSales', () => {
    expect(count(POS_SALES, `${between(SELF, '// CAN-SETTLE-START\n', '\n  // CAN-SETTLE-END')}\n`)).toBe(1);
    const cancel = between(SELF, '// CANCEL-START\n', '\n  // CANCEL-END');
    expect(count(POS_SALES, `${cancel}\n`)).toBe(1);
    expect(cancel.split('\n')).toHaveLength(5);
  });
});

describe('source — POSSales wiring (CheckoutPaymentFooter boundary)', () => {
  it('imports it once and renders it exactly once; the CALL block in this file is the POSSales call site, byte for byte', () => {
    expect(count(POS_SALES, "import CheckoutPaymentFooter from './POS/features/checkout/CheckoutPaymentFooter';\n")).toBe(1);
    expect(POS_SALES.match(/<CheckoutPaymentFooter\b/g)).toHaveLength(1);
    expect(CALL().split('\n')).toHaveLength(15);
    expect(count(POS_SALES, `${CALL()}\n`)).toBe(1);
  });

  it('passes changeDue / itemCount / effectiveDue from the parent values', () => {
    const call = CALL();
    expect(call).toContain('                changeDue={checkoutPaymentFields.changeDue}\n');
    expect(call).toContain('                itemCount={currentInvoice.items.length}\n');
    expect(call).toContain('                effectiveDue={checkoutEffectiveDue}\n');
    expect(call).toContain('                canSettle={canSettle}\n');
    expect(call).toContain('                checkoutError={checkoutError}\n');
    expect(call).toContain('                checkoutLoading={checkoutLoading}\n');
    // POSSales' own effectiveDue alias is the same value the header and summary receive
    expect(count(POS_SALES, '        const effectiveDue = checkoutEffectiveDue;\n')).toBe(1);
  });

  it('Settle: onSettle={() => processPayment()} — never by reference, never an onClick in POSSales', () => {
    expect(count(POS_SALES, 'onSettle={() => processPayment()}')).toBe(1);
    expect(CALL()).toContain('                onSettle={() => processPayment()}\n              />');
    expect(POS_SALES).not.toMatch(/onSettle=\{processPayment\}/);
    expect(POS_SALES).not.toMatch(/onClick=\{processPayment\}/);
    expect(count(POS_SALES, 'onClick={() => processPayment()}')).toBe(0);
  });

  it('Cancel: the exact three-call arrow is passed as onCancel; the old inline handler is gone', () => {
    expect(count(POS_SALES, CANCEL_ARROW)).toBe(1);
    expect(CALL()).toContain(CANCEL_ARROW);
    expect(count(POS_SALES, OLD_CANCEL_HANDLER)).toBe(0);
  });

  it('no longer contains the moved markup', () => {
    for (const moved of [
      '<div className="bg-white border-t-2 border-[#F5C742]/30 px-3 sm:px-5 py-4 shrink-0">',
      'const settleReady = canSettle && currentInvoice.items.length > 0 && !checkoutLoading;',
      '{checkoutPaymentFields.changeDue.toFixed(2)}',
      'aria-label="Cancel checkout"',
      '<span className="text-lg">Processing…</span>',
    ]) {
      expect(POS_SALES, moved).not.toContain(moved);
    }
  });

  it('sits where the footer was: after the remarks card and scroll body, last child of the right column, before the payment root closes', () => {
    expect(POS_SALES).toContain([
      '                  {/* ── Remarks ── */}',
      '                  <CheckoutRemarks',
    ].join('\n'));
    const remarks = POS_SALES.indexOf('                  {/* ── Remarks ── */}\n');
    const call = POS_SALES.indexOf(CALL());
    expect(call).toBeGreaterThan(remarks);
    expect(POS_SALES).toContain([
      '                </div>',
      '              </div>',
      '',
      CALL(),
      '',
      '            </div>',
      '          </div>',
      '        );',
      '      })()}',
      '',
      '      {/* Supervisor PIN Dialog */}',
    ].join('\n'));
  });

  it('the canSettle derivation sits before the payment root, which precedes the call', () => {
    const derivation = POS_SALES.indexOf('        const canSettle = checkoutPayment.canSettle && checkoutCompatibility.canSettle;\n');
    const root = POS_SALES.indexOf('<div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">', derivation);
    expect(derivation).toBeGreaterThan(0);
    expect(root).toBeGreaterThan(derivation);
    expect(POS_SALES.indexOf(CALL())).toBeGreaterThan(root);
  });

  it('ownership: cancelCheckoutTenders is a POSSales useCallback; processPayment is useCheckout\'s, destructured into POSSales; X stays in CheckoutPaymentHeader', () => {
    expect(count(POS_SALES, '  const cancelCheckoutTenders = useCallback(() => {')).toBe(1);
    expect(count(USE_CHECKOUT, '  const processPayment = async (overrideCreds = null) => {')).toBe(1);
    expect(USE_CHECKOUT).toContain('supervisorOverridePin: overrideCreds?.pin || undefined,');
    expect(POS_SALES).toContain('    processPayment,\n  } = useCheckout({');
    expect(POS_SALES).not.toMatch(/const processPayment\s*=/);
    expect(count(POS_SALES, '                onClose={() => setShowPaymentDialog(false)}\n')).toBe(1);
    expect(COMPONENT).not.toContain('onClose');
  });
});

describe('source — existing suites that anchor on the footer (inventory, read-only)', () => {
  it('CheckoutScreen suite carries the footer call-site anchors', () => {
    const suite = readSource('./CheckoutScreen.characterization.test.jsx');
    expect(suite).toContain("expect(count(r, 'onSettle={() => processPayment()}')).toBe(1);");
    expect(suite).toContain("expect(count(r, 'onClick={processPayment}')).toBe(0);");
    expect(suite).toContain("expect(count(r, '<CheckoutPaymentFooter')).toBe(1);");
    expect(suite).toContain("it('footer: change due, error, then the action row — each present only when its condition holds'");
  });

  it('CheckoutPaymentHeader suite still pins both footer handlers in POSSales', () => {
    const suite = readSource('./CheckoutPaymentHeader.characterization.test.jsx');
    expect(suite).toContain("expect(count(POS_SALES, 'onSettle={() => processPayment()}')).toBe(1);");
    expect(suite).toContain("      '                  cancelCheckoutTenders();',");
  });
});
