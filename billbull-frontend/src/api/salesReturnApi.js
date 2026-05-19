import api from "./axiosConfig";

const BASE_URL = "/api/sales/returns";

// --------------------
// GET ALL RETURNS
// --------------------
export const getAllSalesReturns = async () => {
    const res = await api.get(BASE_URL);
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
export const updateSalesReturnStatus = async (id, status) => {
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
