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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FileText,
  Package,
  Clock,
  Users,
  CreditCard,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  XCircle,
  RefreshCw,
  Bell,
  Calendar,
  Filter,
  Plus,
} from "lucide-react";

interface CustomersSalesDashboardProps {
  onNavigate?: (section: string) => void;
}

// -----------------------------------------------
// KPI DATA
// -----------------------------------------------
const kpis = [
  {
    id: "total-sales",
    title: "Total Sales (This Month)",
    value: "AED 148,520",
    subtitle: "+18% vs last month",
    icon: DollarSign,
    trend: "up",
    trendValue: "+18%",
  },
  {
    id: "receivables",
    title: "Outstanding Receivables",
    value: "AED 42,800",
    subtitle: "Across 23 customers",
    icon: TrendingUp,
    trend: "neutral",
  },
  {
    id: "overdue",
    title: "Overdue Invoices",
    value: "18",
    subtitle: "Age > 30 days",
    icon: AlertTriangle,
    trend: "down",
    alert: true,
  },
  {
    id: "quotations",
    title: "Quotation Pipeline",
    value: "32",
    subtitle: "12 waiting approval",
    icon: FileText,
    trend: "neutral",
  },
  {
    id: "orders",
    title: "Confirmed Orders",
    value: "17",
    subtitle: "Ready for invoicing",
    icon: Package,
    trend: "neutral",
  },
  {
    id: "advances",
    title: "Advances Received",
    value: "AED 11,200",
    subtitle: "Against SO & PI",
    icon: CreditCard,
    trend: "neutral",
  },
];

// -----------------------------------------------
// SALES PIPELINE DATA
// -----------------------------------------------
const pipelineStages = [
  {
    stage: "Quotations created",
    count: 32,
    value: "AED 85,000",
    alerts: "4 expiring validity",
    color: "bg-blue-100 text-blue-700",
  },
  {
    stage: "Revisions requested",
    count: 11,
    value: "â€”",
    alerts: "3 discount approvals pending",
    color: "bg-purple-100 text-purple-700",
  },
  {
    stage: "Approved",
    count: 20,
    value: "AED 44,000",
    alerts: "â€”",
    color: "bg-green-100 text-green-700",
  },
  {
    stage: "Sales Orders",
    count: 14,
    value: "AED 36,500",
    alerts: "2 partial deliveries",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    stage: "Proforma Invoice",
    count: 9,
    value: "AED 22,400",
    alerts: "â€”",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    stage: "Invoices Created",
    count: 45,
    value: "AED 110,200",
    alerts: "â€”",
    color: "bg-teal-100 text-teal-700",
  },
  {
    stage: "Payments Received",
    count: 36,
    value: "AED 78,900",
    alerts: "6 partially paid",
    color: "bg-green-100 text-green-700",
  },
];

// -----------------------------------------------
// CUSTOMER AGING DATA
// -----------------------------------------------
const agingData = [
  { period: "0-30 days", amount: "AED 18,500", percentage: 43 },
  { period: "31-60 days", amount: "AED 12,300", percentage: 29 },
  { period: "61-90 days", amount: "AED 7,800", percentage: 18 },
  { period: "90+ days", amount: "AED 4,200", percentage: 10 },
];

// -----------------------------------------------
// TOP CUSTOMERS DATA
// -----------------------------------------------
const topCustomers = [
  { name: "Al Jazira Trading LLC", totalPurchase: "AED 45,200", lastInvoice: "Dec 8, 2024", outstanding: "AED 8,500" },
  { name: "Emirates Electronics", totalPurchase: "AED 38,900", lastInvoice: "Dec 9, 2024", outstanding: "AED 3,200" },
  { name: "Dubai Retail Group", totalPurchase: "AED 32,100", lastInvoice: "Dec 7, 2024", outstanding: "AED 0" },
  { name: "Gulf Supplies Co", totalPurchase: "AED 28,400", lastInvoice: "Dec 6, 2024", outstanding: "AED 12,100" },
  { name: "Metro Distributors", totalPurchase: "AED 24,700", lastInvoice: "Dec 10, 2024", outstanding: "AED 5,600" },
];

// -----------------------------------------------
// RISK ALERTS DATA
// -----------------------------------------------
const riskAlerts = [
  { text: "12 customers exceeded credit limit", severity: "high" },
  { text: "7 overdue invoices > 45 days", severity: "high" },
  { text: "3 invoices returned/voided", severity: "medium" },
];

