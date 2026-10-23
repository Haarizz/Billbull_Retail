// POS → Orders: Sales Orders taken up at the till.
//
// Owns the Sales Order the current cart was opened from (activeSalesOrder) and the "Sales Orders"
// tab of the Orders dialog. An order is taken up by loading its customer and lines into the cart;
// from there it is fulfilled one of two ways, decided by the order's delivery type:
//   * Pickup / Courier — an ordinary Checkout. The invoice is linked to the order, which becomes
//     INVOICED; an advance already received on the order is deducted from what is collected.
//   * Delivery — no checkout. Process Delivery sends it out (as a Pro-forma Invoice under the PI
//     Flow workflow) and Delivery Settlement collects the money or returns the goods.
//
// The link lives only as long as the cart: emptying the cart (sale completed, cart cleared,
// order abandoned) drops it, so a later unrelated sale can never be attached to the order.
import { useCallback, useEffect, useState } from 'react';

import { getPosSalesOrders } from '../../../../../api/posApi';
import { isDeliverySalesOrder, mapSalesOrderItemsToCart, toNumber } from '../../posUtils';

/**
 * @param {object}   args
 * @param {object}   args.posSettings
 * @param {Function} args.recalculateInvoice
 * @param {Function} args.setCurrentInvoice
 * @param {Array}    args.customerOptions
 * @param {Function} args.setSelectedCustomer
 * @param {number}   args.cartItemCount      live line count; 0 drops the order link
 */
export function usePosSalesOrders({
  posSettings, recalculateInvoice, setCurrentInvoice, customerOptions, setSelectedCustomer, cartItemCount,
} = {}) {
  const [activeSalesOrder, setActiveSalesOrder] = useState(null);
  // Orders dialog tab: 'SAVED' (the till's own saved orders) | 'SALES' (Customers & Sales orders).
  const [ordersSource, setOrdersSource] = useState('SAVED');
  const [salesOrderRows, setSalesOrderRows] = useState([]);
  const [salesOrderRowsLoading, setSalesOrderRowsLoading] = useState(false);

  useEffect(() => {
    if (cartItemCount === 0 && activeSalesOrder) setActiveSalesOrder(null);
  }, [cartItemCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSalesOrderRows = useCallback(async () => {
    setSalesOrderRowsLoading(true);
    try {
      setSalesOrderRows(await getPosSalesOrders('SALES'));
    } catch (err) {
      console.warn('Failed to load sales orders for the POS', err);
      setSalesOrderRows([]);
    } finally {
      setSalesOrderRowsLoading(false);
    }
  }, []);

  const clearActiveSalesOrder = useCallback(() => setActiveSalesOrder(null), []);

  /**
   * Loads an order into the cart with its customer and links the cart to it. Returns the cart
   * customer (from customerOptions) on success, or null when the order cannot be taken up.
   */
  const takeUpSalesOrder = useCallback((order) => {
    if (!order) return null;
    const items = mapSalesOrderItemsToCart(order, posSettings);
    if (items.length === 0) {
      alert('This order has no items to load.');
      return null;
    }
    const customer = order.customerCode
      ? (customerOptions || []).find(c => (c.code && c.code === order.customerCode) || c.id === order.customerCode)
      : null;
    if (order.customerCode && !customer) {
      alert(`Customer ${order.customerName || order.customerCode} is not available at this till, so order ${order.soNumber} cannot be opened here.`);
      return null;
    }

    // Price the cart to the order's agreed total. The order's footer discount carries over as
    // the bill discount; when the till's VAT basis differs from the order's, the difference is
    // taken up the same way so the customer pays what the order says (as layaway recall does).
    // The order total includes its delivery charge, which is not a cart line: it travels as the
    // delivery order's Delivery Charge (or a Courier checkout's shipping), so compare goods only.
    const orderDeliveryCharge = Math.max(0, toNumber(order.deliveryCharge, 0));
    const storedTotal = toNumber(order.orderTotal, 0) - orderDeliveryCharge;
    const temp = recalculateInvoice(items, 0);
    const cartGross = temp.subtotal - temp.totalDiscount + (temp.taxInclusive ? 0 : temp.tax);
    const storedBillDiscount = toNumber(order.billDiscountAmount, 0);
    const billDiscountAmount = storedBillDiscount > 0
      ? storedBillDiscount
      : Math.max(0, cartGross - storedTotal);
    setCurrentInvoice(recalculateInvoice(items, billDiscountAmount));
    if (customer) setSelectedCustomer(customer.id);

    setActiveSalesOrder({
      id: order.id,
      soNumber: order.soNumber,
      customerCode: order.customerCode || null,
      customerName: order.customerName || null,
      customerId: customer?.id ?? null,
      deliveryOrder: isDeliverySalesOrder(order),
      deliveryType: order.deliveryType || null,
      shippingAddress: order.shippingAddress || '',
      expectedDeliveryDate: order.expectedDeliveryDate || '',
      deliveryInstructions: order.deliveryInstructions || '',
      deliveryCharge: orderDeliveryCharge,
      openAdvance: Math.max(0, toNumber(order.openAdvance, 0)),
    });
    return customer || { id: 'walk-in' };
  }, [posSettings, customerOptions, recalculateInvoice, setCurrentInvoice, setSelectedCustomer]);

  return {
    activeSalesOrder, clearActiveSalesOrder, takeUpSalesOrder,
    // Advance already received on the order — deducted from what the till collects.
    activeSalesOrderAdvance: activeSalesOrder?.openAdvance > 0 ? activeSalesOrder.openAdvance : 0,
    ordersSource, setOrdersSource,
    salesOrderRows, salesOrderRowsLoading, loadSalesOrderRows,
  };
}

export default usePosSalesOrders;
