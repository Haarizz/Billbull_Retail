import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
import { Badge } from "../../components/ui/badge";
import { Calendar } from "../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  CreditCard,
  AlertCircle,
  Download,
  Calendar as CalendarIcon,
  Filter,
  RefreshCw,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Zap,
  Brain,
  Building2,
  Receipt,
  UserCheck,
  Activity,
  Percent,
  Wallet,
  Clock,
  Search,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { format, subMonths, subDays, subYears } from "date-fns";
import { cn } from "../../components/ui/utils";
import { RevenueExpenseAnalytics } from "./revenue-expense-analytics";

// Types
interface DateRange {
  from: Date;
  to: Date;
}

interface KPICard {
  id: string;
  title: string;
  value: number;
  previousValue: number;
  format: "currency" | "percentage" | "number";
  icon: React.ElementType;
  trend: "up" | "down" | "neutral";
  sparklineData?: number[];
}

interface ChartData {
  name: string;
  value: number;
  previous?: number;
  [key: string]: any;
}

interface Transaction {
  id: string;
  date: string;
  category: string;
  amount: number;
  branch: string;
  paymentMethod: string;
  status: "completed" | "pending" | "failed";
  description: string;
}

interface Insight {
  id: string;
  type: "success" | "warning" | "info" | "critical";
  title: string;
  description: string;
  impact: number;
  recommendation?: string;
}

// Mock Data
const kpiData: KPICard[] = [
  {
    id: "total-revenue",
    title: "Total Revenue",
    value: 189000,
    previousValue: 168500,
    format: "currency",
    icon: DollarSign,
    trend: "up",
    sparklineData: [145000, 152000, 148000, 165000, 175000, 189000],
  },
  {
    id: "profit-margin",
    title: "Profit Margin",
    value: 24.5,
    previousValue: 22.1,
    format: "percentage",
    icon: Percent,
    trend: "up",
    sparklineData: [20.5, 21.2, 19.8, 22.5, 23.1, 24.5],
  },
  {
    id: "outstanding-payments",
    title: "Outstanding Payments",
    value: 12500,
    previousValue: 15200,
    format: "currency",
    icon: Receipt,
    trend: "down",
    sparklineData: [18000, 16500, 14200, 13800, 14500, 12500],
  },
  {
    id: "active-membership-value",
    title: "Active Membership Value",
    value: 425000,
    previousValue: 398000,
    format: "currency",
    icon: Users,
    trend: "up",
    sparklineData: [380000, 385000, 392000, 405000, 415000, 425000],
  },
  {
    id: "trainer-revenue",
    title: "Trainer Revenue",
    value: 68500,
    previousValue: 62300,
    format: "currency",
    icon: UserCheck,
    trend: "up",
    sparklineData: [58000, 59500, 61200, 64800, 66200, 68500],
  },
  {
    id: "total-expenses",
    title: "Total Expenses",
    value: 142750,
    previousValue: 131200,
    format: "currency",
    icon: CreditCard,
    trend: "up",
    sparklineData: [125000, 128000, 132000, 138000, 140000, 142750],
  },
];

const incomeDistributionData = [
  { name: "Memberships", value: 125000, color: "#0047AB" },
  { name: "Personal Training", value: 35000, color: "#009688" },
  { name: "Classes & Drop-ins", value: 18000, color: "#4CAF50" },
  { name: "Retail & Supplements", value: 8500, color: "#FFC107" },
  { name: "Other Services", value: 2500, color: "#F44336" },
];

const businessInsights: Insight[] = [
  {
    id: "1",
    type: "success",
    title: "Revenue Growth Acceleration",
    description: "Revenue grew 12.2% MoM, primarily driven by new premium membership packages and increased personal training sessions.",
    impact: 20500,
    recommendation: "Continue promoting premium packages with targeted campaigns",
  },
  {
    id: "2",
    type: "info",
    title: "Trainer Performance Excellence",
    description: "Top trainer Ahmed generated 22% more PT revenue than last month, contributing AED 15,800 in additional income.",
    impact: 15800,
  },
  {
    id: "3",
    type: "warning",
    title: "Equipment Maintenance Increase",
    description: "Equipment maintenance expenses increased by AED 5,000 due to aging cardio equipment requiring frequent repairs.",
    impact: -5000,
    recommendation: "Consider equipment replacement schedule to reduce maintenance costs",
  },
  {
    id: "4",
    type: "critical",
    title: "Outstanding Payment Alert",
    description: "AED 12,500 in outstanding member payments, with 15% aging beyond 30 days. Immediate follow-up required.",
    impact: -12500,
    recommendation: "Implement automated payment reminders and follow-up procedures",
  },
];

