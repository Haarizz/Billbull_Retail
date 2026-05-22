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

export const getNextCustomerCode = async () => {
  const res = await api.get(`${BASE_URL}/next-code`);
  return res.data.customerCode;
};

// ✅ DELETE customer
export const deleteCustomer = async (id) => {
  await api.delete(`${BASE_URL}/${id}`);
};

// ✅ QA-028: append a new shipping address to an existing customer.
// Returns the full updated list of saved addresses for that customer.
export const addCustomerSavedAddress = async (customerId, address) => {
  const res = await api.post(`${BASE_URL}/${customerId}/saved-addresses`, address);
  return res.data;
};

// ✅ GET opening invoices for a customer by customer code (QA-002)
export const getOpeningInvoicesByCustomerCode = async (customerCode) => {
  const res = await api.get(`${BASE_URL}/by-code/${encodeURIComponent(customerCode)}/opening-invoices`);
  return res.data;
};

/* ===========================
   DROPDOWN CONSTANTS
   =========================== */

export const CUSTOMER_GROUPS = ["Retail", "Wholesale", "VIP", "Corporate"];
export const PRICE_LISTS = ["Default", "Standard", "VIP", "Wholesale"];

// Keep async wrappers for backwards compatibility with existing callers
export const getCustomerGroups = async () => CUSTOMER_GROUPS;
export const getPriceLists = async () => PRICE_LISTS;
