import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  DollarSign,
  ShoppingCart,
  Users,
  Percent,
  Package,
  CreditCard,
  Truck,
  Megaphone,
  Shield,
  Zap,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Target,
  Activity,
  Layers,
  Filter,
  TrendingDown as ArrowDown,
  Award,
  Clock,
  MapPin,
  RefreshCw,
  Bell,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Box,
  Star,
  XCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ComposedChart,
} from "recharts";
import { ProductPerformanceConversion } from "./product-performance-conversion";
import { ProductPerformanceReturns } from "./product-performance-returns";
import { ProductPerformancePriceSense } from "./product-performance-price-sense";
import { ProductPerformancePromos } from "./product-performance-promos";
import { ProductPerformanceAffinity } from "./product-performance-affinity";

/**
 * BillBull Storefront Analytics â€” Business Intelligence & Growth Engine
 * 
 * Purpose: Answer 3 executive questions continuously:
 * 1. What is happening now? (performance & risks)
 * 2. Why is it happening? (drivers & leakage)
 * 3. What should I do next? (actions & forecasts)
 * 
 * Structure:
 * - Global Header: Date | Branch | Channel | Compare | Export
 * - Executive KPI Strip
 * - 10 Analytics Tabs (Sub-Modules)
 * - Main Visualization Area
 * - Insights & Actions Panel (Sticky Right)
 */

