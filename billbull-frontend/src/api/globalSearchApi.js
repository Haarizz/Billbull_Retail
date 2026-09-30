// Shared global-search service.
//
// Extracted (behaviour-preserving) from billbull-dashboard-service.ts so the
// dashboard dropdown and the global search modal run the same fan-out, the same
// cache and the same result shape. The dashboard keeps calling this through its
// own thin wrapper; nothing about its on-screen behaviour changes.
//
// Adding a category later means appending one entry to SEARCH_SOURCES — the
// orchestration below is category-agnostic.

import api from "./axiosConfig";

// ==================== CATEGORIES ====================

export const SEARCH_CATEGORY = {
  ALL: "all",
  PRODUCTS: "products",
  CUSTOMERS: "customers",
  VENDORS: "vendors",
  LEDGER: "ledger",
  EMPLOYEES: "employees",
};

// ==================== CONSTANTS ====================

/** Default cap on the combined result list. Callers may raise it per call. */
const SEARCH_RESULT_LIMIT = 12;
const SEARCH_CACHE_TTL = 30_000;
const SEARCH_CACHE_MAX_ENTRIES = 50;
const MIN_QUERY_LENGTH = 2;

/** The debounce the dashboard input already uses — kept here so callers agree. */
export const SEARCH_DEBOUNCE_MS = 200;

// ==================== SEARCH SOURCES ====================

// One entry per backend call the search fans out to. Kept as data so results can
// render the moment each source lands instead of waiting on the slowest endpoint,
// while the array order still fixes the grouping on screen.
//
// `category` places the source under a modal tab; every source participates in
// "all". `permission` is the module key a caller may use to skip a source it
// knows will 403 — a UX measure to avoid toast spam, never a security boundary
// (the backend gates each endpoint itself).
/**
 * Joins the parts of a subtitle that are actually present. The older sources
 * interpolate directly and can leave a dangling " • " when a field is missing;
 * the sources added later use this instead rather than inventing placeholders.
 */
const joinParts = (...parts) =>
  parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((p) => p !== "")
    .join(" • ");

/**
 * The price a product sells at. `retailPrice` is the field the backend actually stores
 * (ProductPricing / ProductBranchPricing have no `sellingPrice`), and the precedence
 * below is the one pages/Sales/POS/posUtils.js already applies: the branch-effective
 * figure the server resolved wins over the base row. Nothing is derived here.
 */
export const productSellingPrice = (raw) =>
  raw?.effectivePricing?.retailPrice
  ?? raw?.activeBranchPrice?.retailPrice
  ?? raw?.pricing?.retailPrice
  ?? raw?.retailPrice
  ?? raw?.sellingPrice
  ?? null;

