import api from './axiosConfig';
import { getProducts } from './productsApi';
import { getAllSalesInvoices } from './salesInvoiceApi';
import { getAllSalesOrders } from './salesorderApi';
import { getAllQuotations } from './quotationApi';
import { getAllSalesReturns } from './salesReturnApi';
import { fetchExpenses } from './expensesApi';
import { getLpos } from './lpoApi';
import { getGrns } from './grnApi';
import { getInquiries } from './customerApi';
import { employeesApi } from './employeesApi';
import { getStockTransfers } from './stockTransferApi';
import { getAccounts } from './ledgerApi';
import {
    getLowStockReport,
    getOutOfStockReport,
    getStockValuationReport
} from './inventoryReportsApi';

const CACHE_TTL_MS = 120000;
const CACHE_VERSION = 'v3';
const LS_CACHE_KEY = (timeRange) => `bb_dash_${CACHE_VERSION}_${timeRange}`;
const LS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const readLocalStorageCache = (timeRange) => {
    try {
        const raw = localStorage.getItem(LS_CACHE_KEY(timeRange));
        if (!raw) return null;
        const { timestamp, data } = JSON.parse(raw);
        if (Date.now() - timestamp > LS_CACHE_TTL_MS) {
            localStorage.removeItem(LS_CACHE_KEY(timeRange));
            return null;
        }
        return data;
    } catch {
        return null;
    }
};

const writeLocalStorageCache = (timeRange, data) => {
    try {
        localStorage.setItem(LS_CACHE_KEY(timeRange), JSON.stringify({ timestamp: Date.now(), data }));
    } catch {
        // Storage quota exceeded — silently skip
    }
};

const fetchDashboardSummary = async (timeRange, branchId) => {
    const params = { timeRange };
    if (branchId) params.branchId = branchId;
    const response = await api.get('/api/dashboard/summary', { params });
    return response.data;
};

const transformBackendDashboard = (backend, timeRange) => {
    const empty = createEmptyDashboardData();

    // Sales trend: array of { date, sales, count, profit, returns } → object keyed by date
    const salesTrend = {};
    (backend.salesTrend ?? []).forEach(({ date, sales, count, profit, returns: ret }) => {
        salesTrend[date] = { sales, count, profit: profit ?? 0, returns: ret ?? 0 };
    });

    // Hourly sales: format hour integer → label string
    const formatHour = (h) => {
        if (h === 0) return '12 AM';
        if (h < 12) return `${h} AM`;
        if (h === 12) return '12 PM';
        return `${h - 12} PM`;
    };
    const hourlySales = (backend.hourlySales ?? []).map(({ hour, sales, count }) => ({
        hourLabel: formatHour(hour),
        amount: sales ?? 0,
        key: String(hour),
    }));

    // Branch performance
    const branchPerformance = (backend.branchPerformance ?? []).map(({ branch, sales }) => ({
        branch: branch ?? 'Head Office',
        sales: sales ?? 0,
        key: branch ?? 'Head Office',
    }));
    const salesTrendMeta = buildSalesTrendMeta(salesTrend, timeRange);

    // Payment breakdown: array of { label, value } → bucket totals
    const payRows = backend.paymentBreakdown ?? [];
    const breakdown = { cash: 0, card: 0, wallet: 0, credit: 0 };
    payRows.forEach(({ label, value }) => {
        const bucket = resolvePaymentBucketFromLabel(label);
        breakdown[bucket] += value;
    });
    const payTotal = Object.values(breakdown).reduce((s, v) => s + v, 0);

    // Top departments: array of { label, value }
    const topDepartments = (backend.topDepartments ?? []).map(({ label, value }) => ({ label, value }));

    // Recent transactions
    const transactions = (backend.recentTransactions ?? []).map((t) => ({
        id: t.invoiceNumber ?? t.id,
        customer: t.customerName ?? 'Walk-in Customer',
        amount: t.amount ?? 0,
        date: t.date,
        status: t.status ?? 'UNKNOWN',
        time: formatRelativeTime(parseDate(t.date))
    }));

    // Top products: array of { code, name, department, qtySold, revenue }
    const topProducts = (backend.topProducts ?? []).map((p, i) => ({
        id: p.code ?? String(i),
        sku: p.code ?? '',
        name: p.name ?? p.code ?? 'Unknown',
        department: p.department ?? 'Uncategorized',
        sold: p.qtySold ?? 0,
        revenue: p.revenue ?? 0,
        trend: (p.revenue ?? 0) > 0 ? 'up' : 'stable',
    }));

    const sm = backend.salesMetrics ?? {};
    const pm = backend.purchaseMetrics ?? {};
    const hm = backend.hrMetrics ?? {};
    const im = backend.inventoryMetrics ?? {};

    return {
        ...empty,
        sales: {
            ...empty.sales,
            totalSales: sm.totalRevenue ?? 0,
            invoiceCount: sm.invoiceCount ?? 0,
        },
        salesMetrics: {
            totalRevenue: sm.totalRevenue ?? 0,
            invoiceCount: sm.invoiceCount ?? 0,
            outstanding: sm.outstanding ?? 0,
            customerCount: sm.customerCount ?? 0,
        },
        financial: {
            ...empty.financial,
            receivables: sm.outstanding ?? 0,
        },
        hr: {
            totalEmployees: hm.totalEmployees ?? 0,
            activeEmployees: hm.activeEmployees ?? 0,
        },
        purchase: {
            ...empty.purchase,
            pendingLPOs: pm.pendingLpos ?? 0,
            lpoCount: pm.totalLpos ?? 0,
            grnCount: pm.grnCount ?? 0,
            totalPurchases: pm.totalPurchaseValue ?? 0,
            suppliersCount: pm.suppliersCount ?? 0,
            outstandingToSuppliers: backend.accountingSnapshot?.supplierPayables ?? 0,
        },
        inventory: {
            ...empty.inventory,
            totalProducts: im.totalProducts ?? 0,
            activeProducts: im.activeProducts ?? im.totalProducts ?? 0,
            lowStockCount: im.lowStockCount ?? 0,
            outOfStockCount: im.outOfStockCount ?? 0,
            stockValueCost: im.stockValueCost ?? 0,
            stockValueRetail: im.stockValueCost ?? 0,
            lowStockProducts: (im.lowStockProducts ?? []).map((p) => ({
                productId: p.productId ?? p.id,
                sku: p.sku ?? p.code ?? '',
                item: p.name ?? p.productName ?? '',
                onHand: p.onHand ?? p.currentStock ?? 0,
                lastSold: p.lastSold ?? null,
            })),
            slowMovingProducts: (im.slowMovingProducts ?? []).map((p) => ({
                productId: p.productId ?? p.id,
                sku: p.sku ?? p.code ?? '',
                item: p.name ?? p.productName ?? '',
                onHand: p.onHand ?? p.currentStock ?? 0,
                lastSold: p.lastSold ?? null,
            })),
        },
        transactions,
        topProducts,
        paymentBreakdown: {
            ...breakdown,
            total: payTotal,
            cashPct: payTotal > 0 ? ((breakdown.cash / payTotal) * 100).toFixed(1) : 0,
            cardPct: payTotal > 0 ? ((breakdown.card / payTotal) * 100).toFixed(1) : 0,
            walletPct: payTotal > 0 ? ((breakdown.wallet / payTotal) * 100).toFixed(1) : 0,
            creditPct: payTotal > 0 ? ((breakdown.credit / payTotal) * 100).toFixed(1) : 0,
        },
        salesTrend,
        salesTrendMeta,
        topDepartments,
        accountingSnapshot: backend.accountingSnapshot ?? null,
        hourlySales,
        branchPerformance,
        lastUpdated: new Date().toISOString(),
    };
};

