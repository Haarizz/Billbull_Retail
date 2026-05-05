import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronRight, Plus, Download, Search, Settings,
    ChevronDown, RefreshCw, Eye, MoreHorizontal,
    FileText, Calendar, Box, ClipboardList,
    CheckCircle2, Clock, AlertCircle, Undo2, Save,
    ArrowLeft, Barcode, Keyboard, Filter, Upload,
    CheckSquare, MousePointer2, Info, User, PackageSearch, X,
    Check, XCircle, Image as ImageIcon, FileDown, Package, AlertTriangle, Trash2,
    PlusCircle, MinusCircle, Activity
} from 'lucide-react';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';

// ==========================================
// CONFIGURATION
// ==========================================

const STOCK_TAKING_COLUMNS = [
    { header: 'Session ID', key: 'id', width: 20 },
    { header: 'Warehouse', key: 'warehouse', width: 20 },
    { header: 'Created By', key: 'createdBy', width: 20 },
    { header: 'Started On', key: 'startedOn', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Progress', key: 'progress', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Variance Qty', key: 'totalVarianceQty', width: 15 },
    { header: 'Variance Value', key: 'totalVarianceValue', width: 15 }
];
import { getImageUrl } from '../../../utils/urlUtils';
import ExcelJS from 'exceljs';
import { getWarehouses, getWarehouseStock, getWarehouseProductStock, getWarehouseBins, getWarehouseStockSummary } from '../../../api/warehouseApi';
import { searchExactProducts, searchProductByBarcode } from '../../../api/productsApi';
import { getDepartments } from '../../../api/departmentsApi';
import { getBrands } from '../../../api/brandsApi';
import ProductSelector from '../../../components/ProductSelector';
import {
    createStockTakeSession,
    getStockTakeSessions,
    getStockTakeSession,
    updateItemCount as updateApiCount,
    updateItemBin as updateApiBin,
    submitForApproval,
    addItemToSession,
    bulkUpdateItems,
    deleteStockTakeItem,
    approveStockTakeSession,
    rejectStockTakeSession,
    deleteStockTakeSession,
    getProductsForStockTake,
    addItemBatch,
    updateItemBatch,
    deleteItemBatch,
    previewNextBatchNumber,
} from '../../../api/stockTakeApi';

const parseImpactAmount = (impact) => {
    if (typeof impact === 'number') return impact;
    const raw = String(impact || '').trim();
    if (!raw || raw === '-') return 0;
    const amount = Number(raw.replace(/[^0-9.]/g, '')) || 0;
    return raw.includes('-') ? -amount : amount;
};

const ImpactAmount = ({ value }) => {
    const amount = parseImpactAmount(value);
    if (!amount) return '-';
    return <>{amount > 0 ? '+' : ''}<CurrencyAmount value={Math.abs(amount)} /></>;
};

