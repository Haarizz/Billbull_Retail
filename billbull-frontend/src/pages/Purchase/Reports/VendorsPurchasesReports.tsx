import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  BarChart3,
  FileSpreadsheet,
  FileText,
  DollarSign,
  Truck,
  Package,
  Shield,
  Clock,
  Activity,
  RefreshCw,
  Receipt,
  Lock,
  Eye,
  XCircle,
  Building2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../../Sales/Reports/ui/card";
import { Button } from "../../Sales/Reports/ui/button";
import { Badge } from "../../Sales/Reports/ui/badge";
import { Separator } from "../../Sales/Reports/ui/separator";
import { Input } from "../../Sales/Reports/ui/input";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getPurchaseReportData } from "../../../api/purchaseReportsApi";
import { exportToExcel } from "../../../utils/exportUtils";
import { generateReportA4Html, printHtml, downloadPdf } from "../../../utils/printGenerator";
import { getCompanyProfile } from "../../../api/companyProfileApi";
import { getBranches } from "../../../api/branchApi";
import { getVendors } from "../../../api/vendorsApi";
import ExportDropdown from "../../../components/common/ExportDropdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportGroupId =
  | "vendor"
  | "lpo"
  | "grn"
  | "grv"
  | "invoice"
  | "payment"
  | "claim"
  | "compliance";

type ReportId =
  // Vendor
  | "vendor-master"
  | "vendor-aging"
  | "vendor-performance"
  | "vendor-price-history"
  | "vendor-contract-compliance"
  // LPO
  | "lpo-register"
  | "lpo-fulfillment"
  | "lpo-aging"
  | "lpo-cancelled"
  // GRN
  | "grn-register"
  | "grn-variance"
  | "grn-batch-expiry"
  | "grn-qc-rejection"
  // GRV
  | "grv-register"
  | "grv-reason-analysis"
  | "grv-replacement-pending"
  | "grv-debit-note-mapping"
  // Invoice
  | "invoice-register"
  | "invoice-grn-variance"
  | "invoice-landed-cost"
  | "invoice-backdated"
  // Payment
  | "payment-register"
  | "payment-aging"
  | "payment-cheque-tracking"
  | "payment-advance"
  // Claim
  | "debit-note-register"
  | "claim-settlement"
  | "vendor-claim-history"
  // Compliance
  | "vat-input-register"
  | "period-lock-violations"
  | "missing-documents"
  | "audit-trail";

type ReportKind = "table" | "table+chart";

// ---------------------------------------------------------------------------
// Report view-model registry — Screen === Print === PDF === Excel
// Every sub-component publishes the exact rows/columns it renders via
// useReportView(). Export handlers read from this registry so there is never
// a mismatch between what is visible and what gets exported.
// ---------------------------------------------------------------------------

type ReportColumnAlign = "left" | "right" | "center";

interface ReportColumn {
  key: string;
  header: string;
  align?: ReportColumnAlign;
  width?: number;
}

interface ReportSection {
  title?: string;
  columns: ReportColumn[];
  rows: ReportPayloadRowVM[];
  totals?: ReportPayloadRowVM | null;
  totalsLabel?: string;
}

interface ReportKpi {
  label: string;
  value: string;
  hint?: string;
}

interface ReportViewModel {
  sections: ReportSection[];
  kpis?: ReportKpi[];
  note?: string;
}

type ReportPayloadRowVM = Record<string, any>;

const purchaseReportViewModels = new Map<ReportId, ReportViewModel>();

function setReportView(reportId: ReportId, vm: ReportViewModel | null) {
  if (vm) purchaseReportViewModels.set(reportId, vm);
  else purchaseReportViewModels.delete(reportId);
}

function getReportView(reportId: ReportId): ReportViewModel | null {
  return purchaseReportViewModels.get(reportId) ?? null;
}

function useReportView(reportId: ReportId, vm: ReportViewModel) {
  setReportView(reportId, vm);
}

function flattenReportView(vm: ReportViewModel | null): {
  columns: ReportColumn[];
  rows: ReportPayloadRowVM[];
} {
  if (!vm || !vm.sections.length) return { columns: [], rows: [] };
  if (vm.sections.length === 1) {
    const section = vm.sections[0];
    const rows = [...section.rows];
    if (section.totals) {
      rows.push({
        ...section.totals,
        [section.columns[0].key]:
          section.totals[section.columns[0].key] ?? section.totalsLabel ?? "TOTAL",
      });
    }
    return { columns: section.columns, rows };
  }
  const columns: ReportColumn[] = [{ key: "__section", header: "Section", align: "left", width: 24 }];
  const seen = new Set<string>(["__section"]);
  vm.sections.forEach((section) =>
    section.columns.forEach((col) => {
      if (!seen.has(col.key)) { seen.add(col.key); columns.push(col); }
    })
  );
  const rows: ReportPayloadRowVM[] = [];
  vm.sections.forEach((section) => {
    section.rows.forEach((row) => rows.push({ __section: section.title ?? "", ...row }));
    if (section.totals) {
      rows.push({
        __section: section.title ?? "",
        ...section.totals,
        [section.columns[0].key]:
          section.totals[section.columns[0].key] ?? section.totalsLabel ?? "TOTAL",
      });
    }
  });
  return { columns, rows };
}

interface ReportDef {
  id: ReportId;
  label: string;
  description: string;
  kind: ReportKind;
  group: ReportGroupId;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Report definitions
// ---------------------------------------------------------------------------

const REPORTS: ReportDef[] = [
  // Vendor
  { id: "vendor-master", label: "Vendor Master Report", description: "Complete vendor master with credit limits and balances", kind: "table+chart", group: "vendor", tags: ["Core", "Master"] },
  { id: "vendor-aging", label: "Vendor Outstanding & Aging", description: "Aging buckets 0-30 / 31-60 / 61-90 / 90+ with credit tracking", kind: "table+chart", group: "vendor", tags: ["Finance", "Aging"] },
  { id: "vendor-performance", label: "Vendor Performance Summary", description: "On-time delivery, return rates, claim rates, settlement days", kind: "table+chart", group: "vendor", tags: ["Analytics", "KPI"] },
  { id: "vendor-price-history", label: "Vendor Price History", description: "Item-wise last 5 purchase prices and cost change %", kind: "table+chart", group: "vendor", tags: ["Pricing"] },
  { id: "vendor-contract-compliance", label: "Vendor Contract Compliance", description: "Contract price vs actual price variance and penalty tracking", kind: "table", group: "vendor", tags: ["Compliance"] },

  // LPO
  { id: "lpo-register", label: "LPO Register", description: "Purchase orders with status and approval tracking", kind: "table", group: "lpo", tags: ["Core", "Purchasing"] },
  { id: "lpo-fulfillment", label: "LPO vs Delivery Fulfillment", description: "Ordered vs delivered quantities with fulfillment %", kind: "table+chart", group: "lpo", tags: ["Analytics"] },
  { id: "lpo-aging", label: "LPO Aging Report", description: "Pending LPOs with aging analysis and overdue highlighting", kind: "table+chart", group: "lpo", tags: ["Aging"] },
  { id: "lpo-cancelled", label: "Cancelled / Modified LPO", description: "Cancelled and modified LPOs with reasons and authorization", kind: "table", group: "lpo", tags: ["Audit"] },

  // GRN
  { id: "grn-register", label: "GRN Register", description: "Goods receipt notes with warehouse and QC status", kind: "table", group: "grn", tags: ["Core", "Warehouse"] },
  { id: "grn-variance", label: "GRN Variance Report", description: "LPO vs GRN quantity and value variance with alerts", kind: "table+chart", group: "grn", tags: ["Audit", "Variance"] },
  { id: "grn-batch-expiry", label: "Batch & Expiry Report", description: "Batch tracking with expiry dates and near-expiry alerts", kind: "table", group: "grn", tags: ["Warehouse", "Compliance"] },
  { id: "grn-qc-rejection", label: "QC Rejection Report", description: "Quality control rejections by reason, warehouse, vendor", kind: "table+chart", group: "grn", tags: ["Quality"] },

  // GRV
  { id: "grv-register", label: "GRV Register", description: "Goods return vouchers with reasons and settlement status", kind: "table", group: "grv", tags: ["Core", "Returns"] },
  { id: "grv-reason-analysis", label: "GRV Reason Analysis", description: "Return reason breakdown: damage, expiry, wrong item, recall", kind: "table+chart", group: "grv", tags: ["Analytics"] },
  { id: "grv-replacement-pending", label: "Replacement Pending Report", description: "Pending replacements with SLA monitoring", kind: "table", group: "grv", tags: ["SLA"] },
  { id: "grv-debit-note-mapping", label: "GRV vs Debit Note Mapping", description: "Link GRVs to debit notes with settlement tracking", kind: "table", group: "grv", tags: ["Finance"] },

  // Invoice
  { id: "invoice-register", label: "Purchase Invoice Register", description: "Invoice register with GRN/LPO references and tax details", kind: "table", group: "invoice", tags: ["Core", "Finance"] },
  { id: "invoice-grn-variance", label: "Invoice vs GRN Variance", description: "Quantity and cost variance between invoices and GRNs", kind: "table+chart", group: "invoice", tags: ["Audit", "Variance"] },
  { id: "invoice-landed-cost", label: "Landed Cost Allocation", description: "Freight, customs, handling charges with NLC per item", kind: "table+chart", group: "invoice", tags: ["Costing"] },
  { id: "invoice-backdated", label: "Backdated Invoice Report", description: "Invoices posted after period with impact analysis", kind: "table", group: "invoice", tags: ["Audit"] },

  // Payment
  { id: "payment-register", label: "Payment Voucher Register", description: "Payment vouchers with mode, status, and bank details", kind: "table", group: "payment", tags: ["Core", "Finance"] },
  { id: "payment-aging", label: "Payment Aging & Delay", description: "Due date vs actual payment with delay analysis", kind: "table+chart", group: "payment", tags: ["Aging", "Finance"] },
  { id: "payment-cheque-tracking", label: "Cheque / PDC Tracking", description: "Post-dated cheques with bank, date, and clearance status", kind: "table", group: "payment", tags: ["Banking"] },
  { id: "payment-advance", label: "Advance Payment Utilization", description: "Vendor advances with adjustment and balance tracking", kind: "table+chart", group: "payment", tags: ["Finance"] },

  // Claim
  { id: "debit-note-register", label: "Debit Note Register", description: "Debit notes with reasons, amounts, and settlement status", kind: "table", group: "claim", tags: ["Core", "Finance"] },
  { id: "claim-settlement", label: "Claim Settlement Status", description: "Claims through issued, accepted, settled, rejected lifecycle", kind: "table+chart", group: "claim", tags: ["Tracking"] },
  { id: "vendor-claim-history", label: "Vendor Claim History", description: "Claim frequency and average settlement days by vendor", kind: "table+chart", group: "claim", tags: ["Analytics"] },

  // Compliance
  { id: "vat-input-register", label: "VAT Input Register (UAE)", description: "Taxable value, VAT amount, TRN, invoice ref for FTA", kind: "table", group: "compliance", tags: ["VAT", "FTA"] },
  { id: "period-lock-violations", label: "Period Lock Violation Report", description: "Backdated postings and override users for audit review", kind: "table", group: "compliance", tags: ["Audit"] },
  { id: "missing-documents", label: "Missing Document Report", description: "GRN without invoice, invoice without GRN, payments without attachments", kind: "table", group: "compliance", tags: ["Audit"] },
  { id: "audit-trail", label: "Audit Trail Report", description: "User actions with timestamps and before/after values", kind: "table", group: "compliance", tags: ["Audit", "Security"] },
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const PIE_COLORS = ["#F5C742", "#3b82f6", "#10b981", "#f97316", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"];

function Tbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="bb-nowrap-table w-full text-[11px] text-left">{children}</table>
    </div>
  );
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-semibold text-slate-700 bg-slate-50 border-b border-slate-200 whitespace-nowrap ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function Td({ children, right, bold, muted }: { children: React.ReactNode; right?: boolean; bold?: boolean; muted?: boolean }) {
  return (
    <td className={`px-3 py-2 border-b border-slate-100 ${right ? "text-right" : ""} ${bold ? "font-semibold" : ""} ${muted ? "text-slate-500" : ""}`}>
      {children}
    </td>
  );
}

function ReportHeader({ title, subtitle, count }: { title: string; subtitle?: string; count?: number }) {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
        {count !== undefined && (
          <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-600">
            {count} records
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Inactive: "bg-slate-100 text-slate-600 border-slate-300",
    Review: "bg-amber-100 text-amber-700 border-amber-300",
    Blocked: "bg-red-100 text-red-700 border-red-300",
    Pending: "bg-blue-100 text-blue-700 border-blue-300",
    Approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Cancelled: "bg-red-100 text-red-700 border-red-300",
    Partial: "bg-amber-100 text-amber-700 border-amber-300",
    Received: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Open: "bg-blue-100 text-blue-700 border-blue-300",
    Closed: "bg-slate-100 text-slate-600 border-slate-300",
    Overdue: "bg-red-100 text-red-700 border-red-300",
    Settled: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Issued: "bg-amber-100 text-amber-700 border-amber-300",
    Rejected: "bg-red-100 text-red-700 border-red-300",
    Cleared: "bg-emerald-100 text-emerald-700 border-emerald-300",
    "In-Transit": "bg-blue-100 text-blue-700 border-blue-300",
    Posted: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Draft: "bg-slate-100 text-slate-600 border-slate-300",
    Paid: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Unpaid: "bg-red-100 text-red-700 border-red-300",
    Pass: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Fail: "bg-red-100 text-red-700 border-red-300",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600 border-slate-300";
  return (
    <Badge variant="outline" className={`text-[10px] ${cls}`}>
      {status}
    </Badge>
  );
}

function amtBadge(amount: number) {
  const color = amount > 0 ? "text-emerald-700" : amount < 0 ? "text-red-600" : "text-slate-600";
  return <span className={`font-semibold ${color}`}>AED {Math.abs(amount).toLocaleString()}</span>;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={`border ${accent ? "border-2 border-[#F5C742] bg-gradient-to-br from-[#FFF6D8] to-white" : "border-slate-200 bg-white"}`}>
      <CardContent className="p-4">
        <div className="text-[10px] font-medium text-slate-600 mb-1">{label}</div>
        <div className="text-lg font-bold text-slate-900">{value}</div>
        {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mock data & Live Hydration
// ---------------------------------------------------------------------------

type ReportPayloadRow = Record<string, any>;

type PurchaseReportPayload = {
  rows?: ReportPayloadRow[];
  charts?: ReportPayloadRow[];
};

function rowsOf(data: PurchaseReportPayload | null): ReportPayloadRow[] {
  return Array.isArray(data?.rows) ? data.rows : [];
}

function n(value: any): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value: any, fallback = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function dateOnly(value: any, fallback = ""): string {
  const raw = asText(value, fallback);
  return raw.length > 10 ? raw.slice(0, 10) : raw;
}

function firstWord(value: any): string {
  return asText(value, "N/A").split(/\s+/)[0] || "N/A";
}

function normalizeRows(rows: ReportPayloadRow[], numericKeys: string[] = []): any[] {
  return rows.map((row) => {
    const next = { ...row };
    for (const key of numericKeys) next[key] = n(next[key]);
    return next;
  });
}

function sumRows(rows: ReportPayloadRow[], key: string): number {
  return rows.reduce((total, row) => total + n(row[key]), 0);
}

function vendorAgingChart(rows: ReportPayloadRow[]) {
  return [
    { name: "0-30 Days", value: sumRows(rows, "d30") },
    { name: "31-60 Days", value: sumRows(rows, "d60") },
    { name: "61-90 Days", value: sumRows(rows, "d90") },
    { name: "90+ Days", value: sumRows(rows, "d90plus") },
  ];
}

function lpoAgingChart(rows: ReportPayloadRow[]) {
  const buckets = [
    { bucket: "0-7 days", count: 0, value: 0 },
    { bucket: "8-15 days", count: 0, value: 0 },
    { bucket: "16-30 days", count: 0, value: 0 },
    { bucket: "31-60 days", count: 0, value: 0 },
    { bucket: "60+ days", count: 0, value: 0 },
  ];
  for (const row of rows) {
    const days = n(row.daysPending);
    const index = days <= 7 ? 0 : days <= 15 ? 1 : days <= 30 ? 2 : days <= 60 ? 3 : 4;
    buckets[index].count += 1;
    buckets[index].value += n(row.value);
  }
  return buckets;
}

function aggregateChart(rows: ReportPayloadRow[], nameKey: string, valueKey: string, outputKey: string) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const name = asText(row[nameKey], "Unassigned");
    grouped.set(name, (grouped.get(name) || 0) + n(row[valueKey]));
  }
  return Array.from(grouped, ([name, value]) => ({ name: firstWord(name), [outputKey]: value }));
}

function reasonChart(rows: ReportPayloadRow[]) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const reason = asText(row.reason, "Unspecified");
    grouped.set(reason, (grouped.get(reason) || 0) + 1);
  }
  return Array.from(grouped, ([reason, count]) => ({ reason, count }));
}

function claimStatusChart(rows: ReportPayloadRow[]) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const status = asText(row.status, "Pending");
    grouped.set(status, (grouped.get(status) || 0) + 1);
  }
  return Array.from(grouped, ([name, value]) => ({ name, value }));
}

