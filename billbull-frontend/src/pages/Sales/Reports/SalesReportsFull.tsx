import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Store,
  Users,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  BarChart3,
  FileSpreadsheet,
  FileText,
  DollarSign,
  CreditCard,
  Truck,
  Package,
  Tag,
  Shield,
  Clock,
  Target,
  Activity,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Input } from "./ui/input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from "recharts";
import { getSalesReportData, getSalesReportSalespersons } from "../../../api/salesReportsApi";
import { exportToExcel } from "../../../utils/exportUtils";
import { generateReportA4Html, printHtml, downloadPdf } from "../../../utils/printGenerator";
import { getCompanyProfile } from "../../../api/companyProfileApi";
import { getBranches } from "../../../api/branchApi";
import ExportDropdown from "../../../components/common/ExportDropdown";
import { useBranch } from "../../../context/BranchContext";

type ReportGroupId =
  | "summary"
  | "pos"
  | "van"
  | "backoffice"
  | "customer"
  | "item"
  | "discount"
  | "tax"
  | "audit";

type ReportId =
  // Summary
  | "sales_summary"
  | "daily_sales"
  | "channel_wise"
  // POS
  | "pos_transaction"
  | "pos_item_sales"
  | "pos_payment_mode"
  | "pos_cashier_performance"
  | "pos_void_cancellation"
  // VAN
  | "van_sales_summary"
  | "van_item_sales"
  | "van_route_performance"
  | "van_collection"
  | "van_stock_variance"
  // Back-office
  | "sales_invoice_register"
  | "sales_order_status"
  | "delivery_dispatch"
  | "credit_note_returns"
  // Customer
  | "customer_sales_summary"
  | "customer_aging"
  | "top_dormant_customers"
  | "customer_price_level"
  | "customer_profit_drilldown"
  // Item & Category
  | "item_wise_sales"
  | "category_brand_sales"
  | "fast_slow_moving"
  // Discount & Promotion
  | "discount_analysis"
  | "promotion_impact"
  | "free_issue_scheme"
  // Tax
  | "tax_summary"
  | "vat_output_register"
  // Audit
  | "price_override"
  | "manual_entry"
  | "sales_edit_log";

type ReportKind = "table" | "table+chart";

interface ReportDef {
  id: ReportId;
  label: string;
  description: string;
  kind: ReportKind;
  group: ReportGroupId;
  tags?: string[];
}

const REPORTS: ReportDef[] = [
  // 1) Sales Summary & Financial Reports
  {
    id: "sales_summary",
    label: "Sales Summary Report",
    description: "Total sales, net sales, tax, COGS, gross profit & GP%",
    kind: "table+chart",
    group: "summary",
    tags: ["Core", "Financial"],
  },
  {
    id: "daily_sales",
    label: "Daily Sales Report (Z-Style)",
    description: "Day-end report: opening balance, sales, returns, collections",
    kind: "table+chart",
    group: "summary",
    tags: ["Core", "Audit"],
  },
  {
    id: "channel_wise",
    label: "Channel-wise Sales Report",
    description: "Split by POS / VAN / Back-Office with metrics",
    kind: "table+chart",
    group: "summary",
    tags: ["Core"],
  },

  // 2) POS Sales Reports
  {
    id: "pos_transaction",
    label: "POS Transaction Report",
    description: "Bill-wise details: bill no, cashier, payment mode, status",
    kind: "table",
    group: "pos",
    tags: ["POS", "Audit"],
  },
  {
    id: "pos_item_sales",
    label: "POS Item Sales Report",
    description: "Item-wise sales, qty, discounts, returns, net contribution",
    kind: "table+chart",
    group: "pos",
    tags: ["POS", "Analytics"],
  },
  {
    id: "pos_payment_mode",
    label: "POS Payment Mode Report",
    description: "Cash, card, wallet, split payments, refunds by mode",
    kind: "table+chart",
    group: "pos",
    tags: ["POS", "Finance"],
  },
  {
    id: "pos_cashier_performance",
    label: "POS Cashier Performance",
    description: "Cashier-wise bills, sales, discounts, voids, returns, variance",
    kind: "table+chart",
    group: "pos",
    tags: ["POS", "Performance"],
  },
  {
    id: "pos_void_cancellation",
    label: "POS Void & Cancellation Report",
    description: "Void/cancel log with reason, approver, value impact",
    kind: "table",
    group: "pos",
    tags: ["POS", "Audit"],
  },

  // 3) VAN / Route Sales
  {
    id: "van_sales_summary",
    label: "VAN Sales Summary",
    description: "Route, salesperson, stock, sales value by beat",
    kind: "table+chart",
    group: "van",
    tags: ["VAN", "Field"],
  },
  {
    id: "van_item_sales",
    label: "VAN Item Sales Report",
    description: "Item-wise qty sold, returned, free issue",
    kind: "table",
    group: "van",
    tags: ["VAN"],
  },
  {
    id: "van_route_performance",
    label: "VAN Route / Beat Performance",
    description: "Planned vs actual visits, sales, collection, conversion%",
    kind: "table+chart",
    group: "van",
    tags: ["VAN", "Performance"],
  },
  {
    id: "van_collection",
    label: "VAN Collection Report",
    description: "Cash/card collected, credit sales, pending, variance",
    kind: "table",
    group: "van",
    tags: ["VAN", "Finance"],
  },
  {
    id: "van_stock_variance",
    label: "VAN Stock Variance Report",
    description: "Issued vs sold vs returned, missing/excess stock",
    kind: "table",
    group: "van",
    tags: ["VAN", "Audit"],
  },

  // 4) Back-Office Sales
  {
    id: "sales_invoice_register",
    label: "Sales Invoice Register",
    description: "Invoice no, customer, status, outstanding amount",
    kind: "table",
    group: "backoffice",
    tags: ["Invoice", "Audit"],
  },
  {
    id: "sales_order_status",
    label: "Sales Order Status Report",
    description: "Order no, ordered vs delivered vs pending qty",
    kind: "table",
    group: "backoffice",
    tags: ["Order"],
  },
  {
    id: "delivery_dispatch",
    label: "Delivery / Dispatch Report",
    description: "Delivery note, driver, status, proof of delivery",
    kind: "table",
    group: "backoffice",
    tags: ["Logistics"],
  },
  {
    id: "credit_note_returns",
    label: "Credit Note & Returns Report",
    description: "Credit note, reason, linked invoice, return value",
    kind: "table",
    group: "backoffice",
    tags: ["Returns", "Audit"],
  },

  // 5) Customer-Centric
  {
    id: "customer_sales_summary",
    label: "Customer Sales Summary",
    description: "Customer-wise total sales, returns, net, outstanding",
    kind: "table+chart",
    group: "customer",
    tags: ["CRM", "Analytics"],
  },
  {
    id: "customer_aging",
    label: "Customer Aging Report",
    description: "Aging buckets: 0-30 / 31-60 / 61-90 / 90+, credit limit",
    kind: "table+chart",
    group: "customer",
    tags: ["CRM", "Finance"],
  },
  {
    id: "top_dormant_customers",
    label: "Top / Dormant Customers",
    description: "Top revenue customers + inactive (no purchase in X days)",
    kind: "table+chart",
    group: "customer",
    tags: ["CRM"],
  },
  {
    id: "customer_price_level",
    label: "Customer Price Level Report",
    description: "Assigned price level, discount rules, margin impact",
    kind: "table",
    group: "customer",
    tags: ["CRM", "Pricing"],
  },

  {
    id: "customer_profit_drilldown",
    label: "Customer → Bill → Item Profit Report",
    description: "Drill into each customer's bills and individual item-level cost, margin & GP%",
    kind: "table+chart",
    group: "customer",
    tags: ["CRM", "Profitability", "Analytics"],
  },

  // 6) Item & Category Performance
  {
    id: "item_wise_sales",
    label: "Item-wise Sales Report",
    description: "Item, qty sold, revenue, cost, GP%",
    kind: "table+chart",
    group: "item",
    tags: ["Analytics"],
  },
  {
    id: "category_brand_sales",
    label: "Category / Brand Sales Report",
    description: "Category-wise qty, sales, contribution%",
    kind: "table+chart",
    group: "item",
    tags: ["Analytics"],
  },
  {
    id: "fast_slow_moving",
    label: "Fast / Slow Moving Items",
    description: "High velocity vs low velocity items (sales view)",
    kind: "table+chart",
    group: "item",
    tags: ["Analytics"],
  },

  // 7) Discount & Promotion
  {
    id: "discount_analysis",
    label: "Discount Analysis Report",
    description: "Bill-level, item-level discounts by cashier/salesperson",
    kind: "table+chart",
    group: "discount",
    tags: ["Promotion"],
  },
  {
    id: "promotion_impact",
    label: "Promotion Impact Report",
    description: "Offer name, sales uplift, free issue cost, net margin",
    kind: "table+chart",
    group: "discount",
    tags: ["Promotion"],
  },
  {
    id: "free_issue_scheme",
    label: "Free Issue / Scheme Report",
    description: "Buy X Get Y, free qty issued, cost impact",
    kind: "table",
    group: "discount",
    tags: ["Promotion"],
  },

  // 8) Tax & Compliance
  {
    id: "tax_summary",
    label: "Tax Summary Report",
    description: "Taxable sales, zero-rated, tax collected, adjustments",
    kind: "table+chart",
    group: "tax",
    tags: ["Tax", "Compliance"],
  },
  {
    id: "vat_output_register",
    label: "VAT Output Register",
    description: "Invoice-wise VAT details for audit & filing",
    kind: "table",
    group: "tax",
    tags: ["Tax", "Audit"],
  },

  // 9) Audit & Control
  {
    id: "price_override",
    label: "Price Override Report",
    description: "Item, old vs new price, approved by, reason",
    kind: "table",
    group: "audit",
    tags: ["Audit"],
  },
  {
    id: "manual_entry",
    label: "Manual / Back-Dated Entry Report",
    description: "User, date, impact value for manual entries",
    kind: "table",
    group: "audit",
    tags: ["Audit"],
  },
  {
    id: "sales_edit_log",
    label: "Sales Edit Log",
    description: "Edited invoices, field changed, before/after, user",
    kind: "table",
    group: "audit",
    tags: ["Audit"],
  },
];

// Backend-provided KPI totals for Sales Summary (authoritative — avoids re-deriving from chart rows)
let mockSalesSummaryTotals: { grossSales: number; netSales: number; grossProfit: number; tax: number; returns: number } | null = null;

// Mock data for Sales Summary Report
let mockSalesSummaryData = [
  { date: "2026-01-10", grossSales: 45230, returns: 1200, discounts: 2150, netSales: 41880, tax: 2094, cogs: 29316, grossProfit: 12564, gp: 30.0 },
  { date: "2026-01-11", grossSales: 52100, returns: 1450, discounts: 2500, netSales: 48150, tax: 2408, cogs: 33705, grossProfit: 14445, gp: 30.0 },
  { date: "2026-01-12", grossSales: 48900, returns: 980, discounts: 2200, netSales: 45720, tax: 2286, cogs: 32004, grossProfit: 13716, gp: 30.0 },
  { date: "2026-01-13", grossSales: 51200, returns: 1100, discounts: 2400, netSales: 47700, tax: 2385, cogs: 33390, grossProfit: 14310, gp: 30.0 },
  { date: "2026-01-14", grossSales: 53800, returns: 1250, discounts: 2550, netSales: 50000, tax: 2500, cogs: 35000, grossProfit: 15000, gp: 30.0 },
  { date: "2026-01-15", grossSales: 56200, returns: 1350, discounts: 2700, netSales: 52150, tax: 2608, cogs: 36505, grossProfit: 15645, gp: 30.0 },
  { date: "2026-01-16", grossSales: 49500, returns: 1050, discounts: 2300, netSales: 46150, tax: 2308, cogs: 32305, grossProfit: 13845, gp: 30.0 },
];

// Mock data for Channel-wise Sales
let mockChannelSalesData = [
  { channel: "POS Sales", transactions: 458, salesValue: 142300, avgBill: 310.70, discountPct: 4.8, returnPct: 2.1 },
  { channel: "VAN Sales", transactions: 234, salesValue: 98600, avgBill: 421.37, discountPct: 3.2, returnPct: 1.8 },
  { channel: "Back-Office", transactions: 89, salesValue: 156250, avgBill: 1755.06, discountPct: 5.5, returnPct: 3.4 },
];

// Mock data for Daily Sales (Z-style)
let mockDailySalesData = {
  date: new Date().toISOString().split("T")[0],
  branch: "Main Branch",
  preparedBy: "Ahmed Hassan",
  approvedBy: "Mgr. Ali Khalid",
  shift: "Full Day 08:00–22:00",

  // Opening balance per cash account
  openingBalances: [
    { account: "Cash in Hand (Main Register)", amount: 5000.00 },
    { account: "Petty Cash",                   amount: 1200.00 },
    { account: "Van Cash Float",               amount: 2500.00 },
  ],

  // Sales
  posSales:          142300.00,
  vanSales:           98600.00,
  backOfficeSales:   156250.00,
  totalGrossSales:   397150.00,
  salesReturns:        8450.00,
  discounts:          18920.00,
  netSales:          369780.00,
  vatOnSales:         18489.00,

  // Sales payment breakdown
  salesPayments: [
    { mode: "Cash",          amount: 185400.00 },
    { mode: "Card (Visa)",   amount:  98200.00 },
    { mode: "Card (MC)",     amount:  66000.00 },
    { mode: "Apple Pay",     amount:  12100.00 },
    { mode: "Bank Transfer", amount:   8080.00 },
  ],

  // Purchases
  totalPurchases:    214600.00,
  purchaseReturns:     6200.00,
  netPurchases:      208400.00,
  vatOnPurchases:     10420.00,
  purchasePayments: [
    { mode: "Cash",          amount:  42000.00 },
    { mode: "Cheque / PDC",  amount:  98400.00 },
    { mode: "Bank Transfer", amount:  68000.00 },
  ],

  // Expenses
  totalExpenses:      18650.00,
  expensePayments: [
    { category: "Staff Meals",         mode: "Cash",          amount:  1800.00 },
    { category: "Transportation",      mode: "Cash",          amount:  2400.00 },
    { category: "Packaging Supplies",  mode: "Petty Cash",    amount:   850.00 },
    { category: "Utilities",           mode: "Bank Transfer", amount:  6200.00 },
    { category: "Maintenance",         mode: "Cash",          amount:  3800.00 },
    { category: "Miscellaneous",       mode: "Petty Cash",    amount:   650.00 },
    { category: "Marketing",           mode: "Bank Transfer", amount:  2950.00 },
  ],

  // Sales returns
  salesReturnLines: [
    { ref: "RET-1041", customer: "Al Khaleej Traders", items: 3, amount: 3200.00, mode: "Cash Refund" },
    { ref: "RET-1042", customer: "Walk-in",            items: 1, amount: 1650.00, mode: "Card Refund" },
    { ref: "RET-1043", customer: "Emirates Food Dist.", items: 2, amount: 3600.00, mode: "Credit Note" },
  ],

  // Purchase returns
  purchaseReturnLines: [
    { ref: "GRV-0551", vendor: "GrainCo Suppliers",   items: 2, amount: 2800.00, mode: "Debit Note" },
    { ref: "GRV-0552", vendor: "DairyHub LLC",         items: 1, amount: 1400.00, mode: "Cash Refund" },
    { ref: "GRV-0553", vendor: "OilTrade Est.",        items: 1, amount: 2000.00, mode: "Debit Note" },
  ],

  // Advances
  soAdvances: [
    { ref: "ADV-S-0088", customer: "Gulf Supermarket",    mode: "Bank Transfer", amount: 15000.00 },
    { ref: "ADV-S-0089", customer: "Marina Retail",       mode: "Cash",          amount:  8500.00 },
  ],
  lpoAdvances: [
    { ref: "ADV-P-0031", vendor: "SpiceWorld Trading",    mode: "Cash",          amount:  6000.00 },
    { ref: "ADV-P-0032", vendor: "FoodPro LLC",           mode: "Bank Transfer", amount:  9000.00 },
  ],
  salaryAdvances: [
    { ref: "ADV-HR-0014", employee: "Mohammed Rashid",    mode: "Cash",          amount:  2000.00 },
    { ref: "ADV-HR-0015", employee: "Sara Abdullah",      mode: "Cash",          amount:  1500.00 },
  ],

  // Other receipts & payments
  otherReceipts: [
    { ref: "OR-0041", description: "Scrap metal sale",     mode: "Cash",          amount:  1200.00 },
    { ref: "OR-0042", description: "Rental income",        mode: "Bank Transfer", amount:  5000.00 },
    { ref: "OR-0043", description: "Insurance claim",      mode: "Cheque",        amount:  8500.00 },
  ],
  otherPayments: [
    { ref: "OP-0055", description: "Municipality fees",   mode: "Bank Transfer", amount:  3200.00 },
    { ref: "OP-0056", description: "Office supplies",     mode: "Petty Cash",    amount:   480.00 },
    { ref: "OP-0057", description: "Vehicle service",     mode: "Cash",          amount:  1850.00 },
  ],

  // Customer receipts (collections)
  customerReceipts: [
    { ref: "CR-0881", customer: "Al Khaleej Traders",     mode: "Cheque",        amount:  48000.00 },
    { ref: "CR-0882", customer: "Emirates Food Dist.",     mode: "Bank Transfer", amount:  62000.00 },
    { ref: "CR-0883", customer: "Dubai Fresh Markets",     mode: "Cash",          amount:  18500.00 },
    { ref: "CR-0884", customer: "Gulf Supermarket",        mode: "Bank Transfer", amount: 120000.00 },
    { ref: "CR-0885", customer: "Marina Retail Outlets",   mode: "Cheque",        amount:  22000.00 },
  ],

  // Vendor payments
  vendorPayments: [
    { ref: "VP-0441", vendor: "GrainCo Suppliers",        mode: "Cheque / PDC",  amount:  55000.00 },
    { ref: "VP-0442", vendor: "DairyHub LLC",              mode: "Bank Transfer", amount:  38000.00 },
    { ref: "VP-0443", vendor: "OilTrade Est.",             mode: "Cash",          amount:  12000.00 },
    { ref: "VP-0444", vendor: "SpiceWorld Trading",        mode: "Bank Transfer", amount:  24000.00 },
  ],

  // Cash / bank closing balances
  cashAccounts: [
    { account: "Cash in Hand (Main Register)", opening: 5000.00,  inflow: 185400.00, outflow: 150000.00, closing: 40400.00, actual: 40350.00 },
    { account: "Petty Cash",                   opening: 1200.00,  inflow:   2200.00, outflow:   1980.00, closing:  1420.00, actual:  1420.00 },
    { account: "Van Cash Float",               opening: 2500.00,  inflow:  98600.00, outflow:  96200.00, closing:  4900.00, actual:  4875.00 },
  ],
  bankAccounts: [
    { bank: "Emirates NBD — Current",          opening: 285000.00, receipts: 207000.00, payments: 188200.00, closing: 303800.00 },
    { bank: "ADCB — Operations",               opening:  98000.00, receipts:  62000.00, payments:  55000.00, closing: 105000.00 },
  ],
};

// Mock data for Customer Sales Summary
let mockCustomerSalesData = [
  { customer: "Al Khaleej Traders LLC", totalSales: 124500, returns: 3200, netSales: 121300, outstanding: 24500, creditLimit: 150000, utilization: 16.3 },
  { customer: "Emirates Food Distributors", totalSales: 98700, returns: 2100, netSales: 96600, outstanding: 18200, creditLimit: 100000, utilization: 18.2 },
  { customer: "Dubai Fresh Markets", totalSales: 86400, returns: 1850, netSales: 84550, outstanding: 12300, creditLimit: 80000, utilization: 15.4 },
  { customer: "Gulf Supermarket Chain", totalSales: 156800, returns: 4200, netSales: 152600, outstanding: 0, creditLimit: 200000, utilization: 0 },
  { customer: "Marina Retail Outlets", totalSales: 72300, returns: 1450, netSales: 70850, outstanding: 8900, creditLimit: 75000, utilization: 11.9 },
  { customer: "Downtown Corner Stores", totalSales: 54200, returns: 980, netSales: 53220, outstanding: 15600, creditLimit: 50000, utilization: 31.2 },
];

// Mock data for POS Cashier Performance
let mockCashierPerformanceData = [
  { cashier: "Ahmed Hassan", bills: 145, totalSales: 45200, avgBill: 311.72, discountPct: 4.2, voidCount: 3, returnCount: 5, variance: -15 },
  { cashier: "Fatima Al Zaabi", bills: 132, totalSales: 41800, avgBill: 316.67, discountPct: 3.8, voidCount: 2, returnCount: 4, variance: 0 },
  { cashier: "Mohammed Rashid", bills: 98, totalSales: 30500, avgBill: 311.22, discountPct: 5.1, voidCount: 5, returnCount: 6, variance: -25 },
  { cashier: "Sara Abdullah", bills: 83, totalSales: 24800, avgBill: 298.80, discountPct: 4.5, voidCount: 1, returnCount: 3, variance: 10 },
];

// Mock data for POS Transaction Report
let mockPOSTransactionData = [
  { billNo: "POS-2026-4521", date: "2026-01-16", time: "09:14", cashier: "Ahmed Hassan", customer: "Walk-in", items: 4, grossAmt: 420.50, discount: 21.00, tax: 19.98, netAmt: 419.48, payMode: "Cash", status: "Completed" },
  { billNo: "POS-2026-4522", date: "2026-01-16", time: "09:31", cashier: "Fatima Al Zaabi", customer: "Ali Mohammed", items: 7, grossAmt: 892.00, discount: 44.60, tax: 42.37, netAmt: 889.77, payMode: "Card", status: "Completed" },
  { billNo: "POS-2026-4523", date: "2026-01-16", time: "09:45", cashier: "Ahmed Hassan", customer: "Walk-in", items: 2, grossAmt: 156.00, discount: 0, tax: 7.80, netAmt: 163.80, payMode: "Wallet", status: "Completed" },
  { billNo: "POS-2026-4524", date: "2026-01-16", time: "10:02", cashier: "Mohammed Rashid", customer: "Walk-in", items: 5, grossAmt: 312.75, discount: 15.64, tax: 14.86, netAmt: 311.97, payMode: "Cash", status: "Voided" },
  { billNo: "POS-2026-4525", date: "2026-01-16", time: "10:17", cashier: "Sara Abdullah", customer: "Hessa Al Mansoori", items: 12, grossAmt: 1456.00, discount: 72.80, tax: 69.17, netAmt: 1452.37, payMode: "Split", status: "Completed" },
  { billNo: "POS-2026-4526", date: "2026-01-16", time: "10:33", cashier: "Fatima Al Zaabi", customer: "Walk-in", items: 3, grossAmt: 245.00, discount: 12.25, tax: 11.64, netAmt: 244.39, payMode: "Card", status: "Completed" },
  { billNo: "POS-2026-4527", date: "2026-01-16", time: "10:48", cashier: "Ahmed Hassan", customer: "Khalid Rashid", items: 8, grossAmt: 734.00, discount: 36.70, tax: 34.87, netAmt: 732.17, payMode: "Cash", status: "Return" },
  { billNo: "POS-2026-4528", date: "2026-01-16", time: "11:05", cashier: "Mohammed Rashid", customer: "Walk-in", items: 6, grossAmt: 512.50, discount: 25.63, tax: 24.34, netAmt: 511.21, payMode: "Card", status: "Completed" },
];

// Mock data for POS Item Sales
let mockPOSItemSalesData = [
  { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qtyOrdered: 284, qtySold: 278, returns: 6, grossAmt: 8340.00, discount: 417.00, netAmt: 7923.00, contribution: 12.4 },
  { itemCode: "ITM-002", itemName: "Fresh Orange Juice 1L", category: "Beverages", qtyOrdered: 512, qtySold: 498, returns: 14, grossAmt: 5976.00, discount: 298.80, netAmt: 5677.20, contribution: 8.9 },
  { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qtyOrdered: 380, qtySold: 372, returns: 8, grossAmt: 6696.00, discount: 334.80, netAmt: 6361.20, contribution: 10.0 },
  { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qtyOrdered: 195, qtySold: 190, returns: 5, grossAmt: 7600.00, discount: 380.00, netAmt: 7220.00, contribution: 11.3 },
  { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qtyOrdered: 142, qtySold: 138, returns: 4, grossAmt: 6348.00, discount: 317.40, netAmt: 6030.60, contribution: 9.5 },
  { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qtyOrdered: 326, qtySold: 318, returns: 8, grossAmt: 2862.00, discount: 143.10, netAmt: 2718.90, contribution: 4.3 },
  { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qtyOrdered: 248, qtySold: 241, returns: 7, grossAmt: 4338.00, discount: 216.90, netAmt: 4121.10, contribution: 6.5 },
  { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qtyOrdered: 410, qtySold: 402, returns: 8, grossAmt: 3618.00, discount: 180.90, netAmt: 3437.10, contribution: 5.4 },
];

// Mock data for POS Payment Mode
let mockPOSPaymentData = [
  { mode: "Cash", transactions: 224, amount: 69520.00, refunds: 1850.00, netAmount: 67670.00, pct: 47.6 },
  { mode: "Debit Card", transactions: 138, amount: 42800.00, refunds: 920.00, netAmount: 41880.00, pct: 29.5 },
  { mode: "Credit Card", transactions: 64, amount: 19850.00, refunds: 450.00, netAmount: 19400.00, pct: 13.7 },
  { mode: "Wallet / App", transactions: 28, amount: 8700.00, refunds: 120.00, netAmount: 8580.00, pct: 6.0 },
  { mode: "Split Pay", transactions: 12, amount: 4680.00, refunds: 0, netAmount: 4680.00, pct: 3.3 },
];

// Mock data for POS Void & Cancellation
let mockVoidData = [
  { billNo: "POS-2026-4524", date: "2026-01-16", time: "10:02", cashier: "Mohammed Rashid", value: 312.75, reason: "Customer changed mind", approvedBy: "Supervisor Ali", status: "Void" },
  { billNo: "POS-2026-4418", date: "2026-01-15", time: "14:32", cashier: "Ahmed Hassan", value: 156.00, reason: "Item scan error", approvedBy: "Supervisor Mona", status: "Void" },
  { billNo: "POS-2026-4390", date: "2026-01-15", time: "11:18", cashier: "Sara Abdullah", value: 89.50, reason: "Payment issue", approvedBy: "Supervisor Ali", status: "Cancelled" },
  { billNo: "POS-2026-4312", date: "2026-01-14", time: "16:45", cashier: "Fatima Al Zaabi", value: 445.25, reason: "Price discrepancy", approvedBy: "Manager Waleed", status: "Void" },
  { billNo: "POS-2026-4289", date: "2026-01-14", time: "09:22", cashier: "Mohammed Rashid", value: 234.00, reason: "Duplicate entry", approvedBy: "Supervisor Ali", status: "Cancelled" },
];

// Mock data for VAN Sales Summary
let mockVANSalesSummaryData = [
  { route: "Route A – Deira", salesperson: "Tariq Mansoor", visits: 28, actualVisits: 26, stockIssued: 48500, stockSold: 42800, returns: 1200, netSales: 41600, collection: 38400 },
  { route: "Route B – Bur Dubai", salesperson: "Khalid Hamdan", visits: 22, actualVisits: 22, stockIssued: 38200, stockSold: 35600, returns: 900, netSales: 34700, collection: 34700 },
  { route: "Route C – Sharjah", salesperson: "Saeed Al Noor", visits: 31, actualVisits: 29, stockIssued: 52400, stockSold: 44100, returns: 1800, netSales: 42300, collection: 40100 },
  { route: "Route D – Ajman", salesperson: "Omar Zayed", visits: 18, actualVisits: 16, stockIssued: 28600, stockSold: 21900, returns: 650, netSales: 21250, collection: 18500 },
];

// Mock data for VAN Route Performance
let mockVANRouteData = [
  { route: "Route A – Deira", planned: 28, actual: 26, conversion: 89.3, salesTarget: 45000, salesActual: 41600, collection: 38400, outstanding: 3200 },
  { route: "Route B – Bur Dubai", planned: 22, actual: 22, conversion: 100, salesTarget: 38000, salesActual: 34700, collection: 34700, outstanding: 0 },
  { route: "Route C – Sharjah", planned: 31, actual: 29, conversion: 93.5, salesTarget: 50000, salesActual: 42300, collection: 40100, outstanding: 2200 },
  { route: "Route D – Ajman", planned: 18, actual: 16, conversion: 88.9, salesTarget: 28000, salesActual: 21250, collection: 18500, outstanding: 2750 },
];

// Mock data for VAN Item Sales
let mockVANItemData = [
  { item: "Basmati Rice 5kg", route: "All Routes", qtySold: 1240, qtyReturned: 38, freeIssue: 24, netQty: 1226, value: 36780 },
  { item: "Full Cream Milk 4L", route: "All Routes", qtySold: 892, qtyReturned: 22, freeIssue: 0, netQty: 870, value: 15660 },
  { item: "Cooking Oil 5L", route: "All Routes", qtySold: 546, qtyReturned: 14, freeIssue: 12, netQty: 544, value: 19584 },
  { item: "Tomato Paste 400g", route: "All Routes", qtySold: 1820, qtyReturned: 45, freeIssue: 60, netQty: 1835, value: 16515 },
  { item: "Chicken Stock 1L", route: "All Routes", qtySold: 634, qtyReturned: 18, freeIssue: 0, netQty: 616, value: 7084 },
];

// Mock data for VAN Collection
let mockVANCollectionData = [
  { salesperson: "Tariq Mansoor", route: "Route A", cashCollected: 22400, cardCollected: 16000, creditSales: 3200, totalCollected: 38400, pending: 3200, variance: 0 },
  { salesperson: "Khalid Hamdan", route: "Route B", cashCollected: 18200, cardCollected: 16500, creditSales: 0, totalCollected: 34700, pending: 0, variance: 0 },
  { salesperson: "Saeed Al Noor", route: "Route C", cashCollected: 24600, cardCollected: 15500, creditSales: 2200, totalCollected: 40100, pending: 2200, variance: -50 },
  { salesperson: "Omar Zayed", route: "Route D", cashCollected: 10500, cardCollected: 8000, creditSales: 2750, totalCollected: 18500, pending: 2750, variance: 120 },
];

// Mock data for VAN Stock Variance
let mockVANStockData = [
  { salesperson: "Tariq Mansoor", route: "Route A", issued: 48500, sold: 42800, returned: 1200, expected: 4500, actual: 4480, variance: -20 },
  { salesperson: "Khalid Hamdan", route: "Route B", issued: 38200, sold: 35600, returned: 900, expected: 1700, actual: 1700, variance: 0 },
  { salesperson: "Saeed Al Noor", route: "Route C", issued: 52400, sold: 44100, returned: 1800, expected: 6500, actual: 6350, variance: -150 },
  { salesperson: "Omar Zayed", route: "Route D", issued: 28600, sold: 21900, returned: 650, expected: 6050, actual: 6180, variance: 130 },
];

