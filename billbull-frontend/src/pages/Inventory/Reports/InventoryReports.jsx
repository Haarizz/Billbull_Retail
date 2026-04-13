import React, { useState } from 'react';
import { FaChartBar, FaExclamationTriangle, FaBoxOpen, FaChartPie, FaSearch, FaBars, FaTimes } from 'react-icons/fa';
import StockOnHandReport from './StockOnHandReport';
import LowStockReport from './LowStockReport';
import OutOfStockReport from './OutOfStockReport';
import StockValuationReport from './StockValuationReport';

const reports = [
    {
        id: 'soh',
        title: 'Stock on Hand',
        description: 'Current available qty by warehouse / category / item.',
        badge: 'Chart',
        badgeColor: 'text-orange-700 bg-orange-50 border-orange-200',
        icon: <FaChartBar className="text-yellow-500" />,
        component: <StockOnHandReport />,
    },
    {
        id: 'low_stock',
        title: 'Low Stock / Reorder',
        description: 'Items below min stock + suggested purchase qty.',
        badge: 'Table',
        badgeColor: 'text-blue-700 bg-blue-50 border-blue-200',
        icon: <FaExclamationTriangle className="text-blue-500" />,
        component: <LowStockReport />,
    },
    {
        id: 'out_of_stock',
        title: 'Out of Stock',
        description: 'Zero stock items with last sold / last received signals.',
        badge: 'Alert',
        badgeColor: 'text-red-700 bg-red-50 border-red-200',
        icon: <FaBoxOpen className="text-red-500" />,
        component: <OutOfStockReport />,
    },
    {
        id: 'stock_valuation',
        title: 'Stock Valuation',
        description: 'Valuation by Avg / FIFO / Last cost with totals.',
        badge: 'Finance',
        badgeColor: 'text-green-700 bg-green-50 border-green-200',
        icon: <FaChartPie className="text-green-500" />,
        component: <StockValuationReport />,
    },
];

const InventoryReports = () => {
    const [activeId, setActiveId] = useState('soh');
    const [search, setSearch] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const filtered = reports.filter(r =>
        r.title.toLowerCase().includes(search.toLowerCase())
    );
    const activeReport = reports.find(r => r.id === activeId);

    const handleSelect = (id) => {
        setActiveId(id);
        setSidebarOpen(false);
    };

    const SidebarContent = () => (
        <>
            <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-bold text-gray-900">Inventory Reports</h2>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                    >
                        <FaTimes />
                    </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">Choose a report, set filters, generate and export.</p>
                <div className="relative">
                    <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                    <input
                        placeholder="Search reports..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs outline-none bg-gray-50 focus:border-yellow-400"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                <div className="flex items-center justify-between px-2 pb-2">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Stock &amp; Availability</span>
                    <span className="text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">4 reports</span>
                </div>

                {filtered.map(report => {
                    const isActive = activeId === report.id;
                    return (
                        <button
                            key={report.id}
                            onClick={() => handleSelect(report.id)}
                            className={`w-full text-left rounded-lg p-2.5 mb-1 border transition-all relative ${
                                isActive
                                    ? 'border-yellow-400 bg-yellow-50/60 shadow-sm'
                                    : 'border-transparent bg-white hover:bg-gray-50'
                            }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg bg-yellow-400" />
                            )}
                            <div className="flex items-start gap-2 pl-1">
                                <div className="mt-0.5 text-sm">{report.icon}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className={`text-xs font-semibold truncate ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{report.title}</span>
                                        <span className={`shrink-0 text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded border ${report.badgeColor}`}>{report.badge}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{report.description}</p>
                                    {isActive && (
                                        <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-medium text-amber-800 bg-yellow-100 border border-yellow-300 rounded-full px-2 py-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                            Viewing
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </>
    );

    return (
        <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — desktop: always visible, mobile: slide-in drawer */}
            <aside className={`
                fixed md:static inset-y-0 left-0 z-50 md:z-auto
                w-72 md:w-64 lg:w-72 shrink-0
                bg-white border-r border-gray-200
                flex flex-col h-full
                transition-transform duration-200
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <SidebarContent />
            </aside>

            {/* Main content */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                        <FaBars className="text-sm" />
                    </button>
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{activeReport?.title}</div>
                        <div className="text-xs text-gray-500">Inventory Reports</div>
                    </div>
                </div>

                {/* Report content */}
                <div className="flex-1 overflow-hidden bg-white">
                    {activeReport?.component}
                </div>
            </div>
        </div>
    );
};

export default InventoryReports;
