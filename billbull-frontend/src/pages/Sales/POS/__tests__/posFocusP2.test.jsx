import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import POSTouchScreen from '../POSTouchScreen';
import { TradePOSTouchScreen } from '../TradePOS/TradePOSTouchScreen';
import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import CheckoutPaymentFooter from '../features/checkout/CheckoutPaymentFooter';
import CheckoutCompleteActions from '../features/checkout/CheckoutCompleteActions';
import { PosOverlayProvider } from '../input/PosOverlayContext';
import { usePosInputController } from '../input/usePosInputController';
import { createPosFocusController } from '../input/usePosFocusController';
import { POS_FOCUS_TARGETS as T } from '../input/posFocus';
import { POS_OVERLAY_IDS } from '../input/posScope';

vi.mock('../../../../api/salesInvoiceApi', () => ({
  getCustomerOutstanding: vi.fn(() => Promise.resolve({ outstanding: 0 })),
}));

/**
 * P2 — one deterministic, state-driven POS focus controller for Trade POS, Cart Focus and
 * Classic.
 *
 * Each template is the real component, mounted in a harness wired the way POSSales wires it:
 * usePosInputController + PosOverlayProvider, the flag-declared overlays (checkout, complete,
 * return, supervisor PIN, promotions), and the real checkout pieces (PaymentAllocationPanel with
 * its modals, CheckoutPaymentFooter, CheckoutCompleteActions). Cart, customer and payment state
 * are small stand-ins for the POSSales hooks.
 *
 * Input is real-shaped: a key lands on document.activeElement; if nothing prevents it, a
 * printable key is typed into the focused field and Enter on a focused button clicks it, as a
 * browser does. A click focuses what a mouse-down would focus first. SCAN is a wedge scanner's
 * inter-key gap, TYPE a person's. jsdom is not a terminal: none of this is hardware validation.
 */

vi.setConfig({ testTimeout: 30_000 });

const SCAN = 5;
const TYPE = 180;

const PRODUCTS = [
  { id: 'p1', name: 'Widget', code: 'W1', barcode: '6291041500213', price: 10, stock: 50 },
  { id: 'p2', name: 'Gadget', code: 'G1', barcode: '6291041500220', price: 20, stock: 50 },
];
const WIDGET = PRODUCTS[0].barcode;
const GADGET = PRODUCTS[1].barcode;
const CUSTOMERS = [{ id: 'c2', name: 'Alice Buyer', mobile: '0500000000' }];
const WALK_IN = { id: 'walk-in', name: 'Walk-in Customer' };
const WEDGE = { enabled: true, status: 'ACTIVE', inputMode: 'KEYBOARD_WEDGE', autoFocusOnPOS: true };
const NO_SCANNER = { enabled: false, status: 'ACTIVE', inputMode: 'KEYBOARD_WEDGE', autoFocusOnPOS: true };

const lineOf = (p, quantity) => ({
  id: p.id, name: p.name, code: p.code, barcode: p.barcode, price: p.price, quantity,
  discount: 0, taxRate: 0, total: p.price * quantity, unit: 'Pcs',
});

/** The POSSales Payment Manager, reduced to what the panel and footer read. */
function usePaymentStub(total) {
  const [lines, setLines] = useState([]);
  const allocated = lines.reduce((s, l) => s + l.amount, 0);
  const remaining = Math.max(0, Math.round((total - allocated) * 100) / 100);
  return {
    paymentLines: lines, invoiceTotal: total, remainingBalance: remaining, changeAmount: 0,
    totalAllocated: allocated, totalCredit: 0, paymentSummary: null, lineErrors: {},
    isOverAllocated: false, canSettle: lines.length > 0 && remaining === 0,
    addLine: (d) => setLines((ls) => [...ls, { ...d, id: `l${ls.length + 1}` }]),
    updateLine: (id, d) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...d } : l))),
    removeLine: (id) => setLines((ls) => ls.filter((l) => l.id !== id)),
    reset: () => setLines([]),
  };
}

/**
 * POSSales, reduced to the state the three templates and the checkout read. `api.added`
 * records every product that reached the cart, in order.
 */
