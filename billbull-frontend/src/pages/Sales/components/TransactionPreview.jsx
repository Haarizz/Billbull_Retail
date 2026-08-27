import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    X, Edit, Printer, Download, Mail, DollarSign, Copy, Clock, History,
    User, MessageSquare, Receipt,
    Building2, Link2, CheckCircle2, AlertCircle, MoreHorizontal, ChevronDown,
} from 'lucide-react';
import RecordPreviewShell from './RecordPreviewShell';
import PaymentHistorySection from './PaymentHistorySection';
import PrintTemplateMenu from './PrintTemplateMenu';
import InvoiceHistoryModal from './InvoiceHistoryModal';
import InvoiceItemsTable from './InvoiceItemsTable';
import { getSalesInvoiceById } from '../../../api/salesInvoiceApi';
import { getInvoicePaymentSummaries } from '../../../api/salesPaymentApi';
import { buildPaymentBlockFromRecords } from '../../Sales/POS/payments/paymentPresentation';
import PaymentDetailsPanel from '../../Sales/POS/payments/PaymentDetailsPanel';
import { useInvoicePaymentHistory } from '../../../hooks/useInvoicePaymentHistory';
import { useInvoiceThermalPrint } from '../../../hooks/useInvoiceThermalPrint';
import { getInvoiceStatusBadge, resolveInvoiceSourceType, getInvoiceTypeBadge } from '../utils/invoiceStatusBadge';
import { getAvailableInvoiceActions } from '../utils/invoiceActionRules';
import { buildInvoiceTimeline } from '../utils/buildInvoiceTimeline';
import { resolveCustomer, resolveDefaultShippingAddress } from '../../../utils/customerResolution';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { copyToClipboard } from '../../../utils/clipboard';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';
import { useCompany } from '../../../context/CompanyContext';
import useShortcuts from '../../../hooks/useShortcuts';

const isTypingTarget = (el) => Boolean(el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable));

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

function MenuItem({ onClick, icon: Icon, children, disabled, danger }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            disabled={disabled}
            className={`w-full px-3 py-2 flex items-center gap-2 text-xs font-medium text-left disabled:opacity-40 ${danger ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-700 hover:bg-slate-50'}`}
        >
            {Icon && <Icon size={13} className={danger ? 'text-emerald-500' : 'text-slate-400'} />} {children}
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

// Compact label/value row for the right-rail info panels. Long values wrap and
// carry a native tooltip so nothing is truncated beyond reach.
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

// Card wrapper for the right-rail info panels. On mobile (below xl, where the rail
// stacks under the workspace) the card collapses to an accordion so the info
// panels don't push the page down; on desktop it's always open.
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
            {/* Always open at xl+ regardless of accordion state below xl */}
            <div className={`px-4 py-2.5 ${collapsible && !open ? 'hidden xl:block' : ''}`}>{children}</div>
        </section>
    );
}

