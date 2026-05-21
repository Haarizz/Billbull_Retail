import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/axiosConfig';
import {
    ShoppingCart,
    Search,
    Plus,
    MoreHorizontal,
    ChevronDown,
    User,
    Calendar,
    Save,
    Printer,
    Mail,
    MessageCircle,
    CheckCircle2,
    AlertCircle,
    FileText,
    CreditCard,
    Trash2,
    DollarSign,
    Edit,
    ArrowLeft,
    X, // ✅ Added X for Modal Close
    Box, // ✅ Added Box for product image placeholder
    Menu,
    ChevronUp,
    ChevronRight,
    ArrowDown,
    ArrowUp,
    Package,
    TrendingUp,
    History,
    Zap
} from 'lucide-react';

// ✅ DYNAMIC UI COMPONENTS



import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllSalesOrders } from '../../api/salesorderApi';
import { getAllProformas } from '../../api/proformaApi';
import { getDeliveryNotes, getPickingNotes, getUninvoicedDNsForCustomer } from '../../api/deliveryNoteApi';
import { getEmployeeNames } from '../../api/employeeApi';
import {
    getAllSalesInvoices,
    saveSalesInvoice,
    getNextInvoiceNumber,
    recordInvoicePayment,
    getItemPriceHistory,
    updateInvoiceStatus,
    getCustomerOutstanding
} from '../../api/salesInvoiceApi';
import { getSalesSettings } from '../../api/salesSettingsApi';
import { getStockAvailability } from '../../api/stockAvailabilityApi';
import { formatDisplayDate } from '../../utils/dateUtils';
import { pickSalesItemPrice } from '../../utils/salesPricing';
import { getWarehouses } from '../../api/warehouseApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import { getDefaultProductUnit, resolveUnitAmount } from '../../utils/unitPricing';
import { summarizeSalesItems } from '../../utils/documentSummaryUtils';
import billBullLogo from '../../assets/billBullLogo.png';
import { generateDocFilename } from '../../utils/filenameUtils';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import CurrencyAmount, { CurrencySymbol } from '../../components/CurrencyAmount';
import { formatCurrencyDisplay } from '../../utils/countryCurrencyOptions';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const SALES_INVOICE_COLUMNS = [
    { header: 'Invoice No', key: 'invoiceNumber', width: 15 },
    { header: 'Date', key: 'invoiceDate', width: 12 },
    { header: 'Customer', key: 'customerName', width: 25 },
    { header: 'Pay Mode', key: 'paymentMode', width: 12 },
    { header: 'Total', key: 'invoiceTotal', width: 15 },
    { header: 'Paid', key: 'amountPaid', width: 15 },
    { header: 'Balance', key: 'balance', width: 15 },
    { header: 'Status', key: 'status', width: 12 }
];

// ✅ PRODUCT SELECTOR
const firstPresentNumber = (...values) => {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return 0;
};

const calculateLineAmounts = ({ qty, price, disc, tax }) => {
    const quantity = Number(qty) || 0;
    const unitPrice = Number(price) || 0;
    const discountPercent = Number(disc) || 0;
    const taxPercent = Number(tax) || 0;
    const gross = quantity * unitPrice;
    const discountAmount = gross * (discountPercent / 100);
    const taxable = Math.max(0, gross - discountAmount);
    const taxAmt = taxable * (taxPercent / 100);
    const net = taxable + taxAmt;

    return { gross, taxAmt, net };
};

import ProductSelector from '../../components/ProductSelector';

// ✅ CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';
import CustomerShippingPanel from '../../components/CustomerShippingPanel';
import { resolveCustomer, hydrateCustomerFromSource } from '../../utils/customerResolution';
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';

// ✅ STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';
import BatchSelectionModal from '../../components/BatchSelectionModal';

// ✅ ITEM ADD-ONS MODAL (BB-026)
import ItemAddOnsModal from '../../components/ItemAddOnsModal';

// ✅ SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';
import { usePermissions } from '../../context/PermissionContext';

// ==========================================
// COMPONENT
// ==========================================

