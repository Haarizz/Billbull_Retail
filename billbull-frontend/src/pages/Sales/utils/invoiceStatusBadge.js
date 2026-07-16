// Pure (non-JSX) status/source-type/type-badge resolvers shared between the
// Sales Invoice list and the Transaction Preview page, so both surfaces can
// never visually drift apart. Mirrors the classNames previously inlined as
// renderListStatus/resolveSourceType/renderTypeBadge in SalesInvoice.jsx.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

// Returns { label, colorClasses } — colorClasses already includes BADGE_BASE.
export function getInvoiceStatusBadge(statusVal, inv = null) {
    const s = String(statusVal || '').toUpperCase();

    // Overdue is computed, not a stored status: confirmed/partially-paid with
    // an outstanding balance past its due date.
    if (inv && (s === 'CONFIRMED' || s === 'PARTIALLY_PAID') && inv.dueDate && (inv.balance ?? 0) > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(inv.dueDate) < today) {
            return { label: 'Overdue', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        }
    }

    switch (s) {
        case 'PAID':
            return { label: 'Paid', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'OVERDUE':
            return { label: 'Overdue', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        case 'PARTIALLY_PAID':
            return { label: 'Partially Paid', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        case 'CONFIRMED':
            return { label: 'Confirmed', colorClasses: `bg-blue-100 text-blue-700 ${BADGE_BASE}` };
        case 'COMPLETED':
            return { label: 'Completed', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'POSTED':
            return { label: 'Posted', colorClasses: `bg-purple-100 text-purple-700 ${BADGE_BASE}` };
        case 'CANCELLED':
            return { label: 'Cancelled', colorClasses: `bg-slate-200 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: statusVal || 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Returns { label, ref, color } — color is a border+bg+text class string for
// an outlined pill (distinct visual language from the solid status badge).
export function resolveInvoiceSourceType(inv) {
    if (!inv) return { label: 'Direct Sale', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (inv.linkedDeliveryNote) return { label: 'Against DN', ref: inv.linkedDeliveryNote, color: 'bg-green-100 text-green-700 border-green-200' };
    if (inv.linkedSalesOrder) return { label: 'Against SO', ref: inv.linkedSalesOrder, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (inv.linkedProforma) return { label: 'Against PI', ref: inv.linkedProforma, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    return { label: 'Direct Sale', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
}

// Returns null or { label, colorClasses } for the "Fast Sale" pill.
export function getInvoiceTypeBadge(inv) {
    if (!inv?.fastSale) return null;
    return { label: 'Fast Sale', colorClasses: 'bg-red-50 text-red-600 border border-red-200' };
}
