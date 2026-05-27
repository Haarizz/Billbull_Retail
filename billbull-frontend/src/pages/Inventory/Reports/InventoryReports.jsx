import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    FaBarcode,
    FaBars,
    FaBolt,
    FaBoxOpen,
    FaCalendarAlt,
    FaChartBar,
    FaChartPie,
    FaChevronDown,
    FaClipboardCheck,
    FaDatabase,
    FaExchangeAlt,
    FaExclamationTriangle,
    FaFileInvoiceDollar,
    FaFilter,
    FaPercentage,
    FaRandom,
    FaSearch,
    FaSync,
    FaTable,
    FaTags,
    FaTimes,
    FaTrash,
    FaWarehouse
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
import { getInventoryReportData } from '../../../api/inventoryReportsApi';
import { getWarehouses } from '../../../api/warehouseApi';
import { getPrintTemplates } from '../../../api/printTemplateApi';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { generateReportPrintHtml, printHtml } from '../../../utils/printGenerator';
import useReportScrollPreserver from '../../../hooks/useReportScrollPreserver';

const REPORT_GROUPS = [
    {
        id: 'stock',
        title: 'Stock & Availability',
        reports: [
            { id: 'stock-on-hand', title: 'Stock on Hand (SOH)', description: 'Current available qty by warehouse / category / item.', badge: 'Chart', tag: 'Core', icon: FaChartBar },
            { id: 'low-stock-reorder', title: 'Low Stock / Reorder', description: 'Items below min stock + suggested purchase qty.', badge: 'Table', tag: 'Planning', icon: FaExclamationTriangle },
            { id: 'out-of-stock', title: 'Out of Stock', description: 'Zero stock items with last sold / last received signals.', badge: 'Table', tag: 'Alert', icon: FaBoxOpen },
            { id: 'negative-stock-mismatch', title: 'Negative Stock / Mismatch', description: 'Data integrity issues: negative qty, missing batches, etc.', badge: 'Table', tag: 'Audit', icon: FaClipboardCheck },
            { id: 'stock-valuation', title: 'Stock Valuation', description: 'Valuation by Avg / FIFO / Last cost with totals.', badge: 'Chart', tag: 'Finance', icon: FaChartPie },
            { id: 'expiry-batch-ageing', title: 'Expiry / Batch Ageing', description: 'Expiring items in X days + ageing buckets.', badge: 'Table', tag: 'Batch', icon: FaCalendarAlt }
        ]
    },
    {
        id: 'movement',
        title: 'Movement & Control',
        reports: [
            { id: 'stock-movement-ledger', title: 'Stock Movement Ledger', description: 'All in/out transactions with running balance per item.', badge: 'Table', tag: 'Ledger', icon: FaExchangeAlt },
            { id: 'stock-transfer-report', title: 'Stock Transfer Report', description: 'Transfers: pending, in-transit, completed, variance.', badge: 'Table', tag: 'Warehouse', icon: FaWarehouse },
            { id: 'stock-reconciliation-report', title: 'Stock Reconciliation Report', description: 'Adjustments with reason & approver audit.', badge: 'Table', tag: 'Audit', icon: FaClipboardCheck },
            { id: 'wastage-internal-consumption', title: 'Wastage / Internal Consumption', description: 'Internal usage & wastage with cost impact.', badge: 'Chart', tag: 'Loss', icon: FaTrash },
            { id: 'inflow-outflow-summary', title: 'Inflow vs Outflow Summary', description: 'Period-based inflow/outflow by category & warehouse.', badge: 'Chart', tag: 'Planning', icon: FaRandom }
        ]
    },
    {
        id: 'pricing',
        title: 'Pricing & Margin',
        reports: [
            { id: 'price-level-audit', title: 'Price Level / Price Change Audit', description: 'Track price updates, user, timestamp, old vs new.', badge: 'Table', tag: 'Audit', icon: FaTags },
            { id: 'grn-invoice-cost-variance', title: 'GRN vs Invoice Cost Variance', description: 'Cost differences between receiving & invoicing stages.', badge: 'Table', tag: 'Finance', icon: FaFileInvoiceDollar },
            { id: 'item-margin-report', title: 'Item Margin Report (GP%)', description: 'Sales vs cost, gross profit by item/category.', badge: 'Chart', tag: 'Sales', icon: FaPercentage }
        ]
    },
    {
        id: 'master',
        title: 'Master Data & Compliance',
        reports: [
            { id: 'item-master-completeness', title: 'Item Master Completeness', description: 'Missing barcode, missing cost, missing category, etc.', badge: 'Table', tag: 'Quality', icon: FaDatabase },
            { id: 'barcode-label-audit', title: 'Barcode / Label Audit', description: 'Label templates, last printed, print queue status.', badge: 'Table', tag: 'Barcode', icon: FaBarcode },
            { id: 'weighing-scale-export', title: 'Weighing Scale Export Report', description: 'Items synced vs pending/failed to weighing scales.', badge: 'Table', tag: 'Scale', icon: FaTable }
        ]
    },
    {
        id: 'operational',
        title: 'Operational',
        reports: [
            { id: 'dead-slow-moving-stock', title: 'Dead / Slow Moving Stock', description: 'No sales in X days; ageing buckets.', badge: 'Chart', tag: 'Planning', icon: FaCalendarAlt },
            { id: 'fast-moving-items', title: 'Fast Moving Items', description: 'Top movers by qty/value for replenishment.', badge: 'Chart', tag: 'Planning', icon: FaBolt },
            { id: 'warehouse-bin-stock', title: 'Warehouse Bin Stock', description: 'Bin / rack-wise stock if bin locations enabled.', badge: 'Table', tag: 'Warehouse', icon: FaWarehouse }
        ]
    }
];

