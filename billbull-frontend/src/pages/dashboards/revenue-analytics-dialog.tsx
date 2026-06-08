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
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart } from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Users,
  Target,
  Eye,
  Filter,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Minus,
  ShoppingCart,
  CreditCard,
  Percent,
  PieChart as PieChartIcon,
  BarChart3,
  Package,
  Wallet,
  Receipt,
  TrendingUpDown,
  Zap,
  Award,
  Activity
} from 'lucide-react';

interface RevenueAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revenueBySource: Array<{
    source: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
  revenueData: Array<{
    month: string;
    revenue: number;
    target: number;
  }>;
  formatCurrency: (amount: number) => string;
  getCurrentPeriod: () => string;
}

export function RevenueAnalyticsDialog({
  open,
  onOpenChange,
  revenueBySource,
  revenueData,
  formatCurrency,
  getCurrentPeriod
}: RevenueAnalyticsDialogProps) {
  const [selectedPeriod, setSelectedPeriod] = React.useState('monthly');
  const [selectedSource, setSelectedSource] = React.useState('all');

  // Add delay to ensure proper chart rendering
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setIsReady(false);
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsReady(false);
    }
  }, [open]);

  // Revenue by Payment Method
  const revenueByPayment = [
    { method: 'Credit Card', amount: 67850, percentage: 54, transactions: 423, avgTransaction: 160.4 },
    { method: 'Cash', amount: 28900, percentage: 23, transactions: 189, avgTransaction: 153.0 },
    { method: 'Bank Transfer', amount: 18500, percentage: 15, transactions: 67, avgTransaction: 276.1 },
    { method: 'Digital Wallet', amount: 10500, percentage: 8, transactions: 98, avgTransaction: 107.1 }
  ];

  // Revenue by Time Period
  const revenueByDay = [
    { day: 'Monday', revenue: 17800, transactions: 118, avgTransaction: 150.8 },
    { day: 'Tuesday', revenue: 19200, transactions: 127, avgTransaction: 151.2 },
    { day: 'Wednesday', revenue: 18900, transactions: 122, avgTransaction: 154.9 },
    { day: 'Thursday', revenue: 20100, transactions: 134, avgTransaction: 150.0 },
    { day: 'Friday', revenue: 16700, transactions: 108, avgTransaction: 154.6 },
    { day: 'Saturday', revenue: 21450, transactions: 142, avgTransaction: 151.1 },
    { day: 'Sunday', revenue: 11600, transactions: 76, avgTransaction: 152.6 }
  ];

  // Revenue by Hour
  const revenueByHour = [
    { hour: '6 AM', revenue: 1200, members: 15 },
    { hour: '7 AM', revenue: 2800, members: 28 },
    { hour: '8 AM', revenue: 4200, members: 42 },
    { hour: '9 AM', revenue: 3500, members: 35 },
    { hour: '10 AM', revenue: 2800, members: 25 },
    { hour: '11 AM', revenue: 2200, members: 18 },
    { hour: '12 PM', revenue: 3200, members: 32 },
    { hour: '1 PM', revenue: 3800, members: 38 },
    { hour: '2 PM', revenue: 2900, members: 28 },
    { hour: '3 PM', revenue: 2400, members: 22 },
    { hour: '4 PM', revenue: 3100, members: 31 },
    { hour: '5 PM', revenue: 4500, members: 45 },
    { hour: '6 PM', revenue: 5800, members: 58 },
    { hour: '7 PM', revenue: 6200, members: 62 },
    { hour: '8 PM', revenue: 4700, members: 47 },
    { hour: '9 PM', revenue: 3200, members: 32 }
  ];

  // Membership Revenue Breakdown
  const membershipRevenue = [
    { 
      tier: 'Premium',
      members: 156,
      monthlyFee: 799,
      totalRevenue: 124644,
      growth: 12.5,
      churnRate: 4.2,
      avgLifetime: 18
    },
    { 
      tier: 'Standard',
      members: 423,
      monthlyFee: 549,
      totalRevenue: 232227,
      growth: 8.3,
      churnRate: 8.1,
      avgLifetime: 14
    },
    { 
      tier: 'Basic',
      members: 268,
      monthlyFee: 349,
      totalRevenue: 93532,
      growth: 5.2,
      churnRate: 12.3,
      avgLifetime: 10
    }
  ];

  // Personal Training Revenue
  const ptRevenue = [
    { trainer: 'John Smith', sessions: 48, revenue: 7200, avgRate: 150, utilization: 92 },
    { trainer: 'Sarah Johnson', sessions: 52, revenue: 7800, avgRate: 150, utilization: 100 },
    { trainer: 'Mike Williams', sessions: 41, revenue: 6150, avgRate: 150, utilization: 79 },
    { trainer: 'Emily Brown', sessions: 36, revenue: 5400, avgRate: 150, utilization: 69 }
  ];

  // Class Revenue
  const classRevenue = [
    { class: 'Yoga', sessions: 24, attendees: 312, revenue: 4680, avgPerSession: 195 },
    { class: 'Spin', sessions: 20, attendees: 280, revenue: 4200, avgPerSession: 210 },
    { class: 'HIIT', sessions: 18, attendees: 234, revenue: 3510, avgPerSession: 195 },
    { class: 'Pilates', sessions: 16, attendees: 192, revenue: 2880, avgPerSession: 180 },
    { class: 'Boxing', sessions: 12, attendees: 156, revenue: 2340, avgPerSession: 195 }
  ];

  // Retail Revenue
  const retailRevenue = [
    { category: 'Supplements', sales: 42, revenue: 2940, avgSale: 70, margin: 35 },
    { category: 'Apparel', sales: 28, revenue: 1680, avgSale: 60, margin: 45 },
    { category: 'Equipment', sales: 15, revenue: 2250, avgSale: 150, margin: 30 },
    { category: 'Beverages', sales: 156, revenue: 780, avgSale: 5, margin: 60 }
  ];

  // Revenue Growth Drivers
  const growthDrivers = [
    { driver: 'New Member Signups', contribution: 42500, percentage: 33.8, growth: 15.2 },
    { driver: 'Membership Upgrades', contribution: 18900, percentage: 15.0, growth: 22.4 },
    { driver: 'Personal Training Growth', contribution: 12300, percentage: 9.8, growth: 18.7 },
    { driver: 'Class Attendance Increase', contribution: 8700, percentage: 6.9, growth: 12.1 },
    { driver: 'Retail Sales Growth', contribution: 4200, percentage: 3.3, growth: 8.5 }
  ];

  // Revenue Forecast
  const revenueForecast = [
    { month: 'Jul', actual: 125750, forecast: 132100, lower: 128000, upper: 136200 },
    { month: 'Aug', actual: 0, forecast: 138500, lower: 134000, upper: 143000 },
    { month: 'Sep', actual: 0, forecast: 145200, lower: 140500, upper: 149900 },
    { month: 'Oct', actual: 0, forecast: 152800, lower: 147800, upper: 157800 },
    { month: 'Nov', actual: 0, forecast: 160100, lower: 154800, upper: 165400 },
    { month: 'Dec', actual: 0, forecast: 168500, lower: 162900, upper: 174100 }
  ];

  // Monthly Comparison
  const monthlyComparison = [
    { metric: 'Total Revenue', current: 125750, previous: 118900, change: 5.8, target: 120000 },
    { metric: 'Membership Revenue', current: 85200, previous: 81500, change: 4.5, target: 82000 },
    { metric: 'PT Revenue', current: 22400, previous: 20800, change: 7.7, target: 21000 },
    { metric: 'Class Revenue', current: 12300, previous: 11200, change: 9.8, target: 11500 },
    { metric: 'Retail Revenue', current: 4850, previous: 4400, change: 10.2, target: 4500 },
    { metric: 'Other Revenue', current: 1000, previous: 1000, change: 0, target: 1000 }
  ];

  // Revenue Metrics
  const revenueMetrics = {
    totalRevenue: 125750,
    recurringRevenue: 85200,
    oneTimeRevenue: 40550,
    averageRevenuePerMember: 148.5,
    revenueGrowthRate: 12.3,
    targetAchievement: 104.8,
    revenuePerSquareFoot: 42.5,
    conversionRate: 23.5
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <DollarSign className="h-6 w-6 text-[#2B7A78]" />
            <span>Revenue Analytics - {getCurrentPeriod()}</span>
          </DialogTitle>
          <DialogDescription>
            Comprehensive revenue breakdown, analysis, and forecasting
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="breakdown" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          {/* Breakdown Tab */}
          <TabsContent value="breakdown" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(revenueMetrics.totalRevenue)}
                    </p>
                    <div className="flex items-center">
                      <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                      <span className="text-xs text-green-600">+{revenueMetrics.revenueGrowthRate}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Recurring Revenue</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(revenueMetrics.recurringRevenue)}
                    </p>
                    <div className="flex items-center">
                      <Percent className="h-3 w-3 text-blue-500 mr-1" />
                      <span className="text-xs text-blue-600">
                        {((revenueMetrics.recurringRevenue / revenueMetrics.totalRevenue) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Avg Per Member</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {formatCurrency(revenueMetrics.averageRevenuePerMember)}
                    </p>
                    <div className="flex items-center">
                      <Users className="h-3 w-3 text-purple-500 mr-1" />
                      <span className="text-xs text-purple-600">Per member</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Target Achievement</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {revenueMetrics.targetAchievement}%
                    </p>
                    <div className="flex items-center">
                      <Target className="h-3 w-3 text-orange-500 mr-1" />
                      <span className="text-xs text-orange-600">Above target</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenue by Source</CardTitle>
                  <CardDescription>Distribution across all revenue streams</CardDescription>
                </CardHeader>
                <CardContent>
                  {isReady && (
                    <div style={{ width: '100%', height: 250 }}>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={revenueBySource}
                            dataKey="amount"
                            nameKey="source"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ percentage }) => `${percentage}%`}
                          >
                            {revenueBySource.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenue by Payment Method</CardTitle>
                  <CardDescription>Payment preferences and transaction values</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {revenueByPayment.map((method, index) => (
                      <div key={index}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium">{method.method}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-muted-foreground">
                              {method.transactions} txns
                            </span>
                            <span className="text-sm font-medium">{formatCurrency(method.amount)}</span>
                          </div>
                        </div>
                        <Progress value={method.percentage} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Avg: {formatCurrency(method.avgTransaction)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue by Day of Week</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={revenueByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#2B7A78" name="Revenue (AED)" />
                    <Bar dataKey="transactions" fill="#3b82f6" name="Transactions" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue by Hour</CardTitle>
                <CardDescription>Peak revenue hours and member activity</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={revenueByHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Revenue (AED)" />
                    <Area type="monotone" dataKey="members" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Active Members" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sources Tab */}
          <TabsContent value="sources" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Membership Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Monthly Fee</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                      <TableHead className="text-right">Growth</TableHead>
                      <TableHead className="text-right">Churn Rate</TableHead>
                      <TableHead className="text-right">Avg Lifetime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membershipRevenue.map((tier, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{tier.tier}</TableCell>
                        <TableCell className="text-right">{tier.members}</TableCell>
                        <TableCell className="text-right">{formatCurrency(tier.monthlyFee)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(tier.totalRevenue)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-green-600">+{tier.growth}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{tier.churnRate}%</TableCell>
                        <TableCell className="text-right">{tier.avgLifetime} months</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personal Training Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trainer</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Utilization</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ptRevenue.map((trainer, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{trainer.trainer}</TableCell>
                          <TableCell className="text-right">{trainer.sessions}</TableCell>
                          <TableCell className="text-right">{formatCurrency(trainer.revenue)}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={trainer.utilization >= 90 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                              {trainer.utilization}%
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
                  <CardTitle className="text-base">Class Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Attendees</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classRevenue.map((cls, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{cls.class}</TableCell>
                          <TableCell className="text-right">{cls.sessions}</TableCell>
                          <TableCell className="text-right">{cls.attendees}</TableCell>
                          <TableCell className="text-right">{formatCurrency(cls.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Retail & Supplements Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Sales Count</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Avg Sale</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retailRevenue.map((category, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{category.category}</TableCell>
                        <TableCell className="text-right">{category.sales}</TableCell>
                        <TableCell className="text-right">{formatCurrency(category.revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(category.avgSale)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{category.margin}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Growth Trend</CardTitle>
                <CardDescription>6-month revenue performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Actual Revenue" />
                    <Line type="monotone" dataKey="target" stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5" name="Target" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Growth Drivers</CardTitle>
                <CardDescription>Key contributors to revenue growth</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {growthDrivers.map((driver, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">{driver.driver}</span>
                        <div className="flex items-center space-x-3">
                          <Badge variant="outline">{driver.percentage}% of total</Badge>
                          <span className="text-sm font-medium text-green-600">+{driver.growth}%</span>
                          <span className="text-sm font-medium">{formatCurrency(driver.contribution)}</span>
                        </div>
                      </div>
                      <Progress value={driver.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Growth Rate</p>
                      <p className="text-2xl font-bold text-green-600">+{revenueMetrics.revenueGrowthRate}%</p>
                      <p className="text-xs text-green-600 mt-1">Above industry avg</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Recurring Revenue %</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {((revenueMetrics.recurringRevenue / revenueMetrics.totalRevenue) * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-blue-600 mt-1">Stable base</p>
                    </div>
                    <Activity className="h-10 w-10 text-blue-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Conversion Rate</p>
                      <p className="text-2xl font-bold text-purple-600">{revenueMetrics.conversionRate}%</p>
                      <p className="text-xs text-purple-600 mt-1">Visitor to member</p>
                    </div>
                    <Award className="h-10 w-10 text-purple-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Month-over-Month Comparison</CardTitle>
                <CardDescription>Current vs previous month performance</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Current Month</TableHead>
                      <TableHead className="text-right">Previous Month</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">vs Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyComparison.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.metric}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.current)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.previous)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            {getTrendIcon(item.change)}
                            <span className={getTrendColor(item.change)}>
                              {item.change > 0 ? '+' : ''}{item.change}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.target)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={
                            item.current >= item.target 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }>
                            {((item.current / item.target) * 100).toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenue Source Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={revenueBySource} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="source" type="category" width={120} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="amount" fill="#2B7A78" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Performance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Revenue Target Achievement</span>
                        <span className="text-sm font-medium text-green-600">104.8%</span>
                      </div>
                      <Progress value={104.8} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Growth vs Last Month</span>
                        <span className="text-sm font-medium text-blue-600">105.8%</span>
                      </div>
                      <Progress value={105.8} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Revenue Diversification</span>
                        <span className="text-sm font-medium text-purple-600">85%</span>
                      </div>
                      <Progress value={85} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">6-Month Revenue Forecast</CardTitle>
                <CardDescription>AI-powered revenue predictions with confidence intervals</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueForecast}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={3} name="Actual" />
                    <Line type="monotone" dataKey="forecast" stroke="#3b82f6" strokeWidth={2} name="Forecast" />
                    <Line type="monotone" dataKey="upper" stroke="#94a3b8" strokeDasharray="5 5" name="Upper Bound" />
                    <Line type="monotone" dataKey="lower" stroke="#94a3b8" strokeDasharray="5 5" name="Lower Bound" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Next Month Forecast</p>
                    <p className="text-2xl font-bold text-blue-600">{formatCurrency(138500)}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Range</span>
                      <span className="text-xs">{formatCurrency(134000)} - {formatCurrency(143000)}</span>
                    </div>
                    <Progress value={92} className="h-2" />
                    <p className="text-xs text-blue-600">92% confidence</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Q3 Total Forecast</p>
                    <p className="text-2xl font-bold text-purple-600">{formatCurrency(415800)}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Growth</span>
                      <span className="text-xs text-green-600">+15.2%</span>
                    </div>
                    <Progress value={88} className="h-2" />
                    <p className="text-xs text-purple-600">88% confidence</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Year-End Projection</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(1685000)}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">vs Target</span>
                      <span className="text-xs text-green-600">+8.5%</span>
                    </div>
                    <Progress value={85} className="h-2" />
                    <p className="text-xs text-green-600">85% confidence</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forecast Assumptions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Growth Drivers</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                        <span>New member acquisition rate: +12 per month</span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                        <span>Membership upgrade rate: 8% per quarter</span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                        <span>PT sessions growth: +5% monthly</span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                        <span>Class attendance increase: +3% monthly</span>
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Risk Factors</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-start">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2 mt-0.5" />
                        <span>Seasonal variation: -5% in summer months</span>
                      </li>
                      <li className="flex items-start">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2 mt-0.5" />
                        <span>Churn rate: 10.5% baseline</span>
                      </li>
                      <li className="flex items-start">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2 mt-0.5" />
                        <span>Market competition impact</span>
                      </li>
                      <li className="flex items-start">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2 mt-0.5" />
                        <span>Economic conditions volatility</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <Card className="border-l-4 border-l-green-500">
                <CardHeader>
                  <div className="flex items-start space-x-3">
                    <TrendingUp className="h-5 w-5 text-green-600 mt-1" />
                    <div>
                      <CardTitle className="text-base">Strong Revenue Growth</CardTitle>
                      <CardDescription className="mt-1">
                        Revenue has grown by 12.3% month-over-month, exceeding the target by 4.8%. This growth is driven primarily by new member signups and membership upgrades.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <div className="flex items-start space-x-3">
                    <Zap className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <CardTitle className="text-base">Peak Revenue Hours Identified</CardTitle>
                      <CardDescription className="mt-1">
                        6-8 PM generates 28% of daily revenue. Consider implementing premium pricing during peak hours or expanding capacity to maximize revenue potential.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-purple-500">
                <CardHeader>
                  <div className="flex items-start space-x-3">
                    <Users className="h-5 w-5 text-purple-600 mt-1" />
                    <div>
                      <CardTitle className="text-base">Premium Tier Opportunity</CardTitle>
                      <CardDescription className="mt-1">
                        Premium members generate 3.2x more revenue per member than basic tier. Only 18% of members are in premium tier, suggesting significant upsell opportunity.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-orange-500">
                <CardHeader>
                  <div className="flex items-start space-x-3">
                    <ShoppingCart className="h-5 w-5 text-orange-600 mt-1" />
                    <div>
                      <CardTitle className="text-base">Retail Revenue Potential</CardTitle>
                      <CardDescription className="mt-1">
                        Retail represents only 3.9% of total revenue but has highest growth rate at 10.2%. Supplements show strong margin (35%) and consistent demand.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader>
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-1" />
                    <div>
                      <CardTitle className="text-base">Weekend Revenue Gap</CardTitle>
                      <CardDescription className="mt-1">
                        Sunday revenue is 46% lower than peak days (Saturday). Consider special weekend promotions or events to improve Sunday performance.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-cyan-500">
                <CardHeader>
                  <div className="flex items-start space-x-3">
                    <CreditCard className="h-5 w-5 text-cyan-600 mt-1" />
                    <div>
                      <CardTitle className="text-base">Payment Method Insights</CardTitle>
                      <CardDescription className="mt-1">
                        Bank transfers have highest average transaction value (276 AED) but only represent 15% of revenue. Consider incentivizing this payment method to reduce processing fees.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recommended Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <Badge className="bg-green-100 text-green-800">High Priority</Badge>
                    <p className="text-sm">Launch premium tier upgrade campaign targeting standard members with high engagement</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Badge className="bg-green-100 text-green-800">High Priority</Badge>
                    <p className="text-sm">Implement dynamic pricing for peak hours (6-8 PM) to maximize revenue</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Badge className="bg-yellow-100 text-yellow-800">Medium Priority</Badge>
                    <p className="text-sm">Expand retail selection and improve merchandising in high-traffic areas</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Badge className="bg-yellow-100 text-yellow-800">Medium Priority</Badge>
                    <p className="text-sm">Create Sunday-specific programming to boost weekend revenue</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Badge className="bg-blue-100 text-blue-800">Low Priority</Badge>
                    <p className="text-sm">Incentivize bank transfer payments to reduce credit card processing fees</p>
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
            Print Analysis
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
