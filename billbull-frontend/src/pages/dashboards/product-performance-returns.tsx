import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { Separator } from "../../components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { AlertTriangle, Search, ArrowUpDown, RefreshCcw, ClipboardList, Camera, BadgePercent } from "lucide-react";

/** ----------------------------
 * Types
 * ---------------------------- */
type Channel = "web" | "pwa" | "app";

type ReturnReason =
  | "QUALITY_ISSUE"
  | "WRONG_DESCRIPTION"
  | "SIZE_FIT"
  | "DAMAGED_IN_TRANSIT"
  | "MISSING_PARTS"
  | "LATE_DELIVERY"
  | "CHANGED_MIND"
  | "OTHER";

type ReturnDisposition = "RESTOCK" | "SCRAP" | "REPAIR" | "RETURN_TO_VENDOR";

type ReturnCase = {
  rmaId: string;
  tsCreated: string;
  branchId?: string;
  channel: Channel;
  orderId: string;
  customerId?: string;

  sku: string;
  name: string;
  category: string;
  brand?: string;

  qty: number;
  reason: ReturnReason;
  subReason?: string;

  photoUrls?: string[];
  notes?: string;

  refundAmount: number;
  itemNetSales: number;
  itemCost: number;

  qcResult?: "PASS" | "FAIL";
  disposition?: ReturnDisposition;
};

type SalesSummary = {
  sku: string;
  soldQty: number;
  netSales: number;
};

type ReasonStat = { reason: ReturnReason; qty: number; refund: number; sharePct: number };

type SkuReturnRow = {
  sku: string;
  name: string;
  category: string;
  brand?: string;

  soldQty: number;
  returnedQty: number;
  returnRatePct: number;

  refundAmount: number;
  netSales: number;
  returnValueRatePct: number;

  topReason: ReturnReason;
  topReasonSharePct: number;

  qualitySharePct: number;
  descriptionSharePct: number;
  sizeSharePct: number;

  flags: Array<"HIGH_RETURN" | "QUALITY_SPIKE" | "DESC_SPIKE" | "SIZE_SPIKE">;
};

/** ----------------------------
 * Helpers
 * ---------------------------- */
const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);

const reasonLabel: Record<ReturnReason, string> = {
  QUALITY_ISSUE: "Quality issues",
  WRONG_DESCRIPTION: "Wrong description",
  SIZE_FIT: "Size / fit problems",
  DAMAGED_IN_TRANSIT: "Damaged in transit",
  MISSING_PARTS: "Missing parts",
  LATE_DELIVERY: "Late delivery",
  CHANGED_MIND: "Changed mind",
  OTHER: "Other",
};

const reasonColor: Record<ReturnReason, string> = {
  QUALITY_ISSUE: "#ef4444",
  WRONG_DESCRIPTION: "#f59e0b",
  SIZE_FIT: "#3b82f6",
  DAMAGED_IN_TRANSIT: "#a855f7",
  MISSING_PARTS: "#14b8a6",
  LATE_DELIVERY: "#64748b",
  CHANGED_MIND: "#10b981",
  OTHER: "#94a3b8",
};

/** ----------------------------
 * Mock data (replace with API)
 * ---------------------------- */
function mockSales(): SalesSummary[] {
  return [
    { sku: "BB-1001", soldQty: 1200, netSales: 132000 },
    { sku: "BB-1002", soldQty: 900, netSales: 119000 },
    { sku: "BB-1003", soldQty: 700, netSales: 78000 },
    { sku: "BB-2001", soldQty: 500, netSales: 99000 },
    { sku: "BB-3005", soldQty: 350, netSales: 42000 },
  ];
}

