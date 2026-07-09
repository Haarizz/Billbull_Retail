import api from "./axiosConfig";

// ================= PRINT TEMPLATES =================

export const getPrintTemplates = async () => {
    const res = await api.get("/api/templates");
    return res.data;
};

export const getTemplatesByCategory = async (category) => {
    const res = await api.get(`/api/templates/search?category=${encodeURIComponent(category)}`);
    return res.data;
};

/**
 * All templates in a document family, e.g. base "Sales Invoice" returns the
 * standard, letterhead, and pre-printed variants together. Used by the print
 * picker so the user can choose any variant at print time.
 */
export const getTemplateFamily = async (base) => {
    const res = await api.get(`/api/templates/family?base=${encodeURIComponent(base)}`);
    return res.data;
};

export const createPrintTemplate = async (payload) => {
    const res = await api.post("/api/templates", payload);
    return res.data;
};

export const updatePrintTemplate = async (id, payload) => {
    const res = await api.put(`/api/templates/${id}`, payload);
    return res.data;
};

export const setDefaultTemplate = async (id, template) => {
    const payload = {
        ...template,
        isDefault: true,
        displayOptions: typeof template.displayOptions === 'object' ? JSON.stringify(template.displayOptions) : template.displayOptions,
        columns: typeof template.columns === 'object' ? JSON.stringify(template.columns) : template.columns
    };
    const res = await api.put(`/api/templates/${id}`, payload);
    return res.data;
};

export const deletePrintTemplate = async (id) => {
    await api.delete(`/api/templates/${id}`);
};

/**
 * Resolves the effective template for a category using the backend's strict
 * priority order (branch-specific default -> global default -> system fallback).
 * branchId is optional — server resolves the caller's own branch when omitted.
 * Used by POS to resolve the same "Sales Invoice"/"Sales Return" templates Back
 * Office's designer edits (Phase 3 cutover).
 */
export const resolvePrintTemplate = async (category, branchId) => {
    const params = new URLSearchParams({ category });
    if (branchId != null) params.set('branchId', String(branchId));
    const res = await api.get(`/api/templates/resolve?${params.toString()}`);
    return res.data;
};