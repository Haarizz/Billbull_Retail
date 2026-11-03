import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarX, Handshake, Pencil, Plus, Power, Save, Search, Trash2, X } from 'lucide-react';
import {
  createCustomerPrice,
  deleteCustomerPrice,
  discontinueCustomerPrice,
  getCustomerEffectivePrices,
  listCustomerPrices,
  setCustomerPriceEnabled,
  updateCustomerPrice,
} from '@billbull/shared/api/pricingApi';
import { searchCustomersAllFields } from '@billbull/shared/api/customerledgerApi';
import { getProductsList } from '@billbull/shared/api/productsApi';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { usePermissions } from '@billbull/shared/context/PermissionContext';
import { clearCustomerPricingStatusCache } from '@billbull/shared/hooks/useCustomerPricingStatus';
import { PRICE_SOURCE_LABEL } from '@billbull/shared/utils/priceLevels';

// Pricing Phase 2 — negotiated (customer-specific) selling prices per customer and product.
// The backend resolver applies them ahead of any price level in POS and every sales document.

const MODULE = 'sales.customer';
const PAGE_SIZE = 25;

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(2));

const STATUS_STYLE = {
  CURRENT: 'bg-green-50 text-green-700',
  FUTURE: 'bg-sky-50 text-sky-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
  DISABLED: 'bg-amber-50 text-amber-700',
};
const STATUS_LABEL = { CURRENT: 'Current', FUTURE: 'Not started', EXPIRED: 'Expired', DISABLED: 'Inactive' };

const validity = (row) => `${row.effectiveFrom || '—'} → ${row.effectiveTo || 'open-ended'}`;