export default function TransactionPreview({
    invoiceId,
    customersList = [],
    invoiceCurrency,
    onBack,
    onEdit,
    onPrint,
    onDownload,
    onOpenEmailModal,
    onRecordPayment,
    onPrintVoucher,
    isPrinting = false,
}) {
    const [invoice, setInvoice] = useState(null);
    const [loadState, setLoadState] = useState('loading');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('payments');
    const { canEdit } = usePermission('SALES');
    const { company } = useCompany();

    const fetchInvoice = useCallback(async () => {
        if (!invoiceId) return;
        setLoadState('loading');
        try {
            const data = await getSalesInvoiceById(invoiceId);
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

    // Initial fetch-by-id on mount/invoiceId-change — setState inside is
    // intentional (drives the loading/ready/error state machine for this fetch).
    // Reset the active tab so switching invoices doesn't leave a stale tab open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchInvoice(); setActiveTab('payments'); }, [fetchInvoice]);

    // How this sale was actually paid, reconstructed from its recorded tender rows. The
    // invoice's own paymentMode text is only a label — it cannot say how much went on each
    // tender, and older sales may just say "Mixed". Loaded here rather than passed down so
    // the preview stays self-contained.
    const [paymentBlock, setPaymentBlock] = useState(null);
    const invoiceNumber = invoice?.invoiceNumber;
    const invoiceTotalForPayments = Number(invoice?.invoiceTotal) || 0;

    useEffect(() => {
        if (!invoiceNumber) return undefined;
        let cancelled = false;
        getInvoicePaymentSummaries([invoiceNumber]).then(summaries => {
            if (cancelled) return;
            const summary = summaries[invoiceNumber];
            setPaymentBlock(summary
                ? buildPaymentBlockFromRecords(summary.allocations, { invoiceTotal: invoiceTotalForPayments })
                : null);
        });
        return () => { cancelled = true; };
    }, [invoiceNumber, invoiceTotalForPayments]);

    const { payments, loading: paymentsLoading, error: paymentsError, refetch: refetchPayments } = useInvoicePaymentHistory(invoice);

    const timeline = useMemo(() => buildInvoiceTimeline(invoice, payments), [invoice, payments]);

    const customer = useMemo(
        () => (invoice ? resolveCustomer({ customerCode: invoice.customerCode, customerName: invoice.customerName }, customersList) : null),
        [invoice, customersList]
    );

    const { printThermal, thermalDisabledReason } = useInvoiceThermalPrint({
        branchId: invoice?.branchId,
        company,
    });

    const actions = useMemo(() => getAvailableInvoiceActions(invoice?.status), [invoice?.status]);
    const canEditInvoice = canEdit && actions.edit;
    const canPrint = actions.print;
    // Print/PDF/Email aren't split out as separate RBAC actions in this system —
    // reaching this page already required view on `sales`, so they ride on the
    // status rules alone. Edit and Record Payment mutate, so they need canEdit.
    const canEmail = actions.email;
    const canPdf = actions.pdf;
    const canRecordPayment = canEdit && actions.recordPayment;

    useShortcuts({
        e: () => { if (!isTypingTarget(document.activeElement) && canEditInvoice) onEdit?.(invoice); },
        p: () => { if (!isTypingTarget(document.activeElement) && canPrint) onPrint?.(invoice); },
        escape: () => onBack?.(),
    });

    if (!invoiceId) return null;

    const statusBadge = invoice ? getInvoiceStatusBadge(invoice.status, invoice) : null;
    const typeBadge = invoice ? getInvoiceTypeBadge(invoice) : null;
    const sourceType = invoice ? resolveInvoiceSourceType(invoice) : null;
    const balanceDue = invoice ? Number(invoice.balance ?? Math.max(0, (invoice.invoiceTotal || 0) - (invoice.amountPaid || 0))) : 0;
    const isSettled = balanceDue <= 0;
    const currency = invoiceCurrency;

    const items = (invoice?.items) || [];
    const itemCount = items.length;
    const totalQty = items.reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0);
    const discountTotal = Number(invoice?.billDiscountAmount ?? 0);
    const taxTotal = Number(invoice?.taxTotal ?? invoice?.totalTax ?? invoice?.taxAmount ?? 0);

    const relatedDocs = invoice ? [
        invoice.linkedQuotation && { label: 'Quotation', ref: invoice.linkedQuotation },
        invoice.linkedSalesOrder && { label: 'Sales Order', ref: invoice.linkedSalesOrder },
        invoice.linkedDeliveryNote && { label: 'Delivery Note', ref: invoice.linkedDeliveryNote },
        invoice.linkedProforma && { label: 'Proforma Invoice', ref: invoice.linkedProforma },
        invoice.linkedCreditNote && { label: 'Credit Note', ref: invoice.linkedCreditNote },
        invoice.linkedSalesReturn && { label: 'Return', ref: invoice.linkedSalesReturn },
    ].filter(Boolean) : [];

    const notes = invoice?.customerNotes || invoice?.notes || '';
    const shippingAddress = invoice?.shippingAddress || (customer ? resolveDefaultShippingAddress(customer) : '');

    // ── Section 1: Transaction header — identity + the single action toolbar ──
    // Toolbar responsiveness:
    //  • ≥xl: all actions inline.
    //  • md–xl: Print + PDF stay inline; the rest collapse into a "More" menu so
    //    buttons never overflow the header container (they wrap to a 2nd row first).
    //  • <md: no toolbar here — the sticky mobile action bar (below) owns actions.
    const secondaryActions = (
        <>
            {canEmail && <MenuItem onClick={() => onOpenEmailModal?.(invoice)} icon={Mail}>Email</MenuItem>}
            {canEditInvoice && <MenuItem onClick={() => onEdit?.(invoice)} icon={Edit}>Edit</MenuItem>}
            {canRecordPayment && <MenuItem onClick={() => onRecordPayment?.(invoice)} icon={DollarSign} danger>Record Payment</MenuItem>}
            <MenuItem onClick={() => setHistoryOpen(true)} icon={History}>History</MenuItem>
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
                        {typeBadge && <span className={`${typeBadge.colorClasses} px-2 py-0.5 rounded-full text-[10px] font-bold`}>{typeBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700 min-w-0 max-w-full">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={invoice.customerName}>{invoice.customerName}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={11} className="text-slate-400" /> {formatDisplayDate(invoice.invoiceDate)}</span>
                        {invoice.dueDate && <><span className="text-slate-300">•</span><span className="whitespace-nowrap">Due {formatDisplayDate(invoice.dueDate)}</span></>}
                        {invoice.branch && <><span className="text-slate-300">•</span><span className="truncate max-w-55" title={invoice.branch}>{invoice.branch}</span></>}
                        {invoice.salesperson && <><span className="text-slate-300">•</span><span className="truncate max-w-45" title={invoice.salesperson}>{invoice.salesperson}</span></>}
                        {(paymentBlock?.summaryLabel || invoice.paymentMode) && <><span className="text-slate-300">•</span><span className="border border-slate-200 px-1.5 py-0.5 rounded text-[10px] bg-slate-50 text-slate-600 whitespace-nowrap">{paymentBlock?.summaryLabel || invoice.paymentMode}</span></>}
                    </div>
                </div>

                {/* The one and only action toolbar (md+; mobile uses the sticky bar) */}
                <div className="hidden md:flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
                    {canPrint && (
                        <PrintTemplateMenu
                            invoice={invoice}
                            disabled={isPrinting || !canPrint}
                            onPrintPaper={(inv, template) => onPrint?.(inv, template)}
                            onPrintThermal={(inv, size) => printThermal(inv, size)}
                            thermalDisabledReason={thermalDisabledReason}
                        />
                    )}
                    {canPrint && (
                        <button onClick={() => onPrint?.(invoice)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                            <Printer size={13} /> Print
                        </button>
                    )}
                    {canPdf && (
                        <button onClick={() => onDownload?.(invoice)} disabled={isPrinting} title="Download PDF" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50">
                            <Download size={13} /> PDF
                        </button>
                    )}

                    {/* xl+: remaining actions inline */}
                    <div className="hidden xl:flex items-center gap-2">
                        {canEmail && (
                            <button onClick={() => onOpenEmailModal?.(invoice)} title="Email invoice" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                                <Mail size={13} /> Email
                            </button>
                        )}
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
                        <button onClick={() => setHistoryOpen(true)} title="View history" className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                            <History size={13} /> History
                        </button>
                    </div>

                    {/* md–xl: secondary actions collapse into "More" */}
                    <div className="xl:hidden">
                        <OverflowMenu>{secondaryActions}</OverflowMenu>
                    </div>

                    <button onClick={onBack} aria-label="Close preview" className="group h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors">
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );

    // ── Section 2: Executive summary strip — every total, exactly once ──
    // Reflows 2 → 3 → 4 → 7 across mobile/tablet/laptop/desktop; equal-height cells
    // via the grid; big values use tabular-nums + truncation so alignment holds.
    const summaryTiles = [
        { label: 'Net Total', node: <CurrencyAmount value={invoice?.invoiceTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
        { label: 'Paid Amount', node: <CurrencyAmount value={invoice?.amountPaid} currency={currency} className="text-sm font-bold text-emerald-600 tabular-nums" /> },
        {
            label: 'Balance Due',
            node: <CurrencyAmount value={balanceDue} currency={currency} className={`text-sm font-bold tabular-nums ${isSettled ? 'text-emerald-600' : 'text-red-500'}`} />,
            icon: isSettled ? CheckCircle2 : AlertCircle,
            iconCls: isSettled ? 'text-emerald-400' : 'text-red-400',
            tint: isSettled ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100',
        },
        { label: 'Items', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{itemCount}</span> },
        { label: 'Total Qty', node: <span className="text-sm font-bold text-slate-800 tabular-nums">{totalQty}</span> },
        { label: 'Discount', node: <CurrencyAmount value={discountTotal} currency={currency} className="text-sm font-bold text-red-500 tabular-nums" /> },
        { label: 'Tax', node: <CurrencyAmount value={taxTotal} currency={currency} className="text-sm font-bold text-slate-800 tabular-nums" /> },
    ];

    const summaryContent = invoice && (
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

    // ── Section 3a: Primary workspace column — items (responsive table/cards) + tabs ──
    const itemsTable = invoice && <InvoiceItemsTable invoice={invoice} currency={currency} />;

    // Tabs — only surface tabs that have content; hide empty Notes/Attachments.
    const tabs = invoice ? [
        { key: 'payments', label: 'Payments', icon: Receipt, count: payments.length },
        { key: 'timeline', label: 'Timeline', icon: Clock, count: timeline.length },
        notes && { key: 'notes', label: 'Notes', icon: MessageSquare },
    ].filter(Boolean) : [];

    // If the active tab became unavailable (e.g. switched to an invoice with no
    // notes), fall back to the first tab.
    const effectiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key);

    const tabbedContent = invoice && (
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
                {effectiveTab === 'payments' && (
                    <>
                    {/* The tender breakdown exactly as the receipt printed it — same rows,
                        same order, same labels, from the shared presentation layer. */}
                    {paymentBlock && (
                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                            <PaymentDetailsPanel block={paymentBlock} storedMode={invoice.paymentMode} />
                        </div>
                    )}
                    <PaymentHistorySection
                        payments={payments}
                        loading={paymentsLoading}
                        error={paymentsError}
                        onRetry={refetchPayments}
                        currency={currency}
                        invoiceNumber={invoice.invoiceNumber}
                        customerPhone={customer?.mobile || customer?.phone}
                        onPrintVoucher={(receipt) => onPrintVoucher?.(receipt, invoice)}
                        onDownloadPdf={() => onDownload?.(invoice)}
                        onEmailVoucher={() => onOpenEmailModal?.(invoice)}
                    />
                    </>
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

    const primaryContent = invoice && (
        <>
            {itemsTable}
            {tabbedContent}
        </>
    );

    // ── Section 3b: Right rail — customer, branch, related documents ──
    // At xl+ the rail sits beside the workspace (always-open cards); below xl it
    // stacks under the workspace and the cards become accordions.
    const rightRail = invoice && (
        <>
            <RailCard title="Customer Information" icon={User} collapsible defaultOpen>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Name" value={invoice.customerName} />
                    <InfoRow label="Code" value={invoice.customerCode} copyable copyLabel="Customer Code" />
                    <InfoRow label="Phone" value={customer?.phone || customer?.mobile} />
                    <InfoRow label="Email" value={customer?.email} />
                    <InfoRow label="VAT / TRN" value={customer?.trn} copyable copyLabel="TRN" />
                    <InfoRow label="Shipping" value={shippingAddress} />
                </div>
            </RailCard>

            <RailCard title="Branch & Terms" icon={Building2} collapsible defaultOpen={false}>
                <div className="divide-y divide-slate-50">
                    <InfoRow label="Branch" value={invoice.branch} />
                    <InfoRow label="Salesperson" value={invoice.salesperson} />
                    <InfoRow label="Payment Terms" value={invoice.paymentTerms} />
                    <InfoRow label="Reference" value={invoice.reference} copyable copyLabel="Reference" />
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

    // Mobile-only action bar (the desktop toolbar lives in the header band).
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
            {canPdf && (
                <button onClick={() => onDownload?.(invoice)} disabled={isPrinting} aria-label="Download PDF" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center disabled:opacity-50">
                    <Download size={15} />
                </button>
            )}
            {canEmail && (
                <button onClick={() => onOpenEmailModal?.(invoice)} aria-label="Email" className="h-10 w-10 border border-slate-300 rounded-md bg-white text-slate-700 flex items-center justify-center">
                    <Mail size={15} />
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
        <>
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
            {historyOpen && invoice && (
                <InvoiceHistoryModal
                    invoiceId={invoice.id}
                    invoiceNumber={invoice.invoiceNumber}
                    onClose={() => setHistoryOpen(false)}
                />
            )}
        </>
    );
}
