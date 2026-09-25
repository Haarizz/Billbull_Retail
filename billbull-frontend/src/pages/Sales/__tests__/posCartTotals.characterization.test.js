import { describe, expect, it } from 'vitest';

import {
  computePosCartTotals,
  getPosVatLabel,
  getCartPriceWarning,
  getPriceFloor,
  mergeSavedPosSettings,
  toNumber,
} from '../POS/posUtils';
import { computeLineTaxTotals, resolveLineTaxRate, VAT_MODES } from '../../../utils/vatMath';
import { resolveUnitAmount, getBaseUnitName, getUnitConversionFactor } from '../../../utils/unitPricing';
import {
  EXCLUSIVE_5,
  INCLUSIVE_5,
  TAX_DISABLED,
  SCENARIO_A_SIMPLE_CASH,
  SCENARIO_B_MIXED_TAX,
  SCENARIO_C_INCLUSIVE,
  SCENARIO_D_EXCLUSIVE,
  SCENARIO_E_DISCOUNTED,
  SCENARIO_E_DISCOUNTED_INCLUSIVE,
  SCENARIO_F_ZERO_RATED,
  SCENARIO_G_EXEMPT,
  SCENARIO_H_UNIT_PRICING,
  SCENARIO_I_VOIDED_LINE,
  SCENARIO_J_CHECKOUT,
  UNIT_PRICING_PRODUCT,
  line,
} from './fixtures/posCartFixtures';

/**
 * CHARACTERIZATION SUITE — POS cart arithmetic.
 *
 * Locks down what posUtils.computePosCartTotals does TODAY so the standalone-POS
 * extraction can be proven behaviour-preserving. Every expectation below was derived
 * from the current implementation, not from an independent view of what the totals
 * ought to be. Where the current behaviour looks questionable it is asserted as-is and
 * annotated CHARACTERIZED QUIRK — production behaviour is deliberately unchanged.
 *
 * computePosCartTotals is the single formula every cart mutation lands on: add from
 * grid, barcode scan, qty change, discount, void and remove all route through
 * POSSales.recalculateInvoice, which is a direct call to this function.
 */

const totalsOf = (scenario) =>
  computePosCartTotals(scenario.items, scenario.billDiscountAmount, scenario.posSettings);

describe('computePosCartTotals — scenario A · simple cash sale (exclusive 5%)', () => {
  it('adds VAT on top of the entered price', () => {
    const t = totalsOf(SCENARIO_A_SIMPLE_CASH);

    expect(t.subtotal).toBeCloseTo(20, 6);        // 2x4 + 6x2
    expect(t.totalDiscount).toBeCloseTo(0, 6);
    expect(t.tax).toBeCloseTo(1, 6);              // 5% of 20
    expect(t.total).toBeCloseTo(21, 6);           // 20 + 1
    expect(t.billDiscountAmount).toBe(0);
    expect(t.taxInclusive).toBe(false);
    expect(t.voidedCount).toBe(0);
    expect(t.voidedTotal).toBeCloseTo(0, 6);
  });

  it('returns the same items array reference it was given', () => {
    // The component spreads this straight into currentInvoice, so identity matters
    // to the render path.
    const t = totalsOf(SCENARIO_A_SIMPLE_CASH);
    expect(t.items).toBe(SCENARIO_A_SIMPLE_CASH.items);
  });
});

describe('computePosCartTotals — scenario B · mixed-tax cart', () => {
  it('taxes each line at its own rate and sums them', () => {
    const t = totalsOf(SCENARIO_B_MIXED_TAX);

    expect(t.subtotal).toBeCloseTo(300, 6);       // 100 + 100 + 100
    expect(t.tax).toBeCloseTo(17, 6);             // 5 + 0 + 12
    expect(t.total).toBeCloseTo(317, 6);
  });

  it('labels the VAT row generically when rates differ, and by rate when they agree', () => {
    const mixed = totalsOf(SCENARIO_B_MIXED_TAX);
    expect(getPosVatLabel(mixed, EXCLUSIVE_5)).toBe('VAT');

    const single = totalsOf(SCENARIO_A_SIMPLE_CASH);
    expect(getPosVatLabel(single, EXCLUSIVE_5)).toBe('VAT (5%)');

    const inclusive = totalsOf(SCENARIO_C_INCLUSIVE);
    expect(getPosVatLabel(inclusive, INCLUSIVE_5)).toBe('VAT (5%) incl.');
  });
});

