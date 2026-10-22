// Footer-discount allocation — the browser mirror of the backend's
// sales/common/FooterDiscountAllocator.java. Both are pinned to the same fixtures
// (billbull-backend/src/test/resources/footer-discount-fixtures.json), so the live
// preview always equals what the server saves.
//
// Model (all money in whole cents, HALF_UP):
//   gross        = qty × price
//   focDeduction = price × focQtyInSellingUnit
//   preDiscount  = max(0, gross − focDeduction)
//   itemDiscount = min(preDiscount, preDiscount × disc%)
//   base         = preDiscount − itemDiscount   (VAT-inclusive under INCLUSIVE)
//   F            = amount: min(value, Σ eligible base) | percent: Σ eligible base × min(pct,100)%
//   share_i      = largest-remainder apportionment of F over eligible base_i (Σ share == F)
//   EXCLUSIVE: taxable = base − share; vat = taxable × r;   total = taxable + vat
//   INCLUSIVE: total = base − share;   taxable = total/(1+r); vat = total − taxable
// Under INCLUSIVE a fixed footer amount is customer-facing ("AED 100 off what you pay").

import { VAT_MODES } from './vatMath';

export const FOOTER_DISCOUNT_TYPES = { PERCENT: 'percent', AMOUNT: 'amount' };

const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};

// HALF_UP to an integer, tolerant of binary float noise (e.g. 100.49999999999999 → 101).
const roundHalfUp = (x) => {
    const sign = x < 0 ? -1 : 1;
    return sign * Math.round(Number(Math.abs(x).toFixed(6)));
};

const toCents = (amount) => roundHalfUp(num(amount) * 100);
const fromCents = (cents) => Number(cents) / 100;
const clampPercent = (pct) => Math.min(100, Math.max(0, num(pct)));

/** "amount" wins when explicit; with no type, an amount and no percentage means an older amount-only document. */
export const resolveFooterDiscountType = (rawType, percent, amount) => {
    if (rawType !== null && rawType !== undefined && String(rawType).trim() !== '') {
        return String(rawType).trim().toLowerCase() === 'amount' ? FOOTER_DISCOUNT_TYPES.AMOUNT : FOOTER_DISCOUNT_TYPES.PERCENT;
    }
    return !(num(percent) > 0) && num(amount) > 0 ? FOOTER_DISCOUNT_TYPES.AMOUNT : FOOTER_DISCOUNT_TYPES.PERCENT;
};

/** FOC in selling units: foc × conv(focUnit) / conv(sellingUnit); a blank FOC unit is the selling unit. */
export const focInSellingUnit = (foc, sellingUnit, focUnit, unitConversions = {}) => {
    const f = num(foc);
    if (f <= 0) return 0;
    if (!focUnit || !sellingUnit || String(focUnit).trim().toLowerCase() === String(sellingUnit).trim().toLowerCase()) {
        return f;
    }
    const conv = unitConversions || {};
    const focConv = num(conv[focUnit]) > 0 ? num(conv[focUnit]) : 1;
    const sellConv = num(conv[sellingUnit]) > 0 ? num(conv[sellingUnit]) : 1;
    return Number(((f * focConv) / sellConv).toFixed(6));
};

/** A line's money before any footer discount (numbers, 2 dp). */
export const computeLineBase = ({ qty, price, focQty = 0, discPercent = 0 }) => {
    const p = num(price);
    const grossC = toCents(num(qty) * p);
    const focC = Math.max(0, toCents(p * num(focQty)));
    const preC = Math.max(0, grossC - focC);
    const itemDiscC = Math.min(preC, roundHalfUp((preC * clampPercent(discPercent)) / 100));
    return {
        gross: fromCents(grossC),
        focDeduction: fromCents(focC),
        itemDiscount: fromCents(itemDiscC),
        base: fromCents(preC - itemDiscC),
    };
};

const footerCents = (type, value, eligibleBaseC) => {
    const v = num(value);
    if (v <= 0 || eligibleBaseC <= 0) return 0;
    if (type === FOOTER_DISCOUNT_TYPES.AMOUNT) return Math.min(toCents(v), eligibleBaseC);
    return Math.min(roundHalfUp((eligibleBaseC * clampPercent(v)) / 100), eligibleBaseC);
};

/**
 * @param lines   [{ base, taxPercent, eligible }]
 * @param footer  { type: 'percent'|'amount', value }
 * @returns { footerAmount, lines:[{ base, share, taxable, tax, total, eligible }], baseTotal, taxableTotal, taxTotal, lineTotal, subTotal }
 */
