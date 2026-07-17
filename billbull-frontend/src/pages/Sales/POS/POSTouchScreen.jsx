import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, ChevronRight, Calculator, RefreshCw, X, CreditCard, Banknote, ShoppingCart, Tag, Monitor, Settings, LayoutGrid, CheckCircle, ChevronDown, User, XCircle, Clock, Plus, Minus, Percent, Pause, Archive, FileText, TrendingUp, Zap, RotateCcw, DollarSign, Receipt, Hash, Printer, Lock, Truck, PackageCheck, Package, Trash2, Heart, AlertTriangle, AlertCircle, Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { DirhamSymbol, CurrencyAmount, formatCurrencyStr } from './POSCurrency';
import { WALK_IN_CUSTOMER } from './posConstants';
import { toNumber } from './posUtils';
import { computeLineTaxTotals } from '../../../utils/vatMath';

const POSTouchScreen = React.memo((props) => {
  const {
    // legacy props (original interface — kept for compatibility)
    touchSearchQuery, setTouchSearchQuery, selectedTouchCategory, setSelectedTouchCategory, filteredTouchProducts, handleAddToCart,
    cart, cartTotals, touchNumpadValue, setTouchNumpadValue,
    handleHoldBill, handleRecallHoldBill, handleClearCart, setCart, handleNumpadAction, numpadTotal,
    // navigation
    setCurrentView,
    // session
    currentSession,
    // settings
    posSettings,
    // invoice
    currentInvoice, currentInvoiceRef, invoiceCounter,
    // products
    posProducts, filteredProducts, posProductsLoading, posProductsLoadingMore, posProductsError,
    posProductPage, posProductTotalPages, posProductTotalElements, loadMorePosProducts,
    productCategories, horizontalCategories, selectedCategory, setSelectedCategory,
    // search / barcode
    searchQuery, setSearchQuery, barcodeInput, setBarcodeInput, barcodeInputRef,
    barcodeScanFeedback, lastScannedItem, handleBarcodeScan, handleUnifiedEntry,
    barcodeSuggestions, barcodeSuggestionsLoading, setBarcodeSuggestions,
    scannerConfig,
    // customers
    customerOptions, selectedCustomer, setSelectedCustomer, selectedCustomerData,
    customerSearchQuery, setCustomerSearchQuery, showCustomerDropdown, setShowCustomerDropdown,
    filteredCustomerOptions, customerHistory, customerHistoryLoading, openCustomerHistoryPreview,
    posCustomersLoading, posCustomersError,
    // cart actions
    addToInvoice, updateQuantity, updateDiscount, updateItemPrice, voidFromInvoice,
    guardedRemoveFromInvoice, guardedClearInvoice, holdInvoice, recallInvoice, heldSales, holdBusy, deleteHeldBill,
    // layaway
    activeLayawayId, activeLayawayDeposit,
    // shipping (order-level flat charge, not a cart line)
    shippingCharge = 0,
    // focus / numpad
    posActionMode, setPosActionMode, selectedFocusItemId, setSelectedFocusItemId,
    classicNumpadMode, setClassicNumpadMode, classicNumpadValue, setClassicNumpadValue,
    classicDiscountType, setClassicDiscountType, discountInputType, setDiscountInputType,
    resetFocusMode,
    // right panel
    rightPanelTab, setRightPanelTab, hiddenPanelButtons, hideCategoriesPanel, hideItemsPanel,
    // layout
    posTemplate,
    // cart view
    cartViewDetailed, cartLineDetails,
    // checkout / payment
    setShowPaymentDialog, setTenderedAmount, setCheckoutPhase, setCheckoutKeypadMode,
    setCheckoutKeypadTarget, setCheckoutKeypadVisible,
    // dialogs
    setShowPOSConfig, setShowCashDropDialog, setShowLastReceiptDialog,
    setShowReprintModal, setShowSaveOrderDialog, setShowLayawaysList, setShowSaveLayaway, setShowOrdersListDialog,
    setShowCouponsDialog, setShowPromotionsDialog, setShowPriceCheck, setPriceCheckQuery,
    setPriceCheckResult, setShowProductSearch, setProductSearchQuery, setProductSearchResults,
    setShowCreditBalance, setCreditBalanceQuery, setCreditBalanceResult,
    setShowSerialBatch, setSerialBatchQuery, setSerialBatchResult, setSerialBatchSubView,
    setSerialBatchInvoiceNo, setSerialBatchItemCode, setSerialBatchCustomerMobile, setSerialBatchSelectedItem,
    setShowServiceRepair, setServiceView, setShowReturn, setReturnStep, setReturnInvoiceQuery,
    setReturnInvoiceFound, setReturnSelectedItems, setReturnReasons, setShowAddShippingDialog,
    openDeliveryModal,
    setShowDeliverySettleModal, setDeliverySettleSearch, setDeliverySettlePersonFilter,
    setDeliverySettleSelected, setDeliverySettlePayMode, setShowLockPOS,
    // utils
    formatCurrency, showFeedback, sessionId,
    // favourites
    favouriteProductIds = new Set(), toggleFavourite,
    // quick creation modals
    showQuickCustomerModal, setShowQuickCustomerModal, quickCustomerForm, setQuickCustomerForm, quickCustomerDuplicateWarning, setQuickCustomerDuplicateWarning, quickCustomerLoading, quickCustomerError, openQuickCustomerModal, handleSaveQuickCustomer,
    showQuickProductModal, setShowQuickProductModal, quickProductForm, setQuickProductForm, quickProductDuplicateWarning, setQuickProductDuplicateWarning, quickProductLoading, quickProductError, handleSaveQuickProduct,
  } = props;

  const [animatingHearts, setAnimatingHearts] = useState(new Set());
  const scannerBufferRef = useRef('');
  const scannerTimerRef = useRef(null);
  const scannerReady = Boolean(scannerConfig?.enabled) && scannerConfig?.status === 'ACTIVE' && scannerConfig?.inputMode === 'KEYBOARD_WEDGE';

  useEffect(() => {
    if (!scannerReady || !scannerConfig?.autoFocusOnPOS) return undefined;
    if (posActionMode === 'qty' || posActionMode === 'discount') return undefined;
    const timer = window.setTimeout(() => {
      barcodeInputRef?.current?.focus?.();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [
    barcodeInputRef,
    currentInvoice.items.length,
    lastScannedItem?.barcode,
    posActionMode,
    scannerConfig?.autoFocusOnPOS,
    scannerReady,
  ]);

  useEffect(() => {
    if (!scannerReady) return undefined;

    const resetScannerBuffer = () => {
      scannerBufferRef.current = '';
      if (scannerTimerRef.current) {
        window.clearTimeout(scannerTimerRef.current);
        scannerTimerRef.current = null;
      }
    };

    const scheduleScannerReset = () => {
      if (scannerTimerRef.current) {
        window.clearTimeout(scannerTimerRef.current);
      }
      scannerTimerRef.current = window.setTimeout(() => {
        scannerBufferRef.current = '';
        scannerTimerRef.current = null;
      }, 250);
    };

    const isTextEntryTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (posActionMode === 'qty' || posActionMode === 'discount') return;

      const activeTarget = event.target;
      const barcodeTarget = barcodeInputRef?.current || null;
      const allowWedgeCapture = activeTarget === barcodeTarget || !isTextEntryTarget(activeTarget);
      if (!allowWedgeCapture) return;

      if (event.key === 'Enter') {
        const scannedValue = scannerBufferRef.current.trim();
        if (!scannedValue) return;
        event.preventDefault();
        resetScannerBuffer();
        setBarcodeInput(scannedValue);
        handleBarcodeScan(scannedValue);
        return;
      }

      if (event.key.length !== 1) return;
      scannerBufferRef.current += event.key;
      scheduleScannerReset();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      resetScannerBuffer();
    };
  }, [barcodeInputRef, handleBarcodeScan, posActionMode, scannerReady, setBarcodeInput]);

  const handleHeartClick = useCallback((e, productId) => {
    e.stopPropagation();
    if (!toggleFavourite) return;
    setAnimatingHearts(prev => new Set([...prev, productId]));
    toggleFavourite(productId);
    setTimeout(() => {
      setAnimatingHearts(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }, 300);
  }, [toggleFavourite]);

  // Selecting a suggestion from the Cart Focus scan/search dropdown adds it straight
  // to the cart, same as scanning its barcode.
  const selectBarcodeSuggestion = useCallback((product) => {
    const res = addToInvoice(product, 1);
    if (res && res.ok === false) {
      showFeedback('error', res.reason || 'Could not add this item.');
      return;
    }
    showFeedback('success', `${product.name} added`);
    setBarcodeInput('');
    setBarcodeSuggestions([]);
  }, [addToInvoice, showFeedback, setBarcodeInput, setBarcodeSuggestions]);

  // Shared, template-independent Actions/Functions buttons. Defined once so the
  // Classic and Cart Focus panels render the same set, labels, icons and colours
  // and never drift apart. Interaction-specific buttons (Add Qty / Discount /
  // Price / Remove) stay inline in each template because their behaviour depends
  // on that template's editing model (inline numpad vs middle-column keypad).
  const commonActionButtons = (iconCls = 'h-4 w-4') => [
    { id: 'quick-add-product', label: 'Quick Add Product', icon: <Plus className={iconCls} />, color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700', action: () => setShowQuickProductModal(true) },
    { id: 'layaways', label: 'Layaways', icon: <Pause className={iconCls} />, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700', action: () => setShowLayawaysList(true) },
    { id: 'save-layaway', label: 'Save Layaway', icon: <Archive className={iconCls} />, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700', action: () => setShowSaveLayaway(true) },
    { id: 'save-order', label: 'Save as Order', icon: <FileText className={iconCls} />, color: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700', action: () => setShowSaveOrderDialog(true) },
    { id: 'add-shipping', label: 'Add Shipping', icon: <Truck className={iconCls} />, color: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700', action: () => setShowAddShippingDialog(true) },
    { id: 'coupons', label: 'Coupons', icon: <Tag className={iconCls} />, color: 'bg-pink-50 hover:bg-pink-100 border-pink-200 text-pink-700', action: () => setShowCouponsDialog(true) },
    { id: 'promotions', label: 'Promotions', icon: <Zap className={iconCls} />, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800', action: () => setShowPromotionsDialog(true) },
    { id: 'return', label: 'Return', icon: <RotateCcw className={iconCls} />, color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700', action: () => { setReturnStep(1); setReturnInvoiceQuery(''); setReturnInvoiceFound(null); setReturnSelectedItems({}); setReturnReasons({}); setShowReturn(true); } },
    { id: 'search-products', label: 'Search Products', icon: <Search className={iconCls} />, color: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700', action: () => { setProductSearchQuery(''); setProductSearchResults([]); setShowProductSearch(true); } },
    { id: 'price-chk', label: 'Price Check', icon: <Calculator className={iconCls} />, color: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-700', action: () => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); } },
    { id: 'credit-balance', label: 'Credit Balance', icon: <CreditCard className={iconCls} />, color: 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700', action: () => { setCreditBalanceQuery(''); setCreditBalanceResult(null); setShowCreditBalance(true); } },
    { id: 'serial-batch', label: 'Serial/Batch Check', icon: <Hash className={iconCls} />, color: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700', action: () => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setSerialBatchInvoiceNo(''); setSerialBatchItemCode(''); setSerialBatchCustomerMobile(''); setSerialBatchSelectedItem(null); setShowSerialBatch(true); } },
    { id: 'cash-drop', label: 'Cash Drawer', icon: <DollarSign className={iconCls} />, color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700', action: () => setShowCashDropDialog(true) },
    { id: 'last-receipt', label: 'Last Receipt', icon: <Receipt className={iconCls} />, color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600', action: () => setShowLastReceiptDialog(true) },
    { id: 'orders', label: 'Orders', icon: <Package className={iconCls} />, color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700', action: () => setShowOrdersListDialog() },
    { id: 'reprint', label: 'Reprint', icon: <Printer className={iconCls} />, color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600', action: () => setShowReprintModal(true) },
    { id: 'delivery', label: 'Delivery', icon: <Truck className={iconCls} />, color: 'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action: () => openDeliveryModal() },
    { id: 'delivery-settle', label: 'Delivery Settle', icon: <PackageCheck className={iconCls} />, color: 'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action: () => { setDeliverySettleSearch(''); setDeliverySettlePersonFilter('All Persons'); setDeliverySettleSelected(null); setDeliverySettlePayMode('Cash'); setShowDeliverySettleModal(true); } },
    { id: 'lock-pos', label: 'Lock POS', icon: <Lock className={iconCls} />, color: 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700', action: () => setShowLockPOS(true) },
    { id: 'close-session', label: 'Close Session', icon: <XCircle className={iconCls} />, color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600', action: () => { if (currentSession?.status === 'OPEN') setCurrentView('x-report'); } },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#F7F7FA]">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => setCurrentView('dashboard')}
              className="border-[#F5C742] text-[#F5C742] hover:bg-[#F5C742] hover:text-white"
            >
              ← Dashboard
            </Button>
            <div>
              <p className="text-[#1E293B]">Session: {currentSession?.id}</p>
              <p className="text-sm text-gray-600">
                {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPOSConfig(true)}
              className="border-[#327F74]/40 text-[#327F74]"
            >
              <Settings className="h-4 w-4 mr-1" />
              Configure
            </Button>
          </div>
        </div>
      </div>


      {/* Cart Focus: three-equal-column layout — saffron gradient + white theme */}
      {posTemplate === 'focus' ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-white">

          {/* ══ COL 1: Cart / Bill ══════════════════════════════ */}
          <div className="flex-1 flex flex-col lg:border-r-2 border-b-2 lg:border-b-0 border-[#327F74]/30 min-w-0 min-h-0 bg-white">

            {/* Customer bar */}
            <div className="bg-[#F5C742] px-3 py-2.5 flex-shrink-0 relative border-b border-[#327F74]/30">
              <button type="button" onClick={() => setShowCustomerDropdown(v => !v)}
                className="w-full flex items-center justify-between gap-2 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    {selectedCustomerData?.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate leading-none">{selectedCustomerData?.name}</p>
                    {selectedCustomerData?.tier
                      ? <p className="text-[10px] text-white/80 mt-0.5">{selectedCustomerData.tier} · {selectedCustomerData.loyaltyPoints} pts</p>
                      : <p className="text-[10px] text-white/70 mt-0.5">Walk-in</p>}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-white/70 flex-shrink-0 transition-transform ${showCustomerDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showCustomerDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-[#327F74]/30 shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-[#327F74]/10">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input autoFocus type="text" placeholder="Search Name, Mobile, Email, TRN..." value={customerSearchQuery}
                        onChange={e => setCustomerSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-[#327F74]/30 rounded focus:outline-none focus:border-[#327F74]" />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {posCustomersLoading && (
                      <div className="px-3 py-3 text-xs text-gray-400">Loading customers...</div>
                    )}
                    {!posCustomersLoading && filteredCustomerOptions.map(customer => (
                      <button key={customer.id} type="button"
                        onClick={() => { setSelectedCustomer(customer.id); setShowCustomerDropdown(false); setCustomerSearchQuery(''); }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F5C742]/10 transition-colors text-left border-b border-[#327F74]/10 ${selectedCustomer === customer.id ? 'bg-[#F5C742]/10' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">{customer.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E293B] truncate">{customer.name}</p>
                          {customer.membershipId && <p className="text-[10px] text-gray-400">{customer.membershipId} {customer.tier ? `· ${customer.tier}` : ''}</p>}
                        </div>
                      </button>
                    ))}
                    {!posCustomersLoading && filteredCustomerOptions.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400">
                        {posCustomersError || 'No customers found'}
                      </div>
                    )}
                    <div className="p-2 bg-slate-50 border-t border-[#327F74]/10">
                      <button type="button" onClick={() => { setShowCustomerDropdown(false); openQuickCustomerModal(customerSearchQuery); }}
                        className="w-full py-2 px-3 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors">
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        Create New Customer: "{customerSearchQuery || 'Enter details'}"
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cart table header + rows — horizontal scroll is the safety net on narrow
                widths so the 12-col grid degrades to scrollable instead of clipping. */}
            <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0">
              {/* Cart table header */}
              <div className="bg-[#F5C742]/10 border-b border-[#327F74]/20 flex-shrink-0 grid grid-cols-12 gap-1 px-3 py-2 min-w-[360px]">
                <span className="col-span-6 text-[10px] font-bold uppercase tracking-wide text-gray-500">Item</span>
                <span className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 text-center">Qty</span>
                <span className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 text-right">Rate</span>
                <span className="col-span-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 text-right">Amt</span>
                <span className="col-span-1"></span>
              </div>

              {/* Cart rows */}
              <div className="flex-1 overflow-y-auto min-w-[360px]">
                {currentInvoice.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-300">
                    <ShoppingCart className="h-14 w-14 mb-3" />
                    <p className="text-sm font-medium text-gray-400">Scan a barcode to begin</p>
                  </div>
                ) : (
                  currentInvoice.items.map((item, idx) => {
                    return (
                      <div key={item.id} onClick={() => { if (posActionMode !== 'none' && !item.isVoided) setSelectedFocusItemId(item.id); }}
                        className={`grid grid-cols-12 gap-1 px-3 py-2 border-b border-[#327F74]/20 items-start ${item.isVoided ? 'bg-red-50/70' : selectedFocusItemId === item.id ? 'ring-2 ring-[#F5C742] bg-[#F5C742]/10' : idx % 2 === 1 ? 'bg-[#F5C742]/10' : 'bg-white'} ${posActionMode !== 'none' && !item.isVoided ? 'cursor-pointer' : ''}`}>
                        <div className="col-span-6 min-w-0">
                          {/* Voided line: muted red + [VOID] tag + negative amounts (no
                              strike-through). Excluded from the total; disclosed below. */}
                          <p className={`text-xs font-semibold leading-tight break-words ${item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>
                            {item.name}
                            {item.isVoided && <span className="ml-1 text-[9px] font-bold text-red-500">[VOID]</span>}
                          </p>
                          {!item.isVoided && (item.nameAr ? <p className="text-[10px] text-gray-400 leading-tight break-words" dir="rtl">{item.nameAr}</p> : null)}
                          {!item.isVoided && (cartViewDetailed ? (
                            <div className="mt-0.5 space-y-px">
                              {cartLineDetails(item).map(d => (
                                <p key={d.label} className="text-[8px] font-mono text-gray-500 leading-tight break-all">
                                  <span className="text-gray-400">{d.label}:</span> <span className="text-[#327F74] font-semibold">{d.value}</span>
                                </p>
                              ))}
                            </div>
                          ) : (
                            <>
                              <p className="text-[9px] font-mono text-[#F5C742] mt-0.5">{item.barcode || item.code || item.id}</p>
                              {item.pinnedBatchNumber && (
                                <span className="inline-block mt-0.5 px-1 py-px rounded bg-[#327F74]/10 text-[8px] font-mono font-bold text-[#327F74]">⛓ {item.pinnedBatchNumber}</span>
                              )}
                            </>
                          ))}
                        </div>
                        <div className="col-span-2 flex items-center justify-center gap-0.5 pt-0.5">
                          {!item.isVoided && !item.batchControlled && <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity - 1); }}
                            className="w-7 h-7 rounded bg-gray-100 hover:bg-[#F5C742] hover:text-white text-gray-600 text-xs font-bold flex items-center justify-center transition-colors">−</button>}
                          <span className={`text-xs font-bold w-5 text-center ${item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>{item.isVoided ? `- ${item.quantity}` : item.quantity}</span>
                          {!item.isVoided && !item.batchControlled && <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity + 1); }}
                            className="w-7 h-7 rounded bg-gray-100 hover:bg-[#F5C742] hover:text-white text-gray-600 text-xs font-bold flex items-center justify-center transition-colors">+</button>}
                        </div>
                        <span className={`col-span-2 text-[10px] text-right pt-1 whitespace-nowrap ${item.isVoided ? 'text-red-500' : 'text-gray-400'}`}>{item.isVoided ? <CurrencyAmount amount={item.price} prefix="- " /> : formatCurrency(item.price)}</span>
                        <span className={`col-span-1 text-xs font-bold text-right pt-1 whitespace-nowrap ${item.isVoided ? 'text-red-500' : 'text-[#F5C742]'}`}>{item.isVoided ? <CurrencyAmount amount={item.total} prefix="- " /> : formatCurrency(item.total)}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); voidFromInvoice(item.id); }}
                          className={`col-span-1 flex justify-center pt-1 transition-colors ${item.isVoided ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Cart footer — items count + invoice counter */}
            <div className="bg-[#F5C742] px-4 py-3 flex-shrink-0 border-t border-[#327F74]/30">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-white/70 tracking-wide">Items</p>
                    <p className="text-xl font-black text-white">{currentInvoice.items.reduce((s, i) => s + i.quantity, 0)}</p>
                  </div>
                  <div className="w-px bg-white/30"></div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-white/70 tracking-wide">Invoice #</p>
                    <p className="text-xl font-black text-white">{invoiceCounter + 1}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={holdInvoice} disabled={currentInvoice.items.length === 0 || holdBusy || !sessionId}
                    title={!sessionId ? 'Open a POS session to hold a bill' : ''}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-30 transition-colors">
                    <Pause className="h-3.5 w-3.5" />Hold
                  </button>
                  <div className="w-px h-4 bg-white/30"></div>
                  <button type="button" onClick={guardedClearInvoice} disabled={currentInvoice.items.length === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-30 transition-colors">
                    <X className="h-3.5 w-3.5" />Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ══ COL 2: Last Item + Barcode Scan + Keypad + Total ═ */}
          <div className="flex-1 flex flex-col lg:border-r-2 border-b-2 lg:border-b-0 border-[#327F74]/30 min-w-0 min-h-0 bg-white overflow-hidden">

            {/* Last scanned item panel */}
            <div className="border-b border-[#327F74]/20 flex-shrink min-h-0 max-h-[30vh] flex flex-col justify-center bg-white overflow-y-auto">
              {lastScannedItem ? (
                (() => {
                  const cartItem = currentInvoice.items.find(i => i.barcode === lastScannedItem.barcode || i.code === lastScannedItem.barcode || i.id === lastScannedItem.barcode || i.name === lastScannedItem.name) || currentInvoice.items[0];
                  const matchingProduct = posProducts.find(p => p.barcode === lastScannedItem.barcode || p.code === lastScannedItem.barcode || p.id === lastScannedItem.barcode || p.name === lastScannedItem.name);
                  const qty = lastScannedItem.qty || 1;
                  const unitPrice = cartItem?.price || matchingProduct?.price || (lastScannedItem.total / qty);
                  const discountPct = cartItem?.discount || matchingProduct?.defaultDiscount || 0;
                  const taxRate = cartItem?.taxRate ?? matchingProduct?.salesTax ?? 5;
                  const discountedUnitPrice = unitPrice * (1 - discountPct / 100);
                  const { taxableAmount: netPrice, taxAmount: vatAmount } = computeLineTaxTotals({
                    netAfterDiscount: discountedUnitPrice,
                    taxPercent: taxRate,
                    vatMode: posSettings?.taxInclusive ? 'INCLUSIVE' : 'EXCLUSIVE',
                  });
                  const stockQty = matchingProduct?.stock ?? 25;

                  return (
                    <div className="bg-gradient-to-br from-[#FFF8E7] to-white p-5 flex-1 flex flex-col justify-between text-[#1E293B] border-l-4 border-[#F5C742]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#B8942E]">Last Scanned Item</span>
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">{lastScannedItem.name} added</span>
                        </div>
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-[#F5C742]/15 border border-[#F5C742]/40 flex items-center justify-center flex-shrink-0 text-[#B8942E]">
                            <Package className="h-6 w-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-base font-bold text-[#1E293B] leading-tight break-words">{lastScannedItem.name}</p>
                                <p className="text-[11px] font-mono text-[#B8942E] mt-1">{lastScannedItem.barcode}</p>
                                {lastScannedItem.nameAr && <p className="text-xs text-gray-500 mt-1 break-words" dir="rtl">{lastScannedItem.nameAr}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Line Total</p>
                                <p className="text-xl font-black text-[#B8942E] mt-0.5">{formatCurrency(lastScannedItem.total)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-t border-[#F5C742]/30 pt-4">
                        <div className="bg-white border border-[#327F74]/15 rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Qty</p>
                          <p className="text-sm font-bold text-[#1E293B] mt-1">x{qty}</p>
                        </div>
                        <div className="bg-white border border-[#327F74]/15 rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Unit Price</p>
                          <p className="text-sm font-bold text-[#1E293B] mt-1">{formatCurrency(unitPrice)}</p>
                        </div>
                        <div className="bg-white border border-[#327F74]/15 rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Discount</p>
                          <p className="text-sm font-bold text-[#1E293B] mt-1">{discountPct}%</p>
                        </div>
                        <div className="bg-white border border-[#327F74]/15 rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">VAT ({taxRate}%)</p>
                          <p className="text-sm font-bold text-[#1E293B] mt-1">{formatCurrency(vatAmount)}</p>
                        </div>
                        <div className="bg-white border border-[#327F74]/15 rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Net Price</p>
                          <p className="text-sm font-bold text-[#1E293B] mt-1">{formatCurrency(netPrice)}</p>
                        </div>
                        <div className="bg-white border border-[#327F74]/15 rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Stock</p>
                          <p className="text-sm font-bold text-[#1E293B] mt-1">{stockQty} units</p>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white text-center">
                  <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-[#327F74]/30 flex items-center justify-center mb-3 bg-[#327F74]/5">
                    <Clock className="h-6 w-6 text-[#327F74]/50" />
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#327F74] mb-1">Last Scanned Item</p>
                  <p className="text-xs text-gray-400">Scan a barcode to see item details</p>
                </div>
              )}
            </div>

            {/* Numpad + Barcode Input */}
            <div className="flex-1 flex flex-col justify-between p-4 bg-white min-h-0 overflow-y-auto">
              {posActionMode !== 'none' && (
                <div className="mb-3 rounded-xl bg-[#F5C742]/10 border border-[#327F74]/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#F5C742] mb-1">
                    {posActionMode === 'qty' ? 'Qty Mode' : posActionMode === 'price' ? 'Price Mode' : 'Discount Mode'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedFocusItemId
                      ? `Item: ${currentInvoice.items.find(i => i.id === selectedFocusItemId)?.name}`
                      : 'Click a cart item to select it'}
                  </p>
                  {posActionMode === 'discount' && selectedFocusItemId && (
                    <div className="flex gap-1.5 mt-2">
                      <button type="button" onClick={() => setDiscountInputType('percent')}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-colors ${discountInputType === 'percent' ? 'bg-[#F5C742] text-white border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                        % Percent
                      </button>
                      <button type="button" onClick={() => setDiscountInputType('amount')}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-colors ${discountInputType === 'amount' ? 'bg-[#F5C742] text-white border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                        <DirhamSymbol /> Amount
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={resetFocusMode} className="mt-1.5 text-[10px] text-gray-400 hover:text-red-400 underline">Cancel</button>
                </div>
              )}

              {/* Input Box & Scanner Status */}
              <div className="mb-3 relative">
                {scannerReady && (
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green-700 border border-green-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Scanner Ready
                  </div>
                )}
                <div className="border-2 border-[#F5C742] rounded-xl px-3 py-2 bg-white shadow-sm flex items-center justify-between">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        setBarcodeSuggestions([]);
                        return;
                      }
                      if (e.key === 'Enter') {
                        if (posActionMode === 'qty' && selectedFocusItemId) {
                          const qty = parseInt(barcodeInput, 10);
                          if (qty > 0) updateQuantity(selectedFocusItemId, qty);
                          resetFocusMode();
                        } else if (posActionMode === 'discount' && selectedFocusItemId) {
                          const val = parseFloat(barcodeInput) || 0;
                          if (discountInputType === 'percent') {
                            updateDiscount(selectedFocusItemId, Math.min(val, 100));
                          } else {
                            const item = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                            if (item) {
                              const pct = Math.min((val / (item.price * item.quantity)) * 100, 100);
                              updateDiscount(selectedFocusItemId, pct);
                            }
                          }
                          resetFocusMode();
                        } else if (posActionMode === 'price' && selectedFocusItemId) {
                          const val = parseFloat(barcodeInput) || 0;
                          updateItemPrice(selectedFocusItemId, val);
                          resetFocusMode();
                        } else {
                          setBarcodeSuggestions([]);
                          handleBarcodeScan(barcodeInput);
                        }
                      }
                    }}
                    placeholder="Scan barcode or enter 3*CODE.."
                    className="w-full bg-transparent text-[#1E293B] placeholder-gray-300 px-1 text-sm font-mono focus:outline-none"
                    autoFocus
                  />
                  <button type="button" onClick={() => { setBarcodeSuggestions([]); handleBarcodeScan(barcodeInput); }}
                    className="bg-[#F5C742] hover:opacity-90 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm flex-shrink-0 ml-2">
                    ADD
                  </button>
                </div>

                {/* Live "select item" suggestions — item code, barcode, or product name,
                    matched anywhere in the string. Hidden while the field is repurposed
                    as a qty/discount/price numpad. */}
                {posActionMode === 'none' && barcodeInput.trim() && (barcodeSuggestionsLoading || barcodeSuggestions.length > 0) && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-xl border border-gray-200 shadow-lg max-h-72 overflow-y-auto">
                    {barcodeSuggestionsLoading && barcodeSuggestions.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                        <div className="w-3.5 h-3.5 border-2 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin" />
                        Searching…
                      </div>
                    ) : (
                      barcodeSuggestions.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectBarcodeSuggestion(product)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5C742]/10 transition-colors text-left border-b border-gray-50 last:border-b-0"
                        >
                          <div className="w-8 h-8 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                            {product.image
                              ? <img src={product.image} className="w-full h-full object-cover" alt="" />
                              : <Package className="w-3.5 h-3.5 text-gray-300" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#1E293B] leading-tight truncate">{product.name}</p>
                            <p className="text-[10px] font-mono text-gray-400 truncate">{product.code}{product.barcode ? ` | ${product.barcode}` : ''}</p>
                          </div>
                          <p className="text-xs font-bold text-[#327F74] shrink-0">{formatCurrency(product.price)}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {barcodeScanFeedback && (
                  <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${barcodeScanFeedback.type === 'success' ? 'bg-green-500/20 text-green-700' :
                      barcodeScanFeedback.type === 'customer' ? 'bg-blue-500/20 text-blue-700' : 'bg-red-500/20 text-red-700'
                    }`}>
                    {barcodeScanFeedback.type === 'success' && <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                    {barcodeScanFeedback.type === 'customer' && <User className="h-3.5 w-3.5 flex-shrink-0" />}
                    {barcodeScanFeedback.type === 'error' && <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                    {barcodeScanFeedback.message}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(k => (
                  <button key={k} type="button" onClick={() => setBarcodeInput(prev => prev + k)}
                    className="h-12 text-xl font-bold text-[#1E293B] bg-gray-50 hover:bg-[#F5C742] hover:text-white active:scale-95 rounded-xl border border-[#327F74]/20 hover:border-[#F5C742] transition-all shadow-sm">
                    {k}
                  </button>
                ))}
                <button type="button" onClick={() => setBarcodeInput(prev => prev + '*')}
                  className="h-12 text-xl font-bold text-[#F5C742] bg-gray-50 hover:bg-[#F5C742] hover:text-white active:scale-95 rounded-xl border border-[#327F74]/20 hover:border-[#F5C742] transition-all shadow-sm">
                  ×
                </button>
                <button type="button" onClick={() => setBarcodeInput(prev => prev + '0')}
                  className="h-12 text-xl font-bold text-[#1E293B] bg-gray-50 hover:bg-[#F5C742] hover:text-white active:scale-95 rounded-xl border border-[#327F74]/20 hover:border-[#F5C742] transition-all shadow-sm">
                  0
                </button>
                <button type="button" onClick={() => setBarcodeInput(prev => prev.slice(0, -1))}
                  className="h-12 text-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 rounded-xl border border-[#327F74]/20 transition-all shadow-sm flex items-center justify-center">
                  ⌫
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button type="button" onClick={() => { setBarcodeInput(''); if (posActionMode !== 'none') resetFocusMode(); }}
                  className="h-12 text-sm font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors">
                  Clear
                </button>
                <button type="button" onClick={() => {
                  if (posActionMode === 'qty' && selectedFocusItemId) {
                    const qty = parseInt(barcodeInput, 10);
                    if (qty > 0) updateQuantity(selectedFocusItemId, qty);
                    resetFocusMode();
                  } else if (posActionMode === 'discount' && selectedFocusItemId) {
                    const val = parseFloat(barcodeInput) || 0;
                    if (discountInputType === 'percent') {
                      updateDiscount(selectedFocusItemId, Math.min(val, 100));
                    } else {
                      const item = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                      if (item) {
                        const pct = Math.min((val / (item.price * item.quantity)) * 100, 100);
                        updateDiscount(selectedFocusItemId, pct);
                      }
                    }
                    resetFocusMode();
                  } else if (posActionMode === 'price' && selectedFocusItemId) {
                    const val = parseFloat(barcodeInput) || 0;
                    updateItemPrice(selectedFocusItemId, val);
                    resetFocusMode();
                  } else {
                    handleBarcodeScan(barcodeInput);
                  }
                }}
                  className="h-12 text-sm font-bold text-white bg-[#F5C742] hover:opacity-90 rounded-xl transition-all shadow-sm">
                  Enter ↵
                </button>
              </div>
            </div>

            {/* Invoice total — big, in middle column footer */}
            <div className="bg-[#F5C742] px-4 py-4 flex-shrink-0 flex items-center justify-between gap-4 border-t border-[#327F74]/30">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Invoice Total</p>
                {currentInvoice.totalDiscount > 0 && (
                  <p className="text-xs text-white/80 font-medium">Disc: −{formatCurrency(currentInvoice.totalDiscount)}</p>
                )}
                {(Number(shippingCharge) || 0) > 0 && (
                  <p className="text-xs text-white/80 font-medium">Shipping: {formatCurrency(Number(shippingCharge) || 0)}</p>
                )}
              </div>
              <p className="text-3xl font-black text-white tabular-nums">
                {formatCurrency(currentInvoice.total + (Number(shippingCharge) || 0))}
              </p>
            </div>
          </div>

          {/* ══ COL 3: Tabbed Panel ════════════════════════════ */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white lg:border-l-2 border-[#327F74]/30">

            {/* Tab bar */}
            <div className="flex flex-shrink-0 border-b-2 border-[#327F74]/20 bg-white">
              {([['functions', 'Functions'], ['history', 'History']]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setRightPanelTab(id)}
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wide transition-all border-b-2 -mb-[2px] ${rightPanelTab === id
                      ? 'border-[#327F74] text-[#327F74] bg-[#327F74]/5'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Functions tab ── */}
            {rightPanelTab === 'functions' && (
              <div className="flex-1 overflow-y-auto p-3">
                {(() => {
                  // Interaction-specific buttons (Cart Focus uses the middle-column
                  // keypad via posActionMode); shared buttons come from the single
                  // commonActionButtons() definition so both templates stay in sync.
                  const interactive = [
                    { id: 'add-qty', label: 'Add Qty', icon: <Plus className="h-5 w-5" />, color: `bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 ${posActionMode === 'qty' ? 'ring-2 ring-[#F5C742] bg-blue-100' : ''}`, action: () => { setPosActionMode(m => m === 'qty' ? 'none' : 'qty'); setBarcodeInput(''); setSelectedFocusItemId(null); } },
                    { id: 'discount', label: 'Discount', icon: <Percent className="h-5 w-5" />, color: `bg-[#FEF9E7] hover:bg-[#F5C742]/20 border-[#F5C742]/40 text-[#B8942E] ${posActionMode === 'discount' ? 'ring-2 ring-[#F5C742] bg-[#F5C742]/20' : ''}`, action: () => { setPosActionMode(m => m === 'discount' ? 'none' : 'discount'); setBarcodeInput(''); setSelectedFocusItemId(null); setDiscountInputType('percent'); } },
                    { id: 'price', label: 'Price', icon: <Tag className="h-5 w-5" />, color: `bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 ${posActionMode === 'price' ? 'ring-2 ring-[#F5C742] bg-purple-100' : ''}`, action: () => { setPosActionMode(m => m === 'price' ? 'none' : 'price'); setBarcodeInput(''); setSelectedFocusItemId(null); } },
                    { id: 'remove', label: 'Remove Item', icon: <Trash2 className="h-5 w-5" />, color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600', action: () => { const last = currentInvoice.items[0]; if (last) guardedRemoveFromInvoice(last.id); } },
                  ];
                  const allBtns = [...interactive, ...commonActionButtons('h-5 w-5')];
                  const visible = allBtns.filter(b => !hiddenPanelButtons.has(b.id));
                  // Held bills are managed from the Layaways list (Save Layaway /
                  // Layaways action) — not duplicated here as a separate notifier.
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
                      {visible.map(btn => (
                        <button key={btn.id} type="button" onClick={btn.action}
                          className={`flex flex-col items-center justify-center gap-1.5 min-h-[72px] py-2 rounded-xl border transition-colors ${btn.color}`}>
                          {btn.icon}
                          <span className="text-[10px] font-semibold leading-tight text-center px-1">{btn.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── History tab ── */}
            {rightPanelTab === 'history' && (
              <div className="flex-1 overflow-y-auto">
                {/* Customer header */}
                <div className="px-3 py-2 bg-[#327F74]/5 border-b border-[#327F74]/20 flex-shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#327F74]">
                    {selectedCustomerData?.id === WALK_IN_CUSTOMER.id ? 'Walk-in - no history' : selectedCustomerData?.name}
                  </p>
                  {selectedCustomerData?.tier && (
                    <p className="text-[10px] text-gray-400">{selectedCustomerData.tier} · {selectedCustomerData.loyaltyPoints} pts</p>
                  )}
                </div>

                {selectedCustomerData?.id === WALK_IN_CUSTOMER.id ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-300 gap-2">
                    <User className="h-8 w-8" />
                    <p className="text-xs text-gray-400">Select a customer to view history</p>
                  </div>
                ) : customerHistoryLoading ? (
                  <div className="flex items-center justify-center h-24 text-gray-400 text-xs gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading…
                  </div>
                ) : customerHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-300 gap-2">
                    <Receipt className="h-8 w-8" />
                    <p className="text-xs text-gray-400">No previous purchases</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#327F74]/10">
                    {customerHistory.map(inv => {
                      const mode = inv.paymentMode || 'Cash';
                      const fmtDate = inv.invoiceDate
                        ? new Date(inv.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—';
                      return (
                        <button type="button" key={inv.id} onClick={() => openCustomerHistoryPreview(inv)}
                          className="group w-full text-left px-3 py-2.5 hover:bg-[#327F74]/5 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#1E293B] leading-tight">{inv.invoiceNumber}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate} · {inv.itemCount} items</p>
                              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${mode === 'Cash' ? 'bg-[#F5C742]/10 text-[#B8942E] border-[#F5C742]/30' :
                                  mode === 'Card' ? 'bg-[#327F74]/10 text-[#327F74] border-[#327F74]/30' :
                                    'bg-purple-50 text-purple-700 border-purple-200'
                                }`}>{mode}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-[#327F74] leading-none">{formatCurrency(inv.invoiceTotal)}</span>
                                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-400 group-hover:border-[#327F74]/40 group-hover:text-[#327F74] transition-colors">
                                  <Eye className="h-3.5 w-3.5" />
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${inv.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-200' :
                                  inv.status === 'PARTIALLY_PAID' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                    'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>{inv.status?.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Checkout button — always visible */}
            <div className="mt-auto border-t-2 border-[#F5C742]/30 shrink-0">
              {activeLayawayId && activeLayawayDeposit > 0 && (
                <div className="flex justify-between text-[11px] text-green-700 font-bold mb-1.5 px-3 pt-3">
                  <span>Deposit Applied</span><span>−{formatCurrencyStr(activeLayawayDeposit)}</span>
                </div>
              )}
              <button type="button"
                onClick={() => {
                  const grandWithShip = currentInvoice.total + (Number(shippingCharge) || 0);
                  const balanceDue = activeLayawayId && activeLayawayDeposit > 0
                    ? Math.max(0, grandWithShip - activeLayawayDeposit)
                    : grandWithShip;
                  setCheckoutPhase('payment');
                  setShowPaymentDialog(true);
                  setTenderedAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
                  setCheckoutKeypadVisible(false); setCheckoutKeypadMode('numeric'); setCheckoutKeypadTarget('tender');
                }}
                disabled={currentInvoice.items.length === 0}
                className={`w-full min-h-[72px] bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-40 disabled:cursor-not-allowed text-[#1E293B] font-black flex flex-col items-center justify-center py-3 transition-all ${(!activeLayawayId || activeLayawayDeposit <= 0) ? 'mt-0' : ''}`}>
                <div className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-6 w-6" />
                  <span className="tracking-wide uppercase">Checkout</span>
                </div>
                {currentInvoice.total > 0 && (
                  <span className="text-sm font-bold opacity-90 mt-1">
                    {activeLayawayId && activeLayawayDeposit > 0
                      ? `Balance ${formatCurrency(Math.max(0, currentInvoice.total + (Number(shippingCharge) || 0) - activeLayawayDeposit))}`
                      : formatCurrency(currentInvoice.total + (Number(shippingCharge) || 0))}
                  </span>
                )}
              </button>
            </div>
          </div>

        </div>
      ) : (

        /* ═══════════════════════════════════════════════════════════
           CLASSIC LAYOUT  —  3-column: Cart | Categories+Items | Functions
           ═══════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#F7F7FA]">

          {/* ══ COL 1: CART ════════════════════════════════════════ */}
          <div className="w-full lg:w-[260px] xl:w-[340px] 2xl:w-[440px] shrink-0 flex flex-col max-h-[45vh] lg:max-h-none min-h-0 lg:border-r-2 border-b-2 lg:border-b-0 border-[#F5C742]/30 bg-white">

            {/* Customer bar — gold, matches Cart Focus */}
            <div className="bg-[#F5C742] px-3 py-2.5 shrink-0 relative border-b border-[#e6b838]">
              <button type="button" onClick={() => setShowCustomerDropdown(v => !v)}
                className="w-full flex items-center justify-between gap-2 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate leading-none">{selectedCustomerData?.name}</p>
                    {selectedCustomerData?.tier
                      ? <p className="text-[10px] text-white/80 mt-0.5">{selectedCustomerData.tier} · {selectedCustomerData.loyaltyPoints} pts</p>
                      : <p className="text-[10px] text-white/70 mt-0.5">Walk-in</p>}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-white/70 shrink-0 transition-transform ${showCustomerDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showCustomerDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-[#F5C742]/30 shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input autoFocus type="text" placeholder="Search Name, Mobile, Email, TRN..." value={customerSearchQuery}
                        onChange={e => setCustomerSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-[#F5C742]" />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {posCustomersLoading && (
                      <div className="px-3 py-3 text-xs text-gray-400">Loading customers...</div>
                    )}
                    {!posCustomersLoading && filteredCustomerOptions.map(customer => (
                      <button key={customer.id} type="button"
                        onClick={() => { setSelectedCustomer(customer.id); setShowCustomerDropdown(false); setCustomerSearchQuery(''); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F5C742]/10 text-left border-b border-gray-50 ${selectedCustomer === customer.id ? 'bg-[#F5C742]/10' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center shrink-0 text-white text-xs font-bold">{customer.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E293B] truncate">{customer.name}</p>
                          {customer.membershipId && <p className="text-[10px] text-gray-400">{customer.membershipId}{customer.tier ? ` · ${customer.tier}` : ''}</p>}
                        </div>
                      </button>
                    ))}
                    {!posCustomersLoading && filteredCustomerOptions.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400">
                        {posCustomersError || 'No customers found'}
                      </div>
                    )}
                    <div className="p-2 bg-slate-50 border-t border-gray-100">
                      <button type="button" onClick={() => { setShowCustomerDropdown(false); openQuickCustomerModal(customerSearchQuery); }}
                        className="w-full py-2 px-3 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors">
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        Create New Customer: "{customerSearchQuery || 'Enter details'}"
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cart column header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white shrink-0">
              <div className="flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5 text-[#F5C742]" />
                <span className="text-xs font-bold text-[#1E293B] uppercase tracking-wide">Cart</span>
                {currentInvoice.items.length > 0 && <span className="text-[10px] font-bold bg-[#F5C742]/20 text-[#b8920e] px-1.5 py-0.5 rounded-full">{currentInvoice.items.length}</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 font-mono">INV-{String(invoiceCounter + 1).padStart(4, '0')}</span>
                <button type="button" onClick={guardedClearInvoice} disabled={currentInvoice.items.length === 0}
                  className="ml-1 text-gray-300 hover:text-red-400 disabled:opacity-30 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Cart table header + rows — horizontal scroll is the safety net on narrow
                widths so the 12-col grid degrades to scrollable instead of clipping. */}
            <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0">
              {/* Cart table header */}
              <div className="grid grid-cols-12 gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0 min-w-[360px]">
                <span className="col-span-5 text-[9px] font-bold uppercase tracking-wide text-gray-400">Item</span>
                <span className="col-span-2 text-[9px] font-bold uppercase tracking-wide text-gray-400 text-center">Qty</span>
                <span className="col-span-2 text-[9px] font-bold uppercase tracking-wide text-gray-400 text-right">Rate</span>
                <span className="col-span-2 text-[9px] font-bold uppercase tracking-wide text-gray-400 text-right pr-2">Amt</span>
                <span className="col-span-1"></span>
              </div>

              {/* Cart item rows */}
              <div className="flex-1 overflow-y-auto min-w-[360px]">
                {currentInvoice.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                    <ShoppingCart className="h-10 w-10" />
                    <p className="text-xs font-medium">Cart is empty</p>
                    <p className="text-[10px]">Tap items to add</p>
                  </div>
                ) : (
                  currentInvoice.items.map((item, idx) => (
                    <div key={item.id}
                      className={`grid grid-cols-12 gap-1 items-center px-3 py-2 border-b border-gray-50 transition-colors cursor-pointer group ${item.isVoided ? 'bg-red-50/70' : selectedFocusItemId === item.id ? 'bg-[#F5C742]/10 border-l-2 border-l-[#F5C742]' : idx % 2 === 0 ? 'bg-white hover:bg-[#F5C742]/5' : 'bg-gray-50/60 hover:bg-[#F5C742]/5'}`}
                      onClick={() => !item.isVoided && setSelectedFocusItemId(item.id === selectedFocusItemId ? null : item.id)}>
                      <div className="col-span-5 min-w-0 pr-1">
                        {/* Voided line: muted red + [VOID] tag + negative amounts (no
                            strike-through). Excluded from the total; disclosed below. */}
                        <p className={`text-[11px] font-semibold break-words leading-tight ${item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>
                          {item.name}
                          {item.isVoided && <span className="ml-1 text-[9px] font-bold text-red-500">[VOID]</span>}
                        </p>
                        {!item.isVoided && (cartViewDetailed ? (
                          cartLineDetails(item).map(d => (
                            <p key={d.label} className="text-[8px] font-mono text-gray-500 leading-tight break-all">
                              <span className="text-gray-400">{d.label}:</span> <span className="text-[#327F74] font-semibold">{d.value}</span>
                            </p>
                          ))
                        ) : (
                          item.pinnedBatchNumber && (
                            <span className="inline-block px-1 py-px rounded bg-[#327F74]/10 text-[8px] font-mono font-bold text-[#327F74]">⛓ {item.pinnedBatchNumber}</span>
                          )
                        ))}
                        {!item.isVoided && item.discount > 0 && <p className="text-[9px] text-green-600">−{item.discount}% disc</p>}
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-0.5">
                        {!item.isVoided && !item.batchControlled && <>
                          <button type="button" onClick={e => { e.stopPropagation(); updateQuantity(item.id, item.quantity - 1); }}
                            className="w-7 h-7 rounded bg-gray-100 hover:bg-[#F5C742]/20 flex items-center justify-center text-gray-500 transition-colors">
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                        </>}
                        <span className={`text-xs font-bold w-5 text-center ${item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>{item.isVoided ? `- ${item.quantity}` : item.quantity}</span>
                        {!item.isVoided && !item.batchControlled && <button type="button" onClick={e => { e.stopPropagation(); updateQuantity(item.id, item.quantity + 1); }}
                          className="w-7 h-7 rounded bg-gray-100 hover:bg-[#F5C742]/20 flex items-center justify-center text-gray-500 transition-colors">
                          <Plus className="h-2.5 w-2.5" />
                        </button>}
                      </div>
                      <span className={`col-span-2 text-[10px] text-right ${item.isVoided ? 'text-red-500' : 'text-gray-500'}`}>{item.isVoided ? `- ${item.price.toFixed(0)}` : item.price.toFixed(0)}</span>
                      <span className={`col-span-2 text-[11px] font-bold text-right pr-2 whitespace-nowrap ${item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>{item.isVoided ? <CurrencyAmount amount={item.total} prefix="- " /> : formatCurrency(item.total)}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); voidFromInvoice(item.id); }}
                        className={`col-span-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all ${item.isVoided ? 'opacity-100 text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
                        <XCircle className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Cart totals */}
            <div className="border-t-2 border-[#F5C742]/30 bg-white shrink-0">
              <div className="px-3 py-2 space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Subtotal</span><span>{formatCurrency(currentInvoice.subtotal)}</span>
                </div>
                {currentInvoice.totalDiscount > 0 && (
                  <div className="flex justify-between text-xs text-green-600">
                    <span>Discount</span><span>−{formatCurrency(currentInvoice.totalDiscount)}</span>
                  </div>
                )}
                {currentInvoice.billDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-green-600">
                    <span>Bill Discount</span><span>−{formatCurrency(currentInvoice.billDiscountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{(() => {
                    const rates = [...new Set(currentInvoice.items.filter(i => !i.isVoided).map(i => toNumber(i.taxRate, 5)))];
                    const base = rates.length === 1 ? `VAT (${rates[0]}%)` : 'VAT';
                    return currentInvoice.taxInclusive ? `${base} incl.` : base;
                  })()}</span><span>{formatCurrency(currentInvoice.tax)}</span>
                </div>
                {/* Informational: voided lines excluded from TOTAL, shown only
                    when at least one line was voided. */}
                {currentInvoice.voidedCount > 0 && (
                  <div className="flex justify-between text-xs text-red-500">
                    <span>Voided Items ({currentInvoice.voidedCount})</span><span>− {formatCurrency(currentInvoice.voidedTotal)}</span>
                  </div>
                )}
                {(Number(shippingCharge) || 0) > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Shipping</span><span>{formatCurrency(Number(shippingCharge) || 0)}</span>
                  </div>
                )}
                {activeLayawayId && activeLayawayDeposit > 0 && (
                  <div className="flex justify-between text-xs text-green-600 font-semibold border-t border-green-100 pt-1 mt-1">
                    <span>Deposit Paid</span><span>−{formatCurrency(activeLayawayDeposit)}</span>
                  </div>
                )}
              </div>
              <div className="bg-[#F5C742] px-3 py-2.5 flex items-center justify-between">
                <div>
                  {activeLayawayId && activeLayawayDeposit > 0 ? (
                    <>
                      <p className="text-[10px] font-bold text-white/80 uppercase tracking-wide">Balance Due</p>
                      <p className="text-xl font-black text-white leading-none">{formatCurrency(Math.max(0, currentInvoice.total + (Number(shippingCharge) || 0) - activeLayawayDeposit))}</p>
                      <p className="text-[10px] text-white/70">Total: {formatCurrency(currentInvoice.total + (Number(shippingCharge) || 0))}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-white/80 uppercase tracking-wide">Total</p>
                      <p className="text-xl font-black text-white leading-none">{formatCurrency(currentInvoice.total + (Number(shippingCharge) || 0))}</p>
                    </>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={holdInvoice} disabled={currentInvoice.items.length === 0 || holdBusy || !sessionId}
                    title={!sessionId ? 'Open a POS session to hold a bill' : ''}
                    className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-40">
                    <Pause className="h-3 w-3" />Hold
                  </button>
                  <button type="button" onClick={guardedClearInvoice} disabled={currentInvoice.items.length === 0}
                    className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-40">
                    <X className="h-3 w-3" />Clear
                  </button>
                </div>
              </div>
              {/* Held bills are recalled from the Layaways list, not shown here. */}
            </div>
          </div>

          {/* ══ COL 2: CATEGORIES + ITEMS ══════════════════════════ */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-w-0 min-h-0">

            {/* Category sidebar */}
            {!hideCategoriesPanel && (
              <div className="w-full md:w-[110px] lg:w-[130px] xl:w-[148px] shrink-0 max-h-[30vh] md:max-h-none bg-white border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto">
                <div className="p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-300 px-1 pb-1.5">Categories</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-2 gap-2">
                    {productCategories.map(cat => (
                      <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full min-h-[84px] flex flex-col items-center justify-center gap-1.5 px-1.5 py-2 rounded-2xl border transition-all text-center ${selectedCategory === cat.id ? 'border-[#F5C742] bg-[#F5C742]/10 shadow-[0_4px_12px_rgba(245,199,66,0.18)]' : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'}`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${selectedCategory === cat.id ? 'bg-[#F5C742] text-white' : 'bg-gray-100 text-gray-500'}`}>
                          <cat.icon className="h-4 w-4" />
                        </div>
                        <span className={`text-[9px] font-bold leading-tight line-clamp-2 ${selectedCategory === cat.id ? 'text-[#1E293B]' : 'text-gray-500'}`}>{cat.name}</span>
                        <span className={`text-[8px] leading-none ${selectedCategory === cat.id ? 'text-[#b8920e]' : 'text-gray-300'}`}>
                          {cat.count === null || cat.count === undefined ? '' : `${cat.count} items`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Items area */}
            {!hideItemsPanel && (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#F7F7FA]">
                {/* Search bar */}
                <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
                  {/* Unified search + scan: type to filter the grid, Enter / scan to add */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[140px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        placeholder="Scan or search — item, barcode, batch, customer…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUnifiedEntry(searchQuery, { fromGrid: true }); }}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <button type="button" onClick={() => handleUnifiedEntry(searchQuery, { fromGrid: true })}
                      className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#F5C742]/40 bg-[#F5C742]/10 text-[#B8942E] hover:bg-[#F5C742]/20">
                      Add
                    </button>
                  </div>
                  {barcodeScanFeedback && (
                    <div className={`mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${barcodeScanFeedback.type === 'success' ? 'bg-green-500/15 text-green-700' :
                        barcodeScanFeedback.type === 'customer' ? 'bg-blue-500/15 text-blue-700' : 'bg-red-500/15 text-red-700'
                      }`}>
                      {barcodeScanFeedback.type === 'success' && <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                      {barcodeScanFeedback.type === 'customer' && <User className="h-3.5 w-3.5 flex-shrink-0" />}
                      {barcodeScanFeedback.type === 'error' && <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                      {barcodeScanFeedback.message}
                    </div>
                  )}
                  {/* Horizontal category pill strip — All Items | Favourites | Recently Sold | Top Sold */}
                  <div className="flex gap-1.5 mt-2 pb-0.5 overflow-x-auto">
                    {(horizontalCategories || []).map(cat => (
                      <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.id)}
                        className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${selectedCategory === cat.id ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-500 hover:border-[#F5C742]/50 bg-white'}`}>
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product grid — tightened slightly to balance the wider 2-column category panel */}
                <div className="flex-1 overflow-y-auto p-2.5">
                  {posProductsError && (
                    <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {posProductsError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                    {filteredProducts.map(product => {
                      const isFav = favouriteProductIds.has(product.id);
                      return (
                        <button key={product.id} type="button" onClick={() => {
                          const pin = product._pinnedBatch || null;
                          if (pin && currentInvoiceRef.current?.items?.some(i => i.pinnedBatchNumber === pin)) {
                            showFeedback('error', `Batch ${pin} is already in the cart`);
                            return;
                          }
                          const res = addToInvoice(product, 1, pin);
                          if (res && res.ok === false) {
                            showFeedback('error', res.reason || 'Could not add this item.');
                            return;
                          }
                          if (pin) setSearchQuery('');
                        }}
                          className="group bg-white rounded-xl border border-gray-200 hover:border-[#F5C742] hover:shadow-md transition-all text-left overflow-hidden active:scale-95">
                          {/* Image area */}
                          <div className="aspect-[0.95/1] bg-gradient-to-br from-[#F7F7FA] to-gray-100 flex items-center justify-center relative border-b border-gray-100">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-7 w-7 text-[#F5C742] opacity-40 group-hover:opacity-70 transition-opacity" />
                            )}
                            {/* Heart favourite button — bottom-right of image */}
                            {toggleFavourite && (
                              <button
                                type="button"
                                onClick={e => handleHeartClick(e, product.id)}
                                className="absolute bottom-1 right-1 z-10 p-0.5 rounded-full bg-white/80 hover:bg-white transition-all"
                                title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                              >
                                <Heart
                                  className={`h-3.5 w-3.5 transition-colors duration-200${animatingHearts.has(product.id) ? ' heart-pop' : ''}`}
                                  style={{
                                    fill: isFav ? '#ef4444' : 'none',
                                    stroke: isFav ? '#ef4444' : '#9ca3af',
                                  }}
                                />
                              </button>
                            )}
                            {product.stock <= 5 && product.stock > 0 && (
                              <span className="absolute top-1 right-1 text-[8px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded">LOW</span>
                            )}
                            {product.stock === 0 && (
                              <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-[9px] font-black text-red-500">OUT</span>
                            )}
                          </div>
                          {/* Info */}
                          <div className="p-1.5">
                            <p className="text-[10px] font-semibold text-[#1E293B] leading-tight line-clamp-2">{product.name}</p>
                            <p className="text-[8px] font-mono text-gray-400 mt-0.5 truncate">{product.barcode || product.id}</p>
                            <div className="flex items-center justify-between gap-1 mt-1">
                              <p className="text-[11px] font-black text-[#F5C742]">{formatCurrency(product.price)}</p>
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${product.stock > 10 ? 'bg-green-50 text-green-600' : product.stock > 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                                {product.stock}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {posProductsLoading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                      {Array.from({ length: 10 }).map((_, index) => (
                        <div key={index} className="h-44 animate-pulse rounded-xl border border-gray-200 bg-white">
                          <div className="h-28 rounded-t-xl bg-gray-100" />
                          <div className="space-y-2 p-2">
                            <div className="h-3 rounded bg-gray-100" />
                            <div className="h-2 w-2/3 rounded bg-gray-100" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!posProductsLoading && filteredProducts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-300">
                      {selectedCategory === 'favourites' ? (
                        <>
                          <Heart className="h-10 w-10 mb-2" />
                          <p className="text-xs text-center px-4">No favourite products yet.<br />Tap the heart icon to add products.</p>
                        </>
                      ) : selectedCategory === 'recently-sold' ? (
                        <>
                          <Clock className="h-10 w-10 mb-2" />
                          <p className="text-xs">No recently sold products.</p>
                        </>
                      ) : selectedCategory === 'top-sold' ? (
                        <>
                          <TrendingUp className="h-10 w-10 mb-2" />
                          <p className="text-xs">No sales data available.</p>
                        </>
                      ) : (
                        <>
                          <Package className="h-10 w-10 mb-2" />
                          <p className="text-xs">No items found</p>
                        </>
                      )}
                    </div>
                  )}
                  {!posProductsLoading && posProductPage + 1 < posProductTotalPages && (
                    <div className="flex justify-center py-3">
                      <button
                        type="button"
                        onClick={loadMorePosProducts}
                        disabled={posProductsLoadingMore}
                        className="rounded-lg border border-[#F5C742]/50 bg-white px-4 py-2 text-xs font-bold text-[#b8920e] hover:bg-[#F5C742]/10 disabled:opacity-50"
                      >
                        {posProductsLoadingMore ? 'Loading...' : `Load more (${filteredProducts.length}/${posProductTotalElements})`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ══ COL 3: FUNCTIONS (Cart Focus style) ════════════════ */}
          <div className="w-full lg:w-[180px] xl:w-[210px] 2xl:w-[250px] shrink-0 bg-white lg:border-l-2 border-t-2 lg:border-t-0 border-[#F5C742]/30 flex flex-col max-h-[45vh] lg:max-h-none min-h-0 overflow-hidden">

            {/* Tab bar */}
            <div className="flex border-b border-gray-100 shrink-0">
              {(['functions', 'history']).map(tab => (
                <button key={tab} type="button" onClick={() => setRightPanelTab(tab)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${rightPanelTab === tab ? 'border-b-2 border-[#327F74] text-[#327F74]' : 'border-b-2 border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {tab === 'functions' ? 'Actions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Functions tab — with inline numpad for Disc%, Add Qty, Price */}
            {rightPanelTab === 'functions' && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* ── Inline numpad panel ── */}
                {classicNumpadMode !== 'none' && (() => {
                  const selectedItem = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                  const modeLabel = classicNumpadMode === 'qty' ? 'Set Quantity' : classicNumpadMode === 'discount' ? 'Set Discount' : 'Set Price';
                  const modeColor = classicNumpadMode === 'qty' ? 'text-blue-600' : classicNumpadMode === 'discount' ? 'text-[#B8942E]' : 'text-purple-600';
                  const handleNumpadEnter = () => {
                    if (!selectedFocusItemId) return;
                    const val = parseFloat(classicNumpadValue) || 0;
                    if (classicNumpadMode === 'qty') {
                      if (val > 0) updateQuantity(selectedFocusItemId, Math.round(val));
                    } else if (classicNumpadMode === 'discount') {
                      if (classicDiscountType === 'percent') {
                        updateDiscount(selectedFocusItemId, Math.min(val, 100));
                      } else {
                        const it = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                        if (it) updateDiscount(selectedFocusItemId, Math.min((val / (it.price * it.quantity)) * 100, 100));
                      }
                    } else if (classicNumpadMode === 'price') {
                      updateItemPrice(selectedFocusItemId, val);
                    }
                    setClassicNumpadMode('none');
                    setClassicNumpadValue('');
                  };
                  return (
                    <div key={classicNumpadMode} className="bg-white border-b border-gray-200 p-2.5 shrink-0">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-wide ${modeColor}`}>{modeLabel}</span>
                        <button type="button" onClick={() => { setClassicNumpadMode('none'); setClassicNumpadValue(''); setSelectedFocusItemId(null); }}
                          className="text-[10px] text-gray-400 hover:text-red-500 font-bold">✕ Cancel</button>
                      </div>
                      {/* Item context */}
                      {selectedItem ? (
                        <div className="bg-[#F5C742]/10 border border-[#F5C742]/30 rounded-lg px-2 py-1.5 mb-2">
                          <p className="text-[10px] font-semibold text-[#1E293B] truncate">{selectedItem.name}</p>
                          <p className="text-[9px] text-gray-400">
                            {classicNumpadMode === 'qty' && `Current qty: ${selectedItem.quantity}`}
                            {classicNumpadMode === 'discount' && `Current disc: ${selectedItem.discount}%`}
                            {classicNumpadMode === 'price' && `Current price: ${formatCurrency(selectedItem.price)}`}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2">
                          <p className="text-[10px] text-amber-600 font-semibold">← Select a cart row first</p>
                        </div>
                      )}
                      {/* Discount type toggle */}
                      {classicNumpadMode === 'discount' && (
                        <div className="flex gap-1 mb-2">
                          <button type="button" onClick={() => setClassicDiscountType('percent')}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-colors ${classicDiscountType === 'percent' ? 'bg-[#F5C742] text-[#1E293B] border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                            % Percent
                          </button>
                          <button type="button" onClick={() => setClassicDiscountType('amount')}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-colors ${classicDiscountType === 'amount' ? 'bg-[#F5C742] text-[#1E293B] border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                            <DirhamSymbol /> Amt
                          </button>
                        </div>
                      )}
                      {/* Display */}
                      <div className="mb-2">
                        <input
                          type="text"
                          autoFocus
                          placeholder="0"
                          value={classicNumpadValue}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setClassicNumpadValue(val);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (selectedFocusItemId && classicNumpadValue) {
                                handleNumpadEnter();
                              }
                            }
                          }}
                          className="w-full bg-gray-50 border-2 border-[#F5C742]/40 rounded-xl px-3 py-2 text-right font-mono text-lg text-[#1E293B] placeholder:text-gray-300 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                        />
                      </div>
                      {/* Number pad */}
                      <div className="grid grid-cols-3 gap-1 mb-1">
                        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(k => (
                          <button key={k} type="button" onClick={() => setClassicNumpadValue(v => v + k)}
                            className="h-9 rounded-lg bg-gray-50 hover:bg-[#F5C742]/20 border border-gray-200 text-sm text-[#1E293B] font-bold transition-colors active:scale-95">
                            {k}
                          </button>
                        ))}
                        <button type="button" onClick={() => setClassicNumpadValue(v => v + '.')}
                          className="h-9 rounded-lg bg-gray-50 hover:bg-[#F5C742]/20 border border-gray-200 text-sm text-gray-500 font-bold transition-colors">.</button>
                        <button type="button" onClick={() => setClassicNumpadValue(v => v + '0')}
                          className="h-9 rounded-lg bg-gray-50 hover:bg-[#F5C742]/20 border border-gray-200 text-sm text-[#1E293B] font-bold transition-colors active:scale-95">0</button>
                        <button type="button" onClick={() => setClassicNumpadValue(v => v.slice(0, -1))}
                          className="h-9 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-sm text-gray-500 font-bold transition-colors">⌫</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <button type="button" onClick={() => setClassicNumpadValue('')}
                          className="h-9 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-xs text-red-600 font-bold transition-colors">
                          Clear
                        </button>
                        <button type="button" onClick={handleNumpadEnter} disabled={!selectedFocusItemId || !classicNumpadValue}
                          className="h-9 rounded-lg bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-40 text-[#1E293B] text-xs font-black transition-colors">
                          Enter ↵
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Action button grid ── */}
                <div className="p-2 flex-1 overflow-y-auto">
                  {(() => {
                    const openNumpad = (mode) => {
                      setClassicNumpadMode(m => m === mode ? 'none' : mode);
                      setClassicNumpadValue('');
                      if (classicNumpadMode !== mode) setSelectedFocusItemId(null);
                    };
                    // Interaction-specific buttons (Classic uses the inline numpad);
                    // shared buttons come from the single commonActionButtons()
                    // definition so both templates stay in sync.
                    const interactive = [
                      { id: 'add-qty', label: 'Add Qty', icon: <Plus className="h-4 w-4" />, color: `bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 ${classicNumpadMode === 'qty' ? 'ring-2 ring-[#F5C742] bg-blue-100' : ''}`, action: () => openNumpad('qty') },
                      { id: 'discount', label: 'Disc %', icon: <Percent className="h-4 w-4" />, color: `bg-[#FEF9E7] hover:bg-[#F5C742]/20 border-[#F5C742]/40 text-[#B8942E] ${classicNumpadMode === 'discount' ? 'ring-2 ring-[#F5C742]' : ''}`, action: () => openNumpad('discount') },
                      { id: 'price', label: 'Price', icon: <Tag className="h-4 w-4" />, color: `bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 ${classicNumpadMode === 'price' ? 'ring-2 ring-[#F5C742] bg-purple-100' : ''}`, action: () => openNumpad('price') },
                      { id: 'remove', label: 'Remove', icon: <Trash2 className="h-4 w-4" />, color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600', action: () => { const l = currentInvoice.items[0]; if (l) guardedRemoveFromInvoice(l.id); } },
                    ];
                    const allBtns = [...interactive, ...commonActionButtons('h-4 w-4')];
                    const visible = allBtns.filter(b => !hiddenPanelButtons.has(b.id));
                    return (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-2 gap-1.5">
                        {visible.map(btn => (
                          <button key={btn.id} type="button" onClick={btn.action}
                            className={`flex flex-col items-center justify-center gap-1 min-h-[60px] py-1.5 rounded-xl border transition-colors ${btn.color}`}>
                            {btn.icon}
                            <span className="text-[9px] font-bold leading-tight text-center px-0.5">{btn.label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* History tab */}
            {rightPanelTab === 'history' && (
              <div className="flex-1 overflow-y-auto p-2.5">
                {selectedCustomerData?.id === WALK_IN_CUSTOMER.id ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-1">
                    <User className="h-8 w-8" /><p className="text-xs">Select customer</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-[#F5C742]/10 rounded-xl border border-[#F5C742]/30">
                      <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center text-xs font-black text-white">{selectedCustomerData?.name?.charAt(0)}</div>
                      <div>
                        <p className="text-xs font-bold text-[#1E293B]">{selectedCustomerData?.name}</p>
                        <p className="text-[9px] text-gray-400">{selectedCustomerData?.loyaltyPoints} pts</p>
                      </div>
                    </div>
                    {customerHistoryLoading ? (
                      <div className="flex items-center justify-center h-16 text-gray-400 text-xs gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" />Loading…
                      </div>
                    ) : customerHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-16 text-gray-300 gap-1">
                        <Receipt className="h-5 w-5" /><p className="text-xs">No previous purchases</p>
                      </div>
                    ) : customerHistory.map(inv => {
                      const fmtDate = inv.invoiceDate
                        ? new Date(inv.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                        : '—';
                      return (
                        <button type="button" key={inv.id} onClick={() => openCustomerHistoryPreview(inv)}
                          className="group w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-gray-50 hover:bg-[#F5C742]/10 rounded-xl border border-gray-100 hover:border-[#F5C742]/40 text-xs transition-colors text-left">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1E293B] leading-tight">{inv.invoiceNumber}</p>
                            <p className="text-[9px] text-gray-400 leading-tight mt-0.5">{fmtDate} · {inv.itemCount} items</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-[#327F74] leading-none">{formatCurrency(inv.invoiceTotal)}</span>
                            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-400 group-hover:border-[#327F74]/40 group-hover:text-[#327F74] transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Checkout button — always visible */}
            <div className="mt-auto border-t-2 border-[#F5C742]/30 shrink-0">
              {activeLayawayId && activeLayawayDeposit > 0 && (
                <div className="flex justify-between text-[11px] text-green-700 font-bold mb-1.5 px-3 pt-3">
                  <span>Deposit Applied</span><span>−{formatCurrencyStr(activeLayawayDeposit)}</span>
                </div>
              )}
              <button type="button" onClick={() => {
                // Pre-fill the tender to the amount actually due NOW (grand total minus
                // any layaway deposit already collected) so the cashier isn't pushed to
                // over-tender the full invoice when a deposit exists.
                const grandWithShip = currentInvoice.total + (Number(shippingCharge) || 0);
                const balanceDue = activeLayawayId && activeLayawayDeposit > 0
                  ? Math.max(0, grandWithShip - activeLayawayDeposit)
                  : grandWithShip;
                setCheckoutPhase('payment'); setShowPaymentDialog(true);
                setTenderedAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
                setCheckoutKeypadVisible(false); setCheckoutKeypadMode('numeric'); setCheckoutKeypadTarget('tender');
              }}
                disabled={currentInvoice.items.length === 0}
                className={`w-full min-h-[72px] bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-40 disabled:cursor-not-allowed text-[#1E293B] font-black flex flex-col items-center justify-center py-3 transition-all ${(!activeLayawayId || activeLayawayDeposit <= 0) ? 'mt-0' : ''}`}>
                <div className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-6 w-6" />
                  <span className="tracking-wide uppercase">Checkout</span>
                </div>
                {currentInvoice.items.length > 0 && (
                  <span className="text-sm font-bold opacity-90 mt-1">
                    {activeLayawayId && activeLayawayDeposit > 0
                      ? `Balance ${formatCurrencyStr(Math.max(0, currentInvoice.total + (Number(shippingCharge) || 0) - activeLayawayDeposit))}`
                      : formatCurrencyStr(currentInvoice.total + (Number(shippingCharge) || 0))}
                  </span>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ══ QUICK CUSTOMER CREATION MODAL ══════════════════════════════════════ */}
      {showQuickCustomerModal && quickCustomerForm && (
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-[#F5C742] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-[#1E293B]">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-wide text-[#1E293B]">Quick Create & Auto-Assign Customer</h2>
                  <p className="text-xs text-[#1E293B]/70 mt-0.5">Instantly add and select customer for this transaction</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowQuickCustomerModal(false)} className="text-[#1E293B]/70 hover:text-[#1E293B] transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Duplicate Warning */}
              {quickCustomerDuplicateWarning && quickCustomerDuplicateWarning.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-inner space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-800">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                    <h3 className="text-sm font-bold">Potential Duplicate Customers Detected!</h3>
                  </div>
                  <p className="text-xs text-amber-800/90">
                    We found existing customers matching the phone, email, or TRN you entered:
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {quickCustomerDuplicateWarning.map(dup => (
                      <div key={dup.id} className="bg-white border border-amber-200/80 rounded-xl p-3 flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{dup.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Mobile: {dup.mobile || dup.phone || 'N/A'} {dup.email ? `| Email: ${dup.email}` : ''} {dup.trn ? `| TRN: ${dup.trn}` : ''}
                          </p>
                        </div>
                        <button type="button"
                          onClick={() => {
                            setSelectedCustomer(dup.id);
                            setShowQuickCustomerModal(false);
                            if (showFeedback) showFeedback('Selected existing customer!', 'success');
                          }}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-colors shadow-sm">
                          Use Existing
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700 italic pt-1 border-t border-amber-200/60">
                    Or, if this is a distinct customer, you can proceed to create a new record below.
                  </p>
                </div>
              )}

              {quickCustomerError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{quickCustomerError}</span>
                </div>
              )}

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" value={quickCustomerForm.name || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, name: e.target.value })}
                    placeholder="Enter customer full name"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Mobile / Phone <span className="text-red-500">*</span></label>
                  <input type="tel" value={quickCustomerForm.mobile || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, mobile: e.target.value })}
                    placeholder="+971 50 000 0000"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Email Address</label>
                  <input type="email" value={quickCustomerForm.email || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, email: e.target.value })}
                    placeholder="email@example.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Tax Registration No. (TRN)</label>
                  <input type="text" value={quickCustomerForm.trn || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, trn: e.target.value })}
                    placeholder="15-digit TRN"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Customer Group / Type</label>
                  <select value={quickCustomerForm.customerType || 'Retail'}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, customerType: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white">
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Corporate">Corporate</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">City</label>
                  <input type="text" value={quickCustomerForm.city || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, city: e.target.value })}
                    placeholder="e.g. Dubai"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Country</label>
                  <input type="text" value={quickCustomerForm.country || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, country: e.target.value })}
                    placeholder="e.g. United Arab Emirates"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Billing / Delivery Address</label>
                  <textarea rows={2} value={quickCustomerForm.deliveryAddress || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, deliveryAddress: e.target.value })}
                    placeholder="Full street address..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white resize-none" />
                </div>
                <div className="col-span-2 border-t border-gray-100 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={quickCustomerForm.isCreditCustomer || false}
                      onChange={e => setQuickCustomerForm({ ...quickCustomerForm, isCreditCustomer: e.target.checked })}
                      className="w-4 h-4 text-[#e6b838] border-gray-300 rounded focus:ring-[#F5C742]" />
                    <span className="text-sm font-bold text-gray-800">Enable Credit Facility for this Customer</span>
                  </label>
                </div>
                {quickCustomerForm.isCreditCustomer && (
                  <>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Credit Limit (AED)</label>
                      <input type="number" min="0" step="0.01" value={quickCustomerForm.creditLimit || ''}
                        onChange={e => setQuickCustomerForm({ ...quickCustomerForm, creditLimit: e.target.value })}
                        placeholder="0.00"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Opening Balance (AED)</label>
                      <input type="number" step="0.01" value={quickCustomerForm.openingBalance || ''}
                        onChange={e => setQuickCustomerForm({ ...quickCustomerForm, openingBalance: e.target.value })}
                        placeholder="0.00"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Internal Notes</label>
                  <input type="text" value={quickCustomerForm.notes || ''}
                    onChange={e => setQuickCustomerForm({ ...quickCustomerForm, notes: e.target.value })}
                    placeholder="Cashier remarks, preferences..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button type="button" onClick={() => setShowQuickCustomerModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={quickCustomerLoading || !quickCustomerForm.name || !quickCustomerForm.mobile}
                onClick={() => handleSaveQuickCustomer(!!(quickCustomerDuplicateWarning && quickCustomerDuplicateWarning.length > 0))}
                className={`flex-1 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${quickCustomerDuplicateWarning && quickCustomerDuplicateWarning.length > 0
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20 text-white'
                    : 'bg-[#F5C742] hover:bg-[#e6b838] shadow-[#F5C742]/30 text-[#1E293B]'
                  }`}>
                {quickCustomerLoading ? 'Saving...' : (quickCustomerDuplicateWarning && quickCustomerDuplicateWarning.length > 0 ? 'Create New Record Anyway' : 'Save & Auto-Select')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ QUICK PRODUCT CREATION MODAL ══════════════════════════════════════ */}
      {showQuickProductModal && quickProductForm && (
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-[#F5C742] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-[#1E293B]">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-wide text-[#1E293B]">Quick Create & Auto-Add Product</h2>
                  <p className="text-xs text-[#1E293B]/70 mt-0.5">Instantly add product to inventory and current cart</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowQuickProductModal(false)} className="text-[#1E293B]/70 hover:text-[#1E293B] transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Duplicate Warning */}
              {quickProductDuplicateWarning && quickProductDuplicateWarning.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-inner space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-800">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                    <h3 className="text-sm font-bold">Potential Duplicate Products Detected!</h3>
                  </div>
                  <p className="text-xs text-amber-800/90">
                    We found existing products matching the name, code, or barcode you entered:
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {quickProductDuplicateWarning.map(dup => (
                      <div key={dup.id} className="bg-white border border-amber-200/80 rounded-xl p-3 flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{dup.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Code: {dup.code || 'N/A'} {dup.barcode ? `| Barcode: ${dup.barcode}` : ''} | Price: {formatCurrency ? formatCurrency(dup.sellingPrice) : dup.sellingPrice}
                          </p>
                        </div>
                        <button type="button"
                          onClick={() => {
                            addToInvoice(dup);
                            setShowQuickProductModal(false);
                            if (showFeedback) showFeedback('Added existing product to cart!', 'success');
                          }}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-colors shadow-sm">
                          Add Existing to Cart
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700 italic pt-1 border-t border-amber-200/60">
                    Or, if this is a distinct product variant, you can proceed to create a new item below.
                  </p>
                </div>
              )}

              {quickProductError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{quickProductError}</span>
                </div>
              )}

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Product Name <span className="text-red-500">*</span></label>
                  <input type="text" value={quickProductForm.name || ''}
                    onChange={e => setQuickProductForm({ ...quickProductForm, name: e.target.value })}
                    placeholder="Enter item name"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Item Code / SKU <span className="text-red-500">*</span></label>
                  <input type="text" value={quickProductForm.code || ''}
                    onChange={e => setQuickProductForm({ ...quickProductForm, code: e.target.value })}
                    placeholder="e.g. PRD-001"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Barcode (EAN/UPC)</label>
                  <input type="text" value={quickProductForm.barcode || ''}
                    onChange={e => setQuickProductForm({ ...quickProductForm, barcode: e.target.value })}
                    placeholder="Scan or type barcode"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Category</label>
                  <select value={quickProductForm.category || 'General'}
                    onChange={e => setQuickProductForm({ ...quickProductForm, category: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white">
                    {productCategories && productCategories.length > 0 ? (
                      productCategories.map(cat => (
                        <option key={cat.id || cat.name || cat} value={cat.name || cat}>
                          {cat.name || cat}
                        </option>
                      ))
                    ) : (
                      <option value="General">General</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Selling Price (AED) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" value={quickProductForm.sellingPrice || ''}
                    onChange={e => setQuickProductForm({ ...quickProductForm, sellingPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Purchase Cost (AED)</label>
                  <input type="number" min="0" step="0.01" value={quickProductForm.purchasePrice || ''}
                    onChange={e => setQuickProductForm({ ...quickProductForm, purchasePrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Tax Rate (%)</label>
                  <select value={quickProductForm.taxRate ?? 5}
                    onChange={e => setQuickProductForm({ ...quickProductForm, taxRate: parseFloat(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white">
                    <option value={5}>5% VAT</option>
                    <option value={0}>0% (Exempt / Zero-rated)</option>
                  </select>
                </div>
                <div className="col-span-2 border-t border-gray-100 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={quickProductForm.trackInventory || false}
                      onChange={e => setQuickProductForm({ ...quickProductForm, trackInventory: e.target.checked })}
                      className="w-4 h-4 text-[#e6b838] border-gray-300 rounded focus:ring-[#F5C742]" />
                    <span className="text-sm font-bold text-gray-800">Track Inventory / Stock Levels</span>
                  </label>
                </div>
                {quickProductForm.trackInventory && (
                  <>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Initial Stock Quantity</label>
                      <input type="number" value={quickProductForm.initialStock || ''}
                        onChange={e => setQuickProductForm({ ...quickProductForm, initialStock: e.target.value })}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Low Stock Alert Quantity</label>
                      <input type="number" value={quickProductForm.alertQuantity || ''}
                        onChange={e => setQuickProductForm({ ...quickProductForm, alertQuantity: e.target.value })}
                        placeholder="5"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button type="button" onClick={() => setShowQuickProductModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={quickProductLoading || !quickProductForm.name || !quickProductForm.code || !quickProductForm.sellingPrice}
                onClick={() => handleSaveQuickProduct(!!(quickProductDuplicateWarning && quickProductDuplicateWarning.length > 0))}
                className={`flex-1 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${quickProductDuplicateWarning && quickProductDuplicateWarning.length > 0
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20 text-white'
                    : 'bg-[#F5C742] hover:bg-[#e6b838] shadow-[#F5C742]/30 text-[#1E293B]'
                  }`}>
                {quickProductLoading ? 'Saving...' : (quickProductDuplicateWarning && quickProductDuplicateWarning.length > 0 ? 'Create New Product Anyway' : 'Save & Add to Cart')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
POSTouchScreen.displayName = 'POSTouchScreen';
export default POSTouchScreen;

