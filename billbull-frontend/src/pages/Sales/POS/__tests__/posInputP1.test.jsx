import React, { useCallback, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import POSTouchScreen from '../POSTouchScreen';
import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import CashPaymentModal from '../payments/modals/CashPaymentModal';
import { TradeFunctionsPanel } from '../TradePOS/components/layout/TradeFunctionsPanel';
import { useStickyScanFocus } from '../TradePOS/useStickyScanFocus';
import { PosOverlayProvider } from '../input/PosOverlayContext';
import { HOTKEY_SETTLE_MS, usePosInputController } from '../input/usePosInputController';
import { POS_OVERLAY_IDS } from '../input/posScope';
import useGlobalSearchShortcut from '../../../../hooks/useGlobalSearchShortcut';

/**
 * P1 — one centralized, scope-aware POS input controller.
 *
 * Everything here runs through the real pieces POSSales mounts: usePosInputController +
 * PosOverlayProvider, the Cart Focus template (wedge surface), the compact template's sticky
 * focus (redirect surface), PaymentAllocationPanel with its real modals, TradeFunctionsPanel.
 * Overlays POSSales owns by flag (checkout, return, delivery settlement, layaway deposit) are
 * declared through the controller exactly as POSSales declares them.
 *
 * Time is fake and real-shaped: every keystroke advances the clock by its gap, so timers (the
 * hotkey settle window, the wedge idle reset) run when they would in a browser. SCAN is a
 * wedge scanner, SLOW_SCAN a slow one still inside the burst gap, TYPE a person.
 */

vi.setConfig({ testTimeout: 30_000 });

const SCAN = 5;
const SLOW_SCAN = 30;
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

/** POSSales' input wiring: the controller, its registry and the provider. */
const PosInputHost = ({ overlays = {}, enabled = true, children }) => {
  const registry = usePosInputController({ overlays, enabled });
  return <PosOverlayProvider registry={registry}>{children}</PosOverlayProvider>;
};

/** The Cart Focus template, wired like POSSales (as in posInputP0.test.jsx). */
const CartFocus = ({ scan, mode = 'none' }) => {
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
      posActionMode={mode}
      setPosActionMode={() => {}}
      selectedFocusItemId={mode === 'none' ? null : 'p1'}
      setSelectedFocusItemId={() => {}}
      updateItemPrice={vi.fn()} updateQuantity={vi.fn()} updateDiscount={vi.fn()} resetFocusMode={vi.fn()}
      discountInputType="percent"
      setDiscountInputType={() => {}}
      showFeedback={vi.fn()}
      handleCheckout={() => true}
    />
  );
};

/** The checkout overlay as POSSales renders it: a fixed full-screen layer holding the panel. */
const Checkout = ({ payment, owner }) => (
  <div className="fixed inset-0" data-testid={`overlay-${owner || 'checkout'}`}>
    <PaymentAllocationPanel payment={payment} hotkeyOwner={owner || POS_OVERLAY_IDS.CHECKOUT} />
  </div>
);

const barcodeBox = () => screen.getByPlaceholderText('Scan barcode or enter 3*CODE..');