const COLORS = ['#f5c742', '#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#14b8a6'];

const allReports = REPORT_GROUPS.flatMap(group => group.reports.map(report => ({ ...report, group: group.title })));

const reportGroupId = (reportId) => REPORT_GROUPS.find(group =>
    group.reports.some(report => report.id === reportId)
)?.id;

const supportsStockCondition = (reportId) => ['stock-on-hand', 'stock-valuation', 'warehouse-bin-stock'].includes(reportId);

const formatNumber = (value, decimals = 0) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString('en-AE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const parseDateValue = (value) => {
    if (!value || value === 'N/A') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateValue = (value) => {
    const date = parseDateValue(value);
    if (!date) return value || '-';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const normalize = value => String(value ?? '').toLowerCase();

const getRowDate = (row) => {
    const keys = ['date', 'movementDate', 'transferDate', 'invoiceDate', 'expiryDate', 'nearestExpiry', 'lastSold', 'lastReceived', 'updatedAt'];
    for (const key of keys) {
        const date = parseDateValue(row[key]);
        if (date) return date;
    }
    return null;
};

const badgeClass = (value) => {
    const v = normalize(value);
    if (['critical', 'negative', 'cancelled', 'dead', 'incomplete'].some(word => v.includes(word))) return 'bg-red-50 text-red-700 border-red-200';
    if (['high', 'warning', 'pending', 'review', 'slow'].some(word => v.includes(word))) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (['completed', 'complete', 'ready', 'ok', 'active', 'stocked'].some(word => v.includes(word))) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (['in-transit', 'medium', 'watch', 'adj'].some(word => v.includes(word))) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
};

const InventoryReports = () => {
    const [activeId, setActiveId] = useState('stock-on-hand');
    const [search, setSearch] = useState('');
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState({
        stock: true,
        movement: true,
        pricing: true,
        master: true,
        operational: true
    });
    const [warehousesList, setWarehousesList] = useState([{ id: 'All', name: 'All' }]);
    const [filters, setFilters] = useState({
        dateFrom: '',
        dateTo: '',
        warehouseId: 'All',
        department: 'All',
        brand: 'All',
        searchQuery: '',
        stockCondition: 'Positive only'
    });
    const reportCacheRef = useRef(new Map());
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
                normalize(report.tag).includes(term)
            )
        })).filter(group => group.reports.length > 0);
    }, [search]);

    const loadWarehouses = async () => {
        try {
            const rows = await getWarehouses();
            setWarehousesList([{ id: 'All', name: 'All' }, ...(rows || [])]);
        } catch (error) {
            console.error('Failed to load warehouses', error);
        }
    };

    const generateReport = async (signal, { force = false } = {}) => {
        const cacheKey = JSON.stringify({ reportId: activeId, filters });
        if (!force && reportCacheRef.current.has(cacheKey)) {
            setPayload(reportCacheRef.current.get(cacheKey));
            return;
        }

        setLoading(true);
        try {
            const data = await getInventoryReportData(activeId, filters, signal);
            if (data) {
                setPayload(data);
                reportCacheRef.current.set(cacheKey, data);
            }
        } catch (error) {
            toast.error('Failed to load inventory report.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadWarehouses();
    }, []);

    useEffect(() => {
        const groupId = reportGroupId(activeId);
        if (groupId) {
            setOpenGroups(prev => ({ ...prev, [groupId]: true }));
        }
        const controller = new AbortController();
        generateReport(controller.signal);
        return () => controller.abort();
    }, [activeId]);

    const rows = payload?.rows || [];
    const columns = payload?.columns || [];

    const departments = useMemo(() => ['All', ...new Set(rows.map(row => row.department).filter(Boolean))], [rows]);
    const brands = useMemo(() => ['All', ...new Set(rows.map(row => row.brand).filter(Boolean))], [rows]);

    const filteredRows = useMemo(() => {
        const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
        const to = filters.dateTo ? new Date(filters.dateTo) : null;
        if (to) to.setHours(23, 59, 59, 999);

        return rows.filter(row => {
            if (filters.department !== 'All' && row.department !== filters.department) return false;
            if (filters.brand !== 'All' && row.brand !== filters.brand) return false;

            if (supportsStockCondition(activeId)) {
                const qty = Number(row.onHand ?? row.qty ?? row.balance ?? 0);
                if (filters.stockCondition === 'Positive only' && qty <= 0) return false;
                if (filters.stockCondition === 'Zero only' && qty !== 0) return false;
                if (filters.stockCondition === 'Negative only' && qty >= 0) return false;
            }

            if (filters.searchQuery) {
                const q = normalize(filters.searchQuery);
                const hit = Object.values(row).some(value => normalize(value).includes(q));
                if (!hit) return false;
            }

            const rowDate = getRowDate(row);
            if (from && rowDate && rowDate < from) return false;
            if (to && rowDate && rowDate > to) return false;
            return true;
        });
    }, [rows, filters]);

    const exportColumns = useMemo(() => columns.map(column => ({
        header: column.header,
        key: column.key,
        width: column.width || 18,
        type: column.type
    })), [columns]);

    const handleExportExcel = () => exportToExcel(filteredRows, exportColumns, payload?.title || activeReport.title);
    const handleExportPdf = () => exportToPDF(filteredRows, exportColumns, payload?.title || activeReport.title, payload?.reportId || activeId);
    const handlePrint = async () => {
        try {
            const templates = await getPrintTemplates();
            const defaultTemplate = templates.find(template => template.isDefault) || {};
            printHtml(generateReportPrintHtml(defaultTemplate, payload?.title || activeReport.title, exportColumns, filteredRows));
        } catch (error) {
            printHtml(generateReportPrintHtml({}, payload?.title || activeReport.title, exportColumns, filteredRows));
        }
    };

    const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

    const resetFilters = () => {
        setFilters({
            dateFrom: '',
            dateTo: '',
            warehouseId: 'All',
            department: 'All',
            brand: 'All',
            searchQuery: '',
            stockCondition: 'Positive only'
        });
    };

    const expandAllGroups = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, true])));
    const collapseAllGroups = () => setOpenGroups(Object.fromEntries(REPORT_GROUPS.map(group => [group.id, false])));

    const handleReportSelect = (id) => {
        captureScroll();
        setActiveId(id);
        setSidebarOpen(false);
    };

    const renderCell = (row, column) => {
        const value = row[column.key];
        if (value === null || value === undefined || value === '') return <span className="text-slate-400">-</span>;
        if (column.type === 'currency') return <CurrencyAmount value={value} />;
        if (column.type === 'number') return formatNumber(value, Number(value) % 1 === 0 ? 0 : 2);
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

    const renderMetric = (card) => {
        if (card.type === 'currency') return <CurrencyAmount value={card.value} />;
        if (card.type === 'number') return formatNumber(card.value, Number(card.value) % 1 === 0 ? 0 : 2);
        return card.value ?? '-';
    };

    const renderChart = (chart, index) => {
        const data = chart.data || [];
        if (data.length === 0) {
            return <div className="flex h-64 items-center justify-center text-sm text-slate-400">No chart data</div>;
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

        const isGrouped = chart.type === 'groupedBar' || chart.type === 'horizontalBar';
        const isHorizontal = chart.type === 'horizontalBar';
        return (
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={{ top: 12, right: 16, left: isHorizontal ? 42 : 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    {isHorizontal ? (
                        <>
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={value => formatNumber(value)} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={88} />
                        </>
                    ) : (
                        <>
                            <XAxis dataKey={data[0]?.period ? 'period' : 'name'} tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={value => formatNumber(value)} />
                        </>
                    )}
                    <Tooltip formatter={value => formatNumber(value, 2)} />
                    {isGrouped && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {isGrouped ? (
                        <>
                            <Bar dataKey="inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="outflow" fill="#f5c742" radius={[4, 4, 0, 0]} />
                        </>
                    ) : (
                        <Bar dataKey="value" fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={56} />
                    )}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const SidebarContent = () => (
        <>
            <div className="border-b border-slate-200 p-4">
                <div className="mb-1 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold text-slate-950">Inventory Reports</h2>
                        <p className="mt-1 text-[11px] text-slate-500">Choose a report, set filters, generate and export.</p>
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

            <div ref={reportListRef} className="flex-1 overflow-y-auto p-3">
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
                                                type="button"
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
                    <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg border border-slate-200 p-2 text-slate-600">
                        <FaBars />
                    </button>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-950">{activeReport.title}</div>
                        <div className="text-xs text-slate-500">Inventory Reports</div>
                    </div>
                </div>

                <div ref={reportBodyRef} className="flex-1 overflow-y-auto p-4 md:p-6">
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
                                Warehouse
                                <select value={filters.warehouseId} onChange={event => setFilter('warehouseId', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {warehousesList.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Department
                                <select value={filters.department} onChange={event => setFilter('department', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {departments.map(department => <option key={department} value={department}>{department}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Brand
                                <select value={filters.brand} onChange={event => setFilter('brand', event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400">
                                    {brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Item / SKU
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                                    <input value={filters.searchQuery} onChange={event => setFilter('searchQuery', event.target.value)} placeholder="Search item name / SKU / barcode..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-normal outline-none focus:border-yellow-400" />
                                </div>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                                Stock Condition
                                <select
                                    value={supportsStockCondition(activeId) ? filters.stockCondition : 'All'}
                                    onChange={event => setFilter('stockCondition', event.target.value)}
                                    disabled={!supportsStockCondition(activeId)}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                    {['Positive only', 'All', 'Zero only', 'Negative only'].map(option => <option key={option}>{option}</option>)}
                                </select>
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
                                    disabled={filteredRows.length === 0 || loading}
                                />
                            </div>
                        </div>
                    </div>

                    {loading && !payload ? (
                        <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                                <FaSync className="animate-spin text-yellow-500" /> Loading report data...
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
                                        <p className="mt-1 text-xs text-slate-500">{filteredRows.length} row(s)</p>
                                    </div>
                                    <ExportDropdown
                                        onExportExcel={handleExportExcel}
                                        onExportPdf={handleExportPdf}
                                        onPrint={handlePrint}
                                        disabled={filteredRows.length === 0 || loading}
                                    />
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[980px] border-collapse text-xs">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {columns.map(column => (
                                                    <th
                                                        key={column.key}
                                                        className={`border-b border-slate-200 px-3 py-2.5 text-[11px] font-bold uppercase text-slate-500 ${['currency', 'number'].includes(column.type) ? 'text-right' : 'text-left'}`}
                                                    >
                                                        {column.header}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRows.length > 0 ? filteredRows.map((row, index) => (
                                                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                                                    {columns.map(column => (
                                                        <td
                                                            key={column.key}
                                                            className={`px-3 py-2.5 text-slate-700 ${['currency', 'number'].includes(column.type) ? 'text-right tabular-nums' : ''}`}
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
                                                                The report is ready, but the selected date, warehouse, item, or stock condition does not match any rows.
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

export default InventoryReports;
