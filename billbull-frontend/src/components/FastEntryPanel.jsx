import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Zap, Search, Plus, Loader2, Check } from 'lucide-react';
import { getProductsList } from '../api/productsApi';

const FastEntryPanel = ({ isOpen, onClose, onAddItem, mode = 'sales', currency = 'AED' }) => {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [qty, setQty] = useState(1);
    const [price, setPrice] = useState('');
    const [disc, setDisc] = useState(0);

    const [addedItems, setAddedItems] = useState([]);

    const searchRef = useRef(null);
    const qtyRef = useRef(null);
    const priceRef = useRef(null);
    const discRef = useRef(null);
    const abortRef = useRef(null);
    const dropdownRef = useRef(null);

    const priceLabel = mode === 'purchase' ? 'Cost' : 'Price';

    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setResults([]);
            setSelectedProduct(null);
            setAddedItems([]);
            setShowDropdown(false);
            setTimeout(() => searchRef.current?.focus(), 60);
        }
    }, [isOpen]);

    // Debounced product search
    useEffect(() => {
        if (!search.trim() || selectedProduct) {
            setResults([]);
            setShowDropdown(false);
            return;
        }

        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await getProductsList(0, 8, search, controller.signal);
                setResults(data.content || []);
                setHighlightIdx(0);
                setShowDropdown(true);
            } catch (err) {
                if (err.name !== 'AbortError' && err.name !== 'CanceledError') console.error(err);
            } finally {
                setLoading(false);
            }
        }, 280);

        return () => {
            clearTimeout(t);
            controller.abort();
        };
    }, [search, selectedProduct]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (!dropdownRef.current) return;
        const highlighted = dropdownRef.current.querySelector('[data-highlighted="true"]');
        if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    }, [highlightIdx]);

    const selectProduct = useCallback((product) => {
        setSelectedProduct(product);
        setShowDropdown(false);
        const defaultPrice = mode === 'purchase'
            ? (product.cost ?? 0)
            : (product.retailPrice ?? product.sellingPrice ?? 0);
        setPrice(String(defaultPrice));
        setDisc(product.maxDiscount || 0);
        setQty(1);
        setTimeout(() => qtyRef.current?.focus(), 60);
    }, [mode]);

    const clearSelection = useCallback(() => {
        setSelectedProduct(null);
        setSearch('');
        setResults([]);
        setShowDropdown(false);
        setTimeout(() => searchRef.current?.focus(), 60);
    }, []);

    const handleAdd = useCallback(() => {
        if (!selectedProduct) return;
        const parsedQty = parseFloat(qty) || 1;
        const parsedPrice = parseFloat(price) || 0;
        const parsedDisc = parseFloat(disc) || 0;

        onAddItem(selectedProduct, parsedQty, parsedPrice, parsedDisc);

        setAddedItems(prev => [...prev, {
            name: selectedProduct.description || selectedProduct.name,
            qty: parsedQty,
            price: parsedPrice,
            total: parsedQty * parsedPrice * (1 - parsedDisc / 100),
        }]);

        clearSelection();
    }, [selectedProduct, qty, price, disc, onAddItem, clearSelection]);

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (!showDropdown || !results.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (results[highlightIdx]) selectProduct(results[highlightIdx]); }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="absolute right-6 top-[70px] w-80 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[88vh] animate-in slide-in-from-top-2 duration-150">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#1a2e1a] text-white rounded-t-xl shrink-0">
                    <div className="flex items-center gap-2">
                        <Zap size={14} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-bold">Quick Item Entry</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Search / Selected chip */}
                <div className="p-3 border-b border-slate-100 shrink-0">
                    {!selectedProduct ? (
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Type product name or code…"
                                className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-yellow-400"
                            />
                            {loading && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin pointer-events-none" />}

                            {/* Results dropdown */}
                            {showDropdown && (
                                <div ref={dropdownRef} className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-20 overflow-hidden max-h-52 overflow-y-auto">
                                    {results.length > 0 ? results.map((p, i) => (
                                        <button
                                            key={p.id}
                                            data-highlighted={i === highlightIdx ? 'true' : undefined}
                                            onMouseEnter={() => setHighlightIdx(i)}
                                            onClick={() => selectProduct(p)}
                                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${i === highlightIdx ? 'bg-yellow-50' : 'hover:bg-slate-50'}`}
                                        >
                                            <div className="min-w-0 mr-2">
                                                <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                                                <div className="text-slate-400 text-[10px]">{p.code}</div>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                p.stock > 10 ? 'bg-emerald-50 text-emerald-600' :
                                                p.stock > 0  ? 'bg-orange-50 text-orange-500' :
                                                               'bg-red-50 text-red-500'
                                            }`}>
                                                {p.stock > 0 ? p.stock : '0'}
                                            </span>
                                        </button>
                                    )) : (
                                        <div className="px-3 py-4 text-xs text-slate-400 text-center">No products found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                            <div className="min-w-0 mr-2">
                                <div className="text-xs font-bold text-slate-800 truncate">{selectedProduct.description || selectedProduct.name}</div>
                                <div className="text-[10px] text-slate-500">{selectedProduct.code} · {selectedProduct.unitName || 'PCS'}</div>
                            </div>
                            <button onClick={clearSelection} className="shrink-0 text-slate-400 hover:text-red-500 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Qty / Price / Disc inputs */}
                {selectedProduct && (
                    <div className="p-3 border-b border-slate-100 shrink-0 space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Qty</label>
                                <input
                                    ref={qtyRef}
                                    type="number"
                                    min="0.001"
                                    step="1"
                                    value={qty}
                                    onChange={e => setQty(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Tab') { e.preventDefault(); priceRef.current?.focus(); }
                                        else if (e.key === 'Enter') { e.preventDefault(); priceRef.current?.focus(); }
                                    }}
                                    className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-400"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">{priceLabel}</label>
                                <input
                                    ref={priceRef}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Tab') { e.preventDefault(); discRef.current?.focus(); }
                                        else if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                                    }}
                                    className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-400"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Disc %</label>
                                <input
                                    ref={discRef}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={disc}
                                    onChange={e => setDisc(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                                    className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-400"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleAdd}
                            className="w-full bg-[#1a2e1a] text-white text-xs font-bold py-2 rounded-lg hover:bg-[#243d24] flex items-center justify-center gap-1.5 transition-colors"
                        >
                            <Plus size={13} />
                            Add to List
                            <kbd className="ml-1 text-[9px] text-slate-400 bg-white/10 border border-white/20 rounded px-1">↵</kbd>
                        </button>
                    </div>
                )}

                {/* Added items log */}
                {addedItems.length > 0 && (
                    <div className="p-3 flex-1 overflow-y-auto min-h-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                            Added ({addedItems.length})
                        </div>
                        <div className="space-y-1">
                            {addedItems.map((item, i) => (
                                <div key={i} className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-100 px-2 py-1.5 rounded">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Check size={11} className="text-emerald-500 shrink-0" />
                                        <span className="text-slate-700 font-medium truncate">{item.name}</span>
                                    </div>
                                    <span className="text-slate-500 text-[10px] shrink-0 ml-2">
                                        ×{item.qty} = {currency} {item.total.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer keyboard hints + Done */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 rounded-b-xl shrink-0">
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400 mb-2.5">
                        <span>Type</span>
                        <span className="text-slate-300">→</span>
                        <kbd className="bg-white border border-slate-200 rounded px-1 py-px font-mono text-slate-500">↑↓</kbd>
                        <span className="text-slate-300">→</span>
                        <kbd className="bg-white border border-slate-200 rounded px-1 py-px font-mono text-slate-500">Enter</kbd>
                        <span>select</span>
                        <span className="text-slate-300">→</span>
                        <kbd className="bg-white border border-slate-200 rounded px-1 py-px font-mono text-slate-500">Tab</kbd>
                        <span>Qty</span>
                        <span className="text-slate-300">→</span>
                        <kbd className="bg-white border border-slate-200 rounded px-1 py-px font-mono text-slate-500">Tab</kbd>
                        <span>{priceLabel}</span>
                        <span className="text-slate-300">→</span>
                        <kbd className="bg-white border border-slate-200 rounded px-1 py-px font-mono text-slate-500">↵</kbd>
                        <span>Add</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-full text-xs font-bold text-slate-600 py-1.5 border border-slate-200 rounded-lg hover:bg-white transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FastEntryPanel;
