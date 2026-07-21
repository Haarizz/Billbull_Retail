// Pure status/payment/source resolvers shared between the Purchase Invoice list
// and its Transaction Preview. Lifecycle: DRAFT → PENDING_APPROVAL → POSTED;
// payment status runs UNPAID → PARTIALLY_PAID → PAID independently.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

const norm = (v) => String(v || '').toUpperCase().trim().replace(/\s+/g, '_');

export function getPurchaseInvoiceStatusBadge(statusVal) {
    switch (norm(statusVal)) {
        case 'POSTED':
            return { label: 'Posted', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'PENDING_APPROVAL':
            return { label: 'Pending Approval', colorClasses: `bg-yellow-100 text-yellow-700 ${BADGE_BASE}` };
        case 'REJECTED':
            return { label: 'Rejected', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        case 'CANCELLED':
            return { label: 'Cancelled', colorClasses: `bg-slate-200 text-slate-600 ${BADGE_BASE}` };
        case 'DRAFT':
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: (statusVal || 'Draft').toString().replace(/_/g, ' '), colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

export function getPurchasePaymentBadge(paymentStatus) {
    switch (norm(paymentStatus)) {
        case 'PAID':
            return { label: 'Paid', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'PARTIALLY_PAID':
            return { label: 'Partially Paid', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        case 'UNPAID':
            return { label: 'Unpaid', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        default:
            return null;
    }
}

// Returns { label, ref, color } — which upstream document this PI was raised from.
export function resolvePurchaseInvoiceSourceType(inv) {
    const src = norm(inv?.sourceType || inv?.source);
    if (src === 'AGAINST_GRN' || src === 'GRN') return { label: 'Against GRN', ref: inv?.grnNo || inv?.refNo, color: 'bg-green-100 text-green-700 border-green-200' };
    if (src === 'AGAINST_LPO' || src === 'LPO') return { label: 'Against LPO', ref: inv?.referenceNo || inv?.refNo, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    return { label: 'Direct Purchase', ref: null, color: 'bg-purple-100 text-purple-700 border-purple-200' };
}
