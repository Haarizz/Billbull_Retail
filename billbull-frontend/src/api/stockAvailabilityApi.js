import api from './axiosConfig';

export const getStockAvailability = async (itemCode, abortSignal) => {
    try {
        const res = await api.get(`/api/inventory/stock-availability/by-code/${itemCode}`, {
            signal: abortSignal
        });
        return res.data;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            console.log("Stock availability request aborted");
            return null; // Return null intentionally to handle in UI
        }
        console.error("Failed to fetch stock availability", error);
        throw error;
    }
};
