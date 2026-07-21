import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    LayoutDashboard,
    Search,
    Filter,
    Plus,
    ChevronDown,
    CreditCard,
    Banknote,
    Landmark,
    FileCheck,
    Wallet,
    History,
    X,
    Eye,
    RefreshCw,
    Download,
    Settings,
    ArrowLeft,
    Upload,
    Calendar,
    User,
    Hash,
    Check,
    Printer
} from 'lucide-react';
import SearchableDropdown from '../../../components/SearchableDropdown';
import { useCompany } from '../../../context/CompanyContext';
import { useBranch } from '../../../context/BranchContext';
import { buildDocumentHeaderProfile } from '../../../utils/branchPrintProfile';
import { formatDisplayDate } from '../../../utils/dateUtils';

// Printing Utilities
import { getTemplatesByCategory } from '../../../api/printTemplateApi';
import { generatePrintHtmlAsync, generatePdfHtmlAsync, printHtml, downloadPdf, downloadPdfViaServer } from '../../../utils/printGenerator';
import billBullLogo from '../../../assets/billBullLogo.png';
import toast from 'react-hot-toast';
import {
    buildPaymentVoucherPrintData,
    findVendorRecord,
    resolvePurchasePrintTemplate
} from '../../../utils/purchasePrintUtils';
import { formatCurrencyDisplay } from '../../../utils/countryCurrencyOptions';
import CurrencyAmount, { CurrencySymbol } from '../../../components/CurrencyAmount';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { getListSerialNumber } from '../../../utils/serialNumbering';

// ==========================================
// API IMPORTS
// ==========================================
import { getPostedInvoicesForPayment } from '../../../api/purchaseInvoiceApi';
import {
    getPaymentVouchersPage,
    getPaymentVoucherStats,
    getPaymentVoucherById,
    createPaymentVoucher,
    updateVoucherStatus
} from '../../../api/paymentApi';
import { getVendors } from '../../../api/vendorsApi';
import { getBankAccounts } from '../../../api/ledgerApi';
import PaymentVoucherPreviewSplitView from '../components/PaymentVoucherPreviewSplitView';

// ==========================================
// HELPERS & CONFIG
// ==========================================

const formatCurrency = (val, companyProfile) => formatCurrencyDisplay(val, companyProfile);

const getIconForMode = (mode) => {
    const m = mode ? mode.toUpperCase() : "CASH";
    if (m === 'BANK_TRANSFER') return Landmark;
    if (m === 'CHEQUE') return FileCheck;
    if (m === 'CARD') return CreditCard;
    return Banknote;
};

const formatModeString = (mode) => {
    if (!mode) return "Cash";
    const m = mode.toUpperCase();
    if (m === 'BANK_TRANSFER') return 'Bank Transfer';
    return mode.charAt(0) + mode.slice(1).toLowerCase();
};

const formatStatusString = (status) => {
    if (!status) return "Unknown";
    if (status === 'PENDING_APPROVAL') return 'Pending Approval';
    return status.charAt(0) + status.slice(1).toLowerCase();
};

const getStatusColor = (status) => {
    const s = status ? status.toUpperCase() : "";
    if (s === 'PENDING_APPROVAL') return "bg-amber-100 text-amber-700 border-amber-200";
    if (s === 'POSTED') return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (s === 'CLEARED') return "bg-green-100 text-green-700 border-green-200";
    if (s === 'REJECTED') return "bg-red-100 text-red-700 border-red-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
};

const getApiErrorMessage = (error, fallback = "Failed to process payment.") => {
    const data = error?.response?.data;
    if (data?.message) return data.message;
    if (typeof data === 'string' && data.trim()) return data;
    return error?.message || fallback;
};

// ==========================================
// SUB-COMPONENTS
// ==========================================

const StatCard = ({ data }) => {
    const Icon = data.icon;
    return (
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between relative overflow-hidden">
            <div>
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{data.label}</span>
                </div>
                <div className="text-xl font-bold text-slate-800 mb-1">{data.value}</div>
                <div className="text-[10px] text-slate-400">{data.sub}</div>
            </div>
            <div className={`w-1 h-8 rounded-full ${data.color}`}></div>
        </div>
    );
};

