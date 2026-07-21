import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    X, Edit, Printer, Mail, Copy, Clock, User, MessageSquare, Receipt,
    Building2, Link2, CheckCircle2, AlertCircle, CalendarClock, MoreHorizontal, ChevronDown,
} from 'lucide-react';
import RecordPreviewShell from './RecordPreviewShell';
import ProformaItemsTable from './ProformaItemsTable';
import { getProformaById } from '../../../api/proformaApi';
import { getProformaStatusBadge, resolveProformaSourceType } from '../utils/proformaStatusBadge';
import { getAvailableProformaActions } from '../utils/proformaActionRules';
import { buildProformaTimeline } from '../utils/buildProformaTimeline';
import { resolveCustomer, resolveDefaultShippingAddress } from '../../../utils/customerResolution';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { copyToClipboard } from '../../../utils/clipboard';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';

function OverflowMenu({ children, label = 'More' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium"
            >
                <MoreHorizontal size={14} /> {label}
            </button>
            {open && (
                <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 mt-1 z-30 min-w-42 bg-white border border-slate-200 rounded-lg shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    {children}
                </div>
            )}
        </div>
    );
}

function MenuItem({ onClick, icon: Icon, children, disabled }) {
    return (
        <button type="button" role="menuitem" onClick={onClick} disabled={disabled}
            className="w-full px-3 py-2 flex items-center gap-2 text-xs font-medium text-left disabled:opacity-40 text-slate-700 hover:bg-slate-50">
            {Icon && <Icon size={13} className="text-slate-400" />} {children}
        </button>
    );
}

function CopyField({ label, value, className = '' }) {
    if (!value) return null;
    return (
        <button type="button" onClick={() => copyToClipboard(value, label)}
            className={`inline-flex items-center gap-1 hover:text-[#D99A00] transition-colors ${className}`} title={`Copy ${label}`}>
            <span className="truncate">{value}</span>
            <Copy size={11} className="shrink-0" />
        </button>
    );
}

function InfoRow({ label, value, copyable = false, copyLabel }) {
    const has = value != null && value !== '';
    const text = has ? String(value) : '';
    return (
        <div className="flex items-start justify-between gap-3 py-1 text-xs">
            <span className="text-slate-400 shrink-0">{label}</span>
            {has ? (
                copyable
                    ? <CopyField label={copyLabel || label} value={value} className="text-slate-700 font-medium min-w-0 justify-end" />
                    : <span className="text-slate-700 font-medium text-right min-w-0 wrap-break-word" title={text}>{value}</span>
            ) : (
                <span className="text-slate-300">—</span>
            )}
        </div>
    );
}

