// Price levels on the client (Pricing Phase 1).
//
// The backend's PricingResolutionService is the only place a price is computed. These helpers just
// decide WHICH level the screen is showing (mirroring the server's precedence so the badge is right
// before any round trip) and WHICH cart lines need re-pricing when that level changes. A line is
// re-priced only through POST /api/pricing/resolve; nothing here does price arithmetic.

/** Key for "the system default level" — the product's own selling price. */
export const DEFAULT_LEVEL_KEY = 'default';

export const levelKeyFor = (level) =>
  !level || level.id == null || level.systemDefault ? DEFAULT_LEVEL_KEY : String(level.id);

// ── Customer-specific prices (Pricing Phase 2) ──────────────────────────────
// A named customer may have negotiated prices that beat any level, so a line's pricing context is
// the level PLUS the customer. Folding the customer into the key makes every automatically priced
// line re-resolve when the customer is selected, replaced or removed, through the same path a
// level change already takes. Walk-in sales keep the plain level key (no extra traffic).

/** The walk-in placeholders used by the till and the back-office editors. */
export const isWalkInCode = (code) => ['WALK-IN', 'WALKIN'].includes(String(code || '').trim().toUpperCase());

const customerPricingRef = (customer) => {
  if (!customer || customer.id === 'walk-in' || customer.id === 'WALKIN-ID') return null;
  const code = String(customer.code || '').trim();
  if (code && isWalkInCode(code)) return null;
  if (code) return code;
  if (!code && customer.id != null && customer.id !== '') return '#' + customer.id;
  return null;
};

/** Key of a line's whole pricing context: the level, plus the customer when one is named. */
export const pricingKeyFor = (level, customer) => {
  const levelKey = levelKeyFor(level);
  const ref = customerPricingRef(customer);
  return ref ? levelKey + '|c:' + ref : levelKey;
};

export const isCustomerPriceSource = (source) =>
  source === 'CUSTOMER_SPECIFIC' || source === 'CUSTOMER_SPECIFIC_BRANCH';

export const isTierPriceSource = (source) => source === 'QUANTITY_TIER' || source === 'QUANTITY_TIER_BRANCH';

export const PRICE_SOURCE_LABEL = {
  CUSTOMER_SPECIFIC: 'Customer price',
  CUSTOMER_SPECIFIC_BRANCH: 'Customer price (this branch)',
  QUANTITY_TIER: 'Quantity tier',
  QUANTITY_TIER_BRANCH: 'Quantity tier (this branch)',
  SOURCE_DOCUMENT: 'From source document',
  PRICE_LEVEL: 'Price level',
  PRICE_LEVEL_BRANCH: 'Price level (this branch)',
  PACKING_PRICE: 'Packing price',
  BRANCH_PRICE: 'Branch price',
  BASE_PRICE: 'Default price',
  MANUAL_OVERRIDE: 'Manual price',
};

/** How a line is priced, for a badge/tooltip: a hand-edited price wins over the resolved source. */
export const priceSourceOf = (line) => (line?.priceOverridden ? 'MANUAL_OVERRIDE' : (line?.priceSource || null));

/**
 * Summary of a sale's customer pricing for the price badge.
 * @param customerPricing the resolver's customer block ({ liveMappings, ... }) or null
 * @returns {{ applied:number, message:string|null, tone:'info'|'muted' }|null} null when no named customer
 */
export const customerPricingSummary = (items, customerPricing) => {
  if (!customerPricing) return null;
  const live = (items || []).filter((it) => it && !it.voided && !it.isVoided);
  const applied = live.filter((it) => !it.priceOverridden && isCustomerPriceSource(it.priceSource)).length;
  if (Number(customerPricing.liveMappings) <= 0) {
    return { applied: 0, message: 'No negotiated prices for this customer', tone: 'muted' };
  }
  if (applied === 0) {
    return { applied: 0, message: live.length ? 'No negotiated price applies to these items' : 'Customer has negotiated prices', tone: 'muted' };
  }
  return { applied, message: 'Customer price on ' + applied + ' item' + (applied === 1 ? '' : 's'), tone: 'info' };
};