// Mock data for Sales Invoice Register
let mockInvoiceRegisterData = [
  { invoiceNo: "INV-2026-1842", date: "2026-01-16", customer: "Gulf Supermarket Chain", salesperson: "Waleed Ibrahim", amount: 24800, tax: 1240, total: 26040, status: "Paid", outstanding: 0, dueDate: "2026-02-15" },
  { invoiceNo: "INV-2026-1841", date: "2026-01-16", customer: "Marina Retail Outlets", salesperson: "Noura Khalid", amount: 12400, tax: 620, total: 13020, status: "Partial", outstanding: 5000, dueDate: "2026-02-15" },
  { invoiceNo: "INV-2026-1840", date: "2026-01-15", customer: "Al Khaleej Traders LLC", salesperson: "Waleed Ibrahim", amount: 38600, tax: 1930, total: 40530, status: "Unpaid", outstanding: 40530, dueDate: "2026-02-14" },
  { invoiceNo: "INV-2026-1839", date: "2026-01-15", customer: "Emirates Food Distributors", salesperson: "Ahmed Faris", amount: 18200, tax: 910, total: 19110, status: "Paid", outstanding: 0, dueDate: "2026-02-14" },
  { invoiceNo: "INV-2026-1838", date: "2026-01-14", customer: "Downtown Corner Stores", salesperson: "Noura Khalid", amount: 9800, tax: 490, total: 10290, status: "Overdue", outstanding: 10290, dueDate: "2026-01-28" },
  { invoiceNo: "INV-2026-1837", date: "2026-01-14", customer: "Dubai Fresh Markets", salesperson: "Waleed Ibrahim", amount: 31500, tax: 1575, total: 33075, status: "Partial", outstanding: 15000, dueDate: "2026-02-13" },
  { invoiceNo: "INV-2026-1836", date: "2026-01-13", customer: "Al Khaleej Traders LLC", salesperson: "Ahmed Faris", amount: 22100, tax: 1105, total: 23205, status: "Paid", outstanding: 0, dueDate: "2026-02-12" },
];

// Mock data for Sales Order Status
let mockOrderStatusData = [
  { orderNo: "SO-2026-0892", date: "2026-01-14", customer: "Gulf Supermarket Chain", orderedQty: 1200, deliveredQty: 1200, pendingQty: 0, orderedValue: 48600, deliveredValue: 48600, status: "Fully Delivered" },
  { orderNo: "SO-2026-0891", date: "2026-01-14", customer: "Al Khaleej Traders LLC", orderedQty: 850, deliveredQty: 620, pendingQty: 230, orderedValue: 34000, deliveredValue: 24800, status: "Partial" },
  { orderNo: "SO-2026-0890", date: "2026-01-13", customer: "Marina Retail Outlets", orderedQty: 420, deliveredQty: 420, pendingQty: 0, orderedValue: 16800, deliveredValue: 16800, status: "Fully Delivered" },
  { orderNo: "SO-2026-0889", date: "2026-01-13", customer: "Emirates Food Distributors", orderedQty: 680, deliveredQty: 0, pendingQty: 680, orderedValue: 27200, deliveredValue: 0, status: "Pending" },
  { orderNo: "SO-2026-0888", date: "2026-01-12", customer: "Downtown Corner Stores", orderedQty: 310, deliveredQty: 310, pendingQty: 0, orderedValue: 12400, deliveredValue: 12400, status: "Fully Delivered" },
  { orderNo: "SO-2026-0887", date: "2026-01-11", customer: "Dubai Fresh Markets", orderedQty: 920, deliveredQty: 780, pendingQty: 140, orderedValue: 36800, deliveredValue: 31200, status: "Partial" },
];

// Mock data for Delivery Dispatch
let mockDeliveryData = [
  { dnNo: "DN-2026-0612", date: "2026-01-16", customer: "Gulf Supermarket Chain", driver: "Rashid Hamad", vehicle: "Dubai A 12345", items: 42, weight: "680 kg", status: "Delivered", pod: "Received", deliveredAt: "11:32" },
  { dnNo: "DN-2026-0611", date: "2026-01-16", customer: "Al Khaleej Traders LLC", driver: "Saif Nasser", vehicle: "Dubai B 67890", items: 28, weight: "420 kg", status: "In Transit", pod: "Pending", deliveredAt: "—" },
  { dnNo: "DN-2026-0610", date: "2026-01-16", customer: "Marina Retail Outlets", driver: "Hassan Ali", vehicle: "Sharjah C 22222", items: 18, weight: "250 kg", status: "Delivered", pod: "Signed", deliveredAt: "10:15" },
  { dnNo: "DN-2026-0609", date: "2026-01-15", customer: "Emirates Food Distributors", driver: "Rashid Hamad", vehicle: "Dubai A 12345", items: 54, weight: "820 kg", status: "Delivered", pod: "Received", deliveredAt: "14:48" },
  { dnNo: "DN-2026-0608", date: "2026-01-15", customer: "Dubai Fresh Markets", driver: "Saif Nasser", vehicle: "Dubai B 67890", items: 36, weight: "540 kg", status: "Failed", pod: "—", deliveredAt: "—" },
  { dnNo: "DN-2026-0607", date: "2026-01-14", customer: "Downtown Corner Stores", driver: "Hassan Ali", vehicle: "Sharjah C 22222", items: 22, weight: "310 kg", status: "Delivered", pod: "Signed", deliveredAt: "09:50" },
];

// Mock data for Credit Note & Returns
let mockCreditNoteData = [
  { cnNo: "CN-2026-0142", date: "2026-01-16", customer: "Al Khaleej Traders LLC", linkedInvoice: "INV-2026-1820", reason: "Damaged goods", items: 8, returnValue: 2400, tax: 120, total: 2520, status: "Approved" },
  { cnNo: "CN-2026-0141", date: "2026-01-15", customer: "Gulf Supermarket Chain", linkedInvoice: "INV-2026-1810", reason: "Short expiry", items: 4, returnValue: 1200, tax: 60, total: 1260, status: "Approved" },
  { cnNo: "CN-2026-0140", date: "2026-01-15", customer: "Marina Retail Outlets", linkedInvoice: "INV-2026-1805", reason: "Wrong item delivered", items: 12, returnValue: 3600, tax: 180, total: 3780, status: "Pending" },
  { cnNo: "CN-2026-0139", date: "2026-01-14", customer: "Emirates Food Distributors", linkedInvoice: "INV-2026-1798", reason: "Quantity over-billed", items: 2, returnValue: 890, tax: 44.50, total: 934.50, status: "Approved" },
  { cnNo: "CN-2026-0138", date: "2026-01-13", customer: "Dubai Fresh Markets", linkedInvoice: "INV-2026-1792", reason: "Price adjustment", items: 6, returnValue: 1650, tax: 82.50, total: 1732.50, status: "Rejected" },
];

// Mock data for Customer Aging
let mockAgingData = [
  { customer: "Al Khaleej Traders LLC", creditLimit: 150000, current: 18400, days30: 6100, days60: 0, days90: 0, over90: 0, total: 24500, riskLevel: "Low" },
  { customer: "Emirates Food Distributors", creditLimit: 100000, current: 10200, days30: 5400, days60: 2600, days90: 0, over90: 0, total: 18200, riskLevel: "Medium" },
  { customer: "Dubai Fresh Markets", creditLimit: 80000, current: 8900, days30: 3400, days60: 0, days90: 0, over90: 0, total: 12300, riskLevel: "Low" },
  { customer: "Downtown Corner Stores", creditLimit: 50000, current: 0, days30: 4600, days60: 5600, days90: 4000, over90: 1400, total: 15600, riskLevel: "High" },
  { customer: "Marina Retail Outlets", creditLimit: 75000, current: 5600, days30: 3300, days60: 0, days90: 0, over90: 0, total: 8900, riskLevel: "Low" },
  { customer: "Gulf Hypermarket", creditLimit: 200000, current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0, riskLevel: "None" },
];

// Mock data for Top / Dormant Customers
let mockTopDormantData = {
  top: [
    { rank: 1, customer: "Gulf Supermarket Chain", transactions: 48, netSales: 152600, lastPurchase: "2026-01-16", avgBill: 3179.17, growth: 18.4 },
    { rank: 2, customer: "Al Khaleej Traders LLC", transactions: 36, netSales: 121300, lastPurchase: "2026-01-14", avgBill: 3369.44, growth: 12.1 },
    { rank: 3, customer: "Emirates Food Distributors", transactions: 29, netSales: 96600, lastPurchase: "2026-01-15", avgBill: 3331.03, growth: 8.7 },
    { rank: 4, customer: "Dubai Fresh Markets", transactions: 22, netSales: 84550, lastPurchase: "2026-01-13", avgBill: 3843.18, growth: -2.3 },
    { rank: 5, customer: "Marina Retail Outlets", transactions: 18, netSales: 70850, lastPurchase: "2026-01-12", avgBill: 3936.11, growth: 5.6 },
  ],
  dormant: [
    { customer: "Jumeirah Bakeries", lastPurchase: "2025-10-12", daysSince: 96, historicalSales: 42300, status: "At Risk" },
    { customer: "Al Barsha Corner Shop", lastPurchase: "2025-11-04", daysSince: 73, historicalSales: 18600, status: "At Risk" },
    { customer: "Mirdif Family Store", lastPurchase: "2025-11-22", daysSince: 55, historicalSales: 31800, status: "Watch" },
    { customer: "Rashidiya Superette", lastPurchase: "2025-12-01", daysSince: 46, historicalSales: 9200, status: "Watch" },
  ],
};

// Mock data for Customer Price Level
let mockPriceLevelData = [
  { customer: "Gulf Supermarket Chain", priceLevel: "Wholesale A", discountPct: 12.0, creditDays: 30, minOrderValue: 5000, specialItems: 8, marginImpact: -3.2 },
  { customer: "Al Khaleej Traders LLC", priceLevel: "Distributor B", discountPct: 8.5, creditDays: 45, minOrderValue: 3000, specialItems: 5, marginImpact: -2.1 },
  { customer: "Emirates Food Distributors", priceLevel: "Distributor B", discountPct: 8.5, creditDays: 30, minOrderValue: 3000, specialItems: 3, marginImpact: -2.1 },
  { customer: "Dubai Fresh Markets", priceLevel: "Retail A", discountPct: 5.0, creditDays: 15, minOrderValue: 1000, specialItems: 2, marginImpact: -1.2 },
  { customer: "Marina Retail Outlets", priceLevel: "Retail A", discountPct: 5.0, creditDays: 15, minOrderValue: 1000, specialItems: 0, marginImpact: -1.2 },
  { customer: "Downtown Corner Stores", priceLevel: "Standard", discountPct: 2.0, creditDays: 7, minOrderValue: 500, specialItems: 0, marginImpact: -0.5 },
];

// Mock data for Item-wise Sales
let mockItemWiseSalesData = [
  { item: "Basmati Rice 5kg", category: "Staples", qtySold: 1520, revenue: 45600, cost: 30096, grossProfit: 15504, gp: 34.0, returnQty: 44, netRevenue: 44280 },
  { item: "Full Cream Milk 4L", category: "Dairy", qtySold: 1244, revenue: 22392, cost: 15674, grossProfit: 6718, gp: 30.0, returnQty: 30, netRevenue: 21852 },
  { item: "Chicken Breast 1kg", category: "Meat", qtySold: 985, revenue: 39400, cost: 27580, grossProfit: 11820, gp: 30.0, returnQty: 25, netRevenue: 38400 },
  { item: "Olive Oil 500ml", category: "Cooking", qtySold: 680, revenue: 31280, cost: 21296, grossProfit: 9984, gp: 31.9, returnQty: 16, netRevenue: 30544 },
  { item: "Greek Yoghurt 500g", category: "Dairy", qtySold: 1089, revenue: 19602, cost: 13721, grossProfit: 5881, gp: 30.0, returnQty: 28, netRevenue: 19098 },
  { item: "Whole Wheat Bread", category: "Bakery", qtySold: 1640, revenue: 14760, cost: 9348, grossProfit: 5412, gp: 36.7, returnQty: 42, netRevenue: 14382 },
  { item: "Tomato Paste 400g", category: "Canned", qtySold: 2210, revenue: 19890, cost: 13523, grossProfit: 6367, gp: 32.0, returnQty: 53, netRevenue: 19413 },
  { item: "Cooking Oil 5L", category: "Cooking", qtySold: 548, revenue: 19728, cost: 13800, grossProfit: 5928, gp: 30.1, returnQty: 14, netRevenue: 19224 },
];

// Mock data for Category / Brand Sales
let mockCategoryData = [
  { category: "Dairy", brand: "Various", qtySold: 4580, salesValue: 82440, contribution: 18.6, returns: 1240, netSales: 81200, avgGP: 30.8 },
  { category: "Staples", brand: "Various", qtySold: 3820, salesValue: 114600, contribution: 25.9, returns: 1650, netSales: 112950, avgGP: 33.2 },
  { category: "Meat & Poultry", brand: "Various", qtySold: 1650, salesValue: 66000, contribution: 14.9, returns: 1000, netSales: 65000, avgGP: 30.5 },
  { category: "Beverages", brand: "Various", qtySold: 3200, salesValue: 38400, contribution: 8.7, returns: 580, netSales: 37820, avgGP: 28.4 },
  { category: "Cooking Essentials", brand: "Various", qtySold: 2410, salesValue: 72300, contribution: 16.3, returns: 920, netSales: 71380, avgGP: 31.2 },
  { category: "Bakery", brand: "Various", qtySold: 2840, salesValue: 25560, contribution: 5.8, returns: 380, netSales: 25180, avgGP: 36.5 },
  { category: "Canned & Preserved", brand: "Various", qtySold: 4120, salesValue: 37080, contribution: 8.4, returns: 620, netSales: 36460, avgGP: 32.1 },
  { category: "Snacks & Confectionery", brand: "Various", qtySold: 1850, salesValue: 7400, contribution: 1.7, returns: 140, netSales: 7260, avgGP: 38.0 },
];

// Mock data for Fast / Slow Moving Items
let mockFastSlowData = {
  fast: [
    { rank: 1, item: "Tomato Paste 400g", category: "Canned", salesFrequency: 2210, turnoverDays: 3.8, revenueContrib: 7.8, trend: "up" },
    { rank: 2, item: "Whole Wheat Bread", category: "Bakery", salesFrequency: 1640, turnoverDays: 4.2, revenueContrib: 5.6, trend: "up" },
    { rank: 3, item: "Full Cream Milk 4L", category: "Dairy", salesFrequency: 1244, turnoverDays: 5.1, revenueContrib: 8.5, trend: "stable" },
    { rank: 4, item: "Basmati Rice 5kg", category: "Staples", salesFrequency: 1520, turnoverDays: 5.6, revenueContrib: 17.7, trend: "up" },
    { rank: 5, item: "Greek Yoghurt 500g", category: "Dairy", salesFrequency: 1089, turnoverDays: 6.2, revenueContrib: 7.4, trend: "stable" },
  ],
  slow: [
    { rank: 1, item: "Specialty Pasta 500g", category: "Staples", salesFrequency: 28, turnoverDays: 124.5, lastSale: "2026-01-09", stockOnHand: 142, trend: "down" },
    { rank: 2, item: "Truffle Oil 250ml", category: "Cooking", salesFrequency: 14, turnoverDays: 248.3, lastSale: "2026-01-03", stockOnHand: 86, trend: "down" },
    { rank: 3, item: "Quinoa 500g", category: "Staples", salesFrequency: 36, turnoverDays: 96.8, lastSale: "2026-01-11", stockOnHand: 192, trend: "stable" },
    { rank: 4, item: "Organic Almond Milk 1L", category: "Dairy", salesFrequency: 22, turnoverDays: 158.7, lastSale: "2026-01-07", stockOnHand: 78, trend: "down" },
    { rank: 5, item: "Dried Cranberries 200g", category: "Snacks", salesFrequency: 19, turnoverDays: 184.1, lastSale: "2026-01-05", stockOnHand: 115, trend: "down" },
  ],
};

// Mock data for Discount Analysis
let mockDiscountData = [
  { cashier: "Ahmed Hassan", bills: 145, discountedBills: 62, discountAmount: 3840, discountPct: 8.5, maxBillDiscount: 225, avgDiscount: 61.9, salesWithDiscount: 42500 },
  { cashier: "Fatima Al Zaabi", bills: 132, discountedBills: 50, discountAmount: 2980, discountPct: 7.1, maxBillDiscount: 180, avgDiscount: 59.6, salesWithDiscount: 38200 },
  { cashier: "Mohammed Rashid", bills: 98, discountedBills: 55, discountAmount: 3250, discountPct: 10.7, maxBillDiscount: 342, avgDiscount: 59.1, salesWithDiscount: 28600 },
  { cashier: "Sara Abdullah", bills: 83, discountedBills: 38, discountAmount: 1840, discountPct: 7.4, maxBillDiscount: 148, avgDiscount: 48.4, salesWithDiscount: 22100 },
];

// Mock data for Promotion Impact
let mockPromotionData = [
  { promotionName: "Weekend Dairy Deal", type: "% Discount", period: "Jan 11-12", salesBefore: 18400, salesDuring: 24600, uplift: 33.7, discountCost: 1230, netMargin: 8.4 },
  { promotionName: "Buy 2 Get 1 Rice", type: "Free Issue", period: "Jan 10-16", salesBefore: 12800, salesDuring: 19200, uplift: 50.0, discountCost: 4200, netMargin: 12.1 },
  { promotionName: "Meat Monday", type: "Fixed Discount", period: "Jan 13", salesBefore: 8200, salesDuring: 11800, uplift: 43.9, discountCost: 590, netMargin: 27.4 },
  { promotionName: "Bakery Fresh 15% Off", type: "% Discount", period: "Jan 15-16", salesBefore: 4100, salesDuring: 5800, uplift: 41.5, discountCost: 870, netMargin: 34.2 },
];

// Mock data for Free Issue Scheme
let mockFreeIssueData = [
  { scheme: "Buy 2 Get 1 Rice", item: "Basmati Rice 5kg", triggerQty: 2, freeQty: 1, activatedTimes: 184, freeQtyIssued: 184, freeIssueCost: 5520, totalSales: 19200 },
  { scheme: "Dozen Egg Free Yoghurt", item: "Greek Yoghurt 500g", triggerQty: 12, freeQty: 1, activatedTimes: 96, freeQtyIssued: 96, freeIssueCost: 1728, totalSales: 14400 },
  { scheme: "Oil Bundle Promo", item: "Cooking Oil 5L", triggerQty: 4, freeQty: 1, activatedTimes: 42, freeQtyIssued: 42, freeIssueCost: 1512, totalSales: 8400 },
  { scheme: "Juice Multipack Deal", item: "Fresh Orange Juice 1L", triggerQty: 6, freeQty: 1, activatedTimes: 118, freeQtyIssued: 118, freeIssueCost: 1416, totalSales: 9440 },
];

// Mock data for Tax Summary
let mockTaxData = [
  { taxRate: "5% VAT Standard", taxableSales: 312400, taxAmount: 15620, exemptSales: 0, zeroRated: 0, netTaxPayable: 15620 },
  { taxRate: "0% Zero-Rated (Export)", taxableSales: 0, taxAmount: 0, exemptSales: 0, zeroRated: 28600, netTaxPayable: 0 },
  { taxRate: "Exempt (Basic Foods)", taxableSales: 0, taxAmount: 0, exemptSales: 56700, zeroRated: 0, netTaxPayable: 0 },
];

let mockVATOutputData = [
  { invoiceNo: "INV-2026-1842", date: "2026-01-16", customer: "Gulf Supermarket Chain", taxableAmt: 24800, vatRate: "5%", vatAmt: 1240, totalAmt: 26040, trn: "100234567890001" },
  { invoiceNo: "INV-2026-1841", date: "2026-01-16", customer: "Marina Retail Outlets", taxableAmt: 12400, vatRate: "5%", vatAmt: 620, totalAmt: 13020, trn: "100234567890008" },
  { invoiceNo: "INV-2026-1840", date: "2026-01-15", customer: "Al Khaleej Traders LLC", taxableAmt: 38600, vatRate: "5%", vatAmt: 1930, totalAmt: 40530, trn: "100234567890003" },
  { invoiceNo: "INV-2026-1839", date: "2026-01-15", customer: "Emirates Food Distributors", taxableAmt: 18200, vatRate: "5%", vatAmt: 910, totalAmt: 19110, trn: "100234567890005" },
  { invoiceNo: "INV-2026-1838", date: "2026-01-14", customer: "Downtown Corner Stores", taxableAmt: 9800, vatRate: "5%", vatAmt: 490, totalAmt: 10290, trn: "100234567890012" },
  { invoiceNo: "INV-2026-1837", date: "2026-01-14", customer: "Dubai Fresh Markets", taxableAmt: 31500, vatRate: "5%", vatAmt: 1575, totalAmt: 33075, trn: "100234567890007" },
];

// Mock data for Price Override Report
let mockPriceOverrideData = [
  { date: "2026-01-16", time: "10:22", item: "Basmati Rice 5kg", originalPrice: 30.00, newPrice: 25.00, change: -16.7, cashier: "Mohammed Rashid", approvedBy: "Manager Waleed", reason: "Customer negotiation", billNo: "POS-2026-4528" },
  { date: "2026-01-15", time: "14:18", item: "Olive Oil 500ml", originalPrice: 46.00, newPrice: 40.00, change: -13.0, cashier: "Ahmed Hassan", approvedBy: "Supervisor Ali", reason: "Loyalty customer", billNo: "POS-2026-4380" },
  { date: "2026-01-15", time: "09:44", item: "Chicken Breast 1kg", originalPrice: 40.00, newPrice: 36.00, change: -10.0, cashier: "Fatima Al Zaabi", approvedBy: "Manager Waleed", reason: "Bulk purchase", billNo: "POS-2026-4310" },
  { date: "2026-01-14", time: "16:30", item: "Full Cream Milk 4L", originalPrice: 18.00, newPrice: 16.50, change: -8.3, cashier: "Mohammed Rashid", approvedBy: "Supervisor Ali", reason: "Near expiry", billNo: "POS-2026-4245" },
  { date: "2026-01-13", time: "11:05", item: "Cooking Oil 5L", originalPrice: 36.00, newPrice: 32.00, change: -11.1, cashier: "Sara Abdullah", approvedBy: "Manager Waleed", reason: "VIP customer", billNo: "POS-2026-4180" },
];

// Mock data for Manual / Back-Dated Entries
let mockManualEntryData = [
  { entryNo: "ME-2026-0048", entryDate: "2026-01-16", postDate: "2026-01-14", user: "Waleed Ibrahim", type: "Sales Invoice", impact: 12400, reason: "Delayed system upload – offline sale", approvedBy: "CFO Hassan" },
  { entryNo: "ME-2026-0047", entryDate: "2026-01-15", postDate: "2026-01-12", user: "Noura Khalid", type: "Credit Note", impact: -3200, reason: "Return processed after month-end batch", approvedBy: "CFO Hassan" },
  { entryNo: "ME-2026-0046", entryDate: "2026-01-14", postDate: "2026-01-11", user: "Ahmed Faris", type: "Sales Invoice", impact: 8900, reason: "Van route offline trip", approvedBy: "Manager Waleed" },
  { entryNo: "ME-2026-0045", entryDate: "2026-01-13", postDate: "2026-01-10", user: "Waleed Ibrahim", type: "Journal Adjustment", impact: -1250, reason: "Writeoff correction", approvedBy: "CFO Hassan" },
];

// Mock data for Sales Edit Log
let mockEditLogData = [
  { editNo: "EDIT-2026-0128", date: "2026-01-16", time: "15:44", invoiceNo: "INV-2026-1838", user: "Waleed Ibrahim", field: "Payment Terms", before: "Net 30", after: "Net 45", reason: "Customer credit upgrade", approvedBy: "Manager Hassan" },
  { editNo: "EDIT-2026-0127", date: "2026-01-16", time: "11:22", invoiceNo: "INV-2026-1835", user: "Noura Khalid", field: "Unit Price – Rice 5kg", before: "AED 30.00", after: "AED 28.50", reason: "Agreed price adjustment", approvedBy: "Manager Hassan" },
  { editNo: "EDIT-2026-0126", date: "2026-01-15", time: "16:05", invoiceNo: "INV-2026-1824", user: "Ahmed Faris", field: "Delivery Date", before: "2026-01-18", after: "2026-01-20", reason: "Customer request", approvedBy: "Self" },
  { editNo: "EDIT-2026-0125", date: "2026-01-14", time: "10:48", invoiceNo: "INV-2026-1816", user: "Waleed Ibrahim", field: "Customer Name", before: "Jumeirah Store A", after: "Jumeirah Store B", reason: "Billing address correction", approvedBy: "Manager Hassan" },
  { editNo: "EDIT-2026-0124", date: "2026-01-13", time: "09:12", invoiceNo: "INV-2026-1808", user: "Noura Khalid", field: "Discount %", before: "5%", after: "8%", reason: "Retroactive promo applied", approvedBy: "Manager Hassan" },
];

// ── Valuation Method ────────────────────────────────────────────────────────

type ValuationMethod =
  | "average_cost"
  | "fifo"
  | "lifo"
  | "batch_cost"
  | "serial_cost"
  | "specific_id";

interface ValuationDef {
  id: ValuationMethod;
  label: string;
  short: string;
  description: string;
  /** Cost multiplier relative to Average Cost baseline */
  costFactor: number;
  optional?: boolean;
}

const VALUATION_METHODS: ValuationDef[] = [
  {
    id: "average_cost",
    label: "Average Cost",
    short: "AVG",
    description: "Weighted average of all units in stock",
    costFactor: 1.000,
  },
  {
    id: "fifo",
    label: "FIFO",
    short: "FIFO",
    description: "First-In First-Out — oldest stock consumed first",
    costFactor: 0.964,
  },
  {
    id: "batch_cost",
    label: "Batch Cost",
    short: "BATCH",
    description: "Cost tracked at the purchase batch / lot level",
    costFactor: 1.012,
  },
  {
    id: "serial_cost",
    label: "Serial Cost",
    short: "SERIAL",
    description: "Exact cost per serialised unit",
    costFactor: 1.021,
  },
  {
    id: "specific_id",
    label: "Specific Identification",
    short: "SPEC",
    description: "Actual cost of the exact item sold",
    costFactor: 0.988,
  },
  {
    id: "lifo",
    label: "LIFO",
    short: "LIFO",
    description: "Last-In First-Out — newest stock consumed first (optional)",
    costFactor: 1.038,
    optional: true,
  },
];

