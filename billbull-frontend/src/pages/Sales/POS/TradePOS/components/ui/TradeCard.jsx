import React from 'react';

/**
 * TradeCard
 * 
 * Reusable container for major UI sections in the Trade POS.
 * Ensures consistent borders, background colors, and border-radius.
 */
export const TradeCard = React.memo(({
  children,
  className = '',
  padding = 'p-4', // none, p-2, p-3, p-4, p-6
  noBorder = false,
  onClick,
}) => {
  const baseStyles = 'bg-white rounded-2xl overflow-hidden';
  const borderStyles = noBorder ? '' : 'border border-gray-200 shadow-sm';
  const interactiveStyles = onClick ? 'cursor-pointer hover:border-[#F5C742] hover:shadow-md transition-all active:scale-[0.98]' : '';

  return (
    <div 
      className={`${baseStyles} ${borderStyles} ${interactiveStyles} ${padding} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
});

TradeCard.displayName = 'TradeCard';
