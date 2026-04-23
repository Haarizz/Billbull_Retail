import React, { useState, useMemo, useEffect } from 'react';
import {
    Package, FileText, History, Download, Plus, Search, Filter, ChevronDown, Truck, MapPin,
    AlertTriangle, Check, Clock, User, Calendar, ArrowRight, Save, Send, CheckCircle2,
    AlertCircle, X, MoreHorizontal, Eye, Edit, Printer, RefreshCw, Copy, Sparkles, Lightbulb, Info, List, ShieldCheck
} from 'lucide-react';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';

// ==========================================
// CONFIGURATION
// ==========================================

const STOCK_TRANSFER_COLUMNS = [
    { header: 'Transfer No', key: 'transferNo', width: 20 },
    { header: 'Date', key: 'transferDate', width: 15 },
    { header: 'From Warehouse', key: 'fromWarehouseName', width: 25 },
    { header: 'To Warehouse', key: 'toWarehouseName', width: 25 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Requested By', key: 'requestedBy', width: 20 },
    { header: 'Total Value', key: 'totalTransferValue', width: 15 }
];
import {
    getWarehouses, getWarehouseProductStock, getAggregateLocationStock,
    getWarehouseZones, getZoneLocators, getLocatorBins
} from '../../../api/warehouseApi';

import {
    getStockTransfers, createStockTransfer, updateStockTransfer,
    deleteStockTransfer, sendStockTransfer, receiveStockTransfer,
    requestStockTransferApproval, cancelStockTransfer, getStockTransferCostPreview
} from '../../../api/stockTransferApi';
import { getCompanyProfile } from '../../../api/companyProfileApi';
import { toast } from 'react-hot-toast';
import ProductSelector from '../../../components/ProductSelector';
import { printHtml } from '../../../utils/printGenerator';
import { getImageUrl } from '../../../utils/urlUtils';

// ==========================================
// CONSTANTS
// ==========================================

const transferReasons = ["Stock Rebalancing", "Low Stock Alert", "Seasonal Demand", "Store Opening", "Return to Warehouse", "Quality Issue", "Other"];
const transportModes = ["Vehicle", "Courier", "Manual", "Internal"];

const parseFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const toNumber = (value, fallback = 0) => {
    const parsed = parseFiniteNumber(value);
    return parsed ?? fallback;
};

const formatCurrency = (value) => `AED ${toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;

const recalculateItemFinancials = (item) => {
    const quantity = toNumber(item.quantity);
    const unitCost = parseFiniteNumber(item.unitCost);
    return {
        ...item,
        unitCost,
        lineValue: unitCost == null ? null : Number((unitCost * quantity).toFixed(2))
    };
};

const applyCostPreviewToItems = (targetItems, previewItems = []) => {
    const previewMap = new Map(
        (previewItems || []).map(item => [Number(item.productId), item])
    );

    return targetItems.map(item => {
        const preview = previewMap.get(Number(item.productId));
        if (!preview) {
            return recalculateItemFinancials(item);
        }

        return recalculateItemFinancials({
            ...item,
            unitCost: preview.costAvailable ? parseFiniteNumber(preview.unitCost) : null,
            costSource: preview.costSource || null,
            costAvailable: Boolean(preview.costAvailable)
        });
    });
};

const calculateTransferTotals = (items, transportCharge, additionalCharges) => {
    const inventoryValue = items.reduce((sum, item) => sum + toNumber(item.lineValue), 0);
    const qty = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
    const totalCharges = toNumber(transportCharge) + toNumber(additionalCharges);
    return {
        qty,
        items: items.length,
        inventoryValue,
        totalCharges,
        totalValue: inventoryValue + totalCharges,
        avgCostPerUnit: qty > 0 ? inventoryValue / qty : 0,
        warningsCount: items.reduce((sum, item) => sum + (item.status === 'Insufficient' ? 1 : 0), 0),
        missingCostCount: items.reduce((sum, item) => sum + (item.productId && !item.costAvailable ? 1 : 0), 0)
    };
};

// ==========================================
// HELPER COMPONENTS
// ==========================================

const StatusBadge = ({ status }) => {
    const getStatusStyle = () => {
        switch (status) {
            case "RECEIVED":
            case "Completed": return "bg-emerald-100 text-emerald-700 border-emerald-200";
            case "SENT":
            case "In-Transit": return "bg-blue-100 text-blue-700 border-blue-200";
            case "PENDING_APPROVAL":
            case "Pending Approval": return "bg-orange-100 text-orange-700 border-orange-200";
            case "DRAFT":
            case "Draft": return "bg-slate-100 text-slate-600 border-slate-200";
            case "CANCELLED":
            case "Cancelled": return "bg-red-100 text-red-700 border-red-200";
            default: return "bg-slate-100 text-slate-600 border-slate-200";
        }
    };
    const getLabel = () => {
        if (status === "SENT") return "Sent (In-Transit)";
        if (status === "RECEIVED") return "Received";
        if (status === "PENDING_APPROVAL") return "Pending Approval";
        return status;
    };
    return (
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded border uppercase inline-flex items-center gap-1 ${getStatusStyle()}`}>
            {(status === "Completed" || status === "RECEIVED") && <Check className="h-3 w-3" />}
            {(status === "In-Transit" || status === "SENT") && <Truck className="h-3 w-3" />}
            {getLabel()}
        </span>
    );
};

