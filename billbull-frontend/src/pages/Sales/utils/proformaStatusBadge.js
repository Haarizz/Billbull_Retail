// Pure status/source-type resolvers shared between the Proforma Invoice list and
// its Transaction Preview. Proforma statuses are minimal: DRAFT / ISSUED (plus
// CANCELLED / INVOICED where the backend sets them). Accepts both enum and
// display-string forms.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

export function getProformaStatusBadge(statusVal) {
    const s = String(statusVal || '').toUpperCase().trim();
    switch (s) {
        case 'ISSUED':
            return { label: 'Issued', colorClasses: `bg-blue-100 text-blue-700 ${BADGE_BASE}` };
        case 'INVOICED':
            return { label: 'Invoiced', colorClasses: `bg-indigo-100 text-indigo-700 ${BADGE_BASE}` };
        case 'CANCELLED':
            return { label: 'Cancelled', colorClasses: `bg-slate-200 text-slate-600 ${BADGE_BASE}` };
        case 'EXPIRED':
            return { label: 'Expired', colorClasses: `bg-amber-100 text-amber-700 ${BADGE_BASE}` };
        case 'DRAFT':
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: statusVal || 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Returns { label, ref, color } — which upstream document this PI was raised from.
export function resolveProformaSourceType(pi) {
    if (!pi) return { label: 'Direct PI', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (pi.salesOrderNo) return { label: 'Against SO', ref: pi.salesOrderNo, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (pi.quotationNo) return { label: 'Against QT', ref: pi.quotationNo, color: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Direct PI', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
}
