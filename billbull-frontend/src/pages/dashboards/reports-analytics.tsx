import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, Calendar, DollarSign, Download, Filter, RefreshCw, BarChart3, FileText } from 'lucide-react';

interface ReportsAnalyticsProps {
  onNavigate?: (section: string) => void;
}

const membershipTrends = [
  { month: 'Jan', newMembers: 45, cancelledMembers: 12, totalMembers: 320 },
  { month: 'Feb', newMembers: 52, cancelledMembers: 8, totalMembers: 364 },
  { month: 'Mar', newMembers: 38, cancelledMembers: 15, totalMembers: 387 },
  { month: 'Apr', newMembers: 61, cancelledMembers: 9, totalMembers: 439 },
  { month: 'May', newMembers: 44, cancelledMembers: 18, totalMembers: 465 },
  { month: 'Jun', newMembers: 67, cancelledMembers: 11, totalMembers: 521 },
];

const revenueBreakdown = [
  { name: 'Memberships', value: 65, amount: 325000, color: '#8884d8' },
  { name: 'Personal Training', value: 20, amount: 100000, color: '#82ca9d' },
  { name: 'Group Classes', value: 10, amount: 50000, color: '#ffc658' },
  { name: 'Merchandise', value: 3, amount: 15000, color: '#ff7c7c' },
  { name: 'Other Services', value: 2, amount: 10000, color: '#8dd1e1' },
];

const classAttendance = [
  { class: 'HIIT', Jan: 85, Feb: 90, Mar: 88, Apr: 92, May: 89, Jun: 95 },
  { class: 'Yoga', Jan: 78, Feb: 82, Mar: 85, Apr: 87, May: 83, Jun: 89 },
  { class: 'Pilates', Jan: 65, Feb: 70, Mar: 72, Apr: 75, May: 78, Jun: 82 },
  { class: 'Strength', Jan: 92, Feb: 89, Mar: 91, Apr: 88, May: 94, Jun: 96 },
  { class: 'Cardio', Jan: 88, Feb: 85, Mar: 90, Apr: 87, May: 91, Jun: 93 },
];

const memberDemographics = [
  { ageGroup: '18-25', count: 120, percentage: 23 },
  { ageGroup: '26-35', count: 180, percentage: 35 },
  { ageGroup: '36-45', count: 135, percentage: 26 },
  { ageGroup: '46-55', count: 65, percentage: 12 },
  { ageGroup: '55+', count: 21, percentage: 4 },
];

const peakHours = [
  { hour: '6AM', usage: 45 },
  { hour: '7AM', usage: 85 },
  { hour: '8AM', usage: 120 },
  { hour: '9AM', usage: 95 },
  { hour: '10AM', usage: 60 },
  { hour: '11AM', usage: 75 },
  { hour: '12PM', usage: 110 },
  { hour: '1PM', usage: 85 },
  { hour: '2PM', usage: 55 },
  { hour: '3PM', usage: 65 },
  { hour: '4PM', usage: 90 },
  { hour: '5PM', usage: 140 },
  { hour: '6PM', usage: 160 },
  { hour: '7PM', usage: 135 },
  { hour: '8PM', usage: 100 },
  { hour: '9PM', usage: 70 },
];

const kpiData = [
  {
    title: "Member Retention Rate",
    value: "94.2%",
    change: "+2.1%",
    trend: "up",
    description: "Monthly retention rate"
  },
  {
    title: "Average Revenue Per Member",
    value: "$127",
    change: "+8.5%",
    trend: "up",
    description: "Per member monthly"
  },
  {
    title: "Class Utilization Rate",
    value: "78%",
    change: "-3.2%",
    trend: "down",
    description: "Average across all classes"
  },
  {
    title: "Equipment Downtime",
    value: "2.3%",
    change: "-1.1%",
    trend: "up",
    description: "Equipment availability"
  }
];

