import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";
import { ArrowUpDown, TrendingDown, TrendingUp, BadgePercent, Sparkles, AlertTriangle } from "lucide-react";

/** ----------------------------
 * Types
 * ---------------------------- */
type Channel = "web" | "pwa" | "app";
type PriceSensePoint = {
  date: string;
  sku: string;
  name: string;
  category: string;
  branchId?: string;
  channel?: Channel;

  price: number;
  units: number;
  revenue: number;
  discountPct?: number;

  stockoutPct?: number; // 0-100
  promoFlag?: boolean;

  impressions?: number;
  competitorPrice?: number;
};

type PriceChange = {
  ts: string;
  sku: string;
  oldPrice: number;
  newPrice: number;
  reason?: "manual" | "campaign" | "scheduled" | "happy_hour";
  approvedBy?: string;
};

/** ----------------------------
 * Helpers
 * ---------------------------- */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);

function fmtAED(n: number) {
  return `AED ${Math.round(n).toLocaleString()}`;
}

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Simple log regression:
 * ln(Q) = a + b*ln(P)
 * b = elasticity estimate
 * We also compute R^2 as a proxy confidence.
 */
function logRegressionElasticity(points: PriceSensePoint[]) {
  // Filter valid points (no zeros, no heavy stockout days)
  const clean = points
    .filter((p) => p.price > 0 && p.units > 0)
    .map((p) => ({
      x: Math.log(p.price),
      y: Math.log(p.units),
      raw: p,
    }));

  if (clean.length < 8) {
    return { b: 0, a: 0, r2: 0, n: clean.length };
  }

  const xs = clean.map((d) => d.x);
  const ys = clean.map((d) => d.y);

  const xBar = avg(xs);
  const yBar = avg(ys);

  let num = 0;
  let den = 0;
  for (let i = 0; i < clean.length; i++) {
    num += (xs[i] - xBar) * (ys[i] - yBar);
    den += (xs[i] - xBar) * (xs[i] - xBar);
  }
  const b = den === 0 ? 0 : num / den;
  const a = yBar - b * xBar;

  // R^2
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < clean.length; i++) {
    const yHat = a + b * xs[i];
    ssTot += (ys[i] - yBar) * (ys[i] - yBar);
    ssRes += (ys[i] - yHat) * (ys[i] - yHat);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { b, a, r2: clamp(r2, 0, 1), n: clean.length };
}

/**
 * Convert elasticity into a simple recommendation bucket.
 */
function elasticityLabel(b: number) {
  // b is negative typically
  if (b <= -2) return { label: "Very Elastic", badge: "bg-red-100 text-red-900" };
  if (b <= -1) return { label: "Elastic", badge: "bg-orange-100 text-orange-900" };
  if (b <= -0.4) return { label: "Moderately Sensitive", badge: "bg-yellow-100 text-yellow-900" };
  return { label: "Low Sensitivity", badge: "bg-emerald-100 text-emerald-900" };
}

/** ----------------------------
 * Mock data (replace with API)
 * ---------------------------- */
function mockPriceSense(): { points: PriceSensePoint[]; changes: PriceChange[] } {
  // 45 days sample for 3 SKUs
  const skus = [
    { sku: "BB-1001", name: "Premium Tee", category: "Apparel", base: 110 },
    { sku: "BB-1002", name: "Running Shoes", category: "Apparel", base: 260 },
    { sku: "BB-2001", name: "Smart Scale", category: "Electronics", base: 340 },
  ];

  const points: PriceSensePoint[] = [];
  const changes: PriceChange[] = [];

  const start = new Date();
  start.setDate(start.getDate() - 44);

  for (const s of skus) {
    let price = s.base;
    for (let d = 0; d < 45; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + d);
      const date = dt.toISOString().slice(0, 10);

      // Inject price changes
      if (d === 10) {
        const newPrice = s.base * (s.sku === "BB-1002" ? 1.08 : 0.95);
        changes.push({ ts: `${date}T10:00:00Z`, sku: s.sku, oldPrice: price, newPrice, reason: "manual", approvedBy: "Admin" });
        price = newPrice;
      }
      if (d === 28) {
        const newPrice = s.base * (s.sku === "BB-2001" ? 0.9 : 1.05);
        changes.push({ ts: `${date}T10:00:00Z`, sku: s.sku, oldPrice: price, newPrice, reason: "campaign", approvedBy: "Merch Lead" });
        price = newPrice;
      }

      // Demand model (different elasticity per sku)
      const e = s.sku === "BB-1002" ? -1.6 : s.sku === "BB-2001" ? -0.7 : -1.1;
      const noise = 0.85 + Math.random() * 0.35;

      // Units approx: k * (price/base)^e
      const k = s.sku === "BB-2001" ? 9 : s.sku === "BB-1002" ? 18 : 26;
      const units = Math.max(1, Math.round(k * Math.pow(price / s.base, e) * noise));

      const discountPct = s.sku === "BB-1001" ? Math.round(Math.random() * 12) : Math.round(Math.random() * 8);
      const promoFlag = d === 28 || (d > 28 && d < 33 && s.sku === "BB-2001");

      const stockoutPct = Math.random() < 0.06 ? Math.round(40 + Math.random() * 50) : Math.round(Math.random() * 8);

      const revenue = price * units * (1 - discountPct / 100);

      points.push({
        date,
        sku: s.sku,
        name: s.name,
        category: s.category,
        branchId: d % 2 === 0 ? "BR-DXB" : "BR-AUH",
        channel: d % 3 === 0 ? "web" : d % 3 === 1 ? "pwa" : "app",
        price: round2(price),
        units,
        revenue: round2(revenue),
        discountPct,
        stockoutPct,
        promoFlag,
        impressions: Math.round(units * (12 + Math.random() * 8)),
        competitorPrice: round2(price * (0.95 + Math.random() * 0.12)),
      });
    }
  }

  return { points, changes };
}

