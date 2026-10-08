/**
 * Stock-status wording for the product views in global search.
 *
 * <p>Not a new business rule: "low" is the same test StockMovementService applies before
 * it raises a low-stock alert — a reorder level above zero, and available stock at or
 * below it. A product without a reorder level is never "low", only in or out of stock.
 *
 * <p>Both helpers return null when the quantity is unknown, so a caller shows no chip
 * rather than a confident status for a figure the server never returned.
 */
export const productStockStatus = (quantity, reorderLevel) => {
  if (quantity == null || !Number.isFinite(Number(quantity))) return null;
  const qty = Number(quantity);
  if (qty <= 0) return "Out of stock";
  if (reorderLevel > 0 && qty <= reorderLevel) return "Low stock";
  return "In stock";
};

/**
 * Status for one warehouse row. Describes that row's own server figures only; the tone
 * is explicit because words like "Fully reserved" would otherwise read as a warning.
 */
export const locationStockStatus = (loc, reorderLevel) => {
  const available = Number(loc?.available ?? 0);
  const reserved = Number(loc?.reserved ?? 0);
  if (available < 0) return { label: "Negative", tone: "negative" };
  if (available === 0 && reserved > 0) return { label: "Fully reserved", tone: "negative" };
  if (available === 0) return { label: "Out of stock", tone: "negative" };
  if (reorderLevel > 0 && available <= reorderLevel) return { label: "Low stock", tone: "warning" };
  return { label: "OK", tone: "positive" };
};
