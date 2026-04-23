import React, { useState, useEffect, useMemo } from 'react';
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
  CheckCircle2,
  Menu,
  ChevronUp,
  Trash2,
  Paperclip,
  Save,
  ChevronRight
} from 'lucide-react';

// ✅ API IMPORTS
import api from '../../api/axiosConfig';
import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllQuotations } from '../../api/quotationApi';
import { getAllProformas } from '../../api/proformaApi';
import {
  getAllSalesOrders,
  saveSalesOrder,
  uploadSalesOrderAttachment,
  updateSalesOrderStatus
} from '../../api/salesorderApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import { getStockAvailability } from '../../api/stockAvailabilityApi';
import billBullLogo from '../../assets/billBullLogo.png';
import { useCompany } from '../../context/CompanyContext';

// ✅ PRODUCT SELECTOR
import ProductSelector from '../../components/ProductSelector';

// ✅ CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';

// ✅ GLOBAL COMPONENTS
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';
import ItemAddOnsModal from '../../components/ItemAddOnsModal';

// ✅ STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';

// ✅ SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// ✅ PERMISSIONS
import { usePermissions } from '../../context/PermissionContext';

// ✅ MOBILE CARD COMPONENT
const MobileCard = ({ order, onClick, getStatusBadge }) => (
  <div onClick={() => onClick(order)} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-3 active:scale-[0.98] transition-transform">
    <div className="flex justify-between items-start mb-2">
      <div>
        <h4 className="font-bold text-slate-800">{order.soNumber}</h4>
        <p className="text-xs text-slate-500">{order.orderDate}</p>
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
        Total: <span className="font-bold text-slate-800">{Number(order.orderTotal).toFixed(2)}</span>
      </div>
      <div className="text-xs text-slate-500">
        Balance: <span className="font-bold text-slate-800">{(Number(order.orderTotal) - Number(order.advanceAmount)).toFixed(2)}</span>
      </div>
      <ChevronDown size={16} className="text-slate-300 -rotate-90" />
    </div>
  </div>
);

