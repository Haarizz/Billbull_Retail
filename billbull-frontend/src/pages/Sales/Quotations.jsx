import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Printer,
    Mail,
    MessageCircle,
    Smartphone,
    Plus,
    History,
    Edit,
    Save,
    CheckCircle2,
    ChevronDown,
    User,
    Trash2,
    AlertTriangle,
    ShoppingCart,
    X,
    Check,
    Info,
    Search,
    Box,
    Paperclip,
    RotateCcw,
    Eye,
    PackageCheck, // New icon for stock check
    FileText, // ✅ Added FileText for Notes section
    ArrowUp,
    ArrowDown,
    ListFilter,
    Menu,
    ChevronUp,
    ChevronRight,
    ArrowLeft,
    SlidersHorizontal,
    MoreVertical,
    AlertCircle,
    Zap,
    Download
} from 'lucide-react';

// ✅ API IMPORTS
import { getAllCustomers } from '../../api/customerledgerApi';

// ✅ NEW QUOTATION API IMPORTS
import {
    getAllQuotations,
    getQuotationsPage,
    getQuotationStats,
    getQuotationById,
    saveQuotation,
    updateQuotationStatus,
    createRevision,
    uploadAttachment,
    checkQuotationStock,
    getNextQuotationNo,
    getItemPriceHistory,
    sendQuotationEmail
} from '../../api/quotationApi';
import { getStockAvailability } from '../../api/stockAvailabilityApi';
import { formatDisplayDate } from '../../utils/dateUtils';
import { compareDocumentValues } from '../../utils/documentOrdering';
import { getListSerialNumber, withListSerialNumbers } from '../../utils/serialNumbering';
import { pickSalesItemPrice, isPolicyOverridingPackings } from '../../utils/salesPricing';
import { computeLineTaxTotals, resolveLineTaxRate } from '../../utils/vatMath';
import { getActiveVatRate } from '../../api/taxApi';
import { getSalesSettings } from '../../api/salesSettingsApi';

// Ensure you have an axios instance or use fetch
import api from "../../api/axiosConfig";

// ✅ DYNAMIC UI COMPONENTS

import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';
// QA-FAST-ENTRY: inline row search input that auto-opens ProductSelector
import InlineProductSearchCell from '../../components/InlineProductSearchCell';
import PaginationFooter from '../../components/common/PaginationFooter';

// ✅ PRODUCT SELECTOR — self-fetching, server-side search
import ProductSelector from '../../components/ProductSelector';

// ✅ CUSTOMER SELECTOR — search modal + new customer
import CustomerSelector from '../../components/CustomerSelector';
import CustomerShippingPanel from '../../components/CustomerShippingPanel';
import CurrencyAmount from '../../components/CurrencyAmount';
import { resolveCustomer } from '../../utils/customerResolution';

// ✅ SHARED Item Add-Ons modal (BB-026)
import ItemAddOnsModal from '../../components/ItemAddOnsModal';

// ✅ STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';

// ✅ SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// ✅ LOGO IMPORTS FOR PRINT
import billBullLogo from '../../assets/billBullLogo.png';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtmlAsync, generateEmailHtml, printHtml, downloadPdf } from '../../utils/printGenerator';
import { buildDocumentHeaderProfile } from '../../utils/branchPrintProfile';
import { buildEmailBody } from '../../utils/emailImageInliner';
import { getImageUrl } from '../../utils/urlUtils';
import { getDefaultProductUnit, resolveUnitAmount } from '../../utils/unitPricing';
import { summarizeSalesItems } from '../../utils/documentSummaryUtils';
import {
    resolveCurrencyDisplayConfig,
    resolveCurrencyDisplayCode,
    UAE_DIRHAM_SYMBOL_IMAGE
} from '../../utils/countryCurrencyOptions';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import ExportDropdown from '../../components/common/ExportDropdown';
import DateFilter from '../../components/common/DateFilter';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { generateDocFilename } from '../../utils/filenameUtils';
import { isAutoNumberingEnabled } from '../../utils/salesNumbering';
import TableSkeleton from '../../components/common/TableSkeleton';
import KpiCards from '../../components/common/KpiCards';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const QUOTATION_COLUMNS = [
    { header: 'S.No.', key: 'sNo', width: 8 },
    { header: 'Quotation No', key: 'qtnNo', width: 15 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Customer', key: 'customer', width: 25 },
    { header: 'Total', key: 'total', width: 15 },
    { header: 'Status', key: 'status', width: 12 }
];

const WORLD_CURRENCY_CODES = [
    "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD",
    "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN",
    "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUC", "CUP", "CVE", "CZK",
    "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL",
    "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR",
    "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF",
    "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD",
    "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR",
    "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP",
    "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG",
    "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL",
    "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD",
    "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XDR", "XOF", "XPF",
    "XSU", "YER", "ZAR", "ZMW", "ZWG", "ZWL"
];

const getCurrencyDisplayName = (code) => {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
        const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
        return displayNames.of(code) || code;
    }
    return code;
};

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const asNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const hasText = (value) => String(value ?? '').trim().length > 0;

const isBlankQuotationItem = (item = {}) =>
    !hasText(item.code || item.itemCode)
    && !hasText(item.desc || item.description || item.name)
    && asNumber(item.qty ?? item.quantity) <= 0
    && asNumber(item.price) <= 0
    && asNumber(item.total ?? item.lineTotal) <= 0
    && asNumber(item.foc) <= 0;

const getSubmittableQuotationItems = (items = []) =>
    items.filter(item => !isBlankQuotationItem(item));

const getQuotationValidationMessage = (items = []) => {
    const activeItems = getSubmittableQuotationItems(items);

    if (activeItems.length === 0) {
        return 'Add at least one item before saving or approving the quotation.';
    }

    const issues = [];
    activeItems.forEach((item, index) => {
        const lineNo = index + 1;
        if (!hasText(item.code || item.itemCode) && !hasText(item.desc || item.description || item.name)) {
            issues.push(`Line ${lineNo}: select an item or enter a description.`);
        }
        if (asNumber(item.qty ?? item.quantity) <= 0) {
            issues.push(`Line ${lineNo}: quantity must be greater than 0.00.`);
        }
        if (asNumber(item.price) <= 0) {
            issues.push(`Line ${lineNo}: price must be greater than 0.00.`);
        }
    });

    return issues.join(' ');
};

const resolveApiErrorMessage = (error, fallback) => {
    const data = error?.response?.data;
    if (typeof data === 'string' && data.trim()) return data;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (error?.message) return error.message;
    return fallback;
};

const normalizeIncomingPaymentTerm = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '30 Days';
    if (['immediate', 'cash', 'cash on delivery'].includes(normalized)) return 'Immediate';
    if (['net15', 'net 15', '15 days'].includes(normalized)) return '15 Days';
    if (['net30', 'net 30', '30 days'].includes(normalized)) return '30 Days';
    if (['net45', 'net 45', '45 days'].includes(normalized)) return '45 Days';
    if (['net60', 'net 60', '60 days'].includes(normalized)) return '60 Days';
    return value;
};

const createInquiryCustomerSnapshot = (inquiry = {}, state = {}) => {
    const name = state.customerName || inquiry.customer || '';
    const mobile = state.customerMobile || inquiry.mobile || '';
    const email = state.customerEmail || inquiry.email || '';
    const address = state.customerAddress || inquiry.address || '';
    const code = state.customerCode || inquiry.customerCode || inquiry.inquiryNumber || 'Inquiry';
    const id = state.customerId || inquiry.customerId || null;

    return {
        id: id || (inquiry.id ? `inquiry-${inquiry.id}` : 'inquiry-customer'),
        code,
        name,
        mobile,
        phone: mobile,
        email,
        address,
        defaultShippingAddress: address,
        shippingAddress: address,
        groupType: 'Inquiry',
        creditStatus: 'Good',
        balance: 0,
        payTerms: normalizeIncomingPaymentTerm(state.paymentTerms),
        trn: '',
        savedAddresses: address ? [{
            name: 'Inquiry Address',
            address1: address,
            city: '',
            country: '',
            isDefault: true
        }] : []
    };
};

const renderCurrencyDisplayHtml = (currencyProps = {}) => {
    const currencyConfig = resolveCurrencyDisplayConfig(currencyProps);
    const currencyLabel = currencyConfig.label;
    if (currencyConfig.hasImage) {
        return `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="${escapeHtml(currencyLabel)}" style="height:0.82em;width:auto;display:inline-block;vertical-align:-0.08em;margin:0 0.12em;" />`;
    }

    return escapeHtml(currencyLabel);
};

