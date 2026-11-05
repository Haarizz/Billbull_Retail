import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';
import { History, Shield, Upload } from 'lucide-react';
import {
  bulkUpdateLevelPrices,
  getPriceMatrix,
  getProductPriceHistory,
  importLevelPrices,
  savePricingRules,
} from '@billbull/shared/api/pricingApi';
import QuantityTiersTab from '../QuantityTiersTab';
import {
  BranchSelect, BulkSummary, Field, Modal, ROUNDING_STEPS, btn, errorText, inputClass, money,
} from './pricingUi';

const ACTIONS = [
  ['INCREASE_PERCENT', 'Increase by %'],
  ['DECREASE_PERCENT', 'Decrease by %'],
  ['INCREASE_AMOUNT', 'Increase by amount'],
  ['DECREASE_AMOUNT', 'Decrease by amount'],
  ['SET_MARGIN', 'Set margin on cost %'],
  ['SET_MARKUP', 'Set markup on cost %'],
  ['SET_PRICE', 'Set a fixed price'],
];
const COST_ACTIONS = new Set(['SET_MARGIN', 'SET_MARKUP']);
const BASIS_ACTIONS = new Set(['INCREASE_PERCENT', 'DECREASE_PERCENT', 'INCREASE_AMOUNT', 'DECREASE_AMOUNT']);

