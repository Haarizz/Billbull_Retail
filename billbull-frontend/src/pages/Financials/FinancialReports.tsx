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
import { getProfitLoss, getBalanceSheet, getTrialBalance, getCashFlow, getTaxDashboard, getTaxReconciliation, getARAgingReport, getAPAgingReport, getLedgerStatement } from "../../api/financialReportsBackendApi";
import { exportToExcel } from "../../utils/exportUtils";
import { generateReportA4Html, printHtml, downloadPdf } from "../../utils/printGenerator";
import { getCompanyProfile } from "../../api/companyProfileApi";
import { getBranches } from "../../api/branchApi";
import { getAccounts, getCostCenters } from "../../api/ledgerApi";
import ExportDropdown from "../../components/common/ExportDropdown";

// ─── Report data types ────────────────────────────────────────────────────────

interface PLSection { label: string; isRevenue?: boolean; rows: { name: string; cur: number; prior: number }[] }
interface BSSection { section: string; rows: { name: string; amount: number }[] }
interface TBRow { code: string; name: string; debit: number; credit: number }
interface CFData { ops: { name: string; amount: number }[]; inv: { name: string; amount: number }[]; fin: { name: string; amount: number }[]; totalOperating: number; totalInvesting: number; totalFinancing: number; netCashFlow: number; openingCash?: number; closingCash?: number }
interface AgingRow { customer?: string; vendor?: string; current: number; d30: number; d60: number; d90: number; d90plus: number; total: number }
interface VatDashboard { outputTax?: number; inputTax?: number; netTaxPayable?: number; taxableSalesBase?: number; taxablePurchaseBase?: number; trn?: string }
interface VatLine { documentNumber?: string; accountName?: string; baseAmount?: number; taxAmount?: number }
interface LedgerStatementRow { date: string; ref: string; narration: string; debit: number; credit: number; balance: number }

interface ReportStore {
  plSections: PLSection[] | null;
  bsAssets: BSSection[] | null;
  bsEqLiab: BSSection[] | null;
  tbRows: TBRow[] | null;
  cfData: CFData | null;
  customerAgingRows: AgingRow[] | null;
  vendorAgingRows: AgingRow[] | null;
  vatDashboard: VatDashboard | null;
  vatOutputLines: VatLine[] | null;
  vatInputLines: VatLine[] | null;
  ledgerRows: LedgerStatementRow[] | null;
  // display context passed from filter state
  period: string;
  branchLabel: string;
}

function buildReportStore(): ReportStore {
  return { plSections: null, bsAssets: null, bsEqLiab: null, tbRows: null, cfData: null, customerAgingRows: null, vendorAgingRows: null, vatDashboard: null, vatOutputLines: null, vatInputLines: null, ledgerRows: null, period: "", branchLabel: "All Branches" };
}

function parsePLData(data: any): PLSection[] | null {
  if (!data || (!data.revenueItems && !data.cogsItems && !data.operatingExpenseItems)) return null;
  const toRow = (r: any) => ({ name: r.accountName || r.category, cur: Number(r.amount || 0), prior: Number(r.priorAmount || 0) });
  return [
    { label: "Revenue", isRevenue: true, rows: (data.revenueItems || []).map(toRow) },
    { label: "Cost of Sales", rows: (data.cogsItems || []).map((r: any) => ({ ...toRow(r), cur: -Math.abs(Number(r.amount || 0)), prior: -Math.abs(Number(r.priorAmount || 0)) })) },
    { label: "Operating Expenses", rows: (data.operatingExpenseItems || data.expenseItems || []).map((r: any) => ({ ...toRow(r), cur: -Math.abs(Number(r.amount || 0)), prior: -Math.abs(Number(r.priorAmount || 0)) })) },
    { label: "Other Income", rows: (data.otherIncomeItems || []).map((r: any) => ({ ...toRow(r), cur: Math.abs(Number(r.amount || 0)), prior: Math.abs(Number(r.priorAmount || 0)) })) },
  ];
}

function parseBSData(data: any): { assets: BSSection[] | null; eqLiab: BSSection[] | null } {
  if (!data?.assetItems) return { assets: null, eqLiab: null };
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
  const assets = assetKeys.map(sec => ({ section: sec, rows: assetMap[sec] }));

  const liabMap = groupByCategory(data.liabilityItems || []);
  const LIAB_ORDER = ["Non-Current Liabilities", "Current Liabilities"];
  const liabKeys = LIAB_ORDER.filter(k => liabMap[k]).concat(Object.keys(liabMap).filter(k => !LIAB_ORDER.includes(k)));
  const equityRows = (data.equityItems || []).map((r: any) => ({ name: r.accountName || r.category, amount: Number(r.amount || 0) }));
  const eqLiab = [
    ...(equityRows.length > 0 ? [{ section: "Equity", rows: equityRows }] : []),
    ...liabKeys.map(sec => ({ section: sec, rows: liabMap[sec] })),
  ];
  return { assets, eqLiab };
}

function parseTBData(data: any): TBRow[] | null {
  const rows = data?.lines || data?.data;
  if (!rows) return null;
  return rows.map((r: any) => ({
    code: r.accountCode || r.code || "",
    name: r.accountName || r.name || "Unknown",
    debit: Number(r.debitBalance ?? r.debit ?? 0),
    credit: Number(r.creditBalance ?? r.credit ?? 0),
  }));
}

function parseCFData(data: any): CFData | null {
  if (!data || (data.operatingActivities === undefined && data.investingActivities === undefined)) return null;
  const toRows = (items: any[]) => (items || []).map((r: any) => ({ name: r.accountName || r.category, amount: Number(r.amount || 0) }));
  return {
    ops: toRows(data.operatingActivities),
    inv: toRows(data.investingActivities),
    fin: toRows(data.financingActivities),
    totalOperating: Number(data.totalOperating || 0),
    totalInvesting: Number(data.totalInvesting || 0),
    totalFinancing: Number(data.totalFinancing || 0),
    netCashFlow: Number(data.netCashFlow || 0),
    openingCash: data.openingCash != null ? Number(data.openingCash) : undefined,
    closingCash: data.closingCash != null ? Number(data.closingCash) : undefined,
  };
}

