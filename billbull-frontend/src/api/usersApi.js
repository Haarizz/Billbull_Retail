import api from "./axiosConfig";

/**
 * User management API — ADMIN only (except getEmployeeAccess which is also admin-only).
 * All responses are UserSafeDto — never contain passwords.
 */
export const usersApi = {

  getAll: () =>
    api.get("/api/users").then((r) => r.data),

  getById: (id) =>
    api.get(`/api/users/${id}`).then((r) => r.data),

  /**
   * Create a user with optional employee linkage.
   * payload: { username, password, fullName, email, phone, roleIds, linkedEmployeeId? }
   */
  create: (payload) =>
    api.post("/api/users", payload).then((r) => r.data),

  /**
   * Update safe fields: fullName, email, phone.
   */
  update: (id, payload) =>
    api.put(`/api/users/${id}`, payload).then((r) => r.data),

  /**
   * Assign roles to a user with an optional primary role.
   * roleIds: number[], primaryRoleId: number | null
   */
  assignRoles: (id, roleIds, primaryRoleId = null) =>
    api.post(`/api/users/${id}/roles`, { roleIds, primaryRoleId }).then((r) => r.data),

  /**
   * Freeze user (set isActive=false). Returns 409 if last active ADMIN.
   */
  freeze: (id) =>
    api.put(`/api/users/${id}/freeze`).then((r) => r.data),

  /**
   * Unfreeze user (set isActive=true).
   */
  unfreeze: (id) =>
    api.put(`/api/users/${id}/unfreeze`).then((r) => r.data),

  /**
   * Admin reset password for a user.
   */
  resetPassword: (id, newPassword) =>
    api.post(`/api/users/${id}/reset-password`, { newPassword }),

  /**
   * Delete user account only — linked employee is NOT deleted.
   * Returns 409 if last ADMIN.
   */
  deleteUser: (id) =>
    api.delete(`/api/users/${id}`),

  /**
   * Get linked user access info for an employee (ADMIN only).
   * Returns EmployeeAccessDto.
   */
  getEmployeeAccess: (employeeId) =>
    api.get(`/api/employees/${employeeId}/access`).then((r) => r.data),

  /**
   * Get all available roles (ADMIN only).
   * Returns [{ id, name, description? }]
   */
  getAllRoles: () =>
    api.get("/api/roles").then((r) => r.data),

  /**
   * Create a new role (ADMIN only).
   * payload: { name, description }
   */
  createRole: (payload) =>
    api.post("/api/roles", payload).then((r) => r.data),
};
