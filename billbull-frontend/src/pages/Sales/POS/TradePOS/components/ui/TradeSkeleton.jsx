import React from 'react';

/**
 * TradeSkeleton
 * 
 * Loading placeholder with a continuous pulse animation.
 */
export const TradeSkeleton = React.memo(({
  className = '',
  shape = 'rect', // rect, circle
}) => {
  const baseStyles = 'bg-gray-200 animate-pulse';
  const shapeStyles = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div className={`${baseStyles} ${shapeStyles} ${className}`} />
  );
});

TradeSkeleton.displayName = 'TradeSkeleton';
