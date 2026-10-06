import React from 'react';
import {
  ScanLine, Plus, Pause, Archive, FileText, Truck, Tag, Zap, RotateCcw, Search,
  Calculator, CreditCard, Hash, DollarSign, Receipt, Package, Printer,
  PackageCheck, Lock, XCircle
} from 'lucide-react';

import { applyPosFunctionAccess } from './posFunctionAccess';

/**
 * The single definition of the template-independent POS Functions/Actions buttons.
 *
 * Classic, Cart Focus and the compact Trade POS all render this one list, so the set,
 * labels, icons, colours and ordering can never drift apart. Interaction-specific
 * buttons (Add Qty / Discount / Price / Remove) stay inline in each template because
 * their behaviour depends on that template's editing model (inline numpad vs
 * middle-column keypad vs none at all).
 *
 * `ctx` is the POSSales-owned prop bag the templates already receive — this builder
 * never owns state, it only wires the buttons to the dialogs POSSales renders.
 *
 * `group` is advisory: templates that section the panel (Trade POS) use it; the flat
 * grids in POSTouchScreen ignore it and keep rendering the list in order.
 *
 * ACCESS MODE. The list is passed through applyPosFunctionAccess() before it is returned, so
 * Console -> Behavior -> Action Button Access is enforced here once instead of in each of the
 * three templates. In ALL_USERS (the default) the list comes back untouched.
 */