const SEARCH_SOURCES = [
  {
    key: "products",
    category: SEARCH_CATEGORY.PRODUCTS,
    permission: "inventory.product",
    limit: 3,
    request: (q, signal) => api.get("/api/products/search", { params: { q, size: 3 }, signal }),
    // Empty-query preview. `preview=true` is what makes a blank q mean "the first few
    // rows" — without it the endpoint still returns nothing, so no other caller's empty
    // query turns into a table read. See ProductController#searchExact.
    preview: (size, signal) =>
      api.get("/api/products/search", { params: { preview: true, size }, signal }),
    // The endpoint returns ProductAggregateResponse, whose fields live under `product`
    // (name/sku/code/department) with pricing alongside. `flatten` also accepts a
    // already-flat row so a caller handing over a plain product object still maps.
    map: (raw) => {
      const p = raw?.product ?? raw;
      return {
        id: String(p?.id ?? raw?.id ?? ""),
        type: "product",
        // Product.code is what GET /api/inventory/stock-availability/by-code/{itemCode}
        // looks up (ProductRepository.findByCodeAndIsActiveTrue), so the details panel
        // can go straight to stock without a second product lookup.
        code: p?.code ? String(p.code) : undefined,
        title: String(p?.name ?? ""),
        subtitle: joinParts(p?.sku ?? p?.code, p?.department?.name),
        meta: {
          badge: `Stock: ${raw?.stock ?? p?.quantity ?? 0}`,
          rightTag: productSellingPrice(raw) != null
            ? `AED ${Number(productSellingPrice(raw)).toLocaleString()}`
            : undefined,
        },
      };
    },
  },
  {
    key: "customers",
    category: SEARCH_CATEGORY.CUSTOMERS,
    permission: "sales.customer",
    limit: 3,
    request: (q, signal) => api.get("/api/sales/customer-ledger/search", { params: { q, size: 3 }, signal }),
    preview: (size, signal) =>
      api.get("/api/sales/customer-ledger/search", { params: { preview: true, size }, signal }),
    // The branch is part of the subtitle for the same reason it is on the vendor and
    // employee rows: search is cross-branch for users who can reach every branch, and a
    // result whose branch is invisible makes the destination unpredictable.
    map: (c) => ({
      id: String(c.id ?? ""),
      type: "customer",
      title: String(c.name ?? c.customerName ?? ""),
      subtitle: joinParts(c.code, c.mobile ?? c.phone ?? c.email, c.branchEntity?.name ?? c.branch),
      meta: { badge: c.groupType ?? "Customer" },
    }),
  },
  {
    key: "vendors",
    category: SEARCH_CATEGORY.VENDORS,
    permission: "purchases.vendor",
    limit: 3,
    request: (q, signal) => api.get("/api/vendors/search", { params: { q, size: 3 }, signal }),
    preview: (size, signal) =>
      api.get("/api/vendors/search", { params: { preview: true, size }, signal }),
    // Backed by VendorSearchResponse: id, code, name, email, contact, mobile,
    // status, branch. No balance is returned, so no right-hand amount tag.
    map: (v) => ({
      id: String(v.id ?? ""),
      type: "vendor",
      title: String(v.name ?? ""),
      subtitle: joinParts(v.code, v.contact ?? v.mobile ?? v.email, v.branch),
      meta: { badge: v.status || undefined },
    }),
  },
  {
    key: "ledger",
    category: SEARCH_CATEGORY.LEDGER,
    permission: "finance.ledger",
    limit: 3,
    request: (q, signal) => api.get("/api/ledger/accounts/search", { params: { q, size: 3 }, signal }),
    preview: (size, signal) =>
      api.get("/api/ledger/accounts/search", { params: { preview: true, size }, signal }),
    // Backed by AccountSearchResponse: id, code, name, accountType,
    // accountGroup, status, isGroup. Balances are a Phase 2B concern.
    map: (a) => ({
      id: String(a.id ?? a.code ?? ""),
      type: "ledger",
      // Every ledger read downstream is keyed by account code, not by the account's
      // surrogate id — see GlAccountBalanceRepository.findByAccountCode.
      code: a.code ? String(a.code) : undefined,
      title: String(a.name ?? ""),
      subtitle: joinParts(a.code ? `Acc ${a.code}` : null, a.accountGroup),
      meta: { badge: a.accountType || undefined },
    }),
  },
  {
    key: "employees",
    category: SEARCH_CATEGORY.EMPLOYEES,
    permission: "hr.employee",
    limit: 3,
    request: (q, signal) => api.get("/api/employees/search", { params: { q, size: 3 }, signal }),
    preview: (size, signal) =>
      api.get("/api/employees/search", { params: { preview: true, size }, signal }),
    // Backed by EmployeeSearchResponse: id, employeeCode, name, role,
    // department, branch, status. Carries no payroll/attendance/leave data.
    //
    // The identity fields are carried through individually as well as joined into the
    // subtitle, because the employee detail panel renders from this row alone. It has
    // no detail fetch of its own on purpose: GET /api/employees/{id} returns the whole
    // Employee, salary columns included, and the panel must never hold that payload.
    map: (e) => ({
      id: String(e.id ?? ""),
      type: "employee",
      title: String(e.name ?? ""),
      subtitle: joinParts(e.employeeCode, e.role ?? e.department, e.branch),
      meta: { badge: e.status || undefined },
      employee: {
        employeeCode: e.employeeCode ?? null,
        name: e.name ?? null,
        role: e.role ?? null,
        department: e.department ?? null,
        branch: e.branch ?? null,
        status: e.status ?? null,
      },
    }),
  },
  {
    key: "invoices",
    // Sales/purchase documents have no tab of their own in the modal design;
    // they still belong to "All", which is what the dashboard dropdown searches.
    category: "invoices",
    permission: "sales.invoice",
    limit: 3,
    request: (q, signal) => api.get("/api/sales/invoices/page", { params: { search: q, size: 3 }, signal }),
    map: (inv) => ({
      id: String(inv.id ?? ""),
      type: "invoice",
      title: String(inv.invoiceNumber ?? inv.id ?? ""),
      subtitle: `${inv.customerName ?? "Walk-in"} • ${inv.invoiceDate ?? ""}`,
      meta: {
        badge: inv.status ?? "Invoice",
        rightTag: inv.invoiceTotal ? `AED ${Number(inv.invoiceTotal).toLocaleString()}` : undefined,
      },
    }),
  },
  {
    key: "lpos",
    category: "lpos",
    permission: "purchases.lpo",
    limit: 2,
    request: (q, signal) => api.get("/api/lpos/page", { params: { search: q, size: 3 }, signal }),
    map: (lpo) => ({
      id: String(lpo.dbId ?? lpo.id ?? ""),
      type: "lpo",
      title: String(lpo.id ?? lpo.dbId ?? ""),
      subtitle: `${lpo.vendorName ?? ""} • ${lpo.status ?? ""}`,
      meta: {
        badge: "LPO",
        rightTag: lpo.totalValue ? `AED ${Number(lpo.totalValue).toLocaleString()}` : undefined,
      },
    }),
  },
  {
    key: "grns",
    category: "grns",
    permission: "purchases.grn",
    limit: 2,
    request: (q, signal) => api.get("/api/grns/page", { params: { search: q, size: 3 }, signal }),
    map: (grn) => ({
      id: String(grn.id ?? ""),
      type: "grn",
      title: String(grn.idDisplay ?? grn.id ?? ""),
      subtitle: `${grn.vendor ?? ""} • ${grn.date ?? ""}`,
      meta: {
        badge: "GRN",
        rightTag: grn.value ? `AED ${Number(grn.value).toLocaleString()}` : undefined,
      },
    }),
  },
  {
    key: "quotations",
    category: "quotations",
    permission: "sales.quotation",
    limit: 2,
    request: (q, signal) => api.get("/api/sales/quotations/page", { params: { search: q, size: 3 }, signal }),
    map: (q) => ({
      id: String(q.id ?? ""),
      type: "quotation",
      title: String(q.quotationNumber ?? q.id ?? ""),
      subtitle: `${q.customerName ?? ""} • ${q.quotationDate ?? q.createdAt ?? ""}`,
      meta: {
        badge: q.status ?? "Quote",
        rightTag:
          q.totalAmount ?? q.grandTotal
            ? `AED ${Number(q.totalAmount ?? q.grandTotal ?? 0).toLocaleString()}`
            : undefined,
      },
    }),
  },
];

