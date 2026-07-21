import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    X, Printer, Download, Clock, Building2, Receipt, Landmark, FileText,
} from 'lucide-react';
import RecordPreviewShell from '../../Sales/components/RecordPreviewShell';
import { CopyField, InfoRow, RailCard, SummaryStrip } from './previewParts';
import { getPaymentVoucherById } from '../../../api/paymentApi';
import { getPaymentVoucherStatusBadge } from '../utils/paymentVoucherStatusBadge';
import { findVendorRecord } from '../../../utils/purchasePrintUtils';
import { formatDisplayDate } from '../../../utils/dateUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';

const num = (v) => Number(v ?? 0);

// A payment voucher is a header-only document (no item lines) — the primary
// workspace shows the invoice allocations this payment settles, plus a small
// audit timeline built from the entity's own dates.
function buildVoucherTimeline(v) {
    if (!v) return [];
    const events = [];
    if (v.createdAt || v.paymentDate) {
        events.push({ key: 'created', label: 'Voucher Created', date: v.createdAt || v.paymentDate, by: v.createdBy || null });
    }
    const s = String(v.status || '').toUpperCase();
    if (s === 'POSTED' || s === 'CLEARED') {
        events.push({ key: 'posted', label: 'Posted to Ledger', date: v.postedAt || v.updatedAt || v.paymentDate, by: v.approvedBy || null });
    }
    if (s === 'CLEARED') {
        events.push({ key: 'cleared', label: 'Payment Cleared', date: v.clearedAt || v.updatedAt || null, by: null });
    }
    if (s === 'REJECTED') {
        events.push({ key: 'rejected', label: 'Rejected', date: v.updatedAt || null, by: v.updatedBy || null });
    }
    return events.filter((e) => e.date).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Read-only Transaction Preview for a vendor Payment Voucher.
export default function PaymentVoucherPreview({
    voucherId, // numeric backend id
    vendorsList = [],
    voucherCurrency,
    onBack,
    onPrint,
    onDownload,
    isPrinting = false,
}) {
    const [voucher, setVoucher] = useState(null);
    const [loadState, setLoadState] = useState('loading');

    const fetchVoucher = useCallback(async () => {
        if (!voucherId) return;
        setLoadState('loading');
        try {
            const data = await getPaymentVoucherById(voucherId);
            if (!data) { setLoadState('not-found'); return; }
            setVoucher(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [voucherId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchVoucher(); }, [fetchVoucher]);

    const timeline = useMemo(() => buildVoucherTimeline(voucher), [voucher]);

    const vendor = useMemo(
        () => (voucher ? findVendorRecord(vendorsList, voucher, voucher?.vendorName) : null),
        [voucher, vendorsList]
    );

    if (!voucherId) return null;

    const statusBadge = voucher ? getPaymentVoucherStatusBadge(voucher.status) : null;
    const currency = voucherCurrency;

    const amount = num(voucher?.amount);
    const allocated = num(voucher?.allocated);
    const unallocated = num(voucher?.unallocated ?? Math.max(0, amount - allocated));
    const mode = String(voucher?.paymentMode || '').replace(/_/g, ' ');
    // Allocation lines — field names vary by backend serializer, probe the
    // likely shapes and render whichever exists.
    const allocations = voucher?.allocations || voucher?.invoiceAllocations || voucher?.lines || voucher?.invoices || [];

    const headerContent = voucher && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="Voucher Number" value={voucher.voucherNumber} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {mode && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200 capitalize">{mode.toLowerCase()}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={voucher.vendorName}>{voucher.vendorName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(voucher.paymentDate)}</span>
                        {voucher.referenceNumber && <><span className="text-slate-300">•</span><span className="whitespace-nowrap font-mono">{voucher.referenceNumber}</span></>}
                        {voucher.branch?.name && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={voucher.branch.name}>{voucher.branch.name}</span></>}
                    </div>
                </div>

                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    <button onClick={() => onPrint?.(voucher)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                        <Printer size={13} /> Print
                    </button>
                    <button onClick={() => onDownload?.(voucher)} disabled={isPrinting} title="Download PDF" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50">
                        <Download size={13} /> PDF
                    </button>
                    <button onClick={onBack} aria-label="Close preview" className="group h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors">
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );

    const summaryTiles = [
        { label: 'Amount', node: <CurrencyAmount value={amount} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Allocated', node: <CurrencyAmount value={allocated} currency={currency} className="text-sm font-bold text-emerald-600 tabular-nums" /> },
        {
            label: 'Unallocated',
            node: <CurrencyAmount value={unallocated} currency={currency} className={`text-sm font-bold tabular-nums ${unallocated > 0 ? 'text-orange-500' : 'text-slate-800'}`} />,
            tint: unallocated > 0 ? 'bg-orange-50/50 border-orange-100' : undefined,
        },
        { label: 'Mode', node: <span className="text-sm font-bold text-slate-800 capitalize truncate">{mode.toLowerCase() || '—'}</span> },
        { label: 'Date', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{voucher?.paymentDate ? formatDisplayDate(voucher.paymentDate) : '—'}</span> },
        { label: 'Reference', node: <span className="text-sm font-bold text-slate-800 truncate">{voucher?.referenceNumber || '—'}</span> },
        { label: 'Invoices', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{allocations.length || '—'}</span> },
    ];

    const summaryContent = voucher && <SummaryStrip tiles={summaryTiles} />;

    const allocationsTable = voucher && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 md:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Receipt size={15} className="text-[#D99A00]" /> Invoice Allocations</h2>
                <span className="text-[11px] text-slate-400 tabular-nums">{allocations.length} invoices</span>
            </div>
            {allocations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <FileText size={22} className="mb-1.5 text-slate-300" />
                    <span className="text-sm">No invoice allocations on this voucher.</span>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                            <tr>
                                <th className="px-4 py-2 text-left">Invoice No.</th>
                                <th className="px-4 py-2 text-left">Date</th>
                                <th className="px-4 py-2 text-right">Invoice Total</th>
                                <th className="px-4 py-2 text-right">Allocated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {allocations.map((a, i) => (
                                <tr key={a.id ?? i} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{a.invoiceNumber || a.invoiceNo || a.documentNumber || '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDisplayDate(a.invoiceDate || a.date)}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap"><CurrencyAmount value={a.invoiceTotal ?? a.grandTotal ?? a.total} currency={currency} /></td>
                                    <td className="px-4 py-2.5 text-right font-medium text-emerald-600 tabular-nums whitespace-nowrap"><CurrencyAmount value={a.allocatedAmount ?? a.paidAmount ?? a.amount} currency={currency} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );

    const timelineSection = voucher && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 flex items-center gap-1 px-2">
                <span className="relative px-3 py-2.5 text-xs font-semibold flex items-center gap-1.5 text-[#8A6200]">
                    <Clock size={13} className="text-[#D99A00]" /> Timeline
                    {timeline.length > 0 && <span className="ml-0.5 px-1.5 rounded-full text-[9px] font-bold bg-[#F5C742] text-slate-900">{timeline.length}</span>}
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#F5C742]" />
                </span>
            </div>
            <div className="p-4 md:p-5">
                {timeline.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                        <Clock size={20} className="mb-1.5 text-slate-300" />
                        <span className="text-sm">No timeline events yet.</span>
                    </div>
                ) : (
                    <ol className="space-y-2.5">
                        {timeline.map((ev) => (
                            <li key={ev.key} className="flex items-start gap-3 text-xs">
                                <span className="mt-1 w-2 h-2 rounded-full bg-[#F5C742] shrink-0" />
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-700 wrap-break-word">{ev.label}</div>
                                    <div className="text-slate-400">{formatDisplayDate(ev.date)}{ev.by ? ` · ${ev.by}` : ''}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );

    const primaryContent = voucher && (<>{allocationsTable}{timelineSection}</>);

    const rightRail = voucher && (
        <>
            <RailCard title="Vendor Information" icon={Building2} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={voucher.vendorName} />
                    <InfoRow label="Phone" value={vendor?.phone || vendor?.mobile} />
                    <InfoRow label="Email" value={vendor?.email} />
                    <InfoRow label="VAT / TRN" value={vendor?.trn || vendor?.vatNumber} copyable copyLabel="TRN" />
                </div>
            </RailCard>

            <RailCard title="Payment Details" icon={Landmark} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Mode" value={mode} />
                    <InfoRow label="Bank Account" value={voucher.bankAccount || voucher.bankName} />
                    <InfoRow label="Cheque Date" value={voucher.chequeDate ? formatDisplayDate(voucher.chequeDate) : ''} />
                    <InfoRow label="Reference" value={voucher.referenceNumber} copyable copyLabel="Reference" />
                    <InfoRow label="Branch" value={voucher.branch?.name} />
                    <InfoRow label="Notes" value={voucher.notes} />
                </div>
            </RailCard>
        </>
    );

    const mobileActionBar = voucher && (
        <div className="flex items-center gap-2">
            <button onClick={() => onPrint?.(voucher)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                <Printer size={14} /> Print
            </button>
            <button onClick={() => onDownload?.(voucher)} disabled={isPrinting} aria-label="Download PDF" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center disabled:opacity-50">
                <Download size={15} />
            </button>
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchVoucher}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
