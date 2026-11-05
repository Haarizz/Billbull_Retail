import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { buildUniqueOptions, normalizeOptionLabel } from './employeeFormModel';

export const inputClass = (error, extra = '') => [
  'w-full h-10 rounded-lg border bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400',
  'transition-colors focus:outline-none focus:ring-2',
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
  'read-only:bg-slate-50 read-only:text-slate-500',
  error
    ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
    : 'border-slate-200 hover:border-slate-300 focus:border-[#F5C742] focus:ring-[#F5C742]/25',
  extra,
].join(' ');

/** Label + control + hint/error. `children` receives the generated input id. */
export const Field = ({ label, required = false, optional = false, hint, error, className = '', children }) => {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
        {optional && <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {error ? (
        <p className="mt-1 text-[11px] text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
};

export const TextInput = ({ error, className = '', ...props }) => (
  <input type="text" aria-invalid={Boolean(error) || undefined} className={inputClass(error, className)} {...props} />
);

export const TextArea = ({ error, className = '', ...props }) => (
  <textarea
    aria-invalid={Boolean(error) || undefined}
    className={inputClass(error, `h-auto min-h-[84px] py-2 resize-y ${className}`)}
    {...props}
  />
);

/** Native select. `options` are strings or { value, label }. */
export const SelectInput = ({ options, placeholder, error, className = '', ...props }) => (
  <div className="relative">
    <select aria-invalid={Boolean(error) || undefined} className={inputClass(error, `appearance-none pr-9 ${className}`)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        return <option key={value} value={value}>{label}</option>;
      })}
    </select>
    <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

/** Input with a trailing button glued to it (e.g. "Generate"). */
export const InputWithAction = ({ actionLabel, onAction, actionDisabled = false, error, ...props }) => (
  <div className="flex">
    <input
      type="text"
      aria-invalid={Boolean(error) || undefined}
      className={inputClass(error, 'rounded-r-none')}
      {...props}
    />
    <button
      type="button"
      onClick={onAction}
      disabled={actionDisabled}
      className="shrink-0 rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {actionLabel}
    </button>
  </div>
);

export const Toggle = ({ checked, onChange, label, description, disabled = false }) => (
  <label className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <span>
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
    </span>
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="h-6 w-11 rounded-full bg-slate-200 transition-colors peer-checked:bg-[#F5C742] peer-focus-visible:ring-2 peer-focus-visible:ring-[#F5C742]/40" />
      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);

/** White card that groups related fields. */
export const SectionCard = ({ title, description, action, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

/** Selectable card used for branch / warehouse access. */
export const CheckCard = ({ checked, onChange, title, subtitle, badge }) => (
  <label
    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
      checked ? 'border-[#F5C742] bg-[#FFF8E7]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
    }`}
  >
    <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
      }`}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-slate-800">{title}</span>
      {subtitle && <span className="block truncate text-[11px] text-slate-500">{subtitle}</span>}
    </span>
    {badge}
  </label>
);

/** Free-text input with a suggestion list; typing a value that is not listed keeps it. */
export const AutocompleteField = ({
  id,
  options = [],
  value = '',
  onChange,
  placeholder = 'Select or type',
  disabled = false,
  error,
  noOptionsMessage = 'No suggestions available',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const normalizedOptions = useMemo(() => buildUniqueOptions(options), [options]);
  const normalizedValue = normalizeOptionLabel(value);
  const searchTerm = normalizedValue.toLowerCase();
  const hasExactMatch = normalizedOptions.some((option) => option.toLowerCase() === searchTerm);

  // Show the whole list when the current value is an exact pick, so the user
  // can switch to another option without clearing the field first.
  const filteredOptions = useMemo(() => {
    if (!searchTerm || hasExactMatch) return normalizedOptions;
    return normalizedOptions.filter((option) => option.toLowerCase().includes(searchTerm));
  }, [normalizedOptions, searchTerm, hasExactMatch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    } else if (event.key === 'ArrowDown' && !isOpen) {
      event.preventDefault();
      setIsOpen(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => { onChange(event.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={Boolean(error) || undefined}
        className={inputClass(error, 'pr-10')}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show options"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { if (!disabled) { setIsOpen((prev) => !prev); inputRef.current?.focus(); } }}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
      >
        <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {normalizedValue && !hasExactMatch && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(normalizedValue)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#FFF8E7]"
            >
              <span className="truncate">Use “{normalizedValue}”</span>
              <span className="ml-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">New</span>
            </button>
          )}
          {filteredOptions.length > 0 ? (
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredOptions.map((option) => {
                const isSelected = option.toLowerCase() === searchTerm;
                return (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      isSelected ? 'bg-[#FFF8E7] font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{option}</span>
                    {isSelected && <Check size={14} className="ml-3 shrink-0 text-yellow-700" />}
                  </button>
                );
              })}
            </div>
          ) : (
            !normalizedValue && <div className="px-3 py-3 text-xs text-slate-500">{noOptionsMessage}</div>
          )}
        </div>
      )}
    </div>
  );
};
