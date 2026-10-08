import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/salesInvoiceApi', () => ({
  getCustomerOutstanding: vi.fn(() => Promise.resolve({ outstanding: 0 })),
}));
vi.mock('../../../../api/posApi', () => ({
  posCheckout: vi.fn(),
  posCreditBalance: vi.fn(),
  convertLayaway: vi.fn(),
}));
vi.mock('../../../../utils/printGenerator', () => ({
  printHtml: vi.fn(),
  generatePrintHtmlAsync: vi.fn(async () => '<html></html>'),
}));

import { posCheckout } from '../../../../api/posApi';
import POSTouchScreen from '../POSTouchScreen';
import { TradePOSTouchScreen } from '../TradePOS/TradePOSTouchScreen';
import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import CheckoutPaymentFooter from '../features/checkout/CheckoutPaymentFooter';
import CheckoutCompleteActions from '../features/checkout/CheckoutCompleteActions';
import { useCheckout } from '../features/checkout/useCheckout';
import { PAYMENT_TYPES, createPaymentLine } from '../payments/paymentModel';
import { buildCheckoutPaymentFields } from '../payments/paymentPayloadAdapter';
import { PosOverlayProvider } from '../input/PosOverlayContext';
import { HOTKEY_SETTLE_MS, usePosInputController } from '../input/usePosInputController';
import { createPosFocusController } from '../input/usePosFocusController';
import { POS_FOCUS_TARGETS as T } from '../input/posFocus';
import { POS_OVERLAY_IDS } from '../input/posScope';
import {
  CASH_DOUBLE_TAP_MS, CHECKOUT_QUICK_CASH, ENTER_MULTI_TAP_MS, checkoutQuickCashRequest,
} from '../input/posShortcuts';

/**
 * P3 — POS keyboard + Enter multi-tap shortcuts, on Trade POS, Cart Focus and Classic.
 *
 * Each template is the real component in a harness wired the way POSSales wires it (as in
 * posFocusP2): the one input controller and focus controller, the flag-declared checkout and
 * complete overlays, the real PaymentAllocationPanel (with its modals), CheckoutPaymentFooter
 * and CheckoutCompleteActions. handleCheckout passes its quick-cash request to the panel exactly
 * as POSSales does (checkoutQuickCashRequest). Cart, customer and the settlement call are small
 * stand-ins; the real settlement path (useCheckout's lock and checkoutKey) is driven at the end.
 *
 * Input is real-shaped: a key lands on document.activeElement; if nothing prevents it, a
 * printable key is typed into the focused field and Enter on a focused button clicks it.
 * SCAN is a wedge scanner's inter-key gap, TYPE a person's. jsdom only: browser/kiosk
 * interception of F-keys is not observable here.
 */

vi.setConfig({ testTimeout: 30_000 });

const SCAN = 5;
const TYPE = 180;
/** Gap between the taps of a person's double/triple Enter. */
const TAP = 120;

const PRODUCTS = [
  { id: 'p1', name: 'Widget', code: 'W1', barcode: '6291041500213', price: 10, stock: 50 },
  { id: 'p2', name: 'Gadget', code: 'G1', barcode: '6291041500220', price: 20, stock: 50 },
  // Barcodes that start with a checkout hotkey letter, or with + / −.
  ...['C', 'D', 'O', 'R', 'B'].map((l) => ({ id: `p${l}`, name: `${l}-item`, code: `${l}1`, barcode: `${l}12345`, price: 5, stock: 9 })),
  { id: 'pMinus', name: 'Minus-item', code: 'M1', barcode: '-12345', price: 5, stock: 9 },
];
const WIDGET = PRODUCTS[0].barcode;
const GADGET = PRODUCTS[1].barcode;
const CUSTOMERS = [{ id: 'c2', name: 'Alice Buyer', mobile: '0500000000' }];
const WALK_IN = { id: 'walk-in', name: 'Walk-in Customer' };
const WEDGE = { enabled: true, status: 'ACTIVE', inputMode: 'KEYBOARD_WEDGE', autoFocusOnPOS: true };

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

