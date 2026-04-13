import React, { useState, useEffect, useMemo } from 'react';
import { FaDownload, FaCog, FaBoxOpen, FaChevronLeft, FaChevronRight, FaSync } from 'react-icons/fa';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { getPrintTemplates } from '../../../api/printTemplateApi';
import { generateReportPrintHtml, printHtml } from '../../../utils/printGenerator';
import { getOutOfStockReport } from '../../../api/inventoryReportsApi';
import { getWarehouses } from '../../../api/warehouseApi';
import toast from 'react-hot-toast';

const PAGE_SIZE = 25;

const OutOfStockReport = () => {
    const [filters, setFilters] = useState({
        dateFrom: '', dateTo: '', warehouse: 'All',
        department: 'All', brand: 'All', searchQuery: ''
    });

    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [warehousesList, setWarehousesList] = useState([{ id: 'All', name: 'All' }]);
    const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });

    const departments = useMemo(() => ['All', ...new Set(rawData.map(r => r.department).filter(Boolean))], [rawData]);
    const brands = useMemo(() => ['All', ...new Set(rawData.map(r => r.brand).filter(Boolean))], [rawData]);

    const reportColumns = [
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Item', key: 'item', width: 35 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Warehouse', key: 'warehouse', width: 25 },
        { header: 'Last Sold', key: 'lastSold', width: 20 },
        { header: 'Last Received', key: 'lastReceived', width: 20 }
    ];

    const data = useMemo(() => {
        let d = rawData;
        if (filters.warehouse !== 'All') {
            const wName = warehousesList.find(w => String(w.id) === String(filters.warehouse))?.name;
            if (wName) d = d.filter(r => r.warehouse === wName);
        }
        if (filters.department !== 'All') d = d.filter(r => r.department === filters.department);
        if (filters.brand !== 'All') d = d.filter(r => r.brand === filters.brand);
        if (filters.searchQuery) {
            const q = filters.searchQuery.toLowerCase();
            d = d.filter(r =>
                (r.sku && r.sku.toLowerCase().includes(q)) ||
                (r.item && r.item.toLowerCase().includes(q))
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
        return d;
    }, [rawData, filters, warehousesList]);

    const parseDate = (val) => {
        if (!val || val === 'N/A') return null;
        const t = new Date(val).getTime();
        return Number.isNaN(t) ? null : t;
    };

    const oldestLastSold = useMemo(() => {
        const dates = data.map(r => parseDate(r.lastSold)).filter(v => v != null);
        if (dates.length === 0) return 'N/A';
        return new Date(Math.min(...dates)).toLocaleDateString();
    }, [data]);

    const oldestLastReceived = useMemo(() => {
        const dates = data.map(r => parseDate(r.lastReceived)).filter(v => v != null);
        if (dates.length === 0) return 'N/A';
        return new Date(Math.min(...dates)).toLocaleDateString();
    }, [data]);

    const toggleSort = (key, defaultDir = 'asc') => {
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

            if (sortConfig.key === 'lastSold' || sortConfig.key === 'lastReceived') {
                const ta = parseDate(va);
                const tb = parseDate(vb);
                if (ta == null && tb == null) return 0;
                if (ta == null) return 1;
                if (tb == null) return -1;
                return ta - tb;
            }

            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return va - vb;
            return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        });
        return sortConfig.dir === 'asc' ? sorted : sorted.reverse();
    }, [data, sortConfig]);

    const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
    const pagedData = useMemo(() => sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sortedData, page]);

    // reset to page 1 whenever filters change
    useEffect(() => { setPage(1); }, [filters]);

    const loadWarehouses = async () => {
        try {
            const res = await getWarehouses();
            setWarehousesList([{ id: 'All', name: 'All' }, ...res]);
        } catch (e) { console.error('Failed to load warehouses', e); }
    };

    const loadPrintTemplates = async () => {
        try {
            const res = await getPrintTemplates('report');
            setPrintTemplates(res);
        } catch (e) {
            console.error('Failed to load print templates', e);
            toast.error('Failed to load print templates.');
        }
    };

    const generateReport = async () => {
        setLoading(true);
        try {
            const fetched = await getOutOfStockReport(null);
            setRawData(fetched || []);
        } catch (e) {
            console.error('Failed to fetch out of stock report', e);
            toast.error('Failed to load out of stock data.');
        } finally { setLoading(false); }
    };

    useEffect(() => { loadWarehouses(); generateReport(); }, []);

    const handlePrint = async () => {
        try {
            const templates = await getPrintTemplates();
            const defaultTemplate = templates.find(t => t.isDefault) || {};
            const html = generateReportPrintHtml(defaultTemplate, "Out of Stock Report", reportColumns, data);
            printHtml(html);
        } catch (error) {
            console.error('Error during printing:', error);
            const html = generateReportPrintHtml({}, "Out of Stock Report", reportColumns, data);
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

    const StatCard = ({ label, value, sub, sortKey, defaultDir }) => {
        const isActive = sortKey && sortConfig.key === sortKey;
        return (
            <div
                onClick={() => sortKey && toggleSort(sortKey, defaultDir)}
                title={sortKey ? 'Click to sort table' : undefined}
                style={{
                    flex: 1,
                    background: '#fff',
                    border: `1px solid ${isActive ? '#F5C742' : '#e5e7eb'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    cursor: sortKey ? 'pointer' : 'default',
                    boxShadow: isActive ? '0 0 0 2px rgba(245,199,66,0.2)' : 'none'
                }}
            >
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{value}</span>
                {sub && <span style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</span>}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between">
                <span style={{ fontSize: 12, color: '#6b7280' }}>Filters / <span style={{ color: '#F5C742', fontWeight: 500 }}>Applied to the selected report: Out of Stock</span></span>
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
                            <input type="text" placeholder="Search item name / SKU..." value={filters.searchQuery} onChange={e => setFilters(p => ({ ...p, searchQuery: e.target.value }))} style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
                            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2 lg:col-span-2">
                        <button onClick={generateReport} disabled={loading} style={{ padding: '8px 20px', background: '#F5C742', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1 }}>
                            {loading && <FaSync />} Generate
                        </button>
                        <ExportDropdown
                            onExportExcel={() => exportToExcel(data, reportColumns, 'Out_Of_Stock_Report')}
                            onExportPdf={() => exportToPDF(data, reportColumns, 'Out of Stock Report', 'Out_Of_Stock_Report')}
                            onPrint={handlePrint}
                            disabled={data.length === 0 || loading}
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-4 md:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
                    <StatCard label="Total Items" value={data.length} sub="Sort by item" sortKey="item" />
                    <StatCard label="Oldest Last Sold" value={oldestLastSold} sub="Sort by last sold" sortKey="lastSold" defaultDir="asc" />
                    <StatCard label="Oldest Last Received" value={oldestLastReceived} sub="Sort by last received" sortKey="lastReceived" defaultDir="asc" />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Out of Stock</h4>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>Zero stock items with last sold / last received signals.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '4px 10px' }}>{data.length} items</span>
                            <ExportDropdown
                                onExportExcel={() => exportToExcel(data, reportColumns, 'Out_Of_Stock_Report')}
                                onExportPdf={() => exportToPDF(data, reportColumns, 'Out of Stock Report', 'Out_Of_Stock_Report')}
                                onPrint={handlePrint}
                                disabled={data.length === 0 || loading}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: 60, display: 'flex', justifyContent: 'center', color: '#9ca3af' }}>Loading...</div>
                    ) : data.length === 0 ? (
                        <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9ca3af', gap: 12 }}>
                            <FaBoxOpen style={{ fontSize: 48, color: '#e5e7eb' }} />
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#16a34a' }}>All products are in stock!</p>
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>No products found with zero or negative stock.</p>
                            </div>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead style={{ background: '#f9fafb' }}>
                                    <tr>{['SKU', 'Item', 'Department', 'Brand', 'Warehouse', 'Last Sold', 'Last Received'].map(h =>
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                                    )}</tr>
                                </thead>
                                <tbody>
                                    {pagedData.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>{row.sku}</td>
                                            <td style={{ padding: '10px 12px', color: '#374151' }}>{row.item}</td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.department || '-'}</td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.brand || '-'}</td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.warehouse}</td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.lastSold || 'N/A'}</td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.lastReceived || 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {!loading && data.length > 0 && (
                        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                                Showing {Math.min((page - 1) * PAGE_SIZE + 1, data.length)}-{Math.min(page * PAGE_SIZE, data.length)} of {data.length} items
                            </span>
                            <div className="flex flex-wrap gap-2 items-center justify-end">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', background: page === 1 ? '#f9fafb' : '#fff', color: page === 1 ? '#d1d5db' : '#374151', fontWeight: 500 }}
                                >
                                    <FaChevronLeft style={{ fontSize: 10 }} /> Prev
                                </button>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '0 6px' }}>{page} / {totalPages}</span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', background: page === totalPages ? '#f9fafb' : '#fff', color: page === totalPages ? '#d1d5db' : '#374151', fontWeight: 500 }}
                                >
                                    Next <FaChevronRight style={{ fontSize: 10 }} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OutOfStockReport;
