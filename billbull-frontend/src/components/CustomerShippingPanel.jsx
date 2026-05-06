import React, { useState } from 'react';
import {
    Search, MapPin, ChevronDown, User, Truck,
    CheckCircle2, Phone, CreditCard, Star,
    Package, Calendar, ArrowRight, Building2
} from 'lucide-react';
import CurrencyAmount from './CurrencyAmount';

/**
 * CustomerShippingPanel  — Two-Row Layout (narrow-column optimised)
 * Row 1 : Customer selector + compact info
 * Row 2 : Shipping type | dispatch date | address
 */
const CustomerShippingPanel = ({
    selectedCustomer,
    onOpenCustomerSearch,
    shippingAddress = '',
    onShippingChange,
    deliveryType = 'Delivery',
    onDeliveryTypeChange,
    expectedDispatch = '',
    onExpectedDispatchChange,
    isReadOnly = false,
    currency = 'AED',
    currencySymbol,
    showAddCustomer = false,
    onAddCustomer,
}) => {
    const [isDeliveryTypeOpen, setIsDeliveryTypeOpen] = useState(false);
    const [selectedAddressIdx, setSelectedAddressIdx] = useState(null);
    const [showAddressPicker, setShowAddressPicker] = useState(false);

    const savedAddresses = selectedCustomer?.savedAddresses || [];
    const defaultIdx = savedAddresses.findIndex(a => a.isDefault);

    React.useEffect(() => {
        if (defaultIdx >= 0) setSelectedAddressIdx(defaultIdx);
        else setSelectedAddressIdx(null);
    }, [selectedCustomer?.code]);

    const handleAddressSelect = (idx) => {
        setSelectedAddressIdx(idx);
        setShowAddressPicker(false);
        const addr = savedAddresses[idx];
        if (addr && onShippingChange) {
            const formatted = [addr.address1, addr.address2, addr.city, addr.country]
                .filter(Boolean).join(', ');
            onShippingChange(formatted);
        }
    };

    const creditBadge = (status) => {
        if (!status) return { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'N/A' };
        const s = status.toLowerCase();
        if (s === 'good') return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Good' };
        if (s === 'restricted') return { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Restricted' };
        return { cls: 'bg-red-50 text-red-700 border-red-200', label: status };
    };

    const credit = creditBadge(selectedCustomer?.creditStatus);

    const deliveryOptions = [
        { label: 'Delivery', icon: Truck },
        { label: 'Pickup',   icon: Package },
        { label: 'Courier',  icon: ArrowRight },
    ];
    const ActiveIcon = deliveryOptions.find(d => d.label === deliveryType)?.icon || Truck;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* ══ ROW 1 — CUSTOMER ══ */}
            <div className="px-4 pt-4 pb-3 space-y-2.5">

                {/* Header row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded bg-yellow-50 flex items-center justify-center shrink-0">
                            <User size={11} className="text-yellow-500" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Customer</span>
                    </div>
                    {selectedCustomer && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${credit.cls}`}>
                            ● {credit.label}
                        </span>
                    )}
                </div>

                {/* Search bar */}
                <button
                    onClick={() => !isReadOnly && onOpenCustomerSearch?.()}
                    disabled={isReadOnly}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all
                        ${isReadOnly
                            ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-yellow-400 hover:shadow-sm cursor-pointer'
                        }`}
                >
                    <Search size={13} className={selectedCustomer ? 'text-yellow-500 shrink-0' : 'text-slate-400 shrink-0'} />
                    <span className="flex-1 text-left truncate font-medium">
                        {selectedCustomer
                            ? `${selectedCustomer.code} — ${selectedCustomer.name}`
                            : 'Search or select a customer…'}
                    </span>
                </button>

                {/* Customer info — compact rows, only when selected */}
                {selectedCustomer && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">

                        {/* Name + group */}
                        <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 rounded-lg border border-slate-100">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-800 truncate">{selectedCustomer.name}</div>
                                <div className="text-[10px] text-slate-500 truncate">
                                    {selectedCustomer.groupType || selectedCustomer.group || 'General'}
                                </div>
                            </div>
                        </div>

                        {/* Two-column row: Phone | Outstanding */}
                        <div className="grid grid-cols-2 gap-1.5">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 min-w-0">
                                <Phone size={10} className="text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[9px] text-slate-400 font-semibold uppercase">Phone</div>
                                    <div className="text-[10px] font-medium text-slate-700 truncate">
                                        {selectedCustomer.mobile || selectedCustomer.phone || '—'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 min-w-0">
                                <CreditCard size={10} className="text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[9px] text-slate-400 font-semibold uppercase">Balance</div>
                                    <div className="text-[10px] font-semibold text-slate-700 truncate">
                                        <CurrencyAmount value={selectedCustomer.balance || 0} currency={currency} currencySymbol={currencySymbol} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Meta row: TRN · Code · Terms */}
                        <div className="flex items-center gap-2 flex-wrap px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 text-[10px] text-slate-500">
                            <span><b className="text-slate-600">TRN:</b> {selectedCustomer.trn || '—'}</span>
                            <span className="w-px h-2.5 bg-slate-200 shrink-0" />
                            <span><b className="text-slate-600">Code:</b> {selectedCustomer.code}</span>
                            <span className="w-px h-2.5 bg-slate-200 shrink-0" />
                            <span><b className="text-slate-600">Terms:</b> {selectedCustomer.payTerms || 'Cash'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 mx-4" />

            {/* ══ ROW 2 — SHIPPING ══ */}
            <div className="px-4 pt-3 pb-4 space-y-2.5">

                {/* Header */}
                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-blue-50 flex items-center justify-center shrink-0">
                        <Truck size={11} className="text-blue-400" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Shipping</span>
                </div>

                {/* Delivery Type + Expected Dispatch — 2 equal columns */}
                <div className="grid grid-cols-2 gap-2">

                    {/* Delivery Type */}
                    <div className="relative">
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                            Type
                        </label>
                        <button
                            disabled={isReadOnly}
                            onClick={() => !isReadOnly && setIsDeliveryTypeOpen(p => !p)}
                            className={`w-full flex items-center gap-1.5 px-2.5 py-2 border rounded-lg text-xs transition-all
                                ${isReadOnly
                                    ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-yellow-400 cursor-pointer'
                                }`}
                        >
                            <ActiveIcon size={11} className="text-blue-400 shrink-0" />
                            <span className="flex-1 text-left">{deliveryType}</span>
                            <ChevronDown size={10} className="text-slate-400 shrink-0" />
                        </button>
                        {isDeliveryTypeOpen && !isReadOnly && (
                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-30 mt-1 overflow-hidden">
                                {deliveryOptions.map(({ label, icon: Icon }) => (
                                    <div
                                        key={label}
                                        onClick={() => { onDeliveryTypeChange?.(label); setIsDeliveryTypeOpen(false); }}
                                        className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 hover:bg-slate-50 transition-colors
                                            ${deliveryType === label ? 'bg-yellow-50 text-yellow-700 font-semibold' : 'text-slate-700'}`}
                                    >
                                        <Icon size={11} className={deliveryType === label ? 'text-yellow-500' : 'text-slate-400'} />
                                        {label}
                                        {deliveryType === label && <CheckCircle2 size={11} className="text-yellow-500 ml-auto" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Expected Dispatch */}
                    <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                            Dispatch Date
                        </label>
                        <input
                            type="date"
                            value={expectedDispatch}
                            onChange={e => onExpectedDispatchChange?.(e.target.value)}
                            disabled={isReadOnly}
                            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700
                                disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
                                focus:outline-none focus:border-yellow-400 transition-colors"
                        />
                    </div>
                </div>

                {/* Saved address picker — full width, only when addresses exist */}
                {savedAddresses.length > 0 && (
                    <div className="relative">
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                            Saved Address
                        </label>
                        <button
                            disabled={isReadOnly}
                            onClick={() => !isReadOnly && setShowAddressPicker(p => !p)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 border rounded-lg text-xs transition-all
                                ${isReadOnly
                                    ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-yellow-400 cursor-pointer'
                                }`}
                        >
                            <MapPin size={11} className="text-blue-400 shrink-0" />
                            <span className="flex-1 text-left truncate">
                                {selectedAddressIdx !== null && savedAddresses[selectedAddressIdx]
                                    ? `${savedAddresses[selectedAddressIdx].name}${savedAddresses[selectedAddressIdx].isDefault ? ' ★' : ''}`
                                    : 'Pick a saved address…'}
                            </span>
                            <ChevronDown size={10} className="text-slate-400 shrink-0" />
                        </button>
                        {showAddressPicker && !isReadOnly && (
                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-30 mt-1 overflow-hidden max-h-40 overflow-y-auto">
                                {savedAddresses.map((addr, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleAddressSelect(i)}
                                        className={`px-3 py-2 text-xs cursor-pointer flex items-start gap-2 hover:bg-slate-50 border-b border-slate-50 last:border-0
                                            ${selectedAddressIdx === i ? 'bg-yellow-50' : ''}`}
                                    >
                                        <MapPin size={11} className="text-yellow-500 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="font-semibold text-slate-700 flex items-center gap-1 truncate">
                                                {addr.name}
                                                {addr.isDefault && <Star size={9} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                                            </div>
                                            <div className="text-slate-500 truncate">{addr.city}{addr.country ? `, ${addr.country}` : ''}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Shipping address textarea */}
                <div>
                    <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                        Shipping Address
                    </label>
                    <textarea
                        rows={2}
                        value={shippingAddress}
                        onChange={e => onShippingChange?.(e.target.value)}
                        readOnly={isReadOnly}
                        placeholder="Enter or auto-fill shipping address…"
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 resize-none
                            focus:outline-none focus:border-yellow-400 transition-colors
                            read-only:bg-slate-50 read-only:text-slate-500 read-only:cursor-default
                            placeholder:text-slate-300"
                    />
                </div>
            </div>
        </div>
    );
};

export default CustomerShippingPanel;
