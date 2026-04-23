import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  User,
  Search,
  ArrowRight,
  Printer,
  Mail,
  MessageCircle,
  Save,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  History,
  Trash2,
  Box,
  Wallet,
  CreditCard,
  DollarSign,
  Menu,
  ChevronUp,
  ChevronRight,
  ShoppingCart,
  ArrowLeft,
  Smartphone,
  ArrowUp,
  ArrowDown,
  ListFilter,
  Check,
  X,
  Info,
  Paperclip,
  ShoppingCart as ShoppingCartIcon
} from 'lucide-react';

import { useMemo } from 'react';

// âœ… REAL API IMPORTS
import api from '../../api/axiosConfig';
import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllQuotations, getQuotationById } from '../../api/quotationApi';
import { getAllSalesOrders, getSalesOrderById } from '../../api/salesorderApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import { getDefaultProductUnit, resolveUnitAmount } from '../../utils/unitPricing';
import billBullLogo from '../../assets/billBullLogo.png';
import { useCompany } from '../../context/CompanyContext';

// âœ… STEP 2: PROFORMA API IMPORTS
import {
  getAllProformas,
  createProforma,
  updateProforma,
  issueProforma,
  getProformaById
} from "../../api/proformaApi";

import { receiptVoucherApi } from "../../api/receiptVoucherApi";
import { useBranch } from "../../context/BranchContext";

// âœ… PRODUCT SELECTOR
import ProductSelector from '../../components/ProductSelector';

// âœ… CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';

// âœ… STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';
import { getStockAvailability } from '../../api/stockAvailabilityApi'; // âœ… NEW API for LIVE STOCK

// âœ… SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// âœ… GLOBAL COMPONENTS
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';
import ItemAddOnsModal from '../../components/ItemAddOnsModal';

