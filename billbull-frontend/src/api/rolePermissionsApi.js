import api from "./axiosConfig";

/**
 * Role permissions API.
 * getByRole is available to all authenticated users (used by PermissionContext).
 * All other methods require ADMIN.
 */
export const rolePermissionsApi = {

  /**
   * Get all role permissions — ADMIN only.
   */
  getAll: () =>
    api.get("/api/role-permissions").then((r) => r.data),

  /**
   * Get permissions for a specific role name — any authenticated user.
   * Used by PermissionContext on login to load access rules.
   */
  getByRole: (roleName) =>
    api.get(`/api/role-permissions/by-role/${roleName}`).then((r) => r.data),

  /**
   * Get merged permissions for the current user across all their roles.
   */
  getMyPermissions: () =>
    api.get("/api/role-permissions/me").then((r) => r.data),

  /**
   * Create a new permission row — ADMIN only.
   * payload: { roleName, module, canView, canCreate, canEdit, canApprove, canExport }
   */
  create: (payload) =>
    api.post("/api/role-permissions", payload).then((r) => r.data),

  /**
   * Update an existing permission row by ID — ADMIN only.
   * payload: { canView, canCreate, canEdit, canApprove, canExport }
   */
  update: (id, payload) =>
    api.put(`/api/role-permissions/${id}`, payload).then((r) => r.data),
};
