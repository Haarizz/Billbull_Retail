import React from 'react';

const join = (...classes) => classes.filter(Boolean).join(' ');

export const Input = React.forwardRef(function Input({ className = '', type = 'text', ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={join(
        'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
