import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Warehouse,
  Tags,
  Layers,
  Barcode,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  BarChart3,
  FileSpreadsheet,
  FileText,
  DollarSign,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../../Sales/Reports/ui/card";
import { Button } from "../../Sales/Reports/ui/button";
import { Badge } from "../../Sales/Reports/ui/badge";
import { Separator } from "../../Sales/Reports/ui/separator";
import { Input } from "../../Sales/Reports/ui/input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { getInventoryReportData } from "../../../api/inventoryReportsApi";
import { getWarehouses } from "../../../api/warehouseApi";
import { getBrands } from "../../../api/brandsApi";
import { getDepartments } from "../../../api/departmentsApi";
import { exportToPDF, exportToExcel } from "../../../utils/exportUtils";
import { generateReportPrintHtml, printHtml } from "../../../utils/printGenerator";
import { getCompanyProfile } from "../../../api/companyProfileApi";
import ExportDropdown from "../../../components/common/ExportDropdown";

type ReportGroupId =
  | "stock"
  | "movement"
  | "pricing"
  | "master"
  | "ops";

type ReportId =
  | "soh"
  | "low_stock"
  | "out_of_stock"
  | "negative_stock"
  | "valuation"
  | "expiry"
  | "movement_ledger"
  | "transfer"
  | "reconciliation"
  | "wastage"
  | "in_out_summary"
  | "price_audit"
  | "cost_variance"
  | "margin"
  | "master_completeness"
  | "barcode_audit"
  | "scale_export"
  | "dead_stock"
  | "fast_moving"
  | "bin_stock";

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
  // A) Stock & Availability
  {
    id: "soh",
    label: "Stock on Hand (SOH)",
    description: "Current available qty by warehouse / category / item.",
    kind: "table+chart",
    group: "stock",
    tags: ["Core"],
  },
  {
    id: "low_stock",
    label: "Low Stock / Reorder",
    description: "Items below min stock + suggested purchase qty.",
    kind: "table",
    group: "stock",
    tags: ["Planning"],
  },
  {
    id: "out_of_stock",
    label: "Out of Stock",
    description: "Zero stock items with last sold / last received signals.",
    kind: "table",
    group: "stock",
    tags: ["Alert"],
  },
  {
    id: "negative_stock",
    label: "Negative Stock / Mismatch",
    description: "Data integrity issues: negative qty, missing batches, etc.",
    kind: "table",
    group: "stock",
    tags: ["Audit"],
  },
  {
    id: "valuation",
    label: "Stock Valuation",
    description: "Valuation by Avg / FIFO / Last cost with totals.",
    kind: "table+chart",
    group: "stock",
    tags: ["Finance"],
  },
  {
    id: "expiry",
    label: "Expiry / Batch Ageing",
    description: "Expiring items in X days + ageing buckets (batch/expiry enabled).",
    kind: "table",
    group: "stock",
    tags: ["Batch"],
  },

  // B) Movement & Control
  {
    id: "movement_ledger",
    label: "Stock Movement Ledger",
    description: "All in/out transactions with running balance per item.",
    kind: "table",
    group: "movement",
    tags: ["Ledger"],
  },
  {
    id: "transfer",
    label: "Stock Transfer Report",
    description: "Transfers: pending, in-transit, completed, variance.",
    kind: "table",
    group: "movement",
    tags: ["Warehouse"],
  },
  {
    id: "reconciliation",
    label: "Stock Reconciliation Report",
    description: "Adjustments with reason & approver audit.",
    kind: "table",
    group: "movement",
    tags: ["Audit"],
  },
  {
    id: "wastage",
    label: "Wastage / Internal Consumption",
    description: "Internal usage & wastage with cost impact.",
    kind: "table+chart",
    group: "movement",
    tags: ["Loss"],
  },
  {
    id: "in_out_summary",
    label: "Inflow vs Outflow Summary",
    description: "Period-based inflow/outflow by category & warehouse.",
    kind: "table+chart",
    group: "movement",
    tags: ["Planning"],
  },

  // C) Pricing & Margin
  {
    id: "price_audit",
    label: "Price Level / Price Change Audit",
    description: "Track price updates, user, timestamp, old vs new.",
    kind: "table",
    group: "pricing",
    tags: ["Audit"],
  },
  {
    id: "cost_variance",
    label: "GRN vs Invoice Cost Variance",
    description: "Cost differences between receiving & invoicing stages.",
    kind: "table",
    group: "pricing",
    tags: ["Finance"],
  },
  {
    id: "margin",
    label: "Item Margin Report (GP%)",
    description: "Sales vs cost, gross profit by item/category (needs sales link).",
    kind: "table+chart",
    group: "pricing",
    tags: ["Sales"],
  },

  // D) Master Data & Compliance
  {
    id: "master_completeness",
    label: "Item Master Completeness",
    description: "Missing barcode, missing cost, missing category, etc.",
    kind: "table",
    group: "master",
    tags: ["Quality"],
  },
  {
    id: "barcode_audit",
    label: "Barcode / Label Audit",
    description: "Label templates, last printed, print queue status.",
    kind: "table",
    group: "master",
    tags: ["Barcode"],
  },
  {
    id: "scale_export",
    label: "Weighing Scale Export Report",
    description: "Items synced vs pending/failed to weighing scales.",
    kind: "table",
    group: "master",
    tags: ["Scale"],
  },

  // E) Operational
  {
    id: "dead_stock",
    label: "Dead / Slow Moving Stock",
    description: "No sales in X days; ageing buckets.",
    kind: "table+chart",
    group: "ops",
    tags: ["Planning"],
  },
  {
    id: "fast_moving",
    label: "Fast Moving Items",
    description: "Top movers by qty/value for replenishment.",
    kind: "table+chart",
    group: "ops",
    tags: ["Planning"],
  },
  {
    id: "bin_stock",
    label: "Warehouse Bin Stock",
    description: "Bin / rack-wise stock (if bin locations enabled).",
    kind: "table",
    group: "ops",
    tags: ["Warehouse"],
  },
];

// Mock result sets (for UI wiring)
let mockRowsSOH = [
  { sku: "SKU-1001", item: "Basmati Rice 5kg", warehouse: "Main WH", qty: 124, uom: "Bag", cost: 62.5, value: 7750 },
  { sku: "SKU-2033", item: "Olive Oil 1L", warehouse: "Main WH", qty: 48, uom: "Bottle", cost: 18.0, value: 864 },
  { sku: "SKU-3102", item: "Paper Cup 8oz", warehouse: "Outlet WH", qty: 980, uom: "Pc", cost: 0.22, value: 215.6 },
];

let mockRowsLowStock = [
  { sku: "SKU-4410", item: "Cheddar Slice 1kg", warehouse: "Main WH", onHand: 6, min: 20, suggested: 30, vendor: "DairyHub" },
  { sku: "SKU-5522", item: "Tomato Ketchup 5kg", warehouse: "Outlet WH", onHand: 2, min: 10, suggested: 18, vendor: "FoodPro" },
];

// Mock data for Stock Valuation report
let mockRowsValuation = [
  // Grocery Category
  { sku: "SKU-1001", item: "Basmati Rice 5kg", category: "Grocery", department: "Grains", warehouse: "Main WH", qty: 124, avgCost: 62.5, fifoCost: 63.2, lastCost: 64.0, avgValue: 7750.00, fifoValue: 7836.80, lastValue: 7936.00 },
  { sku: "SKU-1002", item: "Brown Rice 2kg", category: "Grocery", department: "Grains", warehouse: "Main WH", qty: 86, avgCost: 45.0, fifoCost: 44.5, lastCost: 46.0, avgValue: 3870.00, fifoValue: 3827.00, lastValue: 3956.00 },
  { sku: "SKU-1003", item: "Quinoa 1kg", category: "Grocery", department: "Grains", warehouse: "Outlet WH", qty: 42, avgCost: 85.0, fifoCost: 84.0, lastCost: 86.0, avgValue: 3570.00, fifoValue: 3528.00, lastValue: 3612.00 },
  
  // FMCG Category
  { sku: "SKU-2033", item: "Olive Oil 1L", category: "FMCG", department: "Oils", warehouse: "Main WH", qty: 48, avgCost: 18.0, fifoCost: 17.5, lastCost: 18.5, avgValue: 864.00, fifoValue: 840.00, lastValue: 888.00 },
  { sku: "SKU-2034", item: "Sunflower Oil 5L", category: "FMCG", department: "Oils", warehouse: "Main WH", qty: 156, avgCost: 42.0, fifoCost: 41.0, lastCost: 43.0, avgValue: 6552.00, fifoValue: 6396.00, lastValue: 6708.00 },
  { sku: "SKU-2035", item: "Coconut Oil 500ml", category: "FMCG", department: "Oils", warehouse: "Outlet WH", qty: 78, avgCost: 22.5, fifoCost: 22.0, lastCost: 23.0, avgValue: 1755.00, fifoValue: 1716.00, lastValue: 1794.00 },
  
  // Dairy Category
  { sku: "SKU-3001", item: "Fresh Milk 1L", category: "Dairy", department: "Beverages", warehouse: "Main WH", qty: 245, avgCost: 8.5, fifoCost: 8.3, lastCost: 8.7, avgValue: 2082.50, fifoValue: 2033.50, lastValue: 2131.50 },
  { sku: "SKU-3002", item: "Cheddar Cheese 200g", category: "Dairy", department: "Cheese", warehouse: "Main WH", qty: 134, avgCost: 15.5, fifoCost: 15.0, lastCost: 16.0, avgValue: 2077.00, fifoValue: 2010.00, lastValue: 2144.00 },
  { sku: "SKU-3003", item: "Greek Yogurt 500g", category: "Dairy", department: "Yogurt", warehouse: "Outlet WH", qty: 98, avgCost: 12.0, fifoCost: 11.8, lastCost: 12.2, avgValue: 1176.00, fifoValue: 1156.40, lastValue: 1195.60 },
  
  // Beverages Category
  { sku: "SKU-4001", item: "Orange Juice 1L", category: "Beverages", department: "Juices", warehouse: "Main WH", qty: 189, avgCost: 9.5, fifoCost: 9.3, lastCost: 9.7, avgValue: 1795.50, fifoValue: 1757.70, lastValue: 1833.30 },
  { sku: "SKU-4002", item: "Sparkling Water 500ml", category: "Beverages", department: "Water", warehouse: "Main WH", qty: 567, avgCost: 2.5, fifoCost: 2.4, lastCost: 2.6, avgValue: 1417.50, fifoValue: 1360.80, lastValue: 1474.20 },
  { sku: "SKU-4003", item: "Energy Drink 250ml", category: "Beverages", department: "Energy", warehouse: "Outlet WH", qty: 234, avgCost: 6.0, fifoCost: 5.8, lastCost: 6.2, avgValue: 1404.00, fifoValue: 1357.20, lastValue: 1450.80 },
  
  // Packaged Foods
  { sku: "SKU-5001", item: "Pasta Penne 500g", category: "Packaged Foods", department: "Pasta", warehouse: "Main WH", qty: 178, avgCost: 7.5, fifoCost: 7.3, lastCost: 7.7, avgValue: 1335.00, fifoValue: 1299.40, lastValue: 1370.60 },
  { sku: "SKU-5002", item: "Tomato Sauce 400g", category: "Packaged Foods", department: "Sauces", warehouse: "Main WH", qty: 298, avgCost: 5.5, fifoCost: 5.4, lastCost: 5.6, avgValue: 1639.00, fifoValue: 1609.20, lastValue: 1668.80 },
  { sku: "SKU-5003", item: "Instant Noodles Pack", category: "Packaged Foods", department: "Noodles", warehouse: "Outlet WH", qty: 456, avgCost: 3.2, fifoCost: 3.1, lastCost: 3.3, avgValue: 1459.20, fifoValue: 1413.60, lastValue: 1504.80 },
  
  // Disposables
  { sku: "SKU-3102", item: "Paper Cup 8oz", category: "Disposables", department: "Cups", warehouse: "Outlet WH", qty: 980, avgCost: 0.22, fifoCost: 0.21, lastCost: 0.23, avgValue: 215.60, fifoValue: 205.80, lastValue: 225.40 },
  { sku: "SKU-6001", item: "Plastic Fork Box", category: "Disposables", department: "Cutlery", warehouse: "Main WH", qty: 1245, avgCost: 0.15, fifoCost: 0.14, lastCost: 0.16, avgValue: 186.75, fifoValue: 174.30, lastValue: 199.20 },
  { sku: "SKU-6002", item: "Food Container 500ml", category: "Disposables", department: "Containers", warehouse: "Outlet WH", qty: 567, avgCost: 0.45, fifoCost: 0.44, lastCost: 0.46, avgValue: 255.15, fifoValue: 249.48, lastValue: 260.82 },
];

// Valuation summary by category
let mockValuationByCategory = [
  { category: "Grocery", items: 3, qty: 252, avgValue: 15190.00, fifoValue: 15191.80, lastValue: 15504.00, percentage: 24.8 },
  { category: "FMCG", items: 3, qty: 282, avgValue: 9171.00, fifoValue: 8952.00, lastValue: 9390.00, percentage: 15.0 },
  { category: "Dairy", items: 3, qty: 477, avgValue: 5335.50, fifoValue: 5199.90, lastValue: 5471.10, percentage: 8.7 },
  { category: "Beverages", items: 3, qty: 990, avgValue: 4617.00, fifoValue: 4475.70, lastValue: 4758.30, percentage: 7.5 },
  { category: "Packaged Foods", items: 3, qty: 932, avgValue: 4433.20, fifoValue: 4322.20, lastValue: 4544.20, percentage: 7.2 },
  { category: "Disposables", items: 3, qty: 2792, avgValue: 657.50, fifoValue: 629.58, lastValue: 685.42, percentage: 1.1 },
];

// Valuation summary by warehouse
let mockValuationByWarehouse = [
  { warehouse: "Main WH", items: 12, qty: 3472, avgValue: 32774.35, fifoValue: 31952.80, lastValue: 33456.90, percentage: 64.2 },
  { warehouse: "Outlet WH", items: 6, qty: 2253, avgValue: 8629.85, fifoValue: 8418.76, lastValue: 8896.62, percentage: 35.8 },
];

// ── Stock & Availability mock data ──────────────────────────────────────────

let mockSOH = [
  { sku: "SKU-1001", item: "Basmati Rice 5kg",      category: "Grocery",        warehouse: "Main WH",   qty: 124, minQty: 50,  reorder: 80,  uom: "Bag",    cost: 62.50, value: 7750.00 },
  { sku: "SKU-1002", item: "Brown Rice 2kg",         category: "Grocery",        warehouse: "Main WH",   qty: 86,  minQty: 30,  reorder: 50,  uom: "Bag",    cost: 45.00, value: 3870.00 },
  { sku: "SKU-1003", item: "Quinoa 1kg",             category: "Grocery",        warehouse: "Outlet WH", qty: 42,  minQty: 20,  reorder: 35,  uom: "Pack",   cost: 85.00, value: 3570.00 },
  { sku: "SKU-2033", item: "Olive Oil 1L",           category: "FMCG",           warehouse: "Main WH",   qty: 48,  minQty: 30,  reorder: 60,  uom: "Bottle", cost: 18.00, value:  864.00 },
  { sku: "SKU-2034", item: "Sunflower Oil 5L",       category: "FMCG",           warehouse: "Main WH",   qty: 156, minQty: 40,  reorder: 80,  uom: "Can",    cost: 42.00, value: 6552.00 },
  { sku: "SKU-2035", item: "Coconut Oil 500ml",      category: "FMCG",           warehouse: "Outlet WH", qty: 78,  minQty: 25,  reorder: 50,  uom: "Bottle", cost: 22.50, value: 1755.00 },
  { sku: "SKU-3001", item: "Fresh Milk 1L",          category: "Dairy",          warehouse: "Main WH",   qty: 245, minQty: 100, reorder: 150, uom: "Carton", cost:  8.50, value: 2082.50 },
  { sku: "SKU-3002", item: "Cheddar Cheese 200g",    category: "Dairy",          warehouse: "Main WH",   qty: 134, minQty: 50,  reorder: 80,  uom: "Pcs",   cost: 15.50, value: 2077.00 },
  { sku: "SKU-3003", item: "Greek Yogurt 500g",      category: "Dairy",          warehouse: "Outlet WH", qty: 98,  minQty: 40,  reorder: 60,  uom: "Cup",    cost: 12.00, value: 1176.00 },
  { sku: "SKU-4001", item: "Orange Juice 1L",        category: "Beverages",      warehouse: "Main WH",   qty: 189, minQty: 60,  reorder: 100, uom: "Bottle", cost:  9.50, value: 1795.50 },
  { sku: "SKU-4002", item: "Sparkling Water 500ml",  category: "Beverages",      warehouse: "Main WH",   qty: 567, minQty: 200, reorder: 300, uom: "Bottle", cost:  2.50, value: 1417.50 },
  { sku: "SKU-4003", item: "Energy Drink 250ml",     category: "Beverages",      warehouse: "Outlet WH", qty: 234, minQty: 80,  reorder: 120, uom: "Can",    cost:  6.00, value: 1404.00 },
  { sku: "SKU-5001", item: "Pasta Penne 500g",       category: "Packaged Foods", warehouse: "Main WH",   qty: 178, minQty: 60,  reorder: 100, uom: "Pack",   cost:  7.50, value: 1335.00 },
  { sku: "SKU-5002", item: "Tomato Sauce 400g",      category: "Packaged Foods", warehouse: "Main WH",   qty: 298, minQty: 100, reorder: 150, uom: "Can",    cost:  5.50, value: 1639.00 },
  { sku: "SKU-5003", item: "Instant Noodles Pack",   category: "Packaged Foods", warehouse: "Outlet WH", qty: 456, minQty: 150, reorder: 200, uom: "Pack",   cost:  3.20, value: 1459.20 },
  { sku: "SKU-3102", item: "Paper Cup 8oz",          category: "Disposables",    warehouse: "Outlet WH", qty: 980, minQty: 400, reorder: 600, uom: "Pcs",    cost:  0.22, value:  215.60 },
  { sku: "SKU-6001", item: "Plastic Fork Box",       category: "Disposables",    warehouse: "Main WH",   qty:1245, minQty: 400, reorder: 700, uom: "Box",    cost:  0.15, value:  186.75 },
  { sku: "SKU-6002", item: "Food Container 500ml",   category: "Disposables",    warehouse: "Outlet WH", qty: 567, minQty: 200, reorder: 350, uom: "Pcs",    cost:  0.45, value:  255.15 },
];

