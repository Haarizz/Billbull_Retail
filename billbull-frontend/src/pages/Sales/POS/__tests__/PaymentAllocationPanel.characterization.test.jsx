import fs from 'node:fs';
import path from 'node:path';
import { createElement, memo } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Characterization of POS/payments/PaymentAllocationPanel as it exists today — NOT an
 * extraction. The panel is already a module-level default export in its own file; POSSales
 * mounts it at three call sites (checkout, save-layaway deposit, delivery settlement).
 *
 * The six payment modals are replaced by prop-capturing spies so the panel's own contract —
 * which modal opens, what it is handed, and what the panel does with the result — is pinned
 * without re-testing the modals themselves.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - `selectedCustomerName` is accepted but never read or forwarded by the panel.
 *   - `compatibility` only drives the banner; it never disables method tiles or hotkeys.
 *   - A VOUCHER in `methods` is still not offered (METHODS marks it hidden).
 *   - `remainingBalance` used for chaining is the render-time prop, not the post-add balance.
 *   - Hotkeys listen on window, ignore INPUT/TEXTAREA/SELECT targets but not contentEditable,
 *     and never stopPropagation.
 */

const modalSpy = vi.hoisted(() => ({ calls: [] }));

vi.mock('../payments/modals/CashPaymentModal', () => ({ default: (p) => { modalSpy.calls.push({ name: 'CashPaymentModal', props: p }); return <div data-testid="modal">CashPaymentModal</div>; } }));
vi.mock('../payments/modals/CardPaymentModal', () => ({ default: (p) => { modalSpy.calls.push({ name: 'CardPaymentModal', props: p }); return <div data-testid="modal">CardPaymentModal</div>; } }));
vi.mock('../payments/modals/OnlinePaymentModal', () => ({ default: (p) => { modalSpy.calls.push({ name: 'OnlinePaymentModal', props: p }); return <div data-testid="modal">OnlinePaymentModal</div>; } }));
vi.mock('../payments/modals/CreditPaymentModal', () => ({ default: (p) => { modalSpy.calls.push({ name: 'CreditPaymentModal', props: p }); return <div data-testid="modal">CreditPaymentModal</div>; } }));
vi.mock('../payments/modals/VoucherPaymentModal', () => ({ default: (p) => { modalSpy.calls.push({ name: 'VoucherPaymentModal', props: p }); return <div data-testid="modal">VoucherPaymentModal</div>; } }));
vi.mock('../payments/modals/BnplPaymentModal', () => ({ default: (p) => { modalSpy.calls.push({ name: 'BnplPaymentModal', props: p }); return <div data-testid="modal">BnplPaymentModal</div>; } }));

import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';

// ── fixtures ────────────────────────────────────────────────────────────────────────────
const makePayment = (overrides = {}) => ({
  paymentLines: [],
  invoiceTotal: 100,
  remainingBalance: 100,
  changeAmount: 0,
  totalAllocated: 0,
  totalCredit: 0,
  paymentSummary: null,
  lineErrors: {},
  isOverAllocated: false,
  canSettle: false,
  addLine: vi.fn(),
  updateLine: vi.fn(),
  removeLine: vi.fn(),
  ...overrides,
});

const renderPanel = (props = {}) => {
  const payment = props.payment || makePayment();
  const view = render(<PaymentAllocationPanel {...props} payment={payment} />);
  return { ...view, payment };
};

const methodBar = () => screen.getByText('Add Payment').parentElement.nextElementSibling;
const methodButtons = () => within(methodBar()).queryAllByRole('button');
const methodLabels = () => methodButtons().map((b) => b.lastElementChild.textContent);
const modalText = () => screen.queryByTestId('modal')?.textContent ?? null;
const lastModal = (name) => {
  const hits = modalSpy.calls.filter((c) => !name || c.name === name);
  return hits[hits.length - 1]?.props;
};
const clickMethod = (label) => fireEvent.click(methodButtons().find((b) => b.lastElementChild.textContent === label));
const key = (k, init = {}, target = window) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(event); });
  return event;
};
const remainingBox = () => screen.getByText(/^(Fully Allocated|Remaining To Allocate)$/).closest('div.rounded-2xl');

let rafCallbacks;
beforeEach(() => {
  modalSpy.calls = [];
  rafCallbacks = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafCallbacks.push(cb); return rafCallbacks.length; });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const flushRaf = () => act(() => { rafCallbacks.splice(0).forEach((cb) => cb(0)); });

