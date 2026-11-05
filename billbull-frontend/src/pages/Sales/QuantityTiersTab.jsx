import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Layers, Pencil, Plus, Power, Save, Search, X } from 'lucide-react';
import {
  createQuantityTier,
  getQuantityTiers,
  listTieredProducts,
  resolvePrices,
  setQuantityTierActive,
  updateQuantityTier,
} from '@billbull/shared/api/pricingApi';
import { getProductsList } from '@billbull/shared/api/productsApi';
import { useBranch } from '@billbull/shared/context/BranchContext';

// Pricing Phase 3 — quantity tiers: a product's unit price under a level once a sale buys at least
// a given number of base units. The backend validates everything again; this screen only guides.

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const fmtQty = (q) => (q == null ? '' : String(+Number(q).toFixed(3)));
const fmtMoney = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(2));

/** Validates a threshold / price pair the way the server does; returns an error message or null. */
export const tierInputError = (minQuantity, price) => {
  const q = Number(minQuantity);
  const p = Number(price);
  if (String(minQuantity).trim() === '' || !Number.isFinite(q) || q <= 0) return 'The minimum quantity must be greater than zero.';
  if (!/^\d+(\.\d{1,3})?$/.test(String(minQuantity).trim())) return 'The minimum quantity can have at most 3 decimals.';
  if (String(price).trim() === '' || !Number.isFinite(p) || p <= 0) return 'The tier price must be greater than zero.';
  if (!/^\d+(\.\d{1,2})?$/.test(String(price).trim())) return 'The tier price can have at most 2 decimals.';
  return null;
};

function ProductPicker({ onPick }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!search.trim()) return undefined;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await getProductsList(0, 10, search.trim(), controller.signal);
        setResults(Array.isArray(data?.content) ? data.content : []);
        setOpen(true);
      } catch (err) {
        if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="relative flex-1">
      <label className="relative flex flex-col gap-1 text-xs font-medium text-slate-600">
        Product
        <Search size={14} className="absolute bottom-2.5 left-3 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => results.length && setOpen(true)}
          placeholder="Search a product by code or name" aria-label="Search product for tiers"
          className="rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm" />
      </label>
      {open && search.trim() && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg" role="listbox">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#FFF8E7]"
                onClick={() => { onPick({ productId: p.id, productCode: p.code, productName: p.name }); setOpen(false); setSearch(''); setResults([]); }}>
                <span className="font-medium text-slate-800">{p.name}</span>
                <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TierRow({ tier, unit, editable, readOnlyNote, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [minQuantity, setMinQuantity] = useState(fmtQty(tier.minQuantity));
  const [price, setPrice] = useState(String(tier.price ?? ''));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = tierInputError(minQuantity, price);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try {
      await updateQuantityTier(tier.id, {
        minQuantity: Number(minQuantity), price: Number(price), expectedUpdatedAt: tier.updatedAt || null,
      });
      toast.success('Tier updated.');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(errorText(err, 'The tier could not be saved.'));
      if (err?.response?.status === 409) onSaved();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      await setQuantityTierActive(tier.id, !tier.active, tier.updatedAt || null);
      toast.success(tier.active ? 'Tier deactivated.' : 'Tier reactivated.');
      onSaved();
    } catch (err) {
      toast.error(errorText(err, 'The tier could not be changed.'));
      if (err?.response?.status === 409) onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={`border-t border-slate-100 ${tier.active ? '' : 'text-slate-400'}`} data-testid={`tier-row-${tier.id}`}>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {editing ? (
          <input aria-label="Minimum quantity" inputMode="decimal" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)}
            className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums" />
        ) : `${fmtQty(tier.minQuantity)}${unit ? ` ${unit}` : ''}+`}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {editing ? (
          <input aria-label="Tier price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
            className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums" />
        ) : fmtMoney(tier.price)}
      </td>
      <td className="px-3 py-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tier.branchId == null ? 'bg-slate-100 text-slate-600' : 'bg-sky-50 text-sky-700'}`}>
          {tier.branchId == null ? 'All branches' : (tier.branchName || `Branch ${tier.branchId}`)}
        </span>
        {!tier.active && <span className="ml-2 text-[11px] font-semibold uppercase">Inactive</span>}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <div className="flex justify-end gap-1">
            {editing ? (
              <>
                <button type="button" disabled={busy} onClick={save} className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Save tier"><Save size={14} /></button>
                <button type="button" disabled={busy} onClick={() => { setEditing(false); setMinQuantity(fmtQty(tier.minQuantity)); setPrice(String(tier.price ?? '')); }}
                  className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Cancel edit"><X size={14} /></button>
              </>
            ) : (
              <>
                {tier.active && (
                  <button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    aria-label={`Edit tier ${fmtQty(tier.minQuantity)}+`}><Pencil size={14} /></button>
                )}
                <button type="button" disabled={busy} onClick={toggle} className="rounded p-1 text-slate-500 hover:bg-slate-100"
                  aria-label={`${tier.active ? 'Deactivate' : 'Reactivate'} tier ${fmtQty(tier.minQuantity)}+`}><Power size={14} /></button>
              </>
            )}
          </div>
        ) : (
          <span className="block text-right text-[11px] text-slate-400">{readOnlyNote}</span>
        )}
      </td>
    </tr>
  );
}

