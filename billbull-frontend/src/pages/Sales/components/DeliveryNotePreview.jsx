import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    X, Edit, Printer, Mail, Copy, Clock, User, Truck, Warehouse as WarehouseIcon,
    Building2, Link2, MoreHorizontal, ChevronDown, ClipboardList,
} from 'lucide-react';
import RecordPreviewShell from './RecordPreviewShell';
import DeliveryNoteItemsTable from './DeliveryNoteItemsTable';
import { getDeliveryNoteById } from '../../../api/deliveryNoteApi';
import { getDeliveryNoteStatusBadge, getPodBadge, resolveDeliveryNoteSourceType } from '../utils/deliveryNoteStatusBadge';
import { getAvailableDeliveryNoteActions } from '../utils/deliveryNoteActionRules';
import { buildDeliveryNoteTimeline } from '../utils/buildDeliveryNoteTimeline';
import { resolveCustomer, resolveDefaultShippingAddress } from '../../../utils/customerResolution';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { copyToClipboard } from '../../../utils/clipboard';
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
            <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
                className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
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

const num = (v) => Number(v ?? 0);

// Read-only Transaction Preview for a Delivery Note. Unlike the sales-money
// previews, DN is a fulfillment document: the summary strip and rail are
// logistics-centric (qty/boxes/warehouse/driver/POD), with a delivery timeline
// instead of a payment ledger.
export default function DeliveryNotePreview({
    deliveryNoteId,
    customersList = [],
    onBack,
    onEdit,
    onPrint,
    onPrintPickList,
    onOpenEmailModal,
    isPrinting = false,
}) {
    const [dn, setDn] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const { canEdit } = usePermission('SALES');

    const fetchDn = useCallback(async () => {
        if (!deliveryNoteId) return;
        setLoadState('loading');
        try {
            const data = await getDeliveryNoteById(deliveryNoteId);
            if (!data) { setLoadState('not-found'); return; }
            setDn(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [deliveryNoteId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchDn(); }, [fetchDn]);

    const timeline = useMemo(() => buildDeliveryNoteTimeline(dn), [dn]);

    const customer = useMemo(
        () => (dn ? resolveCustomer({ customerCode: dn.customerCode, customerName: dn.customerName }, customersList) : null),
        [dn, customersList]
    );

    const actions = useMemo(() => getAvailableDeliveryNoteActions(dn?.status), [dn?.status]);
    const canEditDn = canEdit && actions.edit;
    const canPrint = actions.print;
    const canEmail = actions.email;
    const canPickList = actions.pickList;

    if (!deliveryNoteId) return null;

    const statusBadge = dn ? getDeliveryNoteStatusBadge(dn.status) : null;
    const podBadge = dn ? getPodBadge(dn.status, dn.pod) : null;
    const sourceType = dn ? resolveDeliveryNoteSourceType(dn) : null;

    const items = (dn?.items) || [];
    const lineCount = num(dn?.totalLines) || items.length;
    const totalQty = num(dn?.totalQty) || items.reduce((s, i) => s + Number(i.currentQty ?? i.quantity ?? i.qty ?? 0), 0);
    const totalBoxes = num(dn?.totalBoxes) || items.reduce((s, i) => s + Number(i.boxes ?? 0), 0);

    const shippingAddress = dn?.shippingAddress || (customer ? resolveDefaultShippingAddress(customer) : '');
    const dnDate = dn?.dnDate || dn?.date;

    const relatedDocs = dn ? [
        dn.salesOrderNo && { label: 'Sales Order', ref: dn.salesOrderNo },
        (dn.proformaNo && dn.proformaNo !== '-') && { label: 'Proforma', ref: dn.proformaNo },
        dn.linkedSalesInvoiceNumber && { label: 'Sales Invoice', ref: dn.linkedSalesInvoiceNumber },
    ].filter(Boolean) : [];

    const secondaryActions = (
        <>
            {canEmail && <MenuItem onClick={() => onOpenEmailModal?.(dn)} icon={Mail}>Email</MenuItem>}
            {canPickList && <MenuItem onClick={() => onPrintPickList?.(dn)} icon={ClipboardList}>Print Pick List</MenuItem>}
            {canEditDn && <MenuItem onClick={() => onEdit?.(dn)} icon={Edit}>Edit</MenuItem>}
        </>
    );

    const headerContent = dn && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="Delivery Note Number" value={dn.dnNumber} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {podBadge && <span className={podBadge.colorClasses}>{podBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={dn.customerName}>{dn.customerName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(dnDate)}</span>
                        {dn.warehouse && <><span className="text-slate-300">•</span><span className="flex items-center gap-1 whitespace-nowrap"><WarehouseIcon size={11} className="text-slate-400" /> {dn.warehouse}</span></>}
                        {dn.driverName && <><span className="text-slate-300">•</span><span className="flex items-center gap-1 whitespace-nowrap"><Truck size={11} className="text-slate-400" /> {dn.driverName}</span></>}
                        {dn.branchName && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={dn.branchName}>{dn.branchName}</span></>}
                    </div>
                </div>

                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <button onClick={() => onPrint?.(dn)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}
                    <div className="hidden xl:flex items-center gap-2">
                        {canPickList && (
                            <button onClick={() => onPrintPickList?.(dn)} title="Print pick list" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <ClipboardList size={13} /> Pick List
                            </button>
                        )}
                        {canEmail && (
                            <button onClick={() => onOpenEmailModal?.(dn)} title="Email delivery note" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Mail size={13} /> Email
                            </button>
                        )}
                        {canEditDn && (
                            <button onClick={() => onEdit?.(dn)} title="Edit delivery note" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Edit size={13} /> Edit
                            </button>
                        )}
                    </div>
                    {(canEmail || canEditDn || canPickList) && (
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
        { label: 'Total Qty', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalQty}</span> },
        { label: 'Lines', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{lineCount}</span> },
        { label: 'Boxes', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalBoxes || '—'}</span> },
        { label: 'Warehouse', node: <span className="text-sm font-bold text-slate-800 truncate">{dn?.warehouse || '—'}</span> },
        { label: 'Driver', node: <span className="text-sm font-bold text-slate-800 truncate">{dn?.driverName || '—'}</span> },
        { label: 'Vehicle', node: <span className="text-sm font-bold text-slate-800 truncate">{dn?.vehicleNo || '—'}</span> },
        {
            label: 'Delivered',
            node: <span className="text-sm font-bold text-slate-800 tabular-nums">{dn?.receivedDate ? formatDisplayDate(dn.receivedDate) : '—'}</span>,
            tint: String(dn?.status || '').toUpperCase() === 'DELIVERED' ? 'bg-emerald-50/50 border-emerald-100' : undefined,
        },
    ];

    const summaryContent = dn && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {summaryTiles.map((t) => (
                <div key={t.label} className={`border rounded-lg px-3 py-2 text-center bg-white flex flex-col justify-center ${t.tint || 'border-slate-200'} shadow-sm`}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1 truncate">{t.label}</div>
                    <div className="truncate">{t.node}</div>
                </div>
            ))}
        </div>
    );

    const itemsTable = dn && <DeliveryNoteItemsTable deliveryNote={dn} />;

    const tabbedContent = dn && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 flex items-center gap-1 px-2" role="tablist">
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
                                    <div className="text-slate-400">{ev._display || formatDisplayDate(ev.date)}{ev.by ? ` · ${ev.by}` : ''}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );

    const primaryContent = dn && (<>{itemsTable}{tabbedContent}</>);

    const rightRail = dn && (
        <>
            <RailCard title="Customer Information" icon={User} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={dn.customerName} />
                    <InfoRow label="Code" value={dn.customerCode} copyable copyLabel="Customer Code" />
                    <InfoRow label="Phone" value={customer?.phone || customer?.mobile} />
                    <InfoRow label="Email" value={customer?.email} />
                    <InfoRow label="Shipping" value={shippingAddress} />
                </div>
            </RailCard>

            <RailCard title="Shipping & Logistics" icon={Truck} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Warehouse" value={dn.warehouse} />
                    <InfoRow label="Driver" value={dn.driverName} />
                    <InfoRow label="Vehicle No." value={dn.vehicleNo} />
                    <InfoRow label="Tracking No." value={dn.trackingNo} copyable copyLabel="Tracking No." />
                    <InfoRow label="Received By" value={dn.receivedBy} />
                    <InfoRow label="Received Date" value={dn.receivedDate ? formatDisplayDate(dn.receivedDate) : ''} />
                </div>
            </RailCard>

            <RailCard title="Branch & Source" icon={Building2} collapsible defaultOpen={false}>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Branch" value={dn.branchName} />
                    <InfoRow label="Auto-generated" value={dn.autoGenerated ? 'Yes' : 'No'} />
                    <InfoRow label="Type" value={dn.type} />
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

    const mobileActionBar = dn && (
        <div className="flex items-center gap-2">
            {canPrint && (
                <button onClick={() => onPrint?.(dn)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Printer size={14} /> Print
                </button>
            )}
            {canPickList && (
                <button onClick={() => onPrintPickList?.(dn)} aria-label="Pick list" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <ClipboardList size={15} />
                </button>
            )}
            {canEmail && (
                <button onClick={() => onOpenEmailModal?.(dn)} aria-label="Email" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Mail size={15} />
                </button>
            )}
            {canEditDn && (
                <button onClick={() => onEdit?.(dn)} aria-label="Edit" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Edit size={15} />
                </button>
            )}
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchDn}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
