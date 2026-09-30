// Detail reads for the global search details panel.
//
// One function per entity type the panel can render. Each one takes the normalised
// search result plus an AbortSignal and returns a plain, already-shaped object — the
// panel components render what comes back and derive no business figures of their own.
//
// Two rules hold across this file:
//
//  * Reuse existing endpoints. Nothing here introduces a per-entity aggregation
//    endpoint; products go through the stock-availability service the inventory screens
//    already use, and ledger accounts through the two bounded account-detail reads.
//  * Never fetch a whole table. No product list, no whole ledger, no vendor/customer
//    roster — a details panel shows one selected row.

import api from "./axiosConfig";
import { productSellingPrice } from "./globalSearchApi";

/** Rows fetched for the "recent transactions" list. Clamped again server-side. */
export const LEDGER_TRANSACTION_LIMIT = 6;

/**
 * Error thrown when a detail request is denied.
 *
 * <p>The global axios interceptor already surfaces a 403 as a toast (id-deduped, so a
 * burst cannot stack). The panel needs more than that — an inline state in the pane the
 * user is looking at — so 403 is normalised here into something the hook can branch on
 * rather than being left as a bare axios error.
 */
export class EntityDetailForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "EntityDetailForbiddenError";
    this.forbidden = true;
  }
}

const isAbort = (error) =>
  error?.name === "CanceledError" || error?.code === "ERR_CANCELED" || error?.name === "AbortError";

/**
 * Runs a request, turning a 403 into {@link EntityDetailForbiddenError} and leaving
 * aborts and everything else alone.
 */
const request = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error?.response?.status === 403) throw new EntityDetailForbiddenError();
    throw error;
  }
};

/**
 * Same, but for a request whose failure must not sink the whole panel — a missing
 * optional payload resolves to null instead. A 403 still propagates: a user who may not
 * see the data should be told so, not shown a half-empty panel.
 */
const optional = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    if (isAbort(error) || error?.response?.status === 403) throw error;
    return null;
  }
};

/**
 * For a *section* of a panel rather than the panel itself.
 *
 * <p>Detail panels are assembled from more than one permission: a user may view a
 * customer (`sales.customer`) without viewing its invoices (`sales.invoice`), and a
 * vendor (`purchases.vendor`) without its purchase orders (`purchases.lpo`). Denying
 * one section must not blank the whole pane, so 403 resolves to a marker the panel
 * renders in place, and any other failure resolves to null. Aborts still propagate.
 */
const section = async (fn) => {
  try {
    return { rows: await fn() };
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error?.response?.status === 403) return { rows: null, forbidden: true };
    return { rows: null, failed: true };
  }
};

/** Rows fetched for a party's bounded "recent documents" list. Clamped again server-side. */
export const PARTY_DOCUMENT_LIMIT = 5;

// ==================== PRODUCT ====================

const toNumber = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Product details: metadata from the existing product endpoint, stock from the existing
 * stock-availability service.
 *
 * <p>`itemCode` is Product.code — that is what
 * {@code GET /api/inventory/stock-availability/by-code/{itemCode}} resolves through
 * {@code ProductRepository.findByCodeAndIsActiveTrue}. When the search result already
 * carries the code (it does, since globalSearchApi maps it off the aggregate) the two
 * requests run in parallel; only a result without one pays for a lookup first.
 *
 * <p>On Hand / Reserved / Available / Incoming are the server's numbers. In particular
 * `available` is the backend's `Available = On Hand - Reserved`, echoed rather than
 * recomputed. There is no Damaged figure in the inventory model, so none is shown.
 */
