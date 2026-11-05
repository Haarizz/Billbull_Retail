import api from "./axiosConfig";

// Price levels (Pricing Phase 1). Backend: sales/pricing/PriceLevelController + PricingController.

const LEVELS = "/api/price-levels";

export const listPriceLevels = async ({ includeInactive = false } = {}) => {
  const res = await api.get(LEVELS, { params: { includeInactive } });
  return Array.isArray(res.data) ? res.data : [];
};

export const createPriceLevel = async (level) => (await api.post(LEVELS, level)).data;

export const updatePriceLevel = async (id, level) => (await api.put(`${LEVELS}/${id}`, level)).data;

export const setPriceLevelActive = async (id, active) =>
  (await api.patch(`${LEVELS}/${id}/active`, null, { params: { active } })).data;

/** Level prices for the given product ids (rows: productId, priceLevelId, branchId|null, price). */
export const getProductLevelPrices = async (productIds = []) => {
  const ids = [...new Set(productIds.filter((id) => id != null))];
  if (ids.length === 0) return [];
  const res = await api.get(`${LEVELS}/product-prices`, { params: { productIds: ids.join(",") } });
  return Array.isArray(res.data) ? res.data : [];
};

/** Set or clear cells: [{ productId, priceLevelId, branchId|null, price|null }] (null price clears). */
export const upsertProductLevelPrices = async (rows) =>
  (await api.put(`${LEVELS}/product-prices`, rows)).data;

/** Replace one product's level prices (within the caller's branches). */
export const replaceProductLevelPrices = async (productId, rows) =>
  (await api.put(`${LEVELS}/products/${productId}/prices`, rows)).data;

// ── Quantity tiers (Pricing Phase 3). Backend: PriceLevelController /quantity-tiers.
// Thresholds and prices are per base unit; a branchId of null is an all-branches tier.

/** Tiers of the given products: [{ id, productId, priceLevelId, priceLevelName, branchId, branchName, minQuantity, price, active, baseUnit, updatedAt }]. */
export const getQuantityTiers = async (productIds = [], { includeInactive = false } = {}) => {
  const ids = [...new Set(productIds.filter((id) => id != null))];
  if (ids.length === 0) return [];
  const res = await api.get(`${LEVELS}/quantity-tiers`, { params: { productIds: ids.join(','), includeInactive } });
  return Array.isArray(res.data) ? res.data : [];
};

/** Products with live tiers: { content: [{ productId, productCode, productName, baseUnit, tierCount, levels }], totalElements }. */
export const listTieredProducts = async ({ search, priceLevelId, page = 0, size = 25 } = {}) =>
  (await api.get(`${LEVELS}/quantity-tiers/products`, {
    params: { search: search || undefined, priceLevelId: priceLevelId ?? undefined, page, size },
  })).data;

/** body: { productId, priceLevelId, branchId|null, minQuantity, price } */
export const createQuantityTier = async (body) => (await api.post(`${LEVELS}/quantity-tiers`, body)).data;

/** body: { minQuantity, price, expectedUpdatedAt } — a stale expectedUpdatedAt gets a 409. */
export const updateQuantityTier = async (id, body) => (await api.put(`${LEVELS}/quantity-tiers/${id}`, body)).data;

export const setQuantityTierActive = async (id, active, expectedUpdatedAt) =>
  (await api.patch(`${LEVELS}/quantity-tiers/${id}/active`, null, {
    params: { active, expectedUpdatedAt: expectedUpdatedAt || undefined },
  })).data;

/**
 * Resolve line prices through the backend's shared resolver.
 * POS passes channel 'POS' and its sessionId (the server prices on the session's branch);
 * back office passes neither. priceLevelId is only the explicit transaction choice.
 */
