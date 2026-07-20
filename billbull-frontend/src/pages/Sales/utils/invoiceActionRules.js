// Status-driven action visibility for Sales Invoice actions (List row icons +
// Transaction Preview). This is a first-pass rule set derived from the one
// precedent already in the codebase (Record Payment hidden for PAID/CANCELLED)
// plus reasonable business defaults — confirm against real workflow rules
// during QA rather than treating it as final.
//
// Final visibility for any given action = statusRules[action] && permissionAllows(action).
// Status rules and permission rules are independent; both must allow.
export function getAvailableInvoiceActions(status) {
    const s = String(status || '').toUpperCase();
    switch (s) {
        case 'DRAFT':
            return { edit: true, confirm: true, delete: true, print: true, email: false, pdf: true, recordPayment: false, duplicate: true };
        case 'CONFIRMED':
            return { edit: true, confirm: false, delete: false, print: true, email: true, pdf: true, recordPayment: true, duplicate: true };
        case 'PARTIALLY_PAID':
            return { edit: true, confirm: false, delete: false, print: true, email: true, pdf: true, recordPayment: true, duplicate: true };
        case 'PAID':
            return { edit: false, confirm: false, delete: false, print: true, email: true, pdf: true, recordPayment: false, duplicate: true };
        case 'CANCELLED':
            return { edit: false, confirm: false, delete: false, print: true, email: false, pdf: true, recordPayment: false, duplicate: false };
        default:
            return { edit: false, confirm: false, delete: false, print: true, email: false, pdf: true, recordPayment: false, duplicate: false };
    }
}
