import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/localPrintAgent', () => ({
  resolvePrinterForContext: vi.fn(),
  sendEscPosReceiptToConfiguredPrinter: vi.fn(),
}));
vi.mock('../../../utils/printGenerator', () => ({
  generatePrintHtmlAsync: vi.fn(async (tpl) => `<doc:${tpl.name}>`),
}));
vi.mock('../../../utils/overlayInvoiceRenderer', () => ({
  generateOverlayInvoiceHtml: vi.fn((tpl) => `<overlay:${tpl.name}>`),
}));

import { generatePrintHtmlAsync } from '../../../utils/printGenerator';
import { generateOverlayInvoiceHtml } from '../../../utils/overlayInvoiceRenderer';
import {
  isOverlayTemplate, isSheetPaper, paperForDocument, pickSheetTemplate, sheetFormatLabel, sheetPixelSize,
} from '../POS/device/printing/posSheetTemplates';
import { usePosPrinting } from '../POS/device/printing/usePosPrinting';

/**
 * The POS sheet formats (A4 / A5 Portrait / A5 Landscape / Pre-printed) and how a sale
 * document is routed onto the Back Office "Sales Invoice" template family.
 */

const tpl = (over) => ({ templateType: 'FULL', paperSize: 'A4', orientation: 'Portrait', isDefault: false, branchId: null, ...over });

const A4_DEFAULT = tpl({ id: 1, name: 'Default Sales Invoice', isDefault: true });
const A5_PORTRAIT = tpl({ id: 2, name: 'A5 · Portrait', paperSize: 'A5', orientation: 'portrait' });
const A5_LANDSCAPE = tpl({ id: 3, name: 'A5 · Landscape', paperSize: 'A5', orientation: 'landscape' });
const PREPRINTED = tpl({ id: 4, name: 'New Pre-printed Form Template', templateType: 'PREPRINTED', isDefault: true });
const LETTERHEAD = tpl({ id: 5, name: 'Letterhead', templateType: 'LETTERHEAD' });
const FAMILY = [A4_DEFAULT, A5_PORTRAIT, A5_LANDSCAPE, PREPRINTED, LETTERHEAD];

describe('sheet formats', () => {
  it('recognises the four sheet formats and nothing thermal', () => {
    for (const p of ['A4', 'A5', 'A5L', 'PREPRINTED']) expect(isSheetPaper(p), p).toBe(true);
    for (const p of ['80mm', '58mm', 'a4', '', undefined, null]) expect(isSheetPaper(p), String(p)).toBe(false);
  });

  it('labels each format for the UI', () => {
    expect(['A4', 'A5', 'A5L', 'PREPRINTED'].map(sheetFormatLabel)).toEqual(['A4', 'A5 Portrait', 'A5 Landscape', 'Pre-printed']);
  });
});

describe('paperForDocument — Tax Invoice tab for a taxed sale, POS Receipt tab for a no-tax one', () => {
  it('a taxed sale follows the invoice paper', () => {
    expect(paperForDocument({ taxTotal: 5 }, 'A5L', 'PREPRINTED')).toBe('A5L');
  });

  it('a no-tax sale follows the receipt paper', () => {
    expect(paperForDocument({ taxTotal: 0 }, 'A5L', 'PREPRINTED')).toBe('PREPRINTED');
    expect(paperForDocument({ taxTotal: 0 }, 'A4', '80mm')).toBe('80mm');
  });
});

