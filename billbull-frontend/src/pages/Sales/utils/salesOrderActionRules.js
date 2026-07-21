// Status-driven action visibility for Sales Order actions (Transaction Preview).
// Mirrors invoiceActionRules.js. Final visibility for an action =
// statusRules[action] && permissionAllows(action); the two are independent.
//
// A Sales Order carries an advance (not a full settlement), so "recordPayment"
// here means recording an advance receipt against the order.
export function getAvailableSalesOrderActions(status) {
    const s = String(status || '').toUpperCase();
    switch (s) {
        case 'DRAFT':
            return { edit: true, print: true, email: false, pdf: false, recordPayment: false, duplicate: true };
        case 'CONFIRMED':
            return { edit: true, print: true, email: true, pdf: false, recordPayment: true, duplicate: true };
        case 'PARTIALLY_PAID':
            return { edit: true, print: true, email: true, pdf: false, recordPayment: true, duplicate: true };
        case 'PAID':
        case 'FULLY_PAID':
            return { edit: true, print: true, email: true, pdf: false, recordPayment: false, duplicate: true };
        case 'INVOICED':
        case 'COMPLETED':
        case 'DELIVERED':
            return { edit: false, print: true, email: true, pdf: false, recordPayment: false, duplicate: true };
        case 'CANCELLED':
            return { edit: false, print: true, email: false, pdf: false, recordPayment: false, duplicate: false };
        default:
            return { edit: false, print: true, email: false, pdf: false, recordPayment: false, duplicate: false };
    }
}
