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

export const getAdvanceSummary = async (customerCode) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/summary`);
    return res.data;
};

export const getAdvanceHistory = async (customerCode, filter) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/history`, {
        params: filter && filter !== 'All' ? { filter } : {}
    });
    return res.data;
};

export const receiveAdvance = async ({ customerCode, amount, paymentMode, reference, terminalId }) => {
    const res = await api.post(`${BASE_PATH}/receive`, {
        customerCode,
        amount,
        paymentMode,
        reference,
        terminalId
    });
    return res.data;
};

export const refundAdvance = async ({ advanceReceiptId, amount, paymentMode }) => {
    const res = await api.post(`${BASE_PATH}/refund`, {
        advanceReceiptId,
        amount,
        paymentMode
    });
    return res.data;
};