export const findLevel = (levels, id) =>
  id == null ? null : (levels || []).find((l) => String(l.id) === String(id)) || null;

export const defaultLevelOf = (levels) => (levels || []).find((l) => l.systemDefault) || null;

/** A customer's assigned level: by id, else by the legacy free-text price list name. */
export const customerLevelOf = (levels, customer) => {
  if (!customer) return null;
  const byId = findLevel(levels, customer.priceLevelId);
  if (byId) return byId;
  const name = String(customer.priceList || '').trim().toLowerCase();
  if (!name) return null;
  return (levels || []).find((l) => String(l.name).trim().toLowerCase() === name) || null;
};

/**
 * The level a transaction prices at — same precedence as the server:
 * explicit transaction choice → customer's active default → system default.
 * `levels` should include inactive levels so a customer on a deactivated level is detected.
 */
export const resolveClientLevel = ({ levels, explicitLevelId, customer }) => {
  const defaultLevel = defaultLevelOf(levels);
  const explicit = findLevel(levels, explicitLevelId);
  const customerLevel = customerLevelOf(levels, customer);
  if (explicit) {
    const source = customerLevel && customerLevel.active !== false && String(customerLevel.id) === String(explicit.id)
      ? 'CUSTOMER' : 'TRANSACTION';
    return { level: explicit, source, notice: null };
  }
  if (customerLevel) {
    if (customerLevel.active !== false) return { level: customerLevel, source: 'CUSTOMER', notice: null };
    return {
      level: defaultLevel,
      source: 'DEFAULT',
      notice: `Customer's price level '${customerLevel.name}' is inactive; default prices apply.`,
    };
  }
  return { level: defaultLevel, source: 'DEFAULT', notice: null };
};

export const PRICE_LEVEL_SOURCE_LABEL = {
  TRANSACTION: 'Selected for this sale',
  CUSTOMER: "Customer's default",
  DEFAULT: 'Default prices',
};

// ── Quantity tiers (Pricing Phase 3) ─────────────────────────────────────────
// A tier depends on how much of a product the whole transaction buys (all its live lines, in base
// units — the server does the conversion and the arithmetic). So while the active level has tiers,
// a line's pricing key also carries a signature of every live line of its product: changing any of
// their quantities or units makes all of them stale, and they are re-resolved together.

/** Whether a level has quantity tiers (the price-level list reports a live tier count). */
export const levelHasTiers = (level) => Number(level?.quantityTierCount) > 0;

const lineQuantity = (it) => it?.quantity ?? it?.qty ?? null;

/** The product a line sells, for grouping lines of one product. */
export const productRefOf = (it) => {
  if (!it) return null;
  const code = String(it.code || it.itemCode || '').trim().toUpperCase();
  if (code) return 'c:' + code;
  return it.productId != null ? 'p:' + it.productId : null;
};

const isLiveLine = (it) => it && !it.voided && !it.isVoided && productRefOf(it) != null;

/** product ref → signature of its live lines' paid quantities and units (order-independent). */
export const tierSignatures = (items) => {
  const parts = new Map();
  (items || []).filter(isLiveLine).forEach((it) => {
    const ref = productRefOf(it);
    const entry = `${String(it.unit || '').trim().toLowerCase()}*${Number(lineQuantity(it)) || 0}`;
    if (!parts.has(ref)) parts.set(ref, []);
    parts.get(ref).push(entry);
  });
  const out = new Map();
  parts.forEach((list, ref) => out.set(ref, list.sort().join(',')));
  return out;
};

/**
 * The key a line should be priced under: the transaction's level key, plus — while the level has
 * quantity tiers — its product's quantity signature.
 */
export const expectedLineKey = (it, levelKey, signatures) =>
  (signatures ? `${levelKey}|q:${signatures.get(productRefOf(it)) ?? ''}` : levelKey);

/** "Wholesale · Tier 20+" for a line a quantity tier priced, else null. */
export const tierLabelOf = (line) => {
  if (!line || line.priceOverridden || !isTierPriceSource(line.priceSource) || line.tierMinQuantity == null) return null;
  const min = Number(line.tierMinQuantity);
  const qty = Number.isFinite(min) ? String(+min.toFixed(3)) : String(line.tierMinQuantity);
  return line.priceLevelName ? `${line.priceLevelName} · Tier ${qty}+` : `Tier ${qty}+`;
};

