import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import {
    FileText, Plus, Search, Filter, Eye, MoreHorizontal, Download,
    Trash, Edit, CheckCircle2, AlertCircle, X, Save,
    ChevronLeft, PlusCircle, MinusCircle, FileSpreadsheet,
    Printer as PrintIcon, Ban, User, Clock,
    TrendingUp, DollarSign, ChevronDown, Check
} from 'lucide-react';
import * as ledgerApi from '../../api/ledgerApi';
import { employeesApi } from '../../api/employeesApi';
import { journalVoucherApi } from '../../api/journalVoucherApi';
import { getAuditTrail } from '../../api/auditApi';
import CurrencyAmount, { CurrencySymbol } from '../../components/CurrencyAmount';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import { buildDocumentHeaderProfile } from '../../utils/branchPrintProfile';
import { printHtml } from '../../utils/printGenerator';
import { getUsernameFromToken } from '../../api/auth';
import { formatDisplayDate } from '../../utils/dateUtils';
import { createRoot } from 'react-dom/client';
import { flushSync, createPortal } from 'react-dom';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { resolveVoucherSettings } from '../../utils/financialPrintTemplate';
import { JournalPreview } from './FinancialVoucherDesigner';
import LedgerAccountCreateModal from '../../components/common/LedgerAccountCreateModal';
import { formatUserDisplayName } from '../../utils/displayName';
import PaginationFooter from '../../components/common/PaginationFooter';
import TableSkeleton from '../../components/common/TableSkeleton';

const formatAccountLedgerLabel = (account = {}) => {
    const code = account.code ? `${account.code} - ` : '';
    return `${code}${account.name || ''}`.trim();
};

const ACCOUNT_GROUP_ORDER = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
const MAX_ACCOUNT_RESULTS = 100;

const getAccountGroupLabel = (account = {}) => account.accountGroup || account.accountType || 'Other';

// An untouched row (no account, no amounts) is ignored rather than rejected.
const isBlankJournalLine = (line = {}) =>
    !String(line.accountCode || line.account || '').trim()
    && !(parseFloat(line.debit) || 0)
    && !(parseFloat(line.credit) || 0);

const HighlightMatch = ({ text = '', query = '' }) => {
    const q = query.trim();
    if (!q) return text;
    const index = text.toLowerCase().indexOf(q.toLowerCase());
    if (index === -1) return text;
    return (
        <>
            {text.slice(0, index)}
            <mark className="rounded-sm bg-yellow-200/70 text-inherit">{text.slice(index, index + q.length)}</mark>
            {text.slice(index + q.length)}
        </>
    );
};

