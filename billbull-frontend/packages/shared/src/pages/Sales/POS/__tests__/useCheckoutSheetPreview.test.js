import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import useCheckoutSheetPreview, { thermalPreviewPaper } from '../features/checkout/useCheckoutSheetPreview';
import { paperForDocument } from '../device/printing/posSheetTemplates';

const taxed = { items: [{ id: 1, name: 'Tank', quantity: 1, price: 100, total: 105, taxRate: 5, taxAmount: 5 }], subtotal: 100, tax: 5, total: 105 };
const untaxed = { items: [{ id: 2, name: 'Coke', quantity: 1, price: 8, total: 8 }], subtotal: 8, tax: 0, total: 8 };

const TPL = {
  receiptPaper: '80mm', invoiceFooter: '', invoiceHeader: 'TAX INVOICE', receiptHeader: 'RECEIPT',
  invoiceShowStamp: false, outletName: 'Shop', outletTrn: '100', outletAddress: 'Addr', outletPhone: '1',
  logoDataUrl: '', stampDataUrl: '', companyLogoUrl: undefined,
};

function setup({ invoicePaper = '80mm', receiptPaper = '80mm', invoice = taxed, open = true, settling = false, family = null } = {}) {
  const buildInvoiceSheetHtml = vi.fn(async (_doc, data, _opts, format) => `<html>${format}:${data.title}</html>`);
  const paperForSale = (doc) => paperForDocument(doc, invoicePaper, receiptPaper);
  const props = {
    open, settling, currentInvoice: invoice, customer: null, invoiceNo: 'INV-1', shippingCharge: 0,
    paymentMode: 'Cash', currentTerminal: { branchId: 1 }, currentSession: null, currency: 'AED',
    paperForSale, buildInvoiceSheetHtml, templateFamily: family, tpl: { ...TPL, receiptPaper },
  };
  const hook = renderHook((p) => useCheckoutSheetPreview(p), { initialProps: props });
  return { ...hook, props, buildInvoiceSheetHtml };
}

describe('useCheckoutSheetPreview — the checkout preview follows the sale paper', () => {
  it('thermal paper: no sheet preview, nothing built, 80mm/58mm passed through', () => {
    const { result, buildInvoiceSheetHtml } = setup({ invoicePaper: '58mm' });
    expect(result.current.isSheet).toBe(false);
    expect(result.current.html).toBe('');
    expect(result.current.thermalPaper).toBe('58mm');
    expect(buildInvoiceSheetHtml).not.toHaveBeenCalled();
    expect(thermalPreviewPaper('80mm')).toBe('80mm');
    expect(thermalPreviewPaper(undefined)).toBe('80mm');
  });

  it('taxed sale on A4 (Tax Invoice tab): builds through the real sheet builder, quietly, with the A4 frame', async () => {
    const { result, buildInvoiceSheetHtml } = setup({ invoicePaper: 'A4' });
    expect(result.current.isSheet).toBe(true);
    expect(result.current.pageSize).toEqual({ width: 794, height: 1055 });
    await waitFor(() => expect(result.current.html).toBe('<html>A4:TAX INVOICE</html>'));
    const [doc, , , format, flags] = buildInvoiceSheetHtml.mock.calls[0];
    expect(doc).toBe(taxed);
    expect(format).toBe('A4');
    expect(flags).toEqual({ quiet: true });
  });

  it('no-tax sale follows the POS Receipt tab paper, not the Tax Invoice one', async () => {
    const { result } = setup({ invoicePaper: '80mm', receiptPaper: 'A5', invoice: untaxed });
    expect(result.current.paper).toBe('A5');
    await waitFor(() => expect(result.current.html).toBe('<html>A5:RECEIPT</html>'));
  });

  it('A5 Landscape uses the family template\'s page box', () => {
    const family = [{ id: 9, isActive: true, paperSize: 'A5', orientation: 'landscape', branchId: null }];
    const { result } = setup({ invoicePaper: 'A5L', family });
    expect(result.current.pageSize).toEqual({ width: 794, height: 559 });
  });

  it('builds nothing while the checkout overlay is closed or the cart is empty', () => {
    const closed = setup({ invoicePaper: 'A4', open: false });
    expect(closed.result.current.html).toBe('');
    expect(closed.buildInvoiceSheetHtml).not.toHaveBeenCalled();
    const empty = setup({ invoicePaper: 'A4', invoice: { items: [], tax: 1 } });
    expect(empty.result.current.html).toBe('');
    expect(empty.buildInvoiceSheetHtml).not.toHaveBeenCalled();
  });

  it('forwards each cart line\'s product image to the sheet print data (Image column)', async () => {
    const withImage = { ...taxed, items: [{ ...taxed.items[0], image: '/uploads/products/tank.jpg' }, { ...untaxed.items[0] }] };
    const { buildInvoiceSheetHtml } = setup({ invoicePaper: 'A4', invoice: withImage });
    await waitFor(() => expect(buildInvoiceSheetHtml).toHaveBeenCalled());
    const [, data] = buildInvoiceSheetHtml.mock.calls[0];
    // Cart is newest-first; the sheet lists lines in scan order.
    expect(data.items.map(i => i.image)).toEqual(['', '/uploads/products/tank.jpg']);
  });

  it('while settling the last sheet is kept and not rebuilt', async () => {
    const { result, rerender, props, buildInvoiceSheetHtml } = setup({ invoicePaper: 'A4' });
    await waitFor(() => expect(result.current.html).not.toBe(''));
    const before = result.current.html;
    const calls = buildInvoiceSheetHtml.mock.calls.length;
    await act(async () => { rerender({ ...props, settling: true, invoiceNo: 'INV-2' }); });
    expect(result.current.html).toBe(before);
    expect(buildInvoiceSheetHtml.mock.calls.length).toBe(calls);
  });
});