/** Bulk change of level prices, previewed (dry run) before it is applied. */
export function BulkUpdateDialog({ open, onClose, levels, filters, branches, isAllBranches, branchId, rules, costVisible, currency, onApplied }) {
  const priceable = useMemo(() => levels.filter((l) => l.active && !l.systemDefault), [levels]);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      levelIds: priceable.map((l) => l.id), action: 'INCREASE_PERCENT', basis: 'LEVEL', value: '',
      roundTo: rules?.roundTo != null ? Number(rules.roundTo).toFixed(2) : '0.01',
      branch: branchId || (isAllBranches ? '' : String(branches?.[0]?.id ?? '')),
      scope: filters?.active ? 'FILTERED' : 'ALL', onlyExisting: false,
    });
    setPreview(null);
  }, [open, priceable, rules, branchId, isAllBranches, branches, filters]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setPreview(null); };
  const body = (dryRun) => ({
    priceLevelIds: form.levelIds,
    branchId: form.branch === '' ? null : Number(form.branch),
    action: form.action,
    basis: BASIS_ACTIONS.has(form.action) ? form.basis : 'BASE',
    value: Number(form.value),
    roundTo: Number(form.roundTo),
    onlyExisting: form.onlyExisting,
    search: form.scope === 'FILTERED' ? filters?.search || undefined : undefined,
    departmentId: form.scope === 'FILTERED' && filters?.departmentId ? Number(filters.departmentId) : undefined,
    brandId: form.scope === 'FILTERED' && filters?.brandId ? Number(filters.brandId) : undefined,
    dryRun,
  });

  const run = async (dryRun) => {
    if (!form.levelIds?.length) { toast.error('Choose at least one price level.'); return; }
    if (form.value === '' || !(Number(form.value) >= 0)) { toast.error('Enter a value of zero or more.'); return; }
    setBusy(true);
    try {
      const res = await bulkUpdateLevelPrices(body(dryRun));
      setPreview(res);
      if (!dryRun) {
        toast.success(`${res.changed} price${res.changed === 1 ? '' : 's'} updated.`);
        onApplied();
      }
    } catch (err) {
      toast.error(errorText(err, 'The bulk update failed.'));
    } finally {
      setBusy(false);
    }
  };

  const isPercent = form.action?.includes('PERCENT') || COST_ACTIONS.has(form.action);
  return (
    <Modal open={open} onClose={onClose} size="lg" testId="bulk-update-dialog" title="Bulk Price Update"
      description="Change many level prices at once. Preview first; nothing is saved until you apply."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Close</button>
        <button type="button" className={btn.outline} disabled={busy} onClick={() => run(true)}>Preview</button>
        <button type="button" className={btn.primary} disabled={busy || !preview || preview.applied || preview.changed === 0} onClick={() => run(false)}>
          Apply {preview && !preview.applied ? `(${preview.changed})` : ''}
        </button>
      </>}>
      {priceable.length === 0 ? <p className="text-sm text-slate-600">Create and activate a price level first.</p> : (
        <>
          <Field label="Apply to price levels">
            <div className="flex flex-wrap gap-3 rounded-md border border-slate-200 p-2">
              {priceable.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 text-sm font-normal text-slate-700">
                  <input type="checkbox" checked={form.levelIds?.includes(l.id) || false}
                    onChange={(e) => set('levelIds', e.target.checked ? [...form.levelIds, l.id] : form.levelIds.filter((x) => x !== l.id))} />
                  {l.name}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Action">
              <select aria-label="Bulk action" className={inputClass} value={form.action || ''} onChange={(e) => set('action', e.target.value)}>
                {ACTIONS.filter(([a]) => costVisible || !COST_ACTIONS.has(a)).map(([a, label]) => <option key={a} value={a}>{label}</option>)}
              </select>
            </Field>
            {BASIS_ACTIONS.has(form.action) && (
              <Field label="Starting from">
                <select aria-label="Price basis" className={inputClass} value={form.basis} onChange={(e) => set('basis', e.target.value)}>
                  <option value="LEVEL">The level&apos;s current price</option>
                  <option value="BASE">The retail (default) price</option>
                  {costVisible && <option value="COST">The cost</option>}
                </select>
              </Field>
            )}
            <Field label={isPercent ? 'Percentage' : `Amount (${currency})`}>
              <input aria-label="Bulk value" inputMode="decimal" className={`${inputClass} text-right`} value={form.value || ''} onChange={(e) => set('value', e.target.value)} placeholder={isPercent ? '5.0' : '0.00'} />
            </Field>
            <Field label="Round to">
              <select aria-label="Round to" className={inputClass} value={form.roundTo || '0.01'} onChange={(e) => set('roundTo', e.target.value)}>
                {ROUNDING_STEPS.map((s) => <option key={s} value={s}>{s} {currency}</option>)}
              </select>
            </Field>
            <Field label="Prices for">
              <BranchSelect value={form.branch ?? ''} onChange={(v) => set('branch', v)} branches={branches} isAllBranches={isAllBranches} label="Bulk branch" />
            </Field>
            <Field label="Products">
              <select aria-label="Bulk product scope" className={inputClass} value={form.scope || 'ALL'} onChange={(e) => set('scope', e.target.value)}>
                <option value="ALL">All products</option>
                {filters?.active && <option value="FILTERED">Products matching the current filters</option>}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.onlyExisting || false} onChange={(e) => set('onlyExisting', e.target.checked)} />
            Only products that already have a price under the level
          </label>
          {rules?.blockBelowCost && <p className="text-xs text-amber-700">Prices below cost are skipped (pricing rules block selling below cost).</p>}
          <BulkSummary result={preview} currency={currency} columns={preview ? [
            [preview.applied ? 'Updated' : 'Will change', preview.changed], ['Unchanged', preview.unchanged],
            ['Skipped', preview.skipped], ['Products', preview.products],
          ] : []} />
        </>
      )}
    </Modal>
  );
}

// ── Excel export / import ──────────────────────────────────────────────────────────────────────

const levelColumns = (levels) => levels.filter((l) => l.active && !l.systemDefault);

