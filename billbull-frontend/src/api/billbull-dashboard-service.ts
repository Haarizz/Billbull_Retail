// BillBull Dashboard Service Adapter
// Bridges the new dashboard UI to the Spring Boot backend via Axios

import api from "./axiosConfig";
import { getBranches as fetchBranches } from "./branchApi";
import { getDashboardData } from "./dashboardApi";

// ==================== RE-EXPORT TYPES ====================

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface SalesKPIData {
  grossSales: number;
  salesChange: number;
  customers: number;
  newCustomers: number;
  topDepartment: {
    name: string;
    salesAmount: number;
    contribution: number;
  } | null;
  peakHourLabel: string | null;
}

export interface SalesTrendPoint {
  label: string;
  sales: number;
  returns: number;
  profit: number;
  key?: string;
}

export interface HourlySalesPoint {
  hourLabel: string;
  amount: number;
  key: string;
}

export interface PaymentBreakdown {
  method: string;
  amount: number;
  percentage: number;
}

export interface InventoryKPIs {
  totalSkus: number;
  activeSkus: number;
  activeSkuPercentage: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValueCost: number;
  inventoryValueRetail: number;
  projectedMargin: number;
  branchesWithStock: number;
  departmentBreakdown: Array<{
    name: string;
    valueCost: number;
    percentage: number;
    color: string;
  }>;
}

export interface TopSellingItem {
  id: string;
  code: string;
  name: string;
  department: string;
  qtySold: number;
  salesAmount: number;
  rank?: number;
  thumbnailUrl?: string;
}

export interface SlowMovingItem {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  lastSoldDate: string | null;
  daysSinceLastSale: number;
}

export interface TodayBill {
  id: string;
  billNo: string;
  billTime: string;
  customerName: string | null;
  totalAmount: number;
  status: "Paid" | "Credit" | "Refund";
}

export interface PurchaseAnalytics {
  totalPurchaseValue: number;
  suppliersCount: number;
  openLpoCount: number;
  pendingGrnCount: number;
  outstandingToSuppliers: number;
  overdueBillsCount: number;
  suggestion?: string;
}

export interface AccountingSnapshot {
  netCashFlow: number;
  cashInflow: number;
  cashOutflow: number;
  totalExpenses: number;
  majorExpenseHead: string;
  vatPayable: number;
  vatOnSales: number;
  vatOnPurchases: number;
  customerReceivables: number;
  supplierPayables: number;
}

export interface Notification {
  id: string;
  type: "alert" | "warning" | "info" | "success";
  title: string;
  message: string;
  timestamp?: string;
  createdAt?: string;
  isRead: boolean;
  actionUrl?: string;
}

export interface BranchPerformance {
  branch: string;
  sales: number;
  key: string;
}

export interface GlobalSearchResult {
  id: string;
  type: "product" | "customer" | "invoice" | "lpo" | "grn" | "quotation";
  title: string;
  subtitle?: string;
  meta?: {
    badge?: string;
    rightTag?: string;
  };
}

export interface DashboardAdvancedFilters {
  fromDate?: string;
  toDate?: string;
  invoiceStatus?: string;
  minAmount?: string | number;
  maxAmount?: string | number;
}

interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: string;
}

// ==================== DATE FILTER HELPERS ====================

const dateFilterToTimeRange = (dateFilter: string): string => {
  switch (dateFilter) {
    case "today": return "Today";
    case "week": return "This Week";
    case "month": return "This Month";
    case "lastMonth": return "Last Month";
    case "year": return "This Year";
    case "custom": return "Custom";
    default: return "This Year";
  }
};

// ==================== SERVICE CLASS ====================

// LS cache key mirrors dashboardApi.js so we can read the same stale data
const LS_CACHE_KEY = (timeRange: string) => `bb_dash_v3_${timeRange}`;

const readStaleFromLS = (timeRange: string): any | null => {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY(timeRange));
    if (!raw) return null;
    const { timestamp, data } = JSON.parse(raw);
    // Accept stale up to 24 h (same TTL as dashboardApi)
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
};