function PosHarness({ template, scannerConfig = WEDGE, focusEnabled = true, api }) {
  const [items, setItems] = useState([]);
  const [invoiceCounter, setInvoiceCounter] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(WALK_IN.id);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [posActionMode, setPosActionMode] = useState('none');
  const [classicNumpadMode, setClassicNumpadMode] = useState('none');
  const [classicNumpadValue, setClassicNumpadValue] = useState('');
  const [selectedFocusItemId, setSelectedFocusItemId] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState('functions');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState('payment');
  const [showSupervisorPin, setShowSupervisorPin] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [, setTick] = useState(0);
  const barcodeInputRef = useRef(null);
  const hiddenPanelButtons = useMemo(() => new Set(), []);

  const total = items.reduce((s, i) => s + i.total, 0);
  const payment = usePaymentStub(total);
  const invoice = { items, subtotal: total, totalDiscount: 0, tax: 0, total, billDiscountAmount: 0 };
  const invoiceRef = useRef(invoice);
  useLayoutEffect(() => { invoiceRef.current = invoice; });

  const registry = usePosInputController({
    enabled: true,
    focusEnabled,
    overlays: {
      [POS_OVERLAY_IDS.CHECKOUT]: showPaymentDialog && checkoutPhase !== 'complete',
      [POS_OVERLAY_IDS.CHECKOUT_COMPLETE]: showPaymentDialog && checkoutPhase === 'complete',
      [POS_OVERLAY_IDS.RETURN]: showReturn,
      [POS_OVERLAY_IDS.SUPERVISOR_PIN]: showSupervisorPin,
      [POS_OVERLAY_IDS.PROMOTIONS]: showPromotions,
    },
  });

  useEffect(() => {
    api.expose({
      registry,
      rerender: () => setTick((t) => t + 1),
      items: () => invoiceRef.current.items,
    });
  });

  const addProduct = useCallback((raw) => {
    const value = String(raw || '').trim();
    const m = value.match(/^(\d+)[*x](.+)$/i);
    const code = m ? m[2] : value;
    const product = PRODUCTS.find((p) => [p.barcode, p.code, p.id].includes(code));
    if (!product) return false;
    api.added(product.barcode);
    setItems((prev) => (prev.some((i) => i.id === product.id)
      ? prev.map((i) => (i.id === product.id ? lineOf(product, i.quantity + 1) : i))
      : [lineOf(product, 1), ...prev]));
    return true;
  }, [api]);

  // Async, like the real handlers: the cart and the cleared box land in a later render.
  const handleBarcodeScan = useCallback(async (value) => {
    await Promise.resolve();
    addProduct(value);
    setBarcodeInput('');
  }, [addProduct]);
  const handleUnifiedEntry = useCallback(async (value, { fromGrid } = {}) => {
    await Promise.resolve();
    addProduct(value);
    setBarcodeInput('');
    if (fromGrid) setSearchQuery('');
  }, [addProduct]);
  const handleProductSelection = useCallback((product) => {
    addProduct(product.barcode);
    return { ok: true };
  }, [addProduct]);
  const updateQuantity = useCallback((id, qty) => {
    setItems((prev) => prev.map((i) => (i.id === id ? lineOf(PRODUCTS.find((p) => p.id === id), qty) : i)));
  }, []);
  const removeItem = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const holdInvoice = useCallback(() => { setItems([]); api.held(); }, [api]);
  const handleCheckout = useCallback(() => { setShowPaymentDialog(true); return true; }, []);
  const processPayment = useCallback(() => {
    // useCheckout: the cart is cleared and the COMPLETE phase shown in the same overlay.
    setItems([]);
    setInvoiceCounter((c) => c + 1);
    setCheckoutPhase('complete');
  }, []);
  const closeComplete = useCallback(() => {
    setShowPaymentDialog(false);
    setCheckoutPhase('payment');
    setSelectedCustomer(WALK_IN.id);
    payment.reset();
  }, [payment]);

  const selectedCustomerData = CUSTOMERS.find((c) => c.id === selectedCustomer) || WALK_IN;
  const noop = () => {};
  const props = {
    currentInvoice: invoice, currentInvoiceRef: invoiceRef, invoiceCounter,
    posProducts: PRODUCTS, filteredProducts: PRODUCTS, productCategories: [], horizontalCategories: [],
    customerOptions: CUSTOMERS, filteredCustomerOptions: CUSTOMERS, heldSales: [], customerHistory: [],
    selectedCustomer, setSelectedCustomer, selectedCustomerData,
    customerSearchQuery, setCustomerSearchQuery, showCustomerDropdown, setShowCustomerDropdown,
    formatCurrency: (n) => `AED ${Number(n || 0).toFixed(2)}`,
    posSettings: {}, currentSession: { id: 7 }, sessionId: 7, setCurrentView: noop, setShowPOSConfig: noop,
    scannerConfig, barcodeInput, setBarcodeInput, barcodeInputRef,
    barcodeSuggestions: barcodeInput.trim() ? [PRODUCTS[1]] : [], setBarcodeSuggestions: noop,
    searchQuery, setSearchQuery,
    handleBarcodeScan, handleUnifiedEntry, handleProductSelection, handleEditItem: noop,
    updateQuantity, updateDiscount: noop, updateItemPrice: noop,
    voidFromInvoice: removeItem, guardedRemoveFromInvoice: removeItem, guardedClearInvoice: () => setItems([]),
    holdInvoice, holdBusy: false,
    posActionMode, setPosActionMode, selectedFocusItemId, setSelectedFocusItemId,
    classicNumpadMode, setClassicNumpadMode, classicNumpadValue, setClassicNumpadValue,
    classicDiscountType: 'percent', setClassicDiscountType: noop,
    discountInputType: 'percent', setDiscountInputType: noop,
    resetFocusMode: () => { setPosActionMode('none'); setSelectedFocusItemId(null); setBarcodeInput(''); },
    rightPanelTab, setRightPanelTab, hiddenPanelButtons, posTemplate: template,
    handleCheckout, showFeedback: noop,
    setShowPromotionsDialog: setShowPromotions, setShowReturn,
    openQuickCustomerModal: noop, showQuickCustomerModal: false, setShowQuickCustomerModal: noop,
    quickCustomerForm: {}, setQuickCustomerForm: noop,
  };

  return (
    <PosOverlayProvider registry={registry}>
      {template === 'compact' ? <TradePOSTouchScreen {...props} /> : <POSTouchScreen {...props} />}

      {/* Sale-screen actions the templates reach through their function buttons. */}
      <div>
        <button type="button" onClick={() => setShowPromotions(true)}>Open promotions</button>
        <button type="button" onClick={() => setShowSupervisorPin(true)}>Supervisor void</button>
        <button type="button" onClick={() => setShowReturn(true)}>Open return</button>
      </div>

      {showPromotions && (
        <div role="dialog" aria-label="Promotions" className="fixed inset-0">
          <button type="button" onClick={() => setShowPromotions(false)}>Close promotions</button>
        </div>
      )}
      {showSupervisorPin && (
        <div role="dialog" aria-label="Supervisor approval" className="fixed inset-0">
          <input aria-label="Supervisor PIN" type="password" autoFocus />
          <button type="button" onClick={() => setShowSupervisorPin(false)}>Approve</button>
        </div>
      )}
      {showReturn && (
        <div role="dialog" aria-label="Return" className="fixed inset-0">
          <input aria-label="Return invoice number" autoFocus />
          <button type="button" onClick={() => setShowReturn(false)}>Close return</button>
        </div>
      )}

      {/* The checkout overlay as POSSales renders it: payment phase, then COMPLETE in place. */}
      {showPaymentDialog && checkoutPhase !== 'complete' && (
        <div className="fixed inset-0" data-testid="checkout">
          <PaymentAllocationPanel payment={payment} />
          <CheckoutPaymentFooter
            changeDue={0} checkoutError={null} canSettle={payment.canSettle} itemCount={items.length}
            checkoutLoading={false} effectiveDue={total}
            onCancel={() => { setShowPaymentDialog(false); payment.reset(); }}
            onSettle={() => processPayment()}
          />
        </div>
      )}
      {showPaymentDialog && checkoutPhase === 'complete' && (
        <div className="fixed inset-0" data-testid="complete">
          <CheckoutCompleteActions onNewSale={closeComplete} onPrintReceipt={noop} onReprint={noop} onShare={noop} />
        </div>
      )}
    </PosOverlayProvider>
  );
}

