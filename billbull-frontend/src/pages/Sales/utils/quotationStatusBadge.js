// Pure status/source-type resolvers shared between the Quotation list and the
// Quotation Transaction Preview. Handles BOTH the raw backend enum
// (getQuotationById → DRAFT/APPROVED/…) and the display strings the list rows
// carry (mapBackendToFrontend → 'Approved'/'Converted to SO'/…), so either data
// source renders the same badge.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

// Normalise both enum and display-string forms to a single key.
function normalizeStatus(statusVal) {
    const s = String(statusVal || '').toUpperCase().trim();
    switch (s) {
        case 'PENDING_APPROVAL':
        case 'PENDING APPROVAL':
            return 'PENDING_APPROVAL';
        case 'APPROVED':
            return 'APPROVED';
        case 'REJECTED':
            return 'REJECTED';
        case 'CONVERTED':
        case 'CONVERTED TO SO':
            return 'CONVERTED';
        case 'INVOICED':
            return 'INVOICED';
        case 'EXPIRED':
            return 'EXPIRED';
        case 'SUPERSEDED':
            return 'SUPERSEDED';
        case 'DRAFT':
            return 'DRAFT';
        default:
            return s || 'DRAFT';
    }
}

// Returns { label, colorClasses } — colorClasses already includes BADGE_BASE.
export function getQuotationStatusBadge(statusVal) {
    switch (normalizeStatus(statusVal)) {
        case 'PENDING_APPROVAL':
            return { label: 'Pending Approval', colorClasses: `bg-orange-100 text-orange-700 ${BADGE_BASE}` };
        case 'APPROVED':
            return { label: 'Approved', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'REJECTED':
            return { label: 'Rejected', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        case 'CONVERTED':
            return { label: 'Converted to SO', colorClasses: `bg-blue-100 text-blue-700 ${BADGE_BASE}` };
        case 'INVOICED':
            return { label: 'Invoiced', colorClasses: `bg-indigo-100 text-indigo-700 ${BADGE_BASE}` };
        case 'EXPIRED':
            return { label: 'Expired', colorClasses: `bg-amber-100 text-amber-700 ${BADGE_BASE}` };
        case 'SUPERSEDED':
            return { label: 'Superseded', colorClasses: `bg-slate-200 text-slate-500 ${BADGE_BASE}` };
        default:
            return { label: 'Draft', colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Returns { label, ref, color } — the sourcing pill (which upstream inquiry, if
// any, this quotation was raised from).
export function resolveQuotationSourceType(qtn) {
    if (qtn?.sourceInquiryNumber) {
        return { label: 'From Inquiry', ref: qtn.sourceInquiryNumber, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    }
    return { label: 'Direct Quote', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
}

// Exposed for callers that need the normalised key (e.g. action rules).
export { normalizeStatus as normalizeQuotationStatus };
