import React from 'react';

const join = (...classes) => classes.filter(Boolean).join(' ');

const variantClasses = {
  default: 'bg-slate-900 text-white hover:bg-slate-800',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'hover:bg-slate-100 hover:text-slate-900',
  link: 'text-slate-900 underline-offset-4 hover:underline',
  outline: 'border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
};

const sizeClasses = {
  default: 'h-10 px-4 py-2',
  icon: 'h-10 w-10',
  lg: 'h-11 px-8',
  sm: 'h-9 px-3',
};

export const Button = React.forwardRef(function Button(
  { className = '', variant = 'default', size = 'default', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={join(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant] || variantClasses.default,
        sizeClasses[size] || sizeClasses.default,
        className,
      )}
      {...props}
    />
  );
});
