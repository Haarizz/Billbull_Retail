import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CalendarX, Edit, FileSpreadsheet, ListFilter, Plus, Power, RefreshCw, Search, Trash2, Users, X,
} from 'lucide-react';
import {
  deleteCustomerPrice,
  discontinueCustomerPrice,
  listCustomerPriceRows,
  setCustomerPriceEnabled,
} from '@billbull/shared/api/pricingApi';
import { clearCustomerPricingStatusCache } from '@billbull/shared/hooks/useCustomerPricingStatus';
import {
  CustomerPicker, MarginBadge, Pill, btn, errorText, inputClass, isAbort, money, num,
} from './pricingUi';

const PAGE_SIZE = 25;

const STATUS = {
  CURRENT: ['Current', 'border-green-200 bg-green-50 text-green-700'],
  FUTURE: ['Not started', 'border-sky-200 bg-sky-50 text-sky-700'],
  EXPIRED: ['Expired', 'border-slate-200 bg-slate-100 text-slate-500'],
  DISABLED: ['Inactive', 'border-amber-200 bg-amber-50 text-amber-700'],
};

function PriceListCards({ levels, customersByLevel, onOpen, onAssign, canAssign }) {
  const lists = levels.filter((l) => !l.systemDefault);
  if (lists.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        No customer price lists yet. Create one, then assign it to customers — they are charged its prices automatically.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="price-list-cards">
      {lists.map((l) => (
        <div key={l.id} className={`flex flex-col gap-2 rounded-lg border bg-white p-4 ${l.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-70'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{l.name}</p>
              <p className="font-mono text-[11px] text-slate-400">{l.code}</p>
            </div>
            {!l.active && <Pill className="border-slate-200 bg-slate-100 text-slate-500">Inactive</Pill>}
          </div>
          {l.description && <p className="line-clamp-2 text-xs text-slate-500">{l.description}</p>}
          <div className="flex gap-4 text-xs text-slate-600">
            <span><FileSpreadsheet size={12} className="mr-1 inline text-emerald-500" />{l.productPriceCount} products</span>
            <span><Users size={12} className="mr-1 inline text-purple-500" />{customersByLevel?.[l.id] ?? 0} customers</span>
          </div>
          <div className="mt-auto flex gap-2">
            <button type="button" className={`${btn.outline} flex-1 py-1.5 text-xs`} onClick={() => onOpen(l)}>Customers</button>
            {canAssign && l.active && <button type="button" className={`${btn.accent} flex-1 py-1.5 text-xs`} onClick={() => onAssign(l)}>Assign</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CustomerPricingTab({
  levels, customersByLevel, minMargin, currency, costVisible, canEdit, canDelete, canAssign, reloadKey,
  onAddOverride, onEditOverride, onOpenList, onAssignList, onChanged,
}) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [belowCost, setBelowCost] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => { setPage(0); }, [customer?.id, search, status, belowCost]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await listCustomerPriceRows({ customerId: customer?.id, search, status, belowCost, page, size: PAGE_SIZE }, controller.signal);
      setData(res || { content: [] });
    } catch (err) {
      if (!isAbort(err)) toast.error(errorText(err, 'Customer prices could not be loaded.'));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [customer?.id, search, status, belowCost, page]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const act = async (fn, success, fallback) => {
    try {
      await fn();
      clearCustomerPricingStatusCache();
      toast.success(success);
      load();
      onChanged();
    } catch (err) {
      toast.error(errorText(err, fallback));
    }
  };
  const onToggle = (r) => act(() => setCustomerPriceEnabled(r.id, !r.enabled), r.enabled ? 'Customer price deactivated.' : 'Customer price activated.', 'Status could not be changed.');
  const onEnd = (r) => {
    if (!window.confirm(`Stop charging ${r.customerName} the special price for ${r.productName || r.productCode} from today? Past invoices keep their prices.`)) return;
    act(() => discontinueCustomerPrice(r.id), 'Customer price ended.', 'The price could not be ended.');
  };
  const onDelete = (r) => {
    if (!window.confirm(`Remove the special price for ${r.productName || r.productCode}? Past invoices keep their prices.`)) return;
    act(() => deleteCustomerPrice(r.id), 'Override removed.', 'The price could not be removed.');
  };

  const rows = data.content || [];
  const listLevels = useMemo(() => levels, [levels]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><FileSpreadsheet size={16} className="text-emerald-500" /> Customer Price Lists</h2>
        <PriceListCards levels={listLevels} customersByLevel={customersByLevel} onOpen={onOpenList} onAssign={onAssignList} canAssign={canAssign} />
      </div>

      <div className="flex gap-4">
        {filtersOpen && (
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4" data-testid="customer-filters">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><ListFilter size={16} className="text-[#F5C742]" /><h3 className="font-semibold text-slate-800">Filters</h3></div>
                <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Hide customer filters" onClick={() => setFiltersOpen(false)}><X size={16} /></button>
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Select Customer
                <CustomerPicker value={customer} onChange={setCustomer} label="Filter by customer" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Search
                <span className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input aria-label="Search product or customer" className={`${inputClass} pl-8`} placeholder="Product or customer…" value={search} onChange={(e) => setSearch(e.target.value)} /></span>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Status
                <select aria-label="Status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ALL">All</option>
                  <option value="LIVE">Current and upcoming</option>
                  <option value="CURRENT">Current</option>
                  <option value="FUTURE">Not started</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="DISABLED">Inactive</option>
                </select>
              </label>
              {costVisible && (
                <label className="flex items-center gap-2 border-t border-slate-200 pt-3 text-sm text-slate-700">
                  <input type="checkbox" checked={belowCost} onChange={(e) => setBelowCost(e.target.checked)} /> Prices below cost
                </label>
              )}
              <button type="button" className={btn.outline} onClick={() => { setCustomer(null); setSearch(''); setStatus('ALL'); setBelowCost(false); }}>Reset Filters</button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!filtersOpen && <div><button type="button" className={btn.accent} onClick={() => setFiltersOpen(true)}><ListFilter size={16} /> Show Filters</button></div>}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="customer-price-table">
                <thead className="border-b border-slate-200 bg-slate-50 text-left">
                  <tr>
                    {['Customer', 'Product', 'Base Price', 'Customer Price', 'Discount', 'Margin', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="p-3 font-medium text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && rows.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-slate-500">Loading…</td></tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={8} className="p-12 text-center">
                      <Users className="mx-auto h-12 w-12 text-slate-300" />
                      <p className="mt-4 text-sm text-slate-500" data-testid="no-customer-prices">
                        {customer ? `${customer.name} has no special prices. They pay their price-list or default prices.` : 'No customer price overrides found'}
                      </p>
                      {canEdit && <button type="button" className={`${btn.primary} mt-4`} onClick={() => onAddOverride(customer)}><Plus size={16} /> Add First Override</button>}
                    </td></tr>
                  )}
                  {rows.map((r) => {
                    const [label, cls] = STATUS[r.status] || [r.status, 'border-slate-200'];
                    const discount = num(r.discountPercent);
                    return (
                      <tr key={r.id} className="transition hover:bg-slate-50" data-testid={`customer-price-row-${r.id}`}>
                        <td className="p-3">
                          <button type="button" className="text-left hover:underline" onClick={() => setCustomer({ id: r.customerId, code: r.customerCode, name: r.customerName })}>
                            <p className="font-medium text-slate-900">{r.customerName}</p>
                            <p className="font-mono text-xs text-slate-500">{r.customerCode}</p>
                          </button>
                        </td>
                        <td className="p-3"><p className="font-medium text-slate-900">{r.productName}</p><p className="font-mono text-xs text-slate-500">{r.productCode}</p></td>
                        <td className="p-3">
                          <p className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{money(r.basePrice, currency)}</p>
                          {costVisible && <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">Cost: {money(r.cost, currency)}</p>}
                        </td>
                        <td className="p-3">
                          <p className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{money(r.price, currency)}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Pill className={r.branchId == null ? 'border-slate-200 text-slate-600' : 'border-amber-200 bg-[#FFF8E7] text-amber-800'}>{r.branchId == null ? 'All branches' : (r.branchName || `Branch ${r.branchId}`)}</Pill>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{r.effectiveFrom} → {r.effectiveTo || 'open-ended'}</p>
                        </td>
                        <td className="p-3">
                          {discount == null ? <span className="text-slate-400">—</span> : (
                            <Pill className={discount < 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}>
                              {discount > 0 ? '−' : discount < 0 ? '+' : ''}{Math.abs(discount).toFixed(1)}%
                            </Pill>
                          )}
                        </td>
                        <td className="p-3"><MarginBadge margin={num(r.marginPercent)} minMargin={minMargin} />{r.marginPercent == null && <span className="text-slate-400">—</span>}</td>
                        <td className="p-3">
                          <div className="flex flex-col items-start gap-1">
                            <Pill className={cls}>{label}</Pill>
                            {r.belowCost && <Pill className="border-red-200 bg-red-50 text-red-700"><AlertTriangle size={10} /> Below cost</Pill>}
                          </div>
                        </td>
                        <td className="p-3">
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              <button type="button" className={btn.ghost} title="Edit" aria-label={`Edit price for ${r.productCode}`} onClick={() => onEditOverride(r)}><Edit size={16} /></button>
                              <button type="button" className={btn.ghost} title={r.enabled ? 'Deactivate' : 'Activate'} aria-label={`${r.enabled ? 'Deactivate' : 'Activate'} price for ${r.productCode}`} onClick={() => onToggle(r)}><Power size={16} /></button>
                              {(r.status === 'CURRENT' || r.status === 'FUTURE') && (
                                <button type="button" className={btn.ghost} title="End from today" aria-label={`End price for ${r.productCode}`} onClick={() => onEnd(r)}><CalendarX size={16} /></button>
                              )}
                              {canDelete && (
                                <button type="button" className={`${btn.ghost} text-red-600 hover:bg-red-50`} title="Remove" aria-label={`Remove price for ${r.productCode}`} onClick={() => onDelete(r)}><Trash2 size={16} /></button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <p>Showing {rows.length} of {data.totalElements ?? 0} overrides</p>
            <div className="flex items-center gap-2">
              <button type="button" className={btn.outline} disabled={page === 0 || loading} onClick={() => setPage((x) => x - 1)}>Previous</button>
              <span>Page {data.totalPages ? page + 1 : 0} of {data.totalPages ?? 0}</span>
              <button type="button" className={btn.outline} disabled={page + 1 >= (data.totalPages ?? 0) || loading} onClick={() => setPage((x) => x + 1)}>Next</button>
              <button type="button" className={btn.outline} onClick={load} aria-label="Refresh customer prices"><RefreshCw size={14} /> Refresh</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
