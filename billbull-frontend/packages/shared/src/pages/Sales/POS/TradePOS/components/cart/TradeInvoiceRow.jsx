import React from 'react';
import CartLineCard from '../../../features/cart/CartLineCard';

/**
 * Compact (TradePOS) cart line. Renders the shared CartLineCard so every screen
 * template shows cart lines the same way. Callbacks here take the line id.
 */
export const TradeInvoiceRow = React.memo(({
  item,
  index = 0,
  selected = false,
  posSettings,
  onClick,
  onDoubleClick,
  onUpdateQuantity,
  onRemoveItem,
  formatCurrency
}) => {
  if (!item) return null;

  return (
    <CartLineCard
      item={item}
      index={index}
      selected={selected}
      posSettings={posSettings}
      formatCurrency={formatCurrency}
      onClick={onClick ? (line) => onClick(line.id) : undefined}
      onDoubleClick={onDoubleClick ? (line) => onDoubleClick(line.id) : undefined}
      onUpdateQuantity={onUpdateQuantity}
      onRemove={onRemoveItem}
      canRemoveVoided={false}
    />
  );
});

TradeInvoiceRow.displayName = 'TradeInvoiceRow';
