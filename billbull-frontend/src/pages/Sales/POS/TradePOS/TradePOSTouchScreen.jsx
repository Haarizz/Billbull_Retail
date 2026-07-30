import React, { useState, useCallback, useMemo } from 'react';
import { TradeHeader } from './components/layout/TradeHeader';
import { TradeMainCanvas } from './components/layout/TradeMainCanvas';
import { TradeCartPanel } from './components/cart/TradeCartPanel';
import { TradeSearchBar } from './components/catalog/TradeSearchBar';
import POSItemEntryContainer from '../../../../components/POS/ItemEntry/POSItemEntryContainer';
import { ProductEntryMode } from '../../../../components/POS/ItemEntry/constants';

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
    addToInvoice,
    createInvoiceLine,
    updateInvoiceLine,
    posProductsLoading
  } = props;

  // Presentation state for mobile/tablet responsive behavior
  const [mobileActiveTab, setMobileActiveTab] = useState('catalog'); // 'catalog' | 'cart'

  // Default to opening the entry dialog to allow quantity/price editing before adding
  const itemEntryMode = posSettings?.productEntryMode || ProductEntryMode.OPEN_ENTRY_DIALOG;
  const [isItemEntryOpen, setIsItemEntryOpen] = useState(false);
  const [selectedProductForEntry, setSelectedProductForEntry] = useState(null);
  const [itemEntryAction, setItemEntryAction] = useState('add'); // 'add' | 'edit'

  // Single controller for product selection logic (Add Mode)
  const handleProductSelection = useCallback((product, explicitPayload = null) => {
    if (itemEntryMode === ProductEntryMode.DIRECT_ADD || explicitPayload) {
      if (explicitPayload) {
        // If it came from the dialog, use the single-transaction wrapper
        createInvoiceLine(explicitPayload);
      } else {
        // Legacy fast-path
        addToInvoice(product, 1);
      }

      if (isItemEntryOpen) {
        setIsItemEntryOpen(false);
        setSelectedProductForEntry(null);
      }
    } else if (itemEntryMode === ProductEntryMode.OPEN_ENTRY_DIALOG) {
      setItemEntryAction('add');
      setSelectedProductForEntry(product);
      setIsItemEntryOpen(true);
    }
  }, [itemEntryMode, isItemEntryOpen, addToInvoice, createInvoiceLine]);

  // Controller for editing an existing cart row
  const handleEditItem = useCallback((itemId) => {
    const item = currentInvoice?.items?.find(i => i.id === itemId);
    if (!item) return;

    setItemEntryAction('edit');
    setSelectedProductForEntry(item);
    setIsItemEntryOpen(true);
  }, [currentInvoice]);

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
    formatCurrency, handleCheckout, handleEditItem,
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

      {/* Reusable Item Entry Modal */}
      {selectedProductForEntry && (
        <POSItemEntryContainer
          isOpen={isItemEntryOpen}
          onClose={() => {
            setIsItemEntryOpen(false);
            setSelectedProductForEntry(null);
          }}
          product={itemEntryAction === 'add' ? selectedProductForEntry : undefined}
          invoiceLine={itemEntryAction === 'edit' ? selectedProductForEntry : undefined}
          mode={itemEntryAction}
          posSettings={posSettings}
          customerId={selectedCustomerData?.id}
          customerCode={selectedCustomerData?.code}
          customerName={selectedCustomerData?.name}
          warehouseId={currentSession?.warehouseId || posSettings?.defaultWarehouseId}
          onConfirm={(payload) => {
            if (itemEntryAction === 'add') {
              handleProductSelection(selectedProductForEntry, payload);
            } else {
              // Edit mode: single transaction overwrite using update wrapper
              updateInvoiceLine(payload);
              setIsItemEntryOpen(false);
              setSelectedProductForEntry(null);
            }
          }}
        />
      )}

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