function mockReturns(): ReturnCase[] {
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const skus = [
    { sku: "BB-1001", name: "Premium Tee", category: "Apparel", brand: "BB Wear" },
    { sku: "BB-1002", name: "Running Shoes", category: "Apparel", brand: "BB Wear" },
    { sku: "BB-1003", name: "Protein Shaker", category: "Accessories", brand: "BB Gear" },
    { sku: "BB-2001", name: "Smart Scale", category: "Electronics", brand: "BB Tech" },
    { sku: "BB-3005", name: "Gift Card", category: "Digital", brand: "BB Store" },
  ];

  const reasons: ReturnReason[] = [
    "QUALITY_ISSUE",
    "WRONG_DESCRIPTION",
    "SIZE_FIT",
    "DAMAGED_IN_TRANSIT",
    "MISSING_PARTS",
    "LATE_DELIVERY",
    "CHANGED_MIND",
    "OTHER",
  ];

  const rows: ReturnCase[] = [];
  for (let i = 0; i < 180; i++) {
    const p = skus[i % skus.length];
    const reason =
      p.sku === "BB-1002"
        ? (Math.random() < 0.55 ? "SIZE_FIT" : Math.random() < 0.7 ? "WRONG_DESCRIPTION" : "QUALITY_ISSUE")
        : p.sku === "BB-2001"
          ? (Math.random() < 0.55 ? "QUALITY_ISSUE" : Math.random() < 0.7 ? "MISSING_PARTS" : "DAMAGED_IN_TRANSIT")
          : reasons[Math.floor(Math.random() * reasons.length)];

    const qty = Math.random() < 0.9 ? 1 : 2;
    const net = 80 + Math.random() * 220;
    const cost = net * (0.55 + Math.random() * 0.25);
    const refund = net * qty;

    rows.push({
      rmaId: `RMA-${10000 + i}`,
      tsCreated: iso(now - Math.random() * 21 * 24 * 60 * 60 * 1000),
      branchId: i % 2 === 0 ? "BR-DXB" : "BR-AUH",
      channel: (i % 3 === 0 ? "web" : i % 3 === 1 ? "pwa" : "app") as Channel,
      orderId: `ORD-${50000 + i}`,
      customerId: `C-${Math.floor(i / 3)}`,

      sku: p.sku,
      name: p.name,
      category: p.category,
      brand: p.brand,

      qty,
      reason,
      subReason:
        reason === "QUALITY_ISSUE"
          ? (Math.random() < 0.5 ? "Loose stitching" : "Defective item")
          : reason === "WRONG_DESCRIPTION"
            ? (Math.random() < 0.5 ? "Color mismatch" : "Specs not matching")
            : reason === "SIZE_FIT"
              ? (Math.random() < 0.5 ? "Too small" : "Too large")
              : undefined,

      photoUrls: Math.random() < 0.35 ? ["https://example.com/photo.jpg"] : [],
      notes: Math.random() < 0.3 ? "Customer reported issue during unboxing." : "",

      refundAmount: refund,
      itemNetSales: net,
      itemCost: cost,

      qcResult: Math.random() < 0.7 ? "FAIL" : "PASS",
      disposition: Math.random() < 0.5 ? "RESTOCK" : Math.random() < 0.75 ? "SCRAP" : "RETURN_TO_VENDOR",
    });
  }
  return rows;
}

/** ----------------------------
 * Aggregation
 * ---------------------------- */
function computeReasonStats(returns: ReturnCase[]): ReasonStat[] {
  const map = new Map<ReturnReason, { qty: number; refund: number }>();
  for (const r of returns) {
    const prev = map.get(r.reason) ?? { qty: 0, refund: 0 };
    prev.qty += r.qty;
    prev.refund += r.refundAmount;
    map.set(r.reason, prev);
  }
  const totalQty = Array.from(map.values()).reduce((a, b) => a + b.qty, 0);
  const stats: ReasonStat[] = Array.from(map.entries()).map(([reason, v]) => ({
    reason,
    qty: v.qty,
    refund: v.refund,
    sharePct: pct(v.qty, totalQty),
  }));
  stats.sort((a, b) => b.qty - a.qty);
  return stats;
}

function computeSkuRows(sales: SalesSummary[], returns: ReturnCase[]): SkuReturnRow[] {
  const salesBySku = new Map(sales.map((s) => [s.sku, s]));
  const retBySku = new Map<string, ReturnCase[]>();
  for (const r of returns) {
    if (!retBySku.has(r.sku)) retBySku.set(r.sku, []);
    retBySku.get(r.sku)!.push(r);
  }

  const rows: SkuReturnRow[] = [];

  for (const [sku, rlist] of retBySku.entries()) {
    const s = salesBySku.get(sku) ?? { sku, soldQty: 0, netSales: 0 };
    const returnedQty = rlist.reduce((a, b) => a + b.qty, 0);
    const refundAmount = rlist.reduce((a, b) => a + b.refundAmount, 0);

    const reasonCounts = new Map<ReturnReason, number>();
    for (const r of rlist) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + r.qty);

    const top = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["OTHER", 0];
    const topReason = top[0];
    const topReasonSharePct = pct(top[1], returnedQty);

    const qualitySharePct = pct(reasonCounts.get("QUALITY_ISSUE") ?? 0, returnedQty);
    const descriptionSharePct = pct(reasonCounts.get("WRONG_DESCRIPTION") ?? 0, returnedQty);
    const sizeSharePct = pct(reasonCounts.get("SIZE_FIT") ?? 0, returnedQty);

    const returnRatePct = pct(returnedQty, s.soldQty);
    const returnValueRatePct = pct(refundAmount, s.netSales);

    // Flags (simple heuristics; tune per category)
    const flags: SkuReturnRow["flags"] = [];
    if (s.soldQty >= 100 && returnRatePct > 8) flags.push("HIGH_RETURN");
    if (qualitySharePct > 35 && returnedQty >= 10) flags.push("QUALITY_SPIKE");
    if (descriptionSharePct > 35 && returnedQty >= 10) flags.push("DESC_SPIKE");
    if (sizeSharePct > 45 && returnedQty >= 10) flags.push("SIZE_SPIKE");

    rows.push({
      sku,
      name: rlist[0]?.name ?? `SKU ${sku}`,
      category: rlist[0]?.category ?? "General",
      brand: rlist[0]?.brand,

      soldQty: s.soldQty,
      returnedQty,
      returnRatePct,

      refundAmount,
      netSales: s.netSales,
      returnValueRatePct,

      topReason,
      topReasonSharePct,
      qualitySharePct,
      descriptionSharePct,
      sizeSharePct,

      flags,
    });
  }

  rows.sort((a, b) => b.returnRatePct - a.returnRatePct);
  return rows;
}

