import React from 'react';
import { Search, FileX } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getSalesOrderStatusBadge } from '../utils/salesOrderStatusBadge';

// Compact sales-order card for the Transaction Preview's left column. Mirrors
// InvoiceCardList — a switcher, not the system-of-record list table.
function SalesOrderCard({ order, selected, onSelect, currency }) {
    const status = getSalesOrderStatusBadge(order.status);
    const orderTotal = Number(order.orderTotal ?? 0);
    const balance = Number(order.balanceAmount ?? Math.max(0, orderTotal - Number(order.advanceAmount ?? 0)));
    const isSettled = balance <= 0;

    const chips = [
        order.linkedProforma && { label: 'PI', ref: order.linkedProforma, cls: 'bg-purple-50 text-purple-700 border-purple-200' },
        order.linkedQuotation && { label: 'QT', ref: order.linkedQuotation, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    ].filter(Boolean);

    return (
        <button
            type="button"
            onClick={() => onSelect(order)}
            aria-current={selected ? 'true' : undefined}
            className={`w-full text-left p-3 rounded-lg border mb-2 transition-all ${
                selected
                    ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742] shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">{order.customerName || '—'}</span>
                <CurrencyAmount value={orderTotal} currency={currency} className="font-bold text-slate-800 text-sm whitespace-nowrap" />
            </div>

            <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">
                    {formatDisplayDate(order.orderDate)} <span className="text-slate-300">•</span>{' '}
                    <span className="font-mono text-slate-600">{order.soNumber}</span>
                </span>
                {isSettled ? (
                    <span className="text-[11px] font-medium text-emerald-600 whitespace-nowrap">Settled</span>
                ) : (
                    <span className="text-[11px] font-medium text-red-500 whitespace-nowrap">
                        Bal: <CurrencyAmount value={balance} currency={currency} />
                    </span>
                )}
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
                {order.paymentMethod && (
                    <>
                        <span className="text-slate-300 text-[10px]">•</span>
                        <span className="border border-slate-200 px-1.5 py-0.5 rounded-full text-[10px] bg-white text-slate-600">
                            {order.paymentMethod}
                        </span>
                    </>
                )}
            </div>
        </button>
    );
}

export default function SalesOrderCardList({
    orders = [],
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
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">All Sales Orders</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder="Search orders..."
                        aria-label="Search sales orders"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-shadow"
                    />
                </div>
            </div>

            <div className="overflow-y-auto p-3 pt-2 flex-1 max-h-[1000px]">
                {loading && orders.length === 0 && (
                    <div className="space-y-2 animate-pulse" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 bg-slate-100 rounded-lg border border-slate-200" />
                        ))}
                    </div>
                )}
                {!loading && orders.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <FileX size={24} className="mx-auto mb-2 text-slate-300" />
                        No sales orders found.
                    </div>
                )}
                {orders.map((order) => (
                    <SalesOrderCard
                        key={order.id}
                        order={order}
                        selected={order.id === selectedId}
                        onSelect={onSelect}
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    );
}