/** POSSales, reduced to the state the three templates and the checkout read. */
function PosHarness({ template, api }) {
  const [items, setItems] = useState([]);
  const [lastEnteredLineId, setLastEnteredLineId] = useState(null);
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
  const [quickCash, setQuickCash] = useState(null);
  const quickCashSeq = useRef(0);
  const barcodeInputRef = useRef(null);
  const hiddenPanelButtons = useMemo(() => new Set(), []);

  const total = items.reduce((s, i) => s + i.total, 0);
  const payment = usePaymentStub(total);
  const invoice = { items, subtotal: total, totalDiscount: 0, tax: 0, total, billDiscountAmount: 0 };
  const invoiceRef = useRef(invoice);
  useLayoutEffect(() => { invoiceRef.current = invoice; });

  const registry = usePosInputController({
    enabled: true,
    focusEnabled: true,
    overlays: {
      [POS_OVERLAY_IDS.CHECKOUT]: showPaymentDialog && checkoutPhase !== 'complete',
      [POS_OVERLAY_IDS.CHECKOUT_COMPLETE]: showPaymentDialog && checkoutPhase === 'complete',
    },
  });

  useEffect(() => {
    api.expose({
      registry,
      items: () => invoiceRef.current.items,
      lines: () => payment.paymentLines,
      selected: () => selectedFocusItemId,
      posActionMode: () => posActionMode,
      classicNumpadMode: () => classicNumpadMode,
    });
  });

  const addProduct = useCallback((raw) => {
    const value = String(raw || '').trim();
    const product = PRODUCTS.find((p) => [p.barcode, p.code, p.id].includes(value));
    if (!product) return false;
    api.added(product.barcode);
    setItems((prev) => (prev.some((i) => i.id === product.id)
      ? prev.map((i) => (i.id === product.id ? lineOf(product, i.quantity + 1) : i))
      : [lineOf(product, 1), ...prev]));
    // useProductEntry: the line the add landed on, new or merged.
    setLastEnteredLineId(product.id);
    return true;
  }, [api]);

  const handleBarcodeScan = useCallback(async (value) => {
    api.scanned(value);
    await Promise.resolve();
    addProduct(value);
    setBarcodeInput('');
  }, [addProduct, api]);
  const handleUnifiedEntry = useCallback(async (value, { fromGrid } = {}) => {
    api.scanned(value);
    await Promise.resolve();
    addProduct(value);
    setBarcodeInput('');
    if (fromGrid) setSearchQuery('');
  }, [addProduct, api]);
  const handleProductSelection = useCallback((product) => {
    addProduct(product.barcode);
    return { ok: true };
  }, [addProduct]);
  const updateQuantity = useCallback((id, qty) => {
    api.quantity(id, qty);
    setItems((prev) => prev.map((i) => (i.id === id ? lineOf(PRODUCTS.find((p) => p.id === id), qty) : i)));
  }, [api]);
  // guardedRemoveFromInvoice: the guarded path (supervisor/void rules live behind it in POSSales).
  const guardedRemove = useCallback((id) => {
    api.removed(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [api]);
  const holdInvoice = useCallback(() => { api.held(); setItems([]); }, [api]);
  // POSSales.handleCheckout: opens checkout and hands a double/triple Enter's request to the panel.
  const handleCheckout = useCallback((opts) => {
    api.checkout(opts?.quickCash ?? null);
    setCheckoutPhase('payment');
    setShowPaymentDialog(true);
    quickCashSeq.current += 1;
    setQuickCash(checkoutQuickCashRequest(opts, quickCashSeq.current));
    return true;
  }, [api]);
  const clearQuickCash = useCallback(() => setQuickCash(null), []);
  const processPayment = useCallback((...args) => {
    api.settled(...args);
    setItems([]);
    setInvoiceCounter((c) => c + 1);
    setCheckoutPhase('complete');
  }, [api]);
  const closeComplete = useCallback(() => {
    api.newSale();
    setShowPaymentDialog(false);
    setCheckoutPhase('payment');
    setSelectedCustomer(WALK_IN.id);
    payment.reset();
  }, [api, payment]);

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
    scannerConfig: WEDGE, barcodeInput, setBarcodeInput, barcodeInputRef,
    barcodeSuggestions: [], setBarcodeSuggestions: noop,
    searchQuery, setSearchQuery, lastEnteredLineId,
    handleBarcodeScan, handleUnifiedEntry, handleProductSelection,
    handleEditItem: (id, opts) => api.edited(id, opts),
    updateQuantity, updateDiscount: noop, updateItemPrice: noop,
    voidFromInvoice: guardedRemove, guardedRemoveFromInvoice: guardedRemove, guardedClearInvoice: () => setItems([]),
    holdInvoice, holdBusy: false,
    posActionMode, setPosActionMode, selectedFocusItemId, setSelectedFocusItemId,
    classicNumpadMode, setClassicNumpadMode, classicNumpadValue, setClassicNumpadValue,
    classicDiscountType: 'percent', setClassicDiscountType: noop,
    discountInputType: 'percent', setDiscountInputType: noop,
    resetFocusMode: () => { setPosActionMode('none'); setSelectedFocusItemId(null); setBarcodeInput(''); },
    rightPanelTab, setRightPanelTab, hiddenPanelButtons, posTemplate: template,
    handleCheckout, showFeedback: noop,
    openQuickCustomerModal: noop, showQuickCustomerModal: false, setShowQuickCustomerModal: noop,
    quickCustomerForm: {}, setQuickCustomerForm: noop,
  };

  return (
    <PosOverlayProvider registry={registry}>
      {template === 'compact' ? <TradePOSTouchScreen {...props} /> : <POSTouchScreen {...props} />}

      {showPaymentDialog && checkoutPhase !== 'complete' && (
        <div className="fixed inset-0" data-testid="checkout">
          <PaymentAllocationPanel payment={payment} quickCash={quickCash} onQuickCashHandled={clearQuickCash} />
          <CheckoutPaymentFooter
            changeDue={0} checkoutError={null} canSettle={payment.canSettle} itemCount={items.length}
            checkoutLoading={false} effectiveDue={total}
            onCancel={() => { api.cancelled(); setShowPaymentDialog(false); payment.reset(); }}
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
const flush = async () => {
  await act(async () => {});
  await act(async () => {});
};
const isField = (n) => n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA');
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/** One key, as a browser delivers it to whatever has focus. Returns the keydown event. */
const key = (k, opts = {}) => {
  const target = document.activeElement || document.body;
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  act(() => { target.dispatchEvent(event); });
  if (event.defaultPrevented || opts.ctrlKey || opts.altKey || opts.metaKey) return event;
  if (k.length === 1) {
    const field = document.activeElement;
    if (isField(field)) fireEvent.change(field, { target: { value: `${field.value}${k}` } });
  } else if (k === 'Enter' && target.tagName === 'BUTTON' && !target.disabled) {
    fireEvent.click(target);
  }
  return event;
};
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
const scan = async (code, { settleAfter = true } = {}) => {
  for (const ch of code) { advance(SCAN); key(ch); }
  advance(SCAN);
  key('Enter');
  await flush();
  if (settleAfter) {
    advance(300);
    await flush();
  }
};
const type = async (text) => {
  for (const ch of text) { advance(TYPE); key(ch); }
  await flush();
};
const press = async (k, opts) => {
  advance(TYPE);
  const event = key(k, opts);
  await flush();
  return event;
};
/**
 * n Enter taps at a person's double-tap speed, then long enough for the sequence to resolve.
 * Each keydown is its own browser task, so whatever the previous one scheduled (a render, the
 * focus controller's microtask) has run before the next arrives.
 */
const tapEnter = async (n) => {
  for (let i = 0; i < n; i += 1) {
    if (i) advance(TAP);
    key('Enter');
    await flush();
  }
};
const enterTaps = async (n) => {
  advance(TYPE);
  await tapEnter(n);
  advance(ENTER_MULTI_TAP_MS + 5);
  await flush();
};
/** Past the post-sequence Enter cooldown. */
const pastCooldown = async () => {
  advance(ENTER_MULTI_TAP_MS + 10);
  await flush();
};
const settleHotkey = async () => {
  advance(HOTKEY_SETTLE_MS + 5);
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
const customerSearch = () => screen.getByPlaceholderText(/Search (Name|Customer)/);
const checkoutOpen = () => Boolean(screen.queryByTestId('checkout'));
const completeOpen = () => Boolean(screen.queryByTestId('complete'));
const dialog = (name) => screen.queryByRole('dialog', { name });
const settleButton = () => screen.getByRole('button', { name: /^Settle payment/ });
const newSaleButton = () => screen.getByRole('button', { name: /New Sale/ });
const cashShown = () => screen.getByText('Cash Received').nextElementSibling.textContent.replace(/\s+/g, ' ').trim();
/** A cart row (not the product tile of the same name), for a click that selects it. */
const cartRow = (t, product) => {
  if (t === 'compact') return within(screen.getByRole('region', { name: 'Shopping Cart' })).getByText(product.name);
  return screen.getAllByText(product.name).map((n) => n.closest('div.grid.group')).find(Boolean);
};
const qtyOf = (api, id) => api.items().find((i) => i.id === id)?.quantity;

const makeApi = () => {
  const api = {
    added: vi.fn(), scanned: vi.fn(), quantity: vi.fn(), removed: vi.fn(), held: vi.fn(), edited: vi.fn(),
    checkout: vi.fn(), settled: vi.fn(), cancelled: vi.fn(), newSale: vi.fn(),
  };
  api.expose = (handles) => Object.assign(api, handles);
  return api;
};
const setup = async (template) => {
  const api = makeApi();
  render(<PosHarness template={template} api={api} />);
  await flush();
  return api;
};
const derivedTarget = (api) => createPosFocusController({ registry: api.registry }).evaluate().target;
const expectFocus = (node) => expect(document.activeElement).toBe(node);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  posCheckout.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe.each(TEMPLATES)('%s — Enter multi-tap', (_, t) => {
  it('1. single Enter on an empty search opens Checkout — only once the tap window has passed', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    advance(TYPE);
    key('Enter');
    await flush();
    advance(ENTER_MULTI_TAP_MS - 20);
    await flush();
    expect(checkoutOpen()).toBe(false); // not before it is known not to be a double/triple
    advance(25);
    await flush();
    expect(checkoutOpen()).toBe(true);
    expect(api.checkout.mock.calls).toEqual([[null]]);
    expect(dialog('Cash Payment')).toBeNull();
    expect(derivedTarget(api)).toBe(T.PAYMENT_METHOD);
  });

  it('2. Enter with text in the search keeps the normal search/entry behaviour', async () => {
    const api = await setup(t);
    await type('W1');
    await press('Enter');
    advance(ENTER_MULTI_TAP_MS + 50);
    await flush();
    expect(api.added.mock.calls).toEqual([[WIDGET]]);
    expect(checkoutOpen()).toBe(false);
    expect(api.checkout).not.toHaveBeenCalled();
  });

  it('3. double Enter opens Checkout with the Cash modal up and the caret in it', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(2);
    expect(api.checkout.mock.calls).toEqual([[CHECKOUT_QUICK_CASH.MODAL]]);
    const cash = dialog('Cash Payment');
    expect(cash).toBeTruthy();
    expect(derivedTarget(api)).toBe(T.PAYMENT_AMOUNT);
    expectFocus(cash);
  });

  it('4. double Enter: the exact remaining amount is keyed, nothing is allocated until Enter confirms, then Settle has the caret', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await scan(GADGET);
    await enterTaps(2);
    expect(cashShown()).toBe('30.00');
    expect(api.lines()).toEqual([]);
    await pastCooldown();
    await press('Enter'); // the cashier confirms the allocation
    expect(api.lines()).toEqual([expect.objectContaining({ paymentType: 'CASH', amount: 30 })]);
    expect(dialog('Cash Payment')).toBeNull();
    expectFocus(settleButton());
    expect(api.settled).not.toHaveBeenCalled();
  });

  it('5/6. triple Enter allocates the exact amount in Cash, focuses Settle, and does NOT post the invoice', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(3);
    expect(api.checkout.mock.calls).toEqual([[CHECKOUT_QUICK_CASH.ALLOCATE]]);
    expect(api.lines()).toEqual([expect.objectContaining({ paymentType: 'CASH', amount: 10 })]);
    expect(dialog('Cash Payment')).toBeNull();
    expectFocus(settleButton());
    expect(derivedTarget(api)).toBe(T.SETTLE);
    advance(2000);
    await flush();
    expect(api.settled).not.toHaveBeenCalled(); // final settlement state, unposted
    await press('Enter', { ctrlKey: true }); // the explicit final action
    expect(api.settled).toHaveBeenCalledTimes(1);
  });

  it('no single + double + triple from one sequence: three taps open checkout once, with one intent', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(3);
    advance(1000);
    await flush();
    expect(api.checkout).toHaveBeenCalledTimes(1);
    expect(api.lines()).toHaveLength(1);
  });

  it('7/39. a scanner Enter never opens Checkout', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await scan(GADGET);
    advance(2000);
    await flush();
    expect(api.added.mock.calls).toEqual([[WIDGET], [GADGET]]);
    expect(checkoutOpen()).toBe(false);
    expect(api.checkout).not.toHaveBeenCalled();
  });

  it('8. a scanner burst cannot become a double/triple Enter, and drops a pending Enter tap', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    advance(TYPE);
    key('Enter'); // a person's tap…
    advance(80);
    await scan(GADGET); // …then a scan inside the tap window, with its Enter
    await scan(WIDGET, { settleAfter: false }); // and another, back to back
    advance(1000);
    await flush();
    expect(api.added.mock.calls).toEqual([[WIDGET], [GADGET], [WIDGET]]);
    expect(api.checkout).not.toHaveBeenCalled();
    // The next person's single Enter is a single tap, not the second or third of anything.
    await enterTaps(1);
    expect(api.checkout.mock.calls).toEqual([[null]]);
  });

  it('a scanner sending two suffix Enters (CR+LF) does not tap, even once the search is cleared', async () => {
    const api = await setup(t);
    for (const ch of WIDGET) { advance(SCAN); key(ch); }
    advance(SCAN);
    key('Enter');
    await flush(); // the scan has run and the search box is empty again
    expect(searchBox(t).value).toBe('');
    advance(SCAN);
    key('Enter');
    await flush();
    advance(1000);
    await flush();
    expect(api.added.mock.calls).toEqual([[WIDGET]]);
    expect(api.checkout).not.toHaveBeenCalled();
  });

  it('9. rapid and repeated Enter does not double-settle', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    advance(TYPE);
    await tapEnter(4); // the fourth tap lands on checkout, with Settle already focused
    expect(document.activeElement).toBe(settleButton());
    expect(api.settled).not.toHaveBeenCalled(); // the fourth did not click Settle
    expect(api.lines()).toHaveLength(1);
    await pastCooldown();
    await press('Enter'); // Settle has the caret: a person settles
    for (let i = 0; i < 5; i += 1) key('Enter', { repeat: true }); // the key held down
    await flush();
    expect(api.settled).toHaveBeenCalledTimes(1);
    expect(completeOpen()).toBe(true); // the repeats did not start the next sale either
  });

  it('10. Enter on the COMPLETE screen starts a new sale, and the caret is back in search', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(3);
    await pastCooldown();
    await press('Enter', { ctrlKey: true });
    expect(completeOpen()).toBe(true);
    expectFocus(newSaleButton());
    await press('Enter');
    expect(api.newSale).toHaveBeenCalledTimes(1);
    expect(checkoutOpen() || completeOpen()).toBe(false);
    expectFocus(searchBox(t));
  });

  it('Enter on an empty cart does nothing (the Checkout button is disabled too)', async () => {
    const api = await setup(t);
    await enterTaps(1);
    await enterTaps(3);
    expect(api.checkout).not.toHaveBeenCalled();
    expect(checkoutOpen()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe.each(TEMPLATES)('%s — sale shortcuts', (_, t) => {
  it('11. F2 puts the caret in the customer search without selecting anyone', async () => {
    const api = await setup(t);
    const event = await press('F2');
    expect(event.defaultPrevented).toBe(true);
    expectFocus(customerSearch());
    expect(derivedTarget(api)).toBe(T.CUSTOMER);
    expect(screen.getAllByText('Walk-in Customer').length).toBeGreaterThan(0);
  });

  it('12. F3 puts the caret back in the product/barcode search, from the customer search too', async () => {
    const api = await setup(t);
    await press('F2');
    expectFocus(customerSearch());
    const event = await press('F3');
    expect(event.defaultPrevented).toBe(true); // the browser's find bar does not open
    expectFocus(searchBox(t));
    expect(derivedTarget(api)).toBe(T.SEARCH);
    await scan(WIDGET); // and the next scan lands in the sale
    expect(api.added.mock.calls).toEqual([[WIDGET]]);
  });

  it('13. + raises the last entered line, not items[0]', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await scan(GADGET);
    await scan(WIDGET); // merges into Widget, which stays below Gadget
    expect(api.items()[0].id).toBe('p2');
    await press('+');
    await settleHotkey();
    expect(qtyOf(api, 'p1')).toBe(3);
    expect(qtyOf(api, 'p2')).toBe(1);
    await press('+');
    await settleHotkey();
    expect(qtyOf(api, 'p1')).toBe(4);
    await scan(GADGET);
    await press('+');
    await settleHotkey();
    expect(qtyOf(api, 'p2')).toBe(3);
    expect(qtyOf(api, 'p1')).toBe(4);
    expectFocus(searchBox(t));
    expect(searchBox(t).value).toBe('');
  });

  it('14. − lowers the last entered line and stops at 1 (removal is Delete\'s, with its rules)', async () => {
    const api = await setup(t);
    await scan(GADGET);
    await scan(WIDGET);
    await scan(WIDGET);
    await press('-');
    await settleHotkey();
    expect(qtyOf(api, 'p1')).toBe(1);
    await press('-');
    await settleHotkey();
    expect(qtyOf(api, 'p1')).toBe(1);
    expect(api.removed).not.toHaveBeenCalled();
    expect(api.items()).toHaveLength(2);
  });

  if (t === 'focus') {
    it('15. Cart Focus has no line selection outside an item mode: + / Delete use the last entered line', async () => {
      const api = await setup(t);
      await scan(WIDGET);
      await scan(GADGET);
      await click(screen.getAllByText('Widget')[0]);
      expect(api.selected()).toBeNull();
      await press('+');
      await settleHotkey();
      expect(qtyOf(api, 'p2')).toBe(2);
      expect(qtyOf(api, 'p1')).toBe(1);
    });
  } else {
    it('15. a selected line overrides the last-entered fallback', async () => {
      const api = await setup(t);
      await scan(WIDGET);
      await scan(GADGET);
      await click(cartRow(t, PRODUCTS[0]));
      expect(api.selected()).toBe('p1');
      await press('+');
      await settleHotkey();
      expect(qtyOf(api, 'p1')).toBe(2);
      expect(qtyOf(api, 'p2')).toBe(1);
    });

    it('16. Delete removes the selected line through the guarded remove', async () => {
      const api = await setup(t);
      await scan(WIDGET);
      await scan(GADGET);
      await click(cartRow(t, PRODUCTS[0]));
      await press('Delete');
      expect(api.removed.mock.calls).toEqual([['p1']]);
      expect(api.items().map((i) => i.id)).toEqual(['p2']);
    });
  }

  it('17. Delete removes the last entered line through the guarded remove — never the whole bill', async () => {
    const api = await setup(t);
    await scan(GADGET);
    await scan(WIDGET);
    await scan(GADGET); // last entered: Gadget, which is items[1]
    expect(api.items()[0].id).toBe('p1');
    const event = await press('Delete');
    expect(event.defaultPrevented).toBe(true);
    expect(api.removed.mock.calls).toEqual([['p2']]);
    expect(api.items().map((i) => i.id)).toEqual(['p1']);
  });

  it('18. Delete with no target is a safe no-op', async () => {
    const api = await setup(t);
    await press('Delete'); // empty cart
    await scan(WIDGET);
    await press('Delete');
    await press('Delete'); // the last entered line is gone; nothing else is touched
    await press('+');
    await settleHotkey();
    expect(api.removed.mock.calls).toEqual([['p1']]);
    expect(api.quantity).not.toHaveBeenCalled();
    expect(api.items()).toEqual([]);
  });

  it('Delete, + and − in a search with text edit the text, not the cart', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await type('W');
    await press('+');
    await settleHotkey();
    expect(searchBox(t).value).toBe('W+');
    expect(qtyOf(api, 'p1')).toBe(1);
    const del = await press('Delete');
    expect(del.defaultPrevented).toBe(false);
    expect(api.removed).not.toHaveBeenCalled();
  });

  const MODES = [['19', 'F4', 'qty', T.QUANTITY, 'quantity'], ['20', 'F8', 'discount', T.DISCOUNT, 'discount'], ['21', 'F9', 'price', T.PRICE, 'price']];
  it.each(MODES)('%s. %s opens the existing %s entry on the target line, caret in its field', async (_n, k, mode, target, field) => {
    const api = await setup(t);
    await scan(GADGET);
    await scan(WIDGET);
    const event = await press(k);
    expect(event.defaultPrevented).toBe(true);
    if (t === 'compact') {
      // Trade POS edits a line in the Item Entry dialog, opened on the requested field.
      expect(api.edited.mock.calls).toEqual([['p1', { focusField: field }]]);
      return;
    }
    expect(api.selected()).toBe('p1');
    expect(t === 'focus' ? api.posActionMode() : api.classicNumpadMode()).toBe(mode);
    expect(derivedTarget(api)).toBe(target);
    expectFocus(t === 'focus' ? searchBox(t) : screen.getByRole('dialog').querySelector('input'));
  });

  it('22. F10 holds the bill through the existing Hold action, and search has the caret again', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    const event = await press('F10');
    expect(event.defaultPrevented).toBe(true);
    expect(api.held).toHaveBeenCalledTimes(1);
    expect(api.items()).toEqual([]);
    expectFocus(searchBox(t));
    await press('F10'); // empty cart: nothing to hold
    expect(api.held).toHaveBeenCalledTimes(1);
  });

  it('a held key and the browser keys: F-key repeat acts once; F5/F11/F12 and Ctrl+R/W/P are untouched', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await press('F10');
    key('F10', { repeat: true });
    expect(api.held).toHaveBeenCalledTimes(1);
    for (const k of ['F5', 'F11', 'F12']) expect(key(k).defaultPrevented).toBe(false);
    for (const k of ['r', 'w', 'p']) expect(key(k, { ctrlKey: true }).defaultPrevented).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe.each(TEMPLATES)('%s — checkout shortcuts', (_, t) => {
  const openCheckout = async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(1);
    await pastCooldown();
    expect(checkoutOpen()).toBe(true);
    return api;
  };

  it.each([
    ['23', 'c', 'Cash Payment'], ['24', 'd', 'Card Payment'], ['25', 'o', 'Online / Bank Transfer'],
    ['26', 'r', 'Credit Sale'], ['27', 'b', 'Buy Now, Pay Later'],
  ])('%s. %s opens %s, once', async (_n, k, title) => {
    await openCheckout();
    await press(k);
    await settleHotkey();
    expect(screen.getAllByRole('dialog', { name: title })).toHaveLength(1);
  });

  it('28. Cash twice allocates the exact remaining amount and focuses Settle — without settling', async () => {
    const api = await openCheckout();
    advance(TYPE);
    key('c');
    advance(150);
    key('c');
    await flush();
    await settleHotkey();
    expect(api.lines()).toEqual([expect.objectContaining({ paymentType: 'CASH', amount: 10 })]);
    expect(dialog('Cash Payment')).toBeNull();
    expectFocus(settleButton());
    expect(api.settled).not.toHaveBeenCalled();
  });

  it('Cash twice with the modal already up (second C inside the window) also allocates; a later C clears', async () => {
    const api = await openCheckout();
    await press('c');
    await settleHotkey();
    expect(dialog('Cash Payment')).toBeTruthy();
    advance(CASH_DOUBLE_TAP_MS);
    key('c'); // outside the window: the modal's C, clear
    await settleHotkey();
    expect(cashShown()).toBe('0');
    expect(api.lines()).toEqual([]);
  });

  it('29. Ctrl+Enter settles when fully allocated', async () => {
    const api = await openCheckout();
    advance(TYPE);
    key('c');
    advance(150);
    key('c');
    await settleHotkey();
    const event = await press('Enter', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(api.settled).toHaveBeenCalledTimes(1);
    expect(api.settled.mock.calls[0]).toEqual([]); // the Settle button's own call: processPayment()
  });

  it('30. Ctrl+Enter is blocked while the bill is not fully allocated, and does not click the focused tile', async () => {
    const api = await openCheckout();
    const event = await press('Enter', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(api.settled).not.toHaveBeenCalled();
    expect(dialog('Cash Payment')).toBeNull();
    expect(checkoutOpen()).toBe(true);
  });

  it('31. Ctrl+Enter cannot double-settle: rapid presses and key repeat settle once', async () => {
    const api = await openCheckout();
    advance(TYPE);
    key('c');
    advance(150);
    key('c');
    await settleHotkey();
    key('Enter', { ctrlKey: true });
    key('Enter', { ctrlKey: true, repeat: true });
    key('Enter', { ctrlKey: true });
    await flush();
    key('Enter', { ctrlKey: true });
    await flush();
    expect(api.settled).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Enter inside a payment modal does not settle', async () => {
    const api = await openCheckout();
    await press('c');
    await settleHotkey();
    await press('Enter', { ctrlKey: true });
    expect(api.settled).not.toHaveBeenCalled();
  });

  it('33. Esc cancels the payment modal first, then checkout; it never clears the sale', async () => {
    const api = await openCheckout();
    await press('c');
    await settleHotkey();
    expect(dialog('Cash Payment')).toBeTruthy();
    await press('Escape');
    expect(dialog('Cash Payment')).toBeNull();
    expect(checkoutOpen()).toBe(true);
    await press('Escape');
    expect(api.cancelled).toHaveBeenCalledTimes(1);
    expect(checkoutOpen()).toBe(false);
    expect(api.items()).toHaveLength(1);
    expectFocus(searchBox(t));
    await press('Escape'); // in the sale: nothing
    expect(api.items()).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe.each(TEMPLATES)('%s — scanner safety', (_, t) => {
  it.each(['C', 'D', 'O', 'R', 'B'])('34–38. a %s-barcode in the sale is a product scan, not a payment shortcut', async (letter) => {
    const api = await setup(t);
    await scan(`${letter}12345`);
    advance(1000);
    await flush();
    expect(api.added.mock.calls).toEqual([[`${letter}12345`]]);
    expect(checkoutOpen()).toBe(false);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it.each(['C', 'D', 'O', 'R', 'B'])('34–38. a %s-barcode on checkout opens no tender', async (letter) => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(1);
    await pastCooldown();
    await scan(`${letter}12345`);
    await settleHotkey();
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(api.lines()).toEqual([]);
  });

  it('a barcode starting with − is scanned whole, not a quantity change', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await scan('-12345');
    expect(api.scanned).toHaveBeenLastCalledWith('-12345');
    expect(api.added.mock.calls).toEqual([[WIDGET], ['-12345']]);
    expect(api.quantity).not.toHaveBeenCalled();
  });

  it('40. a scanner Enter on the COMPLETE screen does not start a new sale', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(3);
    await pastCooldown();
    await press('Enter', { ctrlKey: true });
    expect(completeOpen()).toBe(true);
    await scan(GADGET);
    advance(1000);
    await flush();
    expect(api.newSale).not.toHaveBeenCalled();
    expect(completeOpen()).toBe(true);
  });

  it('41. a scanner Enter with Settle focused does not settle', async () => {
    const api = await setup(t);
    await scan(WIDGET);
    await enterTaps(3);
    await pastCooldown();
    expectFocus(settleButton());
    await scan(GADGET);
    advance(1000);
    await flush();
    expect(api.settled).not.toHaveBeenCalled();
    expect(checkoutOpen()).toBe(true);
  });

  it('exactly one POS keyboard listener is attached, in the capture phase', async () => {
    const spy = vi.spyOn(window, 'addEventListener');
    await setup(t);
    const keydown = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydown).toHaveLength(1);
    expect(keydown[0][2]).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The real settlement path: Ctrl+Enter → CheckoutPaymentFooter's Settle → useCheckout's
// processPayment, with its synchronous lock and checkoutKey.

const SAVED = { id: 900, invoiceNumber: 'SI-POS-000124', invoiceTotal: 378, customerCode: 'CUST-1' };
const LINES = [createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 378 })];

const checkoutArgs = () => ({
  previewFreeze: { checkoutSettling: false, setCheckoutSettling: vi.fn(), checkoutPreviewFreezeRef: { current: '' } },
  payment: {
    checkoutPayment: { paymentLines: LINES, clearLines: vi.fn() },
    checkoutPaymentFields: buildCheckoutPaymentFields(LINES, { effectiveDue: 378 }),
    checkoutEffectiveDue: 378,
    checkoutCompatibility: { canSettle: true, message: '' },
  },
  cart: {
    currentInvoice: { items: [{ code: 'SKU-1', name: 'Widget', quantity: 2, price: 180, taxRate: 5 }], total: 378, billDiscountAmount: 0 },
    clearInvoice: vi.fn(), setInvoiceCounter: vi.fn(), checkoutThermalHtml: '<html></html>',
  },
  customerCtx: { selectedCustomerData: { id: 'c1', code: 'CUST-1', name: 'Fatima' }, customerOptions: [] },
  sessionCtx: {
    currentSession: { id: 42, branchId: 7 },
    currentTerminal: { terminalId: 'TERM-01', counterName: 'C1', branchId: 7, branchName: 'Main', branchCode: 'MB' },
    posSettings: { taxInclusive: false, taxEnabled: true, branchDefaultVatRate: 5 },
  },
  layaway: { activeLayawayId: null, activeLayawayDeposit: 0, setActiveLayawayId: vi.fn(), setActiveLayawayDeposit: vi.fn() },
  shipping: { shippingCharge: '', shippingAddress: null, deliveryAddress: null, deliveryDriver: '', deliveryNotes: '' },
  printing: {
    buildInvoiceSheetHtml: vi.fn(async () => '<html></html>'), paperForSale: vi.fn(() => '80mm'),
    printThermalReceiptWithConfiguredPrinter: vi.fn(async () => ({ mode: 'agent-escpos' })),
    buildThermalReceiptArtifacts: vi.fn(async () => ({ text: 'R', escPosBase64: 'AAEC' })),
    openCashDrawer: vi.fn(),
  },
  a4Template: {
    tplInvoicePaper: '80mm', tplInvoiceFooter: 'F', tplInvoiceHeader: 'TAX INVOICE', tplReceiptHeader: 'R',
    tplInvoiceShowStamp: false, tplOutletName: 'BB', tplOutletAddress: 'A', tplOutletPhone: 'P',
    tplLogoDataUrl: null, tplStampDataUrl: null, tplInvoiceShowBankDetails: false, effectiveOutletTrn: 'TRN1', company: null,
  },
  errorRouting: { isClosureWorkflowError: vi.fn(() => false), showClosureRequiredBlock: vi.fn(), setShowPaymentDialog: vi.fn(), requestApproval: vi.fn() },
  posReset: { syncPosData: vi.fn(), setReceivedAmount: vi.fn(), setSelectedCardType: vi.fn(), setSelectedCreditCustomer: vi.fn(), setLastScannedItem: vi.fn() },
});

function SettleHarness({ args, canSettle = true }) {
  const registry = usePosInputController({ enabled: true, focusEnabled: true, overlays: { [POS_OVERLAY_IDS.CHECKOUT]: true } });
  const { processPayment, checkoutLoading } = useCheckout(args);
  return (
    <PosOverlayProvider registry={registry}>
      <div className="fixed inset-0">
        <CheckoutPaymentFooter
          changeDue={0} checkoutError={null} canSettle={canSettle} itemCount={1}
          checkoutLoading={checkoutLoading} effectiveDue={378}
          onCancel={() => {}} onSettle={() => processPayment()}
        />
      </div>
    </PosOverlayProvider>
  );
}

describe('settlement through useCheckout', () => {
  const chord = () => key('Enter', { ctrlKey: true });
  const keyOf = (call) => posCheckout.mock.calls[call][0].checkoutKey;

  it('31/32. Ctrl+Enter pressed twice in one tick posts exactly one checkout, carrying a checkoutKey', async () => {
    posCheckout.mockResolvedValue(SAVED);
    render(<SettleHarness args={checkoutArgs()} />);
    await flush();
    chord();
    chord();
    await flush();
    expect(posCheckout).toHaveBeenCalledTimes(1);
    expect(typeof keyOf(0)).toBe('string');
    expect(keyOf(0).length).toBeGreaterThan(0);
  });

  it('32. a Ctrl+Enter retry after an unconfirmed failure reuses the same checkoutKey', async () => {
    posCheckout.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValue(SAVED);
    render(<SettleHarness args={checkoutArgs()} />);
    await flush();
    chord();
    await flush();
    await flush();
    chord();
    await flush();
    expect(posCheckout).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('30. Ctrl+Enter never reaches processPayment while Settle is disabled', async () => {
    render(<SettleHarness args={checkoutArgs()} canSettle={false} />);
    await flush();
    chord();
    await flush();
    expect(posCheckout).not.toHaveBeenCalled();
  });
});
