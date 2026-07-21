import { normalizeQuotationStatus } from './quotationStatusBadge';

// Status-driven action visibility for Quotation actions (Transaction Preview).
// A quotation carries no money settlement, so there is no recordPayment/pdf here
// — actions are edit / print / email / duplicate. Approved+ quotations are
// view-only (edit hidden) per the existing canEditQuotation rule; use Revise to
// change them (revise is a page-level action, not surfaced from the preview).
export function getAvailableQuotationActions(status) {
    switch (normalizeQuotationStatus(status)) {
        case 'DRAFT':
            return { edit: true, print: true, email: true, duplicate: true };
        case 'PENDING_APPROVAL':
            return { edit: true, print: true, email: true, duplicate: true };
        case 'APPROVED':
            return { edit: false, print: true, email: true, duplicate: true };
        case 'CONVERTED':
        case 'INVOICED':
            return { edit: false, print: true, email: true, duplicate: true };
        case 'REJECTED':
        case 'EXPIRED':
        case 'SUPERSEDED':
            return { edit: false, print: true, email: false, duplicate: true };
        default:
            return { edit: false, print: true, email: false, duplicate: false };
    }
}