const resolvePaymentBucketFromLabel = (label) => {
    const lower = (label ?? '').toLowerCase();
    if (lower.includes('wallet')) return 'wallet';
    if (lower.includes('credit')) return 'credit';
    if (lower.includes('card') || lower.includes('visa') || lower.includes('master') || lower.includes('bank') || lower.includes('upi')) return 'card';
    return 'cash';
};

const dashboardCache = new Map();
const inFlightRequests = new Map();

const createEmptyDashboardData = () => ({
    sales: { totalSales: 0, totalOrders: 0, pendingQuotations: 0, totalReturns: 0, invoiceCount: 0, salesGrowth: null, prevSales: 0 },
    inventory: {
        totalProducts: 0,
        activeProducts: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        stockValueCost: 0,
        stockValueRetail: 0,
        pendingTransfers: 0,
        lowStockProducts: [],
        outOfStockProducts: []
    },
    financial: { totalExpenses: 0, receivables: 0, payables: 0, cashFlow: 0, expenseCount: 0 },
    hr: { totalEmployees: 0, activeEmployees: 0 },
    purchase: { pendingLPOs: 0, totalPurchases: 0, lpoCount: 0, grnCount: 0 },
    transactions: [],
    paymentBreakdown: { cash: 0, card: 0, wallet: 0, credit: 0, total: 0, cashPct: 0, cardPct: 0, walletPct: 0, creditPct: 0 },
    salesTrend: {},
    salesTrendMeta: { peakLabel: null, avgSales: 0 },
    topDepartments: [],
    topProducts: [],
    topCustomers: [],
    employeePerformance: [],
    recentActivity: [],
    lastUpdated: null
});

const asArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.content)) return value.content;
    if (Array.isArray(value?.data)) return value.data;
    return [];
};

const toNumber = (...values) => {
    for (const value of values) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
};

const pickText = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};

const normalizeKey = (value) => pickText(value).toLowerCase();
const normalizeStatus = (value) => pickText(value).replace(/\s+/g, '_').toUpperCase();

const hasAnyStatus = (value, statuses) => {
    const normalized = normalizeStatus(value);
    return normalized ? statuses.includes(normalized) : false;
};

const parseDate = (...values) => {
    for (const value of values) {
        if (!value) continue;
        let parsed;
        // Date-only ISO strings (YYYY-MM-DD) must be parsed as local midnight, not UTC midnight.
        // new Date("2025-05-20") gives UTC midnight which shifts to the previous local day in UTC- timezones.
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            parsed = new Date(y, m - 1, d);
        } else {
            parsed = new Date(value);
        }
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDayExclusive = (date) => {
    const end = startOfDay(date);
    end.setDate(end.getDate() + 1);
    return end;
};

const resolveDateBounds = (range, filters = {}) => {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    switch (range) {
        case 'Today':
            return { start: today, end: tomorrow };
        case 'Yesterday':
            return { start: yesterday, end: today };
        case 'This Week':
            return { start: weekStart, end: tomorrow };
        case 'This Month':
            return { start: monthStart, end: tomorrow };
        case 'Last Month':
            return { start: lastMonthStart, end: monthStart };
        case 'This Year':
            return { start: yearStart, end: tomorrow };
        case 'Custom': {
            const parsedStart = filters.fromDate ? parseDate(filters.fromDate) : null;
            const parsedEnd = filters.toDate ? parseDate(filters.toDate) : null;
            const start = parsedStart ? startOfDay(parsedStart) : null;
            const end = parsedEnd ? endOfDayExclusive(parsedEnd) : null;
            return { start, end };
        }
        default:
            return { start: null, end: null };
    }
};

const filterByDateRange = (items, getDate, range, filters = {}) => {
    const { start, end } = resolveDateBounds(range, filters);
    if (!start && !end) return asArray(items);

    return asArray(items).filter((item) => {
        const itemDate = getDate(item);
        if (!itemDate) return false;
        if (start && itemDate < start) return false;
        if (end && itemDate >= end) return false;
        return true;
    });
};

const filterPreviousPeriod = (items, getDate, range) => {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date(yesterday);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);

    return asArray(items).filter((item) => {
        const itemDate = getDate(item);
        if (!itemDate) return false;
        switch (range) {
            case 'Today':      return itemDate >= yesterday && itemDate < today;
            case 'Yesterday':  return itemDate >= dayBefore && itemDate < yesterday;
            case 'This Week':  return itemDate >= prevWeekStart && itemDate < weekStart;
            case 'This Month': return itemDate >= prevMonthStart && itemDate < monthStart;
            case 'This Year':  return itemDate >= prevYearStart && itemDate < yearStart;
            default: return false;
        }
    });
};