// ── Real-shaped input ─────────────────────────────────────────────────────────────────────
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
/** Lets the post-commit focus evaluation (a microtask) and async handlers run. */
const flush = async () => {
  await act(async () => {});
  await act(async () => {});
};
const isField = (n) => n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA');
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/** One key, as a browser delivers it to whatever has focus. */
const key = (k) => {
  const target = document.activeElement || document.body;
  const notPrevented = fireEvent.keyDown(target, { key: k });
  if (!notPrevented) return;
  if (k.length === 1) {
    const field = document.activeElement;
    if (isField(field)) fireEvent.change(field, { target: { value: `${field.value}${k}` } });
  } else if (k === 'Enter' && target.tagName === 'BUTTON' && !target.disabled) {
    fireEvent.click(target);
  }
};
/** A pointer click: mouse-down moves focus (unless prevented), then the click. */
const click = async (node) => {
  const notPrevented = fireEvent.mouseDown(node);
  if (notPrevented) {
    const focusable = node.closest(FOCUSABLE);
    if (focusable) focusable.focus();
    else document.activeElement?.blur?.();
  }
  fireEvent.mouseUp(node);
  fireEvent.click(node);
  await flush();
};
/** A wedge scanner: the code at scanner speed, then Enter. */
const scan = async (code) => {
  for (const ch of code) { advance(SCAN); key(ch); }
  advance(SCAN);
  key('Enter');
  await flush();
  advance(300);
  await flush();
};
const type = async (text) => {
  for (const ch of text) { advance(TYPE); key(ch); }
  await flush();
};
const press = async (k) => {
  advance(TYPE);
  key(k);
  await flush();
};

