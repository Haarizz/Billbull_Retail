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
});

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

