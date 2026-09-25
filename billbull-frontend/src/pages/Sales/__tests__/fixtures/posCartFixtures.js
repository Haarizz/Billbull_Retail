/**
 * Deterministic POS cart fixtures for the characterization suite.
 *
 * These describe what the CURRENT embedded POS does, not what it arguably should do.
 * Every field name here is one the production code actually reads:
 *
 *   - cart line shape  -> posUtils.computePosCartTotals / buildPosCheckoutItems
 *                         (price, quantity, discount, taxRate, isVoided, code,
 *                          productId, id, name, pinnedBatchNumber, serialNumber,
 *                          minPrice, maxPrice, cost)
 *   - posSettings      -> taxInclusive, taxEnabled, branchDefaultVatRate, voidMode
 *                         (posUtils.BRANCH_TAX_FIELDS documents that the first three
 *                          come from BranchTaxConfiguration, merged into posSettings)
 *
 * Nothing here invents a field. Amounts are chosen so the expected results are exact
 * in binary floating point wherever possible, and asserted with toBeCloseTo elsewhere.
 */

/** A cart line as POSSales holds it in currentInvoice.items. */
export const line = ({
  id,
  code = null,
  productId = null,
  name = 'Item',
  price,
  quantity,
  discount = 0,
  taxRate = null,
  isVoided = false,
  pinnedBatchNumber = null,
  serialNumber = null,
  minPrice = null,
  maxPrice = null,
  cost = null,
} = {}) => ({
  id,
  code,
  productId,
  name,
  price,
  quantity,
  discount,
  taxRate,
  isVoided,
  pinnedBatchNumber,
  serialNumber,
  minPrice,
  maxPrice,
  cost,
});

/**
 * Branch tax configuration as it is merged into posSettings.
 *
 * EXCLUSIVE is the default: the entered price is ex-VAT and tax is added on top.
 * INCLUSIVE means the entered price already contains VAT and it is extracted out.
 */
export const settings = ({
  taxInclusive = false,
  taxEnabled = true,
  branchDefaultVatRate = 5,
  voidMode = 'VOID',
} = {}) => ({ taxInclusive, taxEnabled, branchDefaultVatRate, voidMode });

export const EXCLUSIVE_5 = settings({ taxInclusive: false, branchDefaultVatRate: 5 });
export const INCLUSIVE_5 = settings({ taxInclusive: true, branchDefaultVatRate: 5 });
export const TAX_DISABLED = settings({ taxEnabled: false, branchDefaultVatRate: 5 });

/* ── Scenario A · Simple cash sale ──────────────────────────────────────────
 * Two lines, no discount, branch default 5% VAT exclusive. */
export const SCENARIO_A_SIMPLE_CASH = {
  name: 'A · simple cash sale, exclusive 5%',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'a1', code: 'SKU-100', name: 'Water 500ml', price: 2, quantity: 4, taxRate: 5 }),
    line({ id: 'a2', code: 'SKU-101', name: 'Bread', price: 6, quantity: 2, taxRate: 5 }),
  ],
};

/* ── Scenario B · Mixed-tax cart ────────────────────────────────────────────
 * Three lines at 5%, 0% and 12% in one cart, exclusive mode. */
export const SCENARIO_B_MIXED_TAX = {
  name: 'B · mixed tax rates in one cart, exclusive',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'b1', code: 'SKU-200', name: 'Standard rated', price: 100, quantity: 1, taxRate: 5 }),
    line({ id: 'b2', code: 'SKU-201', name: 'Zero rated', price: 50, quantity: 2, taxRate: 0 }),
    line({ id: 'b3', code: 'SKU-202', name: 'Higher rated', price: 25, quantity: 4, taxRate: 12 }),
  ],
};

/* ── Scenario C · Inclusive-tax pricing ─────────────────────────────────────
 * Entered price already carries 5% VAT; tax is extracted, not added. */
export const SCENARIO_C_INCLUSIVE = {
  name: 'C · inclusive 5% pricing',
  posSettings: INCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'c1', code: 'SKU-300', name: 'Inclusive item', price: 105, quantity: 1, taxRate: 5 }),
    line({ id: 'c2', code: 'SKU-301', name: 'Inclusive item 2', price: 21, quantity: 5, taxRate: 5 }),
  ],
};

/* ── Scenario D · Exclusive-tax pricing ─────────────────────────────────────
 * Same money, exclusive mode, so the total is the taxable base plus VAT. */
export const SCENARIO_D_EXCLUSIVE = {
  name: 'D · exclusive 5% pricing',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'd1', code: 'SKU-300', name: 'Exclusive item', price: 100, quantity: 1, taxRate: 5 }),
    line({ id: 'd2', code: 'SKU-301', name: 'Exclusive item 2', price: 20, quantity: 5, taxRate: 5 }),
  ],
};