// ── Template anatomy ──────────────────────────────────────────────────────────────────────
const TEMPLATES = [['Trade POS', 'compact'], ['Cart Focus', 'focus'], ['Classic', 'classic']];
const SEARCH_PLACEHOLDER = {
  compact: 'Scan barcode or type item code / name...',
  focus: 'Scan barcode or enter 3*CODE..',
  classic: 'Scan or search — item, barcode, batch, customer…',
};
const searchBox = (t) => screen.getByPlaceholderText(SEARCH_PLACEHOLDER[t]);
const plusButton = (t) => {
  if (t === 'compact') return screen.getAllByRole('button', { name: 'Increase quantity' })[0];
  if (t === 'focus') return screen.getAllByRole('button', { name: '+' })[0];
  return document.querySelector('.group button svg.lucide-plus').closest('button');
};
const minusButton = (t) => {
  if (t === 'compact') return screen.getAllByRole('button', { name: 'Decrease quantity' })[0];
  if (t === 'focus') return screen.getAllByRole('button', { name: '−' })[0];
  return document.querySelector('.group button svg.lucide-minus').closest('button');
};
const removeButton = (t) => {
  if (t === 'compact') return screen.getAllByRole('button', { name: 'Remove item' })[0];
  return screen.getByRole('button', { name: t === 'focus' ? 'Remove Item' : 'Remove' });
};
const holdButton = (t) => (t === 'compact'
  ? screen.getByRole('button', { name: 'Hold invoice' })
  : screen.getAllByRole('button', { name: 'Hold' })[0]);
const checkoutButton = () => screen.getAllByRole('button', { name: /checkout/i })
  .find((b) => !b.closest('[data-testid]'));
const customerOpener = () => screen.getAllByRole('button', { name: /Walk-in Customer/ })[0];
const customerSearch = () => screen.getByPlaceholderText(/Search (Name|Customer)/);
// A method tile's accessible name starts with its hotkey badge ("c Cash").
const methodTile = (label) => within(screen.getByTestId('checkout'))
  .getByRole('button', { name: new RegExp(`^[a-z] ?${label}$`, 'i') });
const settleButton = () => screen.getByRole('button', { name: /^Settle payment/ });
const newSaleButton = () => screen.getByRole('button', { name: /New Sale/ });

/**
 * Records every setTimeout the application schedules from now on (jsdom's own selection-event
 * timers, fired by focus()/select(), are not the application's and are left out).
 */
const watchAppTimers = () => {
  const real = window.setTimeout;
  const scheduled = [];
  const spy = vi.spyOn(window, 'setTimeout').mockImplementation((fn, ms, ...args) => {
    const stack = new Error().stack || '';
    if (!/[\\/]jsdom[\\/]/.test(stack)) scheduled.push(ms ?? 0);
    return real(fn, ms, ...args);
  });
  return { scheduled, restore: () => spy.mockRestore() };
};

