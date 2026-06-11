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
  ChevronRight,
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
  RotateCcw,
  TreePine
} from 'lucide-react';

// Import API functions
import * as api from '../../api/ledgerApi';
import * as reportApi from '../../api/financialReportsBackendApi';
import { useBranch } from '../../context/BranchContext';
import { useCompany } from '../../context/CompanyContext';
import { employeesApi } from '../../api/employeesApi';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { resolveCurrencyDisplayCode } from '../../utils/countryCurrencyOptions';
import { CurrencySymbol } from '../../components/CurrencyAmount';
import { formatDisplayDate } from '../../utils/dateUtils';
import PaginationFooter from '../../components/common/PaginationFooter';

// ==========================================
// 1. MOCK DATA & CONFIGURATION
// ==========================================

const COA_COLUMNS = [
  { header: 'Code', key: 'code', width: 10 },
  { header: 'Account Name', key: 'name', width: 25 },
  { header: 'Group', key: 'group', width: 15 },
  { header: 'Type', key: 'accountType', width: 15 },
  { header: 'Balance', key: 'balance', width: 15 },
  { header: 'Normal', key: 'normalBalance', width: 10 },
  { header: 'Kind', key: 'accountKind', width: 10 }
];

const GL_COLUMNS = [
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Voucher No.', key: 'voucher', width: 15 },
  { header: 'Acc Code', key: 'accCode', width: 10 },
  { header: 'Acc Name', key: 'accName', width: 20 },
  { header: 'Particulars', key: 'desc', width: 30 },
  { header: 'Debit', key: 'debit', width: 12 },
  { header: 'Credit', key: 'credit', width: 12 },
  { header: 'Balance', key: 'balance', width: 15 }
];

// --- HELPER: CUSTOM SELECT COMPONENT ---
const normalizeSelectOption = (option) => {
  if (option && typeof option === 'object') {
    const optionValue = option.value ?? option.label ?? '';
    const optionLabel = option.label ?? optionValue;
    return {
      value: optionValue,
      label: optionLabel,
      searchText: option.searchText || `${optionValue} ${optionLabel}`
    };
  }

  return {
    value: option,
    label: option,
    searchText: String(option || '')
  };
};