class BillBullDashboardService {
  private summaryCache: Map<string, { data: any; ts: number }> = new Map();
  // Deduplicates concurrent calls for the same key so only ONE getDashboardData() runs
  private inFlight: Map<string, Promise<any>> = new Map();
  private readonly CACHE_TTL = 60_000;

  private async getSummary(
    timeRange: string,
    branchFilter: string = "all",
    filters: DashboardAdvancedFilters = {}
  ): Promise<any> {
    const activeFilters = {
      ...filters,
      branchId: branchFilter && branchFilter !== "all" ? branchFilter : "",
    };
    const key = `${timeRange}:${JSON.stringify(activeFilters)}`;

    // 1. Hot in-memory cache — zero cost
    const cached = this.summaryCache.get(key);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) return cached.data;

    // 2. In-flight dedup — if another call is already fetching this key, share its promise
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    // 3. Start the fetch and register as in-flight
    const fetch = getDashboardData(timeRange, { filters: activeFilters }).then((data) => {
      this.summaryCache.set(key, { data, ts: Date.now() });
      this.inFlight.delete(key);
      return data;
    }).catch(() => {
      this.inFlight.delete(key);
      // Return whatever stale data we have rather than null
      return this.summaryCache.get(key)?.data ?? readStaleFromLS(timeRange);
    });