function ValuationSelector({
  value,
  onChange,
}: {
  value: ValuationMethod;
  onChange: (v: ValuationMethod) => void;
}) {
  const active = VALUATION_METHODS.find((m) => m.id === value)!;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mr-1">
          Cost Valuation
        </span>
        {VALUATION_METHODS.map((m) => {
          const isActive = m.id === value;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              title={m.description}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                isActive
                  ? "bg-[#F5C742] border-[#e4b82e] text-slate-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800"
              } ${m.optional ? "border-dashed" : ""}`}
            >
              {m.short}
              {m.optional && (
                <span className="text-[8px] opacity-60 ml-0.5">opt</span>
              )}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-slate-500 italic hidden sm:block">
          {active.description}
        </span>
      </div>
    </div>
  );
}

/** Apply valuation cost factor to a base cost value */
function applyValuation(baseCost: number, method: ValuationMethod): number {
  const factor = VALUATION_METHODS.find((m) => m.id === method)!.costFactor;
  return Math.round(baseCost * factor);
}

/** Recalculate GP and GP% after applying valuation to cost */
function recompute(revenue: number, baseCost: number, method: ValuationMethod) {
  const cost = applyValuation(baseCost, method);
  const gp = revenue - cost;
  const gpPct = revenue > 0 ? parseFloat(((gp / revenue) * 100).toFixed(1)) : 0;
  return { cost, gp, gpPct };
}

type ReportPayloadRow = Record<string, any>;

type SalesReportPayload = {
  rows?: ReportPayloadRow[];
  charts?: ReportPayloadRow[];
  cards?: ReportPayloadRow[];
  columns?: ReportPayloadRow[];
};

// Context that child report components subscribe to so they re-render when
// the parent fetches fresh data (dataRevision bump).
const DataRevisionContext = React.createContext(0);
function useDataRevision() { return React.useContext(DataRevisionContext); }

// ──────────────────────────────────────────────────────────────────────────
// Shared report view-model registry
//
// Single source of truth for "what is on screen". Every report component
// publishes the EXACT columns / rows / totals it renders into this registry
// via `useReportView`. Print, PDF and Excel then read the active report's
// view-model verbatim — no recalculation, grouping or filtering happens at
// export time, so Screen === Print === PDF === Excel by construction.
// ──────────────────────────────────────────────────────────────────────────

export type ReportColumnAlign = "left" | "right" | "center";

export interface ReportColumn {
  key: string;
  header: string;
  align?: ReportColumnAlign;
  /** Excel column width hint */
  width?: number;
}

export interface ReportSection {
  /** Optional sub-heading printed above the section table */
  title?: string;
  columns: ReportColumn[];
  /** Rows hold display-ready primitive values (already formatted strings or raw numbers) */
  rows: ReportPayloadRow[];
  /** Optional totals/subtotal row, keyed by column key. Printed verbatim — never recomputed. */
  totals?: ReportPayloadRow | null;
  /** Optional label for the first cell of the totals row when that column has no total value */
  totalsLabel?: string;
}

export interface ReportKpi {
  label: string;
  value: string;
  hint?: string;
}

export interface ReportViewModel {
  /** Sections render in order; most reports have exactly one. */
  sections: ReportSection[];
  /** Headline KPI figures shown on screen, mirrored into the document header strip. */
  kpis?: ReportKpi[];
  /** Free-form note printed under the title (e.g. valuation method, period label). */
  note?: string;
}

const reportViewModels = new Map<ReportId, ReportViewModel>();

function setReportView(reportId: ReportId, vm: ReportViewModel | null) {
  if (vm) reportViewModels.set(reportId, vm);
  else reportViewModels.delete(reportId);
}

function getReportView(reportId: ReportId): ReportViewModel | null {
  return reportViewModels.get(reportId) ?? null;
}

/**
 * Publishes a report's on-screen view-model to the shared registry on every
 * render. Writing during render (not in an effect) ensures the VM is current
 * before any user-triggered export click fires.
 */
function useReportView(reportId: ReportId, vm: ReportViewModel) {
  setReportView(reportId, vm);
}

/** Flattens a view-model into a single column set + row list for CSV/Excel. */
function flattenReportView(vm: ReportViewModel | null): {
  columns: ReportColumn[];
  rows: ReportPayloadRow[];
} {
  if (!vm || !vm.sections.length) return { columns: [], rows: [] };
  // Single-section reports export 1:1. Multi-section reports gain a leading
  // "Section" column so every row is unambiguous in a flat sheet.
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
      if (!seen.has(col.key)) {
        seen.add(col.key);
        columns.push(col);
      }
    })
  );
  const rows: ReportPayloadRow[] = [];
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

function rowsOf(data: SalesReportPayload | null): ReportPayloadRow[] {
  return Array.isArray(data?.rows) ? data.rows : [];
}

function chartRows(data: SalesReportPayload | null, title: string): ReportPayloadRow[] {
  const chart = data?.charts?.find((item) =>
    asText(item.title).toLowerCase().includes(title.toLowerCase())
  );
  return Array.isArray(chart?.data) ? chart.data : [];
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

function dateRangeLabel(rows: ReportPayloadRow[]): string {
  const dates = rows
    .map((row) => dateOnly(row.date))
    .filter(Boolean)
    .sort();
  if (!dates.length) return "Selected Period";
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? first : `${first} - ${last}`;
}

function timeOnly(value: any): string {
  const raw = asText(value);
  return raw.length > 15 ? raw.slice(11, 16) : "";
}

function pct(numerator: number, denominator: number): number {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function titleCaseStatus(value: any, fallback = ""): string {
  const raw = asText(value, fallback).replace(/_/g, " ").trim();
  if (!raw) return fallback;
  return raw.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function invoiceStatus(value: any): string {
  const raw = asText(value).toUpperCase();
  if (raw === "PAID") return "Paid";
  if (raw === "PARTIAL") return "Partial";
  if (raw === "OVERDUE") return "Overdue";
  if (raw === "UNPAID") return "Unpaid";
  if (raw === "CANCELLED") return "Cancelled";
  return titleCaseStatus(value, "Unpaid");
}

function orderStatus(value: any): string {
  const raw = asText(value).toUpperCase();
  if (raw === "FULLY_DELIVERED" || raw === "FULLY DELIVERED") return "Fully Delivered";
  if (raw === "PARTIAL") return "Partial";
  if (raw === "PENDING" || raw === "DRAFT") return "Pending";
  return titleCaseStatus(value, "Pending");
}

function deliveryStatus(value: any): string {
  const raw = asText(value).toUpperCase();
  if (raw === "DISPATCHED" || raw === "IN_TRANSIT") return "In Transit";
  return titleCaseStatus(value, "Delivered");
}

function returnStatus(value: any): string {
  const raw = asText(value).toUpperCase();
  if (raw === "DRAFT") return "Pending";
  return titleCaseStatus(value, "Pending");
}

function posStatus(value: any): string {
  const raw = asText(value).toUpperCase();
  if (raw === "CANCELLED" || raw === "VOIDED") return "Voided";
  if (raw === "RETURN") return "Return";
  return "Completed";
}

function sumRows(rows: ReportPayloadRow[], key: string): number {
  return rows.reduce((total, row) => total + n(row[key]), 0);
}

function groupBy(rows: ReportPayloadRow[], keyFn: (row: ReportPayloadRow) => string) {
  const grouped = new Map<string, ReportPayloadRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return grouped;
}

function applyLiveReportData(reportId: ReportId, data: SalesReportPayload | null) {
  if (!data) return;
  const rows = rowsOf(data);

  switch (reportId) {
    case "sales_summary": {
      // Extract authoritative totals from backend cards (Gross Sales, Net Sales, Gross Profit, VAT Collected)
      const cardMap: Record<string, number> = {};
      if (Array.isArray(data.cards)) {
        for (const c of data.cards as any[]) {
          if (c?.label) cardMap[String(c.label).toLowerCase().replace(/\s+/g, "_")] = n(c.value);
        }
      }
      mockSalesSummaryTotals = {
        grossSales: cardMap["gross_sales"] ?? 0,
        netSales: cardMap["net_sales"] ?? 0,
        grossProfit: cardMap["gross_profit"] ?? 0,
        tax: cardMap["vat_collected"] ?? 0,
        returns: 0, // derived below from row data
      };

      const source = chartRows(data, "Daily").length ? chartRows(data, "Daily") : rows;
      mockSalesSummaryData = source.map((row) => {
        const netSales = n(row.netSales);
        const grossProfit = n(row.grossProfit) || n(row.gp) || (n(row.gpPercent) / 100) * netSales;
        const cogs = n(row.cogs) || n(row.cost) || Math.max(0, netSales - grossProfit);
        return {
          date: dateOnly(row.date ?? row.customer, asText(row.customer, "N/A")),
          grossSales: n(row.grossSales) || n(row.totalSales) || netSales,
          returns: n(row.returns),
          discounts: n(row.discount) || n(row.discounts),
          netSales,
          tax: n(row.vat) || n(row.tax),
          cogs,
          grossProfit: grossProfit || Math.max(0, netSales - cogs),
          gp: n(row.gpPercent) || pct(grossProfit || Math.max(0, netSales - cogs), netSales),
        };
      });
      // Populate returns from row data since cards don't expose it separately
      mockSalesSummaryTotals.returns = mockSalesSummaryData.reduce((s, d) => s + d.returns, 0);
      break;
    }
    case "daily_sales": {
      const gross = sumRows(rows, "grossSales");
      const returns = sumRows(rows, "returns");
      const discounts = sumRows(rows, "discount");
      const netSales = sumRows(rows, "netSales");
      const vat = sumRows(rows, "vat");
      const collected = sumRows(rows, "collected");
      const outstanding = sumRows(rows, "outstanding");
      const paymentChart = chartRows(data, "Payment");
      const salesPayments = paymentChart.length
        ? paymentChart.map((row) => ({
            mode: asText(row.name ?? row.paymentMode ?? row.mode, "Unspecified"),
            amount: n(row.value ?? row.amount ?? row.netAmount),
          }))
        : [
            { mode: "Collected", amount: collected },
            { mode: "Outstanding", amount: outstanding },
          ];
      const periodDate = new Date().toISOString().split("T")[0];

      mockDailySalesData = {
        date: periodDate,
        branch: "All Branches",
        preparedBy: "System",
        approvedBy: "",
        shift: "Selected period",
        openingBalances: [],
        posSales: 0,
        vanSales: 0,
        backOfficeSales: gross,
        totalGrossSales: gross,
        salesReturns: returns,
        discounts,
        netSales,
        vatOnSales: vat,
        salesPayments,
        totalPurchases: 0,
        purchaseReturns: 0,
        netPurchases: 0,
        vatOnPurchases: 0,
        purchasePayments: [],
        totalExpenses: 0,
        expensePayments: [],
        salesReturnLines: returns
          ? [{ ref: "SALES-RETURNS", customer: "Selected period", items: rows.length, amount: returns, mode: "Total" }]
          : [],
        purchaseReturnLines: [],
        soAdvances: [],
        lpoAdvances: [],
        salaryAdvances: [],
        otherReceipts: [],
        otherPayments: [],
        customerReceipts: collected
          ? [{ ref: "COLLECTED", customer: "Selected period", mode: "Mixed", amount: collected }]
          : [],
        vendorPayments: [],
        cashAccounts: [],
        bankAccounts: outstanding
          ? [{ bank: "Outstanding receivables", opening: 0, receipts: collected, payments: 0, closing: outstanding }]
          : [],
      };
      break;
    }
    case "channel_wise":
      mockChannelSalesData = rows.map((row) => ({
        channel: asText(row.channel, "Unspecified"),
        transactions: n(row.transactions),
        salesValue: n(row.salesValue),
        avgBill: n(row.avgBill),
        discountPct: pct(n(row.discount), n(row.salesValue)),
        returnPct: 0,
      }));
      break;
    case "customer_sales_summary":
      mockCustomerSalesData = rows.map((row) => ({
        customer: asText(row.customer, "Walk-in"),
        totalSales: n(row.totalSales) || n(row.grossSales),
        returns: n(row.returns),
        netSales: n(row.netSales),
        outstanding: n(row.outstanding),
        creditLimit: n(row.creditLimit),
        utilization: n(row.utilization) || pct(n(row.outstanding), n(row.creditLimit)),
      }));
      break;
    case "pos_cashier_performance":
      mockCashierPerformanceData = rows.map((row) => ({
        cashier: asText(row.cashier, "Unassigned"),
        bills: n(row.bills),
        totalSales: n(row.sales),
        avgBill: n(row.avgBill),
        discountPct: n(row.discountPct) || pct(n(row.discount), n(row.sales)),
        voidCount: n(row.voids),
        returnCount: n(row.returns),
        variance: n(row.variance),
      }));
      break;
    case "pos_transaction":
      mockPOSTransactionData = rows.map((row) => {
        const amount = n(row.amount);
        const tax = n(row.tax);
        const discount = n(row.discount);
        return {
          billNo: asText(row.billNo, "N/A"),
          date: dateOnly(row.date),
          time: timeOnly(row.date),
          cashier: asText(row.cashier, "Unassigned"),
          customer: asText(row.customer, "Walk-in"),
          items: n(row.items),
          grossAmt: Math.max(0, amount + discount - tax),
          discount,
          tax,
          netAmt: amount,
          payMode: asText(row.paymentMode, "Unspecified"),
          status: posStatus(row.status),
        };
      });
      break;
    case "pos_item_sales":
      mockPOSItemSalesData = rows.map((row) => {
        const net = n(row.netRevenue);
        const returns = n(row.returns);
        return {
          itemCode: asText(row.itemCode ?? row.sku ?? row.item, "N/A"),
          itemName: asText(row.item, "N/A"),
          category: asText(row.category, "Uncategorized"),
          qtyOrdered: n(row.qtySold) + returns,
          qtySold: n(row.qtySold),
          returns,
          grossAmt: net,
          discount: n(row.discount),
          netAmt: net,
          contribution: n(row.gpPercent) || pct(n(row.grossProfit), net),
        };
      });
      break;
    case "pos_payment_mode": {
      const total = sumRows(rows, "netAmount");
      mockPOSPaymentData = rows.map((row) => ({
        mode: asText(row.paymentMode, "Unspecified"),
        transactions: n(row.bills),
        amount: n(row.grossSales),
        refunds: n(row.refunds),
        netAmount: n(row.netAmount),
        pct: pct(n(row.netAmount), total),
      }));
      break;
    }
    case "pos_void_cancellation":
      mockVoidData = rows.map((row) => ({
        billNo: asText(row.billNo, "N/A"),
        date: dateOnly(row.date),
        time: timeOnly(row.date),
        cashier: asText(row.cashier, "Unassigned"),
        value: n(row.value),
        reason: asText(row.reason, "Cancelled POS bill"),
        approvedBy: asText(row.approvedBy, "Pending review"),
        status: titleCaseStatus(row.status, "Cancelled"),
      }));
      break;
    case "van_sales_summary":
      mockVANSalesSummaryData = rows.map((row) => ({
        route: asText(row.route, "Route"),
        salesperson: asText(row.salesperson ?? row.route, "Unassigned"),
        visits: n(row.visits),
        actualVisits: n(row.actualVisits) || n(row.visits),
        stockIssued: n(row.stockIssued),
        stockSold: n(row.stockSold) || n(row.netSales),
        returns: n(row.returns),
        netSales: n(row.netSales),
        collection: n(row.collection),
      }));
      break;
    case "van_item_sales":
      mockVANItemData = rows.map((row) => ({
        item: asText(row.item, "N/A"),
        route: asText(row.route, "All Routes"),
        qtySold: n(row.qtySold),
        qtyReturned: n(row.returns),
        freeIssue: n(row.freeIssue),
        netQty: n(row.netQty) || n(row.qtySold) - n(row.returns) + n(row.freeIssue),
        value: n(row.netRevenue),
      }));
      break;
    case "van_route_performance":
      mockVANRouteData = rows.map((row) => ({
        route: asText(row.route, "Route"),
        planned: n(row.planned),
        actual: n(row.actual),
        conversion: n(row.conversion),
        salesTarget: n(row.salesTarget),
        salesActual: n(row.salesActual),
        collection: n(row.collection),
        outstanding: n(row.outstanding),
      }));
      break;
    case "van_collection":
      mockVANCollectionData = rows.map((row) => ({
        salesperson: asText(row.salesperson, "Unassigned"),
        route: asText(row.route, "Route"),
        cashCollected: n(row.cash),
        cardCollected: n(row.card),
        creditSales: n(row.creditSales),
        totalCollected: n(row.totalCollected),
        pending: n(row.pending),
        variance: n(row.variance),
      }));
      break;
    case "van_stock_variance":
      mockVANStockData = rows.map((row) => ({
        salesperson: asText(row.salesperson, "Unassigned"),
        route: asText(row.route, "Route"),
        issued: n(row.issued),
        sold: n(row.sold),
        returned: n(row.returned),
        expected: n(row.expectedBalance ?? row.expected),
        actual: n(row.actualBalance ?? row.actual),
        variance: n(row.variance),
      }));
      break;
    case "sales_invoice_register":
      mockInvoiceRegisterData = rows.map((row) => ({
        invoiceNo: asText(row.invoiceNo, "N/A"),
        date: dateOnly(row.date),
        customer: asText(row.customer, "Walk-in"),
        salesperson: asText(row.salesperson, "Unassigned"),
        amount: n(row.amount),
        tax: n(row.tax),
        total: n(row.total),
        status: invoiceStatus(row.status),
        outstanding: n(row.outstanding),
        dueDate: dateOnly(row.dueDate),
      }));
      break;
    case "sales_order_status":
      mockOrderStatusData = rows.map((row) => ({
        orderNo: asText(row.orderNo, "N/A"),
        date: dateOnly(row.date),
        customer: asText(row.customer, "Walk-in"),
        orderedQty: n(row.orderedQty),
        deliveredQty: n(row.deliveredQty ?? row.delivered),
        pendingQty: n(row.pendingQty ?? row.pending),
        orderedValue: n(row.orderedValue ?? row.orderValue),
        deliveredValue: n(row.deliveredValue),
        status: orderStatus(row.status),
      }));
      break;
    case "delivery_dispatch":
      mockDeliveryData = rows.map((row) => ({
        dnNo: asText(row.dnNo, "N/A"),
        date: dateOnly(row.date),
        customer: asText(row.customer, "Walk-in"),
        driver: asText(row.driver, "Unassigned"),
        vehicle: asText(row.vehicle, "N/A"),
        items: n(row.items),
        weight: `${n(row.qty)} qty`,
        status: deliveryStatus(row.status),
        pod: asText(row.pod, "Pending"),
        deliveredAt: timeOnly(row.deliveredAt) || dateOnly(row.deliveredAt, "-"),
      }));
      break;
    case "credit_note_returns":
      mockCreditNoteData = rows.map((row) => ({
        cnNo: asText(row.cnNo ?? row.returnNo, "N/A"),
        date: dateOnly(row.date),
        customer: asText(row.customer, "Walk-in"),
        linkedInvoice: asText(row.linkedInvoice, "N/A"),
        reason: asText(row.reason, "Return"),
        items: n(row.items),
        returnValue: n(row.returnValue),
        tax: n(row.tax),
        total: n(row.total),
        status: returnStatus(row.status),
      }));
      break;
    case "customer_aging":
      mockAgingData = rows.map((row) => ({
        customer: asText(row.customer, "Walk-in"),
        creditLimit: n(row.creditLimit),
        current: n(row.current),
        days30: n(row.days30),
        days60: n(row.days60),
        days90: n(row.days90),
        over90: n(row.over90 ?? row.daysOver90),
        total: n(row.total),
        riskLevel: asText(row.riskLevel ?? row.risk, "Low"),
      }));
      break;
    case "top_dormant_customers": {
      const top = rows
        .filter((row) => asText(row.status).toLowerCase() !== "dormant")
        .slice(0, 5)
        .map((row, index) => ({
          rank: index + 1,
          customer: asText(row.customer, "Walk-in"),
          transactions: n(row.transactions) || 0,
          netSales: n(row.netSales),
          lastPurchase: dateOnly(row.lastPurchase),
          avgBill: n(row.avgBill) || n(row.netSales),
          growth: n(row.growth),
        }));
      const dormant = rows
        .filter((row) => asText(row.status).toLowerCase() !== "active")
        .map((row) => ({
          customer: asText(row.customer, "Walk-in"),
          lastPurchase: dateOnly(row.lastPurchase),
          daysSince: n(row.daysSince),
          historicalSales: n(row.netSales),
          status: asText(row.status, "Watch") === "Dormant" ? "At Risk" : asText(row.status, "Watch"),
        }));
      mockTopDormantData = { top, dormant };
      break;
    }
    case "customer_price_level":
      mockPriceLevelData = rows.map((row) => ({
        customer: asText(row.customer, "Walk-in"),
        priceLevel: asText(row.priceLevel, "Standard"),
        discountPct: n(row.discountPercent ?? row.discountPct),
        creditDays: n(row.creditDays),
        minOrderValue: n(row.minOrderValue ?? row.creditLimit),
        specialItems: n(row.specialItems),
        marginImpact: n(row.marginImpact),
      }));
      break;
    case "customer_profit_drilldown":
      mockProfitDrilldownData = profitRowsToTree(rows);
      break;
    case "item_wise_sales":
      mockItemWiseSalesData = rows.map((row) => ({
        item: asText(row.item, "N/A"),
        category: asText(row.category, "Uncategorized"),
        qtySold: n(row.qtySold),
        revenue: n(row.revenue) || n(row.netRevenue) + n(row.returnsValue),
        cost: n(row.cost),
        grossProfit: n(row.grossProfit),
        gp: n(row.gpPercent) || pct(n(row.grossProfit), n(row.netRevenue)),
        returnQty: n(row.returnQty ?? row.returns),
        netRevenue: n(row.netRevenue),
      }));
      break;
    case "category_brand_sales":
      mockCategoryData = rows.map((row) => ({
        category: asText(row.category, "Uncategorized"),
        brand: asText(row.brand, "Various"),
        qtySold: n(row.qtySold),
        salesValue: n(row.salesValue),
        contribution: n(row.contribution ?? row.contrib),
        returns: n(row.returns),
        netSales: n(row.netSales),
        avgGP: n(row.avgGP ?? row.avgGp),
      }));
      break;
    case "fast_slow_moving": {
      const fastRows = rows.filter((row) => asText(row.stockSignal).toLowerCase() !== "slow").slice(0, 5);
      const slowRows = rows.filter((row) => asText(row.stockSignal).toLowerCase() === "slow").slice(0, 5);
      mockFastSlowData = {
        fast: fastRows.map((row, index) => ({
          rank: index + 1,
          item: asText(row.item, "N/A"),
          category: asText(row.category, "Uncategorized"),
          salesFrequency: n(row.qtySold),
          turnoverDays: n(row.turnoverDays),
          revenueContrib: n(row.revenueContrib),
          trend: "stable",
        })),
        slow: slowRows.map((row, index) => ({
          rank: index + 1,
          item: asText(row.item, "N/A"),
          category: asText(row.category, "Uncategorized"),
          salesFrequency: n(row.qtySold),
          turnoverDays: n(row.turnoverDays),
          lastSale: dateOnly(row.lastSale),
          stockOnHand: n(row.stockOnHand),
          trend: "down",
        })),
      };
      break;
    }
    case "discount_analysis": {
      const grouped = groupBy(rows, (row) => asText(row.salesperson ?? row.cashier, "Unassigned"));
      mockDiscountData = Array.from(grouped.entries()).map(([cashier, cashierRows]) => {
        const discountAmount = sumRows(cashierRows, "discount");
        const salesWithDiscount = sumRows(cashierRows, "netSales") || sumRows(cashierRows, "grossSales");
        return {
          cashier,
          bills: cashierRows.length,
          discountedBills: cashierRows.filter((row) => n(row.discount) > 0).length,
          discountAmount,
          discountPct: pct(discountAmount, salesWithDiscount),
          maxBillDiscount: Math.max(0, ...cashierRows.map((row) => n(row.discount))),
          avgDiscount: cashierRows.length ? discountAmount / cashierRows.length : 0,
          salesWithDiscount,
        };
      });
      break;
    }
    case "promotion_impact":
      mockPromotionData = rows.map((row) => ({
        promotionName: asText(row.item ?? row.promotionName, "Promotion"),
        type: "Discount",
        period: asText(row.invoiceNo ?? row.period, dateOnly(row.date)),
        salesBefore: 0,
        salesDuring: n(row.netSales),
        uplift: 0,
        discountCost: n(row.discount),
        netMargin: n(row.gpPercent),
      }));
      break;
    case "free_issue_scheme":
      mockFreeIssueData = rows.map((row) => ({
        scheme: asText(row.scheme, "Free issue"),
        item: asText(row.item, "N/A"),
        triggerQty: n(row.triggerQty) || 1,
        freeQty: n(row.freeQty) || n(row.freeIssueQty),
        activatedTimes: n(row.activatedTimes) || 1,
        freeQtyIssued: n(row.freeQtyIssued) || n(row.freeIssueQty),
        freeIssueCost: n(row.freeIssueCost),
        totalSales: n(row.totalSales) || n(row.netSales),
      }));
      break;
    case "tax_summary": {
      const standard = rows.find((row) => n(row.rate) > 0) || {};
      const zero = rows.find((row) => n(row.rate) === 0 && asText(row.status).toLowerCase().includes("zero")) || {};
      const exempt = rows.find((row) => asText(row.status).toLowerCase().includes("exempt")) || {};
      const adjustment = rows.find((row) => asText(row.status).toLowerCase().includes("adjustment")) || {};
      mockTaxData = [
        {
          taxRate: asText(standard.name, "5% VAT Standard"),
          taxableSales: n(standard.taxableAmount),
          taxAmount: n(standard.vatAmount),
          exemptSales: 0,
          zeroRated: 0,
          netTaxPayable: n(standard.vatAmount) + n(adjustment.vatAmount),
        },
        {
          taxRate: asText(zero.name, "0% Zero-Rated"),
          taxableSales: 0,
          taxAmount: 0,
          exemptSales: 0,
          zeroRated: n(zero.taxableAmount),
          netTaxPayable: 0,
        },
        {
          taxRate: asText(exempt.name, "Exempt"),
          taxableSales: 0,
          taxAmount: 0,
          exemptSales: n(exempt.taxableAmount),
          zeroRated: 0,
          netTaxPayable: 0,
        },
      ];
      break;
    }
    case "vat_output_register":
      mockVATOutputData = rows.map((row) => ({
        invoiceNo: asText(row.invoiceNo, "N/A"),
        date: dateOnly(row.date),
        customer: asText(row.customer, "Walk-in"),
        taxableAmt: n(row.taxableAmount),
        vatRate: `${n(row.vatRate)}%`,
        vatAmt: n(row.vatAmount),
        totalAmt: n(row.total),
        trn: asText(row.trn, ""),
      }));
      break;
    case "price_override":
      mockPriceOverrideData = rows.map((row) => ({
        date: dateOnly(row.date),
        time: timeOnly(row.date),
        item: asText(row.item, "N/A"),
        originalPrice: n(row.originalPrice),
        newPrice: n(row.newPrice),
        change: n(row.changePercent ?? row.change),
        cashier: asText(row.salesperson ?? row.cashier, "Unassigned"),
        approvedBy: asText(row.approvedBy, "Pending review"),
        reason: asText(row.reason, "Price override"),
        billNo: asText(row.billNo, "N/A"),
      }));
      break;
    case "manual_entry":
      mockManualEntryData = rows.map((row) => ({
        entryNo: asText(row.entryNo, "N/A"),
        entryDate: dateOnly(row.entryDate),
        postDate: dateOnly(row.postDate),
        user: asText(row.user, "Unassigned"),
        type: asText(row.type, "Sales Invoice"),
        impact: n(row.impact),
        reason: asText(row.reason, "Audit entry"),
        approvedBy: asText(row.approvedBy, "Pending review"),
      }));
      break;
    case "sales_edit_log":
      mockEditLogData = rows.map((row) => ({
        editNo: asText(row.editNo, "N/A"),
        date: dateOnly(row.dateTime ?? row.date),
        time: timeOnly(row.dateTime ?? row.date),
        invoiceNo: asText(row.invoiceNo, "N/A"),
        user: asText(row.user, "Unassigned"),
        field: asText(row.fieldChanged ?? row.field, "Field"),
        before: asText(row.before, ""),
        after: asText(row.after, ""),
        reason: asText(row.reason, "Audit event"),
        approvedBy: asText(row.approvedBy, "Audit"),
      }));
      break;
  }
}

function profitRowsToTree(rows: ReportPayloadRow[]): ProfitCustomer[] {
  const customerGroups = groupBy(rows, (row) => asText(row.customer, "Walk-in"));
  return Array.from(customerGroups.entries()).map(([customerName, customerRows], customerIndex) => {
    const billGroups = groupBy(customerRows, (row) => asText(row.invoiceNo, "N/A"));
    const bills: ProfitBill[] = Array.from(billGroups.entries()).map(([billNo, billRows]) => {
      const items: ProfitItem[] = billRows.map((row) => {
        const qty = Math.max(1, n(row.qty));
        const netSales = n(row.netSales);
        const cost = n(row.cost);
        const gp = n(row.grossProfit) || netSales - cost;
        return {
          itemCode: asText(row.itemCode ?? row.item, "N/A"),
          itemName: asText(row.item, "N/A"),
          category: asText(row.category, "Uncategorized"),
          qty,
          unitPrice: netSales / qty,
          unitCost: cost / qty,
          discount: n(row.discount),
          lineTotal: netSales,
          lineCost: cost,
          lineGP: gp,
          gpPct: n(row.gpPercent) || pct(gp, netSales),
        };
      });
      const grossTotal = items.reduce((total, item) => total + item.lineTotal + item.discount, 0);
      const discount = items.reduce((total, item) => total + item.discount, 0);
      const netTotal = items.reduce((total, item) => total + item.lineTotal, 0);
      const totalCost = items.reduce((total, item) => total + item.lineCost, 0);
      const grossProfit = netTotal - totalCost;
      return {
        billNo,
        date: dateOnly(billRows[0]?.date),
        channel: asText(billRows[0]?.channel, "Back-Office"),
        salesperson: asText(billRows[0]?.salesperson, "Unassigned"),
        grossTotal,
        discount,
        netTotal,
        totalCost,
        grossProfit,
        gpPct: pct(grossProfit, netTotal),
        items,
      };
    });
    const grossSales = bills.reduce((total, bill) => total + bill.grossTotal, 0);
    const totalDiscount = bills.reduce((total, bill) => total + bill.discount, 0);
    const netSales = bills.reduce((total, bill) => total + bill.netTotal, 0);
    const totalCost = bills.reduce((total, bill) => total + bill.totalCost, 0);
    const grossProfit = netSales - totalCost;
    return {
      customerId: `CUS-LIVE-${customerIndex + 1}`,
      customerName,
      priceLevel: asText(customerRows[0]?.priceLevel, "Standard"),
      totalBills: bills.length,
      grossSales,
      totalDiscount,
      netSales,
      totalCost,
      grossProfit,
      gpPct: pct(grossProfit, netSales),
      bills,
    };
  });
}

function getCurrentExportRows(reportId: ReportId): ReportPayloadRow[] {
  switch (reportId) {
    case "sales_summary": return mockSalesSummaryData;
    case "daily_sales":
      return [
        { metric: "Total Gross Sales", value: mockDailySalesData.totalGrossSales },
        { metric: "Sales Returns", value: mockDailySalesData.salesReturns },
        { metric: "Discounts", value: mockDailySalesData.discounts },
        { metric: "Net Sales", value: mockDailySalesData.netSales },
        { metric: "VAT On Sales", value: mockDailySalesData.vatOnSales },
        ...mockDailySalesData.salesPayments.map((row: any) => ({ metric: `Payment - ${row.mode}`, value: row.amount })),
      ];
    case "channel_wise": return mockChannelSalesData;
    case "customer_sales_summary": return mockCustomerSalesData;
    case "pos_cashier_performance": return mockCashierPerformanceData;
    case "pos_transaction": return mockPOSTransactionData;
    case "pos_item_sales": return mockPOSItemSalesData;
    case "pos_payment_mode": return mockPOSPaymentData;
    case "pos_void_cancellation": return mockVoidData;
    case "van_sales_summary": return mockVANSalesSummaryData;
    case "van_item_sales": return mockVANItemData;
    case "van_route_performance": return mockVANRouteData;
    case "van_collection": return mockVANCollectionData;
    case "van_stock_variance": return mockVANStockData;
    case "sales_invoice_register": return mockInvoiceRegisterData;
    case "sales_order_status": return mockOrderStatusData;
    case "delivery_dispatch": return mockDeliveryData;
    case "credit_note_returns": return mockCreditNoteData;
    case "customer_aging": return mockAgingData;
    case "top_dormant_customers": return [...mockTopDormantData.top, ...mockTopDormantData.dormant];
    case "customer_price_level": return mockPriceLevelData;
    case "customer_profit_drilldown":
      return mockProfitDrilldownData.flatMap((customer) =>
        customer.bills.flatMap((bill) =>
          bill.items.map((item) => ({
            customer: customer.customerName,
            billNo: bill.billNo,
            date: bill.date,
            item: item.itemName,
            qty: item.qty,
            netSales: item.lineTotal,
            cost: item.lineCost,
            grossProfit: item.lineGP,
            gpPct: item.gpPct,
          }))
        )
      );
    case "item_wise_sales": return mockItemWiseSalesData;
    case "category_brand_sales": return mockCategoryData;
    case "fast_slow_moving": return [...mockFastSlowData.fast, ...mockFastSlowData.slow];
    case "discount_analysis": return mockDiscountData;
    case "promotion_impact": return mockPromotionData;
    case "free_issue_scheme": return mockFreeIssueData;
    case "tax_summary": return mockTaxData;
    case "vat_output_register": return mockVATOutputData;
    case "price_override": return mockPriceOverrideData;
    case "manual_entry": return mockManualEntryData;
    case "sales_edit_log": return mockEditLogData;
    default: return [];
  }
}

function downloadCsv(title: string, rows: ReportPayloadRow[]) {
  if (!rows.length) return;
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const escape = (value: any) => {
    const text = typeof value === "object" && value !== null ? JSON.stringify(value) : asText(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sales-report"}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toBackendSalesChannel(channel: string): string {
  if (channel === "POS") return "POS Sale";
  if (channel === "Back-Office") return "Back-Office";
  return "All";
}

interface SalesReportsProps {
  onNavigate?: (section: string) => void;
}

export function SalesReports({ onNavigate }: SalesReportsProps) {
  const { activeBranchId, isAllBranches } = useBranch();
  const [activeReport, setActiveReport] = useState<ReportId>("sales_summary");
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [dataRevision, setDataRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<ReportGroupId, boolean>>({
    summary: true,
    pos: true,
    van: false,
    backoffice: false,
    customer: false,
    item: false,
    discount: false,
    tax: false,
    audit: false,
  });

  // Filters — default to current month
  const _today = new Date();
  const _firstOfMonth = new Date(_today.getFullYear(), _today.getMonth(), 1).toISOString().split("T")[0];
  const _todayStr = _today.toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(_firstOfMonth);
  const [dateTo, setDateTo] = useState(_todayStr);
  const [branch, setBranch] = useState<string>(() =>
    isAllBranches || !activeBranchId || activeBranchId === "ALL" ? "All" : String(activeBranchId)
  );
  const [channel, setChannel] = useState("All");
  const [cashier, setCashier] = useState("All");
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [salespersons, setSalespersons] = useState<string[]>([]);
  const [cashierSearch, setCashierSearch] = useState("");
  const [cashierOpen, setCashierOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    getCompanyProfile().then((res) => setCompanyProfile(res.data)).catch(() => {});
    getBranches()
      .then((data: any[]) => setBranches(data.filter((b: any) => b.isActive !== false)))
      .catch(() => {});
    getSalesReportSalespersons()
      .then((data: string[]) => setSalespersons(data))
      .catch(() => {});
  }, []);

  // Sync branch filter when the sidebar branch selector changes
  useEffect(() => {
    setBranch(
      isAllBranches || !activeBranchId || activeBranchId === "ALL"
        ? "All"
        : String(activeBranchId)
    );
  }, [activeBranchId, isAllBranches]);

  const activeDef = useMemo(
    () => REPORTS.find((r) => r.id === activeReport)!,
    [activeReport]
  );

  const groupMeta: Record<
    ReportGroupId,
    { label: string; icon: React.ReactNode }
  > = {
    summary: { label: "Sales Summary & Financial", icon: <BarChart3 className="h-4 w-4" /> },
    pos: { label: "POS Sales Reports", icon: <Store className="h-4 w-4" /> },
    van: { label: "VAN / Route Sales", icon: <Truck className="h-4 w-4" /> },
    backoffice: { label: "Back-Office Sales", icon: <Package className="h-4 w-4" /> },
    customer: { label: "Customer-Centric Reports", icon: <Users className="h-4 w-4" /> },
    item: { label: "Item & Category Performance", icon: <ShoppingCart className="h-4 w-4" /> },
    discount: { label: "Discount & Promotion", icon: <Tag className="h-4 w-4" /> },
    tax: { label: "Tax & Compliance", icon: <Shield className="h-4 w-4" /> },
    audit: { label: "Audit & Control", icon: <AlertTriangle className="h-4 w-4" /> },
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
      summary: [],
      pos: [],
      van: [],
      backoffice: [],
      customer: [],
      item: [],
      discount: [],
      tax: [],
      audit: [],
    };
    for (const r of filteredReports) byGroup[r.group].push(r);
    return byGroup;
  }, [filteredReports]);

  async function loadReport(signal?: AbortSignal, clearFirst = false) {
    if (clearFirst) {
      applyLiveReportData(activeReport, { rows: [], charts: [] });
      setDataRevision((value) => value + 1);
    }
    setIsLoading(true);
    try {
      const data = await getSalesReportData(activeReport, {
        dateFrom,
        dateTo,
        branchId: branch,
        salesChannel: toBackendSalesChannel(channel),
        salesperson: cashier,
        valuationMethod: "average_cost",
        searchQuery: searchText,
      }, signal);
      if (!data) return;
      applyLiveReportData(activeReport, data);
      setDataRevision((value) => value + 1);
    } catch (error) {
      console.error("Unable to load sales report data", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setReportView(activeReport, null);
    // Clear data when switching reports so stale data from the previous report doesn't appear
    loadReport(controller.signal, true);
    return () => controller.abort();
  }, [activeReport]);

  const branchLabel = useMemo(() => {
    if (branch === "All" || branch === "ALL") return "All";
    const match = branches.find((b) => String(b.id) === String(branch));
    return match ? match.name : "All";
  }, [branch, branches]);

  // Filters actually applied — shown in report header + passed to every export.
  function appliedFilters() {
    return [
      { label: "Date From", value: dateFrom },
      { label: "Date To", value: dateTo },
      { label: "Branch", value: branchLabel },
      { label: "Sales Channel", value: channel },
      { label: "Cashier / Salesperson", value: cashier },
      { label: "Search", value: searchText },
    ].filter((f) => f.value && f.value !== "All");
  }

  // Single source of truth for exports: the exact view-model the screen rendered.
  // Falls back to the raw row dump only if a report has not registered a VM.
  function getActiveViewModel(): { reportTitle: string } & ReportViewModel {
    const vm = getReportView(activeReport);
    if (vm) return { reportTitle: activeDef.label, ...vm };
    const rows = getCurrentExportRows(activeReport);
    const columns: ReportColumn[] = rows.length
      ? Object.keys(rows[0]).map((key) => ({
          key,
          header: key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase()).trim(),
          align: typeof rows[0][key] === "number" ? "right" : "left",
          width: 18,
        }))
      : [];
    return { reportTitle: activeDef.label, sections: [{ columns, rows }] };
  }

  function exportMeta() {
    return {
      reportTitle: activeDef.label,
      dateFrom,
      dateTo,
      branch: branchLabel,
      filters: appliedFilters(),
      companyProfile,
    };
  }

  function fileBase() {
    return activeDef.label.replace(/\s+/g, "_");
  }

  async function handleExportPdf() {
    const vm = getActiveViewModel();
    const html = generateReportA4Html(vm, companyProfile || {}, exportMeta());
    const company = companyProfile?.companyName || companyProfile?.name || "BillBull ERP";
    await downloadPdf(html, fileBase(), `Generated by ${company}  |  ${new Date().toLocaleString()}  |  Confidential`);
  }

  function handleExportExcel() {
    const vm = getActiveViewModel();
    const { columns, rows } = flattenReportView(vm);
    exportToExcel(rows, columns, fileBase(), exportMeta());
  }

  function handlePrint() {
    const vm = getActiveViewModel();
    const html = generateReportA4Html(vm, companyProfile || {}, exportMeta());
    printHtml(html);
  }

  function handleDownloadCsv() {
    const vm = getActiveViewModel();
    const { rows } = flattenReportView(vm);
    downloadCsv(activeDef.label, rows);
  }

  function handleReportAction(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    const label = (button.textContent || "").trim().toLowerCase();
    if (label === "pdf" || label === "print" || label === "excel" || label === "export" || label.includes("download")) return;
    if (label.includes("export")) {
      event.preventDefault();
      handleExportExcel();
    }
  }

  function renderResults() {
    switch (activeReport) {
      case "sales_summary": return <SalesSummaryReport />;
      case "daily_sales": return <DailySalesReport />;
      case "channel_wise": return <ChannelWiseReport />;
      case "customer_sales_summary": return <CustomerSalesSummaryReport />;
      case "pos_cashier_performance": return <CashierPerformanceReport />;
      case "pos_transaction": return <POSTransactionReport />;
      case "pos_item_sales": return <POSItemSalesReport />;
      case "pos_payment_mode": return <POSPaymentModeReport />;
      case "pos_void_cancellation": return <POSVoidReport />;
      case "van_sales_summary": return <VANSalesSummaryReport />;
      case "van_item_sales": return <VANItemSalesReport />;
      case "van_route_performance": return <VANRoutePerformanceReport />;
      case "van_collection": return <VANCollectionReport />;
      case "van_stock_variance": return <VANStockVarianceReport />;
      case "sales_invoice_register": return <SalesInvoiceRegisterReport />;
      case "sales_order_status": return <SalesOrderStatusReport />;
      case "delivery_dispatch": return <DeliveryDispatchReport />;
      case "credit_note_returns": return <CreditNoteReturnsReport />;
      case "customer_aging": return <CustomerAgingReport />;
      case "top_dormant_customers": return <TopDormantCustomersReport />;
      case "customer_price_level": return <CustomerPriceLevelReport />;
      case "customer_profit_drilldown": return <CustomerProfitDrilldownReport />;
      case "item_wise_sales": return <ItemWiseSalesReport />;
      case "category_brand_sales": return <CategoryBrandSalesReport />;
      case "fast_slow_moving": return <FastSlowMovingReport />;
      case "discount_analysis": return <DiscountAnalysisReport />;
      case "promotion_impact": return <PromotionImpactReport />;
      case "free_issue_scheme": return <FreeIssueSchemeReport />;
      case "tax_summary": return <TaxSummaryReport />;
      case "vat_output_register": return <VATOutputRegisterReport />;
      case "price_override": return <PriceOverrideReport />;
      case "manual_entry": return <ManualEntryReport />;
      case "sales_edit_log": return <SalesEditLogReport />;
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-slate-900 p-5" onClick={handleReportAction}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>BillBull</span>
          <ChevronRight className="h-3 w-3" />
          <span>Customers &amp; Sales</span>
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
                Sales Reports
              </CardTitle>
              <span className="text-[10px] text-slate-500">
                POS • VAN • Back-Office • Customer Analytics
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
                                className={`text-[9px] ${
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
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                <span>
                  Start with <b>Sales Summary</b>, <b>Daily Sales</b>, and <b>Channel-wise</b> for overview.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <span>
                  Use <b>Audit Reports</b> for void tracking and price override monitoring.
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
                    <Store className="h-3.5 w-3.5" />
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

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    Sales Channel
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2"
                  >
                    <option value="All">All</option>
                    <option value="POS">POS</option>
                    <option value="VAN">VAN</option>
                    <option value="Back-Office">Back-Office</option>
                    <option value="Online">Online</option>
                  </select>
                </div>

                {showAdvanced && (
                  <>
                    <div className="space-y-1.5 relative">
                      <label className="text-[11px] text-slate-600 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Cashier / Salesperson
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={cashierOpen ? cashierSearch : (cashier === "All" ? "" : cashier)}
                          placeholder={cashier === "All" ? "All" : cashier}
                          onFocus={() => { setCashierOpen(true); setCashierSearch(""); }}
                          onChange={(e) => { setCashierSearch(e.target.value); setCashierOpen(true); }}
                          onBlur={() => setTimeout(() => setCashierOpen(false), 150)}
                          className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                        />
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                        {cashierOpen && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {[{ label: "All", value: "All" }, ...salespersons.map(s => ({ label: s, value: s }))]
                              .filter(o => !cashierSearch || o.label.toLowerCase().includes(cashierSearch.toLowerCase()))
                              .map(o => (
                                <button
                                  key={o.value}
                                  type="button"
                                  onMouseDown={() => { setCashier(o.value); setCashierOpen(false); setCashierSearch(""); }}
                                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${cashier === o.value ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                                >
                                  {o.label}
                                </button>
                              ))}
                            {salespersons.filter(s => !cashierSearch || s.toLowerCase().includes(cashierSearch.toLowerCase())).length === 0 && cashierSearch && (
                              <div className="px-3 py-2 text-[11px] text-slate-400">No matches</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[11px] text-slate-600">
                        Customer / Item Filter
                      </label>
                      <Input
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Search customer name or item..."
                        className="h-8 text-[11px] bg-slate-50 border-slate-200"
                      />
                    </div>
                  </>
                )}

                <div className={`flex items-end gap-2 ${!showAdvanced ? "xl:col-start-4" : ""}`}>
                  <Button
                    onClick={() => loadReport()}
                    className="flex-1 h-8 text-[11px] bg-[#F5C742] hover:bg-[#e4b82e] text-slate-900"
                  >
                    Generate
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 text-[11px] text-slate-600 flex items-center gap-1"
                    onClick={handleExportExcel}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Applied filters — shown on screen for auditability; mirrored into print/PDF/Excel headers */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mr-1">Applied Filters</span>
            {appliedFilters().map((f) => (
              <span
                key={f.label}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFF8E7] border border-[#FDE6A9] text-[#7c5e00]"
              >
                <b className="text-[#5b4500]">{f.label}:</b> {f.value}
              </span>
            ))}
            {appliedFilters().length === 0 && (
              <span className="text-[10px] text-slate-400">None — showing all records</span>
            )}
          </div>

          {/* Results — wrapped in DataRevisionContext so child report components
              re-render whenever the parent fetches fresh data */}
          <DataRevisionContext.Provider value={dataRevision}>
            <div className="relative">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded-lg">
                  <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#FDE6A9] rounded-full shadow text-[11px] text-slate-600">
                    <svg className="animate-spin h-3.5 w-3.5 text-[#F5C742]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Loading report data…
                  </div>
                </div>
              )}
              {renderResults()}
            </div>
          </DataRevisionContext.Provider>
        </motion.div>
      </div>
    </div>
  );
}

// Sales Summary Report Component
function SalesSummaryReport() {
  useDataRevision(); // subscribe to data fetches so this component re-renders when mock data changes
  const [valuation, setValuation] = React.useState<ValuationMethod>("average_cost");

  const rows = mockSalesSummaryData.map((d) => {
    const { cost, gp } = recompute(d.netSales, d.cogs, valuation);
    return { ...d, cogs: cost, grossProfit: gp, gp: d.netSales > 0 ? parseFloat(((gp / d.netSales) * 100).toFixed(1)) : 0 };
  });

  const rowGrossSales = rows.reduce((sum, d) => sum + d.grossSales, 0);
  const rowReturns = rows.reduce((sum, d) => sum + d.returns, 0);
  const totalDiscounts = rows.reduce((sum, d) => sum + d.discounts, 0);
  const rowNetSales = rows.reduce((sum, d) => sum + d.netSales, 0);
  const rowTax = rows.reduce((sum, d) => sum + d.tax, 0);
  const totalCOGS = rows.reduce((sum, d) => sum + d.cogs, 0);
  const rowGrossProfit = rows.reduce((sum, d) => sum + d.grossProfit, 0);

  // Use backend-provided card totals when available (authoritative); fall back to row sums
  const totalGrossSales = mockSalesSummaryTotals?.grossSales ?? rowGrossSales;
  const totalReturns = mockSalesSummaryTotals?.returns ?? rowReturns;
  const totalNetSales = mockSalesSummaryTotals?.netSales ?? rowNetSales;
  const totalTax = mockSalesSummaryTotals?.tax ?? rowTax;
  const totalGrossProfit = mockSalesSummaryTotals?.grossProfit ?? rowGrossProfit;

  const avgGP = totalNetSales > 0 ? (totalGrossProfit / totalNetSales * 100) : 0;
  const returnsPct = totalGrossSales > 0 ? ((totalReturns / totalGrossSales) * 100).toFixed(1) : "0.0";
  const detailRangeLabel = dateRangeLabel(rows);

  useReportView("sales_summary", {
    note: `Valuation: ${VALUATION_METHODS.find((m) => m.id === valuation)?.label || valuation} · Period: ${detailRangeLabel}`,
    kpis: [
      { label: "Net Sales", value: `AED ${totalNetSales.toLocaleString()}`, hint: "After returns & discounts" },
      { label: "Gross Profit", value: `AED ${totalGrossProfit.toLocaleString()}`, hint: `GP: ${avgGP.toFixed(1)}%` },
      { label: "Tax Collected", value: `AED ${totalTax.toLocaleString()}`, hint: "VAT @ 5%" },
      { label: "Returns", value: `AED ${totalReturns.toLocaleString()}`, hint: `${returnsPct}% of gross` },
    ],
    sections: [
      {
        title: `Sales Summary Detail (${detailRangeLabel})`,
        columns: [
          { key: "date", header: "Date", align: "left", width: 14 },
          { key: "grossSales", header: "Gross Sales", align: "right", width: 16 },
          { key: "returns", header: "Returns", align: "right", width: 14 },
          { key: "discounts", header: "Discounts", align: "right", width: 14 },
          { key: "netSales", header: "Net Sales", align: "right", width: 16 },
          { key: "tax", header: "Tax", align: "right", width: 12 },
          { key: "cogs", header: "COGS", align: "right", width: 14 },
          { key: "grossProfit", header: "Gross Profit", align: "right", width: 16 },
          { key: "gp", header: "GP %", align: "right", width: 10 },
        ],
        rows: rows.map((row) => ({
          date: row.date,
          grossSales: `AED ${row.grossSales.toLocaleString()}`,
          returns: `AED ${row.returns.toLocaleString()}`,
          discounts: `AED ${row.discounts.toLocaleString()}`,
          netSales: `AED ${row.netSales.toLocaleString()}`,
          tax: `AED ${row.tax.toLocaleString()}`,
          cogs: `AED ${row.cogs.toLocaleString()}`,
          grossProfit: `AED ${row.grossProfit.toLocaleString()}`,
          gp: `${row.gp.toFixed(1)}%`,
        })),
        totals: {
          date: "TOTAL",
          grossSales: `AED ${totalGrossSales.toLocaleString()}`,
          returns: `AED ${totalReturns.toLocaleString()}`,
          discounts: `AED ${totalDiscounts.toLocaleString()}`,
          netSales: `AED ${totalNetSales.toLocaleString()}`,
          tax: `AED ${totalTax.toLocaleString()}`,
          cogs: `AED ${totalCOGS.toLocaleString()}`,
          grossProfit: `AED ${totalGrossProfit.toLocaleString()}`,
          gp: `${avgGP.toFixed(1)}%`,
        },
      },
    ],
  });

  return (
    <div className="space-y-3">
      <ValuationSelector value={valuation} onChange={setValuation} />
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-2 border-[#F5C742] bg-gradient-to-br from-[#FFF6D8] to-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">Net Sales</span>
              <DollarSign className="h-4 w-4 text-[#F5C742]" />
            </div>
            <div className="text-xl font-bold text-slate-900">AED {totalNetSales.toLocaleString()}</div>
            <div className="text-[9px] text-slate-500 mt-1">After returns & discounts</div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">Gross Profit</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700">AED {totalGrossProfit.toLocaleString()}</div>
            <div className="text-[9px] text-slate-500 mt-1">GP: {avgGP.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">Tax Collected</span>
              <Shield className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold text-blue-700">AED {totalTax.toLocaleString()}</div>
            <div className="text-[9px] text-slate-500 mt-1">VAT @ 5%</div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">Returns</span>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
            <div className="text-xl font-bold text-orange-700">AED {totalReturns.toLocaleString()}</div>
            <div className="text-[9px] text-slate-500 mt-1">{returnsPct}% of gross</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Daily Net Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={rows}>
                <defs>
                  <linearGradient id="colorNetSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F5C742" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F5C742" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(val) => val.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="netSales" stroke="#F5C742" strokeWidth={2} fillOpacity={1} fill="url(#colorNetSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Gross Profit Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(val) => val.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="grossProfit" stroke="#10b981" strokeWidth={2} name="Gross Profit" />
                <Line type="monotone" dataKey="cogs" stroke="#ef4444" strokeWidth={2} name="COGS" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Sales Summary Detail ({detailRangeLabel})
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1">
              <Download className="h-3 w-3" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Gross Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Returns</th>
                  <th className="px-3 py-2 text-right font-medium">Discounts</th>
                  <th className="px-3 py-2 text-right font-medium">Net Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Tax</th>
                  <th className="px-3 py-2 text-right font-medium">COGS</th>
                  <th className="px-3 py-2 text-right font-medium">Gross Profit</th>
                  <th className="px-3 py-2 text-right font-medium">GP %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 text-slate-700">{row.date}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.grossSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.returns.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.discounts.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-blue-600">AED {row.tax.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.cogs.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">AED {row.grossProfit.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.gp.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
                <tr>
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">AED {totalGrossSales.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totalReturns.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totalDiscounts.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totalNetSales.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totalTax.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totalCOGS.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totalGrossProfit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{avgGP.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function exportData(data: any[], cols: { header: string; key: string }[], title: string) {
  exportToExcel(data, cols, title.replace(/\s+/g, "_"));
}

// Daily Sales (Z-Style) Report Component
function DailySalesReport() {
  useDataRevision();
  const d = mockDailySalesData;
  const [showOpeningBalance, setShowOpeningBalance] = React.useState(true);

  const totalOpeningBalance = d.openingBalances.reduce((s, a) => s + a.amount, 0);
  const totalSalesPayments  = d.salesPayments.reduce((s, p) => s + p.amount, 0);
  const totalPurchPayments  = d.purchasePayments.reduce((s, p) => s + p.amount, 0);
  const totalExpenses       = d.expensePayments.reduce((s, p) => s + p.amount, 0);
  const totalSOAdv          = d.soAdvances.reduce((s, a) => s + a.amount, 0);
  const totalLPOAdv         = d.lpoAdvances.reduce((s, a) => s + a.amount, 0);
  const totalSalAdv         = d.salaryAdvances.reduce((s, a) => s + a.amount, 0);
  const totalOtherReceipts  = d.otherReceipts.reduce((s, r) => s + r.amount, 0);
  const totalOtherPayments  = d.otherPayments.reduce((s, p) => s + p.amount, 0);
  const totalCustReceipts   = d.customerReceipts.reduce((s, r) => s + r.amount, 0);
  const totalVendPayments   = d.vendorPayments.reduce((s, p) => s + p.amount, 0);
  const totalSalesReturns   = d.salesReturnLines.reduce((s, r) => s + r.amount, 0);
  const totalPurchReturns   = d.purchaseReturnLines.reduce((s, r) => s + r.amount, 0);
  const totalCashVariance   = d.cashAccounts.reduce((s, a) => s + (a.actual - a.closing), 0);

  // Section helper — collapsible card with yellow header accent
  function Section({ title, badge, right, children }: {
    title: string; badge?: string; right?: React.ReactNode; children: React.ReactNode;
  }) {
    const [open, setOpen] = React.useState(true);
    return (
      <Card className="border border-slate-200 bg-white overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-left"
          onClick={() => setOpen((p) => !p)}
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-[#F5C742]" />
            <span className="text-[11px] font-semibold text-slate-800">{title}</span>
            {badge && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#FFF6D8] border border-[#F5C742]/40 text-slate-700 font-medium">
                {badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {right && <span className="text-[11px] font-bold text-slate-800">{right}</span>}
            {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </div>
        </button>
        {open && <div className="px-4 py-3 text-[11px]">{children}</div>}
      </Card>
    );
  }

  function Row({ label, value, indent, bold, accent, debit, credit }: {
    label: string; value: string; indent?: number; bold?: boolean; accent?: boolean; debit?: boolean; credit?: boolean;
  }) {
    return (
      <div className={`flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0 ${accent ? "border-t-2 border-[#F5C742] mt-1 pt-2" : ""}`}
        style={{ paddingLeft: indent ? indent * 12 : 0 }}>
        <span className={`${bold ? "font-semibold text-slate-800" : "text-slate-600"}`}>{label}</span>
        <span className={`tabular-nums ${accent ? "font-bold text-[#F5C742]" : bold ? "font-semibold text-slate-800" : debit ? "text-red-600" : credit ? "text-emerald-600" : "text-slate-700"}`}>
          {value}
        </span>
      </div>
    );
  }

  function SubTable({ rows, columns }: { rows: string[][]; columns: string[] }) {
    return (
      <div className="mt-2 border border-slate-100 rounded-lg overflow-hidden">
        <table className="bb-nowrap-table w-full text-[11px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{columns.map((c) => <th key={c} className="px-3 py-1.5 text-left font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 text-slate-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const fmt = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  function buildSummaryRows() {
    const rows: { Section: string; Description: string; Amount: string }[] = [];
    const add = (section: string, desc: string, n: number) =>
      rows.push({ Section: section, Description: desc, Amount: fmt(n) });
    add("Sales", "Net Sales", d.netSales);
    add("Sales Returns", "Total Returns", totalSalesReturns);
    d.salesPayments.forEach(p => add("Sales Payments", p.mode, p.amount));
    d.customerReceipts.forEach(p => add("Customer Receipts", p.customer, p.amount));
    d.vendorPayments.forEach(p => add("Vendor Payments", p.vendor, p.amount));
    d.purchasePayments.forEach(p => add("Purchase Payments", p.mode, p.amount));
    d.expensePayments.forEach(p => add("Expenses", p.category, p.amount));
    d.soAdvances.forEach(p => add("SO Advances", p.orderNo, p.amount));
    d.lpoAdvances.forEach(p => add("LPO Advances", p.lpoNo, p.amount));
    d.salaryAdvances.forEach(p => add("Salary Advances", p.employee, p.amount));
    d.otherReceipts.forEach(p => add("Other Receipts", p.description, p.amount));
    d.otherPayments.forEach(p => add("Other Payments", p.description, p.amount));
    return rows;
  }

  const dailyVm: ReportViewModel = {
    note: "Z-Style Day-Close Summary",
    kpis: [
      { label: "Net Sales", value: fmt(d.netSales) },
      { label: "Sales Returns", value: fmt(totalSalesReturns) },
      { label: "Customer Receipts", value: fmt(totalCustReceipts) },
      { label: "Vendor Payments", value: fmt(totalVendPayments) },
    ],
    sections: [
      {
        title: "Day-Close Summary",
        columns: [
          { key: "Section", header: "Section", align: "left", width: 22 },
          { key: "Description", header: "Description", align: "left", width: 30 },
          { key: "Amount", header: "Amount", align: "right", width: 18 },
        ],
        rows: buildSummaryRows(),
      },
    ],
  };
  useReportView("daily_sales", dailyVm);

  function handleDailyExport() {
    const { columns, rows } = flattenReportView(dailyVm);
    exportToExcel(rows, columns, "Daily_Sales_Report_Z_Style");
  }

  function handleDailyPrint() {
    const html = generateReportA4Html(
      { reportTitle: "Daily Sales Report (Z-Style)", ...dailyVm },
      {},
      { reportTitle: "Daily Sales Report (Z-Style)" }
    );
    printHtml(html);
  }

  // Aggregate any array of {mode, amount} objects into a payment mode summary table
  function modeBreakdown(items: { mode: string; amount: number }[]) {
    const map: Record<string, number> = {};
    for (const item of items) map[item.mode] = (map[item.mode] ?? 0) + item.amount;
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return (
      <div className="mt-3">
        <div className="mb-1 text-[10px] font-semibold text-slate-600">Payment Mode Breakdown</div>
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Payment Mode</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(map).map(([mode, amt], i) => (
                <tr key={mode} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="px-3 py-1.5 text-slate-700">{mode}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700">{fmt(amt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#FFF6D8]">
              <tr>
                <td className="px-3 py-1.5 font-semibold text-slate-800">Total</td>
                <td className="px-3 py-1.5 text-right font-bold text-[#b89318]">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Report header ── */}
      <Card className="border-2 border-[#F5C742] bg-gradient-to-r from-[#FFF6D8] to-white">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-[#b89318] mb-1">Daily Sales Report (Z-Style)</div>
              <div className="text-2xl font-bold text-slate-900">{d.date}</div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                <span>Branch: <b className="text-slate-700">{d.branch}</b></span>
                <span>Shift: <b className="text-slate-700">{d.shift}</b></span>
                <span>Prepared by: <b className="text-slate-700">{d.preparedBy}</b></span>
                <span>Approved: <b className="text-slate-700">{d.approvedBy}</b></span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Opening balance toggle */}
              <button
                onClick={() => setShowOpeningBalance((p) => !p)}
                className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  showOpeningBalance
                    ? "bg-[#F5C742] border-[#F5C742] text-slate-900"
                    : "bg-white border-slate-300 text-slate-500 hover:border-[#F5C742]"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full border-2 ${showOpeningBalance ? "bg-slate-900 border-slate-900" : "border-slate-400"}`} />
                Include Opening Balance
              </button>
              <Button variant="ghost" size="sm" className="text-[11px] text-slate-600 flex items-center gap-1" onClick={handleDailyExport}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              <Button variant="ghost" size="sm" className="text-[11px] text-slate-600 flex items-center gap-1" onClick={handleDailyPrint}>
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Net Sales",       value: fmt(d.netSales),        cls: "text-slate-900" },
          { label: "Net Purchases",   value: fmt(d.netPurchases),    cls: "text-slate-900" },
          { label: "Cust. Receipts",  value: fmt(totalCustReceipts), cls: "text-emerald-600" },
          { label: "Vendor Payments", value: fmt(totalVendPayments), cls: "text-red-600" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-500 mb-0.5">{c.label}</div>
              <div className={`text-base font-bold ${c.cls}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Opening Balance ── */}
      {showOpeningBalance && (
        <Section title="Opening Balance" right={fmt(totalOpeningBalance)}>
          <SubTable
            columns={["Cash Account", "Amount"]}
            rows={d.openingBalances.map((a) => [a.account, fmt(a.amount)])}
          />
          <Row label="Total Opening Balance" value={fmt(totalOpeningBalance)} bold />
        </Section>
      )}

      {/* ── Sales ── */}
      <Section title="Sales" badge="Revenue" right={fmt(d.netSales)}>
        <Row label="POS Sales"              value={fmt(d.posSales)} indent={1} />
        <Row label="VAN / Route Sales"      value={fmt(d.vanSales)} indent={1} />
        <Row label="Back-Office Sales"      value={fmt(d.backOfficeSales)} indent={1} />
        <Row label="Total Gross Sales"      value={fmt(d.totalGrossSales)} bold />
        <Row label="Less: Sales Returns"    value={`(${fmt(d.salesReturns)})`}  indent={1} debit />
        <Row label="Less: Discounts"        value={`(${fmt(d.discounts)})`}     indent={1} debit />
        <Row label="Net Sales"              value={fmt(d.netSales)} bold accent />
        <Row label="VAT on Sales (5%)"      value={fmt(d.vatOnSales)} indent={1} />

        <div className="mt-3 mb-1 text-[10px] font-semibold text-slate-600">Payment Mode Breakdown</div>
        <SubTable
          columns={["Payment Mode", "Amount"]}
          rows={[
            ...d.salesPayments.map((p) => [p.mode, fmt(p.amount)]),
            ["Total", fmt(totalSalesPayments)],
          ]}
        />
      </Section>

      {/* ── Sales Returns ── */}
      <Section title="Sales Returns" right={fmt(totalSalesReturns)}>
        <SubTable
          columns={["Return Ref", "Customer", "Items", "Amount", "Mode"]}
          rows={d.salesReturnLines.map((r) => [r.ref, r.customer, String(r.items), fmt(r.amount), r.mode])}
        />
        <Row label="Total Sales Returns" value={fmt(totalSalesReturns)} bold />
      </Section>

      {/* ── Purchases ── */}
      <Section title="Purchases" badge="Procurement" right={fmt(d.netPurchases)}>
        <Row label="Total Purchases (Gross)" value={fmt(d.totalPurchases)} />
        <Row label="Less: Purchase Returns"  value={`(${fmt(d.purchaseReturns)})`} indent={1} debit />
        <Row label="Net Purchases"           value={fmt(d.netPurchases)} bold accent />
        <Row label="VAT on Purchases (5%)"   value={fmt(d.vatOnPurchases)} indent={1} />

        <div className="mt-3 mb-1 text-[10px] font-semibold text-slate-600">Payment Mode Breakdown</div>
        <SubTable
          columns={["Payment Mode", "Amount"]}
          rows={[
            ...d.purchasePayments.map((p) => [p.mode, fmt(p.amount)]),
            ["Total", fmt(totalPurchPayments)],
          ]}
        />
      </Section>

      {/* ── Purchase Returns ── */}
      <Section title="Purchase Returns" right={fmt(totalPurchReturns)}>
        <SubTable
          columns={["GRV Ref", "Vendor", "Items", "Amount", "Mode"]}
          rows={d.purchaseReturnLines.map((r) => [r.ref, r.vendor, String(r.items), fmt(r.amount), r.mode])}
        />
        {modeBreakdown(d.purchaseReturnLines)}
        <Row label="Total Purchase Returns" value={fmt(totalPurchReturns)} bold />
      </Section>

      {/* ── Expenses ── */}
      <Section title="Expenses" right={fmt(totalExpenses)}>
        <SubTable
          columns={["Category", "Payment Mode", "Amount"]}
          rows={d.expensePayments.map((e) => [e.category, e.mode, fmt(e.amount)])}
        />
        {modeBreakdown(d.expensePayments)}
        <Row label="Total Expenses" value={fmt(totalExpenses)} bold />
      </Section>

      {/* ── Advances ── */}
      <Section title="Advances" badge="SO · LPO · Salary" right={fmt(totalSOAdv + totalLPOAdv + totalSalAdv)}>
        <div className="mb-1 text-[10px] font-semibold text-slate-600">Sales Order (SO) Advances</div>
        <SubTable
          columns={["Ref", "Customer", "Mode", "Amount"]}
          rows={d.soAdvances.map((a) => [a.ref, a.customer, a.mode, fmt(a.amount)])}
        />
        {modeBreakdown(d.soAdvances)}

        <div className="mt-4 mb-1 text-[10px] font-semibold text-slate-600">LPO Advances</div>
        <SubTable
          columns={["Ref", "Vendor", "Mode", "Amount"]}
          rows={d.lpoAdvances.map((a) => [a.ref, a.vendor, a.mode, fmt(a.amount)])}
        />
        {modeBreakdown(d.lpoAdvances)}

        <div className="mt-4 mb-1 text-[10px] font-semibold text-slate-600">Salary Advances</div>
        <SubTable
          columns={["Ref", "Employee", "Mode", "Amount"]}
          rows={d.salaryAdvances.map((a) => [a.ref, a.employee, a.mode, fmt(a.amount)])}
        />
        {modeBreakdown(d.salaryAdvances)}

        <div className="mt-4 mb-1 text-[10px] font-semibold text-slate-600">Combined Advances — Payment Mode Breakdown</div>
        {modeBreakdown([...d.soAdvances, ...d.lpoAdvances, ...d.salaryAdvances])}
        <Row label="Total Advances" value={fmt(totalSOAdv + totalLPOAdv + totalSalAdv)} bold />
      </Section>

      {/* ── Customer Receipts ── */}
      <Section title="Customer Receipts" badge="Collections" right={fmt(totalCustReceipts)}>
        <SubTable
          columns={["Receipt Ref", "Customer", "Payment Mode", "Amount"]}
          rows={d.customerReceipts.map((r) => [r.ref, r.customer, r.mode, fmt(r.amount)])}
        />
        {modeBreakdown(d.customerReceipts)}
        <Row label="Total Customer Receipts" value={fmt(totalCustReceipts)} bold />
      </Section>

      {/* ── Vendor Payments ── */}
      <Section title="Vendor Payments" right={fmt(totalVendPayments)}>
        <SubTable
          columns={["Payment Ref", "Vendor", "Payment Mode", "Amount"]}
          rows={d.vendorPayments.map((p) => [p.ref, p.vendor, p.mode, fmt(p.amount)])}
        />
        {modeBreakdown(d.vendorPayments)}
        <Row label="Total Vendor Payments" value={fmt(totalVendPayments)} bold />
      </Section>

      {/* ── Other Receipts ── */}
      <Section title="Other Receipts" right={fmt(totalOtherReceipts)}>
        <SubTable
          columns={["Ref", "Description", "Mode", "Amount"]}
          rows={d.otherReceipts.map((r) => [r.ref, r.description, r.mode, fmt(r.amount)])}
        />
        {modeBreakdown(d.otherReceipts)}
        <Row label="Total Other Receipts" value={fmt(totalOtherReceipts)} bold />
      </Section>

      {/* ── Other Payments ── */}
      <Section title="Other Payments" right={fmt(totalOtherPayments)}>
        <SubTable
          columns={["Ref", "Description", "Mode", "Amount"]}
          rows={d.otherPayments.map((p) => [p.ref, p.description, p.mode, fmt(p.amount)])}
        />
        {modeBreakdown(d.otherPayments)}
        <Row label="Total Other Payments" value={fmt(totalOtherPayments)} bold />
      </Section>

      {/* ── Cash Accounts Footer ── */}
      <Card className="border-2 border-[#F5C742] bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-[#FFF6D8] border-b border-[#F5C742]/30 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-[#F5C742]" />
          <span className="text-[11px] font-semibold text-slate-800">Cash in Hand</span>
        </div>
        <div className="px-4 py-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  <th className="px-3 py-2 text-right font-medium">Opening</th>
                  <th className="px-3 py-2 text-right font-medium">Inflow</th>
                  <th className="px-3 py-2 text-right font-medium">Outflow</th>
                  <th className="px-3 py-2 text-right font-medium">Expected</th>
                  <th className="px-3 py-2 text-right font-medium">Actual</th>
                  <th className="px-3 py-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {d.cashAccounts.map((a, i) => {
                  const variance = a.actual - a.closing;
                  return (
                    <tr key={a.account} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 font-medium text-slate-700">{a.account}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{fmt(a.opening)}</td>
                      <td className="px-3 py-2 text-right text-emerald-600 font-medium">{fmt(a.inflow)}</td>
                      <td className="px-3 py-2 text-right text-red-500">{fmt(a.outflow)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(a.closing)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(a.actual)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${variance < 0 ? "text-red-600" : variance > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                        {variance === 0 ? "—" : `${variance > 0 ? "+" : ""}AED ${variance.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-[#FFF6D8]">
                <tr>
                  <td className="px-3 py-2 font-bold text-slate-800">Total Cash</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(d.cashAccounts.reduce((s, a) => s + a.opening, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-600">{fmt(d.cashAccounts.reduce((s, a) => s + a.inflow, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-500">{fmt(d.cashAccounts.reduce((s, a) => s + a.outflow, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(d.cashAccounts.reduce((s, a) => s + a.closing, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(d.cashAccounts.reduce((s, a) => s + a.actual, 0))}</td>
                  <td className={`px-3 py-2 text-right font-bold ${totalCashVariance < 0 ? "text-red-600" : totalCashVariance > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                    {totalCashVariance === 0 ? "—" : `${totalCashVariance > 0 ? "+" : ""}AED ${totalCashVariance.toFixed(2)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Card>

      {/* ── Bank Balances Footer ── */}
      <Card className="border-2 border-blue-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-blue-400" />
          <span className="text-[11px] font-semibold text-slate-800">Bank Balance</span>
        </div>
        <div className="px-4 py-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bank Account</th>
                  <th className="px-3 py-2 text-right font-medium">Opening</th>
                  <th className="px-3 py-2 text-right font-medium">Receipts</th>
                  <th className="px-3 py-2 text-right font-medium">Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {d.bankAccounts.map((b, i) => (
                  <tr key={b.bank} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-medium text-slate-700">{b.bank}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmt(b.opening)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600 font-medium">{fmt(b.receipts)}</td>
                    <td className="px-3 py-2 text-right text-red-500">{fmt(b.payments)}</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-700">{fmt(b.closing)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50">
                <tr>
                  <td className="px-3 py-2 font-bold text-slate-800">Total Bank</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(d.bankAccounts.reduce((s, b) => s + b.opening, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-600">{fmt(d.bankAccounts.reduce((s, b) => s + b.receipts, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-500">{fmt(d.bankAccounts.reduce((s, b) => s + b.payments, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold text-blue-700">{fmt(d.bankAccounts.reduce((s, b) => s + b.closing, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Card>

      {/* ── Signature footer ── */}
      <Card className="border border-slate-200 bg-white">
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-3 gap-8 text-[10px] text-slate-500">
            {["Prepared By", "Reviewed By", "Approved By"].map((label) => (
              <div key={label} className="flex flex-col gap-5">
                <span>{label}</span>
                <div className="border-t border-dashed border-slate-300 pt-1">
                  <span className="text-slate-400">Signature / Stamp</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

// Channel-wise Sales Report
function ChannelWiseReport() {
  useDataRevision();
  const COLORS = ['#F5C742', '#3b82f6', '#8b5cf6'];

  useReportView("channel_wise", {
    sections: [
      {
        title: "Channel Performance Comparison",
        columns: [
          { key: "channel", header: "Channel", align: "left", width: 18 },
          { key: "transactions", header: "Transactions", align: "right", width: 14 },
          { key: "salesValue", header: "Sales Value", align: "right", width: 16 },
          { key: "avgBill", header: "Avg Bill", align: "right", width: 14 },
          { key: "discountPct", header: "Discount %", align: "right", width: 12 },
          { key: "returnPct", header: "Return %", align: "right", width: 12 },
        ],
        rows: mockChannelSalesData.map((row) => ({
          channel: row.channel,
          transactions: row.transactions,
          salesValue: `AED ${row.salesValue.toLocaleString()}`,
          avgBill: `AED ${row.avgBill.toFixed(2)}`,
          discountPct: `${row.discountPct}%`,
          returnPct: `${row.returnPct}%`,
        })),
      },
    ],
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Sales Value by Channel
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockChannelSalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Bar dataKey="salesValue" fill="#F5C742" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Transaction Count by Channel
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={mockChannelSalesData}
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  dataKey="transactions"
                  label={({ channel, transactions }) => `${channel.split(' ')[0]}: ${transactions}`}
                  labelStyle={{ fontSize: '9px' }}
                >
                  {mockChannelSalesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">
            Channel Performance Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Channel</th>
                  <th className="px-3 py-2 text-right font-medium">Transactions</th>
                  <th className="px-3 py-2 text-right font-medium">Sales Value</th>
                  <th className="px-3 py-2 text-right font-medium">Avg Bill</th>
                  <th className="px-3 py-2 text-right font-medium">Discount %</th>
                  <th className="px-3 py-2 text-right font-medium">Return %</th>
                </tr>
              </thead>
              <tbody>
                {mockChannelSalesData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.channel}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.transactions}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.salesValue.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.avgBill.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-orange-600">{row.discountPct}%</td>
                    <td className="px-3 py-2 text-right text-red-600">{row.returnPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Customer Sales Summary Report
function CustomerSalesSummaryReport() {
  useDataRevision();
  useReportView("customer_sales_summary", {
    sections: [
      {
        title: "Top Customers by Sales",
        columns: [
          { key: "customer", header: "Customer", align: "left", width: 22 },
          { key: "totalSales", header: "Total Sales", align: "right", width: 16 },
          { key: "returns", header: "Returns", align: "right", width: 14 },
          { key: "netSales", header: "Net Sales", align: "right", width: 16 },
          { key: "outstanding", header: "Outstanding", align: "right", width: 16 },
          { key: "creditLimit", header: "Credit Limit", align: "right", width: 16 },
          { key: "utilization", header: "Utilization %", align: "right", width: 14 },
        ],
        rows: mockCustomerSalesData.map((row) => ({
          customer: row.customer,
          totalSales: `AED ${row.totalSales.toLocaleString()}`,
          returns: `AED ${row.returns.toLocaleString()}`,
          netSales: `AED ${row.netSales.toLocaleString()}`,
          outstanding: `AED ${row.outstanding.toLocaleString()}`,
          creditLimit: `AED ${row.creditLimit.toLocaleString()}`,
          utilization: `${row.utilization.toFixed(1)}%`,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Top Customers by Sales
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1">
              <Download className="h-3 w-3" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Total Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Returns</th>
                  <th className="px-3 py-2 text-right font-medium">Net Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2 text-right font-medium">Credit Limit</th>
                  <th className="px-3 py-2 text-right font-medium">Utilization %</th>
                </tr>
              </thead>
              <tbody>
                {mockCustomerSalesData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 text-slate-800 font-medium">{row.customer}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.totalSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.returns.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">AED {row.outstanding.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.creditLimit.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${row.utilization > 25 ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {row.utilization.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Cashier Performance Report
function CashierPerformanceReport() {
  useDataRevision();
  useReportView("pos_cashier_performance", {
    sections: [
      {
        title: "POS Cashier Performance",
        columns: [
          { key: "cashier", header: "Cashier", align: "left", width: 20 },
          { key: "bills", header: "Bills", align: "right", width: 10 },
          { key: "totalSales", header: "Total Sales", align: "right", width: 16 },
          { key: "avgBill", header: "Avg Bill", align: "right", width: 14 },
          { key: "discountPct", header: "Discount %", align: "right", width: 12 },
          { key: "voidCount", header: "Voids", align: "right", width: 10 },
          { key: "returnCount", header: "Returns", align: "right", width: 10 },
          { key: "variance", header: "Variance", align: "right", width: 12 },
        ],
        rows: mockCashierPerformanceData.map((row) => ({
          cashier: row.cashier,
          bills: row.bills,
          totalSales: `AED ${row.totalSales.toLocaleString()}`,
          avgBill: `AED ${row.avgBill.toFixed(2)}`,
          discountPct: `${row.discountPct}%`,
          voidCount: row.voidCount,
          returnCount: row.returnCount,
          variance: `AED ${row.variance}`,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              POS Cashier Performance
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1">
              <Download className="h-3 w-3" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Cashier</th>
                  <th className="px-3 py-2 text-right font-medium">Bills</th>
                  <th className="px-3 py-2 text-right font-medium">Total Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Avg Bill</th>
                  <th className="px-3 py-2 text-right font-medium">Discount %</th>
                  <th className="px-3 py-2 text-right font-medium">Voids</th>
                  <th className="px-3 py-2 text-right font-medium">Returns</th>
                  <th className="px-3 py-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {mockCashierPerformanceData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 text-slate-800 font-medium">{row.cashier}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.bills}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.totalSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.avgBill.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-orange-600">{row.discountPct}%</td>
                    <td className="px-3 py-2 text-right">
                      <span className={row.voidCount > 3 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                        {row.voidCount}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.returnCount}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${row.variance < 0 ? 'text-red-600' : row.variance > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                        AED {row.variance}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// POS Transaction Report
function POSTransactionReport() {
  useDataRevision();
  const statusColor = (s: string) => {
    if (s === "Completed") return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (s === "Voided") return "text-red-600 bg-red-50 border-red-200";
    if (s === "Return") return "text-orange-600 bg-orange-50 border-orange-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  };
  useReportView("pos_transaction", {
    kpis: [
      { label: "Total Bills", value: String(mockPOSTransactionData.length), hint: "all transactions" },
      { label: "Completed", value: String(mockPOSTransactionData.filter(r => r.status === "Completed").length), hint: "successful" },
      { label: "Voided", value: String(mockPOSTransactionData.filter(r => r.status === "Voided").length), hint: "cancelled" },
      { label: "Returns", value: String(mockPOSTransactionData.filter(r => r.status === "Return").length), hint: "refunded" },
    ],
    sections: [
      {
        title: "POS Transaction Detail",
        columns: [
          { key: "billNo", header: "Bill No", align: "left", width: 14 },
          { key: "dateTime", header: "Date / Time", align: "left", width: 18 },
          { key: "cashier", header: "Cashier", align: "left", width: 16 },
          { key: "customer", header: "Customer", align: "left", width: 18 },
          { key: "items", header: "Items", align: "right", width: 10 },
          { key: "grossAmt", header: "Gross", align: "right", width: 14 },
          { key: "discount", header: "Discount", align: "right", width: 14 },
          { key: "netAmt", header: "Net Amt", align: "right", width: 14 },
          { key: "payMode", header: "Pay Mode", align: "left", width: 14 },
          { key: "status", header: "Status", align: "left", width: 12 },
        ],
        rows: mockPOSTransactionData.map((row) => ({
          billNo: row.billNo,
          dateTime: `${row.date} ${row.time}`,
          cashier: row.cashier,
          customer: row.customer,
          items: row.items,
          grossAmt: `AED ${row.grossAmt.toFixed(2)}`,
          discount: `AED ${row.discount.toFixed(2)}`,
          netAmt: `AED ${row.netAmt.toFixed(2)}`,
          payMode: row.payMode,
          status: row.status,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Bills", value: mockPOSTransactionData.length.toString(), sub: "all transactions" },
          { label: "Completed", value: mockPOSTransactionData.filter(r => r.status === "Completed").length.toString(), sub: "successful" },
          { label: "Voided", value: mockPOSTransactionData.filter(r => r.status === "Voided").length.toString(), sub: "cancelled" },
          { label: "Returns", value: mockPOSTransactionData.filter(r => r.status === "Return").length.toString(), sub: "refunded" },
        ].map((kpi, i) => (
          <Card key={i} className="border border-slate-200 bg-white">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-600 mb-1">{kpi.label}</div>
              <div className="text-xl font-bold text-slate-900">{kpi.value}</div>
              <div className="text-[9px] text-slate-500">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">POS Transaction Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockPOSTransactionData, [{ header: "Bill No", key: "billNo" }, { header: "Date", key: "date" }, { header: "Time", key: "time" }, { header: "Cashier", key: "cashier" }, { header: "Customer", key: "customer" }, { header: "Items", key: "items" }, { header: "Gross Amt", key: "grossAmt" }, { header: "Discount", key: "discount" }, { header: "Net Amt", key: "netAmt" }, { header: "Pay Mode", key: "payMode" }, { header: "Status", key: "status" }], "POS_Transaction_Detail")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bill No</th>
                  <th className="px-3 py-2 text-left font-medium">Date / Time</th>
                  <th className="px-3 py-2 text-left font-medium">Cashier</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 text-right font-medium">Gross</th>
                  <th className="px-3 py-2 text-right font-medium">Discount</th>
                  <th className="px-3 py-2 text-right font-medium">Net Amt</th>
                  <th className="px-3 py-2 text-left font-medium">Pay Mode</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockPOSTransactionData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.billNo}</td>
                    <td className="px-3 py-2 text-slate-600">{row.date} {row.time}</td>
                    <td className="px-3 py-2 text-slate-800">{row.cashier}</td>
                    <td className="px-3 py-2 text-slate-700">{row.customer}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.items}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.grossAmt.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.discount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netAmt.toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-700">{row.payMode}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// POS Item Sales Report
function POSItemSalesReport() {
  useDataRevision();
  const totalNet = mockPOSItemSalesData.reduce((s, r) => s + r.netAmt, 0);
  useReportView("pos_item_sales", {
    sections: [
      {
        title: "POS Item Sales Detail",
        columns: [
          { key: "itemCode", header: "Code", align: "left", width: 12 },
          { key: "itemName", header: "Item Name", align: "left", width: 22 },
          { key: "category", header: "Category", align: "left", width: 16 },
          { key: "qtyOrdered", header: "Ordered", align: "right", width: 10 },
          { key: "qtySold", header: "Sold", align: "right", width: 10 },
          { key: "returns", header: "Returns", align: "right", width: 10 },
          { key: "grossAmt", header: "Gross Amt", align: "right", width: 14 },
          { key: "discount", header: "Discount", align: "right", width: 14 },
          { key: "netAmt", header: "Net Amt", align: "right", width: 14 },
          { key: "contribution", header: "Contrib%", align: "right", width: 10 },
        ],
        rows: mockPOSItemSalesData.map((row) => ({
          itemCode: row.itemCode,
          itemName: row.itemName,
          category: row.category,
          qtyOrdered: row.qtyOrdered,
          qtySold: row.qtySold,
          returns: row.returns,
          grossAmt: `AED ${row.grossAmt.toFixed(2)}`,
          discount: `AED ${row.discount.toFixed(2)}`,
          netAmt: `AED ${row.netAmt.toFixed(2)}`,
          contribution: `${row.contribution}%`,
        })),
        totals: {
          itemCode: "TOTAL",
          netAmt: `AED ${totalNet.toFixed(2)}`,
          contribution: "100%",
        },
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Top Items by Contribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockPOSItemSalesData.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="itemCode" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Bar dataKey="contribution" fill="#F5C742" name="Contribution %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Net Sales by Item</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockPOSItemSalesData.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis dataKey="itemCode" type="category" tick={{ fontSize: 9 }} width={55} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Bar dataKey="netAmt" fill="#3b82f6" name="Net Amount" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">POS Item Sales Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockPOSItemSalesData, [{ header: "Code", key: "itemCode" }, { header: "Item Name", key: "itemName" }, { header: "Category", key: "category" }, { header: "Ordered", key: "qtyOrdered" }, { header: "Sold", key: "qtySold" }, { header: "Returns", key: "returns" }, { header: "Gross Amt", key: "grossAmt" }, { header: "Discount", key: "discount" }, { header: "Net Amt", key: "netAmt" }, { header: "Contrib%", key: "contribution" }], "POS_Item_Sales_Detail")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Item Name</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Sold</th>
                  <th className="px-3 py-2 text-right font-medium">Returns</th>
                  <th className="px-3 py-2 text-right font-medium">Gross Amt</th>
                  <th className="px-3 py-2 text-right font-medium">Discount</th>
                  <th className="px-3 py-2 text-right font-medium">Net Amt</th>
                  <th className="px-3 py-2 text-right font-medium">Contrib%</th>
                </tr>
              </thead>
              <tbody>
                {mockPOSItemSalesData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.itemCode}</td>
                    <td className="px-3 py-2 text-slate-800 font-medium">{row.itemName}</td>
                    <td className="px-3 py-2 text-slate-600">{row.category}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.qtyOrdered}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.qtySold}</td>
                    <td className="px-3 py-2 text-right text-orange-600">{row.returns}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.grossAmt.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.discount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netAmt.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{row.contribution}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
                <tr>
                  <td colSpan={8} className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">AED {totalNet.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// POS Payment Mode Report
function POSPaymentModeReport() {
  useDataRevision();
  const COLORS = ['#F5C742', '#3b82f6', '#10b981', '#8b5cf6', '#f97316'];
  const total = mockPOSPaymentData.reduce((s, r) => s + r.netAmount, 0);
  useReportView("pos_payment_mode", {
    sections: [
      {
        title: "Payment Mode Breakdown",
        columns: [
          { key: "mode", header: "Mode", align: "left", width: 18 },
          { key: "transactions", header: "Transactions", align: "right", width: 14 },
          { key: "amount", header: "Gross Amount", align: "right", width: 16 },
          { key: "refunds", header: "Refunds", align: "right", width: 14 },
          { key: "netAmount", header: "Net Amount", align: "right", width: 16 },
          { key: "pct", header: "Share %", align: "right", width: 10 },
        ],
        rows: mockPOSPaymentData.map((row) => ({
          mode: row.mode,
          transactions: row.transactions,
          amount: `AED ${row.amount.toLocaleString()}`,
          refunds: `AED ${row.refunds.toLocaleString()}`,
          netAmount: `AED ${row.netAmount.toLocaleString()}`,
          pct: `${row.pct}%`,
        })),
        totals: {
          mode: "TOTAL",
          netAmount: `AED ${total.toLocaleString()}`,
          pct: "100%",
        },
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Payment Mix</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={mockPOSPaymentData} cx="50%" cy="50%" outerRadius={70} dataKey="netAmount"
                  label={({ mode, pct }) => `${mode.split(' ')[0]}: ${pct}%`} labelStyle={{ fontSize: '9px' }}>
                  {mockPOSPaymentData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Amount by Mode</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockPOSPaymentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mode" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Bar dataKey="amount" fill="#F5C742" name="Gross" />
                <Bar dataKey="refunds" fill="#ef4444" name="Refunds" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Payment Mode Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mode</th>
                  <th className="px-3 py-2 text-right font-medium">Transactions</th>
                  <th className="px-3 py-2 text-right font-medium">Gross Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Refunds</th>
                  <th className="px-3 py-2 text-right font-medium">Net Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Share %</th>
                </tr>
              </thead>
              <tbody>
                {mockPOSPaymentData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.mode}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.transactions}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">AED {row.refunds.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netAmount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-[#F5C742] rounded-full" style={{ width: `${row.pct}%` }} />
                        </div>
                        <span className="text-slate-700">{row.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
                <tr>
                  <td colSpan={4} className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">AED {total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// POS Void & Cancellation Report
function POSVoidReport() {
  useDataRevision();
  const totalValue = mockVoidData.reduce((s, r) => s + r.value, 0);
  useReportView("pos_void_cancellation", {
    kpis: [
      { label: "Total Void/Cancel Value", value: `AED ${totalValue.toFixed(2)}` },
      { label: "Void Count", value: String(mockVoidData.filter(r => r.status === "Void").length) },
      { label: "Cancellation Count", value: String(mockVoidData.filter(r => r.status === "Cancelled").length) },
    ],
    sections: [
      {
        title: "Void & Cancellation Log",
        columns: [
          { key: "billNo", header: "Bill No", align: "left", width: 14 },
          { key: "dateTime", header: "Date / Time", align: "left", width: 18 },
          { key: "cashier", header: "Cashier", align: "left", width: 16 },
          { key: "value", header: "Value", align: "right", width: 14 },
          { key: "reason", header: "Reason", align: "left", width: 22 },
          { key: "approvedBy", header: "Approved By", align: "left", width: 16 },
          { key: "status", header: "Status", align: "left", width: 12 },
        ],
        rows: mockVoidData.map((row) => ({
          billNo: row.billNo,
          dateTime: `${row.date} ${row.time}`,
          cashier: row.cashier,
          value: `AED ${row.value.toFixed(2)}`,
          reason: row.reason,
          approvedBy: row.approvedBy,
          status: row.status,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="p-3">
            <div className="text-[10px] text-red-700 mb-1">Total Void/Cancel Value</div>
            <div className="text-xl font-bold text-red-800">AED {totalValue.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Void Count</div>
            <div className="text-xl font-bold text-slate-900">{mockVoidData.filter(r => r.status === "Void").length}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Cancellation Count</div>
            <div className="text-xl font-bold text-slate-900">{mockVoidData.filter(r => r.status === "Cancelled").length}</div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Void &amp; Cancellation Log</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockVoidData, [{ header: "Bill No", key: "billNo" }, { header: "Date", key: "date" }, { header: "Time", key: "time" }, { header: "Cashier", key: "cashier" }, { header: "Value", key: "value" }, { header: "Reason", key: "reason" }, { header: "Approved By", key: "approvedBy" }, { header: "Status", key: "status" }], "Void_Cancellation_Log")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bill No</th>
                  <th className="px-3 py-2 text-left font-medium">Date / Time</th>
                  <th className="px-3 py-2 text-left font-medium">Cashier</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Approved By</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockVoidData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.billNo}</td>
                    <td className="px-3 py-2 text-slate-600">{row.date} {row.time}</td>
                    <td className="px-3 py-2 text-slate-800">{row.cashier}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-700">AED {row.value.toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                    <td className="px-3 py-2 text-slate-600">{row.approvedBy}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${row.status === "Void" ? "text-red-600 bg-red-50 border-red-200" : "text-orange-600 bg-orange-50 border-orange-200"}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// VAN Sales Summary Report
function VANSalesSummaryReport() {
  useDataRevision();
  const totalNetSales = mockVANSalesSummaryData.reduce((s, r) => s + r.netSales, 0);
  const totalCollection = mockVANSalesSummaryData.reduce((s, r) => s + r.collection, 0);
  useReportView("van_sales_summary", {
    kpis: [
      { label: "Total Net Sales", value: `AED ${totalNetSales.toLocaleString()}` },
      { label: "Total Collected", value: `AED ${totalCollection.toLocaleString()}` },
      { label: "Routes Active", value: String(mockVANSalesSummaryData.length) },
      { label: "Total Visits", value: String(mockVANSalesSummaryData.reduce((s, r) => s + r.actualVisits, 0)) },
    ],
    sections: [
      {
        title: "VAN Route Summary",
        columns: [
          { key: "route", header: "Route", align: "left", width: 14 },
          { key: "salesperson", header: "Salesperson", align: "left", width: 18 },
          { key: "visits", header: "Planned Visits", align: "right", width: 14 },
          { key: "actualVisits", header: "Actual Visits", align: "right", width: 14 },
          { key: "stockIssued", header: "Stock Issued", align: "right", width: 16 },
          { key: "netSales", header: "Net Sales", align: "right", width: 16 },
          { key: "collection", header: "Collection", align: "right", width: 16 },
        ],
        rows: mockVANSalesSummaryData.map((row) => ({
          route: row.route,
          salesperson: row.salesperson,
          visits: row.visits,
          actualVisits: row.actualVisits,
          stockIssued: `AED ${row.stockIssued.toLocaleString()}`,
          netSales: `AED ${row.netSales.toLocaleString()}`,
          collection: `AED ${row.collection.toLocaleString()}`,
        })),
        totals: {
          route: "TOTAL",
          netSales: `AED ${totalNetSales.toLocaleString()}`,
          collection: `AED ${totalCollection.toLocaleString()}`,
        },
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-2 border-[#F5C742] bg-[#FFF6D8]">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total Net Sales</div>
            <div className="text-xl font-bold text-slate-900">AED {totalNetSales.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total Collected</div>
            <div className="text-xl font-bold text-emerald-700">AED {totalCollection.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Routes Active</div>
            <div className="text-xl font-bold text-slate-900">{mockVANSalesSummaryData.length}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total Visits</div>
            <div className="text-xl font-bold text-slate-900">{mockVANSalesSummaryData.reduce((s, r) => s + r.actualVisits, 0)}</div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Net Sales by Route</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mockVANSalesSummaryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="route" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="netSales" fill="#F5C742" name="Net Sales" />
              <Bar dataKey="collection" fill="#3b82f6" name="Collection" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">VAN Route Summary</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Route</th>
                  <th className="px-3 py-2 text-left font-medium">Salesperson</th>
                  <th className="px-3 py-2 text-right font-medium">Planned Visits</th>
                  <th className="px-3 py-2 text-right font-medium">Actual Visits</th>
                  <th className="px-3 py-2 text-right font-medium">Stock Issued</th>
                  <th className="px-3 py-2 text-right font-medium">Net Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Collection</th>
                </tr>
              </thead>
              <tbody>
                {mockVANSalesSummaryData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.route}</td>
                    <td className="px-3 py-2 text-slate-700">{row.salesperson}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.visits}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.actualVisits}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.stockIssued.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">AED {row.collection.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// VAN Item Sales Report
function VANItemSalesReport() {
  useDataRevision();
  useReportView("van_item_sales", {
    sections: [
      {
        title: "VAN Item Sales Report",
        columns: [
          { key: "item", header: "Item", align: "left", width: 22 },
          { key: "route", header: "Route", align: "left", width: 14 },
          { key: "qtySold", header: "Qty Sold", align: "right", width: 12 },
          { key: "qtyReturned", header: "Returned", align: "right", width: 12 },
          { key: "freeIssue", header: "Free Issue", align: "right", width: 12 },
          { key: "netQty", header: "Net Qty", align: "right", width: 12 },
          { key: "value", header: "Value", align: "right", width: 16 },
        ],
        rows: mockVANItemData.map((row) => ({
          item: row.item,
          route: row.route,
          qtySold: row.qtySold,
          qtyReturned: row.qtyReturned,
          freeIssue: row.freeIssue,
          netQty: row.netQty,
          value: `AED ${row.value.toLocaleString()}`,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-800">VAN Item Sales Report</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockVANItemData, [{ header: "Item", key: "item" }, { header: "Route", key: "route" }, { header: "Qty Sold", key: "qtySold" }, { header: "Returned", key: "qtyReturned" }, { header: "Free Issue", key: "freeIssue" }, { header: "Net Qty", key: "netQty" }, { header: "Value", key: "value" }], "VAN_Item_Sales")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-left font-medium">Route</th>
                <th className="px-3 py-2 text-right font-medium">Qty Sold</th>
                <th className="px-3 py-2 text-right font-medium">Returned</th>
                <th className="px-3 py-2 text-right font-medium">Free Issue</th>
                <th className="px-3 py-2 text-right font-medium">Net Qty</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {mockVANItemData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.item}</td>
                  <td className="px-3 py-2 text-slate-600">{row.route}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{row.qtySold}</td>
                  <td className="px-3 py-2 text-right text-orange-600">{row.qtyReturned}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{row.freeIssue}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{row.netQty}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// VAN Route Performance Report
function VANRoutePerformanceReport() {
  useDataRevision();
  useReportView("van_route_performance", {
    sections: [
      {
        title: "Route Performance Detail",
        columns: [
          { key: "route", header: "Route", align: "left", width: 14 },
          { key: "planned", header: "Planned", align: "right", width: 12 },
          { key: "actual", header: "Actual", align: "right", width: 12 },
          { key: "conversion", header: "Conversion %", align: "right", width: 12 },
          { key: "salesTarget", header: "Sales Target", align: "right", width: 16 },
          { key: "salesActual", header: "Sales Actual", align: "right", width: 16 },
          { key: "collection", header: "Collection", align: "right", width: 16 },
          { key: "outstanding", header: "Outstanding", align: "right", width: 16 },
        ],
        rows: mockVANRouteData.map((row) => ({
          route: row.route,
          planned: row.planned,
          actual: row.actual,
          conversion: `${row.conversion}%`,
          salesTarget: `AED ${row.salesTarget.toLocaleString()}`,
          salesActual: `AED ${row.salesActual.toLocaleString()}`,
          collection: `AED ${row.collection.toLocaleString()}`,
          outstanding: `AED ${row.outstanding.toLocaleString()}`,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Planned vs Actual Sales by Route</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mockVANRouteData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="route" tick={{ fontSize: 8 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="salesTarget" fill="#e2e8f0" name="Target" />
              <Bar dataKey="salesActual" fill="#F5C742" name="Actual" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Route Performance Detail</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Route</th>
                  <th className="px-3 py-2 text-right font-medium">Planned</th>
                  <th className="px-3 py-2 text-right font-medium">Actual</th>
                  <th className="px-3 py-2 text-right font-medium">Conversion %</th>
                  <th className="px-3 py-2 text-right font-medium">Sales Target</th>
                  <th className="px-3 py-2 text-right font-medium">Sales Actual</th>
                  <th className="px-3 py-2 text-right font-medium">Collection</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {mockVANRouteData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.route}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.planned}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.actual}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${row.conversion >= 95 ? 'text-emerald-600' : row.conversion >= 85 ? 'text-amber-600' : 'text-red-600'}`}>{row.conversion}%</span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.salesTarget.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.salesActual.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">AED {row.collection.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">AED {row.outstanding.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// VAN Collection Report
function VANCollectionReport() {
  useDataRevision();
  useReportView("van_collection", {
    sections: [
      {
        title: "VAN Collection Report",
        columns: [
          { key: "salesperson", header: "Salesperson", align: "left", width: 18 },
          { key: "route", header: "Route", align: "left", width: 14 },
          { key: "cashCollected", header: "Cash", align: "right", width: 14 },
          { key: "cardCollected", header: "Card", align: "right", width: 14 },
          { key: "creditSales", header: "Credit Sales", align: "right", width: 16 },
          { key: "totalCollected", header: "Total Collected", align: "right", width: 16 },
          { key: "pending", header: "Pending", align: "right", width: 14 },
          { key: "variance", header: "Variance", align: "right", width: 12 },
        ],
        rows: mockVANCollectionData.map((row) => ({
          salesperson: row.salesperson,
          route: row.route,
          cashCollected: `AED ${row.cashCollected.toLocaleString()}`,
          cardCollected: `AED ${row.cardCollected.toLocaleString()}`,
          creditSales: `AED ${row.creditSales.toLocaleString()}`,
          totalCollected: `AED ${row.totalCollected.toLocaleString()}`,
          pending: `AED ${row.pending.toLocaleString()}`,
          variance: `AED ${row.variance}`,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-800">VAN Collection Report</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockVANCollectionData, [{ header: "Salesperson", key: "salesperson" }, { header: "Route", key: "route" }, { header: "Cash", key: "cashCollected" }, { header: "Card", key: "cardCollected" }, { header: "Credit Sales", key: "creditSales" }, { header: "Total Collected", key: "totalCollected" }, { header: "Pending", key: "pending" }, { header: "Variance", key: "variance" }], "VAN_Collection")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Salesperson</th>
                <th className="px-3 py-2 text-left font-medium">Route</th>
                <th className="px-3 py-2 text-right font-medium">Cash</th>
                <th className="px-3 py-2 text-right font-medium">Card</th>
                <th className="px-3 py-2 text-right font-medium">Credit Sales</th>
                <th className="px-3 py-2 text-right font-medium">Total Collected</th>
                <th className="px-3 py-2 text-right font-medium">Pending</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {mockVANCollectionData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.salesperson}</td>
                  <td className="px-3 py-2 text-slate-600">{row.route}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.cashCollected.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.cardCollected.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-orange-600">AED {row.creditSales.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.totalCollected.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-600">AED {row.pending.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-semibold ${row.variance < 0 ? 'text-red-600' : row.variance > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>AED {row.variance}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// VAN Stock Variance Report
function VANStockVarianceReport() {
  useDataRevision();
  useReportView("van_stock_variance", {
    sections: [
      {
        title: "VAN Stock Variance Report",
        columns: [
          { key: "salesperson", header: "Salesperson", align: "left", width: 18 },
          { key: "route", header: "Route", align: "left", width: 14 },
          { key: "issued", header: "Issued", align: "right", width: 14 },
          { key: "sold", header: "Sold", align: "right", width: 14 },
          { key: "returned", header: "Returned", align: "right", width: 14 },
          { key: "expected", header: "Expected Balance", align: "right", width: 16 },
          { key: "actual", header: "Actual Balance", align: "right", width: 16 },
          { key: "variance", header: "Variance", align: "right", width: 12 },
        ],
        rows: mockVANStockData.map((row) => ({
          salesperson: row.salesperson,
          route: row.route,
          issued: `AED ${row.issued.toLocaleString()}`,
          sold: `AED ${row.sold.toLocaleString()}`,
          returned: `AED ${row.returned.toLocaleString()}`,
          expected: `AED ${row.expected.toLocaleString()}`,
          actual: `AED ${row.actual.toLocaleString()}`,
          variance: `AED ${row.variance}`,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-800">VAN Stock Variance Report</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockVANStockData, [{ header: "Salesperson", key: "salesperson" }, { header: "Route", key: "route" }, { header: "Issued", key: "issued" }, { header: "Sold", key: "sold" }, { header: "Returned", key: "returned" }, { header: "Expected Balance", key: "expected" }, { header: "Actual Balance", key: "actual" }, { header: "Variance", key: "variance" }], "VAN_Stock_Variance")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Salesperson</th>
                <th className="px-3 py-2 text-left font-medium">Route</th>
                <th className="px-3 py-2 text-right font-medium">Issued</th>
                <th className="px-3 py-2 text-right font-medium">Sold</th>
                <th className="px-3 py-2 text-right font-medium">Returned</th>
                <th className="px-3 py-2 text-right font-medium">Expected Balance</th>
                <th className="px-3 py-2 text-right font-medium">Actual Balance</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {mockVANStockData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.salesperson}</td>
                  <td className="px-3 py-2 text-slate-600">{row.route}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.issued.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.sold.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-orange-600">AED {row.returned.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.expected.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.actual.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-bold ${row.variance < 0 ? 'text-red-600' : row.variance > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>AED {row.variance}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Sales Invoice Register
function SalesInvoiceRegisterReport() {
  useDataRevision();
  const statusColor = (s: string) => {
    if (s === "Paid") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (s === "Overdue") return "text-red-700 bg-red-50 border-red-200";
    if (s === "Partial") return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  };
  const totals = mockInvoiceRegisterData.reduce((acc, r) => ({
    amount: acc.amount + r.amount,
    tax: acc.tax + r.tax,
    total: acc.total + r.total,
    outstanding: acc.outstanding + r.outstanding,
  }), { amount: 0, tax: 0, total: 0, outstanding: 0 });

  useReportView("sales_invoice_register", {
    kpis: [
      { label: "Total Invoiced", value: `AED ${totals.total.toLocaleString()}` },
      { label: "Outstanding", value: `AED ${totals.outstanding.toLocaleString()}` },
      { label: "Paid Invoices", value: String(mockInvoiceRegisterData.filter(r => r.status === "Paid").length) },
      { label: "Overdue Invoices", value: String(mockInvoiceRegisterData.filter(r => r.status === "Overdue").length) },
    ],
    sections: [
      {
        title: "Sales Invoice Register",
        columns: [
          { key: "invoiceNo", header: "Invoice No", align: "left", width: 14 },
          { key: "date", header: "Date", align: "left", width: 12 },
          { key: "customer", header: "Customer", align: "left", width: 18 },
          { key: "salesperson", header: "Salesperson", align: "left", width: 16 },
          { key: "amount", header: "Amount", align: "right", width: 14 },
          { key: "tax", header: "Tax", align: "right", width: 12 },
          { key: "total", header: "Total", align: "right", width: 14 },
          { key: "outstanding", header: "Outstanding", align: "right", width: 14 },
          { key: "dueDate", header: "Due Date", align: "left", width: 12 },
          { key: "status", header: "Status", align: "left", width: 12 },
        ],
        rows: mockInvoiceRegisterData.map((row) => ({
          invoiceNo: row.invoiceNo,
          date: row.date,
          customer: row.customer,
          salesperson: row.salesperson,
          amount: `AED ${row.amount.toLocaleString()}`,
          tax: `AED ${row.tax.toLocaleString()}`,
          total: `AED ${row.total.toLocaleString()}`,
          outstanding: `AED ${row.outstanding.toLocaleString()}`,
          dueDate: row.dueDate,
          status: row.status,
        })),
        totals: {
          invoiceNo: "TOTAL",
          amount: `AED ${totals.amount.toLocaleString()}`,
          tax: `AED ${totals.tax.toLocaleString()}`,
          total: `AED ${totals.total.toLocaleString()}`,
          outstanding: `AED ${totals.outstanding.toLocaleString()}`,
        },
      },
    ],
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-2 border-[#F5C742] bg-[#FFF6D8]">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total Invoiced</div>
            <div className="text-xl font-bold text-slate-900">AED {totals.total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Outstanding</div>
            <div className="text-xl font-bold text-red-700">AED {totals.outstanding.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Paid Invoices</div>
            <div className="text-xl font-bold text-emerald-700">{mockInvoiceRegisterData.filter(r => r.status === "Paid").length}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Overdue Invoices</div>
            <div className="text-xl font-bold text-red-700">{mockInvoiceRegisterData.filter(r => r.status === "Overdue").length}</div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Sales Invoice Register</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockInvoiceRegisterData, [{ header: "Invoice No", key: "invoiceNo" }, { header: "Date", key: "date" }, { header: "Customer", key: "customer" }, { header: "Salesperson", key: "salesperson" }, { header: "Amount", key: "amount" }, { header: "Tax", key: "tax" }, { header: "Total", key: "total" }, { header: "Outstanding", key: "outstanding" }, { header: "Due Date", key: "dueDate" }, { header: "Status", key: "status" }], "Sales_Invoice_Register")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Invoice No</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Salesperson</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Tax</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2 text-left font-medium">Due Date</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockInvoiceRegisterData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.invoiceNo}</td>
                    <td className="px-3 py-2 text-slate-600">{row.date}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                    <td className="px-3 py-2 text-slate-600">{row.salesperson}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-blue-600">AED {row.tax.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">AED {row.outstanding.toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-600">{row.dueDate}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
                <tr>
                  <td colSpan={4} className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">AED {totals.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.tax.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.outstanding.toLocaleString()}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Sales Order Status Report
function SalesOrderStatusReport() {
  useDataRevision();
  const statusColor = (s: string) => {
    if (s === "Fully Delivered") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (s === "Partial") return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  };
  useReportView("sales_order_status", {
    kpis: [
      { label: "Fully Delivered", value: `${mockOrderStatusData.filter(r => r.status === "Fully Delivered").length} orders` },
      { label: "Partial", value: `${mockOrderStatusData.filter(r => r.status === "Partial").length} orders` },
      { label: "Pending", value: `${mockOrderStatusData.filter(r => r.status === "Pending").length} orders` },
    ],
    sections: [
      {
        title: "Sales Order Status",
        columns: [
          { key: "orderNo", header: "Order No", align: "left", width: 14 },
          { key: "date", header: "Date", align: "left", width: 12 },
          { key: "customer", header: "Customer", align: "left", width: 18 },
          { key: "orderedQty", header: "Ordered Qty", align: "right", width: 12 },
          { key: "deliveredQty", header: "Delivered", align: "right", width: 12 },
          { key: "pendingQty", header: "Pending", align: "right", width: 12 },
          { key: "orderedValue", header: "Order Value", align: "right", width: 16 },
          { key: "deliveredValue", header: "Delivered Value", align: "right", width: 16 },
          { key: "status", header: "Status", align: "left", width: 14 },
        ],
        rows: mockOrderStatusData.map((row) => ({
          orderNo: row.orderNo,
          date: row.date,
          customer: row.customer,
          orderedQty: row.orderedQty,
          deliveredQty: row.deliveredQty,
          pendingQty: row.pendingQty,
          orderedValue: `AED ${row.orderedValue.toLocaleString()}`,
          deliveredValue: `AED ${row.deliveredValue.toLocaleString()}`,
          status: row.status,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Fully Delivered", count: mockOrderStatusData.filter(r => r.status === "Fully Delivered").length, color: "text-emerald-700" },
          { label: "Partial", count: mockOrderStatusData.filter(r => r.status === "Partial").length, color: "text-amber-700" },
          { label: "Pending", count: mockOrderStatusData.filter(r => r.status === "Pending").length, color: "text-slate-700" },
        ].map((kpi, i) => (
          <Card key={i} className="border border-slate-200 bg-white">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-600 mb-1">{kpi.label}</div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.count} orders</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Sales Order Status</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockOrderStatusData, [{ header: "Order No", key: "orderNo" }, { header: "Date", key: "date" }, { header: "Customer", key: "customer" }, { header: "Ordered Qty", key: "orderedQty" }, { header: "Delivered", key: "deliveredQty" }, { header: "Pending", key: "pendingQty" }, { header: "Order Value", key: "orderedValue" }, { header: "Delivered Value", key: "deliveredValue" }, { header: "Status", key: "status" }], "Sales_Order_Status")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Order No</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Delivered</th>
                  <th className="px-3 py-2 text-right font-medium">Pending</th>
                  <th className="px-3 py-2 text-right font-medium">Order Value</th>
                  <th className="px-3 py-2 text-right font-medium">Delivered Value</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockOrderStatusData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.orderNo}</td>
                    <td className="px-3 py-2 text-slate-600">{row.date}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.orderedQty}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{row.deliveredQty}</td>
                    <td className="px-3 py-2 text-right text-orange-600">{row.pendingQty}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.orderedValue.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.deliveredValue.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Delivery / Dispatch Report
function DeliveryDispatchReport() {
  useDataRevision();
  const statusColor = (s: string) => {
    if (s === "Delivered") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (s === "In Transit") return "text-blue-700 bg-blue-50 border-blue-200";
    if (s === "Failed") return "text-red-700 bg-red-50 border-red-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  };
  useReportView("delivery_dispatch", {
    kpis: [
      { label: "Delivered", value: String(mockDeliveryData.filter(r => r.status === "Delivered").length) },
      { label: "In Transit", value: String(mockDeliveryData.filter(r => r.status === "In Transit").length) },
      { label: "Failed", value: String(mockDeliveryData.filter(r => r.status === "Failed").length) },
    ],
    sections: [
      {
        title: "Delivery / Dispatch Log",
        columns: [
          { key: "dnNo", header: "DN No", align: "left", width: 14 },
          { key: "date", header: "Date", align: "left", width: 12 },
          { key: "customer", header: "Customer", align: "left", width: 18 },
          { key: "driver", header: "Driver", align: "left", width: 14 },
          { key: "vehicle", header: "Vehicle", align: "left", width: 12 },
          { key: "items", header: "Items", align: "right", width: 10 },
          { key: "weight", header: "Weight", align: "left", width: 12 },
          { key: "deliveredAt", header: "Delivered At", align: "left", width: 16 },
          { key: "pod", header: "POD", align: "left", width: 12 },
          { key: "status", header: "Status", align: "left", width: 12 },
        ],
        rows: mockDeliveryData.map((row) => ({
          dnNo: row.dnNo,
          date: row.date,
          customer: row.customer,
          driver: row.driver,
          vehicle: row.vehicle,
          items: row.items,
          weight: row.weight,
          deliveredAt: row.deliveredAt,
          pod: row.pod,
          status: row.status,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Delivered", count: mockDeliveryData.filter(r => r.status === "Delivered").length, color: "text-emerald-700" },
          { label: "In Transit", count: mockDeliveryData.filter(r => r.status === "In Transit").length, color: "text-blue-700" },
          { label: "Failed", count: mockDeliveryData.filter(r => r.status === "Failed").length, color: "text-red-700" },
        ].map((kpi, i) => (
          <Card key={i} className="border border-slate-200 bg-white">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-600 mb-1">{kpi.label}</div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.count}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Delivery / Dispatch Log</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockDeliveryData, [{ header: "DN No", key: "dnNo" }, { header: "Date", key: "date" }, { header: "Customer", key: "customer" }, { header: "Driver", key: "driver" }, { header: "Vehicle", key: "vehicle" }, { header: "Items", key: "items" }, { header: "Weight", key: "weight" }, { header: "Delivered At", key: "deliveredAt" }, { header: "POD", key: "pod" }, { header: "Status", key: "status" }], "Delivery_Dispatch_Log")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">DN No</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Driver</th>
                  <th className="px-3 py-2 text-left font-medium">Vehicle</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 text-left font-medium">Weight</th>
                  <th className="px-3 py-2 text-left font-medium">Delivered At</th>
                  <th className="px-3 py-2 text-left font-medium">POD</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockDeliveryData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.dnNo}</td>
                    <td className="px-3 py-2 text-slate-600">{row.date}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                    <td className="px-3 py-2 text-slate-700">{row.driver}</td>
                    <td className="px-3 py-2 text-slate-600">{row.vehicle}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.items}</td>
                    <td className="px-3 py-2 text-slate-700">{row.weight}</td>
                    <td className="px-3 py-2 text-slate-700">{row.deliveredAt}</td>
                    <td className="px-3 py-2 text-slate-600">{row.pod}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Credit Note & Returns Report
function CreditNoteReturnsReport() {
  useDataRevision();
  const statusColor = (s: string) => {
    if (s === "Approved") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (s === "Rejected") return "text-red-700 bg-red-50 border-red-200";
    return "text-amber-700 bg-amber-50 border-amber-200";
  };
  const totalReturn = mockCreditNoteData.reduce((s, r) => s + r.returnValue, 0);
  useReportView("credit_note_returns", {
    kpis: [
      { label: "Total Return Value", value: `AED ${totalReturn.toLocaleString()}` },
      { label: "Approved CNs", value: String(mockCreditNoteData.filter(r => r.status === "Approved").length) },
      { label: "Pending CNs", value: String(mockCreditNoteData.filter(r => r.status === "Pending").length) },
    ],
    sections: [
      {
        title: "Credit Note & Returns Register",
        columns: [
          { key: "cnNo", header: "CN No", align: "left", width: 14 },
          { key: "date", header: "Date", align: "left", width: 12 },
          { key: "customer", header: "Customer", align: "left", width: 18 },
          { key: "linkedInvoice", header: "Linked Invoice", align: "left", width: 14 },
          { key: "reason", header: "Reason", align: "left", width: 18 },
          { key: "items", header: "Items", align: "right", width: 10 },
          { key: "returnValue", header: "Return Value", align: "right", width: 16 },
          { key: "total", header: "Total w/ Tax", align: "right", width: 16 },
          { key: "status", header: "Status", align: "left", width: 12 },
        ],
        rows: mockCreditNoteData.map((row) => ({
          cnNo: row.cnNo,
          date: row.date,
          customer: row.customer,
          linkedInvoice: row.linkedInvoice,
          reason: row.reason,
          items: row.items,
          returnValue: `AED ${row.returnValue.toLocaleString()}`,
          total: `AED ${row.total.toLocaleString()}`,
          status: row.status,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-2 border-[#F5C742] bg-[#FFF6D8]">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total Return Value</div>
            <div className="text-xl font-bold text-slate-900">AED {totalReturn.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Approved CNs</div>
            <div className="text-xl font-bold text-emerald-700">{mockCreditNoteData.filter(r => r.status === "Approved").length}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Pending CNs</div>
            <div className="text-xl font-bold text-amber-700">{mockCreditNoteData.filter(r => r.status === "Pending").length}</div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Credit Note &amp; Returns Register</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockCreditNoteData, [{ header: "CN No", key: "cnNo" }, { header: "Date", key: "date" }, { header: "Customer", key: "customer" }, { header: "Linked Invoice", key: "linkedInvoice" }, { header: "Reason", key: "reason" }, { header: "Items", key: "items" }, { header: "Return Value", key: "returnValue" }, { header: "Total w/ Tax", key: "total" }, { header: "Status", key: "status" }], "Credit_Note_Returns")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">CN No</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Linked Invoice</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 text-right font-medium">Return Value</th>
                  <th className="px-3 py-2 text-right font-medium">Total w/ Tax</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockCreditNoteData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.cnNo}</td>
                    <td className="px-3 py-2 text-slate-600">{row.date}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-600">{row.linkedInvoice}</td>
                    <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.items}</td>
                    <td className="px-3 py-2 text-right text-orange-700">AED {row.returnValue.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">AED {row.total.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Customer Aging Report
function CustomerAgingReport() {
  useDataRevision();
  const riskColor = (r: string) => {
    if (r === "High") return "text-red-700 bg-red-50 border-red-200";
    if (r === "Medium") return "text-amber-700 bg-amber-50 border-amber-200";
    if (r === "Low") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    return "text-slate-500 bg-slate-50 border-slate-200";
  };
  const totals = mockAgingData.reduce((acc, r) => ({
    current: acc.current + r.current,
    days30: acc.days30 + r.days30,
    days60: acc.days60 + r.days60,
    days90: acc.days90 + r.days90,
    over90: acc.over90 + r.over90,
    total: acc.total + r.total,
  }), { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 });

  const agingChartData = [
    { bucket: "Current", value: totals.current },
    { bucket: "1-30 days", value: totals.days30 },
    { bucket: "31-60 days", value: totals.days60 },
    { bucket: "61-90 days", value: totals.days90 },
    { bucket: "90+ days", value: totals.over90 },
  ];

  useReportView("customer_aging", {
    kpis: [{ label: "Total Outstanding", value: `AED ${totals.total.toLocaleString()}` }],
    sections: [
      {
        title: "Customer Aging Detail",
        columns: [
          { key: "customer", header: "Customer", align: "left", width: 20 },
          { key: "creditLimit", header: "Credit Limit", align: "right", width: 14 },
          { key: "current", header: "Current", align: "right", width: 14 },
          { key: "days30", header: "1-30 Days", align: "right", width: 14 },
          { key: "days60", header: "31-60 Days", align: "right", width: 14 },
          { key: "days90", header: "61-90 Days", align: "right", width: 14 },
          { key: "over90", header: "90+ Days", align: "right", width: 14 },
          { key: "total", header: "Total", align: "right", width: 14 },
          { key: "riskLevel", header: "Risk", align: "left", width: 10 },
        ],
        rows: mockAgingData.map((row) => ({
          customer: row.customer,
          creditLimit: `AED ${row.creditLimit.toLocaleString()}`,
          current: `AED ${row.current.toLocaleString()}`,
          days30: `AED ${row.days30.toLocaleString()}`,
          days60: `AED ${row.days60.toLocaleString()}`,
          days90: `AED ${row.days90.toLocaleString()}`,
          over90: `AED ${row.over90.toLocaleString()}`,
          total: `AED ${row.total.toLocaleString()}`,
          riskLevel: row.riskLevel,
        })),
        totals: {
          customer: "TOTAL",
          current: `AED ${totals.current.toLocaleString()}`,
          days30: `AED ${totals.days30.toLocaleString()}`,
          days60: `AED ${totals.days60.toLocaleString()}`,
          days90: `AED ${totals.days90.toLocaleString()}`,
          over90: `AED ${totals.over90.toLocaleString()}`,
          total: `AED ${totals.total.toLocaleString()}`,
        },
      },
    ],
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Aging Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agingChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
                <Bar dataKey="value" fill="#F5C742" name="Outstanding" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Aging Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 text-[11px] space-y-2">
            {agingChartData.map((b, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-slate-600">{b.bucket}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-[#F5C742] rounded-full" style={{ width: `${totals.total > 0 ? (b.value / totals.total * 100) : 0}%` }} />
                  </div>
                  <span className="font-semibold w-24 text-right text-slate-800">AED {b.value.toLocaleString()}</span>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold text-slate-900">
              <span>Total Outstanding</span>
              <span className="text-red-600">AED {totals.total.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Customer Aging Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockAgingData, [{ header: "Customer", key: "customer" }, { header: "Credit Limit", key: "creditLimit" }, { header: "Current", key: "current" }, { header: "1-30 Days", key: "days30" }, { header: "31-60 Days", key: "days60" }, { header: "61-90 Days", key: "days90" }, { header: "90+ Days", key: "over90" }, { header: "Total", key: "total" }, { header: "Risk Level", key: "riskLevel" }], "Customer_Aging")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Credit Limit</th>
                  <th className="px-3 py-2 text-right font-medium">Current</th>
                  <th className="px-3 py-2 text-right font-medium">1-30 Days</th>
                  <th className="px-3 py-2 text-right font-medium">31-60 Days</th>
                  <th className="px-3 py-2 text-right font-medium">61-90 Days</th>
                  <th className="px-3 py-2 text-right font-medium">90+ Days</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-left font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {mockAgingData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                    <td className="px-3 py-2 text-right text-slate-600">AED {row.creditLimit.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">AED {row.current.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-amber-600">AED {row.days30.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.days60.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">AED {row.days90.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-bold text-red-700">AED {row.over90.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.total.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${riskColor(row.riskLevel)}`}>{row.riskLevel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">AED {totals.current.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.days30.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.days60.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.days90.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.over90.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.total.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Top / Dormant Customers Report
function TopDormantCustomersReport() {
  useDataRevision();
  useReportView("top_dormant_customers", {
    sections: [
      {
        title: "Top Customers by Revenue",
        columns: [
          { key: "rank", header: "#", align: "left", width: 6 },
          { key: "customer", header: "Customer", align: "left", width: 24 },
          { key: "netSales", header: "Net Sales", align: "right", width: 16 },
          { key: "growth", header: "Growth", align: "right", width: 12 },
        ],
        rows: mockTopDormantData.top.map((row) => ({
          rank: `#${row.rank}`,
          customer: row.customer,
          netSales: `AED ${row.netSales.toLocaleString()}`,
          growth: `${row.growth > 0 ? "+" : ""}${row.growth}%`,
        })),
      },
      {
        title: "Dormant / At-Risk Customers",
        columns: [
          { key: "customer", header: "Customer", align: "left", width: 24 },
          { key: "lastPurchase", header: "Last Purchase", align: "right", width: 16 },
          { key: "daysSince", header: "Days Since", align: "right", width: 12 },
          { key: "status", header: "Status", align: "left", width: 12 },
        ],
        rows: mockTopDormantData.dormant.map((row) => ({
          customer: row.customer,
          lastPurchase: row.lastPurchase,
          daysSince: `${row.daysSince}d`,
          status: row.status,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-2 border-[#F5C742] bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Top Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="bb-nowrap-table w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Customer</th>
                    <th className="px-3 py-2 text-right font-medium">Net Sales</th>
                    <th className="px-3 py-2 text-right font-medium">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {mockTopDormantData.top.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 font-bold text-[#F5C742]">#{row.rank}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netSales.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-semibold ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{row.growth > 0 ? "+" : ""}{row.growth}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-orange-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Dormant / At-Risk Customers</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="bb-nowrap-table w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Customer</th>
                    <th className="px-3 py-2 text-right font-medium">Last Purchase</th>
                    <th className="px-3 py-2 text-right font-medium">Days Since</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mockTopDormantData.dormant.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{row.lastPurchase}</td>
                      <td className="px-3 py-2 text-right text-red-600 font-semibold">{row.daysSince}d</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${row.status === "At Risk" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Top Customers Revenue Comparison</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={mockTopDormantData.top}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="customer" tick={{ fontSize: 8 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
              <Bar dataKey="netSales" fill="#F5C742" name="Net Sales" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// Customer Price Level Report
function CustomerPriceLevelReport() {
  useDataRevision();
  useReportView("customer_price_level", {
    sections: [
      {
        title: "Customer Price Level Report",
        columns: [
          { key: "customer", header: "Customer", align: "left", width: 20 },
          { key: "priceLevel", header: "Price Level", align: "left", width: 14 },
          { key: "discountPct", header: "Discount %", align: "right", width: 12 },
          { key: "creditDays", header: "Credit Days", align: "right", width: 12 },
          { key: "minOrderValue", header: "Min Order", align: "right", width: 14 },
          { key: "specialItems", header: "Special Items", align: "right", width: 12 },
          { key: "marginImpact", header: "Margin Impact", align: "right", width: 12 },
        ],
        rows: mockPriceLevelData.map((row) => ({
          customer: row.customer,
          priceLevel: row.priceLevel,
          discountPct: `${row.discountPct}%`,
          creditDays: `${row.creditDays} days`,
          minOrderValue: `AED ${row.minOrderValue.toLocaleString()}`,
          specialItems: row.specialItems,
          marginImpact: `${row.marginImpact}%`,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-800">Customer Price Level Report</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockPriceLevelData, [{ header: "Customer", key: "customer" }, { header: "Price Level", key: "priceLevel" }, { header: "Discount %", key: "discountPct" }, { header: "Credit Days", key: "creditDays" }, { header: "Min Order", key: "minOrderValue" }, { header: "Special Items", key: "specialItems" }, { header: "Margin Impact", key: "marginImpact" }], "Customer_Price_Level")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Price Level</th>
                <th className="px-3 py-2 text-right font-medium">Discount %</th>
                <th className="px-3 py-2 text-right font-medium">Credit Days</th>
                <th className="px-3 py-2 text-right font-medium">Min Order</th>
                <th className="px-3 py-2 text-right font-medium">Special Items</th>
                <th className="px-3 py-2 text-right font-medium">Margin Impact</th>
              </tr>
            </thead>
            <tbody>
              {mockPriceLevelData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-medium">{row.priceLevel}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-orange-600 font-semibold">{row.discountPct}%</td>
                  <td className="px-3 py-2 text-right text-slate-700">{row.creditDays} days</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.minOrderValue.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{row.specialItems}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-600">{row.marginImpact}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Item-wise Sales Report
function ItemWiseSalesReport() {
  useDataRevision();
  const [valuation, setValuation] = React.useState<ValuationMethod>("average_cost");

  const rows = mockItemWiseSalesData.map((r) => {
    const { cost, gp, gpPct } = recompute(r.revenue, r.cost, valuation);
    return { ...r, cost, grossProfit: gp, gp: gpPct };
  });

  const totals = rows.reduce((acc, r) => ({
    qtySold: acc.qtySold + r.qtySold,
    revenue: acc.revenue + r.revenue,
    cost: acc.cost + r.cost,
    grossProfit: acc.grossProfit + r.grossProfit,
    netRevenue: acc.netRevenue + r.netRevenue,
  }), { qtySold: 0, revenue: 0, cost: 0, grossProfit: 0, netRevenue: 0 });
  const overallGpPct = totals.revenue > 0 ? (totals.grossProfit / totals.revenue * 100).toFixed(1) : "0.0";

  useReportView("item_wise_sales", {
    note: `Valuation: ${VALUATION_METHODS.find((m) => m.id === valuation)?.label || valuation}`,
    kpis: [
      { label: "Total Net Revenue", value: `AED ${totals.netRevenue.toLocaleString()}` },
      { label: "Gross Profit", value: `AED ${totals.grossProfit.toLocaleString()}` },
      { label: "Total COGS", value: `AED ${totals.cost.toLocaleString()}` },
      { label: "Overall GP %", value: `${overallGpPct}%` },
    ],
    sections: [
      {
        title: "Item-wise Sales Detail",
        columns: [
          { key: "item", header: "Item", align: "left", width: 20 },
          { key: "category", header: "Category", align: "left", width: 16 },
          { key: "qtySold", header: "Qty Sold", align: "right", width: 12 },
          { key: "revenue", header: "Revenue", align: "right", width: 14 },
          { key: "cost", header: "COGS", align: "right", width: 14 },
          { key: "grossProfit", header: "Gross Profit", align: "right", width: 14 },
          { key: "gp", header: "GP %", align: "right", width: 10 },
          { key: "returnQty", header: "Returns", align: "right", width: 10 },
          { key: "netRevenue", header: "Net Revenue", align: "right", width: 14 },
        ],
        rows: rows.map((row) => ({
          item: row.item,
          category: row.category,
          qtySold: row.qtySold.toLocaleString(),
          revenue: `AED ${row.revenue.toLocaleString()}`,
          cost: `AED ${row.cost.toLocaleString()}`,
          grossProfit: `AED ${row.grossProfit.toLocaleString()}`,
          gp: `${row.gp}%`,
          returnQty: row.returnQty,
          netRevenue: `AED ${row.netRevenue.toLocaleString()}`,
        })),
        totals: {
          item: "TOTAL",
          qtySold: totals.qtySold.toLocaleString(),
          revenue: `AED ${totals.revenue.toLocaleString()}`,
          cost: `AED ${totals.cost.toLocaleString()}`,
          grossProfit: `AED ${totals.grossProfit.toLocaleString()}`,
          gp: `${overallGpPct}%`,
          netRevenue: `AED ${totals.netRevenue.toLocaleString()}`,
        },
      },
    ],
  });

  return (
    <div className="space-y-3">
      <ValuationSelector value={valuation} onChange={setValuation} />
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-2 border-[#F5C742] bg-[#FFF6D8]">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total Net Revenue</div>
            <div className="text-xl font-bold text-slate-900">AED {totals.netRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Gross Profit</div>
            <div className="text-xl font-bold text-emerald-700">AED {totals.grossProfit.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Total COGS</div>
            <div className="text-xl font-bold text-slate-700">AED {totals.cost.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-600 mb-1">Overall GP %</div>
            <div className="text-xl font-bold text-blue-700">{overallGpPct}%</div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Revenue vs Cost vs GP by Item</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="item" tick={{ fontSize: 8 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="revenue" fill="#F5C742" name="Revenue" />
              <Bar dataKey="cost" fill="#e2e8f0" name="COGS" />
              <Bar dataKey="grossProfit" fill="#10b981" name="GP" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Item-wise Sales Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(rows, [{ header: "Item", key: "item" }, { header: "Category", key: "category" }, { header: "Qty Sold", key: "qtySold" }, { header: "Revenue", key: "revenue" }, { header: "COGS", key: "cost" }, { header: "Gross Profit", key: "grossProfit" }, { header: "GP %", key: "gp" }, { header: "Returns", key: "returnQty" }, { header: "Net Revenue", key: "netRevenue" }], "Item_Wise_Sales")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Qty Sold</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">COGS</th>
                  <th className="px-3 py-2 text-right font-medium">Gross Profit</th>
                  <th className="px-3 py-2 text-right font-medium">GP %</th>
                  <th className="px-3 py-2 text-right font-medium">Returns</th>
                  <th className="px-3 py-2 text-right font-medium">Net Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.item}</td>
                    <td className="px-3 py-2 text-slate-600">{row.category}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.qtySold.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.revenue.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-600">AED {row.cost.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">AED {row.grossProfit.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{row.gp}%</td>
                    <td className="px-3 py-2 text-right text-orange-600">{row.returnQty}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netRevenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">{totals.qtySold.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.revenue.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.cost.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">AED {totals.grossProfit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{overallGpPct}%</td>
                  <td />
                  <td className="px-3 py-2 text-right">AED {totals.netRevenue.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Category / Brand Sales Report
function CategoryBrandSalesReport() {
  useDataRevision();
  const [valuation, setValuation] = React.useState<ValuationMethod>("average_cost");
  const COLORS = ['#F5C742','#3b82f6','#10b981','#f97316','#8b5cf6','#ec4899','#14b8a6','#f59e0b'];

  // Derive implied cost from avgGP to apply valuation adjustment
  const rows = mockCategoryData.map((r) => {
    const impliedCost = r.netSales * (1 - r.avgGP / 100);
    const { cost, gpPct } = recompute(r.netSales, impliedCost, valuation);
    return { ...r, avgGP: gpPct };
  });

  useReportView("category_brand_sales", {
    note: `Valuation: ${VALUATION_METHODS.find((m) => m.id === valuation)?.label || valuation}`,
    sections: [
      {
        title: "Category Sales Detail",
        columns: [
          { key: "category", header: "Category", align: "left", width: 18 },
          { key: "qtySold", header: "Qty Sold", align: "right", width: 12 },
          { key: "salesValue", header: "Sales Value", align: "right", width: 16 },
          { key: "contribution", header: "Contrib %", align: "right", width: 12 },
          { key: "returns", header: "Returns", align: "right", width: 14 },
          { key: "netSales", header: "Net Sales", align: "right", width: 16 },
          { key: "avgGP", header: "Avg GP %", align: "right", width: 12 },
        ],
        rows: rows.map((row) => ({
          category: row.category,
          qtySold: row.qtySold.toLocaleString(),
          salesValue: `AED ${row.salesValue.toLocaleString()}`,
          contribution: `${row.contribution}%`,
          returns: `AED ${row.returns.toLocaleString()}`,
          netSales: `AED ${row.netSales.toLocaleString()}`,
          avgGP: `${row.avgGP}%`,
        })),
      },
    ],
  });

  return (
    <div className="space-y-3">
      <ValuationSelector value={valuation} onChange={setValuation} />
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Sales Contribution by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={rows} cx="50%" cy="50%" outerRadius={70} dataKey="salesValue"
                  label={({ category, contribution }) => `${category.split(' ')[0]}: ${contribution}%`} labelStyle={{ fontSize: '8px' }}>
                  {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Average GP % by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 8 }} />
                <YAxis tick={{ fontSize: 9 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `${val}%`} />
                <Bar dataKey="avgGP" fill="#10b981" name="Avg GP %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Category Sales Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(rows, [{ header: "Category", key: "category" }, { header: "Qty Sold", key: "qtySold" }, { header: "Sales Value", key: "salesValue" }, { header: "Contrib %", key: "contribution" }, { header: "Returns", key: "returns" }, { header: "Net Sales", key: "netSales" }, { header: "Avg GP %", key: "avgGP" }], "Category_Brand_Sales")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Qty Sold</th>
                  <th className="px-3 py-2 text-right font-medium">Sales Value</th>
                  <th className="px-3 py-2 text-right font-medium">Contrib %</th>
                  <th className="px-3 py-2 text-right font-medium">Returns</th>
                  <th className="px-3 py-2 text-right font-medium">Net Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Avg GP %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.category}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.qtySold.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.salesValue.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-[#F5C742] rounded-full" style={{ width: `${row.contribution}%` }} />
                        </div>
                        <span className="text-slate-700">{row.contribution}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.returns.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.netSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{row.avgGP}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Fast / Slow Moving Items Report
function FastSlowMovingReport() {
  useDataRevision();
  useReportView("fast_slow_moving", {
    sections: [
      {
        title: "Fast Moving Items",
        columns: [
          { key: "rank", header: "#", align: "left", width: 6 },
          { key: "item", header: "Item", align: "left", width: 24 },
          { key: "salesFrequency", header: "Sales Freq", align: "right", width: 12 },
          { key: "turnoverDays", header: "Turnover", align: "right", width: 12 },
        ],
        rows: mockFastSlowData.fast.map((row) => ({
          rank: `#${row.rank}`,
          item: row.item,
          salesFrequency: row.salesFrequency.toLocaleString(),
          turnoverDays: `${row.turnoverDays}d`,
        })),
      },
      {
        title: "Slow Moving Items",
        columns: [
          { key: "rank", header: "#", align: "left", width: 6 },
          { key: "item", header: "Item", align: "left", width: 24 },
          { key: "turnoverDays", header: "Turnover", align: "right", width: 12 },
          { key: "stockOnHand", header: "Stock", align: "right", width: 12 },
        ],
        rows: mockFastSlowData.slow.map((row) => ({
          rank: `#${row.rank}`,
          item: row.item,
          turnoverDays: `${row.turnoverDays}d`,
          stockOnHand: row.stockOnHand,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-2 border-emerald-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Fast Moving Items
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="bb-nowrap-table w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Sales Freq</th>
                    <th className="px-3 py-2 text-right font-medium">Turnover</th>
                  </tr>
                </thead>
                <tbody>
                  {mockFastSlowData.fast.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 font-bold text-emerald-600">#{row.rank}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.item}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.salesFrequency.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{row.turnoverDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-red-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Slow Moving Items
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="bb-nowrap-table w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Turnover</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {mockFastSlowData.slow.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 font-bold text-red-600">#{row.rank}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.item}</td>
                      <td className="px-3 py-2 text-right text-red-700 font-semibold">{row.turnoverDays}d</td>
                      <td className="px-3 py-2 text-right text-orange-600">{row.stockOnHand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Turnover Days Comparison</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[...mockFastSlowData.fast.map(r => ({ item: r.item, turnover: r.turnoverDays, type: "Fast" })), ...mockFastSlowData.slow.map(r => ({ item: r.item, turnover: r.turnoverDays, type: "Slow" }))]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="item" tick={{ fontSize: 7 }} />
              <YAxis tick={{ fontSize: 9 }} unit=" d" />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Bar dataKey="turnover" name="Turnover Days" fill="#F5C742" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// Discount Analysis Report
function DiscountAnalysisReport() {
  useDataRevision();
  const total = mockDiscountData.reduce((s, r) => s + r.discountAmount, 0);
  useReportView("discount_analysis", {
    note: `Total discounts: AED ${total.toLocaleString()}`,
    sections: [
      {
        title: "Discount Analysis by Cashier",
        columns: [
          { key: "cashier", header: "Cashier", align: "left", width: 18 },
          { key: "bills", header: "Bills", align: "right", width: 10 },
          { key: "discountedBills", header: "Discounted Bills", align: "right", width: 14 },
          { key: "discountAmount", header: "Discount Amount", align: "right", width: 16 },
          { key: "discountPct", header: "Discount %", align: "right", width: 12 },
          { key: "maxBillDiscount", header: "Max Bill Discount", align: "right", width: 14 },
          { key: "avgDiscount", header: "Avg Discount", align: "right", width: 14 },
        ],
        rows: mockDiscountData.map((row) => ({
          cashier: row.cashier,
          bills: row.bills,
          discountedBills: row.discountedBills,
          discountAmount: `AED ${row.discountAmount.toLocaleString()}`,
          discountPct: `${row.discountPct}%`,
          maxBillDiscount: `AED ${row.maxBillDiscount}`,
          avgDiscount: `AED ${row.avgDiscount.toFixed(1)}`,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Discount by Cashier</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockDiscountData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="cashier" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Bar dataKey="discountAmount" fill="#f97316" name="Discount Amount" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Discount % by Cashier</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockDiscountData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="cashier" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Bar dataKey="discountPct" fill="#F5C742" name="Discount %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold text-slate-800">Discount Analysis by Cashier</CardTitle>
              <span className="text-[10px] text-slate-500">Total discounts: AED {total.toLocaleString()}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockDiscountData, [{ header: "Cashier", key: "cashier" }, { header: "Bills", key: "bills" }, { header: "Discounted Bills", key: "discountedBills" }, { header: "Discount Amount", key: "discountAmount" }, { header: "Discount %", key: "discountPct" }, { header: "Max Bill Discount", key: "maxBillDiscount" }, { header: "Avg Discount", key: "avgDiscount" }], "Discount_Analysis")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Cashier</th>
                  <th className="px-3 py-2 text-right font-medium">Bills</th>
                  <th className="px-3 py-2 text-right font-medium">Discounted Bills</th>
                  <th className="px-3 py-2 text-right font-medium">Discount Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Discount %</th>
                  <th className="px-3 py-2 text-right font-medium">Max Bill Discount</th>
                  <th className="px-3 py-2 text-right font-medium">Avg Discount</th>
                </tr>
              </thead>
              <tbody>
                {mockDiscountData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.cashier}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.bills}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.discountedBills}</td>
                    <td className="px-3 py-2 text-right text-orange-700 font-semibold">AED {row.discountAmount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${row.discountPct > 9 ? 'text-red-600' : 'text-amber-600'}`}>{row.discountPct}%</span>
                    </td>
                    <td className="px-3 py-2 text-right text-red-600">AED {row.maxBillDiscount}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.avgDiscount.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Promotion Impact Report
function PromotionImpactReport() {
  useDataRevision();
  useReportView("promotion_impact", {
    sections: [
      {
        title: "Promotion Performance Detail",
        columns: [
          { key: "promotionName", header: "Promotion", align: "left", width: 18 },
          { key: "type", header: "Type", align: "left", width: 14 },
          { key: "period", header: "Period", align: "left", width: 16 },
          { key: "salesBefore", header: "Before", align: "right", width: 14 },
          { key: "salesDuring", header: "During", align: "right", width: 14 },
          { key: "uplift", header: "Uplift %", align: "right", width: 12 },
          { key: "discountCost", header: "Discount Cost", align: "right", width: 14 },
          { key: "netMargin", header: "Net Margin %", align: "right", width: 12 },
        ],
        rows: mockPromotionData.map((row) => ({
          promotionName: row.promotionName,
          type: row.type,
          period: row.period,
          salesBefore: `AED ${row.salesBefore.toLocaleString()}`,
          salesDuring: `AED ${row.salesDuring.toLocaleString()}`,
          uplift: `+${row.uplift}%`,
          discountCost: `AED ${row.discountCost.toLocaleString()}`,
          netMargin: `${row.netMargin}%`,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Sales Uplift by Promotion</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mockPromotionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="promotionName" tick={{ fontSize: 8 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="salesBefore" fill="#e2e8f0" name="Before" />
              <Bar dataKey="salesDuring" fill="#F5C742" name="During" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Promotion Performance Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockPromotionData, [{ header: "Promotion", key: "promotionName" }, { header: "Type", key: "type" }, { header: "Period", key: "period" }, { header: "Before", key: "salesBefore" }, { header: "During", key: "salesDuring" }, { header: "Uplift %", key: "uplift" }, { header: "Discount Cost", key: "discountCost" }, { header: "Net Margin %", key: "netMargin" }], "Promotion_Impact")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Promotion</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Period</th>
                  <th className="px-3 py-2 text-right font-medium">Before</th>
                  <th className="px-3 py-2 text-right font-medium">During</th>
                  <th className="px-3 py-2 text-right font-medium">Uplift %</th>
                  <th className="px-3 py-2 text-right font-medium">Discount Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Net Margin %</th>
                </tr>
              </thead>
              <tbody>
                {mockPromotionData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.promotionName}</td>
                    <td className="px-3 py-2 text-slate-600">{row.type}</td>
                    <td className="px-3 py-2 text-slate-600">{row.period}</td>
                    <td className="px-3 py-2 text-right text-slate-700">AED {row.salesBefore.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.salesDuring.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-semibold">+{row.uplift}%</td>
                    <td className="px-3 py-2 text-right text-orange-600">AED {row.discountCost.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-700">{row.netMargin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Free Issue / Scheme Report
function FreeIssueSchemeReport() {
  useDataRevision();
  const totalCost = mockFreeIssueData.reduce((s, r) => s + r.freeIssueCost, 0);
  useReportView("free_issue_scheme", {
    kpis: [
      { label: "Total Free Issue Cost", value: `AED ${totalCost.toLocaleString()}` },
      { label: "Active Schemes", value: String(mockFreeIssueData.length) },
      { label: "Total Activations", value: String(mockFreeIssueData.reduce((s, r) => s + r.activatedTimes, 0)) },
    ],
    sections: [
      {
        title: "Free Issue / Scheme Detail",
        columns: [
          { key: "scheme", header: "Scheme", align: "left", width: 18 },
          { key: "item", header: "Free Item", align: "left", width: 18 },
          { key: "triggerQty", header: "Trigger Qty", align: "right", width: 12 },
          { key: "freeQty", header: "Free Qty", align: "right", width: 10 },
          { key: "activatedTimes", header: "Activations", align: "right", width: 12 },
          { key: "freeQtyIssued", header: "Free Qty Issued", align: "right", width: 12 },
          { key: "freeIssueCost", header: "Cost Impact", align: "right", width: 14 },
          { key: "totalSales", header: "Total Sales", align: "right", width: 14 },
        ],
        rows: mockFreeIssueData.map((row) => ({
          scheme: row.scheme,
          item: row.item,
          triggerQty: row.triggerQty,
          freeQty: row.freeQty,
          activatedTimes: row.activatedTimes,
          freeQtyIssued: row.freeQtyIssued,
          freeIssueCost: `AED ${row.freeIssueCost.toLocaleString()}`,
          totalSales: `AED ${row.totalSales.toLocaleString()}`,
        })),
      },
    ],
  });
  return (
    <div className="space-y-3">
      <Card className="border border-slate-200 bg-white">
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-600 mb-0.5">Total Free Issue Cost</div>
            <div className="text-xl font-bold text-red-700">AED {totalCost.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 mb-0.5">Active Schemes</div>
            <div className="text-xl font-bold text-slate-900">{mockFreeIssueData.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 mb-0.5">Total Activations</div>
            <div className="text-xl font-bold text-emerald-700">{mockFreeIssueData.reduce((s, r) => s + r.activatedTimes, 0)}</div>
          </div>
        </CardContent>
      </Card>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-800">Free Issue / Scheme Detail</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockFreeIssueData, [{ header: "Scheme", key: "scheme" }, { header: "Free Item", key: "item" }, { header: "Trigger Qty", key: "triggerQty" }, { header: "Free Qty", key: "freeQty" }, { header: "Activations", key: "activatedTimes" }, { header: "Free Qty Issued", key: "freeQtyIssued" }, { header: "Cost Impact", key: "freeIssueCost" }, { header: "Total Sales", key: "totalSales" }], "Free_Issue_Scheme")}><Download className="h-3 w-3" />Export</Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Scheme</th>
                  <th className="px-3 py-2 text-left font-medium">Free Item</th>
                  <th className="px-3 py-2 text-right font-medium">Trigger Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Free Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Activations</th>
                  <th className="px-3 py-2 text-right font-medium">Free Qty Issued</th>
                  <th className="px-3 py-2 text-right font-medium">Cost Impact</th>
                  <th className="px-3 py-2 text-right font-medium">Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {mockFreeIssueData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.scheme}</td>
                    <td className="px-3 py-2 text-slate-700">{row.item}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.triggerQty}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.freeQty}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{row.activatedTimes}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{row.freeQtyIssued}</td>
                    <td className="px-3 py-2 text-right text-red-600 font-semibold">AED {row.freeIssueCost.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.totalSales.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Tax Summary Report
function TaxSummaryReport() {
  useDataRevision();
  const COLORS = ['#F5C742','#3b82f6','#10b981'];
  useReportView("tax_summary", {
    kpis: [
      { label: "VAT Collected", value: `AED ${mockTaxData[0].taxAmount.toLocaleString()}` },
      { label: "Net VAT Payable", value: `AED ${mockTaxData[0].netTaxPayable.toLocaleString()}` },
    ],
    sections: [
      {
        title: "VAT Summary",
        columns: [
          { key: "label", header: "Description", align: "left", width: 30 },
          { key: "amount", header: "Amount", align: "right", width: 18 },
        ],
        rows: [
          { label: "Taxable Sales (5% VAT)", amount: `AED ${mockTaxData[0].taxableSales.toLocaleString()}` },
          { label: "VAT Collected", amount: `AED ${mockTaxData[0].taxAmount.toLocaleString()}` },
          { label: "Zero-Rated Sales", amount: `AED ${mockTaxData[1].zeroRated.toLocaleString()}` },
          { label: "Exempt Sales", amount: `AED ${mockTaxData[2].exemptSales.toLocaleString()}` },
        ],
        totals: { label: "Net VAT Payable", amount: `AED ${mockTaxData[0].netTaxPayable.toLocaleString()}` },
      },
    ],
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Tax Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={[
                  { name: "Taxable (5%)", value: mockTaxData[0].taxableSales },
                  { name: "Zero-Rated", value: mockTaxData[1].zeroRated },
                  { name: "Exempt", value: mockTaxData[2].exemptSales },
                ]} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name.split(' ')[0]}: ${(percent * 100).toFixed(0)}%`} labelStyle={{ fontSize: '9px' }}>
                  {COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="p-4 space-y-3">
            <div className="text-[10px] text-blue-700 font-semibold">VAT Summary</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Taxable Sales (5% VAT)</span>
              <span className="font-semibold">AED {mockTaxData[0].taxableSales.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">VAT Collected</span>
              <span className="font-bold text-blue-700">AED {mockTaxData[0].taxAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Zero-Rated Sales</span>
              <span className="font-semibold">AED {mockTaxData[1].zeroRated.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Exempt Sales</span>
              <span className="font-semibold">AED {mockTaxData[2].exemptSales.toLocaleString()}</span>
            </div>
            <div className="pt-2 border-t-2 border-blue-200 flex justify-between font-bold text-[12px]">
              <span>Net VAT Payable</span>
              <span className="text-blue-700">AED {mockTaxData[0].netTaxPayable.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// VAT Output Register
function VATOutputRegisterReport() {
  useDataRevision();
  const totalTax = mockVATOutputData.reduce((s, r) => s + r.vatAmt, 0);
  const totalAmt = mockVATOutputData.reduce((s, r) => s + r.totalAmt, 0);
  useReportView("vat_output_register", {
    note: `Total VAT Collected: AED ${totalTax.toLocaleString()}`,
    sections: [
      {
        title: "VAT Output Register",
        columns: [
          { key: "invoiceNo", header: "Invoice No", align: "left", width: 14 },
          { key: "date", header: "Date", align: "left", width: 12 },
          { key: "customer", header: "Customer", align: "left", width: 18 },
          { key: "trn", header: "TRN", align: "left", width: 16 },
          { key: "taxableAmt", header: "Taxable Amt", align: "right", width: 16 },
          { key: "vatRate", header: "VAT Rate", align: "right", width: 10 },
          { key: "vatAmt", header: "VAT Amount", align: "right", width: 14 },
          { key: "totalAmt", header: "Total", align: "right", width: 14 },
        ],
        rows: mockVATOutputData.map((row) => ({
          invoiceNo: row.invoiceNo,
          date: row.date,
          customer: row.customer,
          trn: row.trn,
          taxableAmt: `AED ${row.taxableAmt.toLocaleString()}`,
          vatRate: row.vatRate,
          vatAmt: `AED ${row.vatAmt.toLocaleString()}`,
          totalAmt: `AED ${row.totalAmt.toLocaleString()}`,
        })),
        totals: {
          invoiceNo: "TOTAL",
          vatAmt: `AED ${totalTax.toLocaleString()}`,
          totalAmt: `AED ${totalAmt.toLocaleString()}`,
        },
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xs font-semibold text-slate-800">VAT Output Register</CardTitle>
            <span className="text-[10px] text-slate-500">Total VAT Collected: AED {totalTax.toLocaleString()}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockVATOutputData, [{ header: "Invoice No", key: "invoiceNo" }, { header: "Date", key: "date" }, { header: "Customer", key: "customer" }, { header: "TRN", key: "trn" }, { header: "Taxable Amt", key: "taxableAmt" }, { header: "VAT Rate", key: "vatRate" }, { header: "VAT Amount", key: "vatAmt" }, { header: "Total", key: "totalAmt" }], "VAT_Output_Register")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Invoice No</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">TRN</th>
                <th className="px-3 py-2 text-right font-medium">Taxable Amt</th>
                <th className="px-3 py-2 text-right font-medium">VAT Rate</th>
                <th className="px-3 py-2 text-right font-medium">VAT Amount</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {mockVATOutputData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.invoiceNo}</td>
                  <td className="px-3 py-2 text-slate-600">{row.date}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.customer}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-600">{row.trn}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.taxableAmt.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{row.vatRate}</td>
                  <td className="px-3 py-2 text-right font-semibold text-blue-700">AED {row.vatAmt.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {row.totalAmt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#F5C742] text-slate-900 font-semibold">
              <tr>
                <td colSpan={6} className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right">AED {totalTax.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">AED {mockVATOutputData.reduce((s, r) => s + r.totalAmt, 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Price Override Report
function PriceOverrideReport() {
  useDataRevision();
  useReportView("price_override", {
    note: `${mockPriceOverrideData.length} overrides in period`,
    sections: [
      {
        title: "Price Override Report",
        columns: [
          { key: "dateTime", header: "Date / Time", align: "left", width: 16 },
          { key: "item", header: "Item", align: "left", width: 18 },
          { key: "originalPrice", header: "Original Price", align: "right", width: 14 },
          { key: "newPrice", header: "New Price", align: "right", width: 14 },
          { key: "change", header: "Change %", align: "right", width: 10 },
          { key: "cashier", header: "Cashier", align: "left", width: 14 },
          { key: "approvedBy", header: "Approved By", align: "left", width: 14 },
          { key: "reason", header: "Reason", align: "left", width: 18 },
          { key: "billNo", header: "Bill No", align: "left", width: 12 },
        ],
        rows: mockPriceOverrideData.map((row) => ({
          dateTime: `${row.date} ${row.time}`,
          item: row.item,
          originalPrice: `AED ${row.originalPrice.toFixed(2)}`,
          newPrice: `AED ${row.newPrice.toFixed(2)}`,
          change: `${row.change}%`,
          cashier: row.cashier,
          approvedBy: row.approvedBy,
          reason: row.reason,
          billNo: row.billNo,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xs font-semibold text-slate-800">Price Override Report</CardTitle>
            <span className="text-[10px] text-slate-500">{mockPriceOverrideData.length} overrides in period</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockPriceOverrideData, [{ header: "Date", key: "date" }, { header: "Time", key: "time" }, { header: "Item", key: "item" }, { header: "Original Price", key: "originalPrice" }, { header: "New Price", key: "newPrice" }, { header: "Change %", key: "change" }, { header: "Cashier", key: "cashier" }, { header: "Approved By", key: "approvedBy" }, { header: "Reason", key: "reason" }, { header: "Bill No", key: "billNo" }], "Price_Override")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date / Time</th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Original Price</th>
                <th className="px-3 py-2 text-right font-medium">New Price</th>
                <th className="px-3 py-2 text-right font-medium">Change %</th>
                <th className="px-3 py-2 text-left font-medium">Cashier</th>
                <th className="px-3 py-2 text-left font-medium">Approved By</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
                <th className="px-3 py-2 text-left font-medium">Bill No</th>
              </tr>
            </thead>
            <tbody>
              {mockPriceOverrideData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 text-slate-600">{row.date} {row.time}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.item}</td>
                  <td className="px-3 py-2 text-right text-slate-700">AED {row.originalPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-orange-700 font-semibold">AED {row.newPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-red-600 font-semibold">{row.change}%</td>
                  <td className="px-3 py-2 text-slate-700">{row.cashier}</td>
                  <td className="px-3 py-2 text-slate-600">{row.approvedBy}</td>
                  <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.billNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Manual / Back-Dated Entry Report
function ManualEntryReport() {
  useDataRevision();
  useReportView("manual_entry", {
    note: `${mockManualEntryData.length} entries in period`,
    sections: [
      {
        title: "Manual / Back-Dated Entry Report",
        columns: [
          { key: "entryNo", header: "Entry No", align: "left", width: 14 },
          { key: "entryDate", header: "Entry Date", align: "left", width: 14 },
          { key: "postDate", header: "Post Date", align: "left", width: 14 },
          { key: "user", header: "User", align: "left", width: 16 },
          { key: "type", header: "Type", align: "left", width: 16 },
          { key: "impact", header: "Impact", align: "right", width: 14 },
          { key: "reason", header: "Reason", align: "left", width: 18 },
          { key: "approvedBy", header: "Approved By", align: "left", width: 14 },
        ],
        rows: mockManualEntryData.map((row) => ({
          entryNo: row.entryNo,
          entryDate: row.entryDate,
          postDate: row.postDate,
          user: row.user,
          type: row.type,
          impact: `AED ${row.impact.toLocaleString()}`,
          reason: row.reason,
          approvedBy: row.approvedBy,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xs font-semibold text-slate-800">Manual / Back-Dated Entry Report</CardTitle>
            <span className="text-[10px] text-slate-500">{mockManualEntryData.length} entries in period</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockManualEntryData, [{ header: "Entry No", key: "entryNo" }, { header: "Entry Date", key: "entryDate" }, { header: "Post Date", key: "postDate" }, { header: "User", key: "user" }, { header: "Type", key: "type" }, { header: "Impact", key: "impact" }, { header: "Reason", key: "reason" }, { header: "Approved By", key: "approvedBy" }], "Manual_Entry")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Entry No</th>
                <th className="px-3 py-2 text-left font-medium">Entry Date</th>
                <th className="px-3 py-2 text-left font-medium">Post Date</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Impact</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
                <th className="px-3 py-2 text-left font-medium">Approved By</th>
              </tr>
            </thead>
            <tbody>
              {mockManualEntryData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.entryNo}</td>
                  <td className="px-3 py-2 text-slate-600">{row.entryDate}</td>
                  <td className="px-3 py-2 text-orange-600">{row.postDate}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.user}</td>
                  <td className="px-3 py-2 text-slate-600">{row.type}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-bold ${row.impact < 0 ? 'text-red-600' : 'text-emerald-700'}`}>AED {row.impact.toLocaleString()}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                  <td className="px-3 py-2 text-slate-600">{row.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Sales Edit Log
function SalesEditLogReport() {
  useDataRevision();
  useReportView("sales_edit_log", {
    note: `${mockEditLogData.length} edits in period`,
    sections: [
      {
        title: "Sales Edit Log",
        columns: [
          { key: "editNo", header: "Edit No", align: "left", width: 12 },
          { key: "dateTime", header: "Date / Time", align: "left", width: 16 },
          { key: "invoiceNo", header: "Invoice No", align: "left", width: 14 },
          { key: "user", header: "User", align: "left", width: 16 },
          { key: "field", header: "Field Changed", align: "left", width: 16 },
          { key: "before", header: "Before", align: "left", width: 14 },
          { key: "after", header: "After", align: "left", width: 14 },
          { key: "reason", header: "Reason", align: "left", width: 16 },
          { key: "approvedBy", header: "Approved By", align: "left", width: 14 },
        ],
        rows: mockEditLogData.map((row) => ({
          editNo: row.editNo,
          dateTime: `${row.date} ${row.time}`,
          invoiceNo: row.invoiceNo,
          user: row.user,
          field: row.field,
          before: row.before,
          after: row.after,
          reason: row.reason,
          approvedBy: row.approvedBy,
        })),
      },
    ],
  });
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xs font-semibold text-slate-800">Sales Edit Log</CardTitle>
            <span className="text-[10px] text-slate-500">{mockEditLogData.length} edits in period</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => exportData(mockEditLogData, [{ header: "Edit No", key: "editNo" }, { header: "Date", key: "date" }, { header: "Time", key: "time" }, { header: "Invoice No", key: "invoiceNo" }, { header: "User", key: "user" }, { header: "Field Changed", key: "field" }, { header: "Before", key: "before" }, { header: "After", key: "after" }, { header: "Reason", key: "reason" }, { header: "Approved By", key: "approvedBy" }], "Sales_Edit_Log")}><Download className="h-3 w-3" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="bb-nowrap-table w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Edit No</th>
                <th className="px-3 py-2 text-left font-medium">Date / Time</th>
                <th className="px-3 py-2 text-left font-medium">Invoice No</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Field Changed</th>
                <th className="px-3 py-2 text-left font-medium">Before</th>
                <th className="px-3 py-2 text-left font-medium">After</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
                <th className="px-3 py-2 text-left font-medium">Approved By</th>
              </tr>
            </thead>
            <tbody>
              {mockEditLogData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{row.editNo}</td>
                  <td className="px-3 py-2 text-slate-600">{row.date} {row.time}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-600">{row.invoiceNo}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.user}</td>
                  <td className="px-3 py-2 text-slate-700">{row.field}</td>
                  <td className="px-3 py-2 text-red-600 line-through">{row.before}</td>
                  <td className="px-3 py-2 text-emerald-700 font-semibold">{row.after}</td>
                  <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                  <td className="px-3 py-2 text-slate-600">{row.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Customer → Bill → Item Profit Report ────────────────────────────────────

interface ProfitItem {
  itemCode: string;
  itemName: string;
  category: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  lineTotal: number;
  lineCost: number;
  lineGP: number;
  gpPct: number;
}

interface ProfitBill {
  billNo: string;
  date: string;
  channel: "POS" | "Back-Office" | "VAN";
  salesperson: string;
  grossTotal: number;
  discount: number;
  netTotal: number;
  totalCost: number;
  grossProfit: number;
  gpPct: number;
  items: ProfitItem[];
}

interface ProfitCustomer {
  customerId: string;
  customerName: string;
  priceLevel: string;
  totalBills: number;
  grossSales: number;
  totalDiscount: number;
  netSales: number;
  totalCost: number;
  grossProfit: number;
  gpPct: number;
  bills: ProfitBill[];
}

let mockProfitDrilldownData: ProfitCustomer[] = [
  {
    customerId: "CUS-001",
    customerName: "Gulf Supermarket Chain",
    priceLevel: "Wholesale A",
    totalBills: 3,
    grossSales: 42800,
    totalDiscount: 5136,
    netSales: 37664,
    totalCost: 24982,
    grossProfit: 12682,
    gpPct: 33.7,
    bills: [
      {
        billNo: "INV-2026-1842",
        date: "2026-01-16",
        channel: "Back-Office",
        salesperson: "Waleed Ibrahim",
        grossTotal: 24800,
        discount: 2976,
        netTotal: 21824,
        totalCost: 14440,
        grossProfit: 7384,
        gpPct: 33.8,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 120, unitPrice: 30.00, unitCost: 19.50, discount: 360, lineTotal: 3240, lineCost: 2340, lineGP: 900, gpPct: 27.8 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 200, unitPrice: 18.00, unitCost: 12.20, discount: 432, lineTotal: 3168, lineCost: 2440, lineGP: 728, gpPct: 23.0 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 150, unitPrice: 40.00, unitCost: 28.00, discount: 720, lineTotal: 5280, lineCost: 4200, lineGP: 1080, gpPct: 20.5 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 80, unitPrice: 46.00, unitCost: 30.00, discount: 442, lineTotal: 3238, lineCost: 2400, lineGP: 838, gpPct: 25.9 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 300, unitPrice: 9.00, unitCost: 5.80, discount: 324, lineTotal: 2376, lineCost: 1740, lineGP: 636, gpPct: 26.8 },
          { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qty: 100, unitPrice: 18.00, unitCost: 12.00, discount: 216, lineTotal: 1584, lineCost: 1200, lineGP: 384, gpPct: 24.2 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 120, unitPrice: 9.00, unitCost: 5.20, discount: 130, lineTotal: 950, lineCost: 624, lineGP: 326, gpPct: 34.3 },
          { itemCode: "ITM-002", itemName: "Fresh OJ 1L", category: "Beverages", qty: 80, unitPrice: 12.00, unitCost: 7.80, discount: 115, lineTotal: 845, lineCost: 624, lineGP: 221, gpPct: 26.2 },
        ],
      },
      {
        billNo: "INV-2026-1820",
        date: "2026-01-10",
        channel: "Back-Office",
        salesperson: "Ahmed Faris",
        grossTotal: 12000,
        discount: 1440,
        netTotal: 10560,
        totalCost: 6890,
        grossProfit: 3670,
        gpPct: 34.7,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 60, unitPrice: 30.00, unitCost: 19.50, discount: 216, lineTotal: 1584, lineCost: 1170, lineGP: 414, gpPct: 26.1 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 100, unitPrice: 40.00, unitCost: 28.00, discount: 480, lineTotal: 3520, lineCost: 2800, lineGP: 720, gpPct: 20.5 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 60, unitPrice: 46.00, unitCost: 30.00, discount: 331, lineTotal: 2429, lineCost: 1800, lineGP: 629, gpPct: 25.9 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 200, unitPrice: 9.00, unitCost: 5.80, discount: 216, lineTotal: 1584, lineCost: 1160, lineGP: 424, gpPct: 26.8 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 80, unitPrice: 18.00, unitCost: 12.20, discount: 173, lineTotal: 1267, lineCost: 976, lineGP: 291, gpPct: 23.0 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 60, unitPrice: 9.00, unitCost: 5.20, discount: 65, lineTotal: 475, lineCost: 312, lineGP: 163, gpPct: 34.3 },
        ],
      },
      {
        billNo: "INV-2026-1798",
        date: "2026-01-05",
        channel: "Back-Office",
        salesperson: "Waleed Ibrahim",
        grossTotal: 6000,
        discount: 720,
        netTotal: 5280,
        totalCost: 3652,
        grossProfit: 1628,
        gpPct: 30.8,
        items: [
          { itemCode: "ITM-002", itemName: "Fresh OJ 1L", category: "Beverages", qty: 100, unitPrice: 12.00, unitCost: 7.80, discount: 144, lineTotal: 1056, lineCost: 780, lineGP: 276, gpPct: 26.1 },
          { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qty: 80, unitPrice: 18.00, unitCost: 12.00, discount: 173, lineTotal: 1267, lineCost: 960, lineGP: 307, gpPct: 24.2 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 180, unitPrice: 9.00, unitCost: 5.80, discount: 194, lineTotal: 1426, lineCost: 1044, lineGP: 382, gpPct: 26.8 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 80, unitPrice: 9.00, unitCost: 5.20, discount: 86, lineTotal: 634, lineCost: 416, lineGP: 218, gpPct: 34.4 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 50, unitPrice: 18.00, unitCost: 12.20, discount: 108, lineTotal: 792, lineCost: 610, lineGP: 182, gpPct: 23.0 },
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 10, unitPrice: 30.00, unitCost: 19.50, discount: 36, lineTotal: 264, lineCost: 195, lineGP: 69, gpPct: 26.1 },
        ],
      },
    ],
  },
  {
    customerId: "CUS-002",
    customerName: "Al Khaleej Traders LLC",
    priceLevel: "Distributor B",
    totalBills: 2,
    grossSales: 31800,
    totalDiscount: 2703,
    netSales: 29097,
    totalCost: 19400,
    grossProfit: 9697,
    gpPct: 33.3,
    bills: [
      {
        billNo: "INV-2026-1840",
        date: "2026-01-15",
        channel: "Back-Office",
        salesperson: "Waleed Ibrahim",
        grossTotal: 20000,
        discount: 1700,
        netTotal: 18300,
        totalCost: 12100,
        grossProfit: 6200,
        gpPct: 33.9,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 200, unitPrice: 30.00, unitCost: 19.50, discount: 510, lineTotal: 5490, lineCost: 3900, lineGP: 1590, gpPct: 29.0 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 120, unitPrice: 40.00, unitCost: 28.00, discount: 408, lineTotal: 4392, lineCost: 3360, lineGP: 1032, gpPct: 23.5 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 100, unitPrice: 46.00, unitCost: 30.00, discount: 391, lineTotal: 4209, lineCost: 3000, lineGP: 1209, gpPct: 28.7 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 120, unitPrice: 18.00, unitCost: 12.20, discount: 184, lineTotal: 1976, lineCost: 1464, lineGP: 512, gpPct: 25.9 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 240, unitPrice: 9.00, unitCost: 5.80, discount: 184, lineTotal: 1976, lineCost: 1392, lineGP: 584, gpPct: 29.6 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 100, unitPrice: 9.00, unitCost: 5.20, discount: 108, lineTotal: 792, lineCost: 520, lineGP: 272, gpPct: 34.3 },
        ],
      },
      {
        billNo: "INV-2026-1836",
        date: "2026-01-13",
        channel: "Back-Office",
        salesperson: "Ahmed Faris",
        grossTotal: 11800,
        discount: 1003,
        netTotal: 10797,
        totalCost: 7300,
        grossProfit: 3497,
        gpPct: 32.4,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 100, unitPrice: 30.00, unitCost: 19.50, discount: 255, lineTotal: 2745, lineCost: 1950, lineGP: 795, gpPct: 29.0 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 80, unitPrice: 40.00, unitCost: 28.00, discount: 272, lineTotal: 2928, lineCost: 2240, lineGP: 688, gpPct: 23.5 },
          { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qty: 120, unitPrice: 18.00, unitCost: 12.00, discount: 259, lineTotal: 2101, lineCost: 1440, lineGP: 661, gpPct: 31.5 },
          { itemCode: "ITM-002", itemName: "Fresh OJ 1L", category: "Beverages", qty: 120, unitPrice: 12.00, unitCost: 7.80, discount: 173, lineTotal: 1267, lineCost: 936, lineGP: 331, gpPct: 26.1 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 100, unitPrice: 9.00, unitCost: 5.80, discount: 77, lineTotal: 823, lineCost: 580, lineGP: 243, gpPct: 29.5 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 60, unitPrice: 9.00, unitCost: 5.20, discount: 65, lineTotal: 475, lineCost: 312, lineGP: 163, gpPct: 34.3 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 8, unitPrice: 46.00, unitCost: 30.00, discount: 31, lineTotal: 337, lineCost: 240, lineGP: 97, gpPct: 28.8 },
        ],
      },
    ],
  },
  {
    customerId: "CUS-003",
    customerName: "Emirates Food Distributors",
    priceLevel: "Distributor B",
    totalBills: 2,
    grossSales: 24800,
    totalDiscount: 2108,
    netSales: 22692,
    totalCost: 15140,
    grossProfit: 7552,
    gpPct: 33.3,
    bills: [
      {
        billNo: "INV-2026-1839",
        date: "2026-01-15",
        channel: "VAN",
        salesperson: "Tariq Mansoor",
        grossTotal: 15200,
        discount: 1292,
        netTotal: 13908,
        totalCost: 9200,
        grossProfit: 4708,
        gpPct: 33.9,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 80, unitPrice: 30.00, unitCost: 19.50, discount: 204, lineTotal: 2196, lineCost: 1560, lineGP: 636, gpPct: 29.0 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 150, unitPrice: 18.00, unitCost: 12.20, discount: 230, lineTotal: 2470, lineCost: 1830, lineGP: 640, gpPct: 25.9 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 90, unitPrice: 40.00, unitCost: 28.00, discount: 306, lineTotal: 3294, lineCost: 2520, lineGP: 774, gpPct: 23.5 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 300, unitPrice: 9.00, unitCost: 5.80, discount: 230, lineTotal: 2470, lineCost: 1740, lineGP: 730, gpPct: 29.6 },
          { itemCode: "ITM-002", itemName: "Fresh OJ 1L", category: "Beverages", qty: 100, unitPrice: 12.00, unitCost: 7.80, discount: 144, lineTotal: 1056, lineCost: 780, lineGP: 276, gpPct: 26.1 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 80, unitPrice: 9.00, unitCost: 5.20, discount: 86, lineTotal: 634, lineCost: 416, lineGP: 218, gpPct: 34.4 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 20, unitPrice: 46.00, unitCost: 30.00, discount: 98, lineTotal: 822, lineCost: 600, lineGP: 222, gpPct: 27.0 },
          { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qty: 30, unitPrice: 18.00, unitCost: 12.00, discount: 65, lineTotal: 475, lineCost: 360, lineGP: 115, gpPct: 24.2 },
        ],
      },
      {
        billNo: "INV-2026-1812",
        date: "2026-01-08",
        channel: "VAN",
        salesperson: "Tariq Mansoor",
        grossTotal: 9600,
        discount: 816,
        netTotal: 8784,
        totalCost: 5940,
        grossProfit: 2844,
        gpPct: 32.4,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 60, unitPrice: 30.00, unitCost: 19.50, discount: 153, lineTotal: 1647, lineCost: 1170, lineGP: 477, gpPct: 29.0 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 80, unitPrice: 18.00, unitCost: 12.20, discount: 123, lineTotal: 1317, lineCost: 976, lineGP: 341, gpPct: 25.9 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 50, unitPrice: 46.00, unitCost: 30.00, discount: 245, lineTotal: 2055, lineCost: 1500, lineGP: 555, gpPct: 27.0 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 60, unitPrice: 40.00, unitCost: 28.00, discount: 204, lineTotal: 2196, lineCost: 1680, lineGP: 516, gpPct: 23.5 },
          { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qty: 50, unitPrice: 18.00, unitCost: 12.00, discount: 108, lineTotal: 792, lineCost: 600, lineGP: 192, gpPct: 24.2 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 100, unitPrice: 9.00, unitCost: 5.80, discount: 77, lineTotal: 823, lineCost: 580, lineGP: 243, gpPct: 29.5 },
        ],
      },
    ],
  },
  {
    customerId: "CUS-004",
    customerName: "Dubai Fresh Markets",
    priceLevel: "Retail A",
    totalBills: 1,
    grossSales: 14400,
    totalDiscount: 864,
    netSales: 13536,
    totalCost: 9200,
    grossProfit: 4336,
    gpPct: 32.0,
    bills: [
      {
        billNo: "INV-2026-1837",
        date: "2026-01-14",
        channel: "Back-Office",
        salesperson: "Waleed Ibrahim",
        grossTotal: 14400,
        discount: 864,
        netTotal: 13536,
        totalCost: 9200,
        grossProfit: 4336,
        gpPct: 32.0,
        items: [
          { itemCode: "ITM-001", itemName: "Basmati Rice 5kg", category: "Staples", qty: 60, unitPrice: 30.00, unitCost: 19.50, discount: 90, lineTotal: 1710, lineCost: 1170, lineGP: 540, gpPct: 31.6 },
          { itemCode: "ITM-004", itemName: "Chicken Breast 1kg", category: "Meat", qty: 80, unitPrice: 40.00, unitCost: 28.00, discount: 192, lineTotal: 2808, lineCost: 2240, lineGP: 568, gpPct: 20.2 },
          { itemCode: "ITM-005", itemName: "Olive Oil 500ml", category: "Cooking", qty: 60, unitPrice: 46.00, unitCost: 30.00, discount: 138, lineTotal: 2622, lineCost: 1800, lineGP: 822, gpPct: 31.4 },
          { itemCode: "ITM-003", itemName: "Full Cream Milk 4L", category: "Dairy", qty: 80, unitPrice: 18.00, unitCost: 12.20, discount: 86, lineTotal: 1354, lineCost: 976, lineGP: 378, gpPct: 27.9 },
          { itemCode: "ITM-002", itemName: "Fresh OJ 1L", category: "Beverages", qty: 120, unitPrice: 12.00, unitCost: 7.80, discount: 144, lineTotal: 1296, lineCost: 936, lineGP: 360, gpPct: 27.8 },
          { itemCode: "ITM-007", itemName: "Greek Yoghurt 500g", category: "Dairy", qty: 80, unitPrice: 18.00, unitCost: 12.00, discount: 86, lineTotal: 1354, lineCost: 960, lineGP: 394, gpPct: 29.1 },
          { itemCode: "ITM-008", itemName: "Tomato Paste 400g", category: "Canned", qty: 200, unitPrice: 9.00, unitCost: 5.80, discount: 108, lineTotal: 1692, lineCost: 1160, lineGP: 532, gpPct: 31.4 },
          { itemCode: "ITM-006", itemName: "Whole Wheat Bread", category: "Bakery", qty: 80, unitPrice: 9.00, unitCost: 5.20, discount: 86, lineTotal: 634, lineCost: 416, lineGP: 218, gpPct: 34.4 },
          { itemCode: "ITM-006b", itemName: "Sourdough Loaf", category: "Bakery", qty: 10, unitPrice: 16.00, unitCost: 10.00, discount: 19, lineTotal: 141, lineCost: 100, lineGP: 41, gpPct: 29.1 },
          { itemCode: "ITM-002b", itemName: "Mango Juice 1L", category: "Beverages", qty: 20, unitPrice: 14.00, unitCost: 9.50, discount: 17, lineTotal: 263, lineCost: 190, lineGP: 73, gpPct: 27.8 },
        ],
      },
    ],
  },
];

function clearInitialSalesReportData() {
  mockSalesSummaryData = [];
  mockChannelSalesData = [];
  mockDailySalesData = {
    date: "",
    branch: "All Branches",
    preparedBy: "System",
    approvedBy: "",
    shift: "Selected period",
    openingBalances: [],
    posSales: 0,
    vanSales: 0,
    backOfficeSales: 0,
    totalGrossSales: 0,
    salesReturns: 0,
    discounts: 0,
    netSales: 0,
    vatOnSales: 0,
    salesPayments: [],
    totalPurchases: 0,
    purchaseReturns: 0,
    netPurchases: 0,
    vatOnPurchases: 0,
    purchasePayments: [],
    totalExpenses: 0,
    expensePayments: [],
    salesReturnLines: [],
    purchaseReturnLines: [],
    soAdvances: [],
    lpoAdvances: [],
    salaryAdvances: [],
    otherReceipts: [],
    otherPayments: [],
    customerReceipts: [],
    vendorPayments: [],
    cashAccounts: [],
    bankAccounts: [],
  };
  mockCustomerSalesData = [];
  mockCashierPerformanceData = [];
  mockPOSTransactionData = [];
  mockPOSItemSalesData = [];
  mockPOSPaymentData = [];
  mockVoidData = [];
  mockVANSalesSummaryData = [];
  mockVANRouteData = [];
  mockVANItemData = [];
  mockVANCollectionData = [];
  mockVANStockData = [];
  mockInvoiceRegisterData = [];
  mockOrderStatusData = [];
  mockDeliveryData = [];
  mockCreditNoteData = [];
  mockAgingData = [];
  mockTopDormantData = { top: [], dormant: [] };
  mockPriceLevelData = [];
  mockItemWiseSalesData = [];
  mockCategoryData = [];
  mockFastSlowData = { fast: [], slow: [] };
  mockDiscountData = [];
  mockPromotionData = [];
  mockFreeIssueData = [];
  mockTaxData = [
    { taxRate: "5% VAT Standard", taxableSales: 0, taxAmount: 0, exemptSales: 0, zeroRated: 0, netTaxPayable: 0 },
    { taxRate: "0% Zero-Rated", taxableSales: 0, taxAmount: 0, exemptSales: 0, zeroRated: 0, netTaxPayable: 0 },
    { taxRate: "Exempt", taxableSales: 0, taxAmount: 0, exemptSales: 0, zeroRated: 0, netTaxPayable: 0 },
  ];
  mockVATOutputData = [];
  mockPriceOverrideData = [];
  mockManualEntryData = [];
  mockEditLogData = [];
  mockProfitDrilldownData = [];
}

clearInitialSalesReportData();

const CHANNEL_COLORS: Record<string, string> = {
  "POS": "text-purple-700 bg-purple-50 border-purple-200",
  "Back-Office": "text-blue-700 bg-blue-50 border-blue-200",
  "VAN": "text-amber-700 bg-amber-50 border-amber-200",
};

function gpBadge(gp: number) {
  if (gp >= 32) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (gp >= 25) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function CustomerProfitDrilldownReport() {
  useDataRevision();
  const [valuation, setValuation] = React.useState<ValuationMethod>("average_cost");
  const [expandedCustomers, setExpandedCustomers] = React.useState<Set<string>>(new Set(["CUS-001"]));
  const [expandedBills, setExpandedBills] = React.useState<Set<string>>(new Set());

  const toggleCustomer = (id: string) => setExpandedCustomers(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleBill = (no: string) => setExpandedBills(prev => {
    const next = new Set(prev);
    next.has(no) ? next.delete(no) : next.add(no);
    return next;
  });

  // Apply valuation from the bottom up: item → bill → customer
  const valuatedData: ProfitCustomer[] = mockProfitDrilldownData.map((customer) => {
    const bills: ProfitBill[] = customer.bills.map((bill) => {
      const items: ProfitItem[] = bill.items.map((item) => {
        const { cost: lineCost, gp: lineGP, gpPct } = recompute(item.lineTotal, item.lineCost, valuation);
        const unitCost = parseFloat((lineCost / item.qty).toFixed(2));
        return { ...item, unitCost, lineCost, lineGP, gpPct };
      });
      const totalCost = items.reduce((s, i) => s + i.lineCost, 0);
      const grossProfit = bill.netTotal - totalCost;
      const gpPct = bill.netTotal > 0 ? parseFloat(((grossProfit / bill.netTotal) * 100).toFixed(1)) : 0;
      return { ...bill, items, totalCost, grossProfit, gpPct };
    });
    const totalCost = bills.reduce((s, b) => s + b.totalCost, 0);
    const grossProfit = customer.netSales - totalCost;
    const gpPct = customer.netSales > 0 ? parseFloat(((grossProfit / customer.netSales) * 100).toFixed(1)) : 0;
    return { ...customer, bills, totalCost, grossProfit, gpPct };
  });

  const grandTotals = valuatedData.reduce((acc, c) => ({
    grossSales: acc.grossSales + c.grossSales,
    netSales: acc.netSales + c.netSales,
    totalCost: acc.totalCost + c.totalCost,
    grossProfit: acc.grossProfit + c.grossProfit,
    totalDiscount: acc.totalDiscount + c.totalDiscount,
  }), { grossSales: 0, netSales: 0, totalCost: 0, grossProfit: 0, totalDiscount: 0 });

  const overallGP = grandTotals.netSales > 0 ? (grandTotals.grossProfit / grandTotals.netSales * 100) : 0;

  const gpChartData = valuatedData.map(c => ({
    name: c.customerName.split(' ').slice(0, 2).join(' '),
    gpPct: c.gpPct,
    grossProfit: c.grossProfit,
    netSales: c.netSales,
  }));

  useReportView("customer_profit_drilldown", {
    note: `Valuation: ${VALUATION_METHODS.find((m) => m.id === valuation)?.label || valuation}`,
    kpis: [
      { label: "Gross Sales", value: `AED ${grandTotals.grossSales.toLocaleString()}` },
      { label: "Total Discounts", value: `AED ${grandTotals.totalDiscount.toLocaleString()}` },
      { label: "Net Sales", value: `AED ${grandTotals.netSales.toLocaleString()}` },
      { label: "Total Cost", value: `AED ${grandTotals.totalCost.toLocaleString()}` },
      { label: "Gross Profit", value: `AED ${grandTotals.grossProfit.toLocaleString()}`, hint: `${overallGP.toFixed(1)}%` },
    ],
    sections: [
      {
        title: "Customer Profit Summary",
        columns: [
          { key: "customer", header: "Customer", align: "left", width: 24 },
          { key: "priceLevel", header: "Price Level", align: "left", width: 14 },
          { key: "bills", header: "Bills", align: "right", width: 8 },
          { key: "grossSales", header: "Gross Sales", align: "right", width: 14 },
          { key: "discount", header: "Discount", align: "right", width: 14 },
          { key: "netSales", header: "Net Sales", align: "right", width: 14 },
          { key: "cost", header: "Cost", align: "right", width: 14 },
          { key: "grossProfit", header: "Gross Profit", align: "right", width: 14 },
          { key: "gpPct", header: "GP %", align: "right", width: 10 },
        ],
        rows: valuatedData.map((c) => ({
          customer: c.customerName,
          priceLevel: c.priceLevel,
          bills: c.totalBills,
          grossSales: `AED ${c.grossSales.toLocaleString()}`,
          discount: `AED ${c.totalDiscount.toLocaleString()}`,
          netSales: `AED ${c.netSales.toLocaleString()}`,
          cost: `AED ${c.totalCost.toLocaleString()}`,
          grossProfit: `AED ${c.grossProfit.toLocaleString()}`,
          gpPct: `${c.gpPct}%`,
        })),
        totals: {
          customer: "GRAND TOTAL",
          grossSales: `AED ${grandTotals.grossSales.toLocaleString()}`,
          discount: `AED ${grandTotals.totalDiscount.toLocaleString()}`,
          netSales: `AED ${grandTotals.netSales.toLocaleString()}`,
          cost: `AED ${grandTotals.totalCost.toLocaleString()}`,
          grossProfit: `AED ${grandTotals.grossProfit.toLocaleString()}`,
          gpPct: `${overallGP.toFixed(1)}%`,
        },
      },
      {
        title: "Bill → Item Detail",
        columns: [
          { key: "customer", header: "Customer", align: "left", width: 20 },
          { key: "billNo", header: "Bill No", align: "left", width: 14 },
          { key: "date", header: "Date", align: "left", width: 12 },
          { key: "item", header: "Item", align: "left", width: 20 },
          { key: "qty", header: "Qty", align: "right", width: 8 },
          { key: "lineTotal", header: "Net Sales", align: "right", width: 14 },
          { key: "lineCost", header: "Cost", align: "right", width: 14 },
          { key: "lineGP", header: "Gross Profit", align: "right", width: 14 },
          { key: "gpPct", header: "GP %", align: "right", width: 10 },
        ],
        rows: valuatedData.flatMap((c) =>
          c.bills.flatMap((bill) =>
            bill.items.map((item) => ({
              customer: c.customerName,
              billNo: bill.billNo,
              date: bill.date,
              item: item.itemName,
              qty: item.qty,
              lineTotal: `AED ${item.lineTotal.toLocaleString()}`,
              lineCost: `AED ${item.lineCost.toLocaleString()}`,
              lineGP: `AED ${item.lineGP.toLocaleString()}`,
              gpPct: `${item.gpPct}%`,
            }))
          )
        ),
      },
    ],
  });

  return (
    <div className="space-y-3">
      <ValuationSelector value={valuation} onChange={setValuation} />
      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Gross Sales", value: `AED ${grandTotals.grossSales.toLocaleString()}`, color: "text-slate-900" },
          { label: "Total Discounts", value: `AED ${grandTotals.totalDiscount.toLocaleString()}`, color: "text-orange-600" },
          { label: "Net Sales", value: `AED ${grandTotals.netSales.toLocaleString()}`, color: "text-[#F5C742]" },
          { label: "Total Cost", value: `AED ${grandTotals.totalCost.toLocaleString()}`, color: "text-slate-600" },
          { label: "Gross Profit", value: `AED ${grandTotals.grossProfit.toLocaleString()} (${overallGP.toFixed(1)}%)`, color: "text-emerald-700" },
        ].map((kpi, i) => (
          <Card key={i} className={`border ${i === 4 ? "border-2 border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-600 mb-1">{kpi.label}</div>
              <div className={`text-sm font-bold leading-tight ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">GP % by Customer</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={gpChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} unit="%" domain={[0, 45]} />
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `${val.toFixed(1)}%`} />
                <Bar dataKey="gpPct" fill="#10b981" name="GP %" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Net Sales vs Gross Profit</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={gpChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} formatter={(val: number) => `AED ${val.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="netSales" fill="#F5C742" name="Net Sales" />
                <Bar dataKey="grossProfit" fill="#10b981" name="Gross Profit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Drilldown table */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold text-slate-800">Customer → Bill → Item Profit Drilldown</CardTitle>
              <span className="text-[10px] text-slate-500">Click a customer or bill row to expand items</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1" onClick={() => {
              const rows = valuatedData.flatMap(c => c.bills.flatMap(b => b.items.map(i => ({
                customer: c.customerName, billNo: b.billNo, billDate: b.billDate,
                itemCode: i.itemCode, itemName: i.itemName, category: i.category,
                qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal,
                unitCost: i.unitCost, lineCost: i.lineCost, lineGP: i.lineGP, gpPct: i.gpPct,
              }))));
              exportData(rows, [{ header: "Customer", key: "customer" }, { header: "Bill No", key: "billNo" }, { header: "Date", key: "billDate" }, { header: "Item Code", key: "itemCode" }, { header: "Item Name", key: "itemName" }, { header: "Category", key: "category" }, { header: "Qty", key: "qty" }, { header: "Unit Price", key: "unitPrice" }, { header: "Line Total", key: "lineTotal" }, { header: "Unit Cost", key: "unitCost" }, { header: "Line Cost", key: "lineCost" }, { header: "Gross Profit", key: "lineGP" }, { header: "GP %", key: "gpPct" }], "Customer_Profit_Drilldown");
            }}>
              <Download className="h-3 w-3" />Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-200 rounded-lg overflow-hidden text-[11px]">

            {/* Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-slate-100 text-slate-500 font-medium text-[10px]">
              <div className="px-3 py-2">Name / Item</div>
              <div className="px-3 py-2 text-right">Gross Sales</div>
              <div className="px-3 py-2 text-right">Discount</div>
              <div className="px-3 py-2 text-right">Net Sales</div>
              <div className="px-3 py-2 text-right">Cost</div>
              <div className="px-3 py-2 text-right">Gross Profit</div>
              <div className="px-3 py-2 text-right">GP %</div>
              <div className="px-3 py-2 text-right">Qty</div>
            </div>

            {valuatedData.map((customer) => {
              const custExpanded = expandedCustomers.has(customer.customerId);
              return (
                <div key={customer.customerId}>

                  {/* ── Customer row ── */}
                  <button
                    onClick={() => toggleCustomer(customer.customerId)}
                    className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-[#FFFBEC] border-t border-slate-200 hover:bg-[#FFF6D8] transition-colors"
                  >
                    <div className="px-3 py-2.5 flex items-center gap-2 text-left">
                      {custExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-[#F5C742] shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">{customer.customerName}</span>
                        <span className="text-[9px] text-slate-500">{customer.priceLevel} · {customer.totalBills} bill{customer.totalBills > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="px-3 py-2.5 text-right text-slate-700 font-medium self-center">AED {customer.grossSales.toLocaleString()}</div>
                    <div className="px-3 py-2.5 text-right text-orange-600 self-center">AED {customer.totalDiscount.toLocaleString()}</div>
                    <div className="px-3 py-2.5 text-right font-bold text-[#F5C742] self-center">AED {customer.netSales.toLocaleString()}</div>
                    <div className="px-3 py-2.5 text-right text-slate-600 self-center">AED {customer.totalCost.toLocaleString()}</div>
                    <div className="px-3 py-2.5 text-right font-bold text-emerald-700 self-center">AED {customer.grossProfit.toLocaleString()}</div>
                    <div className="px-3 py-2.5 text-right self-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${gpBadge(customer.gpPct)}`}>{customer.gpPct.toFixed(1)}%</span>
                    </div>
                    <div className="px-3 py-2.5 text-right text-slate-500 self-center">—</div>
                  </button>

                  {/* ── Bills ── */}
                  {custExpanded && customer.bills.map((bill) => {
                    const billExpanded = expandedBills.has(bill.billNo);
                    return (
                      <div key={bill.billNo}>

                        {/* Bill row */}
                        <button
                          onClick={() => toggleBill(bill.billNo)}
                          className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-slate-50 border-t border-slate-100 hover:bg-slate-100 transition-colors"
                        >
                          <div className="px-3 py-2 pl-8 flex items-center gap-2 text-left">
                            {billExpanded
                              ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-blue-700">{bill.billNo}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${CHANNEL_COLORS[bill.channel]}`}>{bill.channel}</span>
                              </div>
                              <span className="text-[9px] text-slate-500">{bill.date} · {bill.salesperson}</span>
                            </div>
                          </div>
                          <div className="px-3 py-2 text-right text-slate-600 self-center">AED {bill.grossTotal.toLocaleString()}</div>
                          <div className="px-3 py-2 text-right text-orange-500 self-center">AED {bill.discount.toLocaleString()}</div>
                          <div className="px-3 py-2 text-right font-semibold text-slate-800 self-center">AED {bill.netTotal.toLocaleString()}</div>
                          <div className="px-3 py-2 text-right text-slate-500 self-center">AED {bill.totalCost.toLocaleString()}</div>
                          <div className="px-3 py-2 text-right font-semibold text-emerald-600 self-center">AED {bill.grossProfit.toLocaleString()}</div>
                          <div className="px-3 py-2 text-right self-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${gpBadge(bill.gpPct)}`}>{bill.gpPct.toFixed(1)}%</span>
                          </div>
                          <div className="px-3 py-2 text-right text-slate-500 self-center text-[10px]">{bill.items.length} items</div>
                        </button>

                        {/* ── Items ── */}
                        {billExpanded && (
                          <div className="border-t border-slate-100">
                            {/* Item sub-header */}
                            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-slate-100/60 text-slate-400 text-[9px] font-medium">
                              <div className="px-3 py-1.5 pl-14">Item</div>
                              <div className="px-3 py-1.5 text-right">Unit Price</div>
                              <div className="px-3 py-1.5 text-right">Unit Cost</div>
                              <div className="px-3 py-1.5 text-right">Line Total</div>
                              <div className="px-3 py-1.5 text-right">Line Cost</div>
                              <div className="px-3 py-1.5 text-right">Line GP</div>
                              <div className="px-3 py-1.5 text-right">GP %</div>
                              <div className="px-3 py-1.5 text-right">Qty</div>
                            </div>
                            {bill.items.map((item, iIdx) => (
                              <div
                                key={iIdx}
                                className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-t border-slate-50 text-[10px] ${iIdx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                              >
                                <div className="px-3 py-1.5 pl-14 flex items-center gap-1.5">
                                  <span className="font-mono text-[9px] text-slate-400">{item.itemCode}</span>
                                  <div>
                                    <div className="font-medium text-slate-800">{item.itemName}</div>
                                    <div className="text-[9px] text-slate-400">{item.category}</div>
                                  </div>
                                </div>
                                <div className="px-3 py-1.5 text-right text-slate-600">AED {item.unitPrice.toFixed(2)}</div>
                                <div className="px-3 py-1.5 text-right text-slate-500">AED {item.unitCost.toFixed(2)}</div>
                                <div className="px-3 py-1.5 text-right text-slate-700">AED {item.lineTotal.toLocaleString()}</div>
                                <div className="px-3 py-1.5 text-right text-slate-500">AED {item.lineCost.toLocaleString()}</div>
                                <div className="px-3 py-1.5 text-right font-semibold text-emerald-600">AED {item.lineGP.toLocaleString()}</div>
                                <div className="px-3 py-1.5 text-right">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${gpBadge(item.gpPct)}`}>{item.gpPct.toFixed(1)}%</span>
                                </div>
                                <div className="px-3 py-1.5 text-right text-slate-600 font-medium">{item.qty}</div>
                              </div>
                            ))}
                            {/* Bill item totals */}
                            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-slate-100 text-[10px] font-semibold border-t border-slate-200">
                              <div className="px-3 py-1.5 pl-14 text-slate-700">Bill Total ({bill.items.length} items)</div>
                              <div className="px-3 py-1.5 text-right text-slate-500">—</div>
                              <div className="px-3 py-1.5 text-right text-slate-500">—</div>
                              <div className="px-3 py-1.5 text-right text-slate-800">AED {bill.netTotal.toLocaleString()}</div>
                              <div className="px-3 py-1.5 text-right text-slate-600">AED {bill.totalCost.toLocaleString()}</div>
                              <div className="px-3 py-1.5 text-right text-emerald-700">AED {bill.grossProfit.toLocaleString()}</div>
                              <div className="px-3 py-1.5 text-right">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${gpBadge(bill.gpPct)}`}>{bill.gpPct.toFixed(1)}%</span>
                              </div>
                              <div className="px-3 py-1.5 text-right text-slate-600">{bill.items.reduce((s, i) => s + i.qty, 0)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Grand total row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-[#F5C742] text-slate-900 font-bold text-[11px] border-t-2 border-[#e4b82e]">
              <div className="px-3 py-2.5">GRAND TOTAL ({mockProfitDrilldownData.length} customers)</div>
              <div className="px-3 py-2.5 text-right">AED {grandTotals.grossSales.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right">AED {grandTotals.totalDiscount.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right">AED {grandTotals.netSales.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right">AED {grandTotals.totalCost.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right">AED {grandTotals.grossProfit.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right">{overallGP.toFixed(1)}%</div>
              <div className="px-3 py-2.5 text-right">—</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SalesReports;
