import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  posCheckout: vi.fn(),
  posCreditBalance: vi.fn(),
  convertLayaway: vi.fn(),
}));
vi.mock('../../../utils/printGenerator', () => ({
  printHtml: vi.fn(),
  generatePrintHtmlAsync: vi.fn(async () => '<html></html>'),
}));

import { convertLayaway, posCheckout, posCreditBalance } from '../../../api/posApi';
import { generatePrintHtmlAsync, printHtml } from '../../../utils/printGenerator';
import { useCheckout } from '../POS/features/checkout/useCheckout';
import { PAYMENT_TYPES, createPaymentLine } from '../POS/payments/paymentModel';
import { buildCheckoutPaymentFields } from '../POS/payments/paymentPayloadAdapter';

/**
 * CHARACTERIZATION — checkout orchestration.
 *
 * `processPayment` was a 335-line function inside POSSales.jsx with ~52 closure
 * dependencies, unreachable from any test. The Phase 3 extraction moved it verbatim into a
 * hook with grouped explicit inputs.
 *
 * SCOPE. The checkout PAYLOAD (item projection, tax, discounts, payment fields, rounding)
 * is already locked down by posCheckoutPayload.characterization.test.js, and the receipt /
 * ESC-POS / payment-presentation output by their own suites. Those remain the oracles and
 * are not duplicated. What these tests establish is the ORCHESTRATION contract: the guard
 * order, the payment-confirmed boundary, the post-success side-effect sequence, the
 * deliberately backgrounded finalisation, and the five failure-routing branches.
 *
 * ORDERING IS ASSERTED AS AN EVENT LOG, because for checkout "what happened" is not enough
 * — "in what order, and before or after the promise resolved" is the actual contract.
 */

let events;
const log = (e) => () => { events.push(e); };

const DEFAULT_LINES = [createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 378 })];