// -----------------------------------------------
// ACTIVITY FEED DATA
// -----------------------------------------------
const activityFeed = [
  { time: "11:22 AM", activity: "Invoice INV-1204 created", icon: FileText },
  { time: "10:55 AM", activity: "Quotation QTN-233 revised", icon: RefreshCw },
  { time: "10:40 AM", activity: "Customer paid AED 1,200", icon: DollarSign },
  { time: "09:20 AM", activity: "Discount approval requested", icon: AlertTriangle },
  { time: "09:05 AM", activity: "Sales Order SO-118 confirmed", icon: CheckCircle },
];

// -----------------------------------------------
// APPROVAL CENTER DATA
// -----------------------------------------------
const approvals = [
  { text: "3 Quotation revisions pending", badge: "URGENT", color: "bg-red-100 text-red-700" },
  { text: "2 Discount approvals", badge: "DUE TODAY", color: "bg-orange-100 text-orange-700" },
  { text: "4 Credit-limit override requests", badge: "NEEDS ACTION", color: "bg-yellow-100 text-yellow-700" },
  { text: "1 Invoice write-off request", badge: "URGENT", color: "bg-red-100 text-red-700" },
];

// -----------------------------------------------
// COLLECTIONS DATA
// -----------------------------------------------
const collectionsData = [
  { customer: "Al Jazira Trading LLC", amount: "AED 8,500", dueDays: 45, creditLimit: "AED 50,000", risk: "High" },
  { customer: "Gulf Supplies Co", amount: "AED 12,100", dueDays: 32, creditLimit: "AED 30,000", risk: "Medium" },
  { customer: "Metro Distributors", amount: "AED 5,600", dueDays: 28, creditLimit: "AED 25,000", risk: "Low" },
  { customer: "Emirates Electronics", amount: "AED 3,200", dueDays: 15, creditLimit: "AED 40,000", risk: "Low" },
];

