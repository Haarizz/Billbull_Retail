import React from 'react';
import { TradeSummaryCard, TradeDivider } from '../ui';

export const TradeSummary = React.memo(({
  currentInvoice,
  formatCurrency
}) => {
  if (!currentInvoice) return null;

  // We rely entirely on the totals computed by POSSales.jsx
  // No calculations are performed here to ensure perfect parity.
  const { subTotal = 0, discount = 0, tax = 0, total = 0, items = [] } = currentInvoice;
  
  // Count only non-voided items
  const activeItemsCount = items.filter(i => !i.isVoided).length;

  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
          {activeItemsCount} {activeItemsCount === 1 ? 'Item' : 'Items'}
        </span>
      </div>

      <TradeSummaryCard 
        label="Subtotal" 
        amount={formatCurrency ? formatCurrency(subTotal) : subTotal} 
        size="sm" 
      />
      
      {discount > 0 && (
        <TradeSummaryCard 
          label="Discount" 
          amount={`-${formatCurrency ? formatCurrency(discount) : discount}`} 
          accentColor="text-amber-600"
          size="sm" 
        />
      )}

      <TradeSummaryCard 
        label="VAT" 
        amount={formatCurrency ? formatCurrency(tax) : tax} 
        size="sm" 
      />

      <TradeDivider className="my-1" />

      <TradeSummaryCard 
        label="Grand Total" 
        amount={formatCurrency ? formatCurrency(total) : total} 
        accentColor="text-primary"
        size="lg" 
      />
    </div>
  );
});

TradeSummary.displayName = 'TradeSummary';