const makeArgs = (over = {}) => {
  const lines = over.paymentLines ?? DEFAULT_LINES;
  const effectiveDue = over.effectiveDue ?? 378;
  const deep = { ...over };
  delete deep.paymentLines; delete deep.effectiveDue;

  const clearLines = vi.fn(log('payment.clearLines'));
  const clearInvoice = vi.fn(log('cart.clearInvoice'));
  const syncPosData = vi.fn(log('syncPosData'));
  const openCashDrawer = vi.fn((t) => events.push(`drawer:${t}`));
  const setCheckoutPhaseSpy = vi.fn();
  // The preview-freeze state is owned by the caller (POSSales), not the hook, because
  // checkoutThermalHtml itself reads it. Mirror POSSales' useState(false) / useRef('').
  // Deliberately NOT logged into `events`: the freeze happens before posCheckout and was
  // never part of the characterized side-effect sequence.
  const setCheckoutSettling = vi.fn();
  const checkoutPreviewFreezeRef = { current: '' };

  const args = {
    previewFreeze: { checkoutSettling: false, setCheckoutSettling, checkoutPreviewFreezeRef },
    payment: {
      checkoutPayment: { paymentLines: lines, clearLines },
      checkoutPaymentFields: buildCheckoutPaymentFields(lines, { effectiveDue }),
      checkoutEffectiveDue: effectiveDue,
      checkoutCompatibility: { canSettle: true, message: '' },
    },
    cart: {
      currentInvoice: {
        items: [{ code: 'SKU-1', name: 'Widget', quantity: 2, price: 180, taxRate: 5 }],
        total: 378, billDiscountAmount: 0,
      },
      clearInvoice,
      setInvoiceCounter: vi.fn(log('cart.invoiceCounter++')),
      checkoutThermalHtml: '<html>preview</html>',
    },
    customerCtx: {
      selectedCustomerData: { id: 'c1', code: 'CUST-1', name: 'Fatima Hassan', phone: '+971 50 1', email: 'f@x.ae', trn: 'T1', address: 'A' },
      customerOptions: [],
    },
    sessionCtx: {
      currentSession: { id: 42, branchId: 7 },
      currentTerminal: { terminalId: 'TERM-01', counterName: 'C1', branchId: 7, branchName: 'Main', branchCode: 'MB' },
      posSettings: { taxInclusive: false, taxEnabled: true, branchDefaultVatRate: 5 },
    },
    layaway: {
      activeLayawayId: null, activeLayawayDeposit: 0,
      setActiveLayawayId: vi.fn(log('layaway.reset.id')),
      setActiveLayawayDeposit: vi.fn(log('layaway.reset.deposit')),
    },
    shipping: {
      shippingCharge: '', shippingAddress: null, deliveryAddress: null,
      deliveryDriver: '', deliveryNotes: '',
    },
    printing: {
      resolveInvoiceA4TemplateFor: vi.fn(() => ({ category: 'Sales Invoice', displayOptions: '{}' })),
      printThermalReceiptWithConfiguredPrinter: vi.fn(async () => { events.push('print.thermal'); return { mode: 'agent-escpos' }; }),
      buildThermalReceiptArtifacts: vi.fn(async () => { events.push('build.artifacts'); return { text: 'R', escPosBase64: 'AAEC' }; }),
      openCashDrawer,
    },
    a4Template: {
      tplInvoicePaper: '80mm', tplInvoiceFooter: 'F', tplInvoiceHeader: 'TAX INVOICE',
      tplReceiptHeader: 'R', tplInvoiceShowStamp: false, tplOutletName: 'BB',
      tplOutletAddress: 'A', tplOutletPhone: 'P', tplLogoDataUrl: null,
      tplStampDataUrl: null, tplInvoiceShowBankDetails: false,
      effectiveOutletTrn: 'TRN1', company: null,
    },
    errorRouting: {
      isClosureWorkflowError: vi.fn(() => false),
      showClosureRequiredBlock: vi.fn(log('route.closureRequired')),
      setShowPaymentDialog: vi.fn(),
      // The approval queue moved to useSupervisorApproval: checkout now routes through
      // one requestApproval call instead of five individual setters.
      requestApproval: vi.fn(log('route.supervisorPin')),
    },
    posReset: {
      syncPosData,
      setReceivedAmount: vi.fn(log('reset.receivedAmount')),
      setSelectedCardType: vi.fn(log('reset.cardType')),
      setSelectedCreditCustomer: vi.fn(log('reset.creditCustomer')),
      setLastScannedItem: vi.fn(log('reset.lastScanned')),
    },
  };
  // Shallow-merge any group overrides.
  Object.entries(deep).forEach(([k, v]) => { args[k] = { ...args[k], ...v }; });
  return {
    args, clearInvoice, syncPosData, clearLines, openCashDrawer, setCheckoutPhaseSpy,
    setCheckoutSettling, checkoutPreviewFreezeRef,
  };
};

const setup = (over = {}) => {
  const made = makeArgs(over);
  const view = renderHook(() => useCheckout(made.args));
  return { ...made, view };
};

const SAVED = { id: 900, invoiceNumber: 'SI-POS-000124', invoiceTotal: 378, customerCode: 'CUST-1' };

