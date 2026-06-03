import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Printer,
  Mail,
  MessageCircle,
  Smartphone,
  Plus,
  ArrowRight,
  ChevronDown,
  User,
  AlertTriangle,
  FileText,
  Calendar,
  CreditCard,
  DollarSign,
  Truck,
  ShoppingCart,
  Box,
  X,
  Search,
  Menu,
  ChevronUp,
  Trash2,
  Paperclip,
  Save,
  ChevronRight,
  AlertCircle,
  Zap
} from 'lucide-react';

// ✅ API IMPORTS
import api from '../../api/axiosConfig';
import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllQuotations } from '../../api/quotationApi';
import { getAllProformas } from '../../api/proformaApi';
import {
  getAllSalesOrders,
  getSalesOrdersPage,
  getNextSalesOrderNumber,
  saveSalesOrder,
  uploadSalesOrderAttachment,
  getSalesOrderReceiptVouchers
} from '../../api/salesorderApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { formatDisplayDate } from '../../utils/dateUtils';
import { pickSalesItemPrice, isPolicyOverridingPackings } from '../../utils/salesPricing';
import { computeLineTaxTotals, resolveLineTaxRate } from '../../utils/vatMath';
import { getActiveVatRate } from '../../api/taxApi';
import { generatePrintHtmlAsync, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import { getDefaultProductUnit, resolveUnitAmount } from '../../utils/unitPricing';
import { getStockAvailability } from '../../api/stockAvailabilityApi';
import { getSalesSettings } from '../../api/salesSettingsApi';
import billBullLogo from '../../assets/billBullLogo.png';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import { buildDocumentHeaderProfile } from '../../utils/branchPrintProfile';
import { sendSalesOrderEmail } from '../../api/salesorderApi';
import SendDocumentEmailModal from '../../components/SendDocumentEmailModal';
import { summarizeSalesItems } from '../../utils/documentSummaryUtils';

// ✅ PRODUCT SELECTOR
import ProductSelector from '../../components/ProductSelector';

// ✅ CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';
import CustomerShippingPanel from '../../components/CustomerShippingPanel';
import { hydrateCustomerFromSource, resolveCustomer, resolveDefaultShippingAddress } from '../../utils/customerResolution';
import { isAutoNumberingEnabled } from '../../utils/salesNumbering';
import { normalizePurchaseTemplate, buildReceiptVoucherPrintData } from '../../utils/purchasePrintUtils';

// ✅ GLOBAL COMPONENTS
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';
// QA-FAST-ENTRY: inline row search input that auto-opens ProductSelector
import InlineProductSearchCell from '../../components/InlineProductSearchCell';
import PaginationFooter from '../../components/common/PaginationFooter';
import ItemAddOnsModal from '../../components/ItemAddOnsModal';

// ✅ STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';
import BatchSelectionModal from '../../components/BatchSelectionModal';

// ✅ SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// ✅ PERMISSIONS
import { usePermissions } from '../../context/PermissionContext';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import CurrencyAmount from '../../components/CurrencyAmount';
import { formatCurrencyDisplay, resolveCurrencyDisplayCode } from '../../utils/countryCurrencyOptions';
import { getListSerialNumber, withListSerialNumbers } from '../../utils/serialNumbering';
import TableSkeleton from '../../components/common/TableSkeleton';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const SALES_ORDER_COLUMNS = [
  { header: 'S.No.', key: 'sNo', width: 8 },
  { header: 'SO No', key: 'soNumber', width: 15 },
  { header: 'Date', key: 'orderDate', width: 12 },
  { header: 'Customer', key: 'customerName', width: 25 },
  { header: 'Quotation', key: 'linkedQuotation', width: 15 },
  { header: 'PI No', key: 'linkedProforma', width: 15 },
  { header: 'Total', key: 'orderTotal', width: 15 },
  { header: 'Advance', key: 'advanceAmount', width: 12 },
  { header: 'Balance', key: 'balanceAmount', width: 12 },
  { header: 'Status', key: 'status', width: 12 }
];

// ✅ MOBILE CARD COMPONENT
const resolveCurrencyLabel = (company) => {
  return resolveCurrencyDisplayCode(company || {});
};

const formatCurrencyAmount = (value, companyProfile) =>
  formatCurrencyDisplay(value, companyProfile);

const MobileCard = ({ order, onClick, getStatusBadge, currency }) => (
  <div onClick={() => onClick(order)} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-3 active:scale-[0.98] transition-transform">
    <div className="flex justify-between items-start mb-2">
      <div>
        <h4 className="font-bold text-slate-800">{order.soNumber}</h4>
        <p className="text-xs text-slate-500">{formatDisplayDate(order.orderDate)}</p>
      </div>
      {getStatusBadge(order.status)}
    </div>

    <div className="flex justify-between items-center text-sm mb-2">
      <div className="flex items-center gap-2 text-slate-700">
        <User size={14} className="text-slate-400" />
        <span className="font-medium truncate max-w-[150px]">{order.customerName}</span>
      </div>
    </div>

    <div className="flex justify-between items-center border-t border-slate-100 pt-2 mt-2">
      <div className="text-xs text-slate-500">
        Total: <CurrencyAmount value={order.orderTotal} currency={currency} className="font-bold text-slate-800" />
      </div>
      <div className="text-xs text-slate-500">
        Balance: <CurrencyAmount value={Number(order.orderTotal) - Number(order.advanceAmount)} currency={currency} className="font-bold text-slate-800" />
      </div>
      <ChevronDown size={16} className="text-slate-300 -rotate-90" />
    </div>
  </div>
);

// ✅ MOBILE FLOATING ACTIONS COMPONENT
const MobileFloatingActions = ({ status, onConfirm, onConvertToDO, onSave, onPrint }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex gap-2 items-center justify-between z-50 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <div className="flex gap-2 w-full">
        {status === 'DRAFT' ? (
          <>
            <button onClick={onSave} className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg text-xs flex items-center justify-center gap-2 active:bg-slate-50">
              Save
            </button>
            <button onClick={onConfirm} className="flex-[2] py-3 bg-emerald-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 active:scale-[0.98]">
              Confirm Order
            </button>
          </>
        ) : (status === 'CONFIRMED' || status === 'PARTIALLY_PAID' || status === 'FULLY_PAID') ? (
          <button onClick={onConvertToDO} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 active:bg-indigo-700">
            <Truck size={16} /> Convert to Delivery Note
          </button>
        ) : (
          <button onClick={onPrint} className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg text-xs flex items-center justify-center gap-2 active:bg-slate-50">
            <Printer size={16} /> Print Order
          </button>
        )}
      </div>
    </div>
  );
};

