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
  ShoppingCart as ShoppingCartIcon,
  SlidersHorizontal
} from 'lucide-react';

import { useMemo } from 'react';

// ✅ REAL API IMPORTS
import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllQuotations } from '../../api/quotationApi';
import { getAllSalesOrders } from '../../api/salesorderApi';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import billBullLogo from '../../assets/billBullLogo.png';
import { useCompany } from '../../context/CompanyContext';

// ✅ STEP 2: PROFORMA API IMPORTS
import {
  getAllProformas,
  createProforma,
  updateProforma,
  issueProforma,
  getProformaById
} from "../../api/proformaApi";

// ✅ PRODUCT SELECTOR
import ProductSelector from '../../components/ProductSelector';

// ✅ CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';

// ✅ STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';
import { getStockAvailability } from '../../api/stockAvailabilityApi'; // ✅ NEW API for LIVE STOCK

// ✅ SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// ✅ GLOBAL COMPONENTS
import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';

const ProformaInvoice = () => {
  const { company } = useCompany();
  const [activeTab, setActiveTab] = useState('list');
  const [piId, setPiId] = useState(null);

  // --- DATA LIST STATES (Fetched from APIs) ---
  const [customersList, setCustomersList] = useState([]);
  const [quotationsList, setQuotationsList] = useState([]);
  const [salesOrdersList, setSalesOrdersList] = useState([]);

  // --- PROFORMA LIST STATE ---
  // ❌ STEP 3: REMOVE MOCK DATA & REPLACE WITH EMPTY ARRAY
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
  const [linkedQuote, setLinkedQuote] = useState('');
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);

  const [linkedSO, setLinkedSO] = useState('');
  const [isSalesOrderOpen, setIsSalesOrderOpen] = useState(false);

  // View Only Mode
  const [isReadOnly, setIsReadOnly] = useState(false);

  // ✅ PRODUCT SELECTOR STATE
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  const [items, setItems] = useState([
    { id: Date.now(), code: '', image: '', desc: '', unit: 'PCS', qty: 0, price: 0, tax: 5, taxAmt: 0, total: 0 }
  ]);

  // ✅ GLOBAL SHORTCUTS
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

  // Sidebars & UI
  const [focusedItem, setFocusedItem] = useState(null);

  // ✅ LIVE STOCK CACHE FOR ITEM AVAILABILITY PANEL
  const [liveStockMap, setLiveStockMap] = useState({});

  // Item Add-Ons Modal State
  const [selectedAddonItem, setSelectedAddonItem] = useState(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'piNumber', direction: 'desc' });

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

  // Summary Calcs
  const subTotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
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
  // ✅ STEP 4: LOAD REAL DATA (List + Master Data)
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [custData, qtnData, soData, piData] = await Promise.all([
          getAllCustomers(),
          getAllQuotations(),
          getAllSalesOrders(),
          getAllProformas() // Fetch list
        ]);
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

        // ✅ Set default customer to Walk-in
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

  // ✅ PRINT FUNCTIONALITY
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
            tax: taxTotal,
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

  // ✅ PRODUCT SELECTOR HANDLER
  const handleAddSingleProduct = (product) => {
    const price = parseFloat(product.retailPrice) || parseFloat(product.sellingPrice) || 0;
    const disc = parseFloat(product.maxDiscount) || 0;
    const tax = parseFloat(product.salesTax) || 5;

    const rawItem = {
      id: Date.now() + Math.random(),
      code: product.code,
      barcode: product.barcode || '',
      image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
      desc: product.description || product.name,
      unit: product.unitName || product.unit || (product.availableUnits && product.availableUnits[0]) || 'PCS',
      qty: 1,
      price: price,
      foc: 0,
      focUnit: product.unitName || product.unit || (product.availableUnits && product.availableUnits[0]) || 'PCS',
      availableUnits: product.availableUnits || ['PCS'],
      unitConversions: product.unitConversions || {},
      unitPrices: product.unitPrices || {},
      disc: disc,
      tax: tax,
      taxAmt: 0,
      total: 0,
      remarks: product.description || product.remarks || ''
    };

    const newItem = calculateRow(rawItem);

    setItems(prev => {
      const hasData = prev.some(i => i.code || i.desc);
      return hasData ? [...prev, newItem] : [newItem];
    });

    setIsProductSelectorOpen(false); // ✅ Close modal after adding
  };

  const handleAddItem = () => {
    if (isReadOnly) return;
    setItems([...items, { id: Date.now(), code: '', desc: '', unit: 'PCS', qty: 0, price: 0, tax: 5, total: 0 }]);
  };

  const handleDeleteItem = (id) => {
    if (isReadOnly) return;
    if (items.length > 1) setItems(items.filter(i => i.id !== id));
  };

  const handleItemChange = (id, field, value) => {
    if (isReadOnly) return;
    setItems(items.map(item => {
      if (item.id === id) {
        let newItem = { ...item, [field]: value };

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
        }

        newItem = calculateRow(newItem);
        if (focusedItem && focusedItem.id === id) setFocusedItem(newItem);
        return newItem;
      }
      return item;
    }));
  };

  const handleModalItemChange = (field, value) => {
    setSelectedAddonItem(prev => {
      const updated = { ...prev, [field]: value };
      return calculateRow(updated);
    });
  };

  const saveModalItem = () => {
    if (selectedAddonItem) {
      setItems(items.map(i => i.id === selectedAddonItem.id ? selectedAddonItem : i));
      setSelectedAddonItem(null);
    }
  };

  // ✅ STEP 8: LOAD PI ON ROW CLICK (REAL DATA)
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

      setAdvanceAmount(full.advancePaid || 0);
      setPaymentMethod(full.paymentMethod || "Cash");
      setPaymentNotes(full.paymentNotes || "");
      setNotesToCustomer(full.notesToCustomer || "");

      // Map Items safely by calculating correctly
      setItems((full.items || []).map(i => {
        const rawItem = {
          id: i.id || Date.now() + Math.random(),
          code: i.itemCode || '',
          barcode: i.barcode || '',
          desc: i.description || '',
          unit: i.unit || 'PCS',
          qty: i.quantity || 0,
          price: i.price || 0,
          tax: i.taxPercent || 0,
          disc: 0,
          foc: i.foc || 0
        };
        return calculateRow(rawItem);
      }));

      setIsReadOnly(full.status === "ISSUED");
      setActiveTab("create");
    } catch (err) {
      console.error("Error loading PI details:", err);
      alert("Failed to load Proforma details.");
    }
  };

  const handleCreateNew = () => {
    setPiNumber('PI-' + Math.floor(Math.random() * 100000));
    setStatus('DRAFT');
    setPiId(null);
    setIsReadOnly(false);
    setVersion(1);
    setItems([{ id: Date.now(), code: '', desc: '', unit: 'PCS', qty: 0, price: 0, tax: 5, total: 0 }]);
    setAdvanceAmount(0);

    // ✅ Set default customer to Walk-in
    const walkIn = customersList.find(c => c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walkin') || c.name.toLowerCase() === 'cash customer');
    setSelectedCustomer(walkIn || null);

    setLinkedQuote('');
    setLinkedSO('');
    setPaymentRef('');
    setPaymentNotes('');
    setActiveTab('create');
  };

  // ✅ STEP 6: SAVE DRAFT -> REAL API
  const handleSaveDraft = async () => {
    if (!selectedCustomer) return alert("Please select a customer.");

    try {
      const payload = {
        piNumber,
        piDate,
        validUntil,
        customerId: selectedCustomer.id,
        customerCode: selectedCustomer.code,
        customerName: selectedCustomer.name,
        customerTrn: selectedCustomer.trn,
        quotationNo: linkedQuote || null,
        salesOrderNo: linkedSO || null,
        paymentMethod,
        advancePaid: Number(advanceAmount),
        paymentNotes,
        notesToCustomer,
        shippingAddress,
        items: items.map(i => ({
          itemCode: i.code,
          barcode: i.barcode || '',
          description: i.desc,
          unit: i.unit,
          quantity: Number(i.qty),
          price: Number(i.price),
          taxPercent: Number(i.tax),
          foc: Number(i.foc) || 0
        }))
      };

      // If piId exists, ideally update, otherwise create. 
      // Using createProforma as per instructions for this step.
      await createProforma(payload);
      alert("Draft saved successfully");

      // Refresh list
      const refreshed = await getAllProformas();
      setProformaList(refreshed);
      setActiveTab("list");
    } catch (err) {
      console.error(err);
      alert("Failed to save draft");
    }
  };

  // ✅ STEP 7: ISSUE PI -> REAL API
  const handleIssuePI = async () => {
    if (!selectedCustomer) {
      return alert("Select customer first");
    }

    if (balanceDue > 0) {
      return alert("Cannot Issue PI. Full payment is required.");
    }

    // Need an ID to issue
    if (!piId) {
      return alert("Please save the Draft first before issuing.");
    }

    try {
      await issueProforma(piId);
      alert(`Proforma ${piNumber} issued successfully`);

      const refreshed = await getAllProformas();
      setProformaList(refreshed);
      setActiveTab("list");
    } catch (err) {
      console.error(err);
      alert("Failed to issue Proforma");
    }
  };

  const handleLogPayment = () => {
    if (Number(advanceAmount) <= 0) {
      return alert("Please enter a valid amount to pay.");
    }
    alert(`Payment of AED ${Number(advanceAmount).toFixed(2)} recorded (UI Only). Save/Issue to persist.`);
  };

  const handleNewRevision = () => {
    setVersion(prev => prev + 1);
    setStatus('DRAFT');
    setIsReadOnly(false);
    alert("New revision created. You can now edit and save as Rev 0" + (version + 1));
  };

  // --- Selection Handlers ---
  const handleSelectQuotation = (qtn) => {
    setLinkedQuote(qtn.qtnNo);
    setIsQuotationOpen(false);
    if (!selectedCustomer) {
      const matchedCust = customersList.find(c => c.name === qtn.customerName || c.code === qtn.customerCode);
      if (matchedCust) setSelectedCustomer(matchedCust);
    }
  };

  const handleSelectSalesOrder = (so) => {
    setLinkedSO(so.soNumber);
    setIsSalesOrderOpen(false);

    if (!selectedCustomer) {
      const matchedCust = customersList.find(c => c.code === so.customerCode);
      if (matchedCust) setSelectedCustomer(matchedCust);
    }

    if (so.items && so.items.length > 0) {
      const mappedItems = so.items.map(i => ({
        id: Date.now() + Math.random(),
        code: i.itemCode || '',
        desc: i.description || '',
        unit: i.unit || 'PCS',
        qty: i.quantity || 0,
        price: i.price || 0,
        tax: i.taxRate || 5,
        total: (i.quantity * i.price) + ((i.quantity * i.price) * (i.taxRate / 100))
      }));
      setItems(mappedItems);
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
                        <input type="text" value={piNumber} readOnly className="text-sm p-1.5 bg-slate-50 border border-slate-200/50 rounded text-slate-700" />
                      </div>
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-xs font-semibold text-slate-500 mb-1">PI Date <span className="text-red-500">*</span></label>
                        <input type="date" value={piDate} onChange={(e) => setPiDate(e.target.value)} className="text-sm p-1.5 border border-slate-300/50 rounded text-slate-700" />
                      </div>
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Valid Till <span className="text-red-500">*</span></label>
                        <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="text-sm p-1.5 border border-slate-300/50 rounded text-slate-700" />
                      </div>
                      <div className="flex flex-col relative col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Link Quotation (Opt)</label>
                        <div className="relative group">
                          <input
                            type="text"
                            value={linkedQuote}
                            onChange={(e) => setLinkedQuote(e.target.value)}
                            onClick={(e) => { e.stopPropagation(); setIsQuotationOpen(true); }}
                            placeholder="Select Quotation..."
                            className="w-full text-sm p-1.5 border border-slate-300/50 rounded text-slate-700 cursor-pointer pr-8"
                          />
                          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        {isQuotationOpen && (
                          <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 max-h-48 overflow-y-auto z-50">
                            {quotationsList.map(q => (
                              <div key={q.id} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer text-slate-700 border-b border-slate-50 last:border-0 flex justify-between" onClick={() => handleSelectQuotation(q)}>
                                <span className="font-bold">{q.qtnNo}</span>
                                <span className="text-slate-400 truncate ml-2">{q.customer}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col relative col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Link Sales Order (Opt)</label>
                        <div className="relative group">
                          <input
                            type="text"
                            value={linkedSO}
                            onChange={(e) => setLinkedSO(e.target.value)}
                            onClick={(e) => { e.stopPropagation(); setIsSalesOrderOpen(true); }}
                            placeholder="Select Sales Order..."
                            className="w-full text-sm p-1.5 border border-slate-300/50 rounded text-slate-700 cursor-pointer pr-8"
                          />
                          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        {isSalesOrderOpen && (
                          <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 max-h-48 overflow-y-auto z-50">
                            {salesOrdersList.map(so => (
                              <div key={so.id} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer text-slate-700 border-b border-slate-50 last:border-0 flex justify-between" onClick={() => handleSelectSalesOrder(so)}>
                                <span className="font-bold">{so.soNumber}</span>
                                <span className="text-slate-400 truncate ml-2">{so.customerName}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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
                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <FileText size={16} className="text-yellow-500" /> Proforma Items
                    </h3>
                    <button
                      onClick={() => setIsProductSelectorOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C742] text-slate-900 text-xs font-bold rounded shadow-sm hover:bg-[#E5B732] transition-colors"
                    >
                      <Plus size={14} /> Select from Catalog
                    </button>
                  </div>
                  <div className="p-0"> {/* Remove padding for full-width table */}

                    <div
                      className="overflow-x-auto"
                      style={items.length > 5 ? { maxHeight: '440px', overflowY: 'auto' } : {}}
                    >
                      <table className="w-full text-xs text-left min-w-[900px]">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/50 text-xs font-semibold">
                          <tr>
                            <th className="p-2 w-8 text-center text-slate-400">#</th>
                            <th className="p-2 min-w-[200px]">
                              <div className="flex items-center gap-2">
                                <ItemDescriptionHeader
                                  itemCount={items.length}
                                  expandedRowsCount={Object.keys(expandedRows).length}
                                  onToggleAll={toggleAllDescriptions}
                                />
                              </div>
                            </th>
                            <th className="p-2 w-16 text-center">Unit</th>
                            <th className="p-2 w-20 text-center">Qty</th>
                            <th className="p-2 w-20 text-center">Unit price</th>
                            <th className="p-2 w-14 text-center">Tax %</th>
                            <th className="p-2 w-24 text-center text-slate-800">Amount</th>
                            <th className="p-2 w-16 text-center text-slate-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50">
                          {items.length === 0 ? (
                            <tr>
                              <td colSpan="8" className="text-center py-12 text-slate-400">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                                    <ShoppingCart size={20} className="text-slate-400" />
                                  </div>
                                  <p className="text-sm">No items added. <button onClick={() => setIsProductSelectorOpen(true)} className="text-yellow-600 font-bold hover:underline">Browse Products</button></p>
                                </div>
                              </td>
                            </tr>
                          ) : items.map((item, index) => (
                            <React.Fragment key={item.id}>
                              <tr className={`group hover:bg-slate-50/50 transition-colors bg-white align-middle`}>
                                <td className="p-2 text-center text-slate-400 text-xs font-medium">{index + 1}</td>
                                <td className="p-2">
                                  <ItemDescriptionCell
                                    item={item}
                                    isExpanded={expandedRows[item.id]}
                                    onToggleExpand={toggleRowDescription}
                                    onItemChange={handleItemChange}
                                    onFocusCode={() => setFocusedItem(item)}
                                    onOpenProductSelection={() => setIsProductSelectorOpen(true)}
                                    onCheckStock={() => { setSelectedStockItem(item); setIsItemStockModalOpen(true); }}
                                    onOpenSettings={(item) => setSelectedAddonItem(item)}
                                    showSettings={true}
                                    showTaxDiscount={true}
                                    isReadOnly={isReadOnly}
                                    page="proforma_invoice"
                                  />
                                </td>
                                <td className="p-2 text-center align-middle">
                                  <div className="rounded-md border border-slate-200 bg-white inline-block px-1 py-1 min-w-[50px]">
                                    <select
                                      className="w-full bg-transparent outline-none text-center text-xs text-slate-700 appearance-none font-medium cursor-pointer"
                                      value={item.unit || 'PCS'}
                                      onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                    >
                                      {(item.availableUnits || ['PCS', 'SET', 'BOX', 'KG']).map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                  </div>
                                </td>
                                <td className="p-2 text-center align-middle">
                                  <div className="rounded-md border border-slate-200 bg-white inline-flex items-center px-2 py-1 mx-auto w-16">
                                    <input
                                      type="number"
                                      min="1"
                                      className="w-full bg-transparent text-center outline-none font-bold text-sm text-slate-800"
                                      value={item.qty === 0 ? '' : item.qty}
                                      onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                                      placeholder="0"
                                    />
                                  </div>
                                </td>
                                <td className="p-2 text-center align-middle w-20">
                                  <div className="rounded-md border border-slate-200 bg-white inline-flex items-center px-2 py-1 mx-auto w-20">
                                    <input
                                      type="number"
                                      className="w-full bg-transparent text-center outline-none font-semibold text-sm text-slate-700"
                                      value={item.price === 0 ? '' : item.price}
                                      onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                      placeholder="0.00"
                                    />
                                  </div>
                                </td>
                                <td className="p-2 text-center align-middle w-14">
                                  <div className="rounded-md border border-slate-200 bg-white inline-flex items-center px-1 py-1 mx-auto w-14">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      className="w-full bg-transparent text-center outline-none text-xs text-slate-700"
                                      value={item.tax === 0 ? '' : item.tax}
                                      onChange={(e) => handleItemChange(item.id, 'tax', e.target.value)}
                                      placeholder="5"
                                    />
                                  </div>
                                </td>
                                <td className="p-2 text-center align-middle w-24">
                                  <div className="font-bold text-slate-800 text-sm">{Number(item.total || 0).toFixed(2)}</div>
                                </td>
                                <td className="p-2 text-center align-middle w-16">
                                  <div className="flex items-center justify-center">
                                    <button onClick={() => handleDeleteItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expandedRows[item.id] && (
                                <tr className="bg-white">
                                  <td></td>
                                  <td colSpan={7} className="px-0 pb-4 pt-1">
                                    <div className="ml-[60px] mr-4 p-3 rounded-r-[10px] border-l-[3px] border-[#FFD700] bg-[#FFFDE7]/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                                      <div className="flex justify-between items-center mb-1.5">
                                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#B8860B] tracking-widest uppercase">
                                          <Menu size={10} strokeWidth={3} className="opacity-80" /> PRODUCT DESCRIPTION
                                        </div>
                                        <span className="text-[9px] text-yellow-700/50 font-medium">{(item.remarks || '').length} chars</span>
                                      </div>
                                      <textarea
                                        rows="1"
                                        className="w-full bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-yellow-700/30 resize-none font-medium leading-relaxed"
                                        value={item.remarks || ''}
                                        onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                        placeholder="Enter product description — auto-loaded from product master, fully editable..."
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

                {/* 5. Collect Payment Card */}
                <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Wallet size={16} className="text-emerald-500" /> Collect Payment
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">Record advance payments for this Proforma</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Row 1 */}
                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Payment Method</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-200/50 rounded text-slate-700 outline-none focus:border-emerald-500 bg-white"
                        >
                          {['Cash', 'Bank Transfer', 'Cheque', 'Credit Card'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Reference / Txn ID</label>
                        <input
                          type="text"
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                          placeholder="Check #, Transfer ID, etc."
                          className="w-full text-xs p-1.5 border border-slate-200/50 rounded text-slate-700 outline-none focus:border-emerald-500 bg-white"
                        />
                      </div>

                      {/* Row 2 */}
                      <div className="flex flex-col relative w-full">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-semibold text-slate-500">Advance Amount</label>
                          <button
                            onClick={(e) => { e.preventDefault(); setAdvanceAmount(grandTotal.toFixed(2)); }}
                            className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Auto Fill Full
                          </button>
                        </div>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px] pointer-events-none">AED</span>
                          <input
                            type="number"
                            value={advanceAmount === 0 ? '' : advanceAmount}
                            onChange={(e) => setAdvanceAmount(e.target.value)}
                            className="w-full text-sm font-bold p-1.5 pl-10 border border-slate-200/50 rounded text-slate-800 outline-none focus:border-emerald-500 bg-white"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-slate-500 mb-1">Payment Notes</label>
                        <input
                          type="text"
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-200/50 rounded text-slate-700 outline-none focus:border-emerald-500 bg-white"
                          placeholder="Add any notes about this payment..."
                        />
                      </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={handleLogPayment}
                        className="px-6 py-2 bg-emerald-500 text-white rounded font-bold text-sm shadow-sm hover:bg-emerald-600 active:scale-95 transition-all flex items-center gap-2"
                      >
                        <CreditCard size={18} /> Record Payment
                      </button>
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
                        <span>Sub Total</span>
                        <span className="font-medium">{subTotal.toFixed(2)} AED</span>
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
                        <span className="font-medium">-{billDiscountAmount.toFixed(2)} AED</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Tax Total (5%)</span>
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
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-yellow-600" /> Item Add-Ons & Details
                </h2>
                <button onClick={() => setSelectedAddonItem(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-4">Configure discounts, taxes, FOC items, and view detailed calculations</p>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-4">
                  <div className="font-bold text-slate-800 text-sm mb-1">{selectedAddonItem.desc || selectedAddonItem.name || 'Unknown Item'}</div>
                  <div className="text-xs text-slate-500">Code: {selectedAddonItem.code}</div>
                  <div className="text-xs text-slate-500">Qty: {selectedAddonItem.qty} {selectedAddonItem.unit}</div>
                </div>

                <div className="space-y-4">
                  {/* Discount */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700">Discount</label>
                      <div className="flex bg-slate-100 rounded p-0.5">
                        <button className="px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-400 text-slate-900">%</button>
                      </div>
                    </div>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors"
                      value={selectedAddonItem.disc || ''}
                      onChange={(e) => handleModalItemChange('disc', e.target.value)}
                      placeholder="0"
                    />
                    <div className="text-[10px] text-slate-500 mt-1">Discount %: {(selectedAddonItem.disc || 0).toFixed(2)}%</div>
                  </div>

                  {/* Free of Charge (FOC) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 text-emerald-600">Free of Charge (FOC)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">FOC Qty</label>
                        <input
                          type="number"
                          className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors"
                          value={selectedAddonItem.foc || ''}
                          onChange={(e) => handleModalItemChange('foc', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">FOC Unit</label>
                        <select
                          className="w-full p-2 border border-slate-200 rounded text-sm appearance-none outline-none focus:border-yellow-400 bg-white"
                          value={selectedAddonItem.focUnit || 'PCS'}
                          onChange={(e) => handleModalItemChange('focUnit', e.target.value)}
                        >
                          {(selectedAddonItem.availableUnits || ['PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Tax */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tax % (VAT)</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors"
                      value={selectedAddonItem.tax || ''}
                      onChange={(e) => handleModalItemChange('tax', e.target.value)}
                      placeholder="5"
                    />
                    <div className="text-[10px] text-slate-500 mt-1">Tax Amount: AED {(selectedAddonItem.taxAmt || 0).toFixed(2)}</div>
                  </div>

                  {/* Calculation Breakdown */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm mt-4">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Calculation Breakdown</h4>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Base Amount</span>
                        <span>AED {((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)).toFixed(2)}</span>
                      </div>
                      {(selectedAddonItem.disc > 0) && (
                        <div className="flex justify-between text-red-500">
                          <span>Discount ({selectedAddonItem.disc}%)</span>
                          <span>- AED {(((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (selectedAddonItem.disc / 100)).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>After Discount (Gross)</span>
                        <span>AED {(((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600">
                        <span>Tax ({(selectedAddonItem.tax || 0)}%)</span>
                        <span>+ AED {(selectedAddonItem.taxAmt || 0).toFixed(2)}</span>
                      </div>
                      <div className="h-px bg-slate-200 my-2 w-full"></div>
                      <div className="flex justify-between font-bold text-yellow-600 text-sm">
                        <span>Net Amount</span>
                        <span>AED {(selectedAddonItem.total || 0).toFixed(2)}</span>
                      </div>

                      {/* Internal Margin */}
                      <div className="h-px bg-slate-100 my-2 w-full"></div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Cost Price</span>
                        <span>AED {((selectedAddonItem.cost || 0) * (selectedAddonItem.qty || 0)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Gross Profit %</span>
                        <span className={(((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100) > 0 ? ((((((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100)) - ((selectedAddonItem.cost || 0) * (selectedAddonItem.qty || 0))) / (((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100))) * 100) : 0) < 10 ? 'text-red-400' : 'text-emerald-500'}>
                          {((((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100)) > 0 ? ((((((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100)) - ((selectedAddonItem.cost || 0) * (selectedAddonItem.qty || 0))) / (((selectedAddonItem.qty || 0) * (selectedAddonItem.price || 0)) * (1 - (selectedAddonItem.disc || 0) / 100))) * 100).toFixed(1) : 0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
                <button
                  onClick={() => setSelectedAddonItem(null)}
                  className="px-5 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={saveModalItem}
                  className="px-5 py-2 bg-yellow-400 text-slate-900 border border-yellow-500 text-xs font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <Save size={14} /> Save Draft
                </button>
                {status !== 'ISSUED' && (
                  <button
                    onClick={handleIssuePI}
                    className="flex items-center gap-1.5 px-5 py-1.5 bg-yellow-400 text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 transition-all shadow-sm"
                  >
                    <CheckCircle2 size={14} /> Issue Proforma
                  </button>
                )}
              </div>
            </div>
          )
        }
      </main >
    </div >
  );
};


export default ProformaInvoice;

