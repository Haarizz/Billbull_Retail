import React from 'react';
import { Search, FileX, GitBranch } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getQuotationStatusBadge } from '../utils/quotationStatusBadge';

// Compact quotation card for the Transaction Preview's left column. Mirrors
// InvoiceCardList / SalesOrderCardList — a switcher, not the list table. List-row
// quotations carry a display-string status and `total`; the badge helper accepts
// either form.
function QuotationCard({ qtn, selected, onSelect, currency }) {
    const status = getQuotationStatusBadge(qtn.status);
    const total = Number(qtn.total ?? qtn.totalAmount ?? 0);
    const custName = (qtn.customerCode && (qtn.customer || '').endsWith(` - ${qtn.customerCode}`))
        ? qtn.customer.slice(0, -(` - ${qtn.customerCode}`).length)
        : (qtn.customer || qtn.customerName || '—');
    const revCount = qtn.revisions?.length || 0;

    return (
        <button
            type="button"
            onClick={() => onSelect(qtn)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-all ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742] shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{custName}</span>
                <CurrencyAmount value={total} currency={currency} className="font-bold text-slate-800 text-sm whitespace-nowrap" />
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">
                    {formatDisplayDate(qtn.date)} <span className="text-slate-300">•</span>{' '}
                    <span className="font-mono text-slate-600">{qtn.qtnNo}</span>
                </span>
                {qtn.validTill && (
                    <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                        Valid till {formatDisplayDate(qtn.validTill)}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1.5">
                <span className={status.colorClasses}>{status.label}</span>
                {revCount > 0 && (
                    <span className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                        <GitBranch size={9} /> Rev {revCount}
                    </span>
                )}
            </div>
        </button>
    );
}

export default function QuotationCardList({
    quotations = [],
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
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All Quotations</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search quotations..."
                        aria-label="Search quotations"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-shadow"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1 max-h-[1000px]">
                {loading && quotations.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && quotations.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <FileX size={24} className="mx-auto mb-2 text-slate-300" />
                        No quotations found.
                    </div>
                )}
                {quotations.map((qtn) => (
                    <QuotationCard
                        key={qtn.id}
                        qtn={qtn}
                        selected={qtn.id === selectedId}
                        onSelect={onSelect}
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    );
}