    this.inFlight.set(key, fetch);
    return fetch;
  }

  /** Clears all in-process caches so the next getSummary() call always hits the backend. */
  invalidateCaches(): void {
    this.summaryCache.clear();
    this.inFlight.clear();
  }

  // Returns stale localStorage data synchronously — used for instant paint before fetch
  getStaleSnapshot(dateFilter: string): any | null {
    const timeRange = dateFilterToTimeRange(dateFilter);
    // Check in-memory cache first (may have been populated by a previous load)
    const cached = this.summaryCache.get(`${timeRange}:{}`);
    if (cached) return cached.data;
    return readStaleFromLS(timeRange);
  }

  // Health check is intentionally non-blocking — returns connected immediately
  // and verifies auth silently in the background.
  async healthCheck(): Promise<ServiceResponse<any>> {
    api.get("/api/auth/me").catch(() => {});
    return { success: true, status: "ok", data: { server: "BillBull API", timestamp: new Date().toISOString() } };
  }

  async getBranches(): Promise<ServiceResponse<BranchSummary[]>> {
    try {
      const raw = await fetchBranches();
      const branches: BranchSummary[] = (Array.isArray(raw) ? raw : []).map((b: any) => ({
        id: String(b.id ?? b.branchId ?? ""),
        name: b.name ?? b.branchName ?? "Branch",
        code: b.code ?? b.branchCode ?? b.name?.substring(0, 2).toUpperCase() ?? "BR",
        isActive: b.isActive ?? b.active ?? true,
      }));
      return { success: true, data: branches };
    } catch {
      return { success: true, data: [] };
    }
  }

  async getSalesKPIs(
    dateFilter: string,
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<SalesKPIData>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const sales = summary?.sales ?? {};
    const sm = summary?.salesMetrics ?? summary?.sales ?? {};
    const td = (summary?.topDepartments ?? [])[0];
    const totalRevenue = Number(sm.totalRevenue ?? sm.totalSales ?? sales.totalSales ?? 0);
    const topDept = td ? {
      name: String(td.label ?? ""),
      salesAmount: Number(td.value ?? 0),
      contribution: totalRevenue > 0 ? Math.round((Number(td.value) / totalRevenue) * 100) : 0,
    } : null;

    return {
      success: true,
      data: {
        grossSales: totalRevenue,
        salesChange: Number(sales.salesGrowth ?? 0),
        customers: Number(sm.customerCount ?? 0),
        newCustomers: 0,
        topDepartment: topDept,
        peakHourLabel: summary?.salesTrendMeta?.peakLabel ?? null,
      },
    };
  }

  async getSalesTrend(
    dateFilter: string,
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<SalesTrendPoint[]>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const rawTrend = summary?.salesTrend ?? [];
    const raw: Array<{ date: string; sales: number; count?: number }> = Array.isArray(rawTrend)
      ? rawTrend
      : Object.entries(rawTrend).map(([date, value]: [string, any]) => ({
          date,
          sales: Number(value?.sales ?? 0),
          count: Number(value?.count ?? 0),
        }));
    const points: SalesTrendPoint[] = raw
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => {
        const d = new Date(r.date + "T00:00:00");
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return { label, sales: Number(r.sales ?? 0), returns: Number(r.returns ?? 0), profit: Number(r.profit ?? 0), key: r.date };
      });
    return { success: true, data: points };
  }

  async getHourlySales(
    dateFilter: string,
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<HourlySalesPoint[]>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const raw: Array<any> = summary?.hourlySales ?? [];
    const points = raw.map((row: any) => ({
      hourLabel: String(row.hourLabel ?? row.label ?? row.hour ?? ""),
      amount: Number(row.amount ?? row.sales ?? 0),
      key: String(row.key ?? row.hourLabel ?? row.label ?? row.hour ?? ""),
    })).filter((row) => row.hourLabel);
    return { success: true, data: points };
  }

  async getPaymentBreakdown(
    dateFilter: string,
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<PaymentBreakdown[]>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const rawBreakdown = summary?.paymentBreakdown ?? [];
    const methodMap: Record<string, string> = {
      cash: "Cash", card: "Card", wallet: "Digital Wallet", credit: "Credit",
    };
    const buckets: Record<string, number> = { cash: 0, card: 0, wallet: 0, credit: 0 };
    if (Array.isArray(rawBreakdown)) {
      rawBreakdown.forEach(({ label, value }) => {
        const l = (label ?? "").toLowerCase();
        if (l.includes("wallet")) buckets.wallet += Number(value);
        else if (l.includes("credit")) buckets.credit += Number(value);
        else if (l.includes("card") || l.includes("visa") || l.includes("bank")) buckets.card += Number(value);
        else buckets.cash += Number(value);
      });
    } else {
      buckets.cash = Number(rawBreakdown.cash ?? 0);
      buckets.card = Number(rawBreakdown.card ?? 0);
      buckets.wallet = Number(rawBreakdown.wallet ?? 0);
      buckets.credit = Number(rawBreakdown.credit ?? 0);
    }
    const total = Object.values(buckets).reduce((s, v) => s + v, 0);
    const breakdown: PaymentBreakdown[] = Object.entries(buckets).map(([k, v]) => ({
      method: methodMap[k] ?? k,
      amount: v,
      percentage: total > 0 ? (v / total) * 100 : 0,
    }));
    return { success: true, data: breakdown };
  }

  async getInventoryKPIs(
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<InventoryKPIs>> {
    const summary = await this.getSummary("This Year", branchFilter, filters);
    const im = summary?.inventory ?? summary?.inventoryMetrics ?? {};
    const totalSkus = Number(im.totalProducts ?? 0);
    const activeSkus = Number(im.activeProducts ?? totalSkus);
    const costVal = Number(im.stockValueCost ?? im.stockValue ?? 0);
    const retailVal = Number(im.stockValueRetail ?? im.stockValueCost ?? im.stockValue ?? 0);
    const margin = costVal > 0 ? ((retailVal - costVal) / costVal) * 100 : 0;
    const depts: Array<{ label: string; value: number }> = summary?.topDepartments ?? [];
    const deptTotal = depts.reduce((s: number, d: any) => s + Number(d.value ?? 0), 0);
    const colors = ["#F5C742", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444"];
    const departmentBreakdown = depts.slice(0, 5).map((d: any, i: number) => ({
      name: String(d.label ?? ""),
      valueCost: Number(d.value ?? 0),
      percentage: deptTotal > 0 ? (Number(d.value) / deptTotal) * 100 : 0,
      color: colors[i] ?? "#94A3B8",
    }));
    return {
      success: true,
      data: {
        totalSkus,
        activeSkus,
        activeSkuPercentage: totalSkus > 0 ? (activeSkus / totalSkus) * 100 : 0,
        lowStockCount: Number(im.lowStockCount ?? 0),
        outOfStockCount: Number(im.outOfStockCount ?? 0),
        inventoryValueCost: costVal,
        inventoryValueRetail: retailVal,
        projectedMargin: margin,
        branchesWithStock: branchFilter && branchFilter !== "all" ? 1 : 0,
        departmentBreakdown,
      },
    };
  }

  async getTopSellingItems(
    dateFilter: string,
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<TopSellingItem[]>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const raw: Array<any> = summary?.topProducts ?? [];
    const items: TopSellingItem[] = raw.map((p: any, i: number) => ({
      id: p.id != null ? String(p.id) : String(p.sku ?? p.code ?? i),
      code: String(p.sku ?? p.code ?? ""),
      name: String(p.name ?? p.sku ?? "Unknown"),
      department: String(p.department ?? "Uncategorized"),
      qtySold: Number(p.sold ?? p.qtySold ?? 0),
      salesAmount: Number(p.revenue ?? p.salesAmount ?? 0),
      rank: i + 1,
    }));
    return { success: true, data: items };
  }

  async getSlowMovingItems(
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<SlowMovingItem[]>> {
    const summary = await this.getSummary("This Year", branchFilter, filters);
    const raw: Array<any> = summary?.inventory?.slowMovingProducts ?? summary?.inventory?.lowStockProducts ?? [];
    const today = new Date();
    const items: SlowMovingItem[] = raw.slice(0, 10).map((r: any, i: number) => {
      const lastSold = r.lastSold && r.lastSold !== "N/A" ? String(r.lastSold) : null;
      const parsed = lastSold ? new Date(lastSold) : null;
      const daysSinceLastSale =
        parsed && !Number.isNaN(parsed.getTime())
          ? Math.max(0, Math.round((today.getTime() - parsed.getTime()) / 86_400_000))
          : 0;
      return {
        id: String(r.productId ?? r.id ?? i),
        code: String(r.sku ?? r.code ?? ""),
        name: String(r.item ?? r.productName ?? r.name ?? "Unknown"),
        currentStock: Number(r.onHand ?? r.currentStock ?? 0),
        lastSoldDate: lastSold,
        daysSinceLastSale,
      };
    });
    return { success: true, data: items };
  }

  async getTodayBills(
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<TodayBill[]>> {
    const summary = await this.getSummary("Today", branchFilter, filters);
    const raw: Array<any> = summary?.transactions ?? summary?.recentTransactions ?? [];
    const bills: TodayBill[] = raw.map((t: any) => {
      const statusMap: Record<string, TodayBill["status"]> = {
        PAID: "Paid", POSTED: "Paid", CONFIRMED: "Paid",
        CREDIT: "Credit", PARTIALLY_PAID: "Credit",
        REFUND: "Refund", RETURNED: "Refund",
      };
      const rawStatus = String(t.status ?? "").toUpperCase();
      const mappedStatus: TodayBill["status"] = statusMap[rawStatus] ?? "Paid";
      return {
        id: String(t.id ?? t.invoiceNumber ?? ""),
        billNo: String(t.invoiceNumber ?? t.id ?? ""),
        billTime: t.createdAt ?? t.date ?? new Date().toISOString(),
        customerName: t.customerName ?? t.customer ?? null,
        totalAmount: Number(t.amount ?? 0),
        status: mappedStatus,
      };
    });
    return { success: true, data: bills };
  }

  async getPurchaseAnalytics(
    dateFilter: string,
    branchFilter: string,
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<PurchaseAnalytics>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const pm = summary?.purchase ?? summary?.purchaseMetrics ?? {};
    return {
      success: true,
      data: {
        totalPurchaseValue: Number(pm.totalPurchases ?? pm.totalPurchaseValue ?? 0),
        suppliersCount: Number(pm.suppliersCount ?? 0),
        openLpoCount: Number(pm.pendingLPOs ?? pm.pendingLpos ?? pm.openLpoCount ?? 0),
        pendingGrnCount: Number(pm.grnCount ?? pm.pendingGrns ?? 0),
        outstandingToSuppliers: Number(pm.outstandingToSuppliers ?? 0),
        overdueBillsCount: 0,
      },
    };
  }

  async getAccountingSnapshot(
    dateFilter: string,
    branchFilter: string = "all",
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<AccountingSnapshot>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const as: any = summary?.accountingSnapshot ?? {};
    const sm = summary?.salesMetrics ?? {};
    // Fall back to salesMetrics values if new accountingSnapshot field is absent (old backend)
    const inflow = Number(as.cashInflow ?? sm.totalRevenue ?? 0);
    const outflow = Number(as.cashOutflow ?? 0);
    return {
      success: true,
      data: {
        netCashFlow: Number(as.netCashFlow ?? inflow - outflow),
        cashInflow: inflow,
        cashOutflow: outflow,
        totalExpenses: Number(as.totalExpenses ?? outflow),
        majorExpenseHead: String(as.majorExpenseHead ?? ""),
        vatPayable: Number(as.vatPayable ?? 0),
        vatOnSales: Number(as.vatOnSales ?? 0),
        vatOnPurchases: Number(as.vatOnPurchases ?? 0),
        customerReceivables: Number(as.customerReceivables ?? sm.outstanding ?? 0),
        supplierPayables: Number(as.supplierPayables ?? 0),
      },
    };
  }

  async getNotifications(): Promise<ServiceResponse<Notification[]>> {
    try {
      const res = await api.get("/api/notifications", { params: { page: 0, size: 10 } });
      const raw: Array<any> = Array.isArray(res.data) ? res.data : (res.data?.content ?? []);
      const notifications: Notification[] = raw.map((n: any) => ({
        id: String(n.id ?? ""),
        type: (({ INFO: "info", WARNING: "warning", SUCCESS: "success", ERROR: "alert" } as Record<string, Notification["type"]>)[String(n.type ?? "").toUpperCase()] ?? "info"),
        title: String(n.title ?? n.subject ?? "Notification"),
        message: String(n.message ?? n.body ?? ""),
        timestamp: n.createdAt ?? n.timestamp,
        createdAt: n.createdAt,
        isRead: Boolean(n.isRead ?? n.read ?? false),
        actionUrl: n.actionUrl,
      }));
      return { success: true, data: notifications };
    } catch {
      return { success: true, data: [] };
    }
  }

  async getBranchPerformance(
    dateFilter: string,
    branchFilter: string = "all",
    filters: DashboardAdvancedFilters = {}
  ): Promise<ServiceResponse<BranchPerformance[]>> {
    const timeRange = dateFilterToTimeRange(dateFilter);
    const summary = await this.getSummary(timeRange, branchFilter, filters);
    const raw: Array<any> = summary?.branchPerformance ?? [];
    if (raw.length > 0) {
      const perf: BranchPerformance[] = raw.map((b: any) => ({
        branch: String(b.branch ?? b.branchName ?? ""),
        sales: Number(b.sales ?? b.totalSales ?? 0),
        key: String(b.branch ?? b.branchName ?? ""),
      }));
      return { success: true, data: perf };
    }
    return { success: true, data: [] };
  }

  // Pre-warm — triggers a summary fetch and caches it.
  // Call this as early as possible (module import, route enter) so the cache
  // is already populated by the time the dashboard component mounts.
  prefetch(dateFilter = "today", branchFilter = "all"): void {
    const timeRange = dateFilterToTimeRange(dateFilter);
    this.getSummary(timeRange, branchFilter, {}).catch(() => {});
  }

  async globalSearch(query: string): Promise<ServiceResponse<GlobalSearchResult[]>> {
    if (!query || query.length < 2) return { success: true, data: [] };
    try {
      const [productsRes, customersRes, invoicesRes, lposRes, grnsRes, quotationsRes] = await Promise.allSettled([
        api.get("/api/products/search", { params: { q: query, size: 3 } }),
        api.get("/api/sales/customer-ledger/search", { params: { q: query, size: 3 } }),
        api.get("/api/sales/invoices/page", { params: { search: query, size: 3 } }),
        api.get("/api/lpos/page", { params: { search: query, size: 3 } }),
        api.get("/api/grns/page", { params: { search: query, size: 3 } }),
        api.get("/api/sales/quotations/page", { params: { search: query, size: 3 } }),
      ]);
      const results: GlobalSearchResult[] = [];

      if (productsRes.status === "fulfilled") {
        const raw = Array.isArray(productsRes.value.data) ? productsRes.value.data : (productsRes.value.data?.content ?? []);
        raw.slice(0, 3).forEach((p: any) => results.push({
          id: String(p.id ?? ""),
          type: "product",
          title: String(p.name ?? ""),
          subtitle: `${p.sku ?? p.code ?? ""} • ${p.department?.name ?? ""}`,
          meta: { badge: `Stock: ${p.quantity ?? 0}`, rightTag: p.sellingPrice ? `AED ${Number(p.sellingPrice).toLocaleString()}` : undefined },
        }));
      }

      if (customersRes.status === "fulfilled") {
        const raw = Array.isArray(customersRes.value.data) ? customersRes.value.data : (customersRes.value.data?.content ?? []);
        raw.slice(0, 3).forEach((c: any) => results.push({
          id: String(c.id ?? ""),
          type: "customer",
          title: String(c.name ?? c.customerName ?? ""),
          subtitle: `${c.code ?? ""} • ${c.mobile ?? c.phone ?? c.email ?? ""}`,
          meta: { badge: c.groupType ?? "Customer" },
        }));
      }

      if (invoicesRes.status === "fulfilled") {
        const raw = Array.isArray(invoicesRes.value.data) ? invoicesRes.value.data : (invoicesRes.value.data?.content ?? []);
        raw.slice(0, 3).forEach((inv: any) => results.push({
          id: String(inv.id ?? ""),
          type: "invoice",
          title: String(inv.invoiceNumber ?? inv.id ?? ""),
          subtitle: `${inv.customerName ?? "Walk-in"} • ${inv.invoiceDate ?? ""}`,
          meta: { badge: inv.status ?? "Invoice", rightTag: inv.invoiceTotal ? `AED ${Number(inv.invoiceTotal).toLocaleString()}` : undefined },
        }));
      }

      if (lposRes.status === "fulfilled") {
        const raw = Array.isArray(lposRes.value.data) ? lposRes.value.data : (lposRes.value.data?.content ?? []);
        raw.slice(0, 2).forEach((lpo: any) => results.push({
          id: String(lpo.dbId ?? lpo.id ?? ""),
          type: "lpo",
          title: String(lpo.id ?? lpo.dbId ?? ""),
          subtitle: `${lpo.vendorName ?? ""} • ${lpo.status ?? ""}`,
          meta: { badge: "LPO", rightTag: lpo.totalValue ? `AED ${Number(lpo.totalValue).toLocaleString()}` : undefined },
        }));
      }

      if (grnsRes.status === "fulfilled") {
        const raw = Array.isArray(grnsRes.value.data) ? grnsRes.value.data : (grnsRes.value.data?.content ?? []);
        raw.slice(0, 2).forEach((grn: any) => results.push({
          id: String(grn.id ?? ""),
          type: "grn",
          title: String(grn.idDisplay ?? grn.id ?? ""),
          subtitle: `${grn.vendor ?? ""} • ${grn.date ?? ""}`,
          meta: { badge: "GRN", rightTag: grn.value ? `AED ${Number(grn.value).toLocaleString()}` : undefined },
        }));
      }

      if (quotationsRes.status === "fulfilled") {
        const raw = Array.isArray(quotationsRes.value.data) ? quotationsRes.value.data : (quotationsRes.value.data?.content ?? []);
        raw.slice(0, 2).forEach((q: any) => results.push({
          id: String(q.id ?? ""),
          type: "quotation",
          title: String(q.quotationNumber ?? q.id ?? ""),
          subtitle: `${q.customerName ?? ""} • ${q.quotationDate ?? q.createdAt ?? ""}`,
          meta: { badge: q.status ?? "Quote", rightTag: q.totalAmount ?? q.grandTotal ? `AED ${Number(q.totalAmount ?? q.grandTotal ?? 0).toLocaleString()}` : undefined },
        }));
      }

      return { success: true, data: results.slice(0, 12) };
    } catch {
      return { success: true, data: [] };
    }
  }
}

export const billbullDashboardService = new BillBullDashboardService();

// Pre-warm "Today" summary at module-import time so the cache is hot before the
// dashboard component even mounts.
if (typeof window !== "undefined") {
  billbullDashboardService.prefetch();
}
