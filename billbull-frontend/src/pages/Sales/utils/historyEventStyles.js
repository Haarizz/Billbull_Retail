import { FileText, Pencil, CheckCircle2, XCircle, DollarSign, Printer, Link2, Clock } from 'lucide-react';

// Icon + colour per history event type. Colours track invoiceStatusBadge.js so a
// CONFIRMED event and a Confirmed status pill read as the same thing.
const STYLES = {
    CREATED: { icon: FileText, bg: 'bg-blue-100', fg: 'text-blue-600' },
    UPDATED: { icon: Pencil, bg: 'bg-amber-100', fg: 'text-amber-600' },
    STATUS_CHANGED: { icon: Clock, bg: 'bg-slate-100', fg: 'text-slate-600' },
    CONFIRMED: { icon: CheckCircle2, bg: 'bg-blue-100', fg: 'text-blue-600' },
    CANCELLED: { icon: XCircle, bg: 'bg-red-100', fg: 'text-red-600' },
    PAYMENT_RECEIVED: { icon: DollarSign, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
    PRINTED: { icon: Printer, bg: 'bg-purple-100', fg: 'text-purple-600' },
    LINKED_DOCUMENT: { icon: Link2, bg: 'bg-indigo-100', fg: 'text-indigo-600' },
};

const FALLBACK = { icon: Clock, bg: 'bg-slate-100', fg: 'text-slate-500' };

export const getHistoryEventStyle = (eventType) => STYLES[String(eventType || '').toUpperCase()] || FALLBACK;

// Colour for the linked-document chip, by document type.
const CHIP = {
    QUOTATION: 'bg-amber-50 text-amber-700 border-amber-200',
    PROFORMA: 'bg-purple-50 text-purple-700 border-purple-200',
    SALES_ORDER: 'bg-blue-50 text-blue-700 border-blue-200',
    DELIVERY_NOTE: 'bg-green-50 text-green-700 border-green-200',
    RECEIPT_VOUCHER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const getHistoryChipStyle = (documentType) =>
    CHIP[String(documentType || '').toUpperCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
