import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    X, Edit, Printer, Download, Mail, DollarSign, Copy, Clock, History,
    User, Package, MessageSquare, Paperclip, Link2, ChevronDown, ChevronUp, Box,
    Wallet, CheckCircle2, AlertCircle
} from 'lucide-react';
import RecordPreviewShell from './RecordPreviewShell';
import PaymentHistorySection from './PaymentHistorySection';
import PrintTemplateMenu from './PrintTemplateMenu';
import InvoiceHistoryModal from './InvoiceHistoryModal';
import TaxInvoiceLayout from './TaxInvoiceLayout';
import { getSalesInvoiceById } from '../../../api/salesInvoiceApi';
import { useInvoicePaymentHistory } from '../../../hooks/useInvoicePaymentHistory';
import { useInvoiceThermalPrint } from '../../../hooks/useInvoiceThermalPrint';
import { getInvoiceStatusBadge, resolveInvoiceSourceType, getInvoiceTypeBadge } from '../utils/invoiceStatusBadge';
import { getAvailableInvoiceActions } from '../utils/invoiceActionRules';
import { buildInvoiceTimeline } from '../utils/buildInvoiceTimeline';
import { resolveCustomer } from '../../../utils/customerResolution';
import { getImageUrl } from '../../../utils/urlUtils';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { copyToClipboard } from '../../../utils/clipboard';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { usePermission } from '../../../hooks/usePermission';
import { useCompany } from '../../../context/CompanyContext';
import useShortcuts from '../../../hooks/useShortcuts';

const isTypingTarget = (el) => Boolean(el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable));

const relativeAge = (dateStr) => {
    if (!dateStr) return null;
    const then = new Date(dateStr).getTime();
    if (Number.isNaN(then)) return null;
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
};