const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const press = (target, key, gap = 0, extra = {}) => {
  if (gap) advance(gap);
  return fireEvent.keyDown(target, { key, ...extra });
};
const pressAll = (target, text, gap) => { for (const ch of text) press(target, ch, gap); };
/** A wedge scanner: the characters at scanner speed, then Enter. */
const scanInto = (target, code, gap = SCAN) => {
  pressAll(target, code, gap);
  return press(target, 'Enter', gap);
};
/** Lets any hotkey settle window run out. */
const settle = () => advance(HOTKEY_SETTLE_MS + 5);
const dialogs = (title) => screen.queryAllByRole('dialog', { name: title });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Scanner ownership ───────────────────────────────────────────────────────────────────
describe('scanner ownership by scope', () => {
  it('1. SALE scope accepts a scanner burst on no field — one scan, full value', () => {
    const scan = vi.fn();
    render(<PosInputHost><CartFocus scan={scan} /></PosInputHost>);
    scanInto(document.body, '6291041500213');
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith('6291041500213');
  });

  it('N*CODE and NxCODE reach the scan pipeline unchanged', () => {
    const scan = vi.fn();
    render(<PosInputHost><CartFocus scan={scan} /></PosInputHost>);
    scanInto(document.body, '3*W1');
    scanInto(document.body, '2xW1');
    expect(scan.mock.calls).toEqual([['3*W1'], ['2xW1']]);
  });

  it.each([
    ['2. CHECKOUT', POS_OVERLAY_IDS.CHECKOUT],
    ['4. RETURN', POS_OVERLAY_IDS.RETURN],
    ['5. DELIVERY SETTLEMENT', POS_OVERLAY_IDS.DELIVERY_SETTLEMENT],
    ['LAYAWAY DEPOSIT', POS_OVERLAY_IDS.LAYAWAY_DEPOSIT],
    ['DELIVERY', POS_OVERLAY_IDS.DELIVERY],
    ['COMPLETE', POS_OVERLAY_IDS.CHECKOUT_COMPLETE],
  ])('%s scope rejects scanner input — from explicit state, with no overlay in the DOM', (_, id) => {
    const scan = vi.fn();
    // No fixed/inset-0 layer is rendered: only the declared flag can block the scan.
    render(<PosInputHost overlays={{ [id]: true }}><CartFocus scan={scan} /></PosInputHost>);
    expect(document.querySelector('.fixed.inset-0')).toBeNull();
    scanInto(document.body, '6291041500213');
    expect(scan).not.toHaveBeenCalled();
  });

  it('3. PAYMENT scope rejects scanner input', () => {
    const scan = vi.fn();
    render(
      <PosInputHost>
        <CartFocus scan={scan} />
        <CashPaymentModal remaining={50} editingLine={null} offeredTypes={['CASH']} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </PosInputHost>,
    );
    scanInto(document.body, '6291041500213');
    expect(scan).not.toHaveBeenCalled();
  });

  it('ITEM_ENTRY (price mode) does not scan from the wedge (P0 C2 kept)', () => {
    const scan = vi.fn();
    render(<PosInputHost><CartFocus scan={scan} mode="price" /></PosInputHost>);
    scanInto(document.body, '6291041500213');
    expect(scan).not.toHaveBeenCalled();
  });

  it('a burst buffered while an overlay was open does not fire once it closes', () => {
    const scan = vi.fn();
    const { rerender } = render(<PosInputHost overlays={{ checkout: true }}><CartFocus scan={scan} /></PosInputHost>);
    pressAll(document.body, '6291041500213', SCAN);
    rerender(<PosInputHost overlays={{ checkout: false }}><CartFocus scan={scan} /></PosInputHost>);
    press(document.body, 'Enter', SCAN);
    expect(scan).not.toHaveBeenCalled();
  });

  it('6. a search/text field owns its own typing: nothing is buffered for the wedge', () => {
    const scan = vi.fn();
    render(<PosInputHost><CartFocus scan={scan} /><input aria-label="customer search" /></PosInputHost>);
    const search = screen.getByLabelText('customer search');
    search.focus();
    pressAll(search, '6291041500213', SCAN);
    press(document.body, 'Enter', SCAN);
    expect(scan).not.toHaveBeenCalled();
  });

  it('the compact template: a key on no field is redirected into the search box, a key in another field is not', () => {
    const Trade = () => {
      const ref = useRef(null);
      const [value, setValue] = useState('');
      useStickyScanFocus(ref);
      return (
        <>
          <input aria-label="trade search" ref={ref} value={value} onChange={(e) => setValue(e.target.value)} />
          <input aria-label="remarks" />
        </>
      );
    };
    render(<PosInputHost><Trade /></PosInputHost>);
    const remarks = screen.getByLabelText('remarks');
    remarks.focus();
    press(remarks, 'x');
    expect(screen.getByLabelText('trade search').value).toBe('');
    // No gap: the sticky-focus retry timer (unchanged in P1) would otherwise take focus first.
    remarks.blur();
    press(document.body, '7');
    expect(document.activeElement).toBe(screen.getByLabelText('trade search'));
    expect(screen.getByLabelText('trade search').value).toBe('7');
  });
});

