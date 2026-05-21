import React, { useState, useEffect, useMemo } from 'react';
import { FaSearch } from 'react-icons/fa';
import {
    RefreshCw, Download,
    TrendingUp, DollarSign, ShoppingCart, Calendar,
    Menu, X
} from 'lucide-react';
import { getAllSalesInvoices } from '../../../api/salesInvoiceApi';
import toast from 'react-hot-toast';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { useCompany } from '../../../context/CompanyContext';
import { formatDisplayDate } from '../../../utils/dateUtils';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const SALES_SUMMARY_COLUMNS = [
    { header: 'Invoice No', key: 'invoiceNumber', width: 15 },
    { header: 'Date', key: 'invoiceDate', width: 12 },
    { header: 'Customer', key: 'customerName', width: 25 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Grand Total', key: 'invoiceTotal', width: 15 },
    { header: 'Tax', key: 'taxTotal', width: 12 }
];

const SalesSummaryReport = () => {
    const { company } = useCompany();
    const reportCurrency = company?.currency || 'AED';
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 3);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [statusFilter, setStatusFilter] = useState('All');
    const [customerFilter, setCustomerFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('Customer');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getAllSalesInvoices();
            setInvoices(Array.isArray(res) ? res : (res.content || res.data || []));
        } catch (err) {
            console.error(err);
            toast.error('Failed to load sales invoices');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const filtered = useMemo(() => {
        let data = invoices;
        if (dateFrom) data = data.filter(i => i.invoiceDate >= dateFrom);
        if (dateTo) data = data.filter(i => i.invoiceDate <= dateTo);
        if (statusFilter !== 'All') data = data.filter(i => (i.status || '').toUpperCase() === statusFilter.toUpperCase());
        if (customerFilter !== 'All') data = data.filter(i => i.customerName === customerFilter);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            data = data.filter(i =>
                (i.invoiceNumber || '').toLowerCase().includes(q) ||
                (i.customerName || '').toLowerCase().includes(q)
            );
        }
        return data;
    }, [invoices, dateFrom, dateTo, statusFilter, customerFilter, searchQuery]);

    const customers = useMemo(() => ['All', ...new Set(invoices.map(i => i.customerName).filter(Boolean)).values()], [invoices]);
    const statuses = ['All', 'CONFIRMED', 'POSTED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'DRAFT'];

    const totalSales = filtered.reduce((s, i) => s + parseFloat(i.invoiceTotal || 0), 0);
    const totalTax = filtered.reduce((s, i) => s + parseFloat(i.taxTotal || 0), 0);
    const totalPaid = filtered.filter(i => (i.status || '').toUpperCase() === 'PAID').reduce((s, i) => s + parseFloat(i.invoiceTotal || 0), 0);
    const totalOutstanding = filtered.filter(i => ['CONFIRMED', 'PARTIALLY_PAID', 'POSTED'].includes((i.status || '').toUpperCase())).reduce((s, i) => s + parseFloat(i.invoiceTotal || 0), 0);

    // Group summary
    const groupedData = useMemo(() => {
        const map = {};
        filtered.forEach(inv => {
            const key = groupBy === 'Customer' ? (inv.customerName || 'Unknown') :
                groupBy === 'Month' ? (inv.invoiceDate || '').substring(0, 7) :
                    (inv.status || 'Unknown');
            if (!map[key]) map[key] = { name: key, count: 0, total: 0, paid: 0 };
            map[key].count += 1;
            map[key].total += parseFloat(inv.invoiceTotal || 0);
            if ((inv.status || '').toUpperCase() === 'PAID') map[key].paid += parseFloat(inv.invoiceTotal || 0);
        });
        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [filtered, groupBy]);



    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* LEFT SIDEBAR — desktop: always visible, mobile: slide-in drawer */}
            <aside className={`
                fixed md:static inset-y-0 left-0 z-50 md:z-auto
                w-80 md:w-[300px] shrink-0
                bg-white border-r border-slate-200
                flex flex-col h-full
                transition-transform duration-200
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="p-4 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="m-0 text-base font-bold text-slate-900">Sales Summary</h2>
                            <p className="mt-0.5 text-xs text-slate-500">Revenue overview, customer analysis, and invoice breakdown.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            className="md:hidden p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                            aria-label="Close filters"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <FaSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }} />
                        <input
                            placeholder="Search invoices..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '6px 10px 6px 30px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 8px 8px' }}>
                        Filters
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>From</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', color: '#374151' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>To</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', color: '#374151' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Status</label>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', color: '#374151' }}>
                                {statuses.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Customer</label>
                            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', color: '#374151' }}>
                                {customers.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Group By</label>
                            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', color: '#374151' }}>
                                <option>Customer</option>
                                <option>Month</option>
                                <option>Status</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ marginTop: 20, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 8px 8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Quick Stats</span>
                        <span style={{ background: '#f3f4f6', borderRadius: 12, padding: '2px 8px', fontWeight: 500, fontSize: 11, color: '#4b5563' }}>{filtered.length} records</span>
                    </div>
                    {[
                        { label: 'Total Revenue', value: totalSales },
                        { label: 'Total Tax (VAT)', value: totalTax },
                        { label: 'Paid Amount', value: totalPaid },
                        { label: 'Outstanding', value: totalOutstanding },
                    ].map((stat, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 8, marginBottom: 4, background: '#f9fafb' }}>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>{stat.label}</span>
                            <CurrencyAmount value={stat.value} currency={reportCurrency} className="text-xs font-bold text-slate-900" />
                        </div>
                    ))}
                </div>

                <div className="p-3 border-t border-slate-100 flex gap-2">
                    <button
                        type="button"
                        onClick={fetchData}
                        className="flex-1 h-9 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={13} /> Refresh
                    </button>
                        <ExportDropdown
                            onExportExcel={() => exportToExcel(filtered, SALES_SUMMARY_COLUMNS, `Sales_Summary_${dateFrom}_to_${dateTo}`)}
                            onExportPdf={() => exportToPDF(filtered, SALES_SUMMARY_COLUMNS, 'Sales Summary Report', `Sales_Summary_${dateFrom}_to_${dateTo}`)}
                        />
                </div>
            </aside>

            {/* RIGHT MAIN CONTENT */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        aria-label="Open filters"
                    >
                        <Menu size={16} />
                    </button>
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">Sales Summary</div>
                        <div className="text-xs text-slate-500">{filtered.length} records</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-5">

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                        {[
                            { label: 'Total Revenue', value: totalSales, sub: `${filtered.length} invoices`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { label: 'Total Tax (VAT)', value: totalTax, sub: 'VAT collected', icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Paid Amount', value: totalPaid, sub: 'Fully paid invoices', icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50' },
                            { label: 'Outstanding', value: totalOutstanding, sub: 'Pending collection', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50' },
                        ].map((card, i) => (
                            <div key={i} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-semibold text-slate-500">{card.label}</span>
                                    <div className={`w-7 h-7 rounded-full ${card.bg} flex items-center justify-center`}>
                                        <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                                    </div>
                                </div>
                                <CurrencyAmount value={card.value} currency={reportCurrency} className="text-lg font-bold text-slate-800" />
                                <div className="text-xs text-slate-400 mt-1">{card.sub}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Summary by Group */}
                        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50">
                                <h3 className="font-bold text-slate-800 text-sm">By {groupBy}</h3>
                                <p className="text-xs text-slate-400">{groupedData.length} groups</p>
                            </div>
                            <div className="overflow-y-auto max-h-96">
                                {loading ? (
                                    <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
                                ) : groupedData.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-sm">No data for selected filters</div>
                                ) : groupedData.map((row, i) => (
                                    <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 hover:bg-slate-50">
                                        <div>
                                            <div className="text-sm font-medium text-slate-800 truncate max-w-36">{row.name}</div>
                                            <div className="text-xs text-slate-400">{row.count} invoice{row.count !== 1 ? 's' : ''}</div>
                                        </div>
                                        <div className="text-right">
                                            <CurrencyAmount value={row.total} currency={reportCurrency} className="text-sm font-bold text-slate-800" />
                                            {row.paid > 0 && <div className="text-xs text-emerald-500"><CurrencyAmount value={row.paid} currency={reportCurrency} /> paid</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Invoice Detail Table */}
                        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50">
                                <h3 className="font-bold text-slate-800 text-sm">Invoice Details</h3>
                                <p className="text-xs text-slate-400">{filtered.length} records shown</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3">Invoice No</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Customer</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {loading ? (
                                            <tr><td colSpan="5" className="text-center py-8 text-slate-400">Loading...</td></tr>
                                        ) : filtered.length === 0 ? (
                                            <tr><td colSpan="5" className="text-center py-8 text-slate-400">No invoices found for the selected filters.</td></tr>
                                        ) : filtered.slice(0, 100).map((inv, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-2.5 font-mono text-slate-700">{inv.invoiceNumber || `#${inv.id}`}</td>
                                                <td className="px-4 py-2.5 text-slate-500">{formatDisplayDate(inv.invoiceDate)}</td>
                                                <td className="px-4 py-2.5 text-slate-700 font-medium">{inv.customerName || '-'}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                        (inv.status || '').toUpperCase() === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                                        (inv.status || '').toUpperCase() === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    }`}>{inv.status || 'Draft'}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold text-slate-800"><CurrencyAmount value={inv.invoiceTotal} currency={reportCurrency} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {filtered.length > 0 && (
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-300 bg-slate-50">
                                                <td colSpan="4" className="px-4 py-3 font-bold text-slate-700 text-sm">Total ({filtered.length} invoices)</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900 text-sm"><CurrencyAmount value={totalSales} currency={reportCurrency} /></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default SalesSummaryReport;