describe('pickSheetTemplate', () => {
  it('maps each format onto its family member', () => {
    expect(pickSheetTemplate(FAMILY, 'A5')).toBe(A5_PORTRAIT);
    expect(pickSheetTemplate(FAMILY, 'A5L')).toBe(A5_LANDSCAPE);
    expect(pickSheetTemplate(FAMILY, 'PREPRINTED')).toBe(PREPRINTED);
  });

  it('never picks a letterhead for the pre-printed form, nor an overlay for an A5 sheet', () => {
    expect(pickSheetTemplate([LETTERHEAD], 'PREPRINTED')).toBe(null);
    const overlayA5 = tpl({ name: 'overlay A5', templateType: 'PREPRINTED', paperSize: 'A5' });
    expect(pickSheetTemplate([overlayA5], 'A5')).toBe(null);
  });

  it('treats an untyped row in overlay pre-printed mode as a pre-printed form', () => {
    const legacy = tpl({ name: 'legacy', templateType: '', displayOptions: JSON.stringify({ salesDesignerSettings: { mode: 'preprinted' } }) });
    expect(isOverlayTemplate(legacy)).toBe(true);
    expect(pickSheetTemplate([legacy], 'PREPRINTED')).toBe(legacy);
  });

  it('reads the sheet from the designer settings when the row columns are empty', () => {
    const fromSettings = tpl({ name: 'settings A5L', paperSize: null, orientation: null,
      displayOptions: JSON.stringify({ salesDesignerSettings: { paperSize: 'A5', orientation: 'landscape' } }) });
    expect(pickSheetTemplate([fromSettings], 'A5L')).toBe(fromSettings);
  });

  it('returns null for A4 (the resolved default handles it), unknown formats and no family', () => {
    expect(pickSheetTemplate(FAMILY, 'A4')).toBe(null);
    expect(pickSheetTemplate(FAMILY, '80mm')).toBe(null);
    expect(pickSheetTemplate(null, 'A5')).toBe(null);
  });

  it('prefers this branch, then global, then the default flag — and never another branch', () => {
    const otherBranch = tpl({ name: 'other', paperSize: 'A5', branchId: 9, isDefault: true });
    const globalDefault = tpl({ name: 'global', paperSize: 'A5', isDefault: true });
    const ownBranch = tpl({ name: 'own', paperSize: 'A5', branchId: 7 });
    expect(pickSheetTemplate([otherBranch, globalDefault, ownBranch], 'A5', 7)).toBe(ownBranch);
    expect(pickSheetTemplate([otherBranch, globalDefault], 'A5', 7)).toBe(globalDefault);
    expect(pickSheetTemplate([otherBranch], 'A5', 7)).toBe(null);
  });

  it('skips inactive rows', () => {
    expect(pickSheetTemplate([{ ...A5_PORTRAIT, isActive: false }], 'A5')).toBe(null);
  });
});

describe('sheetPixelSize', () => {
  it('sizes the preview page to the sheet', () => {
    expect(sheetPixelSize(A4_DEFAULT)).toEqual({ width: 794, height: 1055 });
    expect(sheetPixelSize(A5_PORTRAIT)).toEqual({ width: 559, height: 794 });
    expect(sheetPixelSize(A5_LANDSCAPE)).toEqual({ width: 794, height: 559 });
    expect(sheetPixelSize(null)).toEqual({ width: 794, height: 1055 });
  });
});

