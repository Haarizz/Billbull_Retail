import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { Separator } from "../../components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Search, ArrowUpDown, AlertTriangle, Clock, RefreshCcw } from "lucide-react";

/** ----------------------------
 *  Types
 *  ---------------------------- */
type Channel = "web" | "pwa" | "app";

type EventType =
  | "PRODUCT_VIEW"
  | "ADD_TO_CART"
  | "CHECKOUT_STARTED"
  | "PAYMENT_SUCCESS"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "PAYMENT_FAILED";

type StorefrontEvent = {
  id: string;
  ts: string; // ISO
  branchId?: string;
  channel: Channel;
  sessionId: string;
  customerId?: string;
  sku: string;
  orderId?: string;
  amount?: number;
  meta?: Record<string, any>;
  type: EventType;
};

type FunnelRow = {
  sku: string;
  name: string;
  category: string;

  views: number;
  atc: number;
  checkout: number;
  paid: number;
  delivered: number;

  viewToAtcPct: number;
  atcToCheckoutPct: number;
  checkoutToPaidPct: number;
  paidToDeliveredPct: number;
  viewToPaidPct: number;

  stuckCheckouts: number; // checkouts without payment after threshold
  riskFlags: Array<"LOW_ATC" | "PAYMENT_DROP" | "HIGH_CANCEL" | "STOCKOUT_SIGNAL">;
};

type SortKey =
  | "views"
  | "atc"
  | "checkout"
  | "paid"
  | "delivered"
  | "viewToPaidPct"
  | "checkoutToPaidPct";

/** ----------------------------
 *  Helpers
 *  ---------------------------- */
const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10); // 1 decimal

function uniqCount(items: StorefrontEvent[], keyFn: (e: StorefrontEvent) => string | undefined) {
  const s = new Set<string>();
  for (const it of items) {
    const k = keyFn(it);
    if (k) s.add(k);
  }
  return s.size;
}

function parseISO(s: string) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/** Checkout stuck detector: if checkout_started exists but no payment_success for same session within X minutes */
function countStuckCheckouts(events: StorefrontEvent[], thresholdMinutes: number) {
  const thresholdMs = thresholdMinutes * 60 * 1000;

  const checkoutsBySession = new Map<string, number[]>(); // session -> checkout timestamps
  const paidBySession = new Map<string, number[]>(); // session -> paid timestamps

  for (const e of events) {
    const ts = parseISO(e.ts);
    if (!ts) continue;

    if (e.type === "CHECKOUT_STARTED") {
      const arr = checkoutsBySession.get(e.sessionId) ?? [];
      arr.push(ts);
      checkoutsBySession.set(e.sessionId, arr);
    }
    if (e.type === "PAYMENT_SUCCESS") {
      const arr = paidBySession.get(e.sessionId) ?? [];
      arr.push(ts);
      paidBySession.set(e.sessionId, arr);
    }
  }

  let stuck = 0;
  for (const [sessionId, checkoutTimes] of checkoutsBySession.entries()) {
    const paidTimes = paidBySession.get(sessionId) ?? [];
    // If for any checkout event, no paid event occurs after it within threshold => count as stuck
    for (const cts of checkoutTimes) {
      const hasPaidSoon = paidTimes.some((pts) => pts >= cts && pts <= cts + thresholdMs);
      if (!hasPaidSoon) stuck += 1;
    }
  }
  return stuck;
}

