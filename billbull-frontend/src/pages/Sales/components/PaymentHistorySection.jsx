import React from 'react';
import { Receipt, RotateCcw, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';
import TableSkeleton from '../../../components/common/TableSkeleton';
import VoucherRowMenu from './VoucherRowMenu';

// Renders the invoice's payment/receipt history. Data comes from
// useInvoicePaymentHistory (shared with the existing Receipts modal so both
// surfaces read the same merged sales-payment + receipt-voucher list).
export default function PaymentHistorySection({
    payments, loading, error, onRetry, currency,
    invoiceTotal, totalPaid, balanceDue,
    invoiceNumber, customerPhone,
    onPrintVoucher, onDownloadPdf, onEmailVoucher,
}) {
    const isSettled = Number(balanceDue) <= 0;
    const tiles = [
        { label: 'Invoice Amount', value: invoiceTotal, icon: Wallet, cls: 'text-slate-800', tint: 'bg-slate-50 border-slate-200', iconCls: 'text-slate-400' },
        { label: 'Total Paid', value: totalPaid, icon: CheckCircle2, cls: 'text-emerald-600', tint: 'bg-emerald-50/60 border-emerald-100', iconCls: 'text-emerald-400' },
        {
            label: 'Balance Due',
            value: balanceDue,
            icon: isSettled ? CheckCircle2 : AlertCircle,
            cls: isSettled ? 'text-emerald-600' : 'text-red-500',
            tint: isSettled ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100',
            iconCls: isSettled ? 'text-emerald-400' : 'text-red-400',
        },
    ];

    return (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" aria-labelledby="payment-history-heading">
            <div className="px-4 md:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h2 id="payment-history-heading" className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Receipt size={15} className="text-[#D99A00]" /> Payment History
                </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 md:p-5 border-b border-slate-100">
                {tiles.map((t) => (
                    <div key={t.label} className={`border rounded-lg p-3 text-center ${t.tint}`}>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1.5 flex items-center justify-center gap-1">
                            <t.icon size={11} className={t.iconCls} /> {t.label}
                        </div>
                        <CurrencyAmount value={t.value} currency={currency} className={`text-sm font-bold ${t.cls}`} />
                    </div>
                ))}
            </div>

            {error ? (
                <div className="py-8 text-center text-sm text-slate-400">
                    Couldn't load payment history.
                    {onRetry && (
                        <button onClick={onRetry} className="ml-2 inline-flex items-center gap-1 text-[#D99A00] font-medium hover:underline">
                            <RotateCcw size={12} /> Retry
                        </button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
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
                            {loading && <TableSkeleton cols={6} rows={3} />}
                            {!loading && payments.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No payments recorded.</td></tr>
                            )}
                            {!loading && payments.map((p) => (
                                <tr key={p.key} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-2.5 font-medium text-slate-700">{p.receiptNumber}</td>
                                    <td className="px-4 py-2.5 text-slate-500">{formatDisplayDate(p.date)}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="border border-slate-200 px-2 py-0.5 rounded-full text-[10px] bg-white text-slate-600">{p.mode}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-medium text-emerald-600">
                                        <CurrencyAmount value={p.amount} currency={currency} />
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500">{p.receivedBy || 'System'}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <VoucherRowMenu
                                            receipt={p}
                                            customerPhone={customerPhone}
                                            invoiceNumber={invoiceNumber}
                                            currency={currency}
                                            onPrintVoucher={onPrintVoucher}
                                            onDownloadPdf={onDownloadPdf}
                                            onEmail={onEmailVoucher}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