export const fetchProductDetail = async (result, { signal } = {}) => {
  const productId = result?.id;
  let itemCode = result?.code ?? null;

  const productPromise = productId
    ? optional(() => api.get(`/api/products/${productId}`, { signal }).then((r) => r.data))
    : Promise.resolve(null);

  // Without a code up front the stock read has to wait on the product payload.
  const stockFor = (code) =>
    code
      ? optional(() =>
          api
            .get(`/api/inventory/stock-availability/by-code/${encodeURIComponent(code)}`, { signal })
            .then((r) => r.data)
        )
      : Promise.resolve(null);

  let aggregate;
  let stock;
  if (itemCode) {
    [aggregate, stock] = await Promise.all([productPromise, request(() => stockFor(itemCode))]);
  } else {
    aggregate = await request(() => productPromise);
    itemCode = aggregate?.product?.code ?? null;
    stock = await request(() => stockFor(itemCode));
  }

  const product = aggregate?.product ?? null;
  const locations = (stock?.locations ?? []).map((loc) => ({
    locationId: loc.locationId ?? null,
    name: loc.name ?? "",
    type: loc.type ?? null,
    onHand: toNumber(loc.onHand) ?? 0,
    reserved: toNumber(loc.reserved) ?? 0,
    // The backend's own Available, never On Hand - Reserved recomputed here.
    available: toNumber(loc.available) ?? 0,
    uom: loc.uom ?? null,
  }));

  const incomingLpos = (stock?.incomingLpos ?? []).map((lpo) => ({
    lpoNumber: lpo.lpoNumber ?? "",
    expectedDate: lpo.expectedDate ?? null,
    quantity: toNumber(lpo.quantity) ?? 0,
    supplierName: lpo.supplierName ?? "",
    uom: lpo.uom ?? null,
  }));

  // Summary roll-ups are sums of the server's per-location figures — a presentation
  // total, not a re-derivation: no subtraction, no business rule applied here.
  const sum = (rows, key) => rows.reduce((acc, row) => acc + (row[key] ?? 0), 0);

  return {
    entityType: "product",
    name: product?.name ?? result?.title ?? "",
    code: itemCode,
    sku: product?.sku ?? null,
    // Only shown when the payload actually carries it — no invented status.
    status: product?.status ?? null,
    unitPrice: toNumber(productSellingPrice(aggregate)),
    reorderLevel: toNumber(aggregate?.inventory?.reorderLevel ?? product?.inventory?.reorderLevel),
    uom: locations.find((l) => l.uom)?.uom ?? null,
    onHand: sum(locations, "onHand"),
    reserved: sum(locations, "reserved"),
    available: sum(locations, "available"),
    incoming: incomingLpos.reduce((acc, lpo) => acc + lpo.quantity, 0),
    locations,
    incomingLpos,
    // True when the stock service answered but knows nothing about this code — the panel
    // says so rather than showing a confident row of zeros.
    stockUnavailable: stock == null,
  };
};

// ==================== LEDGER ACCOUNT ====================

/**
 * Ledger account details: one summary read plus one bounded transaction read.
 *
 * <p>Deliberately not {@code GET /api/ledger/transactions}, which loads the entire
 * ledger. Totals come from the summary endpoint (pre-aggregated GL balances) and are
 * never re-derived from the transaction rows below them.
 */
export const fetchLedgerDetail = async (result, { signal } = {}) => {
  const code = result?.code ?? result?.id;
  if (!code) throw new Error("A ledger account needs an account code.");
  const path = `/api/ledger/accounts/${encodeURIComponent(code)}`;

  const [summary, transactions] = await Promise.all([
    request(() => api.get(`${path}/summary`, { signal }).then((r) => r.data)),
    request(() =>
      optional(() =>
        api
          .get(`${path}/transactions`, { params: { size: LEDGER_TRANSACTION_LIMIT }, signal })
          .then((r) => r.data)
      )
    ),
  ]);

  return {
    entityType: "ledger",
    accountCode: summary?.accountCode ?? String(code),
    accountName: summary?.accountName ?? result?.title ?? "",
    accountType: summary?.accountType ?? null,
    accountGroup: summary?.accountGroup ?? null,
    status: summary?.status ?? null,
    debitTotal: toNumber(summary?.debitTotal) ?? 0,
    creditTotal: toNumber(summary?.creditTotal) ?? 0,
    // Backend convention: closingBalance = debitTotal - creditTotal. Echoed as given.
    netBalance: toNumber(summary?.closingBalance) ?? 0,
    // Branch rows with a null id are the posting engine's unattributed balances. They
    // are kept, not filtered, or the branch rows stop adding up to the account total.
    branchBalances: (summary?.branchBalances ?? []).map((b) => ({
      branchId: b.branchId ?? null,
      branchName: b.branchName ?? "Unattributed",
      debitTotal: toNumber(b.debitTotal) ?? 0,
      creditTotal: toNumber(b.creditTotal) ?? 0,
      closingBalance: toNumber(b.closingBalance) ?? 0,
    })),
    transactions: (transactions ?? []).map((t) => ({
      id: t.id ?? null,
      transactionDate: t.transactionDate ?? null,
      voucherNo: t.voucherNo ?? null,
      description: t.description ?? null,
      debitAmount: toNumber(t.debitAmount),
      creditAmount: toNumber(t.creditAmount),
      runningBalance: toNumber(t.runningBalance),
      branchName: t.branchName ?? null,
    })),
  };
};

// ==================== CUSTOMER ====================

