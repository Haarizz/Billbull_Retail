import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../Sales/Reports/ui/card";
import { Button } from "../Sales/Reports/ui/button";
import { Input } from "../Sales/Reports/ui/input";
import { Badge } from "../Sales/Reports/ui/badge";
import { Separator } from "../Sales/Reports/ui/separator";
import {
  TrendingUp,
  Building2,
  DollarSign,
  Calculator,
  BookOpen,
  Landmark,
  ArrowUpDown,
  Receipt,
  FileText,
  Download,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Printer,
  Calendar,
  Users,
  Building,
  BarChart3,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Clock,
  Activity,
} from "lucide-react";
import { getProfitLoss, getBalanceSheet, getTrialBalance, getCashFlow, getTaxDashboard, getTaxReconciliation, getARAgingReport, getAPAgingReport } from "../../api/financialReportsBackendApi";

let mockProfitLossSections: any = null;
let mockGrossProfitRows: any = null;
let mockBalanceSheetAssets: any = null;
let mockBalanceSheetEqLiab: any = null;
let mockTrialBalanceRows: any = null;
let mockCashFlowSections: any = null;
let mockCashFlowData: any = null;
let mockCustomerAgingRows: any = null;
let mockVendorAgingRows: any = null;
let mockVatDashboard: any = null;
let mockVatOutputLines: any = null;
let mockVatInputLines: any = null;

function applyLiveReportData(reportId: ReportId, data: any) {
  if (!data) return;

  switch (reportId) {
    case "profit_loss": {
      if (data.revenueItems || data.cogsItems || data.operatingExpenseItems) {
        const toRow = (r: any) => ({ name: r.accountName || r.category, cur: Number(r.amount || 0), prior: Number(r.priorAmount || 0) });
        mockProfitLossSections = [
          { label: "Revenue", isRevenue: true, rows: (data.revenueItems || []).map(toRow) },
          { label: "Cost of Sales", rows: (data.cogsItems || []).map((r: any) => ({ ...toRow(r), cur: -Math.abs(Number(r.amount || 0)), prior: -Math.abs(Number(r.priorAmount || 0)) })) },
          { label: "Operating Expenses", rows: (data.operatingExpenseItems || data.expenseItems || []).map((r: any) => ({ ...toRow(r), cur: -Math.abs(Number(r.amount || 0)), prior: -Math.abs(Number(r.priorAmount || 0)) })) },
          { label: "Other Income", rows: (data.otherIncomeItems || []).map((r: any) => ({ ...toRow(r), cur: Math.abs(Number(r.amount || 0)), prior: Math.abs(Number(r.priorAmount || 0)) })) },
        ];
      }
      break;
    }
    case "balance_sheet": {
      if (data.assetItems) {
        const groupByCategory = (items: any[]) => {
          const map: Record<string, { name: string; amount: number }[]> = {};
          for (const r of items) {
            const sec = r.category || "Assets";
            if (!map[sec]) map[sec] = [];
            map[sec].push({ name: r.accountName || r.category, amount: Number(r.amount || 0) });
          }
          return map;
        };

        const assetMap = groupByCategory(data.assetItems || []);
        const ASSET_ORDER = ["Non-Current Assets", "Current Assets", "Cash & Cash Equivalents"];
        const assetKeys = ASSET_ORDER.filter(k => assetMap[k]).concat(Object.keys(assetMap).filter(k => !ASSET_ORDER.includes(k)));
        mockBalanceSheetAssets = assetKeys.map(sec => ({ section: sec, rows: assetMap[sec] }));

        const liabMap = groupByCategory(data.liabilityItems || []);
        const LIAB_ORDER = ["Non-Current Liabilities", "Current Liabilities"];
        const liabKeys = LIAB_ORDER.filter(k => liabMap[k]).concat(Object.keys(liabMap).filter(k => !LIAB_ORDER.includes(k)));
        const equityRows = (data.equityItems || []).map((r: any) => ({ name: r.accountName || r.category, amount: Number(r.amount || 0) }));

        mockBalanceSheetEqLiab = [
          ...(equityRows.length > 0 ? [{ section: "Equity", rows: equityRows }] : []),
          ...liabKeys.map(sec => ({ section: sec, rows: liabMap[sec] })),
        ];
      }
      break;
    }
    case "trial_balance": {
      const rows = data.lines || data.data;
      if (rows) {
        mockTrialBalanceRows = rows.map((r: any) => ({
          code: r.accountCode || r.code || "",
          name: r.accountName || r.name || "Unknown",
          debit: Number(r.debitBalance ?? r.debit ?? 0),
          credit: Number(r.creditBalance ?? r.credit ?? 0),
        }));
      }
      break;
    }
    case "cash_flow_statement": {
      const toRows = (items: any[]) => (items || []).map((r: any) => ({ name: r.accountName || r.category, amount: Number(r.amount || 0) }));
      if (data.operatingActivities !== undefined || data.investingActivities !== undefined) {
        mockCashFlowData = {
          ops: toRows(data.operatingActivities),
          inv: toRows(data.investingActivities),
          fin: toRows(data.financingActivities),
          totalOperating: Number(data.totalOperating || 0),
          totalInvesting: Number(data.totalInvesting || 0),
          totalFinancing: Number(data.totalFinancing || 0),
          netCashFlow: Number(data.netCashFlow || 0),
        };
      }
      break;
    }
    case "customer_aging": {
      const arr = Array.isArray(data) ? data : (data ? Object.values(data) : []);
      if (arr.length > 0) {
        mockCustomerAgingRows = arr.map((r: any) => ({
          customer: r.partnerName || r.customerName || "Unknown",
          current: Number(r.amount0to30 || 0),
          d30: Number(r.amount31to60 || 0),
          d60: Number(r.amount61to90 || 0),
          d90: 0,
          d90plus: Number(r.amount90Plus || r.amount90plus || 0),
          total: Number(r.total || 0),
        }));
      }
      break;
    }
    case "vendor_aging": {
      const arr = Array.isArray(data) ? data : (data ? Object.values(data) : []);
      if (arr.length > 0) {
        mockVendorAgingRows = arr.map((r: any) => ({
          vendor: r.partnerName || r.vendorName || "Unknown",
          current: Number(r.amount0to30 || 0),
          d30: Number(r.amount31to60 || 0),
          d60: Number(r.amount61to90 || 0),
          d90: 0,
          d90plus: Number(r.amount90Plus || r.amount90plus || 0),
          total: Number(r.total || 0),
        }));
      }
      break;
    }
    default:
      break;
  }
}


// ─── Types ───────────────────────────────────────────────────────────────────

type ReportGroupId =
  | "pl"
  | "balance"
  | "cashflow"
  | "receivables"
  | "payables"
  | "vat"
  | "audit"
  | "bank"
  | "soa";

type ReportId =
  | "profit_loss"
  | "gross_profit"
  | "departmental_pl"
  | "comparative_pl"
  | "balance_sheet"
  | "trial_balance"
  | "cash_flow_statement"
  | "bank_reconciliation"
  | "petty_cash"
  | "customer_aging"
  | "collection_efficiency"
  | "credit_utilization"
  | "vendor_aging"
  | "payment_schedule"
  | "outstanding_payables"
  | "vat_return_summary"
  | "vat_output_register"
  | "vat_input_register"
  | "journal_audit"
  | "period_close"
  | "user_activity"
  | "bank_book"
  | "pdc_received"
  | "pdc_issued"
  | "bank_transfer_log"
  | "cheque_register"
  | "bank_charges_summary"
  | "bank_position_summary"
  | "soa_customer"
  | "soa_vendor"
  | "soa_employee"
  | "soa_ledger"
  | "soa_all_accounts"
  | "soa_intercompany";

interface ReportDef {
  id: ReportId;
  group: ReportGroupId;
  label: string;
  description: string;
  kind: "table" | "table+chart";
  tags?: string[];
}

// ─── Report Definitions ──────────────────────────────────────────────────────

