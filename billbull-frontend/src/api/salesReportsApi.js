import api from './axiosConfig';

export const getSalesReportData = async (reportId, filters = {}, abortSignal) => {
    try {
        const params = {};
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.branchId && filters.branchId !== 'All') params.branchId = filters.branchId;
        if (filters.salesChannel && filters.salesChannel !== 'All') params.salesChannel = filters.salesChannel;
        if (filters.salesperson && filters.salesperson !== 'All') params.salesperson = filters.salesperson;
        if (filters.searchQuery) params.search = filters.searchQuery;

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