export function ReportsAnalytics({ onNavigate }: ReportsAnalyticsProps = {}) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Comprehensive business intelligence and performance metrics.</p>
        </div>
        <div className="flex space-x-2">
          <Button 
            className="btn-primary"
            onClick={() => onNavigate?.('custom-reports')}
          >
            <FileText className="mr-2 h-4 w-4" />
            Custom Reports
          </Button>
          <Button variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Data
          </Button>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Custom Filter
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <TrendingUp className={`h-4 w-4 ${kpi.trend === 'up' ? 'text-green-600' : 'text-red-600'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">
                <span className={kpi.trend === 'up' ? 'text-green-600' : 'text-red-600'}>
                  {kpi.change}
                </span>{' '}
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="membership">Membership</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="custom">Custom Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Membership Growth Trend</CardTitle>
                <CardDescription>Member acquisition and retention over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={membershipTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="totalMembers" stackId="1" stroke="#8884d8" fill="#8884d8" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Distribution</CardTitle>
                <CardDescription>Revenue breakdown by service type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={revenueBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {revenueBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Peak Usage Hours</CardTitle>
              <CardDescription>Gym utilization throughout the day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={peakHours}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="usage" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="membership" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Member Acquisition vs Churn</CardTitle>
                <CardDescription>Monthly new members vs cancellations</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={membershipTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="newMembers" fill="#82ca9d" name="New Members" />
                    <Bar dataKey="cancelledMembers" fill="#ff7c7c" name="Cancelled" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Member Demographics</CardTitle>
                <CardDescription>Age distribution of members</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {memberDemographics.map((demo, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium">{demo.ageGroup}</span>
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${demo.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">{demo.count}</span>
                      <Badge variant="secondary">{demo.percentage}%</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Membership Metrics</CardTitle>
              <CardDescription>Key membership performance indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">94.2%</div>
                  <div className="text-sm text-muted-foreground">Retention Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">4.2</div>
                  <div className="text-sm text-muted-foreground">Avg. Visits/Week</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">18 months</div>
                  <div className="text-sm text-muted-foreground">Avg. Membership Length</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Trends</CardTitle>
                  <CardDescription>Monthly revenue by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={membershipTrends.map((item, index) => ({
                      ...item,
                      revenue: revenueBreakdown.reduce((sum, r) => sum + r.amount, 0) / 6 + Math.random() * 10000
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Summary</CardTitle>
                <CardDescription>This month's performance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {revenueBreakdown.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm">{item.name}</span>
                    <div className="text-right">
                      <div className="font-medium">${item.amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{item.value}%</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Class Attendance Trends</CardTitle>
                <CardDescription>Attendance rates by class type over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[
                    { month: 'Jan', HIIT: 85, Yoga: 78, Pilates: 65, Strength: 92 },
                    { month: 'Feb', HIIT: 90, Yoga: 82, Pilates: 70, Strength: 89 },
                    { month: 'Mar', HIIT: 88, Yoga: 85, Pilates: 72, Strength: 91 },
                    { month: 'Apr', HIIT: 92, Yoga: 87, Pilates: 75, Strength: 88 },
                    { month: 'May', HIIT: 89, Yoga: 83, Pilates: 78, Strength: 94 },
                    { month: 'Jun', HIIT: 95, Yoga: 89, Pilates: 82, Strength: 96 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="HIIT" stroke="#8884d8" />
                    <Line type="monotone" dataKey="Yoga" stroke="#82ca9d" />
                    <Line type="monotone" dataKey="Pilates" stroke="#ffc658" />
                    <Line type="monotone" dataKey="Strength" stroke="#ff7c7c" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Operational Metrics</CardTitle>
                <CardDescription>Key operational performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Equipment Utilization</span>
                    <span className="text-sm font-medium">87%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '87%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Staff Efficiency</span>
                    <span className="text-sm font-medium">92%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '92%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Customer Satisfaction</span>
                    <span className="text-sm font-medium">4.7/5</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-purple-600 h-2 rounded-full" style={{ width: '94%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="custom" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom Report Builder</CardTitle>
              <CardDescription>Create custom reports and analytics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select defaultValue="month">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Last 7 days</SelectItem>
                      <SelectItem value="month">Last 30 days</SelectItem>
                      <SelectItem value="quarter">Last 3 months</SelectItem>
                      <SelectItem value="year">Last 12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Report Type</label>
                  <Select defaultValue="revenue">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Revenue Analysis</SelectItem>
                      <SelectItem value="membership">Membership Report</SelectItem>
                      <SelectItem value="attendance">Class Attendance</SelectItem>
                      <SelectItem value="equipment">Equipment Usage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Format</label>
                  <Select defaultValue="pdf">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Report</SelectItem>
                      <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                      <SelectItem value="csv">CSV Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <Button>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
                <Button variant="outline">
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Report
                </Button>
              </div>

              <div className="mt-8 text-center py-8 text-muted-foreground border-t">
                <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">Advanced Report Builder</h3>
                <p>Create custom reports with drag-and-drop functionality and advanced filtering options. This feature is under development.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
