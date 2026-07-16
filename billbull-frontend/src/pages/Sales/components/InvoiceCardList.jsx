import React from 'react';
import { Search } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getInvoiceStatusBadge } from '../utils/invoiceStatusBadge';

// Compact invoice card for the Transaction Preview's left column. Deliberately
// lighter than the list table (which stays the system of record for scanning
// many columns) — this is a switcher: enough to recognise the invoice you want
// while the preview panel holds focus on the right.
function InvoiceCard({ inv, selected, onSelect, currency }) {
    const status = getInvoiceStatusBadge(inv.status, inv);
    const balance = Number(inv.balance ?? 0);
    const isSettled = balance <= 0;

    // Linked-document chips: the four fields the invoice actually carries.
    const chips = [
        inv.linkedSalesOrder && { label: 'SO', ref: inv.linkedSalesOrder, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
        inv.linkedDeliveryNote && { label: 'DN', ref: inv.linkedDeliveryNote, cls: 'bg-green-50 text-green-700 border-green-200' },
        inv.linkedProforma && { label: 'PI', ref: inv.linkedProforma, cls: 'bg-purple-50 text-purple-700 border-purple-200' },
        inv.linkedQuotation && { label: 'QT', ref: inv.linkedQuotation, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    ].filter(Boolean);

    return (
        <button
            type="button"
            onClick={() => onSelect(inv)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-colors ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742]'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{inv.customerName || '—'}</span>
                <CurrencyAmount value={inv.invoiceTotal || 0} currency={currency} className="font-bold text-slate-800 text-sm whitespace-nowrap" />
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">
                    {formatDisplayDate(inv.invoiceDate)} <span className="text-slate-300">•</span>{' '}
                    <span className="font-mono text-slate-600">{inv.invoiceNumber}</span>
                </span>
                {isSettled ? (
                    <span className="text-[11px] font-medium text-emerald-600 whitespace-nowrap">Paid in Full</span>
                ) : (
                    <span className="text-[11px] font-medium text-red-500 whitespace-nowrap">
                        Due: <CurrencyAmount value={balance} currency={currency} />
                    </span>
                )}
            </div>

            {chips.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {chips.map((c) => (
                        <span key={c.label} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${c.cls}`}>
                            {c.label}: {c.ref}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-1.5">
                <span className={status.colorClasses}>{status.label}</span>
                {inv.paymentMode && (
                    <>
                        <span className="text-slate-300 text-[10px]">•</span>
                        <span className="border border-slate-200 px-1.5 py-0.5 rounded text-[10px] bg-white text-slate-600">
                            {inv.paymentMode}
                        </span>
                    </>
                )}
            </div>
        </button>
    );
}

export default function InvoiceCardList({
    invoices = [],
    selectedId,
    onSelect,
    currency,
    searchTerm,
    onSearchChange,
    loading = false,
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col max-h-[calc(100vh-9rem)]">
            <div className="p-3 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All Invoices</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search invoices..."
                        aria-label="Search invoices"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742]"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1">
                {loading && invoices.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && invoices.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm">No Invoices found.</div>
                )}
                {invoices.map((inv) => (
                    <InvoiceCard
                        key={inv.id}
                        inv={inv}
                        selected={inv.id === selectedId}
                        onSelect={onSelect}
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    );
}