beforeEach(() => {
  events = [];
  vi.clearAllMocks();
  posCheckout.mockImplementation(async () => { events.push('posCheckout'); return SAVED; });
  posCreditBalance.mockResolvedValue({ found: false });
  convertLayaway.mockImplementation(async () => { events.push('layaway.convert'); return {}; });
  generatePrintHtmlAsync.mockResolvedValue('<html></html>');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Runs processPayment and lets the backgrounded finalisation settle. */
const settle = async (ctx, creds = null) => {
  await act(async () => { await ctx.view.result.current.processPayment(creds); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('initial state', () => {
  it('starts idle, on the payment phase, with no error', () => {
    const ctx = setup();
    const r = ctx.view.result.current;
    expect(r.checkoutLoading).toBe(false);
    expect(r.checkoutError).toBe(null);
    expect(r.checkoutPhase).toBe('payment');
    expect(r.checkoutFinalizing).toBe(false);
    expect(r.lastPaidInvoice).toBe(null);
    expect(r.checkoutRemarks).toBe('');
    // checkoutSettling / checkoutPreviewFreezeRef moved to the caller (see the hook's
    // `previewFreeze` group): the hook must not return them, and must not touch the
    // caller-owned freeze state on render.
    expect(r).not.toHaveProperty('checkoutSettling');
    expect(r).not.toHaveProperty('checkoutPreviewFreezeRef');
    expect(ctx.setCheckoutSettling).not.toHaveBeenCalled();
    expect(ctx.checkoutPreviewFreezeRef.current).toBe('');
  });
});

describe('guards — nothing is posted and no state is touched', () => {
  it('refuses an empty cart silently', async () => {
    const ctx = setup({ cart: { currentInvoice: { items: [], total: 0, billDiscountAmount: 0 } } });
    await settle(ctx);
    expect(posCheckout).not.toHaveBeenCalled();
    expect(ctx.view.result.current.checkoutError).toBe(null);
    expect(ctx.view.result.current.checkoutLoading).toBe(false);
  });

  it('refuses when the server compatibility probe says it cannot settle', async () => {
    const ctx = setup({ payment: { checkoutCompatibility: { canSettle: false, message: 'Old server' } } });
    await settle(ctx);
    expect(posCheckout).not.toHaveBeenCalled();
    expect(ctx.view.result.current.checkoutError).toBe('Old server');
  });

  it('falls back to a generic compatibility message', async () => {
    const ctx = setup({ payment: { checkoutCompatibility: { canSettle: false, message: '' } } });
    await settle(ctx);
    expect(ctx.view.result.current.checkoutError)
      .toBe('Server compatibility could not be verified. Payment was not taken.');
  });

  it('refuses with no payment lines', async () => {
    const ctx = setup({ paymentLines: [] });
    await settle(ctx);
    expect(posCheckout).not.toHaveBeenCalled();
    expect(ctx.view.result.current.checkoutError).toBe('Add at least one payment before settling.');
  });

  it('refuses a payment block that does not reconcile, naming the failed identity', async () => {
    // Underpaid: allocations total 100 against a 378 due.
    const ctx = setup({ paymentLines: [createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 100 })] });
    await settle(ctx);

    expect(posCheckout).not.toHaveBeenCalled();
    expect(ctx.view.result.current.checkoutError)
      .toMatch(/^Payment does not reconcile and was not taken\./);
    expect(console.error).toHaveBeenCalledWith(
      'POS settlement blocked — payment does not reconcile', expect.any(Object));
  });

  it('CHARACTERIZED ORDER: compatibility is checked before lines, and lines before reconcile', async () => {
    // Both broken at once: the compatibility message is the one that surfaces.
    const ctx = setup({
      paymentLines: [],
      payment: { checkoutCompatibility: { canSettle: false, message: 'Old server' } },
    });
    await settle(ctx);
    expect(ctx.view.result.current.checkoutError).toBe('Old server');
  });
});

describe('the payment-confirmed boundary', () => {
  it('reads the credit balance BEFORE posting, never after', async () => {
    posCreditBalance.mockImplementation(async () => { events.push('posCreditBalance'); return { found: true, outstanding: 50 }; });
    const ctx = setup({ a4Template: { tplInvoiceShowBankDetails: true } });
    await settle(ctx);

    expect(events.indexOf('posCreditBalance')).toBeGreaterThan(-1);
    expect(events.indexOf('posCreditBalance')).toBeLessThan(events.indexOf('posCheckout'));
  });

  it('performs NO cart or UI mutation before posCheckout resolves', async () => {
    const ctx = setup();
    await settle(ctx);
    const postIdx = events.indexOf('posCheckout');

    ['cart.clearInvoice', 'payment.clearLines', 'syncPosData', 'cart.invoiceCounter++',
      'reset.receivedAmount', 'build.artifacts', 'print.thermal',
    ].forEach((e) => {
      expect(events.indexOf(e)).toBeGreaterThan(postIdx);
    });
  });

  it('leaves the cart untouched when the post itself fails', async () => {
    posCheckout.mockRejectedValue({ response: { data: { message: 'Stock gone' } } });
    const ctx = setup();
    await settle(ctx);

    expect(ctx.clearInvoice).not.toHaveBeenCalled();
    expect(ctx.clearLines).not.toHaveBeenCalled();
    expect(ctx.syncPosData).not.toHaveBeenCalled();
    expect(ctx.view.result.current.checkoutError).toBe('Stock gone');
  });
});

describe('post-success side-effect sequence', () => {
  it('records the exact current order', async () => {
    const ctx = setup();
    await settle(ctx);

    expect(events).toEqual([
      'posCheckout',
      'cart.invoiceCounter++',
      'cart.clearInvoice',
      'syncPosData',
      'reset.receivedAmount',
      'reset.cardType',
      'reset.creditCustomer',
      'reset.lastScanned',
      'payment.clearLines',
      'drawer:CASH_SETTLEMENT',
      'drawer:CASH_PAYMENT',
      'build.artifacts',
      'print.thermal',
      'drawer:RECEIPT_PRINT',
    ]);
  });

  it('commits the success snapshot and the finalising flag', async () => {
    const ctx = setup();
    await settle(ctx);
    const r = ctx.view.result.current;

    expect(r.lastPaidInvoice).toMatchObject({
      id: 'SI-POS-000124', total: 378, items: 1, invoice: SAVED, changeAmount: 0,
    });
    expect(r.lastPaidInvoice.paymentBlock).toBeTruthy();
    expect(r.checkoutPhase).toBe('complete');
    expect(r.checkoutFinalizing).toBe(false);   // cleared by the background finally{}
    expect(r.checkoutLoading).toBe(false);
  });

  it('freezes the A4 preview before the cart is cleared', async () => {
    const ctx = setup();
    await settle(ctx);
    // The ref is caller-owned now; the hook writes the snapshot into the one it was given.
    expect(ctx.checkoutPreviewFreezeRef.current).toBe('<html>preview</html>');
    expect(ctx.setCheckoutSettling).toHaveBeenCalledWith(true);
  });

  it('resets the layaway tagging only when a conversion was active', async () => {
    const plain = setup();
    await settle(plain);
    expect(events).not.toContain('layaway.reset.id');

    events = [];
    const conv = setup({ layaway: { activeLayawayId: 9, activeLayawayDeposit: 50 }, effectiveDue: 328,
      paymentLines: [createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 328 })] });
    await settle(conv);
    expect(events).toContain('layaway.reset.id');
    expect(events).toContain('layaway.reset.deposit');
    expect(events).toContain('layaway.convert');
  });
});

describe('background finalisation timing', () => {
  it('CHARACTERIZED TIMING: processPayment resolves BEFORE printing completes', async () => {
    let releasePrint;
    const slowPrint = new Promise((r) => { releasePrint = r; });
    const ctx = setup({
      printing: {
        printThermalReceiptWithConfiguredPrinter: vi.fn(async () => {
          events.push('print.started');
          await slowPrint;
          events.push('print.finished');
          return { mode: 'agent-escpos' };
        }),
      },
    });

    await act(async () => { await ctx.view.result.current.processPayment(null); });
    // The outer promise has resolved and the till is released, yet printing is still in
    // flight. Turning the finalisation into an await would regress this.
    events.push('processPayment.resolved');
    expect(events).toContain('print.started');
    expect(events).not.toContain('print.finished');
    expect(ctx.view.result.current.checkoutLoading).toBe(false);

    await act(async () => { releasePrint(); await Promise.resolve(); });
    await waitFor(() => expect(events).toContain('print.finished'));
    expect(events.indexOf('processPayment.resolved')).toBeLessThan(events.indexOf('print.finished'));
  });

  it('clears checkoutFinalizing only after the background work ends', async () => {
    let release;
    const slow = new Promise((r) => { release = r; });
    const ctx = setup({
      printing: { printThermalReceiptWithConfiguredPrinter: vi.fn(async () => { await slow; return {}; }) },
    });

    await act(async () => { await ctx.view.result.current.processPayment(null); });
    expect(ctx.view.result.current.checkoutFinalizing).toBe(true);

    await act(async () => { release(); await Promise.resolve(); });
    await waitFor(() => expect(ctx.view.result.current.checkoutFinalizing).toBe(false));
  });

  it('a print failure does not fail the sale — it warns and alerts', async () => {
    const ctx = setup({
      printing: {
        printThermalReceiptWithConfiguredPrinter: vi.fn(async () => { throw new Error('printer offline'); }),
      },
    });
    await settle(ctx);

    expect(ctx.view.result.current.checkoutError).toBe(null);
    expect(ctx.view.result.current.checkoutPhase).toBe('complete');
    expect(console.warn).toHaveBeenCalledWith('Automatic receipt print failed', expect.any(Error));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Sale saved, but the receipt'));
    expect(ctx.view.result.current.checkoutFinalizing).toBe(false);
  });

  it('a layaway-convert failure is swallowed with a warning', async () => {
    convertLayaway.mockRejectedValue(new Error('already converted'));
    const ctx = setup({ layaway: { activeLayawayId: 9, activeLayawayDeposit: 50 }, effectiveDue: 328,
      paymentLines: [createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 328 })] });
    await settle(ctx);

    expect(console.warn).toHaveBeenCalledWith('Layaway mark-converted failed', expect.any(Error));
    expect(ctx.view.result.current.checkoutError).toBe(null);
  });
});

