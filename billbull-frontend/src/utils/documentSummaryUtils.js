const toNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const getFocDeduction = (item = {}, unitPrice = 0, sellingUnit = 'PCS') => {
    const focQty = toNumber(item.foc ?? item.focQty);
    if (focQty <= 0) {
        return 0;
    }

    const focUnit = item.focUnit || sellingUnit;
    const unitConversions = item.unitConversions || {};

    if (sellingUnit === focUnit) {
        return unitPrice * focQty;
    }

    const focConversion = toNumber(unitConversions[focUnit]) || 1;
    const sellingConversion = toNumber(unitConversions[sellingUnit]) || 1;
    const focInSellingUnit = (focQty * focConversion) / sellingConversion;
    return unitPrice * focInSellingUnit;
};

export const summarizeSalesItems = (items = [], billDiscountPercent = 0) => {
    const summary = items.reduce((acc, rawItem) => {
        const item = rawItem || {};
        const qty = toNumber(item.qty ?? item.quantity);
        const price = toNumber(item.price);
        const discountPercent = toNumber(item.disc ?? item.discount ?? item.discountPercent ?? item.discPercent);
        const taxPercent = toNumber(item.tax ?? item.taxRate ?? item.taxPercent);
        const sellingUnit = item.unit || item.uom || 'PCS';

        const grossAmount = qty * price;
        const focDeduction = getFocDeduction(item, price, sellingUnit);
        const preDiscountAmount = Math.max(0, grossAmount - focDeduction);
        const explicitTaxAmount = hasValue(item.taxAmt ?? item.taxAmount)
            ? toNumber(item.taxAmt ?? item.taxAmount)
            : null;
        const explicitLineTotal = hasValue(item.total ?? item.lineTotal ?? item.netAmount ?? item.net)
            ? toNumber(item.total ?? item.lineTotal ?? item.netAmount ?? item.net)
            : null;
        const explicitTaxableAmount = hasValue(item.taxableAmount ?? item.netBeforeTax)
            ? toNumber(item.taxableAmount ?? item.netBeforeTax)
            : null;

        let discountAmount = hasValue(item.discountAmount)
            ? toNumber(item.discountAmount)
            : preDiscountAmount * (discountPercent / 100);
        let taxableAmount = explicitTaxableAmount;

        // Only trust stored lineTotal when it is genuinely non-zero.
        // A stored value of 0 means the item was either blank or saved before
        // calculation ran; fall through to recompute from qty/price in that case.
        if (!hasValue(taxableAmount) && explicitLineTotal > 0) {
            taxableAmount = Math.max(0, explicitLineTotal - (explicitTaxAmount || 0));
        }

        if (!hasValue(taxableAmount)) {
            taxableAmount = preDiscountAmount - discountAmount;
        }

        if (!hasValue(item.discountAmount) && preDiscountAmount > 0) {
            discountAmount = Math.max(0, preDiscountAmount - taxableAmount);
        }

        const taxAmount = (explicitLineTotal > 0 && explicitTaxAmount != null)
            ? explicitTaxAmount
            : (explicitLineTotal > 0 ? Math.max(0, explicitLineTotal - taxableAmount) : taxableAmount * (taxPercent / 100));
        const lineTotal = explicitLineTotal > 0
            ? explicitLineTotal
            : taxableAmount + taxAmount;

        acc.grossTotal += grossAmount;
        acc.itemDiscountTotal += discountAmount;
        acc.subTotal += taxableAmount;
        acc.tax += taxAmount;
        acc.grandTotal += lineTotal;
        return acc;
    }, {
        grossTotal: 0,
        itemDiscountTotal: 0,
        subTotal: 0,
        tax: 0,
        grandTotal: 0,
    });

    const billDiscountPercentValue = toNumber(billDiscountPercent);
    const billDiscountAmount = summary.subTotal * (billDiscountPercentValue / 100);
    
    // ✅ ERP FIX: Apply tax AFTER bill discount
    // We can proportionally reduce the total tax by the same percentage as the bill discount
    const finalTax = summary.tax * (1 - billDiscountPercentValue / 100);

    return {
        ...summary,
        billDiscountAmount,
        tax: finalTax, // Overwrite with discounted tax
        grandTotal: summary.subTotal - billDiscountAmount + finalTax,
    };
};

export const summarizePurchaseItems = (items = []) => items.reduce((acc, rawItem) => {
    const item = rawItem || {};
    const qty = toNumber(item.qty ?? item.quantity ?? item.received);
    const unitPrice = toNumber(item.unitPrice ?? item.unitCost ?? item.price ?? item.cost);
    const effectiveUnitPrice = hasValue(item.netCost)
        ? toNumber(item.netCost)
        : unitPrice;
    const discountPercent = toNumber(item.disc ?? item.discount ?? item.discountPercent);
    const taxPercent = toNumber(item.tax ?? item.taxPercent ?? item.taxRate ?? item.purchaseTax);
    const sellingUnit = item.uom || item.unit || 'PCS';

    const grossAmount = qty * unitPrice;
    const effectiveAmount = qty * effectiveUnitPrice;
    const focDeduction = getFocDeduction(item, unitPrice, sellingUnit);
    const preDiscountSubtotal = Math.max(0, grossAmount - focDeduction);
    const discountAmount = hasValue(item.discountAmount)
        ? toNumber(item.discountAmount)
        : Math.max(0, preDiscountSubtotal - effectiveAmount) || preDiscountSubtotal * (discountPercent / 100);
    const taxableAmount = hasValue(item.taxableAmount ?? item.net ?? item.amount)
        ? toNumber(item.taxableAmount ?? item.net ?? item.amount)
        : hasValue(item.netCost)
            ? effectiveAmount
        : Math.max(0, preDiscountSubtotal - discountAmount);
    const taxAmount = hasValue(item.taxAmt ?? item.taxAmount)
        ? toNumber(item.taxAmt ?? item.taxAmount)
        : taxableAmount * (taxPercent / 100);
    const lineTotal = hasValue(item.total ?? item.lineTotal ?? item.amountTotal)
        ? toNumber(item.total ?? item.lineTotal ?? item.amountTotal)
        : taxableAmount + taxAmount;

    acc.preDiscountSubtotal += preDiscountSubtotal;
    acc.discountTotal += discountAmount;
    acc.taxableSubtotal += taxableAmount;
    acc.tax += taxAmount;
    acc.grandTotal += lineTotal;
    return acc;
}, {
    preDiscountSubtotal: 0,
    discountTotal: 0,
    taxableSubtotal: 0,
    tax: 0,
    grandTotal: 0,
});
