import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Search, X, Plus, Check, Phone, Mail, MapPin, ChevronDown, Store } from 'lucide-react';
import { createVendor } from '../api/vendorsApi';
import { useBranch } from '../context/BranchContext';
import toast from 'react-hot-toast';

// ==========================================
// VENDOR SELECTOR — Search Modal + New Vendor Panel
// ==========================================
const VendorSelector = ({
    isOpen,
    onClose,
    onSelect,
    vendors = [],
    selectedCode = '',
    onVendorCreated
}) => {
    const { defaultBranchName, activeBranch } = useBranch();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const searchInputRef = useRef(null);
    const listRef = useRef(null);

    // Cap rendered rows: rendering thousands of vendors on every keystroke is
    // what makes selection feel heavy. Filter the full list, paint only MAX_VISIBLE.
    const MAX_VISIBLE = 50;

    // New Vendor Panel
    const [isNewVendorOpen, setIsNewVendorOpen] = useState(false);
    const [vendorGroups, setVendorGroups] = useState(['Supplier', 'Service Provider', 'Contractor', 'Consultant']);
    const [newVendor, setNewVendor] = useState({
        code: '',
        name: '',
        groupType: 'Supplier',
        address: '',
        mobile: '',
        email: '',
        trn: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    // Focus search on open
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setDebouncedQuery('');
            setHighlightedIndex(0);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Debounce the query so fast typing doesn't re-filter/re-render every keystroke
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery), 180);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Filter vendors
    const filtered = useMemo(() => {
        let list = [...vendors];

        // Ensure a default Cash Vendor always exists for quick non-credit purchases
        const hasCashVendor = list.some(v => (v.name || '').toLowerCase().includes('cash vendor') || (v.code || '') === 'CASH_VENDOR');
        if (!hasCashVendor) {
            list = [{
                id: 'CASH-VENDOR-ID',
                code: 'CASH_VENDOR',
                name: 'Cash Vendor',
                mobile: '',
                phone: '',
                trn: '',
                address: 'Direct Purchase',
                balance: 0,
                creditStatus: 'Good',
                groupType: 'Supplier'
            }, ...list];
        }

        if (!debouncedQuery.trim()) return list;
        const q = debouncedQuery.toLowerCase();
        return list.filter(v =>
            (v.code || '').toLowerCase().includes(q) ||
            (v.name || '').toLowerCase().includes(q) ||
            (v.mobile || v.phone || '').toLowerCase().includes(q)
        );
    }, [vendors, debouncedQuery]);

    // Only the first MAX_VISIBLE matches are rendered/navigable.
    const visible = useMemo(() => filtered.slice(0, MAX_VISIBLE), [filtered]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex(prev => Math.min(prev + 1, visible.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && visible.length > 0) {
                e.preventDefault();
                handleSelect(visible[highlightedIndex]);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, visible, highlightedIndex]);

    // Scroll highlighted into view  
    useEffect(() => {
        if (listRef.current) {
            const el = listRef.current.children[highlightedIndex];
            if (el) el.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex]);

    const handleSelect = (vendor) => {
        onSelect(vendor);
        onClose();
    };

    const getCreditBadge = (status) => {
        const s = (status || '').toLowerCase();
        if (s === 'good' || s === 'active') return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">Active</span>;
        if (s === 'hold' || s === 'on hold' || s === 'inactive') return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">Inactive</span>;
        if (s === 'medium' || s === 'warning') return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-200">Review</span>;
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">Active</span>;
    };

    const getGroupBadge = (group) => {
        const colors = {
            'Supplier': 'bg-blue-50 text-blue-600 border-blue-200',
            'Service Provider': 'bg-purple-50 text-purple-600 border-purple-200',
            'Contractor': 'bg-amber-50 text-amber-600 border-amber-200',
            'Consultant': 'bg-slate-100 text-slate-600 border-slate-300'
        };
        const cls = colors[group] || 'bg-slate-50 text-slate-500 border-slate-200';
        return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>{group}</span>;
    };

    // Handle new vendor save
    const handleSaveNewVendor = async () => {
        if (!newVendor.name.trim()) {
            toast.error('Vendor Name is required');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                code: newVendor.code.trim() || undefined,
                name: newVendor.name.trim(),
                groupType: newVendor.groupType,
                address: newVendor.address.trim(),
                mobile: newVendor.mobile.trim(),
                email: newVendor.email.trim(),
                trn: newVendor.trn.trim(),
                status: 'ACTIVE',
                branch: activeBranch?.name || defaultBranchName || '',
                allocatedBranches: [activeBranch?.name || defaultBranchName].filter(Boolean)
            };

            const saved = await createVendor(payload);

            // Reset form
            setNewVendor({ code: '', name: '', groupType: 'Supplier', address: '', mobile: '', email: '', trn: '' });
            setIsNewVendorOpen(false);

            // Refresh parent list
            if (onVendorCreated) onVendorCreated();

            // Auto-select the new vendor
            const vendorToSelect = saved || payload;
            onSelect(vendorToSelect);
            onClose();

        } catch (err) {
            console.error('Failed to create vendor', err);
            toast.error('Failed to save vendor. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* SEARCH MODAL */}
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-bold text-slate-800">Search Vendor</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Search by vendor code, name, or mobile number</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={18} className="text-slate-400" />
                    </button>
                </div>

                {/* Search Input */}
                <div className="px-5 py-3 border-b border-slate-100">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setHighlightedIndex(0); }}
                            placeholder="Type vendor code, name or mobile..."
                            className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all"
                        />
                        {/* New Vendor Button inside search bar */}
                        <button
                            onClick={() => setIsNewVendorOpen(true)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-yellow-400 text-slate-800 rounded-md hover:bg-yellow-500 transition-colors"
                            title="Add New Vendor"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                {/* Vendor List */}
                <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 max-h-[50vh]">
                    {visible.length > 0 ? (
                        visible.map((vend, idx) => {
                            const isSelected = vend.code === selectedCode;
                            const isHighlighted = idx === highlightedIndex;

                            return (
                                <div
                                    key={vend.id || vend.code}
                                    onClick={() => handleSelect(vend)}
                                    className={`
                                        px-5 py-3 cursor-pointer border-b border-slate-50 last:border-0 transition-all
                                        ${isSelected ? 'bg-yellow-50 border-l-2 border-l-yellow-400' : 'border-l-2 border-l-transparent'}
                                        ${isHighlighted ? 'bg-slate-50' : ''}
                                        hover:bg-slate-50
                                    `}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-slate-800 text-sm">{vend.name}</span>
                                                {vend.code === 'CASH_VENDOR' && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-white">Default</span>
                                                )}
                                                {getCreditBadge(vend.status || vend.creditStatus)}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Store size={11} /> {vend.code}
                                                </span>
                                                {(vend.mobile || vend.phone) && (
                                                    <span className="flex items-center gap-1">
                                                        <Phone size={11} /> {vend.mobile || vend.phone}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-1">
                                                Group: {vend.groupType || vend.group || 'General'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {isSelected && (
                                                <span className="text-xs font-bold text-yellow-600">Selected</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="py-12 text-center text-slate-400">
                            <Store size={32} className="mx-auto mb-2 text-slate-300" />
                            <p className="text-sm">No vendors found</p>
                            <p className="text-xs mt-1">Try a different search or create a new vendor</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
                    <span className="text-xs text-slate-400">
                        {filtered.length} vendor{filtered.length !== 1 ? 's' : ''} found
                        {filtered.length > MAX_VISIBLE ? ` — showing first ${MAX_VISIBLE}, refine search` : ''}
                    </span>
                    <button
                        onClick={() => setIsNewVendorOpen(true)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-800 text-xs font-bold rounded-md hover:bg-yellow-500 transition-colors"
                    >
                        <Plus size={12} /> New Vendor
                    </button>
                </div>
            </div>

            {/* ==========================================
                NEW VENDOR SLIDE-OUT PANEL
               ========================================== */}
            {isNewVendorOpen && (
                <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-[10000] animate-in slide-in-from-right duration-300 flex flex-col border-l border-slate-200">
                    {/* Panel Header */}
                    <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                        <h3 className="text-base font-bold text-slate-800">New Vendor</h3>
                        <button onClick={() => setIsNewVendorOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                            <X size={18} className="text-slate-400" />
                        </button>
                    </div>

                    {/* Panel Form */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {/* Row: Code + Group */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Vendor Code</label>
                                <input
                                    type="text"
                                    placeholder="Auto / Manual"
                                    value={newVendor.code}
                                    onChange={(e) => setNewVendor({ ...newVendor, code: e.target.value })}
                                    className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Vendor Group</label>
                                <div className="relative">
                                    <select
                                        value={newVendor.groupType}
                                        onChange={(e) => setNewVendor({ ...newVendor, groupType: e.target.value })}
                                        className="w-full text-sm p-2 border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 pr-8"
                                    >
                                        {vendorGroups.map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* Vendor Name */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Vendor Name</label>
                            <input
                                type="text"
                                placeholder="Enter vendor name"
                                value={newVendor.name}
                                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                                className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                            />
                        </div>

                        {/* Address */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Address</label>
                            <textarea
                                rows={2}
                                placeholder="Enter address"
                                value={newVendor.address}
                                onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                                className="w-full text-sm p-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                            />
                        </div>

                        {/* Phone & Email */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
                                <input
                                    type="text"
                                    placeholder="+971..."
                                    value={newVendor.mobile}
                                    onChange={(e) => setNewVendor({ ...newVendor, mobile: e.target.value })}
                                    className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                                <input
                                    type="email"
                                    placeholder="email@..."
                                    value={newVendor.email}
                                    onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                                    className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                                />
                            </div>
                        </div>

                        {/* TRN */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tax Registration No.</label>
                            <input
                                type="text"
                                placeholder="TRN number"
                                value={newVendor.trn}
                                onChange={(e) => setNewVendor({ ...newVendor, trn: e.target.value })}
                                className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                            />
                        </div>
                    </div>

                    {/* Panel Footer */}
                    <div className="px-5 py-4 border-t border-slate-100">
                        <button
                            onClick={handleSaveNewVendor}
                            disabled={isSaving}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-400 text-slate-800 text-sm font-bold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Store size={16} />
                            {isSaving ? 'Saving...' : 'Save & Use'}
                        </button>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

export default VendorSelector;
