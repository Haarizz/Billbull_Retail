import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Box,
  ShoppingCart,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  Plus,
  Download,
  Upload,
  Printer,
  MoreHorizontal,
  Search,
  Filter,
  RefreshCw,
  Eye,
  PenSquare,
  Trash2,
  Check,
  X,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CircleCheckBig,
  SquarePen,
  History,
  FileDown,
  Calendar,
  ThumbsUp,
  Zap,
  Package,
  ChevronDown,
  ChevronUp,
  Menu,
  PackageCheck,
  PackageX,
  MessageSquare,
  GitCommit,
  Send,
  DollarSign
} from 'lucide-react';

import { getImageUrl } from "../../../utils/urlUtils";
import { getDefaultProductUnit, resolveUnitAmount } from "../../../utils/unitPricing";
import { createDraftFromLpo } from '../../../api/purchaseInvoiceApi';
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../../components/ItemDescriptionCell';
// QA-FAST-ENTRY: inline row search input that auto-opens ProductSelector
import InlineProductSearchCell from '../../../components/InlineProductSearchCell';
import PaginationFooter from '../../../components/common/PaginationFooter';
import ItemAddOnsModal from '../../../components/ItemAddOnsModal';
import StockAvailabilityModal from '../../../components/StockAvailabilityModal';
import toast from 'react-hot-toast';
import { useCompany } from '../../../context/CompanyContext';
import { formatDisplayDate } from '../../../utils/dateUtils';

// Printing Utilities
import { getTemplatesByCategory } from '../../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../../utils/printGenerator';
import { buildDocumentHeaderProfile } from '../../../utils/branchPrintProfile';
import billBullLogo from '../../../assets/billBullLogo.png';
import {
  buildLpoPrintData,
  buildPaymentVoucherPrintData,
  findVendorRecord,
  resolvePurchasePrintTemplate
} from '../../../utils/purchasePrintUtils';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { formatCurrencyDisplay, resolveCurrencyDisplayCode } from '../../../utils/countryCurrencyOptions';
import CurrencyAmount from '../../../components/CurrencyAmount';

// ==========================================
// 1. MOCK DATA & CONFIGURATION
// ==========================================

const LPO_COLUMNS = [
  { header: 'S.No.', key: 'sNo', width: 8 },
  { header: 'LPO No.', key: 'lpoNumber', width: 15 },
  { header: 'Vendor', key: 'vendorName', width: 25 },
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Total Value', key: 'totalValue', width: 15 },
  { header: 'Advance Paid', key: 'advancePaid', width: 15 },
  { header: 'Balance Due', key: 'balanceDue', width: 15 },
  { header: 'Status', key: 'status', width: 15 },
  { header: 'ETA', key: 'eta', width: 12 },
  { header: 'Received %', key: 'received', width: 12 }
];

// API Imports
import {
  getLpos,
  getLpoSuggestions,
  getLpoByNumber,
  createLpo,
  updateLpo,
  submitLpoForApproval,
  approveLpo,
  rejectLpo,
  createLpoAdvancePayment,
  getLpoPaymentVouchers
} from '../../../api/lpoApi';
import api from '../../../api/axiosConfig';
import { approvalWorkflowApi } from '../../../api/purchase/approvalWorkflowApi';
import { getVendors } from '../../../api/vendorsApi';
import {
  getWarehouses,
  getWarehouseZones,
  getZoneLocators,
  getLocatorBins
} from '../../../api/warehouseApi';
// getProducts import removed — ProductSelector fetches server-side

// SHORTCUTS HOOK
import useShortcuts from '../../../hooks/useShortcuts';
import { useBranch } from '../../../context/BranchContext';

// ==========================================
// UTILITIES & CONSTANTS
// ==========================================
import SearchableDropdown from '../../../components/SearchableDropdown';
import ProductSelector from '../../../components/ProductSelector';
import VendorSelector from '../../../components/VendorSelector';

const statusTabs = [
  "All LPOs",
  "Draft",
  "Pending Approval",
  "Approved",
  "Sent to Vendor",
  "Partially Received",
  "Completed",
  "Cancelled"
];

const navigationTabs = [
  { id: "list", label: "LPO List", icon: ShoppingCart },
  { id: "auto", label: "Auto-Generated", icon: Zap },
  { id: "editor", label: "LPO Editor", icon: SquarePen },
  { id: "approval", label: "Approval Queue", icon: CircleCheckBig },
  { id: "history", label: "History", icon: History },
];

