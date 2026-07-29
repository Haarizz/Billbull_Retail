import React, { useCallback } from 'react';
import { Package, Star } from 'lucide-react';
import { TradeCard, TradeBadge } from '../ui';

export const TradeProductCard = React.memo(({
  product,
  addToInvoice,
  formatCurrency
}) => {
  const handleClick = useCallback(() => {
    if (addToInvoice && product) {
      addToInvoice(product);
    }
  }, [addToInvoice, product]);

  if (!product) return null;

  return (
    <TradeCard 
      onClick={handleClick}
      padding="p-1.5"
      className="flex flex-row items-center gap-2.5 h-14 hover:shadow-sm hover:border-[#F5C742] transition-all group overflow-hidden bg-white cursor-pointer"
    >
      {/* Dense Image Thumbnail */}
      <div className="relative w-11 h-11 bg-gray-50 flex-shrink-0 flex items-center justify-center rounded overflow-hidden border border-gray-100">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name} 
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
          />
        ) : (
          <Package className="w-5 h-5 text-gray-300" />
        )}
        
        {/* Favourite Indicator (Tiny) */}
        {product.favourite && (
          <div className="absolute top-0.5 right-0.5 bg-white/90 backdrop-blur-sm p-0.5 rounded shadow-sm text-yellow-500">
            <Star className="w-2.5 h-2.5 fill-current" />
          </div>
        )}
      </div>

      {/* Dense Content Area */}
      <div className="flex flex-col flex-1 min-w-0 justify-center h-full">
        {/* Title */}
        <h3 className="text-[11px] font-bold text-[#1E293B] leading-tight truncate mb-0.5" title={product.name}>
          {product.name}
        </h3>
        
        {/* Footer: Code & Price */}
        <div className="flex items-center justify-between mt-auto">
          <p className="text-[9px] font-mono text-gray-400 truncate max-w-[50%]">
            {product.barcode || product.id}
          </p>
          <span className="text-[11px] font-black text-[#327F74] shrink-0">
            {formatCurrency ? formatCurrency(product.price) : product.price}
          </span>
        </div>
      </div>
    </TradeCard>
  );
});

TradeProductCard.displayName = 'TradeProductCard';