let mockSOHByCategory = [
  { category: "Grocery",        items: 3, qty: 252,  value: 15190.00 },
  { category: "FMCG",           items: 3, qty: 282,  value:  9171.00 },
  { category: "Dairy",          items: 3, qty: 477,  value:  5335.50 },
  { category: "Beverages",      items: 3, qty: 990,  value:  4617.00 },
  { category: "Packaged Foods", items: 3, qty: 932,  value:  4433.20 },
  { category: "Disposables",    items: 3, qty: 2792, value:   657.50 },
];

let mockLowStock = [
  { sku: "SKU-4410", item: "Cheddar Slice 1kg",     category: "Dairy",    warehouse: "Main WH",   onHand:  6, minQty: 20, reorderQty: 30, suggested: 24, vendor: "DairyHub",   lastPO: "2026-01-10", urgency: "Critical" },
  { sku: "SKU-5522", item: "Tomato Ketchup 5kg",    category: "Sauces",   warehouse: "Outlet WH", onHand:  2, minQty: 10, reorderQty: 18, suggested: 16, vendor: "FoodPro",    lastPO: "2026-01-08", urgency: "Critical" },
  { sku: "SKU-7810", item: "Butter 250g",           category: "Dairy",    warehouse: "Main WH",   onHand:  9, minQty: 25, reorderQty: 40, suggested: 31, vendor: "DairyHub",   lastPO: "2026-01-12", urgency: "High" },
  { sku: "SKU-2088", item: "Corn Flour 1kg",        category: "Grocery",  warehouse: "Main WH",   onHand: 14, minQty: 30, reorderQty: 50, suggested: 36, vendor: "GrainCo",    lastPO: "2026-01-05", urgency: "High" },
  { sku: "SKU-9910", item: "Cream Cheese 180g",     category: "Dairy",    warehouse: "Outlet WH", onHand: 11, minQty: 20, reorderQty: 30, suggested: 19, vendor: "DairyHub",   lastPO: "2026-01-09", urgency: "Medium" },
  { sku: "SKU-3388", item: "Sesame Oil 250ml",      category: "FMCG",     warehouse: "Main WH",   onHand: 18, minQty: 25, reorderQty: 40, suggested: 22, vendor: "OilTrade",   lastPO: "2026-01-07", urgency: "Medium" },
  { sku: "SKU-4512", item: "Dried Chilli Flakes",   category: "Spices",   warehouse: "Main WH",   onHand: 22, minQty: 30, reorderQty: 50, suggested: 28, vendor: "SpiceWorld", lastPO: "2026-01-11", urgency: "Medium" },
  { sku: "SKU-8801", item: "Washing-Up Liquid 1L",  category: "Cleaning", warehouse: "Outlet WH", onHand: 19, minQty: 24, reorderQty: 36, suggested: 17, vendor: "CleanPro",   lastPO: "2025-12-28", urgency: "Low" },
];

let mockOutOfStock = [
  { sku: "SKU-7001", item: "Mozzarella Block 500g",  category: "Dairy",    warehouse: "Main WH",   lastSold: "2026-01-14", lastReceived: "2025-12-20", avgDailySales: 12, daysSinceStock: 27, suggestedPO: 180 },
  { sku: "SKU-7002", item: "Peanut Butter 340g",     category: "Grocery",  warehouse: "Main WH",   lastSold: "2026-01-15", lastReceived: "2025-12-18", avgDailySales:  8, daysSinceStock: 29, suggestedPO: 120 },
  { sku: "SKU-7003", item: "Almond Milk 1L",         category: "Dairy",    warehouse: "Outlet WH", lastSold: "2026-01-13", lastReceived: "2025-12-15", avgDailySales:  5, daysSinceStock: 32, suggestedPO:  75 },
  { sku: "SKU-7004", item: "Protein Bar 60g",        category: "Snacks",   warehouse: "Main WH",   lastSold: "2026-01-16", lastReceived: "2026-01-02", avgDailySales: 22, daysSinceStock: 14, suggestedPO: 220 },
  { sku: "SKU-7005", item: "Coconut Milk 400ml",     category: "Grocery",  warehouse: "Main WH",   lastSold: "2026-01-10", lastReceived: "2025-12-22", avgDailySales:  6, daysSinceStock: 25, suggestedPO:  90 },
  { sku: "SKU-7006", item: "Black Pepper Grinder",   category: "Spices",   warehouse: "Outlet WH", lastSold: "2026-01-08", lastReceived: "2025-12-10", avgDailySales:  3, daysSinceStock: 37, suggestedPO:  45 },
  { sku: "SKU-7007", item: "Tahini Paste 300g",      category: "Sauces",   warehouse: "Main WH",   lastSold: "2026-01-12", lastReceived: "2025-12-28", avgDailySales:  4, daysSinceStock: 19, suggestedPO:  60 },
];

let mockNegativeStock = [
  { sku: "SKU-8101", item: "Fresh Cream 200ml",      category: "Dairy",    warehouse: "Main WH",   qty: -4,  issue: "GRN not posted",         lastTxn: "2026-01-15", impact: -220.00,  severity: "High" },
  { sku: "SKU-8102", item: "Mango Pulp 850g",        category: "Grocery",  warehouse: "Outlet WH", qty: -2,  issue: "Return processed twice",  lastTxn: "2026-01-14", impact:  -96.00,  severity: "High" },
  { sku: "SKU-8103", item: "Vanilla Extract 50ml",   category: "FMCG",     warehouse: "Main WH",   qty: -1,  issue: "Unit of measure mismatch",lastTxn: "2026-01-13", impact:  -38.00,  severity: "Medium" },
  { sku: "SKU-8104", item: "Chili Sauce 500ml",      category: "Sauces",   warehouse: "Main WH",   qty: -6,  issue: "Opening balance error",   lastTxn: "2026-01-12", impact: -186.00,  severity: "High" },
  { sku: "SKU-8105", item: "Mixed Nuts 500g",        category: "Snacks",   warehouse: "Outlet WH", qty: -3,  issue: "Missing batch receipt",   lastTxn: "2026-01-11", impact: -285.00,  severity: "Critical" },
  { sku: "SKU-8106", item: "Soy Sauce 150ml",        category: "Sauces",   warehouse: "Main WH",   qty: -8,  issue: "Transfer qty mismatch",   lastTxn: "2026-01-10", impact: -112.00,  severity: "Medium" },
  { sku: "SKU-8107", item: "Garlic Paste 300g",      category: "Grocery",  warehouse: "Main WH",   qty: -2,  issue: "POS sale without receipt", lastTxn: "2026-01-09", impact:  -64.00,  severity: "Medium" },
];

interface ExpiryBatch {
  batchNo: string;
  warehouse: string;
  qty: number;
  expiryDate: string;
  daysLeft: number;
  cost: number;
  value: number;
  status: string;
}
interface ExpiryItem {
  sku: string;
  item: string;
  category: string;
  batches: ExpiryBatch[];
}

let mockExpiry: ExpiryItem[] = [
  {
    sku: "SKU-3001", item: "Fresh Milk 1L", category: "Dairy",
    batches: [
      { batchNo: "BCH-240118", warehouse: "Main WH",   qty: 48,  expiryDate: "2026-01-19", daysLeft:  3, cost: 8.50, value:  408.00, status: "Critical" },
      { batchNo: "BCH-240102", warehouse: "Main WH",   qty: 120, expiryDate: "2026-01-24", daysLeft:  8, cost: 8.50, value: 1020.00, status: "High" },
      { batchNo: "BCH-240088", warehouse: "Outlet WH", qty: 60,  expiryDate: "2026-02-01", daysLeft: 16, cost: 8.50, value:  510.00, status: "Warning" },
    ],
  },
  {
    sku: "SKU-3002", item: "Cheddar Cheese 200g", category: "Dairy",
    batches: [
      { batchNo: "BCH-240112", warehouse: "Main WH",   qty: 22,  expiryDate: "2026-01-22", daysLeft:  6, cost: 15.50, value:  341.00, status: "Critical" },
      { batchNo: "BCH-240085", warehouse: "Main WH",   qty: 40,  expiryDate: "2026-02-05", daysLeft: 20, cost: 15.50, value:  620.00, status: "Warning" },
      { batchNo: "BCH-240060", warehouse: "Outlet WH", qty: 35,  expiryDate: "2026-02-20", daysLeft: 35, cost: 15.50, value:  542.50, status: "Watch" },
    ],
  },
  {
    sku: "SKU-4001", item: "Orange Juice 1L", category: "Beverages",
    batches: [
      { batchNo: "BCH-240095", warehouse: "Outlet WH", qty: 36,  expiryDate: "2026-01-26", daysLeft: 10, cost: 9.50, value:  342.00, status: "High" },
      { batchNo: "BCH-240078", warehouse: "Main WH",   qty: 80,  expiryDate: "2026-02-08", daysLeft: 23, cost: 9.50, value:  760.00, status: "Warning" },
    ],
  },
  {
    sku: "SKU-3003", item: "Greek Yogurt 500g", category: "Dairy",
    batches: [
      { batchNo: "BCH-240101", warehouse: "Outlet WH", qty: 55,  expiryDate: "2026-01-28", daysLeft: 12, cost: 12.00, value:  660.00, status: "High" },
      { batchNo: "BCH-240080", warehouse: "Main WH",   qty: 90,  expiryDate: "2026-02-12", daysLeft: 27, cost: 12.00, value: 1080.00, status: "Watch" },
      { batchNo: "BCH-240055", warehouse: "Outlet WH", qty: 40,  expiryDate: "2026-03-05", daysLeft: 49, cost: 12.00, value:  480.00, status: "OK" },
    ],
  },
  {
    sku: "SKU-5002", item: "Tomato Sauce 400g", category: "Packaged Foods",
    batches: [
      { batchNo: "BCH-239088", warehouse: "Main WH",   qty: 120, expiryDate: "2026-02-04", daysLeft: 19, cost: 5.50, value:  660.00, status: "Warning" },
      { batchNo: "BCH-239044", warehouse: "Main WH",   qty: 200, expiryDate: "2026-04-10", daysLeft: 84, cost: 5.50, value: 1100.00, status: "OK" },
    ],
  },
  {
    sku: "SKU-2033", item: "Olive Oil 1L", category: "FMCG",
    batches: [
      { batchNo: "BCH-238044", warehouse: "Main WH",   qty: 24,  expiryDate: "2026-02-10", daysLeft: 25, cost: 18.00, value:  432.00, status: "Warning" },
      { batchNo: "BCH-238012", warehouse: "Main WH",   qty: 48,  expiryDate: "2026-05-20", daysLeft: 124, cost: 18.00, value:  864.00, status: "OK" },
    ],
  },
  {
    sku: "SKU-4003", item: "Energy Drink 250ml", category: "Beverages",
    batches: [
      { batchNo: "BCH-238019", warehouse: "Outlet WH", qty: 80,  expiryDate: "2026-02-18", daysLeft: 33, cost: 6.00, value:  480.00, status: "Watch" },
      { batchNo: "BCH-237990", warehouse: "Main WH",   qty: 150, expiryDate: "2026-06-01", daysLeft: 136, cost: 6.00, value:  900.00, status: "OK" },
    ],
  },
  {
    sku: "SKU-1001", item: "Basmati Rice 5kg", category: "Grocery",
    batches: [
      { batchNo: "BCH-235010", warehouse: "Main WH",   qty: 30,  expiryDate: "2026-04-15", daysLeft: 89, cost: 62.50, value: 1875.00, status: "OK" },
      { batchNo: "BCH-233880", warehouse: "Main WH",   qty: 94,  expiryDate: "2026-08-20", daysLeft: 216, cost: 62.50, value: 5875.00, status: "OK" },
    ],
  },
];

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

function daysSince(value: any): number {
  const date = Date.parse(dateOnly(value));
  if (!Number.isFinite(date)) return 0;
  return Math.max(0, Math.floor((Date.now() - date) / 86400000));
}

