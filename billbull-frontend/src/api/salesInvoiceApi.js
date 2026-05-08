import api from "./axiosConfig";

const BASE_URL = "/api/sales/invoices";

// --------------------
// GET ALL SALES INVOICES
// --------------------
export const getAllSalesInvoices = async () => {
    const res = await api.get(BASE_URL);
    return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getSalesInvoiceById = async (id) => {
    const res = await api.get(`${BASE_URL}/${id}`);
    return res.data;
};

// --------------------
// CREATE OR UPDATE
// --------------------
export const saveSalesInvoice = async (payload) => {
    const res = await api.post(BASE_URL, payload);
    return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteSalesInvoice = async (id) => {
    await api.delete(`${BASE_URL}/${id}`);
};

// --------------------
// GET NEXT INVOICE NUMBER
// --------------------
export const getNextInvoiceNumber = async () => {
    const res = await api.get(`${BASE_URL}/next-number`);
    return res.data.invoiceNumber;
};

// --------------------
// UPDATE STATUS
// --------------------
export const updateInvoiceStatus = async (id, status) => {
    const res = await api.put(
        `${BASE_URL}/${id}/status`,
        null,
        { params: { status } }
    );
    return res.data;
};

export const saveSalesInvoiceBatchSelection = async (invoiceId, itemId, payload) => {
    const res = await api.post(`${BASE_URL}/${invoiceId}/items/${itemId}/batch-selection`, payload);
    return res.data;
};

export const clearSalesInvoiceBatchSelection = async (invoiceId, itemId) => {
    const res = await api.delete(`${BASE_URL}/${invoiceId}/items/${itemId}/batch-selection`);
    return res.data;
};

// --------------------
// RECORD PAYMENT
// --------------------
export const recordInvoicePayment = async (id, amount) => {
    const payload = typeof amount === 'object' && amount !== null ? amount : { amount };
    const endpoint = payload.paymentMode || payload.paymentReference || payload.paymentDate
        ? `${BASE_URL}/${id}/payment-detailed`
        : `${BASE_URL}/${id}/payment`;
    const res = await api.post(endpoint, payload);
    return res.data;
};

// --------------------
// GET ITEM PRICE HISTORY
// --------------------
export const getItemPriceHistory = async (itemCode) => {
    const res = await api.get(`${BASE_URL}/price-history/${itemCode}`);
    return res.data;
};
