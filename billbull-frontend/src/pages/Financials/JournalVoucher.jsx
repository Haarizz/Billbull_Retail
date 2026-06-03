import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    FileText, Plus, Search, Filter, Eye, MoreHorizontal, Download,
    Trash, Edit, CheckCircle2, AlertCircle, X, Save,
    ChevronLeft, PlusCircle, MinusCircle, FileSpreadsheet,
    Printer as PrintIcon, Ban, User, Clock,
    TrendingUp, DollarSign
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
import { buildJournalVoucherPrintHtml } from '../../utils/journalVoucherPrintTemplate';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { buildFinancialVoucherPrintHtml } from '../../utils/financialPrintTemplate';
import LedgerAccountCreateModal from '../../components/common/LedgerAccountCreateModal';
import { formatUserDisplayName } from '../../utils/displayName';
import PaginationFooter from '../../components/common/PaginationFooter';
import TableSkeleton from '../../components/common/TableSkeleton';

const formatAccountLedgerLabel = (account = {}) => {
    const code = account.code ? `${account.code} - ` : '';
    return `${code}${account.name || ''}`.trim();
};

const AccountLedgerSearchSelect = ({ accounts = [], value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const dropdownRef = useRef(null);

    const selectedAccount = useMemo(() => (
        accounts.find(account => account.name === value || account.code === value)
    ), [accounts, value]);

    const filteredAccounts = useMemo(() => {
        const text = query.trim().toLowerCase();
        if (!text) return accounts.slice(0, 60);
        return accounts
            .filter(account => `${account.code || ''} ${account.name || ''}`.toLowerCase().includes(text))
            .slice(0, 60);
    }, [accounts, query]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectAccount = (account) => {
        onChange(account.name);
        setQuery('');
        setIsOpen(false);
    };

    const displayValue = isOpen
        ? query
        : (selectedAccount ? formatAccountLedgerLabel(selectedAccount) : value || '');

    return (
        <div ref={dropdownRef} className="relative min-w-0 flex-1">
            <input
                type="text"
                value={displayValue}
                onFocus={() => {
                    if (!disabled) {
                        setIsOpen(true);
                        setQuery('');
                    }
                }}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setIsOpen(true);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && filteredAccounts[0]) {
                        event.preventDefault();
                        selectAccount(filteredAccounts[0]);
                    }
                    if (event.key === 'Escape') {
                        setIsOpen(false);
                        setQuery('');
                    }
                }}
                disabled={disabled}
                placeholder="Search code or name"
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-yellow-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            />

            {isOpen && !disabled && (
                <div className="absolute left-0 right-0 z-[80] mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                    {filteredAccounts.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">No account ledgers found</div>
                    ) : filteredAccounts.map((account) => (
                        <button
                            type="button"
                            key={account.id || account.code || account.name}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectAccount(account)}
                            className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-yellow-50 ${account.name === value ? 'bg-yellow-50 text-slate-900' : 'text-slate-600'}`}
                        >
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                                {account.code || '-'}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">{account.name}</span>
                        </button>
                    ))}
                </div>
            )}
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
    const handleAddLine = () => {
        setJournalLines([...journalLines, { account: '', accountCode: '', description: '', debit: 0, credit: 0, costCenter: '' }]);
    };

    const handleRemoveLine = (index) => {
        const newLines = [...journalLines];
        newLines.splice(index, 1);
        setJournalLines(newLines);
    };

    const handleLineChange = (index, field, value) => {
        const newLines = [...journalLines];
        newLines[index][field] = value;

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

                // Auto-set Debit/Credit based on Balance
                if (selectedAccount.balanceAmount) {
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
            updatedAt: journal.updatedAt
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
            preparedBy: journal.preparedBy || ''
        });

        // Use actual lines from the backend
        setJournalLines(journal.lines || []);
        setViewMode('create');
    };

    const handleSave = async (targetStatus = 'Draft') => {
        try {
            // Always save as Draft first to allow the specific 'post' endpoint to handle validation and state transition
            const payload = {
                date: formData.date,
                reference: formData.reference,
                narration: formData.narration,
                preparedBy: formData.preparedBy,
                status: 'Draft',
                lines: journalLines.map(line => ({
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

        // Templates saved by the Financials Print & Email Templates designer
        // carry the new settings (showLogo, accentColor, signature toggles…)
        // inside displayOptions. Route those through the new renderer so the
        // design-time choices actually drive the printout. Templates without
        // those keys are legacy header/terms/footer-text templates — fall back
        // to the existing renderer.
        const hasNewSettings = (() => {
            if (!template?.displayOptions) return false;
            try {
                const opts = typeof template.displayOptions === 'string'
                    ? JSON.parse(template.displayOptions)
                    : template.displayOptions;
                return opts && typeof opts === 'object' && ('accentColor' in opts || 'showLogo' in opts);
            } catch { return false; }
        })();

        const branchProfile = buildDocumentHeaderProfile({
            company,
            branches: availableBranches || [],
            branchId: jv?.branchId ?? activeBranch?.id,
        });
        if (hasNewSettings) {
            return buildFinancialVoucherPrintHtml('journal-voucher', { ...jv, lines }, { company: branchProfile, template });
        }
        return buildJournalVoucherPrintHtml({ ...jv, lines }, { company: branchProfile, template });
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
                                disabled={
                                    Math.abs(lineTotals.difference) > 0.01 ||
                                    !formData.date || !formData.narration || !formData.reference || !formData.preparedBy
                                }
                                className={`px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 flex items-center gap-2 ${(Math.abs(lineTotals.difference) > 0.01 || !formData.date || !formData.narration || !formData.reference || !formData.preparedBy)
                                    ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50'}`}
                            >
                                <Save size={16} /> Save Changes
                            </button>
                        )}

                        {(formData.status === 'Draft' || formData.status === 'Rejected') && formData.id && (
                            <button onClick={() => handleStatusAction('submit')} className="px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700">
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
                                disabled={
                                    Math.abs(lineTotals.difference) > 0.01 ||
                                    !formData.date || !formData.narration || !formData.reference || !formData.preparedBy
                                }
                                className={`px-4 py-2 rounded text-xs font-bold shadow-sm flex items-center gap-2 ${(Math.abs(lineTotals.difference) > 0.01 || !formData.date || !formData.narration || !formData.reference || !formData.preparedBy)
                                    ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
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
                            <table className="w-full text-left border-collapse">
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
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 disabled:bg-slate-50 disabled:text-slate-400"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">dd-mm-yyyy</p>
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
                                        onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                                        placeholder="Describe the purpose of this journal entry..."
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 resize-none disabled:bg-slate-50 disabled:text-slate-400"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Prepared By</label>
                                        <select
                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                            value={formData.preparedBy}
                                            onChange={(e) => setFormData({ ...formData, preparedBy: e.target.value })}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 disabled:bg-slate-50 disabled:text-slate-400 appearance-none bg-white"
                                        >
                                            <option value="" disabled>Select Employee</option>

                                            {employees.map((emp) => (
                                                <option key={emp.id} value={`${emp.firstName} ${emp.lastName}`}>
                                                    {emp.firstName} {emp.lastName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusBadge(formData.status)}`}>{formData.status}</span>
                                    </div>
                                </div>
                            </div>

                            {/* LINES SECTION */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 min-h-[300px]">
                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                                    <h3 className="text-sm font-bold text-slate-700">Journal Lines</h3>
                                    {(['Draft', 'Rejected'].includes(formData.status) || formData.id == null) && (
                                        <button onClick={handleAddLine} className="px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded text-xs font-bold hover:bg-emerald-50 flex items-center gap-1">
                                            <Plus size={14} /> Add Line
                                        </button>
                                    )}
                                </div>

                                {journalLines.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                        <FileSpreadsheet size={48} className="mb-4 text-slate-200" />
                                        <p className="text-sm">No journal lines added yet</p>
                                        <p className="text-xs">Click "Add Line" to start</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* HEADER ROW */}
                                        <div className="grid grid-cols-12 gap-3 mb-2 px-2 text-[10px] uppercase font-bold text-slate-400">
                                            <div className="col-span-3">Account Ledger</div>
                                            <div className="col-span-3">Description</div>
                                            <div className="col-span-2 text-right">Debit (<CurrencySymbol />)</div>
                                            <div className="col-span-2 text-right">Credit (<CurrencySymbol />)</div>
                                            <div className="col-span-2">Cost Centre</div>
                                        </div>

                                        {journalLines.map((line, idx) => {
                                            const selectedAccount = findSelectableAccount(line.account);
                                            const isCostCenterApplicable = selectedAccount && selectedAccount.costCenterCode && selectedAccount.costCenterCode !== '-';

                                            return (
                                                <div key={idx} className="grid grid-cols-12 gap-3 items-start group">
                                                    <div className="col-span-3 flex items-center gap-1">
                                                        <AccountLedgerSearchSelect
                                                            accounts={selectableAccounts}
                                                            value={line.account}
                                                            onChange={(accountName) => handleLineChange(idx, 'account', accountName)}
                                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                                        />
                                                        {(['Draft', 'Rejected'].includes(formData.status) || formData.id == null) && (
                                                            <button
                                                                type="button"
                                                                title="Create account ledger"
                                                                onClick={() => openAccountCreate(idx)}
                                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:border-yellow-400 hover:text-slate-900"
                                                            >
                                                                <PlusCircle size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="col-span-3">
                                                        <input
                                                            type="text"
                                                            placeholder="Description"
                                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                                            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-yellow-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                                            value={line.description}
                                                            onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number"
                                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                                            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-yellow-400 focus:outline-none text-right disabled:bg-slate-50 disabled:text-slate-400"
                                                            value={line.debit}
                                                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number"
                                                            disabled={!['Draft', 'Rejected'].includes(formData.status) && formData.id != null}
                                                            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-yellow-400 focus:outline-none text-right disabled:bg-slate-50 disabled:text-slate-400"
                                                            value={line.credit}
                                                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </div>
                                                    <div className="col-span-2 relative flex items-center gap-1">
                                                        <select
                                                            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-yellow-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                                            value={line.costCenter}
                                                            onChange={(e) => handleLineChange(idx, 'costCenter', e.target.value)}
                                                            disabled={(!['Draft', 'Rejected'].includes(formData.status) && formData.id != null) || !isCostCenterApplicable}
                                                        >
                                                            <option value="" disabled>Select CC</option>
                                                            {costCenters.map((cc, i) => <option key={i} value={cc}>{cc}</option>)}
                                                        </select>
                                                        {(['Draft', 'Rejected'].includes(formData.status) || formData.id == null) && (
                                                            <button
                                                                onClick={() => handleRemoveLine(idx)}
                                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <Trash size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                                <table className="w-full text-left border-collapse">
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
