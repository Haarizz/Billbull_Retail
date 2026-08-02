import React, { useCallback } from 'react';
import { Package, Star } from 'lucide-react';

export const TradeProductCard = React.memo(({
  product,
  onProductSelected,
  formatCurrency
}) => {
  const handleClick = useCallback(() => {
    if (onProductSelected && product) {
      onProductSelected(product);
    }
  }, [onProductSelected, product]);

  if (!product) return null;

  return (
    <div 
      onClick={handleClick}
      className="flex items-center justify-between p-3 bg-white rounded-xl hover:bg-gray-50 hover:shadow-sm border border-transparent hover:border-gray-200 cursor-pointer transition-all group"
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

