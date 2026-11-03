/**
 * Barcode label prices (Pricing Phase 4) — pure helpers shared by the print queue, the preview,
 * browser print and Zebra (ZPL) print.
 *
 * Every label price comes from the server (POST /api/barcode-templates/label-prices), which
 * resolves it through the shared pricing resolver. The browser never computes, defaults or
 * substitutes a price: a label whose source has no price is "unavailable" and prints no price.
 * Purchase cost is never a label price.
 */

/** Where a template stores its price source, next to `_contentScale` in the fields JSON. */
export const PRICE_SOURCE_FIELD = '_priceSource';
/** The effective selling price (retail); what a template without a stored source uses. */
export const DEFAULT_PRICE_SOURCE = 'DEFAULT';

/** The price source a template stores, or DEFAULT for a template saved before Phase 4. */
export const templatePriceSource = (template) => {
    let fields = template?.fields;
    if (typeof fields === 'string') {
        try { fields = JSON.parse(fields); } catch { fields = null; }
    }
    const raw = fields && typeof fields === 'object' ? fields[PRICE_SOURCE_FIELD] : null;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_PRICE_SOURCE;
};

/** `fields` with the price source set (DEFAULT is stored explicitly so the choice is visible). */
export const withPriceSource = (fields, sourceKey) => ({
    ...(fields || {}),
    [PRICE_SOURCE_FIELD]: sourceKey || DEFAULT_PRICE_SOURCE,
});

const numericId = (id) => {
    if (typeof id === 'number' && Number.isFinite(id)) return id;
    if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number(id.trim());
    return null; // queue placeholders such as "stk-12-3" or "purchase-…" are not product ids
};

/** The product code a queue entry names (stock-take entries carry only a SKU-as-code). */
const itemCodeOf = (item) => {
    const p = item?.product || {};
    return (p.code || p.sku || p.itemCode || '').toString().trim() || null;
};

/** What makes two queue entries price the same: product, barcode and unit. */
export const labelPriceIdentity = (item) => {
    const p = item?.product || {};
    return [
        numericId(p.id) ?? '',
        (itemCodeOf(item) || '').toUpperCase(),
        (item?.productBarcode || item?.barcode || '').toString().trim(),
        (item?.unit || '').toString().trim().toUpperCase(),
    ].join('|');
};

/** The request line for one queue entry. Only identifying data is sent, never a price. */
export const labelPriceRequestItem = (item) => ({
    key: labelPriceIdentity(item),
    productId: numericId(item?.product?.id),
    itemCode: itemCodeOf(item),
    barcode: (item?.productBarcode || item?.barcode || null) || null,
    unit: item?.unit || null,
});

/** Normalises the print-run settings. `pricingQuantity` is optional and must be > 0 when given. */
export const normalizeLabelPriceParams = ({ source, branchId, customerId, pricingQuantity } = {}) => {
    const qty = Number(pricingQuantity);
    const branch = branchId === 'ALL' || branchId === '' || branchId == null ? null : Number(branchId);
    return {
        source: source || DEFAULT_PRICE_SOURCE,
        branchId: Number.isFinite(branch) ? branch : null,
        customerId: customerId != null && customerId !== '' ? Number(customerId) : null,
        pricingQuantity: pricingQuantity === '' || pricingQuantity == null || !Number.isFinite(qty) ? null : qty,
    };
};

export const labelPriceParamsKey = (params) => {
    const p = normalizeLabelPriceParams(params);
    return [p.source, p.branchId ?? '', p.source === 'CUSTOMER' ? (p.customerId ?? '') : '', p.pricingQuantity ?? ''].join('|');
};

/** The request body for a set of entries (identities de-duplicated). */
export const buildLabelPriceRequest = (items, params) => {
    const p = normalizeLabelPriceParams(params);
    const seen = new Set();
    const lines = [];
    (items || []).forEach((item) => {
        const line = labelPriceRequestItem(item);
        if (seen.has(line.key)) return;
        seen.add(line.key);
        lines.push(line);
    });
    return {
        source: p.source,
        branchId: p.branchId,
        customerId: p.source === 'CUSTOMER' ? p.customerId : null,
        pricingQuantity: p.pricingQuantity,
        items: lines,
    };
};

/** The number a label prints, formatted once for every renderer (HTML preview, browser print, ZPL). */
export const formatLabelAmount = (value, decimals = 2) => {
    const n = Number(value);
    if (value == null || value === '' || !Number.isFinite(n)) return '';
    return n.toLocaleString('en-AE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/** True when a resolved result has a printable price. */
export const hasLabelPrice = (result) => Boolean(result && result.available && formatLabelAmount(result.price) !== '');

/**
 * How one label's price renders. `amount` is shared by HTML and ZPL, so both always print the same
 * value. `status`: 'ok' | 'pending' | 'unavailable'.
 */
export const labelPriceDisplay = (result, { currencyCode = '' } = {}) => {
    if (result === undefined) return { status: 'pending', amount: '', zplText: '', message: 'Loading price…' };
    if (!hasLabelPrice(result)) {
        return { status: 'unavailable', amount: '', zplText: '', message: result?.message || 'Price unavailable' };
    }
    const amount = formatLabelAmount(result.price);
    return {
        status: 'ok',
        amount,
        zplText: `${currencyCode ? `${currencyCode} ` : ''}${amount}`,
        message: result.message || null,
        sourceLabel: result.sourceLabel || null,
    };
};

/** The ZPL price field for a label — built from the same display the HTML label uses. */
export const zplPriceField = (result, { enabled, currencyCode }) => {
    const display = labelPriceDisplay(result, { currencyCode });
    return { type: 'text', id: 'price', enabled: Boolean(enabled) && display.status === 'ok', value: display.zplText };
};

/** Entries whose label would print without a price: [{ item, result }]. */
export const labelsWithoutPrice = (items, resultFor) => (items || [])
    .map((item) => ({ item, result: resultFor(item) }))
    .filter(({ result }) => !hasLabelPrice(result));

/** A short confirmation text for printing labels some of which have no price. */
export const missingPriceWarning = (missing, sourceLabel) => {
    const names = [...new Set(missing.map(({ item }) => item?.product?.name || item?.product?.code || 'Item'))];
    const shown = names.slice(0, 8).join('\n• ');
    const more = names.length > 8 ? `\n…and ${names.length - 8} more` : '';
    return `${names.length} item(s) have no ${sourceLabel || 'selected'} price, so their labels would print without a price:\n\n• ${shown}${more}\n\nNo other price is substituted. Print anyway?`;
};