// Helper to assign UI colors based on status
const getStatusColor = (status) => {
  switch (status) {
    case 'APPROVED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'SENT_TO_VENDOR': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'PARTIALLY_RECEIVED': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'COMPLETED': return 'bg-teal-100 text-teal-700 border-teal-200';
    case 'PENDING_APPROVAL': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
    case 'CANCELLED': return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'DRAFT': return 'bg-slate-100 text-slate-600 border-slate-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

const getStatusLabel = (status) => {
  if (status === 'COMPLETED') return 'GRN Converted';
  return status?.replace(/_/g, ' ') || 'DRAFT';
};

// Data Mapper: API -> UI Format
const mapApiToUi = (data) => {
  return data.map(item => ({
    dbId: item.dbId,                // ✅ numeric ID
    lpoNumber: item.id,             // string LPO number
    vendorName: item.vendorName,
    vendorCode: item.vendorCode,
    branchId: item.branchId ?? null,
    branchName: item.branchName || '',
    branchCode: item.branchCode || '',
    status: item.status,
    approvedBy: item.approvedBy,
    date: item.date,
    eta: item.expectedDeliveryDate,
    received: item.receivedPercentage || 0,
    totalValue: item.totalValue,
    advancePaid: item.advancePaid ?? 0,
    balanceDue: item.balanceDue ?? (item.totalValue ?? 0),
    itemCount: item.itemCount || 0,
    items: item.items || [],
    statusColor: getStatusColor(item.status),
    createdFrom: item.createdFrom || 'Manual',
    warehouseId: item.warehouseId || null
  }));
};


// ==========================================
// 1. HELPER COMPONENTS
// ==========================================

const ProgressBar = ({ percentage }) => (
  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
    <div className="bg-[#F5C742]" style={{ width: `${percentage}%`, height: '100%', borderRadius: '999px' }}></div>
  </div>
);

const CheckIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Helper for "Created From" badges
const getSourceBadge = (source) => {
  const s = source?.toLowerCase() || '';
  if (s.includes('auto') || s.includes('forecast')) {
    return <span className="bg-purple-100 text-purple-700 border border-purple-200 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap">{source}</span>;
  }
  if (s.includes('goods request')) {
    return <span className="bg-blue-100 text-blue-700 border border-blue-200 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap">{source}</span>;
  }
  return <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap">{source}</span>;
};

// --- CONFIRMATION MODAL COMPONENT ---
const ConfirmationModal = ({ isOpen, onClose, onConfirm, config }) => {
  if (!isOpen) return null;

  const isApprove = config.type === 'approve';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center ${isApprove ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}>
              {isApprove ? (
                <PackageCheck className="h-6 w-6" />
              ) : (
                <PackageX className="h-6 w-6" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                {isApprove ? 'Approve Stock Delivery' : 'Reject Stock Delivery'}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {isApprove
                  ? "Are you sure you want to approve this LPO and add the items to the warehouse stock? This will update inventory levels and mark the order as Completed."
                  : "Are you sure you want to reject this delivery? This action cannot be undone and the status will be marked as Cancelled."}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${isApprove
              ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'
              : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
              }`}
          >
            {isApprove ? 'Confirm & Add Stock' : 'Reject Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. MOBILE CARD COMPONENT
// ==========================================

const MobileCard = ({ row, onView, currencyLabel }) => (
  <div
    onClick={() => onView(row)}
    className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-3 active:scale-[0.98] transition-all"
  >
    <div className="flex justify-between items-start mb-3">
      <div>
        <h4 className="font-bold text-slate-800 text-sm font-mono">{row.lpoNumber}</h4>
        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
          <Calendar size={12} />
          {formatDisplayDate(row.date)}
        </div>
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${row.statusColor}`}>
        {getStatusLabel(row.status)}
      </span>
    </div>

    <div className="flex items-center gap-2 mb-3 text-xs text-slate-600">
      <Users size={14} className="text-slate-400" />
      <span className="font-medium truncate">{row.vendorName || 'No Vendor'}</span>
    </div>

    <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
      <div>
        <span className="block text-slate-400 text-[10px] uppercase">Value</span>
        <CurrencyAmount value={row.totalValue} currency={currencyLabel} className="font-bold text-slate-700" />
      </div>
      <div className="text-right">
        <span className="block text-slate-400 text-[10px] uppercase">Items</span>
        <span className="font-bold text-slate-700">{row.itemCount || 0}</span>
      </div>
    </div>
  </div>
);

// ==========================================
// 3. VIEW COMPONENTS
// ==========================================

const ListView = ({ lpos, processedData, onEdit, onView, onPrint, activeFilter, onApprove, onReject, onStockApprove, onStockReject, onProceedToInvoice, onConvertToGrn, onAdvancePayment, onPrintPaymentVoucher, searchQuery, setSearchQuery, sortConfig, requestSort, showFilterPanel, setShowFilterPanel, dateRange, setDateRange, selectedVendor, setSelectedVendor, vendors, currencyLabel, currentPage }) => {
  const formatDate = (dateString) => formatDisplayDate(dateString);

  return (
    <div className="flex flex-col h-full">

      {/* Search Bar - Full width on mobile */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor or LPO..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C742]/20 outline-none"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`px-4 py-2 border rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors w-full md:w-auto ${showFilterPanel ? 'bg-[#F5C742] border-[#F5C742] text-slate-900' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
          >
            <Filter size={16} /> Filter
          </button>
        </div>
      </div>

      {/* Collapsible Filter Panel */}
      {showFilterPanel && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">From Date</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded p-2 bg-white focus:outline-none focus:border-[#F5C742]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">To Date</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded p-2 bg-white focus:outline-none focus:border-[#F5C742]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor</label>
              <div className="relative">
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded p-2 bg-white focus:outline-none focus:border-[#F5C742] appearance-none"
                >
                  <option value="">All Vendors</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDateRange({ from: '', to: '' });
                  setSelectedVendor('');
                  setSearchQuery('');
                }}
                className="px-3 py-2 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex-1"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}



      {/* DESKTOP TABLE VIEW */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex-1 hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left table-auto">

            <thead className="bg-[#F7F7FA] text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-center text-slate-500 w-12 select-none uppercase font-medium">S.No.</th>
                <th
                  className="px-4 py-3 whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('lpoNumber')}
                >
                  <div className="flex items-center gap-1">
                    LPO No.
                    {sortConfig.key === 'lpoNumber' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  className="px-4 py-3 whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('vendorName')}
                >
                  <div className="flex items-center gap-1">
                    Vendor
                    {sortConfig.key === 'vendorName' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-4 py-3 whitespace-nowrap font-medium">Branch</th>
                <th className="px-4 py-3 whitespace-nowrap font-medium">Created From</th>
                <th
                  className="px-4 py-3 whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    {sortConfig.key === 'date' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-4 py-3 text-center whitespace-nowrap font-medium">Items</th>
                <th
                  className="px-4 py-3 text-right whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('totalValue')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Value
                    {sortConfig.key === 'totalValue' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('advancePaid')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Advance Paid
                    {sortConfig.key === 'advancePaid' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('balanceDue')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Balance Due
                    {sortConfig.key === 'balanceDue' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  className="px-4 py-3 whitespace-nowrap font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig.key === 'status' && <span className="text-xs text-slate-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-4 py-3 whitespace-nowrap font-medium">Approved By</th>
                <th className="px-4 py-3 whitespace-nowrap font-medium">ETA</th>
                <th className="px-4 py-3 w-32 whitespace-nowrap font-medium">Received %</th>
                <th className="px-4 py-3 text-center whitespace-nowrap font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {processedData.length === 0 ? (
                <tr><td colSpan="14" className="text-center py-8 text-slate-400">No records found.</td></tr>
              ) : processedData
                .map((row, index) => (
                  <tr key={row.lpoNumber} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-3 py-3 text-center text-slate-400 font-mono font-medium">{index + 1}</td>
                    <td
                      onClick={() => onView(row)} // View by default on click
                      className="px-4 py-3 font-mono font-medium text-[#F5C742] cursor-pointer hover:underline"
                    >
                      {row.lpoNumber || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-slate-900">{row.vendorName || 'No Vendor'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{row.vendorCode || 'V001'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[11px]">
                      {row.branchName ? (
                        <>
                          <div className="font-medium">{row.branchName}</div>
                          {row.branchCode && <div className="text-slate-400">{row.branchCode}</div>}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getSourceBadge(row.createdFrom)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        {formatDate(row.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {row.itemCount || (row.items ? row.items.length : 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <CurrencyAmount value={row.totalValue} currency={currencyLabel} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {Number(row.advancePaid) > 0
                        ? <CurrencyAmount value={row.advancePaid} currency={currencyLabel} className="text-emerald-700 font-semibold" />
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {Number(row.balanceDue) > 0
                        ? <CurrencyAmount value={row.balanceDue} currency={currencyLabel} className="text-red-600 font-semibold" />
                        : <span className="text-emerald-600 font-semibold text-xs">Fully Paid</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded border whitespace-nowrap ${row.statusColor}`}>
                        {getStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.approvedBy ? (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                          <ThumbsUp className="h-3 w-3 text-emerald-500" />
                          {row.approvedBy}
                        </div>
                      ) : <span className="text-slate-300 ml-2">-</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.eta ? (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {formatDate(row.eta)}
                        </div>
                      ) : <span className="text-slate-300 ml-2">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(row.received !== null && row.received !== undefined) ? (
                        <div className="w-full">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-slate-500">{row.received}%</span>
                          </div>
                          <ProgressBar percentage={row.received} />
                        </div>
                      ) : <span className="text-slate-300 ml-4">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">

                        {/* === WORKFLOW BUTTONS === */}

                        {/* 1. Pending Approval Actions */}
                        {row.status === 'PENDING_APPROVAL' && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); onApprove(row.dbId); }}
                              className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600 hover:text-emerald-700 border border-transparent hover:border-emerald-200"
                              title="Approve LPO"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onReject(row.dbId); }}
                              className="p-1.5 rounded hover:bg-red-100 text-red-500 hover:text-red-700 border border-transparent hover:border-red-200"
                              title="Reject LPO"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <div className="w-px h-4 bg-slate-200 mx-1"></div>
                          </>
                        )}



                        {/* Proceed to Invoice — APPROVED / SENT_TO_VENDOR / PARTIALLY_RECEIVED */}
                        {['APPROVED', 'SENT_TO_VENDOR', 'PARTIALLY_RECEIVED'].includes(row.status) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onProceedToInvoice && onProceedToInvoice(row.dbId); }}
                            title="Proceed to Invoice"
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium text-[10px]"
                          >
                            <FileText className="h-3 w-3" /> Invoice
                          </button>
                        )}

                        {/* Convert to GRN — APPROVED / SENT_TO_VENDOR / PARTIALLY_RECEIVED */}
                        {['APPROVED', 'SENT_TO_VENDOR', 'PARTIALLY_RECEIVED'].includes(row.status) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onConvertToGrn && onConvertToGrn(row.dbId, row.lpoNumber); }}
                            title="Convert to GRN"
                            className="p-1.5 bg-green-50 hover:bg-green-100 rounded text-green-700 hover:text-green-800 flex items-center gap-1 font-medium text-[10px]"
                          >
                            <PackageCheck className="h-3 w-3" /> GRN
                          </button>
                        )}

                        {/* Standard Actions */}
                        <button
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                          title="View"
                          onClick={() => onView(row)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                          title="Edit"
                          onClick={() => onEdit(row)}
                        >
                          <SquarePen className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                          title="Print LPO"
                          onClick={() => onPrint(row)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-amber-100 text-amber-600 hover:text-amber-700 border border-transparent hover:border-amber-200"
                          title="Advance Payment"
                          onClick={(e) => { e.stopPropagation(); onAdvancePayment && onAdvancePayment(row); }}
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </button>
                        {Number(row.advancePaid) > 0 && (
                          <button
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                            title="Print Payment Voucher"
                            onClick={(e) => { e.stopPropagation(); onPrintPaymentVoucher && onPrintPaymentVoucher(row); }}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* MOBILE LIST VIEW */}
      <div className="md:hidden space-y-3 pb-20 w-full overflow-x-hidden">
        {processedData.length === 0 ? (
          <div className="text-center py-10 text-slate-400">No LPOs found.</div>
        ) : (
          processedData.map((row) => (
            <MobileCard key={row.lpoNumber} row={row} onView={onView} currencyLabel={currencyLabel} />
          ))
        )}
      </div>
    </div>
  );
};

// ... [AutoGeneratedView, ApprovalQueueView, HistoryView remain the same] ...
// Re-including them for completeness

const AutoGeneratedView = ({ suggestions, onReview }) => (
  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 shadow-sm">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-[#F5C742]" />
            <h3 className="font-semibold text-slate-800">Auto-Generated LPO Suggestions</h3>
          </div>
          <p className="text-sm text-slate-500">System-suggested purchase orders based on reorder rules, forecasting & stock levels</p>
        </div>
        <button className="h-8 px-3 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-600 flex items-center gap-1.5 text-xs font-medium transition-colors">
          <RefreshCw className="h-3 w-3" /> Refresh Suggestions
        </button>
      </div>

      <div className="space-y-4">
        {suggestions.length === 0 ? (
          <p className="text-sm text-slate-400 italic p-4 text-center">
            No suggestions available at this time.
          </p>
        ) : suggestions.map((card) => (
          <div key={card.id} className="border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row gap-6 items-center bg-white hover:shadow-md transition-shadow">
            <div className="flex-1 space-y-3 w-full">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                  {card.id}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${card.urgencyColor || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {card.urgency || 'Normal'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Vendor</div>
                  <div className="font-semibold text-slate-900 text-sm">{card.vendor}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Total Value</div>
                  <CurrencyAmount value={card.value} className="font-bold text-[#F5C742] text-sm" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Items</div>
                  <div className="font-semibold text-slate-900 text-sm">{card.items} items</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Based On</div>
                  <div className="flex flex-wrap gap-1">
                    {card.reasons && card.reasons.map(r => (
                      <span key={r} className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto">
              <button
                className="h-8 px-4 rounded bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-xs font-bold flex items-center justify-center gap-2"
                onClick={() => onReview(card)}
              >
                <Eye className="h-3 w-3" /> Review Details
              </button>
              <button
                className="h-8 px-4 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center justify-center gap-2"
                onClick={() => onReview(card)}
              >
                <SquarePen className="h-3 w-3" /> Edit Before Approve
              </button>
              <button className="h-8 px-4 rounded border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium flex items-center justify-center gap-2">
                <X className="h-3 w-3" /> Discard
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ApprovalQueueView = ({ queue, onApprove, onReject }) => {
  const formatDate = (dateString) => formatDisplayDate(dateString);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 shadow-sm min-h-[400px]">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <CircleCheckBig className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-800">Pending Approvals</h3>
          </div>
          <p className="text-sm text-slate-500">LPOs requiring your approval</p>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50">
            <Check className="h-10 w-10 mx-auto mb-2 text-slate-300" />
            <p>No LPOs awaiting your approval.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="p-3 font-medium text-nowrap">LPO No.</th>
                  <th className="p-3 font-medium text-nowrap">Vendor</th>
                  <th className="p-3 font-medium text-nowrap">Created By</th>
                  <th className="p-3 font-medium text-nowrap">Date</th>
                  <th className="p-3 font-medium text-right text-nowrap">Value</th>
                  <th className="p-3 font-medium text-nowrap">Urgency</th>
                  <th className="p-3 font-medium text-center text-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {queue.map((item) => (
                  <tr key={item.lpoNumber} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-semibold text-[#F5C742]">
                      {item.lpoNumber}
                    </td>
                    <td className="p-3 font-medium text-slate-800">
                      {item.vendorName || item.vendor}
                    </td>
                    <td className="p-3 text-slate-600">
                      {item.createdBy || 'System'}
                    </td>
                    <td className="p-3 text-slate-600">
                      {formatDate(item.date)}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900">
                      <CurrencyAmount value={item.totalValue} />
                    </td>
                    <td className="p-3">
                      <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-200">
                        {item.urgency || 'Normal'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onApprove(item.dbId)}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          onClick={() => onReject(item.dbId)}
                          className="flex items-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const HistoryView = ({ lpos }) => {
  const formatDate = (dateString) => formatDisplayDate(dateString);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 shadow-sm">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <History className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-800">LPO History</h3>
          </div>
          <p className="text-sm text-slate-500">Complete purchase order history</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">LPO No.</th>
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Vendor</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Value</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 w-32 whitespace-nowrap">Received %</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lpos.map((row) => (
                <tr key={row.lpoNumber} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-[#F5C742]">
                    {row.lpoNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-4 py-3 text-slate-800 font-medium">
                    {row.vendorName}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    <CurrencyAmount value={row.totalValue} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded border whitespace-nowrap ${row.statusColor || 'bg-slate-100 text-slate-600'}`}>
                      {getStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.received !== null && row.received !== undefined ? (
                      <span className="text-slate-600">{row.received}%</span>
                    ) : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                        title="View"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                      <button
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                        title="Print"
                      >
                        <Printer className="h-3 w-3" />
                      </button>
                      <button
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                        title="Download"
                      >
                        <FileDown className="h-3 w-3" />
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
};

// ==========================================
// EDITOR COMPONENT (UPDATED FOR VIEW ONLY)
// ==========================================

const EditorView = ({ initialData, vendors, warehouses, onSave, onSubmit, onPrint, onRevert, isReadOnly, followUpNotes }) => {
  const { company } = useCompany();
  const currencyLabel = resolveCurrencyDisplayCode(company);
  // --- Editor Logic ---
  const createBlankLpoItem = () => ({
    id: Date.now() + Math.random(),
    productId: null,
    code: '',
    barcode: '',
    name: '',
    uom: '',
    lastPrice: 0,
    currentCost: 0,
    qty: 1,
    unitPrice: 0,
    disc: 0,
    foc: 0,
    focUnit: '',
    tax: 5,
    taxAmt: 0,
    remarks: '',
    image: null,
    availableUnits: [],
    unitConversions: {},
    unitPrices: {}
  });

  const defaultState = {
    id: '',
    lpoNumber: '',
    vendorName: "",
    vendorCode: "",
    date: new Date().toISOString().split('T')[0],
    status: "DRAFT",
    expectedDeliveryDate: "",
    warehouseId: null,
    warehouseName: "",
    zoneId: null,
    locatorId: null,
    binId: null,
    purchaseType: "REGULAR",
    buyerAssigned: "SYSTEM",
    referenceDocument: "",
    items: [createBlankLpoItem()]
  };

  const [formData, setFormData] = useState(defaultState);
  const [isVendorSearchOpen, setIsVendorSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isProductSelectionOpen, setIsProductSelectionOpen] = useState(false);

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
  }, [formData.items]);
  const [expandedRows, setExpandedRows] = useState({});
  const [selectedAddonItem, setSelectedAddonItem] = useState(null);
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState('');

  // ✅ GLOBAL SHORTCUTS
  useShortcuts({
    'ctrl+p': (e) => {
      if (!isReadOnly) setIsProductSelectionOpen(prev => !prev);
    },
    'ctrl+s': (e) => {
      if (!isReadOnly) handleSaveAction();
    },
    'alt+v': (e) => {
      if (!isReadOnly) setIsVendorSearchOpen(prev => !prev);
    }
  });

  const toggleRowDescription = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleAllDescriptions = () => {
    if (Object.keys(expandedRows).length > 0) {
      setExpandedRows({});
    } else {
      const allExpanded = {};
      formData.items.forEach(item => {
        allExpanded[item.id] = true;
      });
      setExpandedRows(allExpanded);
    }
  };

  // Location Data
  const [zoneList, setZoneList] = useState([]);
  const [locatorList, setLocatorList] = useState([]);
  const [binList, setBinList] = useState([]);

  const { defaultBranch } = useBranch();

  useEffect(() => {
    if (!initialData && defaultBranch?.defaultWarehouseId) {
      const wh = warehouses.find(w => w.id === defaultBranch.defaultWarehouseId);
      setFormData(prev => ({
        ...prev,
        warehouseId: defaultBranch.defaultWarehouseId,
        warehouseName: wh?.name || defaultBranch.defaultWarehouseName || '',
      }));
    }
  }, [defaultBranch, initialData]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...defaultState,
        ...initialData,
        date: initialData.lpoDate || initialData.date || defaultState.date,
        expectedDeliveryDate: initialData.expectedDeliveryDate || "",
        warehouseId: initialData.warehouseId || null,
        items: initialData.items?.length > 0
          ? initialData.items.map(i => ({
            id: i.id || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            productId: i.productId,
            code: i.itemCode,
            barcode: i.barcode || '',
            name: i.itemName,
            uom: i.uom,
            lastPrice: i.lastPrice || 0,
            currentCost: i.currentCost || 0,
            qty: i.quantity,
            unitPrice: i.unitPrice,
            disc: i.discountPercent || 0,
            foc: i.focQty || i.foc || 0,
            focUnit: i.focUnit || i.uom || 'PCS',
            tax: parseFloat(i.purchaseTax) || parseFloat(i.tax) || 5,
            taxAmt: Number(i.taxAmt || 0),
            remarks: i.remarks || '',
            image: i.image || i.imageUrl || null,
            availableUnits: i.availableUnits || [i.uom || 'PCS'],
            unitConversions: i.unitConversions || {},
            unitPrices: i.unitPrices || {}
          }))
          : defaultState.items
      });

      // Load Cascading Locations if IDs exist
      if (initialData.warehouseId) {
        getWarehouseZones(initialData.warehouseId).then(setZoneList).catch(console.error);
      }
      if (initialData.zoneId) {
        getZoneLocators(initialData.zoneId).then(setLocatorList).catch(console.error);
      }
      if (initialData.locatorId) {
        getLocatorBins(initialData.locatorId).then(setBinList).catch(console.error);
      }

    } else {
      setFormData(defaultState);
    }
  }, [initialData]);

  // handleProductSelect removed — product selection handled by ProductSelector modal via handleAddSingleProduct


  const handleItemChange = (id, field, value) => {
    const updatedItems = formData.items.map(item => {
      if (item.id === id) {
        const isStringField = field === 'uom' || field === 'focUnit' || field === 'remarks';
        let updated = { ...item, [field]: isStringField ? value : Number(value) };

        // ✅ If unit is being changed, recalculate price based on conversion
        if (field === 'uom' && item.unitConversions) {
          const newUnit = value;
          updated.unitPrice = resolveUnitAmount({
            targetUnit: newUnit,
            amountMap: item.unitCosts || item.unitPrices,
            unitConversions: item.unitConversions,
            currentUnit: item.uom,
            currentAmount: item.unitPrice,
            fallbackAmount: item.currentCost ?? item.unitPrice
          });
          updated.currentCost = updated.unitPrice;
        }
        return updated;
      }
      return item;
    });
    setFormData({ ...formData, items: updatedItems });
  };

  const handleAddItem = () => {
    const newItem = {
      id: Date.now(),
      productId: null,
      code: '',
      barcode: '',
      name: '',
      uom: '',
      lastPrice: 0,
      currentCost: 0,
      qty: 1,
      unitPrice: 0,
      disc: 0,
      foc: 0,
      focUnit: '',
      tax: 5,
      taxAmt: 0,
      remarks: '',
      image: null,
      availableUnits: [],
      unitConversions: {},
      unitPrices: {}
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  const handleAddSingleProduct = (product) => {
    const defaultUnit = getDefaultProductUnit(product);
    const cost = resolveUnitAmount({
      targetUnit: defaultUnit,
      amountMap: product.unitCosts || product.unitPrices,
      unitConversions: product.unitConversions,
      fallbackAmount: product.cost ?? 0
    });
    const newItem = {
      id: Date.now(),
      productId: product.id,
      code: product.code,
      barcode: product.barcode || '',
      name: product.name || product.description || '',
      shortDesc: product.shortDesc || '',
      detailedDesc: product.detailedDesc || '',
      uom: defaultUnit,
      lastPrice: cost,
      currentCost: cost, // Using actual cost
      qty: 1,
      unitPrice: cost,
      disc: product.maxDiscount || 0,
      foc: 0,
      focUnit: defaultUnit,
      tax: parseFloat(product.purchaseTax) || 5,
      taxAmt: 0,
      remarks: product.description || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || null,
      availableUnits: product.availableUnits || [defaultUnit],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      unitCosts: product.unitCosts || {}
    };

    // QA-FAST-ENTRY: replace-in-place when triggered by inline row search.
    const targetRowId = pendingFastEntryRowId;
    let updatedItems;
    if (targetRowId != null) {
      updatedItems = formData.items.map(it => it.id === targetRowId ? { ...newItem, id: targetRowId } : it);
    } else {
      const isFirstItemEmpty = formData.items.length === 1 && !formData.items[0].productId;
      updatedItems = isFirstItemEmpty ? [newItem] : [...formData.items, newItem];
    }
    const filledItemId = targetRowId != null ? targetRowId : newItem.id;
    setPendingFastEntrySearch('');
    setPendingFastEntryRowId(null);

    setFormData({ ...formData, items: updatedItems });
    setIsProductSelectionOpen(false);
    setTimeout(() => {
      const qtyEl = document.getElementById(`qty-${filledItemId}`);
      if (qtyEl) { qtyEl.focus(); qtyEl.select?.(); }
    }, 100);
  };

  const handleFastEntryAdd = (product, qty, price, disc) => {
    if (isReadOnly) return;
    const defaultUnit = getDefaultProductUnit(product);
    const newItem = {
      id: Date.now(),
      productId: product.id,
      code: product.code,
      barcode: product.barcode || '',
      name: product.name || product.description || '',
      shortDesc: product.shortDesc || '',
      detailedDesc: product.detailedDesc || '',
      uom: defaultUnit,
      lastPrice: price,
      currentCost: price,
      qty,
      unitPrice: price,
      disc,
      foc: 0,
      focUnit: defaultUnit,
      tax: parseFloat(product.purchaseTax) || 5,
      taxAmt: 0,
      remarks: product.description || '',
      image: product.primaryImage || product.image || null,
      availableUnits: product.availableUnits || [defaultUnit],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      unitCosts: product.unitCosts || {},
    };
    const isFirstItemEmpty = formData.items.length === 1 && !formData.items[0].productId;
    setFormData({ ...formData, items: isFirstItemEmpty ? [newItem] : [...formData.items, newItem] });
  };

  const getAddonModalItem = (item) => {
    const resolvedUnit = item.uom || item.unit || 'PCS';
    return {
      ...item,
      desc: item.name || item.desc,
      unit: resolvedUnit,
      price: Number(item.unitPrice) || 0,
      disc: Number(item.disc) || 0,
      foc: Number(item.foc) || 0,
      focUnit: item.focUnit || resolvedUnit,
      tax: Number(item.tax) || 0,
      cost: Number(item.unitPrice) || 0,
      remarks: item.remarks || '',
      availableUnits: item.availableUnits || [resolvedUnit]
    };
  };

  const handleAddonSave = (updated) => {
    const resolvedPrice = Number(updated.price) || 0;
    const resolvedDiscount = Number(updated.disc) || 0;
    const resolvedFoc = Number(updated.foc) || 0;

    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== updated.id) return item;

        const resolvedUnit = updated.unit || item.uom || item.unit || 'PCS';
        return {
          ...item,
          barcode: updated.barcode || item.barcode || '',
          unitPrice: resolvedPrice,
          disc: resolvedDiscount,
          foc: resolvedFoc,
          focUnit: updated.focUnit || item.focUnit || resolvedUnit,
          uom: resolvedUnit,
          tax: Number(updated.tax) || 0,
          taxAmt: Number(updated.taxAmt) || 0,
          remarks: updated.remarks || ''
        };
      })
    }));
    setSelectedAddonItem(null);
  };

  const handleRemoveItem = (id) => {
    const nextItems = formData.items.filter(item => item.id !== id);
    setFormData({ ...formData, items: nextItems.length > 0 ? nextItems : [createBlankLpoItem()] });
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalFoc = 0;
    let totalQty = 0;
    let totalTaxable = 0;

    const calculatedItems = formData.items.map(item => {
      const qty = Number(item.qty) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const focQty = Number(item.foc) || 0;
      const discPercent = Number(item.disc) || 0;

      const gross = qty * unitPrice;
      let focDeduction = 0;

      if (focQty > 0 && item.focUnit) {
        const sellingUnit = item.uom;
        const focUnit = item.focUnit;
        if (sellingUnit === focUnit) {
          focDeduction = unitPrice * focQty;
        } else if (item.unitConversions) {
          const focConversion = item.unitConversions[focUnit] || 1;
          const sellingConversion = item.unitConversions[sellingUnit] || 1;
          const focInSellingUnit = (focQty * focConversion) / sellingConversion;
          focDeduction = unitPrice * focInSellingUnit;
        }
      }

      const preDiscountAmount = Math.max(0, gross - focDeduction);
      const discountAmount = preDiscountAmount * (discPercent / 100);
      const lineTotal = preDiscountAmount - discountAmount;

      subtotal += preDiscountAmount + focDeduction;
      totalDiscount += discountAmount;
      totalFoc += focDeduction;
      totalTaxable += lineTotal;
      totalQty += qty;

      const taxAmt = lineTotal * ((Number(item.tax) || 5) / 100);
      return { ...item, tax: Number(item.tax) || 5, taxAmt, lineTotal, total: lineTotal + taxAmt };
    });

    const tax = calculatedItems.reduce((sum, item) => sum + item.taxAmt, 0);
    const grandTotal = totalTaxable + tax;

    return {
      subtotal,
      totalDiscount,
      totalFoc,
      tax,
      grandTotal,
      totalQty,
      calculatedItems
    };
  }, [formData.items]);

  const mapItemsToRequest = (items) => {
    return items.map(i => ({
      productId: i.productId,     // ✅ REQUIRED
      itemCode: i.code,
      itemName: i.name,
      uom: i.uom,
      quantity: i.qty,
      unitPrice: i.unitPrice,
      discountPercent: i.disc || 0,
      lineTotal: Number(i.lineTotal) || 0,
      barcode: i.barcode || '',
      remarks: i.remarks || "",
      focQty: Number(i.foc) || 0,
      focUnit: i.focUnit || i.uom || 'PCS',
      availableUnits: i.availableUnits || [],
      unitConversions: i.unitConversions || {},
      unitPrices: i.unitPrices || {}
    }));
  };

  const handleSaveAction = async () => {
    if (loading) return;

    try {
      setLoading(true);

      // ✅ VALIDATION (ADD HERE)
      const hasInvalidItem = formData.items.some(i => !i.productId);
      if (hasInvalidItem) {
        alert("Please select a product for all items before saving.");
        setLoading(false);
        return;
      }

      const selectedVendor = vendors.find(v => v.name === formData.vendorName);

      const payload = {
        vendorName: formData.vendorName || '',
        vendorCode: selectedVendor?.code || '',
        source: 'MANUAL',
        expectedDeliveryDate: formData.expectedDeliveryDate || null,
        purchaseType: formData.purchaseType || 'REGULAR',
        buyerAssigned: formData.buyerAssigned || 'SYSTEM',
        referenceDocument: formData.referenceDocument || '',
        warehouseId: formData.warehouseId,
        zoneId: formData.zoneId,
        locatorId: formData.locatorId,
        binId: formData.binId,
        items: mapItemsToRequest(calculations.calculatedItems)
      };
      if (!formData.warehouseId) {
        alert("Please select a warehouse");
        setLoading(false);
        return;
      }


      await onSave(payload);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save LPO. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleSubmitAction = async () => {
    if (loading) return;

    try {
      setLoading(true);

      // ✅ SAME VALIDATION HERE
      const hasInvalidItem = formData.items.some(i => !i.productId);
      if (hasInvalidItem) {
        alert("Please select a product for all items before submitting.");
        setLoading(false);
        return;
      }

      const selectedVendor = vendors.find(v => v.name === formData.vendorName);

      const payload = {
        vendorName: formData.vendorName || '',
        vendorCode: selectedVendor?.code || '',
        source: 'MANUAL',
        expectedDeliveryDate: formData.expectedDeliveryDate || null,
        purchaseType: formData.purchaseType || 'REGULAR',
        buyerAssigned: formData.buyerAssigned || 'SYSTEM',
        referenceDocument: formData.referenceDocument || '',
        warehouseId: formData.warehouseId,
        zoneId: formData.zoneId,
        locatorId: formData.locatorId,
        binId: formData.binId,
        items: mapItemsToRequest(calculations.calculatedItems)
      };

      if (!formData.warehouseId) {
        alert("Please select a warehouse");
        setLoading(false);
        return;
      }

      if (!formData.zoneId) {
        alert("Please select a zone");
        setLoading(false);
        return;
      }

      if (!formData.locatorId) {
        alert("Please select a locator");
        setLoading(false);
        return;
      }

      if (!formData.binId) {
        alert("Please select a bin");
        setLoading(false);
        return;
      }

      await onSubmit(payload);
    } catch (error) {
      console.error('Submit failed:', error);
      alert('Failed to submit LPO. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleVendorSelect = (vendor) => {
    setFormData(prev => ({
      ...prev,
      vendorName: vendor?.name || '',
      vendorCode: vendor?.code || ''
    }));
  };

  const handleWarehouseChange = (value) => {
    const w = warehouses.find(x => x.id === Number(value));
    if (w) {
      setFormData(prev => ({
        ...prev,
        warehouseId: w.id,
        warehouseName: w.name,
        zoneId: null, locatorId: null, binId: null
      }));
      getWarehouseZones(w.id).then(setZoneList).catch(console.error);
      setLocatorList([]);
      setBinList([]);
    } else {
      setFormData(prev => ({
        ...prev,
        warehouseId: null,
        warehouseName: '',
        zoneId: null, locatorId: null, binId: null
      }));
      setZoneList([]);
      setLocatorList([]);
      setBinList([]);
    }
  };

  const handleZoneChange = (value) => {
    const z = zoneList.find(x => x.id === Number(value));
    setFormData(prev => ({ ...prev, zoneId: z?.id || null, locatorId: null, binId: null }));
    if (z) {
      getZoneLocators(z.id).then(setLocatorList).catch(console.error);
    } else {
      setLocatorList([]);
    }
    setBinList([]);
  };

  const handleLocatorChange = (value) => {
    const l = locatorList.find(x => x.id === Number(value));
    setFormData(prev => ({ ...prev, locatorId: l?.id || null, binId: null }));
    if (l) {
      getLocatorBins(l.id).then(setBinList).catch(console.error);
    } else {
      setBinList([]);
    }
  };

  const handleBinChange = (value) => {
    const b = binList.find(x => x.id === Number(value));
    setFormData(prev => ({ ...prev, binId: b?.id || null }));
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1">
        {/* Left Column (Vendor & Details) */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Vendor Information</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor</label>
                {formData.vendorName ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4 relative group">
                    <button
                      onClick={() => !isReadOnly && setIsVendorSearchOpen(true)}
                      disabled={isReadOnly}
                      className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded-md transition-all text-slate-500"
                      title="Change Vendor"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    <div className="font-bold text-slate-800 text-sm mb-1">{formData.vendorName}</div>
                    <div className="text-xs text-slate-500">Code: {formData.vendorCode || 'N/A'}</div>
                  </div>
                ) : (
                  <button
                    onClick={() => !isReadOnly && setIsVendorSearchOpen(true)}
                    disabled={isReadOnly}
                    className="w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-slate-400">Select Vendor...</span>
                    <Search className="h-4 w-4 text-slate-400" />
                  </button>
                )}

                {/* VENDOR SELECTOR MODAL */}
                <VendorSelector
                  isOpen={isVendorSearchOpen}
                  onClose={() => setIsVendorSearchOpen(false)}
                  onSelect={handleVendorSelect}
                  vendors={vendors}
                  selectedCode={formData.vendorCode || ''}
                />
              </div>
              {formData.vendorName && (
                <div className="bg-slate-50 rounded p-3 text-xs space-y-2 border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vendor Rating</span>
                    <div className="flex text-[#F5C742]">★★★★☆</div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Terms</span>
                    <span className="font-medium text-slate-900">Net 30</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">PO Information</h3>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">
                    LPO Number
                  </label>
                  <input
                    type="text"
                    value={formData.lpoNumber || 'New LPO'}
                    readOnly
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">
                    Date
                  </label>
                  <input
                    type="text"
                    value={formData.date}
                    readOnly
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={formData.expectedDeliveryDate}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    expectedDeliveryDate: e.target.value
                  }))}
                  disabled={isReadOnly}
                  className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Delivery Location (Warehouse)
                </label>
                <SearchableDropdown
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                  value={formData.warehouseId}
                  onChange={handleWarehouseChange}
                  placeholder="Select Warehouse"
                  disabled={isReadOnly}
                  menuPlacement="auto"
                  menuZIndexClass="z-[120]"
                  className="w-full"
                />
              </div>

              {/* Cascading Location Fields */}
              {formData.warehouseId && (
                <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 mb-1 block">Zone</label>
                    <SearchableDropdown
                      options={zoneList.map(z => ({ value: z.id, label: z.name }))}
                      value={formData.zoneId}
                      onChange={handleZoneChange}
                      placeholder="Zone"
                      disabled={isReadOnly}
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 mb-1 block">Locator</label>
                    <SearchableDropdown
                      options={locatorList.map(l => ({ value: l.id, label: l.name }))}
                      value={formData.locatorId}
                      onChange={handleLocatorChange}
                      placeholder="Locator"
                      disabled={isReadOnly || !formData.zoneId}
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 mb-1 block">Bin</label>
                    <SearchableDropdown
                      options={binList.map(b => ({ value: b.id, label: b.code }))}
                      value={formData.binId}
                      onChange={handleBinChange}
                      placeholder="Bin"
                      disabled={isReadOnly || !formData.locatorId}
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                      className="w-full"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Purchase Type
                </label>
                <SearchableDropdown
                  options={[
                    { value: 'REGULAR', label: 'Regular' },
                    { value: 'URGENT', label: 'Urgent' }
                  ]}
                  value={formData.purchaseType}
                  onChange={(value) => setFormData(prev => ({
                    ...prev,
                    purchaseType: value
                  }))}
                  placeholder="Select Type"
                  disabled={isReadOnly}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Reference Document
                </label>
                <input
                  type="text"
                  placeholder="GR-00019, Sales Order..."
                  value={formData.referenceDocument}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    referenceDocument: e.target.value
                  }))}
                  disabled={isReadOnly}
                  className="w-full text-xs border border-slate-200 rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle/Right Column (ITEM TABLE) */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full min-h-[200px]">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-yellow-500" />
                <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">LPO Items <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200"><Zap size={10} /> Fast Entry</span></h3>
              </div>
              <div className="flex items-center gap-2">
                {!isReadOnly && (
                  <>
                    <button
                      onClick={() => setIsProductSelectionOpen(true)}
                      className="px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Select from Products
                    </button>
                    <button onClick={handleAddItem} className="px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Add Row
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(4 * 115px + 44px)' }}>
              <table className="w-full text-xs text-left min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 font-medium w-10 text-center text-slate-400">#</th>
                    <th className="p-3 font-medium min-w-[280px]">
                      <ItemDescriptionHeader
                        itemCount={formData.items.length}
                        expandedRowsCount={Object.keys(expandedRows).length}
                        onToggleAll={toggleAllDescriptions}
                      />
                    </th>
                    <th className="p-3 font-medium text-center w-16">Unit</th>
                    <th className="p-3 font-medium text-center w-16">Order Qty</th>
                    <th className="p-3 font-medium text-center w-20">Unit Price</th>
                    <th className="p-3 font-medium text-right">Amount</th>
                    <th className="p-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...calculations.calculatedItems].reverse().map((item, index) => (
                    <React.Fragment key={item.id}>
                      <tr className="group hover:bg-slate-50">
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
                              isReadOnly={isReadOnly}
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
                            onItemChange={handleItemChange}
                            onFocusCode={() => { }}
                            onOpenProductSelection={!isReadOnly ? () => setIsProductSelectionOpen(true) : undefined}
                            onCheckStock={(selectedItem) => { setSelectedStockItem(selectedItem); setIsItemStockModalOpen(true); }}
                            onOpenSettings={() => setSelectedAddonItem(getAddonModalItem(item))}
                            showSettings={Boolean(item.code || item.name || item.remarks || item.barcode)}
                            isReadOnly={isReadOnly}
                            showTaxDiscount={true}
                          />
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <select
                            disabled={isReadOnly}
                            className="w-full bg-transparent outline-none text-center text-xs text-slate-600 appearance-none font-medium cursor-pointer disabled:opacity-50"
                            value={item.uom || 'PCS'}
                            onChange={(e) => handleItemChange(item.id, 'uom', e.target.value)}
                          >
                            {(item.availableUnits || [item.uom || 'PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <input
                            id={`qty-${item.id}`}
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                const priceEl = document.getElementById(`price-${item.id}`);
                                if (priceEl) { e.preventDefault(); priceEl.focus(); priceEl.select?.(); }
                              }
                            }}
                            // Prevent Scroll & Paste
                            onWheel={e => e.target.blur()}
                            onPaste={e => e.preventDefault()}
                            disabled={isReadOnly}
                            className={`w-12 text-center border border-slate-200 rounded p-1 text-xs disabled:bg-slate-50 disabled:text-slate-500`}
                          />
                        </td>
                        <td className="p-3">
                          <div className="relative group/price">
                            <input
                              id={`price-${item.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Tab' && !e.shiftKey && !isReadOnly) {
                                  e.preventDefault();
                                  const newRow = createBlankLpoItem();
                                  focusNextInlineSearchRef.current = newRow.id;
                                  setFormData(prev => ({ ...prev, items: [...prev.items, newRow] }));
                                }
                              }}
                              // Prevent Scroll & Paste
                              onWheel={e => e.target.blur()}
                              onPaste={e => e.preventDefault()}
                              disabled={isReadOnly}
                              className="w-20 text-center border border-[#F5C742] bg-[#FFFDE7] rounded p-1 text-xs font-bold text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-[#F5C742]">
                          {item.lineTotal.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isReadOnly}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Description Row */}
                      {expandedRows[item.id] && (
                        <tr className="bg-white">
                          <td colSpan={7} className="px-0 pb-4 pt-1">
                            <div className="ml-0 mr-4 p-3 rounded-r-[10px] border-l-[3px] border-[#FFD700] bg-[#FFFDE7]/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                              <div className="flex justify-between items-center mb-1.5">
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#B8860B] tracking-widest uppercase">
                                  <Menu size={10} strokeWidth={3} className="opacity-80" /> LPO ITEM REMARKS
                                </div>
                              </div>
                              <textarea
                                className="w-full text-xs text-slate-700 bg-white/80 border border-slate-200/60 rounded p-2 outline-none focus:border-[#FFD700] hover:border-[#FFD700]/50 transition-colors min-h-[40px] resize-y placeholder:text-slate-400"
                                placeholder="Enter item specific remarks or description..."
                                disabled={isReadOnly}
                                value={item.remarks || ''}
                                onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
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
                <span>Qty →</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                <span>Cost →</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                <span>New row</span>
                <span className="ml-auto text-slate-400">Tip: Use ↑↓ arrows to navigate items</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">LPO Summary</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="border border-slate-100 p-2 rounded text-center">
                <div className="text-xs text-slate-500">Total Items</div>
                <div className="text-lg font-bold text-slate-700">
                  {formData.items.length}
                </div>
              </div>
              <div className="border border-slate-100 p-2 rounded text-center">
                <div className="text-xs text-slate-500">Total Qty</div>
                <div className="text-lg font-bold text-slate-700">
                  {calculations.totalQty}
                </div>
              </div>
            </div>
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Subtotal</span>
                <span className="font-medium">
                  <CurrencyAmount value={calculations.subtotal} currency={currencyLabel} />
                </span>
              </div>
              <div className="flex justify-between text-green-600">
                <span className="font-medium">Discount</span>
                <span className="font-medium">
                  -<CurrencyAmount value={calculations.totalDiscount} currency={currencyLabel} />
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium">
                  <CurrencyAmount value={calculations.tax} currency={currencyLabel} />
                </span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-slate-100 mt-2">
                <span className="font-bold text-slate-800">Grand Total</span>
                <span className="font-bold text-[#F5C742]">
                  <CurrencyAmount value={calculations.grandTotal} currency={currencyLabel} />
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CircleCheckBig className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Approval Workflow</h3>
            </div>

            <div className="space-y-4 relative">
              <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-slate-100 z-0"></div>

              {(!formData.approvalHistory || formData.approvalHistory.length === 0) ? (
                formData.status === 'APPROVED' ? (
                  <div className="relative z-10 flex gap-3">
                    <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm bg-emerald-500 border-emerald-500 text-white">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-slate-800">System Approval</div>
                        <span className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 rounded border whitespace-nowrap">
                          APPROVED
                        </span>
                      </div>
                      {formData.approvedBy && <div className="text-[10px] text-slate-500 font-medium">{formData.approvedBy}</div>}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 text-center py-2 italic font-medium">
                    No approval steps defined
                  </div>
                )
              ) : (
                formData.approvalHistory.map((step, idx) => {
                  const isApproved = step.status === 'APPROVED';
                  const isRejected = step.status === 'REJECTED';
                  const isPending = step.status === 'PENDING';

                  return (
                    <div key={idx} className="relative z-10 flex gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm ${isApproved ? 'bg-emerald-500 border-emerald-500 text-white' :
                        isRejected ? 'bg-red-500 border-red-500 text-white' :
                          'bg-slate-50 border-slate-200 text-slate-400'
                        }`}>
                        {isApproved ? <CheckIcon className="h-3.5 w-3.5" /> :
                          isRejected ? <X className="h-3.5 w-3.5" strokeWidth={3} /> :
                            <span className="text-[10px] font-bold">{idx + 1}</span>}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="text-xs font-bold text-slate-800">{step.displayName}</div>
                          <span className={`${isApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            isRejected ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-yellow-50 text-yellow-700 border-yellow-200'
                            } text-[10px] px-1.5 rounded border whitespace-nowrap`}>
                            {step.status}
                          </span>
                        </div>
                        {step.approvedBy && <div className="text-[10px] text-slate-500 font-medium">{step.approvedBy}</div>}
                        {step.approvedAt && <div className="text-[10px] text-slate-400">{new Date(step.approvedAt).toLocaleString()}</div>}
                        {step.remarks && (
                          <div className="mt-1 p-1.5 bg-slate-50 rounded border border-slate-100 text-[9px] text-slate-600 italic">
                            "{step.remarks}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isReadOnly && formData.status === 'PENDING_APPROVAL' && (
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Approval Remarks</label>
                <textarea
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Optional remarks (e.g. Price verified)..."
                  rows={2}
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await approvalWorkflowApi.reject(formData.dbId, approvalRemarks);
                        toast.success("LPO Rejected");
                        window.location.reload();
                      } catch (err) {
                        toast.error(err.response?.data?.message || "Rejection failed");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="flex-1 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <PackageX size={14} /> Reject
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await approvalWorkflowApi.approve(formData.dbId, approvalRemarks);
                        toast.success("LPO Approved");
                        window.location.reload();
                      } catch (err) {
                        toast.error(err.response?.data?.message || "Approval failed");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <PackageCheck size={14} /> Approve
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BB-023: Inline Follow-Up & Revision History (shown in view mode) */}
      {isReadOnly && (
        <div className="mt-6 space-y-6">

          {/* Follow-Up Notes */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-[#F5C742]" />
              <h3 className="font-semibold text-slate-800 text-sm">Follow-Up Notes</h3>
              {followUpNotes && followUpNotes.length > 0 && (
                <span className="ml-auto text-[10px] bg-[#F5C742]/20 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                  {followUpNotes.length}
                </span>
              )}
            </div>
            {(!followUpNotes || followUpNotes.length === 0) ? (
              <div className="text-center py-6 text-slate-400 text-xs italic">No follow-up notes recorded.</div>
            ) : (
              <div className="space-y-3">
                {followUpNotes.map((note, idx) => (
                  <div key={note.id || idx} className="flex gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-[#F5C742]/20 flex items-center justify-center">
                      <MessageSquare className="h-3.5 w-3.5 text-[#F5C742]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="text-xs font-semibold text-slate-800">{note.addedBy}</span>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[10px] text-slate-400">{note.addedAt}</div>
                          {note.date && <div className="text-[10px] font-bold text-[#F5C742]">Follow-up: {formatDisplayDate(note.date)}</div>}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 break-words">{note.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revision / Approval History */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <GitCommit className="h-4 w-4 text-[#F5C742]" />
              <h3 className="font-semibold text-slate-800 text-sm">Approval & Revision History</h3>
            </div>
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-200" />
              <div className="space-y-3 ml-9">

                {/* Current status marker */}
                <div className="relative">
                  <div className="absolute -left-9 mt-1 w-5 h-5 rounded-full bg-[#F5C742] border-2 border-white shadow flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="bg-[#F5C742]/10 border border-[#F5C742]/30 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800">Current Status: {formData.status}</span>
                      {formData.approvedAt && (
                        <span className="text-[10px] text-slate-400">{new Date(formData.approvedAt).toLocaleString()}</span>
                      )}
                    </div>
                    {formData.approvedBy && (
                      <p className="text-[10px] text-slate-500 mt-0.5">By: <strong>{formData.approvedBy}</strong></p>
                    )}
                  </div>
                </div>

                {/* Approval workflow steps */}
                {(formData.approvalHistory || []).length > 0 ? (
                  [...formData.approvalHistory].reverse().map((step, idx) => {
                    const isApproved = step.status === 'APPROVED';
                    const isRejected = step.status === 'REJECTED';
                    const dotColor = isApproved ? 'bg-emerald-500' : isRejected ? 'bg-red-500' : 'bg-slate-300';
                    const cardClass = isApproved ? 'bg-emerald-50 border-emerald-200' : isRejected ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200';
                    const labelColor = isApproved ? 'text-emerald-700' : isRejected ? 'text-red-600' : 'text-slate-500';
                    return (
                      <div key={idx} className="relative">
                        <div className={`absolute -left-9 mt-1 w-5 h-5 rounded-full ${dotColor} border-2 border-white shadow flex items-center justify-center`}>
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                        <div className={`border rounded-lg p-3 ${cardClass}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-slate-800">
                                Step {step.stepOrder}: {step.displayName || step.roleCode}
                              </span>
                              <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${labelColor}`}>
                                {step.status}
                              </span>
                            </div>
                            {step.approvedAt && (
                              <span className="text-[10px] text-slate-400">{new Date(step.approvedAt).toLocaleString()}</span>
                            )}
                          </div>
                          {step.approvedBy && <p className="text-[10px] text-slate-500 mt-0.5">By: <strong>{step.approvedBy}</strong></p>}
                          {step.remarks && <p className="text-[10px] text-slate-600 mt-1 italic">"{step.remarks}"</p>}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-3 text-slate-400 text-xs italic">No approval steps recorded yet.</div>
                )}

                {/* Created milestone */}
                <div className="relative">
                  <div className="absolute -left-9 mt-1 w-5 h-5 rounded-full bg-slate-300 border-2 border-white shadow flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800">LPO Created</span>
                      <span className="text-[10px] text-slate-400">{formData.createdAt ? new Date(formData.createdAt).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-1">
                      <span key="lpo-prefix">LPO #</span>
                      <span key="lpo-no" className="font-medium">{formData.lpoNumber}</span>
                      <span key="created-text">created</span>
                      {formData.createdBy ? <span key="created-by"> by {formData.createdBy}</span> : null}
                      <span key="with-text"> with </span>
                      <span key="item-count">{formData.items?.length || 0}</span>
                      <span key="items-suffix"> item(s) for </span>
                      <strong key="vendor-name" className="font-bold">{formData.vendorName}</strong>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      )}

      {/* Bottom Bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t-2 border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 z-50 -mx-4 md:-mx-6 -mb-4 md:-mb-6">
        <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row justify-between items-center text-xs text-slate-400 gap-3 xl:gap-0 px-4">
          <div className="flex items-center gap-2 w-full xl:w-auto justify-center xl:justify-start">
            <Clock size={14} />
            <span className="text-center">
              Draft → Pending Approval → Approved → Sent to Vendor → GRN
            </span>
          </div>
          <div className="flex flex-wrap justify-center xl:justify-end items-center gap-2 w-full xl:w-auto">
            {initialData?.status !== 'DRAFT' && initialData?.status !== 'CANCELLED' && (
              <button
                onClick={() => onRevert(initialData.dbId)}
                disabled={loading}
                className="flex-1 xl:flex-none px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Revert to Draft
              </button>
            )}
            <button
              onClick={() => onPrint(initialData)}
              disabled={loading || !initialData || isReadOnly}
              className="flex-1 xl:flex-none px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={handleSaveAction}
              disabled={loading || !formData.vendorName || formData.items.length === 0 || isReadOnly}
              className="flex-1 xl:flex-none px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={14} />
              {isReadOnly ? 'View Only' : (loading ? 'Saving...' : 'Save Draft')}
            </button>
            <button
              onClick={handleSubmitAction}
              disabled={loading || !formData.vendorName || formData.items.length === 0 || isReadOnly}
              className="flex-1 xl:flex-none px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded font-bold text-slate-900 flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} />
              {isReadOnly ? (formData.status === 'PENDING_APPROVAL' ? 'Pending Approval' : 'View Only') : (loading ? 'Submitting...' : 'Submit for Approval')}
            </button>
          </div>
        </div>
      </div>


      {/* Product Selector Modal */}
      <ProductSelector
        isOpen={isProductSelectionOpen}
        onClose={() => { setIsProductSelectionOpen(false); setPendingFastEntryRowId(null); }}
        onSelect={handleAddSingleProduct}
        onInlineAdd={handleFastEntryAdd}
        initialSearch={pendingFastEntrySearch}
        actionLabel="Add to LPO"
        mode="purchase"
      />

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
    </div>
  );
};

// ==========================================
// 4. MAIN PAGE COMPONENT
// ==========================================

const LPOList = () => {
  const { company } = useCompany();
  const { branches: availableBranches, activeBranch } = useBranch();
  const currencyLabel = resolveCurrencyDisplayCode(company);
  const navigate = useNavigate();
  const [activeStatusTab, setActiveStatusTab] = useState("All LPOs");
  const [activeNavTab, setActiveNavTab] = useState("list");

  // Master State
  const [lpos, setLpos] = useState([]);
  // Client-side pagination over the filtered/processed list (backend /page
  // doesn't support all the filters this page exposes — status tab + date
  // range + vendor — so we slice processedData here).
  const [listPage, setListPage] = useState(0);
  const LIST_PAGE_SIZE = 30;
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [autoSuggestions, setAutoSuggestions] = useState([]);
  const [currentEditorData, setCurrentEditorData] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  // products state removed — ProductSelector fetches its own data from backend
  const [loading, setLoading] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  // BB-023: Follow-up and revision history state
  const [followUpNotes, setFollowUpNotes] = useState([]);
  const [newFollowUpNote, setNewFollowUpNote] = useState('');
  const [newFollowUpDate, setNewFollowUpDate] = useState(new Date().toISOString().split('T')[0]);

  // Search & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Filter State
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [selectedVendor, setSelectedVendor] = useState('');

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Modal State
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    type: null,
    id: null
  });

  // Advance Payment Modal State
  const [isAdvancePaymentModalOpen, setIsAdvancePaymentModalOpen] = useState(false);
  const [advancePaymentLpo, setAdvancePaymentLpo] = useState(null);
  const [advModalDate, setAdvModalDate] = useState(new Date().toISOString().split('T')[0]);
  const [advModalAmount, setAdvModalAmount] = useState('');
  const [advModalMode, setAdvModalMode] = useState('Cash');
  const [advModalBankAccount, setAdvModalBankAccount] = useState('');
  const [advModalChequeDate, setAdvModalChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [advModalRef, setAdvModalRef] = useState('');
  const [advModalNotes, setAdvModalNotes] = useState('');
  const [advModalBankOptions, setAdvModalBankOptions] = useState([]);
  const [advModalSaving, setAdvModalSaving] = useState(false);

  // Initialize Data via useEffect
  useEffect(() => {
    loadData();
  }, []);

  // Refetch when the global Branch Selector changes the active branch.
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('billbull:branch-changed', handler);
    return () => window.removeEventListener('billbull:branch-changed', handler);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel (products removed — ProductSelector fetches server-side)
      const [lposData, suggestionsData, vendorsData, warehousesData] = await Promise.all([
        getLpos(null).catch(() => []),
        getLpoSuggestions().catch(() => []),
        getVendors().catch(() => []),
        getWarehouses().catch(() => [])
      ]);

      setLpos(mapApiToUi(lposData));
      setAutoSuggestions(suggestionsData);
      setVendors(vendorsData);
      setWarehouses(warehousesData);

    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter approval queue whenever lpos change
  useEffect(() => {
    const pending = lpos.filter(l => l.status === "PENDING_APPROVAL");
    setApprovalQueue(
      pending.map(p => ({
        dbId: p.dbId,                 // ✅ KEEP numeric ID
        lpoNumber: p.lpoNumber,       // ✅ Business number
        vendorName: p.vendorName,
        date: p.date,
        totalValue: p.totalValue,
        urgency: "Normal"
      }))
    );
  }, [lpos]);

  // --- Handlers ---

  const handleCreateNew = () => {
    setCurrentEditorData(null);
    setIsViewOnly(false); // Reset to edit mode
    setActiveNavTab('editor');
  };

  const handleEditLPO = async (lpo) => {
    try {
      setLoading(true);
      const detailedLpo = await getLpoByNumber(lpo.lpoNumber);
      setCurrentEditorData({
        ...detailedLpo,
        id: detailedLpo.lpoNumber, // align with editor expectation
        dbId: detailedLpo.id        // align with editor expectation
      });
      setIsViewOnly(false); // Reset to edit mode
      setActiveNavTab('editor');
    } catch (error) {
      console.error('Failed to fetch LPO details:', error);
      alert('Could not load LPO details.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewLPO = async (lpo) => {
    try {
      setLoading(true);
      const detailedLpo = await getLpoByNumber(lpo.lpoNumber);
      setCurrentEditorData({
        ...detailedLpo,
        id: detailedLpo.lpoNumber, // align with editor expectation
        dbId: detailedLpo.id        // align with editor expectation
      });
      setIsViewOnly(true);
      // Populate follow-up feed from approval history remarks
      const historyNotes = (detailedLpo.approvalHistory || [])
        .filter(h => h.remarks)
        .map(h => ({
          id: `ah-${h.stepOrder}`,
          note: h.remarks,
          date: formatDisplayDate(h.approvedAt, ''),
          addedAt: h.approvedAt ? new Date(h.approvedAt).toLocaleString() : '',
          addedBy: h.approvedBy || h.displayName || `Step ${h.stepOrder}`
        }));
      setFollowUpNotes(historyNotes);
      setNewFollowUpNote('');
      setNewFollowUpDate(new Date().toISOString().split('T')[0]);
      setActiveNavTab('editor');
    } catch (error) {
      console.error('Failed to fetch LPO details:', error);
      alert('Could not load LPO details.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLPO = async (lpo) => {
    const loadingToast = toast.loading('Generating print layout...');
    try {
      setLoading(true);

      const detailedLpo = await getLpoByNumber(lpo.lpoNumber);

      const [templates, latestVendors] = await Promise.all([
        getTemplatesByCategory('Local Purchase Order'),
        getVendors().catch(() => vendors || [])
      ]);
      if (Array.isArray(latestVendors) && latestVendors.length > 0) {
        setVendors(latestVendors);
      }

      const defaultTemplate = resolvePurchasePrintTemplate('Local Purchase Order', templates);

      if (defaultTemplate) {
        const fullVendor = findVendorRecord(latestVendors, detailedLpo, detailedLpo?.vendorName);
        const printData = buildLpoPrintData(detailedLpo, fullVendor, company);
        const html = generatePrintHtml(defaultTemplate, printData, {
          companyProfile: buildDocumentHeaderProfile({
            company,
            branches: availableBranches || [],
            branchId: detailedLpo?.branchId ?? activeBranch?.id,
          }),
          billBullLogo
        });
        printHtml(html);
      } else {
        toast.error("No default template for LPO found.");
      }
    } catch (error) {
      console.error("Print error:", error);
      toast.error("Failed to generate print layout.");
    } finally {
      toast.dismiss(loadingToast);
      setLoading(false);
    }
  };

  const handleReviewAuto = (suggestion) => {
    const newLPO = {
      lpoNumber: `AUTO-${Date.now()}`,
      vendorName: suggestion.vendor,
      createdFrom: "Auto Min/Max",
      sourceType: "purple",
      date: new Date().toISOString().split('T')[0],
      status: "DRAFT",
      items: [
        {
          id: Date.now(),
          code: '',
          name: 'Suggested Item',
          uom: 'Unit',
          lastPrice: 0,
          currentCost: 0,
          qty: suggestion.items || 1,
          unitPrice: 0,
          disc: 0
        }
      ]
    };
    setCurrentEditorData(newLPO);
    setIsViewOnly(false); // Creating new from auto, so allow edit
    setActiveNavTab('editor');
  };

  const refreshLpos = async () => {
    try {
      const data = await getLpos(null);
      setLpos(mapApiToUi(data));
    } catch (error) {
      console.error('Failed to refresh LPOs:', error);
    }
  };

  const handleSaveDraft = async (data) => {
    try {
      let response;

      if (currentEditorData?.lpoNumber) {
        // Update existing LPO
        response = await updateLpo(currentEditorData.lpoNumber, data);
      } else {
        // Create new LPO
        response = await createLpo(data);
      }

      // Refresh the list
      await refreshLpos();

      // Switch back to list view
      setActiveNavTab('list');

      return response;
    } catch (error) {
      console.error('Save failed:', error);
      throw error;
    }
  };

  const handleSubmitForApproval = async (data) => {
    try {
      // First save as draft
      const savedLpo = await handleSaveDraft(data);

      if (!savedLpo?.id) {
        throw new Error('Failed to save LPO');
      }

      // Then submit for approval using the numeric ID
      await submitLpoForApproval(savedLpo.id);

      // Refresh data
      await refreshLpos();

      // Switch to approval queue
      setActiveNavTab('approval');

    } catch (error) {
      console.error('Submit failed:', error);
      throw error;
    }
  };

  const handleApprove = async (dbId) => {
    await approveLpo(dbId);
    await refreshLpos();
  };

  const handleReject = async (dbId) => {
    await rejectLpo(dbId);
    await refreshLpos();
  };

  const handleProceedToInvoice = async (dbId) => {
    try {
      const draft = await createDraftFromLpo(dbId);
      navigate('/purchases/invoice', { state: { fromLpo: draft } });
    } catch (error) {
      console.error("Proceed to Invoice Error:", error);
      toast.error(error.response?.data?.message || "Failed to proceed to invoice");
    }
  };

  const handleConvertToGrn = (dbId, lpoNumber) => {
    navigate('/purchases/grn', { state: { fromLpo: { dbId, lpoNumber } } });
  };

  const handleOpenAdvancePaymentModal = async (row) => {
    setAdvancePaymentLpo(row);
    const balance = Number(row.balanceDue ?? row.totalValue ?? 0);
    setAdvModalAmount(balance > 0 ? balance.toFixed(2) : '');
    setAdvModalDate(new Date().toISOString().split('T')[0]);
    setAdvModalMode('Cash');
    setAdvModalBankAccount('');
    setAdvModalChequeDate(new Date().toISOString().split('T')[0]);
    setAdvModalRef('');
    setAdvModalNotes('');
    try {
      const accs = await api.get('/api/ledger/accounts/bank-accounts').then(r => r.data);
      setAdvModalBankOptions(Array.isArray(accs) ? accs : []);
    } catch {
      setAdvModalBankOptions([]);
    }
    setIsAdvancePaymentModalOpen(true);
  };

  const handleCreateAdvancePayment = async () => {
    if (!advModalAmount || Number(advModalAmount) <= 0) {
      return toast.error('Please enter a valid amount.');
    }
    setAdvModalSaving(true);
    try {
      await createLpoAdvancePayment(advancePaymentLpo.dbId, {
        date: advModalDate,
        mode: advModalMode,
        amount: advModalAmount,
        ref: advModalRef,
        notes: advModalNotes,
        bankAccount: advModalBankAccount || undefined,
        chequeDate: advModalMode === 'Cheque' ? advModalChequeDate : undefined,
      });
      toast.success('Advance payment recorded.');
      setIsAdvancePaymentModalOpen(false);
      await refreshLpos();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to record advance payment.');
    } finally {
      setAdvModalSaving(false);
    }
  };

  const handlePrintPaymentVoucher = async (row) => {
    const loadingToast = toast.loading('Loading payment vouchers...');
    try {
      const vouchers = await getLpoPaymentVouchers(row.dbId);
      if (!vouchers || vouchers.length === 0) {
        toast.dismiss(loadingToast);
        return toast.error('No payment vouchers found for this LPO.');
      }
      const templates = await getTemplatesByCategory('Payment Voucher');
      const template = resolvePurchasePrintTemplate('Payment Voucher', templates);

      const voucher = vouchers[0];
      const fullVendor = findVendorRecord(vendors, row.vendorCode, row.vendorName);
      const printData = buildPaymentVoucherPrintData(
        { ...voucher, lpoId: row.lpoNumber },
        fullVendor,
        company,
        null
      );
      const html = generatePrintHtml(template, printData, {
        companyProfile: buildDocumentHeaderProfile({
          company,
          branches: availableBranches || [],
          branchId: voucher?.branch?.id ?? row?.branchId ?? activeBranch?.id,
        }),
        billBullLogo
      });
      printHtml(html);
    } catch (err) {
      console.error(err);
      toast.error('Failed to print payment voucher.');
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const handleRevertLPO = async (dbId) => {
    try {
      setLoading(true);
      await approvalWorkflowApi.revert(dbId);
      toast.success("LPO reverted to Draft");

      // Refresh data
      await refreshLpos();

      // If we are in editor, we should reload the data or close it
      // For simplicity, let's just go back to list
      setActiveNavTab('list');
      setCurrentEditorData(null);
    } catch (error) {
      console.error('Revert failed:', error);
      toast.error(error.response?.data?.message || "Revert failed");
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL TRIGGER HANDLERS ---
  const handleInitiateStockApprove = (dbId) => {
    setConfirmationModal({ isOpen: true, type: 'approve', id: dbId });
  };

  const handleInitiateStockReject = (dbId) => {
    setConfirmationModal({ isOpen: true, type: 'reject', id: dbId });
  };

  const handleConfirmStockAction = async () => {
    const { type, id } = confirmationModal;

    // Close modal
    setConfirmationModal({ ...confirmationModal, isOpen: false });

    if (type === 'approve') {
      await executeStockApprove(id);
    } else if (type === 'reject') {
      await executeStockReject(id);
    }
  };

  // --- ACTUAL EXECUTION HANDLERS (Called by Modal) ---
  const executeStockApprove = async (dbId) => {


    // Optimistic update
    setLpos(prevLpos =>
      prevLpos.map(lpo =>
        lpo.dbId === dbId ? { ...lpo, status: 'COMPLETED', received: 100 } : lpo
      )
    );
    // await createGRN(dbId); // Hypothetical API call
  };

  const executeStockReject = async (dbId) => {
    // Optimistic update
    setLpos(prevLpos =>
      prevLpos.map(lpo =>
        lpo.dbId === dbId ? { ...lpo, status: 'REJECTED' } : lpo
      )
    );
  };

  const processedData = useMemo(() => {
    let data = [...lpos];

    // 1. Filter by Status
    if (activeStatusTab !== "All LPOs") {
      const dbStatus = activeStatusTab.toUpperCase().replace(/ /g, '_');
      data = data.filter(l => l.status === dbStatus);
    }

    // 2. Filter by Search Query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      data = data.filter(l =>
        (l.lpoNumber && l.lpoNumber.toLowerCase().includes(lowerQuery)) ||
        (l.vendorName && l.vendorName.toLowerCase().includes(lowerQuery))
      );
    }

    // 3. Filter by Date Range
    if (dateRange.from) {
      data = data.filter(l => l.date >= dateRange.from);
    }
    if (dateRange.to) {
      data = data.filter(l => l.date <= dateRange.to);
    }

    // 4. Filter by Vendor
    if (selectedVendor) {
      data = data.filter(l => l.vendorName === selectedVendor || l.vendorCode === selectedVendor);
    }

    // 5. Sort
    if (sortConfig && sortConfig.key) {
      data.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return data;
  }, [lpos, activeStatusTab, searchQuery, sortConfig, dateRange, selectedVendor]);

  // Reset page when filters change, then slice processedData for the visible page.
  useEffect(() => { setListPage(0); }, [activeStatusTab, searchQuery, dateRange, selectedVendor]);
  const pagedProcessedData = useMemo(
    () => processedData.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
    [processedData, listPage]
  );

  const exportProcessedData = useMemo(() => processedData.map((row, index) => ({
    ...row,
    sNo: index + 1,
    totalValue: formatCurrencyDisplay(row.totalValue, currencyLabel)
  })), [currencyLabel, processedData]);

  const handleExportExcel = () => {
    exportToExcel(exportProcessedData, LPO_COLUMNS, 'LPO_List');
  };

  const handleExportPdf = () => {
    exportToPDF(exportProcessedData, LPO_COLUMNS, 'Local Purchase Orders', 'LPO_List');
  };

  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#F7F7FA] font-sans text-slate-900 relative">
      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 flex flex-col min-w-0">

        {/* Sticky Header */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-5 sticky top-0 z-40 shadow-sm mb-6 -mx-4 md:-mx-6 mt-[-16px] md:mt-[-24px]">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
            {/* Title and Controls */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Vendors {"&"} Purchases</span>
                <ChevronRight size={12} />
                <span className="font-medium text-slate-900">LPO {"&"} Approvals</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShoppingCart className="text-[#F5C742]" size={28} /> Local Purchase Orders (LPO)</h1>
                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded border border-blue-100 font-medium">
                  {autoSuggestions.length} Auto-Generated
                </span>
              </div>
              <p className="text-sm text-slate-500">
                Manage procurement, auto-generated reorders, approvals & vendor communication
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
              {activeNavTab !== 'list' && (
                <button
                  onClick={() => navigate(-1)}
                  className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
              {activeNavTab === 'list' && (
                <button
                  onClick={() => navigate(-1)}
                  className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}

              <button className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                <Upload className="h-4 w-4" /> Import
              </button>
              <ExportDropdown
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
              />
              <button
                onClick={handleCreateNew}
                disabled={loading}
                className="flex-1 sm:flex-none h-8 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> New LPO
              </button>
            </div>
          </div>

          {/* Navigation Tabs (Moved Here) */}
          <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4">
            {navigationTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeNavTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveNavTab(tab.id)}
                  disabled={loading && tab.id !== activeNavTab}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${isActive
                    ? "bg-[#F5C742] text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label} {tab.id === 'auto' && `(${autoSuggestions.length})`}
                </button>
              );
            })}
            {/* BB-023: Extra tabs shown when viewing an LPO */}
            {isViewOnly && (
              <>
                {[
                  { id: 'followup', label: 'Follow-Up', icon: MessageSquare },
                  { id: 'revisions', label: 'Revision History', icon: GitCommit },
                ].map((tab) => {
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
              </>
            )}
          </div>

          {/* Status Filters (Only for List View) */}
          {activeNavTab === 'list' && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mb-4 -mx-4 px-4 md:mx-0 md:px-0">
              {statusTabs.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveStatusTab(filter)}
                  className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors border ${activeStatusTab === filter
                    ? "bg-[#F5C742] text-slate-900 border-[#F5C742]"
                    : "bg-slate-50 text-slate-600 border-transparent hover:bg-slate-100"
                    }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && activeNavTab !== 'editor' ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F5C742]"></div>
          </div>
        ) : (
          <>
            {/* View Content */}
            {activeNavTab === 'list' && (
              <ListView
                lpos={lpos}
                processedData={pagedProcessedData}
                activeFilter={activeStatusTab}
                currentPage={0}
                onEdit={handleEditLPO}
                onView={handleViewLPO}
                onApprove={handleApprove}
                onReject={handleReject}
                onStockApprove={handleInitiateStockApprove}
                onStockReject={handleInitiateStockReject}
                onProceedToInvoice={handleProceedToInvoice}
                onConvertToGrn={handleConvertToGrn}
                onPrint={handlePrintLPO}
                onAdvancePayment={handleOpenAdvancePaymentModal}
                onPrintPaymentVoucher={handlePrintPaymentVoucher}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortConfig={sortConfig}
                requestSort={requestSort}
                showFilterPanel={showFilterPanel}
                setShowFilterPanel={setShowFilterPanel}
                dateRange={dateRange}
                setDateRange={setDateRange}
                selectedVendor={selectedVendor}
                setSelectedVendor={setSelectedVendor}
                vendors={vendors}
                currencyLabel={currencyLabel}
              />
            )}
            {activeNavTab === 'list' && (
              <PaginationFooter
                page={listPage}
                size={LIST_PAGE_SIZE}
                totalElements={processedData.length}
                totalPages={Math.ceil(processedData.length / LIST_PAGE_SIZE)}
                loading={loading}
                onPageChange={setListPage}
              />
            )}
            {activeNavTab === 'auto' && (
              <AutoGeneratedView
                suggestions={autoSuggestions}
                onReview={handleReviewAuto}
              />
            )}
            {activeNavTab === 'editor' && (
              <EditorView
                initialData={currentEditorData}
                vendors={vendors}
                warehouses={warehouses}
                onSave={handleSaveDraft}
                onSubmit={handleSubmitForApproval}
                onPrint={handlePrintLPO}
                onRevert={handleRevertLPO}
                isReadOnly={isViewOnly}
                followUpNotes={isViewOnly ? followUpNotes : undefined}
              />
            )}
            {activeNavTab === 'approval' && (
              <ApprovalQueueView
                queue={approvalQueue}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            )}
            {activeNavTab === 'history' && (
              <HistoryView lpos={lpos} />
            )}

            {/* BB-023: Follow-Up Tab */}
            {activeNavTab === 'followup' && currentEditorData && (
              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="h-5 w-5 text-[#F5C742]" />
                  <h3 className="font-bold text-slate-800 text-lg">Follow-Up Notes</h3>
                  <span className="text-xs text-slate-400 ml-1">— LPO #{currentEditorData.id || currentEditorData.lpoNumber}</span>
                </div>

                {/* Add Note Form */}
                <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-600 uppercase mb-3">Add Follow-Up</h4>
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Note</label>
                      <textarea
                        rows={3}
                        value={newFollowUpNote}
                        onChange={(e) => setNewFollowUpNote(e.target.value)}
                        placeholder="Enter follow-up note or action item..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30 resize-none"
                      />
                    </div>
                    <div className="w-40">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Follow-Up Date</label>
                      <input
                        type="date"
                        value={newFollowUpDate}
                        onChange={(e) => setNewFollowUpDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/30"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!newFollowUpNote.trim()) return;
                      setFollowUpNotes(prev => [{
                        id: Date.now(),
                        note: newFollowUpNote.trim(),
                        date: newFollowUpDate,
                        addedAt: new Date().toLocaleString(),
                        addedBy: 'Current User'
                      }, ...prev]);
                      setNewFollowUpNote('');
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-md transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" /> Add Note
                  </button>
                </div>

                {/* Notes List */}
                {followUpNotes.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">No follow-up notes yet.</div>
                ) : (
                  <div className="space-y-3">
                    {followUpNotes.map(note => (
                      <div key={note.id} className="flex gap-3 p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-[#F5C742]/20 flex items-center justify-center">
                          <MessageSquare className="h-4 w-4 text-[#F5C742]" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm font-semibold text-slate-800">{note.addedBy}</span>
                            <div className="text-right">
                              <div className="text-xs text-slate-400">{note.addedAt}</div>
                              <div className="text-xs font-bold text-[#F5C742]">Follow-up: {formatDisplayDate(note.date)}</div>
                            </div>
                          </div>
                          <p className="text-sm text-slate-600">{note.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* BB-023: Revision History Tab */}
            {activeNavTab === 'revisions' && currentEditorData && (
              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <GitCommit className="h-5 w-5 text-[#F5C742]" />
                  <h3 className="font-bold text-slate-800 text-lg">Approval & Revision History</h3>
                  <span className="text-xs text-slate-400 ml-1">— LPO #{currentEditorData.lpoNumber || currentEditorData.id}</span>
                </div>

                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
                  <div className="space-y-4 ml-10">

                    {/* Current Status */}
                    <div className="relative">
                      <div className="absolute -left-10 mt-1 w-5 h-5 rounded-full bg-[#F5C742] border-2 border-white shadow flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                      <div className="bg-[#F5C742]/10 border border-[#F5C742]/30 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-bold text-slate-800">Current Status: {currentEditorData.status}</span>
                          {currentEditorData.approvedAt && (
                            <span className="text-xs text-slate-400">{new Date(currentEditorData.approvedAt).toLocaleString()}</span>
                          )}
                        </div>
                        {currentEditorData.approvedBy && (
                          <p className="text-xs text-slate-500">Approved by <strong>{currentEditorData.approvedBy}</strong></p>
                        )}
                      </div>
                    </div>

                    {/* Approval Workflow Steps from backend */}
                    {(currentEditorData.approvalHistory || []).length > 0 ? (
                      [...(currentEditorData.approvalHistory)].reverse().map((step, idx) => {
                        const isApproved = step.status === 'APPROVED';
                        const isRejected = step.status === 'REJECTED';
                        const dotColor = isApproved ? 'bg-emerald-500' : isRejected ? 'bg-red-500' : 'bg-slate-300';
                        const cardClass = isApproved
                          ? 'bg-emerald-50 border-emerald-200'
                          : isRejected
                            ? 'bg-red-50 border-red-200'
                            : 'bg-white border-slate-200';
                        const labelColor = isApproved ? 'text-emerald-700' : isRejected ? 'text-red-600' : 'text-slate-500';
                        return (
                          <div key={idx} className="relative">
                            <div className={`absolute -left-10 mt-1 w-5 h-5 rounded-full ${dotColor} border-2 border-white shadow flex items-center justify-center`}>
                              <div className="w-2 h-2 rounded-full bg-white" />
                            </div>
                            <div className={`border rounded-lg p-4 ${cardClass}`}>
                              <div className="flex justify-between items-start mb-1">
                                <div>
                                  <span className="text-sm font-bold text-slate-800">
                                    Step {step.stepOrder}: {step.displayName || step.roleCode}
                                  </span>
                                  <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${labelColor}`}>
                                    {step.status}
                                  </span>
                                </div>
                                {step.approvedAt && (
                                  <span className="text-xs text-slate-400">{new Date(step.approvedAt).toLocaleString()}</span>
                                )}
                              </div>
                              {step.approvedBy && (
                                <p className="text-xs text-slate-500">By: <strong>{step.approvedBy}</strong></p>
                              )}
                              {step.remarks && (
                                <p className="text-xs text-slate-600 mt-1 italic">"{step.remarks}"</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      /* Fallback: show submitted/created milestones when no approval steps */
                      <>
                        {currentEditorData.submittedAt && (
                          <div className="relative">
                            <div className="absolute -left-10 mt-1 w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-white" />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-sm font-bold text-slate-800">Submitted for Approval</span>
                                <span className="text-xs text-slate-400">{new Date(currentEditorData.submittedAt).toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-slate-500">LPO was submitted for approval review.</p>
                            </div>
                          </div>
                        )}
                        <div className="text-center py-4 text-slate-400 text-sm italic">No approval steps recorded yet.</div>
                      </>
                    )}

                    {/* Created */}
                    <div className="relative">
                      <div className="absolute -left-10 mt-1 w-5 h-5 rounded-full bg-slate-400 border-2 border-white shadow flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-bold text-slate-800">LPO Created</span>
                          <span className="text-xs text-slate-400">{currentEditorData.createdAt ? new Date(currentEditorData.createdAt).toLocaleString() : 'N/A'}</span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-1 mt-1">
                          <span key="rev-lpo-prefix">LPO #</span>
                          <span key="rev-lpo-no" className="font-medium">{currentEditorData.lpoNumber}</span>
                          <span key="rev-created-text">created with </span>
                          <span key="rev-item-count">{currentEditorData.items?.length || 0}</span>
                          <span key="rev-items-suffix"> item(s) for </span>
                          <strong key="rev-vendor-name" className="font-bold">{currentEditorData.vendorName}</strong>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* --- RENDER CONFIRMATION MODAL --- */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        config={confirmationModal}
        onClose={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
        onConfirm={handleConfirmStockAction}
      />

      {/* --- ADVANCE PAYMENT MODAL --- */}
      {isAdvancePaymentModalOpen && advancePaymentLpo && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="bg-white w-[500px] rounded-lg shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Advance Payment</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Record advance payment to vendor for LPO <span className="font-mono font-semibold text-slate-700">{advancePaymentLpo.lpoNumber}</span>
                </p>
              </div>
              <button onClick={() => setIsAdvancePaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Balance Display */}
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-slate-500 font-medium">Balance Due</span>
                <span className="text-red-600 font-bold text-lg">
                  {currencyLabel} {Number(advancePaymentLpo.balanceDue ?? advancePaymentLpo.totalValue ?? 0).toFixed(2)}
                </span>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={advModalDate}
                  onChange={e => setAdvModalDate(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                />
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={advModalMode}
                  onChange={e => { setAdvModalMode(e.target.value); setAdvModalBankAccount(''); setAdvModalChequeDate(new Date().toISOString().split('T')[0]); }}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none bg-white"
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>Credit Card</option>
                </select>
              </div>

              {/* Bank Account — non-Cash */}
              {advModalMode !== 'Cash' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bank Account</label>
                  <select
                    value={advModalBankAccount}
                    onChange={e => setAdvModalBankAccount(e.target.value)}
                    className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none bg-white"
                  >
                    <option value="">Select bank account...</option>
                    {advModalBankOptions.map(acc => (
                      <option key={acc.id} value={acc.name}>{acc.code} — {acc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cheque Date */}
              {advModalMode === 'Cheque' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Date</label>
                  <input
                    type="date"
                    value={advModalChequeDate}
                    onChange={e => setAdvModalChequeDate(e.target.value)}
                    className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                  />
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount</label>
                <input
                  type="number"
                  value={advModalAmount}
                  onChange={e => setAdvModalAmount(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reference / Instrument No</label>
                <input
                  type="text"
                  placeholder="Cheque no, Transaction ID, etc."
                  value={advModalRef}
                  onChange={e => setAdvModalRef(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes..."
                  value={advModalNotes}
                  onChange={e => setAdvModalNotes(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => setIsAdvancePaymentModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAdvancePayment}
                disabled={advModalSaving}
                className="px-6 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded hover:bg-yellow-500 shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <DollarSign size={14} /> {advModalSaving ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LPOList;

