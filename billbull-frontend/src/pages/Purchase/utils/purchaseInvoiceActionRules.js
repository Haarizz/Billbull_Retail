// Status-driven action visibility for Purchase Invoice actions (Transaction
// Preview). Drafts are editable; posted invoices accept payments until fully
// paid. recordPayment additionally requires paymentStatus !== PAID — the caller
// passes both.
export function getAvailablePurchaseInvoiceActions(status, paymentStatus) {
    const s = String(status || '').toUpperCase().trim().replace(/\s+/g, '_');
    const p = String(paymentStatus || '').toUpperCase().trim().replace(/\s+/g, '_');
    switch (s) {
        case 'DRAFT':
            return { edit: true, print: true, recordPayment: false };
        case 'PENDING_APPROVAL':
            return { edit: false, print: true, recordPayment: false };
        case 'POSTED':
            return { edit: false, print: true, recordPayment: p !== 'PAID' };
        default:
            return { edit: false, print: true, recordPayment: false };
    }
}
