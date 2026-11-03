import React from 'react';
import { Ban, Trash2, Plus, Minus, Handshake, Layers } from 'lucide-react';
import { isCustomerPricedLine, tierMarkerOf } from '../../../posUtils';

export const TradeInvoiceRow = React.memo(({
  item,
  selected = false,
  onClick,
  onDoubleClick,
  onUpdateQuantity,
  onRemoveItem,
  formatCurrency
}) => {
  if (!item) return null;

  const { name, quantity, total, isVoided } = item;

  const baseStyles = 'p-3 sm:p-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-100 transition-colors group bg-white';
  const stateStyles = isVoided
    ? 'bg-red-50/50 hover:bg-red-50'
    : selected
      ? 'bg-amber-50/30'
      : 'hover:bg-gray-50';

  const handleDecrement = (e) => {
    e.stopPropagation();
    if (onUpdateQuantity) onUpdateQuantity(item.id, quantity - 1);
  };

  const handleIncrement = (e) => {
    e.stopPropagation();
    if (onUpdateQuantity) onUpdateQuantity(item.id, quantity + 1);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (onRemoveItem) onRemoveItem(item.id);
  };

  return (
    <div
      data-cart-line-id={item.id}
      className={`${baseStyles} ${stateStyles}`}
      onClick={() => onClick && onClick(item.id)}
      onDoubleClick={() => onDoubleClick && onDoubleClick(item.id)}
    >
      {/* Left: Product Info */}
      <div className="flex flex-col min-w-0 flex-1 cursor-pointer basis-40">
        <div className="flex items-center gap-2">
          {isVoided && <Ban className="w-4 h-4 text-red-500 shrink-0" />}
          <span className={`text-sm font-bold truncate ${isVoided ? 'text-gray-400 line-through' : 'text-slate-800'}`}>
            {name}
          </span>
          {Number(item.unitConversion) > 1 && (
            <span className="shrink-0 rounded bg-[#327F74]/10 px-1.5 py-px text-[10px] font-bold text-[#327F74]">{item.unit}</span>
          )}
          {isCustomerPricedLine(item) && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-bold text-emerald-700" data-testid="customer-price-marker">
              <Handshake className="h-3 w-3" /> Customer price
            </span>
          )}
          {tierMarkerOf(item) && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-700" data-testid="tier-price-marker">
              <Layers className="h-3 w-3" /> {tierMarkerOf(item)}
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono text-slate-400 mt-0.5 uppercase tracking-wide truncate">
          {item.barcode || item.id} &bull; {item.unit || 'UNIT'}
        </span>
      </div>

      {/* Right: Actions & Price */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0 ml-auto">

        {/* Quantity Controls */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={handleDecrement}
            aria-label="Decrease quantity"
            className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={isVoided}
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-8 text-center text-xs font-bold text-slate-800">
            {quantity}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            aria-label="Increase quantity"
            className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={isVoided}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Price & Delete */}
        <div className="flex flex-col items-end">
          <span className="hidden sm:block text-[9px] font-bold text-slate-300 tracking-wider mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            double-click to edit
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className={`text-sm font-black ${isVoided ? 'text-gray-400 line-through' : 'text-slate-900'}`}>
              {formatCurrency ? formatCurrency(total) : `AED ${Number(total || 0).toFixed(2)}`}
            </span>
            <button
              type="button"
              onClick={handleRemove}
              className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={isVoided}
              title="Remove Item"
              aria-label="Remove item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
});

TradeInvoiceRow.displayName = 'TradeInvoiceRow';