const transactionData: Transaction[] = [
  {
    id: "TXN001",
    date: "2025-09-30",
    category: "Membership",
    amount: 2500,
    branch: "Downtown",
    paymentMethod: "Card",
    status: "completed",
    description: "Annual Premium Membership - John Smith",
  },
  {
    id: "TXN002",
    date: "2025-09-30",
    category: "Personal Training",
    amount: 350,
    branch: "Mall Branch",
    paymentMethod: "Cash",
    status: "completed",
    description: "PT Session Package - Sarah Johnson",
  },
  {
    id: "TXN003",
    date: "2025-09-29",
    category: "Retail",
    amount: 150,
    branch: "Downtown",
    paymentMethod: "Card",
    status: "pending",
    description: "Protein Supplements - Ahmed Ali",
  },
  {
    id: "TXN004",
    date: "2025-09-29",
    category: "Classes",
    amount: 80,
    branch: "Marina Branch",
    paymentMethod: "Digital",
    status: "completed",
    description: "Yoga Class Package - Maria Garcia",
  },
  {
    id: "TXN005",
    date: "2025-09-28",
    category: "Membership",
    amount: 1800,
    branch: "Downtown",
    paymentMethod: "Bank Transfer",
    status: "failed",
    description: "Semi-Annual Membership - Kevin Brown",
  },
];

const revenueExpenseData = [
  { month: "Apr", revenue: 165000, expenses: 128000 },
  { month: "May", revenue: 172000, expenses: 132000 },
  { month: "Jun", revenue: 168000, expenses: 135000 },
  { month: "Jul", revenue: 178000, expenses: 138000 },
  { month: "Aug", revenue: 185000, expenses: 142000 },
  { month: "Sep", revenue: 189000, expenses: 142750 },
];

