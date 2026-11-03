import api from "@billbull/shared/api/axiosConfig";

// --------------------
// GET ALL
// --------------------
export const getBarcodeTemplates = async () => {
    const res = await api.get("/api/barcode-templates");
    return res.data;
};

// --------------------
// CREATE
// --------------------
export const createBarcodeTemplate = async (template) => {
    const res = await api.post("/api/barcode-templates", template);
    return res.data;
};

// --------------------
// UPDATE
// --------------------
export const updateBarcodeTemplate = async (id, template) => {
    const res = await api.put(`/api/barcode-templates/${id}`, template);
    return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteBarcodeTemplate = async (id) => {
    await api.delete(`/api/barcode-templates/${id}`);
};

// --------------------
// LABEL PRICES (Pricing Phase 4)
// --------------------
/** The price sources a label can show: [{ key, kind, label, description, priceLevelId, requiresCustomer, supportsQuantityTiers }]. */
export const getLabelPriceSources = async () => {
    const res = await api.get("/api/barcode-templates/price-sources");
    return Array.isArray(res.data) ? res.data : [];
};

/**
 * Server-resolved label prices. body: { source, branchId, customerId, pricingQuantity, items: [{ key, productId, itemCode, barcode, unit }] }.
 * Returns { source, sourceLabel, branchId, branchName, customerName, sourceError, notice, items: [{ key, price, available, sourceLabel, message, unit, ... }] }.
 */
export const resolveLabelPrices = async (body) => {
    const res = await api.post("/api/barcode-templates/label-prices", body);
    return res.data;
};
