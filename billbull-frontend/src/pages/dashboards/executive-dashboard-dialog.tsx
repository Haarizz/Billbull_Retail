import React, { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Separator } from "../../components/ui/separator";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
} from "recharts";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgePercent,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Globe,
  LineChart as LineChartIcon,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquare,
  Monitor,
  Package,
  PackageSearch,
  PieChart as PieChartIcon,
  RefreshCw,
  ScanBarcode,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Target,
  Timer,
  Truck,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";

/* -------------------------------------------------------
   THEME & CONSTANTS
------------------------------------------------------- */
const BG = "#F7F7FA";
const GOLD = "#F5C742";
const INK = "#1E293B";

/* -------------------------------------------------------
   TYPES
------------------------------------------------------- */
interface ExecutiveDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topKPIs: {
    totalSales: number;
    billsCount: number;
    avgBasket: number;
    grossMarginPct: number;
    inventoryAccuracyScore: number;
    shrinkagePct: number;
    monthlyGrowth: number;
  };
  formatCurrency: (amount: number) => string;
  getCurrentPeriod: () => string;
}

interface KPI {
  label: string;
  value: number | string;
  trend?: "up" | "down" | "flat";
  unit?: string;
}

interface AlertItem {
  id: string;
  type: "alert" | "opportunity" | "anomaly";
  priority: "High" | "Medium" | "Low";
  title: string;
  description: string;
  suggestedAction: string;
  impact: string;
  module: string;
  createdAt: string;
}

interface Initiative {
  id: string;
  title: string;
  owner: string;
  status: "Planning" | "In Progress" | "At Risk" | "Completed";
  completion: number;
  deadline: string;
  impact: "High" | "Medium" | "Low";
  tags: string[];
  objective: string;
  deliverables: {
    title: string;
    status: "Done" | "In Progress" | "Pending";
  }[];
  updates: { at: string; by: string; text: string; type: "note" | "milestone" }[];
}

interface ActionItem {
  id: string;
  title: string;
  module: string;
  assignee: string;
  due: string;
  status: "Open" | "In Progress" | "Blocked" | "Done";
  severity: "P1" | "P2" | "P3";
}

interface Vendor {
  id: string;
  name: string;
  onTimePct: number;
  fillRatePct: number;
  priceCompliancePct: number;
  returnsPct: number;
  creditDays: number;
  risk: "Low" | "Medium" | "High";
}

interface BranchKPI {
  branch: string;
  sales: number;
  gmPct: number;
  shrinkPct: number;
  accuracy: number;
  oosRate: number;
  cashVariancePct: number;
  nps: number;
}

/* -------------------------------------------------------
   HELPER FUNCTIONS
------------------------------------------------------- */
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatPct(n: number, digits = 1) {
  return `${n.toFixed(digits)}%`;
}

function scoreBadge(score: number) {
  if (score >= 90) return "bg-emerald-100 text-emerald-900";
  if (score >= 80) return "bg-blue-100 text-blue-900";
  if (score >= 70) return "bg-yellow-100 text-yellow-900";
  return "bg-red-100 text-red-900";
}

function riskBadge(r: "Low" | "Medium" | "High") {
  if (r === "Low") return "bg-emerald-100 text-emerald-900";
  if (r === "Medium") return "bg-yellow-100 text-yellow-900";
  return "bg-red-100 text-red-900";
}

function priorityBadge(p: "High" | "Medium" | "Low") {
  if (p === "High") return "bg-red-100 text-red-900";
  if (p === "Medium") return "bg-yellow-100 text-yellow-900";
  return "bg-slate-100 text-slate-800";
}

