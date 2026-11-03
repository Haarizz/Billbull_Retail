import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Power, Save, Search, Tag, X } from 'lucide-react';
import {
  createPriceLevel,
  getProductLevelPrices,
  listPriceLevels,
  setPriceLevelActive,
  updatePriceLevel,
  upsertProductLevelPrices,
} from '@billbull/shared/api/pricingApi';
import { getProductsList } from '@billbull/shared/api/productsApi';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { usePermissions } from '@billbull/shared/context/PermissionContext';
import QuantityTiersTab from './QuantityTiersTab';

// Pricing Phase 1 — named price levels and each product's price under them; Phase 3 — quantity tiers.

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

const EMPTY_FORM = { id: null, name: '', code: '', description: '', sortOrder: '' };

function LevelForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = form.id != null;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        sortOrder: form.sortOrder === '' ? null : Number(form.sortOrder),
      };
      const saved = isEdit ? await updatePriceLevel(form.id, body) : await createPriceLevel(body);
      toast.success(isEdit ? 'Price level updated.' : 'Price level created.');
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, 'Price level could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => ({
    value: form[key] ?? '',
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] p-4 md:grid-cols-5" data-testid="price-level-form">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
        Name
        <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" maxLength={100} autoFocus {...field('name')} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Code <span className="font-normal text-slate-400">(optional)</span>
        <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm uppercase" maxLength={46} {...field('code')} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Sort order
        <input type="number" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" {...field('sortOrder')} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-5">
        Description
        <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" maxLength={500} {...field('description')} />
      </label>
      <div className="flex gap-2 md:col-span-5">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60">
          <Save size={14} /> {isEdit ? 'Save changes' : 'Create level'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}

