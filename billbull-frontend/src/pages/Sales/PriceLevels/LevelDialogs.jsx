import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Power, Save, Trash2 } from 'lucide-react';
import {
  bulkUpdateLevelPrices,
  createPriceLevel,
  setPriceLevelActive,
  updatePriceLevel,
  upsertProductLevelPrices,
} from '@billbull/shared/api/pricingApi';
import {
  BranchSelect, Field, MarginBadge, Modal, ROUNDING_STEPS, btn, errorText, inputClass, marginOf, money, num,
} from './pricingUi';

const EMPTY_LEVEL = { id: null, name: '', code: '', description: '', sortOrder: '' };

/**
 * Create or edit a price level. A new level can start with prices for a set of products, worked out
 * from cost (margin / markup) or from the retail price (discount); otherwise prices are entered later.
 */
export function LevelFormDialog({ open, onClose, initial, onSaved, departments, brands, rules, costVisible, canPrice }) {
  const isEdit = initial?.id != null;
  const [form, setForm] = useState(EMPTY_LEVEL);
  const [seed, setSeed] = useState({ method: 'NONE', value: '', roundTo: '', departmentId: '', brandId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...EMPTY_LEVEL, ...initial, sortOrder: initial.sortOrder ?? '' } : EMPTY_LEVEL);
    setSeed({ method: 'NONE', value: '', roundTo: rules?.roundTo != null ? Number(rules.roundTo).toFixed(2) : '0.01', departmentId: '', brandId: '' });
  }, [open, initial, rules]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required.'); return; }
    if (seed.method !== 'NONE' && !(Number(seed.value) >= 0 && seed.value !== '')) { toast.error('Enter the percentage for the starting prices.'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        code: (form.code || '').trim() || null,
        description: (form.description || '').trim() || null,
        sortOrder: form.sortOrder === '' ? null : Number(form.sortOrder),
      };
      const saved = isEdit ? await updatePriceLevel(form.id, body) : await createPriceLevel(body);
      let note = '';
      if (!isEdit && seed.method !== 'NONE') {
        try {
          const action = { MARGIN: 'SET_MARGIN', MARKUP: 'SET_MARKUP', DISCOUNT: 'DECREASE_PERCENT' }[seed.method];
          const res = await bulkUpdateLevelPrices({
            priceLevelIds: [saved.id], basis: 'BASE', action, value: Number(seed.value),
            roundTo: Number(seed.roundTo) || undefined,
            departmentId: seed.departmentId ? Number(seed.departmentId) : undefined,
            brandId: seed.brandId ? Number(seed.brandId) : undefined,
          });
          note = ` ${res.changed} product price${res.changed === 1 ? '' : 's'} set${res.skipped ? `, ${res.skipped} skipped` : ''}.`;
        } catch (err) {
          toast.error(`The level was created, but its starting prices were not: ${errorText(err, 'unknown error')}`);
        }
      }
      toast.success(`${isEdit ? 'Price level updated.' : `Price level "${saved.name}" created.`}${note}`);
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, 'Price level could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} testId="level-form-dialog"
      title={isEdit ? 'Edit Price Level' : 'Create New Price Level'}
      description={isEdit ? 'Rename or describe this level. Prices are edited in the matrix.' : 'Add a named selling-price level, e.g. Wholesale, VIP or Staff.'}
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={btn.primary} disabled={saving} onClick={submit}>
          {isEdit ? <Save size={16} /> : <Plus size={16} />} {isEdit ? 'Save Changes' : 'Create Price Level'}
        </button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Price level name *">
          <input aria-label="Price level name" className={inputClass} maxLength={100} autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Distributor Price" />
        </Field>
        <Field label="Code" hint="Optional; derived from the name when empty">
          <input aria-label="Price level code" className={`${inputClass} uppercase`} maxLength={46} value={form.code || ''} onChange={set('code')} />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <input aria-label="Price level description" className={inputClass} maxLength={500} value={form.description || ''} onChange={set('description')} />
        </Field>
        <Field label="Sort order" hint="Lower numbers show first">
          <input aria-label="Sort order" type="number" className={inputClass} value={form.sortOrder} onChange={set('sortOrder')} />
        </Field>
      </div>

      {!isEdit && canPrice && (
        <div className="flex flex-col gap-3 rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] p-4">
          <div className="text-sm font-semibold text-slate-800">Starting prices</div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Calculation method">
              <select aria-label="Calculation method" className={inputClass} value={seed.method} onChange={(e) => setSeed((s) => ({ ...s, method: e.target.value }))}>
                <option value="NONE">Enter prices later</option>
                {costVisible && <option value="MARGIN">Margin on cost %</option>}
                {costVisible && <option value="MARKUP">Markup on cost %</option>}
                <option value="DISCOUNT">Discount off retail price %</option>
              </select>
            </Field>
            {seed.method !== 'NONE' && (
              <>
                <Field label="Percentage">
                  <input aria-label="Starting percentage" inputMode="decimal" className={inputClass} value={seed.value} onChange={(e) => setSeed((s) => ({ ...s, value: e.target.value }))} />
                </Field>
                <Field label="Round to">
                  <select aria-label="Round starting prices to" className={inputClass} value={seed.roundTo} onChange={(e) => setSeed((s) => ({ ...s, roundTo: e.target.value }))}>
                    {ROUNDING_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Department">
                  <select aria-label="Starting prices department" className={inputClass} value={seed.departmentId} onChange={(e) => setSeed((s) => ({ ...s, departmentId: e.target.value }))}>
                    <option value="">All departments</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Brand">
                  <select aria-label="Starting prices brand" className={inputClass} value={seed.brandId} onChange={(e) => setSeed((s) => ({ ...s, brandId: e.target.value }))}>
                    <option value="">All brands</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>
          {seed.method !== 'NONE' && (
            <p className="text-xs text-slate-600">
              {seed.method === 'MARGIN' && 'Price = cost ÷ (1 − margin %). Example: cost 100 at 20 % margin = 125.'}
              {seed.method === 'MARKUP' && 'Price = cost × (1 + markup %). Example: cost 100 at 20 % markup = 120.'}
              {seed.method === 'DISCOUNT' && 'Price = retail price × (1 − discount %).'}
              {' '}Products without the needed cost or price are skipped. Prices apply in all branches.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** List of all levels with rename and activate / deactivate. */
export function ManageLevelsDialog({ open, onClose, levels, customersByLevel, canManage, onEdit, onChanged }) {
  const toggle = async (level) => {
    try {
      await setPriceLevelActive(level.id, !level.active);
      toast.success(level.active ? `'${level.name}' deactivated.` : `'${level.name}' activated.`);
      onChanged();
    } catch (err) {
      toast.error(errorText(err, 'Status could not be changed.'));
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" testId="manage-levels-dialog" title="Manage Price Levels"
      description="The default level is each product's own selling price; it can be renamed but not deactivated. Deactivated levels can't be chosen on new sales and their customers fall back to default prices."
      footer={<button type="button" className={btn.outline} onClick={onClose}>Close</button>}>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th><th className="px-3 py-2">Code</th>
              <th className="px-3 py-2 text-right">Products</th><th className="px-3 py-2 text-right">Tiers</th>
              <th className="px-3 py-2 text-right">Customers</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id} className="border-t border-slate-100" data-testid={`level-row-${l.id}`}>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {l.name}
                  {l.systemDefault && <span className="ml-2 rounded border border-amber-300 bg-[#FFF4BF] px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Default</span>}
                  {l.description && <div className="text-xs font-normal text-slate-500">{l.description}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.code}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.systemDefault ? 'All' : l.productPriceCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.quantityTierCount ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{customersByLevel?.[l.id] ?? 0}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{l.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-3 py-2">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <button type="button" className={btn.ghost} title="Edit" aria-label={`Edit ${l.name}`} onClick={() => onEdit(l)}><Pencil size={14} /></button>
                      {!l.systemDefault && (
                        <button type="button" className={btn.ghost} title={l.active ? 'Deactivate' : 'Activate'} aria-label={`${l.active ? 'Deactivate' : 'Activate'} ${l.name}`} onClick={() => toggle(l)}>
                          <Power size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/**
 * Edit one matrix cell: a product's price under a level, for all branches or one branch.
 * An empty price (or Remove) clears the cell so the product sells at its default price there.
 */
export function PriceEditDialog({ open, onClose, product, level, branchId, branches, isAllBranches, minMargin, costVisible, currency, canEdit, onSaved }) {
  const [scope, setScope] = useState(branchId || '');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const rowFor = (b) => (product?.prices || []).find((p) => p.priceLevelId === level?.id && String(p.branchId ?? '') === String(b || ''));

  useEffect(() => {
    if (!open) return;
    const s = branchId || (isAllBranches ? '' : String(branches?.[0]?.id ?? ''));
    setScope(s);
  }, [open, branchId, isAllBranches, branches]);

  useEffect(() => {
    if (!open) return;
    const row = rowFor(scope);
    setPrice(row ? String(Number(row.price).toFixed(2)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, product, level]);

  if (!product || !level) return null;
  const existing = rowFor(scope);
  const inherited = scope ? rowFor('') : null;
  const cost = costVisible ? num(product.cost) : null;
  const p = num(price);
  const margin = marginOf(p, cost);

  const save = async (value) => {
    if (value != null && !(value > 0)) { toast.error('The price must be greater than zero.'); return; }
    setSaving(true);
    try {
      await upsertProductLevelPrices([{ productId: product.id, priceLevelId: level.id, branchId: scope === '' ? null : Number(scope), price: value }]);
      toast.success(value == null ? 'Price removed.' : 'Price updated.');
      onSaved();
    } catch (err) {
      toast.error(errorText(err, 'The price could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} testId="price-edit-dialog" title="Edit Price"
      description={`${product.name} — ${level.name}`}
      footer={canEdit ? <>
        <button type="button" className={btn.outline} onClick={onClose}>Cancel</button>
        {existing && (
          <button type="button" className={`${btn.outline} text-red-600`} disabled={saving} onClick={() => save(null)}>
            <Trash2 size={16} /> Remove price
          </button>
        )}
        <button type="button" className={btn.primary} disabled={saving} onClick={() => save(price.trim() === '' ? null : p)}>
          <Save size={16} /> Save Price
        </button>
      </> : <button type="button" className={btn.outline} onClick={onClose}>Close</button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={`${level.name} price *`} hint="Per base unit; packings are charged this times their conversion">
          <input aria-label="Level price" inputMode="decimal" autoFocus disabled={!canEdit} className={`${inputClass} text-right tabular-nums`}
            value={price} onChange={(e) => setPrice(e.target.value)}
            placeholder={inherited ? String(Number(inherited.price).toFixed(2)) : String(num(product.basePrice)?.toFixed(2) ?? '')} />
        </Field>
        <Field label="Applies in">
          <BranchSelect value={scope} onChange={setScope} branches={branches} isAllBranches={isAllBranches} />
        </Field>
      </div>
      {scope && inherited && !existing && (
        <p className="rounded bg-sky-50 px-3 py-2 text-xs text-sky-800">
          This branch uses the all-branches price of {money(inherited.price, currency)} until you set its own.
        </p>
      )}
      <div className="grid grid-cols-3 gap-4 rounded-md border-2 border-[#F5C742] bg-[#FFF4BF] p-4 text-sm">
        <div><p className="text-xs text-slate-600">Cost</p><p className="font-semibold tabular-nums">{costVisible ? money(cost, currency) : 'Hidden'}</p></div>
        <div><p className="text-xs text-slate-600">Selling price</p><p className="font-semibold tabular-nums">{money(p ?? product.basePrice, currency)}</p></div>
        <div><p className="text-xs text-slate-600">Gross profit %</p><div className="pt-0.5">{margin != null ? <MarginBadge margin={margin} minMargin={minMargin} suffix="" /> : <span className="text-slate-400">—</span>}</div></div>
      </div>
      {costVisible && cost != null && p != null && p < cost && (
        <p className="rounded border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
          ⚠ This price is below cost: a loss of {money(cost - p, currency)} per unit.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Retail (default) price: {money(product.basePrice, currency)}. Clearing the price makes the product sell at its default price under this level.
      </p>
    </Modal>
  );
}
