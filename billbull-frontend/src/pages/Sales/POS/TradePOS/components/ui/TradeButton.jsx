import React from 'react';

/**
 * TradeButton
 * 
 * Reusable, purely presentational button component for the Trade POS.
 * Enforces standardized sizes, colors, and touch targets.
 */
export const TradeButton = React.memo(({
  children,
  variant = 'primary', // primary, secondary, ghost, danger, outline
  size = 'md',         // sm, md, lg, icon
  className = '',
  disabled = false,
  icon,
  onClick,
  type = 'button',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-bold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0';
  
  const variants = {
    primary: 'bg-[#F5C742] text-[#1E293B] hover:opacity-90 shadow-sm',
    secondary: 'bg-white text-[#1E293B] border border-gray-200 hover:bg-gray-50 shadow-sm',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-[#1E293B]',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200',
    outline: 'bg-transparent border-2 border-[#F5C742] text-[#F5C742] hover:bg-[#F5C742] hover:text-[#1E293B]'
  };

  const sizes = {
    sm: 'min-h-[36px] px-3 text-xs gap-1.5',
    md: 'min-h-[48px] px-4 text-sm gap-2', // Min 48px touch target for tablet/mobile
    lg: 'min-h-[60px] px-6 text-base gap-2.5',
    icon: 'h-[48px] w-[48px] p-0 flex items-center justify-center' // Square touch target
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
});

TradeButton.displayName = 'TradeButton';
