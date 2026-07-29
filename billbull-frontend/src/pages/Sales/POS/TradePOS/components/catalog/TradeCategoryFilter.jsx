import React from 'react';
import { TradeButton } from '../ui';

export const TradeCategoryFilter = React.memo(({
  productCategories = [],
  selectedCategory,
  setSelectedCategory
}) => {
  if (!productCategories || productCategories.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto pb-2 -mb-2 no-scrollbar">
      <div className="flex gap-2 whitespace-nowrap min-w-max px-1">
        <TradeButton
          variant={selectedCategory === 'All' || !selectedCategory ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setSelectedCategory('All')}
          className="rounded-full px-5"
        >
          All
        </TradeButton>
        
        {productCategories.map(category => (
          <TradeButton
            key={category.id}
            variant={selectedCategory === category.id ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSelectedCategory(category.id)}
            className="rounded-full px-5"
          >
            {category.categoryName}
          </TradeButton>
        ))}
      </div>
    </div>
  );
});

TradeCategoryFilter.displayName = 'TradeCategoryFilter';
