import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@billbull/shared/components/ui/dialog';
import { searchCustomersAllFields } from '@billbull/shared/api/customerledgerApi';
import { getProductsList } from '@billbull/shared/api/productsApi';

// Shared pieces of the Price Levels workspace (Figma "Price Levels" redesign).

export const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

export const isAbort = (err) => err?.name === 'AbortError' || err?.name === 'CanceledError';

export const today = () => new Date().toISOString().slice(0, 10);

export const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export const money = (v, currency) => {
  const n = num(v);
  if (n == null) return '—';
  return `${n.toFixed(2)}${currency ? ` ${currency}` : ''}`;
};

/** Gross margin % of price over cost, or null. */
export const marginOf = (price, cost) => {
  const p = num(price);
  const c = num(cost);
  if (p == null || c == null || p <= 0 || c <= 0) return null;
  return ((p - c) / p) * 100;
};

/** Colour band for a margin given the minimum-margin rule. */
export const marginTone = (margin, minMargin = 15) => {
  if (margin == null) return 'none';
  if (margin < 0) return 'loss';
  if (margin < minMargin) return 'low';
  if (margin < minMargin + 10) return 'ok';
  return 'good';
};

const TONE_CLASS = {
  none: 'bg-slate-100 text-slate-500 border-slate-200',
  loss: 'bg-red-100 text-red-700 border-red-300',
  low: 'bg-orange-50 text-orange-700 border-orange-200',
  ok: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  good: 'bg-green-50 text-green-700 border-green-200',
};

export const TONE_TEXT = {
  none: 'text-slate-400',
  loss: 'text-red-600',
  low: 'text-orange-600',
  ok: 'text-yellow-600',
  good: 'text-green-600',
};

export function MarginBadge({ margin, minMargin, suffix = 'GP' }) {
  if (margin == null) return null;
  const tone = marginTone(margin, minMargin);
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${TONE_CLASS[tone]}`}
      data-tone={tone}>
      {margin.toFixed(1)}%{suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export function Pill({ className = '', children, title }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-[#E5B732] disabled:opacity-50',
  outline: 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  accent: 'inline-flex items-center justify-center gap-2 rounded-md border border-[#F5C742] bg-white px-3 py-2 text-sm font-medium text-amber-700 hover:bg-[#FFF4BF] disabled:opacity-50',
  ghost: 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40',
};

export const inputClass = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#F5C742] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 disabled:bg-slate-50';

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-slate-600 ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="text-[11px] font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

/** Dialog shell in the workspace's style. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', testId }) {
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size] || 'sm:max-w-2xl';
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`${width} bg-white`} data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        {footer && <DialogFooter className="gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/** Preview / result of a bulk action: counts, skip reasons and sample rows. */
export function BulkSummary({ result, currency, columns }) {
  if (!result) return null;
  const reasons = Object.entries(result.skippedReasons || {});
  return (
    <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm" data-testid="bulk-summary">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-blue-900">
        {columns.map(([label, value]) => (
          <span key={label}><span className="text-blue-700">{label}:</span> <b className="tabular-nums">{value}</b></span>
        ))}
      </div>
      {reasons.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-slate-600">
          {reasons.map(([why, n]) => <li key={why}>{why}: {n}</li>)}
        </ul>
      )}
      {(result.samples || []).length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded border border-blue-100 bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr><th className="px-2 py-1">Product</th><th className="px-2 py-1">Level</th><th className="px-2 py-1 text-right">Now</th><th className="px-2 py-1 text-right">New</th><th className="px-2 py-1 text-right">GP</th></tr>
            </thead>
            <tbody>
              {result.samples.map((s, i) => (
                <tr key={`${s.productId}-${s.priceLevelId ?? ''}-${i}`} className="border-t border-slate-100">
                  <td className="px-2 py-1"><span className="font-medium text-slate-700">{s.productName}</span> <span className="font-mono text-[10px] text-slate-400">{s.productCode}</span></td>
                  <td className="px-2 py-1 text-slate-500">{s.priceLevelName || '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-500">{money(s.oldPrice ?? s.replacesPrice ?? s.basePrice)}</td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{money(s.newPrice, currency)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{s.marginPercent != null ? `${Number(s.marginPercent).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Customer search with a dropdown; shows the chosen customer as a chip. */
export function CustomerPicker({ value, onChange, label = 'Search customers', placeholder = 'Name, code or phone' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ term: '', list: [] });
  const [open, setOpen] = useState(false);
  const term = useDebounced(query.trim());

  useEffect(() => {
    if (!term) return undefined;
    let cancelled = false;
    searchCustomersAllFields(term)
      .then((data) => { if (!cancelled) setResults({ term, list: Array.isArray(data) ? data : (data?.content || []) }); })
      .catch((err) => {
        if (!cancelled) {
          setResults({ term, list: [] });
          toast.error(errorText(err, 'Customers could not be searched.'));
        }
      });
    return () => { cancelled = true; };
  }, [term]);
  const loading = Boolean(term) && results.term !== term;
  const list = results.term === term ? results.list : [];

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-3 py-2 text-sm" data-testid="selected-customer">
        <span className="truncate font-semibold text-slate-800">{value.name}</span>
        <span className="font-mono text-xs text-slate-500">{value.code}</span>
        <button type="button" aria-label="Clear customer" className="ml-auto rounded p-0.5 text-slate-500 hover:bg-white" onClick={() => onChange(null)}>
          <X size={14} />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
      <input aria-label={label} value={query} placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        className={`${inputClass} pl-8`} />
      {open && query.trim() && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" data-testid="customer-results">
          {loading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {!loading && list.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No customers found.</div>}
          {list.map((c) => (
            <button type="button" key={c.id} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#FFF8E7]"
              onClick={() => { onChange({ id: c.id, code: c.code, name: c.name, group: c.group || c.groupType }); setQuery(''); setOpen(false); }}>
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="font-mono text-xs text-slate-400">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Product search returning the product list row (id, code, name, cost, retailPrice …). */
export function ProductPicker({ onPick, label = 'Search products', placeholder = 'Code, name or barcode', autoFocus = false, currency }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState({ term: '', list: [] });
  const term = useDebounced(query.trim());

  useEffect(() => {
    if (!term) return undefined;
    const controller = new AbortController();
    getProductsList(0, 10, term, controller.signal)
      .then((data) => setFound({ term, list: Array.isArray(data?.content) ? data.content : [] }))
      .catch((err) => {
        if (isAbort(err)) return;
        setFound({ term, list: [] });
        toast.error(errorText(err, 'Products could not be searched.'));
      });
    return () => controller.abort();
  }, [term]);
  const loading = Boolean(term) && found.term !== term;
  const results = found.term === term ? found.list : [];

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
      <input aria-label={label} autoFocus={autoFocus} value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder} className={`${inputClass} pl-8`} />
      {query.trim() && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" data-testid="product-results">
          {loading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No products found.</div>}
          {results.map((p) => (
            <button type="button" key={p.id} onClick={() => { onPick(p); setQuery(''); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[#FFF8E7]">
              <span><span className="font-medium text-slate-800">{p.name}</span><span className="ml-2 font-mono text-[11px] text-slate-400">{p.code}</span></span>
              <span className="text-xs tabular-nums text-slate-500">{money(p.retailPrice, currency)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Branch scope select: '' = all branches (offered only to all-branch users). */
export function BranchSelect({ value, onChange, branches, isAllBranches, label = 'Applies in', allLabel = 'All branches' }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {isAllBranches && <option value="">{allLabel}</option>}
      {(branches || []).map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
    </select>
  );
}

export const ROUNDING_STEPS = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00', '5.00'];