// ── 1. props / defaults ─────────────────────────────────────────────────────────────────
describe('1. props and defaults', () => {
  it('renders with only `payment`; every other prop has a default', () => {
    renderPanel();
    expect(methodLabels()).toEqual(['Cash', 'Card', 'Online', 'Credit', 'BNPL']);
    expect(screen.queryByText('Cannot take payment on this terminal')).toBeNull();
  });

  it('destructures exactly ten props with the current defaults (source)', () => {
    expect(PANEL).toContain([
      'export default function PaymentAllocationPanel({',
      '  payment,',
      '  compatibility = null,',
      '  customers = [],',
      '  selectedCustomerId = null,',
      '  selectedCustomerName = null,',
      '  bankAccounts = [],',
      '  bankAccountsLoading = false,',
      '  methods = null,',
      '  compact = false,',
      '  onCustomerCreated = null,',
      '}) {',
    ].join('\n'));
  });

  it('selectedCustomerName is accepted but never read or forwarded', () => {
    expect(PANEL.match(/\bselectedCustomerName\b/g)).toHaveLength(1);
    renderPanel({ selectedCustomerName: 'Jane Doe' });
    expect(screen.queryByText(/Jane Doe/)).toBeNull();
    clickMethod('Credit');
    expect(lastModal()).not.toHaveProperty('selectedCustomerName');
    expect(Object.values(lastModal())).not.toContain('Jane Doe');
  });

  it('throws without a payment manager (no default)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<PaymentAllocationPanel />)).toThrow();
  });
});

