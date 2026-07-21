// Status-driven action visibility for GRN actions (Transaction Preview). GRN
// carries no money settlement from the preview — actions are edit / print.
// Editing is allowed until the GRN is POSTED or REVERSED (locked).
export function getAvailableGrnActions(status) {
    const s = String(status || '').toUpperCase().trim();
    switch (s) {
        case 'DRAFT':
        case 'QC_PENDING':
        case 'QC_COMPLETED':
            return { edit: true, print: true };
        case 'POSTED':
        case 'REVERSED':
            return { edit: false, print: true };
        default:
            return { edit: false, print: true };
    }
}
