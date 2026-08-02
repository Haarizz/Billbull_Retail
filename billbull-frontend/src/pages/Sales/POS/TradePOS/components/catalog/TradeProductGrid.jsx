import React from 'react';
import { PackageX } from 'lucide-react';
import { TradeProductCard } from './TradeProductCard';
import { TradeSkeleton, TradeEmptyState } from '../ui';

export const TradeProductGrid = React.memo(({
  products = [],
  loading = false,
  onProductSelected,
  formatCurrency
}) => {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 pb-20 lg:pb-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <TradeSkeleton key={i} className="h-16 w-full rounded-lg" />
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
    <div className="flex flex-col gap-2 pb-20 lg:pb-4">
      {products.map(product => (
        <TradeProductCard
          key={product.id}
          product={product}
          onProductSelected={onProductSelected}
          formatCurrency={formatCurrency}
        />
      ))}
    </div>
  );
});

TradeProductGrid.displayName = 'TradeProductGrid';
