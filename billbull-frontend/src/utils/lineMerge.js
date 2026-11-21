// Stacking a repeat add of the same item onto its existing line (Sales Invoice
// first; Sales Order / Quotation / Delivery Note can reuse it).
//
// Picking or scanning an item that is already on the document raises that
// line's quantity instead of adding a second row. Different batches or serials
// of the same item belong on one line: the line's batchSelections list carries
// them, so the batch picker allocates qty N across as many batches as needed.
//
// A line is only reused when everything that changes what the customer pays,
// or where the stock comes from, is the same. Otherwise the add gets its own row.

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const sameNum = (a, b) => Math.abs(num(a) - num(b)) < 1e-9;
const norm = (v) => String(v ?? '').trim().toUpperCase();

// Priced by the document's price level (and re-priced when it changes), as
// opposed to a fixed price the user typed or the line was carried with.
const followsPriceLevel = (line) => Boolean(line?.priceLevelAuto) && !line?.priceOverridden;

export const canStackOnLine = (existing, incoming) => {
    if (!existing || !incoming) return false;
    if (existing.voided || existing.isVoided) return false;
    // Lines carried from a Sales Order are tied to that order line's quantity;
    // extra units go on a line of their own.
    if (existing.salesOrderItemId) return false;

    const code = norm(existing.code);
    if (!code || code !== norm(incoming.code)) return false;
    // Saved lines may carry no productId; only a known mismatch blocks stacking.
    if (existing.productId != null && incoming.productId != null
        && String(existing.productId) !== String(incoming.productId)) return false;

    if (norm(existing.unit || 'PCS') !== norm(incoming.unit || 'PCS')) return false;
    if (String(existing.warehouseId ?? '') !== String(incoming.warehouseId ?? '')) return false;
    if (!sameNum(existing.tax, incoming.tax)) return false;
    if (!sameNum(existing.disc, incoming.disc)) return false;

    const existingAuto = followsPriceLevel(existing);
    const incomingAuto = followsPriceLevel(incoming);
    if (existingAuto !== incomingAuto) return false;
    // Both on the price level: they resolve to the same price. Otherwise the
    // fixed prices must match.
    return existingAuto || sameNum(existing.price, incoming.price);
};

/** The line a new add should stack onto, or null when it needs its own row. */
export const findStackableLine = (items, incoming) =>
    (Array.isArray(items) ? items : []).find((line) => canStackOnLine(line, incoming)) || null;

/** Adds `qty` to the line with `lineId`; other lines are returned untouched. */
export const addQtyToLine = (items, lineId, qty) =>
    (Array.isArray(items) ? items : []).map((line) => {
        if (line?.id !== lineId) return line;
        const next = Math.round((num(line.qty) + num(qty)) * 1e6) / 1e6;
        return { ...line, qty: next };
    });
