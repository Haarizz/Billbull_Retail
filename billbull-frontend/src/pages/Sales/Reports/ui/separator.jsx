import React from 'react';

export function Separator({ className = '', orientation = 'horizontal', ...props }) {
  const orientationClass = orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full';
  return <div className={`${orientationClass} shrink-0 bg-slate-200 ${className}`} {...props} />;
}