/** Downloads every product matching the filters with its level prices (all pages). */
export async function exportPriceMatrix({ filters, branchId, levels, costVisible, currency }) {
  const cols = levelColumns(levels);
  const rows = [];
  let page = 0;
  let totalPages = 1;
  while (page < totalPages && rows.length < 20000) {
    // eslint-disable-next-line no-await-in-loop
    const data = await getPriceMatrix({ ...filters, branchId: branchId || undefined, page, size: 200 });
    rows.push(...(data?.content || []));
    totalPages = data?.totalPages ?? 0;
    page += 1;
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BillBull';
  const ws = wb.addWorksheet('Price Levels');
  const header = ['Product Code', 'Product Name', 'Department', 'Brand', ...(costVisible ? ['Cost'] : []), `Retail Price (${currency})`, ...cols.map((l) => l.name)];
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4BF' } };
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
  for (const p of rows) {
    const cell = (levelId) => {
      const own = (p.prices || []).find((x) => x.priceLevelId === levelId && String(x.branchId ?? '') === String(branchId || ''));
      return own ? Number(own.price) : null;
    };
    ws.addRow([p.code, p.name, p.departmentName || '', p.brandName || '', ...(costVisible ? [p.cost != null ? Number(p.cost) : null] : []),
      p.basePrice != null ? Number(p.basePrice) : null, ...cols.map((l) => cell(l.id))]);
  }
  header.forEach((_, i) => { ws.getColumn(i + 1).width = i === 1 ? 36 : 16; });
  const help = wb.addWorksheet('Read me');
  [
    ['How to import'],
    ['Edit prices in the level columns (one column per price level, headed by its name or code) and import the file on the Price Levels page.'],
    ['Product Code identifies the product. Other columns (name, cost, retail price) are ignored on import.'],
    [`Prices are for ${branchId ? 'the branch selected when exporting' : 'all branches'}; choose the branch again when importing.`],
    ['Blank cells are left alone unless you tick "Blank cells remove the price" when importing.'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 120;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `price-levels-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}

const cellText = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.result != null) return String(v.result);
    if (v.text != null) return String(v.text);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  }
  return String(v).trim();
};

function parseCsv(text) {
  const out = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); out.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); out.push(row); }
  return out;
}

/** Reads an .xlsx / .csv into a header row + data rows of strings. */
async function readSheet(file) {
  if (/\.csv$/i.test(file.name)) {
    const rows = parseCsv(await file.text());
    return { header: (rows[0] || []).map((h) => h.trim()), rows: rows.slice(1).map((r, i) => ({ n: i + 2, cells: r.map((c) => c.trim()) })) };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { header: [], rows: [] };
  const header = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { header[col - 1] = cellText(c.value); });
  const rows = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const cells = [];
    r.eachCell({ includeEmpty: true }, (c, col) => { cells[col - 1] = cellText(c.value); });
    rows.push({ n, cells });
  });
  return { header, rows };
}

/** Turns a wide sheet (one column per level) into import rows. Exported for tests. */
export function sheetToImportRows({ header, rows }, levels, { blankClears }) {
  const lower = header.map((h) => (h || '').trim().toLowerCase());
  const codeCol = lower.findIndex((h) => h === 'product code' || h === 'code' || h === 'item code');
  if (codeCol < 0) throw new Error('The first row must have a "Product Code" column.');
  const byKey = new Map();
  levelColumns(levels).forEach((l) => { byKey.set(l.name.toLowerCase(), l); byKey.set((l.code || '').toLowerCase(), l); });
  const cols = lower.map((h, i) => (byKey.has(h) ? { i, level: byKey.get(h) } : null)).filter(Boolean);
  if (cols.length === 0) throw new Error('No column is headed with the name or code of an active price level.');
  const out = [];
  for (const r of rows) {
    const code = (r.cells[codeCol] || '').trim();
    if (!code) continue;
    for (const c of cols) {
      const v = (r.cells[c.i] || '').trim();
      if (v === '' && !blankClears) continue;
      out.push({ row: r.n, productCode: code, priceLevel: c.level.name, price: v });
    }
  }
  return { rows: out, levelNames: cols.map((c) => c.level.name) };
}

export function ImportDialog({ open, onClose, levels, branches, isAllBranches, branchId, onImported }) {
  const [file, setFile] = useState(null);
  const [branch, setBranch] = useState('');
  const [blankClears, setBlankClears] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null); setParsed(null); setResult(null); setBlankClears(false);
    setBranch(branchId || (isAllBranches ? '' : String(branches?.[0]?.id ?? '')));
  }, [open, branchId, isAllBranches, branches]);

  const parse = async (f, clears = blankClears) => {
    setResult(null);
    if (!f) { setParsed(null); return; }
    try {
      setParsed(sheetToImportRows(await readSheet(f), levels, { blankClears: clears }));
    } catch (err) {
      setParsed(null);
      toast.error(errorText(err, 'The file could not be read.'));
    }
  };

  const run = async (dryRun) => {
    if (!parsed?.rows.length) { toast.error('The file has no prices to import.'); return; }
    setBusy(true);
    try {
      const res = await importLevelPrices({ branchId: branch === '' ? null : Number(branch), rows: parsed.rows, dryRun });
      setResult(res);
      if (!dryRun) {
        toast.success(`${res.applied} price${res.applied === 1 ? '' : 's'} imported${res.cleared ? `, ${res.cleared} removed` : ''}.`);
        onImported();
      }
    } catch (err) {
      toast.error(errorText(err, 'The import failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" testId="import-dialog" title="Import Level Prices"
      description="Upload an Excel (.xlsx) or CSV file with a Product Code column and one column per price level. Tip: export first to get the layout."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>Close</button>
        <button type="button" className={btn.outline} disabled={busy || !parsed} onClick={() => run(true)}>Check file</button>
        <button type="button" className={btn.primary} disabled={busy || !result || !result.dryRun} onClick={() => run(false)}><Upload size={16} /> Import</button>
      </>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="File">
          <input aria-label="Import file" type="file" accept=".xlsx,.csv" className="text-sm"
            onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); parse(f); }} />
        </Field>
        <Field label="Prices are for">
          <BranchSelect value={branch} onChange={(v) => { setBranch(v); setResult(null); }} branches={branches} isAllBranches={isAllBranches} label="Import branch" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={blankClears} onChange={(e) => { setBlankClears(e.target.checked); parse(file, e.target.checked); }} />
        Blank cells remove the price
      </label>
      {parsed && (
        <p className="text-sm text-slate-600" data-testid="import-parsed">
          {parsed.rows.length} price cell{parsed.rows.length === 1 ? '' : 's'} found for {parsed.levelNames.join(', ')}.
        </p>
      )}
      {result && (
        <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm" data-testid="import-result">
          <div className="text-blue-900">
            {result.dryRun ? 'Check: ' : 'Imported: '}
            <b>{result.applied}</b> to set, <b>{result.cleared}</b> to remove, <b>{result.unchanged}</b> unchanged, <b>{result.errors.length}</b> problem{result.errors.length === 1 ? '' : 's'}.
          </div>
          {result.errors.length > 0 && (
            <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs text-red-700">
              {result.errors.map((e, i) => <li key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export function GlobalRulesDialog({ open, onClose, rules, canEdit, onSaved }) {
  const [form, setForm] = useState({ minMarginPercent: '15', blockBelowCost: false, roundTo: '0.01' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || !rules) return;
    setForm({
      minMarginPercent: String(Number(rules.minMarginPercent ?? 15)),
      blockBelowCost: Boolean(rules.blockBelowCost),
      roundTo: Number(rules.roundTo ?? 0.01).toFixed(2),
    });
  }, [open, rules]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await savePricingRules({
        minMarginPercent: Number(form.minMarginPercent), blockBelowCost: form.blockBelowCost, roundTo: Number(form.roundTo),
      });
      toast.success('Global pricing rules updated.');
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, 'The rules could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" testId="rules-dialog" title="Global Pricing Rules"
      description="Margin alerts and margin protection for every price level and customer price."
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</button>
        {canEdit && <button type="button" className={btn.primary} disabled={saving} onClick={save}><Shield size={16} /> Save Rules</button>}
      </>}>
      <Field label="Minimum margin threshold (%)" hint="Prices with a lower gross margin are flagged as margin alerts">
        <input aria-label="Minimum margin" inputMode="decimal" disabled={!canEdit} className={inputClass} value={form.minMarginPercent}
          onChange={(e) => setForm((f) => ({ ...f, minMarginPercent: e.target.value }))} />
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" disabled={!canEdit} checked={form.blockBelowCost} onChange={(e) => setForm((f) => ({ ...f, blockBelowCost: e.target.checked }))} />
        <span><span className="flex items-center gap-1 font-medium"><Shield size={14} className="text-[#F5C742]" /> Margin protector</span>
          <span className="text-xs text-slate-500">Refuse level prices and customer prices below the product&apos;s cost.</span></span>
      </label>
      <Field label="Default rounding for bulk changes">
        <select aria-label="Default rounding" disabled={!canEdit} className={inputClass} value={form.roundTo} onChange={(e) => setForm((f) => ({ ...f, roundTo: e.target.value }))}>
          {ROUNDING_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Rules apply to future price changes. Existing prices are not changed, but they are flagged when they break the margin threshold.
      </p>
    </Modal>
  );
}

const KIND_LABEL = { LEVEL: 'Level price', CUSTOMER: 'Customer price', PRODUCT: 'Product price' };

export function HistoryDialog({ open, onClose, product, currency }) {
  const [loaded, setLoaded] = useState({ productId: null, rows: [] });
  useEffect(() => {
    if (!open || !product) return undefined;
    let cancelled = false;
    getProductPriceHistory(product.id)
      .then((data) => { if (!cancelled) setLoaded({ productId: product.id, rows: Array.isArray(data) ? data : [] }); })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({ productId: product.id, rows: [] });
        toast.error(errorText(err, 'History could not be loaded.'));
      });
    return () => { cancelled = true; };
  }, [open, product]);
  const rows = product && loaded.productId === product.id ? loaded.rows : null;

  return (
    <Modal open={open} onClose={onClose} size="lg" testId="history-dialog" title="Price Audit Log"
      description={product ? `${product.name} — change history` : ''}
      footer={<button type="button" className={btn.outline} onClick={onClose}>Close</button>}>
      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
        {rows == null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500"><History size={14} className="mr-1 inline" />No price changes recorded yet.</p>}
        {rows?.map((h) => (
          <div key={h.id} className="rounded-md border border-slate-200 p-3" data-testid="history-row">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{h.label}{h.branchName ? ` · ${h.branchName}` : ''}</p>
                <p className="text-xs text-slate-500">{KIND_LABEL[h.kind] || h.kind} · changed by {h.changedBy || 'system'} on {h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}</p>
              </div>
              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                {h.oldPrice == null ? 'Added' : h.newPrice == null ? 'Removed' : 'Updated'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-sm">
              <div><p className="text-xs text-slate-500">Old</p><p className="font-semibold tabular-nums text-red-600">{money(h.oldPrice, currency)}</p></div>
              <span className="text-slate-400">→</span>
              <div><p className="text-xs text-slate-500">New</p><p className="font-semibold tabular-nums text-green-600">{money(h.newPrice, currency)}</p></div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function TierDialog({ open, onClose, product, levels, levelId, canEdit, onChanged }) {
  return (
    <Modal open={open} onClose={() => { onClose(); onChanged?.(); }} size="xl" testId="tier-dialog" title="Tier Pricing Configuration"
      description={product ? `${product.name} — quantity-based pricing` : ''}
      footer={<button type="button" className={btn.outline} onClick={() => { onClose(); onChanged?.(); }}>Done</button>}>
      {product && (
        <QuantityTiersTab key={`${product.id}-${levelId ?? ''}`} levels={levels} canEdit={canEdit} embedded
          initialProduct={{ productId: product.id, productCode: product.code, productName: product.name }}
          initialLevelId={levelId} />
      )}
    </Modal>
  );
}
