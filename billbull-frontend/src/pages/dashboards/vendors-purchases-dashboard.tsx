import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FileText,
  Package,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  RefreshCw,
  Bell,
  Calendar,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ClipboardList,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";

interface VendorsPurchasesDashboardProps {
  onNavigate?: (section: string) => void;
}

// -----------------------------------------------
// KPI DATA
// -----------------------------------------------
const kpis = [
  {
    id: "total-spend",
    title: "Total Purchase Spend (This Month)",
    value: "AED 184,900",
    subtitle: "+12% vs last month",
    icon: DollarSign,
    trend: "up",
    trendValue: "+12%",
  },
  {
    id: "invoices-today",
    title: "Invoices Added Today",
    value: "7",
    subtitle: "Total: AED 14,200",
    icon: FileText,
    trend: "neutral",
  },
  {
    id: "invoices-month",
    title: "Invoices Added This Month",
    value: "38",
    subtitle: "Total: AED 92,450",
    icon: FileText,
    trend: "neutral",
  },
  {
    id: "due-bills",
    title: "Due Vendor Bills",
    value: "AED 48,500",
    subtitle: "18 invoices overdue",
    icon: AlertTriangle,
    trend: "down",
    alert: true,
  },
  {
    id: "upcoming-purchases",
    title: "Upcoming Purchases",
    value: "23 LPOs",
    subtitle: "Value: AED 66,000",
    icon: ShoppingCart,
    trend: "neutral",
  },
  {
    id: "pending-approvals",
    title: "Pending LPO Approvals",
    value: "9",
    subtitle: "Awaiting authorization",
    icon: ClipboardList,
    trend: "neutral",
  },
  {
    id: "goods-requests",
    title: "Pending Goods Requests",
    value: "5",
    subtitle: "GR approvals pending",
    icon: Package,
    trend: "neutral",
  },
  {
    id: "payable-aging",
    title: "Vendor Payable Aging",
    value: "AED 48,500",
    subtitle: "View full report",
    icon: TrendingDown,
    trend: "neutral",
  },
];

// -----------------------------------------------
// PURCHASES PIPELINE DATA
// -----------------------------------------------
const pipelineStages = [
  {
    stage: "Goods Requests",
    count: 22,
    value: "â€”",
    alerts: "5 approval pending",
    color: "bg-blue-100 text-blue-700",
  },
  {
    stage: "LPO Drafts",
    count: 14,
    value: "AED 32,000",
    alerts: "3 missing vendor quotes",
    color: "bg-purple-100 text-purple-700",
  },
  {
    stage: "Approved LPOs",
    count: 23,
    value: "AED 66,000",
    alerts: "â€”",
    color: "bg-green-100 text-green-700",
  },
  {
    stage: "Goods Received",
    count: 18,
    value: "AED 51,500",
    alerts: "2 variances",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    stage: "Vendor Bills",
    count: 38,
    value: "AED 92,450",
    alerts: "9 unpaid",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    stage: "Payments Made",
    count: 29,
    value: "AED 71,900",
    alerts: "â€”",
    color: "bg-green-100 text-green-700",
  },
];

// -----------------------------------------------
// VENDOR AGING DATA
// -----------------------------------------------
const agingData = [
  { period: "0-30 days", amount: "AED 20,400", percentage: 42 },
  { period: "31-60 days", amount: "AED 13,100", percentage: 27 },
  { period: "61-90 days", amount: "AED 8,700", percentage: 18 },
  { period: "90+ days", amount: "AED 6,300", percentage: 13 },
];

// -----------------------------------------------
// TOP VENDORS DATA
// -----------------------------------------------
const topVendors = [
  { name: "ABC Traders LLC", mtdSpend: "AED 28,400", ytdSpend: "AED 142,000", outstanding: "AED 12,000" },
  { name: "XYZ Supplies Co", mtdSpend: "AED 19,800", ytdSpend: "AED 95,300", outstanding: "AED 8,450" },
  { name: "Global Electronics", mtdSpend: "AED 16,500", ytdSpend: "AED 78,200", outstanding: "AED 5,200" },
  { name: "Emirates Wholesale", mtdSpend: "AED 14,200", ytdSpend: "AED 65,800", outstanding: "AED 0" },
  { name: "Dubai Suppliers Hub", mtdSpend: "AED 12,900", ytdSpend: "AED 58,400", outstanding: "AED 3,800" },
];