function RailCard({ title, icon: Icon, children, collapsible = false, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {collapsible ? (
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                    className="w-full px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-left xl:cursor-default">
                    <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2"><Icon size={14} className="text-[#D99A00]" /> {title}</h2>
                    <ChevronDown size={15} className={`text-slate-400 transition-transform xl:hidden ${open ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <div className="px-4 py-2.5 border-b border-slate-100">
                    <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2"><Icon size={14} className="text-[#D99A00]" /> {title}</h2>
                </div>
            )}
            <div className={`px-4 py-2.5 ${collapsible && !open ? 'hidden xl:block' : ''}`}>{children}</div>
        </section>
    );
}

// Read-only Transaction Preview for a Proforma Invoice — mirrors the Sales Order
// preview (a proforma is a quote-with-advance): the summary carries Grand Total /
// Advance / Balance, and the workspace's second tab is the timeline.
export default function ProformaPreview({
    proformaId,
    customersList = [],
    proformaCurrency,
    onBack,
    onEdit,
    onPrint,
    onOpenEmailModal,
    isPrinting = false,
}) {
    const [proforma, setProforma] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const [activeTab, setActiveTab] = useState('timeline');
    const { canEdit } = usePermission('SALES');

    const fetchProforma = useCallback(async () => {
        if (!proformaId) return;
        setLoadState('loading');
        try {
            const data = await getProformaById(proformaId);
            if (!data) { setLoadState('not-found'); return; }
            setProforma(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [proformaId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchProforma(); setActiveTab('timeline'); }, [fetchProforma]);

    const timeline = useMemo(() => buildProformaTimeline(proforma), [proforma]);

    const customer = useMemo(
        () => (proforma ? resolveCustomer({ customerCode: proforma.customerCode, customerName: proforma.customerName }, customersList) : null),
        [proforma, customersList]
    );

    const actions = useMemo(() => getAvailableProformaActions(proforma?.status), [proforma?.status]);
    const canEditProforma = canEdit && actions.edit;
    const canPrint = actions.print;
    const canEmail = actions.email;

    if (!proformaId) return null;

    const num = (v) => Number(v ?? 0);
    const statusBadge = proforma ? getProformaStatusBadge(proforma.status) : null;
    const sourceType = proforma ? resolveProformaSourceType(proforma) : null;
    const currency = proformaCurrency;

    const items = (proforma?.items) || [];
    const itemCount = items.length;
    const totalQty = items.reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0);
    const grandTotal = num(proforma?.grandTotal ?? proforma?.totalAmount);
    const advanceTotal = num(proforma?.advancePaid ?? proforma?.advanceAmount);
    const balanceDue = proforma ? num(proforma.balanceDue ?? Math.max(0, grandTotal - advanceTotal)) : 0;
    const isSettled = balanceDue <= 0 && advanceTotal > 0;
    const discountTotal = num(proforma?.billDiscountAmount ?? proforma?.discountAmount);
    const taxTotal = num(proforma?.taxTotal ?? proforma?.totalTax ?? proforma?.taxAmount
        ?? items.reduce((s, i) => s + num(i.taxAmount ?? i.taxAmt), 0));

    const isExpired = String(proforma?.status || '').toUpperCase() === 'EXPIRED';

    const notes = proforma?.notesToCustomer || proforma?.customerNotes || proforma?.notes || '';
    const billingAddress = customer?.billingAddress || customer?.address || '';
    const shippingAddress = proforma?.shippingAddress || (customer ? resolveDefaultShippingAddress(customer) : '');

    const relatedDocs = proforma ? [
        proforma.quotationNo && { label: 'Quotation', ref: proforma.quotationNo },
        proforma.salesOrderNo && { label: 'Sales Order', ref: proforma.salesOrderNo },
        proforma.linkedSalesInvoiceNumber && { label: 'Sales Invoice', ref: proforma.linkedSalesInvoiceNumber },
    ].filter(Boolean) : [];

    const secondaryActions = (
        <>
            {canEmail && <MenuItem onClick={() => onOpenEmailModal?.(proforma)} icon={Mail}>Email</MenuItem>}
            {canEditProforma && <MenuItem onClick={() => onEdit?.(proforma)} icon={Edit}>Edit</MenuItem>}
        </>
    );

    const headerContent = proforma && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="Proforma Number" value={proforma.piNumber} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={proforma.customerName}>{proforma.customerName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(proforma.piDate)}</span>
                        {proforma.validUntil && <><span className="text-slate-300">•</span><span className={`flex items-center gap-1 whitespace-nowrap ${isExpired ? 'text-amber-600 font-medium' : ''}`}><CalendarClock size={11} className={isExpired ? 'text-amber-500' : 'text-slate-400'} /> Valid until {formatDisplayDate(proforma.validUntil)}</span></>}
                        {proforma.branch?.name && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={proforma.branch.name}>{proforma.branch.name}</span></>}
                        {proforma.paymentMethod && <><span className="text-slate-300">•</span><span className="border border-slate-200 px-1.5 py-0.5 rounded text-[10px] bg-slate-50 text-slate-600 whitespace-nowrap">{proforma.paymentMethod}</span></>}
                    </div>
                </div>

                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <button onClick={() => onPrint?.(proforma)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}
                    <div className="hidden xl:flex items-center gap-2">
                        {canEmail && (
                            <button onClick={() => onOpenEmailModal?.(proforma)} title="Email proforma" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Mail size={13} /> Email
                            </button>
                        )}
                        {canEditProforma && (
                            <button onClick={() => onEdit?.(proforma)} title="Edit proforma" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Edit size={13} /> Edit
                            </button>
                        )}
                    </div>
                    {(canEmail || canEditProforma) && (
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
        { label: 'Discount', node: <CurrencyAmount value={discountTotal} currency={currency} className="text-sm font-bold text-red-500 tabular-nums" /> },
        { label: 'Tax', node: <CurrencyAmount value={taxTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
    ];

    const summaryContent = proforma && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {summaryTiles.map((t) => (
                <div key={t.label} className={`border rounded-lg px-3 py-2 text-center bg-white flex flex-col justify-center ${t.tint || 'border-slate-200'} shadow-sm`}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1 flex items-center justify-center gap-1 truncate">
                        {t.icon && <t.icon size={10} className={t.iconCls} />} {t.label}
                    </div>
                    <div className="truncate">{t.node}</div>
                </div>
            ))}
        </div>
    );

    const itemsTable = proforma && <ProformaItemsTable proforma={proforma} currency={currency} />;

    const tabs = proforma ? [
        { key: 'timeline', label: 'Timeline', icon: Clock, count: timeline.length },
        notes && { key: 'notes', label: 'Notes', icon: MessageSquare },
    ].filter(Boolean) : [];

    const effectiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key);

    const tabbedContent = proforma && (
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
                                            <div className="text-slate-400">{formatDisplayDate(ev.date)}{ev.by ? ` · ${ev.by}` : ''}</div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                )}
                {effectiveTab === 'notes' && (
                    <div className="p-4 md:p-5 text-xs text-slate-700 whitespace-pre-wrap">{notes}</div>
                )}
            </div>
        </section>
    );

    const primaryContent = proforma && (<>{itemsTable}{tabbedContent}</>);

    const rightRail = proforma && (
        <>
            <RailCard title="Customer Information" icon={User} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={proforma.customerName} />
                    <InfoRow label="Code" value={proforma.customerCode} copyable copyLabel="Customer Code" />
                    <InfoRow label="Phone" value={customer?.phone || customer?.mobile} />
                    <InfoRow label="Email" value={customer?.email} />
                    <InfoRow label="VAT / TRN" value={customer?.trn || proforma.customerTrn} copyable copyLabel="TRN" />
                    <InfoRow label="Billing" value={billingAddress} />
                    <InfoRow label="Shipping" value={shippingAddress} />
                </div>
            </RailCard>

            <RailCard title="Proforma Terms" icon={Building2} collapsible defaultOpen={false}>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Branch" value={proforma.branch?.name} />
                    <InfoRow label="Valid Until" value={proforma.validUntil ? formatDisplayDate(proforma.validUntil) : ''} />
                    <InfoRow label="Payment Method" value={proforma.paymentMethod} />
                    <InfoRow label="Revision" value={proforma.revisionNo ? `v${proforma.revisionNo}` : ''} />
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

    const mobileActionBar = proforma && (
        <div className="flex items-center gap-2">
            {canPrint && (
                <button onClick={() => onPrint?.(proforma)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Printer size={14} /> Print
                </button>
            )}
            {canEmail && (
                <button onClick={() => onOpenEmailModal?.(proforma)} className="flex-1 h-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center gap-1.5 text-xs font-bold">
                    <Mail size={14} /> Email
                </button>
            )}
            {canEditProforma && (
                <button onClick={() => onEdit?.(proforma)} aria-label="Edit" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Edit size={15} />
                </button>
            )}
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchProforma}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