function CopyField({ label, value }) {
    if (!value) return null;
    return (
        <button
            type="button"
            onClick={() => copyToClipboard(value, label)}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-[#D99A00] transition-colors"
            title={`Copy ${label}`}
        >
            <span>{value}</span>
            <Copy size={11} />
        </button>
    );
}

function CollapsibleSection({ id, title, icon: Icon, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((v) => !v)}
                className="w-full px-4 md:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors"
            >
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Icon size={15} className="text-[#D99A00]" /> {title}
                </h2>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400">
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
            </button>
            {open && <div id={id}>{children}</div>}
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

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
    const currency = invoiceCurrency;

    const relatedDocs = invoice ? [
        invoice.linkedQuotation && { label: 'Quotation', ref: invoice.linkedQuotation },
        invoice.linkedSalesOrder && { label: 'Sales Order', ref: invoice.linkedSalesOrder },
        invoice.linkedDeliveryNote && { label: 'Delivery Note', ref: invoice.linkedDeliveryNote },
        invoice.linkedProforma && { label: 'Proforma Invoice', ref: invoice.linkedProforma },
    ].filter(Boolean) : [];

    const headerContent = invoice && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-6 py-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Invoice Preview</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {statusBadge && <span className={statusBadge.colorClasses}>{statusBadge.label}</span>}
                        {typeBadge && <span className={`${typeBadge.colorClasses} px-2 py-0.5 rounded-full text-[10px] font-bold`}>{typeBadge.label}</span>}
                        {sourceType && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceType.color}`}>{sourceType.label}</span>}
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <CopyField label="Invoice Number" value={invoice.invoiceNumber} />
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><User size={12} className="text-slate-400" /> {invoice.customerName}</span>
                        <span className="text-slate-300">•</span>
                        <span>{formatDisplayDate(invoice.invoiceDate)}</span>
                        {invoice.branch && <><span className="text-slate-300">•</span><span>Branch: {invoice.branch}</span></>}
                        {invoice.salesperson && <><span className="text-slate-300">•</span><span>Sales: {invoice.salesperson}</span></>}
                        {invoice.createdAt && (
                            <span className="flex items-center gap-1 text-slate-400"><Clock size={11} /> Created {relativeAge(invoice.createdAt)}</span>
                        )}
                    </div>
                </div>

                <button onClick={onBack} aria-label="Close preview" className="group shrink-0 h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors">
                    <X size={16} className="transition-transform group-hover:scale-110" />
                </button>
            </div>
        </div>
    );

    const summaryContent = invoice && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5 space-y-4 shadow-sm">
            <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-bold mb-2">Totals & Payment</div>
                <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1.5"><Wallet size={13} className="text-slate-400" /> Net Amount</span>
                        <CurrencyAmount value={invoice.invoiceTotal} currency={currency} className="font-bold text-slate-800" />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-400" /> Paid Amount</span>
                        <CurrencyAmount value={invoice.amountPaid} currency={currency} className="font-medium text-emerald-600" />
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                        <span className="text-slate-600 font-medium flex items-center gap-1.5">
                            {balanceDue > 0 ? <AlertCircle size={13} className="text-red-400" /> : <CheckCircle2 size={13} className="text-emerald-400" />}
                            Balance Due
                        </span>
                        <CurrencyAmount value={balanceDue} currency={currency} className={`font-bold ${balanceDue > 0 ? 'text-red-500' : 'text-emerald-600'}`} />
                    </div>
                </div>
            </div>

            {invoice.dueDate && (
                <div className="text-xs text-slate-500 flex justify-between">
                    <span>Due Date</span><span className="font-medium text-slate-700">{formatDisplayDate(invoice.dueDate)}</span>
                </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-100">
                {canEditInvoice && (
                    <button onClick={() => onEdit?.(invoice)} className="w-full h-9 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors shadow-sm">
                        <Edit size={13} /> Edit Invoice
                    </button>
                )}
                {canRecordPayment && (
                    <button onClick={() => onRecordPayment?.(invoice)} className="w-full h-9 border border-emerald-300 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors">
                        <DollarSign size={13} /> Record Payment
                    </button>
                )}
                <div className="grid grid-cols-4 gap-2">
                    {canPrint && (
                        <button onClick={() => onPrint?.(invoice)} disabled={isPrinting} title="Print" className="group h-14 border border-slate-200 rounded-lg bg-white hover:bg-[#FFF8E7] hover:border-[#F5C742] text-slate-600 hover:text-[#8A6200] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold disabled:opacity-50 transition-all hover:shadow-sm active:scale-[0.97]">
                            <Printer size={15} className="text-slate-400 group-hover:text-[#D99A00] transition-colors" /> Print
                        </button>
                    )}
                    {canPdf && (
                        <button onClick={() => onDownload?.(invoice)} disabled={isPrinting} title="PDF" className="group h-14 border border-slate-200 rounded-lg bg-white hover:bg-[#FFF8E7] hover:border-[#F5C742] text-slate-600 hover:text-[#8A6200] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold disabled:opacity-50 transition-all hover:shadow-sm active:scale-[0.97]">
                            <Download size={15} className="text-slate-400 group-hover:text-[#D99A00] transition-colors" /> PDF
                        </button>
                    )}
                    {canEmail && (
                        <button onClick={() => onOpenEmailModal?.(invoice)} title="Email" className="group h-14 border border-slate-200 rounded-lg bg-white hover:bg-[#FFF8E7] hover:border-[#F5C742] text-slate-600 hover:text-[#8A6200] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all hover:shadow-sm active:scale-[0.97]">
                            <Mail size={15} className="text-slate-400 group-hover:text-[#D99A00] transition-colors" /> Email
                        </button>
                    )}
                    <button onClick={() => setHistoryOpen(true)} title="History" className="group h-14 border border-slate-200 rounded-lg bg-white hover:bg-[#FFF8E7] hover:border-[#F5C742] text-slate-600 hover:text-[#8A6200] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all hover:shadow-sm active:scale-[0.97]">
                        <History size={15} className="text-slate-400 group-hover:text-[#D99A00] transition-colors" /> History
                    </button>
                </div>
            </div>
        </div>
    );

    // Action row above the printed document — mirrors the reference layout's
    // History / Edit / PDF / Email / Print cluster next to the template picker.
    const documentActionsBar = invoice && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 md:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <PrintTemplateMenu
                invoice={invoice}
                disabled={isPrinting || !canPrint}
                onPrintPaper={(inv, template) => onPrint?.(inv, template)}
                onPrintThermal={(inv, size) => printThermal(inv, size)}
                thermalDisabledReason={thermalDisabledReason}
            />
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setHistoryOpen(true)} className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                    <History size={13} /> History
                </button>
                {canEditInvoice && (
                    <button onClick={() => onEdit?.(invoice)} className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                        <Edit size={13} /> Edit
                    </button>
                )}
                {canPdf && (
                    <button onClick={() => onDownload?.(invoice)} disabled={isPrinting} className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50">
                        <Download size={13} /> PDF
                    </button>
                )}
                {canEmail && (
                    <button onClick={() => onOpenEmailModal?.(invoice)} className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium">
                        <Mail size={13} /> Email
                    </button>
                )}
                {canPrint && (
                    <button onClick={() => onPrint?.(invoice)} disabled={isPrinting} className="h-8 px-3 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                        <Printer size={13} /> Print
                    </button>
                )}
            </div>
        </div>
    );

    // Section order follows the reference layout: payments and the document itself
    // lead (what people open a preview to see), reference/audit detail follows.
    const SECTION_ORDER = ['payments', 'document-actions', 'tax-invoice', 'customer', 'items', 'related', 'timeline', 'attachments', 'notes'];

    const sectionBlocks = invoice ? [
        {
            key: 'customer',
            content: (
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 md:px-5 py-3.5 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User size={15} className="text-[#D99A00]" /> Customer & Invoice Details</h2>
                    </div>
                    <div className="p-4 md:p-5 grid sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">Customer</div>
                            <div className="font-medium text-slate-800">{invoice.customerName}</div>
                            {invoice.customerCode && <div className="text-slate-500 mt-0.5"><CopyField label="Customer Code" value={invoice.customerCode} /></div>}
                        </div>
                        <div className="bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">TRN / VAT No.</div>
                            <div className="text-slate-700"><CopyField label="TRN" value={customer?.trn} /> {!customer?.trn && '—'}</div>
                        </div>
                        <div className="bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">Phone</div>
                            <div className="text-slate-700">{customer?.phone || '—'}</div>
                        </div>
                        <div className="bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">Email</div>
                            <div className="text-slate-700">{customer?.email || '—'}</div>
                        </div>
                        <div className="bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">Reference No.</div>
                            <div className="text-slate-700">{invoice.reference ? <CopyField label="Reference" value={invoice.reference} /> : '—'}</div>
                        </div>
                        <div className="bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">Payment Terms</div>
                            <div className="text-slate-700">{invoice.paymentTerms || '—'}</div>
                        </div>
                        <div className="sm:col-span-2 bg-slate-50/60 rounded-lg px-3 py-2">
                            <div className="text-slate-400 mb-0.5">Shipping Address</div>
                            <div className="text-slate-700">{invoice.shippingAddress || '—'}</div>
                        </div>
                    </div>
                </section>
            ),
        },
        {
            key: 'items',
            content: (
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 md:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Package size={15} className="text-[#D99A00]" /> Items</h2>
                        <span className="text-[11px] text-slate-400">{(invoice.items || []).length} items · {(invoice.items || []).reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0)} qty</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                                <tr>
                                    <th className="px-4 py-2 text-left">#</th>
                                    <th className="px-3 py-2 text-left"></th>
                                    <th className="px-2 py-2 text-left">Product</th>
                                    <th className="px-4 py-2 text-left">Unit</th>
                                    <th className="px-4 py-2 text-right">Qty</th>
                                    <th className="px-4 py-2 text-right">Rate</th>
                                    <th className="px-4 py-2 text-right">Disc</th>
                                    <th className="px-4 py-2 text-right">Tax</th>
                                    <th className="px-4 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(invoice.items || []).map((it, idx) => (
                                    <tr key={it.id || idx} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="w-9 h-9 rounded-lg border border-slate-200 bg-[#F8F9FA] shrink-0 overflow-hidden flex items-center justify-center">
                                                {it.image ? (
                                                    <img
                                                        src={getImageUrl(it.image)}
                                                        alt={it.itemName || it.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Box size={16} className="text-slate-300" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <div className="font-medium text-slate-700">{it.itemName || it.name}</div>
                                            <div className="text-[10px] text-slate-400">{it.itemCode || it.code}{it.barcode ? ` · ${it.barcode}` : ''}</div>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-500">{it.unit || 'PCS'}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-700">{it.quantity ?? it.qty ?? 0}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-700"><CurrencyAmount value={it.price} currency={currency} /></td>
                                        <td className="px-4 py-2.5 text-right text-slate-500">{Number(it.discount ?? it.disc ?? 0)}%</td>
                                        <td className="px-4 py-2.5 text-right text-slate-500">{Number(it.taxRate ?? it.tax ?? 0)}%</td>
                                        <td className="px-4 py-2.5 text-right font-medium text-slate-800"><CurrencyAmount value={it.netAmount ?? it.net} currency={currency} /></td>
                                    </tr>
                                ))}
                                {(!invoice.items || invoice.items.length === 0) && (
                                    <tr><td colSpan={9} className="text-center py-8 text-slate-400">No items on this invoice.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 md:px-5 py-4 border-t border-slate-100 bg-slate-50/40 flex justify-end">
                        <div className="w-full sm:w-72 space-y-1.5 text-xs">
                            <div className="flex justify-between text-slate-500"><span>Subtotal</span><CurrencyAmount value={invoice.subTotal ?? invoice.grossTotal} currency={currency} /></div>
                            <div className="flex justify-between text-slate-500"><span>Discount</span><CurrencyAmount value={invoice.billDiscountAmount} currency={currency} className="text-red-500" /></div>
                            <div className="flex justify-between text-slate-500"><span>Tax (VAT)</span><CurrencyAmount value={invoice.taxTotal ?? invoice.totalTax ?? invoice.taxAmount} currency={currency} /></div>
                            {Number(invoice.deliveryCharge) > 0 && <div className="flex justify-between text-slate-500"><span>Delivery Charges</span><CurrencyAmount value={invoice.deliveryCharge} currency={currency} /></div>}
                            {Number(invoice.roundOff) !== 0 && <div className="flex justify-between text-slate-500"><span>Round Off</span><CurrencyAmount value={invoice.roundOff} currency={currency} /></div>}
                            <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-800 text-sm"><span>Net Total</span><CurrencyAmount value={invoice.invoiceTotal} currency={currency} /></div>
                        </div>
                    </div>
                </section>
            ),
        },
        {
            key: 'payments',
            content: (
                <PaymentHistorySection
                    payments={payments}
                    loading={paymentsLoading}
                    error={paymentsError}
                    onRetry={refetchPayments}
                    currency={currency}
                    invoiceTotal={invoice.invoiceTotal}
                    totalPaid={invoice.amountPaid}
                    balanceDue={balanceDue}
                    invoiceNumber={invoice.invoiceNumber}
                    customerPhone={customer?.mobile || customer?.phone}
                    onPrintVoucher={(receipt) => onPrintVoucher?.(receipt, invoice)}
                    onDownloadPdf={() => onDownload?.(invoice)}
                    onEmailVoucher={() => onOpenEmailModal?.(invoice)}
                />
            ),
        },
        {
            key: 'document-actions',
            content: documentActionsBar,
        },
        {
            key: 'tax-invoice',
            content: (
                <TaxInvoiceLayout
                    invoice={invoice}
                    customer={customer}
                    currency={currency}
                    companyName={company?.companyName || company?.name}
                />
            ),
        },
        {
            key: 'related',
            content: (
                <CollapsibleSection id="related-documents" title="Related Documents" icon={Link2} defaultOpen={relatedDocs.length > 0}>
                    <div className="p-4 md:p-5">
                        {relatedDocs.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 text-sm">No related documents.</div>
                        ) : (
                            <div className="grid sm:grid-cols-2 gap-3">
                                {relatedDocs.map((d) => (
                                    <div key={d.label} className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md text-xs">
                                        <span className="text-slate-500">{d.label}</span>
                                        <span className="font-medium text-slate-800">{d.ref}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CollapsibleSection>
            ),
        },
        {
            key: 'timeline',
            content: (
                <CollapsibleSection id="invoice-timeline" title="Timeline" icon={Clock} defaultOpen={false}>
                    <div className="p-4 md:p-5">
                        <p className="text-[10px] text-slate-400 mb-3">Timeline reflects available record data.</p>
                        {timeline.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 text-sm">Timeline unavailable.</div>
                        ) : (
                            <ol className="space-y-3">
                                {timeline.map((ev) => (
                                    <li key={ev.key} className="flex items-start gap-3 text-xs">
                                        <span className="mt-1 w-2 h-2 rounded-full bg-[#F5C742] shrink-0" />
                                        <div>
                                            <div className="font-medium text-slate-700">{ev.label}{ev.amount != null ? <> — <CurrencyAmount value={ev.amount} currency={currency} className="inline" /></> : null}</div>
                                            <div className="text-slate-400">{formatDisplayDate(ev.date)}{ev.by ? ` · ${ev.by}` : ''}</div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </CollapsibleSection>
            ),
        },
        {
            key: 'attachments',
            content: (
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 md:px-5 py-3.5 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Paperclip size={15} className="text-[#D99A00]" /> Attachments</h2>
                    </div>
                    <div className="text-center py-8 text-slate-400 text-sm px-4">
                        Attachments are not yet available for Sales Invoices.
                    </div>
                </section>
            ),
        },
        {
            key: 'notes',
            content: (
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 md:px-5 py-3.5 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><MessageSquare size={15} className="text-[#D99A00]" /> Notes</h2>
                    </div>
                    <div className="p-4 md:p-5 text-xs text-slate-700 whitespace-pre-wrap">
                        {invoice.customerNotes || invoice.notes || <span className="text-slate-400">No internal notes.</span>}
                    </div>
                </section>
            ),
        },
    ] : [];

    const mainSections = SECTION_ORDER
        .map((key) => sectionBlocks.find((s) => s.key === key))
        .filter(Boolean);

    return (
        <>
            <RecordPreviewShell
                loadState={loadState}
                onBack={onBack}
                onRetry={fetchInvoice}
                headerContent={headerContent}
                summaryContent={summaryContent}
                mainSections={mainSections}
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
