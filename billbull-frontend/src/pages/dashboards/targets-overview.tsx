import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Separator } from "../../components/ui/separator";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  Target,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar as CalendarIcon,
  Filter,
  RefreshCw,
  Download,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Award,
  Eye,
  Bell,
  Activity,
  BarChart3,
  PieChart,
  LineChart,
  Zap,
  Star,
  Gauge,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Crown,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Trophy,
  Flame,
  ArrowUp,
  ArrowDown
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
  AreaChart
} from "recharts";
import { cn } from "../../components/ui/utils";
import { format } from "date-fns";

// Mock data for the dashboard
const institutionTarget = {
  monthly: 50000,
  achieved: 38400,
  percentage: 76.8,
  remaining: 11600,
  daysLeft: 8,
  dailyRequired: 1450
};

const staffPerformanceData = [
  {
    id: "1",
    name: "Sara Al-Rashid",
    role: "Karate Trainer",
    department: "Martial Arts",
    target: 10000,
    achieved: 7200,
    percentage: 72,
    commission: 360,
    status: "on-track",
    lastUpdate: "2 hours ago",
    unitTargets: [
      { service: "Karate", target: 10, achieved: 6, percentage: 60 },
      { service: "Martial Arts", target: 12, achieved: 8, percentage: 67 }
    ],
    salesBreakdown: {
      membership: 4500,
      addons: 1800,
      pos: 900
    },
    trend: "up",
    forecast: 92
  },
  {
    id: "2",
    name: "Looka Johnson", 
    role: "Yoga & Swimming Instructor",
    department: "Wellness",
    target: 12000,
    achieved: 9000,
    percentage: 75,
    commission: 420,
    status: "good",
    lastUpdate: "1 hour ago",
    unitTargets: [
      { service: "Yoga", target: 10, achieved: 8, percentage: 80 },
      { service: "Swimming", target: 15, achieved: 12, percentage: 80 }
    ],
    salesBreakdown: {
      membership: 6000,
      addons: 2100,
      pos: 900
    },
    trend: "up",
    forecast: 98
  },
  {
    id: "3",
    name: "Arshi Hassan",
    role: "MMA & HIIT Trainer",
    department: "High Intensity",
    target: 15000,
    achieved: 10200,
    percentage: 68,
    commission: 510,
    status: "behind",
    lastUpdate: "30 mins ago",
    unitTargets: [
      { service: "MMA", target: 12, achieved: 7, percentage: 58 },
      { service: "HIIT", target: 15, achieved: 10, percentage: 67 }
    ],
    salesBreakdown: {
      membership: 7000,
      addons: 2200,
      pos: 1000
    },
    trend: "down",
    forecast: 85
  },
  {
    id: "4",
    name: "Mery Wilson",
    role: "Reception (Sales)",
    department: "Front Desk",
    target: 8000,
    achieved: 6000,
    percentage: 75,
    commission: 250,
    status: "good",
    lastUpdate: "15 mins ago",
    unitTargets: [
      { service: "Membership Sales", target: 25, achieved: 20, percentage: 80 },
      { service: "POS Products", target: 30, achieved: 18, percentage: 60 }
    ],
    salesBreakdown: {
      membership: 4000,
      addons: 1200,
      pos: 800
    },
    trend: "up",
    forecast: 95
  },
  {
    id: "5",
    name: "Ahmed Al-Mansoori",
    role: "Personal Trainer",
    department: "Personal Training",
    target: 18000,
    achieved: 15600,
    percentage: 87,
    commission: 780,
    status: "excellent",
    lastUpdate: "45 mins ago",
    unitTargets: [
      { service: "PT Sessions", target: 40, achieved: 38, percentage: 95 },
      { service: "Nutrition Plans", target: 20, achieved: 16, percentage: 80 }
    ],
    salesBreakdown: {
      membership: 0,
      addons: 15600,
      pos: 0
    },
    trend: "up",
    forecast: 102
  }
];