/** Debounced customer search with a dropdown. */
function CustomerPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchCustomersAllFields(term);
        if (!cancelled) setResults(Array.isArray(data) ? data : (data?.content || []));
      } catch (err) {
        if (!cancelled) toast.error(errorText(err, 'Customers could not be searched.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-3 py-2 text-sm" data-testid="selected-customer">
        <span className="font-semibold text-slate-800">{value.name}</span>
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
      <input
        aria-label="Search customers"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search a customer by name, code or phone"
        className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
      />
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" data-testid="customer-results">
          {loading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No customers found.</div>}
          {results.map((c) => (
            <button
              type="button"
              key={c.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#FFF8E7]"
              onClick={() => { onChange(c); setQuery(''); setOpen(false); }}
            >
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="font-mono text-xs text-slate-400">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Product search for the form: a short result list, never the whole catalogue. */
function ProductSearch({ onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const data = await getProductsList(0, 10, term, controller.signal);
        setResults(Array.isArray(data?.content) ? data.content : []);
      } catch (err) {
        if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') toast.error(errorText(err, 'Products could not be searched.'));
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          aria-label="Search products"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Product code, name or barcode"
          className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
        />
      </div>
      {query.trim() && (
        <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {loading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No products found.</div>}
          {results.map((p) => (
            <button type="button" key={p.id} onClick={() => onPick(p)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[#FFF8E7]">
              <span>
                <span className="font-medium text-slate-800">{p.name}</span>
                <span className="ml-2 font-mono text-[11px] text-slate-400">{p.code}</span>
              </span>
              <span className="tabular-nums text-xs text-slate-500">{money(p.retailPrice)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Create / edit a negotiated price. */
function PriceForm({ customer, initial, onCancel, onSaved }) {
  const { branches = [], isAllBranches, activeBranchId } = useBranch();
  const isEdit = initial?.id != null;
  const ownBranch = !isAllBranches && activeBranchId && activeBranchId !== 'ALL' ? String(activeBranchId) : '';
  const [product, setProduct] = useState(isEdit ? { id: initial.productId, code: initial.productCode, name: initial.productName } : null);
  const [form, setForm] = useState(() => ({
    price: isEdit ? String(initial.price) : '',
    branchId: isEdit ? (initial.branchId == null ? '' : String(initial.branchId)) : ownBranch,
    effectiveFrom: isEdit ? initial.effectiveFrom : today(),
    effectiveTo: isEdit ? (initial.effectiveTo || '') : '',
    enabled: isEdit ? initial.enabled : true,
    notes: isEdit ? (initial.notes || '') : '',
  }));
  const [reference, setReference] = useState(null);
  const [saving, setSaving] = useState(false);

  // What the customer pays for the product today, and without a negotiated price.
  useEffect(() => {
    if (!product?.id || !customer?.id) {
      setReference(null);
      return undefined;
    }
    let cancelled = false;
    getCustomerEffectivePrices({
      customerId: customer.id,
      productIds: [product.id],
      branchId: form.branchId === '' ? undefined : Number(form.branchId),
    })
      .then((res) => { if (!cancelled) setReference({ ...(res?.products?.[0] || {}), levelName: res?.priceLevelName }); })
      .catch(() => { if (!cancelled) setReference(null); });
    return () => { cancelled = true; };
  }, [product?.id, customer?.id, form.branchId]);

  const field = (key) => ({
    value: form[key] ?? '',
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!product) { toast.error('Choose a product.'); return; }
    const price = Number(form.price);
    if (!(price > 0)) { toast.error('The negotiated price must be greater than zero.'); return; }
    if (!form.effectiveFrom) { toast.error('Choose the date the price starts.'); return; }
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) { toast.error("The end date can't be before the start date."); return; }
    setSaving(true);
    try {
      const body = {
        customerId: customer.id,
        productId: product.id,
        branchId: form.branchId === '' ? null : Number(form.branchId),
        price,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        enabled: Boolean(form.enabled),
        notes: form.notes.trim() || null,
      };
      const saved = isEdit ? await updateCustomerPrice(initial.id, body) : await createCustomerPrice(body);
      toast.success(isEdit ? 'Negotiated price updated.' : 'Negotiated price added.');
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, 'The negotiated price could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const refSource = reference?.referenceSource ? (PRICE_SOURCE_LABEL[reference.referenceSource] || reference.referenceSource) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] p-4" data-testid="customer-price-form">
      <div className="text-sm font-semibold text-slate-700">
        {isEdit ? 'Edit negotiated price' : 'New negotiated price'} for {customer.name}
      </div>
      {!product ? (
        <ProductSearch onPick={setProduct} />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="font-medium text-slate-800">{product.name}</span>
          <span className="font-mono text-xs text-slate-400">{product.code}</span>
          {reference && (
            <span className="text-xs text-slate-600" data-testid="reference-price">
              Without a negotiated price: <b className="tabular-nums">{money(reference.referencePrice)}</b>
              {refSource ? ` (${refSource}${reference.levelName ? ` · ${reference.levelName}` : ''})` : ''}
              {reference.customerPriceId && reference.customerPriceId !== initial?.id
                ? <> · currently charged <b className="tabular-nums">{money(reference.price)}</b></> : null}
            </span>
          )}
          {!isEdit && (
            <button type="button" className="ml-auto text-xs text-slate-500 underline" onClick={() => setProduct(null)}>Change product</button>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Negotiated price (per base unit)
          <input aria-label="Negotiated price" inputMode="decimal" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums" {...field('price')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Applies in
          <select aria-label="Branch" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" {...field('branchId')}>
            {isAllBranches && <option value="">All branches</option>}
            {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Valid from
          <input type="date" aria-label="Valid from" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" {...field('effectiveFrom')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Valid to <span className="font-normal text-slate-400">(optional)</span>
          <input type="date" aria-label="Valid to" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" {...field('effectiveTo')} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
          Active
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-5">
          Notes <span className="font-normal text-slate-400">(optional, e.g. contract reference)</span>
          <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" maxLength={500} {...field('notes')} />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        A negotiated price replaces this customer&apos;s price-level price; it isn&apos;t a discount on it. Packings are
        charged this price times their conversion. A branch price wins over an all-branches price in that branch.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60">
          <Save size={14} /> {isEdit ? 'Save changes' : 'Add price'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}

export default function CustomerPrices() {
  const { canEdit, canDelete } = usePermissions();
  const mayEdit = canEdit(MODULE);
  const mayDelete = canDelete(MODULE);
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [currentOnly, setCurrentOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ content: [], totalPages: 0, totalElements: 0 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | {} (new) | row
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await listCustomerPrices({ customerId: customer?.id, search, currentOnly, page, size: PAGE_SIZE }, controller.signal);
      setData({ content: res?.content || [], totalPages: res?.totalPages ?? 0, totalElements: res?.totalElements ?? 0 });
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') toast.error(errorText(err, 'Negotiated prices could not be loaded.'));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [customer?.id, search, currentOnly, page]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const changed = () => { clearCustomerPricingStatusCache(); load(); };

  const act = async (fn, success, fallback) => {
    try {
      await fn();
      toast.success(success);
      changed();
    } catch (err) {
      toast.error(errorText(err, fallback));
    }
  };

  const onToggle = (row) => act(() => setCustomerPriceEnabled(row.id, !row.enabled),
    row.enabled ? 'Negotiated price deactivated.' : 'Negotiated price activated.', 'Status could not be changed.');
  const onDiscontinue = (row) => {
    if (!window.confirm(`Stop charging ${row.customerName || 'this customer'} the negotiated price for ${row.productName || row.productCode} from today? Past invoices keep their prices.`)) return;
    act(() => discontinueCustomerPrice(row.id), 'Negotiated price ended.', 'The price could not be ended.');
  };
  const onDelete = (row) => {
    if (!window.confirm(`Remove the negotiated price for ${row.productName || row.productCode}? Past invoices keep their prices.`)) return;
    act(() => deleteCustomerPrice(row.id), 'Negotiated price removed.', 'The price could not be removed.');
  };

  const showCustomerColumn = !customer;
  const rows = data.content;
  const colCount = useMemo(() => (showCustomerColumn ? 7 : 6), [showCustomerColumn]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Handshake className="text-[#F5C742]" size={20} />
        <h1 className="text-xl font-bold text-slate-800">Customer Prices</h1>
      </div>
      <p className="text-sm text-slate-600">
        Set a negotiated selling price for a customer and product. When that customer is selected in POS or on a
        quotation, sales order, pro-forma or invoice, it is charged automatically instead of their price-level price.
      </p>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Customer
          <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setEditing(null); setPage(0); }} />
        </label>
        <label className="relative flex flex-col gap-1 text-xs font-medium text-slate-600">
          Filter by product
          <Search size={14} className="absolute bottom-2.5 left-3 text-slate-400" />
          <input aria-label="Filter by product" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Code or name" className="rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={currentOnly} onChange={(e) => { setCurrentOnly(e.target.checked); setPage(0); }} />
          Only prices in effect today
        </label>
        {mayEdit && (
          <button type="button" disabled={!customer || editing != null} onClick={() => setEditing({})}
            title={customer ? '' : 'Choose a customer first'}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
            <Plus size={14} /> Add negotiated price
          </button>
        )}
      </div>

      {editing && customer && (
        <PriceForm
          key={editing.id ?? 'new'}
          customer={customer}
          initial={editing.id != null ? editing : null}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); changed(); }}
        />
      )}

      {customer && !loading && rows.length === 0 && !search && !currentOnly && (
        <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" data-testid="no-customer-prices">
          {customer.name} has no negotiated prices. They pay their price-level or default prices.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {showCustomerColumn && <th className="px-3 py-2">Customer</th>}
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Applies in</th>
              <th className="px-3 py-2 text-right">Negotiated price</th>
              <th className="px-3 py-2">Valid</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100" data-testid={`customer-price-row-${r.id}`}>
                {showCustomerColumn && (
                  <td className="px-3 py-1.5">
                    <button type="button" className="text-left hover:underline"
                      onClick={() => { setCustomer({ id: r.customerId, code: r.customerCode, name: r.customerName }); setPage(0); }}>
                      <div className="font-medium text-slate-800">{r.customerName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{r.customerCode}</div>
                    </button>
                  </td>
                )}
                <td className="px-3 py-1.5">
                  <div className="font-medium text-slate-800">{r.productName}</div>
                  <div className="font-mono text-[11px] text-slate-400">{r.productCode}</div>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.branchId == null ? 'bg-slate-100 text-slate-600' : 'bg-[#FFF8E7] text-amber-800'}`}>
                    {r.branchId == null ? 'All branches' : (r.branchName || `Branch ${r.branchId}`)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{money(r.price)}</td>
                <td className="px-3 py-1.5 text-xs text-slate-600">{validity(r)}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span>
                </td>
                <td className="px-3 py-1.5">
                  {mayEdit && (
                    <div className="flex justify-end gap-1">
                      <button type="button" title="Edit" aria-label={`Edit price for ${r.productCode}`} className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        onClick={() => { setCustomer((c) => c || { id: r.customerId, code: r.customerCode, name: r.customerName }); setEditing(r); }}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" title={r.enabled ? 'Deactivate' : 'Activate'} aria-label={`${r.enabled ? 'Deactivate' : 'Activate'} price for ${r.productCode}`}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => onToggle(r)}>
                        <Power size={14} />
                      </button>
                      {(r.status === 'CURRENT' || r.status === 'FUTURE') && (
                        <button type="button" title="End from today" aria-label={`End price for ${r.productCode}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => onDiscontinue(r)}>
                          <CalendarX size={14} />
                        </button>
                      )}
                      {mayDelete && (
                        <button type="button" title="Remove" aria-label={`Remove price for ${r.productCode}`} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(r)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {loading && rows.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-slate-500">No negotiated prices found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-xs text-slate-500">{data.totalElements} price{data.totalElements === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Previous</button>
          <span className="text-slate-500">Page {data.totalPages === 0 ? 0 : page + 1} of {data.totalPages}</span>
          <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
