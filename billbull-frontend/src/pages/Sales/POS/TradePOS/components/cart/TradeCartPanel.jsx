import React, { useCallback } from 'react';
import { ShoppingCart, ChevronRight, PauseCircle, Truck, ArrowUpCircle } from 'lucide-react';
import { TradeCartList } from './TradeCartList';

export const TradeCartPanel = React.memo(({
  currentInvoice,
  customerName,
  selectedFocusItemId,
  setSelectedFocusItemId,
  formatCurrency,
  handleCheckout,
  onEditItem,
  updateQuantity,
  onRemoveItem,
  onClearInvoice,
  holdInvoice,
  openDeliveryModal,
  setShowCashDropDialog
}) => {
  const handleSelectItem = useCallback((itemId) => {
    if (setSelectedFocusItemId) {
      setSelectedFocusItemId(prev => prev === itemId ? null : itemId);
    }
  }, [setSelectedFocusItemId]);

  const activeItemsCount = currentInvoice?.items?.filter(i => !i.isVoided)?.length || 0;
  const totalUnits = currentInvoice?.items?.reduce((sum, item) => sum + (!item.isVoided ? item.quantity : 0), 0) || 0;

  const hasItems = !!(currentInvoice?.items && currentInvoice.items.length > 0);

  return (
    <div className="w-full h-full flex flex-col shrink-0 bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">

      {/* Invoice Header */}
      <div className="shrink-0 p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ShoppingCart className="w-5 h-5 text-amber-500 shrink-0" />
          <h2 className="font-black text-slate-800 tracking-tight text-sm uppercase truncate">
            Invoice Items
          </h2>
          {activeItemsCount > 0 && (
            <span className="bg-primary text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
              {activeItemsCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <span className="hidden lg:inline text-xs font-mono font-semibold text-slate-400 mr-1.5">
            INV-{currentInvoice?.id || 'NEW'}
          </span>

          <button
            type="button"
            onClick={() => holdInvoice && holdInvoice()}
            disabled={!hasItems}
            aria-label="Hold invoice"
            title="Hold invoice"
            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <PauseCircle className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => openDeliveryModal && openDeliveryModal()}
            aria-label="Create delivery"
            title="Create delivery"
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Truck className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowCashDropDialog && setShowCashDropDialog(true)}
            aria-label="Cash drop"
            title="Cash drop"
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <ArrowUpCircle className="w-4 h-4" />
          </button>

          <span className="w-px h-5 bg-gray-200 mx-0.5" />

          <button
            type="button"
            onClick={() => onClearInvoice && onClearInvoice()}
            disabled={!hasItems}
            aria-label="Clear invoice"
            title="Clear invoice"
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:hover:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <span className="text-lg leading-none block w-4 text-center">&times;</span>
          </button>
        </div>
      </div>

      {/* Main Cart Area */}
      <div className="flex-1 min-h-0 relative">
        <TradeCartList
          items={currentInvoice?.items}
          selectedItemId={selectedFocusItemId}
          onSelectItem={handleSelectItem}
          onEditItem={onEditItem}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={onRemoveItem}
          formatCurrency={formatCurrency}
        />
      </div>

      {/* Footer / Summary Area */}
      <div className="shrink-0 p-3 sm:p-5 bg-white border-t border-gray-100 flex flex-col gap-3 sm:gap-4">

        {/* Meta info row */}
        <div className="flex justify-between items-center text-xs font-semibold text-slate-400 gap-2">
          <span className="shrink-0">{totalUnits} units total</span>
          <span className="truncate">{customerName || 'Walk-in Customer'}</span>
        </div>

        {/* Totals & Checkout */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Grand Total
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">
              {formatCurrency ? formatCurrency(currentInvoice?.total || 0) : `AED ${Number(currentInvoice?.total || 0).toFixed(2)}`}
            </span>
          </div>

          <button
            onClick={() => handleCheckout && handleCheckout()}
            disabled={!currentInvoice?.items || currentInvoice.items.length === 0}
            className="h-12 sm:h-14 px-6 sm:px-8 w-full sm:w-auto bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 rounded-xl text-slate-900 font-black tracking-wide text-base sm:text-lg transition-colors shadow-sm"
          >
            Checkout
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
});

TradeCartPanel.displayName = 'TradeCartPanel';

