import api from "./axiosConfig";

// ================= CONFIGURATIONS =================

export const getTaxConfigs = async () => {
    const res = await api.get("/api/financials/tax/configs");
    return res.data;
};

export const createTaxConfig = async (payload) => {
    const res = await api.post("/api/financials/tax/configs", payload);
    return res.data;
};

export const updateTaxConfig = async (id, payload) => {
    const res = await api.put(`/api/financials/tax/configs/${id}`, payload);
    return res.data;
};

export const deleteTaxConfig = async (id) => {
    await api.delete(`/api/financials/tax/configs/${id}`);
};

// ================= FILINGS =================

export const getTaxFilings = async () => {
    const res = await api.get("/api/financials/tax/filings");
    return res.data;
};

export const updateTaxFiling = async (id, payload) => {
    const res = await api.put(`/api/financials/tax/filings/${id}`, payload);
    return res.data;
};

export const uploadTaxDocument = async (filingId, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await api.post(`/api/financials/tax/filings/${filingId}/upload`, formData);
    return res.data;
};

export const deleteTaxDocument = async (filingId) => {
    const res = await api.delete(`/api/financials/tax/filings/${filingId}/document`);
    return res.data;
};

export const downloadTaxDocument = async (filingId) => {
    const res = await api.get(`/api/financials/tax/filings/${filingId}/document`, {
        responseType: 'blob',
    });
    return res.data;
};
