import api from "./axiosConfig";

const BASE_URL = "/api/sales/payments";

// --------------------
// GET ALL PAYMENTS
// --------------------
export const getAllSalesPayments = async () => {
    const res = await api.get(BASE_URL);
    return res.data;
};

export const getSalesPaymentsPage = async ({ page = 0, size = 30, search = "", status = "", fromDate, toDate } = {}) => {
    const res = await api.get(`${BASE_URL}/page`, { params: { page, size, search, status, fromDate, toDate } });
    return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getSalesPaymentById = async (id) => {
    const res = await api.get(`${BASE_URL}/${id}`);
    return res.data;
};

// --------------------
// GET BY CUSTOMER
// --------------------
export const getSalesPaymentsByCustomer = async (customerCode) => {
    const res = await api.get(`${BASE_URL}/customer/${customerCode}`);
    return res.data;
};

// --------------------
// GET BY INVOICE
// --------------------
export const getSalesPaymentsByInvoice = async (invoiceNumber) => {
    const res = await api.get(`${BASE_URL}/invoice/${invoiceNumber}`);
    return res.data;
};

// --------------------
// GET NEXT PAYMENT NUMBER
// --------------------
export const getNextSalesPaymentNumber = async () => {
    const res = await api.get(`${BASE_URL}/next-number`);
    return res.data.paymentNumber;
};

// --------------------
// GET PAYMENT STATS
// --------------------
export const getSalesPaymentStats = async () => {
    const res = await api.get(`${BASE_URL}/stats`);
    return res.data;
};

// --------------------
// GET OPEN (UNPAID) INVOICES FOR A CUSTOMER — for payment allocation picker
// --------------------
export const getOpenInvoicesForCustomer = async (customerCode) => {
    const res = await api.get(`/api/sales/invoices/open`, { params: { customerCode } });
    return res.data;
};

// --------------------
// CREATE OR UPDATE
// --------------------
export const saveSalesPayment = async (payload) => {
    const res = await api.post(BASE_URL, payload);
    return res.data;
};

// --------------------
// UPDATE STATUS
// --------------------
export const updateSalesPaymentStatus = async (id, status) => {
    const res = await api.put(
        `${BASE_URL}/${id}/status`,
        null,
        { params: { status } }
    );
    return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteSalesPayment = async (id) => {
    await api.delete(`${BASE_URL}/${id}`);
};
