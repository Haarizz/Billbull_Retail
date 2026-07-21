import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    X, Edit, Printer, DollarSign, Clock, Building2, Truck, Receipt,
    Link2, CheckCircle2, AlertCircle, Package,
} from 'lucide-react';
import RecordPreviewShell from '../../Sales/components/RecordPreviewShell';
import PaymentHistorySection from '../../Sales/components/PaymentHistorySection';
import PurchaseItemsTable from './PurchaseItemsTable';
import { OverflowMenu, MenuItem, CopyField, InfoRow, RailCard, SummaryStrip } from './previewParts';
import { getLpoByNumber } from '../../../api/lpoApi';
import { useLpoAdvances } from '../../../hooks/useLpoAdvances';
import { getLpoStatusBadge, resolveLpoSourceType } from '../utils/lpoStatusBadge';
import { getAvailableLpoActions } from '../utils/lpoActionRules';
import { buildLpoTimeline } from '../utils/buildLpoTimeline';
import { findVendorRecord } from '../../../utils/purchasePrintUtils';
import { formatDisplayDate } from '../../../utils/dateUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';

const num = (v) => Number(v ?? 0);

// Read-only Transaction Preview for a Local Purchase Order — the vendor-side
// analog of the Sales Order preview. Reuses the document-agnostic
// RecordPreviewShell + PaymentHistorySection so purchase and sales previews stay
// visually identical. The preview fetches the full LPO by number; every action
// callback receives that entity (which carries lpoNumber + dbId) so the parent's
// self-fetching print/advance handlers work directly.
export default function LpoPreview({
    lpoNumber,
    vendorsList = [],
    lpoCurrency,
    onBack,
    onEdit,
    onPrint,
    onRecordAdvance,
    onPrintVoucher,
    isPrinting = false,
}) {
    const [lpo, setLpo] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const [activeTab, setActiveTab] = useState('advances');
    const { canEdit } = usePermission('PURCHASES');

    const fetchLpo = useCallback(async () => {
        if (!lpoNumber) return;
        setLoadState('loading');
        try {
            const data = await getLpoByNumber(lpoNumber);
            if (!data) { setLoadState('not-found'); return; }
            setLpo(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [lpoNumber]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchLpo(); setActiveTab('advances'); }, [fetchLpo]);

    const { advances, loading: advLoading, error: advError, refetch: refetchAdvances } = useLpoAdvances(lpo);
    const timeline = useMemo(() => buildLpoTimeline(lpo, advances), [lpo, advances]);

    const vendor = useMemo(
        () => (lpo ? findVendorRecord(vendorsList, lpo, lpo?.vendorName, lpo?.vendorCode) : null),
        [lpo, vendorsList]
    );

    const actions = useMemo(() => getAvailableLpoActions(lpo?.status), [lpo?.status]);
    const canEditLpo = canEdit && actions.edit;
    const canPrint = actions.print;
    const canRecordAdvance = canEdit && actions.recordPayment;
    const canPrintVoucher = actions.printVoucher;

    if (!lpoNumber) return null;

    const statusBadge = lpo ? getLpoStatusBadge(lpo.status) : null;
    const sourceType = lpo ? resolveLpoSourceType(lpo) : null;
    const currency = lpoCurrency;

    const items = (lpo?.items) || [];
    const itemCount = items.length;
    const totalQty = items.reduce((s, i) => s + num(i.quantity ?? i.qty ?? i.orderedQty), 0);
    const totalValue = num(lpo?.totalValue ?? lpo?.grandTotal ?? lpo?.total);
    const advanceTotal = num(lpo?.advancePaid);
    const balanceDue = lpo ? num(lpo.balanceDue ?? Math.max(0, totalValue - advanceTotal)) : 0;
    const isSettled = balanceDue <= 0 && advanceTotal > 0;
    const received = num(lpo?.receivedPercentage ?? lpo?.received);
    const discountTotal = num(lpo?.billDiscountAmount ?? lpo?.discountAmount);
    const taxTotal = num(lpo?.taxTotal ?? lpo?.totalTax ?? lpo?.taxAmount
        ?? items.reduce((s, i) => s + num(i.taxAmount ?? i.taxAmt), 0));
    const subTotal = num(lpo?.subTotal ?? lpo?.grossTotal ?? (totalValue - taxTotal + discountTotal));

    const relatedDocs = lpo ? [
        lpo.grnNumber && { label: 'GRN', ref: lpo.grnNumber },
        lpo.purchaseInvoiceNumber && { label: 'Purchase Invoice', ref: lpo.purchaseInvoiceNumber },
        lpo.goodsRequestNumber && { label: 'Goods Request', ref: lpo.goodsRequestNumber },
    ].filter(Boolean) : [];

    const notes = lpo?.notes || lpo?.remarks || '';

    const secondaryActions = (
        <>
            {canEditLpo && <MenuItem onClick={() => onEdit?.(lpo)} icon={Edit}>Edit</MenuItem>}
            {canRecordAdvance && <MenuItem onClick={() => onRecordAdvance?.(lpo)} icon={DollarSign} danger>Record Advance</MenuItem>}
        </>
    );

    const headerContent = lpo && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="LPO Number" value={lpo.lpoNumber || lpo.id} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                        {received > 0 && received < 100 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-orange-50 text-orange-700 border-orange-200">{received}% received</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={lpo.vendorName}>{lpo.vendorName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(lpo.date)}</span>
                        {lpo.expectedDeliveryDate && <><span className="text-slate-300">•</span><span className="flex items-center gap-1 whitespace-nowrap"><Truck size={11} className="text-slate-400" /> ETA {formatDisplayDate(lpo.expectedDeliveryDate)}</span></>}
                        {lpo.branchName && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={lpo.branchName}>{lpo.branchName}</span></>}
                    </div>
                </div>

                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <button onClick={() => onPrint?.(lpo)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}
                    <div className="hidden xl:flex items-center gap-2">
                        {canEditLpo && (
                            <button onClick={() => onEdit?.(lpo)} title="Edit LPO" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Edit size={13} /> Edit
                            </button>
                        )}
                        {canRecordAdvance && (
                            <button onClick={() => onRecordAdvance?.(lpo)} title="Record advance" className="h-8 px-3 border border-emerald-300 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center gap-1.5 text-xs font-bold">
                                <DollarSign size={13} /> Record Advance
                            </button>
                        )}
                    </div>
                    {(canEditLpo || canRecordAdvance) && (
                        <div className="xl:hidden"><OverflowMenu>{secondaryActions}</OverflowMenu></div>
                    )}
                    <button onClick={onBack} aria-label="Close preview" className="group h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors">
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );

    const summaryTiles = [
        { label: 'Total Value', node: <CurrencyAmount value={totalValue} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Advance Paid', node: <CurrencyAmount value={advanceTotal} currency={currency} className="text-sm font-bold text-emerald-600 tabular-nums" /> },
        {
            label: 'Balance',
            node: <CurrencyAmount value={balanceDue} currency={currency} className={`text-sm font-bold tabular-nums ${isSettled ? 'text-emerald-600' : 'text-red-500'}`} />,
            icon: isSettled ? CheckCircle2 : AlertCircle,
            iconCls: isSettled ? 'text-emerald-400' : 'text-red-400',
            tint: isSettled ? 'bg-emerald-50/50 border-emerald-100' : undefined,
        },
        { label: 'Items', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{itemCount}</span> },
        { label: 'Total Qty', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalQty}</span> },
        { label: 'Received', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{received}%</span> },
        { label: 'Tax', node: <CurrencyAmount value={taxTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
    ];

    const summaryContent = lpo && <SummaryStrip tiles={summaryTiles} />;

    const footerTotals = [
        { label: 'Subtotal', value: subTotal },
        { label: 'Discount', value: discountTotal, cls: 'text-red-500' },
        { label: 'Tax (VAT)', value: taxTotal },
        { label: 'Total Value', value: totalValue, strong: true },
        ...(advanceTotal > 0 ? [{ label: 'Advance Paid', value: advanceTotal, cls: 'text-emerald-600' }] : []),
        ...(advanceTotal > 0 ? [{ label: 'Balance', value: balanceDue, cls: 'font-semibold text-slate-700' }] : []),
    ];

    const itemsTable = lpo && <PurchaseItemsTable items={items} currency={currency} totals={footerTotals} emptyLabel="No items on this LPO." />;

    const tabs = lpo ? [
        { key: 'advances', label: 'Advance Payments', icon: Receipt, count: advances.length },
        { key: 'timeline', label: 'Timeline', icon: Clock, count: timeline.length },
    ] : [];
    const effectiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key);

    const tabbedContent = lpo && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 flex items-center gap-1 px-2" role="tablist">
                {tabs.map((t) => {
                    const active = t.key === effectiveTab;
                    return (
                        <button key={t.key} role="tab" aria-selected={active} onClick={() => setActiveTab(t.key)}
                            className={`relative px-3 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-colors ${active ? 'text-[#8A6200]' : 'text-slate-500 hover:text-slate-700'}`}>
                            <t.icon size={13} className={active ? 'text-[#D99A00]' : 'text-slate-400'} />
                            {t.label}
                            {t.count != null && t.count > 0 && (
                                <span className={`ml-0.5 px-1.5 rounded-full text-[9px] font-bold ${active ? 'bg-[#F5C742] text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                            )}
                            {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#F5C742]" />}
                        </button>
                    );
                })}
            </div>
            <div role="tabpanel">
                {effectiveTab === 'advances' && (
                    <PaymentHistorySection
                        payments={advances}
                        loading={advLoading}
                        error={advError}
                        onRetry={refetchAdvances}
                        currency={currency}
                        invoiceNumber={lpo.lpoNumber || lpo.id}
                        customerPhone={vendor?.mobile || vendor?.phone}
                        onPrintVoucher={(receipt) => onPrintVoucher?.(receipt, lpo)}
                    />
                )}
                {effectiveTab === 'timeline' && (
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
                                            <div className="font-medium text-slate-700 wrap-break-word">{ev.label}{ev.amount != null ? <> — <CurrencyAmount value={ev.amount} currency={currency} className="inline tabular-nums" /></> : null}</div>
                                            <div className="text-slate-400">{ev._display || formatDisplayDate(ev.date)}{ev.by ? ` · ${ev.by}` : ''}</div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                )}
            </div>
        </section>
    );

    const primaryContent = lpo && (<>{itemsTable}{tabbedContent}</>);

    const rightRail = lpo && (
        <>
            <RailCard title="Vendor Information" icon={Building2} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={lpo.vendorName} />
                    <InfoRow label="Code" value={lpo.vendorCode} copyable copyLabel="Vendor Code" />
                    <InfoRow label="Phone" value={vendor?.phone || vendor?.mobile} />
                    <InfoRow label="Email" value={vendor?.email} />
                    <InfoRow label="VAT / TRN" value={vendor?.trn || vendor?.vatNumber} copyable copyLabel="TRN" />
                    <InfoRow label="Address" value={vendor?.address} />
                </div>
            </RailCard>

            <RailCard title="Order & Delivery" icon={Truck} collapsible defaultOpen={false}>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Branch" value={lpo.branchName} />
                    <InfoRow label="Expected Delivery" value={lpo.expectedDeliveryDate ? formatDisplayDate(lpo.expectedDeliveryDate) : ''} />
                    <InfoRow label="Received" value={`${received}%`} />
                    <InfoRow label="Payment Terms" value={lpo.paymentTerms} />
                    <InfoRow label="Created From" value={lpo.createdFrom} />
                </div>
            </RailCard>

            {relatedDocs.length > 0 && (
                <RailCard title="Related Documents" icon={Link2} collapsible defaultOpen>
                    <div className="flex flex-wrap gap-1.5">
                        {relatedDocs.map((d) => (
                            <span key={d.label} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-[10px] text-slate-600 max-w-full" title={`${d.label}: ${d.ref}`}>
                                <span className="text-slate-400 shrink-0">{d.label}:</span>
                                <span className="font-medium text-slate-700 truncate">{d.ref}</span>
                            </span>
                        ))}
                    </div>
                </RailCard>
            )}

            {notes && (
                <RailCard title="Notes" icon={Package} collapsible defaultOpen={false}>
                    <div className="text-xs text-slate-700 whitespace-pre-wrap">{notes}</div>
                </RailCard>
            )}
        </>
    );

    const mobileActionBar = lpo && (
        <div className="flex items-center gap-2">
            {canPrint && (
                <button onClick={() => onPrint?.(lpo)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Printer size={14} /> Print
                </button>
            )}
            {canRecordAdvance && (
                <button onClick={() => onRecordAdvance?.(lpo)} className="flex-1 h-10 border border-emerald-300 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center gap-1.5 text-xs font-bold">
                    <DollarSign size={14} /> Advance
                </button>
            )}
            {canEditLpo && (
                <button onClick={() => onEdit?.(lpo)} aria-label="Edit" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Edit size={15} />
                </button>
            )}
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchLpo}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
