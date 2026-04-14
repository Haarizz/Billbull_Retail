import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Download,
  Settings,
  Plus,
  Search,
  Filter,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
  Printer,
  FileText,
  ScanLine,
  Truck,
  History,
  AlertTriangle,
  Check,
  X,
  Eye,
  Trash2,
  Share2,
  Calendar,
  LayoutDashboard,
  ArrowRightLeft,
  Zap,
  Package,
  ClipboardCheck,
  Camera,
  Clock,
  MapPin,
  User,
  BarChart3,
  Layers,
  ChevronUp,
  Menu,
  Box
} from 'lucide-react';
import { GRN_STATUS } from '../../../constants/grnEnums';
import { getLpos, getLpoByNumber } from '../../../api/lpoApi';

import {
  getGrns,
  getGrnById,
  createGrn,
  updateGrn,
  deleteGrn, // Added deleteGrn
  submitGrnForQc,
  approveGrnQc,
  postGrn
} from '../../../api/grnApi';
import { getVendors } from '../../../api/vendorsApi';
import { createDraftFromGrn } from '../../../api/purchaseInvoiceApi';
import {
  getWarehouses,
  getWarehouseZones,
  getZoneLocators,
  getLocatorBins
} from '../../../api/warehouseApi';
import { getProducts } from '../../../api/productsApi'; // Import getProducts
import ProductSelector from '../../../components/ProductSelector';
import SearchableDropdown from '../../../components/SearchableDropdown';
import VendorSelector from '../../../components/VendorSelector';
import { getImageUrl } from '../../../utils/urlUtils';
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../../components/ItemDescriptionCell';
import ItemAddOnsModal from '../../../components/ItemAddOnsModal';

// SHORTCUTS HOOK
import useShortcuts from '../../../hooks/useShortcuts';

// Printing Utilities
import { getTemplatesByCategory } from '../../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../../utils/printGenerator';
import nestLogo from '../../../assets/NEST Logo Final.png';
import billBullLogo from '../../../assets/billBullLogo.png';
import toast from 'react-hot-toast';

// ==========================================
// 1. MOCK DATA & CONFIGURATION
// ==========================================

const navTabs = [
  { id: "list", label: "GRN List", icon: FileText },
  { id: "editor", label: "Create / Edit GRN", icon: Plus },
  { id: "qc", label: "Pending QC", icon: ClipboardCheck },
  { id: "history", label: "History", icon: History },
  // { id: "returns", label: "Returns / GRV", icon: ArrowRightLeft },
];



// ==========================================
// 2. HELPER COMPONENTS
// ==========================================

