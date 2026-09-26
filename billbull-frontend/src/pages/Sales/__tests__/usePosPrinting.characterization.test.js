import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/localPrintAgent', () => ({
  resolvePrinterForContext: vi.fn(),
  sendEscPosReceiptToConfiguredPrinter: vi.fn(),
}));

import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from '../../../utils/localPrintAgent';
import { usePosPrinting } from '../POS/device/printing/usePosPrinting';

/**
 * CHARACTERIZATION — POS print ORCHESTRATION and the device boundary.
 *
 * Scope note. The document builders (receipt layout, thermal text, ESC/POS bytes, A4
 * templates, payment blocks, ZATCA TLV, paper-width branches) already have dedicated
 * characterization suites — posPrintUtils, posReceiptEscPos, paymentPresentation. None of
 * that is repeated here.
 *
 * What IS new, and what these tests cover, is the orchestration layer the Phase 3
 * extraction gave a boundary to: template selection, printer resolution, dispatch,
 * fallback routing and the print-feedback surface. Those were useCallbacks inside
 * POSSales.jsx and were unreachable from any test.
 *
 * No hardware, no print agent, no network: the agent module is mocked.
 */

const PRINTER = { deviceName: 'EPSON TM-T88VI', systemPrinterName: 'EPSON' };
const TERMINAL = { branchId: 7, terminalId: 'TERM-01' };
const OPTIONS = { showLogo: true, colVatAmt: false };

const setup = (over = {}) => {
  const args = {
    printerConfigs: [PRINTER],
    currentTerminal: TERMINAL,
    resolvedPosInvoiceTemplate: null,
    resolvedPosCreditNoteTemplate: null,
    invoiceTemplateOptions: OPTIONS,
    tplInvoiceFooter: 'All prices inclusive of VAT at 5%.',
    ...over,
  };
  return { view: renderHook(() => usePosPrinting(args)), args };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resolvePrinterForContext.mockReturnValue(PRINTER);
  sendEscPosReceiptToConfiguredPrinter.mockResolvedValue({});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('print feedback surface', () => {
  it('starts with no feedback', () => {
    expect(setup().view.result.current.printFeedback).toBe(null);
  });

  it('notifyPrintFallback raises a dismissible error that clears after 6s', () => {
    const { view } = setup();
    act(() => view.result.current.notifyPrintFallback('Printer offline'));

    expect(view.result.current.printFeedback).toEqual({ type: 'error', message: 'Printer offline' });
    act(() => { vi.advanceTimersByTime(5999); });
    expect(view.result.current.printFeedback).not.toBe(null);
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.result.current.printFeedback).toBe(null);
  });

  it('exposes the setter the toast JSX uses to dismiss manually', () => {
    const { view } = setup();
    act(() => view.result.current.notifyPrintFallback('x'));
    act(() => view.result.current.setPrintFeedback(null));
    expect(view.result.current.printFeedback).toBe(null);
  });
});

describe('A4 template resolution', () => {
  it('builds the fabricated in-memory template when no DB template is resolved', () => {
    const { view } = setup();
    const tpl = view.result.current.resolveInvoiceA4Template('Footer', OPTIONS, true);

    expect(tpl.category).toBe('Sales Invoice');
    expect(tpl.paperSize).toBe('A4');
    expect(tpl.termsContent).toBe('Footer');
  });

  it('forces every tax element off for a no-tax document', () => {
    const { view } = setup();
    const taxed = JSON.parse(view.result.current.resolveInvoiceA4Template('F', OPTIONS, true).displayOptions);
    const untaxed = JSON.parse(view.result.current.resolveInvoiceA4Template('F', OPTIONS, false).displayOptions);

    expect(untaxed.showTRN).toBe(false);
    expect(untaxed.colVAT).toBe(false);
    expect(untaxed.showVATTotal).toBe(false);
    expect(taxed.showTRN).not.toBe(false);
  });

  it('builds a Sales Return category for a credit note', () => {
    const { view } = setup();
    expect(view.result.current.resolveCreditNoteA4Template('F', OPTIONS).category).toBe('Sales Return');
  });

  it('CHARACTERIZED BEHAVIOUR: the DB template is only used when the build flag is on', () => {
    // USE_NEW_POS_PRINT_TEMPLATE is a build-time env flag, off by default, so supplying a
    // resolved DB template does not by itself change the resolved output.
    const dbTemplate = { category: 'FROM-DB', displayOptions: '{}' };
    const { view } = setup({ resolvedPosInvoiceTemplate: dbTemplate });
    expect(view.result.current.resolveInvoiceA4Template('F', OPTIONS, true).category).toBe('Sales Invoice');
  });
});