describe('computePosCartTotals — scenarios C and D · inclusive vs exclusive pricing', () => {
  it('extracts VAT out of the entered price in inclusive mode', () => {
    const t = totalsOf(SCENARIO_C_INCLUSIVE);

    expect(t.subtotal).toBeCloseTo(210, 6);       // 105 + 21x5, VAT-carrying
    expect(t.tax).toBeCloseTo(10, 6);             // extracted: 210 - 210/1.05
    expect(t.total).toBeCloseTo(210, 6);          // tax NOT added again
    expect(t.taxInclusive).toBe(true);
  });

  it('adds VAT on top of the entered price in exclusive mode', () => {
    const t = totalsOf(SCENARIO_D_EXCLUSIVE);

    expect(t.subtotal).toBeCloseTo(200, 6);       // ex-VAT base
    expect(t.tax).toBeCloseTo(10, 6);
    expect(t.total).toBeCloseTo(210, 6);          // 200 + 10
  });

  it('reaches the same grand total and the same tax from equivalent prices', () => {
    const inc = totalsOf(SCENARIO_C_INCLUSIVE);
    const exc = totalsOf(SCENARIO_D_EXCLUSIVE);

    expect(inc.total).toBeCloseTo(exc.total, 6);
    expect(inc.tax).toBeCloseTo(exc.tax, 6);
    // ...but the SUBTOTAL differs by the VAT, because subtotal is always the gross
    // entered line value, never a normalised ex-VAT base.
    expect(inc.subtotal).not.toBeCloseTo(exc.subtotal, 6);
  });
});

describe('computePosCartTotals — scenario E · discounts', () => {
  it('takes the line discount off the entered price, then taxes the remainder', () => {
    const t = totalsOf(SCENARIO_E_DISCOUNTED);

    expect(t.subtotal).toBeCloseTo(450, 6);       // 200x2 + 50, gross before discount
    expect(t.totalDiscount).toBeCloseTo(80, 6);   // 20% of 400 — off the entered price
    expect(t.tax).toBeCloseTo(18.5, 6);           // 5% of (320 + 50)
    expect(t.total).toBeCloseTo(378.5, 6);        // 450 - 80 - 10 bill + 18.5
    expect(t.billDiscountAmount).toBe(10);
  });

  it('keeps the discount off the gross price under inclusive VAT too', () => {
    // The implementation comment is explicit: discounting an already-VAT-stripped net
    // would deflate the discount by the VAT divisor (80 -> 76.19) and desync the cart
    // preview from the back-office and printed totals.
    const t = totalsOf(SCENARIO_E_DISCOUNTED_INCLUSIVE);

    expect(t.totalDiscount).toBeCloseTo(80, 6);   // not 76.19
    expect(t.tax).toBeCloseTo(17.61904761904762, 6);
    expect(t.total).toBeCloseTo(360, 6);          // 450 - 80 - 10, tax not re-added
  });

  it('subtracts the bill discount flat in both VAT modes', () => {
    const noBill = computePosCartTotals(SCENARIO_E_DISCOUNTED.items, 0, EXCLUSIVE_5);
    const withBill = computePosCartTotals(SCENARIO_E_DISCOUNTED.items, 10, EXCLUSIVE_5);
    expect(noBill.total - withBill.total).toBeCloseTo(10, 6);

    const noBillInc = computePosCartTotals(SCENARIO_E_DISCOUNTED.items, 0, INCLUSIVE_5);
    const withBillInc = computePosCartTotals(SCENARIO_E_DISCOUNTED.items, 10, INCLUSIVE_5);
    expect(noBillInc.total - withBillInc.total).toBeCloseTo(10, 6);
  });

  it('clamps the total at zero rather than going negative', () => {
    const t = computePosCartTotals(
      [line({ id: 'x', price: 10, quantity: 1, taxRate: 0 })],
      9999,
      EXCLUSIVE_5,
    );
    expect(t.total).toBe(0);
    // CHARACTERIZED QUIRK: the clamp hides the over-discount. subtotal/totalDiscount
    // still report the un-clamped figures, so a caller summing them will not agree
    // with `total`. Left as-is.
    expect(t.subtotal).toBeCloseTo(10, 6);
    expect(t.billDiscountAmount).toBe(9999);
  });
});

