import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

/**
 * Debounced typeahead used by the POS Administration correction forms, where the operator knows
 * an invoice number, a terminal or a cashier — never the surrogate id the correction targets.
 *
 * <p>The caller renders each option itself, because the rows differ per picker (an invoice shows
 * date/amount/block reason, a session shows terminal and counted cash) and a props-driven
 * one-size-fits-all row would fit neither.
 *
 * <p>Results sit in normal flow rather than in an absolute overlay: these forms live inside a
 * scrolling dialog body, which clipped an absolutely-positioned list down to its first row. In
 * flow the list pushes the form down and scrolls itself into view.
 */
export default function SearchSelect({
  value, display, placeholder, prefix, onSearch, onSelect, onClear, renderOption,
  minChars = 1, disabled, searchOnFocus = false,
}) {
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (value) return undefined;
    const q = term.trim();
    // searchOnFocus pickers (the session list) are useful empty — they show the latest rows.
    if (!searchOnFocus && q.length < minChars) { setOptions([]); return undefined; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await onSearch(q);
        if (!cancelled) { setOptions(results || []); setOpen(true); }
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, value]);

  useEffect(() => {
    if (open && options.length > 0) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, options]);

  if (value) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 border border-slate-200 rounded-lg bg-slate-50">
        <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{display}</span>
        <button type="button" onClick={() => { setTerm(''); setOptions([]); onClear(); }}
          className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center h-9 border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-[#F5C742]">
        {prefix && <span className="pl-3 text-sm font-semibold text-slate-400 select-none">{prefix}</span>}
        <input
          value={term}
          disabled={disabled}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => options.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 h-full px-2 text-sm bg-transparent outline-none disabled:bg-slate-50"
        />
        {searching
          ? <Loader2 className="animate-spin mr-3 text-slate-400" size={14} />
          : <Search className="mr-3 text-slate-400" size={14} />}
      </div>
      {open && options.length > 0 && (
        <ul ref={listRef} className="mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-sm">
          {options.map((opt, i) => renderOption(opt, i, () => { setOpen(false); onSelect(opt); }))}
        </ul>
      )}
      {open && !searching && options.length === 0 && (searchOnFocus || term.trim().length >= minChars) && (
        <div className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500">
          No matches.
        </div>
      )}
    </div>
  );
}
