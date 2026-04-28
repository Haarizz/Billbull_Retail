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
    History,
    Eye,
    TrendingUp,
    ShoppingCart,
    Zap
} from 'lucide-react';

// ==========================================
// ASSET IMPORTS
// ==========================================
import billBullLogo from '../../assets/billBullLogo.png';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtml, printHtml } from '../../utils/printGenerator';
import { getImageUrl } from '../../utils/urlUtils';
import { useCompany } from '../../context/CompanyContext';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const DELIVERY_NOTE_COLUMNS = [
    { header: 'DN Number', key: 'dnNo', width: 15 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Customer', key: 'customerName', width: 25 },
    { header: 'SO No', key: 'soNo', width: 15 },
    { header: 'PI No', key: 'piNo', width: 15 },
    { header: 'Warehouse', key: 'warehouse', width: 15 },
    { header: 'Status', key: 'status', width: 12 }
];

// ==========================================
// API IMPORTS
// ==========================================
import { getAllCustomers } from '../../api/customerledgerApi';
import { getAllSalesOrders } from '../../api/salesorderApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';
import { getAllProformas, getProformaById } from '../../api/proformaApi';
import { getWarehouses, getWarehouseStock, getWarehouseBins } from '../../api/warehouseApi';
// âœ… IMPORT STOCK API
import { getStockAvailability } from '../../api/stockAvailabilityApi'; // âœ… NEW API for LIVE STOCK
import { getItemPriceHistory } from '../../api/salesInvoiceApi'; // âœ… Price history API

// âœ… DELIVERY NOTE API IMPORTS
import {
    getDeliveryNotes,
    createDeliveryNote,
    updateDeliveryNote,
    advanceDeliveryNoteStatus,
    cancelDeliveryNote
} from "../../api/deliveryNoteApi";

// âœ… PRODUCT SELECTOR
import ProductSelector from '../../components/ProductSelector';
import FastEntryPanel from '../../components/FastEntryPanel';

// âœ… CUSTOMER SELECTOR
import CustomerSelector from '../../components/CustomerSelector';
import CustomerShippingPanel from '../../components/CustomerShippingPanel';

// âœ… STOCK AVAILABILITY MODAL
import StockAvailabilityModal from '../../components/StockAvailabilityModal';

// âœ… SHORTCUTS HOOK
import useShortcuts from '../../hooks/useShortcuts';

// âœ… DYNAMIC UI COMPONENTS

import { ItemDescriptionCell, ItemDescriptionHeader } from '../../components/ItemDescriptionCell';
import ItemAddOnsModal from '../../components/ItemAddOnsModal';

const DeliveryNote = () => {
    const { company } = useCompany();
    const [activeTab, setActiveTab] = useState('list');
    const [currentDnId, setCurrentDnId] = useState(null); // Tracks editing vs creating

    // --- DATA LIST STATES ---
    const [deliveryNotesList, setDeliveryNotesList] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
    const [pickingSearchTerm, setPickingSearchTerm] = useState('');
    const [selectedPickingId, setSelectedPickingId] = useState(null);
    const [pickingScanValue, setPickingScanValue] = useState('');
    const [pickingScanFeedback, setPickingScanFeedback] = useState(null);
    const [pickedItemsByNote, setPickedItemsByNote] = useState({});
    const pickingScanInputRef = React.useRef(null);

    const matchesPickingSearch = (dn, lowerSearch) => {
        if (!lowerSearch) return true;

        const searchableValues = [
            dn.dnNo,
            dn.customerName,
            dn.customerCode,
            dn.soNo,
            dn.piNo,
            dn.siNo,
            dn.linkedSalesInvoiceNumber,
            dn.warehouse,
            ...(dn.items || []).flatMap(item => [
                item.code,
                item.barcode,
                item.desc,
                item.remarks
            ])
        ];

        return searchableValues.some(value =>
            value && String(value).toLowerCase().includes(lowerSearch)
        );
    };

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

    const pickingNotes = useMemo(
        () => deliveryNotesList.filter(dn =>
            dn.type === 'Picking' ||
            (dn.type === 'Before Sale' && dn.piNo && dn.piNo !== '-')
        ),
        [deliveryNotesList]
    );

    const activePickingNotes = useMemo(() => {
        const lower = pickingSearchTerm.trim().toLowerCase();
        return pickingNotes.filter(dn =>
            dn.status === 'DRAFT' && matchesPickingSearch(dn, lower)
        );
    }, [pickingNotes, pickingSearchTerm]);

    const pickingHistoryNotes = useMemo(() => {
        const lower = pickingSearchTerm.trim().toLowerCase();
        return pickingNotes.filter(dn =>
            dn.status !== 'DRAFT' && matchesPickingSearch(dn, lower)
        );
    }, [pickingNotes, pickingSearchTerm]);

    const selectedPickingNote = useMemo(
        () => activePickingNotes.find(dn => dn.id === selectedPickingId) || activePickingNotes[0] || null,
        [activePickingNotes, selectedPickingId]
    );

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    useEffect(() => {
        if (activePickingNotes.length === 0) {
            setSelectedPickingId(null);
            return;
        }

        if (!activePickingNotes.some(note => note.id === selectedPickingId)) {
            setSelectedPickingId(activePickingNotes[0].id);
        }
    }, [activePickingNotes, selectedPickingId]);

    useEffect(() => {
        if (activeTab !== 'picking' || !selectedPickingNote) return;

        const timer = window.setTimeout(() => {
            pickingScanInputRef.current?.focus();
        }, 80);

        return () => window.clearTimeout(timer);
    }, [activeTab, selectedPickingNote]);

    const [customersList, setCustomersList] = useState([]);
    const [salesOrdersList, setSalesOrdersList] = useState([]);
    const [salesInvoicesList, setSalesInvoicesList] = useState([]);
    const [proformasList, setProformasList] = useState([]);
    const [warehousesList, setWarehousesList] = useState([]);
    const [binsList, setBinsList] = useState([]);

    // âœ… NEW STATE: Warehouse Stock Cache (Map: ProductCode -> Qty)
    const [warehouseStockMap, setWarehouseStockMap] = useState({});

    // âœ… LIVE STOCK CACHE FOR ITEM AVAILABILITY PANEL
    const [liveStockMap, setLiveStockMap] = useState({});

    // --- FORM STATES ---
    const [dnNumber, setDnNumber] = useState('');
    const [dnDate, setDnDate] = useState(new Date().toISOString().split('T')[0]);
    const [warehouse, setWarehouse] = useState('');
    const [status, setStatus] = useState('DRAFT');
    const [autoGenerated, setAutoGenerated] = useState(false);
    const [sourceDocumentType, setSourceDocumentType] = useState('');
    const [sourceDocumentId, setSourceDocumentId] = useState('');

    // Linking
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isCustomerOpen, setIsCustomerOpen] = useState(false);
    const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);

    const [sourceType, setSourceType] = useState('SO'); // 'SO' | 'PI' | 'SI'
    const [linkedSO, setLinkedSO] = useState('');
    const [isSOOpen, setIsSOOpen] = useState(false);
    const [linkedPI, setLinkedPI] = useState('');
    const [isPIOpen, setIsPIOpen] = useState(false);
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

    // âœ… GLOBAL SHORTCUTS
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

    // âœ… PRODUCT SELECTOR STATE
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
    const [isFastEntryOpen, setIsFastEntryOpen] = useState(false);

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

    // Read-Only Logic
    const normalizedStatus = (status || '').toUpperCase();
    const isViewOnly = normalizedStatus === 'DELIVERED' || normalizedStatus === 'CANCELLED';
    const isLockedForEdit = normalizedStatus !== 'DRAFT';

    // Helper
    const capitalize = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';

    const getRequiredPickingQty = (item) => Math.max(Number(item?.currentQty) || 0, 0);

    const getPickedQty = (noteId, itemId) =>
        Number(pickedItemsByNote[noteId]?.[itemId] || 0);

    const updatePickedQty = (noteId, itemId, nextQty, maxQty) => {
        const clampedQty = Math.max(0, Math.min(Number(nextQty) || 0, Math.max(0, Number(maxQty) || 0)));

        setPickedItemsByNote(prev => {
            const updated = { ...prev };
            const noteProgress = { ...(updated[noteId] || {}) };

            if (clampedQty === 0) {
                delete noteProgress[itemId];
            } else {
                noteProgress[itemId] = clampedQty;
            }

            if (Object.keys(noteProgress).length === 0) {
                delete updated[noteId];
            } else {
                updated[noteId] = noteProgress;
            }

            return updated;
        });
    };

    const getPickingProgress = (note) => {
        const itemsForNote = Array.isArray(note?.items) ? note.items : [];
        const requiredQty = itemsForNote.reduce((sum, item) => sum + getRequiredPickingQty(item), 0);
        const pickedQty = itemsForNote.reduce((sum, item) => sum + Math.min(getPickedQty(note.id, item.id), getRequiredPickingQty(item)), 0);
        const totalLines = itemsForNote.length;
        const completedLines = itemsForNote.filter(item => getPickedQty(note.id, item.id) >= getRequiredPickingQty(item)).length;

        return {
            requiredQty,
            pickedQty,
            remainingQty: Math.max(requiredQty - pickedQty, 0),
            totalLines,
            completedLines,
            percent: requiredQty > 0 ? Math.min(100, Math.round((pickedQty / requiredQty) * 100)) : 0,
            isComplete: requiredQty > 0 ? pickedQty >= requiredQty : false
        };
    };

    const handleManualPickAdjust = (note, item, delta) => {
        const maxQty = getRequiredPickingQty(item);
        const currentPicked = getPickedQty(note.id, item.id);
        const nextQty = Math.max(0, Math.min(maxQty, currentPicked + delta));

        updatePickedQty(note.id, item.id, nextQty, maxQty);
        setPickingScanFeedback({
            kind: 'success',
            message: `${item.code || item.desc || 'Line item'} updated to ${nextQty}/${maxQty} picked for ${note.dnNo}.`
        });
    };

    const handlePickingScanSubmit = (event) => {
        event.preventDefault();

        if (!selectedPickingNote) {
            setPickingScanFeedback({
                kind: 'error',
                message: 'No active Picking note is selected. Choose a draft note first.'
            });
            return;
        }

        const scanValue = pickingScanValue.trim().toLowerCase();
        if (!scanValue) {
            setPickingScanFeedback({
                kind: 'error',
                message: 'Scan or enter a barcode before submitting.'
            });
            return;
        }

        const matchedItem = (selectedPickingNote.items || []).find(item => {
            const candidates = [item.barcode, item.code]
                .filter(Boolean)
                .map(value => String(value).trim().toLowerCase());

            return candidates.includes(scanValue);
        });

        if (!matchedItem) {
            setPickingScanFeedback({
                kind: 'error',
                message: `No matching barcode or item code was found in ${selectedPickingNote.dnNo}.`
            });
            return;
        }

        const requiredQty = getRequiredPickingQty(matchedItem);
        const currentPicked = getPickedQty(selectedPickingNote.id, matchedItem.id);

        if (currentPicked >= requiredQty) {
            setPickingScanFeedback({
                kind: 'success',
                message: `${matchedItem.code || matchedItem.desc || 'Item'} is already fully picked for ${selectedPickingNote.dnNo}.`
            });
            setPickingScanValue('');
            return;
        }

        const nextQty = currentPicked + 1;
        updatePickedQty(selectedPickingNote.id, matchedItem.id, nextQty, requiredQty);
        setPickingScanValue('');
        setPickingScanFeedback({
            kind: 'success',
            message: `${matchedItem.code || matchedItem.desc || 'Item'} picked ${nextQty}/${requiredQty} for ${selectedPickingNote.dnNo}.`
        });
        window.setTimeout(() => pickingScanInputRef.current?.focus(), 0);
    };

    const handleDispatchPickingNote = async (note) => {
        const progress = getPickingProgress(note);

        if (!progress.isComplete) {
            alert(`Finish scanning all Picking quantities before dispatching ${note.dnNo}.`);
            return;
        }

        if (!window.confirm(`Advance ${note.dnNo} to Dispatched?`)) {
            return;
        }

        try {
            await advanceDeliveryNoteStatus(note.id, '');
            setPickingScanFeedback({
                kind: 'success',
                message: `${note.dnNo} was advanced to Dispatched and moved to Picking history.`
            });
            setPickingScanValue('');
            await loadDeliveryNotes();
        } catch (error) {
            console.error('Failed to dispatch Picking note', error);
            setPickingScanFeedback({
                kind: 'error',
                message: `Failed to advance ${note.dnNo} to Dispatched.`
            });
            alert('Failed to advance Picking note to Dispatched.');
        }
    };

    const createBlankDeliveryItem = () => ({
        id: Date.now() + Math.random(),
        code: '',
        barcode: '',
        image: '',
        desc: '',
        remarks: '',
        unit: 'PCS',
        availableUnits: ['PCS'],
        unitConversions: {},
        orderedQty: 0,
        prevDelivered: 0,
        currentQty: 0,
        qty: 0,
        boxes: 0,
        foc: 0,
        focUnit: 'PCS',
        price: 0,
        tax: 0,
        disc: 0,
        taxAmt: 0,
        grossAmount: 0,
        discountAmount: 0,
        taxableAmount: 0,
        total: 0,
        net: 0,
        cost: 0,
        margin: 0,
        binId: null,
        salesOrderItemId: null,
        stock: 0
    });

    const normalizeDeliveryItem = (item = {}, fallbackId = Date.now() + Math.random()) => {
        const resolvedCode = item.code || item.itemCode || '';
        const resolvedUnit = item.unit || item.uom || item.focUnit || 'PCS';
        const orderedQty = Number(item.orderedQty ?? item.quantity ?? item.qty) || 0;
        const prevDelivered = Number(item.prevDelivered ?? item.prevDeliveredQty ?? item.deliveredQty) || 0;
        const currentQtyValue = Number(item.currentQty);
        const currentQty = Number.isFinite(currentQtyValue)
            ? currentQtyValue
            : Math.max(orderedQty - prevDelivered, 0);
        const computedBoxes = Number(item.boxes);

        const price  = Number(item.price) || 0;
        const disc   = Number(item.disc ?? item.discount ?? item.discountPercent) || 0;
        const tax    = Number(item.tax ?? item.taxPercent ?? item.taxRate) || 0;
        const foc    = Number(item.foc) || 0;
        const grossAmountFromPayload = Number(item.grossAmount ?? item.gross);
        const taxAmountFromPayload = Number(item.taxAmt ?? item.taxAmount);
        const netAmountFromPayload = Number(item.netAmount ?? item.net ?? item.total);
        const grossAmount    = Number.isFinite(grossAmountFromPayload) ? grossAmountFromPayload : (price * currentQty);
        const discountAmount = grossAmount * (disc / 100);
        const taxableAmount  = grossAmount - discountAmount;
        const taxAmt         = Number.isFinite(taxAmountFromPayload) ? taxAmountFromPayload : (taxableAmount * (tax / 100));
        const total          = Number.isFinite(netAmountFromPayload) ? netAmountFromPayload : (taxableAmount + taxAmt);
        const cost           = Number(item.cost ?? item.costPrice ?? item.unitCost) || 0;
        const inferredMargin = price > 0 ? (((price - cost) / price) * 100) : 0;

        return {
            id: item.id || fallbackId,
            code: resolvedCode,
            barcode: item.barcode || item.itemBarcode || '',
            image: item.primaryImage || item.image || item.thumbnailUrl || item.imageUrl || '',
            desc: item.desc || item.description || item.name || '',
            remarks: item.remarks || item.description || item.desc || item.name || '',
            unit: resolvedUnit,
            availableUnits: Array.isArray(item.availableUnits) && item.availableUnits.length > 0
                ? item.availableUnits
                : [resolvedUnit],
            unitConversions: item.unitConversions || {},
            orderedQty,
            prevDelivered,
            currentQty,
            qty: currentQty,
            boxes: Number.isFinite(computedBoxes) ? computedBoxes : (currentQty > 0 ? Math.ceil(currentQty / 10) : 0),
            foc,
            focUnit: item.focUnit || resolvedUnit,
            price,
            tax,
            disc,
            taxAmt,
            grossAmount,
            discountAmount,
            taxableAmount,
            total,
            net: total,
            cost,
            margin: Number(item.margin ?? item.gp) || inferredMargin,
            binId: item.binId ?? null,
            salesOrderItemId: item.salesOrderItemId || null,
            stock: Number(item.stock) || warehouseStockMap[resolvedCode] || 0
        };
    };

    const handleSaveAddonItem = (updatedItem) => {
        setItems(prev => prev.map(i => i.id === updatedItem.id ? { ...updatedItem } : i));
        if (focusedItem && focusedItem.id === updatedItem.id) {
            setFocusedItem(updatedItem);
        }
        setSelectedAddonItem(null);
    };

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
                items: dn.items?.map((item, index) =>
                    normalizeDeliveryItem({ ...item, stock: 0 }, item.id || Date.now() + index + Math.random())
                )
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
                const [custData, soData, siData, whData, piData] = await Promise.all([
                    getAllCustomers(),
                    getAllSalesOrders(),
                    getAllSalesInvoices(),
                    getWarehouses(),
                    getAllProformas()
                ]);

                setCustomersList(Array.isArray(custData) ? custData : []);
                setSalesOrdersList(Array.isArray(soData) ? soData : []);
                setSalesInvoicesList(Array.isArray(siData) ? siData : []);
                setProformasList(Array.isArray(piData) ? piData : []);

                const whs = Array.isArray(whData) ? whData : [];
                setWarehousesList(whs);
                if (whs.length > 0 && !warehouse) setWarehouse(whs[0].name);

            } catch (err) {
                console.error("Failed to load master data", err);
            }
        };
        fetchMasterData();
    }, []);

    // âœ… 5. FETCH STOCK WHEN WAREHOUSE CHANGES
    useEffect(() => {
        const loadStock = async () => {
            if (!warehouse) return;

            try {
                const wh = warehousesList.find(w => w.name === warehouse);
                if (!wh) return;

                const stockList = await getWarehouseStock(wh.id);

                // Convert to map: productCode â†’ quantity
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

    // âœ… FETCH BINS WHEN WAREHOUSE CHANGES
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
        setStatus('DRAFT');
        setAutoGenerated(false);
        setSourceDocumentType('');
        setSourceDocumentId('');
        setDnDate(new Date().toISOString().split('T')[0]);

        setSelectedCustomer(null);
        setSourceType('SO');
        setLinkedSO('');
        setLinkedPI('');
        setLinkedSI('');
        setItems([createBlankDeliveryItem()]);
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
        setLinkedPI(dn.piNo && dn.piNo !== '-' ? dn.piNo : '');
        setLinkedSI(dn.siNo || '');
        setSourceType(dn.siNo ? 'SI' : (dn.piNo && dn.piNo !== '-') ? 'PI' : 'SO');

        const custObj = customersList.find(c => c.code === dn.customerCode) || { code: dn.customerCode, name: dn.customerName };
        setSelectedCustomer(custObj);

        // When loading existing items, we map stock from the new cache if available
        const existingItems = dn.items || [];
        const mappedItems = existingItems.map((item, index) =>
            normalizeDeliveryItem({ ...item, stock: warehouseStockMap[item.code] || 0 }, item.id || Date.now() + index + Math.random())
        );
        setItems(mappedItems.length > 0 ? mappedItems : [createBlankDeliveryItem()]);

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
        const _defaultAddr = (cust.savedAddresses || []).find(a => a.isDefault);
            const _resolvedAddr = _defaultAddr
                ? [_defaultAddr.address1, _defaultAddr.address2, _defaultAddr.city, _defaultAddr.country].filter(Boolean).join(', ')
                : (cust.defaultShippingAddress || cust.shippingAddress || cust.billingAddress || cust.address || '');
            setShippingAddress(_resolvedAddr);
        setLinkedSO('');
        setLinkedPI('');
        setLinkedSI('');
        setItems([createBlankDeliveryItem()]);
    };

    const handleSelectSO = (so) => {
        if (isLockedForEdit) return;
        setLinkedSO(so.soNumber);
        setLinkedPI(so.linkedProforma || '');
        setLinkedSI('');
        setSourceDocumentType('SALES_ORDER');
        setSourceDocumentId(so.id);
        setIsSOOpen(false);
        setIsPIOpen(false);
        setIsSIOpen(false);

        if (so.shippingAddress) {
            setShippingAddress(so.shippingAddress);
        }

        if (so.items && so.items.length > 0) {
            const mappedItems = so.items.map((item, index) =>
                normalizeDeliveryItem({
                    ...item,
                    salesOrderItemId: item.salesOrderItemId || item.id || null,
                    stock: warehouseStockMap[item.itemCode || item.code] || 0
                }, Date.now() + index + Math.random())
            );
            setItems(mappedItems.length > 0 ? mappedItems : [createBlankDeliveryItem()]);
        }
    };

    const handleSelectSI = (si) => {
        if (isLockedForEdit) return;
        setLinkedSI(si.invoiceNumber || si.invoiceNo || si.id);
        setLinkedSO('');
        setLinkedPI('');
        setSourceDocumentType('SALES_INVOICE');
        setSourceDocumentId(si.id);
        setIsSIOpen(false);
        setIsSOOpen(false);
        setIsPIOpen(false);

        if (si.shippingAddress) setShippingAddress(si.shippingAddress);

        const siItems = si.items || si.invoiceItems || [];
        if (siItems.length > 0) {
            const mappedItems = siItems.map((item, index) =>
                normalizeDeliveryItem({
                    ...item,
                    stock: warehouseStockMap[item.itemCode || item.code] || 0
                }, Date.now() + index + Math.random())
            );
            setItems(mappedItems.length > 0 ? mappedItems : [createBlankDeliveryItem()]);
        }
    };

    const handleSelectPI = (pi) => {
        if (isLockedForEdit) return;
        setLinkedPI(pi.piNumber);
        setSourceDocumentType('PROFORMA');
        setSourceDocumentId(pi.id);
        setIsPIOpen(false);

        if (pi.shippingAddress) {
            setShippingAddress(pi.shippingAddress);
        }

        if (pi.items && pi.items.length > 0) {
            const mappedItems = pi.items.map((item, index) =>
                normalizeDeliveryItem({
                    ...item,
                    stock: warehouseStockMap[item.itemCode || item.code] || 0
                }, Date.now() + index + Math.random())
            );
            setItems(mappedItems.length > 0 ? mappedItems : [createBlankDeliveryItem()]);
        }
    };

    // âœ… 11. PRODUCT SELECTOR HANDLER
    const handleAddSingleProduct = (product) => {
        const newItem = normalizeDeliveryItem({
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
            price: Number(product.retailPrice || product.sellingPrice) || 0,
            tax: Number(product.taxPercent || product.salesTax) || 5,
            disc: 0,
            taxAmt: 0,
            margin: 0,
            remarks: product.description || '',
            stock: warehouseStockMap[product.code] || 0
        });

        setItems(prev => {
            const hasData = prev.some(item => item.code || item.desc);
            return hasData ? [...prev, newItem] : [newItem];
        });
        setIsProductSelectorOpen(false); // âœ… Close modal after adding
    };
    const handleFastEntryAdd = (product, qty, price, disc) => {
        if (isLockedForEdit) return;
        const newItem = normalizeDeliveryItem({
            id: Date.now() + Math.random(),
            code: product.code || product.itemCode || '',
            barcode: product.barcode || '',
            image: product.primaryImage || product.image || product.thumbnailUrl || product.imageUrl || '',
            desc: product.description || product.name,
            unit: product.unitName || product.unit || 'PCS',
            orderedQty: qty,
            prevDelivered: 0,
            currentQty: qty,
            boxes: Math.ceil(qty / 10) || 1,
            foc: 0,
            focUnit: product.unitName || product.unit || 'PCS',
            price,
            tax: Number(product.taxPercent || product.salesTax) || 5,
            disc,
            taxAmt: 0,
            margin: 0,
            remarks: product.description || '',
            stock: warehouseStockMap[product.code] || 0
        });

        setItems(prev => {
            const isFirstItemEmpty = prev.length === 1 && !prev[0].code && !prev[0].desc;
            return isFirstItemEmpty ? [newItem] : [...prev, newItem];
        });
    };
    // 

    // âœ… 8. HARD BLOCK INVALID QTY
    const recomputeItemTotals = (item) => {
        const qty   = Number(item.qty ?? item.currentQty) || 0;
        const price = Number(item.price) || 0;
        const disc  = Number(item.disc) || 0;
        const tax   = Number(item.tax) || 0;
        const grossAmount    = price * qty;
        const discountAmount = grossAmount * (disc / 100);
        const taxableAmount  = grossAmount - discountAmount;
        const taxAmt         = taxableAmount * (tax / 100);
        const total          = taxableAmount + taxAmt;
        return { ...item, grossAmount, discountAmount, taxableAmount, taxAmt, total, net: total };
    };

    const handleItemChange = (id, field, value) => {
        if (isLockedForEdit) return;
        setItems(items.map(item => {
            if (item.id === id) {

                if (field === 'currentQty') {
                    const qty = Number(value);
                    const available = warehouseStockMap[item.code] || 0;

                    if (qty > available) {
                        alert(`Insufficient stock for ${item.code}. Available: ${available}`);
                        return item; // â›” Block change
                    }

                    const boxes = Math.ceil(qty / 10);
                    const base = { ...item, currentQty: qty, qty, boxes };
                    const updatedItem = recomputeItemTotals(base);
                    if (focusedItem && focusedItem.id === id) {
                        setFocusedItem(updatedItem);
                    }
                    return updatedItem;
                }

                const stringFields = new Set(['desc', 'remarks', 'unit', 'code', 'image', 'focUnit', 'barcode']);
                let val;
                if (stringFields.has(field)) {
                    val = value;
                } else if (field === 'binId') {
                    val = value ? Number(value) : null;
                } else {
                    val = Number(value) || 0;
                }

                const recalcFields = new Set(['price', 'disc', 'tax', 'foc']);
                const base = { ...item, [field]: val };
                const updatedItem = recalcFields.has(field) ? recomputeItemTotals(base) : base;
                if (focusedItem && focusedItem.id === id) {
                    setFocusedItem(updatedItem);
                }
                return updatedItem;
            }
            return item;
        }));
    };

    // âœ… 9. BLOCK SAVE IF INVALID
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

        const validItems = items.filter(i => i.code || i.desc);
        if (validItems.length === 0) {
            alert("Please add at least one item.");
            return null;
        }

        // âœ… FIX: define selectedWh
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
            sourceDocumentType: sourceDocumentType,
            sourceDocumentId: sourceDocumentId,

            warehouseId: selectedWh.id, // âœ… NOW VALID

            driverName,
            vehicleNo,
            trackingNo,
            shippingAddress,
            items: validItems.map(i => ({
                itemCode: i.code,
                barcode: i.barcode || '',
                image: i.image,
                description: i.desc,
                unit: i.unit,
                orderedQty: i.orderedQty,
                prevDeliveredQty: i.prevDelivered,
                currentQty: i.currentQty,
                boxes: i.boxes,
                foc: Number(i.foc) || 0,
                focUnit: i.focUnit || i.unit,
                remarks: i.remarks || '',
                binId: i.binId ? Number(i.binId) : null,
                salesOrderItemId: i.salesOrderItemId ? Number(i.salesOrderItemId) : null,
                price: Number(i.price) || 0,
                disc: Number(i.disc) || 0,
                tax: Number(i.tax) || 0,
                cost: Number(i.cost) || 0
            }))
        };

        try {
            let result;
            if (currentDnId) {
                result = await updateDeliveryNote(currentDnId, payload);
            } else {
                result = await createDeliveryNote(payload);
            }

            if (result) {
                setCurrentDnId(result.id || currentDnId);
                setStatus(result.status || 'DRAFT');
                setDnNumber(result.dnNumber || dnNumber);
                setAutoGenerated(Boolean(result.autoGenerated));
                setSourceDocumentType(result.sourceDocumentType || '');
                setSourceDocumentId(result.sourceDocumentId || '');

                const refreshedItems = (result.items || []).map((item, index) =>
                    normalizeDeliveryItem(
                        { ...item, stock: warehouseStockMap[item.itemCode || item.code] || 0 },
                        item.id || Date.now() + index + Math.random()
                    )
                );

                if (refreshedItems.length > 0) {
                    setItems(refreshedItems);
                }
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
    const hasItemData = items.some(item => item.code || item.desc);
    const itemLineCount = items.filter(item => item.code || item.desc).length;
    const selectedPickingProgress = selectedPickingNote
        ? getPickingProgress(selectedPickingNote)
        : { requiredQty: 0, pickedQty: 0, remainingQty: 0, completedLines: 0, totalLines: 0, percent: 0, isComplete: false };
    const activePickingQty = activePickingNotes.reduce((sum, note) => sum + getPickingProgress(note).requiredQty, 0);

    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = async () => {
        if (items.length === 0) {
            alert("Nothing to print. Add items first.");
            return;
        }

        setIsPrinting(true);
        try {
            const templates = await getTemplatesByCategory('Delivery Note (DO/DN)');



            // âœ… Select default or fallback to the first available template
            const defaultTemplate = templates.find(t => t.isDefault) || templates[0];

            if (defaultTemplate) {
                const fullCustomer = customersList.find(c => c.code === selectedCustomer?.code);

                const subTotal = items.reduce((sum, i) => sum + (Number(i.taxableAmount) || 0), 0);
                const totalTax = items.reduce((sum, i) => sum + (Number(i.taxAmt) || 0), 0);
                const grandTotal = items.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

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
                        name: i.desc || '', // Using desc as name for the template title
                        desc: (i.remarks || '') + (i.boxes ? ` (${i.boxes} Boxes)` : ''), // Using remarks for the sub-description
                        sku: i.sku || '',
                        localName: i.localName || '',
                        barcode: i.barcode || '',
                        location: warehouse || '',
                        unit: i.unit,
                        qty: i.currentQty,
                        price: Number(i.price) || 0,
                        disc: Number(i.disc) || 0,
                        tax: Number(i.tax) || 0,
                        taxAmt: Number(i.taxAmt) || 0,
                        total: Number(i.total) || 0,
                        image: i.image ? getImageUrl(i.image) : ''
                    })),
                    totals: {
                        subTotal,
                        tax: totalTax,
                        grandTotal,
                        currency: company?.currencySymbol || company?.currency || 'AED'
                    },
                    meta: {
                        status: status,
                        reference: `SO: ${linkedSO || '-'} | PI: ${linkedPI || '-'} | SI: ${linkedSI || '-'}`,
                        location: warehouse || '',
                        notes: `Driver: ${driverName || '-'} | Vehicle: ${vehicleNo || '-'} | Tracking: ${trackingNo || '-'}`
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
        const normalized = (s || 'DRAFT').toUpperCase();
        const styles = {
            DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
            DISPATCHED: 'bg-indigo-50 text-indigo-600 border-indigo-200',
            DELIVERED: 'bg-emerald-50 text-emerald-600 border-emerald-200',
            CANCELLED: 'bg-red-50 text-red-600 border-red-200',
        };
        return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[normalized] || styles.DRAFT}`}>
                {capitalize(normalized)}
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
        <>
        <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative" onClick={() => { setIsCustomerOpen(false); setIsSOOpen(false); setIsSIOpen(false); }}>

            {/* âœ… PRODUCT SELECTOR MODAL */}
            <ProductSelector
                isOpen={isProductSelectorOpen}
                onClose={() => setIsProductSelectorOpen(false)}
                onSelect={handleAddSingleProduct}
                title="Select Items from Products / Services"
                actionLabel="Add to Delivery Note"
            />

            {/* âœ… STOCK AVAILABILITY MODAL */}
            <StockAvailabilityModal
                isOpen={isItemStockModalOpen}
                onClose={() => setIsItemStockModalOpen(false)}
                selectedStockItem={selectedStockItem}
            />

            {/* ✅ ITEM ADD-ONS & DETAILS MODAL */}
            {selectedAddonItem && (
                <ItemAddOnsModal
                    item={selectedAddonItem}
                    onClose={() => setSelectedAddonItem(null)}
                    onSave={handleSaveAddonItem}
                    isReadOnly={isLockedForEdit}
                />
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

                        {/* âœ… TOP ACTION BUTTONS */}
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
                                <ExportDropdown
                                    onExportExcel={() => exportToExcel(filteredDeliveryNotes, DELIVERY_NOTE_COLUMNS, 'Delivery_Notes')}
                                    onExportPdf={() => exportToPDF(filteredDeliveryNotes, DELIVERY_NOTE_COLUMNS, 'Delivery Notes', 'Delivery_Notes')}
                                />
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

                                    {/* 2. Customer + Shipping unified panel */}
                                    <CustomerShippingPanel
                                        selectedCustomer={selectedCustomer}
                                        onOpenCustomerSearch={() => { if (!isLockedForEdit) setIsCustomerSearchOpen(true); }}
                                        shippingAddress={shippingAddress}
                                        onShippingChange={setShippingAddress}
                                        isReadOnly={isLockedForEdit}
                                        currency="AED"
                                    />

                                    {/* CustomerSelector modal */}
                                    <CustomerSelector
                                        isOpen={isCustomerSearchOpen}
                                        onClose={() => setIsCustomerSearchOpen(false)}
                                        onSelect={handleSelectCustomer}
                                        customers={customersList}
                                        selectedCode={selectedCustomer?.code || ''}
                                        onCustomerCreated={async () => {
                                            const data = await getAllCustomers();
                                            setCustomersList(Array.isArray(data) ? data : []);
                                        }}
                                    />

                                    {/* Source Document */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                                        <h3 className="text-xs font-bold text-slate-700">Source Document</h3>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Document Type</label>
                                            <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-bold">
                                                <button type="button" disabled={isLockedForEdit} onClick={() => { if (!isLockedForEdit) { setSourceType('SO'); setLinkedSI(''); setLinkedPI(''); setItems([]); } }} className={`flex-1 py-1.5 transition-colors ${sourceType === 'SO' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-60`}>Sales Order</button>
                                                <button type="button" disabled={isLockedForEdit} onClick={() => { if (!isLockedForEdit) { setSourceType('PI'); setLinkedSO(''); setLinkedSI(''); setItems([]); } }} className={`flex-1 py-1.5 border-l border-slate-200 transition-colors ${sourceType === 'PI' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-60`}>Pro-forma</button>
                                                <button type="button" disabled={isLockedForEdit} onClick={() => { if (!isLockedForEdit) { setSourceType('SI'); setLinkedSO(''); setLinkedPI(''); setItems([]); } }} className={`flex-1 py-1.5 border-l border-slate-200 transition-colors ${sourceType === 'SI' ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-60`}>Sales Invoice</button>
                                            </div>
                                        </div>
                                        {/* Conditional Source Dropdown */}
                                                {sourceType === 'SO' && (
                                                    <div className="relative">
                                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Sales Order</label>
                                                        <div
                                                            onClick={(e) => {
                                                                if (selectedCustomer && !isLockedForEdit) {
                                                                    e.stopPropagation();
                                                                    setIsSOOpen(!isSOOpen);
                                                                    setIsSIOpen(false);
                                                                    setIsPIOpen(false);
                                                                }
                                                            }}
                                                            className={`w-full text-xs p-2 border border-slate-300/50 rounded flex justify-between items-center ${selectedCustomer && !isLockedForEdit ? 'bg-white cursor-pointer hover:border-yellow-400' : 'bg-slate-50 cursor-not-allowed text-slate-400'}`}
                                                        >
                                                            <span className="truncate">{linkedSO || (selectedCustomer ? 'Select Sales Order...' : 'Select Customer First')}</span>
                                                            <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                        </div>
                                                        {isSOOpen && !isLockedForEdit && (
                                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-30 mt-1 max-h-48 overflow-y-auto">
                                                                {salesOrdersList.filter(so => {
                                                                    const isTargetCust = so.customerCode === selectedCustomer?.code;
                                                                    const hasAlreadyDN = deliveryNotesList.some(dn => 
                                                                        dn.id !== currentDnId && 
                                                                        dn.soNo === so.soNumber && 
                                                                        dn.status !== 'CANCELLED'
                                                                    );
                                                                    return isTargetCust && !hasAlreadyDN;
                                                                }).map(so => (
                                                                    <div key={so.id} onClick={() => handleSelectSO(so)} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                                                                        <span className="font-bold">{so.soNumber}</span> <span className="text-slate-400">({so.orderDate})</span>
                                                                    </div>
                                                                ))}
                                                                {salesOrdersList.filter(so => {
                                                                    const isTargetCust = so.customerCode === selectedCustomer?.code;
                                                                    const hasAlreadyDN = deliveryNotesList.some(dn => 
                                                                        dn.id !== currentDnId && 
                                                                        dn.soNo === so.soNumber && 
                                                                        dn.status !== 'CANCELLED'
                                                                    );
                                                                    return isTargetCust && !hasAlreadyDN;
                                                                }).length === 0 && (
                                                                    <div className="px-3 py-2 text-xs text-slate-400">No Sales Orders found</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {sourceType === 'PI' && (
                                                    <div className="relative">
                                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Pro-forma Invoice</label>
                                                        <div
                                                            onClick={(e) => {
                                                                if (selectedCustomer && !isLockedForEdit) {
                                                                    e.stopPropagation();
                                                                    setIsPIOpen(!isPIOpen);
                                                                    setIsSOOpen(false);
                                                                    setIsSIOpen(false);
                                                                }
                                                            }}
                                                            className={`w-full text-xs p-2 border border-slate-300/50 rounded flex justify-between items-center ${selectedCustomer && !isLockedForEdit ? 'bg-white cursor-pointer hover:border-yellow-400' : 'bg-slate-50 cursor-not-allowed text-slate-400'}`}
                                                        >
                                                            <span className="truncate">{linkedPI || (selectedCustomer ? 'Select Pro-forma...' : 'Select Customer First')}</span>
                                                            <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                        </div>
                                                        {isPIOpen && !isLockedForEdit && (
                                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-30 mt-1 max-h-48 overflow-y-auto">
                                                                {proformasList
                                                                    .filter(pi => {
                                                                        const isTargetCust = (pi.customerCode === selectedCustomer?.code || pi.customer?.code === selectedCustomer?.code);
                                                                        const isIssued = pi.status === 'ISSUED';
                                                                        const hasAlreadyDN = deliveryNotesList.some(dn => 
                                                                            dn.id !== currentDnId && 
                                                                            dn.piNo === (pi.piNumber || pi.piNo) && 
                                                                            dn.status !== 'CANCELLED'
                                                                        );
                                                                        return isTargetCust && isIssued && !hasAlreadyDN;
                                                                    })
                                                                    .map(pi => (
                                                                        <div key={pi.id} onClick={() => handleSelectPI(pi)} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                                                                            <span className="font-bold">{pi.piNo || pi.piNumber}</span> <span className="text-slate-400">({pi.date || pi.piDate})</span>
                                                                        </div>
                                                                    ))}
                                                                {proformasList.filter(pi => {
                                                                    const isTargetCust = (pi.customerCode === selectedCustomer?.code || pi.customer?.code === selectedCustomer?.code);
                                                                    const isIssued = pi.status === 'ISSUED';
                                                                    const hasAlreadyDN = deliveryNotesList.some(dn => 
                                                                        dn.id !== currentDnId && 
                                                                        dn.piNo === (pi.piNumber || pi.piNo) && 
                                                                        dn.status !== 'CANCELLED'
                                                                    );
                                                                    return isTargetCust && isIssued && !hasAlreadyDN;
                                                                }).length === 0 && (
                                                                    <div className="px-3 py-2 text-xs text-slate-400">No Issued Pro-formas found</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {sourceType === 'SI' && (
                                                    <div className="relative">
                                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Source Sales Invoice</label>
                                                        <div
                                                            onClick={(e) => {
                                                                if (selectedCustomer && !isLockedForEdit) {
                                                                    e.stopPropagation();
                                                                    setIsSIOpen(!isSIOpen);
                                                                    setIsSOOpen(false);
                                                                    setIsPIOpen(false);
                                                                }
                                                            }}
                                                            className={`w-full text-xs p-2 border border-slate-300/50 rounded flex justify-between items-center ${selectedCustomer && !isLockedForEdit ? 'bg-white cursor-pointer hover:border-yellow-400' : 'bg-slate-50 cursor-not-allowed text-slate-400'}`}
                                                        >
                                                            <span className="truncate">{linkedSI || (selectedCustomer ? 'Select Sales Invoice...' : 'Select Customer First')}</span>
                                                            <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                        </div>
                                                        {isSIOpen && !isLockedForEdit && (
                                                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded shadow-lg z-30 mt-1 max-h-48 overflow-y-auto">
                                                                {salesInvoicesList.filter(si => {
                                                                    const isTargetCust = si.customerCode === selectedCustomer?.code || si.customer?.code === selectedCustomer?.code;
                                                                    const hasAlreadyDN = deliveryNotesList.some(dn => 
                                                                        dn.id !== currentDnId && 
                                                                        dn.siNo === (si.invoiceNumber || si.invoiceNo) && 
                                                                        dn.status !== 'CANCELLED'
                                                                    );
                                                                    return isTargetCust && !hasAlreadyDN;
                                                                }).map(si => (
                                                                    <div key={si.id} onClick={() => handleSelectSI(si)} className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                                                                        <span className="font-bold">{si.invoiceNumber || si.invoiceNo}</span> <span className="text-slate-400">({si.invoiceDate || si.date})</span>
                                                                    </div>
                                                                ))}
                                                                {salesInvoicesList.filter(si => {
                                                                    const isTargetCust = si.customerCode === selectedCustomer?.code || si.customer?.code === selectedCustomer?.code;
                                                                    const hasAlreadyDN = deliveryNotesList.some(dn => 
                                                                        dn.id !== currentDnId && 
                                                                        dn.siNo === (si.invoiceNumber || si.invoiceNo) && 
                                                                        dn.status !== 'CANCELLED'
                                                                    );
                                                                    return isTargetCust && !hasAlreadyDN;
                                                                }).length === 0 && (
                                                                    <div className="px-3 py-2 text-xs text-slate-400">No Sales Invoices found</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
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
                                    <div className="bg-white rounded-lg border border-slate-200/50 p-5 shadow-sm min-h-[460px]">
                                        <div className="flex justify-between items-center mb-4 border-b border-slate-100/50 pb-2">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <ShoppingCart size={16} className="text-yellow-500" /> Delivery Note Items
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                {!hasItemData && (linkedSO || linkedSI) && (
                                                    <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded">No items found</span>
                                                )}
                                                {!isLockedForEdit && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setIsProductSelectorOpen(true)}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-slate-900 text-xs font-medium rounded hover:bg-yellow-500"
                                                        >
                                                            <Plus size={14} /> Select from Products
                                                        </button>
                                                        <button
                                                            onClick={() => setIsFastEntryOpen(true)}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded hover:bg-slate-50 shadow-sm"
                                                        >
                                                            <Zap size={13} className="fill-yellow-400 text-yellow-400" /> Fast Entry
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="overflow-auto max-h-[380px]">
                                            <table className="w-full text-xs text-left min-w-[940px]">
                                                <thead className="sticky top-0 z-10 bg-white border-b border-slate-100/80 text-[11px] font-semibold text-slate-500">
                                                    <tr>
                                                        <th className="p-2 w-8 text-center text-slate-400">#</th>
                                                        <th className="p-2 min-w-[280px]">
                                                            <ItemDescriptionHeader
                                                                itemCount={items.length}
                                                                expandedRowsCount={Object.keys(expandedRows).length}
                                                                onToggleAll={toggleAllDescriptions}
                                                            />
                                                        </th>
                                                        <th className="p-2 w-16 text-center">Unit</th>
                                                        <th className="p-2 w-20 text-center">Qty ordered</th>
                                                        <th className="p-2 w-24 text-center text-slate-400">Prev. Del</th>
                                                        <th className="p-2 w-24 text-center">Current Qty</th>
                                                        <th className="p-2 w-16 text-center">Boxes</th>
                                                        <th className="p-2 w-32 text-center">Bin</th>
                                                        <th className="p-2 w-10 text-center">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100/50">
                                                    {hasItemData ? items.map((item, index) => (
                                                        <React.Fragment key={item.id}>
                                                            <tr className={`group hover:bg-slate-50/50 transition-colors bg-white align-middle ${isLockedForEdit ? 'opacity-80' : ''}`}>
                                                                <td className="p-2 text-center text-slate-400 text-xs font-medium">{index + 1}</td>
                                                                <td className="p-2">
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
                                                                        onOpenSettings={(selectedItem) => setSelectedAddonItem({ ...selectedItem })}
                                                                        showSettings={Boolean(item.code || item.desc || item.remarks)}
                                                                        isReadOnly={isLockedForEdit}
                                                                        showTaxDiscount={true}
                                                                        page="deliveryNote"
                                                                    />
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    <div className="rounded-md border border-slate-200 bg-white inline-block px-2 py-1 min-w-[52px]">
                                                                        <span className="text-xs font-medium text-slate-700">{item.unit || 'PCS'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    <span className="font-bold text-slate-700">{item.orderedQty}</span>
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    <span className="text-slate-400">{item.prevDelivered}</span>
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[92px] mx-auto">
                                                                        <input
                                                                            disabled={isLockedForEdit}
                                                                            type="number"
                                                                            className="w-full bg-transparent text-center outline-none font-bold text-sm text-slate-800 disabled:opacity-50"
                                                                            value={item.currentQty}
                                                                            onFocus={() => setFocusedItem({
                                                                                ...item,
                                                                                stock: warehouseStockMap[item.code] || 0
                                                                            })}
                                                                            onChange={(e) => handleItemChange(item.id, 'currentQty', e.target.value)}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    <div className="rounded-md border border-slate-200 bg-white flex items-center px-2 py-1 w-full max-w-[80px] mx-auto">
                                                                        <input
                                                                            disabled={isLockedForEdit}
                                                                            type="number"
                                                                            className="w-full bg-transparent text-center outline-none font-semibold text-xs text-slate-700 disabled:opacity-50"
                                                                            value={item.boxes || ''}
                                                                            onChange={(e) => handleItemChange(item.id, 'boxes', e.target.value)}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1 w-full max-w-[140px] mx-auto">
                                                                        <select
                                                                            disabled={isLockedForEdit}
                                                                            className="w-full bg-transparent outline-none text-[11px] text-slate-700 disabled:opacity-50"
                                                                            value={item.binId || ''}
                                                                            onChange={(e) => handleItemChange(item.id, 'binId', e.target.value)}
                                                                        >
                                                                            <option value="">Select Bin</option>
                                                                            {binsList.map(bin => (
                                                                                <option key={bin.id} value={bin.id}>{bin.name} ({bin.code})</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 text-center align-middle">
                                                                    {!isLockedForEdit && (
                                                                        <button
                                                                            onClick={() => {
                                                                                const newItems = items.filter(i => i.id !== item.id);
                                                                                setItems(newItems.length > 0 ? newItems : [createBlankDeliveryItem()]);
                                                                            }}
                                                                            className="text-slate-300 hover:text-red-500 transition-colors"
                                                                        >
                                                                            <X size={16} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>

                                                            {expandedRows[item.id] && (
                                                                <tr className="bg-white">
                                                                    <td className="p-2"></td>
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
                                                                                placeholder="Enter product description - add delivery notes or dispatch details..."
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
                                                            <td colSpan={9} className="py-12 text-center bg-slate-50/50 border-b border-slate-100 border-dashed rounded-b-lg">
                                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                                    <ShoppingCart size={32} className="mb-3 text-slate-300" />
                                                                    <span className="text-sm font-semibold text-slate-500">No items added.</span>
                                                                    <span className="text-xs mt-1 text-slate-400">Link a Sales Order / Sales Invoice or click "Select from Products".</span>
                                                                </div>
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
                                                    <span className="text-yellow-600">{itemLineCount}</span>
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
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Active Pick Lists</div>
                                    <div className="text-2xl font-black text-slate-800">{activePickingNotes.length}</div>
                                    <div className="text-xs text-slate-500 mt-1">Draft Picking notes waiting for warehouse action.</div>
                                </div>
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Queued Quantity</div>
                                    <div className="text-2xl font-black text-slate-800">{activePickingQty}</div>
                                    <div className="text-xs text-slate-500 mt-1">Total units across all active Picking documents.</div>
                                </div>
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">History</div>
                                    <div className="text-2xl font-black text-slate-800">{pickingHistoryNotes.length}</div>
                                    <div className="text-xs text-slate-500 mt-1">Delivered and dispatched Picking notes remain visible here.</div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 md:p-5 space-y-4">
                                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">Warehouse Picking Queue</h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Sales invoices now generate Picking notes. Fast Sale notes land in history as delivered, while workflow notes stay draft until the warehouse finishes picking and dispatches them.
                                        </p>
                                    </div>

                                    <form onSubmit={handlePickingScanSubmit} className="flex flex-col sm:flex-row gap-2 xl:min-w-[440px]">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                            <input
                                                ref={pickingScanInputRef}
                                                type="text"
                                                value={pickingScanValue}
                                                onChange={(e) => setPickingScanValue(e.target.value)}
                                                placeholder={selectedPickingNote ? `Scan barcode for ${selectedPickingNote.dnNo}` : 'Select a Picking note to start scanning'}
                                                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742] disabled:bg-slate-50"
                                                disabled={!selectedPickingNote}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!selectedPickingNote}
                                            className="px-4 py-2.5 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Scan Item
                                        </button>
                                    </form>
                                </div>

                                <div className="flex flex-col lg:flex-row gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            type="text"
                                            value={pickingSearchTerm}
                                            onChange={(e) => setPickingSearchTerm(e.target.value)}
                                            placeholder="Filter by DN, customer, invoice, item code, or barcode"
                                            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-[#F5C742]"
                                        />
                                    </div>
                                    <button
                                        onClick={() => {
                                            setPickingSearchTerm('');
                                            setPickingScanFeedback(null);
                                        }}
                                        className="px-4 py-2 border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50"
                                    >
                                        Clear Filter
                                    </button>
                                </div>

                                {pickingScanFeedback && (
                                    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
                                        pickingScanFeedback.kind === 'success'
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                            : 'bg-red-50 border-red-200 text-red-700'
                                    }`}>
                                        {pickingScanFeedback.kind === 'success' ? (
                                            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                                        ) : (
                                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        )}
                                        <p className="text-xs font-medium">{pickingScanFeedback.message}</p>
                                    </div>
                                )}

                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-3">Picking Note</th>
                                                <th className="px-4 py-3">Customer</th>
                                                <th className="px-4 py-3">Invoice</th>
                                                <th className="px-4 py-3">Warehouse</th>
                                                <th className="px-4 py-3 text-center">Qty</th>
                                                <th className="px-4 py-3 text-center">Progress</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {activePickingNotes.map((note) => {
                                                const progress = getPickingProgress(note);
                                                const isSelected = selectedPickingNote?.id === note.id;

                                                return (
                                                    <tr
                                                        key={note.id}
                                                        onClick={() => {
                                                            setSelectedPickingId(note.id);
                                                            setPickingScanFeedback(null);
                                                        }}
                                                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-yellow-50/70' : 'hover:bg-slate-50'}`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-slate-700 flex items-center gap-2">
                                                                {note.dnNo}
                                                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Picking</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 mt-1">{note.date}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-slate-700">{note.customerName}</div>
                                                            <div className="text-[10px] text-slate-400">{note.customerCode}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-500">{note.siNo || note.linkedSalesInvoiceNumber || '-'}</td>
                                                        <td className="px-4 py-3 text-slate-500">{note.warehouse || '-'}</td>
                                                        <td className="px-4 py-3 text-center font-bold text-slate-700">{progress.requiredQty}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
                                                                </div>
                                                                <span className="text-[11px] font-bold text-slate-600 min-w-[78px] text-right">
                                                                    {progress.pickedQty}/{progress.requiredQty}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    onClick={() => handleRowClick(note)}
                                                                    className="px-3 py-1.5 border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                                                >
                                                                    Open Note
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDispatchPickingNote(note)}
                                                                    disabled={!progress.isComplete}
                                                                    className="px-3 py-1.5 bg-slate-900 text-white rounded text-[11px] font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    Dispatch
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {activePickingNotes.length === 0 && (
                                                <tr>
                                                    <td colSpan="7" className="px-4 py-10 text-center text-slate-400">
                                                        No draft Picking notes match the current filter.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="md:hidden space-y-3">
                                    {activePickingNotes.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 italic">No draft Picking notes match the current filter.</div>
                                    ) : activePickingNotes.map(note => {
                                        const progress = getPickingProgress(note);
                                        const isSelected = selectedPickingNote?.id === note.id;

                                        return (
                                            <div
                                                key={note.id}
                                                onClick={() => {
                                                    setSelectedPickingId(note.id);
                                                    setPickingScanFeedback(null);
                                                }}
                                                className={`rounded-lg border p-4 shadow-sm ${isSelected ? 'border-yellow-300 bg-yellow-50/70' : 'border-slate-200 bg-white'}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-bold text-slate-800">{note.dnNo}</div>
                                                        <div className="text-[11px] text-slate-500 mt-1">{note.customerName}</div>
                                                        <div className="text-[10px] text-slate-400 mt-1">{note.siNo || note.linkedSalesInvoiceNumber || 'No invoice link'}</div>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">Picking</span>
                                                </div>

                                                <div className="mt-3 flex items-center gap-3">
                                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
                                                    </div>
                                                    <span className="text-[11px] font-bold text-slate-600">{progress.pickedQty}/{progress.requiredQty}</span>
                                                </div>

                                                <div className="mt-3 flex gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRowClick(note);
                                                        }}
                                                        className="flex-1 px-3 py-2 border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                                    >
                                                        Open Note
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDispatchPickingNote(note);
                                                        }}
                                                        disabled={!progress.isComplete}
                                                        className="flex-1 px-3 py-2 bg-slate-900 text-white rounded text-[11px] font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        Dispatch
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-[1.6fr,0.9fr] gap-6">
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 md:p-5">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                                        <div>
                                            <h3 className="text-base font-bold text-slate-800">Selected Picking Detail</h3>
                                            <p className="text-sm text-slate-500 mt-1">Scan barcodes or adjust picked counts line by line before dispatch.</p>
                                        </div>
                                        {selectedPickingNote && (
                                            <button
                                                onClick={() => handleRowClick(selectedPickingNote)}
                                                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                <Eye size={14} />
                                                Open Full Delivery Note
                                            </button>
                                        )}
                                    </div>

                                    {!selectedPickingNote ? (
                                        <div className="min-h-[260px] flex flex-col items-center justify-center text-center text-slate-400">
                                            <div className="bg-slate-100 p-4 rounded-full mb-4">
                                                <ClipboardList size={28} className="text-slate-400" />
                                            </div>
                                            <p className="text-sm font-medium">There is no active draft Picking note to work on right now.</p>
                                            <p className="text-xs text-slate-400 mt-2">Fast Sale notes skip this queue and appear in Picking history after delivery.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-lg font-bold text-slate-800">{selectedPickingNote.dnNo}</h4>
                                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">Picking</span>
                                                        </div>
                                                        <div className="text-sm text-slate-500 mt-1">
                                                            {selectedPickingNote.customerName} ({selectedPickingNote.customerCode}){selectedPickingNote.siNo ? ` • ${selectedPickingNote.siNo}` : ''}
                                                        </div>
                                                        <div className="text-xs text-slate-400 mt-1">
                                                            Warehouse: {selectedPickingNote.warehouse || '-'} • Date: {selectedPickingNote.date}
                                                        </div>
                                                    </div>

                                                    <div className="min-w-[220px]">
                                                        <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
                                                            <span>Picked Progress</span>
                                                            <span>{selectedPickingProgress.pickedQty}/{selectedPickingProgress.requiredQty}</span>
                                                        </div>
                                                        <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                                                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${selectedPickingProgress.percent}%` }} />
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 mt-2">
                                                            {selectedPickingProgress.completedLines}/{selectedPickingProgress.totalLines} lines complete
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs text-left min-w-[760px]">
                                                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                                                        <tr>
                                                            <th className="px-4 py-3">Item</th>
                                                            <th className="px-4 py-3">Barcode</th>
                                                            <th className="px-4 py-3 text-center">Required</th>
                                                            <th className="px-4 py-3 text-center">Picked</th>
                                                            <th className="px-4 py-3 text-center">Remaining</th>
                                                            <th className="px-4 py-3 text-right">Quick Pick</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {(selectedPickingNote.items || []).map(item => {
                                                            const requiredQty = getRequiredPickingQty(item);
                                                            const pickedQty = getPickedQty(selectedPickingNote.id, item.id);
                                                            const remainingQty = Math.max(requiredQty - pickedQty, 0);

                                                            return (
                                                                <tr key={item.id} className="hover:bg-slate-50/70">
                                                                    <td className="px-4 py-3">
                                                                        <div className="font-medium text-slate-700">{item.code || item.desc || '-'}</div>
                                                                        <div className="text-[10px] text-slate-400 mt-1">{item.desc || item.remarks || 'No description'}</div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-500">
                                                                        {item.barcode || <span className="text-slate-300">No barcode</span>}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center font-bold text-slate-700">{requiredQty}</td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className={`px-2 py-1 rounded text-[11px] font-bold border ${
                                                                            pickedQty >= requiredQty
                                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                        }`}>
                                                                            {pickedQty}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center font-medium text-slate-500">{remainingQty}</td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex justify-end items-center gap-2">
                                                                            <button
                                                                                onClick={() => handleManualPickAdjust(selectedPickingNote, item, -1)}
                                                                                disabled={pickedQty === 0}
                                                                                className="w-8 h-8 rounded border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                            >
                                                                                -
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleManualPickAdjust(selectedPickingNote, item, 1)}
                                                                                disabled={pickedQty >= requiredQty}
                                                                                className="w-8 h-8 rounded bg-[#F5C742] text-slate-900 font-bold hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                            >
                                                                                +
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                                        <h3 className="text-sm font-bold text-slate-800 mb-3">Warehouse Workflow</h3>
                                        <div className="space-y-3 text-xs text-slate-500">
                                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                                Scan each barcode to move Picking quantities forward one unit at a time.
                                            </div>
                                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                                The Dispatch action stays manual and only unlocks after all required quantities are marked picked.
                                            </div>
                                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                                Fast Sale notes bypass the active queue but remain visible below in Picking history for audit.
                                            </div>
                                        </div>
                                    </div>

                                    {selectedPickingNote && (
                                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <h3 className="text-sm font-bold text-slate-800">Ready To Dispatch</h3>
                                                {selectedPickingProgress.isComplete ? (
                                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">Complete</span>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">In Progress</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 leading-5">
                                                {selectedPickingProgress.isComplete
                                                    ? `${selectedPickingNote.dnNo} is fully picked and ready to move to Dispatched.`
                                                    : `${selectedPickingProgress.remainingQty} unit(s) are still waiting to be picked on ${selectedPickingNote.dnNo}.`}
                                            </p>
                                            <button
                                                onClick={() => handleDispatchPickingNote(selectedPickingNote)}
                                                disabled={!selectedPickingProgress.isComplete}
                                                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <Truck size={14} />
                                                Advance To Dispatched
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 md:p-5">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800">Picking History</h3>
                                        <p className="text-sm text-slate-500 mt-1">Delivered fast-sale notes and dispatched workflow notes remain visible for review.</p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto hidden md:block">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-3">Picking Note</th>
                                                <th className="px-4 py-3">Customer</th>
                                                <th className="px-4 py-3">Invoice</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Date</th>
                                                <th className="px-4 py-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {pickingHistoryNotes.map(note => (
                                                <tr key={note.id} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 font-bold text-slate-700">{note.dnNo}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-slate-700">{note.customerName}</div>
                                                        <div className="text-[10px] text-slate-400">{note.customerCode}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{note.siNo || note.linkedSalesInvoiceNumber || '-'}</td>
                                                    <td className="px-4 py-3">{renderStatusBadge(note.status)}</td>
                                                    <td className="px-4 py-3 text-slate-500">{note.date}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => handleRowClick(note)}
                                                            className="px-3 py-1.5 border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                                        >
                                                            View Note
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {pickingHistoryNotes.length === 0 && (
                                                <tr>
                                                    <td colSpan="6" className="px-4 py-10 text-center text-slate-400">
                                                        No Picking history records match the current filter yet.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="md:hidden space-y-3">
                                    {pickingHistoryNotes.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 italic">No Picking history records match the current filter yet.</div>
                                    ) : pickingHistoryNotes.map(note => (
                                        <div key={note.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="font-bold text-slate-800">{note.dnNo}</div>
                                                    <div className="text-[11px] text-slate-500 mt-1">{note.customerName}</div>
                                                    <div className="text-[10px] text-slate-400 mt-1">{note.siNo || note.linkedSalesInvoiceNumber || 'No invoice link'}</div>
                                                </div>
                                                {renderStatusBadge(note.status)}
                                            </div>
                                            <button
                                                onClick={() => handleRowClick(note)}
                                                className="mt-3 w-full px-3 py-2 border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                View Note
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
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
                                {!isViewOnly && normalizedStatus !== 'DRAFT' && (
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
                                        Advance to {normalizedStatus === 'DRAFT' ? 'Dispatched' : 'Delivered'}
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

      {/* FAST ENTRY PANEL */}
      <FastEntryPanel
        isOpen={!isLockedForEdit && isFastEntryOpen}
        onClose={() => setIsFastEntryOpen(false)}
        onAddItem={handleFastEntryAdd}
      />
        </>
    );
};

export default DeliveryNote;
