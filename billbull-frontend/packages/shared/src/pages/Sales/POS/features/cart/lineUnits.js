// Packing units on POS cart lines (piece, box, carton …).
//
// A unit option comes from POST /api/pricing/units:
//   { unit, symbol, level, conversion, base, price, source, levelPriceMissing }
// `price` is the server-resolved price per one of that unit; nothing here invents a price except
// the fallback below, used only when the server had none for the unit.
//
// A line sold in a multiple unit gets its own id (`<productId>::U:<unit>`), so a later scan of the
// same product (a piece) never merges into the box line. A base-unit line keeps the plain product
// id, as every line had before units existed.
//
// The line's minPrice / maxPrice / retailPrice / cost are per base unit on the product. They are
// kept on `unitBase` and scaled by the conversion, so the price-floor warnings and approval gates
// keep comparing like with like.

const norm = (u) => String(u ?? '').trim().toLowerCase();

const round2 = (n) => Math.round(n * 100) / 100;

const scale = (value, conversion) =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : round2(Number(value) * conversion);

export const sameUnit = (a, b) => norm(a) !== '' && norm(a) === norm(b);

const conversionOf = (unit) => {
  const n = Number(unit?.conversion);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

/** The unit option a line is currently sold in: its own unit, else the base unit, else null. */
export const unitOfLine = (line, units) => {
  if (!Array.isArray(units) || units.length === 0) return null;
  if (line?.unit) {
    const own = units.find((u) => sameUnit(u.unit, line.unit));
    if (own) return own;
  }
  return units.find((u) => u.base) || units[0];
};

/** Batch/serial lines are one base unit each; Sales Order lines keep the unit they were ordered in. */
export const lineUnitLocked = (line) => Boolean(line?.batchControlled || line?.salesOrderItemId);

/** Cart line id for a product sold in `unit`. */
export const lineIdForUnit = (productId, unit) =>
  !unit || unit.base || conversionOf(unit) === 1 ? productId : `${productId}::U:${unit.unit}`;

/** Price per one of `unit` for a line: the server's, else the line's price scaled across units. */
export const unitPriceFor = (line, unit) => {
  if (unit?.price != null && Number.isFinite(Number(unit.price))) return Number(unit.price);
  const current = Number(line?.unitConversion) > 0 ? Number(line.unitConversion) : 1;
  return round2((Number(line?.price) || 0) / current * conversionOf(unit));
};

/**
 * `line` re-expressed in `unit`. Quantity and discount stay as they are (the cashier picks the
 * quantity in the new unit); the price becomes the unit's price, which is no longer a manual
 * override.
 *
 * @param extra fields to merge (e.g. the price level key the unit prices were resolved under)
 */
export const lineInUnit = (line, unit, extra = {}) => {
  const conversion = conversionOf(unit);
  const productId = line.productId ?? line.id;
  const base = line.unitBase || {
    minPrice: line.minPrice ?? null,
    maxPrice: line.maxPrice ?? null,
    retailPrice: line.retailPrice ?? null,
    cost: line.cost ?? null,
  };
  const price = unitPriceFor(line, unit);
  const quantity = Number(line.quantity) || 0;
  const discount = Number(line.discount) || 0;
  return {
    ...line,
    ...extra,
    id: lineIdForUnit(productId, unit),
    productId,
    unit: unit.unit,
    unitSymbol: unit.symbol || null,
    unitConversion: conversion,
    unitBase: base,
    minPrice: scale(base.minPrice, conversion),
    maxPrice: scale(base.maxPrice, conversion),
    retailPrice: scale(base.retailPrice, conversion),
    cost: scale(base.cost, conversion),
    price,
    priceOverridden: false,
    // How the unit's price was resolved (a customer's negotiated price, a level price …), when known.
    ...(unit.source ? {
      priceSource: unit.source,
      customerPrice: unit.source === 'CUSTOMER_SPECIFIC' || unit.source === 'CUSTOMER_SPECIFIC_BRANCH'
        ? price : null,
    } : {}),
    total: quantity * price * (1 - discount / 100),
  };
};

/**
 * The cart items with line `lineId` moved to `unit`. When another live line is already sold in
 * that unit, the quantity is added to it and this line goes away, the same way a re-scan merges.
 *
 * @returns {{ items: object[], lineId: string|number|null }} the new items and the id the line now has
 */
export const changeItemsUnit = (items, lineId, unit, extra = {}) => {
  const line = (items || []).find((i) => i.id === lineId);
  if (!line || !unit || lineUnitLocked(line)) return { items, lineId: line ? lineId : null };
  const moved = lineInUnit(line, unit, extra);
  const twin = items.find((i) => i !== line && i.id === moved.id && !i.isVoided && !i.batchControlled);
  if (twin) {
    const quantity = (Number(twin.quantity) || 0) + (Number(moved.quantity) || 0);
    return {
      items: items
        .filter((i) => i !== line)
        .map((i) => (i === twin
          ? { ...i, quantity, total: quantity * i.price * (1 - (Number(i.discount) || 0) / 100) }
          : i)),
      lineId: twin.id,
    };
  }
  return { items: items.map((i) => (i === line ? moved : i)), lineId: moved.id };
};
