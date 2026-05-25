import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    FaBars,
    FaCalendarAlt,
    FaChartBar,
    FaChartPie,
    FaChevronDown,
    FaClipboardCheck,
    FaExclamationTriangle,
    FaFileInvoiceDollar,
    FaFilter,
    FaPercentage,
    FaReceipt,
    FaSearch,
    FaShieldAlt,
    FaSync,
    FaTable,
    FaTags,
    FaTimes,
    FaTruck,
    FaUserTie,
    FaUsers
} from 'react-icons/fa';
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
import ExportDropdown from '../../../components/common/ExportDropdown';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getBranches } from '../../../api/branchApi';
import { getPrintTemplates } from '../../../api/printTemplateApi';
import { getSalesReportData } from '../../../api/salesReportsApi';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { generateReportPrintHtml, printHtml } from '../../../utils/printGenerator';

const REPORT_GROUPS = [
    {
        id: 'summary',
        title: 'Sales Summary & Financial',
        reports: [
            { id: 'sales-summary', title: 'Sales Summary Report', description: 'Total sales, net sales, VAT, COGS, gross profit and GP%.', badge: 'Chart', tag: 'Core', icon: FaChartBar },
            { id: 'daily-sales', title: 'Daily Sales Report', description: 'Day-wise sales, returns, collections, tax and outstanding.', badge: 'Chart', tag: 'Core', icon: FaCalendarAlt },
            { id: 'channel-wise-sales', title: 'Channel-wise Sales Report', description: 'Back-office, direct sale and prepaid channel metrics.', badge: 'Chart', tag: 'Core', icon: FaChartPie }
        ]
    },
    {
        id: 'route',
        title: 'VAN / Route Sales',
        reports: [
            { id: 'van-sales-summary', title: 'VAN Sales Summary', description: 'Route, salesperson, stock issued, sales value and collection.', badge: 'Chart', tag: 'VAN', icon: FaTruck },
            { id: 'van-item-sales', title: 'VAN Item Sales Report', description: 'Item-wise quantity sold, returned, free issue and value.', badge: 'Table', tag: 'VAN', icon: FaTable },
            { id: 'van-route-performance', title: 'VAN Route / Beat Performance', description: 'Planned vs actual visits, sales target and conversion%.', badge: 'Chart', tag: 'Performance', icon: FaChartBar },
            { id: 'van-collection', title: 'VAN Collection Report', description: 'Cash, card, credit sales, pending and variance by route.', badge: 'Table', tag: 'Finance', icon: FaFileInvoiceDollar },
            { id: 'van-stock-variance', title: 'VAN Stock Variance Report', description: 'Issued value, sold value, returns, expected and actual balance.', badge: 'Table', tag: 'Audit', icon: FaClipboardCheck }
        ]
    },
    {
        id: 'back-office',
        title: 'Back-Office Sales',
        reports: [
            { id: 'sales-invoice-register', title: 'Sales Invoice Register', description: 'Invoice no, customer, status, tax and outstanding amount.', badge: 'Table', tag: 'Invoice', icon: FaReceipt },
            { id: 'sales-order-status', title: 'Sales Order Status Report', description: 'Order no, ordered vs delivered vs pending quantity.', badge: 'Table', tag: 'Order', icon: FaClipboardCheck },
            { id: 'delivery-dispatch', title: 'Delivery / Dispatch Report', description: 'Delivery note, driver, vehicle, status and proof of delivery.', badge: 'Table', tag: 'Logistics', icon: FaTruck },
            { id: 'credit-note-returns', title: 'Credit Note & Returns Report', description: 'Credit note, reason, linked invoice and return value.', badge: 'Table', tag: 'Returns', icon: FaFileInvoiceDollar }
        ]
    },
    {
        id: 'customer',
        title: 'Customer-Centric Reports',
        reports: [
            { id: 'customer-sales-summary', title: 'Customer Sales Summary', description: 'Customer-wise total sales, returns, net and outstanding.', badge: 'Chart', tag: 'CRM', icon: FaUsers },
            { id: 'customer-aging', title: 'Customer Aging Report', description: 'Aging buckets: current, 1-30, 31-60, 61-90 and 90+ days.', badge: 'Chart', tag: 'Finance', icon: FaCalendarAlt },
            { id: 'top-dormant-customers', title: 'Top / Dormant Customers', description: 'Top revenue customers and inactive customers by days since sale.', badge: 'Chart', tag: 'CRM', icon: FaUsers },
            { id: 'customer-price-level', title: 'Customer Price Level Report', description: 'Assigned price level, discount rules and credit limits.', badge: 'Table', tag: 'Pricing', icon: FaTags },
            { id: 'customer-bill-item-profit', title: 'Customer - Bill - Item Profit Report', description: 'Drill into customer bills and item-level cost, margin and GP%.', badge: 'Chart', tag: 'Profitability', icon: FaPercentage }
        ]
    },
    {
        id: 'item',
        title: 'Item & Category Performance',
        reports: [
            { id: 'item-wise-sales', title: 'Item-wise Sales Report', description: 'Item, qty sold, revenue, COGS, returns and GP%.', badge: 'Chart', tag: 'Analytics', icon: FaTable },
            { id: 'category-brand-sales', title: 'Category / Brand Sales Report', description: 'Category-wise quantity, contribution%, returns and GP%.', badge: 'Chart', tag: 'Analytics', icon: FaChartPie },
            { id: 'fast-slow-moving', title: 'Fast / Slow Moving Items', description: 'High velocity vs low velocity items from sales movement.', badge: 'Chart', tag: 'Analytics', icon: FaChartBar }
        ]
    },
    {
        id: 'discount',
        title: 'Discount & Promotion',
        reports: [
            { id: 'discount-summary', title: 'Discount Summary Report', description: 'Bill and line discount by customer, salesperson and channel.', badge: 'Chart', tag: 'Discount', icon: FaTags },
            { id: 'promotion-effectiveness', title: 'Promotion Effectiveness Report', description: 'Discounted item sales, gross profit and margin impact.', badge: 'Table', tag: 'Promo', icon: FaPercentage },
            { id: 'discount-approval', title: 'Discount Approval Report', description: 'Invoices requiring review based on discount percentage.', badge: 'Table', tag: 'Audit', icon: FaShieldAlt }
        ]
    },
    {
        id: 'tax',
        title: 'Tax & Compliance',
        reports: [
            { id: 'tax-summary', title: 'Tax Summary Report', description: 'Taxable sales, zero-rated sales, VAT collected and adjustments.', badge: 'Chart', tag: 'Tax', icon: FaShieldAlt },
            { id: 'vat-output-register', title: 'VAT Output Register', description: 'Invoice-wise VAT details for audit and filing.', badge: 'Table', tag: 'Audit', icon: FaFileInvoiceDollar }
        ]
    },
    {
        id: 'audit',
        title: 'Audit & Control',
        reports: [
            { id: 'price-override', title: 'Price Override Report', description: 'Item old vs new price, change%, user and reason.', badge: 'Table', tag: 'Audit', icon: FaExclamationTriangle },
            { id: 'manual-backdated-entry', title: 'Manual / Back-Dated Entry Report', description: 'User, date and impact value for back-dated entries.', badge: 'Table', tag: 'Audit', icon: FaClipboardCheck },
            { id: 'sales-edit-log', title: 'Sales Edit Log', description: 'Edited invoices, fields changed, before/after and user.', badge: 'Table', tag: 'Audit', icon: FaReceipt }
        ]
    }
];