/**
 * Customer details: one summary read plus one bounded recent-invoice read.
 *
 * <p>The summary's figures keep the backend's semantics and are passed through
 * unchanged — none of them is recomputed here:
 *
 * <ul>
 *   <li>`openingBalance` — `Customer.balance`, the balance carried in at setup.
 *   <li>`outstanding` — what is owed now (invoice outstanding + opening outstanding).
 *   <li>`totalSales` — opening balance + lifetime invoiced.
 *   <li>`totalPaid` — lifetime settled. The server computes it as
 *       `totalSales - outstanding`; this file does not do the subtraction, so the panel
 *       can never show a fourth figure that disagrees with the other three.
 *   <li>`overdueAmount` / `overdueInvoiceCount` — invoices past their own `dueDate` that
 *       still carry a positive balance. A date-slice of `outstanding`, from the server.
 * </ul>
 *
 * <p>`lastInvoiceDate` is taken from the head of the recent-invoice list, which the
 * backend already returns newest-first and bounded. No statement endpoint is called and
 * no extra query is issued to find it. It is deliberately "Last Invoice" rather than a
 * generic "Last Transaction": a union across invoices, receipts, JVs and credit notes
 * would be a figure no reader could interpret without asking what went into it.
 *
 * <p>There is still no Due Amount here. It would be `outstanding` under a second label,
 * and showing one number twice invites the reader to think they are different.
 *
 * <p>Invoices come from a different permission than the customer record, so a denial
 * there is confined to that section (see {@link section}). The overdue figures ride the
 * customer's own permission instead: they aggregate the same balances `outstanding`
 * already exposes, rather than revealing per-document detail.
 */
export const fetchCustomerDetail = async (result, { signal } = {}) => {
  const customerId = result?.id;
  if (!customerId) throw new Error("A customer needs an id.");

  const summary = await request(() =>
    api.get(`/api/sales/customer-ledger/${encodeURIComponent(customerId)}/summary`, { signal })
      .then((r) => r.data)
  );

  const customerCode = summary?.customerCode ?? null;
  // Invoices are keyed by customer code; without one there is nothing to ask for.
  const invoices = customerCode
    ? await section(() =>
        api
          .get("/api/sales/invoices/recent", {
            params: { customerCode, size: PARTY_DOCUMENT_LIMIT },
            signal,
          })
          .then((r) => r.data)
      )
    : { rows: [] };

  const invoiceRows = (invoices.rows ?? []).map((inv) => ({
    id: inv.id ?? null,
    invoiceNumber: inv.invoiceNumber ?? null,
    invoiceDate: inv.invoiceDate ?? null,
    invoiceTotal: toNumber(inv.invoiceTotal),
    // The invoice's own persisted balance, echoed — never invoiceTotal minus anything.
    balance: toNumber(inv.balance),
    status: inv.status ?? null,
    branchName: inv.branchName ?? null,
  }));

  // The endpoint returns newest-first, so the head of the list is the last invoice.
  // Null when the section was denied or empty — the panel says so rather than guessing.
  const lastInvoice = invoiceRows[0] ?? null;

  return {
    entityType: "customer",
    id: summary?.id ?? customerId,
    customerCode,
    customerName: summary?.customerName ?? result?.title ?? "",
    status: summary?.status ?? null,
    branch: summary?.branch ?? null,
    currency: summary?.currency ?? null,
    openingBalance: toNumber(summary?.openingBalance),
    outstanding: toNumber(summary?.outstanding),
    totalSales: toNumber(summary?.totalSales),
    // Server-computed, deliberately not derived here.
    totalPaid: toNumber(summary?.totalPaid),
    overdueAmount: toNumber(summary?.overdueAmount),
    overdueInvoiceCount: toNumber(summary?.overdueInvoiceCount) ?? 0,
    lastInvoiceDate: lastInvoice?.invoiceDate ?? null,
    lastInvoiceNumber: lastInvoice?.invoiceNumber ?? null,
    invoicesForbidden: invoices.forbidden === true,
    invoicesFailed: invoices.failed === true,
    invoices: invoiceRows,
  };
};

// ==================== VENDOR ====================

/**
 * Vendor details: one summary read plus one bounded recent-LPO read.
 *
 * <p>Vendor accounting is not the customer panel mirrored. `payableBalance` is the
 * backend's `invoiceOutstanding + openingOutstanding`, and `openingBalanceOutstanding`
 * is what remains of the opening balance after on-account payments — both echoed.
 *
 * <p>`totalPaid` is the lifetime figure — all POSTED/CLEARED payment vouchers for this
 * vendor, with no date predicate. The customer panel reaches its own Total Paid a
 * different way (`totalSales - outstanding`) because vendor and customer accounting are
 * not mirrors of each other; both are computed server-side and echoed here.
 *
 * <p>`overdueInvoiceCount` is a **count only**. `PurchaseInvoice` stores no per-invoice
 * balance, so there is no honest overdue amount to show: the gross `grandTotal` is not a
 * remaining balance, and netting vendor-level payments against particular invoices would
 * attribute money to documents it was never applied to. The count needs none of that —
 * whether an invoice is settled is a fact it already carries in its own `paymentStatus`.
 * So this panel reports how many invoices are past due and never how much.
 *
 * <p>`lastLpoDate` comes from the head of the bounded recent-LPO list, which the backend
 * returns newest-first. No extra query, and no generic "Last Transaction".
 */
