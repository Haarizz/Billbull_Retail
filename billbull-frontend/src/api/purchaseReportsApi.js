import api from './axiosConfig';

/**
 * Typeahead source for the Vendors & Purchases "Item / SKU Search" filter.
 * Returns [{ id, code, name, subtitle }] matching item code, SKU, name or barcode.
 */
export const getPurchaseReportFilterSuggestions = async (query, abortSignal, limit = 8) => {
    const q = (query || '').trim();
    if (!q) return [];
    try {
        const res = await api.get('/api/purchase/reports/filter-suggestions', {
            params: { q, limit },
            signal: abortSignal
        });
        return Array.isArray(res.data) ? res.data : [];
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return [];
        }
        console.warn('Failed to fetch purchase report filter suggestions', error);
        return [];
    }
};

export const getPurchaseReportData = async (reportId, filters = {}, abortSignal) => {
    try {
        const params = {};
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.vendor && filters.vendor !== 'All') params.vendor = filters.vendor;
        if (filters.branch && filters.branch !== 'All') params.branch = filters.branch;
        if (filters.searchQuery) params.search = filters.searchQuery;
        // Set only when the user picked an entry from the typeahead — an exact item-code
        // filter, as opposed to the free-text `search` above.
        if (filters.itemCode) params.itemCode = filters.itemCode;

        const res = await api.get(`/api/purchase/reports/data/${reportId}`, {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null;
        }
        console.error(`Failed to fetch purchase report ${reportId}`, error);
        throw error;
    }
};
