import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Boxes,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ClipboardCheck,
    CreditCard,
    FileCheck2,
    FileText,
    Filter,
    Loader2,
    Menu,
    PackageCheck,
    ReceiptText,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    Truck,
    Users,
    X
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../../../api/axiosConfig';
import { getAllAccountingPeriods } from '../../../api/accountingPeriodApi';
import { getBranches } from '../../../api/branchApi';
import { getGrnById, getGrns } from '../../../api/grnApi';
import { getLpoByNumber, getLpos } from '../../../api/lpoApi';
import { getPaymentVouchers } from '../../../api/paymentApi';
import { getInvoices as getPurchaseInvoices } from '../../../api/purchaseInvoiceApi';
import { getVendors } from '../../../api/vendorsApi';
import CurrencyAmount from '../../../components/CurrencyAmount';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { getPrintTemplates } from '../../../api/printTemplateApi';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { generateReportPrintHtml, printHtml } from '../../../utils/printGenerator';
import { buildReportHeaderProfile } from '../../../utils/branchPrintProfile';
import { useCompany } from '../../../context/CompanyContext';
import { useBranch } from '../../../context/BranchContext';
import useReportScrollPreserver from '../../../hooks/useReportScrollPreserver';

const REPORT_GROUPS = [
    {
        id: 'vendor',
        title: 'Vendor Management',
        icon: Users,
        reports: [
            { id: 'vendor-master', title: 'Vendor Master Report', description: 'Complete vendor master with credit limits and balances.', badge: 'Chart', tag: 'Core', icon: Users },
            { id: 'vendor-aging', title: 'Vendor Outstanding & Aging', description: 'Payable aging buckets by vendor from open invoices.', badge: 'Chart', tag: 'Finance', icon: CalendarClock },
            { id: 'vendor-performance', title: 'Vendor Performance Summary', description: 'Delivery, rejection, invoice and payment performance.', badge: 'Chart', tag: 'KPI', icon: BarChart3 },
            { id: 'vendor-price-history', title: 'Vendor Price History', description: 'Last purchase rates by item and vendor from live purchase lines.', badge: 'Chart', tag: 'Pricing', icon: ReceiptText },
            { id: 'vendor-contract-compliance', title: 'Vendor Contract Compliance', description: 'Contract price compliance where contract source is available.', badge: 'Table', tag: 'Compliance', icon: ShieldCheck }
        ]
    },
    {
        id: 'lpo',
        title: 'LPO / Purchase Orders',
        icon: FileText,
        reports: [
            { id: 'lpo-register', title: 'LPO Register', description: 'All purchase orders with approval, value and delivery status.', badge: 'Table', tag: 'Core', icon: FileText },
            { id: 'lpo-delivery-fulfillment', title: 'LPO vs Delivery Fulfillment', description: 'Ordered vs received quantities and fulfilment percentage.', badge: 'Chart', tag: 'Analytics', icon: Truck },
            { id: 'lpo-aging', title: 'LPO Aging Report', description: 'Pending and overdue purchase orders by expected date.', badge: 'Chart', tag: 'Aging', icon: CalendarClock },
            { id: 'lpo-cancelled-modified', title: 'Cancelled / Modified LPO', description: 'Cancelled or rejected LPOs from live order status.', badge: 'Table', tag: 'Audit', icon: AlertTriangle }
        ]
    },
    {
        id: 'grn',
        title: 'GRN / Goods Receipt',
        icon: PackageCheck,
        reports: [
            { id: 'grn-register', title: 'GRN Register', description: 'Goods receipt notes with warehouse, QC and posting status.', badge: 'Table', tag: 'Core', icon: PackageCheck },
            { id: 'grn-variance', title: 'GRN Variance Report', description: 'LPO vs GRN quantity and value differences.', badge: 'Chart', tag: 'Variance', icon: BarChart3 },
            { id: 'batch-expiry', title: 'Batch & Expiry Report', description: 'Batch tracking with expiry dates from received invoice batches.', badge: 'Table', tag: 'Warehouse', icon: Boxes },
            { id: 'qc-rejection', title: 'QC Rejection Report', description: 'Rejected goods by vendor, item and GRN.', badge: 'Chart', tag: 'Quality', icon: ClipboardCheck }
        ]
    },
    {
        id: 'grv',
        title: 'GRV / Goods Returns',
        icon: RotateCcw,
        reports: [
            { id: 'grv-register', title: 'GRV Register', description: 'Goods return vouchers and settlement status.', badge: 'Table', tag: 'Returns', icon: RotateCcw },
            { id: 'grv-reason-analysis', title: 'GRV Reason Analysis', description: 'Return value by reason where GRV records exist.', badge: 'Chart', tag: 'Analytics', icon: BarChart3 },
            { id: 'replacement-pending', title: 'Replacement Pending Report', description: 'Pending replacements and SLA monitoring.', badge: 'Table', tag: 'SLA', icon: PackageCheck },
            { id: 'grv-debit-note-mapping', title: 'GRV vs Debit Note Mapping', description: 'Return vouchers linked to debit notes.', badge: 'Table', tag: 'Finance', icon: FileCheck2 }
        ]
    },
    {
        id: 'invoice',
        title: 'Purchase Invoices',
        icon: ReceiptText,
        reports: [
            { id: 'purchase-invoice-register', title: 'Purchase Invoice Register', description: 'Vendor invoices with GRN/LPO, VAT and balance details.', badge: 'Table', tag: 'Finance', icon: ReceiptText },
            { id: 'invoice-grn-variance', title: 'Invoice vs GRN Variance', description: 'Quantity and rate differences between invoice and GRN lines.', badge: 'Chart', tag: 'Variance', icon: BarChart3 },
            { id: 'landed-cost-allocation', title: 'Landed Cost Allocation', description: 'Freight, customs and handling allocated per purchase invoice.', badge: 'Chart', tag: 'Costing', icon: FileCheck2 },
            { id: 'backdated-invoice', title: 'Backdated Invoice Report', description: 'Invoices posted after the transaction month or closed period.', badge: 'Table', tag: 'Audit', icon: AlertTriangle }
        ]
    },
    {
        id: 'payments',
        title: 'Payments & Banking',
        icon: CreditCard,
        reports: [
            { id: 'payment-voucher-register', title: 'Payment Voucher Register', description: 'Vendor payments with mode, bank and status.', badge: 'Table', tag: 'Core', icon: CreditCard },
            { id: 'payment-aging-delay', title: 'Payment Aging & Delay', description: 'Due date vs paid date / as-of delay by vendor.', badge: 'Chart', tag: 'Aging', icon: CalendarClock },
            { id: 'cheque-pdc-tracking', title: 'Cheque / PDC Tracking', description: 'Cheque and PDC payment instruments with clearance status.', badge: 'Table', tag: 'Banking', icon: FileText },
            { id: 'advance-payment-utilization', title: 'Advance Payment Utilization', description: 'Vendor advances and balance against LPOs.', badge: 'Chart', tag: 'Finance', icon: CreditCard }
        ]
    },
    {
        id: 'claims',
        title: 'Claims & Debit Notes',
        icon: AlertTriangle,
        reports: [
            { id: 'debit-note-register', title: 'Debit Note Register', description: 'Vendor debit notes with reason and settlement status.', badge: 'Table', tag: 'Finance', icon: FileCheck2 },
            { id: 'claim-settlement-status', title: 'Claim Settlement Status', description: 'Claim lifecycle from issued to settled or rejected.', badge: 'Chart', tag: 'Tracking', icon: CheckCircle2 },
            { id: 'vendor-claim-history', title: 'Vendor Claim History', description: 'Claim frequency, values and settlement performance by vendor.', badge: 'Chart', tag: 'Analytics', icon: BarChart3 }
        ]
    },
    {
        id: 'compliance',
        title: 'Compliance & Audit',
        icon: ShieldCheck,
        reports: [
            { id: 'vat-input-register', title: 'VAT Input Register (UAE)', description: 'Input VAT register from taxable purchase invoices.', badge: 'Table', tag: 'VAT', icon: ShieldCheck },
            { id: 'period-lock-violation', title: 'Period Lock Violation Report', description: 'Purchase documents posted inside closed accounting periods.', badge: 'Table', tag: 'Audit', icon: AlertTriangle },
            { id: 'missing-document', title: 'Missing Document Report', description: 'GRNs, invoices and payments with missing linked documents.', badge: 'Table', tag: 'Audit', icon: ClipboardCheck },
            { id: 'audit-trail', title: 'Audit Trail Report', description: 'User action logs for purchase-related records.', badge: 'Table', tag: 'Audit', icon: ShieldCheck }
        ]
    }
];

const COLORS = ['#f5c742', '#10b981', '#3b82f6', '#f97316', '#ef4444', '#8b5cf6', '#14b8a6'];

const MONEY_KEYS = new Set([
    'amount',
    'balance',
    'balanceDue',
    'creditLimit',
    'customs',
    'freight',
    'handling',
    'invoiceAmount',
    'landedCost',
    'netLandedCost',
    'outstanding',
    'paid',
    'tax',
    'taxable',
    'total',
    'totalValue',
    'value',
    'varianceValue'
]);

const allReports = REPORT_GROUPS.flatMap(group => group.reports.map(report => ({ ...report, group: group.title, groupId: group.id })));

const isoDate = (date = new Date()) => {
    const local = new Date(date);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 10);
};

const currentMonthStart = () => {
    const now = new Date();
    return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
};

const defaultFilters = () => ({
    dateFrom: currentMonthStart(),
    dateTo: isoDate(),
    vendor: 'All',
    branch: 'All',
    searchQuery: ''
});

const normalizeList = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.content)) return value.content;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.results)) return value.results;
    return [];
};

const normalize = value => String(value ?? '').trim().toLowerCase();

const toNumber = (value, fallback = 0) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const cleaned = String(value ?? '').replace(/,/g, '').trim();
    if (!cleaned) return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, decimals = 2) => {
    const power = 10 ** decimals;
    return Math.round((toNumber(value) + Number.EPSILON) * power) / power;
};

const sumBy = (rows, selector) => rows.reduce((sum, row) => sum + toNumber(selector(row)), 0);

const pct = (value, total) => {
    const base = toNumber(total);
    if (!base) return 0;
    return round((toNumber(value) / base) * 100, 2);
};

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const endOfDay = (date) => {
    if (!date) return null;
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
};