export const fetchVendorDetail = async (result, { signal } = {}) => {
  const vendorId = result?.id;
  if (!vendorId) throw new Error("A vendor needs an id.");

  const summary = await request(() =>
    api.get(`/api/vendors/${encodeURIComponent(vendorId)}/summary`, { signal }).then((r) => r.data)
  );

  const lpos = await section(() =>
    api
      .get("/api/lpos/recent", { params: { vendorId, size: PARTY_DOCUMENT_LIMIT }, signal })
      .then((r) => r.data)
  );

  const lpoRows = (lpos.rows ?? []).map((lpo) => ({
    id: lpo.id ?? null,
    lpoNumber: lpo.lpoNumber ?? null,
    lpoDate: lpo.lpoDate ?? null,
    grandTotal: toNumber(lpo.grandTotal),
    status: lpo.status ?? null,
    branchName: lpo.branchName ?? null,
  }));

  // Newest-first from the backend, so the head of the list is the last LPO.
  const lastLpo = lpoRows[0] ?? null;

  return {
    entityType: "vendor",
    id: summary?.id ?? vendorId,
    vendorCode: summary?.vendorCode ?? null,
    vendorName: summary?.vendorName ?? result?.title ?? "",
    status: summary?.status ?? null,
    branch: summary?.branch ?? null,
    currency: summary?.currency ?? null,
    openingBalance: toNumber(summary?.openingBalance),
    openingBalanceOutstanding: toNumber(summary?.openingBalanceOutstanding),
    payableBalance: toNumber(summary?.payableBalance),
    totalPaid: toNumber(summary?.totalPaid),
    // Count only. There is deliberately no overdueAmount on this shape.
    overdueInvoiceCount: toNumber(summary?.overdueInvoiceCount) ?? 0,
    lastLpoDate: lastLpo?.lpoDate ?? null,
    lastLpoNumber: lastLpo?.lpoNumber ?? null,
    lposForbidden: lpos.forbidden === true,
    lposFailed: lpos.failed === true,
    lpos: lpoRows,
  };
};

// ==================== EMPLOYEE ====================

/**
 * Employee details: identity only, and no request at all.
 *
 * <p>This is the one fetcher that issues no network call, and that is the whole design.
 * `GET /api/employees/{id}` returns the full `Employee` — basic salary, allowances,
 * deductions, document numbers, contact details. A global search box is reachable by
 * keyboard from every screen and is frequently on-screen in shared and counter contexts,
 * so the blast radius of putting that payload behind it is a personnel incident rather
 * than a data error. The panel is therefore built from the search row alone, which comes
 * from `EmployeeSearchResponse` — a projection that carries identity, designation,
 * department, branch and status, and nothing else.
 *
 * <p>Consequences worth stating plainly, because they are choices and not gaps: there is
 * no salary, no payroll, no attendance, no leave and no performance data here, and there
 * is no way to reach any of it from this panel. The panel offers a link to the HR
 * employee page instead, where those fields live behind their own permissions.
 *
 * <p>`hr.employee` already gates the search endpoint that produced this row, so no
 * further permission is required — and none is claimed. No payroll permission is
 * involved because no payroll data is exposed.
 *
 * @param {{ id?: string, title?: string, employee?: object }} result the selected row
 */
export const fetchEmployeeDetail = async (result) => {
  const e = result?.employee ?? {};
  return {
    entityType: "employee",
    id: result?.id ?? null,
    name: e.name ?? result?.title ?? "",
    employeeCode: e.employeeCode ?? null,
    role: e.role ?? null,
    department: e.department ?? null,
    branch: e.branch ?? null,
    status: e.status ?? null,
  };
};

/**
 * The entity types that have a detail panel. Anything not listed keeps the truthful
 * "details are coming next" placeholder rather than implying a view exists.
 */
export const ENTITY_DETAIL_FETCHERS = {
  product: fetchProductDetail,
  ledger: fetchLedgerDetail,
  customer: fetchCustomerDetail,
  vendor: fetchVendorDetail,
  employee: fetchEmployeeDetail,
};

export const hasEntityDetail = (type) => Boolean(ENTITY_DETAIL_FETCHERS[type]);

export default {
  fetchProductDetail,
  fetchLedgerDetail,
  fetchCustomerDetail,
  fetchVendorDetail,
  fetchEmployeeDetail,
  hasEntityDetail,
};
