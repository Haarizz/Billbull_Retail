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
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ScatterChart, Scatter, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import {
  TrendingUpDown,
  Zap,
  Brain,
  Activity,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Users,
  DollarSign,
  Target,
  Bell,
  Settings,
  Eye,
  Play,
  Pause,
  RefreshCw,
  Filter,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertCircle,
  Info,
  Award,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Sparkles,
  LineChart as LineChartIcon,
  BarChart3,
  UserX,
  ShoppingCart,
  Wrench,
  CalendarClock,
  MessagesSquare
} from 'lucide-react';

interface PredictiveAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
  predictiveInsights: Array<{
    insight: string;
    prediction: string;
    confidence: number;
    timeframe: string;
    action: string;
    priority: string;
  }>;
  formatCurrency: (amount: number) => string;
  getCurrentPeriod: () => string;
}

export function PredictiveAnalyticsDialog({
  open,
  onOpenChange,
  defaultTab = 'predictions',
  predictiveInsights,
  formatCurrency,
  getCurrentPeriod
}: PredictiveAnalyticsDialogProps) {
  const [autoAlertEnabled, setAutoAlertEnabled] = React.useState(true);
  const [selectedPrediction, setSelectedPrediction] = React.useState('all');
  const [predictionHorizon, setPredictionHorizon] = React.useState('30');

  // Enhanced Predictive Insights with more details
  const enhancedInsights = [
    {
      id: 1,
      category: 'Churn Risk',
      insight: 'Member Churn Risk Prediction',
      prediction: '23 members at high risk of cancellation',
      confidence: 87,
      timeframe: 'Next 30 days',
      action: 'Schedule retention calls and offer incentives',
      priority: 'High',
      potentialImpact: -34500,
      affectedMembers: 23,
      dataPoints: 1523,
      model: 'Churn Prediction ML',
      lastUpdated: '2 hours ago',
      status: 'Active',
      recommendations: [
        'Offer 10% discount on next renewal',
        'Schedule personal check-in calls',
        'Send personalized workout plans',
        'Invite to exclusive member events'
      ]
    },
    {
      id: 2,
      category: 'Revenue',
      insight: 'Revenue Forecast',
      prediction: '138,500 AED expected next month',
      confidence: 92,
      timeframe: 'June 2024',
      action: 'Increase marketing spend to maximize growth',
      priority: 'Medium',
      potentialImpact: 13500,
      affectedMembers: 847,
      dataPoints: 2847,
      model: 'Revenue Forecasting',
      lastUpdated: '5 hours ago',
      status: 'Active',
      recommendations: [
        'Launch seasonal promotion',
        'Increase social media ads budget',
        'Target corporate memberships',
        'Expand PT offerings'
      ]
    },
    {
      id: 3,
      category: 'Operations',
      insight: 'Peak Hours Capacity Prediction',
      prediction: '6-8 PM will be 15% busier than average',
      confidence: 89,
      timeframe: 'Next week',
      action: 'Schedule additional staff for peak hours',
      priority: 'Medium',
      potentialImpact: 0,
      affectedMembers: 0,
      dataPoints: 3421,
      model: 'Demand Prediction',
      lastUpdated: '1 day ago',
      status: 'Active',
      recommendations: [
        'Add 2 staff members during peak',
        'Open additional training zones',
        'Promote off-peak hour incentives',
        'Monitor equipment availability'
      ]
    },
    {
      id: 4,
      category: 'Maintenance',
      insight: 'Equipment Maintenance Prediction',
      prediction: '3 cardio machines will need service soon',
      confidence: 95,
      timeframe: 'Next 2 weeks',
      action: 'Schedule preventive maintenance',
      priority: 'High',
      potentialImpact: -2500,
      affectedMembers: 0,
      dataPoints: 892,
      model: 'Predictive Maintenance',
      lastUpdated: '3 hours ago',
      status: 'Active',
      recommendations: [
        'Contact maintenance vendor',
        'Schedule during low-traffic hours',
        'Notify members about equipment',
        'Review maintenance contracts'
      ]
    },
    {
      id: 5,
      category: 'Sales',
      insight: 'Personal Training Conversion',
      prediction: '18 members likely to purchase PT packages',
      confidence: 84,
      timeframe: 'Next 14 days',
      action: 'Launch targeted PT promotion campaign',
      priority: 'Medium',
      potentialImpact: 27000,
      affectedMembers: 18,
      dataPoints: 1247,
      model: 'Conversion Prediction',
      lastUpdated: '6 hours ago',
      status: 'Active',
      recommendations: [
        'Send personalized PT offers',
        'Offer free consultation sessions',
        'Create member success stories',
        'Bundle PT with nutrition plans'
      ]
    },
    {
      id: 6,
      category: 'Engagement',
      insight: 'Class Attendance Pattern',
      prediction: 'Yoga classes will see 20% increase on weekends',
      confidence: 88,
      timeframe: 'Next 30 days',
      action: 'Add Saturday morning yoga session',
      priority: 'Low',
      potentialImpact: 4200,
      affectedMembers: 0,
      dataPoints: 1876,
      model: 'Attendance Forecasting',
      lastUpdated: '12 hours ago',
      status: 'Active',
      recommendations: [
        'Hire additional yoga instructor',
        'Expand studio capacity',
        'Promote weekend classes',
        'Create weekend membership tier'
      ]
    },
    {
      id: 7,
      category: 'Risk',
      insight: 'Payment Failure Risk',
      prediction: '12 members at risk of payment failure',
      confidence: 91,
      timeframe: 'Next billing cycle',
      action: 'Proactive payment reminder and support',
      priority: 'High',
      potentialImpact: -8400,
      affectedMembers: 12,
      dataPoints: 567,
      model: 'Payment Risk Analysis',
      lastUpdated: '1 hour ago',
      status: 'Active',
      recommendations: [
        'Send payment reminders 7 days early',
        'Offer payment plan options',
        'Update payment method info',
        'Provide customer support contact'
      ]
    },
    {
      id: 8,
      category: 'Marketing',
      insight: 'New Member Acquisition',
      prediction: '45 new sign-ups expected this month',
      confidence: 86,
      timeframe: 'End of month',
      action: 'Prepare onboarding resources',
      priority: 'Low',
      potentialImpact: 33750,
      affectedMembers: 45,
      dataPoints: 2134,
      model: 'Acquisition Forecasting',
      lastUpdated: '8 hours ago',
      status: 'Active',
      recommendations: [
        'Prepare welcome packages',
        'Schedule orientation sessions',
        'Train front desk staff',
        'Stock merchandise inventory'
      ]
    }
  ];

  // Prediction Accuracy History
  const accuracyHistory = [
    { month: 'Jan', churn: 89, revenue: 94, demand: 87, maintenance: 96 },
    { month: 'Feb', churn: 91, revenue: 93, demand: 89, maintenance: 95 },
    { month: 'Mar', churn: 88, revenue: 95, demand: 91, maintenance: 97 },
    { month: 'Apr', churn: 90, revenue: 92, demand: 88, maintenance: 94 },
    { month: 'May', churn: 87, revenue: 92, demand: 89, maintenance: 95 },
    { month: 'Jun', churn: 89, revenue: 93, demand: 90, maintenance: 96 }
  ];

  // Impact Analysis
  const impactAnalysis = [
    { category: 'Revenue Impact', positive: 78750, negative: -45400, net: 33350 },
    { category: 'Member Impact', positive: 63, negative: -35, net: 28 },
    { category: 'Operational Impact', positive: 15, negative: -3, net: 12 }
  ];

  // Prediction Timeline
  const predictionTimeline = [
    { week: 'Week 1', churnRisk: 5, newSignups: 12, revenue: 32500 },
    { week: 'Week 2', churnRisk: 8, newSignups: 15, revenue: 34200 },
    { week: 'Week 3', churnRisk: 6, newSignups: 10, revenue: 33800 },
    { week: 'Week 4', churnRisk: 4, newSignups: 18, revenue: 37900 }
  ];

  // Model Performance Comparison
  const modelPerformance = [
    { model: 'Churn Prediction', accuracy: 87, precision: 85, recall: 89, f1Score: 87 },
    { model: 'Revenue Forecast', accuracy: 92, precision: 91, recall: 93, f1Score: 92 },
    { model: 'Demand Prediction', accuracy: 89, precision: 88, recall: 90, f1Score: 89 },
    { model: 'Maintenance Prediction', accuracy: 95, precision: 96, recall: 94, f1Score: 95 },
    { model: 'Conversion Prediction', accuracy: 84, precision: 82, recall: 86, f1Score: 84 }
  ];

  // Auto-Alert Configuration
  const alertRules = [
    {
      rule: 'High Churn Risk Alert',
      condition: 'When 10+ members at high risk',
      enabled: true,
      recipients: 'Management Team',
      lastTriggered: '2 days ago'
    },
    {
      rule: 'Revenue Threshold Alert',
      condition: 'When forecast < 90% of target',
      enabled: true,
      recipients: 'Finance Team',
      lastTriggered: 'Never'
    },
    {
      rule: 'Capacity Warning',
      condition: 'When occupancy > 85%',
      enabled: true,
      recipients: 'Operations Team',
      lastTriggered: '5 days ago'
    },
    {
      rule: 'Equipment Maintenance Alert',
      condition: 'When maintenance due in 7 days',
      enabled: true,
      recipients: 'Facilities Team',
      lastTriggered: '1 week ago'
    },
    {
      rule: 'Payment Failure Alert',
      condition: 'When 5+ payment risks detected',
      enabled: true,
      recipients: 'Finance & Support',
      lastTriggered: '3 days ago'
    }
  ];

  // Prediction Scenarios
  const scenarios = [
    {
      name: 'Best Case Scenario',
      description: 'Optimal conditions with aggressive growth',
      revenue: 152000,
      members: 920,
      retention: 94,
      probability: 15
    },
    {
      name: 'Expected Scenario',
      description: 'Most likely outcome based on trends',
      revenue: 138500,
      members: 862,
      retention: 90,
      probability: 65
    },
    {
      name: 'Conservative Scenario',
      description: 'Cautious estimate with challenges',
      revenue: 128000,
      members: 810,
      retention: 87,
      probability: 20
    }
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Churn Risk':
        return <UserX className="h-5 w-5 text-red-600" />;
      case 'Revenue':
        return <DollarSign className="h-5 w-5 text-green-600" />;
      case 'Operations':
        return <Activity className="h-5 w-5 text-blue-600" />;
      case 'Maintenance':
        return <Wrench className="h-5 w-5 text-orange-600" />;
      case 'Sales':
        return <ShoppingCart className="h-5 w-5 text-purple-600" />;
      case 'Engagement':
        return <Users className="h-5 w-5 text-cyan-600" />;
      case 'Risk':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'Marketing':
        return <Sparkles className="h-5 w-5 text-pink-600" />;
      default:
        return <Info className="h-5 w-5 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-800';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'Low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 80) return 'text-blue-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <TrendingUpDown className="h-6 w-6 text-[#2B7A78]" />
            <span>Predictive Analytics - {getCurrentPeriod()}</span>
          </DialogTitle>
          <DialogDescription>
            AI-powered predictions, forecasts, and proactive insights for business planning
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="predictions">Predictions</TabsTrigger>
            <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
            <TabsTrigger value="impact">Impact</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="alerts">Auto-Alerts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Predictions Tab */}
          <TabsContent value="predictions" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Brain className="h-5 w-5 text-[#2B7A78]" />
                <div>
                  <h3 className="font-semibold">Active Predictions</h3>
                  <p className="text-sm text-muted-foreground">{enhancedInsights.length} AI-powered forecasts</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Select value={predictionHorizon} onValueChange={setPredictionHorizon}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
                <Button size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-4">
              {enhancedInsights.map((insight) => (
                <Card key={insight.id} className="border-l-4" style={{ 
                  borderLeftColor: 
                    insight.priority === 'High' ? '#ef4444' : 
                    insight.priority === 'Medium' ? '#f59e0b' : 
                    '#10b981' 
                }}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        {getCategoryIcon(insight.category)}
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <CardTitle className="text-base">{insight.insight}</CardTitle>
                            <Badge className={getPriorityColor(insight.priority)}>
                              {insight.priority} Priority
                            </Badge>
                            <Badge variant="outline">{insight.category}</Badge>
                          </div>
                          <CardDescription className="mt-1 font-medium text-base">
                            {insight.prediction}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">AI Confidence</p>
                        <div className="flex items-center space-x-2">
                          <Progress value={insight.confidence} className="h-2 flex-1" />
                          <span className={`text-sm font-medium ${getConfidenceColor(insight.confidence)}`}>
                            {insight.confidence}%
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Timeframe</p>
                        <div className="flex items-center space-x-1">
                          <CalendarClock className="h-3 w-3" />
                          <p className="text-sm">{insight.timeframe}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Potential Impact</p>
                        <p className={`text-sm font-medium ${insight.potentialImpact > 0 ? 'text-green-600' : insight.potentialImpact < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {insight.potentialImpact !== 0 ? formatCurrency(Math.abs(insight.potentialImpact)) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Model Used</p>
                        <Badge variant="outline" className="text-xs">{insight.model}</Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                        <p className="text-sm">{insight.lastUpdated}</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded mb-3">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        <Lightbulb className="h-4 w-4 inline mr-1" />
                        Recommended Action
                      </p>
                      <p className="text-sm text-blue-700">{insight.action}</p>
                    </div>

                    <div className="space-y-2 mb-3">
                      <p className="text-xs font-medium text-muted-foreground">Actionable Recommendations:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {insight.recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start space-x-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button size="sm" className="bg-[#2B7A78] hover:bg-[#236663]">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Implement Action
                      </Button>
                      <Button size="sm" variant="outline">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      <Button size="sm" variant="outline">
                        <Bell className="h-4 w-4 mr-2" />
                        Set Alert
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Accuracy Tab */}
          <TabsContent value="accuracy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prediction Model Accuracy</CardTitle>
                <CardDescription>Historical accuracy tracking across all prediction models</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={accuracyHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis domain={[80, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="churn" stroke="#ef4444" strokeWidth={2} name="Churn Prediction" />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue Forecast" />
                    <Line type="monotone" dataKey="demand" stroke="#3b82f6" strokeWidth={2} name="Demand Prediction" />
                    <Line type="monotone" dataKey="maintenance" stroke="#f59e0b" strokeWidth={2} name="Maintenance" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Accuracy</TableHead>
                      <TableHead className="text-right">Precision</TableHead>
                      <TableHead className="text-right">Recall</TableHead>
                      <TableHead className="text-right">F1 Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelPerformance.map((model, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{model.model}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Progress value={model.accuracy} className="h-2 w-16" />
                            <span className={`text-sm font-medium ${getConfidenceColor(model.accuracy)}`}>
                              {model.accuracy}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{model.precision}%</TableCell>
                        <TableCell className="text-right">{model.recall}%</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{model.f1Score}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Average Accuracy</p>
                      <p className="text-2xl font-bold text-green-600">89.4%</p>
                      <p className="text-xs text-green-600 mt-1">+2.1% this month</p>
                    </div>
                    <Award className="h-10 w-10 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Predictions</p>
                      <p className="text-2xl font-bold">8,472</p>
                      <p className="text-xs text-blue-600 mt-1">Last 6 months</p>
                    </div>
                    <BarChart3 className="h-10 w-10 text-blue-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Successful Actions</p>
                      <p className="text-2xl font-bold">142</p>
                      <p className="text-xs text-purple-600 mt-1">Based on predictions</p>
                    </div>
                    <CheckCircle className="h-10 w-10 text-purple-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Impact Tab */}
          <TabsContent value="impact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Predicted Impact Analysis</CardTitle>
                <CardDescription>Financial and operational impact of current predictions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {impactAnalysis.map((impact, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{impact.category}</h4>
                        <Badge className={impact.net > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          Net: {impact.category === 'Revenue Impact' ? formatCurrency(impact.net) : impact.net}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-green-50 rounded">
                          <p className="text-xs text-muted-foreground mb-1">Positive</p>
                          <p className="text-lg font-bold text-green-600">
                            {impact.category === 'Revenue Impact' ? formatCurrency(impact.positive) : `+${impact.positive}`}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-red-50 rounded">
                          <p className="text-xs text-muted-foreground mb-1">Negative</p>
                          <p className="text-lg font-bold text-red-600">
                            {impact.category === 'Revenue Impact' ? formatCurrency(Math.abs(impact.negative)) : impact.negative}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded">
                          <p className="text-xs text-muted-foreground mb-1">Net Impact</p>
                          <p className={`text-lg font-bold ${impact.net > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {impact.category === 'Revenue Impact' ? formatCurrency(impact.net) : impact.net}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">4-Week Prediction Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={predictionTimeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="churnRisk" fill="#ef4444" name="Churn Risk" />
                    <Bar dataKey="newSignups" fill="#10b981" name="New Signups" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Key Impact Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-2">
                      <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Revenue Growth Opportunity</p>
                        <p className="text-xs text-muted-foreground">Predicted actions could increase revenue by 26.5%</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2">
                      <UserX className="h-5 w-5 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Churn Prevention Priority</p>
                        <p className="text-xs text-muted-foreground">35 members need immediate retention efforts</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Activity className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Operational Efficiency</p>
                        <p className="text-xs text-muted-foreground">Peak hour optimization could improve capacity by 12%</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Risk vs Opportunity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Growth Opportunities</span>
                        <span className="text-sm font-medium text-green-600">68%</span>
                      </div>
                      <Progress value={68} className="h-3 bg-green-100" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Risk Factors</span>
                        <span className="text-sm font-medium text-red-600">32%</span>
                      </div>
                      <Progress value={32} className="h-3 bg-red-100" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Scenarios Tab */}
          <TabsContent value="scenarios" className="space-y-4">
            <div className="space-y-4">
              {scenarios.map((scenario, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{scenario.name}</CardTitle>
                        <CardDescription>{scenario.description}</CardDescription>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800">
                        {scenario.probability}% Probability
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-gray-50 rounded">
                        <p className="text-sm text-muted-foreground mb-1">Revenue</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(scenario.revenue)}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded">
                        <p className="text-sm text-muted-foreground mb-1">Members</p>
                        <p className="text-xl font-bold text-blue-600">{scenario.members}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded">
                        <p className="text-sm text-muted-foreground mb-1">Retention</p>
                        <p className="text-xl font-bold text-purple-600">{scenario.retention}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create Custom Scenario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Scenario Name</Label>
                    <Input placeholder="Enter scenario name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Target Revenue (AED)</Label>
                      <Input type="number" placeholder="140000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Members</Label>
                      <Input type="number" placeholder="900" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Key Assumptions</Label>
                    <Textarea placeholder="Describe the assumptions for this scenario..." />
                  </div>
                  <Button className="w-full bg-[#2B7A78] hover:bg-[#236663]">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Scenario
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Auto-Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Auto-Alert Configuration</h3>
                <p className="text-sm text-muted-foreground">Automated alerts based on prediction thresholds</p>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={autoAlertEnabled} 
                  onCheckedChange={setAutoAlertEnabled}
                />
                <span className="text-sm font-medium">
                  {autoAlertEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Alert Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alert Rule</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Last Triggered</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertRules.map((rule, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{rule.rule}</TableCell>
                        <TableCell className="text-sm">{rule.condition}</TableCell>
                        <TableCell className="text-sm">{rule.recipients}</TableCell>
                        <TableCell className="text-sm">{rule.lastTriggered}</TableCell>
                        <TableCell>
                          <Badge className={rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {rule.enabled ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Create New Alert Rule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Alert Type</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select alert type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="churn">Churn Risk</SelectItem>
                          <SelectItem value="revenue">Revenue Threshold</SelectItem>
                          <SelectItem value="capacity">Capacity Warning</SelectItem>
                          <SelectItem value="maintenance">Maintenance Alert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Threshold Condition</Label>
                      <Input placeholder="e.g., When value > 10" />
                    </div>
                    <div className="space-y-2">
                      <Label>Recipients</Label>
                      <Input placeholder="email@example.com" />
                    </div>
                    <Button className="w-full bg-[#2B7A78] hover:bg-[#236663]">
                      <Bell className="h-4 w-4 mr-2" />
                      Create Alert Rule
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Alerts Sent</span>
                      <span className="text-2xl font-bold">47</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">This Month</span>
                      <span className="text-lg font-medium">12</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Average Response Time</span>
                      <span className="text-lg font-medium">2.3 hours</span>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Alert Accuracy</span>
                        <span className="font-medium">91%</span>
                      </div>
                      <Progress value={91} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prediction Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Auto-Refresh Predictions</p>
                      <p className="text-xs text-muted-foreground">Update predictions every 6 hours</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Email Notifications</p>
                      <p className="text-xs text-muted-foreground">Receive prediction updates via email</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">High Priority Alerts Only</p>
                      <p className="text-xs text-muted-foreground">Only notify for high priority predictions</p>
                    </div>
                    <Switch />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Default Prediction Horizon</Label>
                    <Select defaultValue="30">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Confidence Threshold</Label>
                    <Select defaultValue="80">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="70">70% - Show all predictions</SelectItem>
                        <SelectItem value="80">80% - Balanced (recommended)</SelectItem>
                        <SelectItem value="90">90% - High confidence only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full justify-start">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retrain All Models
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Export Prediction Data
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    View Model Documentation
                  </Button>
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
            Export All Predictions
          </Button>
          <Button className="bg-[#E63946] hover:bg-[#d32f3f]">
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

