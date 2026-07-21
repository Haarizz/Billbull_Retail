// Pure (non-JSX) status/source-type resolvers shared between the Sales Order
// list and the Sales Order Transaction Preview page, so both surfaces can never
// visually drift apart. Mirrors the pattern established for Sales Invoices in
// invoiceStatusBadge.js.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

// Returns { label, colorClasses } — colorClasses already includes BADGE_BASE.
export function getSalesOrderStatusBadge(statusVal) {
    const s = String(statusVal || '').toUpperCase();

    switch (s) {
        case 'CONFIRMED':
            return { label: 'Confirmed', colorClasses: `bg-blue-100 text-blue-700 ${BADGE_BASE}` };
        case 'PARTIALLY_PAID':
        case 'PARTIALLY PAID':
            return { label: 'Partially Paid', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        case 'PAID':
        case 'FULLY_PAID':
            return { label: 'Paid', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'INVOICED':
            return { label: 'Invoiced', colorClasses: `bg-purple-100 text-purple-700 ${BADGE_BASE}` };
        case 'COMPLETED':
            return { label: 'Completed', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'DELIVERED':
            return { label: 'Delivered', colorClasses: `bg-green-100 text-green-700 ${BADGE_BASE}` };
        case 'CANCELLED':
            return { label: 'Cancelled', colorClasses: `bg-slate-200 text-slate-600 ${BADGE_BASE}` };
        case 'DRAFT':
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: statusVal || 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Returns { label, ref, color } — the sourcing pill (which upstream document,
// if any, this SO was raised from). Distinct outlined visual language from the
// solid status badge.
export function resolveSalesOrderSourceType(order) {
    if (!order) return { label: 'Direct Order', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (order.linkedProforma) return { label: 'Against PI', ref: order.linkedProforma, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (order.linkedQuotation) return { label: 'Against QT', ref: order.linkedQuotation, color: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Direct Order', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
}
