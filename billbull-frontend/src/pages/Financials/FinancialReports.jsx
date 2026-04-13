import React, { useState, useEffect } from 'react';
import {
    FileText,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Calendar,
    Download,
    FileSpreadsheet,
    PieChart,
    BarChart3,
    Activity,
    Wallet,
    Target,
    AlertCircle,
    CheckCircle,
    Clock,
    Scale
} from 'lucide-react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart as RechartsPie,
    Pie,
    Cell,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

import * as reportsApi from '../../api/financialReportsApi';
import * as backendApi from '../../api/financialReportsBackendApi';
import toast from 'react-hot-toast';

const FinancialReports = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('thisMonth');

    // Data states
    const [financialData, setFinancialData] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [monthlyTrends, setMonthlyTrends] = useState([]);
    const [expensesByCategory, setExpensesByCategory] = useState([]);
    const [expensesByCostCenter, setExpensesByCostCenter] = useState([]);
    const [accountDistribution, setAccountDistribution] = useState([]);

    // Server-side report states
    const [trialBalance, setTrialBalance] = useState(null);
    const [profitLoss, setProfitLoss] = useState(null);
    const [balanceSheet, setBalanceSheet] = useState(null);
    const [cashFlow, setCashFlow] = useState(null);
    const [expenseAnalysis, setExpenseAnalysis] = useState(null);
    const [taxDashboard, setTaxDashboard] = useState(null);

    // Chart colors matching the design system
    const COLORS = ['#3B82F6', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

    // Compute date range from selector
    const getDateRange = () => {
        const now = new Date();
        let start, end;
        switch (dateRange) {
            case 'lastMonth':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            case 'thisQuarter':
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                end = now;
                break;
            case 'thisYear':
                start = new Date(now.getFullYear(), 0, 1);
                end = now;
                break;
            case 'thisMonth':
            default:
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = now;
                break;
        }
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        };
    };

    // Fetch data
    const fetchData = async () => {
        setLoading(true);
        const { startDate, endDate } = getDateRange();
        try {
            // Fetch client-side data (for overview charts)
            const data = await reportsApi.getFinancialReportsData();
            setFinancialData(data);

            const calculatedMetrics = reportsApi.calculateFinancialMetrics(data);
            setMetrics(calculatedMetrics);

            const trends = reportsApi.getMonthlyTrends(data.transactions, data.expenses, 6);
            setMonthlyTrends(trends);

            const byCategory = reportsApi.groupExpensesByCategory(data.expenses);
            setExpensesByCategory(byCategory);

            const byCostCenter = reportsApi.groupExpensesByCostCenter(data.expenses);
            setExpensesByCostCenter(byCostCenter);

            const distribution = reportsApi.getAccountBalanceDistribution(data.accounts);
            setAccountDistribution(distribution);

            // Fetch server-side reports (with fallback)
            try {
                const [tb, pl, bs, cf, ea, td] = await Promise.all([
                    backendApi.getTrialBalance(startDate, endDate),
                    backendApi.getProfitLoss(startDate, endDate),
                    backendApi.getBalanceSheet(endDate),
                    backendApi.getCashFlow(startDate, endDate),
                    backendApi.getExpenseAnalysis(startDate, endDate),
                    backendApi.getTaxDashboard(startDate, endDate)
                ]);
                setTrialBalance(tb);
                setProfitLoss(pl);
                setBalanceSheet(bs);
                setCashFlow(cf);
                setExpenseAnalysis(ea);
                setTaxDashboard(td);
            } catch (backendErr) {
                console.warn('Backend reports unavailable, using client-side:', backendErr);
            }

        } catch (error) {
            console.error('Error fetching financial reports:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateRange]);

    const formatCurrency = (amount) => {
        return `AED ${parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        let rows = [];

        if (activeTab === 'trialBalance' && trialBalance) {
            rows.push(["Account Code", "Account Name", "Group", "Debit", "Credit"]);
            trialBalance.lines?.forEach(line => {
                rows.push([line.accountCode, `"${line.accountName}"`, `"${line.accountGroup || ''}"`, line.debitBalance, line.creditBalance]);
            });
            rows.push(["TOTAL", "", "", trialBalance.totalDebit, trialBalance.totalCredit]);
        } else {
            toast.error(`CSV Export not fully configured for ${activeTab}.`);
            return;
        }

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${activeTab}_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Export successful");
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500 font-medium animate-pulse">Loading Financial Reports...</div>
            </div>
        );
    }

    // Summary Cards Component — Uses server-side P&L when available
    const SummaryCards = () => {
        const revenue = profitLoss?.totalRevenue || metrics?.totalRevenue || 0;
        const expenses = profitLoss?.totalExpenses || metrics?.totalExpenses || 0;
        const netProfitVal = profitLoss?.netProfit || metrics?.netProfit || 0;
        const cashBal = metrics?.cashBalance || 0;

        return (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Total Revenue</p>
                        <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(revenue)}</h3>
                        <p className="text-[10px] text-emerald-600 mt-1">↑ Income Accounts</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                        <TrendingUp size={20} />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Total Expenses</p>
                        <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(expenses)}</h3>
                        <p className="text-[10px] text-red-600 mt-1">↓ All Expenses</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg text-red-600">
                        <TrendingDown size={20} />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Net Profit</p>
                        <h3 className={`text-2xl font-bold ${parseFloat(netProfitVal) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(netProfitVal)}
                        </h3>
                        <p className={`text-[10px] mt-1 ${parseFloat(netProfitVal) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {parseFloat(netProfitVal) >= 0 ? '↑ Profitable' : '↓ Loss'}
                        </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                        <DollarSign size={20} />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Cash Balance</p>
                        <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(cashBal)}</h3>
                        <p className="text-[10px] text-slate-400 mt-1">Available Cash</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                        <Wallet size={20} />
                    </div>
                </div>
            </div>
        );
    };

    // Trial Balance Tab (server-side)
    const TrialBalanceTab = () => {
        if (!trialBalance) {
            return (
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm text-center text-slate-500 text-sm">
                    Trial Balance data unavailable. Ensure the backend is running and posting rules are configured.
                </div>
            );
        }

        return (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Scale size={20} className="text-blue-600" />
                            Trial Balance
                        </h3>
                        <span className="text-xs text-slate-400">As of {trialBalance.asOfDate}</span>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Code</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Debit (AED)</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Credit (AED)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {trialBalance.lines?.map((line, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2 text-xs text-slate-600 font-mono">{line.accountCode}</td>
                                        <td className="px-4 py-2 text-xs text-slate-700 font-semibold">{line.accountName}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500">{line.accountGroup || '-'}</td>
                                        <td className="px-4 py-2 text-right text-xs text-blue-600 font-medium">
                                            {parseFloat(line.debitBalance) > 0 ? formatCurrency(line.debitBalance) : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-right text-xs text-red-600 font-medium">
                                            {parseFloat(line.creditBalance) > 0 ? formatCurrency(line.creditBalance) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr className="font-bold">
                                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-800">TOTAL</td>
                                    <td className="px-4 py-3 text-right text-xs text-blue-700">{formatCurrency(trialBalance.totalDebit)}</td>
                                    <td className="px-4 py-3 text-right text-xs text-red-700">{formatCurrency(trialBalance.totalCredit)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Balance check */}
                    <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-xs font-bold ${trialBalance.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {trialBalance.balanced ? (
                            <><CheckCircle size={16} /> Trial Balance is balanced — Total Debit = Total Credit</>
                        ) : (
                            <><AlertCircle size={16} /> Trial Balance has a discrepancy — Debit ≠ Credit</>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Overview Tab
    const OverviewTab = () => (
        <div className="space-y-6">
            <SummaryCards />

            {/* Revenue vs Expenses Trend */}
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <Activity size={16} className="text-blue-600" />
                    Revenue vs Expenses (Last 6 Months)
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                        <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                            formatter={(value) => formatCurrency(value)}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} name="Revenue" />
                        <Line type="monotone" dataKey="expenses" stroke="#F43F5E" strokeWidth={2} name="Expenses" />
                        <Line type="monotone" dataKey="profit" stroke="#3B82F6" strokeWidth={2} name="Profit" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expenses by Category */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <PieChart size={16} className="text-purple-600" />
                        Expenses by Category
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <RechartsPie>
                            <Pie
                                data={expensesByCategory.slice(0, 8)}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="total"
                            >
                                {expensesByCategory.slice(0, 8).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                        </RechartsPie>
                    </ResponsiveContainer>
                </div>

                {/* Account Balance Distribution */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <BarChart3 size={16} className="text-orange-600" />
                        Account Balance Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={accountDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#64748b" />
                            <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                formatter={(value) => formatCurrency(value)}
                            />
                            <Bar dataKey="value" fill="#3B82F6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );

    // Profit & Loss Tab
    const ProfitLossTab = () => {
        const incomeAccounts = financialData?.accounts.filter(acc => acc.accountGroup === 'Income' && acc.status !== 'archived') || [];
        const expenseAccounts = financialData?.accounts.filter(acc => acc.accountGroup === 'Expenses' && acc.status !== 'archived') || [];

        const totalIncome = incomeAccounts.reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);
        const totalExpense = expenseAccounts.reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);
        const netProfitLoss = totalIncome - totalExpense;

        return (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Profit & Loss Statement</h3>

                    {/* Income Section */}
                    <div className="mb-6">
                        <div className="bg-emerald-50 px-4 py-2 rounded-t-lg border-b-2 border-emerald-400">
                            <h4 className="text-sm font-bold text-emerald-700">INCOME</h4>
                        </div>
                        <div className="border border-slate-200 rounded-b-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {incomeAccounts.map(acc => (
                                        <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2 text-xs text-slate-700">{acc.name}</td>
                                            <td className="px-4 py-2 text-right text-xs text-emerald-600 font-medium">
                                                {formatCurrency(acc.balanceAmount)}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-emerald-50 font-bold">
                                        <td className="px-4 py-3 text-xs text-slate-800">Total Income</td>
                                        <td className="px-4 py-3 text-right text-xs text-emerald-700">{formatCurrency(totalIncome)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Expenses Section */}
                    <div className="mb-6">
                        <div className="bg-red-50 px-4 py-2 rounded-t-lg border-b-2 border-red-400">
                            <h4 className="text-sm font-bold text-red-700">EXPENSES</h4>
                        </div>
                        <div className="border border-slate-200 rounded-b-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {expenseAccounts.map(acc => (
                                        <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2 text-xs text-slate-700">{acc.name}</td>
                                            <td className="px-4 py-2 text-right text-xs text-red-600 font-medium">
                                                {formatCurrency(acc.balanceAmount)}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-red-50 font-bold">
                                        <td className="px-4 py-3 text-xs text-slate-800">Total Expenses</td>
                                        <td className="px-4 py-3 text-right text-xs text-red-700">{formatCurrency(totalExpense)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Net Profit/Loss */}
                    <div
                        className="p-5 rounded-xl relative overflow-hidden"
                        style={{
                            background: netProfitLoss >= 0
                                ? 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(52,211,153,0.10) 100%)'
                                : 'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(252,165,165,0.10) 100%)',
                            border: netProfitLoss >= 0
                                ? '1.5px solid rgba(52,211,153,0.45)'
                                : '1.5px solid rgba(239,68,68,0.35)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: netProfitLoss >= 0
                                ? '0 4px 24px rgba(16,185,129,0.15), inset 0 1px 0 rgba(255,255,255,0.4)'
                                : '0 4px 24px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.3)',
                        }}
                    >
                        {/* Glow blob */}
                        <div
                            className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-30 blur-2xl pointer-events-none"
                            style={{ background: netProfitLoss >= 0 ? '#34d399' : '#f87171' }}
                        />
                        <div className="relative flex justify-between items-center">
                            <div>
                                <p className={`text-[10px] font-bold tracking-widest uppercase mb-0.5 ${netProfitLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {netProfitLoss >= 0 ? 'Net Profit' : 'Net Loss'}
                                </p>
                                <span className={`text-2xl font-black tracking-tight ${netProfitLoss >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {formatCurrency(Math.abs(netProfitLoss))}
                                </span>
                            </div>
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black"
                                style={{
                                    background: netProfitLoss >= 0
                                        ? 'rgba(52,211,153,0.25)'
                                        : 'rgba(239,68,68,0.20)',
                                    border: netProfitLoss >= 0
                                        ? '1px solid rgba(52,211,153,0.4)'
                                        : '1px solid rgba(239,68,68,0.35)',
                                    color: netProfitLoss >= 0 ? '#059669' : '#dc2626',
                                }}
                            >
                                {netProfitLoss >= 0 ? '↑' : '↓'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* P&L Trend Chart */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Profit & Loss Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={monthlyTrends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                            <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                formatter={(value) => formatCurrency(value)}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Area type="monotone" dataKey="profit" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} name="Net Profit" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    };

    // Balance Sheet Tab
    const BalanceSheetTab = () => {
        const assets = financialData?.accounts.filter(acc => acc.accountGroup === 'Assets' && acc.status !== 'archived') || [];
        const liabilities = financialData?.accounts.filter(acc => acc.accountGroup === 'Liabilities' && acc.status !== 'archived') || [];
        const equity = financialData?.accounts.filter(acc => acc.accountGroup === 'Equity' && acc.status !== 'archived') || [];

        const totalAssets = assets.reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);
        const totalLiabilities = liabilities.reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);
        const totalEquity = equity.reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);

        return (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Balance Sheet</h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Assets */}
                        <div>
                            <div className="bg-blue-50 px-4 py-2 rounded-t-lg border-b-2 border-blue-400">
                                <h4 className="text-sm font-bold text-blue-700">ASSETS</h4>
                            </div>
                            <div className="border border-slate-200 rounded-b-lg overflow-hidden">
                                <table className="w-full">
                                    <tbody className="divide-y divide-slate-100">
                                        {assets.map(acc => (
                                            <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 text-xs text-slate-700">{acc.name}</td>
                                                <td className="px-4 py-2 text-right text-xs text-blue-600 font-medium">
                                                    {formatCurrency(acc.balanceAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-blue-50 font-bold">
                                            <td className="px-4 py-3 text-xs text-slate-800">Total Assets</td>
                                            <td className="px-4 py-3 text-right text-xs text-blue-700">{formatCurrency(totalAssets)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Liabilities & Equity */}
                        <div>
                            {/* Liabilities */}
                            <div className="bg-red-50 px-4 py-2 rounded-t-lg border-b-2 border-red-400">
                                <h4 className="text-sm font-bold text-red-700">LIABILITIES</h4>
                            </div>
                            <div className="border border-slate-200 border-b-0 overflow-hidden">
                                <table className="w-full">
                                    <tbody className="divide-y divide-slate-100">
                                        {liabilities.map(acc => (
                                            <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 text-xs text-slate-700">{acc.name}</td>
                                                <td className="px-4 py-2 text-right text-xs text-red-600 font-medium">
                                                    {formatCurrency(acc.balanceAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-red-50 font-bold">
                                            <td className="px-4 py-3 text-xs text-slate-800">Total Liabilities</td>
                                            <td className="px-4 py-3 text-right text-xs text-red-700">{formatCurrency(totalLiabilities)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Equity */}
                            <div className="bg-purple-50 px-4 py-2 border-b-2 border-purple-400 border-t-2 border-t-slate-200">
                                <h4 className="text-sm font-bold text-purple-700">EQUITY</h4>
                            </div>
                            <div className="border border-slate-200 rounded-b-lg overflow-hidden">
                                <table className="w-full">
                                    <tbody className="divide-y divide-slate-100">
                                        {equity.map(acc => (
                                            <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 text-xs text-slate-700">{acc.name}</td>
                                                <td className="px-4 py-2 text-right text-xs text-purple-600 font-medium">
                                                    {formatCurrency(acc.balanceAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-purple-50 font-bold">
                                            <td className="px-4 py-3 text-xs text-slate-800">Total Equity</td>
                                            <td className="px-4 py-3 text-right text-xs text-purple-700">{formatCurrency(totalEquity)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Balance Check */}
                    <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-700">Total Liabilities + Equity:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(totalLiabilities + totalEquity)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-2">
                            <span className="font-bold text-slate-700">Total Assets:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(totalAssets)}</span>
                        </div>
                        <div className={`mt-3 pt-3 border-t-2 flex items-center gap-2 text-xs ${Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? (
                                <><CheckCircle size={16} /> <span className="font-bold">Balance Sheet is Balanced</span></>
                            ) : (
                                <><AlertCircle size={16} /> <span className="font-bold">Balance Sheet has discrepancy</span></>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Cash Flow Tab
    const CashFlowTab = () => {
        const cashTransactions = financialData?.transactions.filter(txn =>
            txn.accountName?.toLowerCase().includes('cash') ||
            txn.accountName?.toLowerCase().includes('bank')
        ) || [];

        const cashInflows = cashTransactions
            .filter(txn => txn.creditAmount > 0)
            .reduce((sum, txn) => sum + parseFloat(txn.creditAmount || 0), 0);

        const cashOutflows = cashTransactions
            .filter(txn => txn.debitAmount > 0)
            .reduce((sum, txn) => sum + parseFloat(txn.debitAmount || 0), 0);

        const netCashFlow = cashInflows - cashOutflows;

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Cash Inflows</p>
                            <h3 className="text-2xl font-bold text-emerald-600">{formatCurrency(cashInflows)}</h3>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Cash Outflows</p>
                            <h3 className="text-2xl font-bold text-red-600">{formatCurrency(cashOutflows)}</h3>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg text-red-600">
                            <TrendingDown size={20} />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Net Cash Flow</p>
                            <h3 className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(netCashFlow)}
                            </h3>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                            <DollarSign size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Cash Flow Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={monthlyTrends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                            <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                formatter={(value) => formatCurrency(value)}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Area type="monotone" dataKey="revenue" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} name="Inflows" />
                            <Area type="monotone" dataKey="expenses" stackId="2" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.6} name="Outflows" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Recent Cash Transactions</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Voucher</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inflow</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Outflow</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {cashTransactions.slice(0, 10).map((txn, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{txn.transactionDate}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">{txn.voucherNo}</td>
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{txn.accountName}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{txn.description}</td>
                                        <td className="px-4 py-3 text-right text-xs text-emerald-600 font-medium">
                                            {txn.creditAmount > 0 ? formatCurrency(txn.creditAmount) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-red-600 font-medium">
                                            {txn.debitAmount > 0 ? formatCurrency(txn.debitAmount) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // Expense Analysis Tab
    const ExpenseAnalysisTab = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expenses by Category */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <PieChart size={16} className="text-purple-600" />
                        Expenses by Category
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <RechartsPie>
                            <Pie
                                data={expensesByCategory.slice(0, 8)}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="total"
                            >
                                {expensesByCategory.slice(0, 8).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                        </RechartsPie>
                    </ResponsiveContainer>

                    <div className="mt-4 space-y-2">
                        {expensesByCategory.slice(0, 5).map((cat, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    <span className="text-slate-700 font-medium">{cat.category}</span>
                                </div>
                                <span className="text-slate-600 font-bold">{formatCurrency(cat.total)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Expenses by Cost Center */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Target size={16} className="text-orange-600" />
                        Expenses by Cost Center
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={expensesByCostCenter.slice(0, 10)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="costCenter" tick={{ fontSize: 10 }} stroke="#64748b" angle={-45} textAnchor="end" height={80} />
                            <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                formatter={(value) => formatCurrency(value)}
                            />
                            <Bar dataKey="total" fill="#F59E0B" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Expenses Table */}
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Top Expenses</h3>
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full">
                        <thead className="bg-[#F7F7FA] border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost Center</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {financialData?.expenses
                                .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
                                .slice(0, 15)
                                .map((exp, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{exp.date || exp.createdAt?.split('T')[0]}</td>
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{exp.vendor || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold">
                                                {exp.category || 'Uncategorized'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{exp.costCenter || 'Unassigned'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{exp.description || '-'}</td>
                                        <td className="px-4 py-3 text-right text-xs text-red-600 font-bold">{formatCurrency(exp.amount)}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    // Tax Dashboard Tab
    const TaxDashboardTab = () => {
        const taxFilings = financialData?.taxFilings || [];
        const taxConfigs = financialData?.taxConfigs || [];

        const pendingFilings = taxFilings.filter(f => f.status === 'PENDING' || f.status === 'DRAFT');
        const completedFilings = taxFilings.filter(f => f.status === 'FILED');

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Tax Configurations</p>
                            <h3 className="text-2xl font-bold text-slate-800">{taxConfigs.length}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">Active tax types</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                            <FileText size={20} />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Pending Filings</p>
                            <h3 className="text-2xl font-bold text-yellow-600">{pendingFilings.length}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">Awaiting submission</p>
                        </div>
                        <div className="p-3 bg-yellow-50 rounded-lg text-yellow-600">
                            <Clock size={20} />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Completed Filings</p>
                            <h3 className="text-2xl font-bold text-emerald-600">{completedFilings.length}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">Successfully filed</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                            <CheckCircle size={20} />
                        </div>
                    </div>
                </div>

                {/* Tax Configurations */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Tax Configurations</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax Type</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filing Frequency</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {taxConfigs.map((config, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{config.type}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{config.rate}%</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{config.frequency}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold">
                                                Active
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Tax Filings */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Tax Filings</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Period</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax Type</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Due Date</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {taxFilings.map((filing, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{filing.period}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{filing.type}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{filing.dueDate}</td>
                                        <td className="px-4 py-3 text-right text-xs text-slate-800 font-bold">
                                            {formatCurrency(filing.amount || 0)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${filing.status === 'FILED'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : filing.status === 'PENDING'
                                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                                }`}>
                                                {filing.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };


    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-[#F5C742]" size={28} />
                        Financial Reports
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Comprehensive financial analysis and reporting dashboard</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
                        <FileSpreadsheet size={16} className="text-emerald-600" /> Export CSV
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
                        <Download size={16} className="text-blue-600" /> Print PDF
                    </button>
                </div>
            </div>

            {/* DATE RANGE SELECTOR */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600">Period:</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'].map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${dateRange === range
                                    ? 'bg-[#F5C742] text-slate-900'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {range === 'thisMonth' && 'This Month'}
                                {range === 'lastMonth' && 'Last Month'}
                                {range === 'thisQuarter' && 'This Quarter'}
                                {range === 'thisYear' && 'This Year'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* TABS */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-1 mb-6 flex gap-1 overflow-x-auto">
                {[
                    { id: 'overview', label: 'Overview', icon: Activity },
                    { id: 'trialBalance', label: 'Trial Balance', icon: Scale },
                    { id: 'profitLoss', label: 'P&L', icon: TrendingUp },
                    { id: 'balanceSheet', label: 'Balance Sheet', icon: Wallet },
                    { id: 'cashFlow', label: 'Cash Flow', icon: DollarSign },
                    { id: 'expenses', label: 'Expense Analysis', icon: PieChart },
                    { id: 'tax', label: 'Tax Dashboard', icon: FileText },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT */}
            <div>
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'trialBalance' && <TrialBalanceTab />}
                {activeTab === 'profitLoss' && <ProfitLossTab />}
                {activeTab === 'balanceSheet' && <BalanceSheetTab />}
                {activeTab === 'cashFlow' && <CashFlowTab />}
                {activeTab === 'expenses' && <ExpenseAnalysisTab />}
                {activeTab === 'tax' && <TaxDashboardTab />}
            </div>
        </div>
    );
};

export default FinancialReports;