const COLORS = ["#F5C742", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444", "#F59E0B", "#06B6D4", "#EC4899"];

export function StorefrontAnalytics() {
  const [dateRange, setDateRange] = useState("last30");
  const [branch, setBranch] = useState("all");
  const [channel, setChannel] = useState("all");
  const [compareMode, setCompareMode] = useState(false);
  const [activeTab, setActiveTab] = useState("executive");

  // Mock data for visualizations
  const revenueData = [
    { date: "Jan", gmv: 145000, revenue: 132000, cost: 89000, margin: 43000 },
    { date: "Feb", gmv: 158000, revenue: 144000, cost: 95000, margin: 49000 },
    { date: "Mar", gmv: 172000, revenue: 156000, cost: 101000, margin: 55000 },
    { date: "Apr", gmv: 165000, revenue: 150000, cost: 98000, margin: 52000 },
    { date: "May", gmv: 189000, revenue: 172000, cost: 110000, margin: 62000 },
    { date: "Jun", gmv: 203000, revenue: 185000, cost: 118000, margin: 67000 },
  ];

  const funnelData = [
    { stage: "Visits", value: 125000, conversion: 100 },
    { stage: "Product Views", value: 48000, conversion: 38.4 },
    { stage: "Add to Cart", value: 15600, conversion: 12.5 },
    { stage: "Checkout", value: 8900, conversion: 7.1 },
    { stage: "Payment", value: 6400, conversion: 5.1 },
    { stage: "Delivered", value: 5800, conversion: 4.6 },
  ];

  const branchFulfillmentData = [
    { branch: "Main Store", orders: 1240, onTime: 94, avgTime: "14h" },
    { branch: "Warehouse A", orders: 890, onTime: 97, avgTime: "11h" },
    { branch: "Branch North", orders: 650, onTime: 89, avgTime: "18h" },
    { branch: "Branch South", orders: 520, onTime: 92, avgTime: "15h" },
  ];

  const categoryRevenueData = [
    { name: "Electronics", value: 45000, margin: 12.5 },
    { name: "Fashion", value: 38000, margin: 28.3 },
    { name: "Home & Living", value: 28000, margin: 22.1 },
    { name: "Beauty", value: 24000, margin: 31.2 },
    { name: "Sports", value: 18000, margin: 19.8 },
    { name: "Books", value: 12000, margin: 15.4 },
  ];

  const ordersTrendData = [
    { date: "Week 1", orders: 1420, cod: 850, prepaid: 570, abandoned: 340 },
    { date: "Week 2", orders: 1580, cod: 920, prepaid: 660, abandoned: 380 },
    { date: "Week 3", orders: 1490, cod: 880, prepaid: 610, abandoned: 360 },
    { date: "Week 4", orders: 1650, cod: 950, prepaid: 700, abandoned: 390 },
  ];

  const customerSegmentData = [
    { segment: "VIP (Top 5%)", customers: 240, ltv: 8500, orders: 2840, risk: "Low" },
    { segment: "Loyal (15%)", customers: 680, ltv: 3200, orders: 4120, risk: "Low" },
    { segment: "Regular (30%)", customers: 1350, ltv: 1200, orders: 3680, risk: "Medium" },
    { segment: "New (50%)", customers: 2230, ltv: 280, orders: 2450, risk: "High" },
  ];

  const rfmSegmentData = [
    { name: "Champions", value: 18, color: "#10B981" },
    { name: "Loyal", value: 24, color: "#3B82F6" },
    { name: "Potential", value: 22, color: "#F59E0B" },
    { name: "At Risk", value: 15, color: "#EF4444" },
    { name: "Lost", value: 12, color: "#6B7280" },
    { name: "New", value: 9, color: "#8B5CF6" },
  ];

  const marginLeakData = [
    { issue: "Excessive Discounts", count: 124, leakage: 18500, severity: "high" },
    { issue: "Manual Price Override", count: 68, leakage: 12300, severity: "medium" },
    { issue: "Cost Increase (No Price Update)", count: 45, leakage: 9800, severity: "high" },
    { issue: "Coupon Abuse", count: 32, leakage: 5600, severity: "medium" },
    { issue: "Promotional Over-spend", count: 28, leakage: 4200, severity: "low" },
  ];

  const paymentFlowData = [
    { gateway: "Razorpay", collected: 125000, settled: 118000, pending: 7000, fees: 2500 },
    { gateway: "PayU", collected: 89000, settled: 85000, pending: 4000, fees: 1780 },
    { gateway: "COD", collected: 156000, settled: 142000, pending: 14000, fees: 0 },
  ];

  const riskAlertsData = [
    { type: "COD High Failure Rate", count: 18, amount: 24500, action: "Review Zone" },
    { type: "Duplicate Customers", count: 12, amount: 15800, action: "Block IPs" },
    { type: "Velocity Abuse", count: 8, amount: 18900, action: "Limit Orders" },
    { type: "High-Value Pending", count: 24, amount: 89000, action: "Manual Review" },
  ];

  const aiInsights = [
    {
      title: "Margin Loss Alert",
      description: "Top 10 SKUs causing 40% of total margin loss due to aggressive discounting.",
      impact: "â‚¹18,500 / month",
      action: "Review Pricing",
      severity: "high",
    },
    {
      title: "Fulfillment Delay",
      description: "Branch North delays (18h avg) causing 12% conversion drop in Region B.",
      impact: "145 lost orders / week",
      action: "Optimize Routing",
      severity: "high",
    },
    {
      title: "COD Risk Rising",
      description: "COD failure rate in Zone C increased 24% in last 2 weeks.",
      impact: "â‚¹14,200 exposure",
      action: "Adjust Limits",
      severity: "medium",
    },
    {
      title: "Churn Warning",
      description: "68 high-LTV customers haven't ordered in 45+ days (churn risk 78%).",
      impact: "â‚¹2.4L potential LTV loss",
      action: "Win-Back Campaign",
      severity: "medium",
    },
  ];

  const campaignROIData = [
    { campaign: "Flash Sale - Electronics", spent: 12000, revenue: 48000, orders: 240, roi: 300 },
    { campaign: "New User Coupon", spent: 18000, revenue: 36000, orders: 680, roi: 100 },
    { campaign: "Referral Bonus", spent: 8500, revenue: 28000, orders: 145, roi: 229 },
    { campaign: "Cart Recovery", spent: 4200, revenue: 24000, orders: 156, roi: 471 },
  ];

  const demandForecastData = [
    { week: "W1", actual: 1420, forecast: 1450 },
    { week: "W2", actual: 1580, forecast: 1550 },
    { week: "W3", actual: 1490, forecast: 1520 },
    { week: "W4", actual: 1650, forecast: 1620 },
    { week: "W5 (F)", actual: null, forecast: 1680 },
    { week: "W6 (F)", actual: null, forecast: 1720 },
    { week: "W7 (F)", actual: null, forecast: 1650 },
  ];

  // Product Performance Mock Data
  const topPerformersData = [
    { sku: "ELC-2401", product: "Wireless Earbuds Pro", revenue: 48500, units: 245, margin: 32.4, conversion: 8.2, returns: 2.1, stock: 142, status: "In Stock" },
    { sku: "FSH-8923", product: "Premium Denim Jacket", revenue: 42300, units: 189, margin: 38.6, conversion: 6.8, returns: 4.2, stock: 68, status: "Low Stock" },
    { sku: "HOM-5612", product: "Smart LED Bulb 4-Pack", revenue: 38900, units: 412, margin: 28.1, conversion: 9.4, returns: 1.8, stock: 285, status: "In Stock" },
    { sku: "BEA-3401", product: "Organic Face Serum", revenue: 35600, units: 298, margin: 42.3, conversion: 7.6, returns: 3.1, stock: 196, status: "In Stock" },
    { sku: "SPO-7821", product: "Yoga Mat Premium", revenue: 29800, units: 342, margin: 35.8, conversion: 8.9, returns: 2.4, stock: 218, status: "In Stock" },
  ];

  const bottomPerformersData = [
    { sku: "ELC-9421", product: "Tablet Case Generic", revenue: 2100, units: 48, margin: 12.4, conversion: 1.2, returns: 18.2, stock: 345, status: "Overstock", issue: "High Returns" },
    { sku: "FSH-2109", product: "Wool Sweater Heavy", revenue: 3200, units: 28, margin: 8.6, conversion: 0.8, returns: 12.4, stock: 412, status: "Overstock", issue: "Low Conversion" },
    { sku: "HOM-8821", product: "Decorative Vase Large", revenue: 1850, units: 12, margin: 15.2, conversion: 2.4, returns: 8.9, stock: 89, status: "Dead Stock", issue: "No Movement" },
    { sku: "BEA-5523", product: "Hair Spray Budget", revenue: 2890, units: 124, margin: -2.1, conversion: 3.2, returns: 14.5, stock: 246, status: "In Stock", issue: "Negative Margin" },
    { sku: "SPO-4412", product: "Running Shoes v1", revenue: 4200, units: 18, margin: 18.9, conversion: 0.6, returns: 22.1, stock: 156, status: "Overstock", issue: "High Returns + Low Conv" },
  ];

  const skuProfitabilityData = [
    { month: "Jan", highMargin: 145, mediumMargin: 289, lowMargin: 124, negative: 12 },
    { month: "Feb", highMargin: 158, mediumMargin: 312, lowMargin: 118, negative: 14 },
    { month: "Mar", highMargin: 172, mediumMargin: 334, lowMargin: 112, negative: 11 },
    { month: "Apr", highMargin: 189, mediumMargin: 356, lowMargin: 108, negative: 9 },
    { month: "May", highMargin: 204, mediumMargin: 378, lowMargin: 102, negative: 8 },
    { month: "Jun", highMargin: 218, mediumMargin: 398, lowMargin: 96, negative: 6 },
  ];

  const productLifecycleData = [
    { stage: "New (0-30 days)", count: 89, revenue: 45200, avgMargin: 28.4 },
    { stage: "Growing (31-90 days)", count: 142, revenue: 124500, avgMargin: 32.1 },
    { stage: "Mature (91-365 days)", count: 328, revenue: 445600, avgMargin: 26.8 },
    { stage: "Declining (1-2 years)", count: 184, revenue: 89400, avgMargin: 18.2 },
    { stage: "Dead Stock (2+ years)", count: 67, revenue: 8200, avgMargin: 6.4 },
  ];

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-slate-900">Storefront Analytics</h1>
            <p className="text-slate-600 mt-1">
              Business Intelligence & Growth Engine
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Global Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7">Last 7 Days</SelectItem>
                    <SelectItem value="last30">Last 30 Days</SelectItem>
                    <SelectItem value="last90">Last 90 Days</SelectItem>
                    <SelectItem value="mtd">Month to Date</SelectItem>
                    <SelectItem value="qtd">Quarter to Date</SelectItem>
                    <SelectItem value="ytd">Year to Date</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator orientation="vertical" className="h-8" />

              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-500" />
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    <SelectItem value="main">Main Store</SelectItem>
                    <SelectItem value="warehouse-a">Warehouse A</SelectItem>
                    <SelectItem value="north">Branch North</SelectItem>
                    <SelectItem value="south">Branch South</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="app">Mobile App</SelectItem>
                    <SelectItem value="pos">POS Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator orientation="vertical" className="h-8" />

              <Button
                variant={compareMode ? "default" : "outline"}
                size="sm"
                onClick={() => setCompareMode(!compareMode)}
                className={compareMode ? "bg-[#F5C742] hover:bg-[#F5C742]/90 text-slate-900" : ""}
              >
                Compare Period
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Executive KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">GMV</p>
                <DollarSign className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-slate-900 mb-1">â‚¹2.03L</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+18.2%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">Net Revenue</p>
                <DollarSign className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-slate-900 mb-1">â‚¹1.85L</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+16.8%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">Orders</p>
                <ShoppingCart className="h-4 w-4 text-purple-500" />
              </div>
              <p className="text-slate-900 mb-1">6,140</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+12.4%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">Conversion</p>
                <Percent className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-slate-900 mb-1">4.9%</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingDown className="h-3 w-3 text-red-600" />
                <span className="text-red-600">-0.3%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">Avg Order Value</p>
                <DollarSign className="h-4 w-4 text-cyan-500" />
              </div>
              <p className="text-slate-900 mb-1">â‚¹3,014</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+5.2%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">Gross Margin</p>
                <Percent className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-slate-900 mb-1">36.2%</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+2.1%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">Fulfillment SLA</p>
                <Truck className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-slate-900 mb-1">93.2%</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+1.8%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">COD Risk</p>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-slate-900 mb-1">8.9%</p>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-red-600" />
                <span className="text-red-600">+2.4%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content: Tabs + Insights Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Tabs Area */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5 lg:grid-cols-11 gap-1">
                <TabsTrigger value="executive" className="text-xs px-2">Executive</TabsTrigger>
                <TabsTrigger value="sales" className="text-xs px-2">Sales</TabsTrigger>
                <TabsTrigger value="orders" className="text-xs px-2">Orders</TabsTrigger>
                <TabsTrigger value="customers" className="text-xs px-2">Customers</TabsTrigger>
                <TabsTrigger value="pricing" className="text-xs px-2">Pricing</TabsTrigger>
                <TabsTrigger value="products" className="text-xs px-2">Products</TabsTrigger>
                <TabsTrigger value="inventory" className="text-xs px-2">Inventory</TabsTrigger>
                <TabsTrigger value="payments" className="text-xs px-2">Payments</TabsTrigger>
                <TabsTrigger value="marketing" className="text-xs px-2">Marketing</TabsTrigger>
                <TabsTrigger value="risk" className="text-xs px-2">Risk</TabsTrigger>
                <TabsTrigger value="forecasts" className="text-xs px-2">AI Insights</TabsTrigger>
              </TabsList>

              {/* 1. Executive Overview */}
              <TabsContent value="executive" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-[#F5C742]" />
                      Executive Overview
                    </CardTitle>
                    <CardDescription>
                      Tell me in 60 seconds if my Storefront is healthy
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Storefront Funnel */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Storefront Funnel</h4>
                      <div className="space-y-2">
                        {funnelData.map((stage, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="w-32 text-sm text-slate-600">{stage.stage}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Progress value={stage.conversion} className="flex-1" />
                                <div className="w-24 text-right">
                                  <span className="text-sm text-slate-900">{stage.value.toLocaleString()}</span>
                                  <span className="text-xs text-slate-500 ml-2">({stage.conversion}%)</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Revenue vs Cost vs Margin */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Revenue vs Cost vs Margin (Last 6 Months)</h4>
                      <div className="h-[250px] w-full min-h-[250px]">
                        <ResponsiveContainer width="100%" height={250}>
                          <ComposedChart data={revenueData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="date" stroke="#64748B" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#FFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Bar dataKey="revenue" fill="#3B82F6" name="Net Revenue" />
                          <Bar dataKey="cost" fill="#EF4444" name="Cost" />
                          <Line type="monotone" dataKey="margin" stroke="#10B981" strokeWidth={2} name="Gross Margin" />
                        </ComposedChart>
                      </ResponsiveContainer>
                      </div>
                    </div>

                    <Separator />

                    {/* Branch Fulfillment Performance */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Branch Fulfillment Performance</h4>
                      <div className="space-y-3">
                        {branchFulfillmentData.map((branch, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex-1">
                              <p className="text-sm text-slate-900">{branch.branch}</p>
                              <p className="text-xs text-slate-600">{branch.orders} orders Â· Avg {branch.avgTime}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm text-slate-900">{branch.onTime}%</p>
                                <p className="text-xs text-slate-600">On-time</p>
                              </div>
                              <div className="w-16">
                                <Progress value={branch.onTime} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Issues Summary */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Active Issues</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <span className="text-sm text-red-900">High Priority</span>
                          </div>
                          <p className="text-2xl text-red-900">8</p>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-amber-600" />
                            <span className="text-sm text-amber-900">Medium Priority</span>
                          </div>
                          <p className="text-2xl text-amber-900">15</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 2. Sales & Revenue Analytics */}
              <TabsContent value="sales" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-[#F5C742]" />
                      Sales & Revenue Analytics
                    </CardTitle>
                    <CardDescription>
                      Revenue breakdown by channel, branch, product & category
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Category Revenue Pie Chart */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Revenue by Category</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-[200px] w-full min-h-[200px]">
                          <ResponsiveContainer width="100%" height={200}>
                            <RechartsPieChart>
                            <Pie
                              data={categoryRevenueData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {categoryRevenueData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {categoryRevenueData.map((cat, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                />
                                <span className="text-slate-700">{cat.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-900">â‚¹{(cat.value / 1000).toFixed(0)}K</span>
                                <span className="text-xs text-green-600 ml-2">{cat.margin}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Profitability Metrics */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Profitability Metrics</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs text-green-700 mb-1">Gross Revenue</p>
                          <p className="text-xl text-green-900">â‚¹2.03L</p>
                          <p className="text-xs text-green-600 mt-1">100%</p>
                        </div>
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-700 mb-1">Net Revenue</p>
                          <p className="text-xl text-blue-900">â‚¹1.85L</p>
                          <p className="text-xs text-blue-600 mt-1">91.1%</p>
                        </div>
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <p className="text-xs text-emerald-700 mb-1">Gross Profit</p>
                          <p className="text-xl text-emerald-900">â‚¹67K</p>
                          <p className="text-xs text-emerald-600 mt-1">36.2%</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Discount Impact */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Discount Impact Analysis</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="text-sm text-slate-900">Platform Discounts</p>
                            <p className="text-xs text-slate-600">Funded by merchant</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-900">â‚¹14,200</p>
                            <Badge variant="outline" className="text-xs">7.0%</Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="text-sm text-slate-900">Coupon Redemptions</p>
                            <p className="text-xs text-slate-600">Marketing budget</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-900">â‚¹8,900</p>
                            <Badge variant="outline" className="text-xs">4.4%</Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div>
                            <p className="text-sm text-slate-900">Total Revenue Leakage</p>
                            <p className="text-xs text-slate-600">Discounts + Returns</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-900">â‚¹18,100</p>
                            <Badge className="bg-amber-100 text-amber-900 text-xs">8.9%</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 3. Orders & Conversion */}
              <TabsContent value="orders" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-[#F5C742]" />
                      Orders & Conversion Analytics
                    </CardTitle>
                    <CardDescription>
                      Order trends, conversion rates & drop-off analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Orders Trend */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Orders Trend (COD vs Prepaid)</h4>
                      <div className="h-[250px] w-full min-h-[250px]">
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart data={ordersTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="date" stroke="#64748B" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#FFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="prepaid"
                            stackId="1"
                            stroke="#10B981"
                            fill="#10B981"
                            name="Prepaid"
                          />
                          <Area
                            type="monotone"
                            dataKey="cod"
                            stackId="1"
                            stroke="#F59E0B"
                            fill="#F59E0B"
                            name="COD"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                      </div>
                    </div>

                    <Separator />

                    {/* Conversion Metrics */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Conversion Metrics</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-blue-700">Overall Conversion</p>
                            <Target className="h-4 w-4 text-blue-600" />
                          </div>
                          <p className="text-2xl text-blue-900">4.9%</p>
                          <p className="text-xs text-blue-600 mt-1">6,140 / 125,000 visits</p>
                        </div>
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-amber-700">Cart Abandonment</p>
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          </div>
                          <p className="text-2xl text-amber-900">42.9%</p>
                          <p className="text-xs text-amber-600 mt-1">8,900 abandoned carts</p>
                        </div>
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-green-700">Checkout Success</p>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </div>
                          <p className="text-2xl text-green-900">71.9%</p>
                          <p className="text-xs text-green-600 mt-1">6,400 / 8,900 checkouts</p>
                        </div>
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-purple-700">Delivery Success</p>
                            <Truck className="h-4 w-4 text-purple-600" />
                          </div>
                          <p className="text-2xl text-purple-900">90.6%</p>
                          <p className="text-xs text-purple-600 mt-1">5,800 / 6,400 delivered</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Drop-off Analysis */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Drop-off Analysis by Step</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-slate-900">Product â†’ Cart</p>
                            <p className="text-xs text-slate-600">32,400 drop-offs</p>
                          </div>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            67.5% lost
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-slate-900">Cart â†’ Checkout</p>
                            <p className="text-xs text-slate-600">6,700 drop-offs</p>
                          </div>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            42.9% lost
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-slate-900">Checkout â†’ Payment</p>
                            <p className="text-xs text-slate-600">2,500 drop-offs</p>
                          </div>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            28.1% lost
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 4. Customers & Retention */}
              <TabsContent value="customers" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-[#F5C742]" />
                      Customer & Retention Analytics
                    </CardTitle>
                    <CardDescription>
                      Customer segmentation, LTV, RFM & churn analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Customer Segments */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Customer Segmentation by Value</h4>
                      <div className="space-y-3">
                        {customerSegmentData.map((segment, idx) => (
                          <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Award className={`h-4 w-4 ${idx === 0 ? 'text-yellow-500' : 'text-slate-400'}`} />
                                <span className="text-sm text-slate-900">{segment.segment}</span>
                              </div>
                              <Badge
                                variant="outline"
                                className={
                                  segment.risk === "Low"
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : segment.risk === "Medium"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                                }
                              >
                                {segment.risk} Risk
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <p className="text-slate-600">Customers</p>
                                <p className="text-slate-900 mt-1">{segment.customers.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Avg LTV</p>
                                <p className="text-slate-900 mt-1">â‚¹{segment.ltv.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Total Orders</p>
                                <p className="text-slate-900 mt-1">{segment.orders.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* RFM Segmentation */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">RFM Segmentation (Recency-Frequency-Monetary)</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-[180px] w-full min-h-[180px]">
                          <ResponsiveContainer width="100%" height={180}>
                            <RechartsPieChart>
                            <Pie
                              data={rfmSegmentData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={70}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {rfmSegmentData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {rfmSegmentData.map((seg, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
                                <span className="text-slate-700">{seg.name}</span>
                              </div>
                              <span className="text-slate-900">{seg.value}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Growth Engine Recommendations */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Growth Engine - Action Items</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <ThumbsUp className="h-4 w-4 text-green-600" />
                          <div className="flex-1">
                            <p className="text-sm text-green-900">342 customers likely to reorder this week</p>
                            <p className="text-xs text-green-700">Send personalized offer</p>
                          </div>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            Run Campaign
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <div className="flex-1">
                            <p className="text-sm text-amber-900">68 high-LTV customers at risk of churn</p>
                            <p className="text-xs text-amber-700">No order in 45+ days</p>
                          </div>
                          <Button size="sm" variant="outline">
                            Win-Back
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <Users className="h-4 w-4 text-blue-600" />
                          <div className="flex-1">
                            <p className="text-sm text-blue-900">Referral program ROI: 3.8x</p>
                            <p className="text-xs text-blue-700">145 referrals generated â‚¹28K revenue</p>
                          </div>
                          <Button size="sm" variant="outline">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 5. Pricing & Margin Intelligence */}
              <TabsContent value="pricing" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Percent className="h-5 w-5 text-[#F5C742]" />
                      Pricing & Margin Intelligence
                    </CardTitle>
                    <CardDescription>
                      Margin leak detection, price optimization & promotion profitability
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Margin Leak Detection */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Margin Leak Detection</h4>
                      <div className="space-y-2">
                        {marginLeakData.map((leak, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 p-3 rounded-lg ${
                              leak.severity === "high"
                                ? "bg-red-50 border border-red-200"
                                : leak.severity === "medium"
                                ? "bg-amber-50 border border-amber-200"
                                : "bg-blue-50 border border-blue-200"
                            }`}
                          >
                            <AlertTriangle
                              className={`h-4 w-4 ${
                                leak.severity === "high"
                                  ? "text-red-600"
                                  : leak.severity === "medium"
                                  ? "text-amber-600"
                                  : "text-blue-600"
                              }`}
                            />
                            <div className="flex-1">
                              <p className="text-sm text-slate-900">{leak.issue}</p>
                              <p className="text-xs text-slate-600">{leak.count} instances</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-slate-900">â‚¹{leak.leakage.toLocaleString()}</p>
                              <p className="text-xs text-slate-600">lost/month</p>
                            </div>
                            <Button size="sm" variant="outline">
                              Fix
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Total Impact */}
                    <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          <p className="text-sm text-red-900">Total Margin Leakage</p>
                        </div>
                        <Badge className="bg-red-600 text-white">Critical</Badge>
                      </div>
                      <p className="text-3xl text-red-900 mb-1">â‚¹50,400</p>
                      <p className="text-xs text-red-700">Per month Â· 27.2% of potential profit</p>
                      <Button className="mt-3 bg-red-600 hover:bg-red-700 w-full">
                        Launch Margin Recovery Program
                      </Button>
                    </div>

                    <Separator />

                    {/* Promotion Profitability */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Active Promotion Performance</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-slate-900">Weekend Flash Sale</p>
                            <p className="text-xs text-slate-600">ROI: 3.8x Â· Margin: 18.4%</p>
                          </div>
                          <Badge className="bg-green-100 text-green-800">Profitable</Badge>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            Extend
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-slate-900">20% Off Sitewide</p>
                            <p className="text-xs text-slate-600">ROI: 0.8x Â· Margin: -4.2%</p>
                          </div>
                          <Badge className="bg-red-100 text-red-800">Loss-making</Badge>
                          <Button size="sm" variant="outline" className="border-red-300 text-red-700">
                            Stop
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-slate-900">Happy Hour (6-8 PM)</p>
                            <p className="text-xs text-slate-600">ROI: 1.4x Â· Margin: 8.9%</p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800">Marginal</Badge>
                          <Button size="sm" variant="outline">
                            Optimize
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 5.5 Product Performance (SKU Intelligence Engine) */}
              <TabsContent value="products" className="space-y-4 mt-4">
                {/* Product Performance KPI Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <Card className="border-l-4 border-l-[#F5C742]">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Active SKUs</p>
                        <Box className="h-4 w-4 text-[#F5C742]" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">1,842</p>
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-green-600">+12%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Revenue SKUs</p>
                        <DollarSign className="h-4 w-4 text-blue-500" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">68%</p>
                      <p className="text-xs text-slate-500">1,253 contributing</p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Top 10 Rev%</p>
                        <Star className="h-4 w-4 text-purple-500" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">42.8%</p>
                      <p className="text-xs text-slate-500">â‚¹3.2L / â‚¹7.5L</p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Avg Margin</p>
                        <Percent className="h-4 w-4 text-green-500" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">28.4%</p>
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-green-600">+2.1%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Return Rate</p>
                        <RefreshCw className="h-4 w-4 text-red-500" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">6.8%</p>
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingDown className="h-3 w-3 text-green-600" />
                        <span className="text-green-600">-1.2%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Turnover</p>
                        <Activity className="h-4 w-4 text-amber-500" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">4.2x</p>
                      <p className="text-xs text-slate-500">86 days avg</p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">Stockout Impact</p>
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      </div>
                      <p className="text-lg text-slate-900 mb-0.5">â‚¹24.5K</p>
                      <p className="text-xs text-slate-500">Lost sales/wk</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Sub-tabs for Product Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Box className="h-5 w-5 text-[#F5C742]" />
                      Product Performance â€” SKU Intelligence Engine
                    </CardTitle>
                    <CardDescription>
                      Which products are winning or hurting your Storefront?
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="top-bottom" className="space-y-4">
                      <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9 gap-1">
                        <TabsTrigger value="top-bottom" className="text-xs px-1">Top/Bottom</TabsTrigger>
                        <TabsTrigger value="profitability" className="text-xs px-1">Profitability</TabsTrigger>
                        <TabsTrigger value="conversion" className="text-xs px-1">Conversion</TabsTrigger>
                        <TabsTrigger value="returns" className="text-xs px-1">Returns</TabsTrigger>
                        <TabsTrigger value="velocity" className="text-xs px-1">Velocity</TabsTrigger>
                        <TabsTrigger value="pricing" className="text-xs px-1">Price Sens</TabsTrigger>
                        <TabsTrigger value="promotions" className="text-xs px-1">Promos</TabsTrigger>
                        <TabsTrigger value="affinity" className="text-xs px-1">Affinity</TabsTrigger>
                        <TabsTrigger value="lifecycle" className="text-xs px-1">Lifecycle</TabsTrigger>
                      </TabsList>

                      {/* Top & Bottom Performers */}
                      <TabsContent value="top-bottom" className="space-y-4">
                        {/* Top Performers */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm text-slate-900 flex items-center gap-2">
                              <Star className="h-4 w-4 text-green-600" />
                              Top 5 Performers â€” Revenue Heroes
                            </h4>
                            <Badge className="bg-green-100 text-green-800">
                              â‚¹1.95L Total
                            </Badge>
                          </div>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                  <tr>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">SKU</th>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">Product</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Revenue</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Units</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Margin %</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Conv %</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Returns %</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Stock</th>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">Status</th>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {topPerformersData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 text-xs font-mono text-slate-900">{item.sku}</td>
                                      <td className="px-3 py-2 text-xs text-slate-900">{item.product}</td>
                                      <td className="px-3 py-2 text-xs text-right text-slate-900">â‚¹{item.revenue.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-xs text-right text-slate-600">{item.units}</td>
                                      <td className="px-3 py-2 text-xs text-right">
                                        <span className="text-green-700 font-medium">{item.margin}%</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right">
                                        <span className="text-blue-700">{item.conversion}%</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right">
                                        <span className="text-green-700">{item.returns}%</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right text-slate-600">{item.stock}</td>
                                      <td className="px-3 py-2">
                                        <Badge className={item.status === "In Stock" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                                          {item.status}
                                        </Badge>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                                            Promote
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                            <Eye className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Bottom Performers */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm text-slate-900 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              Bottom 5 Performers â€” Fix or Kill
                            </h4>
                            <Badge className="bg-red-100 text-red-800">
                              Issues Detected
                            </Badge>
                          </div>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                  <tr>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">SKU</th>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">Product</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Revenue</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Units</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Margin %</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Conv %</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Returns %</th>
                                    <th className="text-right text-xs font-medium text-slate-600 px-3 py-2">Stock</th>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">Issue</th>
                                    <th className="text-left text-xs font-medium text-slate-600 px-3 py-2">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {bottomPerformersData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 text-xs font-mono text-slate-900">{item.sku}</td>
                                      <td className="px-3 py-2 text-xs text-slate-900">{item.product}</td>
                                      <td className="px-3 py-2 text-xs text-right text-slate-900">â‚¹{item.revenue.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-xs text-right text-slate-600">{item.units}</td>
                                      <td className="px-3 py-2 text-xs text-right">
                                        <span className={item.margin < 0 ? "text-red-700 font-medium" : "text-amber-700"}>{item.margin}%</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right">
                                        <span className="text-red-700">{item.conversion}%</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right">
                                        <span className="text-red-700 font-medium">{item.returns}%</span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right text-slate-600">{item.stock}</td>
                                      <td className="px-3 py-2">
                                        <Badge className="bg-red-100 text-red-800">
                                          {item.issue}
                                        </Badge>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-red-300 text-red-700">
                                            Fix
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600">
                                            <XCircle className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      {/* SKU Profitability */}
                      <TabsContent value="profitability" className="space-y-4">
                        <div>
                          <h4 className="text-sm text-slate-900 mb-3">SKU Margin Distribution (Last 6 Months)</h4>
                          <div className="h-[280px] w-full min-h-[280px]">
                            <ResponsiveContainer width="100%" height={280}>
                              <AreaChart data={skuProfitabilityData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                <XAxis dataKey="month" stroke="#64748B" style={{ fontSize: '12px' }} />
                                <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#FFF',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                  }}
                                />
                                <Legend />
                                <Area
                                  type="monotone"
                                  dataKey="highMargin"
                                  stackId="1"
                                  stroke="#10B981"
                                  fill="#10B981"
                                  fillOpacity={0.8}
                                  name="High Margin (>30%)"
                                />
                                <Area
                                  type="monotone"
                                  dataKey="mediumMargin"
                                  stackId="1"
                                  stroke="#F5C742"
                                  fill="#F5C742"
                                  fillOpacity={0.8}
                                  name="Medium Margin (15-30%)"
                                />
                                <Area
                                  type="monotone"
                                  dataKey="lowMargin"
                                  stackId="1"
                                  stroke="#F59E0B"
                                  fill="#F59E0B"
                                  fillOpacity={0.8}
                                  name="Low Margin (0-15%)"
                                />
                                <Area
                                  type="monotone"
                                  dataKey="negative"
                                  stackId="1"
                                  stroke="#EF4444"
                                  fill="#EF4444"
                                  fillOpacity={0.8}
                                  name="Negative Margin"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-green-700">High Margin SKUs</p>
                              <ArrowUpRight className="h-4 w-4 text-green-600" />
                            </div>
                            <p className="text-2xl text-green-900 mb-1">218</p>
                            <p className="text-xs text-green-600">Contributing â‚¹4.2L (56% of revenue)</p>
                          </div>
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-red-700">Negative Margin SKUs</p>
                              <ArrowDownRight className="h-4 w-4 text-red-600" />
                            </div>
                            <p className="text-2xl text-red-900 mb-1">6</p>
                            <p className="text-xs text-red-600">Losing â‚¹18.5K/month â€” Action needed</p>
                          </div>
                        </div>
                      </TabsContent>

                      {/* Conversion & Funnel */}
                      <TabsContent value="conversion" className="space-y-4">
                        <ProductPerformanceConversion />
                      </TabsContent>

                      {/* Returns & Quality */}
                      <TabsContent value="returns" className="space-y-4">
                        <ProductPerformanceReturns />
                      </TabsContent>

                      {/* Inventory Velocity */}
                      <TabsContent value="velocity" className="space-y-4">
                        <div>
                          <h4 className="text-sm text-slate-900 mb-3">Product Lifecycle Distribution</h4>
                          <div className="space-y-2">
                            {productLifecycleData.map((stage, idx) => (
                              <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                <div className="flex-1">
                                  <p className="text-sm text-slate-900">{stage.stage}</p>
                                  <p className="text-xs text-slate-600">{stage.count} SKUs Â· Avg Margin: {stage.avgMargin}%</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-slate-900">â‚¹{(stage.revenue / 1000).toFixed(1)}K</p>
                                  <p className="text-xs text-slate-600">Revenue</p>
                                </div>
                                <div className="w-24">
                                  <Progress value={(stage.revenue / 4456) * 100} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                            <p className="text-sm text-amber-900">Dead Stock Alert</p>
                          </div>
                          <p className="text-xs text-amber-700">67 SKUs (2+ years old) generating only â‚¹8.2K revenue</p>
                          <Button size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700 w-full">
                            Launch Clearance Campaign
                          </Button>
                        </div>
                      </TabsContent>

                      {/* Price Sensitivity */}
                      <TabsContent value="pricing" className="space-y-4">
                        <ProductPerformancePriceSense />
                      </TabsContent>

                      {/* Promotion Impact */}
                      <TabsContent value="promotions" className="space-y-4">
                        <ProductPerformancePromos />
                      </TabsContent>

                      {/* Customer Affinity */}
                      <TabsContent value="affinity" className="space-y-4">
                        <ProductPerformanceAffinity />
                      </TabsContent>

                      {/* Lifecycle */}
                      <TabsContent value="lifecycle" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          {productLifecycleData.map((stage, idx) => (
                            <div key={idx} className="p-4 border rounded-lg">
                              <p className="text-xs text-slate-600 mb-2">{stage.stage}</p>
                              <p className="text-2xl text-slate-900 mb-1">{stage.count}</p>
                              <div className="text-xs text-slate-600">
                                <div>Revenue: â‚¹{(stage.revenue / 1000).toFixed(1)}K</div>
                                <div>Avg Margin: {stage.avgMargin}%</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 6. Inventory & Fulfillment Analytics */}
              <TabsContent value="inventory" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-[#F5C742]" />
                      Inventory & Fulfillment Analytics
                    </CardTitle>
                    <CardDescription>
                      Stock availability, order-to-ship time & fulfillment accuracy
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-green-700">Stock Availability</p>
                          <Package className="h-4 w-4 text-green-600" />
                        </div>
                        <p className="text-2xl text-green-900">96.8%</p>
                        <p className="text-xs text-green-600 mt-1">1,842 / 1,904 SKUs in stock</p>
                      </div>
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-blue-700">Avg Order-to-Ship</p>
                          <Clock className="h-4 w-4 text-blue-600" />
                        </div>
                        <p className="text-2xl text-blue-900">14.2h</p>
                        <p className="text-xs text-blue-600 mt-1">Target: &lt;16h</p>
                      </div>
                      <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-purple-700">Fulfillment Accuracy</p>
                          <CheckCircle2 className="h-4 w-4 text-purple-600" />
                        </div>
                        <p className="text-2xl text-purple-900">97.4%</p>
                        <p className="text-xs text-purple-600 mt-1">5,980 / 6,140 correct</p>
                      </div>
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-amber-700">Backorders</p>
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </div>
                        <p className="text-2xl text-amber-900">142</p>
                        <p className="text-xs text-amber-600 mt-1">2.3% of total orders</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Best Branch for Fulfillment */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Best Branch to Fulfill Online Orders</h4>
                      <div className="space-y-2">
                        {branchFulfillmentData
                          .sort((a, b) => b.onTime - a.onTime)
                          .map((branch, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#F5C742] text-slate-900">
                                {idx + 1}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm text-slate-900">{branch.branch}</p>
                                <p className="text-xs text-slate-600">{branch.orders} orders Â· {branch.avgTime} avg</p>
                              </div>
                              <div className="w-24 text-right">
                                <p className="text-sm text-slate-900">{branch.onTime}%</p>
                                <Progress value={branch.onTime} className="mt-1" />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Stockout Impact */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Stockout Impact on Sales</h4>
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          <p className="text-sm text-red-900">Out-of-Stock Products</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="text-red-700">SKUs Out of Stock</p>
                            <p className="text-lg text-red-900 mt-1">62</p>
                          </div>
                          <div>
                            <p className="text-red-700">Lost Visits</p>
                            <p className="text-lg text-red-900 mt-1">2,840</p>
                          </div>
                          <div>
                            <p className="text-red-700">Est. Lost Revenue</p>
                            <p className="text-lg text-red-900 mt-1">â‚¹84K</p>
                          </div>
                        </div>
                        <Button className="mt-3 bg-red-600 hover:bg-red-700 w-full" size="sm">
                          View Critical Stockouts
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 7. Payments & Cashflow */}
              <TabsContent value="payments" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-[#F5C742]" />
                      Payments & Cashflow Analytics
                    </CardTitle>
                    <CardDescription>
                      Gateway settlements, COD outstanding & refund pipeline
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Payment Flow Summary */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Payment Gateway Settlement Status</h4>
                      <div className="space-y-3">
                        {paymentFlowData.map((gateway, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm text-slate-900">{gateway.gateway}</p>
                              <Badge variant="outline">
                                {((gateway.settled / gateway.collected) * 100).toFixed(1)}% settled
                              </Badge>
                            </div>
                            <div className="grid grid-cols-4 gap-3 text-xs">
                              <div>
                                <p className="text-slate-600">Collected</p>
                                <p className="text-slate-900 mt-1">â‚¹{(gateway.collected / 1000).toFixed(0)}K</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Settled</p>
                                <p className="text-green-700 mt-1">â‚¹{(gateway.settled / 1000).toFixed(0)}K</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Pending</p>
                                <p className="text-amber-700 mt-1">â‚¹{(gateway.pending / 1000).toFixed(0)}K</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Fees</p>
                                <p className="text-red-700 mt-1">â‚¹{(gateway.fees / 1000).toFixed(1)}K</p>
                              </div>
                            </div>
                            <Progress
                              value={(gateway.settled / gateway.collected) * 100}
                              className="mt-3"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Cash Flow Forecast */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">7-Day Cashflow Forecast</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-green-700">Expected Cash In</p>
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          </div>
                          <p className="text-2xl text-green-900">â‚¹3.45L</p>
                          <div className="mt-2 text-xs text-green-700 space-y-1">
                            <div className="flex justify-between">
                              <span>Gateway settlements</span>
                              <span>â‚¹2.18L</span>
                            </div>
                            <div className="flex justify-between">
                              <span>COD collections</span>
                              <span>â‚¹1.27L</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-red-700">Expected Cash Out</p>
                            <ArrowDown className="h-4 w-4 text-red-600" />
                          </div>
                          <p className="text-2xl text-red-900">â‚¹1.82L</p>
                          <div className="mt-2 text-xs text-red-700 space-y-1">
                            <div className="flex justify-between">
                              <span>Refunds pipeline</span>
                              <span>â‚¹0.64L</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Gateway fees</span>
                              <span>â‚¹0.18L</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Other</span>
                              <span>â‚¹1.00L</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-blue-900">Net Cash Position (7 days)</p>
                          <p className="text-xl text-blue-900">+â‚¹1.63L</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Refund Pipeline */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Refund Pipeline</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                          <div>
                            <p className="text-sm text-slate-900">Pending Refunds</p>
                            <p className="text-xs text-slate-600">142 transactions</p>
                          </div>
                          <p className="text-sm text-slate-900">â‚¹64,200</p>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                          <div>
                            <p className="text-sm text-slate-900">Processed (Last 7 days)</p>
                            <p className="text-xs text-slate-600">289 transactions</p>
                          </div>
                          <p className="text-sm text-slate-900">â‚¹1.18L</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 8. Marketing & Promotions */}
              <TabsContent value="marketing" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Megaphone className="h-5 w-5 text-[#F5C742]" />
                      Marketing & Promotions Analytics
                    </CardTitle>
                    <CardDescription>
                      Campaign ROI, coupon usage & customer acquisition cost
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Campaign ROI */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Campaign Performance & ROI</h4>
                      <div className="space-y-2">
                        {campaignROIData.map((campaign, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex-1">
                                <p className="text-sm text-slate-900">{campaign.campaign}</p>
                                <p className="text-xs text-slate-600">{campaign.orders} orders</p>
                              </div>
                              <Badge
                                className={
                                  campaign.roi >= 300
                                    ? "bg-green-100 text-green-800"
                                    : campaign.roi >= 150
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-amber-100 text-amber-800"
                                }
                              >
                                ROI: {campaign.roi}%
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <p className="text-slate-600">Spent</p>
                                <p className="text-red-700 mt-1">â‚¹{(campaign.spent / 1000).toFixed(1)}K</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Revenue</p>
                                <p className="text-green-700 mt-1">â‚¹{(campaign.revenue / 1000).toFixed(0)}K</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Profit</p>
                                <p className="text-slate-900 mt-1">
                                  â‚¹{((campaign.revenue - campaign.spent) / 1000).toFixed(1)}K
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              {campaign.roi >= 200 ? (
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-1">
                                  Scale Up
                                </Button>
                              ) : campaign.roi >= 100 ? (
                                <Button size="sm" variant="outline" className="flex-1">
                                  Optimize
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="border-red-300 text-red-700 flex-1">
                                  Review/Stop
                                </Button>
                              )}
                              <Button size="sm" variant="outline">
                                Details
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Customer Acquisition */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Customer Acquisition Metrics</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-700 mb-1">CAC (Paid)</p>
                          <p className="text-xl text-blue-900">â‚¹842</p>
                          <p className="text-xs text-blue-600 mt-1">Per new customer</p>
                        </div>
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs text-green-700 mb-1">CAC (Organic)</p>
                          <p className="text-xl text-green-900">â‚¹124</p>
                          <p className="text-xs text-green-600 mt-1">Per new customer</p>
                        </div>
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                          <p className="text-xs text-purple-700 mb-1">LTV:CAC Ratio</p>
                          <p className="text-xl text-purple-900">3.8x</p>
                          <p className="text-xs text-purple-600 mt-1">Healthy (Target: 3x+)</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Smart Suggestions */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">AI Marketing Suggestions</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <Zap className="h-4 w-4 text-green-600" />
                          <div className="flex-1">
                            <p className="text-sm text-green-900">Boost "Cart Recovery" campaign</p>
                            <p className="text-xs text-green-700">471% ROI - highest performer</p>
                          </div>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            Increase Budget
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <Target className="h-4 w-4 text-amber-600" />
                          <div className="flex-1">
                            <p className="text-sm text-amber-900">Personalize offers for "Fashion" category</p>
                            <p className="text-xs text-amber-700">28.3% margin - room to incentivize</p>
                          </div>
                          <Button size="sm" variant="outline">
                            Create
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 9. Risk & Fraud Analytics */}
              <TabsContent value="risk" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-[#F5C742]" />
                      Risk & Fraud Analytics
                    </CardTitle>
                    <CardDescription>
                      COD failures, duplicate detection & fraud score monitoring
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Risk Alerts */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Active Risk Alerts</h4>
                      <div className="space-y-2">
                        {riskAlertsData.map((alert, idx) => (
                          <div key={idx} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <p className="text-sm text-red-900">{alert.type}</p>
                              </div>
                              <Badge className="bg-red-100 text-red-800">{alert.count} cases</Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-red-700">Exposure: â‚¹{alert.amount.toLocaleString()}</span>
                              <Button size="sm" variant="outline" className="border-red-300 text-red-700">
                                {alert.action}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* COD Risk Breakdown */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">COD Risk Breakdown</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-amber-700">COD Failure Rate</p>
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          </div>
                          <p className="text-2xl text-amber-900">8.9%</p>
                          <p className="text-xs text-amber-600 mt-1">142 / 1,596 COD orders</p>
                        </div>
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-red-700">Outstanding COD</p>
                            <DollarSign className="h-4 w-4 text-red-600" />
                          </div>
                          <p className="text-2xl text-red-900">â‚¹1.42L</p>
                          <p className="text-xs text-red-600 mt-1">Not yet collected</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Fraud Controls */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Auto-Block Rules Status</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <div>
                              <p className="text-sm text-slate-900">Velocity Limit</p>
                              <p className="text-xs text-slate-600">Max 3 orders/day per customer</p>
                            </div>
                          </div>
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <div>
                              <p className="text-sm text-slate-900">High-Value Review</p>
                              <p className="text-xs text-slate-600">Orders &gt; â‚¹10,000 require approval</p>
                            </div>
                          </div>
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <div>
                              <p className="text-sm text-slate-900">Duplicate IP Block</p>
                              <p className="text-xs text-slate-600">Flag multiple accounts from same IP</p>
                            </div>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800">Review Queue</Badge>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Manual Review Queue */}
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Eye className="h-5 w-5 text-amber-600" />
                          <p className="text-sm text-amber-900">Manual Review Queue</p>
                        </div>
                        <Badge className="bg-amber-600 text-white">24 pending</Badge>
                      </div>
                      <p className="text-xs text-amber-700 mb-3">High-value or suspicious orders awaiting approval</p>
                      <Button className="bg-amber-600 hover:bg-amber-700 w-full">
                        Review Orders
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 10. Forecasts & AI Insights */}
              <TabsContent value="forecasts" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-[#F5C742]" />
                      Forecasts & AI Insights
                    </CardTitle>
                    <CardDescription>
                      Predictive analytics & actionable intelligence
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Demand Forecast */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">3-Week Demand Forecast</h4>
                      <div className="h-[250px] w-full min-h-[250px]">
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={demandForecastData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="week" stroke="#64748B" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#FFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            name="Actual Orders"
                            dot={{ fill: '#3B82F6', r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="forecast"
                            stroke="#F5C742"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            name="Forecast"
                            dot={{ fill: '#F5C742', r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-slate-600 mt-2">
                        AI Confidence: 87% Â· Based on historical trends, seasonality & external factors
                      </p>
                    </div>

                    <Separator />

                    {/* AI Insights - Actionable */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">AI-Powered Action Items</h4>
                      <div className="space-y-3">
                        {aiInsights.map((insight, idx) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-lg border-2 ${
                              insight.severity === "high"
                                ? "bg-red-50 border-red-300"
                                : "bg-amber-50 border-amber-300"
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-start gap-2">
                                <AlertTriangle
                                  className={`h-5 w-5 mt-0.5 ${
                                    insight.severity === "high" ? "text-red-600" : "text-amber-600"
                                  }`}
                                />
                                <div>
                                  <p
                                    className={`text-sm ${
                                      insight.severity === "high" ? "text-red-900" : "text-amber-900"
                                    }`}
                                  >
                                    {insight.title}
                                  </p>
                                  <p
                                    className={`text-xs mt-1 ${
                                      insight.severity === "high" ? "text-red-700" : "text-amber-700"
                                    }`}
                                  >
                                    {insight.description}
                                  </p>
                                </div>
                              </div>
                              <Badge
                                className={
                                  insight.severity === "high"
                                    ? "bg-red-600 text-white"
                                    : "bg-amber-600 text-white"
                                }
                              >
                                {insight.severity === "high" ? "Critical" : "Warning"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-red-200">
                              <div className="text-xs">
                                <span
                                  className={insight.severity === "high" ? "text-red-700" : "text-amber-700"}
                                >
                                  Impact:{" "}
                                </span>
                                <span
                                  className={insight.severity === "high" ? "text-red-900" : "text-amber-900"}
                                >
                                  {insight.impact}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                className={
                                  insight.severity === "high"
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-amber-600 hover:bg-amber-700"
                                }
                              >
                                {insight.action}
                                <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Predictive Metrics */}
                    <div>
                      <h4 className="text-sm text-slate-900 mb-3">Predictive Metrics (Next 30 Days)</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-700 mb-1">Revenue Projection</p>
                          <p className="text-xl text-blue-900">â‚¹5.8L - â‚¹6.4L</p>
                          <p className="text-xs text-blue-600 mt-1">87% confidence</p>
                        </div>
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs text-green-700 mb-1">Order Forecast</p>
                          <p className="text-xl text-green-900">18,400 - 20,200</p>
                          <p className="text-xs text-green-600 mt-1">84% confidence</p>
                        </div>
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-700 mb-1">Churn Risk</p>
                          <p className="text-xl text-amber-900">124 customers</p>
                          <p className="text-xs text-amber-600 mt-1">78% probability</p>
                        </div>
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                          <p className="text-xs text-purple-700 mb-1">Inventory Depletion</p>
                          <p className="text-xl text-purple-900">18 SKUs</p>
                          <p className="text-xs text-purple-600 mt-1">In next 14 days</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Insights & Actions Panel (Sticky Right) */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <Card className="border-2 border-[#F5C742]">
                <CardHeader className="bg-[#F5C742]/10">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="h-5 w-5 text-[#F5C742]" />
                    Priority Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <p className="text-xs text-red-900">Margin Leak Alert</p>
                    </div>
                    <p className="text-sm text-red-900 mb-2">â‚¹50.4K/month margin loss</p>
                    <Button size="sm" className="w-full bg-red-600 hover:bg-red-700 text-xs">
                      Fix Now
                    </Button>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <p className="text-xs text-amber-900">Churn Risk</p>
                    </div>
                    <p className="text-sm text-amber-900 mb-2">68 high-LTV at risk</p>
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      Win-Back Campaign
                    </Button>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <p className="text-xs text-blue-900">Growth Opportunity</p>
                    </div>
                    <p className="text-sm text-blue-900 mb-2">342 likely to reorder</p>
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      Send Offer
                    </Button>
                  </div>

                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <p className="text-xs text-green-900">Top Performer</p>
                    </div>
                    <p className="text-sm text-green-900 mb-2">Cart Recovery: 471% ROI</p>
                    <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-xs">
                      Scale Up
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Export Full Report
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Bell className="h-4 w-4 mr-2" />
                    Configure Alerts
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Layers className="h-4 w-4 mr-2" />
                    Custom Dashboard
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Report
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Health Score</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-100 border-4 border-green-500 mb-2">
                      <span className="text-3xl text-green-900">84</span>
                    </div>
                    <p className="text-sm text-slate-600">Overall Storefront Health</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Revenue Growth</span>
                      <span className="text-green-700">Excellent</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Conversion Rate</span>
                      <span className="text-amber-700">Fair</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Customer Retention</span>
                      <span className="text-green-700">Good</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Margin Health</span>
                      <span className="text-red-700">Needs Attention</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fulfillment</span>
                      <span className="text-green-700">Excellent</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

