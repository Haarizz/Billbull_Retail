import React, { useCallback } from 'react';
import { ShoppingBag, CreditCard } from 'lucide-react';
import { TradeCard, TradeButton } from '../ui';
import { TradeCartList } from './TradeCartList';
import { TradeSummary } from './TradeSummary';

export const TradeCartPanel = React.memo(({
  currentInvoice,
  selectedFocusItemId,
  setSelectedFocusItemId,
  formatCurrency
}) => {
  // Pass a clean handler to TradeCartList that matches legacy behavior
  const handleSelectItem = useCallback((itemId) => {
    if (setSelectedFocusItemId) {
      setSelectedFocusItemId(prev => prev === itemId ? null : itemId);
    }
  }, [setSelectedFocusItemId]);

  return (
    <div className="w-full h-full flex flex-col shrink-0">
      
      {/* Main Cart Area */}
      <TradeCard padding="p-0" className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden shadow-sm">
        
        {/* Invoice Header */}
        <div className="shrink-0 p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#F5C742]" />
            <span className="font-bold text-slate-800 tracking-tight text-sm">
              Current Sale
            </span>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded">
            INV-{currentInvoice?.id || 'NEW'}
          </span>
        </div>

        {/* Cart List */}
        <TradeCartList 
          items={currentInvoice?.items}
          selectedItemId={selectedFocusItemId}
          onSelectItem={handleSelectItem}
          formatCurrency={formatCurrency}
        />

        {/* Invoice Summary */}
        <div className="shrink-0 mt-auto">
          <TradeSummary 
            currentInvoice={currentInvoice}
            formatCurrency={formatCurrency}
          />
        </div>

        {/* Checkout Button (Disabled Placeholder for Phase 4) */}
        <div className="shrink-0 p-3 bg-gray-50 border-t border-gray-200">
          <button 
            disabled 
            className="w-full h-14 bg-[#F5C742] opacity-50 cursor-not-allowed flex items-center justify-center gap-2 rounded-xl text-slate-900 font-black tracking-wide text-lg"
          >
            <CreditCard className="w-6 h-6" />
            PAY {formatCurrency ? formatCurrency(currentInvoice?.total || 0) : currentInvoice?.total || 0}
          </button>
        </div>
      </TradeCard>
    </div>
  );
});

TradeCartPanel.displayName = 'TradeCartPanel';
