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