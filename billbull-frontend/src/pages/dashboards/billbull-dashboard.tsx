import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import { toast } from "sonner";
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  Search,
  Store,
  DollarSign,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Filter,
  Download,
  Bell,
  ExternalLink,
  ShoppingCart,
  Receipt,
  UserPlus,
  PackagePlus,
  Repeat,
  Edit3,
  CreditCard,
  Wallet,
  Banknote,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  format,
  isToday,
  isYesterday,
  parseISO,
} from "date-fns";
import {
  billbullDashboardService,
  type SalesKPIData,
  type SalesTrendPoint,
  type HourlySalesPoint,
  type PaymentBreakdown,
  type InventoryKPIs,
  type TopSellingItem,
  type SlowMovingItem,
  type TodayBill,
  type PurchaseAnalytics,
  type AccountingSnapshot,
  type Notification,
  type BranchPerformance,
  type GlobalSearchResult,
  type BranchSummary,
} from "../../api/billbull-dashboard-service";
import { useBranch } from "../../context/BranchContext";

// Props
interface DashboardProps {
  onNavigate?: (section: string, params?: Record<string, any>) => void;
}

type DateFilter = "today" | "week" | "month" | "lastMonth" | "year" | "custom";

type DashboardAdvancedFilters = {
  fromDate: string;
  toDate: string;
  invoiceStatus: string;
  minAmount: string;
  maxAmount: string;
};

const EMPTY_ADVANCED_FILTERS: DashboardAdvancedFilters = {
  fromDate: "",
  toDate: "",
  invoiceStatus: "all",
  minAmount: "",
  maxAmount: "",
};