/** ----------------------------
 * Component
 * ---------------------------- */
export function ProductPerformancePriceSense() {
  const data = React.useMemo(() => mockPriceSense(), []);
  const [points] = React.useState<PriceSensePoint[]>(data.points);
  const [changes] = React.useState<PriceChange[]>(data.changes);

  const skuOptions = React.useMemo(() => {
    const map = new Map<string, { sku: string; name: string; category: string }>();
    for (const p of points) map.set(p.sku, { sku: p.sku, name: p.name, category: p.category });
    return Array.from(map.values());
  }, [points]);

  const [sku, setSku] = React.useState<string>(skuOptions[0]?.sku ?? "");
  const [branch, setBranch] = React.useState<"ALL" | "BR-DXB" | "BR-AUH">("ALL");
  const [channel, setChannel] = React.useState<"ALL" | Channel>("ALL");
  const [excludeStockout, setExcludeStockout] = React.useState(true);

  const skuPoints = React.useMemo(() => {
    return points
      .filter((p) => p.sku === sku)
      .filter((p) => (branch === "ALL" ? true : p.branchId === branch))
      .filter((p) => (channel === "ALL" ? true : p.channel === channel))
      .filter((p) => (excludeStockout ? (p.stockoutPct ?? 0) < 15 : true))
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [points, sku, branch, channel, excludeStockout]);

  const skuChanges = React.useMemo(() => changes.filter((c) => c.sku === sku).sort((a, b) => (a.ts > b.ts ? -1 : 1)), [changes, sku]);

  const reg = React.useMemo(() => logRegressionElasticity(skuPoints), [skuPoints]);
  const label = elasticityLabel(reg.b);

  const avgPrice = React.useMemo(() => avg(skuPoints.map((p) => p.price)), [skuPoints]);
  const avgUnits = React.useMemo(() => avg(skuPoints.map((p) => p.units)), [skuPoints]);
  const avgRevenue = React.useMemo(() => avg(skuPoints.map((p) => p.revenue)), [skuPoints]);

  // What-if simulator
  const [whatIfPrice, setWhatIfPrice] = React.useState<number>(avgPrice || 100);
  React.useEffect(() => {
    if (avgPrice) setWhatIfPrice(avgPrice);
  }, [avgPrice]);

  const predictedUnits = React.useMemo(() => {
    // Using lnQ = a + b lnP -> Q = exp(a)*P^b
    if (reg.n < 8) return avgUnits || 0;
    const q = Math.exp(reg.a) * Math.pow(whatIfPrice, reg.b);
    return Math.max(0, q);
  }, [reg, whatIfPrice, avgUnits]);

  const predictedRevenue = React.useMemo(() => predictedUnits * whatIfPrice, [predictedUnits, whatIfPrice]);

  const scatter = React.useMemo(() => {
    // price vs units scatter
    return skuPoints.map((p) => ({
      price: p.price,
      units: p.units,
      promo: p.promoFlag ? "Promo" : "Normal",
      stockoutPct: p.stockoutPct ?? 0,
      date: p.date,
    }));
  }, [skuPoints]);

  const line = React.useMemo(() => {
    return skuPoints.map((p) => ({
      date: p.date.slice(5),
      price: p.price,
      units: p.units,
      revenue: p.revenue,
      discountPct: p.discountPct ?? 0,
      stockoutPct: p.stockoutPct ?? 0,
    }));
  }, [skuPoints]);

  const priceMin = React.useMemo(() => Math.min(...skuPoints.map((p) => p.price), avgPrice || 0), [skuPoints, avgPrice]);
  const priceMax = React.useMemo(() => Math.max(...skuPoints.map((p) => p.price), avgPrice || 0), [skuPoints, avgPrice]);

  const confidencePct = Math.round(reg.r2 * 100);
  const confidenceBadge =
    confidencePct >= 70 ? "bg-emerald-100 text-emerald-900" : confidencePct >= 45 ? "bg-yellow-100 text-yellow-900" : "bg-red-100 text-red-900";

  // Guidance (merchant friendly)
  const guidance = React.useMemo(() => {
    if (reg.n < 8) return { headline: "Not enough signal", note: "Need at least ~8â€“12 valid observations with price variance." };
    if (reg.b <= -1.2) return { headline: "Discounts drive volume", note: "Raising price may drop units quickly. Optimize margin via bundles/upsells." };
    if (reg.b <= -0.6) return { headline: "Moderate sensitivity", note: "Small increases might hold volume if stock availability stays high." };
    return { headline: "Low sensitivity", note: "You can test higher price bandsâ€”watch competitors and conversion." };
  }, [reg]);

  const riskFlags = React.useMemo(() => {
    const flags: Array<{ label: string; desc: string; badge: string }> = [];
    const stockoutDays = skuPoints.filter((p) => (p.stockoutPct ?? 0) >= 15).length;
    const promoDays = skuPoints.filter((p) => p.promoFlag).length;

    if (stockoutDays > 3) flags.push({ label: "Stockout noise", desc: "Demand may be undercounted due to OOS.", badge: "bg-orange-100 text-orange-900" });
    if (promoDays > 5) flags.push({ label: "Promo heavy", desc: "Promotions can distort elasticity.", badge: "bg-yellow-100 text-yellow-900" });
    if (priceMax - priceMin < (avgPrice || 1) * 0.06) flags.push({ label: "Low price variation", desc: "Need wider price tests to learn.", badge: "bg-slate-100 text-slate-800" });

    return flags;
  }, [skuPoints, priceMin, priceMax, avgPrice]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1E293B]">Price Sense â€” Price Elasticity Analysis</CardTitle>
          <CardDescription>
            Measure how price changes affect demand per SKU. Use this to set the best price band with confidence + guardrails.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5">
              <div className="text-xs text-slate-500 mb-1">SKU</div>
              <div className="flex gap-2 flex-wrap">
                {skuOptions.map((s) => (
                  <Button
                    key={s.sku}
                    variant={s.sku === sku ? "default" : "outline"}
                    className={s.sku === sku ? "bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90" : "bg-white"}
                    onClick={() => setSku(s.sku)}
                  >
                    {s.sku} â€¢ {s.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 flex items-end justify-between gap-2 flex-wrap">
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
                  className={`bg-white ${excludeStockout ? "ring-1 ring-[#F5C742]" : ""}`}
                  onClick={() => setExcludeStockout((v) => !v)}
                  title="Exclude days where stockoutPct >= 15%"
                >
                  Exclude stockout days: {excludeStockout ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={label.badge}>{label.label}</Badge>
                <Badge className={confidenceBadge}>Signal {confidencePct}%</Badge>
                <Badge className="bg-slate-100 text-slate-800">n={reg.n}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Elasticity (b)</div>
            <div className="text-2xl text-slate-900 mt-1">{round2(reg.b)}</div>
            <div className="text-xs text-slate-500 mt-1">log(Q) vs log(P)</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Avg Price</div>
            <div className="text-2xl text-slate-900 mt-1">{fmtAED(avgPrice)}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Avg Units / Day</div>
            <div className="text-2xl text-slate-900 mt-1">{round2(avgUnits)}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Avg Revenue / Day</div>
            <div className="text-2xl text-slate-900 mt-1">{fmtAED(avgRevenue)}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Guidance</div>
            <div className="text-sm text-slate-900 mt-1">{guidance.headline}</div>
            <div className="text-xs text-slate-500 mt-1">{guidance.note}</div>
          </CardContent>
        </Card>
      </div>

      {/* Risks */}
      {riskFlags.length > 0 && (
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-[#1E293B]">Guardrails / Data Quality</CardTitle>
            <CardDescription>These factors can distort elasticity learning</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {riskFlags.map((f) => (
                <div key={f.label} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-[#F7F7FA] p-3">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
                  <div>
                    <Badge className={f.badge}>{f.label}</Badge>
                    <div className="text-xs text-slate-600 mt-1">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts + What-if */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Price vs Units scatter */}
        <Card className="bg-white border-0 shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">Price vs Units (Scatter)</CardTitle>
            <CardDescription>Visual check: does demand drop as price increases?</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" dataKey="price" name="Price" stroke="#64748B" style={{ fontSize: '12px' }} />
                  <YAxis type="number" dataKey="units" name="Units" stroke="#64748B" style={{ fontSize: '12px' }} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Scatter name="Observations" data={scatter} fill="#1E293B" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Trend lines */}
        <Card className="bg-white border-0 shadow-sm xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">Daily Trend</CardTitle>
            <CardDescription>Price + units + revenue (watch promo + stockout effects)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={line}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" stroke="#64748B" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="price" stroke="#F5C742" dot={false} name="Price" strokeWidth={2} />
                  <Line type="monotone" dataKey="units" stroke="#1E293B" dot={false} name="Units" strokeWidth={2} />
                  <Line type="monotone" dataKey="revenue" stroke="#64748b" dot={false} name="Revenue" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* What-if simulator + Price changes */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="bg-white border-0 shadow-sm xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">What-If Simulator</CardTitle>
            <CardDescription>Predict demand change at a new price (uses learned elasticity)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <div className="text-xs text-slate-500 mb-1">Test Price (AED)</div>
                <Input
                  type="number"
                  value={whatIfPrice}
                  onChange={(e) => setWhatIfPrice(Number(e.target.value))}
                  className="bg-[#F7F7FA]"
                />
                <div className="text-xs text-slate-500 mt-1">
                  Suggested band: {fmtAED(priceMin)} â†’ {fmtAED(priceMax)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-slate-500 mb-1">Quick slider</div>
                <input
                  type="range"
                  min={Math.max(1, Math.floor(priceMin * 0.9))}
                  max={Math.ceil(priceMax * 1.1)}
                  value={whatIfPrice}
                  onChange={(e) => setWhatIfPrice(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{fmtAED(Math.floor(priceMin * 0.9))}</span>
                  <span>{fmtAED(Math.ceil(priceMax * 1.1))}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg bg-[#F7F7FA] border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Predicted Units</div>
                <div className="text-2xl text-slate-900 mt-1">{round2(predictedUnits)}</div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  {predictedUnits >= avgUnits ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <span className="text-emerald-700">+{pct(predictedUnits - avgUnits, avgUnits)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-red-700">-{pct(avgUnits - predictedUnits, avgUnits)}%</span>
                    </>
                  )}
                  <span className="text-slate-500">vs avg</span>
                </div>
              </div>

              <div className="rounded-lg bg-[#F7F7FA] border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Predicted Revenue</div>
                <div className="text-2xl text-slate-900 mt-1">{fmtAED(predictedRevenue)}</div>
                <div className="text-xs text-slate-500 mt-1">excludes discounts</div>
              </div>

              <div className="rounded-lg bg-[#F7F7FA] border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Recommendation</div>
                <div className="text-sm text-slate-900 mt-1">
                  {reg.b <= -1 ? "Test small price steps" : "You can test higher band"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Apply guardrails: keep OOS & promo constant during tests.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                <Sparkles className="h-4 w-4 mr-2" />
                Create Price Test Plan
              </Button>
              <Button variant="outline" className="bg-white">
                <BadgePercent className="h-4 w-4 mr-2" />
                Schedule Price Change
              </Button>
              <Button variant="outline" className="bg-white">
                Export Model
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">Price Change History</CardTitle>
            <CardDescription>Audit trail + reason (manual/campaign/scheduled)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-[#F7F7FA]">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Old</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">
                      Î”
                      <ArrowUpDown className="inline h-3 w-3 ml-1 text-slate-400" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuChanges.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        No price changes recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    skuChanges.slice(0, 8).map((c) => {
                      const delta = pct(c.newPrice - c.oldPrice, c.oldPrice);
                      return (
                        <TableRow key={c.ts}>
                          <TableCell className="text-xs">{c.ts.slice(0, 10)}</TableCell>
                          <TableCell className="text-xs">{fmtAED(c.oldPrice)}</TableCell>
                          <TableCell className="text-xs text-slate-900">{fmtAED(c.newPrice)}</TableCell>
                          <TableCell className="text-xs">
                            <Badge className="bg-slate-100 text-slate-800">{c.reason ?? "manual"}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge className={delta >= 0 ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"}>
                              {delta >= 0 ? "+" : ""}
                              {delta}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 text-xs text-slate-600">
              <b>Best practice:</b> keep tests clean (stable promos + availability), and change price in small steps (e.g., 3â€“5%).
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