const formatNumber = (value, decimals = 0) => {
    const parsed = toNumber(value, NaN);
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString('en-AE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const formatPercent = value => `${formatNumber(value, 1)}%`;

const formatDate = (value) => {
    const date = parseDate(value);
    if (!date) return value || '-';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysBetween = (from, to = new Date()) => {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate || !toDate) return 0;
    const ms = toDate.setHours(0, 0, 0, 0) - fromDate.setHours(0, 0, 0, 0);
    return Math.floor(ms / 86400000);
};

const firstValue = (row, keys, fallback = '') => {
    for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
};

const getDocDate = (row) => firstValue(row, [
    'date',
    'lpoDate',
    'invoiceDate',
    'paymentDate',
    'voucherDate',
    'grnDate',
    'createdAt',
    'updatedAt'
]);

const getVendorName = (row) => firstValue(row, ['vendorName', 'vendor', 'supplierName', 'supplier', 'name'], 'Unknown');
const getVendorCode = (row) => firstValue(row, ['vendorCode', 'code', 'supplierCode'], '');
const getBranchValue = (row) => firstValue(row, ['branchId', 'branchName', 'branchCode'], 'All');
const getBranchLabel = (row) => firstValue(row, ['branchName', 'branchCode', 'branchId'], 'All Branches');
const getWarehouse = (row) => firstValue(row, ['warehouseName', 'warehouse', 'warehouseId'], '-');
const getStatus = (row) => firstValue(row, ['status', 'approvalStatus', 'paymentStatus', 'qcStatus', 'posted'], '-');

const getLpoNumber = row => firstValue(row, ['lpoNumber', 'id', 'lpoNo', 'number'], '-');
const getGrnNumber = row => firstValue(row, ['grnNo', 'idDisplay', 'id', 'referenceNo'], '-');
const getInvoiceNumber = row => firstValue(row, ['invoiceNumber', 'vendorInvoiceNo', 'referenceNumber', 'id'], '-');
const getPaymentNumber = row => firstValue(row, ['voucherNumber', 'paymentVoucherNumber', 'id'], '-');

const getItems = row => normalizeList(row?.items || row?.lineItems || row?.details);

const getItemName = item => firstValue(item, ['itemName', 'name', 'productName', 'description'], '-');
const getItemCode = item => firstValue(item, ['itemCode', 'code', 'sku', 'barcode', 'productCode'], '-');
const getLineQty = item => toNumber(firstValue(item, ['qty', 'quantity', 'received', 'accepted', 'receivedQuantity', 'lpoQty'], 0));
const getLineRejectedQty = item => toNumber(firstValue(item, ['rejected', 'rejectedQty', 'rejectedQuantity'], 0));
const getLineRate = item => {
    const direct = firstValue(item, ['unitCost', 'unitPrice', 'netCost', 'rate', 'price'], null);
    if (direct !== null) return toNumber(direct);
    const qty = getLineQty(item);
    return qty ? toNumber(firstValue(item, ['lineTotal', 'total'], 0)) / qty : 0;
};
const getLineTotal = item => {
    const direct = firstValue(item, ['lineTotal', 'total'], null);
    if (direct !== null) return toNumber(direct);
    return getLineQty(item) * getLineRate(item);
};

const getInvoiceAmount = inv => toNumber(firstValue(inv, ['grandTotal', 'totalAmount', 'amount', 'netTotal'], 0));
const getInvoiceTax = inv => toNumber(firstValue(inv, ['taxTotal', 'taxAmount', 'vatAmount'], 0));
const getInvoiceTaxable = inv => toNumber(firstValue(inv, ['subTotal', 'taxableAmount', 'taxableValue'], getInvoiceAmount(inv) - getInvoiceTax(inv)));
const getInvoicePaid = inv => toNumber(firstValue(inv, ['amountPaid', 'paidAmount', 'allocated'], 0));
const getInvoiceOutstanding = inv => {
    const explicit = firstValue(inv, ['balanceDue', 'outstandingAmount', 'dueAmount'], null);
    if (explicit !== null) return Math.max(toNumber(explicit), 0);
    if (normalize(getStatus(inv)).includes('paid')) return 0;
    return Math.max(getInvoiceAmount(inv) - getInvoicePaid(inv), 0);
};

const getLpoAmount = lpo => toNumber(firstValue(lpo, ['grandTotal', 'totalValue', 'totalAmount', 'value'], 0));
const getGrnAmount = grn => toNumber(firstValue(grn, ['grandTotal', 'value', 'totalAmount', 'subtotal'], 0));
const getPaymentAmount = payment => toNumber(firstValue(payment, ['amount', 'paidAmount', 'totalAmount'], 0));

const isCancelled = row => {
    const status = normalize(getStatus(row));
    return status.includes('cancel') || status.includes('reject') || status.includes('void');
};

const isSettled = row => {
    const status = normalize(getStatus(row));
    return status.includes('paid') || status.includes('settled') || status.includes('cleared') || status.includes('posted');
};

const isOpenInvoice = inv => getInvoiceOutstanding(inv) > 0 && !isCancelled(inv);

const dateInRange = (value, filters) => {
    const date = parseDate(value);
    if (!date) return true;
    const from = filters.dateFrom ? parseDate(filters.dateFrom) : null;
    const to = filters.dateTo ? endOfDay(parseDate(filters.dateTo)) : null;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
};

const vendorMatches = (row, vendorFilter) => {
    if (!vendorFilter || vendorFilter === 'All') return true;
    const value = normalize(vendorFilter);
    return [getVendorName(row), getVendorCode(row), row?.vendorId, row?.id]
        .some(candidate => normalize(candidate) === value);
};

const branchMatches = (row, branchFilter) => {
    if (!branchFilter || branchFilter === 'All') return true;
    const value = normalize(branchFilter);
    return [row?.branchId, row?.branchCode, row?.branchName, getBranchValue(row)]
        .some(candidate => normalize(candidate) === value);
};

const rowMatchesQuery = (row, query) => {
    if (!query) return true;
    const term = normalize(query);
    return JSON.stringify(row ?? {}).toLowerCase().includes(term);
};

const filterDocs = (rows, filters, options = {}) => rows.filter(row => {
    if (!vendorMatches(row, filters.vendor)) return false;
    if (!branchMatches(row, filters.branch)) return false;
    if (!rowMatchesQuery(options.queryRow ? options.queryRow(row) : row, filters.searchQuery)) return false;
    if (!dateInRange(options.dateValue ? options.dateValue(row) : getDocDate(row), filters)) return false;
    return true;
});

const uniqueBy = (rows, keyFn) => {
    const map = new Map();
    rows.forEach(row => {
        const key = keyFn(row);
        if (!map.has(key)) map.set(key, row);
    });
    return Array.from(map.values());
};

const makeCard = (label, value, sub = '', type = 'number') => ({ label, value, sub, type });

const emptyColumns = [
    { key: 'message', header: 'Message', type: 'text', width: 60 }
];

const unavailableReport = (report, message) => ({
    reportId: report.id,
    title: report.title,
    subtitle: report.description,
    cards: [],
    charts: [],
    columns: emptyColumns,
    rows: [],
    notes: [message]
});

const statusBadgeClass = (value) => {
    const status = normalize(value);
    if (status.includes('cancel') || status.includes('reject') || status.includes('fail') || status.includes('overdue') || status.includes('critical') || status.includes('bounce')) {
        return 'bg-red-50 text-red-700 border-red-200';
    }
    if (status.includes('pending') || status.includes('partial') || status.includes('hold') || status.includes('draft') || status.includes('warning') || status.includes('issued')) {
        return 'bg-orange-50 text-orange-700 border-orange-200';
    }
    if (status.includes('approved') || status.includes('posted') || status.includes('paid') || status.includes('settled') || status.includes('cleared') || status.includes('pass') || status.includes('active') || status.includes('received')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (status.includes('open') || status.includes('scheduled') || status.includes('submitted')) {
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
};

const classifyAging = (dateValue, asOf) => {
    const days = Math.max(daysBetween(dateValue, asOf), 0);
    if (days <= 0) return 'current';
    if (days <= 30) return 'd0_30';
    if (days <= 60) return 'd31_60';
    if (days <= 90) return 'd61_90';
    return 'd90';
};

const agingLabels = {
    current: 'Current',
    d0_30: '0-30',
    d31_60: '31-60',
    d61_90: '61-90',
    d90: '90+'
};

const bucketChart = (rows, keys = Object.keys(agingLabels)) =>
    keys.map(key => ({ name: agingLabels[key] || key, value: sumBy(rows, row => row[key]) })).filter(item => item.value > 0);

const groupByVendor = (rows, seedVendors = []) => {
    const map = new Map();
    seedVendors.forEach(vendor => {
        const name = getVendorName(vendor);
        if (name && name !== 'Unknown') {
            map.set(name, { vendor: name, vendorCode: getVendorCode(vendor), sourceVendor: vendor });
        }
    });
    rows.forEach(row => {
        const name = getVendorName(row);
        if (!map.has(name)) map.set(name, { vendor: name, vendorCode: getVendorCode(row) });
    });
    return map;
};

const buildColumns = (columns) => columns.map(column => ({
    width: 18,
    ...column,
    type: column.type || (MONEY_KEYS.has(column.key) ? 'currency' : 'text')
}));

const flattenLpoItems = (lpos) => lpos.flatMap(lpo => {
    const items = getItems(lpo);
    return items.map(item => ({
        source: 'LPO',
        documentNo: getLpoNumber(lpo),
        date: firstValue(lpo, ['lpoDate', 'date']),
        vendor: getVendorName(lpo),
        vendorCode: getVendorCode(lpo),
        branch: getBranchLabel(lpo),
        status: getStatus(lpo),
        itemCode: getItemCode(item),
        itemName: getItemName(item),
        qty: getLineQty(item),
        receivedQty: toNumber(firstValue(item, ['receivedQuantity', 'received', 'accepted'], 0)),
        rate: getLineRate(item),
        value: getLineTotal(item),
        rawItem: item,
        rawDocument: lpo
    }));
});

const flattenGrnItems = (grns) => grns.flatMap(grn => {
    const items = getItems(grn);
    return items.map(item => ({
        source: 'GRN',
        documentNo: getGrnNumber(grn),
        date: getDocDate(grn),
        vendor: getVendorName(grn),
        vendorCode: getVendorCode(grn),
        branch: getBranchLabel(grn),
        warehouse: getWarehouse(grn),
        status: getStatus(grn),
        itemCode: getItemCode(item),
        itemName: getItemName(item),
        lpoQty: toNumber(firstValue(item, ['lpoQty', 'orderedQuantity'], 0)),
        receivedQty: toNumber(firstValue(item, ['received', 'receivedQuantity', 'accepted'], 0)),
        acceptedQty: toNumber(firstValue(item, ['accepted', 'received', 'receivedQuantity'], 0)),
        rejectedQty: getLineRejectedQty(item),
        rate: getLineRate(item),
        value: getLineTotal(item),
        batch: firstValue(item, ['batch', 'batchNumber'], ''),
        expiryDate: firstValue(item, ['expiryDate', 'expDate'], ''),
        rawItem: item,
        rawDocument: grn
    }));
});

const flattenInvoiceItems = (invoices) => invoices.flatMap(invoice => {
    const items = getItems(invoice);
    return items.map(item => ({
        source: 'Invoice',
        documentNo: getInvoiceNumber(invoice),
        date: firstValue(invoice, ['invoiceDate', 'date']),
        vendor: getVendorName(invoice),
        vendorCode: getVendorCode(invoice),
        branch: getBranchLabel(invoice),
        status: getStatus(invoice),
        grnNo: firstValue(invoice, ['grnNo', 'referenceNo'], ''),
        lpoNo: firstValue(invoice, ['lpoId', 'lpoNumber', 'lpoNo'], ''),
        itemCode: getItemCode(item),
        itemName: getItemName(item),
        qty: getLineQty(item),
        rate: getLineRate(item),
        value: getLineTotal(item),
        tax: toNumber(firstValue(item, ['taxAmount', 'taxAmt'], 0)),
        rawItem: item,
        rawDocument: invoice
    }));
});

const flattenInvoiceBatches = (invoices) => invoices.flatMap(invoice => getItems(invoice).flatMap(item => {
    const batches = normalizeList(item?.batches || item?.batchAllocations);
    return batches.map(batch => ({
        invoiceNo: getInvoiceNumber(invoice),
        date: firstValue(invoice, ['invoiceDate', 'date']),
        vendor: getVendorName(invoice),
        branch: getBranchLabel(invoice),
        itemCode: getItemCode(item),
        itemName: getItemName(item),
        batchNo: firstValue(batch, ['batchNumber', 'batchNo', 'id'], '-'),
        expiryDate: firstValue(batch, ['expiryDate', 'expDate'], ''),
        qty: toNumber(firstValue(batch, ['quantity', 'qty'], 0)),
        unitCost: toNumber(firstValue(batch, ['unitCost', 'cost'], getLineRate(item))),
        value: toNumber(firstValue(batch, ['quantity', 'qty'], 0)) * toNumber(firstValue(batch, ['unitCost', 'cost'], getLineRate(item)))
    }));
}));

const findMatchedGrn = (invoice, grns) => {
    const refs = [
        invoice?.grnNo,
        invoice?.grnId,
        invoice?.referenceNo,
        invoice?.docRef
    ].map(normalize).filter(Boolean);
    if (refs.length === 0) return null;
    return grns.find(grn => [
        grn?.id,
        grn?.idDisplay,
        grn?.grnNo,
        grn?.referenceNo,
        grn?.docRef
    ].some(value => refs.includes(normalize(value)))) || null;
};

const findPaymentForInvoice = (invoice, payments) => {
    const refs = [
        invoice?.id,
        invoice?.invoiceNumber,
        invoice?.vendorInvoiceNo,
        invoice?.referenceNo
    ].map(normalize).filter(Boolean);
    return payments
        .filter(payment => [
            payment?.invoiceId,
            payment?.invoiceNumber,
            payment?.invoiceRef,
            payment?.referenceNumber
        ].some(value => refs.includes(normalize(value))))
        .sort((a, b) => (parseDate(b.paymentDate) || 0) - (parseDate(a.paymentDate) || 0))[0] || null;
};

const baseContext = (ctx) => {
    const vendors = filterDocs(ctx.sources.vendors, ctx.filters, {
        dateValue: () => null,
        queryRow: row => ({ name: getVendorName(row), code: getVendorCode(row), category: row.category, taxId: row.taxId })
    });
    const lpos = filterDocs(ctx.sources.lpos, ctx.filters, { dateValue: row => firstValue(row, ['lpoDate', 'date', 'createdAt']) });
    const grns = filterDocs(ctx.sources.grns, ctx.filters, { dateValue: row => getDocDate(row) });
    const invoices = filterDocs(ctx.sources.invoices, ctx.filters, { dateValue: row => firstValue(row, ['invoiceDate', 'date']) });
    const payments = filterDocs(ctx.sources.payments, ctx.filters, { dateValue: row => firstValue(row, ['paymentDate', 'voucherDate', 'date']) });
    return { ...ctx, vendors, lpos, grns, invoices, payments };
};

const buildVendorMaster = (report, ctx) => {
    const c = baseContext(ctx);
    const openInvoices = c.invoices.filter(isOpenInvoice);
    const outstandingByVendor = new Map();
    openInvoices.forEach(invoice => {
        const name = getVendorName(invoice);
        outstandingByVendor.set(name, (outstandingByVendor.get(name) || 0) + getInvoiceOutstanding(invoice));
    });

    const rows = c.vendors.map(vendor => {
        const name = getVendorName(vendor);
        return {
            code: getVendorCode(vendor) || '-',
            vendor: name,
            category: vendor.category || vendor.vendorGroup || vendor.vendorType || '-',
            contact: vendor.contact || vendor.phone || vendor.mobile || vendor.email || '-',
            taxId: vendor.taxId || vendor.trn || '-',
            paymentTerms: vendor.payTerms || vendor.paymentTerms || '-',
            creditLimit: toNumber(vendor.creditLimit),
            outstanding: outstandingByVendor.get(name) || toNumber(vendor.balance),
            leadTime: toNumber(vendor.leadTime, 0),
            rating: toNumber(vendor.rating, 0),
            status: getStatus(vendor)
        };
    });

    const categoryMap = new Map();
    rows.forEach(row => {
        const key = row.category || 'Unassigned';
        const current = categoryMap.get(key) || { name: key, creditLimit: 0, outstanding: 0 };
        current.creditLimit += row.creditLimit;
        current.outstanding += row.outstanding;
        categoryMap.set(key, current);
    });

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Live vendor master, outstanding balances and credit limits.',
        cards: [
            makeCard('Total Vendors', rows.length, 'Matching current filters'),
            makeCard('Total Outstanding', sumBy(rows, row => row.outstanding), 'Open AP exposure', 'currency'),
            makeCard('Total Credit Limit', sumBy(rows, row => row.creditLimit), 'Vendor master limits', 'currency'),
            makeCard('Active Vendors', rows.filter(row => normalize(row.status).includes('active') || row.status === '-').length, 'Available for purchase')
        ],
        charts: [
            {
                type: 'groupedBar',
                title: 'Outstanding vs Credit Limit by Category',
                data: Array.from(categoryMap.values()),
                series: [
                    { key: 'creditLimit', name: 'Credit Limit', color: '#dbe3ee' },
                    { key: 'outstanding', name: 'Outstanding', color: '#f5c742' }
                ]
            }
        ],
        columns: buildColumns([
            { key: 'code', header: 'Code' },
            { key: 'vendor', header: 'Vendor Name', width: 28 },
            { key: 'category', header: 'Category' },
            { key: 'contact', header: 'Contact', width: 26 },
            { key: 'taxId', header: 'TRN' },
            { key: 'paymentTerms', header: 'Payment Terms' },
            { key: 'creditLimit', header: 'Credit Limit', type: 'currency' },
            { key: 'outstanding', header: 'Outstanding', type: 'currency' },
            { key: 'leadTime', header: 'Lead Time', type: 'number' },
            { key: 'rating', header: 'Rating', type: 'number' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildVendorAging = (report, ctx) => {
    const c = baseContext(ctx);
    const asOf = c.filters.dateTo || isoDate();
    const rowsByVendor = groupByVendor(c.invoices.filter(isOpenInvoice), c.vendors);
    c.invoices.filter(isOpenInvoice).forEach(invoice => {
        const vendor = getVendorName(invoice);
        const row = rowsByVendor.get(vendor);
        const bucket = classifyAging(firstValue(invoice, ['dueDate', 'invoiceDate', 'date'], asOf), asOf);
        row.current = toNumber(row.current);
        row.d0_30 = toNumber(row.d0_30);
        row.d31_60 = toNumber(row.d31_60);
        row.d61_90 = toNumber(row.d61_90);
        row.d90 = toNumber(row.d90);
        row[bucket] += getInvoiceOutstanding(invoice);
        row.total = toNumber(row.total) + getInvoiceOutstanding(invoice);
    });

    const rows = Array.from(rowsByVendor.values())
        .map(row => ({
            vendor: row.vendor,
            current: toNumber(row.current),
            d0_30: toNumber(row.d0_30),
            d31_60: toNumber(row.d31_60),
            d61_90: toNumber(row.d61_90),
            d90: toNumber(row.d90),
            total: toNumber(row.total),
            status: row.total ? 'Open' : 'Clear'
        }))
        .filter(row => row.total > 0)
        .sort((a, b) => b.total - a.total);

    return {
        reportId: report.id,
        title: report.title,
        subtitle: `Open vendor invoices aged as of ${formatDate(asOf)}.`,
        cards: [
            makeCard('Total Payable', sumBy(rows, row => row.total), 'Open invoice balances', 'currency'),
            makeCard('0-30 Days', sumBy(rows, row => row.d0_30), 'Recent due items', 'currency'),
            makeCard('31-90 Days', sumBy(rows, row => row.d31_60 + row.d61_90), 'Needs follow-up', 'currency'),
            makeCard('90+ Days', sumBy(rows, row => row.d90), 'Overdue exposure', 'currency')
        ],
        charts: [{ type: 'pie', title: 'Aging Bucket Distribution', data: bucketChart(rows) }],
        columns: buildColumns([
            { key: 'vendor', header: 'Vendor', width: 28 },
            { key: 'current', header: 'Current', type: 'currency' },
            { key: 'd0_30', header: '0-30 Days', type: 'currency' },
            { key: 'd31_60', header: '31-60 Days', type: 'currency' },
            { key: 'd61_90', header: '61-90 Days', type: 'currency' },
            { key: 'd90', header: '90+ Days', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildVendorPerformance = (report, ctx) => {
    const c = baseContext(ctx);
    const vendorMap = groupByVendor([...c.lpos, ...c.grns, ...c.invoices], c.vendors);

    c.lpos.forEach(lpo => {
        const row = vendorMap.get(getVendorName(lpo));
        row.orders = toNumber(row.orders) + 1;
        row.orderValue = toNumber(row.orderValue) + getLpoAmount(lpo);
        const expected = firstValue(lpo, ['expectedDeliveryDate'], null);
        const refs = [getLpoNumber(lpo), lpo.dbId].map(normalize).filter(Boolean);
        const matchedGrns = c.grns.filter(grn => [
            grn.docRef,
            grn.referenceId,
            grn.lpoNumber,
            grn.lpoId
        ].some(value => refs.includes(normalize(value))));
        if (expected && matchedGrns.length > 0) {
            row.deliveries = toNumber(row.deliveries) + 1;
            const latest = matchedGrns.map(getDocDate).map(parseDate).filter(Boolean).sort((a, b) => b - a)[0];
            if (latest && latest <= endOfDay(parseDate(expected))) row.onTime = toNumber(row.onTime) + 1;
        }
    });

    flattenGrnItems(c.grns).forEach(line => {
        const row = vendorMap.get(line.vendor);
        row.receivedQty = toNumber(row.receivedQty) + line.receivedQty;
        row.rejectedQty = toNumber(row.rejectedQty) + line.rejectedQty;
    });

    c.invoices.forEach(invoice => {
        const row = vendorMap.get(getVendorName(invoice));
        row.invoiceValue = toNumber(row.invoiceValue) + getInvoiceAmount(invoice);
        const payment = findPaymentForInvoice(invoice, c.payments);
        if (payment || getInvoiceOutstanding(invoice) === 0) {
            row.settledInvoices = toNumber(row.settledInvoices) + 1;
            const paidDate = payment?.paymentDate || invoice.updatedAt || c.filters.dateTo || isoDate();
            row.settlementDays = toNumber(row.settlementDays) + Math.max(daysBetween(firstValue(invoice, ['invoiceDate', 'date'], paidDate), paidDate), 0);
        }
    });

    const rows = Array.from(vendorMap.values()).map(row => {
        const onTimePct = row.deliveries ? pct(row.onTime, row.deliveries) : 0;
        const returnPct = row.receivedQty ? pct(row.rejectedQty, row.receivedQty + row.rejectedQty) : 0;
        const avgSettleDays = row.settledInvoices ? round(row.settlementDays / row.settledInvoices, 1) : 0;
        const score = onTimePct >= 90 && returnPct <= 2 ? 'A' : onTimePct >= 75 && returnPct <= 5 ? 'B' : row.orders ? 'Review' : '-';
        return {
            vendor: row.vendor,
            orders: toNumber(row.orders),
            orderValue: toNumber(row.orderValue),
            onTimePct,
            returnPct,
            avgSettleDays,
            invoiceValue: toNumber(row.invoiceValue),
            score
        };
    }).filter(row => row.orders || row.invoiceValue || row.returnPct);

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'KPI tracking from LPO, GRN, invoice and payment records.',
        cards: [
            makeCard('Avg On-Time Delivery', rows.length ? sumBy(rows, row => row.onTimePct) / rows.length : 0, 'LPOs with matched GRNs', 'percent'),
            makeCard('Avg Rejection Rate', rows.length ? sumBy(rows, row => row.returnPct) / rows.length : 0, 'Rejected over received qty', 'percent'),
            makeCard('Avg Settlement Days', rows.length ? sumBy(rows, row => row.avgSettleDays) / rows.length : 0, 'Invoice to payment', 'number'),
            makeCard('Purchase Value', sumBy(rows, row => row.invoiceValue), 'Filtered invoices', 'currency')
        ],
        charts: [{
            type: 'groupedBar',
            title: 'On-Time % vs Rejection %',
            data: rows.map(row => ({ name: row.vendor, onTimePct: row.onTimePct, returnPct: row.returnPct })).slice(0, 8),
            series: [
                { key: 'onTimePct', name: 'On-Time %', color: '#f5c742' },
                { key: 'returnPct', name: 'Rejection %', color: '#f97316' }
            ]
        }],
        columns: buildColumns([
            { key: 'vendor', header: 'Vendor', width: 28 },
            { key: 'orders', header: 'Orders', type: 'number' },
            { key: 'orderValue', header: 'Order Value', type: 'currency' },
            { key: 'onTimePct', header: 'On-Time %', type: 'percent' },
            { key: 'returnPct', header: 'Reject %', type: 'percent' },
            { key: 'avgSettleDays', header: 'Settle Days', type: 'number' },
            { key: 'invoiceValue', header: 'Invoice Value', type: 'currency' },
            { key: 'score', header: 'Score', type: 'badge' }
        ]),
        rows,
        notes: ctx.sourceStatus.grnDetails === 'partial' ? ['Some GRN detail records could not be loaded, so rejection KPIs use the available GRN detail only.'] : []
    };
};

const buildVendorPriceHistory = (report, ctx) => {
    const c = baseContext(ctx);
    const lines = [
        ...flattenInvoiceItems(c.invoices),
        ...flattenGrnItems(c.grns),
        ...flattenLpoItems(c.lpos)
    ].filter(line => line.rate > 0 && rowMatchesQuery(line, c.filters.searchQuery));

    const map = new Map();
    lines.forEach(line => {
        const key = `${normalize(line.vendor)}::${normalize(line.itemCode || line.itemName)}`;
        if (!map.has(key)) {
            map.set(key, { vendor: line.vendor, itemCode: line.itemCode, itemName: line.itemName, purchases: [] });
        }
        map.get(key).purchases.push(line);
    });

    const rows = Array.from(map.values()).map(row => {
        const purchases = row.purchases
            .sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0))
            .slice(0, 5)
            .reverse();
        const first = purchases[0]?.rate || 0;
        const last = purchases[purchases.length - 1]?.rate || 0;
        return {
            item: row.itemName,
            sku: row.itemCode,
            vendor: row.vendor,
            p1: purchases[0]?.rate || 0,
            p2: purchases[1]?.rate || 0,
            p3: purchases[2]?.rate || 0,
            p4: purchases[3]?.rate || 0,
            p5: purchases[4]?.rate || 0,
            changePct: first ? pct(last - first, first) : 0,
            lastSource: purchases[purchases.length - 1]?.source || '-'
        };
    }).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Latest live purchase, GRN and invoice rates grouped by item/vendor.',
        cards: [
            makeCard('Items Tracked', rows.length, 'Item and vendor combinations'),
            makeCard('Avg Cost Change', rows.length ? sumBy(rows, row => row.changePct) / rows.length : 0, 'Across tracked lines', 'percent')
        ],
        charts: [{
            type: 'bar',
            title: 'Top Cost Movement %',
            data: rows.slice(0, 10).map(row => ({ name: row.item, value: row.changePct }))
        }],
        columns: buildColumns([
            { key: 'item', header: 'Item', width: 28 },
            { key: 'sku', header: 'SKU' },
            { key: 'vendor', header: 'Vendor', width: 24 },
            { key: 'p1', header: 'P1', type: 'currency' },
            { key: 'p2', header: 'P2', type: 'currency' },
            { key: 'p3', header: 'P3', type: 'currency' },
            { key: 'p4', header: 'P4', type: 'currency' },
            { key: 'p5', header: 'P5', type: 'currency' },
            { key: 'changePct', header: 'Change %', type: 'percent' },
            { key: 'lastSource', header: 'Last Source', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildLpoRegister = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.lpos.map(lpo => ({
        lpoNo: getLpoNumber(lpo),
        date: firstValue(lpo, ['lpoDate', 'date'], ''),
        vendor: getVendorName(lpo),
        branch: getBranchLabel(lpo),
        items: toNumber(firstValue(lpo, ['itemCount'], getItems(lpo).length)),
        totalValue: getLpoAmount(lpo),
        receivedPct: toNumber(firstValue(lpo, ['receivedPercentage'], 0)),
        expectedDeliveryDate: lpo.expectedDeliveryDate || '',
        status: getStatus(lpo),
        approvedBy: lpo.approvedBy || '-'
    }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Live purchase orders with approval and delivery status.',
        cards: [
            makeCard('Total LPO Value', sumBy(rows, row => row.totalValue), 'Filtered period', 'currency'),
            makeCard('Approved', rows.filter(row => normalize(row.status).includes('approved')).length, 'Orders'),
            makeCard('Pending / Partial', rows.filter(row => /pending|partial|draft/i.test(row.status)).length, 'Awaiting action')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'lpoNo', header: 'LPO No.', width: 20 },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'branch', header: 'Branch' },
            { key: 'items', header: 'Items', type: 'number' },
            { key: 'totalValue', header: 'Value', type: 'currency' },
            { key: 'receivedPct', header: 'Received %', type: 'percent' },
            { key: 'expectedDeliveryDate', header: 'Expected', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' },
            { key: 'approvedBy', header: 'Approved By', width: 24 }
        ]),
        rows,
        notes: []
    };
};

const buildLpoFulfillment = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.lpos.map(lpo => {
        const lines = flattenLpoItems([lpo]);
        const orderedQty = lines.length ? sumBy(lines, line => line.qty) : toNumber(firstValue(lpo, ['itemCount'], 0));
        const deliveredQty = lines.length ? sumBy(lines, line => line.receivedQty) : round(orderedQty * toNumber(lpo.receivedPercentage) / 100, 2);
        const orderedValue = getLpoAmount(lpo);
        const deliveredValue = orderedQty ? round(orderedValue * deliveredQty / orderedQty, 2) : 0;
        return {
            lpoNo: getLpoNumber(lpo),
            vendor: getVendorName(lpo),
            orderedQty,
            deliveredQty,
            pendingQty: Math.max(orderedQty - deliveredQty, 0),
            orderedValue,
            deliveredValue,
            fulfillmentPct: orderedQty ? pct(deliveredQty, orderedQty) : toNumber(lpo.receivedPercentage),
            status: getStatus(lpo)
        };
    });

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Ordered vs delivered quantities and value.',
        cards: [
            makeCard('Ordered Value', sumBy(rows, row => row.orderedValue), 'LPO total', 'currency'),
            makeCard('Delivered Value', sumBy(rows, row => row.deliveredValue), 'Estimated from received qty', 'currency'),
            makeCard('Average Fulfillment', rows.length ? sumBy(rows, row => row.fulfillmentPct) / rows.length : 0, 'Across LPOs', 'percent')
        ],
        charts: [{
            type: 'groupedBar',
            title: 'Ordered vs Delivered Value',
            data: rows.slice(0, 10).map(row => ({ name: row.lpoNo, orderedValue: row.orderedValue, deliveredValue: row.deliveredValue })),
            series: [
                { key: 'orderedValue', name: 'Ordered', color: '#dbe3ee' },
                { key: 'deliveredValue', name: 'Delivered', color: '#f5c742' }
            ]
        }],
        columns: buildColumns([
            { key: 'lpoNo', header: 'LPO No.' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'orderedQty', header: 'Ordered Qty', type: 'number' },
            { key: 'deliveredQty', header: 'Delivered Qty', type: 'number' },
            { key: 'pendingQty', header: 'Pending Qty', type: 'number' },
            { key: 'orderedValue', header: 'Ordered', type: 'currency' },
            { key: 'deliveredValue', header: 'Delivered', type: 'currency' },
            { key: 'fulfillmentPct', header: 'Fulfillment %', type: 'percent' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: ctx.sourceStatus.lpoDetails === 'partial' ? ['Some LPO detail records could not be loaded, so fulfillment uses summary received percentage where detail is missing.'] : []
    };
};

const buildLpoAging = (report, ctx) => {
    const c = baseContext(ctx);
    const asOf = c.filters.dateTo || isoDate();
    const rows = c.lpos
        .filter(lpo => !isCancelled(lpo) && toNumber(lpo.receivedPercentage) < 100 && !normalize(getStatus(lpo)).includes('closed'))
        .map(lpo => {
            const date = firstValue(lpo, ['expectedDeliveryDate', 'lpoDate', 'date'], asOf);
            const daysPending = Math.max(daysBetween(date, asOf), 0);
            return {
                lpoNo: getLpoNumber(lpo),
                vendor: getVendorName(lpo),
                issueDate: firstValue(lpo, ['lpoDate', 'date'], ''),
                expectedDate: firstValue(lpo, ['expectedDeliveryDate'], ''),
                daysPending,
                value: getLpoAmount(lpo),
                status: daysPending > 0 ? 'Overdue' : getStatus(lpo)
            };
        }).sort((a, b) => b.daysPending - a.daysPending);

    const chartData = [
        { name: '0-7 days', value: sumBy(rows.filter(row => row.daysPending <= 7), row => row.value) },
        { name: '8-15 days', value: sumBy(rows.filter(row => row.daysPending > 7 && row.daysPending <= 15), row => row.value) },
        { name: '16-30 days', value: sumBy(rows.filter(row => row.daysPending > 15 && row.daysPending <= 30), row => row.value) },
        { name: '31-60 days', value: sumBy(rows.filter(row => row.daysPending > 30 && row.daysPending <= 60), row => row.value) },
        { name: '60+ days', value: sumBy(rows.filter(row => row.daysPending > 60), row => row.value) }
    ].filter(item => item.value > 0);

    return {
        reportId: report.id,
        title: report.title,
        subtitle: `Pending LPO aging as of ${formatDate(asOf)}.`,
        cards: [
            makeCard('Pending LPO Value', sumBy(rows, row => row.value), 'Open purchase orders', 'currency'),
            makeCard('Overdue LPOs', rows.filter(row => row.status === 'Overdue').length, 'Expected date passed'),
            makeCard('Oldest Days Pending', Math.max(0, ...rows.map(row => row.daysPending)), 'Days')
        ],
        charts: [{ type: 'bar', title: 'Pending LPO by Aging Bucket', data: chartData }],
        columns: buildColumns([
            { key: 'lpoNo', header: 'LPO No.' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'issueDate', header: 'Issue Date', type: 'date' },
            { key: 'expectedDate', header: 'Expected Date', type: 'date' },
            { key: 'daysPending', header: 'Days Pending', type: 'number' },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildCancelledLpo = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.lpos.filter(isCancelled).map(lpo => ({
        lpoNo: getLpoNumber(lpo),
        vendor: getVendorName(lpo),
        date: firstValue(lpo, ['lpoDate', 'date'], ''),
        value: getLpoAmount(lpo),
        reason: lpo.cancelReason || lpo.rejectionReason || lpo.notes || '-',
        cancelledBy: lpo.cancelledBy || lpo.updatedBy || lpo.approvedBy || '-',
        status: getStatus(lpo)
    }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Cancelled and rejected purchase orders from live LPO status.',
        cards: [
            makeCard('Cancelled Value', sumBy(rows, row => row.value), 'Filtered LPOs', 'currency'),
            makeCard('Cancelled Orders', rows.length, 'Requires review')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'lpoNo', header: 'LPO No.' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'reason', header: 'Reason', width: 32 },
            { key: 'cancelledBy', header: 'Cancelled By', width: 24 },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildGrnRegister = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.grns.map(grn => ({
        grnNo: getGrnNumber(grn),
        date: getDocDate(grn),
        lpoRef: firstValue(grn, ['docRef', 'referenceId', 'lpoNumber'], '-'),
        vendor: getVendorName(grn),
        warehouse: getWarehouse(grn),
        items: toNumber(firstValue(grn, ['packageCount', 'packages'], getItems(grn).length)),
        qty: sumBy(flattenGrnItems([grn]), line => line.receivedQty),
        value: getGrnAmount(grn),
        qc: grn.qcStatus || '-',
        status: getStatus(grn)
    }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Live goods receipt notes with QC and warehouse status.',
        cards: [
            makeCard('Total Received Value', sumBy(rows, row => row.value), 'Filtered GRNs', 'currency'),
            makeCard('QC Passed', rows.filter(row => normalize(row.qc).includes('pass')).length, 'Receipts'),
            makeCard('QC Failed / On Hold', rows.filter(row => /fail|hold|reject/i.test(row.qc)).length, 'Needs action')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'grnNo', header: 'GRN No.' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'lpoRef', header: 'LPO Ref' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'warehouse', header: 'Warehouse' },
            { key: 'items', header: 'Items', type: 'number' },
            { key: 'qty', header: 'Qty', type: 'number' },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'qc', header: 'QC', type: 'badge' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildGrnVariance = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = flattenGrnItems(c.grns).map(line => {
        const qtyVar = line.receivedQty - line.lpoQty;
        const varianceValue = qtyVar * line.rate;
        return {
            grnNo: line.documentNo,
            vendor: line.vendor,
            item: line.itemName,
            lpoQty: line.lpoQty,
            grnQty: line.receivedQty,
            qtyVar,
            lpoRate: line.rate,
            grnRate: line.rate,
            varianceValue
        };
    }).filter(row => row.qtyVar !== 0 || row.varianceValue !== 0);

    const byVendor = new Map();
    rows.forEach(row => byVendor.set(row.vendor, (byVendor.get(row.vendor) || 0) + row.varianceValue));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Quantity and value differences based on GRN detail lines.',
        cards: [
            makeCard('Variance Lines', rows.length, 'Non-zero differences'),
            makeCard('Net Variance Value', sumBy(rows, row => row.varianceValue), 'GRN vs LPO', 'currency')
        ],
        charts: [{
            type: 'bar',
            title: 'Value Variance by Vendor',
            data: Array.from(byVendor.entries()).map(([name, value]) => ({ name, value }))
        }],
        columns: buildColumns([
            { key: 'grnNo', header: 'GRN No.' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'item', header: 'Item', width: 28 },
            { key: 'lpoQty', header: 'LPO Qty', type: 'number' },
            { key: 'grnQty', header: 'GRN Qty', type: 'number' },
            { key: 'qtyVar', header: 'Qty Var', type: 'number' },
            { key: 'lpoRate', header: 'LPO Rate', type: 'currency' },
            { key: 'grnRate', header: 'GRN Rate', type: 'currency' },
            { key: 'varianceValue', header: 'Variance Value', type: 'currency' }
        ]),
        rows,
        notes: ctx.sourceStatus.grnDetails === 'partial' ? ['Some GRN details could not be loaded, so this report includes only loaded GRN lines.'] : []
    };
};

const buildBatchExpiry = (report, ctx) => {
    const c = baseContext(ctx);
    const invoiceBatches = flattenInvoiceBatches(c.invoices);
    const grnBatches = flattenGrnItems(c.grns)
        .filter(line => line.batch || line.expiryDate)
        .map(line => ({
            invoiceNo: line.documentNo,
            date: line.date,
            vendor: line.vendor,
            branch: line.branch,
            itemCode: line.itemCode,
            itemName: line.itemName,
            batchNo: line.batch || '-',
            expiryDate: line.expiryDate,
            qty: line.receivedQty,
            unitCost: line.rate,
            value: line.value
        }));
    const rows = uniqueBy([...invoiceBatches, ...grnBatches], row => `${row.invoiceNo}-${row.itemCode}-${row.batchNo}-${row.expiryDate}`)
        .filter(row => rowMatchesQuery(row, c.filters.searchQuery))
        .map(row => {
            const daysToExpiry = row.expiryDate ? daysBetween(c.filters.dateTo || isoDate(), row.expiryDate) : null;
            return {
                ...row,
                daysToExpiry: daysToExpiry === null ? '' : daysToExpiry,
                status: daysToExpiry === null ? 'No Expiry' : daysToExpiry < 0 ? 'Expired' : daysToExpiry <= 30 ? 'Near Expiry' : 'Active'
            };
        });

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Batch and expiry monitoring from invoice/GRN item batches.',
        cards: [
            makeCard('Total Batches', rows.length, 'Matching filters'),
            makeCard('Near Expiry', rows.filter(row => row.status === 'Near Expiry').length, '<= 30 days'),
            makeCard('Expired', rows.filter(row => row.status === 'Expired').length, 'Past expiry date')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'invoiceNo', header: 'Source Doc' },
            { key: 'itemName', header: 'Item', width: 30 },
            { key: 'batchNo', header: 'Batch No.' },
            { key: 'expiryDate', header: 'Expiry Date', type: 'date' },
            { key: 'qty', header: 'Qty', type: 'number' },
            { key: 'unitCost', header: 'Unit Cost', type: 'currency' },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'daysToExpiry', header: 'Days to Expiry', type: 'number' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: rows.length === 0 ? ['No batch or expiry records were returned by the current purchase APIs for these filters.'] : []
    };
};

const buildQcRejection = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = flattenGrnItems(c.grns)
        .filter(line => line.rejectedQty > 0 || normalize(line.status).includes('reject') || normalize(line.rawDocument?.qcStatus).includes('fail'))
        .map(line => ({
            grnNo: line.documentNo,
            vendor: line.vendor,
            item: line.itemName,
            rejectedQty: line.rejectedQty,
            reason: firstValue(line.rawItem, ['rejectionReason', 'reason'], firstValue(line.rawDocument, ['rejectionReason', 'qcRemarks'], 'QC Rejected')),
            value: line.rejectedQty * line.rate,
            action: firstValue(line.rawItem, ['action'], '-'),
            status: line.rawDocument?.qcStatus || line.status
        }));

    const reasonMap = new Map();
    rows.forEach(row => reasonMap.set(row.reason, (reasonMap.get(row.reason) || 0) + row.value));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Rejected or failed QC lines from live GRN details.',
        cards: [
            makeCard('Rejected Lines', rows.length, 'GRN detail rows'),
            makeCard('Rejected Value', sumBy(rows, row => row.value), 'Estimated at GRN unit cost', 'currency')
        ],
        charts: [{
            type: 'pie',
            title: 'Rejections by Reason',
            data: Array.from(reasonMap.entries()).map(([name, value]) => ({ name, value }))
        }],
        columns: buildColumns([
            { key: 'grnNo', header: 'GRN No.' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'item', header: 'Item', width: 30 },
            { key: 'rejectedQty', header: 'Rejected Qty', type: 'number' },
            { key: 'reason', header: 'Reason', width: 26 },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'action', header: 'Action' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildInvoiceRegister = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.invoices.map(invoice => ({
        invoiceNo: getInvoiceNumber(invoice),
        vendorInvoiceNo: invoice.vendorInvoiceNo || '-',
        date: firstValue(invoice, ['invoiceDate', 'date'], ''),
        vendor: getVendorName(invoice),
        grnRef: firstValue(invoice, ['grnNo', 'referenceNo'], '-'),
        lpoRef: firstValue(invoice, ['lpoId', 'lpoNumber', 'lpoNo'], '-'),
        taxable: getInvoiceTaxable(invoice),
        tax: getInvoiceTax(invoice),
        total: getInvoiceAmount(invoice),
        paid: getInvoicePaid(invoice),
        balanceDue: getInvoiceOutstanding(invoice),
        dueDate: invoice.dueDate || '',
        status: getStatus(invoice)
    }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Live vendor invoices with VAT and linked GRN/LPO references.',
        cards: [
            makeCard('Total Invoice Value', sumBy(rows, row => row.total), 'Gross value', 'currency'),
            makeCard('Input VAT', sumBy(rows, row => row.tax), 'Recoverable VAT', 'currency'),
            makeCard('Outstanding', sumBy(rows, row => row.balanceDue), 'Balance due', 'currency'),
            makeCard('On Hold / Draft', rows.filter(row => /hold|draft/i.test(row.status)).length, 'Awaiting clearance')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'invoiceNo', header: 'Invoice No.' },
            { key: 'vendorInvoiceNo', header: 'Vendor Invoice' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'grnRef', header: 'GRN Ref' },
            { key: 'lpoRef', header: 'LPO Ref' },
            { key: 'taxable', header: 'Taxable', type: 'currency' },
            { key: 'tax', header: 'VAT', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' },
            { key: 'paid', header: 'Paid', type: 'currency' },
            { key: 'balanceDue', header: 'Balance Due', type: 'currency' },
            { key: 'dueDate', header: 'Due Date', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildInvoiceGrnVariance = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = [];
    c.invoices.forEach(invoice => {
        const grn = findMatchedGrn(invoice, c.grns);
        if (!grn) return;
        const invoiceLines = flattenInvoiceItems([invoice]);
        const grnLines = flattenGrnItems([grn]);
        invoiceLines.forEach(line => {
            const matched = grnLines.find(grnLine => normalize(grnLine.itemCode) === normalize(line.itemCode) || normalize(grnLine.itemName) === normalize(line.itemName));
            if (!matched) return;
            const qtyVar = line.qty - matched.receivedQty;
            const rateVar = line.rate - matched.rate;
            rows.push({
                invoiceNo: line.documentNo,
                vendor: line.vendor,
                grnNo: matched.documentNo,
                item: line.itemName,
                invoiceQty: line.qty,
                grnQty: matched.receivedQty,
                qtyVar,
                invoiceRate: line.rate,
                grnRate: matched.rate,
                varianceValue: qtyVar * line.rate + rateVar * line.qty
            });
        });
    });

    const filteredRows = rows.filter(row => row.qtyVar !== 0 || round(row.invoiceRate - row.grnRate, 4) !== 0 || round(row.varianceValue, 2) !== 0);
    const vendorMap = new Map();
    filteredRows.forEach(row => vendorMap.set(row.vendor, (vendorMap.get(row.vendor) || 0) + row.varianceValue));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Rate and quantity differences between invoices and matched GRNs.',
        cards: [
            makeCard('Variance Lines', filteredRows.length, 'Non-zero differences'),
            makeCard('Net Variance Value', sumBy(filteredRows, row => row.varianceValue), 'Invoice vs GRN', 'currency')
        ],
        charts: [{
            type: 'bar',
            title: 'Value Variance by Vendor',
            data: Array.from(vendorMap.entries()).map(([name, value]) => ({ name, value }))
        }],
        columns: buildColumns([
            { key: 'invoiceNo', header: 'Invoice No.' },
            { key: 'vendor', header: 'Vendor', width: 24 },
            { key: 'grnNo', header: 'GRN No.' },
            { key: 'item', header: 'Item', width: 28 },
            { key: 'invoiceQty', header: 'Inv Qty', type: 'number' },
            { key: 'grnQty', header: 'GRN Qty', type: 'number' },
            { key: 'qtyVar', header: 'Qty Var', type: 'number' },
            { key: 'invoiceRate', header: 'Inv Rate', type: 'currency' },
            { key: 'grnRate', header: 'GRN Rate', type: 'currency' },
            { key: 'varianceValue', header: 'Variance', type: 'currency' }
        ]),
        rows: filteredRows,
        notes: filteredRows.length === 0 ? ['No invoice/GRN variances were found from the currently linked invoice and GRN records.'] : []
    };
};

const buildLandedCost = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.invoices.map(invoice => {
        const freight = toNumber(invoice.freight);
        const customs = toNumber(invoice.customsDuty);
        const handling = toNumber(invoice.handling);
        const insurance = toNumber(invoice.insurance);
        const clearing = toNumber(invoice.clearing);
        const otherCosts = toNumber(invoice.otherCosts);
        const landedCost = freight + customs + handling + insurance + clearing + otherCosts;
        return {
            invoiceNo: getInvoiceNumber(invoice),
            vendor: getVendorName(invoice),
            invoiceAmount: getInvoiceAmount(invoice),
            freight,
            customs,
            handling,
            insurance,
            clearing,
            otherCosts,
            landedCost,
            netLandedCost: getInvoiceAmount(invoice) + landedCost
        };
    }).filter(row => row.landedCost > 0);

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Landed cost components captured on live purchase invoices.',
        cards: [
            makeCard('Invoice Value', sumBy(rows, row => row.invoiceAmount), 'Before landed cost', 'currency'),
            makeCard('Landed Costs', sumBy(rows, row => row.landedCost), 'Freight, customs, handling and other', 'currency'),
            makeCard('Net Landed Cost', sumBy(rows, row => row.netLandedCost), 'Invoice plus landed cost', 'currency')
        ],
        charts: [{
            type: 'stackedBar',
            title: 'Cost Component Breakdown',
            data: rows.map(row => ({
                name: row.vendor,
                invoiceAmount: row.invoiceAmount,
                freight: row.freight,
                customs: row.customs,
                handling: row.handling,
                otherCosts: row.insurance + row.clearing + row.otherCosts
            })),
            series: [
                { key: 'invoiceAmount', name: 'Invoice', color: '#f5c742' },
                { key: 'freight', name: 'Freight', color: '#3b82f6' },
                { key: 'customs', name: 'Customs', color: '#f97316' },
                { key: 'handling', name: 'Handling', color: '#10b981' },
                { key: 'otherCosts', name: 'Other', color: '#8b5cf6' }
            ]
        }],
        columns: buildColumns([
            { key: 'invoiceNo', header: 'Invoice No.' },
            { key: 'vendor', header: 'Vendor', width: 24 },
            { key: 'invoiceAmount', header: 'Invoice', type: 'currency' },
            { key: 'freight', header: 'Freight', type: 'currency' },
            { key: 'customs', header: 'Customs', type: 'currency' },
            { key: 'handling', header: 'Handling', type: 'currency' },
            { key: 'insurance', header: 'Insurance', type: 'currency' },
            { key: 'clearing', header: 'Clearing', type: 'currency' },
            { key: 'otherCosts', header: 'Other', type: 'currency' },
            { key: 'landedCost', header: 'Landed Cost', type: 'currency' },
            { key: 'netLandedCost', header: 'NLC', type: 'currency' }
        ]),
        rows,
        notes: rows.length === 0 ? ['No landed cost components were found on the purchase invoices returned by the current filters.'] : []
    };
};

const findClosedPeriod = (dateValue, periods) => {
    const date = parseDate(dateValue);
    if (!date) return null;
    return periods.find(period => {
        if (!normalize(period.status).includes('closed')) return false;
        const start = parseDate(period.startDate);
        const end = endOfDay(parseDate(period.endDate));
        return start && end && date >= start && date <= end;
    }) || null;
};

const buildBackdatedInvoice = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.invoices.map(invoice => {
        const txDate = firstValue(invoice, ['invoiceDate', 'vendorInvoiceDate', 'date'], '');
        const postDate = firstValue(invoice, ['postedAt', 'createdAt', 'updatedAt'], '');
        const txMonth = txDate ? String(txDate).slice(0, 7) : '';
        const postMonth = postDate ? String(postDate).slice(0, 7) : '';
        const closedPeriod = findClosedPeriod(txDate, c.sources.periods);
        const backdated = Boolean(txMonth && postMonth && txMonth < postMonth);
        const closedViolation = Boolean(closedPeriod && postDate && parseDate(postDate) > (parseDate(closedPeriod.closedAt) || parseDate(closedPeriod.endDate)));
        return {
            invoiceNo: getInvoiceNumber(invoice),
            invoiceDate: txDate,
            postDate,
            vendor: getVendorName(invoice),
            value: getInvoiceAmount(invoice),
            postedBy: invoice.postedBy || invoice.createdBy || '-',
            lockedPeriod: closedPeriod?.periodName || '-',
            status: closedViolation ? 'Closed Period' : backdated ? 'Backdated' : 'OK'
        };
    }).filter(row => row.status !== 'OK');

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Invoices whose post date falls after transaction month or a closed accounting period.',
        cards: [
            makeCard('Backdated Invoices', rows.length, 'Detected from live dates'),
            makeCard('Backdated Value', sumBy(rows, row => row.value), 'Financial impact', 'currency')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'invoiceNo', header: 'Invoice No.' },
            { key: 'invoiceDate', header: 'Invoice Date', type: 'date' },
            { key: 'postDate', header: 'Post Date', type: 'date' },
            { key: 'vendor', header: 'Vendor', width: 24 },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'postedBy', header: 'Posted By', width: 24 },
            { key: 'lockedPeriod', header: 'Locked Period' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: c.sources.periods.length === 0 ? ['Accounting period data was not available, so this report only compares invoice date vs post/created date.'] : []
    };
};

const buildPaymentVoucherRegister = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.payments.map(payment => ({
        pvNo: getPaymentNumber(payment),
        date: firstValue(payment, ['paymentDate', 'voucherDate', 'date'], ''),
        vendor: getVendorName(payment),
        invoiceRef: firstValue(payment, ['invoiceNumber', 'invoiceRef', 'invoiceId'], '-'),
        mode: payment.paymentMode || payment.mode || '-',
        bank: payment.bankAccount || payment.bankName || '-',
        amount: getPaymentAmount(payment),
        allocated: toNumber(payment.allocated),
        unallocated: toNumber(payment.unallocated),
        status: getStatus(payment)
    }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Live vendor payment vouchers with mode and bank details.',
        cards: [
            makeCard('Total Payments', sumBy(rows, row => row.amount), 'Filtered period', 'currency'),
            makeCard('Bank Transfers', rows.filter(row => normalize(row.mode).includes('bank') || normalize(row.mode).includes('transfer')).length, 'Transactions'),
            makeCard('Cheque / PDC', rows.filter(row => /cheque|check|pdc/i.test(row.mode)).length, 'Instruments')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'pvNo', header: 'PV No.' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'invoiceRef', header: 'Invoice Ref' },
            { key: 'mode', header: 'Mode', type: 'badge' },
            { key: 'bank', header: 'Bank' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'allocated', header: 'Allocated', type: 'currency' },
            { key: 'unallocated', header: 'Unallocated', type: 'currency' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildPaymentAgingDelay = (report, ctx) => {
    const c = baseContext(ctx);
    const asOf = c.filters.dateTo || isoDate();
    const map = new Map();

    c.invoices.forEach(invoice => {
        const vendor = getVendorName(invoice);
        if (!map.has(vendor)) map.set(vendor, { vendor, current: 0, d0_30: 0, d31_60: 0, d60: 0, total: 0, delayDays: [] });
        const row = map.get(vendor);
        const outstanding = getInvoiceOutstanding(invoice);
        if (outstanding > 0) {
            const days = Math.max(daysBetween(firstValue(invoice, ['dueDate', 'invoiceDate'], asOf), asOf), 0);
            if (days <= 0) row.current += outstanding;
            else if (days <= 30) row.d0_30 += outstanding;
            else if (days <= 60) row.d31_60 += outstanding;
            else row.d60 += outstanding;
            row.total += outstanding;
            row.delayDays.push(days);
        } else {
            const payment = findPaymentForInvoice(invoice, c.payments);
            if (payment && invoice.dueDate) row.delayDays.push(Math.max(daysBetween(invoice.dueDate, payment.paymentDate), 0));
        }
    });

    const rows = Array.from(map.values()).map(row => ({
        vendor: row.vendor,
        total: row.total,
        current: row.current,
        d0_30: row.d0_30,
        d31_60: row.d31_60,
        d60: row.d60,
        avgDelayDays: row.delayDays.length ? round(sumBy(row.delayDays, value => value) / row.delayDays.length, 1) : 0
    })).filter(row => row.total || row.avgDelayDays).sort((a, b) => b.total - a.total);

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Due date vs payment/as-of delay by vendor.',
        cards: [
            makeCard('Outstanding Payable', sumBy(rows, row => row.total), 'Open invoices', 'currency'),
            makeCard('60+ Days', sumBy(rows, row => row.d60), 'Overdue exposure', 'currency'),
            makeCard('Average Delay', rows.length ? sumBy(rows, row => row.avgDelayDays) / rows.length : 0, 'Days', 'number')
        ],
        charts: [{
            type: 'stackedBar',
            title: 'Aging Distribution by Vendor',
            data: rows.slice(0, 8),
            series: [
                { key: 'current', name: 'Current', color: '#10b981' },
                { key: 'd0_30', name: '0-30', color: '#f5c742' },
                { key: 'd31_60', name: '31-60', color: '#f97316' },
                { key: 'd60', name: '60+', color: '#ef4444' }
            ]
        }],
        columns: buildColumns([
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'total', header: 'Total', type: 'currency' },
            { key: 'current', header: 'Current', type: 'currency' },
            { key: 'd0_30', header: '0-30d', type: 'currency' },
            { key: 'd31_60', header: '31-60d', type: 'currency' },
            { key: 'd60', header: '60+d', type: 'currency' },
            { key: 'avgDelayDays', header: 'Avg Delay', type: 'number' }
        ]),
        rows,
        notes: []
    };
};

const buildChequeTracking = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.payments
        .filter(payment => /cheque|check|pdc/i.test(payment.paymentMode || payment.mode || '') || payment.chequeDate || payment.chequeNumber)
        .map(payment => ({
            chequeNo: payment.chequeNumber || payment.referenceNumber || getPaymentNumber(payment),
            vendor: getVendorName(payment),
            bank: payment.bankAccount || payment.bankName || '-',
            branch: getBranchLabel(payment),
            amount: getPaymentAmount(payment),
            chequeDate: payment.chequeDate || firstValue(payment, ['paymentDate', 'date'], ''),
            pvNo: getPaymentNumber(payment),
            clearedDate: payment.clearedDate || payment.updatedAt || '',
            status: getStatus(payment)
        }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Cheque and PDC payments from live payment vouchers.',
        cards: [
            makeCard('Total Cheque Value', sumBy(rows, row => row.amount), 'All instruments', 'currency'),
            makeCard('Cleared', rows.filter(row => normalize(row.status).includes('clear') || normalize(row.status).includes('paid')).length, 'Cheques'),
            makeCard('Pending / Bounced', rows.filter(row => /pending|bounce|draft/i.test(row.status)).length, 'Requires attention')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'chequeNo', header: 'Cheque No.' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'bank', header: 'Bank' },
            { key: 'branch', header: 'Branch' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'chequeDate', header: 'Cheque Date', type: 'date' },
            { key: 'pvNo', header: 'PV No.' },
            { key: 'clearedDate', header: 'Cleared Date', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildAdvanceUtilization = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.lpos
        .filter(lpo => toNumber(lpo.advancePaid) > 0 || toNumber(lpo.balanceDue) > 0)
        .map(lpo => ({
            lpoNo: getLpoNumber(lpo),
            vendor: getVendorName(lpo),
            advanceDate: firstValue(lpo, ['lpoDate', 'date'], ''),
            advance: toNumber(lpo.advancePaid),
            adjusted: Math.max(toNumber(lpo.advancePaid) - toNumber(lpo.balanceDue), 0),
            balance: toNumber(lpo.balanceDue),
            lastAdjustment: lpo.updatedAt || '',
            status: getStatus(lpo)
        }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'LPO advances and remaining balances from live order records.',
        cards: [
            makeCard('Total Advances', sumBy(rows, row => row.advance), 'Given to vendors', 'currency'),
            makeCard('Adjusted', sumBy(rows, row => row.adjusted), 'Applied to LPOs', 'currency'),
            makeCard('Unadjusted Balance', sumBy(rows, row => row.balance), 'Remaining', 'currency')
        ],
        charts: [{
            type: 'groupedBar',
            title: 'Advance vs Adjusted vs Balance',
            data: rows.slice(0, 8).map(row => ({ name: row.vendor, advance: row.advance, adjusted: row.adjusted, balance: row.balance })),
            series: [
                { key: 'advance', name: 'Advance', color: '#f5c742' },
                { key: 'adjusted', name: 'Adjusted', color: '#10b981' },
                { key: 'balance', name: 'Balance', color: '#f97316' }
            ]
        }],
        columns: buildColumns([
            { key: 'lpoNo', header: 'LPO No.' },
            { key: 'vendor', header: 'Vendor', width: 24 },
            { key: 'advanceDate', header: 'Advance Date', type: 'date' },
            { key: 'advance', header: 'Advance', type: 'currency' },
            { key: 'adjusted', header: 'Adjusted', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' },
            { key: 'lastAdjustment', header: 'Last Adjustment', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' }
        ]),
        rows,
        notes: rows.length === 0 ? ['No LPO advances or unadjusted balances were returned by the current filters.'] : []
    };
};

const buildVatInputRegister = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = c.invoices
        .filter(invoice => getInvoiceTax(invoice) > 0 || getInvoiceTaxable(invoice) > 0)
        .map(invoice => ({
            invoiceNo: getInvoiceNumber(invoice),
            date: firstValue(invoice, ['invoiceDate', 'date'], ''),
            vendor: getVendorName(invoice),
            trn: invoice.vendorTrn || invoice.trn || invoice.taxId || '-',
            taxable: getInvoiceTaxable(invoice),
            tax: getInvoiceTax(invoice),
            total: getInvoiceAmount(invoice),
            vatRate: getInvoiceTaxable(invoice) ? pct(getInvoiceTax(invoice), getInvoiceTaxable(invoice)) : 0,
            period: firstValue(invoice, ['taxPeriod'], String(firstValue(invoice, ['invoiceDate', 'date'], '')).slice(0, 7))
        }));

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Input tax register for FTA filing from live purchase invoices.',
        cards: [
            makeCard('Taxable Value', sumBy(rows, row => row.taxable), 'Excluding VAT', 'currency'),
            makeCard('Input VAT', sumBy(rows, row => row.tax), 'Recoverable VAT', 'currency'),
            makeCard('Total Incl. VAT', sumBy(rows, row => row.total), 'Gross', 'currency')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'invoiceNo', header: 'Invoice No.' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'trn', header: 'TRN' },
            { key: 'taxable', header: 'Taxable', type: 'currency' },
            { key: 'tax', header: 'VAT', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' },
            { key: 'vatRate', header: 'VAT Rate', type: 'percent' },
            { key: 'period', header: 'Period' }
        ]),
        rows,
        notes: []
    };
};

const buildPeriodLockViolation = (report, ctx) => {
    const c = baseContext(ctx);
    if (c.sources.periods.length === 0) {
        return unavailableReport(report, 'No live accounting-period records are available, so closed-period purchase postings cannot be verified.');
    }

    const docs = [
        ...c.invoices.map(row => ({ type: 'Purchase Invoice', refNo: getInvoiceNumber(row), txDate: firstValue(row, ['invoiceDate', 'date']), postDate: firstValue(row, ['postedAt', 'createdAt', 'updatedAt']), user: row.postedBy || row.createdBy || '-', value: getInvoiceAmount(row) })),
        ...c.grns.map(row => ({ type: 'GRN', refNo: getGrnNumber(row), txDate: getDocDate(row), postDate: firstValue(row, ['postedAt', 'createdAt', 'updatedAt']), user: row.postedBy || row.receivedBy || '-', value: getGrnAmount(row) })),
        ...c.payments.map(row => ({ type: 'Payment Voucher', refNo: getPaymentNumber(row), txDate: firstValue(row, ['paymentDate', 'date']), postDate: firstValue(row, ['postedAt', 'createdAt', 'updatedAt']), user: row.postedBy || row.createdBy || '-', value: getPaymentAmount(row) }))
    ];

    const rows = docs.map(doc => {
        const period = findClosedPeriod(doc.txDate, c.sources.periods);
        if (!period) return null;
        return {
            refNo: doc.refNo,
            type: doc.type,
            transactionDate: doc.txDate,
            postDate: doc.postDate,
            lockedPeriod: period.periodName || `${formatDate(period.startDate)} - ${formatDate(period.endDate)}`,
            user: doc.user,
            value: doc.value,
            reason: 'Document date falls inside a closed period'
        };
    }).filter(Boolean);

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Purchase-side documents dated inside closed accounting periods.',
        cards: [
            makeCard('Total Violations', rows.length, 'Closed-period documents'),
            makeCard('Periods Breached', new Set(rows.map(row => row.lockedPeriod)).size, 'Unique periods'),
            makeCard('Value at Risk', sumBy(rows, row => row.value), 'Filtered documents', 'currency')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'refNo', header: 'Ref No.' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'transactionDate', header: 'Transaction Date', type: 'date' },
            { key: 'postDate', header: 'Post Date', type: 'date' },
            { key: 'lockedPeriod', header: 'Locked Period', type: 'badge' },
            { key: 'user', header: 'User', width: 24 },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'reason', header: 'Reason', width: 34 }
        ]),
        rows,
        notes: []
    };
};

const buildMissingDocument = (report, ctx) => {
    const c = baseContext(ctx);
    const rows = [];

    c.grns.forEach(grn => {
        const hasInvoice = c.invoices.some(inv => normalize(inv.grnNo) === normalize(getGrnNumber(grn)) || normalize(inv.referenceNo) === normalize(getGrnNumber(grn)));
        if (!hasInvoice && !isCancelled(grn)) {
            rows.push({
                refNo: getGrnNumber(grn),
                issueType: 'GRN without Invoice',
                vendor: getVendorName(grn),
                date: getDocDate(grn),
                value: getGrnAmount(grn),
                daysOpen: Math.max(daysBetween(getDocDate(grn), c.filters.dateTo || isoDate()), 0),
                priority: getGrnAmount(grn) > 0 ? 'Warning' : 'Info'
            });
        }
    });

    c.invoices.forEach(invoice => {
        if (!firstValue(invoice, ['grnNo', 'grnId', 'referenceNo'], '') && !isCancelled(invoice)) {
            rows.push({
                refNo: getInvoiceNumber(invoice),
                issueType: 'Invoice without GRN',
                vendor: getVendorName(invoice),
                date: firstValue(invoice, ['invoiceDate', 'date'], ''),
                value: getInvoiceAmount(invoice),
                daysOpen: Math.max(daysBetween(firstValue(invoice, ['invoiceDate', 'date'], ''), c.filters.dateTo || isoDate()), 0),
                priority: 'Warning'
            });
        }
    });

    c.payments.forEach(payment => {
        if (!firstValue(payment, ['invoiceId', 'invoiceNumber', 'invoiceRef'], '') && !isCancelled(payment)) {
            rows.push({
                refNo: getPaymentNumber(payment),
                issueType: 'Payment without Invoice Link',
                vendor: getVendorName(payment),
                date: firstValue(payment, ['paymentDate', 'date'], ''),
                value: getPaymentAmount(payment),
                daysOpen: Math.max(daysBetween(firstValue(payment, ['paymentDate', 'date'], ''), c.filters.dateTo || isoDate()), 0),
                priority: 'Critical'
            });
        }
    });

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Missing links across GRN, invoice and payment records.',
        cards: [
            makeCard('Total Issues', rows.length, 'Open items'),
            makeCard('Critical', rows.filter(row => row.priority === 'Critical').length, 'High priority'),
            makeCard('Value at Risk', sumBy(rows, row => row.value), 'Unverified transactions', 'currency')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'refNo', header: 'Ref No.' },
            { key: 'issueType', header: 'Issue Type', width: 30 },
            { key: 'vendor', header: 'Vendor', width: 26 },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'value', header: 'Value', type: 'currency' },
            { key: 'daysOpen', header: 'Days Open', type: 'number' },
            { key: 'priority', header: 'Priority', type: 'badge' }
        ]),
        rows,
        notes: []
    };
};

const buildAuditTrail = (report, ctx) => {
    const purchaseWords = ['purchase', 'vendor', 'lpo', 'grn', 'voucher', 'invoice', 'payment', 'debit'];
    const rows = filterDocs(ctx.sources.auditLogs, ctx.filters, {
        dateValue: row => firstValue(row, ['timestamp', 'createdAt', 'actionTime']),
        queryRow: row => row
    })
        .filter(row => {
            const haystack = JSON.stringify(row).toLowerCase();
            return purchaseWords.some(word => haystack.includes(word));
        })
        .map(row => ({
            timestamp: firstValue(row, ['timestamp', 'createdAt', 'actionTime'], ''),
            user: firstValue(row, ['user', 'username', 'performedBy', 'createdBy'], '-'),
            action: firstValue(row, ['action', 'event', 'operation'], '-'),
            module: firstValue(row, ['module', 'sourceDocumentType', 'entityType'], '-'),
            refNo: firstValue(row, ['sourceDocumentId', 'documentNo', 'referenceNo', 'entityId'], '-'),
            field: firstValue(row, ['field', 'fieldName'], '-'),
            before: firstValue(row, ['before', 'oldValue', 'previousValue'], '-'),
            after: firstValue(row, ['after', 'newValue', 'currentValue'], '-')
        }));

    if (ctx.sourceStatus.auditLogs === 'failed') {
        return unavailableReport(report, 'The audit-log endpoint could not be loaded for this session, so purchase audit rows are not displayed.');
    }

    return {
        reportId: report.id,
        title: report.title,
        subtitle: 'Purchase-related user actions from the system audit log.',
        cards: [
            makeCard('Total Actions', rows.length, 'Filtered audit records'),
            makeCard('Edit / Delete Actions', rows.filter(row => /edit|update|delete|remove/i.test(row.action)).length, 'Higher-risk actions'),
            makeCard('Users Active', new Set(rows.map(row => row.user)).size, 'Unique users')
        ],
        charts: [],
        columns: buildColumns([
            { key: 'timestamp', header: 'Timestamp', type: 'date' },
            { key: 'user', header: 'User', width: 24 },
            { key: 'action', header: 'Action', type: 'badge' },
            { key: 'module', header: 'Module' },
            { key: 'refNo', header: 'Ref No.' },
            { key: 'field', header: 'Field' },
            { key: 'before', header: 'Before' },
            { key: 'after', header: 'After' }
        ]),
        rows,
        notes: rows.length === 0 ? ['No purchase-related audit entries matched the current filters.'] : []
    };
};

const unsupportedSourceMessage = (name) =>
    `No live ${name} API is exposed in this repository yet. This report is intentionally empty instead of showing mock data.`;

const REPORT_BUILDERS = {
    'vendor-master': buildVendorMaster,
    'vendor-aging': buildVendorAging,
    'vendor-performance': buildVendorPerformance,
    'vendor-price-history': buildVendorPriceHistory,
    'vendor-contract-compliance': (report) => unavailableReport(report, unsupportedSourceMessage('vendor contract/compliance')),
    'lpo-register': buildLpoRegister,
    'lpo-delivery-fulfillment': buildLpoFulfillment,
    'lpo-aging': buildLpoAging,
    'lpo-cancelled-modified': buildCancelledLpo,
    'grn-register': buildGrnRegister,
    'grn-variance': buildGrnVariance,
    'batch-expiry': buildBatchExpiry,
    'qc-rejection': buildQcRejection,
    'grv-register': (report) => unavailableReport(report, unsupportedSourceMessage('GRV / goods return')),
    'grv-reason-analysis': (report) => unavailableReport(report, unsupportedSourceMessage('GRV / goods return')),
    'replacement-pending': (report) => unavailableReport(report, unsupportedSourceMessage('replacement tracking')),
    'grv-debit-note-mapping': (report) => unavailableReport(report, unsupportedSourceMessage('GRV debit-note mapping')),
    'purchase-invoice-register': buildInvoiceRegister,
    'invoice-grn-variance': buildInvoiceGrnVariance,
    'landed-cost-allocation': buildLandedCost,
    'backdated-invoice': buildBackdatedInvoice,
    'payment-voucher-register': buildPaymentVoucherRegister,
    'payment-aging-delay': buildPaymentAgingDelay,
    'cheque-pdc-tracking': buildChequeTracking,
    'advance-payment-utilization': buildAdvanceUtilization,
    'debit-note-register': (report) => unavailableReport(report, unsupportedSourceMessage('purchase debit note')),
    'claim-settlement-status': (report) => unavailableReport(report, unsupportedSourceMessage('vendor claim settlement')),
    'vendor-claim-history': (report) => unavailableReport(report, unsupportedSourceMessage('vendor claim history')),
    'vat-input-register': buildVatInputRegister,
    'period-lock-violation': buildPeriodLockViolation,
    'missing-document': buildMissingDocument,
    'audit-trail': buildAuditTrail
};

const PurchaseSummaryReport = () => {
    const { company } = useCompany();
    const { branches: availableBranches, activeBranchId, isAllBranches } = useBranch();
    const [activeId, setActiveId] = useState('vendor-master');
    const [search, setSearch] = useState('');
    const initialBranchFilter = isAllBranches || !activeBranchId ? 'All' : String(activeBranchId);
    const [filters, setFilters] = useState(() => ({ ...defaultFilters(), branch: initialBranchFilter }));
    const [sources, setSources] = useState({
        vendors: [],
        lpos: [],
        grns: [],
        invoices: [],
        payments: [],
        branches: [],
        auditLogs: [],
        periods: []
    });
    const [sourceStatus, setSourceStatus] = useState({});
    const [loading, setLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, true])));
    const didLoadRef = useRef(false);
    const reportListRef = useRef(null);
    const reportBodyRef = useRef(null);
    const { captureScroll } = useReportScrollPreserver([reportListRef, reportBodyRef]);

    const activeReport = allReports.find(report => report.id === activeId) || allReports[0];

    const visibleGroups = useMemo(() => {
        const term = normalize(search);
        return REPORT_GROUPS.map(group => ({
            ...group,
            reports: group.reports.filter(report =>
                normalize(report.title).includes(term) ||
                normalize(report.description).includes(term) ||
                normalize(report.tag).includes(term) ||
                normalize(group.title).includes(term)
            )
        })).filter(group => group.reports.length > 0);
    }, [search]);

    const vendorOptions = useMemo(() => {
        const map = new Map([['All', 'All']]);
        sources.vendors.forEach(vendor => {
            const name = getVendorName(vendor);
            if (name && name !== 'Unknown') map.set(name, name);
        });
        [...sources.lpos, ...sources.grns, ...sources.invoices, ...sources.payments].forEach(row => {
            const name = getVendorName(row);
            if (name && name !== 'Unknown') map.set(name, name);
        });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [sources]);

    const branchOptions = useMemo(() => {
        const map = new Map([['All', 'All']]);
        sources.branches.forEach(branch => {
            const value = branch.id ?? branch.code ?? branch.name;
            if (value) map.set(String(value), branch.name || branch.code || String(value));
        });
        [...sources.lpos, ...sources.grns, ...sources.invoices, ...sources.payments].forEach(row => {
            const value = getBranchValue(row);
            if (value && value !== 'All') map.set(String(value), getBranchLabel(row));
        });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [sources]);

    const fetchAuditLogs = async () => {
        const res = await api.get('/api/financials/audit');
        return res.data;
    };

    const loadLiveData = async ({ quiet = false } = {}) => {
        setLoading(true);
        const status = {};
        try {
            const entries = await Promise.allSettled([
                getVendors(),
                getLpos(),
                getGrns(),
                getPurchaseInvoices(),
                getPaymentVouchers(),
                getBranches(),
                fetchAuditLogs(),
                getAllAccountingPeriods()
            ]);
            const keys = ['vendors', 'lpos', 'grns', 'invoices', 'payments', 'branches', 'auditLogs', 'periods'];
            const next = {};

            entries.forEach((entry, index) => {
                const key = keys[index];
                if (entry.status === 'fulfilled') {
                    next[key] = normalizeList(entry.value);
                    status[key] = 'ok';
                } else {
                    console.error(`Failed to load ${key}`, entry.reason);
                    next[key] = [];
                    status[key] = 'failed';
                }
            });

            const lpoDetailResults = await Promise.allSettled(next.lpos.map(async lpo => {
                const number = getLpoNumber(lpo);
                if (!number || number === '-') return lpo;
                const detail = await getLpoByNumber(number);
                return { ...lpo, ...detail };
            }));
            next.lpos = lpoDetailResults.map((entry, index) => entry.status === 'fulfilled' ? entry.value : next.lpos[index]);
            status.lpoDetails = lpoDetailResults.some(entry => entry.status === 'rejected') ? 'partial' : 'ok';

            const grnDetailResults = await Promise.allSettled(next.grns.map(async grn => {
                const id = grn.id ?? grn.dbId ?? grn.grnNo;
                if (!id) return grn;
                const detail = await getGrnById(id);
                return { ...grn, ...detail };
            }));
            next.grns = grnDetailResults.map((entry, index) => entry.status === 'fulfilled' ? entry.value : next.grns[index]);
            status.grnDetails = grnDetailResults.some(entry => entry.status === 'rejected') ? 'partial' : 'ok';

            setSources(next);
            setSourceStatus(status);

            const coreFailed = ['vendors', 'lpos', 'grns', 'invoices', 'payments'].every(key => status[key] === 'failed');
            if (coreFailed) toast.error('Purchase report data could not be loaded.');
            else if (!quiet) toast.success('Purchase reports refreshed.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (didLoadRef.current) return;
        didLoadRef.current = true;
        loadLiveData({ quiet: true });
    }, []);

    // Sync the branch filter with the sidebar branch selector.
    useEffect(() => {
        const nextBranch = isAllBranches || !activeBranchId ? 'All' : String(activeBranchId);
        setFilters(prev => prev.branch === nextBranch ? prev : { ...prev, branch: nextBranch });
    }, [activeBranchId, isAllBranches]);

    useEffect(() => {
        const groupId = activeReport.groupId;
        if (groupId) setOpenGroups(prev => ({ ...prev, [groupId]: true }));
    }, [activeReport.groupId]);

    const payload = useMemo(() => {
        const builder = REPORT_BUILDERS[activeReport.id];
        if (!builder) return unavailableReport(activeReport, 'This purchase report is not configured yet.');
        return builder(activeReport, { sources, filters, sourceStatus });
    }, [activeReport, sources, filters, sourceStatus]);

    const rows = payload.rows || [];
    const columns = payload.columns || emptyColumns;

    const exportColumns = useMemo(() => columns.map(column => ({
        header: column.header,
        key: column.key,
        width: column.width || 18
    })), [columns]);

    const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
    const resetFilters = () => setFilters(defaultFilters());

    const expandAllGroups = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, true])));
    const collapseAllGroups = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, false])));

    const selectReport = (id) => {
        captureScroll();
        setActiveId(id);
        setSidebarOpen(false);
    };

    const handleExportExcel = () => exportToExcel(rows, exportColumns, payload.title || activeReport.title);
    const handleExportPdf = () => exportToPDF(rows, exportColumns, payload.title || activeReport.title, payload.reportId || activeId);
    const handlePrint = async () => {
        const reportProfile = buildReportHeaderProfile({
            company,
            branches: availableBranches || [],
            activeBranchId: isAllBranches ? null : activeBranchId,
        });
        try {
            const templates = await getPrintTemplates();
            const defaultTemplate = templates.find(template => template.isDefault) || {};
            printHtml(generateReportPrintHtml(defaultTemplate, payload.title || activeReport.title, exportColumns, rows, reportProfile));
        } catch (error) {
            printHtml(generateReportPrintHtml({}, payload.title || activeReport.title, exportColumns, rows, reportProfile));
        }
    };

    const renderCell = (row, column) => {
        const value = row[column.key];
        if (value === null || value === undefined || value === '') return <span className="text-slate-400">-</span>;
        if (column.type === 'currency') return <CurrencyAmount value={value} decimals={2} />;
        if (column.type === 'number') return formatNumber(value, Number(value) % 1 === 0 ? 0 : 2);
        if (column.type === 'percent') return formatPercent(value);
        if (column.type === 'date') return formatDate(value);
        if (column.type === 'badge') {
            return (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(value)}`}>
                    {String(value)}
                </span>
            );
        }
        return String(value);
    };

    const renderMetric = (card) => {
        if (card.type === 'currency') return <CurrencyAmount value={card.value} decimals={2} />;
        if (card.type === 'percent') return formatPercent(card.value);
        if (card.type === 'number') return formatNumber(card.value, Number(card.value) % 1 === 0 ? 0 : 2);
        return card.value ?? '-';
    };

    const renderChart = (chart, index) => {
        const data = chart.data || [];
        if (data.length === 0) {
            return <div className="flex h-64 items-center justify-center text-sm text-slate-400">No chart data from current filters</div>;
        }

        if (chart.type === 'pie') {
            return (
                <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={88} paddingAngle={2}>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={value => formatNumber(value, 2)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        const series = chart.series || [{ key: 'value', name: chart.title, color: COLORS[index % COLORS.length] }];
        const stacked = chart.type === 'stackedBar';
        return (
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={value => formatNumber(value)} />
                    <Tooltip formatter={value => formatNumber(value, 2)} />
                    {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {series.map((item, i) => (
                        <Bar
                            key={item.key}
                            dataKey={item.key}
                            name={item.name}
                            stackId={stacked ? 'stack' : undefined}
                            fill={item.color || COLORS[i % COLORS.length]}
                            radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                            maxBarSize={58}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const SidebarContent = () => (
        <>
            <div className="border-b border-slate-200 p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-slate-950">Vendors & Purchases Reports</h2>
                        <p className="mt-1 text-[11px] text-slate-500">Vendor, LPO, GRN, invoice, payment and compliance reports.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(false)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
                        aria-label="Close reports drawer"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="relative mt-4">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Search reports..."
                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-yellow-400"
                    />
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={expandAllGroups}
                        className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-yellow-300 hover:bg-yellow-50 hover:text-slate-900"
                    >
                        Expand all
                    </button>
                    <button
                        type="button"
                        onClick={collapseAllGroups}
                        className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-yellow-300 hover:bg-yellow-50 hover:text-slate-900"
                    >
                        Collapse all
                    </button>
                </div>
            </div>

            <div ref={reportListRef} className="flex-1 overflow-y-auto p-3">
                {visibleGroups.map(group => {
                    const GroupIcon = group.icon;
                    const isOpen = Boolean(search.trim()) || openGroups[group.id];
                    return (
                        <div key={group.id} className="mb-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setOpenGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white"
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <GroupIcon size={15} className="shrink-0 text-slate-500" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[11px] font-bold text-slate-800">{group.title}</span>
                                        <span className="text-[10px] text-slate-500">{group.reports.length} report(s)</span>
                                    </span>
                                </span>
                                <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isOpen && (
                                <div className="border-t border-slate-200 p-2">
                                    {group.reports.map(report => {
                                        const Icon = report.icon;
                                        const active = report.id === activeId;
                                        return (
                                            <button
                                                type="button"
                                                key={report.id}
                                                onClick={() => selectReport(report.id)}
                                                className={`mb-1 w-full rounded-lg border p-2 text-left transition ${
                                                    active
                                                        ? 'border-yellow-400 bg-yellow-50 shadow-sm'
                                                        : 'border-slate-200 bg-white hover:border-yellow-200 hover:bg-yellow-50/30'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Icon size={15} className={`mt-0.5 shrink-0 ${active ? 'text-yellow-600' : 'text-slate-500'}`} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="truncate text-xs font-bold text-slate-950">{report.title}</span>
                                                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${report.badge === 'Chart' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                                                {report.badge}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{report.description}</p>
                                                        <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                                                            {report.tag}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100">
            {sidebarOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-black/30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close reports drawer"
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[88vw] flex-col border-r border-slate-200 bg-white transition-transform md:static md:z-auto md:w-[360px] md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <SidebarContent />
            </aside>

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600"
                        aria-label="Open reports drawer"
                    >
                        <Menu size={16} />
                    </button>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-950">{activeReport.title}</div>
                        <div className="text-xs text-slate-500">Vendors & Purchases Reports</div>
                    </div>
                </div>

                <div ref={reportBodyRef} className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                            BillBull <span className="px-2 text-slate-300">/</span> Vendors & Purchases <span className="px-2 text-slate-300">/</span>
                            <span className="font-semibold text-slate-700">Reports</span>
                        </div>
                        <ExportDropdown
                            onExportExcel={handleExportExcel}
                            onExportPdf={handleExportPdf}
                            onPrint={handlePrint}
                            disabled={rows.length === 0 || loading}
                        />
                    </div>

                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-xs text-slate-500">Filters</div>
                                <h1 className="mt-1 text-sm font-bold text-slate-950">Applied to: {activeReport.title}</h1>
                                <p className="mt-1 text-xs text-slate-500">{activeReport.description}</p>
                            </div>
                            <button className="inline-flex items-center gap-2 rounded-full border border-yellow-300 px-3 py-1.5 text-xs font-semibold text-slate-800">
                                <Filter size={14} className="text-yellow-600" /> Advanced
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Date From
                                <input type="date" value={filters.dateFrom} onChange={event => setFilter('dateFrom', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400" />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Date To
                                <input type="date" value={filters.dateTo} onChange={event => setFilter('dateTo', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400" />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Vendor
                                <select value={filters.vendor} onChange={event => setFilter('vendor', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {vendorOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Branch
                                <select value={filters.branch} onChange={event => setFilter('branch', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {branchOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600 sm:col-span-2">
                                Item / SKU Search
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={filters.searchQuery}
                                        onChange={event => setFilter('searchQuery', event.target.value)}
                                        placeholder="Search item name, SKU, vendor, document or reference..."
                                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-normal outline-none focus:border-yellow-400"
                                    />
                                </div>
                            </label>
                            <div className="flex items-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => loadLiveData()}
                                    disabled={loading}
                                    className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Generate
                                </button>
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading && rows.length === 0 ? (
                        <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                                <Loader2 className="animate-spin text-yellow-500" size={18} /> Loading purchase report data...
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-bold text-slate-950">{payload.title}</h2>
                                        <p className="mt-1 text-xs text-slate-500">{payload.subtitle}</p>
                                    </div>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                        {rows.length} records
                                    </span>
                                </div>
                                {(payload.notes || []).length > 0 && (
                                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                        {payload.notes.map((note, index) => <div key={index}>{note}</div>)}
                                    </div>
                                )}
                            </div>

                            {(payload.cards || []).length > 0 && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {payload.cards.map((card, index) => (
                                        <div
                                            key={`${card.label}-${index}`}
                                            className={`rounded-xl border bg-white p-4 ${index === 0 ? 'border-yellow-400 bg-yellow-50/40' : 'border-slate-200'}`}
                                        >
                                            <div className="text-[11px] font-semibold text-slate-500">{card.label}</div>
                                            <div className="mt-2 truncate text-xl font-black text-slate-950">{renderMetric(card)}</div>
                                            {card.sub && <div className="mt-1 text-[11px] text-slate-400">{card.sub}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(payload.charts || []).length > 0 && (
                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                    {payload.charts.map((chart, index) => (
                                        <div key={`${chart.title}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                                            <h3 className="text-sm font-bold text-slate-950">{chart.title}</h3>
                                            <div className="mt-3">{renderChart(chart, index)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-950">{payload.title}</h3>
                                        <p className="mt-1 text-xs text-slate-500">Live rows generated from current filters</p>
                                    </div>
                                    <ExportDropdown
                                        onExportExcel={handleExportExcel}
                                        onExportPdf={handleExportPdf}
                                        onPrint={handlePrint}
                                        disabled={rows.length === 0 || loading}
                                    />
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[980px] border-collapse text-xs">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {columns.map(column => (
                                                    <th
                                                        key={column.key}
                                                        className={`border-b border-slate-200 px-3 py-2.5 text-[11px] font-bold uppercase text-slate-500 ${['currency', 'number', 'percent'].includes(column.type) ? 'text-right' : 'text-left'}`}
                                                    >
                                                        {column.header}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.length > 0 ? rows.map((row, index) => (
                                                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                                                    {columns.map(column => (
                                                        <td
                                                            key={column.key}
                                                            className={`px-3 py-2.5 text-slate-700 ${['currency', 'number', 'percent'].includes(column.type) ? 'text-right tabular-nums' : ''}`}
                                                        >
                                                            {renderCell(row, column)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan={Math.max(columns.length, 1)} className="py-14 text-center">
                                                        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4">
                                                            <div className="text-sm font-semibold text-slate-500">No live rows for this report and filter set.</div>
                                                            <div className="text-xs leading-relaxed text-slate-400">
                                                                The page is not using mock data. Change the filters or add/source the related purchase records to populate this report.
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={resetFilters}
                                                                className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-yellow-100"
                                                            >
                                                                Reset filters
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PurchaseSummaryReport;