// -----------------------------------------------
// RISK ALERTS DATA
// -----------------------------------------------
const riskAlerts = [
  { text: "Vendor aging > 90 days", count: 6, severity: "high" },
  { text: "Invoices pending GRN matching", count: 8, severity: "medium" },
  { text: "Invoices without LPO reference", count: 4, severity: "medium" },
  { text: "GRN qty â‰  LPO qty mismatch", count: 2, severity: "high" },
];

// -----------------------------------------------
// ACTIVITY FEED DATA
// -----------------------------------------------
const activityFeed = [
  { time: "12:20 PM", activity: "Vendor Invoice INV-334 posted", icon: FileText },
  { time: "11:40 AM", activity: "LPO-220 approved", icon: CheckCircle },
  { time: "10:50 AM", activity: "GRN-145 received with variance", icon: AlertTriangle },
  { time: "09:20 AM", activity: "New purchase request by Admin", icon: ClipboardList },
  { time: "08:45 AM", activity: "Payment of AED 8,500 made", icon: DollarSign },
];

// -----------------------------------------------
// APPROVAL CENTER DATA
// -----------------------------------------------
const approvals = [
  { text: "3 pending LPO approvals", badge: "PENDING", color: "bg-yellow-100 text-yellow-700" },
  { text: "5 goods request approvals", badge: "URGENT", color: "bg-red-100 text-red-700" },
  { text: "2 invoice approval exceptions", badge: "CLARIFICATION REQUIRED", color: "bg-orange-100 text-orange-700" },
  { text: "1 vendor account modification", badge: "PENDING", color: "bg-yellow-100 text-yellow-700" },
];

// -----------------------------------------------
// SUPPLIER PERFORMANCE DATA
// -----------------------------------------------
const supplierPerformance = [
  { metric: "On-time delivery %", score: "92%", status: "good" },
  { metric: "Price competitiveness", score: "88%", status: "good" },
  { metric: "Quality rating", score: "85%", status: "good" },
  { metric: "GRN variance rate", score: "5%", status: "warning" },
  { metric: "Payment term compliance", score: "95%", status: "good" },
];

