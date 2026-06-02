import api from './axiosConfig';

export const getPurchaseReportData = async (reportId, filters = {}, abortSignal) => {
    try {
        const params = {};
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.vendor && filters.vendor !== 'All') params.vendor = filters.vendor;
        if (filters.branch && filters.branch !== 'All') params.branch = filters.branch;
        if (filters.searchQuery) params.search = filters.searchQuery;

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