describe('computePosCartTotals — scenarios F and G · zero-rated and exempt', () => {
  it('honours an explicit 0% line rate instead of falling back to the branch default', () => {
    const t = totalsOf(SCENARIO_F_ZERO_RATED);

    expect(t.subtotal).toBeCloseTo(240, 6);
    expect(t.tax).toBeCloseTo(0, 6);
    expect(t.total).toBeCloseTo(240, 6);
  });

  it('treats an exempt line exactly like a zero-rated one', () => {
    const t = totalsOf(SCENARIO_G_EXEMPT);

    expect(t.subtotal).toBeCloseTo(350, 6);
    expect(t.tax).toBeCloseTo(5, 6);              // only the standard-rated line
    expect(t.total).toBeCloseTo(355, 6);
  });

  it('CHARACTERIZED GAP: the cart model cannot distinguish zero-rated from exempt', () => {
    // Both are simply taxRate 0. There is no exempt/zero-rated flag on a POS cart line,
    // so a VAT return that must report the two separately cannot be derived from the
    // cart alone. Documented, not changed.
    const zeroRated = computePosCartTotals(
      [line({ id: 'z', price: 100, quantity: 1, taxRate: 0 })], 0, EXCLUSIVE_5,
    );
    const exempt = computePosCartTotals(
      [line({ id: 'e', price: 100, quantity: 1, taxRate: 0 })], 0, EXCLUSIVE_5,
    );
    expect(zeroRated.tax).toBe(exempt.tax);
    expect(zeroRated.total).toBe(exempt.total);
  });
});

describe('computePosCartTotals — scenario H · multiple units', () => {
  it('treats a converted carton line as an ordinary per-unit line', () => {
    const t = totalsOf(SCENARIO_H_UNIT_PRICING);

    expect(t.subtotal).toBeCloseTo(85, 6);        // 36x2 + 3.25x4
    expect(t.tax).toBeCloseTo(4.25, 6);
    expect(t.total).toBeCloseTo(89.25, 6);
  });

  it('resolves a carton price from the base unit before it reaches the cart', () => {
    // Unit conversion happens in utils/unitPricing at add-to-cart time; the cart itself
    // only ever sees a resolved unit price.
    const ctn = resolveUnitAmount({
      targetUnit: 'CTN',
      amountMap: UNIT_PRICING_PRODUCT.unitPrices,
      unitConversions: UNIT_PRICING_PRODUCT.unitConversions,
      currentUnit: 'PCS',
    });
    expect(ctn).toBeCloseTo(72, 6);               // 3 x 24

    const doz = resolveUnitAmount({
      targetUnit: 'DOZ',
      amountMap: UNIT_PRICING_PRODUCT.unitPrices,
      unitConversions: UNIT_PRICING_PRODUCT.unitConversions,
      currentUnit: 'PCS',
    });
    expect(doz).toBeCloseTo(36, 6);               // 3 x 12
  });

  it('prefers a directly configured unit price over a converted one', () => {
    const direct = resolveUnitAmount({
      targetUnit: 'CTN',
      amountMap: { PCS: 3, CTN: 70 },             // carton discounted below 3 x 24
      unitConversions: UNIT_PRICING_PRODUCT.unitConversions,
      currentUnit: 'PCS',
    });
    expect(direct).toBe(70);
  });

  it('identifies the base unit as the one with conversion factor 1', () => {
    expect(getBaseUnitName(UNIT_PRICING_PRODUCT.unitConversions, 'PCS')).toBe('PCS');
    expect(getUnitConversionFactor(UNIT_PRICING_PRODUCT.unitConversions, 'CTN')).toBe(24);
    expect(getUnitConversionFactor(UNIT_PRICING_PRODUCT.unitConversions, 'UNKNOWN')).toBe(1);
  });
});

