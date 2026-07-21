// Pure status/source resolvers shared between the LPO list and its Transaction
// Preview. LPO statuses track the purchase-order lifecycle:
// DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_VENDOR → PARTIALLY_RECEIVED →
// COMPLETED (shown as "GRN Converted"), or REJECTED / CANCELLED.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

export function getLpoStatusBadge(statusVal) {
    const s = String(statusVal || '').toUpperCase().trim();
    switch (s) {
        case 'APPROVED':
            return { label: 'Approved', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'SENT_TO_VENDOR':
            return { label: 'Sent to Vendor', colorClasses: `bg-blue-100 text-blue-700 ${BADGE_BASE}` };
        case 'PARTIALLY_RECEIVED':
            return { label: 'Partially Received', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        case 'COMPLETED':
            return { label: 'GRN Converted', colorClasses: `bg-teal-100 text-teal-700 ${BADGE_BASE}` };
        case 'PENDING_APPROVAL':
            return { label: 'Pending Approval', colorClasses: `bg-yellow-100 text-yellow-700 ${BADGE_BASE}` };
        case 'REJECTED':
            return { label: 'Rejected', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        case 'CANCELLED':
            return { label: 'Cancelled', colorClasses: `bg-slate-200 text-slate-600 ${BADGE_BASE}` };
        case 'DRAFT':
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: (statusVal || 'Draft').replace(/_/g, ' '), colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Returns { label, ref, color } — how this LPO was originated.
export function resolveLpoSourceType(lpo) {
    const src = String(lpo?.createdFrom || '').toLowerCase();
    if (src.includes('auto') || src.includes('forecast')) {
        return { label: 'Auto-Generated', ref: null, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    }
    if (src.includes('goods request') || src.includes('request')) {
        return { label: 'From Request', ref: null, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    }
    return { label: 'Manual', ref: null, color: 'bg-slate-100 text-slate-600 border-slate-200' };
}
