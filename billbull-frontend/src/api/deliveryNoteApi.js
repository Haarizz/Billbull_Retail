import api from "./axiosConfig";

// LIST
export const getDeliveryNotes = () =>
  api.get("/api/delivery-notes").then(res => res.data);

// GET ONE
export const getDeliveryNoteById = (id) =>
  api.get(`/api/delivery-notes/${id}`).then(res => res.data);

// CREATE
export const createDeliveryNote = (payload) =>
  api.post("/api/delivery-notes", payload).then(res => res.data);

// UPDATE
export const updateDeliveryNote = (id, payload) =>
  api.put(`/api/delivery-notes/${id}`, payload).then(res => res.data);

// ADVANCE STATUS (Draft → Dispatched → Delivered)
export const advanceDeliveryNoteStatus = (id, receivedBy = "") =>
  api.post(`/api/delivery-notes/${id}/advance-status`, null, {
    params: { receivedBy }
  }).then(res => res.data);

// DELETE (optional)
export const deleteDeliveryNote = (id) =>
  api.delete(`/api/delivery-notes/${id}`);

// CANCEL
export const cancelDeliveryNote = (id) =>
  api.post(`/api/delivery-notes/${id}/cancel`).then(res => res.data);

// GET UN-INVOICED DNs FOR CUSTOMER (Before Sale modal)
export const getUninvoicedDNsForCustomer = (customerCode) =>
  api.get(`/api/delivery-notes/uninvoiced/${customerCode}`).then(res => res.data);

