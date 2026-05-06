import api from './axiosConfig';

/**
 * Fetch Stock On Hand Report
 * @param {string|number} warehouseId - Optional warehouse ID
 * @param {AbortSignal} abortSignal - Optional signal to abort the request
 */
export const getStockOnHandReport = async (warehouseId, abortSignal) => {
    try {
        const params = {};
        if (warehouseId) params.warehouseId = warehouseId;

        const res = await api.get('/api/inventory/reports/stock-on-hand', {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error("Failed to fetch stock on hand report", error);
        throw error;
    }
};

/**
 * Fetch Low Stock Report
 * @param {string|number} warehouseId - Optional warehouse ID
 * @param {AbortSignal} abortSignal - Optional signal to abort the request
 */
export const getLowStockReport = async (warehouseId, abortSignal) => {
    try {
        const params = {};
        if (warehouseId) params.warehouseId = warehouseId;

        const res = await api.get('/api/inventory/reports/low-stock', {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error("Failed to fetch low stock report", error);
        throw error;
    }
};

/**
 * Fetch Out of Stock Report
 * @param {string|number} warehouseId - Optional warehouse ID
 * @param {AbortSignal} abortSignal - Optional signal to abort the request
 */
export const getOutOfStockReport = async (warehouseId, abortSignal) => {
    try {
        const params = {};
        if (warehouseId) params.warehouseId = warehouseId;

        const res = await api.get('/api/inventory/reports/out-of-stock', {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error("Failed to fetch out of stock report", error);
        throw error;
    }
};

/**
 * Fetch Stock Valuation Report
 * @param {string|number} warehouseId - Optional warehouse ID
 * @param {AbortSignal} abortSignal - Optional signal to abort the request
 */
export const getStockValuationReport = async (warehouseId, abortSignal) => {
    try {
        const params = {};
        if (warehouseId) params.warehouseId = warehouseId;

        const res = await api.get('/api/inventory/reports/stock-valuation', {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error("Failed to fetch stock valuation report", error);
        throw error;
    }
};
