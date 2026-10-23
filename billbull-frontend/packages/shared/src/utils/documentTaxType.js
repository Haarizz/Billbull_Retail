// Single source of truth for the POS Receipt vs Tax Invoice print decision.
//
// Business rule: a printed sales document is a Tax Invoice when the
// document's own resolved tax total is greater than 0, and a (tax-free)
// Sales Invoice / POS Receipt otherwise. This must be derived from the
// invoice's own stored tax figure — never from the *current* branch tax
// configuration — so historical invoices keep printing under the document
// type they were issued with even if branch tax settings change later.
//
// Every print/preview/reprint/PDF call site should call isTaxInvoiceDocument
// (or getInvoiceDocumentTitle) instead of re-deriving this locally.

export const DOCUMENT_TITLES = {
    TAX_INVOICE: 'TAX INVOICE',
    SALES_INVOICE: 'SALES INVOICE',
    CREDIT_NOTE: 'CREDIT NOTE',
    PROFORMA_INVOICE: 'PRO-FORMA INVOICE',
};

/**
 * True for a POS PI Flow Pro-forma Invoice: a delivery order sent out as a Draft that becomes the
 * sales invoice only when Delivery Settlement settles or returns it. It is not a tax invoice yet,
 * so it never prints under one.
 */
export const isProformaDocument = (doc) => !!doc?.posProformaPending;

/**
 * Resolve the final tax amount for a document from whichever field it was
 * persisted/loaded under. Different endpoints/list rows use different key
 * names for the same figure (taxTotal / tax / totalTax).
 */
export const resolveDocumentTaxAmount = (doc) => {
    if (!doc) return 0;
    const value = doc.taxTotal ?? doc.tax ?? doc.totalTax ?? 0;
    return Number(value) || 0;
};

/**
 * True when the document should print as a Tax Invoice (resolved tax > 0).
 */
export const isTaxInvoiceDocument = (doc) => resolveDocumentTaxAmount(doc) > 0;

/**
 * Centralized document title resolution.
 * - Returns CREDIT_NOTE for returns regardless of tax.
 * - Otherwise TAX_INVOICE when resolved tax > 0, else SALES_INVOICE.
 * - `titleOverride` (e.g. an explicit template header configured by the
 *   user) always wins, matching prior call-site behaviour.
 */
export const getInvoiceDocumentTitle = (doc, { isReturn = false, titleOverride } = {}) => {
    // Ahead of the template override: a configured "TAX INVOICE" header must not title a PI.
    if (!isReturn && isProformaDocument(doc)) return DOCUMENT_TITLES.PROFORMA_INVOICE;
    if (titleOverride) return titleOverride;
    if (isReturn) return DOCUMENT_TITLES.CREDIT_NOTE;
    return isTaxInvoiceDocument(doc) ? DOCUMENT_TITLES.TAX_INVOICE : DOCUMENT_TITLES.SALES_INVOICE;
};
