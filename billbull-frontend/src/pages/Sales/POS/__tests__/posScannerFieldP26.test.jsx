import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PaymentAllocationPanel from '../payments/PaymentAllocationPanel';
import VoucherPaymentModal from '../payments/modals/VoucherPaymentModal';
import BnplPaymentModal from '../payments/modals/BnplPaymentModal';
import CheckoutRemarks from '../features/checkout/CheckoutRemarks';
import { PosOverlayProvider } from '../input/PosOverlayContext';
import { createPosInputRegistry } from '../input/posInputRegistry';
import { POS_OVERLAY_IDS, POS_SCOPES } from '../input/posScope';
import {
  POS_SCANNER_INPUT_ATTR,
  SCANNER_INPUT_MODES,
  scannerInputModeOf,
  scannerInputProps,
} from '../input/posScannerField';
import { createPosKeyHandler, HOTKEY_SETTLE_MS, usePosInputController } from '../input/usePosInputController';
import { lookupCreditVoucher } from '../../../../api/creditVoucherApi';

vi.mock('../../../../api/creditVoucherApi', () => ({
  lookupCreditVoucher: vi.fn(() => new Promise(() => {})), // the lookup is pending for the test
}));

/**
 * P2.6 — field-level scanner ownership.
 *
 * P2.5 kept a scanner burst off the payment modal's own amount keys, but a text field inside a
 * modal still took every key, so a barcode landing on Credit "Received" became the received
 * amount and its Enter committed the credit sale. A field now gets a scanner burst only if it
 * opted in (posScannerField.js); the default is HUMAN_ONLY. The real controller, checkout panel
 * and payment modals run here; only the clock is the test's.
 *
 * SCAN is a wedge scanner's inter-key gap, TYPE a person's.
 */

vi.setConfig({ testTimeout: 30_000 });

const SCAN = 5;
const TYPE = 180;

const ACCOUNT = { id: 'c9', name: 'Acme Trading', code: 'C9', phone: '0501234567', balance: 0 };

const makePayment = (overrides = {}) => ({
  paymentLines: [], invoiceTotal: 1000, remainingBalance: 1000, changeAmount: 0,
  totalAllocated: 0, totalCredit: 0, paymentSummary: null, lineErrors: {},
  isOverAllocated: false, canSettle: false,
  addLine: vi.fn(), updateLine: vi.fn(), removeLine: vi.fn(),
  ...overrides,
});

/** The checkout overlay as POSSales mounts it: payment panel plus the remarks field. */
const Till = ({ payment, customerId = null, children = null }) => {
  const registry = usePosInputController({ overlays: { [POS_OVERLAY_IDS.CHECKOUT]: true }, enabled: true, focusEnabled: false });
  const [remarks, setRemarks] = useState('');
  return (
    <PosOverlayProvider registry={registry}>
      <div className="fixed inset-0" data-testid="checkout">
        <PaymentAllocationPanel payment={payment} customers={[ACCOUNT]} selectedCustomerId={customerId} />
        <CheckoutRemarks checkoutRemarks={remarks} setCheckoutRemarks={setRemarks} />
      </div>
      {children}
    </PosOverlayProvider>
  );
};

const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
/**
 * One key the way a browser handles it: keydown, then — unless something prevented it — the
 * character lands in the field (the default action a synthetic keydown does not perform).
 */
const key = (el, k, gap = 0) => {
  if (gap) advance(gap);
  const delivered = fireEvent.keyDown(el, { key: k });
  if (delivered && k.length === 1 && 'value' in el && el.tagName !== 'SELECT') {
    fireEvent.change(el, { target: { value: `${el.value}${k}` } });
  }
  return delivered;
};
const typeText = (el, text, gap) => { for (const ch of text) key(el, ch, gap); };
/** A wedge scanner: the characters at scanner speed, then Enter. */
const scanInto = (el, code, gap = SCAN) => {
  typeText(el, code, gap);
  return key(el, 'Enter', gap);
};
const settle = () => advance(HOTKEY_SETTLE_MS + 5);
const dialogs = (title) => screen.queryAllByRole('dialog', { name: title });
const anyDialogTitled = (prefix) => screen.queryAllByRole('dialog')
  .some((d) => (d.getAttribute('aria-label') || '').startsWith(prefix));