export const resolvePrices = async ({ channel, sessionId, priceLevelId, customerId, customerCode, pricingDate, items }) =>
  (await api.post("/api/pricing/resolve", {
    channel: channel || null,
    sessionId: sessionId ?? null,
    priceLevelId: priceLevelId ?? null,
    customerId: customerId ?? null,
    customerCode: customerCode || null,
    // Back office only (the till always prices on the business day): the document date that a
    // customer's negotiated prices must be valid on.
    pricingDate: pricingDate || null,
    items: items || [],
  })).data;

/**
 * The units one product sells in (piece, box, carton …), smallest first, each priced as a line in
 * that unit would be: [{ unit, symbol, level, conversion, base, price, source, levelPriceMissing }].
 * Same context fields as resolvePrices. Backend: PricingController /units.
 */
export const getSaleUnits = async ({ channel, sessionId, priceLevelId, customerId, customerCode, productId, itemCode }) =>
  (await api.post("/api/pricing/units", {
    channel: channel || null,
    sessionId: sessionId ?? null,
    priceLevelId: priceLevelId ?? null,
    customerId: customerId ?? null,
    customerCode: customerCode || null,
    productId: productId ?? null,
    itemCode: itemCode || null,
  })).data;

// ── Customer-specific prices (Pricing Phase 2). Backend: sales/pricing/CustomerProductPriceController.

const CUSTOMER_PRICES = "/api/customer-prices";

/** A page of negotiated prices: { content, page, size, totalElements, totalPages }. */
export const listCustomerPrices = async ({ customerId, search, currentOnly = false, page = 0, size = 25 } = {}, signal) =>
  (await api.get(CUSTOMER_PRICES, {
    params: { customerId: customerId ?? undefined, search: search || undefined, currentOnly, page, size },
    signal,
  })).data;

/** Whether a customer has any enabled negotiated prices: { customerId, customerCode, liveMappings }. */
export const getCustomerPricingStatus = async ({ customerId, customerCode }) =>
  (await api.get(`${CUSTOMER_PRICES}/status`, {
    params: { customerId: customerId ?? undefined, customerCode: customerCode || undefined },
  })).data;

/**
 * Effective prices for a customer on a branch (default: the caller's current branch):
 * { priceLevelName, products: [{ productId, price, source, referencePrice, referenceSource, customerPriceId, ... }] }.
 */
export const getCustomerEffectivePrices = async ({ customerId, productIds = [], branchId, date }) => {
  const ids = [...new Set(productIds.filter((id) => id != null))];
  if (!customerId || ids.length === 0) return { products: [] };
  return (await api.get(`${CUSTOMER_PRICES}/effective`, {
    params: { customerId, productIds: ids.join(","), branchId: branchId ?? undefined, date: date || undefined },
  })).data;
};

/** body: { customerId, productId, branchId|null, price, effectiveFrom, effectiveTo|null, enabled, notes } */
export const createCustomerPrice = async (body) => (await api.post(CUSTOMER_PRICES, body)).data;

export const updateCustomerPrice = async (id, body) => (await api.put(`${CUSTOMER_PRICES}/${id}`, body)).data;

export const setCustomerPriceEnabled = async (id, enabled) =>
  (await api.patch(`${CUSTOMER_PRICES}/${id}/enabled`, null, { params: { enabled } })).data;

/** Stops the price applying from today, keeping it on record. */
export const discontinueCustomerPrice = async (id) =>
  (await api.post(`${CUSTOMER_PRICES}/${id}/discontinue`)).data;

export const deleteCustomerPrice = async (id) => { await api.delete(`${CUSTOMER_PRICES}/${id}`); };

// ── Price Levels workspace. Backend: sales/pricing/PricingWorkspaceController.

const WORKSPACE = "/api/pricing-workspace";

/** Card counts: { activeLevels, customerPriceLists, customerPrices, customersWithPrices, marginAlerts|null, ... }. */
export const getPricingSummary = async () => (await api.get(`${WORKSPACE}/summary`)).data;