const SalesInvoice = () => {
    const { canAction } = usePermissions();
    const canManualBatchSelect = canAction('batch_manual_select', 'edit');
    const { print } = usePrintDocument();
    const { company } = useCompany();
    const { defaultBranch } = useBranch();
    const invoiceCurrency = company?.currency || company?.currencySymbol || 'AED';
    const location = useLocation();
    const fromQuotationHandled = useRef(false);
    const fromSOHandled = useRef(false);
    const fromDNHandled = useRef(false);
    const [activeTab, setActiveTab] = useState('list');
    const [isLoading, setIsLoading] = useState(false);

    // --- DATA LIST STATES ---
    const [invoicesList, setInvoicesList] = useState([]);
    const [salesSettings, setSalesSettings] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterPayMode, setFilterPayMode] = useState('All');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });

    const filteredInvoices = useMemo(() => {
        let data = [...invoicesList];

        if (filterStatus !== 'All') {
            data = data.filter(inv => {
                if (filterStatus === 'Draft') return inv.status === 'DRAFT';
                if (filterStatus === 'Posted') return inv.status === 'POSTED';
                if (filterStatus === 'Confirmed') return inv.status === 'CONFIRMED';
                if (filterStatus === 'PartiallyPaid') return inv.status === 'PARTIALLY_PAID';
                if (filterStatus === 'Paid') return inv.status === 'PAID';
                if (filterStatus === 'Overdue') return inv.status === 'OVERDUE';
                if (filterStatus === 'Cancelled') return inv.status === 'CANCELLED';
                return true;
            });
        }

        if (filterPayMode !== 'All') {
            data = data.filter(inv => {
                const mode = inv.paymentMode || 'Cash';
                return mode === filterPayMode;
            });
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            data = data.filter(inv =>
                (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(lower)) ||
                (inv.customerName && inv.customerName.toLowerCase().includes(lower)) ||
                (inv.customerCode && inv.customerCode.toLowerCase().includes(lower)) ||
                (inv.linkedSalesOrder && inv.linkedSalesOrder.toLowerCase().includes(lower)) ||
                (inv.linkedDeliveryNote && inv.linkedDeliveryNote.toLowerCase().includes(lower)) ||
                (inv.linkedProforma && inv.linkedProforma.toLowerCase().includes(lower))
            );
        }

        if (sortConfig.key) {
            data.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (sortConfig.key === 'invoiceTotal' || sortConfig.key === 'amountPaid' || sortConfig.key === 'balance') {
                    aValue = Number(aValue || 0);
                    bValue = Number(bValue || 0);
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
    }, [invoicesList, searchTerm, filterStatus, filterPayMode, sortConfig]);

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const [customersList, setCustomersList] = useState([]);
    const [salesOrdersList, setSalesOrdersList] = useState([]);
    const [proformaList, setProformaList] = useState([]);
    const [deliveryNotesList, setDeliveryNotesList] = useState([]);
    const [warehousesList, setWarehousesList] = useState([]);

    // ✅ Invoice ID for tracking edit vs create
    const [invoiceId, setInvoiceId] = useState(null);

    // --- FORM STATES ---
    const [status, setStatus] = useState('Draft');
    const [salesType, setSalesType] = useState('STANDARD_FLOW'); // Backend mapping
    const [invoiceTypeUI, setInvoiceTypeUI] = useState('Direct Sale'); // UI Dropdown state
    const [invoiceNo, setInvoiceNo] = useState('INV-2024-0005');
    const [invoiceDate, setInvoiceDate] = useState('2026-01-21');
    const [deliveryDate, setDeliveryDate] = useState(''); // Due Date
    const [reference, setReference] = useState('');

    // Linking
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isCustomerOpen, setIsCustomerOpen] = useState(false);
    const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
    const [linkedSO, setLinkedSO] = useState('');
    const [linkedDN, setLinkedDN] = useState('');
    const [linkedPI, setLinkedPI] = useState('');
    const [linkedQuotation, setLinkedQuotation] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');

    // Payment Details
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paymentTerms, setPaymentTerms] = useState('Immediate');
    const [salesperson, setSalesperson] = useState('');
    const [employeesList, setEmployeesList] = useState([]);
    const [branch, setBranch] = useState(defaultBranch?.name || '');
    const createBlankInvoiceItem = () => ({
        id: Date.now() + Math.random(),
        code: '',
        image: '',
        name: '',
        unit: 'PCS',
        qty: 0,
        price: 0,
        disc: 0,
        tax: 5,
        taxAmt: 0,
        gross: 0,
        net: 0,
        cost: 0,
        gp: 0,
        warehouseId: defaultBranch?.defaultWarehouseId || (warehousesList.length > 0 ? warehousesList[0].id : ''),
        binId: null,
        binCode: '',
        batchControlled: false,
        fefoEnabled: true,
        minExpiryDaysForSale: 0,
        baseRequiredQuantity: 0,
        batchSelectedQuantity: 0,
        batchSelectionMode: 'AUTO_FEFO',
        batchSelections: []
    });

    const mapServerInvoiceItem = (i, fallbackId = Date.now() + Math.random()) => ({
        id: fallbackId,
        invoiceItemId: i.id || i.invoiceItemId || null,
        salesOrderItemId: i.salesOrderItemId || null,
        code: i.itemCode || i.code || '',
        image: i.image || '',
        name: i.itemName || i.name || '',
        desc: i.description || i.desc || '',
        sku: i.sku || '',
        brand: i.brand || i.brandName || '',
        detailedDesc: i.detailedDesc || '',
        localName: i.localName || '',
        unit: i.unit || 'PCS',
        qty: i.quantity ?? i.qty ?? 0,
        price: i.price || 0,
        disc: i.discount || i.disc || 0,
        tax: i.taxRate || i.tax || 5,
        taxAmt: i.taxAmount || i.taxAmt || 0,
        gross: i.grossAmount || i.gross || 0,
        net: i.netAmount || i.net || 0,
        cost: i.cost || 0,
        gp: 0,
        foc: i.foc || 0,
        warehouseId: i.warehouseId || defaultBranch?.defaultWarehouseId || '',
        binId: i.binId || null,
        binCode: i.binCode || '',
        barcode: i.barcode || '',
        availableUnits: i.availableUnits || ['PCS'],
        batchControlled: Boolean(i.batchControlled ?? i.isBatch ?? i.product?.isBatch),
        fefoEnabled: i.fefoEnabled != null ? Boolean(i.fefoEnabled) : true,
        minExpiryDaysForSale: Number(i.minExpiryDaysForSale) || 0,
        baseRequiredQuantity: Number(i.baseRequiredQuantity) || 0,
        batchSelectedQuantity: Number(i.batchSelectedQuantity) || 0,
        batchSelectionMode: i.batchSelectionMode || 'AUTO_FEFO',
        batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : []
    });

    // Items
    const [items, setItems] = useState([
        { id: 1, code: '', image: '', name: '', unit: 'PCS', qty: 0, price: 0, disc: 0, tax: 5, taxAmt: 0, gross: 0, net: 0, cost: 0, gp: 0 }
    ]);
    const [billDiscount, setBillDiscount] = useState(0);

    // ✅ PRODUCT SELECTOR STATE
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
    const [selectedAddonItem, setSelectedAddonItem] = useState(null); // BB-026
    const [batchSelectionTarget, setBatchSelectionTarget] = useState(null);

    // Payment Calculation State
    const [amountCollected, setAmountCollected] = useState(0);
    const [invoiceBalance, setInvoiceBalance] = useState(null); // server-side remaining balance
    const [customerOutstanding, setCustomerOutstanding] = useState(0); // total outstanding before this invoice
    const [pickingNoteVerification, setPickingNoteVerification] = useState(null);

    // ✅ MODAL STATES
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [modalPaymentDate, setModalPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [modalPaymentAmount, setModalPaymentAmount] = useState(0);
    const [modalPaymentRef, setModalPaymentRef] = useState('');
    const [modalPaymentMode, setModalPaymentMode] = useState('Cash');
    const [modalBankAccount, setModalBankAccount] = useState('');
    const [modalChequeDate, setModalChequeDate] = useState(new Date().toISOString().split('T')[0]);
    const [modalNotes, setModalNotes] = useState('');
    const [bankAccountOptions, setBankAccountOptions] = useState([]);

    // Stock Check Modal
    const [selectedStockItem, setSelectedStockItem] = useState(null);
    const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);

    // ✅ UN-INVOICED DN MODAL STATES
    const [uninvoicedDNs, setUninvoicedDNs] = useState([]);
    const [isDNModalOpen, setIsDNModalOpen] = useState(false);
    const [selectedDNRows, setSelectedDNRows] = useState([]);
    const [isGeneratedFromDN, setIsGeneratedFromDN] = useState(false);

    // --- ITEM CONTEXT / INTELLIGENCE ---
    const [focusedItemCode, setFocusedItemCode] = useState(null);
    const [focusedItemStock, setFocusedItemStock] = useState(null);
    const [focusedItemPriceHistory, setFocusedItemPriceHistory] = useState([]);
    const [isContextLoading, setIsContextLoading] = useState(false);
    const [liveStockMap, setLiveStockMap] = useState({});

    const resolveInvoiceTypeUI = ({
        linkedSalesOrder = '',
        linkedDeliveryNote = '',
        linkedProforma = '',
        salesType: resolvedSalesType = 'STANDARD_FLOW'
    } = {}) => {
        if (linkedDeliveryNote) return 'Against Delivery Note';
        if (linkedProforma) return 'Against Proforma Invoice';
        if (linkedSalesOrder) return 'Against Sales Order';
        return resolvedSalesType === 'DIRECT_SALE' ? 'Direct Sale' : 'Direct Sale';
    };

    // ✅ GLOBAL SHORTCUTS
    const normalizedInvoiceStatus = String(status || '').toUpperCase();
    const isReadOnlyInvoice = Boolean(invoiceId) && !['', 'DRAFT', 'CANCELLED'].includes(normalizedInvoiceStatus);

    useShortcuts({
        'ctrl+p': (e) => {
            if (activeTab === 'create' && !isReadOnlyInvoice) setIsProductSelectorOpen(prev => !prev);
        },
        'ctrl+s': (e) => {
            if (activeTab === 'create') handleSave('Draft');
        },
        'alt+c': (e) => {
            if (activeTab === 'create' && !isReadOnlyInvoice && !isGeneratedFromDN) setIsCustomerSearchOpen(prev => !prev);
        }
    });

    const fetchItemContext = async (itemCode) => {
        if (!itemCode) return;

        setIsContextLoading(true);
        setFocusedItemCode(itemCode);
        try {
            const [stockData, priceData] = await Promise.all([
                getStockAvailability(itemCode),
                getItemPriceHistory(itemCode)
            ]);
            setFocusedItemStock(stockData);
            setFocusedItemPriceHistory(priceData || []);
            if (stockData?.locations) {
                const locs = stockData.locations;
                setLiveStockMap(prev => ({
                    ...prev,
                    [itemCode]: {
                        available: locs.reduce((s, l) => s + (l.available || 0), 0),
                        reserved: locs.reduce((s, l) => s + (l.reserved || 0), 0),
                    }
                }));
            }
        } catch (err) {
            console.error("Failed to fetch item context", err);
        } finally {
            setIsContextLoading(false);
        }
    };

    // --- SIDEBAR COMPONENTS ---
    const StockSidebarPanel = ({ stock, isLoading, itemCode }) => {
        const locations = stock?.locations || [];
        const totalAvailable = locations.reduce((sum, loc) => sum + (loc.available || 0), 0);
        const totalReserved = locations.reduce((sum, loc) => sum + (loc.reserved || 0), 0);

        if (!itemCode) return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-700 font-bold text-sm">
                    <Package size={18} className="text-[#F5C742]" />
                    Stock & Reservations
                </div>
                <div className="text-center py-4 text-slate-400 text-[11px] italic">
                    Select an item to view stock availability
                </div>
            </div>
        );

        return (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all duration-300">
                <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                        <Package size={14} className="text-[#F5C742]" />
                        Stock & Reservations
                    </div>
                    {isLoading && <div className="animate-spin h-3.5 w-3.5 border-2 border-[#F5C742] border-t-transparent rounded-full" />}
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex justify-between items-end border-b border-slate-100 pb-3">
                        <div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">On Hand</div>
                            <div className="text-2xl font-black text-slate-800 leading-none">{totalAvailable + totalReserved}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Reserved</div>
                            <div className="text-sm font-bold text-orange-500 leading-none">{totalReserved}</div>
                        </div>
                    </div>
                    <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                        {locations.length > 0 ? locations.map((loc, i) => (
                            <div key={i} className="flex justify-between items-center text-[11px] group">
                                <span className="text-slate-500 group-hover:text-slate-700 transition-colors truncate max-w-[120px]" title={loc.name}>
                                    {loc.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    {loc.reserved > 0 && <span className="text-[9px] text-orange-400 font-medium">(Res: {loc.reserved})</span>}
                                    <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                        {loc.available}
                                    </span>
                                </div>
                            </div>
                        )) : <div className="text-center py-2 text-slate-400 text-[10px]">No warehouse stock found</div>}
                    </div>
                    {totalAvailable > 0 && (
                        <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Available Net</span>
                            <span className="text-sm font-black text-emerald-600">{totalAvailable}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const PriceHistorySidebarPanel = ({ history, isLoading, itemCode }) => {
        if (!itemCode) return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-700 font-bold text-sm">
                    <History size={18} className="text-[#F5C742]" />
                    Item Price History
                </div>
                <div className="text-center py-4 text-slate-400 text-[11px] italic">
                    Focus an item to see last sales rates
                </div>
            </div>
        );

        return (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all duration-300">
                <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                        <TrendingUp size={14} className="text-[#F5C742]" />
                        Item Price History
                    </div>
                    {isLoading && <div className="animate-spin h-3.5 w-3.5 border-2 border-[#F5C742] border-t-transparent rounded-full" />}
                </div>
                <div className="max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#FBFBFD] text-slate-400 uppercase font-bold sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-2 border-b border-slate-100">Customer</th>
                                <th className="px-4 py-2 border-b border-slate-100 text-right">Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {history.length > 0 ? history.map((h, i) => (
                                <tr key={i} className="hover:bg-slate-50/80 transition-colors group cursor-default">
                                    <td className="px-4 py-2.5">
                                        <div className="font-bold text-slate-700 truncate w-36 group-hover:text-blue-600 transition-colors" title={h.customerName}>{h.customerName}</div>
                                        <div className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium">
                                            <span className="text-slate-300">#</span>{h.invoiceNo} <span className="text-slate-200">|</span> {formatDisplayDate(h.date)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-black text-slate-700">
                                        <CurrencyAmount value={h.rate} currency={invoiceCurrency} />
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="2" className="px-4 py-8 text-center text-slate-400 italic font-medium">No previous sales records</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {history.length > 0 && (
                    <div className="px-4 py-1.5 bg-slate-50/50 border-t border-slate-100 text-center">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Viewing last {history.length} transactions</span>
                    </div>
                )}
            </div>
        );
    };

    // ==========================================
    // 1. FETCH MASTER DATA
    // ==========================================
    useEffect(() => {
        const loadData = async () => {
            try {
                const [custData, soData, piData, dnData, invData, whsData, settingsData, bankAccData, empData] = await Promise.all([
                    getAllCustomers(),
                    getAllSalesOrders(),
                    getAllProformas(),
                    getDeliveryNotes(),
                    getAllSalesInvoices(),
                    getWarehouses(),
                    getSalesSettings().catch(() => null),
                    api.get('/api/ledger/accounts/bank-accounts').then(r => r.data).catch(() => []),
                    getEmployeeNames().catch(() => [])
                ]);
                setBankAccountOptions(Array.isArray(bankAccData) ? bankAccData : []);
                setEmployeesList(Array.isArray(empData) ? empData : []);

                let validCustomers = Array.isArray(custData) ? custData : [];
                const hasWalkin = validCustomers.some(c =>
                    c.name?.toLowerCase().includes('walkin') || c.name?.toLowerCase().includes('walk-in')
                );
                if (!hasWalkin) {
                    validCustomers = [{
                        id: 'WALKIN-ID', code: 'WALKIN', name: 'Walk-in Customer',
                        mobile: '', phone: '', creditStatus: 'Good', groupType: 'Walk-In', address: '', trn: ''
                    }, ...validCustomers];
                }
                setCustomersList(validCustomers);
                setSalesOrdersList(Array.isArray(soData) ? soData : []);
                setProformaList(Array.isArray(piData) ? piData : []);
                setDeliveryNotesList(Array.isArray(dnData) ? dnData : []);
                setInvoicesList(Array.isArray(invData) ? invData : []);
                setWarehousesList(Array.isArray(whsData) ? whsData : []);
                if (settingsData) setSalesSettings(settingsData);

            } catch (err) {
                console.error("Failed to load master data", err);
            }
        };
        loadData();
    }, []);

    // Auto-fill items' warehouseId once warehouses / default branch are available
    useEffect(() => {
        const defaultWhId = defaultBranch?.defaultWarehouseId || (warehousesList.length > 0 ? warehousesList[0].id : null);
        if (!defaultWhId) return;
        setItems(prev => prev.map(item => ({
            ...item,
            warehouseId: item.warehouseId || defaultWhId,
        })));
    }, [defaultBranch, warehousesList]);

    useEffect(() => {
        if (!invoiceId && defaultBranch?.name) {
            setBranch(prev => prev || defaultBranch.name);
        }
    }, [defaultBranch?.name, invoiceId]);

    // Pre-fill form from Quotation navigation state
    useEffect(() => {
        const fromQtn = location.state?.fromQuotation;
        if (!fromQtn || fromQuotationHandled.current) return;
        if (customersList.length === 0) return; // wait until customers are loaded

        fromQuotationHandled.current = true;

        const matched = resolveCustomer(
            {
                customerId: fromQtn.customerId,
                customerCode: fromQtn.customerCode,
                customerName: fromQtn.customerName ?? fromQtn.customer,
            },
            customersList
        );

        const mappedItems = (fromQtn.items || [])
            .filter(i => i.code || i.desc)
            .map((i, idx) => ({
                id: Date.now() + idx,
                salesOrderItemId: i.id,
                code: i.code || '',
                name: i.desc || i.name || '',
                image: i.image || i.primaryImage || '',
                unit: i.unit || 'PCS',
                qty: Number(i.qty) || 0,
                price: Number(i.price) || 0,
                disc: Number(i.disc) || 0,
                tax: Number(i.tax) || 5,
                taxAmt: Number(i.taxAmt) || 0,
                gross: Number(i.total) || 0,
                net: Number(i.total) || 0,
                cost: 0
            }));

        getNextInvoiceNumber()
            .then(nextNo => setInvoiceNo(nextNo))
            .catch(() => { });

        const resolvedCustomer = matched || { name: fromQtn.customer, code: '', id: null };
        setSelectedCustomer(resolvedCustomer);

        // Pre-fill paths bypass handleSelectCustomer, so the customer's prior
        // outstanding never gets fetched — "Previous Outstanding" stays at 0
        // until the user re-picks the customer. Fetch it here too. (mirrors
        // the fromSalesOrder fix.)
        if (resolvedCustomer?.code) {
            getCustomerOutstanding(resolvedCustomer.code)
                .then(d => setCustomerOutstanding(d?.outstanding || 0))
                .catch(() => setCustomerOutstanding(0));
        } else {
            setCustomerOutstanding(0);
        }

        // Resolve shipping address: prefer passed-through → customer master
        if (fromQtn.shippingAddress) {
            setShippingAddress(fromQtn.shippingAddress);
        } else if (matched) {
            const _defaultAddr = (matched.savedAddresses || []).find(a => a.isDefault);
            const _resolvedAddr = _defaultAddr
                ? [_defaultAddr.address1, _defaultAddr.address2, _defaultAddr.city, _defaultAddr.country].filter(Boolean).join(', ')
                : (matched.defaultShippingAddress || matched.shippingAddress || matched.billingAddress || matched.address || '');
            setShippingAddress(_resolvedAddr);
        }

        setItems(mappedItems.length > 0 ? mappedItems : [{ id: Date.now(), code: '', name: '', unit: 'PCS', qty: 0, price: 0, disc: 0, tax: 5, taxAmt: 0, gross: 0, net: 0, cost: 0 }]);
        setBillDiscount(Number(fromQtn.billDiscount) || 0);
        setReference(fromQtn.qtnNo || '');
        setLinkedQuotation(fromQtn.qtnNo || '');
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setStatus('Draft');
        setActiveTab('create');

        // Clear state so back-navigation doesn't re-trigger
        window.history.replaceState({}, document.title);
    }, [customersList, location.state]);

    // Pre-fill form from Sales Order navigation state
    useEffect(() => {
        const fromSO = location.state?.fromSalesOrder;
        if (!fromSO || fromSOHandled.current) return;
        if (customersList.length === 0) return;

        fromSOHandled.current = true;

        const matched = resolveCustomer(
            {
                customerId: fromSO.customerId,
                customerCode: fromSO.customerCode,
                customerName: fromSO.customerName ?? fromSO.customer,
            },
            customersList
        );

        const mappedItems = (fromSO.items || [])
            .filter(i => i.code || i.desc)
            .map((i, idx) => ({
                id: Date.now() + idx,
                salesOrderItemId: i.id,
                code: i.code || '',
                name: i.desc || i.name || '',
                image: i.image || '',
                unit: i.unit || 'PCS',
                qty: Number(i.qty) || 0,
                price: Number(i.price) || 0,
                disc: Number(i.disc) || 0,
                tax: Number(i.tax) || 5,
                taxAmt: Number(i.taxAmt) || 0,
                gross: Number(i.total) || 0,
                net: Number(i.total) || 0,
                cost: Number(i.cost) || 0,
                // Inherit batch picks from the SO so the invoice editor shows
                // "Batches N/N" instead of "0/N", and the auto-DN can reuse them.
                batchControlled: Boolean(i.batchControlled),
                fefoEnabled: i.fefoEnabled != null ? Boolean(i.fefoEnabled) : true,
                minExpiryDaysForSale: Number(i.minExpiryDaysForSale) || 0,
                batchSelectedQuantity: Number(i.batchSelectedQuantity) || 0,
                batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [],
                warehouseId: i.warehouseId || null,
                binId: i.binId || null,
            }));

        getNextInvoiceNumber()
            .then(nextNo => setInvoiceNo(nextNo))
            .catch(() => { });

        const resolvedCustomer = matched || { name: fromSO.customer, code: fromSO.customerCode || '', id: null };
        setSelectedCustomer(resolvedCustomer);

        // QA-035 follow-up: pre-fill paths (fromSalesOrder / fromDeliveryNote)
        // bypass handleSelectCustomer, so the customer's prior outstanding was
        // never fetched — Previous Outstanding stayed at 0 until the user
        // manually re-picked the customer. Fetch it here too.
        if (resolvedCustomer?.code) {
            getCustomerOutstanding(resolvedCustomer.code)
                .then(d => setCustomerOutstanding(d?.outstanding || 0))
                .catch(() => setCustomerOutstanding(0));
        } else {
            setCustomerOutstanding(0);
        }

        // Resolve shipping address: prefer passed-through → customer master
        if (fromSO.shippingAddress) {
            setShippingAddress(fromSO.shippingAddress);
        } else if (matched) {
            const _defaultAddr = (matched.savedAddresses || []).find(a => a.isDefault);
            const _resolvedAddr = _defaultAddr
                ? [_defaultAddr.address1, _defaultAddr.address2, _defaultAddr.city, _defaultAddr.country].filter(Boolean).join(', ')
                : (matched.defaultShippingAddress || matched.shippingAddress || matched.billingAddress || matched.address || '');
            setShippingAddress(_resolvedAddr);
        }

        setItems(mappedItems.length > 0 ? mappedItems : [{ id: Date.now(), code: '', name: '', unit: 'PCS', qty: 0, price: 0, disc: 0, tax: 5, taxAmt: 0, gross: 0, net: 0, cost: 0 }]);
        setInvoiceTypeUI('Against Sales Order');
        setSalesType('STANDARD_FLOW');
        setLinkedSO(fromSO.soNumber || '');
        setLinkedPI(fromSO.linkedProforma || '');
        setBillDiscount(Number(fromSO.billDiscount) || 0);
        setReference(fromSO.linkedQuotation || fromSO.linkedProforma || fromSO.soNumber || '');
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setStatus('Draft');
        setActiveTab('create');

        window.history.replaceState({}, document.title);
    }, [customersList, location.state]);

    // Pre-fill form from Delivery Note navigation state (Convert to Invoice flow)
    useEffect(() => {
        const fromDN = location.state?.fromDeliveryNote;
        if (!fromDN || fromDNHandled.current) return;
        if (deliveryNotesList.length === 0 || customersList.length === 0) return;

        const dn = deliveryNotesList.find(d =>
            (fromDN.id && d.id === fromDN.id) || (fromDN.dnNumber && d.dnNumber === fromDN.dnNumber)
        );
        if (!dn) return;

        fromDNHandled.current = true;

        getNextInvoiceNumber()
            .then(nextNo => setInvoiceNo(nextNo))
            .catch(() => { });

        setInvoiceTypeUI('Against Delivery Note');
        setSalesType('STANDARD_FLOW');
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setStatus('Draft');
        setReference(dn.dnNumber);
        setActiveTab('create');

        // Reuse the existing DN-to-invoice mapper (pulls SO pricing, sets items, customer, etc.)
        handleDNChange(dn.dnNumber);

        window.history.replaceState({}, document.title);
    }, [customersList, deliveryNotesList, location.state]);

    // Fetch invoices separately for refresh
    const fetchInvoices = async () => {
        try {
            const data = await getAllSalesInvoices();
            setInvoicesList(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to fetch invoices", err);
        }
    };

    const verifyPickingNoteAfterSave = async (savedInvoice) => {
        if (!savedInvoice?.id) {
            return null;
        }

        const expectedStatus =
            salesSettings?.salesMode === 'FAST_SALE' || salesType === 'DIRECT_SALE'
                ? 'DELIVERED'
                : 'DRAFT';

        try {
            const pickingNotes = await getPickingNotes();
            const generatedNote = pickingNotes.find(note =>
                note?.sourceDocumentType === 'SALES_INVOICE' &&
                (note?.sourceDocumentId === savedInvoice.id
                    || note?.linkedSalesInvoiceNumber === savedInvoice.invoiceNumber)
            );

            if (!generatedNote) {
                const message = `Picking note verification failed. No Picking document was found for invoice ${savedInvoice.invoiceNumber}.`;
                setPickingNoteVerification({ kind: 'error', message });
                return null;
            }

            if (generatedNote.status !== expectedStatus) {
                const message = `Picking note created, but status is ${generatedNote.status} instead of expected ${expectedStatus} for invoice ${savedInvoice.invoiceNumber}.`;
                setPickingNoteVerification({ kind: 'error', message });
                return generatedNote;
            }

            setPickingNoteVerification({
                kind: 'success',
                message: `Picking note ${generatedNote.dnNumber} verified as ${generatedNote.status}.`
            });
            return generatedNote;
        } catch (error) {
            console.error("Failed to verify Picking note", error);
            setPickingNoteVerification({
                kind: 'error',
                message: `Unable to verify the generated Picking note for invoice ${savedInvoice.invoiceNumber}.`
            });
            return null;
        }
    };

    // Add state for expandable rows
    const [expandedRows, setExpandedRows] = useState({});

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

    // ==========================================
    // CALCULATIONS
    // ==========================================
    const invoiceSummary = useMemo(() => summarizeSalesItems(items, billDiscount), [items, billDiscount]);
    const subTotal = invoiceSummary.grossTotal;
    const taxableSubTotal = invoiceSummary.subTotal;
    const totalDiscount = invoiceSummary.itemDiscountTotal;
    const billDiscountAmount = invoiceSummary.billDiscountAmount;
    const totalTax = invoiceSummary.tax;
    const netTotal = invoiceSummary.grandTotal;
    const totalCost = items.reduce((acc, i) => acc + ((Number(i.qty) || 0) * (Number(i.cost) || 0)), 0);
    const totalProfit = taxableSubTotal - totalCost;
    const marginPercent = taxableSubTotal > 0 ? (totalProfit / taxableSubTotal) * 100 : 0;

    // Calculate Outstanding
    const previousOutstanding = customerOutstanding;
    const newTotalOutstanding = (previousOutstanding + netTotal) - amountCollected;

    // ==========================================
    // HANDLERS
    // ==========================================
    const handleCreateNew = async (type = 'STANDARD_FLOW') => {
        setInvoiceId(null); // Reset ID for new creation
        setPickingNoteVerification(null);
        try {
            const nextNumber = await getNextInvoiceNumber();
            setInvoiceNo(nextNumber);
        } catch (err) {
            setInvoiceNo(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        }
        setStatus('Draft');
        setSalesType(type);
        setInvoiceTypeUI(resolveInvoiceTypeUI({ salesType: type }));
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setDeliveryDate('');
        // BB-027: Default to Walk-In Customer for new invoices
        const walkIn = customersList.find(c =>
            c.name?.toLowerCase().includes('walk-in') || c.name?.toLowerCase().includes('walkin')
        );
        setSelectedCustomer(walkIn || null);
        setLinkedSO('');
        setLinkedDN('');
        setLinkedPI('');
        setLinkedQuotation('');
        setIsGeneratedFromDN(false);
        setPaymentMode('Cash');
        setPaymentTerms('Immediate');
        setSalesperson('John Doe');
        setBranch(defaultBranch?.name || '');
        setItems([{ id: Date.now(), code: '', name: '', unit: 'PCS', qty: 0, price: 0, disc: 0, tax: 5, taxAmt: 0, gross: 0, net: 0, cost: 0 }]);
        setBillDiscount(0);
        setAmountCollected(0);
        setInvoiceBalance(null);
        setCustomerOutstanding(0);
        setActiveTab('create');
    };

    const handleSelectCustomer = async (cust) => {
        if (isReadOnlyInvoice) return;
        if (isGeneratedFromDN) return; // Prevent changing customer if locked

        setSelectedCustomer(cust);
        const _defaultAddr = (cust.savedAddresses || []).find(a => a.isDefault);
        const _resolvedAddr = _defaultAddr
            ? [_defaultAddr.address1, _defaultAddr.address2, _defaultAddr.city, _defaultAddr.country].filter(Boolean).join(', ')
            : (cust.defaultShippingAddress || cust.shippingAddress || cust.billingAddress || cust.address || '');
        setShippingAddress(_resolvedAddr);
        setIsCustomerOpen(false);
        setIsCustomerSearchOpen(false);

        // Fetch real outstanding balance for this customer (QA-035)
        if (cust.code) {
            try {
                const outstandingData = await getCustomerOutstanding(cust.code);
                setCustomerOutstanding(outstandingData.outstanding || 0);
            } catch (e) {
                setCustomerOutstanding(0);
            }
        } else {
            setCustomerOutstanding(0);
        }

        // Fetch Uninvoiced DNs via axios (not raw fetch)
        try {
            const dns = await getUninvoicedDNsForCustomer(cust.code);
            if (dns && dns.length > 0) {
                setUninvoicedDNs(dns);
                setSelectedDNRows([]);
                setIsDNModalOpen(true);
            }
        } catch (e) {
            console.error("Failed to fetch uninvoiced DNs", e);
        }
    };

    // --- UNINVOICED DN MODAL HANDLERS ---
    const handleSelectAllDNs = () => {
        if (selectedDNRows.length === uninvoicedDNs.length) {
            setSelectedDNRows([]);
        } else {
            setSelectedDNRows(uninvoicedDNs.map(dn => dn.id));
        }
    };

    const handleToggleDNRow = (id) => {
        if (selectedDNRows.includes(id)) {
            setSelectedDNRows(selectedDNRows.filter(rowId => rowId !== id));
        } else {
            setSelectedDNRows([...selectedDNRows, id]);
        }
    };

    const handleProceedWithSelectedDNs = () => {
        if (selectedDNRows.length === 0) {
            alert("Please select at least one Delivery Note.");
            return;
        }

        const selectedDocs = uninvoicedDNs.filter(dn => selectedDNRows.includes(dn.id));

        // Find links
        const dnNumbers = selectedDocs.map(dn => dn.dnNumber).join(', ');
        const soNumbers = [...new Set(selectedDocs.map(dn => dn.salesOrderNo).filter(Boolean))].join(', ');

        setLinkedDN(dnNumbers);
        if (soNumbers && !linkedSO) setLinkedSO(soNumbers);
        const linkedSoDiscounts = [...new Set(selectedDocs.map(dn => dn.salesOrderNo).filter(Boolean))]
            .map(soNumber => salesOrdersList.find(s => s.soNumber === soNumber))
            .filter(Boolean);
        if (linkedSoDiscounts.length === 1) {
            setBillDiscount(Number(linkedSoDiscounts[0].billDiscount) || 0);
        }

        // Merge Items with Composite Key (productCode + unit + warehouse + price if available)
        const combinedItemsMap = new Map();

        selectedDocs.forEach(dn => {
            if (dn.items && dn.items.length > 0) {
                // Determine if we have pricing from SO
                let linkedSOData = null;
                if (dn.salesOrderNo) {
                    linkedSOData = salesOrdersList.find(s => s.soNumber === dn.salesOrderNo);
                }

                dn.items.forEach(dnItem => {
                    let price = 0;
                    let disc = 0;
                    let tax = 5;
                    let cost = 0;

                    if (linkedSOData && linkedSOData.items) {
                        const soItem = linkedSOData.items.find(si => si.itemCode === dnItem.itemCode);
                        if (soItem) {
                            price = Number(soItem.price) || 0;
                            disc = Number(soItem.discount) || 0;
                            tax = Number(soItem.taxRate) || 5;
                            cost = Number(soItem.cost) || 0;
                        }
                    }

                    // Composite Key Strategy
                    const compositeKey = `${dnItem.itemCode}_${dnItem.unit}_${price}_${dn.warehouseId || ''}`;
                    const qty = Number(dnItem.currentQty) || Number(dnItem.orderedQty) || 0;

                    if (combinedItemsMap.has(compositeKey)) {
                        const existing = combinedItemsMap.get(compositeKey);
                        existing.qty += qty;
                        // For FOC we could do existing.foc += Number(dnItem.foc) if available
                    } else {
                        combinedItemsMap.set(compositeKey, {
                            id: Date.now() + Math.random(),
                            code: dnItem.itemCode || '',
                            image: dnItem.primaryImage || dnItem.image || dnItem.thumbnailUrl || dnItem.imageUrl || '',
                            name: dnItem.description || '',
                            unit: dnItem.unit || 'PCS',
                            qty: qty,
                            price: price,
                            cost: cost,
                            disc: disc,
                            tax: tax,
                            taxAmt: 0, // Recalculated below
                            gross: 0,
                            net: 0,
                            foc: Number(dnItem.foc) || 0,
                            warehouseId: dn.warehouseId || '',
                            gp: 0
                        });
                    }
                });
            }
        });

        // Calculate rows for the merged items
        const mergedArray = Array.from(combinedItemsMap.values()).map(item => calculateRow(item));

        setItems(mergedArray);
        setIsGeneratedFromDN(true);
        setIsDNModalOpen(false);
    };

    const handleProceedManually = () => {
        setIsDNModalOpen(false);
    };

    // ===========================================
    // AUTO-FILL FROM LINKED DOCUMENTS
    // ===========================================
    const handleSOChange = (soNumber) => {
        if (isReadOnlyInvoice) return;
        setLinkedSO(soNumber);
        if (!soNumber) {
            setBillDiscount(0);
            return;
        }

        const so = salesOrdersList.find(s => s.soNumber === soNumber);
        if (so) {
            setBillDiscount(Number(so.billDiscount) || 0);
            // Resolve full customer master so the panel renders phone/balance/TRN/savedAddresses.
            const matched = resolveCustomer(
                { customerCode: so.customerCode, customerName: so.customerName },
                customersList
            );
            {
                const resolved = matched || { code: so.customerCode, name: so.customerName };
                setSelectedCustomer(resolved);
                if (resolved?.code) {
                    getCustomerOutstanding(resolved.code)
                        .then(d => setCustomerOutstanding(d?.outstanding || 0))
                        .catch(() => setCustomerOutstanding(0));
                } else {
                    setCustomerOutstanding(0);
                }
            }

            // Auto-fill items from SO
            if (so.items && so.items.length > 0) {
                setItems(so.items.map(i => ({
                    id: Date.now() + Math.random(),
                    salesOrderItemId: i.id,
                    code: i.itemCode || '',
                    image: i.primaryImage || i.image || i.thumbnailUrl || i.imageUrl || '',
                    name: i.description || '',
                    unit: i.unit || 'PCS',
                    qty: Number(i.quantity) || 0,
                    price: Number(i.price) || 0,
                    cost: Number(i.cost) || 0,
                    disc: Number(i.discount) || 0,
                    tax: Number(i.taxRate) || 5,
                    taxAmt: Number(i.taxAmount) || 0,
                    gross: Number(i.quantity) * Number(i.price),
                    net: Number(i.lineTotal) || 0,
                    gp: 0
                })));
            }
        }
    };

    const handleDNChange = (dnNumber) => {
        if (isReadOnlyInvoice) return;
        setLinkedDN(dnNumber);
        if (!dnNumber) {
            setBillDiscount(0);
            return;
        }

        const dn = deliveryNotesList.find(d => d.dnNumber === dnNumber);
        if (dn) {
            const matched = resolveCustomer(
                { customerCode: dn.customerCode, customerName: dn.customerName },
                customersList
            );
            {
                const resolved = matched || { code: dn.customerCode, name: dn.customerName };
                setSelectedCustomer(resolved);
                if (resolved?.code) {
                    getCustomerOutstanding(resolved.code)
                        .then(d => setCustomerOutstanding(d?.outstanding || 0))
                        .catch(() => setCustomerOutstanding(0));
                } else {
                    setCustomerOutstanding(0);
                }
            }

            // Auto-fill SO if linked
            if (dn.salesOrderNo) {
                setLinkedSO(dn.salesOrderNo);

                // Get pricing from the linked Sales Order
                const linkedSO = salesOrdersList.find(s => s.soNumber === dn.salesOrderNo);

                if (linkedSO && linkedSO.items && linkedSO.items.length > 0) {
                    setBillDiscount(Number(linkedSO.billDiscount) || 0);
                    // Stock lines come from the DN (with delivered qty); service
                    // lines come from the SO (since they're never on the DN — see
                    // DeliveryNoteService.mapToEntity QA-001 filter). The customer
                    // still needs to be billed for both halves on one invoice.
                    const dnStockItems = dn.items.map(dnItem => {
                        const soItem = linkedSO.items.find(si =>
                            (dnItem.salesOrderItemId && si.id === dnItem.salesOrderItemId)
                            || (dnItem.sourceLineId && si.id === dnItem.sourceLineId)
                            || si.itemCode === dnItem.itemCode);

                        const qty = Number(dnItem.currentQty) || Number(dnItem.orderedQty) || 0;
                        const price = firstPresentNumber(dnItem.price, soItem?.price);
                        const disc = firstPresentNumber(dnItem.disc, dnItem.discount, soItem?.discount);
                        const tax = firstPresentNumber(dnItem.tax, dnItem.taxRate, soItem?.taxRate, 5);
                        const cost = firstPresentNumber(dnItem.cost, soItem?.cost);
                        const { gross, taxAmt, net } = calculateLineAmounts({ qty, price, disc, tax });

                        return {
                            id: Date.now() + Math.random(),
                            salesOrderItemId: dnItem.salesOrderItemId || soItem?.id || null,
                            code: dnItem.itemCode || '',
                            image: dnItem.primaryImage || dnItem.image || dnItem.thumbnailUrl || dnItem.imageUrl || '',
                            name: dnItem.description || '',
                            desc: dnItem.description || '',
                            unit: dnItem.unit || 'PCS',
                            qty: qty,
                            price: price,
                            cost: cost,
                            disc: disc,
                            tax: tax,
                            taxAmt: taxAmt,
                            gross,
                            net: net,
                            gp: 0,
                            binId: dnItem.binId || null,
                            productType: (soItem?.productType || dnItem.productType || 'STOCK').toUpperCase(),
                            batchControlled: Boolean(dnItem.batchControlled),
                            fefoEnabled: dnItem.fefoEnabled != null ? Boolean(dnItem.fefoEnabled) : true,
                            minExpiryDaysForSale: Number(dnItem.minExpiryDaysForSale) || 0,
                            baseRequiredQuantity: Number(dnItem.baseRequiredQuantity) || 0,
                            batchSelectedQuantity: Number(dnItem.batchSelectedQuantity) || 0,
                            batchSelectionMode: dnItem.batchSelectionMode || 'AUTO_FEFO',
                            batchSelections: Array.isArray(dnItem.batchSelections) ? dnItem.batchSelections : []
                        };
                    });

                    // QA-001: append SO service lines that aren't on the DN.
                    const dnCodes = new Set(dn.items.map(i => i.itemCode));
                    const soServiceLines = linkedSO.items
                        .filter(si => (si.productType || '').toUpperCase() === 'SERVICE'
                                      && !dnCodes.has(si.itemCode))
                        .map(si => {
                            const qty = Number(si.quantity) || 0;
                            const price = Number(si.price) || 0;
                            const disc = Number(si.discount) || 0;
                            const tax = Number(si.taxRate) || 5;
                            const cost = Number(si.cost) || 0;
                            const { gross, taxAmt, net } = calculateLineAmounts({ qty, price, disc, tax });
                            return {
                                id: Date.now() + Math.random(),
                                salesOrderItemId: si.id || null,
                                code: si.itemCode || '',
                                image: si.image || '',
                                name: si.itemName || si.description || '',
                                desc: si.description || si.itemName || '',
                                unit: si.unit || 'PCS',
                                qty, price, cost, disc, tax, taxAmt, gross, net,
                                gp: 0,
                                binId: null,
                                productType: 'SERVICE',
                                batchControlled: false,
                                fefoEnabled: true,
                                minExpiryDaysForSale: 0,
                                baseRequiredQuantity: 0,
                                batchSelectedQuantity: 0,
                                batchSelectionMode: 'AUTO_FEFO',
                                batchSelections: []
                            };
                        });

                    setItems([...dnStockItems, ...soServiceLines]);
                    setIsGeneratedFromDN(true);
                    return; // Exit early since we got pricing from SO
                }
            }

            // Fallback: Auto-fill items from DN pricing when no SO is linked.
            if (dn.items && dn.items.length > 0) {
                setItems(dn.items.map(i => {
                    const qty = Number(i.currentQty) || Number(i.orderedQty) || 0;
                    const price = firstPresentNumber(i.price);
                    const disc = firstPresentNumber(i.disc, i.discount);
                    const tax = firstPresentNumber(i.tax, i.taxRate, 5);
                    const cost = firstPresentNumber(i.cost);
                    const { gross, taxAmt, net } = calculateLineAmounts({ qty, price, disc, tax });

                    return {
                        id: Date.now() + Math.random(),
                        salesOrderItemId: i.salesOrderItemId || null,
                        code: i.itemCode || '',
                        image: i.primaryImage || i.image || i.thumbnailUrl || i.imageUrl || '',
                        name: i.description || '',
                        desc: i.description || '',
                        unit: i.unit || 'PCS',
                        qty,
                        price,
                        cost,
                        disc,
                        tax,
                        taxAmt,
                        gross,
                        net,
                        gp: 0,
                        binId: i.binId || null,
                        batchControlled: Boolean(i.batchControlled),
                        fefoEnabled: i.fefoEnabled != null ? Boolean(i.fefoEnabled) : true,
                        minExpiryDaysForSale: Number(i.minExpiryDaysForSale) || 0,
                        baseRequiredQuantity: Number(i.baseRequiredQuantity) || 0,
                        batchSelectedQuantity: Number(i.batchSelectedQuantity) || 0,
                        batchSelectionMode: i.batchSelectionMode || 'AUTO_FEFO',
                        batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : []
                    };
                }));
                setIsGeneratedFromDN(true);
            }
        }
    };

    const handlePIChange = (piNumber) => {
        setLinkedPI(piNumber);
        if (!piNumber) {
            setBillDiscount(0);
            return;
        }

        const pi = proformaList.find(p => p.piNumber === piNumber || p.proformaNo === piNumber);
        if (pi) {
            const matched = resolveCustomer(
                { customerCode: pi.customerCode, customerName: pi.customerName },
                customersList
            );
            {
                const resolved = matched || { code: pi.customerCode, name: pi.customerName };
                setSelectedCustomer(resolved);
                if (resolved?.code) {
                    getCustomerOutstanding(resolved.code)
                        .then(d => setCustomerOutstanding(d?.outstanding || 0))
                        .catch(() => setCustomerOutstanding(0));
                } else {
                    setCustomerOutstanding(0);
                }
            }

            // Auto-fill SO if linked
            if (pi.salesOrderNo) {
                setLinkedSO(pi.salesOrderNo);
            }
            setBillDiscount(Number(pi.billDiscount) || 0);

            // Auto-fill items from PI
            if (pi.items && pi.items.length > 0) {
                setItems(pi.items.map(i => ({
                    id: Date.now() + Math.random(),
                    salesOrderItemId: i.salesOrderItemId || null,
                    code: i.itemCode || '',
                    image: i.image || '',
                    desc: i.description || '',
                    name: i.description || '',
                    unit: i.unit || 'PCS',
                    qty: Number(i.quantity) || 0,
                    price: Number(i.price) || 0,
                    cost: 0,
                    disc: 0,
                    tax: Number(i.taxPercent) || 5,
                    taxAmt: 0,
                    gross: Number(i.quantity) * Number(i.price),
                    net: Number(i.lineTotal) || 0,
                    gp: 0
                })));
            }
        }
    };

    const calculateRow = (item) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const focQty = Number(item.foc) || 0;
        const discPercent = Number(item.disc) || 0;
        const taxPercent = Number(item.tax) || 0;
        const costVal = Number(item.cost) || 0;

        const grossAmount = price * qty;
        let focDeduction = 0;

        if (focQty > 0 && item.focUnit && item.unitConversions) {
            const sellingUnit = item.unit;
            const focUnit = item.focUnit;

            if (sellingUnit === focUnit) {
                focDeduction = price * focQty;
            } else {
                const focConversion = item.unitConversions[focUnit] || 1;
                const sellingConversion = item.unitConversions[sellingUnit] || 1;
                const focInBaseUnit = focQty * focConversion;
                const focInSellingUnit = focInBaseUnit / sellingConversion;
                focDeduction = price * focInSellingUnit;
            }
        }

        const preDiscountAmount = Math.max(0, grossAmount - focDeduction);
        const discountAmount = preDiscountAmount * (discPercent / 100);
        const taxableAmount = preDiscountAmount - discountAmount;
        const taxAmount = taxableAmount * (taxPercent / 100);
        const netAmount = taxableAmount + taxAmount;

        const salesExTax = taxableAmount;
        const totalCost = qty * costVal;
        const profit = salesExTax - totalCost;
        const gpPercent = salesExTax > 0 ? (profit / salesExTax) * 100 : 0;

        return {
            ...item,
            qty,
            price,
            foc: focQty,
            disc: discPercent,
            tax: taxPercent,
            taxAmt: taxAmount,
            gross: grossAmount,
            net: netAmount,
            gp: gpPercent
        };
    };

    const handleItemChange = (id, field, value) => {
        if (isReadOnlyInvoice) return;
        setItems(items.map(item => {
            if (item.id === id) {
                let updatedItem = { ...item, [field]: value };
                // BB-025: Do not auto-compute cost from price; keep existing cost value

                // ✅ If unit is being changed, recalculate price based on conversion
                if (field === 'unit' && item.unitConversions) {
                    const newUnit = value;
                    updatedItem.price = resolveUnitAmount({
                        targetUnit: newUnit,
                        amountMap: item.unitPrices,
                        unitConversions: item.unitConversions,
                        currentUnit: item.unit,
                        currentAmount: item.price,
                        fallbackAmount: item.retailPrice ?? item.sellingPrice ?? item.price
                    });

                    // BB-025: Do not auto-compute cost from price on unit change
                }

                updatedItem = calculateRow(updatedItem);
                return updatedItem;
            }
            return item;
        }));
    };

    // ✅ PRODUCT SELECTOR HANDLER
    const handleAddSingleProduct = (product) => {
        if (isReadOnlyInvoice) return;
        const defaultUnit = getDefaultProductUnit(product);
        // Use explicit null/undefined checks so that a master price of 0 does not
        // fall through to a sellingPrice from a different data path.
        // Master price is driven by the configured Sales Item Price Policy
        // (RETAIL / MAX_SALE / MIN_SALE) from Sales Settings. The picker
        // falls back to retail → selling → 0 when the configured field is
        // missing on this product, so item-add never produces a zero by
        // surprise.
        const masterPrice = pickSalesItemPrice(product, salesSettings?.salesItemPricePolicy);
        const price = resolveUnitAmount({
            targetUnit: defaultUnit,
            amountMap: product.unitPrices,
            unitConversions: product.unitConversions,
            fallbackAmount: masterPrice
        });
        const disc = parseFloat(product.maxDiscount) || 0;
        const tax = parseFloat(product.salesTax) || 5;
        // Only carry through cost if the master explicitly has a non-null value
        const rawCost = product.cost != null ? parseFloat(product.cost) : NaN;
        const cost = !isNaN(rawCost) ? rawCost : 0;

        const rawItem = {
            id: Date.now() + Math.random(),
            code: product.code || product.itemCode || '',
            barcode: product.barcode || '',
            image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
            name: product.name || '',
            desc: product.shortDesc || product.description || '',
            sku: product.sku || '',
            brand: product.brandName || product.brand || '',
            detailedDesc: product.detailedDesc || '',
            localName: product.localName || '',
            unit: defaultUnit,
            qty: 1,
            price: price,
            foc: 0,
            focUnit: defaultUnit,
            availableUnits: product.availableUnits || ['PCS'],
            unitConversions: product.unitConversions || {},
            unitPrices: product.unitPrices || {},
            retailPrice: masterPrice,
            sellingPrice: masterPrice,
            disc: disc,
            tax: tax,
            taxAmt: 0,
            gross: 0,
            net: 0,
            cost: cost,
            gp: 0,
            remarks: product.description || '',
            warehouseId: defaultBranch?.defaultWarehouseId || (warehousesList.length > 0 ? warehousesList[0].id : ''),
            // QA-001: SERVICE products can never be batch-controlled (no inventory).
            productType: (product.productType || 'STOCK').toUpperCase(),
            batchControlled: (product.productType || '').toUpperCase() !== 'SERVICE'
                && Boolean(product.batchControlled ?? product.isBatch ?? product.batch),
            fefoEnabled: product.fefoEnabled != null ? Boolean(product.fefoEnabled) : true,
            minExpiryDaysForSale: Number(product.minExpiryDaysForSale) || 0,
            batchSelectedQuantity: 0,
            batchSelections: []
        };

        const newItem = calculateRow(rawItem);

        // ✅ Trigger sidebar fetch immediately
        if (newItem.code) {
            fetchItemContext(newItem.code);
        }

        setItems(prev => {
            const hasData = prev.some(i => i.code || i.name);
            return hasData ? [...prev, newItem] : [newItem];
        });

        setIsProductSelectorOpen(false); // ✅ Close modal after adding
    };

    const handleFastEntryAdd = (product, qty, price, disc) => {
        if (isReadOnlyInvoice) return;
        const defaultUnit = getDefaultProductUnit(product);
        const tax = parseFloat(product.salesTax) || 5;
        const cost = product.cost != null ? parseFloat(product.cost) : 0;
        const rawItem = {
            id: Date.now() + Math.random(),
            code: product.code || '',
            barcode: product.barcode || '',
            image: product.primaryImage || product.image || '',
            name: product.name || '',
            desc: product.shortDesc || product.description || '',
            unit: defaultUnit,
            qty,
            price,
            foc: 0,
            focUnit: defaultUnit,
            availableUnits: product.availableUnits || ['PCS'],
            unitConversions: product.unitConversions || {},
            unitPrices: product.unitPrices || {},
            retailPrice: price,
            sellingPrice: price,
            disc,
            tax,
            taxAmt: 0,
            gross: 0,
            net: 0,
            cost,
            gp: 0,
            remarks: product.description || '',
            warehouseId: defaultBranch?.defaultWarehouseId || (warehousesList.length > 0 ? warehousesList[0].id : ''),
            batchControlled: Boolean(product.batchControlled ?? product.isBatch ?? product.batch),
            fefoEnabled: product.fefoEnabled != null ? Boolean(product.fefoEnabled) : true,
            minExpiryDaysForSale: Number(product.minExpiryDaysForSale) || 0,
            batchSelectedQuantity: 0,
            batchSelections: []
        };
        const newItem = calculateRow(rawItem);
        if (newItem.code) fetchItemContext(newItem.code);
        setItems(prev => {
            const hasData = prev.some(i => i.code || i.name);
            return hasData ? [...prev, newItem] : [newItem];
        });
    };

    const handleAddItem = () => {
        if (isReadOnlyInvoice) return;
        setItems([...items, createBlankInvoiceItem()]);
    };

    const handleDeleteItem = (id) => {
        if (isReadOnlyInvoice) return;
        const nextItems = items.filter(i => i.id !== id);
        setItems(nextItems.length > 0 ? nextItems : [createBlankInvoiceItem()]);
    };


    const handleSave = async (newStatus = 'Draft') => {
        if (isReadOnlyInvoice) {
            alert("This invoice is view-only because it has already been completed.");
            return;
        }
        if (!selectedCustomer) { alert("Please select a customer"); return; }

        // Build payload for backend
        // Resolve invoice-level warehouse ID for fallback on items that have no warehouseId
        const invoiceLevelWarehouseId =
            defaultBranch?.defaultWarehouseId ||
            (warehousesList.length > 0 ? warehousesList[0].id : null);

        const payload = {
            id: invoiceId,
            invoiceNumber: invoiceNo,
            invoiceDate: invoiceDate,
            dueDate: deliveryDate || null,

            customerCode: selectedCustomer?.code || '',
            customerName: selectedCustomer?.name || '',

            linkedSalesOrder: linkedSO,
            linkedDeliveryNote: linkedDN,
            linkedProforma: linkedPI,
            linkedQuotation: linkedQuotation,

            paymentMode: paymentMode,
            paymentTerms: paymentTerms,
            salesperson: salesperson,
            branch: branch,
            shippingAddress: shippingAddress,
            amountPaid: Number(amountCollected),
            billDiscount: 0,
            billDiscountAmount: 0,
            totalDiscount: 0,
            subTotal: Number(taxableSubTotal),
            taxableSubTotal: Number(taxableSubTotal),
            totalTax: Number(totalTax),
            netTotal: Number(netTotal),
            status: newStatus === 'Confirmed' ? 'CONFIRMED' : 'DRAFT',
            salesType: salesType,
            requirePickingNote: true,
            requestedFulfillmentType: 'Picking',

            items: items.map(i => {
                const discountFactor = 1 - (Number(billDiscount) / 100);
                const finalNet = Number(i.net) * discountFactor;
                const finalTax = Number(i.taxAmt) * discountFactor;
                const qty = Number(i.qty) || 1;

                return {
                    id: i.invoiceItemId || ((i.id > 1000000000000) ? null : i.id),
                    salesOrderItemId: i.salesOrderItemId || null,
                    itemCode: i.code,
                    barcode: i.barcode || '',
                    image: i.image,
                    itemName: i.name,
                    description: i.desc || '',
                    sku: i.sku || '',
                    brand: i.brand || i.brandName || '',
                    detailedDesc: i.detailedDesc || '',
                    localName: i.localName || '',
                    unit: i.unit,
                    quantity: qty,
                    price: Number(i.price) || 0,
                    cost: Number(i.cost),
                    discount: Number(i.disc) || 0,
                    taxRate: Number(i.tax),
                    taxAmount: finalTax,
                    grossAmount: Number(i.gross) || 0,
                    netAmount: finalNet,
                    foc: Number(i.foc) || 0,
                    binId: i.binId || null,
                    warehouseId: (i.warehouseId && i.warehouseId !== '')
                        ? Number(i.warehouseId)
                        : (invoiceLevelWarehouseId ? Number(invoiceLevelWarehouseId) : null)
                };
            })
        };

        // Stock check enforcement (skip for Draft saves)
        const isSourceLinkedInvoice = Boolean((linkedSO || '').trim() || (linkedDN || '').trim());
        if (newStatus !== 'Draft' && salesSettings?.stockCheckRequired && !isSourceLinkedInvoice) {
            const stockIssues = [];
            for (const item of items) {
                if (!item.code) continue;
                // QA-001: service items hold no inventory — skip stock validation.
                if ((item.productType || '').toUpperCase() === 'SERVICE') continue;
                try {
                    const warehouseId = (item.warehouseId && item.warehouseId !== '')
                        ? Number(item.warehouseId)
                        : (invoiceLevelWarehouseId ? Number(invoiceLevelWarehouseId) : null);
                    const stockData = await getStockAvailability(item.code, warehouseId);
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
                alert(`Insufficient stock for the following items:\n\n${stockIssues.join('\n')}\n\nPlease adjust quantities or disable stock check in Sales Settings.`);
                return;
            }
        }

        // Credit limit BLOCK enforcement
        if (salesSettings?.creditLimitPolicy === 'BLOCK' &&
            selectedCustomer.creditLimitAmount > 0 &&
            (customerOutstanding + netTotal) > selectedCustomer.creditLimitAmount) {
            alert(`Credit Limit Exceeded: The projected outstanding balance (${formatCurrencyDisplay(customerOutstanding + netTotal, company)}) exceeds this customer's credit limit of ${formatCurrencyDisplay(selectedCustomer.creditLimitAmount, company)}.\n\nThis invoice cannot be saved. Please collect payment first or adjust the credit limit in the customer profile.`);
            return;
        }

        try {
            const savedInvoice = await saveSalesInvoice(payload);
            setInvoiceId(savedInvoice.id);
            setStatus(savedInvoice.status);
            if (Array.isArray(savedInvoice.items)) {
                setItems(savedInvoice.items.map((i, index) => mapServerInvoiceItem(i, Date.now() + index)));
            }

            // 🔵 AUTO-POST: If invoice is fully paid, update status to POSTED
            // This triggers the backend journal generation (JournalEntryGeneratorService)
            if (Number(amountCollected) >= netTotal && netTotal > 0) {
                await updateInvoiceStatus(savedInvoice.id, 'POSTED');
                setStatus('POSTED');
            }

            await verifyPickingNoteAfterSave(savedInvoice);

            await fetchInvoices();
            const hasBatchLines = Array.isArray(savedInvoice.items)
                && savedInvoice.items.some(item => item.batchControlled);
            if (newStatus === 'Draft' && salesType === 'DIRECT_SALE' && hasBatchLines) {
                setActiveTab('create');
                alert('Draft saved. Select exact batches for each batch-controlled line, then confirm the invoice.');
            } else {
                setActiveTab('list');
            }
        } catch (e) {
            console.error("Save failed", e);
            alert(e.response?.data?.message || "Failed to save Invoice. Please check inputs.");
        }
    };

    // ✅ Load existing invoice for editing
    const handleBatchSelectionSaved = async (updatedInvoice) => {
        if (updatedInvoice?.id) {
            setInvoiceId(updatedInvoice.id);
            setStatus(updatedInvoice.status || status);
            setItems((updatedInvoice.items || []).map((i, index) => mapServerInvoiceItem(i, Date.now() + index)));
            await fetchInvoices();
        }
    };

    const handleLoadInvoice = (invoice) => {
        setPickingNoteVerification(null);
        setInvoiceId(invoice.id);
        setInvoiceNo(invoice.invoiceNumber);
        setInvoiceDate(invoice.invoiceDate);
        setDeliveryDate(invoice.dueDate || '');

        // Resolve from master so reopening a saved invoice rehydrates the customer
        // panel (phone, balance, TRN, savedAddresses) — invoice persists only code+name.
        {
            const matched = resolveCustomer(
                { customerCode: invoice.customerCode, customerName: invoice.customerName },
                customersList
            );
            setSelectedCustomer(matched || { code: invoice.customerCode, name: invoice.customerName });
        }

        // Fetch outstanding for this customer excluding the current invoice's own balance,
        // so "Previous Outstanding" reflects what was owed before this invoice. (QA-035)
        if (invoice.customerCode) {
            const thisInvoiceBalance = invoice.balance != null ? invoice.balance : 0;
            getCustomerOutstanding(invoice.customerCode)
                .then(data => setCustomerOutstanding(Math.max(0, (data.outstanding || 0) - thisInvoiceBalance)))
                .catch(() => setCustomerOutstanding(0));
        } else {
            setCustomerOutstanding(0);
        }

        setShippingAddress(invoice.shippingAddress || '');

        setLinkedSO(invoice.linkedSalesOrder || '');
        setLinkedDN(invoice.linkedDeliveryNote || '');
        setLinkedPI(invoice.linkedProforma || '');
        setLinkedQuotation(invoice.linkedQuotation || '');

        setPaymentMode(invoice.paymentMode || 'Cash');
        setPaymentTerms(invoice.paymentTerms || 'Immediate');
        setSalesperson(invoice.salesperson || 'John Doe');
        setBranch(invoice.branch || defaultBranch?.name || '');

        setAmountCollected(invoice.amountPaid || 0);
        setBillDiscount(Number(invoice.billDiscount) || 0);
        setInvoiceBalance(invoice.balance != null ? invoice.balance : null);
        setStatus(invoice.status || 'Draft');
        const resolvedSalesType = invoice.salesType || 'STANDARD_FLOW';
        setSalesType(resolvedSalesType);
        setInvoiceTypeUI(resolveInvoiceTypeUI({
            linkedSalesOrder: invoice.linkedSalesOrder || '',
            linkedDeliveryNote: invoice.linkedDeliveryNote || '',
            linkedProforma: invoice.linkedProforma || '',
            salesType: resolvedSalesType
        }));
        setIsGeneratedFromDN(!!invoice.linkedDeliveryNote && invoice.status !== 'CANCELLED');

        // Map items back
        if (invoice.items && invoice.items.length > 0) {
            setItems(invoice.items.map((i, index) => mapServerInvoiceItem(i, Date.now() + index)));
        } else {
            setItems([createBlankInvoiceItem()]);
        }

        setActiveTab('create');
    };

    // ✅ MODAL HANDLERS
    const handleOpenPaymentModal = (invRow) => {
        // Support being called from the list (with invRow) or from the editor (no arg)
        // Check for specific properties to ensure it's not a React event object
        if (invRow && (invRow.id || invRow.invoiceNumber)) {
            handleLoadInvoice(invRow);
        }
        // Use server-side balance if available (authoritative), otherwise compute locally
        const outstanding = invoiceBalance != null
            ? invoiceBalance
            : Math.max(netTotal - amountCollected, 0);
        setModalPaymentAmount(outstanding > 0 ? outstanding.toFixed(2) : 0);
        setModalBankAccount('');
        setModalChequeDate(new Date().toISOString().split('T')[0]);
        setIsPaymentModalOpen(true);
    };

    const handleAddPaymentFromModal = async () => {
        if (!modalPaymentAmount || Number(modalPaymentAmount) <= 0) {
            alert("Please enter a valid amount.");
            return;
        }

        if (invoiceId && status !== 'Draft') {
            setIsLoading(true);
            try {
                await recordInvoicePayment(invoiceId, {
                    amount: Number(modalPaymentAmount),
                    paymentMode: modalPaymentMode,
                    paymentReference: modalPaymentRef,
                    paymentDate: modalPaymentDate,
                    ...(modalBankAccount ? { bankAccount: modalBankAccount } : {}),
                    ...(modalPaymentMode === 'Cheque' && modalChequeDate ? { chequeDate: modalChequeDate } : {})
                });
                await fetchInvoices();
                alert("Payment recorded successfully!");
                setIsPaymentModalOpen(false);

                // Refetch to refresh current view
                const list = await getAllSalesInvoices();
                const updated = Array.isArray(list) ? list.find(i => i.id === invoiceId) : null;
                if (updated) {
                    handleLoadInvoice(updated);
                } else {
                    setActiveTab('list');
                }
            } catch (err) {
                console.error("Payment error - status:", err?.response?.status);
                console.error("Payment error - data:", JSON.stringify(err?.response?.data));
                console.error("Payment error - message:", err?.message);
                const message = err?.response?.data?.message
                    || (typeof err?.response?.data === 'string' ? err.response.data : null)
                    || err?.message
                    || "Failed to record payment. Please try again.";
                alert(message);
            } finally {
                setIsLoading(false);
            }
        } else {
            // Draft or unsaved: just update local state
            const newCollected = Number(amountCollected) + Number(modalPaymentAmount);
            setAmountCollected(newCollected);
            setIsPaymentModalOpen(false);
        }
    };

    // ✅ PRINT FUNCTIONALITY
    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrintClick = async (invoice = null) => {
        const isListView = invoice && invoice.invoiceNumber;
        const dataToPrint = isListView ? invoice : {
            invoiceNumber: invoiceNo,
            invoiceDate,
            customerCode: selectedCustomer?.code,
            customerName: selectedCustomer?.name,
            linkedSalesOrder: linkedSO,
            linkedDeliveryNote: linkedDN,
            linkedProforma: linkedPI,
            branch,
            paymentMode,
            items,
            subTotal: taxableSubTotal,
            totalTax,
            invoiceTotal: netTotal,
            amountPaid: amountCollected,
            billDiscount,
            billDiscountAmount,
            status,
            paymentTerms,
            salesperson
        };

        if (!dataToPrint.items || dataToPrint.items.length === 0) {
            alert("Nothing to print. Add items first.");
            return;
        }

        setIsPrinting(true);
        try {
            const templates = await getTemplatesByCategory('Sales Invoice');
            const defaultTemplate = templates.find(t => t.isDefault);
            const resolvedBillDiscount = Number(dataToPrint.billDiscount) || 0;
            const resolvedSummary = summarizeSalesItems(dataToPrint.items || [], resolvedBillDiscount);

            if (defaultTemplate) {
                // Find Customer details
                const custCode = dataToPrint.customerCode || (selectedCustomer?.code);
                const fullCustomer = customersList.find(c => c.code === custCode);

                const printData = {
                    title: 'SALES INVOICE',
                    docNo: dataToPrint.invoiceNumber,
                    date: dataToPrint.invoiceDate,
                    customer: {
                        name: dataToPrint.customerName || '',
                        address: dataToPrint.shippingAddress || shippingAddress || fullCustomer?.address || fullCustomer?.billingAddress || '',
                        trn: fullCustomer?.trn
                    },
                    items: (dataToPrint.items || []).map(i => ({
                        code: i.itemCode || i.code,
                        name: i.itemName || i.name || '',
                        desc: i.description || i.shortDescription || i.desc || '',
                        sku: i.sku || i.productSku || '',
                        brand: i.brand || i.brandName || '',
                        detailedDesc: i.detailedDesc || '',
                    localName: i.localName || i.productLocalName || '',
                        barcode: i.barcode || i.itemBarcode || '',
                        salesPerson: dataToPrint.salesperson || '',
                        location: dataToPrint.branch || '',
                        unit: i.unit,
                        qty: Number(i.quantity || i.qty),
                        price: Number(i.price),
                        disc: Number(i.discount || i.disc),
                        tax: Number(i.taxRate || i.tax),
                        taxAmt: Number(i.taxAmount || i.taxAmt || 0),
                        total: Number(i.netAmount || i.net),
                        image: i.image || i.imageUrl ? getImageUrl(i.image || i.imageUrl) : '',
                        batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [],
                        batchNumbers: Array.isArray(i.batchSelections)
                            ? i.batchSelections.map(batch => batch.batchNumber).filter(Boolean).join(', ')
                            : ''
                    })),
                    totals: {
                        subTotal: resolvedSummary.subTotal,
                        tax: resolvedSummary.tax,
                        grandTotal: resolvedSummary.grandTotal,
                        currency: dataToPrint.currency || company?.currencySymbol || company?.currency || 'AED',
                        billDiscount: resolvedBillDiscount,
                        billDiscountAmount: resolvedSummary.billDiscountAmount
                    },
                    meta: {
                        status: dataToPrint.status,
                        paymentTerm: dataToPrint.paymentTerms,
                        reference: `SO: ${dataToPrint.linkedSalesOrder || '-'} | DN: ${dataToPrint.linkedDeliveryNote || '-'}`,
                        location: dataToPrint.branch || '',
                        salesPerson: dataToPrint.salesperson || '',
                        notes: dataToPrint.notes || ''
                    }
                };

                const html = generatePrintHtml(defaultTemplate, printData, { companyProfile: company, billBullLogo });
                printHtml(html);
            } else {
                alert("No default template selected. Using browser print.");
                const title = generateDocFilename(
                    'Sales Invoice',
                    dataToPrint.invoiceNumber,
                    dataToPrint.customerName,
                    dataToPrint.invoiceDate,
                    dataToPrint.currency || 'AED'
                );
                print(title);
            }
        } catch (error) {
            console.error("Print error:", error);
            const title = generateDocFilename(
                'Sales Invoice',
                dataToPrint.invoiceNumber,
                dataToPrint.customerName,
                dataToPrint.invoiceDate,
                dataToPrint.currency || 'AED'
            );
            print(title);
        } finally {
            setIsPrinting(false);
        }
    };

    // Helper for Status Badges
    const renderListStatus = (statusVal) => {
        const s = statusVal?.toUpperCase();
        if (s === 'PAID') return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">Paid</span>;
        if (s === 'OVERDUE') return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Overdue</span>;
        if (s === 'PARTIALLY_PAID') return <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold">Partially Paid</span>;
        if (s === 'CONFIRMED') return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">Confirmed</span>;
        if (s === 'COMPLETED') return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">Completed</span>;
        return <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{statusVal || 'Draft'}</span>;
    };

    const resolveSourceType = (inv) => {
        if (inv.linkedDeliveryNote) return { label: 'Against DN', ref: inv.linkedDeliveryNote, color: 'bg-green-100 text-green-700 border-green-200' };
        if (inv.linkedSalesOrder) return { label: 'Against SO', ref: inv.linkedSalesOrder, color: 'bg-blue-100 text-blue-700 border-blue-200' };
        if (inv.linkedProforma) return { label: 'Against PI', ref: inv.linkedProforma, color: 'bg-purple-100 text-purple-700 border-purple-200' };
        return { label: 'Direct Sale', ref: null, color: 'bg-orange-100 text-orange-700 border-orange-200' };
    };

    const renderTypeBadge = (type) => {
        if (type === 'DIRECT_SALE') return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold ml-2 border border-purple-200 shadow-sm flex items-center gap-1"><ShoppingCart size={10} /> Direct Sale</span>;
        return null;
    };

    const MobileCard = ({ inv }) => (
        <div
            onClick={() => handleLoadInvoice(inv)}
            className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-3 active:scale-[0.98] transition-all"
        >
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h4 className="font-bold text-slate-800 text-sm flex items-center">
                        {inv.invoiceNumber}
                        {renderTypeBadge(inv.salesType)}
                    </h4>
                    <div className="text-xs text-slate-500">{formatDisplayDate(inv.invoiceDate)}</div>
                </div>
                {renderListStatus(inv.status)}
            </div>

            <div className="flex items-center gap-2 mb-3 text-xs text-slate-600">
                <User size={12} className="text-slate-400" />
                <span className="font-medium truncate">{inv.customerName}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
                <div>
                    <span className="block text-slate-400 text-[10px] uppercase">Net Amount</span>
                    <CurrencyAmount value={inv.invoiceTotal || 0} currency={invoiceCurrency} className="font-bold text-slate-700" />
                </div>
                <div className="text-right">
                    <span className="block text-slate-400 text-[10px] uppercase">Balance</span>
                    <CurrencyAmount value={inv.balance || 0} currency={invoiceCurrency} className="font-bold text-red-500" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative" onClick={() => setIsCustomerOpen(false)}>

            {/* ✅ PRODUCT SELECTOR MODAL */}
            <ProductSelector
                isOpen={isProductSelectorOpen}
                onClose={() => setIsProductSelectorOpen(false)}
                onSelect={handleAddSingleProduct}
                onInlineAdd={handleFastEntryAdd}
                title="Select Items from Products / Services"
                actionLabel="Add to Invoice"
                mode="sales"
            />

            {/* ✅ STOCK AVAILABILITY MODAL */}
            <StockAvailabilityModal
                isOpen={isItemStockModalOpen}
                onClose={() => setIsItemStockModalOpen(false)}
                selectedStockItem={selectedStockItem}
            />

            <BatchSelectionModal
                isOpen={Boolean(batchSelectionTarget)}
                onClose={() => setBatchSelectionTarget(null)}
                onSaved={handleBatchSelectionSaved}
                sourceType="SALES_INVOICE"
                sourceDocumentId={invoiceId}
                salesInvoiceId={invoiceId}
                itemId={batchSelectionTarget?.item?.invoiceItemId || batchSelectionTarget?.item?.id}
                itemCode={batchSelectionTarget?.item?.code}
                itemName={batchSelectionTarget?.item?.name || batchSelectionTarget?.item?.desc}
                locationCode={batchSelectionTarget?.item?.binCode}
                binId={batchSelectionTarget?.item?.binId}
                requiredQuantity={batchSelectionTarget?.item?.baseRequiredQuantity || batchSelectionTarget?.item?.qty}
                fefoEnabled={batchSelectionTarget?.item?.fefoEnabled}
                minExpiryDaysForSale={batchSelectionTarget?.item?.minExpiryDaysForSale}
                currentSelections={batchSelectionTarget?.item?.batchSelections || []}
                canManualSelect={canManualBatchSelect}
            />

            {/* ✅ ITEM ADD-ONS MODAL (BB-026) */}
            <ItemAddOnsModal
                item={selectedAddonItem}
                onClose={() => setSelectedAddonItem(null)}
                isReadOnly={isReadOnlyInvoice}
                onSave={(updated) => {
                    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
                    setSelectedAddonItem(null);
                }}
            />

            {/* ✅ UNINVOICED DN MODAL */}
            {isDNModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[95%] animate-in zoom-in-95 duration-200 overflow-hidden font-sans">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Un-invoiced Delivery Notes</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Found for {selectedCustomer?.name}</p>
                            </div>
                            <button onClick={() => setIsDNModalOpen(false)} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <p className="text-xs text-slate-600 mb-4">Please select the Delivery Notes you want to invoice.</p>
                            <div className="space-y-2">
                                {uninvoicedDNs.map(dn => (
                                    <div key={dn.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedDNRows.includes(dn.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-blue-200'}`} onClick={() => handleToggleDNRow(dn.id)}>
                                        <input type="checkbox" checked={selectedDNRows.includes(dn.id)} onChange={() => { }} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" />
                                        <div className="flex-1 flex justify-between">
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">{dn.dnNumber}</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">{dn.dnDate} | SO: {dn.salesOrderNo || '-'}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-slate-500 uppercase">Items</div>
                                                <div className="text-xs font-bold text-slate-700">{dn.totalLines}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
                            <button onClick={handleSelectAllDNs} className="px-4 py-2 text-xs font-bold text-blue-600 uppercase tracking-widest hover:bg-blue-50 rounded transition-colors">
                                {selectedDNRows.length === uninvoicedDNs.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <div className="flex gap-2">
                                <button onClick={handleProceedManually} className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-700 transition-colors">
                                    Proceed Without Selecting
                                </button>
                                <button onClick={handleProceedWithSelectedDNs} className="px-6 py-2 bg-yellow-400 text-slate-900 text-xs font-black uppercase tracking-widest rounded shadow-md hover:bg-yellow-500 active:scale-95 transition-all">
                                    Combine & Invoice
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 flex flex-col w-full print:hidden">
                {/* TOP DEMO BANNER */}


                <div className="p-4 md:p-6 space-y-6">

                    {/* --- Sticky Header (match Quotation editor style) --- */}
                    <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-5 sticky top-0 z-40 shadow-sm -mx-4 md:-mx-6 mt-[-16px] md:mt-[-24px]">
                        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <span>Customers & Sales</span>
                                    <ChevronRight size={12} />
                                    <span className="font-medium text-slate-900">Sales Invoices</span>
                                </div>
                                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShoppingCart className="text-[#F5C742]" size={28} /> Sales Invoices</h1>
                                <p className="text-sm text-slate-500">Final tax invoices for completed sales transactions</p>

                                {activeTab === 'create' && (
                                    <div className="flex flex-wrap items-center gap-2 pt-2">
                                        {renderListStatus(status)}
                                        {renderTypeBadge(salesType)}
                                        <span className="text-xs text-slate-500 font-medium">
                                            Invoice No: <span className="text-slate-800 font-bold">{invoiceNo || '-'}</span>
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                                {activeTab !== 'list' && (
                                    <button
                                        onClick={() => setActiveTab('list')}
                                        className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
                                    >
                                        <ArrowLeft className="h-4 w-4" /> Back
                                    </button>
                                )}

                                {activeTab === 'create' && (
                                    <>
                                        <button
                                            onClick={() => handleSave('Draft')}
                                            className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
                                        >
                                            <Save className="h-4 w-4" /> Save Draft
                                        </button>
                                        <button
                                            onClick={() => handleSave('Confirmed')}
                                            className="flex-1 sm:flex-none h-8 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm transition-colors"
                                        >
                                            <CheckCircle2 className="h-4 w-4" /> Confirm
                                        </button>
                                        <button
                                            onClick={() => handleOpenPaymentModal()}
                                            className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
                                        >
                                            <DollarSign className="h-4 w-4" /> Pay
                                        </button>
                                        <button
                                            onClick={() => handlePrintClick()}
                                            disabled={isPrinting}
                                            className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            <Printer className="h-4 w-4" /> {isPrinting ? 'Printing...' : 'Print'}
                                        </button>
                                        <button className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                                            <Mail className="h-4 w-4" /> Email
                                        </button>
                                    </>
                                )}

                                {activeTab === 'list' && (
                                    <>
                                        <ExportDropdown
                                            onExportExcel={() => exportToExcel(filteredInvoices, SALES_INVOICE_COLUMNS, 'Sales_Invoices')}
                                            onExportPdf={() => exportToPDF(filteredInvoices, SALES_INVOICE_COLUMNS, 'Sales Invoices', 'Sales_Invoices')}
                                        />
                                        <button
                                            onClick={() => handleCreateNew('STANDARD_FLOW')}
                                            className="flex-1 sm:flex-none h-8 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm transition-colors"
                                        >
                                            <Plus className="h-4 w-4" /> Create New
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex overflow-x-auto no-scrollbar gap-2">
                            <button
                                onClick={() => setActiveTab('list')}
                                className={`h-8 px-3 rounded-md border text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'list' ? 'bg-[#F5C742] text-slate-900 border-[#F5C742] shadow-sm font-bold' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                            >
                                <FileText size={14} /> Invoice List
                            </button>
                            <button
                                onClick={() => { if (activeTab === 'list') handleCreateNew('STANDARD_FLOW'); }}
                                className={`h-8 px-3 rounded-md border text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'create' ? 'bg-[#F5C742] text-slate-900 border-[#F5C742] shadow-sm font-bold' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                            >
                                <ShoppingCart size={14} /> Invoice Editor
                            </button>
                        </div>
                    </div>

                    {/* ================= VIEW: LIST ================= */}
                    {activeTab === 'list' && (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                <h3 className="font-bold text-slate-700 text-sm">All Invoices</h3>
                                <div className="flex flex-col md:flex-row gap-3 items-center w-full md:w-auto">
                                    <div className="relative w-full md:w-auto">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input type="text" placeholder="Search invoices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 border border-slate-200 rounded-md text-xs w-full md:w-64 focus:outline-none focus:border-[#F5C742]" />
                                    </div>
                                    <div className="relative w-full md:w-auto">
                                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-3 pr-8 py-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none appearance-none w-full cursor-pointer">
                                            <option value="All">All Statuses</option>
                                            <option value="Draft">Draft</option>
                                            <option value="Posted">Posted</option>
                                            <option value="Confirmed">Confirmed</option>
                                            <option value="PartiallyPaid">Partially Paid</option>
                                            <option value="Paid">Paid</option>
                                            <option value="Overdue">Overdue</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                    <div className="relative w-full md:w-auto">
                                        <select value={filterPayMode} onChange={(e) => setFilterPayMode(e.target.value)} className="pl-3 pr-8 py-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none appearance-none w-full cursor-pointer">
                                            <option value="All">All Pay Modes</option>
                                            <option value="Cash">Cash</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Credit Card">Credit Card</option>
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto hidden md:block">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('invoiceNumber')}>
                                                <div className="flex items-center gap-1">Invoice No {sortConfig.key === 'invoiceNumber' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('invoiceDate')}>
                                                <div className="flex items-center gap-1">Date {sortConfig.key === 'invoiceDate' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('customerName')}>
                                                <div className="flex items-center gap-1">Customer {sortConfig.key === 'customerName' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3">Source Type</th>
                                            <th className="px-4 py-3">Pay Mode</th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('invoiceTotal')}>
                                                <div className="flex items-center gap-1">Net Amount {sortConfig.key === 'invoiceTotal' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('amountPaid')}>
                                                <div className="flex items-center gap-1">Paid {sortConfig.key === 'amountPaid' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('balance')}>
                                                <div className="flex items-center gap-1">Balance/Status {sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3">Print Template</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredInvoices.map((inv) => (
                                            <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => handleLoadInvoice(inv)}>
                                                <td className="px-4 py-3 font-medium text-slate-700">
                                                    <div className="flex items-center">
                                                        {inv.invoiceNumber}
                                                        {renderTypeBadge(inv.salesType)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">{formatDisplayDate(inv.invoiceDate)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-700">{inv.customerName}</div>
                                                    <div className="text-[10px] text-slate-400">{inv.customerCode}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(() => {
                                                        const src = resolveSourceType(inv);
                                                        return (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border w-fit ${src.color}`}>
                                                                    {src.label}
                                                                </span>
                                                                {src.ref && <span className="text-[10px] text-slate-400">{src.ref}</span>}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="border border-slate-200 px-2 py-0.5 rounded text-[10px] bg-white text-slate-600">{inv.paymentMode || 'Cash'}</span>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-800"><CurrencyAmount value={inv.invoiceTotal || 0} currency={invoiceCurrency} /></td>
                                                <td className="px-4 py-3 text-emerald-600"><CurrencyAmount value={inv.amountPaid || 0} currency={invoiceCurrency} /></td>
                                                <td className="px-4 py-3">
                                                    <CurrencyAmount value={inv.balance || 0} currency={invoiceCurrency} className="text-red-500 font-medium mr-2" />
                                                    {renderListStatus(inv.status)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">Classic</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                        <button onClick={() => handleLoadInvoice(inv)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Edit size={14} /></button>
                                                        <button onClick={() => handlePrintClick(inv)} disabled={isPrinting} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-50"><Printer size={14} /></button>
                                                        <button
                                                            onClick={() => {
                                                                handleLoadInvoice(inv);
                                                                const bal = inv.balance != null ? inv.balance : Math.max((inv.netTotal || 0) - (inv.amountPaid || 0), 0);
                                                                setModalPaymentAmount(bal > 0 ? bal.toFixed(2) : 0);
                                                                setModalBankAccount('');
                                                                setIsPaymentModalOpen(true);
                                                            }}
                                                            className="p-1 hover:bg-green-100 rounded text-green-600"
                                                            title="Record Payment"
                                                        ><DollarSign size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredInvoices.length === 0 && (
                                            <tr>
                                                <td colSpan="10" className="text-center py-8 text-slate-400">No Invoices found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* MOBILE LIST */}
                            <div className="md:hidden">
                                {filteredInvoices.map(inv => (
                                    <MobileCard key={inv.id} inv={inv} />
                                ))}
                                {filteredInvoices.length === 0 && (
                                    <div className="text-center py-8 text-slate-400 italic">No Invoices found.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ================= VIEW: CREATE ================= */}
                    {activeTab === 'create' && (
                        <div className="space-y-6 flex-1 flex flex-col pb-24 animate-in fade-in duration-300">

                            {/* FAST SALE MODE INDICATOR */}
                            {salesSettings?.salesMode === 'FAST_SALE' && (
                                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                                    <Zap size={14} className="text-amber-500 shrink-0" />
                                    <p className="text-xs text-amber-700">
                                        <strong>Fast Sale Mode is active.</strong> Saving this invoice will automatically create a Picking delivery note, mark it delivered, deduct stock, and recognise revenue in one step. Ensure every line item has a warehouse assigned.
                                    </p>
                                </div>
                            )}

                            {pickingNoteVerification && (
                                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${pickingNoteVerification.kind === 'success'
                                        ? 'bg-emerald-50 border-emerald-200'
                                        : 'bg-red-50 border-red-200'
                                    }`}>
                                    {pickingNoteVerification.kind === 'success' ? (
                                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle size={14} className="text-red-500 shrink-0" />
                                    )}
                                    <p className={`text-xs ${pickingNoteVerification.kind === 'success'
                                            ? 'text-emerald-700'
                                            : 'text-red-700'
                                        }`}>
                                        <strong>Picking verification:</strong> {pickingNoteVerification.message}
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1">
                                {/* LEFT COLUMN */}
                                <div className="xl:col-span-1 space-y-4 min-w-0">
                                    {/* 1. TOP ACTION BAR */}
                                    <div className="hidden">
                                        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
                                            <span className="px-3 py-1 rounded bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 w-full md:w-auto text-center">{status}</span>
                                            <input
                                                type="text"
                                                value={salesType === 'DIRECT_SALE' ? "Tax Invoice – Direct Sale" : "Tax Invoice – Standard VAT"}
                                                className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 w-full md:w-64"
                                                readOnly
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2 w-full xl:w-auto">
                                            <button
                                                onClick={() => handleSave('Draft')}
                                                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 flex-1 md:flex-none"
                                            >
                                                <Save size={14} /> Save Draft
                                            </button>
                                            <button
                                                onClick={() => handleSave('Confirmed')}
                                                className="flex items-center justify-center gap-1 px-4 py-1.5 bg-[#F5C742] rounded text-xs font-bold text-slate-900 hover:bg-yellow-400 flex-1 md:flex-none"
                                            >
                                                <CheckCircle2 size={14} /> Confirm
                                            </button>
                                            <button
                                                onClick={() => handleOpenPaymentModal()}
                                                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 flex-1 md:flex-none"
                                            >
                                                <DollarSign size={14} /> Pay
                                            </button>
                                            <button onClick={() => handlePrintClick()} disabled={isPrinting} className="p-2 hover:bg-slate-50 rounded border border-slate-200 text-slate-600 hidden md:block disabled:opacity-50"><Printer size={16} /></button>
                                            <button className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 flex-1 md:flex-none"><Mail size={14} /></button>
                                        </div>
                                    </div>

                                    {/* 2. INVOICE DETAILS FORM */}
                                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <h3 className="text-sm font-bold text-slate-700">Invoice Details</h3>
                                            {isReadOnlyInvoice && (
                                                <span className="text-[10px] font-bold px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600">
                                                    View Only
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Number</label>
                                                <input type="text" value={invoiceNo} readOnly className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 font-bold" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Date</label>
                                                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-[#F5C742] outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Due Date</label>
                                                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-[#F5C742] outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Reference</label>
                                                <input type="text" value={reference} onChange={e => setReference(e.target.value)} readOnly={isReadOnlyInvoice} placeholder="e.g. PO Number" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-[#F5C742] outline-none read-only:bg-slate-50 read-only:text-slate-500" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Terms</label>
                                                <div className="relative">
                                                    <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded bg-white appearance-none focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500">
                                                        <option>Immediate</option>
                                                        <option>Net 30</option>
                                                        <option>Net 60</option>
                                                    </select>
                                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Type</label>
                                                <div className="relative">
                                                    <select
                                                        value={invoiceTypeUI}
                                                        disabled={isReadOnlyInvoice}
                                                        onChange={e => {
                                                            setInvoiceTypeUI(e.target.value);
                                                            setSalesType(e.target.value === 'Direct Sale' ? 'DIRECT_SALE' : 'STANDARD_FLOW');
                                                            // Reset links when switching type
                                                            setLinkedSO(''); setLinkedDN(''); setLinkedPI('');
                                                            setBillDiscount(0);
                                                        }}
                                                        className="w-full text-xs p-2 border border-slate-200 rounded bg-white appearance-none focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500">
                                                        <option>Direct Sale</option>
                                                        <option>Against Sales Order</option>
                                                        <option>Against Delivery Note</option>
                                                        <option>Against Proforma Invoice</option>
                                                    </select>
                                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>

                                            {/* CONDITIONAL SOURCE DOCUMENT SELECTOR */}
                                            {invoiceTypeUI === 'Against Sales Order' && (
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">Sales Order</label>
                                                    <div className="relative">
                                                        <select value={linkedSO} onChange={e => handleSOChange(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded bg-white appearance-none focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500">
                                                            <option value="">Select SO...</option>
                                                            {salesOrdersList.filter(s => s.status !== 'CANCELLED').map(s => <option key={s.id} value={s.soNumber}>{s.soNumber} - {s.customerName}</option>)}
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                            )}

                                            {invoiceTypeUI === 'Against Delivery Note' && (
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Note</label>
                                                    <div className="relative">
                                                        <select value={linkedDN} onChange={e => handleDNChange(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded bg-white appearance-none focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500">
                                                            <option value="">Select DN...</option>
                                                            {deliveryNotesList.filter(d => d.status !== 'CANCELLED').map(d => <option key={d.id} value={d.dnNumber}>{d.dnNumber} - {d.customerName}</option>)}
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                            )}

                                            {invoiceTypeUI === 'Against Proforma Invoice' && (
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">Proforma Invoice</label>
                                                    <div className="relative">
                                                        <select value={linkedPI} onChange={e => handlePIChange(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded bg-white appearance-none focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500">
                                                            <option value="">Select PI...</option>
                                                            {proformaList.filter(p => p.status !== 'CANCELLED').map(p => <option key={p.id} value={p.proformaNo}>{p.proformaNo} - {p.customerName}</option>)}
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Branch</label>
                                                <input
                                                    value={branch || defaultBranch?.name || ''}
                                                    readOnly
                                                    className="w-full text-xs p-2 border border-slate-200 rounded bg-slate-50 text-slate-600 focus:outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Salesperson</label>
                                                <div className="relative">
                                                    <select value={salesperson} onChange={e => setSalesperson(e.target.value)} disabled={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded bg-white appearance-none focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50 disabled:text-slate-500">
                                                        <option value="">Select salesperson...</option>
                                                        {employeesList.map(emp => (
                                                            <option key={emp.id} value={emp.name}>{emp.name}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* 3. CUSTOMER + SHIPPING — unified panel */}
                                    <CustomerShippingPanel
                                        selectedCustomer={selectedCustomer}
                                        onOpenCustomerSearch={() => { if (!isGeneratedFromDN && !isReadOnlyInvoice) setIsCustomerSearchOpen(true); }}
                                        shippingAddress={shippingAddress}
                                        onShippingChange={setShippingAddress}
                                        isReadOnly={isReadOnlyInvoice}
                                        currency={invoiceCurrency}
                                    />

                                    {/* Credit warning (kept outside panel so it's always visible) */}
                                    {selectedCustomer && salesSettings?.creditLimitPolicy === 'WARNING' &&
                                        selectedCustomer.creditLimitAmount > 0 &&
                                        (customerOutstanding + netTotal) > selectedCustomer.creditLimitAmount && (
                                            <div className="p-2.5 bg-yellow-50 shadow-sm border border-yellow-200 rounded-md text-yellow-800 text-[11px] leading-relaxed flex items-start gap-2">
                                                <AlertCircle size={14} className="mt-0.5 shrink-0 text-yellow-600" />
                                                <p>
                                                    <strong>Credit Warning:</strong> The projected outstanding balance
                                                    (<CurrencyAmount value={customerOutstanding + netTotal} currency={invoiceCurrency} />) exceeds this customer's
                                                    credit limit of <CurrencyAmount value={selectedCustomer.creditLimitAmount} currency={invoiceCurrency} />.
                                                </p>
                                            </div>
                                        )}
                                    {selectedCustomer && salesSettings?.creditLimitPolicy === 'BLOCK' &&
                                        selectedCustomer.creditLimitAmount > 0 &&
                                        (customerOutstanding + netTotal) > selectedCustomer.creditLimitAmount && (
                                            <div className="p-2.5 bg-red-50 shadow-sm border border-red-300 rounded-md text-red-800 text-[11px] leading-relaxed flex items-start gap-2">
                                                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                                                <p>
                                                    <strong>Credit Limit Blocked:</strong> The projected outstanding balance
                                                    (<CurrencyAmount value={customerOutstanding + netTotal} currency={invoiceCurrency} />) exceeds this customer's
                                                    credit limit of <CurrencyAmount value={selectedCustomer.creditLimitAmount} currency={invoiceCurrency} />.
                                                    Saving this invoice is blocked until the balance is within limit.
                                                </p>
                                            </div>
                                        )}

                                    {/* CUSTOMER SELECTOR MODAL */}
                                    <CustomerSelector
                                        isOpen={isCustomerSearchOpen}
                                        onClose={() => setIsCustomerSearchOpen(false)}
                                        onSelect={(cust) => { handleSelectCustomer(cust); setIsCustomerSearchOpen(false); }}
                                        customers={customersList}
                                        selectedCode={selectedCustomer?.code || ''}
                                        onCustomerCreated={async () => {
                                            const data = await getAllCustomers();
                                            setCustomersList(Array.isArray(data) ? data : []);
                                        }}
                                    />
                                </div>

                                {/* MIDDLE COLUMN */}
                                <div className="xl:col-span-2 space-y-4 min-w-0">
                                    {/* 4. INVOICE ITEMS */}
                                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="text-[13px] font-bold text-slate-700">Invoice Items {isGeneratedFromDN && <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium border border-purple-200">Generated from DNs</span>}</h3>
                                            <div className="flex items-center gap-2">
                                                {/* ✅ SELECT FROM CATALOG BUTTON */}
                                                {!isGeneratedFromDN && !isReadOnlyInvoice && (
                                                    <>
                                                        <button
                                                            onClick={() => setIsProductSelectorOpen(true)}
                                                            className="flex items-center gap-1 px-2.5 py-1 bg-yellow-400 text-slate-900 text-[11px] font-semibold rounded hover:bg-yellow-500"
                                                        >
                                                            <Plus size={14} /> Select from Catalog
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                                            {/* Show more rows (closer to the left column height), then scroll inside for long invoices */}
                                            <div className="min-h-[320px] md:min-h-[420px] xl:min-h-[520px] max-h-[380px] md:max-h-[520px] xl:max-h-[680px] overflow-auto">
                                                <table className="w-full text-[11px] text-left min-w-[860px]">
                                                    <thead className="sticky top-0 z-10 bg-[#FBFBFD] border-b border-slate-200 text-[10px] font-semibold text-slate-600">
                                                        <tr>
                                                            <th className="px-3 py-2 w-8 text-center text-slate-400">#</th>
                                                            <th className="px-3 py-2 min-w-[320px]">
                                                                <ItemDescriptionHeader
                                                                    itemCount={items.length}
                                                                    expandedRowsCount={Object.keys(expandedRows).length}
                                                                    onToggleAll={toggleAllDescriptions}
                                                                />
                                                            </th>
                                                            <th className="px-3 py-2 w-16 text-center">Unit</th>
                                                            <th className="px-3 py-2 w-16 text-center">Qty</th>
                                                            {salesType === 'DIRECT_SALE' && (
                                                                <th className="px-3 py-2 w-32 text-left">Warehouse</th>
                                                            )}
                                                            <th className="px-3 py-2 w-20 text-right">Price</th>
                                                            <th className="px-3 py-2 w-24 text-right">Line total</th>
                                                            <th className="px-3 py-2 w-16 text-center">Remarks</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100/50">
                                                        {[...items].reverse().map((item, index) => (
                                                            <React.Fragment key={item.id}>
                                                                <tr className="group hover:bg-slate-50/50 transition-colors bg-white align-middle">
                                                                    {/* Index */}
                                                                    <td className="px-3 py-2 text-center text-slate-400 text-[11px] font-medium">{index + 1}</td>

                                                                    {/* Item / Description */}
                                                                    <td className="px-3 py-2">

                                                                        <ItemDescriptionCell
                                                                            item={item}
                                                                            isExpanded={expandedRows[item.id]}
                                                                            onToggleExpand={toggleRowDescription}
                                                                            onItemChange={handleItemChange}
                                                                            onFocusCode={() => {
                                                                                fetchItemContext(item.code || item.itemCode);
                                                                            }}
                                                                            onOpenProductSelection={() => setIsProductSelectorOpen(true)}
                                                                            onCheckStock={() => { setSelectedStockItem(item); setIsItemStockModalOpen(true); }}
                                                                            onOpenSettings={() => setSelectedAddonItem({ ...item })}
                                                                            showSettings={true}
                                                                            isReadOnly={isReadOnlyInvoice}
                                                                            page="salesInvoice"
                                                                        />
                                                                        {item.batchControlled && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (salesType !== 'DIRECT_SALE' || isReadOnlyInvoice) {
                                                                                        return;
                                                                                    }
                                                                                    if (!invoiceId || !item.invoiceItemId) {
                                                                                        alert('Save this invoice as Draft before selecting batches.');
                                                                                        return;
                                                                                    }
                                                                                    setBatchSelectionTarget({ item });
                                                                                }}
                                                                                disabled={salesType !== 'DIRECT_SALE' || isReadOnlyInvoice}
                                                                                className={`mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-70 ${
                                                                                    Number(item.batchSelectedQuantity || 0) >= Number(item.baseRequiredQuantity || item.qty || 0)
                                                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                                                                }`}
                                                                                title={salesType === 'DIRECT_SALE'
                                                                                    ? 'Select batches for this direct invoice line'
                                                                                    : 'Batch details are inherited from the source Delivery Note'}
                                                                            >
                                                                                Batches {Number(item.batchSelectedQuantity || 0)}/{Number(item.baseRequiredQuantity || item.qty || 0)}
                                                                            </button>
                                                                        )}
                                                                        {Array.isArray(item.batchSelections) && item.batchSelections.length > 0 && (
                                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                                {item.batchSelections.map((batch, batchIndex) => (
                                                                                    <span
                                                                                        key={batch.allocationId || batch.batchMasterId || `${batch.batchNumber}-${batchIndex}`}
                                                                                        className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                                                                                    >
                                                                                        {batch.batchNumber}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                    </td>

                                                                    {/* Unit */}
                                                                    <td className="px-3 py-2 text-center">

                                                                        <select
                                                                            disabled={isReadOnlyInvoice || isGeneratedFromDN}
                                                                            className="w-full bg-transparent outline-none text-center text-xs text-slate-600 appearance-none font-medium cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed"
                                                                            value={item.unit}
                                                                            onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                                                        >
                                                                            {(item.availableUnits || ['PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                                                                        </select>

                                                                    </td>

                                                                    {/* Qty */}
                                                                    <td className="px-3 py-2 text-center">

                                                                        <input
                                                                            disabled={isGeneratedFromDN || isReadOnlyInvoice}
                                                                            id={`qty-${item.id}`}
                                                                            type="number"
                                                                            min="1"
                                                                            className={`w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 text-center outline-none font-semibold text-xs transition-colors py-1 ${(isGeneratedFromDN || isReadOnlyInvoice) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700'}`}
                                                                            value={item.qty === 0 ? '' : item.qty}
                                                                            onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                                                                            placeholder="0"
                                                                        />

                                                                    </td>

                                                                    {/* Warehouse (Direct Sale Only) */}
                                                                    {salesType === 'DIRECT_SALE' && (
                                                                        <td className="px-3 py-2">

                                                                            <select
                                                                                disabled={isReadOnlyInvoice}
                                                                                className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 outline-none text-xs font-semibold text-slate-700 transition-colors py-1 appearance-none cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed"
                                                                                value={item.warehouseId || ''}
                                                                                onChange={(e) => handleItemChange(item.id, 'warehouseId', e.target.value)}
                                                                            >
                                                                                <option value="" className="text-slate-400">Select...</option>
                                                                                {warehousesList.map(w => (
                                                                                    <option key={w.id} value={w.id}>{w.name}</option>
                                                                                ))}
                                                                            </select>

                                                                        </td>
                                                                    )}

                                                                    {/* FOC */}
                                                                    <td className="hidden px-3 py-2 text-center align-top">

                                                                        <div className="flex flex-col gap-1">
                                                                            <input
                                                                                type="number"
                                                                                className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 text-center outline-none font-semibold text-xs text-slate-700 transition-colors py-1"
                                                                                value={item.foc === 0 ? '' : item.foc || ''}
                                                                                onChange={(e) => handleItemChange(item.id, 'foc', e.target.value)}
                                                                                placeholder="—"
                                                                            />
                                                                            <select
                                                                                className="w-full bg-transparent outline-none text-center text-[10px] text-slate-500 appearance-none font-medium cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                                                                                value={item.focUnit || 'PCS'}
                                                                                onChange={(e) => handleItemChange(item.id, 'focUnit', e.target.value)}
                                                                            >
                                                                                {(item.availableUnits || ['PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                                                                            </select>
                                                                        </div>

                                                                    </td>

                                                                    {/* Price */}
                                                                    <td className="px-3 py-2 text-right">

                                                                        <input
                                                                            disabled={isGeneratedFromDN || isReadOnlyInvoice}
                                                                            type="number"
                                                                            className={`w-full text-right bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 outline-none font-semibold text-xs transition-colors py-1 ${(isGeneratedFromDN || isReadOnlyInvoice) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700'}`}
                                                                            value={item.price === 0 ? '' : item.price}
                                                                            onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                                                            placeholder="0.00"
                                                                        />

                                                                    </td>

                                                                    {/* Disc % */}
                                                                    <td className="hidden px-3 py-2 text-right">

                                                                        <input
                                                                            disabled={isGeneratedFromDN || isReadOnlyInvoice}
                                                                            type="number"
                                                                            className={`w-full text-right bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 outline-none font-semibold text-xs transition-colors py-1 ${(isGeneratedFromDN || isReadOnlyInvoice) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700'}`}
                                                                            value={item.disc === 0 ? '' : item.disc}
                                                                            onChange={(e) => handleItemChange(item.id, 'disc', e.target.value)}
                                                                            placeholder="0"
                                                                        />

                                                                    </td>

                                                                    {/* Line Total */}
                                                                    <td className="px-3 py-2 text-right">

                                                                        <div className="font-bold text-slate-800 text-[13px] flex flex-col items-end">
                                                                            {((item.net) || (item.total) || 0).toFixed(2)}
                                                                        </div>

                                                                    </td>

                                                                    {/* Remarks / Action */}
                                                                    <td className="px-3 py-2 text-center">
                                                                        <div className="flex items-center justify-center">
                                                                            {!isGeneratedFromDN && !isReadOnlyInvoice && (
                                                                                <button onClick={() => handleDeleteItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                                                                    <Trash2 size={16} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>

                                                                {/* Expanded Description Row */}
                                                                {expandedRows[item.id] && (
                                                                    <tr className="bg-white">
                                                                        <td></td>
                                                                        <td colSpan={salesType === 'DIRECT_SALE' ? 7 : 6} className="px-0 pb-4 pt-1">
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
                                                                                    readOnly={isReadOnlyInvoice}
                                                                                    className="w-full bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-yellow-700/30 resize-none font-medium leading-relaxed read-only:text-slate-500"
                                                                                    value={item.remarks || ''}
                                                                                    onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                                                                    placeholder="Enter product description — auto-loaded from product master, fully editable..."
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
                                        </div>
                                    </div>

                                    {/* 6. NOTES */}
                                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-slate-700 mb-3">Notes & Communications</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <textarea rows="2" readOnly={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded resize-none focus:outline-none focus:border-[#F5C742] read-only:bg-slate-50 read-only:text-slate-500" placeholder="Thank you for your business!"></textarea>
                                            <textarea rows="2" readOnly={isReadOnlyInvoice} className="w-full text-xs p-2 border border-slate-200 rounded resize-none focus:outline-none focus:border-[#F5C742] read-only:bg-slate-50 read-only:text-slate-500" placeholder="e.g., Special discount approved by manager"></textarea>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN */}
                                <div className="xl:col-span-1 space-y-4">
                                    {/* 5. TOTALS & PAYMENT SECTION */}
                                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4">Totals & Payment Summary</h3>
                                        <div className="flex flex-col gap-6">

                                            {/* LEFT: Invoice Totals */}
                                            <div className="flex-1 space-y-2" data-bb-skip-aed-symbol="true">
                                                <div className="flex justify-between text-xs text-slate-600">
                                                    <span>Subtotal</span>
                                                    <CurrencyAmount value={subTotal} currency={invoiceCurrency} />
                                                </div>
                                                <div className="flex justify-between text-xs text-red-500">
                                                    <span>Total Discount</span>
                                                    <span>- <CurrencyAmount value={totalDiscount} currency={invoiceCurrency} /></span>
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-600 items-center">
                                                    <span className="flex items-center gap-2">
                                                        Bill Discount
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            disabled={isReadOnlyInvoice}
                                                            value={billDiscount}
                                                            onChange={(e) => setBillDiscount(Number(e.target.value))}
                                                            className="w-10 border border-slate-300/50 rounded px-1 text-center focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                                                        /> %
                                                    </span>
                                                    <span className="font-medium text-red-500">- <CurrencyAmount value={billDiscountAmount} currency={invoiceCurrency} /></span>
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-600">
                                                    <span>Total Tax (VAT)</span>
                                                    <CurrencyAmount value={totalTax} currency={invoiceCurrency} />
                                                </div>
                                                <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2 my-2">
                                                    <span>Net Invoice Amount</span>
                                                    <CurrencyAmount value={netTotal} currency={invoiceCurrency} />
                                                </div>
                                            </div>

                                            {/* RIGHT: Payment */}
                                            <div className="flex-1 space-y-2" data-bb-skip-aed-symbol="true">
                                                <div className="flex justify-between text-xs text-slate-600">
                                                    <span>Previous Outstanding</span>
                                                    <CurrencyAmount value={previousOutstanding} currency={invoiceCurrency} />
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-600">
                                                    <span>This Invoice Amount</span>
                                                    <CurrencyAmount value={netTotal} currency={invoiceCurrency} />
                                                </div>

                                                <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                                    <span>- <CurrencySymbol currency={invoiceCurrency} /></span>
                                                    <input
                                                        type="number"
                                                        value={amountCollected}
                                                        disabled={isReadOnlyInvoice}
                                                        onChange={e => setAmountCollected(Number(e.target.value))}
                                                        className="w-20 text-right border-b border-slate-300 focus:border-emerald-500 outline-none text-emerald-600 bg-transparent disabled:text-slate-400 disabled:cursor-not-allowed"
                                                    />
                                                </div>

                                                <div className="flex justify-between text-base font-bold text-red-600 border-t border-slate-200 pt-2 my-2">
                                                    <span>New Total Outstanding</span>
                                                    <CurrencyAmount value={newTotalOutstanding} currency={invoiceCurrency} />
                                                </div>
                                                <div>
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded text-white ${paymentMode === 'Cash' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                                                        {paymentMode} Invoice
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* BOTTOM SPACE FOR SPACING */}
                                    <div className="h-4"></div>

                                    {/* SIDEBAR - INTELLIGENCE PANELS */}
                                    <div className="space-y-5 xl:sticky xl:top-6">
                                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                                            <div className="flex items-center gap-2 mb-3 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                                                <Package size={14} className="text-[#F5C742]" /> Item Availability
                                                {isContextLoading && <div className="ml-auto animate-spin h-3 w-3 border-2 border-[#F5C742] border-t-transparent rounded-full" />}
                                            </div>
                                            <div className="space-y-2 overflow-y-auto max-h-[260px]">
                                                {items.some(i => i.code) ? items.filter(i => i.code).filter((item, idx, arr) => arr.findIndex(x => x.code === item.code) === idx).map(item => {
                                                    if ((item.productType || '').toUpperCase() === 'SERVICE') {
                                                        return (
                                                            <div key={item.id} className="border rounded p-2 border-blue-200 bg-blue-50">
                                                                <div className="font-semibold text-[10px] text-slate-800 truncate">{item.desc || item.productDesc || item.code}</div>
                                                                <div className="text-[9px] text-slate-500">{item.code}</div>
                                                                <div className="mt-1 text-[10px] font-bold text-blue-700">Service — no stock tracking</div>
                                                            </div>
                                                        );
                                                    }
                                                    const available = liveStockMap[item.code]?.available ?? (item.stock || item.currentStock || 0);
                                                    const reserved = liveStockMap[item.code]?.reserved ?? 0;
                                                    const requested = Number(item.qty) || 0;
                                                    const sufficient = available >= requested;
                                                    return (
                                                        <div key={item.id} className={`border rounded p-2 ${sufficient ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                                                            <div className="font-semibold text-[10px] text-slate-800 truncate">{item.desc || item.productDesc || item.code}</div>
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
                                                }) : (
                                                    <div className="text-[10px] text-slate-400 text-center py-4 italic">Add items to check stock.</div>
                                                )}
                                            </div>
                                        </div>
                                        <PriceHistorySidebarPanel history={focusedItemPriceHistory} isLoading={isContextLoading} itemCode={focusedItemCode} />
                                    </div>
                                </div>
                            </div>

                            {/* Desktop bottom action bar (match Quotation editor pattern) */}
                            <div className="hidden md:flex fixed bottom-0 md:left-64 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] justify-between items-center z-30">
                                <div className="flex items-center gap-3">
                                    <div className="px-2 py-1 bg-slate-100 border border-slate-200/50 rounded-md text-[11px] font-bold text-slate-600 shadow-sm flex items-center gap-2">
                                        Status: {renderListStatus(status)}
                                    </div>
                                    <span className="text-[11px] font-medium text-slate-500 hidden lg:inline">
                                        Invoice No: <span className="text-slate-700 font-bold">{invoiceNo || '-'}</span>
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-500 hidden xl:inline">
                                        Net: <CurrencyAmount value={netTotal} currency={invoiceCurrency} className="text-slate-700 font-bold" />
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    {!isReadOnlyInvoice && (
                                        <button onClick={() => handleSave('Draft')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                                            <Save size={14} /> Save Draft
                                        </button>
                                    )}
                                    {!isReadOnlyInvoice && (
                                        <button onClick={() => handleSave('Confirmed')} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C742] text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 transition-colors shadow-sm">
                                            <CheckCircle2 size={14} /> Confirm
                                        </button>
                                    )}
                                    <button onClick={() => handleOpenPaymentModal()} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                                        <DollarSign size={14} /> Pay
                                    </button>
                                    <button onClick={() => handlePrintClick()} disabled={isPrinting} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50">
                                        <Printer size={14} /> {isPrinting ? 'Printing...' : 'Print'}
                                    </button>
                                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                                        <Mail size={14} /> Email
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main >

            {/* ✅ ADDED PAYMENT MODAL */}
            {
                isPaymentModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                        <div className="bg-white w-[500px] rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Receive Payment</h3>
                                    <p className="text-xs text-slate-500 mt-1">Record a payment received from the customer for this invoice</p>
                                </div>
                                <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 space-y-4">

                                {/* Balance Display */}
                                <div className="flex justify-between items-center text-sm mb-2">
                                    <span className="text-slate-500 font-medium">Balance Due</span>
                                    <CurrencyAmount
                                        value={netTotal - amountCollected}
                                        currency={invoiceCurrency}
                                        className="text-red-600 font-bold text-lg"
                                    />
                                </div>

                                {/* Date */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Payment Date</label>
                                    <input
                                        type="date"
                                        value={modalPaymentDate}
                                        onChange={(e) => setModalPaymentDate(e.target.value)}
                                        className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                                    />
                                </div>

                                {/* Payment Mode */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                                    <select
                                        value={modalPaymentMode}
                                        onChange={(e) => { setModalPaymentMode(e.target.value); setModalBankAccount(''); setModalChequeDate(new Date().toISOString().split('T')[0]); }}
                                        className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none bg-white"
                                    >
                                        <option>Cash</option>
                                        <option>Bank Transfer</option>
                                        <option>Cheque</option>
                                        <option>Credit Card</option>
                                    </select>
                                </div>

                                {/* Bank Account — shown for non-Cash modes */}
                                {modalPaymentMode !== 'Cash' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Bank Account</label>
                                        <select
                                            value={modalBankAccount}
                                            onChange={(e) => setModalBankAccount(e.target.value)}
                                            className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none bg-white"
                                        >
                                            <option value="">Select bank account...</option>
                                            {bankAccountOptions.map(acc => (
                                                <option key={acc.id} value={acc.name}>{acc.code} — {acc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Cheque Date — shown only when mode is Cheque */}
                                {modalPaymentMode === 'Cheque' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Date</label>
                                        <input
                                            type="date"
                                            value={modalChequeDate}
                                            onChange={(e) => setModalChequeDate(e.target.value)}
                                            className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                                        />
                                    </div>
                                )}

                                {/* Amount */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Amount</label>
                                    <input
                                        type="number"
                                        value={modalPaymentAmount}
                                        onChange={(e) => setModalPaymentAmount(e.target.value)}
                                        className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                                    />
                                </div>

                                {/* Reference */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Reference / Instrument No</label>
                                    <input
                                        type="text"
                                        placeholder="Cheque no, Transaction ID, etc."
                                        value={modalPaymentRef}
                                        onChange={(e) => setModalPaymentRef(e.target.value)}
                                        className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                                    />
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
                                    <textarea
                                        rows={2}
                                        placeholder="Additional notes..."
                                        value={modalNotes}
                                        onChange={(e) => setModalNotes(e.target.value)}
                                        className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none resize-none"
                                    ></textarea>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
                                <button
                                    onClick={() => setIsPaymentModalOpen(false)}
                                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddPaymentFromModal}
                                    className="px-6 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded hover:bg-yellow-500 shadow-sm flex items-center gap-2"
                                >
                                    <DollarSign size={14} /> Add Payment
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ✅ UNINVOICED DN MODAL */}
            {false && isDNModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                    <div className="bg-white w-[800px] max-w-full rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Package size={20} className="text-purple-600" />
                                    Un-Invoiced Delivery Notes Found
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Select the delivery notes to merge into this invoice.</p>
                            </div>
                            <button onClick={handleProceedManually} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body - Scrollable */}
                        <div className="p-6 overflow-y-auto flex-1 bg-white">
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 w-10 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedDNRows.length === uninvoicedDNs.length && uninvoicedDNs.length > 0}
                                                    onChange={handleSelectAllDNs}
                                                    className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-600 cursor-pointer"
                                                />
                                            </th>
                                            <th className="px-4 py-3">DN Number</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Warehouse</th>
                                            <th className="px-4 py-3">Linked SO</th>
                                            <th className="px-4 py-3 text-right">Items</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {uninvoicedDNs.map((dn) => (
                                            <tr
                                                key={dn.id}
                                                className={`hover:bg-purple-50/50 cursor-pointer transition-colors ${selectedDNRows.includes(dn.id) ? 'bg-purple-50' : ''}`}
                                                onClick={() => handleToggleDNRow(dn.id)}
                                            >
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedDNRows.includes(dn.id)}
                                                        onChange={() => { }} // handled by tr click
                                                        onClick={(e) => e.stopPropagation()} // in case they click box directly
                                                        className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-600 cursor-pointer pointer-events-none"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-700">{dn.dnNumber}</td>
                                                <td className="px-4 py-3 text-slate-500">{dn.deliveryDate || dn.createdDate || '-'}</td>
                                                <td className="px-4 py-3 text-slate-500">{dn.warehouse || '-'}</td>
                                                <td className="px-4 py-3 text-slate-500">{dn.salesOrderNo || '-'}</td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-600">
                                                    {dn.items ? dn.items.length : 0} items
                                                </td>
                                            </tr>
                                        ))}
                                        {uninvoicedDNs.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="text-center py-8 text-slate-400">No un-invoiced Delivery Notes found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-50 flex justify-between items-center border-t border-slate-100">
                            <span className="text-xs text-slate-500 font-medium">Selected {selectedDNRows.length} of {uninvoicedDNs.length} documents</span>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleProceedManually}
                                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 transition-colors"
                                >
                                    Proceed Manually
                                </button>
                                <button
                                    onClick={handleProceedWithSelectedDNs}
                                    disabled={selectedDNRows.length === 0}
                                    className="px-6 py-2 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    Generate Combined Invoice
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div >
    );
};

export default SalesInvoice;
