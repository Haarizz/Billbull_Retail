import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Calculator, Copy, Plus, Save, Trash2, UserMinus, Users } from 'lucide-react';
import {
  assignLevelToCustomers,
  bulkCustomerPrices,
  bulkUpdateLevelPrices,
  copyCustomerPrices,
  createCustomerPrice,
  createPriceLevel,
  getCustomerEffectivePrices,
  listCustomerGroups,
  listLevelCustomers,
  updateCustomerPrice,
  upsertProductLevelPrices,
} from '@billbull/shared/api/pricingApi';
import { clearCustomerPricingStatusCache } from '@billbull/shared/hooks/useCustomerPricingStatus';
import { PRICE_SOURCE_LABEL } from '@billbull/shared/utils/priceLevels';
import {
  BranchSelect, BulkSummary, CustomerPicker, Field, MarginBadge, Modal, ProductPicker, ROUNDING_STEPS, TONE_TEXT,
  btn, errorText, inputClass, marginOf, marginTone, money, num, today,
} from './pricingUi';

const ownBranch = (isAllBranches, activeBranchId) =>
  (!isAllBranches && activeBranchId && activeBranchId !== 'ALL' ? String(activeBranchId) : '');

/** Add or edit a negotiated (customer-specific) price. */
export function CustomerPriceDialog({ open, onClose, initial, presetCustomer, branches, isAllBranches, activeBranchId, minMargin, costVisible, currency, onSaved }) {
  const isEdit = initial?.id != null;
  const [customer, setCustomer] = useState(null);
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState({});
  const [reference, setReference] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setCustomer({ id: initial.customerId, code: initial.customerCode, name: initial.customerName });
      setProduct({ id: initial.productId, code: initial.productCode, name: initial.productName, cost: initial.cost, retailPrice: initial.basePrice });
      setForm({
        price: String(initial.price), discount: initial.discountPercent != null ? String(Number(initial.discountPercent).toFixed(1)) : '',
        branchId: initial.branchId == null ? '' : String(initial.branchId), effectiveFrom: initial.effectiveFrom,
        effectiveTo: initial.effectiveTo || '', enabled: initial.enabled, notes: initial.notes || '',
      });
    } else {
      setCustomer(presetCustomer || null);
      setProduct(null);
      setForm({ price: '', discount: '', branchId: ownBranch(isAllBranches, activeBranchId), effectiveFrom: today(), effectiveTo: '', enabled: true, notes: '' });
    }
    setReference(null);
  }, [open, initial, isEdit, presetCustomer, isAllBranches, activeBranchId]);

  useEffect(() => {
    if (!open || !product?.id || !customer?.id) { setReference(null); return undefined; }
    let cancelled = false;
    getCustomerEffectivePrices({ customerId: customer.id, productIds: [product.id], branchId: form.branchId === '' ? undefined : Number(form.branchId) })
      .then((res) => { if (!cancelled) setReference({ ...(res?.products?.[0] || {}), levelName: res?.priceLevelName }); })
      .catch(() => { if (!cancelled) setReference(null); });
    return () => { cancelled = true; };
  }, [open, product?.id, customer?.id, form.branchId]);

  const base = num(product?.retailPrice);
  const cost = costVisible ? num(product?.cost) : null;
  const price = num(form.price);
  const margin = marginOf(price, cost);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onPrice = (e) => {
    const v = e.target.value;
    const p = num(v);
    setForm((f) => ({ ...f, price: v, discount: base && p != null ? (((base - p) / base) * 100).toFixed(1) : f.discount }));
  };
  const onDiscount = (e) => {
    const v = e.target.value;
    const d = num(v);
    setForm((f) => ({ ...f, discount: v, price: base && d != null ? (base * (1 - d / 100)).toFixed(2) : f.price }));
  };

  const submit = async () => {
    if (!customer) { toast.error('Choose a customer.'); return; }
    if (!product) { toast.error('Choose a product.'); return; }
    if (!(price > 0)) { toast.error('The customer price must be greater than zero.'); return; }
    if (!form.effectiveFrom) { toast.error('Choose the date the price starts.'); return; }
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) { toast.error("The end date can't be before the start date."); return; }
    setSaving(true);
    try {
      const body = {
        customerId: customer.id, productId: product.id, branchId: form.branchId === '' ? null : Number(form.branchId),
        price, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || null, enabled: Boolean(form.enabled),
        notes: (form.notes || '').trim() || null,
      };
      if (isEdit) await updateCustomerPrice(initial.id, body); else await createCustomerPrice(body);
      clearCustomerPricingStatusCache();
      toast.success(isEdit ? 'Customer price updated.' : 'Customer price override saved.');
      onSaved();
    } catch (err) {
      toast.error(errorText(err, 'The customer price could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const refSource = reference?.referenceSource ? (PRICE_SOURCE_LABEL[reference.referenceSource] || reference.referenceSource) : null;

  return (
    <Modal open={open} onClose={onClose} size="lg" testId="customer-price-dialog"
      title={isEdit ? 'Edit Customer Price' : 'Add Customer Price Override'}
      description="A negotiated price replaces the customer's price-level price for the product in POS and on every sales document."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={btn.primary} disabled={saving} onClick={submit}><Save size={16} /> Save Override</button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Customer *">
          {isEdit ? <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{customer?.name} <span className="font-mono text-xs text-slate-400">{customer?.code}</span></div>
            : <CustomerPicker value={customer} onChange={setCustomer} label="Override customer" />}
        </Field>
        <Field label="Product *">
          {product ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm" data-testid="selected-product">
              <span className="truncate font-medium">{product.name}</span><span className="font-mono text-xs text-slate-400">{product.code}</span>
              {!isEdit && <button type="button" className="ml-auto text-xs text-slate-500 underline" onClick={() => setProduct(null)}>Change</button>}
            </div>
          ) : <ProductPicker label="Override product" currency={currency} onPick={(p) => { setProduct(p); setForm((f) => ({ ...f, price: p.retailPrice != null ? String(p.retailPrice) : '', discount: '0.0' })); }} />}
        </Field>
      </div>

      {product && (
        <div className="grid grid-cols-3 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <div><p className="text-xs text-slate-600">Product cost</p><p className="font-semibold tabular-nums">{costVisible ? money(product.cost, currency) : 'Hidden'}</p></div>
          <div><p className="text-xs text-slate-600">Base (retail) price</p><p className="font-semibold tabular-nums">{money(base, currency)}</p></div>
          <div><p className="text-xs text-slate-600">Base margin</p><p className="font-semibold tabular-nums">{marginOf(base, cost) != null ? `${marginOf(base, cost).toFixed(1)}%` : '—'}</p></div>
          {reference && (
            <p className="col-span-3 text-xs text-slate-600" data-testid="reference-price">
              Without an override this customer pays <b className="tabular-nums">{money(reference.referencePrice, currency)}</b>
              {refSource ? ` (${refSource}${reference.levelName ? ` · ${reference.levelName}` : ''})` : ''}
              {reference.customerPriceId && reference.customerPriceId !== initial?.id ? <> · currently charged <b className="tabular-nums">{money(reference.price, currency)}</b></> : null}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Customer price *" hint="Per base unit">
          <input aria-label="Customer price" inputMode="decimal" className={`${inputClass} text-right tabular-nums`} value={form.price || ''} onChange={onPrice} placeholder="0.00" />
        </Field>
        <Field label="Discount % (off the retail price)">
          <input aria-label="Discount percent" inputMode="decimal" disabled={!base} className={`${inputClass} text-right tabular-nums`} value={form.discount || ''} onChange={onDiscount} placeholder="0.0" />
        </Field>
      </div>

      {costVisible && cost != null && price != null && price < cost && (
        <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
          <div><p className="font-semibold text-red-800">Price is below item cost</p>
            <p className="text-red-700">Loss: {money(cost - price, currency)} per unit. Saving is refused if the margin protector rule is on.</p></div>
        </div>
      )}

      {product && price != null && price > 0 && (
        <div className="grid grid-cols-3 gap-4 rounded-md border-2 border-[#F5C742] bg-[#FFF4BF] p-4 text-sm">
          <div><p className="text-xs text-slate-600">Customer price</p><p className="font-semibold tabular-nums">{money(price, currency)}</p></div>
          <div><p className="text-xs text-slate-600">Profit per unit</p><p className={`font-semibold tabular-nums ${cost == null ? 'text-slate-400' : price - cost < 0 ? 'text-red-600' : 'text-green-600'}`}>{cost == null ? '—' : money(price - cost, currency)}</p></div>
          <div><p className="text-xs text-slate-600">Gross profit %</p><p className={`font-semibold tabular-nums ${TONE_TEXT[marginTone(margin, minMargin)]}`}>{margin != null ? `${margin.toFixed(1)}%` : '—'}</p></div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Applies in">
          <BranchSelect value={form.branchId ?? ''} onChange={(v) => setForm((f) => ({ ...f, branchId: v }))} branches={branches} isAllBranches={isAllBranches} label="Override branch" />
        </Field>
        <Field label="Effective date">
          <input aria-label="Valid from" type="date" className={inputClass} value={form.effectiveFrom || ''} onChange={set('effectiveFrom')} />
        </Field>
        <Field label="Expiry date (optional)">
          <input aria-label="Valid to" type="date" className={inputClass} value={form.effectiveTo || ''} onChange={set('effectiveTo')} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea aria-label="Notes" rows={2} maxLength={500} className={inputClass} value={form.notes || ''} onChange={set('notes')} placeholder="Special terms or contract reference…" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} /> Active
      </label>
    </Modal>
  );
}

/** Product selection shared by the bulk dialogs: all, by department / brand, or picked products. */
function ProductScope({ scope, setScope, departments, brands, currency }) {
  return (
    <div className="flex flex-col gap-2">
      <Field label="Apply to products">
        <select aria-label="Product scope" className={inputClass} value={scope.mode} onChange={(e) => setScope({ ...scope, mode: e.target.value })}>
          <option value="ALL">All products</option>
          <option value="GROUP">By department / brand</option>
          <option value="PICK">Selected products</option>
        </select>
      </Field>
      {scope.mode === 'GROUP' && (
        <div className="grid gap-3 md:grid-cols-2">
          <select aria-label="Scope department" className={inputClass} value={scope.departmentId} onChange={(e) => setScope({ ...scope, departmentId: e.target.value })}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Scope brand" className={inputClass} value={scope.brandId} onChange={(e) => setScope({ ...scope, brandId: e.target.value })}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      {scope.mode === 'PICK' && (
        <div className="flex flex-col gap-2">
          <ProductPicker label="Add product" currency={currency}
            onPick={(p) => setScope({ ...scope, products: scope.products.some((x) => x.id === p.id) ? scope.products : [...scope.products, p] })} />
          <div className="flex flex-wrap gap-1">
            {scope.products.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                {p.code}
                <button type="button" aria-label={`Remove ${p.code}`} onClick={() => setScope({ ...scope, products: scope.products.filter((x) => x.id !== p.id) })}>×</button>
              </span>
            ))}
            {scope.products.length === 0 && <span className="text-xs text-slate-400">No products added yet.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_SCOPE = { mode: 'ALL', departmentId: '', brandId: '', products: [] };
const scopeBody = (s) => ({
  departmentId: s.mode === 'GROUP' && s.departmentId ? Number(s.departmentId) : undefined,
  brandId: s.mode === 'GROUP' && s.brandId ? Number(s.brandId) : undefined,
  productIds: s.mode === 'PICK' ? s.products.map((p) => p.id) : undefined,
});

/** Negotiated prices for one customer across many products. */
export function CustomerBulkDialog({ open, onClose, presetCustomer, departments, brands, branches, isAllBranches, activeBranchId, rules, costVisible, currency, onApplied }) {
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({});
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(presetCustomer || null);
    setForm({ method: 'DISCOUNT_PERCENT', value: '', roundTo: rules?.roundTo != null ? Number(rules.roundTo).toFixed(2) : '0.01',
      branchId: ownBranch(isAllBranches, activeBranchId), effectiveFrom: today(), effectiveTo: '', replaceExisting: false });
    setScope(EMPTY_SCOPE);
    setPreview(null);
  }, [open, presetCustomer, rules, isAllBranches, activeBranchId]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setPreview(null); };
  const run = async (dryRun) => {
    if (!customer) { toast.error('Choose a customer.'); return; }
    if (form.value === '' || !(Number(form.value) >= 0)) { toast.error('Enter a value.'); return; }
    if (scope.mode === 'PICK' && scope.products.length === 0) { toast.error('Add at least one product.'); return; }
    setBusy(true);
    try {
      const res = await bulkCustomerPrices({
        customerId: customer.id, method: form.method, value: Number(form.value), roundTo: Number(form.roundTo),
        branchId: form.branchId === '' ? null : Number(form.branchId), effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null, replaceExisting: form.replaceExisting, dryRun, ...scopeBody(scope),
      });
      setPreview(res);
      if (!dryRun) {
        clearCustomerPricingStatusCache();
        toast.success(`${res.created} customer price${res.created === 1 ? '' : 's'} saved for ${customer.name}.`);
        onApplied();
      }
    } catch (err) {
      toast.error(errorText(err, 'Bulk customer pricing failed.'));
    } finally {
      setBusy(false);
    }
  };

  const percent = form.method !== 'FIXED_PRICE';
  return (
    <Modal open={open} onClose={onClose} size="lg" testId="customer-bulk-dialog" title="Bulk Customer Pricing"
      description="Set negotiated prices for many products for one customer. Preview first; nothing is saved until you apply."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Close</button>
        <button type="button" className={btn.outline} disabled={busy} onClick={() => run(true)}>Preview</button>
        <button type="button" className={btn.primary} disabled={busy || !preview || preview.applied || preview.created === 0} onClick={() => run(false)}>
          Apply Bulk Pricing {preview && !preview.applied ? `(${preview.created})` : ''}
        </button>
      </>}>
      <Field label="Customer *"><CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setPreview(null); }} label="Bulk customer" /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Pricing method">
          <select aria-label="Pricing method" className={inputClass} value={form.method || ''} onChange={(e) => set('method', e.target.value)}>
            <option value="DISCOUNT_PERCENT">Discount off retail %</option>
            {costVisible && <option value="MARKUP_PERCENT">Markup on cost %</option>}
            {costVisible && <option value="MARGIN_PERCENT">Margin on cost %</option>}
            <option value="FIXED_PRICE">Fixed price</option>
          </select>
        </Field>
        <Field label={percent ? 'Percentage' : `Price (${currency})`}>
          <input aria-label="Bulk customer value" inputMode="decimal" className={`${inputClass} text-right`} value={form.value || ''} onChange={(e) => set('value', e.target.value)} />
        </Field>
        <Field label="Round to">
          <select aria-label="Bulk customer rounding" className={inputClass} value={form.roundTo || '0.01'} onChange={(e) => set('roundTo', e.target.value)}>
            {ROUNDING_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Applies in"><BranchSelect value={form.branchId ?? ''} onChange={(v) => set('branchId', v)} branches={branches} isAllBranches={isAllBranches} label="Bulk customer branch" /></Field>
        <Field label="Effective date"><input aria-label="Bulk valid from" type="date" className={inputClass} value={form.effectiveFrom || ''} onChange={(e) => set('effectiveFrom', e.target.value)} /></Field>
        <Field label="Expiry date (optional)"><input aria-label="Bulk valid to" type="date" className={inputClass} value={form.effectiveTo || ''} onChange={(e) => set('effectiveTo', e.target.value)} /></Field>
      </div>
      <ProductScope scope={scope} setScope={(s) => { setScope(s); setPreview(null); }} departments={departments} brands={brands} currency={currency} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.replaceExisting || false} onChange={(e) => set('replaceExisting', e.target.checked)} />
        Replace the customer&apos;s existing prices for these products (they end the day before)
      </label>
      <BulkSummary result={preview} currency={currency} columns={preview ? [
        [preview.applied ? 'Saved' : 'Will save', preview.created], ['Replacing', preview.replaced], ['Skipped', preview.skipped], ['Products', preview.products],
      ] : []} />
    </Modal>
  );
}

export function CopyPriceListDialog({ open, onClose, currency, onApplied }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setFrom(null); setTo(null); setOverwrite(false); setPreview(null); } }, [open]);

  const run = async (dryRun) => {
    if (!from || !to) { toast.error('Please select both customers.'); return; }
    setBusy(true);
    try {
      const res = await copyCustomerPrices({ fromCustomerId: from.id, toCustomerId: to.id, overwrite, dryRun });
      setPreview(res);
      if (!dryRun) {
        clearCustomerPricingStatusCache();
        toast.success(`Price list copied from ${from.name} to ${to.name}: ${res.created} price${res.created === 1 ? '' : 's'}.`);
        onApplied();
      }
    } catch (err) {
      toast.error(errorText(err, 'The price list could not be copied.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} testId="copy-dialog" title="Copy Price List" description="Copy a customer's current and upcoming negotiated prices to another customer."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={btn.outline} disabled={busy} onClick={() => run(true)}>Preview</button>
        <button type="button" className={btn.primary} disabled={busy || !preview || preview.applied || preview.created === 0} onClick={() => run(false)}><Copy size={16} /> Copy Price List</button>
      </>}>
      <Field label="From customer"><CustomerPicker value={from} onChange={(c) => { setFrom(c); setPreview(null); }} label="Copy from customer" /></Field>
      <div className="flex justify-center"><Copy className="h-6 w-6 text-[#F5C742]" /></div>
      <Field label="To customer"><CustomerPicker value={to} onChange={(c) => { setTo(c); setPreview(null); }} label="Copy to customer" /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); setPreview(null); }} />
        Overwrite the destination customer&apos;s existing prices for the same products
      </label>
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
        <span>Prices already running start today for the new customer; validity end dates and branches are kept. Review the preview before copying.</span>
      </div>
      <BulkSummary result={preview} currency={currency} columns={preview ? [
        [preview.applied ? 'Copied' : 'Will copy', preview.created], ['Replacing', preview.replaced], ['Skipped', preview.skipped],
      ] : []} />
    </Modal>
  );
}

