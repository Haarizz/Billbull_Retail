import React from 'react';
import { Search, FileX } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getPurchaseInvoiceStatusBadge, getPurchasePaymentBadge } from '../utils/purchaseInvoiceStatusBadge';

// Compact purchase-invoice card for the Transaction Preview's left column.
// Consumes the list-row shape (mapInvoiceFromApi): id = invoice number,
// dbId = backend id, vendor, total, outstanding, status, payment, source.
function PurchaseInvoiceCard({ inv, selected, onSelect, currency }) {
    const status = getPurchaseInvoiceStatusBadge(inv.status);
    const payBadge = getPurchasePaymentBadge(inv.payment || inv.paymentStatus);
    const total = Number(inv.total ?? inv.grandTotal ?? 0);
    const outstanding = Number(inv.outstanding ?? inv.balanceDue ?? 0);
    const isSettled = outstanding <= 0;

    return (
        <button
            type="button"
            onClick={() => onSelect(inv)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-all ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742] shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{inv.vendor || inv.vendorName || '—'}</span>
                <CurrencyAmount value={total} currency={currency} className="font-bold text-slate-800 text-sm whitespace-nowrap" />
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">
                    {formatDisplayDate(inv.date || inv.documentDate)} <span className="text-slate-300">•</span>{' '}
                    <span className="font-mono text-slate-600">{inv.id || inv.invoiceNumber}</span>
                </span>
                {isSettled ? (
                    <span className="text-[11px] font-medium text-emerald-600 whitespace-nowrap">Settled</span>
                ) : (
                    <span className="text-[11px] font-medium text-red-500 whitespace-nowrap">
                        Due: <CurrencyAmount value={outstanding} currency={currency} />
                    </span>
                )}
            </div>

            {inv.refNo && inv.refNo !== '-' && (
                <div className="flex flex-wrap gap-1 mb-2">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-blue-50 text-blue-700 border-blue-200">
                        Ref: {inv.refNo}
                    </span>
                </div>
            )}

            <div className="flex items-center gap-1.5">
                <span className={status.colorClasses}>{status.label}</span>
                {payBadge && <span className={payBadge.colorClasses}>{payBadge.label}</span>}
            </div>
        </button>
    );
}

export default function PurchaseInvoiceCardList({
    invoices = [],
    selectedDbId,
    onSelect,
    currency,
    searchTerm,
    onSearchChange,
    loading = false,
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col max-h-[calc(100vh-9rem)]">
            <div className="p-3 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All Purchase Invoices</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search invoices..."
                        aria-label="Search purchase invoices"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-shadow"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1 max-h-[1000px]">
                {loading && invoices.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && invoices.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <FileX size={24} className="mx-auto mb-2 text-slate-300" />
                        No purchase invoices found.
                    </div>
                )}
                {invoices.map((inv) => (
                    <PurchaseInvoiceCard
                        key={inv.dbId}
                        inv={inv}
                        selected={inv.dbId === selectedDbId}
                        onSelect={onSelect}
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    );
}
