// QA-055: Consolidated Payment Voucher page under Financials.
// Lists every outgoing payment — both vendor payment vouchers (from
// /api/vouchers) and expense payments (from /api/expenses) — so finance
// can view, print, and download a Payment Voucher for either source from
// one place. Vendor payments and expenses are normalized to a unified row
// shape; printing maps each back to its own field set against the shared
// "Payment Voucher" print template.

import React, { useEffect, useMemo, useState } from 'react';
import {
    Wallet,
    Search,
    Filter,
    FileText,
    Eye,
    Printer,
    Download,
    FileSpreadsheet,
    X,
    Banknote,
    Landmark,
    CreditCard,
    FileCheck,
    Receipt,
    CalendarDays,
    User,
    TrendingDown,
    Clock,
    CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
    getPaymentVouchers,
    getPaymentVoucherById
} from '../../api/paymentApi';
import { fetchExpenses } from '../../api/expensesApi';
import { getVendors } from '../../api/vendorsApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { getPostedInvoicesForPayment } from '../../api/purchaseInvoiceApi';

import { useCompany } from '../../context/CompanyContext';
import {
    buildPaymentVoucherPrintData,
    findVendorRecord,
    normalizePurchaseTemplate
} from '../../utils/purchasePrintUtils';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import billBullLogo from '../../assets/billBullLogo.png';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { formatDisplayDate } from '../../utils/dateUtils';
import { resolveCurrencyDisplayCode } from '../../utils/countryCurrencyOptions';
import { generateDocFilename } from '../../utils/filenameUtils';

// ------------------------------------------------------------------
// Display helpers (kept local — page-specific formatting only)
// ------------------------------------------------------------------

const formatMode = (mode) => {
    if (!mode) return 'Cash';
    const m = String(mode).toUpperCase().replace(/\s+/g, '_');
    if (m === 'BANK_TRANSFER') return 'Bank Transfer';
    if (m === 'ONLINE_PAYMENT') return 'Online Payment';
    return m.charAt(0) + m.slice(1).toLowerCase();
};

const iconForMode = (mode) => {
    const m = String(mode || '').toUpperCase().replace(/\s+/g, '_');
    if (m === 'BANK_TRANSFER') return Landmark;
    if (m === 'CHEQUE') return FileCheck;
    if (m === 'CARD') return CreditCard;
    return Banknote;
};

const formatStatus = (status) => {
    if (!status) return 'Pending';
    const s = String(status).toUpperCase();
    if (s === 'PENDING_APPROVAL') return 'Pending Approval';
    return s.charAt(0) + s.slice(1).toLowerCase();
};

const statusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'POSTED' || s === 'PAID' || s === 'CLEARED') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (s === 'PENDING_APPROVAL' || s === 'PENDING') return 'bg-amber-50 text-amber-700 border-amber-100';
    if (s === 'REJECTED' || s === 'VOIDED') return 'bg-red-50 text-red-700 border-red-100';
    return 'bg-slate-50 text-slate-600 border-slate-200';
};

