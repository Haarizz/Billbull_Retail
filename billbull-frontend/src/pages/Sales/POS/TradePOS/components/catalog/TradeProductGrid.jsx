import React from 'react';
import { PackageX } from 'lucide-react';
import { TradeProductCard } from './TradeProductCard';
import { TradeSkeleton, TradeEmptyState } from '../ui';

export const TradeProductGrid = React.memo(({
  products = [],
  loading = false,
  addToInvoice,
  formatCurrency
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 pb-20 lg:pb-4">
        {Array.from({ length: 18 }).map((_, i) => (
          <TradeSkeleton key={i} className="h-14 w-full rounded" />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <TradeEmptyState
        icon={<PackageX />}
        title="No Products Found"
        description="Try adjusting your search or category filter."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 pb-20 lg:pb-4 content-start">
      {products.map(product => (
        <TradeProductCard
          key={product.id}
          product={product}
          addToInvoice={addToInvoice}
          formatCurrency={formatCurrency}
        />
      ))}
    </div>
  );
});

TradeProductGrid.displayName = 'TradeProductGrid';
