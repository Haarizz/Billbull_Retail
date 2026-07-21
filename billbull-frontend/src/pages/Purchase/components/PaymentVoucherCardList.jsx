import React from 'react';
import { Search, FileX } from 'lucide-react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getPaymentVoucherStatusBadge } from '../utils/paymentVoucherStatusBadge';

// Compact payment-voucher card for the Transaction Preview's left column.
// Consumes the list-row shape (mapVoucher): dbId, id (voucher no), vendor,
// amount (pre-formatted string), mode, status.
function PaymentVoucherCard({ voucher, selected, onSelect }) {
    const status = getPaymentVoucherStatusBadge(voucher.rawStatus || voucher.status);

    return (
        <button
            type="button"
            onClick={() => onSelect(voucher)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-all ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742] shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{voucher.vendor || '—'}</span>
                <span className="font-bold text-slate-800 text-sm tabular-nums whitespace-nowrap">{voucher.amount}</span>
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">
                    {formatDisplayDate(voucher.date)} <span className="text-slate-300">•</span>{' '}
                    <span className="font-mono text-slate-600">{voucher.id}</span>
                </span>
                {voucher.mode && <span className="text-[11px] text-slate-500 truncate max-w-24">{voucher.mode}</span>}
            </div>

            <div className="flex items-center gap-1.5">
                <span className={status.colorClasses}>{status.label}</span>
                {voucher.ref && voucher.ref !== '—' && (
                    <span className="border border-slate-200 bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px] font-medium truncate max-w-28">
                        {voucher.ref}
                    </span>
                )}
            </div>
        </button>
    );
}

export default function PaymentVoucherCardList({
    vouchers = [],
    selectedDbId,
    onSelect,
    searchTerm,
    onSearchChange,
    loading = false,
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col max-h-[calc(100vh-9rem)]">
            <div className="p-3 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All Payment Vouchers</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search vouchers..."
                        aria-label="Search payment vouchers"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-shadow"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1 max-h-[1000px]">
                {loading && vouchers.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && vouchers.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <FileX size={24} className="mx-auto mb-2 text-slate-300" />
                        No payment vouchers found.
                    </div>
                )}
                {vouchers.map((voucher) => (
                    <PaymentVoucherCard
                        key={voucher.dbId}
                        voucher={voucher}
                        selected={voucher.dbId === selectedDbId}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );
}
