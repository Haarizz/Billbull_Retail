import api from "@billbull/shared/api/axiosConfig";

/**
 * Access-control audit log (backend security/accessaudit). Read-only by design: the ledger
 * cannot be edited or deleted through the API. View needs userManagement.audit VIEW; export
 * needs EXPORT too and is itself recorded in the log.
 *
 * filters: { from, to (ISO local date-times), actor, action, targetType, roleName, module,
 *            affectedUser, branchId, changeSetId, q }
 */
const clean = (filters = {}) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export const accessAuditApi = {
  search: (filters, page = 0, size = 50) =>
    api.get("/api/access-audit", { params: { ...clean(filters), page, size } }).then((r) => r.data),

  get: (id) =>
    api.get(`/api/access-audit/${id}`).then((r) => r.data),

  facets: () =>
    api.get("/api/access-audit/facets").then((r) => r.data),

  verify: () =>
    api.get("/api/access-audit/verify").then((r) => r.data),

  /** Resolves to { blob, filename }. */
  exportCsv: (filters) =>
    api.get("/api/access-audit/export", { params: clean(filters), responseType: "blob" }).then((r) => {
      const disposition = r.headers?.["content-disposition"] || "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      return { blob: r.data, filename: match ? match[1] : "access-audit.csv" };
    }),
};