const AuditModal = ({ isOpen, onClose, voucher, currency = 'AED' }) => {
    if (!isOpen || !voucher) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">Audit Snapshot — <span className="font-mono text-slate-600">{voucher.id}</span></h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                <div className="p-6 bg-[#F8F9FB]">
                    <p className="text-xs text-slate-500 mb-4">Lock read-only snapshots after posting for audit compliance.</p>

                    <div className="flex gap-4 mb-6">
                        <div className="flex-1 bg-white p-3 rounded border border-slate-200 shadow-sm">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Vendor</div>
                            <div className="font-bold text-slate-800 text-sm">{voucher.vendor}</div>
                            <div className="text-[10px] text-slate-400">{voucher.vendorId}</div>
                        </div>
                        <div className="flex-1 bg-white p-3 rounded border border-slate-200 shadow-sm">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Amount</div>
                            <CurrencyAmount value={voucher.amountVal} currency={currency} className="font-bold text-slate-800 text-sm" />
                            <div className="text-[10px] text-slate-400">Mode: {voucher.mode}</div>
                        </div>
                        <div className="flex-1 bg-white p-3 rounded border border-slate-200 shadow-sm">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Status</div>
                            <div className="font-bold text-slate-800 text-sm">{voucher.status}</div>
                            <div className="text-[10px] text-slate-400">Date: {formatDisplayDate(voucher.date)}</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 p-4">
                        <h4 className="text-xs font-bold text-slate-700 mb-3">Audit Log</h4>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 w-2 h-2 rounded-full bg-slate-300"></div>
                            <div className="flex-1 pb-4 border-b border-slate-100 last:border-0">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-slate-800">
                                        {voucher.status === 'Pending Approval' ? 'Created Draft' : `Status update: ${voucher.status}`}
                                    </span>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Audit</span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1">System • {formatDisplayDate(voucher.date)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CreateVoucherModal = ({ isOpen, onClose, onCreate, purchaseInvoices, currency = 'AED' }) => {
    const [formData, setFormData] = useState({
        vendor: "",
        date: new Date().toISOString().split('T')[0],
        mode: "Cash",
        amount: "",
        ref: "",
        invoiceId: "",
        notes: ""
    });

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleInvoiceChange = (e) => {
        const selectedInvoiceId = e.target.value;
        const selectedInvoice = purchaseInvoices.find(inv => inv.id.toString() === selectedInvoiceId);

        if (selectedInvoice) {
            setFormData(prev => ({
                ...prev,
                invoiceId: selectedInvoiceId,
                vendor: selectedInvoice.vendorName || selectedInvoice.vendor || "Unknown Vendor",
                amount: selectedInvoice.grandTotal || selectedInvoice.total || 0,
                ref: selectedInvoice.invoiceNumber || ""
            }));
        } else {
            handleChange('invoiceId', selectedInvoiceId);
        }
    };

    const handleSubmit = () => {
        if (!formData.vendor || !formData.amount) return;
        onCreate(formData);
        setFormData({
            vendor: "",
            date: new Date().toISOString().split('T')[0],
            mode: "Cash",
            amount: "",
            ref: "",
            invoiceId: "",
            notes: ""
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-5 border-b border-slate-100">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">New Payment Voucher</h3>
                        <p className="text-xs text-slate-500">Request a new outbound payment against Invoice</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pay Against Invoice</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select
                                    className="w-full pl-9 pr-4 h-10 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 appearance-none bg-white"
                                    value={formData.invoiceId}
                                    onChange={handleInvoiceChange}
                                >
                                    <option value="">Select Purchase Invoice...</option>
                                    {purchaseInvoices && purchaseInvoices.map(inv => (
                                        <option key={inv.id} value={inv.id}>
                                            {inv.invoiceNumber ? `#${inv.invoiceNumber} - ` : ''}
                                            {inv.vendorName || inv.vendor}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Payment Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="date"
                                    className="w-full pl-9 pr-4 h-10 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
                                    value={formData.date}
                                    onChange={(e) => handleChange('date', e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Payment Mode</label>
                            <div className="relative">
                                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select
                                    className="w-full pl-9 pr-4 h-10 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 appearance-none bg-white"
                                    value={formData.mode}
                                    onChange={(e) => handleChange('mode', e.target.value)}
                                >
                                    <option>Cash</option>
                                    <option>Bank Transfer</option>
                                    <option>Cheque</option>
                                    <option>Card</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Amount (<CurrencySymbol currency={currency} />)</label>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400"><CurrencySymbol currency={currency} /></div>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
                                    value={formData.amount}
                                    onChange={(e) => handleChange('amount', e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Reference No / Cheque No</label>
                            <div className="relative">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Optional"
                                    className="w-full pl-9 pr-4 h-10 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
                                    value={formData.ref}
                                    onChange={(e) => handleChange('ref', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
                        <textarea
                            className="w-full p-3 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 resize-none h-20"
                            placeholder="Allocation details or internal notes..."
                            value={formData.notes}
                            onChange={(e) => handleChange('notes', e.target.value)}
                        ></textarea>
                    </div>
                </div>

                <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!formData.vendor || !formData.amount}
                        className="px-6 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Submit Request
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

const PaymentVoucher = () => {
    const { company } = useCompany();
    const { branches: availableBranches, activeBranch } = useBranch();
    const currency = company?.currency || 'AED';
    const [activeTab, setActiveTab] = useState("list");
    // Transaction Preview (read-only) — selected voucher backend id.
    const [previewVoucherDbId, setPreviewVoucherDbId] = useState(null);
    const [selectedVoucher, setSelectedVoucher] = useState(null);
    const [isCreateOpen, setCreateOpen] = useState(false);

    // Data State — `vouchers` now holds ONE server page for the active tab.
    const [vouchers, setVouchers] = useState([]);
    const [listPage, setListPage] = useState(0);
    const [pageMeta, setPageMeta] = useState({ totalElements: 0, totalPages: 0 });
    const LIST_PAGE_SIZE = 30;
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statsData, setStatsData] = useState({});
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── Pay Invoices Tab State ──────────────────────────────────────
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [isVendorOpen, setIsVendorOpen] = useState(false);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [vendorInvoices, setVendorInvoices] = useState([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [selectedInvoices, setSelectedInvoices] = useState({});
    const [settleAmounts, setSettleAmounts] = useState({});
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [bankAccount, setBankAccount] = useState('');
    const [reference, setReference] = useState('');
    const [payNotes, setPayNotes] = useState('');
    const [chequeDate, setChequeDate] = useState('');
    const [receivedAmount, setReceivedAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Initialize and Fetch Data
    useEffect(() => {
        fetchData();
    }, []);

    // Refetch when the global Branch Selector changes the active branch.
    useEffect(() => {
        const handler = () => fetchData();
        window.addEventListener('billbull:branch-changed', handler);
        return () => window.removeEventListener('billbull:branch-changed', handler);
    }, []);

    // Map a backend voucher entity to the row shape the table expects.
    const mapVoucher = useCallback((v) => ({
        dbId: v.id, // Actual Database ID for API calls
        id: v.voucherNumber || `ID-${v.id}`, // Display ID (e.g., PV-1234)
        date: v.paymentDate,
        vendor: v.vendorName,
        vendorId: v.vendorId || "VND-EXT",
        branchId: v.branch?.id ?? null,
        branchName: v.branch?.name || '',
        branchCode: v.branch?.code || '',
        mode: formatModeString(v.paymentMode),
        modeIcon: getIconForMode(v.paymentMode),
        amountVal: parseFloat(v.amount),
        allocatedVal: parseFloat(v.allocated || 0),
        unallocatedVal: parseFloat(v.unallocated || 0),
        amount: formatCurrency(v.amount, company),
        allocated: formatCurrency(v.allocated, company),
        unallocated: formatCurrency(v.unallocated, company),
        ref: v.referenceNumber || "—",
        status: formatStatusString(v.status),
        statusColor: getStatusColor(v.status),
        rawStatus: v.status // Keep raw enum for filtering
    }), [company]);

    // The active tab maps to a server-side status filter so each page is
    // fetched pre-filtered (no client-side splitting of a full dataset).
    const statusForTab = (tab) =>
        tab === 'approval' ? 'PENDING_APPROVAL'
        : tab === 'history' ? 'POSTED,REJECTED,CLEARED'
        : 'POSTED,CLEARED';

    // Fetch one server page for the active list tab.
    const fetchVouchers = useCallback(async () => {
        if (!['list', 'approval', 'history'].includes(activeTab)) return;
        setLoading(true);
        try {
            const res = await getPaymentVouchersPage({
                page: listPage,
                size: LIST_PAGE_SIZE,
                search: debouncedSearch,
                status: statusForTab(activeTab),
            });
            setVouchers((res.content || []).map(mapVoucher));
            setPageMeta({ totalElements: res.totalElements || 0, totalPages: res.totalPages || 0 });
        } catch (error) {
            console.error("Error loading vouchers:", error);
            setVouchers([]);
            setPageMeta({ totalElements: 0, totalPages: 0 });
        } finally {
            setLoading(false);
        }
    }, [activeTab, listPage, debouncedSearch, mapVoucher]);

    // Server-side payment stats for the summary cards.
    const fetchStats = useCallback(async () => {
        try {
            setStatsData(await getPaymentVoucherStats());
        } catch (error) {
            console.error("Error loading payment stats:", error);
        }
    }, []);

    const fetchData = async () => {
        try {
            // Reference data for the create/pay modals (loaded once).
            const invRes = await getPostedInvoicesForPayment();
            setPurchaseInvoices(Array.isArray(invRes) ? invRes : (invRes.data || []));

            const vendorRes = await getVendors();
            setVendors(Array.isArray(vendorRes) ? vendorRes : (vendorRes.data || []));

            const bankRes = await getBankAccounts();
            setBankAccounts(Array.isArray(bankRes) ? bankRes : []);
        } catch (error) {
            console.error("Error loading reference data:", error);
        }
        // Page rows + stats are fetched server-side.
        await Promise.all([fetchVouchers(), fetchStats()]);
    };

    // Debounce free-text search.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    // Reset to first page on tab/search change.
    useEffect(() => { setListPage(0); }, [activeTab, debouncedSearch]);

    // Re-fetch the current page whenever tab / search / page changes.
    useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

    // Stats come from the server aggregate (/api/vouchers/stats) so they cover
    // ALL posted/cleared vouchers, not just the currently-loaded page.
    const stats = useMemo(() => {
        const num = (key) => parseFloat(statsData?.[key] || 0);
        const totalPaid = num('TOTAL');
        const byCash = num('CASH');
        const byBank = num('BANK_TRANSFER');
        const byCheque = num('CHEQUE');
        const byCard = num('CARD');

        return [
            { label: "Total Paid", value: <CurrencyAmount value={totalPaid} currency={currency} />, sub: "Posted & Cleared vouchers", color: "bg-emerald-500", icon: Wallet },
            { label: "By Cash", value: <CurrencyAmount value={byCash} currency={currency} />, sub: `${totalPaid ? ((byCash / totalPaid) * 100).toFixed(1) : 0}% of total`, color: "bg-amber-500", icon: Banknote },
            { label: "By Bank Transfer", value: <CurrencyAmount value={byBank} currency={currency} />, sub: `${totalPaid ? ((byBank / totalPaid) * 100).toFixed(1) : 0}% of total`, color: "bg-blue-600", icon: Landmark },
            { label: "By Cheque", value: <CurrencyAmount value={byCheque} currency={currency} />, sub: "Cleared & Posted Cheques", color: "bg-purple-600", icon: FileCheck },
            { label: "By Card", value: <CurrencyAmount value={byCard} currency={currency} />, sub: `${totalPaid ? ((byCard / totalPaid) * 100).toFixed(1) : 0}% of total`, color: "bg-pink-500", icon: CreditCard },
        ];
    }, [statsData, currency]);

    // Actions
    const handleCreateVoucher = async (data) => {
        try {
            await createPaymentVoucher(data);
            setCreateOpen(false);
            setActiveTab('approval');
            fetchData();
        } catch (error) {
            console.error("Create failed", error);
            alert("Failed to create voucher");
        }
    };

    const handleApprove = async (displayId) => {
        const voucher = vouchers.find(v => v.id === displayId);
        if (!voucher) return;
        try {
            await updateVoucherStatus(voucher.dbId, 'POSTED');
            fetchData();
        } catch (error) {
            console.error("Approve failed", error);
            alert(getApiErrorMessage(error, "Failed to approve payment voucher."));
        }
    };

    const handleReject = async (displayId) => {
        if (window.confirm("Are you sure you want to reject this voucher request?")) {
            const voucher = vouchers.find(v => v.id === displayId);
            if (!voucher) return;
            try {
                await updateVoucherStatus(voucher.dbId, 'REJECTED');
                fetchData();
            } catch (error) {
                console.error("Reject failed", error);
            }
        }
    };

    const handlePrint = async (voucher) => {
        try {
            const loadingToast = toast.loading('Preparing print layout...');
            const templates = await getTemplatesByCategory('Payment Voucher').catch(() => []);
            toast.dismiss(loadingToast);

            const defaultTemplate = resolvePurchasePrintTemplate('Payment Voucher', templates);

            const fullVendor = findVendorRecord(vendors, voucher, voucher?.vendor, voucher?.vendorId);
            const printData = buildPaymentVoucherPrintData(
                {
                    voucherNumber: voucher.id,
                    paymentDate: voucher.date,
                    vendorName: voucher.vendor,
                    vendorId: voucher.vendorId,
                    amount: voucher.amountVal,
                    paymentMode: voucher.mode,
                    referenceNumber: voucher.ref,
                    status: voucher.rawStatus || voucher.status,
                },
                fullVendor,
                company
            );

            const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
                companyProfile: company,
                billBullLogo
            });

            printHtml(html);
        } catch (error) {
            console.error("Error printing Voucher:", error);
            toast.error('Failed to generate print layout');
        }
    };

    // Open the read-only Transaction Preview for a voucher (row click / tab).
    const openVoucherPreview = (voucher) => {
        setPreviewVoucherDbId(voucher.dbId ?? voucher.id);
        setActiveTab('preview');
    };

    const handlePrintVoucher = async (voucher) => {
        const loadingToast = toast.loading('Preparing print layout...');
        try {
            const [templates, voucherDetail] = await Promise.all([
                getTemplatesByCategory('Payment Voucher').catch(() => []),
                getPaymentVoucherById(voucher.dbId)
            ]);

            const defaultTemplate = resolvePurchasePrintTemplate('Payment Voucher', templates);
            const fullVendor = findVendorRecord(vendors, voucherDetail, voucherDetail?.vendorName);
            const linkedInvoice = purchaseInvoices.find((invoice) =>
                Number(invoice.id ?? invoice.dbId) === Number(voucherDetail.invoiceId) ||
                Number(invoice.dbId) === Number(voucherDetail.invoiceId) ||
                String(invoice.invoiceNumber || '') === String(voucherDetail.invoiceId || '')
            ) || null;
            const printData = buildPaymentVoucherPrintData(
                voucherDetail,
                fullVendor,
                company,
                linkedInvoice
            );

            const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
                companyProfile: company,
                billBullLogo
            });

            printHtml(html);
        } catch (error) {
            console.error("Error printing Voucher:", error);
            toast.error('Failed to generate print layout');
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    const handleDownloadVoucher = async (voucher) => {
        const loadingToast = toast.loading('Preparing download...');
        try {
            const [templates, voucherDetail] = await Promise.all([getTemplatesByCategory('Payment Voucher').catch(() => []), getPaymentVoucherById(voucher.dbId)]);
            const defaultTemplate = resolvePurchasePrintTemplate('Payment Voucher', templates);
            const fullVendor = findVendorRecord(vendors, voucherDetail, voucherDetail?.vendorName);
            const linkedInvoice = purchaseInvoices.find((invoice) => Number(invoice.id ?? invoice.dbId) === Number(voucherDetail.invoiceId) || Number(invoice.dbId) === Number(voucherDetail.invoiceId) || String(invoice.invoiceNumber || '') === String(voucherDetail.invoiceId || '')) || null;
            const printData = buildPaymentVoucherPrintData(voucherDetail, fullVendor, company, linkedInvoice);
            const html = await generatePrintHtmlAsync(defaultTemplate, printData, { companyProfile: company, billBullLogo });
            await downloadPdfViaServer(html, voucherDetail?.voucherNumber || voucher?.voucherNumber || 'Payment-Voucher');
        } catch (error) {
            console.error("Error downloading Voucher:", error);
            toast.error('Failed to generate download');
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    // ── Pay Invoices Computed ───────────────────────────────────────
    const totalOutstanding = useMemo(() =>
        vendorInvoices.reduce((sum, inv) => sum + (inv.balanceDue || inv.grandTotal || 0), 0),
    [vendorInvoices]);

    const totalToSettle = useMemo(() =>
        Object.keys(selectedInvoices).reduce((sum, id) =>
            selectedInvoices[id] ? sum + (parseFloat(settleAmounts[id]) || 0) : sum, 0),
    [selectedInvoices, settleAmounts]);

    const nextVoucherNo = useMemo(() => {
        const year = new Date().getFullYear();
        if (vouchers.length === 0) return `PV-${year}-0001`;
        const nums = vouchers.map(v => parseInt(v.id?.split('-').pop() || 0)).filter(n => !isNaN(n));
        const max = nums.length > 0 ? Math.max(...nums) : 0;
        return `PV-${year}-${String(max + 1).padStart(4, '0')}`;
    }, [vouchers]);

    const selectedCount = Object.values(selectedInvoices).filter(Boolean).length;

    // ── Pay Invoices Handlers ───────────────────────────────────────
    const handleVendorSelect = (vendor) => {
        setSelectedVendor(vendor);
        setIsVendorOpen(false);
        setSelectedInvoices({});
        setSettleAmounts({});
        setReceivedAmount('');

        setLoadingInvoices(true);
        const filtered = purchaseInvoices
            .map(inv => ({
                ...inv,
                grandTotal: Number(inv.grandTotal || 0),
                amountPaid: Number(inv.amountPaid || 0),
                balanceDue: Number(inv.balanceDue ?? inv.grandTotal ?? 0),
            }))
            .filter(inv =>
                (inv.vendorId === vendor.code || inv.vendorName === vendor.name || inv.vendor === vendor.name) &&
                inv.status === 'POSTED' &&
                inv.balanceDue > 0
            );
        const openingBal = parseFloat(vendor.openingBalance || 0);
        // Outstanding OB = opening balance minus on-account payments already posted.
        // Falls back to the raw opening balance if the API hasn't supplied it.
        const openingOutstanding = vendor.openingBalanceOutstanding != null
            ? parseFloat(vendor.openingBalanceOutstanding)
            : openingBal;
        if (openingOutstanding > 0) {
            filtered.unshift({
                id: `OB-${vendor.id || vendor.code}`,
                invoiceNumber: `OB-${vendor.code || vendor.id}`,
                invoiceDate: new Date().toISOString(),
                dueDate: null,
                grandTotal: openingBal,
                balanceDue: openingOutstanding,
                status: 'POSTED',
                paymentStatus: openingOutstanding < openingBal ? 'PARTIALLY_PAID' : 'UNPAID',
                invoiceType: 'OPENING_BALANCE',
                vendorName: vendor.name
            });
        }
        setVendorInvoices(filtered);
        setLoadingInvoices(false);
    };

    const handleInvoiceSelection = (inv, isSelected) => {
        const bal = inv.balanceDue || inv.grandTotal || 0;
        setSelectedInvoices(prev => ({ ...prev, [inv.id]: isSelected }));
        if (isSelected) {
            setSettleAmounts(prev => ({ ...prev, [inv.id]: bal }));
        } else {
            setSettleAmounts(prev => { const n = { ...prev }; delete n[inv.id]; return n; });
        }
    };

    const handleSelectAll = (e) => {
        const isChecked = e.target.checked;
        const newSel = {};
        const newAmts = {};
        if (isChecked) {
            vendorInvoices.forEach(inv => {
                newSel[inv.id] = true;
                newAmts[inv.id] = inv.balanceDue || inv.grandTotal || 0;
            });
        }
        setSelectedInvoices(newSel);
        setSettleAmounts(newAmts);
    };

    const handleSettleAmountChange = (invId, val, maxBal) => {
        let n = parseFloat(val) || 0;
        if (n > maxBal) n = maxBal;
        if (n < 0) n = 0;
        setSettleAmounts(prev => ({ ...prev, [invId]: n }));
    };

    const handleAutoAllocate = (amount) => {
        const total = parseFloat(amount) || 0;
        setReceivedAmount(amount);
        if (total <= 0) { setSettleAmounts({}); setSelectedInvoices({}); return; }

        let remaining = total;
        const newAmts = {};
        const newSel = {};
        const sorted = [...vendorInvoices].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
        for (const inv of sorted) {
            if (remaining <= 0) break;
            const bal = inv.balanceDue || inv.grandTotal || 0;
            const allocate = Math.min(remaining, bal);
            newAmts[inv.id] = allocate;
            newSel[inv.id] = true;
            remaining -= allocate;
        }
        setSettleAmounts(newAmts);
        setSelectedInvoices(newSel);
    };

    const handleProcessPayment = async () => {
        if (!selectedVendor) return alert('Select a vendor');
        const ids = Object.keys(selectedInvoices).filter(id => selectedInvoices[id]);
        if (ids.length === 0) return alert('Select at least one invoice');
        if (totalToSettle <= 0) return alert('Total must be > 0');

        setIsProcessing(true);
        try {
            await Promise.all(ids.map(async (invId) => {
                const amount = settleAmounts[invId];
                if (!amount || amount <= 0) return;
                const inv = vendorInvoices.find(i => i.id === invId);
                const isOB = inv?.invoiceType === 'OPENING_BALANCE';
                const saved = await createPaymentVoucher({
                    vendor: selectedVendor.name,
                    vendorId: selectedVendor.code,
                    date: paymentDate,
                    mode: paymentMethod,
                    amount,
                    ref: reference,
                    invoiceId: isOB ? null : invId,
                    notes: isOB ? `Opening Balance Payment${payNotes ? ': ' + payNotes : ''}` : payNotes,
                    chequeDate: paymentMethod === 'Cheque' ? chequeDate : null,
                    bankAccount: paymentMethod !== 'Cash' ? bankAccount : null,
                });
                if (saved && saved.id) {
                    try {
                        await updateVoucherStatus(saved.id, 'POSTED');
                    } catch (error) {
                        const voucherNo = saved.voucherNumber || `ID-${saved.id}`;
                        throw new Error(`${voucherNo} was sent to Pending Approval, but posting failed: ${getApiErrorMessage(error)}`);
                    }
                }
            }));

            alert('Payment processed successfully!');
            setSelectedInvoices({});
            setSettleAmounts({});
            setReceivedAmount('');
            setChequeDate('');
            setBankAccount('');
            setReference('');
            setPayNotes('');
            fetchData();
            // Refresh vendor invoices
            handleVendorSelect(selectedVendor);
        } catch (err) {
            console.error('Payment failed', err);
            alert(getApiErrorMessage(err, 'Failed to process some payments.'));
        } finally {
            setIsProcessing(false);
        }
    };

    // `vouchers` already holds exactly the server page for the active tab, so
    // each tab simply renders it directly (no client-side filtering/slicing).
    const pagedMainList = vouchers;
    const pagedPendingList = vouchers;
    const pagedHistoryList = vouchers;

    return (
        <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900 flex flex-col p-6">

            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <CreditCard className="w-7 h-7 text-[#F5C742]" />
                        <h1 className="text-2xl font-bold text-slate-900">Payment Voucher</h1>
                    </div>
                    <p className="text-sm text-slate-500">Record vendor payments, allocate against invoices, and post to accounts.</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        <span>Vendors & Purchases</span> <span>&rarr;</span> <span className="text-slate-600 font-medium">Payment Voucher</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('pay')}
                        className="h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded shadow-sm flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> New Voucher
                    </button>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {stats.map((stat, idx) => (
                    <StatCard key={idx} data={stat} />
                ))}
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                {[
                    { id: 'list', label: 'Voucher List' },
                    ...((previewVoucherDbId || activeTab === 'preview') ? [{ id: 'preview', label: 'Transaction Preview' }] : []),
                    { id: 'pay', label: 'Pay Invoices' },
                    { id: 'approval', label: 'Pending Approval' },
                    { id: 'history', label: 'History / Audit' },
                ].map(({ id, label }) => {
                    const isActive = activeTab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`pb-3 text-sm font-medium transition-colors relative ${isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {label}
                            {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#F5C742]"></div>}
                        </button>
                    );
                })}
            </div>

            {/* Main Content Area */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm">

                {/* Filter Bar */}
                {activeTab === 'list' && (
                    <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full xl:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search voucher no / vendor / ref..."
                                className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#F5C742] placeholder:text-slate-400"
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <div className="relative w-full sm:w-auto">
                                    <select className="w-full sm:w-auto h-10 pl-3 pr-8 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white appearance-none outline-none cursor-pointer hover:border-slate-300">
                                        <option>All Vendors</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                                <div className="relative w-full sm:w-auto">
                                    <select className="w-full sm:w-auto h-10 pl-3 pr-8 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white appearance-none outline-none cursor-pointer hover:border-slate-300">
                                        <option>All Modes</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                                <div className="relative w-full sm:w-auto">
                                    <select className="w-full sm:w-auto h-10 pl-3 pr-8 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white appearance-none outline-none cursor-pointer hover:border-slate-300">
                                        <option>All Status</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto justify-end sm:justify-start">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#F5C742] focus:ring-[#F5C742]" />
                                    <span className="text-sm text-slate-600">Unallocated only</span>
                                </label>
                                <button onClick={fetchData} className="h-10 px-4 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors">
                                    <RefreshCw className="w-3 h-3" /> Refresh
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Content Views */}

                {/* 0. Pay Invoices — inline UI matching Vendor Ledger */}
                {activeTab === 'pay' && (
                    <div className="p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">

                            {/* LEFT — 2/3 */}
                            <div className="lg:col-span-2 space-y-6">

                                {/* Vendor Selection & Balance */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Vendor <span className="text-red-500">*</span></label>
                                    <div className="mb-6">
                                        <SearchableDropdown
                                            options={vendors.map(v => ({
                                                value: v.id || v.code,
                                                label: v.name,
                                                subtitle: v.code ? `• ${v.code}` : undefined
                                            }))}
                                            value={selectedVendor?.id || selectedVendor?.code}
                                            onChange={(val) => {
                                                const vendor = vendors.find(v => (v.id || v.code) === val);
                                                if (vendor) {
                                                    handleVendorSelect(vendor);
                                                } else {
                                                    setSelectedVendor(null);
                                                    setSelectedInvoices({});
                                                    setSettleAmounts({});
                                                    setReceivedAmount('');
                                                    setVendorInvoices([]);
                                                }
                                            }}
                                            placeholder="Search or Select Vendor..."
                                            className="w-full"
                                        />
                                    </div>
                                    {selectedVendor && (
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center gap-3">
                                            <div className="bg-blue-100 p-2.5 rounded-full text-blue-600"><Wallet size={20} /></div>
                                            <div>
                                                <p className="text-sm font-bold text-blue-800">Outstanding Balance</p>
                                                <CurrencyAmount value={totalOutstanding} currency={currency} className="text-2xl font-bold text-blue-600" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Outstanding Invoices Table */}
                                {selectedVendor && (
                                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="p-4 border-b border-slate-200 bg-yellow-50 flex justify-between items-center">
                                            <div>
                                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                                    <FileCheck size={16} className="text-yellow-600" /> Outstanding Invoices
                                                </h3>
                                                <p className="text-xs text-slate-500">Select invoices to settle in this payment</p>
                                            </div>
                                            <button
                                                onClick={() => handleSelectAll({ target: { checked: selectedCount < vendorInvoices.length } })}
                                                className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
                                            >
                                                {selectedCount === vendorInvoices.length && vendorInvoices.length > 0 ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                            {loadingInvoices ? (
                                                <div className="flex justify-center py-16 text-slate-400 text-sm">Loading invoices...</div>
                                            ) : (
                                                <table className="bb-nowrap-table w-full text-sm text-left">
                                                    <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                                                        <tr>
                                                            <th className="px-4 py-3 w-10 text-center">
                                                                <input type="checkbox" onChange={handleSelectAll}
                                                                    checked={vendorInvoices.length > 0 && selectedCount === vendorInvoices.length}
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
                                                        {vendorInvoices.length > 0 ? vendorInvoices.map(inv => {
                                                            const bal = inv.balanceDue || inv.grandTotal || 0;
                                                            const isSelected = !!selectedInvoices[inv.id];
                                                            const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
                                                            return (
                                                                <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-yellow-50/50' : ''}`}>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <input type="checkbox" checked={isSelected}
                                                                            onChange={(e) => handleInvoiceSelection(inv, e.target.checked)}
                                                                            className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500 w-4 h-4 cursor-pointer" />
                                                                    </td>
                                                                    <td className="px-4 py-3 font-medium text-slate-700">
                                                                        {inv.invoiceType === 'OPENING_BALANCE'
                                                                            ? <span className="text-blue-700 font-bold">Opening Balance</span>
                                                                            : `#${inv.invoiceNumber}`}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                                                        {formatDisplayDate(inv.invoiceDate)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-xs">
                                                                        <span className={isOverdue ? 'text-red-500 font-bold' : 'text-slate-500'}>
                                                                            {formatDisplayDate(inv.dueDate, 'N/A')}
                                                                        </span>
                                                                        {isOverdue && <span className="block text-[9px] text-red-400">Overdue</span>}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-600 font-medium"><CurrencyAmount value={inv.grandTotal || 0} currency={currency} /></td>
                                                                    <td className="px-4 py-3 text-right font-bold text-orange-600"><CurrencyAmount value={bal} currency={currency} /></td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        {isOverdue
                                                                            ? <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">Overdue</span>
                                                                            : <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">Current</span>}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right">
                                                                        {isSelected ? (
                                                                            <input type="number" value={settleAmounts[inv.id] || ''}
                                                                                onChange={(e) => handleSettleAmountChange(inv.id, e.target.value, bal)}
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
                                                                <FileCheck size={32} className="mx-auto mb-2 opacity-50" />
                                                                No outstanding invoices found.
                                                            </td></tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT — 1/3 */}
                            <div className="space-y-6">

                                {/* Payment Entry Card */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-[#F5C742]"></div>
                                    <div className="p-5">
                                        <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <Wallet className="text-[#F5C742]" size={18} /> Payment Entry
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Payment Date <span className="text-red-500">*</span></label>
                                                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                                                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Payment Amount (Auto-Allocate) <span className="text-red-500">*</span></label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs"><CurrencySymbol currency={currency} /></span>
                                                    <input type="number" value={receivedAmount}
                                                        onChange={(e) => handleAutoAllocate(e.target.value)}
                                                        placeholder="0.00"
                                                        className="w-full pl-10 pr-3 py-2 text-sm font-bold border border-slate-200 rounded focus:border-[#F5C742] outline-none" />
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">Entering amount automatically selects oldest invoices.</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Payment No.</label>
                                                    <input type="text" value={nextVoucherNo} readOnly
                                                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-500" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Method</label>
                                                    <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); setBankAccount(''); }}
                                                        className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white">
                                                        <option>Cash</option>
                                                        <option>Bank Transfer</option>
                                                        <option>Cheque</option>
                                                        <option>Card</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {paymentMethod !== 'Cash' && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Bank Account <span className="text-red-500">*</span></label>
                                                    <div className="relative">
                                                        <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                        <select value={bankAccount} onChange={e => setBankAccount(e.target.value)}
                                                            className="w-full pl-8 text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white">
                                                            <option value="">Select Bank Account...</option>
                                                            {bankAccounts.map(acc => (
                                                                <option key={acc.id} value={acc.code || acc.name}>{acc.code} — {acc.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {paymentMethod === 'Cheque' && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Cheque Date <span className="text-red-500">*</span></label>
                                                    <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)}
                                                        className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Reference / Cheque No.</label>
                                                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                                                    placeholder="e.g. TXN-123456"
                                                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                                                <textarea rows="2" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                                                    placeholder="Enter payment notes..."
                                                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none resize-none"></textarea>
                                            </div>

                                            <div className="pt-4 border-t border-slate-100">
                                                <div className="flex justify-between items-center mb-4">
                                                    <span className="text-sm font-bold text-slate-600">Total Settlement</span>
                                                    <CurrencyAmount value={totalToSettle} currency={currency} className="text-xl font-bold text-[#F5C742]" />
                                                </div>
                                                <button onClick={handleProcessPayment}
                                                    disabled={isProcessing || !selectedVendor || totalToSettle <= 0}
                                                    className={`w-full bg-[#F5C742] text-slate-900 font-bold py-3 rounded-md hover:bg-yellow-400 transition-colors shadow-sm flex items-center justify-center gap-2 ${isProcessing || totalToSettle <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                    {isProcessing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</> : <><Check className="w-4 h-4" /> Process Payment</>}
                                                </button>
                                                <button className="w-full mt-3 bg-white border border-slate-200 text-slate-600 font-bold py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-xs">
                                                    <Printer size={14} /> Print Receipt
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Payments */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recent Payments</h3>
                                        <button onClick={fetchData} className="p-1 hover:bg-slate-200 rounded"><RefreshCw className="h-3 w-3 text-slate-400" /></button>
                                    </div>
                                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                        {vouchers.length > 0 ? vouchers.slice(0, 10).map((v, i) => (
                                            <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-yellow-100 transition-colors">
                                                <div className="mt-0.5">
                                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                                        <Check size={12} />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-bold text-slate-800 text-xs truncate">{v.vendor || 'Unknown'}</p>
                                                        <CurrencyAmount value={v.amountVal} currency={currency} className="text-xs font-bold text-emerald-600 px-1.5 py-0.5 bg-emerald-50 rounded" />
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <p className="text-[10px] text-slate-500">{v.id} • {v.mode}</p>
                                                        <p className="text-[10px] text-slate-400">{formatDisplayDate(v.date)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-6 text-slate-400">
                                                <FileCheck size={24} className="mx-auto mb-1 opacity-20" />
                                                <p className="text-[10px]">No recent transactions</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {/* 1. Main List */}
                {activeTab === 'list' && (
                    <div className="p-6">
                        <div className="mb-4">
                            <h3 className="font-bold text-slate-800">Payment Vouchers</h3>
                            <p className="text-sm text-slate-500">View, edit drafts, print, or reverse posted vouchers.</p>
                        </div>
                        {loading ? (
                            <div className="text-center py-10 text-slate-400 text-sm">Loading vouchers...</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="bb-nowrap-table w-full text-left text-xs">
                                    <thead className="bg-[#F9FAFB] text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-center text-slate-500 w-12 select-none uppercase font-medium">S.No.</th>
                                            <th className="px-4 py-3">Voucher No</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Vendor</th>
                                            <th className="px-4 py-3">Branch</th>
                                            <th className="px-4 py-3">Payment Mode</th>
                                            <th className="px-4 py-3 text-right">Amount</th>
                                            <th className="px-4 py-3 text-right">Allocated</th>
                                            <th className="px-4 py-3 text-right">Unallocated</th>
                                            <th className="px-4 py-3">Bank/Cheque Ref</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {pagedMainList.length === 0 ? (
                                            <tr><td colSpan="11" className="p-6 text-center text-slate-400">No posted vouchers found.</td></tr>
                                        ) : pagedMainList.map((row, index) => (
                                            <tr key={row.dbId} className="hover:bg-slate-50 group transition-colors cursor-pointer" onClick={() => openVoucherPreview(row)}>
                                                <td className="px-4 py-3 text-center text-slate-400 font-mono font-medium">
                                                    {getListSerialNumber(index, {
                                                        documentNumber: row.id,
                                                        page: listPage,
                                                        size: LIST_PAGE_SIZE,
                                                        totalElements: pageMeta.totalElements,
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-mono font-medium text-slate-700">{row.id}</td>
                                                <td className="px-4 py-3 text-slate-500">{formatDisplayDate(row.date)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-800">{row.vendor}</div>
                                                    <div className="text-[10px] text-slate-400">{row.vendorId}</div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 text-[11px]">
                                                    {row.branchCode ? (
                                                        <div className="font-medium">{row.branchCode}</div>
                                                    ) : row.branchName ? (
                                                        <div className="font-medium">{row.branchName}</div>
                                                    ) : (
                                                        <span className="text-slate-300">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                                                        <row.modeIcon className="w-3 h-3" /> {row.mode}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900"><CurrencyAmount value={row.amountVal} currency={currency} /></td>
                                                <td className="px-4 py-3 text-right text-slate-500"><CurrencyAmount value={row.allocatedVal} currency={currency} /></td>
                                                <td className="px-4 py-3 text-right text-slate-400"><CurrencyAmount value={row.unallocatedVal} currency={currency} /></td>
                                                <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{row.ref}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${row.statusColor}`}>{row.status}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100">
                                                        <button onClick={(e) => { e.stopPropagation(); setSelectedVoucher(row); }} className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-500" title="View Audit">
                                                            <Eye className="w-3 h-3" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handlePrintVoucher(row); }} className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-500" title="Print">
                                                            <Printer className="w-3 h-3" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadVoucher(row); }} className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-500" title="Download PDF">
                                                            <Download className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <PaginationFooter
                                    page={listPage}
                                    size={LIST_PAGE_SIZE}
                                    totalElements={pageMeta.totalElements}
                                    totalPages={pageMeta.totalPages}
                                    loading={loading}
                                    onPageChange={setListPage}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* 2. Pending Approval */}
                {activeTab === 'approval' && (
                    <div className="p-6 min-h-[400px]">
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-1">
                                <History className="w-4 h-4 text-slate-400" />
                                <h3 className="font-bold text-slate-800">Pending Approval</h3>
                            </div>
                            <p className="text-sm text-slate-500">Review and approve vouchers based on role thresholds & vendor risk flags.</p>
                        </div>

                        {loading ? (
                            <div className="text-center py-10 text-slate-400 text-sm">Checking for approvals...</div>
                        ) : (
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="bb-nowrap-table w-full text-left text-xs">
                                    <thead className="bg-[#F9FAFB] text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-center text-slate-500 w-12 select-none uppercase font-medium">S.No.</th>
                                            <th className="px-4 py-3">Voucher No</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Vendor</th>
                                            <th className="px-4 py-3">Mode</th>
                                            <th className="px-4 py-3 text-right">Amount</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {pagedPendingList.length === 0 ? (
                                            <tr><td colSpan="8" className="px-4 py-12 text-center text-slate-400">No vouchers pending approval.</td></tr>
                                        ) : pagedPendingList.map((row, index) => (
                                            <tr key={row.dbId} className="hover:bg-slate-50 group transition-colors">
                                                <td className="px-4 py-3 text-center text-slate-400 font-mono font-medium">
                                                    {getListSerialNumber(index, {
                                                        documentNumber: row.id,
                                                        page: listPage,
                                                        size: LIST_PAGE_SIZE,
                                                        totalElements: pageMeta.totalElements,
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-mono font-medium text-slate-700">{row.id}</td>
                                                <td className="px-4 py-3 text-slate-500">{formatDisplayDate(row.date)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-800">{row.vendor}</div>
                                                    <div className="text-[10px] text-slate-400">{row.vendorId}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                                                        <row.modeIcon className="w-3 h-3" /> {row.mode}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900"><CurrencyAmount value={row.amountVal} currency={currency} /></td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${row.statusColor}`}>{row.status}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleApprove(row.id)}
                                                            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-colors"
                                                        >
                                                            <Check className="w-3 h-3" /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(row.id)}
                                                            className="flex items-center gap-1 px-3 py-1 border border-red-200 text-red-600 hover:bg-red-50 rounded text-[10px] font-bold transition-colors"
                                                        >
                                                            <X className="w-3 h-3" /> Reject
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <PaginationFooter
                                    page={listPage}
                                    size={LIST_PAGE_SIZE}
                                    totalElements={pageMeta.totalElements}
                                    totalPages={pageMeta.totalPages}
                                    loading={loading}
                                    onPageChange={setListPage}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* 3. History View */}
                {activeTab === 'preview' && (
                    <div className="p-4">
                        <PaymentVoucherPreviewSplitView
                            vouchers={vouchers}
                            previewVoucherDbId={previewVoucherDbId}
                            onSelectVoucher={(v) => setPreviewVoucherDbId(v.dbId)}
                            listLoading={loading}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            vendorsList={vendors}
                            voucherCurrency={currency}
                            isPrinting={false}
                            onBack={() => setActiveTab('list')}
                            onPrint={(raw) => handlePrintVoucher({ ...raw, dbId: raw.id })}
                            onDownload={(raw) => handleDownloadVoucher({ ...raw, dbId: raw.id, voucherNumber: raw.voucherNumber })}
                        />
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="p-6">
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <History className="w-4 h-4 text-slate-400" />
                                <h3 className="font-bold text-slate-800">History / Audit</h3>
                            </div>
                            <p className="text-sm text-slate-500">Read-only view for posted/cleared/bounced/reversed vouchers.</p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="bb-nowrap-table w-full text-left text-xs">
                                <thead className="bg-[#F9FAFB] text-slate-500 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-center text-slate-500 w-12 select-none uppercase font-medium">S.No.</th>
                                        <th className="px-4 py-3">Voucher No</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Vendor</th>
                                        <th className="px-4 py-3">Mode</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pagedHistoryList.length === 0 ? (
                                        <tr><td colSpan="8" className="p-6 text-center text-slate-400">No history found.</td></tr>
                                    ) : pagedHistoryList.map((row, index) => (
                                        <tr key={row.dbId} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-center text-slate-400 font-mono font-medium">
                                                {getListSerialNumber(index, {
                                                    documentNumber: row.id,
                                                    page: listPage,
                                                    size: LIST_PAGE_SIZE,
                                                    totalElements: pageMeta.totalElements,
                                                })}
                                            </td>
                                            <td className="px-4 py-3 font-mono font-medium text-slate-700">{row.id}</td>
                                            <td className="px-4 py-3 text-slate-500">{formatDisplayDate(row.date)}</td>
                                            <td className="px-4 py-3 text-slate-800">{row.vendor}</td>
                                            <td className="px-4 py-3">
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                                                    <row.modeIcon className="w-3 h-3" /> {row.mode}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900"><CurrencyAmount value={row.amountVal} currency={currency} /></td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${row.statusColor}`}>{row.status}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setSelectedVoucher(row)}
                                                    className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-600 font-medium"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <PaginationFooter
                                page={listPage}
                                size={LIST_PAGE_SIZE}
                                totalElements={pageMeta.totalElements}
                                totalPages={pageMeta.totalPages}
                                loading={loading}
                                onPageChange={setListPage}
                            />
                        </div>
                    </div>
                )}

            </div>

            {/* Footer / Pro-tip */}
            <div className="mt-4 text-[10px] text-slate-400">
                Pro tip: Add <span className="font-bold text-slate-500">Payment Batch Run + Bank file export</span> to automate AP, and enforce <span className="font-bold text-slate-500">branch allocation rules</span> for multi-branch governance.
            </div>

            {/* Modals */}
            <AuditModal
                isOpen={!!selectedVoucher}
                onClose={() => setSelectedVoucher(null)}
                voucher={selectedVoucher}
                currency={currency}
            />

            <CreateVoucherModal
                isOpen={isCreateOpen}
                onClose={() => setCreateOpen(false)}
                onCreate={handleCreateVoucher}
                purchaseInvoices={purchaseInvoices}
                currency={currency}
            />

        </div>
    );
};

export default PaymentVoucher;
