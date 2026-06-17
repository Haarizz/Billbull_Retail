import React, { useState, useMemo, useCallback } from 'react';
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Separator } from "../../components/ui/separator";
import { Progress } from "../../components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts';
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Award,
  Calendar as CalendarIcon,
  Filter,
  Download,
  Search,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Star,
  MessageSquare,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Zap,
  Gift,
  Share,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Hash,
  Percent,
  DollarSign,
  Calendar as CalendarAlt,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  X,
  Info
} from 'lucide-react';
import { toast } from "sonner";
import { format, addDays, subDays, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "../../components/ui/utils";

// Types and interfaces
interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  membershipPlan: string;
  joinDate: Date;
  status: 'active' | 'inactive' | 'frozen' | 'expired';
  acquisitionSource: 'referral' | 'campaign' | 'walk-in' | 'online' | 'social';
  referredBy?: string;
  lifetimeValue: number;
  lastActivity: Date;
  engagementScore: number;
  totalSessions: number;
  monthsSinceFlex: number;
  avatar?: string;
  branch: string;
  campaignId?: string;
}

interface AcquisitionData {
  month: string;
  newMembers: number;
  retainedMembers: number;
  churnedMembers: number;
  totalMembers: number;
  acquisitionCost: number;
  revenue: number;
}

interface RetentionCohort {
  cohort: string;
  month0: number;
  month1: number;
  month2: number;
  month3: number;
  month6: number;
  month12: number;
}

interface EngagementMetric {
  memberId: string;
  memberName: string;
  totalSessions: number;
  lastActivity: Date;
  avgSessionsPerWeek: number;
  messageResponses: number;
  campaignParticipation: number;
  feedbackSubmissions: number;
  engagementScore: number;
  trend: 'up' | 'down' | 'stable';
}

interface CampaignAnalytics {
  id: string;
  name: string;
  type: 'referral' | 'social' | 'email' | 'promo';
  startDate: Date;
  endDate: Date;
  status: 'active' | 'completed' | 'draft';
  reach: number;
  engagement: number;
  conversions: number;
  cost: number;
  revenue: number;
  roi: number;
}

