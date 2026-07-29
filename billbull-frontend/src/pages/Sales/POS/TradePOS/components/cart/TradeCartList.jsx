import React, { useRef, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { TradeInvoiceRow } from './TradeInvoiceRow';
import { TradeEmptyState } from '../ui';

export const TradeCartList = React.memo(({
  items = [],
  selectedItemId,
  onSelectItem,
  formatCurrency
}) => {
  const listRef = useRef(null);

  // Auto-scroll to the bottom when new items are added
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items.length]);

  if (!items || items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-50/50">
        <TradeEmptyState
          icon={<ShoppingCart />}
          title="Cart is empty"
          description="Scan a barcode or select a product from the catalog."
        />
      </div>
    );
  }

  return (
    <div 
      ref={listRef}
      className="flex-1 overflow-y-auto no-scrollbar bg-white"
    >
      <div className="flex flex-col">
        {items.map((item) => (
          <TradeInvoiceRow
            key={item.id}
            item={item}
            selected={item.id === selectedItemId}
            onClick={onSelectItem}
            formatCurrency={formatCurrency}
          />
        ))}
      </div>
    </div>
  );
});

TradeCartList.displayName = 'TradeCartList';
