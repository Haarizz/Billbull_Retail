// Pure status resolvers shared between the GRN list and its Transaction Preview.
// GRN is a goods-receipt document with a QC gate:
// DRAFT → QC_PENDING → QC_COMPLETED → POSTED (or REVERSED).

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

export function getGrnStatusBadge(statusVal) {
    const s = String(statusVal || '').toUpperCase().trim();
    switch (s) {
        case 'POSTED':
            return { label: 'Posted', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'QC_COMPLETED':
            return { label: 'QC Completed', colorClasses: `bg-blue-100 text-blue-700 ${BADGE_BASE}` };
        case 'QC_PENDING':
            return { label: 'QC Pending', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        case 'REVERSED':
            return { label: 'Reversed', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        case 'DRAFT':
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
        default:
            return { label: (statusVal || 'Draft').replace(/_/g, ' '), colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Invoice-status pill (how much of this posted GRN has been invoiced).
export function getInvStatusBadge(invStatus) {
    const s = String(invStatus || '').trim();
    if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'not invoiced') return null;
    if (/fully/i.test(s)) return { label: 'Fully Invoiced', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
    if (/partial/i.test(s)) return { label: 'Partially Invoiced', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
    return { label: s, colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
}

// Returns { label, ref, color } — how this GRN was originated.
export function resolveGrnSourceType(grn) {
    const lpo = grn?.lpoNumber || grn?.lpoNo;
    if (lpo && lpo !== '-') return { label: 'Against LPO', ref: lpo, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    return { label: 'Direct GRN', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
}
