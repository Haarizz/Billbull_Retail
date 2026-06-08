import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Separator } from "../../components/ui/separator";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart } from 'recharts';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Target,
  Eye,
  Filter,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Minus,
  UserCheck,
  UserX,
  UserPlus,
  Award,
  Activity,
  Heart,
  DollarSign,
  MapPin,
  Mail,
  Phone,
  Cake,
  Briefcase,
  GraduationCap,
  Home,
  Star,
  ThumbsUp,
  Zap,
  TrendingUpDown
} from 'lucide-react';

interface MemberAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
  memberAnalytics: Array<{
    segment: string;
    count: number;
    engagement: number;
    ltv: number;
  }>;
  formatCurrency: (amount: number) => string;
  getCurrentPeriod: () => string;
}

export function MemberAnalyticsDialog({
  open,
  onOpenChange,
  defaultTab = 'segments',
  memberAnalytics,
  formatCurrency,
  getCurrentPeriod
}: MemberAnalyticsDialogProps) {
  const [selectedSegment, setSelectedSegment] = React.useState('all');
  const [timeRange, setTimeRange] = React.useState('6months');

  // Enhanced Member Segments
  const memberSegments = [
    {
      segment: 'Premium Members',
      count: 156,
      percentage: 18.4,
      engagement: 95,
      ltv: 4500,
      retention: 96.2,
      churnRate: 3.8,
      avgAge: 38,
      monthlyFee: 799,
      avgVisits: 18.5,
      color: '#8b5cf6'
    },
    {
      segment: 'Standard Members',
      count: 423,
      percentage: 49.9,
      engagement: 78,
      ltv: 2800,
      retention: 88.5,
      churnRate: 11.5,
      avgAge: 32,
      monthlyFee: 549,
      avgVisits: 12.3,
      color: '#3b82f6'
    },
    {
      segment: 'Basic Members',
      count: 268,
      percentage: 31.6,
      engagement: 65,
      ltv: 1600,
      retention: 82.1,
      churnRate: 17.9,
      avgAge: 28,
      monthlyFee: 349,
      avgVisits: 8.7,
      color: '#10b981'
    }
  ];

  // Retention Trends
  const retentionTrends = [
    { month: 'Jan', retained: 87.2, churned: 12.8, newMembers: 45 },
    { month: 'Feb', retained: 88.1, churned: 11.9, newMembers: 52 },
    { month: 'Mar', retained: 89.5, churned: 10.5, newMembers: 48 },
    { month: 'Apr', retained: 88.9, churned: 11.1, newMembers: 38 },
    { month: 'May', retained: 89.5, churned: 10.5, newMembers: 56 },
    { month: 'Jun', retained: 90.2, churned: 9.8, newMembers: 62 }
  ];

  // Engagement Metrics by Segment
  const engagementBySegment = [
    { segment: 'Premium', checkIns: 95, classes: 88, pt: 92, events: 78 },
    { segment: 'Standard', checkIns: 78, classes: 72, pt: 45, events: 52 },
    { segment: 'Basic', checkIns: 65, classes: 58, pt: 15, events: 28 }
  ];

  // Member Growth Over Time
  const memberGrowth = [
    { month: 'Jan', total: 789, new: 45, churned: 32, net: 13 },
    { month: 'Feb', total: 801, new: 52, churned: 40, net: 12 },
    { month: 'Mar', total: 823, new: 48, churned: 26, net: 22 },
    { month: 'Apr', total: 835, new: 38, churned: 26, net: 12 },
    { month: 'May', total: 847, new: 56, churned: 44, net: 12 },
    { month: 'Jun', total: 862, new: 62, churned: 47, net: 15 }
  ];

  // Demographics - Age Distribution
  const ageDistribution = [
    { ageGroup: '18-24', count: 142, percentage: 16.8, avgSpend: 349 },
    { ageGroup: '25-34', count: 298, percentage: 35.2, avgSpend: 485 },
    { ageGroup: '35-44', count: 245, percentage: 29.0, avgSpend: 625 },
    { ageGroup: '45-54', count: 127, percentage: 15.0, avgSpend: 698 },
    { ageGroup: '55+', count: 35, percentage: 4.1, avgSpend: 545 }
  ];

  // Demographics - Gender
  const genderDistribution = [
    { gender: 'Male', count: 482, percentage: 56.9, color: '#3b82f6' },
    { gender: 'Female', count: 365, percentage: 43.1, color: '#ec4899' }
  ];

  // Lifetime Value Analysis
  const ltvAnalysis = [
    {
      segment: 'Premium',
      avgLTV: 4500,
      avgTenure: 18,
      monthlyRevenue: 799,
      retentionBonus: 450,
      upsellValue: 320
    },
    {
      segment: 'Standard',
      avgLTV: 2800,
      avgTenure: 14,
      monthlyRevenue: 549,
      retentionBonus: 280,
      upsellValue: 180
    },
    {
      segment: 'Basic',
      avgLTV: 1600,
      avgTenure: 10,
      monthlyRevenue: 349,
      retentionBonus: 150,
      upsellValue: 95
    }
  ];

  // Acquisition Channels
  const acquisitionChannels = [
    { channel: 'Social Media', members: 245, cost: 45, ltv: 2850, roi: 6233 },
    { channel: 'Referrals', members: 189, cost: 25, ltv: 3200, roi: 12700 },
    { channel: 'Walk-ins', members: 156, cost: 0, ltv: 2100, roi: Infinity },
    { channel: 'Google Ads', members: 128, cost: 85, ltv: 2650, roi: 3018 },
    { channel: 'Corporate', members: 89, cost: 120, ltv: 4200, roi: 3400 },
    { channel: 'Events', members: 55, cost: 95, ltv: 2950, roi: 3005 }
  ];

  // Member Activity Levels
  const activityLevels = [
    { level: 'Highly Active', count: 234, percentage: 27.6, visits: '15+ per month', color: '#10b981' },
    { level: 'Active', count: 312, percentage: 36.8, visits: '8-14 per month', color: '#3b82f6' },
    { level: 'Moderate', count: 201, percentage: 23.7, visits: '4-7 per month', color: '#f59e0b' },
    { level: 'Low Activity', count: 78, percentage: 9.2, visits: '1-3 per month', color: '#ef4444' },
    { level: 'Inactive', count: 22, percentage: 2.6, visits: '0 this month', color: '#6b7280' }
  ];

  // Risk Segmentation
  const riskSegmentation = [
    {
      risk: 'High Risk',
      count: 67,
      indicators: 'Decreased visits, payment issues',
      action: 'Immediate outreach',
      priority: 'High'
    },
    {
      risk: 'Medium Risk',
      count: 134,
      indicators: 'Declining engagement',
      action: 'Retention campaign',
      priority: 'Medium'
    },
    {
      risk: 'Low Risk',
      count: 646,
      indicators: 'Stable engagement',
      action: 'Regular check-ins',
      priority: 'Low'
    }
  ];

  // Member Satisfaction Scores
  const satisfactionScores = [
    { category: 'Facilities', score: 4.6, target: 4.5, trend: 'up' },
    { category: 'Staff', score: 4.8, target: 4.7, trend: 'up' },
    { category: 'Classes', score: 4.5, target: 4.6, trend: 'stable' },
    { category: 'Equipment', score: 4.3, target: 4.5, trend: 'down' },
    { category: 'Cleanliness', score: 4.7, target: 4.6, trend: 'up' },
    { category: 'Value for Money', score: 4.4, target: 4.5, trend: 'stable' }
  ];

  // Member Journey Stages
  const journeyStages = [
    { stage: 'New (0-3 months)', count: 187, percentage: 22.1, retention: 78.5 },
    { stage: 'Growing (3-6 months)', count: 156, percentage: 18.4, retention: 85.2 },
    { stage: 'Established (6-12 months)', count: 234, percentage: 27.6, retention: 92.4 },
    { stage: 'Loyal (12-24 months)', count: 189, percentage: 22.3, retention: 95.8 },
    { stage: 'Advocate (24+ months)', count: 81, percentage: 9.6, retention: 97.6 }
  ];

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'High Risk':
        return 'bg-red-100 text-red-800';
      case 'Medium Risk':
        return 'bg-yellow-100 text-yellow-800';
      case 'Low Risk':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="h-6 w-6 text-[#2B7A78]" />
            <span>Member Analytics - {getCurrentPeriod()}</span>
          </DialogTitle>
          <DialogDescription>
            Comprehensive member insights, segmentation, and retention analysis
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="segments">Segments</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="ltv">Lifetime Value</TabsTrigger>
            <TabsTrigger value="growth">Growth</TabsTrigger>
          </TabsList>

          {/* Segments Tab */}
          <TabsContent value="segments" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {memberSegments.map((segment, index) => (
                <Card key={index} className="border-l-4" style={{ borderLeftColor: segment.color }}>
                  <CardHeader>
                    <CardTitle className="text-base">{segment.segment}</CardTitle>
                    <CardDescription>{segment.count} members â€¢ {segment.percentage}%</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly Fee</p>
                        <p className="text-lg font-bold">{formatCurrency(segment.monthlyFee)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Avg LTV</p>
                        <p className="text-lg font-bold">{formatCurrency(segment.ltv)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Retention</p>
                        <p className="text-lg font-bold text-green-600">{segment.retention}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Churn Rate</p>
                        <p className="text-lg font-bold text-red-600">{segment.churnRate}%</p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Engagement Score</span>
                        <span className="font-medium">{segment.engagement}%</span>
                      </div>
                      <Progress value={segment.engagement} className="h-2" />
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Avg Visits/Month</span>
                      <span className="font-medium">{segment.avgVisits}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Avg Age</span>
                      <span className="font-medium">{segment.avgAge} years</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Member Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={memberSegments}
                      dataKey="count"
                      nameKey="segment"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ segment, percentage }) => `${segment}: ${percentage}%`}
                    >
                      {memberSegments.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity Level Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activityLevels.map((level, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: level.color }} />
                          <span className="text-sm font-medium">{level.level}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium">{level.count} members</span>
                          <span className="text-xs text-muted-foreground ml-2">({level.percentage}%)</span>
                        </div>
                      </div>
                      <Progress value={level.percentage} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">{level.visits}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Retention Tab */}
          <TabsContent value="retention" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Retention Rate</p>
                      <p className="text-2xl font-bold text-green-600">90.2%</p>
                      <div className="flex items-center mt-1">
                        <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                        <span className="text-xs text-green-600">+1.3% vs last month</span>
                      </div>
                    </div>
                    <UserCheck className="h-10 w-10 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Churn Rate</p>
                      <p className="text-2xl font-bold text-red-600">9.8%</p>
                      <div className="flex items-center mt-1">
                        <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                        <span className="text-xs text-green-600">-1.3% improvement</span>
                      </div>
                    </div>
                    <UserX className="h-10 w-10 text-red-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Members at Risk</p>
                      <p className="text-2xl font-bold text-orange-600">67</p>
                      <div className="flex items-center mt-1">
                        <AlertTriangle className="h-4 w-4 text-orange-500 mr-1" />
                        <span className="text-xs text-orange-600">Needs attention</span>
                      </div>
                    </div>
                    <AlertTriangle className="h-10 w-10 text-orange-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Retention & Churn Trends</CardTitle>
                <CardDescription>6-month retention performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={retentionTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="retained" fill="#10b981" stroke="#10b981" fillOpacity={0.6} name="Retention %" />
                    <Line type="monotone" dataKey="churned" stroke="#ef4444" strokeWidth={2} name="Churn %" />
                    <Bar dataKey="newMembers" fill="#3b82f6" name="New Members" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risk Segmentation</CardTitle>
                <CardDescription>Members categorized by churn risk</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Risk Level</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead>Indicators</TableHead>
                      <TableHead>Recommended Action</TableHead>
                      <TableHead>Priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riskSegmentation.map((risk, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge className={getRiskColor(risk.risk)}>
                            {risk.risk}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{risk.count}</TableCell>
                        <TableCell className="text-sm">{risk.indicators}</TableCell>
                        <TableCell className="text-sm">{risk.action}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            risk.priority === 'High' ? 'border-red-300 text-red-700' :
                            risk.priority === 'Medium' ? 'border-yellow-300 text-yellow-700' :
                            'border-green-300 text-green-700'
                          }>
                            {risk.priority}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Member Journey Stages</CardTitle>
                <CardDescription>Retention rates by membership duration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {journeyStages.map((stage, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium">{stage.stage}</span>
                        <div className="text-right">
                          <span className="text-sm font-medium">{stage.count} members</span>
                          <span className="text-xs text-green-600 ml-2">({stage.retention}% retention)</span>
                        </div>
                      </div>
                      <Progress value={stage.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Engagement Tab */}
          <TabsContent value="engagement" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Engagement by Member Segment</CardTitle>
                <CardDescription>Activity patterns across membership tiers</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={engagementBySegment}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="segment" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar name="Check-ins" dataKey="checkIns" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                    <Radar name="Classes" dataKey="classes" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                    <Radar name="PT Sessions" dataKey="pt" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                    <Radar name="Events" dataKey="events" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Average Engagement Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Check-ins per Month</span>
                        <span className="text-sm font-medium">12.8</span>
                      </div>
                      <Progress value={85} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Class Attendance</span>
                        <span className="text-sm font-medium">72.5%</span>
                      </div>
                      <Progress value={72.5} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">PT Session Uptake</span>
                        <span className="text-sm font-medium">45.2%</span>
                      </div>
                      <Progress value={45.2} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Event Participation</span>
                        <span className="text-sm font-medium">52.8%</span>
                      </div>
                      <Progress value={52.8} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Member Satisfaction</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {satisfactionScores.map((item, index) => (
                      <div key={index}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm">{item.category}</span>
                          <div className="flex items-center space-x-2">
                            {getTrendIcon(item.trend)}
                            <span className="text-sm font-medium">{item.score}/5</span>
                          </div>
                        </div>
                        <Progress value={(item.score / 5) * 100} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Engagement Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2 p-3 bg-green-50 rounded">
                    <ThumbsUp className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">High Engagement Correlation</p>
                      <p className="text-xs text-green-700">Members attending classes have 87% higher retention rate</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 p-3 bg-blue-50 rounded">
                    <Activity className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Engagement Sweet Spot</p>
                      <p className="text-xs text-blue-700">12-15 visits per month shows optimal engagement without burnout</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 p-3 bg-yellow-50 rounded">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">At-Risk Pattern Detected</p>
                      <p className="text-xs text-yellow-700">Members with declining check-ins for 3+ weeks need outreach</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Demographics Tab */}
          <TabsContent value="demographics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Age Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ageDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="ageGroup" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#3b82f6" name="Members" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Gender Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={genderDistribution}
                        dataKey="count"
                        nameKey="gender"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ gender, percentage }) => `${gender}: ${percentage}%`}
                      >
                        {genderDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Age Group Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Age Group</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                      <TableHead className="text-right">Avg Monthly Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ageDistribution.map((age, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{age.ageGroup}</TableCell>
                        <TableCell className="text-right">{age.count}</TableCell>
                        <TableCell className="text-right">{age.percentage}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(age.avgSpend)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <Cake className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Average Age</p>
                    <p className="text-2xl font-bold">32.4 years</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <MapPin className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Avg Distance</p>
                    <p className="text-2xl font-bold">4.2 km</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <Briefcase className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Professionals</p>
                    <p className="text-2xl font-bold">68%</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <GraduationCap className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Students</p>
                    <p className="text-2xl font-bold">12%</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Lifetime Value Tab */}
          <TabsContent value="ltv" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Average LTV</p>
                      <p className="text-2xl font-bold text-green-600">{formatCurrency(2967)}</p>
                      <p className="text-xs text-green-600 mt-1">Across all segments</p>
                    </div>
                    <DollarSign className="h-10 w-10 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Highest LTV</p>
                      <p className="text-2xl font-bold text-purple-600">{formatCurrency(4500)}</p>
                      <p className="text-xs text-purple-600 mt-1">Premium segment</p>
                    </div>
                    <Award className="h-10 w-10 text-purple-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Tenure</p>
                      <p className="text-2xl font-bold text-blue-600">14 months</p>
                      <p className="text-xs text-blue-600 mt-1">Member lifetime</p>
                    </div>
                    <Clock className="h-10 w-10 text-blue-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lifetime Value by Segment</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Segment</TableHead>
                      <TableHead className="text-right">Avg LTV</TableHead>
                      <TableHead className="text-right">Avg Tenure</TableHead>
                      <TableHead className="text-right">Monthly Revenue</TableHead>
                      <TableHead className="text-right">Retention Bonus</TableHead>
                      <TableHead className="text-right">Upsell Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ltvAnalysis.map((segment, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{segment.segment}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(segment.avgLTV)}</TableCell>
                        <TableCell className="text-right">{segment.avgTenure} months</TableCell>
                        <TableCell className="text-right">{formatCurrency(segment.monthlyRevenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(segment.retentionBonus)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(segment.upsellValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">LTV by Segment Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ltvAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="segment" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="avgLTV" fill="#10b981" name="Average LTV" />
                    <Bar dataKey="retentionBonus" fill="#3b82f6" name="Retention Bonus" />
                    <Bar dataKey="upsellValue" fill="#8b5cf6" name="Upsell Value" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">LTV Optimization Opportunities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2 p-3 bg-purple-50 rounded">
                    <Star className="h-5 w-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-900">Premium Upsell Potential</p>
                      <p className="text-xs text-purple-700">234 standard members show premium usage patterns - potential {formatCurrency(398800)} LTV increase</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 p-3 bg-green-50 rounded">
                    <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Retention Extension Impact</p>
                      <p className="text-xs text-green-700">Extending avg tenure by 3 months would increase total LTV by {formatCurrency(752600)}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 p-3 bg-blue-50 rounded">
                    <Zap className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Cross-sell Opportunity</p>
                      <p className="text-xs text-blue-700">67% of members don't use PT services - estimated {formatCurrency(285000)} additional revenue</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Growth Tab */}
          <TabsContent value="growth" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">New Members (MTD)</p>
                      <p className="text-2xl font-bold text-green-600">62</p>
                      <div className="flex items-center mt-1">
                        <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                        <span className="text-xs text-green-600">+23% vs last month</span>
                      </div>
                    </div>
                    <UserPlus className="h-10 w-10 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Net Growth</p>
                      <p className="text-2xl font-bold text-blue-600">+15</p>
                      <p className="text-xs text-blue-600 mt-1">Members this month</p>
                    </div>
                    <TrendingUpDown className="h-10 w-10 text-blue-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Growth Rate</p>
                      <p className="text-2xl font-bold text-purple-600">1.8%</p>
                      <p className="text-xs text-purple-600 mt-1">Monthly growth</p>
                    </div>
                    <Activity className="h-10 w-10 text-purple-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Member Growth Trends</CardTitle>
                <CardDescription>New members, churned members, and net growth</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={memberGrowth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="new" fill="#10b981" name="New Members" />
                    <Bar dataKey="churned" fill="#ef4444" name="Churned" />
                    <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={3} name="Net Growth" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acquisition Channels Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Cost/Member</TableHead>
                      <TableHead className="text-right">Avg LTV</TableHead>
                      <TableHead className="text-right">ROI %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acquisitionChannels.map((channel, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{channel.channel}</TableCell>
                        <TableCell className="text-right">{channel.members}</TableCell>
                        <TableCell className="text-right">{formatCurrency(channel.cost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(channel.ltv)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-green-100 text-green-800">
                            {channel.roi === Infinity ? 'âˆž' : `${channel.roi}%`}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Growth Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2 p-3 bg-green-50 rounded">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Referrals Performing Best</p>
                      <p className="text-xs text-green-700">Referral channel has highest ROI (12,700%) and best retention rate</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 p-3 bg-blue-50 rounded">
                    <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Corporate Growth Opportunity</p>
                      <p className="text-xs text-blue-700">Corporate members have highest LTV (4,200 AED) - expand B2B efforts</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 p-3 bg-purple-50 rounded">
                    <Award className="h-5 w-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-900">Social Media Success</p>
                      <p className="text-xs text-purple-700">Social media brings most volume (245 members) with strong ROI</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-[#2B7A78] hover:bg-[#236663]">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Button className="bg-[#E63946] hover:bg-[#d32f3f]">
            <FileText className="h-4 w-4 mr-2" />
            Generate PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

