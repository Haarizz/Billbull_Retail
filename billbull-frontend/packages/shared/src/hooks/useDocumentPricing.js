import { useMemo } from 'react';
import usePriceLevels from './usePriceLevels';
import usePriceLevelRepricing from './usePriceLevelRepricing';
import useCustomerPricingStatus from './useCustomerPricingStatus';
import {
  customerPricingSummary, isWalkInCode, levelHasTiers, pricingKeyFor, resolveClientLevel,
} from '../utils/priceLevels';

/**
 * Customer-aware pricing for a back-office sales document (Quotation, Sales Order, Pro-forma) —
 * Pricing Phase 2. The Sales Invoice editor does the same inline.
 *
 * Lines added from the product master (`priceLevelAuto: true`) follow the document's pricing:
 * the customer's negotiated price, else the customer's default level, else the default price —
 * all resolved by the backend's shared resolver on the user's current branch, valid on the
 * document date. Selecting, replacing or removing the customer, or changing the date, re-resolves
 * those lines. Lines loaded from a saved or source document, and hand-edited prices
 * (`priceOverridden`), keep their price.
 *
 * @param items        the document's lines
 * @param setItems     the lines' state setter (accepts an updater)
 * @param customer     the selected customer ({ code, priceLevelId, priceList }) or null
 * @param documentDate yyyy-mm-dd
 * @param recalcRow    recomputes a line's totals after its price changes
 * @param enabled      false while the document is read-only
 * @returns {{ pending: boolean, error: string, summary: object|null, effective: object }}
 */
export function useDocumentPricing({ items, setItems, customer, documentDate, recalcRow, enabled = true }) {
  const { levels, loaded } = usePriceLevels({ enabled });
  const code = customer && customer.code ? String(customer.code).trim() : '';
  const pricingCustomer = code && !isWalkInCode(code) ? customer : null;

  const effective = useMemo(
    () => resolveClientLevel({ levels, explicitLevelId: null, customer: pricingCustomer }),
    [levels, pricingCustomer],
  );
  const pricingKey = pricingCustomer
    ? `${pricingKeyFor(effective.level, pricingCustomer)}|d:${documentDate || ''}`
    : pricingKeyFor(effective.level, null);
  const status = useCustomerPricingStatus(pricingCustomer ? code : null);

  const autoItems = useMemo(() => (items || []).filter((it) => it && it.priceLevelAuto), [items]);
  const request = useMemo(() => ({
    customerCode: pricingCustomer ? code : null,
    pricingDate: documentDate || null,
  }), [pricingCustomer, code, documentDate]);

  // Runs only after a resolution arrives, so recalcRow may be declared later in the caller.
  const patchItems = (updater) => {
    setItems((prev) => updater(prev).map((it, i) => (it === prev[i] || !recalcRow ? it : recalcRow(it))));
  };

  const { pending, error } = usePriceLevelRepricing({
    items: autoItems,
    levelKey: pricingKey,
    request,
    setItems: patchItems,
    // Quantity tiers count every live line of a product, loaded / carried ones included.
    tierAware: levelHasTiers(effective.level),
    contextItems: items,
    enabled: enabled && (levels.length > 0 || (loaded && Boolean(pricingCustomer))),
  });

  const summary = useMemo(
    () => (pricingCustomer ? customerPricingSummary((items || []).filter((it) => it && it.code), status) : null),
    [pricingCustomer, items, status],
  );

  return { pending, error, summary, effective };
}

/**
 * The field patch for a line whose price the user typed: kept as a manual price. A changed unit
 * on an automatically priced line asks for a fresh resolution in the new unit.
 */
export const manualPricePatch = (item, field, value) => {
  if (field === 'price' && Number(value) !== Number(item.price)) return { priceOverridden: true };
  if (field === 'unit' && item.priceLevelAuto && !item.priceOverridden && item.priceLevelKey) {
    return { priceLevelKey: '__unit_changed__' };
  }
  return null;
};

export default useDocumentPricing;
