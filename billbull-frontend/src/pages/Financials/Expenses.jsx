import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
    DollarSign, TrendingUp, TrendingDown, Plus, Search, MoreHorizontal,
    Download, FileText, ChevronLeft, Trash, Edit, X, ChevronDown,
    Printer as PrintIcon, Building2, CreditCard, Banknote, CheckSquare, Mail
} from 'lucide-react';
import { getVendors } from '../../api/vendorsApi';
import { getCostCenters, getAccounts, getBankAccounts } from '../../api/ledgerApi';
import { fetchExpenses, createExpense, updateExpense, deleteExpense } from '../../api/expensesApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { resolveVoucherSettings } from '../../utils/financialPrintTemplate';
import { printHtml } from '../../utils/printGenerator';
import { buildDocumentHeaderProfile } from '../../utils/branchPrintProfile';
import { ExpensePreview } from './FinancialVoucherDesigner';
import toast from 'react-hot-toast';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import CurrencyAmount, { CurrencySymbol } from '../../components/CurrencyAmount';
import { formatDisplayDate } from '../../utils/dateUtils';
import LedgerAccountCreateModal from '../../components/common/LedgerAccountCreateModal';
import PaginationFooter from '../../components/common/PaginationFooter';
import TableSkeleton from '../../components/common/TableSkeleton';

const PAYMENT_MODES = ['Cash', 'Card', 'Credit', 'Bank Transfer', 'Cheque', 'Online Payment'];
const TAX_RATES = [0, 5];
const CATEGORIES = ['Utilities', 'Rent', 'Marketing', 'Operational', 'Office Supplies', 'Travel', 'Entertainment', 'Transport', 'Other'];

const fmt = (v) => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PayIcon = ({ mode }) => {
    const icons = {
        Cash: <Banknote size={12} />,
        Card: <CreditCard size={12} />,
        Cheque: <CheckSquare size={12} />,
        'Bank Transfer': <Building2 size={12} />,
        'Online Payment': <Building2 size={12} />,
        Credit: <CreditCard size={12} />,
    };
    return icons[mode] || <DollarSign size={12} />;
};

const StatusBadge = ({ status }) => {
    const styles = {
        Paid:      'bg-[#F5C742] text-slate-900 border-[#F5C742]',
        Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
        Draft:     'bg-slate-100 text-slate-600 border-slate-200',
        Cancelled: 'bg-red-50 text-red-600 border-red-200',
    };
    return (
        <span className={`px-1.5 py-[1px] rounded text-[9px] font-bold tracking-wide border ${styles[status] || styles.Draft}`}>
            {status?.toUpperCase()}
        </span>
    );
};

const emptyLine = () => ({ _backendId: null, glAccountId: '', glAccountName: '', description: '', category: '', costCenter: '', amount: '', taxRate: 0 });
const emptyForm = () => ({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    vendorId: null,
    paymentMode: 'Cash',
    paymentAccountId: '',
    branchId: null,
    narration: '',
    status: 'Draft',
    lines: [emptyLine()],
});