describe('computePosCartTotals — scenario I · voided lines', () => {
  it('excludes voided lines from every total but discloses them separately', () => {
    const t = totalsOf(SCENARIO_I_VOIDED_LINE);

    expect(t.subtotal).toBeCloseTo(100, 6);       // voided 40x2 not counted
    expect(t.tax).toBeCloseTo(5, 6);
    expect(t.total).toBeCloseTo(105, 6);
    expect(t.voidedCount).toBe(1);
    expect(t.voidedTotal).toBeCloseTo(72, 6);     // 40 x 2 x (1 - 10%)
  });

  it('values a voided line net of its discount but ignores VAT', () => {
    // voidedTotal uses qty x price x (1 - discount), with no tax term in either VAT
    // mode — it mirrors the cart row's line-total cell, not the taxed line value.
    const exclusive = computePosCartTotals(SCENARIO_I_VOIDED_LINE.items, 0, EXCLUSIVE_5);
    const inclusive = computePosCartTotals(SCENARIO_I_VOIDED_LINE.items, 0, INCLUSIVE_5);
    expect(exclusive.voidedTotal).toBeCloseTo(inclusive.voidedTotal, 6);
  });
});

describe('computePosCartTotals — tax rate resolution and fallbacks', () => {
  it('CHARACTERIZED QUIRK: a null line taxRate resolves to 0%, not to the branch default', () => {
    // toNumber() is Number.isFinite-based and Number(null) === 0, which is finite —
    // so the branch-default fallback is only reached for undefined / NaN, never for
    // null or an empty string. A line stored with taxRate: null is therefore silently
    // untaxed in a 5% branch.
    expect(toNumber(null, 5)).toBe(0);
    expect(toNumber('', 5)).toBe(0);
    expect(toNumber(undefined, 5)).toBe(5);
    expect(toNumber(NaN, 5)).toBe(5);

    const nullRate = computePosCartTotals(
      [line({ id: 'n', price: 100, quantity: 1, taxRate: null })], 0, EXCLUSIVE_5,
    );
    expect(nullRate.tax).toBeCloseTo(0, 6);

    const undefinedRate = computePosCartTotals(
      [{ id: 'u', price: 100, quantity: 1, discount: 0 }], 0, EXCLUSIVE_5,
    );
    expect(undefinedRate.tax).toBeCloseTo(5, 6); // branch default applied
  });

  it('CHARACTERIZED QUIRK: Tax Enabled = false only zeroes the fallback, not explicit line rates', () => {
    // The kill switch is applied when the line is ADDED (resolveLineTaxRate returns 0
    // outright). computePosCartTotals only consults it for the fallback, so lines that
    // already carry an explicit rate keep being taxed if the branch switch is flipped
    // off while a cart is open.
    const explicit = computePosCartTotals(
      [line({ id: 'k', price: 100, quantity: 1, taxRate: 5 })], 0, TAX_DISABLED,
    );
    expect(explicit.tax).toBeCloseTo(5, 6);

    const fallback = computePosCartTotals(
      [{ id: 'k2', price: 100, quantity: 1, discount: 0 }], 0, TAX_DISABLED,
    );
    expect(fallback.tax).toBeCloseTo(0, 6);
  });

  it('applies resolveLineTaxRate precedence at add-to-cart time', () => {
    // 0. taxEnabled === false is the outright kill switch, checked first.
    expect(resolveLineTaxRate({ salesTax: 5 }, 5, false)).toBe(0);
    // 1. an explicit product rate always wins, including a deliberate 0.
    expect(resolveLineTaxRate({ salesTax: 12 }, 5, true)).toBe(12);
    expect(resolveLineTaxRate({ salesTax: 0 }, 5, true)).toBe(0);
    // 2. branch default when the product carries none.
    expect(resolveLineTaxRate({ salesTax: null }, 5, true)).toBe(5);
    expect(resolveLineTaxRate({ salesTax: '' }, 5, true)).toBe(5);
    // 3. 0% when neither is configured.
    expect(resolveLineTaxRate({}, null, true)).toBe(0);
    // `tax` is accepted as an alias for `salesTax`.
    expect(resolveLineTaxRate({ tax: 7 }, 5, true)).toBe(7);
  });

  it('agrees with the shared vatMath line formula for a single line', () => {
    // computePosCartTotals is a cart-level reimplementation of the same rule that
    // vatMath.computeLineTaxTotals applies per line. Locking them together here means
    // a later divergence between the two shows up as a failure rather than as a
    // mismatched receipt.
    const cart = computePosCartTotals(
      [line({ id: 'v', price: 200, quantity: 2, discount: 20, taxRate: 5 })], 0, EXCLUSIVE_5,
    );
    const shared = computeLineTaxTotals({
      netAfterDiscount: 320, taxPercent: 5, vatMode: VAT_MODES.EXCLUSIVE,
    });
    expect(cart.tax).toBeCloseTo(shared.taxAmount, 6);
    expect(cart.total).toBeCloseTo(shared.total, 6);

    const cartInc = computePosCartTotals(
      [line({ id: 'v2', price: 200, quantity: 2, discount: 20, taxRate: 5 })], 0, INCLUSIVE_5,
    );
    const sharedInc = computeLineTaxTotals({
      netAfterDiscount: 320, taxPercent: 5, vatMode: VAT_MODES.INCLUSIVE,
    });
    expect(cartInc.tax).toBeCloseTo(sharedInc.taxAmount, 6);
    expect(cartInc.total).toBeCloseTo(sharedInc.total, 6);
  });
});

