import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveLabelPrices } from '../../../api/barcodeTemplateApi';
import {
    buildLabelPriceRequest,
    labelPriceIdentity,
    labelPriceParamsKey,
} from './labelPricing';

const CHUNK = 500; // the server's per-request limit

/**
 * A cache of server-resolved label prices, per print-run setting (source, branch, customer,
 * pricing quantity) and per label identity (product, barcode, unit).
 *
 * `lookup(item, params)` returns the cached result (undefined while loading) and queues a fetch
 * for misses; `ensure(items, params)` resolves every miss and returns the results. Printing goes
 * through `ensure`, so it prints exactly what the preview showed for the same settings; nothing is
 * re-resolved between preview and print unless the settings change or `refresh()` is called.
 */
export default function useLabelPrices({ resolve = resolveLabelPrices } = {}) {
    const cacheRef = useRef(new Map());   // paramsKey -> { results: Map<identity, result>, meta }
    const inflightRef = useRef(new Map()); // paramsKey#identity -> Promise
    const queueRef = useRef(new Map());    // paramsKey -> { params, items: Map<identity, item> }
    const timerRef = useRef(null);
    const mountedRef = useRef(true);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearTimeout(timerRef.current);
        };
    }, []);

    const bucket = (key) => {
        let b = cacheRef.current.get(key);
        if (!b) {
            b = { results: new Map(), meta: null };
            cacheRef.current.set(key, b);
        }
        return b;
    };

    const fetchItems = useCallback((params, items) => {
        const key = labelPriceParamsKey(params);
        const b = bucket(key);
        const missing = [];
        const waits = [];
        const seen = new Set();
        items.forEach((item) => {
            const id = labelPriceIdentity(item);
            if (seen.has(id) || b.results.has(id)) return;
            seen.add(id);
            const inflight = inflightRef.current.get(`${key}#${id}`);
            if (inflight) waits.push(inflight);
            else missing.push(item);
        });
        for (let i = 0; i < missing.length; i += CHUNK) {
            const chunk = missing.slice(i, i + CHUNK);
            const ids = chunk.map(labelPriceIdentity);
            const request = (async () => {
                try {
                    const res = await resolve(buildLabelPriceRequest(chunk, params));
                    const byKey = new Map((res?.items || []).map((r) => [r.key, r]));
                    ids.forEach((id) => b.results.set(id, byKey.get(id) || {
                        key: id, available: false, price: null, message: 'No price was returned for this label.',
                    }));
                    b.meta = {
                        source: res?.source, sourceLabel: res?.sourceLabel, sourceError: res?.sourceError || null,
                        notice: res?.notice || null, branchId: res?.branchId ?? null, branchName: res?.branchName || null,
                        customerName: res?.customerName || null, pricingDate: res?.pricingDate || null,
                    };
                } catch (err) {
                    const text = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'request failed';
                    // Errors are not kept: the next lookup or refresh tries again.
                    b.meta = { ...(b.meta || {}), sourceError: `Label prices could not be loaded: ${text}`, failed: true };
                    ids.forEach((id) => b.results.set(id, { key: id, available: false, price: null, failed: true,
                        message: `Price could not be loaded (${text}).` }));
                } finally {
                    ids.forEach((id) => inflightRef.current.delete(`${key}#${id}`));
                    if (mountedRef.current) setVersion((v) => v + 1);
                }
            })();
            ids.forEach((id) => inflightRef.current.set(`${key}#${id}`, request));
            waits.push(request);
        }
        return Promise.all(waits);
    }, [resolve]);

    const flushQueue = useCallback(() => {
        timerRef.current = null;
        const queued = [...queueRef.current.values()];
        queueRef.current.clear();
        queued.forEach(({ params, items }) => { fetchItems(params, [...items.values()]); });
    }, [fetchItems]);

    /** The cached result for `item`, or undefined (and a fetch is queued). */
    const lookup = useCallback((item, params) => {
        if (!item) return undefined;
        const key = labelPriceParamsKey(params);
        const id = labelPriceIdentity(item);
        const hit = cacheRef.current.get(key)?.results.get(id);
        if (hit && !hit.failed) return hit;
        if (hit?.failed && inflightRef.current.has(`${key}#${id}`)) return hit;
        if (!inflightRef.current.has(`${key}#${id}`)) {
            if (hit?.failed) cacheRef.current.get(key).results.delete(id);
            let q = queueRef.current.get(key);
            if (!q) {
                q = { params, items: new Map() };
                queueRef.current.set(key, q);
            }
            q.items.set(id, item);
            if (!timerRef.current) timerRef.current = setTimeout(flushQueue, 0);
        }
        return hit;
    }, [flushQueue]);

    /** Resolves every entry of `items` for `params`; returns { resultFor(item), meta }. */
    const ensure = useCallback(async (items, params) => {
        const key = labelPriceParamsKey(params);
        const b = bucket(key);
        // A failed earlier attempt is retried now.
        (items || []).forEach((item) => {
            const id = labelPriceIdentity(item);
            if (b.results.get(id)?.failed) b.results.delete(id);
        });
        await fetchItems(params, items || []);
        return {
            resultFor: (item) => b.results.get(labelPriceIdentity(item)),
            meta: b.meta,
        };
    }, [fetchItems]);

    /** Response-level information (source label, branch, errors) for `params`, once loaded. */
    const metaFor = useCallback((params) => cacheRef.current.get(labelPriceParamsKey(params))?.meta || null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [version]);

    /** Forget everything (prices changed on the server, or the user asks to reload). */
    const refresh = useCallback(() => {
        cacheRef.current = new Map();
        setVersion((v) => v + 1);
    }, []);

    return { lookup, ensure, metaFor, refresh, version };
}