/**
 * Lines whose price was set under a different pricing key and should be re-resolved. Voided lines
 * and lines whose price the user edited by hand (`priceOverridden`) are left alone, so switching
 * level never silently discards a manual override. Lines added without a level key were priced at
 * the product's default price.
 *
 * @param keyOfLine optional (line) => expected key; defaults to `levelKey` for every line
 */
export const linesNeedingReprice = (items, levelKey, keyOfLine) =>
  (items || []).filter((it) =>
    it && !it.voided && !it.isVoided && !it.priceOverridden
    && (it.productId != null || it.id != null || it.code || it.itemCode)
    && (it.priceLevelKey ?? DEFAULT_LEVEL_KEY) !== (keyOfLine ? keyOfLine(it) : levelKey));

/** Request lines for /api/pricing/resolve, index-aligned with `lines`. `quantity` is the paid quantity. */
export const toResolveLines = (lines) =>
  (lines || []).map((it) => {
    const rawId = it.productId ?? it.id;
    const productId = Number.isFinite(Number(rawId)) ? Number(rawId) : null;
    const quantity = lineQuantity(it);
    return {
      productId,
      itemCode: it.code || it.itemCode || null,
      unit: it.unit || null,
      quantity: quantity != null && quantity !== '' && Number.isFinite(Number(quantity)) ? Number(quantity) : null,
    };
  });

/**
 * Field patch per line id from a resolution. Every requested line gets the new pricing key (so it
 * is not re-requested), but its price changes only when the server returned one. Results are
 * index-aligned with `lines`; extra results (context lines sent only for their quantity) are ignored.
 *
 * @param levelKey the key to stamp — a string, or (line) => key
 * @returns Map<lineKey, patch>
 */
export const buildRepricePatches = (lines, resolution, levelKey, lineKeyOf = (it) => it.id) => {
  const patches = new Map();
  const results = resolution?.lines || [];
  (lines || []).forEach((it, i) => {
    const r = results[i];
    const patch = {
      priceLevelKey: typeof levelKey === 'function' ? levelKey(it) : levelKey,
      // Always set (null when none), so a tier from an earlier quantity never lingers.
      quantityTierId: r?.quantityTierId ?? null,
      tierMinQuantity: r?.quantityTierId != null ? (r?.tierMinQuantity ?? null) : null,
      tierEligibleQuantity: r?.quantityTierId != null ? (r?.eligibleQuantity ?? null) : null,
      untieredPrice: r?.untieredPrice != null && Number.isFinite(Number(r.untieredPrice)) ? Number(r.untieredPrice) : null,
      priceLevelId: resolution?.level?.id ?? null,
      priceLevelName: resolution?.level?.name ?? null,
      priceSource: r?.source ?? null,
      levelPriceMissing: Boolean(r?.levelPriceMissing),
      // Always set (null when none), so a previous customer's negotiated price never lingers.
      customerPriceId: r?.customerPriceId ?? null,
      customerPriceBranchId: r?.customerPriceBranchId ?? null,
      customerPrice: null,
      fallbackPrice: r?.fallbackPrice != null && Number.isFinite(Number(r.fallbackPrice)) ? Number(r.fallbackPrice) : null,
    };
    if (r && r.price != null && Number.isFinite(Number(r.price))) {
      patch.price = Number(r.price);
      if (r.basePrice != null) patch.basePrice = Number(r.basePrice);
      if (isCustomerPriceSource(r.source)) patch.customerPrice = Number(r.price);
    }
    patches.set(lineKeyOf(it), patch);
  });
  return patches;
};

/** Applies patches to the items still in the cart (lines removed meanwhile are skipped). */
export const applyRepricePatches = (items, patches, lineKeyOf = (it) => it.id) =>
  (items || []).map((it) => {
    const patch = patches.get(lineKeyOf(it));
    if (!patch || it.priceOverridden || it.voided || it.isVoided) return it;
    return { ...it, ...patch };
  });
