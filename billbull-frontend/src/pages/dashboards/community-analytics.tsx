import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Separator } from "../../components/ui/separator";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Award,
  Activity,
  Zap,
  Brain,
  PieChart,
  LineChart,
  BarChart,
  Gauge,
  Heart,
  UserCheck,
  UserX,
  Repeat,
  Coffee,
  Dumbbell,
  CreditCard,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Star,
  MessageSquare,
  Calendar as CalendarIcon,
  Trophy
} from "lucide-react";
import {
  LineChart as RechartsLineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Cell,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
  FunnelChart,
  Funnel,
  LabelList
} from "recharts";

// Mock data - In real app, this would come from your backend
const mockData = {
  targets: {
    assigned: 85000,
    achieved: 67500,
    progress: 79.4
  },
  collections: {
    today: {
      membership: 12500,
      addons: 3200,
      pos: 1800,
      total: 17500
    },
    yesterday: {
      membership: 11800,
      addons: 2900,
      pos: 2100,
      total: 16800
    },
    thisMonth: {
      membership: 245000,
      addons: 48000,
      pos: 32000,
      total: 325000
    }
  },
  trends: {
    daily: [
      { date: "Mon", revenue: 15200, members: 45 },
      { date: "Tue", revenue: 18400, members: 52 },
      { date: "Wed", revenue: 16800, members: 48 },
      { date: "Thu", revenue: 19200, members: 56 },
      { date: "Fri", revenue: 22100, members: 64 },
      { date: "Sat", revenue: 26800, members: 78 },
      { date: "Sun", revenue: 21300, members: 61 }
    ],
    monthly: [
      { month: "Jan", revenue: 298000, target: 285000 },
      { month: "Feb", revenue: 312000, target: 295000 },
      { month: "Mar", revenue: 325000, target: 310000 },
      { month: "Apr", revenue: 298000, target: 315000 },
      { month: "May", revenue: 335000, target: 320000 },
      { month: "Jun", revenue: 358000, target: 340000 }
    ]
  },
  staffPerformance: [
    { name: "Ahmed Al-Rashid", sales: 45000, target: 40000, achievement: 112.5 },
    { name: "Sarah Johnson", sales: 38500, target: 35000, achievement: 110.0 },
    { name: "Mohamed Hassan", sales: 42000, target: 38000, achievement: 110.5 },
    { name: "Emma Wilson", sales: 31200, target: 32000, achievement: 97.5 },
    { name: "Omar Abdullah", sales: 28800, target: 30000, achievement: 96.0 }
  ],
  retentionFunnel: [
    { name: "New Signups", value: 245, color: "#0047AB" },
    { name: "Active Members", value: 198, color: "#009688" },
    { name: "Renewals", value: 156, color: "#4CAF50" }
  ],
  churnPrediction: [
    { name: "Layla Al-Mansoori", risk: "High", lastVisit: "15 days ago", membership: "Premium", probability: 85 },
    { name: "James Miller", risk: "High", lastVisit: "12 days ago", membership: "Basic", probability: 78 },
    { name: "Fatima Al-Zahra", risk: "Medium", lastVisit: "8 days ago", membership: "Premium", probability: 65 },
    { name: "Robert Chen", risk: "Medium", lastVisit: "6 days ago", membership: "Basic", probability: 58 },
    { name: "Aisha Ibrahim", risk: "Low", lastVisit: "2 days ago", membership: "Premium", probability: 25 }
  ],
  trainerPerformance: [
    { name: "Coach Hassan", classes: 45, attendance: 92, revenue: 28500, rating: 4.8 },
    { name: "Trainer Sarah", classes: 38, attendance: 88, revenue: 24200, rating: 4.6 },
    { name: "PT Ahmed", classes: 52, attendance: 95, revenue: 32800, rating: 4.9 },
    { name: "Coach Layla", classes: 34, attendance: 85, revenue: 21600, rating: 4.5 }
  ],
  engagementAnalytics: {
    communityFeatures: [
      { feature: "Group Challenges", usage: 78, engagement: 85 },
      { feature: "Social Feed", usage: 65, engagement: 72 },
      { feature: "Member Chat", usage: 45, engagement: 68 },
      { feature: "Events", usage: 58, engagement: 89 },
      { feature: "Leaderboards", usage: 38, engagement: 92 }
    ],
    correlationData: [
      { engagement: 20, renewal: 45 },
      { engagement: 35, renewal: 62 },
      { engagement: 50, renewal: 78 },
      { engagement: 68, renewal: 85 },
      { engagement: 82, renewal: 94 },
      { engagement: 95, renewal: 98 }
    ]
  }
};