export function MemberConnectAnalytics() {
  const [activeTab, setActiveTab] = useState('overview');  
  const [dateRange, setDateRange] = useState('month');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);

  // Sample data - in real app this would come from your backend
  const acquisitionData: AcquisitionData[] = [
    { month: 'Jan', newMembers: 45, retainedMembers: 320, churnedMembers: 12, totalMembers: 353, acquisitionCost: 4500, revenue: 84000 },
    { month: 'Feb', newMembers: 52, retainedMembers: 341, churnedMembers: 8, totalMembers: 385, acquisitionCost: 5200, revenue: 89000 },
    { month: 'Mar', newMembers: 38, retainedMembers: 377, churnedMembers: 15, totalMembers: 400, acquisitionCost: 3800, revenue: 91000 },
    { month: 'Apr', newMembers: 67, retainedMembers: 385, churnedMembers: 22, totalMembers: 430, acquisitionCost: 6700, revenue: 96000 },
    { month: 'May', newMembers: 73, retainedMembers: 408, churnedMembers: 18, totalMembers: 463, acquisitionCost: 7300, revenue: 102000 },
    { month: 'Jun', newMembers: 61, retainedMembers: 445, churnedMembers: 25, totalMembers: 481, acquisitionCost: 6100, revenue: 105000 }
  ];

  const membershipDistribution = [
    { name: 'Premium Annual', value: 186, percentage: 38.7, color: '#2563eb' },
    { name: 'Premium Monthly', value: 134, percentage: 27.9, color: '#059669' },
    { name: 'Standard Monthly', value: 89, percentage: 18.5, color: '#dc2626' },
    { name: 'Basic', value: 72, percentage: 15.0, color: '#7c3aed' }
  ];

  const acquisitionSources = [
    { name: 'Referrals', value: 142, percentage: 29.5, color: '#2563eb' },
    { name: 'Online Marketing', value: 118, percentage: 24.5, color: '#059669' },
    { name: 'Walk-ins', value: 95, percentage: 19.8, color: '#dc2626' },
    { name: 'Social Media', value: 76, percentage: 15.8, color: '#7c3aed' },
    { name: 'Campaigns', value: 50, percentage: 10.4, color: '#ea580c' }
  ];

  const retentionCohorts: RetentionCohort[] = [
    { cohort: 'Jan 2024', month0: 45, month1: 42, month2: 38, month3: 35, month6: 28, month12: 0 },
    { cohort: 'Feb 2024', month0: 52, month1: 48, month2: 44, month3: 40, month6: 32, month12: 0 },
    { cohort: 'Mar 2024', month0: 38, month1: 35, month2: 32, month3: 29, month6: 0, month12: 0 },
    { cohort: 'Apr 2024', month0: 67, month1: 61, month2: 56, month3: 0, month6: 0, month12: 0 },
    { cohort: 'May 2024', month0: 73, month1: 68, month2: 0, month3: 0, month6: 0, month12: 0 },
    { cohort: 'Jun 2024', month0: 61, month1: 0, month2: 0, month3: 0, month6: 0, month12: 0 }
  ];

  const engagementMetrics: EngagementMetric[] = [
    {
      memberId: '1',
      memberName: 'John Smith',
      totalSessions: 24,
      lastActivity: new Date(),
      avgSessionsPerWeek: 4.2,
      messageResponses: 15,
      campaignParticipation: 8,
      feedbackSubmissions: 12,
      engagementScore: 92,
      trend: 'up'
    },
    {
      memberId: '2',
      memberName: 'Sarah Johnson',
      totalSessions: 18,
      lastActivity: subDays(new Date(), 2),
      avgSessionsPerWeek: 3.1,
      messageResponses: 12,
      campaignParticipation: 6,
      feedbackSubmissions: 8,
      engagementScore: 78,
      trend: 'stable'
    },
    {
      memberId: '3',
      memberName: 'Mike Chen',
      totalSessions: 31,
      lastActivity: subDays(new Date(), 1),
      avgSessionsPerWeek: 5.2,
      messageResponses: 20,
      campaignParticipation: 12,
      feedbackSubmissions: 18,
      engagementScore: 96,
      trend: 'up'
    },
    {
      memberId: '4',
      memberName: 'Lisa Ahmed',
      totalSessions: 8,
      lastActivity: subDays(new Date(), 7),
      avgSessionsPerWeek: 1.8,
      messageResponses: 3,
      campaignParticipation: 2,
      feedbackSubmissions: 1,
      engagementScore: 34,
      trend: 'down'
    }
  ];

  const campaignAnalytics: CampaignAnalytics[] = [
    {
      id: '1',
      name: 'Summer Fitness Challenge',
      type: 'promo',
      startDate: subDays(new Date(), 30),
      endDate: addDays(new Date(), 30),
      status: 'active',
      reach: 2400,
      engagement: 450,
      conversions: 67,
      cost: 8500,
      revenue: 25000,
      roi: 194
    },
    {
      id: '2',
      name: 'Referral Rewards Program',
      type: 'referral',
      startDate: subDays(new Date(), 90),
      endDate: addDays(new Date(), 270),
      status: 'active',
      reach: 1800,
      engagement: 340,
      conversions: 142,
      cost: 12000,
      revenue: 68000,
      roi: 467
    },
    {
      id: '3',
      name: 'New Year Resolution',
      type: 'social',
      startDate: subDays(new Date(), 150),
      endDate: subDays(new Date(), 90),
      status: 'completed',
      reach: 3200,
      engagement: 680,
      conversions: 89,
      cost: 15000,
      revenue: 42000,
      roi: 180
    }
  ];

  const funnelData = [
    { name: 'Reached', value: 3200, fill: '#2563eb' },
    { name: 'Engaged', value: 1200, fill: '#3b82f6' },
    { name: 'Interested', value: 650, fill: '#60a5fa' },
    { name: 'Trialed', value: 320, fill: '#93c5fd' },
    { name: 'Converted', value: 142, fill: '#dbeafe' }
  ];

  // Calculate key metrics
  const analytics = useMemo(() => {
    const currentMonth = acquisitionData[acquisitionData.length - 1];
    const previousMonth = acquisitionData[acquisitionData.length - 2];
    
    const totalMembers = currentMonth.totalMembers;
    const newMembersThisMonth = currentMonth.newMembers;
    const churnRate = (currentMonth.churnedMembers / (currentMonth.retainedMembers + currentMonth.churnedMembers)) * 100;
    const retentionRate = 100 - churnRate;
    const avgEngagement = engagementMetrics.reduce((sum, m) => sum + m.engagementScore, 0) / engagementMetrics.length;
    
    // Calculate growth rates
    const memberGrowth = previousMonth ? ((currentMonth.totalMembers - previousMonth.totalMembers) / previousMonth.totalMembers) * 100 : 0;
    const newMemberGrowth = previousMonth ? ((currentMonth.newMembers - previousMonth.newMembers) / previousMonth.newMembers) * 100 : 0;
    const revenueGrowth = previousMonth ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100 : 0;
    
    // Calculate acquisition cost and LTV
    const avgAcquisitionCost = currentMonth.acquisitionCost / currentMonth.newMembers;
    const avgLTV = currentMonth.revenue / currentMonth.totalMembers * 12; // Annualized
    
    return {
      totalMembers,
      newMembersThisMonth,
      churnRate,
      retentionRate,
      avgEngagement,
      memberGrowth,
      newMemberGrowth,
      revenueGrowth,
      avgAcquisitionCost,
      avgLTV,
      ltvcacRatio: avgLTV / avgAcquisitionCost
    };
  }, [acquisitionData, engagementMetrics]);

  // Handle export functionality
  const handleExport = useCallback(async (format: 'csv' | 'pdf') => {
    setIsExporting(true);
    
    // Simulate export process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    toast.success(`Analytics data exported as ${format.toUpperCase()}!`);
    setIsExporting(false);
  }, []);

  // Get trend indicator
  const getTrendIcon = (value: number, reverse = false) => {
    const isPositive = reverse ? value < 0 : value > 0;
    return isPositive ? (
      <ArrowUpRight className="h-4 w-4 text-green-600" />
    ) : (
      <ArrowDownRight className="h-4 w-4 text-red-600" />
    );
  };

  const getTrendColor = (value: number, reverse = false) => {
    const isPositive = reverse ? value < 0 : value > 0;
    return isPositive ? 'text-green-600' : 'text-red-600';
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Member Connect Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive insights into member acquisition, retention, and engagement
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={() => handleExport('csv')} disabled={isExporting}>
            {isExporting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('pdf')} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button onClick={() => toast.success('Data refreshed!')}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members, campaigns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  <SelectItem value="downtown">Downtown</SelectItem>
                  <SelectItem value="westside">Westside</SelectItem>
                  <SelectItem value="northside">Northside</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Plan Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="premium-annual">Premium Annual</SelectItem>
                  <SelectItem value="premium-monthly">Premium Monthly</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <Filter className="mr-2 h-4 w-4" />
                Advanced
                {showAdvancedFilters ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          </div>

          {showAdvancedFilters && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <Label>Acquisition Source</Label>
                  <Select value={selectedSource} onValueChange={setSelectedSource}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="referral">Referrals</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="walk-in">Walk-in</SelectItem>
                      <SelectItem value="social">Social Media</SelectItem>
                      <SelectItem value="campaign">Campaigns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Custom Date From</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateFrom ? format(customDateFrom, 'MMM dd, yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start">
                      <Calendar
                        mode="single"
                        selected={customDateFrom}
                        onSelect={setCustomDateFrom}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Custom Date To</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateTo ? format(customDateTo, 'MMM dd, yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start">
                      <Calendar
                        mode="single"
                        selected={customDateTo}
                        onSelect={setCustomDateTo}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {
                    setCustomDateFrom(undefined);
                    setCustomDateTo(undefined);
                    setSelectedBranch('all');
                    setSelectedPlan('all');
                    setSelectedSource('all');
                    setSearchTerm('');
                  }}>
                    <X className="mr-2 h-4 w-4" />
                    Clear Filters
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{analytics.totalMembers.toLocaleString()}</p>
                <div className="flex items-center text-sm">
                  {getTrendIcon(analytics.memberGrowth)}
                  <span className={cn("ml-1", getTrendColor(analytics.memberGrowth))}>
                    {Math.abs(analytics.memberGrowth).toFixed(1)}%
                  </span>
                </div>
              </div>
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">New Members</p>
                <p className="text-2xl font-bold text-green-600">{analytics.newMembersThisMonth}</p>
                <div className="flex items-center text-sm">
                  {getTrendIcon(analytics.newMemberGrowth)}
                  <span className={cn("ml-1", getTrendColor(analytics.newMemberGrowth))}>
                    {Math.abs(analytics.newMemberGrowth).toFixed(1)}%
                  </span>
                </div>
              </div>
              <UserPlus className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Retention Rate</p>
                <p className="text-2xl font-bold text-purple-600">{analytics.retentionRate.toFixed(1)}%</p>
                <div className="flex items-center text-sm">
                  {getTrendIcon(2.3)}
                  <span className="ml-1 text-green-600">2.3%</span>
                </div>
              </div>
              <UserCheck className="h-6 w-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Churn Rate</p>
                <p className="text-2xl font-bold text-red-600">{analytics.churnRate.toFixed(1)}%</p>
                <div className="flex items-center text-sm">
                  {getTrendIcon(-1.2, true)}
                  <span className="ml-1 text-green-600">1.2%</span>
                </div>
              </div>
              <UserX className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Engagement</p>
                <p className="text-2xl font-bold text-orange-600">{analytics.avgEngagement.toFixed(0)}</p>
                <div className="flex items-center text-sm">
                  {getTrendIcon(5.7)}
                  <span className="ml-1 text-green-600">5.7%</span>
                </div>
              </div>
              <Activity className="h-6 w-6 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">LTV:CAC Ratio</p>
                <p className="text-2xl font-bold text-indigo-600">{analytics.ltvcacRatio.toFixed(1)}:1</p>
                <div className="flex items-center text-sm">
                  {getTrendIcon(12.5)}
                  <span className="ml-1 text-green-600">12.5%</span>
                </div>
              </div>
              <Target className="h-6 w-6 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Member Growth Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <LineChartIcon className="mr-2 h-5 w-5" />
                  Member Growth Trend
                </CardTitle>
                <CardDescription>New vs retained members over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={acquisitionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="newMembers" stroke="#10b981" strokeWidth={3} name="New Members" />
                    <Line type="monotone" dataKey="retainedMembers" stroke="#3b82f6" strokeWidth={3} name="Retained Members" />
                    <Line type="monotone" dataKey="totalMembers" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" name="Total Members" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Membership Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChartIcon className="mr-2 h-5 w-5" />
                  Membership Distribution
                </CardTitle>
                <CardDescription>Current members by plan type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={membershipDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {membershipDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Acquisition Sources */}
            <Card>
              <CardHeader>
                <CardTitle>Acquisition Sources</CardTitle>
                <CardDescription>Where new members are coming from</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {acquisitionSources.map((source) => (
                  <div key={source.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{source.name}</span>
                      <span className="text-muted-foreground">{source.value} ({source.percentage}%)</span>
                    </div>
                    <Progress value={source.percentage} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Revenue Growth */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="mr-2 h-5 w-5" />
                  Revenue Growth
                </CardTitle>
                <CardDescription>Monthly revenue and acquisition costs</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={acquisitionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`AED ${value.toLocaleString()}`, '']}
                      content={<CustomTooltip />}
                    />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue (AED)" />
                    <Bar dataKey="acquisitionCost" fill="#f59e0b" name="Acquisition Cost (AED)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Acquisition Tab */}
        <TabsContent value="acquisition" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Acquisition Funnel */}
            <Card>
              <CardHeader>
                <CardTitle>Acquisition Funnel</CardTitle>
                <CardDescription>Member acquisition process breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <FunnelChart>
                    <Tooltip />
                    <Funnel
                      dataKey="value"
                      data={funnelData}
                      isAnimationActive
                    >
                      <LabelList position="center" fill="#fff" stroke="none" />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Acquisition Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Acquisition Metrics</CardTitle>
                <CardDescription>Key performance indicators for member acquisition</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">AED {analytics.avgAcquisitionCost.toFixed(0)}</p>
                    <p className="text-sm text-muted-foreground">Avg Cost per Acquisition</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">AED {analytics.avgLTV.toFixed(0)}</p>
                    <p className="text-sm text-muted-foreground">Avg Lifetime Value</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Conversion Rate</span>
                    <span className="text-sm text-muted-foreground">4.4%</span>
                  </div>
                  <Progress value={4.4} className="h-2" />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Trial to Membership</span>
                    <span className="text-sm text-muted-foreground">44.4%</span>
                  </div>
                  <Progress value={44.4} className="h-2" />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Lead Quality Score</span>
                    <span className="text-sm text-muted-foreground">78%</span>
                  </div>
                  <Progress value={78} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Acquisitions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent New Members</CardTitle>
              <CardDescription>Latest member acquisitions with source tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>JS</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">John Smith</p>
                          <p className="text-sm text-muted-foreground">john@email.com</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Premium Annual</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800">Referral</Badge>
                    </TableCell>
                    <TableCell>{format(new Date(), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>AED 2,400</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>SC</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">Sarah Chen</p>
                          <p className="text-sm text-muted-foreground">sarah@email.com</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Premium Monthly</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Online</Badge>
                    </TableCell>
                    <TableCell>{format(subDays(new Date(), 1), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>AED 250</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>MA</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">Mike Ahmed</p>
                          <p className="text-sm text-muted-foreground">mike@email.com</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Standard Monthly</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-purple-100 text-purple-800">Walk-in</Badge>
                    </TableCell>
                    <TableCell>{format(subDays(new Date(), 2), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>AED 180</TableCell>
                    <TableCell>
                      <Badge className="bg-yellow-100 text-yellow-800">Trial</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retention Tab */}
        <TabsContent value="retention" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Retention Cohort Analysis */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Cohort Retention Analysis</CardTitle>
                <CardDescription>Member retention rates by signup month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Cohort</th>
                        <th className="text-center p-2 font-medium">Month 0</th>
                        <th className="text-center p-2 font-medium">Month 1</th>
                        <th className="text-center p-2 font-medium">Month 2</th>
                        <th className="text-center p-2 font-medium">Month 3</th>
                        <th className="text-center p-2 font-medium">Month 6</th>
                        <th className="text-center p-2 font-medium">Month 12</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retentionCohorts.map((cohort) => (
                        <tr key={cohort.cohort} className="border-b">
                          <td className="p-2 font-medium">{cohort.cohort}</td>
                          <td className="p-2 text-center">
                            <div className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm">
                              {cohort.month0}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            {cohort.month1 > 0 ? (
                              <div className={cn(
                                "px-2 py-1 rounded text-sm",
                                (cohort.month1 / cohort.month0) >= 0.9 ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200" :
                                (cohort.month1 / cohort.month0) >= 0.7 ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200" :
                                "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
                              )}>
                                {cohort.month1} ({((cohort.month1 / cohort.month0) * 100).toFixed(0)}%)
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {cohort.month2 > 0 ? (
                              <div className={cn(
                                "px-2 py-1 rounded text-sm",
                                (cohort.month2 / cohort.month0) >= 0.8 ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200" :
                                (cohort.month2 / cohort.month0) >= 0.6 ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200" :
                                "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
                              )}>
                                {cohort.month2} ({((cohort.month2 / cohort.month0) * 100).toFixed(0)}%)
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {cohort.month3 > 0 ? (
                              <div className={cn(
                                "px-2 py-1 rounded text-sm",
                                (cohort.month3 / cohort.month0) >= 0.7 ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200" :
                                (cohort.month3 / cohort.month0) >= 0.5 ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200" :
                                "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
                              )}>
                                {cohort.month3} ({((cohort.month3 / cohort.month0) * 100).toFixed(0)}%)
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {cohort.month6 > 0 ? (
                              <div className={cn(
                                "px-2 py-1 rounded text-sm",
                                (cohort.month6 / cohort.month0) >= 0.6 ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200" :
                                (cohort.month6 / cohort.month0) >= 0.4 ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200" :
                                "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
                              )}>
                                {cohort.month6} ({((cohort.month6 / cohort.month0) * 100).toFixed(0)}%)
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {cohort.month12 > 0 ? (
                              <div className="bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200 px-2 py-1 rounded text-sm">
                                {cohort.month12} ({((cohort.month12 / cohort.month0) * 100).toFixed(0)}%)
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Retention Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Award className="mr-2 h-5 w-5 text-yellow-600" />
                  Best Performing Cohort
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">Feb 2024</p>
                  <p className="text-sm text-muted-foreground">84% retention at 3 months</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Initial Size</span>
                      <span className="font-medium">52 members</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Current Active</span>
                      <span className="font-medium text-green-600">40 members</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="mr-2 h-5 w-5 text-red-600" />
                  At-Risk Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">23</p>
                  <p className="text-sm text-muted-foreground">Members at risk of churning</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>No activity 14+ days</span>
                      <span className="font-medium">15</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Low engagement score</span>
                      <span className="font-medium">8</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
                  Retention Initiatives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Win-back Campaign</span>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Loyalty Program</span>
                    <Badge className="bg-blue-100 text-blue-800">Planning</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Engagement Rewards</span>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Engagement Score Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Score Distribution</CardTitle>
                <CardDescription>Member engagement levels across your gym</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[
                    { range: '90-100', count: 45, color: '#10b981' },
                    { range: '80-89', count: 78, color: '#3b82f6' },
                    { range: '70-79', count: 92, color: '#f59e0b' },
                    { range: '60-69', count: 67, color: '#ef4444' },
                    { range: '0-59', count: 23, color: '#991b1b' }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Engagement Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Trends</CardTitle>
                <CardDescription>Average engagement score over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={[
                    { month: 'Jan', score: 74, sessions: 1250 },
                    { month: 'Feb', score: 76, sessions: 1340 },
                    { month: 'Mar', score: 78, sessions: 1420 },
                    { month: 'Apr', score: 81, sessions: 1580 },
                    { month: 'May', score: 83, sessions: 1650 },
                    { month: 'Jun', score: 85, sessions: 1720 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Engagement Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>Member Engagement Details</CardTitle>
              <CardDescription>Detailed engagement metrics for individual members</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Avg/Week</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Campaigns</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {engagementMetrics.map((metric) => (
                    <TableRow key={metric.memberId}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{metric.memberName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{metric.memberName}</p>
                            <p className="text-sm text-muted-foreground">
                              Last active: {format(metric.lastActivity, 'MMM dd')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{metric.totalSessions}</TableCell>
                      <TableCell>{metric.avgSessionsPerWeek.toFixed(1)}</TableCell>
                      <TableCell>{metric.messageResponses}</TableCell>
                      <TableCell>{metric.campaignParticipation}</TableCell>
                      <TableCell>{metric.feedbackSubmissions}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className={cn(
                            "font-medium",
                            metric.engagementScore >= 80 ? "text-green-600" :
                            metric.engagementScore >= 60 ? "text-yellow-600" : "text-red-600"
                          )}>
                            {metric.engagementScore}
                          </span>
                          <Progress 
                            value={metric.engagementScore} 
                            className="w-16 h-2" 
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          {metric.trend === 'up' && <TrendingUp className="h-4 w-4 text-green-600" />}
                          {metric.trend === 'down' && <TrendingDown className="h-4 w-4 text-red-600" />}
                          {metric.trend === 'stable' && <div className="h-4 w-4 bg-gray-400 rounded-full"></div>}
                          <span className={cn(
                            "ml-2 text-sm",
                            metric.trend === 'up' ? "text-green-600" :
                            metric.trend === 'down' ? "text-red-600" : "text-gray-600"
                          )}>
                            {metric.trend}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campaign Performance Cards */}
            {campaignAnalytics.map((campaign) => (
              <Card key={campaign.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    <Badge className={cn(
                      campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                      campaign.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    )}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {format(campaign.startDate, 'MMM dd')} - {format(campaign.endDate, 'MMM dd, yyyy')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-xl font-bold text-blue-600">{campaign.reach.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Reach</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xl font-bold text-green-600">{campaign.conversions}</p>
                      <p className="text-xs text-muted-foreground">Conversions</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Engagement Rate</span>
                      <span className="font-medium">{((campaign.engagement / campaign.reach) * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={(campaign.engagement / campaign.reach) * 100} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Conversion Rate</span>
                      <span className="font-medium">{((campaign.conversions / campaign.reach) * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={(campaign.conversions / campaign.reach) * 100} className="h-2" />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Cost</span>
                      <span className="font-medium">AED {campaign.cost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Revenue</span>
                      <span className="font-medium text-green-600">AED {campaign.revenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">ROI</span>
                      <span className={cn(
                        "font-bold",
                        campaign.roi > 200 ? "text-green-600" :
                        campaign.roi > 100 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {campaign.roi}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Campaign ROI Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance Comparison</CardTitle>
              <CardDescription>ROI and conversion rates across all campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={campaignAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="roi" fill="#10b981" name="ROI %" />
                  <Bar yAxisId="right" dataKey="conversions" fill="#3b82f6" name="Conversions" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
