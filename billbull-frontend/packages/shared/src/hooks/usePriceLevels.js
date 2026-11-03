import { useCallback, useEffect, useState } from 'react';
import { listPriceLevels } from '../api/pricingApi';

/**
 * Loads every price level (inactive included, so a customer parked on a deactivated level is
 * recognised). Selectors should offer only `activeLevels`. A failed load leaves the list empty,
 * which means "no levels configured": screens then behave exactly as before price levels existed.
 */
export function usePriceLevels({ enabled = true } = {}) {
  const [levels, setLevels] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await listPriceLevels({ includeInactive: true });
      setLevels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Price levels could not be loaded', err);
      setLevels([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const activeLevels = levels.filter((l) => l.active !== false);
  // Only worth showing a selector once something other than the default level exists.
  const hasCustomLevels = activeLevels.some((l) => !l.systemDefault);
  return { levels, activeLevels, hasCustomLevels, loaded, reload };
}

export default usePriceLevels;
