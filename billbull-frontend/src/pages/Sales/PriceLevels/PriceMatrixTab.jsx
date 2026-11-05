import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, Building2, DollarSign, Edit, History, ListFilter, RefreshCw, Save, Search, ShoppingCart, Tag, X,
} from 'lucide-react';
import { getPriceMatrix, upsertProductLevelPrices } from '@billbull/shared/api/pricingApi';
import {
  MarginBadge, Pill, btn, errorText, inputClass, isAbort, marginOf, money, num,
} from './pricingUi';

const PAGE_SIZE = 25;

export const EMPTY_FILTERS = { search: '', departmentId: '', brandId: '', filter: 'ALL' };

export const filtersActive = (f) => Boolean(f.search?.trim() || f.departmentId || f.brandId);

/**
 * The cell a product shows under a level for the selected branch scope:
 * its own row (branch or all-branches), the inherited all-branches row at a branch, or none.
 */
export function cellFor(product, levelId, branchId) {
  const prices = product.prices || [];
  const own = prices.find((p) => p.priceLevelId === levelId && String(p.branchId ?? '') === String(branchId || ''));
  if (own) return { row: own, kind: branchId ? 'branch' : 'set' };
  if (branchId) {
    const global = prices.find((p) => p.priceLevelId === levelId && p.branchId == null);
    if (global) return { row: global, kind: 'inherited' };
  }
  return { row: null, kind: 'base' };
}

function FiltersPanel({ filters, setFilters, departments, brands, costVisible, minMargin, onClose }) {
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  return (
    <div className="sticky top-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4" data-testid="matrix-filters">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ListFilter size={16} className="text-[#F5C742]" /><h3 className="font-semibold text-slate-800">Filters</h3></div>
        <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Hide filters" onClick={onClose}><X size={16} /></button>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Search Products
        <span className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input aria-label="Search products" className={`${inputClass} pl-8`} placeholder="Name, SKU, Barcode…" value={filters.search}
            onChange={(e) => set('search', e.target.value)} />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Department
        <select aria-label="Department" className={inputClass} value={filters.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Brand
        <select aria-label="Brand" className={inputClass} value={filters.brandId} onChange={(e) => set('brandId', e.target.value)}>
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 text-sm text-slate-700">
        {costVisible && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.filter === 'LOW_MARGIN'} onChange={(e) => set('filter', e.target.checked ? 'LOW_MARGIN' : 'ALL')} />
            <span>Show low margin items <span className="text-xs text-slate-400">(&lt; {minMargin}%)</span></span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filters.filter === 'PRICED'} onChange={(e) => set('filter', e.target.checked ? 'PRICED' : 'ALL')} />
          Only products with level prices
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filters.filter === 'UNPRICED'} onChange={(e) => set('filter', e.target.checked ? 'UNPRICED' : 'ALL')} />
          Only products without level prices
        </label>
      </div>
      <button type="button" className={btn.outline} onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>
    </div>
  );
}