const setup = (template, opts = {}) => {
  const api = { added: vi.fn(), held: vi.fn() };
  api.expose = (handles) => Object.assign(api, handles);
  const utils = render(<PosHarness template={template} api={api} {...opts} />);
  return { api, ...utils };
};
/** What the focus controller derives right now, from the same registry. */
const derivedTarget = (api) => createPosFocusController({ registry: api.registry }).evaluate().target;
const expectFocus = (node) => expect(document.activeElement).toBe(node);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// ── 1–3, 28. Sale ready ───────────────────────────────────────────────────────────────────
describe.each(TEMPLATES)('%s', (_, t) => {
  it('SALE READY: the search/barcode box has focus on mount, from the SEARCH target', async () => {
    const { api } = setup(t);
    await flush();
    expectFocus(searchBox(t));
    expect(derivedTarget(api)).toBe(T.SEARCH);
  });

  it('4/9 scan → scan: each scan is added and the box is ready again, no click in between', async () => {
    const { api } = setup(t);
    await flush();
    await scan(WIDGET);
    expectFocus(searchBox(t));
    await scan(GADGET);
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[WIDGET], [GADGET], [WIDGET]]);
    expectFocus(searchBox(t));
    expect(searchBox(t).value).toBe('');
  });

  it('6/25 cart +/−: focus returns to search and the next scan adds the scanned product, not another +', async () => {
    const { api } = setup(t);
    await flush();
    await scan(WIDGET);
    await click(plusButton(t));
    expectFocus(searchBox(t));
    expect(api.items()[0].quantity).toBe(2);
    await scan(GADGET);
    expect(api.added.mock.calls).toEqual([[WIDGET], [GADGET]]);
    expect(api.items().find((i) => i.id === 'p1').quantity).toBe(2); // the scanner's Enter did not click +
    await click(minusButton(t));
    expectFocus(searchBox(t));
  });

  it('8. remove/void: focus returns to search', async () => {
    const { api } = setup(t);
    await flush();
    await scan(WIDGET);
    await click(removeButton(t));
    expect(api.items()).toHaveLength(0);
    expectFocus(searchBox(t));
  });

  it('9. hold: focus returns to search and the next scan starts the next bill', async () => {
    const { api } = setup(t);
    await flush();
    await scan(WIDGET);
    await click(holdButton(t));
    expect(api.held).toHaveBeenCalledTimes(1);
    expectFocus(searchBox(t));
    await scan(GADGET);
    expect(api.items().map((i) => i.id)).toEqual(['p2']);
  });

  it('7/20 customer: the open customer search owns focus (no stealing), selecting returns to search, D scan works', async () => {
    const { api } = setup(t);
    await flush();
    await click(customerOpener());
    expectFocus(customerSearch());
    expect(derivedTarget(api)).toBe(T.CUSTOMER);
    await type('Ali');
    act(() => api.rerender());
    await flush();
    expectFocus(customerSearch()); // a POSSales re-render does not pull it back to search
    await click(screen.getByRole('button', { name: /Alice Buyer/ }));
    expectFocus(searchBox(t));
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[WIDGET]]);
  });

  it('10. closing a non-blocking dialog opened from the sale screen returns focus to search', async () => {
    setup(t);
    await flush();
    await click(screen.getByRole('button', { name: 'Open promotions' }));
    expect(screen.getByRole('dialog', { name: 'Promotions' })).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Close promotions' }));
    expectFocus(searchBox(t));
  });

  it('21. supervisor PIN keeps the caret while it is open, and search gets it back after', async () => {
    const { api } = setup(t);
    await flush();
    await click(screen.getByRole('button', { name: 'Supervisor void' }));
    const pin = screen.getByLabelText('Supervisor PIN');
    expectFocus(pin);
    expect(derivedTarget(api)).toBe(T.NONE);
    await type('1234');
    act(() => api.rerender());
    await flush();
    expectFocus(pin);
    expect(pin.value).toBe('1234');
    await click(screen.getByRole('button', { name: 'Approve' }));
    expectFocus(searchBox(t));
  });

  it('23. payment open: a scan never reaches the cart and never moves focus to search', async () => {
    const { api } = setup(t);
    await flush();
    await scan(WIDGET);
    await click(checkoutButton());
    await press('Enter'); // Cash
    expectFocus(screen.getByRole('dialog', { name: 'Cash Payment' }));
    await scan(GADGET);
    expect(api.added.mock.calls).toEqual([[WIDGET]]);
    expect(document.activeElement).not.toBe(searchBox(t));
  });

  it('24. return open: a scan cannot reach the sale behind it', async () => {
    const { api } = setup(t);
    await flush();
    await click(screen.getByRole('button', { name: 'Open return' }));
    document.activeElement.blur(); // even with focus lost inside the return screen
    await scan(WIDGET);
    expect(api.added).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(searchBox(t));
  });

  // The full loop, at every stage asserting focus and who owns the scanner.
  it('28. FULL LOOP: scan → scan → cart → checkout → cash → settle → new sale → scan', async () => {
    const { api } = setup(t);
    await flush();
    const targets = [derivedTarget(api)];

    await scan(WIDGET);
    await scan(GADGET);
    expectFocus(searchBox(t));
    await click(plusButton(t));
    expectFocus(searchBox(t));
    targets.push(derivedTarget(api));

    // CHECKOUT: the first payment method; a scan adds nothing.
    await click(checkoutButton());
    expectFocus(methodTile('Cash'));
    targets.push(derivedTarget(api));
    await scan(WIDGET);
    expect(api.added).toHaveBeenCalledTimes(2);
    expectFocus(methodTile('Cash'));

    // PAYMENT: Enter on Cash opens it; the amount owns the keys.
    await press('Enter');
    const cash = screen.getByRole('dialog', { name: 'Cash Payment' });
    expectFocus(cash);
    targets.push(derivedTarget(api));

    // Fully allocated: Settle, not back on the Cash tile.
    await press('Enter'); // confirm the pre-filled exact amount
    expect(screen.queryByRole('dialog', { name: 'Cash Payment' })).toBeNull();
    expectFocus(settleButton());
    targets.push(derivedTarget(api));

    // COMPLETE: New Sale; a scan cannot touch the cleared cart behind it.
    await press('Enter');
    expectFocus(newSaleButton());
    targets.push(derivedTarget(api));
    await scan(WIDGET);
    expect(api.added).toHaveBeenCalledTimes(2);
    expect(api.items()).toHaveLength(0);

    // NEW SALE: search, and the very next scan works.
    await press('Enter');
    expectFocus(searchBox(t));
    targets.push(derivedTarget(api));
    await scan(GADGET);
    expect(api.added.mock.calls.map(([c]) => c)).toEqual([WIDGET, GADGET, GADGET]);
    expect(api.items().map((i) => i.id)).toEqual(['p2']);

    expect(targets).toEqual([
      T.SEARCH, T.SEARCH, T.PAYMENT_METHOD, T.PAYMENT_AMOUNT, T.SETTLE, T.NEW_SALE, T.SEARCH,
    ]);
  });

  it('13. a partial allocation chains to the next payment modal, which gets focus; cancelling it returns to the method bar', async () => {
    setup(t);
    await flush();
    await scan(WIDGET);
    await click(checkoutButton());
    await press('Enter'); // Cash
    await type('4');
    await press('Enter'); // 4 of 10: the next tender opens straight away
    const next = screen.getAllByRole('dialog').find((d) => d.getAttribute('aria-label') !== 'Cash Payment');
    expect(next).toBeTruthy();
    expect(next.contains(document.activeElement)).toBe(true);
    await press('Escape');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expectFocus(methodTile('Cash')); // balance remains: PAYMENT_METHOD, not Settle
  });

  it('16/27 New Sale: focus is in search with no timer involved, and the next scan is accepted at once', async () => {
    const { api } = setup(t);
    await flush();
    await scan(WIDGET);
    await click(checkoutButton());
    await press('Enter');
    await press('Enter');
    await press('Enter'); // settle
    const timers = watchAppTimers();
    await click(newSaleButton());
    // Focused by the commit itself: no time has passed and no refocus timer was scheduled.
    expectFocus(searchBox(t));
    expect(timers.scheduled).toEqual([]);
    timers.restore();
    for (const ch of GADGET) { advance(SCAN); key(ch); }
    advance(SCAN);
    key('Enter');
    await flush();
    expect(api.added.mock.calls.map(([c]) => c)).toEqual([WIDGET, GADGET]);
  });
});

