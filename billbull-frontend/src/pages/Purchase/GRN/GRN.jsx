import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { getProducts, searchProductByBarcode } from '../../../api/productsApi'; // Import getProducts
import ProductSelector from '../../../components/ProductSelector';
import SearchableDropdown from '../../../components/SearchableDropdown';
import VendorSelector from '../../../components/VendorSelector';
import { getImageUrl } from '../../../utils/urlUtils';
import { getDefaultProductUnit, resolveUnitAmount } from '../../../utils/unitPricing';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { useBranch } from '../../../context/BranchContext';
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../../components/ItemDescriptionCell';
// QA-FAST-ENTRY: inline row search input that auto-opens ProductSelector
import InlineProductSearchCell from '../../../components/InlineProductSearchCell';
import PaginationFooter from '../../../components/common/PaginationFooter';
import ItemAddOnsModal from '../../../components/ItemAddOnsModal';
import StockAvailabilityModal from '../../../components/StockAvailabilityModal';
import { useCompany } from '../../../context/CompanyContext';

// SHORTCUTS HOOK
import useShortcuts from '../../../hooks/useShortcuts';

// Printing Utilities
import { getTemplatesByCategory } from '../../../api/printTemplateApi';
import { generatePrintHtmlAsync, printHtml } from '../../../utils/printGenerator';
import { buildDocumentHeaderProfile } from '../../../utils/branchPrintProfile';
import billBullLogo from '../../../assets/billBullLogo.png';
import toast from 'react-hot-toast';
import {
  buildGrnPrintData,
  findVendorRecord,
  resolvePurchasePrintTemplate
} from '../../../utils/purchasePrintUtils';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { formatCurrencyDisplay, resolveCurrencyDisplayCode } from '../../../utils/countryCurrencyOptions';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getListSerialNumber } from '../../../utils/serialNumbering';
import TableSkeleton from '../../../components/common/TableSkeleton';

// ==========================================
// 1. MOCK DATA & CONFIGURATION
// ==========================================

