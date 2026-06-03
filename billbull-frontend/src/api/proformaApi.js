import api from "./axiosConfig";

// QA-040: send the designed-template Proforma email.
export const sendProformaEmail = async (
  id,
  { toEmail = "", subject = "", htmlBody = "", inlineAttachments = [] } = {}
) => {
  try {
    const res = await api.post(`/api/proforma/${id}/send-email`, {
      toEmail, subject, htmlBody, inlineAttachments,
    });
    return res.data;
  } catch (err) {
    throw new Error(err?.response?.data || "Failed to send email");
  }
};

// ---- Proforma CRUD ----
export const getAllProformas = () =>
  api.get("/api/proforma").then(res => res.data);

export const getProformasPage = ({ page = 0, size = 30, search = "", status = "", fromDate, toDate } = {}) =>
  api.get("/api/proforma/page", { params: { page, size, search, status, fromDate, toDate } }).then(res => res.data);

export const getProformaById = (id) =>
  api.get(`/api/proforma/${id}`).then(res => res.data);

export const getNextProformaNumber = () =>
  api.get("/api/proforma/next-number").then(res => res.data.piNumber);

export const createProforma = (payload) =>
  api.post("/api/proforma", payload).then(res => res.data);

export const updateProforma = (id, payload) =>
  api.put(`/api/proforma/${id}`, payload).then(res => res.data);

export const deleteProforma = (id) =>
  api.delete(`/api/proforma/${id}`);

export const issueProforma = (id) =>
  api.post(`/api/proforma/${id}/issue`).then(res => res.data);