describe('printing branch selection', () => {
  it('takes the thermal path for non-A4 paper', async () => {
    const ctx = setup();
    await settle(ctx);
    expect(events).toContain('build.artifacts');
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('takes the A4 path for A4 paper, and never builds thermal artifacts', async () => {
    const ctx = setup({ a4Template: { tplInvoicePaper: 'A4' } });
    await settle(ctx);

    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(generatePrintHtmlAsync).toHaveBeenCalledTimes(1);
    expect(events).not.toContain('build.artifacts');
    expect(events).toContain('drawer:RECEIPT_PRINT');
  });

  it('opens the drawer for change only when change is due', async () => {
    const noChange = setup();
    await settle(noChange);
    expect(events).not.toContain('drawer:CHANGE_RETURN');

    events = [];
    const withChange = setup({ paymentLines: [createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 400 })] });
    await settle(withChange);
    expect(events).toContain('drawer:CHANGE_RETURN');
  });

  it('does not open the cash drawer when no cash changed hands', async () => {
    const ctx = setup({ paymentLines: [createPaymentLine({ paymentType: PAYMENT_TYPES.CARD, amount: 378, paymentSubtype: 'Visa' })] });
    await settle(ctx);
    expect(events).not.toContain('drawer:CASH_SETTLEMENT');
    expect(events).not.toContain('drawer:CASH_PAYMENT');
  });
});

