// POS → Orders take-up and the PI Flow document title: the pure pieces, pinned.
import { describe, expect, it } from 'vitest';

import {
  buildPosCheckoutItems, isDeliverySalesOrder, mapSalesOrderItemsToCart, salesOrderLineFields,
} from '../posUtils';
import { getInvoiceDocumentTitle, isProformaDocument } from '../../../../utils/documentTaxType';

const ORDER = {
  id: 9, soNumber: 'SO-0120', customerCode: 'C-1', deliveryType: 'Delivery',
  items: [
    { id: 71, itemCode: 'WHEY2', description: 'Whey Protein 2kg', quantity: 5, price: 149, discount: 0, taxRate: 5, unit: 'BOX' },
    { id: 72, itemCode: 'BCAA', description: 'BCAA Powder', quantity: 3, price: 79, discount: 5, taxRate: 5 },
    { id: 73, itemCode: 'GONE', description: 'Zero qty line', quantity: 0, price: 10 },
  ],
};

describe('mapSalesOrderItemsToCart', () => {
  it('projects order lines into cart lines that keep their order line id and ordered unit', () => {
    const lines = mapSalesOrderItemsToCart(ORDER);
    expect(lines).toHaveLength(2); // the zero-quantity line is dropped
    // Loaded newest-first like a scanned cart, so the order's first line is the cart's last.
    expect(lines.map(l => l.code)).toEqual(['BCAA', 'WHEY2']);
    expect(lines[1]).toMatchObject({
      code: 'WHEY2', name: 'Whey Protein 2kg', quantity: 5, price: 149, taxRate: 5,
      unit: 'BOX', salesOrderItemId: 71, total: 745,
    });
    expect(lines[0]).toMatchObject({ code: 'BCAA', discount: 5, unit: null, salesOrderItemId: 72 });
    expect(lines[0].total).toBeCloseTo(225.15, 2);
  });

  it('falls back to the branch VAT rate for a line with no rate', () => {
    const [line] = mapSalesOrderItemsToCart(
      { items: [{ id: 1, itemCode: 'X', quantity: 1, price: 10 }] },
      { branchDefaultVatRate: 5 },
    );
    expect(line.taxRate).toBe(5);
  });
});

describe('scan order — cart is newest-first, documents are oldest-first', () => {
  it('a Sales Order loaded into the cart and checked out keeps its line order', () => {
    const cart = mapSalesOrderItemsToCart(ORDER);
    expect(buildPosCheckoutItems(cart).map(l => l.itemCode)).toEqual(['WHEY2', 'BCAA']);
  });

  it('the first item scanned is the first invoice line', () => {
    // Two scans: A then B. The cart prepends, so it holds [B, A].
    const cart = [{ code: 'B', name: 'B', quantity: 1, price: 1 }, { code: 'A', name: 'A', quantity: 1, price: 1 }];
    expect(buildPosCheckoutItems(cart).map(l => l.itemCode)).toEqual(['A', 'B']);
  });
});

describe('checkout payload — the Sales Order line link', () => {
  it('adds the line link and ordered unit only to a line that came from an order', () => {
    // Cart order is newest-first; the payload comes out in scan order.
    const [fromOrder, ordinary] = buildPosCheckoutItems([
      { code: 'PEN', name: 'Pen', quantity: 1, price: 2 },
      { code: 'WHEY2', name: 'Whey', quantity: 5, price: 149, salesOrderItemId: 71, unit: 'BOX' },
    ]);
    expect(fromOrder).toMatchObject({ salesOrderItemId: 71, unit: 'BOX' });
    // An ordinary sale's line is byte-for-byte what it always was.
    expect(ordinary).not.toHaveProperty('salesOrderItemId');
    expect(ordinary.unit).toBe('Each');
  });

  it('keeps the till unit when the order line carried none', () => {
    expect(salesOrderLineFields({ salesOrderItemId: 72, unit: null })).toEqual({ salesOrderItemId: 72 });
    expect(salesOrderLineFields({})).toEqual({});
  });
});

describe('isDeliverySalesOrder', () => {
  it('only an explicit Delivery order goes out through Process Delivery', () => {
    expect(isDeliverySalesOrder({ deliveryType: 'Delivery' })).toBe(true);
    expect(isDeliverySalesOrder({ deliveryType: ' delivery ' })).toBe(true);
    expect(isDeliverySalesOrder({ deliveryType: 'Pickup' })).toBe(false);
    expect(isDeliverySalesOrder({ deliveryType: 'Courier' })).toBe(false);
    // The till's own "Save as Order" saves no type — it is a counter sale.
    expect(isDeliverySalesOrder({ deliveryType: null })).toBe(false);
    expect(isDeliverySalesOrder(null)).toBe(false);
  });

  it('prefers the server-computed flag when the row carries one', () => {
    expect(isDeliverySalesOrder({ deliveryType: 'Pickup', deliveryOrder: true })).toBe(true);
  });
});

describe('PI Flow document title', () => {
  it('titles a pending Pro-forma Invoice PRO-FORMA INVOICE, over any template header', () => {
    const pi = { posProformaPending: true, taxTotal: 48.51 };
    expect(isProformaDocument(pi)).toBe(true);
    expect(getInvoiceDocumentTitle(pi)).toBe('PRO-FORMA INVOICE');
    expect(getInvoiceDocumentTitle(pi, { titleOverride: 'TAX INVOICE' })).toBe('PRO-FORMA INVOICE');
  });

  it('a converted invoice prints as the tax invoice it now is', () => {
    expect(getInvoiceDocumentTitle({ posProformaPending: false, taxTotal: 48.51 })).toBe('TAX INVOICE');
    expect(getInvoiceDocumentTitle({ taxTotal: 0 })).toBe('SALES INVOICE');
  });
});