function LevelsTab({ levels, reload, canManage }) {
  const [editing, setEditing] = useState(null); // null | EMPTY_FORM | level form

  const toggle = async (level) => {
    try {
      await setPriceLevelActive(level.id, !level.active);
      toast.success(level.active ? `'${level.name}' deactivated.` : `'${level.name}' activated.`);
      reload();
    } catch (err) {
      toast.error(errorText(err, 'Status could not be changed.'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Name your own selling-price levels. A customer can have a default level and any sale can pick a
        different one. The default level is each product's own selling price; it can be renamed but not
        deactivated. Deactivated levels can't be chosen on new sales.
      </p>
      {canManage && !editing && (
        <div>
          <button type="button" onClick={() => setEditing(EMPTY_FORM)} className="inline-flex items-center gap-1 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900">
            <Plus size={14} /> New price level
          </button>
        </div>
      )}
      {editing && (
        <LevelForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Products priced</th>
              <th className="px-4 py-2 text-right">Quantity tiers</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id} className="border-t border-slate-100" data-testid={`level-row-${l.id}`}>
                <td className="px-4 py-2 font-medium text-slate-800">
                  {l.name}
                  {l.systemDefault && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">DEFAULT</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{l.code}</td>
                <td className="px-4 py-2 text-slate-600">{l.description || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.systemDefault ? '—' : l.productPriceCount}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.quantityTierCount ?? 0}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {l.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {canManage && (
                    <div className="flex justify-end gap-2">
                      <button type="button" title="Edit" aria-label={`Edit ${l.name}`} className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        onClick={() => setEditing({ id: l.id, name: l.name, code: l.code || '', description: l.description || '', sortOrder: l.sortOrder ?? '' })}>
                        <Pencil size={14} />
                      </button>
                      {!l.systemDefault && (
                        <button type="button" title={l.active ? 'Deactivate' : 'Activate'} aria-label={`${l.active ? 'Deactivate' : 'Activate'} ${l.name}`}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => toggle(l)}>
                          <Power size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {levels.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No price levels yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;
const cellKey = (productId, levelId) => `${productId}|${levelId}`;

function ProductPricesTab({ levels, canEdit }) {
  const { branches = [], isAllBranches, activeBranchId } = useBranch();
  const priceableLevels = useMemo(() => levels.filter((l) => l.active && !l.systemDefault), [levels]);
  // '' = all branches. A user without all-branch access can only set their own branch's prices.
  const [branchId, setBranchId] = useState(() => (isAllBranches || !activeBranchId || activeBranchId === 'ALL' ? '' : String(activeBranchId)));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [products, setProducts] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [rows, setRows] = useState([]); // level price rows for the shown products
  const [drafts, setDrafts] = useState({}); // cellKey -> string
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const data = await getProductsList(page, PAGE_SIZE, search, controller.signal);
      const list = Array.isArray(data?.content) ? data.content : [];
      setProducts(list);
      setTotalPages(data?.totalPages ?? 0);
      setRows(await getProductLevelPrices(list.map((p) => p.id)));
      setDrafts({});
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') {
        toast.error(errorText(err, 'Products could not be loaded.'));
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const branchKey = branchId === '' ? null : Number(branchId);
  const savedPrice = (productId, levelId) =>
    rows.find((r) => r.productId === productId && r.priceLevelId === levelId && (r.branchId ?? null) === branchKey)?.price;
  const inheritedPrice = (productId, levelId) =>
    branchKey == null ? null
      : rows.find((r) => r.productId === productId && r.priceLevelId === levelId && r.branchId == null)?.price;

  const cellValue = (productId, levelId) => {
    const k = cellKey(productId, levelId);
    if (k in drafts) return drafts[k];
    const saved = savedPrice(productId, levelId);
    return saved == null ? '' : String(saved);
  };

  const dirty = Object.entries(drafts).filter(([k, v]) => {
    const [pid, lid] = k.split('|').map(Number);
    const saved = savedPrice(pid, lid);
    const next = v.trim() === '' ? null : Number(v);
    return (saved == null ? null : Number(saved)) !== next;
  });

  const save = async () => {
    const invalid = dirty.find(([, v]) => v.trim() !== '' && !(Number(v) > 0));
    if (invalid) {
      toast.error('Prices must be greater than zero (leave a cell empty to remove its price).');
      return;
    }
    setSaving(true);
    try {
      await upsertProductLevelPrices(dirty.map(([k, v]) => {
        const [productId, priceLevelId] = k.split('|').map(Number);
        return { productId, priceLevelId, branchId: branchKey, price: v.trim() === '' ? null : Number(v) };
      }));
      toast.success(`${dirty.length} price${dirty.length === 1 ? '' : 's'} saved.`);
      await load();
    } catch (err) {
      toast.error(errorText(err, 'Prices could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  if (priceableLevels.length === 0) {
    return <p className="text-sm text-slate-600">Create and activate a price level first, then set product prices for it here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Prices for
          <select aria-label="Branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setDrafts({}); }}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            {isAllBranches && <option value="">All branches</option>}
            {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
        </label>
        <label className="relative flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Search products
          <Search size={14} className="absolute bottom-2.5 left-3 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Code or name"
            className="rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm" />
        </label>
        {canEdit && (
          <button type="button" onClick={save} disabled={saving || dirty.length === 0}
            className="inline-flex items-center gap-1 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
            <Save size={14} /> Save {dirty.length > 0 ? `(${dirty.length})` : ''}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Prices are per base unit; multi-unit packings are priced at the level price times their conversion.
        An empty cell means the product sells at its default price under that level
        {branchKey != null ? ' (or the all-branches level price, shown greyed, when one is set)' : ''}.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Default price</th>
              {priceableLevels.map((l) => <th key={l.id} className="px-3 py-2 text-right">{l.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5">
                  <div className="font-medium text-slate-800">{p.name}</div>
                  <div className="font-mono text-[11px] text-slate-400">{p.code}</div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{p.retailPrice ?? '—'}</td>
                {priceableLevels.map((l) => {
                  const inherited = inheritedPrice(p.id, l.id);
                  return (
                    <td key={l.id} className="px-3 py-1.5 text-right">
                      <input
                        aria-label={`${l.name} price for ${p.code}`}
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={cellValue(p.id, l.id)}
                        placeholder={inherited != null ? String(inherited) : ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [cellKey(p.id, l.id)]: e.target.value }))}
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums placeholder:text-slate-300 disabled:bg-slate-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr><td colSpan={2 + priceableLevels.length} className="px-3 py-6 text-center text-slate-500">No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm">
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Previous</button>
        <span className="text-slate-500">Page {totalPages === 0 ? 0 : page + 1} of {totalPages}</span>
        <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export default function PriceLevels() {
  const { canEdit } = usePermissions();
  const [tab, setTab] = useState('levels');
  const [levels, setLevels] = useState([]);

  const reload = useCallback(async () => {
    try {
      setLevels(await listPriceLevels({ includeInactive: true }));
    } catch (err) {
      toast.error(errorText(err, 'Price levels could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPriceLevels({ includeInactive: true })
      .then((data) => { if (!cancelled) setLevels(data); })
      .catch((err) => toast.error(errorText(err, 'Price levels could not be loaded.')));
    return () => { cancelled = true; };
  }, []);

  const tabClass = (t) => `px-4 py-2 text-sm font-semibold border-b-2 ${tab === t ? 'border-[#F5C742] text-slate-900' : 'border-transparent text-slate-500'}`;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Tag className="text-[#F5C742]" size={20} />
        <h1 className="text-xl font-bold text-slate-800">Price Levels</h1>
      </div>
      <div className="flex gap-2 border-b border-slate-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'levels'} className={tabClass('levels')} onClick={() => setTab('levels')}>Levels</button>
        <button type="button" role="tab" aria-selected={tab === 'prices'} className={tabClass('prices')} onClick={() => setTab('prices')}>Product prices</button>
        <button type="button" role="tab" aria-selected={tab === 'tiers'} className={tabClass('tiers')} onClick={() => setTab('tiers')}>Quantity tiers</button>
      </div>
      {tab === 'levels' && <LevelsTab levels={levels} reload={reload} canManage={canEdit('sales.settings')} />}
      {tab === 'prices' && <ProductPricesTab levels={levels} canEdit={canEdit('inventory.product')} />}
      {tab === 'tiers' && <QuantityTiersTab levels={levels} canEdit={canEdit('inventory.product')} />}
    </div>
  );
}