/** Opens a payment method the way a cashier does: its hotkey on the checkout screen. */
const open = (hotkey, { customerId = null } = {}) => {
  const payment = makePayment();
  render(<Till payment={payment} customerId={customerId} />);
  key(document.body, hotkey, TYPE);
  settle();
  return payment;
};

/** BNPL reopened for editing starts on its last step, the review with the approval reference. */
const renderBnplReview = (onConfirm = vi.fn()) => render(
  <Till payment={makePayment()}>
    <BnplPaymentModal remaining={1000} customers={[ACCOUNT]} onConfirm={onConfirm} onCancel={vi.fn()}
      editingLine={{
        id: 'l1', paymentType: 'BNPL', amount: 1000, paymentSubtype: 'Tabby', reference: 'TILL-REF-1',
        customerCode: ACCOUNT.code, customerName: ACCOUNT.name,
        metadata: { bnplProviderId: 'tabby', bnplPlanId: 'tabby-4' },
      }} />
  </Till>,
);

const OTHER_METHODS =['Cash Payment', 'Card Payment', 'Online / Bank Transfer', 'Buy Now, Pay Later'];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  lookupCreditVoucher.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── The policy helper ───────────────────────────────────────────────────────────────────
describe('P2.6 policy: scanner input is opt-in per field', () => {
  const field = (attrs = {}, tag = 'input') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  it('default is HUMAN_ONLY', () => {
    expect(scannerInputModeOf(field())).toBe(SCANNER_INPUT_MODES.HUMAN_ONLY);
    expect(scannerInputModeOf(null)).toBe(SCANNER_INPUT_MODES.HUMAN_ONLY);
  });

  it('only the explicit attribute opts a field in', () => {
    expect(scannerInputModeOf(field(scannerInputProps(SCANNER_INPUT_MODES.SCANNER_ALLOWED))))
      .toBe(SCANNER_INPUT_MODES.SCANNER_ALLOWED);
  });

  it.each([
    ['name', { name: 'barcode' }],
    ['placeholder', { placeholder: 'Scan barcode or type code' }],
    ['aria-label', { 'aria-label': 'Voucher code' }],
    ['class', { class: 'scan-input font-mono' }],
    ['an unknown attribute value', { [POS_SCANNER_INPUT_ATTR]: 'yes' }],
  ])('is not inferred from %s', (_label, attrs) => {
    expect(scannerInputModeOf(field(attrs))).toBe(SCANNER_INPUT_MODES.HUMAN_ONLY);
  });

  it('is not inherited from a container', () => {
    const box = field(scannerInputProps(SCANNER_INPUT_MODES.SCANNER_ALLOWED), 'div');
    const input = field();
    box.appendChild(input);
    expect(scannerInputModeOf(input)).toBe(SCANNER_INPUT_MODES.HUMAN_ONLY);
  });
});