const REPORTS: ReportDef[] = [
  // P&L
  {
    id: "profit_loss",
    group: "pl",
    label: "Statement of Profit or Loss",
    description: "Revenue, COGS, operating expenses and net profit",
    kind: "table+chart",
    tags: ["IFRS", "income", "net profit"],
  },
  {
    id: "gross_profit",
    group: "pl",
    label: "Gross Profit Analysis",
    description: "Revenue vs cost of sales with GP% by category",
    kind: "table+chart",
    tags: ["GP%", "margin", "category"],
  },
  {
    id: "departmental_pl",
    group: "pl",
    label: "Departmental P&L",
    description: "P&L broken down by cost centre / department",
    kind: "table",
    tags: ["cost centre", "department"],
  },
  {
    id: "comparative_pl",
    group: "pl",
    label: "Comparative P&L",
    description: "Current period vs prior period vs budget",
    kind: "table",
    tags: ["budget", "variance", "YoY"],
  },
  // Balance Sheet
  {
    id: "balance_sheet",
    group: "balance",
    label: "Statement of Financial Position",
    description: "Assets, liabilities and equity at period end",
    kind: "table",
    tags: ["IFRS", "assets", "equity"],
  },
  {
    id: "trial_balance",
    group: "balance",
    label: "Trial Balance",
    description: "All account balances — debit and credit totals",
    kind: "table",
    tags: ["ledger", "debit", "credit"],
  },
  // Cash Flow
  {
    id: "cash_flow_statement",
    group: "cashflow",
    label: "Statement of Cash Flows",
    description: "Operating, investing and financing cash movements",
    kind: "table+chart",
    tags: ["IFRS", "liquidity", "indirect"],
  },
  {
    id: "bank_reconciliation",
    group: "cashflow",
    label: "Bank Reconciliation",
    description: "Book vs bank balance with uncleared items",
    kind: "table",
    tags: ["reconcile", "bank", "PDC"],
  },
  {
    id: "petty_cash",
    group: "cashflow",
    label: "Petty Cash Statement",
    description: "Petty cash receipts, payments and balance",
    kind: "table",
    tags: ["cash", "imprest"],
  },
  // Receivables
  {
    id: "customer_aging",
    group: "receivables",
    label: "Customer Aging Report",
    description: "Receivable buckets: current, 30, 60, 90, 90+ days",
    kind: "table+chart",
    tags: ["aging", "overdue", "collection"],
  },
  {
    id: "collection_efficiency",
    group: "receivables",
    label: "Collection Efficiency",
    description: "DSO, collection rate and trend by customer",
    kind: "table+chart",
    tags: ["DSO", "KPI", "collection"],
  },
  {
    id: "credit_utilization",
    group: "receivables",
    label: "Credit Utilization",
    description: "Credit limit vs outstanding balance by customer",
    kind: "table",
    tags: ["credit limit", "exposure"],
  },
  // Payables
  {
    id: "vendor_aging",
    group: "payables",
    label: "Vendor Aging Report",
    description: "Payable buckets: current, 30, 60, 90, 90+ days",
    kind: "table+chart",
    tags: ["aging", "vendor", "payable"],
  },
  {
    id: "payment_schedule",
    group: "payables",
    label: "Payment Schedule",
    description: "Upcoming due payments with PDC and wire details",
    kind: "table",
    tags: ["due date", "PDC", "schedule"],
  },
  {
    id: "outstanding_payables",
    group: "payables",
    label: "Outstanding Payables",
    description: "All unpaid invoices with ageing and priority",
    kind: "table",
    tags: ["outstanding", "invoice"],
  },
  // VAT
  {
    id: "vat_return_summary",
    group: "vat",
    label: "VAT Return Summary",
    description: "Box-level FTA VAT return (Box 1–8 standard)",
    kind: "table",
    tags: ["FTA", "UAE VAT", "5%"],
  },
  {
    id: "vat_output_register",
    group: "vat",
    label: "Output Tax Register",
    description: "All taxable supplies with output VAT detail",
    kind: "table",
    tags: ["output", "tax invoice", "standard rated"],
  },
  {
    id: "vat_input_register",
    group: "vat",
    label: "Input Tax Register",
    description: "All eligible input VAT for recovery",
    kind: "table",
    tags: ["input", "recovery", "purchases"],
  },
  // Bank
  {
    id: "bank_book",
    group: "bank",
    label: "Bank Book",
    description: "Full transaction ledger per bank account with running balance",
    kind: "table",
    tags: ["ledger", "bank account", "statement"],
  },
  {
    id: "pdc_received",
    group: "bank",
    label: "PDC Received",
    description: "Post-dated cheques received from customers — status & due dates",
    kind: "table",
    tags: ["PDC", "cheque", "customer", "due date"],
  },
  {
    id: "pdc_issued",
    group: "bank",
    label: "PDC Issued",
    description: "Post-dated cheques issued to vendors — status & due dates",
    kind: "table",
    tags: ["PDC", "cheque", "vendor", "due date"],
  },
  {
    id: "bank_transfer_log",
    group: "bank",
    label: "Bank Transfer Log",
    description: "Inter-bank and intra-company fund transfers with status",
    kind: "table",
    tags: ["transfer", "inter-bank", "SWIFT", "IBAN"],
  },
  {
    id: "cheque_register",
    group: "bank",
    label: "Cheque Register",
    description: "All cheques issued: number, payee, amount, clearance status",
    kind: "table",
    tags: ["cheque", "clearance", "void", "stale"],
  },
  {
    id: "bank_charges_summary",
    group: "bank",
    label: "Bank Charges Summary",
    description: "Bank fees, commissions and interest charges by account",
    kind: "table+chart",
    tags: ["charges", "fees", "interest", "commission"],
  },
  {
    id: "bank_position_summary",
    group: "bank",
    label: "Bank Position Summary",
    description: "Consolidated balances across all bank accounts at a glance",
    kind: "table+chart",
    tags: ["position", "balance", "multi-bank", "liquidity"],
  },
  // Statement of Accounts
  {
    id: "soa_customer",
    group: "soa",
    label: "Customer Statement of Account",
    description: "Invoices, receipts, credits and balance per customer",
    kind: "table",
    tags: ["customer", "statement", "balance", "invoice"],
  },
  {
    id: "soa_vendor",
    group: "soa",
    label: "Vendor Statement of Account",
    description: "Bills, payments, debit notes and balance per vendor",
    kind: "table",
    tags: ["vendor", "statement", "balance", "bill"],
  },
  {
    id: "soa_employee",
    group: "soa",
    label: "Employee Ledger Statement",
    description: "Salary, advances, deductions and net payable per employee",
    kind: "table",
    tags: ["employee", "salary", "advance", "payroll"],
  },
  {
    id: "soa_ledger",
    group: "soa",
    label: "Ledger Account Statement",
    description: "Full debit/credit movement for any single GL account",
    kind: "table",
    tags: ["ledger", "GL", "account", "movement"],
  },
  {
    id: "soa_all_accounts",
    group: "soa",
    label: "All Accounts Statement",
    description: "Consolidated opening, movement and closing for every account",
    kind: "table",
    tags: ["all accounts", "consolidated", "closing balance"],
  },
  {
    id: "soa_intercompany",
    group: "soa",
    label: "Intercompany Statement",
    description: "Cross-entity balances and transactions for group reconciliation",
    kind: "table",
    tags: ["intercompany", "group", "entity", "reconciliation"],
  },
  // Audit
  {
    id: "journal_audit",
    group: "audit",
    label: "Journal Audit Log",
    description: "All manual journal entries with user and reason",
    kind: "table",
    tags: ["journal", "manual", "control"],
  },
  {
    id: "period_close",
    group: "audit",
    label: "Period Close Checklist",
    description: "Month-end close tasks and sign-off status",
    kind: "table",
    tags: ["close", "month-end", "checklist"],
  },
  {
    id: "user_activity",
    group: "audit",
    label: "User Activity Report",
    description: "Login, posting and deletion events by user",
    kind: "table",
    tags: ["user", "activity", "security"],
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Tbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-[11px] border-collapse">{children}</table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  bold,
  muted,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  right?: boolean;
  bold?: boolean;
  muted?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2 border-b border-slate-100 ${right ? "text-right" : ""} ${
        bold ? "font-semibold" : ""
      } ${muted ? "text-slate-400" : "text-slate-700"} ${className}`}
    >
      {children}
    </td>
  );
}

function ReportHeader({
  title,
  subtitle,
  period,
  branch,
}: {
  title: string;
  subtitle?: string;
  period?: string;
  branch?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right flex flex-col items-end gap-0.5">
          {period && (
            <span className="text-[10px] text-slate-500">
              Period: <b className="text-slate-700">{period}</b>
            </span>
          )}
          {branch && (
            <span className="text-[10px] text-slate-500">
              Branch: <b className="text-slate-700">{branch}</b>
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 h-px bg-slate-200" />
    </div>
  );
}

function statusBadge(status: "Paid" | "Overdue" | "Partial" | "Pending" | string) {
  const map: Record<string, string> = {
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Overdue: "bg-red-50 text-red-700 border-red-200",
    Partial: "bg-amber-50 text-amber-700 border-amber-200",
    Pending: "bg-blue-50 text-blue-700 border-blue-200",
    Open: "bg-blue-50 text-blue-700 border-blue-200",
    Closed: "bg-slate-50 text-slate-600 border-slate-200",
    Done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const cls = map[status] ?? "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function aed(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 0 })}`;
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBarChart({
  data,
  color = "#F5C742",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="flex items-end gap-1.5 h-20 mt-2">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex flex-col items-center flex-1 gap-1">
          <div
            className="w-full rounded-t-sm"
            style={{
              height: `${Math.round((Math.abs(d.value) / max) * 64)}px`,
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
          <span className="text-[8px] text-slate-500 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Report Components ────────────────────────────────────────────────────────

function ProfitLossReport() {
  const sections = mockProfitLossSections || [
    {
      label: "Revenue",
      rows: [
        { name: "Membership Revenue", cur: 125_000, prior: 118_000 },
        { name: "Personal Training Revenue", cur: 35_000, prior: 32_000 },
        { name: "Class & Drop-in Revenue", cur: 18_000, prior: 16_500 },
        { name: "Retail & Merchandise Revenue", cur: 8_500, prior: 7_200 },
        { name: "Other Operating Income", cur: 2_500, prior: 2_100 },
      ],
      isRevenue: true,
    },
    {
      label: "Cost of Sales",
      rows: [
        { name: "Cost of Goods Sold (Retail)", cur: -4_250, prior: -3_600 },
        { name: "Trainer Commission", cur: -10_500, prior: -9_600 },
      ],
    },
    {
      label: "Operating Expenses",
      rows: [
        { name: "Employee Benefits Expense", cur: -45_000, prior: -42_000 },
        { name: "Depreciation & Amortisation", cur: -8_500, prior: -8_200 },
        { name: "Rent & Utilities", cur: -25_000, prior: -24_000 },
        { name: "Marketing & Advertising", cur: -6_500, prior: -5_800 },
        { name: "Repairs & Maintenance", cur: -3_200, prior: -2_900 },
        { name: "Software & Hosting", cur: -2_800, prior: -2_600 },
        { name: "Administrative Expenses", cur: -4_200, prior: -3_800 },
      ],
    },
    {
      label: "Finance",
      rows: [
        { name: "Finance Income", cur: 150, prior: 200 },
        { name: "Finance Expense", cur: -1_200, prior: -1_100 },
      ],
    },
  ];

  const totalRevCur = sections[0].rows.reduce((s, r) => s + r.cur, 0);
  const totalRevPrior = sections[0].rows.reduce((s, r) => s + r.prior, 0);
  const totalCostsCur = sections
    .slice(1)
    .flatMap((s) => s.rows)
    .reduce((a, r) => a + r.cur, 0);
  const totalCostsPrior = sections
    .slice(1)
    .flatMap((s) => s.rows)
    .reduce((a, r) => a + r.prior, 0);
  const netCur = totalRevCur + totalCostsCur;
  const netPrior = totalRevPrior + totalCostsPrior;

  const chartData = [
    { label: "Revenue", value: totalRevCur },
    { label: "Gross Profit", value: totalRevCur + sections[1].rows.reduce((a, r) => a + r.cur, 0) },
    { label: "Net Profit", value: netCur },
  ];

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Statement of Profit or Loss (P&L)"
          subtitle="IFRS-compliant income statement"
          period="Jan 2026"
          branch="All Branches"
        />

        <MiniBarChart data={chartData} />

        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th right>Current Period (AED)</Th>
                <Th right>Prior Period (AED)</Th>
                <Th right>Variance %</Th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => {
                const secCur = sec.rows.reduce((a, r) => a + r.cur, 0);
                const secPrior = sec.rows.reduce((a, r) => a + r.prior, 0);
                const secVar =
                  secPrior !== 0
                    ? (((secCur - secPrior) / Math.abs(secPrior)) * 100).toFixed(1)
                    : "—";
                return (
                  <React.Fragment key={sec.label}>
                    <tr className="bg-slate-50">
                      <Td bold>{sec.label}</Td>
                      <Td right bold>{aed(secCur)}</Td>
                      <Td right bold>{aed(secPrior)}</Td>
                      <Td right bold>
                        <span
                          className={
                            secVar !== "—" && parseFloat(secVar) >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }
                        >
                          {secVar !== "—" ? `${secVar}%` : secVar}
                        </span>
                      </Td>
                    </tr>
                    {sec.rows.map((row, ri) => {
                      const v =
                        row.prior !== 0
                          ? (((row.cur - row.prior) / Math.abs(row.prior)) * 100).toFixed(1)
                          : "—";
                      return (
                        <tr key={`${sec.label}-${ri}`}>
                          <Td className="pl-6">{row.name}</Td>
                          <Td right>{aed(row.cur)}</Td>
                          <Td right>{aed(row.prior)}</Td>
                          <Td right>
                            <span
                              className={
                                v !== "—" && parseFloat(v) >= 0
                                  ? "text-emerald-600"
                                  : "text-red-500"
                              }
                            >
                              {v !== "—" ? `${v}%` : v}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              <tr className="bg-[#FFF6D8]">
                <Td bold>Net Profit / (Loss)</Td>
                <Td right bold>{aed(netCur)}</Td>
                <Td right bold>{aed(netPrior)}</Td>
                <Td right bold>
                  <span className="text-emerald-600">
                    {(((netCur - netPrior) / Math.abs(netPrior)) * 100).toFixed(1)}%
                  </span>
                </Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function GrossProfitReport() {
  const rows = [
    { category: "Retail & FMCG", revenue: 52_000, cogs: 31_200, gp: 20_800, gpPct: 40.0 },
    { category: "Personal Training", revenue: 35_000, cogs: 10_500, gp: 24_500, gpPct: 70.0 },
    { category: "Membership", revenue: 125_000, cogs: 12_500, gp: 112_500, gpPct: 90.0 },
    { category: "Class Bookings", revenue: 18_000, cogs: 5_400, gp: 12_600, gpPct: 70.0 },
    { category: "Café & Beverages", revenue: 8_500, cogs: 3_400, gp: 5_100, gpPct: 60.0 },
  ];
  const totRev = rows.reduce((a, r) => a + r.revenue, 0);
  const totGP = rows.reduce((a, r) => a + r.gp, 0);
  const totGPPct = ((totGP / totRev) * 100).toFixed(1);

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Gross Profit Analysis"
          subtitle="Revenue vs cost of sales with GP% by category"
          period="Jan 2026"
          branch="All Branches"
        />
        <MiniBarChart data={rows.map((r) => ({ label: r.category.split(" ")[0], value: r.gpPct }))} color="#34d399" />
        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th right>Revenue (AED)</Th>
                <Th right>COGS (AED)</Th>
                <Th right>Gross Profit (AED)</Th>
                <Th right>GP %</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category}>
                  <Td>{r.category}</Td>
                  <Td right>{aed(r.revenue)}</Td>
                  <Td right>{aed(r.cogs)}</Td>
                  <Td right>{aed(r.gp)}</Td>
                  <Td right>
                    <span className={r.gpPct >= 50 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                      {r.gpPct.toFixed(1)}%
                    </span>
                  </Td>
                </tr>
              ))}
              <tr className="bg-[#FFF6D8]">
                <Td bold>Total</Td>
                <Td right bold>{aed(totRev)}</Td>
                <Td right bold>{aed(totRev - totGP)}</Td>
                <Td right bold>{aed(totGP)}</Td>
                <Td right bold>{totGPPct}%</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentalPLReport() {
  const rows = [
    { dept: "Retail – Main Branch", revenue: 52_000, expenses: 38_400, profit: 13_600 },
    { dept: "Retail – Downtown", revenue: 31_000, expenses: 24_800, profit: 6_200 },
    { dept: "Personal Training", revenue: 35_000, expenses: 12_250, profit: 22_750 },
    { dept: "Group Classes", revenue: 18_000, expenses: 7_200, profit: 10_800 },
    { dept: "Administration (Overhead)", revenue: 0, expenses: 28_500, profit: -28_500 },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Departmental P&L"
          subtitle="Profit & Loss split by cost centre / department"
          period="Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Department / Cost Centre</Th>
              <Th right>Revenue (AED)</Th>
              <Th right>Expenses (AED)</Th>
              <Th right>Net Profit (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dept}>
                <Td>{r.dept}</Td>
                <Td right>{r.revenue > 0 ? aed(r.revenue) : "—"}</Td>
                <Td right>{aed(r.expenses)}</Td>
                <Td right>
                  <span className={r.profit >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                    {aed(r.profit)}
                  </span>
                </Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold>Total</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.revenue, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.expenses, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.profit, 0))}</Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function ComparativePLReport() {
  const rows = [
    { line: "Revenue", cur: 189_000, prior: 176_000, budget: 195_000 },
    { line: "Cost of Sales", cur: -14_750, prior: -13_200, budget: -15_600 },
    { line: "Gross Profit", cur: 174_250, prior: 162_800, budget: 179_400 },
    { line: "Staff Costs", cur: -45_000, prior: -42_000, budget: -44_000 },
    { line: "Rent & Utilities", cur: -25_000, prior: -24_000, budget: -25_000 },
    { line: "Marketing", cur: -6_500, prior: -5_800, budget: -7_000 },
    { line: "Other OpEx", cur: -10_200, prior: -9_300, budget: -10_500 },
    { line: "EBITDA", cur: 87_550, prior: 81_700, budget: 92_900 },
    { line: "Depreciation", cur: -8_500, prior: -8_200, budget: -8_500 },
    { line: "Finance Cost", cur: -1_200, prior: -1_100, budget: -1_200 },
    { line: "Net Profit", cur: 77_850, prior: 72_400, budget: 83_200 },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Comparative P&L"
          subtitle="Current period vs prior period vs budget"
          period="Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Line Item</Th>
              <Th right>Current (AED)</Th>
              <Th right>Prior (AED)</Th>
              <Th right>Budget (AED)</Th>
              <Th right>vs Budget</Th>
              <Th right>vs Prior %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vsBudget = r.cur - r.budget;
              const vsPrior =
                r.prior !== 0
                  ? (((r.cur - r.prior) / Math.abs(r.prior)) * 100).toFixed(1)
                  : "—";
              const isTotal = ["Gross Profit", "EBITDA", "Net Profit"].includes(r.line);
              return (
                <tr key={r.line} className={isTotal ? "bg-slate-50" : ""}>
                  <Td bold={isTotal}>{r.line}</Td>
                  <Td right bold={isTotal}>{aed(r.cur)}</Td>
                  <Td right>{aed(r.prior)}</Td>
                  <Td right>{aed(r.budget)}</Td>
                  <Td right>
                    <span className={vsBudget >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {vsBudget >= 0 ? "+" : ""}{aed(vsBudget)}
                    </span>
                  </Td>
                  <Td right>
                    <span className={vsPrior !== "—" && parseFloat(vsPrior) >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {vsPrior !== "—" ? `${vsPrior}%` : vsPrior}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function BalanceSheetReport() {
  const assets = mockBalanceSheetAssets || [
    {
      section: "Non-current Assets",
      rows: [
        { name: "Property, Plant & Equipment", amount: 285_000 },
        { name: "Right-of-use Assets", amount: 45_000 },
        { name: "Intangible Assets", amount: 15_000 },
        { name: "Deferred Tax Assets", amount: 2_500 },
      ],
    },
    {
      section: "Current Assets",
      rows: [
        { name: "Inventories", amount: 12_000 },
        { name: "Trade & Other Receivables", amount: 18_500 },
        { name: "Prepayments", amount: 8_200 },
        { name: "Cash & Cash Equivalents", amount: 45_300 },
      ],
    },
  ];
  const eqLiab = mockBalanceSheetEqLiab || [
    {
      section: "Equity",
      rows: [
        { name: "Share Capital", amount: 100_000 },
        { name: "Retained Earnings", amount: 165_500 },
        { name: "Other Reserves", amount: 12_000 },
      ],
    },
    {
      section: "Non-current Liabilities",
      rows: [
        { name: "Long-term Borrowings", amount: 85_000 },
        { name: "Lease Liabilities", amount: 38_000 },
        { name: "Deferred Tax Liabilities", amount: 4_200 },
      ],
    },
    {
      section: "Current Liabilities",
      rows: [
        { name: "Trade & Other Payables", amount: 15_800 },
        { name: "Contract Liabilities", amount: 22_000 },
        { name: "Short-term Borrowings", amount: 8_000 },
        { name: "Tax Payable", amount: 3_500 },
      ],
    },
  ];
  const totalAssets = assets.flatMap((s) => s.rows).reduce((a, r) => a + r.amount, 0);
  const totalEqLiab = eqLiab.flatMap((s) => s.rows).reduce((a, r) => a + r.amount, 0);

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Statement of Financial Position"
          subtitle="Balance Sheet as at period end — IFRS compliant"
          period="31 Jan 2026"
          branch="All Branches"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Assets</p>
            <Tbl>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th right>AED</Th>
                </tr>
              </thead>
              <tbody>
                {assets.map((sec) => (
                  <React.Fragment key={sec.section}>
                    <tr className="bg-slate-50">
                      <Td bold colSpan={2}>{sec.section}</Td>
                    </tr>
                    {sec.rows.map((r, i) => (
                      <tr key={`asset-${sec.section}-${i}`}>
                        <Td className="pl-6">{r.name}</Td>
                        <Td right>{aed(r.amount)}</Td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/60">
                      <Td bold className="pl-6 text-slate-500 text-[10px]">
                        Sub-total {sec.section}
                      </Td>
                      <Td right bold className="text-slate-500 text-[10px]">
                        {aed(sec.rows.reduce((a, r) => a + r.amount, 0))}
                      </Td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr className="bg-[#FFF6D8]">
                  <Td bold>Total Assets</Td>
                  <Td right bold>{aed(totalAssets)}</Td>
                </tr>
              </tbody>
            </Tbl>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Equity & Liabilities</p>
            <Tbl>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th right>AED</Th>
                </tr>
              </thead>
              <tbody>
                {eqLiab.map((sec) => (
                  <React.Fragment key={sec.section}>
                    <tr className="bg-slate-50">
                      <Td bold colSpan={2}>{sec.section}</Td>
                    </tr>
                    {sec.rows.map((r, i) => (
                      <tr key={`eq-${sec.section}-${i}`}>
                        <Td className="pl-6">{r.name}</Td>
                        <Td right>{aed(r.amount)}</Td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/60">
                      <Td bold className="pl-6 text-slate-500 text-[10px]">
                        Sub-total {sec.section}
                      </Td>
                      <Td right bold className="text-slate-500 text-[10px]">
                        {aed(sec.rows.reduce((a, r) => a + r.amount, 0))}
                      </Td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr className="bg-[#FFF6D8]">
                  <Td bold>Total Equity & Liabilities</Td>
                  <Td right bold>{aed(totalEqLiab)}</Td>
                </tr>
              </tbody>
            </Tbl>
          </div>
        </div>
        {totalAssets !== totalEqLiab && (
          <p className="mt-2 text-[10px] text-red-500">
            Imbalance detected: AED {Math.abs(totalAssets - totalEqLiab).toLocaleString()}
          </p>
        )}
        {totalAssets === totalEqLiab && (
          <p className="mt-2 text-[10px] text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Balance sheet is in balance.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TrialBalanceReport() {
  const rows = mockTrialBalanceRows || [
    { code: "1000", name: "Cash at Bank – Emirates NBD", debit: 45_300, credit: 0 },
    { code: "1010", name: "Cash at Bank – ADIB", debit: 12_800, credit: 0 },
    { code: "1100", name: "Trade Receivables", debit: 18_500, credit: 0 },
    { code: "1200", name: "Inventory – Main Store", debit: 12_000, credit: 0 },
    { code: "1500", name: "Property, Plant & Equipment", debit: 285_000, credit: 0 },
    { code: "1510", name: "Acc. Depreciation – PPE", debit: 0, credit: 42_000 },
    { code: "2000", name: "Trade Payables", debit: 0, credit: 15_800 },
    { code: "2100", name: "Contract Liabilities (Deferred Rev.)", debit: 0, credit: 22_000 },
    { code: "2200", name: "Short-term Borrowings", debit: 0, credit: 8_000 },
    { code: "3000", name: "Share Capital", debit: 0, credit: 100_000 },
    { code: "3100", name: "Retained Earnings", debit: 0, credit: 165_500 },
    { code: "4000", name: "Membership Revenue", debit: 0, credit: 125_000 },
    { code: "4100", name: "Personal Training Revenue", debit: 0, credit: 35_000 },
    { code: "4200", name: "Class & Drop-in Revenue", debit: 0, credit: 18_000 },
    { code: "5000", name: "Employee Benefits Expense", debit: 45_000, credit: 0 },
    { code: "5100", name: "Rent Expense", debit: 25_000, credit: 0 },
    { code: "5200", name: "Marketing & Advertising", debit: 6_500, credit: 0 },
    { code: "5300", name: "Depreciation Expense", debit: 8_500, credit: 0 },
  ];
  const totDebit = rows.reduce((a, r) => a + r.debit, 0);
  const totCredit = rows.reduce((a, r) => a + r.credit, 0);

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Trial Balance"
          subtitle="All account balances — must balance"
          period="31 Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Account Name</Th>
              <Th right>Debit (AED)</Th>
              <Th right>Credit (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`tb-${i}-${r.code}`}>
                <Td muted>{r.code}</Td>
                <Td>{r.name}</Td>
                <Td right>{r.debit > 0 ? aed(r.debit) : "—"}</Td>
                <Td right>{r.credit > 0 ? aed(r.credit) : "—"}</Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold colSpan={2}>Total</Td>
              <Td right bold>{aed(totDebit)}</Td>
              <Td right bold>{aed(totCredit)}</Td>
            </tr>
            <tr>
              <Td muted colSpan={4}>
                {totDebit === totCredit ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Balanced
                  </span>
                ) : (
                  <span className="text-red-500">
                    Difference: {aed(Math.abs(totDebit - totCredit))}
                  </span>
                )}
              </Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function CashFlowReport() {
  const live = mockCashFlowData;
  const ops = live?.ops?.length ? live.ops : [
    { name: "Net Profit Before Tax", amount: 77_850 },
    { name: "Add: Depreciation & Amortisation", amount: 8_500 },
    { name: "Add: Finance Expense", amount: 1_200 },
    { name: "(Increase) in Trade Receivables", amount: -3_200 },
    { name: "(Increase) in Inventories", amount: -1_500 },
    { name: "Increase in Trade Payables", amount: 4_300 },
    { name: "Increase in Contract Liabilities", amount: 2_800 },
    { name: "Income Tax Paid", amount: -8_500 },
  ];
  const inv = live?.inv?.length ? live.inv : [
    { name: "Purchase of PP&E", amount: -18_500 },
    { name: "Proceeds from disposal of assets", amount: 1_200 },
  ];
  const fin = live?.fin?.length ? live.fin : [
    { name: "Repayment of lease liabilities", amount: -6_500 },
    { name: "Finance expense paid", amount: -1_200 },
    { name: "New borrowings", amount: 5_000 },
  ];
  const totOps = live ? live.totalOperating : ops.reduce((a, r) => a + r.amount, 0);
  const totInv = live ? live.totalInvesting : inv.reduce((a, r) => a + r.amount, 0);
  const totFin = live ? live.totalFinancing : fin.reduce((a, r) => a + r.amount, 0);
  const netChange = live ? live.netCashFlow : (totOps + totInv + totFin);

  const chartData = [
    { label: "Operating", value: Math.abs(totOps) },
    { label: "Investing", value: Math.abs(totInv) },
    { label: "Financing", value: Math.abs(totFin) },
  ];

  const renderSection = (title: string, rows: { name: string; amount: number }[], total: number) => (
    <>
      <tr className="bg-slate-50">
        <Td bold colSpan={2}>{title}</Td>
      </tr>
      {rows.map((r) => (
        <tr key={r.name}>
          <Td className="pl-6">{r.name}</Td>
          <Td right>
            <span className={r.amount < 0 ? "text-red-500" : "text-emerald-600"}>
              {r.amount < 0 ? `(${aed(Math.abs(r.amount))})` : aed(r.amount)}
            </span>
          </Td>
        </tr>
      ))}
      <tr className="bg-slate-50/60">
        <Td bold className="pl-6 text-slate-500 text-[10px]">Net cash from {title}</Td>
        <Td right bold className="text-slate-500 text-[10px]">{aed(total)}</Td>
      </tr>
    </>
  );

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Statement of Cash Flows"
          subtitle="Indirect method — Operating, Investing & Financing"
          period="Jan 2026"
          branch="All Branches"
        />
        <MiniBarChart data={chartData} />
        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th right>AED</Th>
              </tr>
            </thead>
            <tbody>
              {renderSection("Operating Activities", ops, totOps)}
              {renderSection("Investing Activities", inv, totInv)}
              {renderSection("Financing Activities", fin, totFin)}
              <tr className="bg-[#FFF6D8]">
                <Td bold>Net Change in Cash</Td>
                <Td right bold>
                  <span className={netChange >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {aed(netChange)}
                  </span>
                </Td>
              </tr>
              <tr>
                <Td>Cash at Beginning of Period</Td>
                <Td right>{aed(45_300 - netChange)}</Td>
              </tr>
              <tr className="bg-slate-50">
                <Td bold>Cash at End of Period</Td>
                <Td right bold>{aed(45_300)}</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function BankReconciliationReport() {
  const rows = [
    { date: "2026-01-05", desc: "Customer payment – Al Futtaim Retail", ref: "PMT-0021", book: 12_500, bank: 12_500, status: "Cleared" },
    { date: "2026-01-07", desc: "PDC deposit – Lulu Hypermarket", ref: "PDC-0088", book: 18_000, bank: 0, status: "Pending" },
    { date: "2026-01-10", desc: "Supplier payment – Al Rawabi Foods", ref: "PAY-0044", book: -9_200, bank: -9_200, status: "Cleared" },
    { date: "2026-01-12", desc: "Bank charges – Emirates NBD", ref: "BC-JAN", book: 0, bank: -350, status: "Unbooked" },
    { date: "2026-01-15", desc: "Cash sales deposit", ref: "CS-0101", book: 5_800, bank: 5_800, status: "Cleared" },
    { date: "2026-01-18", desc: "Rent payment – Emaar Properties", ref: "RENT-01", book: -25_000, bank: -25_000, status: "Cleared" },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Bank Reconciliation"
          subtitle="Book balance vs bank statement — Emirates NBD"
          period="Jan 2026"
          branch="Main Branch"
        />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Book Balance", value: aed(45_300) },
            { label: "Bank Statement Balance", value: aed(44_950) },
            { label: "Difference", value: aed(350) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Ref</Th>
              <Th right>Book (AED)</Th>
              <Th right>Bank (AED)</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref}>
                <Td muted>{r.date}</Td>
                <Td>{r.desc}</Td>
                <Td muted>{r.ref}</Td>
                <Td right>{r.book !== 0 ? aed(r.book) : "—"}</Td>
                <Td right>{r.bank !== 0 ? aed(r.bank) : "—"}</Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function PettyCashReport() {
  const rows = [
    { date: "2026-01-02", desc: "Office stationery", category: "Admin", receipt: "R-001", amount: -120 },
    { date: "2026-01-04", desc: "Tea & coffee supplies", category: "Refreshments", receipt: "R-002", amount: -85 },
    { date: "2026-01-06", desc: "Courier delivery fee", category: "Logistics", receipt: "R-003", amount: -55 },
    { date: "2026-01-08", desc: "Petty cash top-up", category: "Replenishment", receipt: "REC-10", amount: 500 },
    { date: "2026-01-10", desc: "Cleaning supplies", category: "Maintenance", receipt: "R-004", amount: -140 },
    { date: "2026-01-14", desc: "Minor repairs – door hinge", category: "Maintenance", receipt: "R-005", amount: -200 },
    { date: "2026-01-18", desc: "Staff refreshments – meeting", category: "Refreshments", receipt: "R-006", amount: -95 },
  ];
  let running = 500;
  const withBalance = rows.map((r) => { running += r.amount; return { ...r, balance: running }; });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Petty Cash Statement"
          subtitle="Imprest fund movements — Main Branch"
          period="Jan 2026"
          branch="Main Branch"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Category</Th>
              <Th>Receipt</Th>
              <Th right>Amount (AED)</Th>
              <Th right>Balance (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {withBalance.map((r) => (
              <tr key={r.receipt}>
                <Td muted>{r.date}</Td>
                <Td>{r.desc}</Td>
                <Td muted>{r.category}</Td>
                <Td muted>{r.receipt}</Td>
                <Td right>
                  <span className={r.amount < 0 ? "text-red-500" : "text-emerald-600"}>
                    {r.amount < 0 ? `(${aed(Math.abs(r.amount))})` : aed(r.amount)}
                  </span>
                </Td>
                <Td right bold>{aed(r.balance)}</Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold colSpan={4}>Closing Balance</Td>
              <Td right />
              <Td right bold>{aed(withBalance[withBalance.length - 1].balance)}</Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function CustomerAgingReport() {
  const rows = mockCustomerAgingRows || [
    { customer: "Al Futtaim Retail LLC", current: 12_500, d30: 8_200, d60: 3_500, d90: 0, d90plus: 0, total: 24_200 },
    { customer: "Lulu Hypermarket", current: 28_000, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 28_000 },
    { customer: "Carrefour UAE", current: 0, d30: 15_400, d60: 9_800, d90: 4_200, d90plus: 0, total: 29_400 },
    { customer: "ENOC Stations", current: 5_600, d30: 3_200, d60: 0, d90: 0, d90plus: 0, total: 8_800 },
    { customer: "Spinneys Group", current: 0, d30: 0, d60: 8_500, d90: 6_200, d90plus: 3_800, total: 18_500 },
    { customer: "Union Coop", current: 9_200, d30: 4_500, d60: 0, d90: 0, d90plus: 0, total: 13_700 },
  ];
  const tot = (key: keyof typeof rows[0]) => rows.reduce((a, r) => a + (r[key] as number), 0);
  const chartData = [
    { label: "Current", value: tot("current") },
    { label: "1-30d", value: tot("d30") },
    { label: "31-60d", value: tot("d60") },
    { label: "61-90d", value: tot("d90") },
    { label: "90d+", value: tot("d90plus") },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Customer Aging Report"
          subtitle="Outstanding receivables by age bucket"
          period="31 Jan 2026"
          branch="All Branches"
        />
        <MiniBarChart data={chartData} color="#F5C742" />
        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th right>Current</Th>
                <Th right>1–30 Days</Th>
                <Th right>31–60 Days</Th>
                <Th right>61–90 Days</Th>
                <Th right>90+ Days</Th>
                <Th right>Total (AED)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.customer}>
                  <Td>{r.customer}</Td>
                  <Td right>{r.current > 0 ? aed(r.current) : "—"}</Td>
                  <Td right>{r.d30 > 0 ? aed(r.d30) : "—"}</Td>
                  <Td right>{r.d60 > 0 ? <span className="text-amber-600">{aed(r.d60)}</span> : "—"}</Td>
                  <Td right>{r.d90 > 0 ? <span className="text-orange-600">{aed(r.d90)}</span> : "—"}</Td>
                  <Td right>{r.d90plus > 0 ? <span className="text-red-600 font-semibold">{aed(r.d90plus)}</span> : "—"}</Td>
                  <Td right bold>{aed(r.total)}</Td>
                </tr>
              ))}
              <tr className="bg-[#FFF6D8]">
                <Td bold>Total</Td>
                <Td right bold>{aed(tot("current"))}</Td>
                <Td right bold>{aed(tot("d30"))}</Td>
                <Td right bold>{aed(tot("d60"))}</Td>
                <Td right bold>{aed(tot("d90"))}</Td>
                <Td right bold>{aed(tot("d90plus"))}</Td>
                <Td right bold>{aed(tot("total"))}</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function CollectionEfficiencyReport() {
  const rows = [
    { customer: "Al Futtaim Retail LLC", invoiced: 85_000, collected: 80_200, outstanding: 4_800, dso: 18, rate: 94.4 },
    { customer: "Lulu Hypermarket", invoiced: 120_000, collected: 120_000, outstanding: 0, dso: 14, rate: 100.0 },
    { customer: "Carrefour UAE", invoiced: 95_000, collected: 65_600, outstanding: 29_400, dso: 38, rate: 69.1 },
    { customer: "ENOC Stations", invoiced: 42_000, collected: 33_200, outstanding: 8_800, dso: 22, rate: 79.0 },
    { customer: "Spinneys Group", invoiced: 68_000, collected: 49_500, outstanding: 18_500, dso: 45, rate: 72.8 },
    { customer: "Union Coop", invoiced: 55_000, collected: 41_300, outstanding: 13_700, dso: 28, rate: 75.1 },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Collection Efficiency Report"
          subtitle="DSO and collection rate by customer — Jan 2026"
          period="Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th right>Invoiced (AED)</Th>
              <Th right>Collected (AED)</Th>
              <Th right>Outstanding (AED)</Th>
              <Th right>DSO (Days)</Th>
              <Th right>Collection %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customer}>
                <Td>{r.customer}</Td>
                <Td right>{aed(r.invoiced)}</Td>
                <Td right>{aed(r.collected)}</Td>
                <Td right>{r.outstanding > 0 ? <span className="text-amber-600">{aed(r.outstanding)}</span> : "—"}</Td>
                <Td right>
                  <span className={r.dso <= 30 ? "text-emerald-600" : "text-red-500"}>{r.dso}</span>
                </Td>
                <Td right>
                  <span className={r.rate >= 90 ? "text-emerald-600 font-semibold" : r.rate >= 75 ? "text-amber-600" : "text-red-600"}>
                    {r.rate.toFixed(1)}%
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function CreditUtilizationReport() {
  const rows = [
    { customer: "Al Futtaim Retail LLC", limit: 100_000, outstanding: 24_200, utilization: 24.2, status: "Paid" },
    { customer: "Lulu Hypermarket", limit: 150_000, outstanding: 28_000, utilization: 18.7, status: "Paid" },
    { customer: "Carrefour UAE", limit: 80_000, outstanding: 29_400, utilization: 36.8, status: "Partial" },
    { customer: "ENOC Stations", limit: 30_000, outstanding: 8_800, utilization: 29.3, status: "Pending" },
    { customer: "Spinneys Group", limit: 50_000, outstanding: 18_500, utilization: 37.0, status: "Overdue" },
    { customer: "Union Coop", limit: 60_000, outstanding: 13_700, utilization: 22.8, status: "Pending" },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Credit Utilization Report"
          subtitle="Credit limit vs outstanding exposure by customer"
          period="31 Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th right>Credit Limit (AED)</Th>
              <Th right>Outstanding (AED)</Th>
              <Th right>Available (AED)</Th>
              <Th right>Utilization %</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customer}>
                <Td>{r.customer}</Td>
                <Td right>{aed(r.limit)}</Td>
                <Td right>{aed(r.outstanding)}</Td>
                <Td right>{aed(r.limit - r.outstanding)}</Td>
                <Td right>
                  <div className="flex items-center justify-end gap-1">
                    <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${r.utilization}%`,
                          backgroundColor: r.utilization > 80 ? "#ef4444" : r.utilization > 50 ? "#f59e0b" : "#10b981",
                        }}
                      />
                    </div>
                    <span>{r.utilization.toFixed(1)}%</span>
                  </div>
                </Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function VendorAgingReport() {
  const rows = mockVendorAgingRows || [
    { vendor: "Al Rawabi Foods LLC", current: 18_500, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 18_500 },
    { vendor: "Agthia Group PJSC", current: 9_200, d30: 5_400, d60: 0, d90: 0, d90plus: 0, total: 14_600 },
    { vendor: "Emirates Logistics Co.", current: 0, d30: 12_800, d60: 3_200, d90: 0, d90plus: 0, total: 16_000 },
    { vendor: "DAFZA Warehouse Ltd.", current: 25_000, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 25_000 },
    { vendor: "Sharjah Packaging LLC", current: 0, d30: 0, d60: 4_500, d90: 2_100, d90plus: 800, total: 7_400 },
  ];
  const tot = (key: keyof typeof rows[0]) => rows.reduce((a, r) => a + (r[key] as number), 0);
  const chartData = [
    { label: "Current", value: tot("current") },
    { label: "1-30d", value: tot("d30") },
    { label: "31-60d", value: tot("d60") },
    { label: "61-90d", value: tot("d90") },
    { label: "90d+", value: tot("d90plus") },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Vendor Aging Report"
          subtitle="Payables outstanding by age bucket"
          period="31 Jan 2026"
          branch="All Branches"
        />
        <MiniBarChart data={chartData} color="#818cf8" />
        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th right>Current</Th>
                <Th right>1–30 Days</Th>
                <Th right>31–60 Days</Th>
                <Th right>61–90 Days</Th>
                <Th right>90+ Days</Th>
                <Th right>Total (AED)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vendor}>
                  <Td>{r.vendor}</Td>
                  <Td right>{r.current > 0 ? aed(r.current) : "—"}</Td>
                  <Td right>{r.d30 > 0 ? aed(r.d30) : "—"}</Td>
                  <Td right>{r.d60 > 0 ? <span className="text-amber-600">{aed(r.d60)}</span> : "—"}</Td>
                  <Td right>{r.d90 > 0 ? <span className="text-orange-600">{aed(r.d90)}</span> : "—"}</Td>
                  <Td right>{r.d90plus > 0 ? <span className="text-red-600 font-semibold">{aed(r.d90plus)}</span> : "—"}</Td>
                  <Td right bold>{aed(r.total)}</Td>
                </tr>
              ))}
              <tr className="bg-[#FFF6D8]">
                <Td bold>Total</Td>
                <Td right bold>{aed(tot("current"))}</Td>
                <Td right bold>{aed(tot("d30"))}</Td>
                <Td right bold>{aed(tot("d60"))}</Td>
                <Td right bold>{aed(tot("d90"))}</Td>
                <Td right bold>{aed(tot("d90plus"))}</Td>
                <Td right bold>{aed(tot("total"))}</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentScheduleReport() {
  const rows = [
    { dueDate: "2026-01-28", vendor: "Emaar Properties PJSC", ref: "RENT-JAN", amount: 25_000, method: "Wire Transfer", status: "Pending" },
    { dueDate: "2026-01-30", vendor: "Al Rawabi Foods LLC", ref: "INV-2041", amount: 18_500, method: "Cheque", status: "Pending" },
    { dueDate: "2026-02-05", vendor: "Agthia Group PJSC", ref: "INV-3302", amount: 9_200, method: "PDC", status: "Scheduled" },
    { dueDate: "2026-02-10", vendor: "DAFZA Warehouse Ltd.", ref: "INV-8801", amount: 25_000, method: "Wire Transfer", status: "Pending" },
    { dueDate: "2026-02-15", vendor: "Sharjah Packaging LLC", ref: "INV-0552", amount: 7_400, method: "Cheque", status: "Overdue" },
    { dueDate: "2026-02-20", vendor: "Emirates Logistics Co.", ref: "INV-7720", amount: 16_000, method: "Wire Transfer", status: "Scheduled" },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Payment Schedule"
          subtitle="Upcoming vendor payments with method and status"
          period="Jan–Feb 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Due Date</Th>
              <Th>Vendor</Th>
              <Th>Reference</Th>
              <Th right>Amount (AED)</Th>
              <Th>Payment Method</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref}>
                <Td muted>{r.dueDate}</Td>
                <Td>{r.vendor}</Td>
                <Td muted>{r.ref}</Td>
                <Td right bold>{aed(r.amount)}</Td>
                <Td muted>{r.method}</Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold colSpan={3}>Total Payable</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.amount, 0))}</Td>
              <Td colSpan={2} />
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function OutstandingPayablesReport() {
  const rows = [
    { inv: "INV-2041", vendor: "Al Rawabi Foods LLC", date: "2026-01-05", due: "2026-01-30", amount: 18_500, paid: 0, balance: 18_500, status: "Pending" },
    { inv: "INV-3302", vendor: "Agthia Group PJSC", date: "2026-01-08", due: "2026-02-07", amount: 14_600, paid: 5_400, balance: 9_200, status: "Partial" },
    { inv: "INV-8801", vendor: "DAFZA Warehouse Ltd.", date: "2026-01-10", due: "2026-02-09", amount: 25_000, paid: 0, balance: 25_000, status: "Pending" },
    { inv: "INV-7720", vendor: "Emirates Logistics Co.", date: "2026-01-12", due: "2026-02-11", amount: 16_000, paid: 0, balance: 16_000, status: "Pending" },
    { inv: "INV-0552", vendor: "Sharjah Packaging LLC", date: "2025-12-20", due: "2026-01-19", amount: 7_400, paid: 0, balance: 7_400, status: "Overdue" },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Outstanding Payables"
          subtitle="All unpaid and partially paid vendor invoices"
          period="31 Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Vendor</Th>
              <Th>Invoice Date</Th>
              <Th>Due Date</Th>
              <Th right>Amount (AED)</Th>
              <Th right>Paid (AED)</Th>
              <Th right>Balance (AED)</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.inv}>
                <Td muted>{r.inv}</Td>
                <Td>{r.vendor}</Td>
                <Td muted>{r.date}</Td>
                <Td muted>{r.due}</Td>
                <Td right>{aed(r.amount)}</Td>
                <Td right>{r.paid > 0 ? aed(r.paid) : "—"}</Td>
                <Td right bold>{aed(r.balance)}</Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold colSpan={4}>Total Outstanding</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.amount, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.paid, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.balance, 0))}</Td>
              <Td />
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function VATReturnSummaryReport() {
  const vd = mockVatDashboard;
  const outputTax = vd ? Number(vd.outputTax || 0) : 9_450;
  const inputTax = vd ? Number(vd.inputTax || 0) : 5_510;
  const netPayable = vd ? Number(vd.netTaxPayable || 0) : 3_940;
  const salesBase = vd ? Number(vd.taxableSalesBase || 0) : 189_000;
  const purchaseBase = vd ? Number(vd.taxablePurchaseBase || 0) : 110_200;
  const boxes = [
    { box: "1", label: "Standard rated supplies (5%)", taxable: salesBase, vat: outputTax },
    { box: "2", label: "Zero-rated supplies (0%)", taxable: 0, vat: 0 },
    { box: "3", label: "Exempt supplies", taxable: 0, vat: 0 },
    { box: "4", label: "Total supplies (Box 1+2+3)", taxable: salesBase, vat: outputTax },
    { box: "5", label: "Taxable expenses (5% input VAT)", taxable: purchaseBase, vat: inputTax },
    { box: "6", label: "Input VAT recoverable (Box 5 VAT)", taxable: null, vat: inputTax },
    { box: "7", label: "VAT payable / (refundable) (Box 4–6)", taxable: null, vat: netPayable },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="VAT Return Summary"
          subtitle="UAE FTA VAT Return — Standard format (Box 1–7)"
          period="Selected Period"
          branch="All Branches"
        />
        <div className="mb-3 flex gap-3">
          {[
            { label: "Output VAT", value: aed(outputTax), color: "text-slate-800" },
            { label: "Input VAT Recoverable", value: aed(inputTax), color: "text-emerald-700" },
            { label: "Net VAT Payable", value: aed(netPayable), color: "text-red-600" },
          ].map((s) => (
            <div key={s.label} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>Box</Th>
              <Th>Description</Th>
              <Th right>Taxable Amount (AED)</Th>
              <Th right>VAT Amount (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((b) => (
              <tr
                key={b.box}
                className={["4", "7"].includes(b.box) ? "bg-[#FFF6D8]" : ""}
              >
                <Td bold={["4", "7"].includes(b.box)} muted={!["4", "7"].includes(b.box)}>
                  Box {b.box}
                </Td>
                <Td bold={["4", "7"].includes(b.box)}>{b.label}</Td>
                <Td right>{b.taxable !== null ? aed(b.taxable) : "—"}</Td>
                <Td right bold={["4", "7"].includes(b.box)}>
                  <span className={b.box === "7" ? "text-red-600 font-bold" : ""}>{aed(b.vat)}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        <p className="mt-3 text-[10px] text-slate-500">
          UAE VAT rate: 5% | TRN: 100-3456-7890-003 | Filing deadline: 28 Jan 2026
        </p>
      </CardContent>
    </Card>
  );
}

function VATOutputRegisterReport() {
  const liveRows = mockVatOutputLines;
  const rows = liveRows?.length
    ? liveRows.map((l: any) => ({
        date: "—",
        inv: l.documentNumber || "—",
        customer: l.accountName || "—",
        taxable: Number(l.baseAmount || 0),
        vatRate: "5%",
        vat: Number(l.taxAmount || 0),
        total: Number(l.baseAmount || 0) + Number(l.taxAmount || 0),
      }))
    : [
        { date: "2026-01-05", inv: "TAX-INV-1001", customer: "Al Futtaim Retail LLC", taxable: 52_000, vatRate: "5%", vat: 2_600, total: 54_600 },
        { date: "2026-01-08", inv: "TAX-INV-1002", customer: "Lulu Hypermarket", taxable: 28_000, vatRate: "5%", vat: 1_400, total: 29_400 },
        { date: "2026-01-12", inv: "TAX-INV-1003", customer: "Carrefour UAE", taxable: 35_000, vatRate: "5%", vat: 1_750, total: 36_750 },
        { date: "2026-01-15", inv: "TAX-INV-1004", customer: "ENOC Stations", taxable: 8_800, vatRate: "5%", vat: 440, total: 9_240 },
        { date: "2026-01-18", inv: "TAX-INV-1005", customer: "Spinneys Group", taxable: 18_500, vatRate: "5%", vat: 925, total: 19_425 },
        { date: "2026-01-22", inv: "TAX-INV-1006", customer: "Union Coop", taxable: 13_700, vatRate: "5%", vat: 685, total: 14_385 },
        { date: "2026-01-25", inv: "TAX-INV-1007", customer: "Cash Customer", taxable: 12_000, vatRate: "0%", vat: 0, total: 12_000 },
      ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Output Tax Register"
          subtitle="All taxable supplies with output VAT detail"
          period="Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Tax Invoice No.</Th>
              <Th>Customer</Th>
              <Th right>Taxable Amount (AED)</Th>
              <Th right>VAT Rate</Th>
              <Th right>VAT (AED)</Th>
              <Th right>Total (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.inv}>
                <Td muted>{r.date}</Td>
                <Td muted>{r.inv}</Td>
                <Td>{r.customer}</Td>
                <Td right>{aed(r.taxable)}</Td>
                <Td right>
                  <span className={r.vatRate === "0%" ? "text-slate-400" : "text-slate-700"}>{r.vatRate}</span>
                </Td>
                <Td right>{r.vat > 0 ? aed(r.vat) : "—"}</Td>
                <Td right bold>{aed(r.total)}</Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold colSpan={3}>Total</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.taxable, 0))}</Td>
              <Td right />
              <Td right bold>{aed(rows.reduce((a, r) => a + r.vat, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.total, 0))}</Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function VATInputRegisterReport() {
  const liveRows = mockVatInputLines;
  const rows = liveRows?.length
    ? liveRows.map((l: any) => ({
        date: "—",
        inv: l.documentNumber || "—",
        vendor: l.accountName || "—",
        taxable: Number(l.baseAmount || 0),
        vat: Number(l.taxAmount || 0),
        recoverable: Number(l.taxAmount || 0),
      }))
    : [
        { date: "2026-01-04", inv: "SI-9901", vendor: "Al Rawabi Foods LLC", taxable: 18_500, vat: 925, recoverable: 925 },
        { date: "2026-01-06", inv: "SI-3340", vendor: "Agthia Group PJSC", taxable: 14_600, vat: 730, recoverable: 730 },
        { date: "2026-01-10", inv: "SI-8820", vendor: "DAFZA Warehouse Ltd.", taxable: 25_000, vat: 1_250, recoverable: 1_250 },
        { date: "2026-01-14", inv: "SI-7718", vendor: "Emirates Logistics Co.", taxable: 16_000, vat: 800, recoverable: 800 },
        { date: "2026-01-18", inv: "SI-0055", vendor: "Sharjah Packaging LLC", taxable: 7_400, vat: 370, recoverable: 370 },
        { date: "2026-01-20", inv: "UTIL-JAN", vendor: "DEWA (Utilities)", taxable: 4_200, vat: 210, recoverable: 210 },
        { date: "2026-01-22", inv: "RENT-JAN", vendor: "Emaar Properties PJSC", taxable: 25_000, vat: 1_250, recoverable: 225 },
      ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Input Tax Register"
          subtitle="Eligible input VAT for recovery — purchases & expenses"
          period="Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Supplier Invoice</Th>
              <Th>Vendor</Th>
              <Th right>Taxable (AED)</Th>
              <Th right>Input VAT (AED)</Th>
              <Th right>Recoverable (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.inv}>
                <Td muted>{r.date}</Td>
                <Td muted>{r.inv}</Td>
                <Td>{r.vendor}</Td>
                <Td right>{aed(r.taxable)}</Td>
                <Td right>{aed(r.vat)}</Td>
                <Td right bold>
                  <span className={r.recoverable < r.vat ? "text-amber-600" : "text-emerald-700"}>
                    {aed(r.recoverable)}
                  </span>
                </Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td bold colSpan={3}>Total</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.taxable, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.vat, 0))}</Td>
              <Td right bold>{aed(rows.reduce((a, r) => a + r.recoverable, 0))}</Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function JournalAuditReport() {
  const rows = [
    { jrn: "JV-0021", date: "2026-01-05", user: "Ahmed Hassan", account: "5000 – Staff Salaries", debit: 45_000, credit: 0, reason: "Jan salary accrual", approved: "Mohammed Al Rashid" },
    { jrn: "JV-0022", date: "2026-01-05", user: "Ahmed Hassan", account: "2500 – Salaries Payable", debit: 0, credit: 45_000, reason: "Jan salary accrual", approved: "Mohammed Al Rashid" },
    { jrn: "JV-0023", date: "2026-01-10", user: "Fatima Al Zaabi", account: "5300 – Depreciation Exp.", debit: 8_500, credit: 0, reason: "Monthly depreciation run", approved: "Auto-approved" },
    { jrn: "JV-0024", date: "2026-01-15", user: "Sara Abdullah", account: "3100 – Retained Earnings", debit: 12_000, credit: 0, reason: "Dividend provision", approved: "CFO – Khalid Omar" },
    { jrn: "JV-0025", date: "2026-01-22", user: "Mohammed Rashid", account: "1100 – Trade Receivables", debit: 0, credit: 3_200, reason: "Bad debt write-off", approved: "CFO – Khalid Omar" },
  ];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Journal Audit Log"
          subtitle="All manual journal entries with user, reason and approver"
          period="Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Journal Ref.</Th>
              <Th>Date</Th>
              <Th>Posted By</Th>
              <Th>Account</Th>
              <Th right>Debit (AED)</Th>
              <Th right>Credit (AED)</Th>
              <Th>Reason</Th>
              <Th>Approved By</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.jrn}>
                <Td muted>{r.jrn}</Td>
                <Td muted>{r.date}</Td>
                <Td>{r.user}</Td>
                <Td>{r.account}</Td>
                <Td right>{r.debit > 0 ? aed(r.debit) : "—"}</Td>
                <Td right>{r.credit > 0 ? aed(r.credit) : "—"}</Td>
                <Td muted>{r.reason}</Td>
                <Td muted>{r.approved}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function PeriodCloseReport() {
  const tasks = [
    { seq: 1, task: "Post all sales invoices", owner: "Ahmed Hassan", deadline: "2026-01-31", status: "Done" },
    { seq: 2, task: "Reconcile bank accounts", owner: "Fatima Al Zaabi", deadline: "2026-01-31", status: "Done" },
    { seq: 3, task: "Post monthly depreciation journal", owner: "System", deadline: "2026-01-31", status: "Done" },
    { seq: 4, task: "Accrue salary & end-of-service", owner: "Ahmed Hassan", deadline: "2026-01-31", status: "Done" },
    { seq: 5, task: "Review & post VAT journal", owner: "Sara Abdullah", deadline: "2026-02-01", status: "Pending" },
    { seq: 6, task: "Prepare trial balance & review", owner: "Mohammed Rashid", deadline: "2026-02-02", status: "Pending" },
    { seq: 7, task: "CFO sign-off on P&L", owner: "Khalid Omar (CFO)", deadline: "2026-02-03", status: "Pending" },
    { seq: 8, task: "Lock period in system", owner: "System Admin", deadline: "2026-02-04", status: "Pending" },
  ];
  const done = tasks.filter((t) => t.status === "Done").length;
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Period Close Checklist"
          subtitle="Month-end close tasks and sign-off status — Jan 2026"
          period="Jan 2026"
          branch="All Branches"
        />
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${(done / tasks.length) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-slate-700">{done}/{tasks.length} complete</span>
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Task</Th>
              <Th>Owner</Th>
              <Th>Deadline</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.seq}>
                <Td muted>{t.seq}</Td>
                <Td>{t.task}</Td>
                <Td>{t.owner}</Td>
                <Td muted>{t.deadline}</Td>
                <Td>{statusBadge(t.status)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function UserActivityReport() {
  const rows = [
    { time: "2026-01-22 08:14", user: "Ahmed Hassan", action: "Login", module: "POS", detail: "Successful login from 192.168.1.45", risk: "Low" },
    { time: "2026-01-22 09:32", user: "Fatima Al Zaabi", action: "Post Journal", module: "Finance", detail: "JV-0025 – Bad debt write-off AED 3,200", risk: "Medium" },
    { time: "2026-01-22 10:05", user: "Mohammed Rashid", action: "Delete Invoice", module: "Sales", detail: "INV-1008 deleted — Reason: Duplicate", risk: "High" },
    { time: "2026-01-22 11:18", user: "Sara Abdullah", action: "Export Report", module: "Reports", detail: "Exported Trial Balance to Excel", risk: "Low" },
    { time: "2026-01-22 13:45", user: "Ahmed Hassan", action: "Price Override", module: "POS", detail: "Item SKU-0432 price changed 85→70 AED", risk: "Medium" },
    { time: "2026-01-22 15:00", user: "System", action: "Depreciation Run", module: "Finance", detail: "Auto-posted depreciation JV-0023", risk: "Low" },
    { time: "2026-01-22 17:30", user: "Mohammed Rashid", action: "Logout", module: "System", detail: "Session ended normally", risk: "Low" },
  ];
  const riskColor: Record<string, string> = {
    Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    High: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="User Activity Report"
          subtitle="Login, posting and deletion events with risk level"
          period="22 Jan 2026"
          branch="All Branches"
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Timestamp</Th>
              <Th>User</Th>
              <Th>Action</Th>
              <Th>Module</Th>
              <Th>Detail</Th>
              <Th>Risk</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <Td muted>{r.time}</Td>
                <Td>{r.user}</Td>
                <Td bold>{r.action}</Td>
                <Td muted>{r.module}</Td>
                <Td muted>{r.detail}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${riskColor[r.risk]}`}>
                    {r.risk}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ─── Bank Report Components ───────────────────────────────────────────────────

const BANK_ACCOUNTS = ["Emirates NBD – Main (AED)", "ADCB – Operations (AED)", "HSBC – Collection (AED)"];

const mockBankBook = [
  { date: "01 Jan 2026", ref: "OB-001", narration: "Opening Balance", type: "Balance B/F", debit: 0, credit: 0, balance: 125_000 },
  { date: "02 Jan 2026", ref: "REC-1042", narration: "Customer Receipt – Al Noor Group", type: "Receipt", debit: 18_500, credit: 0, balance: 143_500 },
  { date: "03 Jan 2026", ref: "PMT-2201", narration: "Vendor Payment – Fresh Foods LLC", type: "Payment", debit: 0, credit: 12_300, balance: 131_200 },
  { date: "05 Jan 2026", ref: "CHQ-0041", narration: "Cheque Issued – Utility Bill", type: "Cheque", debit: 0, credit: 3_200, balance: 128_000 },
  { date: "07 Jan 2026", ref: "TRF-0015", narration: "Transfer to ADCB – Operations", type: "Transfer Out", debit: 0, credit: 20_000, balance: 108_000 },
  { date: "08 Jan 2026", ref: "REC-1051", narration: "Customer Receipt – Delta Retail", type: "Receipt", debit: 9_800, credit: 0, balance: 117_800 },
  { date: "10 Jan 2026", ref: "PMT-2215", narration: "Vendor Payment – GreenLeaf Co.", type: "Payment", debit: 0, credit: 7_450, balance: 110_350 },
  { date: "12 Jan 2026", ref: "BCH-0007", narration: "Bank Charges – Jan Service Fee", type: "Bank Charge", debit: 0, credit: 150, balance: 110_200 },
  { date: "15 Jan 2026", ref: "REC-1060", narration: "Customer Receipt – Star Mart", type: "Receipt", debit: 22_000, credit: 0, balance: 132_200 },
  { date: "18 Jan 2026", ref: "PDC-0091", narration: "PDC Cleared – Al Noor Q4", type: "PDC Cleared", debit: 15_000, credit: 0, balance: 147_200 },
  { date: "20 Jan 2026", ref: "PMT-2230", narration: "Salary Advance – Ahmed Ali", type: "Payment", debit: 0, credit: 5_000, balance: 142_200 },
  { date: "25 Jan 2026", ref: "PMT-2241", narration: "Vendor Payment – Techno Parts", type: "Payment", debit: 0, credit: 8_800, balance: 133_400 },
  { date: "28 Jan 2026", ref: "REC-1078", narration: "Customer Receipt – Blue Sky LLC", type: "Receipt", debit: 11_600, credit: 0, balance: 145_000 },
  { date: "31 Jan 2026", ref: "CB-001", narration: "Closing Balance", type: "Balance C/F", debit: 0, credit: 0, balance: 145_000 },
];

function BankBookReport() {
  const [account, setAccount] = useState(BANK_ACCOUNTS[0]);
  const typeColors: Record<string, string> = {
    "Receipt": "text-emerald-700",
    "PDC Cleared": "text-emerald-700",
    "Payment": "text-red-600",
    "Cheque": "text-red-600",
    "Transfer Out": "text-orange-600",
    "Bank Charge": "text-rose-600",
    "Balance B/F": "text-slate-500",
    "Balance C/F": "text-slate-500",
  };
  const totalDebit = mockBankBook.filter(r => r.debit > 0).reduce((s, r) => s + r.debit, 0);
  const totalCredit = mockBankBook.filter(r => r.credit > 0).reduce((s, r) => s + r.credit, 0);
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Bank Book" subtitle="Transaction ledger with running balance" period="Jan 2026" />
        <div className="flex flex-wrap gap-2 mb-3">
          {BANK_ACCOUNTS.map(a => (
            <button key={a} onClick={() => setAccount(a)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${account === a ? "border-[#F5C742] bg-[#FFF6D8] font-semibold text-slate-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
              {a}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Opening Balance", val: aed(125_000), color: "text-slate-700" },
            { label: "Total Receipts", val: aed(totalDebit), color: "text-emerald-700" },
            { label: "Total Payments", val: aed(totalCredit), color: "text-red-600" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Ref #</Th>
              <Th>Narration</Th>
              <Th>Type</Th>
              <Th right>Debit (AED)</Th>
              <Th right>Credit (AED)</Th>
              <Th right>Balance (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {mockBankBook.map((r, i) => (
              <tr key={i} className={r.type.startsWith("Balance") ? "bg-slate-50 font-semibold" : ""}>
                <Td>{r.date}</Td>
                <Td><span className="font-mono text-[10px] text-slate-600">{r.ref}</span></Td>
                <Td>{r.narration}</Td>
                <Td><span className={`text-[10px] font-medium ${typeColors[r.type] ?? "text-slate-600"}`}>{r.type}</span></Td>
                <Td right>{r.debit > 0 ? <span className="text-emerald-700 font-medium">{r.debit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right>{r.credit > 0 ? <span className="text-red-600">{r.credit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right bold>{r.balance.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

const mockPDCReceived = [
  { ref: "PDCR-001", customer: "Al Noor Group", bank: "Emirates NBD", chequeNo: "000112345", amount: 18_500, dueDate: "05 Feb 2026", depositDate: "—", status: "Pending" },
  { ref: "PDCR-002", customer: "Delta Retail LLC", bank: "ADCB", chequeNo: "000887621", amount: 9_800, dueDate: "10 Feb 2026", depositDate: "—", status: "Pending" },
  { ref: "PDCR-003", customer: "Star Mart", bank: "HSBC", chequeNo: "000445678", amount: 22_000, dueDate: "15 Jan 2026", depositDate: "15 Jan 2026", status: "Cleared" },
  { ref: "PDCR-004", customer: "Blue Sky LLC", bank: "Emirates NBD", chequeNo: "000334490", amount: 11_600, dueDate: "20 Jan 2026", depositDate: "20 Jan 2026", status: "Cleared" },
  { ref: "PDCR-005", customer: "Sunrise Trading", bank: "Mashreq", chequeNo: "000771002", amount: 6_400, dueDate: "28 Jan 2026", depositDate: "—", status: "Bounced" },
  { ref: "PDCR-006", customer: "Metro Stores", bank: "FAB", chequeNo: "000229881", amount: 14_200, dueDate: "05 Mar 2026", depositDate: "—", status: "Pending" },
  { ref: "PDCR-007", customer: "Pearl Distribution", bank: "DIB", chequeNo: "000660443", amount: 31_000, dueDate: "20 Mar 2026", depositDate: "—", status: "Pending" },
  { ref: "PDCR-008", customer: "Gulf Hypermart", bank: "Emirates NBD", chequeNo: "000118876", amount: 8_750, dueDate: "01 Feb 2026", depositDate: "—", status: "On Hold" },
];

function PDCReceivedReport() {
  const statusCls: Record<string, string> = {
    Pending: "bg-blue-50 text-blue-700 border-blue-200",
    Cleared: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Bounced: "bg-red-50 text-red-700 border-red-200",
    "On Hold": "bg-amber-50 text-amber-700 border-amber-200",
  };
  const total = mockPDCReceived.reduce((s, r) => s + r.amount, 0);
  const pending = mockPDCReceived.filter(r => r.status === "Pending").reduce((s, r) => s + r.amount, 0);
  const cleared = mockPDCReceived.filter(r => r.status === "Cleared").reduce((s, r) => s + r.amount, 0);
  const bounced = mockPDCReceived.filter(r => r.status === "Bounced").reduce((s, r) => s + r.amount, 0);
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="PDC Received" subtitle="Post-dated cheques received from customers" period="Jan–Mar 2026" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total PDCs", val: aed(total), color: "text-slate-800" },
            { label: "Pending", val: aed(pending), color: "text-blue-700" },
            { label: "Cleared", val: aed(cleared), color: "text-emerald-700" },
            { label: "Bounced", val: aed(bounced), color: "text-red-600" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>Ref #</Th>
              <Th>Customer</Th>
              <Th>Drawee Bank</Th>
              <Th>Cheque No.</Th>
              <Th right>Amount (AED)</Th>
              <Th>Due Date</Th>
              <Th>Deposit Date</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockPDCReceived.map(r => (
              <tr key={r.ref}>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td bold>{r.customer}</Td>
                <Td>{r.bank}</Td>
                <Td><span className="font-mono text-[10px]">{r.chequeNo}</span></Td>
                <Td right bold>{r.amount.toLocaleString()}</Td>
                <Td>{r.dueDate}</Td>
                <Td muted={r.depositDate === "—"}>{r.depositDate}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${statusCls[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

const mockPDCIssued = [
  { ref: "PDCI-001", vendor: "Fresh Foods LLC", bank: "ADCB", chequeNo: "101445", amount: 12_300, dueDate: "10 Feb 2026", status: "Pending" },
  { ref: "PDCI-002", vendor: "GreenLeaf Co.", bank: "Emirates NBD", chequeNo: "101446", amount: 7_450, dueDate: "15 Feb 2026", status: "Pending" },
  { ref: "PDCI-003", vendor: "Techno Parts", bank: "FAB", chequeNo: "101447", amount: 8_800, dueDate: "20 Jan 2026", status: "Cleared" },
  { ref: "PDCI-004", vendor: "Office Depot UAE", bank: "HSBC", chequeNo: "101448", amount: 3_100, dueDate: "25 Jan 2026", status: "Cleared" },
  { ref: "PDCI-005", vendor: "Premium Cleaning", bank: "Mashreq", chequeNo: "101449", amount: 4_800, dueDate: "01 Mar 2026", status: "Pending" },
  { ref: "PDCI-006", vendor: "Logistics Plus", bank: "DIB", chequeNo: "101450", amount: 19_600, dueDate: "10 Mar 2026", status: "Pending" },
  { ref: "PDCI-007", vendor: "DEWA", bank: "Emirates NBD", chequeNo: "101451", amount: 6_200, dueDate: "15 Mar 2026", status: "Void" },
];

function PDCIssuedReport() {
  const statusCls: Record<string, string> = {
    Pending: "bg-blue-50 text-blue-700 border-blue-200",
    Cleared: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Void: "bg-slate-100 text-slate-500 border-slate-200",
    Bounced: "bg-red-50 text-red-700 border-red-200",
  };
  const total = mockPDCIssued.reduce((s, r) => s + r.amount, 0);
  const pending = mockPDCIssued.filter(r => r.status === "Pending").reduce((s, r) => s + r.amount, 0);
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="PDC Issued" subtitle="Post-dated cheques issued to vendors" period="Jan–Mar 2026" />
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total Issued", val: aed(total), color: "text-slate-800" },
            { label: "Pending Clearance", val: aed(pending), color: "text-blue-700" },
            { label: "PDC Count", val: `${mockPDCIssued.length} cheques`, color: "text-slate-700" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>Ref #</Th>
              <Th>Vendor</Th>
              <Th>Drawee Bank</Th>
              <Th>Cheque No.</Th>
              <Th right>Amount (AED)</Th>
              <Th>Due Date</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockPDCIssued.map(r => (
              <tr key={r.ref}>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td bold>{r.vendor}</Td>
                <Td>{r.bank}</Td>
                <Td><span className="font-mono text-[10px]">{r.chequeNo}</span></Td>
                <Td right bold>{r.amount.toLocaleString()}</Td>
                <Td>{r.dueDate}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${statusCls[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

const mockTransfers = [
  { ref: "TRF-0015", date: "07 Jan 2026", from: "Emirates NBD – Main", to: "ADCB – Operations", amount: 20_000, mode: "Internal", ref2: "—", status: "Completed" },
  { ref: "TRF-0016", date: "10 Jan 2026", from: "ADCB – Operations", to: "HSBC – Collection", amount: 8_500, mode: "Internal", ref2: "—", status: "Completed" },
  { ref: "TRF-0017", date: "12 Jan 2026", from: "Emirates NBD – Main", to: "Al Noor Group", amount: 5_000, mode: "SWIFT", ref2: "SWIFT-2026-0042", status: "Completed" },
  { ref: "TRF-0018", date: "15 Jan 2026", from: "ADCB – Operations", to: "GreenLeaf Co.", amount: 7_450, mode: "IBAN", ref2: "AE070331234500000001", status: "Completed" },
  { ref: "TRF-0019", date: "18 Jan 2026", from: "Emirates NBD – Main", to: "Emirates NBD – Main", amount: 3_200, mode: "Internal", ref2: "—", status: "Pending" },
  { ref: "TRF-0020", date: "22 Jan 2026", from: "HSBC – Collection", to: "Emirates NBD – Main", amount: 15_000, mode: "Internal", ref2: "—", status: "Completed" },
  { ref: "TRF-0021", date: "25 Jan 2026", from: "Emirates NBD – Main", to: "Logistics Plus", amount: 19_600, mode: "IBAN", ref2: "AE070440099887766554", status: "Pending" },
];

function BankTransferLogReport() {
  const statusCls: Record<string, string> = {
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Failed: "bg-red-50 text-red-700 border-red-200",
  };
  const modeCls: Record<string, string> = {
    Internal: "bg-slate-100 text-slate-600",
    SWIFT: "bg-blue-50 text-blue-700",
    IBAN: "bg-indigo-50 text-indigo-700",
  };
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Bank Transfer Log" subtitle="Inter-bank & intra-company fund transfers" period="Jan 2026" />
        <Tbl>
          <thead>
            <tr>
              <Th>Ref #</Th>
              <Th>Date</Th>
              <Th>From Account</Th>
              <Th>To Account / Beneficiary</Th>
              <Th right>Amount (AED)</Th>
              <Th>Mode</Th>
              <Th>Transfer Ref</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockTransfers.map(r => (
              <tr key={r.ref}>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td>{r.date}</Td>
                <Td>{r.from}</Td>
                <Td bold>{r.to}</Td>
                <Td right bold>{r.amount.toLocaleString()}</Td>
                <Td>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${modeCls[r.mode] ?? ""}`}>
                    {r.mode}
                  </span>
                </Td>
                <Td><span className="font-mono text-[9px] text-slate-500">{r.ref2}</span></Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${statusCls[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

const mockCheques = [
  { no: "101441", date: "02 Jan 2026", payee: "DEWA", bank: "Emirates NBD – Main", amount: 3_200, memo: "Utility Jan 2026", status: "Cleared" },
  { no: "101442", date: "05 Jan 2026", payee: "Al Ahli Insurance", bank: "Emirates NBD – Main", amount: 8_400, memo: "Annual Policy", status: "Cleared" },
  { no: "101443", date: "08 Jan 2026", payee: "Office Depot UAE", bank: "ADCB – Operations", amount: 1_650, memo: "Stationery Q1", status: "Cleared" },
  { no: "101444", date: "10 Jan 2026", payee: "Fresh Foods LLC", bank: "Emirates NBD – Main", amount: 12_300, memo: "Invoice INV-4412", status: "Outstanding" },
  { no: "101445", date: "12 Jan 2026", payee: "Premium Cleaning", bank: "ADCB – Operations", amount: 4_800, memo: "Monthly Contract", status: "Outstanding" },
  { no: "101446", date: "15 Jan 2026", payee: "Techno Parts", bank: "Emirates NBD – Main", amount: 8_800, memo: "Equipment Parts", status: "Cleared" },
  { no: "101447", date: "18 Jan 2026", payee: "GreenLeaf Co.", bank: "HSBC – Collection", amount: 7_450, memo: "Supplies Jan", status: "Outstanding" },
  { no: "101448", date: "20 Jan 2026", payee: "Marketing Plus", bank: "Emirates NBD – Main", amount: 5_500, memo: "Campaign Jan", status: "Void" },
  { no: "101449", date: "22 Jan 2026", payee: "Logistics Plus", bank: "ADCB – Operations", amount: 19_600, memo: "Delivery Fees", status: "Stale" },
  { no: "101450", date: "25 Jan 2026", payee: "Staff Canteen", bank: "Emirates NBD – Main", amount: 2_100, memo: "Catering Jan", status: "Outstanding" },
];

function ChequeRegisterReport() {
  const statusCls: Record<string, string> = {
    Cleared: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Outstanding: "bg-blue-50 text-blue-700 border-blue-200",
    Void: "bg-slate-100 text-slate-500 border-slate-200",
    Stale: "bg-amber-50 text-amber-700 border-amber-200",
    Bounced: "bg-red-50 text-red-700 border-red-200",
  };
  const outstanding = mockCheques.filter(c => c.status === "Outstanding").reduce((s, c) => s + c.amount, 0);
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Cheque Register" subtitle="All cheques issued with clearance status" period="Jan 2026" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total Issued", val: `${mockCheques.length} cheques` },
            { label: "Cleared", val: `${mockCheques.filter(c => c.status === "Cleared").length}` },
            { label: "Outstanding", val: aed(outstanding), color: "text-blue-700" },
            { label: "Void / Stale", val: `${mockCheques.filter(c => c.status === "Void" || c.status === "Stale").length}`, color: "text-amber-700" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color ?? "text-slate-800"}`}>{k.val}</p>
            </div>
          ))}
        </div>
        <Tbl>
          <thead>
            <tr>
              <Th>Cheque No.</Th>
              <Th>Date</Th>
              <Th>Payee</Th>
              <Th>Bank Account</Th>
              <Th right>Amount (AED)</Th>
              <Th>Memo</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {mockCheques.map(r => (
              <tr key={r.no} className={r.status === "Void" || r.status === "Stale" ? "opacity-50" : ""}>
                <Td><span className="font-mono text-[10px] font-semibold">{r.no}</span></Td>
                <Td>{r.date}</Td>
                <Td bold>{r.payee}</Td>
                <Td>{r.bank}</Td>
                <Td right bold>{r.amount.toLocaleString()}</Td>
                <Td muted>{r.memo}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${statusCls[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

const mockCharges = [
  { date: "05 Jan 2026", account: "Emirates NBD – Main", type: "Service Fee", ref: "BCH-0001", amount: 150, vatAmt: 7.5 },
  { date: "08 Jan 2026", account: "ADCB – Operations", type: "Wire Transfer Fee", ref: "BCH-0002", amount: 75, vatAmt: 3.75 },
  { date: "10 Jan 2026", account: "HSBC – Collection", type: "Monthly Maintenance", ref: "BCH-0003", amount: 200, vatAmt: 10 },
  { date: "12 Jan 2026", account: "Emirates NBD – Main", type: "Cheque Book Fee", ref: "BCH-0004", amount: 50, vatAmt: 2.5 },
  { date: "15 Jan 2026", account: "ADCB – Operations", type: "Swift Fee", ref: "BCH-0005", amount: 120, vatAmt: 6 },
  { date: "18 Jan 2026", account: "Emirates NBD – Main", type: "Interest Charged", ref: "BCH-0006", amount: 380, vatAmt: 0 },
  { date: "22 Jan 2026", account: "HSBC – Collection", type: "Card Processing Fee", ref: "BCH-0007", amount: 95, vatAmt: 4.75 },
  { date: "25 Jan 2026", account: "Emirates NBD – Main", type: "RTGS Fee", ref: "BCH-0008", amount: 60, vatAmt: 3 },
  { date: "28 Jan 2026", account: "ADCB – Operations", type: "Overdraft Fee", ref: "BCH-0009", amount: 250, vatAmt: 12.5 },
  { date: "31 Jan 2026", account: "Emirates NBD – Main", type: "Statement Fee", ref: "BCH-0010", amount: 30, vatAmt: 1.5 },
];

function BankChargesSummaryReport() {
  const total = mockCharges.reduce((s, r) => s + r.amount, 0);
  const totalVat = mockCharges.reduce((s, r) => s + r.vatAmt, 0);
  const byAccount = BANK_ACCOUNTS.map(a => ({
    label: a.split(" – ")[0],
    value: mockCharges.filter(c => c.account === a).reduce((s, c) => s + c.amount, 0),
  }));
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Bank Charges Summary" subtitle="Fees, commissions and interest by account" period="Jan 2026" />
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total Charges", val: aed(total), color: "text-red-600" },
            { label: "VAT on Charges", val: aed(totalVat), color: "text-slate-700" },
            { label: "Charge Items", val: `${mockCharges.length} entries`, color: "text-slate-700" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>
        <MiniBarChart data={byAccount} color="#ef4444" />
        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Bank Account</Th>
                <Th>Charge Type</Th>
                <Th>Ref #</Th>
                <Th right>Amount (AED)</Th>
                <Th right>VAT (AED)</Th>
                <Th right>Total (AED)</Th>
              </tr>
            </thead>
            <tbody>
              {mockCharges.map(r => (
                <tr key={r.ref}>
                  <Td>{r.date}</Td>
                  <Td>{r.account}</Td>
                  <Td bold>{r.type}</Td>
                  <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                  <Td right>{r.amount.toFixed(2)}</Td>
                  <Td right muted>{r.vatAmt.toFixed(2)}</Td>
                  <Td right bold>{(r.amount + r.vatAmt).toFixed(2)}</Td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <Td colSpan={4} bold>Total</Td>
                <Td right bold>{total.toFixed(2)}</Td>
                <Td right bold>{totalVat.toFixed(2)}</Td>
                <Td right bold>{(total + totalVat).toFixed(2)}</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

const mockBankPositions = [
  { bank: "Emirates NBD – Main", account: "AE07 0330 0000 0102 1450 801", currency: "AED", opening: 125_000, receipts: 71_900, payments: 51_900, closing: 145_000, available: 140_000, overdrLimit: 0 },
  { bank: "ADCB – Operations", account: "AE32 0350 0000 0203 2460 901", currency: "AED", opening: 45_000, receipts: 28_500, payments: 36_350, closing: 37_150, available: 37_150, overdrLimit: 50_000 },
  { bank: "HSBC – Collection", account: "AE46 0200 0000 0304 0112 201", currency: "AED", opening: 62_000, receipts: 15_000, payments: 18_295, closing: 58_705, available: 58_705, overdrLimit: 0 },
];

function BankPositionSummaryReport() {
  const totalOpening = mockBankPositions.reduce((s, r) => s + r.opening, 0);
  const totalClosing = mockBankPositions.reduce((s, r) => s + r.closing, 0);
  const totalReceipts = mockBankPositions.reduce((s, r) => s + r.receipts, 0);
  const totalPayments = mockBankPositions.reduce((s, r) => s + r.payments, 0);
  const chartData = mockBankPositions.map(r => ({ label: r.bank.split(" – ")[0], value: r.closing }));
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Bank Position Summary" subtitle="Consolidated balances across all accounts" period="Jan 2026" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Opening Position", val: aed(totalOpening), color: "text-slate-700" },
            { label: "Total Receipts", val: aed(totalReceipts), color: "text-emerald-700" },
            { label: "Total Payments", val: aed(totalPayments), color: "text-red-600" },
            { label: "Closing Position", val: aed(totalClosing), color: "text-[#b58900] font-bold" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>
        <MiniBarChart data={chartData} color="#F5C742" />
        <div className="mt-4">
          <Tbl>
            <thead>
              <tr>
                <Th>Bank</Th>
                <Th>Account No.</Th>
                <Th>CCY</Th>
                <Th right>Opening (AED)</Th>
                <Th right>Receipts (AED)</Th>
                <Th right>Payments (AED)</Th>
                <Th right>Closing (AED)</Th>
                <Th right>Available (AED)</Th>
              </tr>
            </thead>
            <tbody>
              {mockBankPositions.map(r => (
                <tr key={r.bank}>
                  <Td bold>{r.bank}</Td>
                  <Td><span className="font-mono text-[10px] text-slate-600">{r.account}</span></Td>
                  <Td><span className="text-[10px] font-semibold text-blue-700">{r.currency}</span></Td>
                  <Td right>{r.opening.toLocaleString()}</Td>
                  <Td right><span className="text-emerald-700 font-medium">{r.receipts.toLocaleString()}</span></Td>
                  <Td right><span className="text-red-600">{r.payments.toLocaleString()}</span></Td>
                  <Td right bold>{r.closing.toLocaleString()}</Td>
                  <Td right><span className="text-[#b58900] font-semibold">{r.available.toLocaleString()}</span></Td>
                </tr>
              ))}
              <tr className="bg-[#FFF6D8]">
                <Td colSpan={3} bold>Total</Td>
                <Td right bold>{totalOpening.toLocaleString()}</Td>
                <Td right bold><span className="text-emerald-700">{totalReceipts.toLocaleString()}</span></Td>
                <Td right bold><span className="text-red-600">{totalPayments.toLocaleString()}</span></Td>
                <Td right bold>{totalClosing.toLocaleString()}</Td>
                <Td right bold><span className="text-[#b58900]">{mockBankPositions.reduce((s, r) => s + r.available, 0).toLocaleString()}</span></Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Statements of Accounts Components ───────────────────────────────────────

const SOA_CUSTOMERS = [
  { id: "C001", name: "Al Noor Group", ref: "CUS-001", phone: "+971 4 234 5678", email: "accounts@alnoor.ae", creditLimit: 200_000, terms: "Net 30" },
  { id: "C002", name: "Delta Retail LLC", ref: "CUS-002", phone: "+971 2 567 8901", email: "finance@deltaretail.ae", creditLimit: 150_000, terms: "Net 45" },
  { id: "C003", name: "Star Mart", ref: "CUS-003", phone: "+971 6 345 2211", email: "ap@starmart.ae", creditLimit: 80_000, terms: "Net 30" },
  { id: "C004", name: "Blue Sky LLC", ref: "CUS-004", phone: "+971 4 876 5432", email: "billing@bluesky.ae", creditLimit: 120_000, terms: "Net 60" },
  { id: "C005", name: "Gulf Hypermart", ref: "CUS-005", phone: "+971 3 654 3210", email: "accounts@gulfhyper.ae", creditLimit: 300_000, terms: "Net 30" },
];

const mockCustomerSOA: Record<string, Array<{ date: string; ref: string; type: string; narration: string; debit: number; credit: number; balance: number }>> = {
  C001: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", type: "Balance B/F", debit: 0, credit: 0, balance: 42_500 },
    { date: "03 Jan 2026", ref: "INV-2201", narration: "Invoice – Goods Supply Jan Batch 1", type: "Invoice", debit: 18_500, credit: 0, balance: 61_000 },
    { date: "08 Jan 2026", ref: "REC-1042", narration: "Payment Received – ENBD Cheque", type: "Receipt", debit: 0, credit: 20_000, balance: 41_000 },
    { date: "12 Jan 2026", ref: "INV-2218", narration: "Invoice – Goods Supply Jan Batch 2", type: "Invoice", debit: 22_300, credit: 0, balance: 63_300 },
    { date: "15 Jan 2026", ref: "CN-0041", narration: "Credit Note – Return of Damaged Goods", type: "Credit Note", debit: 0, credit: 1_800, balance: 61_500 },
    { date: "20 Jan 2026", ref: "REC-1060", narration: "Payment Received – Bank Transfer", type: "Receipt", debit: 0, credit: 18_500, balance: 43_000 },
    { date: "25 Jan 2026", ref: "INV-2241", narration: "Invoice – Special Order #4412", type: "Invoice", debit: 11_200, credit: 0, balance: 54_200 },
    { date: "28 Jan 2026", ref: "PDCR-001", narration: "PDC Received – Feb 05 due", type: "PDC", debit: 0, credit: 0, balance: 54_200 },
  ],
  C002: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", type: "Balance B/F", debit: 0, credit: 0, balance: 31_000 },
    { date: "05 Jan 2026", ref: "INV-2205", narration: "Invoice – Weekly Supply", type: "Invoice", debit: 9_800, credit: 0, balance: 40_800 },
    { date: "12 Jan 2026", ref: "REC-1045", narration: "Payment Received", type: "Receipt", debit: 0, credit: 31_000, balance: 9_800 },
    { date: "18 Jan 2026", ref: "INV-2222", narration: "Invoice – Weekly Supply", type: "Invoice", debit: 9_800, credit: 0, balance: 19_600 },
  ],
  C003: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", type: "Balance B/F", debit: 0, credit: 0, balance: 0 },
    { date: "06 Jan 2026", ref: "INV-2208", narration: "Invoice – Monthly Supply", type: "Invoice", debit: 22_000, credit: 0, balance: 22_000 },
    { date: "15 Jan 2026", ref: "REC-1060", narration: "Payment Received", type: "Receipt", debit: 0, credit: 22_000, balance: 0 },
    { date: "22 Jan 2026", ref: "INV-2235", narration: "Invoice – Monthly Supply", type: "Invoice", debit: 22_000, credit: 0, balance: 22_000 },
  ],
};

function SOACustomerReport() {
  const [selectedId, setSelectedId] = useState("C001");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const customer = SOA_CUSTOMERS.find(c => c.id === selectedId)!;
  const filtered = SOA_CUSTOMERS.filter(c =>
    `${c.name} ${c.ref} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows = mockCustomerSOA[selectedId] ?? mockCustomerSOA["C001"];
  const totalDebit = rows.filter(r => r.debit > 0).reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.filter(r => r.credit > 0).reduce((s, r) => s + r.credit, 0);
  const closingBalance = rows[rows.length - 1]?.balance ?? 0;

  const typeCls: Record<string, string> = {
    "Invoice": "text-blue-700",
    "Receipt": "text-emerald-700",
    "Credit Note": "text-amber-700",
    "PDC": "text-indigo-600",
    "Balance B/F": "text-slate-500",
    "Balance C/F": "text-slate-500",
  };

  const aging = [
    { bucket: "Current", amount: Math.round(closingBalance * 0.45) },
    { bucket: "1–30 days", amount: Math.round(closingBalance * 0.30) },
    { bucket: "31–60 days", amount: Math.round(closingBalance * 0.15) },
    { bucket: "61–90 days", amount: Math.round(closingBalance * 0.07) },
    { bucket: "90+ days", amount: Math.round(closingBalance * 0.03) },
  ];

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Customer Statement of Account</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Invoices, receipts, credit notes and running balance</p>
          </div>
          <div className="text-right text-[10px] text-slate-500 space-y-0.5">
            <div>Period: <b className="text-slate-700">Jan 2026</b></div>
            <div>Generated: <b className="text-slate-700">22 May 2026</b></div>
          </div>
        </div>

        {/* Customer search + selector */}
        <div className="relative mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search customer by name, code or email…"
              className="flex-1 bg-transparent text-[11px] text-slate-700 placeholder:text-slate-400 outline-none"
            />
            {selectedId && !open && (
              <span className="text-[10px] font-semibold text-[#b58900] border border-[#F5C742] bg-[#FFF6D8] px-2 py-0.5 rounded-full shrink-0">
                {customer.name}
              </span>
            )}
            <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
          {open && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-slate-400">No customers match "{search}"</p>
              ) : filtered.map(c => (
                <button key={c.id} onClick={() => { setSelectedId(c.id); setSearch(""); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 ${selectedId === c.id ? "bg-[#FFF6D8]" : ""}`}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold text-slate-800">{c.name}</span>
                    <span className="text-[10px] text-slate-500">{c.ref} · {c.email}</span>
                  </div>
                  <div className="text-right flex flex-col gap-0.5 shrink-0">
                    <span className="text-[10px] text-slate-500">Limit: <b className="text-slate-700">{aed(c.creditLimit)}</b></span>
                    <span className="text-[9px] text-slate-400">{c.terms}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Customer card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Customer</p><p className="font-semibold text-slate-800">{customer.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Ref / Code</p><p className="font-mono text-slate-700">{customer.ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Credit Limit</p><p className="font-semibold text-slate-800">{aed(customer.creditLimit)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Payment Terms</p><p className="font-semibold text-slate-700">{customer.terms}</p></div>
          <div><p className="text-slate-400 mb-0.5">Phone</p><p className="text-slate-700">{customer.phone}</p></div>
          <div><p className="text-slate-400 mb-0.5">Email</p><p className="text-slate-700">{customer.email}</p></div>
          <div><p className="text-slate-400 mb-0.5">Opening Balance</p><p className="font-semibold text-slate-800">{aed(rows[0]?.balance ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Closing Balance</p><p className={`font-bold text-sm ${closingBalance > 0 ? "text-red-600" : "text-emerald-700"}`}>{aed(closingBalance)}</p></div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total Invoiced", val: aed(totalDebit), color: "text-blue-700" },
            { label: "Total Received", val: aed(totalCredit), color: "text-emerald-700" },
            { label: "Balance Due", val: aed(closingBalance), color: closingBalance > 0 ? "text-red-600" : "text-emerald-700" },
            { label: "Credit Utilised", val: `${Math.round((closingBalance / customer.creditLimit) * 100)}%`, color: "text-amber-700" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>

        {/* Transaction table */}
        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Ref #</Th>
              <Th>Type</Th>
              <Th>Narration</Th>
              <Th right>Debit (AED)</Th>
              <Th right>Credit (AED)</Th>
              <Th right>Balance (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.type.startsWith("Balance") ? "bg-slate-50" : ""}>
                <Td>{r.date}</Td>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td><span className={`text-[10px] font-medium ${typeCls[r.type] ?? "text-slate-600"}`}>{r.type}</span></Td>
                <Td>{r.narration}</Td>
                <Td right>{r.debit > 0 ? <span className="text-blue-700 font-medium">{r.debit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right>{r.credit > 0 ? <span className="text-emerald-700">{r.credit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right bold>{r.balance.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>

        {/* Aging summary */}
        <div className="mt-4">
          <p className="text-[10px] font-semibold text-slate-700 mb-2">Aging Analysis</p>
          <div className="flex gap-2">
            {aging.map(a => (
              <div key={a.bucket} className={`flex-1 rounded-lg border p-2 text-center ${a.bucket === "90+ days" && a.amount > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <p className="text-[9px] text-slate-500 mb-0.5">{a.bucket}</p>
                <p className={`text-[11px] font-bold ${a.bucket === "90+ days" && a.amount > 0 ? "text-red-600" : "text-slate-800"}`}>{aed(a.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Signature strip */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {["Prepared By", "Accounts Manager", "Customer Acknowledgement"].map(s => (
            <div key={s} className="border-t-2 border-dashed border-slate-300 pt-2 text-center text-[9px] text-slate-400">{s}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Vendor SOA ────────────────────────────────────────────────────────────────

const SOA_VENDORS = [
  { id: "V001", name: "Fresh Foods LLC", ref: "VEN-001", phone: "+971 4 321 9876", email: "ap@freshfoods.ae", terms: "Net 30", currency: "AED" },
  { id: "V002", name: "GreenLeaf Co.", ref: "VEN-002", phone: "+971 2 432 6543", email: "billing@greenleaf.ae", terms: "Net 45", currency: "AED" },
  { id: "V003", name: "Techno Parts", ref: "VEN-003", phone: "+971 6 543 2109", email: "accounts@technoparts.ae", terms: "Net 30", currency: "AED" },
  { id: "V004", name: "Logistics Plus", ref: "VEN-004", phone: "+971 4 765 4321", email: "finance@logisticsplus.ae", terms: "COD", currency: "AED" },
];

const mockVendorSOA: Record<string, Array<{ date: string; ref: string; type: string; narration: string; debit: number; credit: number; balance: number }>> = {
  V001: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", type: "Balance B/F", debit: 0, credit: 0, balance: 21_000 },
    { date: "04 Jan 2026", ref: "BILL-3301", narration: "Purchase Bill – Groceries Batch 1", type: "Bill", debit: 0, credit: 12_300, balance: 33_300 },
    { date: "09 Jan 2026", ref: "PMT-2201", narration: "Payment Made – ENBD Transfer", type: "Payment", debit: 21_000, credit: 0, balance: 12_300 },
    { date: "15 Jan 2026", ref: "BILL-3318", narration: "Purchase Bill – Groceries Batch 2", type: "Bill", debit: 0, credit: 14_800, balance: 27_100 },
    { date: "18 Jan 2026", ref: "DN-0011", narration: "Debit Note – Short Supply Return", type: "Debit Note", debit: 1_200, credit: 0, balance: 25_900 },
    { date: "25 Jan 2026", ref: "PMT-2230", narration: "Payment Made – Cheque #101444", type: "Payment", debit: 12_300, credit: 0, balance: 13_600 },
  ],
  V002: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", type: "Balance B/F", debit: 0, credit: 0, balance: 7_450 },
    { date: "06 Jan 2026", ref: "BILL-3305", narration: "Purchase Bill – Produce", type: "Bill", debit: 0, credit: 9_200, balance: 16_650 },
    { date: "14 Jan 2026", ref: "PMT-2210", narration: "Payment Made", type: "Payment", debit: 7_450, credit: 0, balance: 9_200 },
  ],
};

function SOAVendorReport() {
  const [selectedId, setSelectedId] = useState("V001");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const vendor = SOA_VENDORS.find(v => v.id === selectedId)!;
  const filtered = SOA_VENDORS.filter(v =>
    `${v.name} ${v.ref} ${v.email}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows = mockVendorSOA[selectedId] ?? mockVendorSOA["V001"];
  const totalBills = rows.filter(r => r.credit > 0 && r.type === "Bill").reduce((s, r) => s + r.credit, 0);
  const totalPaid = rows.filter(r => r.debit > 0 && r.type === "Payment").reduce((s, r) => s + r.debit, 0);
  const closingBalance = rows[rows.length - 1]?.balance ?? 0;

  const typeCls: Record<string, string> = {
    "Bill": "text-red-600",
    "Payment": "text-emerald-700",
    "Debit Note": "text-amber-700",
    "Balance B/F": "text-slate-500",
  };

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Vendor Statement of Account</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Bills, payments, debit notes and running balance</p>
          </div>
          <div className="text-right text-[10px] text-slate-500 space-y-0.5">
            <div>Period: <b className="text-slate-700">Jan 2026</b></div>
            <div>Generated: <b className="text-slate-700">22 May 2026</b></div>
          </div>
        </div>

        {/* Vendor search + selector */}
        <div className="relative mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search vendor by name, code or email…"
              className="flex-1 bg-transparent text-[11px] text-slate-700 placeholder:text-slate-400 outline-none"
            />
            {selectedId && !open && (
              <span className="text-[10px] font-semibold text-[#b58900] border border-[#F5C742] bg-[#FFF6D8] px-2 py-0.5 rounded-full shrink-0">
                {vendor.name}
              </span>
            )}
            <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
          {open && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-slate-400">No vendors match "{search}"</p>
              ) : filtered.map(v => (
                <button key={v.id} onClick={() => { setSelectedId(v.id); setSearch(""); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 ${selectedId === v.id ? "bg-[#FFF6D8]" : ""}`}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold text-slate-800">{v.name}</span>
                    <span className="text-[10px] text-slate-500">{v.ref} · {v.email}</span>
                  </div>
                  <div className="text-right flex flex-col gap-0.5 shrink-0">
                    <span className="text-[9px] text-slate-400">Terms: <b className="text-slate-600">{v.terms}</b></span>
                    <span className="text-[9px] text-slate-400">{v.currency}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Vendor</p><p className="font-semibold text-slate-800">{vendor.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Ref / Code</p><p className="font-mono text-slate-700">{vendor.ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Payment Terms</p><p className="font-semibold text-slate-700">{vendor.terms}</p></div>
          <div><p className="text-slate-400 mb-0.5">Currency</p><p className="font-semibold text-blue-700">{vendor.currency}</p></div>
          <div><p className="text-slate-400 mb-0.5">Phone</p><p className="text-slate-700">{vendor.phone}</p></div>
          <div><p className="text-slate-400 mb-0.5">Email</p><p className="text-slate-700">{vendor.email}</p></div>
          <div><p className="text-slate-400 mb-0.5">Opening Balance</p><p className="font-semibold text-slate-800">{aed(rows[0]?.balance ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Balance Payable</p><p className={`font-bold text-sm ${closingBalance > 0 ? "text-red-600" : "text-emerald-700"}`}>{aed(closingBalance)}</p></div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total Bills", val: aed(totalBills), color: "text-red-600" },
            { label: "Total Paid", val: aed(totalPaid), color: "text-emerald-700" },
            { label: "Balance Payable", val: aed(closingBalance), color: "text-slate-800" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>

        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th><Th>Ref #</Th><Th>Type</Th><Th>Narration</Th>
              <Th right>Debit (AED)</Th><Th right>Credit (AED)</Th><Th right>Balance (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.type.startsWith("Balance") ? "bg-slate-50" : ""}>
                <Td>{r.date}</Td>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td><span className={`text-[10px] font-medium ${typeCls[r.type] ?? "text-slate-600"}`}>{r.type}</span></Td>
                <Td>{r.narration}</Td>
                <Td right>{r.debit > 0 ? <span className="text-emerald-700 font-medium">{r.debit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right>{r.credit > 0 ? <span className="text-red-600">{r.credit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right bold>{r.balance.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>

        <div className="mt-5 grid grid-cols-3 gap-4">
          {["Prepared By", "Accounts Manager", "Vendor Acknowledgement"].map(s => (
            <div key={s} className="border-t-2 border-dashed border-slate-300 pt-2 text-center text-[9px] text-slate-400">{s}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Employee Ledger SOA ───────────────────────────────────────────────────────

const SOA_EMPLOYEES = [
  { id: "E001", name: "Ahmed Al Mansouri", ref: "EMP-001", dept: "Operations", position: "Supervisor", salary: 8_500 },
  { id: "E002", name: "Sara Hassan", ref: "EMP-002", dept: "Finance", position: "Accountant", salary: 7_200 },
  { id: "E003", name: "Ravi Kumar", ref: "EMP-003", dept: "Warehouse", position: "Senior Picker", salary: 5_400 },
  { id: "E004", name: "Maria Santos", ref: "EMP-004", dept: "Sales", position: "Sales Executive", salary: 6_800 },
];

type EmpRow = { date: string; ref: string; type: string; narration: string; earning: number; deduction: number; balance: number };
const mockEmployeeSOA: Record<string, EmpRow[]> = {
  E001: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance (Advance)", type: "Balance B/F", earning: 0, deduction: 0, balance: 2_000 },
    { date: "01 Jan 2026", ref: "SAL-JAN-001", narration: "Basic Salary – January 2026", type: "Salary", earning: 8_500, deduction: 0, balance: 10_500 },
    { date: "01 Jan 2026", ref: "ALLOW-JAN-001", narration: "Housing Allowance", type: "Allowance", earning: 2_000, deduction: 0, balance: 12_500 },
    { date: "01 Jan 2026", ref: "ALLOW-JAN-002", narration: "Transport Allowance", type: "Allowance", earning: 800, deduction: 0, balance: 13_300 },
    { date: "05 Jan 2026", ref: "ADV-0031", narration: "Salary Advance Issued", type: "Advance", earning: 0, deduction: 3_000, balance: 10_300 },
    { date: "15 Jan 2026", ref: "DED-JAN-001", narration: "GOSI Deduction", type: "Deduction", earning: 0, deduction: 850, balance: 9_450 },
    { date: "28 Jan 2026", ref: "PAY-JAN-001", narration: "Net Salary Paid – ADCB WPS", type: "Payment", earning: 0, deduction: 9_450, balance: 0 },
  ],
  E002: [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", type: "Balance B/F", earning: 0, deduction: 0, balance: 0 },
    { date: "01 Jan 2026", ref: "SAL-JAN-002", narration: "Basic Salary – January 2026", type: "Salary", earning: 7_200, deduction: 0, balance: 7_200 },
    { date: "01 Jan 2026", ref: "ALLOW-JAN-003", narration: "Housing Allowance", type: "Allowance", earning: 1_500, deduction: 0, balance: 8_700 },
    { date: "15 Jan 2026", ref: "DED-JAN-002", narration: "GOSI Deduction", type: "Deduction", earning: 0, deduction: 720, balance: 7_980 },
    { date: "28 Jan 2026", ref: "PAY-JAN-002", narration: "Net Salary Paid – ADCB WPS", type: "Payment", earning: 0, deduction: 7_980, balance: 0 },
  ],
};

function SOAEmployeeReport() {
  const [selectedId, setSelectedId] = useState("E001");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const emp = SOA_EMPLOYEES.find(e => e.id === selectedId)!;
  const filtered = SOA_EMPLOYEES.filter(e =>
    `${e.name} ${e.ref} ${e.dept} ${e.position}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows = mockEmployeeSOA[selectedId] ?? mockEmployeeSOA["E001"];
  const totalEarnings = rows.filter(r => r.earning > 0).reduce((s, r) => s + r.earning, 0);
  const totalDeductions = rows.filter(r => r.deduction > 0).reduce((s, r) => s + r.deduction, 0);
  const netPayable = rows[rows.length - 1]?.balance ?? 0;

  const typeCls: Record<string, string> = {
    "Salary": "text-emerald-700",
    "Allowance": "text-blue-600",
    "Advance": "text-amber-700",
    "Deduction": "text-red-600",
    "Payment": "text-slate-600",
    "Balance B/F": "text-slate-400",
  };

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Employee Ledger Statement</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Salary, allowances, advances, deductions and net payable</p>
          </div>
          <div className="text-right text-[10px] text-slate-500 space-y-0.5">
            <div>Period: <b className="text-slate-700">Jan 2026</b></div>
            <div>Generated: <b className="text-slate-700">22 May 2026</b></div>
          </div>
        </div>

        {/* Employee search + selector */}
        <div className="relative mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search employee by name, ID, department or position…"
              className="flex-1 bg-transparent text-[11px] text-slate-700 placeholder:text-slate-400 outline-none"
            />
            {selectedId && !open && (
              <span className="text-[10px] font-semibold text-[#b58900] border border-[#F5C742] bg-[#FFF6D8] px-2 py-0.5 rounded-full shrink-0">
                {emp.name}
              </span>
            )}
            <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
          {open && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-slate-400">No employees match "{search}"</p>
              ) : filtered.map(e => (
                <button key={e.id} onClick={() => { setSelectedId(e.id); setSearch(""); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 ${selectedId === e.id ? "bg-[#FFF6D8]" : ""}`}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold text-slate-800">{e.name}</span>
                    <span className="text-[10px] text-slate-500">{e.ref} · {e.dept}</span>
                  </div>
                  <div className="text-right flex flex-col gap-0.5 shrink-0">
                    <span className="text-[10px] text-slate-600 font-medium">{e.position}</span>
                    <span className="text-[9px] text-slate-400">{aed(e.salary)} / mo</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Employee</p><p className="font-semibold text-slate-800">{emp.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Employee Ref</p><p className="font-mono text-slate-700">{emp.ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Department</p><p className="text-slate-700">{emp.dept}</p></div>
          <div><p className="text-slate-400 mb-0.5">Position</p><p className="text-slate-700">{emp.position}</p></div>
          <div><p className="text-slate-400 mb-0.5">Basic Salary</p><p className="font-semibold text-slate-800">{aed(emp.salary)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Total Earnings</p><p className="font-semibold text-emerald-700">{aed(totalEarnings)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Total Deductions</p><p className="font-semibold text-red-600">{aed(totalDeductions)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Net Payable</p><p className={`font-bold text-sm ${netPayable > 0 ? "text-[#b58900]" : "text-emerald-700"}`}>{aed(netPayable)}</p></div>
        </div>

        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th><Th>Ref #</Th><Th>Type</Th><Th>Narration</Th>
              <Th right>Earnings (AED)</Th><Th right>Deductions (AED)</Th><Th right>Balance (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.type === "Payment" ? "bg-emerald-50/40" : r.type.startsWith("Balance") ? "bg-slate-50" : ""}>
                <Td>{r.date}</Td>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td><span className={`text-[10px] font-medium ${typeCls[r.type] ?? "text-slate-600"}`}>{r.type}</span></Td>
                <Td>{r.narration}</Td>
                <Td right>{r.earning > 0 ? <span className="text-emerald-700 font-medium">{r.earning.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right>{r.deduction > 0 ? <span className="text-red-600">{r.deduction.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right bold>{r.balance.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>

        <div className="mt-5 grid grid-cols-3 gap-4">
          {["Prepared By", "HR Manager", "Employee Signature"].map(s => (
            <div key={s} className="border-t-2 border-dashed border-slate-300 pt-2 text-center text-[9px] text-slate-400">{s}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Ledger Account SOA ────────────────────────────────────────────────────────

const GL_ACCOUNTS = [
  { code: "1100", name: "Cash in Hand", type: "Asset" },
  { code: "1200", name: "Bank – Emirates NBD", type: "Asset" },
  { code: "1300", name: "Accounts Receivable", type: "Asset" },
  { code: "2100", name: "Accounts Payable", type: "Liability" },
  { code: "3000", name: "Share Capital", type: "Equity" },
  { code: "4000", name: "Sales Revenue", type: "Income" },
  { code: "5100", name: "Cost of Goods Sold", type: "Expense" },
  { code: "6100", name: "Employee Benefits Expense", type: "Expense" },
  { code: "6200", name: "Rent & Utilities", type: "Expense" },
];

type LedgerRow = { date: string; ref: string; narration: string; debit: number; credit: number; balance: number };

function makeLedgerRows(opening: number): LedgerRow[] {
  const base = [
    { date: "01 Jan 2026", ref: "OB", narration: "Opening Balance", debit: 0, credit: 0, balance: opening },
    { date: "03 Jan 2026", ref: "JNL-0101", narration: "Sales – Al Noor Group Invoice", debit: 18_500, credit: 0, balance: opening + 18_500 },
    { date: "05 Jan 2026", ref: "JNL-0105", narration: "Cash Receipt – Counter Sales", debit: 4_200, credit: 0, balance: opening + 22_700 },
    { date: "08 Jan 2026", ref: "JNL-0112", narration: "Payment – Fresh Foods Invoice", debit: 0, credit: 12_300, balance: opening + 10_400 },
    { date: "12 Jan 2026", ref: "JNL-0118", narration: "Sales – Delta Retail Invoice", debit: 9_800, credit: 0, balance: opening + 20_200 },
    { date: "15 Jan 2026", ref: "JNL-0125", narration: "Vendor Payment – GreenLeaf", debit: 0, credit: 7_450, balance: opening + 12_750 },
    { date: "18 Jan 2026", ref: "JNL-0131", narration: "Cash Receipt – Membership Fees", debit: 3_600, credit: 0, balance: opening + 16_350 },
    { date: "22 Jan 2026", ref: "JNL-0138", narration: "Rent Payment – Jan 2026", debit: 0, credit: 8_500, balance: opening + 7_850 },
    { date: "25 Jan 2026", ref: "JNL-0145", narration: "Sales – Star Mart Invoice", debit: 22_000, credit: 0, balance: opening + 29_850 },
    { date: "28 Jan 2026", ref: "JNL-0152", narration: "Salary Payment – Jan WPS", debit: 0, credit: 18_200, balance: opening + 11_650 },
    { date: "31 Jan 2026", ref: "CB", narration: "Closing Balance", debit: 0, credit: 0, balance: opening + 11_650 },
  ];
  return base;
}

function SOALedgerReport() {
  const [selectedCode, setSelectedCode] = useState("1200");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const account = GL_ACCOUNTS.find(a => a.code === selectedCode)!;
  const filtered = GL_ACCOUNTS.filter(a =>
    `${a.code} ${a.name} ${a.type}`.toLowerCase().includes(search.toLowerCase())
  );
  const openingMap: Record<string, number> = { "1100": 8_400, "1200": 125_000, "1300": 74_300, "2100": 21_000, "3000": 500_000, "4000": 0, "5100": 0, "6100": 0, "6200": 0 };
  const rows = makeLedgerRows(openingMap[selectedCode] ?? 10_000);
  const totalDebit = rows.filter(r => r.debit > 0).reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.filter(r => r.credit > 0).reduce((s, r) => s + r.credit, 0);
  const closingBalance = rows[rows.length - 1]?.balance ?? 0;

  const typeColors: Record<string, string> = { Asset: "text-blue-700 bg-blue-50", Liability: "text-red-700 bg-red-50", Equity: "text-purple-700 bg-purple-50", Income: "text-emerald-700 bg-emerald-50", Expense: "text-amber-700 bg-amber-50" };

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Ledger Account Statement</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Full debit/credit movement for a single GL account</p>
          </div>
          <div className="text-right text-[10px] text-slate-500 space-y-0.5">
            <div>Period: <b className="text-slate-700">Jan 2026</b></div>
            <div>Generated: <b className="text-slate-700">22 May 2026</b></div>
          </div>
        </div>

        {/* Account search + selector */}
        <div className="relative mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search by account code, name or type…"
              className="flex-1 bg-transparent text-[11px] text-slate-700 placeholder:text-slate-400 outline-none"
            />
            {selectedCode && !open && (
              <span className="text-[10px] font-semibold text-[#b58900] border border-[#F5C742] bg-[#FFF6D8] px-2 py-0.5 rounded-full shrink-0">
                {account.code} · {account.name}
              </span>
            )}
            <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
          {open && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-slate-400">No accounts match "{search}"</p>
              ) : filtered.map(a => {
                const typeCls: Record<string, string> = { Asset: "text-blue-700 bg-blue-50", Liability: "text-red-700 bg-red-50", Equity: "text-purple-700 bg-purple-50", Income: "text-emerald-700 bg-emerald-50", Expense: "text-amber-700 bg-amber-50" };
                return (
                  <button key={a.code} onClick={() => { setSelectedCode(a.code); setSearch(""); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 ${selectedCode === a.code ? "bg-[#FFF6D8]" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-700 w-10 shrink-0">{a.code}</span>
                      <span className="text-[11px] text-slate-800">{a.name}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${typeCls[a.type]}`}>{a.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Account info */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 flex flex-wrap gap-6 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Account Name</p><p className="font-semibold text-slate-800">{account.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Account Code</p><p className="font-mono text-slate-700">{account.code}</p></div>
          <div><p className="text-slate-400 mb-0.5">Account Type</p>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${typeColors[account.type]}`}>{account.type}</span>
          </div>
          <div><p className="text-slate-400 mb-0.5">Opening Balance</p><p className="font-semibold text-slate-800">{aed(rows[0]?.balance ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Closing Balance</p><p className="font-bold text-[#b58900]">{aed(closingBalance)}</p></div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total Debits", val: aed(totalDebit), color: "text-blue-700" },
            { label: "Total Credits", val: aed(totalCredit), color: "text-red-600" },
            { label: "Net Movement", val: aed(totalDebit - totalCredit), color: totalDebit >= totalCredit ? "text-emerald-700" : "text-red-600" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>

        <Tbl>
          <thead>
            <tr>
              <Th>Date</Th><Th>Ref #</Th><Th>Narration</Th>
              <Th right>Debit (AED)</Th><Th right>Credit (AED)</Th><Th right>Balance (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.ref === "OB" || r.ref === "CB" ? "bg-slate-50 font-semibold" : ""}>
                <Td>{r.date}</Td>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td>{r.narration}</Td>
                <Td right>{r.debit > 0 ? <span className="text-blue-700 font-medium">{r.debit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right>{r.credit > 0 ? <span className="text-red-600">{r.credit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right bold>{r.balance.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ── All Accounts Statement ────────────────────────────────────────────────────

const ALL_ACCOUNTS_DATA = [
  { code: "1100", name: "Cash in Hand", type: "Asset", opening: 8_400, debit: 7_800, credit: 6_200, closing: 10_000 },
  { code: "1200", name: "Bank – Emirates NBD", type: "Asset", opening: 125_000, debit: 71_900, credit: 51_900, closing: 145_000 },
  { code: "1210", name: "Bank – ADCB Operations", type: "Asset", opening: 45_000, debit: 28_500, credit: 36_350, closing: 37_150 },
  { code: "1300", name: "Accounts Receivable", type: "Asset", opening: 74_300, debit: 83_500, credit: 71_800, closing: 86_000 },
  { code: "1400", name: "Inventory – Finished Goods", type: "Asset", opening: 112_000, debit: 45_000, credit: 38_500, closing: 118_500 },
  { code: "1500", name: "Prepaid Expenses", type: "Asset", opening: 6_500, debit: 0, credit: 1_500, closing: 5_000 },
  { code: "2100", name: "Accounts Payable", type: "Liability", opening: 21_000, debit: 33_300, credit: 27_100, closing: 14_800 },
  { code: "2200", name: "VAT Payable", type: "Liability", opening: 4_200, debit: 4_200, credit: 6_100, closing: 6_100 },
  { code: "2300", name: "Accrued Liabilities", type: "Liability", opening: 8_800, debit: 8_800, credit: 9_500, closing: 9_500 },
  { code: "3000", name: "Share Capital", type: "Equity", opening: 500_000, debit: 0, credit: 0, closing: 500_000 },
  { code: "3100", name: "Retained Earnings", type: "Equity", opening: 82_400, debit: 0, credit: 0, closing: 82_400 },
  { code: "4000", name: "Sales Revenue", type: "Income", opening: 0, debit: 0, credit: 125_000, closing: 125_000 },
  { code: "4100", name: "Other Income", type: "Income", opening: 0, debit: 0, credit: 2_500, closing: 2_500 },
  { code: "5100", name: "Cost of Goods Sold", type: "Expense", opening: 0, debit: 38_500, credit: 0, closing: 38_500 },
  { code: "6100", name: "Employee Benefits", type: "Expense", opening: 0, debit: 45_000, credit: 0, closing: 45_000 },
  { code: "6200", name: "Rent & Utilities", type: "Expense", opening: 0, debit: 25_000, credit: 0, closing: 25_000 },
  { code: "6300", name: "Marketing Expenses", type: "Expense", opening: 0, debit: 6_500, credit: 0, closing: 6_500 },
  { code: "6400", name: "Admin Expenses", type: "Expense", opening: 0, debit: 4_200, credit: 0, closing: 4_200 },
];

function SOAAllAccountsReport() {
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const types = ["All", "Asset", "Liability", "Equity", "Income", "Expense"];
  const typeCls: Record<string, string> = { Asset: "text-blue-700", Liability: "text-red-600", Equity: "text-purple-700", Income: "text-emerald-700", Expense: "text-amber-700" };
  const filtered = typeFilter === "All" ? ALL_ACCOUNTS_DATA : ALL_ACCOUNTS_DATA.filter(a => a.type === typeFilter);
  const totalDebit = filtered.reduce((s, r) => s + r.debit, 0);
  const totalCredit = filtered.reduce((s, r) => s + r.credit, 0);

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">All Accounts Statement</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Opening, movement and closing balance for every GL account</p>
          </div>
          <div className="text-right text-[10px] text-slate-500 space-y-0.5">
            <div>Period: <b className="text-slate-700">Jan 2026</b></div>
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${typeFilter === t ? "border-[#F5C742] bg-[#FFF6D8] font-semibold text-slate-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
              {t}
            </button>
          ))}
        </div>

        <Tbl>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Account Name</Th>
              <Th>Type</Th>
              <Th right>Opening (AED)</Th>
              <Th right>Debit (AED)</Th>
              <Th right>Credit (AED)</Th>
              <Th right>Closing (AED)</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.code}>
                <Td><span className="font-mono text-[10px] font-semibold">{r.code}</span></Td>
                <Td bold>{r.name}</Td>
                <Td><span className={`text-[9px] font-semibold ${typeCls[r.type]}`}>{r.type}</span></Td>
                <Td right muted={r.opening === 0}>{r.opening > 0 ? r.opening.toLocaleString() : "—"}</Td>
                <Td right>{r.debit > 0 ? <span className="text-blue-700">{r.debit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right>{r.credit > 0 ? <span className="text-red-600">{r.credit.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td right bold>{r.closing.toLocaleString()}</Td>
              </tr>
            ))}
            <tr className="bg-[#FFF6D8]">
              <Td colSpan={4} bold>Total ({filtered.length} accounts)</Td>
              <Td right bold><span className="text-blue-700">{totalDebit.toLocaleString()}</span></Td>
              <Td right bold><span className="text-red-600">{totalCredit.toLocaleString()}</span></Td>
              <Td right bold>{(totalDebit - totalCredit >= 0 ? "+" : "") + (totalDebit - totalCredit).toLocaleString()}</Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ── Intercompany Statement ────────────────────────────────────────────────────

const IC_ENTITIES = ["BillBull FZE (Dubai)", "BillBull Abu Dhabi LLC", "BillBull Sharjah Branch"];

const mockIntercompany = [
  { ref: "IC-001", date: "05 Jan 2026", from: "BillBull FZE (Dubai)", to: "BillBull Abu Dhabi LLC", type: "Loan", narration: "Working Capital Loan – Jan 2026", amount: 50_000, status: "Confirmed" },
  { ref: "IC-002", date: "08 Jan 2026", from: "BillBull FZE (Dubai)", to: "BillBull Sharjah Branch", type: "Recharge", narration: "Shared Services Cost Allocation Q1", amount: 12_500, status: "Confirmed" },
  { ref: "IC-003", date: "12 Jan 2026", from: "BillBull Abu Dhabi LLC", to: "BillBull FZE (Dubai)", type: "Settlement", narration: "Partial Loan Repayment", amount: 20_000, status: "Confirmed" },
  { ref: "IC-004", date: "15 Jan 2026", from: "BillBull Sharjah Branch", to: "BillBull FZE (Dubai)", type: "Settlement", narration: "Cost Recharge Settlement Jan", amount: 8_000, status: "Confirmed" },
  { ref: "IC-005", date: "18 Jan 2026", from: "BillBull FZE (Dubai)", to: "BillBull Abu Dhabi LLC", type: "Dividend", narration: "Interim Dividend Distribution", amount: 15_000, status: "Pending" },
  { ref: "IC-006", date: "22 Jan 2026", from: "BillBull FZE (Dubai)", to: "BillBull Sharjah Branch", type: "Recharge", narration: "IT Licence Recharge Q1", amount: 4_800, status: "Disputed" },
  { ref: "IC-007", date: "25 Jan 2026", from: "BillBull Sharjah Branch", to: "BillBull Abu Dhabi LLC", type: "Recharge", narration: "Warehouse Space Sharing Jan", amount: 3_200, status: "Confirmed" },
];

function SOAIntercompanyReport() {
  const [entity, setEntity] = useState<string>("All");
  const statusCls: Record<string, string> = {
    Confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Disputed: "bg-red-50 text-red-700 border-red-200",
  };
  const typeCls: Record<string, string> = { Loan: "text-blue-700", Recharge: "text-indigo-700", Settlement: "text-emerald-700", Dividend: "text-purple-700" };
  const filtered = entity === "All" ? mockIntercompany : mockIntercompany.filter(r => r.from === entity || r.to === entity);

  // Net balance per entity pair
  const balances = IC_ENTITIES.map(e => {
    const receivable = mockIntercompany.filter(r => r.to === e && r.status === "Confirmed").reduce((s, r) => s + r.amount, 0);
    const payable = mockIntercompany.filter(r => r.from === e && r.status === "Confirmed").reduce((s, r) => s + r.amount, 0);
    return { entity: e.split(" ")[1] ?? e, receivable, payable, net: receivable - payable };
  });

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Intercompany Statement</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Cross-entity balances for group reconciliation</p>
          </div>
          <div className="text-right text-[10px] text-slate-500 space-y-0.5">
            <div>Period: <b className="text-slate-700">Jan 2026</b></div>
          </div>
        </div>

        {/* Entity net position strip */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {balances.map(b => (
            <div key={b.entity} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold text-slate-700 mb-2">{b.entity}</p>
              <div className="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>Receivable from group</span><span className="text-emerald-700 font-semibold">{aed(b.receivable)}</span></div>
              <div className="flex justify-between text-[9px] text-slate-500 mb-1"><span>Payable to group</span><span className="text-red-600 font-semibold">{aed(b.payable)}</span></div>
              <div className="border-t border-slate-200 pt-1 flex justify-between text-[9px]">
                <span className="font-semibold text-slate-700">Net Position</span>
                <span className={`font-bold ${b.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>{b.net >= 0 ? "+" : ""}{aed(b.net)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Entity filter */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {["All", ...IC_ENTITIES].map(e => (
            <button key={e} onClick={() => setEntity(e)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${entity === e ? "border-[#F5C742] bg-[#FFF6D8] font-semibold text-slate-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
              {e === "All" ? "All Entities" : e.replace("BillBull ", "")}
            </button>
          ))}
        </div>

        <Tbl>
          <thead>
            <tr>
              <Th>Ref #</Th><Th>Date</Th><Th>From Entity</Th><Th>To Entity</Th>
              <Th>Type</Th><Th>Narration</Th><Th right>Amount (AED)</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.ref}>
                <Td><span className="font-mono text-[10px]">{r.ref}</span></Td>
                <Td>{r.date}</Td>
                <Td>{r.from.replace("BillBull ", "")}</Td>
                <Td bold>{r.to.replace("BillBull ", "")}</Td>
                <Td><span className={`text-[10px] font-medium ${typeCls[r.type] ?? "text-slate-600"}`}>{r.type}</span></Td>
                <Td>{r.narration}</Td>
                <Td right bold>{r.amount.toLocaleString()}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${statusCls[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ─── Group metadata ───────────────────────────────────────────────────────────

const GROUP_META: Record<ReportGroupId, { label: string; icon: React.ReactNode; subtitle: string }> = {
  pl: {
    label: "Profit & Loss",
    icon: <TrendingUp className="h-4 w-4" />,
    subtitle: "Income statement, gross profit, comparative",
  },
  balance: {
    label: "Balance Sheet",
    icon: <Building2 className="h-4 w-4" />,
    subtitle: "Financial position & trial balance",
  },
  cashflow: {
    label: "Cash Flow",
    icon: <DollarSign className="h-4 w-4" />,
    subtitle: "Cash flows, bank reconciliation, petty cash",
  },
  receivables: {
    label: "Receivables",
    icon: <Receipt className="h-4 w-4" />,
    subtitle: "Customer aging, collection, credit",
  },
  payables: {
    label: "Payables",
    icon: <Landmark className="h-4 w-4" />,
    subtitle: "Vendor aging, payment schedule, outstanding",
  },
  vat: {
    label: "VAT & Tax",
    icon: <Shield className="h-4 w-4" />,
    subtitle: "UAE FTA VAT return, output & input register",
  },
  audit: {
    label: "Audit & Control",
    icon: <BookOpen className="h-4 w-4" />,
    subtitle: "Journal audit, period close, user activity",
  },
  bank: {
    label: "Bank Management",
    icon: <Landmark className="h-4 w-4" />,
    subtitle: "Bank book, PDC, transfers, cheque register",
  },
  soa: {
    label: "Statements of Accounts",
    icon: <FileText className="h-4 w-4" />,
    subtitle: "Customer, vendor, employee & ledger statements",
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialReports({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [activeReport, setActiveReport] = useState<ReportId>("profit_loss");
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState<Record<ReportGroupId, boolean>>({
    pl: true,
    balance: true,
    cashflow: false,
    receivables: false,
    payables: false,
    vat: false,
    audit: false,
    bank: false,
    soa: false,
  });

  // Filters
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [dateTo, setDateTo] = useState("2026-01-31");
  const [branch, setBranch] = useState("All");
  const [accountSearch, setAccountSearch] = useState("");
  const [, setDataRevision] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchReport() {
      try {
        if (activeReport === "profit_loss" || activeReport === "gross_profit" || activeReport === "departmental_pl" || activeReport === "comparative_pl") {
          const data = await getProfitLoss(dateFrom, dateTo);
          if (data) { applyLiveReportData("profit_loss", data); setDataRevision(r => r + 1); }
        } else if (activeReport === "balance_sheet") {
          const data = await getBalanceSheet(dateTo || new Date().toISOString().split("T")[0]);
          if (data) { applyLiveReportData("balance_sheet", data); setDataRevision(r => r + 1); }
        } else if (activeReport === "trial_balance") {
          const data = await getTrialBalance(dateFrom, dateTo);
          if (data) { applyLiveReportData("trial_balance", data); setDataRevision(r => r + 1); }
        } else if (activeReport === "cash_flow_statement") {
          const data = await getCashFlow(dateFrom, dateTo);
          if (data) { applyLiveReportData("cash_flow_statement", data); setDataRevision(r => r + 1); }
        } else if (activeReport === "customer_aging") {
          const data = await getARAgingReport(dateTo);
          if (data) { applyLiveReportData("customer_aging", data); setDataRevision(r => r + 1); }
        } else if (activeReport === "vendor_aging") {
          const data = await getAPAgingReport(dateTo);
          if (data) { applyLiveReportData("vendor_aging", data); setDataRevision(r => r + 1); }
        } else if (activeReport === "vat_return_summary" || activeReport === "vat_output_register" || activeReport === "vat_input_register") {
          const [dashData, reconData] = await Promise.all([
            getTaxDashboard(dateFrom, dateTo),
            getTaxReconciliation(dateFrom, dateTo),
          ]);
          if (dashData) { mockVatDashboard = dashData; }
          if (reconData?.lines) {
            mockVatOutputLines = reconData.lines.filter((l: any) => l.type === "SALES");
            mockVatInputLines = reconData.lines.filter((l: any) => l.type === "PURCHASE");
          }
          if (dashData || reconData) setDataRevision(r => r + 1);
        }
      } catch (err) {
        console.error("Failed to load financial report:", err);
      }
    }
    fetchReport();
    return () => controller.abort();
  }, [activeReport, dateFrom, dateTo, branch, fetchKey]);

  const activeDef = useMemo(
    () => REPORTS.find((r) => r.id === activeReport)!,
    [activeReport]
  );

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
      pl: [],
      balance: [],
      cashflow: [],
      receivables: [],
      payables: [],
      vat: [],
      audit: [],
      bank: [],
      soa: [],
    };
    for (const r of filteredReports) byGroup[r.group].push(r);
    return byGroup;
  }, [filteredReports]);

  function renderResults() {
    switch (activeReport) {
      case "profit_loss":
        return <ProfitLossReport />;
      case "gross_profit":
        return <GrossProfitReport />;
      case "departmental_pl":
        return <DepartmentalPLReport />;
      case "comparative_pl":
        return <ComparativePLReport />;
      case "balance_sheet":
        return <BalanceSheetReport />;
      case "trial_balance":
        return <TrialBalanceReport />;
      case "cash_flow_statement":
        return <CashFlowReport />;
      case "bank_reconciliation":
        return <BankReconciliationReport />;
      case "petty_cash":
        return <PettyCashReport />;
      case "customer_aging":
        return <CustomerAgingReport />;
      case "collection_efficiency":
        return <CollectionEfficiencyReport />;
      case "credit_utilization":
        return <CreditUtilizationReport />;
      case "vendor_aging":
        return <VendorAgingReport />;
      case "payment_schedule":
        return <PaymentScheduleReport />;
      case "outstanding_payables":
        return <OutstandingPayablesReport />;
      case "vat_return_summary":
        return <VATReturnSummaryReport />;
      case "vat_output_register":
        return <VATOutputRegisterReport />;
      case "vat_input_register":
        return <VATInputRegisterReport />;
      case "journal_audit":
        return <JournalAuditReport />;
      case "period_close":
        return <PeriodCloseReport />;
      case "user_activity":
        return <UserActivityReport />;
      case "bank_book":
        return <BankBookReport />;
      case "pdc_received":
        return <PDCReceivedReport />;
      case "pdc_issued":
        return <PDCIssuedReport />;
      case "bank_transfer_log":
        return <BankTransferLogReport />;
      case "cheque_register":
        return <ChequeRegisterReport />;
      case "bank_charges_summary":
        return <BankChargesSummaryReport />;
      case "bank_position_summary":
        return <BankPositionSummaryReport />;
      case "soa_customer":
        return <SOACustomerReport />;
      case "soa_vendor":
        return <SOAVendorReport />;
      case "soa_employee":
        return <SOAEmployeeReport />;
      case "soa_ledger":
        return <SOALedgerReport />;
      case "soa_all_accounts":
        return <SOAAllAccountsReport />;
      case "soa_intercompany":
        return <SOAIntercompanyReport />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-slate-900 p-5">
      {/* Header / Breadcrumb */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <button
            onClick={() => onNavigate?.("home")}
            className="hover:text-slate-700 transition-colors"
          >
            BillBull
          </button>
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => onNavigate?.("financial-management")}
            className="hover:text-slate-700 transition-colors"
          >
            Financial Management
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-700">Reports</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-slate-600 flex items-center gap-1"
          >
            <FileText className="h-3 w-3" />
            PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-slate-600 flex items-center gap-1"
          >
            <FileSpreadsheet className="h-3 w-3" />
            Excel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-slate-600 flex items-center gap-1"
          >
            <Printer className="h-3 w-3" />
            Print
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_2.05fr] gap-4">
        {/* Left: Report Picker */}
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="py-3 px-3">
              <CardTitle className="text-xs font-semibold text-slate-800">
                Financial Reports
              </CardTitle>
              <span className="text-[10px] text-slate-500">
                P&L • Balance Sheet • Cash Flow • VAT • Audit
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

              {(Object.keys(GROUP_META) as ReportGroupId[]).map((gid) => (
                <div key={gid} className="rounded-lg border border-slate-200 bg-slate-50/60">
                  <button
                    className="w-full px-3 py-2 flex items-center justify-between text-left"
                    onClick={() =>
                      setGroupOpen((p) => ({ ...p, [gid]: !p[gid] }))
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{GROUP_META[gid].icon}</span>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-slate-800">
                          {GROUP_META[gid].label}
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
                  Start with <b>P&L</b> and <b>Balance Sheet</b> for the IFRS primary statements.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  File <b>VAT Return</b> to FTA by the 28th of the following month.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <span>
                  Review <b>Journal Audit</b> and <b>User Activity</b> monthly for internal controls.
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
          {/* Filters Card */}
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="py-3 px-3 flex flex-row items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <CardTitle className="text-xs font-semibold text-slate-800">
                  Filters
                </CardTitle>
                <span className="text-[10px] text-slate-500">
                  Applied to: <b>{activeDef.label}</b>
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-[11px] rounded-full border-[#F5C742]/70 bg-[#FFF6D8] flex items-center gap-1"
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

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Building className="h-3.5 w-3.5" />
                    Branch
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2"
                  >
                    <option>All</option>
                    <option>Main Branch</option>
                    <option>Downtown Branch</option>
                    <option>Marina Branch</option>
                    <option>DIFC Branch</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    Account / Cost Centre
                  </label>
                  <Input
                    placeholder="Search account or cost centre..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="h-8 text-[11px] bg-slate-50 border-slate-200"
                  />
                </div>

                <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4">
                  <Button className="h-8 px-6 text-[11px] bg-[#F5C742] hover:bg-[#e4b82e] text-slate-900" onClick={() => setFetchKey(k => k + 1)}>
                    Generate
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 text-[11px] text-slate-600 flex items-center gap-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Report Results */}
          <div key={activeReport}>
            {renderResults()}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
