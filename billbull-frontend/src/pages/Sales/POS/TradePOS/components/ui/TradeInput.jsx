import React, { forwardRef } from 'react';

/**
 * TradeInput
 * 
 * Standardized input component for the Trade POS.
 * Ensures consistent borders, focus rings (Saffron #F5C742), and optional icons.
 */
export const TradeInput = React.memo(forwardRef(({
  className = '',
  icon,
  iconPosition = 'left', // 'left' or 'right'
  error = false,
  containerClassName = '',
  ...props
}, ref) => {
  const baseStyles = 'w-full bg-gray-50 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 focus:bg-white text-[#1E293B] placeholder:text-gray-400';
  
  // Dynamic padding based on icon presence and position
  const paddingX = icon ? (iconPosition === 'left' ? 'pl-9 pr-3' : 'pl-3 pr-9') : 'px-3';
  const paddingY = 'py-2.5';
  
  // Height must be sufficient for mobile touch targets (~44px min for inputs)
  const sizing = 'min-h-[44px]';
  
  const borderStyles = error ? 'border-red-300 focus:border-red-500' : 'border-gray-200 focus:border-[#F5C742]';

  return (
    <div className={`relative ${containerClassName}`}>
      {icon && iconPosition === 'left' && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {icon}
        </span>
      )}
      
      <input
        ref={ref}
        className={`${baseStyles} ${borderStyles} ${paddingX} ${paddingY} ${sizing} ${className}`}
        {...props}
      />
      
      {icon && iconPosition === 'right' && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {icon}
        </span>
      )}
    </div>
  );
}));

TradeInput.displayName = 'TradeInput';
