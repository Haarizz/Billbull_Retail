import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  BarChart3, TrendingUp, TrendingDown, Download, Calendar, Filter,
  AlertTriangle, CheckCircle2, Clock, XCircle, DollarSign, Package,
  Truck, FileText, Users, Building2, Target, Award, ShieldAlert,
  Activity, Zap, Brain, ChevronRight, ArrowUpRight, ArrowDownRight,
  Star, PackageX, RefreshCw, Scale, Lightbulb, Eye, Search
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { toast } from 'sonner';

// Sample data for charts
const procurementFunnelData = [
  { stage: 'LPO', count: 245, value: 2450000, avgCycle: 2.3 },
  { stage: 'Delivery', count: 238, value: 2380000, avgCycle: 5.1 },
  { stage: 'GRN', count: 235, value: 2340000, avgCycle: 1.2 },
  { stage: 'Invoice', count: 232, value: 2320000, avgCycle: 3.4 },
  { stage: 'Payment', count: 210, value: 2100000, avgCycle: 28.5 }
];

const spendByVendorData = [
  { vendor: 'Global Supplies LLC', spend: 485000, percentage: 22.5 },
  { vendor: 'Tech Solutions Ltd', spend: 420000, percentage: 19.5 },
  { vendor: 'Metro Traders', spend: 380000, percentage: 17.6 },
  { vendor: 'Prime Distributors', spend: 340000, percentage: 15.8 },
  { vendor: 'Elite Commerce', spend: 290000, percentage: 13.5 },
  { vendor: 'Others', spend: 240000, percentage: 11.1 }
];

const vendorPerformanceData = [
  { 
    vendor: 'Global Supplies LLC', 
    spend: 485000, 
    onTime: 94, 
    returnRate: 1.2, 
    costChange: 2.3, 
    claimRate: 0.8,
    rating: 4.5,
    deliveryScore: 92,
    qualityScore: 88,
    priceScore: 85,
    responseScore: 90
  },
  { 
    vendor: 'Tech Solutions Ltd', 
    spend: 420000, 
    onTime: 88, 
    returnRate: 2.8, 
    costChange: -1.5, 
    claimRate: 1.5,
    rating: 4.2,
    deliveryScore: 85,
    qualityScore: 82,
    priceScore: 92,
    responseScore: 88
  },
  { 
    vendor: 'Metro Traders', 
    spend: 380000, 
    onTime: 92, 
    returnRate: 1.5, 
    costChange: 3.8, 
    claimRate: 1.0,
    rating: 4.3,
    deliveryScore: 90,
    qualityScore: 86,
    priceScore: 78,
    responseScore: 85
  },
  { 
    vendor: 'Prime Distributors', 
    spend: 340000, 
    onTime: 76, 
    returnRate: 4.2, 
    costChange: 1.2, 
    claimRate: 2.8,
    rating: 3.5,
    deliveryScore: 72,
    qualityScore: 68,
    priceScore: 88,
    responseScore: 75
  }
];

const monthlyTrendData = [
  { month: 'Jul', purchases: 1850000, returns: 28000, claims: 15000 },
  { month: 'Aug', purchases: 1920000, returns: 32000, claims: 18000 },
  { month: 'Sep', purchases: 2050000, returns: 35000, claims: 22000 },
  { month: 'Oct', purchases: 2180000, returns: 38000, claims: 20000 },
  { month: 'Nov', purchases: 2320000, returns: 42000, claims: 25000 },
  { month: 'Dec', purchases: 2450000, returns: 45000, claims: 28000 }
];

const deliveryPerformanceData = [
  { range: 'On-time', count: 168, percentage: 70.6 },
  { range: '1-2 days late', count: 42, percentage: 17.6 },
  { range: '3-5 days late', count: 18, percentage: 7.6 },
  { range: '6-10 days late', count: 7, percentage: 2.9 },
  { range: '>10 days late', count: 3, percentage: 1.3 }
];

const returnReasonData = [
  { reason: 'Damaged', value: 42, color: '#EF4444' },
  { reason: 'Expired', value: 28, color: '#F59E0B' },
  { reason: 'Wrong Item', value: 18, color: '#3B82F6' },
  { reason: 'Quality Issue', value: 8, color: '#8B5CF6' },
  { reason: 'Other', value: 4, color: '#6B7280' }
];

