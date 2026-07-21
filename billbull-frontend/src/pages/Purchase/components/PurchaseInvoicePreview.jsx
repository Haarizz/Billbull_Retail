import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    X, Edit, Printer, DollarSign, Clock, Building2, Receipt,
    Link2, CheckCircle2, AlertCircle, Warehouse as WarehouseIcon,
} from 'lucide-react';
import RecordPreviewShell from '../../Sales/components/RecordPreviewShell';
import PaymentHistorySection from '../../Sales/components/PaymentHistorySection';
import PurchaseItemsTable from './PurchaseItemsTable';
import { OverflowMenu, MenuItem, CopyField, InfoRow, RailCard, SummaryStrip } from './previewParts';
import { getInvoiceById } from '../../../api/purchaseInvoiceApi';
import { getPurchaseInvoiceStatusBadge, getPurchasePaymentBadge, resolvePurchaseInvoiceSourceType } from '../utils/purchaseInvoiceStatusBadge';
import { getAvailablePurchaseInvoiceActions } from '../utils/purchaseInvoiceActionRules';
import { buildPurchaseInvoiceTimeline } from '../utils/buildPurchaseInvoiceTimeline';
import { findVendorRecord } from '../../../utils/purchasePrintUtils';
import { formatDisplayDate } from '../../../utils/dateUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';

const num = (v) => Number(v ?? 0);

// Map the invoice's embedded vendor-payment records to the row shape
// PaymentHistorySection consumes.
function mapPayments(inv) {
    return (inv?.payments || [])
        .map((p, i) => ({
            key: `pp-${p.id ?? i}`,
            dbId: p.id ?? i,
            source: 'VENDOR_PAYMENT',
            sourceLabel: 'Vendor Payment',
            receiptNumber: p.voucherNumber || p.paymentNumber || p.referenceNo || `PAY-${p.id ?? i + 1}`,
            date: p.paymentDate || p.date || p.createdAt,
            customerName: inv?.vendorName,
            amount: num(p.paidAmount ?? p.amount),
            mode: p.paymentMode || p.mode || 'Bank Transfer',
            reference: p.referenceNo || p.reference || '',
            bankName: p.bankAccount || p.bankName || '',
            status: p.status || 'Completed',
            notes: p.notes || '',
            receivedBy: p.createdBy || p.paidBy || null,
            raw: p,
        }))
        .sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return db - da;
        });
}

