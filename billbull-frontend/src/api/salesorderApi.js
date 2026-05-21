import api from "./axiosConfig";

const BASE_URL = "/api/sales/sales-orders";

// --------------------
// GET ALL SALES ORDERS
// --------------------
export const getAllSalesOrders = async () => {
  const res = await api.get(BASE_URL);
  return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getSalesOrderById = async (id) => {
  const res = await api.get(`${BASE_URL}/${id}`);
  return res.data;
};

export const getNextSalesOrderNumber = async () => {
  const res = await api.get(`${BASE_URL}/next-number`);
  return res.data.soNumber;
};

// --------------------
// CREATE OR UPDATE
// --------------------
export const saveSalesOrder = async (payload) => {
  const res = await api.post(BASE_URL, payload);
  return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteSalesOrder = async (id) => {
  await api.delete(`${BASE_URL}/${id}`);
};

// --------------------
// UPDATE STATUS
// --------------------
export const updateSalesOrderStatus = async (id, status) => {
  const res = await api.put(
    `${BASE_URL}/${id}/status`,
    null,
    { params: { status } }
  );
  return res.data;
};

export const saveSalesOrderBatchSelection = async (orderId, itemId, payload) => {
  const res = await api.post(`${BASE_URL}/${orderId}/items/${itemId}/batch-selection`, payload);
  return res.data;
};

export const clearSalesOrderBatchSelection = async (orderId, itemId) => {
  const res = await api.delete(`${BASE_URL}/${orderId}/items/${itemId}/batch-selection`);
  return res.data;
};

// --------------------
// UPLOAD ATTACHMENT
// --------------------
export const uploadSalesOrderAttachment = async (id, file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await api.post(`${BASE_URL}/${id}/attachments`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
};