const AccountLedgerSearchSelect = ({ accounts = [], value, onChange, disabled, onCreateNew, hasError }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [menuPosition, setMenuPosition] = useState(null);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const menuRef = useRef(null);
    const listRef = useRef(null);

    const selectedAccount = useMemo(() => (
        accounts.find(account => account.name === value || account.code === value)
    ), [accounts, value]);

    const filteredAccounts = useMemo(() => {
        const text = query.trim().toLowerCase();
        if (!text) return accounts.slice(0, MAX_ACCOUNT_RESULTS);
        const matches = accounts.filter(account =>
            `${account.code || ''} ${account.name || ''} ${account.subGroup || ''}`.toLowerCase().includes(text));
        // Code-prefix matches first so typing "12" jumps straight to the 12xx range.
        const codePrefix = (account) => ((account.code || '').toLowerCase().startsWith(text) ? 0 : 1);
        return [...matches].sort((a, b) => codePrefix(a) - codePrefix(b)).slice(0, MAX_ACCOUNT_RESULTS);
    }, [accounts, query]);

    // Grouped for display; each item keeps its flat index for keyboard navigation.
    const groupedAccounts = useMemo(() => {
        const groups = new Map();
        filteredAccounts.forEach((account, flatIndex) => {
            const label = getAccountGroupLabel(account);
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push({ account, flatIndex });
        });
        const rank = (label) => {
            const index = ACCOUNT_GROUP_ORDER.indexOf(label);
            return index === -1 ? 99 : index;
        };
        return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
    }, [filteredAccounts]);

    // Navigation order must match the visual (grouped) order.
    const navigationOrder = useMemo(() => (
        groupedAccounts.flatMap(([, items]) => items.map(item => item.flatIndex))
    ), [groupedAccounts]);

    const updateMenuPosition = () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(Math.max(rect.width, 440), window.innerWidth - 24);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < 300 && rect.top > spaceBelow;
        setMenuPosition({
            left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
            width,
            top: openUp ? undefined : rect.bottom + 4,
            bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
            maxHeight: Math.min(380, (openUp ? rect.top : spaceBelow) - 16),
        });
    };

    useLayoutEffect(() => {
        if (!isOpen) return undefined;
        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);
        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
            setIsOpen(false);
            setQuery('');
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // When the search text changes, highlight the first row as it appears on screen.
    useEffect(() => {
        if (query) setActiveIndex(navigationOrder[0] ?? 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    useEffect(() => {
        if (!isOpen) return;
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, isOpen]);

    const openMenu = () => {
        if (disabled) return;
        setIsOpen(true);
        setQuery('');
        const selectedIndex = selectedAccount ? accounts.indexOf(selectedAccount) : -1;
        setActiveIndex(selectedIndex >= 0 && selectedIndex < MAX_ACCOUNT_RESULTS ? selectedIndex : 0);
    };

    const closeMenu = () => {
        setIsOpen(false);
        setQuery('');
    };

    const selectAccount = (account) => {
        onChange(account.name);
        closeMenu();
    };

    const moveActive = (step) => {
        if (navigationOrder.length === 0) return;
        const position = navigationOrder.indexOf(activeIndex);
        const next = Math.min(Math.max((position === -1 ? 0 : position) + step, 0), navigationOrder.length - 1);
        setActiveIndex(navigationOrder[next]);
    };

    const handleKeyDown = (event) => {
        if (!isOpen) {
            if (event.key === 'ArrowDown' || event.key === 'Enter') {
                event.preventDefault();
                openMenu();
                setTimeout(() => inputRef.current?.focus(), 0);
            }
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(-1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (filteredAccounts[activeIndex]) selectAccount(filteredAccounts[activeIndex]);
        } else if (event.key === 'Tab') {
            if (query && filteredAccounts[activeIndex]) selectAccount(filteredAccounts[activeIndex]);
            else closeMenu();
        } else if (event.key === 'Escape') {
            closeMenu();
        }
    };

    const menu = isOpen && !disabled && menuPosition && createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                left: menuPosition.left,
                width: menuPosition.width,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
            }}
            className="z-[1000] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-black/5"
        >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-400">
                <span>
                    {filteredAccounts.length} ledger{filteredAccounts.length === 1 ? '' : 's'}
                    {query ? ` matching "${query}"` : ''}
                </span>
                <span className="hidden sm:inline">↑↓ navigate · Enter select · Esc close</span>
            </div>
            <div
                ref={listRef}
                className="overflow-y-auto overscroll-contain pb-1"
                style={{ maxHeight: Math.max(menuPosition.maxHeight - (onCreateNew ? 72 : 30), 140) }}
            >
                {filteredAccounts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                        No account ledgers match "{query}"
                    </div>
                ) : groupedAccounts.map(([groupLabel, items]) => (
                    <div key={groupLabel}>
                        <div className="sticky top-0 z-10 border-b border-slate-50 bg-white px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {groupLabel}
                        </div>
                        {items.map(({ account, flatIndex }) => {
                            const isActive = flatIndex === activeIndex;
                            const isSelected = selectedAccount === account;
                            const balance = parseFloat(account.balanceAmount);
                            return (
                                <button
                                    type="button"
                                    key={account.id || account.code || account.name}
                                    data-index={flatIndex}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() => setActiveIndex(flatIndex)}
                                    onClick={() => selectAccount(account)}
                                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs ${isActive ? 'bg-[#FFF8E7]' : ''}`}
                                >
                                    <span className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-bold ${isActive || isSelected ? 'bg-[#F5C742] text-slate-900' : 'bg-slate-100 text-slate-500'}`}>
                                        <HighlightMatch text={account.code || '-'} query={query} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-medium leading-snug text-slate-800">
                                            <HighlightMatch text={account.name || ''} query={query} />
                                        </span>
                                        {account.subGroup && (
                                            <span className="block truncate text-[10px] text-slate-400">{account.subGroup}</span>
                                        )}
                                    </span>
                                    {Number.isFinite(balance) && balance !== 0 && (
                                        <span className="shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                                            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {account.balanceType || ''}
                                        </span>
                                    )}
                                    {isSelected && <Check size={14} className="shrink-0 text-emerald-600" />}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
            {onCreateNew && (
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { closeMenu(); onCreateNew(); }}
                    className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                    <PlusCircle size={14} /> Create new account ledger
                </button>
            )}
        </div>,
        document.body
    );

    const fieldBorder = hasError
        ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
        : 'border-slate-200 focus:border-yellow-400 focus:ring-yellow-100';

    return (
        <div ref={wrapperRef} className="relative min-w-0 flex-1">
            {!isOpen && selectedAccount ? (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => { openMenu(); setTimeout(() => inputRef.current?.focus(), 0); }}
                    onKeyDown={handleKeyDown}
                    title={formatAccountLedgerLabel(selectedAccount)}
                    className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-left text-xs hover:border-slate-300 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:cursor-default disabled:bg-slate-50"
                >
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                        {selectedAccount.code || '-'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{selectedAccount.name}</span>
                    {!disabled && <ChevronDown size={14} className="shrink-0 text-slate-400" />}
                </button>
            ) : (
                <div className="relative">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={isOpen ? query : (value || '')}
                        onFocus={() => { if (!isOpen) openMenu(); }}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setIsOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        placeholder={selectedAccount ? formatAccountLedgerLabel(selectedAccount) : 'Search code or name…'}
                        className={`h-9 w-full rounded-md border bg-white pl-8 pr-7 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 ${fieldBorder}`}
                    />
                    <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            )}
            {menu}
        </div>
    );
};


const JournalVoucher = () => {
    // Username of the currently authenticated user — used to stamp
    // preparedBy on new JVs and to record who posted/approved/rejected/voided.
    // Falls back to "System" if the token is missing (should not happen in
    // practice because the route is auth-guarded).
    const currentUser = getUsernameFromToken() || 'System';
    const currentUserDisplay = formatUserDisplayName(currentUser) || 'System';
    // --- STATE ---
    const { company } = useCompany();
    const { branches: availableBranches, activeBranch } = useBranch();
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [costCenters, setCostCenters] = useState([]);
    const [fullAccounts, setFullAccounts] = useState([]);
    const [fullCostCenters, setFullCostCenters] = useState([]);
    const [isAccountCreateOpen, setIsAccountCreateOpen] = useState(false);
    const [accountCreateTargetLine, setAccountCreateTargetLine] = useState(null);

    const loadLedgerData = async () => {
        const [accRes, ccRes] = await Promise.all([
            ledgerApi.getAccounts(),
            ledgerApi.getCostCenters()
        ]);

        const accountData = Array.isArray(accRes) ? accRes : [];
        const costCenterData = Array.isArray(ccRes) ? ccRes : [];

        setFullAccounts(accountData);
        setFullCostCenters(costCenterData);
        setCostCenters(costCenterData.map(c => c.name));

        return { accounts: accountData, costCenters: costCenterData };
    };

    // Fetch Ledger Data
    useEffect(() => {
        const fetchData = async () => {
            try {
                await loadLedgerData();
            } catch (error) {
                console.error("Failed to fetch ledger data", error);
            }
        };
        fetchData();
    }, []);

    // Fetch Employees
    const [employees, setEmployees] = useState([]);
    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const res = await employeesApi.getActiveEmployees();
                setEmployees(res);
            } catch (error) {
                console.error("Failed to fetch employees", error);
            }
        };
        fetchEmployees();
    }, []);

    // Fetch Journal Vouchers
    const [journalVouchers, setJournalVouchers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchJournalVouchers();
    }, []);

    // Refetch when the global Branch Selector changes the active branch.
    useEffect(() => {
        const handler = () => fetchJournalVouchers();
        window.addEventListener('billbull:branch-changed', handler);
        return () => window.removeEventListener('billbull:branch-changed', handler);
    }, []);

    const fetchJournalVouchers = async () => {
        setLoading(true);
        try {
            let data = await journalVoucherApi.getAll();
            
            // Fallback: If no journal entries from dedicated API, try filtering from global transactions
            if (!data || data.length === 0) {
                console.warn("Journal entries API returned empty. Attempting fallback from ledger transactions...");
                const allTransactions = await ledgerApi.getTransactions();
                const jvTransactions = allTransactions.filter(t => 
                    t.type === 'JOURNAL_VOUCHER' || 
                    t.type === 'JOURNAL_ENTRY' || 
                    t.type === 'Manual Journal' ||
                    t.voucherNo?.startsWith('JV-')
                );

                if (jvTransactions.length > 0) {
                    // Group by voucher number to reconstruct JV objects
                    const grouped = jvTransactions.reduce((acc, t) => {
                        if (!acc[t.voucherNo]) {
                            acc[t.voucherNo] = {
                                id: t.id,
                                entryNumber: t.voucherNo,
                                date: t.transactionDate,
                                reference: t.reference || '',
                                narration: t.description || '',
                                status: 'Posted',
                                preparedBy: 'System',
                                lines: []
                            };
                        }
                        acc[t.voucherNo].lines.push({
                            account: t.accountName,
                            accountCode: t.accountCode,
                            description: t.description,
                            debit: parseFloat(t.debitAmount || 0),
                            credit: parseFloat(t.creditAmount || 0),
                            costCenter: t.costCenterName || ''
                        });
                        return acc;
                    }, {});
                    data = Object.values(grouped);
                }
            }

            // Transform backend data to match frontend structure
            const transformed = data.map(jv => ({
                id: jv.id,
                jvNumber: jv.entryNumber || jv.voucherId || jv.jvNumber || jv.voucherNo,
                entryNumber: jv.entryNumber || jv.voucherId || jv.jvNumber || jv.voucherNo,
                date: jv.date,
                reference: jv.reference,
                narration: jv.narration,
                branchId: jv.branch?.id ?? null,
                branchName: jv.branch?.name || '',
                branchCode: jv.branch?.code || '',
                status: jv.status || 'Posted',
                preparedBy: formatUserDisplayName(jv.preparedBy || 'System'),
                postedBy: formatUserDisplayName(jv.postedBy || ''),
                postedAt: jv.postedAt,
                createdAt: jv.createdAt,
                updatedAt: jv.updatedAt,
                lines: jv.lines || [],
                debit: jv.lines?.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0) || jv.debit || 0,
                credit: jv.lines?.reduce((sum, line) => sum + parseFloat(line.credit || 0), 0) || jv.credit || 0
            }));
            setJournalVouchers(transformed);
        } catch (error) {
            console.error("Failed to fetch journal vouchers", error);
        } finally {
            setLoading(false);
        }
    };

    const [formErrors, setFormErrors] = useState({});
    const [formData, setFormData] = useState({
        id: null,
        jvNumber: '',
        entryNumber: '',
        date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
        status: 'Draft',
        preparedBy: currentUserDisplay,
        postedBy: null,
        postedAt: null,
        createdAt: null,
        updatedAt: null
    });

    const [journalLines, setJournalLines] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterUser, setFilterUser] = useState('All Users');
    const [filterDate, setFilterDate] = useState('This Month');
    const [auditLogs, setAuditLogs] = useState([]);
    const selectableAccounts = useMemo(() => (
        fullAccounts
            .filter(account => account && account.status !== 'archived' && account.isGroup !== true)
            .sort((left, right) => (left.code || '').localeCompare(right.code || ''))
    ), [fullAccounts]);

    const isLinesEditable = ['Draft', 'Rejected'].includes(formData.status) || formData.id == null;

    const findSelectableAccount = (value) => (
        fullAccounts.find(account => account.name === value || account.code === value)
    );

    const getJournalVoucherNumber = (journal = formData) =>
        journal?.jvNumber || journal?.entryNumber || journal?.voucherId || journal?.voucherNo || '';

    const normalizeAuditLog = (log = {}) => ({
        ...log,
        performedBy: formatUserDisplayName(log.performedBy || log.username || log.userId || 'System'),
        comments: log.comments || log.details || '',
        timestamp: log.timestamp || log.createdAt || log.updatedAt || null
    });

    const mergeAuditLogs = (logs = []) => {
        const seen = new Set();
        return logs
            .filter(Boolean)
            .map(normalizeAuditLog)
            .filter(log => {
                const key = log.id ? `${log.entityType || ''}-${log.id}` : `${log.entityType || ''}-${log.action || ''}-${log.timestamp || ''}-${log.comments || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    };

    const formatAuditTimestamp = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const fetchJournalAuditLogs = async (journal) => {
        const voucherNumber = getJournalVoucherNumber(journal);
        const ids = [...new Set([voucherNumber, journal?.id ? String(journal.id) : null].filter(Boolean))];
        const requests = ids.flatMap(entityId => [
            getAuditTrail('JOURNAL_VOUCHER', entityId).catch(() => []),
            getAuditTrail('JOURNAL_ENTRY', entityId).catch(() => [])
        ]);

        const results = await Promise.all(requests);
        return mergeAuditLogs(results.flat());
    };

    // --- COMPUTED ---
    const filteredData = useMemo(() => {
        return journalVouchers.filter(item => {
            const matchesSearch = (item.jvNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || '') ||
                (item.reference?.toLowerCase().includes(searchTerm.toLowerCase()) || '') ||
                (item.narration?.toLowerCase().includes(searchTerm.toLowerCase()) || '');

            const matchesStatus = filterStatus === 'All Status' || item.status === filterStatus;

            const matchesUser = filterUser === 'All Users' || item.preparedBy === filterUser;

            const matchesDate = (() => {
                if (filterDate === 'All Time') return true;
                if (filterDate === 'This Month') {
                    const itemDate = new Date(item.date);
                    const now = new Date();
                    return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
                }
                return true;
            })();

            return matchesSearch && matchesStatus && matchesUser && matchesDate;
        });
    }, [journalVouchers, searchTerm, filterStatus, filterUser, filterDate]);

    const LIST_PAGE_SIZE = 30;
    const [listPage, setListPage] = useState(0);
    useEffect(() => { setListPage(0); }, [searchTerm, filterStatus, filterUser, filterDate]);
    const pagedData = useMemo(
        () => filteredData.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
        [filteredData, listPage]
    );

    const lineTotals = useMemo(() => {
        const totalDebit = journalLines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
        const totalCredit = journalLines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
        return { totalDebit, totalCredit, difference: totalDebit - totalCredit };
    }, [journalLines]);

    // --- STATS CALCULATION ---
    const stats = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let todayTotal = 0;
        let todayCount = 0;
        let monthTotal = 0;
        let pendingTotal = 0;
        let totalEntries = journalVouchers.length;
        let pendingCount = 0;
        let postedCount = 0;

        journalVouchers.forEach(jv => {
            const jvDate = new Date(jv.date);
            const amount = parseFloat(jv.debit || 0); // Using debit as the 'amount' of the JV

            // Today
            if (jvDate.toDateString() === now.toDateString()) {
                todayTotal += amount;
                todayCount++;
            }

            // This Month
            if (jvDate.getMonth() === currentMonth && jvDate.getFullYear() === currentYear) {
                monthTotal += amount;
            }

            // Status
            if (jv.status === 'Draft') {
                pendingTotal += amount;
                pendingCount++;
            } else if (jv.status === 'Posted') {
                postedCount++;
            }
        });

        return {
            todayTotal: todayTotal.toFixed(2),
            todayCount,
            monthTotal: monthTotal.toFixed(2),
            pendingTotal: pendingTotal.toFixed(2),
            pendingCount,
            postedCount,
            totalEntries
        };
    }, [journalVouchers]);

    // --- HANDLERS ---
    // New lines are pre-filled with whatever amount is still needed to balance the entry.
    const handleAddLine = () => {
        const remaining = Math.round(Math.abs(lineTotals.difference) * 100) / 100;
        const needsCredit = lineTotals.difference > 0;
        setJournalLines([...journalLines, {
            account: '',
            accountCode: '',
            description: '',
            debit: remaining >= 0.01 && !needsCredit ? remaining : 0,
            credit: remaining >= 0.01 && needsCredit ? remaining : 0,
            costCenter: ''
        }]);
    };

    const handleRemoveLine = (index) => {
        const newLines = [...journalLines];
        newLines.splice(index, 1);
        setJournalLines(newLines);
    };

    const handleLineChange = (index, field, value) => {
        const newLines = [...journalLines];
        newLines[index][field] = value;

        // A journal line is either a debit or a credit, never both.
        if (field === 'debit' && (parseFloat(value) || 0) !== 0) newLines[index].credit = 0;
        if (field === 'credit' && (parseFloat(value) || 0) !== 0) newLines[index].debit = 0;

        if (field === 'account') {
            const selectedAccount = findSelectableAccount(value);
            if (selectedAccount) {
                // Set Account Code
                newLines[index].accountCode = selectedAccount.code;

                // Auto-set Cost Center
                if (selectedAccount.costCenterCode && selectedAccount.costCenterCode !== '-') {
                    const linkedCC = fullCostCenters.find(cc => cc.code === selectedAccount.costCenterCode);
                    if (linkedCC) {
                        newLines[index].costCenter = linkedCC.name;
                    }
                } else {
                    // Clear Cost Center if not applicable
                    newLines[index].costCenter = '';
                }

                // Auto-set Debit/Credit based on Balance, unless the line already has an amount
                const lineHasAmount = (parseFloat(newLines[index].debit) || 0) !== 0 || (parseFloat(newLines[index].credit) || 0) !== 0;
                if (selectedAccount.balanceAmount && !lineHasAmount) {
                    const balance = parseFloat(selectedAccount.balanceAmount);
                    if (selectedAccount.balanceType === 'Dr') {
                        newLines[index].debit = balance;
                        newLines[index].credit = 0;
                    } else {
                        newLines[index].credit = balance;
                        newLines[index].debit = 0;
                    }
                }
            } else {
                // Clear details if account is cleared
                newLines[index].accountCode = '';
            }
        }

        setJournalLines(newLines);
    };

    const openAccountCreate = (lineIndex) => {
        setAccountCreateTargetLine(lineIndex);
        setIsAccountCreateOpen(true);
    };

    const handleAccountCreated = async (createdAccount) => {
        let account = createdAccount;
        try {
            const refreshed = await loadLedgerData();
            account = refreshed.accounts.find(item => item.id === createdAccount?.id) || createdAccount;
        } catch (error) {
            console.error("Failed to refresh ledger accounts", error);
            if (createdAccount?.name) {
                setFullAccounts(prev => [...prev, createdAccount]);
            }
        }

        if (accountCreateTargetLine !== null && account?.name) {
            setJournalLines(prev => {
                const next = [...prev];
                const line = { ...(next[accountCreateTargetLine] || {}) };
                line.account = account.name;
                line.accountCode = account.code || '';

                if (account.costCenterCode && account.costCenterCode !== '-') {
                    const linkedCC = fullCostCenters.find(cc => cc.code === account.costCenterCode);
                    line.costCenter = linkedCC?.name || line.costCenter || '';
                }

                next[accountCreateTargetLine] = line;
                return next;
            });
        }

        setAccountCreateTargetLine(null);
    };

    const handleCreate = () => {
        setFormData({
            id: null,
            jvNumber: '',
            entryNumber: '',
            date: new Date().toISOString().split('T')[0],
            reference: '',
            narration: '',
            status: 'Draft',
            preparedBy: currentUserDisplay
        });
        setJournalLines([
            { account: '', description: '', debit: 0, credit: 0, costCenter: '' }
        ]);
        setFormErrors({});
        setViewMode('create');
    };

    const handleView = async (journal) => {
        const voucherNumber = getJournalVoucherNumber(journal);
        setFormData({
            id: journal.id,
            jvNumber: voucherNumber,
            entryNumber: voucherNumber,
            date: journal.date,
            reference: journal.reference,
            narration: journal.narration,
            status: journal.status,
            preparedBy: journal.preparedBy,
            postedBy: journal.postedBy,
            postedAt: journal.postedAt,
            createdAt: journal.createdAt,
            updatedAt: journal.updatedAt,
            branchId: journal.branchId ?? null,
            branchName: journal.branchName || '',
        });
        // Use actual lines from the backend
        setJournalLines(journal.lines || []);
        setViewMode('view');

        try {
            const logs = await fetchJournalAuditLogs(journal);
            setAuditLogs(logs);
        } catch (error) {
            console.error("Failed to fetch audit logs", error);
            setAuditLogs([]);
        }
    };

    const handleEdit = (journal) => {
        if (journal.status === 'Posted') {
            handleView(journal);
            return;
        }

        setFormData({
            id: journal.id,
            jvNumber: getJournalVoucherNumber(journal),
            entryNumber: getJournalVoucherNumber(journal),
            date: journal.date,
            reference: journal.reference,
            narration: journal.narration,
            status: journal.status,
            preparedBy: journal.preparedBy || '',
            branchId: journal.branchId ?? null,
            branchName: journal.branchName || '',
        });

        // Use actual lines from the backend
        setJournalLines(journal.lines || []);
        setFormErrors({});
        setViewMode('create');
    };

    // Returns an errors object keyed by field; empty means the journal may be saved.
    const validateJournal = () => {
        const errors = {};
        if (!formData.date || !String(formData.date).trim()) {
            errors.date = 'Journal date is required.';
        } else if (Number.isNaN(new Date(formData.date).getTime())) {
            errors.date = 'Enter a valid journal date.';
        }
        if (!formData.narration || !String(formData.narration).trim()) {
            errors.narration = 'Narration is required.';
        }
        if (!formData.preparedBy || !String(formData.preparedBy).trim()) {
            errors.preparedBy = 'Prepared By is required.';
        }
        const filledLines = journalLines.filter(line => !isBlankJournalLine(line));
        const lineProblem = filledLines.findIndex(line => {
            const debit = parseFloat(line.debit) || 0;
            const credit = parseFloat(line.credit) || 0;
            const hasAccount = Boolean(String(line.accountCode || line.account || '').trim());
            return !hasAccount || debit < 0 || credit < 0 || (debit > 0) === (credit > 0);
        });
        if (filledLines.length < 2) {
            errors.lines = 'Add at least two journal lines with an account and an amount.';
        } else if (lineProblem !== -1) {
            errors.lines = `Line ${journalLines.indexOf(filledLines[lineProblem]) + 1}: select an account and enter either a debit or a credit amount.`;
        } else if (lineTotals.totalDebit < 0.01) {
            errors.lines = 'Journal total must be greater than zero.';
        } else if (Math.abs(lineTotals.difference) > 0.01) {
            errors.lines = 'Debits and credits must balance before saving.';
        }
        return errors;
    };

    const handleSave = async (targetStatus = 'Draft') => {
        const errors = validateJournal();
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) {
            return;
        }

        try {
            // Always save as Draft first to allow the specific 'post' endpoint to handle validation and state transition
            const payload = {
                date: formData.date,
                reference: formData.reference,
                narration: formData.narration,
                preparedBy: formData.preparedBy,
                status: 'Draft',
                lines: journalLines.filter(line => !isBlankJournalLine(line)).map(line => ({
                    account: line.account,
                    accountCode: line.accountCode,
                    description: line.description,
                    debit: parseFloat(line.debit) || 0,
                    credit: parseFloat(line.credit) || 0,
                    costCenter: line.costCenter
                }))
            };

            let result;
            if (formData.id) {
                // Update existing
                result = await journalVoucherApi.update(formData.id, payload);
            } else {
                // Create new
                result = await journalVoucherApi.create(payload);
            }

            // State transitions record the *actor* (current user), NOT the
            // person who originally prepared the JV — same user can prepare,
            // a different one approves/posts.
            if (targetStatus === 'Posted' && result.id) {
                await journalVoucherApi.post(result.id, currentUser);
            } else if (targetStatus === 'Submitted' && result.id) {
                await journalVoucherApi.submit(result.id, currentUser);
            }

            // Refresh the list
            await fetchJournalVouchers();
            setViewMode('list');
        } catch (error) {
            console.error('Failed to save journal voucher:', error);
            alert(error.response?.data?.message || error.response?.data || 'Failed to save journal voucher');
        }
    };

    const handleStatusAction = async (action) => {
        try {
            if (action === 'submit') {
                await journalVoucherApi.submit(formData.id, currentUser);
            } else if (action === 'approve') {
                await journalVoucherApi.approve(formData.id, currentUser);
            } else if (action === 'reject') {
                const reason = prompt('Reason for rejection:');
                if (reason === null) return;
                await journalVoucherApi.reject(formData.id, currentUser, reason);
            } else if (action === 'post') {
                await journalVoucherApi.post(formData.id, currentUser);
            }
            await fetchJournalVouchers();
            setViewMode('list');
        } catch (error) {
            console.error('Action failed:', error);
            alert(error.response?.data?.message || error.response?.data || 'Failed to update status');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Posted': return 'bg-purple-50 text-purple-700 border border-purple-100';
            case 'Draft': return 'bg-slate-50 text-slate-600 border border-slate-200';
            case 'Submitted': return 'bg-blue-50 text-blue-700 border border-blue-100';
            case 'Approved': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
            case 'Rejected': return 'bg-red-50 text-red-700 border border-red-100';
            case 'Voided': return 'bg-red-50 text-red-600 border border-red-200 line-through';
            default: return 'bg-slate-50 text-slate-600';
        }
    };

    // Resolves the configured Journal Voucher template (header/terms/footer/paper)
    // before rendering. Falls back to the built-in default if none configured.
    const buildJvPrintHtml = async (jv) => {
        let template = null;
        try {
            const templates = await getTemplatesByCategory('Journal Voucher');
            template = templates?.find(t => t.isDefault) || templates?.[0] || null;
        } catch (err) {
            console.warn('Failed to load JV template, using built-in default', err);
        }
        const lines = (jv.lines || journalLines).filter(l => l.account || l.debit || l.credit);

        const branchProfile = buildDocumentHeaderProfile({
            company,
            branches: availableBranches || [],
            branchId: jv?.branchId ?? activeBranch?.id,
        });

        const settings = resolveVoucherSettings('journal-voucher', template);
        const voucherCurrency = jv.currency || company?.currency || 'AED';

        // Width must match the paper content area so flex layout behaves the same as the on-screen preview
        const PAPER_PX = { A4: 794, A5: 559, Letter: 816 };
        const paperWidthPx = PAPER_PX[settings.paperSize] || PAPER_PX.A4;

        // Render the same React component used in the designer preview
        const container = document.createElement('div');
        container.style.cssText = `width:${paperWidthPx}px;position:absolute;top:-9999px;left:-9999px;visibility:hidden;`;
        document.body.appendChild(container);
        const root = createRoot(container);
        const resolvedBranch = jv.branchName
            || (availableBranches?.find(b => b.id === (jv.branchId ?? activeBranch?.id))?.name)
            || activeBranch?.name
            || '';
        flushSync(() => {
            root.render(
                <JournalPreview
                    s={settings}
                    currency={voucherCurrency}
                    company={branchProfile}
                    data={{ ...jv, lines, branch: resolvedBranch }}
                />
            );
        });
        const bodyHtml = container.innerHTML;
        root.unmount();
        document.body.removeChild(container);

        const PAPER = { A4: '210mm 297mm', A5: '148mm 210mm', Letter: '8.5in 11in' };
        const paper = PAPER[settings.paperSize] || PAPER.A4;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Journal Voucher ${jv.jvNumber || jv.entryNumber || ''}</title>
<style>
@page { size: ${paper}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
    };

    const getCurrentJvPrintPayload = () => {
        const voucherNumber = getJournalVoucherNumber(formData);
        return {
            ...formData,
            jvNumber: voucherNumber,
            entryNumber: voucherNumber,
            lines: journalLines
        };
    };

    // --- PRINT / EXPORT / CLONE / VOID ---
    const handlePrint = async () => {
        const jv = getCurrentJvPrintPayload();
        printHtml(await buildJvPrintHtml(jv));
    };

    const handleListPrint = async (journal) => {
        printHtml(await buildJvPrintHtml(journal));
    };

    const handleExportPdf = async () => {
        const jv = getCurrentJvPrintPayload();
        const html = await buildJvPrintHtml(jv);
        // Inject PDF-friendly title so the browser's Save-as-PDF filename is meaningful
        const titled = html.replace(/<title>.*?<\/title>/i,
            `<title>JV_${jv.jvNumber || formData.reference || formData.id || 'export'}_${formData.date || ''}</title>`);
        printHtml(titled);
    };

    const handleClone = () => {
        setFormData({
            id: null,
            jvNumber: '',
            entryNumber: '',
            date: new Date().toISOString().split('T')[0],
            reference: '',
            narration: formData.narration,
            status: 'Draft',
            preparedBy: currentUserDisplay,
            postedBy: null,
            postedAt: null,
            createdAt: null,
            updatedAt: null
        });
        setJournalLines(journalLines.map(l => ({ ...l })));
        setFormErrors({});
        setViewMode('create');
    };

    const handleVoidJV = async () => {
        if (!formData.id) return;
        if (!window.confirm(`Void Journal Voucher ${getJournalVoucherNumber(formData) || formData.reference}?\n\nThis will permanently void this entry. If posted, a reversal entry will be created automatically.`)) return;
        try {
            await journalVoucherApi.void(formData.id, currentUser);
            await fetchJournalVouchers();
            setViewMode('list');
        } catch (error) {
            alert(error.response?.data?.message || error.response?.data || 'Failed to void journal voucher.');
        }
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 lg:p-6">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        {viewMode === 'list' && <><FileText className="text-[#F5C742]" size={28} /> Journal Vouchers</>}
                        {viewMode !== 'list' && (
                            <button onClick={() => setViewMode('list')} className="mr-2 hover:bg-slate-100 p-1 rounded-full"><ChevronLeft size={24} /></button>
                        )}
                        {viewMode !== 'list' && (formData.id ? (formData.status === 'Posted' ? 'View Journal Voucher' : 'Edit Journal Voucher') : 'Create Journal Voucher')}
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        {viewMode === 'list' ? 'Adjustments, corrections & non-cash entries' : 'Balance debits & credits before posting'}
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">Financials &rarr; <span className="font-semibold text-slate-600">Journal Voucher</span></div>
                </div>

                {viewMode === 'list' && (
                    <div className="flex gap-2">
                        <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                            <FileSpreadsheet size={16} /> Export Excel
                        </button>
                        <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                            <Download size={16} /> Export PDF
                        </button>
                        <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold shadow-sm hover:bg-yellow-400">
                            <Plus size={16} /> Create Journal
                        </button>
                    </div>
                )}

                {viewMode !== 'list' && viewMode !== 'view' && (
                    <div className="flex gap-2">
                        <button onClick={() => setViewMode('list')} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50">
                            Cancel
                        </button>

                        {(formData.status === 'Draft' || formData.status === 'Rejected') && (
                            <button
                                onClick={() => handleSave('Draft')}
                                className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 flex items-center gap-2 hover:bg-slate-50"
                            >
                                <Save size={16} /> Save Changes
                            </button>
                        )}

                        {(formData.status === 'Draft' || formData.status === 'Rejected') && formData.id && (
                            <button onClick={() => handleSave('Submitted')} className="px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700">
                                Submit for Approval
                            </button>
                        )}

                        {formData.status === 'Submitted' && (
                            <>
                                <button onClick={() => handleStatusAction('approve')} className="px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                                    <CheckCircle2 size={16} /> Approve
                                </button>
                                <button onClick={() => handleStatusAction('reject')} className="px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 bg-red-600 text-white hover:bg-red-700">
                                    <X size={16} /> Reject
                                </button>
                            </>
                        )}

                        {formData.status === 'Approved' && (
                            <button onClick={() => handleStatusAction('post')} className="px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 bg-purple-600 text-white hover:bg-purple-700">
                                <CheckCircle2 size={16} /> Post Journal
                            </button>
                        )}

                        {/* Convenience action for fast posting directly from Draft if newly created (so forms don't need multiple clicks) */}
                        {!formData.id && (
                            <button
                                onClick={() => handleSave('Submitted')}
                                className="px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Save & Submit
                            </button>
                        )}
                    </div>
                )}

                {viewMode === 'view' && (
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                            <PrintIcon size={14} /> Print
                        </button>
                        <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                            <Download size={14} /> Export PDF
                        </button>
                        <button onClick={handleClone} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                            <MoreHorizontal size={14} /> Clone
                        </button>
                        {formData.status !== 'Voided' && (
                            <button onClick={handleVoidJV} className="flex items-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-600 rounded text-xs font-bold hover:bg-red-50 shadow-sm">
                                <Ban size={14} /> Void JV
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* LIST VIEW */}
            {viewMode === 'list' && (
                <>
                    {/* STATS CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Today's Journals</p>
                                    <CurrencyAmount value={stats.todayTotal} className="text-2xl font-bold text-slate-800 mt-1" />
                                    <p className="text-[10px] text-slate-400 mt-1">{stats.todayCount} transactions</p>
                                </div>
                                <div className="p-2 bg-[#F5C742] rounded text-slate-900">
                                    <DollarSign size={20} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">This Month</p>
                                    <CurrencyAmount value={stats.monthTotal} className="text-2xl font-bold text-slate-800 mt-1" />
                                    <p className="text-[10px] text-slate-400 mt-1">Total Volume</p>
                                </div>
                                <div className="p-2 bg-emerald-50 rounded text-emerald-600">
                                    <TrendingUp size={20} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Draft Volume</p>
                                    <CurrencyAmount value={stats.pendingTotal} className="text-2xl font-bold text-slate-800 mt-1" />
                                    <p className="text-[10px] text-slate-400 mt-1">{stats.pendingCount} drafts pending</p>
                                </div>
                                <div className="p-2 bg-orange-50 rounded text-orange-600">
                                    <Clock size={20} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Total Journals</p>
                                    <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalEntries}</h3>
                                    <p className="text-[10px] text-slate-400 mt-1">All time</p>
                                </div>
                                <div className="p-2 bg-indigo-50 rounded text-indigo-600">
                                    <FileText size={20} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">

                        {/* FILTERS */}
                        <div className="mb-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16} /> Filters</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div className="relative">
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                                    <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Search JV no, ref..."
                                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Range</label>
                                    <select
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                    >
                                        <option value="This Month">This Month</option>
                                        <option value="All Time">All Time</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Status</label>
                                    <select
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                    >
                                        <option value="All Status">All Status</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Submitted">Submitted</option>
                                        <option value="Approved">Approved</option>
                                        <option value="Rejected">Rejected</option>
                                        <option value="Posted">Posted</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Prepared By</label>
                                    <select
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                        value={filterUser}
                                        onChange={(e) => setFilterUser(e.target.value)}
                                    >
                                        <option value="All Users">All Users</option>
                                        {employees.map((emp) => (
                                            <option key={emp.id} value={`${emp.firstName} ${emp.lastName}`}>
                                                {emp.firstName} {emp.lastName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-0">
                            {/* Removed the old list header as it's redundant with the card styling usually, but keeping simple count if needed */}
                        </div>
                        {/* </div>  <-- Removing this closing div to keep table inside or separate? 
                            In ReceiptVoucher, table is inside the same card if filters are there, or separate.
                            ReceiptVoucher: "FILTERS & TABLE" are in one card "bg-white rounded-lg ... p-5".
                            So I will keep the div open and put the table inside it.
                        */}

                        {/* TABLE */}
                        <div className="overflow-x-auto">
                            <table className="bb-nowrap-table w-full text-left border-collapse">
                                <thead className="bg-[#F7F7FA] text-slate-600 font-semibold text-xs border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3">JV No.</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Reference</th>
                                        <th className="px-4 py-3">Branch</th>
                                        <th className="px-4 py-3">Narration</th>
                                        <th className="px-4 py-3 text-right">Debit (<CurrencySymbol />)</th>
                                        <th className="px-4 py-3 text-right">Credit (<CurrencySymbol />)</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {loading && <TableSkeleton cols={6} rows={8} />}
                                    {pagedData.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-700">{row.jvNumber}</td>
                                            <td className="px-4 py-3 text-slate-500">{formatDisplayDate(row.date)}</td>
                                            <td className="px-4 py-3 text-slate-500">{row.reference}</td>
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
                                            <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{row.narration}</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-700"><CurrencyAmount value={row.debit} /></td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-700"><CurrencyAmount value={row.credit} /></td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadge(row.status)}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button className="p-1 hover:bg-slate-200 rounded text-slate-400" onClick={() => handleView(row)} title="View Detail"><Eye size={14} /></button>
                                                <button className="p-1 hover:bg-slate-200 rounded text-slate-400 ml-1" onClick={() => handleListPrint(row)} title="Print"><PrintIcon size={14} /></button>
                                                {row.status !== 'Posted' && (
                                                    <button className="p-1 hover:bg-slate-200 rounded text-slate-400 ml-1" onClick={() => handleEdit(row)} title="Edit/Action"><Edit size={14} /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <PaginationFooter
                                page={listPage}
                                size={LIST_PAGE_SIZE}
                                totalElements={filteredData.length}
                                totalPages={Math.ceil(filteredData.length / LIST_PAGE_SIZE)}
                                onPageChange={setListPage}
                            />
                        </div>
                    </div> {/* Closing the card div */}
                </>
            )}

            {/* CREATE / EDIT VIEW */}
            {
                viewMode === 'create' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* FORM SECTION */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* HEADER DETAILS */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                <h3 className="text-sm font-bold text-slate-700 mb-4 pb-2 border-b border-slate-100">Journal Details</h3>

                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Journal Date <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                            value={formData.date}
                                            onChange={(e) => {
                                                setFormData({ ...formData, date: e.target.value });
                                                setFormErrors(prev => ({ ...prev, date: undefined }));
                                            }}
                                            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none text-slate-600 disabled:bg-slate-50 disabled:text-slate-400 ${formErrors.date ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-yellow-400'}`}
                                        />
                                        {formErrors.date
                                            ? <p className="text-[10px] font-medium text-red-600 mt-1">{formErrors.date}</p>
                                            : <p className="text-[10px] text-slate-400 mt-1">dd-mm-yyyy</p>}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Reference No.</label>
                                        <input
                                            type="text"
                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                            value={formData.reference}
                                            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 disabled:bg-slate-50 disabled:text-slate-400"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">Optional internal reference</p>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Narration <span className="text-red-500">*</span></label>
                                    <textarea
                                        rows="2"
                                        disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                        value={formData.narration}
                                        onChange={(e) => {
                                            setFormData({ ...formData, narration: e.target.value });
                                            setFormErrors(prev => ({ ...prev, narration: undefined }));
                                        }}
                                        placeholder="Describe the purpose of this journal entry..."
                                        className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none text-slate-600 resize-none disabled:bg-slate-50 disabled:text-slate-400 ${formErrors.narration ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-yellow-400'}`}
                                    />
                                    {formErrors.narration && (
                                        <p className="text-[10px] font-medium text-red-600 mt-1">{formErrors.narration}</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Prepared By <span className="text-red-500">*</span></label>
                                        <select
                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                            value={formData.preparedBy}
                                            onChange={(e) => {
                                                setFormData({ ...formData, preparedBy: e.target.value });
                                                setFormErrors(prev => ({ ...prev, preparedBy: undefined }));
                                            }}
                                            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none text-slate-600 disabled:bg-slate-50 disabled:text-slate-400 appearance-none bg-white ${formErrors.preparedBy ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-yellow-400'}`}
                                        >
                                            <option value="" disabled>Select Employee</option>

                                            {employees.map((emp) => (
                                                <option key={emp.id} value={`${emp.firstName} ${emp.lastName}`}>
                                                    {emp.firstName} {emp.lastName}
                                                </option>
                                            ))}
                                        </select>
                                        {formErrors.preparedBy && (
                                            <p className="text-[10px] font-medium text-red-600 mt-1">{formErrors.preparedBy}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusBadge(formData.status)}`}>{formData.status}</span>
                                    </div>
                                </div>
                            </div>

                            {/* LINES SECTION */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700">Journal Lines</h3>
                                        <p className="text-[11px] text-slate-400">
                                            {journalLines.length} line{journalLines.length === 1 ? '' : 's'} · each line is either a debit or a credit
                                        </p>
                                    </div>
                                    {isLinesEditable && (
                                        <button onClick={handleAddLine} className="px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-md text-xs font-bold hover:bg-emerald-50 flex items-center gap-1">
                                            <Plus size={14} /> Add Line
                                        </button>
                                    )}
                                </div>

                                {journalLines.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-10 text-slate-400">
                                        <FileSpreadsheet size={40} className="mb-3 text-slate-200" />
                                        <p className="text-sm">No journal lines added yet</p>
                                        {isLinesEditable && (
                                            <button onClick={handleAddLine} className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline">
                                                <Plus size={14} /> Add the first line
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                                        <table className="w-full min-w-[820px] table-fixed text-xs">
                                            <colgroup>
                                                <col className="w-10" />
                                                <col className="w-[30%]" />
                                                <col />
                                                <col className="w-[13%]" />
                                                <col className="w-[13%]" />
                                                <col className="w-[15%]" />
                                                <col className="w-10" />
                                            </colgroup>
                                            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                <tr className="border-b border-slate-200">
                                                    <th className="px-2 py-2.5 text-center">#</th>
                                                    <th className="px-2 py-2.5 text-left">Account Ledger</th>
                                                    <th className="px-2 py-2.5 text-left">Description</th>
                                                    <th className="px-2 py-2.5 text-right">Debit (<CurrencySymbol />)</th>
                                                    <th className="px-2 py-2.5 text-right">Credit (<CurrencySymbol />)</th>
                                                    <th className="px-2 py-2.5 text-left">Cost Centre</th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {journalLines.map((line, idx) => {
                                                    const selectedAccount = findSelectableAccount(line.account);
                                                    const isCostCenterApplicable = selectedAccount && selectedAccount.costCenterCode && selectedAccount.costCenterCode !== '-';
                                                    const hasDebit = (parseFloat(line.debit) || 0) !== 0;
                                                    const hasCredit = (parseFloat(line.credit) || 0) !== 0;
                                                    const amountInput = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right text-xs tabular-nums placeholder:text-slate-300 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:bg-slate-50 disabled:text-slate-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

                                                    return (
                                                        <tr key={idx} className="group align-middle hover:bg-slate-50/60">
                                                            <td className="px-2 py-2 text-center text-[11px] font-semibold text-slate-400">{idx + 1}</td>
                                                            <td className="px-2 py-2">
                                                                <AccountLedgerSearchSelect
                                                                    accounts={selectableAccounts}
                                                                    value={line.account}
                                                                    onChange={(accountName) => handleLineChange(idx, 'account', accountName)}
                                                                    onCreateNew={isLinesEditable ? () => openAccountCreate(idx) : undefined}
                                                                    disabled={!isLinesEditable}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Line description (optional)"
                                                                    disabled={!isLinesEditable}
                                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs placeholder:text-slate-300 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:bg-slate-50 disabled:text-slate-500"
                                                                    value={line.description}
                                                                    onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    placeholder="0.00"
                                                                    disabled={!isLinesEditable}
                                                                    className={`${amountInput} ${hasDebit ? 'font-semibold text-slate-900' : ''}`}
                                                                    value={line.debit === 0 ? '' : line.debit}
                                                                    onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                                                                    onFocus={(e) => e.target.select()}
                                                                    onWheel={(e) => e.currentTarget.blur()}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    placeholder="0.00"
                                                                    disabled={!isLinesEditable}
                                                                    className={`${amountInput} ${hasCredit ? 'font-semibold text-slate-900' : ''}`}
                                                                    value={line.credit === 0 ? '' : line.credit}
                                                                    onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                                                                    onFocus={(e) => e.target.select()}
                                                                    onWheel={(e) => e.currentTarget.blur()}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <select
                                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:bg-slate-50 disabled:text-slate-400"
                                                                    value={line.costCenter}
                                                                    onChange={(e) => handleLineChange(idx, 'costCenter', e.target.value)}
                                                                    disabled={!isLinesEditable || !isCostCenterApplicable}
                                                                    title={!isCostCenterApplicable ? 'This ledger does not use cost centres' : undefined}
                                                                >
                                                                    <option value="" disabled>{isCostCenterApplicable ? 'Select CC' : 'N/A'}</option>
                                                                    {costCenters.map((cc, i) => <option key={i} value={cc}>{cc}</option>)}
                                                                </select>
                                                            </td>
                                                            <td className="px-1 py-2 text-center">
                                                                {isLinesEditable && (
                                                                    <button
                                                                        type="button"
                                                                        title="Remove line"
                                                                        onClick={() => handleRemoveLine(idx)}
                                                                        className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 group-hover:text-slate-400"
                                                                    >
                                                                        <Trash size={14} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="border-t border-slate-200 bg-slate-50/70 text-xs">
                                                {isLinesEditable && (
                                                    <tr>
                                                        <td colSpan={7} className="p-0">
                                                            <button
                                                                type="button"
                                                                onClick={handleAddLine}
                                                                className="flex w-full items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 text-left text-xs font-semibold text-emerald-600 hover:bg-emerald-50"
                                                            >
                                                                <Plus size={14} /> Add line
                                                                {Math.abs(lineTotals.difference) >= 0.01 && (
                                                                    <span className="font-normal text-slate-400">
                                                                        · pre-filled with {Math.abs(lineTotals.difference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {lineTotals.difference > 0 ? 'credit' : 'debit'} to balance
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className="font-bold text-slate-700">
                                                    <td />
                                                    <td className="px-2 py-2.5" colSpan={2}>
                                                        {Math.abs(lineTotals.difference) < 0.01 ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> Balanced</span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-red-600">
                                                                <AlertCircle size={14} /> Out of balance by <CurrencyAmount value={Math.abs(lineTotals.difference)} />
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right"><CurrencyAmount value={lineTotals.totalDebit} /></td>
                                                    <td className="px-4 py-2.5 text-right"><CurrencyAmount value={lineTotals.totalCredit} /></td>
                                                    <td colSpan={2} />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SUMMARY SECTION */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 sticky top-6">
                                <h3 className="text-sm font-bold text-slate-700 mb-4 pb-2 border-b border-slate-100">Summary</h3>

                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Total Debit</span>
                                        <CurrencyAmount value={lineTotals.totalDebit} className="font-bold text-slate-700" />
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Total Credit</span>
                                        <CurrencyAmount value={lineTotals.totalCredit} className="font-bold text-slate-700" />
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-md mb-6 flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-600">Difference</span>
                                    <div className="flex items-center gap-1">
                                        {Math.abs(lineTotals.difference) < 0.01 ? (
                                            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                                <CheckCircle2 size={14} /> Balanced
                                            </span>
                                        ) : (
                                            <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                                                <AlertCircle size={14} /> <CurrencyAmount value={lineTotals.difference} />
                                            </span>
                                        )}
                                    </div>
                                </div>

                            </div>

                            {(['Draft', 'Rejected'].includes(formData.status) || formData.id == null) && (
                                <>
                                    {Object.values(formErrors).some(Boolean) && (
                                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                                            <p className="text-[11px] font-bold text-red-700 mb-1">Cannot save this journal yet:</p>
                                            <ul className="list-disc list-inside space-y-0.5">
                                                {Object.values(formErrors).filter(Boolean).map((message) => (
                                                    <li key={message} className="text-[10px] font-medium text-red-600">{message}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    <div className="text-[10px] text-slate-400 mb-4">
                                        You can only save or submit a journal when the entry is balanced and all required fields (*) are filled.
                                    </div>
                                </>
                            )}

                            {formData.status === 'Submitted' && (
                                <div className="text-center py-4 text-blue-600 bg-blue-50 rounded-lg border border-blue-100">
                                    <AlertCircle size={24} className="mx-auto mb-2" />
                                    <p className="text-sm font-bold">This Journal is Pending Approval</p>
                                    <p className="text-xs">Review the entries and use the action buttons at the top</p>
                                </div>
                            )}

                            {formData.status === 'Approved' && (
                                <div className="text-center py-4 text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-100">
                                    <CheckCircle2 size={24} className="mx-auto mb-2" />
                                    <p className="text-sm font-bold">This Journal is Approved</p>
                                    <p className="text-xs">It is ready to be posted to the ledger</p>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* VIEW ONLY MODE (POSTED) */}
            {
                viewMode === 'view' && (
                    <div className="space-y-6">

                        {/* JOURNAL DETAILS CARD */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-6 pb-2 border-b border-slate-100">Journal Details</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
                                    <div className="text-sm font-bold text-slate-700">{formatDisplayDate(formData.date)}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">dd-mm-yyyy</div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Reference</label>
                                    <div className="text-sm font-bold text-slate-700">{formData.reference || '-'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Prepared By</label>
                                    <div className="flex items-center gap-2">
                                        <User size={14} className="text-slate-400" />
                                        <span className="text-sm font-bold text-slate-700">{formData.preparedBy}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Posted By</label>
                                    <div className="flex items-center gap-2">
                                        <User size={14} className="text-slate-400" />
                                        <span className="text-sm font-bold text-slate-700">{formData.postedBy || '—'}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Posted At</label>
                                    <div className="text-sm font-bold text-slate-700">
                                        {formData.postedAt ? new Date(formData.postedAt).toLocaleString('en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        }) : '-'}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Narration</label>
                                <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md border border-slate-100">
                                    {formData.narration}
                                </div>
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-4 border-t border-slate-50">
                                <div>Created: {formData.createdAt || '-'}</div>
                                <div>Updated: {formData.updatedAt || '-'}</div>
                            </div>
                        </div>

                        {/* LEDGER BREAKDOWN CARD */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-6 pb-2 border-b border-slate-100">Ledger Breakdown</h3>

                            <div className="overflow-x-auto">
                                <table className="bb-nowrap-table w-full text-left border-collapse">
                                    <thead className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="py-3">Account Ledger</th>
                                            <th className="py-3">Description</th>
                                            <th className="py-3 text-right">Debit (<CurrencySymbol />)</th>
                                            <th className="py-3 text-right">Credit (<CurrencySymbol />)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs divide-y divide-slate-50">
                                        {journalLines.map((line, idx) => (
                                            <tr key={idx}>
                                                <td className="py-3 font-medium text-slate-700">{line.account}</td>
                                                <td className="py-3 text-slate-500">{line.description}</td>
                                                <td className="py-3 text-right font-bold text-slate-700">{parseFloat(line.debit) > 0 ? <CurrencyAmount value={line.debit} /> : '-'}</td>
                                                <td className="py-3 text-right font-bold text-slate-700">{parseFloat(line.credit) > 0 ? <CurrencyAmount value={line.credit} /> : '-'}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50 font-bold border-t border-slate-100">
                                            <td className="py-3 pl-2" colSpan={2}>Total</td>
                                            <td className="py-3 text-right text-emerald-600"><CurrencyAmount value={lineTotals.totalDebit} /></td>
                                            <td className="py-3 text-right text-emerald-600"><CurrencyAmount value={lineTotals.totalCredit} /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* AUDIT TRAIL CARD */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-6 pb-2 border-b border-slate-100">Audit Trail</h3>
                            <div className="space-y-4">
                                {auditLogs.length === 0 ? (
                                    <p className="text-xs text-slate-400 text-center py-4">No audit logs available for this journal.</p>
                                ) : (
                                    <div className="relative border-l border-slate-200 ml-3 space-y-6 pb-4">
                                        {auditLogs.map((log, index) => (
                                            <div key={log.id || index} className="relative pl-6">
                                                <span className="absolute -left-2 top-0.5 w-4 h-4 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                                </span>
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="text-sm font-bold text-slate-700">
                                                        {log.action}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {formatAuditTimestamp(log.timestamp)}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-600 mb-0.5">
                                                    By <span className="font-semibold">{log.performedBy || 'System'}</span>
                                                </div>
                                                {log.comments && (
                                                    <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded mt-1 border border-slate-100">
                                                        {log.comments}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                )
            }
            <LedgerAccountCreateModal
                isOpen={isAccountCreateOpen}
                onClose={() => { setIsAccountCreateOpen(false); setAccountCreateTargetLine(null); }}
                onCreated={handleAccountCreated}
                existingAccounts={fullAccounts}
                defaultGroup="Expenses"
            />
        </div >
    );
};

export default JournalVoucher;
