import React, { useCallback, useEffect, useRef } from 'react';
import { Package, Star } from 'lucide-react';

export const TradeProductCard = React.memo(({
  product,
  index,
  isActive = false,
  onActivate,
  onProductSelected,
  formatCurrency
}) => {
  const rowRef = useRef(null);

  // Keep the keyboard-highlighted row visible inside the scrolling Quick Pick list.
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isActive]);

  const handleClick = useCallback(() => {
    if (onProductSelected && product) {
      onActivate?.(index);
      onProductSelected(product);
    }
  }, [onProductSelected, onActivate, product, index]);

  if (!product) return null;

  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={isActive}
      onClick={handleClick}
      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all group border ${
        isActive
          ? 'bg-amber-50 border-amber-400 shadow-sm ring-1 ring-amber-300'
          : 'bg-white border-transparent hover:bg-gray-50 hover:shadow-sm hover:border-gray-200'
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Icon / Image */}
        <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-300 shrink-0">
          {product.image ? (
            <img 
              src={product.image} 
              alt={product.name} 
              loading="lazy"
              className="w-full h-full object-cover rounded-lg" 
            />
          ) : (
            <Package className="w-5 h-5" />
          )}
        </div>
        
        {/* Content */}
        <div className="flex flex-col justify-center">
          <h3 className="text-sm font-bold text-slate-800 leading-tight group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5 uppercase tracking-wide">
            {product.barcode || product.id} &bull; {product.unit || 'UNIT'}
          </p>
        </div>
      </div>

      {/* Price */}
      <div className="text-right shrink-0">
        <span className="text-sm font-black text-teal-600">
          {formatCurrency ? formatCurrency(product.price) : `AED ${Number(product.price || 0).toFixed(2)}`}
        </span>
      </div>
    </div>
  );
});

TradeProductCard.displayName = 'TradeProductCard';