export function applyLiveReportData(reportId: ReportId, data: PurchaseReportPayload | null) {
  if (!data) return;
  const rows = rowsOf(data);

  switch (reportId) {
    case "vendor-master":
      mockVendorMaster = normalizeRows(rows, ["creditLimit", "outstanding", "rating"]);
      break;
    case "vendor-aging":
      mockVendorAging = normalizeRows(rows, ["total", "d30", "d60", "d90", "d90plus", "creditLimit"]);
      mockVendorAgingChart = vendorAgingChart(mockVendorAging);
      break;
    case "vendor-performance":
      mockVendorPerf = normalizeRows(rows, ["orders", "onTime", "onTimePct", "returnRate", "claimRate", "avgSettleDays"]);
      mockVendorPerfChart = mockVendorPerf.map((row) => ({ name: firstWord(row.vendor), onTime: n(row.onTimePct), returnRate: n(row.returnRate) }));
      break;
    case "vendor-price-history":
      mockPriceHistory = normalizeRows(rows, ["p1", "p2", "p3", "p4", "p5", "change"]);
      break;
    case "vendor-contract-compliance":
      mockContractCompliance = normalizeRows(rows, ["contractPrice", "actualPrice", "variance", "variancePct"]);
      break;
    case "lpo-register":
      mockLpoRegister = normalizeRows(rows, ["totalItems", "totalValue"]);
      break;
    case "lpo-fulfillment":
      mockLpoFulfillment = normalizeRows(rows, ["orderedQty", "deliveredQty", "pendingQty", "orderedValue", "deliveredValue", "fulfillmentPct"]);
      mockLpoFulfillmentChart = mockLpoFulfillment.map((row) => ({ name: asText(row.lpoNo).slice(-4), ordered: n(row.orderedValue), delivered: n(row.deliveredValue) }));
      break;
    case "lpo-aging":
      mockLpoAging = normalizeRows(rows, ["daysPending", "value"]);
      mockLpoAgingChart = lpoAgingChart(mockLpoAging);
      break;
    case "lpo-cancelled":
      mockLpoCancelled = normalizeRows(rows, ["value"]);
      break;
    case "grn-register":
      mockGrnRegister = normalizeRows(rows, ["items", "receivedQty", "value"]);
      break;
    case "grn-variance":
      mockGrnVariance = normalizeRows(rows, ["lpoQty", "grnQty", "qtyVar", "lpoRate", "grnRate", "valueVar", "variancePct"]);
      mockGrnVarianceChart = aggregateChart(mockGrnVariance, "vendor", "valueVar", "variance");
      break;
    case "grn-batch-expiry":
      mockBatchExpiry = normalizeRows(rows, ["qty", "daysToExpiry"]);
      break;
    case "grn-qc-rejection":
      mockQcRejection = normalizeRows(rows, ["rejectedQty", "value"]);
      mockQcChart = reasonChart(mockQcRejection);
      break;
    case "grv-register":
      mockGrvRegister = normalizeRows(rows, ["items", "value"]);
      break;
    case "grv-reason-analysis":
      mockGrvReasonChart = normalizeRows(rows, ["count", "value"]);
      break;
    case "grv-replacement-pending":
      mockGrvPending = normalizeRows(rows, ["qty", "value", "daysPending"]);
      break;
    case "grv-debit-note-mapping":
      mockGrvDebitNote = normalizeRows(rows, ["grvValue", "dnValue"]);
      break;
    case "invoice-register":
      mockInvoiceRegister = normalizeRows(rows, ["taxableAmt", "vat", "totalAmt"]);
      break;
    case "invoice-grn-variance":
      mockInvGrnVariance = normalizeRows(rows, ["invQty", "grnQty", "qtyVar", "invRate", "grnRate", "rateVar", "valueVar"]);
      mockInvGrnVarianceChart = aggregateChart(mockInvGrnVariance, "vendor", "valueVar", "variance");
      break;
    case "invoice-landed-cost":
      mockLandedCost = normalizeRows(rows, ["invoiceValue", "freight", "customs", "handling", "total", "items", "nlcPerItem"]);
      mockLandedCostChart = mockLandedCost.map((row) => ({
        name: firstWord(row.vendor),
        invoice: n(row.invoiceValue),
        freight: n(row.freight),
        customs: n(row.customs),
        handling: n(row.handling),
      }));
      break;
    case "invoice-backdated":
      mockBackdatedInv = normalizeRows(rows, ["value"]);
      break;
    case "payment-register":
      mockPaymentRegister = normalizeRows(rows, ["amount"]);
      break;
    case "payment-aging":
      mockPaymentAging = rows.map((row) => ({
        vendor: asText(row.vendor, "Unassigned"),
        total: n(row.total),
        overdue0: n(row.overdue0 ?? row.d30),
        overdue30: n(row.overdue30 ?? row.d60),
        overdue60: n(row.overdue60 ?? row.d90),
        overdue90plus: n(row.overdue90plus ?? row.d90plus),
        avgDelay: n(row.avgDelay),
      }));
      mockPaymentAgingChart = mockPaymentAging.map((row) => ({
        name: firstWord(row.vendor),
        current: n(row.overdue0),
        d30: n(row.overdue30),
        d60: n(row.overdue60),
        d90: n(row.overdue90plus),
      }));
      break;
    case "payment-cheque-tracking":
      mockChequeTracking = normalizeRows(rows, ["amount"]);
      break;
    case "payment-advance":
      mockAdvancePayment = normalizeRows(rows, ["advAmount", "adjusted", "balance"]);
      mockAdvChart = mockAdvancePayment.map((row) => ({
        vendor: firstWord(row.vendor),
        advance: n(row.advAmount),
        adjusted: n(row.adjusted),
        balance: n(row.balance),
      }));
      break;
    case "debit-note-register":
      mockDebitNoteRegister = normalizeRows(rows, ["amount"]);
      break;
    case "claim-settlement":
      mockClaimSettlement = normalizeRows(rows, ["amount", "daysToSettle"]);
      mockClaimStatusChart = claimStatusChart(mockClaimSettlement);
      break;
    case "vendor-claim-history":
      mockVendorClaimHistory = normalizeRows(rows, ["totalClaims", "settled", "rejected", "pending", "totalValue", "avgSettleDays"]);
      mockVendorClaimChart = mockVendorClaimHistory.map((row) => ({
        name: firstWord(row.vendor),
        settled: n(row.settled),
        rejected: n(row.rejected),
        pending: n(row.pending),
      }));
      break;
    case "vat-input-register":
      mockVatInput = normalizeRows(rows, ["taxableAmt", "vatAmt", "totalAmt"]);
      break;
    case "period-lock-violations":
      mockPeriodLockViolations = rows.map((row) => ({ ...row, txDate: dateOnly(row.txDate), postDate: dateOnly(row.postDate) }));
      break;
    case "missing-documents":
      mockMissingDocuments = normalizeRows(rows, ["value", "daysOpen"]);
      break;
    case "audit-trail":
      mockAuditTrail = rows.map((row) => ({ ...row, timestamp: asText(row.timestamp).replace("T", " ").slice(0, 19) }));
      break;
    default:
      break;
  }
}


let mockVendorMaster = [
  { code: "VEN-001", name: "Global Supplies LLC", category: "Electronics", trn: "100234567890003", creditLimit: 500000, outstanding: 385000, paymentTerms: "Net 45", status: "Active", rating: 4.5 },
  { code: "VEN-002", name: "Tech Solutions Ltd", category: "IT Equipment", trn: "100234567890004", creditLimit: 400000, outstanding: 312000, paymentTerms: "Net 30", status: "Active", rating: 4.2 },
  { code: "VEN-003", name: "Metro Traders", category: "Food & Beverage", trn: "100234567890005", creditLimit: 350000, outstanding: 175000, paymentTerms: "Net 30", status: "Active", rating: 4.3 },
  { code: "VEN-004", name: "Prime Distributors", category: "General Merchandise", trn: "100234567890006", creditLimit: 300000, outstanding: 88000, paymentTerms: "Net 60", status: "Review", rating: 3.5 },
  { code: "VEN-005", name: "Gulf FMCG Co.", category: "FMCG", trn: "100234567890007", creditLimit: 600000, outstanding: 542000, paymentTerms: "Net 45", status: "Active", rating: 4.7 },
  { code: "VEN-006", name: "Desert Frozen Foods", category: "Frozen", trn: "100234567890008", creditLimit: 200000, outstanding: 198000, paymentTerms: "Net 15", status: "Blocked", rating: 2.8 },
];

let mockVendorAgingChart = [
  { name: "0-30 Days", value: 820000 },
  { name: "31-60 Days", value: 430000 },
  { name: "61-90 Days", value: 190000 },
  { name: "90+ Days", value: 82000 },
];

let mockVendorAging = [
  { vendor: "Global Supplies LLC", total: 385000, d30: 220000, d60: 110000, d90: 40000, d90plus: 15000, creditLimit: 500000, status: "Active" },
  { vendor: "Tech Solutions Ltd", total: 312000, d30: 180000, d60: 95000, d90: 30000, d90plus: 7000, creditLimit: 400000, status: "Active" },
  { vendor: "Metro Traders", total: 175000, d30: 100000, d60: 50000, d90: 20000, d90plus: 5000, creditLimit: 350000, status: "Active" },
  { vendor: "Prime Distributors", total: 88000, d30: 30000, d60: 25000, d90: 20000, d90plus: 13000, creditLimit: 300000, status: "Review" },
  { vendor: "Gulf FMCG Co.", total: 542000, d30: 290000, d60: 150000, d90: 80000, d90plus: 22000, creditLimit: 600000, status: "Active" },
];

let mockVendorPerf = [
  { vendor: "Global Supplies LLC", orders: 42, onTime: 38, onTimePct: 90.5, returnRate: 1.2, claimRate: 0.8, avgSettleDays: 38, score: "A" },
  { vendor: "Tech Solutions Ltd", orders: 35, onTime: 30, onTimePct: 85.7, returnRate: 2.1, claimRate: 1.5, avgSettleDays: 29, score: "B+" },
  { vendor: "Metro Traders", orders: 68, onTime: 64, onTimePct: 94.1, returnRate: 0.8, claimRate: 0.5, avgSettleDays: 28, score: "A+" },
  { vendor: "Prime Distributors", orders: 21, onTime: 14, onTimePct: 66.7, returnRate: 5.2, claimRate: 3.1, avgSettleDays: 52, score: "C" },
  { vendor: "Gulf FMCG Co.", orders: 89, onTime: 83, onTimePct: 93.3, returnRate: 1.1, claimRate: 0.7, avgSettleDays: 35, score: "A" },
  { vendor: "Desert Frozen Foods", orders: 15, onTime: 8, onTimePct: 53.3, returnRate: 8.5, claimRate: 6.2, avgSettleDays: 61, score: "D" },
];

let mockVendorPerfChart = mockVendorPerf.map((r) => ({ name: r.vendor.split(" ")[0], onTime: r.onTimePct, returnRate: r.returnRate }));

let mockPriceHistory = [
  { item: "Nestle Nido 900g", sku: "SKU-1001", vendor: "Gulf FMCG Co.", p1: 42.00, p2: 42.50, p3: 43.00, p4: 43.50, p5: 44.00, change: 4.76 },
  { item: "Ariel Powder 3kg", sku: "SKU-1045", vendor: "Metro Traders", p1: 38.50, p2: 39.00, p3: 39.00, p4: 40.00, p5: 41.25, change: 7.14 },
  { item: "Samsung 50\" TV", sku: "SKU-2012", vendor: "Tech Solutions Ltd", p1: 1850, p2: 1800, p3: 1780, p4: 1750, p5: 1720, change: -7.03 },
  { item: "Heinz Ketchup 570g", sku: "SKU-1088", vendor: "Gulf FMCG Co.", p1: 14.50, p2: 14.75, p3: 15.00, p4: 14.75, p5: 15.25, change: 5.17 },
  { item: "Logitech Keyboard", sku: "SKU-3021", vendor: "Global Supplies LLC", p1: 89.00, p2: 92.00, p3: 91.00, p4: 95.00, p5: 95.00, change: 6.74 },
];

let mockContractCompliance = [
  { vendor: "Gulf FMCG Co.", item: "Nestle Nido 900g", contractPrice: 41.00, actualPrice: 44.00, variance: 3.00, variancePct: 7.32, penaltyApplied: true, status: "Breached" },
  { vendor: "Metro Traders", item: "Ariel Powder 3kg", contractPrice: 39.00, actualPrice: 41.25, variance: 2.25, variancePct: 5.77, penaltyApplied: false, status: "Breached" },
  { vendor: "Global Supplies LLC", item: "Logitech Keyboard", contractPrice: 90.00, actualPrice: 95.00, variance: 5.00, variancePct: 5.56, penaltyApplied: true, status: "Breached" },
  { vendor: "Tech Solutions Ltd", item: "Samsung 50\" TV", contractPrice: 1800, actualPrice: 1720, variance: -80, variancePct: -4.44, penaltyApplied: false, status: "Compliant" },
  { vendor: "Prime Distributors", item: "Generic Box 10kg", contractPrice: 25.00, actualPrice: 25.00, variance: 0, variancePct: 0, penaltyApplied: false, status: "Compliant" },
];

let mockLpoRegister = [
  { lpoNo: "LPO-2026-0421", date: "2026-05-01", vendor: "Gulf FMCG Co.", branch: "Main", totalItems: 12, totalValue: 48500, status: "Approved", approvedBy: "Mohammed Al Rashidi" },
  { lpoNo: "LPO-2026-0422", date: "2026-05-02", vendor: "Metro Traders", branch: "Dubai", totalItems: 8, totalValue: 22300, status: "Received", approvedBy: "Sara Abdullah" },
  { lpoNo: "LPO-2026-0423", date: "2026-05-03", vendor: "Tech Solutions Ltd", branch: "Main", totalItems: 3, totalValue: 15600, status: "Partial", approvedBy: "Ahmed Hassan" },
  { lpoNo: "LPO-2026-0424", date: "2026-05-05", vendor: "Global Supplies LLC", branch: "Abu Dhabi", totalItems: 20, totalValue: 94200, status: "Pending", approvedBy: "-" },
  { lpoNo: "LPO-2026-0425", date: "2026-05-06", vendor: "Desert Frozen Foods", branch: "Main", totalItems: 6, totalValue: 11800, status: "Approved", approvedBy: "Fatima Al Zaabi" },
  { lpoNo: "LPO-2026-0426", date: "2026-05-08", vendor: "Prime Distributors", branch: "Dubai", totalItems: 9, totalValue: 33400, status: "Cancelled", approvedBy: "Mohammed Al Rashidi" },
];

let mockLpoFulfillment = [
  { lpoNo: "LPO-2026-0418", vendor: "Gulf FMCG Co.", orderedQty: 500, deliveredQty: 495, pendingQty: 5, orderedValue: 22000, deliveredValue: 21780, fulfillmentPct: 99.0 },
  { lpoNo: "LPO-2026-0419", vendor: "Metro Traders", orderedQty: 200, deliveredQty: 180, pendingQty: 20, orderedValue: 9200, deliveredValue: 8280, fulfillmentPct: 90.0 },
  { lpoNo: "LPO-2026-0420", vendor: "Tech Solutions Ltd", orderedQty: 30, deliveredQty: 15, pendingQty: 15, orderedValue: 27000, deliveredValue: 13500, fulfillmentPct: 50.0 },
  { lpoNo: "LPO-2026-0421", vendor: "Global Supplies LLC", orderedQty: 800, deliveredQty: 800, pendingQty: 0, orderedValue: 36000, deliveredValue: 36000, fulfillmentPct: 100.0 },
  { lpoNo: "LPO-2026-0422", vendor: "Desert Frozen Foods", orderedQty: 120, deliveredQty: 100, pendingQty: 20, orderedValue: 5400, deliveredValue: 4500, fulfillmentPct: 83.3 },
];

let mockLpoFulfillmentChart = mockLpoFulfillment.map((r) => ({
  name: r.lpoNo.slice(-4),
  ordered: r.orderedValue,
  delivered: r.deliveredValue,
}));

let mockLpoAging = [
  { lpoNo: "LPO-2026-0388", vendor: "Tech Solutions Ltd", issueDate: "2026-03-10", expectedDate: "2026-03-25", daysPending: 58, value: 15600, status: "Overdue" },
  { lpoNo: "LPO-2026-0395", vendor: "Prime Distributors", issueDate: "2026-03-20", expectedDate: "2026-04-05", daysPending: 47, value: 8900, status: "Overdue" },
  { lpoNo: "LPO-2026-0410", vendor: "Global Supplies LLC", issueDate: "2026-04-15", expectedDate: "2026-04-30", daysPending: 22, value: 41200, status: "Pending" },
  { lpoNo: "LPO-2026-0415", vendor: "Metro Traders", issueDate: "2026-04-22", expectedDate: "2026-05-07", daysPending: 15, value: 12500, status: "Pending" },
  { lpoNo: "LPO-2026-0418", vendor: "Desert Frozen Foods", issueDate: "2026-05-01", expectedDate: "2026-05-15", daysPending: 7, value: 6800, status: "Pending" },
];

let mockLpoAgingChart = [
  { bucket: "0-7 days", count: 8, value: 55000 },
  { bucket: "8-15 days", count: 5, value: 38000 },
  { bucket: "16-30 days", count: 4, value: 28000 },
  { bucket: "31-60 days", count: 6, value: 42000 },
  { bucket: "60+ days", count: 2, value: 18000 },
];

let mockLpoCancelled = [
  { lpoNo: "LPO-2026-0380", vendor: "Prime Distributors", date: "2026-04-02", value: 18500, reason: "Vendor price increased beyond budget", cancelledBy: "Mohammed Al Rashidi", status: "Cancelled" },
  { lpoNo: "LPO-2026-0391", vendor: "Desert Frozen Foods", date: "2026-04-10", value: 6200, reason: "Duplicate order", cancelledBy: "Sara Abdullah", status: "Cancelled" },
  { lpoNo: "LPO-2026-0406", vendor: "Tech Solutions Ltd", date: "2026-04-20", value: 32000, reason: "Budget reallocation", cancelledBy: "Ahmed Hassan", status: "Cancelled" },
  { lpoNo: "LPO-2026-0426", vendor: "Prime Distributors", date: "2026-05-08", value: 33400, reason: "Vendor out of stock", cancelledBy: "Mohammed Al Rashidi", status: "Cancelled" },
];

let mockGrnRegister = [
  { grnNo: "GRN-2026-0812", date: "2026-05-02", lpoNo: "LPO-2026-0418", vendor: "Gulf FMCG Co.", warehouse: "Main WH", items: 12, receivedQty: 495, value: 21780, qcStatus: "Pass", status: "Posted" },
  { grnNo: "GRN-2026-0813", date: "2026-05-03", lpoNo: "LPO-2026-0419", vendor: "Metro Traders", warehouse: "Dubai WH", items: 8, receivedQty: 180, value: 8280, qcStatus: "Pass", status: "Posted" },
  { grnNo: "GRN-2026-0814", date: "2026-05-05", lpoNo: "LPO-2026-0420", vendor: "Tech Solutions Ltd", warehouse: "Main WH", items: 3, receivedQty: 15, value: 13500, qcStatus: "Fail", status: "On Hold" },
  { grnNo: "GRN-2026-0815", date: "2026-05-07", lpoNo: "LPO-2026-0421", vendor: "Global Supplies LLC", warehouse: "Abu Dhabi WH", items: 20, receivedQty: 800, value: 36000, qcStatus: "Pass", status: "Posted" },
  { grnNo: "GRN-2026-0816", date: "2026-05-09", lpoNo: "LPO-2026-0422", vendor: "Desert Frozen Foods", warehouse: "Main WH", items: 6, receivedQty: 100, value: 4500, qcStatus: "Partial", status: "Pending" },
];

let mockGrnVariance = [
  { grnNo: "GRN-2026-0813", vendor: "Metro Traders", item: "Ariel Powder 3kg", lpoQty: 200, grnQty: 180, qtyVar: -20, lpoRate: 41.25, grnRate: 41.25, valueVar: -825, variancePct: -10.0 },
  { grnNo: "GRN-2026-0814", vendor: "Tech Solutions Ltd", item: "Samsung 50\" TV", lpoQty: 30, grnQty: 15, qtyVar: -15, lpoRate: 1720, grnRate: 1750, valueVar: 8700, variancePct: 16.7 },
  { grnNo: "GRN-2026-0816", vendor: "Desert Frozen Foods", item: "Frozen Chicken 1kg", lpoQty: 120, grnQty: 100, qtyVar: -20, lpoRate: 45, grnRate: 45, valueVar: -900, variancePct: -16.7 },
];

let mockGrnVarianceChart = [
  { name: "Metro Traders", variance: -825 },
  { name: "Tech Solutions", variance: 8700 },
  { name: "Desert Frozen", variance: -900 },
];

let mockBatchExpiry = [
  { grnNo: "GRN-2026-0812", item: "Nestle Nido 900g", batchNo: "B2026-441", mfgDate: "2026-02-01", expiryDate: "2027-02-01", qty: 200, warehouse: "Main WH", status: "Active", daysToExpiry: 256 },
  { grnNo: "GRN-2026-0812", item: "Heinz Ketchup 570g", batchNo: "B2026-312", mfgDate: "2025-12-01", expiryDate: "2026-06-01", qty: 50, warehouse: "Main WH", status: "Near Expiry", daysToExpiry: 10 },
  { grnNo: "GRN-2026-0813", item: "Ariel Powder 3kg", batchNo: "B2026-188", mfgDate: "2026-01-01", expiryDate: "2028-01-01", qty: 180, warehouse: "Dubai WH", status: "Active", daysToExpiry: 621 },
  { grnNo: "GRN-2026-0815", item: "Logitech Keyboard", batchNo: "B2026-901", mfgDate: "2026-03-01", expiryDate: "2029-03-01", qty: 50, warehouse: "Abu Dhabi WH", status: "Active", daysToExpiry: 1013 },
  { grnNo: "GRN-2026-0816", item: "Frozen Chicken 1kg", batchNo: "B2026-211", mfgDate: "2026-04-15", expiryDate: "2026-07-15", qty: 100, warehouse: "Main WH", status: "Active", daysToExpiry: 54 },
];

let mockQcRejection = [
  { grnNo: "GRN-2026-0814", vendor: "Tech Solutions Ltd", item: "Samsung 50\" TV", rejectedQty: 3, reason: "Physical damage", warehouse: "Main WH", date: "2026-05-05", value: 5250, action: "Return to Vendor" },
  { grnNo: "GRN-2026-0810", vendor: "Desert Frozen Foods", item: "Frozen Beef 1kg", rejectedQty: 12, reason: "Cold chain breach", warehouse: "Main WH", date: "2026-04-28", value: 540, action: "Disposed" },
  { grnNo: "GRN-2026-0802", vendor: "Prime Distributors", item: "Generic Box 10kg", rejectedQty: 5, reason: "Wrong specification", warehouse: "Dubai WH", date: "2026-04-18", value: 125, action: "Return to Vendor" },
];

let mockQcChart = [
  { reason: "Physical Damage", count: 5 },
  { reason: "Cold Chain", count: 3 },
  { reason: "Wrong Spec", count: 4 },
  { reason: "Expired", count: 2 },
  { reason: "Contamination", count: 1 },
];

