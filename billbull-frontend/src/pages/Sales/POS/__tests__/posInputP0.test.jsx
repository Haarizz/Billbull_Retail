import React, { useCallback, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import POSTouchScreen from '../POSTouchScreen';
import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import CashPaymentModal from '../payments/modals/CashPaymentModal';

/**
 * P0 — POS input safety, driven through the real Cart Focus template and the real payment UI.
 *
 *  C1  one scanner event reaches handleBarcodeScan exactly once
 *  C2  price mode never hands the typed number to barcode processing; a scan is not a price
 *  C3/4 nothing typed or scanned behind checkout / payment / return / delivery reaches the cart
 *  C6  the first cash digit replaces the pre-filled exact amount
 *
 * Keystroke timing matters (a wedge scanner is told apart from a person by speed), so Date.now
 * is driven by the test: SCAN_GAP is scanner speed, TYPE_GAP is a person typing.
 */

// Rendering the full Cart Focus template is slow on a cold import, as in the other suites
// that mount POSTouchScreen.
vi.setConfig({ testTimeout: 30_000 });

const SCAN_GAP = 5;
const TYPE_GAP = 180;
let now;

const CART = {
  items: [{
    id: 'p1', name: 'Widget', code: 'W1', price: 10, quantity: 1,
    discount: 0, taxRate: 5, total: 10, unit: 'Pcs',
  }],
  subtotal: 10, totalDiscount: 0, tax: 0.5, total: 10.5, billDiscountAmount: 0,
};

const makeSpies = () => ({
  scan: vi.fn(),
  setBarcodeInput: vi.fn(),
  updateItemPrice: vi.fn(),
  updateQuantity: vi.fn(),
  updateDiscount: vi.fn(),
  resetFocusMode: vi.fn(),
  showFeedback: vi.fn(),
});

/** The Cart Focus template, wired like POSSales: real barcode state, spied entry handlers. */
const Harness = ({ spies, mode = 'none', children = null }) => {
  const [barcodeInput, setBarcodeInputState] = useState('');
  const barcodeInputRef = useRef(null);
  // Stable, like the useState setter POSSales passes. An unstable one re-runs the wedge effect
  // on every keystroke, whose cleanup empties the scan buffer — which would hide the C1 defect.
  const setBarcodeInput = useCallback((v) => { spies.setBarcodeInput(v); setBarcodeInputState(v); }, [spies]);
  return (
    <>
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
        handleBarcodeScan={spies.scan}
        handleUnifiedEntry={spies.scan}
        posActionMode={mode}
        setPosActionMode={() => {}}
        selectedFocusItemId={mode === 'none' ? null : 'p1'}
        setSelectedFocusItemId={() => {}}
        updateItemPrice={spies.updateItemPrice}
        updateQuantity={spies.updateQuantity}
        updateDiscount={spies.updateDiscount}
        resetFocusMode={spies.resetFocusMode}
        discountInputType="percent"
        setDiscountInputType={() => {}}
        showFeedback={spies.showFeedback}
        handleCheckout={() => true}
      />
      {children}
    </>
  );
};

const barcodeBox = () => screen.getByPlaceholderText('Scan barcode or enter 3*CODE..');

/** Keystrokes into the focused barcode box: keydown, then the browser's own value update. */
const typeInto = (input, text, gap) => {
  for (const ch of text) {
    now += gap;
    fireEvent.keyDown(input, { key: ch });
    fireEvent.change(input, { target: { value: `${input.value}${ch}` } });
  }
};
/** Keystrokes landing on a non-text element (body, a button, a dialog): no value to update. */
const pressOn = (target, text, gap) => {
  for (const ch of text) {
    now += gap;
    fireEvent.keyDown(target, { key: ch });
  }
};
const enter = (target, gap = SCAN_GAP) => {
  now += gap;
  return fireEvent.keyDown(target, { key: 'Enter' });
};

const makePayment = (overrides = {}) => ({
  paymentLines: [], invoiceTotal: 100, remainingBalance: 100, changeAmount: 0,
  totalAllocated: 0, totalCredit: 0, paymentSummary: null, lineErrors: {},
  isOverAllocated: false, canSettle: false,
  addLine: vi.fn(), updateLine: vi.fn(), removeLine: vi.fn(),
  ...overrides,
});

let spies;
beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  spies = makeSpies();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── C1 ──────────────────────────────────────────────────────────────────────────────────
describe('C1 — one scanner event, one scan', () => {
  it('a scan into the focused barcode box calls handleBarcodeScan exactly once', () => {
    render(<Harness spies={spies} />);
    const box = barcodeBox();
    box.focus();
    typeInto(box, '6291041500213', SCAN_GAP);
    enter(box);
    expect(spies.scan).toHaveBeenCalledTimes(1);
    expect(spies.scan).toHaveBeenCalledWith('6291041500213');
  });

  it('a scan while focus is on no field is captured by the wedge, once, with its full value', () => {
    render(<Harness spies={spies} />);
    pressOn(document.body, '6291041500213', SCAN_GAP);
    enter(document.body);
    expect(spies.scan).toHaveBeenCalledTimes(1);
    expect(spies.scan).toHaveBeenCalledWith('6291041500213');
    expect(spies.setBarcodeInput).toHaveBeenCalledWith('6291041500213');
  });

  it('manual entry is intact: typed slowly into the box, Enter adds it once', () => {
    render(<Harness spies={spies} />);
    const box = barcodeBox();
    box.focus();
    typeInto(box, '3*SKU-1', TYPE_GAP);
    enter(box, TYPE_GAP);
    expect(spies.scan).toHaveBeenCalledTimes(1);
    expect(spies.scan).toHaveBeenCalledWith('3*SKU-1');
  });

  it('manual entry is intact: the keypad and its Enter button submit once', () => {
    render(<Harness spies={spies} />);
    ['1', '2', '3'].forEach((k) => fireEvent.click(screen.getByRole('button', { name: k })));
    fireEvent.click(screen.getByRole('button', { name: /Enter/ }));
    expect(spies.scan).toHaveBeenCalledTimes(1);
    expect(spies.scan).toHaveBeenCalledWith('123');
  });
});

// ── C2 ──────────────────────────────────────────────────────────────────────────────────
describe('C2 — price mode is scanner-safe', () => {
  it('a typed price + Enter sets the price and never reaches barcode processing', () => {
    render(<Harness spies={spies} mode="price" />);
    const box = barcodeBox();
    box.focus();
    typeInto(box, '25', TYPE_GAP);
    enter(box, TYPE_GAP);
    expect(spies.updateItemPrice).toHaveBeenCalledWith('p1', 25);
    expect(spies.scan).not.toHaveBeenCalled();
  });

  it('a price keyed while focus is off the box is not captured as a barcode either', () => {
    render(<Harness spies={spies} mode="price" />);
    pressOn(document.body, '25', SCAN_GAP);
    enter(document.body);
    expect(spies.scan).not.toHaveBeenCalled();
  });

  it('a barcode scanned in price mode is refused — it neither becomes the price nor a cart line', () => {
    render(<Harness spies={spies} mode="price" />);
    const box = barcodeBox();
    box.focus();
    typeInto(box, '6291041500213', SCAN_GAP);
    enter(box);
    expect(spies.updateItemPrice).not.toHaveBeenCalled();
    expect(spies.scan).not.toHaveBeenCalled();
    expect(spies.showFeedback).toHaveBeenCalledWith('error', expect.stringMatching(/Scan ignored/));
  });

  it('quantity and discount modes behave as before', () => {
    const { unmount } = render(<Harness spies={spies} mode="qty" />);
    let box = barcodeBox();
    box.focus();
    typeInto(box, '3', TYPE_GAP);
    enter(box, TYPE_GAP);
    expect(spies.updateQuantity).toHaveBeenCalledWith('p1', 3);
    unmount();

    render(<Harness spies={spies} mode="discount" />);
    box = barcodeBox();
    box.focus();
    typeInto(box, '10', TYPE_GAP);
    enter(box, TYPE_GAP);
    expect(spies.updateDiscount).toHaveBeenCalledWith('p1', 10);
    expect(spies.scan).not.toHaveBeenCalled();
  });
});

// ── C3 / C4 ─────────────────────────────────────────────────────────────────────────────
// The root classes each POSSales overlay actually renders.
const OVERLAYS = [
  ['checkout', 'fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]'],
  ['payment modal', 'fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4'],
  ['sales return', 'fixed inset-0 z-50 flex items-center justify-center p-4'],
  ['new delivery order', 'fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4'],
  ['delivery settlement', 'fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4'],
];

describe('C3/C4 — nothing reaches the cart behind an overlay', () => {
  it.each(OVERLAYS)('a scanner burst is ignored while the %s overlay is open', (_name, className) => {
    render(
      <Harness spies={spies}>
        <div className={className}><button type="button">Overlay action</button></div>
      </Harness>,
    );
    const button = screen.getByRole('button', { name: 'Overlay action' });
    button.focus();
    pressOn(button, '6291041500213', SCAN_GAP);
    enter(button);
    pressOn(document.body, '6291041500213', SCAN_GAP);
    enter(document.body);
    expect(spies.scan).not.toHaveBeenCalled();
    expect(spies.setBarcodeInput).not.toHaveBeenCalled();
  });

  it('a return-screen scan field keeps its input: the keystrokes are neither swallowed nor scanned', () => {
    render(
      <Harness spies={spies}>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <input aria-label="Return invoice scan" />
        </div>
      </Harness>,
    );
    const field = screen.getByLabelText('Return invoice scan');
    field.focus();
    now += SCAN_GAP;
    const keyEvent = new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true });
    act(() => { field.dispatchEvent(keyEvent); });
    expect(keyEvent.defaultPrevented).toBe(false);
    typeInto(field, 'SI-POS-000124', SCAN_GAP);
    enter(field);
    expect(spies.scan).not.toHaveBeenCalled();
  });

  it('keystrokes buffered behind an overlay do not fire once it closes', () => {
    const { rerender } = render(
      <Harness spies={spies}>
        <div className="fixed inset-0 z-[60]"><button type="button">Overlay action</button></div>
      </Harness>,
    );
    pressOn(document.body, '200', SCAN_GAP);
    rerender(<Harness spies={spies} />);
    enter(document.body);
    expect(spies.scan).not.toHaveBeenCalled();
    // ...and the wedge works again for a real scan.
    pressOn(document.body, '6291041500213', SCAN_GAP);
    enter(document.body);
    expect(spies.scan).toHaveBeenCalledTimes(1);
  });

  it('payment: C opens Cash, typed digits replace the exact amount, Enter confirms — and nothing is scanned', () => {
    const payment = makePayment();
    render(
      <Harness spies={spies}>
        <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">
          <PaymentAllocationPanel payment={payment} />
        </div>
      </Harness>,
    );
    pressOn(document.body, 'c', TYPE_GAP);
    const dialog = screen.getByRole('dialog', { name: 'Cash Payment' });
    expect(document.activeElement).toBe(dialog);
    pressOn(dialog, '200', SCAN_GAP);
    enter(dialog);
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toMatchObject({ paymentType: 'CASH', amount: 200 });
    expect(spies.scan).not.toHaveBeenCalled();
    expect(spies.setBarcodeInput).not.toHaveBeenCalled();
  });

  it.each([['c', 'Cash Payment'], ['d', 'Card Payment'], ['o', 'Online / Bank Transfer'], ['r', 'Credit'], ['b', 'Buy Now, Pay Later']])(
    'the %s payment hotkey still opens its modal with the scanner wedge mounted', (k, title) => {
      render(
        <Harness spies={spies}>
          <div className="fixed inset-0 z-[60]"><PaymentAllocationPanel payment={makePayment()} /></div>
        </Harness>,
      );
      pressOn(document.body, k, TYPE_GAP);
      expect(screen.getByRole('dialog').getAttribute('aria-label')).toMatch(new RegExp(title, 'i'));
      enter(screen.getByRole('dialog'));
      expect(spies.scan).not.toHaveBeenCalled();
    },
  );
});

