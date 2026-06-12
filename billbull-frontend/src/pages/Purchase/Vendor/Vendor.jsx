import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Users, Upload, Download, Plus, Search, ChevronDown,
  Filter, Star, Clock, Eye, SquarePen, Trash2,
  DollarSign, FileText, BarChart3, CheckCircle2,
  AlertCircle, AlertTriangle, MoreVertical, Calendar,
  Printer, Mail, Save, FileCheck, Landmark,
  Globe, Phone, Briefcase, FileUp, X, Loader2, Check,
  ArrowRight, ChevronRight, CreditCard, Banknote, RefreshCw
} from 'lucide-react';
import StatementPrintPreview from '../../../components/StatementPrintPreview';
import SearchableDropdown from '../../../components/SearchableDropdown';
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import { generateSOAFilename } from '../../../utils/filenameUtils';
import CurrencyAmount from '../../../components/CurrencyAmount';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { STATEMENT_EXPORT_COLUMNS, formatStatementEntryType, mapStatementEntriesForExport } from '../../../utils/statementUtils';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { getListSerialNumber, withListSerialNumbers, withExportSerialNumbers } from '../../../utils/serialNumbering';
import { getTemplatesByCategory } from '../../../api/printTemplateApi';
import { generatePrintHtmlAsync, printHtml } from '../../../utils/printGenerator';
import {
  buildVendorSoaPrintData,
  buildPaymentVoucherPrintData,
  resolvePurchasePrintTemplate
} from '../../../utils/purchasePrintUtils';
import { buildDocumentHeaderProfile } from '../../../utils/branchPrintProfile';
import { useBranch } from '../../../context/BranchContext';
import billBullLogo from '../../../assets/billBullLogo.png';
import toast from 'react-hot-toast';

// ==========================================
// 1. MOCK DATA & CONFIGURATION
// ==========================================

