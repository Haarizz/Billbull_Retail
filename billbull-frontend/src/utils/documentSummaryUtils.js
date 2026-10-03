import { computeLineTaxTotals, VAT_MODES } from './vatMath';
import {
    FOOTER_DISCOUNT_TYPES,
    allocateSalesDocument,
    computeLineBase,
    readSalesLine,
    resolveFooterDiscountType,
} from './footerDiscountAllocator';

const toNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const round2 = (v) => Math.round((toNumber(v) + Number.EPSILON) * 100) / 100;

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

// Normalise the footer-discount descriptor:
//   - a number (legacy: percentage)
//   - { type: 'percent' | 'amount', value }
const normalizeFooter = (billDiscount) => {
    if (billDiscount !== null && typeof billDiscount === 'object') {
        return {
            type: billDiscount.type === 'amount' ? FOOTER_DISCOUNT_TYPES.AMOUNT : FOOTER_DISCOUNT_TYPES.PERCENT,
            value: toNumber(billDiscount.value),
        };
    }
    return { type: FOOTER_DISCOUNT_TYPES.PERCENT, value: toNumber(billDiscount) };
};

// LIVE document summary for an editable document. Always computed from each line's
// primitive inputs (qty, price, item disc %, tax %, FOC) through the shared footer-discount
// allocator — identical to what the server saves (sales/common/FooterDiscountAllocator).
// It never re-derives from stored line totals: those already contain the footer share,
// and re-applying the footer to them was the double-discount defect (audit N1).
//
// Returned figures (numbers, 2 dp):
//   grossTotal          Σ qty × price
//   itemDiscountTotal   Σ item-discount amounts
//   subTotal            Σ(taxable after footer + footer share)   — the header sub-total
//   footerDiscountTotal = billDiscountAmount = Σ line footer shares (exactly)
//   taxableTotal        Σ taxable after footer
//   tax, grandTotal     Σ line VAT; Σ line totals + delivery + round-off
//   lines[i]            { gross, itemDiscount, base, share, taxable, tax, total, voided }
export const summarizeSalesItems = (items = [], billDiscount = 0, extras = {}, vatMode = VAT_MODES.EXCLUSIVE) => {
    const footer = normalizeFooter(billDiscount);
    const allocation = allocateSalesDocument(items, footer, vatMode);

    let grossTotal = 0;
    let itemDiscountTotal = 0;
    let voidedTotal = 0;
    let voidedCount = 0;
    allocation.lines.forEach((line) => {
        if (line.voided) {
            voidedTotal += line.total;
            voidedCount += 1;
            return;
        }
        grossTotal += line.gross;
        itemDiscountTotal += line.itemDiscount;
    });

    // Delivery charge is a flat add (no VAT); round-off is a manual +/- adjustment.
    const deliveryCharge = toNumber(extras.deliveryCharge);
    const roundOff = toNumber(extras.roundOff);

    return {
        grossTotal: round2(grossTotal),
        itemDiscountTotal: round2(itemDiscountTotal),
        subTotal: allocation.subTotal,
        footerDiscountTotal: allocation.footerAmount,
        billDiscountAmount: allocation.footerAmount,
        taxableTotal: allocation.taxableTotal,
        tax: allocation.taxTotal,
        deliveryCharge,
        roundOff,
        grandTotal: round2(allocation.lineTotal + deliveryCharge + roundOff),
        // Informational disclosure of voided lines (net incl. tax). Does NOT
        // feed into grandTotal — voided lines are excluded from every total.
        voidedTotal: round2(voidedTotal),
        voidedCount,
        lines: allocation.lines,
        storedValues: false,
        headerOnlyFooter: false,
        // Expose the descriptor so callers can round-trip it.
        footerDiscType: footer.type,
        footerDiscValue: footer.value,
    };
};