let mockGrvRegister = [
  { grvNo: "GRV-2026-0085", date: "2026-05-06", grnNo: "GRN-2026-0814", vendor: "Tech Solutions Ltd", items: 3, value: 5250, reason: "Damage", status: "Settled", debitNote: "DN-2026-042" },
  { grvNo: "GRV-2026-0086", date: "2026-05-07", grnNo: "GRN-2026-0810", vendor: "Desert Frozen Foods", items: 12, value: 540, reason: "Cold Chain", status: "Pending", debitNote: "-" },
  { grvNo: "GRV-2026-0087", date: "2026-05-08", grnNo: "GRN-2026-0802", vendor: "Prime Distributors", items: 5, value: 125, reason: "Wrong Item", status: "Issued", debitNote: "-" },
  { grvNo: "GRV-2026-0088", date: "2026-05-10", grnNo: "GRN-2026-0812", vendor: "Gulf FMCG Co.", items: 2, value: 88, reason: "Near Expiry", status: "Issued", debitNote: "-" },
  { grvNo: "GRV-2026-0089", date: "2026-05-12", grnNo: "GRN-2026-0815", vendor: "Global Supplies LLC", items: 1, value: 95, reason: "Wrong Spec", status: "Settled", debitNote: "DN-2026-043" },
];

let mockGrvReasonChart = [
  { reason: "Damage", count: 5, value: 12500 },
  { reason: "Cold Chain", count: 3, value: 1620 },
  { reason: "Wrong Item", count: 4, value: 2800 },
  { reason: "Near Expiry", count: 6, value: 3240 },
  { reason: "Wrong Spec", count: 2, value: 950 },
];

let mockGrvPending = [
  { grvNo: "GRV-2026-0086", vendor: "Desert Frozen Foods", item: "Frozen Beef 1kg", qty: 12, value: 540, grvDate: "2026-05-07", slaDate: "2026-05-14", daysPending: 8, status: "Overdue" },
  { grvNo: "GRV-2026-0087", vendor: "Prime Distributors", item: "Generic Box 10kg", qty: 5, value: 125, grvDate: "2026-05-08", slaDate: "2026-05-22", daysPending: 14, status: "Pending" },
  { grvNo: "GRV-2026-0088", vendor: "Gulf FMCG Co.", item: "Heinz Ketchup 570g", qty: 2, value: 88, grvDate: "2026-05-10", slaDate: "2026-05-24", daysPending: 12, status: "Pending" },
];

let mockGrvDebitNote = [
  { grvNo: "GRV-2026-0085", vendor: "Tech Solutions Ltd", grvValue: 5250, debitNote: "DN-2026-042", dnValue: 5250, matched: true, settledDate: "2026-05-15", status: "Settled" },
  { grvNo: "GRV-2026-0089", vendor: "Global Supplies LLC", grvValue: 95, debitNote: "DN-2026-043", dnValue: 95, matched: true, settledDate: "2026-05-18", status: "Settled" },
  { grvNo: "GRV-2026-0086", vendor: "Desert Frozen Foods", grvValue: 540, debitNote: "-", dnValue: 0, matched: false, settledDate: "-", status: "Pending" },
  { grvNo: "GRV-2026-0087", vendor: "Prime Distributors", grvValue: 125, debitNote: "-", dnValue: 0, matched: false, settledDate: "-", status: "Pending" },
];

let mockInvoiceRegister = [
  { invNo: "INV-V-2026-1821", date: "2026-05-03", vendor: "Gulf FMCG Co.", grnRef: "GRN-2026-0812", lpoRef: "LPO-2026-0418", taxableAmt: 20743, vat: 1037, totalAmt: 21780, status: "Posted", dueDate: "2026-06-17" },
  { invNo: "INV-V-2026-1822", date: "2026-05-04", vendor: "Metro Traders", grnRef: "GRN-2026-0813", lpoRef: "LPO-2026-0419", taxableAmt: 7886, vat: 394, totalAmt: 8280, status: "Posted", dueDate: "2026-06-03" },
  { invNo: "INV-V-2026-1823", date: "2026-05-06", vendor: "Tech Solutions Ltd", grnRef: "GRN-2026-0814", lpoRef: "LPO-2026-0420", taxableAmt: 12857, vat: 643, totalAmt: 13500, status: "On Hold", dueDate: "2026-06-05" },
  { invNo: "INV-V-2026-1824", date: "2026-05-08", vendor: "Global Supplies LLC", grnRef: "GRN-2026-0815", lpoRef: "LPO-2026-0421", taxableAmt: 34286, vat: 1714, totalAmt: 36000, status: "Posted", dueDate: "2026-06-22" },
  { invNo: "INV-V-2026-1825", date: "2026-05-10", vendor: "Desert Frozen Foods", grnRef: "GRN-2026-0816", lpoRef: "LPO-2026-0422", taxableAmt: 4286, vat: 214, totalAmt: 4500, status: "Draft", dueDate: "2026-05-25" },
];

let mockInvGrnVariance = [
  { invNo: "INV-V-2026-1822", vendor: "Metro Traders", grnNo: "GRN-2026-0813", invQty: 180, grnQty: 180, qtyVar: 0, invRate: 46.00, grnRate: 41.25, rateVar: 4.75, valueVar: 855, status: "Variance" },
  { invNo: "INV-V-2026-1823", vendor: "Tech Solutions Ltd", grnNo: "GRN-2026-0814", invQty: 15, grnQty: 15, qtyVar: 0, invRate: 1800, grnRate: 1750, rateVar: 50, valueVar: 750, status: "Variance" },
  { invNo: "INV-V-2026-1821", vendor: "Gulf FMCG Co.", grnNo: "GRN-2026-0812", invQty: 495, grnQty: 495, qtyVar: 0, invRate: 44.00, grnRate: 44.00, rateVar: 0, valueVar: 0, status: "Matched" },
  { invNo: "INV-V-2026-1824", vendor: "Global Supplies LLC", grnNo: "GRN-2026-0815", invQty: 800, grnQty: 800, qtyVar: 0, invRate: 45.00, grnRate: 45.00, rateVar: 0, valueVar: 0, status: "Matched" },
];

let mockInvGrnVarianceChart = [
  { name: "Metro Traders", variance: 855 },
  { name: "Tech Solutions", variance: 750 },
  { name: "Gulf FMCG", variance: 0 },
  { name: "Global Supplies", variance: 0 },
];

let mockLandedCost = [
  { invNo: "INV-V-2026-1821", vendor: "Gulf FMCG Co.", invoiceValue: 21780, freight: 650, customs: 320, handling: 180, total: 22930, items: 12, nlcPerItem: 1910.83 },
  { invNo: "INV-V-2026-1822", vendor: "Metro Traders", invoiceValue: 8280, freight: 220, customs: 0, handling: 80, total: 8580, items: 8, nlcPerItem: 1072.5 },
  { invNo: "INV-V-2026-1824", vendor: "Global Supplies LLC", invoiceValue: 36000, freight: 1200, customs: 2800, handling: 400, total: 40400, items: 20, nlcPerItem: 2020 },
];

let mockLandedCostChart = mockLandedCost.map((r) => ({
  name: r.vendor.split(" ")[0],
  invoice: r.invoiceValue,
  freight: r.freight,
  customs: r.customs,
  handling: r.handling,
}));

let mockBackdatedInv = [
  { invNo: "INV-V-2026-1790", invDate: "2026-04-02", postDate: "2026-05-05", vendor: "Prime Distributors", value: 8900, postedBy: "Ahmed Hassan", period: "Apr-2026", status: "Backdated" },
  { invNo: "INV-V-2026-1812", invDate: "2026-04-18", postDate: "2026-05-10", vendor: "Desert Frozen Foods", value: 3200, postedBy: "Sara Abdullah", period: "Apr-2026", status: "Backdated" },
];

let mockPaymentRegister = [
  { pvNo: "PV-2026-0621", date: "2026-05-05", vendor: "Gulf FMCG Co.", invRef: "INV-V-2026-1801", mode: "Bank Transfer", bank: "Emirates NBD", amount: 45000, status: "Paid" },
  { pvNo: "PV-2026-0622", date: "2026-05-07", vendor: "Metro Traders", invRef: "INV-V-2026-1808", mode: "Cheque", bank: "FAB", amount: 18500, status: "Cleared" },
  { pvNo: "PV-2026-0623", date: "2026-05-08", vendor: "Tech Solutions Ltd", invRef: "INV-V-2026-1812", mode: "Bank Transfer", bank: "ADIB", amount: 28000, status: "Paid" },
  { pvNo: "PV-2026-0624", date: "2026-05-10", vendor: "Global Supplies LLC", invRef: "INV-V-2026-1815", mode: "PDC", bank: "Mashreq", amount: 60000, status: "Pending" },
  { pvNo: "PV-2026-0625", date: "2026-05-12", vendor: "Desert Frozen Foods", invRef: "INV-V-2026-1821", mode: "Cash", bank: "-", amount: 4500, status: "Paid" },
  { pvNo: "PV-2026-0626", date: "2026-05-14", vendor: "Prime Distributors", invRef: "INV-V-2026-1822", mode: "Bank Transfer", bank: "Emirates NBD", amount: 22000, status: "Paid" },
];

let mockPaymentAging = [
  { vendor: "Gulf FMCG Co.", total: 542000, overdue0: 120000, overdue30: 210000, overdue60: 155000, overdue90plus: 57000, avgDelay: 12 },
  { vendor: "Global Supplies LLC", total: 385000, overdue0: 150000, overdue30: 140000, overdue60: 70000, overdue90plus: 25000, avgDelay: 8 },
  { vendor: "Tech Solutions Ltd", total: 312000, overdue0: 80000, overdue30: 120000, overdue60: 82000, overdue90plus: 30000, avgDelay: 15 },
  { vendor: "Metro Traders", total: 175000, overdue0: 90000, overdue30: 55000, overdue60: 20000, overdue90plus: 10000, avgDelay: 5 },
  { vendor: "Prime Distributors", total: 88000, overdue0: 20000, overdue30: 30000, overdue60: 25000, overdue90plus: 13000, avgDelay: 22 },
];

let mockPaymentAgingChart = mockPaymentAging.map((r) => ({
  name: r.vendor.split(" ")[0],
  current: r.overdue0,
  d30: r.overdue30,
  d60: r.overdue60,
  d90: r.overdue90plus,
}));

let mockChequeTracking = [
  { chequeNo: "CHQ-0045821", vendor: "Metro Traders", bank: "FAB", branch: "Deira", amount: 18500, chequeDate: "2026-05-07", pvNo: "PV-2026-0622", status: "Cleared", clearedDate: "2026-05-09" },
  { chequeNo: "CHQ-0045890", vendor: "Global Supplies LLC", bank: "Mashreq", branch: "Bur Dubai", amount: 60000, chequeDate: "2026-06-10", pvNo: "PV-2026-0624", status: "Pending", clearedDate: "-" },
  { chequeNo: "CHQ-0045710", vendor: "Prime Distributors", bank: "Emirates NBD", branch: "Al Quoz", amount: 22000, chequeDate: "2026-05-20", pvNo: "PV-2026-0626", status: "Pending", clearedDate: "-" },
  { chequeNo: "CHQ-0045600", vendor: "Tech Solutions Ltd", bank: "ADIB", branch: "Sharjah", amount: 12000, chequeDate: "2026-05-01", pvNo: "PV-2026-0610", status: "Bounced", clearedDate: "-" },
];

let mockAdvancePayment = [
  { pvNo: "ADV-2026-012", vendor: "Gulf FMCG Co.", advDate: "2026-04-10", advAmount: 100000, adjusted: 85000, balance: 15000, lastAdj: "2026-05-05", status: "Open" },
  { pvNo: "ADV-2026-013", vendor: "Global Supplies LLC", advDate: "2026-04-15", advAmount: 50000, adjusted: 50000, balance: 0, lastAdj: "2026-05-08", status: "Closed" },
  { pvNo: "ADV-2026-014", vendor: "Metro Traders", advDate: "2026-05-01", advAmount: 30000, adjusted: 18280, balance: 11720, lastAdj: "2026-05-04", status: "Open" },
];

let mockAdvChart = [
  { vendor: "Gulf FMCG", advance: 100000, adjusted: 85000, balance: 15000 },
  { vendor: "Global Supplies", advance: 50000, adjusted: 50000, balance: 0 },
  { vendor: "Metro Traders", advance: 30000, adjusted: 18280, balance: 11720 },
];

let mockDebitNoteRegister = [
  { dnNo: "DN-2026-042", date: "2026-05-12", vendor: "Tech Solutions Ltd", grvNo: "GRV-2026-0085", reason: "Damaged Goods", amount: 5250, status: "Settled", settledDate: "2026-05-15" },
  { dnNo: "DN-2026-043", date: "2026-05-14", vendor: "Global Supplies LLC", grvNo: "GRV-2026-0089", reason: "Wrong Specification", amount: 95, status: "Settled", settledDate: "2026-05-18" },
  { dnNo: "DN-2026-044", date: "2026-05-16", vendor: "Desert Frozen Foods", grvNo: "GRV-2026-0086", reason: "Cold Chain Breach", amount: 540, status: "Issued", settledDate: "-" },
  { dnNo: "DN-2026-045", date: "2026-05-18", vendor: "Prime Distributors", grvNo: "GRV-2026-0087", reason: "Wrong Item", amount: 125, status: "Issued", settledDate: "-" },
  { dnNo: "DN-2026-040", date: "2026-05-05", vendor: "Gulf FMCG Co.", grvNo: "GRV-2026-0082", reason: "Near Expiry Return", amount: 1100, status: "Rejected", settledDate: "-" },
];

let mockClaimSettlement = [
  { claimNo: "CLM-2026-018", vendor: "Tech Solutions Ltd", amount: 5250, issueDate: "2026-05-06", settleDate: "2026-05-15", daysToSettle: 9, status: "Settled" },
  { claimNo: "CLM-2026-019", vendor: "Global Supplies LLC", amount: 95, issueDate: "2026-05-08", settleDate: "2026-05-18", daysToSettle: 10, status: "Settled" },
  { claimNo: "CLM-2026-020", vendor: "Desert Frozen Foods", amount: 540, issueDate: "2026-05-10", settleDate: "-", daysToSettle: 12, status: "Pending" },
  { claimNo: "CLM-2026-021", vendor: "Prime Distributors", amount: 125, issueDate: "2026-05-12", settleDate: "-", daysToSettle: 10, status: "Issued" },
  { claimNo: "CLM-2026-016", vendor: "Gulf FMCG Co.", amount: 1100, issueDate: "2026-05-01", settleDate: "-", daysToSettle: 21, status: "Rejected" },
];

let mockClaimStatusChart = [
  { name: "Settled", value: 8 },
  { name: "Issued", value: 3 },
  { name: "Pending", value: 4 },
  { name: "Rejected", value: 2 },
];

let mockVendorClaimHistory = [
  { vendor: "Gulf FMCG Co.", totalClaims: 12, settled: 9, rejected: 2, pending: 1, totalValue: 28500, avgSettleDays: 11, lastClaimDate: "2026-05-01" },
  { vendor: "Tech Solutions Ltd", totalClaims: 8, settled: 5, rejected: 1, pending: 2, totalValue: 18200, avgSettleDays: 14, lastClaimDate: "2026-05-06" },
  { vendor: "Metro Traders", totalClaims: 4, settled: 4, rejected: 0, pending: 0, totalValue: 5400, avgSettleDays: 8, lastClaimDate: "2026-04-20" },
  { vendor: "Desert Frozen Foods", totalClaims: 6, settled: 2, rejected: 1, pending: 3, totalValue: 9800, avgSettleDays: 22, lastClaimDate: "2026-05-10" },
  { vendor: "Prime Distributors", totalClaims: 3, settled: 1, rejected: 1, pending: 1, totalValue: 2800, avgSettleDays: 18, lastClaimDate: "2026-05-12" },
];

let mockVendorClaimChart = mockVendorClaimHistory.map((r) => ({
  name: r.vendor.split(" ")[0],
  settled: r.settled,
  rejected: r.rejected,
  pending: r.pending,
}));

let mockVatInput = [
  { invNo: "INV-V-2026-1821", invDate: "2026-05-03", vendor: "Gulf FMCG Co.", trn: "100234567890007", taxableAmt: 20743, vatAmt: 1037, totalAmt: 21780, vatRate: "5%", period: "May-2026" },
  { invNo: "INV-V-2026-1822", invDate: "2026-05-04", vendor: "Metro Traders", trn: "100234567890005", taxableAmt: 7886, vatAmt: 394, totalAmt: 8280, vatRate: "5%", period: "May-2026" },
  { invNo: "INV-V-2026-1823", invDate: "2026-05-06", vendor: "Tech Solutions Ltd", trn: "100234567890004", taxableAmt: 12857, vatAmt: 643, totalAmt: 13500, vatRate: "5%", period: "May-2026" },
  { invNo: "INV-V-2026-1824", invDate: "2026-05-08", vendor: "Global Supplies LLC", trn: "100234567890003", taxableAmt: 34286, vatAmt: 1714, totalAmt: 36000, vatRate: "5%", period: "May-2026" },
  { invNo: "INV-V-2026-1825", invDate: "2026-05-10", vendor: "Desert Frozen Foods", trn: "100234567890008", taxableAmt: 4286, vatAmt: 214, totalAmt: 4500, vatRate: "5%", period: "May-2026" },
];

let mockPeriodLockViolations = [
  { refNo: "INV-V-2026-1790", type: "Purchase Invoice", txDate: "2026-04-02", postDate: "2026-05-05", lockedPeriod: "Apr-2026", user: "Ahmed Hassan", reason: "Late invoice from vendor" },
  { refNo: "PV-2026-0601", type: "Payment Voucher", txDate: "2026-04-15", postDate: "2026-05-08", lockedPeriod: "Apr-2026", user: "Sara Abdullah", reason: "Cheque bounce rebook" },
  { refNo: "GRN-2026-0800", type: "GRN", txDate: "2026-04-20", postDate: "2026-05-11", lockedPeriod: "Apr-2026", user: "Mohammed Al Rashidi", reason: "System delay" },
];

let mockMissingDocuments = [
  { refNo: "GRN-2026-0814", type: "GRN without Invoice", vendor: "Tech Solutions Ltd", date: "2026-05-05", value: 13500, daysOpen: 17, status: "Critical" },
  { refNo: "GRN-2026-0816", type: "GRN without Invoice", vendor: "Desert Frozen Foods", date: "2026-05-09", value: 4500, daysOpen: 13, status: "Warning" },
  { refNo: "PV-2026-0624", type: "Payment without Attachment", vendor: "Global Supplies LLC", date: "2026-05-10", value: 60000, daysOpen: 12, status: "Critical" },
  { refNo: "INV-V-2026-1825", type: "Invoice without GRN", vendor: "Desert Frozen Foods", date: "2026-05-10", value: 4500, daysOpen: 12, status: "Warning" },
  { refNo: "LPO-2026-0424", type: "LPO without Approval", vendor: "Global Supplies LLC", date: "2026-05-05", value: 94200, daysOpen: 17, status: "Critical" },
];

let mockAuditTrail = [
  { timestamp: "2026-05-22 09:12:34", user: "Ahmed Hassan", action: "Edit", module: "Purchase Invoice", refNo: "INV-V-2026-1823", field: "Unit Rate", before: "1720.00", after: "1750.00" },
  { timestamp: "2026-05-22 08:45:10", user: "Sara Abdullah", action: "Delete", module: "GRN", refNo: "GRN-2026-0816", field: "Status", before: "Draft", after: "Deleted" },
  { timestamp: "2026-05-21 17:30:55", user: "Mohammed Al Rashidi", action: "Approve", module: "LPO", refNo: "LPO-2026-0425", field: "Status", before: "Pending", after: "Approved" },
  { timestamp: "2026-05-21 16:12:22", user: "Fatima Al Zaabi", action: "Create", module: "Debit Note", refNo: "DN-2026-045", field: "-", before: "-", after: "Created" },
  { timestamp: "2026-05-21 14:08:01", user: "Ahmed Hassan", action: "Edit", module: "Vendor Master", refNo: "VEN-006", field: "Credit Limit", before: "250000", after: "200000" },
  { timestamp: "2026-05-20 11:55:44", user: "Sara Abdullah", action: "Post", module: "Payment Voucher", refNo: "PV-2026-0623", field: "Status", before: "Draft", after: "Posted" },
];

