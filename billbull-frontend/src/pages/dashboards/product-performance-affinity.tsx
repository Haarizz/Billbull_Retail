import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { 
  Users, 
  ShoppingCart, 
  TrendingUp, 
  Target, 
  Sparkles, 
  Package, 
  Bell,
  Gift,
  Percent,
} from "lucide-react";

/** ----------------------------
 * Types
 * ---------------------------- */
type Channel = "web" | "pwa" | "app";
type CustomerType = "new" | "repeat" | "vip";
type Segment = "Champions" | "Loyal" | "Potential" | "At Risk" | "Hibernating";

type AffinityData = {
  sku: string;
  name: string;
  category: string;
  
  // Repeat metrics
  repeatRate: number;
  repeatInterval: number;
  repeatFreq: number;
  
  // Cross-sell metrics
  crossSellRate: number;
  attachRevenue: number;
  
  // Segment fit
  topSegment: Segment;
  affinityScore: number;
  
  // Cohorts
  repeat30d: number;
  repeat60d: number;
  repeat90d: number;
};

type CrossSellPair = {
  skuA: string;
  nameA: string;
  skuB: string;
  nameB: string;
  
  support: number;        // P(A âˆ© B)
  confidence: number;     // P(B | A)
  lift: number;           // Confidence / P(B)
  attachRate: number;     // Orders with both / Orders with A
  
  incrementalGP: number;
  incrementalUnits: number;
};

type SegmentPerformance = {
  segment: Segment;
  penetration: number;    // % of segment that bought SKU
  repeatRate: number;
  returnRate: number;
  aov: number;
  margin: number;
  discountDependency: number;
};

/** ----------------------------
 * Helpers
 * ---------------------------- */
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);

function fmtAED(n: number) {
  return `AED ${Math.round(n).toLocaleString()}`;
}

const segmentColors: Record<Segment, string> = {
  Champions: "#10b981",
  Loyal: "#3b82f6",
  Potential: "#f59e0b",
  "At Risk": "#ef4444",
  Hibernating: "#64748b",
};

/** ----------------------------
 * Mock data (replace with API)
 * ---------------------------- */
