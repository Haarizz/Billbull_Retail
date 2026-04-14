import React, { useState, useEffect, useMemo } from 'react';
import {
    Truck,
    Package,
    Search,
    Plus,
    MoreHorizontal,
    ChevronDown,
    User,
    MapPin,
    Save,
    Printer,
    AlertCircle,
    CheckCircle2,
    Clock,
    Box,
    ClipboardList,
    X,
    Lock,
    ArrowRightCircle,
    AlertTriangle,
    Mail,
    MessageCircle,
    Smartphone,
    Menu,
    ChevronUp,
    ArrowUp,
    ArrowDown,
    SlidersHorizontal,
    History,
    Eye,
    TrendingUp
} from 'lucide-react';

// ==========================================
// ASSET IMPORTS
// ==========================================
import billBullLogo from '../../assets/billBullLogo.png';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import { useCompany } from '../../context/CompanyContext';

// ==========================================
// API IMPORTS
// ==========================================
import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllSalesOrders } from '../../api/salesorderApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';
import { getWarehouses, getWarehouseStock, getWarehouseBins } from '../../api/warehouseApi';
// ✅ IMPORT STOCK API
import { getStockAvailability } from '../../api/stockAvailabilityApi'; // ✅ NEW API for LIVE STOCK
import { getItemPriceHistory } from '../../api/salesInvoiceApi'; // ✅ Price history API

// ✅ DELIVERY NOTE API IMPORTS
import {
    getDeliveryNotes,
    createDeliveryNote,
    updateDeliveryNote,
    advanceDeliveryNoteStatus,
    cancelDeliveryNote
} from "../../api/deliveryNoteApi";

// ✅ PRODUCT SELECTOR
import ProductSelector from '../../components/ProductSelector';

// ✅ CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';

// ✅ STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';

// ✅ SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// ✅ DYNAMIC UI COMPONENTS

import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';