export const buildPosFunctionButtons = (ctx, iconCls = 'h-4 w-4') => {
  const {
    salespersonRequired, verifiedSalesperson, openSalespersonScanModal,
    setShowQuickProductModal, setShowLayawaysList, setShowSaveLayaway,
    setShowSaveOrderDialog, setShowAddShippingDialog, setShowCouponsDialog,
    setShowPromotionsDialog, setShowReturn,
    setShowProductSearch, setProductSearchQuery, setProductSearchResults,
    setShowPriceCheck, setPriceCheckQuery, setPriceCheckResult,
    setShowCreditBalance, setCreditBalanceQuery, setCreditBalanceResult,
    setShowSerialBatch, setSerialBatchQuery, setSerialBatchResult, setSerialBatchSubView,
    setSerialBatchInvoiceNo, setSerialBatchItemCode, setSerialBatchCustomerMobile,
    setSerialBatchSelectedItem,
    setShowCashDropDialog, setShowLastReceiptDialog, setShowOrdersListDialog,
    setShowReprintModal, openDeliveryModal,
    setShowDeliverySettleModal, setDeliverySettleSearch, setDeliverySettlePersonFilter,
    setDeliverySettleSelected,
    setShowLockPOS, currentSession, setCurrentView,
    // Console -> Behavior -> Action Button Access. All four are POSSales-owned; absent
    // (older callers, tests) they resolve to the historical unrestricted behaviour.
    posFunctionAccessMode, isPosSupervisorUser,
    requestFunctionApproval, onFunctionDenied,
  } = ctx;

  const buttons = [
    // Salesperson re-verification. Present only while POS salesperson verification is ON, and it
    // opens the SAME modal the header's Scan button does, writing to the SAME useSalesperson
    // state — it is a second entry point, never a second source of truth.
    ...(salespersonRequired ? [{
      id: 'salesperson',
      group: 'Sales',
      label: verifiedSalesperson
        ? `Salesperson: ${verifiedSalesperson.name || verifiedSalesperson.employeeCode || ''}`.trim()
        : 'Salesperson',
      icon: <ScanLine className={iconCls} />,
      color: verifiedSalesperson
        ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
        : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700',
      action: () => openSalespersonScanModal?.(),
    }] : []),
    { id: 'quick-add-product', group: 'Sales', label: 'Quick Add Product', icon: <Plus className={iconCls} />, color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700', action: () => setShowQuickProductModal(true) },
    { id: 'layaways', group: 'Sales', label: 'Layaways', icon: <Pause className={iconCls} />, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700', action: () => setShowLayawaysList(true) },
    { id: 'save-layaway', group: 'Sales', label: 'Save Layaway', icon: <Archive className={iconCls} />, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700', action: () => setShowSaveLayaway(true) },
    { id: 'save-order', group: 'Sales', label: 'Save as Order', icon: <FileText className={iconCls} />, color: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700', action: () => setShowSaveOrderDialog(true) },
    { id: 'add-shipping', group: 'Sales', label: 'Add Shipping', icon: <Truck className={iconCls} />, color: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700', action: () => setShowAddShippingDialog(true) },
    { id: 'coupons', group: 'Sales', label: 'Coupons', icon: <Tag className={iconCls} />, color: 'bg-pink-50 hover:bg-pink-100 border-pink-200 text-pink-700', action: () => setShowCouponsDialog(true) },
    { id: 'promotions', group: 'Sales', label: 'Promotions', icon: <Zap className={iconCls} />, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800', action: () => setShowPromotionsDialog(true) },
    // Opens the shared Sales Return workflow. It owns and resets its own state on mount,
    // so there is nothing for POS to clear here.
    { id: 'return', group: 'Sales', label: 'Return', icon: <RotateCcw className={iconCls} />, color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700', action: () => setShowReturn(true) },
    { id: 'search-products', group: 'Lookup', label: 'Search Products', icon: <Search className={iconCls} />, color: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700', action: () => { setProductSearchQuery(''); setProductSearchResults([]); setShowProductSearch(true); } },
    { id: 'price-chk', group: 'Lookup', label: 'Price Check', icon: <Calculator className={iconCls} />, color: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-700', action: () => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); } },
    { id: 'credit-balance', group: 'Lookup', label: 'Credit Balance', icon: <CreditCard className={iconCls} />, color: 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700', action: () => { setCreditBalanceQuery(''); setCreditBalanceResult(null); setShowCreditBalance(true); } },
    { id: 'serial-batch', group: 'Lookup', label: 'Serial/Batch Check', icon: <Hash className={iconCls} />, color: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700', action: () => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setSerialBatchInvoiceNo(''); setSerialBatchItemCode(''); setSerialBatchCustomerMobile(''); setSerialBatchSelectedItem(null); setShowSerialBatch(true); } },
    { id: 'cash-drop', group: 'Cash & Receipts', label: 'Cash Drawer', icon: <DollarSign className={iconCls} />, color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700', action: () => setShowCashDropDialog(true) },
    { id: 'last-receipt', group: 'Cash & Receipts', label: 'Last Receipt', icon: <Receipt className={iconCls} />, color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600', action: () => setShowLastReceiptDialog(true) },
    { id: 'orders', group: 'Cash & Receipts', label: 'Orders', icon: <Package className={iconCls} />, color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700', action: () => setShowOrdersListDialog() },
    { id: 'reprint', group: 'Cash & Receipts', label: 'Reprint', icon: <Printer className={iconCls} />, color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600', action: () => setShowReprintModal(true) },
    { id: 'delivery', group: 'Delivery', label: 'Delivery', icon: <Truck className={iconCls} />, color: 'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action: () => openDeliveryModal() },
    { id: 'delivery-settle', group: 'Delivery', label: 'Delivery Settle', icon: <PackageCheck className={iconCls} />, color: 'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action: () => { setDeliverySettleSearch(''); setDeliverySettlePersonFilter('All Persons'); setDeliverySettleSelected(null); setShowDeliverySettleModal(true); } },
    { id: 'lock-pos', group: 'Session', label: 'Lock POS', icon: <Lock className={iconCls} />, color: 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700', action: () => setShowLockPOS(true) },
    { id: 'close-session', group: 'Session', label: 'Close Session', icon: <XCircle className={iconCls} />, color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600', action: () => { if (currentSession?.status === 'OPEN') setCurrentView('x-report'); } },
  ];

  return applyPosFunctionAccess(buttons, {
    mode: posFunctionAccessMode,
    isSupervisor: isPosSupervisorUser,
    requestFunctionApproval,
    onFunctionDenied,
  });
};

export default buildPosFunctionButtons;
