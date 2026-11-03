import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import usePriceLevels from '../../../../../hooks/usePriceLevels';
import usePriceLevelRepricing from '../../../../../hooks/usePriceLevelRepricing';
import useCustomerPricingStatus from '../../../../../hooks/useCustomerPricingStatus';
import {
  customerLevelOf, customerPricingSummary, levelHasTiers, pricingKeyFor, resolveClientLevel,
} from '../../../../../utils/priceLevels';

const lineTotal = (item) =>
  (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 - (Number(item.discount) || 0) / 100);

/**
 * POS price level (Pricing Phase 1).
 *
 * - The sale prices at the cashier's explicit choice, else the selected customer's default level,
 *   else the default prices — the backend resolver's precedence.
 * - Changing the customer drops the explicit choice, so the new customer's default applies.
 * - Every cart line not on the active level (just added, customer switched, level switched) is
 *   re-priced through the backend resolver on the session's branch. Lines the cashier re-priced by
 *   hand keep their price.
 * - Customer-specific prices (Phase 2): the pricing key includes the named customer, so selecting,
 *   replacing or removing the customer re-resolves every automatically priced line; a customer's
 *   negotiated price then wins over any level. Walk-in sales keep the plain level key.
 *
 * @returns {{ explicitPriceLevelId, setExplicitPriceLevelId, reset, pending, error,
 *             effective, levelKey, activeLevels, hasCustomLevels, showPricing, customerPricing,
 *             customerLevelName }}
 */
export function usePosPriceLevel({ items, customer, sessionId, setCurrentInvoice, recalculateInvoice }) {
  const { levels, activeLevels, hasCustomLevels, loaded: levelsLoaded } = usePriceLevels();
  const [explicitPriceLevelId, setExplicitPriceLevelId] = useState(null);

  // A different customer starts from their own default level.
  // (Adjusted during render — React's pattern for resetting state when a prop changes.)
  const customerKey = customer?.id ?? null;
  const [trackedCustomerKey, setTrackedCustomerKey] = useState(customerKey);
  if (trackedCustomerKey !== customerKey) {
    setTrackedCustomerKey(customerKey);
    setExplicitPriceLevelId(null);
  }

  const isWalkIn = !customer || customer.id === 'walk-in';
  const pricingCustomer = isWalkIn ? null : customer;
  const effective = useMemo(
    () => resolveClientLevel({ levels, explicitLevelId: explicitPriceLevelId, customer: pricingCustomer }),
    [levels, explicitPriceLevelId, pricingCustomer],
  );
  const levelKey = pricingKeyFor(effective.level, pricingCustomer);
  const pricingStatus = useCustomerPricingStatus(pricingCustomer ? pricingCustomer.code : null);
  const customerLevel = customerLevelOf(levels, pricingCustomer);

  const setItems = useCallback((updater) => {
    setCurrentInvoice((prev) => {
      const next = updater(prev.items).map((it, i) =>
        it === prev.items[i] ? it : { ...it, total: lineTotal(it) });
      return recalculateInvoice(next, prev.billDiscountAmount || 0);
    });
  }, [setCurrentInvoice, recalculateInvoice]);

  const request = useMemo(() => ({
    channel: 'POS',
    sessionId: sessionId ?? null,
    priceLevelId: explicitPriceLevelId,
    customerCode: pricingCustomer ? (pricingCustomer.code || null) : null,
  }), [sessionId, explicitPriceLevelId, pricingCustomer]);

  const { pending, error } = usePriceLevelRepricing({
    items,
    levelKey,
    request,
    setItems,
    // Quantity tiers: a quantity or unit change re-prices the product's lines (all cart layouts
    // share this hook, so Touch, TradePOS and the console price alike).
    tierAware: levelHasTiers(effective.level),
    // Levels are only consulted once loaded; until then every line is on the default level. A named
    // customer is priced even when no levels could be loaded (their negotiated prices still apply).
    enabled: levels.length > 0 || (levelsLoaded && Boolean(pricingCustomer)),
  });

  // A hand-priced line keeps its price across a customer change, but the previous customer's
  // negotiated price must not keep relaxing its price floor.
  const lastCustomerRef = useRef(customerKey);
  useEffect(() => {
    if (lastCustomerRef.current === customerKey) return;
    lastCustomerRef.current = customerKey;
    if (!(items || []).some((it) => it && it.priceOverridden && it.customerPrice != null)) return;
    setItems((prev) => prev.map((it) => (it && it.priceOverridden && it.customerPrice != null
      ? { ...it, customerPrice: null, customerPriceId: null } : it)));
  }, [customerKey, items, setItems]);

  const customerPricing = useMemo(
    () => (pricingCustomer ? customerPricingSummary(items, pricingStatus) : null),
    [pricingCustomer, items, pricingStatus],
  );

  const reset = useCallback(() => setExplicitPriceLevelId(null), []);

  return {
    explicitPriceLevelId,
    setExplicitPriceLevelId,
    reset,
    pending,
    error,
    effective,
    levelKey,
    activeLevels,
    hasCustomLevels,
    // Show the price badge for a customer with negotiated prices even when no levels exist.
    showPricing: hasCustomLevels || Boolean(pricingStatus && pricingStatus.liveMappings > 0),
    customerPricing,
    customerLevelName: customerLevel && customerLevel.active !== false ? customerLevel.name : null,
  };
}

export default usePosPriceLevel;