const GRN_COLUMNS = [
  { header: 'GRN No', key: 'idDisplay', width: 15 },
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Vendor', key: 'vendor', width: 25 },
  { header: 'LPO/DP', key: 'lpoNumber', width: 15 },
  { header: 'Warehouse', key: 'warehouse', width: 20 },
  { header: 'Packages', key: 'packages', width: 10 },
  { header: 'Value', key: 'value', width: 15 },
  { header: 'Status', key: 'status', width: 15 },
  { header: 'Inv Status', key: 'invStatus', width: 15 }
];

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
const GRNListView = ({ data, onView, onEdit, onDelete, onPost, onPrint, onProceedToInvoice, activeFilter, setActiveFilter, currencyLabel, currentPage, pageSize, totalElements, isLoading = false }) => {
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
                <th className="px-3 py-3 text-center text-slate-500 w-12 select-none uppercase whitespace-nowrap">S.No.</th>
                <th className="px-6 py-3 whitespace-nowrap">GRN No</th>
                <th className="px-6 py-3 whitespace-nowrap">Date</th>
                <th className="px-6 py-3 whitespace-nowrap">Vendor</th>
                <th className="px-6 py-3 whitespace-nowrap">Branch</th>
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
              {isLoading && <TableSkeleton cols={8} rows={8} />}
              {filteredData.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50 group transition-colors">
                  <td className="px-3 py-4 text-center text-slate-400 font-mono font-medium whitespace-nowrap">
                    {getListSerialNumber(index, {
                      documentNumber: row.idDisplay,
                      page: currentPage,
                      size: pageSize,
                      totalElements,
                    })}
                  </td>
                  <td onClick={() => onView(row)} className="px-6 py-4 font-mono font-medium text-[#F5C742] cursor-pointer hover:underline">
                    {row.idDisplay}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-slate-400" /> {formatDisplayDate(row.date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {row.vendor}
                    <div className="text-[9px] text-slate-400">V001</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-[11px]">
                    {row.branchName ? (
                      <>
                        <div className="font-medium">{row.branchName}</div>
                        {row.branchCode && <div className="text-slate-400">{row.branchCode}</div>}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
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
                  <td className="px-6 py-4 text-right font-bold text-slate-900"><CurrencyAmount value={row.value} currency={currencyLabel} /></td>
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
                <td className="p-3 text-slate-600">{formatDisplayDate(item.date)}</td>
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
  const { company } = useCompany();
  const currencyLabel = resolveCurrencyDisplayCode(company);
  const navigate = useNavigate();
  // Mock items linked from LPO
  const [items, setItems] = useState([]);

  // QA-FAST-ENTRY: inline-row-search → product-selector bridge state
  const [pendingFastEntrySearch, setPendingFastEntrySearch] = useState('');
  const [pendingFastEntryRowId, setPendingFastEntryRowId] = useState(null);
  const inlineSearchRefs = useRef({});
  const focusNextInlineSearchRef = useRef(null);

  // QA-FAST-ENTRY: focus the freshly-added empty row's inline search input.
  useEffect(() => {
    const targetId = focusNextInlineSearchRef.current;
    if (targetId == null) return;
    const raf = requestAnimationFrame(() => {
      const el = inlineSearchRefs.current[targetId];
      if (el) el.focus();
      focusNextInlineSearchRef.current = null;
    });
    return () => cancelAnimationFrame(raf);
  }, [items]);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedVendorDetails, setSelectedVendorDetails] = useState(null);
  const [qcPhotos, setQcPhotos] = useState([]); // [{ name, previewUrl, file }]
  const qcPhotoInputRef = useRef(null);

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
    status: GRN_STATUS.DRAFT,
    receivedBy: '',
    checkedBy: '',
    packageCount: ''
  });

  const [isVendorSearchOpen, setIsVendorSearchOpen] = useState(false);


  const [lpoList, setLpoList] = useState([]);
  const [products, setProducts] = useState([]); // State for products
  const [isProductSelectionOpen, setIsProductSelectionOpen] = useState(false); // State for Product Selector

  // Scan bar state
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [isScanLoading, setIsScanLoading] = useState(false);
  const [scanMessage, setScanMessage] = useState(null); // { text, type: 'success'|'error' }
  const scanInputRef = useRef(null);

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

  const { defaultBranch } = useBranch();

  useEffect(() => {
    if (!initialData && defaultBranch?.defaultWarehouseId) {
      const wh = warehouses.find(w => w.id === defaultBranch.defaultWarehouseId);
      setFormData(prev => ({
        ...prev,
        warehouseId: defaultBranch.defaultWarehouseId,
        warehouse: wh?.name || defaultBranch.defaultWarehouseName || '',
      }));
    }
  }, [defaultBranch, warehouses, initialData]);

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

      // Find vendor from vendors list (LpoDetailResponse has no vendorId — match by code then name)
      const vendor = vendors.find(v =>
        (lpo.vendorCode && v.code === lpo.vendorCode) ||
        (lpo.vendorName && v.name === lpo.vendorName)
      );

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

              // unitCost = Gross price per unit (base for discounts)
              // lpoPrice = reference gross price
              unitCost: unitPrice,
              lpoPrice: unitPrice,

              disc: discount,
              netCost: netCost, // Initially calculated for reference
              tax: parseFloat(lpoItem.purchaseTax) || 5,
              taxAmt: pending * netCost * ((parseFloat(lpoItem.purchaseTax) || 5) / 100),
              foc: Number(lpoItem.focQty || lpoItem.foc || 0),
              focUnit: lpoItem.focUnit || lpoItem.uom || lpoItem.unit || "Unit",
              remarks: lpoItem.remarks || '',

              total: pending * netCost,
              variance: 0, // No variance initially as we match pending

              batch: Boolean(lpoItem.isBatchTracked || lpoItem.batchTracked)
            };
          })
          .filter(item => item.lpoQty > 0)
          .map(item => recalculateItemTotals(item));

        setItems(grnItems);
      } else {
        setItems([]);
      }


    } catch (error) {
      console.error("Failed to fetch LPO details:", error);
      toast.error("Failed to load LPO details. Please try again.");
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

    // Conversion from LPO list — only LPO number is pre-set; items fetched separately once vendors load
    if (initialData._fromLpoConvert) {
      setFormData(prev => ({ ...prev, lpo: initialData.lpo }));
      return;
    }

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
      status: initialData.status, // No qcStatus or posted
      receivedBy: initialData.receivedBy || '',
      checkedBy: initialData.checkedBy || '',
      packageCount: initialData.packageCount ?? ''
    });

    // Load Cascading Locations
    if (initialData.warehouseId) getWarehouseZones(initialData.warehouseId).then(setZoneList).catch(console.error);
    if (initialData.zoneId) getZoneLocators(initialData.zoneId).then(setLocatorList).catch(console.error);
    if (initialData.locatorId) getLocatorBins(initialData.locatorId).then(setBinList).catch(console.error);

    setItems(
      initialData.items.map(i => {
        const acceptedQty = Number(i.accepted ?? i.acceptedQty ?? 0);
        const unitCost = Number(i.unitCost ?? 0);
        const storedLineTotal = Number(i.total ?? i.lineTotal ?? 0);
        const netCost = Number(i.netCost ?? (acceptedQty > 0 ? storedLineTotal / acceptedQty : unitCost));
        const netLineTotal = storedLineTotal || (acceptedQty * netCost);
        const grossLineTotal = acceptedQty * unitCost;
        const inferredDiscountAmount = Math.max(0, grossLineTotal - netLineTotal);
        const inferredDiscountPercent = grossLineTotal > 0
          ? (inferredDiscountAmount / grossLineTotal) * 100
          : 0;
        const taxPercent = parseFloat(i.purchaseTax) || parseFloat(i.tax) || 5;

        return recalculateItemTotals({
          ...i,
          unitCost,
          netCost,
          total: netLineTotal,
          discountAmount: Number(i.discountAmount ?? inferredDiscountAmount),
          disc: Number(i.discountPercent ?? i.disc ?? inferredDiscountPercent),
          tax: taxPercent,
          taxAmt: Number(i.taxAmt ?? i.taxAmount ?? ((netLineTotal * taxPercent) / 100)),
          foc: Number(i.foc || i.focQty || 0),
          focUnit: i.focUnit || i.uom || 'PCS',
          remarks: i.remarks || '',
          variance: i.received - i.lpoQty
        });
      })
    );
  }, [initialData]);

  // When converting from LPO: auto-fetch LPO details once vendors + warehouses are ready
  useEffect(() => {
    if (initialData?._fromLpoConvert && vendors.length > 0 && warehouses.length > 0) {
      fetchLpoDetails(initialData.lpo);
    }
  }, [initialData, vendors, warehouses]);

  // Modal State
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [isCompareModalOpen, setCompareModalOpen] = useState(false);
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);
  const [selectedAddonItem, setSelectedAddonItem] = useState(null);
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);

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
    // FIX (QA): if the same product is already on the GRN, just increment its
    // received/accepted count instead of creating a duplicate row. Match by
    // productId first, then by code/barcode for safety.
    const existingIdx = items.findIndex(it =>
      (product.id && it.productId === product.id) ||
      (product.code && it.code === product.code) ||
      (product.barcode && it.barcode && it.barcode === product.barcode)
    );
    if (existingIdx >= 0) {
      setItems(prev => prev.map((it, idx) => {
        if (idx !== existingIdx) return it;
        const received = (Number(it.received) || 0) + 1;
        const accepted = (Number(it.accepted) || 0) + 1;
        const lpoQty = Number(it.lpoQty) || 0;
        return recalculateItemTotals({
          ...it,
          received,
          accepted,
          variance: received - lpoQty
        });
      }));
      return;
    }

    const defaultUnit = getDefaultProductUnit(product);
    const unitCost = resolveUnitAmount({
      targetUnit: defaultUnit,
      amountMap: product.unitCosts || product.unitPrices,
      unitConversions: product.unitConversions,
      fallbackAmount: product.cost ?? product.salesPrice ?? 0
    });
    const newItem = {
      id: Date.now(),
      productId: product.id,
      code: product.code,
      barcode: product.barcode || '',
      name: product.name || product.description || '',
      shortDesc: product.shortDesc || '',
      detailedDesc: product.detailedDesc || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || null,
      remarks: product.detailedDesc || product.description || '',
      uom: defaultUnit,
      lpoQty: 0, // No LPO qty for manually added items
      received: 1,
      accepted: 1,
      rejected: 0,
      unitCost,
      lpoPrice: 0,
      disc: product.maxDiscount || 0,
      netCost: unitCost,
      tax: parseFloat(product.purchaseTax) || parseFloat(product.taxRate) || 5,
      taxAmt: unitCost * ((parseFloat(product.purchaseTax) || parseFloat(product.taxRate) || 5) / 100),
      total: unitCost,
      variance: 1, // Received 1 without LPO
      batch: false, // Default to false
      foc: 0,
      focUnit: defaultUnit,
      availableUnits: product.availableUnits || [defaultUnit],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      unitCosts: product.unitCosts || {}
    };
    // QA-FAST-ENTRY: replace-in-place when triggered by inline row search;
    // fall back to append if the target row doesn't exist (e.g. seed row).
    const targetRowId = pendingFastEntryRowId;
    const finalItem = recalculateItemTotals(newItem);
    let resolvedRowId = finalItem.id;
    setItems(prev => {
      if (targetRowId != null) {
        const exists = prev.some(it => it.id === targetRowId);
        if (exists) {
          resolvedRowId = targetRowId;
          return prev.map(it => it.id === targetRowId ? { ...finalItem, id: targetRowId } : it);
        }
      }
      return [...prev, finalItem];
    });
    const filledItemId = resolvedRowId;
    setPendingFastEntrySearch('');
    setPendingFastEntryRowId(null);
    setIsProductSelectionOpen(false);
    setTimeout(() => {
      const qtyEl = document.getElementById(`qty-${filledItemId}`);
      if (qtyEl) { qtyEl.focus(); qtyEl.select?.(); }
    }, 100);
  };

  // /api/products/by-barcode returns ProductAggregateResponse — a wrapper with
  // { product, pricing, tax, inventory, primaryImage } — so the GRN row code
  // (which reads flat .code/.name/.cost/etc.) was getting "undefined" for every
  // field. Flatten the wrapper to the shape handleAddSingleProduct expects.
  const flattenAggregateProduct = (raw) => {
    if (!raw) return raw;
    if (!raw.product) return raw; // already flat (e.g. came from the product selector)
    const p = raw.product || {};
    const inv = raw.inventory || {};
    const packings = inv.packings || [];
    return {
      ...p,
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description || p.shortDesc || p.name,
      barcode: packings.find?.(pk => pk.barcode)?.barcode || p.barcode || '',
      primaryImage: raw.primaryImage || null,
      cost: raw.pricing?.cost ?? null,
      salesPrice: raw.pricing?.retailPrice ?? null,
      maxDiscount: p.maxDiscount ?? 0,
      purchaseTax: raw.tax?.purchaseTax ?? raw.tax?.salesTax ?? null,
      taxRate: raw.tax?.salesTax ?? null,
      availableUnits: raw.availableUnits,
      unitConversions: raw.unitConversions,
      unitPrices: raw.unitPrices,
      unitCosts: raw.unitCosts,
    };
  };

  const handleBarcodeScan = async () => {
    const query = scanInput.trim();
    if (!query) return;
    setIsScanLoading(true);
    setScanMessage(null);
    try {
      const results = await searchProductByBarcode(query);
      if (results && results.length > 0) {
        const product = flattenAggregateProduct(results[0]);
        if (!product?.id && !product?.code) {
          setScanMessage({ text: `Product matched but its master data is incomplete. Check Inventory → Products.`, type: 'error' });
          return;
        }
        handleAddSingleProduct(product);
        const label = product.description || product.name || product.code;
        setScanMessage({ text: `Added: ${label}`, type: 'success' });
      } else {
        setScanMessage({ text: `No product found for "${query}". Check the barcode and try again.`, type: 'error' });
      }
    } catch {
      setScanMessage({ text: 'Scan failed. Please try again.', type: 'error' });
    } finally {
      setIsScanLoading(false);
      setScanInput('');
      setTimeout(() => {
        scanInputRef.current?.focus();
        setScanMessage(null);
      }, 2000);
    }
  };

  const handleScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeScan();
    }
  };

  const handleToggleScan = () => {
    if (isLocked) return;
    setIsScanOpen(prev => {
      const next = !prev;
      if (next) {
        setIsProductSelectionOpen(false);
        setTimeout(() => scanInputRef.current?.focus(), 100);
      }
      return next;
    });
    setScanInput('');
    setScanMessage(null);
  };

  const handleFastEntryAdd = (product, qty, price, disc) => {
    if (isLocked) return;
    const defaultUnit = getDefaultProductUnit(product);
    const unitCost = price;
    const netCost = unitCost * (1 - disc / 100);
    const newItem = {
      id: Date.now(),
      productId: product.id,
      code: product.code,
      barcode: product.barcode || '',
      name: product.name || product.description || '',
      shortDesc: product.shortDesc || '',
      detailedDesc: product.detailedDesc || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || null,
      remarks: product.detailedDesc || product.description || '',
      uom: defaultUnit,
      lpoQty: 0,
      received: qty,
      accepted: qty,
      rejected: 0,
      unitCost,
      lpoPrice: 0,
      disc,
      netCost,
      tax: parseFloat(product.purchaseTax) || parseFloat(product.taxRate) || 5,
      taxAmt: netCost * ((parseFloat(product.purchaseTax) || parseFloat(product.taxRate) || 5) / 100),
      total: netCost * qty,
      variance: qty,
      batch: false,
      foc: 0,
      focUnit: defaultUnit,
      availableUnits: product.availableUnits || [defaultUnit],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      unitCosts: product.unitCosts || {}
    };
    setItems(prev => [...prev, recalculateItemTotals ? recalculateItemTotals(newItem) : newItem]);
  };

  // Add Row Handler
  const handleAddItem = () => {
    const newItem = {
      id: Date.now(),
      code: 'SKU-NEW',
      barcode: '',
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
      tax: 5,
      taxAmt: 0,
      remarks: '',
      foc: 0,
      focUnit: 'Unit'
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter(i => i.id !== id));
  };

  const recalculateItemTotals = (item) => {
    const qty = Number(item.accepted) || 0;
    const unitPrice = Number(item.unitCost) || 0;
    const discPercent = Number(item.disc) || 0;
    const taxPercent = Number(item.tax) || 5;

    const focQty = Number(item.foc) || 0;
    let focDeduction = 0;

    if (focQty > 0 && item.focUnit && item.unitConversions) {
      const sellingUnit = item.uom;
      const focUnit = item.focUnit;
      if (sellingUnit === focUnit) {
        focDeduction = unitPrice * focQty;
      } else {
        const focConvFactor = item.unitConversions[focUnit] || 1;
        const sellingConvFactor = item.unitConversions[sellingUnit] || 1;
        const focInSellingUnit = (focQty * focConvFactor) / sellingConvFactor;
        focDeduction = unitPrice * focInSellingUnit;
      }
    }

    const grossLineValue = unitPrice * qty;
    const focAdjustedValue = Math.max(0, grossLineValue - focDeduction);
    const discAmt = focAdjustedValue * (discPercent / 100);
    const netLineTotal = Math.max(0, focAdjustedValue - discAmt);
    const taxAmt = netLineTotal * (taxPercent / 100);

    // netCost = effective per-unit cost (line value / qty)
    const effectiveNetCost = qty > 0 ? netLineTotal / qty : unitPrice;

    return {
      ...item,
      grossSubtotal: grossLineValue,
      discountAmount: discAmt,
      taxAmt: taxAmt,
      netCost: effectiveNetCost,
      total: netLineTotal
    };
  };

  const getAddonModalItem = (item) => {
    const resolvedUnit = item.uom || item.unit || 'PCS';
    return {
      ...item,
      desc: item.name || item.desc,
      qty: Number(item.accepted) || 0,
      unit: resolvedUnit,
      price: Number(item.unitCost) || 0,
      disc: Number(item.disc) || 0,
      foc: Number(item.foc) || 0,
      focUnit: item.focUnit || resolvedUnit,
      tax: Number(item.tax) || 0,
      cost: Number(item.unitCost) || 0,
      remarks: item.remarks || '',
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
        barcode: updated.barcode || item.barcode || '',
        unitCost: resolvedPrice,
        disc: resolvedDiscount,
        foc: resolvedFoc,
        focUnit: updated.focUnit || item.focUnit || resolvedUnit,
        uom: resolvedUnit,
        tax: Number(updated.tax) || 0,
        remarks: updated.remarks || ''
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
          updated.unitCost = resolveUnitAmount({
            targetUnit: newUnit,
            amountMap: item.unitCosts || item.unitPrices,
            unitConversions: item.unitConversions,
            currentUnit: item.uom,
            currentAmount: item.unitCost,
            fallbackAmount: item.unitCost
          });
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
      acc.grossTotal += (curr.grossSubtotal || (Number(curr.unitCost) * Number(curr.accepted)) || 0);
      acc.discountTotal += (curr.discountAmount || 0);
      acc.taxTotal += (curr.taxAmt || 0);
      acc.netTotal += (curr.total || 0);
      return acc;
    }, {
      received: 0,
      accepted: 0,
      rejected: 0,
      grossTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      netTotal: 0
    });
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
                      options={lpoList
                        .filter(lpo => ['APPROVED', 'SENT_TO_VENDOR', 'PARTIALLY_RECEIVED'].includes(lpo.status))
                        .map(lpo => ({
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
                <input type="text" placeholder="e.g. DN-00001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor Invoice No</label>
                <input type="text" placeholder="e.g. INV-00001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Shipment / Container No</label>
                <input type="text" placeholder="e.g. SHIP-00001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Packing List No</label>
                <input type="text" placeholder="e.g. PL-00001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-2 text-slate-700" />
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
                    menuPlacement="auto"
                    menuZIndexClass="z-[120]"
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
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
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
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
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
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Received By</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.receivedBy || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, receivedBy: e.target.value }))}
                    disabled={isLocked}
                    className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700"
                    placeholder="Receiver Name"
                  />
                </div>
              </div>



              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Checked By</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.checkedBy || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, checkedBy: e.target.value }))}
                    disabled={isLocked}
                    className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700"
                    placeholder="Checker Name"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Delivery Mode</label>
                <input type="text" placeholder="e.g. Supplier Delivery" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Packages Count</label>
                <input
                    type="number"
                    value={formData.packageCount ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, packageCount: e.target.value }))}
                    disabled={isLocked}
                    className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700"
                    placeholder="0"
                  />
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
                <input type="text" placeholder="e.g. DXB-12345" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Driver Name</label>
                <input type="text" placeholder="Driver name" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Gate Entry No</label>
                <input type="text" placeholder="e.g. GE-001" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Dock No</label>
                <input type="text" placeholder="e.g. DOCK-1" disabled={isLocked} className="w-full text-xs border border-slate-200 rounded p-1.5 text-slate-700" />
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
                <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">Item Lines <span className="text-xs font-normal text-slate-500 bg-slate-200 px-1.5 rounded ml-1">{items.length} items</span> <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200"><Zap size={10} /> Fast Entry</span></h3>
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
                {!isLocked && (
                  <button
                    onClick={handleToggleScan}
                    className={`px-3 py-1.5 border rounded text-xs font-medium flex items-center gap-1 transition-colors ${isScanOpen ? 'border-yellow-400 bg-yellow-50 text-yellow-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <ScanLine className="h-3 w-3" /> {isScanOpen ? 'Close Scanner' : 'Scan Items'}
                  </button>
                )}
                {!isLocked && (
                  <>
                    <button
                  onClick={() => {
                        setIsProductSelectionOpen(true);
                        setCompareModalOpen(false);
                      }}
                      className="px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Select from Products
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Scan Bar */}
            {isScanOpen && !isLocked && (
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={handleScanKeyDown}
                    placeholder="Scan or type barcode / item code, then press Enter…"
                    disabled={isScanLoading}
                    className="flex-1 text-xs border border-slate-200 rounded px-3 py-1.5 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-300 disabled:opacity-50"
                  />
                  <button
                    onClick={handleBarcodeScan}
                    disabled={isScanLoading || !scanInput.trim()}
                    className="px-4 py-1.5 bg-yellow-400 text-slate-900 text-xs font-bold rounded hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isScanLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    {isScanLoading ? 'Scanning…' : 'Scan'}
                  </button>
                </div>
                {scanMessage && (
                  <p className={`mt-1.5 text-xs font-medium ${scanMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {scanMessage.text}
                  </p>
                )}
              </div>
            )}

            {/* Table */}
            <div className="overflow-auto" style={{ maxHeight: 'calc(4 * 115px + 44px)' }}>
              <table className="w-full text-xs text-left min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 font-medium w-10 text-center text-slate-400">#</th>
                    <th className="p-3 font-medium min-w-[280px]">
                      <ItemDescriptionHeader
                        itemCount={items.length}
                        expandedRowsCount={Object.keys(expandedRows).length}
                        onToggleAll={toggleAllDescriptions}
                      />
                    </th>
                    <th className="p-3 font-medium text-center">Unit</th>
                    <th className="p-3 font-medium text-center">LPO Qty</th>
                    <th className="p-3 font-medium text-center">Received</th>
                    <th className="p-3 font-medium text-center text-emerald-600">Accepted</th>
                    <th className="p-3 font-medium text-center text-red-600">Rejected</th>
                    <th className="p-3 font-medium text-right">Unit Cost</th>
                    <th className="p-3 font-medium text-right">Line Total</th>
                    <th className="p-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.length === 0 ? (
                    /* QA-FAST-ENTRY: seed row when no items yet */
                    <tr className="bg-white">
                      <td className="p-3 text-center text-slate-400 text-xs font-medium">1</td>
                      <td className="p-3">
                        <InlineProductSearchCell
                          value={pendingFastEntryRowId === '__seed__' ? pendingFastEntrySearch : ''}
                          inputRef={(el) => {
                            if (el) inlineSearchRefs.current['__seed__'] = el;
                            else delete inlineSearchRefs.current['__seed__'];
                          }}
                          isReadOnly={isLocked}
                          onChange={(text) => {
                            setPendingFastEntryRowId('__seed__');
                            setPendingFastEntrySearch(text);
                          }}
                          onOpenSelector={(text) => {
                            setPendingFastEntryRowId('__seed__');
                            setPendingFastEntrySearch(text);
                            setIsProductSelectionOpen(true);
                          }}
                        />
                      </td>
                      <td colSpan={8} className="p-3 text-[11px] text-slate-400">
                        {grnType === "Against LPO" || grnType === "Against Direct Purchase" ? "Select a document to load items or type above." : "Type above to add an item."}
                      </td>
                    </tr>
                  ) : [...items].reverse().map((item, index) => (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50 group">
                        <td className="p-3 text-center text-slate-400 text-xs font-medium">{index + 1}</td>
                        <td className="p-3">
                          {/* QA-FAST-ENTRY: empty rows show inline product-search input */}
                          {(!item.code && !item.name) ? (
                            <InlineProductSearchCell
                              value={pendingFastEntryRowId === item.id ? pendingFastEntrySearch : ''}
                              inputRef={(el) => {
                                if (el) inlineSearchRefs.current[item.id] = el;
                                else delete inlineSearchRefs.current[item.id];
                              }}
                              isReadOnly={isLocked}
                              onChange={(text) => {
                                setPendingFastEntryRowId(item.id);
                                setPendingFastEntrySearch(text);
                              }}
                              onOpenSelector={(text) => {
                                setPendingFastEntryRowId(item.id);
                                setPendingFastEntrySearch(text);
                                setIsProductSelectionOpen(true);
                              }}
                            />
                          ) : (
                          <ItemDescriptionCell
                            item={item}
                            isExpanded={expandedRows[item.id]}
                            onToggleExpand={toggleRowDescription}
                            onItemChange={(id, field, val) => setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i))}
                            onFocusCode={() => { }}
                            onOpenProductSelection={!isLocked ? () => setIsProductSelectionOpen(true) : undefined}
                            onCheckStock={(selectedItem) => { setSelectedStockItem(selectedItem); setIsItemStockModalOpen(true); }}
                            onOpenSettings={() => setSelectedAddonItem(getAddonModalItem(item))}
                            showSettings={Boolean(item.code || item.name || item.remarks || item.barcode)}
                            isReadOnly={isLocked}
                            showTaxDiscount={true}
                          />
                          )}
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
                              id={`qty-${item.id}`}
                              type="number"
                              value={item.received}
                              disabled={isLocked}
                              onChange={(e) => handleQtyChange(item.id, 'received', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Tab' && !e.shiftKey && !isLocked) {
                                  e.preventDefault();
                                  const blankRow = {
                                    id: Date.now() + Math.random(),
                                    code: '', barcode: '', name: '',
                                    uom: 'PCS', lpoQty: 0, received: 0, accepted: 0, rejected: 0,
                                    unitCost: 0, lpoPrice: 0, disc: 0, netCost: 0, total: 0,
                                    variance: 0, batch: false, tax: 5, taxAmt: 0,
                                    foc: 0, focUnit: 'PCS', availableUnits: ['PCS'],
                                    unitConversions: {}, unitPrices: {}, unitCosts: {}
                                  };
                                  focusNextInlineSearchRef.current = blankRow.id;
                                  setItems(prev => [...prev, blankRow]);
                                }
                              }}
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
                        <td className="p-3 text-right text-slate-500">{item.unitCost.toFixed(2)}</td>
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
              {/* QA-FAST-ENTRY: Quick Entry hint bar */}
              <div className="mt-2 px-3 py-2 bg-blue-50/30 border border-blue-100/60 rounded-md flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 text-blue-600 font-semibold"><Zap size={11} /> Quick Entry:</span>
                <span>Type name →</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Enter</kbd>
                <span>Select →</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                <span>Received qty →</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                <span>New row</span>
                <span className="ml-auto text-slate-400">Tip: Use ↑↓ arrows to navigate items</span>
              </div>
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
                <div className="text-xs text-slate-400 italic">Per-row QC notes are captured on each item line.</div>
              </div>

              <input
                ref={qcPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const tooBig = files.find(f => f.size > 5 * 1024 * 1024);
                  if (tooBig) {
                    alert(`"${tooBig.name}" exceeds 5 MB. Pick a smaller image.`);
                    e.target.value = '';
                    return;
                  }
                  const mapped = files.map(file => ({
                    name: file.name,
                    previewUrl: URL.createObjectURL(file),
                    file
                  }));
                  setQcPhotos(prev => [...prev, ...mapped]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => qcPhotoInputRef.current?.click()}
                disabled={isLocked}
                className="w-full mt-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="h-3 w-3" /> Attach Photos {qcPhotos.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">{qcPhotos.length}</span>}
              </button>
              {qcPhotos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {qcPhotos.map((photo, i) => (
                    <div key={`${photo.name}-${i}`} className="relative group aspect-square border border-slate-200 rounded overflow-hidden">
                      <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover" />
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => {
                            setQcPhotos(prev => prev.filter((_, idx) => idx !== i));
                            URL.revokeObjectURL(photo.previewUrl);
                          }}
                          className="absolute top-0.5 right-0.5 bg-red-500/90 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                <span className="text-slate-500 font-medium">Subtotal (Gross)</span>
                <CurrencyAmount value={totals.grossTotal} currency={currencyLabel} className="font-medium text-slate-700" />
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span className="font-medium">Discount</span>
                  <span className="font-medium">- <CurrencyAmount value={totals.discountTotal} currency={currencyLabel} /></span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>VAT (Tax)</span>
                <CurrencyAmount value={totals.taxTotal} currency={currencyLabel} className="font-medium text-slate-700" />
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-slate-100 mt-2">
                <span className="font-bold text-slate-800">Grand Total</span>
                <span className="font-bold text-[#F5C742]">
                  <CurrencyAmount value={totals.netTotal + totals.taxTotal} currency={currencyLabel} />
                </span>
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
              <div className="flex justify-between"><span>Dr. Inventory</span><CurrencyAmount value={totals.netTotal} currency={currencyLabel} /></div>
              <div className="flex justify-between"><span>Dr. VAT Recoverable</span><CurrencyAmount value={totals.taxTotal} currency={currencyLabel} /></div>
              <div className="flex justify-between font-bold pt-1 border-t border-slate-200 mt-1"><span>Cr. GRNI (Accrued)</span><CurrencyAmount value={totals.netTotal + totals.taxTotal} currency={currencyLabel} /></div>
            </div>
            <button
              onClick={() => navigate('/finance/ledger')}
              className="w-full mt-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1"
            >
              <Eye className="h-3 w-3" /> View Details
            </button>
          </div>

          {/* Vendor Score — computed from THIS GRN's data, gated until a vendor is picked */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-3 w-3 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Vendor Score</h3>
              <span className="text-[9px] text-slate-400 ml-auto">This GRN</span>
            </div>
            {(() => {
              if (!formData.vendor) {
                return <div className="text-xs text-slate-400 italic text-center py-2">Select a vendor to see scores.</div>;
              }
              if (!items.length || totals.received === 0) {
                return <div className="text-xs text-slate-400 italic text-center py-2">Add received items to compute scores.</div>;
              }
              const deliveryAcc = Math.round((totals.accepted / totals.received) * 100);
              const itemsWithLpoPrice = items.filter(i => Number(i.lpoPrice) > 0);
              const priceAcc = itemsWithLpoPrice.length === 0
                ? null
                : Math.round((itemsWithLpoPrice.filter(i =>
                    Math.abs(Number(i.lpoPrice) - Number(i.unitCost)) < 0.01
                  ).length / itemsWithLpoPrice.length) * 100);
              const qcPass = Math.round(((totals.received - totals.rejected) / totals.received) * 100);
              const overall = priceAcc != null
                ? Math.round((deliveryAcc + priceAcc + qcPass) / 3)
                : Math.round((deliveryAcc + qcPass) / 2);
              const stars = Math.max(0, Math.min(5, Math.round(overall / 20)));
              const colorFor = (v) => v >= 95 ? 'text-green-600' : v >= 85 ? 'text-amber-600' : 'text-red-600';
              return (
                <>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>Delivery Accuracy</span><span className={`font-bold ${colorFor(deliveryAcc)}`}>{deliveryAcc}%</span></div>
                    <div className="flex justify-between"><span>Price Accuracy</span><span className={`font-bold ${priceAcc == null ? 'text-slate-400' : colorFor(priceAcc)}`}>{priceAcc == null ? 'N/A' : `${priceAcc}%`}</span></div>
                    <div className="flex justify-between"><span>QC Pass Rate</span><span className={`font-bold ${colorFor(qcPass)}`}>{qcPass}%</span></div>
                  </div>
                  <div className="mt-3 text-center">
                    <div className="flex justify-center text-[#F5C742] text-xs">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</div>
                    <span className="text-[9px] text-slate-400">Computed from current line data</span>
                  </div>
                </>
              );
            })()}
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
              <button onClick={() => onSubmitQC(formData, items)} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded font-medium flex items-center justify-center gap-2 transition-colors shadow-sm">
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

      <StockAvailabilityModal
        isOpen={isItemStockModalOpen}
        onClose={() => setIsItemStockModalOpen(false)}
        selectedStockItem={selectedStockItem}
      />

      {/* Product Selector Modal */}
      <ProductSelector
        isOpen={isProductSelectionOpen}
        onClose={() => { setIsProductSelectionOpen(false); setPendingFastEntryRowId(null); }}
        onSelect={handleAddSingleProduct}
        onInlineAdd={handleFastEntryAdd}
        initialSearch={pendingFastEntrySearch}
        actionLabel="Add to GRN"
        mode="purchase"
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
  const { company } = useCompany();
  const { branches: availableBranches, activeBranch } = useBranch();
  const currencyLabel = resolveCurrencyDisplayCode(company);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeNavTab, setActiveNavTab] = useState("list");
  const [grns, setGrns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Client-side pagination over filtered list (status filter is rich on this page).
  const [listPage, setListPage] = useState(0);
  const LIST_PAGE_SIZE = 30;
  const [qcQueue, setQcQueue] = useState([]);
  const [activeFilter, setActiveFilter] = useState("All GRNs");

  // State for Editing
  const [currentGrnData, setCurrentGrnData] = useState(null);
  const [grnType, setGrnType] = useState("Against LPO");

  const fetchGrns = async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGrns();
  }, []);

  // Refetch when the global Branch Selector changes the active branch.
  useEffect(() => {
    const handler = () => fetchGrns();
    window.addEventListener('billbull:branch-changed', handler);
    return () => window.removeEventListener('billbull:branch-changed', handler);
  }, []);

  useEffect(() => {
    const fromLpo = location.state?.fromLpo;
    if (fromLpo?.lpoNumber) {
      setGrnType("Against LPO");
      setCurrentGrnData({ _fromLpoConvert: true, lpo: fromLpo.lpoNumber });
      setActiveNavTab('editor');
      navigate(location.pathname, { replace: true, state: {} });
    }
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
      packages: formData.packageCount ? Number(formData.packageCount) : items.length,
      receivedBy: formData.receivedBy || null,
      checkedBy: formData.checkedBy || null,
      items: items.map(i => ({
        productId: i.productId,
        code: i.code,
        name: i.name,
        barcode: i.barcode || '',
        uom: i.uom,
        lpoQty: i.lpoQty,
        received: i.received,
        accepted: i.accepted,
        rejected: i.rejected,
        // unitCost = gross LPO price per unit (for reference/audit).
        // netCost  = effective per-unit cost after FOC+discount (invoice should use this).
        unitCost: i.unitCost,
        netCost: i.netCost,
        discountPercent: Number(i.disc) || 0,
        purchaseTax: Number(i.tax) || 0,
        taxAmt: Number(i.taxAmt) || 0,
        total: i.total,
        batch: i.batch,
        focQty: Number(i.foc) || 0,
        focUnit: i.focUnit || i.uom || 'PCS',
        remarks: i.remarks || ''
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




  const filteredData = useMemo(() => {
    return grns.filter(item => {
      if (activeFilter === "All GRNs") return true;
      if (activeFilter === "Today") {
        const today = new Date().toISOString().split('T')[0];
        return item.date === today;
      }
      if (activeFilter === "QC Pending") return item.status === GRN_STATUS.QC_PENDING;
      if (activeFilter === "Pending Invoice") return item.status === GRN_STATUS.POSTED && item.invStatus !== 'Fully Invoiced';
      if (activeFilter === "With Variance") return item.hasVariance || (item.variance && item.variance !== 0);
      if (activeFilter === "Completed") return item.status === GRN_STATUS.QC_COMPLETED || item.status === GRN_STATUS.POSTED;
      if (activeFilter === "Reversed") return item.status === GRN_STATUS.REVERSED;
      return true;
    });
  }, [grns, activeFilter]);

  // Reset page on filter change; slice for the visible page.
  useEffect(() => { setListPage(0); }, [activeFilter]);
  const pagedFilteredData = useMemo(
    () => filteredData.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
    [filteredData, listPage]
  );

  const handleExportExcel = () => {
    exportToExcel(filteredData.map((row) => ({
      ...row,
      value: formatCurrencyDisplay(row.value, currencyLabel)
    })), GRN_COLUMNS, 'GRN_List');
  };

  const handleExportPdf = () => {
    exportToPDF(filteredData.map((row) => ({
      ...row,
      value: formatCurrencyDisplay(row.value, currencyLabel)
    })), GRN_COLUMNS, 'Goods Receipt Notes (GRN)', 'GRN_List');
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

    if (!formData.zoneId) {
      alert("Validation Failed: Zone is required.");
      return;
    }

    if (!formData.locatorId) {
      alert("Validation Failed: Locator is required.");
      return;
    }

    if (!formData.binId) {
      alert("Validation Failed: Bin is required.");
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
    const loadingToast = toast.loading('Preparing print layout...');
    try {
      const [templates, vendorData] = await Promise.all([
        getTemplatesByCategory('Goods Receipt Note').catch(() => []),
        getVendors().catch(() => [])
      ]);
      const defaultTemplate = resolvePurchasePrintTemplate('Goods Receipt Note', templates);

      // Fetch full GRN details if needed
      let fullGrn = grn;
      const grnId = grn?.dbId ?? grn?.id;
      if ((!grn?.items || grn.items.length === 0) && grnId !== null && grnId !== undefined) {
        try {
          fullGrn = await getGrnById(grnId);
        } catch (detailError) {
          console.warn('Falling back to GRN data already loaded in the UI for printing.', detailError);
        }
      }
      const fullVendor = findVendorRecord(vendorData, fullGrn, fullGrn?.vendor, fullGrn?.vendorName);
      const printData = buildGrnPrintData(fullGrn, fullVendor, company);

      const grnBranchId = fullGrn?.branchId ?? grn?.branchId ?? activeBranch?.id;
      const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
        companyProfile: buildDocumentHeaderProfile({
          company,
          branches: availableBranches || [],
          branchId: grnBranchId,
        }),
        billBullLogo: billBullLogo
      });

      printHtml(html);
    } catch (error) {
      console.error("Error printing GRN:", error);
      const message = error?.response?.data?.message || error?.message || 'Failed to generate print layout';
      toast.error(message);
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const handleNewGRN = () => {
    setCurrentGrnData(null);
    setActiveNavTab('editor');
  }

  const renderContent = () => {
    switch (activeNavTab) {
      case 'list':
        return <>
          <GRNListView
            data={pagedFilteredData}
            onView={handleEdit}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPost={handlePost}
            onPrint={handlePrint}
            onProceedToInvoice={handleProceedToInvoice}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            currencyLabel={currencyLabel}
            currentPage={listPage}
            pageSize={LIST_PAGE_SIZE}
            totalElements={filteredData.length}
            isLoading={isLoading}
          />
          <PaginationFooter
            page={listPage}
            size={LIST_PAGE_SIZE}
            totalElements={filteredData.length}
            totalPages={Math.ceil(filteredData.length / LIST_PAGE_SIZE)}
            onPageChange={setListPage}
          />
        </>;
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
        data={filteredData}
        onView={handleEdit}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPost={handlePost}
        onPrint={handlePrint}
        onProceedToInvoice={handleProceedToInvoice}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        currencyLabel={currencyLabel}
        currentPage={0}
        isLoading={isLoading}
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
            <ExportDropdown
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
            />
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

