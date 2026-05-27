import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    BarChart3,
    BookOpen,
    Building2,
    Calendar,
    ChevronDown,
    ClipboardCheck,
    CreditCard,
    Filter,
    Landmark,
    Loader2,
    Menu,
    ReceiptText,
    RefreshCw,
    Search,
    ShieldCheck,
    Users,
    Wallet,
    X
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../../api/axiosConfig';
import * as backendReports from '../../api/financialReportsBackendApi';
import { getAccounts, getBankAccounts, getCostCenters, getTransactions } from '../../api/ledgerApi';
import { getBranches } from '../../api/branchApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';
import { getInvoices as getPurchaseInvoices } from '../../api/purchaseInvoiceApi';
import { receiptVoucherApi } from '../../api/receiptVoucherApi';
import { getPaymentVouchers } from '../../api/paymentApi';
import { getAllCustomers } from '../../api/customerledgerApi';
import { getVendors } from '../../api/vendorsApi';
import { journalVoucherApi } from '../../api/journalVoucherApi';
import { employeesApi } from '../../api/employeesApi';
import { salaryPaymentApi } from '../../api/salaryPaymentApi';
import { salaryAdvanceApi } from '../../api/salaryAdvanceApi';
import { getPrintTemplates } from '../../api/printTemplateApi';
import CurrencyAmount from '../../components/CurrencyAmount';
import ExportDropdown from '../../components/common/ExportDropdown';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { generateReportPrintHtml, printHtml } from '../../utils/printGenerator';
import { buildReportHeaderProfile } from '../../utils/branchPrintProfile';
import useReportScrollPreserver from '../../hooks/useReportScrollPreserver';

const REPORT_GROUPS = [
    {
        id: 'profit-loss',
        title: 'Profit & Loss',
        icon: BarChart3,
        reports: [
            { id: 'profit-loss-statement', title: 'Statement of Profit or Loss', description: 'Revenue, COGS, operating expenses and net profit.', badge: 'Table', tags: ['IFRS', 'income', 'net profit'] },
            { id: 'gross-profit-analysis', title: 'Gross Profit Analysis', description: 'Revenue vs cost of sales with GP% by category.', badge: 'Chart', tags: ['GP%', 'margin', 'category'] },
            { id: 'departmental-pl', title: 'Departmental P&L', description: 'Profit and loss split by cost centre or department.', badge: 'Table', tags: ['cost centre', 'department'] },
            { id: 'comparative-pl', title: 'Comparative P&L', description: 'Current period vs prior period and configured budgets.', badge: 'Table', tags: ['budget', 'variance', 'YoY'] }
        ]
    },
    {
        id: 'balance-sheet',
        title: 'Balance Sheet',
        icon: Wallet,
        reports: [
            { id: 'financial-position', title: 'Statement of Financial Position', description: 'Assets, liabilities and equity at period end.', badge: 'Table', tags: ['IFRS', 'assets', 'equity'] },
            { id: 'trial-balance', title: 'Trial Balance', description: 'All account balances with debit and credit totals.', badge: 'Table', tags: ['ledger', 'debit', 'credit'] }
        ]
    },
    {
        id: 'cash-flow',
        title: 'Cash Flow',
        icon: CreditCard,
        reports: [
            { id: 'cash-flow-statement', title: 'Statement of Cash Flows', description: 'Operating, investing and financing cash movements.', badge: 'Chart', tags: ['IFRS', 'liquidity', 'indirect'] },
            { id: 'bank-reconciliation', title: 'Bank Reconciliation', description: 'Book balance vs reconciled bank ledger entries.', badge: 'Table', tags: ['reconcile', 'bank', 'cleared'] },
            { id: 'petty-cash-statement', title: 'Petty Cash Statement', description: 'Cash account receipts, payments and running balance.', badge: 'Table', tags: ['cash', 'imprest'] }
        ]
    },
    {
        id: 'receivables',
        title: 'Receivables',
        icon: Users,
        reports: [
            { id: 'customer-aging', title: 'Customer Aging Report', description: 'Outstanding receivables by age bucket.', badge: 'Chart', tags: ['aging', 'overdue', 'collection'] },
            { id: 'collection-efficiency', title: 'Collection Efficiency', description: 'DSO, collection rate and outstanding by customer.', badge: 'Chart', tags: ['DSO', 'KPI', 'collection'] },
            { id: 'credit-utilization', title: 'Credit Utilization', description: 'Credit limit vs outstanding exposure by customer.', badge: 'Table', tags: ['credit limit', 'exposure'] }
        ]
    },
    {
        id: 'payables',
        title: 'Payables',
        icon: ReceiptText,
        reports: [
            { id: 'vendor-aging', title: 'Vendor Aging Report', description: 'Payables outstanding by age bucket.', badge: 'Chart', tags: ['aging', 'vendor', 'payable'] },
            { id: 'payment-schedule', title: 'Payment Schedule', description: 'Upcoming vendor payments with method and status.', badge: 'Table', tags: ['due date', 'schedule'] },
            { id: 'outstanding-payables', title: 'Outstanding Payables', description: 'All unpaid and partially paid vendor invoices.', badge: 'Table', tags: ['outstanding', 'invoice'] }
        ]
    },
    {
        id: 'vat-tax',
        title: 'VAT & Tax',
        icon: ShieldCheck,
        reports: [
            { id: 'vat-return-summary', title: 'VAT Return Summary', description: 'Box-level UAE VAT return summary from tax ledger.', badge: 'Table', tags: ['FTA', 'UAE VAT', '5%'] },
            { id: 'output-tax-register', title: 'Output Tax Register', description: 'Taxable sales invoices with output VAT detail.', badge: 'Table', tags: ['output', 'tax invoice'] },
            { id: 'input-tax-register', title: 'Input Tax Register', description: 'Eligible purchase and expense input VAT.', badge: 'Table', tags: ['input', 'recovery', 'purchases'] }
        ]
    },
    {
        id: 'audit-control',
        title: 'Audit & Control',
        icon: ClipboardCheck,
        reports: [
            { id: 'journal-audit-log', title: 'Journal Audit Log', description: 'Manual journal entries with users and approval state.', badge: 'Table', tags: ['journal', 'manual', 'control'] },
            { id: 'period-close-checklist', title: 'Period Close Checklist', description: 'Month-end close readiness derived from live data.', badge: 'Table', tags: ['close', 'month-end', 'checklist'] },
            { id: 'user-activity-report', title: 'User Activity Report', description: 'Financial audit events with user, action and risk.', badge: 'Table', tags: ['user', 'activity', 'security'] }
        ]
    },
    {
        id: 'bank-management',
        title: 'Bank Management',
        icon: Landmark,
        reports: [
            { id: 'bank-book', title: 'Bank Book', description: 'Full transaction ledger per bank account with running balance.', badge: 'Table', tags: ['ledger', 'bank account', 'statement'] },
            { id: 'pdc-received', title: 'PDC Received', description: 'Post-dated cheques received from customers.', badge: 'Table', tags: ['PDC', 'cheque', 'customer'] },
            { id: 'pdc-issued', title: 'PDC Issued', description: 'Post-dated cheques issued to vendors.', badge: 'Table', tags: ['PDC', 'cheque', 'vendor'] },
            { id: 'bank-transfer-log', title: 'Bank Transfer Log', description: 'Inter-bank and intra-company fund transfer entries.', badge: 'Table', tags: ['transfer', 'inter-bank', 'SWIFT'] },
            { id: 'cheque-register', title: 'Cheque Register', description: 'All cheques issued and received with clearance status.', badge: 'Table', tags: ['cheque', 'clearance', 'void'] },
            { id: 'bank-charges-summary', title: 'Bank Charges Summary', description: 'Fees, commissions and interest charges by account.', badge: 'Chart', tags: ['charges', 'fees', 'interest'] },
            { id: 'bank-position-summary', title: 'Bank Position Summary', description: 'Consolidated balances across all bank accounts.', badge: 'Chart', tags: ['position', 'balance', 'multi-bank'] }
        ]
    },
    {
        id: 'statements',
        title: 'Statements of Accounts',
        icon: BookOpen,
        reports: [
            { id: 'customer-statement', title: 'Customer Statement of Account', description: 'Invoices, receipts, credit notes and balance per customer.', badge: 'Table', tags: ['customer', 'statement', 'balance'] },
            { id: 'vendor-statement', title: 'Vendor Statement of Account', description: 'Bills, payments and balance per vendor.', badge: 'Table', tags: ['vendor', 'statement', 'balance'] },
            { id: 'employee-ledger', title: 'Employee Ledger Statement', description: 'Salary, allowances, advances and net payable per employee.', badge: 'Table', tags: ['employee', 'salary', 'advance'] },
            { id: 'ledger-account-statement', title: 'Ledger Account Statement', description: 'Full debit and credit movement for a single GL account.', badge: 'Table', tags: ['ledger', 'GL', 'account'] },
            { id: 'all-accounts-statement', title: 'All Accounts Statement', description: 'Consolidated opening, movement and closing for every account.', badge: 'Table', tags: ['all accounts', 'consolidated', 'closing balance'] },
            { id: 'intercompany-statement', title: 'Intercompany Statement', description: 'Cross-entity balances and transactions for group reconciliation.', badge: 'Table', tags: ['intercompany', 'group', 'entity'] }
        ]
    }
];

const ALL_REPORTS = REPORT_GROUPS.flatMap(group => group.reports.map(report => ({ ...report, groupId: group.id, groupTitle: group.title, groupIcon: group.icon })));
const REPORT_LOOKUP = new Map(ALL_REPORTS.map(report => [report.id, report]));
const CHART_COLORS = ['#f5c742', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

const pad = value => String(value).padStart(2, '0');

const isoDate = value => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const defaultFilters = () => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
        dateFrom: isoDate(first),
        dateTo: isoDate(last),
        branchId: 'All',
        accountQuery: ''
    };
};

const toNumber = value => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const sumBy = (items, selector) => (items || []).reduce((total, item) => total + toNumber(selector(item)), 0);
const lower = value => String(value ?? '').toLowerCase();
const abs = value => Math.abs(toNumber(value));

const dateInRange = (value, from, to) => {
    const date = isoDate(value);
    if (!date) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
};

const beforeDate = (value, date) => {
    const itemDate = isoDate(value);
    return itemDate && date && itemDate < date;
};