/* ── Scenario E · Discounted item + bill discount ───────────────────────────
 * Line discount is a percentage OFF THE ENTERED PRICE; bill discount is a flat
 * subtraction applied after tax. */
export const SCENARIO_E_DISCOUNTED = {
  name: 'E · 20% line discount plus a flat bill discount, exclusive 5%',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 10,
  items: [
    line({ id: 'e1', code: 'SKU-400', name: 'Discounted', price: 200, quantity: 2, discount: 20, taxRate: 5 }),
    line({ id: 'e2', code: 'SKU-401', name: 'Undiscounted', price: 50, quantity: 1, taxRate: 5 }),
  ],
};

/* Same cart in INCLUSIVE mode — the comment in computePosCartTotals is explicit that
 * the discount is taken off the entered (VAT-carrying) price, not off the net. */
export const SCENARIO_E_DISCOUNTED_INCLUSIVE = {
  ...SCENARIO_E_DISCOUNTED,
  name: 'E-incl · same discounts under inclusive 5%',
  posSettings: INCLUSIVE_5,
};

/* ── Scenario F · Zero-rated item ───────────────────────────────────────────
 * taxRate explicitly 0 on the line — a deliberate 0 must be honoured and must NOT
 * fall back to the branch default. */
export const SCENARIO_F_ZERO_RATED = {
  name: 'F · zero-rated line in a 5% branch',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'f1', code: 'SKU-500', name: 'Zero rated', price: 80, quantity: 3, taxRate: 0 }),
  ],
};

/* ── Scenario G · Exempt item ───────────────────────────────────────────────
 * POS carries no separate EXEMPT flag: an exempt line is expressed as taxRate 0,
 * exactly like zero-rated. The distinction is not representable in the cart model. */
export const SCENARIO_G_EXEMPT = {
  name: 'G · exempt line, expressed as taxRate 0 (no separate exempt flag exists)',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'g1', code: 'SKU-600', name: 'Exempt supply', price: 250, quantity: 1, taxRate: 0 }),
    line({ id: 'g2', code: 'SKU-601', name: 'Standard rated', price: 100, quantity: 1, taxRate: 5 }),
  ],
};

/* ── Scenario H · Multiple-unit / unit-pricing sale ─────────────────────────
 * The cart stores a resolved per-unit price and a quantity; unit conversion happens
 * before the line reaches the cart (utils/unitPricing resolveUnitAmount). A CTN of 12
 * resolved to 36.00 is simply a line at price 36 quantity 2. */
export const SCENARIO_H_UNIT_PRICING = {
  name: 'H · carton pricing resolved to a per-unit line price',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'h1', code: 'SKU-700', name: 'Juice CTN(12)', price: 36, quantity: 2, taxRate: 5 }),
    line({ id: 'h2', code: 'SKU-700', name: 'Juice PCS', price: 3.25, quantity: 4, taxRate: 5 }),
  ],
};

/** Product master + conversion table for the unitPricing characterization. */
export const UNIT_PRICING_PRODUCT = {
  unitConversions: { PCS: 1, DOZ: 12, CTN: 24 },
  unitPrices: { PCS: 3 },
};

/* ── Scenario I · Cart containing a voided ("returned") line ────────────────
 * POS has no negative-quantity line in the cart. A line taken back out of the sale is
 * flagged isVoided: excluded from the totals, disclosed separately, and still posted. */
export const SCENARIO_I_VOIDED_LINE = {
  name: 'I · cart with a voided line',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'i1', code: 'SKU-800', name: 'Kept', price: 100, quantity: 1, taxRate: 5 }),
    line({
      id: 'i2',
      code: 'SKU-801',
      name: 'Voided',
      price: 40,
      quantity: 2,
      discount: 10,
      taxRate: 5,
      isVoided: true,
      pinnedBatchNumber: 'B-2026-01',
      serialNumber: 'SN-9',
    }),
  ],
};

/* ── Scenario J · Full checkout cart, for the payload characterization ──────
 * Carries batch, serial, a voided line and a line whose taxRate is unset so the
 * branch-default fallback is exercised. */
export const SCENARIO_J_CHECKOUT = {
  name: 'J · checkout payload cart',
  posSettings: EXCLUSIVE_5,
  billDiscountAmount: 0,
  items: [
    line({ id: 'j1', code: 'SKU-900', name: 'Batched', price: 30, quantity: 2, taxRate: 5, pinnedBatchNumber: 'BATCH-A' }),
    line({ id: 'j2', productId: 'PRD-901', name: 'Serialised', price: 500, quantity: 1, taxRate: 5, serialNumber: 'SN-001' }),
    line({ id: 'j3', name: 'No code, no taxRate', price: 12, quantity: 3 }),
    line({ id: 'j4', code: 'SKU-903', name: 'Voided w/ batch', price: 99, quantity: 1, taxRate: 5, isVoided: true, pinnedBatchNumber: 'BATCH-B', serialNumber: 'SN-002' }),
  ],
};
