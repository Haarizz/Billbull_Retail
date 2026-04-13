import api from "./axiosConfig";

export const salaryAdvanceApi = {

  // ================= FETCH =================

  // Get all requests (supports filtering via query params if needed)
  getAllRequests: async () => {
    const res = await api.get("/api/salary-advances");
    return res.data;
  },

  // Get all repayment schedules
  getAllSchedules: async () => {
    const res = await api.get("/api/salary-advances/schedules");
    return res.data;
  },

  // Get Dashboard Statistics
  getStats: async () => {
    const res = await api.get("/api/salary-advances/stats");
    return res.data;
  },

  // ================= ACTIONS =================

  // Create a new request with file attachment
  createRequest: async (payload, file) => {
    const formData = new FormData();
    // Convert payload object to JSON string for the 'request' part
    formData.append(
      "request",
      new Blob([JSON.stringify(payload)], { type: "application/json" })
    );
    
    if (file) {
      formData.append("file", file);
    }

    const res = await api.post("/api/salary-advances", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  // Approve a request
  approveRequest: async (id) => {
    const res = await api.put(`/api/salary-advances/${id}/approve`);
    return res.data;
  },

  // Reject a request
  rejectRequest: async (id) => {
    const res = await api.put(`/api/salary-advances/${id}/reject`);
    return res.data;
  },

  // Delete a pending request
  deleteRequest: async (id) => {
    await api.delete(`/api/salary-advances/${id}`);
  },

  // ================= REPAYMENT OPERATIONS =================

  // Mark an installment as paid
  markInstallmentPaid: async (scheduleId) => {
    const res = await api.put(`/api/salary-advances/schedules/${scheduleId}/pay`);
    return res.data;
  },

  // Revoke the last payment
  revokePayment: async (scheduleId) => {
    const res = await api.put(`/api/salary-advances/schedules/${scheduleId}/revoke`);
    return res.data;
  }
};