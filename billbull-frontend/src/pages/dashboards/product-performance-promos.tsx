import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
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
  AreaChart,
  Area,
} from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, BadgePercent, Sparkles } from "lucide-react";

/** ----------------------------
 * Types
 * ---------------------------- */
type Channel = "web" | "pwa" | "app";
type Promo = {
  id: string;
  name: string;
  type: "percent_off" | "fixed_off" | "bundle" | "coupon" | "happy_hour";
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  funding: "merchant" | "supplier" | "shared";
  budget?: number;
};

type PromoPoint = {
  date: string;
  sku: string;
  name: string;

  price: number;
  units: number;
  revenue: number;
  costPerUnit: number;

  discountPct?: number;
  promoId?: string | null;
  promoFlag?: boolean;

  stockoutPct?: number; // 0-100
  channel?: Channel;
  branchId?: string;
};

/** ----------------------------
 * Helpers
 * ---------------------------- */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const avg = (arr: number[]) => (arr.length ? sum(arr) / arr.length : 0);

function fmtAED(n: number) {
  return `AED ${Math.round(n).toLocaleString()}`;
}

function daysBetween(a: string, b: string) {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function dateAdd(d: string, days: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function inRange(d: string, start: string, end: string) {
  return d >= start && d <= end;
}

/**
 * Half-life style estimate:
 * how many days after promo end until units return to baseline band (Â±10%)
 */
function estimateDecayHalfLife(postDailyUnits: Array<{ date: string; units: number }>, baselineAvg: number) {
  if (!postDailyUnits.length || baselineAvg <= 0) return null;
  const bandLow = baselineAvg * 0.9;
  const bandHigh = baselineAvg * 1.1;

  // Find first day where units is back within the band (stable-ish signal proxy)
  for (let i = 0; i < postDailyUnits.length; i++) {
    const u = postDailyUnits[i].units;
    if (u >= bandLow && u <= bandHigh) {
      return { days: i + 1, label: `${i + 1}d to normalize` };
    }
  }
  return { days: postDailyUnits.length, label: `> ${postDailyUnits.length}d` };
}

/** ----------------------------
 * Mock data (replace with API)
 * ---------------------------- */
function mockPromoImpact(): { promos: Promo[]; points: PromoPoint[] } {
  const promos: Promo[] = [
    { id: "P-NEWYEAR10", name: "New Year 10% OFF", type: "percent_off", start: "2025-12-05", end: "2025-12-12", funding: "merchant" },
    { id: "P-HH-TEES", name: "Happy Hour Tees", type: "happy_hour", start: "2025-12-18", end: "2025-12-22", funding: "shared" },
    { id: "P-BUNDLE-SHOE", name: "Shoes + Socks Bundle", type: "bundle", start: "2025-12-10", end: "2025-12-20", funding: "supplier" },
  ];

  const skus = [
    { sku: "BB-1001", name: "Premium Tee", basePrice: 110, cost: 48 },
    { sku: "BB-1002", name: "Running Shoes", basePrice: 260, cost: 158 },
    { sku: "BB-2001", name: "Smart Scale", basePrice: 340, cost: 240 },
  ];

  const points: PromoPoint[] = [];
  const start = "2025-11-20";
  const days = 45;

  for (const s of skus) {
    for (let i = 0; i < days; i++) {
      const date = dateAdd(start, i);

      // Promo assignment logic
      let promoId: string | null = null;
      let discountPct = Math.round(Math.random() * 4);

      if (s.sku === "BB-1001" && inRange(date, "2025-12-18", "2025-12-22")) {
        promoId = "P-HH-TEES";
        discountPct = 12 + Math.round(Math.random() * 6);
      } else if (inRange(date, "2025-12-05", "2025-12-12")) {
        promoId = "P-NEWYEAR10";
        discountPct = 8 + Math.round(Math.random() * 5);
      } else if (s.sku === "BB-1002" && inRange(date, "2025-12-10", "2025-12-20")) {
        promoId = "P-BUNDLE-SHOE";
        discountPct = 6 + Math.round(Math.random() * 6);
      }

      // Baseline demand + uplift
      const baseUnits =
        s.sku === "BB-1001" ? 22 :
        s.sku === "BB-1002" ? 14 :
        7;

      const promoBoost =
        promoId === "P-NEWYEAR10" ? 1.18 :
        promoId === "P-HH-TEES" ? 1.35 :
        promoId === "P-BUNDLE-SHOE" ? 1.22 :
        1.0;

      // post-promo decay (pull-forward effect) for some SKUs
      const decayPenalty =
        s.sku === "BB-1001" && inRange(date, "2025-12-23", "2025-12-28") ? 0.88 :
        s.sku === "BB-1002" && inRange(date, "2025-12-21", "2025-12-26") ? 0.90 :
        1.0;

      const noise = 0.85 + Math.random() * 0.35;

      const price = round2(s.basePrice * (1 - (discountPct || 0) / 100));
      const units = Math.max(1, Math.round(baseUnits * promoBoost * decayPenalty * noise));
      const revenue = round2(price * units);

      const stockoutPct = Math.random() < 0.07 ? Math.round(30 + Math.random() * 55) : Math.round(Math.random() * 8);

      points.push({
        date,
        sku: s.sku,
        name: s.name,
        price,
        units,
        revenue,
        costPerUnit: s.cost,
        discountPct,
        promoId,
        promoFlag: !!promoId,
        stockoutPct,
        channel: i % 3 === 0 ? "web" : i % 3 === 1 ? "pwa" : "app",
        branchId: i % 2 === 0 ? "BR-DXB" : "BR-AUH",
      });
    }
  }

  return { promos, points };
}

/** ----------------------------
 * Component
 * ---------------------------- */
export function ProductPerformancePromos() {
  const seed = React.useMemo(() => mockPromoImpact(), []);
  const [promos] = React.useState<Promo[]>(seed.promos);
  const [points] = React.useState<PromoPoint[]>(seed.points);

  const skuOptions = React.useMemo(() => {
    const map = new Map<string, { sku: string; name: string }>();
    for (const p of points) map.set(p.sku, { sku: p.sku, name: p.name });
    return Array.from(map.values());
  }, [points]);

  const [sku, setSku] = React.useState<string>(skuOptions[0]?.sku ?? "");
  const skuPromos = React.useMemo(() => {
    const ids = new Set(points.filter((p) => p.sku === sku && p.promoId).map((p) => p.promoId as string));
    return promos.filter((x) => ids.has(x.id));
  }, [points, promos, sku]);

  const [promoId, setPromoId] = React.useState<string>(skuPromos[0]?.id ?? "");
  React.useEffect(() => {
    if (!promoId && skuPromos[0]?.id) setPromoId(skuPromos[0].id);
  }, [promoId, skuPromos]);

  const [branch, setBranch] = React.useState<"ALL" | "BR-DXB" | "BR-AUH">("ALL");
  const [channel, setChannel] = React.useState<"ALL" | Channel>("ALL");
  const [excludeStockout, setExcludeStockout] = React.useState(true);

  const selectedPromo = React.useMemo(() => promos.find((p) => p.id === promoId) || null, [promos, promoId]);

  const skuPoints = React.useMemo(() => {
    return points
      .filter((p) => p.sku === sku)
      .filter((p) => (branch === "ALL" ? true : p.branchId === branch))
      .filter((p) => (channel === "ALL" ? true : p.channel === channel))
      .filter((p) => (excludeStockout ? (p.stockoutPct ?? 0) < 15 : true))
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [points, sku, branch, channel, excludeStockout]);

  // Define windows
  const windows = React.useMemo(() => {
    if (!selectedPromo) return null;

    const promoStart = selectedPromo.start;
    const promoEnd = selectedPromo.end;
    const promoLen = daysBetween(promoStart, promoEnd) + 1;

    const baselineEnd = dateAdd(promoStart, -1);
    const baselineStart = dateAdd(baselineEnd, -(promoLen - 1)); // equal length baseline window

    const postStart = dateAdd(promoEnd, 1);
    const postEnd = dateAdd(postStart, promoLen - 1);

    return { baselineStart, baselineEnd, promoStart, promoEnd, postStart, postEnd, promoLen };
  }, [selectedPromo]);

  const split = React.useMemo(() => {
    if (!windows) return null;

    const baseline = skuPoints.filter((p) => inRange(p.date, windows.baselineStart, windows.baselineEnd));
    const promo = skuPoints.filter((p) => inRange(p.date, windows.promoStart, windows.promoEnd) && p.promoId === promoId);
    const post = skuPoints.filter((p) => inRange(p.date, windows.postStart, windows.postEnd));

    return { baseline, promo, post };
  }, [skuPoints, windows, promoId]);

  const metrics = React.useMemo(() => {
    if (!split || !windows) return null;

    const baseUnits = sum(split.baseline.map((p) => p.units));
    const promoUnits = sum(split.promo.map((p) => p.units));
    const postUnits = sum(split.post.map((p) => p.units));

    const baseRev = sum(split.baseline.map((p) => p.revenue));
    const promoRev = sum(split.promo.map((p) => p.revenue));
    const postRev = sum(split.post.map((p) => p.revenue));

    const baseGP = sum(split.baseline.map((p) => p.revenue - p.costPerUnit * p.units));
    const promoGP = sum(split.promo.map((p) => p.revenue - p.costPerUnit * p.units));
    const postGP = sum(split.post.map((p) => p.revenue - p.costPerUnit * p.units));

    // Incremental vs baseline expectation (same window length)
    const upliftUnits = promoUnits - baseUnits;
    const upliftRev = promoRev - baseRev;
    const upliftGP = promoGP - baseGP;

    // Promo cost proxy = discount given vs list (approx using avg discountPct on promo days)
    // If you store actual discount amount per order line, replace this!
    const avgPromoDiscountPct = avg(split.promo.map((p) => p.discountPct ?? 0));
    const grossAtNoDiscount = promoRev / (1 - clamp(avgPromoDiscountPct / 100, 0, 0.9));
    const discountCost = Math.max(0, grossAtNoDiscount - promoRev);

    // Net impact (incremental GP minus discount cost) - simplistic but merchant-friendly
    const netImpact = upliftGP - discountCost;

    // ROI = netImpact / discountCost (if discountCost>0)
    const roi = discountCost > 0 ? netImpact / discountCost : 0;

    // Post promo decay (pull-forward) = post window vs baseline window
    const postDeltaUnits = postUnits - baseUnits;
    const postDeltaRev = postRev - baseRev;

    const postDaily = split.post.map((p) => ({ date: p.date.slice(5), units: p.units }));
    const baseAvgDailyUnits = split.baseline.length ? baseUnits / split.baseline.length : 0;
    const decayHL = estimateDecayHalfLife(postDaily.map((d, idx) => ({ date: d.date, units: split.post[idx]?.units ?? 0 })), baseAvgDailyUnits);

    return {
      baseUnits,
      promoUnits,
      postUnits,
      baseRev,
      promoRev,
      postRev,
      baseGP,
      promoGP,
      postGP,
      upliftUnits,
      upliftRev,
      upliftGP,
      avgPromoDiscountPct,
      discountCost,
      netImpact,
      roi,
      postDeltaUnits,
      postDeltaRev,
      baseAvgDailyUnits,
      decayHL,
      promoLen: windows.promoLen,
    };
  }, [split, windows]);

  const timeline = React.useMemo(() => {
    if (!split || !windows) return [];

    // Build combined view: baseline + promo + post
    const map = new Map<string, { date: string; phase: string; units: number; revenue: number; price: number; discountPct: number; stockoutPct: number }>();

    const add = (arr: PromoPoint[], phase: string) => {
      for (const p of arr) {
        map.set(p.date, {
          date: p.date.slice(5),
          phase,
          units: p.units,
          revenue: p.revenue,
          price: p.price,
          discountPct: p.discountPct ?? 0,
          stockoutPct: p.stockoutPct ?? 0,
        });
      }
    };

    add(split.baseline, "Baseline");
    add(split.promo, "Promo");
    add(split.post, "Post");

    return Array.from(map.values()).sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [split, windows]);

  const riskFlags = React.useMemo(() => {
    const flags: Array<{ label: string; desc: string; badge: string }> = [];
    if (!split || !windows) return flags;

    const promoDays = split.promo.length;
    const expectedPromoDays = windows.promoLen;

    if (promoDays < Math.max(2, Math.floor(expectedPromoDays * 0.6))) {
      flags.push({
        label: "Sparse attribution",
        desc: "Many promo-window sales are not tagged with this promo (coupon stacking/attribution gaps).",
        badge: "bg-yellow-100 text-yellow-900",
      });
    }

    const stockoutCount = skuPoints.filter((p) => (p.stockoutPct ?? 0) >= 15).length;
    if (stockoutCount > 2) {
      flags.push({
        label: "Stockout noise",
        desc: "OOS days distort uplift/decay. Keep Exclude Stockout ON for clean insights.",
        badge: "bg-orange-100 text-orange-900",
      });
    }

    // If baseline has promo days in it, it will bias (mock-safe but real systems need overlap check)
    const baselineHasPromo = split.baseline.some((p) => !!p.promoId);
    if (baselineHasPromo) {
      flags.push({
        label: "Baseline contaminated",
        desc: "Baseline window contains other promos. Use a clean baseline or model-based baseline.",
        badge: "bg-red-100 text-red-900",
      });
    }

    return flags;
  }, [split, windows, skuPoints]);

  if (!selectedPromo) {
    return (
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-[#1E293B]">Promos â€” Promotion Impact per Product</CardTitle>
          <CardDescription>Select a SKU that has promotions to view uplift, ROI and post-promo decay.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600">No promo data found for this SKU (in current mock dataset).</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / Controls */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1E293B]">Promos â€” Promotion Impact per Product</CardTitle>
          <CardDescription>ROI, uplift, and post-promo decay (pull-forward) per SKU and promotion.</CardDescription>
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
                    onClick={() => {
                      setSku(s.sku);
                      const nextSkuPromos = promos.filter((x) =>
                        points.some((p) => p.sku === s.sku && p.promoId === x.id)
                      );
                      setPromoId(nextSkuPromos[0]?.id ?? "");
                    }}
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
                    className={`bg-white ${excludeStockout ? "ring-1 ring-[#F5C742]" : ""}`}
                    onClick={() => setExcludeStockout((v) => !v)}
                    title="Exclude days where stockoutPct >= 15%"
                  >
                    Exclude stockout days: {excludeStockout ? "ON" : "OFF"}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-800">{selectedPromo.type}</Badge>
                  <Badge className="bg-blue-100 text-blue-900">{selectedPromo.funding}</Badge>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-500 mb-1">Promotion</div>
                <div className="flex gap-2 flex-wrap">
                  {skuPromos.map((p) => (
                    <Button
                      key={p.id}
                      variant={p.id === promoId ? "default" : "outline"}
                      className={p.id === promoId ? "bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90" : "bg-white"}
                      onClick={() => setPromoId(p.id)}
                    >
                      {p.name} ({p.start} â†’ {p.end})
                    </Button>
                  ))}
                </div>
              </div>

              {windows && (
                <div className="mt-3 text-xs text-slate-600">
                  Windows: <b>Baseline</b> {windows.baselineStart} â†’ {windows.baselineEnd} â€¢{" "}
                  <b>Promo</b> {windows.promoStart} â†’ {windows.promoEnd} â€¢{" "}
                  <b>Post</b> {windows.postStart} â†’ {windows.postEnd}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Guardrails */}
      {riskFlags.length > 0 && (
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-[#1E293B]">Guardrails</CardTitle>
            <CardDescription>Signals that can distort uplift/ROI interpretation</CardDescription>
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

      {/* KPI Strip */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="text-xs text-slate-500">Uplift Units</div>
              <div className="text-2xl text-slate-900 mt-1">
                {metrics.upliftUnits >= 0 ? "+" : ""}
                {metrics.upliftUnits}
              </div>
              <div className="text-xs text-slate-500 mt-1">Promo vs Baseline (same length)</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="text-xs text-slate-500">Uplift Revenue</div>
              <div className="text-2xl text-slate-900 mt-1">{fmtAED(metrics.upliftRev)}</div>
              <div className="text-xs text-slate-500 mt-1">Incremental gross sales</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="text-xs text-slate-500">Incremental GP</div>
              <div className="text-2xl text-slate-900 mt-1">{fmtAED(metrics.upliftGP)}</div>
              <div className="text-xs text-slate-500 mt-1">Revenue âˆ’ COGS</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="text-xs text-slate-500">Promo Cost (discount)</div>
              <div className="text-2xl text-slate-900 mt-1">{fmtAED(metrics.discountCost)}</div>
              <div className="text-xs text-slate-500 mt-1">Avg disc: {round2(metrics.avgPromoDiscountPct)}%</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="text-xs text-slate-500">Net Impact</div>
              <div className="text-2xl text-slate-900 mt-1">{fmtAED(metrics.netImpact)}</div>
              <div className="text-xs text-slate-500 mt-1">Incremental GP âˆ’ promo cost</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="text-xs text-slate-500">ROI</div>
              <div className="text-2xl text-slate-900 mt-1">{round2(metrics.roi)}Ã—</div>
              <div className="text-xs text-slate-500 mt-1">
                {metrics.decayHL ? `Post decay: ${metrics.decayHL.label}` : "Decay: n/a"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="bg-white border-0 shadow-sm xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">Units & Revenue Timeline</CardTitle>
            <CardDescription>Baseline â†’ Promo â†’ Post (look for uplift and pull-forward)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px] w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeline}>
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
                  <Line type="monotone" dataKey="units" stroke="#1E293B" dot={false} name="Units" strokeWidth={2} />
                  <Line type="monotone" dataKey="revenue" stroke="#64748b" dot={false} name="Revenue" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge className="bg-slate-100 text-slate-800">Baseline</Badge>
              <Badge className="bg-[#F5C742] text-[#1E293B]">Promo</Badge>
              <Badge className="bg-blue-100 text-blue-900">Post</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">Discount & Price Pressure</CardTitle>
            <CardDescription>Is uplift coming only from heavy discounting?</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px] w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeline}>
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
                  <Area type="monotone" dataKey="discountPct" stroke="#F5C742" fill="#F5C742" fillOpacity={0.25} name="Discount %" />
                  <Area type="monotone" dataKey="price" stroke="#1E293B" fill="#1E293B" fillOpacity={0.15} name="Sell Price" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Post-promo decay panel */}
      {metrics && (
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-[#1E293B]">Post-Promo Decay / Pull-Forward</CardTitle>
            <CardDescription>Compare post window against baseline window (same length)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                <div className="text-xs text-slate-500">Post Units Î”</div>
                <div className="text-2xl text-slate-900 mt-1">
                  {metrics.postDeltaUnits >= 0 ? "+" : ""}
                  {metrics.postDeltaUnits}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  {metrics.postDeltaUnits >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <span className="text-emerald-700">{pct(metrics.postDeltaUnits, metrics.baseUnits)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-red-700">{pct(-metrics.postDeltaUnits, metrics.baseUnits)}%</span>
                    </>
                  )}
                  <span className="text-slate-500">vs baseline</span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                <div className="text-xs text-slate-500">Post Revenue Î”</div>
                <div className="text-2xl text-slate-900 mt-1">{fmtAED(metrics.postDeltaRev)}</div>
                <div className="text-xs text-slate-500 mt-1">Signals demand normalization</div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                <div className="text-xs text-slate-500">Decay estimate</div>
                <div className="text-sm text-slate-900 mt-1">{metrics.decayHL ? metrics.decayHL.label : "n/a"}</div>
                <div className="text-xs text-slate-500 mt-1">Days to return near baseline</div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-[#F7F7FA] p-4">
                <div className="text-xs text-slate-500">Decision</div>
                <div className="text-sm text-slate-900 mt-1">
                  {metrics.roi >= 1 ? "Scale / Repeat" : metrics.roi >= 0.3 ? "Optimize" : "Stop / Redesign"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {metrics.roi >= 1
                    ? "Strong ROI; test slightly lower discount."
                    : metrics.roi >= 0.3
                    ? "Try different targeting, bundle, or shorter duration."
                    : "Likely cannibalization; focus on discovery + value props."}
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex flex-wrap gap-2">
              <Button className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Promo Learnings
              </Button>
              <Button variant="outline" className="bg-white">
                <BadgePercent className="h-4 w-4 mr-2" />
                Create Next Promo Test
              </Button>
              <Button variant="outline" className="bg-white">
                Export Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Table */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-[#1E293B]">Daily Breakdown</CardTitle>
          <CardDescription>Use this to audit anomalies (stockout, mis-attribution, outliers)</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-[#F7F7FA]">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Discount %</TableHead>
                  <TableHead className="text-right">Stockout %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeline.slice(0, 21).map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="text-xs">{r.date}</TableCell>
                    <TableCell className="text-xs">
                      <Badge className={r.phase === "Promo" ? "bg-[#F5C742] text-[#1E293B]" : r.phase === "Post" ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-800"}>
                        {r.phase}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.units}</TableCell>
                    <TableCell className="text-right text-xs">{fmtAED(r.revenue)}</TableCell>
                    <TableCell className="text-right text-xs">{r.discountPct}%</TableCell>
                    <TableCell className="text-right text-xs">{r.stockoutPct ?? 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 text-xs text-slate-600">
            <b>Tip:</b> For true "incremental" impact, upgrade baseline from simple window to a modeled baseline (seasonality + channel + stockouts).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

