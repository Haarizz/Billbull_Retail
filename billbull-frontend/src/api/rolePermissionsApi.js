import api from "./axiosConfig";

/**
 * Role permissions API.
 * getMyPermissions is available to all authenticated users (used by PermissionContext).
 * All other methods require ADMIN.
 */
export const rolePermissionsApi = {

  /**
   * Get all role permissions — ADMIN only.
   */
  getAll: () =>
    api.get("/api/role-permissions").then((r) => r.data),

  /**
   * Get permissions for a specific role name — ADMIN only.
   * Used by the User & Role Configuration matrix.
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
   * Partial semantics: only the flags present in the payload are changed.
   * payload: any subset of { canView, canCreate, canEdit, canDelete, canApprove, canExport }
   */
  update: (id, payload) =>
    api.put(`/api/role-permissions/${id}`, payload).then((r) => r.data),

  /**
   * Delete a permission row — restores parent-module inheritance. ADMIN only.
   */
  remove: (id) =>
    api.delete(`/api/role-permissions/${id}`),

  /**
   * Upsert a batch of rows for one role atomically — ADMIN only.
   * permissions: [{ module, canView?, canCreate?, canEdit?, canDelete?, canApprove?, canExport? }]
   */
  bulkSave: (roleName, permissions) =>
    api.post("/api/role-permissions/bulk", { roleName, permissions }).then((r) => r.data),

  /**
   * Replace toRole's permissions with a copy of fromRole's — ADMIN only.
   */
  copy: (fromRole, toRole) =>
    api.post("/api/role-permissions/copy", { fromRole, toRole }).then((r) => r.data),

  /**
   * The backend's canonical module catalog — ADMIN only.
   */
  getModuleCatalog: () =>
    api.get("/api/role-permissions/modules").then((r) => r.data),
};
