
import api from './axiosConfig';

export const getPostedPurchaseInvoices = async () => {
  try {
    const response = await api.get(`/api/purchase-invoices/posted-for-payment`);
    return response.data;
  } catch (error) {
    console.error("Error fetching posted purchase invoices", error);
    throw error;
  }
};

export const getInvoices = async () => {
  try {
    const response = await api.get(`/api/purchase-invoices`);
    return response.data;
  } catch (error) {
    console.error("Error fetching purchase invoices", error);
    throw error;
  }
};

export const getInvoiceById = async (id) => {
  try {
    const response = await api.get(`/api/purchase-invoices/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching purchase invoice details", error);
    throw error;
  }
};

export const createDraftInvoice = async (data) => {
  try {
    const response = await api.post(`/api/purchase-invoices/draft`, data);
    return response;
  } catch (error) {
    console.error("Error creating draft invoice", error);
    throw error;
  }
};

export const submitInvoice = async (id) => {
  try {
    const response = await api.post(`/api/purchase-invoices/${id}/submit`);
    return response.data;
  } catch (error) {
    console.error("Error submitting invoice", error);
    throw error;
  }
};

export const approveInvoice = async (id) => {
  try {
    const response = await api.post(`/api/purchase-invoices/${id}/approve`);
    return response.data;
  } catch (error) {
    console.error("Error approving invoice", error);
    throw error;
  }
};

export const recordPayment = async (id, amount) => {
  try {
    const response = await api.post(`/api/purchase-invoices/${id}/payment?amount=${amount}`);
    return response.data;
  } catch (error) {
    console.error("Error recording payment", error);
    throw error;
  }
};

// Alias for PaymentVoucher.jsx
export const getPostedInvoicesForPayment = getPostedPurchaseInvoices;