describe('failure routing', () => {
  it('routes a closure-workflow error to the closure block', async () => {
    posCheckout.mockRejectedValue({ response: { data: { message: 'X-Report issued' } } });
    const ctx = setup({ errorRouting: { isClosureWorkflowError: vi.fn(() => true) } });
    await settle(ctx);

    expect(events).toContain('route.closureRequired');
    expect(ctx.view.result.current.checkoutError).toBe(null);
  });

  it('routes a 403 price-override refusal into the supervisor dialog', async () => {
    posCheckout.mockRejectedValue({ response: { status: 403, data: { message: 'requires pos_price_override' } } });
    const ctx = setup();
    await settle(ctx);

    expect(events).toContain('route.supervisorPin');
    expect(ctx.view.result.current.checkoutError).toBe(null);
  });

  it('routes a 423 BUSINESS_DAY_CLOSED into the same dialog when authorisation is available', async () => {
    posCheckout.mockRejectedValue({
      response: { status: 423, data: { code: 'BUSINESS_DAY_CLOSED', supervisorAuthorizationAvailable: true, closedAt: 'x', nextStartAt: 'y' } },
    });
    const ctx = setup();
    await settle(ctx);
    expect(events).toContain('route.supervisorPin');
  });

  it('shows a plain error for any other failure', async () => {
    posCheckout.mockRejectedValue({ response: { status: 500, data: { message: 'Boom' } } });
    const ctx = setup();
    await settle(ctx);
    expect(ctx.view.result.current.checkoutError).toBe('Boom');
    expect(events).not.toContain('route.supervisorPin');
  });

  it('distinguishes a network failure and says the sale was NOT recorded', async () => {
    posCheckout.mockRejectedValue(new Error('socket hang up'));
    const ctx = setup();
    await settle(ctx);
    expect(ctx.view.result.current.checkoutError)
      .toBe('Could not reach the server. The sale was NOT recorded — check the connection and settle again. Your payment entries have been kept.');
  });

  it('always releases checkoutLoading, on every failure path', async () => {
    for (const err of [
      new Error('network'),
      { response: { status: 500, data: { message: 'x' } } },
      { response: { status: 403, data: { message: 'pos_price_override' } } },
    ]) {
      posCheckout.mockRejectedValue(err);
      const ctx = setup();
      await settle(ctx);
      expect(ctx.view.result.current.checkoutLoading).toBe(false);
    }
  });

  it('keeps the payment allocations on every failure so the cashier can retry', async () => {
    posCheckout.mockRejectedValue({ response: { status: 500, data: { message: 'x' } } });
    const ctx = setup();
    await settle(ctx);
    expect(ctx.clearLines).not.toHaveBeenCalled();
  });
});