function AddTierForm({ onAdd, unit }) {
  const [minQuantity, setMinQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const problem = tierInputError(minQuantity, price);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try {
      await onAdd({ minQuantity: Number(minQuantity), price: Number(price) });
      setMinQuantity('');
      setPrice('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" data-testid="add-tier-form">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        From quantity{unit ? ` (${unit})` : ''}
        <input aria-label="New tier minimum quantity" inputMode="decimal" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)}
          className="w-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Unit price{unit ? ` (per ${unit})` : ''}
        <input aria-label="New tier price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
          className="w-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums" />
      </label>
      <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-[#F5C742] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60">
        <Plus size={14} /> Add tier
      </button>
    </form>
  );
}

export default function QuantityTiersTab({ levels, canEdit, initialProduct = null, initialLevelId = null, embedded = false }) {
  const { branches = [], isAllBranches, activeBranchId } = useBranch();
  const tierLevels = useMemo(() => levels.filter((l) => l.active), [levels]);
  const [product, setProduct] = useState(initialProduct);
  const [levelId, setLevelId] = useState(initialLevelId != null ? String(initialLevelId) : '');
  // '' = all branches. A user without all-branch access manages their own branch's tiers.
  const [branchId, setBranchId] = useState(() => (isAllBranches || !activeBranchId || activeBranchId === 'ALL' ? '' : String(activeBranchId)));
  const [showInactive, setShowInactive] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [basePrice, setBasePrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [tiered, setTiered] = useState({ content: [], totalElements: 0 });
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    if (!levelId && tierLevels.length > 0) setLevelId(String((tierLevels.find((l) => !l.systemDefault) || tierLevels[0]).id));
  }, [tierLevels, levelId]);

  // Products that already have tiers (search / level filter).
  useEffect(() => {
    if (embedded) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      listTieredProducts({ search: listSearch, priceLevelId: levelId ? Number(levelId) : undefined, size: 50 })
        .then((data) => { if (!cancelled) setTiered(data || { content: [], totalElements: 0 }); })
        .catch(() => { if (!cancelled) setTiered({ content: [], totalElements: 0 }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [listSearch, levelId, listVersion, embedded]);

  const load = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    setLoadError('');
    try {
      setTiers(await getQuantityTiers([product.productId], { includeInactive: true }));
      if (levelId) {
        const res = await resolvePrices({ priceLevelId: Number(levelId), items: [{ productId: product.productId, quantity: null }] });
        const line = res?.lines?.[0];
        setBasePrice(line?.untieredPrice ?? line?.price ?? null);
      }
    } catch (err) {
      setLoadError(errorText(err, 'Tiers could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [product, levelId]);

  useEffect(() => { load(); }, [load]);

  const branchKey = branchId === '' ? null : Number(branchId);
  const level = tierLevels.find((l) => String(l.id) === levelId) || null;
  const forLevel = tiers.filter((t) => String(t.priceLevelId) === levelId && (showInactive || t.active));
  const scoped = forLevel.filter((t) => (t.branchId ?? null) === branchKey);
  // At a branch, the all-branches tiers still apply wherever the branch has no tier of its own.
  const inherited = branchKey == null ? [] : forLevel.filter((t) => t.branchId == null && t.active
    && !scoped.some((s) => s.active && Number(s.minQuantity) === Number(t.minQuantity)));
  const unit = tiers[0]?.baseUnit || null;

  const add = async ({ minQuantity, price }) => {
    try {
      await createQuantityTier({ productId: product.productId, priceLevelId: Number(levelId), branchId: branchKey, minQuantity, price });
      toast.success('Tier added.');
      await load();
      setListVersion((v) => v + 1);
    } catch (err) {
      toast.error(errorText(err, 'The tier could not be added.'));
    }
  };

  const refresh = async () => { await load(); setListVersion((v) => v + 1); };

  if (tierLevels.length === 0) {
    return <p className="text-sm text-slate-600">Activate a price level first, then set quantity tiers for it here.</p>;
  }

  const rows = [...scoped, ...inherited].sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity));

  return (
    <div className="flex flex-col gap-4">
      <p className={embedded ? 'text-xs text-slate-500' : 'text-sm text-slate-600'}>
        Set a lower unit price for larger quantities. Thresholds and prices are per base unit: a box of 12
        counts as 12 towards a tier and is charged 12 times the tier price. All lines of the same product in
        a sale count together; free (FOC) quantity never counts. A customer&apos;s negotiated price still wins
        over any tier.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {!embedded && <ProductPicker onPick={setProduct} />}
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Price level
          <select aria-label="Tier price level" value={levelId} onChange={(e) => setLevelId(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            {tierLevels.map((l) => <option key={l.id} value={String(l.id)}>{l.name}{l.systemDefault ? ' (default)' : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Tiers for
          <select aria-label="Tier branch scope" value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            {isAllBranches && <option value="">All branches</option>}
            {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>

      {!product ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500" data-testid="tiers-empty-product">
          Pick a product to see and edit its quantity tiers.
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="tier-editor">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800">{product.productName}</div>
              <div className="font-mono text-[11px] text-slate-400">{product.productCode}</div>
            </div>
            <div className="text-sm text-slate-600">
              {level?.name} price without a tier: <span className="font-semibold tabular-nums">{fmtMoney(basePrice)}</span>
              {unit ? ` per ${unit}` : ''}
            </div>
          </div>
          {branchKey != null && (
            <p className="rounded bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Editing tiers for <strong>{branches.find((b) => String(b.id) === branchId)?.name || 'this branch'}</strong> only. A branch tier
              replaces the all-branches tier with the same quantity; all-branches tiers are shown read-only here.
            </p>
          )}
          {loadError && <p className="text-sm text-red-600" role="alert">{loadError}</p>}
          <div className="overflow-x-auto rounded border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right">From quantity</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2">Applies to</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <TierRow key={`${t.id}:${t.updatedAt || ''}`} tier={t} unit={unit}
                    editable={canEdit && (t.branchId ?? null) === branchKey}
                    readOnlyNote={t.branchId == null && branchKey != null ? 'Edit under All branches' : ''}
                    onSaved={refresh} />
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No quantity tiers for this level{branchKey != null ? ' and branch' : ''} yet.</td></tr>
                )}
                {loading && rows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Loading…</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {canEdit && <AddTierForm onAdd={add} unit={unit} />}
        </div>
      )}

      {!embedded && <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-slate-700"><Layers size={14} /> Products with tiers{level ? ` under ${level.name}` : ''}</h2>
          <label className="relative flex flex-col gap-1 text-xs font-medium text-slate-600">
            <Search size={14} className="absolute bottom-2.5 left-3 text-slate-400" />
            <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Filter by code or name" aria-label="Filter tiered products"
              className="rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm" />
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Levels</th><th className="px-3 py-2 text-right">Tiers</th></tr>
            </thead>
            <tbody>
              {(tiered.content || []).map((p) => (
                <tr key={p.productId} className="cursor-pointer border-t border-slate-100 hover:bg-[#FFF8E7]" onClick={() => setProduct(p)}>
                  <td className="px-3 py-1.5"><span className="font-medium text-slate-800">{p.productName}</span> <span className="font-mono text-[11px] text-slate-400">{p.productCode}</span></td>
                  <td className="px-3 py-1.5 text-slate-600">{(p.levels || []).join(', ')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.tierCount}</td>
                </tr>
              ))}
              {(tiered.content || []).length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">No products have quantity tiers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}
