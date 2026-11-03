import { useCallback, useRef } from 'react';
import { getSaleUnits } from '../../../../../api/pricingApi';
import { changeItemsUnit } from './lineUnits';

/**
 * Packing units (piece / box / carton) for the POS cart.
 *
 * - `loadSaleUnits(line)`: the product's sale units, priced by the backend resolver at this sale's
 *   level, customer and session branch. Cached per product + pricing context.
 * - `changeLineUnit(lineId, unit)`: moves a line to `unit` (re-keyed and re-priced, see
 *   lineUnits.js) and returns the id the line now has, so a caller applying qty / price /
 *   discount in the same pass can target it. The line is marked as priced on the active level, so
 *   the price-level hook does not re-price it.
 */
export function useLineUnits({
  sessionId, explicitPriceLevelId, levelKey, customer,
  currentInvoiceRef, setCurrentInvoice, recalculateInvoice,
}) {
  const cacheRef = useRef(new Map());
  const customerCode = customer && customer.id !== 'walk-in' ? (customer.code || null) : null;

  const loadSaleUnits = useCallback(async (line) => {
    const productId = Number(line?.productId ?? line?.id);
    const request = {
      channel: 'POS',
      sessionId: sessionId ?? null,
      priceLevelId: explicitPriceLevelId ?? null,
      customerCode,
      productId: Number.isFinite(productId) ? productId : null,
      itemCode: line?.code || null,
    };
    const key = JSON.stringify(request);
    const cached = cacheRef.current.get(key);
    if (cached) return cached;
    const res = await getSaleUnits(request);
    const units = Array.isArray(res?.units) ? res.units : [];
    if (cacheRef.current.size > 200) cacheRef.current.clear();
    cacheRef.current.set(key, units);
    return units;
  }, [sessionId, explicitPriceLevelId, customerCode]);

  const changeLineUnit = (lineId, unit) => {
    const { lineId: nextId } = changeItemsUnit(currentInvoiceRef.current?.items || [], lineId, unit);
    setCurrentInvoice((prev) => {
      const { items } = changeItemsUnit(prev.items, lineId, unit, { priceLevelKey: levelKey });
      return items === prev.items ? prev : recalculateInvoice(items, prev.billDiscountAmount || 0);
    });
    return nextId ?? lineId;
  };

  return { loadSaleUnits, changeLineUnit };
}

export default useLineUnits;
