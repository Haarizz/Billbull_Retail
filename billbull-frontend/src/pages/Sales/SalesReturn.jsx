import React, { useState, useEffect } from 'react';
import { generatePrintHtmlAsync, printHtml, downloadPdf } from '../../utils/printGenerator';
import { buildDocumentHeaderProfile } from '../../utils/branchPrintProfile';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import billBullLogo from '../../assets/billBullLogo.png';
import {
   RotateCcw,
   Search,
   Plus,
   ChevronDown,
   User,
   Calendar,
   Save,
   Printer,
   CheckCircle2,
   AlertCircle,
   FileText,
   CreditCard,
   TrendingUp,
   Clock,
   Filter,
   Eye,
   Edit,
   X,
   Building,
   Receipt,
   ArrowUpRight,
   ArrowDownRight,
   Trash2,
   Box,
   RefreshCw,
   Mail,
   Download
} from 'lucide-react';
import ExportDropdown from '../../components/common/ExportDropdown';
import PaginationFooter from '../../components/common/PaginationFooter';
import DateFilter from '../../components/common/DateFilter';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { generateDocFilename } from '../../utils/filenameUtils';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import CurrencyAmount from '../../components/CurrencyAmount';
import { formatDisplayDate } from '../../utils/dateUtils';

// ✅ DYNAMIC UI COMPONENTS


// API Imports
import {
   getSalesReturnsPage,
   saveSalesReturn,
   getNextSalesReturnNumber,
   getSalesReturnStats,
   deleteSalesReturn,
   updateSalesReturnStatus,
   getReturnableBatches
} from '../../api/salesReturnApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';
import { getSalesSettings } from '../../api/salesSettingsApi';
import { isAutoNumberingEnabled } from '../../utils/salesNumbering';
import TableSkeleton from '../../components/common/TableSkeleton';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const SALES_RETURN_COLUMNS = [
   { header: 'Return No', key: 'returnNumber', width: 15 },
   { header: 'Date', key: 'returnDate', width: 12 },
   { header: 'Customer', key: 'customerName', width: 25 },
   { header: 'Invoice Ref', key: 'linkedInvoice', width: 15 },
   { header: 'Reason', key: 'reason', width: 20 },
   { header: 'Credit Amount', key: 'totalAmount', width: 15 },
   { header: 'Status', key: 'status', width: 12 }
];

// ==========================================
// SALES RETURN MODULE COMPONENT
// ==========================================

