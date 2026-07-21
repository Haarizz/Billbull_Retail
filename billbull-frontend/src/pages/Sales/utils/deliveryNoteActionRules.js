// Status-driven action visibility for Delivery Note actions (Transaction
// Preview). DN carries no money, so there is no payment/PDF action — actions are
// edit / print / email / print pick-list. Delivered and Cancelled DNs are
// view-only for editing. The pick-list print is only meaningful before delivery.
export function getAvailableDeliveryNoteActions(status) {
    const s = String(status || '').toUpperCase().trim();
    switch (s) {
        case 'DRAFT':
            return { edit: true, print: true, email: true, pickList: true };
        case 'DISPATCHED':
            return { edit: true, print: true, email: true, pickList: true };
        case 'DELIVERED':
            return { edit: false, print: true, email: true, pickList: false };
        case 'CANCELLED':
            return { edit: false, print: true, email: false, pickList: false };
        default:
            return { edit: false, print: true, email: false, pickList: false };
    }
}
