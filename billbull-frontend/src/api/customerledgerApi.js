import api from "./axiosConfig";

const BASE_URL = "/api/sales/customer-ledger";

/* ===========================
   CUSTOMER APIs
   =========================== */

// ✅ GET all customers
export const getAllCustomers = async () => {
  const res = await api.get(BASE_URL);
  return res.data;
};

// ✅ GET customer by ID
export const getCustomerById = async (id) => {
  const res = await api.get(`${BASE_URL}/${id}`);
  return res.data;
};

// ✅ CREATE or UPDATE customer (DB SAVE)
export const createCustomer = async (payload) => {
  const res = await api.post(BASE_URL, payload);
  return res.data;
};

// ✅ DELETE customer
export const deleteCustomer = async (id) => {
  await api.delete(`${BASE_URL}/${id}`);
};

// ✅ GET opening invoices for a customer by customer code (QA-002)
export const getOpeningInvoicesByCustomerCode = async (customerCode) => {
  const res = await api.get(`${BASE_URL}/by-code/${encodeURIComponent(customerCode)}/opening-invoices`);
  return res.data;
};

/* ===========================
   STATIC DROPDOWNS (TEMP)
   =========================== */

export const getCustomerGroups = async () => {
  return ["Retail", "Wholesale", "VIP", "Corporate"];
};

export const getPriceLists = async () => {
  return ["Default", "Standard", "VIP", "Wholesale"];
};