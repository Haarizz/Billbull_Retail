import React, { useState, useEffect, useMemo } from 'react';
import {
    DollarSign,
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
    Wallet,
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
    Banknote
} from 'lucide-react';

// API Imports
import { getAllSalesPayments, saveSalesPayment, getNextSalesPaymentNumber, getSalesPaymentStats, deleteSalesPayment } from '../../api/salesPaymentApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';
import { getAllCustomers } from '../../api/customerledgerApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { useCompany } from '../../context/CompanyContext';
import billBullLogo from '../../assets/billBullLogo.png';

// ==========================================
// PAYMENT MODULE COMPONENT
// ==========================================

const Payment = () => {
    const { company } = useCompany();
    const [activeTab, setActiveTab] = useState('list');
    const [isLoading, setIsLoading] = useState(false);

    // --- DATA LIST STATES ---
    const [paymentsList, setPaymentsList] = useState([]);
    const [customersList, setCustomersList] = useState([]);
    const [invoicesList, setInvoicesList] = useState([]);

    // --- FORM STATES ---
    const [paymentId, setPaymentId] = useState(null);
    const [paymentNo, setPaymentNo] = useState('PAY-2026-0001');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentType, setPaymentType] = useState('Received'); // Received or Made
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paymentStatus, setPaymentStatus] = useState('Completed');

    // Customer/Vendor
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isCustomerOpen, setIsCustomerOpen] = useState(false);

    // Multi-Settlement State (object map like CustomerLedger)
    const [selectedInvoices, setSelectedInvoices] = useState({}); // Map: invoiceNo -> boolean
    const [settleAmounts, setSettleAmounts] = useState({});       // Map: invoiceNo -> amount

    // Auto-allocate & cheque date
    const [receivedAmount, setReceivedAmount] = useState('');
    const [chequeDate, setChequeDate] = useState('');

    // Payment Details
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');

    // Drawer State
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState(null);

    // Stats state
    const [stats, setStats] = useState({
        todayReceived: 0,
        thisMonthReceived: 0,
        pendingAmount: 0,
        totalPayments: 0
    });

    // ==========================================
    // LOAD DATA
    // ==========================================
    useEffect(() => {
        fetchPayments();
        fetchCustomers();
        fetchInvoices();
        fetchStats();
    }, []);

    const fetchPayments = async () => {
        setIsLoading(true);
        try {
            const data = await getAllSalesPayments();
            // Map backend fields to frontend format
            const mapped = data.map(p => ({
                id: p.id,
                paymentNo: p.paymentNumber,
                date: p.paymentDate,
                type: p.paymentType === 'RECEIVED' ? 'Received' : 'Made',
                customerCode: p.customerCode,
                customerName: p.customerName,
                invoiceNo: p.linkedInvoice || '',
                invoiceAmount: p.invoiceAmount || 0,
                amount: p.amount || 0, // This is the paid amount for this record
                mode: p.paymentMode,
                reference: p.referenceNumber || '',
                status: p.status ? p.status.charAt(0) + p.status.slice(1).toLowerCase() : 'Pending'
            }));
            setPaymentsList(mapped);
        } catch (err) {
            console.error('Error fetching payments:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const data = await getAllCustomers();
            const mapped = data.map(c => ({
                id: c.id,
                code: c.code,
                name: c.name
            }));
            setCustomersList(mapped);
        } catch (err) {
            console.error('Error fetching customers:', err);
        }
    };

    const fetchInvoices = async () => {
        try {
            const data = await getAllSalesInvoices();
            const mapped = data.map(inv => ({
                id: inv.id,
                invoiceNo: inv.invoiceNumber,
                customerCode: inv.customerCode,
                invoiceDate: inv.invoiceDate || null,
                dueDate: inv.dueDate || null,
                total: inv.invoiceTotal || 0,
                paid: inv.amountPaid || 0,
                balance: inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0))
            }));
            setInvoicesList(mapped);
        } catch (err) {
            console.error('Error fetching invoices:', err);
        }
    };

    const fetchStats = async () => {
        try {
            const data = await getSalesPaymentStats();
            setStats({
                todayReceived: data.todayReceived || 0,
                thisMonthReceived: data.thisMonthReceived || 0,
                pendingAmount: data.pendingAmount || 0,
                totalPayments: data.totalTransactions || 0
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    };

    const handlePrint = async (payment) => {
        if (!payment) return;
        try {
            const templates = await getTemplatesByCategory('Sales Invoice');
            const defaultTemplate = (templates && templates.find(t => t.isDefault)) || {
                category: 'Sales Invoice',
                paperSize: 'A4',
                orientation: 'Portrait',
                headerContent: '',
                footerContent: '',
                termsContent: '',
                displayOptions: { showLogo: true, showCompanyDetails: true, showCustomerDetails: true, showTerms: false, showItemImage: false },
                columns: { qty: false, unitPrice: false, taxableAmount: false, tax: false, discount: false, total: true },
            };

            const amount = Number(payment.amount) || 0;
            const printData = {
                title: 'PAYMENT RECEIPT',
                docNo: payment.paymentNo,
                date: payment.date,
                customer: {
                    name: payment.customerName || '',
                    address: '',
                    trn: '',
                    phone: '',
                },
                items: [{
                    name: 'Payment Received',
                    description: { title: 'Payment Received', details: [
                        `Mode: ${payment.mode || '-'}`,
                        payment.reference ? `Ref: ${payment.reference}` : null,
                        payment.invoiceNo ? `Invoice: ${payment.invoiceNo}` : null,
                    ].filter(Boolean) },
                    unit: '',
                    qty: 1,
                    price: amount,
                    taxableAmount: amount,
                    taxAmt: 0,
                    taxPercent: 0,
                    total: amount,
                }],
                totals: {
                    subTotal: amount,
                    tax: 0,
                    grandTotal: amount,
                    currency: 'AED',
                    billDiscount: 0,
                    billDiscountAmount: 0,
                },
                meta: {
                    status: payment.status || 'Completed',
                    paymentTerm: '',
                    validTill: '',
                    notes: payment.notes || '',
                },
            };

            const html = generatePrintHtml(defaultTemplate, printData, { companyProfile: company, billBullLogo });
            printHtml(html);
        } catch (err) {
            console.error('Failed to print payment receipt', err);
        }
    };



    // ==========================================
    // HANDLERS
    // ==========================================
    const handleCreateNew = async () => {
        setPaymentId(null);
        try {
            const nextNum = await getNextSalesPaymentNumber();
            setPaymentNo(nextNum);
        } catch (err) {
            setPaymentNo(`PAY-${new Date().getFullYear()}-${String(paymentsList.length + 1).padStart(4, '0')}`);
        }
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPaymentType('Received');
        setPaymentMode('Cash');
        setPaymentStatus('Completed');
        setSelectedCustomer(null);
        setSelectedInvoices({});
        setSettleAmounts({});
        setReceivedAmount('');
        setChequeDate('');
        setReferenceNo('');
        setNotes('');
        setActiveTab('create');
    };

    const handleSelectCustomer = (cust) => {
        setSelectedCustomer(cust);
        setIsCustomerOpen(false);
        setSelectedInvoices({});
        setSettleAmounts({});
        setReceivedAmount('');
    };

    const handleInvoiceSelection = (inv, isSelected) => {
        setSelectedInvoices(prev => ({ ...prev, [inv.invoiceNo]: isSelected }));
        if (isSelected) {
            setSettleAmounts(prev => ({ ...prev, [inv.invoiceNo]: inv.balance }));
        } else {
            setSettleAmounts(prev => {
                const next = { ...prev };
                delete next[inv.invoiceNo];
                return next;
            });
        }
    };

    const handleSettleAmountChange = (invNo, value, maxBal) => {
        let val = parseFloat(value) || 0;
        if (val > maxBal) val = maxBal;
        if (val < 0) val = 0;
        setSettleAmounts(prev => ({ ...prev, [invNo]: val }));
    };

    const handleSelectAllInvoices = (e) => {
        const isChecked = e.target.checked;
        const customerInvoices = invoicesList.filter(inv => inv.customerCode === selectedCustomer?.code && inv.balance > 0);
        const newSelected = {};
        const newAmounts = {};
        if (isChecked) {
            customerInvoices.forEach(inv => {
                newSelected[inv.invoiceNo] = true;
                newAmounts[inv.invoiceNo] = inv.balance;
            });
        }
        setSelectedInvoices(newSelected);
        setSettleAmounts(newAmounts);
    };

    const handleAutoAllocate = (amount) => {
        const totalReceived = parseFloat(amount) || 0;
        setReceivedAmount(amount);

        if (totalReceived <= 0) {
            setSettleAmounts({});
            setSelectedInvoices({});
            return;
        }

        const customerInvoices = invoicesList.filter(inv => inv.customerCode === selectedCustomer?.code && inv.balance > 0);
        // Sort by closest due date first, nulls last
        const sorted = [...customerInvoices].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });

        let remaining = totalReceived;
        const newSettleAmounts = {};
        const newSelectedInvoices = {};

        for (const inv of sorted) {
            if (remaining <= 0) break;
            const allocate = Math.min(remaining, inv.balance);
            newSettleAmounts[inv.invoiceNo] = allocate;
            newSelectedInvoices[inv.invoiceNo] = true;
            remaining -= allocate;
        }

        setSettleAmounts(newSettleAmounts);
        setSelectedInvoices(newSelectedInvoices);
    };

    const handleViewPayment = (payment) => {
        setSelectedPayment(payment);
        setIsDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        setTimeout(() => setSelectedPayment(null), 300);
    };

    const handleLoadPayment = (payment) => {
        setPaymentId(payment.id);
        setPaymentNo(payment.paymentNo);
        setPaymentDate(payment.date);
        setPaymentType(payment.type);
        setPaymentMode(payment.mode);
        setPaymentStatus(payment.status);
        setSelectedCustomer({ code: payment.customerCode, name: payment.customerName });
        setSelectedInvoices({ [payment.invoiceNo]: true });
        setSettleAmounts({ [payment.invoiceNo]: payment.amount });
        setReferenceNo(payment.reference);
        setReceivedAmount('');
        setChequeDate('');
        setActiveTab('create');
    };

    const handleSave = async () => {
        if (!selectedCustomer) { alert('Please select a customer'); return; }
        const selectedKeys = Object.keys(selectedInvoices).filter(k => selectedInvoices[k]);
        if (selectedKeys.length === 0) { alert('Please select at least one invoice to settle'); return; }

        setIsLoading(true);
        try {
            let currentPaymentNo = paymentNo;
            for (const invNo of selectedKeys) {
                const amountToSettle = settleAmounts[invNo] || 0;
                if (amountToSettle <= 0) continue;

                const inv = invoicesList.find(i => i.invoiceNo === invNo);
                const invBalance = inv ? inv.balance : 0;
                const invTotal = inv ? inv.total : 0;
                const status = amountToSettle < invBalance ? 'PARTIAL' : 'COMPLETED';

                if (selectedKeys.length > 1) {
                    try { currentPaymentNo = await getNextSalesPaymentNumber(); }
                    catch { currentPaymentNo = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`; }
                }

                await saveSalesPayment({
                    id: selectedKeys.length === 1 ? paymentId : null,
                    paymentNumber: currentPaymentNo,
                    paymentDate: paymentDate,
                    paymentType: 'RECEIVED',
                    customerCode: selectedCustomer.code,
                    customerName: selectedCustomer.name,
                    linkedInvoice: invNo,
                    invoiceAmount: invTotal,
                    invoiceBalance: invBalance,
                    amount: amountToSettle,
                    paymentMode: paymentMode,
                    referenceNumber: referenceNo,
                    notes: notes,
                    chequeDate: paymentMode === 'Cheque' ? chequeDate : null,
                    status: status
                });
            }

            alert('Payments saved successfully!');
            await fetchPayments();
            await fetchStats();
            await fetchInvoices();
            setSelectedInvoices({});
            setSettleAmounts({});
            setReceivedAmount('');
            setChequeDate('');
            setReferenceNo('');
            setNotes('');
            setActiveTab('list');
        } catch (err) {
            console.error('Error saving payment:', err);
            const message = err?.response?.data?.message || err?.response?.data || 'Error saving payment. Please try again.';
            alert(message);
        } finally {
            setIsLoading(false);
        }
    };

    // ==========================================
    // COMPUTED VALUES
    // ==========================================
    const customerInvoices = useMemo(() => {
        if (!selectedCustomer) return [];
        return invoicesList.filter(inv => inv.customerCode === selectedCustomer.code && inv.balance > 0);
    }, [selectedCustomer, invoicesList]);

    const customerBalance = useMemo(() =>
        customerInvoices.reduce((sum, inv) => sum + inv.balance, 0),
    [customerInvoices]);

    const totalSettlement = useMemo(() =>
        Object.keys(selectedInvoices).reduce((sum, k) => selectedInvoices[k] ? sum + (parseFloat(settleAmounts[k]) || 0) : sum, 0),
    [selectedInvoices, settleAmounts]);

    const selectedCount = Object.values(selectedInvoices).filter(Boolean).length;

    // ==========================================
    // RENDER HELPERS
    // ==========================================
    const renderStatusBadge = (status) => {
        const styles = {
            'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Partial': 'bg-orange-50 text-orange-700 border-orange-200',
            'Pending': 'bg-yellow-50 text-yellow-700 border-yellow-200',
            'Cancelled': 'bg-red-50 text-red-700 border-red-200',
        };
        return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[status] || styles['Pending']}`}>
                {status}
            </span>
        );
    };

    const renderTypeBadge = (type) => {
        if (type === 'Received') {
            return <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><ArrowDownRight size={12} /> Received</span>;
        }
        return <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><ArrowUpRight size={12} /> Made</span>;
    };

    const renderPaymentModeIcon = (mode) => {
        switch (mode) {
            case 'Cash': return <Banknote size={14} className="text-emerald-500" />;
            case 'Card': return <CreditCard size={14} className="text-blue-500" />;
            case 'Bank Transfer': return <Building size={14} className="text-purple-500" />;
            case 'Cheque': return <Receipt size={14} className="text-orange-500" />;
            default: return <Wallet size={14} className="text-slate-500" />;
        }
    };

    // ==========================================
    // RENDER
    // ==========================================
    return (
        <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative" onClick={() => setIsCustomerOpen(false)}>

            <main className="flex-1 flex flex-col w-full print:hidden">

                <div className="p-4 md:p-6 space-y-6">

                    {/* HEADER */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Sales &gt; Payments</div>
                            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <DollarSign className="text-[#F5C742]" size={28} />
                                Payments
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">Record and track all incoming and outgoing payments</p>
                        </div>
                    </div>

                    {/* STATS CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Today's Receipts</p>
                                    <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.todayReceived.toLocaleString()}</h3>
                                    <p className="text-[10px] text-slate-400 mt-1">Payments received today</p>
                                </div>
                                <div className="p-2 bg-[#F5C742] rounded text-slate-900">
                                    <DollarSign size={20} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">This Month</p>
                                    <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.thisMonthReceived.toLocaleString()}</h3>
                                    <p className="text-[10px] text-slate-400 mt-1">January 2026</p>
                                </div>
                                <div className="p-2 bg-emerald-50 rounded text-emerald-600">
                                    <TrendingUp size={20} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Pending Collection</p>
                                    <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.pendingAmount.toLocaleString()}</h3>
                                    <p className="text-[10px] text-slate-400 mt-1">Outstanding balance</p>
                                </div>
                                <div className="p-2 bg-orange-50 rounded text-orange-600">
                                    <Clock size={20} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Total Transactions</p>
                                    <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalPayments}</h3>
                                    <p className="text-[10px] text-slate-400 mt-1">This period</p>
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
                            { id: 'list', label: 'Payment List' },
                            { id: 'create', label: 'Record Payment' }
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
                                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16} /> Payment Filters</h3>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                                    <div className="md:col-span-2 relative">
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                                        <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                                        <input type="text" placeholder="Search payments..." className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-[#F5C742]" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Range</label>
                                        <select className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600">
                                            <option>All Time</option>
                                            <option>Today</option>
                                            <option>This Week</option>
                                            <option>This Month</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Status</label>
                                        <select className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600">
                                            <option>All Status</option>
                                            <option>Completed</option>
                                            <option>Partial</option>
                                            <option>Pending</option>
                                        </select>
                                    </div>
                                    <div>
                                        <button
                                            onClick={handleCreateNew}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm transition-colors"
                                        >
                                            <Plus size={14} /> New Payment
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* TABLE */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase">Payment No</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase">Date</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase">Customer/Vendor</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice/PO</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Invoice Amount</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Paid Amount</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase">Mode</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase">Status</th>
                                            <th className="px-4 py-3 font-semibold text-xs uppercase text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paymentsList.map((payment) => (
                                            <tr key={payment.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => handleViewPayment(payment)}>
                                                <td className="px-4 py-3 font-medium text-slate-700">{payment.paymentNo}</td>
                                                <td className="px-4 py-3 text-slate-500">{payment.date}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-700">{payment.customerName}</div>
                                                    <div className="text-[10px] text-slate-400">{payment.customerCode}</div>
                                                </td>
                                                <td className="px-4 py-3 text-blue-600 font-medium">{payment.invoiceNo}</td>
                                                <td className="px-4 py-3 text-right text-slate-600">AED {payment.invoiceAmount.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-bold text-emerald-600">AED {payment.amount.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1 text-slate-600">
                                                        {renderPaymentModeIcon(payment.mode)}
                                                        {payment.mode}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">{renderStatusBadge(payment.status)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                        <button onClick={() => handleViewPayment(payment)} title="View" className="p-1 hover:bg-slate-200 rounded text-slate-500"><Eye size={14} /></button>
                                                        {payment.status !== 'Completed' && (
                                                            <button onClick={() => handleLoadPayment(payment)} title="Edit" className="p-1 hover:bg-slate-200 rounded text-slate-500"><Edit size={14} /></button>
                                                        )}
                                                        <button onClick={() => handlePrint(payment)} title="Print" className="p-1 hover:bg-slate-200 rounded text-slate-500"><Printer size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {paymentsList.length === 0 && (
                                            <tr>
                                                <td colSpan="10" className="text-center py-8 text-slate-400">No payments found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ================= TAB: RECORD PAYMENT ================= */}
                    {activeTab === 'create' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">

                            {/* LEFT COLUMN — 2/3 */}
                            <div className="lg:col-span-2 space-y-6">

                                {/* 1. Customer Selection & Balance Card */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Customer <span className="text-red-500">*</span></label>
                                    <div className="mb-6 relative">
                                        <div
                                            onClick={(e) => { e.stopPropagation(); setIsCustomerOpen(!isCustomerOpen); }}
                                            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded bg-white flex justify-between items-center cursor-pointer hover:border-yellow-400 transition-all"
                                        >
                                            {selectedCustomer
                                                ? <span className="font-bold text-slate-700">{selectedCustomer.code} - {selectedCustomer.name}</span>
                                                : <span className="text-slate-400">Search or Select Customer...</span>}
                                            <ChevronDown size={14} className="text-slate-400" />
                                        </div>
                                        {isCustomerOpen && (
                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-50 mt-1 max-h-60 overflow-y-auto">
                                                {customersList.map(c => (
                                                    <div key={c.id} onClick={() => handleSelectCustomer(c)} className="px-3 py-2.5 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                                                        <span className="font-bold text-slate-800">{c.code}</span> <span className="text-slate-500">- {c.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {selectedCustomer && (
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center gap-3">
                                            <div className="bg-blue-100 p-2.5 rounded-full text-blue-600"><DollarSign size={20} /></div>
                                            <div>
                                                <p className="text-sm font-bold text-blue-800">Outstanding Balance</p>
                                                <p className="text-2xl font-bold text-blue-600">AED {customerBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 2. Outstanding Invoices Table */}
                                {selectedCustomer && (
                                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="p-4 border-b border-slate-200 bg-yellow-50 flex justify-between items-center">
                                            <div>
                                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                                    <FileText size={16} className="text-yellow-600" /> Outstanding Invoices
                                                </h3>
                                                <p className="text-xs text-slate-500">Select invoices to settle in this payment</p>
                                            </div>
                                            <button
                                                onClick={() => handleSelectAllInvoices({ target: { checked: selectedCount < customerInvoices.length } })}
                                                className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
                                            >
                                                {selectedCount === customerInvoices.length && customerInvoices.length > 0 ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-4 py-3 w-10 text-center">
                                                            <input type="checkbox" onChange={handleSelectAllInvoices}
                                                                checked={customerInvoices.length > 0 && selectedCount === customerInvoices.length}
                                                                className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500" />
                                                        </th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice No</th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice Date</th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase">Due Date</th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Invoice Amount</th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Outstanding</th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-center">Status</th>
                                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right w-36">Amount to Settle</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {customerInvoices.length > 0 ? customerInvoices.map(inv => {
                                                        const isSelected = !!selectedInvoices[inv.invoiceNo];
                                                        const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
                                                        return (
                                                            <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-yellow-50/50' : ''}`}>
                                                                <td className="px-4 py-3 text-center">
                                                                    <input type="checkbox" checked={isSelected}
                                                                        onChange={(e) => handleInvoiceSelection(inv, e.target.checked)}
                                                                        className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500 w-4 h-4 cursor-pointer" />
                                                                </td>
                                                                <td className="px-4 py-3 font-medium text-slate-700">{inv.invoiceNo}</td>
                                                                <td className="px-4 py-3 text-slate-500 text-xs">{inv.invoiceDate || '-'}</td>
                                                                <td className="px-4 py-3 text-xs">
                                                                    <span className={isOverdue ? 'text-red-500 font-bold' : 'text-slate-500'}>{inv.dueDate || '-'}</span>
                                                                    {isOverdue && <span className="block text-[9px] text-red-400">Overdue</span>}
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-slate-600 font-medium">AED {inv.total.toLocaleString()}</td>
                                                                <td className="px-4 py-3 text-right font-bold text-orange-600">AED {inv.balance.toLocaleString()}</td>
                                                                <td className="px-4 py-3 text-center">
                                                                    {isOverdue
                                                                        ? <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">Overdue</span>
                                                                        : <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">Current</span>}
                                                                </td>
                                                                <td className="px-4 py-2 text-right">
                                                                    {isSelected ? (
                                                                        <input type="number" value={settleAmounts[inv.invoiceNo] || ''}
                                                                            onChange={(e) => handleSettleAmountChange(inv.invoiceNo, e.target.value, inv.balance)}
                                                                            className="w-full text-right text-xs font-bold border border-slate-300 rounded px-2 py-1.5 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
                                                                            placeholder="0.00" />
                                                                    ) : (
                                                                        <button onClick={() => handleInvoiceSelection(inv, true)}
                                                                            className="text-xs text-yellow-600 font-bold hover:underline">Settle Full</button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    }) : (
                                                        <tr><td colSpan="8" className="px-4 py-12 text-center text-slate-400">
                                                            <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                                                            No outstanding invoices found.
                                                        </td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT COLUMN — 1/3 */}
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
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Receipt Date <span className="text-red-500">*</span></label>
                                                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                                                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Received Amount (Auto-Allocate) <span className="text-red-500">*</span></label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">AED</span>
                                                    <input type="number" value={receivedAmount}
                                                        onChange={(e) => handleAutoAllocate(e.target.value)}
                                                        placeholder="0.00"
                                                        className="w-full pl-10 pr-3 py-2 text-sm font-bold border border-slate-200 rounded focus:border-[#F5C742] outline-none" />
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">Entering amount automatically selects oldest invoices.</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Receipt No.</label>
                                                    <input type="text" value={paymentNo} readOnly
                                                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-500" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Method</label>
                                                    <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                                                        className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white">
                                                        <option>Cash</option>
                                                        <option>Bank Transfer</option>
                                                        <option>Cheque</option>
                                                        <option>Card</option>
                                                        <option>Online</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {paymentMode === 'Cheque' && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Cheque Date <span className="text-red-500">*</span></label>
                                                    <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)}
                                                        className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Reference / Cheque No.</label>
                                                <input type="text" value={referenceNo} onChange={e => setReferenceNo(e.target.value)}
                                                    placeholder="e.g. TXN-123456"
                                                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                                                <textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)}
                                                    placeholder="Enter payment notes..."
                                                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none resize-none"></textarea>
                                            </div>

                                            <div className="pt-4 border-t border-slate-100">
                                                <div className="flex justify-between items-center mb-4">
                                                    <span className="text-sm font-bold text-slate-600">Total Settlement</span>
                                                    <span className="text-xl font-bold text-[#F5C742]">AED {totalSettlement.toLocaleString()}</span>
                                                </div>
                                                <button onClick={handleSave} disabled={isLoading || !selectedCustomer || totalSettlement <= 0}
                                                    className={`w-full bg-[#F5C742] text-slate-900 font-bold py-3 rounded-md hover:bg-yellow-400 transition-colors shadow-sm flex items-center justify-center gap-2 ${isLoading || totalSettlement <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                    <Save size={16} /> {isLoading ? 'Processing...' : 'Record Payment'}
                                                </button>
                                                <button onClick={() => handlePrint({ paymentNo, date: paymentDate, customerName: selectedCustomer?.name, customerCode: selectedCustomer?.code, amount: totalSettlement, mode: paymentMode, reference: referenceNo, invoiceNo: Object.keys(selectedInvoices).filter(k => selectedInvoices[k]).join(', '), notes })}
                                                    className="w-full mt-3 bg-white border border-slate-200 text-slate-600 font-bold py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-xs">
                                                    <Printer size={14} /> Print Receipt
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. Recent Payments */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Recent Payments</h3>
                                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                        {paymentsList.length > 0 ? paymentsList.slice(0, 10).map((p, i) => (
                                            <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-yellow-100 transition-colors">
                                                <div className="mt-0.5 min-w-[24px]">
                                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                                        <CheckCircle2 size={12} />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-bold text-slate-800 text-xs truncate">{p.customerName}</p>
                                                        <span className="text-xs font-bold text-emerald-600 px-1.5 py-0.5 bg-emerald-50 rounded">AED {(p.amount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <p className="text-[10px] text-slate-500">{p.paymentNo} • {p.mode}</p>
                                                        <p className="text-[10px] text-slate-400">{p.date}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-6 text-slate-400">
                                                <FileText size={24} className="mx-auto mb-1 opacity-20" />
                                                <p className="text-[10px]">No recent transactions</p>
                                            </div>
                                        )}
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

            <div className={`fixed inset-y-0 right-0 z-50 w-[500px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedPayment && (
                    <div className="h-full flex flex-col">
                        {/* Drawer Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <DollarSign size={18} className="text-slate-500" /> Payment Details
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">{selectedPayment.paymentNo}</p>
                            </div>
                            <button onClick={handleCloseDrawer} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Drawer Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Amount & Status */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="border border-slate-200 rounded-lg p-4 text-center bg-white shadow-sm">
                                    <p className="text-2xl font-bold text-emerald-600">AED {selectedPayment.amount.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Amount Paid</p>
                                </div>
                                <div className="border border-slate-200 rounded-lg p-4 text-center flex flex-col items-center justify-center bg-white shadow-sm">
                                    {renderStatusBadge(selectedPayment.status)}
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-2">Status</p>
                                </div>
                            </div>

                            {/* Payment Info */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Payment Information</h4>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Payment No</p>
                                        <p className="text-xs font-medium text-slate-700">{selectedPayment.paymentNo}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Payment Date</p>
                                        <p className="text-xs font-medium text-slate-700">{selectedPayment.date}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Payment Mode</p>
                                        <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
                                            {renderPaymentModeIcon(selectedPayment.mode)} {selectedPayment.mode}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Reference</p>
                                        <p className="text-xs font-medium text-slate-700">{selectedPayment.reference}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Customer Info */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Customer</h4>
                                <p className="text-sm font-bold text-slate-800">{selectedPayment.customerName}</p>
                                <p className="text-xs text-slate-500">{selectedPayment.customerCode}</p>
                            </div>

                            {/* Invoice Info */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Invoice Details</h4>
                                <div className="grid grid-cols-2 gap-y-3">
                                    <div>
                                        <p className="text-[10px] text-slate-400">Invoice No</p>
                                        <p className="text-xs font-bold text-blue-600">{selectedPayment.invoiceNo}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">Invoice Amount</p>
                                        <p className="text-xs font-medium text-slate-700">AED {selectedPayment.invoiceAmount.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">This Payment</p>
                                        <p className="text-xs font-bold text-emerald-600">AED {selectedPayment.amount.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">Remaining</p>
                                        <p className="text-xs font-bold text-red-600">AED {(selectedPayment.invoiceAmount - selectedPayment.amount).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Drawer Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3 sticky bottom-0">
                            {selectedPayment.status !== 'Completed' && (
                                <button onClick={() => { handleCloseDrawer(); handleLoadPayment(selectedPayment); }} className="flex-1 px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm flex items-center justify-center gap-2 transition-colors">
                                    <Edit size={14} /> Edit Payment
                                </button>
                            )}
                            <button onClick={() => handlePrint(selectedPayment)} className={`px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-2 transition-colors ${selectedPayment.status === 'Completed' ? 'flex-1 justify-center' : ''}`}>
                                <Printer size={14} /> Print
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
};

export default Payment;
