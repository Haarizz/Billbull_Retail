
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X, Box, Loader2, ChevronLeft, ChevronRight, Clock, Folder, Package, Tag } from 'lucide-react';
import { getImageUrl } from '../utils/urlUtils';
import { getProductsList, createProduct, getProductById } from '../api/productsApi';
import { getBrands } from '../api/brandsApi';
import { getUnits } from '../api/unitsApi';
import CurrencyAmount from './CurrencyAmount';
const PAGE_SIZE = 15;
const RECENT_KEY = 'billbull_recent_products';
const MAX_RECENT = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

const normalizeProductId = (value) => {
    const numericId = Number(value);
    return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
};

const normalizeRecentIds = (value) => {
    if (!Array.isArray(value)) return [];

    const normalizedIds = value
        .map(item => {
            if (item == null) return null;
            if (typeof item === 'object') return normalizeProductId(item.id ?? item.productId);
            return normalizeProductId(item);
        })
        .filter(Boolean);

    return [...new Set(normalizedIds)].slice(0, MAX_RECENT);
};

const persistRecentIds = (ids) => {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(normalizeRecentIds(ids)));
    } catch {
        // Ignore localStorage write failures in private mode or restricted browsers.
    }
};

const getRecentIds = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        const normalizedIds = normalizeRecentIds(stored);

        // Migrate older localStorage entries that stored full product snapshots.
        if (JSON.stringify(stored) !== JSON.stringify(normalizedIds)) {
            persistRecentIds(normalizedIds);
        }

        return normalizedIds;
    } catch {
        return [];
    }
};

const normalizeRecentProduct = (product, detail = null) => {
    const detailProduct = detail?.product || {};
    const primaryUnitName = detail?.inventory?.defaultUnit?.name || '';
    const detailPackings = Array.isArray(detail?.inventory?.packings) ? detail.inventory.packings : [];
    const derivedUnits = detailPackings
        .map(packing => packing?.unitName || packing?.unit?.name)
        .filter(Boolean);
    const derivedConversions = detailPackings.reduce((acc, packing) => {
        const unitName = packing?.unitName || packing?.unit?.name;
        if (unitName && packing?.conversion != null) acc[unitName] = packing.conversion;
        return acc;
    }, {});
    const derivedPrices = detailPackings.reduce((acc, packing) => {
        const unitName = packing?.unitName || packing?.unit?.name;
        if (unitName && packing?.price != null) acc[unitName] = packing.price;
        return acc;
    }, {});
    const derivedCosts = detailPackings.reduce((acc, packing) => {
        const unitName = packing?.unitName || packing?.unit?.name;
        if (unitName && packing?.cost != null) acc[unitName] = packing.cost;
        return acc;
    }, {});
    const normalizedId = normalizeProductId(product?.id ?? detailProduct?.id);
    const primaryBarcode = detail?.inventory?.packings?.find?.(packing => packing?.barcode)?.barcode || '';
    const primaryImage =
        detail?.primaryImage ||
        detailProduct?.primaryImage ||
        product?.primaryImage ||
        product?.image ||
        '';

    return {
        ...detailProduct,
        ...product,
        id: normalizedId,
        name: detailProduct?.name || product?.name || '',
        code: detailProduct?.code || product?.code || '',
        sku: detailProduct?.sku || product?.sku || detailProduct?.code || product?.code || '',
        description:
            detailProduct?.shortDesc ||
            detailProduct?.description ||
            product?.description ||
            product?.shortDesc ||
            detailProduct?.name ||
            product?.name ||
            '',
        image: primaryImage,
        primaryImage,
        barcode: product?.barcode || primaryBarcode || '',
        cost: detail?.pricing?.cost ?? product?.cost ?? null,
        retailPrice: detail?.pricing?.retailPrice ?? product?.retailPrice ?? product?.sellingPrice ?? null,
        sellingPrice: detail?.pricing?.retailPrice ?? product?.sellingPrice ?? product?.retailPrice ?? null,
        stock: product?.stock ?? detailProduct?.stock ?? 0,
        category:
            product?.category ||
            product?.departmentName ||
            detailProduct?.category ||
            detailProduct?.department?.name ||
            'General',
        departmentName: product?.departmentName || detailProduct?.department?.name || null,
        unitName: product?.unitName || detailProduct?.unitName || detailProduct?.unit || primaryUnitName || '',
        availableUnits: product?.availableUnits || derivedUnits,
        unitConversions: product?.unitConversions || derivedConversions,
        unitPrices: product?.unitPrices || derivedPrices,
        unitCosts: product?.unitCosts || derivedCosts,
        pricing: detail?.pricing || product?.pricing || null,
        inventory: detail?.inventory || product?.inventory || null,
        packings: product?.packings || detail?.inventory?.packings || [],
    };
};

