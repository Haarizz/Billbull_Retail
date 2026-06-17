import api from "./axiosConfig";

const BASE_URL = "/api/sales/quotations";

// --------------------
// GET ALL QUOTATIONS
// --------------------
export const getAllQuotations = async () => {
  const res = await api.get(BASE_URL);
  return res.data;
};

export const getQuotationsPage = async ({ page = 0, size = 30, search = "", status = "", fromDate, toDate } = {}) => {
  const res = await api.get(`${BASE_URL}/page`, { params: { page, size, search, status, fromDate, toDate } });
  return res.data;
};

export const getQuotationStats = async () => {
  const res = await api.get(`${BASE_URL}/stats`);
  return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getQuotationById = async (id) => {
  const res = await api.get(`${BASE_URL}/${id}`);
  return res.data;
};

// --------------------
// GET NEXT QUOTATION NO
// --------------------
export const getNextQuotationNo = async () => {
  try {
    const res = await api.get(`${BASE_URL}/next-qtn-no`);
    return res.data;
  } catch (err) {
    console.error("Failed to fetch next quotation no:", err);
    return "QTN-NEW";
  }
};

// --------------------
// CREATE OR UPDATE
// --------------------
export const saveQuotation = async (payload) => {
  const res = await api.post(BASE_URL, payload);
  return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteQuotation = async (id) => {
  await api.delete(`${BASE_URL}/${id}`);
};

// --------------------
// UPDATE STATUS (Approve / Reject)
// --------------------
export const updateQuotationStatus = async (id, status) => {
  try {
    const res = await api.put(
      `${BASE_URL}/${id}/status`,
      null,
      { params: { status } }
    );
    return res.data;

  } catch (err) {
    // 🔥 Normalize backend error
    const message =
      err?.response?.data ||
      err?.response?.message ||
      "Failed to update quotation status";

    // Rethrow clean message for UI
    throw new Error(message);
  }
};

// --------------------
// CREATE REVISION
// --------------------
export const createRevision = async (id, note) => {
  try {
    const res = await api.post(
      `${BASE_URL}/${id}/revise`,
      note,
      { headers: { "Content-Type": "text/plain" } }
    );
    return res.data;

  } catch (err) {
    const message =
      err?.response?.data ||
      "Failed to create quotation revision";
    throw new Error(message);
  }
};

// --------------------
// UPLOAD ATTACHMENT
// --------------------
export const uploadAttachment = async (id, file) => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await api.post(
      `${BASE_URL}/${id}/attachments`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return res.data;

  } catch (err) {
    const message =
      err?.response?.data ||
      "File upload failed";
    throw new Error(message);
  }
};

// --------------------
// STOCK CHECK (READ-ONLY)
// --------------------
export const checkQuotationStock = async (id) => {
  try {
    const res = await api.get(`${BASE_URL}/${id}/stock-check`);
    return res.data;
  } catch (err) {
    const message =
      err?.response?.data ||
      "Failed to check stock availability";
    throw new Error(message);
  }
};
// --------------------
// GET PRODUCT DETAILED STOCK
// --------------------
export const getProductStock = async (productCode) => {
  try {
    const res = await api.get(`/api/warehouses/stock/product/${productCode}`);
    return res.data;
  } catch (err) {
    const message = err?.response?.data || "Failed to fetch product stock";
    throw new Error(message);
  }
};

// --------------------
// GET ITEM PRICE HISTORY
// --------------------
export const getItemPriceHistory = async (itemCode) => {
  try {
    const res = await api.get(`/api/sales/quotations/history/item/${itemCode}`);
    return res.data;
  } catch (err) {
    const message = err?.response?.data || "Failed to fetch price history";
    throw new Error(message);
  }
};

// --------------------
// SEND QUOTATION EMAIL
// toEmail and subject are optional — if omitted, uses customer email & default subject
// --------------------
// QA-040: htmlBody is optional. When provided, the backend skips its hand-built
// Java HTML and uses this exact body — so the email mirrors whatever the user
// designed in Print & Email Templates (same renderer as Print).
export const sendQuotationEmail = async (
  id,
  { toEmail = "", subject = "", htmlBody = "", inlineAttachments = [] } = {}
) => {
  try {
    const res = await api.post(`${BASE_URL}/${id}/send-email`, {
      toEmail,
      subject,
      htmlBody,
      inlineAttachments,
    });
    return res.data;
  } catch (err) {
    const message =
      err?.response?.data ||
      "Failed to send email";
    throw new Error(message);
  }
};
