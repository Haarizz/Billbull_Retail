import api from "./axiosConfig";

const BASE_URL = "/api/sales/returns";

// --------------------
// GET ALL RETURNS
// --------------------
export const getAllSalesReturns = async () => {
    const res = await api.get(BASE_URL);
    return res.data;
};

export const getSalesReturnsPage = async ({ page = 0, size = 30, search = "", status = "", fromDate, toDate } = {}) => {
    const res = await api.get(`${BASE_URL}/page`, { params: { page, size, search, status, fromDate, toDate } });
    return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getSalesReturnById = async (id) => {
    const res = await api.get(`${BASE_URL}/${id}`);
    return res.data;
};

// --------------------
// GET NEXT RETURN NUMBER
// --------------------
export const getNextSalesReturnNumber = async () => {
    const res = await api.get(`${BASE_URL}/next-number`);
    return res.data.returnNumber;
};

// --------------------
// GET RETURN STATS
// --------------------
export const getSalesReturnStats = async () => {
    const res = await api.get(`${BASE_URL}/stats`);
    return res.data;
};

// --------------------
// CREATE OR UPDATE
// --------------------
export const saveSalesReturn = async (payload) => {
    const res = await api.post(BASE_URL, payload);
    return res.data;
};

// --------------------
// UPDATE STATUS
// --------------------
/**
 * Transitions a return's status. Approving is what moves stock, posts to the GL, and pays
 * cash out of the drawer.
 *
 * When the return is gated by policy (§15), pass supervisor credentials as the third
 * argument. They travel in the request body, never the query string, so they are not written
 * to access logs or browser history. The backend verifies them server-side and rejects an
 * approval that needs sign-off and does not carry it — the dialog is a convenience, not the
 * control.
 *
 * @param {{supervisorUsername: string, supervisorPassword: string}} [authorization]
 */
export const updateSalesReturnStatus = async (id, status, authorization = null) => {
    const res = await api.put(
        `${BASE_URL}/${id}/status`,
        authorization
            ? {
                supervisorUsername: authorization.supervisorUsername,
                supervisorPassword: authorization.supervisorPassword,
            }
            : null,
        { params: { status } }
    );
    return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteSalesReturn = async (id) => {
    await api.delete(`${BASE_URL}/${id}`);
};

// --------------------
// GET RETURNABLE BATCHES FOR INVOICE
// --------------------
export const getReturnableBatches = async (invoiceNumber) => {
    const res = await api.get(`${BASE_URL}/returnable-batches`, {
        params: { invoiceNumber }
    });
    return res.data;
};

// ============================================================================
// SHARED SALES RETURN WORKFLOW
//
// These back BOTH entry points — POS → Actions → Return and
// Customer & Sales → Sales Return. There is deliberately no POS-specific
// variant: one API surface, one business layer (§27).
// ============================================================================

/**
 * §8 — Find the original invoice. Matches invoice number, POS receipt number,
 * customer name, customer code, or customer mobile. Results are branch-scoped
 * by the backend.
 */
export const searchReturnInvoices = async (query) => {
    const res = await api.get(`${BASE_URL}/invoice-search`, { params: { query } });
    return res.data;
};

/**
 * §9 — Eligibility for one invoice, with every sold line, its returnable
 * ceiling, and batch lots.
 *
 * Advisory only. The backend re-runs these checks under row locks when the
 * return is confirmed, so a return that looks eligible here can still be
 * rejected at confirm time (§29). Never treat this as permission to write.
 */
export const getReturnEligibility = async (invoiceNumber) => {
    const res = await api.get(`${BASE_URL}/eligibility`, { params: { invoiceNumber } });
    return res.data;
};

/**
 * §12/§14 — Condition, reason, and refund-method vocabularies. Served from the
 * backend so the two entry points cannot drift apart.
 */
export const getReturnOptions = async () => {
    const res = await api.get(`${BASE_URL}/options`);
    return res.data;
};