// Components
const KPICard: React.FC<{ kpi: KPICard }> = ({ kpi }) => {
  const changePercentage = ((kpi.value - kpi.previousValue) / kpi.previousValue * 100);
  const isPositive = changePercentage > 0;
  
  const formatValue = (value: number) => {
    switch (kpi.format) {
      case "currency":
        return `${value.toLocaleString()} AED`;
      case "percentage":
        return `${value.toFixed(1)}%`;
      case "number":
        return value.toLocaleString();
      default:
        return value.toString();
    }
  };

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-primary/10 rounded-lg p-2">
              <kpi.icon className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-600">
              {kpi.title}
            </CardTitle>
          </div>
          <div className={cn(
            "flex items-center text-xs px-2 py-1 rounded-full",
            isPositive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          )}>
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3 mr-1" />
            ) : (
              <ArrowDownRight className="h-3 w-3 mr-1" />
            )}
            {Math.abs(changePercentage).toFixed(1)}%
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold text-gray-900">
          {formatValue(kpi.value)}
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>vs. last period</span>
          <span>{formatValue(kpi.previousValue)}</span>
        </div>

        {/* Mini Sparkline */}
        {kpi.sparklineData && (
          <div className="h-8 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kpi.sparklineData.map((value, index) => ({ value, index }))}>
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke={isPositive ? "#4CAF50" : "#F44336"}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const InsightCard: React.FC<{ insight: Insight }> = ({ insight }) => {
  const typeConfig = {
    success: { color: "bg-green-100 text-green-800", icon: TrendingUp },
    warning: { color: "bg-yellow-100 text-yellow-800", icon: AlertCircle },
    info: { color: "bg-blue-100 text-blue-800", icon: Zap },
    critical: { color: "bg-red-100 text-red-800", icon: AlertCircle },
  };

  const config = typeConfig[insight.type];
  const IconComponent = config.icon;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <div className={cn("rounded-lg p-2", config.color)}>
            <IconComponent className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">{insight.title}</h4>
              <Badge variant="secondary" className={cn(
                insight.impact > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              )}>
                {insight.impact > 0 ? "+" : ""}{Math.abs(insight.impact).toLocaleString()} AED
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mb-2">{insight.description}</p>
            {insight.recommendation && (
              <div className="bg-gray-50 rounded-md p-2">
                <p className="text-xs text-gray-700">
                  <strong>Recommendation:</strong> {insight.recommendation}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export function FinancialAnalytics() {
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("current-month");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 1),
    to: new Date(),
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChart, setSelectedChart] = useState("revenue-expenses");

  const branches = ["All Branches", "Downtown", "Mall Branch", "Marina Branch"];

  const handleExport = (format: "excel" | "pdf") => {
    console.log(`Exporting financial analytics as ${format}`);
  };

  const filteredTransactions = transactionData.filter((transaction) => {
    const matchesSearch = 
      transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBranch = selectedBranch === "all" || 
      transaction.branch.toLowerCase() === selectedBranch.replace(/\s+/g, '-');
    
    return matchesSearch && matchesBranch;
  });

  const statusColors = {
    completed: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="bg-primary rounded-lg p-2">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Financial Analytics</h1>
            <p className="text-sm text-gray-600">
              Advanced business intelligence and performance insights
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analytics Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="branch">Branch/Entity</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch} value={branch.toLowerCase().replace(/\s+/g, '-')}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="period">Period</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">Current Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="current-quarter">Current Quarter</SelectItem>
                  <SelectItem value="last-quarter">Last Quarter</SelectItem>
                  <SelectItem value="current-year">Current Year</SelectItem>
                  <SelectItem value="last-year">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Custom Date Range</Label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange && "text-muted-foreground"
                    )}
                    disabled={selectedPeriod !== "custom"}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={(range) => {
                      if (range) {
                        setDateRange(range as DateRange);
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {kpiData.map((kpi) => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Revenue vs Expenses Trend</CardTitle>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm">
                  <Building2 className="h-4 w-4 mr-2" />
                  Branch View
                </Button>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  Drill Down
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" stroke="#666" />
                  <YAxis stroke="#666" tickFormatter={(value) => `${value/1000}K`} />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toLocaleString()} AED`, '']}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#0047AB" 
                    strokeWidth={3}
                    name="Revenue"
                    dot={{ fill: "#0047AB", strokeWidth: 2, r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="expenses" 
                    stroke="#F44336" 
                    strokeWidth={3}
                    name="Expenses"
                    dot={{ fill: "#F44336", strokeWidth: 2, r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Income Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Income Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomeDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {incomeDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} AED`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Business Performance Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI-Powered Business Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {businessInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Data Tables */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="transactions">Transaction Summary</TabsTrigger>
          <TabsTrigger value="receivables">Accounts Receivable</TabsTrigger>
          <TabsTrigger value="revenue-expense">Revenue vs Expense</TabsTrigger>
        </TabsList>
        
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-lg">Transaction Summary</CardTitle>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search transactions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold text-primary">Date</TableHead>
                      <TableHead className="font-semibold text-primary">Category</TableHead>
                      <TableHead className="font-semibold text-primary text-right">Amount</TableHead>
                      <TableHead className="font-semibold text-primary">Branch</TableHead>
                      <TableHead className="font-semibold text-primary">Payment Method</TableHead>
                      <TableHead className="font-semibold text-primary">Status</TableHead>
                      <TableHead className="font-semibold text-primary">Description</TableHead>
                      <TableHead className="font-semibold text-primary">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((transaction) => (
                      <TableRow key={transaction.id} className="hover:bg-gray-50">
                        <TableCell>{format(new Date(transaction.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            {transaction.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {transaction.amount.toLocaleString()} AED
                        </TableCell>
                        <TableCell>{transaction.branch}</TableCell>
                        <TableCell>{transaction.paymentMethod}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary" 
                            className={statusColors[transaction.status]}
                          >
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={transaction.description}>
                          {transaction.description}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="receivables">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Accounts Receivable / Payable</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Receipt className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Receivables Module</h3>
                <p className="text-gray-600 mb-4">
                  Detailed accounts receivable and payable tracking coming soon.
                </p>
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Ledgers
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="revenue-expense">
          <RevenueExpenseAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
