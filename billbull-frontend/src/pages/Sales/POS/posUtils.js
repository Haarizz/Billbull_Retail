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
  // Default delivery address: prefer the customer's saved shipping address,
  // then billing address, then any single address field. Used to pre-fill the
  // POS delivery dialog (cashier can still override).
  address: customer.defaultShippingAddress
    || customer.billingAddress
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
export const getCartPriceWarning = (item) => {
  if (!item || item.isVoided) return null;
  const unitPrice = toNumber(item.price, 0);
  const discountPct = toNumber(item.discount, 0);
  const effectivePrice = unitPrice * (1 - (discountPct / 100));

  const floor = toNumber(item.minPrice) > 0 ? toNumber(item.minPrice) 
              : (toNumber(item.cost) > 0 ? toNumber(item.cost) : null);

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

