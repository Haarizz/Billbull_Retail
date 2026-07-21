// Pure status/POD/source resolvers shared between the Delivery Note list and its
// Transaction Preview. DN is a fulfillment document — statuses track dispatch,
// not money: DRAFT → DISPATCHED → DELIVERED (or CANCELLED).

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

export function getDeliveryNoteStatusBadge(statusVal) {
    const s = String(statusVal || '').toUpperCase().trim();
    switch (s) {
        case 'DISPATCHED':
            return { label: 'Dispatched', colorClasses: `bg-indigo-100 text-indigo-700 ${BADGE_BASE}` };
        case 'DELIVERED':
            return { label: 'Delivered', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'CANCELLED':
            return { label: 'Cancelled', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        case 'DRAFT':
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: statusVal || 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Proof-of-Delivery pill. Derived the same way the list builds `pod`:
// DELIVERED → Verified, DRAFT/CANCELLED → None, else Pending.
export function getPodBadge(statusVal, podVal) {
    const s = String(statusVal || '').toUpperCase().trim();
    const pod = podVal || (s === 'DELIVERED' ? 'Verified' : (s === 'CANCELLED' || s === 'DRAFT' ? 'None' : 'Pending'));
    switch (pod) {
        case 'Verified':
            return { label: 'Verified', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'Pending':
            return { label: 'POD Pending', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        default:
            return null;
    }
}

// Returns { label, ref, color } — which upstream document this DN fulfils.
export function resolveDeliveryNoteSourceType(dn) {
    if (!dn) return { label: 'Direct DN', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
    const si = dn.siNo || dn.linkedSalesInvoiceNumber;
    const pi = dn.piNo && dn.piNo !== '-' ? dn.piNo : dn.proformaNo;
    const so = dn.soNo || dn.salesOrderNo;
    if (si) return { label: 'Against SI', ref: si, color: 'bg-green-100 text-green-700 border-green-200' };
    if (pi) return { label: 'Against PI', ref: pi, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (so) return { label: 'Against SO', ref: so, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    return { label: 'Direct DN', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
}
