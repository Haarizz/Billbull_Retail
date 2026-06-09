import React, { useState, useEffect, useMemo } from 'react';
import { FaDownload, FaSync, FaCog, FaArrowUp } from 'react-icons/fa';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { getStockValuationReport } from '../../../api/inventoryReportsApi';
import { getWarehouses } from '../../../api/warehouseApi';
import { getPrintTemplates } from '../../../api/printTemplateApi';
import { generateReportPrintHtml, printHtml } from '../../../utils/printGenerator';
import toast from 'react-hot-toast';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { useBranch } from '../../../context/BranchContext';
import { useCompany } from '../../../context/CompanyContext';

const StockValuationReport = () => {
    const { activeBranch } = useBranch();
    const { company } = useCompany();
    const [filters, setFilters] = useState({
        dateFrom: '', dateTo: '', warehouse: 'All',
        department: 'All', brand: 'All',
        searchQuery: '', stockCondition: 'Positive only'
    });

    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [warehousesList, setWarehousesList] = useState([{ id: 'All', name: 'All' }]);
    const [sortConfig, setSortConfig] = useState({ key: null, dir: 'desc' });

    // Dynamic filter options
    const departments = useMemo(() => ['All', ...new Set(rawData.map(r => r.department).filter(Boolean))], [rawData]);
    const brands = useMemo(() => ['All', ...new Set(rawData.map(r => r.brand).filter(Boolean))], [rawData]);

    const reportColumns = [
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Item', key: 'item', width: 35 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Warehouse', key: 'warehouse', width: 25 },
        { header: 'Batch No', key: 'batchNumber', width: 20 },
        { header: 'Expiry', key: 'expiryDate', width: 15 },
        { header: 'Cost Method', key: 'costMethod', width: 18 },
        { header: 'Qty', key: 'onHand', width: 15 },
        { header: 'Unit Cost', key: 'unitCost', width: 15 },
        { header: 'FIFO Cost', key: 'fifoUnitCost', width: 15 },
        { header: 'LIFO Cost', key: 'lifoUnitCost', width: 15 },
        { header: 'Stock Value', key: 'stockValue', width: 20 }
    ];

    // Filtered data
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
            d = d.filter(r => {
                const dateStr = r.lastSold || r.lastReceived;
                if (!dateStr || dateStr === 'N/A') return true;
                return new Date(dateStr).getTime() >= from;
            });
        }
        if (filters.dateTo) {
            const to = new Date(filters.dateTo).getTime();
            const toEnd = to + 24 * 60 * 60 * 1000 - 1;
            d = d.filter(r => {
                const dateStr = r.lastSold || r.lastReceived;
                if (!dateStr || dateStr === 'N/A') return true;
                return new Date(dateStr).getTime() <= toEnd;
            });
        }
        return d.map(r => ({
            ...r,
            stockValue: Number(r.onHand ?? 0) * Number(r.unitCost ?? 0),
            retailValue: Number(r.onHand ?? 0) * Number(r.retailPrice ?? 0)
        }));
    }, [rawData, filters, warehousesList]);

    // Computed summary metrics from filtered data
    const totalValuation = useMemo(() =>
        data.reduce((sum, r) => sum + (Number(r.onHand ?? 0) * Number(r.unitCost ?? 0)), 0),
        [data]);

    const fifoValuation = useMemo(() =>
        data.reduce((sum, r) => sum + (Number(r.onHand ?? 0) * Number(r.fifoUnitCost ?? r.unitCost ?? 0)), 0),
        [data]);

    const lifoValuation = useMemo(() =>
        data.reduce((sum, r) => sum + (Number(r.onHand ?? 0) * Number(r.lifoUnitCost ?? r.unitCost ?? 0)), 0),
        [data]);

    const categoryTotals = useMemo(() => {
        const map = {};
        data.forEach(r => {
            const cat = r.category || r.department || 'General';
            const val = Number(r.onHand ?? 0) * Number(r.unitCost ?? 0);
            map[cat] = (map[cat] || 0) + val;
        });
        return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);
    }, [data]);

    const warehouseDistribution = useMemo(() => {
        const map = {};
        data.forEach(r => {
            const val = Number(r.onHand ?? 0) * Number(r.unitCost ?? 0);
            map[r.warehouse] = (map[r.warehouse] || 0) + val;
        });
        const colors = ['#F5C742', '#5E5CE6', '#34d399', '#f87171', '#60a5fa'];
        return Object.entries(map).map(([name, val], i) => ({
            name,
            pct: totalValuation > 0 ? ((val / totalValuation) * 100).toFixed(1) : 0,
            color: colors[i % colors.length]
        }));
    }, [data, totalValuation]);

    const maxCatTotal = useMemo(() => Math.max(...categoryTotals.map(c => c.total), 1), [categoryTotals]);

    const toggleSort = (key, defaultDir = 'desc') => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key, dir: defaultDir };
        });
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key) return data;
        const sorted = [...data].sort((a, b) => {
            const va = a?.[sortConfig.key];
            const vb = b?.[sortConfig.key];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return va - vb;
            return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        });
        return sortConfig.dir === 'asc' ? sorted : sorted.reverse();
    }, [data, sortConfig]);

    const loadWarehouses = async () => {
        try {
            const res = await getWarehouses();
            setWarehousesList([{ id: 'All', name: 'All' }, ...res]);
        } catch (e) { console.error('Failed to load warehouses', e); }
    };

    const generateReport = async () => {
        setLoading(true);
        try {
            const fetched = await getStockValuationReport(null);
            setRawData(fetched || []);
        } catch (e) {
            console.error('Failed to fetch stock valuation report', e);
            toast.error('Failed to load valuation data.');
        } finally { setLoading(false); }
    };

    useEffect(() => { loadWarehouses(); generateReport(); }, []);

    const handleExportExcel = () => exportToExcel(data, reportColumns, 'Stock_Valuation_Report', { companyProfile: company, branch: activeBranch?.name || '' });
    const handleExportPdf = () => exportToPDF(data, reportColumns, 'Stock Valuation Report', 'Stock_Valuation_Report', { companyProfile: company, branch: activeBranch?.name || '' });

    const handlePrint = async () => {
        try {
            const templates = await getPrintTemplates();
            const defaultTemplate = templates.find(t => t.isDefault) || {};
            const html = generateReportPrintHtml(defaultTemplate, "Stock Valuation Report", reportColumns, data);
            printHtml(html);
        } catch (error) {
            console.error("Failed to print report:", error);
            const html = generateReportPrintHtml({}, "Stock Valuation Report", reportColumns, data);
            printHtml(html);
        }
    };

    const FilterSelect = ({ label, value, options, field }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#4b5563' }}>{label}</label>
            <div style={{ position: 'relative' }}>
                <select value={value} onChange={e => setFilters(p => ({ ...p, [field]: e.target.value }))} style={{ width: '100%', padding: '7px 28px 7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#f9fafb', appearance: 'none', outline: 'none', cursor: 'pointer' }}>
                    {options.map(o => <option key={o.id || o} value={o.id || o}>{o.name || o}</option>)}
                </select>
                <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#9ca3af', pointerEvents: 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
    );

    const SummaryCard = ({ label, value, sub, color, sortKey, defaultDir }) => {
        const isActive = sortKey && sortConfig.key === sortKey;
        return (
            <div
                onClick={() => sortKey && toggleSort(sortKey, defaultDir)}
                title={sortKey ? 'Click to sort table' : undefined}
                style={{
                    flex: 1,
                    background: '#fff',
                    border: `1px solid ${isActive ? color : '#e5e7eb'}`,
                    borderRadius: 14,
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    cursor: sortKey ? 'pointer' : 'default',
                    boxShadow: isActive ? '0 0 0 2px rgba(0,0,0,0.03)' : 'none'
                }}
            >
                <div>
                    <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</p>
                    <CurrencyAmount value={value} style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }} />
                    {sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>{sub}</p>}
                </div>
                <div style={{ color, opacity: 0.6 }}><FaArrowUp style={{ fontSize: 18 }} /></div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between">
                <span style={{ fontSize: 12, color: '#6b7280' }}>Filters / <span style={{ color: '#F5C742', fontWeight: 500 }}>Applied to the selected report: Stock Valuation</span></span>
            </div>

            <div className="bg-white border-b border-slate-100 px-3 sm:px-4 md:px-6 py-4 md:sticky md:top-[48px] z-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-x-5">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#4b5563' }}>Date From</label>
                        <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#f9fafb', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#4b5563' }}>Date To</label>
                        <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#f9fafb', outline: 'none' }} />
                    </div>
                    <FilterSelect label="Warehouse" value={filters.warehouse} options={warehousesList} field="warehouse" />
                    <FilterSelect label="Department" value={filters.department} options={departments} field="department" />
                    <FilterSelect label="Brand" value={filters.brand} options={brands} field="brand" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#4b5563' }}>Item / SKU</label>
                        <div style={{ position: 'relative' }}>
                            <input type="text" placeholder="Search item name / SKU / barcode..." value={filters.searchQuery} onChange={e => setFilters(p => ({ ...p, searchQuery: e.target.value }))} style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
                            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                    <FilterSelect label="Stock Condition" value={filters.stockCondition} options={['Positive only', 'All', 'Zero only', 'Negative only']} field="stockCondition" />
                    <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2 lg:col-span-2">
                        <button onClick={generateReport} style={{ padding: '8px 20px', background: '#F5C742', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {loading && <FaSync />} Generate
                        </button>
                        <ExportDropdown
                            onExportExcel={handleExportExcel}
                            onExportPdf={handleExportPdf}
                            onPrint={handlePrint}
                            disabled={data.length === 0 || loading}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-3 sm:p-4 md:p-6 flex flex-col gap-5">

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <SummaryCard label="Cost Valuation (Method)" value={totalValuation} sub={`${data.length} items — by configured cost method`} color="#F5C742" sortKey="stockValue" />
                    <SummaryCard label="FIFO Valuation" value={fifoValuation} sub="First-in first-out (oldest purchase cost)" color="#5E5CE6" sortKey="fifoUnitCost" />
                    <SummaryCard label="LIFO Valuation" value={lifoValuation} sub="Last-in first-out (latest purchase cost)" color="#f97316" sortKey="lifoUnitCost" />
                    <SummaryCard label="Retail Value" value={data.reduce((s, r) => s + (Number(r.onHand ?? 0) * Number(r.retailPrice ?? 0)), 0)} sub="Based on retail price" color="#34d399" sortKey="retailValue" />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Bar chart - Valuation by Category */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '18px 20px' }}>
                        <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#111827' }}>Valuation by Category</h4>
                        {categoryTotals.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No data</p>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
                                {categoryTotals.map(cat => {
                                    const heightPct = maxCatTotal > 0 ? (cat.total / maxCatTotal) * 100 : 0;
                                    return (
                                        <div key={cat.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>
                                                {cat.total >= 1000 ? `${(cat.total / 1000).toFixed(1)} k` : cat.total.toFixed(0)}
                                            </span>
                                            <div style={{ width: '100%', background: '#f3f4f6', borderRadius: 6, height: 112, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                                                <div style={{ width: '100%', height: `${heightPct}% `, background: 'linear-gradient(180deg, #F5C742, #F5A742)', borderRadius: 6, minHeight: 4 }} />
                                            </div>
                                            <span style={{ fontSize: 9, color: '#6b7280', textAlign: 'center', lineHeight: 1.2 }}>{cat.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Warehouse distribution */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '18px 20px' }}>
                        <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#111827' }}>Warehouse Distribution</h4>
                        {warehouseDistribution.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No data</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {warehouseDistribution.map(wh => (
                                    <div key={wh.name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#374151' }}>
                                            <span>{wh.name}</span><span>{wh.pct}%</span>
                                        </div>
                                        <div style={{ background: '#f3f4f6', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${wh.pct}% `, background: wh.color, borderRadius: 999 }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Stock Valuation Detail</h4>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>Cost × Quantity for each product.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '4px 10px' }}>{data.length} items</span>
                            <ExportDropdown
                                onExportExcel={handleExportExcel}
                                onExportPdf={handleExportPdf}
                                onPrint={handlePrint}
                                disabled={data.length === 0 || loading}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: 60, display: 'flex', justifyContent: 'center', color: '#9ca3af' }}>Loading...</div>
                    ) : data.length === 0 ? (
                        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No valuation data found. Check your stock movements.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead style={{ background: '#f9fafb' }}>
                                    <tr>
                                        {['SKU', 'Item', 'Category', 'Department', 'Brand', 'Warehouse', 'Batch No', 'Expiry', 'Cost Method', 'Qty', 'Unit Cost', 'FIFO Cost', 'LIFO Cost', 'Stock Value'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: ['Qty', 'Unit Cost', 'FIFO Cost', 'LIFO Cost', 'Stock Value'].includes(h) ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedData.map((row, i) => {
                                        const qty = Number(row.onHand ?? 0);
                                        const cost = Number(row.unitCost ?? 0);
                                        const val = qty * cost;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>{row.sku}</td>
                                                <td style={{ padding: '10px 12px', color: '#374151' }}>{row.item}</td>
                                                <td style={{ padding: '10px 12px' }}><span style={{ background: '#f3f4f6', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: '#374151' }}>{row.category || '-'}</span></td>
                                                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.department || '-'}</td>
                                                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.brand || '-'}</td>
                                                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.warehouse}</td>
                                                <td style={{ padding: '10px 12px', color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{row.batchNumber || '-'}</td>
                                                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.expiryDate || '-'}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ background: '#eff6ff', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
                                                        {row.costMethod ? row.costMethod.replace('_', ' ') : 'STANDARD'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{qty.toFixed(0)}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}><CurrencyAmount value={cost} /></td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}><CurrencyAmount value={row.fifoUnitCost ?? cost} /></td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}><CurrencyAmount value={row.lifoUnitCost ?? cost} /></td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#F5A742' }}><CurrencyAmount value={val} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer total */}
                    <div className="px-4 sm:px-5 py-4 bg-[#F5C742] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#78350f', textTransform: 'uppercase' }}>Total Stock Valuation</p>
                            <CurrencyAmount value={totalValuation} style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1c1917' }} />
                        </div>
                        <span style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#1c1917' }}>Per Configured Cost Method</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockValuationReport;
