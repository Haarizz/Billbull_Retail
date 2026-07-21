import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    X, Edit, Printer, Mail, Copy, Clock, User, MessageSquare, GitBranch,
    Building2, Link2, CalendarClock, MoreHorizontal, ChevronDown,
} from 'lucide-react';
import RecordPreviewShell from './RecordPreviewShell';
import QuotationItemsTable from './QuotationItemsTable';
import { getQuotationById } from '../../../api/quotationApi';
import { getQuotationStatusBadge, resolveQuotationSourceType } from '../utils/quotationStatusBadge';
import { getAvailableQuotationActions } from '../utils/quotationActionRules';
import { buildQuotationTimeline } from '../utils/buildQuotationTimeline';
import { resolveCustomer, resolveDefaultShippingAddress } from '../../../utils/customerResolution';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { copyToClipboard } from '../../../utils/clipboard';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';

// Small dropdown for secondary header actions (collapses into "More" below xl).
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
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            disabled={disabled}
            className="w-full px-3 py-2 flex items-center gap-2 text-xs font-medium text-left disabled:opacity-40 text-slate-700 hover:bg-slate-50"
        >
            {Icon && <Icon size={13} className="text-slate-400" />} {children}
        </button>
    );
}

function CopyField({ label, value, className = '' }) {
    if (!value) return null;
    return (
        <button
            type="button"
            onClick={() => copyToClipboard(value, label)}
            className={`inline-flex items-center gap-1 hover:text-[#D99A00] transition-colors ${className}`}
            title={`Copy ${label}`}
        >
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
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    className="w-full px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-left xl:cursor-default"
                >
                    <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                        <Icon size={14} className="text-[#D99A00]" /> {title}
                    </h2>
                    <ChevronDown size={15} className={`text-slate-400 transition-transform xl:hidden ${open ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <div className="px-4 py-2.5 border-b border-slate-100">
                    <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                        <Icon size={14} className="text-[#D99A00]" /> {title}
                    </h2>
                </div>
            )}
            <div className={`px-4 py-2.5 ${collapsible && !open ? 'hidden xl:block' : ''}`}>{children}</div>
        </section>
    );
}

// A quotation may carry the customer as "Name - CODE"; strip the code for display.
function customerDisplayName(qtn) {
    const raw = qtn?.customer || qtn?.customerName || '';
    if (qtn?.customerCode && raw.endsWith(` - ${qtn.customerCode}`)) {
        return raw.slice(0, -(` - ${qtn.customerCode}`).length);
    }
    return raw;
}

// Read-only Transaction Preview for a Quotation — the quotation analog of the
// Sales Order preview. Reuses the document-agnostic RecordPreviewShell. A
// quotation has no payments, so the workspace's second tab shows Revisions
// (a quotation's real history spine) instead of a payment ledger.
export default function QuotationPreview({
    quotationId,
    customersList = [],
    quotationCurrency,
    onBack,
    onEdit,
    onPrint,
    onOpenEmailModal,
    isPrinting = false,
}) {
    const [quotation, setQuotation] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const [activeTab, setActiveTab] = useState('revisions');
    const { canEdit } = usePermission('SALES');

    const fetchQuotation = useCallback(async () => {
        if (!quotationId) return;
        setLoadState('loading');
        try {
            const data = await getQuotationById(quotationId);
            if (!data) { setLoadState('not-found'); return; }
            setQuotation(data);
            setLoadState('ready');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) setLoadState('not-found');
            else if (status === 403) setLoadState('forbidden');
            else setLoadState('error');
        }
    }, [quotationId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchQuotation(); setActiveTab('revisions'); }, [fetchQuotation]);

    const revisions = useMemo(() => quotation?.revisions || [], [quotation]);
    const timeline = useMemo(() => buildQuotationTimeline(quotation, revisions), [quotation, revisions]);

    const custName = customerDisplayName(quotation);
    const customer = useMemo(
        () => (quotation ? resolveCustomer({ customerCode: quotation.customerCode, customerName: custName }, customersList) : null),
        [quotation, custName, customersList]
    );

    const actions = useMemo(() => getAvailableQuotationActions(quotation?.status), [quotation?.status]);
    const canEditQuotation = canEdit && actions.edit;
    const canPrint = actions.print;
    const canEmail = actions.email;

    if (!quotationId) return null;

    const num = (v) => Number(v ?? 0);
    const statusBadge = quotation ? getQuotationStatusBadge(quotation.status) : null;
    const sourceType = quotation ? resolveQuotationSourceType(quotation) : null;
    const currency = quotationCurrency;

    const items = (quotation?.items) || [];
    const itemCount = items.length;
    const totalQty = items.reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0);
    const grandTotal = num(quotation?.totalAmount ?? quotation?.total);
    const discountTotal = num(quotation?.billDiscountAmount ?? quotation?.discountAmount);
    const taxTotal = num(quotation?.taxTotal ?? quotation?.totalTax ?? quotation?.taxAmount
        ?? items.reduce((s, i) => s + num(i.taxAmount ?? i.taxAmt), 0));

    const isExpired = String(quotation?.status || '').toUpperCase() === 'EXPIRED';

    const notes = quotation?.notesToCustomer || quotation?.customerNotes || '';
    const billingAddress = customer?.billingAddress || customer?.address || '';
    const shippingAddress = quotation?.shippingAddress || (customer ? resolveDefaultShippingAddress(customer) : '');

    // ── Section 1: Transaction header ──
    const secondaryActions = (
        <>
            {canEmail && <MenuItem onClick={() => onOpenEmailModal?.(quotation)} icon={Mail}>Email</MenuItem>}
            {canEditQuotation && <MenuItem onClick={() => onEdit?.(quotation)} icon={Edit}>Edit</MenuItem>}
        </>
    );

    const headerContent = quotation && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3.5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                            <CopyField label="Quotation Number" value={quotation.qtnNo} className="text-slate-900" />
                        </h1>
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                        {revisions.length > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200"><GitBranch size={10} /> Rev {revisions.length}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={custName}>{custName || '—'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(quotation.date)}</span>
                        {quotation.validTill && <><span className="text-slate-300">•</span><span className={`flex items-center gap-1 whitespace-nowrap ${isExpired ? 'text-amber-600 font-medium' : ''}`}><CalendarClock size={11} className={isExpired ? 'text-amber-500' : 'text-slate-400'} /> Valid till {formatDisplayDate(quotation.validTill)}</span></>}
                        {quotation.branchName && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={quotation.branchName}>{quotation.branchName}</span></>}
                    </div>
                </div>

                {/* Action toolbar (md+; mobile uses the sticky bar) */}
                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <button onClick={() => onPrint?.(quotation)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}

                    <div className="hidden xl:flex items-center gap-2">
                        {canEmail && (
                            <button onClick={() => onOpenEmailModal?.(quotation)} title="Email quotation" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Mail size={13} /> Email
                            </button>
                        )}
                        {canEditQuotation && (
                            <button onClick={() => onEdit?.(quotation)} title="Edit quotation" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Edit size={13} /> Edit
                            </button>
                        )}
                    </div>

                    {(canEmail || canEditQuotation) && (
                        <div className="xl:hidden">
                            <OverflowMenu>{secondaryActions}</OverflowMenu>
                        </div>
                    )}

                    <button onClick={onBack} aria-label="Close preview" className="group h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors">
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );

    // ── Section 2: Executive summary strip ──
    const summaryTiles = [
        { label: 'Grand Total', node: <CurrencyAmount value={grandTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Items', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{itemCount}</span> },
        { label: 'Total Qty', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalQty}</span> },
        { label: 'Discount', node: <CurrencyAmount value={discountTotal} currency={currency} className="text-sm font-bold text-red-500 tabular-nums" /> },
        { label: 'Tax', node: <CurrencyAmount value={taxTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Revisions', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{revisions.length}</span> },
        {
            label: 'Valid Till',
            node: <span className={`text-sm font-bold tabular-nums ${isExpired ? 'text-amber-600' : 'text-slate-800'}`}>{quotation?.validTill ? formatDisplayDate(quotation.validTill) : '—'}</span>,
            tint: isExpired ? 'bg-amber-50/50 border-amber-100' : undefined,
        },
    ];

    const summaryContent = quotation && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {summaryTiles.map((t) => (
                <div key={t.label} className={`border rounded-lg px-3 py-2 text-center bg-white flex flex-col justify-center ${t.tint || 'border-slate-200'} shadow-sm`}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1 flex items-center justify-center gap-1 truncate">
                        {t.label}
                    </div>
                    <div className="truncate">{t.node}</div>
                </div>
            ))}
        </div>
    );

    // ── Section 3a: Primary workspace column ──
    const itemsTable = quotation && <QuotationItemsTable quotation={quotation} currency={currency} />;

    const tabs = quotation ? [
        { key: 'revisions', label: 'Revisions', icon: GitBranch, count: revisions.length },
        { key: 'timeline', label: 'Timeline', icon: Clock, count: timeline.length },
        notes && { key: 'notes', label: 'Notes', icon: MessageSquare },
    ].filter(Boolean) : [];

    const effectiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key);

    const tabbedContent = quotation && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 flex items-center gap-1 px-2" role="tablist">
                {tabs.map((t) => {
                    const active = t.key === effectiveTab;
                    return (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setActiveTab(t.key)}
                            className={`relative px-3 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-colors ${active ? 'text-[#8A6200]' : 'text-slate-500 hover:text-slate-700'}`}
                        >
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
                {effectiveTab === 'revisions' && (
                    revisions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                            <GitBranch size={20} className="mb-1.5 text-slate-300" />
                            <span className="text-sm">No revisions yet.</span>
                        </div>
                    ) : (
                        <>
                            {/* md+: table */}
                            <div className="hidden md:block overflow-x-auto" aria-label="Revision history">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Revision</th>
                                            <th className="px-4 py-2 text-left">Quotation No.</th>
                                            <th className="px-4 py-2 text-left">Date</th>
                                            <th className="px-4 py-2 text-left">Note</th>
                                            <th className="px-4 py-2 text-left">Status</th>
                                            <th className="px-4 py-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {revisions.map((r) => (
                                            <tr key={r.id ?? r.revisionNumber} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="px-4 py-2.5 font-medium text-blue-600 whitespace-nowrap">Rev {r.revisionNumber}</td>
                                                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.qtnNoDisplay || '—'}</td>
                                                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDisplayDate(r.revisionDate)}</td>
                                                <td className="px-4 py-2.5 text-slate-600 max-w-64 truncate" title={r.followUpNote || ''}>{r.followUpNote || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {r.statusAtTime && <span className={getQuotationStatusBadge(r.statusAtTime).colorClasses}>{getQuotationStatusBadge(r.statusAtTime).label}</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap">
                                                    <CurrencyAmount value={r.totalAmountSnapshot} currency={currency} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* mobile: card list */}
                            <div className="md:hidden p-3 space-y-2" aria-label="Revision history">
                                {revisions.map((r) => (
                                    <div key={r.id ?? r.revisionNumber} className="border border-slate-200 rounded-lg p-3 bg-white">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-medium text-blue-600 text-sm">Rev {r.revisionNumber}</div>
                                                <div className="text-[11px] text-slate-400">{formatDisplayDate(r.revisionDate)}{r.qtnNoDisplay ? ` · ${r.qtnNoDisplay}` : ''}</div>
                                            </div>
                                            <CurrencyAmount value={r.totalAmountSnapshot} currency={currency} className="font-bold text-slate-800 text-sm tabular-nums" />
                                        </div>
                                        {r.followUpNote && <div className="mt-1.5 text-[11px] text-slate-600">{r.followUpNote}</div>}
                                    </div>
                                ))}
                            </div>
                        </>
                    )
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

    const primaryContent = quotation && (
        <>
            {itemsTable}
            {tabbedContent}
        </>
    );

    // ── Section 3b: Right rail ──
    const rightRail = quotation && (
        <>
            <RailCard title="Customer Information" icon={User} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={custName} />
                    <InfoRow label="Code" value={quotation.customerCode} copyable copyLabel="Customer Code" />
                    <InfoRow label="Phone" value={customer?.phone || customer?.mobile || quotation.customerMobile} />
                    <InfoRow label="Email" value={customer?.email || quotation.customerEmail} />
                    <InfoRow label="VAT / TRN" value={customer?.trn} copyable copyLabel="TRN" />
                    <InfoRow label="Billing" value={billingAddress} />
                    <InfoRow label="Shipping" value={shippingAddress} />
                </div>
            </RailCard>

            <RailCard title="Quotation Terms" icon={Building2} collapsible defaultOpen={false}>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Branch" value={quotation.branchName} />
                    <InfoRow label="Valid Till" value={quotation.validTill ? formatDisplayDate(quotation.validTill) : ''} />
                    <InfoRow label="Payment Terms" value={quotation.paymentTerms} />
                    <InfoRow label="Delivery Type" value={quotation.deliveryType} />
                    <InfoRow label="Currency" value={quotation.currency} />
                </div>
            </RailCard>

            {quotation.sourceInquiryNumber && (
                <RailCard title="Related Documents" icon={Link2} collapsible defaultOpen>
                    <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-[10px] text-slate-600 max-w-full" title={`Inquiry: ${quotation.sourceInquiryNumber}`}>
                            <span className="text-slate-400 shrink-0">Inquiry:</span>
                            <span className="font-medium text-slate-700 truncate">{quotation.sourceInquiryNumber}</span>
                        </span>
                    </div>
                </RailCard>
            )}
        </>
    );

    // Mobile-only action bar.
    const mobileActionBar = quotation && (
        <div className="flex items-center gap-2">
            {canPrint && (
                <button onClick={() => onPrint?.(quotation)} disabled={isPrinting} className="flex-1 h-10 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Printer size={14} /> Print
                </button>
            )}
            {canEmail && (
                <button onClick={() => onOpenEmailModal?.(quotation)} className="flex-1 h-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center gap-1.5 text-xs font-bold">
                    <Mail size={14} /> Email
                </button>
            )}
            {canEditQuotation && (
                <button onClick={() => onEdit?.(quotation)} aria-label="Edit" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Edit size={15} />
                </button>
            )}
        </div>
    );

    return (
        <RecordPreviewShell
            loadState={loadState}
            onBack={onBack}
            onRetry={fetchQuotation}
            headerContent={headerContent}
            summaryContent={summaryContent}
            primaryContent={primaryContent}
            rightRail={rightRail}
            mobileActionBar={mobileActionBar}
        />
    );
}