const formatDate = value => {
    const date = isoDate(value);
    if (!date) return '-';
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatShortPeriod = (from, to) => {
    if (!from && !to) return 'All dates';
    if (from && to) {
        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T00:00:00`);
        if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
            return start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        }
    }
    return `${formatDate(from)} to ${formatDate(to)}`;
};

const getPriorRange = (from, to) => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { priorFrom: from, priorTo: to };
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const priorEnd = new Date(start);
    priorEnd.setDate(priorEnd.getDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setDate(priorStart.getDate() - days + 1);
    return { priorFrom: isoDate(priorStart), priorTo: isoDate(priorEnd) };
};

const monthYearFrom = dateValue => {
    const date = new Date(`${dateValue || isoDate(new Date())}T00:00:00`);
    return {
        month: Number.isNaN(date.getTime()) ? new Date().getMonth() + 1 : date.getMonth() + 1,
        year: Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear()
    };
};

const normalizeAmount = value => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const isArchiveStatus = item => ['archived', 'inactive', 'deleted'].includes(lower(item?.status));
const isDraftOrCancelled = item => ['draft', 'cancelled', 'canceled', 'void', 'rejected'].includes(lower(item?.status));

const accountGroup = account => account?.accountGroup || account?.accountType || account?.type || '';
const isIncomeAccount = account => /income|revenue/i.test(accountGroup(account)) || /revenue|income/i.test(account?.reportGroup || '');
const isExpenseAccount = account => /expense|expenses/i.test(accountGroup(account)) || /expense|cogs/i.test(account?.reportGroup || '');
const isAssetAccount = account => /asset|assets/i.test(accountGroup(account));
const isLiabilityAccount = account => /liabil/i.test(accountGroup(account));
const isEquityAccount = account => /equity/i.test(accountGroup(account));
const isCashAccount = account => Boolean(account?.cashFlag) || /cash|bank/i.test(`${account?.name || ''} ${account?.subGroup || ''}`);
const isBankAccount = account => Boolean(account?.cashFlag) || /bank|nbd|adcb|hsbc|emirates|mashreq|fab|dib/i.test(`${account?.name || ''} ${account?.subGroup || ''}`);

const branchMatches = (item, branches, branchId) => {
    if (!branchId || branchId === 'All') return true;
    const branch = branches.find(row => String(row.id) === String(branchId));
    const tokens = [
        branchId,
        branch?.id,
        branch?.name,
        branch?.code,
        branch?.branchName,
        branch?.branchCode
    ].filter(Boolean).map(value => lower(value));

    const itemTokens = [
        item?.branchId,
        item?.branch,
        item?.branchName,
        item?.branchCode
    ].filter(Boolean).map(value => lower(value));

    return itemTokens.some(value => tokens.includes(value));
};

const rowMatchesQuery = (row, query) => {
    const q = lower(query).trim();
    if (!q) return true;
    return Object.values(row || {}).some(value => lower(value).includes(q));
};

const statusBadgeClass = value => {
    const status = lower(value);
    if (['overdue', 'high', 'blocked', 'bounced', 'disputed', 'failed', 'void'].some(word => status.includes(word))) return 'border-red-200 bg-red-50 text-red-700';
    if (['pending', 'partial', 'medium', 'review', 'scheduled', 'stale', 'on hold'].some(word => status.includes(word))) return 'border-amber-200 bg-amber-50 text-amber-700';
    if (['paid', 'done', 'cleared', 'completed', 'confirmed', 'low', 'approved'].some(word => status.includes(word))) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (['received', 'outstanding'].some(word => status.includes(word))) return 'border-blue-200 bg-blue-50 text-blue-700';
    return 'border-slate-200 bg-slate-50 text-slate-700';
};

const riskForAudit = event => {
    const action = lower(`${event?.action || ''} ${event?.details || ''}`);
    if (action.includes('delete') || action.includes('void') || action.includes('reverse')) return 'High';
    if (action.includes('update') || action.includes('manual') || action.includes('post')) return 'Medium';
    return 'Low';
};

const metricValue = (card, currency) => {
    if (card.type === 'currency') return <CurrencyAmount value={card.value} currency={currency} decimals={2} />;
    if (card.type === 'percent') return `${toNumber(card.value).toLocaleString('en-AE', { maximumFractionDigits: 1 })}%`;
    if (card.type === 'number') return toNumber(card.value).toLocaleString('en-AE');
    return card.value ?? '-';
};

const getArAging = async asOfDate => {
    const response = await api.get('/api/financials/reports/ar-aging', { params: { asOfDate } });
    return response.data;
};

const getApAging = async asOfDate => {
    const response = await api.get('/api/financials/reports/ap-aging', { params: { asOfDate } });
    return response.data;
};

const getPdcs = async () => {
    const response = await api.get('/api/pdcs');
    return response.data;
};

const getAuditLogs = async () => {
    const response = await api.get('/api/financials/audit');
    return response.data;
};

const settleObject = async requestMap => {
    const entries = Object.entries(requestMap);
    const results = await Promise.allSettled(entries.map(([, request]) => request));
    return entries.reduce((acc, [key], index) => {
        const result = results[index];
        acc[key] = result.status === 'fulfilled'
            ? { ok: true, value: result.value }
            : { ok: false, value: null, error: result.reason };
        return acc;
    }, {});
};

const getResult = (results, key, fallback) => results[key]?.ok ? results[key].value : fallback;

const createLiveContext = (rawData, reportData, filters) => {
    const accounts = rawData.accounts || [];
    const accountByCode = new Map(accounts.map(account => [String(account.code || account.accountCode || account.id), account]));
    const branches = rawData.branches || [];
    const bankAccounts = (rawData.bankAccounts?.length ? rawData.bankAccounts : accounts.filter(isBankAccount)).filter(account => !isArchiveStatus(account));
    const cashAccounts = accounts.filter(account => isCashAccount(account) && !isArchiveStatus(account));

    const withAccountFilter = entry => {
        const account = accountByCode.get(String(entry.accountCode));
        if (!branchMatches(account || {}, branches, filters.branchId)) return false;
        if (!filters.accountQuery) return true;
        return rowMatchesQuery({
            accountCode: entry.accountCode,
            accountName: entry.accountName,
            costCenter: entry.costCenter,
            description: entry.description,
            voucherNo: entry.voucherNo
        }, filters.accountQuery);
    };

    const periodEntries = (rawData.transactions || [])
        .filter(entry => dateInRange(entry.transactionDate, filters.dateFrom, filters.dateTo))
        .filter(withAccountFilter);

    const entriesToDate = (rawData.transactions || [])
        .filter(entry => !filters.dateTo || isoDate(entry.transactionDate) <= filters.dateTo)
        .filter(withAccountFilter);

    return {
        rawData,
        reportData,
        filters,
        accounts,
        accountByCode,
        branches,
        bankAccounts,
        cashAccounts,
        periodEntries,
        entriesToDate
    };
};

const canUseServerReport = filters => filters.branchId === 'All' && !filters.accountQuery.trim();

const normalizeLine = line => ({
    accountCode: line?.accountCode || line?.code || '',
    accountName: line?.accountName || line?.name || 'Unassigned',
    category: line?.category || line?.accountGroup || line?.group || 'Uncategorized',
    amount: normalizeAmount(line?.amount)
});

const classifyPlGroup = account => {
    const reportGroup = lower(account?.reportGroup);
    if (reportGroup.includes('cogs') || reportGroup.includes('cost')) return 'cogs';
    if (reportGroup.includes('other_income')) return 'otherIncome';
    if (reportGroup.includes('revenue') || reportGroup.includes('income')) return 'revenue';
    if (reportGroup.includes('expense')) return 'expense';
    if (isIncomeAccount(account)) return 'revenue';
    if (isExpenseAccount(account)) return 'expense';
    return null;
};

const deriveProfitLoss = (ctx, from = ctx.filters.dateFrom, to = ctx.filters.dateTo) => {
    const entries = (ctx.rawData.transactions || [])
        .filter(entry => dateInRange(entry.transactionDate, from, to))
        .filter(entry => {
            const account = ctx.accountByCode.get(String(entry.accountCode));
            if (!branchMatches(account || {}, ctx.branches, ctx.filters.branchId)) return false;
            if (!ctx.filters.accountQuery) return true;
            return rowMatchesQuery({
                accountCode: entry.accountCode,
                accountName: entry.accountName,
                costCenter: entry.costCenter,
                description: entry.description
            }, ctx.filters.accountQuery);
        });

    const groups = new Map();
    entries.forEach(entry => {
        const account = ctx.accountByCode.get(String(entry.accountCode));
        const group = classifyPlGroup(account);
        if (!group) return;
        const key = `${group}:${entry.accountCode || entry.accountName}`;
        const existing = groups.get(key) || {
            group,
            accountCode: entry.accountCode,
            accountName: entry.accountName || account?.name || 'Unassigned',
            category: account?.subGroup || account?.reportGroup || account?.accountGroup || 'Uncategorized',
            debit: 0,
            credit: 0
        };
        existing.debit += toNumber(entry.debitAmount);
        existing.credit += toNumber(entry.creditAmount);
        groups.set(key, existing);
    });

    const model = {
        revenueItems: [],
        cogsItems: [],
        operatingExpenseItems: [],
        otherIncomeItems: [],
        totalRevenue: 0,
        totalCogs: 0,
        totalOperatingExpenses: 0,
        totalOtherIncome: 0,
        grossProfit: 0,
        netProfit: 0
    };

    groups.forEach(line => {
        const netCredit = line.credit - line.debit;
        const netDebit = line.debit - line.credit;
        const amount = normalizeAmount(abs(line.group === 'revenue' || line.group === 'otherIncome' ? netCredit : netDebit));
        if (amount === 0) return;
        const row = normalizeLine({ ...line, amount });
        if (line.group === 'revenue') {
            model.revenueItems.push(row);
            model.totalRevenue += amount;
        } else if (line.group === 'cogs') {
            model.cogsItems.push(row);
            model.totalCogs += amount;
        } else if (line.group === 'expense') {
            model.operatingExpenseItems.push(row);
            model.totalOperatingExpenses += amount;
        } else if (line.group === 'otherIncome') {
            model.otherIncomeItems.push(row);
            model.totalOtherIncome += amount;
        }
    });

    model.grossProfit = normalizeAmount(model.totalRevenue - model.totalCogs);
    model.netProfit = normalizeAmount(model.grossProfit - model.totalOperatingExpenses + model.totalOtherIncome);
    return model;
};

const getProfitLossModel = (ctx, report = ctx.reportData.profitLoss, from = ctx.filters.dateFrom, to = ctx.filters.dateTo) => {
    if (canUseServerReport(ctx.filters) && report) {
        const model = {
            revenueItems: (report.revenueItems || []).map(normalizeLine),
            cogsItems: (report.cogsItems || []).map(normalizeLine),
            operatingExpenseItems: (report.operatingExpenseItems || report.expenseItems || []).map(normalizeLine),
            otherIncomeItems: (report.otherIncomeItems || []).map(normalizeLine),
            totalRevenue: toNumber(report.totalRevenue),
            totalCogs: toNumber(report.totalCogs),
            totalOperatingExpenses: toNumber(report.totalOperatingExpenses ?? report.totalExpenses),
            totalOtherIncome: toNumber(report.totalOtherIncome),
            grossProfit: toNumber(report.grossProfit),
            netProfit: toNumber(report.netProfit)
        };
        if (!model.grossProfit) model.grossProfit = model.totalRevenue - model.totalCogs;
        return model;
    }
    return deriveProfitLoss(ctx, from, to);
};

const buildProfitLossStatement = ctx => {
    const current = getProfitLossModel(ctx);
    const prior = getProfitLossModel(ctx, ctx.reportData.priorProfitLoss, ctx.reportData.priorFrom, ctx.reportData.priorTo);
    const priorMap = new Map([
        ...prior.revenueItems,
        ...prior.cogsItems,
        ...prior.operatingExpenseItems,
        ...prior.otherIncomeItems
    ].map(line => [line.accountCode || line.accountName, toNumber(line.amount)]));

    const withPrior = (lines, sign = 1) => (lines || []).map(line => {
        const priorAmount = priorMap.get(line.accountCode || line.accountName) || 0;
        return {
            account: line.accountName,
            code: line.accountCode,
            current: sign * toNumber(line.amount),
            prior: sign * priorAmount,
            variance: priorAmount ? ((toNumber(line.amount) - priorAmount) / abs(priorAmount)) * 100 : null,
            _indent: true
        };
    });

    const rows = [
        { account: 'Revenue', current: current.totalRevenue, prior: prior.totalRevenue, variance: prior.totalRevenue ? ((current.totalRevenue - prior.totalRevenue) / abs(prior.totalRevenue)) * 100 : null, _section: true },
        ...withPrior(current.revenueItems),
        { account: 'Cost of Sales', current: -current.totalCogs, prior: -prior.totalCogs, variance: prior.totalCogs ? ((current.totalCogs - prior.totalCogs) / abs(prior.totalCogs)) * 100 : null, _section: true },
        ...withPrior(current.cogsItems, -1),
        { account: 'Gross Profit', current: current.grossProfit, prior: prior.grossProfit, variance: prior.grossProfit ? ((current.grossProfit - prior.grossProfit) / abs(prior.grossProfit)) * 100 : null, _total: true },
        { account: 'Operating Expenses', current: -current.totalOperatingExpenses, prior: -prior.totalOperatingExpenses, variance: prior.totalOperatingExpenses ? ((current.totalOperatingExpenses - prior.totalOperatingExpenses) / abs(prior.totalOperatingExpenses)) * 100 : null, _section: true },
        ...withPrior(current.operatingExpenseItems, -1),
        ...(current.otherIncomeItems.length ? [
            { account: 'Other Income', current: current.totalOtherIncome, prior: prior.totalOtherIncome, variance: prior.totalOtherIncome ? ((current.totalOtherIncome - prior.totalOtherIncome) / abs(prior.totalOtherIncome)) * 100 : null, _section: true },
            ...withPrior(current.otherIncomeItems)
        ] : []),
        { account: 'Net Profit / (Loss)', current: current.netProfit, prior: prior.netProfit, variance: prior.netProfit ? ((current.netProfit - prior.netProfit) / abs(prior.netProfit)) * 100 : null, _grandTotal: true }
    ];

    return {
        title: 'Statement of Profit or Loss',
        subtitle: 'Revenue, COGS, operating expenses and net profit from posted ledger entries.',
        columns: [
            { key: 'account', header: 'Account' },
            { key: 'current', header: 'Current Period', type: 'currency' },
            { key: 'prior', header: 'Prior Period', type: 'currency' },
            { key: 'variance', header: 'Variance %', type: 'percent' }
        ],
        rows,
        cards: [
            { label: 'Revenue', value: current.totalRevenue, type: 'currency' },
            { label: 'Gross Profit', value: current.grossProfit, type: 'currency' },
            { label: 'Operating Expenses', value: current.totalOperatingExpenses, type: 'currency' },
            { label: 'Net Profit', value: current.netProfit, type: 'currency' }
        ]
    };
};

const buildGrossProfit = ctx => {
    const pl = getProfitLossModel(ctx);
    const grouped = new Map();
    pl.revenueItems.forEach(line => {
        const key = line.category || 'Revenue';
        const row = grouped.get(key) || { category: key, revenue: 0, cogs: 0 };
        row.revenue += toNumber(line.amount);
        grouped.set(key, row);
    });
    pl.cogsItems.forEach(line => {
        const key = line.category || grouped.keys().next().value || 'Cost of Sales';
        const row = grouped.get(key) || { category: key, revenue: 0, cogs: 0 };
        row.cogs += toNumber(line.amount);
        grouped.set(key, row);
    });
    if (grouped.size === 0 && (pl.totalRevenue || pl.totalCogs)) {
        grouped.set('Total', { category: 'Total', revenue: pl.totalRevenue, cogs: pl.totalCogs });
    }
    const rows = Array.from(grouped.values()).map(row => ({
        ...row,
        grossProfit: normalizeAmount(row.revenue - row.cogs),
        gpPercent: row.revenue ? ((row.revenue - row.cogs) / row.revenue) * 100 : 0
    }));
    rows.push({
        category: 'Total',
        revenue: pl.totalRevenue,
        cogs: pl.totalCogs,
        grossProfit: pl.grossProfit,
        gpPercent: pl.totalRevenue ? (pl.grossProfit / pl.totalRevenue) * 100 : 0,
        _grandTotal: true
    });
    return {
        title: 'Gross Profit Analysis',
        subtitle: 'Revenue vs cost of sales with GP% by category.',
        columns: [
            { key: 'category', header: 'Category' },
            { key: 'revenue', header: 'Revenue', type: 'currency' },
            { key: 'cogs', header: 'COGS', type: 'currency' },
            { key: 'grossProfit', header: 'Gross Profit', type: 'currency' },
            { key: 'gpPercent', header: 'GP %', type: 'percent' }
        ],
        rows,
        chart: {
            title: 'Gross Profit by Category',
            data: rows.filter(row => !row._grandTotal).map(row => ({ name: row.category, value: row.grossProfit }))
        },
        cards: [
            { label: 'Revenue', value: pl.totalRevenue, type: 'currency' },
            { label: 'COGS', value: pl.totalCogs, type: 'currency' },
            { label: 'Gross Profit', value: pl.grossProfit, type: 'currency' },
            { label: 'GP %', value: pl.totalRevenue ? (pl.grossProfit / pl.totalRevenue) * 100 : 0, type: 'percent' }
        ]
    };
};

const buildDepartmentalPl = ctx => {
    const grouped = new Map();
    ctx.periodEntries.forEach(entry => {
        const account = ctx.accountByCode.get(String(entry.accountCode));
        const group = classifyPlGroup(account);
        if (!group) return;
        const key = entry.costCenter || account?.costCenterCode || 'Unassigned';
        const row = grouped.get(key) || { department: key, revenue: 0, expenses: 0 };
        if (group === 'revenue' || group === 'otherIncome') {
            row.revenue += toNumber(entry.creditAmount) - toNumber(entry.debitAmount);
        } else {
            row.expenses += toNumber(entry.debitAmount) - toNumber(entry.creditAmount);
        }
        grouped.set(key, row);
    });
    const rows = Array.from(grouped.values())
        .map(row => ({ ...row, netProfit: normalizeAmount(row.revenue - row.expenses) }))
        .sort((a, b) => b.netProfit - a.netProfit);
    rows.push({
        department: 'Total',
        revenue: sumBy(rows, row => row.revenue),
        expenses: sumBy(rows, row => row.expenses),
        netProfit: sumBy(rows, row => row.netProfit),
        _grandTotal: true
    });
    return {
        title: 'Departmental P&L',
        subtitle: 'Profit and loss split by cost centre or department.',
        columns: [
            { key: 'department', header: 'Department / Cost Centre' },
            { key: 'revenue', header: 'Revenue', type: 'currency' },
            { key: 'expenses', header: 'Expenses', type: 'currency' },
            { key: 'netProfit', header: 'Net Profit', type: 'currency' }
        ],
        rows,
        chart: {
            title: 'Net Profit by Cost Centre',
            data: rows.filter(row => !row._grandTotal).map(row => ({ name: row.department, value: row.netProfit }))
        }
    };
};

const buildComparativePl = ctx => {
    const current = getProfitLossModel(ctx);
    const prior = getProfitLossModel(ctx, ctx.reportData.priorProfitLoss, ctx.reportData.priorFrom, ctx.reportData.priorTo);
    const budgetTotal = sumBy(ctx.rawData.costCenters || [], row => row.budget);
    const rows = [
        { lineItem: 'Revenue', current: current.totalRevenue, prior: prior.totalRevenue, budget: null },
        { lineItem: 'Cost of Sales', current: -current.totalCogs, prior: -prior.totalCogs, budget: null },
        { lineItem: 'Gross Profit', current: current.grossProfit, prior: prior.grossProfit, budget: null, _section: true },
        { lineItem: 'Operating Expenses', current: -current.totalOperatingExpenses, prior: -prior.totalOperatingExpenses, budget: budgetTotal ? -budgetTotal : null },
        { lineItem: 'Other Income', current: current.totalOtherIncome, prior: prior.totalOtherIncome, budget: null },
        { lineItem: 'Net Profit', current: current.netProfit, prior: prior.netProfit, budget: budgetTotal ? current.totalRevenue - current.totalCogs - budgetTotal + current.totalOtherIncome : null, _grandTotal: true }
    ].map(row => ({
        ...row,
        vsBudget: row.budget == null ? null : row.current - row.budget,
        vsPrior: row.prior ? ((row.current - row.prior) / abs(row.prior)) * 100 : null
    }));
    return {
        title: 'Comparative P&L',
        subtitle: 'Current period vs prior period and configured cost centre budgets.',
        columns: [
            { key: 'lineItem', header: 'Line Item' },
            { key: 'current', header: 'Current', type: 'currency' },
            { key: 'prior', header: 'Prior', type: 'currency' },
            { key: 'budget', header: 'Budget', type: 'currency' },
            { key: 'vsBudget', header: 'vs Budget', type: 'currency' },
            { key: 'vsPrior', header: 'vs Prior %', type: 'percent' }
        ],
        rows,
        note: budgetTotal ? null : 'No cost centre budgets are configured, so budget variance is shown as blank.'
    };
};

const deriveBalanceSheet = ctx => {
    const balances = new Map();
    ctx.entriesToDate.forEach(entry => {
        const current = balances.get(entry.accountCode) || { debit: 0, credit: 0, account: ctx.accountByCode.get(String(entry.accountCode)), accountCode: entry.accountCode, accountName: entry.accountName };
        current.debit += toNumber(entry.debitAmount);
        current.credit += toNumber(entry.creditAmount);
        balances.set(entry.accountCode, current);
    });

    const result = { assetItems: [], liabilityItems: [], equityItems: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
    balances.forEach(balance => {
        const account = balance.account || {};
        if (isArchiveStatus(account) || account.isGroup) return;
        const raw = balance.debit - balance.credit;
        const amount = isAssetAccount(account) ? raw : -raw;
        if (Math.abs(amount) < 0.01) return;
        const line = normalizeLine({
            accountCode: balance.accountCode,
            accountName: balance.accountName || account.name,
            category: account.subGroup || account.reportGroup || account.accountGroup,
            amount
        });
        if (isAssetAccount(account)) {
            result.assetItems.push(line);
            result.totalAssets += amount;
        } else if (isLiabilityAccount(account)) {
            result.liabilityItems.push(line);
            result.totalLiabilities += amount;
        } else if (isEquityAccount(account)) {
            result.equityItems.push(line);
            result.totalEquity += amount;
        }
    });
    return result;
};

const buildFinancialPosition = ctx => {
    const server = canUseServerReport(ctx.filters) ? ctx.reportData.balanceSheet : null;
    const sheet = server || deriveBalanceSheet(ctx);
    const groupRows = (title, rows, totalLabel, total) => [
        { account: title, amount: null, _section: true },
        ...(rows || []).map(line => ({ account: line.accountName, code: line.accountCode, amount: toNumber(line.amount), _indent: true })),
        { account: totalLabel, amount: total, _total: true }
    ];
    const leftRows = [
        ...groupRows('Assets', sheet.assetItems || [], 'Total Assets', toNumber(sheet.totalAssets))
    ];
    const rightRows = [
        ...groupRows('Equity', sheet.equityItems || [], 'Sub-total Equity', toNumber(sheet.totalEquity)),
        ...groupRows('Liabilities', sheet.liabilityItems || [], 'Sub-total Liabilities', toNumber(sheet.totalLiabilities)),
        { account: 'Total Equity & Liabilities', amount: toNumber(sheet.totalLiabilities) + toNumber(sheet.totalEquity), _grandTotal: true }
    ];
    const difference = toNumber(sheet.totalAssets) - (toNumber(sheet.totalLiabilities) + toNumber(sheet.totalEquity));
    return {
        title: 'Statement of Financial Position',
        subtitle: 'Assets, liabilities and equity at period end.',
        layout: 'split',
        leftTitle: 'Assets',
        rightTitle: 'Equity & Liabilities',
        columns: [
            { key: 'account', header: 'Account' },
            { key: 'amount', header: 'Amount', type: 'currency' }
        ],
        leftRows,
        rightRows,
        cards: [
            { label: 'Total Assets', value: sheet.totalAssets, type: 'currency' },
            { label: 'Total Liabilities', value: sheet.totalLiabilities, type: 'currency' },
            { label: 'Total Equity', value: sheet.totalEquity, type: 'currency' },
            { label: 'Difference', value: difference, type: 'currency' }
        ],
        note: Math.abs(difference) > 0.01 ? `Imbalance detected: ${normalizeAmount(difference)}` : null
    };
};

const deriveTrialBalance = ctx => {
    const grouped = new Map();
    ctx.periodEntries.forEach(entry => {
        const row = grouped.get(entry.accountCode) || {
            accountCode: entry.accountCode,
            accountName: entry.accountName,
            accountGroup: accountGroup(ctx.accountByCode.get(String(entry.accountCode))),
            debitBalance: 0,
            creditBalance: 0
        };
        row.debitBalance += toNumber(entry.debitAmount);
        row.creditBalance += toNumber(entry.creditAmount);
        grouped.set(entry.accountCode, row);
    });
    const rows = Array.from(grouped.values()).map(row => {
        const net = row.debitBalance - row.creditBalance;
        return {
            ...row,
            debitBalance: net >= 0 ? net : 0,
            creditBalance: net < 0 ? Math.abs(net) : 0
        };
    }).filter(row => row.debitBalance || row.creditBalance);
    return {
        lines: rows,
        totalDebit: sumBy(rows, row => row.debitBalance),
        totalCredit: sumBy(rows, row => row.creditBalance)
    };
};

const buildTrialBalance = ctx => {
    const report = canUseServerReport(ctx.filters) && ctx.reportData.trialBalance ? ctx.reportData.trialBalance : deriveTrialBalance(ctx);
    const rows = (report.lines || []).map(line => ({
        code: line.accountCode,
        accountName: line.accountName,
        accountGroup: line.accountGroup,
        debit: toNumber(line.debitBalance),
        credit: toNumber(line.creditBalance)
    }));
    rows.push({ code: '', accountName: 'Total', accountGroup: '', debit: toNumber(report.totalDebit), credit: toNumber(report.totalCredit), _grandTotal: true });
    return {
        title: 'Trial Balance',
        subtitle: 'All account balances with debit and credit totals.',
        columns: [
            { key: 'code', header: 'Code' },
            { key: 'accountName', header: 'Account Name' },
            { key: 'accountGroup', header: 'Group' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Debit Total', value: report.totalDebit, type: 'currency' },
            { label: 'Credit Total', value: report.totalCredit, type: 'currency' },
            { label: 'Difference', value: toNumber(report.totalDebit) - toNumber(report.totalCredit), type: 'currency' }
        ],
        note: Math.abs(toNumber(report.totalDebit) - toNumber(report.totalCredit)) > 0.01 ? 'Trial balance is not balanced for the selected period.' : null
    };
};

const buildCashFlow = ctx => {
    const report = ctx.reportData.cashFlow || {};
    const rows = [
        { item: 'Operating Activities', amount: null, _section: true },
        ...(report.operatingActivities || []).map(line => ({ item: line.accountName, amount: toNumber(line.amount), _indent: true })),
        { item: 'Net cash from Operating Activities', amount: toNumber(report.totalOperating), _total: true },
        { item: 'Investing Activities', amount: null, _section: true },
        ...(report.investingActivities || []).map(line => ({ item: line.accountName, amount: toNumber(line.amount), _indent: true })),
        { item: 'Net cash from Investing Activities', amount: toNumber(report.totalInvesting), _total: true },
        { item: 'Financing Activities', amount: null, _section: true },
        ...(report.financingActivities || []).map(line => ({ item: line.accountName, amount: toNumber(line.amount), _indent: true })),
        { item: 'Net cash from Financing Activities', amount: toNumber(report.totalFinancing), _total: true },
        { item: 'Net Change in Cash', amount: toNumber(report.netCashFlow), _grandTotal: true }
    ];
    return {
        title: 'Statement of Cash Flows',
        subtitle: 'Operating, investing and financing cash movements from ledger cash-flow buckets.',
        columns: [
            { key: 'item', header: 'Item' },
            { key: 'amount', header: 'Amount', type: 'currency' }
        ],
        rows,
        chart: {
            title: 'Cash Flow Buckets',
            data: [
                { name: 'Operating', value: toNumber(report.totalOperating) },
                { name: 'Investing', value: toNumber(report.totalInvesting) },
                { name: 'Financing', value: toNumber(report.totalFinancing) }
            ]
        },
        cards: [
            { label: 'Operating', value: report.totalOperating, type: 'currency' },
            { label: 'Investing', value: report.totalInvesting, type: 'currency' },
            { label: 'Financing', value: report.totalFinancing, type: 'currency' },
            { label: 'Net Change', value: report.netCashFlow, type: 'currency' }
        ],
        note: rows.length <= 5 ? 'No cash-flow bucket activity was found. Configure cfBucket on ledger postings to populate this report.' : null
    };
};

const getSelectedBankAccount = ctx => {
    const q = lower(ctx.filters.accountQuery).trim();
    if (q) {
        const match = ctx.bankAccounts.find(account => rowMatchesQuery(account, q));
        if (match) return match;
    }
    return ctx.bankAccounts[0] || ctx.cashAccounts.find(isBankAccount) || null;
};

const accountOpening = (ctx, accountCode, from) => sumBy(ctx.rawData.transactions || [], entry => {
    if (String(entry.accountCode) !== String(accountCode) || !beforeDate(entry.transactionDate, from)) return 0;
    return toNumber(entry.debitAmount) - toNumber(entry.creditAmount);
});

const accountEntries = (ctx, accountCode) => (ctx.rawData.transactions || [])
    .filter(entry => String(entry.accountCode) === String(accountCode))
    .filter(entry => dateInRange(entry.transactionDate, ctx.filters.dateFrom, ctx.filters.dateTo))
    .sort((a, b) => isoDate(a.transactionDate).localeCompare(isoDate(b.transactionDate)));

const buildBankBook = ctx => {
    const bank = getSelectedBankAccount(ctx);
    const opening = bank ? accountOpening(ctx, bank.code, ctx.filters.dateFrom) : 0;
    let running = opening;
    const rows = bank ? [
        { date: ctx.filters.dateFrom, ref: 'OB', narration: 'Opening Balance', type: 'Balance B/F', debit: null, credit: null, balance: opening, _section: true },
        ...accountEntries(ctx, bank.code).map(entry => {
            running += toNumber(entry.debitAmount) - toNumber(entry.creditAmount);
            return {
                date: entry.transactionDate,
                ref: entry.voucherNo || entry.journalId || entry.id,
                narration: entry.description || entry.accountName,
                type: entry.type || 'Ledger',
                debit: toNumber(entry.debitAmount) || null,
                credit: toNumber(entry.creditAmount) || null,
                balance: running
            };
        }),
        { date: ctx.filters.dateTo, ref: 'CB', narration: 'Closing Balance', type: 'Balance C/F', debit: null, credit: null, balance: running, _grandTotal: true }
    ] : [];
    return {
        title: 'Bank Book',
        subtitle: bank ? `Transaction ledger with running balance for ${bank.name || bank.code}.` : 'No bank account is configured in the chart of accounts.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'ref', header: 'Ref #' },
            { key: 'narration', header: 'Narration' },
            { key: 'type', header: 'Type' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Opening Balance', value: opening, type: 'currency' },
            { label: 'Total Receipts', value: sumBy(rows, row => row.debit), type: 'currency' },
            { label: 'Total Payments', value: sumBy(rows, row => row.credit), type: 'currency' },
            { label: 'Closing Balance', value: running, type: 'currency' }
        ]
    };
};

const buildBankReconciliation = ctx => {
    const bank = getSelectedBankAccount(ctx);
    const entries = bank ? accountEntries(ctx, bank.code) : [];
    const opening = bank ? accountOpening(ctx, bank.code, ctx.filters.dateFrom) : 0;
    const bookBalance = opening + sumBy(entries, row => toNumber(row.debitAmount) - toNumber(row.creditAmount));
    const reconciledBalance = opening + sumBy(entries.filter(row => row.reconciled), row => toNumber(row.debitAmount) - toNumber(row.creditAmount));
    const rows = entries.map(entry => ({
        date: entry.transactionDate,
        description: entry.description || entry.accountName,
        ref: entry.voucherNo || entry.journalId || entry.id,
        book: toNumber(entry.debitAmount) - toNumber(entry.creditAmount),
        bank: entry.reconciled ? toNumber(entry.debitAmount) - toNumber(entry.creditAmount) : null,
        status: entry.reconciled ? 'Cleared' : 'Pending'
    }));
    return {
        title: 'Bank Reconciliation',
        subtitle: bank ? `Book balance vs reconciled ledger entries for ${bank.name || bank.code}.` : 'No bank account is configured.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'description', header: 'Description' },
            { key: 'ref', header: 'Ref' },
            { key: 'book', header: 'Book', type: 'currency' },
            { key: 'bank', header: 'Cleared Bank', type: 'currency' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows,
        cards: [
            { label: 'Book Balance', value: bookBalance, type: 'currency' },
            { label: 'Reconciled Balance', value: reconciledBalance, type: 'currency' },
            { label: 'Difference', value: bookBalance - reconciledBalance, type: 'currency' }
        ]
    };
};

const buildPettyCash = ctx => {
    const account = ctx.cashAccounts.find(row => !isBankAccount(row)) || ctx.cashAccounts[0];
    const opening = account ? accountOpening(ctx, account.code, ctx.filters.dateFrom) : 0;
    let running = opening;
    const rows = accountEntries(ctx, account?.code).map(entry => {
        running += toNumber(entry.debitAmount) - toNumber(entry.creditAmount);
        return {
            date: entry.transactionDate,
            description: entry.description || entry.accountName,
            category: entry.type || entry.costCenter || 'Cash',
            receipt: entry.voucherNo || entry.journalId || entry.id,
            amount: toNumber(entry.debitAmount) - toNumber(entry.creditAmount),
            balance: running
        };
    });
    rows.push({ date: ctx.filters.dateTo, description: 'Closing Balance', category: '', receipt: '', amount: null, balance: running, _grandTotal: true });
    return {
        title: 'Petty Cash Statement',
        subtitle: account ? `Cash account movement for ${account.name || account.code}.` : 'No cash account is configured.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'description', header: 'Description' },
            { key: 'category', header: 'Category' },
            { key: 'receipt', header: 'Receipt' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Opening Cash', value: opening, type: 'currency' },
            { label: 'Cash In', value: sumBy(rows, row => Math.max(toNumber(row.amount), 0)), type: 'currency' },
            { label: 'Cash Out', value: abs(sumBy(rows, row => Math.min(toNumber(row.amount), 0))), type: 'currency' },
            { label: 'Closing Cash', value: running, type: 'currency' }
        ]
    };
};

const agingRows = rows => (rows || []).map(row => ({
    partner: row.partnerName || row.customer || row.vendor || 'Unknown',
    current: toNumber(row.amount0to30 ?? row.current),
    days31to60: toNumber(row.amount31to60),
    days61to90: toNumber(row.amount61to90),
    days90Plus: toNumber(row.amount90Plus),
    total: toNumber(row.total)
})).sort((a, b) => b.total - a.total);

const buildCustomerAging = ctx => {
    const rows = agingRows(ctx.reportData.arAging);
    rows.push({ partner: 'Total', current: sumBy(rows, row => row.current), days31to60: sumBy(rows, row => row.days31to60), days61to90: sumBy(rows, row => row.days61to90), days90Plus: sumBy(rows, row => row.days90Plus), total: sumBy(rows, row => row.total), _grandTotal: true });
    return {
        title: 'Customer Aging Report',
        subtitle: 'Outstanding receivables by age bucket.',
        columns: [
            { key: 'partner', header: 'Customer' },
            { key: 'current', header: '0-30 Days', type: 'currency' },
            { key: 'days31to60', header: '31-60 Days', type: 'currency' },
            { key: 'days61to90', header: '61-90 Days', type: 'currency' },
            { key: 'days90Plus', header: '90+ Days', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' }
        ],
        rows,
        chart: { title: 'Receivable Aging Buckets', data: ['current', 'days31to60', 'days61to90', 'days90Plus'].map(key => ({ name: key.replace('days', '').replace('Plus', '+'), value: sumBy(rows, row => row[key]) })) }
    };
};

const buildCollectionEfficiency = ctx => {
    const invoices = (ctx.rawData.salesInvoices || [])
        .filter(inv => !isDraftOrCancelled(inv))
        .filter(inv => dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(inv => branchMatches(inv, ctx.branches, ctx.filters.branchId))
        .filter(inv => rowMatchesQuery(inv, ctx.filters.accountQuery));
    const grouped = new Map();
    invoices.forEach(inv => {
        const key = inv.customerCode || inv.customerName || 'Unknown Customer';
        const row = grouped.get(key) || { customer: inv.customerName || key, invoiced: 0, collected: 0, outstanding: 0, days: [] };
        row.invoiced += toNumber(inv.invoiceTotal);
        row.collected += toNumber(inv.amountPaid);
        row.outstanding += toNumber(inv.balance);
        if (toNumber(inv.balance) > 0 && inv.invoiceDate) {
            const days = Math.max(0, Math.round((new Date(`${ctx.filters.dateTo}T00:00:00`) - new Date(`${isoDate(inv.invoiceDate)}T00:00:00`)) / 86400000));
            row.days.push(days);
        }
        grouped.set(key, row);
    });
    const rows = Array.from(grouped.values()).map(row => ({
        ...row,
        dso: row.days.length ? Math.round(row.days.reduce((a, b) => a + b, 0) / row.days.length) : 0,
        collectionPct: row.invoiced ? (row.collected / row.invoiced) * 100 : 0
    })).sort((a, b) => b.outstanding - a.outstanding);
    return {
        title: 'Collection Efficiency Report',
        subtitle: 'DSO, collection rate and outstanding by customer.',
        columns: [
            { key: 'customer', header: 'Customer' },
            { key: 'invoiced', header: 'Invoiced', type: 'currency' },
            { key: 'collected', header: 'Collected', type: 'currency' },
            { key: 'outstanding', header: 'Outstanding', type: 'currency' },
            { key: 'dso', header: 'DSO Days', type: 'number' },
            { key: 'collectionPct', header: 'Collection %', type: 'percent' }
        ],
        rows,
        chart: { title: 'Collection % by Customer', data: rows.map(row => ({ name: row.customer, value: row.collectionPct })) }
    };
};

const buildCreditUtilization = ctx => {
    const invoiceOutstanding = new Map();
    (ctx.rawData.salesInvoices || []).forEach(inv => {
        if (isDraftOrCancelled(inv)) return;
        const key = inv.customerCode || inv.customerName;
        invoiceOutstanding.set(key, (invoiceOutstanding.get(key) || 0) + toNumber(inv.balance));
    });
    const rows = (ctx.rawData.customers || [])
        .filter(customer => rowMatchesQuery(customer, ctx.filters.accountQuery))
        .filter(customer => branchMatches(customer, ctx.branches, ctx.filters.branchId))
        .map(customer => {
            const outstanding = toNumber(customer.balance) || invoiceOutstanding.get(customer.code) || invoiceOutstanding.get(customer.name) || 0;
            const limit = toNumber(customer.creditLimitAmount || customer.creditLimit);
            const available = Math.max(limit - outstanding, 0);
            const utilization = limit ? (outstanding / limit) * 100 : 0;
            return {
                customer: customer.name || customer.code,
                creditLimit: limit,
                outstanding,
                available,
                utilization,
                status: customer.blockCredit ? 'Blocked' : utilization >= 100 ? 'Over limit' : outstanding > 0 ? 'Active' : 'Paid'
            };
        }).sort((a, b) => b.utilization - a.utilization);
    return {
        title: 'Credit Utilization Report',
        subtitle: 'Credit limit vs outstanding exposure by customer.',
        columns: [
            { key: 'customer', header: 'Customer' },
            { key: 'creditLimit', header: 'Credit Limit', type: 'currency' },
            { key: 'outstanding', header: 'Outstanding', type: 'currency' },
            { key: 'available', header: 'Available', type: 'currency' },
            { key: 'utilization', header: 'Utilization %', type: 'progress' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows
    };
};

const buildVendorAging = ctx => {
    const rows = agingRows(ctx.reportData.apAging);
    rows.push({ partner: 'Total', current: sumBy(rows, row => row.current), days31to60: sumBy(rows, row => row.days31to60), days61to90: sumBy(rows, row => row.days61to90), days90Plus: sumBy(rows, row => row.days90Plus), total: sumBy(rows, row => row.total), _grandTotal: true });
    return {
        title: 'Vendor Aging Report',
        subtitle: 'Payables outstanding by age bucket.',
        columns: [
            { key: 'partner', header: 'Vendor' },
            { key: 'current', header: '0-30 Days', type: 'currency' },
            { key: 'days31to60', header: '31-60 Days', type: 'currency' },
            { key: 'days61to90', header: '61-90 Days', type: 'currency' },
            { key: 'days90Plus', header: '90+ Days', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' }
        ],
        rows,
        chart: { title: 'Payable Aging Buckets', data: ['current', 'days31to60', 'days61to90', 'days90Plus'].map(key => ({ name: key.replace('days', '').replace('Plus', '+'), value: sumBy(rows, row => row[key]) })) }
    };
};

const purchaseInvoiceBalance = inv => {
    const paid = toNumber(inv.paidAmount ?? inv.amountPaid) || sumBy(inv.payments || [], payment => payment.paidAmount);
    return Math.max(toNumber(inv.grandTotal || inv.invoiceTotal || inv.total) - paid, 0);
};

const buildPaymentSchedule = ctx => {
    const rows = (ctx.rawData.purchaseInvoices || [])
        .filter(inv => !isDraftOrCancelled(inv))
        .filter(inv => purchaseInvoiceBalance(inv) > 0)
        .filter(inv => dateInRange(inv.dueDate || inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo) || isoDate(inv.dueDate || inv.invoiceDate) >= ctx.filters.dateFrom)
        .filter(inv => branchMatches(inv, ctx.branches, ctx.filters.branchId))
        .filter(inv => rowMatchesQuery(inv, ctx.filters.accountQuery))
        .map(inv => ({
            dueDate: inv.dueDate || inv.invoiceDate,
            vendor: inv.vendorName,
            reference: inv.invoiceNumber || inv.vendorInvoiceNo,
            amount: purchaseInvoiceBalance(inv),
            paymentMethod: inv.paymentMode || inv.payPref || 'Not scheduled',
            status: lower(inv.paymentStatus).includes('partial') ? 'Partial' : 'Pending'
        }))
        .sort((a, b) => isoDate(a.dueDate).localeCompare(isoDate(b.dueDate)));
    rows.push({ dueDate: '', vendor: 'Total Payable', reference: '', amount: sumBy(rows, row => row.amount), paymentMethod: '', status: '', _grandTotal: true });
    return {
        title: 'Payment Schedule',
        subtitle: 'Upcoming vendor payments with method and status.',
        columns: [
            { key: 'dueDate', header: 'Due Date', type: 'date' },
            { key: 'vendor', header: 'Vendor' },
            { key: 'reference', header: 'Reference' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'paymentMethod', header: 'Payment Method' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows
    };
};

const buildOutstandingPayables = ctx => {
    const rows = (ctx.rawData.purchaseInvoices || [])
        .filter(inv => !isDraftOrCancelled(inv))
        .filter(inv => purchaseInvoiceBalance(inv) > 0)
        .filter(inv => branchMatches(inv, ctx.branches, ctx.filters.branchId))
        .filter(inv => rowMatchesQuery(inv, ctx.filters.accountQuery))
        .map(inv => {
            const paid = sumBy(inv.payments || [], payment => payment.paidAmount);
            const balance = purchaseInvoiceBalance(inv);
            return {
                invoice: inv.invoiceNumber,
                vendor: inv.vendorName,
                invoiceDate: inv.invoiceDate,
                dueDate: inv.dueDate,
                amount: toNumber(inv.grandTotal),
                paid,
                balance,
                status: paid > 0 ? 'Partial' : isoDate(inv.dueDate) < ctx.filters.dateTo ? 'Overdue' : 'Pending'
            };
        });
    rows.push({ invoice: '', vendor: 'Total Outstanding', invoiceDate: '', dueDate: '', amount: sumBy(rows, row => row.amount), paid: sumBy(rows, row => row.paid), balance: sumBy(rows, row => row.balance), status: '', _grandTotal: true });
    return {
        title: 'Outstanding Payables',
        subtitle: 'All unpaid and partially paid vendor invoices.',
        columns: [
            { key: 'invoice', header: 'Invoice' },
            { key: 'vendor', header: 'Vendor' },
            { key: 'invoiceDate', header: 'Invoice Date', type: 'date' },
            { key: 'dueDate', header: 'Due Date', type: 'date' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'paid', header: 'Paid', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows
    };
};

const buildVatReturn = ctx => {
    const tax = ctx.reportData.taxDashboard || {};
    const outputTax = toNumber(tax.outputTax);
    const inputTax = toNumber(tax.inputTax);
    const taxableSalesBase = toNumber(tax.taxableSalesBase);
    const taxablePurchaseBase = toNumber(tax.taxablePurchaseBase);
    const zeroRatedSales = sumBy((ctx.rawData.salesInvoices || []).filter(inv => !isDraftOrCancelled(inv) && dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo) && toNumber(inv.taxTotal) === 0), inv => inv.subTotal);
    const rows = [
        { box: 'Box 1', description: 'Standard rated supplies', taxableAmount: taxableSalesBase, vatAmount: outputTax },
        { box: 'Box 2', description: 'Zero-rated supplies', taxableAmount: zeroRatedSales, vatAmount: 0 },
        { box: 'Box 3', description: 'Exempt supplies', taxableAmount: 0, vatAmount: 0 },
        { box: 'Box 4', description: 'Total supplies (Box 1+2+3)', taxableAmount: taxableSalesBase + zeroRatedSales, vatAmount: outputTax, _total: true },
        { box: 'Box 5', description: 'Taxable expenses with input VAT', taxableAmount: taxablePurchaseBase, vatAmount: inputTax },
        { box: 'Box 6', description: 'Input VAT recoverable', taxableAmount: null, vatAmount: inputTax },
        { box: 'Box 7', description: 'VAT payable / (refundable)', taxableAmount: null, vatAmount: outputTax - inputTax, _grandTotal: true }
    ];
    return {
        title: 'VAT Return Summary',
        subtitle: 'UAE VAT return summary from tax ledger roles and posted documents.',
        columns: [
            { key: 'box', header: 'Box' },
            { key: 'description', header: 'Description' },
            { key: 'taxableAmount', header: 'Taxable Amount', type: 'currency' },
            { key: 'vatAmount', header: 'VAT Amount', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Output VAT', value: outputTax, type: 'currency' },
            { label: 'Input VAT Recoverable', value: inputTax, type: 'currency' },
            { label: 'Net VAT Payable', value: outputTax - inputTax, type: 'currency' }
        ]
    };
};

const buildOutputTaxRegister = ctx => {
    const rows = (ctx.rawData.salesInvoices || [])
        .filter(inv => !isDraftOrCancelled(inv))
        .filter(inv => dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(inv => branchMatches(inv, ctx.branches, ctx.filters.branchId))
        .filter(inv => rowMatchesQuery(inv, ctx.filters.accountQuery))
        .map(inv => ({
            date: inv.invoiceDate,
            taxInvoiceNo: inv.invoiceNumber,
            customer: inv.customerName,
            taxableAmount: toNumber(inv.subTotal),
            vatRate: toNumber(inv.subTotal) ? (toNumber(inv.taxTotal) / toNumber(inv.subTotal)) * 100 : 0,
            vat: toNumber(inv.taxTotal),
            total: toNumber(inv.invoiceTotal)
        }));
    rows.push({ date: '', taxInvoiceNo: '', customer: 'Total', taxableAmount: sumBy(rows, row => row.taxableAmount), vatRate: null, vat: sumBy(rows, row => row.vat), total: sumBy(rows, row => row.total), _grandTotal: true });
    return {
        title: 'Output Tax Register',
        subtitle: 'Taxable sales invoices with output VAT detail.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'taxInvoiceNo', header: 'Tax Invoice No.' },
            { key: 'customer', header: 'Customer' },
            { key: 'taxableAmount', header: 'Taxable Amount', type: 'currency' },
            { key: 'vatRate', header: 'VAT Rate', type: 'percent' },
            { key: 'vat', header: 'VAT', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' }
        ],
        rows
    };
};

const buildInputTaxRegister = ctx => {
    const rows = (ctx.rawData.purchaseInvoices || [])
        .filter(inv => !isDraftOrCancelled(inv))
        .filter(inv => dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(inv => branchMatches(inv, ctx.branches, ctx.filters.branchId))
        .filter(inv => rowMatchesQuery(inv, ctx.filters.accountQuery))
        .map(inv => ({
            date: inv.invoiceDate,
            supplierInvoice: inv.vendorInvoiceNo || inv.invoiceNumber,
            vendor: inv.vendorName,
            taxable: toNumber(inv.subTotal),
            inputVat: toNumber(inv.taxTotal),
            recoverable: toNumber(inv.taxTotal)
        }));
    rows.push({ date: '', supplierInvoice: '', vendor: 'Total', taxable: sumBy(rows, row => row.taxable), inputVat: sumBy(rows, row => row.inputVat), recoverable: sumBy(rows, row => row.recoverable), _grandTotal: true });
    return {
        title: 'Input Tax Register',
        subtitle: 'Eligible purchase and expense input VAT.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'supplierInvoice', header: 'Supplier Invoice' },
            { key: 'vendor', header: 'Vendor' },
            { key: 'taxable', header: 'Taxable', type: 'currency' },
            { key: 'inputVat', header: 'Input VAT', type: 'currency' },
            { key: 'recoverable', header: 'Recoverable', type: 'currency' }
        ],
        rows
    };
};

const buildJournalAuditLog = ctx => {
    const rows = (ctx.rawData.journalVouchers || [])
        .filter(jv => dateInRange(jv.date, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(jv => rowMatchesQuery(jv, ctx.filters.accountQuery) || (jv.lines || []).some(line => rowMatchesQuery(line, ctx.filters.accountQuery)))
        .flatMap(jv => (jv.lines || []).map(line => ({
            journalRef: jv.entryNumber || jv.reference || jv.id,
            date: jv.date,
            postedBy: jv.postedBy || jv.preparedBy || jv.createdBy || '-',
            account: line.account || line.accountCode,
            debit: toNumber(line.debit),
            credit: toNumber(line.credit),
            reason: jv.narration || line.description || '-',
            approvedBy: jv.status || '-'
        })));
    return {
        title: 'Journal Audit Log',
        subtitle: 'Manual journal entries with users, reason and approval state.',
        columns: [
            { key: 'journalRef', header: 'Journal Ref.' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'postedBy', header: 'Posted By' },
            { key: 'account', header: 'Account' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' },
            { key: 'reason', header: 'Reason' },
            { key: 'approvedBy', header: 'Status', type: 'badge' }
        ],
        rows
    };
};

const buildPeriodCloseChecklist = ctx => {
    const tb = buildTrialBalance(ctx);
    const bankPending = ctx.periodEntries.filter(entry => isBankAccount(ctx.accountByCode.get(String(entry.accountCode))) && !entry.reconciled).length;
    const draftSales = (ctx.rawData.salesInvoices || []).filter(isDraftOrCancelled).length;
    const draftPurchases = (ctx.rawData.purchaseInvoices || []).filter(isDraftOrCancelled).length;
    const pendingJournals = (ctx.rawData.journalVouchers || []).filter(jv => !lower(jv.status).includes('post')).length;
    const rows = [
        { no: 1, task: 'Trial balance review', owner: 'Finance', deadline: ctx.filters.dateTo, status: Math.abs(toNumber(tb.cards?.[2]?.value)) < 0.01 ? 'Done' : 'Pending' },
        { no: 2, task: 'Reconcile bank accounts', owner: 'Finance', deadline: ctx.filters.dateTo, status: bankPending === 0 ? 'Done' : 'Pending' },
        { no: 3, task: 'Post sales invoices', owner: 'Sales', deadline: ctx.filters.dateTo, status: draftSales === 0 ? 'Done' : 'Pending' },
        { no: 4, task: 'Approve purchase invoices', owner: 'Purchases', deadline: ctx.filters.dateTo, status: draftPurchases === 0 ? 'Done' : 'Pending' },
        { no: 5, task: 'Post manual journals', owner: 'Accountant', deadline: ctx.filters.dateTo, status: pendingJournals === 0 ? 'Done' : 'Pending' },
        { no: 6, task: 'Review VAT ledger', owner: 'Tax', deadline: ctx.filters.dateTo, status: ctx.reportData.taxDashboard ? 'Done' : 'Pending' },
        { no: 7, task: 'Review PDC schedule', owner: 'Treasury', deadline: ctx.filters.dateTo, status: (ctx.rawData.pdcs || []).some(pdc => lower(pdc.status).includes('received')) ? 'Pending' : 'Done' },
        { no: 8, task: 'Lock accounting period', owner: 'System Admin', deadline: ctx.filters.dateTo, status: 'Pending' }
    ];
    const done = rows.filter(row => row.status === 'Done').length;
    return {
        title: 'Period Close Checklist',
        subtitle: 'Month-end close readiness derived from live ledgers and documents.',
        columns: [
            { key: 'no', header: '#' },
            { key: 'task', header: 'Task' },
            { key: 'owner', header: 'Owner' },
            { key: 'deadline', header: 'Deadline', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows,
        cards: [
            { label: 'Completed', value: `${done}/${rows.length}` },
            { label: 'Pending Tasks', value: rows.length - done, type: 'number' }
        ],
        progress: rows.length ? (done / rows.length) * 100 : 0
    };
};

const buildUserActivity = ctx => {
    const rows = (ctx.rawData.auditLogs || [])
        .filter(log => dateInRange(log.timestamp, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(log => rowMatchesQuery(log, ctx.filters.accountQuery))
        .map(log => ({
            timestamp: log.timestamp,
            user: log.username || log.userId || '-',
            action: log.action,
            module: log.entityType,
            detail: log.details || log.entityId,
            risk: riskForAudit(log)
        }));
    return {
        title: 'User Activity Report',
        subtitle: 'Financial audit events with user, action and risk.',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'datetime' },
            { key: 'user', header: 'User' },
            { key: 'action', header: 'Action' },
            { key: 'module', header: 'Module' },
            { key: 'detail', header: 'Detail' },
            { key: 'risk', header: 'Risk', type: 'badge' }
        ],
        rows,
        note: ctx.rawData.auditLogsUnavailable ? 'Audit log access is unavailable for the signed-in role.' : null
    };
};

const buildPdcReceived = ctx => {
    const rows = (ctx.rawData.pdcs || [])
        .filter(pdc => dateInRange(pdc.receivedDate || pdc.chequeDate, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(pdc => rowMatchesQuery(pdc, ctx.filters.accountQuery))
        .map(pdc => ({
            ref: `PDCR-${String(pdc.id || '').padStart(3, '0')}`,
            customer: pdc.customerName || pdc.customerCode,
            draweeBank: pdc.bankName,
            chequeNo: pdc.chequeNumber,
            amount: toNumber(pdc.amount),
            dueDate: pdc.chequeDate,
            depositDate: lower(pdc.status).includes('clear') ? pdc.updatedAt || pdc.chequeDate : null,
            status: pdc.status
        }));
    return {
        title: 'PDC Received',
        subtitle: 'Post-dated cheques received from customers.',
        columns: [
            { key: 'ref', header: 'Ref #' },
            { key: 'customer', header: 'Customer' },
            { key: 'draweeBank', header: 'Drawee Bank' },
            { key: 'chequeNo', header: 'Cheque No.' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'dueDate', header: 'Due Date', type: 'date' },
            { key: 'depositDate', header: 'Deposit Date', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows,
        cards: [
            { label: 'Total PDCs', value: sumBy(rows, row => row.amount), type: 'currency' },
            { label: 'Pending', value: sumBy(rows.filter(row => !lower(row.status).includes('clear')), row => row.amount), type: 'currency' },
            { label: 'Cleared', value: sumBy(rows.filter(row => lower(row.status).includes('clear')), row => row.amount), type: 'currency' }
        ]
    };
};

const buildPdcIssued = ctx => {
    const rows = (ctx.rawData.paymentVouchers || [])
        .filter(voucher => /cheque|check/i.test(voucher.paymentMode || ''))
        .filter(voucher => dateInRange(voucher.chequeDate || voucher.paymentDate, ctx.filters.dateFrom, ctx.filters.dateTo))
        .filter(voucher => rowMatchesQuery(voucher, ctx.filters.accountQuery))
        .map(voucher => ({
            ref: voucher.voucherNumber || `PDCI-${String(voucher.id || '').padStart(3, '0')}`,
            vendor: voucher.vendorName,
            draweeBank: voucher.bankAccount,
            chequeNo: voucher.referenceNumber,
            amount: toNumber(voucher.amount),
            dueDate: voucher.chequeDate || voucher.paymentDate,
            status: voucher.status
        }));
    return {
        title: 'PDC Issued',
        subtitle: 'Post-dated cheques issued to vendors.',
        columns: [
            { key: 'ref', header: 'Ref #' },
            { key: 'vendor', header: 'Vendor' },
            { key: 'draweeBank', header: 'Drawee Bank' },
            { key: 'chequeNo', header: 'Cheque No.' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'dueDate', header: 'Due Date', type: 'date' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows,
        cards: [
            { label: 'Total Issued', value: sumBy(rows, row => row.amount), type: 'currency' },
            { label: 'Pending Clearance', value: sumBy(rows.filter(row => !lower(row.status).includes('cleared')), row => row.amount), type: 'currency' },
            { label: 'PDC Count', value: rows.length, type: 'number' }
        ]
    };
};

const buildBankTransferLog = ctx => {
    const bankCodes = new Set(ctx.bankAccounts.map(account => String(account.code)));
    const byVoucher = new Map();
    ctx.periodEntries
        .filter(entry => bankCodes.has(String(entry.accountCode)))
        .forEach(entry => {
            const key = entry.voucherNo || entry.journalId || entry.id;
            const group = byVoucher.get(key) || [];
            group.push(entry);
            byVoucher.set(key, group);
        });
    const rows = Array.from(byVoucher.entries())
        .filter(([, entries]) => entries.length >= 2 || entries.some(entry => /transfer/i.test(`${entry.description} ${entry.type}`)))
        .map(([ref, entries]) => {
            const debitLine = entries.find(entry => toNumber(entry.debitAmount) > 0);
            const creditLine = entries.find(entry => toNumber(entry.creditAmount) > 0);
            return {
                ref,
                date: debitLine?.transactionDate || creditLine?.transactionDate,
                fromAccount: creditLine?.accountName || '-',
                toAccount: debitLine?.accountName || '-',
                amount: Math.max(sumBy(entries, entry => entry.debitAmount), sumBy(entries, entry => entry.creditAmount)),
                mode: 'Internal',
                transferRef: debitLine?.journalId || creditLine?.journalId || '-',
                status: entries.every(entry => entry.reconciled) ? 'Completed' : 'Pending'
            };
        });
    return {
        title: 'Bank Transfer Log',
        subtitle: 'Inter-bank and intra-company fund transfer entries.',
        columns: [
            { key: 'ref', header: 'Ref #' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'fromAccount', header: 'From Account' },
            { key: 'toAccount', header: 'To Account / Beneficiary' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'mode', header: 'Mode', type: 'badge' },
            { key: 'transferRef', header: 'Transfer Ref' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows
    };
};

const buildChequeRegister = ctx => {
    const issued = buildPdcIssued(ctx).rows.map(row => ({ chequeNo: row.chequeNo, date: row.dueDate, payee: row.vendor, bankAccount: row.draweeBank, amount: row.amount, memo: row.ref, status: row.status, type: 'Issued' }));
    const received = buildPdcReceived(ctx).rows.map(row => ({ chequeNo: row.chequeNo, date: row.dueDate, payee: row.customer, bankAccount: row.draweeBank, amount: row.amount, memo: row.ref, status: row.status, type: 'Received' }));
    const rows = [...issued, ...received].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    return {
        title: 'Cheque Register',
        subtitle: 'All cheques issued and received with clearance status.',
        columns: [
            { key: 'chequeNo', header: 'Cheque No.' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'payee', header: 'Payee / Drawer' },
            { key: 'bankAccount', header: 'Bank Account' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'memo', header: 'Memo' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows,
        cards: [
            { label: 'Total Cheques', value: rows.length, type: 'number' },
            { label: 'Cleared', value: rows.filter(row => lower(row.status).includes('clear')).length, type: 'number' },
            { label: 'Outstanding', value: sumBy(rows.filter(row => !lower(row.status).includes('clear')), row => row.amount), type: 'currency' }
        ]
    };
};

const buildBankCharges = ctx => {
    const rows = ctx.periodEntries
        .filter(entry => /bank charge|bank fee|service fee|interest|commission|rtgs|swift|overdraft/i.test(`${entry.accountName} ${entry.description} ${entry.type}`))
        .map(entry => ({
            date: entry.transactionDate,
            bankAccount: entry.accountName,
            chargeType: entry.description || entry.type || 'Bank Charge',
            ref: entry.voucherNo || entry.journalId,
            amount: abs(toNumber(entry.debitAmount) - toNumber(entry.creditAmount)),
            vat: 0,
            total: abs(toNumber(entry.debitAmount) - toNumber(entry.creditAmount))
        }));
    rows.push({ date: '', bankAccount: 'Total', chargeType: '', ref: '', amount: sumBy(rows, row => row.amount), vat: sumBy(rows, row => row.vat), total: sumBy(rows, row => row.total), _grandTotal: true });
    return {
        title: 'Bank Charges Summary',
        subtitle: 'Fees, commissions and interest charges by account.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'bankAccount', header: 'Bank Account' },
            { key: 'chargeType', header: 'Charge Type' },
            { key: 'ref', header: 'Ref #' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'vat', header: 'VAT', type: 'currency' },
            { key: 'total', header: 'Total', type: 'currency' }
        ],
        rows,
        chart: { title: 'Charges by Bank', data: rows.filter(row => !row._grandTotal).map(row => ({ name: row.bankAccount, value: row.total })) },
        cards: [
            { label: 'Total Charges', value: sumBy(rows, row => row.total), type: 'currency' },
            { label: 'Charge Items', value: Math.max(rows.length - 1, 0), type: 'number' }
        ]
    };
};

const buildBankPosition = ctx => {
    const rows = ctx.bankAccounts.map(account => {
        const opening = accountOpening(ctx, account.code, ctx.filters.dateFrom);
        const entries = accountEntries(ctx, account.code);
        const receipts = sumBy(entries, entry => entry.debitAmount);
        const payments = sumBy(entries, entry => entry.creditAmount);
        const closing = opening + receipts - payments;
        return {
            bank: account.name || account.code,
            accountNo: account.code,
            currency: 'AED',
            opening,
            receipts,
            payments,
            closing,
            available: closing
        };
    });
    rows.push({ bank: 'Total', accountNo: '', currency: '', opening: sumBy(rows, row => row.opening), receipts: sumBy(rows, row => row.receipts), payments: sumBy(rows, row => row.payments), closing: sumBy(rows, row => row.closing), available: sumBy(rows, row => row.available), _grandTotal: true });
    return {
        title: 'Bank Position Summary',
        subtitle: 'Consolidated balances across all bank accounts.',
        columns: [
            { key: 'bank', header: 'Bank' },
            { key: 'accountNo', header: 'Account No.' },
            { key: 'currency', header: 'CCY' },
            { key: 'opening', header: 'Opening', type: 'currency' },
            { key: 'receipts', header: 'Receipts', type: 'currency' },
            { key: 'payments', header: 'Payments', type: 'currency' },
            { key: 'closing', header: 'Closing', type: 'currency' },
            { key: 'available', header: 'Available', type: 'currency' }
        ],
        rows,
        chart: { title: 'Closing Balance by Bank', data: rows.filter(row => !row._grandTotal).map(row => ({ name: row.bank, value: row.closing })) },
        cards: [
            { label: 'Opening Position', value: sumBy(rows, row => row.opening), type: 'currency' },
            { label: 'Total Receipts', value: sumBy(rows, row => row.receipts), type: 'currency' },
            { label: 'Total Payments', value: sumBy(rows, row => row.payments), type: 'currency' },
            { label: 'Closing Position', value: sumBy(rows, row => row.closing), type: 'currency' }
        ]
    };
};

const selectCustomer = ctx => {
    const q = lower(ctx.filters.accountQuery).trim();
    return (ctx.rawData.customers || []).find(customer => q && rowMatchesQuery(customer, q)) || (ctx.rawData.customers || [])[0];
};

const selectVendor = ctx => {
    const q = lower(ctx.filters.accountQuery).trim();
    return (ctx.rawData.vendors || []).find(vendor => q && rowMatchesQuery(vendor, q)) || (ctx.rawData.vendors || [])[0];
};

const buildCustomerStatement = ctx => {
    const customer = selectCustomer(ctx);
    const code = customer?.code || customer?.name;
    let running = toNumber(customer?.balance) - sumBy((ctx.rawData.salesInvoices || []).filter(inv => (inv.customerCode === code || inv.customerName === customer?.name) && dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo)), inv => inv.balance);
    const rows = [
        { date: ctx.filters.dateFrom, ref: 'OB', type: 'Balance B/F', narration: 'Opening Balance', debit: null, credit: null, balance: running, _section: true },
        ...(ctx.rawData.salesInvoices || [])
            .filter(inv => !isDraftOrCancelled(inv))
            .filter(inv => inv.customerCode === code || inv.customerName === customer?.name)
            .filter(inv => dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo))
            .map(inv => ({ date: inv.invoiceDate, ref: inv.invoiceNumber, type: 'Invoice', narration: `Invoice - ${inv.invoiceNumber}`, debit: toNumber(inv.invoiceTotal), credit: null })),
        ...(ctx.rawData.receiptVouchers || [])
            .filter(rv => rv.customerCode === code || rv.memberName === customer?.name)
            .filter(rv => dateInRange(rv.date, ctx.filters.dateFrom, ctx.filters.dateTo))
            .map(rv => ({ date: rv.date, ref: rv.voucherId, type: 'Receipt', narration: rv.reference || rv.notes || 'Receipt', debit: null, credit: toNumber(rv.amount) }))
    ].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    rows.forEach(row => {
        if (row._section) return;
        running += toNumber(row.debit) - toNumber(row.credit);
        row.balance = running;
    });
    return {
        title: 'Customer Statement of Account',
        subtitle: customer ? `Invoices, receipts and running balance for ${customer.name || customer.code}.` : 'No customer records found.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'ref', header: 'Ref #' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'narration', header: 'Narration' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Credit Limit', value: customer?.creditLimitAmount || customer?.creditLimit, type: 'currency' },
            { label: 'Total Invoiced', value: sumBy(rows, row => row.debit), type: 'currency' },
            { label: 'Total Received', value: sumBy(rows, row => row.credit), type: 'currency' },
            { label: 'Closing Balance', value: running, type: 'currency' }
        ]
    };
};

const buildVendorStatement = ctx => {
    const vendor = selectVendor(ctx);
    const key = vendor?.name || vendor?.code;
    let running = toNumber(vendor?.balance || vendor?.openingBalance);
    const rows = [
        { date: ctx.filters.dateFrom, ref: 'OB', type: 'Balance B/F', narration: 'Opening Balance', debit: null, credit: null, balance: running, _section: true },
        ...(ctx.rawData.purchaseInvoices || [])
            .filter(inv => !isDraftOrCancelled(inv))
            .filter(inv => inv.vendorName === key || inv.vendorName === vendor?.name)
            .filter(inv => dateInRange(inv.invoiceDate, ctx.filters.dateFrom, ctx.filters.dateTo))
            .map(inv => ({ date: inv.invoiceDate, ref: inv.invoiceNumber, type: 'Bill', narration: `Purchase Bill - ${inv.invoiceNumber}`, debit: null, credit: toNumber(inv.grandTotal) })),
        ...(ctx.rawData.paymentVouchers || [])
            .filter(voucher => voucher.vendorName === key || voucher.vendorId === vendor?.code)
            .filter(voucher => dateInRange(voucher.paymentDate, ctx.filters.dateFrom, ctx.filters.dateTo))
            .map(voucher => ({ date: voucher.paymentDate, ref: voucher.voucherNumber, type: 'Payment', narration: voucher.notes || voucher.referenceNumber || 'Payment', debit: toNumber(voucher.amount), credit: null }))
    ].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    rows.forEach(row => {
        if (row._section) return;
        running += toNumber(row.credit) - toNumber(row.debit);
        row.balance = running;
    });
    return {
        title: 'Vendor Statement of Account',
        subtitle: vendor ? `Bills, payments and running balance for ${vendor.name || vendor.code}.` : 'No vendor records found.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'ref', header: 'Ref #' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'narration', header: 'Narration' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Opening Balance', value: vendor?.openingBalance, type: 'currency' },
            { label: 'Total Bills', value: sumBy(rows, row => row.credit), type: 'currency' },
            { label: 'Total Paid', value: sumBy(rows, row => row.debit), type: 'currency' },
            { label: 'Balance Payable', value: running, type: 'currency' }
        ]
    };
};

const buildEmployeeLedger = ctx => {
    const employee = (ctx.rawData.employees || [])[0];
    const employeeName = employee?.name || employee?.employeeName || [employee?.firstName, employee?.lastName].filter(Boolean).join(' ');
    const payrollRows = (ctx.rawData.payrollList || []).filter(row => !employeeName || lower(row.name || row.employeeName).includes(lower(employeeName)));
    const advanceRows = (ctx.rawData.salaryAdvances || []).filter(row => !employee?.id || String(row.employeeId || row.employee?.id) === String(employee.id));
    let running = 0;
    const rows = [
        ...payrollRows.map(row => ({ date: ctx.filters.dateFrom, ref: row.id || row.employeeId, type: 'Salary', narration: 'Payroll earning', earnings: toNumber(row.net || row.payable || row.base), deductions: toNumber(row.deduct || row.deductions) })),
        ...advanceRows.map(row => ({ date: row.requestDate || row.date || ctx.filters.dateFrom, ref: row.id, type: 'Advance', narration: row.reason || 'Salary advance', earnings: 0, deductions: toNumber(row.amount || row.requestedAmount) }))
    ].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    rows.forEach(row => {
        running += toNumber(row.earnings) - toNumber(row.deductions);
        row.balance = running;
    });
    return {
        title: 'Employee Ledger Statement',
        subtitle: employeeName ? `Salary, allowances and advances for ${employeeName}.` : 'No employee payroll records found.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'ref', header: 'Ref #' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'narration', header: 'Narration' },
            { key: 'earnings', header: 'Earnings', type: 'currency' },
            { key: 'deductions', header: 'Deductions', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Total Earnings', value: sumBy(rows, row => row.earnings), type: 'currency' },
            { label: 'Total Deductions', value: sumBy(rows, row => row.deductions), type: 'currency' },
            { label: 'Net Payable', value: running, type: 'currency' }
        ]
    };
};

const getSelectedLedgerAccount = ctx => {
    const q = lower(ctx.filters.accountQuery).trim();
    if (q) {
        const match = ctx.accounts.find(account => rowMatchesQuery(account, q));
        if (match) return match;
    }
    return getSelectedBankAccount(ctx) || ctx.accounts.find(account => !account.isGroup);
};

const buildLedgerAccountStatement = ctx => {
    const account = getSelectedLedgerAccount(ctx);
    const opening = account ? accountOpening(ctx, account.code, ctx.filters.dateFrom) : 0;
    let running = opening;
    const rows = account ? [
        { date: ctx.filters.dateFrom, ref: 'OB', narration: 'Opening Balance', debit: null, credit: null, balance: opening, _section: true },
        ...accountEntries(ctx, account.code).map(entry => {
            running += toNumber(entry.debitAmount) - toNumber(entry.creditAmount);
            return {
                date: entry.transactionDate,
                ref: entry.voucherNo || entry.journalId,
                narration: entry.description || entry.type || entry.accountName,
                debit: toNumber(entry.debitAmount) || null,
                credit: toNumber(entry.creditAmount) || null,
                balance: running
            };
        }),
        { date: ctx.filters.dateTo, ref: 'CB', narration: 'Closing Balance', debit: null, credit: null, balance: running, _grandTotal: true }
    ] : [];
    return {
        title: 'Ledger Account Statement',
        subtitle: account ? `Full debit and credit movement for ${account.name || account.code}.` : 'No ledger account found.',
        columns: [
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'ref', header: 'Ref #' },
            { key: 'narration', header: 'Narration' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' },
            { key: 'balance', header: 'Balance', type: 'currency' }
        ],
        rows,
        cards: [
            { label: 'Opening Balance', value: opening, type: 'currency' },
            { label: 'Total Debits', value: sumBy(rows, row => row.debit), type: 'currency' },
            { label: 'Total Credits', value: sumBy(rows, row => row.credit), type: 'currency' },
            { label: 'Net Movement', value: running - opening, type: 'currency' }
        ]
    };
};

const buildAllAccountsStatement = ctx => {
    const rows = ctx.accounts
        .filter(account => !account.isGroup && !isArchiveStatus(account))
        .filter(account => branchMatches(account, ctx.branches, ctx.filters.branchId))
        .filter(account => rowMatchesQuery(account, ctx.filters.accountQuery))
        .map(account => {
            const opening = accountOpening(ctx, account.code, ctx.filters.dateFrom);
            const entries = accountEntries(ctx, account.code);
            const debit = sumBy(entries, entry => entry.debitAmount);
            const credit = sumBy(entries, entry => entry.creditAmount);
            return {
                code: account.code,
                accountName: account.name,
                type: accountGroup(account),
                opening,
                debit,
                credit,
                closing: opening + debit - credit
            };
        });
    rows.push({ code: '', accountName: `Total (${rows.length} accounts)`, type: '', opening: sumBy(rows, row => row.opening), debit: sumBy(rows, row => row.debit), credit: sumBy(rows, row => row.credit), closing: sumBy(rows, row => row.closing), _grandTotal: true });
    return {
        title: 'All Accounts Statement',
        subtitle: 'Opening, movement and closing balance for every GL account.',
        columns: [
            { key: 'code', header: 'Code' },
            { key: 'accountName', header: 'Account Name' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'opening', header: 'Opening', type: 'currency' },
            { key: 'debit', header: 'Debit', type: 'currency' },
            { key: 'credit', header: 'Credit', type: 'currency' },
            { key: 'closing', header: 'Closing', type: 'currency' }
        ],
        rows
    };
};

const buildIntercompany = ctx => {
    const rows = ctx.periodEntries
        .filter(entry => /intercompany|related party|group|due from|due to/i.test(`${entry.accountName} ${entry.description}`))
        .map(entry => ({
            ref: entry.voucherNo || entry.journalId,
            date: entry.transactionDate,
            fromEntity: entry.costCenter || 'Company',
            toEntity: entry.accountName,
            type: entry.type || 'Ledger',
            narration: entry.description,
            amount: toNumber(entry.debitAmount) - toNumber(entry.creditAmount),
            status: entry.reconciled ? 'Confirmed' : 'Pending'
        }));
    return {
        title: 'Intercompany Statement',
        subtitle: 'Cross-entity balances and transactions for group reconciliation.',
        columns: [
            { key: 'ref', header: 'Ref #' },
            { key: 'date', header: 'Date', type: 'date' },
            { key: 'fromEntity', header: 'From Entity' },
            { key: 'toEntity', header: 'To Entity' },
            { key: 'type', header: 'Type', type: 'badge' },
            { key: 'narration', header: 'Narration' },
            { key: 'amount', header: 'Amount', type: 'currency' },
            { key: 'status', header: 'Status', type: 'badge' }
        ],
        rows,
        note: rows.length === 0 ? 'No intercompany ledger entries were found for the selected period.' : null
    };
};

const REPORT_BUILDERS = {
    'profit-loss-statement': buildProfitLossStatement,
    'gross-profit-analysis': buildGrossProfit,
    'departmental-pl': buildDepartmentalPl,
    'comparative-pl': buildComparativePl,
    'financial-position': buildFinancialPosition,
    'trial-balance': buildTrialBalance,
    'cash-flow-statement': buildCashFlow,
    'bank-reconciliation': buildBankReconciliation,
    'petty-cash-statement': buildPettyCash,
    'customer-aging': buildCustomerAging,
    'collection-efficiency': buildCollectionEfficiency,
    'credit-utilization': buildCreditUtilization,
    'vendor-aging': buildVendorAging,
    'payment-schedule': buildPaymentSchedule,
    'outstanding-payables': buildOutstandingPayables,
    'vat-return-summary': buildVatReturn,
    'output-tax-register': buildOutputTaxRegister,
    'input-tax-register': buildInputTaxRegister,
    'journal-audit-log': buildJournalAuditLog,
    'period-close-checklist': buildPeriodCloseChecklist,
    'user-activity-report': buildUserActivity,
    'bank-book': buildBankBook,
    'pdc-received': buildPdcReceived,
    'pdc-issued': buildPdcIssued,
    'bank-transfer-log': buildBankTransferLog,
    'cheque-register': buildChequeRegister,
    'bank-charges-summary': buildBankCharges,
    'bank-position-summary': buildBankPosition,
    'customer-statement': buildCustomerStatement,
    'vendor-statement': buildVendorStatement,
    'employee-ledger': buildEmployeeLedger,
    'ledger-account-statement': buildLedgerAccountStatement,
    'all-accounts-statement': buildAllAccountsStatement,
    'intercompany-statement': buildIntercompany
};

const flattenReportRows = report => {
    if (!report) return [];
    const sourceRows = report.layout === 'split'
        ? [
            { account: report.leftTitle, amount: null },
            ...(report.leftRows || []),
            { account: report.rightTitle, amount: null },
            ...(report.rightRows || [])
        ]
        : report.rows || [];
    return sourceRows.map(row => {
        const clean = {};
        Object.entries(row).forEach(([key, value]) => {
            if (!key.startsWith('_') && key !== 'days') clean[key] = value ?? '';
        });
        return clean;
    });
};

const ChartBlock = ({ chart, index = 0 }) => {
    const data = (chart?.data || []).filter(row => Number.isFinite(toNumber(row.value)) && row.value !== 0);
    if (!chart || data.length === 0) return null;
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-950">{chart.title}</h3>
            <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={value => Number(value).toLocaleString('en-AE')} />
                        <Tooltip formatter={value => Number(value).toLocaleString('en-AE', { maximumFractionDigits: 2 })} />
                        <Bar dataKey="value" fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={72} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const TableView = ({ columns = [], rows = [], currency, minWidth = 980, framed = true, onResetFilters }) => {
    const table = (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth }}>
                <thead className="bg-slate-50">
                    <tr>
                        {columns.map(column => (
                            <th key={column.key} className={`border-b border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-600 ${['currency', 'number', 'percent', 'progress'].includes(column.type) ? 'text-right' : 'text-left'}`}>
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length > 0 ? rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={`${row._grandTotal ? 'bg-yellow-50 font-bold' : row._total ? 'bg-slate-50 font-bold' : row._section ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50'} border-b border-slate-100`}>
                            {columns.map((column, columnIndex) => (
                                <td key={column.key} className={`px-3 py-2.5 ${row._indent && columnIndex === 0 ? 'pl-6' : ''} ${['currency', 'number', 'percent', 'progress'].includes(column.type) ? 'text-right tabular-nums' : ''}`}>
                                    {renderTableCell(row, column, currency)}
                                </td>
                            ))}
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={Math.max(columns.length, 1)} className="px-4 py-14 text-center">
                                <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4">
                                    <div className="text-sm font-semibold text-slate-500">No live records found for the selected filters.</div>
                                    <div className="text-xs leading-relaxed text-slate-400">
                                        The report is ready, but the selected date, branch, account, customer, vendor, or cost centre does not match any live rows.
                                    </div>
                                    {onResetFilters && (
                                        <button
                                            type="button"
                                            onClick={onResetFilters}
                                            className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-yellow-100"
                                        >
                                            Reset filters
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    if (!framed) return table;
    return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{table}</div>;
};

const renderTableCell = (row, column, currency) => {
    const value = row[column.key];
    if (value === null || value === undefined || value === '') {
        return <span className="text-slate-400">-</span>;
    }
    if (column.type === 'currency') {
        return <CurrencyAmount value={value} currency={currency} decimals={2} className={toNumber(value) < 0 ? 'text-red-600' : ''} />;
    }
    if (column.type === 'percent') {
        return <span className={toNumber(value) < 0 ? 'text-red-600' : toNumber(value) > 0 ? 'text-emerald-600' : ''}>{toNumber(value).toLocaleString('en-AE', { maximumFractionDigits: 1 })}%</span>;
    }
    if (column.type === 'number') return toNumber(value).toLocaleString('en-AE');
    if (column.type === 'date') return formatDate(value);
    if (column.type === 'datetime') return value ? new Date(value).toLocaleString('en-GB') : '-';
    if (column.type === 'badge') {
        return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(value)}`}>{String(value)}</span>;
    }
    if (column.type === 'progress') {
        const pct = Math.max(0, Math.min(100, toNumber(value)));
        return (
            <div className="ml-auto flex w-36 items-center justify-end gap-2">
                <div className="h-1.5 w-20 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct.toLocaleString('en-AE', { maximumFractionDigits: 1 })}%</span>
            </div>
        );
    }
    return String(value);
};

const getReportRowCount = report => {
    if (!report) return 0;
    if (report.layout === 'split') return (report.leftRows || []).length + (report.rightRows || []).length;
    return (report.rows || []).length;
};

const ReportResult = ({
    report,
    currency,
    appliedFilters,
    activeMeta,
    loading,
    onExportExcel,
    onExportPdf,
    onPrint,
    onResetFilters
}) => {
    const rowCount = getReportRowCount(report);
    const charts = report.chart ? [report.chart] : (report.charts || []);

    return (
        <div className="flex flex-col gap-4">
            {report.progress != null && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                        <span>Close readiness</span>
                        <span>{Math.round(report.progress)}% complete</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, report.progress))}%` }} />
                    </div>
                </div>
            )}

            {(report.cards || []).length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {report.cards.map(card => (
                        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="text-[11px] font-semibold text-slate-500">{card.label}</div>
                            <div className="mt-2 truncate text-xl font-black text-slate-950">{metricValue(card, currency)}</div>
                            {card.sub && <div className="mt-1 text-[11px] text-slate-400">{card.sub}</div>}
                        </div>
                    ))}
                </div>
            )}

            {charts.length > 0 && (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {charts.map((chart, index) => <ChartBlock key={chart.title || index} chart={chart} index={index} />)}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-950">{report.title || activeMeta.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{report.subtitle || activeMeta.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right text-[11px] text-slate-500">
                            <div>Period: <span className="font-bold text-slate-800">{formatShortPeriod(appliedFilters.dateFrom, appliedFilters.dateTo)}</span></div>
                            <div>Branch: <span className="font-bold text-slate-800">{appliedFilters.branchId === 'All' ? 'All Branches' : appliedFilters.branchId}</span></div>
                            <div>{rowCount} row(s)</div>
                        </div>
                        <ExportDropdown
                            onExportExcel={onExportExcel}
                            onExportPdf={onExportPdf}
                            onPrint={onPrint}
                            disabled={rowCount === 0 || loading}
                        />
                    </div>
                </div>

                {report.layout === 'split' ? (
                    <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
                        <div>
                            <div className="mb-2 text-[11px] font-bold uppercase text-slate-500">{report.leftTitle}</div>
                            <TableView columns={report.columns} rows={report.leftRows || []} currency={currency} minWidth={520} onResetFilters={onResetFilters} />
                        </div>
                        <div>
                            <div className="mb-2 text-[11px] font-bold uppercase text-slate-500">{report.rightTitle}</div>
                            <TableView columns={report.columns} rows={report.rightRows || []} currency={currency} minWidth={520} onResetFilters={onResetFilters} />
                        </div>
                    </div>
                ) : (
                    <TableView columns={report.columns || []} rows={report.rows || []} currency={currency} framed={false} onResetFilters={onResetFilters} />
                )}
            </div>

            {report.note && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{report.note}</span>
                </div>
            )}

            {activeMeta?.description && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Source: live ledgers and document modules. No mock rows are injected.
                </div>
            )}
        </div>
    );
};