const SalesReturn = () => {
   const { print } = usePrintDocument();
   const { company } = useCompany();
   const { branches: availableBranches, activeBranch } = useBranch();
   const [loadedReturnBranchId, setLoadedReturnBranchId] = useState(null);
   const currency = company?.currency || 'AED';
   const [activeTab, setActiveTab] = useState('list');
   const [isLoading, setIsLoading] = useState(false);

   // --- DATA LIST STATES ---
   const [returnsList, setReturnsList] = useState([]);
   const [invoicesList, setInvoicesList] = useState([]);
   const [searchQuery, setSearchQuery] = useState('');
   const [statusFilter, setStatusFilter] = useState('All Status');
   const [returnsPage, setReturnsPage] = useState(0);
   const _todayRet = new Date().toISOString().slice(0, 10);
   const [dateRange, setDateRange] = useState({ fromDate: _todayRet, toDate: _todayRet });
   const [returnsPageMeta, setReturnsPageMeta] = useState({ page: 0, size: 30, totalElements: 0, totalPages: 0 });
   const [salesSettings, setSalesSettings] = useState(null);
   const returnAutoNumbering = isAutoNumberingEnabled(salesSettings, 'SALES_RETURN');

   // --- FORM STATES ---
   const [returnId, setReturnId] = useState(null);
   const [returnNo, setReturnNo] = useState('');
   const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
   const [returnStatus, setReturnStatus] = useState('DRAFT');

   // Linking & Customer
   const [linkedInvoice, setLinkedInvoice] = useState('');
   const [customerCode, setCustomerCode] = useState('');
   const [customerName, setCustomerName] = useState('');
   const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

   // Details
   const [reason, setReason] = useState('Damaged Goods');
   const [returnAction, setReturnAction] = useState('Credit Note');
   const [internalNotes, setInternalNotes] = useState('');

   // Items
   const [items, setItems] = useState([]);

   // Returnable batches indexed by itemCode
   const [returnableByItem, setReturnableByItem] = useState({});
   const [batchModalIdx, setBatchModalIdx] = useState(null); // index into items
   const [batchModalDraft, setBatchModalDraft] = useState([]);

   // Drawer State
   const [isDrawerOpen, setIsDrawerOpen] = useState(false);
   const [selectedReturn, setSelectedReturn] = useState(null);

   // Stats state
   const [stats, setStats] = useState({
      todayReturns: 0,
      thisMonthReturns: 0,
      totalApprovedReturns: 0,
      totalTransactions: 0
   });

   // ==========================================
   // LOAD DATA
   // ==========================================
   useEffect(() => {
      fetchReturns();
      fetchInvoices();
      fetchStats();
      getSalesSettings().then(setSalesSettings).catch(() => {});
   }, []);

   // Refetch when the global Branch Selector changes the active branch.
   useEffect(() => {
      const handler = () => fetchReturns();
      window.addEventListener('billbull:branch-changed', handler);
      return () => window.removeEventListener('billbull:branch-changed', handler);
   }, []);

   useEffect(() => {
      if (activeTab === 'list') {
         fetchReturns();
      }
   }, [activeTab, returnsPage, searchQuery, statusFilter, dateRange]);

   const fetchReturns = async () => {
      setIsLoading(true);
      try {
         const data = await getSalesReturnsPage({
            page: returnsPage,
            size: 30,
            search: searchQuery,
            status: statusFilter === 'All Status' ? '' : statusFilter.toUpperCase(),
            fromDate: dateRange?.fromDate,
            toDate: dateRange?.toDate,
         });
         setReturnsList(Array.isArray(data?.content) ? data.content : []);
         setReturnsPageMeta({
            page: data?.page ?? returnsPage,
            size: data?.size ?? 30,
            totalElements: data?.totalElements ?? 0,
            totalPages: data?.totalPages ?? 0
         });
      } catch (err) {
         console.error('Error fetching returns:', err);
      } finally {
         setIsLoading(false);
      }
   };

   const fetchInvoices = async () => {
      try {
         const data = await getAllSalesInvoices();
         setInvoicesList(data);
      } catch (err) {
         console.error('Error fetching invoices:', err);
      }
   };

   const fetchStats = async () => {
      try {
         const data = await getSalesReturnStats();
         setStats(data);
      } catch (err) {
         console.error('Error fetching stats:', err);
      }
   };

   // ==========================================
   // HANDLERS
   // ==========================================
   const handleCreateNew = async () => {
      setReturnId(null);
      if (returnAutoNumbering) {
         try {
            const nextNum = await getNextSalesReturnNumber();
            setReturnNo(nextNum);
         } catch (err) {
            setReturnNo('');
         }
      } else {
         setReturnNo('');
      }
      setReturnDate(new Date().toISOString().split('T')[0]);
      setReturnStatus('DRAFT');
      setLinkedInvoice('');
      setCustomerCode('');
      setCustomerName('');
      setReason('Damaged Goods');
      setReturnAction('Credit Note');
      setInternalNotes('');
      setItems([]);
      setReturnableByItem({});
      setActiveTab('create');
   };

   const handleSelectInvoice = async (inv) => {
      setLinkedInvoice(inv.invoiceNumber);
      setCustomerCode(inv.customerCode);
      setCustomerName(inv.customerName);
      setIsInvoiceOpen(false);

      // Auto-populate items with return qty 0
      if (inv.items) {
         const mapped = inv.items.map(i => ({
            id: null,
            itemCode: i.itemCode,
            itemName: i.itemName,
            unit: i.unit,
            soldQty: i.quantity,
            returnQty: 0,
            price: i.price,
            taxRate: i.taxRate,
            taxAmount: 0,
            total: 0,
            itemStatus: 'Good',
            batches: []
         }));
         setItems(mapped);
      }

      try {
         const list = await getReturnableBatches(inv.invoiceNumber);
         const grouped = (list || []).reduce((acc, r) => {
            const code = r.itemCode || '';
            if (!acc[code]) acc[code] = [];
            acc[code].push(r);
            return acc;
         }, {});
         setReturnableByItem(grouped);
      } catch (err) {
         console.warn('Could not load returnable batches:', err);
         setReturnableByItem({});
      }
   };

   const handleItemChange = (index, field, value) => {
      const updatedItems = [...items];
      const item = { ...updatedItems[index], [field]: value };

      if (field === 'returnQty') {
         if (Number(value) > item.soldQty) {
            alert(`Cannot return more than sold quantity (${item.soldQty})`);
            item.returnQty = item.soldQty;
         }
      }

      // Calculations
      const qty = Number(item.returnQty) || 0;
      const price = Number(item.price) || 0;
      const taxR = Number(item.taxRate) || 0;

      const base = qty * price;
      const taxA = base * (taxR / 100);

      item.total = base + taxA;
      item.taxAmount = taxA;

      updatedItems[index] = item;
      setItems(updatedItems);
   };

   const calculateTotals = () => {
      const sub = items.reduce((acc, i) => acc + (Number(i.returnQty) * Number(i.price) || 0), 0);
      const tax = items.reduce((acc, i) => acc + (Number(i.taxAmount) || 0), 0);
      return { sub, tax, total: sub + tax };
   };

   const { sub: subTotal, tax: taxAmtTotal, total: grandTotal } = calculateTotals();

   const handleViewReturn = (ret) => {
      setSelectedReturn(ret);
      setIsDrawerOpen(true);
   };

   const handleCloseDrawer = () => {
      setIsDrawerOpen(false);
      setTimeout(() => setSelectedReturn(null), 300);
   };

   const handleLoadReturn = (ret) => {
      setReturnId(ret.id);
      setLoadedReturnBranchId(ret.branch?.id ?? null);
      setReturnNo(ret.returnNumber);
      setReturnDate(ret.returnDate);
      setReturnStatus(ret.status);
      setLinkedInvoice(ret.linkedInvoice);
      setCustomerCode(ret.customerCode);
      setCustomerName(ret.customerName);
      setReason(ret.reason);
      setReturnAction(ret.returnAction);
      setInternalNotes(ret.internalNotes);
      setItems(ret.items.map(i => ({ ...i, batches: Array.isArray(i.batches) ? i.batches : [] })));
      setActiveTab('create');

      // Refresh returnable batches view (so partial returns reflect already-returned qty)
      if (ret.linkedInvoice) {
         getReturnableBatches(ret.linkedInvoice).then(list => {
            const grouped = (list || []).reduce((acc, r) => {
               const code = r.itemCode || '';
               if (!acc[code]) acc[code] = [];
               acc[code].push(r);
               return acc;
            }, {});
            setReturnableByItem(grouped);
         }).catch(() => setReturnableByItem({}));
      }
   };

   // ---------- BATCH MODAL ----------
   const openBatchModal = (idx) => {
      const item = items[idx];
      if (!item) return;
      const options = returnableByItem[item.itemCode] || [];
      // Pre-fill draft from current item.batches, ensuring all options appear
      const draft = options.map(opt => {
         const existing = (item.batches || []).find(b => b.originalAllocationId === opt.allocationId);
         return {
            ...opt,
            qtyToReturn: existing ? Number(existing.quantity) || 0 : 0
         };
      });
      setBatchModalDraft(draft);
      setBatchModalIdx(idx);
   };

   const closeBatchModal = () => {
      setBatchModalIdx(null);
      setBatchModalDraft([]);
   };

   const saveBatchModal = () => {
      if (batchModalIdx === null) return;
      const selected = batchModalDraft
         .filter(d => Number(d.qtyToReturn) > 0)
         .map(d => ({
            originalAllocationId: d.allocationId,
            batchMasterId: d.batchMasterId,
            batchNumber: d.batchNumber,
            binCode: d.binCode,
            expiryDate: d.expiryDate,
            quantity: Number(d.qtyToReturn)
         }));
      const totalSel = selected.reduce((s, b) => s + (b.quantity || 0), 0);
      const updated = [...items];
      updated[batchModalIdx] = {
         ...updated[batchModalIdx],
         batches: selected,
         returnQty: totalSel
      };
      // Recalculate totals for this line
      const it = updated[batchModalIdx];
      const price = Number(it.price) || 0;
      const taxR = Number(it.taxRate) || 0;
      const base = totalSel * price;
      const taxA = base * (taxR / 100);
      it.total = base + taxA;
      it.taxAmount = taxA;
      setItems(updated);
      closeBatchModal();
   };

   const handleBatchDraftChange = (allocId, value) => {
      // Hard caps:
      //  1) Per-row — can't return more from a lot than what's still returnable.
      //  2) Aggregate — if the line already has a Return Qty set, the sum
      //     across batches must not exceed it (backend rejects mismatches
      //     anyway at approve time; this prevents the bad state in the UI).
      const lineReturnQty = Number(items[batchModalIdx]?.returnQty) || 0;
      setBatchModalDraft(prev => {
         const target = prev.find(d => d.allocationId === allocId);
         if (!target) return prev;
         const sumOfOthers = prev.reduce(
            (s, d) => s + (d.allocationId === allocId ? 0 : (Number(d.qtyToReturn) || 0)),
            0
         );
         const perRowCap = Number(target.returnableQty) || 0;
         const aggCap = lineReturnQty > 0
            ? Math.max(0, lineReturnQty - sumOfOthers)
            : Infinity;
         const cap = Math.min(perRowCap, aggCap);
         const v = Math.max(0, Math.min(Number(value) || 0, cap));
         return prev.map(d => d.allocationId === allocId ? { ...d, qtyToReturn: v } : d);
      });
   };

   // Approved returns are immutable on the backend
   // (SalesReturnService.saveReturn — line 103). Locking the form here keeps
   // the UI in sync and avoids the generic "Please try again" toast when the
   // user clicks Save Draft on a record that can never be saved.
   const isLocked = String(returnStatus || '').toUpperCase() === 'APPROVED';

   const handleSave = async (statusOverride = null) => {
      if (isLocked) {
         alert('This return has already been approved and cannot be modified. Create a reversal instead.');
         return;
      }
      if (!returnAutoNumbering && !returnNo.trim()) {
         alert('Please enter a return number');
         return;
      }
      if (!linkedInvoice) {
         alert('Please select a source invoice');
         return;
      }
      if (items.filter(i => i.returnQty > 0).length === 0) {
         alert('Please specify return quantity for at least one item');
         return;
      }

      // Batch validation: any line that has returnable batch options must have batches selected
      // and sum(batches.quantity) must equal returnQty.
      for (const it of items) {
         const qty = Number(it.returnQty) || 0;
         if (qty <= 0) continue;
         const hasBatchOptions = (returnableByItem[it.itemCode] || []).length > 0;
         if (!hasBatchOptions) continue; // non-batch product
         const sel = it.batches || [];
         const selSum = sel.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
         if (sel.length === 0) {
            alert(`Select returning batches for ${it.itemCode || it.itemName} (qty ${qty}).`);
            return;
         }
         if (selSum !== qty) {
            alert(`Batch quantities (${selSum}) must equal return quantity (${qty}) for ${it.itemCode || it.itemName}.`);
            return;
         }
      }

      const payload = {
         id: returnId,
         returnNumber: returnNo,
         returnDate: returnDate,
         customerCode,
         customerName,
         linkedInvoice,
         subTotal,
         taxAmount: taxAmtTotal,
         totalAmount: grandTotal,
         reason,
         returnAction,
         internalNotes,
         status: statusOverride || returnStatus,
         items: items.filter(i => i.returnQty > 0)
      };

      try {
         setIsLoading(true);
         const savedReturn = await saveSalesReturn(payload);
         setReturnNo(savedReturn?.returnNumber || returnNo);
         alert('Sales Return saved successfully!');
         await fetchReturns();
         await fetchStats();
         setActiveTab('list');
      } catch (err) {
         console.error('Error saving return:', err);
         const serverMsg =
            err?.response?.data?.message ||
            (typeof err?.response?.data === 'string' ? err.response.data : null) ||
            err?.message;
         alert(serverMsg ? `Error saving return: ${serverMsg}` : 'Error saving return. Please try again.');
      } finally {
         setIsLoading(false);
      }
   };

   const handlePrint = async (ret) => {
      if (!ret) return;
      try {
         const templates = await getTemplatesByCategory('Sales Return');
         const defaultTemplate = (templates && templates.find(t => t.isDefault)) || {
            category: 'Sales Return',
            paperSize: 'A4',
            orientation: 'Portrait',
            headerContent: '',
            footerContent: '',
            termsContent: '',
            displayOptions: { showLogo: true, showCompanyDetails: true, showCustomerDetails: true, showTerms: false, showItemImage: false },
            columns: { qty: true, unitPrice: true, taxableAmount: true, tax: true, discount: false, total: true },
         };

         const subTotal = Number(ret.subTotal) || (ret.items || []).reduce((s, i) => s + Number(i.price) * Number(i.returnQty), 0);
         const taxAmt = Number(ret.taxAmount) || 0;
         const grandTotal = Number(ret.totalAmount) || subTotal + taxAmt;

         const returnBranchId = loadedReturnBranchId ?? ret.branch?.id ?? activeBranch?.id;
         const printBranch = availableBranches?.find(b => b.id === returnBranchId) || ret.branch || activeBranch || {};
         const printData = {
            title: 'CREDIT NOTE',
            docNo: ret.returnNumber,
            date: ret.returnDate,
            customer: {
               name: ret.customerName || '',
               address: '',
               shippingAddress: '',
               phone: '',
               email: '',
               trn: '',
            },
            items: (ret.items || []).map(item => ({
               name: item.itemName || item.itemCode || '',
               description: { title: item.itemName || item.itemCode || '', details: item.itemCode ? [`Code: ${item.itemCode}`] : [] },
               code: item.itemCode || '',
               unit: item.unit || 'PCS',
               qty: Number(item.returnQty),
               price: Number(item.price),
               taxableAmount: Number(item.price) * Number(item.returnQty),
               taxAmt: 0,
               taxPercent: 0,
               total: Number(item.total),
            })),
            totals: {
               subTotal,
               tax: taxAmt,
               grandTotal,
               currency: company?.currencySymbol || company?.currency || 'AED',
               billDiscount: 0,
               billDiscountAmount: 0,
            },
            meta: {
               status: ret.status || '',
               paymentTerm: '',
               validTill: '',
               validTillLabel: 'Original Invoice',
               notes: `Original Invoice: ${ret.linkedInvoice || '-'}${ret.reason ? `\nReason: ${ret.reason}` : ''}`,
               location: printBranch.name || '',
               locationStore: printBranch.name || printBranch.code || '',
               warehouse: printBranch.defaultWarehouseName || '',
               deliveryTerms: '',
               salesPerson: '',
            },
         };

         const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
            companyProfile: buildDocumentHeaderProfile({
               company,
               branches: availableBranches || [],
               branchId: loadedReturnBranchId ?? selectedReturn?.branch?.id ?? activeBranch?.id,
            }),
            billBullLogo
         });
         printHtml(html);
      } catch (err) {
         console.error('Failed to print credit note', err);
      }
   };

   const handleDownload = async (ret) => {
      if (!ret) return;
      try {
         const templates = await getTemplatesByCategory('Sales Return');
         const defaultTemplate = (templates && templates.find(t => t.isDefault)) || { category: 'Sales Return', paperSize: 'A4', orientation: 'Portrait', headerContent: '', footerContent: '', termsContent: '', displayOptions: { showLogo: true, showCompanyDetails: true, showCustomerDetails: true, showTerms: false, showItemImage: false }, columns: { qty: true, unitPrice: true, taxableAmount: true, tax: true, discount: false, total: true } };
         const subTotal = Number(ret.subTotal) || (ret.items || []).reduce((s, i) => s + Number(i.price) * Number(i.returnQty), 0);
         const taxAmt = Number(ret.taxAmount) || 0;
         const grandTotal = Number(ret.totalAmount) || subTotal + taxAmt;
         const returnBranchId = loadedReturnBranchId ?? ret.branch?.id ?? activeBranch?.id;
         const printBranch = availableBranches?.find(b => b.id === returnBranchId) || ret.branch || activeBranch || {};
         const printData = { title: 'CREDIT NOTE', docNo: ret.returnNumber, date: ret.returnDate, customer: { name: ret.customerName || '', address: '', shippingAddress: '', phone: '', email: '', trn: '' }, items: (ret.items || []).map(item => ({ name: item.itemName || item.itemCode || '', description: { title: item.itemName || item.itemCode || '', details: item.itemCode ? [`Code: ${item.itemCode}`] : [] }, code: item.itemCode || '', unit: item.unit || 'PCS', qty: Number(item.returnQty), price: Number(item.price), taxableAmount: Number(item.price) * Number(item.returnQty), taxAmt: 0, taxPercent: 0, total: Number(item.total) })), totals: { subTotal, tax: taxAmt, grandTotal, currency: company?.currencySymbol || company?.currency || 'AED', billDiscount: 0, billDiscountAmount: 0 }, meta: { status: ret.status || '', paymentTerm: '', validTill: '', validTillLabel: 'Original Invoice', notes: `Original Invoice: ${ret.linkedInvoice || '-'}${ret.reason ? `\nReason: ${ret.reason}` : ''}`, location: printBranch.name || '', locationStore: printBranch.name || printBranch.code || '', warehouse: printBranch.defaultWarehouseName || '', deliveryTerms: '', salesPerson: '' } };
         const html = await generatePrintHtmlAsync(defaultTemplate, printData, { companyProfile: buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: loadedReturnBranchId ?? selectedReturn?.branch?.id ?? activeBranch?.id }), billBullLogo });
         await downloadPdf(html, ret.returnNumber || 'Credit-Note');
      } catch (err) { console.error('Download error', err); }
   };

   // ==========================================
   // RENDER HELPERS
   // ==========================================
   const renderStatusBadge = (status) => {
      const styles = {
         'APPROVED': 'bg-emerald-50 text-emerald-700 border-emerald-200',
         'DRAFT': 'bg-slate-50 text-slate-700 border-slate-200',
         'CANCELLED': 'bg-red-50 text-red-700 border-red-200',
      };
      return (
         <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[status] || styles['DRAFT']}`}>
            {status}
         </span>
      );
   };

   // ==========================================
   // FILTER LOGIC
   // ==========================================
   const filteredReturns = returnsList;

   // ==========================================
   // RENDER
   // ==========================================
   return (
      <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative" onClick={() => setIsInvoiceOpen(false)}>

         <main className="flex-1 flex flex-col w-full print:hidden">

            <div className="p-4 md:p-6 space-y-6">

               {/* HEADER */}
               <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                     <div className="text-xs text-slate-500 mb-1">Sales &gt; Sales Returns</div>
                     <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <RotateCcw className="text-[#F5C742]" size={28} />
                        Sales Returns
                     </h1>
                     <p className="text-sm text-slate-500 mt-1">Manage customer returns and generate credit notes</p>
                  </div>
               </div>

               {/* STATS CARDS */}
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                     <div className="flex justify-between items-start">
                        <div>
                           <p className="text-xs text-slate-500 font-semibold">Today's Returns</p>
                           <CurrencyAmount value={stats.todayReturns} currency={currency} className="text-2xl font-bold text-slate-800 mt-1" />
                           <p className="text-[10px] text-slate-400 mt-1">Returned goods today</p>
                        </div>
                        <div className="p-2 bg-[#F5C742] rounded text-slate-900">
                           <RefreshCw size={20} />
                        </div>
                     </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                     <div className="flex justify-between items-start">
                        <div>
                           <p className="text-xs text-slate-500 font-semibold">This Month</p>
                           <CurrencyAmount value={stats.thisMonthReturns} currency={currency} className="text-2xl font-bold text-slate-800 mt-1" />
                           <p className="text-[10px] text-slate-400 mt-1">{new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}</p>
                        </div>
                        <div className="p-2 bg-red-50 rounded text-red-600">
                           <TrendingUp size={20} />
                        </div>
                     </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                     <div className="flex justify-between items-start">
                        <div>
                           <p className="text-xs text-slate-500 font-semibold">Approved Refunds</p>
                           <CurrencyAmount value={stats.totalApprovedReturns} currency={currency} className="text-2xl font-bold text-slate-800 mt-1" />
                           <p className="text-[10px] text-slate-400 mt-1">Total credited amount</p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded text-emerald-600">
                           <CheckCircle2 size={20} />
                        </div>
                     </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                     <div className="flex justify-between items-start">
                        <div>
                           <p className="text-xs text-slate-500 font-semibold">Total Returns</p>
                           <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalTransactions}</h3>
                           <p className="text-[10px] text-slate-400 mt-1">All time records</p>
                        </div>
                        <div className="p-2 bg-indigo-50 rounded text-indigo-600">
                           <FileText size={20} />
                        </div>
                     </div>
                  </div>
               </div>

               {/* TABS */}
               <div className="bg-white border border-slate-200 rounded-lg p-1 inline-flex shadow-sm w-fit">
                  {[
                     { id: 'list', label: 'Returns List' },
                     { id: 'create', label: 'New Sales Return' }
                  ].map(tab => (
                     <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-[#F5C742] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                     >
                        {tab.label}
                     </button>
                  ))}
               </div>

               {/* ================= TAB: LIST ================= */}
               {activeTab === 'list' && (
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">

                     {/* FILTERS */}
                     <div className="mb-6">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16} /> Filters</h3>
                        <div className="flex items-center gap-3 mb-3">
                           <DateFilter onChange={(range) => { setDateRange(range); setReturnsPage(0); }} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                           <div className="md:col-span-2 relative">
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                              <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                              <input 
                                 type="text" 
                                 placeholder="Search by return no or customer..." 
                                 className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-[#F5C742]"
                                 value={searchQuery}
                                 onChange={(e) => { setSearchQuery(e.target.value); setReturnsPage(0); }}
                              />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Status</label>
                              <select 
                                 className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 font-medium"
                                 value={statusFilter}
                                 onChange={(e) => { setStatusFilter(e.target.value); setReturnsPage(0); }}
                              >
                                 <option>All Status</option>
                                 <option>Draft</option>
                                 <option>Approved</option>
                                 <option>Cancelled</option>
                              </select>
                           </div>
                            <div className="md:col-span-2 flex gap-2">
                               <ExportDropdown
                                   onExportExcel={() => exportToExcel(filteredReturns, SALES_RETURN_COLUMNS, 'Sales_Returns')}
                                   onExportPdf={() => exportToPDF(filteredReturns, SALES_RETURN_COLUMNS, 'Sales Returns List', 'Sales_Returns')}
                               />
                               <button
                                  onClick={handleCreateNew}
                                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm transition-colors"
                               >
                                  <Plus size={14} /> New Sales Return
                               </button>
                            </div>
                        </div>
                     </div>

                     {/* TABLE */}
                     <div className="overflow-x-auto">
                        <table className="bb-nowrap-table w-full text-left text-xs">
                           <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                 <th className="px-4 py-3">Return No</th>
                                 <th className="px-4 py-3">Date</th>
                                 <th className="px-4 py-3">Customer</th>
                                 <th className="px-4 py-3">Branch</th>
                                 <th className="px-4 py-3">Invoice Ref</th>
                                 <th className="px-4 py-3">Reason</th>
                                 <th className="px-4 py-3 text-right">Credit Amount</th>
                                 <th className="px-4 py-3">Status</th>
                                 <th className="px-4 py-3 text-center">Actions</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                              {isLoading && <TableSkeleton cols={9} rows={8} />}
                              {filteredReturns.map((ret) => (
                                 <tr key={ret.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => handleViewReturn(ret)}>
                                    <td className="px-4 py-3 font-bold text-slate-700">{ret.returnNumber}</td>
                                    <td className="px-4 py-3 text-slate-500">{formatDisplayDate(ret.returnDate)}</td>
                                    <td className="px-4 py-3">
                                       <div className="font-medium text-slate-700">{ret.customerName}</div>
                                       {ret.customerCode && <div className="text-[10px] text-slate-400">{ret.customerCode}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-[11px] text-slate-600">
                                       {ret.branch?.code ? ret.branch.code : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                       <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium border border-blue-100">
                                          {ret.linkedInvoice}
                                       </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 italic">"{ret.reason}"</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-600"><CurrencyAmount value={ret.totalAmount} currency={currency} /></td>
                                    <td className="px-4 py-3">{renderStatusBadge(ret.status)}</td>
                                    <td className="px-4 py-3 text-center">
                                       <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                          <button onClick={() => handleViewReturn(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Eye size={14} /></button>
                                          <button onClick={() => handleLoadReturn(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Edit size={14} /></button>
                                          <button onClick={() => handlePrint(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500" title="Print"><Printer size={14} /></button>
                                          <button onClick={() => handleDownload(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500" title="Download PDF"><Download size={14} /></button>
                                          <button onClick={() => { if (window.confirm('Delete this record?')) deleteSalesReturn(ret.id).then(fetchReturns); }} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                                       </div>
                                    </td>
                                 </tr>
                              ))}
                              {filteredReturns.length === 0 && (
                                 <tr>
                                    <td colSpan="8" className="text-center py-20">
                                       <div className="flex flex-col items-center justify-center text-slate-400">
                                          <RotateCcw size={48} className="opacity-10 mb-2" />
                                          <p>No return records found</p>
                                       </div>
                                    </td>
                                 </tr>
                              )}
                           </tbody>
                            </table>
                        <PaginationFooter
                           page={returnsPageMeta.page}
                           size={returnsPageMeta.size}
                           totalElements={returnsPageMeta.totalElements}
                           totalPages={returnsPageMeta.totalPages}
                           loading={isLoading}
                           onPageChange={setReturnsPage}
                        />
                     </div>
                  </div>
               )}

               {/* ================= TAB: CREATE / EDIT ================= */}
               {activeTab === 'create' && (
                  <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

                     {/* MAIN FORM */}
                     <div className="flex-1 space-y-4">

                        {/* ACTION BAR */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center">
                           <div className="flex items-center gap-4">
                              <div className="flex flex-col px-2">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                                 {renderStatusBadge(returnStatus)}
                              </div>
                              <div className="h-8 w-px bg-slate-100"></div>
                              <div className="flex flex-col px-2">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase">Return No</span>
                                 <span className="text-sm font-bold text-slate-700">{returnNo}</span>
                              </div>
                           </div>
                           <div className="flex gap-2 items-center">
                              {isLocked && (
                                 <span
                                    title="Approved returns are locked. Create a reversal to undo or adjust."
                                    className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 font-semibold"
                                 >
                                    Locked — Approved
                                 </span>
                              )}
                              <button onClick={() => setActiveTab('list')} className="px-4 py-2 border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50">
                                 {isLocked ? 'Back to List' : 'Cancel'}
                              </button>
                              {!isLocked && (
                                 <>
                                    <button
                                       onClick={() => handleSave('DRAFT')}
                                       className="px-4 py-2 bg-white border border-[#F5C742] rounded-md text-xs font-bold text-slate-700 hover:bg-yellow-50 shadow-sm flex items-center gap-2"
                                    >
                                       <Save size={16} /> Save Draft
                                    </button>
                                    <button
                                       onClick={() => handleSave('APPROVED')}
                                       className="px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm flex items-center gap-2"
                                    >
                                       <CheckCircle2 size={16} /> Approve & Credit
                                    </button>
                                 </>
                              )}
                           </div>
                        </div>

                        {/* RETURN HEADER */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 relative z-20">
                           <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <RefreshCw size={16} className="text-yellow-500" /> Header Information
                           </h3>
                           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                 <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Return No</label>
                                    <input
                                       type="text"
                                       value={returnNo}
                                       onChange={e => setReturnNo(e.target.value)}
                                       readOnly={returnAutoNumbering}
                                       placeholder={returnAutoNumbering ? 'Auto generated' : 'Enter return number'}
                                       className="w-full text-xs p-2 border border-slate-200 rounded text-slate-700 font-semibold read-only:bg-slate-50 read-only:text-slate-500 focus:border-yellow-400 outline-none"
                                    />
                                 </div>
                              
                                 <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Return Date</label>
                                    <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-yellow-400 outline-none" />
                                 </div>
                              

                              
                                 <div className="relative">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Source Invoice <span className="text-red-500">*</span></label>
                                    <div
                                       onClick={(e) => { e.stopPropagation(); setIsInvoiceOpen(!isInvoiceOpen); }}
                                       className="w-full text-xs p-2 border border-slate-200 rounded bg-white flex justify-between items-center cursor-pointer hover:border-yellow-400"
                                    >
                                       {linkedInvoice || 'Select Invoice...'}
                                       <ChevronDown size={14} className="text-slate-400" />
                                    </div>
                                    {isInvoiceOpen && (
                                       <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
                                          {invoicesList.map(inv => (
                                             <div key={inv.id} onClick={() => handleSelectInvoice(inv)} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                                                <span className="font-bold text-blue-600">{inv.invoiceNumber}</span> - {inv.customerName}
                                             </div>
                                          ))}
                                       </div>
                                    )}
                                 </div>
                              

                              
                                 <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Customer</label>
                                    <input type="text" value={customerName ? `${customerCode} - ${customerName}` : ''} readOnly className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded text-slate-500 font-medium" placeholder="Select invoice first..." />
                                 </div>
                              

                              
                                 <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Reason for Return</label>
                                    <select value={reason} onChange={e => setReason(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded bg-white outline-none focus:border-yellow-400">
                                       <option>Damaged Goods</option>
                                       <option>Expired Stock</option>
                                       <option>Customer Choice</option>
                                       <option>Wrong Delivery</option>
                                       <option>Defective Product</option>
                                    </select>
                                 </div>
                              

                              
                                 <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Return Action</label>
                                    <select value={returnAction} onChange={e => setReturnAction(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded bg-white outline-none focus:border-yellow-400">
                                       <option>Credit Note</option>
                                       <option>Cash Refund</option>
                                       <option>Replacement</option>
                                    </select>
                                 </div>
                              
                           </div>
                        </div>

                        {/* RETURN ITEMS */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                           <div className="flex justify-between items-center mb-4">
                              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                 <Box size={16} className="text-yellow-500" /> Return Items
                              </h3>
                              {!linkedInvoice && <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded border border-orange-100 flex items-center gap-1 animate-pulse"><AlertCircle size={10} /> SELECT INVOICE TO LOAD ITEMS</span>}
                           </div>

                           <div className="overflow-x-auto">
                              <table className="bb-nowrap-table w-full text-xs">
                                 <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                       <th className="p-3 text-left">Item Details</th>
                                       <th className="p-3 text-center w-24">Sold Qty</th>
                                       <th className="p-3 text-center w-24 bg-red-50/50">Return Qty</th>
                                       <th className="p-3 text-left w-32">Condition</th>
                                       <th className="p-3 text-right w-28">Price</th>
                                       <th className="p-3 text-right w-28 font-bold">Total Credit</th>
                                       <th className="p-3 w-10"></th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-100">
                                    {items.length === 0 ? (
                                       <tr>
                                          <td colSpan="7" className="p-12 text-center text-slate-400 flex flex-col items-center">
                                             <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 text-slate-300">
                                                <Receipt size={24} />
                                             </div>
                                             <p>No items attached. Load an invoice to populate items.</p>
                                          </td>
                                       </tr>
                                    ) : (
                                       [...items].reverse().map((item, idx) => (
                                          <tr key={idx} className={`hover:bg-slate-50 transition-colors ${item.returnQty > 0 ? 'bg-emerald-50/30' : ''}`}>
                                             <td>

                                                <td className="p-3">
                                                   <div className="font-bold text-slate-700">{item.itemName}</div>
                                                   <div className="text-[10px] text-slate-400 mt-0.5">{item.itemCode} | {item.unit}</div>
                                                </td>
                                             
</td>
                                             <td>

                                                <td className="p-3 text-center text-slate-500 font-medium">{item.soldQty}</td>
                                             
</td>
                                             <td>

                                                <td className="p-3 text-center bg-red-50/20">
                                                   <input
                                                      type="number"
                                                      value={item.returnQty}
                                                      onChange={e => handleItemChange(idx, 'returnQty', e.target.value)}
                                                      className="w-full text-center p-1 border border-slate-200 rounded focus:border-red-400 outline-none font-bold text-red-600"
                                                      disabled={(returnableByItem[item.itemCode] || []).length > 0}
                                                   />
                                                   {(returnableByItem[item.itemCode] || []).length > 0 && (
                                                      <button
                                                         type="button"
                                                         onClick={() => openBatchModal(idx)}
                                                         className="mt-1 w-full text-[10px] px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                                                      >
                                                         {(item.batches && item.batches.length > 0)
                                                            ? `${item.batches.length} batch${item.batches.length > 1 ? 'es' : ''}`
                                                            : 'Select batches'}
                                                      </button>
                                                   )}
                                                </td>
                                             
</td>
                                             <td>

                                                <td className="p-3">
                                                   <select
                                                      value={item.itemStatus}
                                                      onChange={e => handleItemChange(idx, 'itemStatus', e.target.value)}
                                                      className="w-full p-1 border border-slate-200 rounded text-[10px] outline-none"
                                                   >
                                                      <option value="Good">Good (Restock)</option>
                                                      <option value="Damaged">Damaged (Scrap)</option>
                                                   </select>
                                                </td>
                                             
</td>
                                             <td>

                                                <td className="p-3 text-right text-slate-600 font-medium"><CurrencyAmount value={item.price} currency={currency} /></td>
                                             
</td>
                                             <td>

                                                <td className="p-3 text-right font-bold text-slate-800"><CurrencyAmount value={item.total} currency={currency} /></td>
                                             
</td>
                                             <td className="p-3 text-center">
                                                <button onClick={() => { const ni = [...items]; ni.splice(idx, 1); setItems(ni); }} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                                             </td>
                                          </tr>
                                       ))
                                    )}
                                 </tbody>
                              </table>
                           </div>
                        </div>

                        {/* NOTES */}
                        
                           <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                              <label className="block text-xs font-bold text-slate-600 mb-2">Internal Notes / Audit Log</label>
                              <textarea
                                 rows="3"
                                 value={internalNotes}
                                 onChange={e => setInternalNotes(e.target.value)}
                                 placeholder="Add any specific details about this return approval..."
                                 className="w-full p-3 text-xs border border-slate-200 rounded focus:border-[#F5C742] outline-none resize-none"
                              ></textarea>
                           </div>
                        
                     </div>

                     {/* SUMMARY SIDEBAR */}
                     <div className="w-80 space-y-4">
                        
                           <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 sticky top-4">
                              <h4 className="text-xs font-bold text-slate-700 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                                 <Receipt size={14} className="text-red-500" /> Credit Note Summary
                              </h4>
                              <div className="space-y-4">
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-medium">Subtotal</span>
                                    <CurrencyAmount value={subTotal} currency={currency} className="text-xs font-bold text-slate-700" />
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-medium">Tax Recovery</span>
                                    <CurrencyAmount value={taxAmtTotal} currency={currency} className="text-xs font-bold text-slate-700" />
                                 </div>
                                 <div className="h-px bg-slate-100"></div>
                                 <div className="flex justify-between items-center pt-1">
                                    <div className="flex flex-col">
                                       <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Total Credit</span>
                                       <span className="text-[10px] text-slate-400">Total amount to be refunded</span>
                                    </div>
                                    <CurrencyAmount value={grandTotal} currency={currency} className="text-xl font-bold text-red-600" />
                                 </div>

                                 <div className="mt-6 p-4 bg-red-50/50 rounded-lg border border-red-100">
                                    <div className="flex items-start gap-3">
                                       <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                                       <div className="text-[10px] text-red-700 leading-relaxed font-medium">
                                          Approval of this return will generate a Credit Note for the customer and adjust your inventory based on the item conditions specified.
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        
                     </div>
                  </div>
               )}

            </div>
         </main>

         {/* ================= SLIDE-IN DRAWER ================= */}
         {isDrawerOpen && (
            <div
               className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
               onClick={handleCloseDrawer}
            ></div>
         )}

         <div className={`fixed inset-y-0 right-0 z-50 w-[550px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {selectedReturn && (
               <div className="h-full flex flex-col">
                  {/* Drawer Header */}
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 rounded text-red-600"><RotateCcw size={20} /></div>
                        <div className="flex flex-col">
                           <h3 className="text-lg font-bold text-slate-800 leading-tight">Sales Return Details</h3>
                           <p className="text-xs text-slate-500">{selectedReturn.returnNumber}</p>
                        </div>
                     </div>
                     <button onClick={handleCloseDrawer} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors">
                        <X size={20} />
                     </button>
                  </div>

                  {/* Drawer Body */}
                  <div className="p-6 overflow-y-auto flex-1 space-y-6">

                     {/* Summary Quick Stats */}
                     <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Amount Credited</p>
                           <CurrencyAmount value={selectedReturn.totalAmount} currency={currency} className="text-2xl font-bold text-red-600 text-center" />
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                           {renderStatusBadge(selectedReturn.status)}
                        </div>
                     </div>

                     {/* Header Info */}
                     <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-4">
                        <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 border-b border-slate-50 pb-2 mb-3 uppercase tracking-wider">
                           <FileText size={14} className="text-slate-400" /> General Information
                        </h4>
                        <div className="grid grid-cols-2 gap-y-4 text-xs">
                           <div>
                              <p className="text-slate-400 mb-0.5">Customer</p>
                              <p className="font-bold text-slate-800">{selectedReturn.customerName}</p>
                              <p className="text-slate-500 italic">{selectedReturn.customerCode}</p>
                           </div>
                           <div>
                              <p className="text-slate-400 mb-0.5">Return Date</p>
                              <p className="font-bold text-slate-800">{formatDisplayDate(selectedReturn.returnDate)}</p>
                           </div>
                           <div>
                              <p className="text-slate-400 mb-0.5">Source Invoice</p>
                              <p className="font-bold text-blue-600">{selectedReturn.linkedInvoice}</p>
                           </div>
                           <div>
                              <p className="text-slate-400 mb-0.5">Reason</p>
                              <p className="font-bold text-slate-800">{selectedReturn.reason}</p>
                           </div>
                        </div>
                     </div>

                     {/* Item Table */}
                     <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
                        <h4 className="px-4 py-3 text-xs font-bold text-slate-700 bg-slate-50 border-b border-slate-100 uppercase tracking-wider">Returned Items</h4>
                        <table className="bb-nowrap-table w-full text-[11px] text-left">
                           <thead className="bg-[#fcfdfe] text-slate-500 font-semibold border-b border-slate-100">
                              <tr>
                                 <th className="px-4 py-2">Item</th>
                                 <th className="px-4 py-2 text-center">Qty</th>
                                 <th className="px-4 py-2 text-right">Credit</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {selectedReturn.items.map((item, idx) => (
                                 <tr key={idx}>
                                    <td className="px-4 py-3">
                                       <div className="font-bold text-slate-700">{item.itemName}</div>
                                       <div className="text-[10px] text-slate-400">{item.itemStatus}</div>
                                    </td>
                                    <td className="px-4 py-3 text-center">{item.returnQty}</td>
                                    <td className="px-4 py-3 text-right font-bold"><CurrencyAmount value={item.total} currency={currency} /></td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        <div className="p-4 bg-slate-50/50 flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-500">Total Credits</span>
                           <CurrencyAmount value={selectedReturn.totalAmount} currency={currency} className="font-bold text-lg text-red-600" />
                        </div>
                     </div>

                     {/* Notes */}
                     {selectedReturn.internalNotes && (
                        <div className="bg-yellow-50/30 rounded-lg p-4 border border-yellow-100/50">
                           <h4 className="text-[10px] font-bold text-yellow-700 uppercase mb-2 flex items-center gap-1"><AlertCircle size={12} /> Internal Notes</h4>
                           <p className="text-xs text-slate-600 italic leading-relaxed">{selectedReturn.internalNotes}</p>
                        </div>
                     )}
                  </div>

                  {/* Drawer Footer */}
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3 sticky bottom-0">
                     <button onClick={() => { handleCloseDrawer(); handleLoadReturn(selectedReturn); }} className="flex-1 px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm flex items-center justify-center gap-2 transition-colors">
                        <Edit size={14} /> Edit Return
                     </button>
                     <button onClick={() => handlePrint(selectedReturn)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                        <Printer size={14} /> Print Credit Note
                     </button>
                  </div>
               </div>
            )}
         </div>

         {/* BATCH SELECTION MODAL */}
         {batchModalIdx !== null && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
               <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                  <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                     <div>
                        <h3 className="text-sm font-bold text-slate-800">Select Return Batches</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                           {items[batchModalIdx]?.itemCode} — {items[batchModalIdx]?.itemName}
                        </p>
                     </div>
                     <button onClick={closeBatchModal} className="text-slate-400 hover:text-slate-700">
                        <X size={18} />
                     </button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1">
                     {batchModalDraft.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm">
                           No returnable batches found for this item. All units may have been returned already.
                        </div>
                     ) : (
                        <table className="bb-nowrap-table w-full text-xs">
                           <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                 <th className="p-2 text-left">Batch #</th>
                                 <th className="p-2 text-left">Location</th>
                                 <th className="p-2 text-center">Expiry</th>
                                 <th className="p-2 text-right">Original</th>
                                 <th className="p-2 text-right">Already Returned</th>
                                 <th className="p-2 text-right">Returnable</th>
                                 <th className="p-2 text-center">Qty to Return</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                              {batchModalDraft.map((d) => (
                                 <tr key={d.allocationId} className="hover:bg-slate-50">
                                    <td className="p-2 font-medium text-slate-700">{d.batchNumber}</td>
                                    <td className="p-2 text-slate-600">{d.binCode || '-'}</td>
                                    <td className="p-2 text-center text-slate-500">{d.expiryDate || '-'}</td>
                                    <td className="p-2 text-right text-slate-500">{d.originalQty}</td>
                                    <td className="p-2 text-right text-slate-500">{d.alreadyReturnedQty}</td>
                                    <td className="p-2 text-right text-slate-700 font-semibold">{d.returnableQty}</td>
                                    <td className="p-2 text-center">
                                       {(() => {
                                          const lineReturnQty = Number(items[batchModalIdx]?.returnQty) || 0;
                                          const sumOfOthers = batchModalDraft.reduce(
                                             (s, x) => s + (x.allocationId === d.allocationId ? 0 : (Number(x.qtyToReturn) || 0)),
                                             0
                                          );
                                          const perRowCap = Number(d.returnableQty) || 0;
                                          const aggCap = lineReturnQty > 0
                                             ? Math.max(0, lineReturnQty - sumOfOthers)
                                             : perRowCap;
                                          const cap = Math.min(perRowCap, aggCap);
                                          return (
                                             <input
                                                type="number"
                                                min="0"
                                                max={cap}
                                                value={d.qtyToReturn}
                                                onChange={(e) => handleBatchDraftChange(d.allocationId, e.target.value)}
                                                className="w-20 text-center p-1 border border-slate-200 rounded focus:border-amber-400 outline-none"
                                             />
                                          );
                                       })()}
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                           <tfoot>
                              {(() => {
                                 const totalSelected = batchModalDraft.reduce((s, d) => s + (Number(d.qtyToReturn) || 0), 0);
                                 const lineReturnQty = Number(items[batchModalIdx]?.returnQty) || 0;
                                 const hasTarget = lineReturnQty > 0;
                                 const matches = !hasTarget || totalSelected === lineReturnQty;
                                 return (
                                    <tr className={`${matches ? 'bg-amber-50 border-t border-amber-200' : 'bg-red-50 border-t border-red-200'} font-bold`}>
                                       <td className="p-2" colSpan="6">
                                          Total selected
                                          {hasTarget && (
                                             <span className={`ml-2 font-medium ${matches ? 'text-slate-500' : 'text-red-600'}`}>
                                                (target {lineReturnQty})
                                             </span>
                                          )}
                                       </td>
                                       <td className={`p-2 text-center ${matches ? '' : 'text-red-600'}`}>
                                          {totalSelected}{hasTarget ? ` / ${lineReturnQty}` : ''}
                                       </td>
                                    </tr>
                                 );
                              })()}
                           </tfoot>
                        </table>
                     )}
                  </div>
                  <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
                     {(() => {
                        const totalSelected = batchModalDraft.reduce((s, d) => s + (Number(d.qtyToReturn) || 0), 0);
                        const lineReturnQty = Number(items[batchModalIdx]?.returnQty) || 0;
                        const mismatch = lineReturnQty > 0 && totalSelected !== lineReturnQty;
                        return (
                           <>
                              <div className="text-[11px] text-red-600 min-h-[1em]">
                                 {mismatch && `Batch quantities must sum to ${lineReturnQty} (currently ${totalSelected}).`}
                              </div>
                              <div className="flex gap-2">
                                 <button
                                    onClick={closeBatchModal}
                                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50"
                                 >
                                    Cancel
                                 </button>
                                 <button
                                    onClick={saveBatchModal}
                                    disabled={mismatch}
                                    className={`px-3 py-1.5 text-xs font-bold rounded ${mismatch ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#F5C742] text-slate-900 hover:bg-yellow-400'}`}
                                 >
                                    Save Batches
                                 </button>
                              </div>
                           </>
                        );
                     })()}
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};

export default SalesReturn;