/** { minMarginPercent, blockBelowCost, roundTo } */
export const getPricingRules = async () => (await api.get(`${WORKSPACE}/rules`)).data;

export const savePricingRules = async (rules) => (await api.put(`${WORKSPACE}/rules`, rules)).data;

/**
 * A page of the product × level matrix: { content: [{ id, code, name, imageUrl, departmentName, brandName,
 * cost, basePrice, baseMarginPercent, prices: [{ priceLevelId, branchId, price, marginPercent }] }],
 * totalElements, totalPages, costVisible, minMarginPercent }. filter: ALL | PRICED | UNPRICED | LOW_MARGIN.
 */
export const getPriceMatrix = async ({ search, departmentId, brandId, branchId, filter = "ALL", page = 0, size = 25 } = {}, signal) =>
  (await api.get(`${WORKSPACE}/products`, {
    params: {
      search: search || undefined,
      departmentId: departmentId || undefined,
      brandId: brandId || undefined,
      branchId: branchId || undefined,
      filter,
      page,
      size,
    },
    signal,
  })).data;

/** A product's price changes, newest first: [{ kind: LEVEL|CUSTOMER|PRODUCT, label, branchName, oldPrice, newPrice, changedAt, changedBy }]. */
export const getProductPriceHistory = async (productId, limit = 100) =>
  (await api.get(`${WORKSPACE}/products/${productId}/history`, { params: { limit } })).data;

/** Bulk level price change (dryRun: true previews): { products, changed, unchanged, skipped, skippedReasons, samples, applied }. */
export const bulkUpdateLevelPrices = async (body) => (await api.post(`${WORKSPACE}/bulk-update`, body)).data;

/** rows: [{ row, productCode, priceLevel, price }] (blank price removes it) → { applied, cleared, unchanged, errors }. */
export const importLevelPrices = async (body) => (await api.post(`${WORKSPACE}/import`, body)).data;

/** Customers on a level (levelId omitted = all customers): PageResponse of { id, code, name, mobile, group, priceLevelId, priceLevelName }. */
export const listLevelCustomers = async ({ levelId, search, customerGroup, page = 0, size = 25 } = {}) =>
  (await api.get(`${WORKSPACE}/customers`, {
    params: { levelId: levelId ?? undefined, search: search || undefined, customerGroup: customerGroup || undefined, page, size },
  })).data;

export const listCustomerGroups = async () => {
  const res = await api.get(`${WORKSPACE}/customer-groups`);
  return Array.isArray(res.data) ? res.data : [];
};

/** body: { customerIds?, customerGroup?, assign: true|false } → { updated, unchanged } */
export const assignLevelToCustomers = async (levelId, body) =>
  (await api.put(`${WORKSPACE}/levels/${levelId}/customers`, body)).data;

/**
 * Negotiated prices with cost / base price / margin / discount. status: ALL | CURRENT | FUTURE | EXPIRED | DISABLED | LIVE.
 * Rows are flattened: the price fields plus cost, basePrice, marginPercent, discountPercent, belowCost.
 */
export const listCustomerPriceRows = async ({ customerId, search, status = "ALL", belowCost = false, page = 0, size = 25 } = {}, signal) => {
  const data = (await api.get(`${WORKSPACE}/customer-prices`, {
    params: { customerId: customerId ?? undefined, search: search || undefined, status, belowCost, page, size },
    signal,
  })).data;
  const content = (data?.content || []).map(({ entry, ...extra }) => ({ ...(entry || {}), ...extra }));
  return { ...data, content };
};

/** Negotiated prices for one customer across products (dryRun previews). */
export const bulkCustomerPrices = async (body) => (await api.post(`${WORKSPACE}/customer-prices/bulk`, body)).data;

/** body: { fromCustomerId, toCustomerId, overwrite, dryRun } */
export const copyCustomerPrices = async (body) => (await api.post(`${WORKSPACE}/customer-prices/copy`, body)).data;