const StatusBadge = ({ children, className }) => (
  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded border ${className}`}>
    {children}
  </span>
);

const getStatusColor = (status) => {
  switch (status) {
    case GRN_STATUS.POSTED: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case GRN_STATUS.QC_COMPLETED: return 'bg-blue-100 text-blue-700 border-blue-200';
    case GRN_STATUS.QC_PENDING: return 'bg-orange-100 text-orange-700 border-orange-200';
    case GRN_STATUS.DRAFT: return 'bg-slate-100 text-slate-700 border-slate-200';
    case GRN_STATUS.REVERSED: return 'bg-red-50 text-red-600 border-red-200';
    default: return 'bg-slate-50 text-slate-500 border-slate-200';
  }
};

// ==========================================
// 3. SUB-VIEWS
// ==========================================

// --- LIST VIEW ---
const GRNListView = ({ data, onView, onEdit, onDelete, onPost, onPrint, onProceedToInvoice, activeFilter, setActiveFilter }) => {
  const filteredData = data.filter(item => {
    if (activeFilter === "All GRNs") return true;
    if (activeFilter === "Today") {
      const today = new Date().toISOString().split('T')[0];
      return item.date === today;
    }
    if (activeFilter === "QC Pending") return item.status === GRN_STATUS.QC_PENDING;
    if (activeFilter === "Pending Invoice") return item.status === GRN_STATUS.POSTED && item.invStatus !== 'Fully Invoiced';
    if (activeFilter === "With Variance") return item.hasVariance || (item.variance && item.variance !== 0); // Check for variance flag or value
    if (activeFilter === "Completed") return item.status === GRN_STATUS.QC_COMPLETED || item.status === GRN_STATUS.POSTED;
    if (activeFilter === "Reversed") return item.status === GRN_STATUS.REVERSED;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-20">
      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Goods Receipt Notes</h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search GRN no, vendor, LPO..."
                className="pl-9 pr-4 h-9 w-full sm:w-64 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400 text-xs"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none h-9 px-3 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors">
                <Filter className="h-3 w-3" /> Filters
              </button>
              <button className="flex-1 sm:flex-none h-9 px-3 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F7F7FA] text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 whitespace-nowrap">GRN No</th>
                <th className="px-6 py-3 whitespace-nowrap">Date</th>
                <th className="px-6 py-3 whitespace-nowrap">Vendor</th>
                <th className="px-6 py-3 whitespace-nowrap">Linked LPO / DP</th>
                <th className="px-6 py-3 whitespace-nowrap">Warehouse</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">Packages</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">GRN Value</th>
                <th className="px-6 py-3 whitespace-nowrap">Status</th>
                <th className="px-6 py-3 whitespace-nowrap">Invoice Status</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">Posted</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 group transition-colors">
                  <td onClick={() => onView(row)} className="px-6 py-4 font-mono font-medium text-[#F5C742] cursor-pointer hover:underline">
                    {row.idDisplay}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-slate-400" /> {row.date}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {row.vendor}
                    <div className="text-[9px] text-slate-400">V001</div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      title={`Reference: ${row.docRef}\nSource: ${row.sourceType || 'MANUAL'}\nRef ID: ${row.referenceId || 'N/A'}`}
                      className={`font-mono text-[10px] px-2 py-0.5 rounded w-fit ${(row.docRef === 'Manual' || row.docRef === '(Link-Lost)') ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}
                    >
                      {row.lpoNumber ? row.lpoNumber : (row.sourceType === "DIRECT_PURCHASE" ? "Direct Purchase" : "Manual")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 flex items-center gap-1">
                    <LayoutDashboard className="h-3 w-3 text-slate-400" /> {row.warehouse}
                  </td>
                  <td className="px-6 py-4 text-center">{row.packages}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">{row.value}</td>
                  <td className="px-6 py-4">
                    <StatusBadge className={getStatusColor(row.status)}>{row.status}</StatusBadge>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${row.invStatus === 'Fully Invoiced' ? 'bg-green-50 text-green-600 border-green-100' : row.invStatus === 'Partially Invoiced' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {row.invStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.status === GRN_STATUS.POSTED ? (
                      <div className="flex justify-center"><Check className="h-4 w-4 text-emerald-500" /></div>
                    ) : (
                      <div className="flex justify-center"><Clock className="h-4 w-4 text-slate-300" /></div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2 opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); onView(row); }} title="View" className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"><Eye className="h-3.5 w-3.5" /></button>

                      {(row.status === 'DRAFT' || row.status === 'QC_PENDING') && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); onEdit(row); }} title="Edit" className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"><Settings className="h-3.5 w-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); onDelete && onDelete(row.id); }} title="Delete" className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}

                      {/* ✅ Quick Post button for QC_COMPLETED GRNs */}
                      {row.status === 'QC_COMPLETED' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPost && onPost(row.id); }}
                          title="Post GRN (Add Stock)"
                          className="p-1.5 bg-amber-50 hover:bg-amber-100 rounded text-amber-600 hover:text-amber-700 flex items-center gap-1 font-medium text-[10px]"
                        >
                          <Zap className="h-3 w-3" /> Post
                        </button>
                      )}

                      {/* ✅ Proceed to Invoice for POSTED GRNs not fully invoiced */}
                      {row.status === GRN_STATUS.POSTED && row.invStatus !== 'Fully Invoiced' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onProceedToInvoice && onProceedToInvoice(row.id); }}
                          title="Proceed to Invoice"
                          className="p-1.5 bg-blue-50 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium text-[10px]"
                        >
                          <FileText className="h-3 w-3" /> Invoice
                        </button>
                      )}

                      <button onClick={(e) => { e.stopPropagation(); onPrint && onPrint(row); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Print"><Printer className="h-3.5 w-3.5" /></button>
                    </div>
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

// --- QC QUEUE VIEW ---
const QCQueueView = ({ queue, onApprove }) => (
  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[400px]">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="h-4 w-4 text-slate-400" />
          <h3 className="font-semibold text-slate-800">Pending QC Inspection</h3>
        </div>
        <p className="text-sm text-slate-500">GRNs awaiting quality control approval</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <th className="p-3 font-medium">GRN No</th>
              <th className="p-3 font-medium">Vendor</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Warehouse</th>
              <th className="p-3 font-medium text-center">Items</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {queue.length === 0 ? (
              <tr><td colSpan="7" className="p-8 text-center text-slate-400">No Pending QC items</td></tr>
            ) : queue.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono text-[#F5C742] font-medium">{item.idDisplay}</td>
                <td className="p-3 font-medium text-slate-800">{item.vendor}</td>
                <td className="p-3 text-slate-600">{item.date}</td>
                <td className="p-3 text-slate-600">{item.warehouse}</td>
                <td className="p-3 text-center">{item.packages || item.items}</td>
                <td className="p-3"><StatusBadge className="bg-orange-100 text-orange-700 border-orange-200">Pending QC</StatusBadge></td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onApprove(item)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">
                      <Check className="h-3 w-3" /> Approve QC
                    </button>
                    <button className="flex items-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded text-xs font-medium transition-colors">
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// --- RETURNS VIEW ---
const ReturnsView = () => (
  <div className="bg-white border border-slate-200 rounded-lg p-12 text-center shadow-sm">
    <div className="flex justify-between items-start mb-10">
      <div className="text-left">
        <div className="flex items-center gap-2 mb-1">
          <ArrowRightLeft className="h-4 w-4 text-slate-400" />
          <h3 className="font-semibold text-slate-800">Goods Return / GRV</h3>
        </div>
        <p className="text-sm text-slate-500">Return rejected or incorrect items to vendors</p>
      </div>
      <button className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded font-bold text-xs shadow-sm transition-colors flex items-center gap-2">
        <Plus size={14} /> Create GRV
      </button>
    </div>

    <div className="py-20">
      <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
        <RefreshCw className="h-8 w-8 text-slate-300" />
      </div>
      <div className="text-sm font-medium text-slate-500">No returns created yet</div>
      <div className="text-xs text-slate-400 mt-1">Create GRV for rejected items from GRN</div>
    </div>
  </div>
);

// --- MODAL COMPONENTS ---

const BatchModal = ({ isOpen, onClose, item, disabled }) => {
  // Initial batch state logic
  const [batches, setBatches] = useState([
    { id: 1, batchNo: '2024001', mfg: '2024-11-01', exp: '2025-11-01', lpo: 24, rec: 24, acc: 23, rej: 1, reason: '' }
  ]);

  const handleAddBatch = () => {
    setBatches([...batches, {
      id: Date.now(),
      batchNo: '',
      mfg: '',
      exp: '',
      lpo: 0,
      rec: 0,
      acc: 0,
      rej: 0,
      reason: ''
    }]);
  };

  const handleRemoveBatch = (id) => {
    setBatches(batches.filter(b => b.id !== id));
  };

  const updateBatch = (id, field, value) => {
    setBatches(batches.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-[900px] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-[#F5C742]" />
              <h3 className="font-bold text-slate-800">Batch Management - {item.name}</h3>
            </div>
            <p className="text-xs text-slate-500">Manage batch numbers, manufacturing and expiry dates</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="p-6 bg-slate-50/50">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                <tr>
                  <th className="p-3">Batch No</th>
                  <th className="p-3">MFG Date</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3 text-center">LPO Qty</th>
                  <th className="p-3 text-center">Received</th>
                  <th className="p-3 text-center">Accepted</th>
                  <th className="p-3 text-center">Rejected</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="p-3">
                      <div className="flex items-center border border-emerald-500 rounded-md bg-white overflow-hidden w-24">
                        <div className="bg-emerald-500 text-white px-1.5 py-1 text-[10px] font-bold">BAT</div>
                        <input
                          type="text"
                          value={b.batchNo}
                          onChange={(e) => updateBatch(b.id, 'batchNo', e.target.value)}
                          className="w-full text-xs px-1 outline-none text-slate-700 font-mono"
                          disabled={disabled}
                        />
                      </div>
                    </td>
                    <td className="p-3"><input type="date" value={b.mfg} onChange={(e) => updateBatch(b.id, 'mfg', e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-slate-600 w-24" disabled={disabled} /></td>
                    <td className="p-3"><input type="date" value={b.exp} onChange={(e) => updateBatch(b.id, 'exp', e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-slate-600 w-24" disabled={disabled} /></td>
                    <td className="p-3 text-center text-slate-400">{b.lpo}</td>
                    <td className="p-3 text-center"><input type="number" value={b.rec} onChange={(e) => updateBatch(b.id, 'rec', e.target.value)} className="w-12 text-center border border-slate-200 rounded py-1" disabled={disabled} /></td>
                    <td className="p-3 text-center"><input type="number" value={b.acc} onChange={(e) => updateBatch(b.id, 'acc', e.target.value)} className="w-12 text-center border border-slate-200 rounded py-1" disabled={disabled} /></td>
                    <td className="p-3 text-center"><input type="number" value={b.rej} onChange={(e) => updateBatch(b.id, 'rej', e.target.value)} className="w-12 text-center border border-slate-200 rounded py-1" disabled={disabled} /></td>
                    <td className="p-3"><input type="text" value={b.reason} onChange={(e) => updateBatch(b.id, 'reason', e.target.value)} placeholder="Reason..." className="border border-slate-200 rounded px-2 py-1 w-20" disabled={disabled} /></td>
                    <td className="p-3 text-center">
                      {!disabled && <button onClick={() => handleRemoveBatch(b.id)} className="text-red-400 hover:text-red-600"><X size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!disabled && (
              <div className="p-3 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={handleAddBatch}
                  className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded px-3 py-1.5 bg-white shadow-sm"
                >
                  <Plus size={12} /> Add Batch
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          {!disabled && <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#F5C742] rounded-md hover:bg-[#E5B732] shadow-sm transition-colors">Save Batches</button>}
        </div>

      </div>
    </div>
  );
};

const CompareLPOModal = ({ isOpen, onClose, items }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-[900px] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ArrowRightLeft className="h-4 w-4 text-[#F5C742]" />
              <h3 className="font-bold text-slate-800">LPO vs GRN Comparison</h3>
            </div>
            <p className="text-xs text-slate-500">Compare ordered quantities with received quantities</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="p-6 bg-slate-50/50">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3 text-center">LPO Qty</th>
                  <th className="p-3 text-center">Received Qty</th>
                  <th className="p-3 text-center">Variance</th>
                  <th className="p-3 text-right">LPO Price</th>
                  <th className="p-3 text-right">GRN Price</th>
                  <th className="p-3 text-center">Price Var %</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => {
                  // Calculate variance logic for display
                  const variance = item.received - item.lpoQty;
                  const varianceColor = variance === 0 ? 'text-green-600' : variance > 0 ? 'text-orange-600' : 'text-red-600';
                  const priceVar = item.lpoPrice > 0 ? ((item.unitCost - item.lpoPrice) / item.lpoPrice) * 100 : 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.code}</div>
                      </td>
                      <td className="p-3 text-center text-slate-600">{item.lpoQty}</td>
                      <td className="p-3 text-center text-slate-600">{item.received}</td>
                      <td className={`p-3 text-center font-bold ${varianceColor}`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </td>
                      <td className="p-3 text-right text-slate-600">{item.lpoPrice ? item.lpoPrice.toFixed(2) : '0.00'}</td>
                      <td className="p-3 text-right text-slate-600">{item.unitCost.toFixed(2)}</td>
                      <td className="p-3 text-center text-slate-500">{priceVar.toFixed(1)}%</td>
                      <td className="p-3 text-center">
                        {variance === 0 && priceVar === 0 ? (
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200">OK</span>
                        ) : (
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-200">Check</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-900 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">Close</button>
        </div>

      </div>
    </div>
  );
};


// --- EDITOR VIEW (Detailed UI) ---
const EditorView = ({ initialData, onSaveDraft, onSubmitQC, onPost, onPrint, grnType, setGrnType }) => {
  // Mock items linked from LPO
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedVendorDetails, setSelectedVendorDetails] = useState(null);

  // FIX 1: Single source of status truth, remove qcStatus and posted
  const [formData, setFormData] = useState({
    grnNo: "",
    date: "",
    lpo: "",
    directPurchaseId: null,
    vendor: "",
    vendorId: "",
    warehouse: "",
    warehouseId: null,
    zoneId: null,
    locatorId: null,
    binId: null,
    status: GRN_STATUS.DRAFT
  });

  const [isVendorSearchOpen, setIsVendorSearchOpen] = useState(false);


  const [lpoList, setLpoList] = useState([]);
  const [products, setProducts] = useState([]); // State for products
  const [isProductSelectionOpen, setIsProductSelectionOpen] = useState(false); // State for Product Selector

  // Add state for expandable rows
  const [expandedRows, setExpandedRows] = useState({});

  // ✅ GLOBAL SHORTCUTS
  useShortcuts({
    'ctrl+p': (e) => {
      if (!isLocked) setIsProductSelectionOpen(prev => !prev);
    },
    'ctrl+s': (e) => {
      if (!isLocked) onSaveDraft(formData, items);
    },
    'alt+v': (e) => {
      if (!isLocked) setIsVendorSearchOpen(prev => !prev);
    }
  });

  const toggleAllDescriptions = () => {
    if (Object.keys(expandedRows).length > 0) {
      setExpandedRows({});
    } else {
      const allExpanded = {};
      items.forEach(item => allExpanded[item.id] = true);
      setExpandedRows(allExpanded);
    }
  };

  const toggleRowDescription = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Location Data
  const [zoneList, setZoneList] = useState([]);
  const [locatorList, setLocatorList] = useState([]);
  const [binList, setBinList] = useState([]);

  // FIX 5: Lock UI on POSTED
  const isLocked = formData.status === GRN_STATUS.POSTED;

  // Fetch initial data
  useEffect(() => {
    // Fetch LPOs
    getLpos().then((data) => {
      setLpoList(Array.isArray(data) ? data : []);
    }).catch(err => console.error("Failed to fetch LPOs", err));



    // Fetch vendors
    getVendors().then((data) => {
      setVendors(Array.isArray(data) ? data : []);
    }).catch(err => console.error("Failed to fetch vendors", err));

    // Fetch warehouses
    getWarehouses().then((data) => {
      setWarehouses(Array.isArray(data) ? data : []);
    }).catch(err => console.error("Failed to fetch warehouses", err));

    // Fetch products for the selector
    getProducts().then((data) => {
      const normalizedProducts = (data || []).map(p => ({
        id: p.product?.id || p.id,
        code: p.product?.code || p.code,
        name: p.product?.name || p.name,
        unit: p.inventory?.defaultUnit?.name || p.unit || '',
        stock: p.inventory?.onHand || p.stock || 0,
        sku: p.product?.sku || p.sku || '-',
        salesPrice: p.pricing?.salesPrice || p.pricing?.price || p.salesPrice || p.price || 0, // Added p.price fallback
        lastPrice: p.pricing?.cost || p.cost || 0,
        cost: p.pricing?.cost || p.cost || 0, // Explicit cost
        price: p.pricing?.cost || p.cost || 0, // Use cost for GRN
        maxDiscount: p.product?.maxDiscount || 0,
        image: p.primaryImage // Will be processed by getImageUrl in selector
      }));
      setProducts(normalizedProducts);
    }).catch(err => console.error("Failed to fetch products", err));
  }, []);

  // NEW: Effect to load location hierarchy when initialData (Draft) is loaded
  useEffect(() => {
    if (initialData && initialData.warehouseId) {
      // Load Zones
      getWarehouseZones(initialData.warehouseId).then(zones => {
        setZoneList(Array.isArray(zones) ? zones : []);

        // If Zone exists, Load Locators
        if (initialData.zoneId) {
          getZoneLocators(initialData.zoneId).then(locators => {
            setLocatorList(Array.isArray(locators) ? locators : []);

            // If Locator exists, Load Bins
            if (initialData.locatorId) {
              getLocatorBins(initialData.locatorId).then(bins => {
                setBinList(Array.isArray(bins) ? bins : []);
              });
            }
          });
        }
      });
    }
  }, [initialData]);

  const [selectedLpoDetails, setSelectedLpoDetails] = useState(null);

  const fetchLpoDetails = async (lpoNumber) => {
    if (!lpoNumber) {
      setSelectedLpoDetails(null);
      setFormData(prev => ({
        ...prev,
        vendor: "",
        vendorId: "",
        warehouse: "",
        warehouseId: ""
      }));
      setItems([]);
      setSelectedVendorDetails(null);
      return;
    }
    try {
      const lpo = await getLpoByNumber(lpoNumber);
      setSelectedLpoDetails(lpo);

      // Find vendor from vendors list
      const vendor = vendors.find(v => v.id === lpo.vendorId || v.name === lpo.vendorName);

      // Find warehouse from warehouses list
      const warehouse = warehouses.find(w =>
        w.id === lpo.warehouseId ||
        w.name === lpo.warehouse ||
        w.name === lpo.deliveryWarehouse
      );

      setFormData(prev => ({
        ...prev,
        lpo: lpo.lpoNumber || lpo.id,
        vendor: vendor ? vendor.name : lpo.vendorName || lpo.vendor || "",
        vendorId: vendor ? vendor.id : lpo.vendorId || "",
        warehouse: warehouse ? warehouse.name : lpo.warehouse || lpo.deliveryWarehouse || "",
        warehouseId: warehouse ? warehouse.id : lpo.warehouseId || "",
        zoneId: lpo.zoneId || null,
        locatorId: lpo.locatorId || null,
        binId: lpo.binId || null
      }));

      // Auto-fetch location hierarchy if warehouse is present
      if (warehouse?.id || lpo.warehouseId) {
        const whId = warehouse?.id || lpo.warehouseId;
        getWarehouseZones(whId).then(zones => {
          setZoneList(Array.isArray(zones) ? zones : []);
          const linkedZoneId = lpo.zoneId;

          if (linkedZoneId) {
            getZoneLocators(linkedZoneId).then(locators => {
              setLocatorList(Array.isArray(locators) ? locators : []);
              const linkedLocatorId = lpo.locatorId;

              if (linkedLocatorId) {
                getLocatorBins(linkedLocatorId).then(bins => {
                  setBinList(Array.isArray(bins) ? bins : []);
                }).catch(console.error);
              }
            }).catch(console.error);
          }
        }).catch(console.error);
      }

      // Set vendor details
      if (vendor) {
        setSelectedVendorDetails(vendor);
      }

      // Map LPO items to GRN items
      if (lpo.items && Array.isArray(lpo.items)) {
        const grnItems = lpo.items
          .map(lpoItem => {
            const pid = lpoItem.productId || lpoItem.product?.id;
            const unitPrice = Number(lpoItem.unitPrice || lpoItem.price || 0);
            const discount = Number(lpoItem.discountPercent || 0);
            const netCost = unitPrice * (1 - discount / 100);

            const totalQty = lpoItem.quantity || lpoItem.qty || 0;
            const prevReceived = lpoItem.receivedQuantity || 0;
            const pending = Math.max(0, totalQty - prevReceived);

            if (!pid) {
              console.error("LPO ITEM MISSING PRODUCT ID:", lpoItem);
            }

            return {
              id: lpoItem.id || Date.now() + Math.random(),

              productId: pid,
              code: lpoItem.itemCode || lpoItem.code || `SKU-${Date.now()}`,
              barcode: lpoItem.barcode || lpoItem.productBarcode || '',
              name: lpoItem.itemName || lpoItem.name || "Item",
              image: lpoItem.primaryImage || lpoItem.image || lpoItem.thumbnailUrl || lpoItem.imageUrl || null,
              uom: lpoItem.uom || lpoItem.unit || "Unit",

              lpoQty: totalQty,
              prevReceived: prevReceived, // Store for UI/Validation

              received: pending, // Default to pending qty
              accepted: pending, // Default accepted to pending
              rejected: 0,

              unitCost: unitPrice,
              lpoPrice: unitPrice,

              disc: discount,
              netCost: netCost,

              total: pending * netCost,
              variance: 0, // No variance initially as we match pending

              batch: Boolean(lpoItem.isBatchTracked || lpoItem.batchTracked)
            };
          })
          .filter(item => item.received > 0); // Only show items with pending quantity

        setItems(grnItems);
      } else {
        setItems([]);
      }


    } catch (error) {
      console.error("Failed to fetch LPO details:", error);
      setSelectedLpoDetails(null);
      setFormData(prev => ({
        ...prev,
        vendor: "",
        vendorId: "",
        warehouse: "",
        warehouseId: ""
      }));
      setItems([]);
      setSelectedVendorDetails(null);
    }
  };



  // Load Data if editing
  useEffect(() => {
    if (!initialData) return;

    // FIX 6: Use only status from initialData
    setFormData({
      grnNo: initialData.grnNo,
      date: initialData.date,
      lpo: (initialData.docRef && initialData.docRef !== 'Manual' && initialData.docRef !== '(Link-Lost)')
        ? initialData.docRef
        : initialData.lpo || "",
      vendor: initialData.vendor,
      warehouse: initialData.warehouse,
      warehouseId: initialData.warehouseId,
      zoneId: initialData.zoneId,
      locatorId: initialData.locatorId,
      binId: initialData.binId,
      status: initialData.status // No qcStatus or posted
    });

    // Load Cascading Locations
    if (initialData.warehouseId) getWarehouseZones(initialData.warehouseId).then(setZoneList).catch(console.error);
    if (initialData.zoneId) getZoneLocators(initialData.zoneId).then(setLocatorList).catch(console.error);
    if (initialData.locatorId) getLocatorBins(initialData.locatorId).then(setBinList).catch(console.error);

    setItems(
      initialData.items.map(i => ({
        ...i,
        variance: i.received - i.lpoQty
      }))
    );
  }, [initialData]);


  // Modal State
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [isCompareModalOpen, setCompareModalOpen] = useState(false);
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);
  const [selectedAddonItem, setSelectedAddonItem] = useState(null);

  const handleOpenBatchModal = (item) => {
    setSelectedBatchItem(item);
    setBatchModalOpen(true);
  };

  // Handle LPO selection change
  const handleLpoChange = (val) => {
    const selectedLpoNumber = val;
    setFormData(prev => ({ ...prev, lpo: selectedLpoNumber }));
    fetchLpoDetails(selectedLpoNumber);
  };

  // Handle DP selection change


  // Handle Vendor change (for direct GRNs)
  const handleVendorChange = (e) => {
    const vendorId = e.target.value;
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor) {
      setFormData(prev => ({
        ...prev,
        vendor: vendor.name,
        vendorId: vendor.id
      }));
      setSelectedVendorDetails(vendor);
    }
  };

  // Handle Warehouse change
  const handleWarehouseChange = (e) => {
    const wId = e.target.value;
    const warehouse = warehouses.find(w => w.id == wId);

    setFormData(prev => ({
      ...prev,
      warehouse: warehouse ? warehouse.name : "",
      warehouseId: wId,
      zoneId: null, locatorId: null, binId: null
    }));
    if (wId) getWarehouseZones(wId).then(setZoneList).catch(console.error);
    else setZoneList([]);
  };

  // Handle GRN Type change
  const handleGrnTypeChange = (e) => {
    const newGrnType = e.target.value;
    setGrnType(newGrnType);

    // Reset fields when switching types
    setFormData(prev => ({
      ...prev,
      lpo: "",
      vendor: "",
      vendorId: "",
      warehouse: "",
      warehouseId: ""
    }));
    setItems([]);
    setSelectedLpoDetails(null);
    setSelectedVendorDetails(null);
  };

  const handleAddSingleProduct = (product) => {
    const defaultUnit = product.unitName || product.unit || (product.availableUnits && product.availableUnits[0]) || 'PCS';
    const unitCost = product.cost || product.salesPrice || 0;
    const newItem = {
      id: Date.now(),
      productId: product.id,
      code: product.code,
      barcode: product.barcode || '',
      name: product.description || product.name,
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || null,
      remarks: product.description || '',
      uom: defaultUnit,
      lpoQty: 0, // No LPO qty for manually added items
      received: 1,
      accepted: 1,
      rejected: 0,
      unitCost,
      lpoPrice: 0,
      disc: 0,
      netCost: unitCost,
      total: unitCost,
      variance: 1, // Received 1 without LPO
      batch: false, // Default to false
      foc: 0,
      focUnit: defaultUnit,
      availableUnits: product.availableUnits || [defaultUnit],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {}
    };
    setItems(prev => [...prev, newItem]);
    setIsProductSelectionOpen(false);
  };

  // Add Row Handler
  const handleAddItem = () => {
    const newItem = {
      id: Date.now(),
      code: 'SKU-NEW',
      name: 'New Item Entry',
      uom: 'Unit',
      lpoQty: 0,
      received: 0,
      rejected: 0,
      accepted: 0,
      unitCost: 0,
      lpoPrice: 0,
      disc: 0,
      netCost: 0,
      total: 0,
      variance: 0,
      batch: true,
      remarks: ''
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter(i => i.id !== id));
  };

  const recalculateItemTotals = (item) => {
    const focQty = Number(item.foc) || 0;
    let focDeduction = 0;

    if (focQty > 0 && item.focUnit && item.unitConversions) {
      const sellingUnit = item.uom;
      const focUnit = item.focUnit;
      if (sellingUnit === focUnit) {
        focDeduction = item.unitCost * focQty;
      } else {
        const focConvFactor = item.unitConversions[focUnit] || 1;
        const sellingConvFactor = item.unitConversions[sellingUnit] || 1;
        const focInSellingUnit = (focQty * focConvFactor) / sellingConvFactor;
        focDeduction = item.unitCost * focInSellingUnit;
      }
    }

    const grossCost = (Number(item.unitCost) || 0) * (Number(item.accepted) || 0);
    const focAdjustedCost = Math.max(0, grossCost - focDeduction);
    const discAmt = focAdjustedCost * ((Number(item.disc) || 0) / 100);

    return {
      ...item,
      netCost: Number(item.unitCost) || 0,
      total: Math.max(0, focAdjustedCost - discAmt)
    };
  };

  const getAddonModalItem = (item) => {
    const resolvedUnit = item.uom || item.unit || 'PCS';
    return {
      ...item,
      desc: item.remarks || item.name || item.desc,
      unit: resolvedUnit,
      price: Number(item.unitCost) || 0,
      disc: Number(item.disc) || 0,
      foc: Number(item.foc) || 0,
      focUnit: item.focUnit || resolvedUnit,
      tax: Number(item.tax) || 0,
      cost: Number(item.unitCost) || 0,
      availableUnits: item.availableUnits || [resolvedUnit]
    };
  };

  const handleAddonSave = (updated) => {
    const resolvedPrice = Number(updated.price) || 0;
    const resolvedDiscount = Number(updated.disc) || 0;
    const resolvedFoc = Number(updated.foc) || 0;

    setItems(prev => prev.map(item => {
      if (item.id !== updated.id) return item;

      const resolvedUnit = updated.unit || item.uom || item.unit || 'PCS';
      return recalculateItemTotals({
        ...item,
        unitCost: resolvedPrice,
        disc: resolvedDiscount,
        foc: resolvedFoc,
        focUnit: updated.focUnit || item.focUnit || resolvedUnit,
        uom: resolvedUnit,
        tax: Number(updated.tax) || 0
      });
    }));
    setSelectedAddonItem(null);
  };

  // Calculation Logic
  const handleQtyChange = (id, field, value) => {
    if (isLocked) return; // Prevent changes if posted
    const isStringField = (field === 'uom' || field === 'focUnit');
    const val = isStringField ? value : Number(value);
    setItems(items.map(item => {
      if (item.id === id) {
        let updated = { ...item, [field]: val };

        // Logic for 3-way binding
        if (field === 'received') {
          // If received changes, accepted updates (rejected stays same)
          updated.accepted = Math.max(0, updated.received - updated.rejected);
          updated.variance = updated.received - updated.lpoQty;
        }
        else if (field === 'rejected') {
          // If rejected changes, accepted updates
          updated.accepted = Math.max(0, updated.received - updated.rejected);
        }
        else if (field === 'accepted') {
          // If accepted changes, rejected updates
          updated.rejected = Math.max(0, updated.received - updated.accepted);
        }
        else if (field === 'uom' && item.unitConversions) {
          // ✅ If unit changes, scale the cost
          const newUnit = value;
          if (item.unitPrices && item.unitPrices[newUnit]) {
            updated.unitCost = item.unitPrices[newUnit];
          } else {
            const baseUnit = Object.keys(item.unitConversions).find(u => item.unitConversions[u] === 1);
            if (baseUnit) {
              let basePrice = item.unitPrices && item.unitPrices[baseUnit] ? item.unitPrices[baseUnit] : null;
              if (!basePrice) {
                const currentConv = item.unitConversions[item.uom] || 1;
                basePrice = item.unitCost / currentConv;
              }
              updated.unitCost = basePrice * (item.unitConversions[newUnit] || 1);
            }
          }
        }

        return recalculateItemTotals(updated);
      }
      return item;
    }));
  };

  const totals = useMemo(() => {
    return items.reduce((acc, curr) => {
      acc.received += curr.received;
      acc.accepted += curr.accepted;
      acc.rejected += curr.rejected;
      acc.value += curr.total;
      return acc;
    }, { received: 0, accepted: 0, rejected: 0, value: 0 });
  }, [items]);

  // FIX 1: Correct workflow badge logic based on single status
  const getWorkflowBadge = () => {
    switch (formData.status) {
      case GRN_STATUS.POSTED:
        return <StatusBadge className="bg-emerald-100 text-emerald-700 border-emerald-200">Posted</StatusBadge>;
      case GRN_STATUS.QC_COMPLETED:
        return <StatusBadge className="bg-blue-100 text-blue-700 border-blue-200">QC Completed</StatusBadge>;
      case GRN_STATUS.QC_PENDING:
        return <StatusBadge className="bg-orange-100 text-orange-700 border-orange-200">QC Pending</StatusBadge>;
      default:
        return <StatusBadge className="bg-slate-100 text-slate-700 border-slate-200">Draft</StatusBadge>;
    }
  };



  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 relative flex-1">

      {/* Batch Modal */}
      <BatchModal
        isOpen={isBatchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        item={selectedBatchItem}
        disabled={isLocked}
      />

      {/* Comparison Modal */}
      <CompareLPOModal
        isOpen={isCompareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        items={items}
      />

      {/* Modified Grid Layout: 1 (Left) - 3 (Middle) - 1 (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* --- LEFT SIDEBAR: GRN INFO --- */}
        <div className="xl:col-span-1 space-y-4 order-2 xl:order-1">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-sm text-slate-700">GRN Info</h3>
              </div>
              {getWorkflowBadge()}
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">GRN No</label>
                <input type="text" value={formData.grnNo} readOnly className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-500 font-mono" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">GRN Date</label>
                <input type="date" value={formData.date} disabled={isLocked} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-600" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">GRN Type</label>
                <div className="relative">
                  <select
                    value={grnType}
                    onChange={handleGrnTypeChange}
                    disabled={isLocked}
                    className="w-full text-xs border border-slate-200 rounded p-2 bg-white text-slate-700 appearance-none"
                  >
                    <option value="Against LPO">Against LPO</option>
                    <option value="Direct GRN">Direct Purchase</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {grnType === "Against LPO" && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">LPO No</label>
                  <div className="relative">
                    <SearchableDropdown
                      options={lpoList.map(lpo => ({
                        value: lpo.lpoNumber || lpo.id,
                        label: `${lpo.lpoNumber || lpo.id} - ${lpo.vendorName || lpo.vendor || "Vendor"}`
                      }))}
                      value={formData.lpo}
                      onChange={handleLpoChange}
                      placeholder="Select LPO"
                      disabled={isLocked}
                    />
                  </div>
                </div>
              )}

              {(grnType === "Direct GRN" || grnType === "Direct Return") && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor</label>
                  {formData.vendor ? (
                    <div className={`bg-slate-50 border border-slate-200 rounded-md p-4 relative group ${isLocked ? 'opacity-70 pointer-events-none' : ''}`}>
                      <button
                        onClick={() => !isLocked && setIsVendorSearchOpen(true)}
                        disabled={isLocked}
                        className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded-md transition-all text-slate-500"
                        title="Change Vendor"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                      <div className="font-bold text-slate-800 text-sm mb-1">{formData.vendor}</div>
                    </div>
                  ) : (
                    <button
                      onClick={() => !isLocked && setIsVendorSearchOpen(true)}
                      disabled={isLocked}
                      className={`w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 transition-colors ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <span className="text-slate-400">Select Vendor...</span>
                      <Search className="h-4 w-4 text-slate-400" />
                    </button>
                  )}

                  <VendorSelector
                    isOpen={isVendorSearchOpen}
                    onClose={() => setIsVendorSearchOpen(false)}
                    onSelect={(v) => {
                      setFormData(prev => ({
                        ...prev,
                        vendorId: v?.id || v?.code || '',
                        vendor: v?.name || ''
                      }));
                      setSelectedVendorDetails(v);
                    }}
                    vendors={vendors}
                    selectedCode={formData.vendorId || ''}
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor Delivery Note</label>
                <input type="text" defaultValue="DN-12345" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor Invoice No</label>
                <input type="text" defaultValue="INV-98765" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Shipment / Container No</label>
                <input type="text" defaultValue="SHIP-001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Packing List No</label>
                <input type="text" defaultValue="PL-001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
            </div>
          </div>

          {/* Vendor Details Box */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Vendor Details</h3>
            </div>
            <div className="bg-slate-50/50 rounded p-3 text-xs border border-slate-100 space-y-2">
              <div className="flex justify-between font-medium text-slate-900 pb-1 border-b border-slate-100 mb-1">
                <span className="text-slate-500 font-normal">Vendor</span>
              </div>
              <div className="font-medium text-slate-800 flex justify-between items-center">
                {formData.vendor || "Select Vendor/LPO"}
                <span className="text-slate-400"><MoreHorizontal size={14} /></span>
              </div>

              {selectedVendorDetails && (
                <>
                  <div className="flex justify-between text-slate-500 pt-2">
                    <span>Vendor Code</span>
                    <span className="font-medium text-slate-700">{selectedVendorDetails.code || selectedVendorDetails.vendorCode || "N/A"}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Contact</span>
                    <span className="font-medium text-slate-700">{selectedVendorDetails.contactPerson || selectedVendorDetails.contact || "N/A"}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Phone</span>
                    <span className="font-medium text-slate-700">{selectedVendorDetails.phone || selectedVendorDetails.telephone || "N/A"}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Email</span>
                    <span className="font-medium text-slate-700">{selectedVendorDetails.email || "N/A"}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Payment Terms</span>
                    <span className="font-medium text-slate-700">{selectedVendorDetails.paymentTerms || "Net 30"}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Currency</span>
                    <span className="font-medium text-slate-700">{selectedVendorDetails.currency || "AED"}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>TRN</span>
                    <span className="font-mono text-[10px]">{selectedVendorDetails.taxNumber || selectedVendorDetails.trn || "N/A"}</span>
                  </div>
                </>
              )}

              {!selectedVendorDetails && (
                <div className="text-xs text-slate-400 italic text-center py-2">
                  Select an LPO or Vendor to see details
                </div>
              )}
            </div>
          </div>

          {/* Receiving Details Box */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Receiving Details</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Warehouse</label>
                <div className="relative">
                  <SearchableDropdown
                    options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                    value={formData.warehouseId}
                    onChange={(val) => {
                      const wh = warehouses.find(w => w.id === Number(val));
                      setFormData(prev => ({
                        ...prev,
                        warehouseId: val,
                        warehouse: wh ? wh.name : "",
                        zoneId: null, locatorId: null, binId: null
                      }));
                      if (val) getWarehouseZones(val).then(setZoneList).catch(console.error);
                      else setZoneList([]);
                    }}
                    placeholder="Select Warehouse"
                    disabled={isLocked}
                  />
                </div>
              </div>
              {formData.warehouseId && (
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Zone</label>
                  <div className="relative">
                    <SearchableDropdown
                      options={zoneList.map(z => ({ value: z.id, label: z.name }))}
                      value={formData.zoneId}
                      onChange={(val) => {
                        setFormData(prev => ({ ...prev, zoneId: val, locatorId: null, binId: null }));
                        if (val) getZoneLocators(val).then(setLocatorList).catch(console.error);
                        else setLocatorList([]);
                      }}
                      placeholder="Select Zone"
                      disabled={isLocked || !formData.warehouseId}
                    />
                  </div>
                </div>
              )}

              {formData.zoneId && (
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Locator</label>
                  <div className="relative">
                    <SearchableDropdown
                      options={locatorList.map(l => ({ value: l.id, label: l.name }))}
                      value={formData.locatorId}
                      onChange={(val) => {
                        setFormData(prev => ({ ...prev, locatorId: val, binId: null }));
                        if (val) getLocatorBins(val).then(setBinList).catch(console.error);
                        else setBinList([]);
                      }}
                      placeholder="Select Locator"
                      disabled={isLocked || !formData.zoneId}
                    />
                  </div>
                </div>
              )}

              {formData.locatorId && (
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Bin</label>
                  <div className="relative">
                    <SearchableDropdown
                      options={binList.map(b => ({ value: b.id, label: b.name }))}
                      value={formData.binId}
                      onChange={(val) => setFormData(prev => ({ ...prev, binId: val }))}
                      placeholder="Select Bin"
                      disabled={isLocked || !formData.locatorId}
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Received By</label>
                <div className="relative">
                  <input
                    type="text"
                    defaultValue="Ahmed Khan"
                    disabled={isLocked}
                    className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700"
                    placeholder="Receiver Name"
                  />
                </div>
              </div>



              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Checked By</label>
                <div className="relative">
                  <select disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700 appearance-none"><option>QC Supervisor</option></select>
                  <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Delivery Mode</label>
                <div className="relative">
                  <select disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700 appearance-none"><option>Supplier Delivery</option></select>
                  <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Packages Count</label>
                <input type="number" defaultValue="12" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Logistics</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Vehicle No</label>
                <input type="text" defaultValue="ABC-1234" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Driver Name</label>
                <input type="text" placeholder="Driver name" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Gate Entry No</label>
                <input type="text" defaultValue="GE-001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Dock No</label>
                <input type="text" defaultValue="DOCK-1" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Additional Notes</label>
                <textarea disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 h-12 text-slate-700 resize-none" placeholder="Unloading instructions, special notes..."></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* --- MIDDLE: ITEM LINES (EXTENDED) --- */}
        <div className="xl:col-span-3 space-y-4 order-1 xl:order-2">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full min-h-[600px]">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-sm text-slate-700">Item Lines <span className="text-xs font-normal text-slate-500 bg-slate-200 px-1.5 rounded ml-1">{items.length} items</span></h3>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCompareModalOpen(true);
                    setIsProductSelectionOpen(false); // Ensure conflict prevention
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                >
                  <ArrowRightLeft className="h-3 w-3" /> Compare LPO
                </button>
                <button className="px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1"><ScanLine className="h-3 w-3" /> Scan Items</button>
                {!isLocked && (
                  <>
                    <button
                      onClick={() => {
                        setIsProductSelectionOpen(true);
                        setCompareModalOpen(false); // Ensure conflict prevention
                      }}
                      className="px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Select Product
                    </button>
                    {/* Add Row Button Removed */}
                  </>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="p-3 font-medium min-w-[280px]">
                      <ItemDescriptionHeader
                        itemCount={items.length}
                        expandedRowsCount={Object.keys(expandedRows).length}
                        onToggleAll={toggleAllDescriptions}
                      />
                    </th>
                    <th className="p-3 font-medium text-center">UOM</th>
                    <th className="p-3 font-medium text-center">LPO Qty</th>
                    <th className="p-3 font-medium text-center">Received</th>
                    <th className="p-3 font-medium text-center text-emerald-600">Accepted</th>
                    <th className="p-3 font-medium text-center text-red-600">Rejected</th>
                    <th className="p-3 font-medium text-center">FOC</th>
                    <th className="p-3 font-medium text-right">Unit Cost</th>
                    <th className="p-3 font-medium text-center w-12">Disc %</th>
                    <th className="p-3 font-medium text-right">Net Cost</th>
                    <th className="p-3 font-medium text-right">Line Total</th>
                    <th className="p-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.length === 0 ? (
                    <tr><td colSpan="14" className="p-8 text-center text-slate-400">No items added. {grnType === "Against LPO" || grnType === "Against Direct Purchase" ? "Select an Document to load items or click 'Add Row' to manually add items." : "Click 'Add Row' to add items."}</td></tr>
                  ) : items.map(item => (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50 group">
                        <td className="p-3">
                          <ItemDescriptionCell
                            item={item}
                            isExpanded={expandedRows[item.id]}
                            onToggleExpand={toggleRowDescription}
                            onItemChange={(id, field, val) => setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i))}
                            onFocusCode={() => { }}
                            onOpenProductSelection={!isLocked ? () => setIsProductSelectionOpen(true) : undefined}
                            onCheckStock={() => { }}
                            onOpenSettings={() => setSelectedAddonItem(getAddonModalItem(item))}
                            showSettings={true}
                            isReadOnly={isLocked}
                            showTaxDiscount={false}
                          />
                        </td>
                        {/* UOM Dropdown */}
                        <td className="p-3 text-center">
                          <select
                            disabled={isLocked}
                            className="w-full bg-transparent outline-none text-center text-xs text-slate-600 appearance-none font-medium cursor-pointer disabled:opacity-50"
                            value={item.uom || 'PCS'}
                            onChange={(e) => handleQtyChange(item.id, 'uom', e.target.value)}
                          >
                            {(item.availableUnits || [item.uom || 'PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="p-3 text-center text-slate-400">{item.lpoQty}</td>
                        <td className="p-3 text-center">
                          <div className="relative">
                            <input
                              type="number"
                              value={item.received}
                              disabled={isLocked}
                              onChange={(e) => handleQtyChange(item.id, 'received', e.target.value)}
                              className={`w-14 text-center border rounded py-1 outline-none focus:ring-1 focus:ring-emerald-500 ${item.variance !== 0 ? 'border-amber-300 bg-[#FFF8E1] text-amber-700 font-bold' : 'border-slate-200'}`}
                            />
                            {item.variance !== 0 && <span className={`absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-bold ${item.variance > 0 ? 'text-green-500' : 'text-red-500'}`}>{item.variance > 0 ? `+${item.variance}` : item.variance}</span>}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            value={item.accepted}
                            disabled={isLocked}
                            onChange={(e) => handleQtyChange(item.id, 'accepted', e.target.value)}
                            className="w-14 text-center border border-slate-200 rounded py-1 outline-none focus:ring-1 focus:ring-emerald-500 font-medium text-slate-700"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            value={item.rejected}
                            disabled={isLocked}
                            onChange={(e) => handleQtyChange(item.id, 'rejected', e.target.value)}
                            className={`w-14 text-center border rounded py-1 outline-none focus:ring-1 focus:ring-red-200 ${item.rejected > 0 ? 'border-red-200 bg-red-50 text-red-600 font-bold' : 'border-slate-200 text-slate-400'}`}
                          />
                        </td>
                        {/* FOC */}
                        <td className="p-3 text-center align-top">
                          <div className="flex flex-col gap-1">
                            <input
                              disabled={isLocked}
                              type="number"
                              className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 text-center outline-none font-semibold text-xs text-slate-700 transition-colors py-1 disabled:opacity-50"
                              value={item.foc === 0 ? '' : item.foc || ''}
                              onChange={(e) => handleQtyChange(item.id, 'foc', e.target.value)}
                              placeholder="—"
                            />
                            <select
                              disabled={isLocked}
                              className="w-full bg-transparent outline-none text-center text-[10px] text-slate-500 appearance-none font-medium cursor-pointer disabled:opacity-50"
                              value={item.focUnit || item.uom || 'PCS'}
                              onChange={(e) => handleQtyChange(item.id, 'focUnit', e.target.value)}
                            >
                              {(item.availableUnits || [item.uom || 'PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="p-3 text-right text-slate-500">{item.unitCost.toFixed(2)}</td>
                        <td className="p-3 text-center text-slate-500">
                          {item.disc}%
                        </td>
                        <td className="p-3 text-right text-slate-700 font-medium">
                          {item.netCost.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-bold text-[#F5C742]">{item.total.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          {!isLocked && (
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Description Row */}
                      {expandedRows[item.id] && (
                        <tr className="bg-white">
                          <td colSpan={10} className="px-0 pb-4 pt-1">
                            <div className="ml-0 mr-4 p-3 rounded-r-[10px] border-l-[3px] border-[#FFD700] bg-[#FFFDE7]/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                              <div className="flex justify-between items-center mb-1.5">
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#B8860B] tracking-widest uppercase">
                                  <Menu size={10} strokeWidth={3} className="opacity-80" /> QC / GRN REMARKS
                                </div>
                              </div>
                              <textarea
                                className="w-full text-xs text-slate-700 bg-white/80 border border-slate-200/60 rounded p-2 outline-none focus:border-[#FFD700] hover:border-[#FFD700]/50 transition-colors min-h-[40px] resize-y placeholder:text-slate-400"
                                placeholder="Enter QC notes or internal description..."
                                disabled={isLocked}
                                value={item.remarks || ''}
                                onChange={(e) => {
                                  setItems(prev => prev.map(i => i.id === item.id ? { ...i, remarks: e.target.value } : i))
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- RIGHT SIDEBAR: QC & SUMMARY --- */}
        <div className="xl:col-span-1 space-y-4 order-3">

          {/* QC Summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardCheck className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">QC Summary</h3>
            </div>
            <div className="p-2 space-y-2">
              <div className="flex justify-between items-center">
                <div className="text-xs text-slate-500 font-medium">QC Status</div>
                {getWorkflowBadge()}
              </div>

              <div className="h-px bg-slate-100 my-2"></div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total Items</span>
                  <span className="font-medium text-slate-700">{items.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Items With Variance</span>
                  <span className="font-bold text-red-500">{items.filter(i => i.variance !== 0).length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Batch Count</span>
                  <span className="font-medium text-slate-700">{items.filter(i => i.batch).length}</span>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">QC Notes</label>
                <div className="text-xs text-slate-400 italic">Quality inspection notes...</div>
              </div>

              <button className="w-full mt-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1">
                <Camera className="h-3 w-3" /> Attach Photos
              </button>
            </div>
          </div>

          {/* Value Summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">GRN Value</h3>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="border border-slate-100 p-2 rounded text-center">
                <div className="text-[10px] text-slate-500 uppercase">Received</div>
                <div className="text-lg font-bold text-slate-700">{totals.received}</div>
              </div>
              <div className="border border-emerald-50 bg-emerald-50/50 p-2 rounded text-center">
                <div className="text-[10px] text-emerald-600 uppercase">Accepted</div>
                <div className="text-lg font-bold text-emerald-700">{totals.accepted}</div>
              </div>
              <div className="border border-red-50 bg-red-50/50 p-2 rounded text-center">
                <div className="text-[10px] text-red-600 uppercase">Rejected</div>
                <div className="text-lg font-bold text-red-700">{totals.rejected}</div>
              </div>
              <div className="border border-slate-100 p-2 rounded text-center">
                <div className="text-[10px] text-slate-500 uppercase">Variance</div>
                <div className="text-lg font-bold text-amber-600">{items.reduce((acc, i) => acc + i.variance, 0)}</div>
              </div>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Subtotal</span>
                <span className="font-medium">{totals.value.toFixed(2)} AED</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span className="font-medium">Discount</span>
                <span className="font-medium">-55.20 AED</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">VAT (5%)</span>
                <span className="font-medium">{(totals.value * 0.05).toFixed(2)} AED</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-slate-100 mt-2">
                <span className="font-bold text-slate-800">Grand Total</span>
                <span className="font-bold text-[#F5C742]">{(totals.value * 1.05).toFixed(2)} AED</span>
              </div>
            </div>
          </div>

          {/* Alerts if any */}
          {totals.rejected > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1 text-red-700 font-semibold text-xs">
                <AlertTriangle className="h-3 w-3" /> Alerts
              </div>
              <div className="text-[10px] text-red-600 bg-white border border-red-100 p-1.5 rounded">
                ⚠ Rejected items detected: Check QC notes.
              </div>
            </div>
          )}

          {/* Accounting */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-slate-400 font-serif font-bold">$</span>
              <h3 className="font-semibold text-sm text-slate-700">Accounting</h3>
            </div>
            <div className="bg-slate-50 bg-opacity-50 rounded p-3 text-[9px] space-y-1.5 font-mono text-slate-600 border border-slate-100">
              <div className="flex justify-between font-bold text-blue-700 mb-1 border-b border-blue-100 pb-1">GRNI Posting Preview</div>
              <div className="flex justify-between"><span>Dr. Inventory</span><span>1698.80</span></div>
              <div className="flex justify-between"><span>Cr. GRNI</span><span>1698.80</span></div>
              <div className="flex justify-between"><span>Dr. VAT Recoverable</span><span>84.94</span></div>
            </div>
            <button className="w-full mt-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1">
              <Eye className="h-3 w-3" /> View Details
            </button>
          </div>

          {/* Vendor Score */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-3 w-3 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Vendor Score</h3>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Delivery Accuracy</span><span className="text-green-600 font-bold">95%</span></div>
              <div className="flex justify-between"><span>Price Accuracy</span><span className="text-green-600 font-bold">98%</span></div>
              <div className="flex justify-between"><span>QC Pass Rate</span><span className="text-amber-600 font-bold">92%</span></div>
            </div>
            <div className="mt-3 text-center">
              <div className="flex justify-center text-[#F5C742] text-xs">★★★★☆</div>
              <span className="text-[9px] text-slate-400">Will update on GRN post</span>
            </div>
          </div>

        </div>
      </div>

      {/* Footer / Status Bar (Editor Mode Only) */}
      <div className="sticky bottom-0 left-0 right-0 -mx-4 md:-mx-6 -mb-4 md:-mb-6 bg-white border-t-2 border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 z-50">
        <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row justify-between items-center text-xs text-slate-400 gap-3 xl:gap-0 px-4">
          <div className="flex items-center gap-2 w-full xl:w-auto justify-center xl:justify-start">
            <History className="h-3 w-3" />
            <span>Draft → QC Pending → QC Completed → Posted</span>
          </div>
          <div className="flex flex-wrap justify-center xl:justify-end items-center gap-2 w-full xl:w-auto">
            {/* Only show Save Draft if not posted */}
            {!isLocked && (
              <button onClick={() => onSaveDraft(formData, items)} className="px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors">
                Save Draft
              </button>
            )}

            {/* Only show Submit QC if Draft */}
            {formData.status === GRN_STATUS.DRAFT && (
              <button onClick={() => onSubmitQC(formData, items)} className="px-4 py-2 bg-white border border-blue-200 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors">
                <ClipboardCheck className="h-4 w-4" /> Submit for QC
              </button>
            )}

            <button onClick={() => onPrint({ ...formData, items })} className="px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors">
              <Printer className="h-4 w-4" /> Print
            </button>

            {/* Only show Post if QC is Completed and not yet Posted */}
            {formData.status === GRN_STATUS.QC_COMPLETED && (
              <button onClick={onPost} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded font-bold text-slate-900 flex items-center justify-center gap-2 shadow-sm transition-colors">
                <Share2 className="h-4 w-4" /> Post GRN
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Item Add-Ons Modal */}
      <ItemAddOnsModal
        item={selectedAddonItem}
        onClose={() => setSelectedAddonItem(null)}
        onSave={handleAddonSave}
      />

      {/* Product Selector Modal */}
      <ProductSelector
        isOpen={isProductSelectionOpen}
        onClose={() => setIsProductSelectionOpen(false)}
        onSelect={handleAddSingleProduct}
        actionLabel="Add to GRN"
      />

      {/* Compare LPO Modal */}
      <CompareLPOModal
        isOpen={isCompareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        items={items}
      />
    </div>
  );
};

// ==========================================
// 4. MAIN COMPONENT
// ==========================================

const GRN = () => {
  const navigate = useNavigate();
  const [activeNavTab, setActiveNavTab] = useState("list");
  const [grns, setGrns] = useState([]);
  const [qcQueue, setQcQueue] = useState([]);
  const [activeFilter, setActiveFilter] = useState("All GRNs");

  // State for Editing
  const [currentGrnData, setCurrentGrnData] = useState(null);
  const [grnType, setGrnType] = useState("Against LPO");

  const fetchGrns = async () => {
    try {
      const data = await getGrns();
      if (Array.isArray(data)) {
        setGrns(data);
        // FIX 2: Filter QC queue using only status
        const pending = data.filter(g => g.status === GRN_STATUS.QC_PENDING);
        setQcQueue(pending);
      }
    } catch (error) {
      console.error("Failed to fetch GRNs", error);
    }
  };

  useEffect(() => {
    fetchGrns();
  }, []);

  // FIX 3: Shared payload logic to prevent duplication
  const persistGrn = async (formData, items, status) => {
    const payload = {
      date: formData.date,
      vendor: formData.vendor,
      lpo: formData.lpo || null,
      warehouseId: formData.warehouseId ? Number(formData.warehouseId) : null,
      // ✅ Send location hierarchy so GRN stores full zone/locator/bin
      zoneId: formData.zoneId ? Number(formData.zoneId) : null,
      locatorId: formData.locatorId ? Number(formData.locatorId) : null,
      binId: formData.binId ? Number(formData.binId) : null,
      status: status,
      packages: items.length,
      items: items.map(i => ({
        productId: i.productId,
        code: i.code,
        name: i.name,
        uom: i.uom,
        lpoQty: i.lpoQty,
        received: i.received,
        accepted: i.accepted,
        rejected: i.rejected,
        unitCost: i.unitCost,
        netCost: i.netCost,
        total: i.total,
        batch: i.batch,
        focQty: Number(i.foc) || 0,
        focUnit: i.focUnit || i.uom || 'PCS'
      }))
    };

    const saved = currentGrnData?.id
      ? await updateGrn(currentGrnData.id, payload)
      : await createGrn(payload);

    return saved;
  };

  // Workflow Handlers
  const handleSaveDraft = async (formData, items) => {

    // ✅ PRODUCT SAFETY CHECK (ADD HERE)
    if (items.some(i => !i.productId)) {
      alert("One or more items are missing Product mapping");
      return;
    }

    const saved = await persistGrn(formData, items, GRN_STATUS.DRAFT);
    setCurrentGrnData(saved);
    await fetchGrns();
    setActiveNavTab("list");
  };


  const handleSubmitQC = async (formData, items) => {
    // 1. Validation
    if (!items || items.length === 0) {
      alert("Cannot submit for QC: No items added.");
      return;
    }

    if (items.some(i => !i.productId)) {
      alert("Validation Failed: One or more items are missing Product mapping.");
      return;
    }

    if (!formData.warehouseId) {
      alert("Validation Failed: Warehouse is required.");
      return;
    }

    try {
      const saved = await persistGrn(formData, items, GRN_STATUS.QC_PENDING);
      setCurrentGrnData(saved);

      await submitGrnForQc(saved.id);
      alert("GRN Submitted for QC successfully!");
      await fetchGrns();
      setActiveNavTab("qc"); // Switch to QC tab
    } catch (error) {
      console.error("Submit QC Failed:", error);
      alert(`Failed to submit for QC: ${error.message || "Unknown error"}`);
    }
  };

  const handleApproveQC = async (item) => {
    try {
      // FIX 4: Backend must update status to QC_COMPLETED upon approval
      await approveGrnQc(item.id);
      alert(`QC Approved for ${item.id}. You can now Post the GRN.`);
      await fetchGrns();
    } catch (error) {
      console.error("Error approving QC", error);
    }
  };

  const handlePost = async (grnId) => {
    // Accept optional grnId (from list view quick-post)
    const id = grnId || currentGrnData?.id;
    if (!id) {
      alert("No GRN selected to post.");
      return;
    }

    try {
      await postGrn(id);
      alert("GRN posted successfully! Stock has been added to the warehouse.");
      await fetchGrns();
      setActiveNavTab("list");
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || "Unknown error";
      alert(`Failed to post GRN: ${msg}`);
      console.error("GRN Post Error:", error);
    }
  };


  const handleProceedToInvoice = async (grnId) => {
    try {
      const draft = await createDraftFromGrn(grnId);
      navigate('/purchases/invoice', { state: { fromGrn: draft } });
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || "Unknown error";
      toast.error(`Failed to prepare invoice: ${msg}`);
      console.error("Proceed to Invoice Error:", error);
    }
  };

  // View/Edit Handlers
  const handleEdit = async (grn) => {
    try {
      const fullData = await getGrnById(grn.id);
      setCurrentGrnData(fullData);
      // Need to set grnType based on data
      if (fullData.lpoNumber) {
        setGrnType("Against LPO"); // Or logic to detect direct
      } else {
        setGrnType("Direct GRN");
      }
      setActiveNavTab('editor');
    } catch (error) {
      console.error("Error fetching GRN details", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this GRN?")) {
      try {
        if (deleteGrn) {
          await deleteGrn(id);
          alert("GRN deleted successfully");
          await fetchGrns();
        } else {
          console.warn("deleteGrn API not implemented");
        }
      } catch (e) {
        console.error("Delete failed", e);
        alert("Failed to delete GRN");
      }
    }
  };

  const handlePrint = async (grn) => {
    try {
      const loadingToast = toast.loading('Preparing print layout...');
      const templates = await getTemplatesByCategory('Goods Receipt Note');

      if (!templates || templates.length === 0) {
        toast.dismiss(loadingToast);
        toast.error('No templates found for Goods Receipt Note');
        return;
      }

      const defaultTemplate = templates.find(t => t.isDefault) || templates[0];

      // Fetch full GRN details if needed
      let fullGrn = grn;
      if (!grn.items || grn.items.length === 0) {
        fullGrn = await getGrnById(grn.id);
      }
      toast.dismiss(loadingToast);

      // Map to standard print data
      const printData = {
        title: 'GOODS RECEIPT NOTE',
        docNo: fullGrn.grnNo || fullGrn.id || '-',
        date: fullGrn.date,
        customer: {
          name: fullGrn.vendor || fullGrn.vendorName || 'Unknown Vendor',
          address: fullGrn.vendorAddress || '',
          trn: fullGrn.vendorTrn || ''
        },
        items: (fullGrn.items || []).map(i => ({
          code: i.itemCode || i.code || '-',
          name: i.itemName || i.name || '',
          desc: i.description || i.shortDescription || '',
          sku: i.sku || i.productSku || '',
          localName: i.localName || i.productLocalName || '',
          unit: i.uom || i.unit || 'PCS',
          qty: Number(i.received || i.quantity || i.qty || 0),
          price: Number(i.unitCost || i.price || 0),
          disc: 0,
          tax: 0,
          taxAmt: 0,
          total: Number(i.total || (Number(i.received || 0) * Number(i.unitCost || 0)))
        })),
        totals: {
          subTotal: Number(fullGrn.totalValue || (fullGrn.items || []).reduce((acc, i) => acc + (Number(i.received || 0) * Number(i.unitCost || 0)), 0)),
          tax: 0,
          grandTotal: Number(fullGrn.totalValue || (fullGrn.items || []).reduce((acc, i) => acc + (Number(i.received || 0) * Number(i.unitCost || 0)), 0)),
          currency: 'AED'
        },
        meta: {
          status: fullGrn.status,
          notes: fullGrn.notes || '',
          refNo: fullGrn.lpoNumber || fullGrn.lpo || ''
        }
      };

      const html = generatePrintHtml(defaultTemplate, printData, {
        nestLogo: nestLogo,
        billBullLogo: billBullLogo
      });

      printHtml(html);
    } catch (error) {
      console.error("Error printing GRN:", error);
      toast.error('Failed to generate print layout');
    }
  };

  const handleNewGRN = () => {
    setCurrentGrnData(null);
    setActiveNavTab('editor');
  }

  const renderContent = () => {
    switch (activeNavTab) {
      case 'list':
        return <GRNListView
          data={grns}
          onView={handleEdit}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPost={handlePost}
          onPrint={handlePrint}
          onProceedToInvoice={handleProceedToInvoice}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
        />;
      case 'editor':
        return <EditorView
          initialData={currentGrnData}
          onSaveDraft={handleSaveDraft}
          onSubmitQC={handleSubmitQC}
          onPost={handlePost}
          onPrint={handlePrint}
          grnType={grnType}
          setGrnType={setGrnType}
        />;
      case 'qc':
        return <QCQueueView
          queue={qcQueue}
          onApprove={handleApproveQC}
        />;
      case 'returns': return <ReturnsView />;
      // case 'putaway': return <PutawayView />;
      // case 'performance': return <VendorPerformanceView />;
      default: return <GRNListView
        data={grns}
        onView={handleEdit}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPost={handlePost}
        onPrint={handlePrint}
        onProceedToInvoice={handleProceedToInvoice}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
      />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900 flex flex-col">
      {/* Header (Sticky) */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-5 sticky top-0 z-40 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Vendors & Purchases</span>
              <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
              <span className="font-medium text-slate-900">GRN</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ClipboardCheck className="text-[#F5C742]" size={28} /> Goods Receipt Note (GRN)</h1>
              {qcQueue.length > 0 && <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200">{qcQueue.length} Pending QC</span>}
            </div>
            <p className="text-sm text-slate-500">Receive, inspect, verify & post stock into inventory and accounts</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <button
              onClick={() => {
                if (activeNavTab === 'editor' || activeNavTab === 'qc') {
                  // Verify if we are in "edit" mode (have data) or just "create new"
                  // If we edited a draft, maybe ask for save? For now just go back to list.
                  if (currentGrnData && !window.confirm("Any unsaved changes will be lost. Go back?")) return;
                  setActiveNavTab('list');
                  setCurrentGrnData(null);
                } else {
                  navigate(-1);
                }
              }}
              className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {/* Import/Export Buttons Removed */}
            <button
              onClick={handleNewGRN}
              className="flex-1 sm:flex-none h-8 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" /> New GRN
            </button>
          </div>
        </div>

        {/* List View Sub-filters */}

        {/* Navigation Tabs (Moved Here) */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeNavTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveNavTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${isActive
                  ? "bg-[#F5C742] text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeNavTab === 'list' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mb-4 -mx-4 px-4 md:mx-0 md:px-0">
            {["All GRNs", "Today", "QC Pending", "Pending Invoice", "With Variance", "Completed", "Reversed"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors border ${activeFilter === tab
                  ? "bg-[#F5C742] text-slate-900 border-[#F5C742]"
                  : "bg-slate-50 text-slate-600 border-transparent hover:bg-slate-100"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="p-4 md:p-6 space-y-4 flex-1 flex flex-col">


        {/* View Content */}
        {renderContent()}

      </div>
    </div>
  );
};

export default GRN;