describe('resolveInvoiceA4TemplateFor — the collapsed call site', () => {
  it('derives tax-awareness from the document itself', () => {
    const { view } = setup();
    const taxed = view.result.current.resolveInvoiceA4TemplateFor({ taxTotal: 15 });
    const untaxed = view.result.current.resolveInvoiceA4TemplateFor({ taxTotal: 0 });

    expect(JSON.parse(taxed.displayOptions).showTRN).not.toBe(false);
    expect(JSON.parse(untaxed.displayOptions).showTRN).toBe(false);
  });

  it('is exactly the expression the six inline call sites used', () => {
    // The extraction replaced six byte-identical literals with this helper. Proving the
    // two forms agree is what makes that collapse safe.
    const { view, args } = setup();
    const doc = { taxTotal: 15 };
    const viaHelper = view.result.current.resolveInvoiceA4TemplateFor(doc);
    const viaInline = view.result.current.resolveInvoiceA4Template(
      args.tplInvoiceFooter, args.invoiceTemplateOptions, true,
    );
    expect(viaHelper).toEqual(viaInline);
  });

  it('applies the footer and designer flags it was configured with', () => {
    const { view } = setup({
      tplInvoiceFooter: 'Custom footer',
      invoiceTemplateOptions: { showLogo: false, colDiscount: false },
    });
    const tpl = view.result.current.resolveInvoiceA4TemplateFor({ taxTotal: 15 });
    const ds = JSON.parse(tpl.displayOptions).salesDesignerSettings;

    expect(tpl.termsContent).toBe('Custom footer');
    expect(ds.showLogo).toBe(false);
    expect(ds.colDiscount).toBe(false);
  });
});

describe('printThermalReceiptWithConfiguredPrinter — dispatch', () => {
  // renderHook must run OUTSIDE act(), or result.current is still null when the
  // callback reads it.
  const send = (ctx, over = {}) => ctx.view.result.current
    .printThermalReceiptWithConfiguredPrinter({
      full: { branchId: 9, posTerminalId: 'TERM-09' },
      text: 'RECEIPT',
      escPosBase64: 'AAEC',
      ...over,
    });

  it('resolves the printer from the invoice branch/terminal first', async () => {
    const ctx = setup();
    await act(async () => { await send(ctx); });
    expect(resolvePrinterForContext).toHaveBeenCalledWith([PRINTER], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 9,
      terminalId: 'TERM-09',
    });
  });

  it('falls back to the current terminal when the invoice carries neither', async () => {
    const ctx = setup();
    await act(async () => { await send(ctx, { full: {} }); });
    expect(resolvePrinterForContext).toHaveBeenCalledWith([PRINTER], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 7,
      terminalId: 'TERM-01',
    });
  });

  it('passes null when neither source has a branch or terminal', async () => {
    const ctx = setup({ currentTerminal: null });
    await act(async () => { await send(ctx, { full: {} }); });
    expect(resolvePrinterForContext).toHaveBeenCalledWith([PRINTER], {
      deviceType: 'RECEIPT_PRINTER', branchId: null, terminalId: null,
    });
  });

  it('sends the ESC/POS payload with its text fallback and title', async () => {
    const ctx = setup();
    await act(async () => { await send(ctx, { title: 'Invoice INV-1' }); });
    expect(sendEscPosReceiptToConfiguredPrinter).toHaveBeenCalledWith(PRINTER, {
      dataBase64: 'AAEC', receiptText: 'RECEIPT', title: 'Invoice INV-1',
    });
  });

  it('defaults the job title', async () => {
    const ctx = setup();
    await act(async () => { await send(ctx); });
    expect(sendEscPosReceiptToConfiguredPrinter.mock.calls[0][1].title).toBe('BillBull POS Receipt');
  });

  it('reports the escpos mode on a clean send, with no feedback raised', async () => {
    const ctx = setup();
    let result;
    await act(async () => { result = await send(ctx); });

    expect(result).toEqual({ mode: 'agent-escpos', printer: PRINTER });
    expect(ctx.view.result.current.printFeedback).toBe(null);
  });
});

