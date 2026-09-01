import api from './axiosConfig';

export const getSalesAnalytics = async ({ from, to, branchId } = {}) => {
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    if (branchId && branchId !== 'All') params.branchId = branchId;
    const res = await api.get('/api/sales/analytics', { params });
    return res.data;
};

export const getSalesReportSalespersons = async () => {
    const res = await api.get('/api/sales/reports/salespersons');
    return res.data;
};

/**
 * Typeahead source for the Sales Reports "Customer / Item" filter.
 * Returns [{ id, type: 'CUSTOMER' | 'ITEM', code, name, subtitle }].
 */
export const getSalesReportFilterSuggestions = async (query, abortSignal, limit = 8) => {
    const q = (query || '').trim();
    if (!q) return [];
    try {
        const res = await api.get('/api/sales/reports/filter-suggestions', {
            params: { q, limit },
            signal: abortSignal
        });
        return Array.isArray(res.data) ? res.data : [];
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return [];
        }
        console.warn('Failed to fetch sales report filter suggestions', error);
        return [];
    }
};

export const getSalesReportData = async (reportId, filters = {}, abortSignal) => {
    try {
        const params = {};
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.branchId && !['All', 'ALL'].includes(String(filters.branchId)) && Number.isFinite(Number(filters.branchId))) {
            params.branchId = filters.branchId;
        }
        if (filters.salesChannel && filters.salesChannel !== 'All') params.salesChannel = filters.salesChannel;
        if (filters.salesperson && filters.salesperson !== 'All') params.salesperson = filters.salesperson;
        if (filters.valuationMethod) params.valuationMethod = filters.valuationMethod;
        if (filters.searchQuery) params.search = filters.searchQuery;
        // Set only when the user picked an entry from the filter typeahead — an exact
        // code filter, as opposed to the free-text `search` above.
        if (filters.customerCode) params.customerCode = filters.customerCode;
        if (filters.itemCode) params.itemCode = filters.itemCode;

        const res = await api.get(`/api/sales/reports/data/${reportId}`, {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error(`Failed to fetch sales report ${reportId}`, error);
        throw error;
    }
};
