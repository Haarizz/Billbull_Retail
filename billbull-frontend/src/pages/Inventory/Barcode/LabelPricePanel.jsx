import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Search, Tag, X } from 'lucide-react';
import { searchCustomersAllFields } from '@billbull/shared/api/customerledgerApi';

/** Debounced customer search, for customer-specific labels only. */
function LabelCustomerPicker({ value, onChange }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const term = query.trim();
        if (!term) {
            setResults([]);
            return undefined;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await searchCustomersAllFields(term);
                if (!cancelled) setResults(Array.isArray(data) ? data : (data?.content || []));
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Customers could not be searched.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query]);

    if (value) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-2 py-1.5 text-xs" data-testid="label-customer">
                <span className="font-semibold text-slate-800 truncate">{value.name}</span>
                <span className="font-mono text-[10px] text-slate-500">{value.code}</span>
                <button type="button" aria-label="Clear customer" className="ml-auto rounded p-0.5 text-slate-500 hover:bg-white" onClick={() => onChange(null)}>
                    <X size={12} />
                </button>
            </div>
        );
    }
    return (
        <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-slate-400" />
            <input
                aria-label="Search customer for label prices"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Search customer by name, code or phone"
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-6 pr-2 text-xs focus:border-[#F5C742] outline-none"
            />
            {open && query.trim() && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" data-testid="label-customer-results">
                    {loading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
                    {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
                    {!loading && !error && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No customers found.</div>}
                    {results.map((c) => (
                        <button
                            type="button"
                            key={c.id}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#FFF8E7]"
                            onClick={() => { onChange({ id: c.id, name: c.name, code: c.code }); setQuery(''); setOpen(false); }}
                        >
                            <span className="font-medium text-slate-800">{c.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * The label-price settings of a print run: which price source (the template's, or an override for
 * this run), the branch whose prices to show, a customer (customer-specific source only) and an
 * optional pricing quantity (quantity tiers of price levels only). Shows how many queued labels
 * have a price and why the others do not.
 */
export default function LabelPricePanel({
    sources = [],
    sourcesError = null,
    templateName,
    templateSource,
    value,
    onChange,
    branches = [],
    canSwitchBranches = false,
    activeBranchName,
    meta,
    summary,
    onRefresh,
}) {
    const effective = value.sourceOverride || templateSource;
    const sourceOf = (key) => sources.find((s) => s.key === key);
    const effectiveOption = sourceOf(effective);
    const templateOption = sourceOf(templateSource);
    const needsCustomer = effective === 'CUSTOMER';
    const tiers = effectiveOption ? effectiveOption.supportsQuantityTiers : true;
    const set = (patch) => onChange({ ...value, ...patch });
    const label = meta?.sourceLabel || effectiveOption?.label || effective;

    return (
        <div className="rounded-lg border border-[#FDE6A9] bg-[#FFF8E7]/60 p-3 mb-3" data-testid="label-price-panel">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Tag size={14} className="text-[#F5C742]" /> Label price
                </div>
                {onRefresh && (
                    <button type="button" onClick={onRefresh} className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1" title="Reload prices from the server">
                        <RefreshCw size={12} /> Refresh prices
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="block">
                    <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Price source</span>
                    <select
                        aria-label="Label price source"
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-[#F5C742] outline-none"
                        value={value.sourceOverride || ''}
                        onChange={(e) => set({ sourceOverride: e.target.value || null })}
                    >
                        <option value="">
                            Template default — {templateOption?.label || templateSource}{templateName ? ` (${templateName})` : ''}
                        </option>
                        {sources.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Branch prices</span>
                    {canSwitchBranches ? (
                        <select
                            aria-label="Label price branch"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-[#F5C742] outline-none"
                            value={value.branchId ?? ''}
                            onChange={(e) => set({ branchId: e.target.value === '' ? null : Number(e.target.value) })}
                        >
                            <option value="">All branches (no branch price)</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" aria-label="Label price branch">
                            {activeBranchName || 'Your branch'}
                        </div>
                    )}
                </label>

                <label className="block">
                    <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Pricing quantity (optional)</span>
                    <input
                        aria-label="Pricing quantity"
                        type="number"
                        min="0"
                        step="any"
                        disabled={!tiers}
                        placeholder={tiers ? 'Not set: normal price' : 'Not used for this source'}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-[#F5C742] outline-none disabled:bg-slate-50"
                        value={tiers ? (value.pricingQuantity ?? '') : ''}
                        onChange={(e) => set({ pricingQuantity: e.target.value })}
                    />
                </label>
            </div>

            {needsCustomer && (
                <div className="mt-2">
                    <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Customer</span>
                    <LabelCustomerPicker value={value.customer} onChange={(customer) => set({ customer })} />
                </div>
            )}

            <div className="mt-2 text-[11px] text-slate-600 space-y-0.5" data-testid="label-price-status">
                <div>
                    Printing <strong>{label}</strong>
                    {meta?.branchName ? <> · {meta.branchName}</> : null}
                    {needsCustomer && value.customer ? <> · {value.customer.name}</> : null}
                    {tiers && value.pricingQuantity ? <> · priced for {value.pricingQuantity} per label unit</> : null}
                </div>
                {tiers && !value.pricingQuantity && (
                    <div className="text-slate-500">No quantity tier applies until a pricing quantity is entered (counted in each barcode&apos;s own unit).</div>
                )}
                {summary && summary.total > 0 && (
                    <div>
                        {summary.priced} of {summary.total} queued item(s) priced
                        {summary.pending > 0 && <> · {summary.pending} loading</>}
                        {summary.missing > 0 && <span className="text-red-600 font-semibold"> · {summary.missing} without a {label} price</span>}
                    </div>
                )}
                {sourcesError && <div className="text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {sourcesError}</div>}
                {meta?.sourceError && <div className="text-red-600 flex items-center gap-1" role="alert"><AlertCircle size={12} /> {meta.sourceError}</div>}
                {meta?.notice && <div className="text-amber-800">{meta.notice}</div>}
            </div>
        </div>
    );
}
