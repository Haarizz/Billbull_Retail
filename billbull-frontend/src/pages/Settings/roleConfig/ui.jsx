import React from 'react';
import { X, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@billbull/shared/components/ui/tooltip';

/**
 * Permission switch. States are distinguishable without colour alone:
 *   explicit on  — solid amber
 *   inherited on — pale amber with a dashed ring ("follows the module")
 *   changed      — dot badge (unsaved)
 */
export const Toggle = ({ checked, onChange, disabled, inherited, dirty, label, size = 'md' }) => {
  const dims = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const shift = size === 'sm' ? 'translate-x-3.5' : 'translate-x-4';
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative inline-flex ${dims} items-center rounded-full transition-colors duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742] focus-visible:ring-offset-1
          ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
          ${checked ? (inherited ? 'bg-[#F5C742]/45 border border-dashed border-[#d9a52a]' : 'bg-[#F5C742]') : 'bg-slate-200'}`}
      >
        <span className={`inline-block ${knob} transform rounded-full bg-white shadow transition-transform duration-150
          ${checked ? shift : 'translate-x-0.5'}`} />
      </button>
      {dirty && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" aria-label="unsaved change" />
      )}
    </span>
  );
};

/** Tooltip with a short explanation (Radix — rendered in a portal so tables never clip it). */
export const Hint = ({ text, children, side = 'top' }) => (
  <Tooltip delayDuration={200}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side} className="max-w-xs text-[11px] leading-snug">{text}</TooltipContent>
  </Tooltip>
);

export const InfoHint = ({ text }) => (
  <Hint text={text}>
    <button type="button" className="text-slate-300 hover:text-slate-500 align-middle" aria-label={text}>
      <Info size={11} />
    </button>
  </Hint>
);

export const Chip = ({ tone = 'slate', children, title }) => {
  const tones = {
    slate:  'bg-slate-100 text-slate-600',
    amber:  'bg-amber-50 text-amber-700 border border-amber-200',
    green:  'bg-emerald-50 text-emerald-700',
    red:    'bg-red-50 text-red-600',
    blue:   'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${tones[tone]}`}>
      {children}
    </span>
  );
};

export const Modal = ({ title, icon: Icon, onClose, children, footer, width = 'max-w-md' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`bg-white rounded-xl shadow-2xl border border-slate-200 w-full ${width} max-h-[90vh] flex flex-col overflow-hidden`}>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          {Icon && <Icon size={17} className="text-[#F5C742]" />} {title}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto">{children}</div>
      {footer && <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">{footer}</div>}
    </div>
  </div>
);

export const ReasonField = ({ value, onChange, required, autoFocus }) => (
  <div className="space-y-1">
    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">
      Reason for change {required ? <span className="text-red-500">*</span> : <span className="normal-case font-normal text-slate-400">(recommended)</span>}
    </label>
    <textarea
      rows={2}
      autoFocus={autoFocus}
      maxLength={1000}
      placeholder="e.g. Ticket #142 — cashier needs to issue returns at the new outlet"
      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] resize-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <p className="text-[10px] text-slate-400 ml-1">Stored permanently in the access audit log with your name, time and IP address.</p>
  </div>
);

export const PrimaryButton = ({ children, disabled, onClick, tone = 'amber' }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2
      ${disabled ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
        : tone === 'red' ? 'bg-red-500 hover:bg-red-600 text-white active:scale-95'
        : 'bg-[#F5C742] hover:bg-[#e5b732] text-slate-800 active:scale-95'}`}
  >
    {children}
  </button>
);

export const GhostButton = ({ children, disabled, onClick }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-40">
    {children}
  </button>
);

export const apiError = (err, fallback) =>
  err?.response?.data?.message || err?.response?.data?.error || fallback;
