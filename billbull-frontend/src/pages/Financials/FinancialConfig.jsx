import React, { useState, useEffect } from 'react';
import {
    TreePine,
    Plus,
    ChevronRight,
    ChevronDown,
    Edit2,
    FileText,
    Shield,
    CreditCard,
    Trash2,
    Save,
    X,
    Settings
} from 'lucide-react';
import {
    getAllAccountingPeriods,
    createAccountingPeriod,
    closeAccountingPeriod
} from '../../api/accountingPeriodApi';
import * as backendApi from '../../api/financialReportsBackendApi';
import { getAccounts, getOpeningBalanceLocks, saveOpeningBalances } from '../../api/ledgerApi';
import toast from 'react-hot-toast';

const FinancialConfig = () => {
    const [activeTab, setActiveTab] = useState('coaTree');
    const [loading, setLoading] = useState(true);

    // Data
    const [accountTree, setAccountTree] = useState([]);
    const [postingRules, setPostingRules] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [periods, setPeriods] = useState([]);

    // Create Period Modal
    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
    const [newPeriod, setNewPeriod] = useState({ periodName: '', startDate: '', endDate: '' });

    // Posting Rule Modal
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [currentRule, setCurrentRule] = useState({
        transactionType: '',
        lineLabel: '',
        debitAccountCode: '',
        creditAccountCode: '',
        description: '',
        isActive: true,
        sortOrder: 1
    });

    // Opening Balances
    const [openingBalances, setOpeningBalances] = useState({});
    const [savingOb, setSavingOb] = useState(false);
    const [lockedObCodes, setLockedObCodes] = useState(new Set());

    const formatInitialAmount = (balanceAmount) => {
        const num = Number(balanceAmount);
        if (!Number.isFinite(num) || num === 0) return '';
        return Math.abs(num).toFixed(2);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tree, rules, methods, accs, periodsData, lockedCodes] = await Promise.all([
                backendApi.getAccountTree().catch(() => []),
                backendApi.getPostingRules().catch(() => []),
                backendApi.getPaymentMethods().catch(() => []),
                getAccounts().catch(() => []),
                getAllAccountingPeriods().catch(() => []),
                getOpeningBalanceLocks().catch(() => [])
            ]);
            setAccountTree(tree);
            setPostingRules(rules);
            setPaymentMethods(methods);
            setAccounts(accs);
            setPeriods(periodsData);
            setLockedObCodes(new Set(Array.isArray(lockedCodes) ? lockedCodes : []));

            const initialOb = {};
            accs.forEach(a => {
                if (!a.isGroup) {
                    const balNum = Number(a.balanceAmount);
                    initialOb[a.code] = {
                        accountCode: a.code,
                        amount: formatInitialAmount(a.balanceAmount),
                        balanceType: Number.isFinite(balNum) && balNum < 0 ? 'Cr' : (a.normalBalance || 'Dr') // if negative balance, Cr
                    };
                }
            });
            setOpeningBalances(initialOb);

        } catch (error) {
            console.error('Error fetching config data:', error);
            toast.error("Failed to load configuration data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const toggleNode = (code) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const expandAll = () => {
        const allCodes = [];
        const collect = (nodes) => {
            nodes.forEach(n => {
                if (n.children?.length > 0) {
                    allCodes.push(n.code);
                    collect(n.children);
                }
            });
        };
        collect(accountTree);
        setExpandedNodes(new Set(allCodes));
    };

    // ===================== CRUD HANDLERS FOR POSTING RULES =====================
    const handleOpenRuleModal = (rule = null) => {
        if (rule) {
            setCurrentRule(rule);
        } else {
            setCurrentRule({
                transactionType: '',
                lineLabel: '',
                debitAccountCode: '',
                creditAccountCode: '',
                description: '',
                isActive: true,
                sortOrder: 1
            });
        }
        setIsRuleModalOpen(true);
    };

    const handleSaveRule = async () => {
        try {
            if (currentRule.id) {
                await backendApi.updatePostingRule(currentRule.id, currentRule);
                toast.success("Posting rule updated");
            } else {
                await backendApi.createPostingRule(currentRule);
                toast.success("Posting rule created");
            }
            setIsRuleModalOpen(false);
            fetchData();
        } catch (error) {
            console.error("Error saving rule", error);
            toast.error("Failed to save posting rule");
        }
    };

    const handleDeleteRule = async (id) => {
        if (window.confirm("Are you sure you want to delete this posting rule?")) {
            try {
                await backendApi.deletePostingRule(id);
                toast.success("Posting rule deleted");
                fetchData();
            } catch (error) {
                console.error("Error deleting rule", error);
                toast.error("Failed to delete posting rule");
            }
        }
    };

    // ===================== COA TREE TAB =====================
    const renderTreeNode = (node, depth = 0) => {
        const hasChildren = node.children?.length > 0;
        const isExpanded = expandedNodes.has(node.code);
        const indent = depth * 24;
        // BB-034B: Sort children by account code for consistent hierarchy display
        const sortedChildren = hasChildren
            ? [...node.children].sort((a, b) => (a.code || '').localeCompare(b.code || ''))
            : [];

        return (
            <React.Fragment key={node.code}>
                <tr className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td className="px-4 py-2 text-xs" style={{ paddingLeft: `${16 + indent}px` }}>
                        <div className="flex items-center gap-1">
                            {hasChildren ? (
                                <button onClick={() => toggleNode(node.code)} className="text-slate-400 hover:text-slate-700">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
                    <td className="px-4 py-2 text-xs text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${node.normalBalance === 'Dr'
                            ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                            {node.normalBalance || '-'}
                        </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-center">
                        {node.isGroup ?
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold">Group</span> :
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">Leaf</span>
                        }
                    </td>
                </tr>
                {isExpanded && hasChildren && sortedChildren.map(child => renderTreeNode(child, depth + 1))}
            </React.Fragment>
        );
    };

    const COATreeTab = () => (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <TreePine size={16} className="text-emerald-600" />
                    Chart of Accounts — Tree View
                </h3>
                <button onClick={expandAll} className="text-xs px-3 py-1.5 bg-slate-100 rounded font-bold text-slate-600 hover:bg-slate-200">
                    Expand All
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="bb-nowrap-table w-full">
                    <thead className="bg-[#F7F7FA] border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-40">Code</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Group</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Type</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Normal</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Kind</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accountTree.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">No COA tree data. Run the seed script to populate accounts.</td></tr>
                        ) : (
                            // BB-034B: Sort root nodes by account code for correct COA order
                            [...accountTree].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(node => renderTreeNode(node))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // ===================== POSTING RULES TAB =====================
    const PostingRulesTab = () => {
        const txnTypes = [...new Set(postingRules.map(r => r.transactionType))];

        return (
            <div className="space-y-6">
                <div className="flex justify-end mb-4">
                    <button onClick={() => handleOpenRuleModal()} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold text-xs flex items-center gap-2 hover:bg-emerald-700">
                        <Plus size={16} /> Add Posting Rule
                    </button>
                </div>
                {txnTypes.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm text-center text-slate-400 text-sm">
                        No posting rules configured. Add a custom rule or run the seed script to populate default rules.
                    </div>
                ) : (
                    txnTypes.map(type => (
                        <div key={type} className="bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div className="p-4 border-b border-slate-200 bg-slate-50">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <Shield size={16} className="text-blue-600" />
                                    {type.replace(/_/g, ' ')}
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="bb-nowrap-table w-full">
                                    <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase w-8">#</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Line Label</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase">Debit Account</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase">Credit Account</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Description</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase">Active</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {postingRules.filter(r => r.transactionType === type).sort((a, b) => a.sortOrder - b.sortOrder).map((rule, idx) => (
                                            <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 text-xs text-slate-400">{idx + 1}</td>
                                                <td className="px-4 py-2 text-xs text-slate-700 font-semibold">{rule.lineLabel}</td>
                                                <td className="px-4 py-2 text-center">
                                                    {rule.debitAccountCode ? (
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold font-mono">{rule.debitAccountCode}</span>
                                                    ) : <span className="text-slate-300 text-xs">—</span>}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    {rule.creditAccountCode ? (
                                                        <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-bold font-mono">{rule.creditAccountCode}</span>
                                                    ) : <span className="text-slate-300 text-xs">—</span>}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-slate-500">{rule.description}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.isActive
                                                        ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                        {rule.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-center text-slate-400">
                                                    <button onClick={() => handleOpenRuleModal(rule)} className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded mr-1"><Edit2 size={14} /></button>
                                                    <button onClick={() => handleDeleteRule(rule.id)} className="p-1 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>
        );
    };

    // ===================== PAYMENT METHODS TAB =====================
    const PaymentMethodsTab = () => (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <CreditCard size={16} className="text-purple-600" />
                    Payment Methods Configuration
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="bb-nowrap-table w-full">
                    <thead className="bg-[#F7F7FA] border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Code</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">COA Account</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paymentMethods.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No payment methods configured. Run the seed script to populate defaults.</td></tr>
                        ) : (
                            paymentMethods.map(method => (
                                <tr key={method.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{method.name}</td>
                                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{method.code}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold font-mono">{method.accountCode}</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{method.description || '-'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${method.isActive
                                            ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                            {method.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // ===================== OPENING BALANCES TAB =====================
    const handleSaveOpeningBalances = async () => {
        setSavingOb(true);
        try {
            const allValues = Object.values(openingBalances || {});
            const blocked = allValues
                .filter((ob) => ob?.accountCode && lockedObCodes.has(ob.accountCode))
                .map((ob) => ob.accountCode);

            const payload = allValues
                .filter((ob) => ob?.accountCode && !lockedObCodes.has(ob.accountCode))
                .map((ob) => {
                    const amountNum = Number(ob.amount);
                    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
                    return {
                        accountCode: ob.accountCode,
                        amount: amountNum.toFixed(2),
                        balanceType: ob.balanceType || 'Dr'
                    };
                })
                .filter(Boolean);

            const res = await saveOpeningBalances(payload);

            if (blocked.length > 0 || (res?.lockedAccountCodes?.length || 0) > 0) {
                const lockedList = Array.from(new Set([...(blocked || []), ...((res && res.lockedAccountCodes) || [])]));
                toast.success(`Saved opening balances (${res?.updatedCount ?? payload.length}). Locked accounts skipped: ${lockedList.length}`);
            } else {
                toast.success("Opening balances saved successfully!");
            }
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error("Failed to save opening balances");
        } finally {
            setSavingOb(false);
        }
    };

    const handleObChange = (code, field, value) => {
        setOpeningBalances(prev => {
            const prevRow = prev[code] || { accountCode: code, amount: '', balanceType: 'Dr' };
            if (field === 'amount') {
                const next = value ?? '';
                if (next === '' || /^\d*\.?\d*$/.test(next)) {
                    return { ...prev, [code]: { ...prevRow, amount: next } };
                }
                return prev;
            }
            return { ...prev, [code]: { ...prevRow, [field]: value } };
        });
    };

    const OpeningBalancesTab = () => {
        const leafAccounts = accounts.filter(a => !a.isGroup).sort((a, b) => a.code.localeCompare(b.code));

        return (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-220px)]">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <FileText size={16} className="text-emerald-600" />
                            Opening Balances Setup
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Opening balances are editable only before any sales/purchase/ledger transactions exist for the account.
                        </p>
                    </div>
                    <button
                        onClick={handleSaveOpeningBalances}
                        disabled={savingOb}
                        className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-md hover:bg-blue-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={14} />
                        {savingOb ? 'Saving...' : 'Save All Opening Balances'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <table className="bb-nowrap-table w-full">
                        <thead className="bg-[#F7F7FA] border-b border-slate-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32">Account Code</th>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-40">Group / Type</th>
                                <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48">Opening Amount</th>
                                <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32">Dr / Cr</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {leafAccounts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">
                                        No leaf accounts found.
                                    </td>
                                </tr>
                            ) : (
                                leafAccounts.map((account) => {
                                    const ob = openingBalances[account.code] || { accountCode: account.code, amount: '', balanceType: account.normalBalance || 'Dr' };
                                    const isLocked = lockedObCodes.has(account.code);
                                    return (
                                        <tr key={account.code} className="hover:bg-slate-50 focus-within:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-3">
                                                <span className="font-mono text-xs font-semibold text-slate-600">{account.code}</span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="text-sm font-medium text-slate-800">{account.name}</div>
                                                <div className="text-xs text-slate-500">{account.description || '—'}</div>
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="text-xs text-slate-600">{account.accountGroup}</div>
                                                <div className="text-[10px] text-slate-400 uppercase">{account.accountType}</div>
                                            </td>
                                            <td className="px-6 py-3 align-middle">
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    disabled={isLocked}
                                                    title={isLocked ? 'Opening balance is locked because transactions already exist for this account (sales/purchase/ledger).' : ''}
                                                    className="w-full text-right font-mono text-sm border-slate-200 rounded focus:ring-blue-500 focus:border-blue-500 py-1.5 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                                    value={ob.amount ?? ''}
                                                    placeholder="0.00"
                                                    onChange={(e) => handleObChange(account.code, 'amount', e.target.value)}
                                                    onBlur={(e) => {
                                                        const raw = e.target.value;
                                                        if (!raw) return;
                                                        const n = Number(raw);
                                                        if (!Number.isFinite(n)) return;
                                                        handleObChange(account.code, 'amount', n.toFixed(2));
                                                    }}
                                                />
                                            </td>
                                            <td className="px-6 py-3 text-center align-middle">
                                                <select
                                                    className="text-xs font-bold border-slate-200 rounded focus:ring-blue-500 focus:border-blue-500 bg-slate-50 py-1.5 pr-8 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                                    value={ob.balanceType}
                                                    onChange={(e) => handleObChange(account.code, 'balanceType', e.target.value)}
                                                    disabled={isLocked}
                                                >
                                                    <option value="Dr">Dr</option>
                                                    <option value="Cr">Cr</option>
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ===================== ACCOUNTING PERIODS TAB =====================
    const handleCreatePeriod = async () => {
        if (!newPeriod.periodName || !newPeriod.startDate || !newPeriod.endDate) {
            toast.error("Please fill all period details");
            return;
        }
        try {
            await createAccountingPeriod(newPeriod);
            toast.success("Accounting Period created");
            setIsPeriodModalOpen(false);
            setNewPeriod({ periodName: '', startDate: '', endDate: '' });
            fetchData();
        } catch (e) {
            console.error(e);
            toast.error("Failed to create period");
        }
    };

    const handleClosePeriod = async (id) => {
        if (!window.confirm("Are you sure you want to close this period? This action cannot be reversed, and no further postings will be allowed in this timeframe.")) return;
        try {
            await closeAccountingPeriod(id);
            toast.success("Period closed successfully");
            fetchData();
        } catch (e) {
            console.error(e);
            toast.error("Failed to close period");
        }
    };

    const AccountingPeriodsTab = () => (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm relative">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <TreePine size={16} className="text-indigo-600" />
                    Accounting Periods
                </h3>
                <button
                    onClick={() => setIsPeriodModalOpen(true)}
                    className="px-4 py-1.5 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-md hover:bg-yellow-400 shadow-sm flex items-center gap-2"
                >
                    <Plus size={14} />
                    Create Period
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="bb-nowrap-table w-full">
                    <thead className="bg-[#F7F7FA] border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Period Name</th>
                            <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</th>
                            <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</th>
                            <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {periods.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">No accounting periods defined.</td></tr>
                        ) : (
                            periods.map(period => (
                                <tr key={period.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-3 text-sm font-semibold text-slate-700">{period.periodName}</td>
                                    <td className="px-6 py-3 text-xs text-slate-600">{period.startDate}</td>
                                    <td className="px-6 py-3 text-xs text-slate-600">{period.endDate}</td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${period.status === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                            {period.status || 'OPEN'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        {period.status === 'OPEN' ? (
                                            <button
                                                onClick={() => handleClosePeriod(period.id)}
                                                className="px-3 py-1 bg-white border border-slate-200 text-red-600 text-[10px] font-bold rounded hover:bg-red-50"
                                            >
                                                Close Period
                                            </button>
                                        ) : (
                                            <span className="text-[10px] text-slate-400 font-medium">Closed by {period.closedBy || 'Admin'}</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Period Modal */}
            {isPeriodModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <div className="bg-white w-[400px] rounded-lg shadow-xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">Create Accounting Period</h3>
                            <button onClick={() => setIsPeriodModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Period Name</label>
                                <input type="text" value={newPeriod.periodName} onChange={e => setNewPeriod({ ...newPeriod, periodName: e.target.value })} placeholder="e.g. Q1 2026 or Jan 2026" className="w-full text-sm p-2 border border-slate-300 rounded focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                                <input type="date" value={newPeriod.startDate} onChange={e => setNewPeriod({ ...newPeriod, startDate: e.target.value })} className="w-full text-sm p-2 border border-slate-300 rounded focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                                <input type="date" value={newPeriod.endDate} onChange={e => setNewPeriod({ ...newPeriod, endDate: e.target.value })} className="w-full text-sm p-2 border border-slate-300 rounded focus:border-indigo-500 outline-none" />
                            </div>
                        </div>
                        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setIsPeriodModalOpen(false)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50">Cancel</button>
                            <button onClick={handleCreatePeriod} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700">Create Period</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500 font-medium animate-pulse">Loading Configuration...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Settings className="text-[#F5C742]" size={28} />
                        Financial Configuration
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Manage Chart of Accounts, Posting Rules, and Payment Methods</p>
                </div>
            </div>

            {/* TABS */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-1 mb-6 flex gap-1">
                {[
                    { id: 'coaTree', label: 'COA Tree', icon: TreePine },
                    { id: 'openingBalances', label: 'Opening Balances', icon: FileText },
                    { id: 'postingRules', label: 'Posting Rules', icon: Shield },
                    { id: 'paymentMethods', label: 'Payment Methods', icon: CreditCard },
                    { id: 'periods', label: 'Accounting Periods', icon: TreePine },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${activeTab === tab.id
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT */}
            <div>
                {activeTab === 'coaTree' && COATreeTab()}
                {activeTab === 'openingBalances' && OpeningBalancesTab()}
                {activeTab === 'postingRules' && PostingRulesTab()}
                {activeTab === 'paymentMethods' && PaymentMethodsTab()}
                {activeTab === 'periods' && AccountingPeriodsTab()}
            </div>

            {/* Posting Rule Modal */}
            {isRuleModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <div className="bg-white w-[500px] rounded-lg shadow-xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">{currentRule.id ? 'Edit Posting Rule' : 'Add Posting Rule'}</h3>
                            <button onClick={() => setIsRuleModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Transaction Type</label>
                                    <input type="text" value={currentRule.transactionType} onChange={e => setCurrentRule({ ...currentRule, transactionType: e.target.value })} placeholder="e.g. SALES_INVOICE" className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none uppercase" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Line Label</label>
                                    <input type="text" value={currentRule.lineLabel} onChange={e => setCurrentRule({ ...currentRule, lineLabel: e.target.value })} placeholder="e.g. Sales Revenue" className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                                    <input type="text" value={currentRule.description} onChange={e => setCurrentRule({ ...currentRule, description: e.target.value })} className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Debit Account Code</label>
                                    <input type="text" value={currentRule.debitAccountCode || ''} onChange={e => setCurrentRule({ ...currentRule, debitAccountCode: e.target.value })} placeholder="e.g. 1100" className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none font-mono" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Credit Account Code</label>
                                    <input type="text" value={currentRule.creditAccountCode || ''} onChange={e => setCurrentRule({ ...currentRule, creditAccountCode: e.target.value })} placeholder="e.g. 4100" className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none font-mono" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Sort Order</label>
                                    <input type="number" value={currentRule.sortOrder} onChange={e => setCurrentRule({ ...currentRule, sortOrder: parseInt(e.target.value) || 1 })} className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none" />
                                </div>
                                <div className="flex items-center gap-2 mt-6">
                                    <input type="checkbox" id="isActiveRule" checked={currentRule.isActive} onChange={e => setCurrentRule({ ...currentRule, isActive: e.target.checked })} className="rounded border-slate-300" />
                                    <label htmlFor="isActiveRule" className="text-sm font-bold text-slate-700 cursor-pointer">Active Rule</label>
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setIsRuleModalOpen(false)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50">Cancel</button>
                            <button onClick={handleSaveRule} className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-700">Save Rule</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialConfig;
