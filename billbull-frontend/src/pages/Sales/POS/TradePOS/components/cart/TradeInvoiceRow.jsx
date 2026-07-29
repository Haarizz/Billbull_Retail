import React from 'react';
import { Ban } from 'lucide-react';
import { TradeBadge } from '../ui';

export const TradeInvoiceRow = React.memo(({
  item,
  selected = false,
  onClick,
  formatCurrency
}) => {
  if (!item) return null;

  // The item object contains all computed values from POSSales.jsx
  // We do NOT recalculate price * qty, or taxes, or discounts here.
  const { name, quantity, price, discount, lineTotal, isVoided } = item;

  // Compute styles based on selection and void status
  const baseStyles = 'p-3 flex flex-col gap-1 border-b border-gray-100 cursor-pointer transition-colors';
  const stateStyles = isVoided 
    ? 'bg-red-50/70 hover:bg-red-100/70' 
    : selected 
      ? 'bg-[#F5C742]/10 border-l-2 border-l-[#F5C742]' 
      : 'bg-white hover:bg-[#F5C742]/5 border-l-2 border-l-transparent';

  return (
    <div 
      className={`${baseStyles} ${stateStyles}`} 
      onClick={() => onClick && onClick(item.id)}
    >
      {/* Top Row: Name and Line Total */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {isVoided && <Ban className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
          <span className={`text-sm font-semibold truncate ${isVoided ? 'text-gray-400 line-through' : 'text-[#1E293B]'}`}>
            {name}
          </span>
        </div>
        <span className={`text-sm font-black shrink-0 ${isVoided ? 'text-gray-400 line-through' : 'text-[#1E293B]'}`}>
          {formatCurrency ? formatCurrency(lineTotal) : lineTotal}
        </span>
      </div>

      {/* Bottom Row: Qty x Price, and Badges */}
      <div className="flex justify-between items-center text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span>{quantity}</span>
          <span className="text-[10px]">×</span>
          <span>{formatCurrency ? formatCurrency(price) : price}</span>
        </div>
        
        {/* Badges */}
        <div className="flex items-center gap-1">
          {discount > 0 && !isVoided && (
            <TradeBadge label={`-${formatCurrency ? formatCurrency(discount) : discount}`} color="saffron" variant="soft" />
          )}
          {isVoided && (
            <TradeBadge label="VOID" color="red" variant="soft" />
          )}
        </div>
      </div>
    </div>
  );
});

TradeInvoiceRow.displayName = 'TradeInvoiceRow';