const ViewTransferModal = ({ isOpen, onClose, data, onPrint }) => {
    if (!isOpen || !data) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl mx-4 max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                            <Package className="text-[#F5C742] h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold text-xl text-slate-800 tracking-tight">{data.transferNo}</h3>
                                <StatusBadge status={data.status} />
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-1.5">
                                <Calendar size={12} /> {data.transferDate}
                                <span className="w-1 h-1 bg-slate-300 rounded-full mx-1" />
                                <User size={12} /> Requested by {data.requestedBy || 'System'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 shadow-sm border border-transparent hover:border-slate-100">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Path & Progress */}
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex items-center justify-between">
                        <div className="flex-1 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Source Warehouse</p>
                            <div className="inline-flex flex-col items-center">
                                <span className="text-sm font-bold text-slate-800">{data.fromWarehouseName}</span>
                                <span className="text-[10px] text-slate-400 mt-0.5 font-mono">{data.fromZoneName} / {data.fromLocatorName}</span>
                            </div>
                        </div>
                        <div className="px-8 flex flex-col items-center gap-2">
                            <ArrowRight size={24} className="text-[#F5C742] opacity-50" />
                            <span className="text-[9px] font-bold text-[#F5C742] uppercase bg-[#F5C742]/10 px-2 py-0.5 rounded-full">Status: {data.status}</span>
                        </div>
                        <div className="flex-1 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Destination Warehouse</p>
                            <div className="inline-flex flex-col items-center">
                                <span className="text-sm font-bold text-slate-800">{data.toWarehouseName}</span>
                                <span className="text-[10px] text-slate-400 mt-0.5 font-mono">{data.toZoneName} / {data.toLocatorName}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <SectionHeader icon={Info} title="Movement Information" />
                            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Reason</p>
                                    <p className="text-xs font-semibold text-slate-700">{data.reason || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Reference Doc</p>
                                    <p className="text-xs font-mono font-bold text-blue-600">{data.referenceDoc || 'None'}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Remarks</p>
                                    <p className="text-xs text-slate-600 italic leading-relaxed">{data.remarks || 'No additional remarks provided for this transfer.'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <SectionHeader icon={Truck} title="Logistics Details" />
                            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Driver</p>
                                    <p className="text-xs font-bold text-slate-700">{data.driverName || 'Not Assigned'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Vehicle No</p>
                                    <p className="text-xs font-bold text-slate-700 font-mono tracking-tight">{data.vehicleNo || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Dispatch Date</p>
                                    <p className="text-xs font-bold text-slate-700">{data.dispatchDate || 'Pending'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Est. Arrival</p>
                                    <p className="text-xs font-bold text-slate-700">{data.arrivalDate || 'Pending'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-100/60">
                            <p className="text-[10px] font-bold text-blue-500 uppercase mb-1">Inventory Value</p>
                            <p className="text-xl font-bold text-slate-800">{formatCurrency(data.inventoryValue)}</p>
                        </div>
                        <div className="bg-orange-50/60 rounded-xl p-4 border border-orange-100/60">
                            <p className="text-[10px] font-bold text-orange-500 uppercase mb-1">Logistics Charges</p>
                            <p className="text-xl font-bold text-slate-800">{formatCurrency(toNumber(data.transportCharge) + toNumber(data.additionalCharges))}</p>
                        </div>
                        <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-100/60">
                            <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Total Transfer Value</p>
                            <p className="text-xl font-bold text-slate-800">{formatCurrency(data.totalTransferValue)}</p>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <SectionHeader icon={List} title="Transfer Manifest" />
                            <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{data.items?.length || 0} Line Items</span>
                        </div>
                        <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px]">
                                    <tr>
                                        <th className="px-6 py-3">Product</th>
                                        <th className="px-4 py-3">Batch/Lot</th>
                                        <th className="px-4 py-3 text-center">Qty</th>
                                        <th className="px-4 py-3 text-center">UoM</th>
                                        <th className="px-4 py-3 text-right">Unit Cost</th>
                                        <th className="px-4 py-3 text-right">Line Value</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {data.items?.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-800">{item.productName}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{item.productCode}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-500">{item.batchNumber || '---'}</td>
                                            <td className="px-4 py-3 text-center font-bold text-slate-800">{item.quantity}</td>
                                            <td className="px-4 py-3 text-center"><span className="bg-slate-100 px-2 py-0.5 rounded font-bold">{item.uom}</span></td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-700">{item.unitCostAtSend != null ? formatCurrency(item.unitCostAtSend) : 'Pending'}</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(item.receivedLineValue ?? item.lineValue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/30">
                    <button onClick={onClose} className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg h-10 text-xs font-bold hover:bg-white transition-all">Close Details</button>
                    {(data.status === 'SENT' || data.status === 'RECEIVED') && (
                        <button onClick={() => onPrint(data)} className="px-6 py-2 bg-slate-900 text-white rounded-lg h-10 text-xs font-bold hover:bg-slate-800 shadow-md shadow-slate-200 transition-all flex items-center gap-2">
                            <Printer size={14} className="text-[#F5C742]" /> Print Gate Pass
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const SectionHeader = ({ icon: Icon, title, children }) => (
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[#F5C742]" />
            <h3 className="font-semibold text-sm text-slate-800">{title}</h3>
        </div>
        {children}
    </div>
);

const ApprovalStepper = ({ currentStatus }) => {
    const steps = [
        { status: "DRAFT", label: "Draft", icon: FileText, desc: "Order created & saved" },
        { status: "PENDING_APPROVAL", label: "Approval", icon: Clock, desc: "Manager review" },
        { status: "SENT", label: "Sent", icon: Truck, desc: "Dispatch confirmed" },
        { status: "RECEIVED", label: "Received", icon: CheckCircle2, desc: "Destination stock update" }
    ];

    const getStepStatus = (stepStatus, index) => {
        const statusOrder = ["DRAFT", "PENDING_APPROVAL", "SENT", "RECEIVED"];
        const currentIndex = statusOrder.indexOf(currentStatus);
        const stepIndex = statusOrder.indexOf(stepStatus);

        if (currentStatus === "CANCELLED") return "cancelled";
        if (stepIndex < currentIndex) return "completed";
        if (stepIndex === currentIndex) return "active";
        return "upcoming";
    };

    return (
        <div className="space-y-4">
            {steps.map((step, index) => {
                const status = getStepStatus(step.status, index);
                return (
                    <div key={step.status} className="flex gap-3 h-12">
                        <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${status === 'completed' ? "bg-emerald-500 border-emerald-500 text-white" :
                                status === 'active' ? "bg-[#F5C742] border-[#F5C742] text-slate-900 shadow-[0_0_10px_rgba(245,199,66,0.5)]" :
                                    "bg-white border-slate-200 text-slate-400"
                                }`}>
                                {status === 'completed' ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                            </div>
                            {index < steps.length - 1 && (
                                <div className={`w-0.5 flex-1 my-1 ${status === 'completed' ? "bg-emerald-500" : "bg-slate-200"}`} />
                            )}
                        </div>
                        <div className="flex-1">
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${status === 'active' ? "text-slate-800" : "text-slate-400"}`}>{step.label}</div>
                            <div className="text-[10px] text-slate-500">{status === 'active' ? step.desc : ''}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const StatCard = ({ label, value, subtext, icon: Icon, color = "blue", type = "default" }) => {
    const colorClasses = {
        blue: "text-blue-600 bg-blue-50",
        emerald: "text-emerald-600 bg-emerald-50",
        orange: "text-orange-600 bg-orange-50",
        rose: "text-rose-600 bg-rose-50"
    };

    return (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
                <div className={`p-1.5 rounded-md ${colorClasses[color]}`}>
                    <Icon className="h-3 w-3" />
                </div>
            </div>
            <div className="text-lg font-bold text-slate-800 tracking-tight">{value}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                {subtext}
            </div>
        </div>
    );
};

const ChecklistItem = ({ checked, label }) => (
    <div className="flex items-center gap-2 text-[10px] font-medium text-slate-600 py-1.5 border-b border-slate-50 last:border-0">
        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${checked ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
            {checked ? <Check className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
        </div>
        <span className={checked ? "line-through text-slate-400" : ""}>{label}</span>
    </div>
);

// ==========================================
// TRANSFER HISTORY VIEW (Enhanced)
// ==========================================

const TransferHistoryView = ({ data, warehouses, onView, onSend, onPrint }) => {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-slate-400" />
                    <h3 className="font-bold text-slate-800">Transfer Records</h3>
                </div>
                <div className="flex gap-2">
                    <ExportDropdown
                        onExportExcel={() => exportToExcel(data, STOCK_TRANSFER_COLUMNS, 'StockTransfers')}
                        onExportPdf={() => exportToPDF(data, STOCK_TRANSFER_COLUMNS, 'Stock Transfer Records', 'StockTransfers')}
                    />
                    <div className="relative">
                        <input type="text" placeholder="Search transfers..." className="h-9 w-64 bg-slate-50 border border-slate-200 rounded-lg px-9 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-[#F5C742] transition-all" />
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4">Transfer No</th>
                            <th className="px-4 py-4">Date</th>
                            <th className="px-4 py-4">Path (From → To)</th>
                            <th className="px-4 py-4 text-center">Items</th>
                            <th className="px-4 py-4 text-center">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {data.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-mono font-bold text-slate-800 text-xs">{row.transferNo}</span>
                                        <span className="text-[10px] text-slate-400">{row.referenceNo || 'No Reference'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                        <Calendar size={12} className="text-slate-400" />
                                        {row.transferDate}
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-700">{row.fromWarehouseName}</span>
                                        <ArrowRight size={12} className="text-[#F5C742]" />
                                        <span className="text-xs font-bold text-slate-700">{row.toWarehouseName}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-center">
                                    <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-1 rounded-md">
                                        {row.items?.length || 0} Products
                                    </span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                    <StatusBadge status={row.status} />
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => onView(row)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all">
                                            <Eye size={16} />
                                        </button>
                                        {row.status === "DRAFT" && (
                                            <button
                                                onClick={() => onSend(row.id)}
                                                className="h-8 px-3 bg-slate-900 text-white border border-slate-900 rounded-lg text-[10px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                                            >
                                                <Send size={12} className="text-[#F5C742]" /> Send
                                            </button>
                                        )}
                                        <button onClick={() => onPrint(row)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all opacity-0 group-hover:opacity-100">
                                            <Printer size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ==========================================
// RECEIVE TRANSFER VIEW (Enhanced)
// ==========================================

const ReceiveTransferView = ({ data, onReceive }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.map((transfer) => (
                <div key={transfer.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group border-l-4 border-l-[#F5C742]">
                    <div className="p-5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Incoming Transfer</span>
                                <h3 className="text-sm font-bold text-slate-800 font-mono mt-0.5">{transfer.transferNo}</h3>
                            </div>
                            <StatusBadge status={transfer.status} />
                        </div>

                        <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between mb-4 border border-slate-100">
                            <div className="text-center flex-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold">From</p>
                                <p className="text-xs font-bold text-slate-700 truncate px-2">{transfer.fromWarehouseName}</p>
                            </div>
                            <div className="px-2">
                                <ArrowRight size={14} className="text-[#F5C742]" />
                            </div>
                            <div className="text-center flex-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold">To</p>
                                <p className="text-xs font-bold text-slate-700 truncate px-2">{transfer.toWarehouseName}</p>
                            </div>
                        </div>

                        <div className="space-y-3 mb-5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Items:</span>
                                <span className="font-bold text-slate-700">{transfer.items?.length || 0} Products</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Transfer Value:</span>
                                <span className="font-bold text-slate-700">{formatCurrency(transfer.totalTransferValue)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Sent Date:</span>
                                <span className="font-bold text-slate-700">{transfer.transferDate}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => onReceive(transfer.id)}
                            className="w-full h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-slate-800 shadow-md shadow-slate-200 transition-all active:scale-95"
                        >
                            <Download size={14} className="text-[#F5C742]" /> Confirm Receipt
                        </button>
                    </div>
                </div>
            ))}
            {data.length === 0 && (
                <div className="col-span-full bg-white border border-slate-200 border-dashed rounded-xl p-20 flex flex-col items-center gap-4 text-slate-400">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <Truck size={32} className="text-slate-200 stroke-[1]" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-slate-500">No incoming transfers found</p>
                        <p className="text-xs text-slate-400 mt-1">Transfers marked as 'Sent' will appear here for receipt confirmation.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// ==========================================
// CREATE TRANSFER VIEW (Enhanced)
// ==========================================

const CreateTransferView = ({ warehouses, onSubmit }) => {
    const [formData, setFormData] = useState({
        transferNo: `TRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        referenceDoc: "",
        transferDate: new Date().toISOString().split('T')[0],
        reason: "",
        requestedBy: "Admin",
        remarks: "",
        fromWarehouseId: "",
        fromZoneId: "",
        fromLocatorId: "",
        fromBinId: "",
        toWarehouseId: "",
        toZoneId: "",
        toLocatorId: "",
        toBinId: "",
        transportMode: "Vehicle",
        vehicleNo: "",
        driverName: "",
        status: "DRAFT",
        dispatchDate: "",
        arrivalDate: "",
        transportCharge: 0,
        additionalCharges: 0,
        autoAllocateOnReceipt: true // Informational only for Phase-1
    });

    const [items, setItems] = useState([]);
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

    // Dynamic Location State
    const [fromZones, setFromZones] = useState([]);
    const [fromLocators, setFromLocators] = useState([]);
    const [fromBins, setFromBins] = useState([]);

    const [toZones, setToZones] = useState([]);
    const [toLocators, setToLocators] = useState([]);
    const [toBins, setToBins] = useState([]);
    const [aggregateStock, setAggregateStock] = useState({ fromOnHand: 0, toOnHand: 0 });

    // Fetching Logic
    useEffect(() => {
        if (formData.fromWarehouseId) {
            getWarehouseZones(formData.fromWarehouseId).then(setFromZones);
            setFromLocators([]); setFromBins([]);
            setFormData(prev => ({ ...prev, fromZoneId: "", fromLocatorId: "", fromBinId: "" }));
            // Refresh stock for all items
            refreshAllItemsStock();
        }
    }, [formData.fromWarehouseId]);

    // Trigger stock refresh when any source location field changes
    useEffect(() => {
        if (formData.fromWarehouseId) {
            refreshAllItemsStock();
        }
    }, [formData.fromZoneId, formData.fromLocatorId, formData.fromBinId, formData.toWarehouseId, formData.toZoneId, formData.toLocatorId, formData.toBinId]);

    useEffect(() => {
        if (formData.fromZoneId) {
            getZoneLocators(formData.fromZoneId).then(setFromLocators);
            setFromBins([]);
            setFormData(prev => ({ ...prev, fromLocatorId: "", fromBinId: "" }));
        }
    }, [formData.fromZoneId]);

    useEffect(() => {
        if (formData.fromLocatorId) {
            getLocatorBins(formData.fromLocatorId).then(setFromBins);
            setFormData(prev => ({ ...prev, fromBinId: "" }));
        }
    }, [formData.fromLocatorId]);

    useEffect(() => {
        if (formData.toWarehouseId) {
            getWarehouseZones(formData.toWarehouseId).then(setToZones);
            setToLocators([]); setToBins([]);
            setFormData(prev => ({ ...prev, toZoneId: "", toLocatorId: "", toBinId: "" }));
        }
    }, [formData.toWarehouseId]);

    useEffect(() => {
        if (formData.toZoneId) {
            getZoneLocators(formData.toZoneId).then(setToLocators);
            setToBins([]);
            setFormData(prev => ({ ...prev, toLocatorId: "", toBinId: "" }));
        }
    }, [formData.toZoneId]);

    useEffect(() => {
        if (formData.toLocatorId) {
            getLocatorBins(formData.toLocatorId).then(setToBins);
            setFormData(prev => ({ ...prev, toBinId: "" }));
        }
    }, [formData.toLocatorId]);

    const loadCostPreview = async (targetItems, warehouseId) => {
        if (!targetItems.length) return [];

        if (!warehouseId) {
            return targetItems.map(item => recalculateItemFinancials({
                ...item,
                unitCost: null,
                costSource: null,
                costAvailable: false
            }));
        }

        try {
            const preview = await getStockTransferCostPreview(
                warehouseId,
                targetItems.map(item => Number(item.productId)).filter(Boolean)
            );
            return applyCostPreviewToItems(targetItems, preview?.items || []);
        } catch (error) {
            console.error("Failed to load stock transfer cost preview:", error);
            return targetItems.map(item => recalculateItemFinancials({
                ...item,
                unitCost: null,
                costSource: null,
                costAvailable: false
            }));
        }
    };

    const refreshAllItemsStock = async () => {
        const { fromWarehouseId, fromZoneId, fromLocatorId, fromBinId, toWarehouseId, toZoneId, toLocatorId, toBinId } = formData;
        if (!fromWarehouseId) return;

        // 1. Fetch Location Aggregates (Independent of selected items)
        try {
            const fromAggStock = await getAggregateLocationStock(fromWarehouseId, {
                zoneId: fromZoneId,
                locatorId: fromLocatorId,
                binId: fromBinId
            });

            let toAggStock = 0;
            if (toWarehouseId) {
                toAggStock = await getAggregateLocationStock(toWarehouseId, {
                    zoneId: toZoneId,
                    locatorId: toLocatorId,
                    binId: toBinId
                });
            }
            setAggregateStock({ fromOnHand: fromAggStock, toOnHand: toAggStock });
        } catch (e) { console.error("Error fetching aggregate stock", e); }

        // 2. Fetch Selected Items Stock
        const updatedItems = await Promise.all(items.map(async (item) => {
            if (item.productId) {
                try {
                    const stock = await getWarehouseProductStock(fromWarehouseId, item.productId, {
                        zoneId: fromZoneId,
                        locatorId: fromLocatorId,
                        binId: fromBinId
                    });

                    let destStock = 0;
                    if (toWarehouseId) {
                        try {
                            destStock = await getWarehouseProductStock(toWarehouseId, item.productId, {
                                zoneId: toZoneId,
                                locatorId: toLocatorId,
                                binId: toBinId
                            });
                        } catch (e) { }
                    }

                    return {
                        ...item,
                        available: stock,
                        destAvailable: destStock,
                        status: item.quantity > 0 ? (item.quantity <= stock ? "Valid" : "Insufficient") : "Valid"
                    };
                } catch (e) {
                    return { ...item, available: 0, destAvailable: 0, status: "Error" };
                }
            }
            return item;
        }));

        const pricedItems = await loadCostPreview(updatedItems, fromWarehouseId);
        setItems(pricedItems);
    };

    const handleAddSingleProduct = async (productData) => {
        const exists = items.find(item => Number(item.productId) === Number(productData.id));
        if (exists) {
            toast.error("Product already added to the list");
            return;
        }

        const newItem = {
            id: Date.now(),
            productId: productData.id,
            productCode: productData.code,
            productName: productData.name,
            uom: productData.uom || "PCS",
            category: typeof productData.category === 'object' ? productData.category?.name : (productData.category || 'General'),
            brand: typeof productData.brand === 'object' ? productData.brand?.name : (productData.brand || 'BillBull'),
            available: 0,
            quantity: 1,
            batchNumber: "",
            status: "Pending",
            unitCost: null,
            lineValue: null,
            costSource: null,
            costAvailable: false
        };

        const newItems = [...items, newItem];
        setItems(newItems);
        setIsProductSelectorOpen(false);

        // Fetch stock for this newly added item immediately
        if (formData.fromWarehouseId) {
            try {
                const [stockResult, previewResult] = await Promise.allSettled([
                    getWarehouseProductStock(formData.fromWarehouseId, productData.id, {
                        zoneId: formData.fromZoneId,
                        locatorId: formData.fromLocatorId,
                        binId: formData.fromBinId
                    }),
                    getStockTransferCostPreview(formData.fromWarehouseId, [productData.id])
                ]);

                const stock = stockResult.status === 'fulfilled' ? stockResult.value : 0;
                const previewItem = previewResult.status === 'fulfilled'
                    ? previewResult.value?.items?.[0]
                    : null;

                setItems(prev => prev.map(i => i.id === newItem.id ? recalculateItemFinancials({
                    ...i,
                    available: stock,
                    status: i.quantity > 0 ? (i.quantity <= stock ? "Valid" : "Insufficient") : "Valid",
                    unitCost: previewItem?.costAvailable ? parseFiniteNumber(previewItem.unitCost) : null,
                    costSource: previewItem?.costSource || null,
                    costAvailable: Boolean(previewItem?.costAvailable)
                }) : i));
            } catch (e) {
                setItems(prev => prev.map(i => i.id === newItem.id ? recalculateItemFinancials({
                    ...i,
                    available: 0,
                    status: "Error",
                    unitCost: null,
                    costSource: null,
                    costAvailable: false
                }) : i));
            }
        }
    };

    const handleRemoveItem = (id) => setItems(items.filter(item => item.id !== id));

    const handleItemChange = async (id, field, value) => {
        const item = items.find(i => i.id === id);
        const updatedItems = items.map(i => {
            if (i.id === id) {
                const updated = { ...i, [field]: value };
                if (field === "quantity" && value > 0) {
                    updated.status = value <= updated.available ? "Valid" : "Insufficient";
                }
                return recalculateItemFinancials(updated);
            }
            return i;
        });

        setItems(updatedItems);

        if (field === "productId" && value && formData.fromWarehouseId) {
            try {
                const [stockResult, previewResult] = await Promise.allSettled([
                    getWarehouseProductStock(formData.fromWarehouseId, value, {
                        zoneId: formData.fromZoneId,
                        locatorId: formData.fromLocatorId,
                        binId: formData.fromBinId
                    }),
                    getStockTransferCostPreview(formData.fromWarehouseId, [value])
                ]);

                const stock = stockResult.status === 'fulfilled' ? stockResult.value : 0;
                const previewItem = previewResult.status === 'fulfilled'
                    ? previewResult.value?.items?.[0]
                    : null;

                setItems(prev => prev.map(i => i.id === id ? recalculateItemFinancials({
                    ...i,
                    available: stock,
                    status: i.quantity > 0 ? (i.quantity <= stock ? "Valid" : "Insufficient") : "Valid",
                    unitCost: previewItem?.costAvailable ? parseFiniteNumber(previewItem.unitCost) : null,
                    costSource: previewItem?.costSource || null,
                    costAvailable: Boolean(previewItem?.costAvailable)
                }) : i));
            } catch (e) {
                setItems(prev => prev.map(i => i.id === id ? recalculateItemFinancials({
                    ...i,
                    available: 0,
                    status: "Error",
                    unitCost: null,
                    costSource: null,
                    costAvailable: false
                }) : i));
            }
        }
    };

    const totals = useMemo(() => {
        return calculateTransferTotals(items, formData.transportCharge, formData.additionalCharges);
    }, [items, formData.transportCharge, formData.additionalCharges]);

    const preparePayload = (statusOverride) => {
        if (!formData.fromWarehouseId || !formData.toWarehouseId) {
            toast.error("Please select both source and destination warehouses");
            return null;
        }
        if (formData.fromWarehouseId === formData.toWarehouseId) {
            toast.error("Source and destination warehouses cannot be the same");
            return null;
        }
        const validItems = items.filter(it => it.productId && it.quantity > 0);
        if (validItems.length === 0) {
            toast.error("Please add at least one valid item to transfer");
            return null;
        }

        return {
            ...formData,
            status: statusOverride || formData.status,
            fromZoneId: formData.fromZoneId || null,
            fromLocatorId: formData.fromLocatorId || null,
            fromBinId: formData.fromBinId || null,
            toZoneId: formData.toZoneId || null,
            toLocatorId: formData.toLocatorId || null,
            toBinId: formData.toBinId || null,
            dispatchDate: formData.dispatchDate || null,
            arrivalDate: formData.arrivalDate || null,
            transportCharge: Number(formData.transportCharge) || 0,
            additionalCharges: Number(formData.additionalCharges) || 0,
            items: validItems.map(it => ({
                productId: Number(it.productId),
                batchNumber: it.batchNumber,
                quantity: Number(it.quantity),
                uom: it.uom
            }))
        };
    };

    const handleSubmit = () => {
        const payload = preparePayload();
        if (payload) onSubmit(payload);
    };

    const handleRequestApproval = () => {
        const payload = preparePayload("PENDING_APPROVAL");
        if (payload) onSubmit(payload);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 max-w-[1600px] mx-auto">
            {/* Left: Form Area */}
            <div className="flex-1 space-y-6">

                {/* ... (rest of form area) ... */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Transfer Number</span>
                            <span className="font-mono font-bold text-slate-800 text-lg tracking-tight">{formData.transferNo}</span>
                        </div>
                        <StatusBadge status={formData.status} />
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="h-10 px-4 border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 text-xs font-semibold hover:bg-slate-50 transition-all">
                            <Save className="h-4 w-4" /> Save Draft
                        </button>
                        <button
                            onClick={handleRequestApproval}
                            className="h-10 px-6 bg-slate-900 text-white rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-slate-800 shadow-md shadow-slate-200 transition-all"
                        >
                            <Sparkles className="h-4 w-4 text-[#F5C742]" /> Request Approval
                        </button>
                    </div>
                </div>

                {/* 2. Location & Basic Info Grid (3 Columns) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    {/* Basic Details */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                        <SectionHeader icon={FileText} title="Transfer Details" />
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Transfer Date</label>
                                <input type="date" value={formData.transferDate} onChange={e => setFormData({ ...formData, transferDate: e.target.value })} className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs focus:ring-1 focus:ring-[#F5C742] outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reason for Move</label>
                                <select value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none">
                                    <option value="">Select Reason</option>
                                    {transferReasons.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference Document</label>
                                <input type="text" placeholder="e.g. Sales Order #123" value={formData.referenceDoc} onChange={e => setFormData({ ...formData, referenceDoc: e.target.value })} className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* FROM Card */}
                    <div className="bg-white border border-emerald-100 rounded-xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:bg-emerald-100" />
                        <SectionHeader icon={MapPin} title="From (Source)" />
                        <div className="space-y-3 relative">
                            <div>
                                <select value={formData.fromWarehouseId} onChange={e => setFormData({ ...formData, fromWarehouseId: e.target.value ? Number(e.target.value) : "" })} className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold outline-none ring-1 ring-emerald-50">
                                    <option value="">Select Warehouse</option>
                                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select value={formData.fromZoneId} onChange={e => setFormData({ ...formData, fromZoneId: e.target.value ? Number(e.target.value) : "" })} className="h-8 bg-slate-50 border border-slate-100 rounded px-2 text-[11px] outline-none">
                                    <option value="">Zone</option>
                                    {fromZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                                </select>
                                <select value={formData.fromLocatorId} onChange={e => setFormData({ ...formData, fromLocatorId: e.target.value ? Number(e.target.value) : "" })} className="h-8 bg-slate-50 border border-slate-100 rounded px-2 text-[11px] outline-none">
                                    <option value="">Locator</option>
                                    {fromLocators.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                            <select value={formData.fromBinId} onChange={e => setFormData({ ...formData, fromBinId: e.target.value ? Number(e.target.value) : "" })} className="w-full h-8 bg-white border border-slate-100 rounded px-2 text-[11px] outline-none">
                                <option value="">Select Bin (Optional)</option>
                                {fromBins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>

                            <div className="mt-4 pt-3 border-t border-emerald-50">
                                <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">On-hand Qty</p>
                                <p className="text-2xl font-bold text-slate-800 leading-none">{aggregateStock.fromOnHand}</p>
                            </div>
                        </div>
                    </div>

                    {/* TO Card */}
                    <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:bg-blue-100" />
                        <SectionHeader icon={ArrowRight} title="To (Destination)" />
                        <div className="space-y-3 relative">
                            <div>
                                <select value={formData.toWarehouseId} onChange={e => setFormData({ ...formData, toWarehouseId: e.target.value ? Number(e.target.value) : "" })} className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold outline-none ring-1 ring-blue-50">
                                    <option value="">Select Warehouse</option>
                                    {warehouses.filter(w => w.id !== formData.fromWarehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select value={formData.toZoneId} onChange={e => setFormData({ ...formData, toZoneId: e.target.value ? Number(e.target.value) : "" })} className="h-8 bg-slate-50 border border-slate-100 rounded px-2 text-[11px] outline-none">
                                    <option value="">Zone</option>
                                    {toZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                                </select>
                                <select value={formData.toLocatorId} onChange={e => setFormData({ ...formData, toLocatorId: e.target.value ? Number(e.target.value) : "" })} className="h-8 bg-slate-50 border border-slate-100 rounded px-2 text-[11px] outline-none">
                                    <option value="">Locator</option>
                                    {toLocators.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                            <select value={formData.toBinId} onChange={e => setFormData({ ...formData, toBinId: e.target.value ? Number(e.target.value) : "" })} className="w-full h-8 bg-white border border-slate-100 rounded px-2 text-[11px] outline-none">
                                <option value="">Select Bin (Optional)</option>
                                {toBins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>

                            <div className="mt-4 pt-3 border-t border-blue-50">
                                <p className="text-[10px] font-bold text-blue-500 uppercase mb-1">Expected On-hand</p>
                                <p className="text-2xl font-bold text-emerald-600 leading-none">{aggregateStock.toOnHand + totals.qty}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Items Table Area */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="bg-[#F5C742]/10 text-[#F5C742] p-1.5 rounded-lg"><Package size={16} /></span>
                            <h3 className="font-bold text-slate-800">Transfer Items</h3>
                            <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{totals.items} Products Selected</span>
                        </div>
                        <button onClick={() => setIsProductSelectorOpen(true)} className="bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 h-8 px-4 rounded-lg flex items-center gap-2 text-xs font-bold transition-all transform hover:scale-105 active:scale-95">
                            <Plus className="h-3.5 w-3.5" /> Add Product
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 w-1.5 whitespace-nowrap">#</th>
                                    <th className="px-4 py-3 min-w-[300px]">Product Information</th>
                                    <th className="px-4 py-3">Batch/Lot</th>
                                    <th className="px-4 py-3 text-center">UoM</th>
                                    <th className="px-4 py-3 text-center">Available</th>
                                    <th className="px-4 py-3 text-center w-[120px]">Transfer Qty</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-6 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {items.map((item, index) => (
                                    <tr key={item.id} className="hover:bg-slate-50/80 group transition-colors">
                                        <td className="px-6 py-4 text-slate-400 font-mono text-[10px]">{index + 1}</td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-[13px]">{item.productName || 'Unknown Product'}</span>
                                                <span className="text-[10px] text-slate-500 font-mono tracking-tighter">
                                                    {item.productCode || 'N/A'}
                                                </span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-slate-400">Category: {item.category}</span>
                                                    <span className="w-1 h-1 bg-slate-200 rounded-full my-auto" />
                                                    <span className="text-[10px] text-slate-400">Brand: {item.brand}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <input
                                                type="text"
                                                value={item.batchNumber}
                                                onChange={e => handleItemChange(item.id, "batchNumber", e.target.value)}
                                                placeholder="L001-2024"
                                                className="w-full h-8 bg-slate-50 border border-slate-100 rounded px-2 text-[11px] font-mono focus:bg-white transition-all outline-none"
                                            />
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold uppercase">{item.uom || '---'}</span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`text-xs font-bold ${item.available < 10 ? 'text-rose-500' : 'text-slate-700'}`}>{item.available}</span>
                                                <span className="text-[9px] text-slate-400">Physical</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={e => handleItemChange(item.id, "quantity", Number(e.target.value))}
                                                    className={`w-full h-10 text-center font-bold text-sm bg-white border rounded-lg outline-none transition-all ${item.status === 'Insufficient' ? 'border-rose-300 ring-rose-50 bg-rose-50 text-rose-600' :
                                                        item.status === 'Valid' ? 'border-emerald-300 ring-emerald-50 bg-emerald-50 text-emerald-600' :
                                                            'border-slate-200 focus:ring-1 focus:ring-[#F5C742]'
                                                        }`}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {item.status === "Valid" ? (
                                                <span className="text-emerald-500 bg-emerald-50 p-1.5 rounded-full inline-block"><Check className="h-3.5 w-3.5" /></span>
                                            ) : item.status === "Insufficient" ? (
                                                <span className="text-rose-500 bg-rose-50 p-1.5 rounded-full inline-block" title="Stock lower than transfer quantity"><AlertTriangle className="h-3.5 w-3.5" /></span>
                                            ) : (
                                                <span className="text-slate-300 bg-slate-50 p-1.5 rounded-full inline-block"><Clock className="h-3.5 w-3.5" /></span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {items.length === 0 && (
                            <div className="p-20 flex flex-col items-center gap-4 text-slate-300 border-t border-slate-50">
                                <Package size={48} className="stroke-[0.5]" />
                                <div className="text-center">
                                    <p className="text-sm font-medium text-slate-400">No products added yet</p>
                                    <p className="text-xs text-slate-300 mt-1">Add items to initiate a stock transfer process</p>
                                </div>
                                <button onClick={() => setIsProductSelectorOpen(true)} className="text-[#F5C742] text-xs font-bold border border-[#F5C742] border-dashed px-6 py-2 rounded-lg hover:bg-[#F5C742]/10 transition-all">
                                    Click here to add products
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 4. Logistics & Control */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <SectionHeader icon={Truck} title="Logistics & Control" />
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                            <input
                                type="checkbox"
                                id="autoAllocate"
                                checked={formData.autoAllocateOnReceipt}
                                onChange={(e) => setFormData({ ...formData, autoAllocateOnReceipt: e.target.checked })}
                                className="w-4 h-4 rounded text-[#F5C742] focus:ring-[#F5C742] border-slate-300"
                            />
                            <label htmlFor="autoAllocate" className="text-[11px] font-bold text-slate-600 cursor-pointer">Allocate to destination warehouse</label>
                            <Info size={12} className="text-slate-400 ml-1 cursor-help" title="Planing flag for auto-allocation on receipt" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Transportation & Logistics */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transportation & Logistics</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Transport Mode</label>
                                    <select
                                        value={formData.transportMode}
                                        onChange={(e) => setFormData({ ...formData, transportMode: e.target.value })}
                                        className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:ring-1 focus:ring-[#F5C742]"
                                    >
                                        <option value="Vehicle">Vehicle</option>
                                        <option value="Shipment">Shipment</option>
                                        <option value="Air Freight">Air Freight</option>
                                        <option value="Manual">Manual/Courier</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vehicle No.</label>
                                        <input
                                            type="text"
                                            value={formData.vehicleNo}
                                            onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value })}
                                            placeholder="e.g., DXB-12345"
                                            className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:ring-1 focus:ring-[#F5C742]"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Driver Name</label>
                                        <input
                                            type="text"
                                            value={formData.driverName}
                                            onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                                            placeholder="Driver name"
                                            className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:ring-1 focus:ring-[#F5C742]"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Expected Dispatch Date</label>
                                        <input
                                            type="date"
                                            value={formData.dispatchDate}
                                            onChange={(e) => setFormData({ ...formData, dispatchDate: e.target.value })}
                                            className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:ring-1 focus:ring-[#F5C742]"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Estimated Arrival Date</label>
                                        <input
                                            type="date"
                                            value={formData.arrivalDate}
                                            onChange={(e) => setFormData({ ...formData, arrivalDate: e.target.value })}
                                            className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:ring-1 focus:ring-[#F5C742]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cost Allocation */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cost Allocation (Optional)</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className={`text-[10px] font-bold uppercase block mb-1 ${!formData.transportMode ? 'text-slate-300' : 'text-slate-500'}`}>Transport Charge</label>
                                    <input
                                        type="number"
                                        value={formData.transportCharge}
                                        disabled={!formData.transportMode}
                                        onChange={(e) => setFormData({ ...formData, transportCharge: e.target.value })}
                                        className={`w-full h-9 border border-slate-200 rounded-lg px-3 text-xs font-bold outline-none focus:ring-1 focus:ring-[#F5C742] ${!formData.transportMode ? 'bg-slate-100 cursor-not-allowed text-slate-400' : 'bg-slate-50 text-slate-700'}`}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Additional Charges</label>
                                    <input
                                        type="number"
                                        value={formData.additionalCharges}
                                        onChange={(e) => setFormData({ ...formData, additionalCharges: e.target.value })}
                                        className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs font-bold outline-none focus:ring-1 focus:ring-[#F5C742]"
                                    />
                                </div>

                                <div className="pt-4 mt-4 border-t border-slate-50">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Responsible Personnel</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500">Prepared By:</span>
                                            <span className="font-bold text-slate-700">Current User</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500">Approved By:</span>
                                            <span className="text-slate-400 italic">Pending</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500">Received By:</span>
                                            <span className="text-slate-400 italic">-</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Review & Confirm */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -mr-16 -mt-16 opacity-50" />
                    <SectionHeader icon={CheckCircle2} title="Review & Confirm" />

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative z-10">
                        <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50">
                            <p className="text-[10px] font-bold text-blue-500 uppercase mb-1">Total Items</p>
                            <p className="text-2xl font-bold text-slate-800">{totals.items}</p>
                        </div>
                        <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100/50">
                            <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Total Quantity</p>
                            <p className="text-2xl font-bold text-slate-800">{totals.qty}</p>
                        </div>
                        <div className="bg-purple-50/50 rounded-xl p-4 border border-purple-100/50">
                            <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">Transfer Value</p>
                            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totals.totalValue)}</p>
                            <p className="text-[10px] text-purple-500 mt-1">
                                {totals.totalCharges > 0 ? `Includes ${formatCurrency(totals.totalCharges)} logistics charges` : 'Inventory value only'}
                            </p>
                        </div>
                        <div className={`${totals.warningsCount > 0 ? 'bg-amber-50/50 border-amber-100/50' : 'bg-slate-50/50 border-slate-100/50'} rounded-xl p-4 border`}>
                            <p className={`text-[10px] font-bold ${totals.warningsCount > 0 ? 'text-amber-500' : 'text-slate-400'} uppercase mb-1`}>Warnings</p>
                            <p className="text-2xl font-bold text-slate-800">{totals.warningsCount}</p>
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-slate-50 -mx-6 -mb-6 px-6 py-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <ShieldCheck size={14} className="text-emerald-500" />
                            <span>Verified by Internal Audit Protocol</span>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleSubmit} className="h-10 px-6 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all shadow-sm">
                                Save Draft
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={totals.items === 0 || totals.qty === 0 || totals.warningsCount > 0}
                                className={`h-10 px-8 rounded-lg flex items-center gap-2 text-xs font-bold transition-all shadow-md shadow-[#F5C742]/10 ${totals.items === 0 || totals.qty === 0 || totals.warningsCount > 0
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 active:scale-95'
                                    }`}
                            >
                                <CheckCircle2 className="h-4 w-4" /> Confirm & Transfer
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Transfer Summary */}
            <div className="w-full lg:w-[300px] space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <SectionHeader icon={Sparkles} title="Stock Analytics" />
                    <div className="grid grid-cols-1 gap-3">
                        <StatCard
                            label="Current On-hand"
                            value={`${items.reduce((acc, it) => acc + (Number(it.available) || 0), 0)} Units`}
                            subtext="Total available for selected items"
                            icon={Package}
                            color="blue"
                        />
                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">After Transfer</p>
                            <p className="text-xl font-bold text-slate-800">
                                {items.reduce((acc, it) => acc + (Number(it.available) || 0), 0) - totals.qty} Units
                            </p>
                        </div>
                        <StatCard
                            label="Min Level"
                            value="50 Units"
                            subtext="System safety threshold"
                            icon={AlertCircle}
                            color="amber"
                        />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <SectionHeader icon={Sparkles} title="Cost & Impact" />
                    <div className="grid grid-cols-1 gap-3">
                        <StatCard
                            label="Total Transfer Value"
                            value={formatCurrency(totals.totalValue)}
                            subtext={totals.totalCharges > 0 ? `Includes ${formatCurrency(totals.totalCharges)} landed charges` : "Based on source warehouse cost"}
                            icon={Package}
                            color="blue"
                        />
                        <StatCard
                            label="Avg Cost Per Unit"
                            value={totals.qty > 0 && totals.missingCostCount === 0 ? formatCurrency(totals.avgCostPerUnit) : (totals.inventoryValue > 0 ? formatCurrency(totals.avgCostPerUnit) : 'Pending')}
                            subtext={totals.missingCostCount > 0 ? `${totals.missingCostCount} item(s) need source cost` : "Weighted avg from source warehouse"}
                            icon={RefreshCw}
                            color="emerald"
                        />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <SectionHeader icon={CheckCircle2} title="Transfer Health" />
                    <div className="space-y-1">
                        <ChecklistItem checked={formData.fromWarehouseId && formData.toWarehouseId} label="Path Defined (From → To)" />
                        <ChecklistItem checked={items.length > 0} label="Stock Items Selected" />
                        <ChecklistItem checked={items.length > 0 && items.every(i => i.status === "Valid")} label="Availability Check Passed" />
                        <ChecklistItem checked={formData.reason} label="Business Reason Specified" />
                        <ChecklistItem checked={formData.transportMode} label="Logistics Assigned" />
                    </div>
                    {items.length > 0 && items.some(i => i.status === "Insufficient") && (
                        <div className="mt-4 p-3 bg-rose-50 rounded-lg flex gap-2 items-start animate-pulse border border-rose-100">
                            <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-rose-600 font-medium">Critical: One or more products have insufficient stock in the source location.</p>
                        </div>
                    )}
                </div>

                <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5 shadow-lg text-white">
                    <SectionHeader icon={Lightbulb} title="Smart Suggestions" />
                    <div className="space-y-3 mt-4">
                        <div className="flex gap-3 text-[10px]">
                            <div className="w-6 h-6 rounded bg-[#F5C742]/20 flex items-center justify-center shrink-0">
                                <Truck className="h-3 text-[#F5C742]" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-slate-300 leading-relaxed italic">
                                    "Recommended to use <strong>Medium Truck DXB-12</strong> for today's volume to optimize cost."
                                </p>
                                {totals.qty > 50 && (
                                    <p className="text-[#F5C742] font-bold">Suggested Qty: {Math.floor(totals.qty * 1.2)}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <SectionHeader icon={History} title="Approval Workflow" />
                    <div className="mt-4">
                        <ApprovalStepper currentStatus={formData.status} />
                    </div>
                </div>
            </div>

            {/* Product Selector Modal */}
            <ProductSelector
                isOpen={isProductSelectorOpen}
                onClose={() => setIsProductSelectorOpen(false)}
                onSelect={handleAddSingleProduct}
            />
        </div>
    );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

const tabs = [
    { id: "create", label: "Create Transfer", icon: Plus },
    { id: "history", label: "Transfer History", icon: History },
    { id: "receive", label: "Receive Transfer", icon: Download },
];

const StockTransfer = () => {
    const [activeTab, setActiveTab] = useState("create");
    const [warehouses, setWarehouses] = useState([]);

    const [transfers, setTransfers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            setIsLoading(true);
            const [whs, trfs] = await Promise.all([
                getWarehouses(),
                getStockTransfers()
            ]);
            setWarehouses(whs || []);
            setTransfers(trfs || []);
        } catch (error) {
            console.error("Failed to load data:", error);
            toast.error("Failed to load stock transfer data");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateTransfer = async (payload) => {
        try {
            await createStockTransfer(payload);
            toast.success("Stock transfer created successfully");
            setActiveTab("history");
            loadInitialData();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to create transfer");
        }
    };

    const handleSendTransfer = async (id) => {
        try {
            await sendStockTransfer(id);
            toast.success("Transfer sent successfully");
            loadInitialData();
        } catch (error) {
            toast.error("Failed to send transfer");
        }
    };

    const handleReceiveTransfer = async (id) => {
        try {
            await receiveStockTransfer(id);
            toast.success("Stock received successfully");
            loadInitialData();
        } catch (error) {
            toast.error("Failed to receive stock");
        }
    };

    const handleViewTransfer = (transfer) => {
        setSelectedTransfer(transfer);
        setIsViewModalOpen(true);
    };

    const handlePrintGatePass = async (data) => {
        const generatedAt = new Date().toLocaleString();
        
        let company = {};
        try {
            const res = await getCompanyProfile();
            company = res?.data || res || {};
        } catch (e) {
            console.error("Failed to fetch company profile for print", e);
        }

        const logoPath = company.logoUrl || company.logoPath || company.logo;
        const resolvedLogoUrl = logoPath ? getImageUrl(logoPath) : '';
        const logoHtml = resolvedLogoUrl ? `<img src="${resolvedLogoUrl}" alt="Company Logo" style="max-height: 80px; max-width: 150px; object-fit: contain; margin-bottom: 10px;" />` : '';

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <title>Gate Pass - ${data.transferNo}</title>
                <style>
                    @page { size: A4; margin: 20mm; }
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.5; margin: 0; padding: 0; }
                    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
                    .title { font-size: 24px; font-weight: bold; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
                    
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; }
                    .info-box h4 { margin: 0 0 10px 0; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
                    .info-box p { margin: 5px 0; font-size: 12px; font-weight: 500; color: #1e293b; }
                    .info-box span { color: #64748b; font-weight: normal; }
                    
                    table.details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    table.details-table th { background: #f1f5f9; text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
                    table.details-table td { padding: 12px; font-size: 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    
                    .totals { width: 300px; float: right; margin-bottom: 40px; }
                    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
                    .totals-row.grand { font-weight: bold; font-size: 14px; border-bottom: 2px solid #cbd5e1; border-top: 2px solid #cbd5e1; padding: 12px 0; color: #0f172a; }
                    
                    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 60px; clear: both; }
                    .sig-box { text-align: center; }
                    .sig-line { border-top: 1px solid #94a3b8; margin-top: 50px; padding-top: 8px; font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase; }
                    
                    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1 class="title" style="margin-bottom: 20px;">STOCK TRANSFER / GATE PASS</h1>
                        <table style="width: auto; border: none; margin: 0; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 2px 15px 2px 0; border: none; font-size: 10px; font-weight: bold; color: #64748b;">DOCUMENT NO</td>
                                <td style="padding: 2px 0; border: none; font-size: 11px; font-weight: bold; color: #1e293b;">${data.transferNo}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 15px 2px 0; border: none; font-size: 10px; font-weight: bold; color: #64748b;">DATE</td>
                                <td style="padding: 2px 0; border: none; font-size: 11px; font-weight: bold; color: #1e293b;">${data.transferDate}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 15px 2px 0; border: none; font-size: 10px; font-weight: bold; color: #64748b;">STATUS</td>
                                <td style="padding: 2px 0; border: none; font-size: 11px; font-weight: bold; color: #1e293b; text-transform: uppercase;">${data.status}</td>
                            </tr>
                        </table>
                    </div>
                    <div style="text-align: right; max-width: 300px;">
                        ${logoHtml}
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${company.companyName || company.name || ''}</div>
                        <div style="color: #4b5563; font-size: 11px; margin-bottom: 2px; white-space: pre-wrap;">${company.address || ''}</div>
                        ${company.phone ? `<div style="color: #4b5563; font-size: 11px; margin-bottom: 2px;">${company.phone}</div>` : ''}
                        ${company.email ? `<div style="color: #4b5563; font-size: 11px; margin-bottom: 2px;">${company.email}</div>` : ''}
                        ${company.trn ? `<div style="color: #4b5563; font-size: 11px; margin-bottom: 2px;">TRN: ${company.trn}</div>` : ''}
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-box">
                        <h4>From (Source)</h4>
                        <p>Warehouse: <span>${data.fromWarehouseName || 'N/A'}</span></p>
                        <p>Zone: <span>${data.fromZoneName || 'N/A'}</span></p>
                        <p>Locator: <span>${data.fromLocatorName || 'N/A'}</span></p>
                    </div>
                    <div class="info-box">
                        <h4>To (Destination)</h4>
                        <p>Warehouse: <span>${data.toWarehouseName || 'N/A'}</span></p>
                        <p>Zone: <span>${data.toZoneName || 'N/A'}</span></p>
                        <p>Locator: <span>${data.toLocatorName || 'N/A'}</span></p>
                    </div>
                    <div class="info-box">
                        <h4>Logistics Details</h4>
                        <p>Transport Mode: <span>${data.transportMode || 'N/A'}</span></p>
                        <p>Vehicle No: <span>${data.vehicleNo || 'N/A'}</span></p>
                        <p>Driver: <span>${data.driverName || 'Not Assigned'}</span></p>
                    </div>
                    <div class="info-box">
                        <h4>Movement Info</h4>
                        <p>Reason: <span>${data.reason || 'N/A'}</span></p>
                        <p>Reference: <span>${data.referenceDoc || 'None'}</span></p>
                        <p>Dispatch: <span>${data.dispatchDate || 'Pending'}</span></p>
                    </div>
                </div>

                <table class="details-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Product / Item Code</th>
                            <th>Batch / Lot</th>
                            <th class="text-center">Qty</th>
                            <th class="text-center">UoM</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(data.items || []).map((item, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>
                                    <strong>${item.productName}</strong><br>
                                    <span style="font-size: 10px; color: #64748b;">${item.productCode}</span>
                                </td>
                                <td>${item.batchNumber || '---'}</td>
                                <td class="text-center"><strong>${item.quantity}</strong></td>
                                <td class="text-center">${item.uom}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="totals-row">
                        <span>Total Items:</span>
                        <strong>${data.items?.length || 0}</strong>
                    </div>
                    <div class="totals-row grand">
                        <span>Total Quantity:</span>
                        <span>${data.items?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0}</span>
                    </div>
                </div>

                <div class="signatures">
                    <div class="sig-box">
                        <div class="sig-line">Prepared By</div>
                        <p style="font-size: 10px; color: #64748b; margin-top: 5px;">${data.requestedBy || 'System'}</p>
                    </div>
                    <div class="sig-box">
                        <div class="sig-line">Driver / Transporter</div>
                    </div>
                    <div class="sig-box">
                        <div class="sig-line">Received By</div>
                    </div>
                </div>

                <div class="footer">
                    Gate Pass Generated by BillBull ERP System at ${generatedAt}
                </div>
            </body>
            </html>
        `;
        printHtml(htmlContent);
    };

    const handleNewTransfer = () => setActiveTab("create");

    return (
        <div className="flex flex-col h-full bg-[#F7F7FA] font-sans">
            {/* Full-width Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-xs text-slate-500 mb-1">Inventory & Registry → Stock Movements & Transfers</div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Package className="text-[#F5C742]" size={28} />
                            Stock Transfer Management
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Move inventory between warehouses, shops & bins with full traceability</p>
                    </div>
                </div>
            </div>

            {/* Tabs - Full Width */}
            <div className="bg-white border-b border-slate-100 px-6">
                <div className="flex gap-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors ${activeTab === tab.id
                                ? "border-[#F5C742] text-slate-900"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                            {tab.id === "receive" && transfers.filter(t => t.status === "SENT").length > 0 && (
                                <span className="bg-[#F5C742] text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {transfers.filter(t => t.status === "SENT").length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <RefreshCw className="h-8 w-8 text-[#F5C742] animate-spin" />
                    </div>
                ) : (
                    <div className="animate-in fade-in duration-200">
                        {activeTab === "create" && (
                            <CreateTransferView
                                warehouses={warehouses}
                                onSubmit={handleCreateTransfer}
                            />
                        )}
                        {activeTab === "history" && (
                            <TransferHistoryView
                                data={transfers}
                                warehouses={warehouses}
                                onView={handleViewTransfer}
                                onSend={handleSendTransfer}
                                onPrint={handlePrintGatePass}
                            />
                        )}
                        {activeTab === "receive" && (
                            <ReceiveTransferView
                                data={transfers.filter(t => t.status === "SENT")}
                                onReceive={handleReceiveTransfer}
                            />
                        )}
                    </div>
                )}
            </div>

            <ViewTransferModal
                isOpen={isViewModalOpen}
                onClose={() => setIsViewModalOpen(false)}
                data={selectedTransfer}
                onPrint={handlePrintGatePass}
            />
        </div>
    );
};

export default StockTransfer;