// -----------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------
export function CustomersSalesDashboard({ onNavigate }: CustomersSalesDashboardProps) {
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
            Customers & Sales
          </h1>
          <p className="text-sm text-gray-600">
            Sales pipeline, invoices, quotations, receivables & customer operations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
            <option>Main Branch</option>
            <option>Branch 2</option>
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
            onClick={() => handleNavigation("customers-sales-sales-invoices")}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Invoice
          </Button>

          <Button
            className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
            onClick={() => handleNavigation("customers-sales-quotations")}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Quotation
          </Button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

      {/* SALES PIPELINE OVERVIEW */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl text-[#1E293B]">Sales Pipeline Overview</CardTitle>
          <CardDescription>Track quotations through to payment collection</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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

      {/* CUSTOMER FINANCIAL HEALTH SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CUSTOMER AGING SUMMARY */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B]">Customer Aging Summary</CardTitle>
            <CardDescription>Receivables by age period</CardDescription>
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
              onClick={() => handleNavigation("customers-sales-reports")}
            >
              View Customer Aging Report <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* TOP CUSTOMERS */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B]">Top Customers (Revenue)</CardTitle>
            <CardDescription>Highest revenue customers this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCustomers.map((customer, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-[#1E293B]">{customer.name}</span>
                    <Badge variant="outline" className="text-xs">{customer.totalPurchase}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Last: {customer.lastInvoice}</span>
                    <span className={customer.outstanding === "AED 0" ? "text-green-600" : "text-orange-600"}>
                      Due: {customer.outstanding}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RISK & EXCEPTION ALERTS */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Risk & Exception Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {riskAlerts.map((alert, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  alert.severity === "high" 
                    ? "bg-red-50 border border-red-200 text-red-700" 
                    : "bg-orange-50 border border-orange-200 text-orange-700"
                }`}
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{alert.text}</span>
              </div>
            ))}

            <div className="pt-4 space-y-2">
              <h4 className="font-medium text-sm text-[#1E293B]">Data Quality Issues</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Customers missing TRN number</span>
                  <Badge variant="outline">8</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Invalid phone/email</span>
                  <Badge variant="outline">5</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>No price list assigned</span>
                  <Badge variant="outline">12</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OPERATIONAL PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT: SALES DOCUMENTS PANEL */}
        <div className="space-y-6">
          
          {/* INVOICES */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#F5C742]" />
                Invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Today's invoices", count: 8, navId: "customers-sales-sales-invoices" },
                { label: "This month's invoices", count: 142, navId: "customers-sales-sales-invoices" },
                { label: "Pending payments", count: 23, navId: "customers-sales-sales-invoices" },
                { label: "Returned / cancelled invoices", count: 3, navId: "customers-sales-sales-invoices" },
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

          {/* QUOTATIONS */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#F5C742]" />
                Quotations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "New quotations created today", count: 4, navId: "customers-sales-quotations" },
                { label: "Quotations pending approval", count: 12, navId: "customers-sales-quotations" },
                { label: "Revision requests", count: 11, navId: "customers-sales-quotations" },
                { label: "Quotes with discount override", count: 3, navId: "customers-sales-quotations" },
                { label: "Quotes expiring today/tomorrow", count: 7, navId: "customers-sales-quotations" },
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

          {/* SALES ORDERS & PROFORMA */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <Package className="h-5 w-5 text-[#F5C742]" />
                Sales Orders & Proforma Invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "SO waiting confirmation", count: 5, navId: "customers-sales-sales-orders" },
                { label: "SO partially delivered", count: 2, navId: "customers-sales-delivery-note" },
                { label: "PI pending conversion", count: 9, navId: "customers-sales-proforma" },
                { label: "PI waiting customer advance", count: 4, navId: "customers-sales-proforma" },
                { label: "Converted to invoice today", count: 6, navId: "customers-sales-sales-invoices" },
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

        {/* RIGHT: QUICK INSIGHTS PANEL */}
        <div className="space-y-6">
          
          {/* ACTIVITY FEED */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-[#F5C742]" />
                Customer Activity Feed
              </CardTitle>
              <CardDescription>Real-time sales activity</CardDescription>
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

          {/* UPCOMING FOLLOW-UPS */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#F5C742]" />
                Upcoming Follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
                <span className="text-sm text-[#1E293B]">5 follow-ups due today</span>
                <Badge className="bg-red-100 text-red-700">TODAY</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
                <span className="text-sm text-[#1E293B]">12 follow-ups scheduled this week</span>
                <Badge className="bg-blue-100 text-blue-700">THIS WEEK</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
                <span className="text-sm text-[#1E293B]">2 follow-ups overdue</span>
                <Badge className="bg-orange-100 text-orange-700">OVERDUE</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* COLLECTIONS FOCUS BLOCK */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl text-[#1E293B]">Collections Focus - Receivables</CardTitle>
          <CardDescription>Outstanding amounts requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F7F7FA]">
                <TableHead>Customer</TableHead>
                <TableHead>Amount Due</TableHead>
                <TableHead>Due Days</TableHead>
                <TableHead>Credit Limit</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collectionsData.map((row, idx) => (
                <TableRow 
                  key={idx} 
                  className={`hover:bg-[#FFF8DA] ${row.dueDays > 30 ? 'bg-red-50' : row.dueDays > 20 ? 'bg-orange-50' : ''}`}
                >
                  <TableCell className="font-medium">{row.customer}</TableCell>
                  <TableCell className="font-medium">{row.amount}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={row.dueDays > 30 ? 'bg-red-100 text-red-700' : row.dueDays > 20 ? 'bg-orange-100 text-orange-700' : ''}>
                      {row.dueDays} days
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">{row.creditLimit}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.risk === "High"
                          ? "bg-red-100 text-red-700"
                          : row.risk === "Medium"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                      }
                    >
                      {row.risk}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handleNavigation("customers-sales-customer-ledger")}
                    >
                      View Ledger
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ADDITIONAL INSIGHTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PAYMENT MODE ANALYSIS */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B]">Payment Mode Analysis</CardTitle>
            <CardDescription>This month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { mode: "Cash", amount: "AED 42,300", percentage: 38 },
              { mode: "Bank Transfer", amount: "AED 56,200", percentage: 50 },
              { mode: "Card", amount: "AED 8,900", percentage: 8 },
              { mode: "Credit Sales", amount: "AED 4,500", percentage: 4 },
            ].map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{item.mode}</span>
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
          </CardContent>
        </Card>

        {/* EXPIRING SALES DOCUMENTS */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Expiring Sales Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-orange-700">Quotes expiring in 24 hours</span>
                <Badge className="bg-orange-200 text-orange-800">7</Badge>
              </div>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-yellow-700">PI valid until tomorrow</span>
                <Badge className="bg-yellow-200 text-yellow-800">3</Badge>
              </div>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-red-700">SO delivery overdue</span>
                <Badge className="bg-red-200 text-red-800">2</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DELIVERY STATUS SNAPSHOT */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Package className="h-5 w-5 text-[#F5C742]" />
              Delivery Status Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
              <span className="text-sm text-[#1E293B]">Items pending delivery</span>
              <Badge className="bg-blue-100 text-blue-700">24</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
              <span className="text-sm text-[#1E293B]">Partially delivered SO</span>
              <Badge className="bg-orange-100 text-orange-700">5</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#F7F7FA] rounded-lg">
              <span className="text-sm text-[#1E293B]">Completed deliveries today</span>
              <Badge className="bg-green-100 text-green-700">12</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

export default CustomersSalesDashboard;