function clearInitialPurchaseReportData() {
  mockVendorMaster = [];
  mockVendorAgingChart = [];
  mockVendorAging = [];
  mockVendorPerf = [];
  mockVendorPerfChart = [];
  mockPriceHistory = [];
  mockContractCompliance = [];
  mockLpoRegister = [];
  mockLpoFulfillment = [];
  mockLpoFulfillmentChart = [];
  mockLpoAging = [];
  mockLpoAgingChart = [];
  mockLpoCancelled = [];
  mockGrnRegister = [];
  mockGrnVariance = [];
  mockGrnVarianceChart = [];
  mockBatchExpiry = [];
  mockQcRejection = [];
  mockQcChart = [];
  mockGrvRegister = [];
  mockGrvReasonChart = [];
  mockGrvPending = [];
  mockGrvDebitNote = [];
  mockInvoiceRegister = [];
  mockInvGrnVariance = [];
  mockInvGrnVarianceChart = [];
  mockLandedCost = [];
  mockLandedCostChart = [];
  mockBackdatedInv = [];
  mockPaymentRegister = [];
  mockPaymentAging = [];
  mockPaymentAgingChart = [];
  mockChequeTracking = [];
  mockAdvancePayment = [];
  mockAdvChart = [];
  mockDebitNoteRegister = [];
  mockClaimSettlement = [];
  mockClaimStatusChart = [];
  mockVendorClaimHistory = [];
  mockVendorClaimChart = [];
  mockVatInput = [];
  mockPeriodLockViolations = [];
  mockMissingDocuments = [];
  mockAuditTrail = [];
}

clearInitialPurchaseReportData();

const DataRevisionContext = React.createContext(0);
function useDataRevision() { return React.useContext(DataRevisionContext); }

// ---------------------------------------------------------------------------
// Individual report components
// ---------------------------------------------------------------------------