const FinancialReports = () => {
    const { company } = useCompany();
    const { branches: availableBranches, activeBranchId, isAllBranches } = useBranch();
    const currency = company?.currency || 'AED';
    const [activeId, setActiveId] = useState('profit-loss-statement');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState(() => defaultFilters());
    const [appliedFilters, setAppliedFilters] = useState(() => defaultFilters());
    const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(REPORT_GROUPS.map(group => [group.id, group.id === 'profit-loss' || group.id === 'balance-sheet' || group.id === 'cash-flow'])));
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [rawData, setRawData] = useState({
        accounts: [],
        bankAccounts: [],
        costCenters: [],
        transactions: [],
        branches: [],
        salesInvoices: [],
        purchaseInvoices: [],
        receiptVouchers: [],
        paymentVouchers: [],
        customers: [],
        vendors: [],
        journalVouchers: [],
        pdcs: [],
        auditLogs: [],
        employees: [],
        payrollList: [],
        salaryAdvances: []
    });
    const [reportData, setReportData] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadErrors, setLoadErrors] = useState([]);
    const cacheRef = useRef(new Map());
    const reportListRef = useRef(null);
    const reportBodyRef = useRef(null);
    const { captureScroll } = useReportScrollPreserver([reportListRef, reportBodyRef]);

    const activeMeta = REPORT_LOOKUP.get(activeId) || ALL_REPORTS[0];
    const visibleGroups = useMemo(() => {
        const term = lower(search).trim();
        return REPORT_GROUPS.map(group => ({
            ...group,
            reports: group.reports.filter(report => !term || lower(`${report.title} ${report.description} ${(report.tags || []).join(' ')}`).includes(term))
        })).filter(group => group.reports.length > 0);
    }, [search]);

    const branches = useMemo(() => [{ id: 'All', name: 'All' }, ...(rawData.branches || [])], [rawData.branches]);

    const loadReportData = async (nextFilters = filters, { force = false } = {}) => {
        const cacheKey = JSON.stringify(nextFilters);
        if (!force && cacheRef.current.has(cacheKey)) {
            const cached = cacheRef.current.get(cacheKey);
            setRawData(cached.rawData);
            setReportData(cached.reportData);
            setAppliedFilters(nextFilters);
            setLoadErrors(cached.loadErrors);
            return;
        }

        setLoading(true);
        const { priorFrom, priorTo } = getPriorRange(nextFilters.dateFrom, nextFilters.dateTo);
        const payrollPeriod = monthYearFrom(nextFilters.dateFrom);

        try {
            const results = await settleObject({
                trialBalance: backendReports.getTrialBalance(nextFilters.dateFrom, nextFilters.dateTo),
                profitLoss: backendReports.getProfitLoss(nextFilters.dateFrom, nextFilters.dateTo),
                priorProfitLoss: backendReports.getProfitLoss(priorFrom, priorTo),
                balanceSheet: backendReports.getBalanceSheet(nextFilters.dateTo),
                cashFlow: backendReports.getCashFlow(nextFilters.dateFrom, nextFilters.dateTo),
                expenseAnalysis: backendReports.getExpenseAnalysis(nextFilters.dateFrom, nextFilters.dateTo),
                taxDashboard: backendReports.getTaxDashboard(nextFilters.dateFrom, nextFilters.dateTo),
                taxReconciliation: backendReports.getTaxReconciliation(nextFilters.dateFrom, nextFilters.dateTo),
                arAging: getArAging(nextFilters.dateTo),
                apAging: getApAging(nextFilters.dateTo),
                accounts: getAccounts(),
                bankAccounts: getBankAccounts(),
                costCenters: getCostCenters(),
                transactions: getTransactions(),
                branches: getBranches(),
                salesInvoices: getAllSalesInvoices(),
                purchaseInvoices: getPurchaseInvoices(),
                receiptVouchers: receiptVoucherApi.getAll(),
                paymentVouchers: getPaymentVouchers(),
                customers: getAllCustomers(),
                vendors: getVendors(),
                journalVouchers: journalVoucherApi.getAll(),
                pdcs: getPdcs(),
                auditLogs: getAuditLogs(),
                employees: employeesApi.getAll(),
                payrollList: salaryPaymentApi.getPayrollList(payrollPeriod.month, payrollPeriod.year),
                salaryAdvances: salaryAdvanceApi.getAllRequests()
            });

            const nextRawData = {
                accounts: getResult(results, 'accounts', []),
                bankAccounts: getResult(results, 'bankAccounts', []),
                costCenters: getResult(results, 'costCenters', []),
                transactions: getResult(results, 'transactions', []),
                branches: getResult(results, 'branches', []),
                salesInvoices: getResult(results, 'salesInvoices', []),
                purchaseInvoices: getResult(results, 'purchaseInvoices', []),
                receiptVouchers: getResult(results, 'receiptVouchers', []),
                paymentVouchers: getResult(results, 'paymentVouchers', []),
                customers: getResult(results, 'customers', []),
                vendors: getResult(results, 'vendors', []),
                journalVouchers: getResult(results, 'journalVouchers', []),
                pdcs: getResult(results, 'pdcs', []),
                auditLogs: getResult(results, 'auditLogs', []),
                auditLogsUnavailable: !results.auditLogs?.ok,
                employees: getResult(results, 'employees', []),
                payrollList: getResult(results, 'payrollList', []),
                salaryAdvances: getResult(results, 'salaryAdvances', [])
            };

            const nextReportData = {
                trialBalance: getResult(results, 'trialBalance', null),
                profitLoss: getResult(results, 'profitLoss', null),
                priorProfitLoss: getResult(results, 'priorProfitLoss', null),
                balanceSheet: getResult(results, 'balanceSheet', null),
                cashFlow: getResult(results, 'cashFlow', null),
                expenseAnalysis: getResult(results, 'expenseAnalysis', null),
                taxDashboard: getResult(results, 'taxDashboard', null),
                taxReconciliation: getResult(results, 'taxReconciliation', null),
                arAging: getResult(results, 'arAging', []),
                apAging: getResult(results, 'apAging', []),
                priorFrom,
                priorTo
            };

            const nextErrors = Object.entries(results)
                .filter(([, result]) => !result.ok)
                .map(([key, result]) => ({ key, message: result.error?.response?.data?.message || result.error?.message || 'Unavailable' }));

            setRawData(nextRawData);
            setReportData(nextReportData);
            setAppliedFilters(nextFilters);
            setLoadErrors(nextErrors);
            cacheRef.current.set(cacheKey, { rawData: nextRawData, reportData: nextReportData, loadErrors: nextErrors });

            if (nextErrors.length > 0) {
                toast.error(`${nextErrors.length} live source${nextErrors.length === 1 ? '' : 's'} unavailable. Available reports still loaded.`);
            }
        } catch (error) {
            console.error('Failed to load financial reports', error);
            toast.error('Failed to load financial reports.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReportData(filters, { force: true });
    }, []);

    const context = useMemo(() => createLiveContext(rawData, reportData, appliedFilters), [rawData, reportData, appliedFilters]);

    const activeReport = useMemo(() => {
        const builder = REPORT_BUILDERS[activeId] || buildProfitLossStatement;
        try {
            return builder(context);
        } catch (error) {
            console.error(`Failed to build report ${activeId}`, error);
            return {
                title: activeMeta.title,
                subtitle: 'This report could not be built from the loaded live data.',
                columns: [{ key: 'message', header: 'Message' }],
                rows: [{ message: error.message || 'Report builder error' }]
            };
        }
    }, [activeId, context, activeMeta.title]);

    const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

    const handleGenerate = () => {
        loadReportData(filters, { force: true });
    };

    const resetFilters = () => {
        const nextFilters = defaultFilters();
        setFilters(nextFilters);
        loadReportData(nextFilters, { force: true });
    };

    const exportColumns = activeReport.columns || [{ key: 'account', header: 'Account' }, { key: 'amount', header: 'Amount' }];

    const handleExportExcel = async () => {
        try {
            await exportToExcel(flattenReportRows(activeReport), exportColumns, activeReport.title);
            toast.success('Report exported to Excel');
        } catch (error) {
            toast.error('Failed to export Excel');
        }
    };

    const handleExportPdf = async () => {
        try {
            await exportToPDF(flattenReportRows(activeReport), exportColumns, activeReport.title, activeReport.title);
            toast.success('Report exported to PDF');
        } catch (error) {
            toast.error('Failed to export PDF');
        }
    };

    const handlePrint = async () => {
        const rows = flattenReportRows(activeReport);
        const reportProfile = buildReportHeaderProfile({
            company,
            branches: availableBranches || [],
            activeBranchId: isAllBranches ? null : activeBranchId,
        });
        try {
            const templates = await getPrintTemplates();
            const defaultTemplate = templates.find(template => template.isDefault) || {};
            printHtml(generateReportPrintHtml(defaultTemplate, activeReport.title, exportColumns, rows, reportProfile));
        } catch (error) {
            printHtml(generateReportPrintHtml({}, activeReport.title, exportColumns, rows, reportProfile));
        }
    };

    const toggleGroup = groupId => setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    const expandAll = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, true])));
    const collapseAll = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, false])));

    const SidebarContent = () => (
        <>
            <div className="border-b border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-slate-950">Financial Reports</h2>
                        <p className="mt-1 text-[11px] text-slate-500">Choose a report, set filters, generate and export.</p>
                    </div>
                    <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden" aria-label="Close reports drawer">
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
                    <button type="button" onClick={expandAll} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-yellow-300 hover:bg-yellow-50">Expand all</button>
                    <button type="button" onClick={collapseAll} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-yellow-300 hover:bg-yellow-50">Collapse all</button>
                </div>
            </div>

            <div ref={reportListRef} className="flex-1 overflow-y-auto p-3">
                {visibleGroups.map(group => {
                    const isOpen = Boolean(search.trim()) || openGroups[group.id];
                    return (
                        <div key={group.id} className="mb-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <button type="button" onClick={() => toggleGroup(group.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white">
                                <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-bold text-slate-800">{group.title}</span>
                                    <span className="text-[10px] text-slate-500">{group.reports.length} report(s)</span>
                                </span>
                                <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isOpen && (
                                <div className="border-t border-slate-200 p-2">
                                    {group.reports.map(report => {
                                        const Icon = report.icon || group.icon;
                                        const active = report.id === activeId;
                                        return (
                                            <button
                                                key={report.id}
                                                type="button"
                                                onClick={() => {
                                                    captureScroll();
                                                    setActiveId(report.id);
                                                    setDrawerOpen(false);
                                                }}
                                                className={`mb-1 w-full rounded-lg border p-2 text-left transition ${
                                                    active ? 'border-yellow-400 bg-yellow-50 shadow-sm' : 'border-slate-200 bg-white hover:border-yellow-200 hover:bg-yellow-50/30'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Icon size={15} className={`mt-0.5 shrink-0 ${active ? 'text-yellow-600' : 'text-slate-500'}`} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="truncate text-xs font-bold text-slate-950">{report.title}</span>
                                                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${report.badge === 'Chart' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{report.badge}</span>
                                                        </div>
                                                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{report.description}</p>
                                                        {(report.tags || []).slice(0, 3).map(tag => (
                                                            <span key={tag} className="mr-1 mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{tag}</span>
                                                        ))}
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
        <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
            {drawerOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-black/30 md:hidden"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close reports drawer"
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[88vw] flex-col border-r border-slate-200 bg-white transition-transform md:static md:z-auto md:w-[360px] md:translate-x-0 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <SidebarContent />
            </aside>

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
                    <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Open reports drawer">
                        <Menu size={18} />
                    </button>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-950">{activeMeta.title}</div>
                        <div className="text-xs text-slate-500">Financial Reports</div>
                    </div>
                </div>

                <div ref={reportBodyRef} className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-xs text-slate-500">Filters</div>
                                <h1 className="mt-1 text-sm font-bold text-slate-950">{activeMeta.title}</h1>
                                <p className="mt-1 text-xs text-slate-500">{activeMeta.description}</p>
                            </div>
                            <button type="button" className="inline-flex items-center gap-2 rounded-full border border-yellow-300 px-3 py-1.5 text-xs font-semibold text-slate-800">
                                <Filter size={14} className="text-yellow-600" /> Advanced
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                <span className="inline-flex items-center gap-1"><Calendar size={13} /> Date From</span>
                                <input type="date" value={filters.dateFrom} onChange={event => setFilter('dateFrom', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400" />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                <span className="inline-flex items-center gap-1"><Calendar size={13} /> Date To</span>
                                <input type="date" value={filters.dateTo} onChange={event => setFilter('dateTo', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400" />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                <span className="inline-flex items-center gap-1"><Building2 size={13} /> Branch</span>
                                <select value={filters.branchId} onChange={event => setFilter('branchId', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {branches.map(branch => <option key={branch.id || branch.name} value={branch.id || branch.name}>{branch.name || branch.branchName || branch.code}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                <span className="inline-flex items-center gap-1"><Search size={13} /> Account / Cost Centre</span>
                                <input value={filters.accountQuery} onChange={event => setFilter('accountQuery', event.target.value)} placeholder="Search account, customer, vendor or cost centre..." className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400" />
                            </label>
                            <div className="flex items-end gap-2">
                                <button type="button" onClick={handleGenerate} disabled={loading} className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Generate
                                </button>
                                <ExportDropdown
                                    onExportExcel={handleExportExcel}
                                    onExportPdf={handleExportPdf}
                                    onPrint={handlePrint}
                                    disabled={getReportRowCount(activeReport) === 0 || loading}
                                />
                            </div>
                        </div>
                    </div>

                    {loadErrors.length > 0 && (
                        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {loadErrors.length} source(s) could not be loaded. Reports only use the live sources that responded.
                        </div>
                    )}

                    {loading ? (
                        <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                                <Loader2 size={18} className="animate-spin text-yellow-500" /> Loading live financial data...
                            </div>
                        </div>
                    ) : (
                        <ReportResult
                            report={activeReport}
                            currency={currency}
                            appliedFilters={appliedFilters}
                            activeMeta={activeMeta}
                            loading={loading}
                            onExportExcel={handleExportExcel}
                            onExportPdf={handleExportPdf}
                            onPrint={handlePrint}
                            onResetFilters={resetFilters}
                        />
                    )}
                </div>
            </main>
        </div>
    );
};

export default FinancialReports;
