import api from './axiosConfig';

const isAbortSignal = (value) =>
    value &&
    typeof value === 'object' &&
    typeof value.aborted === 'boolean' &&
    typeof value.addEventListener === 'function';

export const getStockAvailability = async (itemCode, filtersOrSignal, maybeAbortSignal) => {
    const hasFilters = filtersOrSignal && !isAbortSignal(filtersOrSignal);
    const filters = hasFilters ? filtersOrSignal : {};
    const abortSignal = hasFilters ? maybeAbortSignal : filtersOrSignal;

    const params = {};
    ['warehouseId', 'zoneId', 'locatorId', 'binId'].forEach((key) => {
        const value = filters?.[key];
        if (value !== undefined && value !== null && value !== '') {
            params[key] = value;
        }
    });

    try {
        const res = await api.get(`/api/inventory/stock-availability/by-code/${itemCode}`, {
            params,
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            return null; // Return null intentionally to handle in UI
        }
        console.error("Failed to fetch stock availability", error);
        throw error;
    }
};
