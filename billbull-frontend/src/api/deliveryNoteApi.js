import api from "./axiosConfig";

// QA-040: send the designed-template DN email.
export const sendDeliveryNoteEmail = async (
  id,
  { toEmail = "", subject = "", htmlBody = "", inlineAttachments = [] } = {}
) => {
  try {
    const res = await api.post(`/api/delivery-notes/${id}/send-email`, {
      toEmail, subject, htmlBody, inlineAttachments,
    });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data || "Failed to send email");
  }
};

// LIST
export const getDeliveryNotes = () =>
  api.get("/api/delivery-notes").then(res => res.data);

export const getDeliveryNotesPage = ({ page = 0, size = 30, search = "", status = "" } = {}) =>
  api.get("/api/delivery-notes/page", { params: { page, size, search, status } }).then(res => res.data);

export const getPickingNotes = async (deliveryNotes = null) => {
  const notes = deliveryNotes ?? await getDeliveryNotes();
  return Array.isArray(notes)
    ? notes.filter(note =>
        note?.type === "Picking" ||
        (note?.type === "Before Sale" && note?.proformaNo)
      )
    : [];
};

// GET ONE
export const getDeliveryNoteById = (id) =>
  api.get(`/api/delivery-notes/${id}`).then(res => res.data);

export const getNextDeliveryNoteNumber = () =>
  api.get("/api/delivery-notes/next-number").then(res => res.data.dnNumber);

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

export const saveDeliveryNoteBatchSelection = (dnId, itemId, payload) =>
  api.post(`/api/delivery-notes/${dnId}/items/${itemId}/batch-selection`, payload).then(res => res.data);

export const clearDeliveryNoteBatchSelection = (dnId, itemId) =>
  api.delete(`/api/delivery-notes/${dnId}/items/${itemId}/batch-selection`).then(res => res.data);

// GET UN-INVOICED DNs FOR CUSTOMER (Before Sale modal)
export const getUninvoicedDNsForCustomer = (customerCode) =>
  api.get(`/api/delivery-notes/uninvoiced/${customerCode}`).then(res => res.data);

