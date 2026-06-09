import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  Target,
  Activity,
  Download,
  FileSpreadsheet,
  Plus,
  ChevronDown,
  Search,
  Filter,
  Eye,
  MoreHorizontal,
  Wallet,
  TrendingUp,
  TrendingDown,
  PieChart,
  Briefcase,
  Users,
  Building2,
  Calendar,
  X,
  Check,
  Settings,
  Copy,
  Archive,
  Edit,
  CreditCard,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';

// Import API functions
import * as api from '../../api/ledgerApi';
import { useBranch } from '../../context/BranchContext';
import { useCompany } from '../../context/CompanyContext';
import { resolveCurrencyDisplayCode } from '../../utils/countryCurrencyOptions';
import { formatDisplayDate } from '../../utils/dateUtils';

// --- HELPER: CUSTOM SELECT COMPONENT ---
const CustomSelect = ({ label, placeholder, options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 bg-white text-slate-600 flex justify-between items-center cursor-pointer"
      >
        <span className={value ? "text-slate-700" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {options.map((option, idx) => (
            <div
              key={idx}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className="px-3 py-2 text-xs cursor-pointer text-slate-600 hover:bg-[#F43F5E] hover:text-white transition-colors"
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// = ::::::::::::::::::::::::::::::::::::::
// 1. CONFIGURATION (Standard Export)
// = ::::::::::::::::::::::::::::::::::::::

const ACCOUNT_COLUMNS = [
  { header: 'Code', key: 'code', width: 15 },
  { header: 'Account Name', key: 'name', width: 25 },
  { header: 'Group', key: 'group', width: 15 },
  { header: 'Branch', key: 'branch', width: 15 },
  { header: 'Cost Center', key: 'cc', width: 15 },
  { header: 'Balance', key: 'balance', width: 20 },
  { header: 'Status', key: 'status', width: 12 }
];

const GL_COLUMNS = [
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Voucher', key: 'voucher', width: 15 },
  { header: 'Type', key: 'type', width: 12 },
  { header: 'Account', key: 'accName', width: 25 },
  { header: 'Description', key: 'desc', width: 30 },
  { header: 'Debit', key: 'debit', width: 15 },
  { header: 'Credit', key: 'credit', width: 15 },
  { header: 'Balance', key: 'balance', width: 20 }
];

const COST_CENTER_COLUMNS = [
  { header: 'Code', key: 'code', width: 15 },
  { header: 'Name', key: 'name', width: 25 },
  { header: 'Manager', key: 'manager', width: 20 },
  { header: 'Branch', key: 'branch', width: 15 },
  { header: 'Budget', key: 'budget', width: 15 },
  { header: 'Spent', key: 'spent', width: 15 },
  { header: 'Status', key: 'status', width: 12 }
];

const TRANSACTION_COLUMNS = GL_COLUMNS; // Same as GL for now

const Ledger = () => {
  const { branches, defaultBranchName, activeBranch } = useBranch();
  const { company } = useCompany();
  const currency = resolveCurrencyDisplayCode(company || {});
  const [activeTab, setActiveTab] = useState('chart');
  const [loading, setLoading] = useState(true);

  // --- FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // --- GL FILTER STATES ---
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [glFilterFrom, setGlFilterFrom] = useState(firstOfMonth);
  const [glFilterTo, setGlFilterTo] = useState(today);
  const [glFilterAccount, setGlFilterAccount] = useState('');

  // --- CORE DATA STATES ---
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [glData, setGlData] = useState([]);
  const branchOptions = useMemo(() => {
    const options = new Set();

    if (defaultBranchName) {
      options.add(defaultBranchName);
    }

    branches.forEach((branch) => {
      if (branch?.name) {
        options.add(branch.name);
      }
    });

    accounts.forEach((account) => {
      if (account.branch && account.branch !== 'All Branches') {
        options.add(account.branch);
      }
    });

    costCenters.forEach((costCenter) => {
      if (costCenter.branch && costCenter.branch !== 'All Branches') {
        options.add(costCenter.branch);
      }
    });

    return Array.from(options);
  }, [accounts, branches, costCenters, defaultBranchName]);
  const branchSelectOptions = ['All Branches', ...branchOptions];

  // --- DATA MAPPERS (Backend -> UI) ---
  const formatBalance = (amount, type) => {
    const num = parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency} ${num} ${type || 'Dr'}`;
  };

  const mapAccountToUI = (acc) => ({
    ...acc,
    id: acc.id,
    code: acc.code,
    name: acc.name,
    sub: acc.subGroup,       
    group: acc.accountGroup, 
    branch: acc.branch,
    cc: acc.costCenterCode,  
    balance: formatBalance(acc.balanceAmount, acc.balanceType),
    balColor: acc.balanceType === 'Dr' ? 'text-emerald-600' : 'text-red-600',
    status: acc.status || 'active',
    description: acc.description
  });

  const mapCostCenterToUI = (cc) => ({
    ...cc,
    color: 'text-yellow-600', 
    bg: 'bg-yellow-50',
    percent: cc.budget > 0 ? Math.round((cc.spent / cc.budget) * 100) : 0
  });

  const mapTransactionToUI = (txn) => ({
    id: txn.id,
    date: txn.transactionDate,
    voucher: txn.voucherNo,
    type: txn.type,
    accCode: txn.accountCode,
    accName: txn.accountName,
    desc: txn.description,
    debit: txn.debitAmount ? `${currency} ${parseFloat(txn.debitAmount).toLocaleString()}` : '',
    credit: txn.creditAmount ? `${currency} ${parseFloat(txn.creditAmount).toLocaleString()}` : '',
    balance: formatBalance(txn.runningBalance, txn.balanceType),
    balType: txn.balanceType
  });

  // --- INITIAL DATA FETCHING ---
  const fetchData = async () => {
    try {
      const [accData, ccData, txnData] = await Promise.all([
        api.getAccounts(),
        api.getCostCenters(),
        api.getTransactions()
      ]);
      
      setAccounts(accData.map(mapAccountToUI));
      setCostCenters(ccData.map(mapCostCenterToUI));
      setGlData(txnData.map(mapTransactionToUI));

    } catch (error) {
      console.error("Failed to load ledger data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredGlData = useMemo(() => {
    return glData.filter(entry => {
      const matchesAccount = !glFilterAccount || entry.accCode === glFilterAccount || entry.accName === glFilterAccount;
      const matchesFrom = !glFilterFrom || (entry.date && entry.date >= glFilterFrom);
      const matchesTo = !glFilterTo || (entry.date && entry.date <= glFilterTo);
      return matchesAccount && matchesFrom && matchesTo;
    });
  }, [glData, glFilterAccount, glFilterFrom, glFilterTo]);


  // --- MODAL STATES ---
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false); 
  const [isCostCenterModalOpen, setIsCostCenterModalOpen] = useState(false);
  const [isViewCostCenterModalOpen, setIsViewCostCenterModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false); 
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false); 
  
  // --- ARCHIVE LOGIC STATE ---
  const [archiveType, setArchiveType] = useState(null); 
  const [itemToArchive, setItemToArchive] = useState(null); 
  
  // --- FORM STATES: ACCOUNT ---
  const [accId, setAccId] = useState(null); 
  const [accName, setAccName] = useState('');
  const [accCode, setAccCode] = useState('');
  const [accSubGroup, setAccSubGroup] = useState('');
  const [accOpeningBalance, setAccOpeningBalance] = useState('');
  const [accDescription, setAccDescription] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedCostCenter, setSelectedCostCenter] = useState('');
  const [selectedBalType, setSelectedBalType] = useState('Debit (Dr)');
  const [isActive, setIsActive] = useState(true);

  // --- FORM STATES: COST CENTER ---
  const [ccId, setCcId] = useState(null); 
  const [ccName, setCcName] = useState('');
  const [ccCode, setCcCode] = useState('');
  const [ccBranch, setCcBranch] = useState('');
  const [ccManager, setCcManager] = useState('');
  const [ccBudget, setCcBudget] = useState('');
  const [ccDescription, setCcDescription] = useState('');

  // --- FORM STATES: TRANSACTION ---
  const [txnAccount, setTxnAccount] = useState('');
  const [txnType, setTxnType] = useState('Debit');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDesc, setTxnDesc] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0]);

  // --- ACTIONS STATE ---
  const [openActionMenuId, setOpenActionMenuId] = useState(null); 
  const [openCostCenterMenuId, setOpenCostCenterMenuId] = useState(null);
  const [selectedAccountForView, setSelectedAccountForView] = useState(null); 
  const [selectedCostCenterForView, setSelectedCostCenterForView] = useState(null); 

  // --- CLICK OUTSIDE LOGIC ---
  const quickAddRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (quickAddRef.current && !quickAddRef.current.contains(event.target)) {
        setIsQuickAddOpen(false);
      }
      if (openActionMenuId !== null && !event.target.closest('.action-menu-dropdown') && !event.target.closest('.action-menu-trigger')) {
         setOpenActionMenuId(null);
      }
      if (openCostCenterMenuId !== null && !event.target.closest('.cc-action-menu-dropdown') && !event.target.closest('.cc-action-trigger')) {
         setOpenCostCenterMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openActionMenuId, openCostCenterMenuId]);

  // --- LOGIC HELPERS ---
  const parseBalance = (balString) => {
    if (!balString) return { amount: 0, type: 'Dr' };
    const amount = parseFloat(balString.replace(/[^0-9.]/g, '')) || 0;
    const type = balString.includes('Cr') ? 'Cr' : 'Dr';
    return { amount, type };
  };

  // --- SAVE HANDLERS ---

  const handleSaveCostCenter = async () => {
    if (!ccName) return alert("Cost Center Name is required");
    
    // Auto-generate code if empty e.g. CC-005
    const codeToCheck = ccCode || `CC-${String(costCenters.length + 1).padStart(3, '0')}`;
    
    const newCCData = {
      id: ccId, 
      name: ccName,
      code: codeToCheck, 
      manager: ccManager || 'Unassigned',
      branch: ccBranch || 'All Branches',
      budget: parseFloat(ccBudget) || 0,
      description: ccDescription,
      status: 'active'
    };

    try {
        if (ccId) {
            await api.updateCostCenter(newCCData); 
        } else {
            await api.createCostCenter(newCCData);
        }
        await fetchData(); 
        setIsCostCenterModalOpen(false);
    } catch (err) {
        console.error("Error saving Cost Center", err);
        alert("Failed to save Cost Center");
    }
  };

  const handleSaveAccount = async () => {
    if (!accName || !selectedGroup) return alert("Name and Group are required");
    
    // 5-Digit Random Code Logic
    const codeToCheck = accCode || Math.floor(10000 + Math.random() * 90000).toString();
    
    // Uniqueness Check
    const isDuplicateCode = accounts.some(acc => acc.code === codeToCheck && (!accId || acc.id !== accId));
    if(isDuplicateCode) return alert(`Account Code '${codeToCheck}' already exists.`);

    const isDebit = selectedBalType.includes('Debit');
    const formattedAmt = parseFloat(accOpeningBalance || 0);

    const accountData = {
        id: accId,
        code: codeToCheck,
        name: accName,
        subGroup: accSubGroup || '-', 
        accountGroup: selectedGroup,
        branch: selectedBranch || 'All Branches',
        costCenterCode: selectedCostCenter || '-', 
        balanceAmount: formattedAmt,
        balanceType: isDebit ? 'Dr' : 'Cr', 
        description: accDescription,
        status: isActive ? 'active' : 'inactive'
    };

    try {
        if (accId) {
            await api.updateAccount(accountData);
        } else {
            await api.createAccount(accountData);
        }
        await fetchData();
        setIsAccountModalOpen(false);
    } catch (err) {
        console.error("Error saving Account", err);
        alert("Failed to save Account");
    }
  };

  const handleSaveTransaction = async () => {
    if (!txnAccount || !txnAmount) return alert("Account and Amount are required");
    const amount = parseFloat(txnAmount);
    const isTxnDebit = txnType === 'Debit';
    const selectedAccName = txnAccount; 
    
    const targetAccount = accounts.find(acc => acc.name === selectedAccName);
    if (!targetAccount) return;

    const newTxn = {
        transactionDate: txnDate,
        voucherNo: `V-${Date.now().toString().slice(-6)}`,
        type: isTxnDebit ? 'Debit' : 'Credit', 
        accountCode: targetAccount.code,
        accountName: targetAccount.name,
        description: txnDesc || 'Transaction Entry',
        debitAmount: isTxnDebit ? amount : null,  
        creditAmount: !isTxnDebit ? amount : null 
    };

    try {
        await api.createTransaction(newTxn);
        await fetchData(); 
        setIsTransactionModalOpen(false);
    } catch (err) {
        console.error("Error saving transaction", err);
        alert("Failed to save transaction");
    }
  };

  // --- ACTIONS HANDLERS ---

  const handleEdit = (account) => {
    setAccId(account.id); 
    setAccName(account.name); 
    setAccCode(account.code);
    setAccSubGroup(account.sub); 
    setSelectedGroup(account.group);
    setSelectedBranch(account.branch); 
    setSelectedCostCenter(account.cc);
    setAccDescription(account.description || '');
    
    const bal = parseBalance(account.balance);
    setAccOpeningBalance(bal.amount);
    setSelectedBalType(bal.type === 'Dr' ? 'Debit (Dr)' : 'Credit (Cr)');
    
    setIsActive(account.status === 'active');
    setOpenActionMenuId(null);
    setIsAccountModalOpen(true);
  };

  const handleDuplicate = (account) => {
    setAccId(null); 
    setAccName(account.name + ' - Copy'); 
    setAccCode(''); // Clear code for new unique generation
    setAccSubGroup(account.sub); 
    setSelectedGroup(account.group);
    setSelectedBranch(account.branch); 
    setSelectedCostCenter(account.cc);
    setAccDescription(account.description || '');
    
    const bal = parseBalance(account.balance);
    setAccOpeningBalance(bal.amount);
    setSelectedBalType(bal.type === 'Dr' ? 'Debit (Dr)' : 'Credit (Cr)');
    
    setIsActive(true);
    setOpenActionMenuId(null);
    setIsAccountModalOpen(true);
  };

  const handleEditCostCenter = (cc) => {
    setCcId(cc.id); 
    setCcName(cc.name);
    setCcCode(cc.code); 
    setCcBranch(cc.branch);
    setCcManager(cc.manager);
    setCcBudget(cc.budget);
    setCcDescription(cc.description || '');
    setOpenCostCenterMenuId(null);
    setIsCostCenterModalOpen(true);
  };

  const handleViewCostCenter = (cc) => {
    const metrics = getCostCenterMetrics(cc.code); 
    setSelectedCostCenterForView({ ...cc, ...metrics });
    setOpenCostCenterMenuId(null);
    setIsViewCostCenterModalOpen(true);
  };

  const handleArchiveClick = (id, type) => {
    setItemToArchive(id);
    setArchiveType(type);
    setOpenActionMenuId(null);
    setOpenCostCenterMenuId(null);
    setIsArchiveModalOpen(true); 
  };

  const confirmArchive = async () => {
    if (!itemToArchive || !archiveType) return;
    
    try {
        if (archiveType === 'account') {
            await api.archiveAccount(itemToArchive);
        } else if (archiveType === 'costcenter') {
            await api.archiveCostCenter(itemToArchive);
        }
        await fetchData(); 
    } catch (err) {
        console.error("Archive failed", err);
        alert("Failed to archive item");
    } finally {
        setIsArchiveModalOpen(false);
        setItemToArchive(null);
        setArchiveType(null);
    }
  };

  const handleUnarchive = async (id, type) => {
    try {
        if (type === 'account') {
            await api.unarchiveAccount(id);
        } else if (type === 'costcenter') {
            await api.unarchiveCostCenter(id);
        }
        await fetchData();
    } catch (err) {
        console.error("Unarchive failed", err);
    }
    setOpenActionMenuId(null);
    setOpenCostCenterMenuId(null);
  };

  const getCostCenterMetrics = (ccCode) => {
    const linkedAccounts = accounts.filter(a => a.cc === ccCode && a.status !== 'archived');
    const spent = linkedAccounts
      .filter(a => a.group === 'Expenses')
      .reduce((total, acc) => total + parseBalance(acc.balance).amount, 0);
    const linkedCount = linkedAccounts.length;
    return { spent, linked: linkedCount };
  };

  // --- UI HELPERS ---
  const getGroupIcon = (group) => {
    switch(group) {
        case 'Assets': return <Wallet size={12} />;
        case 'Liabilities': return <CreditCard size={12} />; 
        case 'Income': return <TrendingUp size={12} />; 
        case 'Expenses': return <TrendingDown size={12} />; 
        case 'Equity': return <PieChart size={12} />;
        default: return <BookOpen size={12} />;
    }
  };

  const getGroupColorClass = (group) => {
    switch(group) {
        case 'Assets': return 'text-blue-600';
        case 'Liabilities': return 'text-red-600';
        case 'Income': return 'text-emerald-600';
        case 'Expenses': return 'text-orange-600';
        case 'Equity': return 'text-purple-600';
        default: return 'text-slate-600';
    }
  };

  const getGroupBadgeClass = (group) => {
    switch(group) {
        case 'Assets': return 'bg-blue-50 text-blue-700 border-blue-100';
        case 'Liabilities': return 'bg-red-50 text-red-700 border-red-100';
        case 'Income': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'Expenses': return 'bg-orange-50 text-orange-700 border-orange-100';
        case 'Equity': return 'bg-purple-50 text-purple-700 border-purple-100';
        default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const handleOpenAddAccount = () => {
    setAccId(null); setAccName(''); setAccCode(''); setAccSubGroup('');
    setAccOpeningBalance(''); setAccDescription(''); setSelectedGroup('');
    setSelectedBranch(defaultBranchName || ''); setSelectedCostCenter(''); setSelectedBalType('Debit (Dr)');
    setIsActive(true);
    setIsAccountModalOpen(true);
  };

  const handleOpenAddCostCenter = () => {
    setCcId(null); setCcName(''); setCcCode(''); setCcBranch(defaultBranchName || ''); setCcManager('');
    setCcBudget(''); setCcDescription('');
    setIsCostCenterModalOpen(true);
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="text-slate-500 font-medium animate-pulse">Loading Financial Data...</div>
          </div>
      );
  }

  // --- FILTER LOGIC ---
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = searchQuery === '' || 
                          acc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          acc.code.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGroup = filterGroup === '' || acc.group === filterGroup;
    const matchesBranch = filterBranch === '' || acc.branch === filterBranch;
    const matchesStatus = showArchived ? true : acc.status !== 'archived';

    return matchesSearch && matchesGroup && matchesBranch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 lg:p-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <div className="text-xs text-slate-500 mb-1">Financials &rarr; <span className="font-semibold text-slate-700">Ledgers</span></div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="text-[#F5C742]" size={28} /> Ledgers
          </h1>
          <p className="text-xs text-slate-500 mt-1">Manage chart of accounts, general ledger, cost centers, and financial transactions</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown
            onExportExcel={() => {
              const branchMeta = { companyProfile: company, branch: activeBranch?.name || '' };
              if (activeTab === 'chart') exportToExcel(filteredAccounts, ACCOUNT_COLUMNS, 'Chart_of_Accounts', branchMeta);
              else if (activeTab === 'gl') exportToExcel(filteredGlData, GL_COLUMNS, 'General_Ledger', branchMeta);
              else if (activeTab === 'cost') exportToExcel(costCenters.map(cc => ({ ...cc, ...getCostCenterMetrics(cc.code) })), COST_CENTER_COLUMNS, 'Cost_Centers', branchMeta);
              else if (activeTab === 'transactions') exportToExcel(glData, TRANSACTION_COLUMNS, 'Transactions_History', branchMeta);
            }}
            onExportPdf={() => {
              const branchMeta = { companyProfile: company, branch: activeBranch?.name || '' };
              if (activeTab === 'chart') exportToPDF(filteredAccounts, ACCOUNT_COLUMNS, 'Chart of Accounts', 'Chart_of_Accounts', branchMeta);
              else if (activeTab === 'gl') exportToPDF(filteredGlData, GL_COLUMNS, 'General Ledger', 'General_Ledger', branchMeta);
              else if (activeTab === 'cost') exportToPDF(costCenters.map(cc => ({ ...cc, ...getCostCenterMetrics(cc.code) })), COST_CENTER_COLUMNS, 'Cost Centers', 'Cost_Centers', branchMeta);
              else if (activeTab === 'transactions') exportToPDF(glData, TRANSACTION_COLUMNS, 'Transactions History', 'Transactions_History', branchMeta);
            }}
          />
          
          
          {/* QUICK ADD DROPDOWN */}
          <div className="relative group" ref={quickAddRef}>
            <button 
                onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold shadow-sm hover:bg-yellow-400"
            >
              <Plus size={16} /> Quick Add <ChevronDown size={14}/>
            </button>
            {isQuickAddOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1">
                <button 
                  onClick={() => { handleOpenAddAccount(); setIsQuickAddOpen(false); }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <BookOpen size={14}/> Add Account
                </button>
                <button 
                  onClick={() => { handleOpenAddCostCenter(); setIsQuickAddOpen(false); }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Target size={14}/> Add Cost Center
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-1 mb-6 flex gap-1 w-full md:w-fit overflow-x-auto">
        {[
          { id: 'chart', label: 'Chart of Accounts', icon: BookOpen },
          { id: 'gl', label: 'General Ledger', icon: FileText },
          { id: 'cost', label: 'Cost Centers', icon: Target },
          { id: 'transactions', label: 'Transactions', icon: Activity },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ======================= TAB 1: CHART OF ACCOUNTS ======================= */}
      {activeTab === 'chart' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* STATS */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity'].map((type, idx) => {
                const typeAccounts = accounts.filter(a => a.group === type && a.status !== 'archived');
                const total = typeAccounts.reduce((sum, acc) => sum + parseBalance(acc.balance).amount, 0);
                
                let icon = Wallet; 
                let color = 'text-blue-700'; 
                let border = 'border-l-4 border-blue-400';

                if (type === 'Liabilities') { icon = TrendingDown; color = 'text-red-600'; border = 'border-l-4 border-yellow-400'; }
                if (type === 'Income') { icon = TrendingUp; color = 'text-emerald-700'; border = 'border-l-4 border-emerald-400'; }
                if (type === 'Expenses') { icon = PieChart; color = 'text-orange-700'; border = 'border-l-4 border-orange-400'; }
                if (type === 'Equity') { icon = Activity; color = 'text-purple-700'; border = 'border-l-4 border-purple-400'; }

                const IconComp = icon;

                return (
                  <div key={idx} className={`bg-white p-4 rounded-lg border border-slate-200 shadow-sm ${border}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <IconComp size={16} className={color} />
                      <span className="text-xs font-bold text-slate-500">{type}</span>
                    </div>
                    <div className="text-xl font-bold text-slate-800 mb-1">{currency} {total.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{typeAccounts.length} active</div>
                  </div>
                )
            })}
          </div>

          {/* FILTERS & TABLE */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
             <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-end">
                  <div className="flex flex-col md:flex-row gap-3 w-full">
                      <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                        <input 
                            type="text" 
                            placeholder="Search accounts..." 
                            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      {/* GROUP FILTER */}
                      <select 
                        className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white w-full md:w-40 text-slate-600"
                        value={filterGroup}
                        onChange={(e) => setFilterGroup(e.target.value)}
                      >
                        <option value="">All Groups</option>
                        <option value="Assets">Assets</option>
                        <option value="Liabilities">Liabilities</option>
                        <option value="Income">Income</option>
                        <option value="Expenses">Expenses</option>
                        <option value="Equity">Equity</option>
                      </select>

                      {/* BRANCH FILTER */}
                      <select 
                        className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white w-full md:w-40 text-slate-600"
                        value={filterBranch}
                        onChange={(e) => setFilterBranch(e.target.value)}
                      >
                         <option value="">All Branches</option>
                         {branchOptions.map((branchName) => (
                           <option key={branchName} value={branchName}>{branchName}</option>
                         ))}
                      </select>
                      
                      <div className="flex items-center gap-2 ml-2">
                          <input 
                            type="checkbox" 
                            id="showArchived"
                            checked={showArchived} 
                            onChange={(e) => setShowArchived(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <label htmlFor="showArchived" className="text-xs font-bold text-slate-500 cursor-pointer select-none">
                            Show Archived
                          </label>
                      </div>
                  </div>
                  <button 
                    onClick={handleOpenAddAccount}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold hover:bg-yellow-400 whitespace-nowrap"
                  >
                    <Plus size={14}/> New Account
                  </button>
             </div>

             <div className="mb-4 text-xs text-slate-500">
                Complete listing of all accounts ({filteredAccounts.length} accounts)
             </div>

             <div className="overflow-x-auto min-h-[300px]">
               <table className="bb-nowrap-table w-full text-left text-xs">
                 <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                   <tr>
                     <th className="px-4 py-3">Account Code</th>
                     <th className="px-4 py-3">Account Name</th>
                     <th className="px-4 py-3">Group</th>
                     <th className="px-4 py-3">Branch</th>
                     <th className="px-4 py-3">Cost Center</th>
                     <th className="px-4 py-3">Current Balance</th>
                     <th className="px-4 py-3">Status</th>
                     <th className="px-4 py-3 text-center">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {filteredAccounts.map((row) => (
                     <tr key={row.id} className={`hover:bg-slate-50 group cursor-pointer ${row.status === 'archived' ? 'opacity-50 grayscale bg-slate-50' : ''}`}>
                       <td className="px-4 py-3 font-medium text-slate-600">{row.code}</td>
                       <td className="px-4 py-3">
                         <div className="flex items-center gap-2">
                           <div className={`p-1.5 rounded bg-slate-100 ${getGroupColorClass(row.group)}`}>
                              {getGroupIcon(row.group)}
                           </div>
                           <div>
                             <div className="font-bold text-slate-700">{row.name}</div>
                             <div className="text-[10px] text-slate-400">{row.sub}</div>
                           </div>
                         </div>
                       </td>
                       <td className="px-4 py-3">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getGroupBadgeClass(row.group)}`}>
                           {row.group}
                         </span>
                       </td>
                       
                       <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-slate-600">
                             <Building2 size={13} className="text-slate-400" />
                             <span className="font-medium">{row.branch}</span>
                          </div>
                       </td>
                       
                       <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                             <Target size={13} className="text-slate-300" /> 
                             <span className="text-slate-600 font-medium font-mono text-[11px] uppercase tracking-wide">
                                {row.cc}
                             </span>
                          </div>
                       </td>

                       <td className={`px-4 py-3 font-bold ${row.balColor}`}>
                          <span className={row.balance.includes('Dr') ? 'text-emerald-600' : 'text-red-600'}>
                             {row.balance.includes('Dr') ? '▲' : '▼'} {row.balance}
                          </span>
                       </td>

                       <td className="px-4 py-3">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            row.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                              : row.status === 'archived'
                              ? 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                          }`}>
                            {row.status.toUpperCase()}
                         </span>
                       </td>
                       <td className="px-4 py-3 text-center relative">
                         <div className="flex justify-center gap-2">
                           <button 
                             onClick={(e) => { e.stopPropagation(); setSelectedAccountForView(row); setIsViewModalOpen(true); }}
                             className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            >
                                <Eye size={14}/>
                            </button>
                           
                           <div className="relative">
                               <button 
                                 onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setOpenActionMenuId(openActionMenuId === row.id ? null : row.id); 
                                 }}
                                 className="p-1 text-slate-400 hover:bg-slate-100 rounded action-menu-trigger"
                                >
                                   <MoreHorizontal size={14}/>
                                </button>
                                
                                {openActionMenuId === row.id && (
                                    <div className="action-menu-dropdown absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-md shadow-xl z-50 text-left overflow-hidden">
                                       {row.status === 'active' ? (
                                          <>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
                                                className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                            >
                                                <Edit size={12}/> Edit Account
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDuplicate(row); }}
                                                className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                            >
                                                <Copy size={12}/> Duplicate Account
                                            </button>
                                            <div className="h-px bg-slate-100 my-0"></div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleArchiveClick(row.id, 'account'); }}
                                                className="w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                            >
                                                <Archive size={12}/> Archive Account
                                            </button>
                                          </>
                                       ) : (
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); handleUnarchive(row.id, 'account'); }}
                                              className="w-full px-4 py-2 text-xs text-green-600 hover:bg-green-50 flex items-center gap-2"
                                          >
                                              <RotateCcw size={12}/> Unarchive Account
                                          </button>
                                       )}
                                    </div>
                                )}
                           </div>
                         </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* ======================= TAB 2: GENERAL LEDGER ======================= */}
      {activeTab === 'gl' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
             <div className="mb-6">
               <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16}/> Ledger Filters</h3>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                 <div className="md:col-span-1">
                   <label className="block text-xs font-bold text-slate-500 mb-1">Account</label>
                   <select
                     value={glFilterAccount}
                     onChange={(e) => setGlFilterAccount(e.target.value)}
                     className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 font-medium"
                   >
                     <option value="">All Accounts</option>
                     {accounts.map(a => (
                       <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">From Date</label>
                   <input type="date" value={glFilterFrom} onChange={(e) => setGlFilterFrom(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700"/>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">To Date</label>
                   <input type="date" value={glFilterTo} onChange={(e) => setGlFilterTo(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700"/>
                 </div>
                 <div>
                   <button onClick={() => { setGlFilterFrom(glFilterFrom); setGlFilterTo(glFilterTo); }} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold hover:bg-yellow-400 shadow-sm">
                      <FileText size={14}/> Generate Report
                   </button>
                 </div>
               </div>
             </div>

             <div className="mb-4">
               <h3 className="text-sm font-bold text-slate-700">General Ledger Entries</h3>
               <p className="text-xs text-slate-500">{filteredGlData.length} of {glData.length} entries</p>
             </div>

             <div className="overflow-x-auto">
               <table className="bb-nowrap-table w-full text-left text-xs">
                 <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                   <tr>
                     <th className="px-4 py-3">Date</th>
                     <th className="px-4 py-3">Voucher No.</th>
                     <th className="px-4 py-3">Account</th>
                     <th className="px-4 py-3">Particulars</th>
                     <th className="px-4 py-3 text-right">Debit</th>
                     <th className="px-4 py-3 text-right">Credit</th>
                     <th className="px-4 py-3 text-right">Balance</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredGlData.map((entry, idx) => (
                      <tr key={entry.id || idx} className="hover:bg-slate-50 group">
                        <td className="px-4 py-3 font-medium text-slate-700">{formatDisplayDate(entry.date)}</td>
                        <td className="px-4 py-3">
                           <div className="flex items-center gap-2">
                             <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">{entry.type}</div>
                             <span className="text-slate-600">{entry.voucher}</span>
                           </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-700">{entry.accCode}</div>
                          <div className="text-slate-500">{entry.accName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-700">{entry.desc}</div>
                          <div className="text-[10px] text-slate-400">{entry.ref}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                          {entry.debit && `↑ ${entry.debit}`}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 font-medium">
                          {entry.credit && `↓ ${entry.credit}`}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${entry.balType === 'Dr' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {entry.balance}
                        </td>
                      </tr>
                    ))}
                 </tbody>
               </table>
             </div>
           </div>
        </div>
      )}

      {/* ======================= TAB 3: COST CENTERS ======================= */}
      {activeTab === 'cost' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Cost Centers</h3>
                <p className="text-xs text-slate-500">Manage departmental cost allocation and budgeting</p>
              </div>
              <button 
                onClick={() => handleOpenAddCostCenter()}
                className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold hover:bg-yellow-400"
              >
                <Plus size={14}/> New Cost Center
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {costCenters
                .filter(cc => showArchived || cc.status !== 'archived')
                .map((cc) => {
                  return (
                    <div key={cc.id} className={`bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow relative ${cc.status === 'archived' ? 'opacity-50 grayscale bg-slate-50' : ''}`}>
                      <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${cc.bg} ${cc.color}`}>
                                <Target size={20} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-700">{cc.name}</h4>
                              <div className="text-xs text-slate-400">{cc.code}</div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cc.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200 line-through'}`}>
                              {cc.status}
                          </span>
                      </div>

                      <div className="mb-4 text-xs text-slate-500 space-y-1">
                        <p>{cc.description || 'Gym equipment and facility assets'}</p>
                        <div className="flex gap-3">
                          <span className="flex items-center gap-1"><Building2 size={12}/> {cc.branch}</span>
                          <span className="flex items-center gap-1"><Users size={12}/> {cc.manager}</span>
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1 text-slate-600">
                          <span>Budget Utilization</span>
                          <span className="font-bold">{cc.percent}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${cc.percent > 80 ? 'bg-red-500' : 'bg-teal-700'}`} 
                            style={{ width: `${Math.min(cc.percent, 100)}%`}}
                          ></div>
                        </div>
                      </div>

                      <div className="flex justify-between items-end mb-4">
                        <div>
                          <div className="text-[10px] text-slate-400">Spent</div>
                          <div className="text-xs font-bold text-red-600">{currency} {parseFloat(cc.spent).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">Budget</div>
                          <div className="text-xs font-bold text-slate-700">{currency} {parseFloat(cc.budget).toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <BookOpen size={12}/> {getCostCenterMetrics(cc.code).linked} linked accounts
                          </div>
                          <div className="relative">
                              <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setOpenCostCenterMenuId(openCostCenterMenuId === cc.id ? null : cc.id); 
                                }}
                                className="hover:bg-slate-100 p-1 rounded text-slate-400 cc-action-trigger"
                              >
                                  <MoreHorizontal size={14}/>
                              </button>
                              {openCostCenterMenuId === cc.id && (
                                  <div className="cc-action-menu-dropdown absolute right-0 bottom-full mb-1 w-40 bg-white border border-slate-200 rounded-md shadow-xl z-50 text-left overflow-hidden">
                                      {cc.status === 'active' ? (
                                        <>
                                          <button 
                                              onClick={() => handleEditCostCenter(cc)}
                                              className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                                          >
                                              <Edit size={12}/> Edit Cost Center
                                          </button>
                                          <button 
                                              onClick={() => handleViewCostCenter(cc)}
                                              className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                                          >
                                              <Eye size={12}/> View Details
                                          </button>
                                          <div className="h-px bg-slate-100 my-0"></div>
                                          <button 
                                              onClick={() => handleArchiveClick(cc.id, 'costcenter')}
                                              className="w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                                          >
                                              <Archive size={12}/> Archive
                                          </button>
                                        </>
                                      ) : (
                                        <button 
                                            onClick={() => handleUnarchive(cc.id, 'costcenter')}
                                            className="w-full px-4 py-2 text-xs text-green-600 hover:bg-green-50 flex items-center gap-2"
                                        >
                                            <RotateCcw size={12}/> Unarchive Cost Center
                                        </button>
                                      )}
                                  </div>
                              )}
                          </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ======================= TAB 4: TRANSACTIONS ======================= */}
      {activeTab === 'transactions' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 min-h-[400px]">
             <div className="mb-4 flex justify-between items-center">
               <div>
                 <h3 className="text-sm font-bold text-slate-700">Recent Transactions</h3>
                 <p className="text-xs text-slate-500">Latest financial transactions across all accounts</p>
               </div>
                <button 
                   onClick={() => {
                        setTxnAccount(''); setTxnAmount(''); setTxnDesc(''); 
                        setIsTransactionModalOpen(true);
                   }}
                   className="flex items-center gap-2 px-5 py-2.5 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold hover:bg-yellow-400 shadow-sm"
                >
                   <Plus size={16}/> Add Transaction
                </button>
             </div>

             <div className="overflow-x-auto">
                 <table className="bb-nowrap-table w-full text-left text-xs">
                   <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                     <tr>
                       <th className="px-4 py-3">Date</th>
                       <th className="px-4 py-3">Voucher</th>
                       <th className="px-4 py-3">Account</th>
                       <th className="px-4 py-3">Description</th>
                       <th className="px-4 py-3 text-right">Debit</th>
                       <th className="px-4 py-3 text-right">Credit</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {glData.map((entry, idx) => (
                        <tr key={entry.id || idx} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-700">{formatDisplayDate(entry.date)}</td>
                          <td className="px-4 py-3 text-slate-500">{entry.voucher}</td>
                          <td className="px-4 py-3 font-bold text-slate-700">{entry.accName}</td>
                          <td className="px-4 py-3 text-slate-600">{entry.desc}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-medium">{entry.debit}</td>
                          <td className="px-4 py-3 text-right text-red-600 font-medium">{entry.credit}</td>
                        </tr>
                      ))}
                   </tbody>
                 </table>
             </div>
           </div>
        </div>
      )}

      {/* ======================= ARCHIVE CONFIRMATION MODAL ======================= */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl w-[400px] overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-500"/> Archive {archiveType === 'account' ? 'Account' : 'Cost Center'}
                    </h3>
                    <button onClick={() => setIsArchiveModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={20}/>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-600">
                        Are you sure you want to archive this item? 
                        <br/><br/>
                        <span className="font-bold">Note:</span> Archived items are hidden from selection but are retained for historical reports and audit trails.
                    </p>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setIsArchiveModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={confirmArchive} className="px-5 py-2 bg-red-600 rounded-md text-xs font-bold text-white hover:bg-red-700 shadow-sm transition-colors">Confirm Archive</button>
                </div>
            </div>
        </div>
      )}

      {/* ======================= VIEW DETAILS MODAL ======================= */}
      {isViewModalOpen && selectedAccountForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl w-[500px] overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Eye size={18} className="text-slate-500"/> Account Details
                    </h3>
                    <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={20}/>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Name</p>
                            <p className="text-sm font-bold text-slate-800">{selectedAccountForView.name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Code</p>
                            <p className="text-sm font-medium text-slate-600">{selectedAccountForView.code}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getGroupBadgeClass(selectedAccountForView.group)}`}>
                                {selectedAccountForView.group}
                            </span>
                        </div>
                         <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sub Group</p>
                            <p className="text-sm text-slate-600">{selectedAccountForView.sub}</p>
                        </div>
                        
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Branch</p>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <Building2 size={14} className="text-slate-400"/> 
                                {selectedAccountForView.branch}
                            </div>
                        </div>
                         <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cost Center</p>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <Target size={14} className="text-slate-400"/>
                                <span className="font-mono bg-slate-50 border border-slate-200 px-1.5 rounded text-xs">
                                    {selectedAccountForView.cc}
                                </span>
                            </div>
                        </div>

                    </div>
                    <div className="pt-4 border-t border-slate-100">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Balance</p>
                         <p className={`text-xl font-bold ${selectedAccountForView.balColor}`}>{selectedAccountForView.balance}</p>
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setIsViewModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100">Close</button>
                </div>
            </div>
        </div>
      )}

      {/* ======================= ADD/EDIT ACCOUNT MODAL ======================= */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl w-[650px] overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                        <div className="mt-1">
                            <BookOpen size={20} className="text-slate-700"/>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{accId ? 'Edit Account' : 'Add New Account'}</h3>
                            <p className="text-xs text-slate-500 mt-1">{accId ? 'Update account details' : 'Create a new account in your chart of accounts'}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Account Name <span className="text-red-500">*</span></label>
                            <input type="text" value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Enter account name" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400"/>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Account Code</label>
                            <input type="text" value={accCode} onChange={(e) => setAccCode(e.target.value)} placeholder="Auto-generated" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none text-slate-500"/>
                            <p className="text-[10px] text-slate-400 mt-1">Leave empty for auto-generation</p>
                        </div>

                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Account Group <span className="text-red-500">*</span></label>
                            <CustomSelect placeholder="Select account group" options={['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity']} value={selectedGroup} onChange={setSelectedGroup} />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Sub Group</label>
                            <input type="text" value={accSubGroup} onChange={(e) => setAccSubGroup(e.target.value)} placeholder="e.g., Current Assets, Fixed Asset" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400"/>
                        </div>

                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Branch</label>
                            <CustomSelect placeholder="Select branch" options={branchSelectOptions} value={selectedBranch} onChange={setSelectedBranch} />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Cost Center</label>
                            <CustomSelect 
                                placeholder="Select cost center" 
                                // DYNAMICALLY LOAD COST CENTERS
                                options={['-', ...costCenters.map(cc => cc.code)]} 
                                value={selectedCostCenter} 
                                onChange={setSelectedCostCenter} 
                            />
                        </div>

                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Opening Balance</label>
                            <input type="number" value={accOpeningBalance} onChange={(e) => setAccOpeningBalance(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400"/>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Balance Type</label>
                            <CustomSelect placeholder="Debit (Dr)" options={['Debit (Dr)', 'Credit (Cr)']} value={selectedBalType} onChange={setSelectedBalType} />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                            <textarea rows="2" value={accDescription} onChange={(e) => setAccDescription(e.target.value)} placeholder="Optional description for this account" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none resize-none placeholder:text-slate-400"></textarea>
                        </div>

                        <div className="col-span-2 flex items-center gap-2 mt-1 cursor-pointer" onClick={() => setIsActive(!isActive)}>
                             <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${isActive ? 'bg-teal-600 border-teal-600' : 'bg-white border border-slate-300'}`}>
                                {isActive && <Check size={12} strokeWidth={4} className="text-white"/>}
                             </div>
                             <span className="text-xs font-bold text-slate-700 select-none">Account is Active</span>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setIsAccountModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors">Cancel</button>
                    <button onClick={handleSaveAccount} className="px-5 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm transition-colors">{accId ? 'Update Account' : 'Create Account'}</button>
                </div>
            </div>
        </div>
      )}

      {/* ======================= ADD NEW COST CENTER MODAL ======================= */}
      {isCostCenterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl w-[650px] overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                        <div className="mt-1">
                            <Target size={20} className="text-slate-700"/>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Add New Cost Center</h3>
                            <p className="text-xs text-slate-500 mt-1">Create a new cost center for departmental budgeting and allocation</p>
                        </div>
                    </div>
                    <button onClick={() => setIsCostCenterModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20}/></button>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Cost Center Name <span className="text-red-500">*</span></label>
                            <input type="text" value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Enter cost center name" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400"/>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Cost Center Code</label>
                            <input type="text" value={ccCode} onChange={(e) => setCcCode(e.target.value)} placeholder="Auto-generated" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none text-slate-500"/>
                            <p className="text-[10px] text-slate-400 mt-1">Leave empty for auto-generation</p>
                        </div>

                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Branch <span className="text-red-500">*</span></label>
                            <CustomSelect placeholder="Select branch" options={branchSelectOptions} value={ccBranch} onChange={setCcBranch} />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Manager</label>
                            <CustomSelect placeholder="Select manager" options={['Sarah Ahmed', 'Ahmed Hassan', 'Lisa Wang', 'Mike Johnson', 'John Smith']} value={ccManager} onChange={setCcManager} />
                        </div>

                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Budget Amount ({currency})</label>
                            <input type="number" value={ccBudget} onChange={(e) => setCcBudget(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400"/>
                        </div>
                        
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                            <textarea rows="2" value={ccDescription} onChange={(e) => setCcDescription(e.target.value)} placeholder="Describe the purpose and scope of this cost center" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none resize-none placeholder:text-slate-400"></textarea>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setIsCostCenterModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors">Cancel</button>
                    <button onClick={handleSaveCostCenter} className="px-5 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm transition-colors">Create Cost Center</button>
                </div>
            </div>
        </div>
      )}

      {/* ======================= ADD TRANSACTION MODAL ======================= */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl w-[500px] overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Activity size={18} className="text-slate-500"/> Record Transaction
                    </h3>
                    <button onClick={() => setIsTransactionModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Transaction Date</label>
                            <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Select Account <span className="text-red-500">*</span></label>
                            <CustomSelect 
                                placeholder="Choose account" 
                                options={accounts.map(a => a.name)} 
                                value={txnAccount} 
                                onChange={setTxnAccount} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Type</label>
                                <CustomSelect placeholder="Debit" options={['Debit', 'Credit']} value={txnType} onChange={setTxnType} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Amount ({currency}) <span className="text-red-500">*</span></label>
                                <input type="number" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                            <textarea rows="2" value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} placeholder="Enter transaction details" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none resize-none"></textarea>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setIsTransactionModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSaveTransaction} className="px-5 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm">Save Transaction</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default Ledger;