// ── Template-specific entry paths ──────────────────────────────────────────────────────────
describe('product tile / suggestion selection (5, 26)', () => {
  it('Classic: a product tile click returns focus to search; the next scan adds the scanned product, not the tile', async () => {
    const { api } = setup('classic');
    await flush();
    await click(screen.getByRole('button', { name: /Gadget/ }));
    expectFocus(searchBox('classic'));
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[GADGET], [WIDGET]]);
  });

  it('Trade POS: a quick-pick tile click returns focus to search; the next scan adds the scanned product', async () => {
    const { api } = setup('compact');
    await flush();
    await click(screen.getByRole('option', { name: /Gadget/ }));
    expectFocus(searchBox('compact'));
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[GADGET], [WIDGET]]);
  });

  it('Cart Focus: picking a search suggestion returns focus to the barcode box; the next scan adds the scanned product', async () => {
    const { api } = setup('focus');
    await flush();
    await type('G');
    await click(screen.getByRole('button', { name: /Gadget/ }));
    expectFocus(searchBox('focus'));
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[GADGET], [WIDGET]]);
  });
});

describe('item keypad (ITEM_ENTRY) is never robbed by search (17–19)', () => {
  it.each([['Add Qty', T.QUANTITY], ['Disc %', T.DISCOUNT], ['Price', T.PRICE]])(
    'Classic %s: the numpad field owns the caret, through a row click, a keypad click and a re-render',
    async (label, target) => {
      const { api } = setup('classic');
      await flush();
      await scan(WIDGET);
      await click(screen.getByRole('button', { name: label }));
      const field = screen.getByPlaceholderText('0');
      expectFocus(field);
      expect(derivedTarget(api)).toBe(target);
      await click(screen.getAllByText('Widget')[0]); // select the cart row
      expectFocus(field);
      await type('3');
      await click(screen.getByRole('button', { name: '5' }));
      act(() => api.rerender());
      await flush();
      expectFocus(field);
      expect(field.value).toBe('35');
      await scan(GADGET); // a scan is a number here, never a product
      expect(api.added.mock.calls).toEqual([[WIDGET]]);
    },
  );

  it('Classic: confirming the numpad hands the caret back to search', async () => {
    const { api } = setup('classic');
    await flush();
    await scan(WIDGET);
    await click(screen.getByRole('button', { name: 'Add Qty' }));
    await click(screen.getAllByText('Widget')[0]);
    await type('4');
    await press('Enter');
    expect(api.items()[0].quantity).toBe(4);
    expectFocus(searchBox('classic'));
  });

  it('Cart Focus: Add Qty repurposes the barcode box, which keeps the caret through row clicks', async () => {
    const { api } = setup('focus');
    await flush();
    await scan(WIDGET);
    await click(screen.getByRole('button', { name: 'Add Qty' }));
    expectFocus(searchBox('focus'));
    expect(derivedTarget(api)).toBe(T.QUANTITY);
    await click(screen.getAllByText('Widget')[0]);
    expectFocus(searchBox('focus'));
    await type('3');
    await press('Enter');
    expect(api.items()[0].quantity).toBe(3);
    expectFocus(searchBox('focus'));
    expect(derivedTarget(api)).toBe(T.SEARCH);
  });
});

