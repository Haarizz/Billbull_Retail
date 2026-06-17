import React, { useMemo, useState } from "react";
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
import { Separator } from "../../components/ui/separator";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

import {
  Brain,
  Filter,
  Download,
  Printer,
  Store,
  Receipt,
  TrendingUp,
  TrendingDown,
  Percent,
  Users,
  Package,
  Wrench,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  CreditCard,
  Building2,
  BadgeDollarSign,
  Sparkles,
  Lightbulb,
  UserCog,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Truck,
  BadgeCheck,
  ScanBarcode,
} from "lucide-react";

interface BIEngineDashboardV2Props {
  formatCurrency: (amount: number) => string;
  getCurrentPeriod: () => string;
}

/**
 * BillBull Strategic BI & Decision-Making Engineâ„¢ (Retail ERP)
 * Theme:
 *  - Background: #F7F7FA
 *  - Accent: #F5C742 (Golden) used subtly (borders, badges, highlights)
 * Tabs (Retail):
 *  - Overview
 *  - Sales Intelligence
 *  - Inventory Intelligence
 *  - Customers & Loyalty (RFM, churn, LTV, campaigns)
 *  - Workforce (cashier performance, discounts, voids, attendance, targets)
 *  - IT + Store Assets (POS devices, terminals, vehicles; maintenance + AMC)
 *  - Finance (AP/AR aging, bank settlement delays, cash variance, petty cash)
 *  - Branch Benchmarking (GP%, shrinkage proxy, turns, stock accuracy)
 *  - AI-LIVEâ„¢
 *  - Strategy
 */

type Priority = "critical" | "high" | "medium" | "low";
type Risk = "low" | "medium" | "high" | "critical";

const BB_BG = "bg-[#F7F7FA]";
const BB_ACCENT_BORDER = "border-[#F5C742]/45";
const BB_ACCENT_BADGE = "bg-[#F5C742]/20 text-foreground border border-[#F5C742]/35";

function trendColor(trend: number) {
  if (trend > 0) return "text-green-600";
  if (trend < 0) return "text-red-600";
  return "text-muted-foreground";
}
function trendIcon(trend: number) {
  if (trend > 0) return <ArrowUpRight className="h-4 w-4" />;
  if (trend < 0) return <ArrowDownRight className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
}
function priorityPill(priority: Priority) {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "low":
      return "bg-green-100 text-green-800 border-green-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
function riskPill(risk: Risk) {
  switch (risk) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "low":
      return "bg-green-100 text-green-800 border-green-200";
  }
}
function moneyCompact(n: number, formatCurrency: (a: number) => string) {
  return formatCurrency(n);
}

