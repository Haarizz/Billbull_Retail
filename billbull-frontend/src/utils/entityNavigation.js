// Shared entity/route mapping.
//
// BillBull has no /entity/:id detail routes — every module is a single list page
// that opens a detail view when handed an id through react-router `state`. This
// map is the one place that contract is written down; it was previously a local
// closure inside pages/Dashboard.jsx and is now shared with the global search
// modal so the two cannot drift apart.

/**
 * section -> { path, state }. `state` here is the static part of the contract;
 * dynamic ids are filled in by the `state(params)` builders below.
 */
export const ENTITY_ROUTE_MAP = {
  "new-sale": { path: "/sales/invoice", state: () => ({ openCreate: true }) },
  "sales-invoices": { path: "/sales/invoice" },
  "sales-invoice-detail": { path: "/sales/invoice", state: (p) => ({ invoiceId: p.invoiceId }) },
  "new-purchase": { path: "/purchases/invoice", state: () => ({ openCreate: true }) },
  purchases: { path: "/purchases/invoice" },
  "lpo-detail": { path: "/purchases/lpo", state: (p) => ({ lpoNumber: p.lpoNumber }) },
  "grn-detail": { path: "/purchases/grn", state: (p) => ({ grnId: p.grnId }) },
  "quotation-detail": { path: "/sales/quotation", state: (p) => ({ quotationId: p.quotationId }) },
  "add-product": { path: "/inventory/products", state: () => ({ openCreate: true }) },
  "inventory-add-item": { path: "/inventory/products", state: () => ({ openCreate: true }) },
  "inventory-product-detail": { path: "/inventory/products", state: (p) => ({ productId: p.productId }) },
  "customers-add": { path: "/sales/customers", state: () => ({ openCreate: true }) },
  "customer-ledger": { path: "/sales/customers", state: (p) => ({ customerId: p.customerId }) },
  // Vendor.jsx selects and filters the list down to this vendor. It deliberately does NOT
  // open CreateVendorWizard: that component is the page's create/edit mutation form, and
  // landing a read-only search hit inside an edit form is not a detail view.
  "vendor-detail": { path: "/purchases/vendors", state: (p) => ({ vendorId: p.vendorId }) },
  // Ledger.jsx is keyed by account code everywhere downstream, so the contract carries the
  // code rather than the account's surrogate id, plus the tab the account lives on.
  "ledger-account-detail": {
    path: "/finance/ledger",
    state: (p) => ({ accountCode: p.accountCode, tab: "chart" }),
  },
  "employee-detail": { path: "/payroll/employees", state: (p) => ({ employeeId: p.employeeId }) },
  "stock-transfer": { path: "/inventory/stock-transfer", state: () => ({ openCreate: true }) },
  pos: { path: "/sales/pos" },
  "cash-movements": { path: "/sales/cash-movements" },
  "pos-admin": { path: "/enterprise/pos-admin" },
  "sales-return": { path: "/sales/return" },
  "financials-dashboard": { path: "/finance/reports" },
  notifications: { path: "/notifications" },
};

/**
 * Maps a normalised search result to a section + params.
 *
 * Every entry here is backed by a destination page that provably reads the state key
 * (see the navigation tests next to each page). A type with no verified consumer
 * returns null rather than navigating to an unfiltered list.
 */
export const entitySectionForResult = (result) => {
  if (!result?.type) return null;
  switch (result.type) {
    case "product":
      return { section: "inventory-product-detail", params: { productId: result.id } };
    case "customer":
      return { section: "customer-ledger", params: { customerId: result.id } };
    case "invoice":
      return { section: "sales-invoice-detail", params: { invoiceId: result.id } };
    case "lpo":
      return { section: "lpo-detail", params: { lpoId: result.id, lpoNumber: result.title } };
    case "grn":
      return { section: "grn-detail", params: { grnId: result.id } };
    case "quotation":
      return { section: "quotation-detail", params: { quotationId: result.id } };
    case "vendor":
      return { section: "vendor-detail", params: { vendorId: result.id } };
    case "ledger": {
      // The ledger page resolves accounts by code; an account with no code cannot be
      // pinned down, so it is better not to navigate than to open an unfiltered chart.
      const accountCode = result.code ?? null;
      return accountCode
        ? { section: "ledger-account-detail", params: { accountCode } }
        : null;
    }
    case "employee":
      return { section: "employee-detail", params: { employeeId: result.id } };
    default:
      return null;
  }
};

/**
 * Resolves a section (or a raw "/path") to { path, state }, or null when the
 * section is unknown. Mirrors the original Dashboard behaviour, including the
 * "a section starting with / is itself a path" fallback.
 */
export const resolveEntityRoute = (section, params = {}) => {
  const target = ENTITY_ROUTE_MAP[section];
  if (!target) {
    return section?.startsWith("/") ? { path: section, state: {} } : null;
  }
  return {
    path: target.path,
    state: typeof target.state === "function" ? target.state(params) : {},
  };
};

/**
 * Navigates to an entity. `extraState` is merged into the router state so a
 * caller can tag where the navigation came from (the dashboard sends
 * `dashboardSource: true`, which its destination pages already look for).
 *
 * @returns true when a destination was resolved, false when the section is unknown.
 */
export const navigateToEntity = (navigate, section, params = {}, extraState = {}) => {
  const target = resolveEntityRoute(section, params);
  if (!target) return false;
  navigate(target.path, { state: { ...target.state, ...extraState } });
  return true;
};

/**
 * Convenience for the global search modal: result -> navigation.
 * Returns false when the result type has no verified destination yet.
 */
export const navigateToSearchResult = (navigate, result, extraState = {}) => {
  const mapped = entitySectionForResult(result);
  if (!mapped) return false;
  return navigateToEntity(navigate, mapped.section, mapped.params, extraState);
};