export function PriceSimulatorDialog({ open, onClose, minMargin, costVisible, currency }) {
  const EMPTY = { cost: '', basePrice: '', customerPrice: '', discount: '' };
  const [f, setF] = useState(EMPTY);
  const close = () => { setF(EMPTY); onClose(); };
  const cost = num(f.cost) ?? 0;
  const base = num(f.basePrice) ?? 0;
  const price = num(f.customerPrice) ?? 0;
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  return (
    <Modal open={open} onClose={close} testId="simulator-dialog" title="Price Simulation Tool" description="Try discounts and see profit and margin before you set a price. Nothing is saved."
      footer={<button type="button" className={btn.outline} onClick={close}>Close</button>}>
      <Field label="Start from a product (optional)">
        <ProductPicker label="Simulate product" currency={currency} onPick={(p) => setF({
          cost: costVisible && p.cost != null ? String(p.cost) : '', basePrice: p.retailPrice != null ? String(p.retailPrice) : '',
          customerPrice: p.retailPrice != null ? String(p.retailPrice) : '', discount: '0.0',
        })} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Purchase cost"><input aria-label="Simulated cost" inputMode="decimal" className={inputClass} value={f.cost} onChange={(e) => setF((x) => ({ ...x, cost: e.target.value }))} /></Field>
        <Field label="Base price"><input aria-label="Simulated base price" inputMode="decimal" className={inputClass} value={f.basePrice} onChange={(e) => setF((x) => ({ ...x, basePrice: e.target.value }))} /></Field>
        <Field label="Customer price">
          <input aria-label="Simulated customer price" inputMode="decimal" className={inputClass} value={f.customerPrice}
            onChange={(e) => { const v = e.target.value; const p = num(v); setF((x) => ({ ...x, customerPrice: v, discount: base > 0 && p != null ? (((base - p) / base) * 100).toFixed(1) : x.discount })); }} />
        </Field>
        <Field label="Discount %">
          <input aria-label="Simulated discount" inputMode="decimal" className={inputClass} value={f.discount}
            onChange={(e) => { const v = e.target.value; const d = num(v); setF((x) => ({ ...x, discount: v, customerPrice: d != null ? (base * (1 - d / 100)).toFixed(2) : x.customerPrice })); }} />
        </Field>
      </div>
      <div className="rounded-lg border-2 border-[#F5C742] bg-linear-to-br from-[#FFF4BF] to-[#FFE88C] p-5" data-testid="simulation-results">
        <h4 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Calculator size={16} /> Simulation Results</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-amber-200 bg-white/80 p-3"><p className="text-xs text-slate-600">Profit per unit</p><p className={`mt-1 text-xl font-bold tabular-nums ${profit < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(profit, currency)}</p></div>
          <div className="rounded border border-amber-200 bg-white/80 p-3"><p className="text-xs text-slate-600">Gross margin %</p><p className={`mt-1 text-xl font-bold tabular-nums ${TONE_TEXT[marginTone(price > 0 ? margin : null, minMargin)]}`}>{margin.toFixed(1)}%</p></div>
          <div className="rounded border border-amber-200 bg-white/80 p-3"><p className="text-xs text-slate-600">Markup on cost</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{cost > 0 ? ((profit / cost) * 100).toFixed(1) : '0.0'}%</p></div>
          <div className="rounded border border-amber-200 bg-white/80 p-3"><p className="text-xs text-slate-600">Price vs base</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{base > 0 ? ((price / base) * 100).toFixed(1) : '0.0'}%</p></div>
        </div>
        {price > 0 && profit < 0 && <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-800">⚠ Loss scenario — the price is below cost.</p>}
      </div>
    </Modal>
  );
}

/**
 * A customer price list is a price level that customers are put on. This creates the level, prices
 * the chosen products (from cost by a target margin, off retail by a discount, or typed in), and
 * hands back the new level so customers can be assigned.
 */
export function CreatePriceListDialog({ open, onClose, departments, brands, rules, costVisible, currency, onCreated }) {
  const [form, setForm] = useState({});
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [manual, setManual] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', description: '', method: costVisible ? 'MARGIN' : 'DISCOUNT', value: '20', roundTo: rules?.roundTo != null ? Number(rules.roundTo).toFixed(2) : '0.01' });
    setScope({ ...EMPTY_SCOPE, mode: 'PICK' });
    setManual({});
  }, [open, rules, costVisible]);

  const value = num(form.value) ?? 0;
  const listPrice = (p) => {
    if (form.method === 'MANUAL') return num(manual[p.id]);
    if (form.method === 'MARGIN') return num(p.cost) > 0 && value < 100 ? num(p.cost) / (1 - value / 100) : null;
    return num(p.retailPrice) != null ? num(p.retailPrice) * (1 - value / 100) : null;
  };
  const total = scope.products.reduce((s, p) => s + (listPrice(p) || 0), 0);

  const submit = async () => {
    if (!form.name?.trim()) { toast.error('Please enter the price list name.'); return; }
    if (scope.mode === 'PICK' && scope.products.length === 0) { toast.error('Please add at least one product.'); return; }
    if (form.method === 'MANUAL' && scope.mode !== 'PICK') { toast.error('Manual prices need picked products.'); return; }
    setSaving(true);
    try {
      const level = await createPriceLevel({ name: form.name.trim(), description: form.description?.trim() || null });
      let note = '';
      try {
        if (form.method === 'MANUAL') {
          const rows = scope.products.filter((p) => num(manual[p.id]) > 0)
            .map((p) => ({ productId: p.id, priceLevelId: level.id, branchId: null, price: Number(num(manual[p.id]).toFixed(2)) }));
          if (rows.length) await upsertProductLevelPrices(rows);
          note = ` ${rows.length} price${rows.length === 1 ? '' : 's'} set.`;
        } else {
          const res = await bulkUpdateLevelPrices({
            priceLevelIds: [level.id], basis: 'BASE', action: form.method === 'MARGIN' ? 'SET_MARGIN' : 'DECREASE_PERCENT',
            value, roundTo: Number(form.roundTo), ...scopeBody(scope),
          });
          note = ` ${res.changed} price${res.changed === 1 ? '' : 's'} set${res.skipped ? `, ${res.skipped} skipped` : ''}.`;
        }
      } catch (err) {
        toast.error(`The price list was created, but its prices were not saved: ${errorText(err, 'unknown error')}`);
      }
      toast.success(`Price list "${level.name}" created.${note}`);
      onCreated(level);
    } catch (err) {
      toast.error(errorText(err, 'The price list could not be created.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" testId="create-price-list-dialog" title="Create New Customer Price List"
      description="A named price list with its own prices, which you can then assign to many customers. Customers on it are charged these prices automatically."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={btn.primary} disabled={saving || !form.name?.trim()} onClick={submit}><Save size={16} /> Create Price List</button>
      </>}>
      <div className="flex flex-col gap-4 rounded-lg border-2 border-[#F5C742] bg-[#FFF4BF]/30 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Price list name *"><input aria-label="Price list name" className={inputClass} maxLength={100} value={form.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Premium Wholesale Pricing" /></Field>
          <Field label="Calculation method">
            <select aria-label="Price list method" className={inputClass} value={form.method || ''} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
              {costVisible && <option value="MARGIN">Calculate by target margin %</option>}
              <option value="DISCOUNT">Discount off retail %</option>
              <option value="MANUAL">Manual price entry</option>
            </select>
          </Field>
          {form.method !== 'MANUAL' && (
            <>
              <Field label={form.method === 'MARGIN' ? 'Target margin %' : 'Discount %'}>
                <input aria-label="Price list percentage" inputMode="decimal" className={inputClass} value={form.value || ''} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </Field>
              <Field label="Round to">
                <select aria-label="Price list rounding" className={inputClass} value={form.roundTo || '0.01'} onChange={(e) => setForm((f) => ({ ...f, roundTo: e.target.value }))}>
                  {ROUNDING_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Description (optional)" className="md:col-span-2"><input aria-label="Price list description" className={inputClass} maxLength={500} value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        </div>
        {form.method === 'MARGIN' && <p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-slate-600">Prices are calculated as cost ÷ (1 − margin %). Example: cost 100 at 20 % margin = 125.</p>}
      </div>

      <ProductScope scope={scope} setScope={setScope} departments={departments} brands={brands} currency={currency} />

      {scope.mode === 'PICK' && scope.products.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="p-2">Product</th>{costVisible && <th className="p-2 text-right">Cost</th>}<th className="p-2 text-right">Base price</th><th className="p-2 text-right">List price</th><th className="p-2 text-right">Margin</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {scope.products.map((p) => {
                const lp = listPrice(p);
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2"><span className="font-medium">{p.name}</span> <span className="font-mono text-[11px] text-slate-400">{p.code}</span></td>
                    {costVisible && <td className="p-2 text-right tabular-nums">{money(p.cost)}</td>}
                    <td className="p-2 text-right tabular-nums text-slate-600">{money(p.retailPrice)}</td>
                    <td className="p-2 text-right">
                      {form.method === 'MANUAL'
                        ? <input aria-label={`List price for ${p.code}`} inputMode="decimal" className="w-24 rounded border border-slate-200 px-2 py-1 text-right" value={manual[p.id] ?? ''} onChange={(e) => setManual((m) => ({ ...m, [p.id]: e.target.value }))} />
                        : <span className="font-semibold tabular-nums text-amber-700">{money(lp)}</span>}
                    </td>
                    <td className="p-2 text-right"><MarginBadge margin={costVisible ? marginOf(lp, p.cost) : null} minMargin={rules?.minMarginPercent} suffix="" /></td>
                    <td className="p-2"><button type="button" className={btn.ghost} aria-label={`Remove ${p.code} from list`} onClick={() => setScope({ ...scope, products: scope.products.filter((x) => x.id !== p.id) })}><Trash2 size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {scope.mode === 'PICK' && scope.products.length > 0 && (
        <div className="grid grid-cols-3 gap-4 rounded-lg border-2 border-[#F5C742] bg-linear-to-br from-[#FFF4BF] to-[#FFE88C] p-4 text-sm">
          <div><p className="text-xs text-slate-600">Products</p><p className="text-xl font-bold">{scope.products.length}</p></div>
          <div><p className="text-xs text-slate-600">{form.method === 'MARGIN' ? 'Target margin' : form.method === 'DISCOUNT' ? 'Discount' : 'Method'}</p><p className="text-xl font-bold text-amber-700">{form.method === 'MANUAL' ? 'Manual' : `${value}%`}</p></div>
          <div><p className="text-xs text-slate-600">Total value</p><p className="text-xl font-bold tabular-nums">{money(total, currency)}</p></div>
        </div>
      )}
    </Modal>
  );
}

/** Customers picked from a searchable list (with their current list) or a whole customer group. */
function CustomerChooser({ selected, setSelected, group, setGroup, groups, levelId }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState({ content: [], totalElements: 0 });
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listLevelCustomers({ search, customerGroup: group || undefined, size: 50 })
        .then((res) => { if (!cancelled) setPage(res || { content: [] }); })
        .catch(() => { if (!cancelled) setPage({ content: [], totalElements: 0 }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, group]);
  const toggle = (c) => setSelected((s) => (s.some((x) => x.id === c.id) ? s.filter((x) => x.id !== c.id) : [...s, c]));
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-2">
        <input aria-label="Filter customers" className={inputClass} placeholder="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Customer group" className={inputClass} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All customer groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-2" data-testid="customer-chooser">
        {(page.content || []).map((c) => {
          const on = selected.some((x) => x.id === c.id);
          return (
            <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-slate-50 ${on ? 'bg-blue-50' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(c)} aria-label={`Select ${c.name}`} />
              <span className="flex-1">
                <span className="block font-medium text-slate-900">{c.name} <span className="font-mono text-xs text-slate-400">{c.code}</span></span>
                <span className="text-xs text-slate-500">{[c.group, c.mobile].filter(Boolean).join(' • ') || '—'}</span>
              </span>
              {c.priceLevelName && (
                <span className={`rounded border px-1.5 py-0.5 text-[11px] ${c.priceLevelId === levelId ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
                  {c.priceLevelId === levelId ? 'Already on this list' : `On ${c.priceLevelName}`}
                </span>
              )}
            </label>
          );
        })}
        {(page.content || []).length === 0 && <p className="p-2 text-xs text-slate-500">No customers found.</p>}
      </div>
      {page.totalElements > (page.content || []).length && <p className="text-xs text-slate-400">Showing the first {(page.content || []).length} of {page.totalElements}; search to narrow.</p>}
    </div>
  );
}

export function AssignPriceListDialog({ open, onClose, levels, presetLevelId, onAssigned }) {
  const lists = useMemo(() => levels.filter((l) => l.active && !l.systemDefault), [levels]);
  const [levelId, setLevelId] = useState('');
  const [selected, setSelected] = useState([]);
  const [group, setGroup] = useState('');
  const [wholeGroup, setWholeGroup] = useState(false);
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLevelId(presetLevelId ? String(presetLevelId) : '');
    setSelected([]); setGroup(''); setWholeGroup(false);
    listCustomerGroups().then(setGroups).catch(() => setGroups([]));
  }, [open, presetLevelId]);

  const level = lists.find((l) => String(l.id) === levelId);
  const submit = async () => {
    if (!levelId) { toast.error('Please select a price list.'); return; }
    if (selected.length === 0 && !(wholeGroup && group)) { toast.error('Please select at least one customer.'); return; }
    setBusy(true);
    try {
      const res = await assignLevelToCustomers(Number(levelId), {
        customerIds: selected.map((c) => c.id), customerGroup: wholeGroup && group ? group : undefined, assign: true,
      });
      clearCustomerPricingStatusCache();
      toast.success(`Price list assigned to ${res.updated} customer${res.updated === 1 ? '' : 's'}${res.unchanged ? ` (${res.unchanged} already on it)` : ''}.`);
      onAssigned();
    } catch (err) {
      toast.error(errorText(err, 'The price list could not be assigned.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" testId="assign-dialog" title="Assign Price List to Customers"
      description="Customers on a price list are charged its prices in POS and on every sales document (their own negotiated prices still win). A customer is on one list at a time."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={btn.primary} disabled={busy || !levelId || (selected.length === 0 && !(wholeGroup && group))} onClick={submit}><Users size={16} /> Assign Price List</button>
      </>}>
      <Field label="Select price list *">
        <select aria-label="Price list" className={inputClass} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">Choose price list</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.productPriceCount} products</option>)}
        </select>
      </Field>
      {lists.length === 0 && <p className="text-sm text-slate-600">Create a customer price list first.</p>}
      {level?.description && <p className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">{level.description}</p>}
      <CustomerChooser selected={selected} setSelected={setSelected} group={group} setGroup={setGroup} groups={groups} levelId={level?.id} />
      {group && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={wholeGroup} onChange={(e) => setWholeGroup(e.target.checked)} />
          Assign every customer in the &quot;{group}&quot; group
        </label>
      )}
      {(selected.length > 0 || (wholeGroup && group)) && (
        <p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs font-medium text-blue-800">
          This price list will be assigned to {selected.length} selected customer{selected.length === 1 ? '' : 's'}{wholeGroup && group ? ` and every customer in "${group}"` : ''}.
        </p>
      )}
    </Modal>
  );
}

/** The customers on one price list, with removal. */
export function LevelCustomersDialog({ open, onClose, level, canEdit, onAdd, onChanged }) {
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ content: [], totalElements: 0 });
  const [version, setVersion] = useState(0);
  const close = () => { setSearch(''); onClose(); };

  useEffect(() => {
    if (!open || !level) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      listLevelCustomers({ levelId: level.id, search, size: 100 })
        .then((res) => { if (!cancelled) setData(res || { content: [] }); })
        .catch((err) => { if (!cancelled) toast.error(errorText(err, 'Customers could not be loaded.')); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, level, search, version]);

  const remove = async (c) => {
    try {
      await assignLevelToCustomers(level.id, { customerIds: [c.id], assign: false });
      clearCustomerPricingStatusCache();
      toast.success(`${c.name} removed from ${level.name}.`);
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      toast.error(errorText(err, 'The customer could not be removed.'));
    }
  };

  return (
    <Modal open={open} onClose={close} size="lg" testId="level-customers-dialog" title={level ? `Customers on ${level.name}` : 'Customers'}
      description={`${data.totalElements ?? 0} customer${data.totalElements === 1 ? '' : 's'} on this price list.`}
      footer={<>
        <button type="button" className={btn.outline} onClick={close}>Close</button>
        {canEdit && level?.active && <button type="button" className={btn.primary} onClick={() => onAdd(level)}><Plus size={16} /> Add customers</button>}
      </>}>
      <input aria-label="Search list customers" className={inputClass} placeholder="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        {(data.content || []).map((c) => (
          <div key={c.id} className="flex items-center gap-3 border-b border-slate-100 p-2 last:border-0">
            <div className="flex-1"><p className="font-medium text-slate-900">{c.name} <span className="font-mono text-xs text-slate-400">{c.code}</span></p>
              <p className="text-xs text-slate-500">{[c.group, c.mobile].filter(Boolean).join(' • ') || '—'}</p></div>
            {canEdit && <button type="button" className={btn.ghost} title="Remove from list" aria-label={`Remove ${c.name} from list`} onClick={() => remove(c)}><UserMinus size={16} /></button>}
          </div>
        ))}
        {(data.content || []).length === 0 && <p className="p-3 text-sm text-slate-500">No customers on this price list.</p>}
      </div>
    </Modal>
  );
}
