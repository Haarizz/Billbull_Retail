import React, { useCallback, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import POSTouchScreen from '../POSTouchScreen';
import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import CashPaymentModal from '../payments/modals/CashPaymentModal';
import { PosOverlayProvider } from '../input/PosOverlayContext';
import { HOTKEY_SETTLE_MS, usePosInputController } from '../input/usePosInputController';
import { POS_OVERLAY_IDS } from '../input/posScope';

/**
 * P2.5 — a payment modal is scanner-safe.
 *
 * P1/P2 kept a scanner burst out of the cart while a payment modal is open, but the modal keys
 * the amount itself from the dialog (digits, C to clear, Enter to confirm), so the burst became
 * the Cash amount and its Enter confirmed it. Here the real controller, checkout panel and
 * payment modals run as POSSales mounts them; only the clock is the test's.
 *
 * SCAN is a wedge scanner's inter-key gap, TYPE a person's.
 */

vi.setConfig({ testTimeout: 30_000 });

const SCAN = 5;
const TYPE = 180;

const CART = {
  items: [{ id: 'p1', name: 'Widget', code: 'W1', price: 10, quantity: 1, discount: 0, taxRate: 5, total: 10, unit: 'Pcs' }],
  subtotal: 10, totalDiscount: 0, tax: 0.5, total: 10.5, billDiscountAmount: 0,
};

const makePayment = (overrides = {}) => ({
  paymentLines: [], invoiceTotal: 100, remainingBalance: 100, changeAmount: 0,
  totalAllocated: 0, totalCredit: 0, paymentSummary: null, lineErrors: {},
  isOverAllocated: false, canSettle: false,
  addLine: vi.fn(), updateLine: vi.fn(), removeLine: vi.fn(),
  ...overrides,
});

/** The Cart Focus template with a wedge scanner, wired like POSSales. */
const CartFocus = ({ scan }) => {
  const [barcodeInput, setBarcodeInputState] = useState('');
  const barcodeInputRef = useRef(null);
  const setBarcodeInput = useCallback((v) => setBarcodeInputState(v), []);
  return (
    <POSTouchScreen
      currentInvoice={CART}
      posProducts={[]} filteredProducts={[]} productCategories={[]} horizontalCategories={[]}
      customerOptions={[]} filteredCustomerOptions={[]} heldSales={[]}
      selectedCustomerData={{ id: 'c1', name: 'Walk-in Customer' }}
      formatCurrency={(n) => `AED ${Number(n || 0).toFixed(2)}`}
      posTemplate="focus"
      scannerConfig={{ enabled: true, status: 'ACTIVE', inputMode: 'KEYBOARD_WEDGE', autoFocusOnPOS: false }}
      barcodeInput={barcodeInput}
      setBarcodeInput={setBarcodeInput}
      barcodeInputRef={barcodeInputRef}
      barcodeSuggestions={[]}
      setBarcodeSuggestions={() => {}}
      handleBarcodeScan={scan}
      handleUnifiedEntry={scan}
      posActionMode="none"
      setPosActionMode={() => {}}
      selectedFocusItemId={null}
      setSelectedFocusItemId={() => {}}
      updateItemPrice={vi.fn()} updateQuantity={vi.fn()} updateDiscount={vi.fn()} resetFocusMode={vi.fn()}
      discountInputType="percent"
      setDiscountInputType={() => {}}
      showFeedback={vi.fn()}
      handleCheckout={() => true}
    />
  );
};

/** POSSales with the checkout overlay open: the sale behind, the payment panel on top. */
const Till = ({ payment, scan, enabled = true }) => {
  const registry = usePosInputController({ overlays: { [POS_OVERLAY_IDS.CHECKOUT]: true }, enabled, focusEnabled: false });
  return (
    <PosOverlayProvider registry={registry}>
      <CartFocus scan={scan} />
      <div className="fixed inset-0" data-testid="checkout">
        <PaymentAllocationPanel payment={payment} />
      </div>
    </PosOverlayProvider>
  );
};

const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const press = (target, key, gap = 0) => {
  if (gap) advance(gap);
  return fireEvent.keyDown(target, { key });
};
const pressAll = (target, text, gap) => { for (const ch of text) press(target, ch, gap); };
/** A wedge scanner: the characters at scanner speed, then Enter. */
const scanInto = (target, code, gap = SCAN) => {
  pressAll(target, code, gap);
  return press(target, 'Enter', gap);
};
/** Lets any settle window run out. */
const settle = () => advance(HOTKEY_SETTLE_MS + 5);
const dialogs = (title) => screen.queryAllByRole('dialog', { name: title });
/** The amount the Cash modal shows ("Cash Received"). */
const cashShown = () => screen.getByText('Cash Received').nextElementSibling.textContent.replace(/\s+/g, ' ').trim();

/** Opens the till and the Cash modal the way a cashier does: C on the checkout screen. */
const openCash = (props = {}) => {
  const payment = makePayment();
  const scan = vi.fn();
  render(<Till payment={payment} scan={scan} {...props} />);
  press(document.body, 'c', TYPE);
  settle();
  const cash = dialogs('Cash Payment')[0];
  expect(cash).toBeTruthy();
  expect(cashShown()).toBe('100.00'); // pre-filled with the exact remaining amount
  return { payment, scan, cash };
};

/** Nothing the scanner sent reached the payment, the sale or another payment method. */
const expectUntouched = ({ payment, scan }) => {
  expect(dialogs('Cash Payment')).toHaveLength(1);
  expect(cashShown()).toBe('100.00');
  expect(payment.addLine).not.toHaveBeenCalled();
  expect(scan).not.toHaveBeenCalled();
  for (const title of ['Card Payment', 'Online / Bank Transfer', 'Credit Sale', 'Buy Now, Pay Later']) {
    expect(dialogs(title), title).toHaveLength(0);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Scanner bursts while Cash is open ───────────────────────────────────────────────────
describe('P2.5 payment: a scanner burst never touches the Cash modal', () => {
  it('1/2. scanner digits + Enter: not the amount, and the Enter does not confirm', () => {
    const t = openCash();
    scanInto(t.cash, '6291041500213');
    settle();
    expectUntouched(t);
  });

  it('scanner letters + Enter: dropped', () => {
    const t = openCash();
    scanInto(t.cash, 'ABXY-99812');
    settle();
    expectUntouched(t);
  });

  it.each(['C', 'D', 'O', 'R', 'B', 'c', 'd', 'o', 'r', 'b'])(
    '3/4. a code beginning with %s: no clear, no payment method, no amount, no confirm', (first) => {
      const t = openCash();
      scanInto(t.cash, `${first}0012345`);
      settle();
      expectUntouched(t);
    },
  );

  it('a burst landing on a focused button inside the modal is dropped the same way', () => {
    const t = openCash();
    const quick = screen.getByRole('button', { name: '200' });
    quick.focus();
    scanInto(quick, 'C6291041500213');
    settle();
    expectUntouched(t);
  });

  it('a short burst (under the 4-character scan length) and its Enter are dropped too', () => {
    const t = openCash();
    scanInto(t.cash, 'C12');
    settle();
    expectUntouched(t);
  });

  it('a slow scanner (30 ms gaps, still inside the burst gap) is dropped', () => {
    const t = openCash();
    scanInto(t.cash, '6291041500213', 30);
    settle();
    expectUntouched(t);
  });

  it('a burst with no Enter suffix leaves the amount alone; a later human Enter confirms the shown amount', () => {
    const t = openCash();
    pressAll(t.cash, '6291041500213', SCAN);
    settle();
    expectUntouched(t);
    press(t.cash, 'Enter', TYPE);
    expect(t.payment.addLine).toHaveBeenCalledTimes(1);
    expect(t.payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 100 });
  });

  it('after a dropped burst, human typing works again at once', () => {
    const t = openCash();
    scanInto(t.cash, 'D0012345');
    pressAll(t.cash, '50', TYPE);
    press(t.cash, 'Enter', TYPE);
    expect(t.payment.addLine).toHaveBeenCalledTimes(1);
    expect(t.payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 50 });
    expect(t.scan).not.toHaveBeenCalled();
  });
});

// ── Human typing is unchanged ───────────────────────────────────────────────────────────
describe('P2.5 payment: human typing in the Cash modal is unchanged', () => {
  it('5. 200 + Enter replaces the pre-filled amount and confirms 200', () => {
    const { payment, cash } = openCash();
    pressAll(cash, '200', TYPE);
    settle(); // the last key shows once its settle window has passed
    expect(cashShown()).toBe('200');
    press(cash, 'Enter', TYPE);
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 200 });
  });

  it('an Enter inside the settle window confirms the key just typed (it lands first)', () => {
    const { payment, cash } = openCash();
    pressAll(cash, '20', TYPE);
    press(cash, '0', TYPE);
    press(cash, 'Enter', 40); // 40 ms: above the 35 ms scanner gap, inside the 50 ms window
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 200 });
  });

  it('6. C typed by the cashier clears the amount; the next digits are the new amount', () => {
    const { payment, cash } = openCash();
    press(cash, 'c', TYPE);
    settle();
    expect(cashShown()).toBe('0');
    pressAll(cash, '75', TYPE);
    press(cash, 'Enter', TYPE);
    expect(payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 75 });
  });

  it('decimal point, Backspace and a quick amount behave as before', () => {
    const { payment, cash } = openCash();
    pressAll(cash, '12.5', TYPE);
    settle();
    expect(cashShown()).toBe('12.5');
    press(cash, 'Backspace', TYPE);
    expect(cashShown()).toBe('12.');
    fireEvent.click(screen.getByRole('button', { name: '500' }));
    expect(cashShown()).toBe('500');
    press(cash, 'Enter', TYPE);
    expect(payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 500 });
  });

  it('D/O/R/B typed in the Cash modal do nothing, as before: no method opens, the amount is unchanged', () => {
    const { payment, cash } = openCash();
    for (const k of ['d', 'o', 'r', 'b']) press(cash, k, TYPE);
    settle();
    expect(cashShown()).toBe('100.00');
    expect(dialogs('Cash Payment')).toHaveLength(1);
    expect(dialogs('Card Payment')).toHaveLength(0);
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('Escape inside the settle window cancels the modal and the held key is never delivered', () => {
    const { payment, cash } = openCash();
    press(cash, '5', TYPE);
    press(cash, 'Escape', 10);
    expect(dialogs('Cash Payment')).toHaveLength(0);
    settle();
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('a field inside a payment modal owns its typing: the card reference keeps every key', () => {
    const payment = makePayment();
    render(<Till payment={payment} scan={vi.fn()} />);
    press(document.body, 'd', TYPE);
    settle();
    const ref = screen.getByPlaceholderText('e.g. TXN-001');
    ref.focus();
    for (const ch of 'TXN0012345') {
      advance(SCAN);
      expect(fireEvent.keyDown(ref, { key: ch })).toBe(true); // not prevented: the field types it
    }
  });

  it('posInputV2 off (rollback): the modal keys the amount synchronously, as before P2.5', () => {
    const payment = makePayment();
    render(<Till payment={payment} scan={vi.fn()} enabled={false} />);
    press(document.body, 'c', TYPE);
    const cash = dialogs('Cash Payment')[0];
    press(cash, '7', TYPE);
    expect(cashShown()).toBe('7'); // no settle window without the controller
  });
});

// ── Hotkeys outside the amount are unchanged ───────────────────────────────────────────
describe('P2.5 payment: C/D/O/R/B still select methods in CHECKOUT scope', () => {
  it.each([['c', 'Cash Payment'], ['d', 'Card Payment'], ['o', 'Online / Bank Transfer'], ['r', 'Credit'], ['b', 'Buy Now, Pay Later']])(
    '7. %s on the checkout screen opens %s', (k, title) => {
      render(<Till payment={makePayment()} scan={vi.fn()} />);
      press(document.body, k, TYPE);
      settle();
      expect(screen.getAllByRole('dialog').some((d) => (d.getAttribute('aria-label') || '').startsWith(title))).toBe(true);
    },
  );

  it('Cash → confirm → back on checkout: D opens Card (the PAYMENT handling ends with the modal)', () => {
    const { payment, cash } = openCash();
    press(cash, 'Escape', TYPE);
    expect(dialogs('Cash Payment')).toHaveLength(0);
    press(document.body, 'd', TYPE);
    settle();
    expect(dialogs('Card Payment')).toHaveLength(1);
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('a standalone Cash modal (no checkout overlay) is guarded as well', () => {
    const onConfirm = vi.fn();
    const scan = vi.fn();
    const Host = () => {
      const registry = usePosInputController({ enabled: true, focusEnabled: false });
      return (
        <PosOverlayProvider registry={registry}>
          <CartFocus scan={scan} />
          <CashPaymentModal remaining={100} editingLine={null} offeredTypes={['CASH']} onConfirm={onConfirm} onCancel={vi.fn()} />
        </PosOverlayProvider>
      );
    };
    render(<Host />);
    scanInto(dialogs('Cash Payment')[0], '6291041500213');
    settle();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
    expect(cashShown()).toBe('100.00');
  });

  it('still exactly one capture-phase POS keydown listener with a payment modal open', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    openCash();
    const keydown = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydown).toHaveLength(1);
    expect(keydown[0][2]).toBe(true);
  });
});
