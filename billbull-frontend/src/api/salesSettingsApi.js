import api from "./axiosConfig";

const BASE_URL = "/api/sales/settings";

/**
 * GET /api/sales/settings
 * Returns the current Sales module settings.
 */
export const getSalesSettings = async () => {
    const res = await api.get(BASE_URL);
    return res.data;
};

/**
 * PUT /api/sales/settings
 * Saves and returns the updated Sales module settings.
 * @param {Object} settings - { stockCheckRequired, creditLimitPolicy, salesMode, documentNumbering }
 */
export const saveSalesSettings = async (settings) => {
    const res = await api.put(BASE_URL, settings);
    return res.data;
};
