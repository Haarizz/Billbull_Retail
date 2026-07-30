import React from 'react';

/**
 * TradeBadge
 * 
 * Reusable status indicator for the Trade POS.
 * Commonly used for stock levels, payment status, or counts.
 */
export const TradeBadge = React.memo(({
  label,
  color = 'gray', // gray, green, amber, red, saffron, slate
  variant = 'soft', // soft, solid, outline
  className = '',
  icon,
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-bold rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider shrink-0 gap-1';

  const styles = {
    soft: {
      gray: 'bg-gray-100 text-gray-600',
      green: 'bg-green-50 text-green-700',
      amber: 'bg-amber-50 text-amber-700',
      red: 'bg-red-50 text-red-600',
      saffron: 'bg-primary/20 text-primary-foreground',
      slate: 'bg-slate-100 text-slate-700'
    },
    solid: {
      gray: 'bg-gray-500 text-white',
      green: 'bg-green-600 text-white',
      amber: 'bg-amber-500 text-white',
      red: 'bg-red-500 text-white',
      saffron: 'bg-primary text-foreground',
      slate: 'bg-slate-600 text-white'
    },
    outline: {
      gray: 'border border-gray-200 text-gray-600 bg-white',
      green: 'border border-green-200 text-green-700 bg-white',
      amber: 'border border-amber-200 text-amber-700 bg-white',
      red: 'border border-red-200 text-red-600 bg-white',
      saffron: 'border border-primary/50 text-primary-foreground bg-white',
      slate: 'border border-slate-200 text-slate-700 bg-white'
    }
  };

  const selectedStyle = styles[variant]?.[color] || styles.soft.gray;

  return (
    <span className={`${baseStyles} ${selectedStyle} ${className}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
    </span>
  );
});

TradeBadge.displayName = 'TradeBadge';