describe('printThermalReceiptWithConfiguredPrinter — failure and fallback routing', () => {
  const send = (ctx, over = {}) => ctx.view.result.current
    .printThermalReceiptWithConfiguredPrinter({
      full: {}, text: 'R', escPosBase64: 'AAEC', ...over,
    });

  it('throws — never silently skips — when no printer is configured', async () => {
    resolvePrinterForContext.mockReturnValue(null);
    await expect(send(setup())).rejects.toThrow(
      'No receipt printer is configured for this terminal. Set one up in Settings → Devices.');
    expect(sendEscPosReceiptToConfiguredPrinter).not.toHaveBeenCalled();
  });

  it('throws when the ESC/POS payload could not be built', async () => {
    await expect(send(setup(), { escPosBase64: null })).rejects.toThrow(
      'Could not build the ESC/POS receipt for this sale.');
    expect(sendEscPosReceiptToConfiguredPrinter).not.toHaveBeenCalled();
  });

  it('surfaces a driver downgrade as a visible amber warning, never silently', async () => {
    sendEscPosReceiptToConfiguredPrinter.mockResolvedValue({
      fallbackUsed: 'text', escPosError: 'StartDocPrinter refused',
    });
    const ctx = setup();
    let result;
    await act(async () => { result = await send(ctx); });

    expect(result.mode).toBe('agent-text-fallback');
    expect(ctx.view.result.current.printFeedback.type).toBe('warning');
    expect(ctx.view.result.current.printFeedback.message).toContain('text compatibility mode');
    expect(ctx.view.result.current.printFeedback.message).toContain('EPSON TM-T88VI');
    expect(ctx.view.result.current.printFeedback.message).toContain('StartDocPrinter refused');
  });

  it('names the system printer when the device has no friendly name', async () => {
    const bare = { systemPrinterName: 'POS-80C' };
    resolvePrinterForContext.mockReturnValue(bare);
    sendEscPosReceiptToConfiguredPrinter.mockResolvedValue({ fallbackUsed: 'text' });
    const ctx = setup();
    await act(async () => { await send(ctx); });

    expect(ctx.view.result.current.printFeedback.message).toContain('POS-80C');
    expect(ctx.view.result.current.printFeedback.message).toContain('driver error');
  });

  it('holds the compatibility warning for 10s — longer than a hard error', async () => {
    sendEscPosReceiptToConfiguredPrinter.mockResolvedValue({ fallbackUsed: 'text' });
    const ctx = setup();
    await act(async () => { await send(ctx); });

    act(() => { vi.advanceTimersByTime(9999); });
    expect(ctx.view.result.current.printFeedback).not.toBe(null);
    act(() => { vi.advanceTimersByTime(1); });
    expect(ctx.view.result.current.printFeedback).toBe(null);
  });

  it('propagates an agent send failure to the caller', async () => {
    sendEscPosReceiptToConfiguredPrinter.mockRejectedValue(new Error('agent unreachable'));
    await expect(send(setup())).rejects.toThrow('agent unreachable');
  });
});
