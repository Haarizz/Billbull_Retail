import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Printer, Download, Mail, MessageCircle, CheckCircle2, Banknote } from 'lucide-react';
import { formatCurrencyDisplay } from '../../../utils/countryCurrencyOptions';
import { getNextSalesPaymentNumber } from '../../../api/salesPaymentApi';

// Post-confirm Sales Payment settlement. Opened right after a Sales Invoice is
// confirmed so the user can record payment received against it (or skip and
// leave it on credit).
//
// Persistence uses the SAME path as the invoice "Pay" button — each entry is
// posted through recordInvoicePayment → /payment-detailed, which makes the
// backend mint a real ReceiptVoucher (with the authoritative voucher number,
// bank account and cheque date). We therefore do NOT invent a number up front:
// once recording succeeds we surface the real voucher number(s) the backend
// returned.

const QUICK_MODES = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit'];
const ENTRY_MODES = ['Cash', 'Card', 'Bank Transfer', 'Cheque'];
const MODE_EMOJI = { Cash: '💵', Card: '💳', 'Bank Transfer': '🏦', Cheque: '🧾' };
const today = () => new Date().toISOString().slice(0, 10);

const InvoiceSettlementModal = ({
    invoice,
    customer = {},
    netTotal = 0,
    currency = 'AED',
    bankAccountOptions = [],
    isSaving = false,
    onSkip,
    onConfirm,
    onDone,
    onPrintVoucher,
    onDownloadVoucher,
    onEmailVoucher,
    onWhatsAppVoucher,
}) => {
    const invoiceAmount = Number(netTotal) || 0;
    const money = (v) => formatCurrencyDisplay(Number(v) || 0, currency);

    const [phase, setPhase] = useState('input'); // 'input' | 'done'
    const [recorded, setRecorded] = useState([]);
    const [nextVoucherNo, setNextVoucherNo] = useState('—');
    const [quickMode, setQuickMode] = useState('Cash');

    useEffect(() => {
        getNextSalesPaymentNumber()
            .then(num => setNextVoucherNo(num))
            .catch(() => setNextVoucherNo('Auto-generated'));
    }, []);
    const [entries, setEntries] = useState([
        { mode: 'Cash', amount: invoiceAmount > 0 ? invoiceAmount.toFixed(2) : '0', reference: '', bankAccount: '', chequeDate: today() },
    ]);

    const totalSettled = useMemo(
        () => entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        [entries]
    );
    const balanceDue = Math.max(invoiceAmount - totalSettled, 0);
    const statusLabel = balanceDue <= 0.009 && totalSettled > 0
        ? 'Fully Paid'
        : (totalSettled > 0 ? 'Partially Paid' : 'Unpaid (On Credit)');
    const isFullyPaid = statusLabel === 'Fully Paid';

    const setEntry = (idx, patch) =>
        setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

    const handleQuickMode = (mode) => {
        setQuickMode(mode);
        if (mode === 'Credit') {
            setEntries([{ mode: 'Cash', amount: '0', reference: '', bankAccount: '', chequeDate: today() }]);
        } else {
            setEntries(prev => {
                if (prev.length === 0) {
                    return [{ mode, amount: invoiceAmount > 0 ? invoiceAmount.toFixed(2) : '0', reference: '', bankAccount: '', chequeDate: today() }];
                }
                return prev.map((e, i) => (i === 0 ? { ...e, mode } : e));
            });
        }
    };

    const addEntry = () => {
        const remaining = Math.max(invoiceAmount - totalSettled, 0);
        setEntries(prev => [...prev, { mode: 'Cash', amount: remaining > 0 ? remaining.toFixed(2) : '0', reference: '', bankAccount: '', chequeDate: today() }]);
    };

    const removeEntry = (idx) => setEntries(prev => prev.filter((_, i) => i !== idx));

    const handleConfirm = async () => {
        const valid = entries
            .filter(e => Number(e.amount) > 0)
            .map(e => ({
                mode: e.mode,
                amount: e.amount,
                reference: e.reference,
                bankAccount: e.mode !== 'Cash' ? e.bankAccount : '',
                chequeDate: e.mode === 'Cheque' ? e.chequeDate : null,
            }));
        if (valid.length === 0) return;
        const result = await onConfirm?.(valid);
        if (result && Array.isArray(result.receipts)) {
            setRecorded(result.receipts);
            setPhase('done');
        }
    };

    const recordedTotal = recorded.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
            <div className="bg-white w-[680px] max-w-[96vw] max-h-[94vh] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#F5C742] flex items-center justify-center text-slate-900 shrink-0">
                            <Banknote size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Invoice Settlement (Sales Payment)</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                Record payment received against <strong>{invoice?.invoiceNumber || '—'}</strong>
                                {customer?.name ? <> — Customer: <strong>{customer.name}</strong></> : null}
                            </p>
                        </div>
                    </div>
                    <button onClick={phase === 'done' ? onDone : onSkip} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Amount cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Amount</p>
                            <p className="text-base font-bold text-slate-800 mt-1">{money(invoiceAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Paid</p>
                            <p className="text-base font-bold text-emerald-700 mt-1">{money(phase === 'done' ? recordedTotal : totalSettled)}</p>
                        </div>
                        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Balance Due</p>
                            <p className="text-base font-bold text-orange-700 mt-1">{money(Math.max(invoiceAmount - (phase === 'done' ? recordedTotal : totalSettled), 0))}</p>
                        </div>
                    </div>

                    {phase === 'input' ? (
                        <>
                            {/* Voucher number preview banner */}
                            <div className="flex justify-between items-center px-4 py-3 rounded-lg bg-[#FFF8E7] border border-[#FDE6A9]">
                                <span className="text-xs font-medium text-slate-600">
                                    Sales Payment No: <span className="font-bold text-slate-800 tracking-wide ml-1">{nextVoucherNo}</span>
                                </span>
                                <span className="text-xs text-slate-500">{new Date().toLocaleDateString('en-GB').replace(/\//g, '/')}</span>
                            </div>

                            {/* Quick payment mode */}
                            <div>
                                <p className="text-xs font-bold text-slate-700 mb-2">Quick Payment Mode</p>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_MODES.map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => handleQuickMode(mode)}
                                            className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                                                quickMode === mode
                                                    ? 'bg-[#F5C742] border-[#F5C742] text-slate-900'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                                {quickMode === 'Credit' && (
                                    <p className="text-[11px] text-slate-500 mt-2">No payment captured — use <strong>Skip Settlement</strong> to leave this invoice on credit.</p>
                                )}
                            </div>

                            {/* Payment entries */}
                            {entries.map((entry, idx) => (
                                <div key={idx} className="rounded-lg border border-slate-200 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-[#F5C742] text-slate-900 text-[11px] font-bold flex items-center justify-center">{idx + 1}</span>
                                            <span className="text-sm font-bold text-slate-700">Payment Entry {idx + 1}</span>
                                        </div>
                                        {entries.length > 1 && (
                                            <button onClick={() => removeEntry(idx)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Mode</label>
                                            <select
                                                value={entry.mode}
                                                onChange={(e) => setEntry(idx, { mode: e.target.value, bankAccount: '' })}
                                                className="w-full text-sm p-2 border border-slate-300 rounded-md bg-white outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                                            >
                                                {ENTRY_MODES.map(m => (
                                                    <option key={m} value={m}>{MODE_EMOJI[m]} {m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount ({currency})</label>
                                            <input
                                                type="number"
                                                value={entry.amount}
                                                onChange={(e) => setEntry(idx, { amount: e.target.value })}
                                                className="w-full text-sm p-2 border border-slate-300 rounded-md outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                                            />
                                        </div>
                                    </div>

                                    {/* Bank Account — shown for modes that require bank selection */}
                                    {entry.mode !== 'Cash' && entry.mode !== 'Card' && (
                                        <div className="mt-3 grid grid-cols-2 gap-4">
                                            <div className={entry.mode === 'Cheque' ? '' : 'col-span-2'}>
                                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank Account</label>
                                                <select
                                                    value={entry.bankAccount}
                                                    onChange={(e) => setEntry(idx, { bankAccount: e.target.value })}
                                                    className="w-full text-sm p-2 border border-slate-300 rounded-md bg-white outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                                                >
                                                    <option value="">Select bank account…</option>
                                                    {bankAccountOptions.map(acc => (
                                                        <option key={acc.id} value={acc.name}>{acc.code} — {acc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {entry.mode === 'Cheque' && (
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Cheque Date</label>
                                                    <input
                                                        type="date"
                                                        value={entry.chequeDate}
                                                        onChange={(e) => setEntry(idx, { chequeDate: e.target.value })}
                                                        className="w-full text-sm p-2 border border-slate-300 rounded-md outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-3">
                                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                            {entry.mode === 'Cheque' ? 'Cheque No. / Reference' : 'Reference / Transaction ID'}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={entry.mode === 'Cheque' ? 'Cheque number' : 'TXN ID, reference no, or notes'}
                                            value={entry.reference}
                                            onChange={(e) => setEntry(idx, { reference: e.target.value })}
                                            className="w-full text-sm p-2 border border-slate-300 rounded-md outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                                        />
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={addEntry}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                            >
                                <Plus size={16} /> Add Split Payment Entry
                            </button>

                            {/* Total settled + status */}
                            <div className="rounded-lg border border-slate-200 p-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-600">Total Settled:</span>
                                    <span className="text-xl font-bold text-slate-800">{money(totalSettled)}</span>
                                </div>
                                <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm ${isFullyPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                                    <CheckCircle2 size={16} className={isFullyPaid ? 'text-emerald-500' : 'text-slate-400'} />
                                    Invoice will be marked as <strong>{statusLabel}</strong>.
                                </div>
                            </div>

                            {/* Sales Payment Actions */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                <p className="text-xs font-bold text-slate-500 mb-3">Sales Payment Actions</p>
                                <div className="flex flex-wrap gap-2">
                                    <button 
                                        onClick={() => {
                                            const mocks = entries.filter(e => Number(e.amount) > 0).map((e, idx) => ({ id: 'draft-'+idx, receiptNumber: nextVoucherNo, voucherId: nextVoucherNo, amount: e.amount, mode: e.mode, paymentMode: e.mode, reference: e.reference, date: today(), status: 'Preview' }));
                                            if (mocks.length === 0) return alert('Enter a payment amount first.');
                                            mocks.forEach(rv => onPrintVoucher?.(rv));
                                        }} 
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    ><Printer size={14} /> Print Payment</button>
                                    <button 
                                        onClick={() => {
                                            const mocks = entries.filter(e => Number(e.amount) > 0).map((e, idx) => ({ id: 'draft-'+idx, receiptNumber: nextVoucherNo, voucherId: nextVoucherNo, amount: e.amount, mode: e.mode, paymentMode: e.mode, reference: e.reference, date: today(), status: 'Preview' }));
                                            if (mocks.length === 0) return alert('Enter a payment amount first.');
                                            mocks.forEach(rv => (onDownloadVoucher || onPrintVoucher)?.(rv));
                                        }} 
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    ><Download size={14} /> Download PDF</button>
                                    <button 
                                        onClick={() => {
                                            const mocks = entries.filter(e => Number(e.amount) > 0).map((e, idx) => ({ id: 'draft-'+idx, receiptNumber: nextVoucherNo, voucherId: nextVoucherNo, amount: e.amount, mode: e.mode, paymentMode: e.mode, reference: e.reference, date: today(), status: 'Preview' }));
                                            if (mocks.length === 0) return alert('Enter a payment amount first.');
                                            onEmailVoucher?.(mocks);
                                        }} 
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    ><Mail size={14} /> Email Voucher</button>
                                    <button 
                                        onClick={() => {
                                            const mocks = entries.filter(e => Number(e.amount) > 0).map((e, idx) => ({ id: 'draft-'+idx, receiptNumber: nextVoucherNo, voucherId: nextVoucherNo, amount: e.amount, mode: e.mode, paymentMode: e.mode, reference: e.reference, date: today(), status: 'Preview' }));
                                            if (mocks.length === 0) return alert('Enter a payment amount first.');
                                            onWhatsAppVoucher?.(mocks);
                                        }} 
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    ><MessageCircle size={14} /> WhatsApp</button>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* DONE phase — real voucher numbers from the backend */
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                                <CheckCircle2 size={18} className="text-emerald-500" />
                                Payment recorded. Invoice marked as <strong>{statusLabel}</strong>.
                            </div>

                            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                                <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Sales Payment{recorded.length > 1 ? 's' : ''}
                                </div>
                                {recorded.length === 0 && (
                                    <div className="px-4 py-3 text-sm text-slate-500">Payment recorded — voucher number available in Receipts history.</div>
                                )}
                                {recorded.map((rv) => (
                                    <div key={rv.id || rv.receiptNumber} className="px-4 py-3">
                                        <p className="text-sm font-bold text-slate-800 tracking-wide">{rv.receiptNumber}</p>
                                        <p className="text-[11px] text-slate-500">{rv.mode} • {money(rv.amount)}{rv.reference ? ` • ${rv.reference}` : ''}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Sales Payment Actions */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                <p className="text-xs font-bold text-slate-500 mb-3">Sales Payment Actions</p>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => recorded.forEach(rv => onPrintVoucher?.(rv))} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"><Printer size={14} /> Print Payment</button>
                                    <button onClick={() => recorded.forEach(rv => (onDownloadVoucher || onPrintVoucher)?.(rv))} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"><Download size={14} /> Download PDF</button>
                                    <button onClick={() => onEmailVoucher?.(recorded)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"><Mail size={14} /> Email Voucher</button>
                                    <button onClick={() => onWhatsAppVoucher?.(recorded)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"><MessageCircle size={14} /> WhatsApp</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-white">
                    {phase === 'input' ? (
                        <>
                            <button
                                onClick={onSkip}
                                disabled={isSaving}
                                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-md hover:bg-slate-50 disabled:opacity-50"
                            >
                                Skip Settlement
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isSaving || totalSettled <= 0}
                                className="flex items-center gap-2 px-6 py-2.5 bg-[#F5C742] text-slate-900 text-sm font-bold rounded-md hover:bg-yellow-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle2 size={16} /> {isSaving ? 'Saving…' : 'Confirm & Finalize Settlement'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onDone}
                            className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-[#F5C742] text-slate-900 text-sm font-bold rounded-md hover:bg-yellow-500 shadow-sm"
                        >
                            <CheckCircle2 size={16} /> Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceSettlementModal;
