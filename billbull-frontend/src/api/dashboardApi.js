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
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return null;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const filterByDateRange = (items, getDate, range) => {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return asArray(items).filter((item) => {
        const itemDate = getDate(item);
        if (!itemDate) return false;

        switch (range) {
            case 'Today':
                return itemDate >= today;
            case 'Yesterday':
                return itemDate >= yesterday && itemDate < today;
            case 'This Week':
                return itemDate >= weekStart;
            case 'This Month':
                return itemDate >= monthStart;
            default:
                return true;
        }
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

    return asArray(items).filter((item) => {
        const itemDate = getDate(item);
        if (!itemDate) return false;
        switch (range) {
            case 'Today':      return itemDate >= yesterday && itemDate < today;
            case 'Yesterday':  return itemDate >= dayBefore && itemDate < yesterday;
            case 'This Week':  return itemDate >= prevWeekStart && itemDate < weekStart;
            case 'This Month': return itemDate >= prevMonthStart && itemDate < monthStart;
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

// Prefer timestamp when available so "Today" can group by hour correctly.
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

const buildSalesMetrics = (datasets, timeRange) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
    const filteredOrders = filterByDateRange(
        datasets.orders.filter((order) => !hasAnyStatus(order?.status, ['CANCELLED', 'VOID'])),
        getOrderDate,
        timeRange
    );
    const filteredReturns = filterByDateRange(datasets.returnsData.filter(isReturnCountable), getReturnDate, timeRange);

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

const buildInventoryMetrics = (datasets) => {
    const valuationRows = datasets.stockValuation.map(normalizeStockRow);
    const lowStockRows = datasets.lowStockReport.map(normalizeStockRow);
    const outOfStockRows = datasets.outOfStockReport.map(normalizeStockRow);
    const allKnownInventoryIds = new Set(
        [...valuationRows, ...lowStockRows, ...outOfStockRows].map((row) => row.productId ?? row.sku ?? row.name)
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
        lowStockCount: lowStockRows.length,
        outOfStockCount: outOfStockRows.length,
        stockValueCost: sumBy(valuationRows, (row) => row.stockValue),
        stockValueRetail: sumBy(valuationRows, (row) => row.retailValue),
        pendingTransfers: datasets.transfers.filter((transfer) => hasAnyStatus(transfer?.status, ['PENDING', 'DRAFT', 'REQUESTED', 'PENDING_APPROVAL', 'IN_TRANSIT'])).length,
        lowStockProducts: lowStockRows.slice(0, 10),
        outOfStockProducts: outOfStockRows.slice(0, 10)
    };
};

const buildFinancialMetrics = (datasets, timeRange, salesMetrics) => {
    const filteredExpenses = filterByDateRange(datasets.expenses, getExpenseDate, timeRange);
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

const buildPurchaseMetrics = (datasets, timeRange) => {
    const filteredLPOs = filterByDateRange(datasets.lpos, getLpoDate, timeRange);
    const filteredGRNs = filterByDateRange(datasets.grns, getGrnDate, timeRange);

    return {
        pendingLPOs: datasets.lpos.filter((lpo) => hasAnyStatus(lpo?.status ?? lpo?.approvalStatus, ['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'SUBMITTED'])).length,
        totalPurchases: sumBy(filteredGRNs, (grn) => toNumber(grn?.value, grn?.totalValue, grn?.grandTotal, grn?.subtotal)),
        lpoCount: filteredLPOs.length,
        grnCount: filteredGRNs.length
    };
};

const buildRecentTransactions = (datasets, limit = 10) => (
    datasets.invoices
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

const buildSalesTrend = (datasets, timeRange) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
    const grouped = {};

    filteredInvoices.forEach((invoice) => {
        const invoiceDate = getInvoiceDate(invoice);
        if (!invoiceDate) return;

        const key = timeRange === 'Today'
            ? invoiceDate.getHours()
            : invoiceDate.toISOString().slice(0, 10);

        if (!grouped[key]) {
            grouped[key] = { sales: 0, count: 0 };
        }

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
        if (timeRange === 'Today') {
            const h = Number(peakKey);
            const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
            const period = h >= 12 ? 'PM' : 'AM';
            peakLabel = `${display} ${period}`;
        } else {
            peakLabel = new Date(peakKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }

    const periodCount = timeRange === 'Today' ? 10 : (entries.length || 1);
    const avgSales = periodCount > 0 ? totalSales / periodCount : 0;

    return { peakLabel, avgSales };
};

const buildPaymentBreakdown = (datasets, timeRange) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
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

const buildTopDepartments = (datasets, timeRange, productLookup, limit = 4) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
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

const buildTopProducts = (datasets, timeRange, productLookup, stockLookup, limit = 5) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
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

const buildTopCustomers = (datasets, timeRange, limit = 5) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
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

const buildEmployeePerformance = (datasets, timeRange, limit = 4) => {
    const filteredInvoices = filterByDateRange(datasets.invoices.filter(isInvoiceCountable), getInvoiceDate, timeRange);
    const employeeDirectory = buildEmployeeDirectory(datasets.employees);
    const employeeStats = new Map();
    const targetByRange = {
        Today: 10000,
        Yesterday: 10000,
        'This Week': 50000,
        'This Month': 200000
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
    const activities = [];

    datasets.invoices
        .filter(isInvoiceCountable)
        .sort((left, right) => (getInvoiceDate(right)?.getTime() ?? 0) - (getInvoiceDate(left)?.getTime() ?? 0))
        .slice(0, 2)
        .forEach((invoice) => {
            activities.push({
                type: 'sale',
                user: getSalespersonName(invoice) || 'System',
                action: `Created Sales Invoice #${pickText(invoice?.invoiceNumber, invoice?.id?.toString(), 'Invoice')}`,
                time: getInvoiceDate(invoice),
                status: 'success'
            });
        });

    datasets.grns
        .sort((left, right) => (getGrnDate(right)?.getTime() ?? 0) - (getGrnDate(left)?.getTime() ?? 0))
        .slice(0, 1)
        .forEach((grn) => {
            activities.push({
                type: 'purchase',
                user: 'System',
                action: `GRN #${pickText(grn?.idDisplay, grn?.id?.toString(), 'GRN')} ${hasAnyStatus(grn?.status, ['APPROVED', 'POSTED']) ? 'approved' : 'created'}`,
                time: getGrnDate(grn),
                status: hasAnyStatus(grn?.status, ['APPROVED', 'POSTED']) ? 'success' : 'info'
            });
        });

    datasets.inquiries
        .sort((left, right) => (getInquiryDate(right)?.getTime() ?? 0) - (getInquiryDate(left)?.getTime() ?? 0))
        .slice(0, 1)
        .forEach((inquiry) => {
            activities.push({
                type: 'customer',
                user: pickText(inquiry?.assignedTo, 'System'),
                action: `New customer inquiry from ${pickText(inquiry?.customer, inquiry?.customerName, 'Customer')}`,
                time: getInquiryDate(inquiry),
                status: 'info'
            });
        });

    datasets.expenses
        .sort((left, right) => (getExpenseDate(right)?.getTime() ?? 0) - (getExpenseDate(left)?.getTime() ?? 0))
        .slice(0, 1)
        .forEach((expense) => {
            activities.push({
                type: 'payment',
                user: pickText(expense?.createdBy, 'System'),
                action: `Expense recorded: ${pickText(expense?.category, expense?.vendor, 'General')}`,
                time: getExpenseDate(expense),
                status: 'success'
            });
        });

    return activities
        .filter((activity) => activity.time)
        .sort((left, right) => right.time - left.time)
        .slice(0, limit)
        .map((activity) => ({
            ...activity,
            time: formatRelativeTime(activity.time)
        }));
};

const buildDashboardSections = (datasets, timeRange) => {
    const productLookup = buildProductLookup(datasets.products);
    const inventoryRows = [
        ...datasets.stockValuation,
        ...datasets.lowStockReport,
        ...datasets.outOfStockReport
    ];
    const stockLookup = buildStockLookup(inventoryRows);
    const sales = buildSalesMetrics(datasets, timeRange);
    const salesTrend = buildSalesTrend(datasets, timeRange);

    return {
        sales,
        inventory: buildInventoryMetrics(datasets),
        financial: buildFinancialMetrics(datasets, timeRange, sales),
        hr: buildHRMetrics(datasets),
        purchase: buildPurchaseMetrics(datasets, timeRange),
        transactions: buildRecentTransactions(datasets, 10),
        paymentBreakdown: buildPaymentBreakdown(datasets, timeRange),
        salesTrend,
        salesTrendMeta: buildSalesTrendMeta(salesTrend, timeRange),
        topDepartments: buildTopDepartments(datasets, timeRange, productLookup, 4),
        topProducts: buildTopProducts(datasets, timeRange, productLookup, stockLookup, 5),
        topCustomers: buildTopCustomers(datasets, timeRange, 5),
        employeePerformance: buildEmployeePerformance(datasets, timeRange, 4),
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
    const { force = false } = options;
    const cacheKey = timeRange;
    const cached = dashboardCache.get(cacheKey);

    if (!force && cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.data;
    }

    if (!force && inFlightRequests.has(cacheKey)) {
        return inFlightRequests.get(cacheKey);
    }

    const request = (async () => {
        const emptyState = createEmptyDashboardData();
        const datasets = await loadDashboardDatasets();
        const dashboardSections = buildDashboardSections(datasets, timeRange);

        return {
            ...emptyState,
            ...dashboardSections,
            lastUpdated: new Date().toISOString()
        };
    })();

    inFlightRequests.set(cacheKey, request);

    try {
        const data = await request;
        dashboardCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return createEmptyDashboardData();
    } finally {
        inFlightRequests.delete(cacheKey);
    }
};