export default function Expenses() {
    const { company } = useCompany();
    const { branches: availableBranches, activeBranch } = useBranch();
    const currency = company?.currency || 'AED';

    // --- DATA ---
    const [vouchers, setVouchers]       = useState([]);
    const [vendors, setVendors]         = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [glAccounts, setGlAccounts]   = useState([]);
    const [payAccounts, setPayAccounts] = useState([]);
    const [isLoading, setIsLoading]     = useState(false);

    // --- VIEW STATE ---
    const [viewMode, setViewMode]         = useState('list'); // 'list' | 'create' | 'edit'
    const [editingId, setEditingId]       = useState(null);
    const [editingGroupIds, setEditingGroupIds]   = useState([]);
    const [editingGroupId, setEditingGroupId]     = useState(null);
    const [form, setForm]               = useState(emptyForm());
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [isAccountCreateOpen, setIsAccountCreateOpen] = useState(false);
    const [accountCreateTargetLine, setAccountCreateTargetLine] = useState(null);

    // --- FILTERS ---
    const [searchTerm, setSearchTerm]   = useState('');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterPayMode, setFilterPayMode] = useState('All Pay Modes');
    const [listPage, setListPage]       = useState(0);
    const PAGE_SIZE = 20;

    useEffect(() => { loadAll(); }, []);
    useEffect(() => {
        const h = () => loadAll();
        window.addEventListener('billbull:branch-changed', h);
        return () => window.removeEventListener('billbull:branch-changed', h);
    }, []);

    const loadAll = async () => {
        setIsLoading(true);
        try {
            const [vndData, ccData, glData, bankData, expData] = await Promise.all([
                getVendors(),
                getCostCenters(),
                getAccounts(),
                getBankAccounts().catch(() => []),
                fetchExpenses().catch(() => []),
            ]);
            setVendors(Array.isArray(vndData) ? vndData : []);
            setCostCenters(Array.isArray(ccData) ? ccData : []);
            setGlAccounts(Array.isArray(glData) ? glData.filter(a => a.status !== 'archived') : []);
            setPayAccounts(Array.isArray(bankData) ? bankData : []);

            const allGl = Array.isArray(glData) ? glData : [];

            // Map each raw expense to an intermediate shape with a resolved line.
            // Location format: "" (single) | "GRP-{ts}" (legacy group) | "GRP-{ts}|{narration}" (grouped with narration).
            const expArr = (Array.isArray(expData) ? expData : []).map(e => {
                const glAcct = allGl.find(a => a.id === e.glAccountId);
                const loc = e.location || '';
                let groupId = null;
                let narration = e.notes || '';
                let lineDescription = '';

                if (loc.startsWith('GRP-')) {
                    const pipeIdx = loc.indexOf('|');
                    groupId     = pipeIdx > -1 ? loc.substring(0, pipeIdx) : loc;
                    narration   = pipeIdx > -1 ? loc.substring(pipeIdx + 1) : '';
                    lineDescription = e.notes || '';
                }

                return {
                    id:               e.id,
                    date:             e.date,
                    vendor:           e.vendor || '',
                    paymentMode:      e.paymentMode || 'Cash',
                    paymentAccountId: e.paymentAccountId || '',
                    branch:           e.branch || null,
                    narration,
                    status:           e.status || 'Draft',
                    groupId,
                    line: {
                        _backendId:    e.id,
                        glAccountId:   e.glAccountId  || '',
                        glAccountName: glAcct?.name   || '',
                        glAccountCode: glAcct?.code   || '',
                        description:   lineDescription,
                        category:      e.category     || '',
                        costCenter:    e.costCenter   || '',
                        amount:        e.amount       || 0,
                        taxRate:       e.taxRate      || 0,
                        taxAmount:     e.taxAmount    || 0,
                        lineTotal:     e.total        || 0,
                    },
                };
            });

            // Group expenses sharing a GRP-* location into one voucher
            const groupMap = {};
            const singleList = [];
            expArr.forEach(e => {
                if (e.groupId) {
                    if (!groupMap[e.groupId]) groupMap[e.groupId] = [];
                    groupMap[e.groupId].push(e);
                } else {
                    singleList.push(e);
                }
            });

            const makeVoucher = (first, lines, groupExpIds) => ({
                id:               first.id,
                voucherNumber:    `EXP-${first.id}`,
                date:             first.date,
                vendor:           first.vendor,
                paymentMode:      first.paymentMode,
                paymentAccountId: first.paymentAccountId,
                branch:           first.branch,
                narration:        first.narration,
                status:           first.status,
                groupId:          first.groupId,
                groupExpIds,
                lines,
                subTotal:   lines.reduce((s, l) => s + (l.amount    || 0), 0),
                totalTax:   lines.reduce((s, l) => s + (l.taxAmount || 0), 0),
                grandTotal: lines.reduce((s, l) => s + (l.lineTotal || 0), 0),
            });

            const mapped = [
                ...Object.values(groupMap).map(items => {
                    items.sort((a, b) => a.id - b.id);
                    const first = items[0];
                    return makeVoucher(first, items.map(i => i.line), items.map(i => i.id));
                }),
                ...singleList.map(e => makeVoucher(e, [e.line], [e.id])),
            ].sort((a, b) => b.id - a.id);

            setVouchers(mapped);
        } catch (e) {
            console.error(e);
            toast.error('Failed to load expenses');
        } finally {
            setIsLoading(false);
        }
    };

    // --- COMPUTED ---
    const filtered = useMemo(() => {
        return vouchers.filter(v => {
            const q = searchTerm.toLowerCase();
            const matchSearch = !q
                || (v.voucherNumber || '').toLowerCase().includes(q)
                || (v.vendor || '').toLowerCase().includes(q)
                || (v.narration || '').toLowerCase().includes(q);
            const matchStatus  = filterStatus === 'All Status'    || v.status === filterStatus;
            const matchPayMode = filterPayMode === 'All Pay Modes' || v.paymentMode === filterPayMode;
            return matchSearch && matchStatus && matchPayMode;
        });
    }, [vouchers, searchTerm, filterStatus, filterPayMode]);

    const paged = useMemo(
        () => filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE),
        [filtered, listPage]
    );
    useEffect(() => setListPage(0), [searchTerm, filterStatus, filterPayMode]);

    const stats = useMemo(() => {
        const grandTotal = vouchers.reduce((s, v) => s + parseFloat(v.grandTotal || 0), 0);
        const totalTax   = vouchers.reduce((s, v) => s + parseFloat(v.totalTax   || 0), 0);
        const branchSet  = new Set(vouchers.map(v => v.branch?.id).filter(Boolean));
        return { grandTotal, totalTax, count: vouchers.length, branches: branchSet.size };
    }, [vouchers]);

    // --- FORM LINE HELPERS ---
    const setLine = (idx, field, value) =>
        setForm(f => {
            const lines = f.lines.map((l, i) => {
                if (i !== idx) return l;
                const updated = { ...l, [field]: value };
                const amt = parseFloat(updated.amount) || 0;
                const tax = parseFloat(updated.taxRate) || 0;
                updated.taxAmount = ((amt * tax) / 100).toFixed(2);
                updated.lineTotal = (amt + parseFloat(updated.taxAmount)).toFixed(2);
                return updated;
            });
            return { ...f, lines };
        });

    const addLine    = () => setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }));
    const removeLine = (idx) => setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

    const formTotals = useMemo(() => {
        const subTotal   = form.lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
        const totalTax   = form.lines.reduce((s, l) => s + (parseFloat(l.taxAmount) || 0), 0);
        const grandTotal = subTotal + totalTax;
        return { subTotal, totalTax, grandTotal };
    }, [form.lines]);

    // --- ACTIONS ---
    const handleCreate = () => {
        setForm({ ...emptyForm(), branchId: activeBranch?.id || null });
        setEditingId(null);
        setEditingGroupIds([]);
        setEditingGroupId(null);
        setViewMode('create');
    };

    const handleEdit = (v) => {
        setForm({
            date: v.date || new Date().toISOString().split('T')[0],
            vendor: v.vendor || '',
            vendorId: v.vendorId || null,
            paymentMode: v.paymentMode || 'Cash',
            paymentAccountId: v.paymentAccountId || '',
            branchId: v.branch?.id || null,
            narration: v.narration || '',
            status: v.status || 'Draft',
            lines: (v.lines || []).map(l => ({
                _backendId:    l._backendId    || null,
                glAccountId:   l.glAccountId   || '',
                glAccountName: l.glAccountName || '',
                description:   l.description   || '',
                category:      l.category      || '',
                costCenter:    l.costCenter    || '',
                amount:        l.amount        != null ? String(l.amount) : '',
                taxRate:       l.taxRate       != null ? String(l.taxRate) : '0',
                taxAmount:     l.taxAmount     != null ? String(l.taxAmount) : '0',
                lineTotal:     l.lineTotal     != null ? String(l.lineTotal) : '0',
            })),
        });
        setEditingId(v.id);
        setEditingGroupIds(v.groupExpIds || [v.id]);
        setEditingGroupId(v.groupId || null);
        setViewMode('edit');
        setActiveMenuId(null);
    };

    const handleSave = async (targetStatus) => {
        if (!form.vendor) { toast.error('Vendor / Payee is required'); return; }
        if (!form.date)   { toast.error('Date is required'); return; }
        const validLines = form.lines.filter(l => l.glAccountId || parseFloat(l.amount));
        if (!validLines.length) { toast.error('Add at least one expense line'); return; }

        const status = targetStatus || form.status;

        // Use a shared group ID when there are multiple lines so they
        // can be re-grouped into one voucher on the next load.
        const needsGroup = validLines.length > 1;

        try {
            // Build location value:
            // - single line  → '' (no group)
            // - multi-line   → 'GRP-{ts}|{narration}'  (pipe separates groupId from narration)
            const buildLocation = (groupId) =>
                needsGroup ? `${groupId}|${form.narration || ''}` : '';

            // For multi-line vouchers, each line's notes = its own description.
            // For single-line, notes = narration (legacy-compatible).
            const lineNotes = (l) =>
                needsGroup ? (l.description || '') : (form.narration || '');

            if (editingId) {
                const groupId = needsGroup
                    ? (editingGroupId || `GRP-${Date.now()}`)
                    : '';
                const location = buildLocation(groupId);

                const basePayload = {
                    date: form.date, vendor: form.vendor,
                    paymentMode: form.paymentMode || '',
                    paymentAccountId: form.paymentAccountId || '',
                    location,
                    status,
                    ...(form.branchId ? { branch: { id: form.branchId } } : {}),
                };

                const prevIds = [...editingGroupIds];
                const usedIds = [];

                for (const l of validLines) {
                    const linePayload = {
                        ...basePayload,
                        notes:       lineNotes(l),
                        glAccountId: l.glAccountId || '',
                        category:    l.category    || '',
                        costCenter:  l.costCenter  || '',
                        amount:      parseFloat(l.amount)  || 0,
                        taxRate:     parseFloat(l.taxRate) || 0,
                    };
                    if (l._backendId && prevIds.includes(l._backendId)) {
                        await updateExpense(l._backendId, linePayload);
                        usedIds.push(l._backendId);
                    } else {
                        const created = await createExpense(linePayload);
                        usedIds.push(created.id);
                    }
                }

                // Delete any lines that were removed from the form
                for (const id of prevIds.filter(id => !usedIds.includes(id))) {
                    try { await deleteExpense(id); } catch { /* ignore — may be Paid */ }
                }

                toast.success('Expense updated');
            } else {
                const groupId = needsGroup ? `GRP-${Date.now()}` : '';
                const location = buildLocation(groupId);

                const basePayload = {
                    date: form.date, vendor: form.vendor,
                    paymentMode: form.paymentMode || '',
                    paymentAccountId: form.paymentAccountId || '',
                    location,
                    status,
                    ...(form.branchId ? { branch: { id: form.branchId } } : {}),
                };

                for (const l of validLines) {
                    await createExpense({
                        ...basePayload,
                        notes:       lineNotes(l),
                        glAccountId: l.glAccountId || '',
                        category:    l.category    || '',
                        costCenter:  l.costCenter  || '',
                        amount:      parseFloat(l.amount)  || 0,
                        taxRate:     parseFloat(l.taxRate) || 0,
                    });
                }
                toast.success(`${validLines.length} expense line${validLines.length > 1 ? 's' : ''} saved`);
            }
            await loadAll();
            setViewMode('list');
        } catch (e) {
            console.error(e);
            const msg = e?.response?.data?.message
                || e?.response?.data
                || e?.message
                || 'Failed to save expense';
            toast.error(String(msg));
        }
    };

    const handleDelete = async (voucher) => {
        const ids = voucher.groupExpIds || [voucher.id];
        if (!window.confirm(`Delete this expense voucher${ids.length > 1 ? ` (${ids.length} lines)` : ''}?`)) return;
        try {
            for (const id of ids) {
                await deleteExpense(id);
            }
            setVouchers(vs => vs.filter(v => v.id !== voucher.id));
            setActiveMenuId(null);
            toast.success('Deleted');
        } catch (e) {
            const msg = e?.response?.data?.message
                || e?.response?.data
                || e?.message
                || 'Failed to delete expense';
            toast.error(String(msg));
        }
    };

    const handlePrint = async (v) => {
        let template = null;
        try {
            const templates = await getTemplatesByCategory('Expense Voucher');
            template = templates?.find(t => t.isDefault) || templates?.[0] || null;
        } catch { /* use defaults */ }

        const settings = resolveVoucherSettings('expense-voucher', template);

        const coProfile = buildDocumentHeaderProfile({
            company,
            branches: availableBranches || [],
            branchId: v.branch?.id || null,
        });

        const payAccount = payAccounts.find(a => a.id === v.paymentAccountId);
        const evData = {
            voucherNumber: v.voucherNumber,
            date: v.date ? formatDisplayDate(v.date) : '',
            branch: v.branch?.name || '',
            paymentMode: v.paymentMode || '',
            paymentAccount: payAccount?.name || payAccount?.accountName || '',
            narration: v.narration || '',
            currency,
            claimant: v.vendor || '',
            items: (v.lines || []).map(l => {
                const acct = glAccounts.find(a => a.id === l.glAccountId);
                const acctLabel = acct
                    ? (acct.code ? `${acct.code} - ${acct.name || ''}` : (acct.name || ''))
                    : (l.glAccountName || '');
                return {
                    accountCode:   acctLabel,
                    glAccountName: acctLabel,
                    description:   l.description || '',
                    category:      l.category    || '',
                    costCenter:    l.costCenter   || '',
                    amount:        parseFloat(l.lineTotal || l.amount) || 0,
                };
            }),
        };

        const PAPER_PX = { A4: 794, A5: 559, Letter: 816 };
        const paperWidthPx = PAPER_PX[settings.paperSize] || PAPER_PX.A4;
        const PAPER_CSS = { A4: '210mm 297mm', A5: '148mm 210mm', Letter: '8.5in 11in' };
        const paper = PAPER_CSS[settings.paperSize] || PAPER_CSS.A4;

        const container = document.createElement('div');
        container.style.cssText = `width:${paperWidthPx}px;position:absolute;top:-9999px;left:-9999px;visibility:hidden;`;
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <ExpensePreview
                    s={settings}
                    currency={currency}
                    company={coProfile}
                    data={evData}
                />
            );
        });
        const bodyHtml = container.innerHTML;
        root.unmount();
        document.body.removeChild(container);

        printHtml(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Expense Voucher ${v.voucherNumber || ''}</title>
<style>
@page { size: ${paper}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`);
        setActiveMenuId(null);
    };

    const toggleExpand = (key) =>
        setExpandedIds(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

    const handleAccountCreated = (account) => {
        if (account?.id) {
            setGlAccounts(prev => [...prev, account]);
            if (accountCreateTargetLine != null) {
                setLine(accountCreateTargetLine, 'glAccountId', String(account.id));
                setLine(accountCreateTargetLine, 'glAccountName', account.name || '');
            }
        }
        setIsAccountCreateOpen(false);
        setAccountCreateTargetLine(null);
    };

    // ── FORM VIEW ──────────────────────────────────────────────────────────────
    if (viewMode === 'create' || viewMode === 'edit') {
        return (
            <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
                {/* Top bar */}
                <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setViewMode('list')} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium">
                            <ChevronLeft size={15} /> Back
                        </button>
                        <span className="text-slate-300">|</span>
                        <div>
                            <p className="text-sm font-bold text-slate-800">
                                {editingId ? `Edit Voucher` : 'New Expense Voucher'}
                            </p>
                            <p className="text-[10px] text-slate-400">Add multiple expense lines under one voucher</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setViewMode('list')} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded">
                            <X size={13} className="inline mr-1" />Cancel
                        </button>
                        <button onClick={() => handleSave('Draft')} className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50">
                            Save as Draft
                        </button>
                        <button onClick={() => handleSave('Paid')} className="px-4 py-1.5 text-xs font-bold text-white bg-[#F5C742] rounded hover:bg-[#e6b830]">
                            Submit &amp; Mark Paid
                        </button>
                    </div>
                </div>

                <div className="w-full px-6 py-6 space-y-6">
                    {/* Voucher Header */}
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Voucher Header — shared for all expense lines</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">DATE *</label>
                                <input type="date" value={form.date}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">VENDOR / PAYEE *</label>
                                <VendorSelect vendors={vendors} value={form.vendor}
                                    onChange={v => setForm(f => ({ ...f, vendor: v.name || v, vendorId: v.id || null }))} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">PAYMENT MODE *</label>
                                <select value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none bg-white">
                                    {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">PAYMENT ACCOUNT</label>
                                <select value={form.paymentAccountId} onChange={e => setForm(f => ({ ...f, paymentAccountId: e.target.value }))}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none bg-white">
                                    <option value="">Select account</option>
                                    {payAccounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">BRANCH / LOCATION *</label>
                                <select value={form.branchId || ''} onChange={e => setForm(f => ({ ...f, branchId: e.target.value ? Number(e.target.value) : null }))}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none bg-white">
                                    <option value="">Select branch</option>
                                    {(availableBranches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">NARRATION / REMARKS</label>
                                <input type="text" value={form.narration} placeholder="e.g. Daily operational expenses"
                                    onChange={e => setForm(f => ({ ...f, narration: e.target.value }))}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Expense Lines */}
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                            <p className="text-xs font-bold text-slate-700">Expense Lines</p>
                            <button onClick={addLine} className="flex items-center gap-1.5 text-xs font-bold text-[#B88A1A] hover:text-[#F5C742]">
                                <Plus size={13} /> Add Line
                            </button>
                        </div>
                        <div className="overflow-visible">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-[#FFF8E7] border-b border-[#FDE6A9]">
                                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 w-6">#</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 min-w-[180px]">EXPENSE LEDGER ACCOUNT *</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 min-w-[160px]">DESCRIPTION</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 w-28">CATEGORY</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 w-32">COST CENTER</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 w-24">AMOUNT (<CurrencySymbol currency={currency} />) *</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 w-20">TAX %</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 w-24">LINE TOTAL</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.lines.map((line, idx) => (
                                        <ExpenseLineRow
                                            key={idx}
                                            idx={idx}
                                            line={line}
                                            glAccounts={glAccounts}
                                            costCenters={costCenters}
                                            onChange={(field, val) => setLine(idx, field, val)}
                                            onRemove={() => removeLine(idx)}
                                            canRemove={form.lines.length > 1}
                                            onNewAccount={() => { setAccountCreateTargetLine(idx); setIsAccountCreateOpen(true); }}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Footer totals */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                            <span className="text-[10px] text-slate-400 font-medium">LINES: {form.lines.filter(l => l.glAccountId || l.amount).length}</span>
                            <div className="flex items-center gap-6 text-xs">
                                <span className="text-slate-500">Sub-total: <CurrencyAmount value={formTotals.subTotal} currency={currency} className="font-bold text-slate-700" /></span>
                                <span className="text-slate-500">Tax: <CurrencyAmount value={formTotals.totalTax} currency={currency} className="font-bold text-slate-700" /></span>
                                <span className="text-slate-600 text-sm">Grand Total: <CurrencyAmount value={formTotals.grandTotal} currency={currency} className="font-bold text-[#1a1a2e] text-base" /></span>
                            </div>
                        </div>
                    </div>

                    {/* Bottom action row */}
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setViewMode('list')} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded">
                            <X size={13} className="inline mr-1" />Cancel
                        </button>
                        <button onClick={() => handleSave('Draft')} className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50">
                            Save as Draft
                        </button>
                        <button onClick={() => handleSave('Paid')} className="px-5 py-2 text-xs font-bold text-white bg-[#F5C742] rounded hover:bg-[#e6b830]">
                            Submit &amp; Mark Paid
                        </button>
                    </div>
                </div>

                {isAccountCreateOpen && (
                    <LedgerAccountCreateModal
                        isOpen={isAccountCreateOpen}
                        onClose={() => { setIsAccountCreateOpen(false); setAccountCreateTargetLine(null); }}
                        onAccountCreated={handleAccountCreated}
                    />
                )}
            </div>
        );
    }

    // ── LIST VIEW ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#FFF8E7] flex items-center justify-center border border-[#FDE6A9]">
                            <TrendingDown className="text-[#B88A1A]" size={20} />
                        </div>
                        Expense Vouchers
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Multi-line vouchers grouped by vendor &amp; payment</p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                        <Download size={14} /> Export
                    </button>
                    <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-white rounded-md text-xs font-bold shadow-sm hover:bg-[#e6b830]">
                        <Plus size={14} /> Add Expense Voucher
                    </button>
                </div>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Grand Total',  value: <CurrencyAmount value={stats.grandTotal} currency={currency} className="text-2xl font-bold text-slate-800" />, sub: 'incl. tax',           icon: <DollarSign size={20} /> },
                    { label: 'Tax Paid',     value: <CurrencyAmount value={stats.totalTax}   currency={currency} className="text-2xl font-bold text-slate-800" />, sub: 'VAT',                icon: <FileText size={20} /> },
                    { label: 'Vouchers',     value: <span className="text-2xl font-bold text-slate-800">{stats.count}</span>,    sub: `${vouchers.reduce((s,v)=>s+(v.lines||[]).length,0)} expense lines`, icon: <FileText size={20} /> },
                    { label: 'Branches',     value: <span className="text-2xl font-bold text-slate-800">{stats.branches}</span>, sub: 'active',             icon: <Building2 size={20} /> },
                ].map(({ label, value, sub, icon }) => (
                    <div key={label} className="bg-white p-5 rounded-lg border border-slate-200 border-t-2 border-t-[#F5C742] shadow-sm flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
                            <div className="text-[#B88A1A] opacity-70">{React.cloneElement(icon, { size: 14 })}</div>
                        </div>
                        <div>
                            {value}
                            <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* FILTERS */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input type="text" placeholder="Search voucher, vendor, narration..."
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <select value={filterPayMode} onChange={e => setFilterPayMode(e.target.value)}
                        className="px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-[#F5C742] bg-white">
                        <option>All Pay Modes</option>
                        {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        className="px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-[#F5C742] bg-white">
                        <option>All Status</option>
                        {['Draft','Submitted','Paid','Cancelled'].map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            {/* VOUCHER LIST */}
            <div className="space-y-3">
                {isLoading ? (
                    <TableSkeleton rows={5} />
                ) : paged.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                        <FileText className="mx-auto text-slate-300 mb-3" size={40} />
                        <p className="text-sm font-bold text-slate-500">No expense vouchers found</p>
                        <p className="text-xs text-slate-400 mt-1">Click "Add Expense Voucher" to create your first one</p>
                    </div>
                ) : paged.map(v => {
                    const uniqueKey = v.isLegacy ? `legacy-${v.id}` : `new-${v.id}`;
                    return (
                        <VoucherCard
                            key={uniqueKey}
                            voucher={v}
                            currency={currency}
                            payAccounts={payAccounts}
                            expanded={expandedIds.has(uniqueKey)}
                            onToggle={() => toggleExpand(uniqueKey)}
                            menuOpen={activeMenuId === uniqueKey}
                            onMenuToggle={() => setActiveMenuId(id => id === uniqueKey ? null : uniqueKey)}
                            onEdit={() => handleEdit(v)}
                            onDelete={() => handleDelete(v)}
                            onPrint={() => handlePrint(v)}
                        />
                    );
                })}
            </div>

            {filtered.length > PAGE_SIZE && (
                <PaginationFooter
                    page={listPage} pageSize={PAGE_SIZE}
                    total={filtered.length}
                    onPageChange={setListPage}
                />
            )}

            {isAccountCreateOpen && (
                <LedgerAccountCreateModal
                    isOpen={isAccountCreateOpen}
                    onClose={() => { setIsAccountCreateOpen(false); setAccountCreateTargetLine(null); }}
                    onAccountCreated={handleAccountCreated}
                />
            )}
        </div>
    );
}

// ── VOUCHER CARD ──────────────────────────────────────────────────────────────
function VoucherCard({ voucher: v, currency, payAccounts, expanded, onToggle, menuOpen, onMenuToggle, onEdit, onDelete, onPrint }) {
    const menuRef = useRef(null);
    useEffect(() => {
        const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onMenuToggle(); };
        if (menuOpen) document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [menuOpen]);

    const lines = v.lines || [];

    const borderColor = v.status === 'Paid' ? 'border-l-[#F5C742]' : 'border-l-slate-300';
    return (
        <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${borderColor} shadow-sm`}>
            {/* Voucher header row */}
            <div className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-50 select-none ${expanded ? 'rounded-t-lg' : 'rounded-lg'}`}
                onClick={onToggle}>
                
                {/* LEFT SIDE */}
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{v.voucherNumber || `EV-${v.id}`}</span>
                        <StatusBadge status={v.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{formatDisplayDate(v.date)}</span>
                        {v.vendor && (
                            <>
                                <span className="text-slate-300">|</span>
                                <span className="font-medium text-slate-700">{v.vendor}</span>
                            </>
                        )}
                        {v.narration && (
                            <>
                                <span className="text-slate-300">|</span>
                                <span className="truncate max-w-[250px]">{v.narration}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT SIDE */}
                <div className="flex items-center gap-6 flex-shrink-0">
                    {/* Pay mode */}
                    <div className="flex items-center gap-1.5 text-xs text-[#B88A1A] font-medium whitespace-nowrap border border-[#FDE6A9] bg-[#FFF8E7] px-2 py-0.5 rounded-full">
                        <PayIcon mode={v.paymentMode} />
                        {v.paymentMode}
                    </div>
                    
                    {/* Branch */}
                    {v.branch && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
                            <Building2 size={12} />
                            <span className="truncate max-w-[120px]">{v.branch.name}</span>
                        </div>
                    )}
                    
                    {/* Lines count */}
                    <span className="text-xs text-slate-400 whitespace-nowrap w-12 text-right">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
                    
                    {/* Grand total */}
                    <div className="text-right min-w-[100px]">
                        <span className="block text-sm font-bold text-slate-800">
                            <CurrencyAmount value={v.grandTotal} currency={currency} />
                        </span>
                        {parseFloat(v.totalTax) > 0 && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                                incl. <CurrencyAmount value={v.totalTax} currency={currency} /> tax
                            </span>
                        )}
                    </div>

                    {/* Actions & Expand */}
                    <div className="flex items-center gap-2 ml-2">
                        <div className="relative flex-shrink-0" ref={menuRef} onClick={e => e.stopPropagation()}>
                            <button onClick={onMenuToggle}
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
                                <MoreHorizontal size={15} />
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-8 z-50 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs">
                                    <button onClick={onPrint} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700">
                                        <PrintIcon size={13} /> Print
                                    </button>
                                    <button onClick={onPrint} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700">
                                        <Download size={13} /> Download PDF
                                    </button>
                                    <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 border-b border-slate-100">
                                        <Mail size={13} /> Send Mail
                                    </button>
                                    <button onClick={onEdit} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700">
                                        <Edit size={13} /> Edit Voucher
                                    </button>
                                    <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600">
                                        <Trash size={13} /> Delete
                                    </button>
                                </div>
                            )}
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>

            {/* Expanded lines */}
            {expanded && lines.length > 0 && (
                <div className="border-t border-[#FDE6A9] bg-[#FFFCF5] rounded-b-lg overflow-hidden">
                    <div className="grid grid-cols-4 gap-4 px-5 py-4 bg-[#FFF8E7] border-b border-[#FDE6A9]">
                        <div>
                            <p className="text-[9px] font-bold text-[#B88A1A] uppercase mb-1">VENDOR / PAYEE</p>
                            <span className="inline-block text-xs font-bold text-slate-800">{v.vendor || '—'}</span>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-[#B88A1A] uppercase mb-1">PAYMENT MODE</p>
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <PayIcon mode={v.paymentMode} />
                                {v.paymentMode}
                            </span>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-[#B88A1A] uppercase mb-1">ACCOUNT</p>
                            <span className="inline-block text-xs font-bold text-slate-800 truncate max-w-full">
                                {payAccounts?.find(a => String(a.id) === String(v.paymentAccountId))?.name || (v.paymentMode === 'Cash' ? 'Petty Cash' : v.paymentMode)}
                            </span>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-[#B88A1A] uppercase mb-1">BRANCH</p>
                            <span className="inline-block text-xs font-bold text-slate-800 truncate max-w-full">
                                {v.branch?.name || '—'}
                            </span>
                        </div>
                    </div>

                    <table className="w-full text-xs">
                        <thead>
                            <tr>
                                <th className="px-4 py-2 text-left text-[10px] font-bold text-[#B88A1A] w-6">#</th>
                                <th className="px-4 py-2 text-left text-[10px] font-bold text-[#B88A1A]">LEDGER ACCOUNT</th>
                                <th className="px-4 py-2 text-left text-[10px] font-bold text-[#B88A1A]">DESCRIPTION</th>
                                <th className="px-4 py-2 text-left text-[10px] font-bold text-[#B88A1A]">CATEGORY</th>
                                <th className="px-4 py-2 text-left text-[10px] font-bold text-[#B88A1A]">COST CENTER</th>
                                <th className="px-4 py-2 text-right text-[10px] font-bold text-[#B88A1A]">AMOUNT</th>
                                <th className="px-4 py-2 text-right text-[10px] font-bold text-[#B88A1A]">TAX</th>
                                <th className="px-4 py-2 text-right text-[10px] font-bold text-[#B88A1A]">LINE TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l, i) => (
                                <tr key={i} className="border-t border-slate-100 hover:bg-white">
                                    <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                                    <td className="px-4 py-2 font-medium text-slate-700">{l.glAccountName || l.glAccountId}</td>
                                    <td className="px-4 py-2 text-slate-500">{l.description}</td>
                                    <td className="px-4 py-2">
                                        {l.category && (
                                            <span className="px-2 py-0.5 rounded-full bg-[#FFF8E7] text-[#B88A1A] border border-[#FDE6A9] text-[10px] font-bold">{l.category}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-slate-500">{l.costCenter}</td>
                                    <td className="px-4 py-2 text-right font-medium text-slate-700">{fmt(l.amount)}</td>
                                    <td className="px-4 py-2 text-right text-slate-400">{parseFloat(l.taxAmount) > 0 ? fmt(l.taxAmount) : '—'}</td>
                                    <td className="px-4 py-2 text-right font-bold text-slate-800">{fmt(l.lineTotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-[#FDE6A9] bg-[#FFF8E7]">
                                <td colSpan={5} className="px-4 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wide">Voucher Total</td>
                                <td className="px-4 py-2 text-right font-bold text-slate-700">{fmt(v.subTotal)}</td>
                                <td className="px-4 py-2 text-right font-bold text-slate-500">{fmt(v.totalTax)}</td>
                                <td className="px-4 py-2 text-right font-bold text-[#B88A1A]">
                                    <CurrencyAmount value={v.grandTotal} currency={currency} />
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── EXPENSE LINE ROW (form) ───────────────────────────────────────────────────
function ExpenseLineRow({ idx, line, glAccounts, costCenters, onChange, onRemove, canRemove, onNewAccount }) {
    const [acctOpen, setAcctOpen] = useState(false);
    const [acctQ, setAcctQ]       = useState('');
    const acctRef = useRef(null);

    useEffect(() => {
        const h = e => { if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const filteredAccts = useMemo(() => {
        const q = acctQ.toLowerCase();
        if (!q) return glAccounts.slice(0, 60);
        return glAccounts.filter(a =>
            (a.name || '').toLowerCase().includes(q) || (a.code || '').toLowerCase().includes(q)
        ).slice(0, 60);
    }, [glAccounts, acctQ]);

    const selectedAcct = glAccounts.find(a => String(a.id) === String(line.glAccountId));
    const displayAcct  = acctOpen ? acctQ : (selectedAcct ? `${selectedAcct.code ? selectedAcct.code + ' - ' : ''}${selectedAcct.name}` : line.glAccountName || '');

    const lineTotal = (parseFloat(line.amount) || 0) + (parseFloat(line.taxAmount) || 0);

    return (
        <tr className="border-t border-slate-100 hover:bg-slate-50/50">
            <td className="px-3 py-2 text-slate-400 text-center">{idx + 1}</td>
            {/* Ledger Account */}
            <td className="px-3 py-2 min-w-[180px]">
                <div ref={acctRef} className="relative">
                    <input type="text" value={displayAcct} placeholder="Select ledger..."
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none"
                        onFocus={() => { setAcctOpen(true); setAcctQ(''); }}
                        onChange={e => { setAcctQ(e.target.value); setAcctOpen(true); }} />
                    {acctOpen && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded shadow-lg">
                            {filteredAccts.map(a => (
                                <button key={a.id} type="button"
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-yellow-50"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                        onChange('glAccountId', String(a.id));
                                        onChange('glAccountName', a.name || '');
                                        setAcctOpen(false); setAcctQ('');
                                    }}>
                                    {a.code && <span className="font-mono text-[10px] text-slate-400 shrink-0">{a.code}</span>}
                                    <span className="truncate">{a.name}</span>
                                </button>
                            ))}
                            <button type="button" onMouseDown={e => e.preventDefault()}
                                onClick={() => { setAcctOpen(false); onNewAccount(); }}
                                className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-[#B88A1A] hover:bg-yellow-50 border-t border-slate-100">
                                <Plus size={11} /> Create new account
                            </button>
                        </div>
                    )}
                </div>
            </td>
            {/* Description */}
            <td className="px-3 py-2 min-w-[160px]">
                <input type="text" value={line.description} placeholder="Details / narration..."
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none"
                    onChange={e => onChange('description', e.target.value)} />
            </td>
            {/* Category */}
            <td className="px-3 py-2 w-28">
                <select value={line.category} onChange={e => onChange('category', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none bg-white">
                    <option value="">Category</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
            </td>
            {/* Cost Center */}
            <td className="px-3 py-2 w-32">
                <select value={line.costCenter} onChange={e => onChange('costCenter', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none bg-white">
                    <option value="">Cost center</option>
                    {costCenters.map(c => <option key={c.id || c} value={c.name || c}>{c.name || c}</option>)}
                </select>
            </td>
            {/* Amount */}
            <td className="px-3 py-2 w-24">
                <input type="number" value={line.amount} min="0" step="0.01" placeholder="0.00"
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none text-right"
                    onChange={e => onChange('amount', e.target.value)} />
            </td>
            {/* Tax % */}
            <td className="px-3 py-2 w-20">
                <select value={line.taxRate} onChange={e => onChange('taxRate', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none bg-white">
                    {TAX_RATES.map(t => <option key={t} value={t}>{t}%</option>)}
                </select>
            </td>
            {/* Line Total */}
            <td className="px-3 py-2 w-24 text-right font-bold text-slate-700 tabular-nums">
                {fmt(lineTotal)}
            </td>
            {/* Remove */}
            <td className="px-2 py-2 w-8">
                {canRemove && (
                    <button onClick={onRemove} className="text-slate-300 hover:text-red-500 transition-colors">
                        <X size={14} />
                    </button>
                )}
            </td>
        </tr>
    );
}

// ── VENDOR SELECT ─────────────────────────────────────────────────────────────
function VendorSelect({ vendors, value, onChange }) {
    const [open, setOpen] = useState(false);
    const [q, setQ]       = useState('');
    const ref             = useRef(null);

    useEffect(() => {
        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const filtered = useMemo(() => {
        const t = q.toLowerCase();
        if (!t) return vendors.slice(0, 50);
        return vendors.filter(v => (v.name || '').toLowerCase().includes(t)).slice(0, 50);
    }, [vendors, q]);

    const display = open ? q : value;

    return (
        <div ref={ref} className="relative">
            <input type="text" value={display} placeholder="Select vendor or payee"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:border-[#F5C742] focus:outline-none"
                onFocus={() => { setOpen(true); setQ(''); }}
                onChange={e => { setQ(e.target.value); setOpen(true); onChange(e.target.value); }} />
            {open && (
                <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded shadow-lg">
                    {filtered.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No vendors found</div>}
                    {filtered.map(v => (
                        <button key={v.id} type="button"
                            className="w-full px-3 py-2 text-left text-xs hover:bg-yellow-50 text-slate-700"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { onChange(v); setOpen(false); setQ(''); }}>
                            {v.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
