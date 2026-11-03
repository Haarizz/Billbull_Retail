import { useEffect, useState } from 'react';
import { getCustomerPricingStatus } from '../api/pricingApi';

const cache = new Map();

/**
 * Whether the selected customer has any negotiated (customer-specific) prices — Pricing Phase 2.
 * Drives the "Customer price on N items" / "No negotiated prices for this customer" indicator; it
 * never decides a price (the backend resolver does). Cached per customer code for the page's life.
 *
 * @param customerCode the named customer's code, or null for walk-in / none
 * @returns {{ liveMappings: number, loaded: true } | null} null while unknown or with no customer
 */
export function useCustomerPricingStatus(customerCode) {
  const code = customerCode ? String(customerCode).trim() : '';
  // Bumped when a fetch lands so the cached value is read on the next render.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!code || cache.has(code)) return undefined;
    let cancelled = false;
    getCustomerPricingStatus({ customerCode: code })
      .then((res) => {
        cache.set(code, { liveMappings: Number(res?.liveMappings) || 0 });
        if (!cancelled) setVersion((v) => v + 1);
      })
      // Unknown: say nothing rather than claim the customer has no prices.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [code]);

  if (!code) return null;
  const hit = cache.get(code);
  return hit ? { liveMappings: hit.liveMappings, loaded: true } : null;
}

/** Forget cached statuses (after negotiated prices are edited on this page). */
export const clearCustomerPricingStatusCache = () => cache.clear();

export default useCustomerPricingStatus;
