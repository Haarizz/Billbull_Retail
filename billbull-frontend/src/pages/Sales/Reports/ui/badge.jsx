import React from 'react';

const join = (...classes) => classes.filter(Boolean).join(' ');

const variantClasses = {
  default: 'border-transparent bg-slate-900 text-white',
  destructive: 'border-transparent bg-red-600 text-white',
  outline: 'text-slate-950',
  secondary: 'border-transparent bg-slate-100 text-slate-900',
};

export function Badge({ className = '', variant = 'default', ...props }) {
  return (
    <span
      className={join(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant] || variantClasses.default,
        className,
      )}
      {...props}
    />
  );
}
