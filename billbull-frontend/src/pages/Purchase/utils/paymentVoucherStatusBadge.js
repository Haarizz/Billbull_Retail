// Pure status resolvers shared between the Payment Voucher list and its
// Transaction Preview. Lifecycle: PENDING_APPROVAL → POSTED → CLEARED
// (or REJECTED). Accepts both the raw enum and the formatted display string.

const BADGE_BASE = 'px-2 py-0.5 rounded text-[10px] font-bold';

export function getPaymentVoucherStatusBadge(statusVal) {
    const s = String(statusVal || '').toUpperCase().trim().replace(/\s+/g, '_');
    switch (s) {
        case 'POSTED':
            return { label: 'Posted', colorClasses: `bg-emerald-100 text-emerald-700 ${BADGE_BASE}` };
        case 'CLEARED':
            return { label: 'Cleared', colorClasses: `bg-green-100 text-green-700 ${BADGE_BASE}` };
        case 'PENDING_APPROVAL':
            return { label: 'Pending Approval', colorClasses: `bg-amber-100 text-amber-700 ${BADGE_BASE}` };
        case 'REJECTED':
            return { label: 'Rejected', colorClasses: `bg-red-100 text-red-700 ${BADGE_BASE}` };
        default:
            return { label: (statusVal || 'Draft').toString().replace(/_/g, ' '), colorClasses: `bg-slate-100 text-slate-600 ${BADGE_BASE}` };
    }
}

// Payment vouchers have no editor; the only preview actions are print/download,
// available at every status (a pending voucher still prints as a draft copy).
export function getAvailablePaymentVoucherActions() {
    return { print: true, download: true };
}
