import api from './axiosConfig';

const REPORT_ID_ENDPOINTS = {
    soh: 'stock-on-hand',
    low_stock: 'low-stock-reorder',
    out_of_stock: 'out-of-stock',
    negative_stock: 'negative-stock-mismatch',
    valuation: 'stock-valuation',
    expiry: 'expiry-batch-ageing',
    movement_ledger: 'stock-movement-ledger',
    transfer: 'stock-transfer-report',
    reconciliation: 'stock-reconciliation-report',
    wastage: 'wastage-internal-consumption',
    in_out_summary: 'inflow-outflow-summary',
    price_audit: 'price-level-audit',
    cost_variance: 'grn-invoice-cost-variance',
    margin: 'item-margin-report',
    master_completeness: 'item-master-completeness',
    barcode_audit: 'barcode-label-audit',
    scale_export: 'weighing-scale-export',
    dead_stock: 'dead-slow-moving-stock',
    fast_moving: 'fast-moving-items',
    bin_stock: 'warehouse-bin-stock',
};

const reportEndpointId = (reportId) => REPORT_ID_ENDPOINTS[reportId] || reportId;

const numericParam = (value) => {
    if (value === undefined || value === null || value === '' || value === 'All' || value === 'ALL') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const getInventoryReportData = async (reportId, filters = {}, abortSignal) => {
    try {
        const params = {};
        const warehouseId = numericParam(filters.warehouseId);
        const branchId = numericParam(filters.branchId);
        if (warehouseId !== null) params.warehouseId = warehouseId;
        if (branchId !== null) params.branchId = branchId;
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.department && filters.department !== 'All') params.department = filters.department;
        if (filters.brand && filters.brand !== 'All') params.brand = filters.brand;
        if (filters.searchQuery) params.search = filters.searchQuery;
        if (filters.stockCondition && filters.stockCondition !== 'All') params.stockCondition = filters.stockCondition;
        if (filters.costingMethod && filters.costingMethod !== 'avg') params.costingMethod = filters.costingMethod;
        // Branch-Level Inventory Phase 10/11 — 'all' forces the consolidated company-wide view;
        // omitted/'active' scopes to the active branch when the tenant toggle is on.
        if (filters.branchScope === 'all') params.branchScope = 'all';

        const res = await api.get(`/api/inventory/reports/data/${reportEndpointId(reportId)}`, {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error(`Failed to fetch inventory report ${reportId}`, error);
        throw error;
    }
};

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
