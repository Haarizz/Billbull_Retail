import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    DollarSign, TrendingUp, Filter, Search, Plus, MapPin, Tag,
    MoreHorizontal, Download, Upload, FileText, ChevronLeft,
    PieChart, Briefcase, Trash, Edit, X
} from 'lucide-react';
import { getVendors } from '../../api/vendorsApi';
import { getCostCenters, getAccounts, getBankAccounts, getTransactions } from '../../api/ledgerApi';
import { fetchExpenses, createExpense, updateExpense, deleteExpense } from '../../api/expensesApi';
import toast from 'react-hot-toast';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import CurrencyAmount, { CurrencySymbol } from '../../components/CurrencyAmount';
import { formatDisplayDate } from '../../utils/dateUtils';
import LedgerAccountCreateModal from '../../components/common/LedgerAccountCreateModal';
import PaginationFooter from '../../components/common/PaginationFooter';
import TableSkeleton from '../../components/common/TableSkeleton';


const Expenses = () => {
    const { company } = useCompany();
    useBranch(); // for refetch listener context
    const currency = company?.currency || 'AED';
    // --- MOCK DATA REMOVED ---


    const [categories, setCategories] = useState(['Utilities', 'Rent', 'Marketing', 'Operational', 'Office Supplies', 'Travel']);
    // const costCenters = ['Electric', 'Facility', 'Digital Marketing', 'Cleaning', 'Admin', 'Sales'];
    const [locations, setLocations] = useState(['Downtown', 'Mall Branch', 'All Locations']);
    const taxRates = [0, 5];

    // --- DATA FETCHING ---
    const [vendors, setVendors] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    // BB-034A: GL accounts for expense account ledger selector
    const [glAccounts, setGlAccounts] = useState([]);
    const [allAccounts, setAllAccounts] = useState([]);
    const [glAccountSearch, setGlAccountSearch] = useState('');
    const [glAccountOpen, setGlAccountOpen] = useState(false);
    const [isAccountCreateOpen, setIsAccountCreateOpen] = useState(false);
    const glAccountRef = useRef(null);

    const isSelectableExpenseAccount = (account) => {
        if (!account || account.status === 'archived' || account.isGroup === true) return false;
        return (account.accountGroup || '').toLowerCase() === 'expenses'
            || (account.accountType || '').toLowerCase() === 'expense';
    };

    const loadReferenceData = async () => {
        const [vendorData, costCenterData, glData] = await Promise.all([
            getVendors(),
            getCostCenters(),
            getAccounts()
        ]);
        const accountData = Array.isArray(glData) ? glData : [];
        setVendors(Array.isArray(vendorData) ? vendorData : []);
        setCostCenters(Array.isArray(costCenterData) ? costCenterData : []);
        setAllAccounts(accountData);
        setGlAccounts(accountData.filter(isSelectableExpenseAccount));
        return accountData;
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vendorData, costCenterData, glData, bankData] = await Promise.all([
    getVendors(),
    getCostCenters(),
    getAccounts(),
    getBankAccounts().catch(() => [])
]);

setVendors(vendorData);
setCostCenters(costCenterData);

// Filter to expense-type accounts for the selector
setGlAccounts(Array.isArray(glData) ? glData.filter(a => a.status !== 'archived') : []);

setPayAccounts(Array.isArray(bankData) ? bankData : []);

// Needed by develop branch fallback expense loader
setAllAccounts(Array.isArray(glData) ? glData : []);
            } catch (error) {
                console.error("Failed to fetch data", error);
            }
        };
        fetchData();
    }, []);

    const [expenses, setExpenses] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // --- STATE ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeActionId, setActiveActionId] = useState(null);
    const [editingId, setEditingId] = useState(null);

    const [newExpense, setNewExpense] = useState({
        date: new Date().toISOString().split('T')[0],
        vendor: '',
        category: '',
        glAccountId: '',
        costCenter: '',
        location: '',
        amount: '',
        taxRate: 5,
        status: 'Pending',
        paymentMode: 'Cash',
        paymentAccountId: '',
        notes: ''
    });

    // QA-054: cash & bank ledgers loaded from the COA so the user can pick
    // which account funded the expense. List is filtered by paymentMode in
    // the dropdown (Cash → cash accounts, others → bank accounts).
    const [payAccounts, setPayAccounts] = useState([]);
    const PAYMENT_MODES = ['Cash', 'Card', 'Credit', 'Bank Transfer', 'Online Payment'];
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('This Month');
    const [filterLocation, setFilterLocation] = useState('All Locations');
    const [filterCategory, setFilterCategory] = useState('All Categories');
    const [filterCostCenter, setFilterCostCenter] = useState('All Cost Centers');
    const [filterTax, setFilterTax] = useState('All Tax Rates');

    // --- EFFECTS ---
    useEffect(() => {
        loadExpenses();
    }, []);

    // Refetch when the global Branch Selector changes the active branch.
    useEffect(() => {
        const handler = () => loadExpenses();
        window.addEventListener('billbull:branch-changed', handler);
        return () => window.removeEventListener('billbull:branch-changed', handler);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (glAccountRef.current && !glAccountRef.current.contains(e.target)) {
                setGlAccountOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadExpenses = async () => {
        setIsLoading(true);
        try {
            let data = await fetchExpenses();
            
            // Fallback: If no expenses from dedicated API, try filtering from global transactions
            if (!data || data.length === 0) {
                console.warn("Expenses API returned empty. Attempting fallback from ledger transactions...");
                const allTransactions = await getTransactions();
                
                // We define expenses as transactions associated with expense-type accounts 
                // OR specific transaction types like 'EXPENSE', 'PURCHASE_INVOICE'.
                const expAccounts = glAccounts.filter(a => 
                    (a.accountType || '').toLowerCase().includes('expense') || 
                    (a.accountGroup || '').toLowerCase().includes('expense')
                );
                const expAccountCodes = new Set(expAccounts.map(a => a.code));

                const expenseTransactions = allTransactions.filter(t => 
                    t.type === 'EXPENSE' || 
                    t.type === 'PURCHASE_INVOICE' ||
                    t.type === 'PAYMENT_VOUCHER' ||
                    expAccountCodes.has(t.accountCode)
                );

                if (expenseTransactions.length > 0) {
                    data = expenseTransactions.map(t => ({
                        id: t.id,
                        date: t.transactionDate,
                        vendor: t.accountName || 'Miscellaneous',
                        category: t.accountGroup || 'Operational',
                        glAccountId: expAccounts.find(a => a.code === t.accountCode)?.id || '',
                        costCenter: t.costCenterName || '',
                        location: t.branch || 'Head Office',
                        amount: parseFloat(t.debitAmount || 0),
                        taxRate: 0, // Placeholder
                        taxAmount: 0,
                        total: parseFloat(t.debitAmount || 0),
                        status: 'Paid',
                        notes: t.description || ''
                    }));
                }
            }
            
            setExpenses(data);
        } catch (error) {
            console.error("Failed to load expenses", error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- COMPUTED ---
    const filteredExpenses = useMemo(() => {
        return expenses.filter(item => {
            const matchesSearch = (item.vendor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesLocation = filterLocation === 'All Locations' || item.location === filterLocation;
            const matchesCategory = filterCategory === 'All Categories' || item.category === filterCategory;
            const matchesCostCenter = filterCostCenter === 'All Cost Centers' || item.costCenter === filterCostCenter;
            const matchesTax = filterTax === 'All Tax Rates' || (item.taxRate || 0).toString() === filterTax;

            return matchesSearch && matchesLocation && matchesCategory && matchesCostCenter && matchesTax;
        });
    }, [expenses, searchTerm, filterLocation, filterCategory, filterCostCenter, filterTax]);

    const LIST_PAGE_SIZE = 30;
    const [listPage, setListPage] = useState(0);
    useEffect(() => { setListPage(0); }, [searchTerm, filterLocation, filterCategory, filterCostCenter, filterTax]);
    const pagedExpenses = useMemo(
        () => filteredExpenses.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
        [filteredExpenses, listPage]
    );

    const stats = useMemo(() => {
        const totalExpenses = filteredExpenses.reduce((sum, item) => sum + (item.total || 0), 0);
        const totalTax = filteredExpenses.reduce((sum, item) => sum + (item.taxAmount || 0), 0);

        // Find top category
        const catCounts = {};
        let maxCount = 0;
        let topCat = 'None';
        let topCatAmount = 0;

        filteredExpenses.forEach(item => {
            if (item.category) {
                catCounts[item.category] = (catCounts[item.category] || 0) + (item.total || 0);
                if (catCounts[item.category] > maxCount) {
                    maxCount = catCounts[item.category];
                    topCat = item.category;
                    topCatAmount = maxCount;
                }
            }
        });

        const activeLocations = new Set(filteredExpenses.map(e => e.location).filter(Boolean)).size;

        return {
            totalExpenses: totalExpenses.toFixed(2),
            count: filteredExpenses.length,
            totalTax: totalTax.toFixed(2),
            topCategory: topCat,
            topCategoryAmount: topCatAmount.toFixed(2),
            activeLocations
        };
    }, [filteredExpenses]);

    // --- HANDLERS ---
    const handleAddExpense = async () => {
        const amount = parseFloat(newExpense.amount) || 0;
        // tax and total are handled by backend, but we can send them if needed or rely on backend calc
        // Backend handles calc based on service logic, sending raw inputs is best.

        try {
            if (editingId) {
                // Update Existing
                const updated = await updateExpense(editingId, newExpense);
                setExpenses(expenses.map(e => e.id === editingId ? updated : e));
            } else {
                // Create New
                const created = await createExpense(newExpense);
                setExpenses([created, ...expenses]);
            }
            closeModal();
        } catch (error) {
            console.error("Failed to save expense", error);
            toast.error("Failed to save expense. Please try again.");
        }
    };

    const handleEdit = (expense) => {
        setNewExpense({
            date: expense.date,
            vendor: expense.vendor,
            category: expense.category,
            glAccountId: expense.glAccountId || '',
            costCenter: expense.costCenter,
            location: expense.location,
            amount: expense.amount,
            taxRate: expense.taxRate,
            status: expense.status || 'Pending',
            paymentMode: expense.paymentMode || 'Cash',
            paymentAccountId: expense.paymentAccountId || '',
            notes: expense.notes
        });
        setGlAccountSearch('');
        setEditingId(expense.id);
        setIsModalOpen(true);
        setActiveActionId(null);
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this expense?")) {
            try {
                await deleteExpense(id);
                setExpenses(expenses.filter(e => e.id !== id));
                setActiveActionId(null);
            } catch (error) {
                console.error("Failed to delete expense", error);
                toast.error("Failed to delete expense.");
            }
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setGlAccountSearch('');
        setGlAccountOpen(false);
        setNewExpense({
            date: new Date().toISOString().split('T')[0],
            vendor: '',
            category: '',
            glAccountId: '',
            costCenter: '',
            location: '',
            amount: '',
            taxRate: 5,
            status: 'Pending',
            paymentMode: 'Cash',
            paymentAccountId: '',
            notes: ''
        });
    };

    const handleLedgerAccountCreated = async (createdAccount) => {
        let account = createdAccount;
        try {
            const refreshedAccounts = await loadReferenceData();
            account = refreshedAccounts.find(item => item.id === createdAccount?.id) || createdAccount;
        } catch (error) {
            console.error("Failed to refresh expense ledger accounts", error);
            if (createdAccount?.id) {
                setAllAccounts(prev => [...prev, createdAccount]);
                if (isSelectableExpenseAccount(createdAccount)) {
                    setGlAccounts(prev => [...prev, createdAccount]);
                }
            }
        }

        if (account?.id) {
            setNewExpense(prev => ({ ...prev, glAccountId: String(account.id) }));
            setGlAccountSearch('');
            setGlAccountOpen(false);
        }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            Paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
            Pending: 'bg-yellow-50 text-yellow-700 border-yellow-100',
            Draft: 'bg-slate-50 text-slate-600 border-slate-200'
        };
        return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[status] || styles.Draft}`}>
                {status?.toLowerCase()}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <DollarSign className="text-[#F5C742]" size={28} />
                        Expenses / Ledgers
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Track and categorize all business expenses with tax management</p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                        <Download size={16} /> Export
                    </button>
                    <button onClick={() => { setEditingId(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-xs font-bold shadow-sm hover:bg-emerald-700">
                        <Plus size={16} /> Add Expense
                    </button>
                </div>
            </div>

            {/* STATS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Total Expenses</p>
                        <CurrencyAmount value={stats.totalExpenses} currency={currency} className="text-2xl font-bold text-slate-800" />
                        <p className="text-[10px] text-slate-400 mt-1">{stats.count} transactions</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                        <DollarSign size={20} />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Total Tax Paid</p>
                        <CurrencyAmount value={stats.totalTax} currency={currency} className="text-2xl font-bold text-slate-800" />
                        <p className="text-[10px] text-slate-400 mt-1">VAT & other taxes</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                        <FileText size={20} />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Top Category</p>
                        <h3 className="text-xl font-bold text-slate-800">{stats.topCategory}</h3>
                        <p className="text-[10px] text-slate-400 mt-1"><CurrencyAmount value={stats.topCategoryAmount} currency={currency} /></p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                        <PieChart size={20} />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Locations</p>
                        <h3 className="text-2xl font-bold text-slate-800">{stats.activeLocations}</h3>
                        <p className="text-[10px] text-slate-400 mt-1">Active locations</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                        <MapPin size={20} />
                    </div>
                </div>
            </div>

            {/* FILTERS & LIST */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">

                {/* FILTERS */}
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16} /> Filters & Search</h3>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                        <div className="md:col-span-2 relative">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                            <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search expenses..."
                                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Range</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium bg-white"
                                value={filterDate}
                                onChange={(e) => setFilterDate(e.target.value)}
                            >
                                <option>This Month</option>
                                <option>Last Month</option>
                                <option>This Year</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Location</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium bg-white"
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                            >
                                <option>All Locations</option>
                                {locations.map(l => <option key={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Category</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium bg-white"
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                            >
                                <option>All Categories</option>
                                {categories.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Cost Center</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium bg-white"
                                value={filterCostCenter}
                                onChange={(e) => setFilterCostCenter(e.target.value)}
                            >
                                <option>All Cost Centers</option>
                                {costCenters.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Tax Rate</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium bg-white"
                                value={filterTax}
                                onChange={(e) => setFilterTax(e.target.value)}
                            >
                                <option>All Tax Rates</option>
                                {taxRates.map(t => <option key={t} value={t}>{t}%</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* TABLE */}
                <h3 className="text-sm font-bold text-slate-700 mb-4">Expense Ledger</h3>
                <div className="overflow-x-auto border border-slate-100 rounded-lg min-h-[300px]">
                    <div onClick={() => setActiveActionId(null)} className={`fixed inset-0 z-0 ${activeActionId ? 'block' : 'hidden'}`} />

                    <table className="bb-nowrap-table w-full relative z-10">
                        <thead className="bg-[#F7F7FA] border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor / Payee</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">GL Account</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost Center</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax %</th>
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</th>
                                <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading && <TableSkeleton cols={7} rows={8} />}
                            {pagedExpenses.map((expense) => (
                                <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDisplayDate(expense.date)}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{expense.vendor}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${expense.category === 'Utilities' ? 'bg-blue-50 text-blue-600' :
                                            expense.category === 'Rent' ? 'bg-green-50 text-green-600' :
                                                expense.category === 'Marketing' ? 'bg-pink-50 text-pink-600' :
                                                    'bg-purple-50 text-purple-600'
                                            }`}>{expense.category}</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600">
                                        {(() => { const a = allAccounts.find(acc => String(acc.id) === String(expense.glAccountId)); return a ? <span className="font-mono text-[10px]">{a.code}<span className="font-sans font-normal ml-1 text-slate-500">{a.name}</span></span> : <span className="text-slate-300">-</span>; })()}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600">{expense.costCenter}</td>
                                    <td className="px-4 py-3 text-xs text-slate-600">{expense.location}</td>
                                    <td className="px-4 py-3 text-xs text-slate-600">
                                        {expense.branch?.name ? (
                                            <>
                                                <div className="font-medium">{expense.branch.name}</div>
                                                {expense.branch.code && <div className="text-[10px] text-slate-400">{expense.branch.code}</div>}
                                            </>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600 text-right"><CurrencyAmount value={expense.amount || 0} currency={currency} /></td>
                                    <td className="px-4 py-3 text-xs text-slate-600 text-right">{expense.taxRate}%</td>
                                    <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right"><CurrencyAmount value={expense.total || 0} currency={currency} /></td>
                                    <td className="px-4 py-3 text-center"><StatusBadge status={expense.status} /></td>
                                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{expense.notes}</td>
                                    <td className="px-4 py-3 text-center relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveActionId(activeActionId === expense.id ? null : expense.id);
                                            }}
                                            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200"
                                        >
                                            <MoreHorizontal size={14} />
                                        </button>

                                        {/* DROPDOWN */}
                                        {activeActionId === expense.id && (
                                            <div className="absolute right-8 top-0 mt-8 w-32 bg-white border border-slate-200 rounded-md shadow-lg z-50 text-left overflow-hidden">
                                                <button
                                                    onClick={() => handleEdit(expense)}
                                                    className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50"
                                                >
                                                    <Edit size={14} className="text-blue-500" /> Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(expense.id)}
                                                    className="w-full px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                >
                                                    <Trash size={14} /> Delete
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <PaginationFooter
                        page={listPage}
                        size={LIST_PAGE_SIZE}
                        totalElements={filteredExpenses.length}
                        totalPages={Math.ceil(filteredExpenses.length / LIST_PAGE_SIZE)}
                        onPageChange={setListPage}
                    />
                </div>
            </div>

            {/* ADD / EDIT EXPENSE MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Expense' : 'Add New Expense'}</h3>
                                <p className="text-xs text-slate-500">{editingId ? 'Update expense details' : 'Create a new expense entry with tax calculation and cost center allocation.'}</p>
                            </div>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="p-6 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600"
                                    value={newExpense.date}
                                    onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Vendor / Payee</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.vendor}
                                    onChange={(e) => {
                                        const selectedName = e.target.value;
                                        const selectedVendor = vendors.find(v => v.name === selectedName);

                                        if (selectedVendor) {
                                            const vCategory = selectedVendor.category || '';
                                            const vLocation = selectedVendor.country || '';

                                            // Dynamically add category if missing
                                            if (vCategory && !categories.includes(vCategory)) {
                                                setCategories(prev => [...prev, vCategory]);
                                            }
                                            // Dynamically add location if missing
                                            if (vLocation && !locations.includes(vLocation)) {
                                                setLocations(prev => [...prev, vLocation]);
                                            }

                                            setNewExpense({
                                                ...newExpense,
                                                vendor: selectedName,
                                                category: vCategory,
                                                location: vLocation
                                            });
                                        } else {
                                            setNewExpense({ ...newExpense, vendor: selectedName });
                                        }
                                    }}
                                >
                                    <option value="">Select Vendor</option>
                                    {vendors.map(v => (
                                        <option key={v.id} value={v.name}>{v.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Category</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.category}
                                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                >
                                    <option value="">Select category</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Cost Center</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.costCenter}
                                    onChange={(e) => setNewExpense({ ...newExpense, costCenter: e.target.value })}
                                >
                                    <option value="">Select cost center</option>
                                    {costCenters.map(c => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* BB-034A: GL Account searchable selector */}
                            <div ref={glAccountRef} className="relative">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <label className="block text-xs font-bold text-slate-500">
                                        Expense Account Ledger <span className="text-red-400">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        title="Create account ledger"
                                        onClick={() => { setGlAccountOpen(false); setIsAccountCreateOpen(true); }}
                                        className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
                                    >
                                        <Plus size={13} />
                                    </button>
                                </div>
                                {newExpense.glAccountId ? (
                                    <div className="w-full px-3 py-2 text-xs border border-emerald-400 rounded-md bg-emerald-50 text-slate-700 font-medium flex items-center justify-between">
                                        <span className="truncate flex-1">
                                            {(() => { const a = allAccounts.find(acc => String(acc.id) === String(newExpense.glAccountId)); return a ? `${a.code} - ${a.name}` : newExpense.glAccountId; })()}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => { setNewExpense({ ...newExpense, glAccountId: '' }); setGlAccountSearch(''); }}
                                            className="ml-2 text-slate-400 hover:text-red-500 shrink-0"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                                        <input
                                            type="text"
                                            placeholder="Search by code or account name..."
                                            value={glAccountSearch}
                                            onChange={e => { setGlAccountSearch(e.target.value); setGlAccountOpen(true); }}
                                            onFocus={() => setGlAccountOpen(true)}
                                            className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600"
                                        />
                                    </div>
                                )}
                                {glAccountOpen && !newExpense.glAccountId && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                        {glAccounts
                                            .filter(a => {
                                                if (!glAccountSearch) return true;
                                                const q = glAccountSearch.toLowerCase();
                                                return a.code?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q);
                                            })
                                            .map(acc => (
                                                <div
                                                    key={acc.id}
                                                    onMouseDown={() => { setNewExpense({ ...newExpense, glAccountId: String(acc.id) }); setGlAccountSearch(''); setGlAccountOpen(false); }}
                                                    className="px-3 py-2 text-xs cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2"
                                                >
                                                    <span className="font-mono font-bold text-slate-500 w-16 shrink-0">{acc.code}</span>
                                                    <span className="text-slate-700 truncate">{acc.name}</span>
                                                    {acc.accountGroup && <span className="ml-auto text-[10px] text-slate-400 shrink-0">{acc.accountGroup}</span>}
                                                </div>
                                            ))}
                                        {glAccounts.filter(a => {
                                            if (!glAccountSearch) return true;
                                            const q = glAccountSearch.toLowerCase();
                                            return a.code?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q);
                                        }).length === 0 && (
                                            <div className="px-3 py-2 text-xs text-slate-400">No accounts found</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Location</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.location}
                                    onChange={(e) => setNewExpense({ ...newExpense, location: e.target.value })}
                                >
                                    <option value="">Select location</option>
                                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Amount (<CurrencySymbol currency={currency} />)</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600"
                                    value={newExpense.amount}
                                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Tax Rate (%)</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.taxRate}
                                    onChange={(e) => setNewExpense({ ...newExpense, taxRate: parseFloat(e.target.value) })}
                                >
                                    {taxRates.map(t => <option key={t} value={t}>{t}%</option>)}
                                </select>
                            </div>

                            {/* STATUS FIELD */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.status}
                                    onChange={(e) => setNewExpense({ ...newExpense, status: e.target.value })}
                                >
                                    <option value="Draft">Draft</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Paid">Paid</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Total Amount (<CurrencySymbol currency={currency} />)</label>
                                <input
                                    type="text"
                                    readOnly
                                    className="w-full px-3 py-2 text-xs border border-emerald-200 bg-emerald-50 rounded-md text-emerald-700 font-bold"
                                    value={((parseFloat(newExpense.amount) || 0) * (1 + newExpense.taxRate / 100)).toFixed(2)}
                                />
                            </div>

                            {/* QA-054: PAYMENT MODE */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Payment Mode</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.paymentMode || ''}
                                    onChange={(e) => {
                                        const mode = e.target.value;
                                        // Reset the pay-account when the mode changes so the user
                                        // doesn't accidentally keep a bank account selected after
                                        // switching to Cash (or vice-versa).
                                        setNewExpense({ ...newExpense, paymentMode: mode, paymentAccountId: '' });
                                    }}
                                >
                                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>

                            {/* QA-054: AUTO-PAY LEDGER */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Pay From Account</label>
                                <select
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 bg-white"
                                    value={newExpense.paymentAccountId || ''}
                                    onChange={(e) => setNewExpense({ ...newExpense, paymentAccountId: e.target.value })}
                                >
                                    <option value="">Auto (use default for {newExpense.paymentMode || 'mode'})</option>
                                    {payAccounts
                                        // Filter accounts to those that look right for the mode.
                                        // Cash mode → only Cash-named ledgers; everything else
                                        // (Card / Bank Transfer / Online Payment / Credit) → all
                                        // cash & bank-flagged accounts (the bank-accounts endpoint
                                        // already excludes archived rows for us).
                                        .filter(acc => {
                                            if (newExpense.paymentMode === 'Cash') {
                                                const name = (acc.name || '').toLowerCase();
                                                return name.includes('cash');
                                            }
                                            return true;
                                        })
                                        .map(acc => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.code ? `${acc.code} — ` : ''}{acc.name}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Notes / Description</label>
                                <textarea
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 text-slate-600 resize-none"
                                    rows="3"
                                    placeholder="Add notes or description..."
                                    value={newExpense.notes}
                                    onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={closeModal} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-100">
                                Cancel
                            </button>
                            <button onClick={handleAddExpense} className="px-4 py-2 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 shadow-sm">
                                {editingId ? 'Update Expense' : 'Add Expense'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <LedgerAccountCreateModal
                isOpen={isAccountCreateOpen}
                onClose={() => setIsAccountCreateOpen(false)}
                onCreated={handleLedgerAccountCreated}
                existingAccounts={allAccounts}
                defaultGroup="Expenses"
                fixedGroup
                initialName={glAccountSearch}
            />
        </div>
    );
};

export default Expenses;
