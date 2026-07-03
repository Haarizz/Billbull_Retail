import api from './axiosConfig';

const BASE_PATH = '/api/sales/advance-applications';

export const getOpenAdvances = async (customerCode) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/open-advances`);
    return res.data;
};

export const applyAdvance = async ({ advanceReceiptId, invoiceNumber, amount, appliedDate }) => {
    const res = await api.post(`${BASE_PATH}/apply`, {
        advanceReceiptId,
        invoiceNumber,
        amount,
        appliedDate,
    });
    return res.data;
};
