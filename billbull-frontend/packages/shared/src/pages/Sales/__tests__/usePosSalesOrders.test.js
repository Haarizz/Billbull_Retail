// POS → Orders: taking a Sales Order up into the cart.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({ getPosSalesOrders: vi.fn(async () => []) }));

import { usePosSalesOrders } from '../POS/features/salesOrders/usePosSalesOrders';

// Minimal stand-in for POSSales' recalculateInvoice: exclusive VAT, bill discount off the total.
const recalculateInvoice = (items, billDiscountAmount = 0) => {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = items.reduce((s, i) => s + i.price * i.quantity * (i.taxRate / 100), 0);
  return { items, subtotal, totalDiscount: 0, tax, taxInclusive: false, billDiscountAmount, total: subtotal + tax - billDiscountAmount };
};

const setup = () => {
  const setCurrentInvoice = vi.fn();
  const setSelectedCustomer = vi.fn();
  const view = renderHook(({ count }) => usePosSalesOrders({
    posSettings: {}, recalculateInvoice, setCurrentInvoice, setSelectedCustomer,
    customerOptions: [{ id: 7, code: 'C-1', name: 'Mecon Star' }], cartItemCount: count,
  }), { initialProps: { count: 0 } });
  return { view, setCurrentInvoice, setSelectedCustomer };
};

const ORDER = {
  id: 1, soNumber: 'SO-0120', customerCode: 'C-1', customerName: 'Mecon Star', deliveryType: 'Delivery',
  // 100 goods + 5 VAT + 25 delivery charge
  orderTotal: 130, deliveryCharge: 25, openAdvance: 0, shippingAddress: 'Deira',
  items: [{ id: 11, itemCode: 'A', description: 'Item A', quantity: 1, price: 100, discount: 0, taxRate: 5 }],
};

describe('usePosSalesOrders.takeUpSalesOrder', () => {
  it('prices the cart to the goods only and keeps the delivery charge aside', () => {
    const { view, setCurrentInvoice, setSelectedCustomer } = setup();
    act(() => { view.result.current.takeUpSalesOrder(ORDER); });

    const cart = setCurrentInvoice.mock.calls[0][0];
    // No bill discount is invented to absorb the charge: the goods already match.
    expect(cart.billDiscountAmount).toBe(0);
    expect(cart.total).toBe(105);
    expect(setSelectedCustomer).toHaveBeenCalledWith(7);
    expect(view.result.current.activeSalesOrder).toMatchObject({
      soNumber: 'SO-0120', deliveryOrder: true, deliveryCharge: 25,
    });
  });

  it('drops the order link once the cart is emptied', () => {
    const { view } = setup();
    act(() => { view.result.current.takeUpSalesOrder(ORDER); });
    view.rerender({ count: 1 });
    expect(view.result.current.activeSalesOrder).not.toBeNull();
    view.rerender({ count: 0 });
    expect(view.result.current.activeSalesOrder).toBeNull();
  });
});
