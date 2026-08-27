import { getImageUrl } from '../../../utils/urlUtils';

export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const mapPosProductListItem = (d = {}) => ({
  id: d.id,
  code: d.code || '',
  name: d.name || d.shortDesc || 'Unnamed Product',
  nameAr: d.localName || '',
  barcode: d.barcode || d.packings?.find(p => p?.barcode)?.barcode || d.code || '',
  price: toNumber(d.retailPrice ?? d.maxPrice ?? d.minPrice ?? d.onlinePrice ?? 0),
  // Kept alongside `price` (rather than folded into it) so the POS cart can warn
  // the cashier when a line's price is edited outside this range. retailPrice is
  // kept too because PosCheckoutController's §2.4 gate falls back to it as the
  // floor when minPrice isn't set — getCartPriceWarning below mirrors that.
  minPrice: d.minPrice != null && d.minPrice !== '' ? toNumber(d.minPrice) : null,
  maxPrice: d.maxPrice != null && d.maxPrice !== '' ? toNumber(d.maxPrice) : null,
  retailPrice: d.retailPrice != null && d.retailPrice !== '' ? toNumber(d.retailPrice) : null,
  cost: d.cost != null && d.cost !== '' ? toNumber(d.cost) : null,
  stock: toNumber(d.stock ?? 0),
  image: d.image ? getImageUrl(d.image) : null,
  departmentId: d.departmentId || null,
  departmentName: d.departmentName || '',
  productType: d.productType || '',
  salesTax: (d.salesTax != null && d.salesTax !== '') ? toNumber(d.salesTax) : null,
  defaultDiscount: toNumber(d.maxDiscount ?? d.defaultDiscount, 0),
  // Inventory control flags — drive POS one-batch-one-unit enforcement.
  // The /api/products/list and /api/pos/resolve payloads both carry these.
  isBatch: Boolean(d.isBatch),
  isSerial: Boolean(d.isSerial),
  fefoEnabled: Boolean(d.fefoEnabled),
  availableInPos: d.availableInPos ?? true,
});

export const mapPosProductAggregateItem = (entry = {}, scannedBarcode = '') => {
  const product = entry.product || entry;
  const pricing = entry.effectivePricing || entry.activeBranchPrice || entry.pricing || product.pricing || {};
  return mapPosProductListItem({
    id: product.id,
    code: product.code,
    name: product.name,
    localName: product.localName,
    barcode: scannedBarcode || product.barcode,
    retailPrice: pricing.retailPrice,
    maxPrice: pricing.maxPrice,
    minPrice: pricing.minPrice,
    onlinePrice: pricing.onlinePrice,
    cost: pricing.cost,
    stock: entry.stock ?? product.stock,
    image: entry.primaryImage || entry.image,
    departmentId: product.department?.id,
    departmentName: product.department?.name,
    productType: product.productType,
    salesTax: entry.tax?.salesTax ?? product.tax?.salesTax,
    maxDiscount: product.maxDiscount,
    isBatch: product.isBatch,
    isSerial: product.isSerial,
    fefoEnabled: product.fefoEnabled,
    availableInPos: product.availableInPos ?? true,
  });
};

export const mapPosCustomer = (customer = {}) => ({
  id: String(customer.id ?? customer.code ?? customer.customerCode ?? ''),
  code: customer.code || customer.customerCode || '',
  name: customer.name || customer.customerName || customer.fullName || 'Unnamed Customer',
  phone: customer.phone || customer.mobile || customer.mobileNo || '',
  email: customer.email || '',
  // Tax Registration Number — printed in the receipt CUSTOMER block (both
  // templates) whenever the customer record carries one.
  trn: customer.trn || '',
  // The customer's address on file — the default entry of their Shipping
  // Address tab, denormalised onto defaultShippingAddress by the backend. Used
  // to pre-fill the POS delivery dialog (cashier can still override) and to
  // print the Address row in the receipt's CUSTOMER block.
  address: customer.defaultShippingAddress
    || customer.address
    || customer.shippingAddress
    || customer.city
    || '',
  balance: toNumber(customer.currentBalance ?? customer.balance ?? 0),
  membershipId: customer.membershipId || customer.code || customer.customerCode || '',
  tier: customer.priceList || customer.groupType || customer.group || '',
  loyaltyPoints: toNumber(customer.loyaltyPoints ?? 0),
  // Full list of saved shipping addresses, so the delivery dialog can offer a
  // picker instead of just the single default address above.
  savedAddresses: Array.isArray(customer.savedAddresses) ? customer.savedAddresses : [],
});

// Non-blocking cart-line warning: below-floor mirrors the backend §2.4 checkout
// gate (PosCheckoutController) which hard-blocks the sale unless the user holds
// pos_price_override — surfacing it here lets the cashier fix the price before
// Settle Payment instead of hitting that 403 cold. The floor is minPrice, but
// when minPrice isn't set the backend falls back to cost as the floor.
// (see PosCheckoutController §2.4) — mirrored here so a product with no minPrice
// configured still warns instead of going silent. Above maxPrice is
// informational only; the backend never blocks on it.
// Shared with the cart-add/price-edit supervisor-override gate in POSSales.jsx —
// keep in sync with PosCheckoutController §2.4's effectiveMin computation.
export const getPriceFloor = (minPrice, cost) => {
  const min = toNumber(minPrice);
  if (min > 0) return min;
  const c = toNumber(cost);
  return c > 0 ? c : null;
};

export const getCartPriceWarning = (item) => {
  if (!item || item.isVoided) return null;
  const unitPrice = toNumber(item.price, 0);
  const discountPct = toNumber(item.discount, 0);
  const effectivePrice = unitPrice * (1 - (discountPct / 100));

  const floor = getPriceFloor(item.minPrice, item.cost);

  if (floor != null && effectivePrice < floor) {
    return { level: 'error', message: `Below min price (${floor})` };
  }
  if (item.maxPrice != null && unitPrice > item.maxPrice) {
    return { level: 'warn', message: `Above max price (${item.maxPrice})` };
  }
  return null;
};