// ── C6 ──────────────────────────────────────────────────────────────────────────────────
describe('C6 — the first cash digit replaces the pre-filled amount', () => {
  const renderCash = (props = {}) => {
    const onConfirm = vi.fn();
    render(<CashPaymentModal remaining={100} offeredTypes={['CASH', 'CARD']} onConfirm={onConfirm} onCancel={vi.fn()} {...props} />);
    return { onConfirm, dialog: screen.getByRole('dialog') };
  };
  const shown = () => screen.getByText('Cash Received').nextElementSibling.textContent.replace(/\s+/g, ' ').trim();

  it('starts on the exact remaining amount', () => {
    renderCash();
    expect(shown()).toBe('100.00');
  });

  it('100.00 then typing 200 gives 200, not 100.00200', () => {
    const { dialog, onConfirm } = renderCash();
    pressOn(dialog, '200', TYPE_GAP);
    expect(shown()).toBe('200');
    enter(dialog);
    expect(onConfirm).toHaveBeenCalledWith({ paymentType: 'CASH', amount: 200 });
  });

  it('only the FIRST key replaces — later keys append', () => {
    const { dialog } = renderCash();
    pressOn(dialog, '25', TYPE_GAP);
    pressOn(dialog, '.5', TYPE_GAP);
    expect(shown()).toBe('25.5');
  });

  it('the on-screen keypad follows the same rule', () => {
    renderCash();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(shown()).toBe('50');
  });

  it('Backspace edits the pre-filled amount instead of replacing it', () => {
    const { dialog } = renderCash();
    pressOn(dialog, ['Backspace'], TYPE_GAP);
    expect(shown()).toBe('100.0');
    pressOn(dialog, '5', TYPE_GAP);
    expect(shown()).toBe('100.05');
  });

  it('Clear empties it, and typing then builds a fresh amount', () => {
    const { dialog } = renderCash();
    pressOn(dialog, 'c', TYPE_GAP);
    expect(shown()).toBe('0');
    pressOn(dialog, '75', TYPE_GAP);
    expect(shown()).toBe('75');
  });

  it('a quick amount sets the value and the next digit replaces it', () => {
    const { dialog } = renderCash();
    fireEvent.click(screen.getByRole('button', { name: '500' }));
    expect(shown()).toBe('500');
    pressOn(dialog, '3', TYPE_GAP);
    expect(shown()).toBe('3');
  });

  it('editing an existing line: the first digit replaces its amount too', () => {
    const { dialog } = renderCash({ editingLine: { id: 'l1', paymentType: 'CASH', amount: 40 }, remaining: 60 });
    expect(shown()).toBe('40');
    pressOn(dialog, '9', TYPE_GAP);
    expect(shown()).toBe('9');
  });
});
