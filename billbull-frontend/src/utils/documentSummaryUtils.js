import { computeLineTaxTotals, VAT_MODES } from './vatMath';

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

// Compute per-item taxable amount (net after item-level discount, before footer discount).
// billDiscount can be:
//   - a number (treated as percentage, legacy)
//   - { type: 'percent', value: number }
//   - { type: 'amount', value: number }
export const summarizeSalesItems = (items = [], billDiscount = 0, extras = {}, vatMode = VAT_MODES.EXCLUSIVE) => {
    // Normalise the footer-discount descriptor.
    let footerDiscType = 'percent';
    let footerDiscValue = 0;
    if (billDiscount !== null && typeof billDiscount === 'object') {
        footerDiscType = billDiscount.type === 'amount' ? 'amount' : 'percent';
        footerDiscValue = toNumber(billDiscount.value);
    } else {
        footerDiscValue = toNumber(billDiscount);
    }

    // Pass 1: compute per-item net-before-footer (taxable after item discount).
    const perItem = items.map((rawItem) => {
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
        // Track whether taxableAmount was derived from explicitLineTotal, which
        // may already have footer-discount allocation baked in (e.g. saved
        // invoice items from the API). In that case we must NOT recalculate
        // discountAmount from (preDiscountAmount - taxableAmount), because that
        // would inflate the item discount to include footer discount too.
        let taxableDerivedFromLineTotal = false;

        // Only trust stored lineTotal when it is genuinely non-zero.
        if (!hasValue(taxableAmount) && explicitLineTotal > 0) {
            taxableAmount = Math.max(0, explicitLineTotal - (explicitTaxAmount || 0));
            taxableDerivedFromLineTotal = true;
        }
        if (!hasValue(taxableAmount)) {
            // No pre-computed taxable amount on the item — derive it from the
            // raw price via the shared VAT helper so an Inclusive-mode raw
            // price isn't mistaken for an already ex-VAT amount.
            taxableAmount = computeLineTaxTotals({
                netAfterDiscount: preDiscountAmount - discountAmount,
                taxPercent,
                vatMode,
            }).taxableAmount;
        }
        // Recalculate discountAmount from (grossAmount - taxableAmount) only
        // when taxableAmount came from an explicit item field (e.g. item.taxableAmount)
        // and NOT when it was derived from the line total. Line totals from saved
        // documents may include footer-discount allocation, which would cause
        // discountAmount to be inflated (item discount + footer discount).
        if (!hasValue(item.discountAmount) && preDiscountAmount > 0 && !taxableDerivedFromLineTotal) {
            discountAmount = Math.max(0, preDiscountAmount - taxableAmount);
        }

        return { grossAmount, discountAmount, taxableAmount, taxPercent, explicitTaxAmount, explicitLineTotal };
    });

    // Pass 2: determine total net-before-footer (= sum of taxableAmounts) to use as
    // the denominator for proportional footer-discount allocation.
    const totalNetBeforeFooter = perItem.reduce((s, r) => s + r.taxableAmount, 0);

    // Resolve total footer-discount amount.
    let billDiscountAmount = 0;
    if (footerDiscValue > 0 && totalNetBeforeFooter > 0) {
        billDiscountAmount = footerDiscType === 'amount'
            ? Math.min(footerDiscValue, totalNetBeforeFooter)
            : totalNetBeforeFooter * (footerDiscValue / 100);
    }
    const footerDiscountRatio = totalNetBeforeFooter > 0 ? billDiscountAmount / totalNetBeforeFooter : 0;

    // Pass 3: accumulate totals using footer-allocated per-item values.
    const summary = perItem.reduce((acc, r) => {
        const itemFooterDisc = r.taxableAmount * footerDiscountRatio;
        const netAfterFooter = Math.max(0, r.taxableAmount - itemFooterDisc);

        // Tax is computed on net after ALL discounts (item + footer).
        // Only use the stored taxAmount when no footer discount is active — with a
        // footer discount the taxable base is reduced first, so we must recalculate.
        const taxAmount = (footerDiscountRatio === 0 && r.explicitLineTotal > 0 && r.explicitTaxAmount != null)
            ? r.explicitTaxAmount
            : netAfterFooter * (r.taxPercent / 100);
        const lineTotal = netAfterFooter + taxAmount;

        acc.grossTotal += r.grossAmount;
        acc.itemDiscountTotal += r.discountAmount;
        acc.subTotal += r.taxableAmount;
        acc.footerDiscountTotal += itemFooterDisc;
        acc.tax += taxAmount;
        acc.grandTotal += lineTotal;
        return acc;
    }, {
        grossTotal: 0,
        itemDiscountTotal: 0,
        subTotal: 0,
        footerDiscountTotal: 0,
        tax: 0,
        grandTotal: 0,
    });

    // Delivery charge is a flat add (no VAT); round-off is a manual +/- adjustment.
    const deliveryCharge = toNumber(extras.deliveryCharge);
    const roundOff = toNumber(extras.roundOff);

    return {
        ...summary,
        billDiscountAmount: summary.footerDiscountTotal,
        deliveryCharge,
        roundOff,
        grandTotal: summary.subTotal - summary.footerDiscountTotal + summary.tax + deliveryCharge + roundOff,
        // Expose the descriptor so callers can round-trip it.
        footerDiscType,
        footerDiscValue,
    };
};

// Build the footer-discount descriptor expected by summarizeSalesItems.
export const makeFooterDiscount = (type, value) => ({ type: type === 'amount' ? 'amount' : 'percent', value: toNumber(value) });

// Allocate footer discount proportionally across items and return enriched item array.
// Each returned item gains an `allocatedFooterDiscount` field (absolute amount).
export const allocateFooterDiscount = (items = [], billDiscount = 0, vatMode = VAT_MODES.EXCLUSIVE) => {
    let footerDiscType = 'percent';
    let footerDiscValue = 0;
    if (billDiscount !== null && typeof billDiscount === 'object') {
        footerDiscType = billDiscount.type === 'amount' ? 'amount' : 'percent';
        footerDiscValue = toNumber(billDiscount.value);
    } else {
        footerDiscValue = toNumber(billDiscount);
    }

    const nets = items.map((item) => {
        // Always prefer taxableAmount (pre-footer, pre-tax) to avoid cascading discount calculation bugs.
        if (hasValue(item.taxableAmount) && toNumber(item.taxableAmount) > 0) return toNumber(item.taxableAmount);
        if (hasValue(item.net) && toNumber(item.net) > 0) return toNumber(item.net);
        const qty = toNumber(item.qty ?? item.quantity);
        const price = toNumber(item.price);
        const discPct = toNumber(item.disc ?? item.discount ?? item.discountPercent ?? item.discPercent);
        const taxPercent = toNumber(item.tax ?? item.taxRate ?? item.taxPercent);
        const gross = qty * price;
        const netAfterDiscount = Math.max(0, gross - gross * (discPct / 100));
        return computeLineTaxTotals({ netAfterDiscount, taxPercent, vatMode }).taxableAmount;
    });

    const totalNet = nets.reduce((s, n) => s + n, 0);
    const footerDiscAmt = footerDiscValue > 0 && totalNet > 0
        ? (footerDiscType === 'amount' ? Math.min(footerDiscValue, totalNet) : totalNet * (footerDiscValue / 100))
        : 0;

    return items.map((item, idx) => ({
        ...item,
        allocatedFooterDiscount: totalNet > 0 ? (nets[idx] / totalNet) * footerDiscAmt : 0,
    }));
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