const SALES_CHANNELS = ['All', 'Back-Office', 'Direct Sale', 'Prepaid Sale'];
const COLORS = ['#f5c742', '#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#14b8a6'];

const allReports = REPORT_GROUPS.flatMap(group => group.reports.map(report => ({ ...report, group: group.title })));

const normalize = value => String(value ?? '').toLowerCase();

const reportGroupId = reportId => REPORT_GROUPS.find(group =>
    group.reports.some(report => report.id === reportId)
)?.id;

const formatNumber = (value, decimals = 0) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString('en-AE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const parseDateValue = value => {
    if (!value || value === 'N/A') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateValue = value => {
    const date = parseDateValue(value);
    if (!date) return value || '-';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const badgeClass = value => {
    const v = normalize(value);
    if (['cancelled', 'rejected', 'overdue', 'high', 'review', 'dormant'].some(word => v.includes(word))) return 'bg-red-50 text-red-700 border-red-200';
    if (['partial', 'pending', 'watch', 'medium', 'draft'].some(word => v.includes(word))) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (['paid', 'approved', 'delivered', 'active', 'healthy', 'low', 'within'].some(word => v.includes(word))) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (['dispatched', 'prepaid', 'direct'].some(word => v.includes(word))) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
};

const SalesSummaryReport = () => {
    const [activeId, setActiveId] = useState('sales-summary');
    const [search, setSearch] = useState('');
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [branches, setBranches] = useState([{ id: 'All', name: 'All' }]);
    const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(REPORT_GROUPS.map(group => [group.id, true])));
    const [filters, setFilters] = useState({
        dateFrom: '',
        dateTo: '',
        branchId: 'All',
        salesChannel: 'All',
        salesperson: 'All',
        searchQuery: ''
    });
    const reportCacheRef = useRef(new Map());

    const activeReport = allReports.find(report => report.id === activeId) || allReports[0];

    const visibleGroups = useMemo(() => {
        const term = normalize(search);
        return REPORT_GROUPS.map(group => ({
            ...group,
            reports: group.reports.filter(report =>
                normalize(report.title).includes(term) ||
                normalize(report.description).includes(term) ||
                normalize(report.tag).includes(term)
            )
        })).filter(group => group.reports.length > 0);
    }, [search]);

    const columns = payload?.columns || [];
    const rows = payload?.rows || [];

    const salespeople = useMemo(() => {
        const values = rows.flatMap(row => [
            row.salesperson,
            row.route,
            row.user
        ]).filter(Boolean);
        return ['All', ...new Set(values)];
    }, [rows]);

    const loadBranches = async () => {
        try {
            const rows = await getBranches();
            setBranches([{ id: 'All', name: 'All' }, ...(rows || [])]);
        } catch (error) {
            console.error('Failed to load branches', error);
        }
    };

    const generateReport = async (signal, { force = false, nextFilters = filters } = {}) => {
        const cacheKey = JSON.stringify({ reportId: activeId, filters: nextFilters });
        if (!force && reportCacheRef.current.has(cacheKey)) {
            setPayload(reportCacheRef.current.get(cacheKey));
            return;
        }

        setLoading(true);
        try {
            const data = await getSalesReportData(activeId, nextFilters, signal);
            if (data) {
                setPayload(data);
                reportCacheRef.current.set(cacheKey, data);
            }
        } catch (error) {
            toast.error('Failed to load sales report.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBranches();
    }, []);

    useEffect(() => {
        const groupId = reportGroupId(activeId);
        if (groupId) {
            setOpenGroups(prev => ({ ...prev, [groupId]: true }));
        }
        setPayload(null);
        const controller = new AbortController();
        generateReport(controller.signal);
        return () => controller.abort();
    }, [activeId]);

    const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

    const resetFilters = () => {
        const cleared = {
            dateFrom: '',
            dateTo: '',
            branchId: 'All',
            salesChannel: 'All',
            salesperson: 'All',
            searchQuery: ''
        };
        setFilters(cleared);
        generateReport(undefined, { force: true, nextFilters: cleared });
    };

    const handleReportSelect = id => {
        setActiveId(id);
        setSidebarOpen(false);
    };

    const expandAllGroups = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, true])));
    const collapseAllGroups = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, false])));

    const exportColumns = useMemo(() => columns.map(column => ({
        header: column.header,
        key: column.key,
        width: column.width || 18,
        type: column.type
    })), [columns]);

    const handleExportExcel = () => exportToExcel(rows, exportColumns, payload?.title || activeReport.title);
    const handleExportPdf = () => exportToPDF(rows, exportColumns, payload?.title || activeReport.title, payload?.reportId || activeId);
    const handlePrint = async () => {
        try {
            const templates = await getPrintTemplates();
            const defaultTemplate = templates.find(template => template.isDefault) || {};
            printHtml(generateReportPrintHtml(defaultTemplate, payload?.title || activeReport.title, exportColumns, rows));
        } catch (error) {
            printHtml(generateReportPrintHtml({}, payload?.title || activeReport.title, exportColumns, rows));
        }
    };

    const renderMetric = card => {
        if (card.type === 'currency') return <CurrencyAmount value={card.value} />;
        if (card.type === 'number') return formatNumber(card.value, Number(card.value) % 1 === 0 ? 0 : 2);
        if (card.type === 'percent') return `${formatNumber(card.value, 1)}%`;
        return card.value ?? '-';
    };

    const renderCell = (row, column) => {
        const value = row[column.key];
        if (value === null || value === undefined || value === '') return <span className="text-slate-400">-</span>;
        if (column.type === 'currency') return <CurrencyAmount value={value} />;
        if (column.type === 'number') return formatNumber(value, Number(value) % 1 === 0 ? 0 : 2);
        if (column.type === 'percent') return `${formatNumber(value, Number(value) % 1 === 0 ? 0 : 1)}%`;
        if (column.type === 'date') return formatDateValue(value);
        if (column.type === 'badge') {
            return (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass(value)}`}>
                    {String(value)}
                </span>
            );
        }
        return String(value);
    };

    const renderChart = (chart, index) => {
        const data = chart.data || [];
        const series = chart.series?.length ? chart.series : ['value'];
        const nameKey = data[0]?.name !== undefined ? 'name' : data[0]?.date !== undefined ? 'date' : data[0]?.category !== undefined ? 'category' : 'label';

        if (data.length === 0) {
            return <div className="flex h-64 items-center justify-center text-sm text-slate-400">No chart data</div>;
        }

        if (chart.type === 'pie') {
            return (
                <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                        <Pie data={data} dataKey={series[0]} nameKey={nameKey} innerRadius={42} outerRadius={88} paddingAngle={2}>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={value => formatNumber(value, 2)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        return (
            <ResponsiveContainer width="100%" height={270}>
                <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={value => formatNumber(value)} />
                    <Tooltip formatter={value => formatNumber(value, 2)} />
                    {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {series.map((key, i) => (
                        <Bar key={key} dataKey={key} fill={COLORS[(index + i) % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={54} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const SidebarContent = () => (
        <>
            <div className="border-b border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-slate-950">Sales Reports</h2>
                        <p className="mt-1 text-[11px] text-slate-500">Back-office, VAN, customer, item, tax and audit analytics.</p>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
                    >
                        <FaTimes />
                    </button>
                </div>
                <div className="relative mt-4">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Search reports..."
                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs outline-none focus:border-yellow-400"
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

            <div className="flex-1 overflow-y-auto p-3">
                {visibleGroups.map(group => {
                    const isOpen = Boolean(search.trim()) || openGroups[group.id];
                    return (
                        <div key={group.id} className="mb-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setOpenGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-bold text-slate-800">{group.title}</span>
                                    <span className="text-[10px] text-slate-500">{group.reports.length} report(s)</span>
                                </span>
                                <FaChevronDown className={`shrink-0 text-[10px] text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isOpen && (
                                <div className="border-t border-slate-200 p-2">
                                    {group.reports.map(report => {
                                        const Icon = report.icon;
                                        const active = report.id === activeId;
                                        return (
                                            <button
                                                key={report.id}
                                                onClick={() => handleReportSelect(report.id)}
                                                className={`mb-1 w-full rounded-lg border p-2 text-left transition ${
                                                    active
                                                        ? 'border-yellow-400 bg-yellow-50 shadow-sm'
                                                        : 'border-slate-200 bg-white hover:border-yellow-200 hover:bg-yellow-50/30'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Icon className={`mt-0.5 text-sm ${active ? 'text-yellow-600' : 'text-slate-500'}`} />
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
                    <button onClick={() => setSidebarOpen(true)} className="rounded-lg border border-slate-200 p-2 text-slate-600">
                        <FaBars />
                    </button>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-950">{activeReport.title}</div>
                        <div className="text-xs text-slate-500">Sales Reports</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-xs text-slate-500">Filters</div>
                                <h1 className="mt-1 text-sm font-bold text-slate-950">{payload?.title || activeReport.title}</h1>
                                <p className="mt-1 text-xs text-slate-500">{payload?.subtitle || activeReport.description}</p>
                            </div>
                            <button className="inline-flex items-center gap-2 rounded-full border border-yellow-300 px-3 py-1.5 text-xs font-semibold text-slate-800">
                                <FaFilter className="text-yellow-600" /> Advanced
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
                                Branch
                                <select value={filters.branchId} onChange={event => setFilter('branchId', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Sales Channel
                                <select value={filters.salesChannel} onChange={event => setFilter('salesChannel', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {SALES_CHANNELS.map(option => <option key={option}>{option}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Salesperson
                                <select value={filters.salesperson} onChange={event => setFilter('salesperson', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {salespeople.map(option => <option key={option}>{option}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600 xl:col-span-2">
                                Customer / Item Filter
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                                    <input value={filters.searchQuery} onChange={event => setFilter('searchQuery', event.target.value)} placeholder="Search customer name, invoice no, item or SKU..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-normal outline-none focus:border-yellow-400" />
                                </div>
                            </label>
                            <div className="flex items-end gap-2">
                                <button
                                    onClick={() => generateReport(undefined, { force: true })}
                                    disabled={loading}
                                    className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <FaSync className={loading ? 'animate-spin' : ''} /> Generate
                                </button>
                                <ExportDropdown
                                    onExportExcel={handleExportExcel}
                                    onExportPdf={handleExportPdf}
                                    onPrint={handlePrint}
                                    disabled={rows.length === 0 || loading}
                                />
                            </div>
                        </div>
                    </div>

                    {loading && !payload ? (
                        <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                                <FaSync className="animate-spin text-yellow-500" /> Loading sales report data...
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {(payload?.cards || []).map(card => (
                                    <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
                                        <div className="text-[11px] font-semibold text-slate-500">{card.label}</div>
                                        <div className="mt-2 truncate text-xl font-black text-slate-950">{renderMetric(card)}</div>
                                        {card.sub && <div className="mt-1 text-[11px] text-slate-400">{card.sub}</div>}
                                    </div>
                                ))}
                            </div>

                            {(payload?.charts || []).length > 0 && (
                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                    {payload.charts.map((chart, index) => (
                                        <div key={chart.title} className="rounded-xl border border-slate-200 bg-white p-4">
                                            <h3 className="text-sm font-bold text-slate-950">{chart.title}</h3>
                                            <div className="mt-3">{renderChart(chart, index)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-950">{payload?.title || activeReport.title}</h3>
                                        <p className="mt-1 text-xs text-slate-500">{rows.length} row(s)</p>
                                    </div>
                                    <ExportDropdown
                                        onExportExcel={handleExportExcel}
                                        onExportPdf={handleExportPdf}
                                        onPrint={handlePrint}
                                        disabled={rows.length === 0 || loading}
                                    />
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1040px] border-collapse text-xs">
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
                                                            <div className="text-sm font-semibold text-slate-500">No rows found for the current filters.</div>
                                                            <div className="text-xs leading-relaxed text-slate-400">
                                                                The report is ready, but the selected date, branch, channel, salesperson, customer, or item does not match any rows.
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

export default SalesSummaryReport;
