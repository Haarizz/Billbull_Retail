import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    X, Printer, Barcode, Filter, Search, CheckCircle, Minus, Plus, Tag, Layers,
    Building2, Package, RefreshCw, Loader, ListPlus, AlertCircle, ScanLine,
} from 'lucide-react';
import { getDepartments, getSubDepartmentsByDepartment } from "@billbull/shared/api/departmentsApi";
import { getSubDepartments } from "@billbull/shared/api/subDepartmentsApi";
import { getProductCategories } from "@billbull/shared/api/productCategoriesApi";
import {
    LARGE_JOB_LABELS,
    MAX_COPIES,
    PRINT_METHODS,
    clampCopies,
    initialBulkQty,
} from './barcodePrintSettings';
import {
    BROWSER_PRINT_TARGET,
    categoryOf,
    departmentOf,
    nameOf,
    pickScanMatch,
    productBarcodeOptions,
    subDepartmentOf,
} from './quickPrintHelpers';

const QtyStepper = ({ value, onChange, min = 0, label }) => (
    <div className="inline-flex items-center gap-1">
        <button
            type="button"
            aria-label={`Decrease ${label}`}
            onClick={() => onChange(Math.max(min, (Number(value) || 0) - 1))}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            disabled={(Number(value) || 0) <= min}
        >
            <Minus size={14} />
        </button>
        <input
            type="number"
            inputMode="numeric"
            aria-label={label}
            min={min}
            max={MAX_COPIES}
            value={value}
            onChange={e => onChange(e.target.value === '' ? '' : clampCopies(e.target.value, min))}
            onBlur={e => onChange(clampCopies(e.target.value, min))}
            className="h-7 w-12 text-center text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
            type="button"
            aria-label={`Increase ${label}`}
            onClick={() => onChange(Math.min(MAX_COPIES, (Number(value) || 0) + 1))}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
            <Plus size={14} />
        </button>
    </div>
);

/** A resolved label price, or why there is none (no other price is shown in its place). */
const LabelPriceText = ({ shown, currencyLabel, compact = false }) => {
    if (shown?.status === 'ok') {
        return (
            <div className={compact ? '' : 'text-sm font-semibold text-emerald-700'} data-testid="quick-label-price">
                {currencyLabel} {shown.amount}
                {!compact && shown.sourceLabel && <span className="ml-1 text-[10px] font-normal text-slate-500">{shown.sourceLabel}</span>}
            </div>
        );
    }
    return (
        <div className={`${compact ? '' : 'text-sm '}${shown?.status === 'pending' ? 'text-slate-400' : 'text-red-600 font-semibold'}`} title={shown?.message} data-testid="quick-label-price">
            {shown?.status === 'pending' ? 'Loading…' : 'Unavailable'}
        </div>
    );
};

const Chip = ({ children }) => children ? (
    <span className="inline-block text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 max-w-full truncate">{children}</span>
) : null;

/**
 * Quick Barcode Print: scan (or search) one item and print labels for it straight away, or
 * load every item in a department / sub-department / category and print or queue them in bulk.
 *
 * All rendering and printing goes through the parent page so labels are byte-identical to
 * those printed from the queue: the same templates, preview renderer, ZPL builder and printer
 * resolution.
 */