function parseAgingData(data: any, nameKey: "customer" | "vendor"): AgingRow[] | null {
  const arr: any[] = Array.isArray(data) ? data : (data ? Object.values(data) : []);
  if (!arr.length) return null;
  return arr.map((r: any) => ({
    [nameKey]: r.partnerName || r[`${nameKey}Name`] || "Unknown",
    current: Number(r.amount0to30 || 0),
    d30: Number(r.amount31to60 || 0),
    d60: Number(r.amount61to90 || 0),
    d90: Number(r.amount61to90 || 0),
    d90plus: Number(r.amount90Plus || r.amount90plus || 0),
    total: Number(r.total || 0),
  } as AgingRow));
}

function parseLedgerData(data: any): LedgerStatementRow[] | null {
  const lines = data?.lines || data?.entries || (Array.isArray(data) ? data : null);
  if (!lines || !lines.length) return null;
  let running = 0;
  return lines.map((r: any, i: number) => {
    const debit = Number(r.debitAmount ?? r.debit ?? 0);
    const credit = Number(r.creditAmount ?? r.credit ?? 0);
    if (i === 0 && r.balance != null) {
      running = Number(r.balance);
    } else {
      running = running + debit - credit;
    }
    return {
      date: r.transactionDate || r.date || "",
      ref: r.referenceNumber || r.ref || "",
      narration: r.description || r.narration || "",
      debit,
      credit,
      balance: r.balance != null ? Number(r.balance) : running,
    };
  });
}


// ─── Export helpers ───────────────────────────────────────────────────────────

function flattenSections(sections: PLSection[] | null): any[] {
  if (!sections) return [];
  const rows: any[] = [];
  for (const sec of sections) {
    rows.push({ account: `— ${sec.label} —`, amount: "", prior: "" });
    for (const row of sec.rows || []) {
      rows.push({ account: row.name, amount: row.cur, prior: row.prior });
    }
  }
  return rows;
}

function flattenBalanceSheet(sections: BSSection[] | null): any[] {
  if (!sections) return [];
  const rows: any[] = [];
  for (const sec of sections) {
    rows.push({ account: `— ${sec.section} —`, amount: "" });
    for (const row of sec.rows || []) {
      rows.push({ account: row.name, amount: row.amount ?? "" });
    }
  }
  return rows;
}

