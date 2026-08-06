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

// ----------------------------------------------------------------------
// ALLOCATION-DERIVED PAYMENT BREAKDOWN
// ----------------------------------------------------------------------

/**
 * How the given invoices were actually paid, as payment allocations reconstructed from the
 * recorded tender rows — one entry per tender, with its own amount, reference and bank.
 *
 * Back-office screens use this instead of reading an invoice's `paymentMode` text. That text
 * is a label: it cannot say how much went on each tender, and for older sales it may only say
 * "Mixed". Batched because a sales list needs the breakdown for a whole page at once.
 *
 * @param {string[]} invoiceNumbers
 * @returns {Promise<Object>} keyed by invoice number; invoices with no recorded tender are absent
 */
export const getInvoicePaymentSummaries = async (invoiceNumbers) => {
    const numbers = (invoiceNumbers || []).filter(Boolean);
    if (numbers.length === 0) return {};
    try {
        const res = await api.get(`${BASE_URL}/invoice-summary`, {
            params: { invoiceNumbers: numbers.join(",") },
        });
        return res.data || {};
    } catch (err) {
        // A breakdown is enrichment, never the reason a list fails to load — the screen
        // falls back to the invoice's stored payment mode.
        console.warn("Failed to load payment breakdowns", err);
        return {};
    }
};
