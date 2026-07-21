import React from 'react';
import { RotateCcw, Receipt } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import TableSkeleton from '../../../components/common/TableSkeleton';
import VoucherRowMenu from './VoucherRowMenu';

// Renders the invoice's payment/receipt history. Data comes from
// useInvoicePaymentHistory (shared with the existing Receipts modal so both
// surfaces read the same merged sales-payment + receipt-voucher list).
//
// Responsive: a table at md+, a card list on mobile (no horizontal scroll). This
// renders bare (no card/header) — it lives inside the workspace "Payments" tab,
// and the executive-summary strip above already owns the paid/balance totals, so
// no stat tiles or headings are repeated here.
export default function PaymentHistorySection({
    payments, loading, error, onRetry, currency,
    invoiceNumber, customerPhone,
    onPrintVoucher, onDownloadPdf, onEmailVoucher,
}) {
    if (error) {
        return (
            <div className="py-8 text-center text-sm text-slate-400">
                Couldn't load payment history.
                {onRetry && (
                    <button onClick={onRetry} className="ml-2 inline-flex items-center gap-1 text-[#D99A00] font-medium hover:underline">
                        <RotateCcw size={12} /> Retry
                    </button>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="overflow-x-auto" aria-busy="true">
                <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100"><TableSkeleton cols={6} rows={3} /></tbody>
                </table>
            </div>
        );
    }

    if (payments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Receipt size={20} className="mb-1.5 text-slate-300" />
                <span className="text-sm">No payments recorded yet.</span>
            </div>
        );
    }

    const menu = (p) => (
        <VoucherRowMenu
            receipt={p}
            customerPhone={customerPhone}
            invoiceNumber={invoiceNumber}
            currency={currency}
            onPrintVoucher={onPrintVoucher}
            onDownloadPdf={onDownloadPdf}
            onEmail={onEmailVoucher}
        />
    );

    return (
        <>
            {/* md+: table */}
            <div className="hidden md:block overflow-x-auto" aria-label="Payment history">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                        <tr>
                            <th className="px-4 py-2 text-left">Receipt No.</th>
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-4 py-2 text-left">Mode</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                            <th className="px-4 py-2 text-left">Received By</th>
                            <th className="px-4 py-2 text-right" aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {payments.map((p) => (
                            <tr key={p.key} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{p.receiptNumber}</td>
                                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDisplayDate(p.date)}</td>
                                <td className="px-4 py-2.5">
                                    <span className="border border-slate-200 px-2 py-0.5 rounded-full text-[10px] bg-white text-slate-600 whitespace-nowrap">{p.mode}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-emerald-600 tabular-nums whitespace-nowrap">
                                    <CurrencyAmount value={p.amount} currency={currency} />
                                </td>
                                <td className="px-4 py-2.5 text-slate-500 truncate max-w-45" title={p.receivedBy || 'System'}>{p.receivedBy || 'System'}</td>
                                <td className="px-4 py-2.5 text-right">{menu(p)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* mobile: card list */}
            <div className="md:hidden p-3 space-y-2" aria-label="Payment history">
                {payments.map((p) => (
                    <div key={p.key} className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-medium text-slate-700 text-sm truncate">{p.receiptNumber}</div>
                                <div className="text-[11px] text-slate-400">{formatDisplayDate(p.date)}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <CurrencyAmount value={p.amount} currency={currency} className="font-bold text-emerald-600 text-sm tabular-nums" />
                                {menu(p)}
                            </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px]">
                            <span className="border border-slate-200 px-2 py-0.5 rounded-full bg-slate-50 text-slate-600">{p.mode}</span>
                            <span className="text-slate-400 truncate">by {p.receivedBy || 'System'}</span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
