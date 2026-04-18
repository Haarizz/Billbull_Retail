import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../../../api/axiosConfig";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  Download,
  Settings,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  Printer,
  FileText,
  ScanLine,
  CreditCard,
  History,
  AlertTriangle,
  Check,
  X,
  Eye,
  Trash2,
  Paperclip,
  Share2,
  Calendar,
  LayoutDashboard,
  ArrowRightLeft,
  Zap,
  Box,

  Archive,
  MapPin,
  Grid,
  CornerDownRight,
  Menu,
  ChevronUp
} from "lucide-react";
import ProductSelector from "../../../components/ProductSelector";
import SearchableDropdown from "../../../components/SearchableDropdown";
import VendorSelector from "../../../components/VendorSelector";
import { getImageUrl } from "../../../utils/urlUtils";
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../../components/ItemDescriptionCell';
import ItemAddOnsModal from '../../../components/ItemAddOnsModal'; // BB-026
import StockAvailabilityModal from '../../../components/StockAvailabilityModal';

// Printing Utilities
import { getTemplatesByCategory } from '../../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../../utils/printGenerator';
import nestLogo from '../../../assets/NEST Logo Final.png';
import billBullLogo from '../../../assets/billBullLogo.png';
import toast from 'react-hot-toast';

// API IMPORTS
import {
  createDraftInvoice,
  submitInvoice,
  approveInvoice,
  recordPayment,
  getInvoices,
  getInvoiceById
} from "../../../api/purchaseInvoiceApi";
import { getVendors } from "../../../api/vendorsApi";
import { getProductsList } from "../../../api/productsApi";

// LPO API IMPORTS
import { getLpos, getLpoByNumber } from "../../../api/lpoApi";
import { getGrns, getGrnById } from "../../../api/grnApi";

// SHORTCUTS HOOK
import useShortcuts from '../../../hooks/useShortcuts';

// WAREHOUSE API IMPORTS
import {
  getWarehouses,
  getWarehouseZones,
  getZoneLocators,
  getLocatorBins
} from "../../../api/warehouseApi";

// ==========================================
// CONSTANTS (ENUMS)
// ==========================================
const SOURCE = {
  DIRECT: "DIRECT", // Interpreted as "Against Direct Purchase"
  LPO: "AGAINST_LPO",
  GRN: "AGAINST_GRN"
};

// ==========================================
// DATA MAPPING HELPER (BACKEND -> UI)
// ==========================================
const mapInvoiceFromApi = (inv) => {

  const statusColorMap = {
    DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
    PENDING_APPROVAL: "bg-yellow-100 text-yellow-700 border-yellow-200",
    POSTED: "bg-emerald-100 text-emerald-700 border-emerald-200"
  };

  const paymentColorMap = {
    UNPAID: "bg-red-50 text-red-600 border-red-100",
    PARTIALLY_PAID: "bg-orange-50 text-orange-600 border-orange-100",
    PAID: "bg-emerald-50 text-emerald-600 border-emerald-100"
  };

  // Calculate Financials for UI
  const amountPaid = Number(
    inv.amountPaid ?? (inv.payments ? inv.payments.reduce((acc, p) => acc + (Number(p.paidAmount) || 0), 0) : 0)
  );
  const outstanding = Number(inv.balanceDue ?? (Number(inv.grandTotal) - amountPaid));

  return {
    dbId: inv.id,                        // 🔑 backend ID
    id: inv.invoiceNumber,               // UI invoice no
    date: inv.invoiceDate,
    vendor: inv.vendorName,
    vendorId: inv.vendorInvoiceNo,
    grnId: inv.grnId,
    lpoId: inv.lpoId,
    source: inv.sourceType || "Direct",
    sourceColor: inv.sourceType === SOURCE.LPO ? "bg-blue-50 text-blue-600 border-blue-100" :
      inv.sourceType === SOURCE.GRN ? "bg-green-50 text-green-600 border-green-100" :
        "bg-purple-50 text-purple-600 border-purple-100", // Purple for DP

    // Ref No Mapping Logic
    refNo: inv.sourceType === SOURCE.GRN
      ? (inv.grnNo || inv.referenceNo || "-")
      : (inv.referenceNo || "-"),

    warehouse: inv.warehouseName || "Main Warehouse",
    warehouseId: inv.warehouseId ?? null,
    zoneId: inv.zoneId ?? null,
    locatorId: inv.locatorId ?? null,
    binId: inv.binId ?? null,
    subTotal: Number(inv.subTotal ?? 0),
    total: Number(inv.grandTotal),
    tax: inv.taxTotal,
    amountPaid: amountPaid,
    outstanding: outstanding,
    freight: Number(inv.freight ?? 0),
    customsDuty: Number(inv.customsDuty ?? 0),
    handling: Number(inv.handling ?? 0),
    clearing: Number(inv.clearing ?? 0),
    insurance: Number(inv.insurance ?? 0),
    otherCosts: Number(inv.otherCosts ?? 0),

    status: inv.status ? inv.status.replace("_", " ") : "Draft",
    statusColor: statusColorMap[inv.status] || statusColorMap.DRAFT,
    payment: inv.paymentStatus ? inv.paymentStatus.replace("_", " ") : "Unpaid",
    paymentColor: paymentColorMap[inv.paymentStatus] || paymentColorMap.UNPAID,
    dueDate: inv.dueDate,
    payments: inv.payments || [],
    items: inv.items || [], // Added items for editor
    submittedBy: inv.submittedBy || "System",
    flag: inv.flag || "None"
  };
};

// Navigation Tabs Configuration
const navTabs = [
  { id: "list", label: "Invoice List", icon: FileText },
  { id: "editor", label: "Create / Edit", icon: SquarePenIcon },
  { id: "draft", label: "Drafts", icon: FileText }, // Added Drafts Tab
  { id: "approval", label: "Pending Approval", icon: AlertTriangle },
  { id: "payment", label: "Pending Payment", icon: CreditCard },
  { id: "returns", label: "Returns / Debit Notes", icon: ArrowRightLeft },
  { id: "history", label: "History", icon: History },
];

function SquarePenIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></svg>
  );
}

function BarChart3(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
  )
}

// ==========================================
// MODALS
// ==========================================

