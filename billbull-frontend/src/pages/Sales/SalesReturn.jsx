import React, { useState, useEffect } from 'react';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { useCompany } from '../../context/CompanyContext';
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
   Mail
} from 'lucide-react';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';

// ✅ DYNAMIC UI COMPONENTS


// API Imports
import {
   getAllSalesReturns,
   saveSalesReturn,
   getNextSalesReturnNumber,
   getSalesReturnStats,
   deleteSalesReturn,
   updateSalesReturnStatus
} from '../../api/salesReturnApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';

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
   const { company } = useCompany();
   const [activeTab, setActiveTab] = useState('list');
   const [isLoading, setIsLoading] = useState(false);

   // --- DATA LIST STATES ---
   const [returnsList, setReturnsList] = useState([]);
   const [invoicesList, setInvoicesList] = useState([]);
   const [searchQuery, setSearchQuery] = useState('');
   const [statusFilter, setStatusFilter] = useState('All Status');

   // --- FORM STATES ---
   const [returnId, setReturnId] = useState(null);
   const [returnNo, setReturnNo] = useState('SR-2026-0001');
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
   }, []);

   const fetchReturns = async () => {
      setIsLoading(true);
      try {
         const data = await getAllSalesReturns();
         setReturnsList(data);
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
      try {
         const nextNum = await getNextSalesReturnNumber();
         setReturnNo(nextNum);
      } catch (err) {
         setReturnNo(`SR-${new Date().getFullYear()}-${String(returnsList.length + 1).padStart(4, '0')}`);
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
      setActiveTab('create');
   };

   const handleSelectInvoice = (inv) => {
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
            itemStatus: 'Good'
         }));
         setItems(mapped);
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
      setReturnNo(ret.returnNumber);
      setReturnDate(ret.returnDate);
      setReturnStatus(ret.status);
      setLinkedInvoice(ret.linkedInvoice);
      setCustomerCode(ret.customerCode);
      setCustomerName(ret.customerName);
      setReason(ret.reason);
      setReturnAction(ret.returnAction);
      setInternalNotes(ret.internalNotes);
      setItems(ret.items.map(i => ({ ...i })));
      setActiveTab('create');
   };

   const handleSave = async (statusOverride = null) => {
      if (!linkedInvoice) {
         alert('Please select a source invoice');
         return;
      }
      if (items.filter(i => i.returnQty > 0).length === 0) {
         alert('Please specify return quantity for at least one item');
         return;
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
         await saveSalesReturn(payload);
         alert('Sales Return saved successfully!');
         await fetchReturns();
         await fetchStats();
         setActiveTab('list');
      } catch (err) {
         console.error('Error saving return:', err);
         alert('Error saving return. Please try again.');
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

         const printData = {
            title: 'CREDIT NOTE',
            docNo: ret.returnNumber,
            date: ret.returnDate,
            customer: {
               name: ret.customerName || '',
               address: '',
               trn: '',
               phone: '',
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
            },
         };

         const html = generatePrintHtml(defaultTemplate, printData, { companyProfile: company, billBullLogo });
         printHtml(html);
      } catch (err) {
         console.error('Failed to print credit note', err);
      }
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
   const filteredReturns = returnsList.filter(ret => {
      const matchesSearch = !searchQuery || 
         ret.returnNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
         ret.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
         ret.customerCode.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'All Status' || ret.status === statusFilter.toUpperCase();
      
      return matchesSearch && matchesStatus;
   });

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
                           <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.todayReturns.toLocaleString()}</h3>
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
                           <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.thisMonthReturns.toLocaleString()}</h3>
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
                           <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.totalApprovedReturns.toLocaleString()}</h3>
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
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                           <div className="md:col-span-2 relative">
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                              <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                              <input 
                                 type="text" 
                                 placeholder="Search by return no or customer..." 
                                 className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-[#F5C742]"
                                 value={searchQuery}
                                 onChange={(e) => setSearchQuery(e.target.value)}
                              />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Range</label>
                              <select className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 font-medium">
                                 <option>All Time</option>
                                 <option>Today</option>
                                 <option>This Month</option>
                              </select>
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Status</label>
                              <select 
                                 className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 font-medium"
                                 value={statusFilter}
                                 onChange={(e) => setStatusFilter(e.target.value)}
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
                        <table className="w-full text-left text-xs">
                           <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                 <th className="px-4 py-3">Return No</th>
                                 <th className="px-4 py-3">Date</th>
                                 <th className="px-4 py-3">Customer</th>
                                 <th className="px-4 py-3">Invoice Ref</th>
                                 <th className="px-4 py-3">Reason</th>
                                 <th className="px-4 py-3 text-right">Credit Amount</th>
                                 <th className="px-4 py-3">Status</th>
                                 <th className="px-4 py-3 text-center">Actions</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                              {filteredReturns.map((ret) => (
                                 <tr key={ret.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => handleViewReturn(ret)}>
                                    <td className="px-4 py-3 font-bold text-slate-700">{ret.returnNumber}</td>
                                    <td className="px-4 py-3 text-slate-500">{ret.returnDate}</td>
                                    <td className="px-4 py-3">
                                       <div className="font-medium text-slate-700">{ret.customerName}</div>
                                       <div className="text-[10px] text-slate-400">{ret.customerCode}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                       <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium border border-blue-100">
                                          {ret.linkedInvoice}
                                       </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 italic">"{ret.reason}"</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-600">AED {ret.totalAmount.toLocaleString()}</td>
                                    <td className="px-4 py-3">{renderStatusBadge(ret.status)}</td>
                                    <td className="px-4 py-3 text-center">
                                       <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                          <button onClick={() => handleViewReturn(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Eye size={14} /></button>
                                          <button onClick={() => handleLoadReturn(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Edit size={14} /></button>
                                          <button onClick={() => handlePrint(ret)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Printer size={14} /></button>
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
                           <div className="flex gap-2">
                              <button onClick={() => setActiveTab('list')} className="px-4 py-2 border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50">
                                 Cancel
                              </button>
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
                           </div>
                        </div>

                        {/* RETURN HEADER */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 relative z-20">
                           <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <RefreshCw size={16} className="text-yellow-500" /> Header Information
                           </h3>
                           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              
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
                              <table className="w-full text-xs">
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
                                       items.map((item, idx) => (
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
                                                   />
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

                                                <td className="p-3 text-right text-slate-600 font-medium">AED {item.price.toLocaleString()}</td>
                                             
</td>
                                             <td>

                                                <td className="p-3 text-right font-bold text-slate-800">AED {item.total.toLocaleString()}</td>
                                             
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
                                    <span className="text-xs font-bold text-slate-700">AED {subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-medium">Tax Recovery</span>
                                    <span className="text-xs font-bold text-slate-700">AED {taxAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                 </div>
                                 <div className="h-px bg-slate-100"></div>
                                 <div className="flex justify-between items-center pt-1">
                                    <div className="flex flex-col">
                                       <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Total Credit</span>
                                       <span className="text-[10px] text-slate-400">Total amount to be refunded</span>
                                    </div>
                                    <span className="text-xl font-bold text-red-600">AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                           <p className="text-2xl font-bold text-red-600 text-center">AED {selectedReturn.totalAmount.toLocaleString()}</p>
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
                              <p className="font-bold text-slate-800">{selectedReturn.returnDate}</p>
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
                        <table className="w-full text-[11px] text-left">
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
                                    <td className="px-4 py-3 text-right font-bold">AED {item.total.toLocaleString()}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        <div className="p-4 bg-slate-50/50 flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-500">Total Credits</span>
                           <span className="font-bold text-lg text-red-600">AED {selectedReturn.totalAmount.toLocaleString()}</span>
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

      </div>
   );
};

export default SalesReturn;
