import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Separator } from "../../components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart } from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  CheckCircle,
  Activity,
  Target,
  Zap,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  TrendingUpDown,
  Calendar,
  Building2,
  CreditCard,
  Banknote,
  Receipt,
  ShoppingBag,
  Dumbbell,
  Coffee,
  Package,
  Wrench,
  UserCheck,
  UserX,
  BarChart3,
  PieChart as PieChartIcon,
  Timer,
  Flame,
  Shield,
  Award,
  Heart,
  FileText,
  Download
} from 'lucide-react';

interface BIEngineDashboardProps {
  formatCurrency: (amount: number) => string;
  getCurrentPeriod: () => string;
}

export function BIEngineDashboard({ formatCurrency, getCurrentPeriod }: BIEngineDashboardProps) {
  const [timeFilter, setTimeFilter] = useState('monthly');
  const [branchFilter, setBranchFilter] = useState('all');

  // Executive Summary KPIs
  const executiveKPIs = [
    {
      title: 'Total Revenue',
      value: 125750,
      trend: 18.5,
      period: 'MTD',
      icon: DollarSign,
      color: 'green',
      sparkline: [420, 380, 550, 480, 620, 750, 805]
    },
    {
      title: 'Net Profit',
      value: 89025,
      trend: 22.3,
      period: 'MTD',
      icon: TrendingUp,
      color: 'blue',
      sparkline: [350, 320, 480, 420, 550, 680, 725]
    },
    {
      title: 'Cash Flow Status',
      value: 45850,
      trend: 12.8,
      period: 'Current',
      icon: Banknote,
      color: 'green',
      sparkline: [280, 290, 310, 305, 325, 340, 355]
    },
    {
      title: 'Total Expenses',
      value: 36725,
      trend: -5.2,
      period: 'MTD',
      icon: Receipt,
      color: 'red',
      sparkline: [180, 190, 175, 165, 170, 160, 155]
    },
    {
      title: 'Expense Burn Rate',
      value: 1224,
      trend: -3.5,
      period: 'Daily Avg',
      icon: Flame,
      color: 'orange',
      sparkline: [1300, 1280, 1250, 1240, 1230, 1220, 1224]
    },
    {
      title: 'New Memberships',
      value: 62,
      trend: 23.1,
      period: 'MTD',
      icon: UserCheck,
      color: 'green',
      sparkline: [45, 52, 48, 38, 56, 62, 62]
    },
    {
      title: 'Membership Renewals',
      value: 89,
      trend: 15.6,
      period: 'MTD',
      icon: Award,
      color: 'blue',
      sparkline: [70, 75, 78, 82, 85, 87, 89]
    },
    {
      title: 'Active Members',
      value: 847,
      trend: 8.5,
      period: 'Current',
      icon: Users,
      color: 'blue',
      sparkline: [789, 801, 823, 835, 847, 847, 847]
    },
    {
      title: 'Churn Prediction',
      value: 9.8,
      trend: -1.3,
      period: '%',
      icon: UserX,
      color: 'green',
      sparkline: [12.8, 11.9, 10.5, 11.1, 10.5, 9.8, 9.8]
    },
    {
      title: 'PT Revenue',
      value: 18450,
      trend: 28.5,
      period: 'MTD',
      icon: Dumbbell,
      color: 'green',
      sparkline: [12000, 13500, 14800, 16200, 17100, 18000, 18450]
    },
    {
      title: 'Retail & F&B Share',
      value: 15.2,
      trend: 4.8,
      period: '% of Revenue',
      icon: ShoppingBag,
      color: 'blue',
      sparkline: [12.5, 13.2, 14.1, 14.5, 14.8, 15.0, 15.2]
    },
    {
      title: 'Cost Spike Alerts',
      value: 3,
      trend: 0,
      period: 'Active',
      icon: AlertTriangle,
      color: 'orange',
      sparkline: [2, 3, 3, 4, 3, 3, 3]
    }
  ];

  // AI Recommendations
  const aiRecommendations = [
    {
      type: 'revenue',
      icon: TrendingUp,
      color: 'green',
      title: 'PT Revenue Growth Opportunity',
      description: 'PT revenue is projected to increase by 18% next month based on booking trends.',
      action: 'Schedule additional PT slots',
      impact: 'High'
    },
    {
      type: 'churn',
      icon: AlertTriangle,
      color: 'orange',
      title: 'Churn Risk Detected',
      description: '27 members have high churn probability â†’ start re-engagement campaigns.',
      action: 'Launch retention program',
      impact: 'High'
    },
    {
      type: 'cost',
      icon: DollarSign,
      color: 'red',
      title: 'Supplier Cost Optimization',
      description: 'Supplier A cost increased for 3 months â†’ switch to Supplier B saves 12%.',
      action: 'Review supplier contracts',
      impact: 'Medium'
    },
    {
      type: 'operations',
      icon: Coffee,
      color: 'blue',
      title: 'Cafe Peak Hours Identified',
      description: 'Cafe sales peak between 4-9 PM â†’ optimize inventory and staffing.',
      action: 'Adjust staffing schedule',
      impact: 'Medium'
    },
    {
      type: 'expense',
      icon: Flame,
      color: 'orange',
      title: 'Expense Spike Prediction',
      description: 'Expenses likely to spike in July due to energy usage and maintenance.',
      action: 'Budget adjustment needed',
      impact: 'High'
    },
    {
      type: 'profit',
      icon: Target,
      color: 'green',
      title: 'Profit Target Achievement',
      description: 'Net profit forecast to exceed Q2 target by 14% if trends continue.',
      action: 'Maintain current strategy',
      impact: 'Positive'
    }
  ];

  // Revenue Data
  const revenueData = [
    { month: 'Jan', membership: 85000, pt: 12000, retail: 8500, fb: 4500, total: 110000 },
    { month: 'Feb', membership: 87000, pt: 13500, retail: 9000, fb: 4800, total: 114300 },
    { month: 'Mar', membership: 89500, pt: 14800, retail: 9200, fb: 5000, total: 118500 },
    { month: 'Apr', membership: 88000, pt: 16200, retail: 9500, fb: 5200, total: 118900 },
    { month: 'May', membership: 90500, pt: 17100, retail: 9800, fb: 5400, total: 122800 },
    { month: 'Jun', membership: 92000, pt: 18450, retail: 10200, fb: 5600, total: 126250 }
  ];

  // Expense Data
  const expenseData = [
    { month: 'Jan', salary: 18000, utilities: 4500, inventory: 6000, rent: 8000, marketing: 2500 },
    { month: 'Feb', salary: 18500, utilities: 4200, inventory: 6200, rent: 8000, marketing: 2800 },
    { month: 'Mar', salary: 19000, utilities: 4800, inventory: 6500, rent: 8000, marketing: 3000 },
    { month: 'Apr', salary: 18800, utilities: 4300, inventory: 6100, rent: 8000, marketing: 2700 },
    { month: 'May', salary: 19200, utilities: 4600, inventory: 6400, rent: 8000, marketing: 2900 },
    { month: 'Jun', salary: 19500, utilities: 4400, inventory: 6300, rent: 8000, marketing: 3100 }
  ];

  // Staff Performance
  const staffPerformance = [
    { name: 'David Lee', role: 'PT', targetAchievement: 125, punctuality: 98, revenue: 25800 },
    { name: 'Sarah Johnson', role: 'PT', targetAchievement: 118, punctuality: 95, revenue: 22400 },
    { name: 'Mia Chen', role: 'Receptionist', targetAchievement: 140, punctuality: 100, revenue: 8500 },
    { name: 'Tom Martinez', role: 'PT', targetAchievement: 85, punctuality: 88, revenue: 15200 },
    { name: 'Lisa Wong', role: 'Manager', targetAchievement: 112, punctuality: 96, revenue: 18900 }
  ];

  // Member Engagement
  const memberEngagement = {
    engagementScore: 78.5,
    renewalProbability: 89.2,
    activeMembers: 847,
    atRiskMembers: 67,
    avgVisitsPerMember: 12.8
  };

  // Financial Health
  const financialHealth = {
    outstandingPayables: 8500,
    memberPendingPayments: 12400,
    loanRepayment: 5000,
    dtiRatio: 0.28,
    cashReserveDays: 45,
    stabilityIndex: 8.5
  };

  // Forecast Data
  const forecastData = [
    { month: 'Jul', actual: null, predicted: 128500, lower: 123000, upper: 134000 },
    { month: 'Aug', actual: null, predicted: 132000, lower: 126000, upper: 138000 },
    { month: 'Sep', actual: null, predicted: 135800, lower: 129000, upper: 142000 }
  ];

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-600';
    if (trend < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <ArrowUpRight className="h-4 w-4" />;
    if (trend < 0) return <ArrowDownRight className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High':
        return 'bg-red-100 text-red-800';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'Positive':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-[#2B7A78]" />
            GYMBIOS STRATEGIC BI ENGINEâ„¢
          </h1>
          <p className="text-muted-foreground mt-1">
            Unified Dashboard - {getCurrentPeriod()}
          </p>
        </div>
        
        {/* Global Filters */}
        <div className="flex items-center gap-3">
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              <SelectItem value="main">Main Branch</SelectItem>
              <SelectItem value="downtown">Downtown</SelectItem>
              <SelectItem value="north">North Branch</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area (Left 2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tier 1: Executive Summary KPIs */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#2B7A78]" />
              Executive Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {executiveKPIs.map((kpi, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground mb-1">{kpi.title}</p>
                        <p className="text-2xl font-bold">
                          {kpi.title.includes('Rate') || kpi.title.includes('Prediction') || kpi.title.includes('Share') 
                            ? `${kpi.value}%` 
                            : kpi.title.includes('Members') || kpi.title.includes('Alerts')
                            ? kpi.value 
                            : formatCurrency(kpi.value)}
                        </p>
                        <div className={`flex items-center mt-1 ${getTrendColor(kpi.trend)}`}>
                          {getTrendIcon(kpi.trend)}
                          <span className="text-xs font-medium ml-1">
                            {kpi.trend > 0 ? '+' : ''}{kpi.trend}%
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{kpi.period}</span>
                        </div>
                      </div>
                      <div className={`p-2 rounded-lg bg-${kpi.color}-100`}>
                        <kpi.icon className={`h-5 w-5 text-${kpi.color}-600`} />
                      </div>
                    </div>
                    {/* Mini Sparkline */}
                    <div className="h-8 mt-2">
                      <ResponsiveContainer width="100%" height={32}>
                        <LineChart data={kpi.sparkline.map((v, i) => ({ value: v }))}>
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke={kpi.color === 'green' ? '#10b981' : kpi.color === 'blue' ? '#3b82f6' : kpi.color === 'red' ? '#ef4444' : '#f59e0b'} 
                            strokeWidth={2} 
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Separator />

          {/* Tier 2: Revenue Intelligence */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#2B7A78]" />
              Revenue Intelligence
            </h2>
            
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">Multi-Stream Revenue Trend</CardTitle>
                <CardDescription>6-month revenue performance by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#2B7A78" strokeWidth={3} name="Total Revenue" />
                    <Line type="monotone" dataKey="membership" stroke="#3b82f6" strokeWidth={2} name="Membership" />
                    <Line type="monotone" dataKey="pt" stroke="#10b981" strokeWidth={2} name="PT & Services" />
                    <Line type="monotone" dataKey="retail" stroke="#f59e0b" strokeWidth={2} name="Retail" />
                    <Line type="monotone" dataKey="fb" stroke="#ec4899" strokeWidth={2} name="F&B" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <p className="text-xs text-muted-foreground">Membership</p>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(92000)}</p>
                  <Progress value={73} className="h-1 mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Dumbbell className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">PT & Services</p>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(18450)}</p>
                  <Progress value={15} className="h-1 mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingBag className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">Retail</p>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(10200)}</p>
                  <Progress value={8} className="h-1 mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Coffee className="h-4 w-4 text-pink-600" />
                    <p className="text-xs text-muted-foreground">Cafe & F&B</p>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(5600)}</p>
                  <Progress value={4} className="h-1 mt-2" />
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Tier 3: Expense Intelligence */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#E63946]" />
              Expense Intelligence
            </h2>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Expense Breakdown</CardTitle>
                <CardDescription>Category-wise expense analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={expenseData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="salary" stackId="a" fill="#3b82f6" name="Salary" />
                    <Bar dataKey="utilities" stackId="a" fill="#10b981" name="Utilities" />
                    <Bar dataKey="inventory" stackId="a" fill="#f59e0b" name="Inventory" />
                    <Bar dataKey="rent" stackId="a" fill="#8b5cf6" name="Rent/Admin" />
                    <Bar dataKey="marketing" stackId="a" fill="#ec4899" name="Marketing" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Tier 4: Staff Performance */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#2B7A78]" />
              Staff & HR Intelligence
            </h2>
            
            <div className="grid grid-cols-1 gap-3">
              {staffPerformance.map((staff, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium">{staff.name}</p>
                          <Badge variant="outline" className="text-xs">{staff.role}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Target Achievement</p>
                            <p className="text-lg font-bold">{staff.targetAchievement}%</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Punctuality</p>
                            <p className="text-lg font-bold">{staff.punctuality}%</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Revenue Generated</p>
                            <p className="text-lg font-bold">{formatCurrency(staff.revenue)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4">
                        <Progress value={staff.targetAchievement} className="h-2 w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Separator />

          {/* Tier 5: Member Engagement */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Heart className="h-5 w-5 text-[#E63946]" />
              Member Retention & Engagement
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Activity className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                  <p className="text-xs text-muted-foreground mb-1">Engagement Score</p>
                  <p className="text-2xl font-bold">{memberEngagement.engagementScore}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Target className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  <p className="text-xs text-muted-foreground mb-1">Renewal Probability</p>
                  <p className="text-2xl font-bold">{memberEngagement.renewalProbability}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                  <p className="text-xs text-muted-foreground mb-1">Active Members</p>
                  <p className="text-2xl font-bold">{memberEngagement.activeMembers}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-orange-600" />
                  <p className="text-xs text-muted-foreground mb-1">At-Risk Members</p>
                  <p className="text-2xl font-bold">{memberEngagement.atRiskMembers}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Timer className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                  <p className="text-xs text-muted-foreground mb-1">Avg Visits/Member</p>
                  <p className="text-2xl font-bold">{memberEngagement.avgVisitsPerMember}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Tier 6: Forecasting */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <TrendingUpDown className="h-5 w-5 text-[#2B7A78]" />
              Revenue Forecast (90 Days)
            </h2>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI-Powered Revenue Prediction</CardTitle>
                <CardDescription>Predictive analytics with confidence intervals</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={[...revenueData.slice(-3), ...forecastData]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="upper" 
                      fill="#2B7A78" 
                      fillOpacity={0.1} 
                      stroke="none" 
                      name="Upper Bound"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="lower" 
                      fill="#2B7A78" 
                      fillOpacity={0.1} 
                      stroke="none" 
                      name="Lower Bound"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                      name="Actual"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="predicted" 
                      stroke="#2B7A78" 
                      strokeWidth={3} 
                      strokeDasharray="5 5" 
                      name="Predicted"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Tier 7: Financial Health */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#2B7A78]" />
              Financial Health & Stability
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Outstanding Payables</p>
                  <p className="text-xl font-bold text-orange-600">{formatCurrency(financialHealth.outstandingPayables)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Member Pending Payments</p>
                  <p className="text-xl font-bold text-orange-600">{formatCurrency(financialHealth.memberPendingPayments)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Loan Repayment</p>
                  <p className="text-xl font-bold">{formatCurrency(financialHealth.loanRepayment)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">DTI Ratio</p>
                  <p className="text-xl font-bold text-green-600">{financialHealth.dtiRatio}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Cash Reserve Days</p>
                  <p className="text-xl font-bold text-green-600">{financialHealth.cashReserveDays}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Stability Index</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-green-600">{financialHealth.stabilityIndex}/10</p>
                    <Progress value={financialHealth.stabilityIndex * 10} className="h-2 flex-1" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* AI Insight Panel (Right sticky column) */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <Card className="border-[#2B7A78] border-2">
              <CardHeader className="bg-gradient-to-r from-[#2B7A78] to-[#236663] text-white">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Strategic Insights
                </CardTitle>
                <CardDescription className="text-white/80">
                  Recommendations & Predictions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
                {aiRecommendations.map((rec, index) => (
                  <div key={index} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg bg-${rec.color}-100`}>
                        <rec.icon className={`h-4 w-4 text-${rec.color}-600`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{rec.title}</p>
                        <Badge className={`${getImpactColor(rec.impact)} text-xs mt-1`}>
                          {rec.impact} Impact
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      {rec.action}
                    </Button>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <Button className="w-full bg-[#2B7A78] hover:bg-[#236663]">
                    <FileText className="h-4 w-4 mr-2" />
                    Full Strategy Report
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Generate PDF
                  </Button>
                  <Button className="w-full bg-[#E63946] hover:bg-[#d32f3f]">
                    <Zap className="h-4 w-4 mr-2" />
                    Growth Booster Simulation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
