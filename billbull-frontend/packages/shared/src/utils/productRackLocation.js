/**
 * A product's rack zone and locator, as set in Products → Inventory & Tracking.
 *
 * Reads either the flat `/api/products/list` row (`zoneName`, `locatorName`) or a
 * product aggregate / detail object carrying `inventory.zone` / `inventory.locator`.
 * Returns empty strings for anything not set.
 */
export const getProductRackLocation = (product) => {
  if (!product) return { zone: '', locator: '' };
  const inv = product.inventory ?? product.product?.inventory ?? null;
  const zone = product.zoneName ?? inv?.zone?.name ?? '';
  const locator = product.locatorName ?? inv?.locator?.name ?? '';
  return { zone: zone ? String(zone) : '', locator: locator ? String(locator) : '' };
};