describe('supervisor override credentials', () => {
  it('forwards the override credentials onto the checkout payload', async () => {
    const ctx = setup();
    await settle(ctx, { pin: '1234', email: 's@x.ae', password: 'pw' });

    const payload = posCheckout.mock.calls[0][0];
    expect(payload.supervisorOverridePin).toBe('1234');
    expect(payload.supervisorOverrideEmail).toBe('s@x.ae');
    expect(payload.supervisorOverridePassword).toBe('pw');
  });

  it('omits them entirely on a normal settle', async () => {
    const ctx = setup();
    await settle(ctx);
    const payload = posCheckout.mock.calls[0][0];
    expect(payload.supervisorOverridePin).toBeUndefined();
    expect(payload.supervisorOverrideEmail).toBeUndefined();
  });
});

describe('payload hand-off', () => {
  it('posts through the existing projections — items plus the scalar fields', async () => {
    // The payload's detailed shape is the posCheckoutPayload suite's concern; here we only
    // prove the orchestration hands the right projections to the right call.
    const ctx = setup();
    await settle(ctx);

    const payload = posCheckout.mock.calls[0][0];
    expect(payload.items).toEqual([{
      itemCode: 'SKU-1', itemName: 'Widget', quantity: 2, unit: 'Each',
      price: 180, discount: 0, taxRate: 5,
      batchNumber: null, serialNumber: null, voided: false,
    }]);
    expect(payload.sessionId).toBe(42);
    expect(payload.terminalId).toBe('TERM-01');
    expect(payload.customerCode).toBe('CUST-1');
    expect(payload.paymentAllocations).toHaveLength(1);
    expect(payload.taxInclusive).toBe(false);
  });
});