// Batch / expiry editor — rendered inside the count modal for batch-enabled items.
// countedQty is derived from the sum of batch quantities (server-side); the user enters per-batch rows here.
const BatchEditor = ({ item, disabled, onChange }) => {
    const [batches, setBatches] = useState(item?.batches || []);
    const [draft, setDraft] = useState({ batchNumber: '', expiryDate: '', quantity: 1 });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { setBatches(item?.batches || []); }, [item?.id, item?.batches]);

    // With the unified Batch & Expiry toggle, any tracked item requires an expiry.
    const expiryRequired = !!(item?.expiryEnabled || item?.batchEnabled);

    const handlePrefillBatchNumber = async () => {
        if (!item?.id) return;
        try {
            const res = await previewNextBatchNumber(item.id);
            setDraft(d => ({ ...d, batchNumber: res?.batchNumber || '' }));
        } catch (e) {
            // non-fatal
        }
    };

    const handleAdd = async () => {
        setError('');
        const qty = parseInt(draft.quantity, 10);
        if (!Number.isFinite(qty) || qty <= 0) { setError('Quantity must be > 0'); return; }
        if (expiryRequired && !draft.expiryDate) { setError('Expiry date is required'); return; }
        setBusy(true);
        try {
            const saved = await addItemBatch(item.id, {
                batchNumber: draft.batchNumber?.trim() || null,
                expiryDate: draft.expiryDate || null,
                quantity: qty,
            });
            const next = [...batches, saved];
            setBatches(next);
            setDraft({ batchNumber: '', expiryDate: '', quantity: 1 });
            onChange?.(next);
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to add batch');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (id) => {
        setBusy(true);
        try {
            await deleteItemBatch(id);
            const next = batches.filter(b => b.id !== id);
            setBatches(next);
            onChange?.(next);
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to delete batch');
        } finally {
            setBusy(false);
        }
    };

    const handleUpdate = async (id, patch) => {
        setBusy(true);
        try {
            const saved = await updateItemBatch(id, patch);
            const next = batches.map(b => (b.id === id ? saved : b));
            setBatches(next);
            onChange?.(next);
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to update batch');
        } finally {
            setBusy(false);
        }
    };

    const total = batches.reduce((s, b) => s + (parseInt(b.quantity, 10) || 0), 0);

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Batches</p>
                    <p className="text-[10px] text-slate-400">Counted quantity = sum of batch quantities ({total})</p>
                </div>
            </div>

            {batches.length > 0 && (
                <div className="border border-slate-100 rounded-lg overflow-hidden mb-3">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-2 py-1.5 text-left">Batch #</th>
                                <th className="px-2 py-1.5 text-left">Expiry</th>
                                <th className="px-2 py-1.5 text-right">Qty</th>
                                <th className="px-2 py-1.5"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map(b => (
                                <tr key={b.id} className="border-t border-slate-100">
                                    <td className="px-2 py-1.5 font-mono text-[11px]">{b.batchNumber}</td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            type="date"
                                            disabled={disabled || busy}
                                            value={b.expiryDate || ''}
                                            onChange={(e) => handleUpdate(b.id, { expiryDate: e.target.value || null })}
                                            className="border border-slate-200 rounded px-1 py-0.5 text-[11px]"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5 text-right">
                                        <input
                                            type="number"
                                            min={1}
                                            disabled={disabled || busy}
                                            defaultValue={b.quantity}
                                            onBlur={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (Number.isFinite(v) && v > 0 && v !== b.quantity) {
                                                    handleUpdate(b.id, { quantity: v });
                                                }
                                            }}
                                            className="w-16 border border-slate-200 rounded px-1 py-0.5 text-[11px] text-right"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5 text-right">
                                        <button
                                            type="button"
                                            disabled={disabled || busy}
                                            onClick={() => handleDelete(b.id)}
                                            className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!disabled && (
                <div className="border-t border-slate-100 pt-3 mt-1">
                    <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Batch Number</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    placeholder="(auto)"
                                    value={draft.batchNumber}
                                    onChange={(e) => setDraft(d => ({ ...d, batchNumber: e.target.value }))}
                                    className="flex-1 min-w-0 h-8 border border-slate-200 rounded px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                                <button
                                    type="button"
                                    onClick={handlePrefillBatchNumber}
                                    title="Generate batch number"
                                    className="h-8 px-2 text-[10px] font-bold border border-slate-200 rounded hover:bg-slate-50 shrink-0"
                                >
                                    Gen
                                </button>
                            </div>
                        </div>
                        <div className="col-span-4">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                Expiry {expiryRequired && <span className="text-red-500">*</span>}
                            </label>
                            <input
                                type="date"
                                value={draft.expiryDate}
                                onChange={(e) => setDraft(d => ({ ...d, expiryDate: e.target.value }))}
                                className="w-full h-8 border border-slate-200 rounded px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Qty</label>
                            <input
                                type="number"
                                min={1}
                                value={draft.quantity}
                                onChange={(e) => setDraft(d => ({ ...d, quantity: e.target.value }))}
                                className="w-full h-8 border border-slate-200 rounded px-2 text-[11px] text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                        </div>
                        <div className="col-span-1">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={handleAdd}
                                title="Add batch"
                                className="w-full h-8 flex items-center justify-center text-base font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded disabled:opacity-50 leading-none"
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {error && <p className="text-[10px] text-red-500 mt-2">{error}</p>}
        </div>
    );
};

// Compact bin selector used in the items table and count modal
const BinSelector = ({ itemId, binId, bins, onBinChange, disabled, size = 'sm' }) => {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    // Optimistic local state — shows selection immediately without waiting for API
    const [localBinId, setLocalBinId] = useState(binId ?? null);
    const ref = useRef(null);

    // Sync when parent updates (server response arrives)
    useEffect(() => { setLocalBinId(binId ?? null); }, [binId]);

    useEffect(() => {
        if (!open) { setFilter(''); return; }
        const handleOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        // Use capture=true so this fires before row-level handlers
        document.addEventListener('mousedown', handleOutside, true);
        return () => document.removeEventListener('mousedown', handleOutside, true);
    }, [open]);

    const filtered = filter.trim()
        ? bins.filter(b => b.code.toLowerCase().includes(filter.toLowerCase()) || b.name?.toLowerCase().includes(filter.toLowerCase()))
        : bins;

    const selected = bins.find(b => String(b.id) === String(localBinId));

    const handleSelect = (e, bin) => {
        e.stopPropagation();
        e.preventDefault();
        const newBinId = bin ? bin.id : null;
        setLocalBinId(newBinId);   // immediate optimistic update
        setOpen(false);
        onBinChange(itemId, newBinId); // background API call
    };

    if (size === 'sm') {
        return (
            <div ref={ref} className="relative inline-flex justify-center" onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(o => !o); }}
                    disabled={disabled}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all
                        ${selected
                            ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? 'bg-amber-400' : 'bg-slate-300'}`} />
                    {selected ? selected.code : 'Assign'}
                    {!disabled && <ChevronDown className="h-2.5 w-2.5 opacity-60" />}
                </button>

                {open && (
                    <div
                        className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/80"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {bins.length > 6 && (
                            <div className="px-2 pt-2">
                                <input
                                    autoFocus
                                    value={filter}
                                    onChange={e => setFilter(e.target.value)}
                                    placeholder="Search bins…"
                                    className="w-full px-2 py-1 text-[10px] border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-amber-400"
                                />
                            </div>
                        )}
                        <div className="max-h-44 overflow-y-auto py-1">
                            <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleSelect(e, null)}
                                className="w-full text-left px-3 py-2 text-[10px] font-medium text-slate-400 hover:bg-slate-50 flex items-center gap-2"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0" />
                                None
                            </button>
                            {filtered.map(b => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => handleSelect(e, b)}
                                    className={`w-full text-left px-3 py-2 text-[10px] font-bold flex items-center gap-2 transition-colors
                                        ${String(b.id) === String(localBinId)
                                            ? 'bg-amber-50 text-amber-700'
                                            : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${String(b.id) === String(localBinId) ? 'bg-amber-400' : 'bg-slate-200'}`} />
                                    <span className="font-mono">{b.code}</span>
                                    {b.name && <span className="text-slate-400 font-normal truncate ml-1">— {b.name}</span>}
                                    {String(b.id) === String(localBinId) && <Check className="h-2.5 w-2.5 ml-auto text-amber-500 shrink-0" />}
                                </button>
                            ))}
                            {filtered.length === 0 && (
                                <p className="px-3 py-2 text-[10px] text-slate-400 text-center">No bins found</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Full-width modal variant (size === 'lg')
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => { if (!disabled) setOpen(o => !o); }}
                disabled={disabled}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-bold transition-all
                    ${selected
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-white border-slate-200 text-slate-400'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-amber-400 cursor-pointer'}`}
            >
                <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${selected ? 'bg-amber-400' : 'bg-slate-200'}`} />
                    {selected ? `${selected.code}${selected.name ? ` — ${selected.name}` : ''}` : 'No Bin Assigned'}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''} ${selected ? 'text-amber-500' : 'text-slate-300'}`} />
            </button>

            {open && (
                <div
                    className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/80"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {bins.length > 5 && (
                        <div className="px-3 pt-2.5">
                            <input
                                autoFocus
                                value={filter}
                                onChange={e => setFilter(e.target.value)}
                                placeholder="Search bins…"
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-amber-400"
                            />
                        </div>
                    )}
                    <div className="max-h-48 overflow-y-auto py-1.5">
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => handleSelect(e, null)}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-50 flex items-center gap-2.5"
                        >
                            <span className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />
                            No Bin Assigned
                        </button>
                        {filtered.map(b => (
                            <button
                                key={b.id}
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleSelect(e, b)}
                                className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2.5 transition-colors
                                    ${String(b.id) === String(localBinId)
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${String(b.id) === String(localBinId) ? 'bg-amber-400' : 'bg-slate-200'}`} />
                                <span className="font-mono font-bold">{b.code}</span>
                                {b.name && <span className="text-slate-400 font-normal truncate">— {b.name}</span>}
                                {String(b.id) === String(localBinId) && (
                                    <Check className="h-3 w-3 ml-auto text-amber-500 shrink-0" />
                                )}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-3 text-xs text-slate-400 text-center">No bins found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const getStatusStyle = (status) => {
    switch (status) {
        case 'In Progress': return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'Pending Approval': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'Variance': return 'text-amber-600 bg-amber-50 border-amber-200';
        case 'Matched': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        case 'Pending': return 'text-slate-400 bg-slate-50 border-slate-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
};

const BACKEND_LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?$/;
const ISO_TIMEZONE_SUFFIX_REGEX = /(Z|[+-]\d{2}:\d{2})$/i;

const parseStockTakeTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value !== 'string') return null;

    const normalized = value.trim();
    if (!normalized) return null;

    if (ISO_TIMEZONE_SUFFIX_REGEX.test(normalized)) {
        const parsed = new Date(normalized);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const match = normalized.match(BACKEND_LOCAL_DATETIME_REGEX);
    if (match) {
        const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '0'] = match;
        const milliseconds = Number((fraction + '000').slice(0, 3));
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
            milliseconds
        );
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getSessionTimestamp = (session, field) => session?.[`${field}Iso`] || session?.[field] || null;

const formatStockTakeDate = (value) => {
    const parsed = parseStockTakeTimestamp(value);
    return parsed ? parsed.toLocaleDateString() : '-';
};

const formatStockTakeTime = (value, { includeSeconds = false } = {}) => {
    const parsed = parseStockTakeTimestamp(value);
    if (!parsed) return '';

    return parsed.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        ...(includeSeconds ? { second: '2-digit' } : {}),
    });
};

const mapSessionTimestamps = (session) => {
    const startedAt = getSessionTimestamp(session, 'createdAt');
    const completedAt = getSessionTimestamp(session, 'reconciledAt');

    return {
        startedOn: formatStockTakeDate(startedAt),
        startedTime: formatStockTakeTime(startedAt),
        completedOn: completedAt ? formatStockTakeDate(completedAt) : null,
        completedTime: completedAt ? formatStockTakeTime(completedAt) : null,
    };
};

const resolveProductImage = (product) => {
    if (!product) return null;
    return (
        product.image ||
        product.primaryImage ||
        product.thumbnailUrl ||
        product.imageUrl ||
        product.photo ||
        product.product?.image ||
        product.product?.primaryImage ||
        product.product?.thumbnailUrl ||
        product.product?.imageUrl ||
        null
    );
};

const resolveProductBrand = (product) => {
    if (!product) return 'General';
    if (typeof product.brand === 'object') return product.brand?.name || product.brandName || 'General';
    return product.brand || product.brandName || product.product?.brand?.name || 'General';
};

const resolveProductCategory = (product) => (
    product?.category ||
    product?.departmentName ||
    product?.product?.category ||
    product?.product?.department?.name ||
    'Uncategorized'
);

const normalizeSelectorProduct = (product, detail = null) => {
    const detailProduct = detail?.product || null;
    const baseProduct = detailProduct || product?.product || product || {};
    const detailBarcode =
        detail?.inventory?.packings?.find?.(packing => packing.barcode)?.barcode ||
        product?.inventory?.packings?.find?.(packing => packing.barcode)?.barcode ||
        '';
    const brand = resolveProductBrand(product) || resolveProductBrand(detail) || baseProduct.brand?.name || 'General';
    const category = (
        product?.category ||
        product?.departmentName ||
        detailProduct?.category ||
        detailProduct?.department?.name ||
        resolveProductCategory(product) ||
        resolveProductCategory(detail) ||
        'Uncategorized'
    );
    const batchEnabled = !!(
        product?.batchEnabled ??
        product?.isBatch ??
        product?.product?.isBatch ??
        detailProduct?.isBatch ??
        baseProduct.isBatch ??
        false
    );
    const expiryEnabled = !!(
        product?.expiryEnabled ??
        product?.product?.expiryEnabled ??
        detailProduct?.expiryEnabled ??
        baseProduct.expiryEnabled ??
        false
    );

    return {
        ...product,
        id: product?.id ?? baseProduct.id ?? null,
        name: product?.name || baseProduct.name || '',
        code: product?.code || baseProduct.code || '',
        sku: product?.sku || baseProduct.sku || baseProduct.code || '',
        barcode: product?.barcode || product?.barcodes?.[0]?.barcode || detailBarcode || '',
        image: resolveProductImage(detail) || resolveProductImage(product),
        brand,
        brandName: product?.brandName || brand,
        category,
        departmentName: product?.departmentName || detailProduct?.department?.name || null,
        description: product?.description || product?.shortDesc || baseProduct.shortDesc || baseProduct.description || baseProduct.name || '',
        cost: product?.cost ?? detail?.pricing?.cost ?? null,
        retailPrice: product?.retailPrice ?? detail?.pricing?.retailPrice ?? product?.sellingPrice ?? null,
        sellingPrice: product?.sellingPrice ?? detail?.pricing?.retailPrice ?? product?.retailPrice ?? null,
        stock: product?.stock ?? 0,
        batchEnabled,
        expiryEnabled,
    };
};

const mapStockTakeItem = (item) => ({
    ...item,
    barcode: item?.barcode || item?.product?.barcode || '',
    batches: item?.batches || [],
    impact: item?.varianceValue ? `${item.varianceValue > 0 ? '+' : ''}AED ${Math.abs(item.varianceValue).toFixed(2)}` : null,
    status: item?.status ? item.status.charAt(0) + item.status.slice(1).toLowerCase() : 'Pending',
});

const ListView = ({
    activeTab,
    setActiveTab,
    allSessions,
    searchTerm,
    setSearchTerm,
    setIsCreateModalOpen,
    handleActionClick,
    handleViewOnlyClick,
    handleDeleteSession,
    ChevronRight, Plus, Download, Search, ClipboardList, Eye, Filter, Trash2,
    getStatusStyle
}) => {
    const tabs = ['All Sessions', 'In Progress', 'Completed', 'Pending Approval'];
    // BB-013: Apply both tab filter and search term filter
    const filteredSessions = allSessions
        .filter(s => activeTab === 'All Sessions' || s.status === activeTab)
        .filter(s => !searchTerm ||
            s.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.warehouse?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.createdBy?.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>Inventory & Registries</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className="text-slate-900 font-medium">Stock Taking</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-amber-100 p-1.5 rounded-lg">
                            <ClipboardList className="h-5 w-5 text-[#F5C742]" />
                        </div>
                        <h1 className="text-lg font-bold text-slate-800 tracking-tight">Stock Taking</h1>
                    </div>
                    <p className="text-sm text-slate-500">Manage physical stock counts, track variances, and maintain inventory accuracy</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-md text-xs font-semibold h-8 px-3 py-1 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm transition-colors"
                    >
                        <Plus className="h-3.5 w-3.5" /> New Stock Take
                    </button>
                    <ExportDropdown
                        onExportExcel={() => exportToExcel(filteredSessions, STOCK_TAKING_COLUMNS, 'StockTaking')}
                        onExportPdf={() => exportToPDF(filteredSessions, STOCK_TAKING_COLUMNS, 'Stock Taking Sessions', 'StockTaking')}
                    />
                </div>
            </div>

            {/* Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="border-b border-slate-200">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between px-4 py-2 gap-4">
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                            {tabs.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all
                                        ${activeTab === tab
                                            ? 'text-[#B45309] bg-amber-50 shadow-[inset_0_-2px_0_0_#F5C742]'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <div className="relative w-full lg:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search sessions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#F5C742]/50 focus:border-[#F5C742] transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[#F8FAFC] border-b border-slate-200">
                            <tr>
                                <th className="text-left px-4 py-2 font-semibold text-slate-600">Session</th>
                                <th className="text-left px-4 py-2 font-semibold text-slate-600">Warehouse</th>
                                <th className="text-left px-4 py-2 font-semibold text-slate-600">Created By</th>
                                <th className="text-left px-4 py-2 font-semibold text-slate-600">Started On</th>
                                <th className="text-left px-4 py-2 font-semibold text-slate-600">Progress</th>
                                <th className="text-left px-4 py-2 font-semibold text-slate-600">Status</th>
                                <th className="text-right px-4 py-2 font-semibold text-slate-600">Variance</th>
                                <th className="text-right px-4 py-2 font-semibold text-slate-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredSessions.map((session) => (
                                <tr key={session.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="space-y-1">
                                            <p className="font-bold text-slate-800 text-[13px]">{session.id}</p>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{session.type}</span>
                                                <span className="w-fit px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[8px] font-black uppercase tracking-tighter">
                                                    Reconciliation
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className="font-medium text-slate-700 text-xs">{session.warehouse}</span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-[10px] font-bold border border-amber-200">
                                                {session.avatar || session.createdBy?.charAt(0)}
                                            </div>
                                            <span className="text-slate-600 text-xs">{session.createdBy}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-slate-700 font-medium">{session.startedOn || '-'}</p>
                                                    {session.startedTime && (
                                                        <p className="text-[10px] text-slate-400">{session.startedTime}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {session.completedOn && (
                                                <div className="flex items-center gap-1.5">
                                                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                                                    <div>
                                                        <p className="text-[10px] text-emerald-600 font-medium">{session.completedOn}</p>
                                                        {session.completedTime && (
                                                            <p className="text-[10px] text-slate-400">{session.completedTime}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        {session.total > 0 ? (
                                            <div className="space-y-1 min-w-[90px]">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold text-slate-600">
                                                        {session.progress} / {session.total}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-amber-600">
                                                        {Math.round((session.progress / session.total) * 100)}%
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${(session.progress / session.total) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${getStatusStyle(session.status)}`}>
                                            {session.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-right whitespace-nowrap font-bold text-[12px]">
                                        {session.progress > 0 ? (
                                            <div className="flex flex-col items-end">
                                                <span className={session.totalVarianceValue >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                                    {session.totalVarianceValue > 0 ? '+' : ''}<CurrencyAmount value={Math.abs(session.totalVarianceValue)} />
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                                    {session.totalVarianceQty > 0 ? '+' : (session.totalVarianceQty < 0 ? '-' : '')}{Math.abs(session.totalVarianceQty)} units
                                                </span>
                                                {session.status === 'In Progress' && (
                                                    <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wide">live</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 font-medium">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => handleActionClick(session)}
                                                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                                                ${session.action === 'Continue' ? 'bg-[#F5C742] hover:bg-amber-400 text-slate-900 shadow-sm' :
                                                        session.action === 'Review' ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm' :
                                                            'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                                            >
                                                {session.action}
                                            </button>
                                            <button
                                                onClick={() => handleViewOnlyClick(session)}
                                                className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSession(session)}
                                                disabled={session.status === 'Completed'}
                                                className={`p-1 rounded transition-colors ${session.status === 'Completed'
                                                    ? 'text-slate-300 cursor-not-allowed'
                                                    : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                                    }`}
                                                title={session.status === 'Completed' ? "Cannot delete completed sessions" : "Delete session"}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const SessionView = ({
    selectedSession,
    refreshSelectedSession,
    handleSaveDraft,
    setIsReviewModalOpen,
    setViewMode,
    barcodeInput,
    setBarcodeInput,
    handleBarcodeKeyDown,
    setIsProductSelectorOpen,
    setIsCsvModalOpen,
    handleCountChange,
    handleDeleteItem,
    handleSelectProduct,
    handleUndoLast,
    canUndo,
    lastSaved,
    barcodeInputRef,
    scanFlash,
    handleSubmitApproval,
    lastScannedItem,
    lastScannedAt,
    warehouseBins,
    handleBinChange,
    // Count modal state lifted to parent
    isCountModalOpen, setIsCountModalOpen,
    selectedItemForCount, setSelectedItemForCount,
    countToAdd, setCountToAdd,
    countMode, setCountMode,
    ChevronRight, Undo2, Save, ClipboardList, Barcode, Keyboard, Search, Filter, FileDown,
    ImageIcon, Trash2, PackageSearch, Package, RefreshCw, CheckSquare, MousePointer2,
    binCapacityViolations = [],
    isItemDeleting = false,
}) => {
    const [itemSearchQuery, setItemSearchQuery] = useState('');
    // BB-016: Filter items by search query
    const items = (selectedSession?.items || []).filter(item =>
        !itemSearchQuery ||
        item.productName?.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
        item.sku?.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
        item.barcode?.toLowerCase().includes(itemSearchQuery.toLowerCase())
    );

    const [entryMode, setEntryMode] = useState('scan'); // 'scan' or 'manual'

    const openCountModal = (item) => {
        if (selectedSession?.status !== 'In Progress') return;
        // Allow row-click in either scan or manual mode — useful for batched items
        // where the user needs to manage batches without flipping the entry-mode toggle.
        setSelectedItemForCount(item);
        // Manual click = set the total directly; prefill with existing count for easy adjustment
        setCountMode('set');
        setCountToAdd(item.countedQty != null ? item.countedQty : 0);
        setIsCountModalOpen(true);
    };

    const submitCountAdd = async () => {
        if (!selectedItemForCount) { setIsCountModalOpen(false); return; }

        if (selectedItemForCount._fromSearch) {
            // Product from search modal — add it to the session first, then update count
            await handleSelectProduct(selectedItemForCount, countToAdd);
        } else {
            let newQty;
            if (countMode === 'add') {
                const currentQty = selectedItemForCount.countedQty != null ? selectedItemForCount.countedQty : 0;
                newQty = parseInt(currentQty, 10) + parseInt(countToAdd, 10);
            } else {
                // 'set' mode — replace with the entered value directly
                newQty = parseInt(countToAdd, 10);
            }
            if (!isNaN(newQty)) {
                handleCountChange(selectedItemForCount.id, newQty);
            }
        }
        setIsCountModalOpen(false);
    };

    const handleExportProgress = async () => {
        if (!items || items.length === 0) return;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock Taking Progress');

        // Set up columns
        worksheet.columns = [
            { header: 'Photo', key: 'photo', width: 15 },
            { header: 'Product Name', key: 'name', width: 35 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'System Qty', key: 'systemQty', width: 12 },
            { header: 'Counted Qty', key: 'countedQty', width: 12 },
            { header: 'Variance', key: 'variance', width: 12 },
            { header: 'Value Impact', key: 'impact', width: 15 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const rowIndex = i + 2; // +1 for header, +1 because excel is 1-indexed

            // Add row data (excluding photo for now)
            worksheet.addRow({
                name: item.productName || item.name || '-',
                sku: item.sku || '-',
                systemQty: item.systemQty || 0,
                countedQty: item.countedQty === null ? '-' : item.countedQty,
                variance: item.variance === null ? '-' : item.variance,
                impact: item.impact || '-',
                status: item.status || '-'
            });

            worksheet.getRow(rowIndex).height = 60; // Make row tall enough for image
            worksheet.getRow(rowIndex).alignment = { vertical: 'middle', horizontal: 'center' };

            // Embed Image if available
            if (item.image) {
                try {
                    const imageUrl = getImageUrl(item.image);
                    const response = await fetch(imageUrl);
                    const buffer = await response.arrayBuffer();

                    const extension = imageUrl.split('.').pop().toLowerCase();
                    const imageType = extension === 'png' ? 'png' : 'jpeg';

                    const imageId = workbook.addImage({
                        buffer: buffer,
                        extension: imageType,
                    });

                    // Add image to cell A{rowIndex}
                    worksheet.addImage(imageId, {
                        tl: { col: 0, row: rowIndex - 1 },
                        ext: { width: 50, height: 50 },
                        editAs: 'oneCell'
                    });
                } catch (error) {
                    console.error(`Failed to load image for item ${item.sku}:`, error);
                }
            }
        }

        // Generate and download file
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `StockTake_${selectedSession?.id || 'export'}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Navbar / Breadcrumbs */}
            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <span>Inventory & Registries</span>
                    <ChevronRight className="h-3 w-3" />
                    <span>Stock Taking</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-slate-900 font-semibold">{selectedSession?.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {selectedSession?.status === 'In Progress' && (
                        <>
                            <button
                                onClick={handleUndoLast}
                                disabled={!canUndo}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border rounded transition-all shadow-sm ${canUndo
                                    ? 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                                    : 'text-slate-300 bg-slate-50 border-slate-100 cursor-not-allowed'
                                    }`}
                                title={canUndo ? 'Undo last action' : 'Nothing to undo'}
                            >
                                <Undo2 className="h-3.5 w-3.5" /> Undo Last
                            </button>
                            <button
                                onClick={handleSaveDraft}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-all shadow-sm"
                            >
                                <Save className="h-3.5 w-3.5 text-slate-500" /> Save Draft
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => {
                            if (selectedSession?.status === 'Pending Approval') {
                                setIsReviewModalOpen(true);
                            } else {
                                setViewMode('list');
                            }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-all shadow-sm"
                    >
                        Back to Sessions
                    </button>
                </div>
            </div>

            {/* Session Header Info */}
            <div className="flex items-center gap-2.5 px-1">
                <div className="bg-amber-100 p-1.5 rounded-lg border border-amber-200">
                    <ClipboardList className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-800 tracking-tight">{selectedSession?.id} - {selectedSession?.warehouse}</h1>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-widest">
                            {selectedSession?.status}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold leading-tight mt-0.5">
                        Started {selectedSession?.startedOn}, {selectedSession?.startedTime} • {selectedSession?.type}
                    </p>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">

                {/* Left Column - Table and Controls */}
                <div className="xl:col-span-3 space-y-4">

                    {/* Control Bar */}
                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
                        <div className="flex bg-slate-100 p-0.5 rounded-lg shrink-0">
                            <button
                                onClick={() => setEntryMode('scan')}
                                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold rounded-md transition-all
                                        ${entryMode === 'scan' ? 'bg-[#F5C742] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <Barcode className="h-3.5 w-3.5" /> Barcode Scan
                            </button>
                            <button
                                onClick={() => setEntryMode('manual')}
                                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all
                                        ${entryMode === 'manual' ? 'bg-[#F5C742] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <Keyboard className="h-3.5 w-3.5" /> Manual Entry
                            </button>
                        </div>

                        {entryMode === 'scan' && (
                            <>
                                <div className="relative flex-grow min-w-[200px]">
                                    <input
                                        ref={barcodeInputRef}
                                        type="text"
                                        placeholder="Scan barcode or type manually.."
                                        value={barcodeInput}
                                        onChange={(e) => setBarcodeInput(e.target.value)}
                                        onKeyDown={handleBarcodeKeyDown}
                                        autoFocus
                                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all font-medium"
                                    />
                                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setIsProductSelectorOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        <Search className="h-3.5 w-3.5 text-slate-400" /> Search by Item Name
                                    </button>
                                </div>
                            </>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                            {/* BB-016: Item search within session */}
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    value={itemSearchQuery}
                                    onChange={e => setItemSearchQuery(e.target.value)}
                                    className="pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none focus:ring-1 focus:ring-amber-400 w-36 transition-all"
                                />
                            </div>
                            <button
                                onClick={() => setIsCsvModalOpen(true)}
                                disabled={selectedSession?.status !== 'In Progress'}
                                className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <FileDown className="h-4 w-4" /> Import CSV
                            </button>
                        </div>
                    </div>

                    {/* Product Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm min-h-[400px] flex flex-col">
                        <table className="w-full text-sm">
                            <thead className="bg-[#F8FAFC] border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                                <tr>
                                    <th className="text-left px-4 py-2.5 w-10">#</th>
                                    <th className="text-left px-4 py-2.5">Product</th>
                                    <th className="text-center px-4 py-2.5">SKU/Barcode</th>
                                    <th className="text-center px-4 py-2.5 font-bold">Bin</th>
                                    <th className="text-center px-4 py-2.5 font-bold">System Qty</th>
                                    <th className="text-center px-4 py-2.5 font-bold">Counted Qty</th>
                                    <th className="text-center px-4 py-2.5 font-bold">Variance</th>
                                    <th className="text-center px-4 py-2.5 font-bold">Value Impact</th>
                                    <th className="text-center px-4 py-2.5">Status</th>
                                    <th className="text-right px-4 py-2.5">Actions</th>
                                </tr>
                            </thead>
                            {items.length > 0 ? (
                                <tbody className="divide-y divide-slate-100">
                                    {items.map((item, idx) => (
                                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => openCountModal(item)}>
                                            <td className="px-4 py-2.5 text-[10px] text-slate-400 font-medium">{idx + 1}</td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                                        {resolveProductImage(item) ? (
                                                            <img src={getImageUrl(resolveProductImage(item))} alt={item.productName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <ImageIcon className="h-4 w-4 text-slate-300" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-bold text-slate-800 leading-tight">{item.productName}</span>
                                                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{item.description || `${item.brand} • ${item.category}`}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-center text-[10px] font-mono font-bold text-slate-600">{item.sku}</td>
                                            <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                {warehouseBins.length > 0 ? (
                                                    <BinSelector
                                                        itemId={item.id}
                                                        binId={item.binId}
                                                        binCode={item.binCode}
                                                        bins={warehouseBins}
                                                        onBinChange={handleBinChange}
                                                        disabled={selectedSession?.status !== 'In Progress'}
                                                        size="sm"
                                                    />
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 font-bold">{item.binCode || '—'}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-center font-bold text-slate-700">{item.systemQty}</td>
                                            <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={item.countedQty === null ? '' : item.countedQty}
                                                        onChange={(e) => handleCountChange(item.id, e.target.value)}
                                                        disabled={selectedSession?.status !== 'In Progress' || entryMode !== 'manual' || item.batchEnabled || item.expiryEnabled}
                                                        title={(item.batchEnabled || item.expiryEnabled) ? 'Open the item to manage batches' : undefined}
                                                        placeholder="0"
                                                        className={`w-16 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-900 text-center focus:ring-1 outline-none transition-all disabled:opacity-50 disabled:bg-slate-100 ${
                                                            binCapacityViolations.some(v => v.itemId === item.id)
                                                                ? 'bg-red-50 border border-red-400 focus:ring-red-400'
                                                                : 'bg-slate-50 border border-slate-200 focus:ring-amber-500'
                                                        }`}
                                                    />
                                                    {binCapacityViolations.some(v => v.itemId === item.id) && (
                                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" title="Bin capacity exceeded" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-center font-bold">
                                                {item.variance !== undefined && item.variance !== null ? (
                                                    item.variance > 0 ? (
                                                        <div className="flex items-center justify-center gap-1.5 text-blue-600">
                                                            <PlusCircle className="h-3.5 w-3.5" />
                                                            <span>+{item.variance}</span>
                                                        </div>
                                                    ) : item.variance < 0 ? (
                                                        <div className="flex items-center justify-center gap-1.5 text-red-500">
                                                            <MinusCircle className="h-3.5 w-3.5" />
                                                            <span>{Math.abs(item.variance)}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )
                                                ) : <span className="text-slate-400">-</span>}
                                            </td>
                                            <td className={`px-4 py-2.5 text-center font-bold ${item.varianceValue > 0 ? 'text-blue-600' : item.varianceValue < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                <ImpactAmount value={item.impact || item.varianceValue} />
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border shadow-sm ${getStatusStyle(item.status)}`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    disabled={selectedSession?.status !== 'In Progress'}
                                                    className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors disabled:opacity-50"
                                                    title="Delete Item"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            ) : null}
                        </table>

                        {items.length === 0 && (
                            <div className="flex-grow flex flex-col items-center justify-center py-20 px-4">
                                <div className="w-16 h-16 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center mb-4">
                                    <PackageSearch className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">No items found</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column - Summary Sidebar */}
                <div className="space-y-4">

                    {/* Summary Card */}
                    <div className="bg-[#F5C742] rounded-xl p-5 shadow-lg shadow-amber-200/40 space-y-5">
                        <div className="flex items-center gap-2 text-slate-900 border-b border-black/10 pb-3">
                            <Activity className="h-4 w-4" />
                            <h3 className="font-bold text-sm">Live Summary</h3>
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex justify-between items-center text-slate-900 pt-1">
                                <span className="text-[11px] font-bold opacity-80">Total Items</span>
                                <span className="text-base font-black tracking-tight">{items.length}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-900 pt-1">
                                <span className="text-[11px] font-bold opacity-80">Counted</span>
                                <span className="text-base font-black tracking-tight">{items.filter(i => i.countedQty !== null).length}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-900 pb-2 border-b border-black/10">
                                <span className="text-[11px] font-bold opacity-80">Matched</span>
                                <span className="text-base font-black tracking-tight">{items.filter(i => i.countedQty !== null && i.variance === 0).length}</span>
                            </div>

                            <div className="flex justify-between items-center text-slate-900 pt-1">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold opacity-80">
                                    <PlusCircle className="h-3.5 w-3.5" /> Excess
                                </span>
                                <span className="text-base font-black tracking-tight">
                                    {items.filter(i => i.countedQty !== null && i.variance > 0).length}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-slate-900 pb-2 border-b border-black/10">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold opacity-80">
                                    <MinusCircle className="h-3.5 w-3.5" /> Shortage
                                </span>
                                <span className="text-base font-black tracking-tight">
                                    {items.filter(i => i.countedQty !== null && i.variance < 0).length}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-slate-900 pt-1">
                                <span className="text-[11px] font-bold opacity-80">Variance (Qty)</span>
                                <span className="text-base font-black tracking-tight">
                                    {items.reduce((sum, i) => sum + Math.abs(i.variance || 0), 0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-slate-900 pb-2 border-b border-black/10">
                                <span className="text-[11px] font-bold opacity-80">Variance (Value)</span>
                                <span className="text-base font-black tracking-tight">
                                    <CurrencyAmount value={items.reduce((sum, item) => sum + Math.abs(item.varianceValue || 0), 0)} />
                                </span>
                            </div>
                        </div>

                        {lastScannedItem && (
                            <div className="pt-2">
                                <p className="text-[10px] font-bold text-slate-900/60 mb-1">Last Scanned:</p>
                                <p className="text-xs font-bold leading-tight text-slate-900">{lastScannedItem.name || lastScannedItem.productName}</p>
                                <p className="text-[10px] text-slate-900/60 font-medium">{formatStockTakeTime(lastScannedAt, { includeSeconds: true })}</p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Primary Actions */}
                    {selectedSession?.status === 'In Progress' && (
                        <div className="space-y-2">
                            <button
                                onClick={handleSubmitApproval}
                                className="w-full h-10 bg-[#10B981] hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm shadow-emerald-200/50 transition-all flex items-center justify-center gap-2 text-[11px] uppercase tracking-wider"
                            >
                                <CheckSquare className="h-4 w-4" /> Submit for Approval
                            </button>
                            <button
                                onClick={handleSaveDraft}
                                disabled={isItemDeleting}
                                className="w-full h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-[11px] uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="h-4 w-4 text-slate-400" /> {isItemDeleting ? 'Removing...' : 'Save & Continue Later'}
                            </button>
                        </div>
                    )}

                    {/* Quick Actions Footer Box */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                        <p className="flex items-center gap-2 px-1 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            <MousePointer2 className="h-3 w-3" /> Quick Actions
                        </p>
                        <div className="space-y-2">
                            <button
                                onClick={handleExportProgress}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <Download className="h-3.5 w-3.5" /> Export Progress
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100 transition-colors">
                                <User className="h-3.5 w-3.5" /> Team Activity
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Count Modal */}
            {isCountModalOpen && selectedItemForCount && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-base font-bold text-slate-800">Item Details - Add Count</h2>
                                <p className="text-[10px] sm:text-xs text-slate-500">Review item details and enter the counted quantity</p>
                            </div>
                            <button
                                onClick={() => setIsCountModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                            {/* Product Info */}
                            <div className="flex gap-4">
                                <div className="w-24 h-24 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                    {resolveProductImage(selectedItemForCount) ? (
                                        <img src={getImageUrl(resolveProductImage(selectedItemForCount))} alt={selectedItemForCount.productName} className="w-full h-full object-cover" />
                                    ) : (
                                        <ImageIcon className="h-8 w-8 text-slate-300" />
                                    )}
                                </div>
                                <div className="flex flex-col justify-center flex-1">
                                    <h3 className="text-sm font-bold text-slate-900 mb-1">{selectedItemForCount.productName}</h3>
                                    <p className="text-[11px] font-medium text-slate-500 mb-3">{selectedItemForCount.description || `${selectedItemForCount.brand || 'Generic'} | ${selectedItemForCount.category || 'Uncategorized'}`}</p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">SKU</p>
                                            <p className="text-xs font-bold font-mono text-slate-800">{selectedItemForCount.sku}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">Barcode</p>
                                            <p className="text-xs font-bold font-mono text-slate-800">{selectedItemForCount.barcode || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Packing Details placeholder */}
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-blue-600 mb-0.5">Packing Details</p>
                                <p className="text-xs font-medium text-blue-900">Standard Pack (1 Unit)</p>
                            </div>

                            {/* Bin Assignment */}
                            {warehouseBins.length > 0 && !selectedItemForCount._fromSearch && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Bin Location</p>
                                    <BinSelector
                                        itemId={selectedItemForCount.id}
                                        binId={selectedItemForCount.binId}
                                        binCode={selectedItemForCount.binCode}
                                        bins={warehouseBins}
                                        onBinChange={(itemId, binId) => {
                                            const bin = warehouseBins.find(b => String(b.id) === String(binId));
                                            setSelectedItemForCount(prev => ({
                                                ...prev,
                                                binId: binId || null,
                                                binCode: bin?.code || null
                                            }));
                                            handleBinChange(itemId, binId);
                                        }}
                                        disabled={selectedSession?.status !== 'In Progress'}
                                        size="lg"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {/* Current Stock */}
                                <div className="border border-amber-200 rounded-xl p-4 flex flex-col justify-center">
                                    <p className="text-[11px] font-bold text-slate-600 mb-3">Current Stock ({selectedSession?.warehouse || 'Warehouse'})</p>
                                    <div className="flex items-baseline gap-1.5 mb-2">
                                        <span className="text-2xl font-black tracking-tight text-amber-500">{selectedItemForCount.systemQty || 0}</span>
                                        <span className="text-[11px] font-bold text-amber-500/70">units</span>
                                    </div>
                                    {selectedItemForCount.countedQty != null ? (
                                        <p className="text-[10px] font-bold text-amber-600">Prior count on record: {selectedItemForCount.countedQty} units</p>
                                    ) : (
                                        <p className="text-[10px] font-bold text-slate-400">Not yet counted</p>
                                    )}
                                </div>

                                {/* Pricing */}
                                <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-center gap-2">
                                    <p className="text-[11px] font-bold text-slate-600 mb-1">Pricing</p>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Cost Price:</span>
                                        <CurrencyAmount value={selectedItemForCount.costPrice || 0} className="font-bold text-slate-800" />
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Selling Price:</span>
                                        <CurrencyAmount value={selectedItemForCount.price || 0} className="font-bold text-emerald-600" />
                                    </div>
                                </div>
                            </div>

                            {/* Batch / Expiry editor — shown whenever either flag is on (single combined product toggle) */}
                            {(selectedItemForCount.batchEnabled || selectedItemForCount.expiryEnabled) && (
                                <BatchEditor
                                    item={selectedItemForCount}
                                    disabled={selectedSession?.status !== 'In Progress'}
                                    onChange={(nextBatches) => {
                                        const sum = nextBatches.reduce((s, b) => s + (parseInt(b.quantity, 10) || 0), 0);
                                        setSelectedItemForCount(prev => ({
                                            ...prev,
                                            batches: nextBatches,
                                            countedQty: sum,
                                        }));
                                        // Re-fetch session so the items table and reopened modals show fresh batches.
                                        if (typeof refreshSelectedSession === 'function') {
                                            refreshSelectedSession();
                                        }
                                    }}
                                />
                            )}

                            {/* Enter Counted Quantity — hidden for tracked items (batch or expiry) */}
                            {!(selectedItemForCount.batchEnabled || selectedItemForCount.expiryEnabled) && (
                            <div className="bg-[#FFF8E7] border border-[#FDE6A9] rounded-xl p-4">

                                {/* Mode toggle — only for items already in the session with a prior count */}
                                {!selectedItemForCount._fromSearch && selectedItemForCount.countedQty != null && (
                                    <>
                                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#FDE6A9]">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Prior Count</span>
                                            <span className="text-sm font-black text-amber-600">{selectedItemForCount.countedQty} units</span>
                                        </div>
                                        <div className="flex gap-1 mb-3 bg-[#FDE6A9]/40 rounded-lg p-1">
                                            <button
                                                onClick={() => { setCountMode('add'); setCountToAdd(1); }}
                                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${countMode === 'add' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                + Add to Count
                                            </button>
                                            <button
                                                onClick={() => { setCountMode('set'); setCountToAdd(selectedItemForCount.countedQty); }}
                                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${countMode === 'set' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                = Set Total
                                            </button>
                                        </div>
                                    </>
                                )}

                                <p className="text-xs font-bold text-slate-800 mb-3">
                                    {countMode === 'add' && selectedItemForCount.countedQty != null ? 'Add Quantity' : 'Enter Counted Quantity'}
                                </p>
                                <div className="flex items-center gap-3 mb-2">
                                    <button
                                        onClick={() => setCountToAdd(Math.max(0, (countToAdd === '' ? 0 : countToAdd) - 1))}
                                        className="w-10 h-10 rounded-lg bg-white border border-[#FDE6A9] flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                        <MinusCircle className="h-5 w-5 opacity-60" />
                                    </button>
                                    <input
                                        type="number"
                                        value={countToAdd}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setCountToAdd(isNaN(val) ? '' : Math.max(0, val));
                                        }}
                                        className="flex-1 h-10 text-center font-bold text-slate-900 border border-[#FDE6A9] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-inner"
                                    />
                                    <button
                                        onClick={() => setCountToAdd((countToAdd === '' ? 0 : countToAdd) + 1)}
                                        className="w-10 h-10 rounded-lg bg-white border border-[#FDE6A9] flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                        <PlusCircle className="h-5 w-5 opacity-60" />
                                    </button>
                                </div>

                                {/* New total preview in add mode */}
                                {countMode === 'add' && selectedItemForCount.countedQty != null ? (
                                    <div className="flex items-center justify-between pt-2 border-t border-[#FDE6A9] mt-1">
                                        <span className="text-[10px] font-bold text-slate-500">New Total</span>
                                        <span className="text-sm font-black text-emerald-600">
                                            {selectedItemForCount.countedQty + (parseInt(countToAdd) || 0)} units
                                        </span>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-center text-slate-500 font-medium">
                                        {selectedItemForCount._fromSearch ? 'This will set the initial count for this item' : 'This will replace the counted quantity for this item'}
                                    </p>
                                )}
                            </div>
                            )}

                            {/* Bin capacity warning — checks TOTAL of all items in this bin, not just this item */}
                            {(() => {
                                if (!selectedItemForCount.binId) return null;
                                const bin = warehouseBins.find(b => String(b.id) === String(selectedItemForCount.binId));
                                if (!bin?.capacity) return null;

                                // Sum countedQty of all OTHER items already in this bin
                                const otherItemsInBin = (selectedSession?.items || [])
                                    .filter(i => i.id !== selectedItemForCount.id && i.binId != null && String(i.binId) === String(selectedItemForCount.binId) && i.countedQty != null)
                                    .reduce((sum, i) => sum + i.countedQty, 0);

                                const thisItemQty = countMode === 'add' && selectedItemForCount.countedQty != null
                                    ? selectedItemForCount.countedQty + (parseInt(countToAdd) || 0)
                                    : (parseInt(countToAdd) || 0);

                                const binTotal = otherItemsInBin + thisItemQty;
                                if (binTotal <= bin.capacity) return null;

                                return (
                                    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-red-700">Bin Capacity Exceeded</p>
                                            <p className="text-[11px] text-red-600 mt-0.5">
                                                Bin <strong>{bin.code}</strong> max is <strong>{bin.capacity}</strong> units.
                                                Total in bin after this entry: <strong>{binTotal}</strong>
                                                {otherItemsInBin > 0 && <span className="text-red-500"> ({otherItemsInBin} from other products + {thisItemQty} this item)</span>}.
                                                Approval will be blocked.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
                            <button
                                onClick={() => setIsCountModalOpen(false)}
                                className="px-5 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                            >
                                {(selectedItemForCount.batchEnabled || selectedItemForCount.expiryEnabled) ? 'Close' : 'Cancel'}
                            </button>
                            {!(selectedItemForCount.batchEnabled || selectedItemForCount.expiryEnabled) && (
                                <button
                                    onClick={submitCountAdd}
                                    className="px-5 py-2 flex items-center gap-2 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded-lg shadow-sm transition-colors"
                                >
                                    <Check className="h-4 w-4" />
                                    {countMode === 'add' && !selectedItemForCount?._fromSearch
                                        ? 'Add to Count'
                                        : 'Confirm Count'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const StockTaking = () => {
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'session'
    const [selectedSession, setSelectedSession] = useState(null);
    const [activeTab, setActiveTab] = useState('All Sessions');
    const [searchTerm, setSearchTerm] = useState('');
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState(null);
    const [notifModal, setNotifModal] = useState(null);
    // notifModal shape: { type: 'info'|'success'|'warning'|'error'|'confirm', title, message, confirmLabel?, confirmClass?, onConfirm? }
    const [isItemDeleting, setIsItemDeleting] = useState(false);
    const [selectedType, setSelectedType] = useState('Inventory Counting');
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [selectedCountType, setSelectedCountType] = useState('Full Stock Take (All Items)');
    const [isCountTypeDropdownOpen, setIsCountTypeDropdownOpen] = useState(false);
    // BB-015: Multi-select for category/brand filter in create modal
    const [departmentsList, setDepartmentsList] = useState([]);
    const [brandsList, setBrandsList] = useState([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
    const [selectedBrandIds, setSelectedBrandIds] = useState([]);
    const [warehousesList, setWarehousesList] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('Main Warehouse');
    const [isLoading, setIsLoading] = useState(false);
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
    const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
    const [barcodeInput, setBarcodeInput] = useState('');
    const [lastScannedItem, setLastScannedItem] = useState(null);
    const [lastScannedAt, setLastScannedAt] = useState(null);
    const [csvFile, setCsvFile] = useState(null);
    const [scanFlash, setScanFlash] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const barcodeInputRef = React.useRef(null);
    // Prevents duplicate adds from rapid barcode scanner Enter presses firing before state updates
    const addingSkusRef = React.useRef(new Set());

    const [allSessions, setAllSessions] = useState([]);
    const [warehouseBins, setWarehouseBins] = useState([]);
    // Count modal state (shared between SessionView and ProductSelector flow)
    const [isCountModalOpen, setIsCountModalOpen] = useState(false);
    const [selectedItemForCount, setSelectedItemForCount] = useState(null);
    const [countToAdd, setCountToAdd] = useState(1);
    // 'add' = increment existing count; 'set' = replace with new total
    const [countMode, setCountMode] = useState('add');
    // Undo history: each entry is { type: 'ADD_ITEM'|'UPDATE_COUNT', itemId, prevQty? }
    const [undoHistory, setUndoHistory] = useState([]);

    // Derive bin capacity violations — checks the TOTAL of all items sharing the same bin,
    // not each item individually. e.g. Product1=100 + Product2=100 in BIN01 (cap 100) → violation.
    const binCapacityViolations = React.useMemo(() => {
        if (!selectedSession?.items || warehouseBins.length === 0) return [];

        // Step 1: sum countedQty per bin across all items in the session
        const binTotals = {};
        selectedSession.items
            .filter(item => item.countedQty != null && item.binId != null)
            .forEach(item => {
                const key = String(item.binId);
                binTotals[key] = (binTotals[key] || 0) + item.countedQty;
            });

        // Step 2: for each bin total that exceeds capacity, flag every item in that bin
        return selectedSession.items
            .filter(item => item.countedQty != null && item.binId != null)
            .reduce((violations, item) => {
                const bin = warehouseBins.find(b => String(b.id) === String(item.binId));
                if (!bin?.capacity) return violations;
                const binTotal = binTotals[String(item.binId)] || 0;
                if (binTotal > bin.capacity) {
                    violations.push({
                        itemId: item.id,
                        productName: item.productName,
                        binCode: bin.code,
                        capacity: bin.capacity,
                        countedQty: item.countedQty,
                        binTotal,
                    });
                }
                return violations;
            }, []);
    }, [selectedSession?.items, warehouseBins]);

    const showNotif = React.useCallback((type, title, message) => setNotifModal({ type, title, message }), []);

    React.useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        setIsLoading(true);
        try {
            const data = await getStockTakeSessions();

            // Progress denominator = warehouse SKU count for INVENTORY_COUNTING sessions
            // (OPENING_INVENTORY has no pre-existing warehouse stock, so it falls back to
            // the session's own item count). Fetch summaries in parallel.
            const warehouseIds = [...new Set(
                data
                    .filter(s => s.type !== 'OPENING_INVENTORY' && s.warehouseId)
                    .map(s => s.warehouseId)
            )];
            const skuCountByWarehouse = {};
            await Promise.all(warehouseIds.map(async (id) => {
                try {
                    const summary = await getWarehouseStockSummary(id);
                    skuCountByWarehouse[id] = summary?.totalSkus ?? 0;
                } catch {
                    skuCountByWarehouse[id] = 0;
                }
            }));

            setAllSessions(data.map(s => {
                // Only sum variance for counted items — uncounted items carry a placeholder
                // variance of -systemQty which would corrupt the total if included.
                const countedItems = s.items?.filter(i => i.countedQty != null) || [];
                const totalValue = countedItems.reduce((sum, item) => sum + (item.varianceValue || 0), 0);
                const totalQty = countedItems.reduce((sum, item) => sum + (item.variance || 0), 0);
                const sessionTimestamps = mapSessionTimestamps(s);

                const sessionItemCount = s.items?.length || 0;
                const isOpening = s.type === 'OPENING_INVENTORY';
                const warehouseSkuCount = skuCountByWarehouse[s.warehouseId];
                const total = isOpening
                    ? sessionItemCount
                    : (warehouseSkuCount != null ? warehouseSkuCount : sessionItemCount);
                const progress = Math.min(sessionItemCount, total);

                return {
                    ...s,
                    id: s.sessionId,
                    dbId: s.id,
                    // BB-014: Map warehouseName → warehouse for the listing display
                    warehouse: s.warehouseName || s.warehouse || '',
                    ...sessionTimestamps,
                    progress,
                    total,
                    status: s.status === 'IN_PROGRESS' ? 'In Progress' :
                        s.status === 'PENDING_APPROVAL' ? 'Pending Approval' :
                            s.status === 'COMPLETED' ? 'Completed' : s.status,
                    action: s.status === 'IN_PROGRESS' ? 'Continue' :
                        s.status === 'PENDING_APPROVAL' ? 'Review' : 'View',
                    totalVarianceValue: totalValue,
                    totalVarianceQty: totalQty
                };
            }));
        } catch (error) {
            console.error("Error fetching sessions:", error);
        } finally {
            setIsLoading(false);
        }
    };


    React.useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const data = await getWarehouses();
                setWarehousesList(Array.isArray(data) ? data : []);
                if (data && data.length > 0) {
                    setSelectedWarehouse(data[0].name);
                }
            } catch (error) {
                console.error("Error fetching warehouses:", error);
            }
        };
        fetchWarehouses();
        // BB-015: Pre-load departments and brands for the create modal multi-selects
        getDepartments().then(d => setDepartmentsList(Array.isArray(d) ? d : [])).catch(() => {});
        getBrands().then(b => setBrandsList(Array.isArray(b) ? b : [])).catch(() => {});
    }, []);

    const handleStartSession = async () => {
        setIsLoading(true);
        try {
            const wh = warehousesList.find(w => w.name === selectedWarehouse);
            if (!wh) {
                setIsLoading(false);
                showNotif('warning', 'Select Warehouse', 'Please select a valid warehouse');
                return;
            }

            const sessionData = {
                warehouseName: wh.name,
                warehouseId: wh.id,
                type: selectedType,
                countType: selectedCountType,
                // BB-015: Include selected category/brand filter IDs
                selectedCategoryIds: selectedCountType === 'Selected Categories' ? selectedCategoryIds : [],
                selectedBrandIds: selectedCountType === 'Selected Brands' ? selectedBrandIds : [],
                createdBy: 'Admin User'
            };

            const newSessionRes = await createStockTakeSession(sessionData);

            // Map backend response to frontend view model
            const sessionTimestamps = mapSessionTimestamps(newSessionRes);
            const mappedSession = {
                ...newSessionRes,
                id: newSessionRes.sessionId,
                dbId: newSessionRes.id,
                warehouse: newSessionRes.warehouseName || newSessionRes.warehouse || '',
                ...sessionTimestamps,
                progress: 0,
                total: 0,
                status: 'In Progress',
                action: 'Continue',
                // Session starts empty — products are added on-demand via search/scan
                items: [],
                categoryId: newSessionRes.categoryId || null,
                brandId: newSessionRes.brandId || null,
            };

            setAllSessions(prev => [mappedSession, ...prev]);
            setSelectedSession(mappedSession);
            setLastScannedItem(null);
            setLastScannedAt(null);
            // Fetch bins for the selected warehouse so the session view has them ready
            getWarehouseBins(wh.id).then(bins => setWarehouseBins(Array.isArray(bins) ? bins : [])).catch(() => {});
            setViewMode('session');
            setIsCreateModalOpen(false);
        } catch (error) {
            console.error("Error starting session:", error);
            const msg = error.response?.data?.message || "Failed to load warehouse stock. Please try again.";
            showNotif('error', 'Cannot Create Session', msg);
        } finally {
            setIsLoading(false);
        }
    };

    // No longer needed as backend provides full enrichment


    const handleSelectProduct = async (product, initialCount = null) => {
        if (!selectedSession) return;

        const normalizedProduct = normalizeSelectorProduct(product);
        const productId = normalizedProduct.id;
        const sku = normalizedProduct.sku || normalizedProduct.code || (productId ? String(productId) : '');

        if (!productId) {
            console.error('Stock take add blocked: missing product ID', { product, normalizedProduct });
            showNotif('error', 'Product Error', 'Unable to add this product because its product ID is missing.');
            return null;
        }

        // Guard: drop concurrent calls for the same SKU (rapid barcode scanner Enter events)
        if (addingSkusRef.current.has(sku)) return;
        addingSkusRef.current.add(sku);

        setIsLoading(true);

        const existingItem = selectedSession.items?.find(i =>
            String(i.productId) === String(productId) ||
            (sku && i.sku === sku) ||
            (normalizedProduct.barcode && i.barcode === normalizedProduct.barcode)
        );

        if (existingItem) {
            if (initialCount !== null && !(existingItem.batchEnabled || existingItem.expiryEnabled)) {
                await handleCountChange(existingItem.id, (existingItem.countedQty || 0) + initialCount);
                setLastScannedItem({ ...existingItem, countedQty: (existingItem.countedQty || 0) + initialCount });
                setLastScannedAt(new Date());
            } else if (initialCount === null) {
                showNotif('info', 'Already Added', 'This product is already in the session.');
            } else {
                setLastScannedItem(existingItem);
                setLastScannedAt(new Date());
            }
            setIsLoading(false);
            addingSkusRef.current.delete(sku);
            return existingItem;
        }

        try {
            const newItem = await addItemToSession(
                selectedSession.sessionId,
                productId,
                initialCount !== null ? initialCount : 0
            );

            const mappedItem = mapStockTakeItem(newItem);

            const updatedSession = {
                ...selectedSession,
                items: [mappedItem, ...(selectedSession.items || [])]
            };

            setSelectedSession(updatedSession);
            if (initialCount !== null) {
                setLastScannedItem(mappedItem);
                setLastScannedAt(new Date());
            }
            // Push to undo history so user can remove this item
            setUndoHistory(prev => [...prev, { type: 'ADD_ITEM', itemId: newItem.id }]);
            setIsLoading(false);
            setIsProductSelectorOpen(false);
            return mappedItem;
        } catch (error) {
            console.error("Failed to add product to session:", {
                error,
                product: normalizedProduct,
                sessionId: selectedSession.sessionId,
            });
            showNotif('error', 'Error', error?.response?.data?.message || 'Failed to add product to session.');
            setIsLoading(false);
            return null;
        } finally {
            addingSkusRef.current.delete(sku);
        }
    };

    // Custom fetch function for ProductSelector — respects stock take type, count type, and filters.
    // OPENING_INVENTORY → global product list (no warehouse restriction)
    // INVENTORY_COUNTING → only products present in the session's warehouse
    // Selected Categories / Brands → additionally filtered by categoryId / brandId
    const stockTakeProductsFn = React.useCallback(async (search, page, size, signal) => {
        if (!selectedSession) {
            return Promise.resolve({ content: [], totalPages: 1, totalElements: 0, page: 0, size });
        }

        const isOpening = selectedSession.type === 'OPENING_INVENTORY';
        const isCategoryCount = selectedSession.countType === 'Selected Categories';
        const isBrandCount = selectedSession.countType === 'Selected Brands';

        if ((isCategoryCount && !selectedSession.categoryId) || (isBrandCount && !selectedSession.brandId)) {
            return { content: [], totalPages: 0, totalElements: 0, page, size };
        }

        const data = await getProductsForStockTake({
            stockTakeType: isOpening ? 'OPENING' : 'COUNTING',
            warehouseId: selectedSession.warehouseId,
            countType: selectedSession.countType || 'Full Stock Take (All Items)',
            categoryId: selectedSession.categoryId || null,
            brandId: selectedSession.brandId || null,
            search,
            page,
            size,
            signal,
        });

        const content = (data.content || []).map(product => normalizeSelectorProduct(product));

        return {
            ...data,
            content,
        };
    }, [selectedSession]);

    // Called when user picks a product from the ProductSelector search modal.
    // Instead of adding immediately, open the count modal so they can enter qty first.
    const handleProductSelectorSelect = async (product) => {
        setIsProductSelectorOpen(false);
        const normalizedProduct = normalizeSelectorProduct(product);
        const isTracked = !!(normalizedProduct.batchEnabled || normalizedProduct.expiryEnabled);

        if (isTracked) {
            const existingItem = selectedSession?.items?.find(i =>
                String(i.productId) === String(normalizedProduct.id) ||
                i.sku === (normalizedProduct.sku || normalizedProduct.code) ||
                (normalizedProduct.barcode && i.barcode === normalizedProduct.barcode)
            );
            const itemForModal = existingItem || await handleSelectProduct(normalizedProduct, 0);
            if (itemForModal) {
                setSelectedItemForCount(mapStockTakeItem(itemForModal));
                setCountMode('set');
                setCountToAdd(itemForModal.countedQty != null ? itemForModal.countedQty : 0);
                setIsCountModalOpen(true);
            }
            return;
        }

        const tempItem = {
            id: product.id,          // product ID — used by handleSelectProduct for addItemToSession
            _sessionItemId: null,    // no session item ID yet
            productId: normalizedProduct.id,
            productName: normalizedProduct.name,
            sku: normalizedProduct.sku || normalizedProduct.code,
            barcode: normalizedProduct.barcode || '',
            image: normalizedProduct.image,
            brand: normalizedProduct.brand,
            category: normalizedProduct.category,
            description: normalizedProduct.description,
            systemQty: normalizedProduct.stock ?? 0,
            countedQty: null,
            costPrice: parseFloat(normalizedProduct.cost) || 0,
            price: parseFloat(normalizedProduct.retailPrice ?? normalizedProduct.sellingPrice) || 0,
            batchEnabled: normalizedProduct.batchEnabled,
            expiryEnabled: normalizedProduct.expiryEnabled,
            batches: [],
            _fromSearch: true, // flag: needs to be added via addItemToSession first
        };
        setSelectedItemForCount(tempItem);
        setCountMode('set');
        setCountToAdd(1);
        setIsCountModalOpen(true);
    };

    const handleCountChange = (itemId, value) => {
        if (!selectedSession) return;

        const counted = value === '' ? null : parseInt(value);
        if (counted !== null && isNaN(counted)) return;

        // Capture old qty for undo BEFORE optimistic update
        const oldItem = selectedSession.items.find(i => i.id === itemId);
        const prevQty = oldItem ? oldItem.countedQty : null;

        // Optimistic update using functional updater — safe against concurrent state changes
        setSelectedSession(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                items: prev.items.map(item => {
                    if (item.id !== itemId) return item;
                    const variance = counted !== null ? counted - item.systemQty : 0 - item.systemQty;
                    const varianceValue = (item.price || 0) * variance;
                    return {
                        ...item,
                        countedQty: counted,
                        variance,
                        impact: varianceValue ? `${varianceValue > 0 ? '+' : ''}AED ${Math.abs(varianceValue).toFixed(2)}` : null,
                        status: variance === 0 ? 'Matched' : 'Variance'
                    };
                })
            };
        });

        if (prevQty !== counted) {
            setUndoHistory(prev => [...prev, { type: 'UPDATE_COUNT', itemId, prevQty }]);
        }

        // Background API call
        updateApiCount(itemId, counted).then(() => {
            setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }).catch(error => {
            console.error("Error updating count in background:", error);
        });
    };

    const handleUndoLast = async () => {
        if (undoHistory.length === 0 || !selectedSession) return;
        const last = undoHistory[undoHistory.length - 1];
        setUndoHistory(prev => prev.slice(0, -1));

        if (last.type === 'ADD_ITEM') {
            try {
                await deleteStockTakeItem(last.itemId);
                // Use functional updater so rapid undos always filter against latest state
                setSelectedSession(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== last.itemId) } : prev);
                setLastScannedItem(null);
                setLastScannedAt(null);
            } catch (err) {
                console.error('Undo ADD_ITEM failed:', err);
                setUndoHistory(prev => [...prev, last]);
            }
        } else if (last.type === 'UPDATE_COUNT') {
            handleCountChange(last.itemId, last.prevQty !== null ? String(last.prevQty) : '');
            setUndoHistory(prev => prev.slice(0, -1));
        }
    };

    const handleBinChange = async (itemId, binId) => {
        if (!selectedSession) return;
        // Capture current item state for rollback
        const prevItem = selectedSession.items.find(i => i.id === itemId);
        // Optimistic update — show change immediately in the table row
        const bin = warehouseBins.find(b => String(b.id) === String(binId));
        setSelectedSession(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === itemId
                    ? { ...item, binId: binId ? Number(binId) : null, binCode: bin?.code || null }
                    : item
            )
        }));
        try {
            const updated = await updateApiBin(itemId, binId || null);
            // Sync server response to get zoneId / locatorId
            setSelectedSession(prev => ({
                ...prev,
                items: prev.items.map(item =>
                    item.id === itemId
                        ? { ...item, binId: updated.binId, binCode: updated.binCode, zoneId: updated.zoneId, locatorId: updated.locatorId }
                        : item
                )
            }));
        } catch (error) {
            console.error('Failed to update bin assignment:', error);
            // Revert optimistic update so the UI doesn't show a bin that wasn't saved
            setSelectedSession(prev => ({
                ...prev,
                items: prev.items.map(item =>
                    item.id === itemId
                        ? { ...item, binId: prevItem?.binId || null, binCode: prevItem?.binCode || null }
                        : item
                )
            }));
            showNotif('error', 'Failed to Save Bin', error?.response?.data?.message || error.message || 'Server error');
        }
    };

    const handleDeleteItem = (itemId) => {
        if (!selectedSession) return;
        setNotifModal({
            type: 'confirm',
            title: 'Remove Item',
            message: 'Are you sure you want to remove this item from the stock take?',
            confirmLabel: 'Remove',
            confirmClass: 'bg-red-500 hover:bg-red-600 text-white',
            onConfirm: async () => {
                setNotifModal(null);
                setIsItemDeleting(true);
                try {
                    await deleteStockTakeItem(itemId);
                    // Re-fetch session from backend — ensures UI reflects DB state after delete.
                    // Local filter alone won't catch a silent backend failure.
                    const sessionId = selectedSession.sessionId;
                    const detail = await getStockTakeSession(sessionId);
                    setSelectedSession(prev => prev ? {
                        ...prev,
                        items: detail.items.map(item => ({
                            ...item,
                            impact: item.varianceValue ? `${item.varianceValue > 0 ? '+' : ''}AED ${Math.abs(item.varianceValue).toFixed(2)}` : null,
                            status: item.status.charAt(0) + item.status.slice(1).toLowerCase()
                        }))
                    } : prev);
                } catch (error) {
                    console.error("Error deleting item:", error);
                    showNotif('error', 'Error', 'Failed to delete item.');
                } finally {
                    setIsItemDeleting(false);
                }
            }
        });
    };

    const handleSaveDraft = async () => {
        if (!selectedSession) return;
        // Re-fetch all sessions from backend so the list shows correct progress/variance
        await fetchSessions();
        setViewMode('list');
    };

    // Re-fetch the current session from the backend so any server-side derived
    // values (countedQty / variance / batches list) are reflected in the UI.
    const refreshSelectedSession = async () => {
        if (!selectedSession) return;
        try {
            const detail = await getStockTakeSession(selectedSession.sessionId);
            setSelectedSession(prev => prev ? {
                ...prev,
                items: (detail.items || []).map(item => ({
                    ...item,
                    impact: item.varianceValue ? `${item.varianceValue > 0 ? '+' : ''}AED ${Math.abs(item.varianceValue).toFixed(2)}` : null,
                    status: item.status ? (item.status.charAt(0) + item.status.slice(1).toLowerCase()) : 'Pending'
                }))
            } : prev);
            // Also refresh the modal's selected item so its batch list / countedQty stays in sync
            setSelectedItemForCount(prev => {
                if (!prev) return prev;
                const fresh = (detail.items || []).find(it => it.id === prev.id);
                return fresh ? { ...prev, ...fresh } : prev;
            });
        } catch (e) {
            console.error('Failed to refresh session', e);
        }
    };

    const handleSubmitApproval = async () => {
        if (!selectedSession) return;

        const itemsWithoutBin = (selectedSession.items || []).filter(item => !item.binId);
        if (itemsWithoutBin.length > 0) {
            showNotif('warning', 'Bin Required', `${itemsWithoutBin.length} item(s) are missing a bin assignment. Please assign a bin to all items before submitting.`);
            return;
        }

        try {
            await submitForApproval(selectedSession.sessionId);
            fetchSessions();
            setViewMode('list');
        } catch (error) {
            console.error("Error submitting for approval:", error);
            showNotif('error', 'Error', 'Failed to submit session.');
        }
    };

    const handleApproveSession = async () => {
        if (!selectedSession) return;

        try {
            await approveStockTakeSession(selectedSession.sessionId, 'Admin User');
            fetchSessions();
            setIsReviewModalOpen(false);
            setViewMode('list');
        } catch (error) {
            console.error("Error approving session:", error);
            showNotif('error', 'Error', 'Failed to approve session.');
        }
    };

    const handleRejectSession = async () => {
        if (!selectedSession) return;

        try {
            await rejectStockTakeSession(selectedSession.sessionId);
            fetchSessions();
            setIsReviewModalOpen(false);
            setViewMode('list');
        } catch (error) {
            console.error("Error rejecting session:", error);
            showNotif('error', 'Error', 'Failed to reject session.');
        }
    };

    const handleCsvUpload = (e) => {
        const file = e.target.files[0];
        if (file) setCsvFile(file);
    };

    const processCsv = () => {
        if (!csvFile || !selectedSession) return;

        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const rows = text.split('\n').filter(row => row.trim());

            const updates = [];
            rows.forEach((row, index) => {
                if (index === 0 && row.toLowerCase().includes('sku')) return; // Skip header
                const [sku, count] = row.split(',').map(s => s?.trim());
                if (sku && count && !isNaN(parseInt(count))) {
                    updates.push({ sku, countedQty: parseInt(count) });
                }
            });

            if (updates.length === 0) {
                showNotif('warning', 'Invalid CSV', 'No valid data found in CSV. Format: SKU, Counted_Qty');
                setIsLoading(false);
                return;
            }

            try {
                const updatedItemsResponse = await bulkUpdateItems(selectedSession.sessionId, updates);

                // Map the response items for frontend display
                const mappedItems = updatedItemsResponse.map(item => ({
                    ...item,
                    impact: item.varianceValue ? `${item.varianceValue > 0 ? '+' : ''}AED ${Math.abs(item.varianceValue).toFixed(2)}` : null,
                    status: item.status.charAt(0) + item.status.slice(1).toLowerCase()
                }));

                setSelectedSession({ ...selectedSession, items: mappedItems });
                setIsCsvModalOpen(false);
                setCsvFile(null);
                showNotif('success', 'Import Complete', `Successfully imported ${updates.length} items.`);
            } catch (error) {
                console.error("CSV Import failed:", error);
                showNotif('error', 'Import Failed', 'Failed to process CSV import. Please check the format.');
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(csvFile);
    };

    const handleBarcodeKeyDown = async (e) => {
        if (e.key === 'Enter' && barcodeInput.trim()) {
            const scanned = barcodeInput.trim();

            // BB-011: If item already exists in session, open count modal to adjust count
            const existingItem = selectedSession?.items?.find(
                i => i.sku === scanned || i.barcode === scanned
            );
            if (existingItem) {
                setBarcodeInput('');
                setSelectedItemForCount(existingItem);
                if (existingItem.batchEnabled || existingItem.expiryEnabled) {
                    // Batched items: countedQty is derived from batches, so +1 isn't meaningful.
                    // Open the modal in 'set' mode so the user manages batch rows directly.
                    setCountMode('set');
                    setCountToAdd(existingItem.countedQty != null ? existingItem.countedQty : 0);
                } else {
                    // Each barcode scan = add 1 more to the existing count
                    setCountMode('add');
                    setCountToAdd(1);
                }
                setIsCountModalOpen(true);
                barcodeInputRef.current?.focus();
                return;
            }

            setIsLoading(true);
            try {
                // Try exact barcode lookup first (product_barcodes table), then
                // fall back to code/name search so SKU entry still works.
                let results = await searchProductByBarcode(scanned);
                if (!results || results.length === 0) {
                    results = await searchExactProducts(scanned);
                }
                if (results && results.length > 0) {
                    const product = normalizeSelectorProduct(results[0]);
                    // If the scanned product is batch-enabled, add the item with 0 count
                    // and pop the count modal so the user can enter batches manually.
                    // A naked product barcode can't tell us which physical batch the unit
                    // belongs to, so we never auto-increment for batched items.
                    const isTracked = !!(product.batchEnabled || product.expiryEnabled);
                    if (isTracked) {
                        const created = await handleSelectProduct(product, 0);
                        const newItem = created || (selectedSession?.items || []).find(
                            i => String(i.productId) === String(product.id)
                        );
                        if (newItem) {
                            setSelectedItemForCount(mapStockTakeItem(newItem));
                            setCountMode('set');
                            setCountToAdd(newItem.countedQty != null ? newItem.countedQty : 0);
                            setIsCountModalOpen(true);
                        }
                    } else {
                        await handleSelectProduct(product, 1);
                    }
                    setBarcodeInput('');
                    setScanFlash(true);
                    setTimeout(() => setScanFlash(false), 300);
                } else {
                    showNotif('warning', 'Not Found', 'Product not found');
                }
            } catch (error) {
                console.error("Barcode search failed:", error);
                showNotif('error', 'Barcode Error', error?.response?.data?.message || 'Failed to add product in the session.');
            } finally {
                setIsLoading(false);
                barcodeInputRef.current?.focus();
            }
        }
    };



    const handleActionClick = async (session) => {
        setIsLoading(true);
        try {
            const [detail, bins] = await Promise.all([
                getStockTakeSession(session.sessionId),
                getWarehouseBins(session.warehouseId).catch(() => [])
            ]);
            setWarehouseBins(Array.isArray(bins) ? bins : []);
            const sessionTimestamps = mapSessionTimestamps(detail);
            const mapped = {
                ...detail,
                id: detail.sessionId,
                dbId: detail.id,
                ...sessionTimestamps,
                status: detail.status === 'IN_PROGRESS' ? 'In Progress' :
                    detail.status === 'PENDING_APPROVAL' ? 'Pending Approval' :
                        detail.status === 'COMPLETED' ? 'Completed' : detail.status,
                // BB-014: Also map warehouseName for display in session view header
                warehouse: detail.warehouseName || detail.warehouse || '',
                items: detail.items.map(item => ({
                    ...item,
                    // BB-010: Ensure barcode is populated
                    barcode: item.barcode || item.product?.barcode || '',
                    impact: item.varianceValue ? `${item.varianceValue > 0 ? '+' : ''}AED ${Math.abs(item.varianceValue).toFixed(2)}` : null,
                    status: item.status.charAt(0) + item.status.slice(1).toLowerCase()
                }))
            };
            setSelectedSession(mapped);
            setLastScannedItem(null);
            setLastScannedAt(null);
            if (mapped.status === 'Pending Approval') {
                setIsReviewModalOpen(true);
            } else {
                setViewMode('session');
            }
        } catch (error) {
            console.error("Error loading session detail:", error);
            showNotif('error', 'Error', 'Failed to load session details.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteSession = (session) => {
        if (session.status === 'Completed') return;
        setSessionToDelete(session);
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteSession = async () => {
        if (!sessionToDelete) return;
        setIsLoading(true);
        setIsDeleteModalOpen(false);
        try {
            await deleteStockTakeSession(sessionToDelete.sessionId || sessionToDelete.id);
            await fetchSessions();
        } catch (error) {
            console.error("Error deleting session:", error);
        } finally {
            setIsLoading(false);
            setSessionToDelete(null);
        }
    };

    const handleViewOnlyClick = async (session) => {
        setIsLoading(true);
        try {
            const detail = await getStockTakeSession(session.sessionId || session.id);
            const sessionTimestamps = mapSessionTimestamps(detail);
            const mapped = {
                ...detail,
                id: detail.sessionId,
                dbId: detail.id,
                warehouse: detail.warehouseName || detail.warehouse || '',
                ...sessionTimestamps,
                status: 'View Only', // Force read-only
                items: detail.items.map(item => ({
                    ...item,
                    barcode: item.barcode || item.product?.barcode || '',
                    impact: item.varianceValue ? `${item.varianceValue > 0 ? '+' : ''}AED ${Math.abs(item.varianceValue).toFixed(2)}` : null,
                    status: item.status.charAt(0) + item.status.slice(1).toLowerCase()
                }))
            };
            setSelectedSession(mapped);
            setLastScannedItem(null);
            setLastScannedAt(null);
            setViewMode('session');
        } catch (error) {
            console.error("Error loading session detail:", error);
            showNotif('error', 'Error', 'Failed to load session details.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F7F7FA] p-4 md:p-6 font-sans text-slate-900 overflow-x-hidden">
            {viewMode === 'list' && (
                <ListView
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    allSessions={allSessions}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    setIsCreateModalOpen={setIsCreateModalOpen}
                    handleActionClick={handleActionClick}
                    handleViewOnlyClick={handleViewOnlyClick}
                    handleDeleteSession={handleDeleteSession}
                    ChevronRight={ChevronRight}
                    Plus={Plus}
                    Download={Download}
                    Search={Search}
                    ClipboardList={ClipboardList}
                    Eye={Eye}
                    Filter={Filter}
                    Trash2={Trash2}
                    getStatusStyle={getStatusStyle}
                />
            )}
            {viewMode === 'session' && (
                <SessionView
                    selectedSession={selectedSession}
                    refreshSelectedSession={refreshSelectedSession}
                    handleSaveDraft={handleSaveDraft}
                    setIsReviewModalOpen={setIsReviewModalOpen}
                    setViewMode={setViewMode}
                    barcodeInput={barcodeInput}
                    setBarcodeInput={setBarcodeInput}
                    handleBarcodeKeyDown={handleBarcodeKeyDown}
                    setIsProductSelectorOpen={setIsProductSelectorOpen}
                    setIsCsvModalOpen={setIsCsvModalOpen}
                    handleCountChange={handleCountChange}
                    handleDeleteItem={handleDeleteItem}
                    handleSelectProduct={handleSelectProduct}
                    handleUndoLast={handleUndoLast}
                    canUndo={undoHistory.length > 0}
                    lastSaved={lastSaved}
                    barcodeInputRef={barcodeInputRef}
                    scanFlash={scanFlash}
                    handleSubmitApproval={handleSubmitApproval}
                    lastScannedItem={lastScannedItem}
                    lastScannedAt={lastScannedAt}
                    warehouseBins={warehouseBins}
                    handleBinChange={handleBinChange}
                    isCountModalOpen={isCountModalOpen}
                    setIsCountModalOpen={setIsCountModalOpen}
                    selectedItemForCount={selectedItemForCount}
                    setSelectedItemForCount={setSelectedItemForCount}
                    countToAdd={countToAdd}
                    setCountToAdd={setCountToAdd}
                    countMode={countMode}
                    setCountMode={setCountMode}
                    ChevronRight={ChevronRight}
                    Undo2={Undo2}
                    Save={Save}
                    ClipboardList={ClipboardList}
                    Barcode={Barcode}
                    Keyboard={Keyboard}
                    Search={Search}
                    Filter={Filter}
                    FileDown={FileDown}
                    ImageIcon={ImageIcon}
                    Trash2={Trash2}
                    PackageSearch={PackageSearch}
                    Package={Package}
                    RefreshCw={RefreshCw}
                    CheckSquare={CheckSquare}
                    MousePointer2={MousePointer2}
                    getStatusStyle={getStatusStyle}
                    binCapacityViolations={binCapacityViolations}
                    isItemDeleting={isItemDeleting}
                />
            )}

            <ProductSelector
                isOpen={isProductSelectorOpen}
                onClose={() => setIsProductSelectorOpen(false)}
                onSelect={handleProductSelectorSelect}
                title="Add Items to Stock Take Session"
                actionLabel="Add to Session"
                customFetchFn={stockTakeProductsFn}
            />

            {/* Delete Session Confirmation Modal */}
            {isDeleteModalOpen && sessionToDelete && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-150">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-150 border border-slate-200">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                                    <Trash2 className="h-5 w-5 text-red-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold text-slate-800 mb-1">Delete Session</h3>
                                    <p className="text-sm text-slate-600">
                                        Are you sure you want to delete session{' '}
                                        <span className="font-mono font-bold text-slate-800">{sessionToDelete.id || sessionToDelete.sessionId}</span>?
                                    </p>
                                    <p className="text-xs text-red-500 font-medium mt-2">This action cannot be fully undone.</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 pb-5 flex items-center justify-end gap-3">
                            <button
                                onClick={() => { setIsDeleteModalOpen(false); setSessionToDelete(null); }}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteSession}
                                className="px-4 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
                            >
                                Delete Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create New Session Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 border border-slate-200 relative">
                        {/* Modal Header */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50 bg-slate-50/50 rounded-t-xl">
                            <div>
                                <h3 className="text-[15px] font-bold text-slate-900">Create New Stock Take Session</h3>
                                <p className="text-[11px] text-slate-500 font-medium">Configure stock counting parameters and start a new session</p>
                            </div>
                            <button
                                onClick={() => { setIsCreateModalOpen(false); setIsTypeDropdownOpen(false); setIsCountTypeDropdownOpen(false); }}
                                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5">
                            {/* Warehouse Field */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-600">
                                    Warehouse <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedWarehouse}
                                        onChange={(e) => setSelectedWarehouse(e.target.value)}
                                        className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all font-medium appearance-none"
                                    >
                                        {warehousesList.length > 0 ? (
                                            warehousesList.map((wh) => (
                                                <option key={wh.id} value={wh.name}>{wh.name}</option>
                                            ))
                                        ) : (
                                            <option>No warehouses available</option>
                                        )}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Stock Take Type (Custom Dropdown) */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-600">
                                    Stock Take Type <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <button
                                        onClick={() => {
                                            setIsTypeDropdownOpen(!isTypeDropdownOpen);
                                            setIsCountTypeDropdownOpen(false);
                                        }}
                                        className="w-full h-auto min-h-[40px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs flex items-center justify-between outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all font-medium"
                                    >
                                        <div className="text-left">
                                            <div className="font-bold text-slate-800">{selectedType}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                                {selectedType === 'Opening Inventory'
                                                    ? 'Initial stock when starting systematic inventory (Once per warehouse)'
                                                    : 'Regular stock counts (Can be done frequently)'}
                                            </div>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isTypeDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isTypeDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[150] overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                            <div
                                                onClick={() => { setSelectedType('Opening Inventory'); setIsTypeDropdownOpen(false); }}
                                                className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${selectedType === 'Opening Inventory' ? 'bg-slate-50' : ''}`}
                                            >
                                                <div className="font-bold text-slate-800 text-[11px]">Opening Inventory</div>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Initial stock when starting systematic inventory (Once per warehouse)</p>
                                            </div>
                                            <div
                                                onClick={() => { setSelectedType('Inventory Counting'); setIsTypeDropdownOpen(false); }}
                                                className={`p-3 cursor-pointer border-t border-slate-100 hover:bg-slate-50 transition-colors ${selectedType === 'Inventory Counting' ? 'bg-slate-50' : ''}`}
                                            >
                                                <div className="font-bold text-slate-800 text-[11px]">Inventory Counting</div>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Regular stock counts (Can be done frequently)</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Conditional Warning for Opening Inventory */}
                                {selectedType === 'Opening Inventory' && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] text-amber-900 leading-normal">
                                                <span className="font-bold">Important:</span> Opening Inventory can only be performed once per warehouse. This represents your initial stock when starting to use systematic inventory management.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Count Type (Custom Dropdown) */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-600">
                                    Count Type
                                </label>
                                <div className="relative">
                                    <button
                                        onClick={() => {
                                            setIsCountTypeDropdownOpen(!isCountTypeDropdownOpen);
                                            setIsTypeDropdownOpen(false);
                                        }}
                                        className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs flex items-center justify-between outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all font-medium"
                                    >
                                        <span>{selectedCountType}</span>
                                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isCountTypeDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isCountTypeDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[150] overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                            {[
                                                'Full Stock Take (All Items)',
                                                'Cycle Count (Scheduled)',
                                                'Selected Categories',
                                                'Selected Brands',
                                                'Selected Products'
                                            ].map((option) => (
                                                <div
                                                    key={option}
                                                    onClick={() => { setSelectedCountType(option); setIsCountTypeDropdownOpen(false); }}
                                                    className={`px-3 py-2.5 cursor-pointer text-[11px] font-medium transition-colors flex items-center justify-between
                                                        ${selectedCountType === option ? 'bg-[#EF4444] text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                                                >
                                                    <span>{option}</span>
                                                    {selectedCountType === option && <Check className="h-3.5 w-3.5 text-white" />}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* BB-015: Show category or brand selector when applicable */}
                            {selectedCountType === 'Selected Categories' && (
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Select Categories</label>
                                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                        {departmentsList.map(dept => (
                                            <label key={dept.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCategoryIds.includes(dept.id)}
                                                    onChange={e => setSelectedCategoryIds(prev =>
                                                        e.target.checked ? [...prev, dept.id] : prev.filter(id => id !== dept.id)
                                                    )}
                                                    className="rounded text-amber-500"
                                                />
                                                <span className="text-xs text-slate-700">{dept.name}</span>
                                            </label>
                                        ))}
                                        {departmentsList.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No categories found</p>}
                                    </div>
                                </div>
                            )}

                            {selectedCountType === 'Selected Brands' && (
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Select Brands</label>
                                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                        {brandsList.map(brand => (
                                            <label key={brand.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedBrandIds.includes(brand.id)}
                                                    onChange={e => setSelectedBrandIds(prev =>
                                                        e.target.checked ? [...prev, brand.id] : prev.filter(id => id !== brand.id)
                                                    )}
                                                    className="rounded text-amber-500"
                                                />
                                                <span className="text-xs text-slate-700">{brand.name}</span>
                                            </label>
                                        ))}
                                        {brandsList.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No brands found</p>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 flex items-center justify-end gap-2 bg-slate-50/30 rounded-b-xl">
                            <button
                                onClick={() => { setIsCreateModalOpen(false); setIsTypeDropdownOpen(false); setIsCountTypeDropdownOpen(false); }}
                                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStartSession}
                                disabled={isLoading}
                                className="flex items-center gap-2 h-10 px-6 text-xs font-semibold text-slate-900 bg-[#F5C742] rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                                Start Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Review Modal */}
            {isReviewModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h3 className="text-lg font-bold text-slate-900">Review & Approve Stock Take</h3>
                            <button
                                onClick={() => setIsReviewModalOpen(false)}
                                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Warning banner when no items have been counted */}
                            {(() => {
                                const countedItems = selectedSession?.items?.filter(i => i.countedQty != null) || [];
                                const totalItems = selectedSession?.items?.length || 0;
                                if (countedItems.length === 0) {
                                    return (
                                        <div className="p-4 bg-red-50 rounded-xl border border-red-200 flex gap-3">
                                            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-red-700 mb-1">No Items Counted</p>
                                                <p className="text-[11px] text-red-600 leading-relaxed">
                                                    None of the {totalItems} item{totalItems !== 1 ? 's' : ''} in this session have been counted yet.
                                                    Approving now will <strong>not update any stock levels</strong>. Go back and count items before approving.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }
                                if (countedItems.length < totalItems) {
                                    return (
                                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex gap-3">
                                            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-amber-700 mb-1">Partial Count — {totalItems - countedItems.length} item{totalItems - countedItems.length !== 1 ? 's' : ''} not yet counted</p>
                                                <p className="text-[11px] text-amber-600 leading-relaxed">
                                                    Only <strong>{countedItems.length} of {totalItems}</strong> items have been counted.
                                                    Uncounted items will be skipped and their stock levels will not change.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Items</p>
                                    <p className="text-xl font-black text-slate-900">{selectedSession?.items?.length || 0}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Counted</p>
                                    <p className="text-xl font-black text-emerald-600">
                                        {selectedSession?.items?.filter(i => i.countedQty != null).length || 0}
                                    </p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Net Variance</p>
                                    <p className="text-xl font-black text-amber-600">
                                        {/* Only sum counted items — uncounted items carry a -systemQty placeholder */}
                                        {selectedSession?.items?.filter(i => i.countedQty != null).reduce((s, i) => s + (i.variance || 0), 0)}
                                    </p>
                                </div>
                            </div>

                            {/* Detailed Variances List */}
                            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
                                    <ClipboardList className="h-4 w-4 text-slate-500" />
                                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Variance Details</h4>
                                </div>
                                <div className="max-h-[250px] overflow-y-auto bg-white">
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 bg-white shadow-sm ring-1 ring-slate-100 z-10">
                                            <tr>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Product</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">System Qty</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Counted</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Variance</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Value Impact</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedSession?.items?.filter(i => i.variance !== 0 && i.countedQty !== null).length > 0 ? (
                                                selectedSession?.items?.filter(i => i.variance !== 0 && i.countedQty !== null).map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="text-[11px] font-bold text-slate-900 truncate max-w-[200px]">{item.productName || item.name}</div>
                                                            <div className="text-[9px] font-mono text-slate-500 mt-0.5">{item.sku}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-600">{item.systemQty}</td>
                                                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-900">{item.countedQty}</td>
                                                        <td className={`px-4 py-3 text-center text-xs font-black ${item.variance > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                                            {item.variance > 0 ? `+${item.variance}` : item.variance}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-xs font-bold text-slate-600"><ImpactAmount value={item.impact || item.varianceValue} /></td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="5" className="px-4 py-6 text-center text-xs font-medium text-slate-400">
                                                        No variances found. All counted items match system quantities! ✨
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Financial Impact</span>
                                    <span className="text-sm font-black text-slate-900">
                                        <CurrencyAmount value={selectedSession?.items?.reduce((sum, item) => sum + parseImpactAmount(item.impact || item.varianceValue), 0) || 0} />
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Warehouse</span>
                                    <span className="text-sm font-bold text-slate-900">{selectedSession?.warehouse}</span>
                                </div>
                            </div>

                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                                <p className="text-[11px] text-amber-700 leading-relaxed">
                                    Approving this session will <strong>atomically update</strong> the inventory levels for {selectedSession?.warehouse}. This action is logged for the audit trail and cannot be undone.
                                </p>
                            </div>

                            {/* Bin capacity violation banner — blocks approval */}
                            {binCapacityViolations.length > 0 && (
                                <div className="p-4 bg-red-50 rounded-xl border border-red-300 flex gap-3">
                                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-red-700 mb-1">Bin Capacity Exceeded — Approval Blocked</p>
                                        <p className="text-[11px] text-red-600 leading-relaxed mb-2">
                                            The following items exceed their bin&apos;s physical capacity. Edit the counted quantities before approving.
                                        </p>
                                        {/* Group by bin so we show one line per bin, not one per item */}
                                        <ul className="space-y-1">
                                            {Object.values(
                                                binCapacityViolations.reduce((acc, v) => {
                                                    if (!acc[v.binCode]) acc[v.binCode] = { binCode: v.binCode, capacity: v.capacity, binTotal: v.binTotal, products: [] };
                                                    acc[v.binCode].products.push(v.productName);
                                                    return acc;
                                                }, {})
                                            ).map((group, i) => (
                                                <li key={i} className="text-[11px] text-red-700 font-semibold">
                                                    • Bin <strong>{group.binCode}</strong>: total <strong>{group.binTotal}</strong> / max <strong>{group.capacity}</strong>
                                                    <span className="font-normal text-red-600"> ({group.products.join(', ')})</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50/50 border-t border-slate-100 shrink-0">
                            <button
                                onClick={() => setIsReviewModalOpen(false)}
                                className="px-5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRejectSession}
                                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-all"
                            >
                                <XCircle className="h-4 w-4" /> Reject Session
                            </button>
                            <button
                                onClick={handleApproveSession}
                                disabled={!selectedSession?.items?.some(i => i.countedQty != null) || binCapacityViolations.length > 0}
                                className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-[#10B981] rounded-lg hover:bg-emerald-600 transition-all shadow-md shadow-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                            >
                                <Check className="h-4 w-4" /> Approve & Update Stock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unified Notification / Confirm Modal */}
            {notifModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-150">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-150 border border-slate-200">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border
                                    ${notifModal.type === 'error'   ? 'bg-red-50 border-red-100'    :
                                      notifModal.type === 'warning' ? 'bg-amber-50 border-amber-100' :
                                      notifModal.type === 'success' ? 'bg-emerald-50 border-emerald-100' :
                                      notifModal.type === 'confirm' ? 'bg-red-50 border-red-100'    :
                                                                      'bg-blue-50 border-blue-100'}`}>
                                    {notifModal.type === 'error'   && <AlertCircle className="h-5 w-5 text-red-500" />}
                                    {notifModal.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                                    {notifModal.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                                    {notifModal.type === 'confirm' && <Trash2 className="h-5 w-5 text-red-500" />}
                                    {notifModal.type === 'info'    && <Info className="h-5 w-5 text-blue-500" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold text-slate-800 mb-1">{notifModal.title}</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">{notifModal.message}</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 pb-5 flex items-center justify-end gap-3">
                            {notifModal.type === 'confirm' ? (
                                <>
                                    <button
                                        onClick={() => setNotifModal(null)}
                                        className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={notifModal.onConfirm}
                                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors shadow-sm ${notifModal.confirmClass || 'bg-red-500 hover:bg-red-600 text-white'}`}
                                    >
                                        {notifModal.confirmLabel || 'Confirm'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setNotifModal(null)}
                                    className="px-5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    OK
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Import Modal */}
            {isCsvModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200 border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Import Stock Data</h3>
                            <button onClick={() => setIsCsvModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 flex flex-col items-center justify-center gap-3">
                                <FileDown className="h-8 w-8 text-slate-300" />
                                <div className="text-center">
                                    <p className="text-[11px] font-bold text-slate-600">Select CSV File</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">Format: SKU, Counted_Qty</p>
                                </div>
                                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" id="csv-upload" />
                                <label htmlFor="csv-upload" className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer shadow-sm hover:bg-slate-50 transition-all">
                                    Browse Files
                                </label>
                                {csvFile && <p className="text-[10px] font-bold text-amber-600 truncate max-w-full italic">{csvFile.name}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsCsvModalOpen(false)} className="flex-1 h-9 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancel</button>
                                <button
                                    onClick={processCsv}
                                    disabled={!csvFile || isLoading}
                                    className="flex-1 h-9 rounded-lg text-xs font-bold bg-[#F5C742] text-slate-900 shadow-sm hover:bg-amber-400 transition-all disabled:opacity-50"
                                >
                                    {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Process Import'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockTaking;