function ProductPanel({ product, levels, defaultLevel, branchId, branches, minMargin, costVisible, currency, onClose, onEditCell, onTiers, onHistory }) {
  const branchName = (id) => branches.find((b) => String(b.id) === String(id))?.name || `Branch ${id}`;
  const branchRows = (product.prices || []).filter((p) => p.branchId != null);
  const byBranch = branchRows.reduce((acc, p) => { (acc[p.branchId] ||= []).push(p); return acc; }, {});
  const levelName = (id) => levels.find((l) => l.id === id)?.name || `Level ${id}`;
  const cost = num(product.cost);
  const alerts = [];
  if (costVisible && cost != null) {
    const baseMargin = marginOf(product.basePrice, cost);
    if (baseMargin != null && baseMargin < minMargin) alerts.push({ tone: baseMargin < 0 ? 'red' : 'yellow', text: `Low margin on ${defaultLevel?.name || 'retail'} price`, sub: `Current: ${baseMargin.toFixed(1)}% • Target: ${minMargin}%` });
    for (const p of product.prices || []) {
      const m = marginOf(p.price, cost);
      if (m != null && m < minMargin) {
        alerts.push({ tone: m < 0 ? 'red' : 'yellow', text: `${m < 0 ? 'Below cost' : 'Low margin'} on ${levelName(p.priceLevelId)}${p.branchId ? ` (${branchName(p.branchId)})` : ''}`, sub: `Current: ${m.toFixed(1)}% • Target: ${minMargin}%` });
      }
    }
  }
  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl" data-testid="product-panel" aria-label="Product details">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Product Details</h3>
        <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close product details" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-slate-100">
            {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full object-contain" /> : <ShoppingCart className="h-14 w-14 text-slate-300" />}
          </div>
          <h4 className="font-semibold">{product.name}</h4>
          <p className="font-mono text-xs text-slate-500">{product.code}</p>
          <div className="flex flex-wrap gap-1">
            {product.departmentName && <Pill className="border-slate-200 text-slate-600">{product.departmentName}</Pill>}
            {product.brandName && <Pill className="border-slate-200 text-slate-600">{product.brandName}</Pill>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-slate-200 p-2"><p className="text-xs text-slate-500">Cost</p><p className="font-semibold tabular-nums">{costVisible ? money(product.cost, currency) : 'Hidden'}</p></div>
            <div className="rounded border border-slate-200 p-2"><p className="text-xs text-slate-500">{defaultLevel?.name || 'Retail'} (default)</p><p className="font-semibold tabular-nums">{money(product.basePrice, currency)}</p></div>
          </div>
        </div>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Tag size={14} className="text-[#F5C742]" /> Price levels{branchId ? ` · ${branchName(branchId)}` : ''}</h4>
          {levels.filter((l) => l.active && !l.systemDefault).map((l) => {
            const { row, kind } = cellFor(product, l.id, branchId);
            const price = row ? row.price : product.basePrice;
            return (
              <button type="button" key={l.id} onClick={() => onEditCell(product, l)} className="rounded border border-slate-200 bg-slate-50 p-2 text-left hover:border-[#F5C742]">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{l.name}</span><span className="text-sm font-semibold tabular-nums">{money(price, currency)}</span></div>
                <div className="mt-1 flex items-center gap-2">
                  <MarginBadge margin={costVisible ? marginOf(price, product.cost) : null} minMargin={minMargin} />
                  {kind === 'base' && <span className="text-xs text-slate-400">Uses default price</span>}
                  {kind === 'branch' && <span className="text-xs text-purple-600">Branch override</span>}
                  {kind === 'inherited' && <span className="text-xs text-slate-500">All-branches price</span>}
                </div>
              </button>
            );
          })}
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Building2 size={14} className="text-[#F5C742]" /> Branch-wise pricing</h4>
          {Object.keys(byBranch).length === 0 && <p className="text-xs text-slate-500">No branch-specific prices; every branch uses the all-branches prices.</p>}
          {Object.entries(byBranch).map(([b, rows]) => (
            <div key={b} className="rounded border border-blue-200 bg-blue-50 p-2">
              <p className="text-sm font-medium">{branchName(b)}</p>
              <p className="text-xs text-slate-600">{rows.map((r) => `${levelName(r.priceLevelId)}: ${money(r.price, currency)}`).join(' • ')}</p>
            </div>
          ))}
        </section>

        {costVisible && (
          <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={14} className="text-[#F5C742]" /> Alerts</h4>
            {alerts.length === 0 && <p className="text-xs text-slate-500">{cost == null ? 'No cost on this product, so margins can\'t be checked.' : 'All prices meet the minimum margin.'}</p>}
            {alerts.map((a, i) => (
              <div key={i} className={`rounded border p-2 ${a.tone === 'red' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
                <p className={`text-xs font-medium ${a.tone === 'red' ? 'text-red-800' : 'text-yellow-800'}`}>{a.text}</p>
                <p className="mt-0.5 text-xs text-slate-600">{a.sub}</p>
              </div>
            ))}
          </section>
        )}

        <div className="flex gap-2 border-t border-slate-200 pt-4">
          <button type="button" className={btn.outline} onClick={() => onTiers(product)}><Tag size={14} /> Tier pricing</button>
          <button type="button" className={btn.outline} onClick={() => onHistory(product)}><History size={14} /> History</button>
        </div>
      </div>
    </aside>
  );
}

export default function PriceMatrixTab({
  levels, filters, setFilters, branchId, departments, brands, branches, minMargin, currency, canEdit, reloadKey,
  onEditCell, onTiers, onHistory, onCostVisible,
}) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0, costVisible: true });
  const [loading, setLoading] = useState(false);
  const [panelId, setPanelId] = useState(null);
  const [quickEdit, setQuickEdit] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null);

  const priceLevels = useMemo(() => levels.filter((l) => l.active && !l.systemDefault), [levels]);
  const defaultLevel = levels.find((l) => l.systemDefault);
  const costVisible = data.costVisible !== false;

  useEffect(() => { setPage(0); }, [filters, branchId]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await getPriceMatrix({ ...filters, branchId: branchId || undefined, page, size: PAGE_SIZE }, controller.signal);
      setData(res || { content: [] });
      onCostVisible?.(res?.costVisible !== false);
      setDrafts({});
    } catch (err) {
      if (!isAbort(err)) toast.error(errorText(err, 'Prices could not be loaded.'));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [filters, branchId, page, onCostVisible]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const products = data.content || [];
  const panelProduct = products.find((p) => p.id === panelId) || null;

  const key = (pid, lid) => `${pid}|${lid}`;
  const ownPrice = (p, levelId) => {
    const c = cellFor(p, levelId, branchId);
    return c.kind === 'set' || c.kind === 'branch' ? c.row.price : null;
  };
  const dirty = Object.entries(drafts).filter(([k, v]) => {
    const [pid, lid] = k.split('|').map(Number);
    const p = products.find((x) => x.id === pid);
    const saved = p ? ownPrice(p, lid) : null;
    const next = v.trim() === '' ? null : Number(v);
    return (saved == null ? null : Number(saved)) !== next;
  });

  const saveDrafts = async () => {
    if (dirty.some(([, v]) => v.trim() !== '' && !(Number(v) > 0))) {
      toast.error('Prices must be greater than zero (leave a cell empty to remove its price).');
      return;
    }
    setSaving(true);
    try {
      await upsertProductLevelPrices(dirty.map(([k, v]) => {
        const [productId, priceLevelId] = k.split('|').map(Number);
        return { productId, priceLevelId, branchId: branchId ? Number(branchId) : null, price: v.trim() === '' ? null : Number(v) };
      }));
      toast.success(`${dirty.length} price${dirty.length === 1 ? '' : 's'} saved.`);
      await load();
    } catch (err) {
      toast.error(errorText(err, 'Prices could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const colSpan = priceLevels.length + 3;

  return (
    <div className="flex gap-4">
      {filtersOpen && (
        <div className="hidden w-64 shrink-0 lg:block">
          <FiltersPanel filters={filters} setFilters={setFilters} departments={departments} brands={brands}
            costVisible={costVisible} minMargin={minMargin} onClose={() => setFiltersOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!filtersOpen && (
            <button type="button" className={btn.accent} onClick={() => setFiltersOpen(true)}><ListFilter size={16} /> Show Filters</button>
          )}
          <div className="relative flex-1 lg:hidden">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input aria-label="Search products (compact)" className={`${inputClass} pl-8`} placeholder="Search products" value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          {filters.filter === 'LOW_MARGIN' && (
            <Pill className="border-orange-200 bg-orange-50 text-orange-700">Low margin items <button type="button" aria-label="Clear low margin filter" onClick={() => setFilters((f) => ({ ...f, filter: 'ALL' }))}><X size={12} /></button></Pill>
          )}
          {canEdit && priceLevels.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={quickEdit} onChange={(e) => { setQuickEdit(e.target.checked); setDrafts({}); }} />
                Quick edit
              </label>
              {quickEdit && (
                <button type="button" className={btn.primary} disabled={saving || dirty.length === 0} onClick={saveDrafts}>
                  <Save size={16} /> Save {dirty.length > 0 ? `(${dirty.length})` : ''}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="price-matrix">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[240px] bg-slate-50 p-3 text-left font-medium text-slate-600">Product</th>
                  <th className="min-w-[140px] p-3 text-left font-medium text-slate-600">
                    <span className="flex items-center gap-1.5">{defaultLevel?.name || 'Base'} Price
                      <span className="rounded border border-amber-300 bg-[#FFF4BF] px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Default</span></span>
                  </th>
                  {priceLevels.map((l) => <th key={l.id} className="min-w-[150px] p-3 text-left font-medium text-slate-600">{l.name}</th>)}
                  <th className="p-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && products.length === 0 && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={colSpan} className="p-3"><div className="h-12 animate-pulse rounded bg-slate-100" /></td></tr>
                ))}
                {!loading && products.length === 0 && (
                  <tr><td colSpan={colSpan} className="p-12 text-center">
                    <DollarSign className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-4 text-sm text-slate-500">No products found</p>
                  </td></tr>
                )}
                {products.map((p) => (
                  <tr key={p.id} className="cursor-pointer transition hover:bg-slate-50" onClick={() => setPanelId(p.id)} data-testid={`matrix-row-${p.id}`}>
                    <td className="sticky left-0 z-10 bg-white p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <ShoppingCart className="h-5 w-5 text-slate-400" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{p.name}</p>
                          <p className="font-mono text-xs text-slate-500">{p.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold tabular-nums text-slate-900">{money(p.basePrice, currency)}</p>
                      {costVisible && <p className="text-xs tabular-nums text-slate-500">Cost: {money(p.cost, currency)}</p>}
                      <div className="mt-1"><MarginBadge margin={costVisible ? num(p.baseMarginPercent) : null} minMargin={minMargin} /></div>
                    </td>
                    {priceLevels.map((l) => {
                      const { row, kind } = cellFor(p, l.id, branchId);
                      const price = row ? row.price : p.basePrice;
                      const margin = costVisible ? (row ? num(row.marginPercent) ?? marginOf(price, p.cost) : num(p.baseMarginPercent)) : null;
                      if (quickEdit) {
                        const k = key(p.id, l.id);
                        const own = kind === 'set' || kind === 'branch' ? String(Number(row.price).toFixed(2)) : '';
                        return (
                          <td key={l.id} className="p-2" onClick={(e) => e.stopPropagation()}>
                            <input aria-label={`${l.name} price for ${p.code}`} inputMode="decimal"
                              value={k in drafts ? drafts[k] : own}
                              placeholder={kind === 'inherited' ? String(Number(row.price).toFixed(2)) : ''}
                              onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                              className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums placeholder:text-slate-300" />
                          </td>
                        );
                      }
                      return (
                        <td key={l.id} className="p-3" data-testid={`cell-${p.id}-${l.id}`}
                          onClick={(e) => { e.stopPropagation(); onEditCell(p, l); }}>
                          <div className="flex flex-col gap-1 rounded p-1 hover:bg-[#FFF8E7]">
                            <div className="flex items-center gap-2">
                              <p className={`font-semibold tabular-nums ${kind === 'base' ? 'text-slate-400' : 'text-slate-900'}`}>{money(price, currency)}</p>
                              {kind === 'branch' && <Pill className="border-purple-200 bg-purple-50 text-purple-700" title="Branch override"><Building2 size={10} /> Branch</Pill>}
                            </div>
                            <div className="flex items-center gap-2">
                              <MarginBadge margin={margin} minMargin={minMargin} />
                              {kind === 'base' && <span className="text-[11px] italic text-slate-400">default</span>}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button type="button" className={btn.ghost} title="Details" aria-label={`Details for ${p.code}`} onClick={() => setPanelId(p.id)}><Edit size={16} /></button>
                        <button type="button" className={btn.ghost} title="Tier pricing" aria-label={`Tier pricing for ${p.code}`} onClick={() => onTiers(p)}><Tag size={16} /></button>
                        <button type="button" className={btn.ghost} title="Price history" aria-label={`History for ${p.code}`} onClick={() => onHistory(p)}><History size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>Showing {products.length} of {data.totalElements ?? 0} products{priceLevels.length === 0 ? ' · create a price level to start setting prices' : ''}</p>
          <div className="flex items-center gap-2">
            <button type="button" className={btn.outline} disabled={page === 0 || loading} onClick={() => setPage((x) => x - 1)}>Previous</button>
            <span>Page {data.totalPages ? page + 1 : 0} of {data.totalPages ?? 0}</span>
            <button type="button" className={btn.outline} disabled={page + 1 >= (data.totalPages ?? 0) || loading} onClick={() => setPage((x) => x + 1)}>Next</button>
            <button type="button" className={btn.outline} onClick={load} aria-label="Refresh prices"><RefreshCw size={14} /> Refresh</button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Prices are per base unit; packings are charged the level price times their conversion. A grey price with “default” means the product has no price under that level and sells at its default price.
          {branchId ? ' Branch overrides win over the all-branches price in that branch.' : ''}
        </p>
      </div>

      {panelProduct && (
        <ProductPanel product={panelProduct} levels={levels} defaultLevel={defaultLevel} branchId={branchId} branches={branches}
          minMargin={minMargin} costVisible={costVisible} currency={currency} onClose={() => setPanelId(null)}
          onEditCell={onEditCell} onTiers={onTiers} onHistory={onHistory} />
      )}
    </div>
  );
}
