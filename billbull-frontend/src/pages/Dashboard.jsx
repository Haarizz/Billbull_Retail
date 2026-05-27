import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    LayoutGrid, Search, RefreshCw, Bell, ShoppingCart,
    FileText, Box, Users, TrendingUp, TrendingDown,
    AlertTriangle, Clock, AlertCircle, Plus, Package,
    DollarSign, BarChart3, ArrowUpRight, Briefcase,
    Wallet, CreditCard, Banknote, ArrowDownRight, Star,
    Award, Target, Activity, Calendar, MapPin, Phone,
    Mail, Truck, CheckCircle, XCircle, MinusCircle
} from "lucide-react";
import { getUsernameFromToken } from "../api/auth";
import { getDashboardData } from "../api/dashboardApi";
import CurrencyAmount from "../components/CurrencyAmount";
import { formatDisplayDate } from "../utils/dateUtils";
import { formatUserDisplayName } from "../utils/displayName";

// Currency formatter
const formatCurrency = (value, className = '') => (
    <CurrencyAmount value={value} className={className} />
);

// Format large numbers
const formatNumber = (num) => {
    const value = Number(num) || 0;
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
};

// Simple Line Chart Component
const LineChart = ({ data, height = 200, color = "#F5C742" }) => {
    if (!data || data.length === 0) return <div className="text-center text-slate-400 py-8">No data available</div>;

    const max = Math.max(...data.map(d => d.value));
    const rawMin = Math.min(...data.map(d => d.value));
    // When all values are equal (or single data point), pin min to 0 so the
    // point/line renders at a visible height instead of collapsing to the baseline.
    const min = rawMin === max ? 0 : rawMin;
    const range = max - min || 1;
    const denominator = data.length > 1 ? data.length - 1 : 1;

    const points = data.map((d, i) => {
        const x = data.length === 1 ? 50 : (i / denominator) * 100;
        const y = 100 - ((d.value - min) / range) * 100;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="relative" style={{ height }}>
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                />
                <polygon
                    points={`0,100 ${points} 100,100`}
                    fill={`url(#gradient-${color})`}
                />
            </svg>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-slate-400 px-2">
                {data.map((d, i) => (
                    <span key={i}>{d.label}</span>
                ))}
            </div>
        </div>
    );
};

// Bar Chart Component
const BarChart = ({ data, height = 160 }) => {
    if (!data || data.length === 0) return <div className="text-center text-slate-400 py-8">No data available</div>;

    const max = Math.max(...data.map(d => d.value), 0);
    // Reserve space for labels; bars fill the remaining pixel height.
    // Using pixel heights avoids the % issue where a flex-col parent has no
    // explicit height, which makes the browser resolve height:X% to zero.
    const labelH = 28;
    const barAreaH = height - labelH;

    return (
        <div style={{ height }}>
            <div className="flex items-end justify-between gap-2" style={{ height: barAreaH }}>
                {data.map((item, i) => (
                    <div key={i} className="flex-1 relative group">
                        <div
                            className="w-full bg-[#F5C742] rounded-t-md opacity-90 group-hover:opacity-100 transition-all shadow-sm"
                            style={{ height: max > 0 ? Math.max(4, (item.value / max) * barAreaH) : 8 }}
                        >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {formatCurrency(item.value)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-between gap-2 mt-1">
                {data.map((item, i) => (
                    <div key={i} className="flex-1 text-[10px] text-slate-500 font-medium text-center truncate">
                        {item.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

const EmptyListState = ({ message }) => (
    <div className="text-center py-8 text-slate-400 text-sm">{message}</div>
);

const includesSearch = (query, ...values) => {
    if (!query) return true;
    return values.some((value) => String(value ?? '').toLowerCase().includes(query));
};

// Donut Chart Component
const DonutChart = ({ data, size = 120 }) => {
    if (!data || data.length === 0) return null;

    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Return early if total is 0 to prevent NaN calculations
    if (total === 0) {
        return (
            <div className="flex items-center justify-center" style={{ width: size, height: size }}>
                <div className="text-center">
                    <div className="text-xs text-slate-400">No data</div>
                </div>
            </div>
        );
    }

    let currentAngle = -90;

    const slices = data.map((item, i) => {
        const percentage = (item.value / total) * 100;
        // SVG arc paths cannot represent a full 360° arc — start and end coords
        // become identical, so the path collapses to nothing.  Clamp to 359.9999°.
        const angle = Math.min((percentage / 100) * 360, 359.9999);
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = currentAngle + (percentage / 100) * 360; // advance by true angle

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = 50 + 40 * Math.cos(startRad);
        const y1 = 50 + 40 * Math.sin(startRad);
        const x2 = 50 + 40 * Math.cos(endRad);
        const y2 = 50 + 40 * Math.sin(endRad);

        const largeArc = angle > 180 ? 1 : 0;

        return {
            path: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`,
            color: item.color,
            percentage: percentage.toFixed(1)
        };
    });

    return (
        <svg width={size} height={size} viewBox="0 0 100 100" className="animate-[spin_20s_linear_infinite]">
            {slices.map((slice, i) => (
                <path key={i} d={slice.path} fill={slice.color} />
            ))}
            <circle cx="50" cy="50" r="25" fill="white" />
        </svg>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const hasLoadedRef = useRef(false);
    const [username, setUsername] = useState("Admin");
    const [currentTime, setCurrentTime] = useState(new Date());
    const [timeRange, setTimeRange] = useState("All Time");
    const [searchTerm, setSearchTerm] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Dashboard data state
    const [dashboardData, setDashboardData] = useState({
        sales: { totalSales: 0, totalOrders: 0, pendingQuotations: 0, totalReturns: 0, invoiceCount: 0, salesGrowth: null, prevSales: 0 },
        inventory: { totalProducts: 0, activeProducts: 0, lowStockCount: 0, outOfStockCount: 0, stockValueCost: 0, stockValueRetail: 0, pendingTransfers: 0 },
        financial: { totalExpenses: 0, receivables: 0, payables: 0, cashFlow: 0 },
        hr: { totalEmployees: 0, activeEmployees: 0 },
        purchase: { pendingLPOs: 0, totalPurchases: 0 },
        transactions: [],
        paymentBreakdown: { cash: 0, card: 0, wallet: 0, credit: 0, total: 0 },
        salesTrend: {},
        salesTrendMeta: { peakLabel: null, avgSales: 0 },
        topDepartments: [],
        topProducts: [],
        topCustomers: [],
        employeePerformance: [],
        recentActivity: []
    });

    // Convert sales trend data for chart.
    // Invoice dates are LocalDate (date-only), so we always group by day — never by hour.
    const getSalesTrendChartData = () => {
        if (!dashboardData.salesTrend || Object.keys(dashboardData.salesTrend).length === 0) {
            return [];
        }

        return Object.entries(dashboardData.salesTrend)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => ({
                // Append T00:00:00 (no zone) so the browser parses as local midnight, not UTC.
                label: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: data.sales
            }))
            .slice(0, 10);
    };

    const salesTrendData = getSalesTrendChartData();
    const departmentData = dashboardData.topDepartments || [];
    const topProducts = dashboardData.topProducts || [];
    const topCustomers = dashboardData.topCustomers || [];
    const employeePerformance = dashboardData.employeePerformance || [];
    const recentActivities = dashboardData.recentActivity || [];
    const searchQuery = searchTerm.trim().toLowerCase();

    const filteredTransactions = useMemo(
        () => (dashboardData.transactions || []).filter((txn) => includesSearch(searchQuery, txn.id, txn.customer, txn.status)),
        [dashboardData.transactions, searchQuery]
    );
    const filteredTopProducts = useMemo(
        () => topProducts.filter((product) => includesSearch(searchQuery, product.name, product.sku)),
        [topProducts, searchQuery]
    );
    const filteredTopCustomers = useMemo(
        () => topCustomers.filter((customer) => includesSearch(searchQuery, customer.name, customer.status, customer.lastOrder)),
        [topCustomers, searchQuery]
    );
    const filteredEmployeePerformance = useMemo(
        () => employeePerformance.filter((employee) => includesSearch(searchQuery, employee.name, employee.role)),
        [employeePerformance, searchQuery]
    );
    const filteredRecentActivities = useMemo(
        () => recentActivities.filter((activity) => includesSearch(searchQuery, activity.action, activity.user, activity.type)),
        [recentActivities, searchQuery]
    );
    const filteredLowStockProducts = useMemo(
        () => (dashboardData.inventory.lowStockProducts || []).filter((product) => includesSearch(searchQuery, product.name, product.sku, product.department)),
        [dashboardData.inventory.lowStockProducts, searchQuery]
    );
    const filteredOutOfStockProducts = useMemo(
        () => (dashboardData.inventory.outOfStockProducts || []).filter((product) => includesSearch(searchQuery, product.name, product.sku, product.department)),
        [dashboardData.inventory.outOfStockProducts, searchQuery]
    );

    const paymentRows = useMemo(() => {
        const total = Number(dashboardData.paymentBreakdown.total) || 0;
        return [
            { label: "Cash", value: dashboardData.paymentBreakdown.cash, color: "bg-amber-400" },
            { label: "Card", value: dashboardData.paymentBreakdown.card, color: "bg-blue-500" },
            { label: "Wallet", value: dashboardData.paymentBreakdown.wallet, color: "bg-emerald-500" },
            { label: "Credit", value: dashboardData.paymentBreakdown.credit, color: "bg-indigo-400" },
        ].map((row) => ({
            ...row,
            percent: total > 0 ? ((row.value / total) * 100).toFixed(1) : "0.0"
        }));
    }, [dashboardData.paymentBreakdown]);

    const totalProducts = Number(dashboardData.inventory.totalProducts) || 0;
    const activeProducts = Number(dashboardData.inventory.activeProducts) || 0;
    const outOfStockCount = Number(dashboardData.inventory.outOfStockCount) || 0;
    const inStockProducts = Math.max(0, totalProducts - outOfStockCount);
    const inStockPct = totalProducts > 0 ? (inStockProducts / totalProducts) * 100 : 0;
    const activePct = totalProducts > 0 ? (activeProducts / totalProducts) * 100 : 0;
    const inventoryMarginPct = dashboardData.inventory.stockValueCost > 0
        ? ((dashboardData.inventory.stockValueRetail - dashboardData.inventory.stockValueCost) / dashboardData.inventory.stockValueCost) * 100
        : 0;

    // Essential Quick Actions - Only available routes
    const quickActions = [
        { icon: ShoppingCart, label: "Sales Invoice", sub: "Create Invoice", color: "bg-amber-50 text-amber-600 border-amber-100", route: "/sales/invoice" },
        { icon: FileText, label: "Quotation", sub: "Create Quote", color: "bg-blue-50 text-blue-600 border-blue-100", route: "/sales/quotation" },
        { icon: Package, label: "GRN", sub: "Goods Receipt", color: "bg-emerald-50 text-emerald-600 border-emerald-100", route: "/purchases/grn" },
        { icon: Box, label: "Products", sub: "Inventory", color: "bg-purple-50 text-purple-600 border-purple-100", route: "/inventory/products" },
        { icon: Users, label: "Customers", sub: "Inquiries", color: "bg-indigo-50 text-indigo-600 border-indigo-100", route: "/customer/inquiries" },
        { icon: Briefcase, label: "Vendors", sub: "Suppliers", color: "bg-cyan-50 text-cyan-600 border-cyan-100", route: "/purchases/vendors" },
        { icon: BarChart3, label: "Reports", sub: "Financial", color: "bg-green-50 text-green-600 border-green-100", route: "/finance/reports" },
        { icon: DollarSign, label: "Expenses", sub: "Track Costs", color: "bg-red-50 text-red-600 border-red-100", route: "/finance/Expenses" }
    ];

    // Fetch dashboard data
    const fetchDashboardData = useCallback(async ({ showLoader = !hasLoadedRef.current, force = false } = {}) => {
        try {
            if (showLoader) {
                setLoading(true);
            }
            const data = await getDashboardData(timeRange, {
                force,
                // Paint immediately from localStorage cache, hide loader, then replace with fresh data
                onStale: (stale) => {
                    setDashboardData(stale);
                    setLoading(false);
                    hasLoadedRef.current = true;
                }
            });
            setDashboardData(data);
            hasLoadedRef.current = true;
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            if (showLoader) {
                setLoading(false);
            }
        }
    }, [timeRange]);

    // Effects
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        const user = getUsernameFromToken();
        if (user) setUsername(formatUserDisplayName(user));
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        fetchDashboardData({ showLoader: !hasLoadedRef.current });
        const interval = setInterval(() => {
            fetchDashboardData({ showLoader: false });
        }, 120000);
        return () => clearInterval(interval);
    }, [fetchDashboardData]);

    // Handlers
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchDashboardData({ showLoader: false, force: true });
        setIsRefreshing(false);
    };

    const handleTimeRangeChange = (e) => {
        setTimeRange(e.target.value);
    };

    const handleQuickAction = (route) => {
        navigate(route);
    };

    const paymentDonutData = [
        { value: dashboardData.paymentBreakdown.cash, color: '#FBBF24' },
        { value: dashboardData.paymentBreakdown.card, color: '#3B82F6' },
        { value: dashboardData.paymentBreakdown.wallet, color: '#10B981' },
        { value: dashboardData.paymentBreakdown.credit, color: '#818CF8' }
    ];

    return (
        <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900 pb-24">
            {/* HEADER */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 shadow-sm">
                <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
                    <div className="w-full xl:w-auto">
                        <div className="mb-1">
                            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><LayoutGrid className="text-[#F5C742]" size={28} /> BillBull Dashboard</h1>
                        </div>
                        <div className="text-xs text-slate-500 mb-1">Welcome back, {username}</div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDisplayDate(currentTime)}</span>
                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                            <span className="font-mono">{currentTime.toLocaleTimeString()}</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                        <div className="relative flex-1 xl:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Filter products, customers, invoices..."
                                className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 h-10 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-xs font-medium text-slate-600">Live</span>
                            </div>

                            <select
                                value={timeRange}
                                onChange={handleTimeRangeChange}
                                className="h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 outline-none hover:border-slate-300 cursor-pointer"
                            >
                                <option value="Today">Today</option>
                                <option value="Yesterday">Yesterday</option>
                                <option value="This Week">This Week</option>
                                <option value="This Month">This Month</option>
                                <option value="All Time">All Time</option>
                            </select>

                            <button
                                onClick={handleRefresh}
                                className="h-10 px-4 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 flex items-center gap-2 text-xs font-medium"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
                            </button>

                            <div className="relative cursor-pointer hover:bg-slate-50 p-2 rounded-lg border border-transparent hover:border-slate-200">
                                <Bell className="w-5 h-5 text-slate-600" />
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className={`p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
                {/* QUICK ACTIONS */}
                <div>
                    <div className="flex justify-between items-end mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">Quick Actions</h3>
                            <p className="text-xs text-slate-500">Essential shortcuts</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
                        {quickActions.map((action, i) => (
                            <button
                                key={i}
                                onClick={() => handleQuickAction(action.route)}
                                className="p-4 rounded-xl border border-slate-200 shadow-sm bg-white flex flex-col items-center gap-3 transition-all hover:-translate-y-1 hover:shadow-md group text-center"
                            >
                                <div className={`p-2 rounded-lg ${action.color} group-hover:scale-110 transition-transform`}>
                                    <action.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-slate-800">{action.label}</div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">{action.sub}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* KEY METRICS - Enhanced with more details */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-semibold text-slate-500">Total Sales {timeRange}</div>
                            <div className="bg-amber-50 p-1.5 rounded-full"><TrendingUp className="w-4 h-4 text-amber-600" /></div>
                        </div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">{formatCurrency(dashboardData.sales.totalSales)}</div>
                        <div className="flex items-center gap-2 text-xs mb-3">
                            {dashboardData.sales.salesGrowth !== null && dashboardData.sales.salesGrowth !== undefined ? (
                                <span className={`font-bold flex items-center gap-1 ${dashboardData.sales.salesGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {dashboardData.sales.salesGrowth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {dashboardData.sales.salesGrowth >= 0 ? '+' : ''}{dashboardData.sales.salesGrowth.toFixed(1)}%
                                </span>
                            ) : (
                                <span className="text-slate-400 font-medium">—</span>
                            )}
                            <span className="text-slate-400">vs last period</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                            <div>
                                <div className="text-[10px] text-slate-400">Invoices</div>
                                <div className="text-sm font-bold text-slate-700">{dashboardData.sales.invoiceCount}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400">Orders</div>
                                <div className="text-sm font-bold text-slate-700">{dashboardData.sales.totalOrders}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-semibold text-slate-500">Inventory Value</div>
                            <div className="bg-blue-50 p-1.5 rounded-full"><Box className="w-4 h-4 text-blue-600" /></div>
                        </div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">{formatNumber(dashboardData.inventory.stockValueRetail)}</div>
                        <div className="flex items-center gap-2 text-xs mb-3">
                            <span className="text-slate-600 font-medium">Cost: {formatNumber(dashboardData.inventory.stockValueCost)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                            <div>
                                <div className="text-[10px] text-red-500">Low Stock</div>
                                <div className="text-sm font-bold text-red-600">{dashboardData.inventory.lowStockCount}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-red-500">Out of Stock</div>
                                <div className="text-sm font-bold text-red-600">{dashboardData.inventory.outOfStockCount}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-semibold text-slate-500">Cash Flow</div>
                            <div className="bg-emerald-50 p-1.5 rounded-full"><DollarSign className="w-4 h-4 text-emerald-600" /></div>
                        </div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">{formatCurrency(dashboardData.financial.cashFlow)}</div>
                        <div className="flex items-center gap-2 text-xs mb-3">
                            <span className={`font-bold flex items-center gap-1 ${dashboardData.financial.cashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {dashboardData.financial.cashFlow >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {dashboardData.financial.cashFlow >= 0 ? 'Positive' : 'Negative'}
                            </span>
                            <span className="text-slate-400">flow</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                            <div>
                                <div className="text-[10px] text-slate-400">Receivables</div>
                                <div className="text-sm font-bold text-emerald-600">{formatNumber(dashboardData.financial.receivables)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400">Payables</div>
                                <div className="text-sm font-bold text-red-600">{formatNumber(dashboardData.financial.payables)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-semibold text-slate-500">Pending Items</div>
                            <div className="bg-orange-50 p-1.5 rounded-full"><AlertTriangle className="w-4 h-4 text-orange-600" /></div>
                        </div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">{dashboardData.sales.pendingQuotations + dashboardData.purchase.pendingLPOs}</div>
                        <div className="flex items-center gap-2 text-xs mb-3">
                            <span className="text-orange-600 font-bold">Requires attention</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                            <div>
                                <div className="text-[10px] text-slate-400">Quotations</div>
                                <div className="text-sm font-bold text-orange-600">{dashboardData.sales.pendingQuotations}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400">LPOs</div>
                                <div className="text-sm font-bold text-orange-600">{dashboardData.purchase.pendingLPOs}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CHARTS ROW 1 - Sales Trend & Payment Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Sales Trend Chart */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-bold text-slate-800">Sales Trend</h3>
                                <p className="text-xs text-slate-500">Daily performance for {timeRange.toLowerCase()}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">All branches</span>
                            </div>
                        </div>
                        <LineChart data={salesTrendData} height={220} color="#F5C742" />
                        <div className="flex justify-between mt-4 text-[10px]">
                            <span className="text-slate-400">
                                {dashboardData.salesTrendMeta?.peakLabel ? `Peak: ${dashboardData.salesTrendMeta.peakLabel}` : 'Peak: —'}
                            </span>
                            <span className="text-emerald-600 font-bold">
                                {dashboardData.salesTrendMeta?.avgSales > 0 ? (
                                    <>Avg: <CurrencyAmount value={dashboardData.salesTrendMeta.avgSales} />/day</>
                                ) : ''}
                            </span>
                        </div>
                    </div>

                    {/* Payment Breakdown */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-6">
                            <h3 className="font-bold text-slate-800">Payment Methods</h3>
                            <p className="text-xs text-slate-500">Distribution for {timeRange.toLowerCase()}</p>
                        </div>
                        <div className="flex flex-col items-center justify-center mb-4">
                            <DonutChart data={paymentDonutData} size={140} />
                            <div className="text-center mt-4">
                                <div className="text-xs text-slate-400">Total</div>
                                <div className="text-lg font-bold text-slate-800">{formatCurrency(dashboardData.paymentBreakdown.total)}</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {paymentRows.map((pm, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2 flex-1">
                                        <div className={`w-2 h-2 rounded-full ${pm.color}`}></div>
                                        <span className="text-slate-600 font-medium">{pm.label}</span>
                                        <span className="text-slate-400">({pm.percent}%)</span>
                                    </div>
                                    <div className="font-bold text-slate-800">{formatCurrency(pm.value)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* CHARTS ROW 2 - Department Performance & Top Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Department Performance */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-6">
                            <h3 className="font-bold text-slate-800">Top Departments</h3>
                            <p className="text-xs text-slate-500">Sales by category</p>
                        </div>
                        <BarChart data={departmentData} height={180} />
                    </div>

                    {/* Top Products */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-4">
                            <h3 className="font-bold text-slate-800">Top Selling Products</h3>
                            <p className="text-xs text-slate-500">Best performers {timeRange.toLowerCase()}</p>
                        </div>
                        <div className="space-y-3">
                            {filteredTopProducts.length === 0 ? (
                                <EmptyListState message={searchQuery ? "No products match this filter" : "No product sales yet"} />
                            ) : filteredTopProducts.map((product, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors">
                                    <div className="flex-shrink-0 w-8 h-8 bg-[#F5C742] rounded-lg flex items-center justify-center font-bold text-slate-900 text-sm">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-800 truncate">{product.name}</div>
                                        <div className="text-[10px] text-slate-500">{product.sku} - Stock: {product.stock}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-slate-800">{formatCurrency(product.revenue)}</div>
                                        <div className="flex items-center gap-1 text-[10px]">
                                            <span className="text-slate-500">{product.sold} sold</span>
                                            {product.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                            {product.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ROW 3 - Top Customers & Employee Performance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Customers */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-4">
                            <h3 className="font-bold text-slate-800">Top Customers</h3>
                            <p className="text-xs text-slate-500">Highest spenders {timeRange.toLowerCase()}</p>
                        </div>
                        <div className="space-y-3">
                            {filteredTopCustomers.length === 0 ? (
                                <EmptyListState message={searchQuery ? "No customers match this filter" : "No customer data yet"} />
                            ) : filteredTopCustomers.map((customer, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                                        {(customer.name || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-800 truncate">{customer.name}</div>
                                        <div className="text-[10px] text-slate-500">{customer.purchases} purchases - {customer.lastOrder}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-slate-800">{formatCurrency(customer.totalSpent)}</div>
                                        <div className={`text-[10px] px-2 py-0.5 rounded-full ${customer.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                            {customer.status}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Employee Performance */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-4">
                            <h3 className="font-bold text-slate-800">Employee Performance</h3>
                            <p className="text-xs text-slate-500">Sales team rankings</p>
                        </div>
                        <div className="space-y-3">
                            {filteredEmployeePerformance.length === 0 ? (
                                <EmptyListState message={searchQuery ? "No team members match this filter" : "No sales team activity yet"} />
                            ) : filteredEmployeePerformance.map((emp, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="flex-shrink-0">
                                        <Award className={`w-6 h-6 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-600' : 'text-slate-300'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-800">{emp.name}</div>
                                        <div className="text-[10px] text-slate-500">{emp.role}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-slate-800">{formatCurrency(emp.revenue)}</div>
                                        <div className="flex items-center gap-1 text-[10px]">
                                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                            <span className="text-slate-600">{emp.rating}</span>
                                            <span className="text-slate-400">- {emp.sales} sales</span>
                                        </div>
                                        <div className="w-full bg-slate-200 h-1 rounded-full mt-1 overflow-hidden">
                                            <div className="bg-emerald-500 h-full" style={{ width: `${emp.target > 0 ? Math.min(100, (emp.revenue / emp.target) * 100) : 0}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ROW 4 - Recent Transactions & Activity Feed */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Recent Transactions */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-slate-800">Recent Transactions</h3>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500">Live transaction feed</p>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {loading ? (
                                <div className="text-center py-8 text-slate-400 text-sm">Loading transactions...</div>
                            ) : filteredTransactions.length === 0 ? (
                                <EmptyListState message={searchQuery ? "No transactions match this filter" : "No transactions yet"} />
                            ) : (
                                filteredTransactions.map((txn, i) => (
                                    <div key={i} className="flex justify-between items-start pb-3 border-b border-slate-100 last:border-0">
                                        <div>
                                            <div className="text-xs font-bold text-slate-800">{txn.id}</div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">{txn.customer}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 mb-0.5">{txn.time}</div>
                                            <div className="text-xs font-bold text-slate-800">{formatCurrency(txn.amount)}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Activity Feed */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-4">
                            <h3 className="font-bold text-slate-800">Recent Activity</h3>
                            <p className="text-xs text-slate-500">System events</p>
                        </div>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {filteredRecentActivities.length === 0 ? (
                                <EmptyListState message={searchQuery ? "No activity matches this filter" : "No recent activity yet"} />
                            ) : filteredRecentActivities.map((activity, i) => (
                                <div key={i} className="flex gap-3">
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${activity.status === 'success' ? 'bg-emerald-100' :
                                        activity.status === 'warning' ? 'bg-amber-100' :
                                            activity.status === 'info' ? 'bg-blue-100' : 'bg-slate-100'
                                        }`}>
                                        {activity.status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                                        {activity.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                                        {activity.status === 'info' && <Activity className="w-4 h-4 text-blue-600" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] text-slate-800 font-medium">{activity.action}</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">{activity.user} - {activity.time}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* FINANCIAL & INVENTORY SUMMARY */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Financial Summary */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-6">
                            <h3 className="font-bold text-slate-800">Financial Summary</h3>
                            <p className="text-xs text-slate-500">Key financial metrics</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Wallet className="w-4 h-4 text-emerald-600" />
                                    <div className="text-[10px] text-emerald-700 font-semibold">Receivables</div>
                                </div>
                                <div className="text-lg font-bold text-emerald-900">{formatCurrency(dashboardData.financial.receivables)}</div>
                                <div className="text-[10px] text-emerald-600 mt-1">Outstanding</div>
                            </div>
                            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <CreditCard className="w-4 h-4 text-red-600" />
                                    <div className="text-[10px] text-red-700 font-semibold">Payables</div>
                                </div>
                                <div className="text-lg font-bold text-red-900">{formatCurrency(dashboardData.financial.payables)}</div>
                                <div className="text-[10px] text-red-600 mt-1">Due to vendors</div>
                            </div>
                            <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Banknote className="w-4 h-4 text-orange-600" />
                                    <div className="text-[10px] text-orange-700 font-semibold">Expenses</div>
                                </div>
                                <div className="text-lg font-bold text-orange-900">{formatCurrency(dashboardData.financial.totalExpenses)}</div>
                                <div className="text-[10px] text-orange-600 mt-1">{timeRange}</div>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Package className="w-4 h-4 text-blue-600" />
                                    <div className="text-[10px] text-blue-700 font-semibold">Purchases</div>
                                </div>
                                <div className="text-lg font-bold text-blue-900">{formatCurrency(dashboardData.purchase.totalPurchases)}</div>
                                <div className="text-[10px] text-blue-600 mt-1">{timeRange}</div>
                            </div>
                        </div>
                    </div>

                    {/* Inventory Summary */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-6">
                            <h3 className="font-bold text-slate-800">Inventory Overview</h3>
                            <p className="text-xs text-slate-500">Stock status and valuation</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-[10px] text-slate-500 font-semibold mb-1">Total SKUs</div>
                                <div className="text-lg font-bold text-slate-800">{totalProducts}</div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                                    <div className="bg-emerald-500 h-full" style={{ width: `${inStockPct}%` }}></div>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">{inStockProducts} in stock</div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-[10px] text-slate-500 font-semibold mb-1">Active SKUs</div>
                                <div className="text-lg font-bold text-slate-800">{activeProducts}</div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                                    <div className="bg-blue-500 h-full" style={{ width: `${activePct}%` }}></div>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">{activePct.toFixed(1)}% active</div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-[10px] text-slate-500 font-semibold mb-1">Value (Cost)</div>
                                <div className="text-lg font-bold text-slate-800">{formatNumber(dashboardData.inventory.stockValueCost)}</div>
                                <div className="text-[10px] text-slate-500 mt-1">Purchase price</div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-[10px] text-slate-500 font-semibold mb-1">Value (Retail)</div>
                                <div className="text-lg font-bold text-slate-800">{formatNumber(dashboardData.inventory.stockValueRetail)}</div>
                                <div className={`text-[10px] mt-1 ${inventoryMarginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {inventoryMarginPct >= 0 ? '+' : ''}{inventoryMarginPct.toFixed(1)}% margin
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ALERTS */}
                {(dashboardData.inventory.lowStockCount > 0 || dashboardData.inventory.outOfStockCount > 0) && (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="font-bold text-slate-800">Alerts</h3>
                            <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full font-bold animate-pulse">
                                {dashboardData.inventory.lowStockCount + dashboardData.inventory.outOfStockCount}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {dashboardData.inventory.outOfStockCount > 0 && (
                                <div className="bg-red-50 rounded-lg border border-red-100 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                        <div className="font-bold text-slate-800 text-xs">Out of Stock Alert</div>
                                        <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                            {dashboardData.inventory.outOfStockCount}
                                        </span>
                                    </div>
                                    <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                                        {filteredOutOfStockProducts.length > 0 ? (
                                            filteredOutOfStockProducts.map((product, i) => (
                                                <div key={i} className="flex items-center justify-between p-2 bg-white rounded border border-red-100">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[11px] font-bold text-slate-800 truncate">
                                                            {product.name || 'Unknown Product'}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">
                                                            SKU: {product.sku || 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div className="flex-shrink-0 ml-2">
                                                        <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">
                                                            0 units
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-[11px] text-slate-600">
                                                {searchQuery ? 'No out-of-stock products match this filter.' : `${dashboardData.inventory.outOfStockCount} products are out of stock.`}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => navigate('/inventory/products')}
                                        className="text-[10px] font-bold text-red-600 flex items-center gap-1 hover:underline"
                                    >
                                        View All Products <ArrowUpRight className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                            )}
                            {dashboardData.inventory.lowStockCount > 0 && (
                                <div className="bg-amber-50 rounded-lg border border-amber-100 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        <div className="font-bold text-slate-800 text-xs">Low Stock Warning</div>
                                        <span className="ml-auto bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                            {dashboardData.inventory.lowStockCount}
                                        </span>
                                    </div>
                                    <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                                        {filteredLowStockProducts.length > 0 ? (
                                            filteredLowStockProducts.map((product, i) => (
                                                <div key={i} className="flex items-center justify-between p-2 bg-white rounded border border-amber-100">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[11px] font-bold text-slate-800 truncate">
                                                            {product.name || 'Unknown Product'}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">
                                                            SKU: {product.sku || 'N/A'} - Reorder: {product.reorderLevel || 0}
                                                        </div>
                                                    </div>
                                                    <div className="flex-shrink-0 ml-2">
                                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                                                            {product.currentStock || 0} units
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-[11px] text-slate-600">
                                                {searchQuery ? 'No low-stock products match this filter.' : `${dashboardData.inventory.lowStockCount} products are running low on stock.`}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => navigate('/inventory/products')}
                                        className="text-[10px] font-bold text-amber-600 flex items-center gap-1 hover:underline"
                                    >
                                        View All Products <ArrowUpRight className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;