const trendData = [
  { date: "Week 1", target: 12500, actual: 11200, forecast: 11200 },
  { date: "Week 2", target: 25000, actual: 22800, forecast: 22800 },
  { date: "Week 3", target: 37500, actual: 35100, forecast: 35100 },
  { date: "Week 4", target: 50000, actual: 38400, forecast: 46800 }
];

const departmentPerformance = [
  { department: "Martial Arts", target: 25000, achieved: 17400, staff: 2, avgPerformance: 69.6 },
  { department: "Wellness", target: 12000, achieved: 9000, staff: 1, avgPerformance: 75.0 },
  { department: "High Intensity", target: 15000, achieved: 10200, staff: 1, avgPerformance: 68.0 },
  { department: "Personal Training", target: 18000, achieved: 15600, staff: 1, avgPerformance: 86.7 },
  { department: "Front Desk", target: 8000, achieved: 6000, staff: 1, avgPerformance: 75.0 }
];

const COLORS = {
  primary: "#0047AB",
  secondary: "#009688", 
  success: "#4CAF50",
  warning: "#FFC107",
  error: "#F44336",
  muted: "#9E9E9E"
};

interface TargetsOverviewProps {
  onNavigate: (section: string) => void;
}

export function TargetsOverview({ onNavigate }: TargetsOverviewProps) {
  const [dateFilter, setDateFilter] = useState("month");
  const [customDate, setCustomDate] = useState<Date | undefined>(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [viewMode, setViewMode] = useState<"revenue" | "units">("revenue");
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [activeAlert, setActiveAlert] = useState(true);

  const toggleRowExpansion = (staffId: string) => {
    setExpandedRows(prev => 
      prev.includes(staffId) 
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "excellent": return "bg-green-100 text-green-800";
      case "good": return "bg-blue-100 text-blue-800";
      case "on-track": return "bg-yellow-100 text-yellow-800";
      case "behind": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "excellent": return <Crown className="h-4 w-4" />;
      case "good": return <ThumbsUp className="h-4 w-4" />;
      case "on-track": return <Clock className="h-4 w-4" />;
      case "behind": return <AlertTriangle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 85) return "bg-green-500";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  const filteredStaffData = useMemo(() => {
    return staffPerformanceData.filter(staff => {
      const matchesDepartment = selectedDepartment === "all" || staff.department === selectedDepartment;
      const matchesRole = selectedRole === "all" || staff.role.toLowerCase().includes(selectedRole.toLowerCase());
      return matchesDepartment && matchesRole;
    });
  }, [selectedDepartment, selectedRole]);

  const totalCommission = filteredStaffData.reduce((sum, staff) => sum + staff.commission, 0);
  const totalRevenue = filteredStaffData.reduce((sum, staff) => sum + staff.achieved, 0);
  const commissionROI = totalRevenue > 0 ? ((totalRevenue - totalCommission) / totalRevenue * 100) : 0;

  // Predictive alerts
  const alerts = [
    {
      type: "warning",
      title: "Sara needs attention",
      message: "Sara is at 72% of target with 8 days left. Intervention recommended.",
      priority: "high",
      action: "Contact Sara"
    },
    {
      type: "error", 
      title: "Arshi underperforming",
      message: "Arshi is only at 68% progress vs target. Immediate support needed.",
      priority: "urgent",
      action: "Schedule Meeting"
    },
    {
      type: "success",
      title: "Looka exceeded unit targets", 
      message: "Looka already exceeded both yoga and swimming unit targets!",
      priority: "low",
      action: "Congratulate"
    },
    {
      type: "info",
      title: "Month-end forecast",
      message: "At current pace, institution will reach 94% of monthly target.",
      priority: "medium",
      action: "View Forecast"
    }
  ];

  return (
    <div className="p-6 space-y-6 bg-background">
      {/* Header with Breadcrumbs */}
      <div className="space-y-4">
        {/* Breadcrumbs */}
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>Payroll & Employees</span>
          <span>â†’</span>
          <span>Staffs & Trainers</span>
          <span>â†’</span>
          <span className="text-foreground font-medium">Targets Overview</span>
        </div>

        {/* Title Section */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Gauge className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Targets Overview</h1>
            </div>
            <p className="text-muted-foreground">
              Comprehensive dashboard for managing staff targets, performance tracking, and commission analytics
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px]">
                <CalendarIcon className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
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

            <Button variant="outline" onClick={() => onNavigate("staffs-trainers")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Staff
            </Button>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {activeAlert && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {alerts.slice(0, 2).map((alert, index) => (
            <Alert key={index} className={cn(
              "border-l-4",
              alert.type === "error" && "border-l-red-500 bg-red-50 border-red-200",
              alert.type === "warning" && "border-l-yellow-500 bg-yellow-50 border-yellow-200",
              alert.type === "success" && "border-l-green-500 bg-green-50 border-green-200",
              alert.type === "info" && "border-l-blue-500 bg-blue-50 border-blue-200"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-3">
                  <Bell className={cn(
                    "h-5 w-5 mt-0.5",
                    alert.type === "error" && "text-red-600",
                    alert.type === "warning" && "text-yellow-600", 
                    alert.type === "success" && "text-green-600",
                    alert.type === "info" && "text-blue-600"
                  )} />
                  <div>
                    <h4 className="font-medium">{alert.title}</h4>
                    <AlertDescription className="mt-1">
                      {alert.message}
                    </AlertDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button size="sm" variant="outline">
                    {alert.action}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveAlert(false)}>
                    Ã—
                  </Button>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}

      {/* Institution Target Summary */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-foreground flex items-center">
            <Target className="h-6 w-6 mr-3 text-primary" />
            Institution Target Summary
          </CardTitle>
          <CardDescription>Monthly performance overview with progress tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Progress Ring */}
            <div className="flex justify-center">
              <div className="relative w-48 h-48">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#E5E7EB"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={institutionTarget.percentage >= 85 ? COLORS.success : 
                           institutionTarget.percentage >= 70 ? COLORS.warning : COLORS.error}
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={`${institutionTarget.percentage * 2.51} 251`}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-foreground">
                    {institutionTarget.percentage.toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">Complete</span>
                </div>
              </div>
            </div>

            {/* Target Details */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Monthly Target</span>
                  <span className="font-bold text-foreground">
                    AED {institutionTarget.monthly.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Achieved</span>
                  <span className="font-bold text-primary">
                    AED {institutionTarget.achieved.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Remaining</span>
                  <span className="font-bold text-error">
                    AED {institutionTarget.remaining.toLocaleString()}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Days Left</span>
                  <Badge variant="outline">{institutionTarget.daysLeft} days</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Daily Required</span>
                  <span className="font-medium text-warning">
                    AED {institutionTarget.dailyRequired.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center space-x-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Active Staff</p>
                    <p className="font-bold text-foreground">{staffPerformanceData.length}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                <div className="flex items-center space-x-3">
                  <Wallet className="h-5 w-5 text-secondary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Commission</p>
                    <p className="font-bold text-foreground">AED {totalCommission.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                <div className="flex items-center space-x-3">
                  <Calculator className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm text-muted-foreground">Commission ROI</p>
                    <p className="font-bold text-foreground">{commissionROI.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters Section */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Martial Arts">Martial Arts</SelectItem>
                <SelectItem value="Wellness">Wellness</SelectItem>
                <SelectItem value="High Intensity">High Intensity</SelectItem>
                <SelectItem value="Personal Training">Personal Training</SelectItem>
                <SelectItem value="Front Desk">Front Desk</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="trainer">Trainers</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="reception">Reception</SelectItem>
                <SelectItem value="management">Management</SelectItem>
              </SelectContent>
            </Select>

            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "revenue" | "units")}>
              <TabsList>
                <TabsTrigger value="revenue">Revenue View</TabsTrigger>
                <TabsTrigger value="units">Units View</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Staff Performance Leaderboard */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-foreground flex items-center">
            <Trophy className="h-6 w-6 mr-3 text-primary" />
            Staff Performance Leaderboard
          </CardTitle>
          <CardDescription>Detailed performance tracking with expandable unit breakdowns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Target (AED)</TableHead>
                  <TableHead>Achieved (AED)</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Forecast</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaffData.map((staff) => (
                  <React.Fragment key={staff.id}>
                    <TableRow className="hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRowExpansion(staff.id)}
                        >
                          {expandedRows.includes(staff.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-medium text-primary">
                              {staff.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{staff.name}</p>
                            <p className="text-xs text-muted-foreground">{staff.lastUpdate}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{staff.role}</p>
                          <p className="text-xs text-muted-foreground">{staff.department}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">AED {staff.target.toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">AED {staff.achieved.toLocaleString()}</span>
                          {staff.trend === "up" ? (
                            <ArrowUp className="h-4 w-4 text-success" />
                          ) : (
                            <ArrowDown className="h-4 w-4 text-error" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">{staff.percentage}%</span>
                            <span className="text-xs text-muted-foreground">
                              ðŸ“Š {staff.percentage >= 85 ? "Excellent" : 
                                 staff.percentage >= 70 ? "Good" : "Needs Attention"}
                            </span>
                          </div>
                          <Progress 
                            value={staff.percentage} 
                            className="h-2"
                            style={{
                              '--progress-background': getProgressColor(staff.percentage)
                            } as React.CSSProperties}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          AED {staff.commission.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs", getStatusColor(staff.status))}>
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(staff.status)}
                            <span className="capitalize">{staff.status.replace("-", " ")}</span>
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">{staff.forecast}%</span>
                          <Badge variant={staff.forecast >= 95 ? "default" : "secondary"} className="text-xs">
                            {staff.forecast >= 95 ? "ðŸŽ¯ Target" : "ðŸ“ˆ Forecast"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Award className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Row Details */}
                    {expandedRows.includes(staff.id) && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/20">
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              {/* Unit Targets Breakdown */}
                              <div className="space-y-3">
                                <h4 className="font-medium text-foreground flex items-center">
                                  <Target className="h-4 w-4 mr-2 text-primary" />
                                  Unit Targets
                                </h4>
                                {staff.unitTargets.map((unit, index) => (
                                  <div key={index} className="p-3 rounded-lg border border-border/50">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-medium">{unit.service}</span>
                                      <span className="text-sm text-muted-foreground">
                                        {unit.achieved}/{unit.target}
                                      </span>
                                    </div>
                                    <Progress value={unit.percentage} className="h-1" />
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {unit.percentage}% complete
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Sales Breakdown */}
                              <div className="space-y-3">
                                <h4 className="font-medium text-foreground flex items-center">
                                  <PieChart className="h-4 w-4 mr-2 text-secondary" />
                                  Sales Breakdown
                                </h4>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Membership</span>
                                    <span className="font-medium">AED {staff.salesBreakdown.membership.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Add-ons</span>
                                    <span className="font-medium">AED {staff.salesBreakdown.addons.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">POS</span>
                                    <span className="font-medium">AED {staff.salesBreakdown.pos.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Performance Insights */}
                              <div className="space-y-3">
                                <h4 className="font-medium text-foreground flex items-center">
                                  <Activity className="h-4 w-4 mr-2 text-success" />
                                  Performance Insights
                                </h4>
                                <div className="space-y-2">
                                  <div className="p-2 rounded bg-primary/5 text-xs">
                                    <strong>Trend:</strong> {staff.trend === "up" ? "ðŸ”¥ Improving" : "ðŸ“‰ Declining"}
                                  </div>
                                  <div className="p-2 rounded bg-secondary/5 text-xs">
                                    <strong>Forecast:</strong> Expected to reach {staff.forecast}% by month-end
                                  </div>
                                  <div className="p-2 rounded bg-success/5 text-xs">
                                    <strong>Commission Rate:</strong> {((staff.commission / staff.achieved) * 100).toFixed(1)}% of sales
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Analytics & Trends Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend & Forecast */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-foreground flex items-center">
              <LineChart className="h-5 w-5 mr-2 text-primary" />
              Revenue vs Targets Trend
            </CardTitle>
            <CardDescription>Weekly progress with predictive forecasting</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsLineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  formatter={(value: number) => [`AED ${value.toLocaleString()}`, '']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  stroke={COLORS.muted} 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Target" 
                />
                <Line 
                  type="monotone" 
                  dataKey="actual" 
                  stroke={COLORS.primary} 
                  strokeWidth={3}
                  name="Actual" 
                />
                <Line 
                  type="monotone" 
                  dataKey="forecast" 
                  stroke={COLORS.secondary} 
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  name="Forecast" 
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Performance */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-foreground flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-secondary" />
              Department Performance
            </CardTitle>
            <CardDescription>Performance comparison across departments</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={departmentPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="department" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  formatter={(value: number) => [`AED ${value.toLocaleString()}`, '']}
                />
                <Legend />
                <Bar dataKey="target" fill={COLORS.muted} name="Target" />
                <Bar dataKey="achieved" fill={COLORS.primary} name="Achieved" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Commission & ROI Analysis */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-foreground flex items-center">
            <Calculator className="h-6 w-6 mr-3 text-primary" />
            Commission & Incentives Tracking
          </CardTitle>
          <CardDescription>Financial analysis of commission costs vs revenue generation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center space-x-3">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue Generated</p>
                    <p className="text-2xl font-bold text-foreground">
                      AED {totalRevenue.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
                <div className="flex items-center space-x-3">
                  <Wallet className="h-8 w-8 text-warning" />
                  <div>
                    <p className="text-sm text-muted-foreground">Commission Payable</p>
                    <p className="text-2xl font-bold text-foreground">
                      AED {totalCommission.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="h-8 w-8 text-success" />
                  <div>
                    <p className="text-sm text-muted-foreground">Net Revenue</p>
                    <p className="text-2xl font-bold text-foreground">
                      AED {(totalRevenue - totalCommission).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                <div className="flex items-center space-x-3">
                  <Gauge className="h-8 w-8 text-secondary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Commission ROI</p>
                    <p className="text-2xl font-bold text-foreground">
                      {commissionROI.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">ROI per Staff Member</h4>
                {filteredStaffData.map((staff) => {
                  const staffROI = ((staff.achieved - staff.commission) / staff.achieved * 100);
                  return (
                    <div key={staff.id} className="flex justify-between items-center p-3 rounded-lg border border-border/50">
                      <span className="text-sm font-medium">{staff.name}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{staffROI.toFixed(1)}%</span>
                        <Badge variant={staffROI >= 90 ? "default" : "secondary"} className="text-xs">
                          {staffROI >= 90 ? "Excellent" : "Good"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Alerts & Notifications */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-foreground flex items-center">
            <Bell className="h-6 w-6 mr-3 text-primary" />
            Alerts & Notifications
          </CardTitle>
          <CardDescription>Proactive insights and recommended actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {alerts.map((alert, index) => (
              <div key={index} className={cn(
                "p-4 rounded-lg border",
                alert.type === "error" && "bg-red-50 border-red-200",
                alert.type === "warning" && "bg-yellow-50 border-yellow-200",
                alert.type === "success" && "bg-green-50 border-green-200",
                alert.type === "info" && "bg-blue-50 border-blue-200"
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {alert.type === "error" && <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />}
                    {alert.type === "warning" && <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />}
                    {alert.type === "success" && <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />}
                    {alert.type === "info" && <Zap className="h-5 w-5 text-blue-600 mt-0.5" />}
                    <div>
                      <h4 className="font-medium text-foreground">{alert.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    alert.priority === "urgent" && "border-red-300 text-red-700",
                    alert.priority === "high" && "border-yellow-300 text-yellow-700",
                    alert.priority === "medium" && "border-blue-300 text-blue-700",
                    alert.priority === "low" && "border-green-300 text-green-700"
                  )}>
                    {alert.priority}
                  </Badge>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="outline" className="text-xs">
                    {alert.action}
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
