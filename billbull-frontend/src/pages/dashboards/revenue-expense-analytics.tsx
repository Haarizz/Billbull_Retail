import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Banknote,
  Smartphone,
  FileText,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Percent,
  BarChart3,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval, subMonths } from "date-fns";

// Mock data for revenue by payment method
const revenueByPaymentMethod = {
  cash: 45000,
  card: 125000,
  cheque: 32000,
  online: 68000,
};

// Mock data for daily revenue and expenses (last 30 days)
const generateDailyData = () => {
  const data = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    data.push({
      date: format(date, "dd MMM"),
      fullDate: format(date, "yyyy-MM-dd"),
      revenue: Math.floor(Math.random() * 15000) + 5000,
      expenses: Math.floor(Math.random() * 8000) + 2000,
      splitExpenses: Math.floor(Math.random() * 1000) + 500, // Split portion from annual expenses
    });
  }
  return data;
};

// Mock data for monthly revenue and expenses (last 12 months)
const generateMonthlyData = () => {
  const data = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const date = subMonths(today, i);
    const baseRevenue = 250000 + Math.floor(Math.random() * 50000);
    const baseExpenses = 150000 + Math.floor(Math.random() * 30000);
    const splitExpenses = 25000 + Math.floor(Math.random() * 5000);
    
    data.push({
      month: format(date, "MMM yyyy"),
      fullDate: format(date, "yyyy-MM"),
      revenue: baseRevenue,
      directExpenses: baseExpenses,
      splitExpenses: splitExpenses,
      totalExpenses: baseExpenses + splitExpenses,
      profit: baseRevenue - (baseExpenses + splitExpenses),
    });
  }
  return data;
};

// Payment method breakdown
const paymentMethodData = [
  { name: "Card", value: 125000, color: "#3b82f6", icon: CreditCard },
  { name: "Online", value: 68000, color: "#10b981", icon: Smartphone },
  { name: "Cash", value: 45000, color: "#f59e0b", icon: Banknote },
  { name: "Cheque", value: 32000, color: "#8b5cf6", icon: FileText },
];

// Expense categories with split amounts
const expenseCategoriesData = [
  { category: "Rent", direct: 0, split: 8000, total: 8000, splitInfo: "From 96,000 AED annual payment" },
  { category: "Utilities", direct: 3200, split: 0, total: 3200, splitInfo: null },
  { category: "Salaries", direct: 85000, split: 0, total: 85000, splitInfo: null },
  { category: "License & Permits", direct: 0, split: 2500, total: 2500, splitInfo: "From 30,000 AED annual fees" },
  { category: "Equipment", direct: 4500, split: 0, total: 4500, splitInfo: null },
  { category: "Visa & Immigration", direct: 0, split: 1200, total: 1200, splitInfo: "From 14,400 AED annual cost" },
  { category: "Marketing", direct: 12000, split: 0, total: 12000, splitInfo: null },
  { category: "Insurance", direct: 0, split: 3500, total: 3500, splitInfo: "From 42,000 AED annual premium" },
];

