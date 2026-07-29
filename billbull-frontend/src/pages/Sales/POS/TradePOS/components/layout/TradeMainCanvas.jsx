import React from 'react';
import { User, AlertTriangle, Lock } from 'lucide-react';
import { TradeSearchBar } from '../catalog/TradeSearchBar';
import { TradeCategoryFilter } from '../catalog/TradeCategoryFilter';
import { TradeProductGrid } from '../catalog/TradeProductGrid';
import { TradeCard } from '../ui';

export const TradeMainCanvas = React.memo(({
  searchQuery,
  setSearchQuery,
  barcodeInputRef,
  handleUnifiedEntry,
  productCategories,
  selectedCategory,
  setSelectedCategory,
  filteredProducts,
  posProductsLoading,
  addToInvoice,
  formatCurrency
}) => {
  return (
    <div className="flex-1 min-w-0 h-full flex flex-col gap-3">
      {/* 1. Barcode / Product Search */}
      <div className="shrink-0">
        <TradeSearchBar 
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          barcodeInputRef={barcodeInputRef}
          handleUnifiedEntry={handleUnifiedEntry}
        />
      </div>

      {/* 2 & 3. Customer Search & Card Placeholders (Phase 5) */}
      <TradeCard padding="p-3" className="shrink-0 flex items-center justify-between bg-gray-50/80 border-dashed border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400">Select Customer...</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mt-0.5">Walk-in Customer</p>
          </div>
        </div>
        <Lock className="w-4 h-4 text-gray-300" />
      </TradeCard>

      {/* 4. Warning Banner Placeholder */}
      {/* Intentionally hidden/collapsed unless active, but we show a small disabled strip for structural parity */}
      <div className="shrink-0 bg-amber-50/50 border border-amber-100 rounded-lg p-2 flex items-center gap-2 opacity-60">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <p className="text-[11px] font-semibold text-amber-700/70">No active warnings for this customer</p>
      </div>

      {/* 5. Categories */}
      <div className="shrink-0">
        <TradeCategoryFilter 
          productCategories={productCategories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        />
      </div>

      {/* 6. Product Grid (Quick Picks) */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-2">
        <TradeProductGrid 
          products={filteredProducts}
          loading={posProductsLoading}
          addToInvoice={addToInvoice}
          formatCurrency={formatCurrency}
        />
      </div>
    </div>
  );
});

TradeMainCanvas.displayName = 'TradeMainCanvas';