const hasSourceFor = (category) => SEARCH_SOURCES.some((s) => s.category === category);

/**
 * The sources the dashboard dropdown searches.
 *
 * <p>Pinned deliberately: the dropdown can only usefully show results it is able to
 * open, so a source belongs here only once `entityNavigation` has a verified route
 * contract for its type. Otherwise the dashboard silently starts returning rows that do
 * nothing when clicked.
 *
 * <p>Vendors and ledger accounts have now met that bar — `entitySectionForResult` maps
 * both to destinations whose pages provably read the state key (`vendor-detail` →
 * Vendor.jsx's `vendorId`, `ledger-account-detail` → Ledger.jsx's `accountCode`, which
 * is why that contract carries the code rather than the surrogate id).
 *
 * <p>Employees are deliberately NOT here, and not because the route is missing — it
 * exists. The dashboard dropdown is the most ambiently-visible search surface in the
 * app, and employee records are the ones whose accidental display costs the most. The
 * global search modal, which a user opens on purpose, is the right place for them.
 */
export const DASHBOARD_SEARCH_SOURCE_KEYS = [
  "products",
  "customers",
  "invoices",
  "lpos",
  "grns",
  "quotations",
  "vendors",
  "ledger",
];

/** Result cap the global search modal uses, so its "All" tab can show every category. */
export const MODAL_SEARCH_RESULT_LIMIT = 20;