// -----------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------
export function VendorsPurchasesDashboard({ onNavigate }: VendorsPurchasesDashboardProps) {
  const [dateFilter, setDateFilter] = useState("This Month");

  const handleNavigation = (navId: string) => {
    if (onNavigate) {
      onNavigate(navId);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-6 space-y-6">
      
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#1E293B]">
            Vendors & Purchases
          </h1>
          <p className="text-sm text-gray-600">
            Purchase pipeline, vendor bills, LPO approvals, payable aging & procurement insights
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
            <option>Main Warehouse</option>
            <option>Warehouse 2</option>
          </select>

          <select 
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
            <option>Custom Range</option>
          </select>

          <Button
            className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
            onClick={() => handleNavigation("vendors-purchases-invoices")}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Vendor Invoice
          </Button>

          <Button
            className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
            onClick={() => handleNavigation("vendors-purchases-lpo")}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create LPO
          </Button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.id}
            className={`border-l-4 ${kpi.alert ? 'border-l-red-500' : 'border-l-[#F5C742]'} bg-white shadow-sm`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[#1E293B]">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.alert ? 'text-red-500' : 'text-[#F5C742]'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1E293B]">{kpi.value}</div>
              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                {kpi.trend === "up" && <ArrowUpRight className="h-3 w-3 text-green-600" />}
                {kpi.trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-600" />}
                {kpi.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* PURCHASES WORKFLOW PIPELINE */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl text-[#1E293B]">Purchases Workflow Pipeline</CardTitle>
          <CardDescription>Track requisitions through to vendor payment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {pipelineStages.map((stage, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg ${stage.color} cursor-pointer hover:shadow-md transition`}
              >
                <div className="text-xs font-medium mb-1">{stage.stage}</div>
                <div className="text-2xl font-bold mb-1">{stage.count}</div>
                <div className="text-xs font-medium mb-2">{stage.value}</div>
                {stage.alerts !== "â€”" && (
                  <Badge variant="outline" className="text-xs bg-white">
                    {stage.alerts}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* VENDOR FINANCIAL HEALTH SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* VENDOR AGING SUMMARY */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B]">Vendor Payable Aging</CardTitle>
            <CardDescription>Outstanding payables by age</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {agingData.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{item.period}</span>
                  <span className="font-medium text-[#1E293B]">{item.amount}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#F5C742] h-2 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("vendors-purchases-reports")}
            >
              View Payable Aging Report <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* TOP VENDORS */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B]">Top Vendors by Spend</CardTitle>
            <CardDescription>Highest spend vendors this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topVendors.map((vendor, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-[#1E293B]">{vendor.name}</span>
                    <Badge variant="outline" className="text-xs">{vendor.mtdSpend}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>YTD: {vendor.ytdSpend}</span>
                    <span className={vendor.outstanding === "AED 0" ? "text-green-600" : "text-orange-600"}>
                      Due: {vendor.outstanding}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* VENDORS AT RISK / ALERTS */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Vendors at Risk / Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {riskAlerts.map((alert, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg flex items-center justify-between ${
                  alert.severity === "high" 
                    ? "bg-red-50 border border-red-200" 
                    : "bg-orange-50 border border-orange-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${
                    alert.severity === "high" ? "text-red-700" : "text-orange-700"
                  }`} />
                  <span className={`text-sm ${
                    alert.severity === "high" ? "text-red-700" : "text-orange-700"
                  }`}>
                    {alert.text}
                  </span>
                </div>
                <Badge variant="outline" className={
                  alert.severity === "high" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                }>
                  {alert.count}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* OPERATIONAL PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT: OPERATIONAL PANELS */}
        <div className="space-y-6">
          
          {/* VENDOR INVOICES */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#F5C742]" />
                Vendor Invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Today's invoices", count: 7, navId: "vendors-purchases-invoices" },
                { label: "This month invoices", count: 38, navId: "vendors-purchases-invoices" },
                { label: "Unpaid invoices", count: 18, navId: "vendors-purchases-invoices" },
                { label: "Overdue invoices", count: 9, navId: "vendors-purchases-invoices" },
                { label: "Partially paid invoices", count: 4, navId: "vendors-purchases-invoices" },
                { label: "Invoices pending GRN match", count: 8, navId: "vendors-purchases-invoices" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleNavigation(item.navId)}
                  className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <span className="text-sm text-[#1E293B]">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-[#F5C742] text-black">{item.count}</Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* LPO PANEL */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-[#F5C742]" />
                Local Purchase Orders (LPO)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Total LPOs this month", count: 45, navId: "vendors-purchases-lpo" },
                { label: "LPOs requiring approval", count: 9, navId: "vendors-purchases-lpo" },
                { label: "Auto-LPO from min stock levels", count: 3, navId: "vendors-purchases-lpo" },
                { label: "LPOs pending vendor confirmation", count: 6, navId: "vendors-purchases-lpo" },
                { label: "LPOs pending GRN posting", count: 12, navId: "vendors-purchases-grn" },
                { label: "LPOs partially received", count: 5, navId: "vendors-purchases-grn" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleNavigation(item.navId)}
                  className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <span className="text-sm text-[#1E293B]">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-[#F5C742] text-black">{item.count}</Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* GOODS REQUESTS */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#F5C742]" />
                Goods Requests (Purchase Requisition)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Requests created today", count: 4, navId: "vendors-purchases-goods-request" },
                { label: "Pending approvals", count: 5, navId: "vendors-purchases-goods-request" },
                { label: "Approved & awaiting LPO creation", count: 8, navId: "vendors-purchases-goods-request" },
                { label: "Completed requests", count: 22, navId: "vendors-purchases-goods-request" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleNavigation(item.navId)}
                  className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <span className="text-sm text-[#1E293B]">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-[#F5C742] text-black">{item.count}</Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* GOODS RECEIPTS (GRN) */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <Package className="h-5 w-5 text-[#F5C742]" />
                Goods Receipts (GRN)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "GRN posted today", count: 6, navId: "vendors-purchases-grn" },
                { label: "Variances detected (Qty/Cost)", count: 2, navId: "vendors-purchases-grn" },
                { label: "GRNs awaiting invoice match", count: 9, navId: "vendors-purchases-grn" },
                { label: "GRNs posted but not in stock", count: 1, navId: "vendors-purchases-grn" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleNavigation(item.navId)}
                  className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <span className="text-sm text-[#1E293B]">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-[#F5C742] text-black">{item.count}</Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: INSIGHTS & ANALYTICS PANEL */}
        <div className="space-y-6">
          
          {/* ACTIVITY FEED */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-[#F5C742]" />
                Procurement Activity Feed
              </CardTitle>
              <CardDescription>Real-time purchase activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activityFeed.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-[#F7F7FA] rounded-lg">
                    <item.icon className="h-4 w-4 text-[#F5C742] mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-[#1E293B]">{item.activity}</p>
                      <p className="text-xs text-gray-600 mt-1">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* APPROVAL CENTER */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#F5C742]" />
                Approval Center
              </CardTitle>
              <CardDescription>Pending workflow actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvals.map((approval, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg flex items-center justify-between cursor-pointer hover:shadow-md transition ${approval.color}`}
                >
                  <span className="text-sm font-medium">{approval.text}</span>
                  <Badge variant="outline" className="bg-white text-xs">
                    {approval.badge}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* SUPPLIER PERFORMANCE SCORECARD */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#F5C742]" />
                Supplier Performance Scorecard
              </CardTitle>
              <CardDescription>Average vendor performance metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplierPerformance.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{item.metric}</span>
                    <Badge
                      variant="outline"
                      className={
                        item.status === "good"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }
                    >
                      {item.score}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        item.status === "good" ? "bg-green-500" : "bg-orange-500"
                      }`}
                      style={{ width: item.score }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* PRICE COMPARISON & BENCHMARK */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B]">Price Comparison & Vendor Benchmark</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
                <span className="text-sm text-[#1E293B]">Items purchased this month</span>
                <Badge className="bg-blue-100 text-blue-700">142</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
                <span className="text-sm text-[#1E293B]">Avg vendor quote variance</span>
                <Badge className="bg-orange-100 text-orange-700">Â±8%</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
                <span className="text-sm text-[#1E293B]">Cost increase month-to-month</span>
                <Badge className="bg-red-100 text-red-700">+3.2%</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ADDITIONAL INSIGHTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SPEND FORECASTING */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B]">Spend Forecasting</CardTitle>
            <CardDescription>Based on history & planned LPOs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-700">Expected next 7 days</span>
              <Badge className="bg-blue-200 text-blue-800">AED 32,500</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <span className="text-sm font-medium text-indigo-700">Expected next 30 days</span>
              <Badge className="bg-indigo-200 text-indigo-800">AED 145,000</Badge>
            </div>
          </CardContent>
        </Card>

        {/* EXPECTED STOCK ARRIVAL */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#F5C742]" />
              Expected Stock Arrival
            </CardTitle>
            <CardDescription>Based on approved LPO dates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-green-700">Arriving today</span>
                <Badge className="bg-green-200 text-green-800">4 LPOs</Badge>
              </div>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-yellow-700">Arriving this week</span>
                <Badge className="bg-yellow-200 text-yellow-800">12 LPOs</Badge>
              </div>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-red-700">Overdue arrivals</span>
                <Badge className="bg-red-200 text-red-800">3 LPOs</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VENDOR CONTRACT EXPIRY */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              Vendor Contract Expiry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-orange-700">Supply contracts expiring</span>
                <Badge className="bg-orange-200 text-orange-800">2</Badge>
              </div>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-yellow-700">Price agreements ending</span>
                <Badge className="bg-yellow-200 text-yellow-800">5</Badge>
              </div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-blue-700">Annual renewals due</span>
                <Badge className="bg-blue-200 text-blue-800">3</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

export default VendorsPurchasesDashboard;