function mockAffinityData(): {
  skus: AffinityData[];
  crossSells: CrossSellPair[];
  segments: SegmentPerformance[];
} {
  const skus: AffinityData[] = [
    {
      sku: "BB-1001",
      name: "Premium Tee",
      category: "Apparel",
      repeatRate: 42,
      repeatInterval: 28,
      repeatFreq: 2.3,
      crossSellRate: 68,
      attachRevenue: 85,
      topSegment: "Loyal",
      affinityScore: 78,
      repeat30d: 35,
      repeat60d: 58,
      repeat90d: 72,
    },
    {
      sku: "BB-1002",
      name: "Running Shoes",
      category: "Apparel",
      repeatRate: 28,
      repeatInterval: 45,
      repeatFreq: 1.6,
      crossSellRate: 72,
      attachRevenue: 125,
      topSegment: "Champions",
      affinityScore: 85,
      repeat30d: 22,
      repeat60d: 42,
      repeat90d: 61,
    },
    {
      sku: "BB-2001",
      name: "Smart Scale",
      category: "Electronics",
      repeatRate: 15,
      repeatInterval: 180,
      repeatFreq: 1.2,
      crossSellRate: 58,
      attachRevenue: 95,
      topSegment: "Champions",
      affinityScore: 68,
      repeat30d: 8,
      repeat60d: 18,
      repeat90d: 28,
    },
  ];

  const crossSells: CrossSellPair[] = [
    {
      skuA: "BB-1001",
      nameA: "Premium Tee",
      skuB: "BB-1003",
      nameB: "Yoga Pants",
      support: 0.15,
      confidence: 0.58,
      lift: 2.8,
      attachRate: 58,
      incrementalGP: 42,
      incrementalUnits: 1.8,
    },
    {
      skuA: "BB-1001",
      nameA: "Premium Tee",
      skuB: "BB-1004",
      nameB: "Sports Cap",
      support: 0.12,
      confidence: 0.48,
      lift: 2.2,
      attachRate: 48,
      incrementalGP: 28,
      incrementalUnits: 1.2,
    },
    {
      skuA: "BB-1002",
      nameA: "Running Shoes",
      skuB: "BB-1005",
      nameB: "Running Socks",
      support: 0.22,
      confidence: 0.72,
      lift: 3.5,
      attachRate: 72,
      incrementalGP: 18,
      incrementalUnits: 2.4,
    },
    {
      skuA: "BB-1002",
      nameA: "Running Shoes",
      skuB: "BB-1006",
      nameB: "Shoe Care Kit",
      support: 0.18,
      confidence: 0.62,
      lift: 3.1,
      attachRate: 62,
      incrementalGP: 35,
      incrementalUnits: 1.8,
    },
    {
      skuA: "BB-2001",
      nameA: "Smart Scale",
      skuB: "BB-2002",
      nameB: "Fitness Tracker",
      support: 0.08,
      confidence: 0.38,
      lift: 1.9,
      attachRate: 38,
      incrementalGP: 85,
      incrementalUnits: 0.9,
    },
  ];

  const segments: SegmentPerformance[] = [
    {
      segment: "Champions",
      penetration: 45,
      repeatRate: 58,
      returnRate: 4,
      aov: 285,
      margin: 42,
      discountDependency: 18,
    },
    {
      segment: "Loyal",
      penetration: 38,
      repeatRate: 48,
      returnRate: 6,
      aov: 220,
      margin: 38,
      discountDependency: 25,
    },
    {
      segment: "Potential",
      penetration: 28,
      repeatRate: 22,
      returnRate: 12,
      aov: 165,
      margin: 32,
      discountDependency: 42,
    },
    {
      segment: "At Risk",
      penetration: 12,
      repeatRate: 8,
      returnRate: 18,
      aov: 125,
      margin: 25,
      discountDependency: 58,
    },
    {
      segment: "Hibernating",
      penetration: 6,
      repeatRate: 3,
      returnRate: 22,
      aov: 95,
      margin: 18,
      discountDependency: 72,
    },
  ];

  return { skus, crossSells, segments };
}

/** ----------------------------
 * Component
 * ---------------------------- */