function percentChange(oldValue: number, newValue: number): string {
  if (!oldValue) return "0.0%";
  const pct = ((newValue - oldValue) / oldValue) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function sumByKey<T extends Record<string, any>>(
  rows: T[],
  groupKey: keyof T,
  valueKeys: (keyof T)[]
) {
  const totals = new Map<string, any>();
  rows.forEach((row) => {
    const label = asText(row[groupKey], "Uncategorized");
    const existing = totals.get(label) ?? { [groupKey]: label, items: 0 };
    existing.items += 1;
    valueKeys.forEach((key) => {
      existing[key] = n(existing[key]) + n(row[key]);
    });
    totals.set(label, existing);
  });
  return Array.from(totals.values());
}

function chartRows(data: any, index = 0): any[] {
  return Array.isArray(data?.charts?.[index]?.data) ? data.charts[index].data : [];
}

function clearLiveReportData(reportId?: ReportId) {
  if (!reportId || reportId === "soh") {
    mockRowsSOH = [];
    mockSOH = [];
    mockSOHByCategory = [];
  }
  if (!reportId || reportId === "low_stock") {
    mockRowsLowStock = [];
    mockLowStock = [];
  }
  if (!reportId || reportId === "out_of_stock") mockOutOfStock = [];
  if (!reportId || reportId === "negative_stock") mockNegativeStock = [];
  if (!reportId || reportId === "valuation") {
    mockRowsValuation = [];
    mockValuationByCategory = [];
    mockValuationByWarehouse = [];
  }
  if (!reportId || reportId === "expiry") mockExpiry = [];
  if (!reportId || reportId === "movement_ledger") mockMovementLedger = [];
  if (!reportId || reportId === "transfer") mockTransfers = [];
  if (!reportId || reportId === "reconciliation") mockReconciliation = [];
  if (!reportId || reportId === "wastage") {
    mockWastage = [];
    mockWastageByCategory = [];
  }
  if (!reportId || reportId === "in_out_summary") {
    mockInflowOutflow = [];
    mockInflowOutflowByCategory = [];
  }
  if (!reportId || reportId === "price_audit") mockPriceAudit = [];
  if (!reportId || reportId === "cost_variance") mockCostVariance = [];
  if (!reportId || reportId === "margin") {
    mockItemMargin = [];
    mockItemMarginByCategory = [];
  }
  if (!reportId || reportId === "master_completeness") mockMasterCompleteness = [];
  if (!reportId || reportId === "barcode_audit") mockBarcodeAudit = [];
  if (!reportId || reportId === "scale_export") mockScaleExport = [];
  if (!reportId || reportId === "dead_stock") mockDeadStock = [];
  if (!reportId || reportId === "fast_moving") mockFastMoving = [];
  if (!reportId || reportId === "bin_stock") mockBinStock = [];
}

function applyLiveReportData(reportId: ReportId, data: any) {
  clearLiveReportData(reportId);
  if (!data) return;
  const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data.data) ? data.data : []);

  switch (reportId) {
    case "soh":
      mockSOH = rows.map(row => ({
        sku: asText(row.sku ?? row.itemCode, "N/A"),
        item: asText(row.itemName ?? row.item, "N/A"),
        category: asText(row.category, "Uncategorized"),
        warehouse: asText(row.warehouseName ?? row.warehouse, "Main WH"),
        qty: n(row.stockOnHand ?? row.onHand ?? row.qty),
        minQty: n(row.minStock ?? row.minQty),
        reorder: n(row.reorderLevel ?? row.reorder ?? row.suggestedPoQty),
        uom: asText(row.uom, "Pcs"),
        cost: n(row.avgCost ?? row.unitCost ?? row.cost),
        value: n(row.stockValue ?? row.value)
      }));
      mockRowsSOH = mockSOH.map((row) => ({
        sku: row.sku,
        item: row.item,
        warehouse: row.warehouse,
        qty: row.qty,
        uom: row.uom,
        cost: row.cost,
        value: row.value
      }));
      mockSOHByCategory = sumByKey(mockSOH, "category", ["qty", "value"]);
      break;
    case "low_stock":
      mockLowStock = rows.map(row => ({
        sku: asText(row.sku ?? row.itemCode, "N/A"),
        item: asText(row.itemName ?? row.item, "N/A"),
        category: asText(row.category, "Uncategorized"),
        warehouse: asText(row.warehouseName ?? row.warehouse, "Main WH"),
        onHand: n(row.stockOnHand ?? row.onHand),
        minQty: n(row.minStock ?? row.minQty),
        reorderQty: n(row.reorderLevel ?? row.reorderQty),
        suggested: n(row.suggestedQty ?? row.suggestedPoQty ?? row.suggested),
        vendor: asText(row.preferredVendor ?? row.defaultVendor ?? row.vendor, "N/A"),
        lastPO: dateOnly(row.lastPoDate ?? row.lastPO, "-"),
        urgency: asText(row.urgency, "High")
      }));
      mockRowsLowStock = mockLowStock.map((row) => ({
        sku: row.sku,
        item: row.item,
        warehouse: row.warehouse,
        onHand: row.onHand,
        min: row.minQty,
        suggested: row.suggested,
        vendor: row.vendor
      }));
      break;
    case "out_of_stock":
      mockOutOfStock = rows.map(row => ({
        sku: asText(row.sku ?? row.itemCode, "N/A"),
        item: asText(row.itemName ?? row.item, "N/A"),
        category: asText(row.category, "Uncategorized"),
        warehouse: asText(row.warehouseName ?? row.warehouse, "Main WH"),
        lastSold: dateOnly(row.lastSaleDate ?? row.lastSold, "-"),
        lastReceived: dateOnly(row.lastReceiptDate ?? row.lastReceived, "-"),
        avgDailySales: n(row.avgDailySales),
        daysSinceStock: n(row.daysSinceStock) || daysSince(row.lastReceiptDate ?? row.lastReceived),
        suggestedPO: n(row.suggestedPO ?? row.suggestedPoQty)
      }));
      break;
    case "negative_stock":
      mockNegativeStock = rows.map(row => ({
        sku: asText(row.sku ?? row.itemCode, "N/A"),
        item: asText(row.itemName ?? row.item, "N/A"),
        category: asText(row.category, "Uncategorized"),
        warehouse: asText(row.warehouseName ?? row.warehouse, "Main WH"),
        qty: n(row.stockOnHand ?? row.qty),
        issue: asText(row.issueReason ?? row.rootIssue ?? row.issue, "Negative balance"),
        lastTxn: dateOnly(row.lastTxnDate ?? row.lastTxn ?? row.date, "-"),
        impact: n(row.costImpact ?? row.impact),
        severity: asText(row.severity, "High")
      }));
      break;
    case "valuation":
      mockRowsValuation = rows.map(row => ({
        sku: asText(row.sku ?? row.itemCode, "N/A"),
        item: asText(row.itemName ?? row.item, "N/A"),
        category: asText(row.category, "Uncategorized"),
        department: asText(row.department, "N/A"),
        warehouse: asText(row.warehouseName ?? row.warehouse, "Main WH"),
        qty: n(row.stockOnHand ?? row.qty),
        avgCost: n(row.avgCost ?? row.unitCost),
        fifoCost: n(row.fifoCost ?? row.fifoUnitCost),
        lastCost: n(row.lastCost ?? row.lastPurchaseCost),
        avgValue: n(row.avgValue ?? row.value),
        fifoValue: n(row.fifoValue),
        lastValue: n(row.lastValue ?? row.lastPurchaseValue)
      }));
      mockValuationByCategory = sumByKey(mockRowsValuation, "category", ["qty", "avgValue", "fifoValue", "lastValue"]);
      mockValuationByWarehouse = sumByKey(mockRowsValuation, "warehouse", ["qty", "avgValue", "fifoValue", "lastValue"]);
      {
        const totalWarehouseValue = mockValuationByWarehouse.reduce((sum, row) => sum + n(row.avgValue), 0);
        mockValuationByWarehouse = mockValuationByWarehouse.map((row) => ({
          ...row,
          percentage: totalWarehouseValue ? Number(((n(row.avgValue) / totalWarehouseValue) * 100).toFixed(1)) : 0
        }));
      }
      break;
    case "expiry": {
      const grouped = new Map<string, ExpiryItem>();
      rows.forEach((row) => {
        const sku = asText(row.sku ?? row.itemCode, "N/A");
        const key = `${sku}|${asText(row.itemName ?? row.item, "N/A")}`;
        const item = grouped.get(key) ?? {
          sku,
          item: asText(row.itemName ?? row.item, "N/A"),
          category: asText(row.category, "Uncategorized"),
          batches: []
        };
        const daysLeft = n(row.daysToExpiry);
        item.batches.push({
          batchNo: asText(row.batchNumber ?? row.batchNo, "-"),
          warehouse: asText(row.warehouseName ?? row.warehouse, "Main WH"),
          qty: n(row.totalQty ?? row.qty ?? row.onHand),
          expiryDate: dateOnly(row.nearestExpiry ?? row.expiryDate, "-"),
          daysLeft,
          cost: n(row.unitCost ?? row.cost),
          value: n(row.totalValue ?? row.value),
          status: asText(row.worstStatus ?? row.status, daysLeft <= 7 ? "Critical" : daysLeft <= 14 ? "High" : daysLeft <= 30 ? "Warning" : daysLeft <= 90 ? "Watch" : "OK")
        });
        grouped.set(key, item);
      });
      mockExpiry = Array.from(grouped.values());
      break;
    }
    case "movement_ledger":
      mockMovementLedger = rows.map(row => ({
        date: dateOnly(row.date ?? row.movementDate, "-"),
        txnType: asText(row.txnType ?? row.type, "Adjustment"),
        ref: asText(row.ref ?? row.reference, "-"),
        item: asText(row.item, "N/A"),
        sku: asText(row.sku, "N/A"),
        in: n(row.in ?? row.inQty),
        out: n(row.out ?? row.outQty),
        balance: n(row.balance),
        cost: n(row.cost ?? row.unitCost),
        warehouse: asText(row.warehouse, "Warehouse")
      }));
      break;
    case "transfer":
      mockTransfers = rows.map(row => ({
        ref: asText(row.ref, "-"),
        date: dateOnly(row.date, "-"),
        from: asText(row.from ?? row.fromWarehouse, "-"),
        to: asText(row.to ?? row.toWarehouse, "-"),
        item: asText(row.item, "N/A"),
        sku: asText(row.sku, "N/A"),
        qty: n(row.qty),
        cost: n(row.cost ?? row.unitCost),
        value: n(row.value),
        status: asText(row.status, "Pending"),
        approver: asText(row.approver, "-")
      }));
      break;
    case "reconciliation":
      mockReconciliation = rows.map(row => ({
        date: dateOnly(row.date, "-"),
        ref: asText(row.ref, "-"),
        item: asText(row.item, "N/A"),
        sku: asText(row.sku, "N/A"),
        before: n(row.before ?? row.beforeQty),
        after: n(row.after ?? row.afterQty),
        diff: n(row.diff),
        reason: asText(row.reason, "Stock adjustment"),
        approver: asText(row.approver, "System"),
        costImpact: n(row.costImpact)
      }));
      break;
    case "wastage":
      mockWastage = rows.map(row => ({
        date: dateOnly(row.date, "-"),
        ref: asText(row.ref, "-"),
        item: asText(row.item, "N/A"),
        sku: asText(row.sku, "N/A"),
        qty: n(row.qty),
        reason: asText(row.reason, "Write-off"),
        cost: n(row.cost ?? row.unitCost),
        impact: n(row.impact),
        warehouse: asText(row.warehouse, "Warehouse")
      }));
      mockWastageByCategory = chartRows(data).map((row) => ({
        category: asText(row.name ?? row.category, "Uncategorized"),
        value: n(row.value),
        qty: n(row.qty)
      }));
      if (!mockWastageByCategory.length) {
        mockWastageByCategory = sumByKey(mockWastage as any, "reason", ["impact"]).map((row: any) => ({
          category: row.reason,
          value: row.impact,
          qty: 0
        }));
      }
      break;
    case "in_out_summary":
      mockInflowOutflow = rows.map(row => ({
        period: asText(row.period, "-"),
        inflow: n(row.inflow),
        outflow: n(row.outflow),
        net: n(row.net)
      }));
      mockInflowOutflowByCategory = chartRows(data, 1).map((row) => ({
        category: asText(row.name ?? row.category, "Uncategorized"),
        inflow: n(row.inflow),
        outflow: n(row.outflow)
      }));
      break;
    case "price_audit":
      mockPriceAudit = rows.map(row => {
        const oldPrice = n(row.oldPrice ?? row.retailPrice ?? row.newPrice);
        const newPrice = n(row.newPrice ?? row.retailPrice);
        return {
          date: dateOnly(row.date ?? row.updatedAt, "-"),
          item: asText(row.item, "N/A"),
          sku: asText(row.sku, "N/A"),
          priceLevel: asText(row.priceLevel, "Retail"),
          oldPrice,
          newPrice,
          pct: asText(row.pct, percentChange(oldPrice, newPrice)),
          changedBy: asText(row.changedBy ?? row.updatedBy, "System"),
          approved: asText(row.approved, "Auto")
        };
      });
      break;
    case "cost_variance":
      mockCostVariance = rows.map(row => {
        const variance = n(row.variance ?? row.varianceUnit);
        return {
          grnRef: asText(row.grnRef ?? row.grnNo, "-"),
          invRef: asText(row.invRef ?? row.invoiceNo, "-"),
          item: asText(row.item, "N/A"),
          sku: asText(row.sku, "N/A"),
          qty: n(row.qty),
          grnCost: n(row.grnCost),
          invCost: n(row.invCost ?? row.invoiceCost),
          variance,
          totalVar: n(row.totalVar ?? row.varianceTotal),
          status: variance > 0 ? "Over" : variance < 0 ? "Under" : "Match"
        };
      });
      break;
    case "margin":
      mockItemMargin = rows.map(row => ({
        item: asText(row.item, "N/A"),
        sku: asText(row.sku, "N/A"),
        category: asText(row.category, "Sales"),
        salesQty: n(row.salesQty ?? row.qtySold),
        revenue: n(row.revenue ?? row.salesValue),
        cost: n(row.cost ?? row.costValue),
        gp: n(row.gp ?? row.grossProfit),
        gpPct: n(row.gpPct ?? row.gpPercent)
      }));
      mockItemMarginByCategory = sumByKey(mockItemMargin as any, "category", ["revenue", "gp"]).map((row: any) => ({
        ...row,
        gpPct: row.revenue ? (row.gp / row.revenue) * 100 : 0
      }));
      break;
    case "master_completeness":
      mockMasterCompleteness = rows.map(row => {
        const issues = asText(row.issues).toLowerCase();
        return {
          sku: asText(row.sku, "N/A"),
          item: asText(row.item, "N/A"),
          hasBarcode: !issues.includes("barcode"),
          hasCost: !issues.includes("cost"),
          hasCategory: !issues.includes("category"),
          hasImage: true,
          hasVendor: !issues.includes("brand") && !issues.includes("vendor"),
          score: n(row.score),
          status: asText(row.status, "Review")
        };
      });
      break;
    case "barcode_audit":
      mockBarcodeAudit = rows.map(row => ({
        sku: asText(row.sku, "N/A"),
        item: asText(row.item, "N/A"),
        barcode: asText(row.barcode, "-"),
        template: asText(row.template ?? row.labelLayout, "-"),
        lastPrinted: dateOnly(row.lastPrinted ?? row.updatedAt, "Never"),
        printedBy: asText(row.printedBy, "-"),
        queueStatus: asText(row.queueStatus, "-"),
        status: asText(row.status ?? row.active, "OK")
      }));
      break;
    case "scale_export":
      mockScaleExport = rows.map(row => ({
        sku: asText(row.sku, "N/A"),
        item: asText(row.item, "N/A"),
        scale: asText(row.scale, "Scale"),
        lastSync: dateOnly(row.lastSync, "-"),
        price: n(row.price),
        status: asText(row.status, "Ready")
      }));
      break;
    case "dead_stock":
      mockDeadStock = rows.map(row => {
        const days = n(row.daysSinceSale ?? row.daysSinceSold);
        return {
          sku: asText(row.sku, "N/A"),
          item: asText(row.item, "N/A"),
          category: asText(row.category, "Uncategorized"),
          warehouse: asText(row.warehouse, "Warehouse"),
          qty: n(row.qty ?? row.onHand),
          lastSoldDate: dateOnly(row.lastSoldDate ?? row.lastSold, "-"),
          daysSinceSale: days,
          avgMonthlySales: n(row.avgMonthlySales),
          value: n(row.value),
          bucket: days >= 90 ? "90+ days" : days >= 60 ? "60-90 days" : days >= 45 ? "45-60 days" : days >= 30 ? "30-45 days" : "15-30 days"
        };
      });
      break;
    case "fast_moving":
      mockFastMoving = rows.map(row => ({
        sku: asText(row.sku, "N/A"),
        item: asText(row.item, "N/A"),
        category: asText(row.category, "Sales"),
        warehouse: asText(row.warehouse, "All"),
        qtySold: n(row.qtySold),
        revenue: n(row.revenue ?? row.salesValue),
        avgDailySales: n(row.avgDailySales ?? row.avgDailyQty),
        turnover: n(row.turnover),
        trend: asText(row.trend, "+0%")
      }));
      break;
    case "bin_stock":
      mockBinStock = rows.map(row => ({
        bin: asText(row.bin, "Unlocated"),
        zone: asText(row.zone, "Unassigned"),
        item: asText(row.item, "N/A"),
        sku: asText(row.sku, "N/A"),
        qty: n(row.qty),
        uom: asText(row.uom, "Pcs"),
        warehouse: asText(row.warehouse, "Warehouse")
      }));
      break;
  }
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function getInventoryExportRows(reportId: ReportId): any[] {
  switch (reportId) {
    case "soh": return mockSOH;
    case "low_stock": return mockLowStock;
    case "out_of_stock": return mockOutOfStock;
    case "negative_stock": return mockNegativeStock;
    case "valuation": return mockRowsValuation;
    case "expiry": return mockExpiry;
    case "movement_ledger": return mockMovementLedger;
    case "transfer": return mockTransfers;
    case "reconciliation": return mockReconciliation;
    case "wastage": return mockWastage;
    case "in_out_summary": return mockInflowOutflow;
    case "price_audit": return mockPriceAudit;
    case "cost_variance": return mockCostVariance;
    case "margin": return mockItemMargin;
    case "master_completeness": return mockMasterCompleteness;
    case "barcode_audit": return mockBarcodeAudit;
    case "scale_export": return mockScaleExport;
    case "dead_stock": return mockDeadStock;
    case "fast_moving": return mockFastMoving;
    case "bin_stock": return mockBinStock;
    default: return [];
  }
}

function toExportColumns(rows: any[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({
    header: key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^\w/, (c: string) => c.toUpperCase()).trim(),
    key,
    width: 18,
  }));
}

interface InventoryReportsProps {
  onNavigate?: (section: string) => void;
}

