import React, { useState, useEffect, useMemo } from 'react';
import {
    ShoppingCart, Download, Eye, TrendingUp, DollarSign,
    BarChart2, Users, X, Package, ChevronLeft, ChevronRight, Calendar
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { getUserProfile, hasRole } from '../api/auth';
import { getSalesInvoicesPage, getSalesInvoiceById } from '../api/salesInvoiceApi';
import CurrencyAmount, { CurrencySymbol } from '../components/CurrencyAmount';
import { getImageUrl } from '../utils/urlUtils';
import toast from 'react-hot-toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAmount = (inv) =>
    Number(inv?.invoiceTotal ?? inv?.netTotal ?? inv?.totalAmount ?? inv?.grandTotal ?? 0);

const fmtDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${parseInt(m)}/${parseInt(d)}/${y}`;
};

const getDateRange = (period) => {
    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth();
    switch (period) {
        case 'Last Month':   return { from: new Date(y, mo - 1, 1), to: new Date(y, mo, 0) };
        case 'This Quarter': { const q = Math.floor(mo / 3); return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0) }; }
        case 'This Year':    return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
        default:             return { from: new Date(y, mo, 1), to: new Date(y, mo + 1, 0) }; // This Month
    }
};

const filterByPeriod = (invoices, period) => {
    const { from, to } = getDateRange(period);
    return invoices.filter(inv => {
        if (!inv.invoiceDate) return false;
        const d = new Date(inv.invoiceDate);
        return d >= from && d <= to;
    });
};

const buildMonthlyData = (invoices) => {
    const now = new Date();
    const months = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (6 - i), 1);
        return {
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            month: d.toLocaleString('default', { month: 'short' }),
            actual: 0,
        };
    });
    invoices.forEach(inv => {
        if (!inv.invoiceDate) return;
        const d = new Date(inv.invoiceDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const m = months.find(x => x.key === key);
        if (m) m.actual += getAmount(inv);
    });
    return months.map(({ month, actual }) => ({ month, actual }));
};

const STATUS_CFG = {
    PAID:           { label: 'Paid',         text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', pie: '#10B981' },
    PARTIALLY_PAID: { label: 'Partial',       text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   pie: '#F5C742' },
    OVERDUE:        { label: 'Overdue',        text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     pie: '#EF4444' },
    POSTED:         { label: 'Posted',         text: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    pie: '#3B82F6' },
    CONFIRMED:      { label: 'Confirmed',      text: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-200',  pie: '#6366F1' },
    DRAFT:          { label: 'Draft',          text: 'text-slate-500',   bg: 'bg-slate-100',  border: 'border-slate-200',   pie: '#94A3B8' },
    CANCELLED:      { label: 'Cancelled',      text: 'text-slate-400',   bg: 'bg-slate-50',   border: 'border-slate-200',   pie: '#CBD5E1' },
};
const getStatusCfg = (s) => STATUS_CFG[(s || '').toUpperCase()] || { label: s || '—', text: 'text-slate-500', bg: 'bg-slate-100', border: 'border-slate-200', pie: '#94A3B8' };

const buildStatusPie = (invoices) => {
    const map = {};
    invoices.forEach(inv => {
        const s = (inv.status || 'UNKNOWN').toUpperCase();
        if (!map[s]) map[s] = 0;
        map[s] += getAmount(inv);
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([s, amt]) => ({
        name: getStatusCfg(s).label,
        value: total ? Math.round((amt / total) * 100) : 0,
        amount: amt,
        color: getStatusCfg(s).pie,
    }));
};

const COMMISSION_RATE = 0.05;
const PAGE_SIZE = 10;

// ─── Custom Pie Label ─────────────────────────────────────────────────────────

const RADIAN = Math.PI / 180;
const renderPieLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
    const r = outerRadius + 28;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} fill="#64748B" textAnchor={x > cx ? 'start' : 'end'}
            dominantBaseline="central" fontSize={11} fontWeight={500}>
            {`${name} ${value}%`}
        </text>
    );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, sub, subColor }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-0">
        <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <div className="p-2 bg-[#F5C742]/10 rounded-lg">{icon}</div>
        </div>
        <div className="text-2xl font-bold text-slate-900 mb-1">{value}</div>
        <p className={`text-xs font-medium ${subColor || 'text-slate-500'}`}>{sub}</p>
    </div>
);

// ─── Invoice View Modal ───────────────────────────────────────────────────────

const InvoiceModal = ({ invoice, onClose }) => {
    if (!invoice) return null;

    const items  = invoice.items || [];
    const status = getStatusCfg(invoice.status);

    const subtotal  = items.reduce((s, i) => s + (Number(i.qty || i.quantity || 0) * Number(i.price || 0)), 0);
    const totalDisc = items.reduce((s, i) => s + ((Number(i.qty || i.quantity || 0) * Number(i.price || 0)) * (Number(i.discount || i.disc || 0) / 100)), 0);
    const totalTax  = items.reduce((s, i) => s + Number(i.taxAmount || i.taxAmt || 0), 0);
    const grandTotal = getAmount(invoice) || (subtotal - totalDisc + totalTax);
    const commission = grandTotal * COMMISSION_RATE;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#F5C742]/10 rounded-lg">
                            <ShoppingCart className="h-5 w-5 text-[#B4860B]" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">{invoice.invoiceNumber || '—'}</h2>
                            <p className="text-xs text-slate-400">Sales Invoice</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${status.text} ${status.bg} ${status.border}`}>
                            {status.label}
                        </span>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Invoice Meta */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Invoice Date',  value: fmtDate(invoice.invoiceDate) },
                            { label: 'Due Date',      value: fmtDate(invoice.dueDate) },
                            { label: 'Customer',      value: invoice.customerName || '—' },
                            { label: 'Payment Mode',  value: invoice.paymentMode || '—' },
                            { label: 'Salesperson',   value: invoice.salesperson || '—' },
                            { label: 'Branch',        value: invoice.branch || '—' },
                            { label: 'Amount Paid',   value: <CurrencyAmount value={invoice.amountPaid || 0} /> },
                            { label: 'Balance',       value: <CurrencyAmount value={invoice.balance || 0} /> },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                                <p className="text-xs font-bold text-slate-900">{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Items Table */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                            <Package className="h-4 w-4 text-[#B4860B]" /> Items ({items.length})
                        </h3>
                        {items.length === 0 ? (
                            <div className="py-10 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100">
                                No items found for this invoice.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50">
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product</th>
                                            <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Code</th>
                                            <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qty</th>
                                            <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unit Price</th>
                                            <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Disc%</th>
                                            <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tax</th>
                                            <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => {
                                            const imgUrl = getImageUrl(item.image || item.primaryImage || '');
                                            const name   = item.itemName || item.name || '—';
                                            const code   = item.itemCode || item.code || '—';
                                            const qty    = Number(item.qty || item.quantity || 0);
                                            const price  = Number(item.price || 0);
                                            const disc   = Number(item.discount || item.disc || 0);
                                            const taxAmt = Number(item.taxAmount || item.taxAmt || 0);
                                            const net    = Number(item.netAmount || item.net || (qty * price * (1 - disc / 100)) || 0);
                                            return (
                                                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                                    <td className="py-3 px-3">
                                                        <div className="flex items-center gap-2.5">
                                                            {imgUrl ? (
                                                                <img src={imgUrl} alt={name} className="h-10 w-10 rounded-lg object-cover border border-slate-100 flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
                                                            ) : (
                                                                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                                    <Package className="h-4 w-4 text-slate-300" />
                                                                </div>
                                                            )}
                                                            <span className="font-semibold text-slate-900">{name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-500 font-mono text-[10px]">{code}</td>
                                                    <td className="py-3 px-3 text-right font-bold text-slate-900">{qty}</td>
                                                    <td className="py-3 px-3 text-right text-slate-700"><CurrencyAmount value={price} /></td>
                                                    <td className="py-3 px-3 text-right text-amber-600">{disc > 0 ? `${disc}%` : '—'}</td>
                                                    <td className="py-3 px-3 text-right text-slate-500"><CurrencyAmount value={taxAmt} /></td>
                                                    <td className="py-3 px-3 text-right font-bold text-slate-900"><CurrencyAmount value={net} /></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end">
                        <div className="w-full max-w-xs space-y-2">
                            {[
                                { label: 'Subtotal',   value: subtotal },
                                { label: 'Discount',   value: -totalDisc, color: 'text-red-500' },
                                { label: 'Tax',        value: totalTax },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="flex items-center justify-between text-xs text-slate-600">
                                    <span>{label}</span>
                                    <span className={color}>
                                        {label === 'Discount' && totalDisc > 0 ? '−' : ''}
                                        <CurrencyAmount value={Math.abs(value)} />
                                    </span>
                                </div>
                            ))}
                            <div className="h-px bg-slate-200 my-1" />
                            <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                                <span>Grand Total</span>
                                <CurrencyAmount value={grandTotal} />
                            </div>
                            <div className="flex items-center justify-between text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
                                <span>Commission (5%)</span>
                                <CurrencyAmount value={commission} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MySales = () => {
    const [period, setPeriod]           = useState('This Month');
    const [allInvoices, setAllInvoices] = useState([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');
    const [tablePage, setTablePage]     = useState(0);
    const [viewInvoice, setViewInvoice] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);

    // ── Load ────────────────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [profileData, invoiceData] = await Promise.all([
                    getUserProfile(),
                    getSalesInvoicesPage({ page: 0, size: 500 }),
                ]);
                const rows = Array.isArray(invoiceData?.content) ? invoiceData.content : [];
                const isAdmin = hasRole('ADMIN');
                if (isAdmin) {
                    // Admins see all invoices
                    setAllInvoices(rows);
                } else {
                    // Sales users — filter by their full name matching the salesperson field
                    const salespersonName = (profileData?.fullName || '').toLowerCase().trim();
                    const myRows = salespersonName
                        ? rows.filter(inv => (inv.salesperson || '').toLowerCase().trim() === salespersonName)
                        : rows;
                    setAllInvoices(myRows);
                }
            } catch {
                toast.error('Failed to load sales data');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ── Derived data ─────────────────────────────────────────────────────────
    const periodInvoices = useMemo(() => filterByPeriod(allInvoices, period), [allInvoices, period]);

    const stats = useMemo(() => {
        const totalSales = periodInvoices.reduce((s, inv) => s + getAmount(inv), 0);
        const count      = periodInvoices.length;
        return {
            totalSales,
            outstanding: periodInvoices.reduce((s, inv) => s + Number(inv.balance || 0), 0),
            avgSale:     count ? totalSales / count : 0,
            customers:   new Set(periodInvoices.map(inv => inv.customerCode || inv.customerName || 'unknown')).size,
            count,
        };
    }, [periodInvoices]);

    const monthlyData = useMemo(() => buildMonthlyData(allInvoices), [allInvoices]);
    const statusPie   = useMemo(() => buildStatusPie(periodInvoices), [periodInvoices]);

    const filteredInvoices = useMemo(() => {
        return periodInvoices.filter(inv => {
            const q = search.toLowerCase();
            const matchSearch = !q
                || (inv.invoiceNumber || '').toLowerCase().includes(q)
                || (inv.customerName  || '').toLowerCase().includes(q);
            const matchStatus = statusFilter === 'All Status'
                || (inv.status || '').toUpperCase() === statusFilter.replace(' ', '_').toUpperCase();
            return matchSearch && matchStatus;
        });
    }, [periodInvoices, search, statusFilter]);

    const pageCount = Math.ceil(filteredInvoices.length / PAGE_SIZE);
    const pageRows  = filteredInvoices.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

    // Reset table page when filters change
    useMemo(() => setTablePage(0), [search, statusFilter, period]);

    // ── View modal ───────────────────────────────────────────────────────────
    const handleView = async (id) => {
        setModalLoading(true);
        setViewInvoice('loading');
        try {
            const data = await getSalesInvoiceById(id);
            setViewInvoice(data);
        } catch {
            toast.error('Failed to load invoice details');
            setViewInvoice(null);
        } finally {
            setModalLoading(false);
        }
    };

    // ── Export CSV ───────────────────────────────────────────────────────────
    const handleExport = () => {
        const rows = [
            ['Invoice No', 'Date', 'Customer', 'Amount (AED)', 'Commission (AED)', 'Status', 'Payment Mode'],
            ...filteredInvoices.map(inv => [
                inv.invoiceNumber || '',
                inv.invoiceDate   || '',
                inv.customerName  || '',
                getAmount(inv).toFixed(2),
                (getAmount(inv) * COMMISSION_RATE).toFixed(2),
                inv.status        || '',
                inv.paymentMode   || '',
            ]),
        ];
        const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `my-sales-${period.replace(/ /g, '-').toLowerCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-screen bg-[#F7F7FA] flex items-center justify-center">
            <p className="text-sm text-slate-400 animate-pulse">Loading your sales data…</p>
        </div>
    );

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
                        {['This Month', 'Last Month', 'This Quarter', 'This Year'].map(p => <option key={p}>{p}</option>)}
                    </select>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                    >
                        <Download className="h-3.5 w-3.5" /> Export
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="flex flex-col sm:flex-row gap-4 mb-5">
                <StatCard
                    icon={<DollarSign className="h-4 w-4 text-[#B4860B]" />}
                    label="Total Sales"
                    value={<CurrencyAmount value={stats.totalSales} />}
                    sub={`${stats.count} invoice${stats.count !== 1 ? 's' : ''} • ${period}`}
                />
                <StatCard
                    icon={<DollarSign className="h-4 w-4 text-red-500" />}
                    label="Outstanding Balance"
                    value={<CurrencyAmount value={stats.outstanding} />}
                    sub="Unpaid amount this period"
                    subColor={stats.outstanding > 0 ? 'text-red-500' : 'text-emerald-600'}
                />
                <StatCard
                    icon={<BarChart2 className="h-4 w-4 text-blue-500" />}
                    label="Average Sale"
                    value={<CurrencyAmount value={stats.avgSale} />}
                    sub={`${stats.count} transaction${stats.count !== 1 ? 's' : ''}`}
                />
                <StatCard
                    icon={<Users className="h-4 w-4 text-slate-500" />}
                    label="Active Customers"
                    value={stats.customers}
                    sub="This period"
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">

                {/* Monthly Trend */}
                <div className="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-[#B4860B]" /> Sales Performance Trend
                    </h3>
                    {monthlyData.every(d => d.actual === 0) ? (
                        <div className="h-[260px] flex items-center justify-center text-slate-400 text-xs">No sales data in the last 7 months</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                <Tooltip
                                    formatter={(value) => [`AED ${Number(value).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, 'Sales']}
                                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                                />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                                    formatter={() => 'Actual Sales'} />
                                <Line type="monotone" dataKey="actual" stroke="#F5C742" strokeWidth={2.5}
                                    dot={{ fill: '#F5C742', r: 4, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Status Breakdown */}
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-[#B4860B]" /> Sales by Status
                    </h3>
                    {statusPie.length === 0 ? (
                        <div className="h-[260px] flex items-center justify-center text-slate-400 text-xs">No data for this period</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={statusPie} cx="50%" cy="50%" outerRadius={75}
                                    dataKey="value" labelLine label={renderPieLabel}>
                                    {statusPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip
                                    formatter={(value, _, { payload }) => [
                                        `${value}% • AED ${Number(payload.amount).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`,
                                        payload.name
                                    ]}
                                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
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
                            <option value="PAID">Paid</option>
                            <option value="PARTIALLY_PAID">Partial</option>
                            <option value="OVERDUE">Overdue</option>
                            <option value="POSTED">Posted</option>
                            <option value="CONFIRMED">Confirmed</option>
                            <option value="DRAFT">Draft</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-100">
                                {['DATE', 'INVOICE NO', 'CUSTOMER', 'AMOUNT', 'COMMISSION', 'PAYMENT', 'STATUS', 'ACTIONS'].map(col => (
                                    <th key={col} className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                        {allInvoices.length === 0
                                            ? 'No sales found for this period.'
                                            : 'No transactions match your filters.'}
                                    </td>
                                </tr>
                            ) : pageRows.map((inv, i) => {
                                const amount  = getAmount(inv);
                                const s       = getStatusCfg(inv.status);
                                return (
                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(inv.invoiceDate)}</span>
                                        </td>
                                        <td className="py-3 px-3 font-bold text-slate-900">{inv.invoiceNumber || '—'}</td>
                                        <td className="py-3 px-3 text-slate-700 max-w-[160px] truncate">{inv.customerName || '—'}</td>
                                        <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                                            <CurrencyAmount value={amount} />
                                        </td>
                                        <td className="py-3 px-3 font-bold text-emerald-600 whitespace-nowrap">
                                            <CurrencyAmount value={amount * COMMISSION_RATE} />
                                        </td>
                                        <td className="py-3 px-3 text-slate-500">{inv.paymentMode || '—'}</td>
                                        <td className="py-3 px-3">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>
                                                {s.label}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3">
                                            <button
                                                onClick={() => handleView(inv.id)}
                                                disabled={modalLoading}
                                                className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                <Eye className="h-3 w-3" /> View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pageCount > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs text-slate-400">
                            Showing {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-default">
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => {
                                const p = tablePage < 3 ? i : tablePage - 2 + i;
                                if (p >= pageCount) return null;
                                return (
                                    <button key={p} onClick={() => setTablePage(p)}
                                        className={`w-7 h-7 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${tablePage === p ? 'bg-[#F5C742] border-[#F5C742] text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                        {p + 1}
                                    </button>
                                );
                            })}
                            <button onClick={() => setTablePage(p => Math.min(pageCount - 1, p + 1))} disabled={tablePage >= pageCount - 1}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-default">
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Invoice Modal */}
            {viewInvoice && viewInvoice !== 'loading' && (
                <InvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />
            )}
            {viewInvoice === 'loading' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl text-center">
                        <p className="text-sm text-slate-500 animate-pulse">Loading invoice details…</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MySales;
