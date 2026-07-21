// Status-driven action visibility for LPO actions (Transaction Preview). An LPO
// can carry advance payments to the vendor, so recordPayment = record an advance.
// LPOs become view-only once they leave DRAFT/PENDING (approved orders are not
// edited in place — they're revised). Print is always available.
export function getAvailableLpoActions(status) {
    const s = String(status || '').toUpperCase().trim();
    switch (s) {
        case 'DRAFT':
            return { edit: true, print: true, recordPayment: false, printVoucher: false };
        case 'PENDING_APPROVAL':
            return { edit: true, print: true, recordPayment: false, printVoucher: false };
        case 'APPROVED':
        case 'SENT_TO_VENDOR':
            return { edit: false, print: true, recordPayment: true, printVoucher: true };
        case 'PARTIALLY_RECEIVED':
            return { edit: false, print: true, recordPayment: true, printVoucher: true };
        case 'COMPLETED':
            return { edit: false, print: true, recordPayment: false, printVoucher: true };
        case 'REJECTED':
        case 'CANCELLED':
            return { edit: false, print: true, recordPayment: false, printVoucher: false };
        default:
            return { edit: false, print: true, recordPayment: false, printVoucher: false };
    }
}
