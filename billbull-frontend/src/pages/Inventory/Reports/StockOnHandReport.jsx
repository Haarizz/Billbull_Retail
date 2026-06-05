import React, { useState, useEffect, useMemo } from 'react';
import { FaChartPie, FaTable, FaSync, FaBoxOpen, FaSearch } from 'react-icons/fa';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { getPrintTemplates } from '../../../api/printTemplateApi';
import { generateReportPrintHtml, printHtml } from '../../../utils/printGenerator';
import { getStockOnHandReport } from '../../../api/inventoryReportsApi';
import { getWarehouses } from '../../../api/warehouseApi';
import toast from 'react-hot-toast';
import CurrencyAmount, { CurrencySymbol } from '../../../components/CurrencyAmount';

const StockOnHandReport = () => {
    const [viewMode, setViewMode] = useState('table');
    const [filters, setFilters] = useState({
        dateFrom: '', dateTo: '', warehouse: 'All',
        department: 'All', brand: 'All',
        searchQuery: '', stockCondition: 'Positive only'
    });
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [warehousesList, setWarehousesList] = useState([{ id: 'All', name: 'All' }]);
    const [sortConfig, setSortConfig] = useState({ key: null, dir: 'desc' });

    const departments = useMemo(() => ['All', ...new Set(rawData.map(r => r.department).filter(Boolean))], [rawData]);
    const brands = useMemo(() => ['All', ...new Set(rawData.map(r => r.brand).filter(Boolean))], [rawData]);

    const reportColumns = [
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Item', key: 'item', width: 35 },
        { header: 'Warehouse', key: 'warehouse', width: 25 },
        { header: 'Batch No', key: 'batchNumber', width: 20 },
        { header: 'Expiry', key: 'expiryDate', width: 15 },
        { header: 'Qty', key: 'onHand', width: 15 },
        { header: 'UOM', key: 'uom', width: 15 },
        { header: 'Unit Cost', key: 'unitCost', width: 15 },
        { header: 'Value', key: 'value', width: 20 }
    ];

    const data = useMemo(() => {
        let d = rawData;
        if (filters.warehouse !== 'All') {
            const wName = warehousesList.find(w => String(w.id) === String(filters.warehouse))?.name;
            if (wName) d = d.filter(r => r.warehouse === wName);
        }
        if (filters.department !== 'All') d = d.filter(r => r.department === filters.department);
        if (filters.brand !== 'All') d = d.filter(r => r.brand === filters.brand);
        if (filters.stockCondition === 'Positive only') d = d.filter(r => (r.onHand ?? 0) > 0);
        else if (filters.stockCondition === 'Zero only') d = d.filter(r => (r.onHand ?? 0) === 0);
        else if (filters.stockCondition === 'Negative only') d = d.filter(r => (r.onHand ?? 0) < 0);
        if (filters.searchQuery) {
            const q = filters.searchQuery.toLowerCase();
            d = d.filter(r =>
                (r.sku && r.sku.toLowerCase().includes(q)) ||
                (r.item && r.item.toLowerCase().includes(q)) ||
                (r.batchNumber && r.batchNumber.toLowerCase().includes(q))
            );
        }
        if (filters.dateFrom) {
            const from = new Date(filters.dateFrom).getTime();
            d = d.filter(r => { const s = r.lastSold || r.lastReceived; if (!s || s === 'N/A') return true; return new Date(s).getTime() >= from; });
        }
        if (filters.dateTo) {
            const toEnd = new Date(filters.dateTo).getTime() + 86400000 - 1;
            d = d.filter(r => { const s = r.lastSold || r.lastReceived; if (!s || s === 'N/A') return true; return new Date(s).getTime() <= toEnd; });
        }
        return d.map(r => ({ ...r, value: Number(r.onHand ?? 0) * Number(r.unitCost ?? 0) }));
    }, [rawData, filters, warehousesList]);

    const chartData = useMemo(() => {
        const map = {};
        data.forEach(r => { const w = r.warehouse || 'Unknown'; map[w] = (map[w] || 0) + Number(r.onHand ?? 0) * Number(r.unitCost ?? 0); });
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [data]);

    const totalQty = useMemo(() => data.reduce((s, r) => s + Number(r.onHand ?? 0), 0), [data]);
    const totalValue = useMemo(() => data.reduce((s, r) => s + Number(r.value ?? 0), 0), [data]);
    const avgUnitCost = useMemo(() => {
        const costs = data.map(r => Number(r.unitCost ?? 0)).filter(v => !Number.isNaN(v));
        return costs.length === 0 ? 0 : costs.reduce((a, b) => a + b, 0) / costs.length;
    }, [data]);

    const toggleSort = (key, defaultDir = 'desc') => {
        setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir });
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key) return data;
        const sorted = [...data].sort((a, b) => {
            const va = a?.[sortConfig.key], vb = b?.[sortConfig.key];
            if (va == null && vb == null) return 0;
            if (va == null) return 1; if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return va - vb;
            return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        });
        return sortConfig.dir === 'asc' ? sorted : sorted.reverse();
    }, [data, sortConfig]);

    const loadWarehouses = async () => {
        try { const res = await getWarehouses(); setWarehousesList([{ id: 'All', name: 'All' }, ...res]); }
        catch (e) { console.error('Failed to fetch warehouses', e); }
    };

    const generateReport = async () => {
        setLoading(true);
        try { setRawData((await getStockOnHandReport(null)) || []); }
        catch (e) { console.error(e); toast.error('Failed to load stock data.'); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadWarehouses(); generateReport(); }, []);
    const handleFC = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));
    const handleExportExcel = () => exportToExcel(data, reportColumns, 'SOH_Report');
    const handleExportPdf = () => exportToPDF(data, reportColumns, 'Stock on Hand (SOH)', 'Stock_On_Hand');
    const handlePrint = async () => {
        try { const ts = await getPrintTemplates(); const dt = ts.find(t => t.isDefault) || {}; printHtml(generateReportPrintHtml(dt, "Stock on Hand (SOH)", reportColumns, data)); }
        catch { printHtml(generateReportPrintHtml({}, "Stock on Hand (SOH)", reportColumns, data)); }
    };

    const StatCard = ({ label, value, sub, sortKey, defaultDir }) => {
        const isActive = sortKey && sortConfig.key === sortKey;
        return (
            <button
                onClick={() => sortKey && toggleSort(sortKey, defaultDir)}
                title={sortKey ? 'Click to sort' : undefined}
                className={`flex-1 min-w-0 text-left bg-white rounded-xl p-3 md:p-4 border transition-all ${isActive ? 'border-yellow-400 shadow-yellow-100 shadow' : 'border-gray-200'} ${sortKey ? 'cursor-pointer hover:border-yellow-300' : 'cursor-default'}`}
            >
                <div className="text-[11px] text-gray-500 font-semibold mb-1">{label}</div>
                <div className="text-lg md:text-xl font-bold text-gray-900 truncate">{value}</div>
                {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
            </button>
        );
    };

    const FilterSelect = ({ label, value, options, field }) => (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-600">{label}</label>
            <select
                value={value}
                onChange={e => handleFC(field, e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 outline-none appearance-none cursor-pointer focus:border-yellow-400"
            >
                {options.map(o => <option key={o.id || o} value={o.id || o}>{o.name || o}</option>)}
            </select>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50">

            {/* Top bar */}
            <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white">
                <span className="text-xs text-gray-500">Filters / <span className="text-yellow-500 font-medium">Stock on Hand (SOH)</span></span>
            </div>

            {/* Filters */}
            <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-gray-600">Date From</label>
                        <input type="date" value={filters.dateFrom} onChange={e => handleFC('dateFrom', e.target.value)}
                            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 outline-none focus:border-yellow-400" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-gray-600">Date To</label>
                        <input type="date" value={filters.dateTo} onChange={e => handleFC('dateTo', e.target.value)}
                            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 outline-none focus:border-yellow-400" />
                    </div>
                    <FilterSelect label="Warehouse" value={filters.warehouse} options={warehousesList} field="warehouse" />
                    <FilterSelect label="Department" value={filters.department} options={departments} field="department" />
                    <FilterSelect label="Brand" value={filters.brand} options={brands} field="brand" />
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-gray-600">Item / SKU</label>
                        <div className="relative">
                            <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]" />
                            <input type="text" placeholder="Search..." value={filters.searchQuery} onChange={e => handleFC('searchQuery', e.target.value)}
                                className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 outline-none focus:border-yellow-400" />
                        </div>
                    </div>
                    <FilterSelect label="Stock Condition" value={filters.stockCondition} options={['Positive only', 'All', 'Zero only', 'Negative only']} field="stockCondition" />
                    <div className="flex items-end gap-2 col-span-1">
                        <button onClick={generateReport} disabled={loading}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 rounded-lg text-xs font-bold text-gray-900 disabled:opacity-60 transition-colors">
                            <FaSync className={loading ? 'animate-spin' : ''} /> Generate
                        </button>
                        <ExportDropdown onExportExcel={handleExportExcel} onExportPdf={handleExportPdf} onPrint={handlePrint} disabled={data.length === 0 || loading} />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 md:p-6 flex flex-col gap-4">

                {/* Stat cards */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <StatCard label="Total Qty" value={totalQty.toFixed(0)} sub={`${data.length} items`} sortKey="onHand" />
                    <StatCard label="Total Value" value={<CurrencyAmount value={totalValue} />} sub="Sort by value" sortKey="value" />
                    <StatCard label="Avg Unit Cost" value={<CurrencyAmount value={avgUnitCost} />} sub="Sort by cost" sortKey="unitCost" />
                </div>

                {/* Table / Chart panel */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h4 className="text-sm font-bold text-gray-900">Stock on Hand (SOH)</h4>
                            <p className="text-xs text-gray-500 mt-0.5">Tip: Click stat cards to sort by column.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                                <button onClick={() => setViewMode('table')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <FaTable className="text-[11px]" /> Table
                                </button>
                                <button onClick={() => setViewMode('chart')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'chart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <FaChartPie className="text-[11px]" /> Chart
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16">
                            <FaSync className="text-3xl text-yellow-400 animate-spin" />
                            <span className="text-sm text-gray-500">Assembling Data...</span>
                        </div>
                    ) : viewMode === 'table' ? (
                        <>
                            <div className="overflow-x-auto">
                                <table className="bb-nowrap-table w-full text-xs border-collapse min-w-[720px]">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {['SKU', 'Item', 'Warehouse', 'Batch No', 'Expiry', 'Qty', 'UOM', 'Unit Cost', 'Value'].map(h => (
                                                <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 whitespace-nowrap ${['Qty', 'Unit Cost', 'Value'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.length > 0 ? sortedData.map((row, i) => (
                                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                                <td className="px-3 py-2.5 font-semibold text-gray-900">{row.sku}</td>
                                                <td className="px-3 py-2.5 text-gray-700">{row.item}</td>
                                                <td className="px-3 py-2.5">
                                                    <span className="bg-gray-100 rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{row.warehouse}</span>
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600">{row.batchNumber || '-'}</td>
                                                <td className="px-3 py-2.5 text-gray-500">{row.expiryDate || '-'}</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{row.onHand}</td>
                                                <td className="px-3 py-2.5 text-gray-500">{row.uom}</td>
                                                <td className="px-3 py-2.5 text-right text-gray-500"><CurrencyAmount value={row.unitCost || 0} /></td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-green-600"><CurrencyAmount value={row.value || 0} /></td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan="9" className="py-14 text-center">
                                                    <FaBoxOpen className="text-4xl text-gray-200 mx-auto mb-3" />
                                                    <p className="text-sm text-gray-500">No data found matching current filters.</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {data.length > 0 && (
                                <div className="px-4 md:px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span>{data.length} rows</span>
                                        <span className="flex items-center gap-1.5 text-green-600">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Live
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-semibold text-gray-500 uppercase">Total Value</div>
                                        <CurrencyAmount value={data.reduce((acc, r) => acc + r.value, 0)} className="text-base font-bold text-gray-900" />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="p-4 md:p-8 bg-gray-50">
                            <div className="mb-4 text-center">
                                <h3 className="text-sm font-bold text-gray-700">Stock Valuation by Warehouse</h3>
                                <p className="text-xs text-gray-500 mt-1">Total Value (<CurrencySymbol />) grouped by Warehouse.</p>
                            </div>
                            <div className="h-64 md:h-80">
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} dy={8} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} dx={-8} />
                                            <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} formatter={v => [<CurrencyAmount value={v} />, 'Valuation']} />
                                            <Bar dataKey="value" fill="#F5C742" radius={[6, 6, 0, 0]} maxBarSize={60} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-sm text-gray-400">No data available to chart.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockOnHandReport;
