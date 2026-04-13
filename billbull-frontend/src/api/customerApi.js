// src/api/customerApi.js
import api from "./axiosConfig";

// ================= INQUIRIES =================

export const getInquiries = async () => {
  const res = await api.get("/api/inquiries");
  return res.data;
};

export const getInquiryById = async (id) => {
  const res = await api.get(`/api/inquiries/${id}`);
  return res.data;
};

export const createInquiry = async (payload) => {
  const res = await api.post("/api/inquiries", payload);
  return res.data;
};

export const updateInquiry = async (id, payload) => {
  const res = await api.put(`/api/inquiries/${id}`, payload);
  return res.data;
};

export const deleteInquiry = async (id) => {
  await api.delete(`/api/inquiries/${id}`);
};

export const addFollowUp = async (id, payload) => {
  const res = await api.post(`/api/inquiries/${id}/follow-up`, payload);
  return res.data;
};

export const reassignRep = async (id, assignedTo) => {
  const res = await api.put(`/api/inquiries/${id}/reassign?assignedTo=${encodeURIComponent(assignedTo)}`);
  return res.data;
};