// ✅ MOBILE FLOATING ACTIONS COMPONENT
const MobileFloatingActions = ({ status, onConfirm, onMarkInvoiced, onSave, onPrint }) => {
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
        ) : (status === 'CONFIRMED' || status === 'PARTIALLY_PAID') ? (
          <button onClick={onMarkInvoiced} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 active:bg-blue-700">
            <CheckCircle2 size={16} /> Mark Invoiced
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
  const { canCreate, canEdit, canApprove, canExport } = usePermissions();
  const [activeTab, setActiveTab] = useState('list');

  // ✅ FIX 1: ADD ORDER ID STATE
  const [orderId, setOrderId] = useState(null);

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

  // --- FORM STATES ---
  const [status, setStatus] = useState('DRAFT');
  const [showItemError, setShowItemError] = useState(false);

  // ✅ NEW STATE: Track the currently focused item for the sidebar
  const [focusedItem, setFocusedItem] = useState(null);

  // ✅ LIVE STOCK MAP
  const [liveStockMap, setLiveStockMap] = useState({});

  useEffect(() => {
    if (focusedItem && focusedItem.code) {
      if (!liveStockMap[focusedItem.code]) {
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
  const [soNumber, setSoNumber] = useState(() => `SO-${Math.floor(100000 + Math.random() * 900000)}`);
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

  // Items
  const [items, setItems] = useState([createBlankOrderItem()]);

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
      handleSelectQuotation({
        qtnNo: qtn.qtnNo,
        customer: qtn.customer,
        items: qtn.items || []
      });
      setActiveTab('create');
      // Clear state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchAllData = async () => {
    try {
      const [custResult, qtnResult, proformaResult, bankAccResult] = await Promise.allSettled([
        getAllCustomers(),
        getAllQuotations(),
        getAllProformas(),
        api.get('/api/ledger/accounts/bank-accounts').then(r => r.data)
      ]);

      const custData = custResult.status === 'fulfilled' ? custResult.value : [];
      const qtnData = qtnResult.status === 'fulfilled' ? qtnResult.value : [];
      const proformaData = proformaResult.status === 'fulfilled' ? proformaResult.value : [];
      const bankAccData = bankAccResult.status === 'fulfilled' ? bankAccResult.value : [];
      setBankAccountOptions(Array.isArray(bankAccData) ? bankAccData : []);

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
    try {
      const data = await getAllSalesOrders();
      setOrdersList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load sales orders", err);
    }
  };

  // --- CALCULATIONS ---
  const calculateTotals = () => {
    const subTotal = items.reduce((acc, i) => acc + (i.total - i.taxAmt), 0);
    const totalTax = items.reduce((acc, i) => acc + i.taxAmt, 0);
    const orderTotal = subTotal + totalTax;
    const balanceDue = orderTotal - Number(advanceAmount);

    const totalCost = items.reduce((acc, i) => {
      const qty = Number(i.qty) || 0;
      const unitCost = i.cost > 0 ? i.cost : (i.price * 0.75);
      return acc + (qty * unitCost);
    }, 0);

    const profit = subTotal - totalCost;
    const marginPercent = subTotal > 0 ? (profit / subTotal) * 100 : 0;

    return { subTotal, totalTax, orderTotal, balanceDue, totalCost, profit, marginPercent };
  };

  const { subTotal, totalTax, orderTotal, balanceDue, totalCost, profit, marginPercent } = calculateTotals();

  // --- ACTIONS ---

  const calculateRow = (item) => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    const focQty = Number(item.foc) || 0;
    const discPercent = Number(item.disc) || 0;
    const taxPercent = Number(item.tax) || 0;

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
    const total = taxableAmount + taxAmount;

    return {
      ...item,
      qty,
      price,
      foc: focQty,
      disc: discPercent,
      tax: taxPercent,
      taxAmt: taxAmount,
      total
    };
  };

  const normalizeOrderItem = (item = {}, fallbackId = Date.now() + Math.random()) => {
    const resolvedUnit = item.unit || item.focUnit || 'PCS';
    const normalized = {
      id: fallbackId,
      soItemId: item.soItemId || null,
      code: item.code || item.itemCode || '',
      barcode: item.barcode || item.itemBarcode || '',
      image: item.primaryImage || item.image || item.thumbnailUrl || item.imageUrl || '',
      desc: item.desc || item.description || item.name || '',
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
      total: Number(item.total ?? item.lineTotal) || 0
    };

    return calculateRow(normalized);
  };

  // ✅ PRODUCT SELECTOR HANDLER
  const handleAddSingleProduct = (product) => {
    const price = parseFloat(product.retailPrice) || parseFloat(product.sellingPrice) || 0;
    const cost = parseFloat(product.cost) || 0;
    const disc = parseFloat(product.maxDiscount) || 0;
    const tax = parseFloat(product.salesTax) || 5;

    const rawItem = {
      id: Date.now() + Math.random(),
      code: product.code,
      barcode: product.barcode || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
      desc: product.description || product.name,
      remarks: product.description || product.remarks || '',
      unit: product.unitName || product.unit || (product.availableUnits && product.availableUnits[0]) || 'PCS',
      qty: 1,
      price: price,
      cost: cost,
      foc: 0,
      focUnit: product.unitName || product.unit || (product.availableUnits && product.availableUnits[0]) || 'PCS',
      availableUnits: product.availableUnits || ['PCS'],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      disc: disc,
      tax: tax,
      taxAmt: 0,
      total: 0
    };

    const newItem = calculateRow(rawItem);

    setItems(prev => {
      // Replace empty placeholder rows when first product is added
      const hasData = prev.some(i => i.code || i.desc);
      return hasData ? [...prev, newItem] : [newItem];
    });

    setIsProductSelectorOpen(false); // ✅ Close modal after adding
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
    saveOrUpdateOrder();
  };

  const handleMarkAsInvoiced = async () => {
    if (!orderId) {
      alert('Save the order first before marking as invoiced.');
      return;
    }
    try {
      await updateSalesOrderStatus(orderId, 'INVOICED');
      setStatus('INVOICED');
      await fetchSalesOrders();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to mark as invoiced.';
      alert(`Error: ${msg}`);
    }
  };

  const handleProceedToInvoice = () => {
    navigate('/sales/invoice', {
      state: {
        fromSalesOrder: {
          soNumber,
          customer: selectedCustomer?.name || selectedCustomer?.code || '',
          customerCode: selectedCustomer?.code || '',
          linkedQuotation: linkedQtn || '',
          linkedProforma: linkedPi || '',
          items: items
            .filter(i => i.code && i.qty > 0)
            .map(i => ({
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
            }))
        }
      }
    });
  };

  // ✅ PRINT FUNCTIONALITY
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintClick = async () => {
    setIsPrinting(true);
    try {
      const templates = await getTemplatesByCategory('Sales Order (SO)'); // Category: SalesOrder
      const defaultTemplate = templates.find(t => t.isDefault);

      if (defaultTemplate) {
        const fullCustomer = customersList.find(c => c.code === selectedCustomer?.code);

        const printData = {
          title: 'SALES ORDER',
          docNo: soNumber,
          date: orderDate,
          customer: {
            name: selectedCustomer?.name || '',
            address: fullCustomer?.address || fullCustomer?.billingAddress || '',
            trn: selectedCustomer?.trn || fullCustomer?.trn
          },
          items: items.filter(i => i.code || i.desc).map(i => ({
            code: i.code,
            name: i.name || '',
            desc: i.desc || '',
            sku: i.sku || '',
            localName: i.localName || '',
            barcode: i.barcode || '',
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
            subTotal,
            tax: totalTax,
            grandTotal: orderTotal,
            currency: 'AED',
            billDiscount: 0,
            billDiscountAmount: 0
          },
          meta: {
            paymentTerm: '30 Days',
            status,
            notes: customerNotes,
            reference: linkedQtn || linkedPi || ''
          }
        };

        const html = generatePrintHtml(defaultTemplate, printData, { companyProfile: company, billBullLogo });
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
  const saveOrUpdateOrder = async () => {
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
        focUnit: i.focUnit || i.unit || 'PCS'
      }))
    };

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
      setStatus(savedOrder.status);

      setActiveTab('list');
      setAttachmentFile(null);
    } catch (e) {
      console.error("Save failed", e);
      const msg = e?.response?.data?.message || e?.response?.data || e?.message || "Please check inputs.";
      alert(`Failed to save Sales Order: ${msg}`);
    }
  };

  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setShippingAddress(cust.shippingAddress || cust.billingAddress || cust.address || '');
    setIsCustomerSearchOpen(false);
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
      setSoNumber(`SO-${Math.floor(100000 + Math.random() * 900000)}`);
    }
    setLinkedSourceType('quotation');
    setLinkedQtn(qtn.qtnNo);
    setLinkedPi('');
    setLinkedSourceSearch(qtn.qtnNo || '');

    if (qtn.customer) {
      const matchedCustomer = customersList.find(c =>
        qtn.customer.includes(c.name) || qtn.customer.includes(c.code)
      );
      const cust = matchedCustomer || buildFallbackCustomer(qtn.customer);
      setSelectedCustomer(cust);
      if (cust.address || cust.shippingAddress || cust.billingAddress) {
        setShippingAddress(cust.shippingAddress || cust.billingAddress || cust.address || '');
      }
    }

    applyLinkedDocumentItems(qtn.items || []);

    setIsLinkedSourceOpen(false);
  };

  const handleSelectProforma = (proforma) => {
    if (!orderId) {
      setSoNumber(`SO-${Math.floor(100000 + Math.random() * 900000)}`);
    }

    setLinkedSourceType('proforma');
    setLinkedPi(proforma.piNumber || '');
    setLinkedQtn('');
    setLinkedSourceSearch(proforma.piNumber || '');

    const matchedCustomer = customersList.find((customer) =>
      (proforma.customerCode && customer.code === proforma.customerCode)
      || (proforma.customerName && customer.name === proforma.customerName)
    );

    const cust = matchedCustomer || buildFallbackCustomer(proforma.customerName, proforma.customerCode);
    setSelectedCustomer(cust);
    if (cust.address || cust.shippingAddress || cust.billingAddress) {
      setShippingAddress(cust.shippingAddress || cust.billingAddress || cust.address || '');
    }

    applyLinkedDocumentItems(proforma.items || []);

    setIsLinkedSourceOpen(false);
  };

  // ✅ FIX 2: SET ID WHEN LOADING
  const handleLoadOrder = (order) => {
    setOrderId(order.id); // <--- Capture Backend ID

    setSoNumber(order.soNumber);
    setOrderDate(order.orderDate);

    // Map backend flat fields back to UI object
    setSelectedCustomer({
      code: order.customerCode,
      name: order.customerName,
    });

    const hasLinkedQuotation = Boolean(order.linkedQuotation);
    const hasLinkedProforma = Boolean(order.linkedProforma);
    setLinkedSourceType(hasLinkedQuotation ? 'quotation' : hasLinkedProforma ? 'proforma' : '');
    setLinkedQtn(order.linkedQuotation || '');
    setLinkedPi(order.linkedProforma || '');
    setLinkedSourceSearch(hasLinkedQuotation ? (order.linkedQuotation || '') : (order.linkedProforma || ''));

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

    setSoNumber(`SO-${Math.floor(100000 + Math.random() * 900000)}`);
    setOrderDate(new Date().toISOString().split('T')[0]);

    // ✅ Set default customer to Walk-in
    const walkIn = customersList.find(c => c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walkin') || c.name.toLowerCase() === 'cash customer');
    setSelectedCustomer(walkIn || null);

    setLinkedSourceType('');
    setLinkedSourceSearch('');
    setLinkedQtn('');
    setLinkedPi('');
    setItems([createBlankOrderItem()]);
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

          if (item.unitPrices && item.unitPrices[newUnit]) {
            newItem.price = item.unitPrices[newUnit];
          } else {
            const baseUnit = Object.keys(item.unitConversions).find(u => item.unitConversions[u] === 1);
            if (baseUnit) {
              let basePrice = item.unitPrices && item.unitPrices[baseUnit] ? item.unitPrices[baseUnit] : null;
              if (!basePrice) {
                const currentUnitConversion = item.unitConversions[item.unit] || 1;
                basePrice = item.price / currentUnitConversion;
              }
              const newUnitConversion = item.unitConversions[newUnit] || 1;
              newItem.price = basePrice * newUnitConversion;
            }
          }

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
    if (items.length > 1) {
      setItems(items.filter(i => i.id !== id));
      if (focusedItem && focusedItem.id === id) {
        setFocusedItem(null);
      }
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
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleAddSingleProduct}
        title="Select Items from Products / Services"
        actionLabel="Add to Order"
      />

      {/* ✅ STOCK AVAILABILITY MODAL */}
      <StockAvailabilityModal
        isOpen={isItemStockModalOpen}
        onClose={() => setIsItemStockModalOpen(false)}
        selectedStockItem={selectedStockItem}
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
              <button key={label} onClick={label === 'Print' ? handlePrintClick : undefined} disabled={label === 'Print' && isPrinting} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-50">
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
                  <th className="px-4 py-3">SO No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Quotation</th>
                  <th className="px-4 py-3">PI No</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Advance</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ordersList.map((order, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleLoadOrder(order)}>
                    <td className="px-4 py-3 font-medium text-slate-700">{order.soNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{order.orderDate}</td>
                    <td className="px-4 py-3 text-slate-600">{order.customerName}</td>
                    <td className="px-4 py-3 text-slate-500">{order.linkedQuotation || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{order.linkedProforma || '-'}</td>
                    <td className="px-4 py-3 font-medium">{Number(order.orderTotal).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(order.advanceAmount).toFixed(2)}</td>
                    <td className="px-4 py-3">{(Number(order.orderTotal) - Number(order.advanceAmount)).toFixed(2)}</td>
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
                />
              ))}
            </div>

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
                  <input type="text" value={soNumber} readOnly className="text-xs p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 font-medium" />
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

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 relative z-20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <User size={16} className="text-yellow-500" /> Customer
                </h3>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Select Customer</label>

                <div
                  className={`w-full text-xs p-2 border border-slate-200 rounded text-slate-700 flex items-center gap-2 ${hasLinkedDocument || isLocked ? 'bg-slate-50 cursor-not-allowed' : 'bg-white cursor-pointer hover:border-yellow-400'} transition-colors`}
                  onClick={() => {
                    if (!hasLinkedDocument && !isLocked) setIsCustomerSearchOpen(true);
                  }}
                >
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <span className="flex-1 truncate">{selectedCustomer ? [selectedCustomer.code, selectedCustomer.name].filter(Boolean).join(' - ') : 'Search customer...'}</span>
                </div>
              </div>

              {selectedCustomer && (
                <>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Group</label>
                    <div className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded text-slate-700">
                      {selectedCustomer.group || selectedCustomer.groupType || 'General'}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-slate-800 text-sm mb-1">{selectedCustomer.name}</div>
                        <div className="text-xs text-slate-500">Code: {selectedCustomer.code}</div>
                        <div className="text-xs text-slate-500">TRN: {selectedCustomer.trn || 'N/A'}</div>
                        <div className="text-xs text-slate-500">Phone: {selectedCustomer.phone || selectedCustomer.mobile || 'N/A'}</div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border mb-2 ${selectedCustomer.creditStatus === 'Good' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                          Credit: {selectedCustomer.creditStatus || 'N/A'}
                        </span>
                        <div className="text-xs text-slate-500">Terms: {selectedCustomer.payTerms || 'Cash'}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Outstanding: <span className="font-bold text-slate-700">{selectedCustomer.balance ? Number(selectedCustomer.balance).toFixed(2) : '0.00'} AED</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
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

            {/* 5. DELIVERY & SHIPPING */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                <Truck size={16} className="text-yellow-500" /> Delivery & Shipping
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Delivery Type</label>
                  <select
                    value={deliveryType}
                    disabled={isLocked}
                    onChange={(e) => setDeliveryType(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded focus:border-yellow-400 outline-none bg-white"
                  >
                    <option>Delivery</option>
                    <option>Pickup</option>
                    <option>Courier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Expected Delivery</label>
                  <input type="date" disabled={isLocked} value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-yellow-400 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Shipping Address</label>
                  <textarea rows="3" disabled={isLocked} value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded resize-none focus:border-yellow-400 outline-none"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Delivery Instructions</label>
                  <textarea rows="3" disabled={isLocked} value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded resize-none focus:border-yellow-400 outline-none"></textarea>
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
                </h3>

                {!isLocked && (
                  <div className="flex gap-2">
                  {/* ✅ SELECT FROM CATALOG BUTTON */}
                    <button
                      onClick={() => setIsProductSelectorOpen(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500"
                    >
                      <Plus size={14} /> Select from Products
                    </button>
                  </div>
                )}
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
                    ) : items.map((item, index) => (
                      <React.Fragment key={item.id}>
                        <tr className={`group hover:bg-slate-50/50 transition-colors bg-white align-middle ${isLocked ? 'opacity-80' : ''}`} onClick={() => setFocusedItem(item)}>
                          {/* Index */}
                          <td className="p-2 text-center text-slate-400 text-xs font-medium">{index + 1}</td>

                          {/* Item / Description */}
                          <td className="p-2">
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
                                placeholder="0"
                              />
                            </div>
                          </td>

                          {/* Unit Price */}
                          <td className="p-2 text-center align-middle">
                            <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[104px] mx-auto">
                              <input
                                disabled={isLocked}
                                type="number"
                                className="w-full bg-transparent text-center outline-none font-semibold text-sm text-slate-700 disabled:opacity-50"
                                value={item.price === 0 ? '' : item.price}
                                onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
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
                  <span>Subtotal</span>
                  <span className="font-medium">{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>0.00</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span>{totalTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-800 text-sm font-bold border-t border-slate-100 pt-2">
                  <span>Order Total</span>
                  <span>{orderTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>$ Advance Received</span>
                  <span>{Number(advanceAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600 font-bold text-sm">
                  <span>Balance Due</span>
                  <span>{balanceDue.toFixed(2)}</span>
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

            {/* Stock Info - Updated to show focused item data */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 min-h-[180px] flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <div className="p-1 rounded bg-slate-100"><Box size={14} className="text-yellow-600" /></div>
                Stock & Incoming (Selected Item)
              </h3>

              <div className="mt-2 text-xs flex-1 flex flex-col">
                <div className="font-bold text-slate-700 mb-1 line-clamp-2" title={focusedItem?.desc}>{focusedItem?.desc || 'Select an item...'}</div>
                <div className="text-slate-400 mb-4">Code: {focusedItem?.code || '-'}</div>

                <div className="flex justify-between mb-1 mt-auto">
                  <span className="text-slate-500">Total On Hand</span>
                  <span className="text-slate-500">Blocked / Reserved</span>
                </div>
                <div className="flex justify-between mb-3 font-bold">
                  <span>{focusedItem !== null ? ((liveStockMap[focusedItem.code]?.available || 0) + (liveStockMap[focusedItem.code]?.reserved || 0)) : '-'} units</span>
                  <span className="text-orange-500">{focusedItem !== null ? (liveStockMap[focusedItem.code]?.reserved || 0) : '-'} units</span>
                </div>

                <div className="flex justify-between font-bold border-t border-slate-100 pt-2 pb-1">
                  <span className="text-slate-500">Free from current stock</span>
                  <span className="text-emerald-600">{focusedItem !== null ? (liveStockMap[focusedItem.code]?.available || 0) : '-'} units</span>
                </div>
              </div>
            </div>

            {/* Margin Summary */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Margin Summary</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Sell (before tax)</span>
                  <span className="font-medium">{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Cost</span>
                  <span className="font-medium">{totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Profit</span>
                  <span className={`font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{profit.toFixed(2)}</span>
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

              {status === 'DRAFT' && (
                <>
                  {/* ── VERTICAL: canEdit('sales') for Save Draft ── */}
                  {canEdit('sales') && (
                    <button onClick={saveOrUpdateOrder} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
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

              {/* ── Proceed to Invoice / Mark Invoiced for CONFIRMED / PARTIALLY_PAID ── */}
              {(status === 'CONFIRMED' || status === 'PARTIALLY_PAID') && canApprove('sales') && (
                <>
                  <button onClick={handleProceedToInvoice} className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-white rounded text-xs font-bold hover:from-amber-600 hover:to-amber-500 transition-all shadow-md transform hover:-translate-y-0.5">
                    <FileText size={14} /> Proceed to Invoice
                  </button>
                  <button onClick={handleMarkAsInvoiced} className="flex items-center gap-1.5 px-5 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-all shadow-md transform hover:-translate-y-0.5">
                    <CheckCircle2 size={14} /> Mark Invoiced
                  </button>
                </>
              )}
              <button
                onClick={handleOpenPaymentModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
              >
                <DollarSign size={14} /> Pay
              </button>
            </div>
          </div>

          {/* FLOATING MOBILE ACTIONS */}
          <MobileFloatingActions
            status={status}
            onConfirm={handleConfirmOrder}
            onMarkInvoiced={handleMarkAsInvoiced}
            onSave={saveOrUpdateOrder}
            onPrint={handlePrintClick}
          />
        </div>
      )}

      {/* Receive Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
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
                <span className="text-red-600 font-bold text-lg">AED {Math.max(orderTotal - Number(advanceAmount), 0).toFixed(2)}</span>
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
    </div>
  );
};

export default SalesOrders;
