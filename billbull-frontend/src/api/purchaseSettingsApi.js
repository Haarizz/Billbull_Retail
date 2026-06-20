import api from "./axiosConfig";

const BASE_URL = "/api/purchase/settings";

/**
 * GET /api/purchase/settings
 * Returns the current Purchase module settings (currently document numbering).
 */
export const getPurchaseSettings = async () => {
    const res = await api.get(BASE_URL);
    return res.data;
};

/**
 * PUT /api/purchase/settings
 * Saves and returns the updated Purchase module settings.
 * @param {Object} settings - { documentNumbering }
 */
export const savePurchaseSettings = async (settings) => {
    const res = await api.put(BASE_URL, settings);
    return res.data;
};
