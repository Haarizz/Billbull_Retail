import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    X, Edit, Printer, Clock, Building2, Warehouse as WarehouseIcon,
    Link2, Package, ClipboardCheck,
} from 'lucide-react';
import RecordPreviewShell from '../../Sales/components/RecordPreviewShell';
import GrnItemsTable from './GrnItemsTable';
import { OverflowMenu, MenuItem, CopyField, InfoRow, RailCard, SummaryStrip } from './previewParts';
import { getGrnById } from '../../../api/grnApi';
import { getGrnStatusBadge, getInvStatusBadge, resolveGrnSourceType } from '../utils/grnStatusBadge';
import { getAvailableGrnActions } from '../utils/grnActionRules';
import { buildGrnTimeline } from '../utils/buildGrnTimeline';
import { findVendorRecord } from '../../../utils/purchasePrintUtils';
import { formatDisplayDate } from '../../../utils/dateUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';

const num = (v) => Number(v ?? 0);
const acceptedOf = (it) => it.acceptedQty ?? it.accepted ?? it.receivedQty ?? it.received ?? 0;
const rejectedOf = (it) => it.rejectedQty ?? it.rejected ?? 0;
const receivedOf = (it) => it.receivedQty ?? it.received ?? 0;

// Read-only Transaction Preview for a Goods Receipt Note — receipt/QC-centric
// (the purchase analog of the Delivery Note preview): summary tiles carry
// received/accepted/rejected/value, and the workspace tab is a QC timeline.
export default function GrnPreview({
    grnId,
    vendorsList = [],
    grnCurrency,
    onBack,
    onEdit,
    onPrint,
    isPrinting = false,
}) {
    const [grn, setGrn] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const { canEdit } = usePermission('PURCHASES');

    const fetchGrn = useCallback(async () => {
        if (!grnId) return;
        setLoadState('loading');
        try {
            const data = await getGrnById(grnId);
            if (!data) { setLoadState('not-found'); return; }
            setGrn(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [grnId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchGrn(); }, [fetchGrn]);

    const timeline = useMemo(() => buildGrnTimeline(grn), [grn]);

    const vendor = useMemo(
        () => (grn ? findVendorRecord(vendorsList, grn, grn?.vendor, grn?.vendorName, grn?.vendorCode) : null),
        [grn, vendorsList]
    );

    const actions = useMemo(() => getAvailableGrnActions(grn?.status), [grn?.status]);
    const canEditGrn = canEdit && actions.edit;
    const canPrint = actions.print;

    if (!grnId) return null;

    const statusBadge = grn ? getGrnStatusBadge(grn.status) : null;
    const invBadge = grn ? getInvStatusBadge(grn.invStatus) : null;
    const sourceType = grn ? resolveGrnSourceType(grn) : null;
    const currency = grnCurrency;

    const grnNo = grn?.grnNo || grn?.idDisplay || grn?.grnNumber;
    const grnDate = grn?.date || grn?.grnDate;
    const vendorName = grn?.vendor || grn?.vendorName;
    const items = (grn?.items) || [];
    const lineCount = items.length;
    const totalReceived = items.reduce((s, i) => s + num(receivedOf(i)), 0);
    const totalAccepted = items.reduce((s, i) => s + num(acceptedOf(i)), 0);
    const totalRejected = items.reduce((s, i) => s + num(rejectedOf(i)), 0);
    const totalValue = num(grn?.value ?? grn?.totalValue);

    const notes = grn?.qcRemarks || grn?.remarks || grn?.notes || '';

    const relatedDocs = grn ? [
        (grn.lpoNumber && grn.lpoNumber !== '-') && { label: 'LPO', ref: grn.lpoNumber },
        grn.invoiceNumber && { label: 'Purchase Invoice', ref: grn.invoiceNumber },
    ].filter(Boolean) : [];

    const secondaryActions = (
        <>
            {canEditGrn && <MenuItem onClick={() => onEdit?.(grn)} icon={Edit}>Edit</MenuItem>}
        </>
    );

    const headerContent = grn && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="GRN Number" value={grnNo} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {invBadge && <span className={invBadge.colorClasses}>{invBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={vendorName}>{vendorName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(grnDate)}</span>
                        {grn.warehouse && <><span className="text-slate-300">•</span><span className="flex items-center gap-1 whitespace-nowrap"><WarehouseIcon size={11} className="text-slate-400" /> {grn.warehouse}</span></>}
                        {sourceType?.ref && <><span className="text-slate-300">•</span><span className="whitespace-nowrap font-mono">{sourceType.ref}</span></>}
                    </div>
                </div>

                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <button onClick={() => onPrint?.(grn)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}
                    <div className="hidden xl:flex items-center gap-2">
                        {canEditGrn && (
                            <button onClick={() => onEdit?.(grn)} title="Edit GRN" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Edit size={13} /> Edit
                            </button>
                        )}
                    </div>
                    {canEditGrn && (
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
        { label: 'GRN Value', node: <CurrencyAmount value={totalValue} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Lines', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{lineCount}</span> },
        { label: 'Received', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalReceived}</span> },
        { label: 'Accepted', node: <span className="text-sm font-bold text-emerald-600 tabular-nums">{totalAccepted}</span> },
        {
            label: 'Rejected',
            node: <span className={`text-sm font-bold tabular-nums ${totalRejected > 0 ? 'text-red-500' : 'text-slate-800'}`}>{totalRejected}</span>,
            tint: totalRejected > 0 ? 'bg-red-50/50 border-red-100' : undefined,
        },
        { label: 'Packages', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{grn?.packages ?? '—'}</span> },
        { label: 'Warehouse', node: <span className="text-sm font-bold text-slate-800 truncate">{grn?.warehouse || '—'}</span> },
    ];

    const summaryContent = grn && <SummaryStrip tiles={summaryTiles} />;

    const itemsTable = grn && <GrnItemsTable grn={grn} currency={currency} />;

    const tabbedContent = grn && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 flex items-center gap-1 px-2" role="tablist">
                <span className="relative px-3 py-2.5 text-xs font-semibold flex items-center gap-1.5 text-[#8A6200]">
                    <ClipboardCheck size={13} className="text-[#D99A00]" /> Receipt Timeline
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

    const primaryContent = grn && (<>{itemsTable}{tabbedContent}</>);

    const rightRail = grn && (
        <>
            <RailCard title="Vendor Information" icon={Building2} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={vendorName} />
                    <InfoRow label="Code" value={grn.vendorCode || vendor?.code} copyable copyLabel="Vendor Code" />
                    <InfoRow label="Phone" value={vendor?.phone || vendor?.mobile} />
                    <InfoRow label="Email" value={vendor?.email} />
                    <InfoRow label="VAT / TRN" value={vendor?.trn || vendor?.vatNumber} copyable copyLabel="TRN" />
                </div>
            </RailCard>

            <RailCard title="Receipt Details" icon={Package} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Warehouse" value={grn.warehouse} />
                    <InfoRow label="Packages" value={grn.packages} />
                    <InfoRow label="Invoice Status" value={grn.invStatus} />
                    <InfoRow label="Delivery Note Ref" value={grn.deliveryNoteRef || grn.dnRef} />
                    <InfoRow label="Vehicle" value={grn.vehicleNo} />
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
                <RailCard title="QC / Remarks" icon={ClipboardCheck} collapsible defaultOpen={false}>
                    <div className="text-xs text-slate-700 whitespace-pre-wrap">{notes}</div>
                </RailCard>
            )}
        </>
    );

    const mobileActionBar = grn && (
        <div className="flex items-center gap-2">
            {canPrint && (
                <button onClick={() => onPrint?.(grn)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Printer size={14} /> Print
                </button>
            )}
            {canEditGrn && (
                <button onClick={() => onEdit?.(grn)} aria-label="Edit" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Edit size={15} />
                </button>
            )}
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchGrn}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