export function ProductPerformanceAffinity() {
  const data = React.useMemo(() => mockAffinityData(), []);
  const [skus] = React.useState(data.skus);
  const [crossSells] = React.useState(data.crossSells);
  const [segments] = React.useState(data.segments);

  const [selectedSku, setSelectedSku] = React.useState<string>(skus[0]?.sku ?? "");
  const [branch, setBranch] = React.useState<"ALL" | "BR-DXB" | "BR-AUH">("ALL");
  const [channel, setChannel] = React.useState<"ALL" | Channel>("ALL");
  const [customerType, setCustomerType] = React.useState<"ALL" | CustomerType>("ALL");

  const selected = React.useMemo(() => skus.find((s) => s.sku === selectedSku) || skus[0], [skus, selectedSku]);
  const skuCrossSells = React.useMemo(() => crossSells.filter((c) => c.skuA === selectedSku), [crossSells, selectedSku]);

  const repeatCurve = React.useMemo(() => {
    if (!selected) return [];
    return [
      { days: 30, pct: selected.repeat30d, label: "30d" },
      { days: 60, pct: selected.repeat60d, label: "60d" },
      { days: 90, pct: selected.repeat90d, label: "90d" },
    ];
  }, [selected]);

  const segmentDistribution = React.useMemo(() => {
    return segments.map((s) => ({
      segment: s.segment,
      value: s.penetration,
      color: segmentColors[s.segment],
    }));
  }, [segments]);

  return (
    <div className="space-y-4">
      {/* Header / Controls */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1E293B]">Customerâ€“Product Affinity</CardTitle>
          <CardDescription>
            Repeat purchase + cross-sell + segment fit analysis for actionable merchandising & personalization
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5">
              <div className="text-xs text-slate-500 mb-1">SKU</div>
              <div className="flex gap-2 flex-wrap">
                {skus.map((s) => (
                  <Button
                    key={s.sku}
                    variant={s.sku === selectedSku ? "default" : "outline"}
                    className={s.sku === selectedSku ? "bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90" : "bg-white"}
                    onClick={() => setSelectedSku(s.sku)}
                  >
                    {s.sku} â€¢ {s.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="flex items-end justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    className={`bg-white ${branch !== "ALL" ? "ring-1 ring-[#F5C742]" : ""}`}
                    onClick={() => setBranch((b) => (b === "ALL" ? "BR-DXB" : b === "BR-DXB" ? "BR-AUH" : "ALL"))}
                  >
                    Branch: {branch}
                  </Button>

                  <Button
                    variant="outline"
                    className={`bg-white ${channel !== "ALL" ? "ring-1 ring-[#F5C742]" : ""}`}
                    onClick={() => setChannel((c) => (c === "ALL" ? "web" : c === "web" ? "pwa" : c === "pwa" ? "app" : "ALL"))}
                  >
                    Channel: {channel}
                  </Button>

                  <Button
                    variant="outline"
                    className={`bg-white ${customerType !== "ALL" ? "ring-1 ring-[#F5C742]" : ""}`}
                    onClick={() => setCustomerType((t) => (t === "ALL" ? "new" : t === "new" ? "repeat" : t === "repeat" ? "vip" : "ALL"))}
                  >
                    Type: {customerType}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-800">{selected.category}</Badge>
                  <Badge style={{ backgroundColor: segmentColors[selected.topSegment], color: "#FFF" }}>
                    {selected.topSegment}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="repeat">Repeat Purchase</TabsTrigger>
          <TabsTrigger value="crosssell">Cross-sell</TabsTrigger>
          <TabsTrigger value="segments">Segment Fit</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Repeat Rate</div>
                    <div className="text-2xl text-slate-900 mt-1">{selected.repeatRate}%</div>
                  </div>
                  <Users className="h-6 w-6 text-[#F5C742]" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Repeat Interval</div>
                    <div className="text-2xl text-slate-900 mt-1">{selected.repeatInterval}d</div>
                  </div>
                  <TrendingUp className="h-6 w-6 text-[#F5C742]" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Cross-sell Rate</div>
                    <div className="text-2xl text-slate-900 mt-1">{selected.crossSellRate}%</div>
                  </div>
                  <ShoppingCart className="h-6 w-6 text-[#F5C742]" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Affinity Score</div>
                    <div className="text-2xl text-slate-900 mt-1">{selected.affinityScore}</div>
                  </div>
                  <Target className="h-6 w-6 text-[#F5C742]" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Top Segment</div>
                    <div className="text-lg text-slate-900 mt-1">{selected.topSegment}</div>
                  </div>
                  <Package className="h-6 w-6 text-[#F5C742]" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Attach Revenue</div>
                    <div className="text-xl text-slate-900 mt-1">{fmtAED(selected.attachRevenue)}</div>
                  </div>
                  <Percent className="h-6 w-6 text-[#F5C742]" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {/* Repeat Curve */}
            <Card className="bg-white border-0 shadow-sm xl:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-[#1E293B]">Repeat Purchase Curve</CardTitle>
                <CardDescription>% customers who repurchase within X days</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[240px] w-full min-h-[240px]">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={repeatCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" stroke="#64748B" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                        }}
                      />
                      <Line type="monotone" dataKey="pct" stroke="#F5C742" strokeWidth={3} dot={{ fill: "#F5C742", r: 5 }} name="Repeat %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Segment Distribution */}
            <Card className="bg-white border-0 shadow-sm xl:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-[#1E293B]">Segment Distribution</CardTitle>
                <CardDescription>Which customer segments buy this product</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-[240px] w-full min-h-[240px]">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={segmentDistribution}
                          dataKey="value"
                          nameKey="segment"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {segmentDistribution.map((s) => (
                            <Cell key={s.segment} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2">
                    {segments.map((s) => (
                      <div key={s.segment} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: segmentColors[s.segment] }}
                          />
                          <span className="text-slate-700">{s.segment}</span>
                        </div>
                        <div className="text-slate-900">
                          <b>{s.penetration}%</b> penetration
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Cross-sell Bundles */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#1E293B]">Frequently Bought Together</CardTitle>
              <CardDescription>Top cross-sell opportunities with lift and incremental GP</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {skuCrossSells.slice(0, 3).map((cs) => (
                  <div key={cs.skuB} className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm text-slate-900">{cs.nameB}</div>
                        <div className="text-xs text-slate-500">{cs.skuB}</div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-900">Lift {round2(cs.lift)}Ã—</Badge>
                    </div>
                    <Separator className="my-2" />
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Attach Rate</span>
                        <span className="text-slate-900">{cs.attachRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Incremental GP</span>
                        <span className="text-slate-900">{fmtAED(cs.incrementalGP)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Avg Units</span>
                        <span className="text-slate-900">{round2(cs.incrementalUnits)}</span>
                      </div>
                    </div>
                    <Button size="sm" className="w-full mt-3 bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                      <Gift className="h-3 w-3 mr-2" />
                      Create Bundle
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
              <Sparkles className="h-4 w-4 mr-2" />
              Launch Segment Promo
            </Button>
            <Button variant="outline" className="bg-white">
              <Package className="h-4 w-4 mr-2" />
              Add to Recommendation Rules
            </Button>
            <Button variant="outline" className="bg-white">
              Export Affinity Report
            </Button>
          </div>
        </TabsContent>

        {/* Repeat Purchase Tab */}
        <TabsContent value="repeat" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#1E293B]">Repeat Purchase Deep Dive</CardTitle>
              <CardDescription>Retention cohorts, time-to-repeat, and reorder automation opportunities</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                  <div className="text-xs text-slate-500">Repeat Customers</div>
                  <div className="text-2xl text-slate-900 mt-1">2,458</div>
                  <div className="text-xs text-slate-500 mt-1">out of 5,852 buyers</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                  <div className="text-xs text-slate-500">Avg Frequency</div>
                  <div className="text-2xl text-slate-900 mt-1">{selected.repeatFreq}Ã—</div>
                  <div className="text-xs text-slate-500 mt-1">purchases per buyer</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                  <div className="text-xs text-slate-500">Median Interval</div>
                  <div className="text-2xl text-slate-900 mt-1">{selected.repeatInterval}d</div>
                  <div className="text-xs text-slate-500 mt-1">days between purchases</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                  <div className="text-xs text-slate-500">Churn Risk</div>
                  <div className="text-2xl text-slate-900 mt-1">18%</div>
                  <div className="text-xs text-slate-500 mt-1">high-intent stopped buying</div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm text-slate-900 mb-3">Subscription / Auto-reorder Candidates</h4>
                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <Bell className="h-5 w-5 text-[#F5C742] mt-0.5" />
                    <div>
                      <b>458 customers</b> have purchased this SKU 3+ times with consistent ~{selected.repeatInterval}d intervals.
                      <div className="mt-2 text-xs">
                        Recommended action: Launch "Reorder Reminder" campaign via WhatsApp/email {selected.repeatInterval - 5} days after last purchase.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                  <Bell className="h-4 w-4 mr-2" />
                  Create Reorder Campaign
                </Button>
                <Button variant="outline" className="bg-white">
                  Back-in-stock Alert Automation
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cross-sell Tab */}
        <TabsContent value="crosssell" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#1E293B]">Cross-sell Affinity Analysis</CardTitle>
              <CardDescription>Products that pair strongly with {selected.name} (Support â€¢ Confidence â€¢ Lift)</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-[#F7F7FA]">
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Support</TableHead>
                      <TableHead className="text-right">Confidence</TableHead>
                      <TableHead className="text-right">Lift</TableHead>
                      <TableHead className="text-right">Attach Rate</TableHead>
                      <TableHead className="text-right">Incr. GP</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skuCrossSells.map((cs) => (
                      <TableRow key={cs.skuB}>
                        <TableCell className="font-medium text-[#1E293B]">{cs.skuB}</TableCell>
                        <TableCell>{cs.nameB}</TableCell>
                        <TableCell className="text-right text-xs">{round2(cs.support)}</TableCell>
                        <TableCell className="text-right text-xs">{round2(cs.confidence)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={cs.lift >= 2.5 ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-800"}>
                            {round2(cs.lift)}Ã—
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{cs.attachRate}%</TableCell>
                        <TableCell className="text-right">{fmtAED(cs.incrementalGP)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="bg-white">
                            Create Bundle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 text-xs text-slate-600">
                <b>Metrics explained:</b> Support = P(A âˆ© B), Confidence = P(B | A), Lift = Confidence / P(B). Lift &gt; 1 means B is more likely when A is present.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Segment Fit Tab */}
        <TabsContent value="segments" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#1E293B]">Segment Performance Leaderboard</CardTitle>
              <CardDescription>Which customer segments buy this product and how it performs per segment</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-[#F7F7FA]">
                    <TableRow>
                      <TableHead>Segment</TableHead>
                      <TableHead className="text-right">Penetration</TableHead>
                      <TableHead className="text-right">Repeat Rate</TableHead>
                      <TableHead className="text-right">Return Rate</TableHead>
                      <TableHead className="text-right">AOV</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Discount Depend.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {segments.map((s) => (
                      <TableRow key={s.segment}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: segmentColors[s.segment] }}
                            />
                            <span className="font-medium text-[#1E293B]">{s.segment}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{s.penetration}%</TableCell>
                        <TableCell className="text-right">
                          <Badge className={s.repeatRate >= 40 ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-800"}>
                            {s.repeatRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className={s.returnRate <= 8 ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}>
                            {s.returnRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtAED(s.aov)}</TableCell>
                        <TableCell className="text-right">{s.margin}%</TableCell>
                        <TableCell className="text-right">
                          <Badge className={s.discountDependency <= 30 ? "bg-emerald-100 text-emerald-900" : "bg-orange-100 text-orange-900"}>
                            {s.discountDependency}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                  <Target className="h-4 w-4 mr-2" />
                  Target Champions Segment
                </Button>
                <Button variant="outline" className="bg-white">
                  Personalize Recommendations
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#1E293B]">Recommendation Rules</CardTitle>
              <CardDescription>Turn affinity insights into storefront personalization rules</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                  <h4 className="text-sm text-slate-900 mb-2">Product Detail Page (PDP)</h4>
                  <div className="text-xs text-slate-600 mb-3">
                    When viewing <b>{selected.name}</b> â†’ recommend:
                  </div>
                  <div className="space-y-2">
                    {skuCrossSells.slice(0, 2).map((cs) => (
                      <div key={cs.skuB} className="flex items-center justify-between text-xs bg-white rounded p-2">
                        <span className="text-slate-700">{cs.nameB}</span>
                        <Badge className="bg-emerald-100 text-emerald-900">{cs.attachRate}%</Badge>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full mt-3 bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                    Activate Rule
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                  <h4 className="text-sm text-slate-900 mb-2">Cart / Checkout Upsell</h4>
                  <div className="text-xs text-slate-600 mb-3">
                    When cart contains <b>{selected.name}</b> â†’ upsell:
                  </div>
                  <div className="space-y-2">
                    {skuCrossSells.slice(0, 2).map((cs) => (
                      <div key={cs.skuB} className="flex items-center justify-between text-xs bg-white rounded p-2">
                        <span className="text-slate-700">{cs.nameB}</span>
                        <span className="text-slate-500">+{fmtAED(cs.incrementalGP)} GP</span>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full mt-3 bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                    Activate Rule
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                <h4 className="text-sm text-slate-900 mb-2">Segment Personalization</h4>
                <div className="text-xs text-slate-600 mb-3">
                  For <b>{selected.topSegment}</b> customers â†’ prioritize <b>{selected.name}</b> in homepage / discovery feeds
                </div>
                <Button size="sm" className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                  Configure Segment Rule
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

