import api from "./axiosConfig";

// --------------------
// CREATE
// --------------------
export const createPaymentVoucher = async (payload) => {
  const res = await api.post("/api/vouchers", payload);
  return res.data;
};

// --------------------
// UPDATE STATUS (Approve/Reject)
// --------------------
export const updateVoucherStatus = async (id, status) => {
  const res = await api.put(`/api/vouchers/${id}/status`, null, {
    params: { status }
  });
  return res.data;
};

// --------------------
// GET ALL
// --------------------
export const getPaymentVouchers = async () => {
  const res = await api.get("/api/vouchers");
  return res.data;
};

export const getPaymentVouchersPage = async ({ page = 0, size = 30, search = "", status = "" } = {}) => {
  const res = await api.get("/api/vouchers/page", { params: { page, size, search, status } });
  return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getPaymentVoucherById = async (id) => {
  const res = await api.get(`/api/vouchers/${id}`);
  return res.data;
};

// --------------------
// DELETE
// --------------------
export const deletePaymentVoucher = async (id) => {
  await api.delete(`/api/vouchers/${id}`);
};
