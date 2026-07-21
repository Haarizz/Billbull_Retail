import React from 'react';
import { Search, FileX, Truck, Package } from 'lucide-react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getDeliveryNoteStatusBadge, getPodBadge } from '../utils/deliveryNoteStatusBadge';

// Compact delivery-note card for the Transaction Preview's left column. A DN is
// a fulfillment doc, so the card leads with qty/boxes and status/POD rather than
// a money value.
function DeliveryNoteCard({ dn, selected, onSelect }) {
    const status = getDeliveryNoteStatusBadge(dn.status);
    const pod = getPodBadge(dn.status, dn.pod);
    const dnNo = dn.dnNo || dn.dnNumber;
    const dnDate = dn.date || dn.dnDate;

    const chips = [
        (dn.siNo || dn.linkedSalesInvoiceNumber) && { label: 'SI', ref: dn.siNo || dn.linkedSalesInvoiceNumber, cls: 'bg-green-50 text-green-700 border-green-200' },
        (dn.piNo && dn.piNo !== '-') && { label: 'PI', ref: dn.piNo, cls: 'bg-purple-50 text-purple-700 border-purple-200' },
        dn.soNo && { label: 'SO', ref: dn.soNo, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    ].filter(Boolean);

    return (
        <button
            type="button"
            onClick={() => onSelect(dn)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-all ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742] shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{dn.customerName || '—'}</span>
                <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{dnNo}</span>
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">{formatDisplayDate(dnDate)}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Package size={11} className="text-slate-400" /> {dn.qty ?? '—'}</span>
                    {dn.warehouse && <span className="inline-flex items-center gap-1 truncate max-w-24"><Truck size={11} className="text-slate-400" /> {dn.warehouse}</span>}
                </span>
            </div>

            {chips.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {chips.map((c) => (
                        <span key={c.label} className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${c.cls}`}>
                            {c.label}: {c.ref}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-1.5">
                <span className={status.colorClasses}>{status.label}</span>
                {pod && <span className={pod.colorClasses}>{pod.label}</span>}
            </div>
        </button>
    );
}

export default function DeliveryNoteCardList({
    deliveryNotes = [],
    selectedId,
    onSelect,
    searchTerm,
    onSearchChange,
    loading = false,
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col max-h-[calc(100vh-9rem)]">
            <div className="p-3 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All Delivery Notes</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search delivery notes..."
                        aria-label="Search delivery notes"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-shadow"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1 max-h-[1000px]">
                {loading && deliveryNotes.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && deliveryNotes.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <FileX size={24} className="mx-auto mb-2 text-slate-300" />
                        No delivery notes found.
                    </div>
                )}
                {deliveryNotes.map((dn) => (
                    <DeliveryNoteCard
                        key={dn.id}
                        dn={dn}
                        selected={dn.id === selectedId}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );
}
