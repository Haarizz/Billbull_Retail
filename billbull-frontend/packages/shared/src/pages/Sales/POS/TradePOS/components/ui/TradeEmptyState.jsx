import React from 'react';

/**
 * TradeEmptyState
 * 
 * Reusable component to show when lists (like the cart or product grid) are empty.
 */
export const TradeEmptyState = React.memo(({
  icon,
  title,
  description,
  className = '',
  action // optional TradeButton
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center h-full w-full ${className}`}>
      {icon && (
        <div className="text-gray-300 mb-4 [&>svg]:w-12 [&>svg]:h-12">
          {icon}
        </div>
      )}
      
      {title && (
        <h3 className="text-lg font-bold text-gray-800 mb-1">
          {title}
        </h3>
      )}
      
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          {description}
        </p>
      )}
      
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
});

TradeEmptyState.displayName = 'TradeEmptyState';