export default function InventoryReports({ onNavigate }: InventoryReportsProps) {
  const [activeReport, setActiveReport] = useState<ReportId>("soh");
  const [query, setQuery] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [groupOpen, setGroupOpen] = useState<Record<ReportGroupId, boolean>>({
    stock: true,
    movement: true,
    pricing: false,
    master: false,
    ops: false,
  });

  // Filters — default to current month
  const _today = new Date();
  const _firstOfMonth = new Date(_today.getFullYear(), _today.getMonth(), 1).toISOString().split("T")[0];
  const _todayStr = _today.toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(_firstOfMonth);
  const [dateTo, setDateTo] = useState(_todayStr);
  const [warehouse, setWarehouse] = useState("All");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [department, setDepartment] = useState("All");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [brand, setBrand] = useState("All");
  const [brandSearch, setBrandSearch] = useState("");
  const [brandOpen, setBrandOpen] = useState(false);
  const [stockCondition, setStockCondition] = useState("Positive only");
  const [stockConditionSearch, setStockConditionSearch] = useState("");
  const [stockConditionOpen, setStockConditionOpen] = useState(false);
  const stockConditionOptions = ["All", "Positive only", "Zero stock", "Negative"];
  const [itemSearch, setItemSearch] = useState("");
  const [onlyPositiveStock, setOnlyPositiveStock] = useState(true);
  const [, setDataRevision] = useState(0);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [departmentOptions, setDepartmentOptions] = useState<{ id: string; name: string }[]>([]);
  const [brandOptions, setBrandOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getCompanyProfile().then((res) => setCompanyProfile(res.data)).catch(() => {});
    getDepartments()
      .then((data: any[]) => setDepartmentOptions(
        (data || []).filter((d: any) => d.isActive !== false).map((d: any) => ({ id: String(d.id), name: d.name }))
      ))
      .catch(() => {});
    getBrands()
      .then((data: any[]) => setBrandOptions(
        (data || []).filter((b: any) => b.active !== false && b.isActive !== false).map((b: any) => ({ id: String(b.id), name: b.name }))
      ))
      .catch(() => {});
  }, []);

  async function loadReport(signal?: AbortSignal) {
    clearLiveReportData(activeReport);
    setDataRevision((value) => value + 1);
    try {
      const data = await getInventoryReportData(activeReport, {
        dateFrom,
        dateTo,
        warehouseId: warehouse,
        department,
        brand,
        searchQuery: itemSearch,
        stockCondition
      }, signal);
      if (!data) return;
      applyLiveReportData(activeReport, data);
      setDataRevision((value) => value + 1);
    } catch (error) {
      console.error("Unable to load inventory report data", error);
    }
  }

  React.useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal);
    return () => controller.abort();
  }, [activeReport, dateFrom, dateTo, warehouse, department, brand, itemSearch, stockCondition]);

  React.useEffect(() => {
    let cancelled = false;
    getWarehouses()
      .then((warehouses) => {
        if (cancelled || !Array.isArray(warehouses)) return;
        setWarehouseOptions(
          warehouses
            .filter((warehouse) => warehouse?.id !== undefined && warehouse?.id !== null)
            .map((warehouse) => ({
              id: String(warehouse.id),
              name: asText(warehouse.name ?? warehouse.code, `Warehouse #${warehouse.id}`),
            }))
        );
      })
      .catch((error) => {
        console.error("Unable to load warehouses for inventory reports", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeDef = useMemo(
    () => REPORTS.find((r) => r.id === activeReport)!,
    [activeReport]
  );

  const exportMeta = () => ({ dateFrom, dateTo, branch: warehouse, companyProfile });

  function handleExportPdf() {
    const rows = getInventoryExportRows(activeReport);
    const cols = toExportColumns(rows);
    exportToPDF(rows, cols, activeDef.label, activeDef.label.replace(/\s+/g, "_"), exportMeta());
  }

  function handleExportExcel() {
    const rows = getInventoryExportRows(activeReport);
    const cols = toExportColumns(rows);
    exportToExcel(rows, cols, activeDef.label.replace(/\s+/g, "_"), exportMeta());
  }

  function handlePrint() {
    const rows = getInventoryExportRows(activeReport);
    const cols = toExportColumns(rows);
    const html = generateReportPrintHtml({}, activeDef.label, cols, rows, companyProfile || {}, exportMeta());
    printHtml(html);
  }

  function handleDownloadCsv() {
    const rows = getInventoryExportRows(activeReport);
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r: any) => keys.map((k: string) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${activeDef.label.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const grouped = useMemo(() => {
    const byGroup: Record<ReportGroupId, ReportDef[]> = {
      stock: [],
      movement: [],
      pricing: [],
      master: [],
      ops: [],
    };
    for (const r of REPORTS) byGroup[r.group].push(r);
    return byGroup;
  }, []);

  const groupMeta: Record<
    ReportGroupId,
    { label: string; icon: React.ReactNode }
  > = {
    stock: { label: "Stock & Availability", icon: <Warehouse className="h-4 w-4" /> },
    movement: { label: "Movement & Control", icon: <BarChart3 className="h-4 w-4" /> },
    pricing: { label: "Pricing & Margin", icon: <Tags className="h-4 w-4" /> },
    master: { label: "Master Data & Compliance", icon: <Layers className="h-4 w-4" /> },
    ops: { label: "Operational", icon: <AlertTriangle className="h-4 w-4" /> },
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
      stock: [],
      movement: [],
      pricing: [],
      master: [],
      ops: [],
    };
    for (const r of filteredReports) byGroup[r.group].push(r);
    return byGroup;
  }, [filteredReports]);

  function renderResults() {
    switch (activeReport) {
      case "soh":           return <StockOnHandReport />;
      case "low_stock":     return <LowStockReport />;
      case "out_of_stock":  return <OutOfStockReport />;
      case "negative_stock":return <NegativeStockReport />;
      case "valuation":     return <StockValuationReport />;
      case "expiry":        return <ExpiryReport />;
      case "movement_ledger": return <MovementLedgerReport />;
      case "transfer":      return <StockTransferReport />;
      case "reconciliation":return <ReconciliationReport />;
      case "wastage":       return <WastageReport />;
      case "in_out_summary":return <InflowOutflowReport />;
      case "price_audit":   return <PriceAuditReport />;
      case "cost_variance": return <CostVarianceReport />;
      case "margin":        return <ItemMarginReport />;
      case "master_completeness": return <ItemMasterCompletenessReport />;
      case "barcode_audit": return <BarcodeAuditReport />;
      case "scale_export":  return <ScaleExportReport />;
      case "dead_stock":    return <DeadStockReport />;
      case "fast_moving":   return <FastMovingReport />;
      case "bin_stock":     return <BinStockReport />;
      default:              return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-slate-900 p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>BillBull</span>
          <ChevronRight className="h-3 w-3" />
          <span>Inventory &amp; Registries</span>
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
                Inventory Reports
              </CardTitle>
              <span className="text-[10px] text-slate-500">
                Choose a report, set filters, generate and export.
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

              {(
                Object.keys(groupMeta) as ReportGroupId[]
              ).map((gid) => (
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
                  Make <b>SOH</b>, <b>Low Stock</b>, <b>Valuation</b>, and <b>Movement Ledger</b> the default set.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <span>
                  Add <b>Negative Stock</b> + <b>Reconciliation</b> for audit & data integrity.
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
                  Applied to the selected report: <b>{activeDef.label}</b>
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
                    className="h-8 text-[11px] bg-slate-50 border-slate-200 [color-scheme:light]"
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
                    className="h-8 text-[11px] bg-slate-50 border-slate-200 [color-scheme:light]"
                  />
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Warehouse className="h-3.5 w-3.5" />
                    Warehouse
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={warehouseOpen ? warehouseSearch : (warehouse === "All" ? "" : warehouseOptions.find(o => o.id === warehouse)?.name ?? warehouse)}
                      placeholder={warehouse === "All" ? "All" : (warehouseOptions.find(o => o.id === warehouse)?.name ?? warehouse)}
                      onFocus={() => { setWarehouseOpen(true); setWarehouseSearch(""); }}
                      onChange={(e) => { setWarehouseSearch(e.target.value); setWarehouseOpen(true); }}
                      onBlur={() => setTimeout(() => setWarehouseOpen(false), 150)}
                      className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    {warehouseOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {[{ id: "All", name: "All" }, ...warehouseOptions]
                          .filter(o => !warehouseSearch || o.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
                          .map(o => (
                            <button
                              key={o.id}
                              type="button"
                              onMouseDown={() => { setWarehouse(o.id); setWarehouseOpen(false); setWarehouseSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${warehouse === o.id ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                            >
                              {o.name}
                            </button>
                          ))}
                        {warehouseOptions.filter(o => !warehouseSearch || o.name.toLowerCase().includes(warehouseSearch.toLowerCase())).length === 0 && warehouseSearch && (
                          <div className="px-3 py-2 text-[11px] text-slate-400">No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    Department
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={departmentOpen ? departmentSearch : (department === "All" ? "" : department)}
                      placeholder={department === "All" ? "All" : department}
                      onFocus={() => { setDepartmentOpen(true); setDepartmentSearch(""); }}
                      onChange={(e) => { setDepartmentSearch(e.target.value); setDepartmentOpen(true); }}
                      onBlur={() => setTimeout(() => setDepartmentOpen(false), 150)}
                      className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    {departmentOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {[{ id: "0", name: "All" }, ...departmentOptions]
                          .filter(o => !departmentSearch || o.name.toLowerCase().includes(departmentSearch.toLowerCase()))
                          .map(o => (
                            <button
                              key={o.id}
                              type="button"
                              onMouseDown={() => { setDepartment(o.name === "All" ? "All" : o.name); setDepartmentOpen(false); setDepartmentSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${department === (o.name === "All" ? "All" : o.name) ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                            >
                              {o.name}
                            </button>
                          ))}
                        {departmentOptions.filter(o => !departmentSearch || o.name.toLowerCase().includes(departmentSearch.toLowerCase())).length === 0 && departmentSearch && (
                          <div className="px-3 py-2 text-[11px] text-slate-400">No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Tags className="h-3.5 w-3.5" />
                    Brand
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={brandOpen ? brandSearch : (brand === "All" ? "" : brand)}
                      placeholder={brand === "All" ? "All" : brand}
                      onFocus={() => { setBrandOpen(true); setBrandSearch(""); }}
                      onChange={(e) => { setBrandSearch(e.target.value); setBrandOpen(true); }}
                      onBlur={() => setTimeout(() => setBrandOpen(false), 150)}
                      className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    {brandOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {[{ id: "0", name: "All" }, ...brandOptions]
                          .filter(o => !brandSearch || o.name.toLowerCase().includes(brandSearch.toLowerCase()))
                          .map(o => (
                            <button
                              key={o.id}
                              type="button"
                              onMouseDown={() => { setBrand(o.name); setBrandOpen(false); setBrandSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${brand === o.name ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                            >
                              {o.name}
                            </button>
                          ))}
                        {brandOptions.filter(o => !brandSearch || o.name.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && brandSearch && (
                          <div className="px-3 py-2 text-[11px] text-slate-400">No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <Barcode className="h-3.5 w-3.5" />
                    Item / SKU
                  </label>
                  <Input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search item name / SKU / barcode…"
                    className="h-8 text-[11px] bg-slate-50 border-slate-200"
                  />
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-[11px] text-slate-600">
                    Stock Condition
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={stockConditionOpen ? stockConditionSearch : (stockCondition === "Positive only" ? "" : stockCondition)}
                      placeholder={stockCondition}
                      onFocus={() => { setStockConditionOpen(true); setStockConditionSearch(""); }}
                      onChange={(e) => { setStockConditionSearch(e.target.value); setStockConditionOpen(true); }}
                      onBlur={() => setTimeout(() => setStockConditionOpen(false), 150)}
                      className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-2 pr-6"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    {stockConditionOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg overflow-y-auto">
                        {stockConditionOptions
                          .filter(o => !stockConditionSearch || o.toLowerCase().includes(stockConditionSearch.toLowerCase()))
                          .map(o => (
                            <button
                              key={o}
                              type="button"
                              onMouseDown={() => { setStockCondition(o); setOnlyPositiveStock(o === "Positive only"); setStockConditionOpen(false); setStockConditionSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#FFF6D8] ${stockCondition === o ? "bg-[#FFF6D8] font-semibold text-slate-900" : "text-slate-700"}`}
                            >
                              {o}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => loadReport()}
                    className="flex-1 h-8 min-w-[132px] rounded-md !bg-[#F5C742] !text-slate-900 shadow-sm hover:!bg-[#e4b82e] focus-visible:ring-2 focus-visible:ring-[#F5C742]/40 text-[11px] font-semibold"
                  >
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

          {/* Results */}
          {renderResults()}
        </motion.div>
      </div>
    </div>
  );
}

function ResultsTable({
  title,
  columns,
  rows,
  note,
}: {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  note?: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3 flex flex-row items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-xs font-semibold text-slate-800">
            {title}
          </CardTitle>
          {note ? (
            <span className="text-[10px] text-slate-500">{note}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] border-[#F5C742] bg-[#FFF6D8] text-slate-800"
          >
            BillBull Report
          </Badge>
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
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  {r.map((cell, i) => (
                    <td key={i} className="px-3 py-2 align-top text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Total rows: {rows.length}</span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Ready for API wiring
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StockValuationReport() {
  const [costingMethod, setCostingMethod] = useState<'avg' | 'fifo' | 'last'>('avg');
  
  const COLORS = ['#F5C742', '#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'];
  
  const totalAvgValue = mockRowsValuation.reduce((sum, r) => sum + r.avgValue, 0);
  const totalFifoValue = mockRowsValuation.reduce((sum, r) => sum + r.fifoValue, 0);
  const totalLastValue = mockRowsValuation.reduce((sum, r) => sum + r.lastValue, 0);
  const totalValuationQty = mockRowsValuation.reduce((sum, r) => sum + r.qty, 0);
  const totalValuationItems = new Set(mockRowsValuation.map((row) => row.sku)).size;
  
  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={`border-2 cursor-pointer transition-all ${costingMethod === 'avg' ? 'border-[#F5C742] bg-[#FFF6D8]' : 'border-slate-200 bg-white'}`} onClick={() => setCostingMethod('avg')}>
          <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">Average Cost Method</span>
              <DollarSign className="h-4 w-4 text-[#F5C742]" />
            </div>
            <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">AED {totalAvgValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div className="text-[9px] text-slate-500 mt-1">{totalValuationItems} items / {totalValuationQty.toLocaleString()} units</div>
          </CardContent>
        </Card>
        
        <Card className={`border-2 cursor-pointer transition-all ${costingMethod === 'fifo' ? 'border-[#F5C742] bg-[#FFF6D8]' : 'border-slate-200 bg-white'}`} onClick={() => setCostingMethod('fifo')}>
          <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">FIFO Cost Method</span>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">AED {totalFifoValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div className="text-[9px] text-slate-500 mt-1">First-in, First-out basis</div>
          </CardContent>
        </Card>
        
        <Card className={`border-2 cursor-pointer transition-all ${costingMethod === 'last' ? 'border-[#F5C742] bg-[#FFF6D8]' : 'border-slate-200 bg-white'}`} onClick={() => setCostingMethod('last')}>
          <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-slate-600">Last Purchase Cost</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">AED {totalLastValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div className="text-[9px] text-slate-500 mt-1">Latest purchase price</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Valuation by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockValuationByCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ fontSize: '11px' }}
                  formatter={(value: number) => `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                />
                <Bar dataKey={costingMethod === 'avg' ? 'avgValue' : costingMethod === 'fifo' ? 'fifoValue' : 'lastValue'} fill="#F5C742" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">
              Warehouse Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={mockValuationByWarehouse}
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey={costingMethod === 'avg' ? 'avgValue' : costingMethod === 'fifo' ? 'fifoValue' : 'lastValue'}
                  label={({ warehouse, percentage }) => `${warehouse} (${percentage}%)`}
                  labelStyle={{ fontSize: '9px' }}
                >
                  {mockValuationByWarehouse.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ fontSize: '11px' }}
                  formatter={(value: number) => `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* Data Table */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <CardTitle className="text-xs font-semibold text-slate-800">
                Stock Valuation Detail
              </CardTitle>
              <span className="text-[10px] text-slate-500">
                Showing {costingMethod === 'avg' ? 'Average' : costingMethod === 'fifo' ? 'FIFO' : 'Last'} cost method
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[10px] border-[#F5C742] bg-[#FFF6D8] text-slate-800"
              >
                BillBull Report
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1">
                <Download className="h-3 w-3" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {mockRowsValuation.map((r, idx) => {
                  const cost = costingMethod === 'avg' ? r.avgCost : costingMethod === 'fifo' ? r.fifoCost : r.lastCost;
                  const value = costingMethod === 'avg' ? r.avgValue : costingMethod === 'fifo' ? r.fifoValue : r.lastValue;
                  
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 align-top text-slate-700 font-mono">{r.sku}</td>
                      <td className="px-3 py-2 align-top text-slate-700">{r.item}</td>
                      <td className="px-3 py-2 align-top text-slate-700">{r.category}</td>
                      <td className="px-3 py-2 align-top text-slate-700">{r.warehouse}</td>
                      <td className="px-3 py-2 align-top text-right text-slate-700">{r.qty}</td>
                      <td className="px-3 py-2 align-top text-right text-slate-700">AED {cost.toFixed(2)}</td>
                      <td className="px-3 py-2 align-top text-right font-semibold text-[#F5C742]">AED {value.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 p-3 bg-gradient-to-r from-[#F5C742] to-[#f4d673] rounded-lg flex items-center justify-between text-white">
            <div>
              <div className="text-[10px] opacity-90">Total Stock Valuation</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal">
                AED {(costingMethod === 'avg' ? totalAvgValue : costingMethod === 'fifo' ? totalFifoValue : totalLastValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] opacity-90">Method</div>
              <div className="text-lg font-semibold">{costingMethod === 'avg' ? 'Average' : costingMethod === 'fifo' ? 'FIFO' : 'Last Cost'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// ── Additional mock data ─────────────────────────────────────────────────────

let mockMovementLedger = [
  { date: "2026-01-16", txnType: "GRN",      ref: "GRN-10245", item: "Basmati Rice 5kg",     sku: "SKU-1001", in: 50,  out: 0,  balance: 124, cost: 62.50, warehouse: "Main WH" },
  { date: "2026-01-16", txnType: "Sale",     ref: "INV-88321", item: "Basmati Rice 5kg",     sku: "SKU-1001", in: 0,   out: 8,  balance: 116, cost: 62.50, warehouse: "Main WH" },
  { date: "2026-01-15", txnType: "Sale",     ref: "INV-88290", item: "Olive Oil 1L",         sku: "SKU-2033", in: 0,   out: 5,  balance: 48,  cost: 18.00, warehouse: "Main WH" },
  { date: "2026-01-15", txnType: "GRN",      ref: "GRN-10241", item: "Fresh Milk 1L",        sku: "SKU-3001", in: 100, out: 0,  balance: 245, cost: 8.50,  warehouse: "Main WH" },
  { date: "2026-01-14", txnType: "Transfer", ref: "TRF-5502",  item: "Energy Drink 250ml",   sku: "SKU-4003", in: 0,   out: 30, balance: 234, cost: 6.00,  warehouse: "Outlet WH" },
  { date: "2026-01-14", txnType: "Sale",     ref: "INV-88201", item: "Sparkling Water 500ml", sku: "SKU-4002", in: 0,   out: 24, balance: 567, cost: 2.50,  warehouse: "Main WH" },
  { date: "2026-01-13", txnType: "Return",   ref: "RET-1102",  item: "Greek Yogurt 500g",    sku: "SKU-3003", in: 6,   out: 0,  balance: 98,  cost: 12.00, warehouse: "Outlet WH" },
  { date: "2026-01-13", txnType: "Wastage",  ref: "WST-0301",  item: "Fresh Milk 1L",        sku: "SKU-3001", in: 0,   out: 12, balance: 233, cost: 8.50,  warehouse: "Main WH" },
  { date: "2026-01-12", txnType: "GRN",      ref: "GRN-10235", item: "Sunflower Oil 5L",     sku: "SKU-2034", in: 60,  out: 0,  balance: 156, cost: 42.00, warehouse: "Main WH" },
  { date: "2026-01-12", txnType: "Sale",     ref: "INV-88155", item: "Pasta Penne 500g",     sku: "SKU-5001", in: 0,   out: 18, balance: 178, cost: 7.50,  warehouse: "Main WH" },
  { date: "2026-01-11", txnType: "Adj+",     ref: "ADJ-0088",  item: "Tomato Sauce 400g",    sku: "SKU-5002", in: 20,  out: 0,  balance: 298, cost: 5.50,  warehouse: "Main WH" },
  { date: "2026-01-11", txnType: "Sale",     ref: "INV-88112", item: "Orange Juice 1L",      sku: "SKU-4001", in: 0,   out: 15, balance: 189, cost: 9.50,  warehouse: "Main WH" },
];

let mockTransfers = [
  { ref: "TRF-5510", date: "2026-01-16", from: "Main WH",   to: "Outlet WH", item: "Cheddar Cheese 200g", sku: "SKU-3002", qty: 24, cost: 15.50, value: 372.00,  status: "Completed", approver: "Ahmed K." },
  { ref: "TRF-5508", date: "2026-01-15", from: "Main WH",   to: "Outlet WH", item: "Olive Oil 1L",        sku: "SKU-2033", qty: 12, cost: 18.00, value: 216.00,  status: "Completed", approver: "Sara M." },
  { ref: "TRF-5505", date: "2026-01-14", from: "Outlet WH", to: "Main WH",   item: "Instant Noodles",     sku: "SKU-5003", qty: 50, cost: 3.20,  value: 160.00,  status: "In-Transit", approver: "Ahmed K." },
  { ref: "TRF-5503", date: "2026-01-13", from: "Main WH",   to: "Outlet WH", item: "Sparkling Water 500ml",sku: "SKU-4002",qty: 100, cost: 2.50,  value: 250.00,  status: "Completed", approver: "Fatima J." },
  { ref: "TRF-5501", date: "2026-01-12", from: "Main WH",   to: "Outlet WH", item: "Paper Cup 8oz",       sku: "SKU-3102", qty: 200, cost: 0.22,  value:  44.00,  status: "Pending",   approver: "—" },
  { ref: "TRF-5498", date: "2026-01-11", from: "Outlet WH", to: "Main WH",   item: "Energy Drink 250ml",  sku: "SKU-4003", qty: 30, cost: 6.00,  value: 180.00,  status: "Completed", approver: "Sara M." },
  { ref: "TRF-5494", date: "2026-01-10", from: "Main WH",   to: "Outlet WH", item: "Greek Yogurt 500g",   sku: "SKU-3003", qty: 40, cost: 12.00, value: 480.00,  status: "Variance",  approver: "Ahmed K." },
];

let mockReconciliation = [
  { date: "2026-01-15", ref: "ADJ-0095", item: "Fresh Milk 1L",       sku: "SKU-3001", before: 257, after: 245, diff: -12, reason: "Expiry write-off",       approver: "Mgr. Ali",   costImpact: -102.00 },
  { date: "2026-01-14", ref: "ADJ-0094", item: "Tomato Sauce 400g",   sku: "SKU-5002", before: 278, after: 298, diff: +20, reason: "Recount — bin error",    approver: "Mgr. Sara",  costImpact:  +110.00 },
  { date: "2026-01-13", ref: "ADJ-0092", item: "Sunflower Oil 5L",    sku: "SKU-2034", before: 160, after: 156, diff:  -4, reason: "Damaged stock write-off", approver: "Mgr. Ali",   costImpact:  -168.00 },
  { date: "2026-01-12", ref: "ADJ-0090", item: "Paper Cup 8oz",       sku: "SKU-3102", before: 965, after: 980, diff: +15, reason: "Opening balance fix",    approver: "Mgr. Fatima",costImpact:    +3.30 },
  { date: "2026-01-11", ref: "ADJ-0088", item: "Orange Juice 1L",     sku: "SKU-4001", before: 192, after: 189, diff:  -3, reason: "QC rejection",           approver: "Mgr. Sara",  costImpact:   -28.50 },
  { date: "2026-01-10", ref: "ADJ-0086", item: "Greek Yogurt 500g",   sku: "SKU-3003", before:  90, after:  98, diff:  +8, reason: "GRN backdate correction", approver: "Mgr. Ali",   costImpact:   +96.00 },
];

let mockWastage = [
  { date: "2026-01-16", ref: "WST-0310", item: "Fresh Milk 1L",      sku: "SKU-3001", qty: 18, reason: "Expired",         cost: 8.50,  impact: 153.00, warehouse: "Main WH" },
  { date: "2026-01-15", ref: "WST-0308", item: "Greek Yogurt 500g",  sku: "SKU-3003", qty: 12, reason: "Damaged package",  cost: 12.00, impact: 144.00, warehouse: "Outlet WH" },
  { date: "2026-01-14", ref: "WST-0306", item: "Orange Juice 1L",    sku: "SKU-4001", qty:  8, reason: "Expired",         cost: 9.50,  impact:  76.00, warehouse: "Outlet WH" },
  { date: "2026-01-13", ref: "WST-0304", item: "Cheddar Cheese 200g",sku: "SKU-3002", qty:  5, reason: "Mould — rejected", cost: 15.50, impact:  77.50, warehouse: "Main WH" },
  { date: "2026-01-13", ref: "IC-0041",  item: "Olive Oil 1L",       sku: "SKU-2033", qty:  4, reason: "Internal use",    cost: 18.00, impact:  72.00, warehouse: "Main WH" },
  { date: "2026-01-12", ref: "WST-0301", item: "Basmati Rice 5kg",   sku: "SKU-1001", qty:  2, reason: "Pest damage",     cost: 62.50, impact: 125.00, warehouse: "Main WH" },
  { date: "2026-01-11", ref: "IC-0039",  item: "Sunflower Oil 5L",   sku: "SKU-2034", qty:  3, reason: "Internal use",    cost: 42.00, impact: 126.00, warehouse: "Main WH" },
];

let mockWastageByCategory = [
  { category: "Dairy",          value: 450.50, qty: 35 },
  { category: "Beverages",      value: 76.00,  qty: 8 },
  { category: "FMCG",           value: 198.00, qty: 7 },
  { category: "Grocery",        value: 125.00, qty: 2 },
  { category: "Packaged Foods", value: 44.00,  qty: 8 },
];

let mockInflowOutflow = [
  { period: "Jan W1", inflow: 42500, outflow: 38200, net: 4300 },
  { period: "Jan W2", inflow: 38900, outflow: 41100, net: -2200 },
  { period: "Jan W3", inflow: 51200, outflow: 44800, net: 6400 },
  { period: "Jan W4", inflow: 47800, outflow: 49200, net: -1400 },
  { period: "Dec W4", inflow: 63400, outflow: 58900, net: 4500 },
  { period: "Dec W3", inflow: 55200, outflow: 52100, net: 3100 },
];

let mockInflowOutflowByCategory = [
  { category: "Grocery",        inflow: 22400, outflow: 19800 },
  { category: "FMCG",           inflow: 18600, outflow: 16200 },
  { category: "Dairy",          inflow: 14200, outflow: 15800 },
  { category: "Beverages",      inflow: 9800,  outflow: 10400 },
  { category: "Packaged Foods", inflow: 12100, outflow: 11600 },
  { category: "Disposables",    inflow: 3200,  outflow: 2900 },
];

let mockPriceAudit = [
  { date: "2026-01-15", item: "Basmati Rice 5kg",    sku: "SKU-1001", priceLevel: "Retail",    oldPrice: 95.00,  newPrice: 99.00,  pct: "+4.2%",  changedBy: "Ahmed K.",  approved: "Mgr. Ali" },
  { date: "2026-01-14", item: "Olive Oil 1L",        sku: "SKU-2033", priceLevel: "Wholesale", oldPrice: 22.50,  newPrice: 24.00,  pct: "+6.7%",  changedBy: "Sara M.",   approved: "Mgr. Ali" },
  { date: "2026-01-14", item: "Energy Drink 250ml",  sku: "SKU-4003", priceLevel: "Retail",    oldPrice: 10.50,  newPrice: 9.75,   pct: "-7.1%",  changedBy: "Ahmed K.",  approved: "Mgr. Fatima" },
  { date: "2026-01-13", item: "Cheddar Cheese 200g", sku: "SKU-3002", priceLevel: "Retail",    oldPrice: 26.00,  newPrice: 28.00,  pct: "+7.7%",  changedBy: "Fatima J.", approved: "Mgr. Ali" },
  { date: "2026-01-12", item: "Sparkling Water 500ml",sku: "SKU-4002",priceLevel: "Retail",    oldPrice: 4.50,   newPrice: 4.75,   pct: "+5.6%",  changedBy: "Sara M.",   approved: "Mgr. Sara" },
  { date: "2026-01-11", item: "Greek Yogurt 500g",   sku: "SKU-3003", priceLevel: "Wholesale", oldPrice: 17.00,  newPrice: 18.50,  pct: "+8.8%",  changedBy: "Ahmed K.",  approved: "Mgr. Ali" },
  { date: "2026-01-10", item: "Pasta Penne 500g",    sku: "SKU-5001", priceLevel: "Retail",    oldPrice: 12.50,  newPrice: 12.50,  pct: "0.0%",   changedBy: "Fatima J.", approved: "Auto" },
];

let mockCostVariance = [
  { grnRef: "GRN-10245", invRef: "INV-SUP-8812", item: "Basmati Rice 5kg",   sku: "SKU-1001", qty: 50,  grnCost: 62.50, invCost: 63.80, variance: 1.30, totalVar: 65.00,  status: "Over" },
  { grnRef: "GRN-10241", invRef: "INV-SUP-8805", item: "Fresh Milk 1L",      sku: "SKU-3001", qty: 100, grnCost: 8.50,  invCost: 8.50,  variance: 0.00, totalVar:  0.00,  status: "Match" },
  { grnRef: "GRN-10235", invRef: "INV-SUP-8798", item: "Sunflower Oil 5L",   sku: "SKU-2034", qty: 60,  grnCost: 42.00, invCost: 41.20, variance:-0.80, totalVar:-48.00,  status: "Under" },
  { grnRef: "GRN-10228", invRef: "INV-SUP-8790", item: "Orange Juice 1L",    sku: "SKU-4001", qty: 80,  grnCost: 9.50,  invCost: 9.75,  variance: 0.25, totalVar: 20.00,  status: "Over" },
  { grnRef: "GRN-10221", invRef: "INV-SUP-8783", item: "Greek Yogurt 500g",  sku: "SKU-3003", qty: 60,  grnCost: 12.00, invCost: 12.00, variance: 0.00, totalVar:  0.00,  status: "Match" },
  { grnRef: "GRN-10214", invRef: "INV-SUP-8775", item: "Pasta Penne 500g",   sku: "SKU-5001", qty: 100, grnCost: 7.50,  invCost: 7.80,  variance: 0.30, totalVar: 30.00,  status: "Over" },
  { grnRef: "GRN-10208", invRef: "INV-SUP-8769", item: "Coconut Oil 500ml",  sku: "SKU-2035", qty: 40,  grnCost: 22.50, invCost: 22.10, variance:-0.40, totalVar:-16.00,  status: "Under" },
];

let mockItemMargin = [
  { item: "Basmati Rice 5kg",   sku: "SKU-1001", category: "Grocery",       salesQty: 480, revenue: 47520, cost: 30000, gp: 17520, gpPct: 36.9 },
  { item: "Olive Oil 1L",       sku: "SKU-2033", category: "FMCG",          salesQty: 210, revenue: 18900, cost: 10500, gp:  8400, gpPct: 44.4 },
  { item: "Fresh Milk 1L",      sku: "SKU-3001", category: "Dairy",         salesQty: 900, revenue: 13500, cost:  7650, gp:  5850, gpPct: 43.3 },
  { item: "Cheddar Cheese 200g",sku: "SKU-3002", category: "Dairy",         salesQty: 350, revenue: 12250, cost:  6825, gp:  5425, gpPct: 44.3 },
  { item: "Energy Drink 250ml", sku: "SKU-4003", category: "Beverages",     salesQty: 620, revenue: 12090, cost:  8680, gp:  3410, gpPct: 28.2 },
  { item: "Sparkling Water 500ml",sku:"SKU-4002", category: "Beverages",    salesQty:1100, revenue: 10450, cost:  6600, gp:  3850, gpPct: 36.8 },
  { item: "Sunflower Oil 5L",   sku: "SKU-2034", category: "FMCG",          salesQty: 180, revenue:  9720, cost:  7560, gp:  2160, gpPct: 22.2 },
  { item: "Greek Yogurt 500g",  sku: "SKU-3003", category: "Dairy",         salesQty: 280, revenue:  9800, cost:  5600, gp:  4200, gpPct: 42.9 },
  { item: "Orange Juice 1L",    sku: "SKU-4001", category: "Beverages",     salesQty: 420, revenue:  9660, cost:  6930, gp:  2730, gpPct: 28.3 },
  { item: "Pasta Penne 500g",   sku: "SKU-5001", category: "Packaged Foods",salesQty: 600, revenue:  9000, cost:  5700, gp:  3300, gpPct: 36.7 },
];

let mockItemMarginByCategory = [
  { category: "Grocery",        revenue: 47520, gp: 17520, gpPct: 36.9 },
  { category: "FMCG",           revenue: 28620, gp: 10560, gpPct: 36.9 },
  { category: "Dairy",          revenue: 35550, gp: 15475, gpPct: 43.5 },
  { category: "Beverages",      revenue: 32200, gp:  9990, gpPct: 31.0 },
  { category: "Packaged Foods", revenue:  9000, gp:  3300, gpPct: 36.7 },
];

let mockMasterCompleteness = [
  { sku: "SKU-1001", item: "Basmati Rice 5kg",   hasBarcode: true,  hasCost: true,  hasCategory: true,  hasImage: true,  hasVendor: true,  score: 100, status: "Complete" },
  { sku: "SKU-2033", item: "Olive Oil 1L",        hasBarcode: true,  hasCost: true,  hasCategory: true,  hasImage: false, hasVendor: true,  score:  80, status: "Missing Image" },
  { sku: "SKU-3001", item: "Fresh Milk 1L",       hasBarcode: true,  hasCost: true,  hasCategory: true,  hasImage: true,  hasVendor: true,  score: 100, status: "Complete" },
  { sku: "SKU-3002", item: "Cheddar Cheese 200g", hasBarcode: false, hasCost: true,  hasCategory: true,  hasImage: false, hasVendor: true,  score:  60, status: "Missing Barcode" },
  { sku: "SKU-4001", item: "Orange Juice 1L",     hasBarcode: true,  hasCost: false, hasCategory: true,  hasImage: true,  hasVendor: false, score:  60, status: "Missing Cost" },
  { sku: "SKU-4002", item: "Sparkling Water 500ml",hasBarcode:true,  hasCost: true,  hasCategory: true,  hasImage: true,  hasVendor: true,  score: 100, status: "Complete" },
  { sku: "SKU-5001", item: "Pasta Penne 500g",    hasBarcode: true,  hasCost: true,  hasCategory: false, hasImage: false, hasVendor: true,  score:  60, status: "Missing Category" },
  { sku: "SKU-5003", item: "Instant Noodles Pack",hasBarcode: true,  hasCost: true,  hasCategory: true,  hasImage: false, hasVendor: false, score:  60, status: "Missing Vendor" },
  { sku: "SKU-6001", item: "Plastic Fork Box",    hasBarcode: false, hasCost: false, hasCategory: true,  hasImage: false, hasVendor: false, score:  20, status: "Incomplete" },
  { sku: "SKU-6002", item: "Food Container 500ml",hasBarcode: true,  hasCost: true,  hasCategory: true,  hasImage: true,  hasVendor: true,  score: 100, status: "Complete" },
];

let mockBarcodeAudit = [
  { sku: "SKU-1001", item: "Basmati Rice 5kg",   barcode: "6281006123456", template: "Standard A4", lastPrinted: "2026-01-10", printedBy: "Ahmed K.", queueStatus: "—",      status: "OK" },
  { sku: "SKU-2033", item: "Olive Oil 1L",        barcode: "6281008234567", template: "Standard A4", lastPrinted: "2026-01-08", printedBy: "Sara M.",  queueStatus: "—",      status: "OK" },
  { sku: "SKU-3001", item: "Fresh Milk 1L",       barcode: "6281003345678", template: "Shelf Label", lastPrinted: "2026-01-12", printedBy: "Ahmed K.", queueStatus: "—",      status: "OK" },
  { sku: "SKU-3002", item: "Cheddar Cheese 200g", barcode: "—",             template: "—",           lastPrinted: "Never",      printedBy: "—",        queueStatus: "Pending",status: "No Barcode" },
  { sku: "SKU-4001", item: "Orange Juice 1L",     barcode: "6281007456789", template: "Standard A4", lastPrinted: "2025-12-20", printedBy: "Fatima J.",queueStatus: "—",      status: "Outdated" },
  { sku: "SKU-5001", item: "Pasta Penne 500g",    barcode: "6281009567890", template: "Standard A4", lastPrinted: "2026-01-05", printedBy: "Sara M.",  queueStatus: "—",      status: "OK" },
  { sku: "SKU-6001", item: "Plastic Fork Box",    barcode: "—",             template: "—",           lastPrinted: "Never",      printedBy: "—",        queueStatus: "Failed", status: "No Barcode" },
];

let mockScaleExport = [
  { sku: "SKU-1001", item: "Basmati Rice 5kg",   scale: "Scale-01", lastSync: "2026-01-16 08:00", price: 99.00, status: "Synced" },
  { sku: "SKU-3001", item: "Fresh Milk 1L",       scale: "Scale-01", lastSync: "2026-01-16 08:00", price: 15.00, status: "Synced" },
  { sku: "SKU-3002", item: "Cheddar Cheese 200g", scale: "Scale-02", lastSync: "2026-01-15 08:00", price: 28.00, status: "Pending" },
  { sku: "SKU-2033", item: "Olive Oil 1L",        scale: "Scale-01", lastSync: "2026-01-14 08:00", price: 24.00, status: "Synced" },
  { sku: "SKU-4001", item: "Orange Juice 1L",     scale: "Scale-02", lastSync: "—",                price: 21.00, status: "Failed" },
  { sku: "SKU-5001", item: "Pasta Penne 500g",    scale: "Scale-01", lastSync: "2026-01-13 08:00", price: 12.50, status: "Synced" },
  { sku: "SKU-3003", item: "Greek Yogurt 500g",   scale: "Scale-02", lastSync: "2026-01-12 08:00", price: 18.50, status: "Pending" },
];

let mockDeadStock = [
  { sku: "SKU-6001", item: "Plastic Fork Box",   category: "Disposables",    warehouse: "Main WH",   qty:1245, lastSoldDate: "2025-11-08", daysSinceSale: 69, avgMonthlySales: 80,  value: 186.75, bucket: "60-90 days" },
  { sku: "SKU-1003", item: "Quinoa 1kg",         category: "Grocery",        warehouse: "Outlet WH", qty: 42,  lastSoldDate: "2025-11-22", daysSinceSale: 55, avgMonthlySales: 15,  value: 3570.00, bucket: "45-60 days" },
  { sku: "SKU-2035", item: "Coconut Oil 500ml",  category: "FMCG",           warehouse: "Outlet WH", qty: 78,  lastSoldDate: "2025-12-01", daysSinceSale: 46, avgMonthlySales: 22,  value: 1755.00, bucket: "45-60 days" },
  { sku: "SKU-5002", item: "Tomato Sauce 400g",  category: "Packaged Foods", warehouse: "Main WH",   qty: 298, lastSoldDate: "2025-12-10", daysSinceSale: 37, avgMonthlySales: 55,  value: 1639.00, bucket: "30-45 days" },
  { sku: "SKU-6002", item: "Food Container 500ml",category:"Disposables",    warehouse: "Outlet WH", qty: 567, lastSoldDate: "2025-12-18", daysSinceSale: 29, avgMonthlySales: 120, value:  255.15, bucket: "30-45 days" },
  { sku: "SKU-4002", item: "Sparkling Water 500ml",category:"Beverages",     warehouse: "Main WH",   qty: 567, lastSoldDate: "2026-01-01", daysSinceSale: 15, avgMonthlySales: 600, value: 1417.50, bucket: "15-30 days" },
];

let mockFastMoving = [
  { sku: "SKU-3001", item: "Fresh Milk 1L",       category: "Dairy",      warehouse: "Main WH",   qtySold: 900, revenue: 13500, avgDailySales: 30.0, turnover: 12.2, trend: "+8%" },
  { sku: "SKU-4002", item: "Sparkling Water 500ml",category:"Beverages",   warehouse: "Main WH",   qtySold: 1100,revenue: 10450, avgDailySales: 36.7, turnover: 23.2, trend: "+12%" },
  { sku: "SKU-5003", item: "Instant Noodles Pack", category:"Packaged Foods",warehouse:"Outlet WH", qtySold: 680, revenue:  5440, avgDailySales: 22.7, turnover:  4.5, trend: "+3%" },
  { sku: "SKU-1001", item: "Basmati Rice 5kg",    category: "Grocery",    warehouse: "Main WH",   qtySold: 480, revenue: 47520, avgDailySales: 16.0, turnover: 11.6, trend: "+5%" },
  { sku: "SKU-3002", item: "Cheddar Cheese 200g", category: "Dairy",      warehouse: "Main WH",   qtySold: 350, revenue: 12250, avgDailySales: 11.7, turnover: 7.8,  trend: "+15%" },
  { sku: "SKU-4003", item: "Energy Drink 250ml",  category: "Beverages",  warehouse: "Outlet WH", qtySold: 620, revenue: 12090, avgDailySales: 20.7, turnover: 7.9,  trend: "-2%" },
  { sku: "SKU-4001", item: "Orange Juice 1L",     category: "Beverages",  warehouse: "Main WH",   qtySold: 420, revenue:  9660, avgDailySales: 14.0, turnover: 6.7,  trend: "+9%" },
];

let mockBinStock = [
  { bin: "A1-01", zone: "Dry Goods",  item: "Basmati Rice 5kg",    sku: "SKU-1001", qty: 60,  uom: "Bag",    warehouse: "Main WH" },
  { bin: "A1-02", zone: "Dry Goods",  item: "Brown Rice 2kg",      sku: "SKU-1002", qty: 40,  uom: "Bag",    warehouse: "Main WH" },
  { bin: "A2-01", zone: "Oils",       item: "Olive Oil 1L",        sku: "SKU-2033", qty: 48,  uom: "Bottle", warehouse: "Main WH" },
  { bin: "A2-02", zone: "Oils",       item: "Sunflower Oil 5L",    sku: "SKU-2034", qty: 80,  uom: "Can",    warehouse: "Main WH" },
  { bin: "B1-01", zone: "Dairy Cold", item: "Fresh Milk 1L",       sku: "SKU-3001", qty: 120, uom: "Carton", warehouse: "Main WH" },
  { bin: "B1-02", zone: "Dairy Cold", item: "Cheddar Cheese 200g", sku: "SKU-3002", qty: 80,  uom: "Pcs",    warehouse: "Main WH" },
  { bin: "B2-01", zone: "Dairy Cold", item: "Greek Yogurt 500g",   sku: "SKU-3003", qty: 55,  uom: "Cup",    warehouse: "Outlet WH" },
  { bin: "C1-01", zone: "Beverages",  item: "Orange Juice 1L",     sku: "SKU-4001", qty: 100, uom: "Bottle", warehouse: "Main WH" },
  { bin: "C1-02", zone: "Beverages",  item: "Sparkling Water 500ml",sku:"SKU-4002", qty: 300, uom: "Bottle", warehouse: "Main WH" },
  { bin: "D1-01", zone: "Dry Goods",  item: "Pasta Penne 500g",    sku: "SKU-5001", qty: 100, uom: "Pack",   warehouse: "Main WH" },
  { bin: "D1-02", zone: "Dry Goods",  item: "Tomato Sauce 400g",   sku: "SKU-5002", qty: 150, uom: "Can",    warehouse: "Main WH" },
  { bin: "E1-01", zone: "Disposables",item: "Paper Cup 8oz",       sku: "SKU-3102", qty: 500, uom: "Pcs",    warehouse: "Outlet WH" },
];

// ── Shared helpers ───────────────────────────────────────────────────────────

clearLiveReportData();

const INV_COLORS = ["#F5C742", "#3b82f6", "#8b5cf6", "#10b981", "#f97316", "#ef4444", "#06b6d4"];

function urgencyBadge(urgency: string) {
  const map: Record<string, string> = {
    Critical: "bg-red-100 text-red-700 border-red-200",
    High:     "bg-orange-100 text-orange-700 border-orange-200",
    Medium:   "bg-amber-100 text-amber-700 border-amber-200",
    Low:      "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${map[urgency] ?? map.Low}`}>
      {urgency}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Critical:     "bg-red-100 text-red-700 border-red-200",
    High:         "bg-orange-100 text-orange-700 border-orange-200",
    Warning:      "bg-amber-100 text-amber-700 border-amber-200",
    Watch:        "bg-yellow-100 text-yellow-700 border-yellow-200",
    OK:           "bg-emerald-100 text-emerald-700 border-emerald-200",
    Completed:    "bg-emerald-100 text-emerald-700 border-emerald-200",
    "In-Transit": "bg-blue-100 text-blue-700 border-blue-200",
    Pending:      "bg-amber-100 text-amber-700 border-amber-200",
    Variance:     "bg-red-100 text-red-700 border-red-200",
    Synced:       "bg-emerald-100 text-emerald-700 border-emerald-200",
    Failed:       "bg-red-100 text-red-700 border-red-200",
    Over:         "bg-red-100 text-red-700 border-red-200",
    Under:        "bg-blue-100 text-blue-700 border-blue-200",
    Match:        "bg-emerald-100 text-emerald-700 border-emerald-200",
    Outdated:     "bg-amber-100 text-amber-700 border-amber-200",
    "No Barcode": "bg-red-100 text-red-700 border-red-200",
    Complete:     "bg-emerald-100 text-emerald-700 border-emerald-200",
    Incomplete:   "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${map[status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {status}
    </span>
  );
}

function gpBadge(gpPct: number) {
  const cls = gpPct >= 32 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : gpPct >= 25 ? "bg-amber-100 text-amber-700 border-amber-200"
            :               "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {gpPct.toFixed(1)}%
    </span>
  );
}

function ReportHeader({ title, subtitle, rows }: { title: string; subtitle?: string; rows: number }) {
  return (
    <div className="flex items-start justify-between gap-3 pb-1">
      <div className="flex flex-col gap-0.5">
        <CardTitle className="text-xs font-semibold text-slate-800">{title}</CardTitle>
        {subtitle && <span className="text-[10px] text-slate-500">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] border-[#F5C742] bg-[#FFF6D8] text-slate-800">
          {rows} rows
        </Badge>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1">
          <Download className="h-3 w-3" /> Export
        </Button>
      </div>
    </div>
  );
}

function Tbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <table className="bb-nowrap-table w-full text-[11px]">{children}</table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium text-slate-500 bg-slate-50 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return <td className={`px-3 py-2 align-top text-slate-700 ${right ? "text-right" : ""} ${mono ? "font-mono" : ""}`}>{children}</td>;
}

// ── Stock on Hand ────────────────────────────────────────────────────────────

function StockOnHandReport() {
  const warehouses = Array.from(new Set(mockSOH.map((row) => row.warehouse).filter(Boolean)));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total SKUs", value: mockSOH.length.toString(), sub: "across all warehouses" },
          { label: "Total Units", value: mockSOH.reduce((s, r) => s + r.qty, 0).toLocaleString(), sub: "on hand now" },
          { label: "Total Value", value: `AED ${mockSOH.reduce((s, r) => s + r.value, 0).toLocaleString("en-US", { minimumFractionDigits: 0 })}`, sub: "at avg cost" },
          { label: "Warehouses", value: warehouses.length.toString(), sub: warehouses.join(" / ") || "selected warehouses", live: true },
          { label: "Warehouses", value: "2", sub: "Main WH · Outlet WH" },
        ].filter((c: any) => c.label !== "Warehouses" || c.live).map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">{c.value}</div>
              <div className="max-w-full text-[10px] leading-snug text-slate-400 break-words">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Stock Qty by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={mockSOHByCategory} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Bar dataKey="qty" fill="#F5C742" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Value Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={mockSOHByCategory} cx="50%" cy="50%" outerRadius={65} dataKey="value"
                  label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false} style={{ fontSize: 9 }}>
                  {mockSOHByCategory.map((_, i) => <Cell key={i} fill={INV_COLORS[i % INV_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Stock on Hand — Detail" subtitle="All items · all warehouses" rows={mockSOH.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th>Warehouse</Th><Th right>Qty</Th><Th>UOM</Th><Th right>Min Qty</Th><Th right>Unit Cost</Th><Th right>Value</Th></tr></thead>
            <tbody>
              {mockSOH.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td><Td>{r.warehouse}</Td>
                  <Td right>
                    <span className={r.qty <= r.minQty ? "text-red-600 font-semibold" : ""}>{r.qty}</span>
                  </Td>
                  <Td>{r.uom}</Td>
                  <Td right>{r.minQty}</Td>
                  <Td right>AED {r.cost.toFixed(2)}</Td>
                  <Td right><span className="font-semibold text-[#F5C742]">AED {r.value.toFixed(2)}</span></Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
            <span>Total value: <b className="text-slate-800">AED {mockSOH.reduce((s, r) => s + r.value, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</b></span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Live-ready</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Low Stock ────────────────────────────────────────────────────────────────

function LowStockReport() {
  const critical = mockLowStock.filter((r) => r.urgency === "Critical").length;
  const high     = mockLowStock.filter((r) => r.urgency === "High").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Items Below Min",   value: mockLowStock.length.toString(), cls: "text-red-600" },
          { label: "Critical (0–50%)",  value: critical.toString(),            cls: "text-red-600" },
          { label: "High (50–75%)",     value: high.toString(),                cls: "text-orange-600" },
          { label: "Total Suggest PO",  value: mockLowStock.reduce((s, r) => s + r.suggested, 0).toString() + " units", cls: "text-slate-900" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className={`text-2xl font-bold leading-none tabular-nums tracking-normal ${c.cls}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Low Stock / Reorder List" subtitle="Items below minimum stock level" rows={mockLowStock.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th>Warehouse</Th><Th right>On Hand</Th><Th right>Min Qty</Th><Th right>Reorder Qty</Th><Th right>Suggested PO</Th><Th>Urgency</Th><Th>Last PO</Th><Th>Vendor</Th></tr></thead>
            <tbody>
              {mockLowStock.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td><Td>{r.warehouse}</Td>
                  <Td right><span className="text-red-600 font-semibold">{r.onHand}</span></Td>
                  <Td right>{r.minQty}</Td>
                  <Td right>{r.reorderQty}</Td>
                  <Td right><span className="font-semibold text-[#F5C742]">{r.suggested}</span></Td>
                  <Td>{urgencyBadge(r.urgency)}</Td>
                  <Td>{r.lastPO}</Td>
                  <Td>{r.vendor}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Out of Stock ─────────────────────────────────────────────────────────────

function OutOfStockReport() {
  const totalDailyLoss = mockOutOfStock.reduce((s, r) => s + r.avgDailySales, 0);
  const avgDaysOut = mockOutOfStock.length
    ? mockOutOfStock.reduce((s, r) => s + r.daysSinceStock, 0) / mockOutOfStock.length
    : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Out of Stock SKUs",  value: mockOutOfStock.length.toString(), sub: "zero inventory" },
          { label: "Avg Days Out",       value: avgDaysOut.toFixed(1), sub: "since last stock" },
          { label: "Daily Sales Lost",   value: `~${totalDailyLoss} units/day`, sub: "based on history" },
          { label: "Suggested PO Total", value: mockOutOfStock.reduce((s, r) => s + r.suggestedPO, 0).toString() + " units", sub: "to replenish" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-red-600">{c.value}</div>
              <div className="max-w-full text-[10px] leading-snug text-slate-400 break-words">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Out of Stock Items" subtitle="Items with zero inventory — immediate action needed" rows={mockOutOfStock.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th>Warehouse</Th><Th>Last Sold</Th><Th>Last Received</Th><Th right>Avg Daily Sales</Th><Th right>Days Out</Th><Th right>Suggested PO</Th></tr></thead>
            <tbody>
              {mockOutOfStock.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td><Td>{r.warehouse}</Td>
                  <Td>{r.lastSold}</Td><Td>{r.lastReceived}</Td>
                  <Td right>{r.avgDailySales}</Td>
                  <Td right><span className={r.daysSinceStock > 21 ? "text-red-600 font-semibold" : "text-amber-600 font-medium"}>{r.daysSinceStock}</span></Td>
                  <Td right><span className="font-semibold text-[#F5C742]">{r.suggestedPO}</span></Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Negative Stock ───────────────────────────────────────────────────────────

function NegativeStockReport() {
  const totalImpact = mockNegativeStock.reduce((s, r) => s + r.impact, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Negative SKUs",   value: mockNegativeStock.length.toString(), sub: "data integrity issues" },
          { label: "Critical",        value: mockNegativeStock.filter((r) => r.severity === "Critical").length.toString(), sub: "immediate fix needed" },
          { label: "High Severity",   value: mockNegativeStock.filter((r) => r.severity === "High").length.toString(), sub: "action required" },
          { label: "Cost Impact",     value: `AED ${totalImpact.toFixed(2)}`, sub: "financial exposure" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-red-600">{c.value}</div>
              <div className="max-w-full text-[10px] leading-snug text-slate-400 break-words">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Negative Stock / Mismatch" subtitle="Items with qty below zero — reconciliation required" rows={mockNegativeStock.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th>Warehouse</Th><Th right>Qty</Th><Th>Root Issue</Th><Th>Last Txn</Th><Th right>Cost Impact</Th><Th>Severity</Th></tr></thead>
            <tbody>
              {mockNegativeStock.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td><Td>{r.warehouse}</Td>
                  <Td right><span className="text-red-600 font-bold">{r.qty}</span></Td>
                  <Td>{r.issue}</Td>
                  <Td>{r.lastTxn}</Td>
                  <Td right><span className="text-red-600 font-semibold">AED {r.impact.toFixed(2)}</span></Td>
                  <Td>{statusBadge(r.severity)}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
          <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-[11px] text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Total financial exposure: <b>AED {Math.abs(totalImpact).toFixed(2)}</b>. Post missing GRNs and reconcile before next period close.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Expiry / Batch Ageing ────────────────────────────────────────────────────

function expiryWorstStatus(batches: ExpiryBatch[]): string {
  const order = ["Critical", "High", "Warning", "Watch", "OK"];
  return batches.reduce((worst, b) => {
    return order.indexOf(b.status) < order.indexOf(worst) ? b.status : worst;
  }, "OK");
}

function daysLeftBar(daysLeft: number) {
  const pct = Math.min(100, Math.max(0, Math.round((daysLeft / 120) * 100)));
  const color = daysLeft <= 7 ? "bg-red-500" : daysLeft <= 14 ? "bg-orange-400" : daysLeft <= 30 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums ${daysLeft <= 7 ? "text-red-600" : daysLeft <= 14 ? "text-orange-500" : daysLeft <= 30 ? "text-amber-600" : "text-slate-700"}`}>
        {daysLeft}d
      </span>
    </div>
  );
}

function ExpiryReport() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (sku: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });

  const allBatches = mockExpiry.flatMap((item) => item.batches);
  const criticalBatches  = allBatches.filter((b) => b.daysLeft <= 7);
  const highBatches      = allBatches.filter((b) => b.daysLeft > 7  && b.daysLeft <= 14);
  const atRiskValue      = allBatches.filter((b) => b.daysLeft <= 14).reduce((s, b) => s + b.value, 0);
  const totalBatchCount  = allBatches.length;

  // Ageing distribution for chart
  const ageingData = [
    { label: "≤7d (Critical)", count: criticalBatches.length,                                             fill: "#ef4444" },
    { label: "8–14d (High)",   count: highBatches.length,                                                  fill: "#f97316" },
    { label: "15–30d (Warn)",  count: allBatches.filter((b) => b.daysLeft > 14 && b.daysLeft <= 30).length, fill: "#F5C742" },
    { label: "31–90d (Watch)", count: allBatches.filter((b) => b.daysLeft > 30 && b.daysLeft <= 90).length, fill: "#10b981" },
    { label: ">90d (OK)",      count: allBatches.filter((b) => b.daysLeft > 90).length,                    fill: "#3b82f6" },
  ];

  // Sort items: worst-status first, then by soonest batch daysLeft
  const sorted = [...mockExpiry].sort((a, b) => {
    const orderA = Math.min(...a.batches.map((x) => x.daysLeft));
    const orderB = Math.min(...b.batches.map((x) => x.daysLeft));
    return orderA - orderB;
  });

  return (
    <div className="space-y-3">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Items Tracked",        value: mockExpiry.length.toString(),    sub: `${totalBatchCount} batches total` },
          { label: "Critical Batches ≤7d", value: criticalBatches.length.toString(),  cls: "text-red-600",    sub: `${mockExpiry.filter((i) => i.batches.some((b) => b.daysLeft <= 7)).length} SKUs affected` },
          { label: "High Batches 8–14d",   value: highBatches.length.toString(),       cls: "text-orange-500", sub: `${mockExpiry.filter((i) => i.batches.some((b) => b.daysLeft > 7 && b.daysLeft <= 14)).length} SKUs affected` },
          { label: "At-Risk Value",        value: `AED ${atRiskValue.toFixed(0)}`,     cls: "text-red-600",    sub: "critical + high batches" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className={`text-2xl font-bold leading-none tabular-nums tracking-normal ${c.cls ?? "text-slate-900"}`}>{c.value}</div>
              {c.sub && <div className="max-w-full text-[10px] leading-snug text-slate-400 break-words">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ageing chart */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-xs font-semibold text-slate-800">Batch Ageing Distribution</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={ageingData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `${v} batch${v !== 1 ? "es" : ""}`} />
              <Bar dataKey="count" name="Batches" radius={[3, 3, 0, 0]}>
                {ageingData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Item → batch drill-down */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader
            title="Expiry / Batch Ageing"
            subtitle="Click an item row to expand all its batches — sorted by nearest expiry"
            rows={mockExpiry.length}
          />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <table className="bb-nowrap-table w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <Th></Th>
                  <Th>SKU</Th>
                  <Th>Item</Th>
                  <Th>Category</Th>
                  <Th right>Batches</Th>
                  <Th right>Total Qty</Th>
                  <Th right>Total Value</Th>
                  <Th>Nearest Expiry</Th>
                  <Th>Worst Status</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, idx) => {
                  const isOpen      = expanded.has(item.sku);
                  const worst       = expiryWorstStatus(item.batches);
                  const nearest     = item.batches.reduce((a, b) => b.daysLeft < a.daysLeft ? b : a);
                  const totalQty    = item.batches.reduce((s, b) => s + b.qty, 0);
                  const totalVal    = item.batches.reduce((s, b) => s + b.value, 0);
                  const sortedBatches = [...item.batches].sort((a, b) => a.daysLeft - b.daysLeft);

                  return (
                    <React.Fragment key={item.sku}>
                      {/* Item summary row */}
                      <tr
                        className={`cursor-pointer transition-colors ${isOpen ? "bg-[#FFF6D8]" : idx % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50/40 hover:bg-slate-50"}`}
                        onClick={() => toggle(item.sku)}
                      >
                        <td className="px-3 py-2 w-8">
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-[#F5C742]" />
                            : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">{item.sku}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{item.item}</td>
                        <td className="px-3 py-2 text-slate-600">{item.category}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                            {item.batches.length}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800">{totalQty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[#F5C742]">AED {totalVal.toFixed(2)}</td>
                        <td className="px-3 py-2">{daysLeftBar(nearest.daysLeft)}</td>
                        <td className="px-3 py-2">{statusBadge(worst)}</td>
                      </tr>

                      {/* Batch detail rows */}
                      {isOpen && sortedBatches.map((b, bi) => (
                        <tr key={b.batchNo} className="bg-[#FFFDF5] border-t border-[#F5C742]/20">
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" colSpan={1}>
                            <div className="ml-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                              <span className="w-px h-4 bg-slate-200" />
                              <span className="text-[9px]">↳</span>
                              <span className="font-mono text-slate-600 font-medium">{b.batchNo}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-500 text-[10px]">{b.warehouse}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right text-[10px] text-slate-400">Batch {bi + 1}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{b.qty}</td>
                          <td className="px-3 py-2 text-right text-slate-700">AED {b.value.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-0.5">
                              {daysLeftBar(b.daysLeft)}
                              <span className="text-[9px] text-slate-400 ml-0.5">{b.expiryDate}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">{statusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
            {[
              { color: "bg-red-500",    label: "Critical ≤7d" },
              { color: "bg-orange-400", label: "High 8–14d" },
              { color: "bg-amber-400",  label: "Warning 15–30d" },
              { color: "bg-emerald-400",label: "Watch 31–90d" },
              { color: "bg-blue-400",   label: "OK >90d" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Movement Ledger ──────────────────────────────────────────────────────────

const TXN_COLOR: Record<string, string> = {
  GRN: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Sale: "bg-blue-100 text-blue-700 border-blue-200",
  Transfer: "bg-purple-100 text-purple-700 border-purple-200",
  Return: "bg-amber-100 text-amber-700 border-amber-200",
  Wastage: "bg-red-100 text-red-700 border-red-200",
  "Adj+": "bg-teal-100 text-teal-700 border-teal-200",
  "Adj-": "bg-orange-100 text-orange-700 border-orange-200",
};

function MovementLedgerReport() {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <ReportHeader title="Stock Movement Ledger" subtitle="All transactions with running balance" rows={mockMovementLedger.length} />
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <Tbl>
          <thead><tr><Th>Date</Th><Th>Type</Th><Th>Reference</Th><Th>Item</Th><Th>SKU</Th><Th>Warehouse</Th><Th right>In</Th><Th right>Out</Th><Th right>Balance</Th><Th right>Unit Cost</Th></tr></thead>
          <tbody>
            {mockMovementLedger.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                <Td>{r.date}</Td>
                <Td>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${TXN_COLOR[r.txnType] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{r.txnType}</span>
                </Td>
                <Td mono>{r.ref}</Td>
                <Td>{r.item}</Td>
                <Td mono>{r.sku}</Td>
                <Td>{r.warehouse}</Td>
                <Td right>{r.in > 0 ? <span className="text-emerald-600 font-semibold">+{r.in}</span> : "—"}</Td>
                <Td right>{r.out > 0 ? <span className="text-red-500 font-semibold">-{r.out}</span> : "—"}</Td>
                <Td right><span className="font-semibold">{r.balance}</span></Td>
                <Td right>AED {r.cost.toFixed(2)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ── Stock Transfer ───────────────────────────────────────────────────────────

function StockTransferReport() {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <ReportHeader title="Stock Transfer Report" subtitle="Pending · in-transit · completed · variance" rows={mockTransfers.length} />
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <Tbl>
          <thead><tr><Th>Ref</Th><Th>Date</Th><Th>From</Th><Th>To</Th><Th>Item</Th><Th>SKU</Th><Th right>Qty</Th><Th right>Unit Cost</Th><Th right>Value</Th><Th>Approver</Th><Th>Status</Th></tr></thead>
          <tbody>
            {mockTransfers.map((r, i) => (
              <tr key={r.ref} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                <Td mono>{r.ref}</Td><Td>{r.date}</Td><Td>{r.from}</Td><Td>{r.to}</Td>
                <Td>{r.item}</Td><Td mono>{r.sku}</Td>
                <Td right>{r.qty}</Td>
                <Td right>AED {r.cost.toFixed(2)}</Td>
                <Td right>AED {r.value.toFixed(2)}</Td>
                <Td>{r.approver}</Td>
                <Td>{statusBadge(r.status)}</Td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ── Reconciliation ───────────────────────────────────────────────────────────

function ReconciliationReport() {
  const totalImpact = mockReconciliation.reduce((s, r) => s + r.costImpact, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Adjustments", value: mockReconciliation.length.toString() },
          { label: "Positive Adj.", value: mockReconciliation.filter((r) => r.diff > 0).length.toString() },
          { label: "Net Cost Impact", value: `AED ${totalImpact > 0 ? "+" : ""}${totalImpact.toFixed(2)}` },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Stock Reconciliation Report" subtitle="Adjustments with reason, approver and cost impact" rows={mockReconciliation.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>Date</Th><Th>Ref</Th><Th>Item</Th><Th>SKU</Th><Th right>Before</Th><Th right>After</Th><Th right>Diff</Th><Th>Reason</Th><Th>Approver</Th><Th right>Cost Impact</Th></tr></thead>
            <tbody>
              {mockReconciliation.map((r, i) => (
                <tr key={r.ref} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td>{r.date}</Td><Td mono>{r.ref}</Td><Td>{r.item}</Td><Td mono>{r.sku}</Td>
                  <Td right>{r.before}</Td><Td right>{r.after}</Td>
                  <Td right>
                    <span className={r.diff > 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </span>
                  </Td>
                  <Td>{r.reason}</Td><Td>{r.approver}</Td>
                  <Td right>
                    <span className={r.costImpact > 0 ? "text-emerald-600" : "text-red-600"}>
                      AED {r.costImpact > 0 ? "+" : ""}{r.costImpact.toFixed(2)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Wastage ──────────────────────────────────────────────────────────────────

function WastageReport() {
  const totalImpact = mockWastage.reduce((s, r) => s + r.impact, 0);
  const avgImpact = mockWastage.length ? totalImpact / mockWastage.length : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Wastage by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={mockWastageByCategory} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toFixed(2)}`} />
                <Bar dataKey="value" fill="#ef4444" name="Cost Impact" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="min-h-[148px] p-4 flex flex-col gap-4 justify-center h-full text-left">
            {[
              { label: "Total Wastage Events", value: mockWastage.length.toString() },
              { label: "Total Cost Impact",    value: `AED ${totalImpact.toFixed(2)}`, cls: "text-red-600" },
              { label: "Avg per Event",        value: `AED ${avgImpact.toFixed(2)}` },
            ].map((c) => (
              <div key={c.label}>
                <div className="text-[10px] text-slate-500">{c.label}</div>
                <div className={`text-2xl font-bold leading-none tabular-nums tracking-normal ${c.cls ?? "text-slate-900"}`}>{c.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Wastage / Internal Consumption Detail" subtitle="Expired, damaged, and internal-use write-offs" rows={mockWastage.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>Date</Th><Th>Ref</Th><Th>Item</Th><Th>SKU</Th><Th>Reason</Th><Th>Warehouse</Th><Th right>Qty</Th><Th right>Unit Cost</Th><Th right>Impact</Th></tr></thead>
            <tbody>
              {mockWastage.map((r, i) => (
                <tr key={r.ref} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td>{r.date}</Td><Td mono>{r.ref}</Td><Td>{r.item}</Td><Td mono>{r.sku}</Td>
                  <Td>{r.reason}</Td><Td>{r.warehouse}</Td>
                  <Td right>{r.qty}</Td>
                  <Td right>AED {r.cost.toFixed(2)}</Td>
                  <Td right><span className="text-red-600 font-semibold">AED {r.impact.toFixed(2)}</span></Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Inflow vs Outflow ────────────────────────────────────────────────────────

function InflowOutflowReport() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Weekly Inflow vs Outflow (AED)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockInflowOutflow} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="inflow" fill="#10b981" name="Inflow" />
                <Bar dataKey="outflow" fill="#F5C742" name="Outflow" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">By Category (AED)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockInflowOutflowByCategory} layout="vertical" barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis dataKey="category" type="category" tick={{ fontSize: 9 }} width={90} />
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="inflow" fill="#10b981" name="Inflow" />
                <Bar dataKey="outflow" fill="#F5C742" name="Outflow" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Weekly Inflow vs Outflow Summary" subtitle="Net movement per period" rows={mockInflowOutflow.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>Period</Th><Th right>Inflow (AED)</Th><Th right>Outflow (AED)</Th><Th right>Net</Th></tr></thead>
            <tbody>
              {mockInflowOutflow.map((r, i) => (
                <tr key={r.period} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td>{r.period}</Td>
                  <Td right><span className="text-emerald-600 font-semibold">AED {r.inflow.toLocaleString()}</span></Td>
                  <Td right><span className="text-[#F5C742] font-semibold">AED {r.outflow.toLocaleString()}</span></Td>
                  <Td right>
                    <span className={r.net >= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                      AED {r.net >= 0 ? "+" : ""}{r.net.toLocaleString()}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Price Audit ──────────────────────────────────────────────────────────────

function PriceAuditReport() {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <ReportHeader title="Price Level / Price Change Audit" subtitle="All price updates with user, timestamp and approval" rows={mockPriceAudit.length} />
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <Tbl>
          <thead><tr><Th>Date</Th><Th>Item</Th><Th>SKU</Th><Th>Price Level</Th><Th right>Old Price</Th><Th right>New Price</Th><Th right>Change %</Th><Th>Changed By</Th><Th>Approved By</Th></tr></thead>
          <tbody>
            {mockPriceAudit.map((r, i) => {
              const isUp = r.pct.startsWith("+");
              const isDown = r.pct.startsWith("-");
              return (
                <tr key={`${r.sku}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td>{r.date}</Td><Td>{r.item}</Td><Td mono>{r.sku}</Td><Td>{r.priceLevel}</Td>
                  <Td right>AED {r.oldPrice.toFixed(2)}</Td>
                  <Td right>AED {r.newPrice.toFixed(2)}</Td>
                  <Td right>
                    <span className={isUp ? "text-emerald-600 font-semibold" : isDown ? "text-red-600 font-semibold" : "text-slate-500"}>
                      {r.pct}
                    </span>
                  </Td>
                  <Td>{r.changedBy}</Td><Td>{r.approved}</Td>
                </tr>
              );
            })}
          </tbody>
        </Tbl>
      </CardContent>
    </Card>
  );
}

// ── Cost Variance ────────────────────────────────────────────────────────────

function CostVarianceReport() {
  const totalVar = mockCostVariance.reduce((s, r) => s + r.totalVar, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "GRNs Compared", value: mockCostVariance.length.toString() },
          { label: "Over-invoiced", value: mockCostVariance.filter((r) => r.status === "Over").length.toString(), cls: "text-red-600" },
          { label: "Under-invoiced", value: mockCostVariance.filter((r) => r.status === "Under").length.toString(), cls: "text-blue-600" },
          { label: "Net Variance", value: `AED ${totalVar > 0 ? "+" : ""}${totalVar.toFixed(2)}`, cls: totalVar > 0 ? "text-red-600" : "text-emerald-600" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className={`text-2xl font-bold leading-none tabular-nums tracking-normal ${c.cls ?? "text-slate-900"}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="GRN vs Invoice Cost Variance" subtitle="Variance between goods received note and supplier invoice" rows={mockCostVariance.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>GRN Ref</Th><Th>Invoice Ref</Th><Th>Item</Th><Th>SKU</Th><Th right>Qty</Th><Th right>GRN Cost</Th><Th right>Inv Cost</Th><Th right>Variance/Unit</Th><Th right>Total Var</Th><Th>Status</Th></tr></thead>
            <tbody>
              {mockCostVariance.map((r, i) => (
                <tr key={r.grnRef} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.grnRef}</Td><Td mono>{r.invRef}</Td><Td>{r.item}</Td><Td mono>{r.sku}</Td>
                  <Td right>{r.qty}</Td>
                  <Td right>AED {r.grnCost.toFixed(2)}</Td>
                  <Td right>AED {r.invCost.toFixed(2)}</Td>
                  <Td right>
                    <span className={r.variance > 0 ? "text-red-600 font-semibold" : r.variance < 0 ? "text-blue-600 font-semibold" : "text-slate-500"}>
                      {r.variance === 0 ? "—" : `AED ${r.variance > 0 ? "+" : ""}${r.variance.toFixed(2)}`}
                    </span>
                  </Td>
                  <Td right>
                    <span className={r.totalVar > 0 ? "text-red-600 font-semibold" : r.totalVar < 0 ? "text-blue-600 font-semibold" : "text-slate-500"}>
                      {r.totalVar === 0 ? "—" : `AED ${r.totalVar > 0 ? "+" : ""}${r.totalVar.toFixed(2)}`}
                    </span>
                  </Td>
                  <Td>{statusBadge(r.status)}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Item Margin (GP%) ────────────────────────────────────────────────────────

function ItemMarginReport() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">GP% by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockItemMarginByCategory} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Bar dataKey="gpPct" fill="#F5C742" name="GP%" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Revenue vs GP by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockItemMarginByCategory} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                <Bar dataKey="gp" fill="#10b981" name="Gross Profit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Item Margin Report (GP%)" subtitle="Sales vs cost, gross profit per item" rows={mockItemMargin.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th right>Sales Qty</Th><Th right>Revenue</Th><Th right>Cost</Th><Th right>Gross Profit</Th><Th right>GP%</Th></tr></thead>
            <tbody>
              {mockItemMargin.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td>
                  <Td right>{r.salesQty.toLocaleString()}</Td>
                  <Td right>AED {r.revenue.toLocaleString()}</Td>
                  <Td right>AED {r.cost.toLocaleString()}</Td>
                  <Td right><span className="font-semibold text-[#F5C742]">AED {r.gp.toLocaleString()}</span></Td>
                  <Td right>{gpBadge(r.gpPct)}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Item Master Completeness ─────────────────────────────────────────────────

function ItemMasterCompletenessReport() {
  const avg = mockMasterCompleteness.length
    ? mockMasterCompleteness.reduce((s, r) => s + r.score, 0) / mockMasterCompleteness.length
    : 0;
  const scoreData = [
    { range: "100%", count: mockMasterCompleteness.filter((r) => r.score === 100).length },
    { range: "60–99%", count: mockMasterCompleteness.filter((r) => r.score >= 60 && r.score < 100).length },
    { range: "<60%", count: mockMasterCompleteness.filter((r) => r.score < 60).length },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Items", value: mockMasterCompleteness.length.toString() },
          { label: "Avg Completeness", value: `${avg.toFixed(0)}%`, cls: avg >= 80 ? "text-emerald-600" : "text-amber-600" },
          { label: "Fully Complete", value: mockMasterCompleteness.filter((r) => r.score === 100).length.toString(), sub: "100% score" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className={`text-2xl font-bold leading-none tabular-nums tracking-normal ${c.cls ?? "text-slate-900"}`}>{c.value}</div>
              {c.sub && <div className="max-w-full text-[10px] leading-snug text-slate-400 break-words">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Completeness Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoreData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Bar dataKey="count" fill="#F5C742" name="Items" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Field Coverage</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {(["hasBarcode", "hasCost", "hasCategory", "hasImage", "hasVendor"] as const).map((f) => {
              const label = { hasBarcode: "Barcode", hasCost: "Cost", hasCategory: "Category", hasImage: "Image", hasVendor: "Vendor" }[f];
              const filled = mockMasterCompleteness.filter((r) => r[f]).length;
              const pct = mockMasterCompleteness.length ? Math.round((filled / mockMasterCompleteness.length) * 100) : 0;
              return (
                <div key={f}>
                  <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                    <span>{label}</span><span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-[#F5C742]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Item Master Completeness" subtitle="Field-level audit per SKU" rows={mockMasterCompleteness.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Barcode</Th><Th>Cost</Th><Th>Category</Th><Th>Image</Th><Th>Vendor</Th><Th right>Score</Th><Th>Status</Th></tr></thead>
            <tbody>
              {mockMasterCompleteness.map((r, i) => {
                const tick = (v: boolean) => v
                  ? <span className="text-emerald-500">✓</span>
                  : <span className="text-red-400">✗</span>;
                return (
                  <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <Td mono>{r.sku}</Td><Td>{r.item}</Td>
                    <Td>{tick(r.hasBarcode)}</Td><Td>{tick(r.hasCost)}</Td>
                    <Td>{tick(r.hasCategory)}</Td><Td>{tick(r.hasImage)}</Td>
                    <Td>{tick(r.hasVendor)}</Td>
                    <Td right>
                      <span className={r.score === 100 ? "text-emerald-600 font-bold" : r.score >= 60 ? "text-amber-600 font-semibold" : "text-red-600 font-bold"}>
                        {r.score}%
                      </span>
                    </Td>
                    <Td>{statusBadge(r.status)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Barcode Audit ────────────────────────────────────────────────────────────

function BarcodeAuditReport() {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="py-3 px-3">
        <ReportHeader title="Barcode / Label Audit" subtitle="Label templates, last printed, queue status" rows={mockBarcodeAudit.length} />
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <Tbl>
          <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Barcode</Th><Th>Template</Th><Th>Last Printed</Th><Th>Printed By</Th><Th>Queue</Th><Th>Status</Th></tr></thead>
          <tbody>
            {mockBarcodeAudit.map((r, i) => (
              <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                <Td mono>{r.sku}</Td><Td>{r.item}</Td>
                <Td mono>{r.barcode}</Td>
                <Td>{r.template}</Td><Td>{r.lastPrinted}</Td>
                <Td>{r.printedBy}</Td>
                <Td>
                  {r.queueStatus !== "—" ? statusBadge(r.queueStatus) : <span className="text-slate-400">—</span>}
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

// ── Scale Export ─────────────────────────────────────────────────────────────

function ScaleExportReport() {
  const synced  = mockScaleExport.filter((r) => r.status === "Synced").length;
  const pending = mockScaleExport.filter((r) => r.status === "Pending").length;
  const failed  = mockScaleExport.filter((r) => r.status === "Failed").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Items", value: mockScaleExport.length.toString() },
          { label: "Synced",      value: synced.toString(), cls: "text-emerald-600" },
          { label: "Pending",     value: pending.toString(), cls: "text-amber-600" },
          { label: "Failed",      value: failed.toString(), cls: "text-red-600" },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className={`text-2xl font-bold leading-none tabular-nums tracking-normal ${c.cls ?? "text-slate-900"}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Weighing Scale Export Report" subtitle="Items synced vs pending/failed to weighing scales" rows={mockScaleExport.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Scale</Th><Th>Last Sync</Th><Th right>Price (AED)</Th><Th>Status</Th></tr></thead>
            <tbody>
              {mockScaleExport.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td>
                  <Td>{r.scale}</Td><Td>{r.lastSync}</Td>
                  <Td right>AED {r.price.toFixed(2)}</Td>
                  <Td>{statusBadge(r.status)}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Dead / Slow Moving Stock ─────────────────────────────────────────────────

function DeadStockReport() {
  const bucketData = [
    { bucket: "15–30d", count: mockDeadStock.filter((r) => r.bucket === "15-30 days").length, value: mockDeadStock.filter((r) => r.bucket === "15-30 days").reduce((s, r) => s + r.value, 0) },
    { bucket: "30–45d", count: mockDeadStock.filter((r) => r.bucket === "30-45 days").length, value: mockDeadStock.filter((r) => r.bucket === "30-45 days").reduce((s, r) => s + r.value, 0) },
    { bucket: "45–60d", count: mockDeadStock.filter((r) => r.bucket === "45-60 days").length, value: mockDeadStock.filter((r) => r.bucket === "45-60 days").reduce((s, r) => s + r.value, 0) },
    { bucket: "60–90d", count: mockDeadStock.filter((r) => r.bucket === "60-90 days").length, value: mockDeadStock.filter((r) => r.bucket === "60-90 days").reduce((s, r) => s + r.value, 0) },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Dead Stock Ageing Buckets</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bucketData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Bar dataKey="count" fill="#F5C742" name="Items" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="min-h-[148px] p-4 flex flex-col gap-4 justify-center h-full text-left">
            <div>
              <div className="text-[10px] text-slate-500">Total Dead Stock SKUs</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">{mockDeadStock.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Total Tied-Up Value</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-amber-600">AED {mockDeadStock.reduce((s, r) => s + r.value, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Dead / Slow Moving Stock" subtitle="Items with no sales activity in recent days" rows={mockDeadStock.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th>Warehouse</Th><Th right>Qty on Hand</Th><Th>Last Sold</Th><Th right>Days Since Sale</Th><Th right>Avg Monthly Sales</Th><Th right>Value</Th><Th>Bucket</Th></tr></thead>
            <tbody>
              {mockDeadStock.map((r, i) => (
                <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td><Td>{r.warehouse}</Td>
                  <Td right>{r.qty.toLocaleString()}</Td>
                  <Td>{r.lastSoldDate}</Td>
                  <Td right><span className={r.daysSinceSale > 60 ? "text-red-600 font-bold" : r.daysSinceSale > 30 ? "text-amber-600 font-semibold" : ""}>{r.daysSinceSale}</span></Td>
                  <Td right>{r.avgMonthlySales}</Td>
                  <Td right><span className="text-amber-600 font-semibold">AED {r.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></Td>
                  <Td><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">{r.bucket}</span></Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Fast Moving ──────────────────────────────────────────────────────────────

function FastMovingReport() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Top Items by Qty Sold</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[...mockFastMoving].sort((a, b) => b.qtySold - a.qtySold).slice(0, 6)} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis dataKey="item" type="category" tick={{ fontSize: 8 }} width={110} />
                <Tooltip contentStyle={{ fontSize: "11px" }} />
                <Bar dataKey="qtySold" fill="#F5C742" name="Qty Sold" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-xs font-semibold text-slate-800">Top Items by Revenue</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[...mockFastMoving].sort((a, b) => b.revenue - a.revenue).slice(0, 6)} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis dataKey="item" type="category" tick={{ fontSize: 8 }} width={110} />
                <Tooltip contentStyle={{ fontSize: "11px" }} formatter={(v: number) => `AED ${v.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (AED)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Fast Moving Items" subtitle="Top performers by sales volume for replenishment planning" rows={mockFastMoving.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>#</Th><Th>SKU</Th><Th>Item</Th><Th>Category</Th><Th>Warehouse</Th><Th right>Qty Sold</Th><Th right>Revenue</Th><Th right>Avg Daily Sales</Th><Th right>Turnover</Th><Th right>Trend</Th></tr></thead>
            <tbody>
              {mockFastMoving.map((r, i) => {
                const trendUp = r.trend.startsWith("+");
                return (
                  <tr key={r.sku} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <Td><span className="text-[10px] font-bold text-slate-400">#{i + 1}</span></Td>
                    <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.category}</Td><Td>{r.warehouse}</Td>
                    <Td right><span className="font-semibold">{r.qtySold.toLocaleString()}</span></Td>
                    <Td right>AED {r.revenue.toLocaleString()}</Td>
                    <Td right>{r.avgDailySales.toFixed(1)}</Td>
                    <Td right>{r.turnover}×</Td>
                    <Td right>
                      <span className={trendUp ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>{r.trend}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Bin Stock ────────────────────────────────────────────────────────────────

function BinStockReport() {
  const zones = [...new Set(mockBinStock.map((r) => r.zone))];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Bins Active",    value: mockBinStock.length.toString() },
          { label: "Zones",          value: zones.length.toString(), sub: zones.join(" · ") },
          { label: "Total Units",    value: mockBinStock.reduce((s, r) => s + r.qty, 0).toLocaleString() },
        ].map((c) => (
          <Card key={c.label} className="border border-slate-200 bg-white">
            <CardContent className="min-h-[92px] p-4 flex flex-col items-start justify-center gap-2 text-left">
              <div className="max-w-full text-[10px] font-semibold leading-snug text-slate-500 whitespace-normal break-words">{c.label}</div>
              <div className="text-2xl font-bold leading-none tabular-nums tracking-normal text-slate-900">{c.value}</div>
              {c.sub && <div className="max-w-full text-[10px] leading-snug text-slate-400 break-words truncate">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="py-3 px-3">
          <ReportHeader title="Warehouse Bin Stock" subtitle="Bin / rack-wise stock location and quantities" rows={mockBinStock.length} />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Tbl>
            <thead><tr><Th>Bin</Th><Th>Zone</Th><Th>SKU</Th><Th>Item</Th><Th>Warehouse</Th><Th right>Qty</Th><Th>UOM</Th></tr></thead>
            <tbody>
              {mockBinStock.map((r, i) => (
                <tr key={`${r.bin}-${r.sku}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <Td><span className="font-mono font-semibold text-[#F5C742]">{r.bin}</span></Td>
                  <Td><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">{r.zone}</span></Td>
                  <Td mono>{r.sku}</Td><Td>{r.item}</Td><Td>{r.warehouse}</Td>
                  <Td right><span className="font-semibold">{r.qty.toLocaleString()}</span></Td>
                  <Td>{r.uom}</Td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </CardContent>
      </Card>
    </div>
  );
}