function statusBadge(s: Initiative["status"] | ActionItem["status"]) {
  switch (s) {
    case "Completed":
    case "Done":
      return "bg-emerald-100 text-emerald-900";
    case "In Progress":
      return "bg-blue-100 text-blue-900";
    case "At Risk":
    case "Blocked":
      return "bg-red-100 text-red-900";
    case "Planning":
    case "Open":
      return "bg-slate-100 text-slate-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

function moduleIcon(module: string) {
  switch (module) {
    case "Sales":
      return <ShoppingCart className="h-4 w-4" />;
    case "Inventory":
      return <Boxes className="h-4 w-4" />;
    case "Wastage":
      return <AlertTriangle className="h-4 w-4" />;
    case "Cash":
      return <Wallet className="h-4 w-4" />;
    case "AP":
      return <Banknote className="h-4 w-4" />;
    case "AR":
      return <CircleDollarSign className="h-4 w-4" />;
    case "Vendors":
      return <Truck className="h-4 w-4" />;
    case "Branches":
      return <Store className="h-4 w-4" />;
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
}

/* -------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------- */
export function ExecutiveDashboardDialog({
  open,
  onOpenChange,
  topKPIs,
  formatCurrency,
  getCurrentPeriod,
}: ExecutiveDashboardDialogProps) {
  const [period, setPeriod] = useState("this_month");
  const [branch, setBranch] = useState("All Branches");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dense, setDense] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Initiative drilldown
  const [selectedInitiative, setSelectedInitiative] = useState<Initiative | null>(null);
  const [showInitiativeDetails, setShowInitiativeDetails] = useState(false);

  // Alert drilldown
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [showAlertDetails, setShowAlertDetails] = useState(false);

  /* -------------------------------------------------------
     MOCK DATA (Backend-ready)
  ------------------------------------------------------- */
  const dashboardKPIs: KPI[] = useMemo(
    () => [
      {
        label: "Total Sales",
        value: formatCurrency(topKPIs.totalSales),
        trend: "up",
      },
      {
        label: "Gross Margin",
        value: topKPIs.grossMarginPct,
        trend: topKPIs.grossMarginPct > 22 ? "up" : "down",
        unit: "%",
      },
      {
        label: "Inventory Accuracy",
        value: topKPIs.inventoryAccuracyScore,
        trend: "flat",
        unit: "%",
      },
      {
        label: "Shrinkage",
        value: topKPIs.shrinkagePct,
        trend: "down",
        unit: "%",
      },
      {
        label: "Cash Variance",
        value: 0.18,
        trend: "up",
        unit: "%",
      },
      {
        label: "Monthly Growth",
        value: topKPIs.monthlyGrowth,
        trend: topKPIs.monthlyGrowth > 0 ? "up" : "down",
        unit: "%",
      },
    ],
    [topKPIs, formatCurrency]
  );

  const salesTrend = useMemo(
    () => [
      { label: "W1", sales: 81250, bills: 920, avgBasket: 88 },
      { label: "W2", sales: 84500, bills: 965, avgBasket: 87.6 },
      { label: "W3", sales: 90120, bills: 1012, avgBasket: 89.1 },
      { label: "W4", sales: 94800, bills: 1090, avgBasket: 87.0 },
    ],
    []
  );

  const inventoryTrend = useMemo(
    () => [
      { label: "W1", accuracy: 88, shrinkPct: 1.1, oosRate: 3.9 },
      { label: "W2", accuracy: 86, shrinkPct: 1.2, oosRate: 4.4 },
      { label: "W3", accuracy: 84, shrinkPct: 1.3, oosRate: 4.8 },
      { label: "W4", accuracy: 85, shrinkPct: 1.2, oosRate: 4.2 },
    ],
    []
  );

  const branchKPIs: BranchKPI[] = useMemo(
    () => [
      {
        branch: "Deira Flagship",
        sales: 172500,
        gmPct: 22.3,
        shrinkPct: 1.1,
        accuracy: 89,
        oosRate: 3.8,
        cashVariancePct: 0.12,
        nps: 61,
      },
      {
        branch: "Al Barsha",
        sales: 151900,
        gmPct: 21.4,
        shrinkPct: 1.3,
        accuracy: 84,
        oosRate: 5.2,
        cashVariancePct: 0.26,
        nps: 56,
      },
      {
        branch: "Fujairah Central",
        sales: 126300,
        gmPct: 23.1,
        shrinkPct: 1.0,
        accuracy: 87,
        oosRate: 3.6,
        cashVariancePct: 0.09,
        nps: 59,
      },
    ],
    []
  );

  const vendorScorecards: Vendor[] = useMemo(
    () => [
      {
        id: "v1",
        name: "Gulf FMCG Supplies",
        onTimePct: 92,
        fillRatePct: 96,
        priceCompliancePct: 88,
        returnsPct: 1.8,
        creditDays: 30,
        risk: "Low",
      },
      {
        id: "v2",
        name: "FreshChain Foods",
        onTimePct: 81,
        fillRatePct: 89,
        priceCompliancePct: 84,
        returnsPct: 3.6,
        creditDays: 21,
        risk: "Medium",
      },
      {
        id: "v3",
        name: "ValueMart Importers",
        onTimePct: 74,
        fillRatePct: 82,
        priceCompliancePct: 77,
        returnsPct: 5.2,
        creditDays: 45,
        risk: "High",
      },
    ],
    []
  );

  const initiatives: Initiative[] = useMemo(
    () => [
      {
        id: "i1",
        title: "Inventory Accuracy Sprint",
        owner: "Ops Manager",
        status: "In Progress",
        completion: 72,
        deadline: "2026-01-15",
        impact: "High",
        tags: ["Cycle Count", "Wastage", "Variance"],
        objective:
          "Improve stock count accuracy across all branches through systematic cycle counting, variance analysis, and wastage control.",
        deliverables: [
          { title: "A-class cycle count completed", status: "Done" },
          { title: "Daily variance dashboard", status: "In Progress" },
          {
            title: "Root-cause workflow + approvals",
            status: "In Progress",
          },
          {
            title: "Wastage evidence capture rollout",
            status: "Pending",
          },
        ],
        updates: [
          {
            at: "2025-12-18",
            by: "Ops Manager",
            text: "All branches trained on count SOP. Barsha needs tighter approval controls.",
            type: "note",
          },
          {
            at: "2025-12-15",
            by: "Inventory Lead",
            text: "Milestone: A-class SKU coverage reached 100%.",
            type: "milestone",
          },
        ],
      },
      {
        id: "i2",
        title: "Vendor Scorecards Rollout",
        owner: "Purchasing Lead",
        status: "In Progress",
        completion: 58,
        deadline: "2026-02-10",
        impact: "Medium",
        tags: ["OTIF", "Compliance", "Returns"],
        objective:
          "Implement vendor performance tracking: on-time delivery, fill rate, quality/returns, and price compliance.",
        deliverables: [
          { title: "KPI definitions approved", status: "Done" },
          { title: "Automated data collection", status: "In Progress" },
          { title: "Monthly vendor review pack", status: "In Progress" },
          { title: "Vendor portal messaging", status: "Pending" },
        ],
        updates: [
          {
            at: "2025-12-17",
            by: "Purchasing Lead",
            text: "Pilot vendor scorecard shared with 2 suppliers; feedback positive.",
            type: "note",
          },
        ],
      },
      {
        id: "i3",
        title: "Branch Benchmarking Program",
        owner: "CFO",
        status: "Planning",
        completion: 25,
        deadline: "2026-03-01",
        impact: "High",
        tags: ["KPI", "Benchmark", "Targets"],
        objective:
          "Build benchmarking across branches: GM%, shrink, OOS, cash variance, and customer satisfaction.",
        deliverables: [
          {
            title: "Define KPI set + scoring model",
            status: "In Progress",
          },
          { title: "Dashboard comparisons", status: "Pending" },
          { title: "Monthly review cadence", status: "Pending" },
        ],
        updates: [
          {
            at: "2025-12-16",
            by: "CFO",
            text: "Draft KPI set prepared. Need final alignment with ops & finance.",
            type: "note",
          },
        ],
      },
      {
        id: "i4",
        title: "Cash Variance Controls",
        owner: "Finance",
        status: "In Progress",
        completion: 81,
        deadline: "2026-01-05",
        impact: "High",
        tags: ["Reconciliation", "Approvals", "Alerts"],
        objective:
          "Minimize cash handling discrepancies with stronger reconciliation workflows, dual approvals, and variance alerts.",
        deliverables: [
          {
            title: "Dual approval for high-value refunds",
            status: "Done",
          },
          { title: "End-of-day cash checklist", status: "Done" },
          { title: "Variance alerts (real-time)", status: "In Progress" },
          { title: "Exception audit report", status: "Pending" },
        ],
        updates: [
          {
            at: "2025-12-19",
            by: "Finance",
            text: "Variance alerts enabled for Deira; rolling out to other branches.",
            type: "milestone",
          },
        ],
      },
    ],
    []
  );

  const alerts: AlertItem[] = useMemo(
    () => [
      {
        id: "a1",
        type: "opportunity",
        priority: "High",
        title: "Improve GM% via price & cost audit",
        description:
          "Margin is below target. Identify top 30 SKUs causing leakage (discount overrides, cost changes, promo abuse).",
        suggestedAction:
          "Run price audit + vendor cost review + lock overrides beyond threshold.",
        impact: "+1.2% GM potential / month",
        createdAt: "2025-12-19",
        module: "Sales",
      },
      {
        id: "a2",
        type: "alert",
        priority: "High",
        title: "Stock-out risk on fast movers",
        description:
          "OOS rate is rising for A-class SKUs. Basket value may drop and customers may churn.",
        suggestedAction:
          "Auto-reorder + min/max refresh (velocity-based), review supplier OTIF.",
        impact: "Recover AED 8,000â€“12,000 sales",
        createdAt: "2025-12-18",
        module: "Inventory",
      },
      {
        id: "a3",
        type: "anomaly",
        priority: "Medium",
        title: "Internal wastage spike detected (Branch: Al Barsha)",
        description:
          "Wastage value jumped 42% vs last week; reasons concentrated in 'Expiry' and 'Handling Damage'.",
        suggestedAction:
          "Enable dual approval + attach photo evidence + run expiry FEFO audit.",
        impact: "Shrink -0.2% to -0.4%",
        createdAt: "2025-12-17",
        module: "Wastage",
      },
      {
        id: "a4",
        type: "alert",
        priority: "Medium",
        title: "AP aging creeping up",
        description:
          "Vendor payments delayed for a few suppliers; risk of supply disruption and loss of credit terms.",
        suggestedAction:
          "Prioritize critical suppliers + renegotiate terms + run payment calendar.",
        impact: "Avoid stock disruption & penalties",
        createdAt: "2025-12-16",
        module: "AP",
      },
    ],
    []
  );

  const actions: ActionItem[] = useMemo(
    () => [
      {
        id: "t1",
        title: "Approve high-value wastage (Expiry > AED 1,000)",
        module: "Wastage Approval",
        assignee: "Branch Manager",
        due: "2025-12-20",
        status: "Open",
        severity: "P1",
      },
      {
        id: "t2",
        title: "Cycle count: A-class SKUs (Deira)",
        module: "Cycle Count",
        assignee: "Inventory Lead",
        due: "2025-12-21",
        status: "In Progress",
        severity: "P2",
      },
      {
        id: "t3",
        title: "Cash variance review (last 7 days)",
        module: "Cash Variance",
        assignee: "Finance",
        due: "2025-12-22",
        status: "Open",
        severity: "P2",
      },
      {
        id: "t4",
        title: "Vendor follow-up: ValueMart OTIF below 80%",
        module: "Vendor Follow-up",
        assignee: "Purchasing Lead",
        due: "2025-12-23",
        status: "Blocked",
        severity: "P3",
      },
    ],
    []
  );

  const cashVarianceDaily = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const base = 12000;
    return days.map((d, idx) => {
      const expected = base + idx * 800;
      const actual =
        expected + (idx % 3 === 0 ? 220 : idx % 3 === 1 ? -140 : 60);
      return { date: d, expected, actual, variance: actual - expected };
    });
  }, []);

  /* -------------------------------------------------------
     EFFECTS
  ------------------------------------------------------- */
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 900);
    }, 60000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  /* -------------------------------------------------------
     UI HELPERS
  ------------------------------------------------------- */
  const trendIcon = (t?: KPI["trend"]) =>
    t === "up" ? (
      <TrendingUp className="h-4 w-4 text-emerald-600" />
    ) : t === "down" ? (
      <TrendingDown className="h-4 w-4 text-red-600" />
    ) : null;

  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */
  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none p-0 m-0 overflow-hidden" style={{ background: BG }}>
          <DialogHeader className="sr-only">
            <DialogTitle>BillBull Executive Dashboard</DialogTitle>
            <DialogDescription>
              Retail ERP Strategic Overview and KPI Dashboard
            </DialogDescription>
          </DialogHeader>

          <div className="w-full h-full flex flex-col">
            {/* HEADER BAR */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b flex-shrink-0">
              <div className="flex items-center gap-3">
                <Monitor className="h-6 w-6" style={{ color: GOLD }} />
                <div>
                  <div className="text-xl font-semibold" style={{ color: INK }}>
                    Executive Dashboard
                  </div>
                  <div className="text-xs text-slate-500">
                    BillBull Retail ERP â€” Strategic Control Center â€¢{" "}
                    {getCurrentPeriod()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-[140px] bg-white">
                    <Calendar className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="bg-white">
                      <Filter className="h-4 w-4 mr-2" /> {branch}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setBranch("All Branches")}>
                      All Branches
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setBranch("Deira Flagship")}>
                      Deira Flagship
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBranch("Al Barsha")}>
                      Al Barsha
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBranch("Fujairah Central")}>
                      Fujairah Central
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  className="bg-white"
                  onClick={() => {
                    setRefreshing(true);
                    setTimeout(() => setRefreshing(false), 900);
                  }}
                >
                  {refreshing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>

                <Button
                  className="text-[#1E293B]"
                  style={{ background: GOLD }}
                >
                  <Download className="h-4 w-4 mr-2" /> Export
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* KPI STRIP */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {dashboardKPIs.map((k, i) => (
                  <Card key={i} className="bg-white shadow-sm border-0">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {k.label}
                          </p>
                          <p
                            className="text-xl font-bold"
                            style={{ color: INK }}
                          >
                            {k.value}
                            {k.unit || ""}
                          </p>
                        </div>
                        {trendIcon(k.trend)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* TABS */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-white shadow-sm">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="initiatives">Initiatives</TabsTrigger>
                  <TabsTrigger value="alerts">Alerts & Actions</TabsTrigger>
                  <TabsTrigger value="branches">Branch Benchmarks</TabsTrigger>
                  <TabsTrigger value="vendors">Vendor Scorecards</TabsTrigger>
                  <TabsTrigger value="controls">Controls</TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="mt-6 space-y-6">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* SALES TREND */}
                    <Card className="xl:col-span-2 bg-white border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle>Sales Trend</CardTitle>
                        <CardDescription>
                          Weekly revenue & basket movement
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="min-h-[300px]">
                        <ResponsiveContainer width="100%" height={300}>
                          <ComposedChart data={salesTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Legend />
                            <Area
                              yAxisId="left"
                              type="monotone"
                              dataKey="sales"
                              stroke={INK}
                              fill={INK}
                              fillOpacity={0.25}
                              name="Sales"
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="avgBasket"
                              stroke={GOLD}
                              strokeWidth={2}
                              name="Avg Basket"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* INVENTORY HEALTH */}
                    <Card className="bg-white border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle>Inventory Accuracy</CardTitle>
                        <CardDescription>
                          Integrated with wastage & shrink
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="min-h-[300px]">
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={inventoryTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis domain={[70, 100]} />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="accuracy"
                              stroke={GOLD}
                              strokeWidth={3}
                              name="Accuracy %"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {/* CASH VARIANCE */}
                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Cash Variance Controls</CardTitle>
                      <CardDescription>
                        Daily cash handling accuracy
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-[300px]">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={cashVarianceDaily}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="expected" fill="#94a3b8" name="Expected" />
                          <Bar dataKey="actual" fill={GOLD} name="Actual" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* INITIATIVES TAB */}
                <TabsContent value="initiatives" className="mt-6 space-y-6">
                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Strategic Initiatives</CardTitle>
                      <CardDescription>
                        Active transformation & improvement programs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Initiative</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead>Impact</TableHead>
                            <TableHead>Deadline</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {initiatives.map((i) => (
                            <TableRow key={i.id}>
                              <TableCell className="font-medium">
                                {i.title}
                              </TableCell>
                              <TableCell>{i.owner}</TableCell>
                              <TableCell>
                                <Badge className={statusBadge(i.status)}>
                                  {i.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={i.completion}
                                    className="h-2 w-24"
                                  />
                                  <span className="text-xs">
                                    {i.completion}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={priorityBadge(i.impact)}>
                                  {i.impact}
                                </Badge>
                              </TableCell>
                              <TableCell>{i.deadline}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedInitiative(i);
                                    setShowInitiativeDetails(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-1" /> Details
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ALERTS & ACTIONS TAB */}
                <TabsContent value="alerts" className="mt-6 space-y-6">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <Card className="xl:col-span-2 bg-white border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle>Critical Alerts & Opportunities</CardTitle>
                        <CardDescription>
                          AI + rule-based detections
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Alert</TableHead>
                              <TableHead>Module</TableHead>
                              <TableHead>Priority</TableHead>
                              <TableHead>Impact</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {alerts.map((a) => (
                              <TableRow key={a.id}>
                                <TableCell>
                                  <div className="flex items-start gap-2">
                                    {moduleIcon(a.module)}
                                    <div>
                                      <div className="font-medium">
                                        {a.title}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {a.description}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>{a.module}</TableCell>
                                <TableCell>
                                  <Badge className={priorityBadge(a.priority)}>
                                    {a.priority}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {a.impact}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedAlert(a);
                                      setShowAlertDetails(true);
                                    }}
                                  >
                                    Action
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle>Action Items</CardTitle>
                        <CardDescription>Pending tasks & approvals</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {actions.map((a) => (
                            <div
                              key={a.id}
                              className="p-3 border rounded-lg space-y-2"
                            >
                              <div className="flex justify-between items-start">
                                <div className="font-medium text-sm">
                                  {a.title}
                                </div>
                                <Badge className={statusBadge(a.status)}>
                                  {a.status}
                                </Badge>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{a.assignee}</span>
                                <span>Due: {a.due}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* BRANCH BENCHMARKS TAB */}
                <TabsContent value="branches" className="mt-6 space-y-6">
                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Branch Benchmarking</CardTitle>
                      <CardDescription>
                        Comparative performance across locations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Branch</TableHead>
                            <TableHead>Sales</TableHead>
                            <TableHead>GM %</TableHead>
                            <TableHead>Shrink %</TableHead>
                            <TableHead>Accuracy</TableHead>
                            <TableHead>OOS Rate</TableHead>
                            <TableHead>Cash Var %</TableHead>
                            <TableHead>NPS</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branchKPIs.map((b, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">
                                {b.branch}
                              </TableCell>
                              <TableCell>{formatCurrency(b.sales)}</TableCell>
                              <TableCell>{formatPct(b.gmPct)}</TableCell>
                              <TableCell>{formatPct(b.shrinkPct)}</TableCell>
                              <TableCell>
                                <Badge className={scoreBadge(b.accuracy)}>
                                  {b.accuracy}%
                                </Badge>
                              </TableCell>
                              <TableCell>{formatPct(b.oosRate)}</TableCell>
                              <TableCell>
                                {formatPct(b.cashVariancePct, 2)}
                              </TableCell>
                              <TableCell>{b.nps}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* VENDOR SCORECARDS TAB */}
                <TabsContent value="vendors" className="mt-6 space-y-6">
                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Vendor Performance Scorecards</CardTitle>
                      <CardDescription>
                        OTIF, fill rate, compliance & risk tracking
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead>On-Time %</TableHead>
                            <TableHead>Fill Rate %</TableHead>
                            <TableHead>Price Compliance %</TableHead>
                            <TableHead>Returns %</TableHead>
                            <TableHead>Credit Days</TableHead>
                            <TableHead>Risk</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendorScorecards.map((v) => (
                            <TableRow key={v.id}>
                              <TableCell className="font-medium">
                                {v.name}
                              </TableCell>
                              <TableCell>
                                <Badge className={scoreBadge(v.onTimePct)}>
                                  {v.onTimePct}%
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={scoreBadge(v.fillRatePct)}>
                                  {v.fillRatePct}%
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {formatPct(v.priceCompliancePct)}
                              </TableCell>
                              <TableCell>{formatPct(v.returnsPct)}</TableCell>
                              <TableCell>{v.creditDays} days</TableCell>
                              <TableCell>
                                <Badge className={riskBadge(v.risk)}>
                                  {v.risk}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* CONTROLS TAB */}
                <TabsContent value="controls" className="mt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle>Executive Controls</CardTitle>
                        <CardDescription>
                          Preferences & automation
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Auto Refresh</span>
                          <Switch
                            checked={autoRefresh}
                            onCheckedChange={setAutoRefresh}
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Dense Mode</span>
                          <Switch
                            checked={dense}
                            onCheckedChange={setDense}
                          />
                        </div>
                        <Separator />
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                        >
                          <Settings className="h-4 w-4 mr-2" /> Dashboard
                          Settings
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                        >
                          <ShieldCheck className="h-4 w-4 mr-2" /> Audit Mode
                        </Button>
                        <Button
                          className="w-full justify-start text-[#1E293B]"
                          style={{ background: GOLD }}
                        >
                          <Zap className="h-4 w-4 mr-2" /> Create Action Plan
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle>Quick Insights</CardTitle>
                        <CardDescription>
                          Key metrics at a glance
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-3 bg-emerald-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            <span className="font-medium text-sm">
                              Strong Performance
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Overall business health score: 86/100
                          </p>
                        </div>

                        <div className="p-3 bg-yellow-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            <span className="font-medium text-sm">
                              Watch Areas
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            4 active alerts require attention
                          </p>
                        </div>

                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-blue-600" />
                            <span className="font-medium text-sm">
                              Active Initiatives
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            4 strategic programs in progress
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* INITIATIVE DETAILS DRILLDOWN */}
      <Dialog open={showInitiativeDetails} onOpenChange={setShowInitiativeDetails}>
        <DialogContent className="fixed inset-0 z-[60] w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none p-0 m-0 overflow-hidden" style={{ background: BG }}>
          <DialogHeader className="sr-only">
            <DialogTitle>
              {selectedInitiative?.title || "Initiative Details"}
            </DialogTitle>
            <DialogDescription>
              Strategic Initiative Details and Progress Tracking
            </DialogDescription>
          </DialogHeader>

          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b bg-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Target className="h-6 w-6" style={{ color: GOLD }} />
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: INK }}>
                    {selectedInitiative?.title}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Strategic Initiative Details
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowInitiativeDetails(false)}
              >
                <X />
              </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedInitiative && (
                <div className="max-w-7xl mx-auto space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-white border-0 shadow-sm">
                      <CardContent className="p-6">
                        <p className="text-xs text-muted-foreground">
                          Progress
                        </p>
                        <p className="text-2xl font-bold">
                          {selectedInitiative.completion}%
                        </p>
                        <Progress
                          value={selectedInitiative.completion}
                          className="mt-3"
                        />
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-0 shadow-sm">
                      <CardContent className="p-6">
                        <p className="text-xs text-muted-foreground">Owner</p>
                        <p className="font-semibold">
                          {selectedInitiative.owner}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-0 shadow-sm">
                      <CardContent className="p-6">
                        <p className="text-xs text-muted-foreground">
                          Deadline
                        </p>
                        <p className="font-semibold">
                          {selectedInitiative.deadline}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-0 shadow-sm">
                      <CardContent className="p-6">
                        <p className="text-xs text-muted-foreground">Impact</p>
                        <Badge className={priorityBadge(selectedInitiative.impact)}>
                          {selectedInitiative.impact}
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Initiative Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {selectedInitiative.objective}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Deliverables</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedInitiative.deliverables.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <span className="text-sm">{d.title}</span>
                            <Badge className={statusBadge(d.status)}>
                              {d.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Recent Updates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {selectedInitiative.updates.map((u, idx) => (
                          <div key={idx} className="flex gap-3">
                            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-[#F5C742] mt-2" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{u.at}</span>
                                <span>â€¢</span>
                                <span>{u.by}</span>
                                {u.type === "milestone" && (
                                  <Badge className="bg-blue-100 text-blue-900">
                                    Milestone
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm mt-1">{u.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-white flex justify-between">
              <Button
                variant="outline"
                onClick={() => setShowInitiativeDetails(false)}
              >
                Close
              </Button>
              <Button className="text-[#1E293B]" style={{ background: GOLD }}>
                Update Status
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ALERT DETAILS DRILLDOWN */}
      <Dialog open={showAlertDetails} onOpenChange={setShowAlertDetails}>
        <DialogContent className="max-w-2xl" style={{ background: BG }}>
          <DialogHeader>
            <DialogTitle>Alert Details</DialogTitle>
            <DialogDescription>
              Review and take action on this alert
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {moduleIcon(selectedAlert.module)}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{selectedAlert.title}</h3>
                    <Badge className={priorityBadge(selectedAlert.priority)}>
                      {selectedAlert.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedAlert.module} â€¢ {selectedAlert.createdAt}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium text-sm mb-2">Description</h4>
                <p className="text-sm text-slate-700">
                  {selectedAlert.description}
                </p>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2">Suggested Action</h4>
                <p className="text-sm text-slate-700">
                  {selectedAlert.suggestedAction}
                </p>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2">Expected Impact</h4>
                <p className="text-sm font-medium" style={{ color: GOLD }}>
                  {selectedAlert.impact}
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAlertDetails(false)}
                >
                  Dismiss
                </Button>
                <Button
                  className="flex-1 text-[#1E293B]"
                  style={{ background: GOLD }}
                  onClick={() => setShowAlertDetails(false)}
                >
                  Take Action
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