function getFinancialExportData(reportId: ReportId, store: ReportStore): { title: string; cols: any[]; rows: any[] } {
  switch (reportId) {
    case "profit_loss":
    case "gross_profit":
    case "departmental_pl":
    case "comparative_pl": {
      return {
        title: "Statement of Profit or Loss",
        cols: [
          { header: "Account", key: "account", width: 40 },
          { header: "Current Period (AED)", key: "amount", width: 22 },
          { header: "Prior Period (AED)", key: "prior", width: 22 },
        ],
        rows: flattenSections(store.plSections),
      };
    }
    case "balance_sheet": {
      return {
        title: "Statement of Financial Position",
        cols: [
          { header: "Account", key: "account", width: 40 },
          { header: "Amount (AED)", key: "amount", width: 22 },
        ],
        rows: [...flattenBalanceSheet(store.bsAssets), ...flattenBalanceSheet(store.bsEqLiab)],
      };
    }
    case "trial_balance": {
      return {
        title: "Trial Balance",
        cols: [
          { header: "Code", key: "code", width: 14 },
          { header: "Account Name", key: "name", width: 38 },
          { header: "Debit (AED)", key: "debit", width: 20 },
          { header: "Credit (AED)", key: "credit", width: 20 },
        ],
        rows: store.tbRows || [],
      };
    }
    case "cash_flow_statement": {
      const d = store.cfData;
      const rows: any[] = [];
      if (d) {
        rows.push({ activity: "— Operating Activities —", amount: "" });
        (d.ops || []).forEach((r) => rows.push({ activity: r.name, amount: r.amount }));
        rows.push({ activity: "Net Operating", amount: d.totalOperating });
        rows.push({ activity: "— Investing Activities —", amount: "" });
        (d.inv || []).forEach((r) => rows.push({ activity: r.name, amount: r.amount }));
        rows.push({ activity: "Net Investing", amount: d.totalInvesting });
        rows.push({ activity: "— Financing Activities —", amount: "" });
        (d.fin || []).forEach((r) => rows.push({ activity: r.name, amount: r.amount }));
        rows.push({ activity: "Net Financing", amount: d.totalFinancing });
        rows.push({ activity: "Net Cash Flow", amount: d.netCashFlow });
      }
      return {
        title: "Statement of Cash Flows",
        cols: [
          { header: "Activity", key: "activity", width: 42 },
          { header: "Amount (AED)", key: "amount", width: 22 },
        ],
        rows,
      };
    }
    case "customer_aging": {
      return {
        title: "Customer Aging Report",
        cols: [
          { header: "Customer", key: "customer", width: 30 },
          { header: "Current", key: "current", width: 16 },
          { header: "1-30 Days", key: "d30", width: 16 },
          { header: "31-60 Days", key: "d60", width: 16 },
          { header: "61-90 Days", key: "d90", width: 16 },
          { header: "90+ Days", key: "d90plus", width: 16 },
          { header: "Total (AED)", key: "total", width: 18 },
        ],
        rows: store.customerAgingRows || [],
      };
    }
    case "vendor_aging": {
      return {
        title: "Vendor Aging Report",
        cols: [
          { header: "Vendor", key: "vendor", width: 30 },
          { header: "Current", key: "current", width: 16 },
          { header: "1-30 Days", key: "d30", width: 16 },
          { header: "31-60 Days", key: "d60", width: 16 },
          { header: "61-90 Days", key: "d90", width: 16 },
          { header: "90+ Days", key: "d90plus", width: 16 },
          { header: "Total (AED)", key: "total", width: 18 },
        ],
        rows: store.vendorAgingRows || [],
      };
    }
    case "vat_return_summary":
    case "vat_output_register": {
      return {
        title: "VAT Output Register",
        cols: [
          { header: "Invoice No", key: "invoiceNo", width: 18 },
          { header: "Date", key: "date", width: 14 },
          { header: "Customer", key: "customer", width: 26 },
          { header: "Taxable (AED)", key: "taxableAmt", width: 18 },
          { header: "VAT Rate", key: "vatRate", width: 12 },
          { header: "VAT (AED)", key: "vatAmt", width: 16 },
          { header: "Total (AED)", key: "totalAmt", width: 16 },
        ],
        rows: store.vatOutputLines || [],
      };
    }
    case "vat_input_register": {
      return {
        title: "VAT Input Register",
        cols: [
          { header: "Invoice No", key: "invoiceNo", width: 18 },
          { header: "Date", key: "date", width: 14 },
          { header: "Vendor", key: "vendor", width: 26 },
          { header: "Taxable (AED)", key: "taxableAmt", width: 18 },
          { header: "VAT Rate", key: "vatRate", width: 12 },
          { header: "VAT (AED)", key: "vatAmt", width: 16 },
          { header: "Total (AED)", key: "totalAmt", width: 16 },
        ],
        rows: store.vatInputLines || [],
      };
    }
    default:
      return { title: "Financial Report", cols: [], rows: [] };
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
      <table className="bb-nowrap-table w-full text-[11px] border-collapse">{children}</table>
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

function ProfitLossReport({ store }: { store: ReportStore }) {
  const sections: PLSection[] = store.plSections || [];

  const revSection = sections.find((s: any) => s.isRevenue) ?? { rows: [] };
  const totalRevCur = revSection.rows.reduce((s: number, r: any) => s + r.cur, 0);
  const totalRevPrior = revSection.rows.reduce((s: number, r: any) => s + r.prior, 0);
  const costSections = sections.filter((s: any) => !s.isRevenue);
  const totalCostsCur = costSections.flatMap((s: any) => s.rows).reduce((a: number, r: any) => a + r.cur, 0);
  const totalCostsPrior = costSections.flatMap((s: any) => s.rows).reduce((a: number, r: any) => a + r.prior, 0);
  const netCur = totalRevCur + totalCostsCur;
  const netPrior = totalRevPrior + totalCostsPrior;

  const cogsSec = sections.find((s) => s.label === "Cost of Sales") ?? { rows: [] };
  const chartData = [
    { label: "Revenue", value: totalRevCur },
    { label: "Gross Profit", value: totalRevCur + cogsSec.rows.reduce((a: number, r) => a + r.cur, 0) },
    { label: "Net Profit", value: netCur },
  ];

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Statement of Profit or Loss (P&L)"
          subtitle="IFRS-compliant income statement"
          period={store.period}
          branch={store.branchLabel}
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
                  <span className={netCur >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {netPrior !== 0 ? `${(((netCur - netPrior) / Math.abs(netPrior)) * 100).toFixed(1)}%` : "—"}
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

function GrossProfitReport({ store }: { store: ReportStore }) {
  // Derive gross profit rows from P&L sections data
  const sections = store.plSections || [];
  const revSec = sections.find((s) => s.isRevenue) ?? { rows: [] };
  const cogsSec = sections.find((s) => s.label === "Cost of Sales") ?? { rows: [] };
  const rows = revSec.rows.map((rev) => {
    const cogs = cogsSec.rows.find((c) => c.name === rev.name);
    const revenue = rev.cur;
    const cogsAmt = Math.abs(cogs?.cur ?? 0);
    const gp = revenue - cogsAmt;
    const gpPct = revenue !== 0 ? (gp / revenue) * 100 : 0;
    return { category: rev.name, revenue, cogs: cogsAmt, gp, gpPct };
  });
  const totRev = rows.reduce((a, r) => a + r.revenue, 0);
  const totGP = rows.reduce((a, r) => a + r.gp, 0);
  const totGPPct = totRev !== 0 ? ((totGP / totRev) * 100).toFixed(1) : "—";

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Gross Profit Analysis"
          subtitle="Revenue vs cost of sales with GP% by category"
          period={store.period}
          branch={store.branchLabel}
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
                <Td right bold>{totGPPct === "—" ? "—" : `${totGPPct}%`}</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentalPLReport({ store }: { store: ReportStore }) {
  // Flatten P&L sections into line items for comparative view by section
  const sections = store.plSections || [];
  const rows = sections.map((s) => {
    const revenue = s.isRevenue ? s.rows.reduce((a, r) => a + r.cur, 0) : 0;
    const expenses = !s.isRevenue ? Math.abs(s.rows.reduce((a, r) => a + r.cur, 0)) : 0;
    const profit = revenue - expenses;
    return { dept: s.label, revenue, expenses, profit };
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Departmental P&L"
          subtitle="Profit & Loss split by cost centre / department"
          period={store.period}
          branch={store.branchLabel}
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

function ComparativePLReport({ store }: { store: ReportStore }) {
  // Build comparative rows from P&L sections: current vs prior (budget not available from backend)
  const sections = store.plSections || [];
  const rows = sections.flatMap((s) =>
    s.rows.map((r) => ({ line: r.name, cur: r.cur, prior: r.prior, budget: 0 }))
  );
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Comparative P&L"
          subtitle="Current period vs prior period"
          period={store.period}
          branch={store.branchLabel}
        />
        <Tbl>
          <thead>
            <tr>
              <Th>Line Item</Th>
              <Th right>Current (AED)</Th>
              <Th right>Prior (AED)</Th>
              <Th right>vs Prior %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vsPrior =
                r.prior !== 0
                  ? (((r.cur - r.prior) / Math.abs(r.prior)) * 100).toFixed(1)
                  : "—";
              return (
                <tr key={r.line}>
                  <Td>{r.line}</Td>
                  <Td right bold>{aed(r.cur)}</Td>
                  <Td right>{aed(r.prior)}</Td>
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

function BalanceSheetReport({ store }: { store: ReportStore }) {
  const assets: BSSection[] = store.bsAssets || [];
  const eqLiab: BSSection[] = store.bsEqLiab || [];
  const totalAssets = assets.flatMap((s) => s.rows).reduce((a, r) => a + r.amount, 0);
  const totalEqLiab = eqLiab.flatMap((s) => s.rows).reduce((a, r) => a + r.amount, 0);

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Statement of Financial Position"
          subtitle="Balance Sheet as at period end — IFRS compliant"
          period={store.period}
          branch={store.branchLabel}
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

function TrialBalanceReport({ store }: { store: ReportStore }) {
  const rows: TBRow[] = store.tbRows || [];
  const totDebit = rows.reduce((a, r) => a + r.debit, 0);
  const totCredit = rows.reduce((a, r) => a + r.credit, 0);

  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Trial Balance"
          subtitle="All account balances — must balance"
          period={store.period}
          branch={store.branchLabel}
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

function CashFlowReport({ store }: { store: ReportStore }) {
  const live = store.cfData;
  const ops = live?.ops ?? [];
  const inv = live?.inv ?? [];
  const fin = live?.fin ?? [];
  const totOps: number = live?.totalOperating ?? 0;
  const totInv: number = live?.totalInvesting ?? 0;
  const totFin: number = live?.totalFinancing ?? 0;
  const netChange: number = live?.netCashFlow ?? 0;

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
          period={store.period}
          branch={store.branchLabel}
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
                <Td right>{live?.openingCash != null ? aed(live.openingCash) : "—"}</Td>
              </tr>
              <tr className="bg-slate-50">
                <Td bold>Cash at End of Period</Td>
                <Td right bold>{live?.closingCash != null ? aed(live.closingCash) : "—"}</Td>
              </tr>
            </tbody>
          </Tbl>
        </div>
      </CardContent>
    </Card>
  );
}

function BankReconciliationReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Bank Reconciliation"
          subtitle="Book balance vs bank statement — Emirates NBD"
          period={store.period}
          branch={store.branchLabel}
        />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Book Balance", value: "—" },
            { label: "Bank Statement Balance", value: "—" },
            { label: "Difference", value: "—" },
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

function PettyCashReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
  let running = 0;
  const withBalance = rows.map((r) => { running += r.amount; return { ...r, balance: running }; });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Petty Cash Statement"
          subtitle="Imprest fund movements"
          period={store.period}
          branch={store.branchLabel}
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
              <Td right bold>{withBalance.length > 0 ? aed(withBalance[withBalance.length - 1].balance) : aed(0)}</Td>
            </tr>
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

function CustomerAgingReport({ store }: { store: ReportStore }) {
  const rows: AgingRow[] = store.customerAgingRows || [];
  const tot = (key: keyof AgingRow) => rows.reduce((a, r) => a + (r[key] as number), 0);
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
          period={store.period}
          branch={store.branchLabel}
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

function CollectionEfficiencyReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Collection Efficiency Report"
          subtitle="DSO and collection rate by customer"
          period={store.period}
          branch={store.branchLabel}
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

function CreditUtilizationReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
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

function VendorAgingReport({ store }: { store: ReportStore }) {
  const rows: AgingRow[] = store.vendorAgingRows || [];
  const tot = (key: keyof AgingRow) => rows.reduce((a, r) => a + (r[key] as number), 0);
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

function PaymentScheduleReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Payment Schedule"
          subtitle="Upcoming vendor payments with method and status"
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
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

function OutstandingPayablesReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Outstanding Payables"
          subtitle="All unpaid and partially paid vendor invoices"
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
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

function VATReturnSummaryReport({ store, companyProfile }: { store: ReportStore; companyProfile: any }) {
  const vd = store.vatDashboard;
  const outputTax = vd ? Number(vd.outputTax || 0) : 0;
  const inputTax = vd ? Number(vd.inputTax || 0) : 0;
  const netPayable = vd ? Number(vd.netTaxPayable || 0) : 0;
  const salesBase = vd ? Number(vd.taxableSalesBase || 0) : 0;
  const purchaseBase = vd ? Number(vd.taxablePurchaseBase || 0) : 0;
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
          period={store.period || "Selected Period"}
          branch={store.branchLabel || "All Branches"}
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
          UAE VAT rate: 5% | TRN: {companyProfile?.trn || "—"} | Filing deadline: 28 days after period end
        </p>
      </CardContent>
    </Card>
  );
}

function VATOutputRegisterReport({ store }: { store: ReportStore }) {
  const liveRows = store.vatOutputLines;
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
    : [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Output Tax Register"
          subtitle="All taxable supplies with output VAT detail"
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
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

function VATInputRegisterReport({ store }: { store: ReportStore }) {
  const liveRows = store.vatInputLines;
  const rows = liveRows?.length
    ? liveRows.map((l: any) => ({
        date: "—",
        inv: l.documentNumber || "—",
        vendor: l.accountName || "—",
        taxable: Number(l.baseAmount || 0),
        vat: Number(l.taxAmount || 0),
        recoverable: Number(l.taxAmount || 0),
      }))
    : [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Input Tax Register"
          subtitle="Eligible input VAT for recovery — purchases & expenses"
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
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

function JournalAuditReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Journal Audit Log"
          subtitle="All manual journal entries with user, reason and approver"
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
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

function PeriodCloseReport({ store }: { store: ReportStore }) {
  const tasks: any[] = [];
  const done = tasks.filter((t) => t.status === "Done").length;
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader
          title="Period Close Checklist"
          subtitle="Month-end close tasks and sign-off status"
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
        />
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: tasks.length ? `${(done / tasks.length) * 100}%` : "0%" }}
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

function UserActivityReport({ store }: { store: ReportStore }) {
  const rows: any[] = [];
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
          period={store.period || "—"}
          branch={store.branchLabel || "All Branches"}
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

const BANK_ACCOUNTS: string[] = [];

let mockBankBook: any[] = [];

function BankBookReport({ store }: { store: ReportStore }) {
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
        <ReportHeader title="Bank Book" subtitle="Transaction ledger with running balance" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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
            { label: "Opening Balance", val: aed(mockBankBook.find(r => r.type === "Balance B/F")?.balance ?? 0), color: "text-slate-700" },
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

let mockPDCReceived: any[] = [];

function PDCReceivedReport({ store }: { store: ReportStore }) {
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
        <ReportHeader title="PDC Received" subtitle="Post-dated cheques received from customers" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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

let mockPDCIssued: any[] = [];

function PDCIssuedReport({ store }: { store: ReportStore }) {
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
        <ReportHeader title="PDC Issued" subtitle="Post-dated cheques issued to vendors" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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

let mockTransfers: any[] = [];

function BankTransferLogReport({ store }: { store: ReportStore }) {
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
        <ReportHeader title="Bank Transfer Log" subtitle="Inter-bank & intra-company fund transfers" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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

let mockCheques: any[] = [];

function ChequeRegisterReport({ store }: { store: ReportStore }) {
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
        <ReportHeader title="Cheque Register" subtitle="All cheques issued with clearance status" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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

let mockCharges: any[] = [];

function BankChargesSummaryReport({ store }: { store: ReportStore }) {
  const total = mockCharges.reduce((s, r) => s + r.amount, 0);
  const totalVat = mockCharges.reduce((s, r) => s + r.vatAmt, 0);
  const byAccount = BANK_ACCOUNTS.map(a => ({
    label: a.split(" – ")[0],
    value: mockCharges.filter(c => c.account === a).reduce((s, c) => s + c.amount, 0),
  }));
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Bank Charges Summary" subtitle="Fees, commissions and interest by account" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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

let mockBankPositions: any[] = [];

function BankPositionSummaryReport({ store }: { store: ReportStore }) {
  const totalOpening = mockBankPositions.reduce((s, r) => s + r.opening, 0);
  const totalClosing = mockBankPositions.reduce((s, r) => s + r.closing, 0);
  const totalReceipts = mockBankPositions.reduce((s, r) => s + r.receipts, 0);
  const totalPayments = mockBankPositions.reduce((s, r) => s + r.payments, 0);
  const chartData = mockBankPositions.map(r => ({ label: r.bank.split(" – ")[0], value: r.closing }));
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="pt-4 px-4 pb-4">
        <ReportHeader title="Bank Position Summary" subtitle="Consolidated balances across all accounts" period={store.period || "—"} branch={store.branchLabel || "All Branches"} />
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

let SOA_CUSTOMERS: any[] = [];

let mockCustomerSOA: Record<string, any[]> = {};

function SOACustomerReport({ store }: { store: ReportStore }) {
  const firstId = SOA_CUSTOMERS[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(firstId);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const customer = SOA_CUSTOMERS.find(c => c.id === selectedId) ?? null;
  const filtered = SOA_CUSTOMERS.filter(c =>
    `${c.name} ${c.ref} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows = mockCustomerSOA[selectedId] ?? [];
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

  const agingRow = store.customerAgingRows?.find(r => r.customer === customer?.name) ?? null;
  const aging = agingRow
    ? [
        { bucket: "Current", amount: agingRow.current },
        { bucket: "1–30 days", amount: agingRow.d30 },
        { bucket: "31–60 days", amount: agingRow.d60 },
        { bucket: "61–90 days", amount: agingRow.d90 },
        { bucket: "90+ days", amount: agingRow.d90plus },
      ]
    : [];

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
            {selectedId && !open && customer && (
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
        {customer ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Customer</p><p className="font-semibold text-slate-800">{customer.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Ref / Code</p><p className="font-mono text-slate-700">{customer.ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Credit Limit</p><p className="font-semibold text-slate-800">{aed(customer.creditLimit ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Payment Terms</p><p className="font-semibold text-slate-700">{customer.terms}</p></div>
          <div><p className="text-slate-400 mb-0.5">Phone</p><p className="text-slate-700">{customer.phone}</p></div>
          <div><p className="text-slate-400 mb-0.5">Email</p><p className="text-slate-700">{customer.email}</p></div>
          <div><p className="text-slate-400 mb-0.5">Opening Balance</p><p className="font-semibold text-slate-800">{aed(rows[0]?.balance ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Closing Balance</p><p className={`font-bold text-sm ${closingBalance > 0 ? "text-red-600" : "text-emerald-700"}`}>{aed(closingBalance)}</p></div>
        </div>
        ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 text-[11px] text-slate-400 text-center">Select a customer above</div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total Invoiced", val: aed(totalDebit), color: "text-blue-700" },
            { label: "Total Received", val: aed(totalCredit), color: "text-emerald-700" },
            { label: "Balance Due", val: aed(closingBalance), color: closingBalance > 0 ? "text-red-600" : "text-emerald-700" },
            { label: "Credit Utilised", val: customer?.creditLimit ? `${Math.round((closingBalance / customer.creditLimit) * 100)}%` : "—", color: "text-amber-700" },
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

let SOA_VENDORS: any[] = [];
let mockVendorSOA: Record<string, any[]> = {};

function SOAVendorReport({ store: _store }: { store: ReportStore }) {
  const firstVId = SOA_VENDORS[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(firstVId);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const vendor = SOA_VENDORS.find(v => v.id === selectedId) ?? null;
  const filtered = SOA_VENDORS.filter(v =>
    `${v.name} ${v.ref} ${v.email}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows = mockVendorSOA[selectedId] ?? [];
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
            {selectedId && !open && vendor && (
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

        {vendor ? (
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
        ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 text-[11px] text-slate-400 text-center">Select a vendor above</div>
        )}

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

let SOA_EMPLOYEES: any[] = [];
type EmpRow = { date: string; ref: string; type: string; narration: string; earning: number; deduction: number; balance: number };
let mockEmployeeSOA: Record<string, EmpRow[]> = {};

function SOAEmployeeReport({ store: _store }: { store: ReportStore }) {
  const firstEId = SOA_EMPLOYEES[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(firstEId);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const emp = SOA_EMPLOYEES.find(e => e.id === selectedId) ?? null;
  const filtered = SOA_EMPLOYEES.filter(e =>
    `${e.name} ${e.ref} ${e.dept} ${e.position}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows = mockEmployeeSOA[selectedId] ?? [];
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
            {selectedId && !open && emp && (
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
        {emp ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Employee</p><p className="font-semibold text-slate-800">{emp.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Employee Ref</p><p className="font-mono text-slate-700">{emp.ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Department</p><p className="text-slate-700">{emp.dept}</p></div>
          <div><p className="text-slate-400 mb-0.5">Position</p><p className="text-slate-700">{emp.position}</p></div>
          <div><p className="text-slate-400 mb-0.5">Basic Salary</p><p className="font-semibold text-slate-800">{aed(emp.salary ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Total Earnings</p><p className="font-semibold text-emerald-700">{aed(totalEarnings)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Total Deductions</p><p className="font-semibold text-red-600">{aed(totalDeductions)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Net Payable</p><p className={`font-bold text-sm ${netPayable > 0 ? "text-[#b58900]" : "text-emerald-700"}`}>{aed(netPayable)}</p></div>
        </div>
        ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 text-[11px] text-slate-400 text-center">Select an employee above</div>
        )}

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

let GL_ACCOUNTS: any[] = [];

type LedgerRow = { date: string; ref: string; narration: string; debit: number; credit: number; balance: number };

function SOALedgerReport({ store }: { store: ReportStore }) {
  const firstGlCode = GL_ACCOUNTS[0]?.code ?? "";
  const [selectedCode, setSelectedCode] = useState(firstGlCode);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const account = GL_ACCOUNTS.find(a => a.code === selectedCode) ?? null;
  const filtered = GL_ACCOUNTS.filter(a =>
    `${a.code} ${a.name} ${a.type}`.toLowerCase().includes(search.toLowerCase())
  );
  const rows: LedgerRow[] = (store.ledgerRows as LedgerRow[] | null) ?? [];
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
            {selectedCode && !open && account && (
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
                return (
                  <button key={a.code} onClick={() => { setSelectedCode(a.code); setSearch(""); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 ${selectedCode === a.code ? "bg-[#FFF6D8]" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-700 w-10 shrink-0">{a.code}</span>
                      <span className="text-[11px] text-slate-800">{a.name}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${typeColors[a.type]}`}>{a.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Account info */}
        {account ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 flex flex-wrap gap-6 text-[10px]">
          <div><p className="text-slate-400 mb-0.5">Account Name</p><p className="font-semibold text-slate-800">{account.name}</p></div>
          <div><p className="text-slate-400 mb-0.5">Account Code</p><p className="font-mono text-slate-700">{account.code}</p></div>
          <div><p className="text-slate-400 mb-0.5">Account Type</p>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${typeColors[account.type] ?? ""}`}>{account.type}</span>
          </div>
          <div><p className="text-slate-400 mb-0.5">Opening Balance</p><p className="font-semibold text-slate-800">{aed(rows[0]?.balance ?? 0)}</p></div>
          <div><p className="text-slate-400 mb-0.5">Closing Balance</p><p className="font-bold text-[#b58900]">{aed(closingBalance)}</p></div>
        </div>
        ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 text-[11px] text-slate-400 text-center">Select a GL account above</div>
        )}

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

let ALL_ACCOUNTS_DATA: any[] = [];

function SOAAllAccountsReport({ store: _store }: { store: ReportStore }) {
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

const IC_ENTITIES: string[] = [];
let mockIntercompany: any[] = [];

function SOAIntercompanyReport({ store: _store }: { store: ReportStore }) {
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

  // Filters — default to current year start → today
  const today = new Date().toISOString().split("T")[0];
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [dateFrom, setDateFrom] = useState(yearStart);
  const [dateTo, setDateTo] = useState(today);
  const [branch, setBranch] = useState("All");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("All");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // advancedFilterMode: "account" = GL account picker (soa_ledger), "costcentre" = cost centre picker (P&L group), null = hidden
  const advancedFilterMode: "account" | "costcentre" | null = (() => {
    if (activeReport === "soa_ledger") return "account";
    if (activeReport === "profit_loss" || activeReport === "gross_profit" || activeReport === "departmental_pl" || activeReport === "comparative_pl") return "costcentre";
    return null;
  })();
  const [store, setStore] = useState<ReportStore>(buildReportStore());
  const [fetchKey, setFetchKey] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [glAccountOptions, setGlAccountOptions] = useState<{ value: string; label: string }[]>([]);
  const [costCentreOptions, setCostCentreOptions] = useState<{ value: string; label: string }[]>([]);
  // Combined for backward compatibility with appliedFilters label lookup
  const accountOptions = advancedFilterMode === "costcentre" ? costCentreOptions : glAccountOptions;

  useEffect(() => {
    getCompanyProfile().then((res) => setCompanyProfile(res.data)).catch(() => {});
    getBranches()
      .then((data: any[]) => setBranches(data.filter((b: any) => b.isActive !== false)))
      .catch(() => {});
    Promise.all([getAccounts(), getCostCenters()])
      .then(([accs, ccs]: [any[], any[]]) => {
        const accOpts = (accs || [])
          .filter((a: any) => !a.archived && !a.isGroup)
          .map((a: any) => ({ value: a.code, label: `${a.code} – ${a.name}` }));
        const ccOpts = (ccs || [])
          .filter((c: any) => c.status !== "archived")
          .map((c: any) => ({ value: c.code, label: `${c.code} – ${c.name}` }));
        setGlAccountOptions(accOpts);
        setCostCentreOptions(ccOpts);
      })
      .catch(() => {});
  }, []);

  // When the selected report changes, trigger a fresh fetch automatically.
  // Filter changes (date/branch/account) require pressing Generate to avoid
  // firing a request on every keystroke.
  useEffect(() => {
    setFetchKey(k => k + 1);
  }, [activeReport]);

  useEffect(() => {
    if (fetchKey === 0) return; // skip double-fire on mount before activeReport effect runs
    const controller = new AbortController();
    const periodLabel = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : dateTo || dateFrom || "";
    const branchLabel = branch === "All" ? "All Branches" : branches.find((b) => String(b.id) === String(branch))?.name || branch;

    async function fetchReport() {
      setFetching(true);
      setFetchError(null);
      try {
        const branchParam = branch !== "All" ? branch : undefined;
        if (activeReport === "profit_loss" || activeReport === "gross_profit" || activeReport === "departmental_pl" || activeReport === "comparative_pl") {
          const costCenterParam = selectedAccount !== "All" ? selectedAccount : undefined;
          const data = await getProfitLoss(dateFrom, dateTo, branchParam, costCenterParam);
          if (data) setStore(prev => ({ ...prev, plSections: parsePLData(data), period: periodLabel, branchLabel }));
        } else if (activeReport === "balance_sheet") {
          const data = await getBalanceSheet(dateTo || new Date().toISOString().split("T")[0], branchParam);
          if (data) {
            const { assets, eqLiab } = parseBSData(data);
            setStore(prev => ({ ...prev, bsAssets: assets, bsEqLiab: eqLiab, period: periodLabel, branchLabel }));
          }
        } else if (activeReport === "trial_balance") {
          const data = await getTrialBalance(dateFrom, dateTo, branchParam);
          if (data) setStore(prev => ({ ...prev, tbRows: parseTBData(data), period: periodLabel, branchLabel }));
        } else if (activeReport === "cash_flow_statement") {
          const data = await getCashFlow(dateFrom, dateTo, branchParam);
          if (data) setStore(prev => ({ ...prev, cfData: parseCFData(data), period: periodLabel, branchLabel }));
        } else if (activeReport === "customer_aging" || activeReport === "collection_efficiency" || activeReport === "credit_utilization") {
          const data = await getARAgingReport(dateTo);
          if (data) setStore(prev => ({ ...prev, customerAgingRows: parseAgingData(data, "customer"), period: periodLabel, branchLabel }));
        } else if (activeReport === "vendor_aging") {
          const data = await getAPAgingReport(dateTo);
          if (data) setStore(prev => ({ ...prev, vendorAgingRows: parseAgingData(data, "vendor"), period: periodLabel, branchLabel }));
        } else if (activeReport === "vat_return_summary" || activeReport === "vat_output_register" || activeReport === "vat_input_register") {
          const [dashData, reconData] = await Promise.all([
            getTaxDashboard(dateFrom, dateTo, branchParam),
            getTaxReconciliation(dateFrom, dateTo, branchParam),
          ]);
          setStore(prev => ({
            ...prev,
            vatDashboard: dashData ?? prev.vatDashboard,
            vatOutputLines: reconData?.lines ? reconData.lines.filter((l: any) => l.type === "SALES") : prev.vatOutputLines,
            vatInputLines: reconData?.lines ? reconData.lines.filter((l: any) => l.type === "PURCHASE") : prev.vatInputLines,
            period: periodLabel,
            branchLabel,
          }));
        } else if (activeReport === "soa_ledger") {
          if (selectedAccount && selectedAccount !== "All") {
            const data = await getLedgerStatement(selectedAccount, dateFrom, dateTo);
            if (data) setStore(prev => ({ ...prev, ledgerRows: parseLedgerData(data), period: periodLabel, branchLabel }));
          } else {
            setStore(prev => ({ ...prev, ledgerRows: null, period: periodLabel, branchLabel }));
          }
        } else {
          setStore(prev => ({ ...prev, period: periodLabel, branchLabel }));
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setFetchError("Access denied. Your account does not have permission to view financial reports.");
        } else if (status === 500) {
          setFetchError("Server error while generating report. Check backend logs.");
        } else {
          setFetchError("Could not connect to server. Make sure the backend is running.");
        }
        console.error("Failed to load financial report:", err);
      } finally {
        if (!controller.signal.aborted) setFetching(false);
      }
    }
    fetchReport();
    return () => controller.abort();
  }, [fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeDef = useMemo(
    () => REPORTS.find((r) => r.id === activeReport)!,
    [activeReport]
  );

  function appliedFilters() {
    return [
      { label: "Date From", value: dateFrom },
      { label: "Date To", value: dateTo },
      { label: "Branch", value: branch === "All" ? "All" : branches.find((b: any) => String(b.id) === String(branch))?.name || branch },
      { label: "Account", value: selectedAccount !== "All" ? accountOptions.find((a: any) => a.value === selectedAccount)?.label || selectedAccount : "All" }
    ].filter((f) => f.value && f.value !== "All");
  }

  const exportMeta = () => ({
    reportTitle: activeDef.label,
    dateFrom,
    dateTo,
    branch: branch === "All" ? "All" : branches.find((b: any) => String(b.id) === String(branch))?.name || branch,
    filters: appliedFilters(),
    companyProfile
  });

  function getActiveViewModel() {
    const { title, cols, rows } = getFinancialExportData(activeReport, store);
    const columns = cols.map((c: any) => ({
      ...c,
      align: c.align || (rows.length && typeof rows[0][c.key] === "number" ? "right" : "left")
    }));
    return {
      reportTitle: title,
      sections: [{ columns, rows }]
    };
  }

  function fileBase() {
    const { title } = getFinancialExportData(activeReport, store);
    return title.replace(/\s+/g, "_");
  }

  async function handleExportPdf() {
    const vm = getActiveViewModel();
    const html = generateReportA4Html(vm, companyProfile || {}, exportMeta());
    const company = companyProfile?.companyName || companyProfile?.name || "BillBull ERP";
    await downloadPdf(html, fileBase(), `Generated by ${company}  |  ${new Date().toLocaleString()}  |  Confidential`);
  }

  function handleExportExcel() {
    const { title, cols, rows } = getFinancialExportData(activeReport, store);
    exportToExcel(rows, cols, title.replace(/\s+/g, "_"), exportMeta());
  }

  function handlePrint() {
    const vm = getActiveViewModel();
    const html = generateReportA4Html(vm, companyProfile || {}, exportMeta());
    printHtml(html);
  }

  function handleDownloadCsv() {
    const { cols, rows } = getFinancialExportData(activeReport, store);
    if (!rows.length) return;
    const keys = cols.map((c: any) => c.key);
    const headers = cols.map((c: any) => c.header);
    const csv = [headers.join(","), ...rows.map((r: any) => keys.map((k: string) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${fileBase()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

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
        return <ProfitLossReport store={store} />;
      case "gross_profit":
        return <GrossProfitReport store={store} />;
      case "departmental_pl":
        return <DepartmentalPLReport store={store} />;
      case "comparative_pl":
        return <ComparativePLReport store={store} />;
      case "balance_sheet":
        return <BalanceSheetReport store={store} />;
      case "trial_balance":
        return <TrialBalanceReport store={store} />;
      case "cash_flow_statement":
        return <CashFlowReport store={store} />;
      case "bank_reconciliation":
        return <BankReconciliationReport store={store} />;
      case "petty_cash":
        return <PettyCashReport store={store} />;
      case "customer_aging":
        return <CustomerAgingReport store={store} />;
      case "collection_efficiency":
        return <CollectionEfficiencyReport store={store} />;
      case "credit_utilization":
        return <CreditUtilizationReport store={store} />;
      case "vendor_aging":
        return <VendorAgingReport store={store} />;
      case "payment_schedule":
        return <PaymentScheduleReport store={store} />;
      case "outstanding_payables":
        return <OutstandingPayablesReport store={store} />;
      case "vat_return_summary":
        return <VATReturnSummaryReport store={store} companyProfile={companyProfile} />;
      case "vat_output_register":
        return <VATOutputRegisterReport store={store} />;
      case "vat_input_register":
        return <VATInputRegisterReport store={store} />;
      case "journal_audit":
        return <JournalAuditReport store={store} />;
      case "period_close":
        return <PeriodCloseReport store={store} />;
      case "user_activity":
        return <UserActivityReport store={store} />;
      case "bank_book":
        return <BankBookReport store={store} />;
      case "pdc_received":
        return <PDCReceivedReport store={store} />;
      case "pdc_issued":
        return <PDCIssuedReport store={store} />;
      case "bank_transfer_log":
        return <BankTransferLogReport store={store} />;
      case "cheque_register":
        return <ChequeRegisterReport store={store} />;
      case "bank_charges_summary":
        return <BankChargesSummaryReport store={store} />;
      case "bank_position_summary":
        return <BankPositionSummaryReport store={store} />;
      case "soa_customer":
        return <SOACustomerReport store={store} />;
      case "soa_vendor":
        return <SOAVendorReport store={store} />;
      case "soa_employee":
        return <SOAEmployeeReport store={store} />;
      case "soa_ledger":
        return <SOALedgerReport store={store} />;
      case "soa_all_accounts":
        return <SOAAllAccountsReport store={store} />;
      case "soa_intercompany":
        return <SOAIntercompanyReport store={store} />;
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

        <ExportDropdown
          onExportPdf={handleExportPdf}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          onDownload={handleDownloadCsv}
        />
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
                    <option value="All">All</option>
                    {branches.map((b) => (
                      <option key={b.id} value={String(b.id)}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {showAdvanced && (
                  <div className="space-y-1.5 relative">
                    <label className="text-[11px] text-slate-600 flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5" />
                      Account / Cost Centre
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={accountOpen
                          ? accountSearch
                          : selectedAccount === "All"
                            ? ""
                            : accountOptions.find(o => o.value === selectedAccount)?.label || selectedAccount}
                        placeholder="All accounts"
                        onFocus={() => { setAccountOpen(true); setAccountSearch(""); }}
                        onChange={(e) => { setAccountSearch(e.target.value); setAccountOpen(true); }}
                        onBlur={() => setTimeout(() => setAccountOpen(false), 150)}
                        className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                      />
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                      {accountOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {[{ value: "All", label: "All accounts" }, ...accountOptions]
                            .filter(o => !accountSearch || o.label.toLowerCase().includes(accountSearch.toLowerCase()))
                            .map(o => (
                              <button
                                key={o.value}
                                type="button"
                                onMouseDown={() => { setSelectedAccount(o.value); setAccountSearch(""); setAccountOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${selectedAccount === o.value ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                              >
                                {o.label}
                              </button>
                            ))}
                          {[{ value: "All", label: "All accounts" }, ...accountOptions].filter(o => !accountSearch || o.label.toLowerCase().includes(accountSearch.toLowerCase())).length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-slate-400">No matches for "{accountSearch}"</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-2 col-span-full xl:col-span-1 xl:col-start-4 xl:justify-end">
                  <Button className="h-8 px-6 text-[11px] bg-[#F5C742] hover:bg-[#e4b82e] text-slate-900 font-semibold" onClick={() => setFetchKey(k => k + 1)}>
                    Generate
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleExportExcel}
                    className="h-8 text-[11px] text-slate-600 flex items-center gap-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Applied filter chips */}
          {appliedFilters().length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {appliedFilters().map((f) => (
                <span key={f.label} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#FFF6D8] border border-[#F5C742]/60 text-slate-700">
                  <span className="text-slate-400">{f.label}:</span>
                  <span className="font-medium">{f.value}</span>
                </span>
              ))}
            </div>
          )}

          {/* Report Results */}
          <div>
            {fetchError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{fetchError}</span>
              </div>
            ) : fetching ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-[12px] text-slate-400">
                Loading report data…
              </div>
            ) : (
              renderResults()
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
