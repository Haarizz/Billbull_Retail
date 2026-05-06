import api from "./axiosConfig";

export const getStockTransfers = async () => {
    const res = await api.get("/api/stock-transfers");
    return res.data;
};

export const getStockTransferById = async (id) => {
    const res = await api.get(`/api/stock-transfers/${id}`);
    return res.data;
};

export const getStockTransferCostPreview = async (warehouseId, productIds = []) => {
    const params = new URLSearchParams();
    params.append("warehouseId", warehouseId);
    (productIds || []).forEach(productId => {
        if (productId != null) {
            params.append("productIds", productId);
        }
    });

    const res = await api.get(`/api/stock-transfers/cost-preview?${params.toString()}`);
    return res.data;
};

export const createStockTransfer = async (payload) => {
    const res = await api.post("/api/stock-transfers", payload);
    return res.data;
};

export const updateStockTransfer = async (id, payload) => {
    const res = await api.put(`/api/stock-transfers/${id}`, payload);
    return res.data;
};

export const deleteStockTransfer = async (id) => {
    await api.delete(`/api/stock-transfers/${id}`);
};

export const requestStockTransferApproval = async (id) => {
    const res = await api.post(`/api/stock-transfers/${id}/request-approval`);
    return res.data;
};

export const cancelStockTransfer = async (id) => {
    const res = await api.post(`/api/stock-transfers/${id}/cancel`);
    return res.data;
};

export const sendStockTransfer = async (id) => {
    const res = await api.post(`/api/stock-transfers/${id}/send`);
    return res.data;
};

export const receiveStockTransfer = async (id) => {
    const res = await api.post(`/api/stock-transfers/${id}/receive`);
    return res.data;
};