const saveRecent = (product) => {
    const productId = normalizeProductId(product?.id);
    if (!productId) return [];

    const next = [productId, ...getRecentIds().filter(id => id !== productId)].slice(0, MAX_RECENT);
    persistRecentIds(next);
    return next;
};

const StockBadge = ({ stock }) => {
    if (stock > 10) return <span className="text-emerald-600 font-bold">{stock}</span>;
    if (stock > 0) return <span className="text-orange-500 font-bold">{stock}</span>;
    return <span className="text-red-500 font-bold">Out of stock</span>;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SkeletonCard = () => (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex justify-between items-center animate-pulse">
        <div className="flex gap-4 flex-1">
            <div className="w-12 h-12 shrink-0 bg-slate-200 rounded-md" />
            <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-slate-200 rounded w-1/3" />
                <div className="h-4 bg-slate-200 rounded w-2/3" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
            </div>
        </div>
        <div className="ml-4 shrink-0 space-y-2 text-right">
            <div className="h-5 bg-slate-200 rounded w-20 ml-auto" />
            <div className="h-7 bg-slate-200 rounded w-24 ml-auto" />
        </div>
    </div>
);

// ── Quick Add Modal ──────────────────────────────────────────────────────────

const QuickAddModal = ({ isOpen, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        code: `PRD${Math.floor(Math.random() * 100000)}`,
        retailPrice: '',
        cost: '',
        brandId: '',
        unitId: ''
    });
    const [brands, setBrands] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            Promise.all([getBrands(), getUnits()])
                .then(([b, u]) => {
                    setBrands(b);
                    setUnits(u);
                    if (b.length > 0) setFormData(prev => ({ ...prev, brandId: b[0].id }));
                    if (u.length > 0) setFormData(prev => ({ ...prev, unitId: u[0].id }));
                })
                .catch(console.error);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                product: {
                    name: formData.name,
                    code: formData.code,
                    productType: 'STOCK',
                    status: 'ACTIVE',
                    brand: { id: parseInt(formData.brandId) }
                },
                pricing: {
                    cost: parseFloat(formData.cost) || 0,
                    retailPrice: parseFloat(formData.retailPrice) || 0
                },
                inventory: {
                    defaultUnit: { id: parseInt(formData.unitId) },
                    packings: [{ unit: parseInt(formData.unitId), qty: 1, level: 1 }]
                },
                tax: { salesTax: 5, purchaseTax: 5 }
            };

            const fData = new FormData();
            fData.append("data", JSON.stringify(payload));

            const res = await createProduct(fData);
            onSuccess(res.product); // Returning the newly created product
        } catch (err) {
            console.error("Failed to create product:", err);
            alert("Failed to create product. Check console.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Plus size={18} className="text-emerald-500" /> Quick Add Product
                    </h3>
                    <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 col-span-2">
                            <label className="text-xs font-bold text-slate-500">Product Name *</label>
                            <input autoFocus required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" placeholder="E.g. Wireless Mouse" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">Item Code *</label>
                            <input required type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">Brand *</label>
                            <select required value={formData.brandId} onChange={e => setFormData({ ...formData, brandId: e.target.value })} className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500 bg-white">
                                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">Cost Price</label>
                            <input type="number" step="0.01" value={formData.cost} onChange={e => setFormData({ ...formData, cost: e.target.value })} className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" placeholder="0.00" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">Retail Price *</label>
                            <input required type="number" step="0.01" value={formData.retailPrice} onChange={e => setFormData({ ...formData, retailPrice: e.target.value })} className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" placeholder="0.00" />
                        </div>
                        <div className="space-y-1 col-span-2">
                            <label className="text-xs font-bold text-slate-500">Default Unit *</label>
                            <select required value={formData.unitId} onChange={e => setFormData({ ...formData, unitId: e.target.value })} className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500 bg-white">
                                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors">Cancel</button>
                        <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors flex justify-center items-center gap-2">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Save Product</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * ProductSelector — ERP-grade server-side search + pagination.
 *
 * Features:
 *  • Self-fetching (no products prop needed)
 *  • AbortController — cancels stale requests, prevents race-condition overwrites
 *  • Debounced search (350 ms), page auto-resets to 0 on every new search
 *  • Keyboard nav: ↑↓ arrows, Enter to add highlighted item, Esc to close
 *  • Stock-aware badges: green > 10, orange > 0, red = out-of-stock
 *  • Out-of-stock cards dimmed but still selectable
 *  • Recently-selected memory (last 5, via localStorage), shown on empty search
 *  • Skeleton cards on first load; spinner overlay on subsequent fetches
 *  • Stable min-height + always-rendered footer — no layout shift
 */
const ProductSelector = ({
    isOpen,
    onClose,
    onSelect,
    onInlineAdd = null,
    title = 'Select Items from Products / Services',
    actionLabel = 'Add to Quotation',
    mode = 'sales',
    warehouseId = null,
    customFetchFn = null,  // (search, page, pageSize, signal) => Promise<{ content, totalPages, totalElements }>
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState([]);
    const [totalFound, setTotalFound] = useState(0);
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [focusedIdx, setFocusedIdx] = useState(-1);   // keyboard nav index
    const [recentProducts, setRecentProducts] = useState([]);
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [entryQty, setEntryQty] = useState('1');
    const [entryPrice, setEntryPrice] = useState('');
    const [entryDisc, setEntryDisc] = useState('0');

    const debounceRef = useRef(null);
    const abortRef = useRef(null);   // AbortController for current in-flight request
    const searchInputRef = useRef(null);
    const listRef = useRef(null);
    const qtyInputRef = useRef(null);
    const priceInputRef = useRef(null);
    const discInputRef = useRef(null);

    const inlineEntryEnabled = typeof onInlineAdd === 'function';
    const priceLabel = mode === 'purchase' ? 'Cost' : 'Price';

    // ── Fetch (with AbortController) ─────────────────────────────────────────
    const fetchProducts = useCallback(async (query, pageNum, whId) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        try {
            const data = customFetchFn
                ? await customFetchFn(query, pageNum, PAGE_SIZE, controller.signal)
                : await getProductsList(pageNum, PAGE_SIZE, query, controller.signal, whId);
            setProducts(data.content || []);
            setTotalFound(data.totalElements || 0);
            setTotalPages(data.totalPages || 0);
            setPage(data.page ?? pageNum);
            setFocusedIdx((data.content || []).length > 0 ? 0 : -1);
        } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
                console.error('ProductSelector fetch error:', err);
            }
        } finally {
            if (abortRef.current === controller) {
                setLoading(false);
                setInitialLoad(false);
            }
        }
    }, [customFetchFn]);

    const loadRecentProducts = useCallback(async (isActive = () => true) => {
        const recentIds = getRecentIds();
        if (!recentIds.length) {
            if (isActive()) setRecentProducts([]);
            return;
        }

        const detailResults = await Promise.all(
            recentIds.map(async (id) => {
                try {
                    const detail = await getProductById(id);
                    return normalizeRecentProduct({ id }, detail);
                } catch (error) {
                    console.error(`Failed to refresh recent product ${id}:`, error);
                    return null;
                }
            })
        );

        const detailMap = new Map(
            detailResults
                .filter(product => Number.isInteger(product?.id))
                .map(product => [product.id, product])
        );
        const nextRecentProducts = recentIds
            .map(id => detailMap.get(id))
            .filter(Boolean)
            .slice(0, MAX_RECENT);

        persistRecentIds(nextRecentProducts.map(product => product.id));

        if (isActive()) {
            setRecentProducts(nextRecentProducts);
        }
    }, []);

    const syncRecentProducts = useCallback((product) => {
        const normalizedProduct = normalizeRecentProduct(product);
        setRecentProducts(prev => [
            normalizedProduct,
            ...prev.filter(item => item.id !== normalizedProduct.id)
        ].slice(0, MAX_RECENT));
    }, []);

    const clearInlineEntry = useCallback((nextSearch = '') => {
        setSelectedProduct(null);
        setEntryQty('1');
        setEntryPrice('');
        setEntryDisc('0');
        setSearchQuery(nextSearch);
        setTimeout(() => searchInputRef.current?.focus(), 60);
    }, []);

    const getInlineDefaults = useCallback((product) => {
        const normalizedProduct = normalizeRecentProduct(product);
        const rawDefaultPrice = mode === 'purchase'
            ? normalizedProduct.cost
            : normalizedProduct.retailPrice ?? normalizedProduct.sellingPrice;
        const parsedDefaultPrice = parseFloat(rawDefaultPrice);
        const parsedDefaultDiscount = parseFloat(normalizedProduct.maxDiscount ?? 0);

        return {
            normalizedProduct,
            qty: 1,
            price: Number.isFinite(parsedDefaultPrice) ? parsedDefaultPrice : 0,
            disc: Number.isFinite(parsedDefaultDiscount) ? parsedDefaultDiscount : 0,
        };
    }, [mode]);

    const primeInlineEntry = useCallback((product) => {
        const defaults = getInlineDefaults(product);

        setSelectedProduct(defaults.normalizedProduct);
        setEntryQty(String(defaults.qty));
        setEntryPrice(String(defaults.price));
        setEntryDisc(String(defaults.disc));
        setTimeout(() => qtyInputRef.current?.focus(), 60);
    }, [getInlineDefaults]);

    const handleImmediateSelect = useCallback((product) => {
        saveRecent(product);
        syncRecentProducts(product);
        onSelect(product);
        onClose(); // ✅ Force close modal after immediate selection
    }, [onSelect, syncRecentProducts, onClose]);

    const handleInlineAdd = useCallback(() => {
        if (!selectedProduct || !inlineEntryEnabled) return;

        const parsedQty = parseFloat(entryQty) || 1;
        const parsedPrice = parseFloat(entryPrice) || 0;
        const parsedDisc = parseFloat(entryDisc) || 0;

        onInlineAdd(selectedProduct, parsedQty, parsedPrice, parsedDisc);
        saveRecent(selectedProduct);
        syncRecentProducts(selectedProduct);
        clearInlineEntry('');
        fetchProducts('', 0, warehouseId);
    }, [
        clearInlineEntry,
        entryDisc,
        entryPrice,
        entryQty,
        fetchProducts,
        inlineEntryEnabled,
        onInlineAdd,
        selectedProduct,
        syncRecentProducts,
        warehouseId,
    ]);

    const handleInlineButtonAdd = useCallback((product) => {
        // ✅ ALWAYS call handleImmediateSelect for the card's "Select" button.
        // This ensures clicking the button closes the modal and adds the item.
        handleImmediateSelect(product);
    }, [handleImmediateSelect]);

    // Reset + load when modal opens; clean up on close
    useEffect(() => {
        let active = true;

        if (isOpen) {
            setSearchQuery('');
            setPage(0);
            setInitialLoad(true);
            setProducts([]);
            setFocusedIdx(-1);
            setRecentProducts([]);
            setSelectedProduct(null);
            setEntryQty('1');
            setEntryPrice('');
            setEntryDisc('0');
            loadRecentProducts(() => active);
            fetchProducts('', 0, warehouseId);
            setTimeout(() => searchInputRef.current?.focus(), 50);
        } else {
            // Cancel any in-flight request when modal is closed
            if (abortRef.current) abortRef.current.abort();
            setProducts([]);
            setTotalFound(0);
            setTotalPages(0);
            setInitialLoad(true);
            setRecentProducts([]);
            setSelectedProduct(null);
            setEntryQty('1');
            setEntryPrice('');
            setEntryDisc('0');
        }

        return () => {
            active = false;
        };
    }, [isOpen, warehouseId, loadRecentProducts]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounce search → always reset to page 0
    useEffect(() => {
        if (!isOpen) return;
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(0);
            fetchProducts(searchQuery, 0, warehouseId);
        }, 350);
        return () => clearTimeout(debounceRef.current);
    }, [searchQuery, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keyboard navigation ──────────────────────────────────────────────────
    const handleKeyDown = (e) => {
        if (!isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        if (e.target !== searchInputRef.current) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIdx(prev => {
                    const next = Math.min(prev + 1, products.length - 1);
                    // Scroll focused card into view
                    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                    return next;
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIdx(prev => {
                    const next = Math.max(prev - 1, -1);
                    if (next >= 0) listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                    return next;
                });
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIdx >= 0 && products[focusedIdx]) {
                    handleSelect(products[focusedIdx]);
                }
                break;
            default:
                break;
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage < 0 || newPage >= totalPages) return;
        setPage(newPage);
        fetchProducts(searchQuery, newPage, warehouseId);
    };

    // Keyboard / Enter → show inline entry form (fast entry flow)
    const handleSelect = useCallback((product) => {
        if (inlineEntryEnabled) {
            primeInlineEntry(product);
            return;
        }

        handleImmediateSelect(product);
    }, [handleImmediateSelect, inlineEntryEnabled, primeInlineEntry]);

    // Mouse click → add immediately with defaults and close the modal
    const handleMouseSelect = useCallback((product) => {
        if (inlineEntryEnabled) {
            const defaults = getInlineDefaults(product);
            onInlineAdd(defaults.normalizedProduct, defaults.qty, defaults.price, defaults.disc);
            saveRecent(defaults.normalizedProduct);
            syncRecentProducts(defaults.normalizedProduct);
            onClose();
            return;
        }
        handleImmediateSelect(product);
    }, [getInlineDefaults, handleImmediateSelect, inlineEntryEnabled, onClose, onInlineAdd, syncRecentProducts]);

    if (!isOpen) return null;

    // Show recently-selected section only when search is empty and we have recents
    const showRecent = !searchQuery && recentProducts.length > 0 && !initialLoad;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200"
            onKeyDown={handleKeyDown}
        >
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* ── Header ── */}
                <div className="p-5 border-b border-slate-100 bg-white space-y-4 flex-shrink-0 rounded-t-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-[17px] font-bold text-slate-800 mb-1">{title}</h2>
                            <p className="text-[12px] text-slate-500">
                                {inlineEntryEnabled ? (
                                    <>
                                        Type a product, press <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">Enter</kbd>, use <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">Tab</kbd> to move through qty and {priceLabel.toLowerCase()}, then <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">Tab</kbd> again to add the item.
                                    </>
                                ) : (
                                    <>
                                        Search below or use <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">↑</kbd> <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">↓</kbd> <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">Enter</kbd> <kbd className="px-1 py-0.5 border rounded bg-slate-50 text-[10px] font-sans">Esc</kbd> to navigate.
                                    </>
                                )}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/80" size={16} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search by item code, name, SKU, barcode..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 transition-all text-slate-700 font-medium"
                            />
                            {loading && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Loader2 size={16} className="animate-spin text-emerald-500" />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setShowQuickAdd(true)}
                            className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-[13px] font-bold shadow-sm hover:bg-slate-800 transition-all"
                        >
                            <Plus size={16} /> New Product
                        </button>
                    </div>

                    {inlineEntryEnabled && selectedProduct && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[12px] font-bold text-slate-800 truncate">
                                        {selectedProduct.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                        {selectedProduct.code || 'No code'} {selectedProduct.unitName ? `· ${selectedProduct.unitName}` : ''}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => clearInlineEntry(searchQuery)}
                                    className="shrink-0 text-slate-400 hover:text-slate-600 p-1"
                                    title="Clear selected product"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <label className="space-y-1">
                                    <span className="block text-[11px] font-semibold text-slate-500">Qty</span>
                                    <input
                                        ref={qtyInputRef}
                                        type="number"
                                        min="0.001"
                                        step="1"
                                        value={entryQty}
                                        onChange={(e) => setEntryQty(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Tab') {
                                                e.preventDefault();
                                                priceInputRef.current?.focus();
                                                priceInputRef.current?.select?.();
                                            }
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-50"
                                    />
                                </label>

                                <label className="space-y-1">
                                    <span className="block text-[11px] font-semibold text-slate-500">{priceLabel}</span>
                                    <input
                                        ref={priceInputRef}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={entryPrice}
                                        onChange={(e) => setEntryPrice(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Tab') {
                                                e.preventDefault();
                                                discInputRef.current?.focus();
                                                discInputRef.current?.select?.();
                                            }
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-50"
                                    />
                                </label>

                                <label className="space-y-1">
                                    <span className="block text-[11px] font-semibold text-slate-500">Disc %</span>
                                    <input
                                        ref={discInputRef}
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={entryDisc}
                                        onChange={(e) => setEntryDisc(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Tab') {
                                                e.preventDefault();
                                                handleInlineAdd();
                                            }
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-50"
                                    />
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Quick Add Modal Overlay ── */}
                <QuickAddModal
                    isOpen={showQuickAdd}
                    onClose={() => setShowQuickAdd(false)}
                    onSuccess={(newProduct) => {
                        setShowQuickAdd(false);
                        handleSelect(newProduct);
                    }}
                />

                {/* ── List ── */}
                <div className="flex-1 overflow-y-auto p-4 bg-white min-h-[300px] relative">

                    {/* Dimming overlay while refreshing (not first load) */}
                    {loading && !initialLoad && (
                        <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center rounded pointer-events-none">
                            <Loader2 size={28} className="animate-spin text-emerald-500" />
                        </div>
                    )}

                    {/* Recently Selected */}
                    {showRecent && (
                        <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock size={12} className="text-slate-400" />
                                <h3 className="text-[11px] font-semibold text-slate-500">Recently Selected</h3>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {recentProducts.map(rp => (
                                    <button
                                        key={rp.id}
                                        onClick={() => handleMouseSelect(rp)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full hover:border-emerald-400 hover:shadow-sm transition-all group"
                                    >
                                        {rp.image ? (
                                            <img src={getImageUrl(rp.image)} alt="" className="w-4 h-4 rounded-sm object-cover" />
                                        ) : (
                                            <Package size={12} className="text-slate-400 group-hover:text-emerald-500" />
                                        )}
                                        <span className="text-[11px] font-bold text-slate-700">{rp.code}</span>
                                        <span className="text-[11px] text-slate-500 max-w-[120px] truncate" title={rp.description || rp.name}>{rp.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {!loading && !initialLoad && (
                        <div className="text-[11px] font-medium text-slate-400 mb-3 ml-1">
                            {searchQuery ? `Search Results for "${searchQuery}"` : 'All Products (A - Z)'}
                        </div>
                    )}

                    {/* Skeleton — first load */}
                    {initialLoad && loading && (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && !initialLoad && products.length === 0 && (
                        <div className="text-center py-10 text-slate-400">
                            <Box size={32} className="mx-auto mb-2 text-slate-300" />
                            {searchQuery
                                ? <>No products match <strong>"{searchQuery}"</strong>.</>
                                : 'No active products found.'}
                        </div>
                    )}

                    {/* Product cards */}
                    <div className="space-y-3" ref={listRef}>
                        {products.map((product, idx) => {
                            const rawRetail = product.retailPrice != null ? parseFloat(product.retailPrice) : NaN;
                            const rawSelling = product.sellingPrice != null ? parseFloat(product.sellingPrice) : NaN;
                            const salesPrice = !isNaN(rawRetail) ? rawRetail : (!isNaN(rawSelling) ? rawSelling : 0);
                            const cost = (product.cost != null && !isNaN(parseFloat(product.cost))) ? parseFloat(product.cost) : null;
                            const gpRaw = salesPrice > 0 && cost != null ? ((salesPrice - cost) / salesPrice) * 100 : null;
                            const gp = product.gp ?? (gpRaw != null ? `${gpRaw.toFixed(1)}%` : null);
                            const category = product.category ?? product.departmentName ?? 'General';
                            const stock = product.stock ?? 0;
                            const unit = product.unitName ?? product.unit ?? '';
                            const outOfStock = stock <= 0;
                            const isFocused = idx === focusedIdx;

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => handleMouseSelect(product)}
                                    className={`
                                        bg-white border rounded p-4 flex justify-between items-start shadow-sm
                                        cursor-pointer transition-all duration-200
                                        ${outOfStock ? 'opacity-80' : 'hover:shadow-md hover:border-emerald-200'}
                                        ${isFocused
                                            ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-emerald-50/10'
                                            : 'border-slate-200'}
                                        mb-3
                                    `}
                                >
                                    {/* Left: Product Info */}
                                    <div className="flex gap-4 flex-1">
                                        <div className="w-12 h-12 rounded bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                                            {product.image ? (
                                                <img src={getImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package size={20} className="text-slate-300" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] font-bold text-slate-500 tracking-wider font-mono">{product.code}</span>
                                                <span className="text-[10px] px-2 py-0.5 text-blue-600 bg-blue-50/50 rounded font-medium">{category}</span>
                                                {outOfStock ? (
                                                    <span className="text-[10px] px-2 py-0.5 text-red-500 bg-red-50/50 rounded font-medium border border-red-100">out of stock</span>
                                                ) : (
                                                    <span className="text-[10px] px-2 py-0.5 text-emerald-600 bg-emerald-50/50 rounded font-medium">active</span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-[15px] mb-0.5">{product.name}</h3>
                                            <p className="text-[11px] text-slate-500 mb-2">{product.description || 'Premium quality item.'}</p>

                                            <div className="flex items-center gap-4 text-[11px]">
                                                <span className="flex items-center gap-1.5 text-slate-500">
                                                    <Package size={12} className="text-slate-400" /> Stock: <StockBadge stock={stock} />
                                                </span>
                                                <span className="text-slate-400">SKU: {product.sku || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Price & Action */}
                                    <div className="text-right shrink-0 ml-4 flex flex-col items-end">
                                        <CurrencyAmount value={salesPrice} className="text-[15px] font-bold text-slate-800 mb-1.5" />
                                        <div className="flex gap-2 mb-3">
                                            {cost != null && <div className="text-[9px] text-slate-400">Cost: <CurrencyAmount value={cost} /></div>}
                                            {gp != null && <div className="text-[9px] text-slate-400">GP: {gp}</div>}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleMouseSelect(product); }}
                                            className="bg-[#FFD700] text-slate-800 px-4 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 hover:bg-[#FACC15] transition-colors shadow-sm"
                                        >
                                            <Plus size={12} strokeWidth={2.5} /> {inlineEntryEnabled ? 'Select' : actionLabel}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Footer — stable height, always rendered ── */}
                <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-500 min-w-[120px]">
                        {loading ? 'Searching…' : `${totalFound} product(s) found`}
                    </span>

                    {/* Pagination — always rendered, just disabled when N/A */}
                    <div className="flex items-center gap-1">
                        <button
                            disabled={page === 0 || loading}
                            onClick={() => handlePageChange(page - 1)}
                            className="p-1.5 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50 disabled:cursor-not-allowed transition-colors"
                            title="Previous page"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs text-slate-500 px-3 min-w-[70px] text-center">
                            {totalPages > 0 ? `${page + 1} / ${totalPages}` : '—'}
                        </span>
                        <button
                            disabled={page >= totalPages - 1 || loading}
                            onClick={() => handlePageChange(page + 1)}
                            className="p-1.5 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50 disabled:cursor-not-allowed transition-colors"
                            title="Next page"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-slate-200 rounded text-xs font-bold hover:bg-slate-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProductSelector;