describe('computePosCartTotals — degenerate inputs', () => {
  it('returns zeroes for an empty cart', () => {
    const t = computePosCartTotals([], 0, EXCLUSIVE_5);
    expect(t.subtotal).toBe(0);
    expect(t.totalDiscount).toBe(0);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(0);
    expect(t.voidedCount).toBe(0);
  });

  it('defaults to exclusive 0% when no posSettings are supplied', () => {
    const t = computePosCartTotals([line({ id: 'd', price: 100, quantity: 1 })], 0, null);
    expect(t.taxInclusive).toBe(false);
    expect(t.tax).toBeCloseTo(0, 6);
    expect(t.total).toBeCloseTo(100, 6);
  });

  it('CHARACTERIZED QUIRK: a fractional quantity is carried straight into the line value', () => {
    // POS allows weighed items, so this is intended — but note the result is not
    // rounded to 2dp anywhere in the cart. Rounding happens only at display and in
    // the payment adapter.
    const t = computePosCartTotals(
      [line({ id: 'w', price: 13.33, quantity: 0.375, taxRate: 5 })], 0, EXCLUSIVE_5,
    );
    expect(t.subtotal).toBeCloseTo(4.99875, 8);
    expect(t.total).toBeCloseTo(5.2486875, 8);
    // The un-rounded value really is carried, not snapped to 5.25.
    expect(t.total).not.toBe(5.25);
  });
});

