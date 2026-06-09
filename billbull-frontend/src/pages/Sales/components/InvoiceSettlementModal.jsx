import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Printer, Download, Mail, MessageCircle, CheckCircle2, Banknote, AlertCircle } from 'lucide-react';
import { formatCurrencyDisplay } from '../../../utils/countryCurrencyOptions';
import { getNextSalesPaymentNumber } from '../../../api/salesPaymentApi';

// Post-confirm Sales Payment settlement. Opened right after a Sales Invoice is
// confirmed so the user can record payment received against it.
//
// Persistence uses the SAME path as the invoice "Pay" button — each entry is
// posted through recordInvoicePayment → /payment-detailed, which makes the
// backend mint a real ReceiptVoucher (with the authoritative voucher number,
// bank account and cheque date). We therefore do NOT invent a number up front:
// once recording succeeds we surface the real voucher number(s) the backend
// returned.

const ALL_QUICK_MODES = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit'];
const ENTRY_MODES = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit'];
const MODE_EMOJI = { Cash: '💵', Card: '💳', 'Bank Transfer': '🏦', Cheque: '🧾', Credit: '🔑' };
const today = () => new Date().toISOString().slice(0, 10);

const InvoiceSettlementModal = ({
    invoice,
    customer = {},
    netTotal = 0,
    currency = 'AED',
    bankAccountOptions = [],
    isSaving = false,
    hideCredit = false,
    onSkip,
    onConfirm,
    onDone,
    onPrintVoucher,
    onDownloadVoucher,
    onEmailVoucher,
    onWhatsAppVoucher,
}) => {
    const QUICK_MODES = hideCredit ? ALL_QUICK_MODES.filter(m => m !== 'Credit') : ALL_QUICK_MODES;
    const invoiceAmount = Number(netTotal) || 0;
    const money = (v) => formatCurrencyDisplay(Number(v) || 0, currency);

    const [phase, setPhase] = useState('input'); // 'input' | 'done'
    const [recorded, setRecorded] = useState([]);
    const [nextVoucherNo, setNextVoucherNo] = useState('—');
    // No pre-selection — user must explicitly choose a pay mode
    const [quickMode, setQuickMode] = useState(null);
    const [showModeError, setShowModeError] = useState(false);

    useEffect(() => {
        getNextSalesPaymentNumber()
            .then(num => setNextVoucherNo(num))
            .catch(() => setNextVoucherNo('Auto-generated'));
    }, []);

    // Start with no mode selected — amount pre-filled but mode is blank
    const [entries, setEntries] = useState([
        { mode: '', amount: invoiceAmount > 0 ? invoiceAmount.toFixed(2) : '0', reference: '', bankAccount: '', chequeDate: today() },
    ]);

    // Cash/Card/Bank/Cheque entries — the ones that actually move money
    const paidEntries = useMemo(
        () => entries.filter(e => e.mode !== '' && e.mode !== 'Credit' && Number(e.amount) > 0),
        [entries]
    );
    const totalSettled = useMemo(
        () => paidEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        [paidEntries]
    );
    // Whether any Credit entry is present (rest goes on credit)
    const hasCreditEntry = useMemo(
        () => entries.some(e => e.mode === 'Credit'),
        [entries]
    );

    // Every entry with amount > 0 must have a mode selected (Credit entries always have a mode)
    const allModesSelected = useMemo(
        () => entries.every(e => Number(e.amount) <= 0 || e.mode !== ''),
        [entries]
    );
    const anyModeSelected = quickMode !== null;

    const balanceDue = Math.max(invoiceAmount - totalSettled, 0);
    const isPureCreditSettlement = hasCreditEntry && totalSettled <= 0.004;
    const isFullyPaid = !isPureCreditSettlement && balanceDue <= 0.009 && totalSettled > 0;
    const statusLabel = isFullyPaid
        ? 'Fully Paid'
        : isPureCreditSettlement
            ? 'On Credit'
            : totalSettled > 0
                ? hasCreditEntry ? 'Partially Paid / Credit Balance' : 'Partially Paid'
                : 'Unpaid (On Credit)';

    // Finalize is allowed when: a mode is selected AND (some money paid OR pure credit chosen)
    const canFinalize = allModesSelected && anyModeSelected && (totalSettled > 0 || isPureCreditSettlement);

    const setEntry = (idx, patch) =>
        setEntries(prev => {
            const updated = prev.map((e, i) => (i === idx ? { ...e, ...patch } : e));
            // Keep credit entry amount in sync with remaining balance
            const otherPaid = updated.reduce((s, e, i) => e.mode !== 'Credit' && Number(e.amount) > 0 ? s + Number(e.amount) : s, 0);
            return updated.map(e => e.mode === 'Credit' ? { ...e, amount: Math.max(invoiceAmount - otherPaid, 0).toFixed(2) } : e);
        });

    const handleQuickMode = (mode) => {
        setQuickMode(mode);
        setShowModeError(false);
        setEntries(prev => {
            const base = prev.length === 0
                ? [{ mode, amount: invoiceAmount > 0 ? invoiceAmount.toFixed(2) : '0', reference: '', bankAccount: '', chequeDate: today() }]
                : prev.map((e, i) => (i === 0 ? { ...e, mode } : e));
            // For Credit quick-mode, auto-fill amount with full invoice total
            if (mode === 'Credit') {
                const otherPaid = base.reduce((s, e, i) => i !== 0 && e.mode !== 'Credit' ? s + (Number(e.amount) || 0) : s, 0);
                return base.map((e, i) => i === 0 ? { ...e, amount: Math.max(invoiceAmount - otherPaid, 0).toFixed(2) } : e);
            }
            return base;
        });
    };

    const addEntry = () => {
        const remaining = Math.max(invoiceAmount - totalSettled, 0);
        setEntries(prev => [...prev, { mode: '', amount: remaining > 0 ? remaining.toFixed(2) : '0', reference: '', bankAccount: '', chequeDate: today() }]);
    };

    const removeEntry = (idx) => setEntries(prev => prev.filter((_, i) => i !== idx));

    const handleConfirm = async () => {
        if (!allModesSelected) {
            setShowModeError(true);
            return;
        }
        // Paid entries: Cash/Card/Bank/Cheque with positive amounts
        const paidValid = entries
            .filter(e => Number(e.amount) > 0 && e.mode !== '' && e.mode !== 'Credit')
            .map(e => ({
                mode: e.mode,
                amount: e.amount,
                reference: e.reference,
                bankAccount: e.mode !== 'Cash' ? e.bankAccount : '',
                chequeDate: e.mode === 'Cheque' ? e.chequeDate : null,
            }));
        // Credit entries: passed through with amount=0 so backend stamps paymentMode
        const creditEntries = entries
            .filter(e => e.mode === 'Credit')
            .map(e => ({ mode: 'Credit', amount: '0', reference: e.reference, bankAccount: '', chequeDate: null }));
        const valid = [...paidValid, ...creditEntries];
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

                            {/* Pay Mode — mandatory selection */}
                            <div className={`rounded-lg border-2 p-4 transition-colors ${showModeError && !anyModeSelected ? 'border-red-400 bg-red-50' : anyModeSelected ? 'border-emerald-300 bg-emerald-50/40' : 'border-[#FDE6A9] bg-[#FFF8E7]'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                        {showModeError && !anyModeSelected
                                            ? <AlertCircle size={14} className="text-red-500" />
                                            : anyModeSelected
                                                ? <CheckCircle2 size={14} className="text-emerald-500" />
                                                : <AlertCircle size={14} className="text-amber-500" />
                                        }
                                        Pay Mode
                                        <span className="text-red-500">*</span>
                                    </p>
                                    {anyModeSelected && (
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                                            <CheckCircle2 size={12} />
                                            {MODE_EMOJI[quickMode]} {quickMode} selected
                                        </span>
                                    )}
                                    {!anyModeSelected && (
                                        <span className="text-[11px] text-amber-700 font-medium">Select a pay mode to proceed</span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_MODES.map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => handleQuickMode(mode)}
                                            className={`px-4 py-2 rounded-full text-xs font-bold border-2 transition-all ${
                                                quickMode === mode
                                                    ? 'bg-[#F5C742] border-[#F5C742] text-slate-900 shadow-sm scale-105'
                                                    : showModeError && !anyModeSelected
                                                        ? 'bg-white border-red-200 text-slate-600 hover:bg-red-50 hover:border-red-400'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-[#FFF8E7] hover:border-[#F5C742]'
                                            }`}
                                        >
                                            {MODE_EMOJI[mode]} {mode}
                                        </button>
                                    ))}
                                </div>
                                {showModeError && !anyModeSelected && (
                                    <p className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1">
                                        <AlertCircle size={12} /> Please select a pay mode before finalizing.
                                    </p>
                                )}
                            </div>

                            {/* Payment entries */}
                            {entries.map((entry, idx) => (
                                <div key={idx} className={`rounded-lg border p-4 transition-colors ${entry.mode === '' && Number(entry.amount) > 0 ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-[#F5C742] text-slate-900 text-[11px] font-bold flex items-center justify-center">{idx + 1}</span>
                                            <span className="text-sm font-bold text-slate-700">Payment Entry {idx + 1}</span>
                                            {entry.mode && (
                                                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    {MODE_EMOJI[entry.mode]} {entry.mode}
                                                </span>
                                            )}
                                        </div>
                                        {entries.length > 1 && (
                                            <button onClick={() => removeEntry(idx)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                                Payment Mode <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={entry.mode}
                                                onChange={(e) => {
                                                    const newMode = e.target.value;
                                                    // Auto-fill credit amount with remaining balance
                                                    const patch = { mode: newMode, bankAccount: '' };
                                                    if (newMode === 'Credit') {
                                                        const otherPaid = entries.reduce((s, en, i) => i !== idx && en.mode !== 'Credit' ? s + (Number(en.amount) || 0) : s, 0);
                                                        patch.amount = Math.max(invoiceAmount - otherPaid, 0).toFixed(2);
                                                    }
                                                    setEntry(idx, patch);
                                                    if (idx === 0) setQuickMode(newMode || null);
                                                    if (newMode) setShowModeError(false);
                                                }}
                                                className={`w-full text-sm p-2 border rounded-md bg-white outline-none focus:ring-1 focus:ring-[#F5C742] ${entry.mode === '' ? 'border-amber-400 focus:border-[#F5C742]' : 'border-slate-300 focus:border-[#F5C742]'}`}
                                            >
                                                <option value="">— Select pay mode —</option>
                                                {ENTRY_MODES.map(m => (
                                                    <option key={m} value={m}>{MODE_EMOJI[m]} {m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                                {entry.mode === 'Credit' ? `Credit Balance (${currency})` : `Amount (${currency})`}
                                            </label>
                                            <input
                                                type="number"
                                                value={entry.amount}
                                                readOnly={entry.mode === 'Credit'}
                                                onChange={(e) => entry.mode !== 'Credit' && setEntry(idx, { amount: e.target.value })}
                                                className={`w-full text-sm p-2 border rounded-md outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] ${entry.mode === 'Credit' ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold cursor-default' : 'border-slate-300 bg-white'}`}
                                            />
                                        </div>
                                    </div>

                                    {/* Bank Account — shown for modes that require bank selection */}
                                    {entry.mode !== '' && entry.mode !== 'Cash' && entry.mode !== 'Card' && entry.mode !== 'Credit' && (
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
                                    <span className="text-sm font-bold text-slate-600">Total Paid Now:</span>
                                    <span className="text-xl font-bold text-slate-800">{money(totalSettled)}</span>
                                </div>
                                {hasCreditEntry && balanceDue > 0.004 && (
                                    <div className="mt-2 flex justify-between items-center text-sm text-slate-500">
                                        <span>Credit Balance:</span>
                                        <span className="font-bold text-orange-600">{money(balanceDue)}</span>
                                    </div>
                                )}
                                <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                                    isFullyPaid ? 'bg-emerald-50 text-emerald-700'
                                    : isPureCreditSettlement ? 'bg-orange-50 text-orange-700'
                                    : hasCreditEntry ? 'bg-orange-50 text-orange-700'
                                    : 'bg-slate-50 text-slate-600'
                                }`}>
                                    <CheckCircle2 size={16} className={isFullyPaid ? 'text-emerald-500' : isPureCreditSettlement || hasCreditEntry ? 'text-orange-400' : 'text-slate-400'} />
                                    Invoice will be marked as <strong>{statusLabel}</strong>.
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
                                        <p className={`text-sm font-bold tracking-wide ${rv.mode === 'Credit' ? 'text-orange-700' : 'text-slate-800'}`}>{rv.receiptNumber}</p>
                                        <p className="text-[11px] text-slate-500">
                                            {rv.mode}
                                            {rv.mode === 'Credit' ? ' — balance left on credit' : ` • ${money(rv.amount)}`}
                                            {rv.reference ? ` • ${rv.reference}` : ''}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Sales Payment Actions */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                <p className="text-xs font-bold text-slate-500 mb-3">Sales Payment Actions</p>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => onPrintVoucher?.(recorded)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"><Printer size={14} /> Print Payment</button>
                                    <button onClick={() => (onDownloadVoucher || onPrintVoucher)?.(recorded)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50"><Download size={14} /> Download PDF</button>
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
                        <div className="ml-auto flex items-center gap-3">
                            {!canFinalize && (
                                <span className="text-[11px] text-slate-500 font-medium">
                                    {!anyModeSelected ? 'Select a pay mode to enable' : (!isPureCreditSettlement && totalSettled <= 0) ? 'Enter an amount to enable' : ''}
                                </span>
                            )}
                            <button
                                onClick={handleConfirm}
                                disabled={isSaving || !canFinalize}
                                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-md shadow-sm transition-all ${
                                    canFinalize
                                        ? 'bg-[#F5C742] text-slate-900 hover:bg-yellow-500 cursor-pointer'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                } disabled:opacity-70`}
                            >
                                <CheckCircle2 size={16} /> {isSaving ? 'Saving…' : isPureCreditSettlement ? 'Confirm Credit Settlement' : 'Confirm & Finalize Settlement'}
                            </button>
                        </div>
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