function buildFunnelRows(events: StorefrontEvent[], stuckThresholdMinutes: number): FunnelRow[] {
  // group by sku
  const bySku = new Map<string, StorefrontEvent[]>();
  for (const e of events) {
    if (!bySku.has(e.sku)) bySku.set(e.sku, []);
    bySku.get(e.sku)!.push(e);
  }

  const rows: FunnelRow[] = [];

  for (const [sku, skuEvents] of bySku.entries()) {
    const viewsEvents = skuEvents.filter((e) => e.type === "PRODUCT_VIEW");
    const atcEvents = skuEvents.filter((e) => e.type === "ADD_TO_CART");
    const checkoutEvents = skuEvents.filter((e) => e.type === "CHECKOUT_STARTED");
    const paidEvents = skuEvents.filter((e) => e.type === "PAYMENT_SUCCESS");
    const deliveredEvents = skuEvents.filter((e) => e.type === "ORDER_DELIVERED");

    // Deduping rules
    const views = uniqCount(viewsEvents, (e) => e.sessionId);
    const atc = uniqCount(atcEvents, (e) => e.sessionId);
    const checkout = uniqCount(checkoutEvents, (e) => e.sessionId);
    const paid = uniqCount(paidEvents, (e) => e.orderId ?? `${e.sessionId}-paid`);
    const delivered = uniqCount(deliveredEvents, (e) => e.orderId ?? `${e.sessionId}-delivered`);

    const stuckCheckouts = countStuckCheckouts(skuEvents, stuckThresholdMinutes);

    const viewToAtcPct = pct(atc, views);
    const atcToCheckoutPct = pct(checkout, atc);
    const checkoutToPaidPct = pct(paid, checkout);
    const paidToDeliveredPct = pct(delivered, paid);
    const viewToPaidPct = pct(paid, views);

    // risk flags (simple heuristics; tune later)
    const riskFlags: FunnelRow["riskFlags"] = [];
    if (views >= 100 && viewToAtcPct < 3) riskFlags.push("LOW_ATC");
    if (checkout >= 30 && checkoutToPaidPct < 50) riskFlags.push("PAYMENT_DROP");
    if (stuckCheckouts >= 10) riskFlags.push("PAYMENT_DROP");

    rows.push({
      sku,
      name: `SKU ${sku}`, // replace with real product name from catalog API
      category: "General", // replace
      views,
      atc,
      checkout,
      paid,
      delivered,
      viewToAtcPct,
      atcToCheckoutPct,
      checkoutToPaidPct,
      paidToDeliveredPct,
      viewToPaidPct,
      stuckCheckouts,
      riskFlags,
    });
  }

  return rows;
}

/** ----------------------------
 *  Mock Data (replace with API)
 *  ---------------------------- */
function mockEvents(): StorefrontEvent[] {
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();

  const rows: StorefrontEvent[] = [];
  const skus = ["BB-1001", "BB-1002", "BB-1003", "BB-2001", "BB-3005"];

  for (let i = 0; i < 900; i++) {
    const sku = skus[i % skus.length];
    const sessionId = `sess_${Math.floor(i / 3)}`;
    const branchId = i % 2 === 0 ? "BR-DXB" : "BR-AUH";
    const channel: Channel = i % 3 === 0 ? "web" : i % 3 === 1 ? "pwa" : "app";
    const baseT = now - (Math.random() * 7 * 24 * 60 * 60 * 1000);

    // view
    rows.push({
      id: `e_${i}_v`,
      ts: iso(baseT),
      type: "PRODUCT_VIEW",
      sku,
      sessionId,
      channel,
      branchId,
    });

    // some add to cart
    if (Math.random() < (sku === "BB-1002" ? 0.08 : 0.05)) {
      rows.push({
        id: `e_${i}_a`,
        ts: iso(baseT + 2 * 60 * 1000),
        type: "ADD_TO_CART",
        sku,
        sessionId,
        channel,
        branchId,
      });
    }

    // some checkout
    if (Math.random() < (sku === "BB-1002" ? 0.05 : 0.03)) {
      rows.push({
        id: `e_${i}_c`,
        ts: iso(baseT + 6 * 60 * 1000),
        type: "CHECKOUT_STARTED",
        sku,
        sessionId,
        channel,
        branchId,
      });
    }

    // some paid
    if (Math.random() < (sku === "BB-1002" ? 0.03 : 0.015)) {
      const orderId = `ord_${i}`;
      rows.push({
        id: `e_${i}_p`,
        ts: iso(baseT + 9 * 60 * 1000),
        type: "PAYMENT_SUCCESS",
        sku,
        sessionId,
        channel,
        branchId,
        orderId,
        amount: 49 + Math.random() * 200,
      });

      // delivered subset
      if (Math.random() < 0.85) {
        rows.push({
          id: `e_${i}_d`,
          ts: iso(baseT + 2 * 24 * 60 * 60 * 1000),
          type: "ORDER_DELIVERED",
          sku,
          sessionId,
          channel,
          branchId,
          orderId,
        });
      }
    } else {
      // some payment failed (drop)
      if (Math.random() < 0.01) {
        rows.push({
          id: `e_${i}_pf`,
          ts: iso(baseT + 10 * 60 * 1000),
          type: "PAYMENT_FAILED",
          sku,
          sessionId,
          channel,
          branchId,
          meta: { reason: "gateway_timeout" },
        });
      }
    }
  }

  return rows;
}

/** ----------------------------
 *  UI Component
 *  ---------------------------- */