const firstNumber = (...values) => {
    for (const v of values) {
        if (hasValue(v) && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
};

// Stored line money as the server saved it. Editor rows carry it under `serverLine`
// (see SalesInvoice mapServerInvoiceItem); API rows carry it directly.
const readStoredLine = (item = {}) => {
    const src = item.serverLine || item;
    const total = firstNumber(src.netAmount, src.lineTotal);
    const tax = firstNumber(src.taxAmount);
    if (total === null || tax === null) return null;
    const footer = firstNumber(src.footerDiscount);
    return { total, tax, footer, taxable: firstNumber(src.taxableAmount) };
};

// SAVED document summary: shows exactly the line money the server stored — never
// re-allocated, never re-discounted — so a saved, reloaded, printed or PDF'd document
// always shows the figures that were posted. Historical documents keep their meaning:
//   - lines carry footer shares          → totals are Σ stored lines (shares visible per line)
//   - header-only discount (POS / older) → footer comes from the header, no per-line share
// Falls back to the live summary when any line lacks stored money (unsaved rows).
//
// header: { billDiscountAmount, billDiscountType, billDiscount }
export const summarizeStoredSalesItems = (items = [], header = {}, extras = {}, vatMode = VAT_MODES.EXCLUSIVE) => {
    const stored = items.map((it) => readStoredLine(it || {}));
    const isLive = (it) => !(it?.voided ?? it?.isVoided ?? false);
    const missing = items.some((it, i) => isLive(it) && stored[i] === null);
    const type = resolveFooterDiscountType(header.billDiscountType, header.billDiscount, header.billDiscountAmount);
    if (missing) {
        return summarizeSalesItems(items, {
            type,
            value: type === FOOTER_DISCOUNT_TYPES.AMOUNT ? toNumber(header.billDiscountAmount) : toNumber(header.billDiscount),
        }, extras, vatMode);
    }

    const headerOnlyFooter = !stored.some((st) => st && st.footer !== null);
    const headerFooter = toNumber(header.billDiscountAmount);

    let grossTotal = 0;
    let itemDiscountTotal = 0;
    let preFooterTaxable = 0;
    let lineFooter = 0;
    let tax = 0;
    let lineSum = 0;
    let voidedTotal = 0;
    let voidedCount = 0;
    const lines = items.map((rawItem, i) => {
        const item = rawItem || {};
        const read = readSalesLine(item);
        const base = computeLineBase({ qty: read.qty, price: read.price, focQty: read.focQty, discPercent: read.disc });
        const st = stored[i];
        if (read.voided) {
            const total = st && st.total > 0 ? st.total : voidedLineNet(item, vatMode);
            voidedTotal += total;
            voidedCount += 1;
            return { ...base, share: 0, taxable: st ? st.total - st.tax : 0, tax: st ? st.tax : 0, total, voided: true, taxPercent: read.tax };
        }
        const share = headerOnlyFooter ? 0 : toNumber(st.footer);
        const taxable = st.taxable !== null ? st.taxable : round2(st.total - st.tax);
        grossTotal += base.gross;
        itemDiscountTotal += base.itemDiscount;
        preFooterTaxable += taxable + share;
        lineFooter += share;
        tax += st.tax;
        lineSum += st.total;
        return { ...base, share, taxable, tax: st.tax, total: st.total, voided: false, taxPercent: read.tax };
    });

    const footer = headerOnlyFooter ? headerFooter : lineFooter;
    const deliveryCharge = toNumber(extras.deliveryCharge);
    const roundOff = toNumber(extras.roundOff);
    // Header-only (POS): the bill discount was subtracted from the total, not from the lines.
    const linesNet = headerOnlyFooter ? lineSum - footer : lineSum;

    return {
        grossTotal: round2(grossTotal),
        itemDiscountTotal: round2(itemDiscountTotal),
        subTotal: round2(preFooterTaxable),
        footerDiscountTotal: round2(footer),
        billDiscountAmount: round2(footer),
        taxableTotal: round2(preFooterTaxable - footer),
        tax: round2(tax),
        deliveryCharge,
        roundOff,
        grandTotal: round2(linesNet + deliveryCharge + roundOff),
        voidedTotal: round2(voidedTotal),
        voidedCount,
        lines,
        storedValues: true,
        headerOnlyFooter,
        footerDiscType: type,
        footerDiscValue: type === FOOTER_DISCOUNT_TYPES.AMOUNT ? round2(footer) : toNumber(header.billDiscount),
    };
};

// Net value (taxable + tax, after item discount) a single line contributes — or,
// for a voided line, WOULD have contributed. Shared by every renderer so the
// per-line "-AED x" display and the "Voided Items" total agree. VAT-mode aware.
export const voidedLineNet = (item = {}, vatMode = VAT_MODES.EXCLUSIVE) => {
    const explicitLineTotal = hasValue(item.total ?? item.lineTotal ?? item.netAmount ?? item.net)
        ? toNumber(item.total ?? item.lineTotal ?? item.netAmount ?? item.net)
        : null;
    if (explicitLineTotal !== null && explicitLineTotal > 0) return explicitLineTotal;

    const qty = toNumber(item.qty ?? item.quantity);
    const price = toNumber(item.price);
    const discPct = toNumber(item.disc ?? item.discount ?? item.discountPercent ?? item.discPercent);
    const taxPercent = toNumber(item.tax ?? item.taxRate ?? item.taxPercent);
    const gross = qty * price;
    const netAfterDiscount = Math.max(0, gross - gross * (discPct / 100));
    const { taxableAmount, taxAmount } = computeLineTaxTotals({ netAfterDiscount, taxPercent, vatMode });
    return taxableAmount + taxAmount;
};

// Maps each item (by identity) to its allocation line in a summary computed over the SAME
// array — print paths filter blank rows first, so positional indexes would drift.
export const summaryLineLookup = (items = [], summary = {}) => {
    const byItem = new Map();
    items.forEach((it, i) => byItem.set(it, summary?.lines?.[i]));
    return (item) => byItem.get(item);
};

// Printed line money: the line's post-footer figures from the document summary (stored or
// live), so printed lines always reconcile with the printed totals.
export const printLineMoney = (line, item = {}) => (line
    ? { taxAmt: line.tax, total: line.total, taxableAmount: line.taxable, footerDiscount: line.share }
    : {
        taxAmt: toNumber(item.taxAmount ?? item.taxAmt),
        total: toNumber(item.netAmount ?? item.lineTotal ?? item.net ?? item.total),
    });

export const FOOTER_DISCOUNT_HELP ='Allocated across eligible lines based on their applicable line value and reflected in line taxable amounts and VAT.';

// The footer discount a SOURCE document (Quotation, Sales Order, Proforma, Invoice — API row
// or pre-fill state) carries, as { type, value } for a target editor. Every conversion and
// reload path uses this one resolver so the type and value are never silently lost or
// reinterpreted. The target then re-allocates over its own lines (intentional: its line
// composition may differ from the source's).
//   percent: value = billDiscount (the rate)
//   amount : value = billDiscountFixed (typed) || billDiscountAmount (stored money)
//   no type: an amount with no percentage is an older amount-only document (e.g. POS)
export const resolveSourceFooterDiscount = (src = {}) => {
    const source = src || {};
    const type = resolveFooterDiscountType(source.billDiscountType, source.billDiscount, source.billDiscountAmount);
    if (type === FOOTER_DISCOUNT_TYPES.AMOUNT) {
        const fixed = toNumber(source.billDiscountFixed);
        return { type, value: fixed > 0 ? fixed : toNumber(source.billDiscountAmount) };
    }
    return { type, value: toNumber(source.billDiscount) };
};

// Build the footer-discount descriptor expected by summarizeSalesItems.
export const makeFooterDiscount = (type, value) => ({ type: type === 'amount' ? 'amount' : 'percent', value: toNumber(value) });

// Allocate the footer discount across items with the shared allocator and return the
// items enriched with their authoritative per-line money (what the server will store):
//   allocatedFooterDiscount, footerAllocation { gross, itemDiscount, base, share, taxable, tax, total }
export const allocateFooterDiscount = (items = [], billDiscount = 0, vatMode = VAT_MODES.EXCLUSIVE) => {
    const allocation = allocateSalesDocument(items, normalizeFooter(billDiscount), vatMode);
    return items.map((item, idx) => ({
        ...item,
        allocatedFooterDiscount: allocation.lines[idx].share,
        footerAllocation: allocation.lines[idx],
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