/** ----------------------------
 * Component
 * ---------------------------- */
export function ProductPerformanceReturns() {
  const [sales, setSales] = React.useState<SalesSummary[]>(() => mockSales());
  const [returns, setReturns] = React.useState<ReturnCase[]>(() => mockReturns());

  // filters
  const [query, setQuery] = React.useState("");
  const [branch, setBranch] = React.useState<"ALL" | "BR-DXB" | "BR-AUH">("ALL");
  const [channel, setChannel] = React.useState<"ALL" | Channel>("ALL");
  const [reasonFilter, setReasonFilter] = React.useState<"ALL" | ReturnReason>("ALL");

  // sort
  const [sortKey, setSortKey] = React.useState<"returnRatePct" | "refundAmount" | "returnedQty">("returnRatePct");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const filteredReturns = React.useMemo(() => {
    return returns.filter((r) => {
      if (branch !== "ALL" && r.branchId !== branch) return false;
      if (channel !== "ALL" && r.channel !== channel) return false;
      if (reasonFilter !== "ALL" && r.reason !== reasonFilter) return false;
      if (query && !(`${r.sku} ${r.name}`.toLowerCase().includes(query.toLowerCase()))) return false;
      return true;
    });
  }, [returns, branch, channel, reasonFilter, query]);

  const reasonStats = React.useMemo(() => computeReasonStats(filteredReturns), [filteredReturns]);
  const skuRows = React.useMemo(() => {
    const rows = computeSkuRows(sales, filteredReturns);
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const d = av - bv;
      return sortDir === "asc" ? d : -d;
    });
    return rows;
  }, [sales, filteredReturns, sortKey, sortDir]);

  const [selectedSku, setSelectedSku] = React.useState<string | null>(null);
  const selected = React.useMemo(() => {
    const row = skuRows.find((r) => r.sku === selectedSku) ?? skuRows[0] ?? null;
    return row;
  }, [skuRows, selectedSku]);

  React.useEffect(() => {
    if (selected && selectedSku !== selected.sku) setSelectedSku(selected.sku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.sku]);

  const selectedReturns = React.useMemo(() => {
    if (!selected) return [];
    return filteredReturns.filter((r) => r.sku === selected.sku);
  }, [filteredReturns, selected]);

  const selectedReasonStats = React.useMemo(() => computeReasonStats(selectedReturns), [selectedReturns]);

  const totalReturnQty = filteredReturns.reduce((a, b) => a + b.qty, 0);
  const totalRefund = filteredReturns.reduce((a, b) => a + b.refundAmount, 0);
  const totalNetSales = sales.reduce((a, b) => a + b.netSales, 0);
  const returnValueRatePct = pct(totalRefund, totalNetSales);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const nextReason = () => {
    const keys: Array<"ALL" | ReturnReason> = [
      "ALL",
      "QUALITY_ISSUE",
      "WRONG_DESCRIPTION",
      "SIZE_FIT",
      "DAMAGED_IN_TRANSIT",
      "MISSING_PARTS",
      "LATE_DELIVERY",
      "CHANGED_MIND",
      "OTHER",
    ];
    const idx = keys.indexOf(reasonFilter);
    setReasonFilter(keys[(idx + 1) % keys.length]);
  };

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1E293B]">Returns â€” Return Reason Analysis</CardTitle>
          <CardDescription>
            Understand why customers return products (Quality / Wrong description / Size-Fit) and reduce return-rate with targeted fixes.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search SKU or product nameâ€¦"
                className="pl-9 bg-[#F7F7FA]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
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
                className={`bg-white ${reasonFilter !== "ALL" ? "ring-1 ring-[#F5C742]" : ""}`}
                onClick={nextReason}
                title="Cycle reason filter"
              >
                Reason: {reasonFilter === "ALL" ? "All" : reasonLabel[reasonFilter]}
              </Button>

              <Button
                variant="outline"
                className="bg-white"
                onClick={() => {
                  setSales(mockSales());
                  setReturns(mockReturns());
                }}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Total Returned Units</div>
                <div className="text-2xl text-slate-900 mt-1">{totalReturnQty}</div>
              </div>
              <ClipboardList className="h-6 w-6 text-[#F5C742]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Refund Amount</div>
                <div className="text-2xl text-slate-900 mt-1">AED {Math.round(totalRefund).toLocaleString()}</div>
              </div>
              <BadgePercent className="h-6 w-6 text-[#F5C742]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Return Value Rate</div>
            <div className="text-2xl text-slate-900 mt-1">{returnValueRatePct}%</div>
            <Progress value={Math.min(100, returnValueRatePct)} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500">Top Reason</div>
            {reasonStats[0] ? (
              <>
                <div className="text-lg text-slate-900 mt-1">{reasonLabel[reasonStats[0].reason]}</div>
                <div className="text-xs text-slate-500 mt-1">{reasonStats[0].sharePct}% of returned units</div>
              </>
            ) : (
              <div className="text-sm text-slate-500 mt-2">No returns for selected filters</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts + table */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Reason distribution */}
        <Card className="bg-white border-0 shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">Reasons Distribution</CardTitle>
            <CardDescription>Which reasons dominate returns in the selected scope</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {reasonStats.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">No return data.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                <div className="h-[220px] w-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={reasonStats}
                        dataKey="qty"
                        nameKey="reason"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {reasonStats.map((r) => (
                          <Cell key={r.reason} fill={reasonColor[r.reason]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: any, _n: any, ctx: any) => {
                          const reason = ctx?.payload?.reason as ReturnReason;
                          return [`${v} units`, reason ? reasonLabel[reason] : ""];
                        }}
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
                  {reasonStats.slice(0, 5).map((r) => (
                    <div key={r.reason} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: reasonColor[r.reason] }} />
                        <span className="text-slate-700">{reasonLabel[r.reason]}</span>
                      </div>
                      <div className="text-slate-600">
                        <b className="text-[#1E293B]">{r.sharePct}%</b> â€¢ {r.qty} units
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-[#F5C742]/10 p-3 text-xs text-slate-700">
                  Tip: Pair this with <b>QC disposition</b> (Restock/Scrap/RTV) to quantify operational loss beyond refunds.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SKU table */}
        <Card className="bg-white border-0 shadow-sm xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-[#1E293B]">SKU Return Table</CardTitle>
            <CardDescription>Return rate, top reason, and reason mix per SKU</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-[#F7F7FA]">
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("returnedQty")}>
                      Returned <ArrowUpDown className="inline h-3 w-3 ml-1 text-slate-400" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("returnRatePct")}>
                      Return % <ArrowUpDown className="inline h-3 w-3 ml-1 text-slate-400" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("refundAmount")}>
                      Refund (AED)
                    </TableHead>
                    <TableHead>Top Reason</TableHead>
                    <TableHead className="text-right">Q / Desc / Size</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {skuRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-slate-500 py-10">
                        No SKU rows for current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    skuRows.slice(0, 30).map((r) => {
                      const active = selectedSku === r.sku;
                      return (
                        <TableRow
                          key={r.sku}
                          className={`cursor-pointer ${active ? "bg-[#F5C742]/15" : ""}`}
                          onClick={() => setSelectedSku(r.sku)}
                        >
                          <TableCell className="font-medium text-[#1E293B]">{r.sku}</TableCell>
                          <TableCell>
                            <div className="text-sm text-[#1E293B]">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.category}{r.brand ? ` â€¢ ${r.brand}` : ""}</div>
                          </TableCell>
                          <TableCell className="text-right">{r.returnedQty}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={r.returnRatePct > 8 ? "bg-red-100 text-red-900" : "bg-slate-100 text-slate-800"}>
                              {r.returnRatePct}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{Math.round(r.refundAmount).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className="bg-slate-100 text-slate-800">{reasonLabel[r.topReason]}</Badge>
                            <div className="text-xs text-slate-500 mt-1">{r.topReasonSharePct}% of returns</div>
                          </TableCell>
                          <TableCell className="text-right text-xs text-slate-700">
                            {r.qualitySharePct}% / {r.descriptionSharePct}% / {r.sizeSharePct}%
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {r.flags.includes("HIGH_RETURN") && <Badge className="bg-red-100 text-red-900">High Return</Badge>}
                              {r.flags.includes("QUALITY_SPIKE") && <Badge className="bg-red-100 text-red-900">Quality</Badge>}
                              {r.flags.includes("DESC_SPIKE") && <Badge className="bg-yellow-100 text-yellow-900">Desc</Badge>}
                              {r.flags.includes("SIZE_SPIKE") && <Badge className="bg-blue-100 text-blue-900">Size</Badge>}
                              {r.flags.length === 0 && <span className="text-xs text-slate-400">OK</span>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected SKU drill-down */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-[#1E293B]">
            Drill-down â€” {selected ? `${selected.sku} (${selected.name})` : "Select a SKU"}
          </CardTitle>
          <CardDescription>Reason trend + evidence signals (photos, QC outcomes)</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {!selected ? (
            <div className="py-8 text-sm text-slate-500 text-center">Select a SKU from the table.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Reason chart for selected */}
              <Card className="bg-[#F7F7FA] border border-slate-200 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[#1E293B]">Reason Mix</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[220px] w-full min-h-[220px]">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={selectedReasonStats} margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis
                          dataKey="reason"
                          tickFormatter={(v) => reasonLabel[v as ReturnReason].split(" ")[0]}
                          interval={0}
                          stroke="#64748B"
                          style={{ fontSize: '11px' }}
                        />
                        <YAxis stroke="#64748B" style={{ fontSize: '12px' }} />
                        <Tooltip
                          formatter={(v: any, _n: any, ctx: any) => {
                            const reason = ctx?.payload?.reason as ReturnReason;
                            return [`${v} units`, reason ? reasonLabel[reason] : ""];
                          }}
                          contentStyle={{
                            backgroundColor: '#FFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="qty" fill="#1E293B" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Evidence/QC */}
              <Card className="bg-[#F7F7FA] border border-slate-200 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[#1E293B]">Evidence & QC</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Cases with photos</span>
                    <Badge className="bg-slate-100 text-slate-800">
                      {pct(selectedReturns.filter((r) => (r.photoUrls?.length ?? 0) > 0).length, selectedReturns.length)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">QC FAIL</span>
                    <Badge className="bg-red-100 text-red-900">
                      {pct(selectedReturns.filter((r) => r.qcResult === "FAIL").length, selectedReturns.length)}%
                    </Badge>
                  </div>
                  <Separator />
                  <div className="text-xs text-slate-700">
                    Recommended policy:
                    <ul className="list-disc pl-4 mt-2 space-y-1">
                      <li>Require photo proof for "Wrong description" & "Damaged" reasons.</li>
                      <li>Auto-route "Quality issues" to supplier/lot tracking (batch).</li>
                      <li>Size issues â†’ prompt size chart + "Fit predictor" + exchange-first flow.</li>
                    </ul>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                      <Camera className="h-4 w-4 mr-2" />
                      View Photos
                    </Button>
                    <Button size="sm" variant="outline" className="bg-white">
                      Open QC Queue
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Alerts + actions */}
              <Card className="bg-[#F7F7FA] border border-slate-200 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[#1E293B]">Alerts & Actions</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {selected.flags.length === 0 ? (
                    <div className="text-sm text-slate-600">No critical alerts for this SKU.</div>
                  ) : (
                    <div className="space-y-2">
                      {selected.flags.map((f) => (
                        <div key={f} className="flex items-start gap-2 rounded-lg bg-white border border-slate-200 p-3">
                          <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
                          <div className="text-xs text-slate-700">
                            {f === "HIGH_RETURN" && <b>High overall return rate.</b>}
                            {f === "QUALITY_SPIKE" && <b>Quality issues dominate returns.</b>}
                            {f === "DESC_SPIKE" && <b>Description mismatch is high.</b>}
                            {f === "SIZE_SPIKE" && <b>Size/Fit issue spike.</b>}
                            <div className="text-slate-500 mt-1">
                              Suggested fix: {f === "DESC_SPIKE" ? "Review images/specs/variant mapping + SEO content." : f === "SIZE_SPIKE" ? "Improve size chart + exchange-first + fit guidance." : "Audit supplier batch + QC + packaging."}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-[#F5C742] text-[#1E293B] hover:bg-[#F5C742]/90">
                      Create Fix Task
                    </Button>
                    <Button size="sm" variant="outline" className="bg-white">
                      Supplier / Batch Audit
                    </Button>
                    <Button size="sm" variant="outline" className="bg-white">
                      Update Product Page
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