/**
 * Tab metadata for the modal. Every tab now has a backing search source, so
 * `supported` is true throughout; it is derived from SEARCH_SOURCES rather than
 * hardcoded so a tab added ahead of its endpoint says "not available yet"
 * instead of showing a permanently empty list.
 */
export const GLOBAL_SEARCH_CATEGORIES = [
  { id: SEARCH_CATEGORY.ALL, label: "All", permission: null },
  { id: SEARCH_CATEGORY.PRODUCTS, label: "Products", permission: "inventory.product" },
  { id: SEARCH_CATEGORY.CUSTOMERS, label: "Customers", permission: "sales.customer" },
  { id: SEARCH_CATEGORY.VENDORS, label: "Vendors", permission: "purchases.vendor" },
  { id: SEARCH_CATEGORY.LEDGER, label: "Ledger", permission: "finance.ledger" },
  { id: SEARCH_CATEGORY.EMPLOYEES, label: "Employees", permission: "hr.employee" },
].map((c) => ({
  ...c,
  supported: c.id === SEARCH_CATEGORY.ALL ? true : hasSourceFor(c.id),
}));

export const isCategorySupported = (category) =>
  GLOBAL_SEARCH_CATEGORIES.find((c) => c.id === category)?.supported ?? false;

// ==================== CACHE ====================

// Typing "INV-2026-0185" issues a request per prefix; backspacing or re-typing a
// term then costs nothing. Only completed (non-aborted) result sets land here.
const searchCache = new Map();

const readSearchCache = (key) => {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts >= SEARCH_CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  return hit.data;
};

const writeSearchCache = (key, data) => {
  // Plain FIFO eviction — the map keeps insertion order, so the oldest key is first.
  if (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, { data, ts: Date.now() });
};

/** Exposed for tests and for a hard refresh after a permission change. */
export const clearGlobalSearchCache = () => searchCache.clear();

// ==================== ORCHESTRATION ====================

const selectSources = (category, canView, sourceKeys) => {
  const allowed = Array.isArray(sourceKeys)
    ? SEARCH_SOURCES.filter((s) => sourceKeys.includes(s.key))
    : SEARCH_SOURCES;

  const inCategory =
    !category || category === SEARCH_CATEGORY.ALL
      ? allowed
      : allowed.filter((s) => s.category === category);

  // A caller that knows the user's module permissions can skip sources that
  // would only 403 — the global axios interceptor toasts on every 403, so an
  // unfiltered fan-out would toast once per denied source per keystroke.
  if (typeof canView !== "function") return inCategory;
  return inCategory.filter((s) => !s.permission || canView(s.permission));
};

/**
 * Fans out across every selected search source. `onPartial` fires each time a
 * source resolves, carrying the full ordered list built so far, so the UI can
 * paint early hits while the slower endpoints are still running. Pass a `signal`
 * to drop a superseded keystroke's requests.
 *
 * @param {string} query
 * @param {{ signal?: AbortSignal, onPartial?: (results: any[]) => void,
 *           category?: string, canView?: (module: string) => boolean,
 *           sourceKeys?: string[], maxResults?: number }} opts
 */
