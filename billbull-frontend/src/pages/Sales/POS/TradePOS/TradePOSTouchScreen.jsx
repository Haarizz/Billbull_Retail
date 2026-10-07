import React, { useState, useMemo, useCallback } from 'react';
import { TradeHeader } from './components/layout/TradeHeader';
import { TradeMainCanvas } from './components/layout/TradeMainCanvas';
import { TradeFunctionsPanel } from './components/layout/TradeFunctionsPanel';
import { TradeCartPanel } from './components/cart/TradeCartPanel';
import { TradeSearchBar } from './components/catalog/TradeSearchBar';
import QuickCustomerModal from '../features/customers/QuickCustomerModal';
import { useStickyScanFocus } from './useStickyScanFocus';
import { usePosSaleShortcuts } from '../input/usePosSaleShortcuts';

/** F4 / F8 / F9 → the Item Entry dialog field each one opens on. */
const ENTRY_FIELD_FOR_MODE = { qty: 'quantity', discount: 'discount', price: 'price' };
import { ScanLine, CheckCircle2 } from 'lucide-react';

/**
 * TradePOSTouchScreen
 * 
 * The main presentation shell for the Trade POS.
 * Replaces the legacy Compact POS template.
 * Coordinates props to child components without executing business logic.
 */
export const TradePOSTouchScreen = React.memo((props) => {
  const {
    // POSSales Shared State
    currentInvoice,
    invoiceCounter,
    selectedFocusItemId,
    setSelectedFocusItemId,
    formatCurrency,
    posSettings,
    currentSession,
    setCurrentView,
    setShowPOSConfig,
    
    // Cart Action State
    updateQuantity,
    guardedRemoveFromInvoice,
    guardedClearInvoice,
    holdInvoice,
    openDeliveryModal,
    setShowCashDropDialog,
    handleCheckout,
    // The cart line the last add landed on — the keyboard line shortcuts' fallback target.
    lastEnteredLineId = null,

    // Phase 2 salesperson verification. This template previously had NO salesperson UI at all,
    // so a compact-template branch posted every sale as Unassigned. It is in scope for the
    // mandatory-verification rule like every other layout; all state is owned by
    // useSalesperson.js, exactly as in POSTouchScreen.
    salespersonRequired = false,
    verifiedSalesperson = null,
    openSalespersonScanModal,

    // Customer Props
    customerSearchQuery,
    setCustomerSearchQuery,
    customerOptions,
    filteredCustomerOptions, // Add this
    selectedCustomerData,
    setSelectedCustomer,
    openQuickCustomerModal,
    showCustomerDropdown,
    setShowCustomerDropdown,
    
    // Catalog Props
    searchQuery,
    setSearchQuery,
    barcodeInputRef,
    handleUnifiedEntry,
    scannerConfig,
    productCategories,
    selectedCategory,
    setSelectedCategory,
    filteredProducts,
    posProductsLoading,

    // Product Entry Mode controllers — owned by POSSales.jsx, which is the single
    // place that decides Direct Add vs Open Entry Dialog and renders the dialog.
    handleProductSelection,
    handleEditItem,

    // Quick customer creation. The dialog itself used to be rendered ONLY by POSTouchScreen,
    // so "Create New Customer" in this template opened nothing at all. Same POSSales-owned
    // state, now rendered here too through the shared QuickCustomerModal.
    showQuickCustomerModal,
    setShowQuickCustomerModal,
    quickCustomerForm,
    setQuickCustomerForm,
    quickCustomerDuplicateWarning,
    quickCustomerLoading,
    quickCustomerError,
    handleSaveQuickCustomer,
    showFeedback,

    // Shared POS functions. Trade POS has no permanent action column, so these reach the
    // user through the header's Functions button and TradeFunctionsPanel. Every one of
    // them is POSSales-owned state — this template only opens the dialogs, never owns them.
    hiddenPanelButtons,
    setShowQuickProductModal,
    setShowLayawaysList,
    setShowSaveLayaway,
    setShowSaveOrderDialog,
    setShowAddShippingDialog,
    setShowCouponsDialog,
    setShowPromotionsDialog,
    setShowReturn,
    setShowProductSearch,
    setProductSearchQuery,
    setProductSearchResults,
    setShowPriceCheck,
    setPriceCheckQuery,
    setPriceCheckResult,
    setShowCreditBalance,
    setCreditBalanceQuery,
    setCreditBalanceResult,
    setShowSerialBatch,
    setSerialBatchQuery,
    setSerialBatchResult,
    setSerialBatchSubView,
    setSerialBatchInvoiceNo,
    setSerialBatchItemCode,
    setSerialBatchCustomerMobile,
    setSerialBatchSelectedItem,
    setShowLastReceiptDialog,
    setShowOrdersListDialog,
    setShowReprintModal,
    setShowDeliverySettleModal,
    setDeliverySettleSearch,
    setDeliverySettlePersonFilter,
    setDeliverySettleSelected,
    setShowLockPOS,
    // Action Button Access (Console -> Behavior). Forwarded verbatim to TradeFunctionsPanel,
    // which hands them to buildPosFunctionButtons — the same gate the other two templates use.
    posFunctionAccessMode,
    isPosSupervisorUser,
    requestFunctionApproval,
    onFunctionDenied
  } = props;

  // Presentation state for mobile/tablet responsive behavior
  const [mobileActiveTab, setMobileActiveTab] = useState('catalog'); // 'catalog' | 'cart'

  // Functions slide-over, opened from the header button.
  const [showFunctions, setShowFunctions] = useState(false);
  const openFunctions = useCallback(() => setShowFunctions(true), []);
  const closeFunctions = useCallback(() => setShowFunctions(false), []);

  // Keyboard highlight in the Quick Pick list (-1 = nothing highlighted, so a plain Enter
  // still goes through handleUnifiedEntry and barcode scans behave exactly as before).
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [highlightedList, setHighlightedList] = useState(filteredProducts);

  // New search results → drop the highlight (render-time reset, no extra effect pass).
  if (highlightedList !== filteredProducts) {
    setHighlightedList(filteredProducts);
    setActiveProductIndex(-1);
  }

  // Keep the caret in the search box so the next scan or keystroke always lands somewhere useful
  // without the cashier clicking first. posFocusV2: the search box is the registered SEARCH
  // target and the POS focus controller decides when it gets the caret. Legacy (flag off):
  // retried at session start, after every cart change, once a sale closes (invoiceCounter
  // bumps) and whenever a customer is assigned. autoFocusOnPOS=false opts out, as elsewhere.
  const cartLineCount = currentInvoice?.items?.length || 0;
  useStickyScanFocus(barcodeInputRef, {
    triggers: [invoiceCounter, cartLineCount, selectedCustomerData?.id, showQuickCustomerModal],
    searchFocus: scannerConfig?.autoFocusOnPOS !== false,
  });

  // Keyboard shortcuts (P3). The POS input controller owns the keys; these are this template's
  // ways of doing each thing. Trade POS edits a line in the Item Entry dialog (a cart row's
  // double-click), so F4/F8/F9 open it on the targeted line at Quantity/Discount/Price. F2 and
  // F3 are registered by TradeMainCanvas, which owns the customer search.
  usePosSaleShortcuts({
    items: currentInvoice?.items || [],
    selectedId: selectedFocusItemId,
    lastEnteredId: lastEnteredLineId,
    onCheckout: (quickCash) => handleCheckout?.(quickCash ? { quickCash } : undefined),
    onHold: () => holdInvoice?.(),
    onQuantity: updateQuantity,
    onRemove: guardedRemoveFromInvoice,
    onMode: (mode, line) => {
      if (line) handleEditItem?.(line.id, { focusField: ENTRY_FIELD_FOR_MODE[mode] });
    },
  });

  const moveProductHighlight = useCallback((delta) => {
    const count = filteredProducts?.length || 0;
    if (count === 0) return;
    setActiveProductIndex(prev => {
      const next = prev + delta;
      if (next < -1) return -1;
      if (next > count - 1) return count - 1;
      return next;
    });
  }, [filteredProducts]);

  const resetProductHighlight = useCallback(() => setActiveProductIndex(-1), []);

  // Returns true when a highlighted product was added, so the search bar skips its default Enter.
  const selectHighlightedProduct = useCallback(() => {
    const product = activeProductIndex >= 0 ? filteredProducts?.[activeProductIndex] : null;
    if (!product || !handleProductSelection) return false;
    handleProductSelection(product);
    return true;
  }, [activeProductIndex, filteredProducts, handleProductSelection]);

  // Grouped and memoized prop objects to prevent full-tree re-renders
  const headerProps = useMemo(() => ({
    setCurrentView,
    setShowPOSConfig,
    onOpenFunctions: openFunctions,
    currentSession,
    posSettings
  }), [setCurrentView, setShowPOSConfig, openFunctions, currentSession, posSettings]);

  const catalogProps = useMemo(() => ({
    searchQuery,
    setSearchQuery,
    barcodeInputRef,
    handleUnifiedEntry,
    productCategories,
    selectedCategory,
    setSelectedCategory,
    filteredProducts,
    posProductsLoading,
    onProductSelected: handleProductSelection,
    formatCurrency,
    activeProductIndex,
    setActiveProductIndex
  }), [
    searchQuery, setSearchQuery, barcodeInputRef, handleUnifiedEntry,
    productCategories, selectedCategory, setSelectedCategory,
    filteredProducts, posProductsLoading, handleProductSelection, formatCurrency,
    activeProductIndex
  ]);

  const customerPanelProps = useMemo(() => ({
    customerSearchQuery,
    setCustomerSearchQuery,
    customerOptions: filteredCustomerOptions || customerOptions, // Pass the filtered options
    selectedCustomerData,
    setSelectedCustomer,
    openQuickCustomerModal,
    showCustomerDropdown,
    setShowCustomerDropdown
  }), [
    customerSearchQuery, setCustomerSearchQuery, customerOptions, filteredCustomerOptions,
    selectedCustomerData, setSelectedCustomer, openQuickCustomerModal, 
    showCustomerDropdown, setShowCustomerDropdown
  ]);

  const cartProps = useMemo(() => ({
    currentInvoice,
    customerName: selectedCustomerData?.name,
    selectedFocusItemId,
    setSelectedFocusItemId,
    formatCurrency,
    posSettings,
    handleCheckout,
    onEditItem: handleEditItem,
    updateQuantity,
    onRemoveItem: guardedRemoveFromInvoice,
    onClearInvoice: guardedClearInvoice,
    holdInvoice,
    openDeliveryModal,
    setShowCashDropDialog
  }), [
    currentInvoice, selectedCustomerData, selectedFocusItemId, setSelectedFocusItemId,
    formatCurrency, posSettings, handleCheckout, handleEditItem,
    updateQuantity, guardedRemoveFromInvoice, guardedClearInvoice,
    holdInvoice, openDeliveryModal, setShowCashDropDialog
  ]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8f9fa] overflow-hidden font-sans">
      {/* Global Header */}
      <header className="shrink-0 relative z-20 shadow-sm">
        <TradeHeader {...headerProps} />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col p-4 gap-4">
        
        {/* Global Search Bar */}
        <div className="w-full max-w-5xl mx-auto shrink-0">
          <TradeSearchBar 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            barcodeInputRef={barcodeInputRef}
            handleUnifiedEntry={handleUnifiedEntry}
            onMoveHighlight={moveProductHighlight}
            onSelectHighlighted={selectHighlightedProduct}
            onResetHighlight={resetProductHighlight}
          />
        </div>

        {/* Salesperson verification strip. Rendered only while the feature is on, so a tenant
            that never enables it sees this template exactly as before. Barcode scan only — there
            is deliberately no manual employee picker here either. */}
        {salespersonRequired && (
          <div className="w-full max-w-[1600px] mx-auto shrink-0">
            <button
              type="button"
              onClick={openSalespersonScanModal}
              aria-label={verifiedSalesperson ? 'Change salesperson' : 'Scan salesperson barcode'}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition ${
                verifiedSalesperson
                  ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                  : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {verifiedSalesperson
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  : <ScanLine className="h-4 w-4 shrink-0 text-amber-600" />}
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 shrink-0">
                  Salesperson
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-[#1E293B]">
                  {verifiedSalesperson
                    ? `${verifiedSalesperson.name || 'Verified'} · ${verifiedSalesperson.employeeCode || ''}`.trim()
                    : 'Not verified'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-[#327F74]">Scan</span>
            </button>
          </div>
        )}

        {/* Responsive 2-Column Layout, tabbed on mobile/tablet */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6 w-full max-w-[1600px] mx-auto">

          {/* LEFT PANEL: Customer & Quick Picks */}
          <section
            aria-label="Product and Customer Selection"
            className={`h-full flex flex-col min-w-0 ${mobileActiveTab === 'catalog' ? 'flex flex-1' : 'hidden'} lg:flex lg:w-[46%]`}
          >
            <TradeMainCanvas
              {...catalogProps}
              {...customerPanelProps}
            />
          </section>

          {/* RIGHT PANEL: Invoice & Checkout */}
          <section
            aria-label="Shopping Cart"
            className={`h-full flex flex-col min-w-0 ${mobileActiveTab === 'cart' ? 'flex flex-1' : 'hidden'} lg:flex lg:w-[54%]`}
          >
            <TradeCartPanel {...cartProps} />
          </section>

        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden shrink-0 bg-white border-t border-gray-200 p-2 flex justify-around shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10 gap-2">
        <button
          onClick={() => setMobileActiveTab('catalog')}
          aria-label="View Catalog"
          className={`flex-1 py-3 text-center rounded-lg font-bold text-xs sm:text-sm transition-colors ${mobileActiveTab === 'catalog' ? 'bg-primary text-foreground' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          Quick Picks
        </button>
        <button
          onClick={() => setMobileActiveTab('cart')}
          aria-label="View Cart"
          className={`flex-1 py-3 text-center rounded-lg font-bold text-xs sm:text-sm transition-colors ${mobileActiveTab === 'cart' ? 'bg-primary text-foreground' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          Invoice ({currentInvoice?.items?.filter(i => !i.isVoided)?.length || 0})
        </button>
      </nav>

      {/* Shared POS functions — the compact template's stand-in for the Classic/Cart Focus
          Actions column, opened from the header's Functions button. */}
      <TradeFunctionsPanel
        open={showFunctions}
        onClose={closeFunctions}
        hiddenPanelButtons={hiddenPanelButtons}
        salespersonRequired={salespersonRequired}
        verifiedSalesperson={verifiedSalesperson}
        openSalespersonScanModal={openSalespersonScanModal}
        setShowQuickProductModal={setShowQuickProductModal}
        setShowLayawaysList={setShowLayawaysList}
        setShowSaveLayaway={setShowSaveLayaway}
        setShowSaveOrderDialog={setShowSaveOrderDialog}
        setShowAddShippingDialog={setShowAddShippingDialog}
        setShowCouponsDialog={setShowCouponsDialog}
        setShowPromotionsDialog={setShowPromotionsDialog}
        setShowReturn={setShowReturn}
        setShowProductSearch={setShowProductSearch}
        setProductSearchQuery={setProductSearchQuery}
        setProductSearchResults={setProductSearchResults}
        setShowPriceCheck={setShowPriceCheck}
        setPriceCheckQuery={setPriceCheckQuery}
        setPriceCheckResult={setPriceCheckResult}
        setShowCreditBalance={setShowCreditBalance}
        setCreditBalanceQuery={setCreditBalanceQuery}
        setCreditBalanceResult={setCreditBalanceResult}
        setShowSerialBatch={setShowSerialBatch}
        setSerialBatchQuery={setSerialBatchQuery}
        setSerialBatchResult={setSerialBatchResult}
        setSerialBatchSubView={setSerialBatchSubView}
        setSerialBatchInvoiceNo={setSerialBatchInvoiceNo}
        setSerialBatchItemCode={setSerialBatchItemCode}
        setSerialBatchCustomerMobile={setSerialBatchCustomerMobile}
        setSerialBatchSelectedItem={setSerialBatchSelectedItem}
        setShowCashDropDialog={setShowCashDropDialog}
        setShowLastReceiptDialog={setShowLastReceiptDialog}
        setShowOrdersListDialog={setShowOrdersListDialog}
        setShowReprintModal={setShowReprintModal}
        openDeliveryModal={openDeliveryModal}
        setShowDeliverySettleModal={setShowDeliverySettleModal}
        setDeliverySettleSearch={setDeliverySettleSearch}
        setDeliverySettlePersonFilter={setDeliverySettlePersonFilter}
        setDeliverySettleSelected={setDeliverySettleSelected}
        setShowLockPOS={setShowLockPOS}
        currentSession={currentSession}
        setCurrentView={setCurrentView}
        posFunctionAccessMode={posFunctionAccessMode}
        isPosSupervisorUser={isPosSupervisorUser}
        requestFunctionApproval={requestFunctionApproval}
        onFunctionDenied={onFunctionDenied}
      />

      {/* Quick customer creation — the counterpart of the "Create New Customer" button in
          TradeMainCanvas's customer dropdown. */}
      <QuickCustomerModal
        show={showQuickCustomerModal}
        form={quickCustomerForm}
        setForm={setQuickCustomerForm}
        duplicateWarning={quickCustomerDuplicateWarning}
        loading={quickCustomerLoading}
        error={quickCustomerError}
        onClose={() => setShowQuickCustomerModal && setShowQuickCustomerModal(false)}
        onSave={handleSaveQuickCustomer}
        setSelectedCustomer={setSelectedCustomer}
        showFeedback={showFeedback}
      />

    </div>
  );
});

TradePOSTouchScreen.displayName = 'TradePOSTouchScreen';