export function RevenueExpenseAnalytics() {
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("monthly");
  const [selectedPeriod, setSelectedPeriod] = useState("current");

  const dailyData = generateDailyData();
  const monthlyData = generateMonthlyData();

  // Calculate totals
  const currentData = viewMode === "daily" ? dailyData : monthlyData;
  const totalRevenue = viewMode === "daily" 
    ? dailyData.reduce((sum, d) => sum + d.revenue, 0)
    : monthlyData[monthlyData.length - 1].revenue;
  
  const totalDirectExpenses = viewMode === "daily"
    ? dailyData.reduce((sum, d) => sum + d.expenses, 0)
    : monthlyData[monthlyData.length - 1].directExpenses;
  
  const totalSplitExpenses = viewMode === "daily"
    ? dailyData.reduce((sum, d) => sum + d.splitExpenses, 0)
    : monthlyData[monthlyData.length - 1].splitExpenses;

  const totalExpenses = totalDirectExpenses + totalSplitExpenses;
  const totalProfit = totalRevenue - totalExpenses;
  const profitMargin = ((totalProfit / totalRevenue) * 100).toFixed(2);

  const totalPaymentMethods = paymentMethodData.reduce((sum, pm) => sum + pm.value, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="bg-[#F5C742] rounded-lg p-2">
            <BarChart3 className="h-6 w-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Revenue vs Expense Analytics</h1>
            <p className="text-sm text-gray-600">
              Comprehensive analysis with split expense allocations
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Period</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="last-quarter">Last Quarter</SelectItem>
              <SelectItem value="last-year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-gray-900">
              {totalRevenue.toLocaleString()} AED
            </div>
            <div className="flex items-center mt-2 text-sm">
              <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-green-600 font-medium">12.5%</span>
              <span className="text-gray-600 ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-gray-900">
              {totalExpenses.toLocaleString()} AED
            </div>
            <div className="flex flex-col mt-2 text-xs">
              <span className="text-gray-600">Direct: {totalDirectExpenses.toLocaleString()} AED</span>
              <span className="text-gray-600">Split: {totalSplitExpenses.toLocaleString()} AED</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Net Profit</CardTitle>
              <Target className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-gray-900">
              {totalProfit.toLocaleString()} AED
            </div>
            <div className="flex items-center mt-2 text-sm">
              <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-green-600 font-medium">8.2%</span>
              <span className="text-gray-600 ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Profit Margin</CardTitle>
              <Percent className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-gray-900">{profitMargin}%</div>
            <p className="text-xs text-gray-600 mt-2">
              {parseFloat(profitMargin) > 20 ? "Excellent" : "Good"} performance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* View Mode Tabs */}
      <Card>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "daily" | "monthly")} className="w-full">
          <div className="border-b">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="daily">Daily View</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly View</TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>
          </div>

          {/* Daily View */}
          <TabsContent value="daily" className="m-0 p-0">
            <CardContent className="pt-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Daily Revenue vs Expenses (Last 30 Days)</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => [`${value.toLocaleString()} AED`, ""]}
                      contentStyle={{ backgroundColor: "white", border: "1px solid #ccc" }}
                    />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" name="Direct Expenses" />
                    <Bar dataKey="splitExpenses" fill="#f59e0b" name="Split Expenses" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Summary Table */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Daily Breakdown</h3>
                <div className="rounded-md border max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold text-right">Revenue</TableHead>
                        <TableHead className="font-semibold text-right">Direct Exp.</TableHead>
                        <TableHead className="font-semibold text-right">Split Exp.</TableHead>
                        <TableHead className="font-semibold text-right">Total Exp.</TableHead>
                        <TableHead className="font-semibold text-right">Profit</TableHead>
                        <TableHead className="font-semibold text-right">Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyData.slice().reverse().map((day) => {
                        const totalExp = day.expenses + day.splitExpenses;
                        const profit = day.revenue - totalExp;
                        const margin = ((profit / day.revenue) * 100).toFixed(1);
                        return (
                          <TableRow key={day.fullDate}>
                            <TableCell className="font-medium">{day.date}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {day.revenue.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">{day.expenses.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-orange-600">
                              {day.splitExpenses.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">{totalExp.toLocaleString()}</TableCell>
                            <TableCell className={`text-right font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {profit.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={parseFloat(margin) > 20 ? "default" : "secondary"}>
                                {margin}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </TabsContent>

          {/* Monthly View */}
          <TabsContent value="monthly" className="m-0 p-0">
            <CardContent className="pt-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Monthly Revenue vs Expenses Trend</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => [`${value.toLocaleString()} AED`, ""]}
                      contentStyle={{ backgroundColor: "white", border: "1px solid #ccc" }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={3}
                      name="Revenue"
                    />
                    <Line
                      type="monotone"
                      dataKey="directExpenses"
                      stroke="#ef4444"
                      strokeWidth={3}
                      name="Direct Expenses"
                    />
                    <Line
                      type="monotone"
                      dataKey="splitExpenses"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Split Expenses"
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      name="Net Profit"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly Summary Table */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Monthly Breakdown</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Month</TableHead>
                        <TableHead className="font-semibold text-right">Revenue</TableHead>
                        <TableHead className="font-semibold text-right">Direct Exp.</TableHead>
                        <TableHead className="font-semibold text-right">Split Exp.</TableHead>
                        <TableHead className="font-semibold text-right">Total Exp.</TableHead>
                        <TableHead className="font-semibold text-right">Profit</TableHead>
                        <TableHead className="font-semibold text-right">Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyData.slice().reverse().map((month) => {
                        const margin = ((month.profit / month.revenue) * 100).toFixed(1);
                        return (
                          <TableRow key={month.fullDate}>
                            <TableCell className="font-medium">{month.month}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {month.revenue.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">{month.directExpenses.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-orange-600">
                              {month.splitExpenses.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {month.totalExpenses.toLocaleString()}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${month.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {month.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={parseFloat(margin) > 20 ? "default" : "secondary"}>
                                {margin}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Revenue & Expense Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#F5C742]" />
              Revenue by Payment Method
            </CardTitle>
            <CardDescription>Current month breakdown by payment type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value.toLocaleString()} AED`, ""]} />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2">
                {paymentMethodData.map((method) => {
                  const Icon = method.icon;
                  const percentage = ((method.value / totalPaymentMethods) * 100).toFixed(1);
                  return (
                    <div key={method.name} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: method.color }} />
                        <span className="font-medium text-sm">{method.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">{method.value.toLocaleString()} AED</div>
                        <div className="text-xs text-gray-600">{percentage}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense Categories with Split Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-[#F5C742]" />
              Expense Categories Breakdown
            </CardTitle>
            <CardDescription>With split allocations from annual payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expenseCategoriesData.map((expense) => (
                <div key={expense.category} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{expense.category}</span>
                    <span className="font-semibold text-sm">{expense.total.toLocaleString()} AED</span>
                  </div>
                  {expense.splitInfo && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                        Split
                      </Badge>
                      <span className="text-xs text-gray-600">{expense.splitInfo}</span>
                    </div>
                  )}
                  {expense.direct > 0 && expense.split > 0 && (
                    <div className="flex gap-2 mt-2 text-xs">
                      <span className="text-gray-600">Direct: {expense.direct.toLocaleString()}</span>
                      <span className="text-gray-600">â€¢</span>
                      <span className="text-orange-600">Split: {expense.split.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Information Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="bg-blue-100 rounded-lg p-2 h-fit">
              <FileText className="h-5 w-5 text-blue-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-2">About Split Expense Allocations</h3>
              <p className="text-sm text-blue-800 mb-2">
                Split expenses represent the daily/monthly impact of one-time payments made for extended periods
                (annual rent, licenses, insurance, visa fees, etc.). This provides a more accurate picture of
                actual operational costs during each period.
              </p>
              <p className="text-sm text-blue-800">
                <strong>Example:</strong> An annual rent payment of 96,000 AED is split into 8,000 AED per month,
                ensuring each month's P&L reflects its fair share of the cost.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

