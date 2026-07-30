import React from 'react';

/**
 * TradeSummaryCard
 * 
 * Used for displaying totals (Subtotal, VAT, Grand Total) with distinct typography.
 */
export const TradeSummaryCard = React.memo(({
  label,
  amount,
  accentColor = 'text-foreground', // Can be overridden for primary totals (e.g. text-primary)
  size = 'md', // sm, md, lg
  className = ''
}) => {
  const sizes = {
    sm: { label: 'text-xs', amount: 'text-sm' },
    md: { label: 'text-sm', amount: 'text-lg' },
    lg: { label: 'text-base font-bold', amount: 'text-2xl font-black' }
  };

  const selectedSize = sizes[size] || sizes.md;

  return (
    <div className={`flex items-center justify-between py-1 ${className}`}>
      <span className={`text-gray-500 ${selectedSize.label}`}>{label}</span>
      <span className={`font-bold ${accentColor} ${selectedSize.amount}`}>{amount}</span>
    </div>
  );
});

TradeSummaryCard.displayName = 'TradeSummaryCard';
