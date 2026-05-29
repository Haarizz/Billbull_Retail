import React, { useState } from 'react';
import { ShoppingCart, Download, Eye, TrendingUp, DollarSign, BarChart2, Users } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';

const salesTrendData = [
    { month: 'Aug', actual: 50000, target: 48000 },
    { month: 'Sep', actual: 47000, target: 50000 },
    { month: 'Oct', actual: 45000, target: 52000 },
    { month: 'Nov', actual: 62000, target: 55000 },
    { month: 'Dec', actual: 60000, target: 58000 },
    { month: 'Jan', actual: 58000, target: 60000 },
    { month: 'Feb', actual: 59000, target: 60000 },
];

const categoryData = [
    { name: 'Electronics', value: 35 },
    { name: 'Office Supplies', value: 25 },
    { name: 'Furniture', value: 20 },
    { name: 'Software', value: 15 },
    { name: 'Others', value: 5 },
];
const PIE_COLORS = ['#F5C742', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444'];

const transactions = [
    { date: '2/10/2024', invoice: 'INV-2024-0345', customer: 'ABC Corporation',    items: 5, amount: '$12,500', commission: '$625', status: 'Paid' },
    { date: '2/9/2024',  invoice: 'INV-2024-0342', customer: 'XYZ Enterprises',    items: 3, amount: '$8,200',  commission: '$410', status: 'Paid' },
    { date: '2/8/2024',  invoice: 'INV-2024-0338', customer: 'Tech Solutions Ltd',  items: 7, amount: '$15,600', commission: '$780', status: 'Pending' },
    { date: '2/7/2024',  invoice: 'INV-2024-0334', customer: 'Global Trading Co',   items: 4, amount: '$9,800',  commission: '$490', status: 'Paid' },
    { date: '2/6/2024',  invoice: 'INV-2024-0329', customer: 'Retail Partners Inc', items: 6, amount: '$11,300', commission: '$565', status: 'Paid' },
];

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text
            x={x}
            y={y}
            fill="#64748B"
            textAnchor={x > cx ? 'start' : 'end'}
            dominantBaseline="central"
            fontSize={11}
            fontWeight={500}
        >
            {`${name} ${value}%`}
        </text>
    );
};

const StatCard = ({ icon, label, value, sub, subColor }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-0">
        <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <div className="p-2 bg-[#F5C742]/10 rounded-lg">{icon}</div>
        </div>
        <p className="text-2xl font-bold text-slate-900 mb-1">{value}</p>
        <p className={`text-xs font-medium ${subColor || 'text-slate-500'}`}>{sub}</p>
    </div>
);

const MySales = () => {
    const [period, setPeriod] = useState('This Month');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');

    const filtered = transactions.filter(t => {
        const matchSearch = t.invoice.toLowerCase().includes(search.toLowerCase()) ||
            t.customer.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'All Status' || t.status === statusFilter;
        return matchSearch && matchStatus;
    });

    return (
        <div className="min-h-screen bg-[#F7F7FA] p-4 lg:p-6 font-sans text-slate-900">

            {/* Breadcrumb */}
            <p className="text-xs text-slate-400 mb-2">My Profile &rsaquo; My Sales</p>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <ShoppingCart className="h-6 w-6 text-[#B4860B]" /> My Sales
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">Track your sales performance, revenue, and customer transactions</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] cursor-pointer"
                    >
                        <option>This Month</option>
                        <option>Last Month</option>
                        <option>This Quarter</option>
                        <option>This Year</option>
                    </select>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                        <Download className="h-3.5 w-3.5" /> Export
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="flex flex-col sm:flex-row gap-4 mb-5">
                <StatCard
                    icon={<DollarSign className="h-4 w-4 text-[#B4860B]" />}
                    label="Total Sales"
                    value="$57,400"
                    sub="↑ +12.5% from last month"
                    subColor="text-emerald-600"
                />
                <StatCard
                    icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
                    label="Total Commission"
                    value="$2,870"
                    sub="5% commission rate"
                />
                <StatCard
                    icon={<BarChart2 className="h-4 w-4 text-blue-500" />}
                    label="Average Sale"
                    value="$11,480"
                    sub="5 transactions"
                />
                <StatCard
                    icon={<Users className="h-4 w-4 text-slate-500" />}
                    label="Active Customers"
                    value="5"
                    sub="This period"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">

                {/* Line Chart */}
                <div className="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-[#B4860B]" /> Sales Performance Trend
                    </h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={salesTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
                            <Tooltip
                                formatter={(value) => [`$${value.toLocaleString()}`, '']}
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                            />
                            <Legend
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                                formatter={(value) => value === 'actual' ? 'Actual Sales' : 'Target'}
                            />
                            <Line
                                type="monotone"
                                dataKey="actual"
                                stroke="#F5C742"
                                strokeWidth={2}
                                dot={{ fill: '#F5C742', r: 4, strokeWidth: 0 }}
                                activeDot={{ r: 5 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="target"
                                stroke="#94A3B8"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={{ fill: '#94A3B8', r: 4, strokeWidth: 0 }}
                                activeDot={{ r: 5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart */}
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-[#B4860B]" /> Sales by Category
                    </h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                dataKey="value"
                                labelLine={true}
                                label={renderCustomLabel}
                            >
                                {categoryData.map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value}%`, '']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-[#B4860B]" /> Recent Sales Transactions
                    </h3>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search by invoice or customer..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] w-52"
                        />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] cursor-pointer"
                        >
                            <option>All Status</option>
                            <option>Paid</option>
                            <option>Pending</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-100">
                                {['DATE', 'INVOICE NO', 'CUSTOMER', 'ITEMS', 'AMOUNT', 'COMMISSION', 'STATUS', 'ACTIONS'].map(col => (
                                    <th key={col} className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row, i) => (
                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    <td className="py-3 px-3 text-slate-600">{row.date}</td>
                                    <td className="py-3 px-3 font-bold text-slate-900">{row.invoice}</td>
                                    <td className="py-3 px-3 text-slate-700">{row.customer}</td>
                                    <td className="py-3 px-3 text-slate-600">{row.items}</td>
                                    <td className="py-3 px-3 font-bold text-slate-900">{row.amount}</td>
                                    <td className="py-3 px-3 font-bold text-emerald-600">{row.commission}</td>
                                    <td className="py-3 px-3">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                            row.status === 'Paid'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                                        }`}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-3">
                                        <button className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                            <Eye className="h-3 w-3" /> View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">No transactions found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default MySales;
