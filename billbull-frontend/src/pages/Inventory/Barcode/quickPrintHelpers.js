/** Pure helpers for Quick Barcode Print (kept out of the component so they can be unit-tested). */

/** Printer picker value for "use the browser's print dialog". Any other value is a printer id; '' = branch default. */
export const BROWSER_PRINT_TARGET = '__browser__';

export const nameOf = (v) => (v && typeof v === 'object' ? v.name : v) || '';
export const departmentOf = (p) => nameOf(p?.department) || p?.departmentName || '';
export const subDepartmentOf = (p) => nameOf(p?.subDepartment) || p?.subDepartmentName || '';
export const categoryOf = (p) => nameOf(p?.category) || '';

/** Every barcode a product carries, one entry per packing, sale unit first. */
export const productBarcodeOptions = (product) => {
    const seen = new Set();
    const list = (product?.packings || [])
        .filter(pkg => pkg?.barcode && String(pkg.barcode).trim() !== '')
        .slice()
        .sort((a, b) => Number(Boolean(b.isSale)) - Number(Boolean(a.isSale)))
        .map(pkg => ({ barcode: String(pkg.barcode).trim(), unit: pkg.unit?.name || pkg.unitName || null }))
        .filter(o => (seen.has(o.barcode) ? false : (seen.add(o.barcode), true)));
    return list;
};

/** Picks the product a scanner/Enter press means: exact barcode, then exact code/SKU, then a lone result. */
export const pickScanMatch = (products, term) => {
    const q = String(term || '').trim().toLowerCase();
    if (!q || !Array.isArray(products) || products.length === 0) return null;
    for (const p of products) {
        const hit = productBarcodeOptions(p).find(o => o.barcode.toLowerCase() === q);
        if (hit) return { product: p, barcode: hit.barcode, unit: hit.unit, exactBarcode: true };
    }
    const byCode = products.find(p => [p.code, p.sku].some(v => v && String(v).trim().toLowerCase() === q));
    const lone = products.length === 1 ? products[0] : null;
    const product = byCode || lone;
    if (!product) return null;
    const first = productBarcodeOptions(product)[0];
    return first ? { product, barcode: first.barcode, unit: first.unit, exactBarcode: false } : null;
};
