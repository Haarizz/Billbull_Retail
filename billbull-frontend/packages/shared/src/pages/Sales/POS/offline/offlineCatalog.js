/**
 * In-memory index over the offline catalogue snapshot (GET /api/pos/offline/catalog), answering
 * the three lookups the till makes while selling, in the exact shapes the online endpoints return:
 *
 *   GET /api/products/list                          -> list page of list-shaped items
 *   GET /api/pos/resolve?q=                         -> { type: 'PRODUCT', product } | { type: 'NONE' }
 *   GET /api/employees/salespersons/by-code/{code}  -> the salesperson lookup, or a 400
 *
 * The snapshot only holds products the offline pilot may sell (no batch, serial or expiry control)
 * and only base-unit barcodes, so nothing found here can lead to an unsupported line.
 */
let index = null; // { version, byCode, byBarcode, products, salespersons, tax, branchId, generatedAt }

export function loadCatalogIndex(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.products)) { index = null; return null; }
  const byCode = new Map();
  const byBarcode = new Map();
  for (const p of snapshot.products) {
    if (p?.code) byCode.set(String(p.code).toLowerCase(), p);
    for (const b of p?.barcodes || []) byBarcode.set(String(b).toLowerCase(), p);
  }
  const bySalesperson = new Map();
  for (const s of snapshot.salespersons?.lookups || []) {
    if (s?.employeeCode) bySalesperson.set(String(s.employeeCode).toLowerCase(), s);
  }
  index = {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    branchId: snapshot.branchId,
    tax: snapshot.tax || null,
    products: snapshot.products,
    byCode,
    byBarcode,
    bySalesperson,
    salespersonRequired: !!snapshot.salespersons?.required,
  };
  return index;
}

export const catalogIndex = () => index;
export const clearCatalogIndex = () => { index = null; };

export const findCatalogProduct = (code) => (index && code != null ? index.byCode.get(String(code).toLowerCase()) || null : null);

const listItem = (p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  localName: p.localName,
  barcode: p.barcode,
  packings: (p.barcodes || []).map((barcode) => ({ barcode, level: '1', unit: p.unitName ? { name: p.unitName } : null })),
  retailPrice: p.retailPrice,
  minPrice: p.minPrice,
  maxPrice: p.maxPrice,
  salesTax: p.salesTax,
  defaultDiscount: 0,
  departmentId: p.departmentId,
  departmentName: p.departmentName,
  productType: p.productType,
  unitName: p.unitName,
  availableUnits: [p.unitName || 'PCS'],
  unitPrices: {},
  unitConversions: {},
  availableInPos: true,
  isBatch: false,
  isSerial: false,
  expiryEnabled: false,
  fefoEnabled: false,
  stock: p.stock ?? 0,
  image: null,
  status: 'ACTIVE',
  offline: true,
});

const aggregate = (p) => ({
  product: {
    id: p.id,
    code: p.code,
    name: p.name,
    localName: p.localName,
    barcode: p.barcode,
    productType: p.productType,
    isBatch: false,
    isSerial: false,
    fefoEnabled: false,
    availableInPos: true,
    department: p.departmentId != null ? { id: p.departmentId, name: p.departmentName } : null,
  },
  effectivePricing: { retailPrice: p.retailPrice, minPrice: p.minPrice, maxPrice: p.maxPrice, defaultDiscount: 0 },
  tax: { salesTax: p.salesTax },
  stock: p.stock ?? 0,
  offline: true,
});

/** /api/products/list: the same substring match on code, name and barcode, paginated. */
export function offlineProductList({ page = 0, size = 50, search = '', departmentId = null } = {}) {
  if (!index) return null;
  const q = String(search || '').trim().toLowerCase();
  let rows = index.products;
  if (departmentId) rows = rows.filter((p) => String(p.departmentId) === String(departmentId));
  if (q) {
    rows = rows.filter((p) => String(p.code || '').toLowerCase().includes(q)
      || String(p.name || '').toLowerCase().includes(q)
      || (p.barcodes || []).some((b) => String(b).toLowerCase().includes(q)));
  }
  const p = Math.max(0, Number(page) || 0);
  const s = Math.max(1, Math.min(500, Number(size) || 50));
  return {
    content: rows.slice(p * s, p * s + s).map(listItem),
    totalElements: rows.length,
    totalPages: Math.ceil(rows.length / s),
    page: p,
    size: s,
    statusCounts: {},
    offline: true,
  };
}

/** /api/pos/resolve: exact barcode first, then exact code, exactly as the server's order. */
export function offlineResolve(query) {
  if (!index) return null;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { type: 'NONE' };
  const hit = index.byBarcode.get(q) || index.byCode.get(q);
  if (!hit) {
    return {
      type: 'NONE',
      message: 'Not in the offline catalogue. Batch, serial and expiry-controlled items, vouchers and customers need the server.',
    };
  }
  return { type: 'PRODUCT', product: aggregate(hit), pinnedBatchNumber: null, pinnedSerialNumber: null, offline: true };
}

/** /api/employees/salespersons/by-code/{code}. */
export function offlineSalespersonLookup(code) {
  if (!index) return null;
  return index.bySalesperson.get(String(code || '').trim().toLowerCase()) || undefined;
}