const ProformaInvoice = () => {
  const { company } = useCompany();
  const { defaultBranchName } = useBranch();
  const [activeTab, setActiveTab] = useState('list');
  const [piId, setPiId] = useState(null);

  // --- DATA LIST STATES (Fetched from APIs) ---
  const [customersList, setCustomersList] = useState([]);
  const [quotationsList, setQuotationsList] = useState([]);
  const [salesOrdersList, setSalesOrdersList] = useState([]);

  // --- PROFORMA LIST STATE ---
  // âŒ STEP 3: REMOVE MOCK DATA & REPLACE WITH EMPTY ARRAY
  const [proformaList, setProformaList] = useState([]);

  // --- FORM STATES ---
  const [status, setStatus] = useState('DRAFT');
  const [version, setVersion] = useState(1);
  const [piNumber, setPiNumber] = useState(''); // Init empty, will auto-gen or load
  const [piDate, setPiDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);

  // Stock Check Modal
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);

  // Linking States
  const [sourceType, setSourceType] = useState('None');
  const [linkedQuote, setLinkedQuote] = useState('');
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');

  const [linkedSO, setLinkedSO] = useState('');
  const [isSalesOrderOpen, setIsSalesOrderOpen] = useState(false);

  // View Only Mode
  const [isReadOnly, setIsReadOnly] = useState(false);

  // âœ… PRODUCT SELECTOR STATE
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  const createBlankProformaItem = () => ({
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
    unitConversions: { PCS: 1 },
    unitPrices: {},
    disc: 0,
    tax: 5,
    taxAmt: 0,
    total: 0
  });

  const [items, setItems] = useState([createBlankProformaItem()]);

  // âœ… GLOBAL SHORTCUTS
  useShortcuts({
    'ctrl+p': (e) => {
      if (activeTab === 'create') setIsProductSelectorOpen(prev => !prev);
    },
    'ctrl+s': (e) => {
      if (activeTab === 'create') handleSaveDraft();
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

  // Payment Module State
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

  // Sidebars & UI
  const [focusedItem, setFocusedItem] = useState(null);

  // âœ… LIVE STOCK CACHE FOR ITEM AVAILABILITY PANEL
  const [liveStockMap, setLiveStockMap] = useState({});

  // Item Add-Ons Modal State
  const [selectedAddonItem, setSelectedAddonItem] = useState(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });

  // List View State
  const [expandedListRows, setExpandedListRows] = useState({});
  const toggleListRow = (e, id) => {
    e.stopPropagation();
    setExpandedListRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [isPrinting, setIsPrinting] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [currency, setCurrency] = useState('AED');
  const [shippingAddress, setShippingAddress] = useState('');

  // Notes
  const [notesToCustomer, setNotesToCustomer] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Summary Calcs
  const grossTotal = items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.price) || 0), 0);
  const totalItemDiscount = items.reduce((sum, item) => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    const focQty = Number(item.foc) || 0;
    const discPercent = Number(item.disc) || 0;

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
        focDeduction = price * (focQty * focConversion / sellingConversion);
      }
    }
    const preDiscountAmount = Math.max(0, grossAmount - focDeduction);
    return sum + (preDiscountAmount * (discPercent / 100));
  }, 0);

  const subTotal = grossTotal - totalItemDiscount; // Taxable Subtotal
  const [billDiscount, setBillDiscount] = useState(0);
  const billDiscountAmount = (subTotal * billDiscount) / 100;
  const totalTax = items.reduce((sum, item) => sum + (Number(item.taxAmt) || 0), 0);
  const grandTotal = subTotal - billDiscountAmount + totalTax;
  const paidAmount = Number(advanceAmount) || 0;
  const balanceDue = grandTotal - paidAmount;

  // Fetch live stock when focused item changes
  useEffect(() => {
    if (focusedItem && focusedItem.code) {
      if (!liveStockMap[focusedItem.code]) {
        getStockAvailability(focusedItem.code)
          .then(data => {
            if (data && data.locations) {
              const totalAvail = data.locations.reduce((sum, loc) => sum + (loc.available || 0), 0);
              const totalReserved = data.locations.reduce((sum, loc) => sum + (loc.reserved || 0), 0);
              setLiveStockMap(prev => ({
                ...prev,
                [focusedItem.code]: {
                  hand: data.locations.reduce((sum, loc) => sum + (loc.onHand || 0), 0),
                  reserved: totalReserved,
                  available: totalAvail
                }
              }));
            }
          })
          .catch(err => console.error("Failed to fetch live stock for Proforma", err));
      }
    }
  }, [focusedItem]); // INTENTIONAL: NOT including liveStockMap to avoid loops


  // --- 1. FETCH DATA ON MOUNT ---
  // âœ… STEP 4: LOAD REAL DATA (List + Master Data)
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [custData, qtnData, soData, piData, bankAccData] = await Promise.all([
          getAllCustomers(),
          getAllQuotations(),
          getAllSalesOrders(),
          getAllProformas(),
          api.get('/api/ledger/accounts/bank-accounts').then(r => r.data).catch(() => [])
        ]);
        setBankAccountOptions(Array.isArray(bankAccData) ? bankAccData : []);
        const customers = Array.isArray(custData) ? custData : [];
        let validCustomers = [...customers];

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

        // âœ… Set default customer to Walk-in
        const walkIn = validCustomers.find(c => c.name.toLowerCase().includes('walkin') || c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase() === 'cash customer');
        if (walkIn) {
          setSelectedCustomer(current => current || walkIn);
        }

        setQuotationsList(Array.isArray(qtnData) ? qtnData : []);
        setSalesOrdersList(Array.isArray(soData) ? soData : []);
        setProformaList(Array.isArray(piData) ? piData : []); // Set list
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchAllData();
  }, []);

  const filteredProformas = useMemo(() => {
    let data = [...proformaList];

    // 1. Filter by Status
    if (filterStatus !== 'All') {
      data = data.filter(pi => pi.status === filterStatus);
    }

    // 2. Search
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      data = data.filter(pi =>
        (pi.piNumber && pi.piNumber.toLowerCase().includes(lowerTerm)) ||
        (pi.customerName && pi.customerName.toLowerCase().includes(lowerTerm))
      );
    }

    // 3. Sort
    if (sortConfig.key) {
      data.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'total') {
          aValue = Number(a.total || 0);
          bValue = Number(b.total || 0);
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [proformaList, searchTerm, filterStatus, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // --- CALCULATIONS ---
  // (Using reactive summary calcs at top)

  // âœ… PRINT FUNCTIONALITY
  // isPrinting already declared above

  const handlePrintClick = async () => {
    if (items.length === 0) {
      alert("Nothing to print. Add items first.");
      return;
    }

    setIsPrinting(true);
    try {
      const templates = await getTemplatesByCategory('Proforma Invoice (PI)');
      const defaultTemplate = templates.find(t => t.isDefault);

      if (defaultTemplate) {
        const fullCustomer = customersList.find(c => c.code === selectedCustomer?.code);

        const printData = {
          title: 'PROFORMA INVOICE',
          docNo: `${piNumber} (Rev ${version})`,
          date: piDate,
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
            grandTotal,
            currency: 'AED',
            billDiscount: 0,
            billDiscountAmount: 0
          },
          meta: {
            validTill: validUntil,
            paymentTerm: paymentMethod,
            status,
            notes: paymentNotes,
            reference: `Quote: ${linkedQuote || '-'} | SO: ${linkedSO || '-'}`
          }
        };

        const html = generatePrintHtml(defaultTemplate, printData, { companyProfile: company, billBullLogo });
        printHtml(html);
      } else {
        alert("No default template selected for Proforma Invoice. Please configure one in Settings.");
      }
    } catch (error) {
      console.error("Print error:", error);
      alert("Failed to print.");
    } finally {
      setIsPrinting(false);
    }
  };

  // --- HANDLERS ---

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

  const normalizeProformaItem = (item = {}, fallbackId = Date.now() + Math.random()) => {
    const resolvedUnit = item.unit || item.focUnit || 'PCS';
    const normalized = {
      id: item.id || fallbackId,
      code: item.code || item.itemCode || '',
      barcode: item.barcode || item.itemBarcode || '',
      image: item.primaryImage || item.image || item.thumbnailUrl || item.imageUrl || '',
      desc: item.desc || item.description || item.name || '',
      remarks: item.remarks || item.description || item.desc || item.name || '',
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
      disc: Number(item.disc ?? item.discount ?? item.discountPercent ?? item.discPercent) || 0,
      tax: Number(item.tax ?? item.taxRate ?? item.taxPercent) || 5,
      taxAmt: Number(item.taxAmt ?? item.taxAmount) || 0,
      total: Number(item.total ?? item.lineTotal) || 0,
      billDiscount: Number(item.billDiscount) || 0
    };

    return calculateRow(normalized);
  };

  // âœ… PRODUCT SELECTOR HANDLER
  const handleAddSingleProduct = (product) => {
    const defaultUnit = getDefaultProductUnit(product);
    const price = resolveUnitAmount({
      targetUnit: defaultUnit,
      amountMap: product.unitPrices,
      unitConversions: product.unitConversions,
      fallbackAmount: product.retailPrice ?? product.sellingPrice ?? 0
    });
    const cost = parseFloat(product.cost) || 0;
    const disc = parseFloat(product.maxDiscount) || 0;
    const tax = parseFloat(product.salesTax || product.taxPercent) || 5;

    const newItem = normalizeProformaItem({
      id: Date.now() + Math.random(),
      code: product.code,
      barcode: product.barcode || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
      desc: product.description || product.name,
      remarks: product.description || product.remarks || '',
      unit: defaultUnit,
      qty: 1,
      price,
      cost,
      foc: 0,
      focUnit: defaultUnit,
      availableUnits: product.availableUnits || ['PCS'],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      disc,
      tax,
      taxAmt: 0,
      total: 0
    });

    setItems(prev => {
      const hasData = prev.some(i => i.code || i.desc);
      return hasData ? [...prev, newItem] : [newItem];
    });

    setIsProductSelectorOpen(false); // âœ… Close modal after adding
  };

  const handleAddItem = () => {
    if (isReadOnly) return;
    setItems(prev => [...prev, createBlankProformaItem()]);
  };

  const handleDeleteItem = (id) => {
    if (isReadOnly) return;
    if (items.length > 1) setItems(items.filter(i => i.id !== id));
  };

  const handleItemChange = (id, field, value) => {
    if (isReadOnly) return;
    setItems(items.map(item => {
      if (item.id === id) {
        const stringFields = new Set(['desc', 'remarks', 'unit', 'code', 'image', 'focUnit', 'barcode']);
        const normalizedValue = stringFields.has(field) ? value : (Number(value) || 0);
        let newItem = { ...item, [field]: normalizedValue };

        // âœ… If unit is being changed, recalculate price based on conversion
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
        }

        newItem = calculateRow(newItem);
        if (focusedItem && focusedItem.id === id) setFocusedItem(newItem);
        return newItem;
      }
      return item;
    }));
  };

  const handleSaveAddonItem = (updatedItem) => {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    if (focusedItem && focusedItem.id === updatedItem.id) {
      setFocusedItem(updatedItem);
    }
    setSelectedAddonItem(null);
  };

  // âœ… STEP 8: LOAD PI ON ROW CLICK (REAL DATA)
  const handleRowClick = async (pi) => {
    try {
      // Use the pi object passed from the list directly
      // this avoids relying on getProformaById if it doesn't return items.
      const full = pi;
      setPiId(full.id);

      setPiNumber(full.piNumber);
      setPiDate(full.piDate);
      setValidUntil(full.validUntil);
      setStatus(full.status);
      setVersion(full.revisionNo);

      // Map Customer
      setSelectedCustomer({
        id: full.customerId,
        code: full.customerCode,
        name: full.customerName,
        trn: full.customerTrn,
        balance: full.balanceDue || '0.00'
      });

      setLinkedQuote(full.quotationNo || "");
      setLinkedSO(full.salesOrderNo || "");
      setBillDiscount(Number(full.billDiscount) || 0);
      setSourceType(full.quotationNo ? 'Quotation' : full.salesOrderNo ? 'Sales Order' : 'None');
      setSourceSearch('');

      setAdvanceAmount(full.advancePaid || 0);
      setPaymentMethod(full.paymentMethod || "Cash");
      setPaymentNotes(full.paymentNotes || "");
      setNotesToCustomer(full.notesToCustomer || "");

      // Map Items safely by calculating correctly
      const mappedItems = (full.items || []).map((item, index) =>
        normalizeProformaItem(item, item.id || Date.now() + index + Math.random())
      );
      setItems(mappedItems.length > 0 ? mappedItems : [createBlankProformaItem()]);

      setIsReadOnly(full.status === "ISSUED");
      setActiveTab("create");
    } catch (err) {
      console.error("Error loading PI details:", err);
      alert("Failed to load Proforma details.");
    }
  };

  const handleCreateNew = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].split('-').join('');
    const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
    setPiNumber(`PI-${dateStr}-${timeStr}`);
    setStatus('DRAFT');
    setPiId(null);
    setIsReadOnly(false);
    setVersion(1);
    setItems([createBlankProformaItem()]);
    setAdvanceAmount(0);

    // âœ… Set default customer to Walk-in
    const walkIn = customersList.find(c => c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walkin') || c.name.toLowerCase() === 'cash customer');
    setSelectedCustomer(walkIn || null);

    setSourceType('None');
    setLinkedQuote('');
    setLinkedSO('');
    setSourceSearch('');
    setPaymentRef('');
    setPaymentNotes('');
    setActiveTab('create');
  };

  // ✅ STEP 6: SAVE DRAFT -> REAL API
  const handleSaveDraft = async (advanceOverride = null) => {
    setIsSaving(true);
    try {
      const validItems = items.filter(i => i.code || i.desc);

      const finalAdvance = advanceOverride !== null ? Number(advanceOverride) : Number(advanceAmount);

      const payload = {
        piNumber,
        piDate,
        validUntil,
        customerId: selectedCustomer?.id === 'WALKIN-ID' ? null : selectedCustomer?.id,
        customerCode: selectedCustomer.code,
        customerName: selectedCustomer.name,
        customerTrn: selectedCustomer.trn,
        quotationNo: linkedQuote || null,
        salesOrderNo: linkedSO || null,
        paymentMethod,
        advancePaid: finalAdvance,
        billDiscount: Number(billDiscount),
        paymentNotes,
        notesToCustomer,
        shippingAddress,
        items: validItems.map(i => ({
          itemCode: i.code,
          barcode: i.barcode || '',
          description: i.desc,
          unit: i.unit,
          quantity: Number(i.qty),
          price: Number(i.price),
          taxPercent: Number(i.tax),
          discountPercent: Number(i.disc),
          foc: Number(i.foc) || 0,
          focUnit: i.focUnit || i.unit,
          remarks: i.remarks || ''
        }))
      };

      const saved = piId ? await updateProforma(piId, payload) : await createProforma(payload);
      const currentPiId = saved?.id || piId;
      setPiId(currentPiId);

      // Refresh list immediately to get accurate balance on list view
      const refreshedList = await getAllProformas();
      setProformaList(refreshedList);

      // âœ… If payment override is provided and balance is now 0, auto-issue
      const subTotalItems = payload.items.reduce((acc, it) => {
        const lineGross = it.quantity * it.price;
        const lineDisc = lineGross * (it.discountPercent / 100);
        const taxable = lineGross - lineDisc;
        const lineTax = taxable * (it.taxPercent / 100);
        return acc + taxable + lineTax;
      }, 0);
      const finalGrandTotal = subTotalItems * (1 - (Number(billDiscount) / 100));

      if (advanceOverride !== null && Number(finalAdvance) >= (finalGrandTotal - 1)) { // Allowing minor rounding gap
        await issueProforma(currentPiId);
        alert("Payment received and Proforma issued successfully!");
      } else {
        alert(piId ? "Draft updated successfully" : "Draft saved successfully");
      }

      setActiveTab("list");
    } catch (err) {
      console.error(err);
      if (err.response?.status === 409) {
        alert("Conflict Error (409): This PI Number might already exist or the record is in a state that cannot be updated. Try creating a new one.");
      } else {
        alert("Failed to save draft");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ STEP 7: ISSUE PI -> REAL API (WITH AUTO-SAVE)
  const handleIssuePI = async () => {
    if (!selectedCustomer) {
      return alert("Select customer first");
    }

    if (balanceDue > 0) {
      return alert(`Cannot Issue PI. Full payment is required. Current Balance Due: AED ${balanceDue.toFixed(2)}`);
    }

    setIsSaving(true);
    try {
      // 1. Auto-save current state as draft first to ensure the backend has latest data (including payments)
      const validItems = items.filter(i => i.code || i.desc);
      const payload = {
        piNumber,
        piDate,
        validUntil,
        customerId: selectedCustomer?.id === 'WALKIN-ID' ? null : selectedCustomer?.id,
        customerCode: selectedCustomer.code,
        customerName: selectedCustomer.name,
        customerTrn: selectedCustomer.trn,
        quotationNo: linkedQuote || null,
        salesOrderNo: linkedSO || null,
        paymentMethod,
        advancePaid: Number(advanceAmount),
        billDiscount: Number(billDiscount),
        paymentNotes,
        notesToCustomer,
        shippingAddress,
        items: validItems.map(i => ({
          itemCode: i.code,
          barcode: i.barcode || '',
          description: i.desc,
          unit: i.unit,
          quantity: Number(i.qty),
          price: Number(i.price),
          taxPercent: Number(i.tax),
          discountPercent: Number(i.disc),
          foc: Number(i.foc) || 0,
          focUnit: i.focUnit || i.unit,
          remarks: i.remarks || ''
        }))
      };

      let currentId = piId;
      if (!currentId) {
        const saved = await createProforma(payload);
        currentId = saved?.id;
        setPiId(currentId);
      } else {
        await updateProforma(currentId, payload);
      }

      if (!currentId) throw new Error("Failed to secure PI ID before issuing");

      // 2. Now perform the actual Issue
      await issueProforma(currentId);
      alert(`Proforma ${piNumber} issued successfully`);

      const refreshed = await getAllProformas();
      setProformaList(refreshed);
      setActiveTab("list");
    } catch (err) {
      console.error(err);
      if (err.response?.status === 409) {
        alert("Conflict Error (409): The backend rejected this issue. This usually happens if the PI Number is already taken or if the document is already in a state that cannot be modified. Try generating a new PI number.");
      } else {
        alert(err.message || "Failed to issue Proforma");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPaymentModal = () => {
    const outstanding = Math.max(grandTotal - Number(advanceAmount), 0);
    setModalPaymentAmount(outstanding > 0 ? outstanding.toFixed(2) : '');
    setModalPaymentDate(new Date().toISOString().split('T')[0]);
    setModalPaymentMode('Cash');
    setModalBankAccount('');
    setModalChequeDate(new Date().toISOString().split('T')[0]);
    setModalPaymentRef('');
    setModalNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleAddPaymentFromModal = async () => {
    const amount = Number(modalPaymentAmount);
    if (!amount || amount <= 0) return alert("Enter valid amount");

    // 1. Update UI State
    const newAdvance = Number(advanceAmount) + amount;
    setAdvanceAmount(newAdvance);
    setPaymentMethod(modalPaymentMode);
    setPaymentNotes(modalNotes);
    setIsPaymentModalOpen(false);

    // 2. Create a Receipt Voucher (Hit the Financials)
    try {
      const rvData = {
        date: modalPaymentDate,
        branch: defaultBranchName || 'Main Branch',
        memberName: selectedCustomer?.name || 'Walk-in Customer',
        category: 'Customer Advance',
        amount: amount,
        paymentMode: modalPaymentMode,
        reference: `Advance for PI: ${piNumber}`,
        notes: modalNotes || 'Automated receipt from Proforma Invoice module',
        status: 'Completed',
        purpose: 'ADVANCE_RECEIVED',
        bankAccount: modalBankAccount || null,
        chequeDate: modalChequeDate || null
      };

      const formData = new FormData();
      formData.append('data', JSON.stringify(rvData));

      await receiptVoucherApi.create(formData);
    } catch (err) {
      console.error("Failed to post Receipt Voucher to financials", err);
    }

    // 3. Auto-save document to ensure payment is tracked in the record immediately
    // If it's a new document, it will create one; otherwise, update
    try {
      setTimeout(() => {
        handleSaveDraft(newAdvance); // PASS THE NEW AMOUNT DIRECTLY TO AVOID STALE STATE
      }, 100);
    } catch (err) {
      console.error("Auto-save failed on payment", err);
    }
  };

  const handleNewRevision = () => {
    setVersion(prev => prev + 1);
    setStatus('DRAFT');
    setIsReadOnly(false);
    alert("New revision created. You can now edit and save as Rev 0" + (version + 1));
  };

  // --- Selection Handlers ---
  const handleSelectQuotation = async (qtn) => {
    setLinkedQuote(qtn.qtnNo);
    setIsQuotationOpen(false);
    setSourceSearch('');
    try {
      const full = await getQuotationById(qtn.id);
      const matchedCust = customersList.find(c => c.code === (full.customerCode || qtn.customerCode) || c.name === (full.customerName || qtn.customerName));
      if (matchedCust) setSelectedCustomer(matchedCust);
      const srcItems = full.items || full.lineItems || [];
      if (srcItems.length > 0) {
        setItems(srcItems.map((item, i) => normalizeProformaItem(item, item.id || Date.now() + i + Math.random())));
      }
    } catch (err) {
      console.error('Failed to fetch quotation details', err);
      const matchedCust = customersList.find(c => c.name === qtn.customerName || c.code === qtn.customerCode);
      if (matchedCust) setSelectedCustomer(matchedCust);
    }
  };

  const handleSelectSalesOrder = async (so) => {
    setLinkedSO(so.soNumber);
    setIsSalesOrderOpen(false);
    setSourceSearch('');
    try {
      const full = await getSalesOrderById(so.id);
      const matchedCust = customersList.find(c => c.code === (full.customerCode || so.customerCode));
      if (matchedCust) setSelectedCustomer(matchedCust);
      const srcItems = full.items || full.lineItems || [];
      if (srcItems.length > 0) {
        setItems(srcItems.map((item, i) => normalizeProformaItem(item, item.id || Date.now() + i + Math.random())));
      }
    } catch (err) {
      console.error('Failed to fetch sales order details', err);
      const matchedCust = customersList.find(c => c.code === so.customerCode);
      if (matchedCust) setSelectedCustomer(matchedCust);
    }
  };

  const renderStatusBadge = (s) => {
    if (s === 'Issued' || s === 'ISSUED') return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">Issued</span>;
    return <span className="px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded text-[10px] font-bold">Draft</span>;
  };

  const getPaymentColorClass = () => {
    const adv = Number(advanceAmount);
    if (adv === 0) return 'text-slate-700';
    if (balanceDue <= 0 && grandTotal > 0) return 'text-emerald-600 font-bold';
    return 'text-red-600 font-bold';
  };

  const MobileCard = ({ pi }) => (
    <div
      onClick={() => handleRowClick(pi)}
      className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-3 active:scale-[0.95] transition-all"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-bold text-slate-800 text-sm">{pi.piNumber}</h4>
          <span className="text-xs text-slate-500">{pi.piDate}</span>
        </div>
        {renderStatusBadge(pi.status)}
      </div>

      <div className="flex items-center gap-2 mb-3 text-xs text-slate-600">
        <User size={12} className="text-slate-400" />
        <span className="font-medium truncate">{pi.customerName}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
        <div>
          <span className="block text-slate-400 text-[10px] uppercase">Value</span>
          <span className="font-bold text-slate-700">{pi.grandTotal?.toFixed(2)}</span>
        </div>
        <div className="text-right">
          <span className="block text-slate-400 text-[10px] uppercase">Balance</span>
          <span className="font-bold text-red-500">{pi.balanceDue?.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#F7F7FA] font-sans text-slate-900 relative"
      onClick={() => {
        setIsQuotationOpen(false);
        setIsSalesOrderOpen(false);
        setIsCurrencyOpen(false);
      }}
    >
      <main className="flex-1 p-4 md:p-6 flex flex-col min-w-0">
        {/* --- MODALS --- */}
        <ProductSelector
          isOpen={isProductSelectorOpen}
          onClose={() => setIsProductSelectorOpen(false)}
          onSelect={handleAddSingleProduct}
          title="Select Items"
          actionLabel="Add to PI"
        />
        <StockAvailabilityModal
          isOpen={isItemStockModalOpen}
          onClose={() => setIsItemStockModalOpen(false)}
          selectedStockItem={selectedStockItem}
        />

        {/* --- STICKY HEADER --- */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-5 sticky top-0 z-40 shadow-sm mb-6 -mx-4 md:-mx-6 mt-[-16px] md:mt-[-24px]">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
            {/* Title */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Customers & Sales</span>
                <ChevronRight size={12} />
                <span className="font-medium text-slate-900">Proforma Invoice</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FileText className="text-[#F5C742]" size={28} /> Proforma Invoice</h1>
              <p className="text-sm text-slate-500">Manage and create proforma invoices for your customers.</p>
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
              <button
                onClick={handlePrintClick}
                disabled={isPrinting || activeTab === 'list'}
                className="flex-1 sm:flex-none h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Printer className="h-4 w-4" /> {isPrinting ? 'Printing...' : 'Print'}
              </button>
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
          <div className="flex overflow-x-auto no-scrollbar gap-2">
            {[
              { id: 'list', label: 'Proforma List', icon: ShoppingCartIcon },
              { id: 'create', label: 'Proforma Editor', icon: FileText }
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
          <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm p-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="font-bold text-slate-700 text-lg">Proforma Invoices</h2>

              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search PI / Customer..."
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
                    <option value="DRAFT">Draft</option>
                    <option value="ISSUED">Issued</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>

                <button onClick={handleCreateNew} className="flex items-center justify-center gap-1 px-4 py-2 bg-yellow-400 text-slate-900 text-sm font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm whitespace-nowrap">
                  <Plus size={16} /> Create New
                </button>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left hidden md:table">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/50">
                  <tr>
                    <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('piNumber')}>
                      <div className="flex items-center gap-1">PI Number {sortConfig.key === 'piNumber' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}</div>
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('piDate')}>
                      <div className="flex items-center gap-1">Date {sortConfig.key === 'piDate' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}</div>
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('customerName')}>
                      <div className="flex items-center gap-1">Customer {sortConfig.key === 'customerName' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}</div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('total')}>
                      <div className="flex items-center justify-end gap-1">Total {sortConfig.key === 'total' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}</div>
                    </th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/30">
                  {filteredProformas.map((pi) => (
                    <tr
                      key={pi.id}
                      onClick={() => handleRowClick(pi)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-blue-600 font-medium">{pi.piNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{pi.piDate}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{pi.customerName}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">AED {Number(pi.grandTotal || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{renderStatusBadge(pi.status)}</td>
                    </tr>
                  ))}
                  {filteredProformas.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-12 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                            <Search size={20} className="text-slate-400" />
                          </div>
                          <p>No proforma invoices found matching your criteria.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredProformas.map(pi => (
                <div key={pi.id} onClick={() => handleRowClick(pi)} className="cursor-pointer">
                  <MobileCard pi={pi} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================= VIEW: CREATE / EDIT ======================= */}
        {activeTab === 'create' && (
          <div className="space-y-6 flex-1 flex flex-col pb-24">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 xl:gap-6 items-start">
              {/* --- LEFT COLUMN: DETAILS --- */}
              <div className="xl:col-span-1 space-y-4">

                {/* 1. Document Details Card */}
                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      Document Details
                    </h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-xs font-semibold text-slate-500 mb-1">PI Number</label>
                        <input
                          type="text"
                          value={piNumber}
                          onChange={(e) => setPiNumber(e.target.value)}
                          className="text-sm p-1.5 bg-white border border-slate-300 rounded text-slate-700 focus:border-yellow-400 outline-none"
                          placeholder="e.g. PI-1001"
                        />
                      </div>
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-xs font-semibold text-slate-500 mb-1">PI Date <span className="text-red-500">*</span></label>
                        <input type="date" value={piDate} onChange={(e) => setPiDate(e.target.value)} className="text-sm p-1.5 border border-slate-300/50 rounded text-slate-700" />
                      </div>
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Valid Till <span className="text-red-500">*</span></label>
                        <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="text-sm p-1.5 border border-slate-300/50 rounded text-slate-700" />
                      </div>
                      {/* Source Type Selector */}
                      <div className="flex flex-col col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Source Type</label>
                        <div className="flex gap-2">
                          {['None', 'Quotation', 'Sales Order'].map(type => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                setSourceType(type);
                                setLinkedQuote('');
                                setLinkedSO('');
                                setSourceSearch('');
                                setIsQuotationOpen(false);
                                setIsSalesOrderOpen(false);
                              }}
                              className={`flex-1 text-xs py-1.5 px-2 rounded border font-semibold transition-colors ${
                                sourceType === type
                                  ? 'bg-[#F5C742] border-[#F5C742] text-slate-900'
                                  : 'bg-white border-slate-300/50 text-slate-500 hover:border-[#F5C742]'
                              }`}
                            >
                              {type === 'None' ? 'None' : `Link ${type}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Searchable Source Picker */}
                      {sourceType !== 'None' && (
                        <div className="flex flex-col relative col-span-2">
                          <label className="text-xs font-semibold text-slate-500 mb-1">
                            {sourceType === 'Quotation' ? 'Select Quotation' : 'Select Sales Order'}
                          </label>
                          <div className="relative">
                            <div
                              className="w-full text-sm p-1.5 border border-slate-300/50 rounded flex items-center gap-2 cursor-pointer hover:border-[#F5C742] transition-colors bg-white pr-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (sourceType === 'Quotation') { setIsQuotationOpen(true); setIsSalesOrderOpen(false); }
                                else { setIsSalesOrderOpen(true); setIsQuotationOpen(false); }
                                setSourceSearch('');
                              }}
                            >
                              <Search size={13} className="text-slate-400 shrink-0" />
                              <span className={`flex-1 truncate ${(sourceType === 'Quotation' ? linkedQuote : linkedSO) ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                                {sourceType === 'Quotation'
                                  ? (linkedQuote || 'Search quotation...')
                                  : (linkedSO || 'Search sales order...')}
                              </span>
                              {(sourceType === 'Quotation' ? linkedQuote : linkedSO) && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); sourceType === 'Quotation' ? setLinkedQuote('') : setLinkedSO(''); }}
                                  className="text-slate-400 hover:text-slate-600"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />

                            {/* Quotation dropdown */}
                            {isQuotationOpen && sourceType === 'Quotation' && (
                              <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 z-50">
                                <div className="p-2 border-b border-slate-100">
                                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                    <Search size={12} className="text-slate-400 shrink-0" />
                                    <input
                                      autoFocus
                                      type="text"
                                      value={sourceSearch}
                                      onChange={e => setSourceSearch(e.target.value)}
                                      onClick={e => e.stopPropagation()}
                                      placeholder="Search by number or customer..."
                                      className="flex-1 text-xs bg-transparent outline-none text-slate-700"
                                    />
                                  </div>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {quotationsList
                                    .filter(q => {
                                      const s = sourceSearch.toLowerCase();
                                      return !s || (q.qtnNo || '').toLowerCase().includes(s) || (q.customer || q.customerName || '').toLowerCase().includes(s);
                                    })
                                    .map(q => (
                                      <div key={q.id} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer text-slate-700 border-b border-slate-50 last:border-0 flex justify-between items-center" onClick={() => handleSelectQuotation(q)}>
                                        <span className="font-bold text-slate-800">{q.qtnNo}</span>
                                        <span className="text-slate-400 truncate ml-2">{q.customer || q.customerName}</span>
                                      </div>
                                    ))}
                                  {quotationsList.filter(q => { const s = sourceSearch.toLowerCase(); return !s || (q.qtnNo || '').toLowerCase().includes(s) || (q.customer || q.customerName || '').toLowerCase().includes(s); }).length === 0 && (
                                    <div className="px-3 py-4 text-xs text-slate-400 text-center">No quotations found</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Sales Order dropdown */}
                            {isSalesOrderOpen && sourceType === 'Sales Order' && (
                              <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 z-50">
                                <div className="p-2 border-b border-slate-100">
                                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                    <Search size={12} className="text-slate-400 shrink-0" />
                                    <input
                                      autoFocus
                                      type="text"
                                      value={sourceSearch}
                                      onChange={e => setSourceSearch(e.target.value)}
                                      onClick={e => e.stopPropagation()}
                                      placeholder="Search by number or customer..."
                                      className="flex-1 text-xs bg-transparent outline-none text-slate-700"
                                    />
                                  </div>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {salesOrdersList
                                    .filter(so => {
                                      const s = sourceSearch.toLowerCase();
                                      return !s || (so.soNumber || '').toLowerCase().includes(s) || (so.customerName || '').toLowerCase().includes(s);
                                    })
                                    .map(so => (
                                      <div key={so.id} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer text-slate-700 border-b border-slate-50 last:border-0 flex justify-between items-center" onClick={() => handleSelectSalesOrder(so)}>
                                        <span className="font-bold text-slate-800">{so.soNumber}</span>
                                        <span className="text-slate-400 truncate ml-2">{so.customerName}</span>
                                      </div>
                                    ))}
                                  {salesOrdersList.filter(so => { const s = sourceSearch.toLowerCase(); return !s || (so.soNumber || '').toLowerCase().includes(s) || (so.customerName || '').toLowerCase().includes(s); }).length === 0 && (
                                    <div className="px-3 py-4 text-xs text-slate-400 text-center">No sales orders found</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Customer Details Card */}
                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      Customer Details
                    </h3>
                  </div>
                  <div className="p-5">
                    <div className="space-y-4">
                      <div className="relative">
                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Customer <span className="text-red-500">*</span></label>
                        <div
                          className="w-full text-sm p-1.5 border border-slate-300/50 rounded flex items-center gap-3 cursor-pointer hover:border-yellow-400 transition-colors bg-white shadow-sm"
                          onClick={() => setIsCustomerSearchOpen(true)}
                        >
                          <Search size={16} className="text-slate-400 shrink-0" />
                          <span className="flex-1 truncate font-medium text-slate-700">
                            {selectedCustomer ? `${selectedCustomer.code} - ${selectedCustomer.name}` : 'Search customer...'}
                          </span>
                        </div>
                      </div>

                      {selectedCustomer && (
                        <div className="bg-slate-50 border border-slate-200/50 rounded p-3 text-sm animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="font-bold text-slate-800">{selectedCustomer.name}</div>
                              <div className="text-xs text-slate-500">Code: {selectedCustomer.code}</div>
                              <div className="text-xs text-slate-500">TRN: {selectedCustomer.trn || 'N/A'}</div>
                              <div className="text-xs text-slate-500">Phone: {selectedCustomer.mobile || selectedCustomer.phone || 'N/A'}</div>
                            </div>
                            <div className="text-right">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${selectedCustomer.creditStatus === 'Good' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                Credit: {selectedCustomer.creditStatus === 'Good' ? 'Healthy' : 'Review'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="border-t border-slate-100/50 pt-3">
                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Shipping Address</label>
                        <textarea
                          rows="3"
                          value={shippingAddress}
                          onChange={(e) => setShippingAddress(e.target.value)}
                          className="w-full text-sm p-2 border border-slate-300/50 rounded outline-none focus:border-yellow-400 transition-colors resize-none placeholder:text-slate-300 bg-white"
                          placeholder="Enter shipping details if different from registered address..."
                        ></textarea>
                      </div>
                    </div>
                  </div>

                  <CustomerSelector
                    isOpen={isCustomerSearchOpen}
                    onClose={() => setIsCustomerSearchOpen(false)}
                    onSelect={(cust) => setSelectedCustomer(cust)}
                    customers={customersList}
                    selectedCode={selectedCustomer?.code || ''}
                    onCustomerCreated={async () => {
                      const data = await getAllCustomers();
                      setCustomersList(Array.isArray(data) ? data : []);
                    }}
                  />
                </div>
              </div>

              {/* --- MIDDLE COLUMN: ITEMS & NOTES --- */}
              <div className="xl:col-span-2 space-y-4">
                {/* Items Table */}
                <div className="bg-white rounded-lg border border-slate-200/50 p-5 shadow-sm min-h-[460px]">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100/50 pb-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <ShoppingCart size={16} className="text-yellow-500" /> Proforma Invoice Items
                    </h3>
                    {!isReadOnly && (
                      <button
                        onClick={() => setIsProductSelectorOpen(true)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500"
                      >
                        <Plus size={14} /> Select from Products
                      </button>
                    )}
                  </div>

                  <div
                    className="overflow-auto"
                    style={items.length > 5 ? { maxHeight: '380px', overflowY: 'auto' } : {}}
                  >
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
                                <span className="text-xs mt-1 text-slate-400">Click "Select from Products" to start building this Proforma Invoice.</span>
                              </div>
                            </td>
                          </tr>
                        ) : items.map((item, index) => (
                          <React.Fragment key={item.id}>
                            <tr className={`group hover:bg-slate-50/50 transition-colors bg-white align-middle ${isReadOnly ? 'opacity-80' : ''}`}>
                              <td className="p-2 text-center text-slate-400 text-xs font-medium">{index + 1}</td>
                              <td className="p-2">
                                <ItemDescriptionCell
                                  item={item}
                                  isExpanded={expandedRows[item.id]}
                                  onToggleExpand={toggleRowDescription}
                                  onItemChange={handleItemChange}
                                  onFocusCode={() => setFocusedItem(item)}
                                  onOpenProductSelection={!isReadOnly ? () => setIsProductSelectorOpen(true) : undefined}
                                  onCheckStock={() => { setSelectedStockItem(item); setIsItemStockModalOpen(true); }}
                                  onOpenSettings={(selectedItem) => setSelectedAddonItem({ ...selectedItem })}
                                  showSettings={Boolean(item.code || item.desc || item.remarks)}
                                  showTaxDiscount={true}
                                  isReadOnly={isReadOnly}
                                  page="proforma_invoice"
                                />
                              </td>
                              <td className="p-2 text-center align-middle">
                                <div className="rounded-md border border-slate-200 bg-white inline-block px-1 py-1 min-w-[50px]">
                                  <select
                                    disabled={isReadOnly}
                                    className="w-full bg-transparent outline-none text-center text-xs text-slate-700 appearance-none font-medium cursor-pointer disabled:opacity-50"
                                    value={item.unit || 'PCS'}
                                    onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                  >
                                    {(item.availableUnits || ['PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </div>
                              </td>
                              <td className="p-2 text-center align-middle">
                                <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[88px] mx-auto">
                                  <input
                                    disabled={isReadOnly}
                                    type="number"
                                    min="1"
                                    className="w-full bg-transparent text-center outline-none font-bold text-sm text-slate-800 disabled:opacity-50"
                                    value={item.qty === 0 ? '' : item.qty}
                                    onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                                    placeholder="0"
                                  />
                                </div>
                              </td>
                              <td className="p-2 text-center align-middle">
                                <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[104px] mx-auto">
                                  <input
                                    disabled={isReadOnly}
                                    type="number"
                                    className="w-full bg-transparent text-center outline-none font-semibold text-sm text-slate-700 disabled:opacity-50"
                                    value={item.price === 0 ? '' : item.price}
                                    onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                    placeholder="0.00"
                                  />
                                </div>
                              </td>
                              <td className="p-2 text-center align-middle w-24">
                                <div className="font-bold text-slate-800 text-sm">{Number(item.total || 0).toFixed(2)}</div>
                              </td>
                              <td className="p-2 text-center align-middle w-16">
                                {!isReadOnly && (
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="text-slate-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                            {expandedRows[item.id] && (
                              <tr className="bg-white">
                                <td></td>
                                <td colSpan={6} className="px-0 pb-4 pt-1">
                                  <div className="ml-[60px] mr-4 p-3 rounded-r-[10px] border-l-[3px] border-[#FFD700] bg-[#FFFDE7]/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                                    <div className="flex justify-between items-center mb-1.5">
                                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#B8860B] tracking-widest uppercase">
                                        <Menu size={10} strokeWidth={3} className="opacity-80" /> PRODUCT DESCRIPTION
                                      </div>
                                      <span className="text-[9px] text-yellow-700/50 font-medium">{(item.remarks || '').length} chars</span>
                                    </div>
                                    <textarea
                                      disabled={isReadOnly}
                                      rows="1"
                                      className="w-full bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-yellow-700/30 resize-none font-medium leading-relaxed disabled:opacity-50"
                                      value={item.remarks || ''}
                                      onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                      placeholder="Enter product description - auto-loaded from product master, fully editable..."
                                      onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = (e.target.scrollHeight) + 'px'; }}
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
                  {/* Attachments */}
                  <div className="bg-white rounded-lg border border-slate-200/50 p-5 shadow-sm h-full">
                    <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                      <Paperclip size={14} className="text-slate-400" /> Attachments
                    </h3>
                    <div className="border-2 border-dashed border-slate-200/50 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                      <p className="text-[10px] text-slate-500 mb-2">Upload documents (Customer PO, Specs)</p>
                      <label className="cursor-pointer mb-2">
                        <span className="px-3 py-1 bg-white border border-slate-300/50 rounded text-[10px] font-bold text-slate-700 hover:bg-slate-50">Choose Files</span>
                        <input type="file" className="hidden" multiple />
                      </label>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="bg-white rounded-lg border border-slate-200/50 p-5 shadow-sm h-full">
                    <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                      <Info size={14} className="text-slate-400" /> Notes
                    </h3>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Notes to Customer</label>
                        <textarea
                          rows="3"
                          value={notesToCustomer}
                          onChange={(e) => setNotesToCustomer(e.target.value)}
                          className="w-full text-xs p-2 border border-slate-300/50 rounded resize-none focus:border-yellow-400 focus:outline-none"
                          placeholder="Visible on proforma..."
                        ></textarea>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Internal Notes</label>
                        <textarea
                          rows="3"
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                          className="w-full text-xs p-2 border border-slate-300/50 rounded resize-none focus:border-yellow-400 focus:outline-none"
                          placeholder="Internal use only..."
                        ></textarea>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* --- RIGHT COLUMN: SUMMARY & SIDEBAR --- */}
              <div className="xl:col-span-1 space-y-4">
                {/* 3. Summary Card */}
                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm overflow-hidden sticky top-24">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-800">Proforma Summary</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Gross Amount</span>
                        <span className="font-medium">{grossTotal.toFixed(2)} AED</span>
                      </div>
                      <div className="flex justify-between text-red-500">
                        <span>Item Discount</span>
                        <span className="font-medium">-{totalItemDiscount.toFixed(2)} AED</span>
                      </div>
                      <div className="flex justify-between text-slate-800 font-bold border-t border-slate-100 pt-1">
                        <span>Sub Total</span>
                        <span>{subTotal.toFixed(2)} AED</span>
                      </div>
                      <div className="flex justify-between text-slate-600 items-center">
                        <div className="flex items-center gap-2">
                          <span>Discount (%)</span>
                          <input
                            type="number"
                            className="w-10 p-1 text-center border border-slate-200/50 rounded text-xs focus:border-yellow-400 outline-none"
                            value={billDiscount}
                            onChange={(e) => setBillDiscount(Number(e.target.value))}
                          />
                        </div>
                        <span className="font-medium">
                          {billDiscountAmount > 0 ? `-${billDiscountAmount.toFixed(2)}` : '0.00'} AED
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Tax Total</span>
                        <span className="font-medium">{totalTax.toFixed(2)} AED</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 mt-3">
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-semibold text-slate-500">Grand Total</span>
                        <span className="font-bold text-slate-900">{grandTotal.toFixed(2)} AED</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-2 text-emerald-600 font-bold border-t border-slate-100/50 pt-2">
                        <span>Balance Due</span>
                        <span>{balanceDue.toFixed(2)} AED</span>
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded text-[10px] text-amber-700 font-medium leading-relaxed flex gap-2">
                      <AlertTriangle size={14} className="shrink-0" />
                      Note: confirmation required before Issue.
                    </div>
                  </div>
                </div>

                {/* 4. Stock Check */}
                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Box size={14} className="text-slate-400" /> Stock Check
                    </h3>
                  </div>
                  <div className="p-5">
                    {focusedItem && focusedItem.code ? (
                      <div className="space-y-3">
                        <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                          <div className="font-bold text-slate-800 text-xs mb-1">{focusedItem.code}</div>
                          <div className="text-[10px] text-slate-500 truncate mb-2">{focusedItem.desc}</div>

                          <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-200/50">
                            <div className="space-y-0.5">
                              <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">Available</div>
                              <div className="text-xl font-bold text-slate-900">{liveStockMap[focusedItem.code] ? liveStockMap[focusedItem.code].available : (focusedItem.stock || focusedItem.currentStock || 0)}</div>
                            </div>
                            <div className="text-right space-y-0.5">
                              <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">Requested</div>
                              <div className="text-sm font-semibold text-slate-600">{focusedItem.qty || 0}</div>
                            </div>
                          </div>
                        </div>

                        {(liveStockMap[focusedItem.code] ? liveStockMap[focusedItem.code].available : (focusedItem.stock || focusedItem.currentStock || 0)) < (focusedItem.qty || 0) ? (
                          <div className="flex items-center gap-2 p-2 bg-red-50 text-red-700 border border-red-100 rounded text-[10px] font-bold">
                            <AlertTriangle size={14} /> Low Stock Warning
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold">
                            <CheckCircle2 size={14} /> Sufficient Stock
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <ShoppingCart className="mx-auto text-slate-200 mb-2" size={32} />
                        <p className="text-[11px] text-slate-400 font-medium px-4">Focus an item row to check real-time availability</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Proforma Guide */}
                <div className="bg-slate-50 rounded-lg border border-slate-200/50 p-5 relative overflow-hidden group">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <Info size={14} /> Proforma Guide
                  </h4>
                  <ul className="space-y-2.5">
                    <li className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                      <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-500 font-bold text-[9px]">1</div>
                      <span>Fill in the customer details and item list.</span>
                    </li>
                    <li className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                      <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-500 font-bold text-[9px]">2</div>
                      <span>Record advance payment if received.</span>
                    </li>
                    <li className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                      <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-500 font-bold text-[9px]">3</div>
                      <span>Save Draft, then Issue to generate final PI.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ITEM ADD-ONS MODAL */}
        {selectedAddonItem && (
          <ItemAddOnsModal
            item={selectedAddonItem}
            onClose={() => setSelectedAddonItem(null)}
            onSave={handleSaveAddonItem}
            isReadOnly={isReadOnly}
          />
        )}

        {/* --- STICKY FOOTER ACTION BAR --- */}
        {
          activeTab === 'create' && (
            <div className="hidden md:flex fixed bottom-0 md:left-64 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] justify-between items-center z-[60]">
              <div className="flex items-center gap-3">
                <div className="px-2 py-1 bg-slate-100 border border-slate-200/50 rounded-md text-[11px] font-bold text-slate-600 shadow-sm flex items-center gap-2">
                  Status: {renderStatusBadge(status)}
                </div>
                <span className="text-[11px] font-medium text-slate-500 hidden lg:inline">PI No: <span className="text-slate-700 font-bold">{piNumber}</span></span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Save size={14} /> {isSaving ? 'Saving...' : 'Save Draft'}
                </button>
                {status !== 'ISSUED' && (
                  <button
                    onClick={handleIssuePI}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-5 py-1.5 bg-yellow-400 text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 transition-all shadow-sm disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> {isSaving ? 'Processing...' : 'Issue Proforma'}
                  </button>
                )}
                <button
                  onClick={handleOpenPaymentModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <DollarSign size={14} /> Pay
                </button>
              </div>
            </div>
          )
        }
      </main >

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
                <span className="text-red-600 font-bold text-lg">AED {Math.max(grandTotal - Number(advanceAmount), 0).toFixed(2)}</span>
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
    </div >
  );
};


export default ProformaInvoice;

