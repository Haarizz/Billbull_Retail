// Status-driven action visibility for Proforma Invoice actions (Transaction
// Preview). A proforma may record an advance, so recordPayment maps to receiving
// an advance. Issued proformas are view-only for editing.
export function getAvailableProformaActions(status) {
    const s = String(status || '').toUpperCase().trim();
    switch (s) {
        case 'DRAFT':
            return { edit: true, print: true, email: true, recordPayment: false, duplicate: true };
        case 'ISSUED':
            return { edit: false, print: true, email: true, recordPayment: false, duplicate: true };
        case 'INVOICED':
            return { edit: false, print: true, email: true, recordPayment: false, duplicate: true };
        case 'CANCELLED':
        case 'EXPIRED':
            return { edit: false, print: true, email: false, recordPayment: false, duplicate: false };
        default:
            return { edit: false, print: true, email: false, recordPayment: false, duplicate: false };
    }
}
