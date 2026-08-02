import React from 'react';

/**
 * TradeDivider
 * 
 * Consistent visual separator.
 */
export const TradeDivider = React.memo(({
  orientation = 'horizontal', // horizontal, vertical
  className = '',
  color = 'bg-gray-200'
}) => {
  if (orientation === 'vertical') {
    return <div className={`w-px h-full ${color} ${className}`} />;
  }
  
  return <div className={`h-px w-full ${color} ${className}`} />;
});

TradeDivider.displayName = 'TradeDivider';