export function ProductPerformanceConversion() {
  const [events, setEvents] = React.useState<StorefrontEvent[]>(() => mockEvents());

  // filters
  const [query, setQuery] = React.useState("");
  const [branch, setBranch] = React.useState<"ALL" | "BR-DXB" | "BR-AUH">("ALL");
  const [channel, setChannel] = React.useState<"ALL" | Channel>("ALL");
  const [stuckMins, setStuckMins] = React.useState(20);

  // selection + sorting
  const [selectedSku, setSelectedSku] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("viewToPaidPct");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  // derived rows
  const rows = React.useMemo(() => {
    const filtered = events.filter((e) => {
      if (branch !== "ALL" && e.branchId !== branch) return false;
      if (channel !== "ALL" && e.channel !== channel) return false;
      if (query && !(e.sku.toLowerCase().includes(query.toLowerCase()))) return false;
      return true;
    });

    const built = buildFunnelRows(filtered, stuckMins);

    built.sort((a, b) => {
      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;
      const d = av - bv;
      return sortDir === "asc" ? d : -d;
    });

    return built;
  }, [events, query, branch, channel, stuckMins, sortKey, sortDir]);

  const selected = React.useMemo(() => {
    if (!selectedSku) return rows[0] ?? null;
    return rows.find((r) => r.sku === selectedSku) ?? rows[0] ?? null;
  }, [rows, selectedSku]);

  React.useEffect(() => {
    if (selected && selectedSku !== selected.sku) setSelectedSku(selected.sku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.sku]);

  const funnelChartData = React.useMemo(() => {
    if (!selected) return [];
    return [
      { step: "Views", value: selected.views },
      { step: "Add to Cart", value: selected.atc },
      { step: "Checkout", value: selected.checkout },
      { step: "Paid", value: selected.paid },
      { step: "Delivered", value: selected.delivered },
    ];
  }, [selected]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + Filters */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1E293B]">Conversion Funnel (per SKU)</CardTitle>
          <CardDescription>
            Track the journey from <b>view â†’ add to cart â†’ checkout â†’ paid â†’ delivered</b>. Identify drop-offs and stuck checkouts.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search SKU (ex: BB-1002)â€¦"
                className="pl-9 bg-[#F7F7FA]"
              />
            </div>

            <div className="flex items-center gap-2">
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

              <Button variant="outline" className="bg-white" onClick={() => setStuckMins((m) => (m === 20 ? 30 : m === 30 ? 45 : 20))}>
                <Clock className="h-4 w-4 mr-2" />
                Stuck: {stuckMins}m
              </Button>

              <Button
                variant="outline"
                className="bg-white"
                onClick={() => setEvents(mockEvents())}
                title="Refresh (mock)"
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main split */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Left: Table */}
        <Card className="bg-white border-0 shadow-sm xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">SKU Funnel Table</CardTitle>
            <CardDescription>Sort by conversion and spot risk flags.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-[#F7F7FA]">
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("views")}>
                      Views <ArrowUpDown className="inline h-3 w-3 ml-1 text-slate-400" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("atc")}>
                      ATC
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("checkout")}>
                      Checkout
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("paid")}>
                      Paid
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("viewToPaidPct")}>
                      Viewâ†’Paid%
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("checkoutToPaidPct")}>
                      Checkoutâ†’Paid%
                    </TableHead>
                    <TableHead className="text-right">Stuck</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-slate-500 py-10">
                        No data for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.slice(0, 30).map((r) => {
                      const active = selectedSku === r.sku;
                      return (
                        <TableRow
                          key={r.sku}
                          className={`cursor-pointer ${active ? "bg-[#F5C742]/15" : ""}`}
                          onClick={() => setSelectedSku(r.sku)}
                        >
                          <TableCell className="font-medium text-[#1E293B]">{r.sku}</TableCell>
                          <TableCell className="text-right">{r.views}</TableCell>
                          <TableCell className="text-right">{r.atc}</TableCell>
                          <TableCell className="text-right">{r.checkout}</TableCell>
                          <TableCell className="text-right">{r.paid}</TableCell>
                          <TableCell className="text-right">
                            <Badge className="bg-slate-100 text-slate-800">{r.viewToPaidPct}%</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={r.checkoutToPaidPct < 50 ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"}>
                              {r.checkoutToPaidPct}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.stuckCheckouts > 0 ? (
                              <Badge className="bg-yellow-100 text-yellow-900">{r.stuckCheckouts}</Badge>
                            ) : (
                              <span className="text-slate-400">â€”</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {r.riskFlags.includes("LOW_ATC") && <Badge className="bg-yellow-100 text-yellow-900">Low ATC</Badge>}
                              {r.riskFlags.includes("PAYMENT_DROP") && <Badge className="bg-red-100 text-red-900">Payment Drop</Badge>}
                              {r.riskFlags.length === 0 && <span className="text-xs text-slate-400">OK</span>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
              <span>Showing top {Math.min(30, rows.length)} rows</span>
              <span>Sorting: {sortKey} ({sortDir})</span>
            </div>
          </CardContent>
        </Card>

        {/* Right: Selected SKU Funnel */}
        <Card className="bg-white border-0 shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">
              {selected ? (
                <>
                  SKU Funnel â€” <span className="text-[#1E293B]">{selected.sku}</span>
                </>
              ) : (
                "SKU Funnel"
              )}
            </CardTitle>
            <CardDescription>Drop-offs, conversion rates and action suggestions.</CardDescription>
          </CardHeader>

          <CardContent className="pt-0 space-y-4">
            {!selected ? (
              <div className="py-10 text-center text-sm text-slate-500">Select a SKU to view funnel.</div>
            ) : (
              <>
                {/* Rates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#F7F7FA] p-3">
                    <div className="text-xs text-slate-500">View â†’ ATC</div>
                    <div className="text-lg text-slate-900 mb-1">{selected.viewToAtcPct}%</div>
                    <Progress value={Math.min(100, selected.viewToAtcPct)} className="h-2 mt-2" />
                  </div>
                  <div className="rounded-lg bg-[#F7F7FA] p-3">
                    <div className="text-xs text-slate-500">Checkout â†’ Paid</div>
                    <div className="text-lg text-slate-900 mb-1">{selected.checkoutToPaidPct}%</div>
                    <Progress value={Math.min(100, selected.checkoutToPaidPct)} className="h-2 mt-2" />
                  </div>
                  <div className="rounded-lg bg-[#F7F7FA] p-3">
                    <div className="text-xs text-slate-500">View â†’ Paid</div>
                    <div className="text-lg text-slate-900 mb-1">{selected.viewToPaidPct}%</div>
                    <Progress value={Math.min(100, selected.viewToPaidPct)} className="h-2 mt-2" />
                  </div>
                  <div className="rounded-lg bg-[#F7F7FA] p-3">
                    <div className="text-xs text-slate-500">Paid â†’ Delivered</div>
                    <div className="text-lg text-slate-900 mb-1">{selected.paidToDeliveredPct}%</div>
                    <Progress value={Math.min(100, selected.paidToDeliveredPct)} className="h-2 mt-2" />
                  </div>
                </div>

                <Separator />

                {/* Funnel Chart */}
                <div className="h-[220px] w-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={funnelChartData} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" stroke="#64748B" style={{ fontSize: '12px' }} />
                      <YAxis type="category" dataKey="step" width={95} stroke="#64748B" style={{ fontSize: '12px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="value" fill="#F5C742" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Stuck + Alerts */}
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm text-slate-900">Stuck checkouts</div>
                      <div className="text-xs text-slate-500">
                        Checkout started but no successful payment within {stuckMins} minutes.
                      </div>
                    </div>
                    {selected.stuckCheckouts > 0 ? (
                      <Badge className="bg-yellow-100 text-yellow-900">{selected.stuckCheckouts}</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-900">0</Badge>
                    )}
                  </div>

                  {selected.stuckCheckouts > 0 && (
                    <div className="mt-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5" />
                      <div className="text-xs text-slate-700">
                        Likely causes: gateway issues, COD verification delay, OOS at checkout, address validation.
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                            Open Incident Center
                          </Button>
                          <Button size="sm" variant="outline" className="bg-white">
                            Review Payment Failures
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested actions */}
                <div className="rounded-lg bg-[#F5C742]/10 p-3">
                  <div className="text-sm text-slate-900 mb-2">Suggested actions</div>
                  <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                    {selected.viewToAtcPct < 3 && <li>Improve title/images, add trust badges, highlight delivery ETA.</li>}
                    {selected.checkoutToPaidPct < 50 && <li>Check payment methods, COD verification, gateway latency and pricing shock.</li>}
                    {selected.stuckCheckouts > 0 && <li>Enable "reserve on payment" or reduce checkout friction for this SKU.</li>}
                    <li>Run A/B: price point vs bundle offer and monitor conversion.</li>
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Optional: Compare mode placeholder */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-[#1E293B]">Compare Period (Optional)</CardTitle>
          <CardDescription>
            Add "Current vs Previous" to show conversion uplift per SKU (next step).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xs text-slate-600">
            Hook: pass two datasets (currentEvents + previousEvents), build two funnels, and show deltas on table columns (e.g., Viewâ†’Paid% +1.8%).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

