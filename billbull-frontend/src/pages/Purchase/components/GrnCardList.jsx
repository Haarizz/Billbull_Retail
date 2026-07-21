import React from 'react';
import { Search, FileX, Warehouse as WarehouseIcon } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getGrnStatusBadge, getInvStatusBadge } from '../utils/grnStatusBadge';

// Compact GRN card for the Transaction Preview's left column.
function GrnCard({ grn, selected, onSelect, currency }) {
    const status = getGrnStatusBadge(grn.status);
    const invBadge = getInvStatusBadge(grn.invStatus);
    const grnNo = grn.idDisplay || grn.grnNo || grn.grnNumber;

    return (
        <button
            type="button"
            onClick={() => onSelect(grn)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-all ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742] shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{grn.vendor || grn.vendorName || '—'}</span>
                <CurrencyAmount value={grn.value ?? grn.totalValue ?? 0} currency={currency} className="font-bold text-slate-800 text-sm whitespace-nowrap" />
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">
                    {formatDisplayDate(grn.date)} <span className="text-slate-300">•</span>{' '}
                    <span className="font-mono text-slate-600">{grnNo}</span>
                </span>
                {grn.warehouse && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-28">
                        <WarehouseIcon size={11} className="text-slate-400" /> {grn.warehouse}
                    </span>
                )}
            </div>

            {grn.lpoNumber && grn.lpoNumber !== '-' && (
                <div className="flex flex-wrap gap-1 mb-2">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-blue-50 text-blue-700 border-blue-200">
                        LPO: {grn.lpoNumber}
                    </span>
                </div>
            )}

            <div className="flex items-center gap-1.5">
                <span className={status.colorClasses}>{status.label}</span>
                {invBadge && <span className={invBadge.colorClasses}>{invBadge.label}</span>}
            </div>
        </button>
    );
}

export default function GrnCardList({
    grns = [],
    selectedId,
    onSelect,
    currency,
    searchTerm,
    onSearchChange,
    loading = false,
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col max-h-[calc(100vh-9rem)]">
            <div className="p-3 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All GRNs</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search GRNs..."
                        aria-label="Search GRNs"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-shadow"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1 max-h-[1000px]">
                {loading && grns.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && grns.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <FileX size={24} className="mx-auto mb-2 text-slate-300" />
                        No GRNs found.
                    </div>
                )}
                {grns.map((grn) => (
                    <GrnCard
                        key={grn.id}
                        grn={grn}
                        selected={grn.id === selectedId}
                        onSelect={onSelect}
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    );
}
