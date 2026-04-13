import axiosInstance from './axiosConfig';

export const createStockTakeSession = async (sessionData) => {
    const response = await axiosInstance.post('/api/inventory/stock-take/sessions', sessionData);
    return response.data;
};

export const getStockTakeSessions = async () => {
    const response = await axiosInstance.get('/api/inventory/stock-take/sessions');
    return response.data;
};

export const getStockTakeSession = async (sessionId) => {
    const response = await axiosInstance.get(`/api/inventory/stock-take/sessions/${sessionId}`);
    return response.data;
};

export const updateItemCount = async (itemId, countedQty) => {
    // Guard: do not send "null" as string to backend
    if (countedQty === null || countedQty === undefined || countedQty === '') {
        return null;
    }
    const qty = parseInt(countedQty, 10);
    if (isNaN(qty)) return null;
    const response = await axiosInstance.put(`/api/inventory/stock-take/items/${itemId}/count?countedQty=${qty}`);
    return response.data;
};

export const addItemToSession = async (sessionId, productId, initialCount = 1) => {
    const response = await axiosInstance.post(`/api/inventory/stock-take/sessions/${sessionId}/items?productId=${productId}&initialCount=${initialCount}`);
    return response.data;
};

export const submitForApproval = async (sessionId) => {
    const response = await axiosInstance.post(`/api/inventory/stock-take/sessions/${sessionId}/submit`);
    return response.data;
};

export const approveStockTakeSession = async (sessionId, approvedBy) => {
    const response = await axiosInstance.post(`/api/inventory/stock-take/sessions/${sessionId}/approve?approvedBy=${approvedBy}`);
    return response.data;
};

export const rejectStockTakeSession = async (sessionId) => {
    const response = await axiosInstance.post(`/api/inventory/stock-take/sessions/${sessionId}/reject`);
    return response.data;
};

export const bulkUpdateItems = async (sessionId, updates) => {
    const response = await axiosInstance.post(`/api/inventory/stock-take/sessions/${sessionId}/bulk-update`, updates);
    return response.data;
};
export const deleteStockTakeItem = async (itemId) => {
    const response = await axiosInstance.delete(`/api/inventory/stock-take/items/${itemId}`);
    return response.data;
};

export const deleteStockTakeSession = async (sessionId) => {
    const response = await axiosInstance.delete(`/api/inventory/stock-take/sessions/${sessionId}`);
    return response.data;
};

export const getProductsForStockTake = async ({ stockTakeType, warehouseId, countType, categoryId, brandId, search, page, size, signal } = {}) => {
    const params = new URLSearchParams({
        stockTakeType: stockTakeType || 'OPENING',
        countType: countType || 'Full Stock Take (All Items)',
        page: page ?? 0,
        size: size ?? 15,
    });
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (categoryId)  params.append('categoryId', categoryId);
    if (brandId)     params.append('brandId', brandId);
    if (search && search.trim()) params.append('search', search.trim());
    const response = await axiosInstance.get(`/api/inventory/stock-take/products?${params}`, { signal });
    return response.data;
};

export const updateItemBin = async (itemId, binId) => {
    const url = binId != null
        ? `/api/inventory/stock-take/items/${itemId}/bin?binId=${binId}`
        : `/api/inventory/stock-take/items/${itemId}/bin`;
    const response = await axiosInstance.patch(url);
    return response.data;
};