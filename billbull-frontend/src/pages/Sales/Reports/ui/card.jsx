import React from 'react';

const join = (...classes) => classes.filter(Boolean).join(' ');

export function Card({ className = '', ...props }) {
  return <div className={join('rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm', className)} {...props} />;
}

export function CardHeader({ className = '', ...props }) {
  return <div className={join('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}

export function CardTitle({ className = '', ...props }) {
  return <h3 className={join('text-lg font-semibold leading-none tracking-normal', className)} {...props} />;
}

export function CardContent({ className = '', ...props }) {
  return <div className={join('p-6 pt-0', className)} {...props} />;
}