// ✅ MOBILE COMPONENTS
const MobileCard = ({ qtn, onClick, renderStatusBadge, isExpanded, onToggleExpand, currencyProps = {} }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 transition-all relative overflow-hidden">
        {/* Main Card Content */}
        <div onClick={onClick} className="p-4 active:bg-slate-50 cursor-pointer">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 mt-0.5">
                        {qtn.revisions && qtn.revisions.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleExpand(e, qtn.id); }}
                                className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400"
                            >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                        )}
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                            <History size={20} />
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">{qtn.qtnNo}</h4>
                        <span className="text-xs text-slate-500">{formatDisplayDate(qtn.date)}</span>
                    </div>
                </div>
                {renderStatusBadge(qtn.status)}
            </div>

            <div className="space-y-2 mb-1">
                <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Customer</span>
                    <span className="font-medium text-slate-700 truncate max-w-[150px] text-right">{qtn.customer}</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Amount</span>
                    <CurrencyAmount value={qtn.total || 0} {...currencyProps} className="font-bold text-slate-800" />
                </div>
            </div>
        </div>

        {/* Expandable Revisions List inside Card */}
        {isExpanded && qtn.revisions && qtn.revisions.length > 0 && (
            <div className="bg-slate-50/50 border-t border-slate-100 divide-y divide-slate-100">
                {qtn.revisions.map(rev => (
                    <div key={`mob-rev-${rev.revId}`} className="p-3 pl-12 flex justify-between items-center text-xs">
                        <div>
                            <div className="font-bold text-slate-600 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-300"></div>
                                {rev.qtnNoDisplay}
                            </div>
                            <div className="text-slate-500 mt-0.5">{formatDisplayDate(rev.date)}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                            <CurrencyAmount value={rev.total || 0} {...currencyProps} className="font-bold text-slate-700" />
                            <div className="scale-90 origin-right">{renderStatusBadge(rev.status)}</div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const MobileFloatingActions = ({ status, onSaveDraft, onConfirm, onApprove, onReject, onRevise }) => {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 md:hidden">
            {status === 'Draft' ? (
                <>
                    <button
                        onClick={onSaveDraft}
                        className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm active:bg-slate-200"
                    >
                        Save Draft
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg text-sm shadow-sm active:opacity-90"
                    >
                        Confirm
                    </button>
                </>
            ) : status === 'Pending Approval' ? (
                <>
                    <button
                        onClick={onReject}
                        className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-lg text-sm border border-red-100 active:bg-red-100"
                    >
                        Reject
                    </button>
                    <button
                        onClick={onApprove}
                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg text-sm shadow-sm active:opacity-90"
                    >
                        Approve
                    </button>
                </>
            ) : status === 'Approved' ? (
                <button
                    onClick={onRevise}
                    className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-lg text-sm shadow-sm"
                >
                    Revise Quotation
                </button>
            ) : (
                <button
                    onClick={onRevise}
                    className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-lg text-sm shadow-sm"
                >
                    Revise
                </button>
            )}
        </div>
    );
};

const Quotations = () => {
    const { company } = useCompany();
    const { defaultBranch, defaultBranchName, formatBranchLocationLabel, isLoading: isBranchLoading, branches: availableBranches, activeBranch } = useBranch();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('list');
    const [editorMode, setEditorMode] = useState('edit');
    const [status, setStatus] = useState('Draft');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
    const [filterStatus, setFilterStatus] = useState('All');
    const _todayQTN = new Date().toISOString().slice(0, 10);
    const [dateRange, setDateRange] = useState({ fromDate: _todayQTN, toDate: _todayQTN });
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');
    const [printOptions, setPrintOptions] = useState({ printWithImages: false });
    const [salesSettings, setSalesSettings] = useState(null);
    const quotationAutoNumbering = isAutoNumberingEnabled(salesSettings, 'QUOTATION');

    // Add state for expandable rows in Quotation Form
    const [expandedRows, setExpandedRows] = useState({});

    // Add state for expandable rows in Quotations List (Revisions)
    const [expandedListRows, setExpandedListRows] = useState({});

    const toggleListRow = (e, qtnId) => {
        e.stopPropagation(); // prevent triggering row click that opens the edit form
        setExpandedListRows(prev => ({ ...prev, [qtnId]: !prev[qtnId] }));
    };

    const toggleAllDescriptions = () => {
        if (Object.keys(expandedRows).length > 0) {
            setExpandedRows({});
        } else {
            const allExpanded = {};
            items.forEach(item => allExpanded[item.id] = true);
            setExpandedRows(allExpanded);
        }
    };

    const toggleRowDescription = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // --- UI STATES ---
    const [isRevisionsOpen, setIsRevisionsOpen] = useState(false);
    const [isReviseModalOpen, setIsReviseModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailSending, setEmailSending] = useState(false);
    // QA-040: pre-rendered email body (same renderer as Print) so the preview
    // iframe shows exactly what the customer will receive.
    const [emailPreviewHtml, setEmailPreviewHtml] = useState('');
    const [activeActionMenu, setActiveActionMenu] = useState(null);
    const [actionMenuPosition, setActionMenuPosition] = useState(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [focusedRowId, setFocusedRowId] = useState(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // --- REVISION STATE ---
    const [revisionNote, setRevisionNote] = useState('');
    const [compareRevision, setCompareRevision] = useState(null);

    // --- QUOTATION MANAGEMENT STATES ---
    const [quotationsList, setQuotationsList] = useState([]);
    // Pagination state (server-driven via /api/sales/quotations/page)
    const [listPage, setListPage] = useState(0);
    const [listPageMeta, setListPageMeta] = useState({ page: 0, size: 30, totalElements: 0, totalPages: 0 });
    const [isListLoading, setIsListLoading] = useState(false);
    const [qtnStats, setQtnStats] = useState(null);
    const [isStatsLoading, setIsStatsLoading] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [nextQtnNo, setNextQtnNo] = useState("QTN-NEW");
    const [sourceInquiry, setSourceInquiry] = useState(null);

    const createBranchSnapshot = () => ({
        id: defaultBranch?.id ?? null,
        name: defaultBranch?.name || '',
        code: defaultBranch?.code || '',
        location: defaultBranch?.defaultWarehouseName || defaultBranch?.address || ''
    });

    const [quotationBranch, setQuotationBranch] = useState(createBranchSnapshot);

    // --- ATTACHMENT STATE ---
    const [attachments, setAttachments] = useState([]);

    // --- PRODUCT SELECTION STATES ---
    const [isProductSelectionOpen, setIsProductSelectionOpen] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState([]);

    // QA-FAST-ENTRY: inline-row-search → product-selector bridge state
    const [pendingFastEntrySearch, setPendingFastEntrySearch] = useState('');
    const [pendingFastEntryRowId, setPendingFastEntryRowId] = useState(null);
    const inlineSearchRefs = useRef({});
    const focusNextInlineSearchRef = useRef(null);

    // --- DROPDOWN STATES ---
    const [currency, setCurrency] = useState('AED');
    const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
    const [currencySearch, setCurrencySearch] = useState('');

    const [customer, setCustomer] = useState('');
    const [inquiryCustomerSnapshot, setInquiryCustomerSnapshot] = useState(null);
    const [isCustomerOpen, setIsCustomerOpen] = useState(false);
    const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);

    // ✅ DATA STATES
    const [customersList, setCustomersList] = useState([]);
    // productsList removed — ProductSelector fetches its own data from backend

    const [paymentTerm, setPaymentTerm] = useState('30 Days');
    const [isPaymentTermOpen, setIsPaymentTermOpen] = useState(false);

    // VAT mode for line-price interpretation. Document-level toggle: when
    // INCLUSIVE, line prices already contain tax; calculateRow extracts it.
    const [vatMode, setVatMode] = useState('EXCLUSIVE');

    // Fallback VAT % from the Tax Compliance module's Active VAT row. Used
    // when a product has no per-item Sales Tax % set.
    const [activeVatRate, setActiveVatRate] = useState(null);
    useEffect(() => {
        getActiveVatRate().then(setActiveVatRate);
    }, []);

    const [deliveryType, setDeliveryType] = useState('Delivery');
    const [isDeliveryTypeOpen, setIsDeliveryTypeOpen] = useState(false);
    const resolvedBranchLabel = formatBranchLocationLabel({
        name: quotationBranch.name || defaultBranch?.name,
        code: quotationBranch.code || defaultBranch?.code,
        defaultWarehouseName: quotationBranch.location || defaultBranch?.defaultWarehouseName,
        address: quotationBranch.location || defaultBranch?.address,
    }) || quotationBranch.name || defaultBranchName;
    const branchLocationDisplay = resolvedBranchLabel
        || (isBranchLoading ? 'Loading branch…' : 'No branch assigned');

    // Form Dates
    const [qtnDate, setQtnDate] = useState(new Date().toISOString().split('T')[0]);
    const [validTill, setValidTill] = useState(new Date().toISOString().split('T')[0]);
    const [expectedDispatch, setExpectedDispatch] = useState(new Date().toISOString().split('T')[0]);

    // Notes
    const [notesToCustomer, setNotesToCustomer] = useState('');
    const [internalNotes, setInternalNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');

    // ✅ BILL DISCOUNT STATE (New)
    const [billDiscount, setBillDiscount] = useState(0);

    // ✅ PRICE HISTORY STATE
    const [priceHistory, setPriceHistory] = useState([]);
    const [isPriceHistoryLoading, setIsPriceHistoryLoading] = useState(false);

    // ✅ LIVE STOCK MAP
    const [liveStockMap, setLiveStockMap] = useState({});

    // --- STOCK CHECK ---
    const [stockCheckResult, setStockCheckResult] = useState([]);
    const [showStockModal, setShowStockModal] = useState(false);

    // New State for Single Item Stock Modal
    const [selectedStockItem, setSelectedStockItem] = useState(null);
    const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);

    // Item Add-ons Modal (Settings)
    const [selectedAddonItem, setSelectedAddonItem] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);

    const companyCurrencyCode = company?.currency || '';
    const companyCurrencySymbol = company?.currencySymbol || '';
    const getDisplayCurrencyProps = (fallbackCurrency = currency) => ({
        currency: companyCurrencyCode || fallbackCurrency || 'AED',
        currencySymbol: companyCurrencySymbol || companyCurrencyCode || fallbackCurrency || 'AED'
    });
    const displayCurrencyProps = getDisplayCurrencyProps(currency);
    const displayCurrencyHtml = renderCurrencyDisplayHtml(displayCurrencyProps);

    useEffect(() => {
        if (editingId) {
            return;
        }

        setQuotationBranch(createBranchSnapshot());
    }, [
        defaultBranch?.id,
        defaultBranch?.name,
        defaultBranch?.code,
        defaultBranch?.defaultWarehouseName,
        defaultBranch?.address,
        editingId
    ]);

    useEffect(() => {
        if (editingId || activeTab !== 'create' || !companyCurrencyCode) {
            return;
        }

        setCurrency(prev => (prev && prev !== 'AED' ? prev : companyCurrencyCode));
    }, [activeTab, companyCurrencyCode, editingId]);

    const currencyOptions = useMemo(() => {
        return WORLD_CURRENCY_CODES
            .map((code) => {
                const name = getCurrencyDisplayName(code);
                return {
                    code,
                    name,
                    searchText: `${code} ${name}`.toLowerCase()
                };
            })
            .sort((a, b) => a.code.localeCompare(b.code));
    }, []);

    const filteredCurrencyOptions = useMemo(() => {
        const query = currencySearch.trim().toLowerCase();
        if (!query) {
            return currencyOptions;
        }
        return currencyOptions.filter((option) => option.searchText.includes(query));
    }, [currencyOptions, currencySearch]);

    const selectedCurrencyOption = useMemo(() => {
        return currencyOptions.find((option) => option.code === currency) || {
            code: currency,
            name: getCurrencyDisplayName(currency)
        };
    }, [currencyOptions, currency]);

    const canEditQuotation = (quotationStatus) => !['Approved', 'Invoiced', 'Converted to SO'].includes(quotationStatus);
    const isViewMode = activeTab === 'create' && editorMode === 'view';
    const canEditCurrentQuotation = canEditQuotation(status);
    const closeActionMenu = () => {
        setActiveActionMenu(null);
        setActionMenuPosition(null);
    };

    const [items, setItems] = useState([
        { id: Date.now(), code: '', image: '', desc: '', unit: 'PCS', qty: 0, price: 0, foc: 0, focUnit: 'PCS', availableUnits: ['PCS'], disc: 0, tax: 5, taxAmt: 0.00, total: 0.00, remarks: '', isProductSelected: false }
    ]);
    const createBlankQuotationItem = () => ({
        id: Date.now() + Math.random(),
        code: '',
        image: '',
        desc: '',
        unit: 'PCS',
        qty: 0,
        price: 0,
        foc: 0,
        focUnit: 'PCS',
        availableUnits: ['PCS'],
        disc: 0,
        tax: 5,
        taxAmt: 0.00,
        total: 0.00,
        remarks: '',
        isProductSelected: false
    });

    // ✅ GLOBAL SHORTCUTS
    useShortcuts({
        'ctrl+p': (e) => {
            if (activeTab === 'create' && !isViewMode) setIsProductSelectionOpen(prev => !prev);
        },
        'ctrl+s': (e) => {
            if (activeTab === 'create' && !isViewMode) handleSaveDraft();
        },
        'alt+c': (e) => {
            if (activeTab === 'create' && !isViewMode) setIsCustomerSearchOpen(prev => !prev);
        }
    });

    // ✅ Fetch price history and live stock whenever focusedRowId changes
    // QA-FAST-ENTRY: focus the freshly-added empty row's inline search input.
    useEffect(() => {
        const targetId = focusNextInlineSearchRef.current;
        if (targetId == null) return;
        const raf = requestAnimationFrame(() => {
            const el = inlineSearchRefs.current[targetId];
            if (el) el.focus();
            focusNextInlineSearchRef.current = null;
        });
        return () => cancelAnimationFrame(raf);
    }, [items]);

    useEffect(() => {
        if (!focusedRowId) {
            setPriceHistory([]);
            return;
        }

        const focusedItem = items.find(i => i.id === focusedRowId);
        if (focusedItem && focusedItem.code && focusedItem.isProductSelected) {
            fetchPriceHistoryForFocusedItem(focusedItem.code);

            // QA-001: service items have no stock — don't hit the availability API.
            const isService = (focusedItem.productType || '').toUpperCase() === 'SERVICE';
            if (!isService && !liveStockMap[focusedItem.code]) {
                getStockAvailability(focusedItem.code)
                    .then(res => {
                        const locs = res.locations || [];
                        const available = locs.reduce((sum, l) => sum + (l.available || 0), 0);
                        const reserved = locs.reduce((sum, l) => sum + (l.reserved || 0), 0);
                        setLiveStockMap(prev => ({
                            ...prev,
                            [focusedItem.code]: { available, reserved, data: res }
                        }));
                    }).catch(console.error);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusedRowId, items]);

    const fetchPriceHistoryForFocusedItem = async (itemCode) => {
        try {
            setIsPriceHistoryLoading(true);
            const history = await getItemPriceHistory(itemCode);
            setPriceHistory(history || []);
        } catch (error) {
            console.error("Failed to fetch price history", error);
            setPriceHistory([]);
        } finally {
            setIsPriceHistoryLoading(false);
        }
    };

    // ✅ HELPER: Map Backend Entity to Frontend State
    const mapBackendToFrontend = (data) => {
        return {
            id: data.id,
            qtnNo: data.qtnNo,
            customer: data.customer,
            customerCode: data.customerCode || '',
            customerMobile: data.customerMobile || '',
            customerEmail: data.customerEmail || '',
            date: data.date,
            validTill: data.validTill,
            branchId: data.branchId || null,
            branchName: data.branchName || '',
            branchCode: data.branchCode || '',
            branchLocation: data.branchLocation || '',
            sourceInquiryId: data.sourceInquiryId || null,
            sourceInquiryNumber: data.sourceInquiryNumber || '',
            total: data.totalAmount,
            billDiscount: data.billDiscount || 0,
            vatMode: data.vatMode || 'EXCLUSIVE',
            status: data.status === 'PENDING_APPROVAL' ? 'Pending Approval' :
                data.status === 'APPROVED' ? 'Approved' :
                    data.status === 'REJECTED' ? 'Rejected' :
                        data.status === 'CONVERTED' ? 'Converted to SO' :
                            data.status === 'INVOICED' ? 'Invoiced' :
                                data.status === 'EXPIRED' ? 'Expired' : 'Draft',
            currency: data.currency,
            paymentTerm: data.paymentTerms,
            deliveryType: data.deliveryType,
            expectedDispatch: data.expectedDispatch,
            shippingAddress: data.shippingAddress,
            notesToCustomer: data.notesToCustomer,
            internalNotes: data.internalNotes,
            attachments: data.attachments || [],
            revisions: data.revisions ? data.revisions.map(r => ({
                revId: r.id,
                revNumber: r.revisionNumber,
                qtnNoDisplay: r.qtnNoDisplay,
                date: r.revisionDate,
                note: r.followUpNote,
                status: r.statusAtTime,
                items: r.itemsSnapshotJson ? JSON.parse(r.itemsSnapshotJson) : [],
                total: r.totalAmountSnapshot
            })) : [],
            items: data.items.map(i => calculateRow({
                id: i.id || Math.random(),
                code: i.itemCode,
                name: i.itemName || i.name || '',
                barcode: i.barcode || '',
                image: i.primaryImage || i.image || '',
                desc: i.description,
                unit: i.unit || 'PCS',
                qty: i.quantity,
                price: i.price,
                foc: i.foc || 0,
                focUnit: i.focUnit || i.unit || 'PCS',
                availableUnits: i.availableUnits || ['PCS', 'Dozen', 'Box', 'Carton'],
                disc: i.discount,
                tax: i.taxRate,
                taxAmt: i.taxAmount,
                total: i.lineTotal,
                remarks: i.remarks,
                isProductSelected: !!i.itemCode,
                // QA-001: preserve the product-master hints the backend enriches
                // on the QuotationItem (transient fields). Without these, items
                // would lose their type on every list-reload — breaking the
                // stock-check skip for SERVICE items on "Convert to Sales Order".
                productType: (i.productType || 'STOCK').toUpperCase(),
                batchControlled: (i.productType || '').toUpperCase() !== 'SERVICE'
                    && Boolean(i.batchControlled),
                fefoEnabled: i.fefoEnabled != null ? Boolean(i.fefoEnabled) : true,
                minExpiryDaysForSale: Number(i.minExpiryDaysForSale) || 0
            }))
        };
    };

    useEffect(() => {
        if (!editingId) return;

        const fetchStock = async () => {
            try {
                const data = await checkQuotationStock(editingId);
                setStockCheckResult(data);
            } catch (e) {
                console.error("Stock check failed", e);
                setStockCheckResult([]);
            }
        };

        fetchStock();
    }, [editingId, items]);

    // ✅ HANDLE INCOMING INQUIRY FOR CONVERSION
    const location = useLocation();

    useEffect(() => {
        if (location.state?.inquiry) {
            const inquiry = location.state.inquiry;
            // Enriched items (with prices, codes, units) pre-built by ConvertToQuotationModal
            const enrichedItems = location.state.items;
            const incomingDiscount = location.state.discount ?? 0;
            const incomingTax = location.state.tax ?? 5;
            const incomingPaymentTerm = normalizeIncomingPaymentTerm(location.state.paymentTerms);
            const inquiryCustomerName = location.state.customerName || inquiry.customer || '';
            const inquiryAddress = location.state.customerAddress || inquiry.address || '';
            const inquiryCustomer = createInquiryCustomerSnapshot(inquiry, location.state);

            // Switch to Create Tab
            setActiveTab('create');
            setEditingId(null);
            setStatus('Draft');
            setSourceInquiry({
                id: inquiry.id || null,
                inquiryNumber: inquiry.inquiryNumber || ''
            });
            setPaymentTerm(incomingPaymentTerm);
            setShippingAddress(inquiryAddress);

            // Resolve by explicit identity or name only. Phone-only matching can
            // attach a prospect inquiry to the wrong customer master record.
            if (inquiryCustomerName) {
                const matched = resolveCustomer({
                    customerId: location.state.customerId || inquiry.customerId,
                    customerCode: location.state.customerCode || inquiry.customerCode,
                    customerName: inquiryCustomerName
                }, customersList);
                if (matched) {
                    setCustomer(`${matched.name} - ${matched.code}`);
                    setInquiryCustomerSnapshot(null);
                } else {
                    setCustomer(inquiryCustomerName);
                    setInquiryCustomerSnapshot(inquiryCustomer);
                }
            }

            // Prefer enriched items passed from ConvertToQuotationModal (have prices, codes,
            // units already resolved). Fall back to raw inquiry items if not available.
            if (enrichedItems && enrichedItems.length > 0) {
                const mappedItems = enrichedItems.map((item, idx) => ({
                    id: item.id ?? Date.now() + idx,
                    code: item.itemCode || item.productCode || item.code || '',
                    name: item.itemName || item.name || item.productName || '',
                    barcode: item.barcode || item.itemBarcode || '',
                    image: item.primaryImage || item.image || item.imageUrl || '',
                    desc: item.description || '',
                    unit: item.unit || 'PCS',
                    qty: Number(item.quantity) || 1,
                    price: Number(item.price) || 0,
                    foc: 0,
                    focUnit: item.unit || 'PCS',
                    availableUnits: [item.unit || 'PCS'],
                    disc: Number(item.discount) ?? incomingDiscount,
                    tax: Number(item.taxRate) ?? incomingTax,
                    taxAmt: Number(item.taxAmount) || 0,
                    total: Number(item.lineTotal) || 0,
                    remarks: '',
                    isProductSelected: !!(item.itemId || item.itemCode || item.productCode || item.code)
                }));
                setItems(mappedItems);
            } else if (inquiry.items && inquiry.items.length > 0) {
                const mappedItems = inquiry.items.map((item, idx) => ({
                    id: Date.now() + idx,
                    code: item.itemCode || item.productCode || item.code || '',
                    name: item.itemName || item.name || item.productName || '',
                    barcode: item.barcode || item.itemBarcode || '',
                    image: item.primaryImage || item.image || item.imageUrl || '',
                    desc: item.productName || item.description || '',
                    unit: item.unit || 'PCS',
                    qty: Number(item.quantity) || 1,
                    price: Number(item.standardPrice ?? item.price) || 0,
                    foc: 0,
                    focUnit: item.unit || 'PCS',
                    availableUnits: [item.unit || 'PCS'],
                    disc: incomingDiscount,
                    tax: incomingTax,
                    taxAmt: 0,
                    total: 0,
                    remarks: '',
                    isProductSelected: !!(item.itemCode || item.productCode || item.code || item.productId)
                }));
                setItems(mappedItems);
            }

            // Clear state so it doesn't re-trigger on internal nav
            window.history.replaceState({}, document.title);
        }
    }, [location.state, customersList]);


    // ✅ FETCH REAL DATA ON MOUNT
    useEffect(() => {
        refreshData();
    }, []);

    // Open a specific quotation by ID (from dashboard search navigation)
    useEffect(() => {
        const quotationId = location.state?.quotationId;
        if (!quotationId) return;
        window.history.replaceState({}, document.title);
        getQuotationById(quotationId)
            .then(qtn => { if (qtn) handleEditQuotation(qtn, 'view'); })
            .catch(err => console.error('Failed to open quotation', err));
    }, []);

    useEffect(() => {
        if (!activeActionMenu) return;

        const closeActionMenu = () => {
            setActiveActionMenu(null);
            setActionMenuPosition(null);
        };

        window.addEventListener('resize', closeActionMenu);
        window.addEventListener('scroll', closeActionMenu, true);

        return () => {
            window.removeEventListener('resize', closeActionMenu);
            window.removeEventListener('scroll', closeActionMenu, true);
        };
    }, [activeActionMenu]);

    // Set Walk-In Customer as default on initial load (page starts in create mode)
    useEffect(() => {
        if (customersList.length === 0 || customer) return;
        if (activeTab !== 'create') return;
        const walkin = customersList.find(c =>
            c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walkin')
        );
        if (walkin) setCustomer(`${walkin.name} - ${walkin.code}`);
    }, [customersList]);

    const refreshData = async () => {
        try {
            const custData = await getAllCustomers();
            let validCustomers = Array.isArray(custData) ? custData : [];

            // Ensure a default Walk-in Customer exists in the list for quick selection
            const hasWalkin = validCustomers.some(c => c.name.toLowerCase().includes('walkin') || c.name.toLowerCase().includes('walk-in'));
            if (!hasWalkin) {
                validCustomers = [{
                    id: 'WALKIN-ID',
                    code: 'WALKIN',
                    name: 'Walk-in Customer',
                    mobile: '',
                    phone: '',
                    creditStatus: 'Good',
                    groupType: 'Walk-In',
                    address: '',
                    trn: ''
                }, ...validCustomers];
            }

            setCustomersList(validCustomers);

            // List uses paginated endpoint; see fetchQuotationsList + effect below.
            await fetchQuotationsList();
            fetchQtnStats();

            const nextNo = await getNextQuotationNo();
            setNextQtnNo(nextNo);

            try {
                const settings = await getSalesSettings();
                setSalesSettings(settings);
                if (!isAutoNumberingEnabled(settings, 'QUOTATION')) {
                    setNextQtnNo('');
                }
            } catch {
                // settings are optional
            }

        } catch (error) {
            console.error("Error loading data:", error);
        }
    };

    // Server-driven paginated fetch for the Quotation list tab. Filters
    // (search + status) and the current page are pushed to the backend; the
    // response hydrates both the visible list and the footer meta.
    const fetchQuotationsList = async () => {
        setIsListLoading(true);
        try {
            const data = await getQuotationsPage({
                page: listPage,
                size: 30,
                search: searchTerm || '',
                status: filterStatus && filterStatus !== 'All' ? filterStatus : '',
                fromDate: dateRange?.fromDate,
                toDate: dateRange?.toDate,
            });
            const rows = Array.isArray(data?.content) ? data.content : [];
            setQuotationsList(rows.map(mapBackendToFrontend));
            setListPageMeta({
                page: data?.page ?? listPage,
                size: data?.size ?? 30,
                totalElements: data?.totalElements ?? 0,
                totalPages: data?.totalPages ?? 0,
            });
        } catch (err) {
            console.error('Error fetching quotations page:', err);
        } finally {
            setIsListLoading(false);
        }
    };

    const fetchQtnStats = async () => {
        setIsStatsLoading(true);
        try {
            const data = await getQuotationStats();
            setQtnStats(data);
        } catch (err) {
            console.error('Failed to load quotation stats', err);
        } finally {
            setIsStatsLoading(false);
        }
    };

    // Reset to first page whenever filter inputs change.
    useEffect(() => { setListPage(0); }, [searchTerm, filterStatus, dateRange?.fromDate, dateRange?.toDate]);

    const isInitialMount = useRef(true);

    // Refetch whenever the user opens the list tab, changes filters, or pages.
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (activeTab !== 'list') return;
        fetchQuotationsList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, listPage, searchTerm, filterStatus, dateRange?.fromDate, dateRange?.toDate]);

    // Refetch when the global Branch Selector changes the active branch.
    useEffect(() => {
        const handler = () => {
            if (activeTab === 'list') fetchQuotationsList();
        };
        window.addEventListener('billbull:branch-changed', handler);
        return () => window.removeEventListener('billbull:branch-changed', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const selectedCustomerData = useMemo(() => {
        return customersList.find(c => `${c.name} - ${c.code}` === customer);
    }, [customer, customersList]);

    const activeCustomerData = useMemo(() => {
        if (selectedCustomerData) return selectedCustomerData;
        if (inquiryCustomerSnapshot && customer === inquiryCustomerSnapshot.name) {
            return inquiryCustomerSnapshot;
        }
        return null;
    }, [customer, inquiryCustomerSnapshot, selectedCustomerData]);

    // ✅ CALCULATE ROW TOTALS - ERP STANDARD FORMULAS
    const calculateRow = (item) => {
        const qty = parseFloat(item.qty) || 0;
        const price = parseFloat(item.price) || 0;
        const discPercent = parseFloat(item.disc) || 0;
        const taxPercent = parseFloat(item.tax) || 0;
        const focQty = parseFloat(item.foc) || 0;

        // 1. Gross Amount = Price × Qty
        const grossAmount = price * qty;

        // ✅ Calculate FOC deduction
        let focDeduction = 0;
        if (focQty > 0 && item.focUnit && item.unitConversions) {
            const sellingUnit = item.unit;
            const focUnit = item.focUnit;

            if (sellingUnit === focUnit) {
                // Same unit: direct calculation
                focDeduction = price * focQty;
            } else {
                // Different units: convert FOC to selling unit
                const focConversion = item.unitConversions[focUnit] || 1;
                const sellingConversion = item.unitConversions[sellingUnit] || 1;

                // Convert FOC qty to base unit, then to selling unit
                const focInBaseUnit = focQty * focConversion;
                const focInSellingUnit = focInBaseUnit / sellingConversion;

                focDeduction = price * focInSellingUnit;
            }
        }

        // 2. Pre-Discount Amount = Gross - FOC Deduction
        const preDiscountAmount = Math.max(0, grossAmount - focDeduction);

        // 3. Discount Amount
        const discountAmount = preDiscountAmount * (discPercent / 100);

        // 4. Net after discount — interpretation depends on VAT mode.
        const netAfterDiscount = preDiscountAmount - discountAmount;

        // 5/6. Taxable, Tax, Line Total — driven by the document VAT mode.
        // When INCLUSIVE, the entered price already contains tax so tax is
        // extracted out of the line. When EXCLUSIVE, tax is added on top.
        const { taxableAmount, taxAmount, total } = computeLineTaxTotals({
            netAfterDiscount,
            taxPercent,
            vatMode,
        });

        return {
            ...item,
            grossAmount: grossAmount,
            discountAmount: discountAmount,
            taxableAmount: taxableAmount,
            taxAmt: taxAmount,
            total: total,
            focValue: focDeduction
        };
    };

    // When the document VAT mode flips, every existing line needs its
    // taxableAmount/taxAmt/total recomputed against the new interpretation.
    useEffect(() => {
        setItems(prev => prev.map(item => calculateRow(item)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vatMode]);

    const handleItemChange = (id, field, value) => {
        if (isViewMode) return;
        setItems(items.map(item => {
            if (item.id === id) {
                const val = (field === 'desc' || field === 'remarks' || field === 'unit' || field === 'code' || field === 'image' || field === 'focUnit')
                    ? value
                    : Number(value);

                let updatedItem = { ...item, [field]: val };

                // ✅ If unit is being changed, recalculate price based on conversion
                if (field === 'unit' && item.unitConversions) {
                    const newUnit = value;

                    updatedItem.price = resolveUnitAmount({
                        targetUnit: newUnit,
                        amountMap: item.unitPrices,
                        unitConversions: item.unitConversions,
                        currentUnit: item.unit,
                        currentAmount: item.price,
                        fallbackAmount: item.price
                    });
                }

                return calculateRow(updatedItem);
            }
            return item;
        }));
    };

    const handleModalItemChange = (field, value) => {
        if (isViewMode) return;
        if (!selectedAddonItem) return;
        const val = (field === 'focUnit') ? value : Number(value);
        let updatedItem = { ...selectedAddonItem, [field]: val };
        updatedItem = calculateRow(updatedItem);
        setSelectedAddonItem(updatedItem);
    };

    const saveModalItem = () => {
        if (isViewMode) return;
        if (!selectedAddonItem) return;
        setItems(items.map(item => item.id === selectedAddonItem.id ? selectedAddonItem : item));
        setSelectedAddonItem(null);
    };

    // handleProductSelect is kept for keyboard-Enter in the inline code field (no-op now since dropdown removed)
    const handleProductSelect = (id, productCode) => {
        // No-op: product selection is done via the ProductSelector modal
        setIsProductSelectionOpen(false);
        setFocusedRowId(null);
        setHighlightedIndex(0);
    };

    const handleAddSingleProduct = (product) => {
        if (isViewMode) return;
        const defaultUnit = getDefaultProductUnit(product);
        const policy = salesSettings?.salesItemPricePolicy;
        const policyPrice = pickSalesItemPrice(product, policy);
        // When the user explicitly opts into Max/Min as the default, that
        // configured master price should win over any per-packing unitPrice.
        // For the legacy RETAIL policy we keep the unit-aware behaviour so
        // packing-level prices continue to apply.
        const price = isPolicyOverridingPackings(policy)
            ? policyPrice
            : resolveUnitAmount({
                targetUnit: defaultUnit,
                amountMap: product.unitPrices,
                unitConversions: product.unitConversions,
                fallbackAmount: policyPrice
            });
        const cost = parseFloat(product.cost) || 0;
        const disc = parseFloat(product.maxDiscount) || 0;
        const tax = resolveLineTaxRate(product, activeVatRate);
        const rawItem = {
            id: Date.now() + Math.random(),
            code: product.code,
            name: product.name || '',
            sku: product.sku || product.skuCode || product.productSku || '',
            brand: product.brandName || product.brand || '',
            shortDesc: product.shortDesc || '',
            detailedDesc: product.detailedDesc || '',
            barcode: product.barcode || '',
            image: product.primaryImage || product.image || '', // ✅ Set Image URL
            desc: product.name || product.description || '',
            unit: defaultUnit,
            qty: 1,
            price: price,
            cost: cost, // ✅ Capture Cost
            foc: 0,
            focUnit: defaultUnit,
            availableUnits: product.availableUnits || ['PCS'],
            unitConversions: product.unitConversions || {},
            unitPrices: product.unitPrices || {},
            disc: disc,
            netPrice: price * (1 - (disc / 100)), // Net Price
            tax: tax,
            taxAmt: 0,
            total: 0,
            remarks: product.detailedDesc || product.description || '',
            // QA-001: carry product type onto the row so stock checks / availability
            // panel can short-circuit for SERVICE items.
            productType: (product.productType || 'STOCK').toUpperCase(),
            // Quotations don't reserve stock themselves, but these hints travel
            // with the row so that "Convert to Sales Order" / "Proceed to Invoice"
            // get correct batch-selection state even before the quotation is saved.
            batchControlled: (product.productType || '').toUpperCase() !== 'SERVICE'
                && Boolean(product.batchControlled ?? product.isBatch ?? product.batch),
            fefoEnabled: product.fefoEnabled != null ? Boolean(product.fefoEnabled) : true,
            minExpiryDaysForSale: Number(product.minExpiryDaysForSale) || 0,
            isProductSelected: true
        };

        const newItem = calculateRow(rawItem);

        // QA-FAST-ENTRY: replace-in-place when triggered by inline row search.
        const targetRowId = pendingFastEntryRowId;
        setItems(prev => {
            if (targetRowId != null) {
                return prev.map(it => it.id === targetRowId ? { ...newItem, id: targetRowId } : it);
            }
            // If the first row is empty, replace it
            const isFirstItemEmpty = prev.length === 1 && !prev[0].code && !prev[0].desc;
            return isFirstItemEmpty ? [newItem] : [...prev, newItem];
        });
        const filledItemId = targetRowId != null ? targetRowId : newItem.id;
        setPendingFastEntrySearch('');
        setPendingFastEntryRowId(null);

        setToastMessage(`${product.name} added to quotation`);
        setToastType('success');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);

        // ✅ Close modal and focus Qty
        setIsProductSelectionOpen(false);
        setFocusedRowId(filledItemId);
        setHighlightedIndex(0);
        setTimeout(() => {
            const qtyEl = document.getElementById(`qty-${filledItemId}`);
            if (qtyEl) { qtyEl.focus(); qtyEl.select?.(); }
        }, 100);

        // Fetch price history + stock immediately on product add (don't wait for row click)
        if (newItem.code) {
            fetchPriceHistoryForFocusedItem(newItem.code);
            const isService = (newItem.productType || '').toUpperCase() === 'SERVICE';
            if (!isService) {
                getStockAvailability(newItem.code)
                    .then(res => {
                        const locs = res.locations || [];
                        const available = locs.reduce((sum, l) => sum + (l.available || 0), 0);
                        const reserved = locs.reduce((sum, l) => sum + (l.reserved || 0), 0);
                        setLiveStockMap(prev => ({ ...prev, [newItem.code]: { available, reserved, data: res } }));
                    }).catch(console.error);
            }
        }

        // Focus Qty input after small delay
        setTimeout(() => {
            const qtyInput = document.getElementById(`qty-${newItem.id}`);
            if (qtyInput) qtyInput.focus();
        }, 100);
    };

    const handleFastEntryAdd = (product, qty, price, disc) => {
        const defaultUnit = getDefaultProductUnit(product);
        const cost = parseFloat(product.cost) || 0;
        const tax = resolveLineTaxRate(product, activeVatRate);
        const rawItem = {
            id: Date.now() + Math.random(),
            code: product.code,
            name: product.name || '',
            sku: product.sku || product.skuCode || product.productSku || '',
            brand: product.brandName || product.brand || '',
            shortDesc: product.shortDesc || '',
            detailedDesc: product.detailedDesc || '',
            barcode: product.barcode || '',
            image: product.primaryImage || product.image || '',
            desc: product.name || product.description || '',
            unit: defaultUnit,
            qty,
            price,
            cost,
            foc: 0,
            focUnit: defaultUnit,
            availableUnits: product.availableUnits || ['PCS'],
            unitConversions: product.unitConversions || {},
            unitPrices: product.unitPrices || {},
            disc,
            netPrice: price * (1 - disc / 100),
            tax,
            taxAmt: 0,
            total: 0,
            remarks: product.detailedDesc || product.description || '',
            productType: (product.productType || 'STOCK').toUpperCase(),
            isProductSelected: true,
        };
        const newItem = calculateRow(rawItem);
        setItems(prev => {
            const isFirstItemEmpty = prev.length === 1 && !prev[0].code && !prev[0].desc;
            return isFirstItemEmpty ? [newItem] : [...prev, newItem];
        });
        setFocusedRowId(newItem.id);
        if (newItem.code) {
            fetchPriceHistoryForFocusedItem(newItem.code);
            const isService = (newItem.productType || '').toUpperCase() === 'SERVICE';
            if (!isService) {
                getStockAvailability(newItem.code)
                    .then(res => {
                        const locs = res.locations || [];
                        const available = locs.reduce((sum, l) => sum + (l.available || 0), 0);
                        const reserved = locs.reduce((sum, l) => sum + (l.reserved || 0), 0);
                        setLiveStockMap(prev => ({ ...prev, [newItem.code]: { available, reserved, data: res } }));
                    }).catch(console.error);
            }
        }
    };

    // --- STOCK CHECK MODAL LOGIC ---
    const handleCheckItemStock = (item) => {
        setSelectedStockItem({
            code: item.code,
            name: item.desc,
            image: item.image,
            totalStock: 0,
            locations: [
                { name: 'Main Warehouse', type: 'Warehouse', onHand: 0, reserved: 0, available: 0 }
            ],
            incoming: []
        });
        setIsItemStockModalOpen(true);
    };

    const handleFileUpload = async (e) => {
        if (isViewMode) return;
        if (!editingId) {
            setToastMessage('Please save the quotation first before adding attachments.');
            setToastType('info');
            setShowToast(true);
            return;
        }

        const files = Array.from(e.target.files);

        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                setToastMessage(`File ${file.name} is too large (>5MB).`);
                setToastType('info');
                setShowToast(true);
                continue;
            }

            try {
                const updatedQtn = await uploadAttachment(editingId, file);

                const mappedQtn = mapBackendToFrontend(updatedQtn);
                setAttachments(mappedQtn.attachments);

                setToastMessage(`${file.name} uploaded successfully.`);
                setToastType('success');
                setShowToast(true);

            } catch (error) {
                console.error("Upload failed", error);
                setToastMessage(`Failed to upload ${file.name}`);
                setToastType('info');
                setShowToast(true);
            }
        }

        refreshData();
        e.target.value = '';
    };

    const handleRemoveAttachment = (index) => {
        if (isViewMode) return;
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddItem = () => {
        if (isViewMode) return;
        setItems([...items, { id: Date.now(), code: '', image: '', desc: '', unit: 'PCS', qty: 0, price: 0, foc: 0, focUnit: 'PCS', availableUnits: ['PCS'], disc: 0, tax: 5, taxAmt: 0, total: 0, remarks: '', isProductSelected: false }]);
    };

    const handleDeleteItem = (id) => {
        if (isViewMode) return;
        const nextItems = items.filter(item => item.id !== id);
        setItems(nextItems.length > 0 ? nextItems : [createBlankQuotationItem()]);
        if (focusedRowId === id) setFocusedRowId(null);
    };

    // ✅ UPDATED CALCULATIONS
    const quotationSummary = useMemo(
        () => summarizeSalesItems(items, billDiscount),
        [items, billDiscount]
    );
    const grossTotal = quotationSummary.grossTotal;
    const totalItemDiscount = quotationSummary.itemDiscountTotal;
    const subTotal = quotationSummary.subTotal;
    const totalTax = quotationSummary.tax;
    const billDiscountAmount = quotationSummary.billDiscountAmount;
    const grandTotal = quotationSummary.grandTotal;

    // ------------------------------------------------------------------
    // ✅ LOGIC FOR WORKFLOW & REVISIONS
    // ------------------------------------------------------------------

    const constructPayload = (targetStatus) => {
        const activeItems = getSubmittableQuotationItems(items).map(calculateRow);
        return {
            id: editingId,
            qtnNo: editingId || !quotationAutoNumbering ? getQuotationNo() : null,
            customer: customer,
            customerCode: selectedCustomerData?.code || inquiryCustomerSnapshot?.code || '',
            customerMobile: selectedCustomerData?.mobile || selectedCustomerData?.phone || inquiryCustomerSnapshot?.mobile || '',
            customerEmail: selectedCustomerData?.email || inquiryCustomerSnapshot?.email || '',
            date: qtnDate,
            validTill: validTill,
            currency: currency,
            branchId: quotationBranch.id,
            branchName: quotationBranch.name || defaultBranch?.name || '',
            branchCode: quotationBranch.code || defaultBranch?.code || '',
            branchLocation: quotationBranch.location || defaultBranch?.defaultWarehouseName || defaultBranch?.address || '',
            sourceInquiryId: sourceInquiry?.id || null,
            sourceInquiryNumber: sourceInquiry?.inquiryNumber || '',
            paymentTerms: paymentTerm,
            deliveryType: deliveryType,
            expectedDispatch: expectedDispatch,
            shippingAddress: shippingAddress,
            notesToCustomer: notesToCustomer,
            internalNotes: internalNotes,
            totalAmount: grandTotal,
            taxAmount: totalTax,
            subTotal: subTotal,
            billDiscount: billDiscount,
            vatMode: vatMode,
            status: targetStatus === 'Pending Approval' ? 'PENDING_APPROVAL' :
                targetStatus === 'Approved' ? 'APPROVED' :
                    targetStatus === 'Rejected' ? 'REJECTED' : 'DRAFT',
            items: activeItems.map(i => ({
                // Only forward persisted DB ids. New rows get client-side keys
                // like Date.now() / Date.now()+Math.random(), which are >= 1e12 or
                // non-integer — those must go to the backend as null so Hibernate
                // inserts them instead of trying to merge a phantom row.
                id: (typeof i.id === 'number' && Number.isInteger(i.id) && i.id < 1e12) ? i.id : null,
                itemCode: i.code,
                barcode: i.barcode, // Pass barcode to backend
                image: i.image, // Pass image to backend if schema supports it
                description: i.desc,
                unit: i.unit,
                quantity: i.qty,
                price: i.price,
                discount: i.disc,
                taxRate: i.tax,
                foc: i.foc,
                focUnit: i.focUnit || 'PCS',
                taxAmount: i.taxAmt,
                lineTotal: i.total,
                remarks: i.remarks
            }))
        };
    };

    const handleSaveDraft = async () => {
        if (isViewMode) return;
        if (!quotationAutoNumbering && !getQuotationNo().trim()) {
            setToastMessage('Please enter a quotation number.');
            setToastType('info');
            setShowToast(true);
            return;
        }
        const validationMessage = getQuotationValidationMessage(items);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType('info');
            setShowToast(true);
            return;
        }

        try {
            const payload = constructPayload('Draft');
            const savedQtn = await saveQuotation(payload);

            setEditingId(savedQtn.id);
            setNextQtnNo(savedQtn.qtnNo || getQuotationNo());
            setStatus('Draft');

            await refreshData();

            setToastMessage('Draft saved successfully!');
            setToastType('success');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);

        } catch (error) {
            console.error("Save failed", error);
            setToastMessage(resolveApiErrorMessage(error, 'Failed to save draft.'));
            setToastType('info');
            setShowToast(true);
        }
    };

    const handleConfirm = async () => {
        if (isViewMode) return;
        if (!quotationAutoNumbering && !getQuotationNo().trim()) {
            setToastMessage('Please enter a quotation number.');
            setToastType('info');
            setShowToast(true);
            return;
        }
        const validationMessage = getQuotationValidationMessage(items);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType('info');
            setShowToast(true);
            return;
        }

        // Stock check enforcement
        if (salesSettings?.stockCheckRequired) {
            const stockIssues = [];
            for (const item of items) {
                if (!item.code) continue;
                // QA-001: service items hold no inventory — skip stock validation.
                if ((item.productType || '').toUpperCase() === 'SERVICE') continue;
                try {
                    const stockData = await getStockAvailability(item.code);
                    const locs = stockData?.locations || [];
                    const available = locs.reduce((sum, l) => sum + (Number(l.available) || 0), 0);

                    if (Number(item.qty) > available) {
                        stockIssues.push(`${item.name || item.code}: requested ${item.qty}, available ${available}`);
                    }
                } catch {
                    // skip items where stock check fails
                }
            }
            if (stockIssues.length > 0) {
                setToastMessage(`Insufficient stock:\n${stockIssues.join(', ')}`);
                setToastType('info');
                setShowToast(true);
                return;
            }
        }

        // Credit limit BLOCK enforcement
        if (salesSettings?.creditLimitPolicy === 'BLOCK' &&
            selectedCustomerData?.creditLimitAmount > 0 &&
            (Number(selectedCustomerData.balance || 0) + grandTotal) > selectedCustomerData.creditLimitAmount) {
            const projectedOutstanding = Number(selectedCustomerData.balance || 0) + grandTotal;
            setToastMessage(
                <>
                    Credit Limit Exceeded: The projected outstanding balance (
                    <CurrencyAmount value={projectedOutstanding} {...displayCurrencyProps} />
                    ) exceeds this customer's credit limit of{' '}
                    <CurrencyAmount value={selectedCustomerData.creditLimitAmount} {...displayCurrencyProps} />.
                </>
            );
            setToastType('info');
            setShowToast(true);
            return;
        }

        try {
            const payload = constructPayload('Pending Approval');

            const savedQtn = await saveQuotation(payload);

            // List will refresh via fetchQuotationsList when activeTab switches to 'list'.
            setEditingId(savedQtn.id);
            setNextQtnNo(savedQtn.qtnNo || getQuotationNo());
            setStatus('Pending Approval');
            setEditorMode('edit');

            setActiveTab('list');

            setToastMessage('Quotation confirmed and pending approval!');
            setToastType('success');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);

        } catch (error) {
            console.error("Confirm failed", error);
            setToastMessage(resolveApiErrorMessage(error, 'Failed to confirm quotation.'));
            setToastType('info');
            setShowToast(true);
        }
    };


    const handleApprove = async () => {
        if (!editingId) return;
        const validationMessage = getQuotationValidationMessage(items);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType("info");
            setShowToast(true);
            return;
        }

        try {
            const stock = await checkQuotationStock(editingId);
            const insufficient = stock.filter(i => !i.sufficient);

            if (insufficient.length > 0) {
                setStockCheckResult(insufficient);
                setShowStockModal(true);
                return;
            }

            await updateQuotationStatus(editingId, "APPROVED");

            await refreshData();
            setStatus("Approved");
            setEditorMode('view');

            setToastMessage("Quotation Approved!");
            setToastType("success");
            setShowToast(true);

        } catch (e) {
            setToastMessage(e.message);
            setToastType("info");
            setShowToast(true);
        }
    };


    const handleReject = async () => {
        if (!editingId) return;

        try {
            await updateQuotationStatus(editingId, "REJECTED");

            setStatus("Rejected");
            await refreshData();
            setToastMessage("Quotation Rejected.");
            setToastType("info");
            setShowToast(true);
        } catch (e) {
            console.error("Rejection Error Details:", e.response ? e.response.data : e);

            setToastMessage("Rejection failed.");
            setToastType("info");
            setShowToast(true);
        }
    };


    const handleSaveRevision = async () => {
        if (!editingId) {
            setToastMessage('Save the quotation first before revising.');
            setToastType('info');
            setShowToast(true);
            return;
        }

        try {
            await createRevision(editingId, revisionNote || 'No follow-up note.');
            await refreshData();

            const updatedList = await getAllQuotations();
            const currentQtn = updatedList.find(q => q.id === editingId);
            if (currentQtn) {
                const mapped = mapBackendToFrontend(currentQtn);
                setStatus(mapped.status);
                setEditorMode(canEditQuotation(mapped.status) ? 'edit' : 'view');
            }

            setRevisionNote('');
            setIsReviseModalOpen(false);
            setToastMessage(`Revision created! You can now edit.`);
            setToastType('success');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);

        } catch (error) {
            console.error("Revision failed", error);
            setToastMessage('Failed to create revision.');
            setToastType('info');
            setShowToast(true);
        }
    };

    const handleOpenEmailModal = async () => {
        const customerEmail = selectedCustomerData?.email || inquiryCustomerSnapshot?.email || '';
        setEmailTo(customerEmail);
        setEmailSubject(`Quotation ${getQuotationNo()} from BillBull ERP`);
        // QA-040: render the preview using the same template + payload that
        // Send Email will use. Iframe runs in the same origin so the live
        // image URLs work here; the version we POST to the backend gets the
        // images inlined as data URIs (see handleSendEmail).
        setEmailPreviewHtml('');
        setIsEmailModalOpen(true);
        try {
            const templates = await getTemplatesByCategory('Quotation');
            const defaultTemplate = templates.find(t => t.isDefault) || templates[0];
            if (defaultTemplate) {
                const html = generateEmailHtml(
                    defaultTemplate,
                    buildQuotationDocPayload(),
                    { companyProfile: buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: quotationBranch?.id ?? activeBranch?.id }), billBullLogo }
                );
                setEmailPreviewHtml(html);
            }
        } catch (err) {
            console.warn('Email preview render failed:', err);
        }
    };

    const handleSendEmail = async () => {
        if (!editingId) {
            setToastMessage('Please save the quotation before sending.');
            setToastType('info');
            setShowToast(true);
            return;
        }
        setEmailSending(true);
        try {
            // QA-040: render the email body using the same designed template
            // as Print, then inline every <img> as a data: URI so the
            // recipient's mail client doesn't try to fetch /uploads/ or
            // /assets/ paths it can't reach. If anything in the pipeline
            // fails, we POST an empty htmlBody and the backend falls back
            // to its legacy hand-built HTML.
            let htmlBody = '';
            let inlineAttachments = [];
            try {
                let html = emailPreviewHtml;
                if (!html) {
                    const templates = await getTemplatesByCategory('Quotation');
                    const defaultTemplate = templates.find(t => t.isDefault) || templates[0];
                    if (defaultTemplate) {
                        html = generateEmailHtml(
                            defaultTemplate,
                            buildQuotationDocPayload(),
                            { companyProfile: buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: quotationBranch?.id ?? activeBranch?.id }), billBullLogo }
                        );
                    }
                }
                if (html) {
                    const built = await buildEmailBody(html);
                    htmlBody = built.html;
                    inlineAttachments = built.inlineAttachments;
                }
            } catch (renderErr) {
                console.warn('Email body render/inline failed; backend will use legacy template.', renderErr);
            }

            await sendQuotationEmail(editingId, { toEmail: emailTo, subject: emailSubject, htmlBody, inlineAttachments });
            setIsEmailModalOpen(false);
            setToastMessage(`Email sent successfully to ${emailTo}`);
            setToastType('success');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 4000);
        } catch (err) {
            setToastMessage(err.message || 'Failed to send email.');
            setToastType('error');
            setShowToast(true);
        } finally {
            setEmailSending(false);
        }
    };

    const buildEmailPreviewHtml = () => {
        const qtnNo = getQuotationNo();
        const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
        const fmtAmt = (v) => `${currency || ''} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const rows = items.map((item, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
                <td style="padding:8px 12px;border-bottom:1px solid #eee">${i + 1}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.description || item.itemCode || ''}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.unit || ''}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity || 0}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtAmt(item.price)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtAmt(item.lineTotal || (item.quantity * item.price))}</td>
            </tr>`).join('');

        const notesSection = notesToCustomer ? `
            <div style="margin:24px 32px 0;padding:16px;background:#fffbeb;border-left:4px solid #F5C742;border-radius:4px;">
                <p style="margin:0 0 6px;font-weight:600;color:#555">Notes</p>
                <p style="margin:0;color:#333;font-size:14px">${notesToCustomer}</p>
            </div>` : '';

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:16px;background:#f4f4f4;font-family:Arial,sans-serif">
        <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
            <div style="background:#F5C742;padding:24px 32px">
                <h1 style="margin:0;font-size:22px;color:#333">Quotation</h1>
                <p style="margin:6px 0 0;font-size:15px;color:#555;font-weight:600">${qtnNo}</p>
            </div>
            <div style="padding:20px 32px;background:#fafafa;border-bottom:1px solid #eee">
                <table style="width:100%"><tr>
                    <td style="vertical-align:top">
                        <p style="margin:0 0 4px;font-size:11px;color:#888">CUSTOMER</p>
                        <p style="margin:0;font-weight:600;color:#333;font-size:15px">${customer || ''}</p>
                    </td>
                    <td style="vertical-align:top;text-align:right">
                        <p style="margin:0 0 4px;font-size:11px;color:#888">DATE</p>
                        <p style="margin:0;color:#333;font-size:13px">${fmt(new Date().toISOString())}</p>
                        <p style="margin:8px 0 4px;font-size:11px;color:#888">VALID TILL</p>
                        <p style="margin:0;color:#e05252;font-size:13px;font-weight:600">${fmt(validTill)}</p>
                    </td>
                </tr></table>
            </div>
            <div style="padding:24px 32px">
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="background:#F5C742">
                        <th style="padding:9px 12px;text-align:left;font-size:12px">#</th>
                        <th style="padding:9px 12px;text-align:left;font-size:12px">Item</th>
                        <th style="padding:9px 12px;text-align:center;font-size:12px">Unit</th>
                        <th style="padding:9px 12px;text-align:center;font-size:12px">Qty</th>
                        <th style="padding:9px 12px;text-align:right;font-size:12px">Unit Price</th>
                        <th style="padding:9px 12px;text-align:right;font-size:12px">Total</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <table style="width:100%;margin-top:16px"><tr>
                    <td style="width:55%"></td>
                    <td><table style="width:100%">
                        <tr><td style="padding:4px 12px;font-size:13px;color:#555">Subtotal</td><td style="padding:4px 12px;text-align:right;font-size:13px;color:#555">${fmtAmt(subTotal)}</td></tr>
                        <tr><td style="padding:4px 12px;font-size:13px;color:#555">Tax</td><td style="padding:4px 12px;text-align:right;font-size:13px;color:#555">${fmtAmt(totalTax)}</td></tr>
                        <tr><td style="padding:6px 12px;font-weight:700;font-size:15px;border-top:2px solid #F5C742">Total</td><td style="padding:6px 12px;text-align:right;font-weight:700;font-size:15px;border-top:2px solid #F5C742">${fmtAmt(grandTotal)}</td></tr>
                    </table></td>
                </tr></table>
            </div>
            ${notesSection}
            <div style="padding:16px 32px;background:#f4f4f4;border-top:1px solid #eee;text-align:center;margin-top:24px">
                <p style="margin:0;font-size:11px;color:#999">This quotation was generated by BillBull ERP. Please do not reply to this email.</p>
            </div>
        </div></body></html>`;
    };

    const handleRestoreRevision = (revision) => {
        if (window.confirm(`Restore ${revision.qtnNoDisplay}? Current changes will be lost.`)) {

            const recalculated = revision.items.map((i, idx) => ({
                id: Date.now() + idx,
                code: i.code || i.itemCode || '',
                name: i.name || i.productName || i.itemName || '',
                barcode: i.barcode || '',
                image: i.image || i.primaryImage || '',
                desc: i.desc || i.description || '',
                unit: i.unit || 'PCS',
                qty: Number(i.qty || i.quantity) || 1,
                price: Number(i.price) || 0,
                foc: Number(i.foc) || 0,
                focUnit: i.focUnit || 'PCS',
                availableUnits: i.availableUnits || ['PCS', 'Dozen', 'Box', 'Carton'],
                disc: Number(i.disc || i.discount) || 0,
                tax: Number(i.tax || i.taxRate) || 5,
                taxAmt: Number(i.taxAmt || i.taxAmount) || 0,
                total: Number(i.total || i.lineTotal) || 0,
                remarks: i.remarks || '',
                isProductSelected: i.isProductSelected || !!(i.code || i.itemCode)
            }));

            // Force recalculation to ensure consistency
            const finalItems = recalculated.map(item => calculateRow(item));

            setItems(finalItems);
            setIsRevisionsOpen(false);

            setToastType('success');
            setToastMessage(`Restored items from ${revision.qtnNoDisplay}`);
            setShowToast(true);
        }
    };

    const handleSelectCustomer = (cust) => {
        setCustomer(`${cust.name} - ${cust.code}`);
        setInquiryCustomerSnapshot(null);
        const _defaultAddr = (cust.savedAddresses || []).find(a => a.isDefault);
        const _resolvedAddr = _defaultAddr
            ? [_defaultAddr.address1, _defaultAddr.address2, _defaultAddr.city, _defaultAddr.country].filter(Boolean).join(', ')
            : (cust.defaultShippingAddress || cust.shippingAddress || cust.billingAddress || cust.address || '');
        setShippingAddress(_resolvedAddr);
        setIsCustomerSearchOpen(false);
    };


    const handleEditQuotation = (qtn, mode = 'edit') => {
        const allowEdit = mode === 'edit' && canEditQuotation(qtn.status);
        setEditingId(qtn.id);
        setCustomer(qtn.customer);
        const matchedCustomer = resolveCustomer({
            customerCode: qtn.customerCode,
            customerName: qtn.customer
        }, customersList);
        setInquiryCustomerSnapshot(matchedCustomer ? null : {
            id: qtn.id ? `quotation-${qtn.id}-customer` : 'quotation-customer',
            code: qtn.customerCode || qtn.sourceInquiryNumber || 'Inquiry',
            name: qtn.customer || '',
            mobile: qtn.customerMobile || '',
            phone: qtn.customerMobile || '',
            email: qtn.customerEmail || '',
            address: qtn.shippingAddress || '',
            defaultShippingAddress: qtn.shippingAddress || '',
            shippingAddress: qtn.shippingAddress || '',
            groupType: qtn.sourceInquiryNumber ? 'Inquiry' : 'Prospect',
            creditStatus: 'Good',
            balance: 0,
            payTerms: qtn.paymentTerm || '30 Days',
            trn: '',
            savedAddresses: qtn.shippingAddress ? [{
                name: 'Quotation Address',
                address1: qtn.shippingAddress,
                city: '',
                country: '',
                isDefault: true
            }] : []
        });
        setQtnDate(qtn.date);
        setValidTill(qtn.validTill);
        setQuotationBranch({
            id: qtn.branchId || null,
            name: qtn.branchName || defaultBranch?.name || '',
            code: qtn.branchCode || defaultBranch?.code || '',
            location: qtn.branchLocation || defaultBranch?.defaultWarehouseName || defaultBranch?.address || ''
        });
        setItems(qtn.items.length > 0 ? qtn.items : [{ id: 1, code: '', image: '', desc: '', unit: 'PCS', qty: 0, price: 0, foc: 0, focUnit: 'PCS', availableUnits: ['PCS'], disc: 0, tax: 5, taxAmt: 0.00, total: 0.00, remarks: '', isProductSelected: false }]);
        setCurrency(qtn.currency || 'AED');
        setStatus(qtn.status);
        setPaymentTerm(qtn.paymentTerm || '30 Days');
        setDeliveryType(qtn.deliveryType || 'Delivery');
        setExpectedDispatch(qtn.expectedDispatch || new Date().toISOString().split('T')[0]);
        setNotesToCustomer(qtn.notesToCustomer || '');
        setInternalNotes(qtn.internalNotes || '');
        setShippingAddress(qtn.shippingAddress || '');
        setAttachments(qtn.attachments || []);
        setBillDiscount(qtn.billDiscount || 0);
        setVatMode(qtn.vatMode === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE');
        setSourceInquiry(qtn.sourceInquiryId ? {
            id: qtn.sourceInquiryId,
            inquiryNumber: qtn.sourceInquiryNumber || ''
        } : null);
        setEditorMode(allowEdit ? 'edit' : 'view');
        setCurrencySearch('');
        setIsCustomerSearchOpen(false);
        setIsCurrencyOpen(false);
        setIsPaymentTermOpen(false);
        setIsDeliveryTypeOpen(false);
        setActiveTab('create');

        if (mode === 'edit' && !allowEdit) {
            setToastMessage('Approved quotations are view-only. Use Revise to make changes.');
            setToastType('info');
            setShowToast(true);
        }
    };

    const handleViewQuotation = (qtn) => {
        handleEditQuotation(qtn, 'view');
    };

    const handleSwitchToEditMode = () => {
        if (!canEditCurrentQuotation) {
            setToastMessage('This quotation is view-only after approval. Use Revise to make changes.');
            setToastType('info');
            setShowToast(true);
            return;
        }
        setEditorMode('edit');
    };

    // BB-006/BB-021: Row-level quick actions from the listing table
    const handleListingApprove = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        const validationMessage = getQuotationValidationMessage(qtn.items || []);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType('info');
            setShowToast(true);
            return;
        }

        try {
            await updateQuotationStatus(qtn.id, 'APPROVED');
            setToastMessage('Quotation approved.');
            setToastType('success');
            setShowToast(true);
            await refreshData();
        } catch (error) {
            setToastMessage(resolveApiErrorMessage(error, 'Failed to approve quotation.'));
            setToastType('error');
            setShowToast(true);
        }
    };

    const handleListingReject = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        try {
            await updateQuotationStatus(qtn.id, 'REJECTED');
            setToastMessage('Quotation rejected.');
            setToastType('success');
            await refreshData();
        } catch {
            setToastMessage('Failed to reject quotation.');
            setToastType('error');
        }
    };

    const handleListingConfirm = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        const validationMessage = getQuotationValidationMessage(qtn.items || []);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType('info');
            setShowToast(true);
            return;
        }

        try {
            await updateQuotationStatus(qtn.id, 'PENDING_APPROVAL');
            setToastMessage('Quotation confirmed and sent for approval.');
            setToastType('success');
            setShowToast(true);
            await refreshData();
        } catch (error) {
            setToastMessage(resolveApiErrorMessage(error, 'Failed to confirm quotation.'));
            setToastType('error');
            setShowToast(true);
        }
    };

    const handleListingMarkExpired = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        try {
            await updateQuotationStatus(qtn.id, 'EXPIRED');
            setToastMessage('Quotation marked as expired.');
            setToastType('success');
            await refreshData();
        } catch {
            setToastMessage('Failed to update quotation.');
            setToastType('error');
        }
    };

    const handleListingProceedToInvoice = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        const validationMessage = getQuotationValidationMessage(qtn.items || []);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType('info');
            setShowToast(true);
            return;
        }

        try {
            // Do NOT preemptively mark the quotation as CONVERTED here. The
            // quotation status flips to 'Invoiced' once the invoice is actually
            // saved (the backend stamps INVOICED via linkedQuotation). If the
            // user abandons the invoice form, the quotation should remain in
            // its prior status — not be stranded as Converted.
            const matched = resolveCustomer({ customerName: qtn.customer }, customersList);
            navigate('/sales/invoice', {
                state: {
                    fromQuotation: {
                        id: qtn.id,
                        qtnNo: qtn.qtnNo,
                        customer: qtn.customer,
                        customerId: matched?.id ?? null,
                        customerCode: matched?.code ?? '',
                        customerName: matched?.name ?? qtn.customer,
                        billDiscount: qtn.billDiscount,
                        shippingAddress: qtn.shippingAddress || '',
                        items: qtn.items
                    }
                }
            });
        } catch (error) {
            setToastMessage(resolveApiErrorMessage(error, 'Failed to proceed to invoice.'));
            setToastType('error');
            setShowToast(true);
        }
    };

    const isWalkInCustomer = (customerStr) => {
        const name = (customerStr || '').toLowerCase();
        return name.includes('walk-in') || name.includes('walkin');
    };

    const handleConvertToOrder = () => {
        if (isWalkInCustomer(customer)) {
            setToastMessage('Walk-In Customer cannot be converted to a Sales Order. Please assign a named customer.');
            setToastType('info');
            setShowToast(true);
            return;
        }
        navigate('/sales/order', {
            state: {
                quotation: {
                    id: editingId,
                    qtnNo: getQuotationNo(),
                    customer: customer,
                    billDiscount,
                    items: items
                }
            }
        });
    };

    const handleListingConvertToOrder = (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        const validationMessage = getQuotationValidationMessage(qtn.items || []);
        if (validationMessage) {
            setToastMessage(validationMessage);
            setToastType('info');
            setShowToast(true);
            return;
        }

        if (isWalkInCustomer(qtn.customer)) {
            setToastMessage('Walk-In Customer cannot be converted to a Sales Order. Please assign a named customer.');
            setToastType('info');
            setShowToast(true);
            return;
        }

        const matched = resolveCustomer({ customerName: qtn.customer }, customersList);
        navigate('/sales/order', {
            state: {
                quotation: {
                    id: qtn.id,
                    qtnNo: qtn.qtnNo,
                    customer: qtn.customer,
                    customerId: matched?.id ?? null,
                    customerCode: matched?.code ?? '',
                    customerName: matched?.name ?? qtn.customer,
                    billDiscount: qtn.billDiscount,
                    shippingAddress: qtn.shippingAddress || '',
                    items: qtn.items
                }
            }
        });
    };

    const handleListingRevise = (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        handleEditQuotation(qtn);
        // Slight delay so the create tab opens before the modal
        setTimeout(() => setIsReviseModalOpen(true), 100);
    };

    const handleListingPrint = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        try {
            const templates = await getTemplatesByCategory('Quotation');
            const defaultTemplate = templates.find(t => t.isDefault);
            const resolvedBillDiscount = Number(qtn.billDiscount || 0);
            const resolvedSummary = summarizeSalesItems(qtn.items || [], resolvedBillDiscount);
            const fullCustomer = customersList.find(c => c.code === qtn.customerCode);
            const printData = {
                title: 'QUOTATION',
                docNo: qtn.qtnNo,
                date: qtn.date,
                customer: {
                    name: qtn.customer,
                    address: fullCustomer?.address || fullCustomer?.billingAddress || '',
                    shippingAddress: qtn.shippingAddress || '',
                    phone: qtn.customerMobile || qtn.customerPhone || fullCustomer?.mobile || fullCustomer?.phone || '',
                    email: qtn.customerEmail || fullCustomer?.email || '',
                    trn: fullCustomer?.trn || ''
                },
                items: (qtn.items || []).filter(i => i.code || i.desc).map(i => ({
                    code: i.code,
                    name: i.name || i.productName || '',
                    desc: i.desc || '',
                    remarks: i.remarks || '',
                    sku: i.sku || i.productSku || '',
                    brand: i.brand || i.brandName || '',
                    shortDesc: i.shortDesc || '',
                    detailedDesc: i.detailedDesc || '',
                    localName: i.localName || i.productLocalName || '',
                    barcode: i.barcode || '',
                    batchNumber: i.batchNumber || '',
                    batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [],
                    unit: i.unit,
                    qty: Number(i.qty),
                    price: Number(i.price),
                    disc: Number(i.disc),
                    tax: Number(i.tax),
                    taxAmt: Number(i.taxAmt || 0),
                    total: Number(i.total),
                    image: i.image ? getImageUrl(i.image) : ''
                })),
                totals: {
                    subTotal: resolvedSummary.subTotal,
                    tax: resolvedSummary.tax,
                    grandTotal: resolvedSummary.grandTotal,
                    currency: getDisplayCurrencyProps(qtn.currency).currency,
                    billDiscount: resolvedBillDiscount,
                    billDiscountAmount: resolvedSummary.billDiscountAmount
                },
                meta: {
                    validTill: qtn.validTill,
                    paymentTerm: qtn.paymentTerms || qtn.paymentTerm,
                    status: qtn.status,
                    notes: qtn.notesToCustomer,
                    reference: qtn.branchCode || '',
                    location: qtn.branchLocation || qtn.branchName || '',
                    locationStore: qtn.branchName || qtn.branchCode || '',
                    warehouse: qtn.branchLocation || '',
                    deliveryTerms: qtn.deliveryType || '',
                    salesPerson: ''
                }
            };
            if (defaultTemplate) {
                const html = await generatePrintHtmlAsync(defaultTemplate, printData, { companyProfile: buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: qtn.branchId ?? activeBranch?.id }), billBullLogo });
                printHtml(html);
            } else {
                setIsPrintModalOpen(true);
            }
        } catch {
            setIsPrintModalOpen(true);
        }
    };

    const handleListingDownload = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        try {
            const templates = await getTemplatesByCategory('Quotation');
            const defaultTemplate = templates.find(t => t.isDefault);
            if (!defaultTemplate) return;
            const resolvedBillDiscount = Number(qtn.billDiscount || 0);
            const resolvedSummary = summarizeSalesItems(qtn.items || [], resolvedBillDiscount);
            const fullCustomer = customersList.find(c => c.code === qtn.customerCode);
            const printData = { title: 'QUOTATION', docNo: qtn.qtnNo, date: qtn.date, customer: { name: qtn.customer, address: fullCustomer?.address || fullCustomer?.billingAddress || '', shippingAddress: qtn.shippingAddress || '', phone: qtn.customerMobile || qtn.customerPhone || fullCustomer?.mobile || fullCustomer?.phone || '', email: qtn.customerEmail || fullCustomer?.email || '', trn: fullCustomer?.trn || '' }, items: (qtn.items || []).filter(i => i.code || i.desc).map(i => ({ code: i.code, name: i.name || i.productName || '', desc: i.desc || '', remarks: i.remarks || '', sku: i.sku || i.productSku || '', brand: i.brand || i.brandName || '', shortDesc: i.shortDesc || '', detailedDesc: i.detailedDesc || '', localName: i.localName || i.productLocalName || '', barcode: i.barcode || '', batchNumber: i.batchNumber || '', batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [], unit: i.unit, qty: Number(i.qty), price: Number(i.price), disc: Number(i.disc), tax: Number(i.tax), taxAmt: Number(i.taxAmt || 0), total: Number(i.total), image: i.image ? getImageUrl(i.image) : '' })), totals: { subTotal: resolvedSummary.subTotal, tax: resolvedSummary.tax, grandTotal: resolvedSummary.grandTotal, currency: getDisplayCurrencyProps(qtn.currency).currency, billDiscount: resolvedBillDiscount, billDiscountAmount: resolvedSummary.billDiscountAmount }, meta: { validTill: qtn.validTill, paymentTerm: qtn.paymentTerms || qtn.paymentTerm, status: qtn.status, notes: qtn.notesToCustomer, reference: qtn.branchCode || '', location: qtn.branchLocation || qtn.branchName || '', locationStore: qtn.branchName || qtn.branchCode || '', warehouse: qtn.branchLocation || '', deliveryTerms: qtn.deliveryType || '', salesPerson: '' } };
            const html = await generatePrintHtmlAsync(defaultTemplate, printData, { companyProfile: buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: qtn.branchId ?? activeBranch?.id }), billBullLogo });
            await downloadPdf(html, qtn.qtnNo || 'Quotation');
        } catch { /* silent */ }
    };


    const handleActionMenuToggle = (quotationId, e) => {
        e.stopPropagation();

        if (activeActionMenu === quotationId) {
            closeActionMenu();
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const menuWidth = 208;
        const estimatedMenuHeight = 240;
        const gutter = 12;
        const openUpward = window.innerHeight - rect.bottom < estimatedMenuHeight && rect.top > estimatedMenuHeight;

        setActiveActionMenu(quotationId);
        setActionMenuPosition({
            left: Math.min(window.innerWidth - menuWidth - gutter, Math.max(gutter, rect.right - menuWidth)),
            top: openUpward ? rect.top - 8 : rect.bottom + 8,
            openUpward
        });
    };

    const handleRevertToApproved = async () => {
        if (!editingId) return;
        try {
            await updateQuotationStatus(editingId, 'APPROVED');
            setStatus('Approved');
            setEditorMode('view');
            await refreshData();
            setToastMessage('Quotation reverted to Approved.');
            setToastType('success');
        } catch {
            setToastMessage('Failed to revert quotation.');
            setToastType('error');
        }
    };

    const handleListingRevertToApproved = async (qtn, e) => {
        e.stopPropagation();
        closeActionMenu();
        try {
            await updateQuotationStatus(qtn.id, 'APPROVED');
            await refreshData();
            setToastMessage('Quotation reverted to Approved.');
            setToastType('success');
        } catch {
            setToastMessage('Failed to revert quotation.');
            setToastType('error');
        }
    };

    // BB-022: Proceed to Invoice from the edit/create view
    const handleProceedToInvoice = async () => {
        if (!editingId) return;
        try {
            // The quotation will be auto-flipped to 'Invoiced' by the backend
            // once the invoice is saved (via linkedQuotation). Just hand off the
            // form data here — no preemptive status change.
            setEditorMode('view');
            navigate('/sales/invoice', {
                state: {
                    fromQuotation: {
                        id: editingId,
                        qtnNo: getQuotationNo(),
                        customer: customer,
                        // selectedCustomerData has the full master record — pass identifiers
                        // so the destination resolves the same row regardless of how its
                        // own customersList was loaded.
                        customerId: selectedCustomerData?.id ?? null,
                        customerCode: selectedCustomerData?.code ?? '',
                        customerName: selectedCustomerData?.name ?? customer,
                        shippingAddress: shippingAddress || '',
                        billDiscount,
                        items: items
                    }
                }
            });
        } catch {
            setToastMessage('Failed to proceed to invoice.');
            setToastType('error');
        }
    };

    const handleCreateNew = async () => {
        setEditingId(null);
        setEditorMode('edit');
        setQuotationBranch(createBranchSnapshot());
        setCustomer('');
        setInquiryCustomerSnapshot(null);
        const walkin = customersList.find(c => c.name.toLowerCase().includes('walkin') || c.name.toLowerCase().includes('walk-in'));
        if (walkin) {
            setCustomer(`${walkin.name} - ${walkin.code}`);
        } else if (customersList.length > 0) {
            setCustomer(`${customersList[0].name} - ${customersList[0].code}`);
        } else {
            setCustomer('Walk-in Customer');
        }
        setItems([{ id: Date.now(), code: '', image: '', desc: '', unit: 'PCS', qty: 0, price: 0, foc: 0, focUnit: 'PCS', availableUnits: ['PCS'], disc: 0, tax: 5, taxAmt: 0.00, total: 0.00, remarks: '', isProductSelected: false }]);
        setStatus('Draft');
        setQtnDate(new Date().toISOString().split('T')[0]);
        setValidTill(new Date().toISOString().split('T')[0]);
        setCurrency(companyCurrencyCode || 'AED');
        setCurrencySearch('');
        setIsCurrencyOpen(false);
        setAttachments([]);
        setNotesToCustomer('');
        setInternalNotes('');
        setBillDiscount(0);
        setSourceInquiry(null);
        setActiveTab('create');

        if (quotationAutoNumbering) {
            try {
                const freshNo = await getNextQuotationNo();
                setNextQtnNo(freshNo);
            } catch (e) { /* ignore */ }
        } else {
            setNextQtnNo('');
        }
    };

    const renderStatusBadge = (currentStatus = status) => {
        switch (currentStatus) {
            case 'Pending Approval':
                return <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">Pending Approval</span>;
            case 'Approved':
                return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">Approved</span>;
            case 'Rejected':
                return <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">Rejected</span>;
            case 'Converted to SO':
                return <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">Converted to SO</span>;
            case 'Invoiced':
                return <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">Invoiced</span>;
            case 'Expired':
                return <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Expired</span>;
            default:
                return <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">Draft</span>;
        }
    };

    const getQuotationNo = () => {
        if (editingId) {
            const qtn = quotationsList.find(q => q.id === editingId);
            return qtn ? qtn.qtnNo : nextQtnNo;
        }
        return nextQtnNo;
    };

    const currentRevisions = editingId
        ? (quotationsList.find(q => q.id === editingId)?.revisions || [])
        : [];

    // =====================================================
    // =====================================================
    // GENERIC PRINT FUNCTIONALITY
    // =====================================================
    // QA-040: payload shared by print and email so both honour every column /
    // header / footer / terms setting from the template designer.
    const buildQuotationDocPayload = () => ({
        title: 'QUOTATION',
        docNo: getQuotationNo(),
        date: qtnDate,
        customer: {
            name: customer,
            address: selectedCustomerData?.address || selectedCustomerData?.billingAddress || '',
            shippingAddress: shippingAddress || '',
            phone: selectedCustomerData?.mobile || selectedCustomerData?.phone || '',
            email: selectedCustomerData?.email || '',
            trn: selectedCustomerData?.trn
        },
        items: items.filter(i => i.code || i.desc).map(i => ({
            code: i.code,
            name: i.name || i.productName || '',
            desc: i.desc || '',
            remarks: i.remarks || '',
            sku: i.sku || i.productSku || '',
            brand: i.brand || i.brandName || '',
            shortDesc: i.shortDesc || '',
            detailedDesc: i.detailedDesc || '',
            localName: i.localName || i.productLocalName || '',
            barcode: i.barcode || '',
            batchNumber: i.batchNumber || '',
            batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [],
            salesPerson: '',
            location: quotationBranch?.location || '',
            unit: i.unit,
            qty: Number(i.qty),
            price: Number(i.price),
            disc: Number(i.disc),
            tax: Number(i.tax),
            taxAmt: Number(i.taxAmt || 0),
            total: Number(i.total),
            image: i.image || i.imageUrl ? getImageUrl(i.image || i.imageUrl) : ''
        })),
        totals: {
            subTotal,
            tax: totalTax,
            grandTotal,
            currency: displayCurrencyProps.currency,
            billDiscount,
            billDiscountAmount
        },
        meta: {
            validTill,
            paymentTerm,
            status,
            notes: notesToCustomer,
            reference: quotationBranch?.code || '',
            location: branchLocationDisplay || quotationBranch?.location || '',
            locationStore: quotationBranch?.name || quotationBranch?.code || '',
            warehouse: quotationBranch?.location || '',
            deliveryTerms: deliveryType || '',
            salesPerson: ''
        }
    });

    const handlePrintClick = async () => {
        setIsPrinting(true);
        try {
            const templates = await getTemplatesByCategory('Quotation');
            const defaultTemplate = templates.find(t => t.isDefault);

            if (defaultTemplate) {
                const html = await generatePrintHtmlAsync(defaultTemplate, buildQuotationDocPayload(), { companyProfile: buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: quotationBranch?.id ?? activeBranch?.id }), billBullLogo });
                printHtml(html);
            } else {
                setIsPrintModalOpen(true);
            }
        } catch (error) {
            console.error("Error fetching templates:", error);
            setIsPrintModalOpen(true);
        } finally {
            setIsPrinting(false);
        }
    };

    const handlePrintQuotation = (template) => {
        setIsPrintModalOpen(false);

        const qtnNo = getQuotationNo();
        const customerName = customer || 'Walk-in Customer';
        const today = formatDisplayDate(new Date());

        // Template-specific styles
        const templates = {
            Classic: {
                headerBg: '#F5C742',
                headerText: '#1e293b',
                accentColor: '#F5C742',
                tableBorder: '#e2e8f0',
                tableHeaderBg: '#f8fafc',
                tableHeaderText: '#475569',
                bodyFont: "'Segoe UI', system-ui, -apple-system, sans-serif",
                watermark: false
            },
            Minimal: {
                headerBg: '#ffffff',
                headerText: '#1e293b',
                accentColor: '#3b82f6',
                tableBorder: '#f1f5f9',
                tableHeaderBg: '#ffffff',
                tableHeaderText: '#94a3b8',
                bodyFont: "'Inter', 'Segoe UI', sans-serif",
                watermark: false
            },
            Premium: {
                headerBg: '#1e293b',
                headerText: '#ffffff',
                accentColor: '#D4AF37',
                tableBorder: '#e2e8f0',
                tableHeaderBg: '#1e293b',
                tableHeaderText: '#ffffff',
                bodyFont: "'Georgia', 'Times New Roman', serif",
                watermark: false
            },
            Watermark: {
                headerBg: '#F5C742',
                headerText: '#1e293b',
                accentColor: '#F5C742',
                tableBorder: '#e2e8f0',
                tableHeaderBg: '#f8fafc',
                tableHeaderText: '#475569',
                bodyFont: "'Segoe UI', system-ui, -apple-system, sans-serif",
                watermark: true
            }
        };

        const t = templates[template] || templates.Classic;

        // Build items rows
        const itemRows = items.filter(i => i.code || i.desc).map((item, idx) => `
            <tr>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:center; color:#64748b; font-size:13px;">${idx + 1}</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; font-family:monospace; font-size:12px; color:#475569;">${item.code || '-'}</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; font-size:13px; color:#1e293b; font-weight:500;">
                    ${printOptions.printWithImages && item.image ? `<div style="display:flex; align-items:center; gap:8px;"><img src="${getImageUrl(item.image)}" style="width:32px; height:32px; object-fit:cover; border-radius:4px;" /><span>${item.desc || '-'}</span></div>` : `${item.desc || '-'}`}
                </td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:center; font-size:13px; color:#475569;">${item.unit || 'PCS'}</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:center; font-size:13px; color:#1e293b; font-weight:600;">${item.qty}</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:right; font-size:13px; color:#1e293b;">${Number(item.price || 0).toFixed(2)}</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:center; font-size:13px; color:#dc2626;">${item.disc || 0}%</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:right; font-size:13px; color:#475569;">${Number(item.taxAmt || 0).toFixed(2)}</td>
                <td style="padding:10px 12px; border-bottom:1px solid ${t.tableBorder}; text-align:right; font-size:14px; color:#1e293b; font-weight:700;">${Number(item.total || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        const watermarkHtml = t.watermark ? `
            <div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-35deg); font-size:120px; font-weight:900; color:rgba(0,0,0,0.04); pointer-events:none; z-index:0; white-space:nowrap; letter-spacing:12px;">QUOTATION</div>
        ` : '';

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${generateDocFilename('Quotation', qtnNo, customerName, qtnDate, currency)}</title>
    <style>
        @page { size: A4; margin: 15mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${t.bodyFont}; color: #1e293b; background: #fff; position: relative; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
    ${watermarkHtml}

    <!-- HEADER -->
    <div style="background:${t.headerBg}; padding:28px 32px; display:flex; justify-content:space-between; align-items:center; ${template === 'Minimal' ? 'border-bottom:2px solid #e2e8f0;' : template === 'Premium' ? 'border-radius:0;' : ''}">
        <div style="display:flex; align-items:center; gap:16px;">
            ${company?.logoUrl ? `<img src="${company.logoUrl}" alt="Company Logo" style="height:60px; width:auto;" />` : ''}
            <div>
                <h1 style="font-size:22px; font-weight:800; color:${t.headerText}; letter-spacing:-0.5px;">${company?.companyName || ''}</h1>
                <p style="font-size:11px; color:${template === 'Premium' ? '#94a3b8' : '#64748b'}; margin-top:4px;">${company?.address || ''}</p>
            </div>
        </div>
        <div style="text-align:right; display:flex; align-items:center; gap:14px;">
            <div>
                <h2 style="font-size:22px; font-weight:700; color:${t.headerText}; letter-spacing:1px;">QUOTATION</h2>
                <p style="font-size:13px; color:${template === 'Premium' ? '#94a3b8' : '#64748b'}; margin-top:4px;">${qtnNo}</p>
            </div>
            <img src="${window.location.origin}${billBullLogo}" alt="BillBull" style="height:40px; width:auto; opacity:0.7;" />
        </div>
    </div>

    <!-- DETAILS GRID -->
    <div style="padding:24px 32px; display:flex; justify-content:space-between; gap:32px;">
        <div style="flex:1;">
            <h3 style="font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:10px; font-weight:700;">Bill To</h3>
            <p style="font-size:15px; font-weight:700; color:#1e293b; margin-bottom:4px;">${customerName}</p>
            ${shippingAddress ? `<p style="font-size:12px; color:#64748b; line-height:1.5;">${shippingAddress}</p>` : ''}
        </div>
        <div style="text-align:right;">
            <table style="margin-left:auto; border-spacing:0;">
                <tr><td style="padding:4px 16px 4px 0; font-size:12px; color:#94a3b8; text-align:right;">Date:</td><td style="font-size:13px; font-weight:600; color:#1e293b;">${qtnDate}</td></tr>
                <tr><td style="padding:4px 16px 4px 0; font-size:12px; color:#94a3b8; text-align:right;">Valid Till:</td><td style="font-size:13px; font-weight:600; color:#1e293b;">${validTill}</td></tr>
                <tr><td style="padding:4px 16px 4px 0; font-size:12px; color:#94a3b8; text-align:right;">Currency:</td><td style="font-size:13px; font-weight:600; color:#1e293b;">${displayCurrencyHtml}</td></tr>
                <tr><td style="padding:4px 16px 4px 0; font-size:12px; color:#94a3b8; text-align:right;">Payment:</td><td style="font-size:13px; font-weight:600; color:#1e293b;">${paymentTerm}</td></tr>
                <tr><td style="padding:4px 16px 4px 0; font-size:12px; color:#94a3b8; text-align:right;">Status:</td><td style="font-size:13px; font-weight:700; color:${status === 'Approved' ? '#16a34a' : status === 'Rejected' ? '#dc2626' : '#F5C742'};">${status}</td></tr>
            </table>
        </div>
    </div>

    <!-- ITEMS TABLE -->
    <div style="padding:0 32px;">
        <table style="width:100%; border-collapse:collapse; border:1px solid ${t.tableBorder}; border-radius:8px; overflow:hidden;">
            <thead>
                <tr style="background:${t.tableHeaderBg};">
                    <th style="padding:12px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:40px;">#</th>
                    <th style="padding:12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:90px;">Code</th>
                    <th style="padding:12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder};">Description</th>
                    <th style="padding:12px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:60px;">Unit</th>
                    <th style="padding:12px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:50px;">Qty</th>
                    <th style="padding:12px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:90px;">Price</th>
                    <th style="padding:12px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:60px;">Disc%</th>
                    <th style="padding:12px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:80px;">Tax</th>
                    <th style="padding:12px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:${t.tableHeaderText}; font-weight:700; border-bottom:2px solid ${t.tableBorder}; width:100px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemRows || '<tr><td colspan="9" style="padding:24px; text-align:center; color:#94a3b8;">No items</td></tr>'}
            </tbody>
        </table>
    </div>

    <!-- TOTALS -->
    <div style="padding:20px 32px; display:flex; justify-content:flex-end;">
        <table style="border-spacing:0; min-width:280px;">
            <tr><td style="padding:6px 20px 6px 0; font-size:13px; color:#64748b;">Sub Total</td><td style="text-align:right; font-size:14px; font-weight:600; color:#1e293b;">${displayCurrencyHtml} ${subTotal.toFixed(2)}</td></tr>
            ${billDiscount > 0 ? `<tr><td style="padding:6px 20px 6px 0; font-size:13px; color:#dc2626;">Bill Discount (${billDiscount}%)</td><td style="text-align:right; font-size:14px; font-weight:600; color:#dc2626;">-${displayCurrencyHtml} ${billDiscountAmount.toFixed(2)}</td></tr>` : ''}
            <tr><td style="padding:6px 20px 6px 0; font-size:13px; color:#64748b;">Tax (VAT 5%)</td><td style="text-align:right; font-size:14px; font-weight:600; color:#1e293b;">${displayCurrencyHtml} ${totalTax.toFixed(2)}</td></tr>
            <tr style="border-top:2px solid ${t.accentColor};">
                <td style="padding:12px 20px 6px 0; font-size:16px; font-weight:800; color:#1e293b;">Grand Total</td>
                <td style="text-align:right; padding-top:12px; font-size:18px; font-weight:800; color:${template === 'Premium' ? '#D4AF37' : '#1e293b'};">${displayCurrencyHtml} ${grandTotal.toFixed(2)}</td>
            </tr>
        </table>
    </div>

    <!-- NOTES -->
    ${notesToCustomer ? `
    <div style="padding:8px 32px 20px;">
        <h3 style="font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:8px; font-weight:700;">Notes</h3>
        <p style="font-size:12px; color:#64748b; line-height:1.6; background:#f8fafc; padding:12px 16px; border-radius:6px; border:1px solid #f1f5f9;">${notesToCustomer}</p>
    </div>
    ` : ''}

    <!-- FOOTER -->
    <div style="padding:24px 32px; margin-top:20px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <div>
            <p style="font-size:13px; color:#64748b; font-weight:500;">Thank you for your business!</p>
            <p style="font-size:11px; color:#94a3b8; margin-top:6px;">This quotation is valid until ${validTill}. Prices are in ${displayCurrencyHtml}.</p>
        </div>
        <div style="text-align:right; opacity:0.5;">
            <img src="${window.location.origin}${billBullLogo}" alt="BillBull" style="height:24px; width:auto;" />
            <p style="font-size:9px; color:#94a3b8; margin-top:2px;">Powered by BillBull ERP</p>
        </div>
    </div>

</body>
</html>`;

        // Open in new window and print using centralized utility
        printHtml(htmlContent);
    };

    // =====================================================
    // FILTER & SORT LOGIC
    // =====================================================
    const filteredQuotations = useMemo(() => {
        let data = [...quotationsList];

        // 1. Filter by Status
        if (filterStatus !== 'All') {
            data = data.filter(q => q.status === filterStatus);
        }

        // 2. Search
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            data = data.filter(q =>
                (q.qtnNo && q.qtnNo.toLowerCase().includes(lowerTerm)) ||
                (q.customer && q.customer.toLowerCase().includes(lowerTerm))
            );
        }

        // 3. Sort
        if (sortConfig.key) {
            data.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Handle specific keys if needed (e.g., date parsing)
                if (sortConfig.key === 'total') {
                    aValue = Number(a.total || 0);
                    bValue = Number(b.total || 0);
                }

                if (sortConfig.key === 'qtnNo') {
                    return compareDocumentValues(aValue, bValue, sortConfig.direction);
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        return data;
    }, [quotationsList, searchTerm, filterStatus, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return (
        <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#F7F7FA] font-sans text-slate-900 relative" onClick={() => {
            setIsCurrencyOpen(false); setIsCustomerOpen(false); setIsPaymentTermOpen(false); setIsDeliveryTypeOpen(false);
            setActiveActionMenu(null); setActionMenuPosition(null);
        }}>
            <main className="flex-1 p-4 md:p-6 flex flex-col min-w-0">
                {/* --- Sticky Header --- */}
                <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-5 sticky top-0 z-40 shadow-sm mb-6 -mx-4 md:-mx-6 mt-[-16px] md:mt-[-24px]">
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
                        {/* Title and Controls */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <span>Customers & Sales</span>
                                <ChevronRight size={12} />
                                <span className="font-medium text-slate-900">Quotations</span>
                            </div>
                            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FileText className="text-[#F5C742]" size={28} /> Quotations</h1>
                            <p className="text-sm text-slate-500">Manage and create quotations for your customers.</p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                            {activeTab !== 'list' && (
                                <button
                                    onClick={() => setActiveTab('list')}
                                    className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
                                >
                                    <ArrowLeft className="h-4 w-4" /> Back
                                </button>
                            )}
                            {activeTab !== 'list' && (
                                <>
                                    <button className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                                        <Mail className="h-4 w-4" /> Email
                                    </button>
                                    <button className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                                        <MessageCircle className="h-4 w-4" /> WhatsApp
                                    </button>
                                    <button className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                                        <Smartphone className="h-4 w-4" /> SMS
                                    </button>
                                    <button onClick={handlePrintClick} disabled={isPrinting} className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50">
                                        <Printer className="h-4 w-4" /> {isPrinting ? 'Printing...' : 'Print'}
                                    </button>
                                </>
                            )}
                            {activeTab === 'list' && (
                                <button
                                    onClick={handleCreateNew}
                                    className="flex-1 sm:flex-none h-8 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm transition-colors"
                                >
                                    <Plus className="h-4 w-4" /> Create New
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4">
                        {[
                            { id: 'list', label: 'Quotation List', icon: ShoppingCart },
                            { id: 'create', label: 'Quotation Editor', icon: FileText }
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${isActive
                                        ? "bg-[#F5C742] text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                        }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ======================= VIEW: LIST ======================= */}
                {activeTab === 'list' && (
                    <div>
                    <KpiCards
                        loading={isStatsLoading}
                        cards={[
                            {
                                label: 'This Month Quotations',
                                value: qtnStats?.thisMonthCount ?? '—',
                                sub: `${qtnStats?.openQuotations ?? 0} still open`,
                                icon: <FileText size={18} />,
                                iconBg: 'bg-yellow-100',
                                iconColor: 'text-yellow-600',
                                accent: 'border-l-yellow-400',
                            },
                            {
                                label: 'This Month Value',
                                value: qtnStats?.thisMonthValue != null
                                    ? `${companyCurrencySymbol} ${Number(qtnStats.thisMonthValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : '—',
                                sub: 'Total quoted amount',
                                icon: <ShoppingCart size={18} />,
                                iconBg: 'bg-emerald-100',
                                iconColor: 'text-emerald-600',
                                accent: 'border-l-emerald-400',
                            },
                            {
                                label: 'Converted',
                                value: qtnStats?.convertedCount ?? '—',
                                sub: `${qtnStats?.conversionRate ?? 0}% conversion rate`,
                                icon: <CheckCircle2 size={18} />,
                                iconBg: 'bg-blue-100',
                                iconColor: 'text-blue-600',
                                accent: 'border-l-blue-400',
                            },
                            {
                                label: 'Open Quotations',
                                value: qtnStats?.openQuotations ?? '—',
                                sub: 'Draft + approved',
                                icon: <AlertCircle size={18} />,
                                iconBg: 'bg-orange-100',
                                iconColor: 'text-orange-500',
                                accent: 'border-l-orange-400',
                            },
                        ]}
                    />
                    <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm p-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <h2 className="font-bold text-slate-700 text-lg">Quotations</h2>

                            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                                <DateFilter onChange={(range) => { 
                                    setDateRange(prev => (prev?.fromDate === range?.fromDate && prev?.toDate === range?.toDate) ? prev : range); 
                                    setListPage(0); 
                                }} />
                                {/* Search */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search quotations..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 w-full md:w-64"
                                    />
                                </div>

                                {/* Filter */}
                                <div className="relative">
                                    <ListFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 w-full md:w-48 appearance-none bg-white cursor-pointer"
                                    >
                                        <option value="All">All Status</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Pending Approval">Pending Approval</option>
                                        <option value="Approved">Approved</option>
                                        <option value="Rejected">Rejected</option>
                                        <option value="Converted to SO">Converted to SO</option>
                                        <option value="Invoiced">Invoiced</option>
                                        <option value="Expired">Expired</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                </div>

                                <ExportDropdown
                                    onExportExcel={() => exportToExcel(
                                        withListSerialNumbers(filteredQuotations, {
                                            documentNumberSelector: (qtn) => qtn.qtnNo,
                                            page: listPageMeta.page,
                                            size: listPageMeta.size,
                                            totalElements: listPageMeta.totalElements,
                                        }),
                                        QUOTATION_COLUMNS,
                                        'Quotations'
                                    )}
                                    onExportPdf={() => exportToPDF(
                                        withListSerialNumbers(filteredQuotations, {
                                            documentNumberSelector: (qtn) => qtn.qtnNo,
                                            page: listPageMeta.page,
                                            size: listPageMeta.size,
                                            totalElements: listPageMeta.totalElements,
                                        }),
                                        QUOTATION_COLUMNS,
                                        'Quotations List',
                                        'Quotations'
                                    )}
                                />
                                <button onClick={handleCreateNew} className="flex items-center justify-center gap-1 px-4 py-2 bg-yellow-400 text-slate-900 text-sm font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm whitespace-nowrap">
                                    <Plus size={16} /> Create New
                                </button>
                            </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="overflow-x-auto">
                            <table className="bb-nowrap-table w-full text-sm text-left hidden md:table">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/50">
                                    <tr>
                                        <th className="px-4 py-3 text-center text-slate-500 w-16 select-none">
                                            S.No.
                                        </th>
                                        <th
                                            className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            onClick={() => handleSort('qtnNo')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Quotation No.
                                                {sortConfig.key === 'qtnNo' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                            </div>
                                        </th>
                                        <th
                                            className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            onClick={() => handleSort('date')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Date
                                                {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                            </div>
                                        </th>
                                        <th
                                            className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            onClick={() => handleSort('customer')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Customer
                                                {sortConfig.key === 'customer' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3">Branch</th>
                                        <th
                                            className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            onClick={() => handleSort('total')}
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                Total
                                                {sortConfig.key === 'total' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-right">Status</th>
                                        <th className="px-4 py-3 text-center w-12">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/30">
                                    {isListLoading && <TableSkeleton cols={9} rows={8} />}
                                    {filteredQuotations.map((qtn, index) => (
                                        <React.Fragment key={qtn.id}>
                                            <tr
                                                onClick={() => handleViewQuotation(qtn)}
                                                className="hover:bg-slate-50 cursor-pointer transition-colors"
                                            >
                                                <td className="px-4 py-3 text-center text-slate-400 font-mono font-medium">
                                                    {getListSerialNumber(index, {
                                                        documentNumber: qtn.qtnNo,
                                                        page: listPageMeta.page,
                                                        size: listPageMeta.size,
                                                        totalElements: listPageMeta.totalElements,
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 text-blue-600 font-medium flex items-center gap-2">
                                                    {qtn.revisions && qtn.revisions.length > 0 && (
                                                        <button
                                                            onClick={(e) => toggleListRow(e, qtn.id)}
                                                            className="p-0.5 rounded-full hover:bg-blue-100 text-blue-500 transition-colors"
                                                        >
                                                            {expandedListRows[qtn.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </button>
                                                    )}
                                                    {qtn.qtnNo}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{formatDisplayDate(qtn.date)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-700">{qtn.customer}</div>
                                                    {qtn.customerCode && <div className="text-[10px] text-slate-400">{qtn.customerCode}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-[11px] text-slate-600">
                                                    {qtn.branchCode ? qtn.branchCode : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-800">
                                                    <CurrencyAmount value={qtn.total || 0} {...getDisplayCurrencyProps(qtn.currency)} />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {renderStatusBadge(qtn.status)}
                                                </td>
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    <div className="relative inline-block">
                                                        <button
                                                            onClick={(e) => handleActionMenuToggle(qtn.id, e)}
                                                            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                                                        >
                                                            <MoreVertical size={15} />
                                                        </button>
                                                        {activeActionMenu === qtn.id && actionMenuPosition && (
                                                            <div
                                                                className="fixed z-[80] w-52 bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-xs"
                                                                style={{
                                                                    left: `${actionMenuPosition.left}px`,
                                                                    top: `${actionMenuPosition.top}px`,
                                                                    transform: actionMenuPosition.openUpward ? 'translateY(-100%)' : 'none'
                                                                }}
                                                            >
                                                                {/* View / Edit — always */}
                                                                <button onClick={(e) => { e.stopPropagation(); closeActionMenu(); handleViewQuotation(qtn); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                                    <Eye size={13} /> View
                                                                </button>
                                                                {canEditQuotation(qtn.status) && (
                                                                    <button onClick={(e) => { e.stopPropagation(); closeActionMenu(); handleEditQuotation(qtn, 'edit'); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                                        <Edit size={13} /> Edit
                                                                    </button>
                                                                )}

                                                                {/* --- Workflow actions --- */}
                                                                {(qtn.status === 'Draft' || qtn.status === 'Approved' || qtn.status === 'Rejected' || qtn.status === 'Expired') && (
                                                                    <button onClick={(e) => handleListingRevise(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                                        <RotateCcw size={13} /> Revise
                                                                    </button>
                                                                )}
                                                                {qtn.status === 'Draft' && (
                                                                    <button onClick={(e) => handleListingConfirm(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 text-blue-700 font-semibold">
                                                                        <Check size={13} /> Confirm to PI
                                                                    </button>
                                                                )}
                                                                {qtn.status === 'Pending Approval' && (
                                                                    <>
                                                                        <button onClick={(e) => handleListingApprove(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-emerald-50 flex items-center gap-2 text-emerald-700 font-semibold">
                                                                            <CheckCircle2 size={13} /> Approve
                                                                        </button>
                                                                        <button onClick={(e) => handleListingReject(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600">
                                                                            <X size={13} /> Reject
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {qtn.status === 'Approved' && (
                                                                    <>
                                                                        <button onClick={(e) => handleListingConvertToOrder(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                                            <Box size={13} /> Convert to Order
                                                                        </button>
                                                                        <button onClick={(e) => handleListingProceedToInvoice(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2 text-indigo-700 font-semibold">
                                                                            <FileText size={13} /> Finalize to Invoice
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {qtn.status === 'Converted to SO' && (
                                                                    <button onClick={(e) => handleListingRevertToApproved(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-orange-50 flex items-center gap-2 text-orange-600 font-semibold">
                                                                        <RotateCcw size={13} /> Revert to Approved
                                                                    </button>
                                                                )}

                                                                {/* --- Danger zone --- */}
                                                                {!['Expired', 'Invoiced', 'Rejected'].includes(qtn.status) && (
                                                                    <>
                                                                        <div className="border-t border-slate-100 my-1" />
                                                                        {qtn.status === 'Approved' && (
                                                                            <button onClick={(e) => handleListingReject(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-2 text-red-500">
                                                                                <X size={13} /> Mark as Reject
                                                                            </button>
                                                                        )}
                                                                        <button onClick={(e) => handleListingMarkExpired(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-amber-600">
                                                                            <AlertTriangle size={13} /> Mark as Expired
                                                                        </button>
                                                                    </>
                                                                )}

                                                                <div className="border-t border-slate-100 my-1" />
                                                                <button onClick={(e) => handleListingPrint(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                                    <Printer size={13} /> Print
                                                                </button>
                                                                <button onClick={(e) => handleListingDownload(qtn, e)} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                                    <Download size={13} /> Download PDF
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* CHILD ROWS FOR REVISIONS */}
                                            {expandedListRows[qtn.id] && qtn.revisions && qtn.revisions.length > 0 && (
                                                qtn.revisions.map((rev) => (
                                                    <tr
                                                        key={`rev-${rev.revId}`}
                                                        className="bg-slate-50/70 border-l-[3px] border-l-blue-300 cursor-pointer hover:bg-slate-100/70"
                                                        // Note: Assuming we load revisions by parent ID but we can attach a different view logic if needed. 
                                                        // For now it just acts as an informative display. 
                                                        // Clicking it could theoretically load that specific revision in the UX.
                                                        onClick={() => {
                                                            // Optional UX: handle loading a specific revision
                                                            // handleEditQuotation(qtn, rev); 
                                                        }}
                                                    >
                                                        <td className="px-4 py-2 pl-10 text-slate-500 text-xs font-semibold">
                                                            <div className="flex items-center gap-1">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-300"></div>
                                                                {rev.qtnNoDisplay}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">{formatDisplayDate(rev.date)}</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs italic opacity-70">revised version</td>
                                                        <td className="px-4 py-2 text-right font-bold text-slate-600 text-xs">
                                                            <CurrencyAmount value={rev.total || 0} {...getDisplayCurrencyProps(qtn.currency)} />
                                                        </td>
                                                        <td className="px-4 py-2 text-right scale-90 origin-right">
                                                            {renderStatusBadge(rev.status)}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                ))
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {filteredQuotations.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="text-center py-12 text-slate-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                                                        <Search size={20} className="text-slate-400" />
                                                    </div>
                                                    <p>No quotations found matching your criteria.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {filteredQuotations.length > 0 ? (
                                filteredQuotations.map(qtn => (
                                    <MobileCard
                                        key={qtn.id}
                                        qtn={qtn}
                                        onClick={() => handleViewQuotation(qtn)}
                                        renderStatusBadge={renderStatusBadge}
                                        isExpanded={expandedListRows[qtn.id]}
                                        onToggleExpand={toggleListRow}
                                        currencyProps={getDisplayCurrencyProps(qtn.currency)}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400 text-sm">No quotations found.</div>
                            )}
                        </div>
                        <PaginationFooter
                            page={listPageMeta.page}
                            size={listPageMeta.size}
                            totalElements={listPageMeta.totalElements}
                            totalPages={listPageMeta.totalPages}
                            loading={isListLoading}
                            onPageChange={setListPage}
                        />
                    </div>
                    </div>
                )}

                {/* ======================= VIEW: CREATE / EDIT ======================= */}
                {activeTab === 'create' && (
                    <div className="space-y-6 flex-1 flex flex-col pb-24">
                        {isViewMode && (
                            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <div className="text-sm font-bold">View Only</div>
                                    <div className="text-xs text-blue-700">This quotation is opened in read-only mode. Use Edit only where editing is allowed.</div>
                                </div>
                                {canEditCurrentQuotation && (
                                    <button
                                        onClick={handleSwitchToEditMode}
                                        className="px-3 py-1.5 bg-white border border-blue-200 rounded-md text-xs font-bold text-blue-700 hover:bg-blue-100"
                                    >
                                        <Edit size={13} className="inline mr-1" /> Switch to Edit
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1">

                            {/* ======================= LEFT COLUMN ======================= */}
                            <div className="xl:col-span-1 space-y-4">

                                {/* 1. Quotation Details Card */}
                                <div className="bg-white rounded-lg border border-slate-200/50 p-4 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100/50 pb-2">Quotation Details</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col col-span-2 sm:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 mb-1">Quotation No.</label>
                                            <input
                                                type="text"
                                                value={getQuotationNo()}
                                                onChange={(e) => setNextQtnNo(e.target.value)}
                                                readOnly={isViewMode || editingId || quotationAutoNumbering}
                                                placeholder={quotationAutoNumbering ? 'Auto generated' : 'Enter quotation number'}
                                                className="text-sm p-1.5 border border-slate-200/50 rounded text-slate-700 read-only:bg-slate-50 read-only:text-slate-500 focus:outline-none focus:border-[#F5C742]"
                                            />
                                        </div>
                                        <div className="flex flex-col col-span-2 sm:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 mb-1">Revision</label>
                                            <input type="text" value={editingId ? `0${currentRevisions.length + 1}` : '00'} readOnly className="text-sm p-1.5 bg-slate-50 border border-slate-200/50 rounded text-center text-slate-700" />
                                        </div>
                                        {sourceInquiry?.inquiryNumber && (
                                            <div className="flex flex-col col-span-2">
                                                <label className="text-xs font-semibold text-slate-500 mb-1">Source Inquiry</label>
                                                <input type="text" value={sourceInquiry.inquiryNumber} readOnly className="text-sm p-1.5 bg-slate-50 border border-slate-200/50 rounded text-slate-700" />
                                            </div>
                                        )}
                                        <div className="flex flex-col col-span-2 sm:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 mb-1">Date</label>
                                            <input type="date" value={qtnDate} onChange={(e) => setQtnDate(e.target.value)} disabled={isViewMode} className="w-full text-sm p-1.5 border border-slate-300/50 rounded text-slate-700 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed" />
                                        </div>
                                        <div className="flex flex-col col-span-2 sm:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 mb-1">Valid Until</label>
                                            <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} disabled={isViewMode} className="w-full text-sm p-1.5 border border-slate-300/50 rounded text-slate-700 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed" />
                                        </div>

                                        <div className="flex flex-col relative col-span-2 sm:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 mb-1">Currency</label>
                                            <div
                                                className={`w-full text-sm p-1.5 border border-slate-300/50 rounded text-slate-700 bg-white flex justify-between items-center ${isViewMode ? 'cursor-not-allowed bg-slate-50 text-slate-500' : 'cursor-pointer'}`}
                                                onClick={(e) => {
                                                    if (isViewMode) return;
                                                    e.stopPropagation();
                                                    setIsCurrencyOpen(prev => {
                                                        const next = !prev;
                                                        if (next) {
                                                            setCurrencySearch('');
                                                        }
                                                        return next;
                                                    });
                                                }}
                                            >
                                                <span className="truncate pr-2">{selectedCurrencyOption.code} - {selectedCurrencyOption.name}</span>
                                                <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                            </div>
                                            {isCurrencyOpen && !isViewMode && (
                                                <div
                                                    className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-20 mt-1 overflow-hidden"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="p-2 border-b border-slate-100 bg-white">
                                                        <div className="relative">
                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                            <input
                                                                type="text"
                                                                value={currencySearch}
                                                                autoFocus
                                                                onChange={(e) => setCurrencySearch(e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && filteredCurrencyOptions.length > 0) {
                                                                        setCurrency(filteredCurrencyOptions[0].code);
                                                                        setCurrencySearch('');
                                                                        setIsCurrencyOpen(false);
                                                                    }
                                                                }}
                                                                placeholder="Search currency code or name..."
                                                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="max-h-72 overflow-y-auto">
                                                        {filteredCurrencyOptions.length > 0 ? filteredCurrencyOptions.map((option) => (
                                                            <div
                                                                key={option.code}
                                                                onClick={() => {
                                                                    setCurrency(option.code);
                                                                    setCurrencySearch('');
                                                                    setIsCurrencyOpen(false);
                                                                }}
                                                                className={`px-3 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:bg-slate-50 ${currency === option.code ? 'bg-yellow-50 text-slate-900' : 'text-slate-700'}`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold">{option.code}</div>
                                                                    <div className={`text-xs truncate ${currency === option.code ? 'text-slate-600' : 'text-slate-500'}`}>{option.name}</div>
                                                                </div>
                                                                {currency === option.code && <Check size={14} className="text-yellow-600 shrink-0" />}
                                                            </div>
                                                        )) : (
                                                            <div className="px-3 py-6 text-sm text-center text-slate-400">
                                                                No currencies match your search.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col col-span-2 sm:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 mb-1">Branch / Location</label>
                                            <input
                                                type="text"
                                                value={branchLocationDisplay}
                                                readOnly
                                                title={branchLocationDisplay}
                                                className="w-full text-sm p-1.5 border border-slate-300/50 rounded text-slate-700 bg-slate-50"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Customer + Shipping — unified panel */}
                                <CustomerShippingPanel
                                    selectedCustomer={activeCustomerData}
                                    onOpenCustomerSearch={() => setIsCustomerSearchOpen(true)}
                                    onCustomerUpdated={(updated) => {
                                        if (!updated?.code) return;
                                        setCustomersList(prev => prev.map(c => c.code === updated.code ? { ...c, ...updated } : c));
                                    }}
                                    shippingAddress={shippingAddress}
                                    onShippingChange={setShippingAddress}
                                    deliveryType={deliveryType}
                                    onDeliveryTypeChange={setDeliveryType}
                                    expectedDispatch={expectedDispatch}
                                    onExpectedDispatchChange={setExpectedDispatch}
                                    isReadOnly={isViewMode}
                                    currency={displayCurrencyProps.currency}
                                    currencySymbol={displayCurrencyProps.currencySymbol}
                                />

                                {selectedCustomerData && salesSettings?.creditLimitPolicy === 'WARNING' &&
                                    selectedCustomerData.creditLimitAmount > 0 &&
                                    (Number(selectedCustomerData.balance || 0) + grandTotal) > selectedCustomerData.creditLimitAmount && (
                                        <div className="p-2.5 bg-yellow-50 shadow-sm border border-yellow-200 rounded-md text-yellow-800 text-[11px] leading-relaxed flex items-start gap-2">
                                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-yellow-600" />
                                            <p>
                                                <strong>Credit Warning:</strong> The projected outstanding balance
                                                (<CurrencyAmount value={Number(selectedCustomerData.balance || 0) + grandTotal} {...displayCurrencyProps} />) exceeds this customer's
                                                credit limit of <CurrencyAmount value={selectedCustomerData.creditLimitAmount} {...displayCurrencyProps} />.
                                            </p>
                                        </div>
                                    )}
                                {selectedCustomerData && salesSettings?.creditLimitPolicy === 'BLOCK' &&
                                    selectedCustomerData.creditLimitAmount > 0 &&
                                    (Number(selectedCustomerData.balance || 0) + grandTotal) > selectedCustomerData.creditLimitAmount && (
                                        <div className="p-2.5 bg-red-50 shadow-sm border border-red-300 rounded-md text-red-800 text-[11px] leading-relaxed flex items-start gap-2">
                                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                                            <p>
                                                <strong>Credit Limit Blocked:</strong> The projected outstanding balance
                                                (<CurrencyAmount value={Number(selectedCustomerData.balance || 0) + grandTotal} {...displayCurrencyProps} />) exceeds this customer's
                                                credit limit of <CurrencyAmount value={selectedCustomerData.creditLimitAmount} {...displayCurrencyProps} />.
                                                Confirming this quotation is blocked until the balance is within limit.
                                            </p>
                                        </div>
                                    )}

                                {/* CustomerSelector modal (unchanged) */}
                                <CustomerSelector
                                    isOpen={!isViewMode && isCustomerSearchOpen}
                                    onClose={() => setIsCustomerSearchOpen(false)}
                                    onSelect={handleSelectCustomer}
                                    customers={customersList}
                                    selectedCode={selectedCustomerData?.code || ''}
                                    onCustomerCreated={refreshData}
                                />

                                {/* Payment Terms */}
                                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative">
                                    <h3 className="text-xs font-bold text-slate-700 mb-3">Payment Terms</h3>
                                    <div className="flex flex-col relative">
                                        <label className="text-[10px] font-semibold text-slate-500 mb-1">Terms</label>
                                        <div
                                            className={`w-full text-xs p-2 border border-slate-200 rounded-lg text-slate-700 bg-white flex justify-between items-center ${isViewMode ? 'cursor-not-allowed bg-slate-50 text-slate-500' : 'cursor-pointer hover:border-yellow-400'}`}
                                            onClick={(e) => { if (isViewMode) return; e.stopPropagation(); setIsPaymentTermOpen(!isPaymentTermOpen); }}
                                        >
                                            {paymentTerm} <ChevronDown size={12} className="text-slate-400" />
                                        </div>
                                        {isPaymentTermOpen && !isViewMode && (
                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-20 mt-1 overflow-hidden">
                                                {['Immediate', 'Cash', '7 Days', '15 Days', '30 Days', '45 Days', '60 Days', 'Custom'].map(opt => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => { setPaymentTerm(opt); setIsPaymentTermOpen(false); }}
                                                        className={`px-3 py-2 text-xs cursor-pointer flex justify-between items-center hover:bg-slate-50 ${paymentTerm === opt ? 'bg-yellow-50 text-yellow-700 font-semibold' : 'text-slate-700'}`}
                                                    >
                                                        {opt} {paymentTerm === opt && <Check size={12} />}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div> {/* End Left Column */}

                            {/* ======================= MIDDLE COLUMN (ITEMS TABLE) ======================= */}
                            <div className="xl:col-span-2 space-y-4">
                                {/* 3. Quotation Items (TABLE) */}
                                <div className="bg-white rounded-lg border border-slate-200/50 p-5 shadow-sm min-h-[460px]">
                                    <div className="flex justify-between items-center mb-4 border-b border-slate-100/50 pb-2">
                                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <ShoppingCart size={16} className="text-yellow-500" /> Quotation Items
                                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200"><Zap size={10} /> Fast Entry</span>
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            {/* VAT mode toggle — drives line tax math (inclusive vs exclusive). */}
                                            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px] font-semibold">
                                                <button
                                                    type="button"
                                                    disabled={isViewMode}
                                                    onClick={() => setVatMode('EXCLUSIVE')}
                                                    className={`px-2.5 py-1 transition-colors ${vatMode === 'EXCLUSIVE' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                                                    title="Prices entered exclude VAT — tax added on top"
                                                >VAT Excl.</button>
                                                <button
                                                    type="button"
                                                    disabled={isViewMode}
                                                    onClick={() => setVatMode('INCLUSIVE')}
                                                    className={`px-2.5 py-1 border-l border-slate-200 transition-colors ${vatMode === 'INCLUSIVE' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                                                    title="Prices entered already include VAT — tax extracted out"
                                                >VAT Incl.</button>
                                            </div>
                                            {!isViewMode && (
                                                <button
                                                    onClick={() => setIsProductSelectionOpen(true)}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500"
                                                >
                                                    <Plus size={14} /> Select from Products
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="overflow-auto max-h-[380px]">
                                        <table className="bb-nowrap-table w-full text-xs text-left min-w-[800px]">
                                            <thead className="sticky top-0 z-10 bg-white border-b border-slate-100/80 text-[11px] font-semibold text-slate-500">
                                                <tr>
                                                    <th className="p-2 w-8 text-center text-slate-400">#</th>
                                                    <th className="p-2 min-w-[260px]">
                                                        <ItemDescriptionHeader
                                                            itemCount={items.length}
                                                            expandedRowsCount={Object.keys(expandedRows).length}
                                                            onToggleAll={toggleAllDescriptions}
                                                        />
                                                    </th>
                                                    <th className="p-2 w-16 text-center">Unit</th>
                                                    <th className="p-2 w-24 text-center">Sale qty</th>
                                                    <th className="p-2 w-28 text-center">Unit price</th>
                                                    <th className="p-2 w-24 text-center text-slate-800">Amount</th>
                                                    <th className="p-2 w-16 text-center text-slate-500">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100/50">
                                                {items.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="py-12 text-center bg-slate-50/50 border-b border-slate-100 border-dashed rounded-b-lg">
                                                            <div className="flex flex-col items-center justify-center text-slate-400">
                                                                <ShoppingCart size={32} className="mb-3 text-slate-300" />
                                                                <span className="text-sm font-semibold text-slate-500">No items added.</span>
                                                                <span className="text-xs mt-1 text-slate-400">Click &quot;Add Row&quot; to start building this Quotation.</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : [...items].reverse().map((item, index) => (
                                                    <React.Fragment key={item.id}>
                                                        <tr className="group hover:bg-slate-50/50 transition-colors bg-white align-middle" onClick={() => setFocusedRowId(item.id)}>
                                                            {/* Index */}
                                                            <td className="p-2 text-center text-slate-400 text-xs font-medium">{index + 1}</td>

                                                            {/* Item / Description */}
                                                            <td className="p-2">
                                                                {/* QA-FAST-ENTRY: empty rows show inline product-search input */}
                                                                {(!item.code && !item.desc) ? (
                                                                    <InlineProductSearchCell
                                                                        value={pendingFastEntryRowId === item.id ? pendingFastEntrySearch : ''}
                                                                        inputRef={(el) => {
                                                                            if (el) inlineSearchRefs.current[item.id] = el;
                                                                            else delete inlineSearchRefs.current[item.id];
                                                                        }}
                                                                        isReadOnly={isViewMode}
                                                                        onChange={(text) => {
                                                                            setPendingFastEntryRowId(item.id);
                                                                            setPendingFastEntrySearch(text);
                                                                        }}
                                                                        onOpenSelector={(text) => {
                                                                            setPendingFastEntryRowId(item.id);
                                                                            setPendingFastEntrySearch(text);
                                                                            setIsProductSelectionOpen(true);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                <ItemDescriptionCell
                                                                    item={item}
                                                                    isExpanded={expandedRows[item.id]}
                                                                    onToggleExpand={toggleRowDescription}
                                                                    onItemChange={handleItemChange}
                                                                    onFocusCode={() => { setFocusedRowId(item.id); setHighlightedIndex(0); }}
                                                                    onOpenProductSelection={!isViewMode ? () => setIsProductSelectionOpen(true) : undefined}
                                                                    onCheckStock={handleCheckItemStock}
                                                                    onOpenSettings={(item) => setSelectedAddonItem({ ...item })}
                                                                    isReadOnly={isViewMode}
                                                                    showSettings={Boolean(item.code || item.desc || item.remarks)}
                                                                />
                                                                )}
                                                            </td>

                                                            {/* Unit */}
                                                            <td className="p-2 text-center align-middle">
                                                                <div className="rounded-md border border-slate-200 bg-white inline-block px-1 py-1 min-w-[50px]">
                                                                    <select
                                                                        className="w-full bg-transparent outline-none text-center text-xs text-slate-700 appearance-none font-medium cursor-pointer"
                                                                        value={item.unit}
                                                                        onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                                                        disabled={isViewMode}
                                                                    >
                                                                        {(item.availableUnits || ['PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                                                                    </select>
                                                                </div>
                                                            </td>

                                                            {/* Qty */}
                                                            <td className="p-2 text-center align-middle">
                                                                <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[88px] mx-auto">
                                                                    <input
                                                                        id={`qty-${item.id}`}
                                                                        type="number"
                                                                        min="1"
                                                                        className="w-full bg-transparent text-center outline-none font-bold text-sm text-slate-800"
                                                                        value={item.qty === 0 ? '' : item.qty}
                                                                        onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Tab' && !e.shiftKey) {
                                                                                const priceEl = document.getElementById(`price-${item.id}`);
                                                                                if (priceEl) { e.preventDefault(); priceEl.focus(); priceEl.select?.(); }
                                                                            }
                                                                        }}
                                                                        placeholder="0"
                                                                        disabled={isViewMode}
                                                                    />
                                                                </div>
                                                            </td>

                                                            {/* Unit Price */}
                                                            <td className="p-2 text-center align-middle">
                                                                <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[104px] mx-auto">
                                                                    <input
                                                                        id={`price-${item.id}`}
                                                                        type="number"
                                                                        className="w-full bg-transparent text-center outline-none font-semibold text-sm text-slate-700"
                                                                        value={item.price === 0 ? '' : item.price}
                                                                        onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Tab' && !e.shiftKey && !isViewMode) {
                                                                                e.preventDefault();
                                                                                const newRow = createBlankQuotationItem();
                                                                                focusNextInlineSearchRef.current = newRow.id;
                                                                                setItems(prev => [...prev, newRow]);
                                                                            }
                                                                        }}
                                                                        placeholder="0.00"
                                                                        disabled={isViewMode}
                                                                    />
                                                                </div>
                                                            </td>

                                                            {/* Amount */}
                                                            <td className="p-2 text-center align-middle">
                                                                <div className="font-bold text-slate-800 text-sm">
                                                                    {item.total.toFixed(2)}
                                                                </div>
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="p-2 text-center align-middle">
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    {!isViewMode && (
                                                                        <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-red-500 border border-red-100 hover:bg-red-50 rounded transition-colors group">
                                                                            <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {/* Expanded Description Row */}
                                                        {expandedRows[item.id] && (
                                                            <tr className="bg-white">
                                                                <td></td>
                                                                <td colSpan={10} className="px-0 pb-4 pt-1">
                                                                    <div className="ml-[60px] mr-4 p-3 rounded-r-[10px] border-l-[3px] border-[#FFD700] bg-[#FFFDE7]/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                                                                        <div className="flex justify-between items-center mb-1.5">
                                                                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#B8860B] tracking-widest uppercase">
                                                                                <Menu size={10} strokeWidth={3} className="opacity-80" /> PRODUCT DESCRIPTION
                                                                            </div>
                                                                            <span className="text-[9px] text-yellow-700/50 font-medium">
                                                                                {(item.remarks || '').length} chars
                                                                            </span>
                                                                        </div>
                                                                        <textarea
                                                                            rows="1"
                                                                            className="w-full bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-yellow-700/30 resize-none font-medium leading-relaxed"
                                                                            value={item.remarks || ''}
                                                                            onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                                                            placeholder="Enter product description — auto-loaded from product master, fully editable..."
                                                                            readOnly={isViewMode}
                                                                            onInput={(e) => {
                                                                                e.target.style.height = 'auto';
                                                                                e.target.style.height = (e.target.scrollHeight) + 'px';
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}

                                            </tbody>
                                        </table>
                                    </div>
                                    {/* QA-FAST-ENTRY: Quick Entry hint bar */}
                                    <div className="mt-2 px-3 py-2 bg-blue-50/30 border border-blue-100/60 rounded-md flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold"><Zap size={11} /> Quick Entry:</span>
                                        <span>Type name →</span>
                                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Enter</kbd>
                                        <span>Select →</span>
                                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                                        <span>Qty →</span>
                                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                                        <span>Price →</span>
                                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-600">Tab</kbd>
                                        <span>New row</span>
                                        <span className="ml-auto text-slate-400">Tip: Use ↑↓ arrows to navigate items</span>
                                    </div>
                                </div>

                                {/* 4. Combined Attachments & Notes */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Attachments */}
                                    <div className="bg-white rounded-lg border border-slate-200/50 p-4 shadow-sm h-full">
                                        <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                                            <Paperclip size={14} className="text-slate-400" /> Attachments
                                        </h3>
                                        <div className="border-2 border-dashed border-slate-200/50 rounded-lg p-4 flex flex-col items-center justify-center text-center h-[calc(100%-2rem)]">
                                            <p className="text-[10px] text-slate-500 mb-2">Upload documents (Customer PO, Specs)</p>

                                            {!isViewMode && (
                                                <label className="cursor-pointer mb-2">
                                                    <span className="px-3 py-1 bg-white border border-slate-300/50 rounded text-[10px] font-bold text-slate-700 hover:bg-slate-50">Choose Files</span>
                                                    <input type="file" className="hidden" multiple onChange={handleFileUpload} />
                                                </label>
                                            )}

                                            <div className="w-full max-h-[120px] overflow-y-auto">
                                                {attachments.length === 0 ? (
                                                    <span className="text-[10px] text-slate-400">No file chosen</span>
                                                ) : (
                                                    <div className="space-y-1 text-left">
                                                        {attachments.map((file, idx) => (
                                                            <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-1.5 rounded text-[10px]">
                                                                <span className="truncate max-w-[150px] text-slate-700">{file.fileName || file.name}</span>
                                                                {!isViewMode && (
                                                                    <button onClick={() => handleRemoveAttachment(idx)} className="text-slate-400 hover:text-red-500">
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div className="bg-white rounded-lg border border-slate-200/50 p-4 shadow-sm h-full">
                                        <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                                            <FileText size={14} className="text-slate-400" /> Notes
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-semibold text-slate-500 mb-1">Notes to Customer</label>
                                                <textarea
                                                    rows="3"
                                                    value={notesToCustomer}
                                                    onChange={(e) => setNotesToCustomer(e.target.value)}
                                                    readOnly={isViewMode}
                                                    className="w-full text-xs p-2 border border-slate-300/50 rounded resize-none focus:border-yellow-400 focus:outline-none read-only:bg-slate-50 read-only:text-slate-500"
                                                    placeholder="Visible on quotation..."
                                                ></textarea>
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-semibold text-slate-500 mb-1">Internal Notes</label>
                                                <textarea
                                                    rows="3"
                                                    value={internalNotes}
                                                    onChange={(e) => setInternalNotes(e.target.value)}
                                                    readOnly={isViewMode}
                                                    className="w-full text-xs p-2 border border-slate-300/50 rounded resize-none focus:border-yellow-400 focus:outline-none read-only:bg-slate-50 read-only:text-slate-500"
                                                    placeholder="Internal use only..."
                                                ></textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div> {/* End Middle Column */}


                            {/* ======================= RIGHT COLUMN (SUMMARY & SIDEBAR) ======================= */}
                            <div className="xl:col-span-1 space-y-4">
                                {/* 5. Summary & Footer */}
                                <div className="bg-white rounded-lg border border-slate-200/50 p-4 shadow-sm mb-4 md:mb-6">
                                    <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100/50 pb-2">Quotation Summary</h3>
                                    <div className="space-y-2 text-xs" data-bb-skip-aed-symbol="true">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Gross Amount</span>
                                            <CurrencyAmount value={grossTotal} {...displayCurrencyProps} className="font-medium" />
                                        </div>
                                        <div className="flex justify-between text-red-500">
                                            <span>Item Discount</span>
                                            <span className="font-medium">- <CurrencyAmount value={totalItemDiscount} {...displayCurrencyProps} /></span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Subtotal</span>
                                            <CurrencyAmount value={subTotal} {...displayCurrencyProps} className="font-medium" />
                                        </div>
                                        <div className="flex justify-between text-slate-600 items-center">
                                            <span className="flex items-center gap-2">
                                                Bill Discount
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    disabled={isViewMode}
                                                    className="w-10 border border-slate-300/50 rounded px-1 text-center focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                                                    value={billDiscount}
                                                    onChange={(e) => setBillDiscount(Number(e.target.value))}
                                                /> %
                                            </span>
                                            <span className="font-medium">- <CurrencyAmount value={billDiscountAmount} {...displayCurrencyProps} /></span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Tax Total</span>
                                            <CurrencyAmount value={totalTax} {...displayCurrencyProps} className="font-medium" />
                                        </div>
                                        <div className="flex justify-between text-emerald-600 text-sm font-bold border-t border-slate-100/50 pt-2 mt-2">
                                            <span>Grand Total</span>
                                            <CurrencyAmount value={grandTotal} {...displayCurrencyProps} />
                                        </div>
                                    </div>

                                    {/* Warning Banner */}
                                    <div className="mt-4 bg-orange-50 border border-orange-100/50 rounded p-2 flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-orange-400" />
                                        <span className="text-[10px] text-orange-700 font-medium">Approval required for margins below 15%.</span>
                                    </div>
                                </div>


                                {/* 6. Item Availability & Price History */}
                                {/* 1. Item Availability */}
                                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm flex-1 p-4 overflow-y-auto max-h-[50vh]">
                                    <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <Box size={14} className="text-yellow-600" /> Item Availability
                                    </h3>

                                    {items.some(i => i.code) ? (
                                        <div className="space-y-2">
                                            {items.filter(i => i.code).filter((item, idx, arr) => arr.findIndex(x => x.code === item.code) === idx).map(item => {
                                                if ((item.productType || '').toUpperCase() === 'SERVICE') {
                                                    return (
                                                        <div key={item.id} className="border rounded p-2 border-blue-200 bg-blue-50">
                                                            <div className="font-semibold text-[10px] text-slate-800 truncate">{item.desc || item.code}</div>
                                                            <div className="text-[9px] text-slate-500">{item.code}</div>
                                                            <div className="mt-1 text-[10px] font-bold text-blue-700">Service — no stock tracking</div>
                                                        </div>
                                                    );
                                                }
                                                const stockRes = stockCheckResult.find(s => s.itemCode === item.code);
                                                const available = liveStockMap[item.code]?.available ?? (stockRes ? stockRes.availableQty : (item.stock || item.currentStock || 0));
                                                const reserved = liveStockMap[item.code]?.reserved ?? 0;
                                                const requested = Number(item.qty) || 0;
                                                const sufficient = available >= requested;
                                                return (
                                                    <div key={item.id} className={`border rounded p-2 ${sufficient ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                                                        <div className="font-semibold text-[10px] text-slate-800 truncate">{item.desc || item.code}</div>
                                                        <div className="text-[9px] text-slate-500 mb-1">{item.code}</div>
                                                        <div className="flex justify-between text-[10px] text-slate-600">
                                                            <span>Req: {requested}</span>
                                                            <span>Avail: <span className="font-bold">{available}</span></span>
                                                        </div>
                                                        {reserved > 0 && <div className="text-[9px] text-orange-500 mt-0.5">Reserved: {reserved}</div>}
                                                        <div className={`mt-1 text-[10px] font-bold ${sufficient ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {sufficient ? '✅ In Stock' : '❌ Insufficient'}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-slate-400 text-center mt-4">
                                            Add items to check stock.
                                        </div>
                                    )}
                                </div>

                                {/* 2. Customer Price History */}
                                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm flex-1 p-4 overflow-y-auto max-h-[50vh]">
                                    <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <History size={14} className="text-blue-500" /> Price History
                                    </h3>

                                    {focusedRowId && items.find(i => i.id === focusedRowId)?.code ? (
                                        <div className="space-y-2">
                                            <div className="text-[10px] text-slate-500 mb-2">
                                                Last 3 quotes for <span className="font-bold text-slate-700">{items.find(i => i.id === focusedRowId)?.code}</span>
                                            </div>
                                            {isPriceHistoryLoading ? (
                                                <div className="text-[10px] text-slate-400 text-center py-2">Loading history...</div>
                                            ) : priceHistory.length > 0 ? (
                                                priceHistory.map((hist, i) => (
                                                    <div key={i} className="border border-slate-100 rounded p-2 bg-slate-50">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[10px] font-bold text-slate-700">{hist.qtnNo}</span>
                                                            <span className="text-[9px] text-slate-400">{hist.qtnDate}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[10px]">
                                                            <span className="text-slate-600">Qty: {hist.quantity}</span>
                                                            <CurrencyAmount value={hist.price || 0} {...displayCurrencyProps} className="font-bold text-slate-800" />
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-slate-400 text-center py-2">No history found.</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-slate-400 text-center mt-4">
                                            Focus on an item row to see price history.
                                        </div>
                                    )}
                                </div>

                                {/* 3. Profitability Analysis */}
                                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm flex-1 p-4">
                                    <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <Info size={14} className="text-yellow-600" /> Profitability Analysis
                                    </h3>
                                    <div className="space-y-3" data-bb-skip-aed-symbol="true">
                                        <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-semibold">Total Cost</span>
                                            {(() => {
                                                const totalCost = items.reduce((sum, item) => sum + ((item.cost || 0) * (item.qty || 0)), 0);
                                                return <CurrencyAmount value={totalCost} {...displayCurrencyProps} className="font-bold text-slate-700" />;
                                            })()}
                                        </div>
                                        <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-semibold">Net Revenue</span>
                                            <CurrencyAmount value={subTotal} {...displayCurrencyProps} className="font-bold text-slate-700" />
                                        </div>
                                        <div className="flex justify-between items-center text-xs pt-1">
                                            <span className="text-slate-500 font-semibold">Margin</span>
                                            {(() => {
                                                const totalCost = items.reduce((sum, item) => sum + ((item.cost || 0) * (item.qty || 0)), 0);
                                                const margin = subTotal - totalCost;
                                                const marginPercent = subTotal > 0 ? (margin / subTotal) * 100 : 0;
                                                return (
                                                    <div className={`font-bold flex items-center gap-1.5 ${marginPercent < 15 ? 'text-orange-500' : 'text-emerald-600'}`}>
                                                        <CurrencyAmount value={margin} {...displayCurrencyProps} />
                                                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">({marginPercent.toFixed(1)}%)</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="hidden md:flex fixed bottom-0 md:left-64 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] justify-between items-center z-[60]">
                            <div className="flex items-center gap-3">
                                <div className="px-2 py-1 bg-slate-100 border border-slate-200/50 rounded-md text-[11px] font-bold text-slate-600 shadow-sm flex items-center gap-2">
                                    Status: {renderStatusBadge()}
                                </div>
                                <span className="text-[11px] font-medium text-slate-500 hidden lg:inline">Quotation No: <span className="text-slate-700 font-bold">{getQuotationNo()}</span></span>
                                {isViewMode && (
                                    <span className="px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-[11px] font-bold text-blue-700">
                                        View Only
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {status === 'Pending Approval' && (
                                    <>
                                        <button onClick={handleApprove} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-bold hover:bg-emerald-600 transition-colors shadow-sm">
                                            <Check size={14} /> Approve
                                        </button>
                                        <button onClick={handleReject} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-xs font-bold hover:bg-red-600 transition-colors shadow-sm">
                                            <X size={14} /> Reject
                                        </button>
                                    </>
                                )}

                                {status === 'Converted to SO' && (
                                    <button
                                        onClick={handleRevertToApproved}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-300 text-orange-600 rounded text-xs font-bold hover:bg-orange-50 transition-colors shadow-sm"
                                    >
                                        <RotateCcw size={14} /> Revert to Approved
                                    </button>
                                )}

                                {status === 'Approved' && (
                                    <>
                                        <button
                                            onClick={handleConvertToOrder}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                                        >
                                            <Box size={14} /> Convert to Order
                                        </button>
                                        <button
                                            onClick={handleProceedToInvoice}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 transition-colors shadow-sm"
                                        >
                                            Proceed to Invoice <ChevronRight size={14} />
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => setIsRevisionsOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors"
                                >
                                    <History size={14} /> Revisions
                                </button>

                                <button
                                    onClick={handlePrintClick}
                                    disabled={isPrinting}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                                >
                                    <Printer size={14} /> {isPrinting ? 'Printing...' : 'Print'}
                                </button>

                                {isViewMode && canEditCurrentQuotation && (
                                    <button
                                        onClick={handleSwitchToEditMode}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                        <Edit size={14} /> Edit Quotation
                                    </button>
                                )}

                                {editingId && (
                                    <button
                                        onClick={handleOpenEmailModal}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded text-xs font-bold hover:bg-amber-50 transition-colors"
                                    >
                                        <Mail size={14} /> Send Email
                                    </button>
                                )}

                                <button
                                    onClick={() => setIsReviseModalOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors"
                                >
                                    <Edit size={14} /> Revise Quotation
                                </button>

                                {!isViewMode && (
                                    <button
                                        onClick={handleSaveDraft}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                        <Save size={14} /> Save Draft
                                    </button>
                                )}

                                {!isViewMode && status === 'Draft' && (
                                    <button onClick={handleConfirm} className="flex items-center gap-1.5 px-5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded text-xs font-bold hover:from-emerald-700 hover:to-emerald-600 transition-all shadow-md transform hover:-translate-y-0.5">
                                        Confirm <ChevronRight size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* FLOATING MOBILE ACTIONS */}
                {
                    activeTab === 'create' && !isViewMode && (
                        <MobileFloatingActions
                            status={status}
                            onSaveDraft={handleSaveDraft}
                            onConfirm={handleConfirm}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onRevise={() => setIsReviseModalOpen(true)}
                        />
                    )
                }

                {/* --- TOAST NOTIFICATION --- */}
                {
                    showToast && (
                        <div className="fixed bottom-24 right-6 bg-white border border-slate-200 shadow-xl rounded-lg p-4 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300 z-[120] max-w-sm">
                            {(() => {
                                const toastMessageText = typeof toastMessage === 'string' ? toastMessage : '';
                                const toastTitle = toastMessageText.includes('rejected') || toastMessageText.includes('Rejected')
                                    ? 'Quotation Rejected'
                                    : toastMessageText.includes('Approved')
                                        ? 'Quotation Approved'
                                        : toastType === 'info'
                                            ? 'Notice'
                                            : 'Quotation confirmed';

                                return (
                                    <>
                                        <div className={`rounded-full p-1 text-white ${toastType === 'info' ? 'bg-slate-800' : 'bg-black'}`}>
                                            {toastType === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} />}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-800">{toastTitle}</h4>
                                            <p className="text-xs text-slate-500">{toastMessage}</p>
                                        </div>
                                    </>
                                );
                            })()}
                            <button onClick={() => setShowToast(false)} className="ml-auto text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>
                    )
                }

                {/* --- REVISIONS SIDEBAR --- */}
                {
                    isRevisionsOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/20 z-[90]" onClick={() => setIsRevisionsOpen(false)}></div>
                            <div className="fixed top-0 left-0 w-80 h-full bg-white border-r border-slate-200 shadow-2xl z-[100] animate-in slide-in-from-left duration-300">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-800">Revision & Follow-up History</h3>
                                    <button onClick={() => setIsRevisionsOpen(false)}><X size={18} className="text-slate-400" /></button>
                                </div>
                                <div className="p-4 space-y-4 overflow-y-auto h-[calc(100vh-60px)]">

                                    {/* Dynamic Revisions List */}
                                    {currentRevisions.length > 0 ? (
                                        currentRevisions.map((rev) => (
                                            <div key={rev.revId} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                                                <div className="flex justify-between mb-2">
                                                    <span className="text-xs font-bold text-slate-700">{rev.qtnNoDisplay}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rev.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>{rev.status}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 mb-2">{formatDisplayDate(rev.date)}</div>
                                                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded mb-3">
                                                    <span className="font-semibold">Follow-up:</span> {rev.note}
                                                </p>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setIsRevisionsOpen(false);
                                                            setCompareRevision(rev);
                                                        }}
                                                        className="px-3 py-1 border border-slate-200 rounded text-[10px] font-medium hover:bg-slate-50"
                                                    >
                                                        Compare
                                                    </button>
                                                    {!isViewMode && (
                                                        <button
                                                            onClick={() => handleRestoreRevision(rev)}
                                                            className="flex items-center gap-1 px-3 py-1 bg-yellow-400 text-slate-900 rounded text-[10px] font-bold hover:bg-yellow-500"
                                                        >
                                                            <RotateCcw size={10} /> Restore
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-slate-400 text-xs mt-10">
                                            No revisions found for this quotation.
                                        </div>
                                    )}

                                </div>
                            </div>
                        </>
                    )
                }

                {/* --- REVISE MODAL --- */}
                {
                    isReviseModalOpen && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-800">Revise Quotation & Log Follow-up</h3>
                                    <button onClick={() => setIsReviseModalOpen(false)}><X size={18} className="text-slate-400" /></button>
                                </div>
                                <div className="p-6">
                                    <p className="text-xs text-slate-500 mb-4">
                                        This will create a snapshot of the current quotation and allow you to make new changes.
                                    </p>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Follow-up note (required)</label>
                                    <textarea
                                        rows="3"
                                        value={revisionNote}
                                        onChange={(e) => setRevisionNote(e.target.value)}
                                        className="w-full text-sm border border-emerald-500 rounded-md p-2 focus:outline-none ring-1 ring-emerald-500"
                                        placeholder="Eg: Customer requested better price on item X and extended validity."
                                    ></textarea>
                                </div>
                                <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                                    <button onClick={() => setIsReviseModalOpen(false)} className="px-4 py-2 border border-slate-200 rounded text-xs font-medium hover:bg-slate-50">Cancel</button>
                                    <button
                                        onClick={handleSaveRevision}
                                        disabled={!revisionNote.trim()}
                                        className="px-4 py-2 bg-yellow-400 rounded text-xs font-bold text-slate-900 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Save Revision
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* --- EMAIL MODAL --- */}
                {isEmailModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <Mail size={18} className="text-amber-500" />
                                    <h3 className="font-bold text-slate-800 text-base">Send Quotation Email</h3>
                                </div>
                                <button onClick={() => setIsEmailModalOpen(false)}>
                                    <X size={18} className="text-slate-400 hover:text-slate-600" />
                                </button>
                            </div>

                            {/* To + Subject fields */}
                            <div className="px-5 py-4 border-b border-slate-100 space-y-3 bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs font-semibold text-slate-500 w-14 shrink-0">To</label>
                                    <input
                                        type="email"
                                        value={emailTo}
                                        onChange={(e) => setEmailTo(e.target.value)}
                                        placeholder="customer@example.com"
                                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-amber-400 bg-white"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="text-xs font-semibold text-slate-500 w-14 shrink-0">Subject</label>
                                    <input
                                        type="text"
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-amber-400 bg-white"
                                    />
                                </div>
                            </div>

                            {/* Email Preview */}
                            <div className="flex-1 overflow-hidden px-5 py-3">
                                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Email Preview</p>
                                <iframe
                                    srcDoc={emailPreviewHtml || '<div style="padding:24px;font-family:Arial;color:#888;font-size:13px">Generating preview…</div>'}
                                    title="Email Preview"
                                    className="w-full h-full rounded border border-slate-200"
                                    style={{ minHeight: '380px' }}
                                    sandbox="allow-same-origin"
                                />
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
                                <button
                                    onClick={() => setIsEmailModalOpen(false)}
                                    className="px-4 py-2 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSendEmail}
                                    disabled={emailSending || !emailTo.trim()}
                                    className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded text-xs font-bold transition-colors"
                                >
                                    <Mail size={13} />
                                    {emailSending ? 'Sending...' : 'Send Email'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ✅ STOCK AVAILABILITY MODAL (New) */}
                <StockAvailabilityModal
                    isOpen={isItemStockModalOpen}
                    onClose={() => setIsItemStockModalOpen(false)}
                    selectedStockItem={selectedStockItem}
                />

                {/* Product Selector Modal — self-fetching, server-side search */}
                <ProductSelector
                    isOpen={!isViewMode && isProductSelectionOpen}
                    onClose={() => { setIsProductSelectionOpen(false); setPendingFastEntryRowId(null); }}
                    onSelect={handleAddSingleProduct}
                    onInlineAdd={handleFastEntryAdd}
                    initialSearch={pendingFastEntrySearch}
                    title="Select Items from Products / Services"
                    actionLabel="Add to Quotation"
                    mode="sales"
                    salesItemPricePolicy={salesSettings?.salesItemPricePolicy}
                />

                {/* --- PRINT TEMPLATE PICKER MODAL --- */}
                {
                    isPrintModalOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setIsPrintModalOpen(false)}></div>
                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] bg-white rounded-xl shadow-2xl z-50 overflow-hidden">
                                {/* Header */}
                                <div className="flex justify-between items-start p-5 pb-3">
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-base">Choose Print Template</h3>
                                        <p className="text-xs text-slate-400 mt-1">Select a template for printing or generating PDF</p>
                                    </div>
                                    <button onClick={() => setIsPrintModalOpen(false)} className="text-slate-400 hover:text-slate-600 mt-0.5">
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Template Options */}
                                <div className="px-5 pb-2">
                                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                                        <input
                                            type="checkbox"
                                            checked={printOptions.printWithImages}
                                            onChange={(e) => setPrintOptions(prev => ({ ...prev, printWithImages: e.target.checked }))}
                                            className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                        />
                                        <span className="text-sm font-medium text-slate-700">Include Item Images</span>
                                    </label>
                                </div>
                                <div className="px-5 pb-5 space-y-2">
                                    {['Classic', 'Minimal', 'Premium', 'Watermark'].map((tmpl) => (
                                        <div
                                            key={tmpl}
                                            className="flex items-center justify-between px-4 py-3 border border-slate-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50/30 cursor-pointer transition-all group"
                                            onClick={() => handlePrintQuotation(tmpl)}
                                        >
                                            <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">{tmpl}</span>
                                            <button className="p-1.5 rounded-md bg-slate-100 text-slate-500 group-hover:bg-yellow-400 group-hover:text-slate-900 transition-colors">
                                                <Printer size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )
                }
                {/* ITEM ADD-ONS MODAL — BB-026: shared component */}
                <ItemAddOnsModal
                    item={selectedAddonItem}
                    onClose={() => setSelectedAddonItem(null)}
                    onSave={(updated) => {
                        setItems(items.map(i => i.id === updated.id ? updated : i));
                        setSelectedAddonItem(null);
                    }}
                    isReadOnly={isViewMode}
                />

                {/* --- COMPARE REVISIONS MODAL --- */}
                {(() => {
                    if (!compareRevision) return null;
                    // Compute a row-by-row diff so each side can be color-coded:
                    //   added   = present in current, missing from revision (green, left)
                    //   removed = present in revision, missing from current (red,  right)
                    //   changed = both sides, but qty/price/disc/tax/foc differ      (amber)
                    //   unchanged = identical numeric fields (neutral)
                    const numeric = (v) => parseFloat(v) || 0;
                    const keyOf = (it) => (it.itemCode || it.code || it.description || it.desc || '').trim().toLowerCase();
                    const sigOf = (qty, price, disc, tax, foc) =>
                        `${numeric(qty)}|${numeric(price)}|${numeric(disc)}|${numeric(tax)}|${numeric(foc)}`;
                    const revIndex = new Map();
                    (compareRevision.items || []).forEach(it => {
                        revIndex.set(keyOf(it), sigOf(it.quantity ?? it.qty, it.price, it.discount ?? it.disc, it.taxRate ?? it.tax, it.foc));
                    });
                    const curIndex = new Map();
                    items.forEach(it => {
                        curIndex.set(keyOf(it), sigOf(it.qty, it.price, it.disc, it.tax, it.foc));
                    });
                    const statusOnLeft = (it) => {
                        const k = keyOf(it);
                        if (!revIndex.has(k)) return 'added';
                        return revIndex.get(k) === curIndex.get(k) ? 'unchanged' : 'changed';
                    };
                    const statusOnRight = (it) => {
                        const k = keyOf(it);
                        if (!curIndex.has(k)) return 'removed';
                        return curIndex.get(k) === revIndex.get(k) ? 'unchanged' : 'changed';
                    };
                    const tint = {
                        added:     'border-emerald-300 bg-emerald-50',
                        removed:   'border-red-300 bg-red-50',
                        changed:   'border-amber-300 bg-amber-50',
                        unchanged: 'border-slate-100 bg-slate-50'
                    };
                    const tag = {
                        added:     <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white">Added</span>,
                        removed:   <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600 text-white">Removed</span>,
                        changed:   <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">Changed</span>,
                        unchanged: null
                    };
                    return (
                        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-slate-50 flex flex-col w-full h-full max-w-7xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden shadow-black/20 border border-slate-200">

                                {/* Header */}
                                <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                                            <History className="text-blue-600" size={20} /> Compare Revisions
                                        </h3>
                                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                            Comparing current draft/version against <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded">{compareRevision.qtnNoDisplay}</span>
                                        </p>
                                        <div className="flex gap-3 mt-2 text-[10px]">
                                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-300 border border-emerald-400"></span>Added</span>
                                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-300 border border-red-400"></span>Removed</span>
                                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-300 border border-amber-400"></span>Changed</span>
                                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300"></span>Unchanged</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setCompareRevision(null)}
                                        className="p-2 bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 rounded-full transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Content Body - Side by Side */}
                                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

                                    {/* LEFT: Current Version */}
                                    <div className="flex-1 flex flex-col h-full bg-white relative">
                                        <div className="p-3 bg-emerald-50/50 border-b border-emerald-100/50 flex justify-between items-center shrink-0">
                                            <div className="font-bold text-emerald-800 text-sm flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Current Version
                                            </div>
                                            {renderStatusBadge(status)}
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                            {items.map((item, idx) => {
                                                const st = statusOnLeft(item);
                                                return (
                                                <div key={`curr-${item.id}`} className={`p-3 rounded-lg border transition-colors ${tint[st]}`}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                                            <span>{idx + 1}. {item.desc || item.name || 'Unnamed Item'}</span>
                                                            {tag[st]}
                                                        </div>
                                                        <CurrencyAmount value={item.total || 0} {...displayCurrencyProps} className="font-black text-slate-800 text-sm" />
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-slate-500">
                                                        <div className="flex gap-4">
                                                            <span>Qty: <span className="font-bold text-slate-700">{item.qty} {item.unit}</span></span>
                                                            <span>Price: <span className="font-bold text-slate-700">{(parseFloat(item.price) || 0).toFixed(2)}</span></span>
                                                        </div>
                                                        <div className="flex gap-3 text-[10px] font-medium opacity-80">
                                                            {parseFloat(item.disc) > 0 && <span className="text-orange-600">Disc: {item.disc}%</span>}
                                                            {parseFloat(item.tax) > 0 && <span className="text-blue-600">Tax: {item.tax}%</span>}
                                                            {parseFloat(item.foc) > 0 && <span className="text-emerald-600">FOC: {item.foc}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
                                            <div className="flex justify-between items-center font-black text-lg text-slate-800">
                                                <span>Total</span>
                                                <CurrencyAmount
                                                    value={items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0)}
                                                    {...displayCurrencyProps}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT: Selected Revision */}
                                    <div className="flex-1 flex flex-col h-full bg-slate-50/50 relative">
                                        <div className="p-3 bg-blue-50/50 border-b border-blue-100/50 flex justify-between items-center shrink-0">
                                            <div className="font-bold text-blue-800 text-sm flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                Revision: {compareRevision.qtnNoDisplay}
                                            </div>
                                            <div className="scale-90 origin-right">
                                                {renderStatusBadge(compareRevision.status)}
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                            {/* Notes / Meta info for revision */}
                                            {compareRevision.note && (
                                                <div className="mb-4 p-3 bg-white border border-yellow-200 rounded-lg shadow-sm text-xs text-slate-600">
                                                    <strong className="text-yellow-700 block mb-1">Revision Follow-up Note:</strong>
                                                    {compareRevision.note}
                                                </div>
                                            )}

                                            {compareRevision.items && compareRevision.items.length > 0 ? (
                                                compareRevision.items.map((item, idx) => {
                                                    const st = statusOnRight(item);
                                                    return (
                                                    <div key={`rev-item-${idx}`} className={`p-3 rounded-lg border transition-colors shadow-sm ${tint[st]}`}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                                                <span>{idx + 1}. {item.description || item.desc || item.name || 'Unnamed Item'}</span>
                                                                {tag[st]}
                                                            </div>
                                                            <CurrencyAmount
                                                                value={parseFloat(item.lineTotal || item.total) || 0}
                                                                {...displayCurrencyProps}
                                                                className="font-black text-slate-800 text-sm"
                                                            />
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                                            <div className="flex gap-4">
                                                                <span>Qty: <span className="font-bold text-slate-700">{item.quantity || item.qty} {item.unit}</span></span>
                                                                <span>Price: <span className="font-bold text-slate-700">{(parseFloat(item.price) || 0).toFixed(2)}</span></span>
                                                            </div>
                                                            <div className="flex gap-3 text-[10px] font-medium opacity-80">
                                                                {parseFloat(item.discount || item.disc) > 0 && <span className="text-orange-600">Disc: {item.discount || item.disc}%</span>}
                                                                {parseFloat(item.taxRate || item.tax) > 0 && <span className="text-blue-600">Tax: {item.taxRate || item.tax}%</span>}
                                                                {parseFloat(item.foc) > 0 && <span className="text-emerald-600">FOC: {item.foc}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="text-center p-8 text-slate-400 text-sm">No items found in this revision snapshot.</div>
                                            )}
                                        </div>
                                        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                            <div className="flex justify-between items-center font-black text-lg text-slate-800">
                                                <span>Total</span>
                                                <CurrencyAmount value={compareRevision.total || 0} {...displayCurrencyProps} />
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    );
                })()}

            </main >
        </div >
    );
};

export default Quotations;