export function BillBullBIEngineDashboard({
  formatCurrency,
  getCurrentPeriod,
}: BIEngineDashboardV2Props) {
  const [timeFilter, setTimeFilter] = useState<
    "today" | "weekly" | "monthly" | "quarterly" | "yearly"
  >("monthly");
  const [activeModule, setActiveModule] = useState<
    | "overview"
    | "sales"
    | "inventory"
    | "customers"
    | "workforce"
    | "assets"
    | "finance"
    | "benchmarking"
    | "ai-live"
    | "strategy"
  >("overview");

  // ---------------------------
  // 0) Retail Overview KPIs
  // ---------------------------
  const retailKPIs = {
    revenue: { mtd: 742_850, qtd: 2_081_200, ytd: 8_924_300, growthPct: 10.8 },
    gp: { value: 168_420, gpPct: 22.7, growthPct: 6.4 },
    bills: { mtd: 8_942, avgBasket: 83.1, growthPct: 9.5 },
    customers: { active: 6_420, repeatRatePct: 34.2, churnRisk: 412 },
    cash: { expected: 128_400, variance: -1_250, variancePct: -0.97 },
    inventory: { turns: 7.6, deadStockValue: 38_200, stockAccuracyPct: 93.4 },
  };

  // ---------------------------
  // 1) Sales Intelligence
  // ---------------------------
  const revenueByChannel = [
    {
      category: "In-Store POS",
      total: 472_400,
      cash: 138_200,
      card: 334_200,
      percentage: 63.6,
      trend: 8.2,
      color: "#F5C742",
      breakdown: {
        normal: 418_900,
        promo: 41_200,
        returnsNet: 12_300,
      },
    },
    {
      category: "Online Store",
      total: 132_800,
      cash: 0,
      card: 132_800,
      percentage: 17.9,
      trend: 14.6,
      color: "#60a5fa",
      breakdown: { web: 98_600, app: 34_200 },
    },
    {
      category: "Delivery Aggregators",
      total: 78_650,
      cash: 0,
      card: 78_650,
      percentage: 10.6,
      trend: 4.1,
      color: "#34d399",
      breakdown: { talabat: 42_900, deliveroo: 35_750 },
    },
    {
      category: "Wholesale / B2B",
      total: 41_200,
      cash: 0,
      card: 41_200,
      percentage: 5.5,
      trend: -3.8,
      color: "#a78bfa",
      breakdown: { invoices: 41_200 },
    },
    {
      category: "Services / AMC",
      total: 17_800,
      cash: 2_600,
      card: 15_200,
      percentage: 2.4,
      trend: 18.9,
      color: "#fb7185",
      breakdown: { install: 8_900, amc: 8_900 },
    },
  ];

  // Sales forecast (simple)
  const salesForecast = [
    { label: "Jan", actual: 690_000, predicted: 705_000, upper: 732_000, lower: 678_000, confidence: 86 },
    { label: "Feb", actual: 720_000, predicted: 738_000, upper: 770_000, lower: 700_000, confidence: 84 },
    { label: "Mar", actual: 742_850, predicted: 760_000, upper: 796_000, lower: 720_000, confidence: 82 },
    { label: "Q1", actual: 2_152_850, predicted: 2_203_000, upper: 2_298_000, lower: 2_098_000, confidence: 85 },
  ];

  // ---------------------------
  // 2) Inventory Intelligence
  // ---------------------------
  const inventoryCostOptimization = [
    {
      item: "Thermal Paper Rolls (80mm)",
      currentSupplier: "Vendor A",
      currentCost: 5.6,
      prevCost: 5.2,
      inflationPct: 7.7,
      altSupplier: "Vendor B",
      altCost: 5.1,
      savingPct: 8.9,
      recommendation: "Switch to Vendor B",
    },
    {
      item: "Barcode Labels (50x25)",
      currentSupplier: "Vendor C",
      currentCost: 12.8,
      prevCost: 12.8,
      inflationPct: 0,
      altSupplier: null,
      altCost: null,
      savingPct: 0,
      recommendation: "Maintain current supplier",
    },
    {
      item: "Cleaning Supplies (Bulk)",
      currentSupplier: "Vendor A",
      currentCost: 18.5,
      prevCost: 16.9,
      inflationPct: 9.5,
      altSupplier: "Vendor D",
      altCost: 16.7,
      savingPct: 9.7,
      recommendation: "Negotiate / Switch to Vendor D",
    },
  ];

  const deadStock = [
    { item: "SKU-AX12 Â· Seasonal Mug", qty: 92, value: 9_660, daysStagnant: 71, action: "Bundle / 25% markdown" },
    { item: "SKU-ZR77 Â· Old Model Charger", qty: 64, value: 12_480, daysStagnant: 58, action: "Clearance / move online" },
    { item: "SKU-PQ09 Â· Slow-moving Snack Pack", qty: 180, value: 16_060, daysStagnant: 46, action: "Promo in POS + endcap" },
  ];

  const inventoryTurnsByBranch = [
    { branch: "Dubai", turns: 8.4, accuracy: 94.2 },
    { branch: "Sharjah", turns: 7.1, accuracy: 92.7 },
    { branch: "Fujairah", turns: 6.8, accuracy: 93.3 },
  ];

  // ---------------------------
  // 3) Customers & Loyalty (RFM, churn, LTV, campaigns)
  // ---------------------------
  const rfmSegments = [
    { segment: "VIP", customers: 380, revenue: 218_400, gpPct: 26.1, repeatPct: 72, avgBasket: 132, ltv: 3_950, action: "Exclusive early access + high-tier perks", color: "#F5C742" },
    { segment: "Loyal", customers: 1_140, revenue: 284_200, gpPct: 23.4, repeatPct: 58, avgBasket: 95, ltv: 2_640, action: "Double points weekend + bundles", color: "#60a5fa" },
    { segment: "Potential", customers: 2_080, revenue: 166_500, gpPct: 21.8, repeatPct: 22, avgBasket: 71, ltv: 1_120, action: "2nd purchase coupon + WhatsApp nudge", color: "#34d399" },
    { segment: "At Risk", customers: 1_240, revenue: 62_100, gpPct: 20.2, repeatPct: 12, avgBasket: 58, ltv: 680, action: "Win-back: limited-time offer", color: "#fb7185" },
    { segment: "Lost", customers: 1_580, revenue: 11_650, gpPct: 18.9, repeatPct: 4, avgBasket: 42, ltv: 240, action: "Reactivation survey + clearance offer", color: "#a78bfa" },
  ];

  const churnRiskList = [
    { customer: "Aisha K.", lastPurchaseDays: 21, churnProb: 82, reason: "Recency spike + basket drop", recommended: "WhatsApp: 15% on top category", priority: "critical" as Priority },
    { customer: "Rohan M.", lastPurchaseDays: 15, churnProb: 68, reason: "Frequency down", recommended: "Points booster + bundle deal", priority: "high" as Priority },
    { customer: "Sara A.", lastPurchaseDays: 9, churnProb: 44, reason: "Returns up", recommended: "Customer care call + exchange support", priority: "medium" as Priority },
  ];

  const campaigns = [
    { name: "Weekend Double Points", segment: "Loyal", reach: 4200, redeemed: 610, incSales: 41_800, incGP: 9_250, cost: 3_200, roi: 1.89 },
    { name: "VIP Early Access", segment: "VIP", reach: 820, redeemed: 190, incSales: 26_400, incGP: 6_420, cost: 1_100, roi: 4.84 },
    { name: "Win-back Flash Sale", segment: "At Risk", reach: 3600, redeemed: 420, incSales: 29_300, incGP: 4_880, cost: 3_800, roi: 0.28 },
  ];

  // ---------------------------
  // 4) Workforce (cashier performance, discounts, voids, returns, attendance)
  // ---------------------------
  const workforceRows = [
    { name: "Sara Al-Rashid", role: "Cashier", branch: "Fujairah", sales: 94_200, bills: 980, avgBasket: 96.1, discountPct: 2.1, voids: 6, returnsPct: 1.2, attendancePct: 98.5, targetPct: 104, risk: "low" as Risk },
    { name: "Looka Johnson", role: "Sales Exec", branch: "Dubai", sales: 128_450, bills: 1120, avgBasket: 114.7, discountPct: 4.8, voids: 14, returnsPct: 2.9, attendancePct: 96.2, targetPct: 97, risk: "medium" as Risk },
    { name: "Arshi Hassan", role: "Store Manager", branch: "Sharjah", sales: 0, bills: 0, avgBasket: 0, discountPct: 0, voids: 0, returnsPct: 0, attendancePct: 99.1, targetPct: 101, risk: "low" as Risk },
    { name: "Mery Wilson", role: "Cashier", branch: "Dubai", sales: 71_120, bills: 860, avgBasket: 82.7, discountPct: 8.2, voids: 22, returnsPct: 4.6, attendancePct: 88.4, targetPct: 83, risk: "high" as Risk },
  ];

  const complianceFlags = [
    { title: "Discount Cap Breach", detail: "2 cashiers exceeded 7% discount threshold this week", level: "high" as Priority },
    { title: "Voids Above Threshold", detail: "Dubai POS-02 shows 18 voids in 3 days", level: "medium" as Priority },
    { title: "Refund Without Original Bill", detail: "3 cases flagged for manager review", level: "high" as Priority },
  ];

  // ---------------------------
  // 5) IT + Store Assets
  // ---------------------------
  const assetKPIs = {
    total: 246,
    inRepair: 9,
    overdueService: 6,
    amcCoveragePct: 72,
    downtimeHoursMtd: 41,
    maintCostMtd: 18_650,
  };

  const itAssets = [
    { asset: "POS Terminal #DXB-03", type: "POS", branch: "Dubai", status: "due-soon", amc: "active", lastService: "28 days ago", nextService: "In 7 days", downtime: 2 },
    { asset: "Receipt Printer #SHJ-02", type: "Printer", branch: "Sharjah", status: "overdue", amc: "expired", lastService: "62 days ago", nextService: "Overdue", downtime: 6 },
    { asset: "Barcode Scanner #FJR-07", type: "Scanner", branch: "Fujairah", status: "healthy", amc: "active", lastService: "14 days ago", nextService: "In 46 days", downtime: 0 },
    { asset: "Biometric Terminal #DXB-01", type: "Biometric", branch: "Dubai", status: "in-repair", amc: "active", lastService: "â€”", nextService: "Repair ongoing", downtime: 14 },
    { asset: "Delivery Bike #DXB-B02", type: "Vehicle", branch: "Dubai", status: "due-soon", amc: "none", lastService: "35 days ago", nextService: "In 10 days", downtime: 4 },
  ];

  const assetTypeColor: Record<string, string> = {
    POS: "#F5C742",
    Printer: "#60a5fa",
    Scanner: "#34d399",
    Biometric: "#a78bfa",
    Vehicle: "#fb7185",
    Network: "#94a3b8",
  };

  // ---------------------------
  // 6) Finance (AP/AR aging, settlement delays, cash variance, petty cash)
  // ---------------------------
  const apAging = [
    { vendor: "Vendor A", outstanding: 48_200, bucket: "31-60", due: "In 6 days" },
    { vendor: "Vendor B", outstanding: 22_400, bucket: "0-30", due: "In 18 days" },
    { vendor: "Vendor C", outstanding: 17_980, bucket: "61-90", due: "Overdue 12 days" },
    { vendor: "Vendor D", outstanding: 9_600, bucket: ">90", due: "Overdue 41 days" },
  ];

  const arAging = [
    { customer: "ABC Trading LLC", outstanding: 36_500, bucket: "31-60", limit: 50_000, status: "Active" },
    { customer: "City Mart B2B", outstanding: 18_250, bucket: "0-30", limit: 25_000, status: "Active" },
    { customer: "QuickBuy Wholesale", outstanding: 24_900, bucket: "61-90", limit: 20_000, status: "Over Limit" },
  ];

  const bankSettlements = [
    { channel: "Visa/Master", expected: "T+2", delayedDays: 1, pending: 22_800, note: "Batch settlement delay" },
    { channel: "Talabat", expected: "Weekly", delayedDays: 3, pending: 31_450, note: "Invoice reconciliation pending" },
    { channel: "Deliveroo", expected: "Weekly", delayedDays: 0, pending: 14_600, note: "Normal cycle" },
  ];

  const cashVarianceByBranch = [
    { branch: "Dubai", expected: 54_200, counted: 53_120, variance: -1_080 },
    { branch: "Sharjah", expected: 39_800, counted: 39_950, variance: 150 },
    { branch: "Fujairah", expected: 34_400, counted: 34_080, variance: -320 },
  ];

  // ---------------------------
  // 7) Branch Benchmarking
  // ---------------------------
  const branchBench = [
    { branch: "Dubai", sales: 312_800, gpPct: 23.6, turns: 8.4, accuracy: 94.2, shrinkageScore: 2.1, returnsPct: 2.8, discountPct: 4.9, avgBasket: 89.5, repeatPct: 36.8 },
    { branch: "Sharjah", sales: 248_300, gpPct: 22.9, turns: 7.1, accuracy: 92.7, shrinkageScore: 2.9, returnsPct: 3.4, discountPct: 5.6, avgBasket: 81.2, repeatPct: 33.1 },
    { branch: "Fujairah", sales: 181_750, gpPct: 24.4, turns: 6.8, accuracy: 93.3, shrinkageScore: 1.8, returnsPct: 2.1, discountPct: 3.7, avgBasket: 78.4, repeatPct: 31.9 },
  ];

  const bestBranchByGp = useMemo(
    () => [...branchBench].sort((a, b) => b.gpPct - a.gpPct)[0],
    [branchBench]
  );
  const worstByShrink = useMemo(
    () => [...branchBench].sort((a, b) => b.shrinkageScore - a.shrinkageScore)[0],
    [branchBench]
  );
  const bestByTurns = useMemo(
    () => [...branchBench].sort((a, b) => b.turns - a.turns)[0],
    [branchBench]
  );

  // bubble chart dataset: x=sales, y=gpPct, z=shrinkageScore
  const branchBubble = branchBench.map((b) => ({
    name: b.branch,
    x: b.sales,
    y: b.gpPct,
    z: Math.max(1, b.shrinkageScore * 10), // bubble size
  }));

  // ---------------------------
  // 8) AI-LIVE Recommendations (Retail)
  // ---------------------------
  const aiRecommendations = [
    {
      priority: "critical" as Priority,
      category: "Finance",
      title: "Cash variance leak detected",
      insight: "Dubai variance -1,080 AED + elevated voids on POS-02",
      action: "Enable stricter manager override + end-of-shift cash audit",
      impact: moneyCompact(1080, formatCurrency),
      cadence: "immediate",
      icon: Wallet,
    },
    {
      priority: "high" as Priority,
      category: "Inventory",
      title: "Dead stock recovery opportunity",
      insight: "3 SKUs stagnant 45+ days; capital locked ~38k AED",
      action: "Markdown strategy + bundle + move to online",
      impact: moneyCompact(38_200, formatCurrency),
      cadence: "this week",
      icon: Package,
    },
    {
      priority: "high" as Priority,
      category: "Customers",
      title: "Repeat rate below target",
      insight: "Repeat rate at 34.2% (target 38%). At-Risk segment growing",
      action: "Automate win-back campaign + points booster",
      impact: "Projected +3â€“5% repeat lift",
      cadence: "2 weeks",
      icon: Users,
    },
    {
      priority: "medium" as Priority,
      category: "Assets",
      title: "Overdue printer service increases downtime",
      insight: "SHJ-02 printer overdue; downtime 6h this month",
      action: "Renew AMC or schedule service within 48h",
      impact: "Reduce downtime",
      cadence: "48 hours",
      icon: Wrench,
    },
    {
      priority: "medium" as Priority,
      category: "Branch Benchmarking",
      title: "Sharjah shrinkage proxy rising",
      insight: "Shrinkage score 2.9 vs baseline 2.0 + higher returns",
      action: "Increase cycle counts + tighten return approvals",
      impact: "Improve GP% + controls",
      cadence: "this month",
      icon: ShieldCheck,
    },
    {
      priority: "low" as Priority,
      category: "Sales",
      title: "Upsell opportunity in Online Store",
      insight: "Avg basket online below in-store by 7.4 AED",
      action: "Add checkout bundles + free shipping threshold",
      impact: "Increase basket size",
      cadence: "next sprint",
      icon: TrendingUp,
    },
  ];

  // ---------------------------
  // 9) Strategy (retail)
  // ---------------------------
  const strategy = {
    growing: ["Online Store (+14.6%)", "Services / AMC (+18.9%)", "In-Store POS (+8.2%)"],
    declining: ["Wholesale / B2B (-3.8%)"],
    opportunities: ["RFM win-back automation", "Replenishment assistant for top SKUs", "Branch playbooks based on best GP% branch"],
    inefficiencies: ["Dead stock (38k AED)", "Bank settlement delays (Talabat)", "Discount cap breaches"],
    expansionReadiness: "Medium â€” improve shrinkage control and settlement delays before adding new branches.",
  };

  // Shared UI helpers
  const HeaderIconWrap = ({ children }: { children: React.ReactNode }) => (
    <div className={`p-2 rounded-lg bg-white border ${BB_ACCENT_BORDER}`}>{children}</div>
  );

  const PageWrap = ({ children }: { children: React.ReactNode }) => (
    <div className={`p-6 space-y-6 ${BB_BG}`}>{children}</div>
  );

  return (
    <PageWrap>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <HeaderIconWrap>
              <Brain className="h-7 w-7" />
            </HeaderIconWrap>
            BillBull Strategic BI & Decision-Making Engineâ„¢
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Retail ERP Intelligence Hub â€” {getCurrentPeriod()}
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as any)}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="bg-white">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" size="sm" className="bg-white">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" className="bg-black text-white hover:bg-black/90">
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeModule} onValueChange={(v) => setActiveModule(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-1 h-auto p-1 bg-white shadow-sm">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="sales" className="text-xs">Sales</TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs">Inventory</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs">Customers & Loyalty</TabsTrigger>
          <TabsTrigger value="workforce" className="text-xs">Workforce</TabsTrigger>
          <TabsTrigger value="assets" className="text-xs">IT + Store Assets</TabsTrigger>
          <TabsTrigger value="finance" className="text-xs">Finance</TabsTrigger>
          <TabsTrigger value="benchmarking" className="text-xs">Branch Benchmarking</TabsTrigger>
          <TabsTrigger value="ai-live" className="text-xs">AI-LIVEâ„¢</TabsTrigger>
          <TabsTrigger value="strategy" className="text-xs">Strategy</TabsTrigger>
        </TabsList>

        {/* -------------------- OVERVIEW -------------------- */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap>
                    <BadgeDollarSign className="h-5 w-5" />
                  </HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>+{retailKPIs.revenue.growthPct}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Revenue (MTD)</p>
                <p className="text-2xl font-bold">{formatCurrency(retailKPIs.revenue.mtd)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  QTD {formatCurrency(retailKPIs.revenue.qtd)} â€¢ YTD {formatCurrency(retailKPIs.revenue.ytd)}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap>
                    <Percent className="h-5 w-5" />
                  </HeaderIconWrap>
                  <Badge className="bg-green-100 text-green-800 border border-green-200">
                    {retailKPIs.gp.gpPct}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Gross Profit (MTD)</p>
                <p className="text-2xl font-bold">{formatCurrency(retailKPIs.gp.value)}</p>
                <div className={`mt-1 text-xs flex items-center gap-1 ${trendColor(retailKPIs.gp.growthPct)}`}>
                  {trendIcon(retailKPIs.gp.growthPct)} {retailKPIs.gp.growthPct > 0 ? "+" : ""}{retailKPIs.gp.growthPct}% vs last period
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap>
                    <Receipt className="h-5 w-5" />
                  </HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>Bills</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Bills Count (MTD)</p>
                <p className="text-2xl font-bold">{retailKPIs.bills.mtd}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Basket: {formatCurrency(retailKPIs.bills.avgBasket)}</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap>
                    <Users className="h-5 w-5" />
                  </HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>Repeat</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Active Customers</p>
                <p className="text-2xl font-bold">{retailKPIs.customers.active}</p>
                <p className="text-xs text-muted-foreground mt-1">Repeat rate: {retailKPIs.customers.repeatRatePct}%</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap>
                    <Wallet className="h-5 w-5" />
                  </HeaderIconWrap>
                  <Badge className={retailKPIs.cash.variance < 0 ? "bg-red-100 text-red-800 border border-red-200" : "bg-green-100 text-green-800 border border-green-200"}>
                    {retailKPIs.cash.variance < 0 ? "Variance" : "Balanced"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Cash Variance (MTD)</p>
                <p className={`text-2xl font-bold ${retailKPIs.cash.variance < 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(retailKPIs.cash.variance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Expected: {formatCurrency(retailKPIs.cash.expected)}</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap>
                    <Package className="h-5 w-5" />
                  </HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>Stock</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Inventory Health</p>
                <p className="text-2xl font-bold">{retailKPIs.inventory.stockAccuracyPct}%</p>
                <p className="text-xs text-muted-foreground mt-1">Turns: {retailKPIs.inventory.turns} â€¢ Dead stock: {formatCurrency(retailKPIs.inventory.deadStockValue)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-border/60 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Sales Forecast Snapshot
                </CardTitle>
                <CardDescription>Predicted vs actual with confidence bands</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={salesForecast}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend />
                    <Area type="monotone" dataKey="upper" fill="#F5C742" fillOpacity={0.18} stroke="none" name="Upper" />
                    <Area type="monotone" dataKey="lower" fill="#F5C742" fillOpacity={0.18} stroke="none" name="Lower" />
                    <Line type="monotone" dataKey="actual" stroke="#111827" strokeWidth={2} name="Actual" />
                    <Line type="monotone" dataKey="predicted" stroke="#F5C742" strokeWidth={3} name="Predicted" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Operational Alerts
                </CardTitle>
                <CardDescription>Audit & control signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {complianceFlags.map((f, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{f.title}</p>
                      <Badge className={`border ${priorityPill(f.level)}`}>{f.level}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{f.detail}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-border/60 bg-white p-3">
                  <p className="text-sm font-medium">Quick action</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pair targets with caps (discount/returns/voids) to reduce leakages.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* -------------------- SALES -------------------- */}
        <TabsContent value="sales" className="space-y-6">
          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Revenue by Channel
              </CardTitle>
              <CardDescription>In-store, online, delivery aggregators, B2B, services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {revenueByChannel.map((c, idx) => (
                <div key={idx} className="rounded-xl border border-border/60 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-base font-semibold">{c.category}</p>
                        <Badge style={{ backgroundColor: c.color, color: "#111827" }} className="border border-black/5">
                          {c.percentage}%
                        </Badge>
                        <span className={`text-xs flex items-center gap-1 ${trendColor(c.trend)}`}>
                          {trendIcon(c.trend)} {c.trend > 0 ? "+" : ""}{c.trend}%
                        </span>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(c.total)}</p>
                      {c.breakdown && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                          {Object.entries(c.breakdown).map(([k, v]) => (
                            <div key={k} className="rounded-lg border border-border/60 bg-[#F7F7FA] p-2">
                              <p className="text-[11px] text-muted-foreground capitalize">
                                {k.replace(/([A-Z])/g, " $1").trim()}
                              </p>
                              <p className="text-sm font-semibold">{formatCurrency(Number(v))}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Cash</p>
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(c.cash)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Card</p>
                          <p className="text-sm font-semibold text-blue-600">{formatCurrency(c.card)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Separator />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={revenueByChannel}
                          dataKey="total"
                          nameKey="category"
                          outerRadius={110}
                          label={({ category, percentage }: any) => `${category}: ${percentage}%`}
                        >
                          {revenueByChannel.map((e, i) => (
                            <Cell key={i} fill={e.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-white border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">90-Day Forecast</CardTitle>
                    <CardDescription>Confidence band view</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={salesForecast}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                        <Legend />
                        <Area type="monotone" dataKey="upper" fill="#F5C742" fillOpacity={0.18} stroke="none" name="Upper" />
                        <Area type="monotone" dataKey="lower" fill="#F5C742" fillOpacity={0.18} stroke="none" name="Lower" />
                        <Line type="monotone" dataKey="actual" stroke="#111827" strokeWidth={2} name="Actual" />
                        <Line type="monotone" dataKey="predicted" stroke="#F5C742" strokeWidth={3} name="Predicted" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- INVENTORY -------------------- */}
        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-border/60 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Supplier Cost Optimization
                </CardTitle>
                <CardDescription>Cost inflation tracking + alternative supplier savings</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Current Supplier</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead>Alternative</TableHead>
                      <TableHead className="text-right">Alt Cost</TableHead>
                      <TableHead className="text-right">Saving</TableHead>
                      <TableHead>Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryCostOptimization.map((x, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{x.item}</TableCell>
                        <TableCell>{x.currentSupplier}</TableCell>
                        <TableCell className="text-right">{formatCurrency(x.currentCost)}</TableCell>
                        <TableCell className="text-right">
                          {x.inflationPct > 0 ? (
                            <Badge className="bg-red-100 text-red-800 border border-red-200">
                              +{x.inflationPct}%
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 border border-green-200">
                              No change
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{x.altSupplier ?? "â€”"}</TableCell>
                        <TableCell className="text-right">{x.altCost ? formatCurrency(x.altCost) : "â€”"}</TableCell>
                        <TableCell className="text-right">
                          {x.savingPct > 0 ? (
                            <span className="text-green-600 font-semibold">-{x.savingPct}%</span>
                          ) : (
                            "â€”"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={x.recommendation.includes("Switch") ? "bg-orange-100 text-orange-800 border border-orange-200" : "bg-green-100 text-green-800 border border-green-200"}>
                            {x.recommendation}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Branch Turns & Accuracy</CardTitle>
                <CardDescription>Inventory turns and stock accuracy snapshot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {inventoryTurnsByBranch.map((b) => (
                  <div key={b.branch} className="rounded-lg border border-border/60 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{b.branch}</p>
                      <Badge className={BB_ACCENT_BADGE}>{b.turns} turns</Badge>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Stock Accuracy</span>
                        <span className="font-medium text-foreground">{b.accuracy}%</span>
                      </div>
                      <Progress value={b.accuracy} className="h-1 mt-2" />
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                  <p className="text-sm font-medium">Ops note</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add "Replenishment Assistant" later to auto-suggest LPO/GR based on min/max + velocity.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="h-5 w-5" />
                Dead Stock (45+ days)
              </CardTitle>
              <CardDescription className="text-red-700">Capital locked â€” prioritize recovery actions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadStock.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.item}</TableCell>
                      <TableCell className="text-right">{d.qty}</TableCell>
                      <TableCell className="text-right font-semibold text-red-600">{formatCurrency(d.value)}</TableCell>
                      <TableCell className="text-right">{d.daysStagnant}</TableCell>
                      <TableCell>
                        <Badge className="bg-blue-100 text-blue-800 border border-blue-200">{d.action}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 rounded-lg border border-red-200 bg-white p-3">
                <p className="font-semibold text-red-900">
                  Total Dead Stock Value:{" "}
                  {formatCurrency(deadStock.reduce((s, x) => s + x.value, 0))}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  Suggestion: auto-create markdown plan + move slow movers to online clearance.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- CUSTOMERS & LOYALTY -------------------- */}
        <TabsContent value="customers" className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><Users className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>MTD</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Active Customers</p>
                <p className="text-2xl font-bold">{retailKPIs.customers.active}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><BadgeCheck className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>Repeat</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Repeat Rate</p>
                <p className="text-2xl font-bold">{retailKPIs.customers.repeatRatePct}%</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><AlertTriangle className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className="bg-red-100 text-red-800 border border-red-200">Risk</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Churn Risk Customers</p>
                <p className="text-2xl font-bold">{retailKPIs.customers.churnRisk}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><Store className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>LTV</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Avg LTV (VIP ref)</p>
                <p className="text-2xl font-bold">{formatCurrency(rfmSegments[0].ltv)}</p>
              </CardContent>
            </Card>
          </div>

          {/* RFM + churn */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-border/60 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  RFM Segmentation
                </CardTitle>
                <CardDescription>VIP â†’ Loyal â†’ Potential â†’ At Risk â†’ Lost</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={rfmSegments}
                        dataKey="customers"
                        nameKey="segment"
                        outerRadius={110}
                        label={({ segment, customers }: any) => `${segment}: ${customers}`}
                      >
                        {rfmSegments.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  {rfmSegments.map((s) => (
                    <div key={s.segment} className="rounded-lg border border-border/60 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{s.segment}</p>
                        <Badge style={{ backgroundColor: s.color, color: "#111827" }} className="border border-black/5">
                          {s.customers} customers
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Revenue</p>
                          <p className="font-medium">{formatCurrency(s.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">GP%</p>
                          <p className="font-medium">{s.gpPct}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Repeat%</p>
                          <p className="font-medium">{s.repeatPct}%</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">Action:</span> {s.action}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Churn Risk (Top)
                </CardTitle>
                <CardDescription>AI-assisted risk list with actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {churnRiskList.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{c.customer}</p>
                      <Badge className={`border ${priorityPill(c.priority)}`}>{c.priority}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last purchase: {c.lastPurchaseDays} days â€¢ Risk:{" "}
                      <span className="font-medium text-foreground">{c.churnProb}%</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{c.reason}</p>
                    <div className="mt-2 rounded-md bg-[#F7F7FA] p-2 text-xs">
                      <span className="font-medium">Recommended:</span> {c.recommended}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" className="bg-black text-white hover:bg-black/90 w-full">
                        Send Offer
                      </Button>
                      <Button size="sm" variant="outline" className="bg-white w-full">
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Campaigns */}
          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Campaign Performance
              </CardTitle>
              <CardDescription>Incremental sales + GP + ROI (loyalty + WhatsApp/email)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Segment</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Redeemed</TableHead>
                    <TableHead className="text-right">Inc. Sales</TableHead>
                    <TableHead className="text-right">Inc. GP</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge className={BB_ACCENT_BADGE}>{c.segment}</Badge></TableCell>
                      <TableCell className="text-right">{c.reach.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{c.redeemed.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(c.incSales)}</TableCell>
                      <TableCell className="text-right text-green-700 font-semibold">{formatCurrency(c.incGP)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.cost)}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={c.roi >= 1 ? "bg-green-100 text-green-800 border border-green-200" : "bg-orange-100 text-orange-800 border border-orange-200"}>
                          {c.roi.toFixed(2)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 rounded-lg border border-border/60 bg-[#F7F7FA] p-3 text-sm">
                <span className="font-medium">Pro tip:</span> Add "RFM automation" â†’ send win-back offers when Recency crosses 14/21/30 days.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- WORKFORCE -------------------- */}
        <TabsContent value="workforce" className="space-y-6">
          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Workforce Performance (Retail)
              </CardTitle>
              <CardDescription>Cashier sales, discounts, voids, returns, attendance, target achievement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="bg-white border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Top cashier (Sales)</p>
                    <p className="text-lg font-bold">{workforceRows.slice().sort((a,b)=>b.sales-a.sales)[0].name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Sales: {formatCurrency(workforceRows.slice().sort((a,b)=>b.sales-a.sales)[0].sales)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Highest discount %</p>
                    <p className="text-lg font-bold">{workforceRows.slice().sort((a,b)=>b.discountPct-a.discountPct)[0].name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Discount: {workforceRows.slice().sort((a,b)=>b.discountPct-a.discountPct)[0].discountPct}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-white border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Voids / returns watch</p>
                    <p className="text-lg font-bold">{workforceRows.slice().sort((a,b)=>(b.voids+b.returnsPct)-(a.voids+a.returnsPct))[0].name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Voids: {workforceRows.slice().sort((a,b)=>(b.voids+b.returnsPct)-(a.voids+a.returnsPct))[0].voids} â€¢ Returns: {workforceRows.slice().sort((a,b)=>(b.voids+b.returnsPct)-(a.voids+a.returnsPct))[0].returnsPct}%</p>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Avg Basket</TableHead>
                    <TableHead className="text-right">Disc %</TableHead>
                    <TableHead className="text-right">Voids</TableHead>
                    <TableHead className="text-right">Returns %</TableHead>
                    <TableHead className="text-right">Attendance</TableHead>
                    <TableHead className="text-right">Target %</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workforceRows.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{r.role}</Badge></TableCell>
                      <TableCell>{r.branch}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(r.sales)}</TableCell>
                      <TableCell className="text-right">{r.bills}</TableCell>
                      <TableCell className="text-right">{r.avgBasket ? formatCurrency(r.avgBasket) : "â€”"}</TableCell>
                      <TableCell className="text-right">{r.discountPct ? `${r.discountPct}%` : "â€”"}</TableCell>
                      <TableCell className="text-right">{r.voids ? r.voids : "â€”"}</TableCell>
                      <TableCell className="text-right">{r.returnsPct ? `${r.returnsPct}%` : "â€”"}</TableCell>
                      <TableCell className="text-right">{r.attendancePct}%</TableCell>
                      <TableCell className="text-right">
                        <span className={r.targetPct >= 100 ? "text-green-700 font-semibold" : "text-orange-700 font-semibold"}>
                          {r.targetPct}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`border ${riskPill(r.risk)}`}>{r.risk}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3 text-sm">
                <span className="font-medium">Implementation note:</span> Use audit limits (discount/returns/voids) + manager override logs to compute "Risk".
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- IT + STORE ASSETS -------------------- */}
        <TabsContent value="assets" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Card className="bg-white border-border/60 md:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><ScanBarcode className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>Assets</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Total Assets</p>
                <p className="text-2xl font-bold">{assetKPIs.total}</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60 md:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><Wrench className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className="bg-orange-100 text-orange-800 border border-orange-200">Repair</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">In Repair</p>
                <p className="text-2xl font-bold">{assetKPIs.inRepair}</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60 md:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <HeaderIconWrap><ShieldCheck className="h-5 w-5" /></HeaderIconWrap>
                  <Badge className={BB_ACCENT_BADGE}>AMC</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-3">AMC Coverage</p>
                <p className="text-2xl font-bold">{assetKPIs.amcCoveragePct}%</p>
                <p className="text-xs text-muted-foreground mt-1">Overdue service: {assetKPIs.overdueService}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                IT + Store Assets Health
              </CardTitle>
              <CardDescription>POS devices, printers, scanners, biometric terminals, delivery vehicles</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>AMC</TableHead>
                    <TableHead className="text-right">Downtime (hrs)</TableHead>
                    <TableHead>Last Service</TableHead>
                    <TableHead>Next Service</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itAssets.map((a) => (
                    <TableRow key={a.asset}>
                      <TableCell className="font-medium">{a.asset}</TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: assetTypeColor[a.type], color: "#111827" }} className="border border-black/5">
                          {a.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{a.branch}</TableCell>
                      <TableCell>
                        <Badge className={
                          a.status === "healthy"
                            ? "bg-green-100 text-green-800 border border-green-200"
                            : a.status === "due-soon"
                            ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                            : a.status === "overdue"
                            ? "bg-red-100 text-red-800 border border-red-200"
                            : "bg-orange-100 text-orange-800 border border-orange-200"
                        }>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          a.amc === "active"
                            ? "bg-green-100 text-green-800 border border-green-200"
                            : a.amc === "expired"
                            ? "bg-red-100 text-red-800 border border-red-200"
                            : "bg-gray-100 text-gray-800 border border-gray-200"
                        }>
                          {a.amc}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{a.downtime}</TableCell>
                      <TableCell>{a.lastService}</TableCell>
                      <TableCell className={a.nextService === "Overdue" ? "text-red-600 font-semibold" : ""}>
                        {a.nextService}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                  <p className="text-sm font-medium">Maintenance Cost (MTD)</p>
                  <p className="text-xl font-bold mt-1">{formatCurrency(assetKPIs.maintCostMtd)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                  <p className="text-sm font-medium">Downtime (MTD)</p>
                  <p className="text-xl font-bold mt-1">{assetKPIs.downtimeHoursMtd} hrs</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                  <p className="text-sm font-medium">Device mapping</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Next: map POSâ†’cashier PIN, Printerâ†’POS, Biometricâ†’attendance group, Vehicleâ†’delivery staff.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- FINANCE -------------------- */}
        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">AP Outstanding</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(apAging.reduce((s, x) => s + x.outstanding, 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Payables aging view</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">AR Outstanding</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(arAging.reduce((s, x) => s + x.outstanding, 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Customer credit exposure</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Cash Variance (MTD)</p>
                <p className={`text-2xl font-bold mt-1 ${retailKPIs.cash.variance < 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(retailKPIs.cash.variance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Petty cash & cashier close control</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  AP Aging (Vendors)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apAging.map((v) => (
                      <TableRow key={v.vendor}>
                        <TableCell className="font-medium">{v.vendor}</TableCell>
                        <TableCell>
                          <Badge className={
                            v.bucket === "0-30"
                              ? "bg-green-100 text-green-800 border border-green-200"
                              : v.bucket === "31-60"
                              ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                              : v.bucket === "61-90"
                              ? "bg-orange-100 text-orange-800 border border-orange-200"
                              : "bg-red-100 text-red-800 border border-red-200"
                          }>
                            {v.bucket}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(v.outstanding)}</TableCell>
                        <TableCell className={v.due.includes("Overdue") ? "text-red-600 font-semibold" : ""}>{v.due}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="bg-white border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  AR Aging (Customers)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Limit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arAging.map((c) => (
                      <TableRow key={c.customer}>
                        <TableCell className="font-medium">{c.customer}</TableCell>
                        <TableCell>
                          <Badge className={
                            c.bucket === "0-30"
                              ? "bg-green-100 text-green-800 border border-green-200"
                              : c.bucket === "31-60"
                              ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                              : c.bucket === "61-90"
                              ? "bg-orange-100 text-orange-800 border border-orange-200"
                              : "bg-red-100 text-red-800 border border-red-200"
                          }>
                            {c.bucket}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(c.outstanding)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.limit)}</TableCell>
                        <TableCell>
                          <Badge className={c.status === "Over Limit" ? "bg-red-100 text-red-800 border border-red-200" : "bg-green-100 text-green-800 border border-green-200"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Bank / Gateway Settlement Delays
              </CardTitle>
              <CardDescription>Detect settlement lags and reconciliation issues</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead className="text-right">Delayed (days)</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankSettlements.map((s) => (
                    <TableRow key={s.channel}>
                      <TableCell className="font-medium">{s.channel}</TableCell>
                      <TableCell>{s.expected}</TableCell>
                      <TableCell className="text-right">
                        <span className={s.delayedDays > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                          {s.delayedDays}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(s.pending)}</TableCell>
                      <TableCell className="text-muted-foreground">{s.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator className="my-5" />

              <div>
                <p className="text-sm font-medium mb-2">Cash Variance by Branch</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashVarianceByBranch.map((b) => (
                      <TableRow key={b.branch}>
                        <TableCell className="font-medium">{b.branch}</TableCell>
                        <TableCell className="text-right">{formatCurrency(b.expected)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(b.counted)}</TableCell>
                        <TableCell className={`text-right font-semibold ${b.variance < 0 ? "text-red-600" : "text-green-600"}`}>
                          {formatCurrency(b.variance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-4 rounded-lg border border-border/60 bg-[#F7F7FA] p-3 text-sm">
                  <span className="font-medium">Next enhancement:</span> petty cash requests â†’ approvals â†’ receipts â†’ missing receipt alerts.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- BRANCH BENCHMARKING -------------------- */}
        <TabsContent value="benchmarking" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Best branch by GP%</p>
                <p className="text-xl font-bold mt-1">{bestBranchByGp.branch}</p>
                <p className="text-xs text-muted-foreground mt-1">GP%: {bestBranchByGp.gpPct}%</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Worst by shrinkage proxy</p>
                <p className="text-xl font-bold mt-1">{worstByShrink.branch}</p>
                <p className="text-xs text-muted-foreground mt-1">Score: {worstByShrink.shrinkageScore}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Fastest by inventory turns</p>
                <p className="text-xl font-bold mt-1">{bestByTurns.branch}</p>
                <p className="text-xs text-muted-foreground mt-1">Turns: {bestByTurns.turns}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Branch Ranking
              </CardTitle>
              <CardDescription>Compare GP%, turns, stock accuracy, discount & returns, repeat customers</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">GP%</TableHead>
                    <TableHead className="text-right">Turns</TableHead>
                    <TableHead className="text-right">Accuracy%</TableHead>
                    <TableHead className="text-right">Shrink</TableHead>
                    <TableHead className="text-right">Returns%</TableHead>
                    <TableHead className="text-right">Discount%</TableHead>
                    <TableHead className="text-right">Avg Basket</TableHead>
                    <TableHead className="text-right">Repeat%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchBench.map((b) => (
                    <TableRow key={b.branch}>
                      <TableCell className="font-medium">{b.branch}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(b.sales)}</TableCell>
                      <TableCell className="text-right">
                        <span className={b.gpPct >= 24 ? "text-green-700 font-semibold" : "text-foreground"}>
                          {b.gpPct}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{b.turns}</TableCell>
                      <TableCell className="text-right">{b.accuracy}%</TableCell>
                      <TableCell className="text-right">{b.shrinkageScore}</TableCell>
                      <TableCell className="text-right">{b.returnsPct}%</TableCell>
                      <TableCell className="text-right">{b.discountPct}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(b.avgBasket)}</TableCell>
                      <TableCell className="text-right">{b.repeatPct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator className="my-6" />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">Sales vs GP% (Bubble = Shrinkage)</CardTitle>
                    <CardDescription>Spot branches with high sales but low GP% or high shrinkage risk</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="x" name="Sales" tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                        <YAxis dataKey="y" name="GP%" unit="%" />
                        <ZAxis dataKey="z" range={[80, 300]} name="Shrink" />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          formatter={(value: any, name: any) => {
                            if (name === "Sales") return [formatCurrency(Number(value)), name];
                            if (name === "GP%") return [`${value}%`, name];
                            return [value, name];
                          }}
                          labelFormatter={(label) => label}
                        />
                        <Scatter data={branchBubble} fill="#F5C742" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-white border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">Playbook Suggestions</CardTitle>
                    <CardDescription>Rule-based insights (AI-ready)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                      <p className="text-sm font-medium">Sharjah: high shrinkage proxy</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Increase cycle counts + tighten return approval. Review discount overrides.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                      <p className="text-sm font-medium">Dubai: discount policy leak risk</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add cashier discount caps and manager override logs in POS.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-[#F7F7FA] p-3">
                      <p className="text-sm font-medium">Fujairah: best GP% baseline</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Replicate price-list discipline + upsell scripts to other branches.
                      </p>
                    </div>

                    <Button className="w-full bg-black text-white hover:bg-black/90">
                      Replicate Best Practices
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- AI-LIVE -------------------- */}
        <TabsContent value="ai-live" className="space-y-6">
          <Card className={`bg-white border-2 ${BB_ACCENT_BORDER}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-6 w-6" />
                AI-LIVEâ„¢ Strategic Recommendations Engine
              </CardTitle>
              <CardDescription>Retail-focused, action-ready insights (controls + growth + ops)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiRecommendations.map((r, idx) => {
                const Icon = r.icon;
                return (
                  <Card key={idx} className={`bg-white border ${priorityPill(r.priority)}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-3 rounded-lg bg-white border border-border/60">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-lg">{r.title}</p>
                            <Badge className={`border ${priorityPill(r.priority)}`}>
                              {r.priority.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium text-foreground">Category:</span>{" "}
                            {r.category} â€¢ <span className="font-medium text-foreground">Cadence:</span> {r.cadence}
                          </p>

                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-lg bg-[#F7F7FA] p-3 border border-border/60">
                              <p className="text-xs font-medium">Insight</p>
                              <p className="text-sm text-muted-foreground mt-1">{r.insight}</p>
                            </div>
                            <div className="rounded-lg bg-[#F7F7FA] p-3 border border-border/60">
                              <p className="text-xs font-medium">Recommended Action</p>
                              <p className="text-sm text-muted-foreground mt-1">{r.action}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Projected Impact</p>
                              <p className="text-lg font-bold">{r.impact}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button className="bg-black text-white hover:bg-black/90">
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Implement
                              </Button>
                              <Button variant="outline" className="bg-white">
                                Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <Card className="bg-[#F7F7FA] border border-border/60">
                <CardContent className="p-4">
                  <p className="font-medium flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Quick Wins
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>â€¢ Tighten discount caps + override logs to reduce GP leaks.</li>
                    <li>â€¢ Prioritize dead-stock markdown to recover working capital.</li>
                    <li>â€¢ Automate RFM win-back at 14/21/30-day recency thresholds.</li>
                    <li>â€¢ Track settlement delays per channel to avoid cashflow surprises.</li>
                  </ul>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- STRATEGY -------------------- */}
        <TabsContent value="strategy" className="space-y-6">
          <Card className="bg-white border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Retail Strategy Report
              </CardTitle>
              <CardDescription>Auto-generated growth and control plan (quarterly-ready)</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-green-700">
                    <TrendingUp className="h-5 w-5" />
                    Growing Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {strategy.growing.map((x, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-white border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-red-700">
                    <TrendingDown className="h-5 w-5" />
                    Declining Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {strategy.declining.map((x, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-white border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                    <Lightbulb className="h-5 w-5" />
                    Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {strategy.opportunities.map((x, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-white border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                    <AlertTriangle className="h-5 w-5" />
                    Inefficiencies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {strategy.inefficiencies.map((x, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-600" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className={`bg-[#F7F7FA] border ${BB_ACCENT_BORDER} md:col-span-2`}>
                <CardHeader>
                  <CardTitle className="text-base">Expansion Readiness</CardTitle>
                  <CardDescription>Board-ready statement</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{strategy.expansionReadiness}</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="rounded-lg border border-border/60 bg-white p-3">
                      <p className="text-sm font-medium">Controls (Shrinkage)</p>
                      <Progress value={68} className="h-2 mt-2" />
                      <p className="text-xs text-muted-foreground mt-1">68% â€” strengthen returns + discount caps</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-white p-3">
                      <p className="text-sm font-medium">Cashflow (Settlements)</p>
                      <Progress value={72} className="h-2 mt-2" />
                      <p className="text-xs text-muted-foreground mt-1">72% â€” resolve weekly settlement lags</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-white p-3">
                      <p className="text-sm font-medium">Growth (Repeat Rate)</p>
                      <Progress value={74} className="h-2 mt-2" />
                      <p className="text-xs text-muted-foreground mt-1">74% â€” automate RFM loyalty campaigns</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-5">
                    <Button variant="outline" className="bg-white">
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </Button>
                    <Button className="bg-black text-white hover:bg-black/90">
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageWrap>
  );
}