// ── The controller, per scope ───────────────────────────────────────────────────────────
describe('P2.6 controller: field ownership in every payment scope', () => {
  /** createPosKeyHandler with the test's clock and timers; the overlay decides the scope. */
  const harness = (scope) => {
    let t = 1_000;
    const timers = [];
    const registry = createPosInputRegistry({ v2: true, focusV2: false });
    registry.register('overlay', 'o', { scope, open: true, suppressScan: true });
    const handler = createPosKeyHandler({
      registry,
      now: () => t,
      isDomBlocked: () => false,
      setTimer: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; },
      clearTimer: () => {},
    });
    const mk = (attrs) => {
      const el = document.createElement('input');
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.body.appendChild(el);
      return el;
    };
    const press = (el, k, gap) => {
      t += gap;
      const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: el });
      handler.onKeyDown(event);
      if (!event.defaultPrevented && k.length === 1) el.value += k;
      return !event.defaultPrevented;
    };
    return {
      human: mk({}),
      scanner: mk(scannerInputProps(SCANNER_INPUT_MODES.SCANNER_ALLOWED)),
      press,
      scan: (el, code) => [...code, 'Enter'].map((k) => press(el, k, SCAN)),
      type: (el, text) => [...text].map((k) => press(el, k, TYPE)),
    };
  };
  afterEach(() => { document.body.innerHTML = ''; });

  const PAYMENT_SCOPES = [POS_SCOPES.PAYMENT, POS_SCOPES.CHECKOUT, POS_SCOPES.LAYAWAY_DEPOSIT, POS_SCOPES.DELIVERY_SETTLEMENT];

  it.each(PAYMENT_SCOPES)('%s: a HUMAN_ONLY field loses the whole burst, its Enter and its first character', (scope) => {
    const h = harness(scope);
    h.human.value = '12';
    const delivered = h.scan(h.human, '6291041500213');
    expect(h.human.value).toBe('12');
    expect(delivered[0]).toBe(true); // the first character could not be told from a person's…
    expect(delivered.slice(1).every((d) => d === false)).toBe(true); // …everything after it is dropped
  });

  it.each(PAYMENT_SCOPES)('%s: a SCANNER_ALLOWED field takes the burst and its Enter', (scope) => {
    const h = harness(scope);
    const delivered = h.scan(h.scanner, 'EDZH-PBCR-8C65');
    expect(h.scanner.value).toBe('EDZH-PBCR-8C65');
    expect(delivered.every(Boolean)).toBe(true);
  });

  it.each(PAYMENT_SCOPES)('%s: a person typing in a HUMAN_ONLY field keeps every key and Enter', (scope) => {
    const h = harness(scope);
    expect(h.type(h.human, '200').every(Boolean)).toBe(true);
    expect(h.press(h.human, 'Enter', TYPE)).toBe(true);
    expect(h.human.value).toBe('200');
  });

  it.each(PAYMENT_SCOPES)('%s: a short burst (under 4 characters) and its Enter are dropped', (scope) => {
    const h = harness(scope);
    const delivered = h.scan(h.human, 'C12');
    expect(h.human.value).toBe('');
    expect(delivered.at(-1)).toBe(false);
  });

  it.each([POS_SCOPES.RETURN, POS_SCOPES.MODAL, POS_SCOPES.DELIVERY, POS_SCOPES.COMPLETE])(
    '%s: outside the payment scopes the controller leaves a field alone, as before', (scope) => {
      const h = harness(scope);
      expect(h.scan(h.human, 'INV-000123').every(Boolean)).toBe(true);
      expect(h.human.value).toBe('INV-000123');
    },
  );
});

// ── Credit "Received" ──────────────────────────────────────────────────────────────────
describe('P2.6 credit: Received is HUMAN_ONLY', () => {
  const openCredit = () => {
    const payment = open('r', { customerId: ACCOUNT.id });
    const received = screen.getByLabelText('Received');
    received.focus();
    return { payment, received };
  };

  it('3. a barcode burst does not fill Received, does not Enter, does not commit the credit sale', () => {
    const { payment, received } = openCredit();
    scanInto(received, '6291041500213');
    settle();
    expect(received.value).toBe('');
    expect(payment.addLine).not.toHaveBeenCalled();
    expect(dialogs('Credit Sale')).toHaveLength(1);
    expect(screen.getByText(/AED 1000\.00 will be posted/)).toBeTruthy(); // the balance is untouched
  });

  it('10. a short burst + Enter cannot commit the whole bill to the account', () => {
    // Received empty means "everything on account", which is confirmable: a scanner Enter
    // reaching the dialog here would post the full invoice to A/R.
    const { payment, received } = openCredit();
    scanInto(received, '50');
    settle();
    expect(received.value).toBe('');
    expect(payment.addLine).not.toHaveBeenCalled();
    expect(dialogs('Credit Sale')).toHaveLength(1);
  });

  it('4. 200 + Enter by a person: the existing credit flow, unchanged', () => {
    const { payment, received } = openCredit();
    typeText(received, '200', TYPE);
    expect(received.value).toBe('200');
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    received.focus();
    key(received, 'Enter', TYPE);
    expect(payment.addLine.mock.calls.map(([d]) => [d.paymentType, d.amount])).toEqual([
      ['CASH', 200],
      ['CREDIT', 800],
    ]);
  });

  it('a person Enter on an empty Received puts the bill on account, as before', () => {
    const { payment, received } = openCredit();
    key(received, 'Enter', TYPE);
    expect(payment.addLine.mock.calls.map(([d]) => [d.paymentType, d.amount])).toEqual([['CREDIT', 1000]]);
  });

  it('after a dropped burst, a person typing works at once', () => {
    const { received } = openCredit();
    scanInto(received, '6291041500213');
    typeText(received, '75', TYPE);
    expect(received.value).toBe('75');
  });
});