const SalesOrders = () => {
  const { company } = useCompany();
  const { branches: availableBranches, activeBranch } = useBranch();
  const currencyLabel = resolveCurrencyLabel(company);
  const orderCurrency = company?.currency || currencyLabel || 'AED';
  const { canCreate, canEdit, canApprove, canExport, canAction } = usePermissions();
  const canManualBatchSelect = canAction('batch_manual_select', 'edit');
  const [activeTab, setActiveTab] = useState('list');

  // ✅ FIX 1: ADD ORDER ID STATE
  const [orderId, setOrderId] = useState(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false); // QA-040: Send-Email modal
  // Originating branch of the loaded SO — drives print/email header (PDF §7.1).
  const [loadedSoBranchId, setLoadedSoBranchId] = useState(null);

  // --- DATA STATES ---
  const [customersList, setCustomersList] = useState([]);
  const [quotationsList, setQuotationsList] = useState([]);
  const [proformasList, setProformasList] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [isLinkedSourceOpen, setIsLinkedSourceOpen] = useState(false);

  // --- ORDER LIST STATE ---
  const [ordersList, setOrdersList] = useState([]);
  // Pagination state (server-driven via /api/sales/orders/page)
  const [listPage, setListPage] = useState(0);
  const [listPageMeta, setListPageMeta] = useState({ page: 0, size: 30, totalElements: 0, totalPages: 0 });
  const [isListLoading, setIsListLoading] = useState(false);
  const exportOrdersList = useMemo(() => ordersList.map((order) => ({
    ...order,
    orderTotal: formatCurrencyAmount(order.orderTotal, company),
    advanceAmount: formatCurrencyAmount(order.advanceAmount, company),
    balanceAmount: formatCurrencyAmount(Number(order.orderTotal) - Number(order.advanceAmount), company)
  })), [company, ordersList]);

  // --- FORM STATES ---
  const [status, setStatus] = useState('DRAFT');
  const [showItemError, setShowItemError] = useState(false);

  // ✅ NEW STATE: Track the currently focused item for the sidebar
  const [focusedItem, setFocusedItem] = useState(null);
  const [batchSelectionTarget, setBatchSelectionTarget] = useState(null);

  // Sales settings (stock check, credit limit policy)
  const [salesSettings, setSalesSettings] = useState(null);
  const orderAutoNumbering = isAutoNumberingEnabled(salesSettings, 'SALES_ORDER');

  // ✅ LIVE STOCK MAP
  const [liveStockMap, setLiveStockMap] = useState({});

  useEffect(() => {
    if (focusedItem && focusedItem.code) {
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
  }, [focusedItem]); // INTENTIONAL: NOT including liveStockMap to avoid loops


  // Header Info
  const [soNumber, setSoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [linkedSourceType, setLinkedSourceType] = useState('');
  const [linkedSourceSearch, setLinkedSourceSearch] = useState('');
  const [linkedQtn, setLinkedQtn] = useState('');
  const [linkedPi, setLinkedPi] = useState('');

  const createBlankOrderItem = () => ({
    id: Date.now() + Math.random(),
    code: '',
    barcode: '',
    image: '',
    desc: '',
    remarks: '',
    unit: 'PCS',
    qty: 0,
    price: 0,
    cost: 0,
    foc: 0,
    focUnit: 'PCS',
    availableUnits: ['PCS'],
    disc: 0,
    tax: 5,
    taxAmt: 0,
    total: 0
  });

  // ✅ PRODUCT SELECTOR STATE
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  // QA-FAST-ENTRY: inline-row-search → product-selector bridge state
  const [pendingFastEntrySearch, setPendingFastEntrySearch] = useState('');
  const [pendingFastEntryRowId, setPendingFastEntryRowId] = useState(null);
  const inlineSearchRefs = useRef({});
  const focusNextInlineSearchRef = useRef(null);

  // Items
  const [items, setItems] = useState([createBlankOrderItem()]);

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

  const [billDiscount, setBillDiscount] = useState(0);
  // VAT mode for line-price interpretation (EXCLUSIVE | INCLUSIVE).
  const [vatMode, setVatMode] = useState('EXCLUSIVE');

  // Fallback VAT % from Tax Compliance for products without a per-item rate.
  const [activeVatRate, setActiveVatRate] = useState(null);
  useEffect(() => {
    getActiveVatRate().then(setActiveVatRate);
  }, []);

  // ✅ GLOBAL SHORTCUTS
  useShortcuts({
    'ctrl+p': (e) => {
      if (activeTab === 'create') setIsProductSelectorOpen(prev => !prev);
    },
    'ctrl+s': (e) => {
      if (activeTab === 'create') saveOrUpdateOrder();
    },
    'alt+c': (e) => {
      if (activeTab === 'create') setIsCustomerSearchOpen(prev => !prev);
    }
  });

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

  // Advance Payment
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [bankAccountOptions, setBankAccountOptions] = useState([]);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [modalPaymentDate, setModalPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalPaymentAmount, setModalPaymentAmount] = useState(0);
  const [modalPaymentRef, setModalPaymentRef] = useState('');
  const [modalPaymentMode, setModalPaymentMode] = useState('Cash');
  const [modalBankAccount, setModalBankAccount] = useState('');
  const [modalChequeDate, setModalChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalNotes, setModalNotes] = useState('');

  // Delivery
  const [deliveryType, setDeliveryType] = useState('Delivery');
  const [expectedDelivery, setExpectedDelivery] = useState('2026-01-16');
  const [shippingAddress, setShippingAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Notes
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Attachments
  const [attachmentName, setAttachmentName] = useState('No file chosen');
  const [attachmentFile, setAttachmentFile] = useState(null);

  // Locking Logic 
  const isLocked = status === 'INVOICED';

  // Stock Check Modal
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);

  // Item Add-ons Modal (Settings)
  const [selectedAddonItem, setSelectedAddonItem] = useState(null);

  // --- FETCH DATA ---
  useEffect(() => {
    fetchAllData();
    fetchSalesOrders();
  }, []);

  // ✅ HANDLE INCOMING QUOTATION
  const location = useLocation();
  const navigate = useNavigate();
  const activeLinkedDocumentNumber = linkedSourceType === 'quotation'
    ? linkedQtn
    : linkedSourceType === 'proforma'
      ? linkedPi
      : '';
  const hasLinkedDocument = Boolean(linkedQtn || linkedPi);

  const filteredLinkedDocuments = useMemo(() => {
    const query = linkedSourceSearch.trim().toLowerCase();

    if (linkedSourceType === 'quotation') {
      return quotationsList.filter((quotation) => {
        const number = (quotation.qtnNo || '').toLowerCase();
        const customer = (quotation.customer || '').toLowerCase();

        return !query || number.includes(query) || customer.includes(query);
      });
    }

    if (linkedSourceType === 'proforma') {
      return proformasList.filter((proforma) => {
        const number = (proforma.piNumber || '').toLowerCase();
        const customerName = (proforma.customerName || '').toLowerCase();
        const customerCode = (proforma.customerCode || '').toLowerCase();

        return !query
          || number.includes(query)
          || customerName.includes(query)
          || customerCode.includes(query);
      });
    }

    return [];
  }, [linkedSourceSearch, linkedSourceType, proformasList, quotationsList]);

  useEffect(() => {
    if (!isLinkedSourceOpen) {
      setLinkedSourceSearch(activeLinkedDocumentNumber);
    }
  }, [activeLinkedDocumentNumber, isLinkedSourceOpen]);

  useEffect(() => {
    if (location.state?.quotation) {
      const qtn = location.state.quotation;
      // Forward identifiers (customerId/customerCode/customerName) so handleSelectQuotation
      // can resolve the full customer master record without a fragile name match.
      handleSelectQuotation({
        qtnNo: qtn.qtnNo,
        customer: qtn.customer,
        customerId: qtn.customerId ?? null,
        customerCode: qtn.customerCode ?? '',
        customerName: qtn.customerName ?? qtn.customer,
        billDiscount: qtn.billDiscount,
        shippingAddress: qtn.shippingAddress || '',
        items: qtn.items || []
      });
      setActiveTab('create');
      // Clear state
      window.history.replaceState({}, document.title);
    }
  }, [location.state, customersList]);

  const fetchAllData = async () => {
    try {
      const [custResult, qtnResult, proformaResult, bankAccResult, settingsResult] = await Promise.allSettled([
        getAllCustomers(),
        getAllQuotations(),
        getAllProformas(),
        api.get('/api/ledger/accounts/bank-accounts').then(r => r.data),
        getSalesSettings()
      ]);

      const custData = custResult.status === 'fulfilled' ? custResult.value : [];
      const qtnData = qtnResult.status === 'fulfilled' ? qtnResult.value : [];
      const proformaData = proformaResult.status === 'fulfilled' ? proformaResult.value : [];
      const bankAccData = bankAccResult.status === 'fulfilled' ? bankAccResult.value : [];
      setBankAccountOptions(Array.isArray(bankAccData) ? bankAccData : []);
      const loadedSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      if (loadedSettings) {
        setSalesSettings(loadedSettings);
        if (!orderId && isAutoNumberingEnabled(loadedSettings, 'SALES_ORDER')) {
          getNextSalesOrderNumber().then(setSoNumber).catch(() => setSoNumber(''));
        }
      }

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
          trn: '',
          address: 'Counter Sale',
          balance: 0,
          creditStatus: 'Good'
        }, ...validCustomers];
      }
      setCustomersList(validCustomers);

      // ✅ Set default customer to Walk-in
      const walkIn = validCustomers.find(c => c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walkin') || c.name.toLowerCase() === 'cash customer');
      if (walkIn) {
        setSelectedCustomer(current => current || walkIn);
      }

      setQuotationsList(Array.isArray(qtnData) ? qtnData : []);
      setProformasList(Array.isArray(proformaData) ? proformaData : []);
    } catch (error) {
      console.error("Failed to fetch master data:", error);
    }
  };

  const fetchSalesOrders = async () => {
    setIsListLoading(true);
    try {
      const data = await getSalesOrdersPage({ page: listPage, size: 30 });
      const rows = Array.isArray(data?.content) ? data.content : [];
      setOrdersList(rows);
      setListPageMeta({
        page: data?.page ?? listPage,
        size: data?.size ?? 30,
        totalElements: data?.totalElements ?? 0,
        totalPages: data?.totalPages ?? 0,
      });
    } catch (err) {
      console.error("Failed to load sales orders", err);
    } finally {
      setIsListLoading(false);
    }
  };

  // Refetch when the user pages through the list.
  useEffect(() => {
    if (activeTab !== 'list') return;
    fetchSalesOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, listPage]);

  // Refetch when the global Branch Selector changes the active branch.
  useEffect(() => {
    const handler = () => fetchSalesOrders();
    window.addEventListener('billbull:branch-changed', handler);
    return () => window.removeEventListener('billbull:branch-changed', handler);
  }, []);

  // --- CALCULATIONS ---
  const calculateTotals = () => {
    const itemSummary = summarizeSalesItems(items, billDiscount);
    const grossTotal = itemSummary.grossTotal;
    const totalDiscount = itemSummary.itemDiscountTotal;
    const subTotal = itemSummary.subTotal;
    const billDiscountAmount = itemSummary.billDiscountAmount;
    const totalTax = itemSummary.tax;
    const orderTotal = itemSummary.grandTotal;
    const balanceDue = orderTotal - Number(advanceAmount);

    const totalCost = items.reduce((acc, i) => {
      const qty = Number(i.qty) || 0;
      const unitCost = i.cost > 0 ? i.cost : (i.price * 0.75);
      return acc + (qty * unitCost);
    }, 0);

    const profit = subTotal - totalCost;
    const marginPercent = subTotal > 0 ? (profit / subTotal) * 100 : 0;

    return { grossTotal, totalDiscount, subTotal, billDiscountAmount, totalTax, orderTotal, balanceDue, totalCost, profit, marginPercent };
  };

  const { grossTotal, totalDiscount, subTotal, billDiscountAmount, totalTax, orderTotal, balanceDue, totalCost, profit, marginPercent } = calculateTotals();

  // --- ACTIONS ---

  const calculateRow = (item) => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    const focQty = Number(item.foc) || 0;
    const discPercent = Number(item.disc) || 0;
    const taxPercent = Number(item.tax) || 0;

    const grossAmount = price * qty;
    let focDeduction = 0;

    if (focQty > 0 && item.focUnit) {
      const sellingUnit = item.unit;
      const focUnit = item.focUnit;

      if (sellingUnit === focUnit) {
        focDeduction = price * focQty;
      } else if (item.unitConversions) {
        const focConversion = item.unitConversions[focUnit] || 1;
        const sellingConversion = item.unitConversions[sellingUnit] || 1;
        const focInBaseUnit = focQty * focConversion;
        const focInSellingUnit = focInBaseUnit / sellingConversion;
        focDeduction = price * focInSellingUnit;
      }
    }

    const preDiscountAmount = Math.max(0, grossAmount - focDeduction);
    const discountAmount = preDiscountAmount * (discPercent / 100);
    const netAfterDiscount = preDiscountAmount - discountAmount;
    // VAT mode drives whether tax is on top (EXCLUSIVE) or extracted out
    // of the entered price (INCLUSIVE).
    const { taxableAmount, taxAmount, total } = computeLineTaxTotals({
      netAfterDiscount,
      taxPercent,
      vatMode,
    });

    return {
      ...item,
      qty,
      price,
      foc: focQty,
      disc: discPercent,
      tax: taxPercent,
      taxableAmount,
      taxAmt: taxAmount,
      discountAmount,
      total
    };
  };

  // Recompute every line when the VAT mode flips.
  useEffect(() => {
    setItems(prev => prev.map(item => calculateRow(item)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatMode]);

  const normalizeOrderItem = (item = {}, fallbackId = Date.now() + Math.random()) => {
    const resolvedUnit = item.unit || item.focUnit || 'PCS';
    const normalized = {
      id: fallbackId,
      soItemId: item.soItemId || null,
      code: item.code || item.itemCode || '',
      name: item.name || item.itemName || item.productName || '',
      brand: item.brand || item.brandName || '',
      sku: item.sku || item.productSku || '',
      shortDesc: item.shortDesc || '',
      detailedDesc: item.detailedDesc || '',
      localName: item.localName || item.productLocalName || '',
      barcode: item.barcode || item.itemBarcode || '',
      image: item.primaryImage || item.image || item.thumbnailUrl || item.imageUrl || '',
      desc: item.desc || item.description || '',
      remarks: item.remarks || item.description || item.desc || '',
      unit: resolvedUnit,
      qty: Number(item.qty ?? item.quantity) || 0,
      price: Number(item.price) || 0,
      cost: Number(item.cost) || ((Number(item.price) || 0) * 0.75),
      foc: Number(item.foc) || 0,
      focUnit: item.focUnit || resolvedUnit,
      availableUnits: Array.isArray(item.availableUnits) && item.availableUnits.length > 0
        ? item.availableUnits
        : [resolvedUnit],
      unitConversions: item.unitConversions || {},
      unitPrices: item.unitPrices || {},
      disc: Number(item.disc ?? item.discount) || 0,
      tax: Number(item.tax ?? item.taxRate ?? item.taxPercent) || 5,
      taxAmt: Number(item.taxAmt ?? item.taxAmount) || 0,
      total: Number(item.total ?? item.lineTotal) || 0,
      binId: item.binId ?? null,
      binCode: item.binCode || '',
      // QA-001: carry productType through so SERVICE lines stay gated post-conversion
      productType: (item.productType || 'STOCK').toUpperCase(),
      // SERVICE items never need batch selection regardless of upstream flags.
      batchControlled: (item.productType || '').toUpperCase() !== 'SERVICE'
        && Boolean(item.batchControlled ?? item.isBatch ?? item.product?.isBatch),
      fefoEnabled: item.fefoEnabled != null ? Boolean(item.fefoEnabled) : true,
      minExpiryDaysForSale: Number(item.minExpiryDaysForSale) || 0,
      baseRequiredQuantity: Number(item.baseRequiredQuantity) || 0,
      batchSelectedQuantity: Number(item.batchSelectedQuantity) || 0,
      batchSelectionMode: item.batchSelectionMode || 'AUTO_FEFO',
      batchSelections: Array.isArray(item.batchSelections) ? item.batchSelections : []
    };

    return calculateRow(normalized);
  };

  // ✅ PRODUCT SELECTOR HANDLER
  const handleAddSingleProduct = (product) => {
    const defaultUnit = getDefaultProductUnit(product);
    const policy = salesSettings?.salesItemPricePolicy;
    const policyPrice = pickSalesItemPrice(product, policy);
    // When the user explicitly opts into Max/Min as the default, that
    // configured master price wins over any per-packing unitPrice. For the
    // legacy RETAIL policy we keep the unit-aware behaviour.
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
      brand: product.brandName || product.brand || '',
      shortDesc: product.shortDesc || '',
      detailedDesc: product.detailedDesc || '',
      barcode: product.barcode || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
      desc: product.name || product.description || '',
      remarks: product.detailedDesc || product.description || product.remarks || '',
      unit: defaultUnit,
      qty: 1,
      price: price,
      cost: cost,
      foc: 0,
      focUnit: defaultUnit,
      availableUnits: product.availableUnits || ['PCS'],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      disc: disc,
      tax: tax,
      taxAmt: 0,
      total: 0,
      // QA-001: SERVICE products never have batches.
      productType: (product.productType || 'STOCK').toUpperCase(),
      batchControlled: (product.productType || '').toUpperCase() !== 'SERVICE'
        && Boolean(product.batchControlled ?? product.isBatch ?? product.batch),
      fefoEnabled: product.fefoEnabled != null ? Boolean(product.fefoEnabled) : true,
      minExpiryDaysForSale: Number(product.minExpiryDaysForSale) || 0,
      batchSelectedQuantity: 0,
      batchSelections: []
    };

    const newItem = calculateRow(rawItem);

    // QA-FAST-ENTRY: replace-in-place when triggered by inline row search.
    const targetRowId = pendingFastEntryRowId;
    setItems(prev => {
      if (targetRowId != null) {
        return prev.map(it => it.id === targetRowId ? { ...newItem, id: targetRowId } : it);
      }
      // Replace empty placeholder rows when first product is added
      const hasData = prev.some(i => i.code || i.desc);
      return hasData ? [...prev, newItem] : [newItem];
    });
    const filledItem = { ...newItem, id: targetRowId != null ? targetRowId : newItem.id };
    setPendingFastEntrySearch('');
    setPendingFastEntryRowId(null);

    setIsProductSelectorOpen(false); // ✅ Close modal after adding
    setFocusedItem(filledItem);
    setTimeout(() => {
      const qtyEl = document.getElementById(`qty-${filledItem.id}`);
      if (qtyEl) { qtyEl.focus(); qtyEl.select?.(); }
    }, 100);
  };

  const handleFastEntryAdd = (product, qty, price, disc) => {
    if (isLocked) return;
    const defaultUnit = getDefaultProductUnit(product);
    const cost = parseFloat(product.cost) || 0;
    const tax = resolveLineTaxRate(product, activeVatRate);
    const rawItem = {
      id: Date.now() + Math.random(),
      code: product.code,
      name: product.name || '',
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
      isProductSelected: true,
      // QA-001: SERVICE products never have batches.
      productType: (product.productType || 'STOCK').toUpperCase(),
      batchControlled: (product.productType || '').toUpperCase() !== 'SERVICE'
        && Boolean(product.batchControlled ?? product.isBatch ?? product.batch),
      fefoEnabled: product.fefoEnabled != null ? Boolean(product.fefoEnabled) : true,
      minExpiryDaysForSale: Number(product.minExpiryDaysForSale) || 0,
      batchSelectedQuantity: 0,
      batchSelections: []
    };
    const newItem = calculateRow(rawItem);
    setItems(prev => {
      const isFirstItemEmpty = prev.length === 1 && !prev[0].code && !prev[0].desc;
      return isFirstItemEmpty ? [newItem] : [...prev, newItem];
    });
  };

  const buildFallbackCustomer = (name, code = '') => ({
    code,
    name: name || code || 'Linked Customer',
    trn: '',
    phone: '',
    mobile: '',
    balance: 0,
    creditStatus: 'Good'
  });

  const applyLinkedDocumentItems = (sourceItems = []) => {
    const mappedItems = sourceItems.map((item, index) =>
      normalizeOrderItem(item, Date.now() + index + Math.random())
    );

    if (mappedItems.length > 0) {
      setItems(mappedItems);
      setFocusedItem(mappedItems[0] || null);
      return;
    }

    setItems([createBlankOrderItem()]);
    setFocusedItem(null);
  };

  const handleLinkedSourceTypeChange = (nextType) => {
    if (isLocked) return;
    if (nextType === linkedSourceType) return;

    setLinkedSourceType(nextType);
    setLinkedSourceSearch('');
    setLinkedQtn('');
    setLinkedPi('');
    setBillDiscount(0);
    setIsLinkedSourceOpen(false);
  };

  const handleLinkedSourceSearchFocus = (event) => {
    event.stopPropagation();
    if (isLocked || !linkedSourceType) return;

    setLinkedSourceSearch(activeLinkedDocumentNumber);
    setIsLinkedSourceOpen(true);
  };

  const handleLinkedSourceSearchChange = (value) => {
    if (isLocked || !linkedSourceType) return;

    setLinkedSourceSearch(value);
    setIsLinkedSourceOpen(true);
  };

  const handleConfirmOrder = () => {
    const hasItems = items.some(i => i.code && i.qty > 0);
    if (!hasItems) {
      setShowItemError(true);
      return;
    }
    setShowItemError(false);
    saveOrUpdateOrder('CONFIRMED');
  };

  const handleConvertToDeliveryNote = () => {
    if (!orderId) {
      alert('Save and confirm the order first before converting to a Delivery Note.');
      return;
    }
    navigate('/sales/deliverynote', {
      state: {
        fromSalesOrder: {
          id: orderId,
          soNumber,
        }
      }
    });
  };

  // QA-032: Print the auto-generated Advance Receipt Voucher for this SO
  // inline using the template pipeline instead of navigating away.
  const handlePrintAdvanceReceipt = async () => {
    if (!orderId) {
      alert('Save the sales order first.');
      return;
    }
    try {
      const vouchers = await getSalesOrderReceiptVouchers(orderId);
      if (!vouchers || vouchers.length === 0) {
        alert('No advance receipt voucher exists for this order yet. Save the order with an advance amount first.');
        return;
      }
      const voucher = vouchers[0];
      let templates = await getTemplatesByCategory('Receipt Voucher').catch(() => []);
      if (!templates || templates.length === 0) {
        templates = await getTemplatesByCategory('Payment Voucher').catch(() => []);
      }
      const rawTemplate = (templates && (templates.find(t => t.isDefault) || templates[0])) || null;
      const template = normalizePurchaseTemplate(
        { ...(rawTemplate || {}), category: 'Receipt Voucher' },
        'Receipt Voucher'
      );
      const paymentLike = {
        paymentNumber: voucher.voucherId,
        paymentDate: voucher.date,
        customerName: voucher.memberName || selectedCustomer?.name,
        customerCode: voucher.customerCode || selectedCustomer?.code,
        amount: voucher.amount,
        paymentMode: voucher.paymentMode,
        referenceNumber: voucher.reference,
        bankName: voucher.bankAccount,
        chequeDate: voucher.chequeDate,
        notes: voucher.notes,
        linkedInvoice: soNumber ? `SO: ${soNumber}` : undefined,
        status: voucher.status,
      };
      const printData = buildReceiptVoucherPrintData(
        paymentLike,
        { name: selectedCustomer?.name, code: selectedCustomer?.code },
        company
      );
      const html = await generatePrintHtmlAsync(template, printData, {
        companyProfile: buildDocumentHeaderProfile({
          company,
          branches: availableBranches || [],
          branchId: loadedSoBranchId ?? activeBranch?.id,
        }),
      });
      printHtml(html);
    } catch (err) {
      console.error('Failed to print advance receipt', err);
      alert('Failed to generate print layout.');
    }
  };

  const handleProceedToInvoice = () => {
    navigate('/sales/invoice', {
      state: {
        fromSalesOrder: {
          soNumber,
          customer: selectedCustomer?.name || selectedCustomer?.code || '',
          customerId: selectedCustomer?.id ?? null,
          customerCode: selectedCustomer?.code || '',
          customerName: selectedCustomer?.name || '',
          linkedQuotation: linkedQtn || '',
          linkedProforma: linkedPi || '',
          billDiscount: Number(billDiscount) || 0,
          shippingAddress: shippingAddress || '',
          // QA-032: carry the SO advance so the destination invoice can
          // pre-fill amountCollected and surface the advance to the user.
          advanceAmount: Number(advanceAmount) || 0,
          items: items
            .filter(i => i.code && i.qty > 0)
            .map(i => ({
              // Persisted SO line id — must travel with the line so the invoice
              // (and the auto-generated DN downstream) can look up the SO's
              // batch reservations via BatchSelectionService.DOC_TYPE_SALES_ORDER.
              id: i.soItemId || null,
              code: i.code,
              desc: i.desc,
              image: i.image || '',
              unit: i.unit,
              qty: i.qty,
              price: i.price,
              disc: i.disc,
              tax: i.tax,
              taxAmt: i.taxAmt,
              total: i.total,
              cost: i.cost,
              // Carry batch metadata so the invoice editor renders "Batches X/Y"
              // correctly and the auto-DN can reuse the SO's batch picks.
              batchControlled: Boolean(i.batchControlled),
              fefoEnabled: i.fefoEnabled != null ? Boolean(i.fefoEnabled) : true,
              minExpiryDaysForSale: Number(i.minExpiryDaysForSale) || 0,
              batchSelectedQuantity: Number(i.batchSelectedQuantity) || 0,
              batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [],
              warehouseId: i.warehouseId || null,
              binId: i.binId || null,
            }))
        }
      }
    });
  };

  // ✅ PRINT FUNCTIONALITY
  const [isPrinting, setIsPrinting] = useState(false);

  // QA-040: shared payload builder reused by both Print and the Send-Email
  // modal so the emailed Sales Order mirrors exactly what Print produces.
  const buildSoPrintData = () => {
    const fullCustomer = customersList.find(c => c.code === selectedCustomer?.code);

    return {
      title: 'SALES ORDER',
      docNo: soNumber,
      date: orderDate,
      customer: {
        name: selectedCustomer?.name || '',
        address: fullCustomer?.address || fullCustomer?.billingAddress || '',
        shippingAddress: shippingAddress || '',
        phone: fullCustomer?.mobile || fullCustomer?.phone || '',
        email: fullCustomer?.email || '',
        trn: selectedCustomer?.trn || fullCustomer?.trn
      },
      items: items.filter(i => i.code || i.desc).map(i => ({
        code: i.code,
        name: i.name || i.productName || i.itemName || '',
        desc: i.desc || '',
        sku: i.sku || i.productSku || '',
        brand: i.brand || i.brandName || '',
        shortDesc: i.shortDesc || '',
        detailedDesc: i.detailedDesc || '',
        localName: i.localName || i.productLocalName || '',
        barcode: i.barcode || '',
        salesPerson: '',
        location: '',
        unit: i.unit,
        qty: Number(i.qty),
        price: Number(i.price),
        disc: Number(i.disc),
        tax: Number(i.tax),
        taxAmt: Number(i.taxAmt || 0),
        total: Number(i.total),
        image: i.image ? getImageUrl(i.image) : '',
        batchNumber: i.batchNumber || '',
        batchSelections: Array.isArray(i.batchSelections) ? i.batchSelections : [],
        expiry: i.expiry || i.expiryDate || ''
      })),
      totals: {
        subTotal,
        tax: totalTax,
        grandTotal: orderTotal,
        currency: company?.currencySymbol || company?.currency || 'AED',
        billDiscount: Number(billDiscount) || 0,
        billDiscountAmount
      },
      meta: (() => {
        const printBranchId = loadedSoBranchId ?? activeBranch?.id;
        const printBranch = availableBranches?.find(b => b.id === printBranchId) || activeBranch || {};
        return {
          paymentTerm: '30 Days',
          status,
          notes: customerNotes,
          reference: linkedQtn || linkedPi || '',
          location: printBranch.name || '',
          locationStore: printBranch.name || printBranch.code || '',
          warehouse: printBranch.defaultWarehouseName || '',
          deliveryTerms: deliveryType || '',
          salesPerson: ''
        };
      })()
    };
  };

  const handlePrintClick = async () => {
    setIsPrinting(true);
    try {
      const templates = await getTemplatesByCategory('Sales Order (SO)'); // Category: SalesOrder
      const defaultTemplate = templates.find(t => t.isDefault);

      if (defaultTemplate) {
        const printData = buildSoPrintData();

        const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
          companyProfile: buildDocumentHeaderProfile({
            company,
            branches: availableBranches || [],
            branchId: loadedSoBranchId ?? activeBranch?.id,
          }),
          billBullLogo
        });
        printHtml(html);
      } else {
        alert("No default template selected for Sales Order. Please configure one in Settings.");
      }
    } catch (error) {
      console.error("Print error:", error);
      alert("Failed to print.");
    } finally {
      setIsPrinting(false);
    }
  };

  // ✅ New Handler for Pay Button
  const handleOpenPaymentModal = () => {
    const outstanding = Math.max(orderTotal - Number(advanceAmount), 0);
    setModalPaymentAmount(outstanding > 0 ? outstanding.toFixed(2) : '');
    setModalPaymentDate(new Date().toISOString().split('T')[0]);
    setModalPaymentMode('Cash');
    setModalBankAccount('');
    setModalChequeDate(new Date().toISOString().split('T')[0]);
    setModalPaymentRef('');
    setModalNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleAddPaymentFromModal = () => {
    if (!modalPaymentAmount || Number(modalPaymentAmount) <= 0) {
      return alert("Please enter a valid amount.");
    }
    setAdvanceAmount(prev => Number(prev) + Number(modalPaymentAmount));
    setPaymentMethod(modalPaymentMode);
    setPaymentRef(modalPaymentRef);
    setPaymentNotes(modalNotes);
    setIsPaymentModalOpen(false);
  };

  // ✅ FIX 4: INCLUDE ID IN PAYLOAD
  const saveOrUpdateOrder = async (targetStatus = 'DRAFT') => {
    if (!orderAutoNumbering && !soNumber.trim()) {
      alert('Please enter a sales order number.');
      return;
    }

    const sanitizedLinkedQuotation = linkedSourceType === 'quotation' ? linkedQtn.trim() : '';
    const sanitizedLinkedProforma = linkedSourceType === 'proforma' ? linkedPi.trim() : '';

    const payload = {
      id: orderId, // <--- Sent ID to backend to update existing record
      soNumber,
      orderDate,

      customerCode: selectedCustomer?.code || '',
      customerName: selectedCustomer?.name || '',
      linkedQuotation: sanitizedLinkedQuotation,
      linkedProforma: sanitizedLinkedProforma,
      billDiscount: Number(billDiscount) || 0,
      vatMode,

      // Payment & Delivery
      advanceAmount: Number(advanceAmount),
      paymentMethod,
      paymentReference: paymentRef,
      deliveryType,
      expectedDeliveryDate: expectedDelivery,
      shippingAddress,
      deliveryInstructions,

      // Notes
      customerNotes,
      internalNotes,
      status: targetStatus,

      // Map Items
      items: items.map(i => ({
        id: (orderId && i.soItemId) ? i.soItemId : null,
        itemCode: i.code,
        barcode: i.barcode || '',
        image: i.image || '',
        description: i.desc,
        remarks: i.remarks || '',
        unit: i.unit,
        quantity: Number(i.qty),
        price: Number(i.price),
        cost: Number(i.cost),
        discount: Number(i.disc),
        taxRate: Number(i.tax),
        taxAmount: Number(i.taxAmt),
        lineTotal: Number(i.total),
        foc: Number(i.foc) || 0,
        focUnit: i.focUnit || i.unit || 'PCS',
        binId: i.binId || null
      }))
    };

    // Stock check enforcement
    if (salesSettings?.stockCheckRequired) {
      const stockIssues = [];
      for (const item of items) {
        if (!item.code) continue;
        // QA-001: service items have no inventory — skip stock validation.
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
        alert(`Insufficient stock for the following items:\n\n${stockIssues.join('\n')}\n\nPlease adjust quantities or disable stock check in Configure & customize.`);
        return;
      }
    }

    // Credit limit BLOCK enforcement
    if (salesSettings?.creditLimitPolicy === 'BLOCK' &&
      selectedCustomer?.creditLimitAmount > 0 &&
      (Number(selectedCustomer.balance || 0) + orderTotal) > selectedCustomer.creditLimitAmount) {
      alert(`Credit Limit Exceeded: The projected outstanding balance (${formatCurrencyDisplay(Number(selectedCustomer.balance || 0) + orderTotal, company)}) exceeds this customer's credit limit of ${formatCurrencyDisplay(selectedCustomer.creditLimitAmount, company)}.\n\nThis order cannot be saved. Please collect payment first or adjust the credit limit in the customer profile.`);
      return;
    }

    try {
      const savedOrder = await saveSalesOrder(payload);

      // Upload file AFTER save (needs Order ID)
      if (attachmentFile && savedOrder?.id) {
        await uploadSalesOrderAttachment(savedOrder.id, attachmentFile);
      }

      // Refresh List & Update UI with BACKEND Status
      await fetchSalesOrders();

      // Update local state to match saved record
      setOrderId(savedOrder.id); // Ensure subsequent saves are updates
      setSoNumber(savedOrder.soNumber || soNumber);
      setStatus(savedOrder.status);
      if (Array.isArray(savedOrder.items)) {
        const mappedItems = savedOrder.items.map((item, index) =>
          normalizeOrderItem({ ...item, soItemId: item.id }, Date.now() + index)
        );
        setItems(mappedItems.length > 0 ? mappedItems : [createBlankOrderItem()]);
        setFocusedItem(mappedItems[0] || null);
      }

      const hasBatchLines = Array.isArray(savedOrder.items)
        && savedOrder.items.some(item => item.batchControlled);
      if (targetStatus === 'DRAFT' && hasBatchLines) {
        setActiveTab('create');
        alert('Draft saved. Select exact batches for each batch-controlled line, then confirm the Sales Order.');
      } else {
        setActiveTab('list');
      }
      setAttachmentFile(null);
    } catch (e) {
      console.error("Save failed", e);
      const msg = e?.response?.data?.message || e?.response?.data || e?.message || "Please check inputs.";
      alert(`Failed to save Sales Order: ${msg}`);
    }
  };

  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    const _defaultAddr = (cust.savedAddresses || []).find(a => a.isDefault);
    const _resolvedAddr = _defaultAddr
      ? [_defaultAddr.address1, _defaultAddr.address2, _defaultAddr.city, _defaultAddr.country].filter(Boolean).join(', ')
      : (cust.defaultShippingAddress || cust.shippingAddress || cust.billingAddress || cust.address || '');
    setShippingAddress(_resolvedAddr);
    setIsCustomerSearchOpen(false);
  };

  const handleBatchSelectionSaved = async (updatedOrder) => {
    if (updatedOrder?.id) {
      setOrderId(updatedOrder.id);
      setStatus(updatedOrder.status || status);
      const mappedItems = (updatedOrder.items || []).map((item, index) =>
        normalizeOrderItem({ ...item, soItemId: item.id }, Date.now() + index)
      );
      setItems(mappedItems.length > 0 ? mappedItems : [createBlankOrderItem()]);
      setFocusedItem(mappedItems[0] || null);
      await fetchSalesOrders();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File is too large. Maximum size is 5MB.");
        return;
      }
      setAttachmentFile(file);
      setAttachmentName(file.name);
    }
  };

  const handleRemoveFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentName('No file chosen');
    setAttachmentFile(null);
  };

  const handleSelectQuotation = (qtn) => {
    if (!orderId) {
      if (orderAutoNumbering) {
        getNextSalesOrderNumber().then(setSoNumber).catch(() => setSoNumber(''));
      } else {
        setSoNumber('');
      }
    }
    setLinkedSourceType('quotation');
    setLinkedQtn(qtn.qtnNo);
    setLinkedPi('');
    setLinkedSourceSearch(qtn.qtnNo || '');
    setBillDiscount(Number(qtn.billDiscount) || 0);

    if (qtn.customer || qtn.customerId || qtn.customerCode) {
      // Centralised resolution: id → code → name → fuzzy. Falls back to a thin
      // object only when the customer truly isn't in the loaded list.
      const { customer: cust, shippingAddress: resolvedShipping } = hydrateCustomerFromSource(
        {
          customerId: qtn.customerId,
          customerCode: qtn.customerCode,
          customerName: qtn.customerName ?? qtn.customer,
          shippingAddress: qtn.shippingAddress,
        },
        customersList,
        { fallbackName: qtn.customer }
      );
      setSelectedCustomer(cust);
      setShippingAddress(resolvedShipping);
    }

    applyLinkedDocumentItems(qtn.items || []);

    setIsLinkedSourceOpen(false);
  };

  const handleSelectProforma = (proforma) => {
    if (!orderId) {
      if (orderAutoNumbering) {
        getNextSalesOrderNumber().then(setSoNumber).catch(() => setSoNumber(''));
      } else {
        setSoNumber('');
      }
    }

    setLinkedSourceType('proforma');
    setLinkedPi(proforma.piNumber || '');
    setLinkedQtn('');
    setLinkedSourceSearch(proforma.piNumber || '');
    setBillDiscount(Number(proforma.billDiscount) || 0);

    const { customer: cust, shippingAddress: resolvedShipping } = hydrateCustomerFromSource(
      {
        customerId: proforma.customerId,
        customerCode: proforma.customerCode,
        customerName: proforma.customerName,
        shippingAddress: proforma.shippingAddress,
      },
      customersList
    );
    setSelectedCustomer(cust);
    setShippingAddress(resolvedShipping);

    applyLinkedDocumentItems(proforma.items || []);

    setIsLinkedSourceOpen(false);
  };

  // ✅ FIX 2: SET ID WHEN LOADING
  const handleLoadOrder = (order) => {
    setOrderId(order.id); // <--- Capture Backend ID
    setLoadedSoBranchId(order.branch?.id ?? null);

    setSoNumber(order.soNumber);
    setOrderDate(order.orderDate);

    // Resolve the full customer master record so the panel shows phone/balance/TRN/
    // savedAddresses — the SO entity only persists code+name, so a thin object would
    // leave the rest blank.
    const matched = resolveCustomer(
      { customerCode: order.customerCode, customerName: order.customerName },
      customersList
    );
    setSelectedCustomer(matched || { code: order.customerCode, name: order.customerName });

    const hasLinkedQuotation = Boolean(order.linkedQuotation);
    const hasLinkedProforma = Boolean(order.linkedProforma);
    setLinkedSourceType(hasLinkedQuotation ? 'quotation' : hasLinkedProforma ? 'proforma' : '');
    setLinkedQtn(order.linkedQuotation || '');
    setLinkedPi(order.linkedProforma || '');
    setLinkedSourceSearch(hasLinkedQuotation ? (order.linkedQuotation || '') : (order.linkedProforma || ''));
    setVatMode(order.vatMode === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE');

    // Map items back
    if (order.items) {
      const mappedItems = order.items.map((item, index) => normalizeOrderItem({ ...item, soItemId: item.id }, Date.now() + index));
      setItems(mappedItems);
      setFocusedItem(mappedItems[0] || null);
    } else {
      setItems([createBlankOrderItem()]);
      setFocusedItem(null);
    }

    setAdvanceAmount(order.advanceAmount || 0);
    setBillDiscount(Number(order.billDiscount) || 0);
    setPaymentMethod(order.paymentMethod || 'Cash');
    setPaymentRef(order.paymentReference || '');
    setDeliveryType(order.deliveryType || 'Delivery');
    setExpectedDelivery(order.expectedDeliveryDate || '');
    setShippingAddress(order.shippingAddress || '');
    setDeliveryInstructions(order.deliveryInstructions || '');
    setCustomerNotes(order.customerNotes || '');
    setInternalNotes(order.internalNotes || '');
    setStatus(order.status);

    setAttachmentName('No file chosen');
    setAttachmentFile(null);
    setActiveTab('create');
  };

  // ✅ FIX 3: RESET ID WHEN CREATING NEW
  const handleCreateNew = () => {
    setOrderId(null); // <--- Reset to null for new creation

    if (orderAutoNumbering) {
      getNextSalesOrderNumber().then(setSoNumber).catch(() => setSoNumber(''));
    } else {
      setSoNumber('');
    }
    setOrderDate(new Date().toISOString().split('T')[0]);

    // ✅ Set default customer to Walk-in
    const walkIn = customersList.find(c => c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walkin') || c.name.toLowerCase() === 'cash customer');
    setSelectedCustomer(walkIn || null);

    setLinkedSourceType('');
    setLinkedSourceSearch('');
    setLinkedQtn('');
    setLinkedPi('');
    setItems([createBlankOrderItem()]);
    setBillDiscount(0);
    setAdvanceAmount(0);
    setPaymentMethod('Cash');
    setPaymentRef('');
    setDeliveryType('Delivery');
    setExpectedDelivery('');
    setShippingAddress('');
    setDeliveryInstructions('');
    setCustomerNotes('');
    setInternalNotes('');
    setStatus('DRAFT');
    setAttachmentName('No file chosen');
    setAttachmentFile(null);
    setActiveTab('create');
    setFocusedItem(null);
  };

  // --- ITEM HANDLERS ---
  const handleItemChange = (id, field, value) => {
    if (isLocked) return;
    if (showItemError) setShowItemError(false);

    setItems(items.map(item => {
      if (item.id === id) {
        const stringFields = new Set(['desc', 'remarks', 'unit', 'code', 'image', 'focUnit', 'barcode']);
        let newItem = { ...item, [field]: stringFields.has(field) ? value : Number(value) };

        if (field === 'price') {
          const price = Number(value) || 0;
          newItem.cost = price * 0.75;
        }

        // ✅ If unit is being changed, recalculate price based on conversion
        if (field === 'unit' && item.unitConversions) {
          const newUnit = value;

          newItem.price = resolveUnitAmount({
            targetUnit: newUnit,
            amountMap: item.unitPrices,
            unitConversions: item.unitConversions,
            currentUnit: item.unit,
            currentAmount: item.price,
            fallbackAmount: item.price
          });

          if (newItem.price) {
            newItem.cost = newItem.price * 0.75;
          }
        }

        newItem = calculateRow(newItem);

        // Update focused item if this is the one being edited
        if (focusedItem && focusedItem.id === id) {
          setFocusedItem(newItem);
        }

        return newItem;
      }
      return item;
    }));
  };

  const handleAddItem = () => {
    if (isLocked) return;
    setItems([...items, { id: Date.now(), code: '', barcode: '', image: '', desc: '', remarks: '', unit: 'PCS', qty: 0, price: 0, cost: 0, foc: 0, focUnit: 'PCS', availableUnits: ['PCS'], disc: 0, tax: 5, taxAmt: 0, total: 0 }]);
  };

  const handleDeleteItem = (id) => {
    if (isLocked) return;
    const nextItems = items.filter(i => i.id !== id);
    setItems(nextItems.length > 0 ? nextItems : [createBlankOrderItem()]);
    if (focusedItem && focusedItem.id === id) {
      setFocusedItem(null);
    }
  };

  const renderStatusBadge = (currentStatus) => {
    const s = currentStatus?.toUpperCase();

    let styles = "bg-slate-100 border-slate-200 text-slate-600";
    let label = "Draft";

    if (s === 'CONFIRMED') {
      styles = "bg-emerald-50 border-emerald-200 text-emerald-700";
      label = "Confirmed";
    } else if (s === 'INVOICED') {
      styles = "bg-blue-50 border-blue-200 text-blue-700";
      label = "Invoiced";
    } else if (s === 'PARTIALLY_PAID') {
      styles = "bg-purple-50 border-purple-200 text-purple-700";
      label = "Partially Paid";
    } else if (s === 'FULLY_PAID') {
      styles = "bg-emerald-100 border-emerald-300 text-emerald-800";
      label = "Fully Paid";
    }

    return <span className={`px-2 py-0.5 border rounded text-[10px] font-bold ${styles}`}>{label}</span>;
  };

  const getPaymentColorClass = () => {
    const adv = Number(advanceAmount);
    if (adv === 0) return 'text-slate-700';
    if (adv >= orderTotal && orderTotal > 0) return 'text-emerald-600 font-bold';
    return 'text-red-600 font-bold';
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4" onClick={() => { setIsCustomerOpen(false); setIsLinkedSourceOpen(false); }}>

      {/* ✅ PRODUCT SELECTOR MODAL */}
      <ProductSelector
        isOpen={isProductSelectorOpen}
        onClose={() => { setIsProductSelectorOpen(false); setPendingFastEntryRowId(null); }}
        onSelect={handleAddSingleProduct}
        onInlineAdd={handleFastEntryAdd}
        initialSearch={pendingFastEntrySearch}
        title="Select Items from Products / Services"
        actionLabel="Add to Order"
        mode="sales"
        salesItemPricePolicy={salesSettings?.salesItemPricePolicy}
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
        sourceType="SALES_ORDER"
        sourceDocumentId={orderId}
        salesOrderId={orderId}
        itemId={batchSelectionTarget?.item?.soItemId || batchSelectionTarget?.item?.id}
        itemCode={batchSelectionTarget?.item?.code}
        itemName={batchSelectionTarget?.item?.desc}
        locationCode={batchSelectionTarget?.item?.binCode}
        binId={batchSelectionTarget?.item?.binId}
        requiredQuantity={batchSelectionTarget?.item?.baseRequiredQuantity || batchSelectionTarget?.item?.qty}
        fefoEnabled={batchSelectionTarget?.item?.fefoEnabled}
        minExpiryDaysForSale={batchSelectionTarget?.item?.minExpiryDaysForSale}
        currentSelections={batchSelectionTarget?.item?.batchSelections || []}
        canManualSelect={canManualBatchSelect}
      />

      <ItemAddOnsModal
        item={selectedAddonItem}
        onClose={() => setSelectedAddonItem(null)}
        onSave={(updated) => {
          setItems(items.map(i => i.id === updated.id ? updated : i));
          setSelectedAddonItem(null);
        }}
        isReadOnly={isLocked}
      />

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FileText className="text-[#F5C742]" size={28} /> Sales Orders</h1>
          <p className="text-xs text-slate-500">Approved quotations & proforma invoices converted into sales orders.</p>
        </div>
        {/* ── VERTICAL: canExport('sales') for Print/Email/WhatsApp/SMS ── */}
        {canExport('sales.order') && (
          <div className="flex flex-wrap gap-2">
            {['Email', 'WhatsApp', 'SMS', 'Print'].map((label) => (
              <button key={label} onClick={
                label === 'Print' ? handlePrintClick
                  : label === 'Email' ? () => {
                    if (!orderId) { alert('Please save the Sales Order before sending an email.'); return; }
                    setIsEmailModalOpen(true);
                  }
                  : undefined
              } disabled={label === 'Print' && isPrinting} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-50">
                {label === 'Email' && <Mail size={14} />}
                {label === 'WhatsApp' && <MessageCircle size={14} />}
                {label === 'SMS' && <Smartphone size={14} />}
                {label === 'Print' && <Printer size={14} />}
                {label === 'Print' && isPrinting ? 'Printing...' : label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-1 mb-4 bg-white p-1 rounded-lg w-full md:w-fit border border-slate-200 shadow-sm">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Sales Order List
        </button>
        {/* ── VERTICAL: canCreate('sales') ── */}
        {canCreate('sales.order') && (
          <button
            onClick={handleCreateNew}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'create' ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Create New Sales Order
          </button>
        )}
      </div>

      {/* ======================= VIEW: LIST ======================= */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 md:gap-0">
            <h2 className="font-bold text-slate-700 text-sm">Sales Orders</h2>
            <div className="flex flex-col md:flex-row gap-3 items-center w-full md:w-auto">
              <div className="relative w-full md:w-auto">
                <input type="text" placeholder="Search by SO / customer / quotation" className="pl-3 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-full md:w-64 focus:outline-none focus:border-yellow-400" />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <select className="py-1.5 px-2 text-xs border border-slate-200 rounded-md focus:outline-none bg-white flex-1 md:flex-none">
                  <option>Status filter</option>
                  <option>Draft</option>
                  <option>Confirmed</option>
                  <option>Partially Paid</option>
                </select>
                {canExport('sales.order') && (
                  <ExportDropdown
                    onExportExcel={() => exportToExcel(
                      withListSerialNumbers(exportOrdersList, {
                        documentNumberSelector: (order) => order.soNumber,
                        page: listPageMeta.page,
                        size: listPageMeta.size,
                        totalElements: listPageMeta.totalElements,
                      }),
                      SALES_ORDER_COLUMNS,
                      'Sales_Orders'
                    )}
                    onExportPdf={() => exportToPDF(
                      withListSerialNumbers(exportOrdersList, {
                        documentNumberSelector: (order) => order.soNumber,
                        page: listPageMeta.page,
                        size: listPageMeta.size,
                        totalElements: listPageMeta.totalElements,
                      }),
                      SALES_ORDER_COLUMNS,
                      'Sales Orders',
                      'Sales_Orders'
                    )}
                  />
                )}
                {/* ── VERTICAL: canCreate('sales') ── */}
                {canCreate('sales.order') && (
                  <button onClick={handleCreateNew} className="flex items-center justify-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-bold rounded hover:bg-yellow-500 whitespace-nowrap flex-1 md:flex-none">
                    <Plus size={14} /> New Sales Order
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* SALES ORDERS LIST */}
          <div className="space-y-4">

            {/* DESKTOP TABLE VIEW */}
            <table className="w-full text-xs text-left hidden md:table">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center text-slate-500 w-16 select-none">S.No.</th>
                  <th className="px-4 py-3">SO No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Quotation</th>
                  <th className="px-4 py-3">PI No</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Advance</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isListLoading && <TableSkeleton cols={10} rows={8} />}
                {ordersList.map((order, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleLoadOrder(order)}>
                    <td className="px-4 py-3 text-center text-slate-400 font-mono font-medium">
                      {getListSerialNumber(idx, {
                        documentNumber: order.soNumber,
                        page: listPageMeta.page,
                        size: listPageMeta.size,
                        totalElements: listPageMeta.totalElements,
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{order.soNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDisplayDate(order.orderDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{order.customerName}</td>
                    <td className="px-4 py-3 text-slate-600 text-[11px]">
                      {order.branch?.name ? (
                        <>
                          <div className="font-medium">{order.branch.name}</div>
                          {order.branch.code && <div className="text-slate-400">{order.branch.code}</div>}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{order.linkedQuotation || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{order.linkedProforma || '-'}</td>
                    <td className="px-4 py-3 font-medium"><CurrencyAmount value={order.orderTotal} currency={orderCurrency} /></td>
                    <td className="px-4 py-3"><CurrencyAmount value={order.advanceAmount} currency={orderCurrency} /></td>
                    <td className="px-4 py-3"><CurrencyAmount value={Number(order.orderTotal) - Number(order.advanceAmount)} currency={orderCurrency} /></td>
                    <td className="px-4 py-3 text-right">
                      {renderStatusBadge(order.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* MOBILE CARD VIEW */}
            <div className="md:hidden">
              {ordersList.map((order) => (
                <MobileCard
                  key={order.id || order.soNumber}
                  order={order}
                  onClick={handleLoadOrder}
                  getStatusBadge={renderStatusBadge}
                  currency={orderCurrency}
                />
              ))}
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

      {/* ======================= VIEW: CREATE ======================= */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 relative mb-24 md:mb-16">

          {/* LEFT COLUMN */}
          <div className="xl:col-span-1 space-y-4">

            {/* 1. SALES ORDER DETAILS */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Sales Order Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-500 mb-1">Sales Order No.</label>
                  <input
                    type="text"
                    value={soNumber}
                    onChange={(e) => setSoNumber(e.target.value)}
                    readOnly={isLocked || orderAutoNumbering}
                    placeholder={orderAutoNumbering ? 'Auto generated' : 'Enter sales order number'}
                    className="text-xs p-2 border border-slate-200 rounded text-slate-700 font-medium read-only:bg-slate-50 read-only:text-slate-500 focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-500 mb-1">Order Date</label>
                  <input type="date" disabled={isLocked} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="text-xs p-2 border border-slate-200 rounded text-slate-700 focus:outline-none focus:border-yellow-400" />
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-500 mb-1">Linked Source</label>
                  <div className="relative">
                    <select
                      value={linkedSourceType}
                      disabled={isLocked}
                      onChange={(e) => handleLinkedSourceTypeChange(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded text-slate-700 bg-white appearance-none focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value="">Direct / No Link</option>
                      <option value="quotation">Quotation</option>
                      <option value="proforma">PI / Proforma</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col relative">
                  <label className="text-xs font-semibold text-slate-500 mb-1">Linked Document No.</label>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={isLinkedSourceOpen ? linkedSourceSearch : activeLinkedDocumentNumber}
                      onChange={(e) => handleLinkedSourceSearchChange(e.target.value)}
                      onClick={handleLinkedSourceSearchFocus}
                      onFocus={handleLinkedSourceSearchFocus}
                      placeholder={
                        !linkedSourceType
                          ? 'Select source type first'
                          : linkedSourceType === 'quotation'
                            ? 'Search quotation number or customer'
                            : 'Search PI / Proforma number or customer'
                      }
                      className="w-full text-xs p-2 pl-8 border border-slate-200 rounded text-slate-700 focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-500"
                      disabled={isLocked || !linkedSourceType}
                    />
                  </div>
                  {isLinkedSourceOpen && linkedSourceType && !isLocked && (
                    <div
                      className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 max-h-56 overflow-y-auto z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {filteredLinkedDocuments.length > 0 ? (
                        filteredLinkedDocuments.map((document) => {
                          const documentNumber = linkedSourceType === 'quotation'
                            ? document.qtnNo
                            : document.piNumber;
                          const customerLabel = linkedSourceType === 'quotation'
                            ? (document.customer || 'No customer')
                            : [document.customerCode, document.customerName].filter(Boolean).join(' - ') || document.customerName || 'No customer';

                          return (
                            <div
                              key={`${linkedSourceType}-${document.id || documentNumber}`}
                              className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer text-slate-700 border-b border-slate-50 last:border-0 flex justify-between gap-3"
                              onClick={() => {
                                if (linkedSourceType === 'quotation') {
                                  handleSelectQuotation(document);
                                  return;
                                }
                                handleSelectProforma(document);
                              }}
                            >
                              <span className="font-bold">{documentNumber}</span>
                              <span className="text-slate-400 truncate">{customerLabel}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-xs text-slate-400">
                          {linkedSourceType === 'quotation' ? 'No quotations found' : 'No proforma invoices found'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <CustomerShippingPanel
              selectedCustomer={selectedCustomer}
              onOpenCustomerSearch={() => { if (!hasLinkedDocument && !isLocked) setIsCustomerSearchOpen(true); }}
              onCustomerUpdated={setSelectedCustomer}
              shippingAddress={shippingAddress}
              onShippingChange={setShippingAddress}
              deliveryType={deliveryType}
              onDeliveryTypeChange={setDeliveryType}
              expectedDispatch={expectedDelivery}
              onExpectedDispatchChange={setExpectedDelivery}
              isReadOnly={isLocked}
              currency={orderCurrency}
            />

            {selectedCustomer && salesSettings?.creditLimitPolicy === 'WARNING' &&
              selectedCustomer.creditLimitAmount > 0 &&
              (Number(selectedCustomer.balance || 0) + orderTotal) > selectedCustomer.creditLimitAmount && (
                <div className="p-2.5 bg-yellow-50 shadow-sm border border-yellow-200 rounded-md text-yellow-800 text-[11px] leading-relaxed flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-yellow-600" />
                  <p>
                    <strong>Credit Warning:</strong> The projected outstanding balance
                    (<CurrencyAmount value={Number(selectedCustomer.balance || 0) + orderTotal} currency={orderCurrency} />) exceeds this customer's
                    credit limit of <CurrencyAmount value={selectedCustomer.creditLimitAmount} currency={orderCurrency} />.
                  </p>
                </div>
              )}
            {selectedCustomer && salesSettings?.creditLimitPolicy === 'BLOCK' &&
              selectedCustomer.creditLimitAmount > 0 &&
              (Number(selectedCustomer.balance || 0) + orderTotal) > selectedCustomer.creditLimitAmount && (
                <div className="p-2.5 bg-red-50 shadow-sm border border-red-300 rounded-md text-red-800 text-[11px] leading-relaxed flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                  <p>
                    <strong>Credit Limit Blocked:</strong> The projected outstanding balance
                    (<CurrencyAmount value={Number(selectedCustomer.balance || 0) + orderTotal} currency={orderCurrency} />) exceeds this customer's
                    credit limit of <CurrencyAmount value={selectedCustomer.creditLimitAmount} currency={orderCurrency} />.
                    Saving this order is blocked until the balance is within limit.
                  </p>
                </div>
              )}

            {/* CUSTOMER SELECTOR MODAL */}
            <CustomerSelector
              isOpen={isCustomerSearchOpen}
              onClose={() => setIsCustomerSearchOpen(false)}
              onSelect={handleSelectCustomer}
              customers={customersList}
              selectedCode={selectedCustomer?.code || ''}
              onCustomerCreated={fetchAllData}
            />

            {/* Delivery Instructions */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                Delivery Instructions
              </h3>
              <textarea rows="3" disabled={isLocked} value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded resize-none focus:border-yellow-400 outline-none" />
            </div>

            {/* 4. ATTACHMENTS (Moved to Left Column) */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 min-h-[180px] flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <Paperclip size={16} className="text-slate-400" /> Attachments
              </h3>
              <div className="border border-dashed border-slate-300 rounded p-4 text-center flex-1 flex flex-col items-center justify-center">
                <p className="text-xs text-slate-500 mb-2">Upload (Customer PO, PI, LPO, etc.)</p>
                <div className="flex flex-col items-center justify-center gap-2 w-full">
                  <label className="cursor-pointer">
                    <span className="text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded hover:bg-slate-200 transition-colors">Choose File</span>
                    <input type="file" disabled={isLocked} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
                  </label>

                  <div className="flex items-center gap-1 mt-1 justify-center w-full">
                    <span className="text-xs text-slate-500 truncate max-w-[150px]">{attachmentName}</span>
                    {attachmentName !== 'No file chosen' && !isLocked && (
                      <button
                        onClick={handleRemoveFile}
                        className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Remove file"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div> {/* End Left Column */}

          {/* ======================= MIDDLE COLUMN ======================= */}
          <div className="xl:col-span-2 space-y-4">

            {/* ERROR ALERT */}
            {showItemError && (
              <div className="bg-red-50 border border-red-100 text-red-500 text-xs p-3 rounded-md animate-in fade-in">
                * Please add at least one item to the sales order.
              </div>
            )}

            {/* 3. Sales Order Items */}
            <div className="bg-white rounded-lg border border-slate-200/50 p-5 shadow-sm min-h-[460px]">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100/50 pb-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingCart size={16} className="text-yellow-500" /> Sales Order Items
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200"><Zap size={10} /> Fast Entry</span>
                </h3>

                <div className="flex items-center gap-3">
                  {/* VAT mode toggle — drives line tax math. */}
                  <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px] font-semibold">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setVatMode('EXCLUSIVE')}
                      className={`px-2.5 py-1 transition-colors ${vatMode === 'EXCLUSIVE' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      title="Prices entered exclude VAT — tax added on top"
                    >VAT Excl.</button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setVatMode('INCLUSIVE')}
                      className={`px-2.5 py-1 border-l border-slate-200 transition-colors ${vatMode === 'INCLUSIVE' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      title="Prices entered already include VAT — tax extracted out"
                    >VAT Incl.</button>
                  </div>
                  {!isLocked && (
                    <button
                      onClick={() => setIsProductSelectorOpen(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500"
                    >
                      <Plus size={14} /> Select from Products
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-auto max-h-[380px]">
                <table className="w-full text-xs text-left min-w-[800px]">
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
                            <span className="text-xs mt-1 text-slate-400">Click "Select from Products" to start building this Sales Order.</span>
                          </div>
                        </td>
                      </tr>
                    ) : [...items].reverse().map((item, index) => (
                      <React.Fragment key={item.id}>
                        <tr className={`group hover:bg-slate-50/50 transition-colors bg-white align-middle ${isLocked ? 'opacity-80' : ''}`} onClick={() => setFocusedItem(item)}>
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
                                isReadOnly={isLocked}
                                onChange={(text) => {
                                  setPendingFastEntryRowId(item.id);
                                  setPendingFastEntrySearch(text);
                                }}
                                onOpenSelector={(text) => {
                                  setPendingFastEntryRowId(item.id);
                                  setPendingFastEntrySearch(text);
                                  setIsProductSelectorOpen(true);
                                }}
                              />
                            ) : (
                            <ItemDescriptionCell
                              item={item}
                              isExpanded={expandedRows[item.id]}
                              onToggleExpand={toggleRowDescription}
                              onItemChange={handleItemChange}
                              onFocusCode={() => { setFocusedItem(item); }}
                              onOpenProductSelection={!isLocked ? () => setIsProductSelectorOpen(true) : undefined}
                              onCheckStock={(item) => { setSelectedStockItem(item); setIsItemStockModalOpen(true); }}
                              isReadOnly={isLocked}
                              showSettings={Boolean(item.code || item.desc || item.remarks)}
                              showTaxDiscount={true}
                              onOpenSettings={(item) => setSelectedAddonItem({ ...item })}
                              page="sales_orders"
                            />
                            )}
                            {item.batchControlled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!orderId || !item.soItemId) {
                                    alert('Save this Sales Order as Draft before selecting batches.');
                                    return;
                                  }
                                  setBatchSelectionTarget({ item });
                                }}
                                className={`mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold ${
                                  Number(item.batchSelectedQuantity || 0) >= Number(item.baseRequiredQuantity || item.qty || 0)
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}
                              >
                                Batches {Number(item.batchSelectedQuantity || 0)}/{Number(item.baseRequiredQuantity || item.qty || 0)}
                              </button>
                            )}
                          </td>

                          {/* Unit */}
                          <td className="p-2 text-center align-middle">
                            <div className="rounded-md border border-slate-200 bg-white inline-block px-1 py-1 min-w-[50px]">
                              <select
                                disabled={isLocked}
                                className="w-full bg-transparent outline-none text-center text-xs text-slate-700 appearance-none font-medium cursor-pointer disabled:opacity-50"
                                value={item.unit || 'PCS'}
                                onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
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
                                disabled={isLocked}
                                type="number"
                                min="1"
                                className="w-full bg-transparent text-center outline-none font-bold text-sm text-slate-800 disabled:opacity-50"
                                value={item.qty === 0 ? '' : item.qty}
                                onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Tab' && !e.shiftKey) {
                                    const priceEl = document.getElementById(`price-${item.id}`);
                                    if (priceEl) { e.preventDefault(); priceEl.focus(); priceEl.select?.(); }
                                  }
                                }}
                                placeholder="0"
                              />
                            </div>
                          </td>

                          {/* Unit Price */}
                          <td className="p-2 text-center align-middle">
                            <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[104px] mx-auto">
                              <input
                                disabled={isLocked}
                                id={`price-${item.id}`}
                                type="number"
                                className="w-full bg-transparent text-center outline-none font-semibold text-sm text-slate-700 disabled:opacity-50"
                                value={item.price === 0 ? '' : item.price}
                                onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Tab' && !e.shiftKey && !isLocked) {
                                    e.preventDefault();
                                    const newRow = createBlankOrderItem();
                                    focusNextInlineSearchRef.current = newRow.id;
                                    setItems(prev => [...prev, newRow]);
                                  }
                                }}
                                placeholder="0.00"
                              />
                            </div>
                          </td>

                          {/* Line Total */}
                          <td className="p-2 text-center align-middle w-24">
                            <div className="font-bold text-slate-800 text-sm">
                              {((item.total) || 0).toFixed(2)}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="p-2 text-center align-middle">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* ── VERTICAL: canEdit('sales') for delete line item ── */}
                              {!isLocked && canEdit('sales.order') && (
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
                            <td colSpan={6} className="px-0 pb-4 pt-1">
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
                                  disabled={isLocked}
                                  className="w-full bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-yellow-700/30 resize-none font-medium leading-relaxed disabled:opacity-50"
                                  value={item.remarks || ''}
                                  onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                  placeholder="Enter product description - auto-loaded from product master, fully editable..."
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

              {/* Notes */}
              <div className="h-full">
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 h-full">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <FileText size={16} className="text-slate-400" /> Notes
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Notes (prints on SO)</label>
                      <textarea rows="3" disabled={isLocked} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} className="w-full text-xs p-3 border border-slate-200 rounded resize-none focus:border-yellow-400 outline-none leading-relaxed min-h-[80px]"></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Internal Notes</label>
                      <textarea rows="3" disabled={isLocked} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="w-full text-xs p-3 border border-slate-200 rounded resize-none focus:border-yellow-400 outline-none leading-relaxed min-h-[80px]"></textarea>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div> {/* End Middle Column */}

          {/* ======================= RIGHT COLUMN ======================= */}
          <div className="xl:col-span-1 space-y-4">

            {/* 8. ORDER SUMMARY */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Order Summary</h3>
              <div className="space-y-3 text-xs mb-4">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Amount</span>
                  <CurrencyAmount value={grossTotal} currency={orderCurrency} className="font-medium" />
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Discount</span>
                  <span className="font-medium">- <CurrencyAmount value={totalDiscount} currency={orderCurrency} /></span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <CurrencyAmount value={subTotal} currency={orderCurrency} className="font-medium" />
                </div>
                <div className="flex justify-between text-slate-600 items-center">
                  <span className="flex items-center gap-2">
                    Bill Discount
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={isLocked}
                      className="w-10 border border-slate-300/50 rounded px-1 text-center focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                      value={billDiscount}
                      onChange={(e) => setBillDiscount(Number(e.target.value))}
                    /> %
                  </span>
                  <span className="font-medium text-red-500">- <CurrencyAmount value={billDiscountAmount} currency={orderCurrency} /></span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <CurrencyAmount value={totalTax} currency={orderCurrency} />
                </div>
                <div className="flex justify-between text-slate-800 text-sm font-bold border-t border-slate-100 pt-2">
                  <span>Order Total</span>
                  <CurrencyAmount value={orderTotal} currency={orderCurrency} />
                </div>
                <div className="flex justify-between items-center text-emerald-600 font-medium">
                  <span className="flex items-center gap-2">
                    Advance Received
                    {orderId && Number(advanceAmount) > 0 && (
                      <button
                        type="button"
                        onClick={handlePrintAdvanceReceipt}
                        title="View / print the auto-generated Receipt Voucher for this advance"
                        className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded px-1.5 py-0.5 transition-colors"
                      >
                        <Printer size={10} /> Print Receipt
                      </button>
                    )}
                  </span>
                  <CurrencyAmount value={advanceAmount} currency={orderCurrency} />
                </div>
                <div className="flex justify-between text-red-600 font-bold text-sm">
                  <span>Balance Due</span>
                  <CurrencyAmount value={balanceDue} currency={orderCurrency} />
                </div>

                {/* PAYMENT STATUS BADGE - Logic Updated */}
                {(status !== 'Draft' || advanceAmount > 0) && (
                  <div className="flex justify-end pt-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${balanceDue > 0 ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {balanceDue > 0 ? 'Partially Paid / Unpaid' : 'Fully Paid'}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-orange-50 border border-orange-100 rounded p-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-orange-400" />
                <span className="text-[10px] text-orange-700">
                  Sales order will reserve stock once confirmed. Invoicing & delivery can be linked to this order.
                </span>
              </div>
            </div>

            {/* END 8. ORDER SUMMARY */}

            {/* Stock Info - All items */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <div className="p-1 rounded bg-slate-100"><Box size={14} className="text-yellow-600" /></div>
                Item Availability
              </h3>

              <div className="space-y-2 overflow-y-auto max-h-[260px]">
                {items.some(i => i.code) ? items.filter(i => i.code).filter((item, idx, arr) => arr.findIndex(x => x.code === item.code) === idx).map(item => {
                  if ((item.productType || '').toUpperCase() === 'SERVICE') {
                    return (
                      <div key={item.id} className="border rounded p-2 border-blue-200 bg-blue-50">
                        <div className="font-semibold text-[10px] text-slate-800 truncate">{item.desc || item.code}</div>
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
                }) : (
                  <div className="text-[10px] text-slate-400 text-center py-4">Add items to check stock.</div>
                )}
              </div>
            </div>

            {/* Margin Summary */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Margin Summary</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Sell (before tax)</span>
                  <CurrencyAmount value={subTotal} currency={orderCurrency} className="font-medium" />
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Cost</span>
                  <CurrencyAmount value={totalCost} currency={orderCurrency} className="font-medium" />
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Profit</span>
                  <CurrencyAmount value={profit} currency={orderCurrency} className={`font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                </div>
                <div className="flex justify-between items-center border-t border-slate-100 pt-2 mt-2">
                  <span className="font-bold text-slate-800">Margin %</span>
                  <span className={`font-bold ${marginPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{marginPercent.toFixed(1)}%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                  Margin is visible to internal roles only and is not printed or shared with customers.
                </p>
              </div>
            </div>

          </div>

          {/* ======================= FIXED BOTTOM ACTION BAR ======================= */}
          <div className="hidden md:flex fixed bottom-0 md:left-64 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] justify-between items-center z-[60]">
            <div className="flex items-center gap-3">
              <div className="px-2 py-1 bg-slate-100 border border-slate-200/50 rounded-md text-[11px] font-bold text-slate-600 shadow-sm flex items-center gap-2">
                Status: {renderStatusBadge(status)}
              </div>
              <span className="text-xs font-medium text-slate-500 hidden lg:inline">
                Sales Order No: <span className="text-slate-700 font-bold">{soNumber || 'Draft'}</span>
              </span>
            </div>

            <div className="flex gap-2">
              {/* ── VERTICAL: canExport('sales') for Print ── */}
              {canExport('sales') && (
                <button onClick={handlePrintClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                  <Printer size={14} /> Print
                </button>
              )}

              {canExport('sales') && (
                <button onClick={() => {
                  if (!orderId) { alert('Please save the Sales Order before sending an email.'); return; }
                  setIsEmailModalOpen(true);
                }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                  <Mail size={14} /> Email
                </button>
              )}

              {status === 'DRAFT' && (
                <>
                  {/* ── VERTICAL: canEdit('sales') for Save Draft ── */}
                  {canEdit('sales') && (
                    <button onClick={() => saveOrUpdateOrder('DRAFT')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                      <Save size={14} /> Save Draft
                    </button>
                  )}
                  {/* ── VERTICAL: canApprove('sales') for Confirm Order ── */}
                  {canApprove('sales') && (
                    <button onClick={handleConfirmOrder} className="flex items-center gap-1.5 px-5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded text-xs font-bold hover:from-emerald-700 hover:to-emerald-600 transition-all shadow-md transform hover:-translate-y-0.5">
                      Confirm Order <ChevronRight size={14} />
                    </button>
                  )}
                </>
              )}

              {/* ── Convert to Delivery Note / Proceed to Invoice for CONFIRMED / PARTIALLY_PAID / FULLY_PAID ── */}
              {(status === 'CONFIRMED' || status === 'PARTIALLY_PAID' || status === 'FULLY_PAID') && canApprove('sales') && (
                <>
                  <button onClick={handleConvertToDeliveryNote} className="flex items-center gap-1.5 px-5 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded text-xs font-bold hover:from-indigo-700 hover:to-indigo-600 transition-all shadow-md transform hover:-translate-y-0.5">
                    <Truck size={14} /> Convert to Delivery Note
                  </button>
                  <button onClick={handleProceedToInvoice} className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-white rounded text-xs font-bold hover:from-amber-600 hover:to-amber-500 transition-all shadow-md transform hover:-translate-y-0.5">
                    <FileText size={14} /> Proceed to Invoice
                  </button>
                </>
              )}
              {status !== 'INVOICED' && (
                <button
                  onClick={handleOpenPaymentModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <DollarSign size={14} /> Pay
                </button>
              )}
            </div>
          </div>

          {/* FLOATING MOBILE ACTIONS */}
          <MobileFloatingActions
            status={status}
            onConfirm={handleConfirmOrder}
            onConvertToDO={handleConvertToDeliveryNote}
            onSave={() => saveOrUpdateOrder('DRAFT')}
            onPrint={handlePrintClick}
          />
        </div>
      )}

      {/* Receive Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="bg-white w-[500px] rounded-lg shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Receive Payment</h3>
                <p className="text-xs text-slate-500 mt-1">Record a payment received from the customer for this invoice</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Balance Display */}
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-slate-500 font-medium">Balance Due</span>
                <CurrencyAmount value={Math.max(orderTotal - Number(advanceAmount), 0)} currency={orderCurrency} className="text-red-600 font-bold text-lg" />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={modalPaymentDate}
                  onChange={e => setModalPaymentDate(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none"
                />
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={modalPaymentMode}
                  onChange={e => { setModalPaymentMode(e.target.value); setModalBankAccount(''); setModalChequeDate(new Date().toISOString().split('T')[0]); }}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none bg-white"
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>Credit Card</option>
                </select>
              </div>

              {/* Bank Account — non-Cash modes */}
              {modalPaymentMode !== 'Cash' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bank Account</label>
                  <select
                    value={modalBankAccount}
                    onChange={e => setModalBankAccount(e.target.value)}
                    className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none bg-white"
                  >
                    <option value="">Select bank account...</option>
                    {bankAccountOptions.map(acc => (
                      <option key={acc.id} value={acc.name}>{acc.code} — {acc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cheque Date — Cheque only */}
              {modalPaymentMode === 'Cheque' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Date</label>
                  <input
                    type="date"
                    value={modalChequeDate}
                    onChange={e => setModalChequeDate(e.target.value)}
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
                  onChange={e => setModalPaymentAmount(e.target.value)}
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
                  onChange={e => setModalPaymentRef(e.target.value)}
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
                  onChange={e => setModalNotes(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742] outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer */}
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
      )}

      {/* QA-040: Send Sales Order Email */}
      <SendDocumentEmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        category="Sales Order (SO)"
        docId={orderId}
        docNumber={soNumber}
        customerEmail={(customersList.find(c => c.code === selectedCustomer?.code)?.email) || selectedCustomer?.email || ''}
        docLabel="Sales Order"
        companyProfile={buildDocumentHeaderProfile({ company, branches: availableBranches || [], branchId: loadedSoBranchId ?? activeBranch?.id })}
        apiFn={sendSalesOrderEmail}
        buildPayload={buildSoPrintData}
      />
    </div>
  );
};

export default SalesOrders;