const QuickBarcodePrintDialog = ({
    open,
    onClose,
    templates,
    initialTemplateId,
    settings,
    branchSelected,
    printers,
    printersLoading,
    currencyLabel,
    formatPrice,
    // (template, entry) => labelPriceDisplay(...) — the server-resolved label price; when given,
    // the dialog shows that instead of the product's retail price.
    labelPriceOf,
    searchProducts,
    loadByClassification,
    makeEntry,
    renderPreview,
    refreshPreviewBarcodes,
    onPrint,
    onAddToQueue,
    onOpenSettings,
}) => {
    // Mounted only while open, so every visit starts from the configured defaults.
    const [tab, setTab] = useState('scan');
    const [templateId, setTemplateId] = useState(initialTemplateId);
    const [pickedTarget, setTarget] = useState(null); // null = not chosen here; follow the settings
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null); // { kind: 'ok' | 'error', text }
    const [pendingConfirm, setPendingConfirm] = useState(null); // { entries, count }

    // Scan tab
    const [term, setTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState(null); // { product, barcode, unit }
    const [copies, setCopies] = useState(settings.defaultCopies);
    const scanInputRef = useRef(null);
    const searchSeq = useRef(0);
    const previewRef = useRef(null);

    // Bulk tab
    const [departments, setDepartments] = useState([]);
    const [subDepartments, setSubDepartments] = useState([]);
    const [categories, setCategories] = useState([]);
    const [mastersLoaded, setMastersLoaded] = useState(false);
    const [filters, setFilters] = useState({ departmentId: '', subDepartmentId: '', category: '' });
    const [rows, setRows] = useState(null); // null = not loaded yet
    const [rowsTotal, setRowsTotal] = useState(0);
    const [rowsLoading, setRowsLoading] = useState(false);

    const template = useMemo(
        () => templates.find(t => String(t.id) === String(templateId)) || templates[0] || null,
        [templates, templateId]
    );

    // Until the user picks one here: the browser dialog if that is the configured method,
    // else the saved printer once it shows up in the branch's list, else the branch default.
    const target = (() => {
        if (pickedTarget != null) return pickedTarget;
        if (settings.printMethod === PRINT_METHODS.BROWSER) return BROWSER_PRINT_TARGET;
        const saved = settings.preferredPrinterId;
        return saved != null && printers.some(p => String(p.id) === String(saved)) ? String(saved) : '';
    })();

    // Debounced suggestions while typing.
    useEffect(() => {
        if (!open) return undefined;
        const q = term.trim();
        if (!q) { searchSeq.current++; setSuggestions([]); setSearching(false); return undefined; }
        const id = setTimeout(async () => {
            const seq = ++searchSeq.current;
            setSearching(true);
            try {
                const found = await searchProducts(q);
                if (seq === searchSeq.current) setSuggestions(found);
            } catch {
                if (seq === searchSeq.current) setSuggestions([]);
            } finally {
                if (seq === searchSeq.current) setSearching(false);
            }
        }, 300);
        return () => clearTimeout(id);
    }, [term, open, searchProducts]);

    // Barcode SVGs in the preview are drawn imperatively (JsBarcode), after React renders them.
    useEffect(() => {
        if (!open || tab !== 'scan' || !selected || !template) return undefined;
        const id = setTimeout(() => refreshPreviewBarcodes(previewRef.current, template), 0);
        return () => clearTimeout(id);
    });

    // Department / sub-department / category masters, on first visit to the bulk tab.
    useEffect(() => {
        if (!open || tab !== 'bulk' || mastersLoaded) return;
        setMastersLoaded(true);
        getDepartments().then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => setDepartments([]));
        getProductCategories().then(c => setCategories(Array.isArray(c) ? c : [])).catch(() => setCategories([]));
    }, [open, tab, mastersLoaded]);

    useEffect(() => {
        if (!open || tab !== 'bulk') return undefined;
        let cancelled = false;
        const load = filters.departmentId
            ? getSubDepartmentsByDepartment(filters.departmentId)
            : getSubDepartments();
        load.then(s => { if (!cancelled) setSubDepartments(Array.isArray(s) ? s : []); })
            .catch(() => { if (!cancelled) setSubDepartments([]); });
        return () => { cancelled = true; };
    }, [open, tab, filters.departmentId]);

    const isBrowser = target === BROWSER_PRINT_TARGET;
    const zebraBlocked = !isBrowser && !branchSelected;

    const runPrint = useCallback(async (entries, { force = false } = {}) => {
        const count = entries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0);
        if (!template || count === 0) return false;
        if (!force && settings.confirmLargeJobs && count > LARGE_JOB_LABELS) {
            setPendingConfirm({ entries, count });
            return false;
        }
        setPendingConfirm(null);
        setBusy(true);
        setNotice(null);
        try {
            await onPrint(entries, template, {
                method: isBrowser ? PRINT_METHODS.BROWSER : PRINT_METHODS.ZEBRA,
                printerId: isBrowser || !target ? null : target,
            });
            setNotice({
                kind: 'ok',
                text: isBrowser
                    ? `Opened the print dialog for ${count} label${count === 1 ? '' : 's'}.`
                    : `Sent ${count} label${count === 1 ? '' : 's'} to the printer.`,
            });
            return true;
        } catch (err) {
            setNotice({ kind: 'error', text: err?.message || 'Printing failed.' });
            return false;
        } finally {
            setBusy(false);
        }
    }, [template, settings.confirmLargeJobs, onPrint, isBrowser, target]);

    const choose = (match) => {
        if (!match) return;
        setSelected({ product: match.product, barcode: match.barcode, unit: match.unit });
        setSuggestions([]);
        setTerm('');
        searchSeq.current++;
    };

    const resetScan = () => {
        setSelected(null);
        setTerm('');
        setSuggestions([]);
        setCopies(settings.defaultCopies);
        scanInputRef.current?.focus();
    };

    const onScanEnter = async () => {
        const q = term.trim();
        if (!q) return;
        searchSeq.current++; // a debounced reply must not reopen the list after we act
        setSearching(true);
        let found = suggestions;
        try {
            found = await searchProducts(q);
        } catch {
            // fall back to whatever suggestions we already had
        } finally {
            setSearching(false);
        }
        const match = pickScanMatch(found, q);
        if (!match) {
            setSuggestions(found);
            setNotice({ kind: 'error', text: found.length ? `Several items match "${q}" — pick one below.` : `No item with a barcode matches "${q}".` });
            return;
        }
        setNotice(null);
        choose(match);
        if (match.exactBarcode && settings.autoPrintOnScan && !zebraBlocked) {
            const qty = clampCopies(settings.defaultCopies);
            const ok = await runPrint([makeEntry(match.product, qty, { barcode: match.barcode, unit: match.unit })]);
            if (ok) {
                setSelected(null);
                setTimeout(() => scanInputRef.current?.focus(), 0);
            }
        }
    };

    const selectedEntry = selected
        ? makeEntry(selected.product, clampCopies(copies), { barcode: selected.barcode, unit: selected.unit })
        : null;

    // ---------- bulk ----------
    const loadRows = async () => {
        setRowsLoading(true);
        setNotice(null);
        try {
            const { items, total } = await loadByClassification({
                departmentId: filters.departmentId || null,
                subDepartmentId: filters.subDepartmentId || null,
                category: filters.category || null,
            });
            setRows(items.map(product => {
                const first = productBarcodeOptions(product)[0];
                const qty = first ? initialBulkQty(settings.bulkQtyMode, product.stock) : 0;
                return {
                    key: String(product.id),
                    product,
                    barcode: first?.barcode || null,
                    unit: first?.unit || null,
                    qty,
                    selected: qty > 0,
                };
            }));
            setRowsTotal(total);
        } catch (err) {
            setRows([]);
            setRowsTotal(0);
            setNotice({ kind: 'error', text: err?.response?.data?.message || err?.message || 'Could not load items.' });
        } finally {
            setRowsLoading(false);
        }
    };

    const resetFilters = () => {
        setFilters({ departmentId: '', subDepartmentId: '', category: '' });
        setRows(null);
        setRowsTotal(0);
        setNotice(null);
    };

    const updateRow = (key, patch) => setRows(prev => prev.map(r => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if ('qty' in patch && !('selected' in patch)) next.selected = (Number(next.qty) || 0) > 0;
        if (patch.selected === true && !(Number(next.qty) > 0)) next.qty = Math.max(1, initialBulkQty(settings.bulkQtyMode, r.product.stock));
        return next;
    }));

    const printableRows = (rows || []).filter(r => r.barcode);
    const chosenRows = printableRows.filter(r => r.selected && Number(r.qty) > 0);
    const allChosen = printableRows.length > 0 && printableRows.every(r => r.selected);
    const bulkLabelCount = chosenRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    const bulkEntries = () => chosenRows.map(r => makeEntry(r.product, clampCopies(r.qty), { barcode: r.barcode, unit: r.unit }));

    const setAllSelected = (on) => setRows(prev => prev.map(r => {
        if (!r.barcode) return r;
        if (!on) return { ...r, selected: false };
        return { ...r, selected: true, qty: Number(r.qty) > 0 ? r.qty : Math.max(1, initialBulkQty(settings.bulkQtyMode, r.product.stock)) };
    }));
    const setSelectedQty = (mode) => setRows(prev => prev.map(r => {
        if (!r.barcode || !r.selected) return r;
        const qty = mode === 'stock' ? initialBulkQty('stock', r.product.stock) : 1;
        return { ...r, qty, selected: qty > 0 };
    }));

    const addBulkToQueue = () => {
        const entries = bulkEntries();
        if (!entries.length) return;
        onAddToQueue(entries);
        setNotice({ kind: 'ok', text: `Added ${bulkLabelCount} label${bulkLabelCount === 1 ? '' : 's'} (${entries.length} item${entries.length === 1 ? '' : 's'}) to the print queue.` });
    };

    if (!open) return null;

    const selectCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 focus:border-[#F5C742]';
    const tabCls = (active) => `flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;
    const barcodeOptions = selected ? productBarcodeOptions(selected.product) : [];

    const printerPicker = (id) => (
        <select id={id} className={selectCls} value={target} onChange={e => setTarget(e.target.value)} disabled={busy}>
            <option value="">{branchSelected ? 'Branch default label printer' : 'Label printer (select a branch first)'}</option>
            {printers.map(p => (
                <option key={p.id} value={String(p.id)}>
                    {p.deviceName || p.modelName || p.systemPrinterName || `Printer #${p.id}`}{p.defaultPrinter ? ' (default)' : ''}
                </option>
            ))}
            <option value={BROWSER_PRINT_TARGET}>Browser print dialog</option>
        </select>
    );

    const templatePicker = (id) => (
        <select id={id} className={selectCls} value={template ? String(template.id) : ''} onChange={e => setTemplateId(e.target.value)} disabled={busy}>
            {templates.map(t => (
                <option key={t.id} value={String(t.id)}>{t.name} ({t.width}×{t.height}mm)</option>
            ))}
        </select>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/50" role="dialog" aria-modal="true" aria-labelledby="bb-quick-print-title">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-slate-200">
                    <div>
                        <h3 id="bb-quick-print-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Printer size={18} className="text-emerald-600" /> Quick Barcode Print
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Scan items or bulk print by department / category</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl" role="tablist">
                        <button role="tab" aria-selected={tab === 'scan'} className={tabCls(tab === 'scan')} onClick={() => { setTab('scan'); setNotice(null); setTimeout(() => scanInputRef.current?.focus(), 0); }}>
                            <Barcode size={16} /> Scan &amp; Print
                        </button>
                        <button role="tab" aria-selected={tab === 'bulk'} className={tabCls(tab === 'bulk')} onClick={() => { setTab('bulk'); setNotice(null); }}>
                            <Filter size={16} /> Bulk Print by Category
                        </button>
                    </div>

                    {zebraBlocked && (
                        <div className="flex items-start gap-2 text-xs text-amber-900 bg-[#FFF8E7] border border-[#FDE6A9] rounded-lg px-3 py-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>Select a branch to print on its label printer, or choose "Browser print dialog" as the printer.</span>
                        </div>
                    )}

                    {notice && (
                        <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${notice.kind === 'ok' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`} role="status">
                            {notice.kind === 'ok' ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
                            <span className="whitespace-pre-line">{notice.text}</span>
                        </div>
                    )}

                    {pendingConfirm && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <span className="text-amber-900">Print <strong>{pendingConfirm.count}</strong> labels? This is a large job.</span>
                            <div className="flex gap-2">
                                <button onClick={() => setPendingConfirm(null)} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg">Cancel</button>
                                <button onClick={() => runPrint(pendingConfirm.entries, { force: true })} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Print {pendingConfirm.count}</button>
                            </div>
                        </div>
                    )}

                    {tab === 'scan' ? (
                        <>
                            {/* Scan box */}
                            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-sky-50/60 p-4">
                                <label htmlFor="bb-qp-scan" className="text-sm font-medium text-slate-800 flex items-center gap-2 mb-2">
                                    <ScanLine size={16} /> Scan Barcode or Search Item
                                </label>
                                <div className="flex gap-2 relative">
                                    <div className="relative flex-1">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            id="bb-qp-scan"
                                            ref={scanInputRef}
                                            autoFocus
                                            value={term}
                                            onChange={e => setTerm(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onScanEnter(); } }}
                                            placeholder="Scan barcode or type item name / SKU / code…"
                                            autoComplete="off"
                                            className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                        />
                                        {searching && <Loader size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={resetScan}
                                        aria-label="Clear"
                                        className="h-[42px] w-[42px] flex items-center justify-center border border-slate-200 rounded-lg bg-white text-slate-500 hover:text-slate-800"
                                    >
                                        <X size={16} />
                                    </button>

                                    {suggestions.length > 0 && (
                                        <ul className="absolute left-0 right-12 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-10" role="listbox">
                                            {suggestions.map(p => {
                                                const first = productBarcodeOptions(p)[0];
                                                return (
                                                    <li key={p.id}>
                                                        <button
                                                            type="button"
                                                            className="w-full text-left px-3 py-2 hover:bg-[#FFF8E7] flex items-center justify-between gap-3"
                                                            onMouseDown={e => { e.preventDefault(); choose({ product: p, barcode: first?.barcode, unit: first?.unit }); }}
                                                        >
                                                            <span className="min-w-0">
                                                                <span className="block text-sm font-medium text-slate-900 truncate">{p.name}</span>
                                                                <span className="block text-[11px] text-slate-500 font-mono truncate">{p.code}{first ? ` · ${first.barcode}` : ''}</span>
                                                            </span>
                                                            <span className="text-xs text-slate-600 shrink-0">{currencyLabel} {formatPrice(p.price)}</span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-2">
                                    Scan with a barcode scanner or type a product name, SKU or barcode and press Enter.
                                    {settings.autoPrintOnScan && ' Exact barcode scans print straight away.'}
                                </p>
                            </div>

                            {!selected ? (
                                <div className="rounded-xl border-2 border-dashed border-slate-200 py-10 px-4 text-center">
                                    <Barcode size={44} className="mx-auto text-slate-300" />
                                    <p className="mt-3 text-sm font-medium text-slate-700">Ready to Scan</p>
                                    <p className="text-xs text-slate-500 mt-1">Use a barcode scanner or type the item name / SKU to get started</p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-emerald-200 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50/70 border-b border-emerald-200">
                                        <span className="text-sm font-medium text-emerald-800 flex items-center gap-2"><CheckCircle size={16} /> Selected Item</span>
                                        <button onClick={resetScan} className="text-xs text-slate-500 hover:text-slate-800">Scan another</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4">
                                        {/* Item details */}
                                        <div className="space-y-3 min-w-0">
                                            <div>
                                                <div className="text-[11px] text-slate-500">Product Name</div>
                                                <div className="text-base font-semibold text-slate-900 break-words">{selected.product.name}</div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-[11px] text-slate-500">Item Code / SKU</div>
                                                    <div className="text-sm font-mono text-slate-800 break-all">{selected.product.code || '—'}{selected.product.sku && selected.product.sku !== selected.product.code ? ` / ${selected.product.sku}` : ''}</div>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[11px] text-slate-500">Barcode</div>
                                                    {barcodeOptions.length > 1 ? (
                                                        <select
                                                            aria-label="Barcode"
                                                            className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded-md text-xs font-mono bg-white"
                                                            value={selected.barcode}
                                                            onChange={e => {
                                                                const o = barcodeOptions.find(x => x.barcode === e.target.value);
                                                                if (o) setSelected(s => ({ ...s, barcode: o.barcode, unit: o.unit }));
                                                            }}
                                                        >
                                                            {barcodeOptions.map(o => (
                                                                <option key={o.barcode} value={o.barcode}>{o.barcode}{o.unit ? ` (${o.unit})` : ''}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <div className="text-sm font-mono text-slate-800 break-all">{selected.barcode}{selected.unit ? ` (${selected.unit})` : ''}</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-[11px] text-slate-500">{labelPriceOf ? 'Label Price' : 'Selling Price'}</div>
                                                    {labelPriceOf && template ? (
                                                        <LabelPriceText shown={labelPriceOf(template, selected)} currencyLabel={currencyLabel} />
                                                    ) : (
                                                        <div className="text-sm font-semibold text-emerald-700">{currencyLabel} {formatPrice(selected.product.price)}</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-[11px] text-slate-500">Available Units</div>
                                                    <div className="text-sm text-slate-800">{selected.product.stock ?? '—'}{selected.product.stock != null ? ' units' : ''}</div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[11px] text-slate-500 mb-1">Department · Sub-Dept · Category</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    <Chip>{departmentOf(selected.product)}</Chip>
                                                    <Chip>{subDepartmentOf(selected.product)}</Chip>
                                                    <Chip>{categoryOf(selected.product)}</Chip>
                                                    {!departmentOf(selected.product) && !subDepartmentOf(selected.product) && !categoryOf(selected.product) && (
                                                        <span className="text-xs text-slate-400">Not classified</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Print options */}
                                        <div className="space-y-3 min-w-0">
                                            <div>
                                                <label htmlFor="bb-qp-template" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1"><Tag size={13} /> Label Template</label>
                                                {templatePicker('bb-qp-template')}
                                            </div>
                                            <div>
                                                <label htmlFor="bb-qp-printer" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                                                    <Printer size={13} /> Select Printer {printersLoading && <Loader size={11} className="animate-spin" />}
                                                </label>
                                                {printerPicker('bb-qp-printer')}
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-xs font-medium text-slate-700">Number of Labels</span>
                                                <QtyStepper value={copies} onChange={setCopies} min={1} label="Number of labels" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium text-slate-700 mb-1">Label Preview</div>
                                                <div ref={previewRef} data-bb-own-barcodes="true" className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 flex justify-center overflow-hidden max-h-56">
                                                    {selectedEntry && template && renderPreview(template, { ...selectedEntry, qty: 1 })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                                onAddToQueue([selectedEntry]);
                                                setNotice({ kind: 'ok', text: `Added ${clampCopies(copies)} label${clampCopies(copies) === 1 ? '' : 's'} for ${selected.product.name} to the print queue.` });
                                                resetScan();
                                            }}
                                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <ListPlus size={16} /> Add to Queue
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || zebraBlocked || !template}
                                            onClick={async () => { if (await runPrint([selectedEntry])) resetScan(); }}
                                            className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {busy ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />}
                                            Print {clampCopies(copies)} Label{clampCopies(copies) === 1 ? '' : 's'} Now
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Filters */}
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                                <div className="text-sm font-medium text-slate-800 flex items-center gap-2 mb-3"><Filter size={16} /> Filter by Classification</div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label htmlFor="bb-qp-dept" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1"><Building2 size={13} /> Department</label>
                                        <select
                                            id="bb-qp-dept"
                                            className={selectCls}
                                            value={filters.departmentId}
                                            onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value, subDepartmentId: '' }))}
                                        >
                                            <option value="">All departments</option>
                                            {departments.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="bb-qp-subdept" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1"><Layers size={13} /> Sub-Department</label>
                                        <select
                                            id="bb-qp-subdept"
                                            className={selectCls}
                                            value={filters.subDepartmentId}
                                            onChange={e => setFilters(f => ({ ...f, subDepartmentId: e.target.value }))}
                                        >
                                            <option value="">All sub-departments</option>
                                            {subDepartments.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="bb-qp-cat" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1"><Tag size={13} /> Category</label>
                                        <select
                                            id="bb-qp-cat"
                                            className={selectCls}
                                            value={filters.category}
                                            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
                                        >
                                            <option value="">All categories</option>
                                            {categories.map(c => {
                                                const n = nameOf(c);
                                                return n ? <option key={c.id ?? n} value={n}>{n}</option> : null;
                                            })}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3">
                                    <span className="text-[11px] text-slate-500">Pick at least one filter, then load the items.</span>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={resetFilters} className="px-3 py-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
                                            <RefreshCw size={14} /> Reset Filters
                                        </button>
                                        <button
                                            type="button"
                                            onClick={loadRows}
                                            disabled={rowsLoading || (!filters.departmentId && !filters.subDepartmentId && !filters.category)}
                                            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {rowsLoading ? <Loader size={14} className="animate-spin" /> : <Search size={14} />} Load Items
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Results */}
                            {rows !== null && (
                                <div className="rounded-xl border border-slate-200 overflow-hidden">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
                                        <div>
                                            <div className="text-sm font-medium text-slate-800 flex items-center gap-2"><Package size={16} /> Filtered Items — Set Print Quantities</div>
                                            <div className="text-xs text-slate-500">
                                                {rows.length} item{rows.length === 1 ? '' : 's'} found
                                                {rowsTotal > rows.length ? ` (showing the first ${rows.length} of ${rowsTotal} — narrow the filter to see the rest)` : ''}
                                                {rows.length - printableRows.length > 0 ? ` · ${rows.length - printableRows.length} without a barcode` : ''}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button type="button" onClick={() => setSelectedQty('one')} disabled={!chosenRows.length} className="px-2.5 py-1 text-xs text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">Selected: 1 each</button>
                                            <button type="button" onClick={() => setSelectedQty('stock')} disabled={!chosenRows.length} className="px-2.5 py-1 text-xs text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">Selected: = stock</button>
                                            <span className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md">{bulkLabelCount} Labels Selected</span>
                                        </div>
                                    </div>
                                    {rows.length === 0 ? (
                                        <div className="py-10 text-center text-sm text-slate-500">No items match these filters.</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm min-w-[820px]">
                                                <thead className="bg-slate-50 text-xs text-slate-600">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left w-10">
                                                            <input type="checkbox" aria-label="Select all" className="h-4 w-4 accent-[#F5C742]" checked={allChosen} onChange={e => setAllSelected(e.target.checked)} disabled={!printableRows.length} />
                                                        </th>
                                                        <th className="px-3 py-2 text-left">Item Code / Barcode</th>
                                                        <th className="px-3 py-2 text-left">Product Name</th>
                                                        <th className="px-3 py-2 text-left">Department</th>
                                                        <th className="px-3 py-2 text-left">Sub-Dept</th>
                                                        <th className="px-3 py-2 text-left">Category</th>
                                                        <th className="px-3 py-2 text-right">Price</th>
                                                        <th className="px-3 py-2 text-right">Stock</th>
                                                        <th className="px-3 py-2 text-center">Label Qty</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {rows.map(r => (
                                                        <tr key={r.key} className={!r.barcode ? 'opacity-50' : (r.selected ? 'bg-[#FFF8E7]/60' : '')}>
                                                            <td className="px-3 py-2">
                                                                <input
                                                                    type="checkbox"
                                                                    aria-label={`Select ${r.product.name}`}
                                                                    className="h-4 w-4 accent-[#F5C742]"
                                                                    checked={r.selected}
                                                                    disabled={!r.barcode}
                                                                    onChange={e => updateRow(r.key, { selected: e.target.checked })}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <div className="text-xs font-mono text-slate-800">{r.product.code || '—'}</div>
                                                                <div className="text-[11px] font-mono text-slate-500">{r.barcode || 'No barcode'}</div>
                                                            </td>
                                                            <td className="px-3 py-2 text-slate-900">{r.product.name}</td>
                                                            <td className="px-3 py-2"><Chip>{departmentOf(r.product)}</Chip></td>
                                                            <td className="px-3 py-2"><Chip>{subDepartmentOf(r.product)}</Chip></td>
                                                            <td className="px-3 py-2"><Chip>{categoryOf(r.product)}</Chip></td>
                                                            <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                                                                {labelPriceOf && template && r.barcode
                                                                    ? <LabelPriceText shown={labelPriceOf(template, { product: r.product, barcode: r.barcode, productBarcode: r.barcode, unit: r.unit })} currencyLabel={currencyLabel} compact />
                                                                    : <>{currencyLabel} {formatPrice(r.product.price)}</>}
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-xs">{r.product.stock ?? '—'}</td>
                                                            <td className="px-3 py-2 text-center">
                                                                {r.barcode ? (
                                                                    <QtyStepper value={r.qty} onChange={v => updateRow(r.key, { qty: v })} min={0} label={`Labels for ${r.product.name}`} />
                                                                ) : <span className="text-xs text-slate-400">—</span>}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {rows !== null && rows.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="bb-qp-bulk-template" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1"><Tag size={13} /> Label Template</label>
                                        {templatePicker('bb-qp-bulk-template')}
                                    </div>
                                    <div>
                                        <label htmlFor="bb-qp-bulk-printer" className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1"><Printer size={13} /> Select Printer</label>
                                        {printerPicker('bb-qp-bulk-printer')}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
                        <button onClick={onOpenSettings} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Print Settings</button>
                    </div>
                    {tab === 'bulk' && rows !== null && rows.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={addBulkToQueue}
                                disabled={busy || bulkLabelCount === 0}
                                className="px-4 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ListPlus size={16} /> Add {bulkLabelCount} Label{bulkLabelCount === 1 ? '' : 's'} to Queue
                            </button>
                            <button
                                type="button"
                                onClick={() => runPrint(bulkEntries())}
                                disabled={busy || bulkLabelCount === 0 || zebraBlocked || !template}
                                className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />} Print {bulkLabelCount} Label{bulkLabelCount === 1 ? '' : 's'} Now
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuickBarcodePrintDialog;