// Read-only Transaction Preview for a Purchase Invoice — the vendor-side analog
// of the Sales Invoice preview: Grand Total / Paid / Outstanding summary,
// vendor-payments tab, and landed-cost detail in the totals footer.
export default function PurchaseInvoicePreview({
    invoiceId, // numeric backend id
    vendorsList = [],
    invoiceCurrency,
    onBack,
    onEdit,
    onPrint,
    onRecordPayment,
    isPrinting = false,
}) {
    const [invoice, setInvoice] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const [activeTab, setActiveTab] = useState('payments');
    const { canEdit } = usePermission('PURCHASES');

    const fetchInvoice = useCallback(async () => {
        if (!invoiceId) return;
        setLoadState('loading');
        try {
            const data = await getInvoiceById(invoiceId);
            if (!data) { setLoadState('not-found'); return; }
            setInvoice(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [invoiceId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchInvoice(); setActiveTab('payments'); }, [fetchInvoice]);

    const payments = useMemo(() => mapPayments(invoice), [invoice]);
    const timeline = useMemo(() => buildPurchaseInvoiceTimeline(invoice, payments), [invoice, payments]);

    const vendor = useMemo(
        () => (invoice ? findVendorRecord(vendorsList, invoice, invoice?.vendorName) : null),
        [invoice, vendorsList]
    );

    const actions = useMemo(
        () => getAvailablePurchaseInvoiceActions(invoice?.status, invoice?.paymentStatus),
        [invoice?.status, invoice?.paymentStatus]
    );
    const canEditInvoice = canEdit && actions.edit;
    const canPrint = actions.print;
    const canRecordPayment = canEdit && actions.recordPayment;

    if (!invoiceId) return null;

    const statusBadge = invoice ? getPurchaseInvoiceStatusBadge(invoice.status) : null;
    const paymentBadge = invoice ? getPurchasePaymentBadge(invoice.paymentStatus) : null;
    const sourceType = invoice ? resolvePurchaseInvoiceSourceType(invoice) : null;
    const currency = invoiceCurrency;

    const items = (invoice?.items) || [];
    const itemCount = items.length;
    const totalQty = items.reduce((s, i) => s + num(i.quantity ?? i.qty), 0);
    const grandTotal = num(invoice?.grandTotal ?? invoice?.total);
    const amountPaid = num(invoice?.amountPaid ?? payments.reduce((s, p) => s + p.amount, 0));
    const outstanding = num(invoice?.balanceDue ?? Math.max(0, grandTotal - amountPaid));
    const isSettled = outstanding <= 0;
    const taxTotal = num(invoice?.taxTotal ?? invoice?.tax);
    const subTotal = num(invoice?.subTotal ?? (grandTotal - taxTotal));

    const landedCosts = invoice ? [
        ['Freight', invoice.freight], ['Customs Duty', invoice.customsDuty],
        ['Handling', invoice.handling], ['Clearing', invoice.clearing],
        ['Insurance', invoice.insurance], ['Other Costs', invoice.otherCosts],
    ].filter(([, v]) => num(v) > 0) : [];

    const relatedDocs = invoice ? [
        invoice.grnNo && { label: 'GRN', ref: invoice.grnNo },
        invoice.referenceNo && { label: 'Reference', ref: invoice.referenceNo },
        invoice.vendorInvoiceNo && { label: 'Vendor Invoice', ref: invoice.vendorInvoiceNo },
    ].filter(Boolean) : [];

    const secondaryActions = (
        <>
            {canEditInvoice && <MenuItem onClick={() => onEdit?.(invoice)} icon={Edit}>Edit</MenuItem>}
            {canRecordPayment && <MenuItem onClick={() => onRecordPayment?.(invoice)} icon={DollarSign} danger>Record Payment</MenuItem>}
        </>
    );

    const headerContent = invoice && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="Invoice Number" value={invoice.invoiceNumber} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {paymentBadge && <span className={paymentBadge.colorClasses}>{paymentBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={invoice.vendorName}>{invoice.vendorName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(invoice.invoiceDate)}</span>
                        {invoice.dueDate && <><span className="text-slate-300">•</span><span className="whitespace-nowrap">Due {formatDisplayDate(invoice.dueDate)}</span></>}
                        {invoice.warehouseName && <><span className="text-slate-300">•</span><span className="flex items-center gap-1 whitespace-nowrap"><WarehouseIcon size={11} className="text-slate-400" /> {invoice.warehouseName}</span></>}
                        {invoice.branchName && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={invoice.branchName}>{invoice.branchName}</span></>}
                    </div>
                </div>

                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <button onClick={() => onPrint?.(invoice)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}
                    <div className="hidden xl:flex items-center gap-2">
                        {canEditInvoice && (
                            <button onClick={() => onEdit?.(invoice)} title="Edit invoice" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Edit size={13} /> Edit
                            </button>
                        )}
                        {canRecordPayment && (
                            <button onClick={() => onRecordPayment?.(invoice)} title="Record payment" className="h-8 px-3 border border-emerald-300 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center gap-1.5 text-xs font-bold">
                                <DollarSign size={13} /> Record Payment
                            </button>
                        )}
                    </div>
                    {(canEditInvoice || canRecordPayment) && (
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
        { label: 'Grand Total', node: <CurrencyAmount value={grandTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Paid Amount', node: <CurrencyAmount value={amountPaid} currency={currency} className="text-sm font-bold text-emerald-600 tabular-nums" /> },
        {
            label: 'Outstanding',
            node: <CurrencyAmount value={outstanding} currency={currency} className={`text-sm font-bold tabular-nums ${isSettled ? 'text-emerald-600' : 'text-red-500'}`} />,
            icon: isSettled ? CheckCircle2 : AlertCircle,
            iconCls: isSettled ? 'text-emerald-400' : 'text-red-400',
            tint: isSettled ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100',
        },
        { label: 'Items', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{itemCount}</span> },
        { label: 'Total Qty', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalQty}</span> },
        { label: 'Tax', node: <CurrencyAmount value={taxTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Due Date', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{invoice?.dueDate ? formatDisplayDate(invoice.dueDate) : '—'}</span> },
    ];

    const summaryContent = invoice && <SummaryStrip tiles={summaryTiles} />;

    const footerTotals = [
        { label: 'Subtotal', value: subTotal },
        ...landedCosts.map(([label, value]) => ({ label, value })),
        { label: 'Tax (VAT)', value: taxTotal },
        { label: 'Grand Total', value: grandTotal, strong: true },
        ...(amountPaid > 0 ? [{ label: 'Paid', value: amountPaid, cls: 'text-emerald-600' }] : []),
        ...(amountPaid > 0 ? [{ label: 'Outstanding', value: outstanding, cls: 'font-semibold text-slate-700' }] : []),
    ];

    const itemsTable = invoice && <PurchaseItemsTable items={items} currency={currency} totals={footerTotals} emptyLabel="No items on this invoice." />;

    const tabs = invoice ? [
        { key: 'payments', label: 'Payments', icon: Receipt, count: payments.length },
        { key: 'timeline', label: 'Timeline', icon: Clock, count: timeline.length },
    ] : [];
    const effectiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key);

    const tabbedContent = invoice && (
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
                {effectiveTab === 'payments' && (
                    <PaymentHistorySection
                        payments={payments}
                        loading={false}
                        error={null}
                        currency={currency}
                        invoiceNumber={invoice.invoiceNumber}
                        customerPhone={vendor?.mobile || vendor?.phone}
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

    const primaryContent = invoice && (<>{itemsTable}{tabbedContent}</>);

    const rightRail = invoice && (
        <>
            <RailCard title="Vendor Information" icon={Building2} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={invoice.vendorName} />
                    <InfoRow label="Vendor Invoice No." value={invoice.vendorInvoiceNo} copyable copyLabel="Vendor Invoice No." />
                    <InfoRow label="Vendor Invoice Date" value={invoice.vendorInvoiceDate ? formatDisplayDate(invoice.vendorInvoiceDate) : ''} />
                    <InfoRow label="Phone" value={vendor?.phone || vendor?.mobile} />
                    <InfoRow label="Email" value={vendor?.email} />
                    <InfoRow label="VAT / TRN" value={vendor?.trn || vendor?.vatNumber} copyable copyLabel="TRN" />
                </div>
            </RailCard>

            <RailCard title="Invoice Details" icon={Receipt} collapsible defaultOpen={false}>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Branch" value={invoice.branchName} />
                    <InfoRow label="Warehouse" value={invoice.warehouseName} />
                    <InfoRow label="Due Date" value={invoice.dueDate ? formatDisplayDate(invoice.dueDate) : ''} />
                    <InfoRow label="Submitted By" value={invoice.submittedBy} />
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
        </>
    );

    const mobileActionBar = invoice && (
        <div className="flex items-center gap-2">
            {canPrint && (
                <button onClick={() => onPrint?.(invoice)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Printer size={14} /> Print
                </button>
            )}
            {canRecordPayment && (
                <button onClick={() => onRecordPayment?.(invoice)} className="flex-1 h-10 border border-emerald-300 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center gap-1.5 text-xs font-bold">
                    <DollarSign size={14} /> Payment
                </button>
            )}
            {canEditInvoice && (
                <button onClick={() => onEdit?.(invoice)} aria-label="Edit" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Edit size={15} />
                </button>
            )}
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchInvoice}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