const ViewInvoiceModal = ({ invoice, onClose }) => {
  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-500" />
            <div>
              <h3 className="text-lg font-bold text-slate-800">Invoice Details</h3>
              <p className="text-xs text-slate-500">{invoice.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase">Vendor</label>
              <div className="font-medium text-slate-800">{invoice.vendor}</div>
              <div className="text-xs text-slate-500">{invoice.vendorId}</div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase">Details</label>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Date:</span>
                <span className="font-medium text-slate-800">{invoice.date}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Warehouse:</span>
                <span className="font-medium text-slate-800">{invoice.warehouse || "Main"}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded border border-slate-100 p-4">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Financials</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-mono">{(Number(invoice.total) - Number(invoice.tax)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tax</span>
                <span className="font-mono text-slate-600">{Number(invoice.tax).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                <span className="text-slate-800">Total</span>
                <span className="text-[#F5C742] text-lg">{Number(invoice.total).toLocaleString()} AED</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-bold rounded border ${invoice.statusColor || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              Status: {invoice.status}
            </span>
            <span className={`px-2 py-1 text-xs font-bold rounded border ${invoice.paymentColor || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              Payment: {invoice.payment || 'N/A'}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-100 text-slate-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const PAYMENT_MODES = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: '🏦' },
  { value: 'CASH',          label: 'Cash',          icon: '💵' },
  { value: 'CHEQUE',        label: 'Cheque',        icon: '📄' },
  { value: 'CARD',          label: 'Card',          icon: '💳' },
];

const BANK_REQUIRED_MODES = ['BANK_TRANSFER', 'CHEQUE', 'CARD'];

const PaymentModal = ({ invoice, onClose, onConfirm }) => {
  const [paymentMode, setPaymentMode] = useState('BANK_TRANSFER');
  const [bankAccount, setBankAccount] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    api.get('/api/ledger/accounts/bank-accounts')
      .then(r => setBankAccounts(r.data || []))
      .catch(() => setBankAccounts([]));
  }, []);

  if (!invoice) return null;

  const needsBankAccount = BANK_REQUIRED_MODES.includes(paymentMode);
  const canConfirm = !needsBankAccount || bankAccount;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="bg-[#FFF8E1] p-1.5 rounded-md">
              <CreditCard className="h-4 w-4 text-[#F5C742]" />
            </div>
            <h3 className="font-bold text-slate-800">Make Payment - <span className="text-slate-500 font-normal text-sm">{invoice.id}</span></h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-slate-500">Record vendor payment for purchase invoice</p>

          {/* Outstanding amount */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding Amount</span>
              <span className="text-lg font-bold text-slate-800">{invoice.outstanding.toLocaleString()} AED</span>
            </div>
          </div>

          {/* Payment mode selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Payment Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => { setPaymentMode(mode.value); setBankAccount(''); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all duration-150 ${
                    paymentMode === mode.value
                      ? 'border-[#F5C742] bg-[#FFF8E1] text-slate-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="text-base leading-none">{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bank Account selector — shown for Card, Cheque, Bank Transfer */}
          {needsBankAccount && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Bank Account</label>
              <select
                value={bankAccount}
                onChange={e => setBankAccount(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5C742] bg-white"
              >
                <option value="">Select bank account...</option>
                {bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.name}>{acc.code} — {acc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Cheque Date — shown only when mode is CHEQUE */}
          {paymentMode === 'CHEQUE' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Cheque Date</label>
              <input
                type="date"
                value={chequeDate}
                onChange={e => setChequeDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5C742] bg-white"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={() => canConfirm && onConfirm(invoice, paymentMode, bankAccount || null, paymentMode === 'CHEQUE' ? chequeDate : null)}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded text-sm font-bold shadow-sm flex items-center gap-2 transition-colors ${canConfirm ? 'bg-[#F5C742] text-slate-900 hover:bg-[#E5B732]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
          >
            <Check className="h-4 w-4" /> Record Payment
          </button>
        </div>
      </div>
    </div>
  );
};

const SchedulePaymentModal = ({ invoice, onClose, onConfirm }) => {
  const [date, setDate] = useState("");
  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-1.5 rounded-md">
              <Calendar className="h-4 w-4 text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-800">Schedule Payment</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-2">
          <p className="text-sm text-slate-500 mb-4">Set a date for automatic payment processing for <span className="font-semibold">{invoice.id}</span>.</p>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Payment Date</label>
            <input type="date" className="w-full border border-slate-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-600" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onConfirm(invoice, date)} className="px-4 py-2 rounded bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

const InvoiceListView = ({ invoices, activeFilter, setActiveFilter, searchQuery, setSearchQuery, onView, onPrint, onPay, onRefresh, dateRange, setDateRange, vendorFilter, setVendorFilter }) => {
  const [showFilters, setShowFilters] = useState(false);

  const filteredInvoices = invoices.filter(inv => {
    // 1. Search Query
    const matchesSearch = inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.vendor.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Status Filter
    const normalizedStatus = inv.status.toUpperCase().replace(/ /g, "_");
    const normalizedPayment = inv.payment.toUpperCase().replace(/ /g, "_");
    const normalizedFilter = activeFilter.toUpperCase().replace(/ /g, "_");

    const matchesStatus = activeFilter === "All Invoices" ||
      normalizedStatus === normalizedFilter ||
      normalizedPayment === normalizedFilter;

    // 3. Date Range Filter
    let matchesDate = true;
    if (dateRange?.start) {
      matchesDate = matchesDate && new Date(inv.date) >= new Date(dateRange.start);
    }
    if (dateRange?.end) {
      matchesDate = matchesDate && new Date(inv.date) <= new Date(dateRange.end);
    }

    // 4. Vendor Filter
    let matchesVendor = true;
    if (vendorFilter) {
      matchesVendor = inv.vendor.toLowerCase().includes(vendorFilter.toLowerCase());
    }

    return matchesSearch && matchesStatus && matchesDate && matchesVendor;
  });

  const clearFilters = () => {
    setDateRange({ start: "", end: "" });
    setVendorFilter("");
    setSearchQuery("");
    setActiveFilter("All Invoices");
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-20">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <div className="text-sm font-medium text-slate-500">Invoices Today</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600">
              {invoices.filter(i => {
                const today = new Date();
                const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                return i.date === localToday;
              }).length}
            </span>
            <span className="text-xs text-slate-400">
              AED {invoices
                .filter(i => {
                  const today = new Date();
                  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  return i.date === localToday;
                })
                .reduce((sum, i) => sum + (Number(i.total) || 0), 0)
                .toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 2: Pending Approval */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-yellow-500">
          <div className="text-sm font-medium text-slate-500">Pending Approval</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-yellow-600">
              {invoices.filter(i => i.status === 'Pending Approval' || i.status === 'PENDING_APPROVAL').length}
            </span>
            <span className="text-xs text-slate-400">
              AED {invoices
                .filter(i => i.status === 'Pending Approval' || i.status === 'PENDING_APPROVAL')
                .reduce((sum, i) => sum + (Number(i.total) || 0), 0)
                .toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 3: Total Outstanding */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-red-500">
          <div className="text-sm font-medium text-slate-500">Total Outstanding</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600">
              {invoices.filter(i => i.outstanding > 0 && i.status !== 'Draft' && i.status !== 'DRAFT').length}
            </span>
            <span className="text-xs text-slate-400">
              AED {invoices
                .filter(i => i.outstanding > 0 && i.status !== 'Draft' && i.status !== 'DRAFT')
                .reduce((sum, i) => sum + (Number(i.outstanding) || 0), 0)
                .toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 4: Overdue (Demo Logic: Due Date < Today) */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-orange-500">
          <div className="text-sm font-medium text-slate-500">Overdue</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-orange-600">
              {invoices.filter(i => i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0).length}
            </span>
            <span className="text-xs text-slate-400">
              Needs Attention
            </span>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Filter className="h-4 w-4" /> Advanced Filters</h3>
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear All</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Start Date</label>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="w-full h-9 border border-slate-200 rounded-md text-xs px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">End Date</label>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="w-full h-9 border border-slate-200 rounded-md text-xs px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Vendor Name</label>
              <input type="text" placeholder="Filter by Vendor..." value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="w-full h-9 border border-slate-200 rounded-md text-xs px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Purchase Invoices</h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" placeholder="Search invoice no..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 h-9 w-full sm:w-64 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400 text-xs" />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => setShowFilters(!showFilters)} className={`flex-1 sm:flex-none h-9 px-3 border rounded-md flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Filter className="h-3 w-3" /> Filters</button>
              <button onClick={onRefresh} className="flex-1 sm:flex-none h-9 px-3 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"><RefreshCw className="h-3 w-3" /> Refresh</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F7F7FA] text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 whitespace-nowrap">Invoice No</th>
                <th className="px-6 py-3 whitespace-nowrap">Date</th>
                <th className="px-6 py-3 whitespace-nowrap">Vendor</th>
                <th className="px-6 py-3 whitespace-nowrap">Source</th>
                <th className="px-6 py-3 whitespace-nowrap">Ref No</th>
                <th className="px-6 py-3 whitespace-nowrap">Warehouse</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Invoice Total</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Tax</th>
                <th className="px-6 py-3 whitespace-nowrap">Status</th>
                <th className="px-6 py-3 whitespace-nowrap">Payment</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((row) => (
                <tr key={row.dbId} className="hover:bg-slate-50 group transition-colors">
                  <td onClick={() => onView(row)} className="px-6 py-4 font-mono font-medium text-[#F5C742] cursor-pointer hover:underline">{row.id}</td>
                  <td className="px-6 py-4 text-slate-600"><div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 text-slate-400" /> {row.date}</div></td>
                  <td className="px-6 py-4"><div><div className="font-medium text-slate-900">{row.vendor}</div><div className="text-[10px] text-slate-400">{row.vendorId}</div></div></td>
                  <td className="px-6 py-4"><span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${row.sourceColor}`}>{row.source}</span></td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-[10px]">{row.refNo}</td>
                  <td className="px-6 py-4 text-slate-600 flex items-center gap-1"><LayoutDashboard className="h-3 w-3 text-slate-400" /> {row.warehouse}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">{typeof row.total === 'number' ? row.total.toLocaleString() : row.total} AED</td>
                  <td className="px-6 py-4 text-right text-green-600 font-medium">{typeof row.tax === 'number' ? row.tax.toLocaleString() : row.tax}</td>
                  <td className="px-6 py-4"><div className="flex items-center gap-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${row.statusColor}`}>{row.status}</span>{row.hasAlert && <AlertTriangle className="h-3 w-3 text-amber-500" />}</div></td>
                  <td className="px-6 py-4"><div className="flex flex-col items-start gap-1"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${row.paymentColor}`}>{row.payment}</span></div></td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-100">
                      <button onClick={() => onView(row)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900" title="View"><Eye className="h-3 w-3" /></button>
                      <button onClick={() => onPrint(row)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900" title="Print"><Printer className="h-3 w-3" /></button>
                      {row.payment !== 'PAID' && row.status !== 'DRAFT' && row.status !== 'Draft' && (
                        <button onClick={() => onPay(row)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900" title="Pay"><CreditCard className="h-3 w-3" /></button>
                      )}
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
// EDITOR: CREATE / EDIT LOGIC (UPDATED FOR LPO)
// ==========================================

const CreateEditView = ({ onSaveDraft, onSubmitApproval, onPostDirectly, onCreatePayment, onSchedulePayment, editInvoice, onPrint, mode = "edit", onBackToList }) => {
  // LPO Data Logic
  const [lpoList, setLpoList] = useState([]);
  const [selectedLpo, setSelectedLpo] = useState("");
  const [selectedLpoId, setSelectedLpoId] = useState(null);

  // Direct Purchase List REMOVED

  // Use Source Enum for State
  const [invoiceType, setInvoiceType] = useState(SOURCE.DIRECT);

  const [grnList, setGrnList] = useState([]);
  const [selectedGrn, setSelectedGrn] = useState("");
  const [selectedGrnNo, setSelectedGrnNo] = useState("");

  // Lists
  const [warehouseList, setWarehouseList] = useState([]);
  const [zoneList, setZoneList] = useState([]);
  const [locatorList, setLocatorList] = useState([]);
  const [binList, setBinList] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [productList, setProductList] = useState([]);

  // UI State
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [selectedAddonItem, setSelectedAddonItem] = useState(null); // BB-026
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);
  const isViewMode = mode === "view";

  // Expanded rows state
  const [expandedRows, setExpandedRows] = useState({});

  const toggleAllDescriptions = () => {
    if (Object.keys(expandedRows).length > 0) {
      setExpandedRows({});
    } else {
      const allExpanded = {};
      formData.items.forEach(item => allExpanded[item.id] = true);
      setExpandedRows(allExpanded);
    }
  };

  const toggleRowDescription = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [formData, setFormData] = useState({
    id: `PI-2024-${Math.floor(Math.random() * 10000)}`,
    date: new Date().toISOString().split('T')[0],
    vendor: "",
    vendorInvoiceNo: "",
    dueDate: "",
    status: "Draft",
    warehouse: "", // Store ID or Name? detailed logic below
    warehouseId: null, // ✅ Capture ID
    zoneId: null,
    locatorId: null,
    binId: null,
    items: [],
    // ✅ Ensure these exist
    grnSubTotal: 0,
    grnTaxTotal: 0,
    grnGrandTotal: 0,
    // NLC Fields
    freight: 0,
    customsDuty: 0,
    handling: 0,
    clearing: 0,
    insurance: 0,
    otherCosts: 0
  });

  const [isVendorSearchOpen, setIsVendorSearchOpen] = useState(false);
  const [landedCostItems, setLandedCostItems] = useState([]);
  const [includeFocInAllocation, setIncludeFocInAllocation] = useState(false);

  // ✅ GLOBAL SHORTCUTS
  useShortcuts({
    'ctrl+p': (e) => {
      setIsProductSelectorOpen(prev => !prev);
    },
    'ctrl+s': (e) => {
      onSaveDraft();
    },
    'alt+v': (e) => {
      setIsVendorSearchOpen(prev => !prev);
    }
  });

  // Variable to check if Landed Cost is allowed
  const isLandedCostAllowed = invoiceType !== SOURCE.GRN;

  const productBarcodeIndex = useMemo(() => {
    const index = new Map();

    productList.forEach((product) => {
      const fallbackBarcode =
        product?.barcode ||
        product?.productBarcode ||
        product?.packings?.find?.((packing) => packing?.barcode)?.barcode ||
        "";

      [product?.code, product?.sku, product?.name, product?.description]
        .filter(Boolean)
        .forEach((value) => {
          index.set(String(value).trim().toLowerCase(), fallbackBarcode);
        });
    });

    return index;
  }, [productList]);

  const resolveBarcode = (item) => {
    const directBarcode = item?.barcode || item?.productBarcode || "";
    if (directBarcode) return directBarcode;

    const keys = [
      item?.itemCode,
      item?.code,
      item?.sku,
      item?.itemName,
      item?.name
    ].filter(Boolean);

    for (const key of keys) {
      const match = productBarcodeIndex.get(String(key).trim().toLowerCase());
      if (match) return match;
    }

    return "";
  };

  // Handle Edit Mode from Draft
  useEffect(() => {
    if (editInvoice) {
      // 1. Determine Type
      let type = SOURCE.DIRECT;
      if (editInvoice.source === "AGAINST_LPO" || editInvoice.source === SOURCE.LPO) type = SOURCE.LPO;
      if (editInvoice.source === "AGAINST_GRN" || editInvoice.source === SOURCE.GRN) type = SOURCE.GRN;

      setInvoiceType(type);

      // 2. Map Items (Now with FOC and Discount!)
      const mappedItems = (editInvoice.items || []).map((item, idx) => ({
        id: idx + 1,
        code: item.itemCode,
        barcode: resolveBarcode(item),
        name: item.itemName,
        image: item.image,
        uom: item.uom,
        qty: Number(item.qty),
        cost: Number(item.unitCost),
        tax: Number(item.taxPercent),
        taxAmt: Number(item.taxAmount || 0),
        taxAmount: Number(item.taxAmount || 0),
        disc: Number(item.discountPercent || 0),
        discount: Number(item.discountPercent || 0),
        discountAmount: Number(item.discountAmount || 0),
        foc: Number(item.focQty || 0),
        focUnit: item.focUnit || item.uom || 'PCS',
        lineTotal: Number(item.lineTotal),
        remarks: item.remarks || ""
      }));

      // 3. Set Form Data
      setFormData({
        id: editInvoice.id,
        date: editInvoice.date,
        vendor: editInvoice.vendor,
        vendorInvoiceNo: editInvoice.vendorId || "",
        dueDate: editInvoice.dueDate,
        status: editInvoice.status || "Draft",
        warehouse: editInvoice.warehouse || "Main Warehouse",
        warehouseId: editInvoice.warehouseId || null,
        zoneId: editInvoice.zoneId || null,
        locatorId: editInvoice.locatorId || null,
        binId: editInvoice.binId || null,
        items: mappedItems,
        grnSubTotal: Number(editInvoice.subTotal || 0),
        grnTaxTotal: Number(editInvoice.tax || 0),
        grnGrandTotal: Number(editInvoice.total || 0),
        freight: Number(editInvoice.freight || 0),
        customsDuty: Number(editInvoice.customsDuty || 0),
        handling: Number(editInvoice.handling || 0),
        clearing: Number(editInvoice.clearing || 0),
        insurance: Number(editInvoice.insurance || 0),
        otherCosts: Number(editInvoice.otherCosts || 0)
      });

      setLandedCostItems([
        { id: "freight", type: "Freight", name: "Freight", desc: "", cost: Number(editInvoice.freight || 0) },
        { id: "customsDuty", type: "Customs Duty", name: "Customs Duty", desc: "", cost: Number(editInvoice.customsDuty || 0) },
        { id: "handling", type: "Handling", name: "Handling", desc: "", cost: Number(editInvoice.handling || 0) },
        { id: "clearing", type: "Clearing", name: "Clearing", desc: "", cost: Number(editInvoice.clearing || 0) },
        { id: "insurance", type: "Insurance", name: "Insurance", desc: "", cost: Number(editInvoice.insurance || 0) },
        { id: "otherCosts", type: "Other", name: "Other", desc: "", cost: Number(editInvoice.otherCosts || 0) }
      ].filter((costItem) => Number(costItem.cost) > 0));

      // 4. Set Selects
      if (type === SOURCE.LPO) {
        setSelectedLpo(editInvoice.refNo || editInvoice.lpoNo);
        setSelectedLpoId(editInvoice.lpoId || null);
      }
      if (type === SOURCE.GRN) {
        setSelectedGrnNo(editInvoice.grnNo || editInvoice.refNo);
        if (editInvoice.grnId) setSelectedGrn(editInvoice.grnId);
      }

      // 5. Cascade-load warehouse zones/locators/bins
      const loadWarehouseHierarchy = async () => {
        const whId = editInvoice.warehouseId;
        if (!whId) return;
        try {
          const zones = await getWarehouseZones(whId);
          setZoneList(zones);
          if (editInvoice.zoneId) {
            const locators = await getZoneLocators(editInvoice.zoneId);
            setLocatorList(locators);
            if (editInvoice.locatorId) {
              const bins = await getLocatorBins(editInvoice.locatorId);
              setBinList(bins);
            }
          }
        } catch (e) {
          console.error("Failed to load warehouse hierarchy", e);
        }
      };
      loadWarehouseHierarchy();
    }
  }, [editInvoice, productBarcodeIndex]);

  useEffect(() => {
    if (!productList.length) return;

    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => ({
        ...item,
        barcode: item.barcode || resolveBarcode(item)
      }))
    }));
  }, [productList]);

  // Load LPOs and DPs on Mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load Warehouses
        const whData = await getWarehouses();
        setWarehouseList(whData);

        // Load Approved LPOs
        const lpoData = await getLpos("APPROVED");
        setLpoList(lpoData);

        // Load Vendors
        const vData = await getVendors();
        setVendorList(vData);

        // Load Products (use list endpoint - reliable, fast)
        const pData = await getProductsList(0, 500, "");
        const products = pData && Array.isArray(pData) ? pData
          : (pData && pData.content ? pData.content : []);
        setProductList(products);

      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (invoiceType === SOURCE.GRN) {
      getGrns()
        .then(res => {
          const list = Array.isArray(res)
            ? res
            : Array.isArray(res.data)
              ? res.data
              : [];



          setGrnList(list);
        })
        .catch(err => console.error("Failed to load GRNs", err));
    }
  }, [invoiceType]);


  // handleDpSelect REMOVED


  // Handle LPO Selection (Core Logic)
  const handleLpoSelect = async (lpoNumber) => {
    if (!lpoNumber) {
      setSelectedLpo("");
      return;
    }

    try {
      const lpo = await getLpoByNumber(lpoNumber);

      if (lpo) {
        // Find warehouse ID
        const wh = warehouseList.find(w => w.name === lpo.warehouseName);
        const whId = wh ? wh.id : null;

        // Cascade: fetch zones, then locators, then bins from LPO location data
        let zones = [];
        let locators = [];
        let bins = [];
        let zoneId = lpo.zoneId || null;
        let locatorId = lpo.locatorId || null;
        let binId = lpo.binId || null;

        if (whId) {
          try { zones = await getWarehouseZones(whId); } catch (e) { zones = []; }
          setZoneList(zones);
        }
        if (zoneId) {
          try { locators = await getZoneLocators(zoneId); } catch (e) { locators = []; }
          setLocatorList(locators);
        }
        if (locatorId) {
          try { bins = await getLocatorBins(locatorId); } catch (e) { bins = []; }
          setBinList(bins);
        }

        // 1. Map Fields
        setFormData(prev => ({
          ...prev,
          vendor: lpo.vendorName,
          status: "Draft",
          warehouse: lpo.warehouseName,
          warehouseId: whId,
          zoneId: zoneId,
          locatorId: locatorId,
          binId: binId,

          grnSubTotal: Number(lpo.subtotal || 0),
          grnTaxTotal: Number(lpo.tax || 0),
          grnGrandTotal: Number(lpo.grandTotal || 0),
          items: lpo.items.map((item, idx) => ({
            id: idx + 1,
            code: item.productCode || item.itemCode,
            barcode: item.barcode || item.productBarcode || '',
            name: item.productName || item.itemName,
            image: item.image,
            uom: item.uom,
            qty: item.quantity,
            cost: item.unitPrice,
            tax: 5,
            taxAmt: Number(item.taxAmount || 0),
            taxAmount: Number(item.taxAmount || 0),
            disc: item.discountPercent || 0,
            discount: item.discountPercent || 0,
            foc: item.focQty || 0,
            focUnit: item.focUnit || item.uom || 'PCS',
            remarks: item.remarks || ""
          }))
        }));

        // 2. Map Landed Costs if any
        if (lpo.landedCosts && lpo.landedCosts.length > 0) {
          setLandedCostItems(lpo.landedCosts.map((lc, idx) => ({
            id: idx + 1,
            name: lc.costName,
            desc: lc.description,
            cost: lc.amount,
            type: lc.costName
          })));
        } else {
          setLandedCostItems([]);
        }

        setSelectedLpo(lpoNumber);
        setSelectedLpoId(lpo.id || lpo.dbId || null);
      }
    } catch (err) {
      console.error("Failed to fetch LPO details", err);
      alert("Error loading LPO details");
    }
  };


  const handleGrnSelect = async (grnId) => {
    if (!grnId) return;

    try {
      // 1. Fetch Details
      const grnDetail = await getGrnById(grnId);


      // 2. Find Header Info (Fallback to List if Detail is missing totals)
      const grnFromList = grnList.find(g => g.id == grnId) || {};

      // 3. Determine True Financials (Header Truth)
      // Database says: Subtotal 1660, Tax 83, Total 1743. 
      // API 'value' usually maps to Grand Total.
      const headerGrandTotal = Number(grnDetail.value || grnDetail.grandTotal || grnFromList.value || 0);
      const headerTax = Number(grnDetail.taxAmount || grnDetail.tax_amount || 0);
      let headerSubTotal = Number(grnDetail.subTotal || grnDetail.subtotal || 0);


      // 4. Calculate Item-Level Totals to check for gaps
      const rawItems = grnDetail.items || [];
      const calculatedGross = rawItems.reduce((sum, item) => {
        const qty = Number(item.accepted ?? item.acceptedQty ?? 0);
        const cost = Number(item.unitCost ?? item.unit_cost ?? 0); // Handle snake_case too
        return sum + (qty * cost);
      }, 0);

      // 5. Intelligent Gap Filling
      // If Subtotal is missing from header, use the calculated gross from items
      if (headerSubTotal === 0) headerSubTotal = calculatedGross;

      // If Tax is missing, derive it (GrandTotal - SubTotal)
      let finalTax = headerTax;
      if (finalTax === 0 && headerGrandTotal > 0) {
        finalTax = headerGrandTotal - headerSubTotal;
      }

      // If Grand Total is missing, derive it (SubTotal + Tax)
      let finalGrandTotal = headerGrandTotal;
      if (finalGrandTotal === 0) {
        finalGrandTotal = headerSubTotal + finalTax;
      }

      // 6. Map Items and Distribute Missing Tax
      const mappedItems = rawItems.map((item, idx) => {
        const qty = Number(item.accepted ?? item.acceptedQty ?? 0);
        const cost = Number(item.unitCost ?? item.unit_cost ?? 0);
        const lineGross = qty * cost;

        // Distribute tax proportional to line value if specific item tax is missing
        let itemTaxAmt = Number(item.taxAmount ?? 0);
        if (itemTaxAmt === 0 && finalTax > 0 && headerSubTotal > 0) {
          itemTaxAmt = (lineGross / headerSubTotal) * finalTax;
        }

        return {
          id: idx + 1,
          code: item.code || item.productCode,
          barcode: item.barcode || item.productBarcode || '',
          name: item.name || item.productName,
          image: item.image || item.productImage,
          uom: item.uom,
          qty: qty,
          cost: cost,
          // 🔒 BACKEND-TRUTH FIELDS
          tax: finalTax > 0 ? 5 : 0,
          taxAmt: itemTaxAmt,
          taxAmount: itemTaxAmt,     // ✅ Distributed Tax
          lineTotal: lineGross + itemTaxAmt,
          disc: 0,
          discount: 0,
          foc: Number(item.focQty || 0),
          focUnit: item.focUnit || item.uom || 'PCS',
          remarks: item.remarks || ""
        };
      });

      // Find warehouse ID
      const wh = warehouseList.find(w => w.name === grnDetail.warehouseName || w.id === grnDetail.warehouseId);
      const whId = wh ? wh.id : null;

      // Cascade: fetch zones, then locators, then bins from GRN location data
      let zones = [];
      let locators = [];
      let bins = [];
      const grnZoneId = grnDetail.zoneId || null;
      const grnLocatorId = grnDetail.locatorId || null;
      const grnBinId = grnDetail.binId || null;

      if (whId) {
        try { zones = await getWarehouseZones(whId); } catch (e) { zones = []; }
        setZoneList(zones);
      }
      if (grnZoneId) {
        try { locators = await getZoneLocators(grnZoneId); } catch (e) { locators = []; }
        setLocatorList(locators);
      }
      if (grnLocatorId) {
        try { bins = await getLocatorBins(grnLocatorId); } catch (e) { bins = []; }
        setBinList(bins);
      }

      // 7. Update State
      setFormData(prev => ({
        ...prev,
        vendor: grnDetail.vendor || grnDetail.vendorName || "",
        warehouse: grnDetail.warehouseName || "Main Warehouse",
        warehouseId: whId,
        zoneId: grnZoneId,
        locatorId: grnLocatorId,
        binId: grnBinId,
        status: "Draft",

        // ✅ CRITICAL: Store these specifically for the Summary Box
        grnSubTotal: headerSubTotal,
        grnTaxTotal: finalTax,
        grnGrandTotal: finalGrandTotal,

        items: mappedItems
      }));

      setSelectedGrn(grnId);
      setSelectedGrnNo(grnDetail.grnNo);
    } catch (err) {
      console.error("Failed to load GRN", err);
    }
  };

  const handleProductSelect = (product) => {
    const defaultUnit = product.unitName || product.unit || (product.availableUnits && product.availableUnits[0]) || 'PCS';
    const newItem = {
      id: Date.now(),
      code: product.code || "SKU-NEW",
      barcode: product.barcode || '',
      name: product.description || product.name || "New Item",
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || null,
      remarks: product.description || '',
      uom: defaultUnit,
      qty: 1,
      cost: product.cost || 0,
      tax: product.taxRate || 5, // Default tax
      taxAmt: 0,
      taxAmount: 0,
      disc: 0,
      discount: 0,
      foc: 0,
      focUnit: defaultUnit,
      availableUnits: product.availableUnits || [defaultUnit],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      // Internal Tracking
      productId: product.id
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setIsProductSelectorOpen(false);
  };


  // Standardized Locking Logic
  const isAgainstSource =
    (invoiceType === SOURCE.LPO && !!selectedLpo) ||
    (invoiceType === SOURCE.GRN && !!selectedGrn);
  const normalizedStatus = String(formData.status || "").toUpperCase().replace(/ /g, "_");
  const isInvoiceLocked = isViewMode || normalizedStatus !== "DRAFT";
  const isFormLocked = isInvoiceLocked || isAgainstSource;

  // Derived total landed cost
  const landedCost = landedCostItems.reduce((sum, item) => sum + Number(item.cost), 0);

  const handleAddLandedCost = () => {
    setLandedCostItems([...landedCostItems, {
      id: Date.now(),
      type: "Other", // Default type
      name: "Other",
      desc: "", // Clean default
      cost: 0
    }]);
  };

  const handleLandedCostChange = (id, field, value) => {
    setLandedCostItems(prev => prev.map(item => {
      if (item.id === id) {
        const updates = { [field]: value };
        if (field === 'type') {
          updates.name = value; // Keep name synced with type for compatibility
        }
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const handleRemoveLandedCost = (id) => {
    setLandedCostItems(landedCostItems.filter(item => item.id !== id));
  };

  const handleAllocateCosts = () => {
    if (landedCost === 0) {
      alert("No landed costs to allocate.");
      return;
    }
    if (formData.items.length === 0) {
      alert("No items to allocate costs to.");
      return;
    }

    // Allocation Logic: Weighted by Value (Gross Total); optionally include FOC qty
    const effectiveQty = (item) => item.qty + (includeFocInAllocation ? (Number(item.foc) || 0) : 0);
    const itemsGrossTotal = formData.items.reduce((sum, item) => sum + (effectiveQty(item) * item.cost), 0);

    if (itemsGrossTotal === 0) {
      alert("Cannot allocate based on value because total item value is 0.");
      return;
    }

    const updatedItems = formData.items.map(item => {
      const itemGross = effectiveQty(item) * item.cost;
      const weight = itemGross / itemsGrossTotal;
      const allocatedCost = landedCost * weight;

      // Update unit cost or just store allocation?
      // User said "allocate and add cost to the invoice used giving net landed cost"
      // Usually this means we track NLC per item without changing the base unit cost (which is the vendor price).
      // We will add `allocatedCost` to the item structure.

      return {
        ...item,
        allocatedCost: allocatedCost,
        netLandedCost: (itemGross + allocatedCost) / item.qty // Unit NLC
      };
    });

    setFormData(prev => ({ ...prev, items: updatedItems }));
    alert(`Successfully allocated ${landedCost.toFixed(2)} AED across ${formData.items.length} items.`);
  };

  const calculateRow = (item) => {
    // 🔒 GRN-based invoices: DO NOT recompute
    if (invoiceType === SOURCE.GRN) {
      return {
        gross: item.qty * item.cost,
        discAmt: 0,
        taxAmt: item.taxAmount ?? item.taxAmt ?? 0,
        total: item.lineTotal ?? (item.qty * item.cost),
        net: item.qty * item.cost
      };
    }

    // LPO / DIRECT logic: FOC-aware
    const qty = Number(item.qty) || 0;
    const cost = Number(item.cost) || 0;
    const focQty = Number(item.foc) || 0;
    const discPercent = Number(item.discount ?? item.disc) || 0;
    const taxPercent = Number(item.tax) || 0;

    const gross = cost * qty;
    let focDeduction = 0;

    if (focQty > 0 && item.focUnit && item.unitConversions) {
      const sellingUnit = item.uom;
      const focUnit = item.focUnit;
      if (sellingUnit === focUnit) {
        focDeduction = cost * focQty;
      } else {
        const focConversion = item.unitConversions[focUnit] || 1;
        const sellingConversion = item.unitConversions[sellingUnit] || 1;
        const focInSellingUnit = (focQty * focConversion) / sellingConversion;
        focDeduction = cost * focInSellingUnit;
      }
    }

    const preDiscountAmount = Math.max(0, gross - focDeduction);
    const discAmt = preDiscountAmount * (discPercent / 100);
    const net = preDiscountAmount - discAmt;
    const taxAmt = net * (taxPercent / 100);
    const total = net + taxAmt;

    return { gross, discAmt, taxAmt, total, net };
  };


  const totals = useMemo(() => {
    const totalsFromItems = formData.items.reduce((acc, item) => {
      const calc = calculateRow(item);
      acc.qty += Number(item.qty);
      acc.discount += calc.discAmt;
      acc.tax += calc.taxAmt;
      acc.subtotal += calc.total - calc.taxAmt;
      acc.grandTotal += calc.total;
      return acc;
    }, { qty: 0, discount: 0, tax: 0, subtotal: 0, grandTotal: 0 });

    if (invoiceType === SOURCE.GRN || invoiceType === SOURCE.LPO) {
      return {
        qty: totalsFromItems.qty,
        discount: invoiceType === SOURCE.LPO ? totalsFromItems.discount : 0,
        tax: formData.grnTaxTotal || totalsFromItems.tax,
        subtotal: formData.grnSubTotal || totalsFromItems.subtotal,
        grandTotal: formData.grnGrandTotal || totalsFromItems.grandTotal
      };
    }

    return totalsFromItems;
  }, [formData.items, invoiceType, formData.grnSubTotal, formData.grnTaxTotal, formData.grnGrandTotal]);
  // ^ Added dependencies ensures update when handleGrnSelect finishes


  const grandTotalWithLanded = totals.grandTotal + (isLandedCostAllowed ? landedCost : 0);

  const handleAddItem = () => {
    setIsProductSelectorOpen(true);
  };

  const handleRemoveItem = (id) => {
    setFormData({ ...formData, items: formData.items.filter(i => i.id !== id) });
  };

  const handleInputChange = (id, field, value) => {
    setFormData({
      ...formData,
      items: formData.items.map(i => {
        if (i.id !== id) return i;
        const isStringField = field === 'uom' || field === 'focUnit';
        let updated = { ...i, [field]: isStringField ? value : (value === "" ? 0 : Number(value)) };

        // ✅ If unit is being changed, recalculate cost based on conversion
        if (field === 'uom' && i.unitConversions) {
          const newUnit = value;
          if (i.unitPrices && i.unitPrices[newUnit]) {
            updated.cost = i.unitPrices[newUnit];
          } else {
            const baseUnit = Object.keys(i.unitConversions).find(u => i.unitConversions[u] === 1);
            if (baseUnit) {
              let basePrice = i.unitPrices && i.unitPrices[baseUnit] ? i.unitPrices[baseUnit] : null;
              if (!basePrice) {
                const currentConv = i.unitConversions[i.uom] || 1;
                basePrice = i.cost / currentConv;
              }
              updated.cost = basePrice * (i.unitConversions[newUnit] || 1);
            }
          }
        }

        return updated;
      })
    });
  };

  // Prepare invoice data for submission (Backend 100% Match)
  const getInvoicePayload = () => ({
    invoiceNumber: formData.id,
    invoiceDate: formData.date,
    vendorName: formData.vendor,
    vendorInvoiceNo: formData.vendorInvoiceNo,
    sourceType: invoiceType, // Matches Enum directly

    lpoId: invoiceType === SOURCE.LPO ? selectedLpoId : null,
    grnId: invoiceType === SOURCE.GRN ? selectedGrn : null,
    grnNo: invoiceType === SOURCE.GRN ? selectedGrnNo : null,

    referenceNo:
      invoiceType === SOURCE.LPO
        ? selectedLpo
        : invoiceType === SOURCE.GRN
          ? selectedGrnNo
          : invoiceType === SOURCE.DIRECT
            ? null // No reference for Direct
            : null,

    warehouseName: formData.warehouse, // Name
    warehouseId: formData.warehouseId,
    zoneId: formData.zoneId,
    locatorId: formData.locatorId,
    binId: formData.binId,

    // Financials

    // Financials
    subTotal: totals.subtotal,
    discountTotal: totals.discount,
    taxTotal: totals.tax,

    // Force Landed Cost 0 for GRN
    landedCost: isLandedCostAllowed ? landedCost : 0,
    grandTotal: grandTotalWithLanded,

    dueDate: formData.dueDate,

    // Mapped Items
    items: formData.items.map(i => ({
      itemCode: i.code,
      barcode: i.barcode || '',
      itemName: i.name,
      uom: i.uom,
      qty: i.qty,
      focQty: i.foc,
      focUnit: i.focUnit || i.uom || 'PCS',
      unitCost: i.cost,

      discountPercent: invoiceType === SOURCE.GRN ? 0 : Number(i.discount ?? i.disc ?? 0),
      discountAmount: invoiceType === SOURCE.GRN ? 0 : calculateRow(i).discAmt,

      taxPercent: invoiceType === SOURCE.GRN ? 0 : i.tax,
      taxAmount: invoiceType === SOURCE.GRN ? Number(i.taxAmount ?? i.taxAmt ?? 0) : calculateRow(i).taxAmt,

      lineTotal: invoiceType === SOURCE.GRN ? i.lineTotal : calculateRow(i).total,
      warehouseName: formData.warehouse,
      remarks: i.remarks || ''
    })),

    // Mapped Costs - Empty array for GRN
    landedCosts: isLandedCostAllowed ? landedCostItems.map(lc => ({
      costName: lc.name,
      description: lc.desc,
      amount: lc.cost
    })) : [],

    // NLC Fields
    freight: Number(formData.freight || 0),
    customsDuty: Number(formData.customsDuty || 0),
    handling: Number(formData.handling || 0),
    clearing: Number(formData.clearing || 0),
    insurance: Number(formData.insurance || 0),
    otherCosts: Number(formData.otherCosts || 0)

  });

  const handlePaymentAction = (actionType) => {
    if (formData.status === "Draft") {
      alert("Cannot process payments for Draft invoices. Please submit for approval or post the invoice first.");
      return;
    }
    if (actionType === 'create') {
      onCreatePayment(getInvoicePayload());
    } else {
      onSchedulePayment(getInvoicePayload());
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20 relative">
      {isViewMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 shadow-sm">
          Viewing purchase invoice in the full GRN-style layout. Barcode details are shown on each item row where available.
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* --- LEFT SIDEBAR (Invoice Info) --- */}
        <div className="xl:col-span-1 space-y-4 order-2 xl:order-1">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm h-full">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Invoice Info</h3>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Invoice No</label>
                  <input type="text" value={formData.id} readOnly className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-600 font-mono" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Invoice Date</label>
                  <input type="date" value={formData.date} disabled={isInvoiceLocked} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-600 disabled:opacity-70" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Invoice Type</label>
                <div className="relative">
                  <select
                    value={invoiceType}
                    disabled={isInvoiceLocked}
                    onChange={(e) => {
                      const type = e.target.value;
                      setInvoiceType(type);

                      // reset everything
                      setSelectedLpo("");
                      setSelectedLpoId(null);
                      setSelectedGrn("");
                      setSelectedGrnNo("");
                      setLandedCostItems([]);

                      setFormData(prev => ({
                        ...prev,
                        vendor: "",
                        warehouse: "",
                        warehouseId: null,
                        zoneId: null,
                        locatorId: null,
                        binId: null,
                        items: [],
                        grnSubTotal: 0,
                        grnTaxTotal: 0,
                        grnGrandTotal: 0
                      }));
                    }}

                    className="w-full text-xs border border-slate-200 rounded-md py-2 pl-3 pr-8 bg-white focus:ring-1 focus:ring-[#F5C742] outline-none"
                  >
                    {/* Use Enum for Options */}
                    <option value={SOURCE.DIRECT}>Direct Invoice</option>
                    <option value={SOURCE.LPO}>Against LPO</option>
                    <option value={SOURCE.GRN}>Against GRN</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* DIRECT INVOICE MANUAL ENTRY NOTICE */}
              {invoiceType === SOURCE.DIRECT && (
                <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-700">
                  Enter items manually for Direct Invoice. Stock will be added upon approval if no GRN is linked.
                </div>
              )}

              {invoiceType === SOURCE.LPO && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">LPO No</label>
                  <SearchableDropdown
                    options={lpoList.map(lpo => ({
                      value: lpo.lpoNumber || lpo.id,
                      label: `${lpo.lpoNumber || lpo.id} - ${lpo.vendorName}`
                    }))}
                    value={selectedLpo}
                    onChange={(val) => handleLpoSelect(val)}
                    placeholder="Select LPO..."
                    disabled={isInvoiceLocked}
                    className="w-full"
                  />
                </div>
              )}

              {invoiceType === SOURCE.GRN && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    GRN No
                  </label>
                  <SearchableDropdown
                    options={grnList.map(grn => ({
                      value: grn.id,
                      label: `${grn.grnNo} - ${grn.vendorName || grn.vendor || "Vendor"}`
                    }))}
                    value={selectedGrn}
                    onChange={(val) => handleGrnSelect(val)}
                    placeholder="Select GRN..."
                    disabled={isInvoiceLocked}
                    className="w-full"
                  />
                </div>
              )}
              {invoiceType === SOURCE.GRN && selectedGrnNo && (
                <div className="mt-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">
                    Selected GRN
                  </label>
                  <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 text-slate-700">
                    {selectedGrnNo}
                  </div>
                  {invoiceType === SOURCE.GRN && (
                    <div className="text-xs text-slate-500 mt-2">
                      This invoice mirrors GRN financials. Values are locked.
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor Name</label>
                {formData.vendor ? (
                  <div className={`bg-slate-50 border border-slate-200 rounded-md p-4 relative group ${isFormLocked ? 'opacity-70 pointer-events-none' : ''}`}>
                    <button
                      onClick={() => !isFormLocked && setIsVendorSearchOpen(true)}
                      disabled={isFormLocked}
                      className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded-md transition-all text-slate-500"
                      title="Change Vendor"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    <div className="font-bold text-slate-800 text-sm mb-1">{formData.vendor}</div>
                  </div>
                ) : (
                  <button
                    onClick={() => !isFormLocked && setIsVendorSearchOpen(true)}
                    disabled={isFormLocked}
                    className={`w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 transition-colors ${isFormLocked ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <span className="text-slate-400">Select Vendor...</span>
                    <Search className="h-4 w-4 text-slate-400" />
                  </button>
                )}

                <VendorSelector
                  isOpen={isVendorSearchOpen}
                  onClose={() => setIsVendorSearchOpen(false)}
                  onSelect={(v) => setFormData({ ...formData, vendor: v?.name || '' })}
                  vendors={vendorList}
                  selectedCode={''}
                />
              </div>

              <div className="mt-2">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor Invoice No</label>
                <input
                  type="text"
                  placeholder="Vendor's invoice #"
                  value={formData.vendorInvoiceNo}
                  readOnly={isInvoiceLocked}
                  onChange={(e) => setFormData({ ...formData, vendorInvoiceNo: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-md py-2 px-3 focus:ring-1 focus:ring-[#F5C742] outline-none read-only:bg-slate-50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  disabled={isInvoiceLocked}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-md py-2 px-3 focus:ring-1 focus:ring-[#F5C742] outline-none disabled:opacity-70"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
                <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                  {formData.status}
                </span>
              </div>
            </div>

            {/* Vendor Details Section */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <LayoutDashboard className="h-3 w-3 text-slate-400" />
                <h3 className="font-semibold text-xs text-slate-700">Vendor Details</h3>
              </div>
              <div className="bg-slate-50 rounded p-3 border border-slate-100 text-xs">
                <div className="flex justify-between mb-2">
                  <span className="text-slate-500">Vendor</span>
                  <span className="font-medium text-right ml-2">{formData.vendor || "-"}</span>
                </div>
              </div>
            </div>

            {/* Warehouse Section */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <LayoutDashboard className="h-3 w-3 text-slate-400" />
                <h3 className="font-semibold text-xs text-slate-700">Warehouse</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Default Warehouse</label>
                  <SearchableDropdown
                    options={warehouseList.map(w => ({ value: w.id, label: w.name }))}
                    value={formData.warehouseId}
                    onChange={(whId) => {
                      const wh = warehouseList.find(w => w.id == whId);
                      setFormData({
                        ...formData,
                        warehouseId: whId,
                        warehouse: wh ? wh.name : "",
                        zoneId: null, locatorId: null, binId: null
                      });
                      if (whId) {
                        getWarehouseZones(whId).then(setZoneList).catch(console.error);
                      } else {
                        setZoneList([]);
                      }
                    }}
                    placeholder="Select Warehouse..."
                    disabled={isFormLocked}
                    menuPlacement="auto"
                    menuZIndexClass="z-[120]"
                    className="w-full"
                  />
                </div>

                {/* Zone Selector — always show when warehouse is selected */}
                {formData.warehouseId && (
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Zone</label>
                    <SearchableDropdown
                      options={zoneList.map(z => ({ value: z.id, label: z.name }))}
                      value={formData.zoneId}
                      onChange={(zId) => {
                        setFormData({ ...formData, zoneId: zId, locatorId: null, binId: null });
                        if (zId) getZoneLocators(zId).then(setLocatorList).catch(console.error);
                        else { setLocatorList([]); setBinList([]); }
                      }}
                      placeholder="Select Zone..."
                      disabled={isInvoiceLocked}
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                      className="w-full"
                    />
                  </div>
                )}

                {/* Locator Selector — always show when zone is selected */}
                {(formData.zoneId || locatorList.length > 0) && formData.warehouseId && (
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Locator</label>
                    <SearchableDropdown
                      options={locatorList.map(l => ({ value: l.id, label: l.name }))}
                      value={formData.locatorId}
                      onChange={(lId) => {
                        setFormData({ ...formData, locatorId: lId, binId: null });
                        if (lId) getLocatorBins(lId).then(setBinList).catch(console.error);
                        else setBinList([]);
                      }}
                      placeholder="Select Locator..."
                      disabled={isInvoiceLocked}
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                      className="w-full"
                    />
                  </div>
                )}

                {/* Bin Selector — always show when locator is selected */}
                {(formData.locatorId || binList.length > 0) && formData.warehouseId && (
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Bin</label>
                    <SearchableDropdown
                      options={binList.map(b => ({ value: b.id, label: b.name }))}
                      value={formData.binId}
                      onChange={(bId) => setFormData({ ...formData, binId: bId })}
                      placeholder="Select Bin..."
                      disabled={isInvoiceLocked}
                      menuPlacement="auto"
                      menuZIndexClass="z-[120]"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --- MIDDLE COLUMN (Items & Landed Cost) --- */}
        <div className="xl:col-span-2 space-y-4 order-1 xl:order-2">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full min-h-[400px] xl:min-h-[600px]">
            {/* Table Toolbar */}
            <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center bg-slate-50/50 gap-3">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-yellow-500" />
                <h3 className="font-semibold text-sm text-slate-700">Purchase Invoice Items <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-full ml-1 border border-slate-200">{formData.items.length} items</span></h3>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={handleAddItem}
                  disabled={isFormLocked}
                  className={`flex-1 sm:flex-none px-3 py-1.5 bg-yellow-400 text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 flex items-center justify-center gap-1 shadow-sm ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <Plus className="h-3 w-3" /> Select from Products
                </button>
                <button
                  onClick={() => setIsProductSelectorOpen(true)}
                  disabled={isFormLocked}
                  className="hidden" // Hidden proxy
                ></button>
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
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
                    <th className="p-3 font-medium text-center w-16">Qty</th>
                    <th className="p-3 font-medium text-right">Unit Cost</th>
                    <th className="p-3 font-medium text-center w-10">Disc %</th>
                    <th className="p-3 font-medium text-right text-green-600">Disc Amt</th>
                    <th className="p-3 font-medium text-center w-10">Tax %</th>
                    <th className="p-3 font-medium text-right">Tax Amt</th>
                    <th className="p-3 font-medium text-right">Amount</th>
                    <th className="p-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {formData.items.map((item, index) => {
                    const calc = calculateRow(item);
                    return (
                      <React.Fragment key={item.id}>
                        <tr className="hover:bg-slate-50 group">
                          <td className="p-3 text-center text-slate-400 text-xs font-medium">{index + 1}</td>
                          <td className="p-3">
                            <ItemDescriptionCell
                              item={{
                                ...item,
                                disc: Number(item.disc ?? item.discount ?? 0),
                                taxAmt: Number(item.taxAmt ?? item.taxAmount ?? 0)
                              }}
                              isExpanded={expandedRows[item.id]}
                              onToggleExpand={toggleRowDescription}
                              onItemChange={(id, field, val) => setFormData(prev => ({ ...prev, items: prev.items.map(i => i.id === id ? { ...i, [field]: val } : i) }))}
                              onFocusCode={() => { }}
                              onOpenProductSelection={!isFormLocked ? () => setIsProductSelectorOpen(true) : undefined}
                              onCheckStock={(selectedItem) => { setSelectedStockItem(selectedItem); setIsItemStockModalOpen(true); }}
                              onOpenSettings={() => setSelectedAddonItem({
                                ...item,
                                price: item.cost,
                                disc: Number(item.disc ?? item.discount ?? 0),
                                taxAmt: Number(item.taxAmt ?? item.taxAmount ?? 0),
                                unit: item.uom || item.unit,
                                desc: item.name || item.desc,
                                remarks: item.remarks || ''
                              })}
                              showSettings={Boolean(item.code || item.name || item.remarks || item.barcode)}
                              isReadOnly={isFormLocked}
                              showTaxDiscount={true}
                            />
                          </td>
                          {/* UOM Dropdown */}
                          <td className="p-3 text-center">
                            <select
                              disabled={isFormLocked}
                              className="w-full bg-transparent outline-none text-center text-xs text-slate-600 appearance-none font-medium cursor-pointer disabled:opacity-50"
                              value={item.uom || 'PCS'}
                              onChange={(e) => handleInputChange(item.id, 'uom', e.target.value)}
                            >
                              {(item.availableUnits || [item.uom || 'PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              disabled={isFormLocked}
                              value={item.qty}
                              onChange={(e) => handleInputChange(item.id, 'qty', e.target.value)}
                              // Prevent Scroll & Paste
                              onWheel={e => e.target.blur()}
                              onPaste={e => e.preventDefault()}
                              className={`w-12 text-center border border-slate-200 rounded bg-white ${isFormLocked ? 'bg-slate-50' : ''}`}
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              disabled={isFormLocked}
                              value={item.cost}
                              onChange={(e) => handleInputChange(item.id, 'cost', e.target.value)}
                              // Prevent Scroll & Paste
                              onWheel={e => e.target.blur()}
                              onPaste={e => e.preventDefault()}
                              className={`w-16 text-right border border-slate-200 rounded bg-white ${isFormLocked ? 'bg-slate-50' : ''}`}
                            />
                          </td>
                          <td className="p-3 text-center">{Number(item.disc ?? item.discount ?? 0)}</td>
                          <td className="p-3 text-right text-green-600">{calc.discAmt.toFixed(2)}</td>
                          <td className="p-3 text-center">{item.tax}</td>
                          <td className="p-3 text-right">{calc.taxAmt.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-[#F5C742]">{calc.total.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <button
                              disabled={isFormLocked}
                              onClick={() => handleRemoveItem(item.id)}
                              className={`text-red-400 hover:text-red-600 ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Description Row */}
                        {expandedRows[item.id] && (
                          <tr className="bg-white">
                            <td colSpan={11} className="px-0 pb-4 pt-1">
                              <div className="ml-0 mr-4 p-3 rounded-r-[10px] border-l-[3px] border-[#FFD700] bg-[#FFFDE7]/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                                <div className="flex justify-between items-center mb-1.5">
                                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#B8860B] tracking-widest uppercase">
                                    <Menu size={10} strokeWidth={3} className="opacity-80" /> INVOICE ITEM REMARKS
                                  </div>
                                </div>
                                <textarea
                                  className="w-full text-xs text-slate-700 bg-white/80 border border-slate-200/60 rounded p-2 outline-none focus:border-[#FFD700] hover:border-[#FFD700]/50 transition-colors min-h-[40px] resize-y placeholder:text-slate-400"
                                  placeholder="Enter item specific invoice remarks or description..."
                                  disabled={isFormLocked}
                                  value={item.remarks || ''}
                                  onChange={(e) => {
                                    setFormData(prev => ({ ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, remarks: e.target.value } : i) }))
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Landed Costs Section */}
            <div className="p-4 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-slate-400" />
                  <h3 className="font-semibold text-sm text-slate-700">Landed Costs & NLC</h3>
                  <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-100">{landedCost.toFixed(2)} AED</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Disable Landed Cost for GRN */}
                  <button
                    onClick={handleAllocateCosts}
                    disabled={!isLandedCostAllowed || isInvoiceLocked}
                    className={`flex-1 sm:flex-none px-3 py-1.5 border border-slate-200 rounded text-xs font-medium 
                               ${!isLandedCostAllowed || isInvoiceLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'} flex items-center justify-center gap-1`}>
                    <ArrowRightLeft className="h-3 w-3" /> Allocate
                  </button>
                  <button
                    onClick={handleAddLandedCost}
                    disabled={!isLandedCostAllowed || isInvoiceLocked}
                    className={`flex-1 sm:flex-none px-3 py-1.5 border border-slate-200 rounded text-xs font-medium 
                              ${!isLandedCostAllowed || isInvoiceLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'} flex items-center justify-center gap-1`}>
                    <Plus className="h-3 w-3" /> Add Cost
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {landedCostItems.map((costItem) => (
                  <div key={costItem.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 group">
                    {/* Cost Type Dropdown */}
                    <div className="w-full sm:w-48">
                      <select
                        value={costItem.type || "Other"}
                        onChange={(e) => handleLandedCostChange(costItem.id, 'type', e.target.value)}
                        disabled={isInvoiceLocked}
                        className="w-full text-xs border border-none bg-transparent font-medium text-slate-700 outline-none"
                      >
                        <option value="Freight">Freight</option>
                        <option value="Customs Duty">Customs Duty</option>
                        <option value="Handling">Handling</option>
                        <option value="Insurance">Insurance</option>
                        <option value="Clearing">Clearing</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Description Input */}
                    <div className="flex-1 w-full">
                      <input
                        type="text"
                        value={costItem.desc}
                        onChange={(e) => handleLandedCostChange(costItem.id, 'desc', e.target.value)}
                        disabled={isInvoiceLocked}
                        placeholder="Description (optional)"
                        className="w-full text-xs border-b border-slate-200 bg-transparent py-1 text-slate-500 placeholder:text-slate-300 focus:border-[#F5C742] outline-none"
                      />
                    </div>

                    {/* Amount Input */}
                    <div className="w-24 relative">
                      <input
                        type="number"
                        value={costItem.cost}
                        onChange={(e) => handleLandedCostChange(costItem.id, 'cost', e.target.value)}
                        disabled={isInvoiceLocked}
                        className="w-full text-xs text-right font-bold text-slate-800 bg-transparent py-1 border-b border-slate-200 focus:border-[#F5C742] outline-none"
                      />
                    </div>

                    <button disabled={isInvoiceLocked} onClick={() => handleRemoveLandedCost(costItem.id)} className="text-slate-300 hover:text-red-500 px-2 disabled:opacity-40 disabled:cursor-not-allowed"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                {!isLandedCostAllowed && invoiceType === SOURCE.GRN && (
                  <div className="text-center text-xs text-slate-400 italic py-2">
                    Landed costs are managed at the GRN stage.
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-4 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIncludeFocInAllocation(v => !v)}>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${includeFocInAllocation ? 'bg-[#F5C742]' : 'bg-slate-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-0 transition-transform ${includeFocInAllocation ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </div>
                  <span className={`text-xs ${includeFocInAllocation ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>Include FOC in allocation</span>
                </div>
                <div className="text-xs font-bold text-[#F5C742]">Total Landed Cost: {landedCost.toFixed(2)} AED</div>
              </div>
            </div>

            {/* NLC Second Section Removed */}
          </div>
        </div>

        {/* --- RIGHT SIDEBAR (Summary & Actions) --- */}
        <div className="xl:col-span-1 space-y-4 order-3">

          {/* Invoice Summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-sm text-slate-700">Invoice Summary</h3>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Subtotal</span>
                <span className="font-medium">{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span className="font-medium">Discount</span>
                <span className="font-medium">{totals.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium">{totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-500">
                <span className="font-medium">Landed Cost</span>
                <span className="font-medium">{isLandedCostAllowed ? landedCost.toFixed(2) : "0.00"}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-slate-100 mt-2">
                <span className="font-bold text-slate-800">Grand Total</span>
                <span className="font-bold text-[#F5C742]">{grandTotalWithLanded.toFixed(2)} AED</span>
              </div>
            </div>
          </div>

          {/* Accounting */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-slate-400 font-serif font-bold">$</span>
              <h3 className="font-semibold text-sm text-slate-700">Accounting</h3>
            </div>
            <div className="bg-slate-50 rounded p-3 text-[10px] space-y-1 font-mono text-slate-600 border border-slate-100">
              <div className="flex justify-between font-bold border-b border-slate-200 pb-1 mb-1 text-slate-800">
                <span>Posting Preview</span>
              </div>
              {invoiceType !== SOURCE.GRN && (
                <div className="flex justify-between">
                  <span>Dr. Inventory</span>
                  <span>{totals.subtotal.toFixed(2)}</span>
                </div>
              )}

              {totals.tax > 0 && (
                <div className="flex justify-between">
                  <span>Dr. VAT Recoverable</span>
                  <span>{totals.tax.toFixed(2)}</span>
                </div>
              )}


              <div className="flex justify-between">
                <span>Cr. Accounts Payable</span>
                <span>{grandTotalWithLanded.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM BAR (STICKY) --- */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 z-50">
        <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row justify-between items-center text-xs text-slate-400 gap-3 xl:gap-0 px-4">
          <div className="flex items-center gap-2 w-full xl:w-auto justify-center xl:justify-start">
            <History className="h-3 w-3" />
            <span className="text-center">Draft → Submitted → Pending Approval → Posted → Paid</span>
          </div>
          <div className="flex flex-wrap justify-center xl:justify-end items-center gap-2 w-full xl:w-auto">
            <button
              onClick={() => onPrint(isViewMode && editInvoice ? editInvoice : getInvoicePayload())}
              className="flex-1 xl:flex-none px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors whitespace-nowrap">
              <Printer className="h-3 w-3" /> <span className="hidden sm:inline">Print</span><span className="sm:hidden">Print</span>
            </button>
            {isViewMode ? (
              <button
                onClick={() => onBackToList && onBackToList()}
                className="flex-1 xl:flex-none px-4 py-2 bg-[#F5C742] rounded hover:bg-[#E5B732] font-bold text-slate-900 flex items-center justify-center gap-2 transition-colors whitespace-nowrap">
                <ArrowLeft className="h-3 w-3" /> <span className="hidden sm:inline">Back to List</span><span className="sm:hidden">Back</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => onSaveDraft(getInvoicePayload())}
                  className="flex-1 xl:flex-none px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors whitespace-nowrap">
                  <FileText className="h-3 w-3" /> <span className="hidden sm:inline">Save Draft</span><span className="sm:hidden">Draft</span>
                </button>
                <button
              onClick={() => {
                // 1. Basic Item Guard
                if (formData.items.length === 0) {
                  alert("Invoice must contain at least one item.");
                  return;
                }

                // 2. Vendor Guard
                if (!formData.vendor) {
                  alert("Vendor name is required.");
                  return;
                }

                // 3. Direct Invoice Location Guard
                if (invoiceType === SOURCE.DIRECT && !formData.warehouseId) {
                  alert("Warehouse is required for Direct Invoices to post stock.");
                  return;
                }

                // 4. NLC Validation
                const totalNLC = isLandedCostAllowed ? landedCost : 0;
                if (totalNLC > totals.subtotal) { // Using subtotal as base, usually NLC shouldn't exclude goods value
                  // User said "Invoice Total", usually implies Goods Value.
                  // Safe check: NLC > Grand Total is definitely wrong.
                  // Let's stick to user request "NLC must not exceed invoice total"
                  if (totalNLC > totals.grandTotal) {
                    alert("Total Landed Cost cannot exceed the Invoice Grand Total.");
                    return;
                  }
                }

                onSubmitApproval(getInvoicePayload());
              }}
              className="flex-1 xl:flex-none px-4 py-2 bg-white border border-blue-200 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap">
              <Share2 className="h-3 w-3" /> <span className="hidden sm:inline">Submit Approval</span><span className="sm:hidden">Submit</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <ProductSelector
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleProductSelect}
        actionLabel="Add to Invoice"
      />
      {/* BB-026: Item Add-Ons Modal */}
      <ItemAddOnsModal
        item={selectedAddonItem}
        onClose={() => setSelectedAddonItem(null)}
        onSave={(updated) => {
          setFormData(prev => ({
            ...prev,
            items: prev.items.map(i => {
              if (i.id !== updated.id) return i;
              return {
                ...i,
                barcode: updated.barcode || i.barcode || "",
                cost: Number(updated.price) || 0,
                disc: Number(updated.disc) || 0,
                discount: Number(updated.disc) || 0,
                tax: Number(updated.tax) || 0,
                taxAmt: Number(updated.taxAmt) || 0,
                taxAmount: Number(updated.taxAmt) || 0,
                foc: Number(updated.foc) || 0,
                focUnit: updated.focUnit || i.focUnit || i.uom || 'PCS',
                uom: updated.unit || i.uom,
                remarks: updated.remarks || ''
              };
            })
          }));
          setSelectedAddonItem(null);
        }}
      />
      <StockAvailabilityModal
        isOpen={isItemStockModalOpen}
        onClose={() => setIsItemStockModalOpen(false)}
        selectedStockItem={selectedStockItem}
      />
    </div>
  );
};

const PendingApprovalView = ({ pendingApprovals, onApprove, onView }) => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 shadow-sm min-h-[400px]">
        {/* ... Header ... */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-semibold text-slate-800">Pending Approval</h3>
          </div>
        </div>

        {pendingApprovals.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Check className="h-10 w-10 mx-auto mb-2 text-slate-200" />
            <p>No invoices awaiting approval.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="p-3 font-medium">Invoice No</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Vendor</th>
                  <th className="p-3 font-medium">Source</th>
                  <th className="p-3 font-medium">Ref No</th>
                  <th className="p-3 font-medium text-right">Invoice Total</th>
                  <th className="p-3 font-medium text-right text-green-600">Tax</th>
                  <th className="p-3 font-medium">Submitted By</th>
                  <th className="p-3 font-medium">Flags</th>
                  <th className="p-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingApprovals.map((item) => (
                  <tr key={item.dbId} className="hover:bg-slate-50">
                    <td onClick={() => onView(item)} className="p-3 font-mono font-medium text-[#F5C742] cursor-pointer">{item.id}</td>
                    <td className="p-3 text-slate-600 flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-400" /> {item.date}</td>
                    <td className="p-3">
                      <div>
                        <div className="font-medium text-slate-900">{item.vendor}</div>
                        <div className="text-[10px] text-slate-400">{item.vendorId}</div>
                      </div>
                    </td>
                    <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${item.sourceColor}`}>{item.source}</span></td>
                    <td className="p-3 font-mono text-slate-600">{item.refNo}</td>
                    <td className="p-3 text-right font-bold text-slate-900">{item.total.toLocaleString()} AED</td>
                    <td className="p-3 text-right text-green-600 font-medium">{item.tax.toLocaleString()}</td>
                    <td className="p-3 text-slate-600 flex items-center gap-1"><Zap className="h-3 w-3 text-slate-400" /> {item.submittedBy}</td>
                    <td className="p-3"><span className="bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded text-[10px] flex items-center w-fit gap-1"><AlertTriangle className="h-3 w-3" /> {item.flag}</span></td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => onView(item)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onApprove(item.dbId)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">
                          <Check className="h-3 w-3" /> Approve
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

// Updated columns to show Paid Amount and correct Outstanding
const PendingPaymentView = ({ pendingPayments, onPay, onView }) => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 shadow-sm min-h-[400px]">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-slate-800">Pending Payment <span className="bg-red-50 text-red-600 text-[10px] px-2 py-0.5 rounded border border-red-100 ml-2">{pendingPayments.length} Outstanding</span></h3>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
              <tr>
                <th className="p-3 font-medium">Invoice No</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Vendor</th>
                <th className="p-3 font-medium text-red-500">Due Date</th>
                <th className="p-3 font-medium text-right">Invoice Total</th>
                <th className="p-3 font-medium text-right text-green-600">Paid Amount</th>
                <th className="p-3 font-medium text-right text-red-600">Outstanding</th>
                <th className="p-3 font-medium">Payment Status</th>
                <th className="p-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pendingPayments.map((item) => (
                <tr key={item.dbId} className="hover:bg-slate-50">
                  <td onClick={() => onView(item)} className="p-3 font-mono font-medium text-[#F5C742] cursor-pointer">{item.id}</td>
                  <td className="p-3 text-slate-600 flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-400" /> {item.date}</td>
                  <td className="p-3">
                    <div>
                      <div className="font-medium text-slate-900">{item.vendor}</div>
                      <div className="text-[10px] text-slate-400">{item.vendorId}</div>
                    </div>
                  </td>
                  <td className="p-3 text-red-500 flex items-center gap-1"><History className="h-3 w-3" /> {item.dueDate}</td>
                  <td className="p-3 text-right font-medium text-slate-900">{typeof item.total === 'number' ? item.total.toLocaleString() : item.total}</td>

                  {/* Paid Amount */}
                  <td className="p-3 text-right text-green-600 font-medium">{item.amountPaid ? item.amountPaid.toLocaleString() : "0.00"}</td>

                  {/* Outstanding Amount */}
                  <td className="p-3 text-right text-red-600 font-bold">{item.outstanding ? item.outstanding.toLocaleString() : "0.00"}</td>

                  <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${item.statusColor.replace('text-', 'border-').replace('600', '200')} ${item.statusColor}`}>{item.status}</span></td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => onView(item)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Eye className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onPay(item)} className="flex items-center gap-1 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm">
                        <CreditCard className="h-3 w-3" /> Make Payment
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

const ReturnsDebitView = () => (
  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white border border-slate-200 rounded-lg p-8 shadow-sm min-h-[300px]">
    <h3 className="font-semibold text-slate-800 mb-2">Returns / Debit Notes</h3>
    <p className="text-sm text-slate-500">Vendor returns and debit notes</p>
  </div>
);

const HistoryView = () => (
  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white border border-slate-200 rounded-lg p-8 shadow-sm min-h-[300px]">
    <h3 className="font-semibold text-slate-800 mb-2">Invoice History</h3>
    <p className="text-sm text-slate-500">Complete invoice history and audit trail</p>
  </div>
);

const DraftInvoicesView = ({ drafts, onEdit, onDelete }) => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 shadow-sm min-h-[400px]">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-semibold text-slate-800">Draft Invoices</h3>
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-2 text-slate-200" />
            <p>No draft invoices found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="p-3 font-medium">Invoice No</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Vendor</th>
                  <th className="p-3 font-medium">Source</th>
                  <th className="p-3 font-medium">Ref No</th>
                  <th className="p-3 font-medium text-right">Total</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {drafts.map((item) => (
                  <tr key={item.dbId} className="hover:bg-slate-50">
                    <td onClick={() => onEdit(item)} className="p-3 font-mono font-medium text-[#F5C742] cursor-pointer hover:underline">{item.id}</td>
                    <td className="p-3 text-slate-600">{item.date}</td>
                    <td className="p-3">
                      <div>
                        <div className="font-medium text-slate-900">{item.vendor}</div>
                        <div className="text-[10px] text-slate-400">{item.vendorId}</div>
                      </div>
                    </td>
                    <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${item.sourceColor}`}>{item.source}</span></td>
                    <td className="p-3 font-mono text-slate-600">{item.refNo}</td>
                    <td className="p-3 text-right font-bold text-slate-900">{item.total.toLocaleString()} AED</td>
                    <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${item.statusColor}`}>{item.status}</span></td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => onEdit(item)} className="p-1.5 rounded hover:bg-slate-100 text-blue-500" title="Edit">
                          <SquarePenIcon className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => onDelete(item.dbId)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
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

// ==========================================
// MAIN COMPONENT
// ==========================================

const PurchaseInvoices = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeNavTab, setActiveNavTab] = useState("list");
  const [editInvoice, setEditInvoice] = useState(null);
  const [editorMode, setEditorMode] = useState("edit");
  const pendingDraftRef = useRef(null);

  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [vendorFilter, setVendorFilter] = useState("");

  // REAL STATE (No Mocks)
  const [invoices, setInvoices] = useState([]);
  const [draftInvoices, setDraftInvoices] = useState([]); // Drafts State
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);

  // Modal States
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [scheduleInvoice, setScheduleInvoice] = useState(null);

  // Filtering state
  const [activeFilter, setActiveFilter] = useState("All Invoices");
  const [searchQuery, setSearchQuery] = useState("");

  // --- DATA LOADING ---

  useEffect(() => {
    loadInvoices();
  }, []);

  // Pre-fill editor when navigated from GRN or LPO "Proceed to Invoice"
  useEffect(() => {
    const fromGrn = location.state?.fromGrn;
    const fromLpo = location.state?.fromLpo;
    const draft = fromGrn || fromLpo;
    if (draft) {
      // Store in ref so the tab-change effect applies it after the tab switch
      pendingDraftRef.current = mapInvoiceFromApi(draft);
      setEditorMode("edit");
      setActiveNavTab("editor");
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  const loadInvoices = async () => {
    try {
      const res = await getInvoices();
      const list = Array.isArray(res) ? res : (res.data || []);
      const mapped = list.map(mapInvoiceFromApi);

      setInvoices(mapped);

      // Filter Drafts
      setDraftInvoices(
        mapped.filter(i => i.status.toUpperCase() === "DRAFT")
      );

      // Backend status might be "PENDING_APPROVAL" or similar caps
      setPendingApprovals(
        mapped.filter(i => i.status.toUpperCase() === "PENDING APPROVAL" || i.status.toUpperCase() === "PENDING_APPROVAL")
      );

      setPendingPayments(
        mapped.filter(i => i.status.toUpperCase() === "POSTED" && i.payment.toUpperCase() !== "PAID")
      );
    } catch (err) {
      console.error("Failed to load invoices", err);
    }
  };

  // --- ACTIONS (API CONNECTED) ---

  const handleSaveDraft = async (payload) => {
    try {
      const res = await createDraftInvoice(payload);

      // 🔑 CAPTURE DB ID
      const createdId = res.data.id;

      // reload list
      await loadInvoices();

      setActiveNavTab("list");
      alert("Invoice saved as Draft.");

      return createdId; // important for submit flow
    } catch (err) {
      console.error(err);
      alert("Failed to save draft.");
    }
  };


  const handleSubmitApproval = async (payload) => {
    try {
      const invoiceId = await handleSaveDraft(payload);

      if (!invoiceId) {
        alert("Draft creation failed. Cannot submit.");
        return;
      }

      await submitInvoice(invoiceId);
      await loadInvoices();
      setActiveNavTab("approval");
    } catch (err) {
      console.error(err);
      alert("Failed to submit for approval.");
    }
  };



  const handleApprove = async (dbId) => {
    try {
      await approveInvoice(dbId, "accounts_user");
      await loadInvoices();
      setActiveNavTab("list");
      alert(`Invoice Approved and Posted.`);
    } catch (err) {
      console.error(err);
      alert("Failed to approve invoice.");
    }
  };

  const handleView = async (invoice) => {
    try {
      const detail = await getInvoiceById(invoice.dbId);
      setEditInvoice(mapInvoiceFromApi(detail));
    } catch (err) {
      console.error("Failed to load invoice detail", err);
      setEditInvoice(invoice);
    }

    setEditorMode("view");
    setActiveNavTab("editor");
  };

  const handlePrint = async (invoice) => {
    try {
      const loadingToast = toast.loading('Preparing print layout...');
      const templates = await getTemplatesByCategory('Purchase Invoice');
      toast.dismiss(loadingToast);

      if (!templates || templates.length === 0) {
        toast.error('No templates found for Purchase Invoice');
        return;
      }

      const defaultTemplate = templates.find(t => t.isDefault) || templates[0];

      // Map to standard print data
      const printData = {
        title: 'PURCHASE INVOICE',
        docNo: invoice.id || invoice.invoiceNumber,
        date: invoice.date,
        customer: {
          name: invoice.vendor || 'Unknown Vendor',
          address: '',
          trn: invoice.vendorTrn || ''
        },
        items: (invoice.items || []).map(i => ({
          code: i.itemCode || i.code || '-',
          name: i.itemName || i.name || '',
          desc: i.description || i.shortDescription || '',
          sku: i.sku || i.productSku || '',
          localName: i.localName || i.productLocalName || '',
          unit: i.uom || i.unit || 'PCS',
          qty: Number(i.quantity || i.qty || 0),
          price: Number(i.unitPrice || i.price || 0),
          disc: Number(i.discountPercent || i.disc || 0),
          tax: Number(i.taxAmount || i.tax || 0),
          taxAmt: Number(i.taxAmount || i.taxAmt || 0),
          total: Number(i.total || (Number(i.quantity || 0) * Number(i.unitPrice || 0)))
        })),
        totals: {
          subTotal: Number(invoice.total || 0) - Number(invoice.tax || 0),
          tax: Number(invoice.tax || 0),
          grandTotal: Number(invoice.total || 0),
          currency: 'AED'
        },
        meta: {
          status: invoice.status,
          paymentTerm: invoice.paymentTerm || '',
          notes: invoice.notes || '',
          dueDate: invoice.dueDate
        }
      };

      const html = generatePrintHtml(defaultTemplate, printData, {
        nestLogo: nestLogo,
        billBullLogo: billBullLogo
      });

      printHtml(html);
    } catch (error) {
      console.error("Error printing Invoice:", error);
      toast.error('Failed to generate print layout');
    }
  };

  const handleOpenPayment = (invoice) => {
    setPaymentInvoice(invoice);
  };

  const handleConfirmPayment = async (invoice, paymentMode, bankAccount, chequeDate) => {
    try {
      await recordPayment(invoice.dbId, invoice.outstanding, paymentMode, bankAccount, chequeDate);
      await loadInvoices();
      setPaymentInvoice(null);
      toast.success("Payment recorded successfully.");
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || err?.message || "Unknown error";
      toast.error(`Failed to record payment: ${msg}`);
    }
  };

  const handleOpenSchedule = (invoice) => {
    setScheduleInvoice(invoice);
  };

  const handleConfirmSchedule = (invoice, date) => {
    alert(`Payment for ${invoice.id} has been scheduled for ${date}.`);
    setScheduleInvoice(null);
  };

  const handleDeleteDraft = async (id) => {
    if (window.confirm("Are you sure you want to delete this draft invoice?")) {
      // API call to delete (assuming delete API exists or just local remove for now if generic API)
      // For now we'll just alert as delete logic might need specific endpoint
      alert("Delete functionality to be connected to API");
      // In real scenario: await deleteInvoice(id); await loadInvoices();
    }
  };

  const handleEditDraft = (invoice) => {
    setEditInvoice(invoice);
    setEditorMode("edit");
    setActiveNavTab("editor");
  };

  // Reset Edit State on Tab Change; apply pending draft when switching to editor
  useEffect(() => {
    if (activeNavTab === 'editor' && pendingDraftRef.current) {
      setEditInvoice(pendingDraftRef.current);
      pendingDraftRef.current = null;
    } else if (activeNavTab !== 'editor') {
      setEditInvoice(null);
      setEditorMode("edit");
    }
  }, [activeNavTab]);

  const renderContent = () => {
    switch (activeNavTab) {
      case "list":
        return <InvoiceListView
          invoices={invoices}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onView={handleView}
          onPrint={handlePrint}
          onPay={handleOpenPayment}
          onRefresh={loadInvoices}
          dateRange={dateRange}
          setDateRange={setDateRange}
          vendorFilter={vendorFilter}
          setVendorFilter={setVendorFilter}
        />;
      case "editor":
        return <CreateEditView
          onSaveDraft={handleSaveDraft}
          onSubmitApproval={handleSubmitApproval}
          onPostDirectly={async (data) => {
            // Admin shortcut logic if needed
            await handleSaveDraft(data);
          }}
          onCreatePayment={handleOpenPayment}
          onSchedulePayment={handleOpenSchedule}
          editInvoice={editInvoice} // Pass Prop
          onPrint={handlePrint}
          mode={editorMode}
          onBackToList={() => {
            setActiveNavTab("list");
            setEditInvoice(null);
            setEditorMode("edit");
          }}
        />;
      case "draft":
        return <DraftInvoicesView
          drafts={draftInvoices}
          onEdit={handleEditDraft}
          onDelete={handleDeleteDraft}
        />;
      case "approval":
        return <PendingApprovalView pendingApprovals={pendingApprovals} onApprove={handleApprove} onView={handleView} />;
      case "payment":
        return <PendingPaymentView pendingPayments={pendingPayments} onPay={handleOpenPayment} onView={handleView} />;
      case "returns":
        return <ReturnsDebitView />;
      case "history":
        return <HistoryView />;
      default:
        return <InvoiceListView
          invoices={invoices}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onView={handleView}
          onPrint={handlePrint}
          onPay={handleOpenPayment}
          onRefresh={loadInvoices}
          dateRange={dateRange}
          setDateRange={setDateRange}
          vendorFilter={vendorFilter}
          setVendorFilter={setVendorFilter}
        />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900 flex flex-col">
      {/* Modals */}
      <PaymentModal invoice={paymentInvoice} onClose={() => setPaymentInvoice(null)} onConfirm={handleConfirmPayment} />
      <SchedulePaymentModal invoice={scheduleInvoice} onClose={() => setScheduleInvoice(null)} onConfirm={handleConfirmSchedule} />

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-5 sticky top-0 z-40 shadow-sm">
        {/* Breadcrumb & Title */}
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Vendors & Purchases</span>
              <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
              <span className="font-medium text-slate-900">Purchase Invoices</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FileText className="text-[#F5C742]" size={28} /> Purchase Invoices</h1>
              <span className="bg-yellow-50 text-yellow-700 text-xs font-semibold px-2.5 py-0.5 rounded border border-yellow-200">
                {pendingApprovals.length} Pending Approval
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Convert LPO/GRN to Invoice, post inventory + accounts, and manage landed costs
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
            </button>
            <button className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap">
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={() => {
                setEditInvoice(null);
                setEditorMode("edit");
                setActiveNavTab("editor");
              }}
              className="flex-1 sm:flex-none h-8 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Invoice</span><span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        {/* Sub-Filters (Only visual for List View mostly) */}

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeNavTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === "editor") {
                    setEditInvoice(null);
                    setEditorMode("edit");
                  }
                  setActiveNavTab(tab.id);
                }}
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
            {["All Invoices", "Draft", "Pending Approval", "Posted", "Partially Paid", "Paid", "Reversed"].map((tab, idx) => (
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

      {/* Content */}
      <div className="p-4 md:p-6 space-y-4 flex-1">


        {/* Dynamic Content */}
        {renderContent()}
      </div>
    </div>
  );
};

export default PurchaseInvoices;