describe('Classic: the grid search is a real target (no ref limitation)', () => {
  it('with no wedge scanner configured, scan → scan → scan works without clicking search', async () => {
    const { api } = setup('classic', { scannerConfig: NO_SCANNER });
    await flush();
    await scan(WIDGET);
    await scan(GADGET);
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[WIDGET], [GADGET], [WIDGET]]);
  });

  it('typing on no field goes into search (type-anywhere), and not while a field elsewhere has focus', async () => {
    setup('classic', { scannerConfig: NO_SCANNER });
    await flush();
    document.activeElement.blur();
    await type('12345');
    expect(searchBox('classic').value).toBe('12345');
    expectFocus(searchBox('classic'));
  });
});

describe('autoFocusOnPOS=false opts every template out of proactive search focus', () => {
  it.each(TEMPLATES)('%s', async (_, t) => {
    setup(t, { scannerConfig: { ...WEDGE, autoFocusOnPOS: false } });
    await flush();
    expect(document.activeElement).not.toBe(searchBox(t));
  });
});

// ── P2.5 popups that own focus inside the sale screen ─────────────────────────────────────
// The audit: the only popups that coexist with the POS search layer and take focus/keys are the
// customer dropdowns (all three templates) and Cart Focus's barcode suggestions. Radix
// Select/Popover/DropdownMenu are not rendered by any sale template (CustomerView's Selects
// mount only when no template is). The open customer dropdown is the registered CUSTOMER
// target, so the registry, not the DOM, says it owns the caret.
describe.each(TEMPLATES)('P2.5 popups — %s customer dropdown', (_, t) => {
  const open = async (api) => {
    await flush();
    await click(customerOpener());
    expectFocus(customerSearch());
    expect(derivedTarget(api)).toBe(T.CUSTOMER);
  };
  const aliceOption = () => screen.getByRole('button', { name: /Alice Buyer/ });

  it('8/9. opening gives the popup focus; re-renders and a click on its non-focusable body do not hand it to search', async () => {
    const { api } = setup(t);
    await open(api);
    act(() => api.rerender());
    await flush();
    expectFocus(customerSearch());
    await type('Ali');
    // A mouse-down on the list's empty area blurs the field; the click restores the popup's
    // own field, not search.
    await click(aliceOption().parentElement);
    expectFocus(customerSearch());
    expect(customerSearch().value).toBe('Ali');
  });

  it('10/11/13. selecting completes once, the popup closes, then focus goes to search — no second action', async () => {
    const { api } = setup(t);
    await open(api);
    await click(aliceOption());
    // The action completed: Alice is the customer and the popup is gone.
    expect(screen.queryByPlaceholderText(/Search (Name|Customer)/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Alice Buyer/ }).length).toBeGreaterThan(0);
    expectFocus(searchBox(t));
    expect(derivedTarget(api)).toBe(T.SEARCH);
    // Restoring focus did not re-open the popup or act again, and the next Enter is the
    // search box's, not the customer option's.
    await press('Enter');
    expect(screen.queryByPlaceholderText(/Search (Name|Customer)/)).toBeNull();
    expect(api.added).not.toHaveBeenCalled();
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[WIDGET]]);
  });

  it('12. scanner and keyboard input go to the popup while it owns focus, never to the cart', async () => {
    const { api } = setup(t);
    await open(api);
    await scan(WIDGET);
    expect(api.added).not.toHaveBeenCalled();
    expect(customerSearch().value).toBe(WIDGET);
    expectFocus(customerSearch());
  });
});