describe('usePosPrinting.buildInvoiceSheetHtml', () => {
  const RESOLVED = tpl({ name: 'resolved default' });
  const TAXED = { invoiceNumber: 'SI-1', taxTotal: 5, items: [{ taxAmount: 5 }] };
  const DATA = { docNo: 'SI-1' };
  const OPTIONS = { companyProfile: { companyName: 'Main' } };

  const setup = (over = {}) => renderHook(() => usePosPrinting({
    printerConfigs: [],
    currentTerminal: { branchId: 7 },
    resolvedPosInvoiceTemplate: RESOLVED,
    resolvedPosCreditNoteTemplate: null,
    invoiceTemplateOptions: {},
    tplInvoiceFooter: '',
    tplInvoicePaper: 'A4',
    posInvoiceTemplateFamily: FAMILY,
    branchId: 7,
    ...over,
  }));

  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('A4 keeps printing exactly what resolveInvoiceA4TemplateFor returns', async () => {
    const view = setup();
    await view.result.current.buildInvoiceSheetHtml(TAXED, DATA, OPTIONS);
    expect(generatePrintHtmlAsync.mock.calls[0][0]).toEqual(view.result.current.resolveInvoiceA4TemplateFor(TAXED));
    expect(generatePrintHtmlAsync.mock.calls[0][1]).toBe(DATA);
    expect(generatePrintHtmlAsync.mock.calls[0][2]).toBe(OPTIONS);
    expect(generateOverlayInvoiceHtml).not.toHaveBeenCalled();
  });

  it('defaults a taxed sale to the Tax Invoice paper', async () => {
    const view = setup({ tplInvoicePaper: 'A5L', tplReceiptPaper: 'A5' });
    expect(await view.result.current.buildInvoiceSheetHtml(TAXED, DATA, OPTIONS)).toBe('<doc:A5 · Landscape>');
  });

  it('defaults a no-tax sale to the POS Receipt paper — A5 or the pre-printed form', async () => {
    const noTax = { taxTotal: 0, items: [] };
    const a5 = setup({ tplInvoicePaper: 'A4', tplReceiptPaper: 'A5' });
    expect(await a5.result.current.buildInvoiceSheetHtml(noTax, DATA, OPTIONS)).toBe('<doc:A5 · Portrait>');
    const pre = setup({ tplInvoicePaper: 'A4', tplReceiptPaper: 'PREPRINTED' });
    expect(await pre.result.current.buildInvoiceSheetHtml(noTax, DATA, OPTIONS)).toBe('<overlay:New Pre-printed Form Template>');
  });

  it('paperForSale exposes the same split to the call sites', () => {
    const view = setup({ tplInvoicePaper: 'A5L', tplReceiptPaper: '58mm' });
    expect(view.result.current.paperForSale(TAXED)).toBe('A5L');
    expect(view.result.current.paperForSale({ taxTotal: 0 })).toBe('58mm');
  });

  it.each([
    ['A5', '<doc:A5 · Portrait>'],
    ['A5L', '<doc:A5 · Landscape>'],
  ])('%s prints its family template through the document renderer', async (format, expected) => {
    const view = setup();
    expect(await view.result.current.buildInvoiceSheetHtml(TAXED, DATA, OPTIONS, format)).toBe(expected);
    expect(view.result.current.printFeedback).toBe(null);
  });

  it('a pre-printed form goes through the overlay renderer, untouched by the tax-aware rewrite', async () => {
    const view = setup();
    const html = await view.result.current.buildInvoiceSheetHtml({ items: [] }, DATA, OPTIONS, 'PREPRINTED');
    expect(html).toBe('<overlay:New Pre-printed Form Template>');
    expect(generateOverlayInvoiceHtml.mock.calls[0]).toEqual([PREPRINTED, DATA, OPTIONS]);
    expect(generatePrintHtmlAsync).not.toHaveBeenCalled();
  });

  it('a no-tax sale on an A5 sheet strips the tax columns from that template', async () => {
    const view = setup();
    await view.result.current.buildInvoiceSheetHtml({ taxTotal: 0, items: [] }, DATA, OPTIONS, 'A5');
    const printed = generatePrintHtmlAsync.mock.calls[0][0];
    expect(printed.name).toBe('A5 · Portrait');
    expect(JSON.parse(printed.displayOptions)).toMatchObject({ colVAT: false, showTRN: false });
  });

  it('a missing family template falls back to the default and tells the cashier', async () => {
    const view = setup({ posInvoiceTemplateFamily: [A4_DEFAULT] });
    await act(async () => { await view.result.current.buildInvoiceSheetHtml(TAXED, DATA, OPTIONS, 'A5L'); });
    expect(generatePrintHtmlAsync.mock.calls[0][0]).toEqual(view.result.current.resolveInvoiceA4TemplateFor(TAXED));
    expect(view.result.current.printFeedback).toMatchObject({ type: 'warning' });
    expect(view.result.current.printFeedback.message).toContain('No A5 Landscape Sales Invoice template');
    act(() => { vi.advanceTimersByTime(8000); });
    expect(view.result.current.printFeedback).toBe(null);
  });
});
