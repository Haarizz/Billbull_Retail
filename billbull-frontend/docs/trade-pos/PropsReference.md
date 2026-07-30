# Trade POS Props Reference

To prevent excessive re-renders, the monolithic `touchScreenProps` blob is destructured inside `TradePOSTouchScreen.jsx` into specific memoized objects.

### 1. `headerProps`
- `setCurrentView`: Function to toggle back to dashboard.
- `currentSession`: Object containing `id` and `terminal`.
- `posSettings`: Object containing `branchName`.

### 2. `catalogProps`
Passed to `TradeMainCanvas`.
- `searchQuery` & `setSearchQuery`: Product catalog search.
- `barcodeInputRef`: Hidden input for barcode scanning.
- `handleUnifiedEntry`: The global barcode interception handler.
- `productCategories`, `selectedCategory`, `setSelectedCategory`: Filters.
- `filteredProducts`: The grid data.
- `posProductsLoading`: Loading state.
- `addToInvoice`: Function to add item to cart.

### 3. `customerPanelProps`
Passed to `TradeMainCanvas`.
- `customerSearchQuery` & `setCustomerSearchQuery`: Customer dropdown search.
- `customerOptions`: Filtered customer list.
- `selectedCustomerData`: The active selected customer.
- `setSelectedCustomer`: Handler to change selection.
- `openQuickCustomerModal`: Handler for rapid creation.
- `showCustomerDropdown` & `setShowCustomerDropdown`: UI state.

### 4. `cartProps`
Passed to `TradeCartPanel`.
- `currentInvoice`: The full invoice object (items, total, tax, discount).
- `selectedFocusItemId` & `setSelectedFocusItemId`: Row selection state.
- `handleCheckout`: The core settlement transition handler (extracted from legacy inline logic).

### 5. `actionPanelProps`
Passed to `TradeActionPanel`.
- `classicNumpadValue`, `setClassicNumpadValue`: Numpad buffer.
- `classicNumpadMode`, `setClassicNumpadMode`: Active modifier ('qty', 'discount', 'price').
- `handleNumpadEnter`: The confirm function that executes `updateQuantity`/`updateDiscount` in POSSales.
- `holdInvoice`, `openDeliveryModal`, `setShowCashDropDialog`: Specific handlers.