const VENDOR_COLUMNS = [
  { header: 'S.No.', key: 'sNo', width: 8 },
  { header: 'Code', key: 'code', width: 10 },
  { header: 'Name', key: 'name', width: 25 },
  { header: 'Email', key: 'email', width: 20 },
  { header: 'Phone', key: 'phone', width: 15 },
  { header: 'Category', key: 'category', width: 15 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Payable', key: 'balance', width: 15 }
];

// API IMPORTS
import {
  getVendors,
  createVendor,
  createVendorDraft,
  importVendors,
  updateVendor,
  deleteVendor
} from "../../../api/vendorsApi";
import { fetchStatementOfAccount } from '../../../api/financialsApi';
import { useCompany } from '../../../context/CompanyContext';
import {
  formatCurrencyDisplay,
  getCountryOptions,
  getCurrencyOptions,
  normalizeCountryValue,
  normalizeCurrencyValue,
  resolveCurrencyDisplayCode,
  withFallbackOption
} from '../../../utils/countryCurrencyOptions';

// --- DROPDOWN OPTIONS ---
const vendorStatusOptions = ["Active", "On Hold", "Blocked"];
const vendorGroupOptions = ["Local Supplier", "International Supplier", "Service Provider"];
const vendorTypeOptions = ["Manufacturer", "Distributor", "Wholesaler", "Retailer"];
const categoryOptions = ["Food & Beverage", "Packaging", "Equipment", "Services"];
const communicationOptions = ["Email", "Phone", "WhatsApp"];
const priorityOptions = ["P1 - Critical", "P2 - High", "P3 - Normal"];
const paymentTermsOptions = ["Cash on Delivery", "Net 7 Days", "Net 15 Days", "Net 30 Days", "Net 60 Days"];
const balanceTypeOptions = ["Payable (We owe vendor)", "Receivable (Vendor owes us)"];
const paymentPrefOptions = ["Bank Transfer", "Cheque", "Cash", "Card Payment"];

// ==========================================
// REUSABLE COMPONENTS
// ==========================================

const Dropdown = ({ options, selected, onSelect, placeholder = "Select option", disabled = false, searchable = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 100);
    }
  }, [isOpen, searchable]);

  // Reset search when closed
  useEffect(() => {
    if (!isOpen) setSearchTerm("");
  }, [isOpen]);

  const filteredOptions = searchable
    ? options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full h-10 px-3 flex items-center justify-between rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={!selected ? "text-slate-500" : ""}>{selected || placeholder}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {searchable && (
            <div className="p-2 sticky top-0 bg-white border-b border-slate-100 z-10">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 focus:outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]/50"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="overflow-y-auto max-h-60">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">No results found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  onClick={() => {
                    onSelect(option);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between ${selected === option ? 'bg-[#F5C742]/10 text-slate-900 font-medium' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  {option}
                  {selected === option && <Check className="h-4 w-4 text-[#F5C742]" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const RenderStars = ({ rating }) => (
  <div className="flex text-[#F5C742]">
    {[...Array(5)].map((_, i) => (
      <Star key={i} size={14} className={`${i < Math.floor(rating) ? 'fill-[#F5C742] text-[#F5C742]' : 'text-gray-300'}`} />
    ))}
    <span className="text-xs font-medium text-gray-600 ml-2">{rating || 0}</span>
  </div>
);

// ==========================================
// TABS CONTENT
// ==========================================

// NEW IMPORTS FOR PAYMENT MODULE
import { getPostedInvoicesForPayment, getInvoices } from '../../../api/purchaseInvoiceApi';
import { createPaymentVoucher, getPaymentVouchers, updateVoucherStatus } from '../../../api/paymentApi';
import { getBankAccounts } from '../../../api/ledgerApi';

const PayInvoices = ({ vendors, initialVendor }) => {
  const { company } = useCompany();
  const { branches: availableBranches, activeBranch } = useBranch();
  const currency = resolveCurrencyDisplayCode(company || {});
  // State
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Selection State (object map like customer ledger)
  const [selectedInvoices, setSelectedInvoices] = useState({}); // Map<invoiceId, boolean>
  const [settleAmounts, setSettleAmounts] = useState({}); // Map<invoiceId, amount>

  // Payment Form State
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankAccount, setBankAccount] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentPrinting, setIsPaymentPrinting] = useState(false);
  const [lastSavedPayment, setLastSavedPayment] = useState(null);
  const [lastSavedInvoice, setLastSavedInvoice] = useState(null);

  // History State
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Pre-select vendor when navigating from vendor list Eye button
  useEffect(() => {
    if (initialVendor) {
      setSelectedVendor(initialVendor);
    }
  }, [initialVendor]);

  // Load bank accounts on mount
  useEffect(() => {
    getBankAccounts().then(data => setBankAccounts(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // Load History
  useEffect(() => {
    fetchHistory();
  }, [selectedVendor]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await getPaymentVouchers();
      const allVouchers = Array.isArray(res) ? res : (res.data || []);
      const filtered = selectedVendor
        ? allVouchers.filter(v => v.vendorId === selectedVendor.code || v.vendorName === selectedVendor.name)
        : allVouchers;
      setHistory(filtered.slice(0, 10));
    } catch (err) {
      console.error("Failed to load payment history");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load Invoices when vendor selected
  useEffect(() => {
    if (selectedVendor) {
      fetchInvoices();
    } else {
      setInvoices([]);
      setSelectedInvoices({});
      setSettleAmounts({});
    }
  }, [selectedVendor]);

  const fetchInvoices = async () => {
    if (!selectedVendor) return;
    setLoadingInvoices(true);
    try {
      const res = await getPostedInvoicesForPayment();
      const allInvoices = Array.isArray(res) ? res : (res.data || []);
      const vendorInvoices = allInvoices
        .map(inv => ({
          ...inv,
          grandTotal: Number(inv.grandTotal || 0),
          amountPaid: Number(inv.amountPaid || 0),
          balanceDue: Number(inv.balanceDue ?? inv.grandTotal ?? 0),
        }))
        .filter(inv =>
          ((inv.vendorId === selectedVendor.code) ||
            (inv.vendorName === selectedVendor.name) ||
            (inv.vendor === selectedVendor.name)) &&
          inv.status === 'POSTED' &&
          inv.balanceDue > 0
        );

      // BB-030: If vendor has an opening balance, add it as a payable line item
      const openingBal = parseFloat(selectedVendor.openingBalance || 0);
      if (openingBal > 0) {
        vendorInvoices.unshift({
          id: `OB-${selectedVendor.id || selectedVendor.code}`,
          invoiceNumber: `OB-${selectedVendor.code || selectedVendor.id}`,
          invoiceDate: new Date().toISOString(),
          dueDate: null,
          grandTotal: openingBal,
          balanceDue: openingBal,
          status: 'POSTED',
          paymentStatus: 'UNPAID',
          invoiceType: 'OPENING_BALANCE',
          vendorName: selectedVendor.name
        });
      }

      setInvoices(vendorInvoices);
    } catch (error) {
      console.error("Error fetching vendor invoices", error);
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Computed
  const totalOutstanding = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (inv.balanceDue || inv.grandTotal || 0), 0);
  }, [invoices]);

  const totalToSettle = useMemo(() => {
    return Object.keys(selectedInvoices).reduce((sum, invId) => {
      if (selectedInvoices[invId]) {
        return sum + (parseFloat(settleAmounts[invId]) || 0);
      }
      return sum;
    }, 0);
  }, [selectedInvoices, settleAmounts]);

  const nextVoucherNo = useMemo(() => {
    const year = new Date().getFullYear();
    if (history.length === 0) return `PV-${year}-0001`;
    const nums = history.map(h => parseInt(h.voucherNumber?.split('-').pop() || 0)).filter(n => !isNaN(n));
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return `PV-${year}-${String(maxNum + 1).padStart(4, '0')}`;
  }, [history]);

  const selectedCount = Object.values(selectedInvoices).filter(Boolean).length;

  // Handlers
  const handleInvoiceSelection = (inv, isSelected) => {
    const bal = inv.balanceDue || inv.grandTotal || 0;
    setSelectedInvoices(prev => ({ ...prev, [inv.id]: isSelected }));
    if (isSelected) {
      setSettleAmounts(prev => ({ ...prev, [inv.id]: bal }));
    } else {
      setSettleAmounts(prev => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
    }
  };

  const handleSelectAll = (e) => {
    const isChecked = e.target.checked;
    const newSelected = {};
    const newAmounts = {};
    if (isChecked) {
      invoices.forEach(inv => {
        const bal = inv.balanceDue || inv.grandTotal || 0;
        newSelected[inv.id] = true;
        newAmounts[inv.id] = bal;
      });
    }
    setSelectedInvoices(newSelected);
    setSettleAmounts(newAmounts);
  };

  const handleSettleAmountChange = (invId, val, maxBal) => {
    let numVal = parseFloat(val) || 0;
    if (numVal > maxBal) numVal = maxBal;
    if (numVal < 0) numVal = 0;
    setSettleAmounts(prev => ({ ...prev, [invId]: numVal }));
  };

  const handleAutoAllocate = (amount) => {
    const totalReceived = parseFloat(amount) || 0;
    setReceivedAmount(amount);

    if (totalReceived <= 0) {
      setSettleAmounts({});
      setSelectedInvoices({});
      return;
    }

    let remaining = totalReceived;
    const newSettleAmounts = {};
    const newSelectedInvoices = {};

    // Sort by Due Date ascending (closest/soonest due date first — pay most urgent first)
    const sortedInvoices = [...invoices].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;  // no due date goes last
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

    for (const inv of sortedInvoices) {
      if (remaining <= 0) break;
      const balance = inv.balanceDue || inv.grandTotal || 0;
      const allocateAmount = Math.min(remaining, balance);
      newSettleAmounts[inv.id] = allocateAmount;
      newSelectedInvoices[inv.id] = true;
      remaining -= allocateAmount;
    }

    setSettleAmounts(newSettleAmounts);
    setSelectedInvoices(newSelectedInvoices);
  };

  const handleProcessPayment = async () => {
    if (!selectedVendor) return alert("Select a vendor");
    const selectedIds = Object.keys(selectedInvoices).filter(id => selectedInvoices[id]);
    if (selectedIds.length === 0) return alert("Select at least one invoice");
    if (totalToSettle <= 0) return alert("Total payment amount must be > 0");

    setIsProcessing(true);
    try {
      let latestSavedPayment = null;
      let latestSavedInvoice = null;
      const promises = selectedIds.map(async (invId) => {
        const amount = settleAmounts[invId];
        if (!amount || amount <= 0) return;

        const invoice = invoices.find(i => i.id === invId);
        // BB-030: Opening balance entries have synthetic string IDs — don't send them as invoiceId
        const isOpeningBalance = invoice && invoice.invoiceType === 'OPENING_BALANCE';
        const payload = {
          vendor: selectedVendor.name,
          vendorId: selectedVendor.code,
          date: paymentDate,
          mode: paymentMethod,
          amount: amount,
          ref: reference,
          invoiceId: isOpeningBalance ? null : invId,
          notes: isOpeningBalance ? `Opening Balance Payment${notes ? ': ' + notes : ''}` : notes,
          chequeDate: paymentMethod === 'Cheque' ? chequeDate : null,
          bankAccount: paymentMethod !== 'Cash' ? bankAccount : null,
        };
        const saved = await createPaymentVoucher(payload);
        if (saved && saved.id) {
          await updateVoucherStatus(saved.id, 'POSTED');
        }
        latestSavedPayment = {
          ...payload,
          ...saved,
          voucherNumber: saved?.voucherNumber || payload.voucherNumber || nextVoucherNo,
          paymentDate: saved?.paymentDate || saved?.date || paymentDate,
          paymentMode: saved?.paymentMode || saved?.mode || paymentMethod,
          referenceNumber: saved?.referenceNumber || saved?.ref || reference,
          vendorName: saved?.vendorName || selectedVendor.name,
          vendorId: saved?.vendorId || selectedVendor.code,
          amount,
          status: saved?.status || 'POSTED',
          branchId: saved?.branch?.id ?? saved?.branchId ?? activeBranch?.id,
        };
        latestSavedInvoice = invoice || null;
      });

      await Promise.all(promises);
      setLastSavedPayment(latestSavedPayment);
      setLastSavedInvoice(latestSavedInvoice);

      alert("Payment processed successfully!");
      setReference('');
      setNotes('');
      setSelectedInvoices({});
      setSettleAmounts({});
      setReceivedAmount('');
      setChequeDate('');
      setBankAccount('');

      fetchInvoices();
      fetchHistory();

    } catch (err) {
      console.error("Payment failed", err);
      const msg = err?.response?.data?.message || err?.message || "Failed to process some payments.";
      alert(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
      {/* LEFT COLUMN - 2/3 width */}
      <div className="lg:col-span-2 space-y-6">

        {/* 1. Vendor Selection & Balance Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <label className="block text-sm font-bold text-slate-700 mb-2">Select Vendor <span className="text-red-500">*</span></label>
          <div className="mb-6">
            <Dropdown
              options={vendors.map(v => v.name)}
              selected={selectedVendor?.name}
              onSelect={(name) => {
                const vendor = vendors.find(v => v.name === name);
                setSelectedVendor(vendor);
                setSelectedInvoices({});
                setSettleAmounts({});
                setReceivedAmount('');
              }}
              placeholder="Search or Select Vendor..."
              searchable={true}
            />
          </div>

          {selectedVendor && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center gap-3">
              <div className="bg-blue-100 p-2.5 rounded-full text-blue-600">
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">Outstanding Balance</p>
                <p className="text-2xl font-bold text-blue-600">{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          )}
        </div>

        {/* 2. Outstanding Invoices Table */}
        {selectedVendor && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-yellow-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileText size={16} className="text-yellow-600" /> Outstanding Invoices
                </h3>
                <p className="text-xs text-slate-500">Select invoices to settle in this payment</p>
              </div>
              <button
                onClick={() => {
                  const allSelected = invoices.length > 0 && selectedCount === invoices.length;
                  handleSelectAll({ target: { checked: !allSelected } });
                }}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
              >
                {selectedCount === invoices.length && invoices.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="overflow-x-auto">
              {loadingInvoices ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <table className="bb-nowrap-table w-full text-sm text-left">
                  <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-10 text-center">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={invoices.length > 0 && selectedCount === invoices.length}
                          className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500"
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice No</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice Date</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase">Due Date</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Invoice Amount</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Outstanding</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase text-center">Status</th>
                      <th className="px-4 py-3 font-semibold text-xs uppercase text-right w-40">Amount to Settle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.length > 0 ? invoices.map(inv => {
                      const bal = inv.balanceDue || inv.grandTotal || 0;
                      const isSelected = !!selectedInvoices[inv.id];
                      const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();

                      return (
                        <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-yellow-50/50' : ''}`}>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleInvoiceSelection(inv, e.target.checked)}
                              className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">
                            {inv.invoiceType === 'OPENING_BALANCE'
                              ? <span className="text-blue-700 font-bold">Opening Balance</span>
                              : `#${inv.invoiceNumber}`}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {formatDisplayDate(inv.invoiceDate)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className={isOverdue ? "text-red-500 font-bold" : "text-slate-500"}>
                              {formatDisplayDate(inv.dueDate, 'N/A')}
                            </span>
                            {isOverdue && <span className="block text-[9px] text-red-400">Overdue</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 font-medium">
                            {currency} {(inv.grandTotal || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-orange-600">
                            {currency} {bal.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isOverdue
                              ? <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">Overdue</span>
                              : <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">Current</span>
                            }
                          </td>
                          <td className="px-4 py-2 text-right">
                            {isSelected ? (
                              <input
                                type="number"
                                value={settleAmounts[inv.id] || ''}
                                onChange={(e) => handleSettleAmountChange(inv.id, e.target.value, bal)}
                                className="w-full text-right text-xs font-bold border border-slate-300 rounded px-2 py-1.5 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
                                placeholder="0.00"
                              />
                            ) : (
                              <button
                                onClick={() => handleInvoiceSelection(inv, true)}
                                className="text-xs text-yellow-600 font-bold hover:underline"
                              >
                                Settle Full
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="8" className="px-4 py-12 text-center text-slate-400">
                          <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                          No outstanding invoices found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN - 1/3 width */}
      <div className="space-y-6">

        {/* 3. Payment Entry Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#F5C742]"></div>
          <div className="p-5">
            <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
              <DollarSign className="text-[#F5C742]" size={18} /> Payment Entry
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Payment Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none"
                />
              </div>

              {/* Payment Amount Auto-Allocate */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Payment Amount (Auto-Allocate) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">{currency}</span>
                  <input
                    type="number"
                    value={receivedAmount}
                    onChange={(e) => handleAutoAllocate(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-3 py-2 text-sm font-bold border border-slate-200 rounded focus:border-[#F5C742] outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Entering amount automatically selects oldest invoices.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Payment No.</label>
                  <input
                    type="text"
                    value={nextVoucherNo}
                    readOnly
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => { setPaymentMethod(e.target.value); setBankAccount(''); }}
                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white"
                  >
                    <option>Cash</option>
                    <option>Bank Transfer</option>
                    <option>Cheque</option>
                    <option>Card</option>
                  </select>
                </div>
              </div>

              {paymentMethod !== 'Cash' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Bank Account <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      className="w-full pl-8 text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white"
                    >
                      <option value="">Select Bank Account...</option>
                      {bankAccounts.map(acc => (
                        <option key={acc.id} value={acc.code || acc.name}>{acc.code} — {acc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {paymentMethod === 'Cheque' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Cheque Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Reference / Cheque No.</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. TXN-123456"
                  className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter payment notes..."
                  className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none resize-none"
                ></textarea>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-slate-600">Total Settlement</span>
                  <span className="text-xl font-bold text-[#F5C742]">{currency} {totalToSettle.toLocaleString()}</span>
                </div>

                <button
                  onClick={handleProcessPayment}
                  disabled={isProcessing || !selectedVendor || totalToSettle <= 0}
                  className={`w-full bg-[#F5C742] text-slate-900 font-bold py-3 rounded-md hover:bg-yellow-400 transition-colors shadow-sm flex items-center justify-center gap-2 ${isProcessing || totalToSettle <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                  {isProcessing ? 'Processing...' : 'Process Payment'}
                </button>

                <button
                  onClick={() => handlePrintPaymentVoucher()}
                  disabled={!lastSavedPayment || isPaymentPrinting}
                  className={`w-full mt-3 bg-white border border-slate-200 text-slate-600 font-bold py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-xs ${!lastSavedPayment || isPaymentPrinting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isPaymentPrinting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Printer size={14} />}
                  {isPaymentPrinting ? 'Preparing...' : 'Print Payment Voucher'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Recent Payments Card List */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recent Payments</h3>
            <button onClick={fetchHistory} className="p-1 hover:bg-slate-200 rounded">
              <RefreshCw className="h-3 w-3 text-slate-400" />
            </button>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {loadingHistory ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : history.length > 0 ? (
              history.map((payment, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-yellow-100 transition-colors">
                  <div className="mt-0.5 min-w-[24px]">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <CheckCircle2 size={12} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-slate-800 text-xs truncate">{payment.vendorName || 'Unknown'}</p>
                      <span className="text-xs font-bold text-emerald-600 px-1.5 py-0.5 bg-emerald-50 rounded">{currency} {(payment.amount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-[10px] text-slate-500">{payment.voucherNumber || `PV-${payment.id}`} • {payment.paymentMode}</p>
                      <p className="text-[10px] text-slate-400">{formatDisplayDate(payment.paymentDate, '')}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-400">
                <FileText size={24} className="mx-auto mb-1 opacity-20" />
                <p className="text-[10px]">No recent transactions</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

const VendorSoA = ({ vendors }) => {
  const { company } = useCompany();
  const { branches: availableBranches, activeBranch } = useBranch();
  const currency = resolveCurrencyDisplayCode(company || {});
  const defaultStartDate = `${new Date().getFullYear()}-01-01`;
  const defaultEndDate = new Date().toISOString().split('T')[0];

  const [selectedVendorName, setSelectedVendorName] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [statementData, setStatementData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (vendors.length > 0 && !selectedVendorName) {
      setSelectedVendorName(vendors[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  const handleGenerateStatement = async () => {
    if (!selectedVendorName || !startDate || !endDate) return;
    setIsLoading(true);
    try {
      const data = await fetchStatementOfAccount('VENDOR', selectedVendorName, startDate, endDate);
      setStatementData(data);
    } catch (error) {
      console.error("Failed to load SoA", error);
      setStatementData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Only auto-fetch when selectedVendorName changes, wait for manual click for dates
  useEffect(() => {
    if (selectedVendorName) {
      handleGenerateStatement();
    }
  }, [selectedVendorName]);

  const selectedVendorDetails = vendors.find(v => v.name === selectedVendorName);

  const handlePrint = async () => {
    if (!selectedVendorName || !startDate || !endDate) {
      toast.error('Select a vendor and statement period first.');
      return;
    }

    const loadingToast = toast.loading('Preparing Vendor SOA print layout...');
    setIsPrinting(true);

    try {
      const [freshStatement, templates] = await Promise.all([
        fetchStatementOfAccount('VENDOR', selectedVendorName, startDate, endDate),
        getTemplatesByCategory('Vendor Statement of Account').catch(() => [])
      ]);
      setStatementData(freshStatement);

      const defaultTemplate = resolvePurchasePrintTemplate('Vendor Statement of Account', templates);
      const printData = buildVendorSoaPrintData(
        freshStatement,
        selectedVendorDetails || { name: selectedVendorName },
        company,
        { startDate, endDate }
      );
      const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
        companyProfile: company,
        billBullLogo,
      });

      printHtml(html);
    } catch (error) {
      console.error('Failed to print Vendor SOA', error);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to generate Vendor SOA print layout');
    } finally {
      toast.dismiss(loadingToast);
      setIsPrinting(false);
    }
  };

  const handlePrintPaymentVoucher = async (payment = lastSavedPayment, linkedInvoice = lastSavedInvoice) => {
    if (!payment) {
      toast.error("Please process a payment first, then print the voucher.");
      return;
    }

    const loadingToast = toast.loading('Preparing payment voucher print layout...');
    setIsPaymentPrinting(true);

    try {
      const templates = await getTemplatesByCategory('Payment Voucher').catch(() => []);
      const defaultTemplate = resolvePurchasePrintTemplate('Payment Voucher', templates);
      const voucherForPrint = {
        ...payment,
        voucherNumber: payment.voucherNumber || payment.paymentNumber || payment.id || nextVoucherNo,
        paymentDate: payment.paymentDate || payment.date || paymentDate,
        paymentMode: payment.paymentMode || payment.mode || paymentMethod,
        referenceNumber: payment.referenceNumber || payment.ref || reference,
        vendorName: payment.vendorName || selectedVendor?.name,
        vendorId: payment.vendorId || selectedVendor?.code,
        bankAccount: payment.bankAccount || bankAccount,
        chequeDate: payment.chequeDate || chequeDate,
      };
      const printData = buildPaymentVoucherPrintData(
        voucherForPrint,
        selectedVendor || { name: voucherForPrint.vendorName, code: voucherForPrint.vendorId },
        company,
        linkedInvoice
      );
      const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
        companyProfile: company,
        billBullLogo,
      });

      printHtml(html);
    } catch (error) {
      console.error('Failed to print payment voucher', error);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to generate payment voucher print layout');
    } finally {
      toast.dismiss(loadingToast);
      setIsPaymentPrinting(false);
    }
  };

  const handleExportExcel = () => {
    if (!statementData) return;
    const filename = generateSOAFilename(
      selectedVendorDetails?.name || selectedVendorName,
      selectedVendorDetails?.code || 'N/A',
      startDate,
      endDate,
      currency
    );

    exportToExcel(mapStatementEntriesForExport(statementData), STATEMENT_EXPORT_COLUMNS, filename);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm print:hidden">
        <h3 className="text-sm font-semibold text-[#F5C742] flex items-center gap-2 mb-4 uppercase tracking-wide">
          <FileText className="h-4 w-4" /> Generate Statement of Account
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Select Vendor *</label>
            <SearchableDropdown
              options={vendors.map(v => ({
                value: v.name,
                label: `${v.code} - ${v.name}`,
                subtitle: v.phone || v.mobile || 'No Phone'
              }))}
              value={selectedVendorName}
              onChange={(val) => setSelectedVendorName(val)}
              placeholder="Search by Name, Code or Phone..."
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleGenerateStatement} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-md shadow-sm flex items-center gap-2">
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate Statement
          </button>
          <button onClick={handlePrint} disabled={isPrinting || isLoading || !selectedVendorName} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-md shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isPrinting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
          </button>
          <button onClick={handleExportExcel} disabled={!statementData} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-md shadow-sm flex items-center gap-2 disabled:opacity-50">
            <Download className="h-4 w-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* STATEMENT UI */}
      {statementData && selectedVendorDetails && (
        <div className="overflow-x-auto print:hidden">
        <div className="bg-white rounded-lg border border-slate-200 p-8 shadow-sm min-w-[640px]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">STATEMENT OF ACCOUNT</h2>
              <p className="text-[#F5C742] font-semibold">{selectedVendorDetails.name}</p>
              <div className="mt-2 text-xs text-slate-500">
                <p>Vendor Code: {selectedVendorDetails.code}</p>
                <p>Email: {selectedVendorDetails.email || '-'}</p>
                <p>Phone: {selectedVendorDetails.contact || '-'}</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Statement Period</p>
              <p className="font-semibold text-slate-800">{startDate} to {endDate}</p>
              <p className="mt-1">Generated On</p>
              <p className="font-semibold text-slate-800">{formatDisplayDate(new Date())}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-600">Opening Balance</p>
              <p className="text-lg font-bold text-blue-700">{statementData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency} {statementData.openingBalance >= 0 ? "Cr (We Owe)" : "Dr"}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
              <p className="text-xs text-orange-600">Total Purchases</p>
              <p className="text-lg font-bold text-orange-700">{statementData.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs text-green-600">Total Payments</p>
              <p className="text-lg font-bold text-green-700">{statementData.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
              <p className="text-xs text-purple-600">Closing Balance</p>
              <p className="text-lg font-bold text-purple-700">{Math.abs(statementData.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency} {statementData.closingBalance >= 0 ? "Cr (We Owe)" : "Dr (Advance)"}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="bb-nowrap-table w-full text-xs">
              <thead className="bg-gray-50 border-y border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">DATE</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">TYPE</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">DOCUMENT NO.</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">DESCRIPTION</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">REFERENCE</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">DEBIT (PAYMENT)</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">CREDIT (INVOICE)</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">BALANCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan="8" className="p-8 text-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading Statement...</td></tr>
                ) : statementData.entries && statementData.entries.length > 0 ? (
                  statementData.entries.map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-slate-600">{row.transactionDate}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${row.type === 'OPENING' || row.type === 'OPENING_BALANCE' ? 'bg-gray-100 text-gray-600' :
                          row.type === 'INVOICE' ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>{formatStatementEntryType(row.type)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.documentNo || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.description || formatStatementEntryType(row.type)}</td>
                      <td className="px-4 py-3 text-slate-500">{row.reference || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-orange-600">{row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{Math.abs(row.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.runningBalance >= 0 ? 'Cr' : 'Dr'}</td>
                    </tr>
                  ))) : (
                  <tr><td colSpan="8" className="p-8 text-center text-slate-500">No transactions recorded in this period.</td></tr>
                )}
                <tr className="bg-gray-50 font-bold border-t border-slate-200">
                  <td colSpan="5" className="px-4 py-3 text-right text-slate-700">CLOSING TOTALS:</td>
                  <td className="px-4 py-3 text-right text-green-600">{statementData?.totalDebit?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{statementData?.totalCredit?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-purple-700">{statementData?.closingBalance ? Math.abs(statementData.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'} {statementData?.closingBalance >= 0 ? 'Cr' : 'Dr'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-8 text-center text-xs text-slate-400">
            <p>This is a computer-generated statement and does not require a signature.</p>
          </div>
        </div>
        </div>
      )}

      <StatementPrintPreview
        statementData={statementData}
        party={selectedVendorDetails}
        partyLabel="Vendor"
        statementLabel="Statement of Account"
        startDate={startDate}
        endDate={endDate}
        debitSummaryLabel="Total Payments"
        creditSummaryLabel="Total Purchases"
        debitColumnLabel="Debit (Payment)"
        creditColumnLabel="Credit (Invoice)"
        positiveBalanceLabel="Cr"
        negativeBalanceLabel="Dr"
        emptyMessage="No transactions recorded in this period."
      />
    </div>
  );
};

// ==========================================
// 5. CREATE VENDOR WIZARD (STRICT 6 STEPS)
// ==========================================

const CreateVendorWizard = ({ onBack, onSave, initialData }) => {
  const { company } = useCompany();
  const { defaultBranchName, branches: availableBranches } = useBranch();
  const defaultCurrency = normalizeCurrencyValue(company?.currency || 'AED');
  // Strict 6 steps
  const steps = [
    { id: "General", name: "General", icon: Globe },
    { id: "Contact", name: "Contact", icon: Phone },
    { id: "Financial", name: "Financial", icon: DollarSign },
    { id: "Opening Balance", name: "Opening Balance", icon: Briefcase },
    { id: "Documents", name: "Documents", icon: FileCheck },
    { id: "Bank", name: "Bank", icon: Landmark },
  ];

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const normalizeVendorFormData = (data = {}) => ({
    ...data,
    country: normalizeCountryValue(data.country || ''),
    currency: normalizeCurrencyValue(data.currency || ''),
    allocatedBranches: data.allocatedBranches || []
  });
  const createInitialVendorFormState = () => normalizeVendorFormData({
    name: '',
    email: '',
    contact: '',
    status: 'Active',
    vendorGroup: '',
    vendorType: '',
    category: '',
    country: 'United Arab Emirates',
    prefComm: 'Email',
    priority: 'P2 - High',
    currency: defaultCurrency,
    payTerms: '',
    balType: 'Payable (We owe vendor)',
    payPref: 'Bank Transfer',
    branch: defaultBranchName || '',
    allocatedBranches: defaultBranchName ? [defaultBranchName] : [],
    ...(initialData || {})
  });
  const [formData, setFormData] = useState(createInitialVendorFormState);
  const countryOptions = useMemo(() => withFallbackOption(
    getCountryOptions(),
    normalizeCountryValue(formData.country)
  ), [formData.country]);
  const currencyOptions = useMemo(() => withFallbackOption(
    getCurrencyOptions(),
    normalizeCurrencyValue(formData.currency),
    (value) => ({ value, label: value, displayLabel: value })
  ), [formData.currency]);

  // Files State
  const [documents, setDocuments] = useState([]);
  const [legacyFile, setLegacyFile] = useState(null);

  const fileInputRef = useRef(null);
  const legacyInputRef = useRef(null);

  const activeStep = steps[currentStepIndex];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // PDF Upload Logic
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      const newDoc = {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        date: new Date().toISOString().split('T')[0],
        status: "Valid",
        url: URL.createObjectURL(file)
      };
      setDocuments([newDoc, ...documents]);
    } else {
      alert("Please upload PDF files only.");
    }
  };

  const handleLegacyUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLegacyFile({
        name: file.name,
        url: URL.createObjectURL(file)
      });
    }
  };

  // FIX: executeSave now passes formData and draft status to parent onSave handler
  const executeSave = async (isDraft) => {
    setLoading(true);
    try {
      await onSave(normalizeVendorFormData(formData), isDraft);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    // Basic validation simulation for Step 1
    if (currentStepIndex === 0) {
      if (!formData.name) {
        alert("Please enter Vendor Name to proceed.");
        return;
      }
      if (!formData.branch) {
        alert("Please select a Default Branch to proceed.");
        return;
      }
    }
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F7F7FA]">
      {/* Wizard Header */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between sticky top-0 z-10 gap-4 md:gap-0">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button onClick={onBack} className="p-2 rounded-md hover:bg-slate-100 text-slate-500 border border-slate-200 text-sm font-medium flex items-center gap-2">
            <X className="h-4 w-4" /> Back to List
          </button>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Users className="h-5 w-5 text-[#F5C742]" /> {initialData ? "Edit Vendor" : "Create New Vendor"}
          </h2>
        </div>
        <div className="flex gap-2">
          {/* Save Draft Always Visible */}
          <button
            onClick={() => executeSave(true)}
            disabled={loading}
            className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>

          {/* Save Vendor only on Last Step (Bank) */}
          {activeStep.id === "Bank" ? (
            <button
              onClick={() => executeSave(false)}
              disabled={loading}
              className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-md text-sm font-bold text-slate-900 flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Vendor
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-md text-sm font-bold text-slate-900 flex items-center gap-2 shadow-sm"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sequential Tabs */}
      <div className="bg-white px-6 border-b border-slate-200 shadow-sm overflow-x-auto">
        <div className="flex space-x-8">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                ${index === currentStepIndex
                  ? "border-[#F5C742] text-[#F5C742]"
                  : index < currentStepIndex
                    ? "border-green-500 text-green-600"
                    : "border-transparent text-gray-400"
                }`}
            >
              {index < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
              {step.name}
            </div>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* 1. GENERAL */}
          {activeStep.id === "General" && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">General Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Vendor Code *</label><input type="text" value={initialData ? initialData.code : "Auto-generated"} disabled className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-500" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Vendor Status</label><div className="relative"><Dropdown options={vendorStatusOptions} selected={formData.status} onSelect={(val) => handleInputChange('status', val)} /></div></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Vendor Name *</label><input type="text" onChange={(e) => handleInputChange('name', e.target.value)} value={formData.name} placeholder="Enter vendor legal name" className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Vendor Group</label><div className="relative"><Dropdown options={vendorGroupOptions} selected={formData.vendorGroup} onSelect={(val) => handleInputChange('vendorGroup', val)} placeholder="Select group" /></div></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Vendor Nickname</label><input type="text" placeholder="Short name for internal use" value={formData.nickname || ''} onChange={(e) => handleInputChange('nickname', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Vendor Type</label><div className="relative"><Dropdown options={vendorTypeOptions} selected={formData.vendorType} onSelect={(val) => handleInputChange('vendorType', val)} placeholder="Select type" /></div></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Category *</label><div className="relative"><Dropdown options={categoryOptions} selected={formData.category} onSelect={(val) => handleInputChange('category', val)} placeholder="Select category" /></div></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">TRN / Tax ID</label><input type="text" placeholder="Enter tax registration number" value={formData.taxId || ''} onChange={(e) => handleInputChange('taxId', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Country *</label>
                  <SearchableDropdown
                    options={countryOptions}
                    value={formData.country}
                    onChange={(value) => handleInputChange('country', value)}
                    placeholder="Search country"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Primary Email</label><input type="email" onChange={(e) => handleInputChange('email', e.target.value)} value={formData.email} placeholder="vendor@example.com" className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Primary Contact Number</label><input type="text" onChange={(e) => handleInputChange('contact', e.target.value)} value={formData.contact} placeholder="+971-50-XXX-XXXX" className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Website</label><input type="text" placeholder="https://www.example.com" value={formData.website || ''} onChange={(e) => handleInputChange('website', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="col-span-1 md:col-span-2 space-y-1.5"><label className="text-xs font-semibold text-slate-700">Address</label><textarea rows={3} placeholder="Enter full address..." value={formData.address || ''} onChange={(e) => handleInputChange('address', e.target.value)} className="w-full p-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none resize-none"></textarea></div>
                <div className="col-span-1 md:col-span-2 flex items-center gap-2 mt-2"><input type="checkbox" checked={formData.isPreferred || false} onChange={(e) => handleInputChange('isPreferred', e.target.checked)} className="w-4 h-4 text-[#F5C742] border-gray-300 rounded focus:ring-[#F5C742]" /><span className="text-sm text-slate-700">Mark as Preferred Supplier</span></div>

                {/* Branch Allocation Section */}
                <div className="col-span-1 md:col-span-2 mt-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 mb-4">Branch Allocation</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">Default Branch *</label>
                          <div className="relative">
                              <select 
                                  value={formData.branch || ''} 
                                  onChange={(e) => {
                                      const selectedBranch = e.target.value;
                                      handleInputChange('branch', selectedBranch);
                                      if (selectedBranch && !formData.allocatedBranches?.includes(selectedBranch)) {
                                          handleInputChange('allocatedBranches', [...(formData.allocatedBranches || []), selectedBranch]);
                                      }
                                  }} 
                                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-700 appearance-none focus:outline-none focus:border-[#F5C742]"
                              >
                                  {availableBranches?.map(b => (
                                      <option key={b.id} value={b.name}>
                                          {b.name === defaultBranchName ? `${b.name} - Default` : b.name}
                                      </option>
                                  ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                      </div>
                      
                      <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">Allocate to Branches</label>
                          <div className="flex flex-col gap-2 max-h-32 overflow-y-auto border border-slate-200 rounded-md p-3 bg-slate-50 custom-scrollbar">
                              {availableBranches?.map(b => {
                                  const isSelectedBranch = formData.branch === b.name;
                                  const isSystemDefault = b.name === defaultBranchName;
                                  return (
                                  <label key={b.id} className={`flex items-center gap-2 ${isSelectedBranch ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                      <input 
                                          type="checkbox" 
                                          disabled={isSelectedBranch}
                                          checked={isSelectedBranch || formData.allocatedBranches?.includes(b.name) || false}
                                          onChange={(e) => {
                                              if (isSelectedBranch) return;
                                              const checked = e.target.checked;
                                              const currentAllocated = formData.allocatedBranches || [];
                                              handleInputChange(
                                                  'allocatedBranches', 
                                                  checked ? [...currentAllocated, b.name] : currentAllocated.filter(name => name !== b.name)
                                              );
                                          }}
                                          className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742] border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed" 
                                      />
                                      <span className={`text-sm ${isSelectedBranch ? 'text-slate-500 font-medium' : 'text-slate-700'}`}>
                                          {b.name} {isSystemDefault && <span className="text-[10px] text-slate-400 ml-1">(Default)</span>}
                                      </span>
                                  </label>
                              )})}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">Select branches this vendor can interact with. Uncheck to restrict.</p>
                      </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. CONTACT */}
          {activeStep.id === "Contact" && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-bold text-slate-800 mb-6">Contact Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Primary Phone</label><input type="text" placeholder="+971-50-XXX-XXXX" value={formData.primaryPhone || ''} onChange={(e) => handleInputChange('primaryPhone', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Secondary Phone</label><input type="text" placeholder="+971-50-XXX-XXXX" value={formData.secondaryPhone || ''} onChange={(e) => handleInputChange('secondaryPhone', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Mobile</label><input type="text" placeholder="+971-50-XXX-XXXX" value={formData.mobile || ''} onChange={(e) => handleInputChange('mobile', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">WhatsApp</label><input type="text" placeholder="+971-50-XXX-XXXX" value={formData.whatsapp || ''} onChange={(e) => handleInputChange('whatsapp', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Primary Email</label><input type="text" placeholder="primary@vendor.com" className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Secondary Email</label><input type="text" placeholder="secondary@vendor.com" value={formData.secondaryEmail || ''} onChange={(e) => handleInputChange('secondaryEmail', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Preferred Communication</label><div className="relative"><Dropdown options={communicationOptions} selected={formData.prefComm} onSelect={(val) => handleInputChange('prefComm', val)} /></div></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Contact Priority</label><div className="relative"><Dropdown options={priorityOptions} selected={formData.priority} onSelect={(val) => handleInputChange('priority', val)} /></div></div>
                <div className="col-span-1 md:col-span-2 space-y-1.5"><label className="text-xs font-semibold text-slate-700">Communication Notes</label><textarea rows={3} placeholder="Notes about vendor's communication behavior..." value={formData.commNotes || ''} onChange={(e) => handleInputChange('commNotes', e.target.value)} className="w-full p-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none resize-none"></textarea></div>
              </div>
            </div>
          )}

          {/* 3. FINANCIAL */}
          {activeStep.id === "Financial" && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-bold text-slate-800 mb-6">Financial & Credit Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Currency</label>
                  <SearchableDropdown
                    options={currencyOptions}
                    value={formData.currency}
                    onChange={(value) => handleInputChange('currency', value)}
                    placeholder="Search currency"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Credit Limit</label><input type="number" placeholder="0.00" value={formData.creditLimit || ''} onChange={(e) => handleInputChange('creditLimit', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Payment Terms</label><div className="relative"><Dropdown options={paymentTermsOptions} selected={formData.payTerms} onSelect={(val) => handleInputChange('payTerms', val)} placeholder="Select terms" /></div></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Credit Days</label><input type="number" placeholder="30" value={formData.creditDays || ''} onChange={(e) => handleInputChange('creditDays', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-3">Payment Discount Matrix</h4>
              <div className="bg-green-50 border border-green-100 rounded-md p-4 flex justify-between items-center text-sm text-green-800 mb-8">
                <div>0-7 days: <span className="font-bold">2% discount</span></div>
                <div>8-15 days: <span className="font-bold">1% discount</span></div>
                <div>&gt;15 days: <span className="font-bold">0% discount</span></div>
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-3">Credit Control Settings</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2"><input type="checkbox" checked={formData.autoBlockPo || false} onChange={(e) => handleInputChange('autoBlockPo', e.target.checked)} className="w-4 h-4 text-[#F5C742] border-gray-300 rounded focus:ring-[#F5C742]" /><span className="text-sm text-slate-700">Auto-block PO creation if payment overdue &gt; 30 days</span></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={formData.requireFinanceApproval || false} onChange={(e) => handleInputChange('requireFinanceApproval', e.target.checked)} className="w-4 h-4 text-[#F5C742] border-gray-300 rounded focus:ring-[#F5C742]" /><span className="text-sm text-slate-700">Require finance approval for credit limit increase</span></div>
              </div>
            </div>
          )}

          {/* 4. OPENING BALANCE */}
          {activeStep.id === "Opening Balance" && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-bold text-slate-800 mb-6">Opening Balances</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Opening Balance Date</label><input type="date" value={formData.openingBalanceDate || ''} onChange={(e) => handleInputChange('openingBalanceDate', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none text-slate-500" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Opening Balance Amount</label><input type="number" placeholder="0.00" value={formData.openingBalance || ''} onChange={(e) => handleInputChange('openingBalance', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="col-span-1 md:col-span-2 space-y-1.5"><label className="text-xs font-semibold text-slate-700">Balance Type</label><div className="relative"><Dropdown options={balanceTypeOptions} selected={formData.balType} onSelect={(val) => handleInputChange('balType', val)} /></div></div>
                <div className="col-span-1 md:col-span-2 space-y-1.5"><label className="text-xs font-semibold text-slate-700">Notes</label><textarea rows={3} placeholder="Notes about opening balance..." value={formData.openingBalanceNotes || ''} onChange={(e) => handleInputChange('openingBalanceNotes', e.target.value)} className="w-full p-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none resize-none"></textarea></div>
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-3">Legacy Data Import</h4>
              <div className="bg-blue-50 border border-blue-100 rounded-md p-6">
                <div className="flex flex-col items-start gap-3">
                  <div className="flex items-center gap-2 text-blue-700 font-medium"><FileUp className="h-5 w-5" /> Import from Previous System</div>
                  <p className="text-sm text-blue-600">Upload outstanding GRN aging, unmatched invoices, and adjustment reconciliation</p>
                  <input type="file" ref={legacyInputRef} className="hidden" onChange={handleLegacyUpload} />
                  <button onClick={() => legacyInputRef.current.click()} className="px-4 py-2 bg-white border border-blue-200 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-50 transition-colors shadow-sm">Choose File</button>
                  {legacyFile && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-700 font-medium">{legacyFile.name}</span>
                      <button onClick={() => window.open(legacyFile.url, '_blank')} className="text-xs text-blue-600 underline">View</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. DOCUMENTS */}
          {activeStep.id === "Documents" && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-bold text-slate-800">Documents & Certificates</h3>
                <div>
                  <input
                    type="file"
                    id="docUpload"
                    accept="application/pdf"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-medium rounded-md shadow-sm flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" /> Upload Document
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {documents.map((doc, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-red-50 rounded-lg flex items-center justify-center"><FileText className="h-6 w-6 text-red-500" /></div>
                      <div><p className="text-sm font-bold text-slate-800">{doc.name}</p><p className="text-xs text-slate-500">PDF • {doc.size}</p></div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        {doc.date && <><p className="text-xs text-slate-500">Expiry</p><p className={`text-sm font-medium ${doc.status === 'Expiring Soon' ? 'text-orange-600' : 'text-slate-700'}`}>{formatDisplayDate(doc.date)}</p></>}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${doc.status === 'Valid' ? 'bg-green-100 text-green-700' :
                        doc.status === 'Expiring Soon' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                        {doc.status === 'Expiring Soon' ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />} {doc.status}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => window.open(doc.url, '_blank')}
                          className="p-2 border rounded hover:bg-slate-100"
                          title="View Document"
                        >
                          <Eye className="h-4 w-4 text-slate-500" />
                        </button>
                        <button className="p-2 border rounded hover:bg-slate-100"><Download className="h-4 w-4 text-slate-500" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. BANK */}
          {activeStep.id === "Bank" && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-base font-bold text-slate-800 mb-6">Bank & Payment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Bank Name</label><input type="text" placeholder="Enter bank name" value={formData.bankName || ''} onChange={(e) => handleInputChange('bankName', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Branch</label><input type="text" placeholder="Enter branch name" value={formData.bankBranch || ''} onChange={(e) => handleInputChange('bankBranch', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Account Number</label><input type="text" placeholder="Enter account number" value={formData.accountNumber || ''} onChange={(e) => handleInputChange('accountNumber', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">IBAN</label><input type="text" placeholder="AE07XXXXXXXXXXXXXXXXXXX" value={formData.iban || ''} onChange={(e) => handleInputChange('iban', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /><p className="text-xs text-green-600 flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> IBAN validated</p></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">SWIFT Code</label><input type="text" placeholder="Enter SWIFT/BIC code" value={formData.swiftCode || ''} onChange={(e) => handleInputChange('swiftCode', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Beneficiary Name</label><input type="text" placeholder="As per bank account" value={formData.beneficiaryName || ''} onChange={(e) => handleInputChange('beneficiaryName', e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-700">Payment Preference</label><div className="relative"><Dropdown options={paymentPrefOptions} selected={formData.payPref} onSelect={(val) => handleInputChange('payPref', val)} /></div></div>
              </div>
              <div className="border-t border-slate-100 pt-6">
                <h4 className="text-sm font-bold text-slate-800 mb-4">Alternative Payment Accounts</h4>
                <button className="px-4 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Plus className="h-4 w-4" /> Add Alternative Account</button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-slate-200 p-4 px-6 flex justify-between items-center">
        <button
          onClick={handlePrev}
          disabled={currentStepIndex === 0}
          className={`px-4 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Back
        </button>

        {/* Conditionally render Next or Save button based on step */}
        {activeStep.id === "Bank" ? (
          <button
            onClick={() => executeSave(false)}
            disabled={loading}
            className="px-6 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-md text-sm font-bold text-slate-900 flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save Vendor
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-md text-sm font-bold text-slate-900 flex items-center gap-2 shadow-sm"
          >
            Next Step <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

    </div>
  );
};

// ==========================================
// 6. CREDITORS SUMMARY VIEW
// ==========================================

const CreditorsSummaryView = ({ vendors = [] }) => {
    const { company } = useCompany();
    const currency = company?.currency || 'AED';
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    
    // Data States
    const [agingData, setAgingData] = useState([]);
    const [summary, setSummary] = useState({
        total: 0,
        current: 0,
        thirtySixty: 0,
        sixtyNinety: 0,
        ninetyPlus: 0
    });

    // Invoices states
    const [invoicesData, setInvoicesData] = useState([]);

    useEffect(() => {
        if (vendors.length > 0 && !hasLoaded) {
            loadData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendors]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const invoices = await getInvoices();
            setInvoicesData(invoices);
            const today = new Date();

            let total = 0, current = 0, thirtySixty = 0, sixtyNinety = 0, ninetyPlus = 0;

            const agedVendors = vendors.map(ven => {
                const venInvoices = invoices.filter(inv => 
                    (inv.vendorId === ven.id || inv.vendorName === ven.name || inv.vendor === ven.name || inv.vendorCode === ven.code) && 
                    inv.paymentStatus !== 'Paid' && 
                    Number(inv.balance || inv.amountDue || 0) > 0
                );
                
                let vTotal = 0, vCurr = 0, v30 = 0, v60 = 0, v90 = 0;
                
                const processedInvoices = venInvoices.map(inv => {
                    const invDate = new Date(inv.dueDate || inv.invoiceDate);
                    const diffTime = Math.abs(today - invDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const isPast = invDate < today;
                    
                    const amt = Number(inv.balance || inv.amountDue || 0);
                    vTotal += amt;
                    
                    if (!isPast || diffDays <= 30) {
                        vCurr += amt;
                    } else if (diffDays <= 60) {
                        v30 += amt;
                    } else if (diffDays <= 90) {
                        v60 += amt;
                    } else {
                        v90 += amt;
                    }
                    
                    return { ...inv, ageDays: isPast ? diffDays : 0, outstandingAmount: amt };
                });

                if (ven.balance > 0 && processedInvoices.length === 0) {
                    const amt = Number(ven.balance);
                    vTotal += amt; v90 += amt; // opening balances usually go to oldest
                }

                total += vTotal; current += vCurr; thirtySixty += v30; sixtyNinety += v60; ninetyPlus += v90;

                return {
                    name: ven.name,
                    code: ven.code,
                    status: ven.status || 'Active',
                    current: vCurr,
                    thirtySixty: v30,
                    sixtyNinety: v60,
                    ninetyPlus: v90,
                    totalOutstanding: vTotal
                };
            }).filter(v => v.totalOutstanding > 0).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

            setAgingData(agedVendors);
            setSummary({ total, current, thirtySixty, sixtyNinety, ninetyPlus });
            setHasLoaded(true);
        } catch (error) {
            console.error("Error loading creditors aging data", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-lg border-t-2 border-t-blue-500 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex flex-col justify-center border-l border-r border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Total Outstanding</div>
                    <div className="text-2xl font-medium text-slate-800">
                        <CurrencyAmount value={summary.total} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-5 rounded-lg border-t-2 border-t-emerald-500 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] flex flex-col justify-center border-l border-r border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Current (0-30)</div>
                    <div className="text-2xl font-medium text-slate-800">
                        <CurrencyAmount value={summary.current} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-5 rounded-lg border-t-2 border-t-yellow-400 shadow-[0_2px_10px_-3px_rgba(250,204,21,0.1)] flex flex-col justify-center border-l border-r border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">31-60 Days</div>
                    <div className="text-2xl font-medium text-slate-800">
                        <CurrencyAmount value={summary.thirtySixty} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-5 rounded-lg border-t-2 border-t-orange-400 shadow-[0_2px_10px_-3px_rgba(251,146,60,0.1)] flex flex-col justify-center border-l border-r border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">61-90 Days</div>
                    <div className="text-2xl font-medium text-slate-800">
                        <CurrencyAmount value={summary.sixtyNinety} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-5 rounded-lg border-t-2 border-t-red-500 shadow-[0_2px_10px_-3px_rgba(239,68,68,0.1)] flex flex-col justify-center border-l border-r border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Over 90 Days</div>
                    <div className="text-2xl font-medium text-slate-800">
                        <CurrencyAmount value={summary.ninetyPlus} currency={currency} />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">Creditors Aging Analysis</h3>
                    <p className="text-xs text-slate-500 mt-1">Outstanding payables breakdown by aging period</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-slate-400 border-b border-slate-200 uppercase text-[10px]">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-left">Vendor</th>
                                <th className="px-6 py-4 font-semibold text-center">Total Outstanding</th>
                                <th className="px-6 py-4 font-semibold text-center">Current</th>
                                <th className="px-6 py-4 font-semibold text-center">31-60 Days</th>
                                <th className="px-6 py-4 font-semibold text-center">61-90 Days</th>
                                <th className="px-6 py-4 font-semibold text-center">Over 90 Days</th>
                                <th className="px-6 py-4 font-semibold text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">Loading aging data...</td>
                                </tr>
                            ) : agingData.length > 0 ? (
                                <>
                                    {agingData.map((ven, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-slate-800">{ven.name}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">{ven.code}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-bold text-slate-800">
                                                <CurrencyAmount value={ven.totalOutstanding} currency={currency} />
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-500 font-medium">
                                                <CurrencyAmount value={ven.current} currency={currency} />
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-500 font-medium">
                                                <CurrencyAmount value={ven.thirtySixty} currency={currency} />
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-500 font-medium">
                                                <CurrencyAmount value={ven.sixtyNinety} currency={currency} />
                                            </td>
                                            <td className="px-6 py-4 text-center text-red-500 font-bold">
                                                <CurrencyAmount value={ven.ninetyPlus} currency={currency} />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                    ven.status === 'Active' ? 'bg-emerald-100 text-emerald-600' :
                                                    ven.status === 'On Hold' ? 'bg-yellow-100 text-yellow-600' :
                                                    'bg-red-100 text-red-600'
                                                }`}>
                                                    {ven.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-[#F7F7FA] font-bold border-t border-slate-200">
                                        <td className="px-6 py-4 text-slate-800">Total</td>
                                        <td className="px-6 py-4 text-center text-slate-800">
                                            <CurrencyAmount value={summary.total} currency={currency} />
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-800">
                                            <CurrencyAmount value={summary.current} currency={currency} />
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-800">
                                            <CurrencyAmount value={summary.thirtySixty} currency={currency} />
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-800">
                                            <CurrencyAmount value={summary.sixtyNinety} currency={currency} />
                                        </td>
                                        <td className="px-6 py-4 text-center text-red-500">
                                            <CurrencyAmount value={summary.ninetyPlus} currency={currency} />
                                        </td>
                                        <td className="px-6 py-4"></td>
                                    </tr>
                                </>
                            ) : (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <AlertCircle size={32} className="mb-2 text-slate-300" />
                                            No outstanding payables found.
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">Outstanding Invoices Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-slate-400 border-b border-slate-200 uppercase text-[10px]">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-left">Invoice No.</th>
                                <th className="px-6 py-4 font-semibold text-left">Vendor</th>
                                <th className="px-6 py-4 font-semibold text-center">Date</th>
                                <th className="px-6 py-4 font-semibold text-center">Due Date</th>
                                <th className="px-6 py-4 font-semibold text-center">Amount</th>
                                <th className="px-6 py-4 font-semibold text-center">Balance</th>
                                <th className="px-6 py-4 font-semibold text-center">Days Overdue</th>
                                <th className="px-6 py-4 font-semibold text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400">Loading invoices...</td>
                                </tr>
                            ) : invoicesData.length > 0 ? (
                                invoicesData
                                    .filter(inv => inv.paymentStatus !== 'Paid' && Number(inv.balance || inv.amountDue || 0) > 0)
                                    .map((inv, idx) => {
                                        const today = new Date();
                                        const due = new Date(inv.dueDate || inv.invoiceDate);
                                        const diffTime = today - due;
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        const isOverdue = diffDays > 0;
                                        
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-slate-800">{inv.number}</td>
                                                <td className="px-6 py-4 text-slate-600">{inv.vendorName || vendors.find(v => v.code === inv.vendorCode)?.name || 'Unknown'}</td>
                                                <td className="px-6 py-4 text-center text-slate-500">{formatDisplayDate(inv.invoiceDate)}</td>
                                                <td className="px-6 py-4 text-center text-slate-500">{formatDisplayDate(inv.dueDate)}</td>
                                                <td className="px-6 py-4 text-center font-medium text-slate-500">
                                                    <CurrencyAmount value={inv.netTotal || inv.amountDue || 0} currency={currency} />
                                                </td>
                                                <td className="px-6 py-4 text-center font-bold text-slate-800">
                                                    <CurrencyAmount value={inv.balance || inv.amountDue || 0} currency={currency} />
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {isOverdue ? (
                                                        <span className="text-red-500 font-bold text-[10px]">{diffDays} days</span>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                        isOverdue ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-blue-50 text-blue-500 border border-blue-100'
                                                    }`}>
                                                        {isOverdue ? 'Overdue' : 'Due'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                            ) : (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400">No outstanding invoices.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- MAIN WRAPPER ---
const Vendor = () => {
  const [view, setView] = useState("list");
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const { activeBranch } = useBranch();

  // Load vendors on mount and when active branch changes (BBQA52-024)
  useEffect(() => {
    loadVendors();
  }, [activeBranch?.id]);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const data = await getVendors(activeBranch?.name);
      setVendors(data);
    } catch (e) {
      console.error("Failed to load vendors", e);
    } finally {
      setLoading(false);
    }
  };

  // FIX: handleAddNewVendor now supports Async API calls
  const handleAddNewVendor = async (formData, isDraft) => {
    try {
      if (selectedVendor) {
        // Update Existing
        await updateVendor(selectedVendor.id, formData);
      } else {
        // Create New (Draft or Active)
        if (isDraft) {
          await createVendorDraft(formData);
        } else {
          await createVendor(formData);
        }
      }
      // Refresh List
      await loadVendors();
      setView("list");
      setSelectedVendor(null);
    } catch (e) {
      alert("Failed to save vendor details.");
      console.error(e);
    }
  };

  const handleImportVendors = async (file) => {
    const result = await importVendors(file);
    await loadVendors();
    return result;
  };

  const handleEdit = (vendor) => {
    setSelectedVendor(vendor);
    setView("create");
  };

  // FIX: Delete now uses API
  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this vendor?")) {
      try {
        await deleteVendor(id);
        await loadVendors();
      } catch (err) {
        alert(err.response?.data?.message || "Failed to delete vendor");
      }
    }
  };

  return (
    <div className="min-h-screen font-sans text-slate-900 bg-[#F7F7FA]">
      {view === "list" ? (
        <VendorListViewWithActions
          vendors={vendors}
          loading={loading} // Pass loading state
          onAddNew={() => { setSelectedVendor(null); setView("create"); }}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onImport={handleImportVendors}
        />
      ) : (
        <CreateVendorWizard
          initialData={selectedVendor}
          onBack={() => setView("list")}
          onSave={handleAddNewVendor}
        />
      )}
    </div>
  );
};

// Sub-Component: ListView with Actions wired
const VendorListViewWithActions = ({ vendors, loading, onAddNew, onEdit, onDelete, onImport }) => {
  const { company } = useCompany();
  const { activeBranch } = useBranch();
  const currencyLabel = resolveCurrencyDisplayCode(company);
  const [activeTab, setActiveTab] = useState("Vendors List");
  const [payInvoicesVendor, setPayInvoicesVendor] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const importFileRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);

  // Calculate Stats
  const totalVendors = vendors.length;
  const activeVendors = vendors.filter(v => v.status === 'Active').length;
  const preferredVendors = vendors.filter(v => v.isPreferred).length;
  const onHoldVendors = vendors.filter(v => v.status === 'On Hold').length;

  // Calculate Total Payables
  const totalPayables = vendors.reduce((sum, vendor) => {
    const balance = parseFloat((vendor.balance || "0").toString().replace(/[^0-9.-]+/g, ""));
    return sum + (isNaN(balance) ? 0 : balance);
  }, 0);

  // Calculate Expiring Documents (next 30 days)
  const expiringDocs = vendors.reduce((count, vendor) => {
    const hasExpiring = vendor.documents?.some(doc => {
      if (!doc.expiry) return false;
      const daysUntilExpiry = Math.ceil((new Date(doc.expiry) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
    });
    return count + (hasExpiring ? 1 : 0);
  }, 0);

  const stats = [
    { label: "Total Vendors", value: totalVendors.toString(), icon: Users, color: "blue", bg: "from-blue-50 to-blue-100", border: "border-blue-500", iconColor: "text-blue-500" },
    { label: "Active", value: activeVendors.toString(), icon: CheckCircle2, color: "green", bg: "from-green-50 to-green-100", border: "border-green-500", iconColor: "text-green-500" },
    { label: "Total Payables", value: `${currencyLabel} ${widthFormattedPayables(totalPayables)}`, icon: DollarSign, color: "orange", bg: "from-orange-50 to-orange-100", border: "border-orange-500", iconColor: "text-orange-500" },
    { label: "Preferred", value: preferredVendors.toString(), icon: Star, color: "purple", bg: "from-purple-50 to-purple-100", border: "border-purple-500", iconColor: "text-purple-500" },
    { label: "On Hold", value: onHoldVendors.toString(), icon: AlertCircle, color: "yellow", bg: "from-yellow-50 to-yellow-100", border: "border-yellow-500", iconColor: "text-yellow-500" },
    { label: "Doc Expiring", value: expiringDocs.toString(), icon: AlertTriangle, color: "red", bg: "from-red-50 to-red-100", border: "border-red-500", iconColor: "text-red-500" },
  ];

  function widthFormattedPayables(amount) {
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
    return amount.toLocaleString();
  }

  // Advanced Filters
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filterGroup, setFilterGroup] = useState("All Groups");
  const [filterType, setFilterType] = useState("All Types");

  // Filtering Logic
  const filteredVendors = vendors.filter(vendor => {
    // 1. Search Filter (Name, Code, Email, Contact)
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (vendor.name && vendor.name.toLowerCase().includes(searchLower)) ||
      (vendor.code && vendor.code.toLowerCase().includes(searchLower)) ||
      (vendor.email && vendor.email.toLowerCase().includes(searchLower)) ||
      (vendor.contact && vendor.contact.toLowerCase().includes(searchLower));

    // 2. Status Filter
    const matchesStatus = filterStatus === "All Status" || vendor.status === filterStatus;

    // 3. Category Filter
    const matchesCategory = filterCategory === "All Categories" || vendor.category === filterCategory;

    // 4. Group Filter
    const matchesGroup = filterGroup === "All Groups" || vendor.group === filterGroup;

    // 5. Type Filter
    const matchesType = filterType === "All Types" || vendor.type === filterType;

    return matchesSearch && matchesStatus && matchesCategory && matchesGroup && matchesType;
  });

  // Client-side pagination for the vendor list.
  const LIST_PAGE_SIZE = 30;
  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [searchTerm, filterStatus, filterCategory, filterGroup, filterType]);
  const pagedVendors = filteredVendors.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);

  const resetFilters = () => {
    setSearchTerm("");
    setFilterStatus("All Status");
    setFilterCategory("All Categories");
    setFilterGroup("All Groups");
    setFilterType("All Types");
    setShowMoreFilters(false);
  };

  const hasActiveFilters = searchTerm !== "" || filterStatus !== "All Status" || filterCategory !== "All Categories" || filterGroup !== "All Groups" || filterType !== "All Types";



  const handleExportExcel = () => {
    exportToExcel(withExportSerialNumbers(filteredVendors).map((vendor) => ({
      ...vendor,
      balance: formatCurrencyDisplay(vendor.balance, currencyLabel)
    })), VENDOR_COLUMNS, 'Vendor_List', { companyProfile: company, branch: activeBranch?.name || '' });
  };

  const handleExportPdf = () => {
    exportToPDF(withExportSerialNumbers(filteredVendors).map((vendor) => ({
      ...vendor,
      balance: formatCurrencyDisplay(vendor.balance, currencyLabel)
    })), VENDOR_COLUMNS, 'Vendor List', 'Vendor_List', { companyProfile: company, branch: activeBranch?.name || '' });
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;

    const toastId = toast.loading(`Importing ${file.name}...`);
    setIsImporting(true);
    try {
      const result = await onImport(file);
      toast.success(result || 'Vendors imported successfully.', { id: toastId, duration: 6000 });
    } catch (error) {
      console.error('Failed to import vendors', error);
      const message = error.response?.data || error.message || 'Failed to import vendors.';
      toast.error(message, { id: toastId, duration: 7000 });
    } finally {
      setIsImporting(false);
      e.target.value = null;
    }
  };

  const renderStars = (rating) => (
    <div className="flex text-[#F5C742]">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={14} className={`${i < Math.floor(rating) ? 'fill-[#F5C742] text-[#F5C742]' : 'text-gray-300'}`} />
      ))}
      <span className="text-xs font-medium text-gray-600 ml-2">{rating || 0}</span>
    </div>
  );

  const getStatusStyle = (status) => {
    if (status === 'Active') return 'bg-green-100 text-green-700';
    if (status === 'On Hold') return 'bg-yellow-100 text-yellow-700';
    if (status === 'Draft') return 'bg-slate-100 text-slate-600 border border-slate-200';
    return 'bg-gray-100 text-gray-700';
  };

  const getStatusIcon = (status) => {
    if (status === 'Active') return <CheckCircle2 className="h-3 w-3 mr-1" />;
    if (status === 'On Hold') return <AlertCircle className="h-3 w-3 mr-1" />;
    if (status === 'Draft') return <FileText className="h-3 w-3 mr-1" />;
    return null;
  };

  return (
    <>
      <div className="bg-white border-b border-slate-200 p-6 pb-0 print:hidden">
        <div className="flex flex-col md:flex-row items-start justify-between mb-4 gap-4 md:gap-0">
          <div>
            <div className="text-sm text-gray-500 mb-1">Vendors & Purchases → Vendor Ledger</div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Users className="h-6 w-6 text-[#F5C742]" /> Vendor Ledger
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage vendor master data, payments, statements & aging analysis</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "Vendors List" ? (
              <>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportFileChange}
                />
                <button
                  onClick={() => importFileRef.current?.click()}
                  disabled={isImporting}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border bg-white hover:bg-slate-50 h-9 px-4 border-slate-200 text-slate-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isImporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
                <ExportDropdown
                  onExportExcel={handleExportExcel}
                  onExportPdf={handleExportPdf}
                />
                <button onClick={onAddNew} className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-bold h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm">
                  <Plus className="h-4 w-4" /> New Vendor
                </button>
              </>
            ) : null}
            <button className="h-9 w-9 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"><MoreVertical className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex gap-8 mt-6 overflow-x-auto">
          {["Vendors List", "Pay Invoices", "Vendor SoA", "Creditors Summary"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap ${activeTab === tab ? "border-[#F5C742] text-[#F5C742]" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
              {tab === "Vendors List" && <Users className="h-4 w-4" />}
              {tab === "Pay Invoices" && <DollarSign className="h-4 w-4" />}
              {tab === "Vendor SoA" && <FileText className="h-4 w-4" />}
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 pb-20">
        {activeTab === "Vendors List" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {stats.map((stat, index) => (
                <div key={index} className={`bg-gradient-to-br ${stat.bg} p-4 rounded-lg border-l-4 ${stat.border} shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 font-medium">{stat.label}</span>
                    <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-100 space-y-4">
                <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
                  {/* Search - Prominent */}
                  <div className="relative flex-1 max-w-lg ring-offset-2 focus-within:ring-2 ring-slate-200 rounded-lg transition-all">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search vendors by name, code, email..."
                      className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 bg-slate-50/30 focus:bg-white focus:outline-none focus:border-[#F5C742] transition-colors text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Filters Row */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-full sm:w-40 relative">
                      <Dropdown
                        options={["All Status", ...vendorStatusOptions]}
                        selected={filterStatus}
                        onSelect={setFilterStatus}
                      />
                    </div>
                    <div className="w-full sm:w-44 relative">
                      <Dropdown
                        options={["All Categories", ...categoryOptions]}
                        selected={filterCategory}
                        onSelect={setFilterCategory}
                      />
                    </div>

                    <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

                    <button
                      onClick={() => setShowMoreFilters(!showMoreFilters)}
                      className={`h-10 px-4 rounded-lg border flex items-center gap-2 text-sm font-medium transition-all ${showMoreFilters
                        ? 'border-[#F5C742] bg-[#F5C742] text-slate-900 shadow-md transform scale-105 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      <Filter className="h-4 w-4" />
                      <span>More Filters</span>
                    </button>

                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="h-10 px-3 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition-colors flex items-center gap-1"
                        title="Clear all filters"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Extended Filters (Slide Down) */}
                {showMoreFilters && (
                  <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-1 fade-in duration-200">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Vendor Group</label>
                      <Dropdown
                        options={["All Groups", ...vendorGroupOptions]}
                        selected={filterGroup}
                        onSelect={setFilterGroup}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Vendor Type</label>
                      <Dropdown
                        options={["All Types", ...vendorTypeOptions]}
                        selected={filterType}
                        onSelect={setFilterType}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="bb-nowrap-table w-full text-sm">
                  <thead className="bg-gray-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-center font-medium text-gray-500 w-16 select-none">S.No.</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Vendor Code</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Vendor Name</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Category</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Contact</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">Lead Time</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Rating</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">Payable Balance</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                      <th className="px-6 py-3 text-center font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan="10" className="p-8 text-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading Vendors...</td></tr>
                    ) : pagedVendors.length === 0 ? (
                      <tr><td colSpan="10" className="p-8 text-center text-slate-500">No vendors found matching criteria.</td></tr>
                    ) : (
                      pagedVendors.map((vendor, index) => (
                        <tr key={vendor.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-4 text-center text-slate-400 font-mono font-medium">
                            {getListSerialNumber(index, {
                              page: listPage,
                              size: LIST_PAGE_SIZE,
                              totalElements: filteredVendors.length,
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><span className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-slate-600">{vendor.code || 'N/A'}</span></div></td>
                          <td className="px-6 py-4"><div className="flex flex-col"><div className="font-medium text-slate-900 flex items-center gap-2">{vendor.name}{vendor.isPreferred && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-700 font-medium"><Star className="h-3 w-3 fill-purple-700" />Preferred</span>}</div><div className="text-xs text-gray-500">{vendor.email}</div></div></td>
                          <td className="px-6 py-4"><span className="text-xs px-2 py-1 rounded font-medium bg-blue-100 text-blue-700">{vendor.category}</span></td>
                          <td className="px-6 py-4 text-slate-600">{vendor.contact}</td>
                          <td className="px-6 py-4 text-right"><span className="inline-flex items-center gap-1 text-slate-600"><Clock className="h-3 w-3 text-gray-400" />{vendor.leadTime || '-'}</span></td>
                          <td className="px-6 py-4">{renderStars(vendor.rating)}</td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900"><CurrencyAmount value={vendor.balance} currency={currencyLabel} /></td>
                          <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusStyle(vendor.status)}`}>{getStatusIcon(vendor.status)}{vendor.status}</span></td>
                          <td className="px-6 py-4 text-center"><div className="flex items-center justify-center gap-1"><button onClick={() => { setPayInvoicesVendor(vendor); setActiveTab("Pay Invoices"); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" title="View Payables"><Eye className="h-4 w-4" /></button><button onClick={() => onEdit(vendor)} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" title="Edit Vendor"><SquarePen className="h-4 w-4" /></button><button onClick={() => onDelete(vendor.id)} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <PaginationFooter
                  page={listPage}
                  size={LIST_PAGE_SIZE}
                  totalElements={filteredVendors.length}
                  totalPages={Math.ceil(filteredVendors.length / LIST_PAGE_SIZE)}
                  onPageChange={setListPage}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "Pay Invoices" && <PayInvoices vendors={vendors} initialVendor={payInvoicesVendor} />}
        {activeTab === "Vendor SoA" && <VendorSoA vendors={vendors} />}
        {activeTab === "Creditors Summary" && <CreditorsSummaryView vendors={vendors} />}
      </div>
    </>
  );
};

export default Vendor;