const apAgingData = [
  { range: '0-30 days', amount: 485000, percentage: 45.2 },
  { range: '31-60 days', amount: 320000, percentage: 29.8 },
  { range: '61-90 days', amount: 180000, percentage: 16.8 },
  { range: '90+ days', amount: 88000, percentage: 8.2 }
];

const costVolatilityData = [
  { category: 'Electronics', volatility: 8.5, trend: 'up' },
  { category: 'Food & Beverages', volatility: 12.3, trend: 'up' },
  { category: 'Apparel', volatility: 4.2, trend: 'down' },
  { category: 'Home & Garden', volatility: 6.8, trend: 'up' },
  { category: 'Health & Beauty', volatility: 3.5, trend: 'stable' }
];

const COLORS = ['#F5C742', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export function VendorsPurchasesAnalytics() {
  const [activeTab, setActiveTab] = useState('executive');
  const [dateRange, setDateRange] = useState('this-month');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [viewMode, setViewMode] = useState('standard'); // standard | board

  // KPI calculations
  const totalPurchaseValue = 2450000;
  const totalVendors = 24;
  const onTimeDeliveryPercent = 88.5;
  const grnVariancePercent = 2.3;
  const returnRatePercent = 1.8;
  const debitNotesValue = 125000;
  const avgCostIncrease = 2.1;
  const outstandingPayables = 1073000;

  const handleExport = () => {
    toast.success('Exporting analytics report...');
  };

  const handleSaveView = () => {
    toast.success('Custom view saved');
  };

  const getPerformanceColor = (value: number, threshold: number, inverse = false) => {
    if (inverse) {
      return value <= threshold ? 'text-emerald-600' : value <= threshold * 1.5 ? 'text-amber-600' : 'text-red-600';
    }
    return value >= threshold ? 'text-emerald-600' : value >= threshold * 0.8 ? 'text-amber-600' : 'text-red-600';
  };

  const renderStarRating = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
          />
        ))}
        <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA]">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-[#1E293B]" />
                <h1 className="text-2xl font-bold text-[#1E293B]">Vendors & Purchases Analytics</h1>
              </div>
              <p className="text-sm text-slate-600 mt-1">Vendor performance, procurement efficiency, logistics quality & financial health</p>
              <div className="text-xs text-slate-500 mt-1">
                Vendors & Purchases â†’ <span className="text-slate-700 font-medium">Analytics</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[160px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="qtd">Quarter to Date</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-[160px]">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  <SelectItem value="main">Main Branch</SelectItem>
                  <SelectItem value="dubai">Dubai Branch</SelectItem>
                  <SelectItem value="abudhabi">Abu Dhabi</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleSaveView}>
                Save View
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Select value={viewMode} onValueChange={setViewMode}>
                <SelectTrigger className="w-[140px]">
                  <Eye className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard View</SelectItem>
                  <SelectItem value="board">Board View</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Executive KPI Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <DollarSign className="h-4 w-4 text-slate-500" />
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-600">Total Purchase</p>
                  <p className="text-lg font-bold text-[#1E293B]">AED {(totalPurchaseValue / 1000000).toFixed(2)}M</p>
                  <p className="text-xs text-emerald-600">+12.5% vs last month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Users className="h-4 w-4 text-slate-500" />
                  <Badge className="bg-blue-100 text-blue-700 text-xs">Active</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Total Vendors</p>
                  <p className="text-lg font-bold text-[#1E293B]">{totalVendors}</p>
                  <p className="text-xs text-slate-500">18 high performers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Truck className="h-4 w-4 text-slate-500" />
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-600">On-time Delivery</p>
                  <p className="text-lg font-bold text-emerald-600">{onTimeDeliveryPercent}%</p>
                  <p className="text-xs text-slate-500">Target: 85%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Package className="h-4 w-4 text-slate-500" />
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-600">GRN Variance</p>
                  <p className="text-lg font-bold text-amber-600">{grnVariancePercent}%</p>
                  <p className="text-xs text-slate-500">Target: &lt;2%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <RefreshCw className="h-4 w-4 text-slate-500" />
                  <XCircle className="h-3 w-3 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-600">Return Rate</p>
                  <p className="text-lg font-bold text-red-600">{returnRatePercent}%</p>
                  <p className="text-xs text-slate-500">Target: &lt;1.5%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <Badge className="bg-amber-100 text-amber-700 text-xs">Claims</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Debit Notes</p>
                  <p className="text-lg font-bold text-[#1E293B]">AED {(debitNotesValue / 1000).toFixed(0)}K</p>
                  <p className="text-xs text-amber-600">15 pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <TrendingUp className="h-4 w-4 text-slate-500" />
                  <ArrowUpRight className="h-3 w-3 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-600">Avg Cost â†‘</p>
                  <p className="text-lg font-bold text-red-600">+{avgCostIncrease}%</p>
                  <p className="text-xs text-slate-500">vs last quarter</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <Badge className="bg-red-100 text-red-700 text-xs">Aging</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Outstanding AP</p>
                  <p className="text-lg font-bold text-[#1E293B]">AED {(outstandingPayables / 1000000).toFixed(2)}M</p>
                  <p className="text-xs text-red-600">8.2% overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border-slate-200 flex-wrap h-auto">
            <TabsTrigger value="executive">Executive Overview</TabsTrigger>
            <TabsTrigger value="vendor">Vendor Performance</TabsTrigger>
            <TabsTrigger value="lpo">LPO Performance</TabsTrigger>
            <TabsTrigger value="delivery">Delivery Performance</TabsTrigger>
            <TabsTrigger value="grn">GRN Performance</TabsTrigger>
            <TabsTrigger value="invoice">Invoice Performance</TabsTrigger>
            <TabsTrigger value="grv">GRV & Claims</TabsTrigger>
            <TabsTrigger value="payments">Payments & AP</TabsTrigger>
            <TabsTrigger value="cost">Cost & Margin</TabsTrigger>
            <TabsTrigger value="risk">Risk & SLA</TabsTrigger>
            <TabsTrigger value="predictive">
              <Brain className="h-4 w-4 mr-1" />
              Predictive
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Executive Overview */}
          <TabsContent value="executive" className="space-y-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Procurement Funnel */}
              <div className="col-span-4">
                <Card className="border-slate-200 shadow-sm h-full">
                  <CardHeader>
                    <CardTitle className="text-[#1E293B] flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Procurement Funnel
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {procurementFunnelData.map((stage, index) => (
                        <div key={stage.stage}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold`}
                                   style={{ backgroundColor: COLORS[index] }}>
                                {stage.count}
                              </div>
                              <span className="font-medium text-[#1E293B]">{stage.stage}</span>
                            </div>
                            <span className="text-sm text-slate-600">
                              AED {(stage.value / 1000000).toFixed(2)}M
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Clock className="h-3 w-3" />
                            <span>Avg: {stage.avgCycle} days</span>
                          </div>
                          {index < procurementFunnelData.length - 1 && (
                            <div className="flex items-center gap-2 mt-2">
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                              <div className="h-px flex-1 bg-slate-200" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Spend Distribution */}
              <div className="col-span-4">
                <Card className="border-slate-200 shadow-sm h-full">
                  <CardHeader>
                    <CardTitle className="text-[#1E293B] flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Spend Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={spendByVendorData}
                          dataKey="spend"
                          nameKey="vendor"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={(entry) => `${entry.percentage}%`}
                        >
                          {spendByVendorData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2">
                      {spendByVendorData.map((item, index) => (
                        <div key={item.vendor} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[index] }} />
                            <span className="text-slate-700">{item.vendor}</span>
                          </div>
                          <span className="font-medium text-[#1E293B]">AED {(item.spend / 1000).toFixed(0)}K</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Operational Health */}
              <div className="col-span-4">
                <Card className="border-slate-200 shadow-sm h-full">
                  <CardHeader>
                    <CardTitle className="text-[#1E293B] flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Operational Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-700">Late Deliveries</span>
                          <span className="text-sm font-medium text-amber-600">11.5%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-amber-500 h-2 rounded-full" style={{ width: '11.5%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-700">Partial Deliveries</span>
                          <span className="text-sm font-medium text-blue-600">8.3%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: '8.3%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-700">QC Failure Rate</span>
                          <span className="text-sm font-medium text-red-600">2.3%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-red-500 h-2 rounded-full" style={{ width: '2.3%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-700">Claims Pending</span>
                          <span className="text-sm font-medium text-purple-600">6.2%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-purple-500 h-2 rounded-full" style={{ width: '6.2%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-700">Payment Overdue</span>
                          <span className="text-sm font-medium text-red-600">8.2%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-red-500 h-2 rounded-full" style={{ width: '8.2%' }} />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700 font-medium">Overall Health: Good</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        3 areas need attention
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Monthly Trends */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyTrendData}>
                    <defs>
                      <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F5C742" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#F5C742" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorReturns" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" stroke="#64748B" />
                    <YAxis stroke="#64748B" />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="purchases" stroke="#F5C742" fillOpacity={1} fill="url(#colorPurchases)" name="Purchases" />
                    <Area type="monotone" dataKey="returns" stroke="#EF4444" fillOpacity={1} fill="url(#colorReturns)" name="Returns" />
                    <Area type="monotone" dataKey="claims" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} name="Claims" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Smart Insights */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <Brain className="h-5 w-5 text-indigo-600" />
                  Smart Insights & Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-indigo-200">
                  <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-[#1E293B]">Cost Optimization Opportunity</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Prime Distributors has 76% on-time delivery rate. Consider switching Electronics category to Global Supplies LLC (94% on-time) to save estimated AED 12,500/month.
                    </p>
                    <Button size="sm" className="mt-2 text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                      View Analysis
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-amber-200">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-[#1E293B]">Return Rate Alert</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Overall return rate increased to 1.8% (target: &lt;1.5%). Main drivers: Damaged goods (42%) and expired items (28%). Recommend stricter QC for Food & Beverages category.
                    </p>
                    <Button size="sm" variant="outline" className="mt-2">
                      Root Cause Analysis
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-emerald-200">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-[#1E293B]">Payment Optimization</p>
                    <p className="text-sm text-slate-600 mt-1">
                      You have AED 485K eligible for 2% early payment discount. Settling within 10 days could save AED 9,700 this month.
                    </p>
                    <Button size="sm" variant="outline" className="mt-2">
                      View Eligible Invoices
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Vendor Performance */}
          <TabsContent value="vendor" className="space-y-6">
            {/* Vendor Comparison Table */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[#1E293B] flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Vendor Performance Scorecard
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select defaultValue="all">
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Vendors</SelectItem>
                        {vendorPerformanceData.map(v => (
                          <SelectItem key={v.vendor} value={v.vendor}>{v.vendor}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm">
                      Compare
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Vendor</TableHead>
                      <TableHead className="font-semibold text-right">Spend</TableHead>
                      <TableHead className="font-semibold text-right">On-time %</TableHead>
                      <TableHead className="font-semibold text-right">Return %</TableHead>
                      <TableHead className="font-semibold text-right">Cost Change</TableHead>
                      <TableHead className="font-semibold text-right">Claim Rate</TableHead>
                      <TableHead className="font-semibold">Rating</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorPerformanceData.map((vendor) => (
                      <TableRow key={vendor.vendor} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{vendor.vendor}</TableCell>
                        <TableCell className="text-right">AED {(vendor.spend / 1000).toFixed(0)}K</TableCell>
                        <TableCell className={`text-right font-medium ${getPerformanceColor(vendor.onTime, 85)}`}>
                          {vendor.onTime}%
                        </TableCell>
                        <TableCell className={`text-right font-medium ${getPerformanceColor(vendor.returnRate, 2, true)}`}>
                          {vendor.returnRate}%
                        </TableCell>
                        <TableCell className={`text-right font-medium ${vendor.costChange > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {vendor.costChange > 0 ? '+' : ''}{vendor.costChange}%
                        </TableCell>
                        <TableCell className={`text-right font-medium ${getPerformanceColor(vendor.claimRate, 1.5, true)}`}>
                          {vendor.claimRate}%
                        </TableCell>
                        <TableCell>
                          {renderStarRating(vendor.rating)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Vendor Radar Charts */}
            <div className="grid grid-cols-2 gap-6">
              {vendorPerformanceData.slice(0, 2).map((vendor) => {
                const radarData = [
                  { metric: 'Delivery', score: vendor.deliveryScore },
                  { metric: 'Quality', score: vendor.qualityScore },
                  { metric: 'Price', score: vendor.priceScore },
                  { metric: 'Response', score: vendor.responseScore }
                ];

                return (
                  <Card key={vendor.vendor} className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-[#1E293B] text-base">{vendor.vendor}</CardTitle>
                        {renderStarRating(vendor.rating)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="#E2E8F0" />
                          <PolarAngleAxis dataKey="metric" stroke="#64748B" />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#64748B" />
                          <Radar name={vendor.vendor} dataKey="score" stroke="#F5C742" fill="#F5C742" fillOpacity={0.5} />
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="text-center p-2 bg-slate-50 rounded">
                          <p className="text-xs text-slate-600">Monthly Spend</p>
                          <p className="font-bold text-[#1E293B]">AED {(vendor.spend / 1000).toFixed(0)}K</p>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded">
                          <p className="text-xs text-slate-600">On-time Delivery</p>
                          <p className={`font-bold ${getPerformanceColor(vendor.onTime, 85)}`}>{vendor.onTime}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Tab 3: LPO Performance */}
          <TabsContent value="lpo" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">LPOs Raised</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">245</p>
                      <p className="text-xs text-emerald-600 mt-1">+8.5% vs last month</p>
                    </div>
                    <FileText className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg Approval Time</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">2.3 days</p>
                      <p className="text-xs text-emerald-600 mt-1">-0.5 days improved</p>
                    </div>
                    <Clock className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Fulfillment Rate</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">94.2%</p>
                      <p className="text-xs text-slate-500 mt-1">Target: 95%</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Cancelled LPOs</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">3.8%</p>
                      <p className="text-xs text-slate-500 mt-1">9 this month</p>
                    </div>
                    <XCircle className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B]">LPO â†’ Delivery Lead Time Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" stroke="#64748B" />
                    <YAxis stroke="#64748B" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="purchases" fill="#F5C742" name="LPO Value (AED)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Delivery Performance */}
          <TabsContent value="delivery" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">On-Time %</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">70.6%</p>
                      <p className="text-xs text-slate-500 mt-1">168 deliveries</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Partial Deliveries</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">8.3%</p>
                      <p className="text-xs text-slate-500 mt-1">20 cases</p>
                    </div>
                    <Package className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg Delay</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">3.2 days</p>
                      <p className="text-xs text-slate-500 mt-1">For late deliveries</p>
                    </div>
                    <Clock className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">ASN Accuracy</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">96.5%</p>
                      <p className="text-xs text-emerald-600 mt-1">Excellent</p>
                    </div>
                    <Truck className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B]">Delivery Delay Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={deliveryPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="range" stroke="#64748B" />
                    <YAxis stroke="#64748B" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3B82F6" name="Deliveries" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 5: GRN Performance */}
          <TabsContent value="grn" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">GRNs Posted</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">235</p>
                      <p className="text-xs text-blue-600 mt-1">This month</p>
                    </div>
                    <FileText className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Qty Variance</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">2.3%</p>
                      <p className="text-xs text-slate-500 mt-1">Target: &lt;2%</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">QC Failure Rate</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">2.1%</p>
                      <p className="text-xs text-red-600 mt-1">5 rejections</p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Near-Expiry</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">1.5%</p>
                      <p className="text-xs text-slate-500 mt-1">&lt;30 days</p>
                    </div>
                    <Clock className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B]">QC Rejection Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={returnReasonData}
                      dataKey="value"
                      nameKey="reason"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.reason}: ${entry.value}%`}
                    >
                      {returnReasonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 6: Invoice Performance */}
          <TabsContent value="invoice" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Invoices Posted</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">232</p>
                      <p className="text-xs text-blue-600 mt-1">This month</p>
                    </div>
                    <FileText className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Invoice vs GRN</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">98.5%</p>
                      <p className="text-xs text-emerald-600 mt-1">High accuracy</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg Posting Time</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">3.4 days</p>
                      <p className="text-xs text-slate-500 mt-1">From receipt</p>
                    </div>
                    <Clock className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Backdated</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">12</p>
                      <p className="text-xs text-amber-600 mt-1">Needs review</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  Insight: Invoice Variance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700">
                  Invoice accuracy is excellent at 98.5%. The 1.5% variance is primarily due to freight charges not captured in GRN. Consider adding freight estimation to GRN process.
                </p>
                <Button size="sm" className="mt-3 text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                  View Detailed Analysis
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 7: GRV & Claims */}
          <TabsContent value="grv" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">GRVs Raised</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">18</p>
                      <p className="text-xs text-red-600 mt-1">This month</p>
                    </div>
                    <PackageX className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Return Rate</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">1.8%</p>
                      <p className="text-xs text-red-600 mt-1">Target: &lt;1.5%</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Claim Acceptance</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">85%</p>
                      <p className="text-xs text-emerald-600 mt-1">15/18 accepted</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg Settlement</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">12 days</p>
                      <p className="text-xs text-emerald-600 mt-1">Improved</p>
                    </div>
                    <Clock className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B]">Return Reason Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={returnReasonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="reason" stroke="#64748B" />
                    <YAxis stroke="#64748B" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#EF4444" name="Percentage %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-red-50 border-red-200">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Root Cause: High Return Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium text-[#1E293B]">Top 3 Drivers:</p>
                  <ul className="list-disc list-inside text-sm text-slate-700 mt-2 space-y-1">
                    <li>Damaged goods (42%) - Primarily from Prime Distributors</li>
                    <li>Expired items (28%) - Food & Beverages category</li>
                    <li>Wrong SKU (18%) - Metro Traders picking errors</li>
                  </ul>
                </div>
                <div className="pt-3 border-t">
                  <p className="font-medium text-[#1E293B] mb-2">Recommended Actions:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                      Review Prime Distributors Contract
                    </Button>
                    <Button size="sm" variant="outline">
                      Tighten F&B Expiry Controls
                    </Button>
                    <Button size="sm" variant="outline">
                      Request Metro Traders Process Audit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 8: Payments & AP */}
          <TabsContent value="payments" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Outstanding AP</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">AED 1.07M</p>
                      <p className="text-xs text-slate-600 mt-1">Total payables</p>
                    </div>
                    <DollarSign className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg Payment Cycle</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">35 days</p>
                      <p className="text-xs text-slate-500 mt-1">From invoice date</p>
                    </div>
                    <Clock className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Discount Captured</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">AED 18.5K</p>
                      <p className="text-xs text-emerald-600 mt-1">Early payment savings</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Overdue %</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">8.2%</p>
                      <p className="text-xs text-red-600 mt-1">AED 88K overdue</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B]">AP Aging Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={apAgingData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" stroke="#64748B" />
                    <YAxis type="category" dataKey="range" stroke="#64748B" width={100} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#3B82F6" name="Amount (AED)" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {apAgingData.map((item, index) => (
                    <div key={item.range} className="text-center p-3 bg-slate-50 rounded">
                      <p className="text-xs text-slate-600">{item.range}</p>
                      <p className="font-bold text-[#1E293B] mt-1">AED {(item.amount / 1000).toFixed(0)}K</p>
                      <p className="text-xs text-slate-500">{item.percentage}%</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 9: Cost & Margin */}
          <TabsContent value="cost" className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg Cost Increase</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">+2.1%</p>
                      <p className="text-xs text-slate-500 mt-1">YoY change</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Cost Volatility</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">7.2%</p>
                      <p className="text-xs text-amber-600 mt-1">Index score</p>
                    </div>
                    <Activity className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Landed Cost %</p>
                      <p className="text-2xl font-bold text-[#1E293B] mt-1">8.5%</p>
                      <p className="text-xs text-slate-500 mt-1">Freight & duties</p>
                    </div>
                    <Truck className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Margin Impact</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">-1.2%</p>
                      <p className="text-xs text-red-600 mt-1">Erosion</p>
                    </div>
                    <TrendingDown className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B]">Cost Volatility by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Category</TableHead>
                      <TableHead className="font-semibold text-right">Volatility %</TableHead>
                      <TableHead className="font-semibold">Trend</TableHead>
                      <TableHead className="font-semibold text-right">Risk Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costVolatilityData.map((item) => (
                      <TableRow key={item.category} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{item.category}</TableCell>
                        <TableCell className={`text-right font-medium ${
                          item.volatility > 10 ? 'text-red-600' : item.volatility > 5 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {item.volatility}%
                        </TableCell>
                        <TableCell>
                          {item.trend === 'up' && <TrendingUp className="h-4 w-4 text-red-600" />}
                          {item.trend === 'down' && <TrendingDown className="h-4 w-4 text-emerald-600" />}
                          {item.trend === 'stable' && <Activity className="h-4 w-4 text-slate-400" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className={
                            item.volatility > 10 ? 'bg-red-100 text-red-700 border-red-300' :
                            item.volatility > 5 ? 'bg-amber-100 text-amber-700 border-amber-300' :
                            'bg-emerald-100 text-emerald-700 border-emerald-300'
                          } variant="outline">
                            {item.volatility > 10 ? 'High' : item.volatility > 5 ? 'Medium' : 'Low'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 10: Risk & SLA */}
          <TabsContent value="risk" className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">High-Risk Vendors</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">3</p>
                      <p className="text-xs text-slate-500 mt-1">Require review</p>
                    </div>
                    <ShieldAlert className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">SLA Breach Rate</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">12%</p>
                      <p className="text-xs text-amber-600 mt-1">Delivery SLA</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-amber-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">VAT Compliance</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">100%</p>
                      <p className="text-xs text-emerald-600 mt-1">All compliant</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm bg-red-50 border-red-200">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  High-Risk Vendor Alert
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-white rounded-lg border border-red-300">
                  <p className="font-medium text-[#1E293B]">Prime Distributors</p>
                  <p className="text-sm text-slate-700 mt-1">
                    Risk Score: 72/100 (High)
                  </p>
                  <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
                    <li>On-time delivery: 76% (below 85% threshold)</li>
                    <li>Return rate: 4.2% (above 2% threshold)</li>
                    <li>3 unresolved disputes</li>
                  </ul>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                      Performance Review Meeting
                    </Button>
                    <Button size="sm" variant="outline">
                      View Full Risk Profile
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 11: Predictive */}
          <TabsContent value="predictive" className="space-y-6">
            <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-purple-50 to-indigo-50">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  AI-Powered Predictive Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-white rounded-lg border border-purple-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[#1E293B]">Delivery Delay Risk</p>
                        <Badge className="bg-amber-100 text-amber-700 border-amber-300" variant="outline">
                          85% Confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-700 mt-2">
                        Metro Traders likely to miss delivery deadline for LPO-2025-156 (Expected: Dec 18, Predicted: Dec 22)
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                          Send Reminder to Vendor
                        </Button>
                        <Button size="sm" variant="outline">
                          View Analysis
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-red-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[#1E293B]">Cost Increase Forecast</p>
                        <Badge className="bg-red-100 text-red-700 border-red-300" variant="outline">
                          78% Confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-700 mt-2">
                        Food & Beverages category predicted to increase by 5-7% in Q1 2026 based on commodity price trends and vendor patterns.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                          Lock Current Prices
                        </Button>
                        <Button size="sm" variant="outline">
                          Negotiate Long-term Contract
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-purple-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Scale className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[#1E293B]">Quality Degradation Warning</p>
                        <Badge className="bg-purple-100 text-purple-700 border-purple-300" variant="outline">
                          72% Confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-700 mt-2">
                        Global Supplies LLC showing subtle quality decline pattern (GRN variance increasing from 1.1% to 2.3% over 3 months).
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                          Schedule QC Audit
                        </Button>
                        <Button size="sm" variant="outline">
                          View Trend Details
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-emerald-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Zap className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[#1E293B]">Optimization Opportunity</p>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">
                          Recommendation
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-700 mt-2">
                        Consolidating Electronics purchases from Prime Distributors to Global Supplies LLC could improve on-time delivery by 18% and reduce costs by 3.5%.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                          Run What-If Simulation
                        </Button>
                        <Button size="sm" variant="outline">
                          View Full Analysis
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  What-If Scenario Simulator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Scenario Type</Label>
                    <Select defaultValue="vendor-switch">
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendor-switch">Vendor Switch</SelectItem>
                        <SelectItem value="price-increase">Price Increase</SelectItem>
                        <SelectItem value="volume-change">Volume Change</SelectItem>
                        <SelectItem value="payment-terms">Payment Terms</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Impact Period</Label>
                    <Select defaultValue="3-months">
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-month">1 Month</SelectItem>
                        <SelectItem value="3-months">3 Months</SelectItem>
                        <SelectItem value="6-months">6 Months</SelectItem>
                        <SelectItem value="1-year">1 Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full text-[#1E293B]" style={{ backgroundColor: '#F5C742' }}>
                  <Zap className="h-4 w-4 mr-2" />
                  Run Simulation
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