// ── P0 dedup ────────────────────────────────────────────────────────────────────────────
describe('12. P0 scan dedup is intact under the controller', () => {
  it('a scan into the focused barcode box is scanned once, by the box', () => {
    const scan = vi.fn();
    render(<PosInputHost><CartFocus scan={scan} /></PosInputHost>);
    const box = barcodeBox();
    box.focus();
    for (const ch of '6291041500213') {
      press(box, ch, SCAN);
      fireEvent.change(box, { target: { value: `${box.value}${ch}` } });
    }
    press(box, 'Enter', SCAN);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith('6291041500213');
  });

  it('a wedge scan from no field is marked, so the box never scans the same event again', () => {
    const scan = vi.fn();
    render(<PosInputHost><CartFocus scan={scan} /></PosInputHost>);
    scanInto(document.body, '12345678');
    expect(scan).toHaveBeenCalledTimes(1);
  });
});

// ── Payment hotkeys ─────────────────────────────────────────────────────────────────────
describe('payment hotkeys: CHECKOUT-scoped, one key, one action', () => {
  it('C opens Cash after the settle window; nothing is scanned', () => {
    const scan = vi.fn();
    const payment = makePayment();
    render(<PosInputHost overlays={{ checkout: true }}><CartFocus scan={scan} /><Checkout payment={payment} /></PosInputHost>);
    press(document.body, 'c', TYPE);
    expect(dialogs('Cash Payment')).toHaveLength(0);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(1);
    expect(scan).not.toHaveBeenCalled();
  });

  it('the mappings are unchanged: C Cash, D Card, O Online, R Credit, B BNPL', () => {
    const payment = makePayment();
    render(<PosInputHost overlays={{ checkout: true }}><Checkout payment={payment} /></PosInputHost>);
    for (const [key, title] of [['c', 'Cash Payment'], ['d', 'Card Payment'], ['o', 'Online / Bank Transfer'], ['r', 'Credit Sale'], ['b', 'Buy Now, Pay Later']]) {
      press(document.body, key, TYPE);
      settle();
      const open = dialogs(title);
      expect(open, key).toHaveLength(1);
      fireEvent.keyDown(open[0], { key: 'Escape' });
      expect(dialogs(title), `${key} closed`).toHaveLength(0);
    }
  });

  it('hotkeys do nothing in SALE scope', () => {
    const payment = makePayment();
    render(<PosInputHost><Checkout payment={payment} /></PosInputHost>);
    press(document.body, 'c', TYPE);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(0);
  });

  it.each([
    ['a scanner-speed barcode starting with D', 'D1234567', SCAN],
    ['a slow scanner still inside the burst gap', 'C0012345', SLOW_SCAN],
    ['letters mid-burst', '12C45B67', SCAN],
  ])('8. %s never opens a payment method', (_, code, gap) => {
    const payment = makePayment();
    render(<PosInputHost overlays={{ checkout: true }}><Checkout payment={payment} /></PosInputHost>);
    scanInto(document.body, code, gap);
    settle();
    for (const title of ['Cash Payment', 'Card Payment', 'Online / Bank Transfer', 'Credit Sale', 'Buy Now, Pay Later']) {
      expect(dialogs(title), title).toHaveLength(0);
    }
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('7. the payment amount owns its typing: digits go to the amount, D does not open Card', () => {
    const payment = makePayment();
    render(<PosInputHost overlays={{ checkout: true }}><Checkout payment={payment} /></PosInputHost>);
    press(document.body, 'c', TYPE);
    settle();
    const cash = dialogs('Cash Payment')[0];
    press(cash, '2', TYPE);
    press(cash, '0', TYPE);
    press(cash, 'd', TYPE);
    settle();
    expect(dialogs('Card Payment')).toHaveLength(0);
    press(cash, 'Enter', TYPE);
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toEqual({ paymentType: 'CASH', amount: 20 });
  });

  it('a text field inside checkout owns its typing: c in it is a letter, not Cash', () => {
    const payment = makePayment();
    render(
      <PosInputHost overlays={{ checkout: true }}>
        <Checkout payment={payment} />
        <textarea aria-label="remarks" />
      </PosInputHost>,
    );
    const remarks = screen.getByLabelText('remarks');
    remarks.focus();
    press(remarks, 'c', TYPE);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(0);
  });

  it('9. one C is one Cash action with two panels mounted under the same owner', () => {
    const a = makePayment();
    const b = makePayment();
    render(
      <PosInputHost overlays={{ checkout: true }}>
        <div data-testid="a"><PaymentAllocationPanel payment={a} /></div>
        <div data-testid="b"><PaymentAllocationPanel payment={b} /></div>
      </PosInputHost>,
    );
    press(document.body, 'c', TYPE);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(1);
    // The most recently mounted panel owns the keys.
    expect(within(screen.getByTestId('b')).queryByRole('dialog', { name: 'Cash Payment' })).not.toBeNull();
  });

  it('9b. checkout and layaway deposit both open: the key reaches only the overlay on top', () => {
    const checkout = makePayment();
    const deposit = makePayment();
    const tree = (overlays) => (
      <PosInputHost overlays={overlays}>
        <Checkout payment={checkout} />
        <Checkout payment={deposit} owner={POS_OVERLAY_IDS.LAYAWAY_DEPOSIT} />
      </PosInputHost>
    );
    const { rerender } = render(tree({ checkout: true }));
    rerender(tree({ checkout: true, [POS_OVERLAY_IDS.LAYAWAY_DEPOSIT]: true }));
    press(document.body, 'c', TYPE);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(1);
    expect(within(screen.getByTestId('overlay-layaway-deposit')).queryByRole('dialog', { name: 'Cash Payment' })).not.toBeNull();
  });

  it('10. one D is one Card action', () => {
    render(
      <PosInputHost overlays={{ checkout: true }}>
        <PaymentAllocationPanel payment={makePayment()} />
        <PaymentAllocationPanel payment={makePayment()} />
      </PosInputHost>,
    );
    press(document.body, 'd', TYPE);
    settle();
    expect(dialogs('Card Payment')).toHaveLength(1);
  });

  it('legacy (posInputV2 off) is unchanged: every mounted panel answers, synchronously — the defect V2 removes', () => {
    render(
      <PosInputHost enabled={false} overlays={{ checkout: true }}>
        <PaymentAllocationPanel payment={makePayment()} />
        <PaymentAllocationPanel payment={makePayment()} />
      </PosInputHost>,
    );
    press(document.body, 'c', TYPE);
    expect(dialogs('Cash Payment')).toHaveLength(2);
  });
});

// ── Escape ──────────────────────────────────────────────────────────────────────────────
describe('11. Escape respects the active scope', () => {
  it('payment: Escape cancels the payment modal (the modal owns it)', () => {
    const payment = makePayment();
    render(<PosInputHost overlays={{ checkout: true }}><Checkout payment={payment} /></PosInputHost>);
    press(document.body, 'c', TYPE);
    settle();
    fireEvent.keyDown(dialogs('Cash Payment')[0], { key: 'Escape' });
    expect(dialogs('Cash Payment')).toHaveLength(0);
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('Trade Functions: Escape closes it, once', () => {
    const onClose = vi.fn();
    render(<PosInputHost><TradeFunctionsPanel open onClose={onClose} /></PosInputHost>);
    press(document.body, 'Escape', TYPE);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a MODAL over checkout takes Escape; the checkout flow behind it is untouched', () => {
    const onClose = vi.fn();
    const payment = makePayment();
    render(
      <PosInputHost overlays={{ checkout: true }}>
        <Checkout payment={payment} />
        <TradeFunctionsPanel open onClose={onClose} />
      </PosInputHost>,
    );
    press(document.body, 'Escape', TYPE);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('an unrelated text input keeps normal Escape: the controller neither claims nor prevents it', () => {
    const onEscape = vi.fn((e) => e.defaultPrevented);
    render(<PosInputHost><input aria-label="note" onKeyDown={(e) => e.key === 'Escape' && onEscape(e)} /></PosInputHost>);
    press(screen.getByLabelText('note'), 'Escape', TYPE);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onEscape.mock.results[0].value).toBe(false);
  });

  it('closed Trade Functions does not take Escape', () => {
    const onClose = vi.fn();
    render(<PosInputHost><TradeFunctionsPanel open={false} onClose={onClose} /></PosInputHost>);
    press(document.body, 'Escape', TYPE);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Coexistence and the migration flag ─────────────────────────────────────────────────
describe('14. legacy and V2 never both execute one keystroke', () => {
  it('a legacy panel still mounted outside the provider does not also answer a V2-handled key', () => {
    render(
      <>
        <PosInputHost overlays={{ checkout: true }}>
          <div data-testid="v2"><PaymentAllocationPanel payment={makePayment()} /></div>
        </PosInputHost>
        <div data-testid="legacy"><PaymentAllocationPanel payment={makePayment()} /></div>
      </>,
    );
    press(document.body, 'c', TYPE);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(1);
    expect(within(screen.getByTestId('v2')).queryByRole('dialog', { name: 'Cash Payment' })).not.toBeNull();
  });

  it('flag off: the legacy wedge scans, once, and no controller is attached', () => {
    const scan = vi.fn();
    const spy = vi.spyOn(window, 'addEventListener');
    render(<PosInputHost enabled={false}><CartFocus scan={scan} /></PosInputHost>);
    const captureKeydown = spy.mock.calls.filter(([type, , capture]) => type === 'keydown' && capture === true);
    expect(captureKeydown).toHaveLength(1); // POSTouchScreen's own legacy wedge
    scanInto(document.body, '6291041500213');
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('flag on: exactly one capture-phase POS keydown listener — the controller', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    render(
      <PosInputHost overlays={{ checkout: true }}>
        <CartFocus scan={vi.fn()} />
        <Checkout payment={makePayment()} />
        <TradeFunctionsPanel open onClose={vi.fn()} />
      </PosInputHost>,
    );
    const keydown = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydown).toHaveLength(1);
    expect(keydown[0][2]).toBe(true);
  });

  it('Ctrl/Cmd+X global search coexists: the controller leaves modifier chords alone', () => {
    const onSearch = vi.fn();
    const Search = () => { useGlobalSearchShortcut(onSearch); return null; };
    render(<PosInputHost overlays={{ checkout: true }}><Checkout payment={makePayment()} /><Search /></PosInputHost>);
    press(document.body, 'x', TYPE, { ctrlKey: true });
    press(document.body, 'c', TYPE, { ctrlKey: true });
    settle();
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(dialogs('Cash Payment')).toHaveLength(0);
  });
});

// ── Integration ─────────────────────────────────────────────────────────────────────────
describe('integration: POS + controller + checkout + payment panel', () => {
  const Pos = ({ checkoutOpen, scan, payment }) => (
    <PosInputHost overlays={{ [POS_OVERLAY_IDS.CHECKOUT]: checkoutOpen }}>
      <CartFocus scan={scan} />
      {checkoutOpen && <Checkout payment={payment} />}
    </PosInputHost>
  );

  it('a scanner burst is either a product scan or nothing — never a scan and a payment method', () => {
    const scan = vi.fn();
    const payment = makePayment();
    const { rerender } = render(<Pos checkoutOpen scan={scan} payment={payment} />);

    // Checkout open: a barcode that starts with C is neither scanned nor a Cash hotkey.
    scanInto(document.body, 'C0012345');
    settle();
    expect(scan).not.toHaveBeenCalled();
    expect(dialogs('Cash Payment')).toHaveLength(0);

    // A person pressing C is still Cash.
    press(document.body, 'c', TYPE);
    settle();
    expect(dialogs('Cash Payment')).toHaveLength(1);
    fireEvent.keyDown(dialogs('Cash Payment')[0], { key: 'Escape' });

    // Checkout closed: the same burst is one product scan and opens nothing.
    rerender(<Pos checkoutOpen={false} scan={scan} payment={payment} />);
    scanInto(document.body, 'C0012345');
    settle();
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith('C0012345');
    expect(dialogs('Cash Payment')).toHaveLength(0);
    expect(payment.addLine).not.toHaveBeenCalled();
  });
});
