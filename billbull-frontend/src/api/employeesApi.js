import api from "./axiosConfig";

export const employeesApi = {

  // ================= FETCH =================

  getAll: async () => {
    const res = await api.get("/api/employees");
    return res.data;
  },

  getActiveEmployees: async () => {
    const res = await api.get("/api/employees/active");
    return res.data;
  },

  getPendingApprovals: async () => {
    const res = await api.get("/api/employees/pending");
    return res.data;
  },

  getEmployeeById: async (id) => {
    const res = await api.get(`/api/employees/${id}`);
    return res.data;
  },

  // ================= CREATE / UPDATE =================

  createEmployee: async (payload, avatarFile) => {
    const formData = new FormData();
    formData.append(
      "employee",
      new Blob([JSON.stringify(payload)], { type: "application/json" })
    );
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    }

    const res = await api.post("/api/employees", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  updateEmployee: async (id, payload, avatarFile) => {
    const formData = new FormData();
    formData.append(
      "employee",
      new Blob([JSON.stringify(payload)], { type: "application/json" })
    );
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    }

    const res = await api.put(`/api/employees/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  // ================= STATUS =================

  deactivateEmployee: async (id) => {
    const res = await api.put(`/api/employees/${id}/deactivate`);
    return res.data;
  },

  activateEmployee: async (id) => {
    const res = await api.put(`/api/employees/${id}/activate`);
    return res.data;
  },

  // ================= APPROVAL =================

  approveEmployee: async (id) => {
    const res = await api.post(`/api/employees/${id}/approve`);
    return res.data;
  },

  rejectEmployee: async (id) => {
    const res = await api.post(`/api/employees/${id}/reject`);
    return res.data;
  },
};