export async function globalSearch(query, opts = {}) {
  const term = (query ?? "").trim();
  if (term.length < MIN_QUERY_LENGTH) return { success: true, data: [] };

  const sources = selectSources(opts.category, opts.canView, opts.sourceKeys);
  if (sources.length === 0) return { success: true, data: [] };

  const maxResults = opts.maxResults ?? SEARCH_RESULT_LIMIT;

  // The enabled-source signature keeps a permission-filtered result set from
  // being served to a broader search of the same term.
  const key = `${opts.category ?? SEARCH_CATEGORY.ALL}|${sources.map((s) => s.key).join(",")}|${maxResults}|${term.toLowerCase()}`;
  const cached = readSearchCache(key);
  if (cached) return { success: true, data: cached };

  // One bucket per source keeps the grouped ordering stable regardless of which
  // request happens to finish first.
  const buckets = sources.map(() => []);
  const collect = () => buckets.flat().slice(0, maxResults);

  await Promise.all(
    sources.map(async (source, index) => {
      try {
        const res = await source.request(term, opts.signal);
        const raw = Array.isArray(res?.data) ? res.data : (res?.data?.content ?? []);
        buckets[index] = raw.slice(0, source.limit).map(source.map);
      } catch {
        buckets[index] = [];
      }
      if (!opts.signal?.aborted) opts.onPartial?.(collect());
    })
  );

  const results = collect();
  if (opts.signal?.aborted) return { success: true, data: results };
  writeSearchCache(key, results);
  return { success: true, data: results };
}

/**
 * Rows per category in the empty-query preview. Deliberately tiny: the modal opens on
 * something to look at, not on a list to read.
 */
export const PREVIEW_PER_CATEGORY = 2;

const previewSources = (category, canView) =>
  SEARCH_SOURCES
    // Only the five categories that have a tab take part. Invoices, LPOs, GRNs and
    // quotations have no tab of their own, so a preview row for one could not be
    // narrowed down to its own list — and they carry no preview request either.
    .filter((s) => typeof s.preview === "function")
    .filter((s) => !category || category === SEARCH_CATEGORY.ALL || s.category === category)
    .filter((s) => typeof canView !== "function" || !s.permission || canView(s.permission));

/**
 * The bounded suggestion list the global search modal shows before anything is typed.
 *
 * <p>Not a search with an empty term — each source calls its own `preview=true`
 * endpoint, which returns the head of that module's own default ordering, capped in the
 * database. A category the caller cannot view is never requested, so the preview cannot
 * toast a 403 either.
 *
 * <p>At most `perCategory` rows per source, so the "All" tab is bounded by construction
 * rather than by a trailing slice: five categories × 2 = 10.
 *
 * @param {{ signal?: AbortSignal, onPartial?: (results: any[]) => void,
 *           category?: string, canView?: (module: string) => boolean,
 *           perCategory?: number }} opts
 */
export async function globalSearchPreview(opts = {}) {
  const sources = previewSources(opts.category, opts.canView);
  if (sources.length === 0) return { success: true, data: [] };

  const perCategory = opts.perCategory ?? PREVIEW_PER_CATEGORY;

  const key = `preview|${opts.category ?? SEARCH_CATEGORY.ALL}|${sources.map((s) => s.key).join(",")}|${perCategory}`;
  const cached = readSearchCache(key);
  if (cached) return { success: true, data: cached };

  // Same bucket-per-source shape as globalSearch, so the grouped order on screen does
  // not depend on which endpoint answers first.
  const buckets = sources.map(() => []);
  const collect = () => buckets.flat();

  await Promise.all(
    sources.map(async (source, index) => {
      try {
        const res = await source.preview(perCategory, opts.signal);
        const raw = Array.isArray(res?.data) ? res.data : (res?.data?.content ?? []);
        // Capped again on the client: the server clamp is the guarantee, this is the
        // contract this UI depends on (2 per category, whatever a server default says).
        buckets[index] = raw.slice(0, perCategory).map(source.map);
      } catch {
        buckets[index] = [];
      }
      if (!opts.signal?.aborted) opts.onPartial?.(collect());
    })
  );

  const results = collect();
  if (opts.signal?.aborted) return { success: true, data: results };
  writeSearchCache(key, results);
  return { success: true, data: results };
}

export default { globalSearch, globalSearchPreview, clearGlobalSearchCache };