// ── Card approval / reference ──────────────────────────────────────────────────────────
describe('P2.6 card: approval code and reference are HUMAN_ONLY (no scan workflow exists)', () => {
  it.each([['Approval Code', 'e.g. 123456'], ['Reference', 'e.g. TXN-001']])(
    '5. %s drops a scanner burst and its Enter', (_label, placeholder) => {
      const payment = open('d');
      fireEvent.click(screen.getByRole('button', { name: 'Visa' }));
      const field = screen.getByPlaceholderText(placeholder);
      field.focus();
      scanInto(field, 'TXN0012345');
      settle();
      expect(field.value).toBe('');
      expect(payment.addLine).not.toHaveBeenCalled();
      expect(dialogs('Card Payment')).toHaveLength(1);
    },
  );

  it('5. a person typing the reference and pressing Enter confirms the card as before', () => {
    const payment = open('d');
    fireEvent.click(screen.getByRole('button', { name: 'Visa' }));
    const ref = screen.getByPlaceholderText('e.g. TXN-001');
    ref.focus();
    typeText(ref, 'TXN-77', TYPE);
    key(ref, 'Enter', TYPE);
    expect(payment.addLine).toHaveBeenCalledTimes(1);
    expect(payment.addLine.mock.calls[0][0]).toMatchObject({ paymentType: 'CARD', paymentSubtype: 'Visa', reference: 'TXN-77' });
  });
});

