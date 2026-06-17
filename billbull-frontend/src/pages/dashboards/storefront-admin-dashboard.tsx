import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import { Progress } from "../../components/ui/progress";
import { Switch } from "../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Globe,
  Lock,
  MapPin,
  Package,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Zap,
  XCircle,
  Activity,
  Target,
  Boxes,
  AlertOctagon,
} from "lucide-react";

/* =========================================================
   BillBull Storefront â€” Admin Dashboard (Commerce Control Tower)
   
   Real-time monitoring & action center for:
   âœ… Live orders feed with SLA tracking
   âœ… Branch/warehouse availability
   âœ… Gross margin leak alerts
   âœ… Fraud & risk detection
   âœ… Customer insights
   âœ… Incident center
   âœ… Quick actions sidebar
   âœ… Executive summary footer
========================================================= */

type OrderStatus = "PROCESSING" | "PICKING" | "PACKED" | "SHIPPED" | "DELIVERED";
type PaymentType = "PAID" | "COD" | "PENDING";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type SLAStatus = "ON_TRACK" | "AT_RISK" | "BREACHED";
type IncidentStatus = "ACTIVE" | "INVESTIGATING" | "RESOLVED";

type LiveOrder = {
  id: string;
  timePlaced: Date;
  paymentType: PaymentType;
  value: number;
  branch: string;
  slaMinutes: number;
  slaDeadline: Date;
  slaStatus: SLAStatus;
  riskFlags: string[];
  status: OrderStatus;
};

type BranchLoad = {
  id: string;
  name: string;
  activeOrders: number;
  stockReserved: number;
  pickPackBacklog: number;
  slaHealth: number;
  staffLoad: number;
  capacity: number;
};

type MarginAlert = {
  id: string;
  orderId: string;
  skus: string[];
  expectedGM: number;
  actualGM: number;
  cause: string;
  impact: number;
  timestamp: Date;
};

type RiskAlert = {
  id: string;
  orderId: string;
  riskScore: number;
  triggers: string[];
  suggestedAction: string;
  timestamp: Date;
};

type Incident = {
  id: string;
  service: string;
  impactedOrders: number;
  status: IncidentStatus;
  detectedAt: Date;
  owner: string;
  description: string;
};

const formatCurrency = (n: number) => `AED ${n.toFixed(2)}`;
const formatTime = (date: Date) => {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  return `${hours}h ago`;
};