describe('cart price-floor warnings', () => {
  it('uses minPrice as the floor, falling back to cost when minPrice is unset', () => {
    expect(getPriceFloor(10, 4)).toBe(10);
    expect(getPriceFloor(null, 4)).toBe(4);
    expect(getPriceFloor(0, 4)).toBe(4);
    expect(getPriceFloor(null, null)).toBe(null);
  });

  it('flags a discounted price that falls below the floor', () => {
    const warn = getCartPriceWarning(
      line({ id: 'p', price: 100, quantity: 1, discount: 60, minPrice: 50 }),
    );
    expect(warn).toEqual({ level: 'error', message: 'Below min price (50)' });
  });

  it('flags a price above maxPrice as informational only', () => {
    const warn = getCartPriceWarning(
      line({ id: 'p', price: 200, quantity: 1, maxPrice: 150 }),
    );
    expect(warn.level).toBe('warn');
  });

  it('never warns on a voided line', () => {
    expect(getCartPriceWarning(
      line({ id: 'p', price: 1, quantity: 1, minPrice: 50, isVoided: true }),
    )).toBe(null);
  });
});

describe('posSettings merge on save', () => {
  it('carries the branch tax fields through a PosSettings save response', () => {
    // The saved PosSettings row has no tax fields; assigning it directly would drop
    // them and silently send the cart back to Exclusive / 0%.
    const merged = mergeSavedPosSettings(
      { taxEnabled: true, taxInclusive: true, branchDefaultVatRate: 5, voidMode: 'VOID' },
      { voidMode: 'DELETE', defaultLayout: 'compact' },
    );
    expect(merged.taxInclusive).toBe(true);
    expect(merged.taxEnabled).toBe(true);
    expect(merged.branchDefaultVatRate).toBe(5);
    expect(merged.voidMode).toBe('DELETE');
    expect(merged.defaultLayout).toBe('compact');
  });
});

describe('regression guard — the full scenario matrix', () => {
  // One place to see every scenario's financial outcome. If the extraction changes any
  // of these numbers, this is the test that says so first.
  const matrix = [
    [SCENARIO_A_SIMPLE_CASH, { subtotal: 20, totalDiscount: 0, tax: 1, total: 21 }],
    [SCENARIO_B_MIXED_TAX, { subtotal: 300, totalDiscount: 0, tax: 17, total: 317 }],
    [SCENARIO_C_INCLUSIVE, { subtotal: 210, totalDiscount: 0, tax: 10, total: 210 }],
    [SCENARIO_D_EXCLUSIVE, { subtotal: 200, totalDiscount: 0, tax: 10, total: 210 }],
    [SCENARIO_E_DISCOUNTED, { subtotal: 450, totalDiscount: 80, tax: 18.5, total: 378.5 }],
    [SCENARIO_E_DISCOUNTED_INCLUSIVE, { subtotal: 450, totalDiscount: 80, tax: 17.61904761904762, total: 360 }],
    [SCENARIO_F_ZERO_RATED, { subtotal: 240, totalDiscount: 0, tax: 0, total: 240 }],
    [SCENARIO_G_EXEMPT, { subtotal: 350, totalDiscount: 0, tax: 5, total: 355 }],
    [SCENARIO_H_UNIT_PRICING, { subtotal: 85, totalDiscount: 0, tax: 4.25, total: 89.25 }],
    [SCENARIO_I_VOIDED_LINE, { subtotal: 100, totalDiscount: 0, tax: 5, total: 105 }],
    [SCENARIO_J_CHECKOUT, { subtotal: 596, totalDiscount: 0, tax: 28, total: 624 }],
  ];

  it.each(matrix)('$0.name produces the recorded totals', (scenario, expected) => {
    const t = totalsOf(scenario);
    expect(t.subtotal).toBeCloseTo(expected.subtotal, 6);
    expect(t.totalDiscount).toBeCloseTo(expected.totalDiscount, 6);
    expect(t.tax).toBeCloseTo(expected.tax, 6);
    expect(t.total).toBeCloseTo(expected.total, 6);
  });
});