// Voucher number used when the source row has none (expenses don't).
const expenseVoucherNumber = (exp) => `EXP-${String(exp.id || '').padStart(5, '0')}`;

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const PaymentVoucher = () => {
    const { company } = useCompany();
    const currency = resolveCurrencyDisplayCode(company || {});

    const [rows, setRows] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    const [loading, setLoading] = useState(false);

    const [selected, setSelected] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSource, setFilterSource] = useState('All Sources');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterMode, setFilterMode] = useState('All Modes');
    const [filterDateRange, setFilterDateRange] = useState('All Time');

    const TABLE_COLUMNS = [
        { header: 'Voucher No', key: 'voucherNumber', width: 16 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Paid To', key: 'paidTo', width: 24 },
        { header: 'Source', key: 'sourceLabel', width: 16 },
        { header: 'Amount', key: 'amount', width: 14 },
        { header: 'Mode', key: 'modeLabel', width: 14 },
        { header: 'Status', key: 'statusLabel', width: 14 }
    ];

    // ------------------------------------------------------------------
    // Data load: pull both sources, normalize to a unified row shape.
    // ------------------------------------------------------------------
    const loadData = async () => {
        setLoading(true);
        try {
            const [vouchersRes, expensesRes, vendorsRes, invoicesRes] = await Promise.all([
                getPaymentVouchers().catch(() => []),
                fetchExpenses().catch(() => []),
                getVendors().catch(() => []),
                getPostedInvoicesForPayment().catch(() => [])
            ]);

            setVendors(vendorsRes || []);
            setPurchaseInvoices(invoicesRes || []);

            const vendorRows = (vouchersRes || []).map((v) => ({
                key: `pv-${v.id}`,
                dbId: v.id,
                sourceType: 'VENDOR_PAYMENT',
                sourceLabel: 'Vendor Payment',
                raw: v,
                voucherNumber: v.voucherNumber || `PV-${String(v.id || '').padStart(5, '0')}`,
                date: v.paymentDate,
                paidTo: v.vendorName || '—',
                amount: Number(v.amount || 0),
                mode: v.paymentMode,
                modeLabel: formatMode(v.paymentMode),
                status: v.status,
                statusLabel: formatStatus(v.status),
                reference: v.referenceNumber || '',
                bankAccount: v.bankAccount || '',
                notes: v.notes || '',
                invoiceId: v.invoiceId || null
            }));

            const expenseRows = (expensesRes || []).map((e) => ({
                key: `exp-${e.id}`,
                dbId: e.id,
                sourceType: 'EXPENSE',
                sourceLabel: 'Expense Payment',
                raw: e,
                voucherNumber: expenseVoucherNumber(e),
                date: e.date,
                paidTo: e.vendor || e.category || '—',
                amount: Number(e.total != null ? e.total : (e.amount || 0)),
                mode: e.paymentMode,
                modeLabel: formatMode(e.paymentMode),
                status: e.status,
                statusLabel: formatStatus(e.status),
                reference: e.glAccountId || '',
                bankAccount: '',
                notes: e.notes || '',
                category: e.category,
                costCenter: e.costCenter,
                location: e.location
            }));

            // Most recent first.
            const merged = [...vendorRows, ...expenseRows].sort((a, b) => {
                const da = a.date ? new Date(a.date).getTime() : 0;
                const db = b.date ? new Date(b.date).getTime() : 0;
                return db - da;
            });
            setRows(merged);
        } catch (err) {
            console.error('Failed to load payment vouchers', err);
            toast.error('Failed to load payment vouchers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ------------------------------------------------------------------
    // Filter / search
    // ------------------------------------------------------------------
    const filtered = useMemo(() => {
        return rows.filter((r) => {
            if (filterSource !== 'All Sources') {
                if (filterSource === 'Vendor Payment' && r.sourceType !== 'VENDOR_PAYMENT') return false;
                if (filterSource === 'Expense Payment' && r.sourceType !== 'EXPENSE') return false;
            }
            if (filterStatus !== 'All Status' && r.statusLabel !== filterStatus) return false;
            if (filterMode !== 'All Modes' && r.modeLabel !== filterMode) return false;

            if (filterDateRange !== 'All Time' && r.date) {
                const d = new Date(r.date);
                const today = new Date();
                if (filterDateRange === 'Last 7 Days') {
                    const cut = new Date();
                    cut.setDate(today.getDate() - 7);
                    if (d < cut) return false;
                } else if (filterDateRange === 'This Month') {
                    if (d.getMonth() !== today.getMonth() || d.getFullYear() !== today.getFullYear()) return false;
                }
            }

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const match =
                    r.voucherNumber.toLowerCase().includes(q) ||
                    (r.paidTo || '').toLowerCase().includes(q) ||
                    String(r.amount).includes(q) ||
                    (r.reference || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }, [rows, filterSource, filterStatus, filterMode, filterDateRange, searchQuery]);

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------
    const stats = useMemo(() => {
        let totalPaid = 0;
        let vendorTotal = 0;
        let expenseTotal = 0;
        let pendingCount = 0;
        rows.forEach((r) => {
            const amt = Number(r.amount || 0);
            totalPaid += amt;
            if (r.sourceType === 'VENDOR_PAYMENT') vendorTotal += amt;
            else expenseTotal += amt;
            if (String(r.status || '').toUpperCase().includes('PENDING')) pendingCount += 1;
        });
        return {
            totalPaid,
            vendorTotal,
            expenseTotal,
            pendingCount,
            count: rows.length
        };
    }, [rows]);

    // ------------------------------------------------------------------
    // Print mapping — both source types funnel through the shared
    // "Payment Voucher" template so the field mapping (header, paid-to,
    // amount-in-words, payment-details block, footer) is identical.
    // ------------------------------------------------------------------
    const buildExpenseVoucherShape = (row) => {
        // Cast an Expense row into the PaymentVoucher-like shape that
        // buildPaymentVoucherPrintData understands. Keep fields aligned
        // with the template's labels so the printed output reads correctly.
        const e = row.raw || {};
        return {
            voucherNumber: row.voucherNumber,
            paymentDate: e.date,
            vendorName: e.vendor || e.category || 'Expense Payee',
            paymentMode: e.paymentMode || 'Cash',
            referenceNumber: e.glAccountId || row.reference || '',
            bankAccount: '',
            chequeDate: null,
            amount: Number(e.total != null ? e.total : (e.amount || 0)),
            allocated: Number(e.total != null ? e.total : (e.amount || 0)),
            unallocated: 0,
            status: e.status || 'POSTED',
            notes: [e.notes, e.category && `Category: ${e.category}`, e.costCenter && `Cost Centre: ${e.costCenter}`]
                .filter(Boolean)
                .join(' • '),
            invoiceId: null
        };
    };

    const handlePrint = async (row) => {
        const loadingToast = toast.loading('Preparing print layout...');
        try {
            const templates = await getTemplatesByCategory('Payment Voucher');
            if (!templates || templates.length === 0) {
                toast.error('No Payment Voucher template configured.');
                return;
            }
            const template = normalizePurchaseTemplate(
                templates.find((t) => t.isDefault) || templates[0],
                'Payment Voucher'
            );

            let printData;
            if (row.sourceType === 'VENDOR_PAYMENT') {
                // Pull the freshest voucher record + linked invoice for the
                // most accurate field mapping (allocated/unallocated, cheque
                // date, bank, etc).
                const detail = await getPaymentVoucherById(row.dbId).catch(() => row.raw);
                const fullVendor = findVendorRecord(vendors, detail, detail?.vendorName);
                const linkedInvoice = purchaseInvoices.find((inv) => inv.id === detail.invoiceId) || null;
                printData = buildPaymentVoucherPrintData(detail, fullVendor, company, linkedInvoice);
            } else {
                const shaped = buildExpenseVoucherShape(row);
                printData = buildPaymentVoucherPrintData(shaped, null, company, null);
            }

            const html = generatePrintHtml(template, printData, {
                companyProfile: company,
                billBullLogo
            });

            // Title drives the Save-as-PDF filename.
            const title = generateDocFilename(
                'Payment Voucher',
                row.voucherNumber,
                row.paidTo,
                row.date,
                currency
            );
            const titledHtml = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
            printHtml(titledHtml);
        } catch (err) {
            console.error('Failed to print payment voucher', err);
            toast.error('Failed to generate print layout');
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    // ------------------------------------------------------------------
    // Export
    // ------------------------------------------------------------------
    const handleExportExcel = () => {
        exportToExcel(
            filtered.map((r) => ({
                ...r,
                amount: r.amount.toLocaleString(),
                date: r.date ? formatDisplayDate(r.date) : ''
            })),
            TABLE_COLUMNS,
            'Payment_Vouchers'
        );
    };

    const handleExportPdf = () => {
        exportToPDF(
            filtered.map((r) => ({
                ...r,
                amount: r.amount.toLocaleString(),
                date: r.date ? formatDisplayDate(r.date) : ''
            })),
            TABLE_COLUMNS,
            'Payment Vouchers',
            'Payment_Vouchers'
        );
    };

    // ------------------------------------------------------------------
    // Drawer
    // ------------------------------------------------------------------
    const openDrawer = (row) => {
        setSelected(row);
        setDrawerOpen(true);
    };
    const closeDrawer = () => {
        setDrawerOpen(false);
        setTimeout(() => setSelected(null), 250);
    };

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 lg:p-6 relative overflow-x-hidden">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="text-[#F5C742]" size={28} /> Payment Vouchers
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Consolidated outgoing payments — vendor payments and expense payments
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">
                        Financials &rarr; <span className="font-semibold text-slate-600">Payment Voucher</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm"
                    >
                        <FileSpreadsheet size={16} /> Export Excel
                    </button>
                    <button
                        onClick={handleExportPdf}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm"
                    >
                        <Download size={16} /> Export PDF
                    </button>
                </div>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                    label="Total Paid"
                    value={`${currency} ${stats.totalPaid.toLocaleString()}`}
                    sub={`${stats.count} vouchers`}
                    icon={<Wallet size={20} />}
                    accent="bg-[#F5C742] text-slate-900"
                />
                <StatCard
                    label="Vendor Payments"
                    value={`${currency} ${stats.vendorTotal.toLocaleString()}`}
                    sub="Invoice / advance"
                    icon={<Banknote size={20} />}
                    accent="bg-emerald-50 text-emerald-600"
                />
                <StatCard
                    label="Expense Payments"
                    value={`${currency} ${stats.expenseTotal.toLocaleString()}`}
                    sub="Operating expenses"
                    icon={<TrendingDown size={20} />}
                    accent="bg-indigo-50 text-indigo-600"
                />
                <StatCard
                    label="Pending Approval"
                    value={stats.pendingCount}
                    sub="Awaiting clearance"
                    icon={<Clock size={20} />}
                    accent="bg-amber-50 text-amber-600"
                />
            </div>

            {/* FILTERS + TABLE */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Filter size={16} /> Payment Filters
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="md:col-span-2 relative">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                            <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Voucher No, Paid To, Reference..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium"
                            />
                        </div>
                        <FilterSelect
                            label="Source"
                            value={filterSource}
                            onChange={setFilterSource}
                            options={['All Sources', 'Vendor Payment', 'Expense Payment']}
                        />
                        <FilterSelect
                            label="Status"
                            value={filterStatus}
                            onChange={setFilterStatus}
                            options={['All Status', 'Posted', 'Pending Approval', 'Pending', 'Paid', 'Cleared', 'Rejected']}
                        />
                        <FilterSelect
                            label="Payment Mode"
                            value={filterMode}
                            onChange={setFilterMode}
                            options={['All Modes', 'Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Online Payment']}
                        />
                        <FilterSelect
                            label="Date Range"
                            value={filterDateRange}
                            onChange={setFilterDateRange}
                            options={['All Time', 'Last 7 Days', 'This Month']}
                        />
                    </div>
                </div>

                <div className="mb-4">
                    <h3 className="text-sm font-bold text-slate-700">Payment Vouchers</h3>
                    <p className="text-xs text-slate-500">
                        Showing {filtered.length} of {rows.length} vouchers
                    </p>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Voucher No</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Paid To</th>
                                <th className="px-4 py-3">Source</th>
                                <th className="px-4 py-3 text-right">Amount ({currency})</th>
                                <th className="px-4 py-3">Payment Mode</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-12 text-center text-slate-400 italic">
                                        Loading payment vouchers…
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-12 text-center text-slate-400 italic">
                                        No payment vouchers found.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((row) => {
                                    const ModeIcon = iconForMode(row.mode);
                                    return (
                                        <tr
                                            key={row.key}
                                            className="hover:bg-slate-50 cursor-pointer"
                                            onClick={() => openDrawer(row)}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-mono font-medium text-[10px]">
                                                    <FileText size={10} /> {row.voucherNumber}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">
                                                <span className="inline-flex items-center gap-1">
                                                    <CalendarDays size={12} /> {row.date ? formatDisplayDate(row.date) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                                                        <User size={12} />
                                                    </div>
                                                    <span className="font-medium text-slate-700">{row.paidTo}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border w-fit ${
                                                        row.sourceType === 'VENDOR_PAYMENT'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                    }`}
                                                >
                                                    {row.sourceLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-rose-600">
                                                {currency} {row.amount.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 text-slate-600">
                                                    <ModeIcon size={12} /> {row.modeLabel}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 w-fit ${statusBadge(row.status)}`}>
                                                    {String(row.status || '').toUpperCase().includes('POSTED') || String(row.status || '').toUpperCase() === 'PAID' ? (
                                                        <CheckCircle2 size={10} />
                                                    ) : (
                                                        <Clock size={10} />
                                                    )}
                                                    {row.statusLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openDrawer(row); }}
                                                        className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-500"
                                                        title="View"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePrint(row); }}
                                                        className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-500"
                                                        title="Print / Download Payment Voucher"
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DETAIL DRAWER */}
            {drawerOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
                    onClick={closeDrawer}
                />
            )}
            <div
                className={`fixed inset-y-0 right-0 z-50 w-[560px] max-w-full bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${
                    drawerOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {selected && (
                    <div className="h-full flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Receipt size={18} className="text-slate-500" /> Payment Voucher
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {selected.voucherNumber} • {selected.sourceLabel}
                                </p>
                            </div>
                            <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="border border-slate-200 rounded-lg p-4 text-center bg-white shadow-sm">
                                    <p className="text-2xl font-bold text-rose-600">
                                        {currency} {Number(selected.amount).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Amount Paid</p>
                                </div>
                                <div className="border border-slate-200 rounded-lg p-4 text-center flex flex-col items-center justify-center bg-white shadow-sm">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusBadge(selected.status)}`}>
                                        {selected.statusLabel}
                                    </span>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-2">Status</p>
                                </div>
                            </div>

                            <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Voucher Information</h4>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-6">
                                <Field label="Voucher No" value={selected.voucherNumber} />
                                <Field label="Date" value={selected.date ? formatDisplayDate(selected.date) : '—'} />
                                <Field label="Paid To" value={selected.paidTo} bold />
                                <Field label="Source" value={selected.sourceLabel} />
                                <Field label="Payment Mode" value={selected.modeLabel} />
                                <Field label="Reference" value={selected.reference || '—'} />
                                {selected.bankAccount && <Field label="Bank Account" value={selected.bankAccount} />}
                                {selected.sourceType === 'EXPENSE' && (
                                    <>
                                        <Field label="Category" value={selected.category || '—'} />
                                        <Field label="Cost Centre" value={selected.costCenter || '—'} />
                                        <Field label="Location" value={selected.location || '—'} />
                                    </>
                                )}
                                {selected.sourceType === 'VENDOR_PAYMENT' && selected.invoiceId && (
                                    <Field label="Linked Invoice" value={`#${selected.invoiceId}`} />
                                )}
                            </div>

                            {selected.notes && (
                                <>
                                    <h4 className="text-xs font-bold text-slate-700 mb-2 border-b border-slate-100 pb-2">Notes</h4>
                                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded border border-slate-100 mb-2">
                                        {selected.notes}
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button
                                onClick={() => handlePrint(selected)}
                                className="px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm flex items-center gap-2"
                            >
                                <Printer size={14} /> Print / Download
                            </button>
                            <button
                                onClick={closeDrawer}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------
// Small presentational helpers
// ------------------------------------------------------------------

const StatCard = ({ label, value, sub, icon, accent }) => (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-xs text-slate-500 font-semibold">{label}</p>
                <h3 className="text-2xl font-bold text-slate-800 mt-1">{value}</h3>
                <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
            </div>
            <div className={`p-2 rounded ${accent}`}>{icon}</div>
        </div>
    </div>
);

const FilterSelect = ({ label, value, onChange, options }) => (
    <div>
        <label className="block text-[10px] font-bold text-slate-500 mb-1">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
        >
            {options.map((o) => (
                <option key={o}>{o}</option>
            ))}
        </select>
    </div>
);

const Field = ({ label, value, bold }) => (
    <div>
        <p className="text-[10px] text-slate-400 font-bold uppercase">{label}</p>
        <p className={`text-xs ${bold ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}`}>{value}</p>
    </div>
);

export default PaymentVoucher;