const DeliveryNote = () => {
    const { company } = useCompany();
    const [activeTab, setActiveTab] = useState('list');
    const [currentDnId, setCurrentDnId] = useState(null); // Tracks editing vs creating

    // --- DATA LIST STATES ---
    const [deliveryNotesList, setDeliveryNotesList] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    const filteredDeliveryNotes = useMemo(() => {
        let data = [...deliveryNotesList];

        if (filterStatus !== 'All') {
            data = data.filter(dn => {
                if (filterStatus === 'Draft') return dn.status === 'DRAFT';
                if (filterStatus === 'Dispatched') return dn.status === 'DISPATCHED';
                if (filterStatus === 'Delivered') return dn.status === 'DELIVERED';
                if (filterStatus === 'Cancelled') return dn.status === 'CANCELLED';
                return true;
            });
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            data = data.filter(dn =>
                (dn.dnNo && dn.dnNo.toLowerCase().includes(lower)) ||
                (dn.customerName && dn.customerName.toLowerCase().includes(lower)) ||
                (dn.customerCode && dn.customerCode.toLowerCase().includes(lower)) ||
                (dn.soNo && dn.soNo.toLowerCase().includes(lower)) ||
                (dn.piNo && dn.piNo.toLowerCase().includes(lower))
            );
        }

        if (sortConfig.key) {
            data.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (sortConfig.key === 'lines' || sortConfig.key === 'qty' || sortConfig.key === 'boxes') {
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
    }, [deliveryNotesList, searchTerm, filterStatus, sortConfig]);

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const [customersList, setCustomersList] = useState([]);
    const [salesOrdersList, setSalesOrdersList] = useState([]);
    const [salesInvoicesList, setSalesInvoicesList] = useState([]);
    const [warehousesList, setWarehousesList] = useState([]);
    const [binsList, setBinsList] = useState([]);

    // ✅ NEW STATE: Warehouse Stock Cache (Map: ProductCode -> Qty)
    const [warehouseStockMap, setWarehouseStockMap] = useState({});

    // ✅ LIVE STOCK CACHE FOR ITEM AVAILABILITY PANEL
    const [liveStockMap, setLiveStockMap] = useState({});

    // --- FORM STATES ---
    const [dnNumber, setDnNumber] = useState('');
    const [dnDate, setDnDate] = useState(new Date().toISOString().split('T')[0]);
    const [warehouse, setWarehouse] = useState('');
    const [status, setStatus] = useState('Draft');
    const [autoGenerated, setAutoGenerated] = useState(false);
    const [sourceDocumentType, setSourceDocumentType] = useState('');
    const [sourceDocumentId, setSourceDocumentId] = useState('');

    // Linking
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isCustomerOpen, setIsCustomerOpen] = useState(false);
    const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);

    const [sourceType, setSourceType] = useState('SO'); // 'SO' | 'SI'
    const [linkedSO, setLinkedSO] = useState('');
    const [isSOOpen, setIsSOOpen] = useState(false);
    const [linkedPI, setLinkedPI] = useState('');
    const [linkedSI, setLinkedSI] = useState('');
    const [isSIOpen, setIsSIOpen] = useState(false);

    // Logistics
    const [driverName, setDriverName] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [trackingNo, setTrackingNo] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');

    // Items
    const [items, setItems] = useState([]);
    const [focusedItem, setFocusedItem] = useState(null);

    // --- ITEM INTELLIGENCE SIDEBAR ---
    const [focusedItemCode, setFocusedItemCode] = useState(null);
    const [focusedItemStock, setFocusedItemStock] = useState(null);
    const [focusedItemPriceHistory, setFocusedItemPriceHistory] = useState([]);
    const [isContextLoading, setIsContextLoading] = useState(false);

    // ✅ GLOBAL SHORTCUTS
    useShortcuts({
        'ctrl+p': (e) => {
            if (activeTab === 'create') setIsProductSelectorOpen(prev => !prev);
        },
        'ctrl+s': (e) => {
            if (activeTab === 'create') handleSave(false);
        },
        'alt+c': (e) => {
            if (activeTab === 'create') setIsCustomerSearchOpen(prev => !prev);
        }
    });

    const fetchItemContext = async (itemCode) => {
        if (!itemCode) return; // Allow re-clicking same item
        setIsContextLoading(true);
        setFocusedItemCode(itemCode);
        try {
            const [stockData, priceData] = await Promise.all([
                getStockAvailability(itemCode),
                getItemPriceHistory(itemCode)
            ]);
            setFocusedItemStock(stockData);
            setFocusedItemPriceHistory(priceData || []);
        } catch (err) {
            console.error('Failed to fetch item context', err);
        } finally {
            setIsContextLoading(false);
        }
    };

    // ✅ PRODUCT SELECTOR STATE
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

    // --- SIDEBAR COMPONENTS ---
    const StockSidebarPanel = ({ stock, isLoading, itemCode }) => {
        const locations = stock?.locations || [];
        const totalAvailable = locations.reduce((sum, loc) => sum + (loc.available || 0), 0);
        const totalReserved = locations.reduce((sum, loc) => sum + (loc.reserved || 0), 0);
        if (!itemCode) return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-700 font-bold text-sm">
                    <Package size={18} className="text-[#F5C742]" />
                    Stock &amp; Reservations
                </div>
                <div className="text-center py-4 text-slate-400 text-[11px] italic">Select an item to view stock availability</div>
            </div>
        );
        return (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all duration-300">
                <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                        <Package size={14} className="text-[#F5C742]" />
                        Stock &amp; Reservations
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
                                <span className="text-slate-500 group-hover:text-slate-700 transition-colors truncate max-w-[120px]" title={loc.name}>{loc.name}</span>
                                <div className="flex items-center gap-2">
                                    {loc.reserved > 0 && <span className="text-[9px] text-orange-400 font-medium">(Res: {loc.reserved})</span>}
                                    <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{loc.available}</span>
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
                    <TrendingUp size={18} className="text-[#F5C742]" />
                    Item Price History
                </div>
                <div className="text-center py-4 text-slate-400 text-[11px] italic">Focus an item to see last sales rates</div>
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
                                            <span className="text-slate-300">#</span>{h.invoiceNo} <span className="text-slate-200">|</span> {h.date}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-black text-slate-700">
                                        <div className="text-[9px] text-slate-300 font-bold leading-none mb-0.5 uppercase tracking-tighter">AED</div>
                                        {Number(h.rate).toFixed(2)}
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="2" className="px-4 py-8 text-center text-slate-400 italic font-medium">No previous sales records</td></tr>
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

    // --- MODAL STATE ---
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState('');
    const [receivedBy, setReceivedBy] = useState('');

    // Stock Check Modal
    const [selectedStockItem, setSelectedStockItem] = useState(null);
    const [isItemStockModalOpen, setIsItemStockModalOpen] = useState(false);

    // Add state for expandable rows
    const [expandedRows, setExpandedRows] = useState({});
    const [selectedAddonItem, setSelectedAddonItem] = useState(null);

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

    const handleModalItemChange = (field, value) => {
        if (isLockedForEdit) return;
        setSelectedAddonItem(prev => ({
            ...prev,
            [field]: field === 'focUnit' ? value : (parseFloat(value) || 0)
        }));
    };

    const saveModalItem = () => {
        if (isLockedForEdit) return;
        setItems(items.map(i => i.id === selectedAddonItem.id ? { ...selectedAddonItem } : i));
        setSelectedAddonItem(null);
    };

    // Read-Only Logic
    const isViewOnly = status === 'DELIVERED' || status === 'CANCELLED';
    const isLockedForEdit = isViewOnly || autoGenerated;

    // Helper
    const capitalize = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';

    // ==========================================
    // 1. FETCH DATA
    // ==========================================

    const loadDeliveryNotes = async () => {
        try {
            const data = await getDeliveryNotes();

            const mapped = data.map(dn => ({
                id: dn.id,
                dnNo: dn.dnNumber,
                date: dn.dnDate,
                customerCode: dn.customerCode,
                customerName: dn.customerName,
                soNo: dn.salesOrderNo,
                piNo: dn.proformaNo || "-",
                siNo: dn.linkedSalesInvoiceNumber || '',
                warehouse: dn.warehouse,
                lines: dn.totalLines,
                qty: dn.totalQty,
                boxes: dn.totalBoxes,
                status: dn.status,
                autoGenerated: dn.autoGenerated,
                sourceDocumentType: dn.sourceDocumentType,
                sourceDocumentId: dn.sourceDocumentId,
                linkedSalesInvoiceNumber: dn.linkedSalesInvoiceNumber,
                type: dn.type,
                pod: dn.status === "DELIVERED" ? "Verified" : (dn.status === "CANCELLED" || dn.status === "DRAFT" ? "None" : "Pending"),
                receivedBy: dn.receivedBy,
                receivedDate: dn.receivedDate,
                driverName: dn.driverName,
                vehicleNo: dn.vehicleNo,
                trackingNo: dn.trackingNo,
                shippingAddress: dn.shippingAddress,
                items: dn.items?.map(i => ({
                    id: i.id,
                    code: i.itemCode,
                    image: i.image || '',
                    desc: i.description,
                    unit: i.unit,
                    orderedQty: i.orderedQty,
                    prevDelivered: i.prevDeliveredQty,
                    currentQty: i.currentQty,
                    boxes: i.boxes,
                    foc: i.foc || 0,
                    focUnit: i.focUnit || i.unit,
                    tax: i.tax || 0,
                    disc: i.disc || 0,
                    taxAmt: i.taxAmt || 0,
                    margin: i.margin || 0,
                    remarks: i.remarks || '',
                    binId: i.binId,
                    stock: 0
                }))
            }));

            setDeliveryNotesList(mapped);
        } catch (e) {
            console.error("Failed to load delivery notes", e);
        }
    };

    useEffect(() => {
        loadDeliveryNotes();
    }, []);

    useEffect(() => {
        const fetchMasterData = async () => {
            try {
                const [custData, soData, siData, whData] = await Promise.all([
                    getAllCustomers(),
                    getAllSalesOrders(),
                    getAllSalesInvoices(),
                    getWarehouses()
                ]);

                setCustomersList(Array.isArray(custData) ? custData : []);
                setSalesOrdersList(Array.isArray(soData) ? soData : []);
                setSalesInvoicesList(Array.isArray(siData) ? siData : []);

                const whs = Array.isArray(whData) ? whData : [];
                setWarehousesList(whs);
                if (whs.length > 0 && !warehouse) setWarehouse(whs[0].name);

            } catch (err) {
                console.error("Failed to load master data", err);
            }
        };
        fetchMasterData();
    }, []);

    // ✅ 5. FETCH STOCK WHEN WAREHOUSE CHANGES
    useEffect(() => {
        const loadStock = async () => {
            if (!warehouse) return;

            try {
                const wh = warehousesList.find(w => w.name === warehouse);
                if (!wh) return;

                const stockList = await getWarehouseStock(wh.id);

                // Convert to map: productCode → quantity
                const map = {};
                if (Array.isArray(stockList)) {
                    stockList.forEach(s => {
                        map[s.productCode] = s.available;
                    });
                }

                setWarehouseStockMap(map);
            } catch (err) {
                console.error("Failed to load warehouse stock", err);
            }
        };

        loadStock();
    }, [warehouse, warehousesList]);

    // ✅ FETCH BINS WHEN WAREHOUSE CHANGES
    useEffect(() => {
        const loadBins = async () => {
            if (!warehouse) return;
            try {
                const wh = warehousesList.find(w => w.name === warehouse);
                if (!wh) return;
                const bins = await getWarehouseBins(wh.id);
                setBinsList(Array.isArray(bins) ? bins : []);
            } catch (err) {
                console.error("Failed to load bins", err);
            }
        };
        loadBins();
    }, [warehouse, warehousesList]);

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
                    .catch(err => console.error("Failed to fetch live stock for Delivery Note", err));
            }
        }
    }, [focusedItem]); // INTENTIONAL: NOT including liveStockMap to avoid loops


    // --- HANDLERS ---

    const handleCreateNew = () => {
        setCurrentDnId(null);
        setDnNumber(`DN-${Date.now()}`);
        setStatus('Draft');
        setAutoGenerated(false);
        setSourceDocumentType('');
        setSourceDocumentId('');
        setDnDate(new Date().toISOString().split('T')[0]);

        setSelectedCustomer(null);
        setSourceType('SO');
        setLinkedSO('');
        setLinkedPI('');
        setLinkedSI('');
        setItems([]);
        setDriverName('');
        setVehicleNo('');
        setTrackingNo('');
        setShippingAddress('');

        setActiveTab('create');
    };

    const handleRowClick = (dn) => {
        setCurrentDnId(dn.id);

        setDnNumber(dn.dnNo);
        setDnDate(dn.date);
        setStatus(dn.status);
        setAutoGenerated(dn.autoGenerated || false);
        setSourceDocumentType(dn.sourceDocumentType || '');
        setSourceDocumentId(dn.sourceDocumentId || '');
        setWarehouse(dn.warehouse);
        setDriverName(dn.driverName || '');
        setVehicleNo(dn.vehicleNo || '');
        setTrackingNo(dn.trackingNo || '');
        setShippingAddress(dn.shippingAddress || '');
        setLinkedSO(dn.soNo || '');
        setLinkedPI(dn.piNo || '');
        setLinkedSI(dn.siNo || '');
        setSourceType(dn.siNo ? 'SI' : 'SO');

        const custObj = customersList.find(c => c.code === dn.customerCode) || { code: dn.customerCode, name: dn.customerName };
        setSelectedCustomer(custObj);

        // When loading existing items, we map stock from the new cache if available
        const existingItems = dn.items || [];
        setItems(existingItems.map(i => ({
            ...i,
            stock: warehouseStockMap[i.code] || 0
        })));

        setActiveTab('create');
    };

    const handleStatusAdvance = () => {
        let nextStatus = '';
        const sc = status.toUpperCase();
        if (sc === 'DRAFT') nextStatus = 'Dispatched';
        else if (sc === 'DISPATCHED') nextStatus = 'Delivered';
        else return;

        setPendingStatus(nextStatus);
        setIsStatusModalOpen(true);
    };

    const confirmStatusChange = async () => {
        try {
            let targetId = currentDnId;

            // If it's a new unsaved DN, save it first
            if (!targetId) {
                const savedDn = await handleSave(false);
                if (!savedDn) return; // Save failed or was blocked
                targetId = savedDn.id;
            }

            if (targetId) {
                await advanceDeliveryNoteStatus(targetId, receivedBy);
                setIsStatusModalOpen(false);
                setReceivedBy(''); // Reset after success
                loadDeliveryNotes();
                setActiveTab("list");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to change status");
        }
    };

    const handleCancel = async () => {
        if (!currentDnId) return;
        if (!window.confirm("Are you sure you want to CANCEL this Delivery Note? This will release reserved stock.")) return;

        try {
            await cancelDeliveryNote(currentDnId);
            setIsStatusModalOpen(false);
            loadDeliveryNotes();
            setActiveTab("list");
            alert("Delivery Note cancelled successfully");
        } catch (e) {
            console.error(e);
            alert("Failed to cancel Delivery Note");
        }
    };

    const handleSelectCustomer = (cust) => {
        if (isLockedForEdit) return;
        setSelectedCustomer(cust);
        setIsCustomerOpen(false);
        setShippingAddress(cust.shippingAddress || cust.billingAddress || cust.address || '');
        setLinkedSO('');
        setLinkedPI('');
        setLinkedSI('');
        setItems([]);
    };

    const handleSelectSO = (so) => {
        if (isLockedForEdit) return;
        setLinkedSO(so.soNumber);
        setLinkedPI(so.linkedProforma || '');
        setIsSOOpen(false);

        if (so.shippingAddress) {
            setShippingAddress(so.shippingAddress);
        }

        if (so.items && so.items.length > 0) {
            const mappedItems = so.items.map(i => ({
                id: Date.now() + Math.random(),
                code: i.itemCode || i.code,
                image: i.image || '',
                desc: i.description || i.desc,
                unit: i.unit,
                orderedQty: Number(i.quantity),
                prevDelivered: Number(i.deliveredQty || 0),
                currentQty: Number(i.quantity) - Number(i.deliveredQty || 0),
                boxes: Math.ceil((Number(i.quantity) - Number(i.deliveredQty || 0)) / 10),
                foc: Number(i.foc) || 0,
                focUnit: i.focUnit || i.unit,
                tax: Number(i.tax) || 0,
                disc: Number(i.discountPercent || i.disc) || 0,
                taxAmt: Number(i.taxAmount || i.taxAmt) || 0,
                margin: Number(i.margin) || 0,
                remarks: i.remarks || '',
                // ✅ 6. INJECT REAL STOCK FROM MAP
                stock: warehouseStockMap[i.itemCode || i.code] || 0
            }));
            setItems(mappedItems);
        }
    };

    const handleSelectSI = (si) => {
        if (isLockedForEdit) return;
        setLinkedSI(si.invoiceNumber || si.invoiceNo || si.id);
        setIsSIOpen(false);

        if (si.shippingAddress) setShippingAddress(si.shippingAddress);

        const siItems = si.items || si.invoiceItems || [];
        if (siItems.length > 0) {
            const mappedItems = siItems.map(i => ({
                id: Date.now() + Math.random(),
                code: i.itemCode || i.code,
                image: i.image || '',
                desc: i.description || i.desc || i.name,
                unit: i.unit || i.uom || 'PCS',
                orderedQty: Number(i.quantity || i.qty || 0),
                prevDelivered: 0,
                currentQty: Number(i.quantity || i.qty || 0),
                boxes: Math.ceil(Number(i.quantity || i.qty || 1) / 10),
                foc: Number(i.foc) || 0,
                focUnit: i.focUnit || i.unit || 'PCS',
                tax: Number(i.tax || i.taxPercent) || 0,
                disc: Number(i.discount || i.disc || i.discountPercent) || 0,
                taxAmt: Number(i.taxAmount || i.taxAmt) || 0,
                margin: 0,
                remarks: i.remarks || '',
                stock: warehouseStockMap[i.itemCode || i.code] || 0
            }));
            setItems(mappedItems);
        }
    };

    // ✅ 11. PRODUCT SELECTOR HANDLER
    const handleAddSingleProduct = (product) => {
        const newItem = {
            id: Date.now() + Math.random(),
            code: product.code || product.itemCode || '',
            barcode: product.barcode || '',
            image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
            desc: product.description || product.name,
            unit: product.unitName || product.unit || 'PCS',
            orderedQty: 1,
            prevDelivered: 0,
            currentQty: 1,
            boxes: 1,
            foc: 0,
            focUnit: product.unitName || product.unit || 'PCS',
            tax: Number(product.taxPercent) || 5,
            disc: 0,
            taxAmt: 0,
            margin: 0,
            remarks: product.description || '',
            stock: warehouseStockMap[product.code] || 0
        };

        setItems(prev => [...prev, newItem]);
        setIsProductSelectorOpen(false); // ✅ Close modal after adding
    };

    // ✅ 8. HARD BLOCK INVALID QTY
    const handleItemChange = (id, field, value) => {
        if (isLockedForEdit) return;
        setItems(items.map(item => {
            if (item.id === id) {

                if (field === 'currentQty') {
                    const qty = Number(value);
                    const available = warehouseStockMap[item.code] || 0;

                    if (qty > available) {
                        alert(`Insufficient stock for ${item.code}. Available: ${available}`);
                        return item; // ⛔ Block change
                    }

                    // Also auto-update boxes logic purely for UI convenience
                    const boxes = Math.ceil(qty / 10);
                    return { ...item, currentQty: qty, boxes: boxes };
                }

                const val = field === 'desc' ? value : Number(value);
                return { ...item, [field]: val };
            }
            return item;
        }));
    };

    // ✅ 9. BLOCK SAVE IF INVALID
    const handleSave = async (shouldRedirect = true) => {
        if (isLockedForEdit) return null;

        if (!selectedCustomer) {
            alert("Please select a customer.");
            return null;
        }

        if (items.length === 0) {
            alert(sourceType === 'SI' ? "Please link a Sales Invoice to fetch items." : "Please link a Sales Order to fetch items.");
            return null;
        }

        // ✅ FIX: define selectedWh
        const selectedWh = warehousesList.find(w => w.name === warehouse);
        if (!selectedWh) {
            alert("Invalid warehouse selected");
            return null;
        }

        // Stock validation
        for (const i of items) {
            const available = warehouseStockMap[i.code] || 0;
            if (i.currentQty > available) {
                alert(`Insufficient stock for ${i.code}. Available: ${available}`);
                return null;
            }
        }

        const payload = {
            dnNumber,
            dnDate,
            customerCode: selectedCustomer.code,
            customerName: selectedCustomer.name,
            salesOrderNo: sourceType === 'SO' ? linkedSO : '',
            proformaNo: linkedPI,
            linkedSalesInvoiceNumber: sourceType === 'SI' ? linkedSI : '',

            warehouseId: selectedWh.id, // ✅ NOW VALID

            driverName,
            vehicleNo,
            trackingNo,
            shippingAddress,
            items: items.map(i => ({
                itemCode: i.code,
                image: i.image,
                description: i.desc,
                unit: i.unit,
                orderedQty: i.orderedQty,
                prevDeliveredQty: i.prevDelivered,
                currentQty: i.currentQty,
                boxes: i.boxes,
                foc: Number(i.foc) || 0,
                binId: i.binId ? Number(i.binId) : null
            }))
        };

        try {
            let result;
            if (currentDnId) {
                result = await updateDeliveryNote(currentDnId, payload);
            } else {
                result = await createDeliveryNote(payload);
            }

            alert("Delivery Note saved successfully");

            if (shouldRedirect) {
                setActiveTab("list");
                setCurrentDnId(null);
            } else {
                // Update ID if it was a new creation so subsequent calls work
                if (result && result.id) {
                    setCurrentDnId(result.id);
                }
            }

            loadDeliveryNotes();
            return result;
        } catch (e) {
            console.error(e);
            alert("Failed to save Delivery Note");
            return null;
        }
    };


    const calculateStats = () => {
        const totalQty = items.reduce((acc, i) => acc + (Number(i.currentQty) || 0), 0);
        const totalBoxes = items.reduce((acc, i) => acc + (Number(i.boxes) || 0), 0);
        return { totalQty, totalBoxes };
    };

    const { totalQty, totalBoxes } = calculateStats();

    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = async () => {
        if (items.length === 0) {
            alert("Nothing to print. Add items first.");
            return;
        }

        setIsPrinting(true);
        try {
            const templates = await getTemplatesByCategory('Delivery Note (DO/DN)');



            // ✅ Select default or fallback to the first available template
            const defaultTemplate = templates.find(t => t.isDefault) || templates[0];

            if (defaultTemplate) {
                const fullCustomer = customersList.find(c => c.code === selectedCustomer?.code);

                const printData = {
                    title: 'DELIVERY NOTE',
                    docNo: dnNumber,
                    date: dnDate,
                    customer: {
                        name: selectedCustomer?.name || '',
                        address: shippingAddress || fullCustomer?.address || '',
                        trn: selectedCustomer?.trn || fullCustomer?.trn
                    },
                    items: items.map(i => ({
                        code: i.code,
                        name: i.name || '',
                        desc: (i.desc || '') + (i.boxes ? ` (${i.boxes} Boxes)` : ''),
                        sku: i.sku || '',
                        localName: i.localName || '',
                        unit: i.unit,
                        qty: i.currentQty,
                        price: 0,
                        disc: 0,
                        tax: 0,
                        taxAmt: 0,
                        total: 0
                    })),
                    totals: {},
                    meta: {
                        status: status,
                        reference: `SO: ${linkedSO || '-'} | PI: ${linkedPI || '-'}`,
                        notes: `Warehouse: ${warehouse} | Driver: ${driverName || '-'} | Vehicle: ${vehicleNo || '-'} | Tracking: ${trackingNo || '-'}`
                    }
                };

                const html = generatePrintHtml(defaultTemplate, printData, { companyProfile: company, billBullLogo });
                printHtml(html);
            } else {
                console.warn("No default print template found. Using browser print.");
                window.print();
            }
        } catch (error) {
            console.error("Print error:", error);
            window.print();
        } finally {
            setIsPrinting(false);
        }
    };

    const renderStatusBadge = (s) => {
        const styles = {
            'Draft': 'bg-slate-100 text-slate-600 border-slate-200',
            'Dispatched': 'bg-indigo-50 text-indigo-600 border-indigo-200',
            'Delivered': 'bg-emerald-50 text-emerald-600 border-emerald-200',
            'Cancelled': 'bg-red-50 text-red-600 border-red-200',
        };
        return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[s] || styles['Draft']}`}>
                {s}
            </span>
        );
    };

    const renderPodBadge = (pod) => {
        if (pod === 'Pending') return <span className="text-orange-500 text-xs font-medium flex items-center gap-1"><Clock size={12} /> Pending</span>;
        if (pod === 'Verified') return <span className="text-emerald-600 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Verified</span>;
        return <span className="text-slate-400 text-xs">-</span>;
    };

    const MobileCard = ({ dn }) => (
        <div
            onClick={() => handleRowClick(dn)}
            className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-3 active:scale-[0.98] transition-all"
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        {dn.dnNo}
                        {dn.autoGenerated && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">Auto-Gen</span>
                        )}
                    </h4>
                    <p className="text-xs text-slate-500">{dn.date}</p>
                </div>
                {renderStatusBadge(dn.status)}
            </div>

            <div className="flex items-center gap-2 mb-3">
                <User size={14} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700 truncate">{dn.customerName}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-3 border-t border-slate-100">
                <div className="text-center p-2 bg-slate-50 rounded">
                    <div className="text-[10px] text-slate-500 uppercase">Lines</div>
                    <div className="font-bold text-slate-700">{dn.lines}</div>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded">
                    <div className="text-[10px] text-slate-500 uppercase">Qty</div>
                    <div className="font-bold text-blue-600">{dn.qty}</div>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded">
                    <div className="text-[10px] text-slate-500 uppercase">Boxes</div>
                    <div className="font-bold text-slate-700">{dn.boxes}</div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative" onClick={() => { setIsCustomerOpen(false); setIsSOOpen(false); setIsSIOpen(false); }}>

            {/* ✅ PRODUCT SELECTOR MODAL */}
            <ProductSelector
                isOpen={isProductSelectorOpen}
                onClose={() => setIsProductSelectorOpen(false)}
                onSelect={handleAddSingleProduct}
                title="Select Items from Products / Services"
                actionLabel="Add to Delivery Note"
            />

            {/* ✅ STOCK AVAILABILITY MODAL */}
            <StockAvailabilityModal
                isOpen={isItemStockModalOpen}
                onClose={() => setIsItemStockModalOpen(false)}
                selectedStockItem={selectedStockItem}
            />

            {/* ✅ ITEM ADD-ONS & DETAILS MODAL */}
            {selectedAddonItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[95%] animate-in zoom-in-95 duration-200 overflow-hidden font-sans">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Item Add-Ons & Details</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{selectedAddonItem.code}</p>
                            </div>
                            <button onClick={() => setSelectedAddonItem(null)} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5">
                            {/* FOC Configuration */}
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4">
                                <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <Plus size={12} strokeWidth={3} /> Free of Charge (FOC)
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">FOC Quantity</label>
                                        <input
                                            type="number"
                                            className="w-full bg-white border border-emerald-200 rounded px-2 py-1.5 text-xs font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                            value={selectedAddonItem.foc || 0}
                                            onChange={(e) => handleModalItemChange('foc', e.target.value)}
                                            disabled={isLockedForEdit}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">FOC Unit</label>
                                        <input
                                            type="text"
                                            className="w-full bg-white border border-emerald-200 rounded px-2 py-1.5 text-xs font-bold text-emerald-700 focus:outline-none"
                                            value={selectedAddonItem.focUnit || selectedAddonItem.unit}
                                            onChange={(e) => handleModalItemChange('focUnit', e.target.value)}
                                            disabled={isLockedForEdit}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Additional Metadata */}
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Item Remarks / Details</label>
                                    <textarea
                                        rows="3"
                                        className="w-full bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100 transition-all placeholder:text-slate-300"
                                        placeholder="Add special instructions, batch info, or serial numbers..."
                                        value={selectedAddonItem.remarks || ''}
                                        onChange={(e) => handleModalItemChange('remarks', e.target.value)}
                                        disabled={isLockedForEdit}
                                    />
                                </div>

                                {/* Financial Context (Read-Only in DN) */}
                                <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="text-center">
                                        <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Tax</div>
                                        <div className="text-[11px] font-black text-slate-700">{selectedAddonItem.tax}%</div>
                                    </div>
                                    <div className="text-center border-l border-slate-200">
                                        <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Discount</div>
                                        <div className="text-[11px] font-black text-slate-700">{selectedAddonItem.disc}%</div>
                                    </div>
                                    <div className="text-center border-l border-slate-200">
                                        <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Margin</div>
                                        <div className="text-[11px] font-black text-emerald-600">{selectedAddonItem.margin || 0}%</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedAddonItem(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-700"
                            >
                                Cancel
                            </button>
                            {!isLockedForEdit && (
                                <button
                                    onClick={saveModalItem}
                                    className="px-6 py-2 bg-yellow-400 text-slate-900 text-xs font-black uppercase tracking-widest rounded shadow-md hover:bg-yellow-500 active:scale-95 transition-all"
                                >
                                    Apply Changes
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ================= MODAL ================= */}
            {isStatusModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
                    <div className="bg-white rounded-lg shadow-2xl p-6 w-96 max-w-[90%] animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4 text-slate-800">
                            <div className={`p-2 rounded-full ${pendingStatus === 'Delivered' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                {pendingStatus === 'Delivered' ? <CheckCircle2 size={24} /> : <Truck size={24} />}
                            </div>
                            <h3 className="text-lg font-bold">Confirm Status Change</h3>
                        </div>

                        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                            Are you sure you want to mark this Delivery Note as <span className="font-bold text-slate-900">{pendingStatus}</span>?
                        </p>

                        {pendingStatus === 'Delivered' && (
                            <div className="mb-6 space-y-4">
                                <div className="bg-emerald-50 p-3 rounded border border-emerald-100 text-[11px] text-emerald-700 flex gap-2">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    <span>This will physically deduct stock and mark the document as Read-Only.</span>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Received By (Customer POD)</label>
                                    <input
                                        type="text"
                                        placeholder="Name of person who accepted delivery"
                                        value={receivedBy}
                                        onChange={(e) => setReceivedBy(e.target.value)}
                                        className="w-full text-sm p-2 border border-slate-300 rounded focus:border-indigo-400 outline-none"
                                    />
                                </div>
                            </div>
                        )}


                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsStatusModalOpen(false)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmStatusChange}
                                className={`px-4 py-2 text-xs font-bold text-white rounded shadow-sm transition-colors flex items-center gap-2 ${pendingStatus === 'Delivered' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                Yes, Mark as {pendingStatus}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= MAIN CONTENT (Hidden on Print) ================= */}
            <main className="flex-1 flex flex-col w-full print:hidden">
                {/* TOP DEMO BANNER */}

                <div className="p-4 md:p-6 space-y-6">

                    {/* HEADER */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Customers & Sales &gt; Delivery Note</div>
                            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <Truck className="text-[#F5C742]" size={28} />
                                Delivery Note & Picking
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">Manage dispatches between Sales Orders / Pro-forma Invoices and final Sales Invoices.</p>
                        </div>

                        {/* ✅ TOP ACTION BUTTONS */}
                        {activeTab === 'create' && (
                            <div className="flex gap-2 mt-2 md:mt-0">
                                {['Email', 'WhatsApp', 'SMS', 'Print'].map((label) => (
                                    <button
                                        key={label}
                                        onClick={label === 'Print' ? handlePrint : undefined}
                                        disabled={label === 'Print' && isPrinting}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-50"
                                    >
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
                    <div className="bg-white border border-slate-200 rounded-lg p-1 inline-flex shadow-sm w-full md:w-fit overflow-x-auto whitespace-nowrap">
                        {[
                            { id: 'list', label: 'Delivery Notes' },
                            { id: 'create', label: 'Create / Edit Delivery Note' },
                            { id: 'picking', label: 'Picking List' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex-1 md:flex-none ${activeTab === tab.id ? 'bg-[#F5C742] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ================= VIEW: LIST ================= */}
                    {activeTab === 'list' && (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                            {/* Toolbar */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 md:gap-0">
                                <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                                    <div className="relative w-full md:w-auto">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search by DN / customer / SO / PI"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9 pr-4 py-2 border border-slate-200 rounded-md text-xs w-full md:w-64 focus:outline-none focus:border-[#F5C742]"
                                        />
                                    </div>
                                    <div className="relative w-full md:w-auto">
                                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-3 pr-8 py-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:border-[#F5C742] appearance-none w-full md:w-auto cursor-pointer">
                                            <option value="All">All Statuses</option>
                                            <option value="Draft">Draft</option>
                                            <option value="Dispatched">Dispatched</option>
                                            <option value="Delivered">Delivered</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>
                                <button
                                    onClick={handleCreateNew}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm transition-colors w-full md:w-auto"
                                >
                                    <Plus size={14} /> New Delivery Note
                                </button>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto hidden md:block">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('dnNo')}>
                                                <div className="flex items-center gap-1">DN No {sortConfig.key === 'dnNo' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('date')}>
                                                <div className="flex items-center gap-1">Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('customerName')}>
                                                <div className="flex items-center gap-1">Customer {sortConfig.key === 'customerName' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('soNo')}>
                                                <div className="flex items-center gap-1">SO No {sortConfig.key === 'soNo' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('piNo')}>
                                                <div className="flex items-center gap-1">PI No {sortConfig.key === 'piNo' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('warehouse')}>
                                                <div className="flex items-center gap-1">Warehouse {sortConfig.key === 'warehouse' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('lines')}>
                                                <div className="flex justify-center items-center gap-1">Lines {sortConfig.key === 'lines' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('qty')}>
                                                <div className="flex justify-center items-center gap-1">Qty {sortConfig.key === 'qty' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('boxes')}>
                                                <div className="flex justify-center items-center gap-1">Boxes {sortConfig.key === 'boxes' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</div>
                                            </th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-center">POD</th>
                                            <th className="px-4 py-3 text-center">Type</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredDeliveryNotes.map((dn) => (
                                            <tr key={dn.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => handleRowClick(dn)}>
                                                <td className="px-4 py-3 font-medium text-slate-700">
                                                    <div className="flex items-center gap-2">
                                                        {dn.dnNo}
                                                        {dn.autoGenerated && (
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider" title="Auto-Generated by System">AUTO-GEN</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">{dn.date}</td>
                                                <td className="px-4 py-3 text-slate-600 font-medium">{dn.customerCode} - {dn.customerName}</td>
                                                <td className="px-4 py-3 text-slate-500">{dn.soNo}</td>
                                                <td className="px-4 py-3 text-slate-500">{dn.piNo}</td>
                                                <td className="px-4 py-3 text-slate-500">{dn.warehouse}</td>
                                                <td className="px-4 py-3 text-center">{dn.lines}</td>
                                                <td className="px-4 py-3 text-center font-bold">{dn.qty}</td>
                                                <td className="px-4 py-3 text-center">{dn.boxes}</td>
                                                <td className="px-4 py-3 text-center">{renderStatusBadge(dn.status)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {renderPodBadge(dn.pod)}
                                                    {dn.receivedBy && <div className="text-[10px] text-slate-400 mt-1">By: {dn.receivedBy}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {dn.type === 'Picking' ? (
                                                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">Picking</span>
                                                    ) : dn.type === 'Before Sale' ? (
                                                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded">Before Sale</span>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button className="text-slate-400 hover:text-slate-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredDeliveryNotes.length === 0 && (
                                            <tr>
                                                <td colSpan="12" className="text-center py-8 text-slate-400">No Delivery Notes found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* MOBILE CARD VIEW */}
                            <div className="md:hidden space-y-3">
                                {filteredDeliveryNotes.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 italic">No Delivery Notes found.</div>
                                ) : (
                                    filteredDeliveryNotes.map((dn) => (
                                        <MobileCard key={dn.id} dn={dn} />
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* ================= VIEW: CREATE / EDIT ================= */}
                    {activeTab === 'create' && (
                        <div className="space-y-6 flex-1 flex flex-col pb-24 animate-in fade-in duration-200">

                            {/* CUSTOMER SELECTOR MODAL */}
                            <CustomerSelector
                                isOpen={isCustomerSearchOpen}
                                onClose={() => setIsCustomerSearchOpen(false)}
                                onSelect={(cust) => handleSelectCustomer(cust)}
                                customers={customersList}
                                selectedCode={selectedCustomer?.code || ''}
                                onCustomerCreated={async () => {
                                    const data = await getAllCustomers();
                                    setCustomersList(Array.isArray(data) ? data : []);
                                }}
                            />

                            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 xl:gap-6 items-start">
                                {/* --- LEFT COLUMN: DETAILS --- */}
                                <div className="xl:col-span-1 space-y-4">

                                    {/* 1. Document Details Card */}
                                    <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <Truck size={16} className="text-yellow-600" /> Shipment Details
                                            </h3>
                                        </div>
                                        <div className="p-5">
                                            <div className="flex flex-col space-y-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">DN Number</label>
                                                    <input type="text" value={dnNumber} readOnly className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200/50 rounded text-slate-700 font-bold" />
                                                </div>

                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">Dispatch Date <span className="text-red-500">*</span></label>
                                                    <input disabled={isLockedForEdit} type="date" value={dnDate} onChange={e => setDnDate(e.target.value)} className="w-full text-xs p-1.5 border border-slate-300/50 rounded focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-400" />
                                                </div>


                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">From Warehouse</label>
                                                    <div className="relative">
                                                        <select
                                                            disabled={isLockedForEdit}
                                                            value={warehouse}
                                                            onChange={e => setWarehouse(e.target.value)}
                                                            className="w-full text-xs p-1.5 border border-slate-300/50 rounded focus:outline-none focus:border-yellow-400 bg-white appearance-none disabled:bg-slate-50 disabled:text-slate-400"
                                                        >
                                                            {warehousesList.map(wh => <option key={wh.id} value={wh.name}>{wh.name}</option>)}
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Customer & Reference */}
                                    <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative z-20">
                                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <User size={16} className="text-yellow-600" /> Customer Details
                                            </h3>
                                        </div>
                                        <div className="p-5">
                                            <div className="flex flex-col space-y-4">

                                                <div className="relative">
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                                                    <div
                                                        onClick={(e) => {
                                                            if (!isLockedForEdit) {
                                                                e.stopPropagation();
                                                                setIsCustomerSearchOpen(true);
                                                            }
                                                        }}
                                                        className={`w-full text-xs p-2 border border-slate-300/50 rounded flex items-center gap-2 ${isLockedForEdit ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'cursor-pointer hover:border-yellow-400 bg-white'} transition-colors`}
                                                    >
                                                        <Search size={14} className="text-slate-400 shrink-0" />
                                                        <span className="flex-1 truncate">{selectedCustomer ? `${selectedCustomer.code} - ${selectedCustomer.name}` : 'Search customer...'}</span>
                                                    </div>
                                                </div>


                                                {/* Source Type Toggle */}
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Document Type</label>
                                                    <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-bold">
                                                        <button
                                                            type="button"
                                                            disabled={isLockedForEdit}
                                                            onClick={() => { if (!isLockedForEdit) { setSourceType('SO'); setLinkedSI(''); setItems([]); } }}
                                                            className={`flex-1 py-1.5 transition-colors ${sourceType === 'SO' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-60`}
                                                        >
                                                            Sales Order
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isLockedForEdit}
                                                            onClick={() => { if (!isLockedForEdit) { setSourceType('SI'); setLinkedSO(''); setLinkedPI(''); setItems([]); } }}
                                                            className={`flex-1 py-1.5 border-l border-slate-200 transition-colors ${sourceType === 'SI' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-60`}
                                                        >
                                                            Sales Invoice
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Conditional Source Dropdown */}
                                                {sourceType === 'SO' ? (
                                                    <div className="relative">
                                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Sales Order</label>
                                                        <div
                                                            onClick={(e) => {
                                                                if (selectedCustomer && !isLockedForEdit) {
                                                                    e.stopPropagation();
                                                                    setIsSOOpen(!isSOOpen);
                                                                    setIsSIOpen(false);
                                                                }
                                                            }}
                                                            className={`w-full text-xs p-2 border border-slate-300/50 rounded flex justify-between items-center ${selectedCustomer && !isLockedForEdit ? 'bg-white cursor-pointer hover:border-yellow-400' : 'bg-slate-50 cursor-not-allowed text-slate-400'}`}
                                                        >
                                                            <span className="truncate">{linkedSO || (selectedCustomer ? 'Select Sales Order...' : 'Select Customer First')}</span>
                                                            <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                        </div>
                                                        {isSOOpen && !isLockedForEdit && (
                                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-30 mt-1 max-h-48 overflow-y-auto">
                                                                {salesOrdersList.filter(so => so.customerCode === selectedCustomer?.code).map(so => (
                                                                    <div key={so.id} onClick={() => handleSelectSO(so)} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                                                                        <span className="font-bold">{so.soNumber}</span> <span className="text-slate-400">({so.orderDate})</span>
                                                                    </div>
                                                                ))}
                                                                {salesOrdersList.filter(so => so.customerCode === selectedCustomer?.code).length === 0 && (
                                                                    <div className="px-3 py-2 text-xs text-slate-400">No Sales Orders found</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Sales Invoice</label>
                                                        <div
                                                            onClick={(e) => {
                                                                if (selectedCustomer && !isLockedForEdit) {
                                                                    e.stopPropagation();
                                                                    setIsSIOpen(!isSIOpen);
                                                                    setIsSOOpen(false);
                                                                }
                                                            }}
                                                            className={`w-full text-xs p-2 border border-slate-300/50 rounded flex justify-between items-center ${selectedCustomer && !isLockedForEdit ? 'bg-white cursor-pointer hover:border-yellow-400' : 'bg-slate-50 cursor-not-allowed text-slate-400'}`}
                                                        >
                                                            <span className="truncate">{linkedSI || (selectedCustomer ? 'Select Sales Invoice...' : 'Select Customer First')}</span>
                                                            <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                        </div>
                                                        {isSIOpen && !isLockedForEdit && (
                                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-30 mt-1 max-h-48 overflow-y-auto">
                                                                {salesInvoicesList.filter(si => si.customerCode === selectedCustomer?.code || si.customer?.code === selectedCustomer?.code).map(si => (
                                                                    <div key={si.id} onClick={() => handleSelectSI(si)} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                                                                        <span className="font-bold">{si.invoiceNumber || si.invoiceNo}</span> <span className="text-slate-400">({si.invoiceDate || si.date})</span>
                                                                    </div>
                                                                ))}
                                                                {salesInvoicesList.filter(si => si.customerCode === selectedCustomer?.code || si.customer?.code === selectedCustomer?.code).length === 0 && (
                                                                    <div className="px-3 py-2 text-xs text-slate-400">No Sales Invoices found</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Logistics Info */}
                                    <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <MapPin size={16} className="text-yellow-600" /> Logistics Info
                                            </h3>
                                        </div>
                                        <div className="p-5">
                                            <div className="flex flex-col space-y-3">

                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">Driver Name</label>
                                                    <input disabled={isLockedForEdit} type="text" value={driverName} onChange={e => setDriverName(e.target.value)} className="w-full text-xs p-1.5 border border-slate-300/50 rounded focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-400" />
                                                </div>


                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">Vehicle No.</label>
                                                    <input disabled={isLockedForEdit} type="text" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} className="w-full text-xs p-1.5 border border-slate-300/50 rounded focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-400" />
                                                </div>


                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">Tracking / Ref</label>
                                                    <input disabled={isLockedForEdit} type="text" value={trackingNo} onChange={e => setTrackingNo(e.target.value)} className="w-full text-xs p-1.5 border border-slate-300/50 rounded focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-400" />
                                                </div>

                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 mb-1">Shipping Address</label>
                                                    <textarea disabled={isLockedForEdit} rows="3" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} className="w-full text-xs p-1.5 border border-slate-300/50 rounded resize-none focus:outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-400"></textarea>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                {/* --- MIDDLE COLUMN: ITEMS --- */}
                                <div className="xl:col-span-2 space-y-4">
                                    <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <Package size={16} className="text-yellow-600" /> Items to Dispatch
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                {/* SELECT FROM CATALOG BUTTON */}
                                                {!isLockedForEdit && (
                                                    <button
                                                        onClick={() => setIsProductSelectorOpen(true)}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-bold rounded-lg hover:bg-yellow-500 shadow-sm transition-colors"
                                                    >
                                                        <Plus size={14} /> Select from Catalog
                                                    </button>
                                                )}
                                                {items.length === 0 && linkedSO && (
                                                    <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded">No items found</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="overflow-auto max-h-[320px]">
                                            <table className="w-full text-xs text-left min-w-[940px]">
                                                <thead className="sticky top-0 z-10 bg-white border-b border-slate-100/80 text-[11px] font-semibold text-slate-500">
                                                    <tr>
                                                        <th className="px-3 py-2 w-8 text-center text-slate-400">#</th>
                                                        <th className="px-3 py-2 min-w-[280px]">
                                                            <ItemDescriptionHeader
                                                                itemCount={items.length}
                                                                expandedRowsCount={Object.keys(expandedRows).length}
                                                                onToggleAll={toggleAllDescriptions}
                                                            />
                                                        </th>
                                                        <th className="px-3 py-2 w-16 text-center">Unit</th>
                                                        <th className="px-3 py-2 w-20 text-center">Qty ordered</th>
                                                        <th className="px-3 py-2 w-24 text-center text-slate-400">Prev. Del</th>
                                                        <th className="px-3 py-2 w-24 text-center bg-yellow-50/60 text-slate-600">Current Qty</th>
                                                        <th className="px-3 py-2 w-16 text-center">Boxes</th>
                                                        <th className="px-3 py-2 w-32 text-center">Bin</th>
                                                        <th className="px-3 py-2 w-10 text-center"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100/50">
                                                    {items.length > 0 ? items.map((item, index) => (
                                                        <React.Fragment key={item.id}>
                                                            <tr className={`group hover:bg-slate-50/50 transition-colors bg-white align-middle ${isViewOnly ? 'opacity-80' : ''}`}>
                                                                {/* Index */}
                                                                <td className="px-3 py-2 text-center text-slate-400 text-xs font-medium">{index + 1}</td>

                                                                {/* Item / Description */}
                                                                <td className="px-3 py-2">
                                                                    <ItemDescriptionCell
                                                                        item={{ ...item, availableQty: warehouseStockMap[item.code] || 0 }}
                                                                        isExpanded={expandedRows[item.id]}
                                                                        onToggleExpand={toggleRowDescription}
                                                                        onItemChange={handleItemChange}
                                                                        onFocusCode={() => {
                                                                            const code = item.code || item.itemCode;
                                                                            setFocusedItem({ ...item, stock: warehouseStockMap[item.code] || 0 });
                                                                            fetchItemContext(code);
                                                                        }}
                                                                        onOpenProductSelection={!isLockedForEdit ? () => setIsProductSelectorOpen(true) : undefined}
                                                                        onCheckStock={() => { setSelectedStockItem(item); setIsItemStockModalOpen(true); }}
                                                                        onOpenSettings={(item) => setSelectedAddonItem({ ...item })}
                                                                        showSettings={true}
                                                                        isReadOnly={isLockedForEdit}
                                                                        showTaxDiscount={true}
                                                                        page="deliveryNote"
                                                                    />
                                                                </td>

                                                                {/* Unit */}
                                                                <td className="px-3 py-2 text-center">
                                                                    <span className="text-slate-500 font-medium">{item.unit}</span>
                                                                </td>

                                                                {/* Qty Section */}
                                                                <td className="px-3 py-2 text-center">
                                                                    <span className="font-bold text-slate-700">{item.orderedQty}</span>
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <span className="text-slate-400">{item.prevDelivered}</span>
                                                                </td>
                                                                <td className={`px-3 py-2 text-center ${isLockedForEdit ? '' : 'bg-yellow-50/20'}`}>
                                                                    <input
                                                                        disabled={isLockedForEdit}
                                                                        type="number"
                                                                        className="w-full text-center bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 outline-none font-bold text-slate-800 disabled:opacity-70 transition-colors py-0.5"
                                                                        value={item.currentQty}
                                                                        onFocus={() => setFocusedItem({
                                                                            ...item,
                                                                            stock: warehouseStockMap[item.code] || 0
                                                                        })}
                                                                        onChange={(e) => handleItemChange(item.id, 'currentQty', e.target.value)}
                                                                    />
                                                                </td>

                                                                {/* Boxes */}
                                                                <td className="px-3 py-2 text-center">
                                                                    <input
                                                                        disabled={isLockedForEdit}
                                                                        type="number"
                                                                        className="w-full text-center bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400/50 outline-none font-semibold text-xs text-slate-700 disabled:opacity-70 transition-colors py-0.5"
                                                                        value={item.boxes || ''}
                                                                        onChange={(e) => handleItemChange(item.id, 'boxes', e.target.value)}
                                                                    />
                                                                </td>

                                                                {/* Bin Selection */}
                                                                <td className="px-3 py-2 text-center">
                                                                    <select
                                                                        disabled={isLockedForEdit}
                                                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-yellow-400 outline-none text-[11px] text-slate-700 py-1"
                                                                        value={item.binId || ''}
                                                                        onChange={(e) => handleItemChange(item.id, 'binId', e.target.value)}
                                                                    >
                                                                        <option value="">Select Bin</option>
                                                                        {binsList.map(bin => (
                                                                            <option key={bin.id} value={bin.id}>{bin.name} ({bin.code})</option>
                                                                        ))}
                                                                    </select>
                                                                </td>

                                                                {/* Actions */}
                                                                <td className="px-3 py-2 text-center">
                                                                    {!isLockedForEdit && (
                                                                        <button onClick={() => {
                                                                            const newItems = items.filter(i => i.id !== item.id);
                                                                            setItems(newItems);
                                                                        }} className="text-slate-300 hover:text-red-500 transition-colors">
                                                                            <X size={16} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>

                                                            {/* Expanded Description Row */}
                                                            {expandedRows[item.id] && (
                                                                <tr className="bg-white">
                                                                    <td className="px-3 py-2"></td>
                                                                    <td colSpan={8} className="px-0 pb-4 pt-1">
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
                                                                                disabled={isLockedForEdit}
                                                                                rows="1"
                                                                                className="w-full bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-yellow-700/30 resize-none font-medium leading-relaxed disabled:opacity-50"
                                                                                value={item.remarks || ''}
                                                                                onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                                                                placeholder="Enter product description..."
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
                                                    )) : (
                                                        <tr>
                                                            <td colSpan="9" className="p-8 text-center text-slate-400 italic">
                                                                Select a Sales Order to populate items
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                {/* --- RIGHT COLUMN: SUMMARY & STOCK --- */}
                                <div className="xl:col-span-1 space-y-4">

                                    {/* Delivery Summary */}
                                    <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm relative">
                                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <ClipboardList size={16} className="text-yellow-600" /> Delivery Summary
                                            </h3>
                                        </div>
                                        <div className="p-5">
                                            <div className="space-y-3 text-sm flex flex-col">
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Total Dispatch Qty</span>
                                                    <span className="font-medium text-slate-800">{totalQty}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Total Boxes</span>
                                                    <span className="font-medium text-slate-800">{totalBoxes}</span>
                                                </div>
                                                <div className="h-px bg-slate-200 my-2 w-full"></div>
                                                <div className="flex justify-between font-bold text-slate-800">
                                                    <span>Total Lines</span>
                                                    <span className="text-yellow-600">{items.length}</span>
                                                </div>
                                            </div>

                                            {autoGenerated && sourceDocumentType ? (
                                                <div className="mt-4 flex items-center gap-2 p-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                                                    <Box size={14} /> System-Linked Note
                                                </div>
                                            ) : (
                                                <div className="mt-4 flex items-center gap-2 p-2 bg-yellow-50 text-yellow-700 border border-yellow-100 rounded text-[10px] font-bold">
                                                    <AlertCircle size={14} /> Verify quantities before sync
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Item Intelligence Sidebar */}
                                    <StockSidebarPanel stock={focusedItemStock} isLoading={isContextLoading} itemCode={focusedItemCode} />
                                    <PriceHistorySidebarPanel history={focusedItemPriceHistory} isLoading={isContextLoading} itemCode={focusedItemCode} />

                                    {/* Source Summary & Link */}
                                    {autoGenerated && sourceDocumentType ? (
                                        <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm p-4 border-l-4 border-l-blue-500">
                                            <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                                                <Truck size={12} className="text-blue-500" /> Source Document
                                            </h3>
                                            <div className="space-y-1.5 text-xs">
                                                <div className="flex justify-between text-slate-500"><span>Type:</span> <span className="font-medium text-slate-700">{sourceDocumentType.replace('_', ' ')}</span></div>
                                                <div className="flex justify-between text-slate-500"><span>Ref ID:</span> <span className="font-bold text-slate-800">{sourceDocumentId}</span></div>
                                            </div>
                                        </div>
                                    ) : (linkedSO || linkedSI) && (
                                        <div className="bg-white rounded-lg border border-slate-200/50 shadow-sm p-4">
                                            <h3 className="text-xs font-bold text-slate-800 mb-2">Linked Document</h3>
                                            <div className="space-y-1.5 text-xs">
                                                {sourceType === 'SO' ? (
                                                    <>
                                                        <div className="flex justify-between text-slate-500"><span>Sales Order:</span> <span className="font-bold text-blue-600">{linkedSO}</span></div>
                                                        <div className="flex justify-between text-slate-500"><span>Proforma Ref:</span> <span className="font-medium text-purple-600">{linkedPI || '-'}</span></div>
                                                    </>
                                                ) : (
                                                    <div className="flex justify-between text-slate-500"><span>Sales Invoice:</span> <span className="font-bold text-emerald-600">{linkedSI}</span></div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ================= VIEW: PICKING ================= */}
                    {activeTab === 'picking' && (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
                            <div className="bg-slate-100 p-4 rounded-full mb-4">
                                <ClipboardList size={32} className="text-slate-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">Picking List Module</h3>
                            <p className="text-sm text-slate-500 mt-2 max-w-md">
                                This module allows warehouse staff to view pending items, scan barcodes, and mark items as "Picked" before generating the final Delivery Note.
                            </p>
                            <button className="mt-6 px-4 py-2 bg-white border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-50">
                                View Pending Pick Lists
                            </button>
                        </div>
                    )}

                    {/* --- STICKY FOOTER ACTION BAR --- */}
                    {activeTab === 'create' && (
                        <div className="hidden md:flex fixed bottom-0 md:left-64 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] justify-between items-center z-[60]">
                            <div className="flex items-center gap-3">
                                <div className="px-2 py-1 bg-slate-100 border border-slate-200/50 rounded-md text-[11px] font-bold text-slate-600 shadow-sm flex items-center gap-2">
                                    Status: {renderStatusBadge(status)}
                                </div>
                                <span className="text-[11px] font-medium text-slate-500 hidden lg:inline">DN No: <span className="text-slate-700 font-bold">{dnNumber}</span></span>
                                {autoGenerated && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-blue-700 font-bold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded shadow-sm">
                                        <Box size={12} /> SYSTEM-GENERATED
                                    </div>
                                )}
                                {isLockedForEdit && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-red-600 font-bold bg-red-50 border border-red-100 px-2.5 py-1 rounded shadow-sm">
                                        <Lock size={12} /> {isViewOnly ? 'READ ONLY' : 'LOCKED FOR EDIT'}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {/* Cancel Note Button */}
                                {!isViewOnly && !autoGenerated && status !== 'Draft' && (
                                    <button
                                        onClick={handleCancel}
                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-red-600 rounded text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                        <X size={14} /> Cancel Note
                                    </button>
                                )}

                                {/* Back Button */}
                                <button
                                    onClick={() => setActiveTab('list')}
                                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    {isViewOnly ? 'Back to List' : 'Close'}
                                </button>

                                {/* Save Button */}
                                {!isLockedForEdit && (
                                    <button
                                        onClick={handleSave}
                                        className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-yellow-400 text-slate-800 rounded text-xs font-bold hover:bg-yellow-50 transition-colors shadow-sm"
                                    >
                                        <Save size={14} /> Save Draft
                                    </button>
                                )}

                                {/* Advance Status Button */}
                                {!isViewOnly && (
                                    <button
                                        onClick={handleStatusAdvance}
                                        className="flex items-center gap-1.5 px-5 py-1.5 bg-yellow-400 text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 transition-all shadow-sm"
                                    >
                                        <ArrowRightCircle size={14} />
                                        Advance to {status.toUpperCase() === 'DRAFT' ? 'Dispatched' : 'Delivered'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* ================= PRINT TEMPLATE (Hidden on Screen) ================= */}
            <div className="hidden print:block print:w-full print:absolute print:top-0 print:left-0 print:bg-white print:z-[9999] p-12">
                {/* Header */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <img src={billBullLogo} alt="BillBull Logo" className="h-16 mb-2" />
                        <h1 className="text-xl font-bold text-slate-900">BillBull Retail OS</h1>
                        <p className="text-sm text-slate-500">Retail Enterprise System</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-3xl font-bold text-slate-800 uppercase mb-2">Delivery Note</h2>
                        <div className="text-sm text-slate-600">
                            <span className="font-bold">DN No:</span> {dnNumber}
                        </div>
                        <div className="text-sm text-slate-600">
                            <span className="font-bold">Date:</span> {dnDate}
                        </div>
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-8 mb-8 border-t border-b border-slate-200 py-6">
                    <div>
                        <h3 className="font-bold text-slate-800 mb-2 uppercase text-xs tracking-wider">Dispatch From</h3>
                        <p className="text-sm text-slate-600 font-medium">{warehouse}</p>
                        <p className="text-sm text-slate-500">Industrial Area 1, Dubai, UAE</p>
                        <p className="text-sm text-slate-500">TRN: 100293847561234</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 mb-2 uppercase text-xs tracking-wider">Deliver To</h3>
                        <p className="text-sm text-slate-600 font-bold">{selectedCustomer?.name || 'Guest Customer'}</p>
                        <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{shippingAddress}</p>
                        <p className="text-sm text-slate-500 mt-1">Ref: {selectedCustomer?.code}</p>
                    </div>
                </div>

                {/* References */}
                <div className="grid grid-cols-4 gap-4 mb-8 bg-slate-50 p-4 rounded border border-slate-100">
                    <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">SO Ref</span>
                        <span className="text-sm font-bold text-slate-800">{linkedSO || '-'}</span>
                    </div>
                    <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Driver</span>
                        <span className="text-sm font-bold text-slate-800">{driverName || '-'}</span>
                    </div>
                    <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Vehicle</span>
                        <span className="text-sm font-bold text-slate-800">{vehicleNo || '-'}</span>
                    </div>
                    <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Tracking</span>
                        <span className="text-sm font-bold text-slate-800">{trackingNo || '-'}</span>
                    </div>
                </div>

                {/* Items */}
                <table className="w-full text-left text-sm mb-12 border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800">
                            <th className="py-2 w-12 text-slate-500">#</th>
                            <th className="py-2 w-32">Item Code</th>
                            <th className="py-2">Description</th>
                            <th className="py-2 text-center w-24">Unit</th>
                            <th className="py-2 text-center w-24">Boxes</th>
                            <th className="py-2 text-right w-32">Dispatch Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-200">
                                <td className="py-3 text-slate-500">{idx + 1}</td>
                                <td className="py-3 font-medium text-slate-700">{item.code}</td>
                                <td className="py-3 text-slate-600">{item.desc}</td>
                                <td className="py-3 text-center text-slate-600">{item.unit}</td>
                                <td className="py-3 text-center text-slate-600">{item.boxes}</td>
                                <td className="py-3 text-right font-bold text-slate-800">{item.currentQty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Footer Signatures */}
                <div className="flex justify-between mt-24 pt-8 border-t border-slate-100">
                    <div className="text-center">
                        <div className="h-16 border-b border-slate-400 w-64 mb-2"></div>
                        <div className="text-xs font-bold text-slate-500 uppercase">Authorized Signature</div>
                    </div>
                    <div className="text-center">
                        <div className="h-16 border-b border-slate-400 w-64 mb-2"></div>
                        <div className="text-xs font-bold text-slate-500 uppercase">Received By (Name & Sign)</div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default DeliveryNote;
