import React, { useState, useEffect, useRef } from 'react';
import { User, AlertTriangle, X, PlusCircle, Search, ShieldAlert, Star, Clock, ChevronDown } from 'lucide-react';
import { TradeProductGrid } from '../catalog/TradeProductGrid';
import { TradeCard, TradeBadge } from '../ui';
import { getCustomerOutstanding } from '../../../../../../api/salesInvoiceApi';
import { formatDisplayDate } from '../../../../../../utils/dateUtils';

export const TradeMainCanvas = React.memo(({
  // Catalog Props
  filteredProducts,
  posProductsLoading,
  onProductSelected,
  formatCurrency,

  // Customer Props
  customerSearchQuery,
  setCustomerSearchQuery,
  customerOptions,
  selectedCustomerData,
  setSelectedCustomer,
  openQuickCustomerModal,
  showCustomerDropdown,
  setShowCustomerDropdown
}) => {
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const searchInputRef = useRef(null);

  const isWalkIn = !selectedCustomerData || selectedCustomerData.id === 'walk-in';
  const customerCode = selectedCustomerData?.code || selectedCustomerData?.id;

  // --- Live account summary (real outstanding balance + last purchase date) ---
  const [accountSummary, setAccountSummary] = useState(null);
  const [isAccountSummaryLoading, setIsAccountSummaryLoading] = useState(false);

  useEffect(() => {
    if (isWalkIn || !customerCode) {
      setAccountSummary(null);
      return;
    }
    let cancelled = false;
    setIsAccountSummaryLoading(true);
    getCustomerOutstanding(customerCode)
      .then(data => { if (!cancelled) setAccountSummary(data); })
      .catch(() => { if (!cancelled) setAccountSummary(null); })
      .finally(() => { if (!cancelled) setIsAccountSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [isWalkIn, customerCode]);

  useEffect(() => {
    if (isSearchingCustomer) searchInputRef.current?.focus();
  }, [isSearchingCustomer]);

  const balanceDue = accountSummary?.outstanding ?? selectedCustomerData?.openingBalance ?? 0;
  const lastPurchaseDate = accountSummary?.lastPurchaseDate
    ? formatDisplayDate(accountSummary.lastPurchaseDate)
    : null;

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col gap-4">
      {/* 1 & 2. Customer Search & Card */}
      <div className="shrink-0 relative z-30">
        {!selectedCustomerData || isSearchingCustomer ? (
          // Customer Search Input
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm placeholder:text-gray-400"
              placeholder="Search Customer by Name, Mobile, Email..."
              value={customerSearchQuery || ''}
              onChange={e => setCustomerSearchQuery && setCustomerSearchQuery(e.target.value)}
              onFocus={() => setShowCustomerDropdown && setShowCustomerDropdown(true)}
            />
            
            {/* Customer Dropdown */}
            {showCustomerDropdown && (
              <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
                {customerOptions && customerOptions.length > 0 ? (
                  customerOptions.map(customer => (
                    <button
                      type="button"
                      key={customer.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedCustomer && setSelectedCustomer(customer.id);
                        setShowCustomerDropdown && setShowCustomerDropdown(false);
                        setCustomerSearchQuery && setCustomerSearchQuery('');
                        setIsSearchingCustomer(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-gray-800">{customer.name}</p>
                        <p className="text-xs text-gray-500">{customer.mobile}</p>
                      </div>
                      {customer.isCreditCustomer && (
                        <TradeBadge label="Credit" color="amber" variant="soft" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    No customers found matching "{customerSearchQuery}"
                  </div>
                )}
                
                {/* Quick Create Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerDropdown && setShowCustomerDropdown(false);
                    openQuickCustomerModal && openQuickCustomerModal(customerSearchQuery);
                  }}
                  className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 text-amber-700 font-bold text-sm flex items-center justify-center gap-2 border-t border-gray-200 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create New Customer
                </button>
              </div>
            )}
            
            {/* Optional cancel button if they want to abort searching */}
            <button 
               type="button"
               onClick={() => setIsSearchingCustomer(false)}
               className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
               <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          // Customer Details & Financials (Mockup Match)
          <div className="flex flex-col gap-3">
            {/* Header Row */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only clear the search box, not the currently assigned customer —
                // the previous selection now stays intact if the user cancels out
                // of the search instead of picking someone else.
                if (setCustomerSearchQuery) setCustomerSearchQuery('');
                setIsSearchingCustomer(true);
              }}
              className="w-full flex items-center justify-between gap-3 bg-primary hover:opacity-90 rounded-xl px-4 py-3 shadow-sm transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {!isWalkIn && selectedCustomerData.name ? selectedCustomerData.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-white tracking-tight leading-tight truncate">
                    {selectedCustomerData.name}
                  </h2>
                  <p className="text-xs text-white/80 font-medium mt-0.5 truncate">
                    {isWalkIn
                      ? 'Walk-in'
                      : `${selectedCustomerData.id || 'MEM-001'} • ${selectedCustomerData.mobile || '+971 50 123 4567'}`}
                  </p>
                </div>
              </div>
              <ChevronDown className="w-5 h-5 text-white shrink-0" />
            </button>

            {/* Financials Row */}
            {!isWalkIn && (
              <div className="flex flex-wrap sm:flex-nowrap gap-3">
                <div className="flex-1 min-w-0 bg-red-50/80 border border-red-100 rounded-lg p-3 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Balance Due</span>
                  {isAccountSummaryLoading ? (
                    <span className="h-4 w-16 bg-red-100/80 rounded animate-pulse" />
                  ) : (
                    <span className="text-sm font-black text-red-600 truncate">
                      {formatCurrency ? formatCurrency(balanceDue) : `AED ${Number(balanceDue).toFixed(2)}`}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 bg-white border border-gray-200 shadow-sm rounded-lg p-3 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Last Purchase</span>
                  {isAccountSummaryLoading ? (
                    <span className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                  ) : (
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mt-0.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {lastPurchaseDate || 'No purchases yet'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Warning Banner (Dynamic) */}
      {selectedCustomerData && !isSearchingCustomer && (selectedCustomerData.status === 'Blocked' || selectedCustomerData.status === 'Inactive') && (
        <div className="shrink-0 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2.5 shadow-sm">
          <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-700">Account Restricted</p>
            <p className="text-[11px] font-semibold text-red-600/80 leading-tight mt-0.5">
              This customer account is currently marked as {selectedCustomerData.status}. Please verify before proceeding.
            </p>
          </div>
        </div>
      )}
      
      {!isWalkIn && !isSearchingCustomer && !isAccountSummaryLoading && selectedCustomerData?.isCreditCustomer && balanceDue > selectedCustomerData?.creditLimit && (
        <div className="shrink-0 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-700">Credit Limit Exceeded</p>
            <p className="text-[11px] font-semibold text-amber-600/80 leading-tight mt-0.5">
              Outstanding balance ({formatCurrency ? formatCurrency(balanceDue) : balanceDue}) exceeds the allowed limit ({formatCurrency ? formatCurrency(selectedCustomerData.creditLimit) : selectedCustomerData.creditLimit}).
            </p>
          </div>
        </div>
      )}

      {/* 3. Quick Picks Header */}
      <div className="shrink-0 mt-4 border-b border-gray-200 pb-2 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Quick Pick &mdash; Frequent Items
        </span>
      </div>

      {/* 4. Product List (Quick Picks) */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-2">
        <TradeProductGrid 
          products={filteredProducts}
          loading={posProductsLoading}
          onProductSelected={onProductSelected}
          formatCurrency={formatCurrency}
        />
      </div>
    </div>
  );
});

TradeMainCanvas.displayName = 'TradeMainCanvas';