export const allocateFooterDiscountLines = (lines = [], footer = {}, vatMode = VAT_MODES.EXCLUSIVE) => {
    const inclusive = vatMode === VAT_MODES.INCLUSIVE;
    const type = footer?.type === FOOTER_DISCOUNT_TYPES.AMOUNT ? FOOTER_DISCOUNT_TYPES.AMOUNT : FOOTER_DISCOUNT_TYPES.PERCENT;
    const baseC = lines.map((l) => Math.max(0, toCents(l.base)));
    const eligible = lines.map((l) => l.eligible !== false);
    const eligibleBaseC = baseC.reduce((s, b, i) => (eligible[i] ? s + b : s), 0);
    const fC = footerCents(type, footer?.value, eligibleBaseC);

    // Largest-remainder apportionment in exact integer (BigInt) arithmetic.
    const shareC = baseC.map(() => 0);
    if (fC > 0 && eligibleBaseC > 0) {
        const F = BigInt(fC);
        const S = BigInt(eligibleBaseC);
        const rems = [];
        let allocated = 0;
        baseC.forEach((b, i) => {
            if (!eligible[i]) return;
            const prod = F * BigInt(b);
            shareC[i] = Number(prod / S);
            allocated += shareC[i];
            rems.push({ i, rem: prod % S, base: b });
        });
        rems.sort((a, b) => {
            if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1;
            if (a.base !== b.base) return b.base - a.base;
            return a.i - b.i;
        });
        const leftover = fC - allocated;
        for (let k = 0; k < leftover && k < rems.length; k += 1) shareC[rems[k].i] += 1;
    }

    let taxableTotalC = 0;
    let taxTotalC = 0;
    let lineTotalC = 0;
    const out = lines.map((l, i) => {
        const rate = Math.max(0, num(l.taxPercent));
        const remainingC = baseC[i] - shareC[i];
        let taxableC;
        let taxC;
        let totalC;
        if (inclusive) {
            totalC = remainingC;
            taxableC = roundHalfUp((remainingC * 100) / (100 + rate));
            taxC = totalC - taxableC;
        } else {
            taxableC = remainingC;
            taxC = roundHalfUp((taxableC * rate) / 100);
            totalC = taxableC + taxC;
        }
        if (eligible[i]) {
            taxableTotalC += taxableC;
            taxTotalC += taxC;
            lineTotalC += totalC;
        }
        return {
            base: fromCents(baseC[i]),
            share: fromCents(shareC[i]),
            taxable: fromCents(taxableC),
            tax: fromCents(taxC),
            total: fromCents(totalC),
            eligible: eligible[i],
        };
    });

    return {
        footerAmount: fromCents(fC),
        lines: out,
        baseTotal: fromCents(eligibleBaseC),
        taxableTotal: fromCents(taxableTotalC),
        taxTotal: fromCents(taxTotalC),
        lineTotal: fromCents(lineTotalC),
        // Header sub-total under the BillBull convention: Σ(taxable + share).
        subTotal: fromCents(taxableTotalC + fC),
    };
};

/** Reads the primitive inputs of a sales line in any of the shapes the pages use (editor rows or API rows). */
export const readSalesLine = (item = {}) => {
    const unit = item.unit || item.uom || 'PCS';
    return {
        qty: num(item.qty ?? item.quantity),
        price: num(item.price),
        disc: num(item.disc ?? item.discount ?? item.discountPercent ?? item.discPercent),
        tax: num(item.tax ?? item.taxRate ?? item.taxPercent),
        focQty: focInSellingUnit(item.foc ?? item.focQty, unit, item.focUnit, item.unitConversions),
        voided: Boolean(item.voided ?? item.isVoided ?? false),
    };
};

/**
 * Full live allocation of a sales document from its lines' primitive inputs.
 * Each returned line carries gross, itemDiscount, base, share, taxable, tax, total.
 */
export const allocateSalesDocument = (items = [], footer = {}, vatMode = VAT_MODES.EXCLUSIVE) => {
    const read = items.map((it) => readSalesLine(it || {}));
    const bases = read.map((r) => computeLineBase({ qty: r.qty, price: r.price, focQty: r.focQty, discPercent: r.disc }));
    const result = allocateFooterDiscountLines(
        bases.map((b, i) => ({ base: b.base, taxPercent: read[i].tax, eligible: !read[i].voided })),
        footer,
        vatMode,
    );
    return {
        ...result,
        lines: result.lines.map((l, i) => ({
            ...l,
            gross: bases[i].gross,
            focDeduction: bases[i].focDeduction,
            itemDiscount: bases[i].itemDiscount,
            taxPercent: read[i].tax,
            voided: read[i].voided,
        })),
    };
};