describe('P2.5 popups — Cart Focus barcode suggestions', () => {
  it('a suggestion click adds once, the list closes, and search keeps the caret for the next scan', async () => {
    const { api } = setup('focus');
    await flush();
    await type('Gad');
    const option = screen.getByRole('button', { name: /Gadget/ });
    await click(option);
    expect(api.added.mock.calls).toEqual([[GADGET]]);
    expectFocus(searchBox('focus'));
    await scan(WIDGET);
    expect(api.added.mock.calls).toEqual([[GADGET], [WIDGET]]);
  });
});

// ── Rollback and listener ownership ───────────────────────────────────────────────────────
describe('rollback (posFocusV2 off) and listener ownership', () => {
  it('flag off: no focus controller is attached and Trade POS keeps its legacy retry loop', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    setup('compact', { focusEnabled: false });
    expect(add.mock.calls.filter(([type, , capture]) => type === 'click' && capture === true)).toHaveLength(0);
    expect(document.activeElement).not.toBe(searchBox('compact'));
    advance(10); // the legacy loop focuses on its own timer
    expectFocus(searchBox('compact'));
  });

  it('flag on: exactly one capture-phase click listener (focus) and one keydown listener (input) for the POS', () => {
    const add = vi.spyOn(window, 'addEventListener');
    setup('focus');
    const capture = (type) => add.mock.calls.filter(([ty, , c]) => ty === type && c === true);
    expect(capture('click')).toHaveLength(1);
    expect(capture('keydown')).toHaveLength(1);
  });

  it('flag on: no template schedules a refocus timer — mount, scans and cart changes focus synchronously', async () => {
    for (const [, t] of TEMPLATES) {
      const timers = watchAppTimers();
      const { api } = setup(t);
      await flush();
      expectFocus(searchBox(t));
      act(() => api.rerender());
      await flush();
      // The legacy mechanisms: Trade's 0 ms + 300 ms retry loop, Cart Focus's 80 ms refocus.
      expect(timers.scheduled.filter((ms) => ms === 0 || ms === 80 || ms === 300), t).toEqual([]);
      timers.restore();
      cleanup();
    }
  });
});