const CustomSelect = ({ label, placeholder, options = [], value, onChange, searchable = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const dropdownRef = useRef(null);
  const normalizedOptions = useMemo(() => options.map(normalizeSelectOption), [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      String(option.searchText || option.label || option.value).toLowerCase().includes(query)
    );
  }, [normalizedOptions, searchText]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchText('');
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchText('');
        }}
        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 bg-white text-slate-600 flex justify-between items-center cursor-pointer"
      >
        <span className={value ? "text-slate-700" : "text-slate-400"}>
          {selectedOption?.label || value || placeholder}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {searchable && (
            <div className="sticky top-0 bg-white p-2 border-b border-slate-100">
              <input
                autoFocus
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search code or name"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-yellow-400"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          )}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No options found</div>
          )}
          {filteredOptions.map((option, idx) => (
            <div
              key={`${option.value}-${idx}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                setSearchText('');
              }}
              className="px-3 py-2 text-xs cursor-pointer text-slate-600 hover:bg-[#F43F5E] hover:text-white transition-colors"
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Ledger = () => {
  const { branches, defaultBranchName, activeBranch } = useBranch();
  const { company } = useCompany();
  const currency = resolveCurrencyDisplayCode(company || {});
  const [activeTab, setActiveTab] = useState('chart');
  const [employeeNames, setEmployeeNames] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // --- GL LEDGER FILTER STATES (BB-033) ---
  const [glFilterAccount, setGlFilterAccount] = useState('');
  const [glAccountSearch, setGlAccountSearch] = useState('');
  const [glAccountOpen, setGlAccountOpen] = useState(false);
  const [glTextSearch, setGlTextSearch] = useState('');
  const glAccountRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [glFilterFrom, setGlFilterFrom] = useState(firstOfMonth);
  const [glFilterTo, setGlFilterTo] = useState(today);

  // --- TRANSACTION TAB FILTER STATES ---
  const [txnSearch, setTxnSearch] = useState('');
  const [txnFilterFrom, setTxnFilterFrom] = useState('');
  const [txnFilterTo, setTxnFilterTo] = useState('');
  const [txnFilterAccount, setTxnFilterAccount] = useState('');

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
  const costCenterSelectOptions = useMemo(() => [
    { value: '-', label: '- No Cost Center', searchText: 'none no cost center -' },
    ...costCenters
      .filter((costCenter) => costCenter?.code)
      .sort((left, right) => (left.code || '').localeCompare(right.code || ''))
      .map((costCenter) => ({
        value: costCenter.code,
        label: `${costCenter.code} - ${costCenter.name || 'Unnamed Cost Center'}`,
        searchText: `${costCenter.code} ${costCenter.name || ''}`
      }))
  ], [costCenters]);
  const costCenterByCode = useMemo(() => {
    const map = new Map();
    costCenters.forEach((costCenter) => {
      if (costCenter?.code) {
        map.set(costCenter.code, costCenter);
      }
    });
    return map;
  }, [costCenters]);
  const formatCostCenterDisplay = (code) => {
    if (!code || code === '-') return '-';
    const costCenter = costCenterByCode.get(code);
    return costCenter ? `${costCenter.code} - ${costCenter.name || 'Unnamed Cost Center'}` : code;
  };
  const accountSelectOptions = useMemo(() => accounts
    .filter((account) => account?.status !== 'archived' && account?.isGroup !== true)
    .sort((left, right) => (left.code || '').localeCompare(right.code || ''))
    .map((account) => ({
      value: account.name,
      label: `${account.code || '-'} - ${account.name}`,
      searchText: `${account.code || ''} ${account.name || ''}`
    })), [accounts]);

  // --- COA TREE STATES ---
  const [accountTree, setAccountTree] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [coaViewMode, setCoaViewMode] = useState('tree'); // 'list' | 'tree'
  const [coaTreeSearch, setCoaTreeSearch] = useState('');
  const [closingNodes, setClosingNodes] = useState(new Set());
  const closeTimersRef = useRef({});

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
    accountType: acc.accountType, // Added for robust stat matching
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

  const buildCoaTreeFallback = (accData = []) => {
    const list = (Array.isArray(accData) ? accData : []).filter((acc) => acc && acc.code);
    const hasParentCodes = list.some((acc) => acc.parentCode);

    const toNode = (acc) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      accountGroup: acc.accountGroup,
      accountType: acc.accountType,
      subGroup: acc.subGroup,
      parentCode: acc.parentCode,
      level: acc.level,
      isGroup: Boolean(acc.isGroup),
      normalBalance: acc.normalBalance,
      balanceAmount: acc.balanceAmount,
      balanceType: acc.balanceType,
      status: acc.status,
      children: []
    });

    if (hasParentCodes) {
      const byCode = new Map();
      const nodes = list.map(toNode);
      nodes.forEach((node) => byCode.set(node.code, node));

      const roots = [];
      nodes.forEach((node) => {
        const parentCode = node.parentCode;
        const parent = parentCode ? byCode.get(parentCode) : null;
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      });

      const sortTree = (nodeList) => {
        nodeList.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
        nodeList.forEach((n) => sortTree(n.children || []));
      };
      sortTree(roots);

      // Mark any node with children as a group for consistent UI.
      const markGroups = (nodeList) => {
        nodeList.forEach((n) => {
          if ((n.children || []).length > 0) n.isGroup = true;
          markGroups(n.children || []);
        });
      };
      markGroups(roots);

      return roots;
    }

    // No explicit hierarchy: group accounts by accountGroup so the Tree View is still useful.
    const groupMap = new Map();
    list.forEach((acc) => {
      const group = acc.accountGroup || 'Other';
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group).push(acc);
    });

    return Array.from(groupMap.entries())
      .sort((a, b) => (a[0] || '').localeCompare(b[0] || ''))
      .map(([group, accs]) => ({
        id: `group-${group}`,
        code: `__GROUP__${String(group).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
        name: group,
        accountGroup: group,
        accountType: '',
        normalBalance: '',
        isGroup: true,
        balanceAmount: null,
        balanceType: null,
        status: 'active',
        children: accs
          .slice()
          .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
          .map(toNode)
      }));
  };

  const normalizeBalanceType = (type, fallback = 'Dr') => {
    const raw = String(type || '').trim().toLowerCase();
    if (raw === 'cr' || raw === 'credit') return 'Cr';
    if (raw === 'dr' || raw === 'debit') return 'Dr';
    return fallback;
  };

  const toSignedBalance = (amount, type) => {
    const numeric = parseFloat(amount || 0);
    if (!Number.isFinite(numeric) || numeric === 0) return 0;
    return normalizeBalanceType(type) === 'Cr' ? -Math.abs(numeric) : Math.abs(numeric);
  };

  const fromSignedBalance = (signedAmount, fallbackType = 'Dr') => {
    const numeric = Number.isFinite(signedAmount) ? signedAmount : 0;
    if (numeric === 0) {
      return {
        balanceAmount: 0,
        balanceType: normalizeBalanceType(fallbackType)
      };
    }

    return {
      balanceAmount: Math.abs(numeric),
      balanceType: numeric >= 0 ? 'Dr' : 'Cr'
    };
  };

  const rollupCoaTreeBalances = (nodes = []) => {
    const walk = (node) => {
      const children = (Array.isArray(node?.children) ? node.children : []).map(walk);
      const ownSigned = toSignedBalance(node?.balanceAmount, node?.balanceType || node?.normalBalance);
      const childrenSigned = children.reduce(
        (sum, child) => sum + toSignedBalance(child.balanceAmount, child.balanceType || child.normalBalance),
        0
      );
      const totalSigned = ownSigned + childrenSigned;
      const fallbackType = node?.balanceType || node?.normalBalance || 'Dr';
      const rolled = children.length > 0
        ? fromSignedBalance(totalSigned, fallbackType)
        : {
            balanceAmount: parseFloat(node?.balanceAmount || 0) || 0,
            balanceType: normalizeBalanceType(fallbackType)
          };

      return {
        ...node,
        children,
        isGroup: Boolean(node?.isGroup) || children.length > 0,
        balanceAmount: rolled.balanceAmount,
        balanceType: rolled.balanceType
      };
    };

    return (Array.isArray(nodes) ? nodes : []).map(walk);
  };

  // --- INITIAL DATA FETCHING ---
  const fetchData = async () => {
    try {
      const [accData, ccData, txnData, treeData] = await Promise.all([
        api.getAccounts(),
        api.getCostCenters(),
        api.getTransactions(),
        reportApi.getAccountTree().catch(() => [])
      ]);

      setAccounts(accData.map(mapAccountToUI));
      setCostCenters(ccData.map(mapCostCenterToUI));
      setGlData(txnData.map(mapTransactionToUI));
      const rawTree = Array.isArray(treeData) && treeData.length > 0
        ? treeData
        : buildCoaTreeFallback(accData);
      const resolvedTree = rollupCoaTreeBalances(rawTree);
      setAccountTree(resolvedTree);

      // Auto-expand root nodes
      const rootCodes = resolvedTree.map(n => n.code);
      setExpandedNodes(new Set(rootCodes));

    } catch (error) {
      console.error("Failed to load ledger data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    employeesApi.getActiveEmployees()
      .then(data => {
        const names = data.map(emp => `${emp.firstName} ${emp.lastName}`.trim()).filter(Boolean);
        setEmployeeNames(names);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      Object.values(closeTimersRef.current).forEach((timer) => clearTimeout(timer));
      closeTimersRef.current = {};
    };
  }, []);

  // --- MODAL STATES ---
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isCostCenterModalOpen, setIsCostCenterModalOpen] = useState(false);
  const [isViewCostCenterModalOpen, setIsViewCostCenterModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);

  // --- STATEMENT MODAL STATES ---
  const [selectedAccountForStatement, setSelectedAccountForStatement] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [statementStartDate, setStatementStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [statementEndDate, setStatementEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadingStatement, setLoadingStatement] = useState(false);

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
  const [accParentCode, setAccParentCode] = useState('');

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
      if (glAccountRef.current && !glAccountRef.current.contains(event.target)) {
        setGlAccountOpen(false);
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

    const codeToCheck = accCode || generateNextCode(selectedGroup, accounts);

    // Uniqueness Check
    const isDuplicateCode = accounts.some(acc => acc.code === codeToCheck && (!accId || acc.id !== accId));
    if (isDuplicateCode) return alert(`Account Code '${codeToCheck}' already exists.`);

    const isDebit = selectedBalType.includes('Debit');
    const formattedAmt = parseFloat(accOpeningBalance || 0);

    const parentAccount = accParentCode ? accounts.find(a => a.code === accParentCode) : null;

    const accountTypeMap = { 'Assets': 'Asset', 'Liabilities': 'Liability', 'Income': 'Income', 'Expenses': 'Expense', 'Equity': 'Equity' };

    const accountData = {
      id: accId,
      code: codeToCheck,
      name: accName,
      subGroup: accSubGroup || '-',
      accountGroup: selectedGroup,
      accountType: accountTypeMap[selectedGroup] || selectedGroup,
      branch: selectedBranch || 'All Branches',
      costCenterCode: selectedCostCenter || '-',
      balanceAmount: formattedAmt,
      balanceType: isDebit ? 'Dr' : 'Cr',
      description: accDescription,
      status: isActive ? 'active' : 'inactive',
      parentCode: accParentCode || null,
      isGroup: false,
      level: parentAccount ? (parentAccount.level || 1) + 1 : 1
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
    setAccParentCode(account.parentCode || '');
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
    setAccParentCode('');
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

  const handleOpenStatement = async (account) => {
    setSelectedAccountForStatement(account);
    setOpenActionMenuId(null);
    setIsStatementModalOpen(true);
    await fetchStatementData(account.code, statementStartDate, statementEndDate);
  };

  const fetchStatementData = async (accountCode, start, end) => {
    setLoadingStatement(true);
    try {
      const data = await reportApi.getLedgerStatement(accountCode, start, end);
      setStatementData(data);
    } catch (err) {
      console.error("Failed to load ledger statement", err);
      // Fallback empty data
      setStatementData({ runningBalanceLogs: [] });
    } finally {
      setLoadingStatement(false);
    }
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
    switch (group) {
      case 'Assets': return <Wallet size={12} />;
      case 'Liabilities': return <CreditCard size={12} />;
      case 'Income': return <TrendingUp size={12} />;
      case 'Expenses': return <TrendingDown size={12} />;
      case 'Equity': return <PieChart size={12} />;
      default: return <BookOpen size={12} />;
    }
  };

  const getGroupColorClass = (group) => {
    switch (group) {
      case 'Assets': return 'text-blue-600';
      case 'Liabilities': return 'text-red-600';
      case 'Income': return 'text-emerald-600';
      case 'Expenses': return 'text-orange-600';
      case 'Equity': return 'text-purple-600';
      default: return 'text-slate-600';
    }
  };

  const getGroupBadgeClass = (group) => {
    switch (group) {
      case 'Assets': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Liabilities': return 'bg-red-50 text-red-700 border-red-100';
      case 'Income': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Expenses': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Equity': return 'bg-purple-50 text-purple-700 border-purple-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const generateNextCode = (group, existingAccounts) => {
    const prefixMap = { 'Assets': 1, 'Liabilities': 2, 'Equity': 3, 'Income': 4, 'Expenses': 5 };
    const prefix = prefixMap[group] ?? 9;
    const rangeMin = prefix * 1000;
    const rangeMax = rangeMin + 999;
    const existing = existingAccounts
      .map(a => parseInt(a.code))
      .filter(n => Number.isFinite(n) && n >= rangeMin && n <= rangeMax);
    const max = existing.length > 0 ? Math.max(...existing) : rangeMin + 99;
    return String(max + 1);
  };

  const handleOpenAddAccount = () => {
    setAccId(null); setAccName(''); setAccCode(''); setAccSubGroup('');
    setAccOpeningBalance(''); setAccDescription(''); setSelectedGroup('');
    setSelectedBranch(defaultBranchName || ''); setSelectedCostCenter(''); setSelectedBalType('Debit (Dr)');
    setIsActive(true);
    setAccParentCode('');
    setIsAccountModalOpen(true);
  };

  const handleOpenAddCostCenter = () => {
    setCcId(null); setCcName(''); setCcCode(''); setCcBranch(defaultBranchName || ''); setCcManager('');
    setCcBudget(''); setCcDescription('');
    setIsCostCenterModalOpen(true);
  };

  // --- COA TREE HELPERS ---
  const toggleTreeNode = (code) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      const isOpen = next.has(code);

      // Stop any in-flight close animation.
      if (closeTimersRef.current[code]) {
        clearTimeout(closeTimersRef.current[code]);
        delete closeTimersRef.current[code];
      }

      if (isOpen) {
        next.delete(code);
        // Keep children rendered briefly so we can animate the collapse.
        setClosingNodes((closingPrev) => {
          const closingNext = new Set(closingPrev);
          closingNext.add(code);
          return closingNext;
        });
        closeTimersRef.current[code] = setTimeout(() => {
          setClosingNodes((closingPrev) => {
            const closingNext = new Set(closingPrev);
            closingNext.delete(code);
            return closingNext;
          });
          delete closeTimersRef.current[code];
        }, 240);
      } else {
        next.add(code);
        setClosingNodes((closingPrev) => {
          if (!closingPrev.has(code)) return closingPrev;
          const closingNext = new Set(closingPrev);
          closingNext.delete(code);
          return closingNext;
        });
      }

      return next;
    });
  };

  const expandAllTree = () => {
    const all = [];
    const collect = (nodes) => nodes.forEach(n => {
      if (n.children?.length > 0) { all.push(n.code); collect(n.children); }
    });
    collect(accountTree);
    setExpandedNodes(new Set(all));
  };

  const collapseAllTree = () => {
    // Clear open state, then remove any closing animations shortly after.
    setExpandedNodes(new Set());
    setClosingNodes((prev) => (prev.size ? new Set() : prev));
  };

  const filterCoaTree = (nodes, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return nodes;

    const matches = (node) => {
      const code = String(node?.code || '').toLowerCase();
      const name = String(node?.name || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    };

    const walk = (list) => {
      const out = [];
      (Array.isArray(list) ? list : []).forEach((node) => {
        const children = walk(node?.children || []);
        if (matches(node) || children.length > 0) {
          out.push({ ...node, children });
        }
      });
      return out;
    };

    return walk(nodes);
  };

  const renderCOATreeNode = (node, depth = 0, motion = null) => {
    const hasChildren = node.children?.length > 0;
    const isExpanded = expandedNodes.has(node.code);
    const isClosing = closingNodes.has(node.code);
    const indent = depth * 24;
    const sortedChildren = hasChildren
      ? [...node.children].sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      : [];

    const rowMotion = motion === 'out'
      ? 'coa-row-exit'
      : motion === 'in'
        ? 'coa-row-enter'
        : '';

    const shouldRenderChildren = (isExpanded || isClosing) && hasChildren;
    const childMotion = motion === 'out' ? 'out' : (isExpanded ? 'in' : 'out');

    return (
      <React.Fragment key={node.code}>
        <tr
          className={`hover:bg-slate-50 transition-colors border-b border-slate-100 ${hasChildren ? 'cursor-pointer' : ''} ${rowMotion}`}
          onClick={() => hasChildren && toggleTreeNode(node.code)}
        >
          <td className="px-4 py-2 text-xs" style={{ paddingLeft: `${16 + indent}px` }}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleTreeNode(node.code); }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform duration-200 ease-out ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
                  />
                </button>
              ) : <span className="w-[14px]" />}
              <span className="font-mono text-slate-500">{node.code}</span>
            </div>
          </td>
          <td className={`px-4 py-2 text-xs ${node.isGroup ? 'font-bold text-slate-800' : 'text-slate-700'}`}>
            {node.name}
          </td>
          <td className="px-4 py-2 text-xs text-slate-500">{node.accountGroup || '-'}</td>
          <td className="px-4 py-2 text-xs text-slate-500">{node.accountType || '-'}</td>
          <td className={`px-4 py-2 text-xs text-right font-bold ${(node.balanceType || 'Dr') === 'Dr' ? 'text-emerald-600' : 'text-red-600'}`}>
            {(node.balanceAmount === null || node.balanceAmount === undefined) && !node.balanceType
              ? '-'
              : <><CurrencySymbol /> {parseFloat(node.balanceAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {node.balanceType || 'Dr'}</>}
          </td>
          <td className="px-4 py-2 text-xs text-center">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${node.normalBalance === 'Dr'
              ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              {node.normalBalance || '-'}
            </span>
          </td>
          <td className="px-4 py-2 text-xs text-center">
            {node.isGroup
              ? <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold">Group</span>
              : <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">Leaf</span>
            }
          </td>
        </tr>
        {shouldRenderChildren && sortedChildren.map(child => renderCOATreeNode(child, depth + 1, childMotion))}
      </React.Fragment>
    );
  };

  // Client-side pagination for the two big lists in this page.
  const LIST_PAGE_SIZE = 30;
  const [accountsPage, setAccountsPage] = useState(0);
  useEffect(() => { setAccountsPage(0); }, [searchQuery, filterGroup, filterBranch, showArchived]);
  const [glPage, setGlPage] = useState(0);
  useEffect(() => { setGlPage(0); }, [glFilterAccount, glFilterFrom, glFilterTo, glTextSearch]);

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

  // BB-033: Filter GL entries by account, date range, and text search
  const filteredGlData = glData.filter(entry => {
    const matchesAccount = !glFilterAccount || entry.accCode === glFilterAccount || entry.accName === glFilterAccount;
    const matchesFrom = !glFilterFrom || (entry.date && entry.date >= glFilterFrom);
    const matchesTo = !glFilterTo || (entry.date && entry.date <= glFilterTo);
    const q = glTextSearch.toLowerCase();
    const matchesText = !q || (
      (entry.accCode && entry.accCode.toLowerCase().includes(q)) ||
      (entry.accName && entry.accName.toLowerCase().includes(q)) ||
      (entry.voucher && entry.voucher.toLowerCase().includes(q)) ||
      (entry.desc && entry.desc.toLowerCase().includes(q))
    );
    return matchesAccount && matchesFrom && matchesTo && matchesText;
  });

  const pagedAccounts = filteredAccounts.slice(accountsPage * LIST_PAGE_SIZE, (accountsPage + 1) * LIST_PAGE_SIZE);
  const pagedGl = filteredGlData.slice(glPage * LIST_PAGE_SIZE, (glPage + 1) * LIST_PAGE_SIZE);

  const visibleCoaTree = filterCoaTree(accountTree, coaTreeSearch);
  const coaTreeAnimationCss = `
    @keyframes coaTreeRowEnter {
      from {
        opacity: 0;
        transform: translateY(-8px);
        padding-top: 0;
        padding-bottom: 0;
      }
      to {
        opacity: 1;
        transform: translateY(0);
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
      }
    }

    @keyframes coaTreeRowExit {
      from {
        opacity: 1;
        transform: translateY(0);
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
      }
      to {
        opacity: 0;
        transform: translateY(-10px);
        padding-top: 0;
        padding-bottom: 0;
      }
    }

    .coa-row-enter > td,
    .coa-row-exit > td {
      will-change: opacity, transform;
      transform-origin: top center;
      overflow: hidden;
    }

    .coa-row-enter > td {
      animation: coaTreeRowEnter 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .coa-row-exit > td {
      animation: coaTreeRowExit 220ms cubic-bezier(0.4, 0, 0.2, 1) both;
    }
  `;

// GL account combobox: filtered options by search text
const glAccountOptions = accounts
  .filter(a => a.status !== 'archived')
  .filter(a => {
    if (!glAccountSearch) return true;
    const q = glAccountSearch.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });

  const handleExportExcel = () => {
    const branchMeta = { companyProfile: company, branch: activeBranch?.name || '' };
    if (activeTab === 'chart') {
      exportToExcel(accounts, COA_COLUMNS, 'Chart_of_Accounts', branchMeta);
    } else if (activeTab === 'gl') {
      exportToExcel(filteredGlData, GL_COLUMNS, 'General_Ledger', branchMeta);
    }
  };

  const handleExportPdf = () => {
    const branchMeta = { companyProfile: company, branch: activeBranch?.name || '' };
    if (activeTab === 'chart') {
      exportToPDF(accounts, COA_COLUMNS, 'Chart of Accounts', 'Chart_of_Accounts', branchMeta);
    } else if (activeTab === 'gl') {
      exportToPDF(filteredGlData, GL_COLUMNS, 'General Ledger', 'General_Ledger', branchMeta);
    }
  };

  const selectedAccountLabel = glFilterAccount
    ? (() => {
        const a = accounts.find(acc => acc.code === glFilterAccount);
        return a ? `${a.code} - ${a.name}` : glFilterAccount;
      })()
    : '';

  return (
    <>
    <style>{coaTreeAnimationCss}</style>
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
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />

          {/* QUICK ADD DROPDOWN */}
          <div className="relative group" ref={quickAddRef}>
            <button
              onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold shadow-sm hover:bg-yellow-400"
            >
              <Plus size={16} /> Quick Add <ChevronDown size={14} />
            </button>
            {isQuickAddOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1">
                <button
                  onClick={() => { handleOpenAddAccount(); setIsQuickAddOpen(false); }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <BookOpen size={14} /> Add Account
                </button>
                <button
                  onClick={() => { handleOpenAddCostCenter(); setIsQuickAddOpen(false); }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Target size={14} /> Add Cost Center
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
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'
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
              const typeAccounts = accounts.filter(a => {
                if (a.status === 'archived') return false;
                
                const group = (a.group || '').toLowerCase().trim();
                const actType = (a.accountType || '').toLowerCase().trim();
                const target = type.toLowerCase();
                
                // Robust matching for plural/singular and empty groups
                return group === target || 
                       group === target.replace(/s$/, '').replace(/ies$/, 'y') ||
                       actType === target || 
                       actType === target.replace(/s$/, '').replace(/ies$/, 'y');
              });
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
                  <div className="text-xl font-bold text-slate-800 mb-1"><CurrencySymbol /> {total.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{typeAccounts.length} active</div>
                </div>
              )
            })}
          </div>

          {/* COA TREE VIEW */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <TreePine size={16} className="text-emerald-600" />
                  Chart of Accounts - Tree View
                </h3>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => setCoaViewMode('tree')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${coaViewMode === 'tree' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Tree
                  </button>
                  <button
                    onClick={() => setCoaViewMode('list')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${coaViewMode === 'list' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    List
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {coaViewMode === 'tree' && (
                  <>
                    <button onClick={expandAllTree} className="text-xs px-3 py-1.5 bg-slate-100 rounded font-bold text-slate-600 hover:bg-slate-200">
                      Expand All
                    </button>
                    <button onClick={collapseAllTree} className="text-xs px-3 py-1.5 bg-slate-100 rounded font-bold text-slate-600 hover:bg-slate-200">
                      Collapse All
                    </button>
                  </>
                )}
                <button
                  onClick={handleOpenAddAccount}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#F5C742] text-slate-900 rounded text-xs font-bold hover:bg-yellow-400"
                >
                  <Plus size={13} /> New Account
                </button>
              </div>
            </div>

            {/* ---- TREE VIEW ---- */}
            {coaViewMode === 'tree' && (
              <>
                <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Search COA tree..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400"
                      value={coaTreeSearch}
                      onChange={(e) => setCoaTreeSearch(e.target.value)}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Showing {visibleCoaTree.length} root node{visibleCoaTree.length === 1 ? '' : 's'}
                  </div>
                </div>

              <div className="overflow-x-auto">
                <table className="bb-nowrap-table w-full">
                  <thead className="bg-[#F7F7FA] border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-40">Code</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Group</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Type</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-36">Balance</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Normal</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Kind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCoaTree.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No COA tree data. Ensure accounts have parent codes set.</td></tr>
                    ) : (
                      [...visibleCoaTree].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(node => renderCOATreeNode(node))
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {/* ---- LIST VIEW ---- */}
            {coaViewMode === 'list' && (
              <>
                <div className="p-4 flex flex-col md:flex-row gap-3 items-end border-b border-slate-100">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Search accounts..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
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
                  <div className="flex items-center gap-2">
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
                <div className="px-4 pt-3 pb-1 text-xs text-slate-500">
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
                  {pagedAccounts.map((row) => (
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
                          <span className="text-slate-600 font-medium text-[11px]">
                            {formatCostCenterDisplay(row.cc)}
                          </span>
                        </div>
                      </td>

                      <td className={`px-4 py-3 font-bold ${row.balColor}`}>
                        <span className={row.balType === 'Dr' ? 'text-emerald-600' : 'text-red-600'}>
                          {row.balType === 'Dr' ? '▲' : '▼'} <CurrencySymbol /> {row.balance.replace(/^[A-Z]+ /, '')}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${row.status === 'active'
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
                            <Eye size={14} />
                          </button>

                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenuId(openActionMenuId === row.id ? null : row.id);
                              }}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded action-menu-trigger"
                            >
                              <MoreHorizontal size={14} />
                            </button>

                            {openActionMenuId === row.id && (
                              <div className="action-menu-dropdown absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-md shadow-xl z-50 text-left overflow-hidden">
                                {row.status === 'active' ? (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
                                      className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                    >
                                      <Edit size={12} /> Edit Account
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenStatement(row); }}
                                      className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                    >
                                      <Activity size={12} /> View Statement
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDuplicate(row); }}
                                      className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                    >
                                      <Copy size={12} /> Duplicate Account
                                    </button>
                                    <div className="h-px bg-slate-100 my-0"></div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleArchiveClick(row.id, 'account'); }}
                                      className="w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                    >
                                      <Archive size={12} /> Archive Account
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUnarchive(row.id, 'account'); }}
                                    className="w-full px-4 py-2 text-xs text-green-600 hover:bg-green-50 flex items-center gap-2"
                                  >
                                    <RotateCcw size={12} /> Unarchive Account
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
              <PaginationFooter
                page={accountsPage}
                size={LIST_PAGE_SIZE}
                totalElements={filteredAccounts.length}
                totalPages={Math.ceil(filteredAccounts.length / LIST_PAGE_SIZE)}
                onPageChange={setAccountsPage}
              />
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* ======================= TAB 2: GENERAL LEDGER ======================= */}
      {activeTab === 'gl' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16} /> Ledger Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">

                {/* Searchable GL Account Combobox */}
                <div className="md:col-span-1" ref={glAccountRef}>
                  <label className="block text-xs font-bold text-slate-500 mb-1">GL Account</label>
                  <div className="relative">
                    {glFilterAccount ? (
                      <div className="w-full px-3 py-2 text-xs border border-blue-400 rounded-md bg-blue-50 text-slate-700 font-medium flex items-center justify-between">
                        <span className="truncate flex-1">{selectedAccountLabel}</span>
                        <button
                          onClick={() => { setGlFilterAccount(''); setGlAccountSearch(''); }}
                          className="ml-2 text-slate-400 hover:text-red-500 flex-shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search by code or name..."
                          value={glAccountSearch}
                          onChange={e => { setGlAccountSearch(e.target.value); setGlAccountOpen(true); }}
                          onFocus={() => setGlAccountOpen(true)}
                          className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-blue-400"
                        />
                      </div>
                    )}

                    {glAccountOpen && !glFilterAccount && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                        <div
                          key="__all__"
                          onClick={() => { setGlFilterAccount(''); setGlAccountSearch(''); setGlAccountOpen(false); }}
                          className="px-3 py-2 text-xs cursor-pointer text-slate-400 hover:bg-slate-50 italic border-b border-slate-100"
                        >
                          All Accounts
                        </div>
                        {glAccountOptions.length === 0 ? (
                          <div key="__empty__" className="px-3 py-2 text-xs text-slate-400">No accounts found</div>
                        ) : glAccountOptions.map(a => (
                          <div
                            key={a.id}
                            onClick={() => { setGlFilterAccount(a.code); setGlAccountSearch(''); setGlAccountOpen(false); }}
                            className="px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
                          >
                            <span className="font-mono font-bold text-slate-500 w-16 flex-shrink-0">{a.code}</span>
                            <span className="text-slate-700 truncate">{a.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">From Date</label>
                  <input
                    type="date"
                    value={glFilterFrom}
                    onChange={e => setGlFilterFrom(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">To Date</label>
                  <input
                    type="date"
                    value={glFilterTo}
                    onChange={e => setGlFilterTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700"
                  />
                </div>
                <div>
                  <button
                    onClick={() => { setGlFilterAccount(''); setGlAccountSearch(''); setGlFilterFrom(firstOfMonth); setGlFilterTo(today); setGlTextSearch(''); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-xs font-bold hover:bg-slate-200"
                  >
                    <X size={14} /> Clear Filters
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-700">General Ledger Entries</h3>
                <p className="text-xs text-slate-500">{filteredGlData.length} of {glData.length} entries
                  {glFilterAccount && <span className="ml-1 font-semibold text-blue-600">· {selectedAccountLabel}</span>}
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search voucher, account, description..."
                  value={glTextSearch}
                  onChange={e => setGlTextSearch(e.target.value)}
                  className="w-full pl-7 pr-8 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-blue-400"
                />
                {glTextSearch && (
                  <button onClick={() => setGlTextSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                )}
              </div>
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
                  {filteredGlData.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-4 py-10 text-center text-xs text-slate-400">
                        No entries found{glFilterAccount ? ` for account ${selectedAccountLabel}` : ''}{glTextSearch ? ` matching "${glTextSearch}"` : ''}.
                      </td>
                    </tr>
                  )}
                  {pagedGl.map((entry, idx) => (
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
                        {entry.debit && <>↑ <CurrencySymbol /> {entry.debit.replace(/^[A-Z]+ /, '')}</>}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 font-medium">
                        {entry.credit && <>↓ <CurrencySymbol /> {entry.credit.replace(/^[A-Z]+ /, '')}</>}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${entry.balType === 'Dr' ? 'text-emerald-700' : 'text-red-700'}`}>
                        <CurrencySymbol /> {entry.balance.replace(/^[A-Z]+ /, '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationFooter
                page={glPage}
                size={LIST_PAGE_SIZE}
                totalElements={filteredGlData.length}
                totalPages={Math.ceil(filteredGlData.length / LIST_PAGE_SIZE)}
                onPageChange={setGlPage}
              />
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
                <Plus size={14} /> New Cost Center
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
                        <p>{cc.description || 'Departmental cost tracking and asset management'}</p>
                        <div className="flex gap-3">
                          <span className="flex items-center gap-1"><Building2 size={12} /> {cc.branch}</span>
                          <span className="flex items-center gap-1"><Users size={12} /> {cc.manager}</span>
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
                            style={{ width: `${Math.min(cc.percent, 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex justify-between items-end mb-4">
                        <div>
                          <div className="text-[10px] text-slate-400">Spent</div>
                          <div className="text-xs font-bold text-red-600"><CurrencySymbol /> {parseFloat(cc.spent).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">Budget</div>
                          <div className="text-xs font-bold text-slate-700"><CurrencySymbol /> {parseFloat(cc.budget).toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <BookOpen size={12} /> {getCostCenterMetrics(cc.code).linked} linked accounts
                        </div>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenCostCenterMenuId(openCostCenterMenuId === cc.id ? null : cc.id);
                            }}
                            className="hover:bg-slate-100 p-1 rounded text-slate-400 cc-action-trigger"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {openCostCenterMenuId === cc.id && (
                            <div className="cc-action-menu-dropdown absolute right-0 bottom-full mb-1 w-40 bg-white border border-slate-200 rounded-md shadow-xl z-50 text-left overflow-hidden">
                              {cc.status === 'active' ? (
                                <>
                                  <button
                                    onClick={() => handleEditCostCenter(cc)}
                                    className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                                  >
                                    <Edit size={12} /> Edit Cost Center
                                  </button>
                                  <button
                                    onClick={() => handleViewCostCenter(cc)}
                                    className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2"
                                  >
                                    <Eye size={12} /> View Details
                                  </button>
                                  <div className="h-px bg-slate-100 my-0"></div>
                                  <button
                                    onClick={() => handleArchiveClick(cc.id, 'costcenter')}
                                    className="w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <Archive size={12} /> Archive
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleUnarchive(cc.id, 'costcenter')}
                                  className="w-full px-4 py-2 text-xs text-green-600 hover:bg-green-50 flex items-center gap-2"
                                >
                                  <RotateCcw size={12} /> Unarchive Cost Center
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
      {activeTab === 'transactions' && (() => {
        const filteredTxn = glData.filter(entry => {
          const q = txnSearch.toLowerCase();
          const matchesText = !q || (
            (entry.voucher && entry.voucher.toLowerCase().includes(q)) ||
            (entry.accCode && entry.accCode.toLowerCase().includes(q)) ||
            (entry.accName && entry.accName.toLowerCase().includes(q)) ||
            (entry.desc && entry.desc.toLowerCase().includes(q))
          );
          const matchesFrom = !txnFilterFrom || (entry.date && entry.date >= txnFilterFrom);
          const matchesTo = !txnFilterTo || (entry.date && entry.date <= txnFilterTo);
          const matchesAccount = !txnFilterAccount || entry.accCode === txnFilterAccount;
          return matchesText && matchesFrom && matchesTo && matchesAccount;
        });

        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Search</label>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Voucher, account, description..."
                      value={txnSearch}
                      onChange={e => setTxnSearch(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Account</label>
                  <select
                    value={txnFilterAccount}
                    onChange={e => setTxnFilterAccount(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-blue-400"
                  >
                    <option value="">All Accounts</option>
                    {accounts.sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(a => (
                      <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">From Date</label>
                  <input type="date" value={txnFilterFrom} onChange={e => setTxnFilterFrom(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700 outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">To Date</label>
                  <input type="date" value={txnFilterTo} onChange={e => setTxnFilterTo(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700 outline-none focus:border-blue-400" />
                </div>
                {(txnSearch || txnFilterFrom || txnFilterTo || txnFilterAccount) && (
                  <button
                    onClick={() => { setTxnSearch(''); setTxnFilterFrom(''); setTxnFilterTo(''); setTxnFilterAccount(''); }}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 flex items-center gap-1"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
                <div className="ml-auto">
                  <button
                    onClick={() => { setTxnAccount(''); setTxnAmount(''); setTxnDesc(''); setIsTransactionModalOpen(true); }}
                    className="flex items-center gap-2 px-5 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold hover:bg-yellow-400 shadow-sm"
                  >
                    <Plus size={14} /> Add Transaction
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Transaction Journal</span>
                <span className="text-xs text-slate-400">{filteredTxn.length} {filteredTxn.length === 1 ? 'entry' : 'entries'}</span>
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
                    {filteredTxn.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">No transactions match your filters</td>
                      </tr>
                    ) : filteredTxn.map((entry, idx) => (
                      <tr key={entry.id || idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">{formatDisplayDate(entry.date)}</td>
                        <td className="px-4 py-3 text-slate-500">{entry.voucher}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-700">{entry.accCode}</div>
                          <div className="text-slate-400">{entry.accName}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{entry.desc}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">{entry.debit && <><CurrencySymbol /> {entry.debit.replace(/^[A-Z]+ /, '')}</>}</td>
                        <td className="px-4 py-3 text-right text-red-600 font-medium">{entry.credit && <><CurrencySymbol /> {entry.credit.replace(/^[A-Z]+ /, '')}</>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================= ARCHIVE CONFIRMATION MODAL ======================= */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-2xl w-[400px] overflow-hidden transform transition-all scale-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" /> Archive {archiveType === 'account' ? 'Account' : 'Cost Center'}
              </h3>
              <button onClick={() => setIsArchiveModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600">
                Are you sure you want to archive this item?
                <br /><br />
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
                <Eye size={18} className="text-slate-500" /> Account Details
              </h3>
              <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
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
                    <Building2 size={14} className="text-slate-400" />
                    {selectedAccountForView.branch}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cost Center</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Target size={14} className="text-slate-400" />
                    <span className="bg-slate-50 border border-slate-200 px-1.5 rounded text-xs">
                      {formatCostCenterDisplay(selectedAccountForView.cc)}
                    </span>
                  </div>
                </div>

              </div>
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Balance</p>
                <p className={`text-xl font-bold ${selectedAccountForView.balColor}`}><CurrencySymbol /> {selectedAccountForView.balance.replace(/^[A-Z]+ /, '')}</p>
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
                  <BookOpen size={20} className="text-slate-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{accId ? 'Edit Account' : 'Add New Account'}</h3>
                  <p className="text-xs text-slate-500 mt-1">{accId ? 'Update account details' : 'Create a new account in your chart of accounts'}</p>
                </div>
              </div>
              <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Account Name <span className="text-red-500">*</span></label>
                  <input type="text" value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Enter account name" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400" />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Account Code</label>
                  <input type="text" value={accCode} onChange={(e) => setAccCode(e.target.value)} placeholder="Auto-generated" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none text-slate-500" />
                  <p className="text-[10px] text-slate-400 mt-1">Leave empty for auto-generation</p>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Account Group <span className="text-red-500">*</span></label>
                  <CustomSelect placeholder="Select account group" options={['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity']} value={selectedGroup} onChange={setSelectedGroup} />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Sub Group</label>
                  <input type="text" value={accSubGroup} onChange={(e) => setAccSubGroup(e.target.value)} placeholder="e.g., Current Assets, Fixed Asset" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Parent Account</label>
                  <select
                    value={accParentCode}
                    onChange={(e) => setAccParentCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none bg-white text-slate-700"
                  >
                    <option value="">— None (Root Account) —</option>
                    {accounts
                      .filter(a => !accId || a.id !== accId)
                      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                      .map(a => (
                        <option key={a.id} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))
                    }
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Select a parent to nest this account in the tree hierarchy</p>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Branch</label>
                  <CustomSelect placeholder="Select branch" options={branchSelectOptions} value={selectedBranch} onChange={setSelectedBranch} />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Cost Center</label>
                  <CustomSelect
                    placeholder="Select cost center"
                    options={costCenterSelectOptions}
                    value={selectedCostCenter}
                    onChange={setSelectedCostCenter}
                    searchable
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Opening Balance</label>
                  <input type="number" value={accOpeningBalance} onChange={(e) => setAccOpeningBalance(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400" />
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
                    {isActive && <Check size={12} strokeWidth={4} className="text-white" />}
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
                  <Target size={20} className="text-slate-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Add New Cost Center</h3>
                  <p className="text-xs text-slate-500 mt-1">Create a new cost center for departmental budgeting and allocation</p>
                </div>
              </div>
              <button onClick={() => setIsCostCenterModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Cost Center Name <span className="text-red-500">*</span></label>
                  <input type="text" value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Enter cost center name" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400" />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Cost Center Code</label>
                  <input type="text" value={ccCode} onChange={(e) => setCcCode(e.target.value)} placeholder="Auto-generated" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none text-slate-500" />
                  <p className="text-[10px] text-slate-400 mt-1">Leave empty for auto-generation</p>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Branch <span className="text-red-500">*</span></label>
                  <CustomSelect placeholder="Select branch" options={branchSelectOptions} value={ccBranch} onChange={setCcBranch} />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Manager</label>
                  <CustomSelect placeholder="Select manager" options={employeeNames} value={ccManager} onChange={setCcManager} />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Budget Amount ({currency})</label>
                  <input type="number" value={ccBudget} onChange={(e) => setCcBudget(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none placeholder:text-slate-400" />
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
                <Activity size={18} className="text-slate-500" /> Record Transaction
              </h3>
              <button onClick={() => setIsTransactionModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Transaction Date</label>
                  <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Select Account <span className="text-red-500">*</span></label>
                  <CustomSelect
                    placeholder="Choose account"
                    options={accountSelectOptions}
                    value={txnAccount}
                    onChange={setTxnAccount}
                    searchable
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Type</label>
                    <CustomSelect placeholder="Debit" options={['Debit', 'Credit']} value={txnType} onChange={setTxnType} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Amount ({currency}) <span className="text-red-500">*</span></label>
                    <input type="number" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none" />
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

      {/* ======================= VIEW STATEMENT MODAL ======================= */}
      {isStatementModalOpen && selectedAccountForStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-2xl w-[900px] h-[80vh] flex flex-col overflow-hidden transform transition-all scale-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-blue-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Ledger Statement</h3>
                  <p className="text-xs text-slate-500 font-medium">Account: <span className="font-bold text-slate-700">{selectedAccountForStatement.name} ({selectedAccountForStatement.code})</span></p>
                </div>
              </div>
              <button onClick={() => setIsStatementModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6 border-b border-slate-100 bg-white flex items-end gap-4 shrink-0">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">From Date</label>
                <input type="date" value={statementStartDate} onChange={(e) => setStatementStartDate(e.target.value)} className="px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">To Date</label>
                <input type="date" value={statementEndDate} onChange={(e) => setStatementEndDate(e.target.value)} className="px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-700" />
              </div>
              <div>
                <button
                  onClick={() => fetchStatementData(selectedAccountForStatement.code, statementStartDate, statementEndDate)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-bold hover:bg-blue-100 transition-colors"
                >
                  <Search size={14} /> Filter Statement
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6">
              {loadingStatement ? (
                <div className="flex justify-center items-center h-40">
                  <div className="text-slate-500 text-sm font-medium animate-pulse">Loading statement...</div>
                </div>
              ) : !statementData || !statementData.runningBalanceLogs || statementData.runningBalanceLogs.length === 0 ? (
                <div className="flex justify-center items-center h-40">
                  <div className="text-slate-500 text-sm font-medium">No transactions found for this period.</div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <table className="bb-nowrap-table w-full text-left text-xs">
                    <thead className="bg-[#F7F7FA] text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Voucher</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-right">Debit</th>
                        <th className="px-4 py-3 text-right">Credit</th>
                        <th className="px-4 py-3 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-600">
                      {statementData.runningBalanceLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap">{formatDisplayDate(log.date || log.transactionDate)}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium">{log.voucherNo || log.reference}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] uppercase font-bold text-slate-400">{log.type}</td>
                          <td className="px-4 py-3">{log.description || log.particulars}</td>
                          <td className="px-4 py-3 text-right font-medium text-emerald-600">{log.debitAmount > 0 ? log.debitAmount.toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">{log.creditAmount > 0 ? log.creditAmount.toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800 transition-colors">
                            {log.runningBalance?.toLocaleString()} <span className="opacity-50 text-[10px] ml-1">{log.balanceType}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-right font-bold text-slate-700">Closing Balance:</td>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold text-blue-700 text-sm">
                          {statementData.runningBalanceLogs[statementData.runningBalanceLogs.length - 1]?.runningBalance?.toLocaleString()}
                          <span className="text-[10px] ml-1 opacity-70">
                            {statementData.runningBalanceLogs[statementData.runningBalanceLogs.length - 1]?.balanceType}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
};

export default Ledger;