export function StorefrontAdminDashboard() {
  const [isLivePaused, setIsLivePaused] = useState(false);
  const [timeRange, setTimeRange] = useState("live");
  const [selectedStore, setSelectedStore] = useState("main");
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<LiveOrder | null>(null);

  return (
    <div className="flex flex-col h-screen bg-[#F7F7FA]">
      {/* Header */}
      <DashboardHeader
        isLivePaused={isLivePaused}
        onTogglePause={() => setIsLivePaused(!isLivePaused)}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        selectedStore={selectedStore}
        onStoreChange={setSelectedStore}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Rail - Quick Actions */}
        <QuickActionsRail />

        {/* Main Dashboard Canvas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Live Orders Feed */}
          <LiveOrdersFeed
            isPaused={isLivePaused}
            onOrderClick={(order) => {
              setSelectedOrder(order);
              setOpenOrderDialog(true);
            }}
          />

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Branch Availability */}
            <BranchAvailabilityPanel />

            {/* Margin Leak Alerts */}
            <MarginLeakAlerts />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fraud & Risk */}
            <FraudRiskPanel />

            {/* Customer Insights */}
            <CustomerInsights />
          </div>

          {/* Incident Center */}
          <IncidentCenter />
        </div>
      </div>

      {/* Sticky Footer - Executive Summary */}
      <ExecutiveSummaryFooter />

      {/* Order Detail Dialog */}
      <Dialog open={openOrderDialog} onOpenChange={setOpenOrderDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Order Details & Actions</DialogTitle>
            <DialogDescription>Full timeline & controls</DialogDescription>
          </DialogHeader>
          {selectedOrder && <OrderDetailView order={selectedOrder} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ==================== HEADER ==================== */

function DashboardHeader({
  isLivePaused,
  onTogglePause,
  timeRange,
  onTimeRangeChange,
  selectedStore,
  onStoreChange,
}: {
  isLivePaused: boolean;
  onTogglePause: () => void;
  timeRange: string;
  onTimeRangeChange: (val: string) => void;
  selectedStore: string;
  onStoreChange: (val: string) => void;
}) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#F5C742]" />
            <h1 className="text-xl font-semibold text-[#1E293B]">Commerce Control Tower</h1>
          </div>

          <div className="flex items-center gap-2 ml-6">
            <div className={`w-2 h-2 rounded-full ${isLivePaused ? "bg-yellow-500" : "bg-green-500 animate-pulse"}`} />
            <span className="text-sm text-slate-600">{isLivePaused ? "Paused" : "Live"}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Store Selector */}
          <Select value={selectedStore} onValueChange={onStoreChange}>
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="main">Main Store</SelectItem>
              <SelectItem value="fujairah">Fujairah Store</SelectItem>
              <SelectItem value="all">All Stores</SelectItem>
            </SelectContent>
          </Select>

          {/* Time Range */}
          <Select value={timeRange} onValueChange={onTimeRangeChange}>
            <SelectTrigger className="w-[150px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="15m">Last 15 min</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {/* Pause/Play */}
          <Button
            size="sm"
            variant="outline"
            className="bg-white"
            onClick={onTogglePause}
          >
            {isLivePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>

          {/* Export */}
          <Button size="sm" variant="outline" className="bg-white">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

          {/* Alerts */}
          <Button size="sm" className="bg-red-500 text-white hover:bg-red-600 relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 text-xs rounded-full flex items-center justify-center text-slate-900 font-bold">
              7
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==================== QUICK ACTIONS RAIL ==================== */

function QuickActionsRail() {
  const actions = [
    { label: "Create Order", icon: <ShoppingCart className="h-4 w-4" />, color: "blue" },
    { label: "Force Sync", icon: <RefreshCw className="h-4 w-4" />, color: "green" },
    { label: "Freeze Discounts", icon: <Ban className="h-4 w-4" />, color: "red" },
    { label: "Block Customer", icon: <Shield className="h-4 w-4" />, color: "orange" },
    { label: "Switch Gateway", icon: <CreditCard className="h-4 w-4" />, color: "purple" },
    { label: "Fulfillment Hub", icon: <Truck className="h-4 w-4" />, color: "teal" },
    { label: "Finance Recon", icon: <DollarSign className="h-4 w-4" />, color: "emerald" },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 p-4 space-y-2 overflow-y-auto">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Quick Actions
      </div>

      {actions.map((action, idx) => (
        <Button
          key={idx}
          variant="outline"
          className="w-full justify-start bg-white hover:bg-slate-50"
        >
          {action.icon}
          <span className="ml-2 text-sm">{action.label}</span>
        </Button>
      ))}

      <Separator className="my-4" />

      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Filters
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Branch</Label>
          <Select defaultValue="all">
            <SelectTrigger className="mt-1 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              <SelectItem value="dubai">Dubai</SelectItem>
              <SelectItem value="fujairah">Fujairah</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Risk Level</Label>
          <Select defaultValue="all">
            <SelectTrigger className="mt-1 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="high">High Risk Only</SelectItem>
              <SelectItem value="medium">Medium+</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Label className="text-xs">SLA Breach Only</Label>
          <Switch />
        </div>
      </div>
    </div>
  );
}

/* ==================== LIVE ORDERS FEED ==================== */

function LiveOrdersFeed({
  isPaused,
  onOrderClick,
}: {
  isPaused: boolean;
  onOrderClick: (order: LiveOrder) => void;
}) {
  const orders = useMemo(() => seedLiveOrders(), []);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-[#1E293B] flex items-center gap-2">
              <Circle className={`h-3 w-3 ${isPaused ? "fill-yellow-500 text-yellow-500" : "fill-green-500 text-green-500 animate-pulse"}`} />
              Live Orders Stream
            </CardTitle>
            <CardDescription>Real-time monitoring with SLA tracking</CardDescription>
          </div>
          <Badge className="bg-slate-900 text-white">
            {orders.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Time Elapsed</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const elapsed = Math.floor((new Date().getTime() - order.timePlaced.getTime()) / 1000 / 60);
                const slaRemaining = order.slaMinutes - elapsed;

                return (
                  <TableRow
                    key={order.id}
                    className={
                      order.slaStatus === "BREACHED"
                        ? "bg-red-50"
                        : order.slaStatus === "AT_RISK"
                        ? "bg-yellow-50"
                        : ""
                    }
                  >
                    <TableCell className="font-medium text-[#1E293B]">
                      <button
                        onClick={() => onOrderClick(order)}
                        className="hover:underline"
                      >
                        {order.id}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {elapsed}m
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          order.paymentType === "PAID"
                            ? "bg-green-100 text-green-900"
                            : order.paymentType === "COD"
                            ? "bg-orange-100 text-orange-900"
                            : "bg-yellow-100 text-yellow-900"
                        }
                      >
                        {order.paymentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(order.value)}</TableCell>
                    <TableCell className="text-sm">{order.branch}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {order.slaStatus === "ON_TRACK" && (
                          <Badge className="bg-green-100 text-green-900">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {slaRemaining}m
                          </Badge>
                        )}
                        {order.slaStatus === "AT_RISK" && (
                          <Badge className="bg-yellow-100 text-yellow-900">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {slaRemaining}m
                          </Badge>
                        )}
                        {order.slaStatus === "BREACHED" && (
                          <Badge className="bg-red-100 text-red-900">
                            <XCircle className="h-3 w-3 mr-1" />
                            Breach
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {order.riskFlags.length > 0 ? (
                        <Badge className="bg-red-100 text-red-900">
                          {order.riskFlags.length} flags
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">Clean</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onOrderClick(order)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost">
                          <MapPin className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-900">
            <strong>2 orders</strong> stuck &gt; 15 minutes â€¢ Auto-highlighted
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ==================== BRANCH AVAILABILITY PANEL ==================== */

function BranchAvailabilityPanel() {
  const branches = useMemo(() => seedBranchLoad(), []);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-[#1E293B]">
          <Boxes className="h-4 w-4 inline mr-2" />
          Branch / Warehouse Availability
        </CardTitle>
        <CardDescription>Fulfillment allocation & load</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {branches.map((branch) => {
          const loadPct = (branch.activeOrders / branch.capacity) * 100;
          const healthColor =
            branch.slaHealth >= 90
              ? "text-green-600"
              : branch.slaHealth >= 70
              ? "text-yellow-600"
              : "text-red-600";

          return (
            <Card key={branch.id} className="bg-slate-50 border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-[#1E293B]">{branch.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {branch.activeOrders} / {branch.capacity} capacity
                    </div>
                  </div>
                  <Badge
                    className={
                      loadPct < 70
                        ? "bg-green-100 text-green-900"
                        : loadPct < 90
                        ? "bg-yellow-100 text-yellow-900"
                        : "bg-red-100 text-red-900"
                    }
                  >
                    {Math.round(loadPct)}%
                  </Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Stock Reserved</span>
                    <span className="font-medium">{branch.stockReserved}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Pick/Pack Backlog</span>
                    <span className="font-medium">{branch.pickPackBacklog}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">SLA Health</span>
                    <span className={`font-medium ${healthColor}`}>{branch.slaHealth}%</span>
                  </div>
                </div>

                <div className="mt-3">
                  <Progress value={loadPct} className="h-2" />
                </div>

                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 text-xs">
                    Override
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs">
                    Block
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 mt-4">
          <div className="text-sm font-semibold text-yellow-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Auto-Reroute Active
          </div>
          <div className="text-xs text-yellow-800 mt-1">
            Orders auto-routed from Dubai (SLA degraded) to Fujairah
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ==================== MARGIN LEAK ALERTS ==================== */

function MarginLeakAlerts() {
  const alerts = useMemo(() => seedMarginAlerts(), []);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-[#1E293B]">
              <TrendingDown className="h-4 w-4 inline mr-2 text-red-600" />
              Gross Margin Leak Alerts
            </CardTitle>
            <CardDescription>Revenue protection center</CardDescription>
          </div>
          <Badge className="bg-red-500 text-white">
            {alerts.length} alerts
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => {
          const gmDiff = alert.expectedGM - alert.actualGM;
          return (
            <Card key={alert.id} className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-[#1E293B]">
                      Order {alert.orderId}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {alert.skus.join(", ")}
                    </div>
                  </div>
                  <Badge className="bg-red-600 text-white">
                    -{formatCurrency(alert.impact)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div className="p-2 rounded bg-white">
                    <div className="text-slate-600">Expected GM</div>
                    <div className="font-bold text-green-600">{alert.expectedGM}%</div>
                  </div>
                  <div className="p-2 rounded bg-white">
                    <div className="text-slate-600">Actual GM</div>
                    <div className="font-bold text-red-600">{alert.actualGM}%</div>
                  </div>
                </div>

                <div className="text-xs mb-3">
                  <span className="text-slate-600">Root Cause:</span>{" "}
                  <span className="font-medium text-[#1E293B]">{alert.cause}</span>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-green-600 text-white hover:bg-green-700 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs">
                    Reject
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs">
                    <FileText className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="p-3 rounded-lg bg-slate-900 text-white">
          <div className="text-sm font-semibold mb-1">Top 3 Margin Killers Today</div>
          <div className="text-xs space-y-1 mt-2">
            <div className="flex justify-between">
              <span>High discount orders</span>
              <span className="font-bold">-{formatCurrency(1240)}</span>
            </div>
            <div className="flex justify-between">
              <span>Price overrides</span>
              <span className="font-bold">-{formatCurrency(890)}</span>
            </div>
            <div className="flex justify-between">
              <span>Coupon misuse</span>
              <span className="font-bold">-{formatCurrency(560)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ==================== FRAUD & RISK PANEL ==================== */

function FraudRiskPanel() {
  const risks = useMemo(() => seedRiskAlerts(), []);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-[#1E293B]">
              <Shield className="h-4 w-4 inline mr-2 text-red-600" />
              Fraud & Risk Monitor
            </CardTitle>
            <CardDescription>Commerce risk detection</CardDescription>
          </div>
          <Badge className="bg-orange-500 text-white">
            {risks.length} in queue
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {risks.map((risk) => {
          const riskColor =
            risk.riskScore >= 80
              ? "bg-red-600"
              : risk.riskScore >= 60
              ? "bg-orange-500"
              : risk.riskScore >= 40
              ? "bg-yellow-500"
              : "bg-green-500";

          return (
            <Card key={risk.id} className="bg-orange-50 border-orange-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-[#1E293B]">
                      Order {risk.orderId}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {formatTime(risk.timestamp)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${riskColor}`} />
                    <span className="text-sm font-bold">{risk.riskScore}</span>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  {risk.triggers.map((trigger, idx) => (
                    <div
                      key={idx}
                      className="text-xs px-2 py-1 rounded bg-white border border-orange-300 text-orange-900"
                    >
                      {trigger}
                    </div>
                  ))}
                </div>

                <div className="text-xs mb-3 p-2 rounded bg-blue-50 border border-blue-200">
                  <span className="text-blue-900">
                    <strong>Suggested:</strong> {risk.suggestedAction}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-red-600 text-white hover:bg-red-700 text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Hold
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs">
                    Release
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs">
                    <Phone className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="p-3 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white">
          <div className="text-sm font-semibold">Risk Trend</div>
          <div className="text-xs mt-1">â†‘ 23% increase in duplicate addresses today</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ==================== CUSTOMER INSIGHTS ==================== */

function CustomerInsights() {
  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-[#1E293B]">
          <Users className="h-4 w-4 inline mr-2 text-blue-600" />
          Customer Health Snapshot
        </CardTitle>
        <CardDescription>Revenue intelligence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="text-xs opacity-90">Repeat Rate</div>
            <div className="text-2xl font-bold mt-1">42%</div>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="text-xs opacity-90">Avg LTV</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(1240)}</div>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
            <div className="text-xs opacity-90">Churn Risk</div>
            <div className="text-2xl font-bold mt-1">18%</div>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="text-xs opacity-90">New vs Return</div>
            <div className="text-2xl font-bold mt-1">35/65</div>
          </div>
        </div>

        {/* Segments */}
        <div>
          <div className="text-xs font-semibold text-slate-600 uppercase mb-2">
            RFM Segments
          </div>
          <div className="space-y-2">
            {[
              { label: "Champions", count: 234, value: formatCurrency(45600), color: "green" },
              { label: "At Risk", count: 89, value: formatCurrency(12300), color: "yellow" },
              { label: "Discount Sensitive", count: 156, value: formatCurrency(8900), color: "orange" },
            ].map((seg, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200"
              >
                <div>
                  <div className="text-sm font-medium text-[#1E293B]">{seg.label}</div>
                  <div className="text-xs text-slate-500">{seg.count} customers</div>
                </div>
                <div className="text-sm font-bold text-[#1E293B]">{seg.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="text-sm font-semibold text-blue-900 flex items-center gap-2">
            <Target className="h-4 w-4" />
            Likely to Reorder Today
          </div>
          <div className="text-xs text-blue-800 mt-1">
            <strong>47 customers</strong> predicted to place orders in next 6 hours
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ==================== INCIDENT CENTER ==================== */

function IncidentCenter() {
  const incidents = useMemo(() => seedIncidents(), []);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-[#1E293B]">
              <AlertOctagon className="h-4 w-4 inline mr-2 text-red-600" />
              Incident Center
            </CardTitle>
            <CardDescription>System health & operational stability</CardDescription>
          </div>
          <Badge className="bg-green-500 text-white">All Systems OK</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Impacted Orders</TableHead>
              <TableHead>Detected</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.map((inc) => (
              <TableRow key={inc.id}>
                <TableCell className="font-medium text-[#1E293B]">{inc.service}</TableCell>
                <TableCell className="text-sm">{inc.description}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      inc.impactedOrders > 0
                        ? "bg-red-100 text-red-900"
                        : "bg-slate-100 text-slate-600"
                    }
                  >
                    {inc.impactedOrders}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{formatTime(inc.detectedAt)}</TableCell>
                <TableCell className="text-sm">{inc.owner}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      inc.status === "RESOLVED"
                        ? "bg-green-100 text-green-900"
                        : inc.status === "INVESTIGATING"
                        ? "bg-yellow-100 text-yellow-900"
                        : "bg-red-100 text-red-900"
                    }
                  >
                    {inc.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">
                    <Eye className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {incidents.length === 0 && (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <div className="text-sm text-slate-600">No active incidents</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ==================== EXECUTIVE SUMMARY FOOTER ==================== */

function ExecutiveSummaryFooter() {
  return (
    <div className="bg-slate-900 text-white border-t border-slate-700 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">Orders (15m)</div>
            <div className="text-lg font-bold">142</div>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">SLA Breach</div>
            <div className="text-lg font-bold text-red-400">7</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">Margin Risk</div>
            <div className="text-lg font-bold text-yellow-400">{formatCurrency(2690)}</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">Fraud Queue</div>
            <div className="text-lg font-bold text-orange-400">4</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">System Health</div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">OK</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="bg-slate-800 text-white border-slate-600">
            <Bell className="h-3 w-3 mr-1" />
            Configure Alerts
          </Button>
          <Button size="sm" className="bg-[#F5C742] text-[#1E293B] hover:opacity-90">
            <Download className="h-3 w-3 mr-1" />
            Export Report
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==================== ORDER DETAIL VIEW ==================== */

function OrderDetailView({ order }: { order: LiveOrder }) {
  return (
    <div className="space-y-6">
      {/* Order Header */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Order ID</Label>
          <div className="font-bold text-lg text-[#1E293B] mt-1">{order.id}</div>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Badge className="mt-1 bg-blue-100 text-blue-900">{order.status}</Badge>
        </div>
      </div>

      <Separator />

      {/* Timeline */}
      <div>
        <Label className="text-sm font-semibold text-[#1E293B]">Order Timeline</Label>
        <div className="mt-3 space-y-3">
          {[
            { event: "Order Placed", time: order.timePlaced, status: "complete" },
            { event: "Payment Confirmed", time: new Date(order.timePlaced.getTime() + 2 * 60000), status: "complete" },
            { event: "Assigned to Branch", time: new Date(order.timePlaced.getTime() + 5 * 60000), status: "complete" },
            { event: "Picking in Progress", time: new Date(), status: "active" },
            { event: "Packing", time: null, status: "pending" },
            { event: "Dispatch", time: null, status: "pending" },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  item.status === "complete"
                    ? "bg-green-500"
                    : item.status === "active"
                    ? "bg-blue-500 animate-pulse"
                    : "bg-slate-300"
                }`}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-[#1E293B]">{item.event}</div>
                {item.time && (
                  <div className="text-xs text-slate-500">{formatTime(item.time)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button className="bg-[#F5C742] text-[#1E293B]">
          <MapPin className="h-4 w-4 mr-2" />
          Reassign Branch
        </Button>
        <Button variant="outline">
          <Rocket className="h-4 w-4 mr-2" />
          Force Pack
        </Button>
        <Button variant="outline">
          <Phone className="h-4 w-4 mr-2" />
          Call Customer
        </Button>
        <Button variant="outline" className="border-red-300 text-red-600">
          <Ban className="h-4 w-4 mr-2" />
          Cancel Order
        </Button>
      </div>
    </div>
  );
}

/* ==================== SEED DATA ==================== */

function seedLiveOrders(): LiveOrder[] {
  const now = new Date();
  return [
    {
      id: "ORD-2451",
      timePlaced: new Date(now.getTime() - 3 * 60000),
      paymentType: "PAID",
      value: 450,
      branch: "Dubai",
      slaMinutes: 30,
      slaDeadline: new Date(now.getTime() + 27 * 60000),
      slaStatus: "ON_TRACK",
      riskFlags: [],
      status: "PROCESSING",
    },
    {
      id: "ORD-2452",
      timePlaced: new Date(now.getTime() - 18 * 60000),
      paymentType: "COD",
      value: 890,
      branch: "Fujairah",
      slaMinutes: 30,
      slaDeadline: new Date(now.getTime() + 12 * 60000),
      slaStatus: "AT_RISK",
      riskFlags: ["Duplicate Address"],
      status: "PICKING",
    },
    {
      id: "ORD-2453",
      timePlaced: new Date(now.getTime() - 35 * 60000),
      paymentType: "PAID",
      value: 1250,
      branch: "Dubai",
      slaMinutes: 30,
      slaDeadline: new Date(now.getTime() - 5 * 60000),
      slaStatus: "BREACHED",
      riskFlags: [],
      status: "PROCESSING",
    },
    {
      id: "ORD-2454",
      timePlaced: new Date(now.getTime() - 7 * 60000),
      paymentType: "PENDING",
      value: 340,
      branch: "Dubai",
      slaMinutes: 30,
      slaDeadline: new Date(now.getTime() + 23 * 60000),
      slaStatus: "ON_TRACK",
      riskFlags: ["High Velocity"],
      status: "PROCESSING",
    },
  ];
}

function seedBranchLoad(): BranchLoad[] {
  return [
    {
      id: "b1",
      name: "Dubai Main",
      activeOrders: 45,
      stockReserved: 67,
      pickPackBacklog: 12,
      slaHealth: 92,
      staffLoad: 78,
      capacity: 60,
    },
    {
      id: "b2",
      name: "Fujairah",
      activeOrders: 23,
      stockReserved: 45,
      pickPackBacklog: 5,
      slaHealth: 96,
      staffLoad: 55,
      capacity: 40,
    },
  ];
}

function seedMarginAlerts(): MarginAlert[] {
  return [
    {
      id: "m1",
      orderId: "ORD-2445",
      skus: ["SKU-1234", "SKU-5678"],
      expectedGM: 35,
      actualGM: 12,
      cause: "High discount coupon applied",
      impact: 450,
      timestamp: new Date(Date.now() - 5 * 60000),
    },
    {
      id: "m2",
      orderId: "ORD-2448",
      skus: ["SKU-9012"],
      expectedGM: 42,
      actualGM: -5,
      cause: "Price override below cost",
      impact: 890,
      timestamp: new Date(Date.now() - 12 * 60000),
    },
  ];
}

function seedRiskAlerts(): RiskAlert[] {
  return [
    {
      id: "r1",
      orderId: "ORD-2452",
      riskScore: 78,
      triggers: ["Duplicate Address", "3rd COD order today"],
      suggestedAction: "Call verification",
      timestamp: new Date(Date.now() - 8 * 60000),
    },
    {
      id: "r2",
      orderId: "ORD-2454",
      riskScore: 65,
      triggers: ["High velocity (5 orders in 10 min)", "New customer"],
      suggestedAction: "Hold for review",
      timestamp: new Date(Date.now() - 3 * 60000),
    },
  ];
}

function seedIncidents(): Incident[] {
  return [
    {
      id: "i1",
      service: "Payment Gateway A",
      impactedOrders: 0,
      status: "RESOLVED",
      detectedAt: new Date(Date.now() - 45 * 60000),
      owner: "Ops Team",
      description: "Timeout spike - resolved",
    },
  ];
}

