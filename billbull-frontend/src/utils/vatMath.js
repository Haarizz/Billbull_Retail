// Shared VAT math for sales document line items. Used by Quotation, Sales
// Order, Sales Invoice (and Proforma) calculateRow implementations so the
// VAT-inclusive / VAT-exclusive toggle behaves identically everywhere.

export const VAT_MODES = {
    EXCLUSIVE: 'EXCLUSIVE',
    INCLUSIVE: 'INCLUSIVE',
};

/**
 * Compute the taxable amount, tax amount, and line total from a
 * pre-discount net (gross − FOC − bill discount portion). Honours the
 * VAT mode:
 *   - EXCLUSIVE: price excludes tax → tax is added on top. Net stays as
 *     taxable; total = taxable + tax.
 *   - INCLUSIVE: price already includes tax → tax is extracted out of
 *     the net. Net becomes the line total; taxable = net / (1+rate).
 *
 * Returns { taxableAmount, taxAmount, total } as plain numbers.
 */
export const computeLineTaxTotals = ({
    netAfterDiscount,
    taxPercent = 0,
    vatMode = VAT_MODES.EXCLUSIVE,
}) => {
    const net = Number(netAfterDiscount) || 0;
    const rate = Number(taxPercent) || 0;

    if (vatMode === VAT_MODES.INCLUSIVE && rate > 0) {
        const divisor = 1 + rate / 100;
        const taxableAmount = net / divisor;
        const taxAmount = net - taxableAmount;
        return {
            taxableAmount,
            taxAmount,
            total: net,
        };
    }

    // EXCLUSIVE (and the rate=0 case): tax is added on top.
    const taxAmount = net * (rate / 100);
    return {
        taxableAmount: net,
        taxAmount,
        total: net + taxAmount,
    };
};

/**
 * Resolve the tax % to apply on a freshly-added sales line. This is the single
 * shared resolver used by every sales/pricing flow (POS, Sales Invoice,
 * Quotation, Sales Order, Price Check, Layaway, Proforma, Delivery Note) so
 * tax resolution behaves identically everywhere — and must mirror
 * BranchTaxResolutionService (backend) exactly.
 *
 * Precedence:
 *   0. taxEnabled === false — full kill switch. Always returns 0, regardless
 *      of product tax or branch default. Checked FIRST, before anything else.
 *   1. product.salesTax / product.tax (per-item rate from the product master)
 *      — only when explicitly set (null/undefined/empty are treated as
 *      "not set"; a deliberate 0 is honoured for zero-rated items). Always
 *      overrides the branch default.
 *   2. branchDefaultVatRate — the branch's configured Default VAT Rate, used
 *      only when the product has no Sales Tax set.
 *   3. 0% — internal system fallback only, when neither is configured.
 *
 * @param {object} product
 * @param {number|string|null} branchDefaultVatRate
 * @param {boolean} [taxEnabled=true] — the branch's Tax Enabled switch. Defaults to
 *   true so existing 2-arg call sites that haven't been updated yet keep their prior
 *   behavior rather than silently going tax-free; every real caller should now pass
 *   this explicitly from the branch's Tax Configuration.
 * @param {number} [fallback=0]
 */
export const resolveLineTaxRate = (product, branchDefaultVatRate, taxEnabled = true, fallback = 0) => {
    if (taxEnabled === false) return 0;

    const raw = product?.salesTax ?? product?.tax;
    if (raw !== null && raw !== undefined && raw !== '') {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    if (branchDefaultVatRate !== null && branchDefaultVatRate !== undefined) {
        const parsedDefault = parseFloat(branchDefaultVatRate);
        if (Number.isFinite(parsedDefault)) return parsedDefault;
    }
    return fallback;
};
