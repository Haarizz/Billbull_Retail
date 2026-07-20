import api from "./axiosConfig";

const BASE_URL = "/api/sales/invoices";

// Activity timeline for one invoice. The backend returns stored events merged with
// events derived from the invoice's own columns, so invoices that predate the
// history table still show what can be known honestly. Derived document-lineage
// rows come back with timestamp=null and derived=true.
export const getSalesInvoiceHistory = async (id) => {
    const res = await api.get(`${BASE_URL}/${id}/history`);
    return res.data;
};
