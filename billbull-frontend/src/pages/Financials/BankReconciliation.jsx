import React, { useState, useEffect, useMemo } from 'react';
import {
    Landmark, BookOpen, AlertTriangle, AlertCircle,
    Search, Filter, Download, ChevronLeft, ChevronRight, CheckCircle,
    ExternalLink, MoreHorizontal, Info, Plus, X, Split, Check,
    CheckSquare, LayoutGrid
} from 'lucide-react';
import { getAccounts, getTransactions, finalizeReconciliation } from '../../api/ledgerApi';
import toast from 'react-hot-toast';

const BankReconciliation = () => {
    // --- STATE ---
    const [dateFilter, setDateFilter] = useState('Today');
    const [bankAccount, setBankAccount] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');
    const [currentPage, setCurrentPage] = useState(1);

    // New State for Features
    const [manualBankBalance, setManualBankBalance] = useState('0.00');
    const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
    const [matchedIds, setMatchedIds] = useState(new Set());
    const [ignoredIds, setIgnoredIds] = useState(new Set());
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedTx, setSelectedTx] = useState(null);
    const [activeDropdown, setActiveDropdown] = useState(null);

    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [allTransactions, setAllTransactions] = useState([]);
    const [ledgerTransactions, setLedgerTransactions] = useState([]);

    // --- EFFECTS ---
    useEffect(() => {
        fetchData();
    }, []);

    const getBalanceString = (account) => {
        const raw = account?.balanceAmount;
        const num = Number(raw);
        if (!Number.isFinite(num)) return '0.00';
        return num.toFixed(2);
    };

    useEffect(() => {
        setManualBankBalance(getBalanceString(selectedAccount));
    }, [selectedAccount]);

    useEffect(() => {
        if (selectedAccount && allTransactions.length > 0) {
            const filtered = allTransactions.filter(tx =>
                tx.accountCode === selectedAccount.code ||
                tx.accountName === selectedAccount.name
            );
            setLedgerTransactions(filtered);

            const initialMatched = new Set(
                filtered.filter(tx => tx.reconciled).map(tx => tx.id)
            );
            setMatchedIds(initialMatched);
        }
    }, [selectedAccount, allTransactions]);

    const fetchData = async () => {
        try {
            const [accData, txData] = await Promise.all([
                getAccounts(),
                getTransactions()
            ]);

            setAccounts(accData);
            setAllTransactions(txData);

            if (accData.length > 0) {
                const bankAcc = accData.find(a =>
                    (a.accountGroup === 'Assets' && a.name.toLowerCase().includes('bank')) ||
                    a.accountGroup === 'Assets'
                ) || accData[0];

                setBankAccount(bankAcc.id);
                setSelectedAccount(bankAcc);
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
        }
    };

    const handleAccountChange = (e) => {
        const id = e.target.value;
        setBankAccount(id);
        const account = accounts.find(a => a.id.toString() === id.toString());
        setSelectedAccount(account);
    };

    const openDrawer = (tx) => {
        setSelectedTx(tx);
        setIsDrawerOpen(true);
    };

    const closeDrawer = () => {
        setIsDrawerOpen(false);
        setSelectedTx(null);
    };

    const toggleMatch = (id) => {
        const tx = ledgerTransactions.find(t => t.id === id);
        if (tx?.reconciled) {
            toast.error("This transaction is already reconciled and locked.");
            return;
        }

        setMatchedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
                setIgnoredIds(prevIgnored => {
                    const newIgnored = new Set(prevIgnored);
                    newIgnored.delete(id);
                    return newIgnored;
                });
            }
            return newSet;
        });
    };

    const toggleIgnore = (id) => {
        setIgnoredIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
                setMatchedIds(prevMatched => {
                    const newMatched = new Set(prevMatched);
                    newMatched.delete(id);
                    return newMatched;
                });
            }
            return newSet;
        });
    };

    const handleFinalize = async () => {
        if (matchedIds.size === 0) {
            toast.error("No transactions selected for reconciliation.");
            return;
        }

        if (Math.abs(difference) > 0.01) {
            toast.error("Balances are not matched. Please resolve the discrepancy.");
            return;
        }

        const loadingToast = toast.loading("Finalizing reconciliation...");

        try {
            const newlyMatchedIds = Array.from(matchedIds).filter(id => {
                const tx = ledgerTransactions.find(t => t.id === id);
                return tx && !tx.reconciled;
            });

            await finalizeReconciliation({
                bankAccountId: selectedAccount.id,
                statementDate: statementDate,
                statementBalance: bankBalance,
                ledgerEntryIds: newlyMatchedIds
            });

            toast.dismiss(loadingToast);
            toast.success("Bank Reconciliation Successful!");

            // Re-fetch fresh data so reconciled status updates from DB
            const [accData, txData] = await Promise.all([getAccounts(), getTransactions()]);
            setAccounts(accData);
            setAllTransactions(txData);
            setIgnoredIds(new Set());

            const currentId = selectedAccount.id;
            const updatedAccount = accData.find(a => a.id === currentId);
            if (updatedAccount) {
                setSelectedAccount(updatedAccount);
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error("Failed to finalize reconciliation: " + (error.response?.data?.message || error.message));
        }
    };

    // --- CALCULATIONS ---
    const bankBalance = parseFloat(manualBankBalance) || 0;

    const matchedLedgerAmount = useMemo(() => {
        return ledgerTransactions
            .filter(tx => matchedIds.has(tx.id))
            .reduce((sum, tx) => sum + Math.abs(Number(tx.debitAmount || 0) - Number(tx.creditAmount || 0)), 0);
    }, [ledgerTransactions, matchedIds]);

    const difference = bankBalance - matchedLedgerAmount;

    const displayedTransactions = useMemo(() => {
        return ledgerTransactions.filter(tx => {
            if (statusFilter !== 'All Status') {
                const isMatched = matchedIds.has(tx.id);
                const isIgnored = ignoredIds.has(tx.id);
                const status = tx.reconciled || isMatched ? 'Matched' : (isIgnored ? 'Ignored' : (tx.status || 'Unmatched'));
                if (statusFilter !== status) return false;
            }
            if (searchQuery) {
                const search = searchQuery.toLowerCase();
                return (tx.description || '').toLowerCase().includes(search) ||
                    (tx.reference || '').toLowerCase().includes(search) ||
                    (tx.voucherNo || '').toLowerCase().includes(search);
            }
            return true;
        });
    }, [ledgerTransactions, statusFilter, searchQuery, matchedIds, ignoredIds]);

    const unmatchedCount = ledgerTransactions.filter(tx => !tx.reconciled && !matchedIds.has(tx.id)).length;

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 lg:p-6">
            {/* Overlay for closing dropdowns */}
            {activeDropdown && (
                <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setActiveDropdown(null)}
                />
            )}

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Landmark className="text-[#F5C742]" size={28} />
                        Bank Reconciliation
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Precisely match your statement records with ledger entries</p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Bank Balance */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-blue-400">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 font-semibold">Bank Balance</p>
                        <Landmark size={18} className="text-blue-600" />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-xl font-bold text-slate-900">AED</span>
                        <span className="text-xl font-bold text-slate-900 w-32">
                            {bankBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Actual balance</p>
                </div>

                {/* Ledger Balance */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-emerald-400">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 font-semibold">Ledger Balance</p>
                        <BookOpen size={18} className="text-emerald-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">AED {matchedLedgerAmount.toLocaleString()}</h3>
                    <p className="text-xs text-slate-400 mt-1">Accounting records</p>
                </div>

                {/* Difference */}
                <div className={`bg-white p-5 rounded-lg border border-slate-200 shadow-sm border-l-4 ${Math.abs(difference) < 0.01 ? 'border-l-emerald-400' : 'border-l-red-400'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 font-semibold">Difference</p>
                        {Math.abs(difference) < 0.01 ? <CheckCircle size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-red-600" />}
                    </div>
                    <h3 className={`text-xl font-bold ${Math.abs(difference) < 0.01 ? 'text-emerald-600' : 'text-red-700'}`}>
                        {Math.abs(difference) < 0.01 ? "Balanced ✓" : `AED ${difference.toLocaleString()}`}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">{Math.abs(difference) < 0.01 ? "No discrepancy" : "Requires reconciliation"}</p>
                </div>

                {/* Unmatched */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-orange-400">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 font-semibold">Unmatched</p>
                        <AlertCircle size={18} className="text-orange-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{unmatchedCount}</h3>
                    <p className="text-xs text-slate-400 mt-1">Transactions</p>
                </div>
            </div>

            {/* FILTERS */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-xs text-slate-500 font-semibold mb-2 block">Date Filter</label>
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-blue-500 bg-white text-slate-600"
                        >
                            <option>Today</option>
                            <option>Yesterday</option>
                            <option>Last 7 Days</option>
                            <option>This Month</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-slate-500 font-semibold mb-2 block">Statement Date</label>
                        <input
                            type="date"
                            value={statementDate}
                            onChange={(e) => setStatementDate(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-blue-500 bg-white text-slate-600"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-slate-500 font-semibold mb-2 block">Bank Account</label>
                        <select
                            value={bankAccount}
                            onChange={handleAccountChange}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-blue-500 bg-white text-slate-600"
                        >
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.accountCode || '88740'})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-slate-500 font-semibold mb-2 block">Search</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded focus:border-blue-500 bg-white text-slate-600 placeholder:text-slate-400"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                    <label className="text-xs text-slate-500 font-semibold">Status:</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1 text-xs border border-slate-200 rounded focus:border-blue-500 bg-white text-slate-600"
                    >
                        <option>All Status</option>
                        <option>Matched</option>
                        <option>Unmatched</option>
                        <option>Ignored</option>
                    </select>
                </div>
            </div>

            {/* TRANSACTIONS TABLE */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
                <div className="p-5 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">Bank Reconciliation Transactions ({displayedTransactions.length})</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Review and match bank statement entries with ledger records</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#F7F7FA] border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-center w-12"><input type="checkbox" className="w-4 h-4 rounded border-slate-300" /></th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reference</th>
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayedTransactions.map(tx => {
                                const isMatched = matchedIds.has(tx.id);
                                const isIgnored = ignoredIds.has(tx.id);
                                const amountVal = Math.abs(parseFloat(tx.debitAmount || 0) - parseFloat(tx.creditAmount || 0));
                                const sign = (parseFloat(tx.debitAmount || 0) > 0) ? '+' : '-';
                                const status = tx.reconciled || isMatched ? 'Matched' : (isIgnored ? 'Ignored' : (tx.status || 'Unmatched'));

                                let statusBadgeClass = '';
                                if (status === 'Matched') statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                else if (status === 'Unmatched') statusBadgeClass = 'bg-red-50 text-red-700 border-red-100';
                                else if (status === 'Ignored') statusBadgeClass = 'bg-slate-100 text-slate-500 border-slate-200';
                                else statusBadgeClass = 'bg-amber-50 text-amber-700 border-amber-100';

                                return (
                                    <tr
                                        key={tx.id}
                                        onClick={() => openDrawer(tx)}
                                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={status === 'Matched'}
                                                disabled={tx.reconciled}
                                                onChange={() => toggleMatch(tx.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className={`w-4 h-4 rounded border-slate-300 ${tx.reconciled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">
                                            {new Date(tx.transactionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs font-semibold text-slate-900">{tx.description}</div>
                                            <div className="text-xs text-slate-400 mt-0.5">{tx.category || 'General'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{tx.voucherNo || 'V-742541'}</td>
                                        <td className="px-4 py-3 text-right text-xs font-bold">
                                            <span className={sign === '+' ? 'text-emerald-600' : 'text-red-600'}>{sign}AED {amountVal.toFixed(2)}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${statusBadgeClass}`}>
                                                {status === 'Matched' ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                                                {status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {status === 'Unmatched' ? (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleMatch(tx.id); }}
                                                            className="px-3 py-1 bg-[#F5C742] text-slate-900 text-xs font-bold rounded hover:bg-yellow-400"
                                                        >
                                                            Match
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openDrawer(tx); }}
                                                            className="px-3 py-1 bg-white text-blue-600 text-xs font-bold rounded hover:bg-blue-50 border border-blue-200"
                                                        >
                                                            Review
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openDrawer(tx); }}
                                                        className="px-3 py-1 bg-white text-blue-600 text-xs font-bold rounded hover:bg-blue-50 border border-blue-200"
                                                    >
                                                        {status === 'Ignored' ? 'Review' : (tx.reconciled ? 'View' : 'Edit')}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* FOOTER SUMMARY */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <CheckCircle className="text-emerald-600" size={18} /> Reconciliation Summary
                </h3>
                <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center justify-between">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg text-center border border-blue-100">
                            <p className="text-xs text-blue-600 font-semibold mb-1">Total Bank</p>
                            <h3 className="text-xl font-bold text-slate-900">AED {bankBalance.toLocaleString()}</h3>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-lg text-center border border-emerald-100">
                            <p className="text-xs text-emerald-600 font-semibold mb-1">Total Ledger</p>
                            <h3 className="text-xl font-bold text-slate-900">AED {matchedLedgerAmount.toLocaleString()}</h3>
                        </div>
                        <div className={`p-4 rounded-lg text-center border ${Math.abs(difference) < 0.01 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <p className={`text-xs font-semibold mb-1 ${Math.abs(difference) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>Difference</p>
                            <h3 className={`text-xl font-bold ${Math.abs(difference) < 0.01 ? 'text-slate-900' : 'text-red-900'}`}>AED {difference.toLocaleString()}</h3>
                        </div>
                    </div>
                    <div className="lg:w-64">
                        {Math.abs(difference) < 0.01 ? (
                            <button onClick={handleFinalize} className="w-full py-3 bg-[#F5C742] text-slate-900 rounded font-bold text-sm hover:bg-yellow-400 shadow-sm">Finalize Reconciliation</button>
                        ) : (
                            <button disabled className="w-full py-3 bg-slate-100 text-slate-400 rounded font-bold text-sm cursor-not-allowed border border-slate-200">Cannot Finalize</button>
                        )}
                    </div>
                </div>
            </div>

            {/* TRANSACTION MODAL */}
            {isDrawerOpen && selectedTx && (
                <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                        onClick={closeDrawer}
                    />

                    <div className="relative bg-white w-full max-w-xl rounded-lg shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{selectedTx.voucherNo || 'REF-890'}</h2>
                                <p className="text-xs text-slate-500 mt-0.5">{selectedTx.description}</p>
                            </div>
                            <button onClick={closeDrawer} className="p-2 hover:bg-slate-100 rounded text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            {/* Transaction Details */}
                            <div className="p-5 bg-slate-50 rounded-lg border border-slate-100 space-y-4">
                                <h3 className="text-xs font-bold text-slate-900 uppercase">Transaction Details</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold">Date</p>
                                        <p className="text-sm font-bold text-slate-800 mt-1">
                                            {new Date(selectedTx.transactionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold">Category</p>
                                        <p className="text-sm font-bold text-slate-800 mt-1">{selectedTx.category || 'General'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold">Amount</p>
                                        <p className={`text-sm font-bold mt-1 ${parseFloat(selectedTx.debitAmount || 0) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {parseFloat(selectedTx.debitAmount || 0) > 0 ? '+' : '-'}AED {Math.abs(parseFloat(selectedTx.debitAmount || 0) - parseFloat(selectedTx.creditAmount || 0)).toFixed(2)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold">Status</p>
                                        <p className="text-sm font-bold text-slate-800 mt-1">
                                            {matchedIds.has(selectedTx.id) || selectedTx.reconciled ? 'Matched' : 'Unmatched'}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-slate-500 font-semibold">Description</p>
                                    <div className="p-3 bg-white border border-slate-100 rounded text-xs text-slate-600 mt-1">
                                        {selectedTx.description}
                                    </div>
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="space-y-3">
                                {(() => {
                                    const isMatched = matchedIds.has(selectedTx.id);
                                    const status = selectedTx.reconciled || isMatched ? 'Matched' : 'Unmatched';

                                    if (status === 'Matched') {
                                        return selectedTx.reconciled ? (
                                            <div className="w-full py-3 px-4 bg-slate-50 border border-slate-200 text-slate-400 rounded text-xs font-bold flex items-center justify-center gap-2 cursor-not-allowed">
                                                <Landmark size={14} /> Transaction Reconciled & Locked
                                            </div>
                                        ) : (
                                            <button onClick={() => toggleMatch(selectedTx.id)} className="w-full py-3 px-4 border border-red-200 text-red-600 rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-red-50">
                                                <X size={14} /> Unmatch Transaction
                                            </button>
                                        );
                                    } else {
                                        return (
                                            <button onClick={() => { toggleMatch(selectedTx.id); closeDrawer(); }} className="w-full py-3 px-4 bg-[#F5C742] text-slate-900 rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-yellow-400">
                                                <CheckCircle size={14} /> Match with Ledger
                                            </button>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BankReconciliation;