const COLORS = {
  primary: "#0047AB",
  secondary: "#009688",
  success: "#4CAF50",
  warning: "#FFC107",
  error: "#F44336",
  muted: "#9E9E9E"
};

export function CommunityAnalytics() {
  const [dateFilter, setDateFilter] = useState("today");
  const [staffFilter, setStaffFilter] = useState("all");
  const [activeCollectionTab, setActiveCollectionTab] = useState("today");

  // KPI Cards Data
  const kpiData = useMemo(() => {
    const { assigned, achieved, progress } = mockData.targets;
    const collections = mockData.collections[activeCollectionTab as keyof typeof mockData.collections];
    
    return [
      {
        title: "Target Progress",
        value: `AED ${achieved.toLocaleString()}`,
        target: `AED ${assigned.toLocaleString()}`,
        progress: progress,
        change: progress >= 100 ? `+${(progress - 100).toFixed(1)}%` : `-${(100 - progress).toFixed(1)}%`,
        trend: progress >= 100 ? "up" : "down",
        icon: Target,
        color: progress >= 85 ? "success" : progress >= 70 ? "warning" : "error"
      },
      {
        title: "Total Collections",
        value: `AED ${collections.total.toLocaleString()}`,
        subtitle: activeCollectionTab.charAt(0).toUpperCase() + activeCollectionTab.slice(1),
        change: "+12.5%",
        trend: "up",
        icon: DollarSign,
        color: "primary"
      },
      {
        title: "Active Members",
        value: "1,247",
        change: "+3.2%",
        trend: "up",
        icon: Users,
        color: "secondary"
      },
      {
        title: "Member Retention",
        value: "89.5%",
        change: "+2.1%",
        trend: "up",
        icon: Repeat,
        color: "success"
      }
    ];
  }, [activeCollectionTab]);

  const collectionBreakdownData = useMemo(() => {
    const collections = mockData.collections[activeCollectionTab as keyof typeof mockData.collections];
    return [
      { name: "Membership", value: collections.membership, color: COLORS.primary },
      { name: "Add-ons", value: collections.addons, color: COLORS.secondary },
      { name: "POS Sales", value: collections.pos, color: COLORS.success }
    ];
  }, [activeCollectionTab]);

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case "high": return "destructive";
      case "medium": return "warning";
      case "low": return "success";
      default: return "secondary";
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 85) return COLORS.success;
    if (progress >= 70) return COLORS.warning;
    return COLORS.error;
  };

  return (
    <div className="p-6 space-y-6 bg-background">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive business intelligence and performance insights for your gym
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-[140px]">
              <Users className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Staff Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              <SelectItem value="trainers">Trainers</SelectItem>
              <SelectItem value="reception">Reception</SelectItem>
              <SelectItem value="management">Management</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => {
          const IconComponent = kpi.icon;
          return (
            <Card key={index} className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <IconComponent className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant={kpi.trend === "up" ? "default" : "destructive"} className="text-xs">
                    {kpi.trend === "up" ? (
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 mr-1" />
                    )}
                    {kpi.change}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  
                  {kpi.target && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Target: {kpi.target}</span>
                        <span>{kpi.progress?.toFixed(1)}%</span>
                      </div>
                      <Progress 
                        value={kpi.progress} 
                        className="h-2"
                        style={{
                          '--progress-background': getProgressColor(kpi.progress || 0)
                        } as React.CSSProperties}
                      />
                    </div>
                  )}
                  
                  {kpi.subtitle && (
                    <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Collections Breakdown Section */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <CardTitle className="text-xl text-foreground">Total Collections</CardTitle>
              <CardDescription>Revenue breakdown by income source</CardDescription>
            </div>
            
            <Tabs value={activeCollectionTab} onValueChange={setActiveCollectionTab}>
              <TabsList className="grid w-full grid-cols-3 lg:w-[300px]">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="yesterday">Yesterday</TabsTrigger>
                <TabsTrigger value="thisMonth">This Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Horizontal Bar Chart */}
            <div className="space-y-4">
              {collectionBreakdownData.map((item, index) => {
                const percentage = (item.value / mockData.collections[activeCollectionTab as keyof typeof mockData.collections].total) * 100;
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                      <span className="text-sm font-bold text-foreground">
                        AED {item.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: item.color
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {percentage.toFixed(1)}% of total revenue
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pie Chart */}
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={collectionBreakdownData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={40}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {collectionBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`AED ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trends & Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Revenue Trend */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Daily Revenue Trend</CardTitle>
            <CardDescription>Revenue and member acquisition over the week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={mockData.trends.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#666" />
                <YAxis yAxisId="left" stroke="#666" />
                <YAxis yAxisId="right" orientation="right" stroke="#666" />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'revenue' ? `AED ${value.toLocaleString()}` : value,
                    name === 'revenue' ? 'Revenue' : 'New Members'
                  ]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill={COLORS.primary} name="Revenue" />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="members" 
                  stroke={COLORS.secondary} 
                  strokeWidth={3}
                  name="New Members" 
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Targets vs Achievement */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Monthly Performance</CardTitle>
            <CardDescription>Target vs actual revenue comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={mockData.trends.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="month" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  formatter={(value) => [`AED ${value.toLocaleString()}`, '']}
                />
                <Legend />
                <Bar dataKey="target" fill={COLORS.muted} name="Target" />
                <Bar dataKey="revenue" fill={COLORS.primary} name="Actual" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Staff Performance & Retention Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Staff Performance */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Staff Performance</CardTitle>
            <CardDescription>Sales achievement by team members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockData.staffPerformance.map((staff, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{staff.name}</p>
                      <p className="text-sm text-muted-foreground">
                        AED {staff.sales.toLocaleString()} / AED {staff.target.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
                        {staff.achievement.toFixed(1)}%
                      </p>
                      <Progress 
                        value={Math.min(staff.achievement, 100)} 
                        className="w-20 h-2"
                        style={{
                          '--progress-background': getProgressColor(staff.achievement)
                        } as React.CSSProperties}
                      />
                    </div>
                    <Badge variant={staff.achievement >= 100 ? "default" : "secondary"}>
                      {staff.achievement >= 100 ? "Target Met" : "In Progress"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Retention Funnel */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Member Journey</CardTitle>
            <CardDescription>Conversion funnel analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockData.retentionFunnel.map((stage, index) => {
                const percentage = index === 0 ? 100 : (stage.value / mockData.retentionFunnel[0].value) * 100;
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">{stage.name}</span>
                      <span className="text-sm font-bold text-foreground">{stage.value}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-6 relative">
                      <div 
                        className="h-6 rounded-full flex items-center justify-center text-white text-xs font-medium transition-all duration-500"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: stage.color
                        }}
                      >
                        {percentage.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Analytics - SaaS BI Layer */}
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Brain className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Advanced Analytics</h2>
          <Badge variant="outline" className="ml-2">AI Powered</Badge>
        </div>

        <Tabs defaultValue="churn" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="churn">Churn Prediction</TabsTrigger>
            <TabsTrigger value="trainers">Trainer Performance</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="profitability">Profitability</TabsTrigger>
          </TabsList>

          {/* Churn Prediction */}
          <TabsContent value="churn">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-warning" />
                  Member Churn Risk Analysis
                </CardTitle>
                <CardDescription>
                  AI-powered predictions of members at risk of canceling their membership
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockData.churnPrediction.map((member, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 rounded-full bg-destructive/10">
                          <UserX className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{member.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {member.membership} â€¢ Last visit: {member.lastVisit}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">
                            {member.probability}% Risk
                          </p>
                          <Progress 
                            value={member.probability} 
                            className="w-20 h-2"
                            style={{
                              '--progress-background': member.risk === 'High' ? COLORS.error : 
                                                     member.risk === 'Medium' ? COLORS.warning : COLORS.success
                            } as React.CSSProperties}
                          />
                        </div>
                        <Badge variant={getRiskColor(member.risk)}>
                          {member.risk} Risk
                        </Badge>
                        <Button size="sm" variant="outline">
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Contact
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trainer Performance */}
          <TabsContent value="trainers">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center">
                  <Award className="h-5 w-5 mr-2 text-primary" />
                  Trainer Performance Analytics
                </CardTitle>
                <CardDescription>
                  Comprehensive trainer metrics including class attendance and revenue generation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    {mockData.trainerPerformance.map((trainer, index) => (
                      <div key={index} className="p-4 rounded-lg border border-border/50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-medium text-foreground">{trainer.name}</p>
                            <div className="flex items-center space-x-1 mt-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-current" />
                              <span className="text-sm text-muted-foreground">{trainer.rating}</span>
                            </div>
                          </div>
                          <Badge variant="default">
                            AED {trainer.revenue.toLocaleString()}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Classes</p>
                            <p className="font-medium text-foreground">{trainer.classes}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Attendance</p>
                            <p className="font-medium text-foreground">{trainer.attendance}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartsBarChart data={mockData.trainerPerformance}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis dataKey="name" stroke="#666" />
                        <YAxis stroke="#666" />
                        <Tooltip 
                          formatter={(value) => [`AED ${value.toLocaleString()}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" fill={COLORS.primary} />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Engagement Analytics */}
          <TabsContent value="engagement">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Community Feature Usage</CardTitle>
                  <CardDescription>Most used community features and engagement rates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockData.engagementAnalytics.communityFeatures.map((feature, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-foreground">{feature.feature}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-muted-foreground">{feature.usage}% usage</span>
                            <span className="text-xs font-medium text-foreground">{feature.engagement}% engagement</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="h-2 rounded-full transition-all duration-500"
                              style={{ 
                                width: `${feature.usage}%`,
                                backgroundColor: COLORS.primary
                              }}
                            />
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="h-2 rounded-full transition-all duration-500"
                              style={{ 
                                width: `${feature.engagement}%`,
                                backgroundColor: COLORS.secondary
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Engagement vs Renewal Correlation</CardTitle>
                  <CardDescription>Relationship between community engagement and member renewals</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsLineChart data={mockData.engagementAnalytics.correlationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="engagement" stroke="#666" label={{ value: 'Engagement %', position: 'insideBottom', offset: -5 }} />
                      <YAxis stroke="#666" label={{ value: 'Renewal Rate %', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        formatter={(value, name) => [`${value}%`, name === 'renewal' ? 'Renewal Rate' : 'Engagement']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="renewal" 
                        stroke={COLORS.success} 
                        strokeWidth={3}
                        dot={{ fill: COLORS.success, strokeWidth: 2, r: 4 }}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Profitability Dashboard */}
          <TabsContent value="profitability">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Revenue Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Revenue</span>
                      <span className="font-bold text-foreground">AED 325,000</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Operating Costs</span>
                      <span className="font-medium text-foreground">AED 180,000</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">Net Profit</span>
                      <span className="font-bold text-success">AED 145,000</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Profit Margin</span>
                      <Badge variant="default">44.6%</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Cost Center Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { name: "Staff Salaries", amount: 85000, percentage: 47.2 },
                      { name: "Utilities", amount: 28000, percentage: 15.6 },
                      { name: "Equipment", amount: 32000, percentage: 17.8 },
                      { name: "Marketing", amount: 18000, percentage: 10.0 },
                      { name: "Other", amount: 17000, percentage: 9.4 }
                    ].map((cost, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">{cost.name}</span>
                        <div className="text-right">
                          <span className="text-sm font-medium text-foreground">
                            AED {cost.amount.toLocaleString()}
                          </span>
                          <p className="text-xs text-muted-foreground">{cost.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Key Ratios</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: "Revenue per Member", value: "AED 260", trend: "up" },
                      { label: "Customer Lifetime Value", value: "AED 2,850", trend: "up" },
                      { label: "Acquisition Cost", value: "AED 285", trend: "down" },
                      { label: "Churn Rate", value: "10.5%", trend: "down" }
                    ].map((ratio, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">{ratio.label}</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-foreground">{ratio.value}</span>
                          {ratio.trend === "up" ? (
                            <TrendingUp className="h-4 w-4 text-success" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-success" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Items & Recommendations */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center">
            <Zap className="h-5 w-5 mr-2 text-primary" />
            AI Recommendations
          </CardTitle>
          <CardDescription>
            Smart insights and action items based on your gym's performance data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              {
                type: "success",
                icon: CheckCircle,
                title: "Strong Performance",
                message: "Your weekend revenue is 35% higher than weekdays. Consider expanding weekend class offerings.",
                action: "Schedule More Classes"
              },
              {
                type: "warning",
                icon: AlertTriangle,
                title: "Attention Needed",
                message: "5 high-value members haven't visited in 10+ days. Immediate outreach recommended.",
                action: "Contact Members"
              },
              {
                type: "info",
                icon: Brain,
                title: "Growth Opportunity",
                message: "Personal training sessions show 89% satisfaction. Consider promoting PT packages more.",
                action: "Launch PT Campaign"
              },
              {
                type: "success",
                icon: Trophy,
                title: "Achievement",
                message: "You've exceeded your monthly target by 12.5%. Great work team!",
                action: "Celebrate Success"
              }
            ].map((recommendation, index) => (
              <div key={index} className="flex items-start space-x-3 p-4 rounded-lg border border-border/50">
                <div className={`p-2 rounded-full ${
                  recommendation.type === 'success' ? 'bg-success/10' :
                  recommendation.type === 'warning' ? 'bg-warning/10' :
                  'bg-primary/10'
                }`}>
                  <recommendation.icon className={`h-4 w-4 ${
                    recommendation.type === 'success' ? 'text-success' :
                    recommendation.type === 'warning' ? 'text-warning' :
                    'text-primary'
                  }`} />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="font-medium text-foreground">{recommendation.title}</p>
                  <p className="text-sm text-muted-foreground">{recommendation.message}</p>
                  <Button size="sm" variant="outline" className="text-xs">
                    {recommendation.action}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
