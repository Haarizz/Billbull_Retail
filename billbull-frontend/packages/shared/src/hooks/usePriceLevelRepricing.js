import { useEffect, useMemo, useRef, useState } from 'react';
import { resolvePrices } from '../api/pricingApi';
import {
  applyRepricePatches,
  buildRepricePatches,
  expectedLineKey,
  linesNeedingReprice,
  productRefOf,
  tierSignatures,
  toResolveLines,
} from '../utils/priceLevels';

/**
 * Keeps a transaction's line prices on its active price level, for POS and the back office alike.
 *
 * Whenever lines exist whose price was set under another pricing key (a line just added, the
 * customer changed, the level was switched), they are sent together to the backend resolver and
 * patched with the result. No request is made while every line is already on the active key, so a
 * business that never configures levels sees no extra traffic.
 *
 * Quantity tiers (Pricing Phase 3): with `tierAware` (the active level has tiers), a line's key also
 * carries its product's quantity signature, so changing a quantity or unit re-prices every line of
 * that product. All live lines of those products (`contextItems`, e.g. hand-priced or carried lines
 * that are never re-priced themselves) are sent along so the server counts the whole quantity.
 *
 * Only the latest request may patch the lines: a response that arrives after a newer request was
 * started is dropped, and `pending` stays true until the newest one settles.
 *
 * @param items        lines that may be re-priced
 * @param levelKey     key of the active level (utils/priceLevels pricingKeyFor)
 * @param request      { channel, sessionId, priceLevelId, customerId, customerCode } for the resolver
 * @param setItems     (updater) => void — receives (prevItems) => nextItems
 * @param lineKeyOf    line identity (default: it.id)
 * @param enabled      false to switch the hook off (e.g. levels not loaded yet)
 * @param tierAware    the active level has quantity tiers
 * @param contextItems every line of the transaction (default: items) — counted for tiers
 */
export function usePriceLevelRepricing({
  items, levelKey, request, setItems, lineKeyOf, enabled = true, tierAware = false, contextItems,
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [serverLevel, setServerLevel] = useState(null);
  const seqRef = useRef(0);
  const failedRef = useRef(new Set());
  const keyOf = lineKeyOf || ((it) => it.id);
  const allItems = contextItems || items;

  const signatures = useMemo(
    () => (enabled && tierAware ? tierSignatures(allItems) : null),
    [enabled, tierAware, allItems],
  );
  const keyOfLine = useMemo(
    () => (it) => expectedLineKey(it, levelKey, signatures),
    [levelKey, signatures],
  );
  const stale = useMemo(
    () => (enabled ? linesNeedingReprice(items, levelKey, keyOfLine) : []),
    [enabled, items, levelKey, keyOfLine],
  );
  // Lines that only contribute quantity: the other live lines of the stale lines' products.
  const context = useMemo(() => {
    if (!signatures || stale.length === 0) return [];
    const staleSet = new Set(stale);
    const refs = new Set(stale.map(productRefOf));
    return (allItems || []).filter((it) => it && !staleSet.has(it) && !it.voided && !it.isVoided
      && refs.has(productRefOf(it)));
  }, [signatures, stale, allItems]);

  const signature = stale.map((it) => `${String(keyOf(it))}=${keyOfLine(it)}`).join(',');
  const requestKey = JSON.stringify(request || {});

  useEffect(() => {
    if (!enabled || stale.length === 0) {
      return undefined;
    }
    const attempt = `${levelKey}|${requestKey}|${signature}`;
    if (failedRef.current.has(attempt)) return undefined;

    const seq = ++seqRef.current;
    let cancelled = false;
    setPending(true);
    setError('');
    // Keys are fixed when the request is sent: if a quantity changes meanwhile, the patched line
    // carries the old key, is stale again and is re-requested.
    const sentKeys = new Map(stale.map((it) => [keyOf(it), keyOfLine(it)]));
    resolvePrices({ ...(request || {}), items: toResolveLines([...stale, ...context]) })
      .then((resolution) => {
        if (cancelled || seq !== seqRef.current) return;
        setServerLevel(resolution?.level || null);
        const patches = buildRepricePatches(stale, resolution, (it) => sentKeys.get(keyOf(it)), keyOf);
        setItems((prev) => applyRepricePatches(prev, patches, keyOf));
      })
      .catch((err) => {
        if (cancelled || seq !== seqRef.current) return;
        failedRef.current.add(attempt);
        const message = err?.response?.data?.message || err?.message || 'Prices could not be updated for the selected price level.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled && seq === seqRef.current) setPending(false);
      });
    return () => { cancelled = true; };
    // `stale`/`context`/`request` are represented by signature/requestKey; listing the objects
    // would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, levelKey, signature, requestKey]);

  // Pending from the moment a line is stale (not only once its request is in flight), so a
  // checkout or save can't slip in between a quantity change and its re-pricing. A failed attempt
  // stops blocking; its error is reported instead.
  const blocked = enabled && stale.length > 0
    && !failedRef.current.has(`${levelKey}|${requestKey}|${signature}`);
  return { pending: blocked || (pending && stale.length > 0), error, serverLevel };
}

export default usePriceLevelRepricing;