function VendorMasterReport() {
  useDataRevision();
  const total = mockVendorMaster.reduce((s, r) => s + r.outstanding, 0);
  const creditTotal = mockVendorMaster.reduce((s, r) => s + r.creditLimit, 0);
  useReportView("vendor-master", {
    kpis: [
      { label: "Total Vendors", value: String(mockVendorMaster.length) },
      { label: "Total Outstanding", value: `AED ${total.toLocaleString()}` },
      { label: "Total Credit Limit", value: `AED ${creditTotal.toLocaleString()}` },
    ],
    sections: [{
      title: "Vendor Master Report",
      columns: [
        { key: "code", header: "Code", align: "left", width: 12 },
        { key: "name", header: "Vendor Name", align: "left", width: 22 },
        { key: "category", header: "Category", align: "left", width: 18 },
        { key: "trn", header: "TRN", align: "left", width: 16 },
        { key: "creditLimit", header: "Credit Limit (AED)", align: "right", width: 16 },
        { key: "outstanding", header: "Outstanding (AED)", align: "right", width: 16 },
        { key: "paymentTerms", header: "Terms", align: "left", width: 12 },
        { key: "status", header: "Status", align: "left", width: 10 },
        { key: "rating", header: "Rating", align: "right", width: 8 },
      ],
      rows: mockVendorMaster.map((r) => ({
        code: r.code, name: r.name, category: r.category, trn: r.trn,
        creditLimit: r.creditLimit.toLocaleString(), outstanding: r.outstanding.toLocaleString(),
        paymentTerms: r.paymentTerms, status: r.status, rating: r.rating,
      })),
      totals: { code: "TOTAL", creditLimit: creditTotal.toLocaleString(), outstanding: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Vendor Master Report" subtitle="Active and inactive vendors with credit details" count={mockVendorMaster.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Vendors" value={String(mockVendorMaster.length)} sub="In system" accent />
        <KpiCard label="Total Outstanding" value={`AED ${total.toLocaleString()}`} sub="All vendors" />
        <KpiCard label="Total Credit Limit" value={`AED ${creditTotal.toLocaleString()}`} sub="Aggregate limit" />
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Outstanding by Category</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockVendorMaster.map((r) => ({ name: r.name.split(" ")[0], outstanding: r.outstanding, limit: r.creditLimit }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: "11px" }} />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              <Bar dataKey="limit" name="Credit Limit" fill="#e2e8f0" />
              <Bar dataKey="outstanding" name="Outstanding" fill="#F5C742" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="max-h-[320px] overflow-y-auto">
          <table className="bb-nowrap-table w-full text-[11px] text-left">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <Th>Code</Th>
                <Th>Vendor Name</Th>
                <Th>Category</Th>
                <Th>TRN</Th>
                <Th right>Credit Limit (AED)</Th>
                <Th right>Outstanding (AED)</Th>
                <Th>Terms</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {mockVendorMaster.map((r) => (
                <tr key={r.code} className="hover:bg-slate-50">
                  <Td bold>{r.code}</Td>
                  <Td>{r.name}</Td>
                  <Td muted>{r.category}</Td>
                  <Td muted>{r.trn}</Td>
                  <Td right>{r.creditLimit.toLocaleString()}</Td>
                  <Td right bold>{r.outstanding.toLocaleString()}</Td>
                  <Td muted>{r.paymentTerms}</Td>
                  <Td>{statusBadge(r.status)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function VendorAgingReport() {
  useDataRevision();
  const totals = mockVendorAging.reduce((s, r) => ({ total: s.total + r.total, d30: s.d30 + r.d30, d60: s.d60 + r.d60, d90: s.d90 + r.d90, d90plus: s.d90plus + r.d90plus }), { total: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 });
  useReportView("vendor-aging", {
    kpis: [
      { label: "Total Payable", value: `AED ${totals.total.toLocaleString()}` },
      { label: "0–30 Days", value: `AED ${totals.d30.toLocaleString()}` },
      { label: "31–90 Days", value: `AED ${(totals.d60 + totals.d90).toLocaleString()}` },
      { label: "90+ Days", value: `AED ${totals.d90plus.toLocaleString()}` },
    ],
    sections: [{
      title: "Vendor Outstanding & Aging",
      columns: [
        { key: "vendor", header: "Vendor", align: "left", width: 22 },
        { key: "total", header: "Total (AED)", align: "right", width: 14 },
        { key: "d30", header: "0-30 Days", align: "right", width: 12 },
        { key: "d60", header: "31-60 Days", align: "right", width: 12 },
        { key: "d90", header: "61-90 Days", align: "right", width: 12 },
        { key: "d90plus", header: "90+ Days", align: "right", width: 12 },
        { key: "creditLimit", header: "Credit Limit", align: "right", width: 14 },
        { key: "status", header: "Status", align: "left", width: 10 },
      ],
      rows: mockVendorAging.map((r) => ({
        vendor: r.vendor, total: r.total.toLocaleString(), d30: r.d30.toLocaleString(),
        d60: r.d60.toLocaleString(), d90: r.d90.toLocaleString(), d90plus: r.d90plus.toLocaleString(),
        creditLimit: r.creditLimit.toLocaleString(), status: r.status,
      })),
      totals: {
        vendor: "TOTAL",
        total: totals.total.toLocaleString(), d30: totals.d30.toLocaleString(),
        d60: totals.d60.toLocaleString(), d90: totals.d90.toLocaleString(), d90plus: totals.d90plus.toLocaleString(),
      },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Vendor Outstanding & Aging" subtitle="Payable aging analysis across all vendors" count={mockVendorAging.length} />
      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Total Payable" value={`AED ${totals.total.toLocaleString()}`} sub="All vendors" accent />
        <KpiCard label="0–30 Days" value={`AED ${totals.d30.toLocaleString()}`} sub="Current" />
        <KpiCard label="31–90 Days" value={`AED ${(totals.d60 + totals.d90).toLocaleString()}`} sub="Moderate" />
        <KpiCard label="90+ Days" value={`AED ${totals.d90plus.toLocaleString()}`} sub="Overdue" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th right>Total (AED)</Th>
              <Th right>0-30</Th>
              <Th right>31-60</Th>
              <Th right>61-90</Th>
              <Th right>90+</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockVendorAging.map((r) => (
              <tr key={r.vendor} className="hover:bg-slate-50">
                <Td bold>{r.vendor}</Td>
                <Td right bold>{r.total.toLocaleString()}</Td>
                <Td right>{r.d30.toLocaleString()}</Td>
                <Td right>{r.d60.toLocaleString()}</Td>
                <Td right>{r.d90.toLocaleString()}</Td>
                <Td right>{r.d90plus > 0 ? <span className="text-red-600 font-semibold">{r.d90plus.toLocaleString()}</span> : "0"}</Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Aging Bucket Distribution</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={mockVendorAgingChart} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {mockVendorAgingChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VendorPerformanceReport() {
  useDataRevision();
  const avgOnTime = mockVendorPerf.length ? mockVendorPerf.reduce((s, r) => s + r.onTimePct, 0) / mockVendorPerf.length : 0;
  const avgReturnRate = mockVendorPerf.length ? mockVendorPerf.reduce((s, r) => s + r.returnRate, 0) / mockVendorPerf.length : 0;
  const avgSettleDays = mockVendorPerf.length ? Math.round(mockVendorPerf.reduce((s, r) => s + r.avgSettleDays, 0) / mockVendorPerf.length) : 0;
  useReportView("vendor-performance", {
    kpis: [
      { label: "Avg On-Time Delivery", value: `${avgOnTime.toFixed(1)}%` },
      { label: "Avg Return Rate", value: `${avgReturnRate.toFixed(1)}%` },
      { label: "Avg Settlement Days", value: `${avgSettleDays} days` },
    ],
    sections: [{
      title: "Vendor Performance Summary",
      columns: [
        { key: "vendor", header: "Vendor", align: "left", width: 22 },
        { key: "orders", header: "Orders", align: "right", width: 10 },
        { key: "onTime", header: "On-Time", align: "right", width: 10 },
        { key: "onTimePct", header: "On-Time%", align: "right", width: 10 },
        { key: "returnRate", header: "Return%", align: "right", width: 10 },
        { key: "claimRate", header: "Claim%", align: "right", width: 10 },
        { key: "avgSettleDays", header: "Settle Days", align: "right", width: 12 },
        { key: "score", header: "Score", align: "left", width: 8 },
      ],
      rows: mockVendorPerf.map((r) => ({
        vendor: r.vendor, orders: r.orders, onTime: r.onTime, onTimePct: `${r.onTimePct}%`,
        returnRate: `${r.returnRate}%`, claimRate: `${r.claimRate}%`, avgSettleDays: r.avgSettleDays, score: r.score,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Vendor Performance Summary" subtitle="KPI tracking: delivery, returns, claims, settlement" count={mockVendorPerf.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Avg On-Time Delivery" value={`${avgOnTime.toFixed(1)}%`} sub="All vendors" accent />
        <KpiCard label="Avg Return Rate" value={`${avgReturnRate.toFixed(1)}%`} sub="By value" />
        <KpiCard label="Avg Settlement Days" value={`${avgSettleDays} days`} sub="Invoice to payment" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th right>Orders</Th>
              <Th right>On-Time%</Th>
              <Th right>Return%</Th>
              <Th right>Claim%</Th>
              <Th right>Settle Days</Th>
              <Th>Score</Th>
            </tr>
          </thead>
          <tbody>
            {mockVendorPerf.map((r) => (
              <tr key={r.vendor} className="hover:bg-slate-50">
                <Td bold>{r.vendor}</Td>
                <Td right>{r.orders}</Td>
                <Td right><span className={r.onTimePct >= 85 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{r.onTimePct}%</span></Td>
                <Td right>{r.returnRate}%</Td>
                <Td right>{r.claimRate}%</Td>
                <Td right>{r.avgSettleDays}</Td>
                <Td><Badge variant="outline" className={r.score.startsWith("A") ? "bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]" : r.score.startsWith("B") ? "bg-blue-100 text-blue-700 border-blue-300 text-[10px]" : "bg-red-100 text-red-700 border-red-300 text-[10px]"}>{r.score}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">On-Time % vs Return Rate</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockVendorPerfChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="onTime" name="On-Time%" fill="#F5C742" />
                <Bar dataKey="returnRate" name="Return%" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VendorPriceHistoryReport() {
  useDataRevision();
  const avgCostChange = mockPriceHistory.length ? mockPriceHistory.reduce((s, r) => s + r.change, 0) / mockPriceHistory.length : 0;
  useReportView("vendor-price-history", {
    kpis: [
      { label: "Items Tracked", value: String(mockPriceHistory.length) },
      { label: "Avg Cost Change", value: `${avgCostChange.toFixed(2)}%` },
    ],
    sections: [{
      title: "Vendor Price History",
      columns: [
        { key: "item", header: "Item", align: "left", width: 20 },
        { key: "sku", header: "SKU", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "p1", header: "P1 (AED)", align: "right", width: 10 },
        { key: "p2", header: "P2 (AED)", align: "right", width: 10 },
        { key: "p3", header: "P3 (AED)", align: "right", width: 10 },
        { key: "p4", header: "P4 (AED)", align: "right", width: 10 },
        { key: "p5", header: "P5 (AED)", align: "right", width: 10 },
        { key: "change", header: "Change%", align: "right", width: 10 },
      ],
      rows: mockPriceHistory.map((r) => ({
        item: r.item, sku: r.sku, vendor: r.vendor,
        p1: r.p1.toFixed(2), p2: r.p2.toFixed(2), p3: r.p3.toFixed(2),
        p4: r.p4.toFixed(2), p5: r.p5.toFixed(2), change: `${r.change > 0 ? "+" : ""}${r.change.toFixed(2)}%`,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Vendor Price History" subtitle="Last 5 purchase rates per item with cost change %" count={mockPriceHistory.length} />
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Items Tracked" value={String(mockPriceHistory.length)} sub="Across vendors" accent />
        <KpiCard label="Avg Cost Change" value={`${avgCostChange.toFixed(2)}%`} sub="YTD movement" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>SKU</Th>
            <Th>Vendor</Th>
            <Th right>P1 (AED)</Th>
            <Th right>P2 (AED)</Th>
            <Th right>P3 (AED)</Th>
            <Th right>P4 (AED)</Th>
            <Th right>P5 (AED)</Th>
            <Th right>Change%</Th>
          </tr>
        </thead>
        <tbody>
          {mockPriceHistory.map((r) => (
            <tr key={r.sku} className="hover:bg-slate-50">
              <Td bold>{r.item}</Td>
              <Td muted>{r.sku}</Td>
              <Td>{r.vendor}</Td>
              <Td right>{r.p1.toFixed(2)}</Td>
              <Td right>{r.p2.toFixed(2)}</Td>
              <Td right>{r.p3.toFixed(2)}</Td>
              <Td right>{r.p4.toFixed(2)}</Td>
              <Td right bold>{r.p5.toFixed(2)}</Td>
              <Td right><span className={r.change > 0 ? "text-red-600 font-semibold" : "text-emerald-700 font-semibold"}>{r.change > 0 ? "+" : ""}{r.change.toFixed(2)}%</span></Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function VendorContractComplianceReport() {
  useDataRevision();
  const breached = mockContractCompliance.filter((r) => r.status === "Breached").length;
  useReportView("vendor-contract-compliance", {
    kpis: [
      { label: "Items Reviewed", value: String(mockContractCompliance.length) },
      { label: "Breaches", value: String(breached) },
      { label: "Penalties Applied", value: String(mockContractCompliance.filter((r) => r.penaltyApplied).length) },
    ],
    sections: [{
      title: "Vendor Contract Compliance",
      columns: [
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "item", header: "Item", align: "left", width: 22 },
        { key: "contractPrice", header: "Contract Price (AED)", align: "right", width: 16 },
        { key: "actualPrice", header: "Actual Price (AED)", align: "right", width: 16 },
        { key: "variance", header: "Variance (AED)", align: "right", width: 14 },
        { key: "variancePct", header: "Variance%", align: "right", width: 10 },
        { key: "penalty", header: "Penalty", align: "left", width: 10 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockContractCompliance.map((r) => ({
        vendor: r.vendor, item: r.item,
        contractPrice: r.contractPrice.toLocaleString(), actualPrice: r.actualPrice.toLocaleString(),
        variance: r.variance !== 0 ? `${r.variance > 0 ? "+" : ""}${r.variance.toLocaleString()}` : "—",
        variancePct: `${r.variancePct > 0 ? "+" : ""}${r.variancePct.toFixed(2)}%`,
        penalty: r.penaltyApplied ? "Applied" : "None",
        status: r.status,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Vendor Contract Compliance" subtitle="Contract price vs actual purchase price with penalty tracking" count={mockContractCompliance.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Items Reviewed" value={String(mockContractCompliance.length)} sub="Under contract" accent />
        <KpiCard label="Breaches" value={String(breached)} sub="Price violations" />
        <KpiCard label="Penalties Applied" value={String(mockContractCompliance.filter((r) => r.penaltyApplied).length)} sub="Enforcement actions" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Vendor</Th>
            <Th>Item</Th>
            <Th right>Contract Price (AED)</Th>
            <Th right>Actual Price (AED)</Th>
            <Th right>Variance (AED)</Th>
            <Th right>Variance%</Th>
            <Th>Penalty</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockContractCompliance.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <Td bold>{r.vendor}</Td>
              <Td>{r.item}</Td>
              <Td right>{r.contractPrice.toLocaleString()}</Td>
              <Td right>{r.actualPrice.toLocaleString()}</Td>
              <Td right>{r.variance !== 0 ? amtBadge(r.variance) : "—"}</Td>
              <Td right><span className={r.variancePct > 0 ? "text-red-600 font-semibold" : r.variancePct < 0 ? "text-emerald-700 font-semibold" : "text-slate-500"}>{r.variancePct > 0 ? "+" : ""}{r.variancePct.toFixed(2)}%</span></Td>
              <Td>{r.penaltyApplied ? <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">Applied</Badge> : <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 text-[10px]">None</Badge>}</Td>
              <Td>{statusBadge(r.status === "Breached" ? "Overdue" : "Active")}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function LpoRegisterReport() {
  useDataRevision();
  const total = mockLpoRegister.reduce((s, r) => s + r.totalValue, 0);
  useReportView("lpo-register", {
    kpis: [
      { label: "Total LPO Value", value: `AED ${total.toLocaleString()}` },
      { label: "Approved", value: String(mockLpoRegister.filter((r) => r.status === "Approved" || r.status === "Received").length) },
      { label: "Pending / Partial", value: String(mockLpoRegister.filter((r) => r.status === "Pending" || r.status === "Partial").length) },
    ],
    sections: [{
      title: "LPO Register",
      columns: [
        { key: "lpoNo", header: "LPO No.", align: "left", width: 16 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "branch", header: "Branch", align: "left", width: 12 },
        { key: "totalItems", header: "Items", align: "right", width: 8 },
        { key: "totalValue", header: "Value (AED)", align: "right", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
        { key: "approvedBy", header: "Approved By", align: "left", width: 18 },
      ],
      rows: mockLpoRegister.map((r) => ({
        lpoNo: r.lpoNo, date: r.date, vendor: r.vendor, branch: r.branch,
        totalItems: r.totalItems, totalValue: r.totalValue.toLocaleString(),
        status: r.status, approvedBy: r.approvedBy,
      })),
      totals: { lpoNo: "TOTAL", totalValue: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="LPO Register" subtitle="All purchase orders with approval status" count={mockLpoRegister.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total LPO Value" value={`AED ${total.toLocaleString()}`} sub="Period total" accent />
        <KpiCard label="Approved" value={String(mockLpoRegister.filter((r) => r.status === "Approved" || r.status === "Received").length)} sub="Orders" />
        <KpiCard label="Pending / Partial" value={String(mockLpoRegister.filter((r) => r.status === "Pending" || r.status === "Partial").length)} sub="Awaiting action" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>LPO No.</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>Branch</Th>
            <Th right>Items</Th>
            <Th right>Value (AED)</Th>
            <Th>Status</Th>
            <Th>Approved By</Th>
          </tr>
        </thead>
        <tbody>
          {mockLpoRegister.map((r) => (
            <tr key={r.lpoNo} className="hover:bg-slate-50">
              <Td bold>{r.lpoNo}</Td>
              <Td muted>{r.date}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.branch}</Td>
              <Td right>{r.totalItems}</Td>
              <Td right bold>{r.totalValue.toLocaleString()}</Td>
              <Td>{statusBadge(r.status)}</Td>
              <Td muted>{r.approvedBy}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function LpoFulfillmentReport() {
  useDataRevision();
  const totOrd = mockLpoFulfillment.reduce((s, r) => s + r.orderedValue, 0);
  const totDel = mockLpoFulfillment.reduce((s, r) => s + r.deliveredValue, 0);
  useReportView("lpo-fulfillment", {
    kpis: [
      { label: "Total Ordered", value: `AED ${totOrd.toLocaleString()}` },
      { label: "Total Delivered", value: `AED ${totDel.toLocaleString()}` },
    ],
    sections: [{
      title: "LPO vs Delivery Fulfillment",
      columns: [
        { key: "lpoNo", header: "LPO No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "orderedQty", header: "Ordered Qty", align: "right", width: 12 },
        { key: "deliveredQty", header: "Delivered Qty", align: "right", width: 12 },
        { key: "pendingQty", header: "Pending Qty", align: "right", width: 12 },
        { key: "orderedValue", header: "Ordered (AED)", align: "right", width: 14 },
        { key: "deliveredValue", header: "Delivered (AED)", align: "right", width: 14 },
        { key: "fulfillmentPct", header: "Fulfillment%", align: "right", width: 12 },
      ],
      rows: mockLpoFulfillment.map((r) => ({
        lpoNo: r.lpoNo, vendor: r.vendor, orderedQty: r.orderedQty, deliveredQty: r.deliveredQty,
        pendingQty: r.pendingQty, orderedValue: r.orderedValue.toLocaleString(),
        deliveredValue: r.deliveredValue.toLocaleString(), fulfillmentPct: `${r.fulfillmentPct.toFixed(1)}%`,
      })),
      totals: { lpoNo: "TOTAL", orderedValue: totOrd.toLocaleString(), deliveredValue: totDel.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="LPO vs Delivery Fulfillment" subtitle="Ordered vs delivered quantities and value" count={mockLpoFulfillment.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>LPO No.</Th>
              <Th>Vendor</Th>
              <Th right>Ordered Qty</Th>
              <Th right>Delivered Qty</Th>
              <Th right>Pending Qty</Th>
              <Th right>Ordered (AED)</Th>
              <Th right>Delivered (AED)</Th>
              <Th right>Fulfillment%</Th>
            </tr>
          </thead>
          <tbody>
            {mockLpoFulfillment.map((r) => (
              <tr key={r.lpoNo} className="hover:bg-slate-50">
                <Td bold>{r.lpoNo}</Td>
                <Td>{r.vendor}</Td>
                <Td right>{r.orderedQty}</Td>
                <Td right>{r.deliveredQty}</Td>
                <Td right>{r.pendingQty > 0 ? <span className="text-amber-600 font-semibold">{r.pendingQty}</span> : "0"}</Td>
                <Td right>{r.orderedValue.toLocaleString()}</Td>
                <Td right bold>{r.deliveredValue.toLocaleString()}</Td>
                <Td right><span className={r.fulfillmentPct >= 95 ? "text-emerald-700 font-semibold" : r.fulfillmentPct >= 70 ? "text-amber-700 font-semibold" : "text-red-600 font-semibold"}>{r.fulfillmentPct.toFixed(1)}%</span></Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Ordered vs Delivered Value</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockLpoFulfillmentChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="ordered" name="Ordered" fill="#e2e8f0" />
                <Bar dataKey="delivered" name="Delivered" fill="#F5C742" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LpoAgingReport() {
  useDataRevision();
  useReportView("lpo-aging", {
    kpis: [
      { label: "Pending LPOs", value: String(mockLpoAging.length) },
      { label: "Overdue", value: String(mockLpoAging.filter((r) => r.status === "Overdue").length) },
      { label: "Total Value", value: `AED ${mockLpoAging.reduce((s, r) => s + r.value, 0).toLocaleString()}` },
    ],
    sections: [{
      title: "LPO Aging Report",
      columns: [
        { key: "lpoNo", header: "LPO No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "issueDate", header: "Issue Date", align: "left", width: 12 },
        { key: "expectedDate", header: "Expected Date", align: "left", width: 12 },
        { key: "daysPending", header: "Days Pending", align: "right", width: 12 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "status", header: "Status", align: "left", width: 10 },
      ],
      rows: mockLpoAging.map((r) => ({
        lpoNo: r.lpoNo, vendor: r.vendor, issueDate: r.issueDate, expectedDate: r.expectedDate,
        daysPending: r.daysPending, value: r.value.toLocaleString(), status: r.status,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="LPO Aging Report" subtitle="Pending LPOs with aging and overdue highlighting" count={mockLpoAging.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>LPO No.</Th>
              <Th>Vendor</Th>
              <Th>Issue Date</Th>
              <Th>Expected Date</Th>
              <Th right>Days Pending</Th>
              <Th right>Value (AED)</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockLpoAging.map((r) => (
              <tr key={r.lpoNo} className="hover:bg-slate-50">
                <Td bold>{r.lpoNo}</Td>
                <Td>{r.vendor}</Td>
                <Td muted>{r.issueDate}</Td>
                <Td muted>{r.expectedDate}</Td>
                <Td right><span className={r.daysPending > 30 ? "text-red-600 font-bold" : "text-amber-700 font-semibold"}>{r.daysPending}</span></Td>
                <Td right bold>{r.value.toLocaleString()}</Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Pending LPO by Aging Bucket</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockLpoAgingChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="count" name="LPO Count" fill="#F5C742" />
                <Bar dataKey="value" name="Value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LpoCancelledReport() {
  useDataRevision();
  const total = mockLpoCancelled.reduce((s, r) => s + r.value, 0);
  useReportView("lpo-cancelled", {
    kpis: [
      { label: "Total Cancelled Value", value: `AED ${total.toLocaleString()}` },
      { label: "Cancelled Orders", value: String(mockLpoCancelled.length) },
    ],
    sections: [{
      title: "Cancelled / Modified LPO",
      columns: [
        { key: "lpoNo", header: "LPO No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "reason", header: "Reason", align: "left", width: 28 },
        { key: "cancelledBy", header: "Cancelled By", align: "left", width: 18 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockLpoCancelled.map((r) => ({
        lpoNo: r.lpoNo, vendor: r.vendor, date: r.date, value: r.value.toLocaleString(),
        reason: r.reason, cancelledBy: r.cancelledBy, status: r.status,
      })),
      totals: { lpoNo: "TOTAL", value: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Cancelled / Modified LPO" subtitle="Cancelled and modified orders with authorization" count={mockLpoCancelled.length} />
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total Cancelled Value" value={`AED ${total.toLocaleString()}`} sub="This period" accent />
        <KpiCard label="Cancelled Orders" value={String(mockLpoCancelled.length)} sub="Requiring review" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>LPO No.</Th>
            <Th>Vendor</Th>
            <Th>Date</Th>
            <Th right>Value (AED)</Th>
            <Th>Reason</Th>
            <Th>Cancelled By</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockLpoCancelled.map((r) => (
            <tr key={r.lpoNo} className="hover:bg-slate-50">
              <Td bold>{r.lpoNo}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.date}</Td>
              <Td right bold>{r.value.toLocaleString()}</Td>
              <Td muted>{r.reason}</Td>
              <Td>{r.cancelledBy}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function GrnRegisterReport() {
  useDataRevision();
  const total = mockGrnRegister.reduce((s, r) => s + r.value, 0);
  useReportView("grn-register", {
    kpis: [
      { label: "Total Received Value", value: `AED ${total.toLocaleString()}` },
      { label: "QC Passed", value: String(mockGrnRegister.filter((r) => r.qcStatus === "Pass").length) },
      { label: "QC Failed / On Hold", value: String(mockGrnRegister.filter((r) => r.qcStatus === "Fail" || r.status === "On Hold").length) },
    ],
    sections: [{
      title: "GRN Register",
      columns: [
        { key: "grnNo", header: "GRN No.", align: "left", width: 16 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "lpoNo", header: "LPO Ref", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "warehouse", header: "Warehouse", align: "left", width: 14 },
        { key: "items", header: "Items", align: "right", width: 8 },
        { key: "receivedQty", header: "Qty", align: "right", width: 8 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "qcStatus", header: "QC", align: "left", width: 10 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockGrnRegister.map((r) => ({
        grnNo: r.grnNo, date: r.date, lpoNo: r.lpoNo, vendor: r.vendor, warehouse: r.warehouse,
        items: r.items, receivedQty: r.receivedQty, value: r.value.toLocaleString(),
        qcStatus: r.qcStatus, status: r.status,
      })),
      totals: { grnNo: "TOTAL", value: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="GRN Register" subtitle="All goods receipts with QC and warehouse status" count={mockGrnRegister.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Received Value" value={`AED ${total.toLocaleString()}`} sub="Period total" accent />
        <KpiCard label="QC Passed" value={String(mockGrnRegister.filter((r) => r.qcStatus === "Pass").length)} sub="Receipts" />
        <KpiCard label="QC Failed / On Hold" value={String(mockGrnRegister.filter((r) => r.qcStatus === "Fail" || r.status === "On Hold").length)} sub="Needs action" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>GRN No.</Th>
            <Th>Date</Th>
            <Th>LPO Ref</Th>
            <Th>Vendor</Th>
            <Th>Warehouse</Th>
            <Th right>Items</Th>
            <Th right>Qty</Th>
            <Th right>Value (AED)</Th>
            <Th>QC</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockGrnRegister.map((r) => (
            <tr key={r.grnNo} className="hover:bg-slate-50">
              <Td bold>{r.grnNo}</Td>
              <Td muted>{r.date}</Td>
              <Td muted>{r.lpoNo}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.warehouse}</Td>
              <Td right>{r.items}</Td>
              <Td right>{r.receivedQty}</Td>
              <Td right bold>{r.value.toLocaleString()}</Td>
              <Td>{statusBadge(r.qcStatus)}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function GrnVarianceReport() {
  useDataRevision();
  const totValueVar = mockGrnVariance.reduce((s, r) => s + r.valueVar, 0);
  useReportView("grn-variance", {
    kpis: [
      { label: "Items with Variance", value: String(mockGrnVariance.length) },
      { label: "Total Value Variance", value: `AED ${totValueVar.toLocaleString()}` },
    ],
    sections: [{
      title: "GRN Variance Report",
      columns: [
        { key: "grnNo", header: "GRN No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "item", header: "Item", align: "left", width: 22 },
        { key: "lpoQty", header: "LPO Qty", align: "right", width: 10 },
        { key: "grnQty", header: "GRN Qty", align: "right", width: 10 },
        { key: "qtyVar", header: "Qty Var", align: "right", width: 10 },
        { key: "lpoRate", header: "LPO Rate", align: "right", width: 10 },
        { key: "grnRate", header: "GRN Rate", align: "right", width: 10 },
        { key: "valueVar", header: "Value Var (AED)", align: "right", width: 14 },
      ],
      rows: mockGrnVariance.map((r) => ({
        grnNo: r.grnNo, vendor: r.vendor, item: r.item,
        lpoQty: r.lpoQty, grnQty: r.grnQty, qtyVar: r.qtyVar,
        lpoRate: r.lpoRate.toFixed(2), grnRate: r.grnRate.toFixed(2),
        valueVar: r.valueVar !== 0 ? `${r.valueVar > 0 ? "+" : ""}${r.valueVar.toLocaleString()}` : "—",
      })),
      totals: { grnNo: "TOTAL", valueVar: `${totValueVar > 0 ? "+" : ""}${totValueVar.toLocaleString()}` },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="GRN Variance Report" subtitle="LPO vs GRN quantity and value differences" count={mockGrnVariance.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>GRN No.</Th>
              <Th>Vendor</Th>
              <Th>Item</Th>
              <Th right>LPO Qty</Th>
              <Th right>GRN Qty</Th>
              <Th right>Qty Var</Th>
              <Th right>LPO Rate</Th>
              <Th right>GRN Rate</Th>
              <Th right>Value Var (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {mockGrnVariance.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <Td bold>{r.grnNo}</Td>
                <Td>{r.vendor}</Td>
                <Td>{r.item}</Td>
                <Td right>{r.lpoQty}</Td>
                <Td right>{r.grnQty}</Td>
                <Td right><span className={r.qtyVar !== 0 ? "text-red-600 font-semibold" : "text-slate-500"}>{r.qtyVar}</span></Td>
                <Td right>{r.lpoRate.toFixed(2)}</Td>
                <Td right>{r.grnRate.toFixed(2)}</Td>
                <Td right>{amtBadge(r.valueVar)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Value Variance by Vendor</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockGrnVarianceChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Bar dataKey="variance" name="Variance (AED)" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GrnBatchExpiryReport() {
  useDataRevision();
  const nearExpiry = mockBatchExpiry.filter((r) => r.daysToExpiry <= 30).length;
  useReportView("grn-batch-expiry", {
    kpis: [
      { label: "Total Batches", value: String(mockBatchExpiry.length) },
      { label: "Near Expiry (≤30d)", value: String(nearExpiry) },
      { label: "Active Batches", value: String(mockBatchExpiry.filter((r) => r.status === "Active").length) },
    ],
    sections: [{
      title: "Batch & Expiry Report",
      columns: [
        { key: "grnNo", header: "GRN No.", align: "left", width: 16 },
        { key: "item", header: "Item", align: "left", width: 22 },
        { key: "batchNo", header: "Batch No.", align: "left", width: 16 },
        { key: "mfgDate", header: "Mfg Date", align: "left", width: 12 },
        { key: "expiryDate", header: "Expiry Date", align: "left", width: 12 },
        { key: "qty", header: "Qty", align: "right", width: 8 },
        { key: "warehouse", header: "Warehouse", align: "left", width: 14 },
        { key: "daysToExpiry", header: "Days to Expiry", align: "right", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockBatchExpiry.map((r) => ({
        grnNo: r.grnNo, item: r.item, batchNo: r.batchNo, mfgDate: r.mfgDate, expiryDate: r.expiryDate,
        qty: r.qty, warehouse: r.warehouse, daysToExpiry: r.daysToExpiry, status: r.status,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Batch & Expiry Report" subtitle="Batch tracking with expiry monitoring" count={mockBatchExpiry.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Batches" value={String(mockBatchExpiry.length)} sub="Active batches" accent />
        <KpiCard label="Near Expiry (â‰¤30d)" value={String(nearExpiry)} sub="Requires action" />
        <KpiCard label="Active Batches" value={String(mockBatchExpiry.filter((r) => r.status === "Active").length)} sub="Good standing" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>GRN No.</Th>
            <Th>Item</Th>
            <Th>Batch No.</Th>
            <Th>Mfg Date</Th>
            <Th>Expiry Date</Th>
            <Th right>Qty</Th>
            <Th>Warehouse</Th>
            <Th right>Days to Expiry</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockBatchExpiry.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <Td bold>{r.grnNo}</Td>
              <Td>{r.item}</Td>
              <Td muted>{r.batchNo}</Td>
              <Td muted>{r.mfgDate}</Td>
              <Td muted>{r.expiryDate}</Td>
              <Td right>{r.qty}</Td>
              <Td muted>{r.warehouse}</Td>
              <Td right><span className={r.daysToExpiry <= 30 ? "text-red-600 font-bold" : r.daysToExpiry <= 90 ? "text-amber-600 font-semibold" : "text-slate-600"}>{r.daysToExpiry}</span></Td>
              <Td>{statusBadge(r.status === "Near Expiry" ? "Overdue" : r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function GrnQcRejectionReport() {
  useDataRevision();
  const totalValue = mockQcRejection.reduce((s, r) => s + r.value, 0);
  useReportView("grn-qc-rejection", {
    kpis: [
      { label: "Total Rejections", value: String(mockQcRejection.length) },
      { label: "Total Rejected Value", value: `AED ${totalValue.toLocaleString()}` },
    ],
    sections: [{
      title: "QC Rejection Report",
      columns: [
        { key: "grnNo", header: "GRN No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "item", header: "Item", align: "left", width: 22 },
        { key: "rejectedQty", header: "Rejected Qty", align: "right", width: 12 },
        { key: "reason", header: "Reason", align: "left", width: 20 },
        { key: "warehouse", header: "Warehouse", align: "left", width: 14 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "action", header: "Action", align: "left", width: 18 },
      ],
      rows: mockQcRejection.map((r) => ({
        grnNo: r.grnNo, vendor: r.vendor, item: r.item, rejectedQty: r.rejectedQty,
        reason: r.reason, warehouse: r.warehouse, date: r.date, value: r.value.toLocaleString(), action: r.action,
      })),
      totals: { grnNo: "TOTAL", value: totalValue.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="QC Rejection Report" subtitle="Quality control rejections by reason and vendor" count={mockQcRejection.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Total Rejections" value={String(mockQcRejection.length)} sub="This period" accent />
            <KpiCard label="Total Rejected Value" value={`AED ${totalValue.toLocaleString()}`} sub="Impact" />
          </div>
          <Tbl>
            <thead>
              <tr>
                <Th>GRN No.</Th>
                <Th>Vendor</Th>
                <Th>Item</Th>
                <Th right>Rejected Qty</Th>
                <Th>Reason</Th>
                <Th right>Value (AED)</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {mockQcRejection.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td bold>{r.grnNo}</Td>
                  <Td>{r.vendor}</Td>
                  <Td>{r.item}</Td>
                  <Td right><span className="text-red-600 font-semibold">{r.rejectedQty}</span></Td>
                  <Td muted>{r.reason}</Td>
                  <Td right bold>{r.value.toLocaleString()}</Td>
                  <Td muted>{r.action}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </div>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Rejections by Reason</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={mockQcChart} cx="50%" cy="50%" outerRadius={75} dataKey="count" label={({ reason, count }) => `${reason}: ${count}`} labelLine={false}>
                  {mockQcChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GrvRegisterReport() {
  useDataRevision();
  const total = mockGrvRegister.reduce((s, r) => s + r.value, 0);
  useReportView("grv-register", {
    kpis: [
      { label: "Total GRV Value", value: `AED ${total.toLocaleString()}` },
      { label: "Settled", value: String(mockGrvRegister.filter((r) => r.status === "Settled").length) },
      { label: "Pending / Issued", value: String(mockGrvRegister.filter((r) => r.status !== "Settled").length) },
    ],
    sections: [{
      title: "GRV Register",
      columns: [
        { key: "grvNo", header: "GRV No.", align: "left", width: 16 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "grnNo", header: "GRN Ref", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "items", header: "Items", align: "right", width: 8 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "reason", header: "Reason", align: "left", width: 16 },
        { key: "debitNote", header: "Debit Note", align: "left", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockGrvRegister.map((r) => ({
        grvNo: r.grvNo, date: r.date, grnNo: r.grnNo, vendor: r.vendor,
        items: r.items, value: r.value.toLocaleString(), reason: r.reason,
        debitNote: r.debitNote, status: r.status,
      })),
      totals: { grvNo: "TOTAL", value: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="GRV Register" subtitle="All goods return vouchers with settlement status" count={mockGrvRegister.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total GRV Value" value={`AED ${total.toLocaleString()}`} sub="Period returns" accent />
        <KpiCard label="Settled" value={String(mockGrvRegister.filter((r) => r.status === "Settled").length)} sub="Returns" />
        <KpiCard label="Pending / Issued" value={String(mockGrvRegister.filter((r) => r.status !== "Settled").length)} sub="Awaiting action" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>GRV No.</Th>
            <Th>Date</Th>
            <Th>GRN Ref</Th>
            <Th>Vendor</Th>
            <Th right>Items</Th>
            <Th right>Value (AED)</Th>
            <Th>Reason</Th>
            <Th>Debit Note</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockGrvRegister.map((r) => (
            <tr key={r.grvNo} className="hover:bg-slate-50">
              <Td bold>{r.grvNo}</Td>
              <Td muted>{r.date}</Td>
              <Td muted>{r.grnNo}</Td>
              <Td>{r.vendor}</Td>
              <Td right>{r.items}</Td>
              <Td right bold>{r.value.toLocaleString()}</Td>
              <Td muted>{r.reason}</Td>
              <Td muted>{r.debitNote}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function GrvReasonAnalysisReport() {
  useDataRevision();
  const totCount = mockGrvReasonChart.reduce((s, r) => s + r.count, 0);
  const totValue = mockGrvReasonChart.reduce((s, r) => s + r.value, 0);
  useReportView("grv-reason-analysis", {
    kpis: [
      { label: "Total Returns", value: String(totCount) },
      { label: "Total Return Value", value: `AED ${totValue.toLocaleString()}` },
    ],
    sections: [{
      title: "GRV Reason Analysis",
      columns: [
        { key: "reason", header: "Return Reason", align: "left", width: 20 },
        { key: "count", header: "Count", align: "right", width: 10 },
        { key: "value", header: "Total Value (AED)", align: "right", width: 16 },
        { key: "avg", header: "Avg per Return (AED)", align: "right", width: 18 },
      ],
      rows: mockGrvReasonChart.map((r) => ({
        reason: r.reason, count: r.count, value: r.value.toLocaleString(),
        avg: r.count ? (r.value / r.count).toFixed(2) : "0.00",
      })),
      totals: { reason: "TOTAL", count: totCount, value: totValue.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="GRV Reason Analysis" subtitle="Return reason breakdown with value impact" count={mockGrvReasonChart.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Return Reason</Th>
              <Th right>Count</Th>
              <Th right>Total Value (AED)</Th>
              <Th right>Avg per Return (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {mockGrvReasonChart.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <Td bold>{r.reason}</Td>
                <Td right>{r.count}</Td>
                <Td right>{r.value.toLocaleString()}</Td>
                <Td right muted>{r.count ? (r.value / r.count).toFixed(2) : "0.00"}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Return Value by Reason</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={mockGrvReasonChart} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="reason" label={({ reason }) => reason} labelLine={false}>
                  {mockGrvReasonChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GrvReplacementPendingReport() {
  useDataRevision();
  useReportView("grv-replacement-pending", {
    kpis: [
      { label: "Pending Replacements", value: String(mockGrvPending.length) },
      { label: "Overdue SLA", value: String(mockGrvPending.filter((r) => r.status === "Overdue").length) },
      { label: "Total Value Pending", value: `AED ${mockGrvPending.reduce((s, r) => s + r.value, 0).toLocaleString()}` },
    ],
    sections: [{
      title: "Replacement Pending Report",
      columns: [
        { key: "grvNo", header: "GRV No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "item", header: "Item", align: "left", width: 22 },
        { key: "qty", header: "Qty", align: "right", width: 8 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "grvDate", header: "GRV Date", align: "left", width: 12 },
        { key: "slaDate", header: "SLA Date", align: "left", width: 12 },
        { key: "daysPending", header: "Days Pending", align: "right", width: 12 },
        { key: "status", header: "Status", align: "left", width: 10 },
      ],
      rows: mockGrvPending.map((r) => ({
        grvNo: r.grvNo, vendor: r.vendor, item: r.item, qty: r.qty,
        value: r.value.toLocaleString(), grvDate: r.grvDate, slaDate: r.slaDate,
        daysPending: r.daysPending, status: r.status,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Replacement Pending Report" subtitle="GRVs awaiting vendor replacement with SLA monitoring" count={mockGrvPending.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Pending Replacements" value={String(mockGrvPending.length)} sub="Open items" accent />
        <KpiCard label="Overdue SLA" value={String(mockGrvPending.filter((r) => r.status === "Overdue").length)} sub="Breach count" />
        <KpiCard label="Total Value Pending" value={`AED ${mockGrvPending.reduce((s, r) => s + r.value, 0).toLocaleString()}`} sub="At risk" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>GRV No.</Th>
            <Th>Vendor</Th>
            <Th>Item</Th>
            <Th right>Qty</Th>
            <Th right>Value (AED)</Th>
            <Th>GRV Date</Th>
            <Th>SLA Date</Th>
            <Th right>Days Pending</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockGrvPending.map((r) => (
            <tr key={r.grvNo} className="hover:bg-slate-50">
              <Td bold>{r.grvNo}</Td>
              <Td>{r.vendor}</Td>
              <Td>{r.item}</Td>
              <Td right>{r.qty}</Td>
              <Td right bold>{r.value.toLocaleString()}</Td>
              <Td muted>{r.grvDate}</Td>
              <Td muted>{r.slaDate}</Td>
              <Td right><span className={r.status === "Overdue" ? "text-red-600 font-bold" : "text-amber-600 font-semibold"}>{r.daysPending}</span></Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function GrvDebitNoteMappingReport() {
  useDataRevision();
  useReportView("grv-debit-note-mapping", {
    kpis: [
      { label: "Matched & Settled", value: String(mockGrvDebitNote.filter((r) => r.matched).length) },
      { label: "Unmatched GRVs", value: String(mockGrvDebitNote.filter((r) => !r.matched).length) },
      { label: "Total Settled", value: `AED ${mockGrvDebitNote.filter((r) => r.matched).reduce((s, r) => s + r.grvValue, 0).toLocaleString()}` },
    ],
    sections: [{
      title: "GRV vs Debit Note Mapping",
      columns: [
        { key: "grvNo", header: "GRV No.", align: "left", width: 16 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "grvValue", header: "GRV Value (AED)", align: "right", width: 14 },
        { key: "debitNote", header: "Debit Note", align: "left", width: 14 },
        { key: "dnValue", header: "DN Value (AED)", align: "right", width: 14 },
        { key: "matched", header: "Matched", align: "left", width: 10 },
        { key: "settledDate", header: "Settled Date", align: "left", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockGrvDebitNote.map((r) => ({
        grvNo: r.grvNo, vendor: r.vendor, grvValue: r.grvValue.toLocaleString(),
        debitNote: r.debitNote, dnValue: r.dnValue > 0 ? r.dnValue.toLocaleString() : "—",
        matched: r.matched ? "Yes" : "No", settledDate: r.settledDate, status: r.status,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="GRV vs Debit Note Mapping" subtitle="GRV to debit note matching with settlement tracking" count={mockGrvDebitNote.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Matched & Settled" value={String(mockGrvDebitNote.filter((r) => r.matched).length)} sub="GRV-DN pairs" accent />
        <KpiCard label="Unmatched GRVs" value={String(mockGrvDebitNote.filter((r) => !r.matched).length)} sub="Need debit note" />
        <KpiCard label="Total Settled" value={`AED ${mockGrvDebitNote.filter((r) => r.matched).reduce((s, r) => s + r.grvValue, 0).toLocaleString()}`} sub="Recovered" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>GRV No.</Th>
            <Th>Vendor</Th>
            <Th right>GRV Value (AED)</Th>
            <Th>Debit Note</Th>
            <Th right>DN Value (AED)</Th>
            <Th>Matched</Th>
            <Th>Settled Date</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockGrvDebitNote.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <Td bold>{r.grvNo}</Td>
              <Td>{r.vendor}</Td>
              <Td right bold>{r.grvValue.toLocaleString()}</Td>
              <Td muted>{r.debitNote}</Td>
              <Td right>{r.dnValue > 0 ? r.dnValue.toLocaleString() : "—"}</Td>
              <Td>{r.matched ? <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">Yes</Badge> : <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">No</Badge>}</Td>
              <Td muted>{r.settledDate}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function InvoiceRegisterReport() {
  useDataRevision();
  const total = mockInvoiceRegister.reduce((s, r) => s + r.totalAmt, 0);
  const vatTotal = mockInvoiceRegister.reduce((s, r) => s + r.vat, 0);
  const taxableTotal = mockInvoiceRegister.reduce((s, r) => s + r.taxableAmt, 0);
  useReportView("invoice-register", {
    kpis: [
      { label: "Total Invoice Value", value: `AED ${total.toLocaleString()}` },
      { label: "Total VAT (Input)", value: `AED ${vatTotal.toLocaleString()}` },
      { label: "On Hold", value: String(mockInvoiceRegister.filter((r) => r.status === "On Hold").length) },
    ],
    sections: [{
      title: "Purchase Invoice Register",
      columns: [
        { key: "invNo", header: "Invoice No.", align: "left", width: 18 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "grnRef", header: "GRN Ref", align: "left", width: 16 },
        { key: "lpoRef", header: "LPO Ref", align: "left", width: 16 },
        { key: "taxableAmt", header: "Taxable (AED)", align: "right", width: 14 },
        { key: "vat", header: "VAT (AED)", align: "right", width: 12 },
        { key: "totalAmt", header: "Total (AED)", align: "right", width: 14 },
        { key: "dueDate", header: "Due Date", align: "left", width: 12 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockInvoiceRegister.map((r) => ({
        invNo: r.invNo, date: r.date, vendor: r.vendor, grnRef: r.grnRef, lpoRef: r.lpoRef,
        taxableAmt: r.taxableAmt.toLocaleString(), vat: r.vat.toLocaleString(),
        totalAmt: r.totalAmt.toLocaleString(), dueDate: r.dueDate, status: r.status,
      })),
      totals: { invNo: "TOTAL", taxableAmt: taxableTotal.toLocaleString(), vat: vatTotal.toLocaleString(), totalAmt: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Purchase Invoice Register" subtitle="All vendor invoices with VAT and reference details" count={mockInvoiceRegister.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Invoice Value" value={`AED ${total.toLocaleString()}`} sub="Gross with VAT" accent />
        <KpiCard label="Total VAT (Input)" value={`AED ${vatTotal.toLocaleString()}`} sub="Recoverable" />
        <KpiCard label="On Hold" value={String(mockInvoiceRegister.filter((r) => r.status === "On Hold").length)} sub="Awaiting clearance" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Invoice No.</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>GRN Ref</Th>
            <Th>LPO Ref</Th>
            <Th right>Taxable (AED)</Th>
            <Th right>VAT (AED)</Th>
            <Th right>Total (AED)</Th>
            <Th>Due Date</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockInvoiceRegister.map((r) => (
            <tr key={r.invNo} className="hover:bg-slate-50">
              <Td bold>{r.invNo}</Td>
              <Td muted>{r.date}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.grnRef}</Td>
              <Td muted>{r.lpoRef}</Td>
              <Td right>{r.taxableAmt.toLocaleString()}</Td>
              <Td right>{r.vat.toLocaleString()}</Td>
              <Td right bold>{r.totalAmt.toLocaleString()}</Td>
              <Td muted>{r.dueDate}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function InvoiceGrnVarianceReport() {
  useDataRevision();
  const totValueVar = mockInvGrnVariance.reduce((s, r) => s + r.valueVar, 0);
  useReportView("invoice-grn-variance", {
    kpis: [
      { label: "Items Checked", value: String(mockInvGrnVariance.length) },
      { label: "Total Value Variance", value: `AED ${totValueVar.toLocaleString()}` },
      { label: "Variance Items", value: String(mockInvGrnVariance.filter((r) => r.status === "Variance").length) },
    ],
    sections: [{
      title: "Invoice vs GRN Variance",
      columns: [
        { key: "invNo", header: "Invoice No.", align: "left", width: 18 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "grnNo", header: "GRN No.", align: "left", width: 16 },
        { key: "invQty", header: "Inv Qty", align: "right", width: 10 },
        { key: "grnQty", header: "GRN Qty", align: "right", width: 10 },
        { key: "qtyVar", header: "Qty Var", align: "right", width: 10 },
        { key: "invRate", header: "Inv Rate", align: "right", width: 10 },
        { key: "grnRate", header: "GRN Rate", align: "right", width: 10 },
        { key: "valueVar", header: "Value Var (AED)", align: "right", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockInvGrnVariance.map((r) => ({
        invNo: r.invNo, vendor: r.vendor, grnNo: r.grnNo,
        invQty: r.invQty, grnQty: r.grnQty, qtyVar: r.qtyVar,
        invRate: r.invRate.toFixed(2), grnRate: r.grnRate.toFixed(2),
        valueVar: r.valueVar !== 0 ? `${r.valueVar > 0 ? "+" : ""}${r.valueVar.toLocaleString()}` : "—",
        status: r.status,
      })),
      totals: { invNo: "TOTAL", valueVar: `${totValueVar > 0 ? "+" : ""}${totValueVar.toLocaleString()}` },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Invoice vs GRN Variance" subtitle="Rate and value differences between invoices and goods received" count={mockInvGrnVariance.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Invoice No.</Th>
              <Th>Vendor</Th>
              <Th>GRN No.</Th>
              <Th right>Inv Qty</Th>
              <Th right>GRN Qty</Th>
              <Th right>Qty Var</Th>
              <Th right>Inv Rate</Th>
              <Th right>GRN Rate</Th>
              <Th right>Value Var (AED)</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockInvGrnVariance.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <Td bold>{r.invNo}</Td>
                <Td>{r.vendor}</Td>
                <Td muted>{r.grnNo}</Td>
                <Td right>{r.invQty}</Td>
                <Td right>{r.grnQty}</Td>
                <Td right>{r.qtyVar}</Td>
                <Td right>{r.invRate.toFixed(2)}</Td>
                <Td right>{r.grnRate.toFixed(2)}</Td>
                <Td right>{r.valueVar !== 0 ? amtBadge(r.valueVar) : "—"}</Td>
                <Td>{statusBadge(r.status === "Variance" ? "Overdue" : "Active")}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Value Variance by Vendor</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockInvGrnVarianceChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Bar dataKey="variance" name="Variance (AED)" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoiceLandedCostReport() {
  useDataRevision();
  const totInvoice = mockLandedCost.reduce((s, r) => s + r.invoiceValue, 0);
  const totLanded = mockLandedCost.reduce((s, r) => s + r.freight + r.customs + r.handling, 0);
  const totNlc = mockLandedCost.reduce((s, r) => s + r.total, 0);
  useReportView("invoice-landed-cost", {
    kpis: [
      { label: "Total Invoice Value", value: `AED ${totInvoice.toLocaleString()}` },
      { label: "Total Landed Costs", value: `AED ${totLanded.toLocaleString()}` },
      { label: "Total NLC", value: `AED ${totNlc.toLocaleString()}` },
    ],
    sections: [{
      title: "Landed Cost Allocation",
      columns: [
        { key: "invNo", header: "Invoice No.", align: "left", width: 18 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "invoiceValue", header: "Invoice (AED)", align: "right", width: 14 },
        { key: "freight", header: "Freight (AED)", align: "right", width: 12 },
        { key: "customs", header: "Customs (AED)", align: "right", width: 12 },
        { key: "handling", header: "Handling (AED)", align: "right", width: 12 },
        { key: "total", header: "Total NLC (AED)", align: "right", width: 14 },
        { key: "items", header: "Items", align: "right", width: 8 },
        { key: "nlcPerItem", header: "NLC/Item", align: "right", width: 12 },
      ],
      rows: mockLandedCost.map((r) => ({
        invNo: r.invNo, vendor: r.vendor, invoiceValue: r.invoiceValue.toLocaleString(),
        freight: r.freight.toLocaleString(), customs: r.customs.toLocaleString(),
        handling: r.handling.toLocaleString(), total: r.total.toLocaleString(),
        items: r.items, nlcPerItem: r.nlcPerItem.toFixed(2),
      })),
      totals: {
        invNo: "TOTAL", invoiceValue: totInvoice.toLocaleString(),
        total: totNlc.toLocaleString(),
      },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Landed Cost Allocation" subtitle="Freight, customs, handling allocated per purchase invoice" count={mockLandedCost.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Invoice Value" value={`AED ${mockLandedCost.reduce((s, r) => s + r.invoiceValue, 0).toLocaleString()}`} sub="Before landed cost" accent />
        <KpiCard label="Total Landed Costs" value={`AED ${mockLandedCost.reduce((s, r) => s + r.freight + r.customs + r.handling, 0).toLocaleString()}`} sub="Freight + customs + handling" />
        <KpiCard label="Total NLC" value={`AED ${mockLandedCost.reduce((s, r) => s + r.total, 0).toLocaleString()}`} sub="Net landed cost" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Invoice No.</Th>
              <Th>Vendor</Th>
              <Th right>Invoice (AED)</Th>
              <Th right>Freight (AED)</Th>
              <Th right>Customs (AED)</Th>
              <Th right>Handling (AED)</Th>
              <Th right>Total NLC (AED)</Th>
              <Th right>Items</Th>
              <Th right>NLC/Item</Th>
            </tr>
          </thead>
          <tbody>
            {mockLandedCost.map((r) => (
              <tr key={r.invNo} className="hover:bg-slate-50">
                <Td bold>{r.invNo}</Td>
                <Td>{r.vendor}</Td>
                <Td right>{r.invoiceValue.toLocaleString()}</Td>
                <Td right>{r.freight.toLocaleString()}</Td>
                <Td right>{r.customs.toLocaleString()}</Td>
                <Td right>{r.handling.toLocaleString()}</Td>
                <Td right bold>{r.total.toLocaleString()}</Td>
                <Td right>{r.items}</Td>
                <Td right muted>{r.nlcPerItem.toFixed(2)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Cost Component Breakdown</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockLandedCostChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="invoice" name="Invoice" fill="#F5C742" stackId="a" />
                <Bar dataKey="freight" name="Freight" fill="#3b82f6" stackId="a" />
                <Bar dataKey="customs" name="Customs" fill="#f97316" stackId="a" />
                <Bar dataKey="handling" name="Handling" fill="#10b981" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoiceBackdatedReport() {
  useDataRevision();
  const totValue = mockBackdatedInv.reduce((s, r) => s + r.value, 0);
  useReportView("invoice-backdated", {
    kpis: [
      { label: "Backdated Invoices", value: String(mockBackdatedInv.length) },
      { label: "Total Backdated Value", value: `AED ${totValue.toLocaleString()}` },
    ],
    sections: [{
      title: "Backdated Invoice Report",
      columns: [
        { key: "invNo", header: "Invoice No.", align: "left", width: 18 },
        { key: "invDate", header: "Invoice Date", align: "left", width: 12 },
        { key: "postDate", header: "Post Date", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "postedBy", header: "Posted By", align: "left", width: 18 },
        { key: "period", header: "Locked Period", align: "left", width: 12 },
      ],
      rows: mockBackdatedInv.map((r) => ({
        invNo: r.invNo, invDate: r.invDate, postDate: r.postDate, vendor: r.vendor,
        value: r.value.toLocaleString(), postedBy: r.postedBy, period: r.period,
      })),
      totals: { invNo: "TOTAL", value: totValue.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Backdated Invoice Report" subtitle="Invoices posted after the period lock date" count={mockBackdatedInv.length} />
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Backdated Invoices" value={String(mockBackdatedInv.length)} sub="Period violations" accent />
        <KpiCard label="Total Backdated Value" value={`AED ${mockBackdatedInv.reduce((s, r) => s + r.value, 0).toLocaleString()}`} sub="Financial impact" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Invoice No.</Th>
            <Th>Invoice Date</Th>
            <Th>Post Date</Th>
            <Th>Vendor</Th>
            <Th right>Value (AED)</Th>
            <Th>Posted By</Th>
            <Th>Locked Period</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockBackdatedInv.map((r) => (
            <tr key={r.invNo} className="hover:bg-slate-50">
              <Td bold>{r.invNo}</Td>
              <Td muted>{r.invDate}</Td>
              <Td muted>{r.postDate}</Td>
              <Td>{r.vendor}</Td>
              <Td right bold>{r.value.toLocaleString()}</Td>
              <Td>{r.postedBy}</Td>
              <Td muted>{r.period}</Td>
              <Td>{statusBadge("Overdue")}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function PaymentRegisterReport() {
  useDataRevision();
  const total = mockPaymentRegister.reduce((s, r) => s + r.amount, 0);
  useReportView("payment-register", {
    kpis: [
      { label: "Total Payments", value: `AED ${total.toLocaleString()}` },
      { label: "Bank Transfers", value: String(mockPaymentRegister.filter((r) => r.mode === "Bank Transfer").length) },
      { label: "Cheque / PDC", value: String(mockPaymentRegister.filter((r) => r.mode === "Cheque" || r.mode === "PDC").length) },
    ],
    sections: [{
      title: "Payment Voucher Register",
      columns: [
        { key: "pvNo", header: "PV No.", align: "left", width: 16 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "invRef", header: "Invoice Ref", align: "left", width: 18 },
        { key: "mode", header: "Mode", align: "left", width: 14 },
        { key: "bank", header: "Bank", align: "left", width: 14 },
        { key: "amount", header: "Amount (AED)", align: "right", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockPaymentRegister.map((r) => ({
        pvNo: r.pvNo, date: r.date, vendor: r.vendor, invRef: r.invRef,
        mode: r.mode, bank: r.bank, amount: r.amount.toLocaleString(), status: r.status,
      })),
      totals: { pvNo: "TOTAL", amount: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Payment Voucher Register" subtitle="All vendor payments with mode and bank details" count={mockPaymentRegister.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Payments" value={`AED ${total.toLocaleString()}`} sub="Period total" accent />
        <KpiCard label="Bank Transfers" value={String(mockPaymentRegister.filter((r) => r.mode === "Bank Transfer").length)} sub="Transactions" />
        <KpiCard label="Cheque / PDC" value={String(mockPaymentRegister.filter((r) => r.mode === "Cheque" || r.mode === "PDC").length)} sub="Instruments" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>PV No.</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>Invoice Ref</Th>
            <Th>Mode</Th>
            <Th>Bank</Th>
            <Th right>Amount (AED)</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockPaymentRegister.map((r) => (
            <tr key={r.pvNo} className="hover:bg-slate-50">
              <Td bold>{r.pvNo}</Td>
              <Td muted>{r.date}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.invRef}</Td>
              <Td muted>{r.mode}</Td>
              <Td muted>{r.bank}</Td>
              <Td right bold>{r.amount.toLocaleString()}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function PaymentAgingReport() {
  useDataRevision();
  const totals = mockPaymentAging.reduce((s, r) => ({
    total: s.total + r.total, overdue0: s.overdue0 + r.overdue0, overdue30: s.overdue30 + r.overdue30,
    overdue60: s.overdue60 + r.overdue60, overdue90plus: s.overdue90plus + r.overdue90plus,
  }), { total: 0, overdue0: 0, overdue30: 0, overdue60: 0, overdue90plus: 0 });
  useReportView("payment-aging", {
    kpis: [
      { label: "Total Payables", value: `AED ${totals.total.toLocaleString()}` },
      { label: "Current", value: `AED ${totals.overdue0.toLocaleString()}` },
      { label: "Overdue 30d+", value: `AED ${(totals.overdue30 + totals.overdue60 + totals.overdue90plus).toLocaleString()}` },
    ],
    sections: [{
      title: "Payment Aging & Delay",
      columns: [
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "total", header: "Total (AED)", align: "right", width: 14 },
        { key: "overdue0", header: "Current", align: "right", width: 12 },
        { key: "overdue30", header: "0-30d", align: "right", width: 12 },
        { key: "overdue60", header: "31-60d", align: "right", width: 12 },
        { key: "overdue90plus", header: "60d+", align: "right", width: 12 },
        { key: "avgDelay", header: "Avg Delay (days)", align: "right", width: 14 },
      ],
      rows: mockPaymentAging.map((r) => ({
        vendor: r.vendor, total: r.total.toLocaleString(), overdue0: r.overdue0.toLocaleString(),
        overdue30: r.overdue30.toLocaleString(), overdue60: r.overdue60.toLocaleString(),
        overdue90plus: r.overdue90plus.toLocaleString(), avgDelay: r.avgDelay,
      })),
      totals: {
        vendor: "TOTAL", total: totals.total.toLocaleString(), overdue0: totals.overdue0.toLocaleString(),
        overdue30: totals.overdue30.toLocaleString(), overdue60: totals.overdue60.toLocaleString(),
        overdue90plus: totals.overdue90plus.toLocaleString(),
      },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Payment Aging & Delay" subtitle="Due vs actual payment analysis by vendor" count={mockPaymentAging.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th right>Total (AED)</Th>
              <Th right>Current</Th>
              <Th right>0-30d</Th>
              <Th right>31-60d</Th>
              <Th right>60d+</Th>
              <Th right>Avg Delay (days)</Th>
            </tr>
          </thead>
          <tbody>
            {mockPaymentAging.map((r) => (
              <tr key={r.vendor} className="hover:bg-slate-50">
                <Td bold>{r.vendor}</Td>
                <Td right bold>{r.total.toLocaleString()}</Td>
                <Td right>{r.overdue0.toLocaleString()}</Td>
                <Td right>{r.overdue30.toLocaleString()}</Td>
                <Td right>{r.overdue60.toLocaleString()}</Td>
                <Td right><span className={r.overdue90plus > 0 ? "text-red-600 font-semibold" : "text-slate-500"}>{r.overdue90plus.toLocaleString()}</span></Td>
                <Td right><span className={r.avgDelay > 15 ? "text-red-600 font-semibold" : "text-emerald-700 font-semibold"}>{r.avgDelay}</span></Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Aging Distribution by Vendor</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockPaymentAgingChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="current" name="Current" fill="#10b981" stackId="a" />
                <Bar dataKey="d30" name="0-30d" fill="#F5C742" stackId="a" />
                <Bar dataKey="d60" name="31-60d" fill="#f97316" stackId="a" />
                <Bar dataKey="d90" name="60d+" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PaymentChequeTrackingReport() {
  useDataRevision();
  const totAmt = mockChequeTracking.reduce((s, r) => s + r.amount, 0);
  useReportView("payment-cheque-tracking", {
    kpis: [
      { label: "Total Cheque Value", value: `AED ${totAmt.toLocaleString()}` },
      { label: "Cleared", value: String(mockChequeTracking.filter((r) => r.status === "Cleared").length) },
      { label: "Bounced / Pending", value: String(mockChequeTracking.filter((r) => r.status !== "Cleared").length) },
    ],
    sections: [{
      title: "Cheque / PDC Tracking",
      columns: [
        { key: "chequeNo", header: "Cheque No.", align: "left", width: 14 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "bank", header: "Bank", align: "left", width: 14 },
        { key: "branch", header: "Branch", align: "left", width: 14 },
        { key: "amount", header: "Amount (AED)", align: "right", width: 14 },
        { key: "chequeDate", header: "Cheque Date", align: "left", width: 12 },
        { key: "pvNo", header: "PV No.", align: "left", width: 14 },
        { key: "clearedDate", header: "Cleared Date", align: "left", width: 12 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockChequeTracking.map((r) => ({
        chequeNo: r.chequeNo, vendor: r.vendor, bank: r.bank, branch: r.branch,
        amount: r.amount.toLocaleString(), chequeDate: r.chequeDate,
        pvNo: r.pvNo, clearedDate: r.clearedDate, status: r.status,
      })),
      totals: { chequeNo: "TOTAL", amount: totAmt.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Cheque / PDC Tracking" subtitle="Post-dated cheques with clearance status" count={mockChequeTracking.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Cheque Value" value={`AED ${mockChequeTracking.reduce((s, r) => s + r.amount, 0).toLocaleString()}`} sub="All instruments" accent />
        <KpiCard label="Cleared" value={String(mockChequeTracking.filter((r) => r.status === "Cleared").length)} sub="Cheques" />
        <KpiCard label="Bounced / Pending" value={String(mockChequeTracking.filter((r) => r.status !== "Cleared").length)} sub="Requires attention" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Cheque No.</Th>
            <Th>Vendor</Th>
            <Th>Bank</Th>
            <Th>Branch</Th>
            <Th right>Amount (AED)</Th>
            <Th>Cheque Date</Th>
            <Th>PV No.</Th>
            <Th>Cleared Date</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockChequeTracking.map((r) => (
            <tr key={r.chequeNo} className="hover:bg-slate-50">
              <Td bold>{r.chequeNo}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.bank}</Td>
              <Td muted>{r.branch}</Td>
              <Td right bold>{r.amount.toLocaleString()}</Td>
              <Td muted>{r.chequeDate}</Td>
              <Td muted>{r.pvNo}</Td>
              <Td muted>{r.clearedDate}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function PaymentAdvanceReport() {
  useDataRevision();
  const totAdv = mockAdvancePayment.reduce((s, r) => s + r.advAmount, 0);
  const totBal = mockAdvancePayment.reduce((s, r) => s + r.balance, 0);
  useReportView("payment-advance", {
    kpis: [
      { label: "Total Advances", value: `AED ${totAdv.toLocaleString()}` },
      { label: "Unadjusted Balance", value: `AED ${totBal.toLocaleString()}` },
    ],
    sections: [{
      title: "Advance Payment Utilization",
      columns: [
        { key: "pvNo", header: "PV No.", align: "left", width: 14 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "advDate", header: "Adv Date", align: "left", width: 12 },
        { key: "advAmount", header: "Advance (AED)", align: "right", width: 14 },
        { key: "adjusted", header: "Adjusted (AED)", align: "right", width: 14 },
        { key: "balance", header: "Balance (AED)", align: "right", width: 14 },
        { key: "lastAdj", header: "Last Adj", align: "left", width: 12 },
        { key: "status", header: "Status", align: "left", width: 10 },
      ],
      rows: mockAdvancePayment.map((r) => ({
        pvNo: r.pvNo, vendor: r.vendor, advDate: r.advDate,
        advAmount: r.advAmount.toLocaleString(), adjusted: r.adjusted.toLocaleString(),
        balance: r.balance.toLocaleString(), lastAdj: r.lastAdj, status: r.status,
      })),
      totals: { pvNo: "TOTAL", advAmount: totAdv.toLocaleString(), balance: totBal.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Advance Payment Utilization" subtitle="Vendor advances with adjustment and balance tracking" count={mockAdvancePayment.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Total Advances" value={`AED ${mockAdvancePayment.reduce((s, r) => s + r.advAmount, 0).toLocaleString()}`} sub="Given to vendors" accent />
            <KpiCard label="Unadjusted Balance" value={`AED ${mockAdvancePayment.reduce((s, r) => s + r.balance, 0).toLocaleString()}`} sub="Remaining" />
          </div>
          <Tbl>
            <thead>
              <tr>
                <Th>PV No.</Th>
                <Th>Vendor</Th>
                <Th>Adv Date</Th>
                <Th right>Advance (AED)</Th>
                <Th right>Adjusted (AED)</Th>
                <Th right>Balance (AED)</Th>
                <Th>Last Adj</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {mockAdvancePayment.map((r) => (
                <tr key={r.pvNo} className="hover:bg-slate-50">
                  <Td bold>{r.pvNo}</Td>
                  <Td>{r.vendor}</Td>
                  <Td muted>{r.advDate}</Td>
                  <Td right bold>{r.advAmount.toLocaleString()}</Td>
                  <Td right>{r.adjusted.toLocaleString()}</Td>
                  <Td right><span className={r.balance > 0 ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}>{r.balance.toLocaleString()}</span></Td>
                  <Td muted>{r.lastAdj}</Td>
                  <Td>{statusBadge(r.status === "Open" ? "Open" : "Closed")}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </div>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Advance vs Adjusted vs Balance</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockAdvChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="vendor" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="advance" name="Advance" fill="#F5C742" />
                <Bar dataKey="adjusted" name="Adjusted" fill="#10b981" />
                <Bar dataKey="balance" name="Balance" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DebitNoteRegisterReport() {
  useDataRevision();
  const total = mockDebitNoteRegister.reduce((s, r) => s + r.amount, 0);
  useReportView("debit-note-register", {
    kpis: [
      { label: "Total Debit Notes", value: `AED ${total.toLocaleString()}` },
      { label: "Settled", value: String(mockDebitNoteRegister.filter((r) => r.status === "Settled").length) },
      { label: "Pending / Rejected", value: String(mockDebitNoteRegister.filter((r) => r.status !== "Settled").length) },
    ],
    sections: [{
      title: "Debit Note Register",
      columns: [
        { key: "dnNo", header: "DN No.", align: "left", width: 14 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "grvNo", header: "GRV Ref", align: "left", width: 16 },
        { key: "reason", header: "Reason", align: "left", width: 22 },
        { key: "amount", header: "Amount (AED)", align: "right", width: 14 },
        { key: "settledDate", header: "Settled Date", align: "left", width: 14 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockDebitNoteRegister.map((r) => ({
        dnNo: r.dnNo, date: r.date, vendor: r.vendor, grvNo: r.grvNo,
        reason: r.reason, amount: r.amount.toLocaleString(), settledDate: r.settledDate, status: r.status,
      })),
      totals: { dnNo: "TOTAL", amount: total.toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Debit Note Register" subtitle="All vendor debit notes with reason and settlement status" count={mockDebitNoteRegister.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Debit Notes" value={`AED ${total.toLocaleString()}`} sub="Period total" accent />
        <KpiCard label="Settled" value={String(mockDebitNoteRegister.filter((r) => r.status === "Settled").length)} sub="Recovered" />
        <KpiCard label="Pending / Rejected" value={String(mockDebitNoteRegister.filter((r) => r.status !== "Settled").length)} sub="Open" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>DN No.</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>GRV Ref</Th>
            <Th>Reason</Th>
            <Th right>Amount (AED)</Th>
            <Th>Settled Date</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {mockDebitNoteRegister.map((r) => (
            <tr key={r.dnNo} className="hover:bg-slate-50">
              <Td bold>{r.dnNo}</Td>
              <Td muted>{r.date}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.grvNo}</Td>
              <Td muted>{r.reason}</Td>
              <Td right bold>{r.amount.toLocaleString()}</Td>
              <Td muted>{r.settledDate}</Td>
              <Td>{statusBadge(r.status)}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function ClaimSettlementReport() {
  useDataRevision();
  const settledClaims = mockClaimSettlement.filter((r) => r.status === "Settled");
  const avgSettlementDays = settledClaims.length ? Math.round(settledClaims.reduce((s, r) => s + r.daysToSettle, 0) / settledClaims.length) : 0;
  useReportView("claim-settlement", {
    kpis: [
      { label: "Settled Claims", value: String(settledClaims.length) },
      { label: "Avg Settlement Days", value: `${avgSettlementDays} days` },
    ],
    sections: [{
      title: "Claim Settlement Status",
      columns: [
        { key: "claimNo", header: "Claim No.", align: "left", width: 14 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "amount", header: "Amount (AED)", align: "right", width: 14 },
        { key: "issueDate", header: "Issue Date", align: "left", width: 12 },
        { key: "settleDate", header: "Settle Date", align: "left", width: 12 },
        { key: "daysToSettle", header: "Days", align: "right", width: 10 },
        { key: "status", header: "Status", align: "left", width: 12 },
      ],
      rows: mockClaimSettlement.map((r) => ({
        claimNo: r.claimNo, vendor: r.vendor, amount: r.amount.toLocaleString(),
        issueDate: r.issueDate, settleDate: r.settleDate, daysToSettle: r.daysToSettle, status: r.status,
      })),
    }],
  });

  return (
    <div className="space-y-3">
      <ReportHeader title="Claim Settlement Status" subtitle="Lifecycle tracking: issued â†’ accepted â†’ settled / rejected" count={mockClaimSettlement.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Settled Claims" value={String(settledClaims.length)} sub="Resolved" accent />
            <KpiCard label="Avg Settlement Days" value={`${avgSettlementDays} days`} sub="For settled claims" />
          </div>
          <Tbl>
            <thead>
              <tr>
                <Th>Claim No.</Th>
                <Th>Vendor</Th>
                <Th right>Amount (AED)</Th>
                <Th>Issue Date</Th>
                <Th>Settle Date</Th>
                <Th right>Days</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {mockClaimSettlement.map((r) => (
                <tr key={r.claimNo} className="hover:bg-slate-50">
                  <Td bold>{r.claimNo}</Td>
                  <Td>{r.vendor}</Td>
                  <Td right bold>{r.amount.toLocaleString()}</Td>
                  <Td muted>{r.issueDate}</Td>
                  <Td muted>{r.settleDate}</Td>
                  <Td right muted>{r.daysToSettle}</Td>
                  <Td>{statusBadge(r.status)}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </div>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Claims by Status</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={mockClaimStatusChart} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {mockClaimStatusChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VendorClaimHistoryReport() {
  useDataRevision();
  useReportView("vendor-claim-history", {
    kpis: [],
    sections: [{
      title: "Vendor Claim History",
      columns: [
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "totalClaims", header: "Total Claims", align: "right", width: 12 },
        { key: "settled", header: "Settled", align: "right", width: 10 },
        { key: "rejected", header: "Rejected", align: "right", width: 10 },
        { key: "pending", header: "Pending", align: "right", width: 10 },
        { key: "totalValue", header: "Total Value (AED)", align: "right", width: 14 },
        { key: "avgSettleDays", header: "Avg Settle Days", align: "right", width: 14 },
        { key: "lastClaimDate", header: "Last Claim", align: "left", width: 12 },
      ],
      rows: mockVendorClaimHistory.map((r) => ({
        vendor: r.vendor, totalClaims: r.totalClaims, settled: r.settled,
        rejected: r.rejected, pending: r.pending, totalValue: r.totalValue.toLocaleString(),
        avgSettleDays: r.avgSettleDays, lastClaimDate: r.lastClaimDate,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Vendor Claim History" subtitle="Claim frequency, values, and settlement performance by vendor" count={mockVendorClaimHistory.length} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tbl>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th right>Total Claims</Th>
              <Th right>Settled</Th>
              <Th right>Rejected</Th>
              <Th right>Pending</Th>
              <Th right>Total Value (AED)</Th>
              <Th right>Avg Settle Days</Th>
              <Th>Last Claim</Th>
            </tr>
          </thead>
          <tbody>
            {mockVendorClaimHistory.map((r) => (
              <tr key={r.vendor} className="hover:bg-slate-50">
                <Td bold>{r.vendor}</Td>
                <Td right>{r.totalClaims}</Td>
                <Td right><span className="text-emerald-700 font-semibold">{r.settled}</span></Td>
                <Td right><span className="text-red-600 font-semibold">{r.rejected}</span></Td>
                <Td right><span className="text-amber-700 font-semibold">{r.pending}</span></Td>
                <Td right bold>{r.totalValue.toLocaleString()}</Td>
                <Td right muted>{r.avgSettleDays}</Td>
                <Td muted>{r.lastClaimDate}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3"><CardTitle className="text-xs font-semibold text-slate-800">Settled vs Rejected vs Pending by Vendor</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mockVendorClaimChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="settled" name="Settled" fill="#10b981" />
                <Bar dataKey="rejected" name="Rejected" fill="#ef4444" />
                <Bar dataKey="pending" name="Pending" fill="#F5C742" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VatInputRegisterReport() {
  useDataRevision();
  const totalTaxable = mockVatInput.reduce((s, r) => s + r.taxableAmt, 0);
  const totalVat = mockVatInput.reduce((s, r) => s + r.vatAmt, 0);
  useReportView("vat-input-register", {
    kpis: [
      { label: "Total Taxable Value", value: `AED ${totalTaxable.toLocaleString()}` },
      { label: "Total Input VAT", value: `AED ${totalVat.toLocaleString()}` },
      { label: "Total Incl. VAT", value: `AED ${(totalTaxable + totalVat).toLocaleString()}` },
    ],
    sections: [{
      title: "VAT Input Register (UAE)",
      columns: [
        { key: "invNo", header: "Invoice No.", align: "left", width: 18 },
        { key: "invDate", header: "Date", align: "left", width: 12 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "trn", header: "TRN", align: "left", width: 16 },
        { key: "taxableAmt", header: "Taxable (AED)", align: "right", width: 14 },
        { key: "vatAmt", header: "VAT (AED)", align: "right", width: 12 },
        { key: "totalAmt", header: "Total (AED)", align: "right", width: 14 },
        { key: "vatRate", header: "VAT Rate", align: "left", width: 10 },
        { key: "period", header: "Period", align: "left", width: 12 },
      ],
      rows: mockVatInput.map((r) => ({
        invNo: r.invNo, invDate: r.invDate, vendor: r.vendor, trn: r.trn,
        taxableAmt: r.taxableAmt.toLocaleString(), vatAmt: r.vatAmt.toLocaleString(),
        totalAmt: r.totalAmt.toLocaleString(), vatRate: r.vatRate, period: r.period,
      })),
      totals: { invNo: "TOTAL", taxableAmt: totalTaxable.toLocaleString(), vatAmt: totalVat.toLocaleString(), totalAmt: (totalTaxable + totalVat).toLocaleString() },
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="VAT Input Register (UAE)" subtitle="Input tax register for FTA filing — all taxable purchases" count={mockVatInput.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Taxable Value" value={`AED ${totalTaxable.toLocaleString()}`} sub="Excl. VAT" accent />
        <KpiCard label="Total Input VAT" value={`AED ${totalVat.toLocaleString()}`} sub="Recoverable @ 5%" />
        <KpiCard label="Total Incl. VAT" value={`AED ${(totalTaxable + totalVat).toLocaleString()}`} sub="Gross" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Invoice No.</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>TRN</Th>
            <Th right>Taxable (AED)</Th>
            <Th right>VAT (AED)</Th>
            <Th right>Total (AED)</Th>
            <Th>VAT Rate</Th>
            <Th>Period</Th>
          </tr>
        </thead>
        <tbody>
          {mockVatInput.map((r) => (
            <tr key={r.invNo} className="hover:bg-slate-50">
              <Td bold>{r.invNo}</Td>
              <Td muted>{r.invDate}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.trn}</Td>
              <Td right>{r.taxableAmt.toLocaleString()}</Td>
              <Td right><span className="text-blue-700 font-semibold">{r.vatAmt.toLocaleString()}</span></Td>
              <Td right bold>{r.totalAmt.toLocaleString()}</Td>
              <Td muted>{r.vatRate}</Td>
              <Td muted>{r.period}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function PeriodLockViolationsReport() {
  useDataRevision();
  const breachedPeriods = new Set(mockPeriodLockViolations.map((r) => r.lockedPeriod).filter(Boolean)).size;
  useReportView("period-lock-violations", {
    kpis: [
      { label: "Total Violations", value: String(mockPeriodLockViolations.length) },
      { label: "Periods Breached", value: String(breachedPeriods) },
      { label: "Users Involved", value: String(new Set(mockPeriodLockViolations.map((r) => r.user)).size) },
    ],
    sections: [{
      title: "Period Lock Violation Report",
      columns: [
        { key: "refNo", header: "Ref No.", align: "left", width: 16 },
        { key: "type", header: "Type", align: "left", width: 16 },
        { key: "txDate", header: "Transaction Date", align: "left", width: 14 },
        { key: "postDate", header: "Post Date", align: "left", width: 14 },
        { key: "lockedPeriod", header: "Locked Period", align: "left", width: 12 },
        { key: "user", header: "User", align: "left", width: 18 },
        { key: "reason", header: "Reason", align: "left", width: 24 },
      ],
      rows: mockPeriodLockViolations.map((r) => ({
        refNo: r.refNo, type: r.type, txDate: r.txDate, postDate: r.postDate,
        lockedPeriod: r.lockedPeriod, user: r.user, reason: r.reason,
      })),
    }],
  });

  return (
    <div className="space-y-3">
      <ReportHeader title="Period Lock Violation Report" subtitle="Transactions posted into closed accounting periods" count={mockPeriodLockViolations.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Violations" value={String(mockPeriodLockViolations.length)} sub="This period" accent />
        <KpiCard label="Periods Breached" value={String(breachedPeriods)} sub="Locked periods" />
        <KpiCard label="Users Involved" value={String(new Set(mockPeriodLockViolations.map((r) => r.user)).size)} sub="Unique users" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Ref No.</Th>
            <Th>Type</Th>
            <Th>Transaction Date</Th>
            <Th>Post Date</Th>
            <Th>Locked Period</Th>
            <Th>User</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {mockPeriodLockViolations.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <Td bold>{r.refNo}</Td>
              <Td muted>{r.type}</Td>
              <Td muted>{r.txDate}</Td>
              <Td muted>{r.postDate}</Td>
              <Td><Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">{r.lockedPeriod}</Badge></Td>
              <Td>{r.user}</Td>
              <Td muted>{r.reason}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function MissingDocumentsReport() {
  useDataRevision();
  const totalValue = mockMissingDocuments.reduce((s, r) => s + r.value, 0);
  useReportView("missing-documents", {
    kpis: [
      { label: "Total Issues", value: String(mockMissingDocuments.length) },
      { label: "Critical", value: String(mockMissingDocuments.filter((r) => r.status === "Critical").length) },
      { label: "Total Value at Risk", value: `AED ${totalValue.toLocaleString()}` },
    ],
    sections: [{
      title: "Missing Document Report",
      columns: [
        { key: "refNo", header: "Ref No.", align: "left", width: 16 },
        { key: "type", header: "Issue Type", align: "left", width: 20 },
        { key: "vendor", header: "Vendor", align: "left", width: 20 },
        { key: "date", header: "Date", align: "left", width: 12 },
        { key: "value", header: "Value (AED)", align: "right", width: 14 },
        { key: "daysOpen", header: "Days Open", align: "right", width: 10 },
        { key: "status", header: "Priority", align: "left", width: 12 },
      ],
      rows: mockMissingDocuments.map((r) => ({
        refNo: r.refNo, type: r.type, vendor: r.vendor, date: r.date,
        value: r.value.toLocaleString(), daysOpen: r.daysOpen, status: r.status,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Missing Document Report" subtitle="GRNs, invoices, and payments with missing required documents" count={mockMissingDocuments.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Issues" value={String(mockMissingDocuments.length)} sub="Open items" accent />
        <KpiCard label="Critical" value={String(mockMissingDocuments.filter((r) => r.status === "Critical").length)} sub="High priority" />
        <KpiCard label="Total Value at Risk" value={`AED ${mockMissingDocuments.reduce((s, r) => s + r.value, 0).toLocaleString()}`} sub="Unverified transactions" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Ref No.</Th>
            <Th>Issue Type</Th>
            <Th>Vendor</Th>
            <Th>Date</Th>
            <Th right>Value (AED)</Th>
            <Th right>Days Open</Th>
            <Th>Priority</Th>
          </tr>
        </thead>
        <tbody>
          {mockMissingDocuments.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <Td bold>{r.refNo}</Td>
              <Td>{r.type}</Td>
              <Td>{r.vendor}</Td>
              <Td muted>{r.date}</Td>
              <Td right bold>{r.value.toLocaleString()}</Td>
              <Td right><span className={r.daysOpen > 14 ? "text-red-600 font-bold" : "text-amber-600 font-semibold"}>{r.daysOpen}</span></Td>
              <Td>{r.status === "Critical" ? <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">Critical</Badge> : <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Warning</Badge>}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

function AuditTrailReport() {
  useDataRevision();
  const actionColors: Record<string, string> = {
    Edit: "bg-amber-100 text-amber-700 border-amber-300",
    Delete: "bg-red-100 text-red-700 border-red-300",
    Create: "bg-emerald-100 text-emerald-700 border-emerald-300",
    Approve: "bg-blue-100 text-blue-700 border-blue-300",
    Post: "bg-purple-100 text-purple-700 border-purple-300",
  };
  useReportView("audit-trail", {
    kpis: [
      { label: "Total Actions", value: String(mockAuditTrail.length) },
      { label: "Edit / Delete Actions", value: String(mockAuditTrail.filter((r) => r.action === "Edit" || r.action === "Delete").length) },
      { label: "Users Active", value: String(new Set(mockAuditTrail.map((r) => r.user)).size) },
    ],
    sections: [{
      title: "Audit Trail Report",
      columns: [
        { key: "timestamp", header: "Timestamp", align: "left", width: 18 },
        { key: "user", header: "User", align: "left", width: 18 },
        { key: "action", header: "Action", align: "left", width: 10 },
        { key: "module", header: "Module", align: "left", width: 16 },
        { key: "refNo", header: "Ref No.", align: "left", width: 16 },
        { key: "field", header: "Field", align: "left", width: 14 },
        { key: "before", header: "Before", align: "left", width: 14 },
        { key: "after", header: "After", align: "left", width: 14 },
      ],
      rows: mockAuditTrail.map((r) => ({
        timestamp: r.timestamp, user: r.user, action: r.action, module: r.module,
        refNo: r.refNo, field: r.field, before: r.before, after: r.after,
      })),
    }],
  });
  return (
    <div className="space-y-3">
      <ReportHeader title="Audit Trail Report" subtitle="Complete user action log with before/after values" count={mockAuditTrail.length} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Actions" value={String(mockAuditTrail.length)} sub="Last 48 hours shown" accent />
        <KpiCard label="Edit / Delete Actions" value={String(mockAuditTrail.filter((r) => r.action === "Edit" || r.action === "Delete").length)} sub="High-risk actions" />
        <KpiCard label="Users Active" value={String(new Set(mockAuditTrail.map((r) => r.user)).size)} sub="Unique users" />
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Timestamp</Th>
            <Th>User</Th>
            <Th>Action</Th>
            <Th>Module</Th>
            <Th>Ref No.</Th>
            <Th>Field</Th>
            <Th>Before</Th>
            <Th>After</Th>
          </tr>
        </thead>
        <tbody>
          {mockAuditTrail.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <Td muted>{r.timestamp}</Td>
              <Td bold>{r.user}</Td>
              <Td><Badge variant="outline" className={`text-[10px] ${actionColors[r.action] ?? "bg-slate-100 text-slate-600 border-slate-300"}`}>{r.action}</Badge></Td>
              <Td>{r.module}</Td>
              <Td muted>{r.refNo}</Td>
              <Td muted>{r.field}</Td>
              <Td muted>{r.before}</Td>
              <Td>{r.after !== "-" ? <span className="text-emerald-700 font-semibold">{r.after}</span> : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VendorsPurchasesReports({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [activeReport, setActiveReport] = useState<ReportId>("vendor-master");
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState<Record<ReportGroupId, boolean>>({
    vendor: true,
    lpo: true,
    grn: false,
    grv: false,
    invoice: false,
    payment: false,
    claim: false,
    compliance: false,
  });

  // Filters — default to current month
  const _today = new Date();
  const _firstOfMonth = new Date(_today.getFullYear(), _today.getMonth(), 1).toISOString().split("T")[0];
  const _todayStr = _today.toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(_firstOfMonth);
  const [dateTo, setDateTo] = useState(_todayStr);
  const [vendor, setVendor] = useState("All");
  const [branch, setBranch] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [, setDataRevision] = useState(0);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [vendorList, setVendorList] = useState<{ id: number; name: string }[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorOpen, setVendorOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    getCompanyProfile().then((res) => setCompanyProfile(res.data)).catch(() => {});
    getBranches()
      .then((data: any[]) => setBranches(data.filter((b: any) => b.isActive !== false)))
      .catch(() => {});
    getVendors()
      .then((data: any[]) => setVendorList(data.filter((v: any) => v.isActive !== false).map((v: any) => ({ id: v.id, name: v.name || v.vendorName || String(v.id) }))))
      .catch(() => {});
  }, []);

  async function loadReport(signal?: AbortSignal) {
    try {
      applyLiveReportData(activeReport, { rows: [], charts: [] });
      setDataRevision((value) => value + 1);
      const data = await getPurchaseReportData(activeReport, {
        dateFrom,
        dateTo,
        vendor,
        branch,
        searchQuery: searchText,
      }, signal);
      if (!data) return;
      applyLiveReportData(activeReport, data);
      setDataRevision((value) => value + 1);
    } catch (err) {
      console.error("Failed to fetch purchase report data", err);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal);
    return () => controller.abort();
  }, [activeReport]);

  const activeDef = useMemo(() => REPORTS.find((r) => r.id === activeReport)!, [activeReport]);

  const exportMeta = () => ({
    dateFrom,
    dateTo,
    branch: branch === 'All' ? 'All' : branches.find((b: any) => String(b.id) === String(branch))?.name || branch,
    companyProfile,
  });

  function handleExportPdf() {
    const vm = getReportView(activeReport);
    if (!vm) return;
    const html = generateReportA4Html(vm, companyProfile || {}, { title: activeDef.label, ...exportMeta() });
    downloadPdf(html, activeDef.label.replace(/\s+/g, "_") + ".pdf", "Purchases Report");
  }

  function handleExportExcel() {
    const vm = getReportView(activeReport);
    if (!vm) return;
    const flat = flattenReportView(vm);
    exportToExcel(flat.rows, flat.columns, activeDef.label.replace(/\s+/g, "_"), exportMeta());
  }

  function handlePrint() {
    const vm = getReportView(activeReport);
    if (!vm) return;
    const html = generateReportA4Html(vm, companyProfile || {}, { title: activeDef.label, ...exportMeta() });
    printHtml(html);
  }

  function handleDownloadCsv() {
    const vm = getReportView(activeReport);
    if (!vm) return;
    const flat = flattenReportView(vm);
    const rows = flat.rows;
    if (!rows.length) return;
    const cols = flat.columns;
    const csv = [
      cols.map((c: any) => `"${c.header}"`).join(","),
      ...rows.map((r: any) => cols.map((c: any) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${activeDef.label.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const groupMeta: Record<ReportGroupId, { label: string; icon: React.ReactNode }> = {
    vendor: { label: "Vendor Management", icon: <Users className="h-4 w-4" /> },
    lpo: { label: "LPO / Purchase Orders", icon: <FileText className="h-4 w-4" /> },
    grn: { label: "GRN / Goods Receipt", icon: <Package className="h-4 w-4" /> },
    grv: { label: "GRV / Goods Returns", icon: <RefreshCw className="h-4 w-4" /> },
    invoice: { label: "Purchase Invoices", icon: <Receipt className="h-4 w-4" /> },
    payment: { label: "Payments & Banking", icon: <DollarSign className="h-4 w-4" /> },
    claim: { label: "Claims & Debit Notes", icon: <AlertTriangle className="h-4 w-4" /> },
    compliance: { label: "Compliance & Audit", icon: <Shield className="h-4 w-4" /> },
  };

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REPORTS;
    return REPORTS.filter((r) => {
      const hay = `${r.label} ${r.description} ${(r.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const filteredGrouped = useMemo(() => {
    const byGroup: Record<ReportGroupId, ReportDef[]> = {
      vendor: [], lpo: [], grn: [], grv: [], invoice: [], payment: [], claim: [], compliance: [],
    };
    for (const r of filteredReports) byGroup[r.group].push(r);
    return byGroup;
  }, [filteredReports]);

  function renderResults() {
    switch (activeReport) {
      case "vendor-master": return <VendorMasterReport />;
      case "vendor-aging": return <VendorAgingReport />;
      case "vendor-performance": return <VendorPerformanceReport />;
      case "vendor-price-history": return <VendorPriceHistoryReport />;
      case "vendor-contract-compliance": return <VendorContractComplianceReport />;
      case "lpo-register": return <LpoRegisterReport />;
      case "lpo-fulfillment": return <LpoFulfillmentReport />;
      case "lpo-aging": return <LpoAgingReport />;
      case "lpo-cancelled": return <LpoCancelledReport />;
      case "grn-register": return <GrnRegisterReport />;
      case "grn-variance": return <GrnVarianceReport />;
      case "grn-batch-expiry": return <GrnBatchExpiryReport />;
      case "grn-qc-rejection": return <GrnQcRejectionReport />;
      case "grv-register": return <GrvRegisterReport />;
      case "grv-reason-analysis": return <GrvReasonAnalysisReport />;
      case "grv-replacement-pending": return <GrvReplacementPendingReport />;
      case "grv-debit-note-mapping": return <GrvDebitNoteMappingReport />;
      case "invoice-register": return <InvoiceRegisterReport />;
      case "invoice-grn-variance": return <InvoiceGrnVarianceReport />;
      case "invoice-landed-cost": return <InvoiceLandedCostReport />;
      case "invoice-backdated": return <InvoiceBackdatedReport />;
      case "payment-register": return <PaymentRegisterReport />;
      case "payment-aging": return <PaymentAgingReport />;
      case "payment-cheque-tracking": return <PaymentChequeTrackingReport />;
      case "payment-advance": return <PaymentAdvanceReport />;
      case "debit-note-register": return <DebitNoteRegisterReport />;
      case "claim-settlement": return <ClaimSettlementReport />;
      case "vendor-claim-history": return <VendorClaimHistoryReport />;
      case "vat-input-register": return <VatInputRegisterReport />;
      case "period-lock-violations": return <PeriodLockViolationsReport />;
      case "missing-documents": return <MissingDocumentsReport />;
      case "audit-trail": return <AuditTrailReport />;
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-slate-900 p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span
            className="cursor-pointer hover:text-slate-700"
            onClick={() => onNavigate?.("home")}
          >
            BillBull
          </span>
          <ChevronRight className="h-3 w-3" />
          <span>Vendors &amp; Purchases</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-700">Reports</span>
        </div>

        <ExportDropdown
          onExportPdf={handleExportPdf}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          onDownload={handleDownloadCsv}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_2.05fr] gap-4">
        {/* Left: Report picker */}
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="py-3 px-3">
              <CardTitle className="text-xs font-semibold text-slate-800">
                Vendors &amp; Purchases Reports
              </CardTitle>
              <span className="text-[10px] text-slate-500">
                Vendor • LPO • GRN • GRV • Invoice • Payment • Compliance
              </span>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search reports…"
                  className="pl-8 pr-3 py-1 h-9 rounded-full text-xs bg-slate-50 border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <Separator />

              {(Object.keys(groupMeta) as ReportGroupId[]).map((gid) => (
                <div key={gid} className="rounded-lg border border-slate-200 bg-slate-50/60">
                  <button
                    className="w-full px-3 py-2 flex items-center justify-between text-left"
                    onClick={() => setGroupOpen((p) => ({ ...p, [gid]: !p[gid] }))}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{groupMeta[gid].icon}</span>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-slate-800">
                          {groupMeta[gid].label}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {filteredGrouped[gid].length} report(s)
                        </span>
                      </div>
                    </div>
                    {groupOpen[gid] ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </button>

                  {groupOpen[gid] && (
                    <div className="px-2 pb-2">
                      {filteredGrouped[gid].map((r) => {
                        const isActive = r.id === activeReport;
                        return (
                          <button
                            key={r.id}
                            onClick={() => setActiveReport(r.id)}
                            className={`w-full mt-1 rounded-lg px-2 py-2 text-left border transition-colors ${
                              isActive
                                ? "border-[#F5C742] bg-[#FFF6D8]"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col">
                                <span className="text-[11px] font-medium text-slate-800">
                                  {r.label}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {r.description}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[9px] shrink-0 ${
                                  r.kind === "table+chart"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-50 text-slate-700 border-slate-200"
                                }`}
                              >
                                {r.kind === "table+chart" ? "Chart" : "Table"}
                              </Badge>
                            </div>

                            {r.tags?.length ? (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {r.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="py-3 px-3">
              <CardTitle className="text-xs font-semibold text-slate-800">
                Quick guidance
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-[11px] text-slate-600 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <span>
                  Start with <b>Vendor Aging</b> and <b>LPO Register</b> for an immediate payables overview.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  Run <b>VAT Input Register</b> monthly before FTA filing; check <b>Missing Documents</b> weekly.
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right: Filters + Results */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >
          {/* Filters */}
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="py-3 px-3 flex flex-row items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <CardTitle className="text-xs font-semibold text-slate-800">Filters</CardTitle>
                <span className="text-[10px] text-slate-500">
                  Applied to: <b>{activeDef.label}</b>
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className={`h-7 px-3 text-[11px] rounded-full border flex items-center gap-1 transition-colors ${
                  showAdvanced 
                    ? "bg-[#F5C742] border-[#E5B426] text-slate-900 font-medium" 
                    : "border-[#F5C742]/70 bg-[#FFF6D8] text-slate-800"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                Advanced
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Date From
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 text-[11px] bg-slate-50 border-slate-200"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Date To
                  </label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 text-[11px] bg-slate-50 border-slate-200"
                  />
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    Vendor
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={vendorOpen ? vendorSearch : (vendor === "All" ? "" : vendor)}
                      placeholder={vendor === "All" ? "All" : vendor}
                      onFocus={() => { setVendorOpen(true); setVendorSearch(""); }}
                      onChange={(e) => { setVendorSearch(e.target.value); setVendorOpen(true); }}
                      onBlur={() => setTimeout(() => setVendorOpen(false), 150)}
                      className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    {vendorOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {[{ id: 0, name: "All" }, ...vendorList]
                          .filter(o => !vendorSearch || o.name.toLowerCase().includes(vendorSearch.toLowerCase()))
                          .map(o => (
                            <button
                              key={o.id}
                              type="button"
                              onMouseDown={() => { setVendor(o.name); setVendorOpen(false); setVendorSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${vendor === o.name ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                            >
                              {o.name}
                            </button>
                          ))}
                        {vendorList.filter(o => !vendorSearch || o.name.toLowerCase().includes(vendorSearch.toLowerCase())).length === 0 && vendorSearch && (
                          <div className="px-3 py-2 text-[11px] text-slate-400">No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    Branch
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2"
                  >
                    <option value="All">All</option>
                    {branches.map((b) => (
                      <option key={b.id} value={String(b.id)}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {showAdvanced && (
                  <div className="space-y-1.5 col-span-2 xl:col-start-1">
                    <label className="text-[11px] text-slate-600">
                      Item / SKU Search
                    </label>
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search item name or SKU…"
                      className="h-8 text-[11px] bg-slate-50 border-slate-200"
                    />
                  </div>
                )}

                <div className={`flex items-end gap-2 ${!showAdvanced ? "xl:col-start-4 md:col-start-2" : "xl:col-start-4"}`}>
                  <Button onClick={() => loadReport()} className="flex-1 h-8 text-[11px] bg-[#F5C742] hover:bg-[#e4b82e] text-slate-900">
                    Generate
                  </Button>
                  <Button variant="ghost" onClick={handleExportExcel} className="h-8 text-[11px] text-slate-600 flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {renderResults()}
        </motion.div>
      </div>
    </div>
  );
}