// ── Cash / Online / BNPL amounts and fields ──────────────────────────────────────────
describe('P2.6 other tenders: amounts and fields reject a scanner burst', () => {
  const cashShown = () => screen.getByText('Cash Received').nextElementSibling.textContent.replace(/\s+/g, ' ').trim();

  it('6. Cash amount: a burst on the dialog is not the amount (P2.5) and nothing is confirmed', () => {
    const payment = open('c');
    scanInto(dialogs('Cash Payment')[0], '6291041500213');
    settle();
    expect(cashShown()).toBe('1000.00');
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('7. Online: the amount and the transfer reference drop a burst', () => {
    const payment = open('o');
    const dialog = dialogs('Online / Bank Transfer')[0];
    scanInto(dialog, '6291041500213');
    const ref = screen.getByPlaceholderText('e.g. WIRE-2024-001');
    ref.focus();
    scanInto(ref, 'WIRE0012345');
    settle();
    expect(ref.value).toBe('');
    expect(payment.addLine).not.toHaveBeenCalled();
    expect(dialogs('Online / Bank Transfer')).toHaveLength(1);
  });

  it('8. BNPL: the customer search drops a burst', () => {
    const payment = open('b');
    fireEvent.click(screen.getByRole('button', { name: /Tabby/ }));
    const search = screen.getByPlaceholderText('Search by name or phone…');
    search.focus();
    scanInto(search, 'C9-0012345');
    settle();
    expect(search.value).toBe('');
    expect(payment.addLine).not.toHaveBeenCalled();
    expect(anyDialogTitled('Buy Now, Pay Later')).toBe(true);
  });

  it('8. BNPL: the provider approval reference keeps its value and its Enter confirms nothing', () => {
    const onConfirm = vi.fn();
    renderBnplReview(onConfirm);
    const ref = screen.getByDisplayValue('TILL-REF-1');
    ref.focus();
    scanInto(ref, 'TBY0012345');
    settle();
    expect(ref.value).toBe('TILL-REF-1');
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ── Voucher code: the opted-in field ────────────────────────────────────────────────────
describe('P2.6 voucher: the code field accepts the scanner', () => {
  const openVoucher = () => {
    const payment = makePayment();
    render(
      <Till payment={payment}>
        <VoucherPaymentModal remaining={1000} editingLine={null} offeredTypes={['VOUCHER', 'CASH']}
          onConfirm={vi.fn()} onCancel={vi.fn()} />
      </Till>,
    );
    const input = screen.getByLabelText('Voucher code');
    input.focus();
    return { payment, input };
  };

  it('1/2. scanner burst + Enter: the code is entered exactly once and looked up once', () => {
    const { input } = openVoucher();
    scanInto(input, 'EDZH-PBCR-8C65');
    expect(input.value).toBe('EDZH-PBCR-8C65');
    expect(lookupCreditVoucher).toHaveBeenCalledTimes(1);
    expect(lookupCreditVoucher).toHaveBeenCalledWith('EDZH-PBCR-8C65');
  });

  it('a person typing the code and pressing Enter looks it up the same way', () => {
    const { input } = openVoucher();
    typeText(input, 'EDZH-PBCR-8C65', TYPE);
    key(input, 'Enter', TYPE);
    expect(lookupCreditVoucher).toHaveBeenCalledTimes(1);
    expect(lookupCreditVoucher).toHaveBeenCalledWith('EDZH-PBCR-8C65');
  });

  it('a short scanner burst + Enter is accepted too', () => {
    const { input } = openVoucher();
    scanInto(input, 'V12');
    expect(input.value).toBe('V12');
    expect(lookupCreditVoucher).toHaveBeenCalledWith('V12');
  });

  it.each(['edzh-pbcr-8c65', 'EdZh-PbCr-8c65'])('case is kept exactly as scanned: %s', (code) => {
    const { input } = openVoucher();
    scanInto(input, code);
    expect(lookupCreditVoucher).toHaveBeenCalledWith(code);
  });

  it.each(['C', 'D', 'O', 'R', 'B', 'c', 'd', 'o', 'r', 'b'])(
    '9. a code beginning with %s opens no payment method behind the modal', (first) => {
      const { payment, input } = openVoucher();
      scanInto(input, `${first}0012345`);
      settle();
      expect(input.value).toBe(`${first}0012345`);
      for (const title of OTHER_METHODS) expect(dialogs(title), title).toHaveLength(0);
      expect(anyDialogTitled('Credit Sale')).toBe(false);
      expect(payment.addLine).not.toHaveBeenCalled();
    },
  );
});

// ── Checkout scope: the remarks field ───────────────────────────────────────────────────
describe('P2.6 checkout: a field on the checkout screen', () => {
  const remarksField = () => screen.getByPlaceholderText('Tap to enter note…');

  it.each(['C', 'D', 'O', 'R', 'B'])('9. a burst beginning with %s in Remarks triggers no method and fills nothing', (first) => {
    const payment = open('x'); // x is no hotkey: just the checkout screen
    const remarks = remarksField();
    remarks.focus();
    scanInto(remarks, `${first}0012345`);
    settle();
    expect(remarks.value).toBe('');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('11. a person typing c/d/o/r/b in Remarks gets the letters, and no method opens', () => {
    open('x');
    const remarks = remarksField();
    remarks.focus();
    typeText(remarks, 'cod order', TYPE);
    settle();
    expect(remarks.value).toBe('cod order');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });
});

// ── Exactly once, one listener ─────────────────────────────────────────────────────────
describe('P2.6 invariants', () => {
  it('12. one voucher scan is processed exactly once', () => {
    const payment = makePayment();
    render(
      <Till payment={payment}>
        <VoucherPaymentModal remaining={1000} editingLine={null} offeredTypes={['VOUCHER']} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </Till>,
    );
    const input = screen.getByLabelText('Voucher code');
    input.focus();
    scanInto(input, '12345678');
    settle();
    expect(input.value).toBe('12345678'); // no character doubled or lost
    expect(lookupCreditVoucher).toHaveBeenCalledTimes(1);
    expect(payment.addLine).not.toHaveBeenCalled();
  });

  it('14. still exactly one capture-phase POS keydown listener', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    open('r', { customerId: ACCOUNT.id });
    const keydown = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydown).toHaveLength(1);
    expect(keydown[0][2]).toBe(true);
  });
});

// ── The field policy, pinned ───────────────────────────────────────────────────────────
describe('P2.6 field policy: every payment-modal field is HUMAN_ONLY unless listed here', () => {
  /**
   * THE ALLOWLIST. A field that should take a scanner is added here deliberately, with the
   * business reason, together with its scannerInputProps opt-in. Anything else that appears
   * in a payment screen is checked to be HUMAN_ONLY and to drop a burst.
   */
  const SCANNER_ALLOWED_FIELDS = {
    'Voucher code': 'printed voucher barcode; lookup on Enter',
  };

  const fieldsIn = (root) => [...root.querySelectorAll('input, textarea, select')];
  const nameOf = (el) => el.getAttribute('aria-label') || el.getAttribute('placeholder')
    || el.id || `${el.tagName.toLowerCase()}[${el.type || ''}]`;

  /** Every way into a payment modal, and the steps that reveal its fields. */
  const SCREENS = [
    ['Cash', () => open('c')],
    ['Card', () => { open('d'); fireEvent.click(screen.getByRole('button', { name: 'Visa' })); }],
    ['Online', () => open('o')],
    ['Credit — customer search', () => open('r')],
    ['Credit — quick create', () => { open('r'); fireEvent.click(screen.getByRole('button', { name: /Quick Create/ })); }],
    ['Credit — received, card', () => {
      open('r', { customerId: ACCOUNT.id });
      fireEvent.change(screen.getByLabelText('Received'), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    }],
    ['Credit — received, online', () => {
      open('r', { customerId: ACCOUNT.id });
      fireEvent.change(screen.getByLabelText('Received'), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Online Transfer' }));
    }],
    ['BNPL — customer search', () => { open('b'); fireEvent.click(screen.getByRole('button', { name: /Tabby/ })); }],
    ['BNPL — new customer', () => {
      open('b');
      fireEvent.click(screen.getByRole('button', { name: /Tabby/ }));
      fireEvent.click(screen.getByRole('button', { name: /New Customer/ }));
    }],
    ['BNPL — review (approval reference)', () => renderBnplReview()],
    ['Voucher', () => render(
      <Till payment={makePayment()}>
        <VoucherPaymentModal remaining={1000} editingLine={null} offeredTypes={['VOUCHER']} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </Till>,
    )],
    ['Checkout screen', () => open('x')],
  ];

  it.each(SCREENS)('%s: each field is HUMAN_ONLY unless allowlisted', (_screen, reach) => {
    reach();
    const fields = fieldsIn(document.body);
    expect(fields.length).toBeGreaterThan(0);
    for (const el of fields) {
      const expected = SCANNER_ALLOWED_FIELDS[nameOf(el)]
        ? SCANNER_INPUT_MODES.SCANNER_ALLOWED
        : SCANNER_INPUT_MODES.HUMAN_ONLY;
      expect(scannerInputModeOf(el), nameOf(el)).toBe(expected);
    }
  });

  it.each(SCREENS)('%s: each HUMAN_ONLY text field drops a scanner burst', (_screen, reach) => {
    reach();
    const textFields = fieldsIn(document.body).filter((el) => (
      scannerInputModeOf(el) === SCANNER_INPUT_MODES.HUMAN_ONLY
      && el.tagName !== 'SELECT' && !['checkbox', 'radio', 'date'].includes(el.type)
    ));
    for (const el of textFields) {
      const before = el.value;
      el.focus();
      scanInto(el, '6291041500213');
      settle();
      expect(el.value, nameOf(el)).toBe(before);
    }
  });

  it('the opt-ins in the POS source are exactly the reviewed ones', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); }
        else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);
    const optIns = {};
    for (const file of files) {
      if (file.endsWith(`${path.sep}posScannerField.js`)) continue;
      const src = fs.readFileSync(file, 'utf8');
      const count = (src.match(/SCANNER_INPUT_MODES\.SCANNER_ALLOWED|['"]SCANNER_ALLOWED['"]|data-pos-scanner-input/g) || []).length;
      if (count) optIns[path.relative(root, file).replace(/\\/g, '/')] = count;
    }
    expect(optIns).toEqual({
      'POS/payments/modals/VoucherPaymentModal.jsx': 1, // voucher code
      'POSSales.jsx': 1, // delivery settlement search — receipt barcode = invoice number
    });
  });
});