export const cachePosProduct = (cache, product) => {
  if (!cache || !product) return;
  [product.id, product.code, product.barcode, product.name]
    .filter(Boolean)
    .forEach(key => cache.set(String(key).toLowerCase(), product));
};

export const calculateDenominationTotal = (denom) => {
  return Object.entries(denom).reduce((total, [note, count]) => {
    return total + (parseFloat(note) * count);
  }, 0);
};

/**
 * Tax Enabled / Tax Mode / Branch Default VAT Rate live in BranchTaxConfiguration,
 * NOT in PosSettings — POS merges them into its client-side posSettings object so
 * the whole UI can read one object. That makes any `setPosSettings(savedRow)` a
 * trap: the saved PosSettings row has no tax fields, so replacing state with it
 * silently drops them and the cart falls back to Exclusive / 0% until a reload
 * re-merges the branch config.
 *
 * Use this for every save response instead of assigning it directly: it applies
 * the server's row on top of the current state while carrying the branch tax
 * fields through untouched.
 */
export const BRANCH_TAX_FIELDS = ['taxEnabled', 'taxInclusive', 'branchDefaultVatRate'];

export const mergeSavedPosSettings = (prev, saved) => {
  const base = { ...(prev || {}), ...(saved || {}) };
  BRANCH_TAX_FIELDS.forEach(field => {
    if (prev && Object.prototype.hasOwnProperty.call(prev, field)) {
      base[field] = prev[field];
    }
  });
  return base;
};

/**
 * Pure cart-total math for the POS cart. Extracted from POSSales'
 * recalculateInvoice so the VAT Inclusive / VAT Exclusive behaviour can be
 * tested directly — the component keeps calling this on every cart mutation
 * (add from grid, barcode scan, qty change, discount, void, remove), so every
 * entry path lands on exactly this one formula.
 *
 * The VAT mode is cart-global and read-only in POS: it comes from the branch's
 * Tax Configuration (posSettings.taxInclusive), not from the individual line.
 * Adding an item therefore never carries or overrides a mode of its own.
 */
export const computePosCartTotals = (items, billDiscountAmount = 0, posSettings = null) => {
  const activeItems = items.filter(i => !i.isVoided);
  const taxInclusive = !!posSettings?.taxInclusive;
  const fallbackRate = posSettings?.taxEnabled === false ? 0 : toNumber(posSettings?.branchDefaultVatRate, 0);

  let subtotal = 0;       // gross line value (entered price x qty) before discount —
                          // matches the backoffice invoice's "Sub Total" presentation
  let totalDiscount = 0;  // line discount, as a straight % of the entered price
  let tax = 0;            // extracted/added VAT after line discount

  activeItems.forEach(item => {
    const rate = toNumber(item.taxRate, fallbackRate) / 100;
    const disc = (item.discount || 0) / 100;
    const lineValue = item.price * item.quantity;
    // Discount is a percentage OFF THE ENTERED PRICE (tax-inclusive when
    // taxInclusive, ex-VAT otherwise) — e.g. "20% off AED 3,500" is AED 700,
    // not AED 700 further reduced by the VAT divisor. Computing the discount
    // on an already-VAT-stripped net (net/1+rate first, then *disc) silently
    // deflates it by the same factor (700 -> 636.36 at 10% VAT), which
    // desynced this cart-total preview from the backoffice/print totals that
    // discount the entered price directly.
    const discountAmount = lineValue * disc;
    const netAfterDiscount = lineValue - discountAmount;
    // In inclusive mode the discounted price still carries VAT, so strip it
    // out now to get the net (ex-VAT) base; in exclusive mode it already is one.
    const net = taxInclusive ? netAfterDiscount / (1 + rate) : netAfterDiscount;
    const taxOnLine = taxInclusive ? (netAfterDiscount - net) : net * rate;
    subtotal += lineValue;
    totalDiscount += discountAmount;
    tax += taxOnLine;
  });

  // Under INCLUSIVE VAT, netAfterDiscount (= subtotal - totalDiscount) already
  // carries the tax, so `tax` must not be added again on top — only EXCLUSIVE
  // mode adds it. Bill-level discount is subtracted flat either way.
  const total = Math.max(0, subtotal - totalDiscount - billDiscountAmount + (taxInclusive ? 0 : tax));

  // Voided lines are excluded from the total but disclosed separately in the
  // cart summary. Value uses the same discounted line formula the cart's
  // line-total cell shows, so the "Voided Items" figure matches the rows.
  const voidedItems = items.filter(i => i.isVoided);
  const voidedCount = voidedItems.length;
  const voidedTotal = voidedItems.reduce(
    (s, i) => s + (i.quantity * i.price * (1 - (i.discount || 0) / 100)),
    0,
  );

  return { items, subtotal, totalDiscount, tax, total, billDiscountAmount, taxInclusive, voidedTotal, voidedCount };
};

export const getPosVatLabel = (currentInvoice, posSettings) => {
  if (!currentInvoice || !currentInvoice.items) return currentInvoice?.taxInclusive ? 'VAT incl.' : 'VAT';
  const rates = [...new Set(currentInvoice.items.filter(i => !i.isVoided).map(i => toNumber(i.taxRate, posSettings?.taxEnabled === false ? 0 : toNumber(posSettings?.branchDefaultVatRate, 0))))];
  const base = rates.length === 1 ? `VAT (${rates[0]}%)` : 'VAT';
  return currentInvoice.taxInclusive ? `${base} incl.` : base;
};
