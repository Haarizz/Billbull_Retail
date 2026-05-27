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
 * Resolve the tax % to apply on a freshly-added sales line.
 *
 * Precedence:
 *   1. product.salesTax / product.tax (per-item rate from the product master)
 *      — only when explicitly set (null/undefined/empty are treated as
 *      "not set"; a deliberate 0 is honoured for zero-rated items).
 *   2. activeVatRate — the rate of the Active VAT row registered in the
 *      Tax Compliance module.
 *   3. Legacy default of 5%.
 */
export const resolveLineTaxRate = (product, activeVatRate, fallback = 5) => {
    const raw = product?.salesTax ?? product?.tax;
    if (raw !== null && raw !== undefined && raw !== '') {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    if (activeVatRate !== null && activeVatRate !== undefined) {
        const parsedActive = parseFloat(activeVatRate);
        if (Number.isFinite(parsedActive)) return parsedActive;
    }
    return fallback;
};