// ── 2. method bar ───────────────────────────────────────────────────────────────────────
describe('2. method bar', () => {
  it('header copy and hotkey badges', () => {
    renderPanel();
    expect(screen.getByText('Add Payment')).toBeTruthy();
    expect(screen.getByText('Press the highlighted key')).toBeTruthy();
    expect(methodButtons().map((b) => b.firstElementChild.textContent)).toEqual(['c', 'd', 'o', 'r', 'b']);
    methodButtons().forEach((b) => {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.disabled).toBe(false);
    });
  });

  it('one grid row sized to the offered count, minimum one column', () => {
    const { rerender, payment } = renderPanel();
    expect(methodBar().style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
    rerender(<PaymentAllocationPanel payment={payment} methods={[]} />);
    expect(methodButtons()).toHaveLength(0);
    expect(methodBar().style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
  });

  it('`methods` filters but keeps METHODS order; VOUCHER stays hidden even when requested; unknown types ignored', () => {
    renderPanel({ methods: ['ONLINE', 'VOUCHER', 'CASH', 'NOPE'] });
    expect(methodLabels()).toEqual(['Cash', 'Online']);
  });

  it('the delivery/layaway set (CASH, CARD, ONLINE) offers three tiles', () => {
    renderPanel({ methods: ['CASH', 'CARD', 'ONLINE'] });
    expect(methodLabels()).toEqual(['Cash', 'Card', 'Online']);
  });

  it('tiles swap inline border/background on hover and restore on leave', () => {
    renderPanel();
    const cash = methodButtons()[0];
    const initialBorder = cash.style.borderColor;
    fireEvent.mouseEnter(cash);
    expect(cash.style.borderColor).not.toBe(initialBorder);
    expect(cash.style.backgroundColor).not.toBe('');
    fireEvent.mouseLeave(cash);
    expect(cash.style.borderColor).toBe(initialBorder);
    expect(cash.style.backgroundColor).toBe('');
  });
});

// ── 3. compatibility ────────────────────────────────────────────────────────────────────
describe('3. compatibility banner', () => {
  it.each([[null], [{ status: 'supported', message: 'ignored', retry: () => {} }]])('no banner for %j', (compatibility) => {
    renderPanel({ compatibility });
    expect(screen.queryByText('Verifying server compatibility…')).toBeNull();
    expect(screen.queryByText('Cannot take payment on this terminal')).toBeNull();
  });

  it('checking: spinner copy, no Retry, message still shown', () => {
    renderPanel({ compatibility: { status: 'checking', message: 'hold on', retry: vi.fn() } });
    expect(screen.getByText('Verifying server compatibility…')).toBeTruthy();
    expect(screen.getByText('hold on')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it.each(['unsupported', 'unknown', 'anything-else'])('%s: blocking copy, message and Retry → compatibility.retry', (status) => {
    const retry = vi.fn();
    renderPanel({ compatibility: { status, message: 'server too old', retry } });
    expect(screen.getByText('Cannot take payment on this terminal')).toBeTruthy();
    expect(screen.getByText('server too old')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('no message row when message is empty', () => {
    const { container } = renderPanel({ compatibility: { status: 'unsupported', message: null, retry: vi.fn() } });
    expect(container.querySelector('p.text-xs.text-red-700')).toBeNull();
  });

  it('does NOT disable tiles or hotkeys while blocked or checking', () => {
    renderPanel({ compatibility: { status: 'unsupported', message: null, retry: vi.fn() } });
    expect(methodButtons().every((b) => !b.disabled)).toBe(true);
    key('c');
    expect(modalText()).toBe('CashPaymentModal');
  });

  it('banner is the first child, before the method card', () => {
    const { container } = renderPanel({ compatibility: { status: 'checking', message: null } });
    expect(container.firstElementChild.className).toBe('space-y-3');
    expect(container.firstElementChild.firstElementChild.textContent).toContain('Verifying server compatibility…');
  });
});

// ── 4. remaining / progress / summary ──────────────────────────────────────────────────
describe('4. remaining box', () => {
  it('unsettled: amber, label, toFixed(2) figures', () => {
    renderPanel({ payment: makePayment({ invoiceTotal: 100, remainingBalance: 60.5, totalAllocated: 39.5 }) });
    const box = remainingBox();
    expect(box.className).toContain('border-[#F5C742]');
    expect(screen.getByText('Remaining To Allocate')).toBeTruthy();
    expect(box.querySelector('p.text-3xl').textContent).toContain('60.50');
    expect(box.querySelector('p.text-right').textContent).toBe('39.50 / 100.00');
    expect(box.querySelector('.h-full').style.width).toBe('39.5%');
  });

  it('settled needs canSettle AND at least one line', () => {
    const { rerender } = renderPanel({ payment: makePayment({ canSettle: true }) });
    expect(screen.getByText('Remaining To Allocate')).toBeTruthy();
    rerender(<PaymentAllocationPanel payment={makePayment({ canSettle: true, remainingBalance: 0, totalAllocated: 100, paymentLines: [{ id: 'a', paymentType: 'CASH', amount: 100 }] })} />);
    expect(screen.getByText('Fully Allocated')).toBeTruthy();
    expect(remainingBox().className).toContain('border-green-300');
    expect(remainingBox().querySelector('.h-full').className).toContain('bg-green-500');
  });

  it('over-allocated (not settled): red', () => {
    renderPanel({ payment: makePayment({ isOverAllocated: true, remainingBalance: -5, totalAllocated: 105 }) });
    expect(remainingBox().className).toContain('border-red-300');
    expect(remainingBox().querySelector('p.text-3xl').className).toContain('text-red-600');
    expect(remainingBox().querySelector('p.text-3xl').textContent).toContain('-5.00');
    expect(remainingBox().querySelector('.h-full').style.width).toBe('100%');
  });

  it('progress is 100% when invoiceTotal is 0 or negative', () => {
    renderPanel({ payment: makePayment({ invoiceTotal: 0, remainingBalance: 0 }) });
    expect(remainingBox().querySelector('.h-full').style.width).toBe('100%');
  });

  it('summary rows; credit and change rows only when positive; payment summary line', () => {
    const { rerender } = renderPanel();
    const labels = () => [...remainingBox().querySelectorAll('dt')].map((d) => d.textContent);
    expect(labels()).toEqual(['Amount Due', 'Allocated', 'Remaining']);
    expect(screen.queryByText('Payment Summary')).toBeNull();
    rerender(<PaymentAllocationPanel payment={makePayment({ totalCredit: 20, changeAmount: 3, paymentSummary: 'Cash + Credit' })} />);
    expect(labels()).toEqual(['Amount Due', 'Allocated', 'Remaining', 'Transferred to Accounts Receivable', 'Change to Return']);
    expect(screen.getByText('Payment Summary').nextElementSibling.textContent).toBe('Cash + Credit');
  });

  it('compact only hides the <dl> below sm', () => {
    const { rerender, payment } = renderPanel();
    expect(remainingBox().querySelector('dl').className).toBe('mt-3 space-y-1 text-sm ');
    rerender(<PaymentAllocationPanel payment={payment} compact />);
    expect(remainingBox().querySelector('dl').className).toBe('mt-3 space-y-1 text-sm hidden sm:block');
  });
});

// ── 5. allocation list ──────────────────────────────────────────────────────────────────
describe('5. payment entries', () => {
  it('empty state', () => {
    renderPanel();
    expect(screen.getByText('Payment Entries')).toBeTruthy();
    expect(screen.getByText('No payments added yet')).toBeTruthy();
  });

  it('Remove calls payment.removeLine(id) directly, opening nothing', () => {
    const line = { id: 'l1', paymentType: 'CARD', amount: 30 };
    const { payment } = renderPanel({ payment: makePayment({ paymentLines: [line] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove allocation' }));
    expect(payment.removeLine).toHaveBeenCalledWith('l1');
    expect(modalText()).toBeNull();
  });

  it('Edit opens the line type modal with editingLine = the line', () => {
    const line = { id: 'l1', paymentType: 'ONLINE', amount: 30 };
    renderPanel({ payment: makePayment({ paymentLines: [line] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    expect(modalText()).toBe('OnlinePaymentModal');
    expect(lastModal().editingLine).toBe(line);
  });

  it('editing a line whose type is not offered still opens its modal (VOUCHER)', () => {
    const line = { id: 'v1', paymentType: 'VOUCHER', amount: 10 };
    renderPanel({ payment: makePayment({ paymentLines: [line] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    expect(modalText()).toBe('VoucherPaymentModal');
  });
});

// ── 6. modal props / bank accounts / customers ─────────────────────────────────────────
describe('6. modal forwarding', () => {
  const customers = [{ id: 'walk-in' }, { id: 'c1' }];
  const bankAccounts = [{ id: 'b1' }];
  const onCustomerCreated = vi.fn();
  const full = { customers, bankAccounts, bankAccountsLoading: true, selectedCustomerId: 'c1', onCustomerCreated, selectedCustomerName: 'X' };

  it.each([
    ['Cash', 'CashPaymentModal', ['remaining', 'editingLine', 'offeredTypes', 'onConfirm', 'onCancel']],
    ['Card', 'CardPaymentModal', ['remaining', 'editingLine', 'offeredTypes', 'onConfirm', 'onCancel']],
    ['Online', 'OnlinePaymentModal', ['remaining', 'editingLine', 'offeredTypes', 'onConfirm', 'onCancel', 'bankAccounts', 'bankAccountsLoading']],
    ['Credit', 'CreditPaymentModal', ['remaining', 'editingLine', 'offeredTypes', 'onConfirm', 'onCancel', 'customers', 'defaultCustomerId', 'bankAccounts', 'bankAccountsLoading', 'onCustomerCreated']],
    ['BNPL', 'BnplPaymentModal', ['remaining', 'editingLine', 'offeredTypes', 'onConfirm', 'onCancel', 'customers', 'selectedCustomerId', 'onCustomerCreated']],
  ])('%s → %s with exactly these props', (label, name, keys) => {
    renderPanel({ ...full, payment: makePayment({ remainingBalance: 42 }) });
    clickMethod(label);
    expect(modalText()).toBe(name);
    expect(screen.getAllByTestId('modal')).toHaveLength(1);
    const p = lastModal(name);
    expect(Object.keys(p)).toEqual(keys);
    expect(p.remaining).toBe(42);
    expect(p.editingLine).toBeNull();
    expect(p.offeredTypes).toEqual(['CASH', 'CARD', 'ONLINE', 'CREDIT', 'BNPL']);
    if ('bankAccounts' in p) { expect(p.bankAccounts).toBe(bankAccounts); expect(p.bankAccountsLoading).toBe(true); }
    if ('customers' in p) { expect(p.customers).toBe(customers); expect(p.onCustomerCreated).toBe(onCustomerCreated); }
    if ('defaultCustomerId' in p) expect(p.defaultCustomerId).toBe('c1');
    if ('selectedCustomerId' in p) expect(p.selectedCustomerId).toBe('c1');
  });

  it('defaults reach the modals: [] bank accounts, false loading, [] customers, null ids/callback', () => {
    renderPanel();
    clickMethod('Credit');
    const p = lastModal('CreditPaymentModal');
    expect(p.bankAccounts).toEqual([]);
    expect(p.bankAccountsLoading).toBe(false);
    expect(p.customers).toEqual([]);
    expect(p.defaultCustomerId).toBeNull();
    expect(p.onCustomerCreated).toBeNull();
  });

  it('bank-account loading/empty state is rendered by the modal only; the panel shows nothing', () => {
    renderPanel({ bankAccountsLoading: true, bankAccounts: [] });
    expect(screen.queryByText(/bank|loading/i)).toBeNull();
  });

  it('customer creation is a pass-through: the modal calls the parent callback untouched, the panel stays open', () => {
    const created = vi.fn();
    renderPanel({ onCustomerCreated: created });
    clickMethod('BNPL');
    act(() => { lastModal().onCustomerCreated({ id: 'new' }); });
    expect(created).toHaveBeenCalledWith({ id: 'new' });
    expect(modalText()).toBe('BnplPaymentModal');
  });

  it('offeredTypes follows `methods`', () => {
    renderPanel({ methods: ['CASH', 'CARD', 'ONLINE'] });
    clickMethod('Card');
    expect(lastModal().offeredTypes).toEqual(['CASH', 'CARD', 'ONLINE']);
  });
});

// ── 7. hotkeys ──────────────────────────────────────────────────────────────────────────
describe('7. keyboard', () => {
  it.each([['c', 'CashPaymentModal'], ['d', 'CardPaymentModal'], ['o', 'OnlinePaymentModal'], ['r', 'CreditPaymentModal'], ['b', 'BnplPaymentModal'], ['C', 'CashPaymentModal']])('%s opens %s and preventDefaults', (k, name) => {
    renderPanel();
    const event = key(k);
    expect(modalText()).toBe(name);
    expect(event.defaultPrevented).toBe(true);
  });

  it('v (hidden voucher) and unmapped keys do nothing and are not prevented', () => {
    renderPanel();
    expect(key('v').defaultPrevented).toBe(false);
    expect(key('x').defaultPrevented).toBe(false);
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(modalText()).toBeNull();
  });

  it.each([['ctrlKey'], ['metaKey'], ['altKey']])('%s suppresses the hotkey', (mod) => {
    renderPanel();
    expect(key('c', { [mod]: true }).defaultPrevented).toBe(false);
    expect(modalText()).toBeNull();
  });

  it('shiftKey does not suppress it', () => {
    renderPanel();
    key('C', { shiftKey: true });
    expect(modalText()).toBe('CashPaymentModal');
  });

  it.each(['input', 'textarea', 'select'])('ignored when typing in <%s>', (tag) => {
    renderPanel();
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(key('c', {}, el).defaultPrevented).toBe(false);
    expect(modalText()).toBeNull();
    el.remove();
  });

  it('NOT ignored from contentEditable, buttons or the document body', () => {
    renderPanel();
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    key('d', {}, div);
    expect(modalText()).toBe('CardPaymentModal');
    div.remove();
  });

  it('from a focused method tile the hotkey still fires', () => {
    renderPanel();
    key('o', {}, methodButtons()[0]);
    expect(modalText()).toBe('OnlinePaymentModal');
  });

  it('keys not offered by `methods` are ignored', () => {
    renderPanel({ methods: ['CASH', 'CARD', 'ONLINE'] });
    expect(key('r').defaultPrevented).toBe(false);
    expect(key('b').defaultPrevented).toBe(false);
    expect(modalText()).toBeNull();
  });

  it('no propagation stop: a later window listener still sees the event', () => {
    renderPanel();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    key('c');
    expect(later).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', later);
  });

  it('listener is detached while a modal is open and re-attached after close', () => {
    renderPanel();
    key('c');
    expect(modalText()).toBe('CashPaymentModal');
    expect(key('d').defaultPrevented).toBe(false);
    expect(modalText()).toBe('CashPaymentModal');
    act(() => { lastModal().onCancel(); });
    expect(modalText()).toBeNull();
    key('d');
    expect(modalText()).toBe('CardPaymentModal');
  });

  it('registers on window (not document) and removes the same handler on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const { unmount } = renderPanel();
    const handler = add.mock.calls.filter(([t]) => t === 'keydown').pop()[1];
    expect(docAdd.mock.calls.some(([t]) => t === 'keydown')).toBe(false);
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', handler);
    key('c');
    expect(modalText()).toBeNull();
  });

  it('two mounted panels both respond to one hotkey', () => {
    render(<><PaymentAllocationPanel payment={makePayment()} /><PaymentAllocationPanel payment={makePayment()} /></>);
    key('c');
    expect(screen.getAllByTestId('modal')).toHaveLength(2);
  });
});

// ── 8. close + focus ────────────────────────────────────────────────────────────────────
describe('8. modal close and focus', () => {
  it('onCancel unmounts the modal and focuses the first method tile in the next frame (not synchronously)', () => {
    renderPanel();
    clickMethod('Online');
    act(() => { lastModal().onCancel(); });
    expect(modalText()).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(rafCallbacks).toHaveLength(1);
    flushRaf();
    expect(document.activeElement).toBe(methodButtons()[0]);
  });

  it('focus lands on the first OFFERED tile', () => {
    renderPanel({ methods: ['ONLINE', 'CARD'] });
    clickMethod('Online');
    act(() => { lastModal().onCancel(); });
    flushRaf();
    expect(document.activeElement.lastElementChild.textContent).toBe('Card');
  });

  it('no tiles: the deferred focus is a silent no-op', () => {
    const line = { id: 'l', paymentType: 'CASH', amount: 1 };
    renderPanel({ methods: [], payment: makePayment({ paymentLines: [line] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    act(() => { lastModal().onCancel(); });
    expect(() => flushRaf()).not.toThrow();
  });

  it('unmounted before the frame: the deferred focus is a silent no-op', () => {
    const { unmount } = renderPanel();
    clickMethod('Cash');
    act(() => { lastModal().onCancel(); });
    unmount();
    expect(() => flushRaf()).not.toThrow();
  });

  it('opening a modal does not move focus', () => {
    renderPanel();
    methodButtons()[2].focus();
    clickMethod('Cash');
    expect(document.activeElement).toBe(methodButtons()[2]);
  });
});

// ── 9. confirm ──────────────────────────────────────────────────────────────────────────
describe('9. onConfirm', () => {
  it.each([[null], [undefined], [[]], [[null, false]]])('empty draft %j closes (with deferred focus) and commits nothing', (draft) => {
    const { payment } = renderPanel();
    clickMethod('Cash');
    act(() => { lastModal().onConfirm(draft); });
    expect(modalText()).toBeNull();
    expect(rafCallbacks).toHaveLength(1);
    expect(payment.addLine).not.toHaveBeenCalled();
    expect(payment.updateLine).not.toHaveBeenCalled();
    expect(payment.removeLine).not.toHaveBeenCalled();
  });

  it('partial add appends and chains straight into the next priority tender, without a focus frame', () => {
    const { payment } = renderPanel({ payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('Cash');
    const draft = { paymentType: 'CASH', amount: 40 };
    act(() => { lastModal().onConfirm(draft); });
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toBe(draft);
    expect(modalText()).toBe('CardPaymentModal');
    expect(lastModal().editingLine).toBeNull();
    expect(rafCallbacks).toHaveLength(0);
  });

  it('chaining reads the render-time remainingBalance, not the post-add balance', () => {
    renderPanel({ payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('Cash');
    act(() => { lastModal().onConfirm({ paymentType: 'CASH', amount: 40 }); });
    expect(lastModal().remaining).toBe(100);
    act(() => { lastModal().onConfirm({ paymentType: 'CARD', amount: 60 }); });
    // target 100 - 60 = 40 still owed → chains again, to CASH (first priority not CARD)
    expect(modalText()).toBe('CashPaymentModal');
  });

  it('a full allocation closes', () => {
    renderPanel({ payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('Card');
    act(() => { lastModal().onConfirm({ paymentType: 'CARD', amount: 100 }); });
    expect(modalText()).toBeNull();
    expect(rafCallbacks).toHaveLength(1);
  });

  it('over-tendered cash closes (clamped, no chain)', () => {
    renderPanel({ payment: makePayment({ remainingBalance: 50 }) });
    clickMethod('Cash');
    act(() => { lastModal().onConfirm({ paymentType: 'CASH', amount: 200 }); });
    expect(modalText()).toBeNull();
  });

  it('non-numeric amounts count as 0 toward chaining', () => {
    renderPanel({ payment: makePayment({ remainingBalance: 10 }) });
    clickMethod('Cash');
    act(() => { lastModal().onConfirm({ paymentType: 'CASH', amount: 'abc' }); });
    expect(modalText()).toBe('CardPaymentModal');
  });

  it('chain skips tenders not offered; nothing left to suggest closes', () => {
    renderPanel({ methods: ['CASH', 'ONLINE'], payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('Cash');
    act(() => { lastModal().onConfirm({ paymentType: 'CASH', amount: 10 }); });
    expect(modalText()).toBe('OnlinePaymentModal');
    cleanup();
    renderPanel({ methods: ['ONLINE'], payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('Online');
    act(() => { lastModal().onConfirm({ paymentType: 'ONLINE', amount: 10 }); });
    expect(modalText()).toBeNull();
  });

  it('BNPL partial chains to CASH (BNPL is not in the priority list)', () => {
    renderPanel({ payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('BNPL');
    act(() => { lastModal().onConfirm({ paymentType: 'BNPL', amount: 10 }); });
    expect(modalText()).toBe('CashPaymentModal');
  });

  it('array drafts append in order; chaining uses the LAST draft type and the summed amount', () => {
    const { payment } = renderPanel({ payment: makePayment({ remainingBalance: 100 }) });
    clickMethod('Credit');
    const a = { paymentType: 'CASH', amount: 30 };
    const b = { paymentType: 'CREDIT', amount: 20 };
    act(() => { lastModal().onConfirm([a, null, b]); });
    expect(payment.addLine.mock.calls.map((c) => c[0])).toEqual([a, b]);
    // 50 still owed, last type CREDIT → CASH
    expect(modalText()).toBe('CashPaymentModal');
  });

  it('edit with a same-type draft: updateLine(id, draft) first, others appended, never chains', () => {
    const line = { id: 'L1', paymentType: 'CREDIT', amount: 50 };
    const order = [];
    const payment = makePayment({
      paymentLines: [line], remainingBalance: 50,
      updateLine: vi.fn(() => order.push('update')), addLine: vi.fn(() => order.push('add')), removeLine: vi.fn(() => order.push('remove')),
    });
    renderPanel({ payment });
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    expect(modalText()).toBe('CreditPaymentModal');
    const cash = { paymentType: 'CASH', amount: 5 };
    const credit = { paymentType: 'CREDIT', amount: 10 };
    act(() => { lastModal().onConfirm([cash, credit]); });
    expect(payment.updateLine).toHaveBeenCalledWith('L1', credit);
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toBe(cash);
    expect(payment.removeLine).not.toHaveBeenCalled();
    expect(order).toEqual(['update', 'add']);
    expect(modalText()).toBeNull();
    expect(rafCallbacks).toHaveLength(1);
  });

  it('edit with no same-type draft: removeLine(id) first, then appends', () => {
    const line = { id: 'L1', paymentType: 'CREDIT', amount: 50 };
    const order = [];
    const payment = makePayment({ paymentLines: [line], addLine: vi.fn(() => order.push('add')), removeLine: vi.fn(() => order.push('remove')) });
    renderPanel({ payment });
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    act(() => { lastModal().onConfirm({ paymentType: 'CASH', amount: 50 }); });
    expect(payment.removeLine).toHaveBeenCalledWith('L1');
    expect(payment.updateLine).not.toHaveBeenCalled();
    expect(order).toEqual(['remove', 'add']);
  });

  it('only the first same-type draft replaces; a duplicate same-type draft is appended', () => {
    const line = { id: 'L1', paymentType: 'CASH', amount: 10 };
    const payment = makePayment({ paymentLines: [line] });
    renderPanel({ payment });
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    const first = { paymentType: 'CASH', amount: 1 };
    const second = { paymentType: 'CASH', amount: 2 };
    act(() => { lastModal().onConfirm([first, second]); });
    expect(payment.updateLine).toHaveBeenCalledWith('L1', first);
    expect(payment.addLine.mock.calls.map((c) => c[0])).toEqual([second]);
  });
});

// ── 10. identity ────────────────────────────────────────────────────────────────────────
describe('10. render identity', () => {
  it('module-level plain function component, not memo/forwardRef', () => {
    expect(typeof PaymentAllocationPanel).toBe('function');
    expect(PaymentAllocationPanel.$$typeof).toBeUndefined();
    expect(PaymentAllocationPanel.name).toBe('PaymentAllocationPanel');
    expect(PANEL).not.toMatch(/\bmemo\(|forwardRef|createPortal|useContext|useImperativeHandle/);
  });

  it('the only state is activeModal and the only ref is methodBarRef (source)', () => {
    expect(PANEL.match(/useState\(/g)).toHaveLength(1);
    expect(PANEL).toContain('  const [activeModal, setActiveModal] = useState(null);');
    expect(PANEL.match(/useRef\(/g)).toHaveLength(1);
    expect(PANEL).toContain('  const methodBarRef = useRef(null);');
    expect(PANEL.match(/useEffect\(/g)).toHaveLength(1);
    expect(PANEL).toContain("    window.addEventListener('keydown', onKey);\n    return () => window.removeEventListener('keydown', onKey);\n  }, [activeModal, openAdd, offeredMethods]);");
  });

  it('an open modal survives a parent re-render with a NEW payment object and new arrays', () => {
    const { rerender } = renderPanel();
    clickMethod('Online');
    const tiles = methodButtons();
    rerender(<PaymentAllocationPanel payment={makePayment({ remainingBalance: 7 })} bankAccounts={[{ id: 'z' }]} customers={[]} />);
    expect(modalText()).toBe('OnlinePaymentModal');
    expect(lastModal().remaining).toBe(7);
    expect(lastModal().bankAccounts).toEqual([{ id: 'z' }]);
    expect(methodButtons()[0]).toBe(tiles[0]);
  });

  it('an inline wrapper re-created per parent render remounts the panel and drops the open modal', () => {
    // A fresh wrapper function type on every parent render — the anti-pattern this test pins.
    const makeInline = () => (p) => <PaymentAllocationPanel {...p} />;
    const parent = ({ tick }) => createElement(makeInline(), { payment: makePayment(), 'data-tick': tick });
    const { rerender } = render(createElement(parent, { tick: 1 }));
    clickMethod('Cash');
    expect(modalText()).toBe('CashPaymentModal');
    rerender(createElement(parent, { tick: 2 }));
    expect(modalText()).toBeNull();
  });

  it('memo() wrapping keeps state but does not skip renders when payment is a new object', () => {
    const memoPanel = memo(PaymentAllocationPanel);
    const { rerender } = render(createElement(memoPanel, { payment: makePayment() }));
    clickMethod('Card');
    const before = modalSpy.calls.length;
    rerender(createElement(memoPanel, { payment: makePayment() }));
    expect(modalText()).toBe('CardPaymentModal');
    expect(modalSpy.calls.length).toBeGreaterThan(before);
  });

  it('two instances own independent activeModal state', () => {
    render(<><div data-testid="a"><PaymentAllocationPanel payment={makePayment()} /></div><div data-testid="b"><PaymentAllocationPanel payment={makePayment()} /></div></>);
    fireEvent.click(within(screen.getByTestId('a')).getByText('Credit').closest('button'));
    expect(within(screen.getByTestId('a')).getByTestId('modal').textContent).toBe('CreditPaymentModal');
    expect(within(screen.getByTestId('b')).queryByTestId('modal')).toBeNull();
  });

  it('modals render inline as the last children of the panel root (no portal)', () => {
    const { container } = renderPanel();
    clickMethod('Cash');
    expect(container.firstElementChild.lastElementChild).toBe(screen.getByTestId('modal'));
  });
});

// ── 11. POSSales integration (source) ───────────────────────────────────────────────────
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const PANEL = readSource('../payments/PaymentAllocationPanel.jsx');
const POS_SALES = readSource('../../POSSales.jsx');
const count = (src, needle) => src.split(needle).length - 1;

const CHECKOUT_CALL = [
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

const LAYAWAY_CALL = [
  '                          <PaymentAllocationPanel',
  '                            payment={saveLayawayPayment}',
  '                            compatibility={checkoutCompatibility}',
  '                            bankAccounts={checkoutOnlineBankAccounts}',
  '                            bankAccountsLoading={checkoutOnlineBankAccountsLoading}',
  '                            selectedCustomerName={selectedCustomerData?.name}',
  '                            methods={DELIVERY_SETTLE_METHODS}',
  '                            compact',
  '                          />',
].join('\n');

const DELIVERY_CALL = [
  '                                <PaymentAllocationPanel',
  '                                  payment={deliverySettlePayment}',
  '                                  compatibility={checkoutCompatibility}',
  '                                  bankAccounts={checkoutOnlineBankAccounts}',
  '                                  bankAccountsLoading={checkoutOnlineBankAccountsLoading}',
  '                                  selectedCustomerName={o.customer}',
  '                                  methods={DELIVERY_SETTLE_METHODS}',
  '                                  compact',
  '                                />',
].join('\n');

describe('11. POSSales call sites (source)', () => {
  it('imported once, as the default export of the payments module', () => {
    expect(count(POS_SALES, "import PaymentAllocationPanel from './POS/payments/PaymentAllocationPanel';\n")).toBe(1);
    expect(POS_SALES.match(/\bPaymentAllocationPanel\b/g)).toHaveLength(6); // import binding + import path + comment + 3 JSX
  });

  it('exactly three JSX mounts, each byte-for-byte, in checkout → layaway → delivery order', () => {
    expect(count(POS_SALES, '<PaymentAllocationPanel')).toBe(3);
    expect(count(POS_SALES, CHECKOUT_CALL)).toBe(1);
    expect(count(POS_SALES, LAYAWAY_CALL)).toBe(1);
    expect(count(POS_SALES, DELIVERY_CALL)).toBe(1);
    expect(POS_SALES.indexOf(CHECKOUT_CALL)).toBeLessThan(POS_SALES.indexOf(LAYAWAY_CALL));
    expect(POS_SALES.indexOf(LAYAWAY_CALL)).toBeLessThan(POS_SALES.indexOf(DELIVERY_CALL));
  });

  it('checkout mount: after the settlement-summary guard, before Remarks, inside the p-4 scroll body', () => {
    const i = POS_SALES.indexOf(CHECKOUT_CALL);
    const before = POS_SALES.slice(0, i);
    expect(before.endsWith([
      '                  {/* ══ Progressive Payment Allocation ══════════════════════',
      '                      Pick a method, enter an amount, confirm — repeat until Remaining',
      '                      reaches zero. There is no "Mixed" mode: a sale settled two ways is',
      '                      simply a sale with two allocations. */}',
      '',
    ].join('\n'))).toBe(true);
    expect(before.lastIndexOf('<CheckoutSettlementSummary')).toBeGreaterThan(before.lastIndexOf('<div className="p-4 space-y-3">'));
    expect(POS_SALES.slice(i + CHECKOUT_CALL.length)).toMatch(/^\n\n\n {18}\{\/\* ── Remarks ── \*\/\}\n {18}<CheckoutRemarks\n/);
  });

  it('checkout mount passes the eight props (no methods, no compact)', () => {
    const attrs = CHECKOUT_CALL.split('\n').slice(1, -1).map((l) => l.trim().split('=')[0]);
    expect(attrs).toEqual(['payment', 'compatibility', 'customers', 'onCustomerCreated', 'selectedCustomerId', 'selectedCustomerName', 'bankAccounts', 'bankAccountsLoading']);
  });

  it('no inline wrapper, local alias, memo or lazy around the panel in POSSales', () => {
    expect(POS_SALES).not.toMatch(/(const|let|function)\s+PaymentAllocationPanel\b/);
    expect(POS_SALES).not.toMatch(/(memo|lazy|useMemo|useCallback)\(\s*\(?[^)]*PaymentAllocationPanel/);
    expect(POS_SALES).not.toMatch(/=\s*PaymentAllocationPanel\b/);
  });

  it('every call-site identifier is parent-owned state/memo/callback declared in POSSales or its imports', () => {
    expect(count(POS_SALES, '  const [checkoutOnlineBankAccounts, setCheckoutOnlineBankAccounts] = useState([]);')).toBe(1);
    expect(count(POS_SALES, '  const [checkoutOnlineBankAccountsLoading, setCheckoutOnlineBankAccountsLoading] = useState(false);')).toBe(1);
    expect(count(POS_SALES, '  const customerOptions = useMemo(() => [WALK_IN_CUSTOMER, ...posCustomers], [posCustomers]);')).toBe(1);
    expect(count(POS_SALES, '  const checkoutCompatibility = useCheckoutCapabilities(showPaymentDialog || showSaveLayaway);')).toBe(1);
    expect(count(POS_SALES, '  const loadPosCustomers = useCallback(async () => {')).toBe(1);
    expect(POS_SALES).toMatch(/import \{[^}]*\bDELIVERY_SETTLE_METHODS\b[^}]*\} from '[^']*deliveryConstants'/);
    for (const id of ['checkoutPayment', 'saveLayawayPayment', 'deliverySettlePayment', 'selectedCustomer', 'selectedCustomerData']) {
      expect(POS_SALES, id).toMatch(new RegExp(`\\b${id}\\b[^\\n]*=`));
    }
  });

  it('the panel reads nothing from POSSales scope: its only imports are payments/POSCurrency/lucide/react', () => {
    const imports = PANEL.match(/^import .* from '([^']+)';$/gm).map((l) => l.match(/from '([^']+)'/)[1]);
    expect(imports).toEqual([
      'react', 'lucide-react', './paymentModel', './paymentFlow', './paymentSelectors', '../POSCurrency',
      './PaymentAllocationList',
      './modals/CashPaymentModal', './modals/CardPaymentModal', './modals/OnlinePaymentModal',
      './modals/CreditPaymentModal', './modals/VoucherPaymentModal', './modals/BnplPaymentModal',
    ]);
  });
});