// Connection status
type ConnectionStatus = "connecting" | "connected" | "disconnected";

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p
            key={index}
            className="flex items-center justify-between gap-2"
            style={{ color: entry.color }}
          >
            <span>{entry.name || entry.dataKey}</span>
            <span>
              {typeof entry.value === "number"
                ? entry.dataKey?.toLowerCase().includes("amount") ||
                  entry.dataKey?.toLowerCase().includes("sales") ||
                  entry.dataKey?.toLowerCase().includes("revenue") ||
                  entry.name?.toLowerCase().includes("aed")
                  ? `AED ${entry.value.toLocaleString()}`
                  : entry.value.toLocaleString()
                : entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function BillBullDashboard({ onNavigate }: DashboardProps = {}) {
  // Global branch context
  const { activeBranchId, isAllBranches } = useBranch();

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>("year");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<DashboardAdvancedFilters>(
    EMPTY_ADVANCED_FILTERS
  );
  // Tracks whether the component has finished its initial mount load
  const isInitialMount = useRef(true);
  const [appliedAdvancedFilters, setAppliedAdvancedFilters] =
    useState<DashboardAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Sync global branch to dashboard branch filter
  useEffect(() => {
    const newFilter = isAllBranches || !activeBranchId || activeBranchId === "ALL" 
      ? "all" 
      : String(activeBranchId);
    setBranchFilter(newFilter);
  }, [activeBranchId, isAllBranches]);

  // Loading / status
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");

  // Data
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [salesKpi, setSalesKpi] = useState<SalesKPIData | null>(null);
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [hourlySales, setHourlySales] = useState<HourlySalesPoint[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>(
    []
  );
  const [inventoryKpis, setInventoryKpis] = useState<InventoryKPIs | null>(
    null
  );
  const [topSellingItems, setTopSellingItems] = useState<TopSellingItem[]>([]);
  const [slowMovingItems, setSlowMovingItems] = useState<SlowMovingItem[]>([]);
  const [todayBills, setTodayBills] = useState<TodayBill[]>([]);
  const [purchaseAnalytics, setPurchaseAnalytics] =
    useState<PurchaseAnalytics | null>(null);
  const [accountingSnapshot, setAccountingSnapshot] =
    useState<AccountingSnapshot | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [branchPerformance, setBranchPerformance] = useState<
    BranchPerformance[]
  >([]);
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);

  // --- Helpers ---

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "AED 0";
    return `AED ${value.toLocaleString()}`;
  };

  const safeDate = (value: any): Date | null => {
    if (!value) return null;
    try {
      const d =
        typeof value === "string"
          ? parseISO(value)
          : value instanceof Date
          ? value
          : new Date(value);
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  };

  const formatRelativeDate = (value: any) => {
    const d = safeDate(value);
    if (!d) return "N/A";
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "dd MMM, yyyy");
  };

  const formatTime = (value: any) => {
    if (!value) return "—";
    // A date-only string (no "T" separator) has no real time — avoid showing "12:00 AM"
    if (typeof value === "string" && !value.includes("T") && !value.includes(" ")) return "—";
    const d = safeDate(value);
    if (!d) return "—";
    return format(d, "hh:mm a");
  };

  const getNotificationStyle = (type?: Notification["type"]) => {
    switch (type) {
      case "alert":
        return {
          icon: AlertTriangle,
          color: "text-red-500",
          bg: "bg-red-50",
        };
      case "warning":
        return {
          icon: AlertTriangle,
          color: "text-amber-500",
          bg: "bg-amber-50",
        };
      case "info":
        return {
          icon: Info,
          color: "text-blue-500",
          bg: "bg-blue-50",
        };
      case "success":
        return {
          icon: TrendingUp,
          color: "text-emerald-500",
          bg: "bg-emerald-50",
        };
      default:
        return {
          icon: Bell,
          color: "text-slate-500",
          bg: "bg-slate-50",
        };
    }
  };

  // --- Connection health check ---
  const checkServerHealth = useCallback(async () => {
    try {
      setConnectionStatus("connecting");
      const health = await billbullDashboardService.healthCheck();
      if (health.success || health.status === "ok") {
        setConnectionStatus("connected");
        return true;
      } else {
        setConnectionStatus("disconnected");
        return false;
      }
    } catch (error) {
      console.error("Health check error", error);
      setConnectionStatus("disconnected");
      toast.error("Unable to reach BillBull server.");
      return false;
    }
  }, []);

  // --- Load dashboard data ---
  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);

      const [
        branchesRes,
        salesKpiRes,
        salesTrendRes,
        hourlySalesRes,
        paymentRes,
        inventoryRes,
        topItemsRes,
        slowItemsRes,
        billsRes,
        purchaseRes,
        accountingRes,
        notificationsRes,
        branchPerfRes,
      ] = await Promise.all([
        billbullDashboardService.getBranches(),
        billbullDashboardService.getSalesKPIs(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getSalesTrend(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getHourlySales(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getPaymentBreakdown(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getInventoryKPIs(branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getTopSellingItems(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getSlowMovingItems(branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getTodayBills(branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getPurchaseAnalytics(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getAccountingSnapshot(dateFilter, branchFilter, appliedAdvancedFilters),
        billbullDashboardService.getNotifications(),
        billbullDashboardService.getBranchPerformance(dateFilter, branchFilter, appliedAdvancedFilters),
      ]);

      if (branchesRes.success) setBranches(branchesRes.data || []);
      if (salesKpiRes.success) setSalesKpi(salesKpiRes.data || null);
      if (salesTrendRes.success) setSalesTrend(salesTrendRes.data || []);
      if (hourlySalesRes.success)
        setHourlySales(hourlySalesRes.data || []);
      if (paymentRes.success)
        setPaymentBreakdown(paymentRes.data || []);
      if (inventoryRes.success)
        setInventoryKpis(inventoryRes.data || null);
      if (topItemsRes.success)
        setTopSellingItems(topItemsRes.data || []);
      if (slowItemsRes.success)
        setSlowMovingItems(slowItemsRes.data || []);
      if (billsRes.success) setTodayBills(billsRes.data || []);
      if (purchaseRes.success)
        setPurchaseAnalytics(purchaseRes.data || null);
      if (accountingRes.success)
        setAccountingSnapshot(accountingRes.data || null);
      if (notificationsRes.success)
        setNotifications(notificationsRes.data || []);
      if (branchPerfRes.success)
        setBranchPerformance(branchPerfRes.data || []);
    } catch (error) {
      console.error("Dashboard load error", error);
      toast.error("Failed to load BillBull dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter, branchFilter, appliedAdvancedFilters]);

  // Init — health check runs in parallel with data load (not before)
  useEffect(() => {
    // Paint stale localStorage data instantly so the user sees content immediately
    const stale = billbullDashboardService.getStaleSnapshot(dateFilter);
    if (stale) {
      const salesKpi = (() => {
        const sales = stale?.sales ?? {};
        const sm = stale?.salesMetrics ?? {};
        const td = (stale?.topDepartments ?? [])[0];
        const total = Number(sales.totalSales ?? sm.totalRevenue ?? 0);
        return {
          grossSales: total,
          salesChange: Number(sales.salesGrowth ?? 0),
          customers: Number(sm.customerCount ?? 0),
          newCustomers: 0,
          topDepartment: td ? { name: String(td.label ?? ""), salesAmount: Number(td.value ?? 0), contribution: total > 0 ? Math.round((Number(td.value) / total) * 100) : 0 } : null,
          peakHourLabel: stale?.salesTrendMeta?.peakLabel ?? null,
        };
      })();
      setSalesKpi(salesKpi);
      setIsLoading(false);
      setIsRefreshing(true);
    }

    // Kick off data load and health check concurrently
    Promise.all([
      loadDashboardData(),
      checkServerHealth(),
    ]).finally(() => {
      setIsRefreshing(false);
      // Mark initial load as done so the filter-change effect can take over
      isInitialMount.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch data whenever branch or date filter changes (skip first mount)
  useEffect(() => {
    if (isInitialMount.current) return;
    billbullDashboardService.invalidateCaches();
    loadDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter, dateFilter]);

  // Refresh — clears all caches then reloads
  const refreshData = useCallback(
    async (showToast = true) => {
      try {
        setIsRefreshing(true);
        const ok = await checkServerHealth();
        if (!ok) {
          toast.error("Unable to connect to BillBull server.");
          return;
        }
        // Clear frontend caches so loadDashboardData hits the backend fresh
        billbullDashboardService.invalidateCaches();
        await loadDashboardData();
        if (showToast) {
          toast.success("Dashboard refreshed");
        }
      } catch (error) {
        console.error("Refresh error", error);
        toast.error("Failed to refresh dashboard.");
      } finally {
        setIsRefreshing(false);
      }
    },
    [checkServerHealth, loadDashboardData]
  );

  // --- Global search ---
  const searchGlobal = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await billbullDashboardService.globalSearch(term);
        if (res.success) {
          setSearchResults(res.data || []);
          setShowSearchResults(true);
        } else {
          setSearchResults([]);
          setShowSearchResults(false);
        }
      } catch (error) {
        console.error("Search error", error);
        setSearchResults([]);
        setShowSearchResults(false);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      searchGlobal(searchTerm);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, searchGlobal]);

  // Close search results when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".billbull-search-container")) {
        setShowSearchResults(false);
      }
    };
    if (showSearchResults) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [showSearchResults]);

  const handleSearchResultClick = (item: GlobalSearchResult) => {
    if (!onNavigate) return;

    switch (item.type) {
      case "product":
        onNavigate("inventory-product-detail", { productId: item.id });
        break;
      case "customer":
        onNavigate("customer-ledger", { customerId: item.id });
        break;
      case "invoice":
        onNavigate("sales-invoice-detail", { invoiceId: item.id });
        break;
      case "lpo":
        onNavigate("lpo-detail", { lpoId: item.id, lpoNumber: item.title });
        break;
      case "grn":
        onNavigate("grn-detail", { grnId: item.id });
        break;
      case "quotation":
        onNavigate("quotation-detail", { quotationId: item.id });
        break;
    }
    setShowSearchResults(false);
    setSearchTerm("");
  };

  const updateAdvancedFilter = (
    key: keyof DashboardAdvancedFilters,
    value: string
  ) => {
    setAdvancedFilters((current) => ({ ...current, [key]: value }));
  };

  const hasAppliedAdvancedFilters =
    Boolean(appliedAdvancedFilters.fromDate) ||
    Boolean(appliedAdvancedFilters.toDate) ||
    appliedAdvancedFilters.invoiceStatus !== "all" ||
    Boolean(appliedAdvancedFilters.minAmount) ||
    Boolean(appliedAdvancedFilters.maxAmount);

  const applyAdvancedFilters = () => {
    billbullDashboardService.invalidateCaches();
    setAppliedAdvancedFilters({ ...advancedFilters });
    if (advancedFilters.fromDate || advancedFilters.toDate) {
      setDateFilter("custom");
    }
  };

  const clearAdvancedFilters = () => {
    billbullDashboardService.invalidateCaches();
    setAdvancedFilters(EMPTY_ADVANCED_FILTERS);
    setAppliedAdvancedFilters(EMPTY_ADVANCED_FILTERS);
    if (dateFilter === "custom") {
      setDateFilter("year");
    }
  };

  // Quick actions
  const quickActions = [
    {
      id: "new-sale",
      label: "New Sale",
      description: "Create sales invoice",
      icon: ShoppingCart,
      onClick: () => onNavigate?.("new-sale"),
    },
    {
      id: "new-purchase",
      label: "New Purchase",
      description: "Create purchase invoice",
      icon: Receipt,
      onClick: () => onNavigate?.("new-purchase"),
    },
    {
      id: "add-product",
      label: "Add Product",
      description: "Add inventory item / SKU",
      icon: PackagePlus,
      onClick: () => onNavigate?.("add-product"),
    },
    {
      id: "add-customer",
      label: "Add Customer",
      description: "Create walk-in or account customer",
      icon: UserPlus,
      onClick: () => onNavigate?.("customers-add"),
    },
    {
      id: "stock-transfer",
      label: "Stock Transfer",
      description: "Transfer stock between branches",
      icon: Repeat,
      onClick: () => onNavigate?.("stock-transfer"),
    },
    {
      id: "price-update",
      label: "Price Update",
      description: "Bulk price / margin update",
      icon: Edit3,
      disabled: true,
      onClick: () => undefined,
    },
  ];

  const unreadNotifications = notifications.filter((n) => !n.isRead).length;
  const selectedPeriodLabel: Record<DateFilter, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    lastMonth: "Last Month",
    year: "This Year",
    custom: "Custom Range",
  };

  return (
    <div className="p-6 space-y-6 bg-[#F7F7FA] min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-800">
              BillBull Dashboard
            </h1>
          </div>
          <p className="text-sm md:text-base font-light text-muted-foreground">
            Live overview of your retail sales, inventory and profitability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-end">
          {/* Connection */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex h-2 w-2 rounded-full",
                connectionStatus === "connected" && "bg-emerald-500",
                connectionStatus === "connecting" &&
                  "bg-amber-500 animate-pulse",
                connectionStatus === "disconnected" && "bg-red-500"
              )}
            />
            <span>
              {connectionStatus === "connected"
                ? "Connected"
                : connectionStatus === "connecting"
                ? "Connecting..."
                : "Disconnected"}
            </span>
          </div>

          {/* Branch filter */}
          <Select
            value={branchFilter}
            onValueChange={(value) => setBranchFilter(value)}
          >
            <SelectTrigger className="w-[160px] bg-white border-slate-200 shadow-sm hover:border-[#F5C742] focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-colors duration-150">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 bg-white shadow-lg">
              <SelectItem value="all" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">All Branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id} className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date filter */}
          <Select
            value={dateFilter}
            onValueChange={(v: DateFilter) => setDateFilter(v)}
          >
            <SelectTrigger className="w-[150px] bg-white border-slate-200 shadow-sm hover:border-[#F5C742] focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-colors duration-150">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 bg-white shadow-lg">
              <SelectItem value="today" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">Today</SelectItem>
              <SelectItem value="week" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">This Week</SelectItem>
              <SelectItem value="month" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">This Month</SelectItem>
              <SelectItem value="lastMonth" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">Last Month</SelectItem>
              <SelectItem value="year" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">This Year</SelectItem>
              <SelectItem value="custom" className="cursor-pointer rounded-lg focus:bg-[#FFF9DF] focus:text-slate-900">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshData()}
            disabled={isRefreshing}
            className="gap-1.5 border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[#F5C742] hover:bg-[#FFF9DF] hover:text-slate-900 disabled:opacity-50 transition-all duration-150"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                isRefreshing && "animate-spin text-[#D4A017]"
              )}
            />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[#F5C742] hover:bg-[#FFF9DF] hover:text-slate-900 transition-all duration-150"
            onClick={() => toast.info("Export coming soon")}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[#F5C742] hover:bg-[#FFF9DF] hover:text-slate-900 transition-all duration-150",
              hasAppliedAdvancedFilters && "border-[#F5C742] bg-[#FFF9DF] text-amber-800"
            )}
            onClick={() => setShowAdvancedFilters((value) => !value)}
          >
            <Filter className="h-3.5 w-3.5" />
            {hasAppliedAdvancedFilters ? "Filters active" : "Filter"}
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="relative border-slate-200 bg-white shadow-sm hover:border-[#F5C742] hover:bg-[#FFF9DF] transition-all duration-150"
            onClick={() => onNavigate?.("notifications")}
          >
            <Bell className="h-4 w-4 text-slate-600" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </Button>
        </div>
      </div>

      {showAdvancedFilters && (
        <div className="rounded-xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-[#F5C742]/30">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-[11px] font-medium text-slate-600">
              <span>From Date</span>
              <Input
                type="date"
                value={advancedFilters.fromDate}
                onChange={(e) =>
                  updateAdvancedFilter("fromDate", e.target.value)
                }
                className="h-9 border-slate-200 text-xs"
              />
            </label>

            <label className="space-y-1 text-[11px] font-medium text-slate-600">
              <span>To Date</span>
              <Input
                type="date"
                value={advancedFilters.toDate}
                onChange={(e) =>
                  updateAdvancedFilter("toDate", e.target.value)
                }
                className="h-9 border-slate-200 text-xs"
              />
            </label>

            <label className="space-y-1 text-[11px] font-medium text-slate-600">
              <span>Invoice Status</span>
              <Select
                value={advancedFilters.invoiceStatus}
                onValueChange={(value) =>
                  updateAdvancedFilter("invoiceStatus", value)
                }
              >
                <SelectTrigger className="h-9 bg-white border-slate-200 text-xs hover:border-[#F5C742] focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-colors duration-150">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 bg-white shadow-lg">
                  <SelectItem value="all" className="cursor-pointer rounded-lg text-xs focus:bg-[#FFF9DF] focus:text-slate-900">All Statuses</SelectItem>
                  <SelectItem value="draft" className="cursor-pointer rounded-lg text-xs focus:bg-[#FFF9DF] focus:text-slate-900">Draft</SelectItem>
                  <SelectItem value="confirmed" className="cursor-pointer rounded-lg text-xs focus:bg-[#FFF9DF] focus:text-slate-900">Confirmed</SelectItem>
                  <SelectItem value="posted" className="cursor-pointer rounded-lg text-xs focus:bg-[#FFF9DF] focus:text-slate-900">Posted</SelectItem>
                  <SelectItem value="paid" className="cursor-pointer rounded-lg text-xs focus:bg-[#FFF9DF] focus:text-slate-900">Paid</SelectItem>
                  <SelectItem value="partially_paid" className="cursor-pointer rounded-lg text-xs focus:bg-[#FFF9DF] focus:text-slate-900">Partially Paid</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1 text-[11px] font-medium text-slate-600">
              <span>Min Amount</span>
              <Input
                type="number"
                min="0"
                value={advancedFilters.minAmount}
                onChange={(e) =>
                  updateAdvancedFilter("minAmount", e.target.value)
                }
                className="h-9 border-slate-200 text-xs"
              />
            </label>

            <label className="space-y-1 text-[11px] font-medium text-slate-600">
              <span>Max Amount</span>
              <Input
                type="number"
                min="0"
                value={advancedFilters.maxAmount}
                onChange={(e) =>
                  updateAdvancedFilter("maxAmount", e.target.value)
                }
                className="h-9 border-slate-200 text-xs"
              />
            </label>

            <div className="flex items-end gap-2">
              <Button
                size="sm"
                className="h-9 bg-[#F5C742] text-xs text-slate-900 hover:bg-[#E5B732]"
                onClick={applyAdvancedFilters}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-slate-300 text-xs"
                onClick={clearAdvancedFilters}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Global search + Quick actions */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Global Search */}
        <div className="relative billbull-search-container">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (searchResults.length > 0) {
                    handleSearchResultClick(searchResults[0]);
                  } else if (searchTerm.trim()) {
                    searchGlobal(searchTerm);
                  }
                }
                if (e.key === "Escape") {
                  setShowSearchResults(false);
                  setSearchTerm("");
                }
              }}
              onFocus={() => {
                if (searchTerm.trim() && searchResults.length > 0) setShowSearchResults(true);
              }}
              placeholder="Search invoices, LPOs, GRNs, products, customers, quotations…"
              className="h-11 pl-9 pr-20 bg-white border-slate-200 text-sm shadow-sm hover:border-slate-300 focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-colors duration-150 placeholder:text-slate-400"
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {isSearching ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
              ) : (
                <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                  ↵
                </kbd>
              )}
            </div>
          </div>

          {/* Search Results */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute z-50 mt-1.5 w-full rounded-xl border-0 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-h-80 overflow-y-auto ring-1 ring-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                <span>
                  <span className="font-medium text-slate-700">{searchResults.length}</span>{" "}
                  {searchResults.length === 1 ? "result" : "results"} — press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px]">↵</kbd> to open first
                </span>
                <span className="inline-flex items-center gap-1 text-[#D4A017]">
                  <Search className="h-3 w-3" />
                  Click to open
                </span>
              </div>
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSearchResultClick(item)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#FFF9DF] transition-colors duration-100"
                >
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                    item.type === "product" && "bg-[#FFF4BF] text-[#786009]",
                    item.type === "customer" && "bg-blue-50 text-blue-700",
                    item.type === "invoice" && "bg-emerald-50 text-emerald-700",
                    item.type === "lpo" && "bg-purple-50 text-purple-700",
                    item.type === "grn" && "bg-orange-50 text-orange-700",
                    item.type === "quotation" && "bg-teal-50 text-teal-700"
                  )}>
                    {item.type === "product" && "SKU"}
                    {item.type === "customer" && "CST"}
                    {item.type === "invoice" && "INV"}
                    {item.type === "lpo" && "LPO"}
                    {item.type === "grn" && "GRN"}
                    {item.type === "quotation" && "QTN"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">
                        {item.title}
                      </p>
                      {item.meta?.rightTag && (
                        <span className="whitespace-nowrap text-[10px] text-slate-500">
                          {item.meta.rightTag}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="truncate text-[11px] text-slate-500">
                        {item.subtitle}
                      </p>
                    )}
                    {item.meta?.badge && (
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {item.meta.badge}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {showSearchResults &&
            !isSearching &&
            searchResults.length === 0 &&
            searchTerm.trim() && (
              <div className="absolute z-50 mt-1.5 w-full rounded-xl border-0 bg-white px-3 py-3 text-center text-xs text-slate-500 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-slate-100">
                No results for <span className="font-medium text-slate-700">"{searchTerm}"</span>
              </div>
            )}
        </div>

        {/* Quick Actions */}
        <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Quick Actions
            </CardTitle>
            <CardDescription className="text-xs">
              Shortcuts to your most common retail workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {quickActions.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  variant="outline"
                  className={cn(
                    "h-auto flex flex-col items-start justify-start gap-1 rounded-xl border-slate-200 bg-white px-3 py-2 text-left hover:border-[#F5C742] hover:bg-[#FFF9DF]",
                    action.disabled &&
                      "cursor-not-allowed opacity-50 hover:border-slate-200 hover:bg-white"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFF4BF] text-[#786009]">
                      <action.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs">
                      {action.label}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {action.description}
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content tabs (Overview only for now) */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-9 w-fit rounded-full bg-white border-0 shadow-sm ring-1 ring-slate-100">
          <TabsTrigger
            value="overview"
            className="rounded-full data-[state=active]:bg-[#F5C742] data-[state=active]:text-slate-900 data-[state=active]:shadow-sm px-4 text-xs transition-all duration-150"
          >
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* KPI Row */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Gross Sales */}
            <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-24" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ) : salesKpi ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-slate-500">
                        Gross Sales{" "}
                        {selectedPeriodLabel[dateFilter]}
                      </p>
                      <p className="mt-1 text-2xl tracking-tight">
                        {formatCurrency(salesKpi.grossSales)}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {salesKpi.salesChange >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span
                          className={cn(
                            "text-xs font-medium",
                            salesKpi.salesChange >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          )}
                        >
                          {salesKpi.salesChange >= 0 ? "+" : ""}
                          {salesKpi.salesChange.toFixed(1)}%
                        </span>
                        <span className="text-[11px] text-slate-500">
                          vs previous period
                        </span>
                      </div>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF4BF]">
                      <DollarSign className="h-5 w-5 text-[#8A6C00]" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-center text-slate-500">
                    No sales KPI data.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Customers */}
            <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ) : salesKpi ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-slate-500">
                        Total Customers
                      </p>
                      <p className="mt-1 text-2xl tracking-tight">
                        {salesKpi.customers.toLocaleString()}
                      </p>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {salesKpi.newCustomers > 0 ? (
                          <>
                            <span className="font-medium text-emerald-600">
                              +{salesKpi.newCustomers}
                            </span>{" "}
                            new customers
                          </>
                        ) : (
                          "No new customers in this period"
                        )}
                      </div>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                      <Users className="h-5 w-5 text-slate-700" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-center text-slate-500">
                    No customer data.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top Department */}
            <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ) : salesKpi?.topDepartment ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-slate-500">
                        Top Performing Department
                      </p>
                      <p className="mt-1 text-base">
                        {salesKpi.topDepartment.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCurrency(
                          salesKpi.topDepartment.salesAmount
                        )}{" "}
                        &middot;{" "}
                        {salesKpi.topDepartment.contribution.toFixed(1)}% of
                        sales
                      </p>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-center text-slate-500">
                    No department performance data.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Stock Alerts */}
            <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ) : inventoryKpis ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-slate-500">Stock Alerts</p>
                      <p className="mt-1 text-2xl tracking-tight">
                        {inventoryKpis.lowStockCount +
                          inventoryKpis.outOfStockCount}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span>
                          <span className="font-medium text-amber-600">
                            {inventoryKpis.lowStockCount}
                          </span>{" "}
                          low stock
                        </span>
                        <span>
                          <span className="font-medium text-red-600">
                            {inventoryKpis.outOfStockCount}
                          </span>{" "}
                          out of stock
                        </span>
                      </div>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-center text-slate-500">
                    No stock alert data.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sales & Payments + Branch performance */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* Sales Trend & Hourly Sales */}
            <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">
                      Sales Trend
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {dateFilter === "today"
                        ? "Hourly sales performance for today."
                        : `Sales vs returns and gross profit for ${selectedPeriodLabel[
                            dateFilter
                          ].toLowerCase()}.`}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-[#F5C742]/50 text-[11px]"
                  >
                    {branchFilter === "all"
                      ? "All branches"
                      : branches.find((b) => b.id === branchFilter)?.name ??
                        "Branch"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : (
                  <div className="w-full" style={{ minHeight: '260px' }}>
                    <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        width={60}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        name="Sales"
                        stroke="#F5C742"
                        fill="#F5C742"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="returns"
                        name="Returns"
                        stroke="#f97373"
                        fill="#f97373"
                        fillOpacity={0.1}
                        strokeWidth={1.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="profit"
                        name="Profit"
                        stroke="#22c55e"
                        fill="#22c55e"
                        fillOpacity={0.12}
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  </div>
                )}

                <Separator />

                {/* Hourly sales */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-600">
                      Today&apos;s Hourly Sales
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Peak hour:{" "}
                      <span className="font-semibold">
                        {salesKpi?.peakHourLabel ?? "N/A"}
                      </span>
                    </p>
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-[120px] w-full" />
                  ) : (
                    <div className="w-full" style={{ minHeight: '120px' }}>
                      <ResponsiveContainer width="100%" height={120}>
                      <ReBarChart data={hourlySales}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="hourLabel"
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                          interval={2}
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                          width={50}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar
                          dataKey="amount"
                          name="Sales"
                          radius={[4, 4, 0, 0]}
                          fill="#F5C742"
                        />
                      </ReBarChart>
                    </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment breakdown & Branch performance */}
            <div className="space-y-4">
              {/* Payment breakdown */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Payment Breakdown
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Distribution of payment methods for the selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <Skeleton className="h-[190px] w-full" />
                  ) : (
                    <div className="grid grid-cols-[1.3fr_1.7fr] gap-3 items-center">
                      <div className="w-full" style={{ minHeight: '170px' }}>
                        <ResponsiveContainer width="100%" height={170}>
                        <PieChart>
                          <Pie
                            key="payment-breakdown-pie"
                            data={paymentBreakdown}
                            dataKey="amount"
                            nameKey="method"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                          >
                            {paymentBreakdown.map((item, index) => {
                              const palette = [
                                "#F5C742",
                                "#0EA5E9",
                                "#22C55E",
                                "#6366F1",
                                "#F97316",
                              ];
                              return (
                                <Cell
                                  key={`payment-cell-${item.method}-${index}`}
                                  fill={palette[index % palette.length]}
                                />
                              );
                            })}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {paymentBreakdown.map((item, index) => {
                          const palette = [
                            "#F5C742",
                            "#0EA5E9",
                            "#22C55E",
                            "#6366F1",
                            "#F97316",
                          ];
                          const PaymentIcon =
                            item.method.toLowerCase() === "cash"
                              ? Banknote
                              : item.method
                                  .toLowerCase()
                                  .includes("card")
                              ? CreditCard
                              : Wallet;
                          return (
                            <div
                              key={item.method}
                              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                                  style={{
                                    backgroundColor: `${palette[index % palette.length]}22`,
                                    color: palette[index % palette.length],
                                  }}
                                >
                                  <PaymentIcon className="h-3 w-3" />
                                </span>
                                <span className="text-[11px] font-medium text-slate-700">
                                  {item.method}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] font-medium text-slate-800">
                                  {formatCurrency(item.amount)}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {item.percentage.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {paymentBreakdown.length === 0 && (
                          <p className="text-[11px] text-slate-500">
                            No payment data.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Branch performance */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Branch Performance
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Sales comparison across branches.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {isLoading ? (
                    <Skeleton className="h-[130px] w-full" />
                  ) : (
                    <div className="w-full" style={{ minHeight: '130px' }}>
                      <ResponsiveContainer width="100%" height={130}>
                      <ReBarChart data={branchPerformance}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="branch"
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                          width={55}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar
                          dataKey="sales"
                          name="Sales"
                          radius={[4, 4, 0, 0]}
                          fill="#F5C742"
                        />
                      </ReBarChart>
                    </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Inventory overview + top items + slow items */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)]">
            {/* Inventory overview + KPIs */}
            <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Inventory Overview
                </CardTitle>
                <CardDescription className="text-xs">
                  Snapshot of SKU count, stock status and inventory value.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                    ))}
                  </div>
                ) : inventoryKpis ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Total SKUs */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">
                          Total SKUs
                        </p>
                        <p className="mt-1 text-lg">
                          {inventoryKpis.totalSkus.toLocaleString()}
                        </p>
                        <Progress
                          value={
                            (inventoryKpis.activeSkus /
                              (inventoryKpis.totalSkus || 1)) *
                            100
                          }
                          className="mt-1 h-1.5"
                        />
                      </div>

                      {/* Active SKUs */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">
                          Active SKUs
                        </p>
                        <p className="mt-1 text-lg">
                          {inventoryKpis.activeSkus.toLocaleString()}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {inventoryKpis.activeSkuPercentage.toFixed(1)}% active
                        </p>
                      </div>

                      {/* Inventory Value (Cost) */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">
                          Inventory @ Cost
                        </p>
                        <p className="mt-1 text-lg">
                          {formatCurrency(inventoryKpis.inventoryValueCost)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          Projected margin:{" "}
                          <span className="font-medium text-emerald-600">
                            {inventoryKpis.projectedMargin.toFixed(1)}%
                          </span>
                        </p>
                      </div>

                      {/* Inventory Value (Retail) */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">
                          Inventory @ Retail
                        </p>
                        <p className="mt-1 text-lg">
                          {formatCurrency(inventoryKpis.inventoryValueRetail)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {inventoryKpis.branchesWithStock} branches with stock
                        </p>
                      </div>
                    </div>

                    {/* Department level summary */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-slate-600">
                        Department-wise Inventory Value
                      </p>
                      <div className="space-y-1.5">
                        {inventoryKpis.departmentBreakdown
                          .slice(0, 4)
                          .map((dept) => (
                            <div
                              key={dept.name}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: dept.color }}
                                />
                                <span className="text-slate-700">
                                  {dept.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <span>
                                  {formatCurrency(dept.valueCost)}
                                </span>
                                <span className="text-[10px]">
                                  {dept.percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        {inventoryKpis.departmentBreakdown.length === 0 && (
                          <p className="text-[11px] text-slate-500">
                            No department breakdown data available.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-center text-slate-500">
                    No inventory data.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top & Slow moving items */}
            <div className="space-y-4">
              {/* Top selling items */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Top Selling Items
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Highest selling SKUs in the selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-md" />
                          <div className="flex-1 space-y-1">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-2 w-24" />
                          </div>
                          <Skeleton className="h-3 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : topSellingItems.length > 0 ? (
                    <div className="space-y-2">
                      {topSellingItems.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            onNavigate?.("inventory-product-detail", {
                              productId: item.id,
                            })
                          }
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                        >
                          <div className="relative h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center text-[11px] font-semibold text-slate-600">
                            {item.thumbnailUrl ? (
                              <Avatar className="h-8 w-8 rounded-md">
                                <AvatarImage src={item.thumbnailUrl} />
                                <AvatarFallback className="rounded-md">
                                  SKU
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              item.code?.slice(-3) ?? "SKU"
                            )}
                            {item.rank && item.rank <= 3 && (
                              <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F5C742] text-[9px] text-black">
                                #{item.rank}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-medium text-slate-800">
                                {item.name}
                              </p>
                              <span className="whitespace-nowrap text-[10px] text-slate-500">
                                {item.qtySold.toLocaleString()} pcs
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span className="truncate">
                                {item.department} &middot; {item.code}
                              </span>
                              <span className="whitespace-nowrap">
                                {formatCurrency(item.salesAmount)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-center text-slate-500">
                      No top-selling item data.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Slow moving items */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Slow-moving Items
                  </CardTitle>
                  <CardDescription className="text-xs">
                    SKUs with low movement in the last period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-2 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : slowMovingItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {slowMovingItems.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-[11px] font-medium text-slate-700">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Last sold:{" "}
                              {item.lastSoldDate
                                ? formatRelativeDate(item.lastSoldDate)
                                : "Not sold"}
                            </span>
                          </div>
                          <div className="flex flex-col items-end text-[10px] text-slate-500">
                            <span>
                              Stock:{" "}
                              <span className="font-medium text-slate-700">
                                {item.currentStock}
                              </span>
                            </span>
                            <span className="text-[10px]">
                              {item.lastSoldDate
                                ? `${item.daysSinceLastSale} days idle`
                                : "No sale date"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-center text-slate-500">
                      No slow-moving item data.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Today bills + Purchase analytics + Accounting + Notifications */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* Today Bills & Purchase */}
            <div className="space-y-4">
              {/* Today Bills */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">
                        Today&apos;s Bills
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Live list of today&apos;s invoices and receipts.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 border-slate-200 text-[11px]"
                      onClick={() => onNavigate?.("sales-invoices")}
                    >
                      View all
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3"
                        >
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : todayBills.length > 0 ? (
                    <div className="space-y-1.5">
                      {todayBills.slice(0, 7).map((bill) => (
                        <button
                          key={bill.id}
                          type="button"
                          onClick={() =>
                            onNavigate?.("sales-invoice-detail", {
                              invoiceId: bill.id,
                            })
                          }
                          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate font-medium text-slate-800">
                                {bill.billNo}
                              </span>
                              <span className="whitespace-nowrap text-slate-500">
                                {formatTime(bill.billTime)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span className="truncate">
                                {bill.customerName || "Walk-in customer"}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="font-medium text-slate-800">
                                  {formatCurrency(bill.totalAmount)}
                                </span>
                                {bill.status === "Paid" && (
                                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                                    Paid
                                  </span>
                                )}
                                {bill.status === "Credit" && (
                                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                                    Credit
                                  </span>
                                )}
                                {bill.status === "Refund" && (
                                  <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-700">
                                    Refund
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-center text-slate-500">
                      No bills created today yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Purchase analytics */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">
                        Purchase & Supplier Analytics
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Track spend, GRNs and pending approvals.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 border-slate-200 text-[11px]"
                      onClick={() => onNavigate?.("purchases")}
                    >
                      Purchases
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <div className="grid grid-cols-3 gap-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-6 w-24" />
                        </div>
                      ))}
                    </div>
                  ) : purchaseAnalytics ? (
                    <>
                      <div className="grid grid-cols-3 gap-3 text-[11px]">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">Purchase Value</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {formatCurrency(
                              purchaseAnalytics.totalPurchaseValue
                            )}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {purchaseAnalytics.suppliersCount} suppliers
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">Open LPOs</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {purchaseAnalytics.openLpoCount}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {purchaseAnalytics.pendingGrnCount} pending GRNs
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">Due to Suppliers</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {formatCurrency(
                              purchaseAnalytics.outstandingToSuppliers
                            )}
                          </p>
                          <p className="mt-0.5 text-[10px] text-red-600">
                            {purchaseAnalytics.overdueBillsCount} overdue bills
                          </p>
                        </div>
                      </div>

                      {purchaseAnalytics.suggestion && (
                        <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-[11px]">
                          <Info className="mt-0.5 h-3.5 w-3.5 text-[#F5C742]" />
                          <p className="text-slate-600">
                            <span className="font-semibold text-slate-800">
                              Smart insight:{" "}
                            </span>
                            {purchaseAnalytics.suggestion}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-center text-slate-500">
                      No purchase analytics available.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Accounting + Notifications */}
            <div className="space-y-4">
              {/* Accounting Snapshot */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">
                        Accounting Snapshot
                      </CardTitle>
                      <CardDescription className="text-xs">
                        High-level view of cash flow, VAT and expenses.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 border-slate-200 text-[11px]"
                      onClick={() => onNavigate?.("financials-dashboard")}
                    >
                      Financials
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-6 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : accountingSnapshot ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">Net Cash Flow</p>
                          <p
                            className={cn(
                              "mt-1 text-sm",
                              accountingSnapshot.netCashFlow >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            )}
                          >
                            {formatCurrency(
                              accountingSnapshot.netCashFlow
                            )}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Inflow:{" "}
                            <span className="font-medium">
                              {formatCurrency(
                                accountingSnapshot.cashInflow
                              )}
                            </span>{" "}
                            &middot; Outflow:{" "}
                            <span className="font-medium">
                              {formatCurrency(
                                accountingSnapshot.cashOutflow
                              )}
                            </span>
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">Expenses</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {formatCurrency(
                              accountingSnapshot.totalExpenses
                            )}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {accountingSnapshot.majorExpenseHead}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">VAT Position</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {formatCurrency(accountingSnapshot.vatPayable)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Sales VAT:{" "}
                            {formatCurrency(
                              accountingSnapshot.vatOnSales
                            )}{" "}
                            &middot; Purchase VAT:{" "}
                            {formatCurrency(
                              accountingSnapshot.vatOnPurchases
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-slate-500">Receivables</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {formatCurrency(
                              accountingSnapshot.customerReceivables
                            )}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Payables:{" "}
                            {formatCurrency(
                              accountingSnapshot.supplierPayables
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-center text-slate-500">
                      No accounting snapshot available.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Notifications */}
              <Card className="border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">
                        Alerts & Notifications
                      </CardTitle>
                      {unreadNotifications > 0 && (
                        <Badge
                          variant="destructive"
                          className="h-5 text-[10px]"
                        >
                          {unreadNotifications} new
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => onNavigate?.("notifications")}
                    >
                      View all
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Low stock, payment due, and system alerts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-2 w-40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : notifications.length > 0 ? (
                    <div className="space-y-2">
                      {notifications.slice(0, 5).map((n) => {
                        const style = getNotificationStyle(n.type);
                        const NotificationIcon = style.icon;
                        return (
                          <div
                            key={n.id}
                            className={cn(
                              "flex gap-2 rounded-lg px-2 py-1.5 text-[11px]",
                              !n.isRead ? "bg-slate-50" : "hover:bg-slate-50"
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full",
                                style.bg,
                                style.color
                              )}
                            >
                              <NotificationIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate font-medium text-slate-800">
                                  {n.title}
                                </p>
                                <span className="whitespace-nowrap text-[10px] text-slate-500">
                                  {formatRelativeDate(
                                    n.timestamp || n.createdAt
                                  )}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-slate-600">
                                {n.message}
                              </p>
                              {n.actionUrl && (
                                <button
                                  type="button"
                                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[#8A6C00] hover:underline"
                                  onClick={() =>
                                    window.open(n.actionUrl, "_blank")
                                  }
                                >
                                  Take action
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-center text-slate-500">
                      No notifications.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
}

