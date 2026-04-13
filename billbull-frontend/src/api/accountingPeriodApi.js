import api from "./axiosConfig";

const BASE_URL = "/api/financials/periods";

export const getAllAccountingPeriods = async () => {
    const res = await api.get(BASE_URL);
    return res.data;
};

export const createAccountingPeriod = async (periodData) => {
    const res = await api.post(BASE_URL, periodData);
    return res.data;
};

export const closeAccountingPeriod = async (id) => {
    const res = await api.post(`${BASE_URL}/${id}/close`);
    return res.data;
};