const sumBy = (items, mapper) => asArray(items).reduce((sum, item) => sum + mapper(item), 0);

const formatRelativeTime = (value) => {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return 'Unknown time';

    const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

const resolveDataset = async (loader, label) => {
    try {
        return await loader();
    } catch (error) {
        console.error(`Dashboard dataset failed: ${label}`, error);
        return [];
    }
};

const getInvoiceDate = (invoice) => parseDate(invoice?.createdAt, invoice?.invoiceDate, invoice?.date);
const getOrderDate = (order) => parseDate(order?.orderDate, order?.date, order?.createdAt);
const getReturnDate = (salesReturn) => parseDate(salesReturn?.returnDate, salesReturn?.date, salesReturn?.createdAt);
const getExpenseDate = (expense) => parseDate(expense?.expenseDate, expense?.date, expense?.createdAt);
const getLpoDate = (lpo) => parseDate(lpo?.date, lpo?.lpoDate, lpo?.createdAt);
const getGrnDate = (grn) => parseDate(grn?.date, grn?.grnDate, grn?.createdAt);
const getInquiryDate = (inquiry) => parseDate(inquiry?.createdDate, inquiry?.createdAt, inquiry?.date);

// Treat DRAFT invoices as countable for dashboard visibility; exclude only truly voided docs.
const isInvoiceCountable = (invoice) => !hasAnyStatus(invoice?.status, ['CANCELLED']);
const isReturnCountable = (salesReturn) => !hasAnyStatus(salesReturn?.status, ['DRAFT', 'CANCELLED', 'REJECTED']);

const normalizeStockRow = (row) => {
    const currentStock = toNumber(row?.onHand, row?.currentStock, row?.availableQty, row?.quantityOnHand);
    const unitCost = toNumber(row?.unitCost, row?.cost);
    const retailPrice = toNumber(row?.retailPrice, row?.sellingPrice, row?.retail);

    return {
        productId: row?.productId ?? null,
        sku: pickText(row?.sku, row?.code),
        name: pickText(row?.item, row?.productName, row?.name, 'Unknown Product'),
        department: pickText(row?.department, row?.category, 'Uncategorized'),
        brand: pickText(row?.brand),
        warehouse: pickText(row?.warehouse, 'Warehouse'),
        currentStock,
        reorderLevel: toNumber(row?.minStock, row?.reorderLevel),
        unitCost,
        retailPrice,
        stockValue: toNumber(row?.value, currentStock * unitCost),
        retailValue: toNumber(row?.retailValue, currentStock * retailPrice),
        uom: pickText(row?.uom, row?.unit, 'PCS'),
        lastSold: pickText(row?.lastSold, 'N/A'),
        lastReceived: pickText(row?.lastReceived, 'N/A')
    };
};

const buildProductLookup = (products) => {
    const byId = new Map();
    const byKey = new Map();

    asArray(products).forEach((entry) => {
        const product = entry?.product ?? entry ?? {};
        const id = product?.id ?? entry?.id;
        if (id !== undefined && id !== null) {
            byId.set(String(id), entry);
        }

        [
            product?.code,
            product?.sku,
            product?.name,
            entry?.code,
            entry?.sku,
            entry?.name
        ].forEach((value) => {
            const key = normalizeKey(value);
            if (key && !byKey.has(key)) {
                byKey.set(key, entry);
            }
        });
    });

    return {
        list: asArray(products),
        resolve(reference) {
            if (!reference) return null;

            const directId = reference?.productId ?? reference?.id;
            if (directId !== undefined && directId !== null) {
                const match = byId.get(String(directId));
                if (match) return match;
            }

            const keys = [
                normalizeKey(reference?.itemCode),
                normalizeKey(reference?.code),
                normalizeKey(reference?.sku),
                normalizeKey(reference?.itemName),
                normalizeKey(reference?.name)
            ];

            for (const key of keys) {
                if (key && byKey.has(key)) {
                    return byKey.get(key);
                }
            }

            return null;
        }
    };
};

const buildStockLookup = (rows) => {
    const byId = new Map();
    const byKey = new Map();

    asArray(rows).map(normalizeStockRow).forEach((row) => {
        if (row.productId !== null && row.productId !== undefined) {
            byId.set(String(row.productId), row);
        }

        [row.sku, row.name].forEach((value) => {
            const key = normalizeKey(value);
            if (key && !byKey.has(key)) {
                byKey.set(key, row);
            }
        });
    });

    return {
        resolve(reference) {
            if (!reference) return null;

            const directId = reference?.productId ?? reference?.id;
            if (directId !== undefined && directId !== null) {
                const byIdMatch = byId.get(String(directId));
                if (byIdMatch) return byIdMatch;
            }

            const keys = [
                normalizeKey(reference?.itemCode),
                normalizeKey(reference?.code),
                normalizeKey(reference?.sku),
                normalizeKey(reference?.itemName),
                normalizeKey(reference?.name)
            ];

            for (const key of keys) {
                if (key && byKey.has(key)) {
                    return byKey.get(key);
                }
            }

            return null;
        }
    };
};

const getProductName = (entry, fallback = 'Unknown Product') => {
    if (!entry) return fallback;
    return pickText(entry?.product?.name, entry?.name, fallback);
};

const getProductSku = (entry, fallback = 'N/A') => {
    if (!entry) return fallback;
    return pickText(entry?.product?.sku, entry?.product?.code, entry?.sku, fallback);
};

const getProductDepartment = (entry) => {
    if (!entry) return 'Uncategorized';
    return pickText(entry?.product?.department?.name, entry?.department?.name, entry?.department, 'Uncategorized');
};

const isProductActive = (entry) => {
    const status = normalizeStatus(entry?.product?.status ?? entry?.status);
    if (status) return status === 'ACTIVE';

    const activeFlag = entry?.product?.active ?? entry?.product?.isActive ?? entry?.active ?? entry?.isActive;
    if (typeof activeFlag === 'boolean') return activeFlag;

    return false;
};

const getInvoiceAmount = (invoice) => toNumber(invoice?.invoiceTotal, invoice?.totalAmount, invoice?.grandTotal, invoice?.orderTotal);
const getInvoiceBalance = (invoice) => toNumber(invoice?.balance, invoice?.balanceDue);
const getItemRevenue = (item) => toNumber(item?.netAmount, item?.total, item?.lineTotal, item?.grossAmount, toNumber(item?.quantity) * toNumber(item?.price));
const getItemQuantity = (item) => toNumber(item?.quantity, item?.qty);

const normalizeDashboardFilters = (filters = {}) => ({
    branchId: pickText(filters.branchId),
    fromDate: pickText(filters.fromDate),
    toDate: pickText(filters.toDate),
    invoiceStatus: pickText(filters.invoiceStatus, 'all').toLowerCase(),
    minAmount: pickText(filters.minAmount),
    maxAmount: pickText(filters.maxAmount)
});

const hasDashboardFilters = (filters = {}) => Boolean(
    filters.branchId ||
    filters.fromDate ||
    filters.toDate ||
    (filters.invoiceStatus && filters.invoiceStatus !== 'all') ||
    filters.minAmount ||
    filters.maxAmount
);

const getFilterCacheKey = (timeRange, filters = {}) => {
    const compact = Object.entries(filters)
        .filter(([, value]) => value !== '' && value !== null && value !== undefined && value !== 'all')
        .sort(([left], [right]) => left.localeCompare(right));
    return `${timeRange}:${JSON.stringify(Object.fromEntries(compact))}`;
};

const getBranchCandidates = (item) => [
    item?.branchId,
    item?.branch?.id,
    item?.branchCode,
    item?.branchName,
    item?.branch,
    item?.warehouseBranchId,
    item?.warehouse?.branchId,
    item?.warehouse?.branch?.id,
    item?.fromBranchId,
    item?.toBranchId,
    item?.outletId
];

const matchesBranch = (item, branchId) => {
    if (!branchId || branchId === 'all' || branchId === 'ALL') return true;
    const wanted = String(branchId).toLowerCase();
    const candidates = getBranchCandidates(item)
        .filter((value) => value !== null && value !== undefined && value !== '');
    if (candidates.length === 0) return true;
    return candidates.some((value) => String(value).toLowerCase() === wanted);
};

const matchesInvoiceStatusFilter = (invoice, statusFilter) => {
    if (!statusFilter || statusFilter === 'all') return true;
    const status = normalizeStatus(invoice?.status);
    const wanted = normalizeStatus(statusFilter);
    if (wanted === 'PAID') return ['PAID', 'POSTED'].includes(status);
    if (wanted === 'PARTIALLY_PAID') return status === 'PARTIALLY_PAID';
    return status === wanted;
};

const matchesAmountFilter = (invoice, minAmount, maxAmount) => {
    const amount = getInvoiceAmount(invoice);
    const min = Number.parseFloat(minAmount);
    const max = Number.parseFloat(maxAmount);
    if (Number.isFinite(min) && amount < min) return false;
    if (Number.isFinite(max) && amount > max) return false;
    return true;
};

const applyDashboardFilters = (datasets, filters = {}) => {
    if (!hasDashboardFilters(filters)) return datasets;
    const { branchId, invoiceStatus, minAmount, maxAmount } = filters;
    const invoiceMatches = (invoice) =>
        matchesBranch(invoice, branchId) &&
        matchesInvoiceStatusFilter(invoice, invoiceStatus) &&
        matchesAmountFilter(invoice, minAmount, maxAmount);
    const branchMatches = (item) => matchesBranch(item, branchId);

    return {
        ...datasets,
        invoices: datasets.invoices.filter(invoiceMatches),
        orders: datasets.orders.filter(branchMatches),
        quotations: datasets.quotations.filter(branchMatches),
        returnsData: datasets.returnsData.filter(branchMatches),
        expenses: datasets.expenses.filter(branchMatches),
        lpos: datasets.lpos.filter(branchMatches),
        grns: datasets.grns.filter(branchMatches),
        inquiries: datasets.inquiries.filter(branchMatches),
        accounts: datasets.accounts.filter(branchMatches),
        transfers: datasets.transfers.filter(branchMatches),
        products: datasets.products.filter(branchMatches),
        lowStockReport: datasets.lowStockReport.filter(branchMatches),
        outOfStockReport: datasets.outOfStockReport.filter(branchMatches),
        stockValuation: datasets.stockValuation.filter(branchMatches)
    };
};

const resolvePaymentBucket = (invoice) => {
    const paymentMode = pickText(invoice?.paymentMode, invoice?.paymentMethod, 'cash').toLowerCase();
    if (paymentMode.includes('wallet')) return 'wallet';
    if (paymentMode.includes('credit')) return 'credit';
    if (paymentMode.includes('card') || paymentMode.includes('visa') || paymentMode.includes('master') || paymentMode.includes('bank') || paymentMode.includes('upi')) {
        return 'card';
    }
    return 'cash';
};

const getCustomerName = (invoice) => pickText(invoice?.customerName, invoice?.customer?.name, 'Walk-in Customer');
const getSalespersonName = (invoice) => pickText(invoice?.salesperson, invoice?.salesPerson?.name, invoice?.salesPerson, 'Unknown');

const getEmployeeDisplayName = (employee) => {
    const joinedName = [employee?.firstName, employee?.middleName, employee?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

    return pickText(employee?.fullName, employee?.name, joinedName, employee?.employeeName);
};

const buildEmployeeDirectory = (employees) => {
    const map = new Map();

    asArray(employees).forEach((employee) => {
        const name = normalizeKey(getEmployeeDisplayName(employee));
        if (name) {
            map.set(name, employee);
        }
    });

    return map;
};

const loadDashboardDatasets = async () => {
    const [
        invoices,
        orders,
        quotations,
        returnsData,
        expenses,
        lpos,
        grns,
        inquiries,
        employees,
        accounts,
        transfers,
        products,
        lowStockReport,
        outOfStockReport,
        stockValuation
    ] = await Promise.all([
        resolveDataset(() => getAllSalesInvoices(), 'sales invoices'),
        resolveDataset(() => getAllSalesOrders(), 'sales orders'),
        resolveDataset(() => getAllQuotations(), 'quotations'),
        resolveDataset(() => getAllSalesReturns(), 'sales returns'),
        resolveDataset(() => fetchExpenses(), 'expenses'),
        resolveDataset(() => getLpos(), 'lpos'),
        resolveDataset(() => getGrns(), 'grns'),
        resolveDataset(() => getInquiries(), 'inquiries'),
        resolveDataset(() => employeesApi.getAll(), 'employees'),
        resolveDataset(() => getAccounts(), 'accounts'),
        resolveDataset(() => getStockTransfers(), 'stock transfers'),
        resolveDataset(() => getProducts(), 'products'),
        resolveDataset(() => getLowStockReport(), 'low stock report'),
        resolveDataset(() => getOutOfStockReport(), 'out of stock report'),
        resolveDataset(() => getStockValuationReport(), 'stock valuation report')
    ]);

    return {
        invoices: asArray(invoices),
        orders: asArray(orders),
        quotations: asArray(quotations),
        returnsData: asArray(returnsData),
        expenses: asArray(expenses),
        lpos: asArray(lpos),
        grns: asArray(grns),
        inquiries: asArray(inquiries),
        employees: asArray(employees),
        accounts: asArray(accounts),
        transfers: asArray(transfers),
        products: asArray(products),
        lowStockReport: asArray(lowStockReport),
        outOfStockReport: asArray(outOfStockReport),
        stockValuation: asArray(stockValuation)
    };
};

const buildSalesMetrics = (datasets, timeRange, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const filteredOrders = filterByDateRange(
        datasets.orders.filter((order) => !hasAnyStatus(order?.status, ['CANCELLED', 'VOID'])),
        getOrderDate,
        timeRange,
        filters
    );
    const filteredReturns = filterByDateRange(datasets.returnsData.filter(isReturnCountable), getReturnDate, timeRange, filters);

    const totalSales = sumBy(filteredInvoices, getInvoiceAmount);
    const prevInvoices = filterPreviousPeriod(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
    const prevSales = sumBy(prevInvoices, getInvoiceAmount);
    const salesGrowth = prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : null;

    return {
        totalSales,
        totalOrders: filteredOrders.length,
        pendingQuotations: datasets.quotations.filter((quotation) => hasAnyStatus(quotation?.status, ['DRAFT', 'PENDING', 'PENDING_APPROVAL'])).length,
        totalReturns: sumBy(filteredReturns, (salesReturn) => toNumber(salesReturn?.totalAmount)),
        invoiceCount: filteredInvoices.length,
        salesGrowth,
        prevSales
    };
};

// The low-stock report returns one row per batch, so a product with N batches appears N times.
// Merge all batches for the same product by summing quantities, then check the threshold.
const deduplicateLowStockByProduct = (rows) => {
    const byProduct = new Map();
    rows.forEach((row) => {
        const key = row.productId != null ? String(row.productId) : (row.sku || row.name);
        if (!key) return;
        if (!byProduct.has(key)) {
            byProduct.set(key, { ...row });
        } else {
            byProduct.get(key).currentStock += row.currentStock;
        }
    });
    // Re-apply threshold: only keep products whose total stock is still low
    return Array.from(byProduct.values()).filter((row) => row.currentStock > 0 && row.currentStock < 10);
};

const buildInventoryMetrics = (datasets) => {
    const valuationRows = datasets.stockValuation.map(normalizeStockRow);
    const rawLowStockRows = datasets.lowStockReport.map(normalizeStockRow);
    const outOfStockRows = datasets.outOfStockReport.map(normalizeStockRow);

    // Deduplicate batch-level low-stock rows into one row per product
    const lowStockProducts = deduplicateLowStockByProduct(rawLowStockRows);

    const allKnownInventoryIds = new Set(
        [...valuationRows, ...rawLowStockRows, ...outOfStockRows].map((row) => row.productId ?? row.sku ?? row.name)
    );

    const hasActiveSignal = datasets.products.some((entry) => {
        const product = entry?.product ?? entry ?? {};
        return product?.status || product?.active !== undefined || product?.isActive !== undefined;
    });

    const totalProducts = datasets.products.length || allKnownInventoryIds.size;
    const activeProducts = hasActiveSignal
        ? datasets.products.filter(isProductActive).length
        : totalProducts;

    return {
        totalProducts,
        activeProducts,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockRows.length,
        stockValueCost: sumBy(valuationRows, (row) => row.stockValue),
        stockValueRetail: sumBy(valuationRows, (row) => row.retailValue),
        pendingTransfers: datasets.transfers.filter((transfer) => hasAnyStatus(transfer?.status, ['PENDING', 'DRAFT', 'REQUESTED', 'PENDING_APPROVAL', 'IN_TRANSIT'])).length,
        lowStockProducts: lowStockProducts.slice(0, 10),
        outOfStockProducts: outOfStockRows.slice(0, 10)
    };
};

const buildFinancialMetrics = (datasets, timeRange, salesMetrics, filters = {}) => {
    const filteredExpenses = filterByDateRange(datasets.expenses, getExpenseDate, timeRange, filters);
    const invoicesWithBalance = datasets.invoices.filter((invoice) => isInvoiceCountable(invoice) && getInvoiceBalance(invoice) > 0);
    const payableAccounts = datasets.accounts.filter((account) => {
        const combined = [
            pickText(account?.accountName, account?.name, account?.account),
            pickText(account?.accountGroup),
            pickText(account?.accountType)
        ].join(' ').toLowerCase();

        return combined.includes('payable') || combined.includes('vendor');
    });

    let payables = sumBy(payableAccounts, (account) => Math.abs(toNumber(account?.balanceAmount, account?.balance)));
    if (!payables) {
        payables = sumBy(
            datasets.accounts.filter((account) => normalizeStatus(account?.accountGroup) === 'LIABILITIES'),
            (account) => Math.abs(toNumber(account?.balanceAmount, account?.balance))
        );
    }

    const totalExpenses = sumBy(filteredExpenses, (expense) => toNumber(expense?.amount));

    return {
        totalExpenses,
        receivables: sumBy(invoicesWithBalance, getInvoiceBalance),
        payables,
        cashFlow: salesMetrics.totalSales - totalExpenses,
        expenseCount: filteredExpenses.length
    };
};

const buildHRMetrics = (datasets) => ({
    totalEmployees: datasets.employees.length,
    activeEmployees: datasets.employees.filter((employee) => normalizeStatus(employee?.status) === 'ACTIVE').length
});

const buildPurchaseMetrics = (datasets, timeRange, filters = {}) => {
    const filteredLPOs = filterByDateRange(datasets.lpos, getLpoDate, timeRange, filters);
    const filteredGRNs = filterByDateRange(datasets.grns, getGrnDate, timeRange, filters);

    return {
        pendingLPOs: datasets.lpos.filter((lpo) => hasAnyStatus(lpo?.status ?? lpo?.approvalStatus, ['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'SUBMITTED'])).length,
        totalPurchases: sumBy(filteredGRNs, (grn) => toNumber(grn?.value, grn?.totalValue, grn?.grandTotal, grn?.subtotal)),
        lpoCount: filteredLPOs.length,
        grnCount: filteredGRNs.length
    };
};

const buildRecentTransactions = (datasets, limit = 10, timeRange = 'All Time', filters = {}) => (
    filterByDateRange(datasets.invoices, getInvoiceDate, timeRange, filters)
        .filter(isInvoiceCountable)
        .sort((left, right) => (getInvoiceDate(right)?.getTime() ?? 0) - (getInvoiceDate(left)?.getTime() ?? 0))
        .slice(0, limit)
        .map((invoice) => ({
            id: pickText(invoice?.invoiceNumber, invoice?.id?.toString(), 'Invoice'),
            customer: getCustomerName(invoice),
            amount: getInvoiceAmount(invoice),
            date: getInvoiceDate(invoice)?.toISOString() ?? null,
            status: pickText(invoice?.status, 'UNKNOWN'),
            time: formatRelativeTime(getInvoiceDate(invoice))
        }))
);

const buildSalesTrend = (datasets, timeRange, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const grouped = {};

    filteredInvoices.forEach((invoice) => {
        const invoiceDate = getInvoiceDate(invoice);
        // Skip invoices with no parseable date — they can't be placed on a timeline.
        if (!invoiceDate) return;

        // SalesInvoice stores a LocalDate (date-only), so hourly grouping is not possible.
        // Always group by local calendar date to avoid UTC-midnight timezone shift.
        const key = invoiceDate.toLocaleDateString('en-CA'); // produces "YYYY-MM-DD" in local time

        if (!grouped[key]) grouped[key] = { sales: 0, count: 0 };
        grouped[key].sales += getInvoiceAmount(invoice);
        grouped[key].count += 1;
    });

    return grouped;
};

const buildSalesTrendMeta = (trendData, timeRange) => {
    const entries = Object.entries(trendData);
    if (entries.length === 0) return { peakLabel: null, avgSales: 0 };

    let peakKey = null;
    let peakValue = 0;
    let totalSales = 0;

    entries.forEach(([key, data]) => {
        totalSales += data.sales;
        if (data.sales > peakValue) {
            peakValue = data.sales;
            peakKey = key;
        }
    });

    let peakLabel = null;
    if (peakKey !== null) {
        const peakDate = parseDate(peakKey);
        peakLabel = peakDate
            ? peakDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : String(peakKey);
    }

    const periodCount = entries.length || 1;
    const avgSales = totalSales / periodCount;

    return { peakLabel, avgSales };
};

const buildPaymentBreakdown = (datasets, timeRange, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const breakdown = { cash: 0, card: 0, wallet: 0, credit: 0 };

    filteredInvoices.forEach((invoice) => {
        const bucket = resolvePaymentBucket(invoice);
        breakdown[bucket] += getInvoiceAmount(invoice);
    });

    const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

    return {
        ...breakdown,
        total,
        cashPct: total > 0 ? ((breakdown.cash / total) * 100).toFixed(1) : 0,
        cardPct: total > 0 ? ((breakdown.card / total) * 100).toFixed(1) : 0,
        walletPct: total > 0 ? ((breakdown.wallet / total) * 100).toFixed(1) : 0,
        creditPct: total > 0 ? ((breakdown.credit / total) * 100).toFixed(1) : 0
    };
};

const buildTopDepartments = (datasets, timeRange, productLookup, limit = 4, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const departmentSales = new Map();

    filteredInvoices.forEach((invoice) => {
        asArray(invoice?.items).forEach((item) => {
            const product = productLookup.resolve(item);
            const departmentName = getProductDepartment(product);
            departmentSales.set(departmentName, (departmentSales.get(departmentName) ?? 0) + getItemRevenue(item));
        });
    });

    return Array.from(departmentSales.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, limit);
};

const buildTopProducts = (datasets, timeRange, productLookup, stockLookup, limit = 5, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const productSales = new Map();

    filteredInvoices.forEach((invoice) => {
        asArray(invoice?.items).forEach((item) => {
            const product = productLookup.resolve(item);
            const key = normalizeKey(item?.itemCode) || normalizeKey(getProductSku(product)) || normalizeKey(item?.itemName) || normalizeKey(getProductName(product));

            if (!key) return;

            if (!productSales.has(key)) {
                productSales.set(key, {
                    product,
                    item,
                    sold: 0,
                    revenue: 0
                });
            }

            const current = productSales.get(key);
            current.sold += getItemQuantity(item);
            current.revenue += getItemRevenue(item);
            if (!current.product && product) current.product = product;
        });
    });

    return Array.from(productSales.values())
        .map((entry) => {
            const product = entry.product ?? productLookup.resolve(entry.item);
            const stock = stockLookup.resolve(product ?? entry.item);

            return {
                id: product?.product?.id ?? entry.item?.productId ?? getProductSku(product) ?? getProductName(product),
                name: pickText(getProductName(product), entry.item?.itemName, 'Unknown Product'),
                sku: pickText(getProductSku(product), entry.item?.itemCode, 'N/A'),
                sold: entry.sold,
                revenue: entry.revenue,
                stock: toNumber(stock?.currentStock),
                trend: entry.revenue > 0 ? 'up' : 'stable'
            };
        })
        .sort((left, right) => right.revenue - left.revenue)
        .slice(0, limit);
};

const buildTopCustomers = (datasets, timeRange, limit = 5, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const customerStats = new Map();

    filteredInvoices.forEach((invoice) => {
        const customerName = getCustomerName(invoice);
        const customerKey = normalizeKey(invoice?.customerCode) || normalizeKey(customerName) || 'walk-in';
        const invoiceDate = getInvoiceDate(invoice);

        if (!customerStats.has(customerKey)) {
            customerStats.set(customerKey, {
                name: customerName,
                purchases: 0,
                totalSpent: 0,
                lastOrderDate: invoiceDate
            });
        }

        const current = customerStats.get(customerKey);
        current.purchases += 1;
        current.totalSpent += getInvoiceAmount(invoice);

        if (invoiceDate && (!current.lastOrderDate || invoiceDate > current.lastOrderDate)) {
            current.lastOrderDate = invoiceDate;
        }
    });

    return Array.from(customerStats.values())
        .map((customer) => ({
            ...customer,
            lastOrder: formatRelativeTime(customer.lastOrderDate),
            status: customer.lastOrderDate && (Date.now() - customer.lastOrderDate.getTime()) <= 7 * 24 * 60 * 60 * 1000 ? 'active' : 'inactive'
        }))
        .sort((left, right) => right.totalSpent - left.totalSpent)
        .slice(0, limit);
};

const buildEmployeePerformance = (datasets, timeRange, limit = 4, filters = {}) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange, filters);
    const employeeDirectory = buildEmployeeDirectory(datasets.employees);
    const employeeStats = new Map();
    const targetByRange = {
        Today: 10000,
        Yesterday: 10000,
        'This Week': 50000,
        'This Month': 200000,
        'Last Month': 200000,
        'This Year': 2400000
    };
    const target = targetByRange[timeRange] ?? 10000;

    filteredInvoices.forEach((invoice) => {
        const employeeName = getSalespersonName(invoice);
        const employeeKey = normalizeKey(employeeName) || 'unknown';

        if (!employeeStats.has(employeeKey)) {
            employeeStats.set(employeeKey, {
                name: employeeName,
                sales: 0,
                revenue: 0
            });
        }

        const current = employeeStats.get(employeeKey);
        current.sales += 1;
        current.revenue += getInvoiceAmount(invoice);
    });

    return Array.from(employeeStats.values())
        .map((stats) => {
            const employee = employeeDirectory.get(normalizeKey(stats.name));
            const completion = target > 0 ? Math.min(1, stats.revenue / target) : 0;

            return {
                id: employee?.id ?? stats.name,
                name: stats.name,
                role: pickText(employee?.role, employee?.department, 'Sales Executive'),
                sales: stats.sales,
                revenue: stats.revenue,
                target,
                rating: Number((3 + completion * 2).toFixed(1))
            };
        })
        .sort((left, right) => right.revenue - left.revenue)
        .slice(0, limit);
};

const buildRecentActivity = (datasets, limit = 5) => {
    const candidates = [];

    // Collect every event from every source — no per-source cap.
    // After merging, we sort globally and take the most recent `limit`.

    datasets.invoices.filter(isInvoiceCountable).forEach((invoice) => {
        const time = getInvoiceDate(invoice);
        if (!time) return;
        const num = pickText(invoice?.invoiceNumber, invoice?.id?.toString(), 'Invoice');
        const customerName = getCustomerName(invoice);
        candidates.push({
            type: 'sale',
            user: getSalespersonName(invoice) || 'System',
            action: `Sales Invoice #${num} — ${customerName}`,
            time,
            status: hasAnyStatus(invoice?.status, ['PAID', 'POSTED', 'CONFIRMED', 'PARTIALLY_PAID']) ? 'success' : 'info'
        });
    });

    datasets.lpos.forEach((lpo) => {
        const time = getLpoDate(lpo);
        if (!time) return;
        const num = pickText(lpo?.lpoNumber, lpo?.id?.toString(), 'LPO');
        candidates.push({
            type: 'purchase',
            user: 'Procurement',
            action: `Purchase Order #${num} ${hasAnyStatus(lpo?.status, ['APPROVED', 'SENT_TO_VENDOR', 'COMPLETED']) ? 'approved' : 'created'}`,
            time,
            status: hasAnyStatus(lpo?.status, ['APPROVED', 'SENT_TO_VENDOR', 'COMPLETED']) ? 'success' : 'info'
        });
    });

    datasets.grns.forEach((grn) => {
        const time = getGrnDate(grn);
        if (!time) return;
        const num = pickText(grn?.idDisplay, grn?.grnNumber, grn?.id?.toString(), 'GRN');
        candidates.push({
            type: 'purchase',
            user: 'Warehouse',
            action: `GRN #${num} ${hasAnyStatus(grn?.status, ['APPROVED', 'POSTED']) ? 'posted' : 'received'}`,
            time,
            status: hasAnyStatus(grn?.status, ['APPROVED', 'POSTED']) ? 'success' : 'info'
        });
    });

    datasets.inquiries.forEach((inquiry) => {
        const time = getInquiryDate(inquiry);
        if (!time) return;
        candidates.push({
            type: 'customer',
            user: pickText(inquiry?.assignedTo, 'System'),
            action: `Customer inquiry from ${pickText(inquiry?.customer, inquiry?.customerName, 'Customer')}`,
            time,
            status: 'info'
        });
    });

    datasets.expenses.forEach((expense) => {
        const time = getExpenseDate(expense);
        if (!time) return;
        candidates.push({
            type: 'payment',
            user: pickText(expense?.createdBy, 'System'),
            action: `Expense: ${pickText(expense?.category, expense?.vendor, 'General')}`,
            time,
            status: 'success'
        });
    });

    return candidates
        .sort((left, right) => right.time - left.time)
        .slice(0, limit)
        .map((activity) => ({
            ...activity,
            time: formatRelativeTime(activity.time)
        }));
};

const buildDashboardSections = (datasets, timeRange, filters = {}) => {
    const productLookup = buildProductLookup(datasets.products);
    const inventoryRows = [
        ...datasets.stockValuation,
        ...datasets.lowStockReport,
        ...datasets.outOfStockReport
    ];
    const stockLookup = buildStockLookup(inventoryRows);
    const sales = buildSalesMetrics(datasets, timeRange, filters);
    const salesTrend = buildSalesTrend(datasets, timeRange, filters);

    return {
        sales,
        inventory: buildInventoryMetrics(datasets),
        financial: buildFinancialMetrics(datasets, timeRange, sales, filters),
        hr: buildHRMetrics(datasets),
        purchase: buildPurchaseMetrics(datasets, timeRange, filters),
        transactions: buildRecentTransactions(datasets, 10, timeRange, filters),
        paymentBreakdown: buildPaymentBreakdown(datasets, timeRange, filters),
        salesTrend,
        salesTrendMeta: buildSalesTrendMeta(salesTrend, timeRange),
        topDepartments: buildTopDepartments(datasets, timeRange, productLookup, 4, filters),
        topProducts: buildTopProducts(datasets, timeRange, productLookup, stockLookup, 5, filters),
        topCustomers: buildTopCustomers(datasets, timeRange, 5, filters),
        employeePerformance: buildEmployeePerformance(datasets, timeRange, 4, filters),
        recentActivity: buildRecentActivity(datasets, 5)
    };
};

export const getSalesMetrics = async (timeRange = 'Today') => {
    const datasets = await loadDashboardDatasets();
    return buildSalesMetrics(datasets, timeRange);
};

export const getInventoryMetrics = async () => {
    const datasets = await loadDashboardDatasets();
    return buildInventoryMetrics(datasets);
};

export const getFinancialMetrics = async (timeRange = 'Today') => {
    const datasets = await loadDashboardDatasets();
    const sales = buildSalesMetrics(datasets, timeRange);
    return buildFinancialMetrics(datasets, timeRange, sales);
};

export const getHRMetrics = async () => {
    const datasets = await loadDashboardDatasets();
    return buildHRMetrics(datasets);
};

export const getPurchaseMetrics = async (timeRange = 'Today') => {
    const datasets = await loadDashboardDatasets();
    return buildPurchaseMetrics(datasets, timeRange);
};

export const getRecentTransactions = async (limit = 10) => {
    const datasets = await loadDashboardDatasets();
    return buildRecentTransactions(datasets, limit);
};

export const getSalesTrendData = async (timeRange = 'Today') => {
    const datasets = await loadDashboardDatasets();
    return buildSalesTrend(datasets, timeRange);
};

export const getPaymentBreakdown = async (timeRange = 'Today') => {
    const datasets = await loadDashboardDatasets();
    return buildPaymentBreakdown(datasets, timeRange);
};

export const getTopDepartments = async (timeRange = 'Today', limit = 4) => {
    const datasets = await loadDashboardDatasets();
    const productLookup = buildProductLookup(datasets.products);
    return buildTopDepartments(datasets, timeRange, productLookup, limit);
};

export const getTopProducts = async (timeRange = 'Today', limit = 5) => {
    const datasets = await loadDashboardDatasets();
    const productLookup = buildProductLookup(datasets.products);
    const stockLookup = buildStockLookup([
        ...datasets.stockValuation,
        ...datasets.lowStockReport,
        ...datasets.outOfStockReport
    ]);
    return buildTopProducts(datasets, timeRange, productLookup, stockLookup, limit);
};

export const getTopCustomers = async (timeRange = 'Today', limit = 5) => {
    const datasets = await loadDashboardDatasets();
    return buildTopCustomers(datasets, timeRange, limit);
};

export const getEmployeePerformance = async (timeRange = 'Today', limit = 4) => {
    const datasets = await loadDashboardDatasets();
    return buildEmployeePerformance(datasets, timeRange, limit);
};

export const getRecentActivity = async (limit = 5) => {
    const datasets = await loadDashboardDatasets();
    return buildRecentActivity(datasets, limit);
};

export const getDashboardData = async (timeRange = 'Today', options = {}) => {
    if (!sessionStorage.getItem('token')) return createEmptyDashboardData();
    const { force = false, forceClient = false, onStale, filters: rawFilters = {} } = options;
    const filters = normalizeDashboardFilters(rawFilters);
    const filtersActive = hasDashboardFilters(filters);
    const effectiveTimeRange = filters.fromDate || filters.toDate ? 'Custom' : timeRange;
    const cacheKey = getFilterCacheKey(
        forceClient ? `${effectiveTimeRange}:client` : effectiveTimeRange,
        filters
    );

    // Fire stale callback immediately so UI paints from cache while fresh data loads
    if (!force && onStale) {
        const stale = readLocalStorageCache(cacheKey);
        if (stale) onStale(stale);
    }

    const cached = dashboardCache.get(cacheKey);
    if (!force && cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.data;
    }

    if (!force && inFlightRequests.has(cacheKey)) {
        return inFlightRequests.get(cacheKey);
    }

    const request = (async () => {
        // Fast path: single aggregated backend endpoint.
        // Use it when there are no client-side-only filters (custom date range / amount / status).
        // Branch-only filtering is handled server-side, so it qualifies for the fast path.
        const hasClientOnlyFilters = filters.fromDate || filters.toDate ||
            (filters.invoiceStatus && filters.invoiceStatus !== 'all') ||
            filters.minAmount || filters.maxAmount;
        if (!hasClientOnlyFilters && !forceClient) {
            try {
                const backend = await fetchDashboardSummary(effectiveTimeRange, filters.branchId || null);
                return transformBackendDashboard(backend, effectiveTimeRange);
            } catch (backendError) {
                console.warn('Dashboard summary endpoint unavailable, falling back to full fetch:', backendError?.message);
            }
        }

        // Fallback: full 15-call client-side aggregation
        const emptyState = createEmptyDashboardData();
        const datasets = applyDashboardFilters(await loadDashboardDatasets(), filters);
        const dashboardSections = buildDashboardSections(datasets, effectiveTimeRange, filters);
        return { ...emptyState, ...dashboardSections, lastUpdated: new Date().toISOString() };
    })();

    inFlightRequests.set(cacheKey, request);

    try {
        const data = await request;
        dashboardCache.set(cacheKey, { timestamp: Date.now(), data });
        writeLocalStorageCache(cacheKey, data);
        return data;
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return createEmptyDashboardData();
    } finally {
        inFlightRequests.delete(cacheKey);
    }
};
