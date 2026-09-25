import React, { useState, useMemo } from 'react';
import { TradeHeader } from './components/layout/TradeHeader';
import { TradeMainCanvas } from './components/layout/TradeMainCanvas';
import { TradeCartPanel } from './components/cart/TradeCartPanel';
import { TradeSearchBar } from './components/catalog/TradeSearchBar';
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
    productCategories,
    selectedCategory,
    setSelectedCategory,
    filteredProducts,
    posProductsLoading,

    // Product Entry Mode controllers — owned by POSSales.jsx, which is the single
    // place that decides Direct Add vs Open Entry Dialog and renders the dialog.
    handleProductSelection,
    handleEditItem
  } = props;

  // Presentation state for mobile/tablet responsive behavior
  const [mobileActiveTab, setMobileActiveTab] = useState('catalog'); // 'catalog' | 'cart'

  // Grouped and memoized prop objects to prevent full-tree re-renders
  const headerProps = useMemo(() => ({
    setCurrentView,
    setShowPOSConfig,
    currentSession,
    posSettings
  }), [setCurrentView, setShowPOSConfig, currentSession, posSettings]);

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
    formatCurrency
  }), [
    searchQuery, setSearchQuery, barcodeInputRef, handleUnifiedEntry, 
    productCategories, selectedCategory, setSelectedCategory, 
    filteredProducts, posProductsLoading, handleProductSelection, formatCurrency
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

    </div>
  );
});

TradePOSTouchScreen.displayName = 'TradePOSTouchScreen';
