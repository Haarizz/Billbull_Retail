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

export const hasAdvanceHistory = async (customerCode) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/has-history`);
    return res.data?.hasHistory === true;
};

export const applyAdvanceAgainstOutstanding = async ({ customerCode, advanceReceiptId }) => {
    const res = await api.post(`${BASE_PATH}/apply-against-outstanding`, { customerCode, advanceReceiptId });
    return res.data;
};
