import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import {
    Search, Printer, X, Plus, Minus, Trash2,
    Barcode, Layout, CheckCircle, Square, ArrowLeft,
    FileText, Grid, Tag, ShoppingBag, AlertCircle,
    ChevronLeft, ChevronRight, RefreshCw, Send, Box,
    Calendar, Filter, Loader, Save, SlidersHorizontal
} from 'lucide-react';
import { searchExactProducts } from "../../../api/productsApi";
import { getLpos } from "../../../api/lpoApi";
import { getPostedPurchaseInvoices } from '../../../api/purchaseInvoiceApi';
import { getVendors } from "../../../api/vendorsApi";
import { getBarcodeTemplates, createBarcodeTemplate, updateBarcodeTemplate, deleteBarcodeTemplate } from '../../../api/barcodeTemplateApi';
import { getStockTakeSessions, getStockTakeSession } from '../../../api/stockTakeApi';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from "../../../context/CompanyContext";
import { getImageUrl } from "../../../utils/urlUtils";
import {
    resolveCurrencyDisplayConfig,
    resolveCurrencyDisplayCode,
    UAE_DIRHAM_SYMBOL_IMAGE
} from "../../../utils/countryCurrencyOptions";
import { printZplBatch, isBrowserPrintReachable } from "../../../utils/zebraZpl";

const TEMPLATES = [
    {
        id: 'dual_standard_70x50',
        name: 'Standard Dual 70x50mm',
        desc: 'Balanced two-barcode label',
        width: 70, height: 50, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128', contentScale: 0.9,
        fields: { barcode: true, name: true, price: true, sku: true, unit: false, company: false, qr: false, itemCode: false, brandName: true, batchNumber: true, expiryDate: true },
        isSystem: true
    },
    {
        id: 'dual_compact_80x35',
        name: 'Compact Dual 80x35mm',
        desc: 'Compact batch barcode label',
        width: 80, height: 35, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128', contentScale: 0.78,
        fields: { barcode: true, name: true, price: true, sku: false, unit: false, company: false, qr: false, itemCode: false, brandName: false, batchNumber: true, expiryDate: true },
        isSystem: true
    },
    {
        id: 'dual_retail_90x50',
        name: 'Retail Dual 90x50mm',
        desc: 'Price and expiry focused',
        width: 90, height: 50, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128', contentScale: 0.9,
        fields: { barcode: true, name: true, price: true, sku: true, unit: true, company: false, qr: false, itemCode: false, brandName: true, batchNumber: true, expiryDate: true },
        isSystem: true
    },
    {
        id: 'dual_detailed_100x60',
        name: 'Detailed Dual 100x60mm',
        desc: 'Company and item details',
        width: 100, height: 60, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128', contentScale: 0.95,
        fields: { barcode: true, name: true, price: true, sku: true, unit: true, company: true, qr: false, itemCode: true, brandName: true, batchNumber: true, expiryDate: true },
        isSystem: true
    },
    {
        id: 'dual_sheet_90x50',
        name: 'Sheet Dual 90x50mm',
        desc: 'Two-column sheet friendly',
        width: 90, height: 50, type: 'Sheet', perPage: 2, barcodeFormat: 'CODE128', contentScale: 0.88,
        fields: { barcode: true, name: true, price: true, sku: true, unit: false, company: false, qr: false, itemCode: false, brandName: true, batchNumber: true, expiryDate: true },
        isSystem: true
    },
    {
        id: 'roll_zebra_100x75',
        name: 'Zebra Roll 100x75mm',
        desc: 'Thermal roll, single label/page (Zebra ZD220t)',
        width: 100, height: 75, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128', contentScale: 1,
        fields: { barcode: true, name: true, price: true, sku: true, unit: false, company: true, qr: false, itemCode: true, brandName: true, batchNumber: true, expiryDate: true },
        isSystem: true
    },
    {
        id: 'qr_batch_50x50',
        name: 'QR Code 50x50mm',
        desc: 'QR label with expiry text',
        width: 50, height: 50, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128', contentScale: 0.9,
        fields: { barcode: false, name: true, price: true, sku: false, unit: false, company: false, qr: true, itemCode: false, brandName: false, batchNumber: false, expiryDate: true },
        isSystem: true
    },
];

const CONTENT_SCALE_FIELD = '_contentScale';
const DEFAULT_CONTENT_SCALE = 1;
const MIN_CONTENT_SCALE = 0.75;
const MAX_CONTENT_SCALE = 1.35;

const DEFAULT_TEMPLATE_FIELDS = {
    barcode: true,
    qr: false,
    name: true,
    sku: true,
    unit: false,
    price: true,
    company: false,
    itemCode: false,
    brandName: false,
    batchNumber: true,
    expiryDate: true
};

const FIELD_ALIASES = {
    productName: 'name',
    itemName: 'name',
    productCode: 'itemCode',
    item_code: 'itemCode',
    code: 'itemCode',
    brand: 'brandName',
    batch: 'batchNumber',
    batchNo: 'batchNumber',
    batchBarcode: 'batchNumber',
    expiry: 'expiryDate',
    expDate: 'expiryDate',
    sellingPrice: 'price',
    retailPrice: 'price',
    uom: 'unit',
    unitName: 'unit'
};

const toBooleanFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';

const parseTemplateFields = (fields) => {
    if (!fields) return {};
    if (typeof fields === 'object') return fields;

    try {
        return JSON.parse(fields);
    } catch (error) {
        console.warn('Invalid barcode template fields JSON', error);
        return {};
    }
};

const clampContentScale = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return DEFAULT_CONTENT_SCALE;

    const clamped = Math.min(MAX_CONTENT_SCALE, Math.max(MIN_CONTENT_SCALE, numericValue));
    return Math.round(clamped * 100) / 100;
};

const normalizeTemplateFields = (fields) => {
    const parsed = parseTemplateFields(fields);
    const normalized = { ...DEFAULT_TEMPLATE_FIELDS };

    Object.entries(FIELD_ALIASES).forEach(([sourceKey, targetKey]) => {
        if (
            Object.prototype.hasOwnProperty.call(parsed, sourceKey) &&
            !Object.prototype.hasOwnProperty.call(parsed, targetKey)
        ) {
            normalized[targetKey] = toBooleanFlag(parsed[sourceKey]);
        }
    });

    Object.entries(parsed).forEach(([key, value]) => {
        if (key.startsWith('_')) {
            normalized[key] = value;
            return;
        }

        if (Object.prototype.hasOwnProperty.call(DEFAULT_TEMPLATE_FIELDS, key)) {
            normalized[key] = toBooleanFlag(value);
        }
    });

    return normalized;
};

const getTemplateContentScale = (template) => {
    const fields = parseTemplateFields(template?.fields);
    return clampContentScale(
        template?.contentScale ??
        fields?.[CONTENT_SCALE_FIELD] ??
        fields?.contentScale ??
        DEFAULT_CONTENT_SCALE
    );
};

const countEnabledFields = (fields) => (
    Object.entries(normalizeTemplateFields(fields))
        .filter(([key, value]) => !key.startsWith('_') && value === true)
        .length
);

const getTemplateDescription = (template) => (
    template?.description || template?.desc || 'Custom barcode label'
);

const isSystemTemplate = (template) => (
    Boolean(template?.isSystem ?? template?.system)
);

const getTemplateSystemKey = (template) => (
    template?.systemKey || (typeof template?.id === 'string' ? template.id : null)
);

const normalizeBarcodeTemplateForUi = (template) => {
    const fields = normalizeTemplateFields(template?.fields);

    return {
        ...template,
        description: getTemplateDescription(template),
        desc: getTemplateDescription(template),
        fields,
        contentScale: getTemplateContentScale({ ...template, fields }),
        width: Number(template?.width) || 40,
        height: Number(template?.height) || 25,
        perPage: Number(template?.perPage) || 1,
        barcodeFormat: template?.barcodeFormat || 'CODE128',
        isSystem: isSystemTemplate(template),
        systemKey: getTemplateSystemKey(template)
    };
};

const buildTemplateCopyName = (name = 'Template') => (
    name.endsWith(' (Copy)') ? name : `${name} (Copy)`
);

const formatCurrencyAmount = (value, decimals = 2) => {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
        return numericValue.toLocaleString('en-AE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    const fallback = String(value ?? '').trim();
    return fallback || Number(0).toFixed(decimals);
};

const CurrencySymbol = ({ currencyCode, currencyLabel }) => {
    const currencyConfig = resolveCurrencyDisplayConfig({
        currency: currencyCode,
        currencySymbol: currencyLabel
    });

    if (currencyConfig.hasImage) {
        return (
            <img
                src={UAE_DIRHAM_SYMBOL_IMAGE}
                alt={currencyConfig.ariaLabel}
                data-bb-currency-image="true"
                style={{
                    display: 'inline-block',
                    height: '0.82em',
                    width: 'auto',
                    maxWidth: '1.05em',
                    verticalAlign: '-0.08em'
                }}
            />
        );
    }

    return <>{currencyConfig.label}</>;
};

const CurrencyAmount = ({ value, currencyCode, currencyLabel, decimals = 2 }) => (
    <>
        <CurrencySymbol currencyCode={currencyCode} currencyLabel={currencyLabel} /> {formatCurrencyAmount(value, decimals)}
    </>
);

const PRINT_PAGE_WIDTH_MM = 210;
const PRINT_PAGE_HEIGHT_MM = 297;
const PRINT_PAGE_MARGIN_MM = 6;
const PRINT_LABEL_GAP_MM = 2;

const getTemplateMetrics = (template) => {
    const labelWidthMm = Math.max(1, Number(template?.width) || 40);
    const labelHeightMm = Math.max(1, Number(template?.height) || 25);
    const isRoll = (template?.type || 'Roll') === 'Roll';

    if (isRoll) {
        return {
            cols: 1,
            rows: 1,
            labelWidthMm,
            labelHeightMm,
            gapMm: 0,
            rowGapMm: 0,
            pageWidthMm: labelWidthMm,
            pageHeightMm: labelHeightMm,
            pageInnerWidthMm: labelWidthMm,
            pageInnerHeightMm: labelHeightMm,
            paddingMm: 0,
            labelsPerPage: 1
        };
    }

    const usableWidthMm = PRINT_PAGE_WIDTH_MM - (PRINT_PAGE_MARGIN_MM * 2);
    const usableHeightMm = PRINT_PAGE_HEIGHT_MM - (PRINT_PAGE_MARGIN_MM * 2);
    const cols = Math.max(1, Math.floor((usableWidthMm + PRINT_LABEL_GAP_MM) / (labelWidthMm + PRINT_LABEL_GAP_MM)));
    const rows = Math.max(1, Math.floor((usableHeightMm + PRINT_LABEL_GAP_MM) / (labelHeightMm + PRINT_LABEL_GAP_MM)));
    const labelsPerPage = Math.max(1, cols * rows);

    return {
        cols,
        rows,
        labelWidthMm,
        labelHeightMm,
        gapMm: PRINT_LABEL_GAP_MM,
        rowGapMm: PRINT_LABEL_GAP_MM,
        pageWidthMm: PRINT_PAGE_WIDTH_MM,
        pageHeightMm: PRINT_PAGE_HEIGHT_MM,
        pageInnerWidthMm: usableWidthMm,
        pageInnerHeightMm: usableHeightMm,
        paddingMm: PRINT_PAGE_MARGIN_MM,
        labelsPerPage
    };
};

// Many JsBarcode formats reject inputs that don't match their length / charset rules.
// Pick a sample value that's guaranteed to render so the preview reflects the chosen format.
const getSampleBarcodeForFormat = (format) => {
    switch ((format || 'CODE128').toUpperCase()) {
        case 'EAN13':      return '5901234123457';   // 13 digits with valid check digit
        case 'EAN8':       return '12345670';        // 8 digits with valid check digit
        case 'UPC':        return '123456789012';    // 12 digits
        case 'ITF14':      return '12345678901231';  // 14 digits
        case 'ITF':        return '1234567890';      // even-length digits
        case 'MSI':        return '1234567';
        case 'CODABAR':    return 'A12345B';
        case 'PHARMACODE': return '1234';
        case 'CODE39':     return 'SAMPLE-123';
        case 'CODE128':
        default:           return '123456789012';
    }
};

// Native render size handed to JsBarcode, BEFORE the uniform fit-to-label scaling done
// by fitBarcodeSvgToBox() below. This is intentionally fixed and generous (not derived
// from the label's mm size) so bar/space module ratios stay accurate; the physical
// on-label footprint is enforced afterwards, once, in one place.
const getBarcodeRenderOptions = (template) => ({
    format: template?.barcodeFormat || "CODE128",
    width: 2,
    height: 100,
    displayValue: false,
    margin: 4
});

// 1mm = 3.7795 CSS pixels (96 DPI).
const CSS_PX_PER_MM = 3.7795275591;

// Barcode occupies ~75-80% of the label width (with a minimum side margin) and a
// height sized off the label height, never dominating it. This is the single source
// of truth for the barcode's physical footprint on a label.
const BARCODE_WIDTH_RATIO = 0.78;
const BARCODE_SIDE_MARGIN_MIN_MM = 1.5;

const getBarcodeTargetBoxMm = (template) => {
    const labelWidthMm = Math.max(1, Number(template?.width) || 40);
    const labelHeightMm = Math.max(1, Number(template?.height) || 25);
    const contentScale = getTemplateContentScale(template);
    const isSmallHeight = labelHeightMm <= 25;
    const rawHeightMm = isSmallHeight ? 11 : (labelHeightMm < 30 ? 13 : (labelHeightMm < 60 ? 18 : 26));

    const maxWidthMm = Math.max(5, labelWidthMm - (BARCODE_SIDE_MARGIN_MIN_MM * 2));
    const widthMm = Math.max(5, Math.min(maxWidthMm, labelWidthMm * BARCODE_WIDTH_RATIO * contentScale));
    const heightMm = Math.max(5, Math.min(labelHeightMm * 0.6, rawHeightMm * contentScale));

    return { widthMm, heightMm };
};

// Uniformly scales the whole rendered SVG (both axes by the SAME factor) down to the
// target physical box, so bar proportions from JsBarcode are preserved exactly. Scaling
// width and height independently (or letting one axis stretch via flexbox/CSS while the
// other is clamped) is what previously turned short, wide bars into tall vertical smears.
const fitBarcodeSvgToBox = (svg, targetWidthMm, targetHeightMm) => {
    if (!svg?.viewBox?.baseVal) return;
    const nativeWidthPx = svg.viewBox.baseVal.width;
    const nativeHeightPx = svg.viewBox.baseVal.height;
    if (!nativeWidthPx || !nativeHeightPx) return;

    const targetWidthPx = targetWidthMm * CSS_PX_PER_MM;
    const targetHeightPx = targetHeightMm * CSS_PX_PER_MM;
    const scale = Math.min(targetWidthPx / nativeWidthPx, targetHeightPx / nativeHeightPx);

    const finalWidthMm = (nativeWidthPx * scale) / CSS_PX_PER_MM;
    const finalHeightMm = (nativeHeightPx * scale) / CSS_PX_PER_MM;

    svg.setAttribute('width', `${finalWidthMm}mm`);
    svg.setAttribute('height', `${finalHeightMm}mm`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width = `${finalWidthMm}mm`;
    svg.style.height = `${finalHeightMm}mm`;
    svg.style.maxWidth = '100%';
    svg.style.maxHeight = '100%';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    svg.style.shapeRendering = 'crispEdges';
};

const renderBarcodesInRoot = (root, options, template) => {
    if (!root?.querySelectorAll) return;
    const { widthMm, heightMm } = getBarcodeTargetBoxMm(template);

    root.querySelectorAll('svg[data-barcode]').forEach((svg) => {
        const barcodeValue = svg.getAttribute('data-barcode');
        if (!barcodeValue) return;

        try {
            JsBarcode(svg, barcodeValue, options);
            fitBarcodeSvgToBox(svg, widthMm, heightMm);
        } catch (error) {
            console.error("Barcode generation failed:", barcodeValue, error);
        }
    });
};

const BarcodePrinter = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { company } = useCompany();
    const currencyCode = company?.currency || 'AED';
    const currencyLabel = resolveCurrencyDisplayCode(company || {});
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('dual_standard_70x50');
    const [previewPage, setPreviewPage] = useState(1);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [showStockTakeModal, setShowStockTakeModal] = useState(false);
    const [stockTakeSessions, setStockTakeSessions] = useState([]);
    const [stockTakeLoading, setStockTakeLoading] = useState(false);
    const [openedStockTakeSession, setOpenedStockTakeSession] = useState(null);
    const [selectedBatchKeys, setSelectedBatchKeys] = useState({}); // key -> { selected, labelCount }
    const [stockTakeSearch, setStockTakeSearch] = useState('');
    const [stockTakeFilterStatus, setStockTakeFilterStatus] = useState('');
    const [stockTakeFilterWarehouse, setStockTakeFilterWarehouse] = useState('');
    const [allPurchaseOrders, setAllPurchaseOrders] = useState([]); // Master list
    const [displayedPurchaseOrders, setDisplayedPurchaseOrders] = useState([]); // Filtered list
    const [vendors, setVendors] = useState([]);
    const [poLoading, setPoLoading] = useState(false);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        lpoNumber: '',
        invoiceNumber: '',
        vendorId: ''
    });

    // Template Manager State
    const [templates, setTemplates] = useState(TEMPLATES.map(normalizeBarcodeTemplateForUi));
    const [showTemplateManager, setShowTemplateManager] = useState(false);
    const [managerTab, setManagerTab] = useState('browse'); // 'browse' | 'create'
    const [editingTemplate, setEditingTemplate] = useState({
        id: null,
        name: 'New Template',
        width: 40,
        height: 25,
        type: 'Roll',
        perPage: 1,
        barcodeFormat: 'CODE128',
        contentScale: DEFAULT_CONTENT_SCALE,
        fields: { ...DEFAULT_TEMPLATE_FIELDS }
    });

    const handleEditTemplate = (template, { copy = false } = {}) => {
        const normalizedTemplate = normalizeBarcodeTemplateForUi(template);
        const isFrontendFallbackTemplate = typeof normalizedTemplate.id === 'string';
        const fields = normalizeTemplateFields(normalizedTemplate.fields);
        const description = getTemplateDescription(normalizedTemplate);
        const baseTemplate = {
            ...normalizedTemplate,
            id: copy || isFrontendFallbackTemplate ? null : normalizedTemplate.id,
            name: copy ? buildTemplateCopyName(normalizedTemplate.name) : normalizedTemplate.name,
            description,
            desc: description,
            isSystem: copy ? false : normalizedTemplate.isSystem
        };

        setEditingTemplate({
            ...baseTemplate,
            barcodeFormat: normalizedTemplate.barcodeFormat || 'CODE128',
            contentScale: getTemplateContentScale({ ...normalizedTemplate, fields }),
            fields
        });
        setManagerTab('create');
        setShowTemplateManager(true);
    };

    const handleCopyTemplate = (template) => {
        handleEditTemplate(template, { copy: true });
    };

    const handleCreateNew = () => {
        setEditingTemplate({
            id: null,
            name: 'New Template',
            width: 40,
            height: 25,
            type: 'Roll',
            perPage: 1,
            barcodeFormat: 'CODE128',
            contentScale: DEFAULT_CONTENT_SCALE,
            fields: { ...DEFAULT_TEMPLATE_FIELDS }
        });
        setManagerTab('create');
        setShowTemplateManager(true);
    };

    const updateEditingField = (fieldId, value) => {
        setEditingTemplate(prev => {
            const currentFields = prev.fields || {};
            const newFields = { ...currentFields, [fieldId]: value };

            // Exclusivity logic: If turning on Barcode, turn off QR, and vice-versa
            if (fieldId === 'barcode' && value === true) newFields.qr = false;
            if (fieldId === 'qr' && value === true) newFields.barcode = false;

            return {
                ...prev,
                fields: newFields
            };
        });
    };

    const loadTemplates = async () => {
        try {
            const apiTemplates = await getBarcodeTemplates();
            const parsed = (apiTemplates || []).map(normalizeBarcodeTemplateForUi);
            const fallbackTemplates = TEMPLATES.map(normalizeBarcodeTemplateForUi);
            const hasPersistedSystemTemplates = parsed.some(t => t.isSystem);
            const nextTemplates = hasPersistedSystemTemplates
                ? parsed
                : [...fallbackTemplates, ...parsed];

            setTemplates(nextTemplates);
            setSelectedTemplate(prev => {
                if (nextTemplates.some(t => t.id === prev)) return prev;
                const persistedSystemMatch = nextTemplates.find(t => t.systemKey === prev);
                return persistedSystemMatch?.id ?? nextTemplates[0]?.id ?? prev;
            });
        } catch (e) {
            console.error("Failed to load templates", e);
            setTemplates(TEMPLATES.map(normalizeBarcodeTemplateForUi));
        }
    };

    const handleDeleteTemplate = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this template?")) return;

        try {
            await deleteBarcodeTemplate(id);
            await loadTemplates();
        } catch (e) {
            console.error("Failed to delete", e);
            alert("Failed to delete template");
        }
    };

    const saveNewTemplate = async () => {
        try {
            const contentScale = getTemplateContentScale(editingTemplate);
            const fieldsForSave = {
                ...normalizeTemplateFields(editingTemplate.fields),
                [CONTENT_SCALE_FIELD]: contentScale
            };

            // Send only fields the server cares about — drop BaseEntity audit fields
            // (createdAt/updatedAt/createdBy/updatedBy/active) so Jackson doesn't trip on them.
            const payload = {
                name: editingTemplate.name,
                description: editingTemplate.description || editingTemplate.desc || '',
                type: editingTemplate.type || 'Roll',
                width: Number(editingTemplate.width),
                height: Number(editingTemplate.height),
                perPage: Number(editingTemplate.perPage) || 1,
                barcodeFormat: editingTemplate.barcodeFormat || 'CODE128',
                fields: JSON.stringify(fieldsForSave),
            };

            let saved;
            if (typeof editingTemplate.id === 'number') {
                saved = await updateBarcodeTemplate(editingTemplate.id, payload);
            } else {
                saved = await createBarcodeTemplate(payload);
            }

            await loadTemplates();
            setSelectedTemplate(saved.id);
            setManagerTab('browse');
            alert("Template saved successfully!");
        } catch (e) {
            console.error("Failed to save template", e);
            const serverMsg = e?.response?.data?.message || e?.response?.data?.error || e?.message;
            alert(`Failed to save template${serverMsg ? `: ${serverMsg}` : ''}`);
        }
    };

    const searchRef = useRef(null);

    useEffect(() => {
        loadTemplates();
        loadProducts();
        loadVendors();

        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fetch products based on search term
    const fetchSearchedProducts = async (term) => {
        try {
            setSearchLoading(true);
            const data = await searchExactProducts(term);

            // Map the standard DTO
            const mapped = (data || []).map(d => ({
                ...d.product,
                ...d.pricing,
                price: d.pricing?.retailPrice || 0,
                ...d.inventory,
                packings: d.inventory?.packings || [],
                image: d.primaryImage
            }));

            // Filter out items without barcodes to display in the dropdown
            const productsWithBarcodes = mapped.filter(p =>
                p.packings && p.packings.some(pkg => pkg.barcode && pkg.barcode.trim() !== "")
            );

            setFilteredProducts(productsWithBarcodes);
            setIsSearchFocused(true);
        } catch (error) {
            console.error("Failed to load searched products", error);
        } finally {
            setSearchLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchTerm.trim() !== '') {
                fetchSearchedProducts(searchTerm);
            } else {
                setFilteredProducts([]);
            }
        }, 400); // 400ms debounce

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        if (location.state && location.state.printQueue) {
            const newItems = location.state.printQueue;

            setCart(prev => {
                // Check if we already have these items to avoid duplicates
                // Verify by checking if the last item added matches the new item (simple check)
                // or filter out items that are exactly the same

                const existingSignatures = new Set(prev.map(i => `${i.product.id}-${i.barcode}`));
                const uniqueNewItems = newItems.filter(item => !existingSignatures.has(`${item.product.id}-${item.barcode}`));

                if (uniqueNewItems.length === 0) return prev;
                return [...prev, ...uniqueNewItems];
            });

            // Clear state to prevent re-adding on refresh or navigation
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    useEffect(() => {
        setPreviewPage(1);

        const t = templates.find(temp => temp.id === selectedTemplate) || editingTemplate; // Check editingTemplate too
        if (!t) return;

        // If template is QR, don't generate standard barcodes as we use an icon
        if (t.name.toLowerCase().includes('qr')) return;

        const timeoutId = setTimeout(() => {
            renderBarcodesInRoot(document, getBarcodeRenderOptions(t), t);
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [cart, selectedTemplate, templates, editingTemplate]); // Added editingTemplate dependency

    const loadProducts = () => {
        // Obsolete function. Replaced by `fetchSearchedProducts` for fast dropdown search.
        // We initialize products as empty, except if we want a default empty list.
        setProducts([]);
        setLoading(false);
    };

    const loadVendors = async () => {
        try {
            const data = await getVendors();
            setVendors(data || []);
        } catch (error) {
            console.error("Failed to load vendors", error);
        }
    };

    const loadAllPurchaseOrders = async () => {
        try {
            setPoLoading(true);
            const data = await getPostedPurchaseInvoices();
            setAllPurchaseOrders(data || []);
            setDisplayedPurchaseOrders(data || []);
        } catch (error) {
            console.error("❌ Failed to fetch Purchase Invoices", error);
            console.error("❌ Error details:", error.response?.data);
        } finally {
            setPoLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = allPurchaseOrders;
        if (filters.lpoNumber) filtered = filtered.filter(po => po.lpoNumber && po.lpoNumber.toLowerCase().includes(filters.lpoNumber.toLowerCase()));
        if (filters.invoiceNumber) filtered = filtered.filter(po => po.invoiceNumber && po.invoiceNumber.toLowerCase().includes(filters.invoiceNumber.toLowerCase()));

        if (filters.vendorId) {
            const vId = Number(filters.vendorId);
            filtered = filtered.filter(po => po.vendorId === vId || po.vendor?.id === vId);
        }

        if (filters.startDate) {
            filtered = filtered.filter(po => po.date === filters.startDate);
        }

        setDisplayedPurchaseOrders(filtered);
    };

    useEffect(() => {
        if (showSearchModal) {
            loadAllPurchaseOrders();
        }
    }, [showSearchModal]);

    // Derived lists for autocomplete
    const lpoSuggestions = [...new Set(allPurchaseOrders
        .filter(p => !filters.startDate || p.date === filters.startDate)
        .map(p => p.lpoNumber)
        .filter(Boolean))].sort();

    const invoiceSuggestions = [...new Set(allPurchaseOrders
        .filter(p => !filters.startDate || p.date === filters.startDate)
        .map(p => p.invoiceNumber)
        .filter(Boolean))].sort();

    const getPurchaseItemBatches = (item) => (
        Array.isArray(item?.batches)
            ? item.batches.filter(batch => batch?.batchNumber || batch?.batchBarcode)
            : []
    );

    const getPurchaseItemBatchSummary = (item) => {
        const batches = getPurchaseItemBatches(item);
        if (batches.length === 0) return null;
        const firstBatch = batches[0]?.batchNumber || batches[0]?.batchBarcode;
        return {
            firstBatch,
            count: batches.length
        };
    };

    const addToCart = (product, qty = 1, options = {}) => {
        const batchBarcode = options.batchBarcode || options.batchNumber || null;
        const targetBarcode = options.barcode || getBarcodeValue(product) || null;

        if (!targetBarcode && !batchBarcode) return false;

        setCart(prev => {
            const cartKey = options.cartKey || [
                product?.id || product?.code || product?.name || 'item',
                targetBarcode || 'no-product-barcode',
                batchBarcode || 'no-batch-barcode'
            ].join(':');
            const existing = prev.find(item => (item.cartKey || [
                item.product?.id || item.product?.code || item.product?.name || 'item',
                item.barcode || 'no-product-barcode',
                item.batchBarcode || item.batchNumber || 'no-batch-barcode'
            ].join(':')) === cartKey);

            if (existing) return prev; // already added

            const matchedPacking = product.packings?.find(p => p.barcode === targetBarcode);
            const resolvedUnit = options.unit || matchedPacking?.unit?.name || matchedPacking?.unitName || null;

            return [...prev, {
                cartKey,
                product,
                qty,
                barcode: targetBarcode,
                productBarcode: targetBarcode,
                unit: resolvedUnit, // Store unit name for display
                batchNumber: options.batchNumber || null,
                batchBarcode,
                expiryDate: options.expiryDate || null,
                batchEnabled: options.batchEnabled ?? product.isBatch ?? product.batchEnabled ?? product.batchExpiryControlled ?? false,
                expiryEnabled: options.expiryEnabled ?? product.expiryEnabled ?? product.batchExpiryControlled ?? product.isBatch ?? false
            }];
        });
        setSearchTerm('');
        setIsSearchFocused(false);
        return true;
    };

    const openStockTakeModal = async () => {
        setShowStockTakeModal(true);
        setOpenedStockTakeSession(null);
        setSelectedBatchKeys({});
        setStockTakeLoading(true);
        try {
            const sessions = await getStockTakeSessions();
            setStockTakeSessions(Array.isArray(sessions) ? sessions : []);
        } catch (e) {
            console.error('Failed to load stock take sessions', e);
        } finally {
            setStockTakeLoading(false);
        }
    };

    const openStockTakeSession = async (sessionId) => {
        setStockTakeLoading(true);
        try {
            const data = await getStockTakeSession(sessionId);
            setOpenedStockTakeSession(data);
            // Default-select all batched rows with labelCount = batch quantity
            const initial = {};
            (data?.items || []).forEach(item => {
                (item.batches || []).forEach(b => {
                    initial[`${item.id}:${b.id}`] = { selected: true, labelCount: b.quantity || 1 };
                });
            });
            setSelectedBatchKeys(initial);
        } catch (e) {
            console.error('Failed to load stock take session', e);
        } finally {
            setStockTakeLoading(false);
        }
    };

    const loadSelectedBatchesIntoCart = () => {
        if (!openedStockTakeSession) return;
        let added = 0;
        (openedStockTakeSession.items || []).forEach(item => {
            (item.batches || []).forEach(b => {
                const key = `${item.id}:${b.id}`;
                const sel = selectedBatchKeys[key];
                if (!sel?.selected) return;
                const labels = parseInt(sel.labelCount, 10) || 1;
                const product = {
                    id: `stk-${item.productId}-${b.id}`,
                    code: item.sku,
                    name: item.productName,
                    sku: item.sku,
                    brand: item.brand || item.brandName || null,
                    brandName: item.brandName || item.brand || null,
                    price: item.price,
                    image: item.image,
                    barcode: item.barcode || null,
                    packings: item.barcode ? [{ isSale: true, barcode: item.barcode }] : [],
                    isBatch: !!item.batchEnabled,
                    batchEnabled: !!item.batchEnabled,
                    expiryEnabled: !!item.expiryEnabled,
                };
                setCart(prev => [...prev, {
                    cartKey: `stocktake-${openedStockTakeSession.id}-${item.id}-${b.id || b.batchNumber}`,
                    product,
                    qty: labels,
                    barcode: item.barcode || null,
                    productBarcode: item.barcode || null,
                    unit: null,
                    batchNumber: b.batchNumber,
                    batchBarcode: b.batchNumber,
                    expiryDate: b.expiryDate,
                    batchEnabled: !!item.batchEnabled,
                    expiryEnabled: !!item.expiryEnabled,
                }]);
                added++;
            });
        });
        if (added > 0) {
            setShowStockTakeModal(false);
            setOpenedStockTakeSession(null);
            setSelectedBatchKeys({});
        }
    };

    const loadPoItems = async (po) => {
        if (!po.items) return;

        let loadedCount = 0;
        setPoLoading(true);

        try {
            const itemCodesToFetch = [...new Set(po.items.map(i => i.itemCode).filter(Boolean))];
            const fetchedProducts = [];

            for (const code of itemCodesToFetch) {
                try {
                    const data = await searchExactProducts(code);
                    const exactMatch = (data || []).find(d => d.product && d.product.code === code);

                    if (exactMatch) {
                        fetchedProducts.push({
                            ...exactMatch.product,
                            ...exactMatch.pricing,
                            price: exactMatch.pricing?.retailPrice || 0,
                            ...exactMatch.inventory,
                            packings: exactMatch.inventory?.packings || [],
                            image: exactMatch.primaryImage
                        });
                    }
                } catch (e) {
                    console.error("Could not fetch product for PO item code: " + code, e);
                }
            }

            po.items.forEach((poItem, itemIndex) => {
                const batches = getPurchaseItemBatches(poItem);
                const fetchedProduct = fetchedProducts.find(p => p.code === poItem.itemCode);
                const fallbackProduct = {
                    id: `purchase-${po.id || po.invoiceNumber || 'invoice'}-${poItem.id || poItem.itemCode || itemIndex}`,
                    code: poItem.itemCode,
                    name: poItem.itemName || poItem.productName || poItem.itemCode || 'Purchase Item',
                    sku: poItem.itemCode,
                    price: poItem.unitCost || 0,
                    retailPrice: poItem.unitCost || 0,
                    image: poItem.image,
                    barcode: poItem.barcode || null,
                    packings: poItem.barcode ? [{ isSale: true, barcode: poItem.barcode, unitName: poItem.uom }] : [],
                    isBatch: Boolean(poItem.batchEnabled || batches.length > 0),
                    batchEnabled: Boolean(poItem.batchEnabled || batches.length > 0),
                    expiryEnabled: Boolean(batches.some(batch => batch.expiryDate))
                };
                const product = fetchedProduct || fallbackProduct;
                let selectedBarcode = poItem.barcode || getBarcodeValue(product) || null;
                let selectedUnit = poItem.uom || null;

                if (product.packings && poItem.uom) {
                    const targetUom = poItem.uom.toLowerCase();
                    const matchingPacking = product.packings.find(p =>
                        (p.unit?.name?.toLowerCase() === targetUom) ||
                        (p.unitName?.toLowerCase() === targetUom)
                    );

                    if (matchingPacking?.barcode) {
                        selectedBarcode = matchingPacking.barcode;
                        selectedUnit = matchingPacking.unit?.name || matchingPacking.unitName || selectedUnit;
                    }
                }

                const productWithPrice = {
                    ...product,
                    price: product.price || poItem.unitCost || 0,
                    retailPrice: product.retailPrice || product.price || poItem.unitCost || 0,
                    sku: product.sku || poItem.itemCode,
                    isBatch: product.isBatch || product.batchEnabled || poItem.batchEnabled || batches.length > 0,
                    batchEnabled: product.batchEnabled || product.isBatch || poItem.batchEnabled || batches.length > 0,
                    expiryEnabled: product.expiryEnabled || batches.some(batch => batch.expiryDate)
                };

                if (batches.length > 0) {
                    batches.forEach((batch, batchIndex) => {
                        const batchNumber = batch.batchNumber || batch.batchBarcode;
                        const added = addToCart(productWithPrice, batch.quantity || 1, {
                            barcode: selectedBarcode,
                            unit: selectedUnit,
                            batchNumber,
                            batchBarcode: batch.batchBarcode || batchNumber,
                            expiryDate: batch.expiryDate || null,
                            batchEnabled: true,
                            expiryEnabled: Boolean(batch.expiryDate) || productWithPrice.expiryEnabled || productWithPrice.isBatch,
                            cartKey: `purchase-${po.id || po.invoiceNumber || 'invoice'}-${poItem.id || poItem.itemCode || itemIndex}-${batch.id || batchNumber || batchIndex}`
                        });
                        if (added) loadedCount++;
                    });
                    return;
                }

                const added = addToCart(productWithPrice, poItem.qty || 1, {
                    barcode: selectedBarcode,
                    unit: selectedUnit,
                    batchNumber: poItem.batchNumber || poItem.batchNo || null,
                    expiryDate: poItem.expiryDate || poItem.exp || null,
                    batchEnabled: productWithPrice.isBatch || productWithPrice.batchEnabled || productWithPrice.expiryEnabled,
                    expiryEnabled: productWithPrice.expiryEnabled || productWithPrice.isBatch,
                    cartKey: `purchase-${po.id || po.invoiceNumber || 'invoice'}-${poItem.id || poItem.itemCode || itemIndex}-aggregate`
                });
                if (added) loadedCount++;
            });

            if (loadedCount > 0) {
                setShowSearchModal(false);
            } else {
                alert("No purchase item barcodes or batch barcodes were available to load.");
            }
        } finally {
            setPoLoading(false);
        }
    };

    const updateQty = (cartKey, delta) => {
        setCart(prev => prev.map(item => {
            if ((item.cartKey || item.product.id) === cartKey) {
                const newQty = Math.max(1, item.qty + delta);
                return { ...item, qty: newQty };
            }
            return item;
        }));
    };

    const removeFromCart = (cartKey) => {
        setCart(prev => prev.filter(item => (item.cartKey || item.product.id) !== cartKey));
    };

    const getBarcodeValue = (product) => {
        if (product && product.packings && product.packings.length > 0) {
            const saleUnit = product.packings.find(p => p.isSale && p.barcode);
            if (saleUnit) return saleUnit.barcode;
            const anyUnit = product.packings.find(p => p.barcode);
            if (anyUnit) return anyUnit.barcode;
        }
        return null;
    };

    const getProductBarcodeValue = (item) => item?.productBarcode || item?.barcode || getBarcodeValue(item?.product);
    const getBatchBarcodeValue = (item) => item?.batchBarcode || item?.batchNumber || null;
    const getProductBrandName = (product) => {
        if (!product) return null;
        if (typeof product.brand === 'string') return product.brand;
        return product.brand?.name || product.brandName || product.product?.brand?.name || product.product?.brandName || null;
    };

    const isBatchTrackingEnabled = (item) => {
        const product = item?.product || {};
        return (
            toBooleanFlag(item?.batchEnabled) ||
            toBooleanFlag(item?.batchManaged) ||
            toBooleanFlag(product?.isBatch) ||
            toBooleanFlag(product?.batchEnabled) ||
            toBooleanFlag(product?.batchManaged) ||
            toBooleanFlag(product?.batchExpiryControlled) ||
            toBooleanFlag(product?.expiryEnabled)
        );
    };

    const isExpiryTrackingEnabled = (item) => {
        const product = item?.product || {};
        return (
            toBooleanFlag(item?.expiryEnabled) ||
            toBooleanFlag(item?.batchEnabled) ||
            toBooleanFlag(product?.expiryEnabled) ||
            toBooleanFlag(product?.batchExpiryControlled) ||
            toBooleanFlag(product?.isBatch)
        );
    };

    const handlePrintZebra = async () => {
        const t = templates.find(temp => temp.id === selectedTemplate) || editingTemplate;
        if (!t || cart.length === 0) return;

        const reachable = await isBrowserPrintReachable();
        if (!reachable) {
            const host = window.location.host; // e.g. "77.37.49.42" or "app.billbull.io"
            alert(
                'Could not reach Zebra Browser Print.\n\n' +
                'Check each of these on the workstation connected to the Zebra:\n\n' +
                '1) Browser Print is installed and running (look for its icon in the system tray).\n' +
                '   Install: https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities.html\n\n' +
                '2) This site is in Browser Print\'s "Accepted Hosts" list.\n' +
                '   Open the Browser Print Settings window and add:\n' +
                `       ${host}\n` +
                '   (then close/save the dialog)\n\n' +
                '3) Visit https://localhost:9101/available once in this browser and accept the certificate prompt if shown.\n\n' +
                'Then click "Print to Zebra" again.'
            );
            return;
        }

        const companyName = company?.companyName || '';
        const isEnabled = (field) => !t.fields || typeof t.fields !== 'object' || t.fields[field];

        // Per-unit batch model: each cart entry whose batchBarcode already
        // ends in a -N suffix represents exactly one physical unit. Emitting
        // it qty times duplicates the same -N label and hides the other unit
        // suffixes the user expects (-1, -2, -3, ...). Collapse those to a
        // single label and sort the whole batch in ascending unit-index
        // order so the print matches the preview's 1, 2, 3, ... ordering.
        const UNIT_SUFFIX_RE = /^(.*)-(\d+)$/;
        const expanded = [];
        const seenUnitKeys = new Set();
        cart.forEach(item => {
            const batchKey = item.batchBarcode || item.batchNumber || '';
            if (UNIT_SUFFIX_RE.test(batchKey)) {
                if (seenUnitKeys.has(batchKey)) return;
                seenUnitKeys.add(batchKey);
                expanded.push(item);
                return;
            }
            for (let i = 0; i < (item.qty || 1); i++) expanded.push(item);
        });
        expanded.sort((a, b) => {
            const ka = a.batchBarcode || a.batchNumber || '';
            const kb = b.batchBarcode || b.batchNumber || '';
            const ma = ka.match(UNIT_SUFFIX_RE);
            const mb = kb.match(UNIT_SUFFIX_RE);
            // Group by full prefix (lot/product) first, then by unit index
            // ascending. Same-product L01 prints fully before L02, and each
            // lot's units come out 1, 2, 3, ... regardless of cart order.
            if (ma && mb) {
                if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
                return Number(ma[2]) - Number(mb[2]);
            }
            return 0;
        });

        const labels = expanded.map(item => {
            const productBarcode = isEnabled('barcode') ? (getProductBarcodeValue(item) || '') : '';
            const batchBarcode = (isEnabled('batchNumber') && isBatchTrackingEnabled(item))
                ? (getBatchBarcodeValue(item) || '')
                : '';
            const priceVal = isEnabled('price') && item?.product?.price != null
                ? `${resolveCurrencyDisplayCode(company || {})} ${formatCurrencyAmount(item.product.price, 2)}`
                : '';
            return {
                labelWidthMm: Number(t.width) || 100,
                labelHeightMm: Number(t.height) || 75,
                company: isEnabled('company') ? (item?.product?.company || companyName) : '',
                productName: isEnabled('name') ? (item?.product?.name || '') : '',
                brand: isEnabled('brandName') ? (getProductBrandName(item.product) || '') : '',
                code: isEnabled('itemCode') ? (item?.product?.code || '') : '',
                productBarcode,
                batchBarcode: batchBarcode !== productBarcode ? batchBarcode : '',
                expiry: (isEnabled('expiryDate') && isExpiryTrackingEnabled(item) && item.expiryDate) ? item.expiryDate : '',
                price: priceVal
            };
        });

        try {
            const device = await printZplBatch(labels);
            console.info('Sent ZPL to Zebra device:', device?.name);
        } catch (err) {
            console.error(err);
            alert(`Could not send to Zebra.\n\n${err.message}`);
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('print-area');
        const t = templates.find(temp => temp.id === selectedTemplate) || editingTemplate;
        if (!printContent || !t) return;

        const metrics = getTemplateMetrics(t);
        const iframe = document.createElement('iframe');
        Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        const styles = `
            <style>
                @page { margin: 0; size: ${metrics.pageWidthMm}mm ${metrics.pageHeightMm}mm; }
                html, body {
                    margin: 0;
                    padding: 0;
                    background: white;
                    width: ${metrics.pageWidthMm}mm;
                    min-width: ${metrics.pageWidthMm}mm;
                    font-family: sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                body {
                    overflow: hidden;
                }
                .print-page {
                    box-sizing: border-box;
                    width: ${metrics.pageWidthMm}mm !important;
                    min-width: ${metrics.pageWidthMm}mm;
                    min-height: ${metrics.pageHeightMm}mm;
                    padding: ${metrics.paddingMm}mm;
                    display: grid !important;
                    grid-template-columns: repeat(${metrics.cols}, ${metrics.labelWidthMm}mm);
                    grid-auto-rows: ${metrics.labelHeightMm}mm;
                    column-gap: ${metrics.gapMm}mm;
                    row-gap: ${metrics.rowGapMm}mm;
                    align-content: start;
                    justify-content: start;
                    justify-items: start;
                    page-break-after: always;
                    break-after: page;
                }
                .print-page:last-child { page-break-after: auto; break-after: auto; }
                .print-label {
                    box-sizing: border-box;
                    width: ${metrics.labelWidthMm}mm !important;
                    height: ${metrics.labelHeightMm}mm !important;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    padding: 3mm;
                    border: 0;
                    page-break-inside: avoid;
                    break-inside: avoid;
                    overflow: hidden;
                    background: white;
                }
                /* Barcode SVGs are sized explicitly (in mm) by fitBarcodeSvgToBox() before
                   printing, preserving their native aspect ratio. flex-grow must stay off
                   here — growing to fill leftover column height is what previously stretched
                   short, wide bars into tall vertical smears independent of their width. */
                svg {
                    flex: 0 0 auto;
                    max-width: 100%;
                    max-height: 100%;
                    display: block;
                    margin: 0 auto;
                    align-self: center;
                    image-rendering: pixelated;
                    shape-rendering: crispEdges;
                }
                .label-name, .label-code, .label-price, .label-unit { flex: 0 0 auto; }
                .label-name { font-size: 8px; font-weight: bold; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0; margin-bottom: 0px; line-height: 1.1; text-align: center; }
                .label-code { font-size: 7px; font-family: monospace; line-height: 1; width: 100%; text-align: center; }
                .label-price { font-size: 10px; font-weight: bold; margin-top: 1px; line-height: 1; width: 100%; text-align: center; }
                .label-unit { width: 100%; text-align: center; }
                img:not([data-bb-currency-image="true"]) { max-width: 100%; }
                [data-bb-currency-image="true"] {
                    display: inline-block;
                    height: 0.82em !important;
                    width: auto !important;
                    max-width: 1.05em !important;
                    vertical-align: -0.08em;
                }
            </style>
        `;

        doc.open();
        doc.write('<html><head><title> </title>' + styles + '</head><body>');
        doc.write(printContent.innerHTML);
        doc.write('</body></html>');
        doc.close();

        setTimeout(() => {
            renderBarcodesInRoot(doc, getBarcodeRenderOptions(t), t);
        }, 50);

        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            }, 1000);
        }, 500);
    };

    const renderLabels = (isPreview = false, templateOverride = null, itemsOverride = null) => {
        const t = templateOverride || templates.find(temp => temp.id === selectedTemplate);
        if (!t) return null;
        const companyName = company?.companyName || '';

        const isEnabled = (field) => !t.fields || typeof t.fields !== 'object' || t.fields[field];

        const allItems = [];
        const sourceItems = itemsOverride || cart;
        sourceItems.forEach(item => {
            for (let i = 0; i < item.qty; i++) allItems.push(item);
        });

        if (allItems.length === 0 && !isPreview) return null;

        // If preview mode and no items, show a sample
        if (isPreview && allItems.length === 0) {
            const sampleBarcode = getSampleBarcodeForFormat(t.barcodeFormat);
            allItems.push({
                product: {
                    id: 'sample',
                    name: 'Sample Product Name',
                    code: 'SAMPLE-123',
                    sku: 'SKU-001',
                    brand: 'Sample Brand',
                    brandName: 'Sample Brand',
                    price: '99.00',
                    packings: [{ isSale: true, barcode: sampleBarcode }],
                    company: companyName,
                    isBatch: true,
                    expiryEnabled: true
                },
                qty: 1,
                barcode: sampleBarcode,
                productBarcode: sampleBarcode,
                unit: 'PCS',
                batchNumber: 'ST-040526-WH1-STK-PRD-1',
                batchBarcode: 'ST-040526-WH1-STK-PRD-1',
                expiryDate: '2026-12-31',
                batchEnabled: true,
                expiryEnabled: true
            });
        }

        const isSmallHeight = t.height <= 25;
        const contentScale = getTemplateContentScale(t);
        const scaledPx = (value, min = 5) => `${Math.max(min, Math.round(value * contentScale * 100) / 100)}px`;
        const nameFontSize = scaledPx(isSmallHeight ? 8 : 10, 6);
        const codeFontSize = scaledPx(isSmallHeight ? 7 : 8, 5.5);
        const barcodeFontSize = scaledPx(isSmallHeight ? 10 : 12, 7);
        const priceFontSize = scaledPx(isSmallHeight ? 10 : 12, 7);
        const nameMarginBottom = isSmallHeight ? '0px' : '1px';
        const priceMarginTop = isSmallHeight ? '0px' : '1px';

        const renderLabelCard = (item, key, compactPreview = false) => {
            const productBarcodeValue = getProductBarcodeValue(item);
            const batchBarcodeValue = getBatchBarcodeValue(item);
            const showLinearBarcode = !isEnabled('qr') && isEnabled('barcode');
            const showBatchDetails = isEnabled('batchNumber') && isBatchTrackingEnabled(item) && !!batchBarcodeValue;
            const showBatchBarcode = showLinearBarcode && showBatchDetails && batchBarcodeValue !== productBarcodeValue;
            const showExpiryDate = isEnabled('expiryDate') && isExpiryTrackingEnabled(item) && !!item.expiryDate;
            const productBrandName = getProductBrandName(item.product);

            return (
                <div
                    key={key}
                    className="print-label bg-white border border-slate-200"
                    style={{
                        width: `${t.width}mm`,
                        height: `${t.height}mm`,
                        marginBottom: compactPreview ? '4px' : '0',
                        marginRight: compactPreview ? '4px' : '0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: compactPreview ? 'center' : 'stretch',
                        justifyContent: compactPreview ? 'center' : 'flex-start',
                        textAlign: compactPreview ? 'center' : 'left',
                        padding: compactPreview ? '0' : '1mm',
                        boxSizing: 'border-box'
                    }}
                >
                {isEnabled('company') && (
                    <div className="label-name" style={{ fontSize: codeFontSize, marginBottom: '2px', fontWeight: 'bold', textTransform: 'uppercase' }}>{item.product.company || companyName}</div>
                )}

                {isEnabled('name') && (
                    <div className="label-name" style={{ fontSize: nameFontSize, marginBottom: nameMarginBottom }}>{item.product.name}</div>
                )}

                {isEnabled('brandName') && productBrandName && (
                    <div className="label-code" style={{ fontSize: codeFontSize, marginBottom: '1px', fontWeight: 'bold' }}>{productBrandName}</div>
                )}

                {isEnabled('itemCode') && item.product.code && (
                    <div className="label-code" style={{ fontSize: codeFontSize, marginBottom: '1px' }}>Code: {item.product.code}</div>
                )}

                {isEnabled('qr') ? (
                    <div className="flex items-center justify-center flex-1 w-full p-0.5">
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(JSON.stringify({
                                id: item.product.id,
                                name: item.product.name,
                                price: item.product.retailPrice || item.product.price || '0.00',
                                barcode: productBarcodeValue,
                                sku: item.product.sku || item.product.code,
                                company: item.product.company || companyName
                            }))}`}
                            alt="QR Code"
                            className="w-full h-full object-contain"
                        />
                    </div>
                ) : showLinearBarcode && productBarcodeValue && (
                    <svg
                        data-barcode={productBarcodeValue}
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                    ></svg>
                )}

                {showLinearBarcode && productBarcodeValue && (
                    <div className="label-code" style={{ fontSize: barcodeFontSize, marginTop: '1px', letterSpacing: '0.08em', fontWeight: 'bold' }}>{productBarcodeValue}</div>
                )}

                {showBatchBarcode && (
                    <svg
                        data-barcode={batchBarcodeValue}
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                    ></svg>
                )}

                {showBatchBarcode && (
                    <div className="label-code" style={{ fontSize: barcodeFontSize, marginTop: '1px', letterSpacing: '0.08em', fontWeight: 'bold' }}>{batchBarcodeValue}</div>
                )}

                {showExpiryDate && (
                    <div className="label-code" style={{ fontSize: codeFontSize, marginTop: '1px' }}>Exp: {item.expiryDate}</div>
                )}

                {isEnabled('sku') && item.product.sku && (
                    <div className="label-code" style={{ fontSize: codeFontSize, marginTop: '1px' }}>{item.product.sku}</div>
                )}

                {isEnabled('unit') && (item.unit || item.product?.unit || item.product?.unitName) && (
                    <div className="label-unit" style={{ fontSize: codeFontSize, marginTop: '1px', opacity: 0.8 }}>{item.unit || item.product?.unit || item.product?.unitName}</div>
                )}

                {isEnabled('price') && (
                    <div className="label-price" style={{ fontSize: priceFontSize, marginTop: priceMarginTop }}>
                        <CurrencyAmount
                            value={item.product.retailPrice || item.product.price || '0.00'}
                            currencyCode={currencyCode}
                            currencyLabel={currencyLabel}
                        />
                    </div>
                )}
            </div>
        );
        };

        if (!isPreview) {
            const metrics = getTemplateMetrics(t);
            const pagedItems = [];

            for (let i = 0; i < allItems.length; i += metrics.labelsPerPage) {
                pagedItems.push(allItems.slice(i, i + metrics.labelsPerPage));
            }

            return (
                <>
                    {pagedItems.map((pageItems, pageIndex) => (
                        <div
                            key={`page-${pageIndex}`}
                            className="print-page"
                            style={{
                                width: `${metrics.pageWidthMm}mm`,
                                minHeight: `${metrics.pageHeightMm}mm`,
                                padding: `${metrics.paddingMm}mm`,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${metrics.cols}, ${metrics.labelWidthMm}mm)`,
                                gridAutoRows: `${metrics.labelHeightMm}mm`,
                                columnGap: `${metrics.gapMm}mm`,
                                rowGap: `${metrics.rowGapMm}mm`,
                                justifyContent: 'start',
                                justifyItems: 'start',
                                alignContent: 'start',
                                boxSizing: 'border-box',
                                pageBreakAfter: pageIndex < pagedItems.length - 1 ? 'always' : 'auto',
                                breakAfter: pageIndex < pagedItems.length - 1 ? 'page' : 'auto'
                            }}
                        >
                            {pageItems.map((item, itemIndex) => renderLabelCard(item, `${pageIndex}-${itemIndex}`, false))}
                        </div>
                    ))}
                </>
            );
        }

        const cols = t.perPage || 1;
        const totalPrintWidth = (t.width * cols) + ((cols - 1) * 2) + 2;

        return (
            <div className={`print-page ${isPreview ? 'flex flex-wrap gap-1 content-start justify-center' : ''}`} style={{ width: isPreview ? '100%' : `${totalPrintWidth}mm` }}>
                {allItems.map((item, idx) => renderLabelCard(item, idx, true))}
            </div>
        );
    };

    return (
        <div
            className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden"
            data-bb-skip-aed-symbol="true"
        >
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 shrink-0">
                <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                        <Link to="/inventory/products" className="hover:text-[#F5C742]">Inventory & Registries</Link>
                        <span>&gt;</span>
                        <span>Barcode Print & Design</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-[#F5C742]/20 p-1.5 rounded-lg text-amber-900">
                            <Barcode size={20} />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">Barcode Print & Design</h1>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-11">Design and print custom barcode labels for inventory items</p>
                </div>
                <div className="flex gap-3 flex-wrap w-full lg:w-auto">
                    <button
                        onClick={handleCreateNew}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
                    >
                        <Plus size={16} /> New Template
                    </button>
                    <button
                        onClick={() => setShowTemplateManager(true)}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
                    >
                        <Layout size={16} /> Manage Templates
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={cart.length === 0}
                        className="px-4 py-2 bg-[#F5C742]/20 text-amber-900 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Preview ({cart.reduce((a, c) => a + c.qty, 0)} Labels)
                    </button>
                    <button
                        onClick={handlePrintZebra}
                        disabled={cart.length === 0}
                        title="Send ZPL directly to the Zebra printer via Browser Print"
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Printer size={16} /> Print to Zebra
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 relative">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">

                    {/* LEFT COLUMN: Templates */}
                    <div className="col-span-1 lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <Layout className="text-[#F5C742]" size={18} />
                                <h2 className="font-bold text-slate-800">Label Templates</h2>
                            </div>
                            <p className="text-xs text-slate-500 mb-4">Choose or create custom formats</p>

                            <div className="space-y-3">
                                {templates.map(t => (
                                    <div
                                        key={t.id}
                                        onClick={() => setSelectedTemplate(t.id)}
                                        className={`
                                            p-4 rounded-lg border cursor-pointer transition-all
                                            ${selectedTemplate === t.id ? 'border-[#F5C742] bg-[#F5C742]/10 ring-1 ring-[#F5C742]' : 'border-slate-200 hover:border-slate-300'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-sm text-slate-900">{t.name}</h3>
                                            <div className="flex items-center gap-2">
                                                {!t.isSystem && (
                                                    <button
                                                        onClick={(e) => handleDeleteTemplate(t.id, e)}
                                                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                        title="Delete Template"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                                {selectedTemplate === t.id && <CheckCircle size={16} className="text-[#F5C742]" />}
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-3">{t.desc}</p>

                                        <div className="flex gap-2">
                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium border border-slate-200">
                                                {t.width}x{t.height}mm
                                            </span>
                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium border border-slate-200">
                                                {t.type}
                                            </span>
                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium border border-slate-200">
                                                {typeof t.fields === 'object' ? `${countEnabledFields(t.fields)} fields` : t.fields}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Search & Queue */}
                    <div className="col-span-1 lg:col-span-8 flex flex-col gap-4 lg:gap-6">

                        {/* Top: Search */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm shrink-0 relative z-20" ref={searchRef}>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <ShoppingBag className="text-[#F5C742]" size={18} />
                                    Load Purchase Items
                                </h2>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowSearchModal(true)}
                                        className="bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
                                    >
                                        <Search size={16} /> Purchase
                                    </button>
                                    <button
                                        onClick={openStockTakeModal}
                                        className="bg-white border border-[#F5C742] text-slate-900 font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-[#FFF8E7] transition-colors"
                                    >
                                        <Box size={16} /> Stock Taking
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mb-4">Search and select purchase orders to print labels</p>

                            <div className="flex gap-3 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/50 transition-all"
                                    placeholder="Search by product code, name, or barcode..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    onFocus={() => setIsSearchFocused(true)}
                                />

                                {/* Dropdown Results */}
                                {isSearchFocused && searchTerm && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                                        {searchLoading && filteredProducts.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-slate-500">Searching...</div>
                                        ) : filteredProducts.length > 0 ? (
                                            <>
                                                {filteredProducts.map(p => (
                                                    <div
                                                        key={p.id}
                                                        className="p-3 hover:bg-[#F5C742]/10 cursor-pointer border-b border-slate-50 last:border-0 flex items-center gap-3"
                                                        onClick={() => {
                                                            // Check if search term matches a specific packing barcode
                                                            let matchedBarcode = null;
                                                            let matchedUnit = null;
                                                            if (searchTerm && p.packings) {
                                                                const lower = searchTerm.toLowerCase();
                                                                const pkg = p.packings.find(pkg => pkg.barcode && pkg.barcode.toLowerCase().includes(lower));
                                                                if (pkg) {
                                                                    matchedBarcode = pkg.barcode;
                                                                    matchedUnit = pkg.unit?.name || pkg.unitName;
                                                                }
                                                            }

                                                            addToCart(p, 1, {
                                                                barcode: matchedBarcode,
                                                                unit: matchedUnit
                                                            });
                                                        }}
                                                    >
                                                        <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden">
                                                            {p.image ? (
                                                                <img src={getImageUrl(p.image?.url || p.image)} alt={p.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Box className="text-slate-400" size={20} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-sm text-slate-900 truncate">{p.name}</div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-xs text-slate-500 font-mono">{p.code}</span>
                                                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                                {/* Only show barcodes that actually exist */}
                                                                {p.packings && p.packings.some(pkg => pkg.barcode) && (
                                                                    <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                                                                        {p.packings.filter(pkg => pkg.barcode).slice(0, 3).map((pkg, idx) => (
                                                                            <span key={idx} className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                                {pkg.barcode}
                                                                            </span>
                                                                        ))}
                                                                        {p.packings.filter(pkg => pkg.barcode).length > 3 && (
                                                                            <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap text-xs">...</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="p-4 text-center text-sm text-slate-500">No products found for "{searchTerm}"</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Middle: Queue */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-6 shadow-sm flex flex-col" style={{ minHeight: '420px' }}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Box className="text-[#F5C742]" size={18} />
                                    Print Queue
                                </h2>
                                <div className="text-xs text-slate-500">
                                    {cart.length} items • {cart.reduce((a, c) => a + c.qty, 0)} total labels
                                </div>
                            </div>

                            <div className="overflow-y-auto custom-scrollbar bg-slate-50 rounded-lg border border-slate-200 p-2" style={{ minHeight: '320px', maxHeight: '480px' }}>
                                {cart.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                        <Box size={48} className="mb-4 text-slate-200" />
                                        <h3 className="font-medium text-slate-500">No items in print queue</h3>
                                        <p className="text-xs mt-1">Click "Search Purchase" to find and load items for barcode printing</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {cart.map(item => {
                                            const rowKey = item.cartKey || `${item.product.id}-${item.barcode || ''}-${item.batchBarcode || item.batchNumber || ''}`;
                                            const batchBarcodeValue = getBatchBarcodeValue(item);

                                            return (
                                            <div key={rowKey} className="bg-white p-3 rounded-md border border-slate-200 flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center overflow-hidden">
                                                        {item.product.image ? (
                                                            <img
                                                                src={getImageUrl(item.product.image)}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <Box size={16} className="text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-slate-900">{item.product.name}</div>
                                                        <div className="text-xs text-slate-500 flex flex-col gap-1 mt-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-600 border border-slate-200" title="Product Code">
                                                                    ID: {item.product.code}
                                                                </span>
                                                                {item.product.sku && (
                                                                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono border border-blue-100" title="SKU">
                                                                        SKU: {item.product.sku}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="font-bold text-[#F5C742]">
                                                                <CurrencyAmount
                                                                    value={item.product.retailPrice || item.product.price || '0.00'}
                                                                    currencyCode={currencyCode}
                                                                    currencyLabel={currencyLabel}
                                                                />
                                                            </div>
                                                            {batchBarcodeValue && (
                                                                <div className="text-[10px] font-mono text-amber-900 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 w-fit max-w-[240px] truncate" title={batchBarcodeValue}>
                                                                    Batch: {batchBarcodeValue}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Unit Selector */}
                                                        {item.product.packings && item.product.packings.length > 0 && (
                                                            <div className="mt-1">
                                                                <select
                                                                    className="text-[10px] bg-slate-50 border border-slate-200 rounded px-1 py-0.5 w-[140px] focus:outline-none focus:border-[#F5C742] cursor-pointer"
                                                                    value={item.barcode || getBarcodeValue(item.product) || ''}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onChange={(e) => {
                                                                        const selectedBarcode = e.target.value;
                                                                        const selectedPacking = item.product.packings.find(p => p.barcode === selectedBarcode);

                                                                        setCart(prev => prev.map(cartItem => {
                                                                            // Use reference comparison to update the specific item row
                                                                            if (cartItem === item) {
                                                                                return {
                                                                                    ...cartItem,
                                                                                    barcode: selectedBarcode,
                                                                                    productBarcode: selectedBarcode,
                                                                                    unit: selectedPacking ? (selectedPacking.unit?.name || selectedPacking.unitName) : null
                                                                                };
                                                                            }
                                                                            return cartItem;
                                                                        }));
                                                                    }}
                                                                >
                                                                    {item.product.packings
                                                                        .filter(p => p.barcode)
                                                                        .map((p, idx) => (
                                                                            <option key={idx} value={p.barcode}>
                                                                                {p.unit?.name || p.unitName || `Unit ${idx + 1}`} ({p.barcode})
                                                                            </option>
                                                                        ))}
                                                                    {/* Fallback option if current barcode is not in packings */}
                                                                    {!item.product.packings.some(p => p.barcode === (item.barcode || getBarcodeValue(item.product))) && (item.barcode || getBarcodeValue(item.product)) && (
                                                                        <option value={item.barcode || getBarcodeValue(item.product)}>{item.unit || 'Default'} ({item.barcode || getBarcodeValue(item.product)})</option>
                                                                    )}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center border border-slate-200 rounded-md bg-white">
                                                        <button className="px-2 py-1 hover:bg-slate-50 text-slate-500" onClick={() => updateQty(rowKey, -1)}><Minus size={14} /></button>
                                                        <input
                                                            type="text"
                                                            className="w-10 text-center text-sm font-bold text-slate-700 outline-none"
                                                            value={item.qty}
                                                            readOnly
                                                        />
                                                        <button className="px-2 py-1 hover:bg-slate-50 text-slate-500" onClick={() => updateQty(rowKey, 1)}><Plus size={14} /></button>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFromCart(rowKey)}
                                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom: Preview — always shows ONE representative label, not the whole queue.
                            Uses the first cart item if any (so users can see real data on the label),
                            otherwise falls back to the built-in sample. */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm shrink-0">
                            <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-2 text-sm">
                                <Send className="text-[#F5C742]" size={16} />
                                Template Preview
                                {cart.length > 0 && (
                                    <span className="text-[10px] font-medium text-slate-400 ml-1">
                                        (showing first item — full queue prints when you click Print)
                                    </span>
                                )}
                            </h2>
                            <div className="bg-slate-100 rounded border border-slate-200 flex items-center justify-center overflow-hidden relative" style={{ minHeight: '280px' }}>
                                <div className="origin-center" key={selectedTemplate}>
                                    {renderLabels(true, null, cart.length > 0 ? [{ ...cart[0], qty: 1 }] : null)}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* SEARCH MODAL */}
                {showStockTakeModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Load from Stock Taking</h3>
                                    <p className="text-xs text-slate-500">
                                        {openedStockTakeSession
                                            ? `Session ${openedStockTakeSession.sessionId} — select batches to print`
                                            : 'Pick a stock take session'}
                                    </p>
                                </div>
                                <button onClick={() => setShowStockTakeModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5">
                                {stockTakeLoading && (
                                    <div className="text-center text-sm text-slate-500 py-8">Loading...</div>
                                )}

                                {!stockTakeLoading && !openedStockTakeSession && (() => {
                                    const allStatuses = [...new Set(stockTakeSessions.map(s => s.status).filter(Boolean))];
                                    const allWarehouses = [...new Set(stockTakeSessions.map(s => s.warehouseName).filter(Boolean))];
                                    const filteredStockTakeSessions = stockTakeSessions.filter(s => {
                                        const q = stockTakeSearch.trim().toLowerCase();
                                        const matchesSearch = !q ||
                                            (s.sessionId && s.sessionId.toLowerCase().includes(q)) ||
                                            (s.warehouseName && s.warehouseName.toLowerCase().includes(q));
                                        const matchesStatus = !stockTakeFilterStatus || s.status === stockTakeFilterStatus;
                                        const matchesWarehouse = !stockTakeFilterWarehouse || s.warehouseName === stockTakeFilterWarehouse;
                                        return matchesSearch && matchesStatus && matchesWarehouse;
                                    });
                                    return (
                                        <div className="space-y-3">
                                            {/* Search + Filter bar */}
                                            <div className="flex flex-col gap-2">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                    <input
                                                        type="text"
                                                        placeholder="Search by session ID or warehouse..."
                                                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/40 transition-all"
                                                        value={stockTakeSearch}
                                                        onChange={e => setStockTakeSearch(e.target.value)}
                                                    />
                                                    {stockTakeSearch && (
                                                        <button
                                                            onClick={() => setStockTakeSearch('')}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <select
                                                        className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#F5C742] bg-white text-slate-700"
                                                        value={stockTakeFilterStatus}
                                                        onChange={e => setStockTakeFilterStatus(e.target.value)}
                                                    >
                                                        <option value="">All Statuses</option>
                                                        {allStatuses.map(st => (
                                                            <option key={st} value={st}>{st}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#F5C742] bg-white text-slate-700"
                                                        value={stockTakeFilterWarehouse}
                                                        onChange={e => setStockTakeFilterWarehouse(e.target.value)}
                                                    >
                                                        <option value="">All Warehouses</option>
                                                        {allWarehouses.map(wh => (
                                                            <option key={wh} value={wh}>{wh}</option>
                                                        ))}
                                                    </select>
                                                    {(stockTakeSearch || stockTakeFilterStatus || stockTakeFilterWarehouse) && (
                                                        <button
                                                            onClick={() => { setStockTakeSearch(''); setStockTakeFilterStatus(''); setStockTakeFilterWarehouse(''); }}
                                                            className="px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1 whitespace-nowrap"
                                                        >
                                                            <RefreshCw size={11} /> Reset
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] text-slate-400 font-medium">
                                                        {filteredStockTakeSessions.length} of {stockTakeSessions.length} sessions
                                                    </p>
                                                    {filteredStockTakeSessions.length === 0 && stockTakeSessions.length > 0 && (
                                                        <p className="text-[10px] text-amber-600 font-semibold">No sessions match your filters</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Session list */}
                                            <div className="space-y-2">
                                                {stockTakeSessions.length === 0 ? (
                                                    <div className="text-center text-sm text-slate-500 py-8">No stock take sessions found.</div>
                                                ) : filteredStockTakeSessions.length === 0 ? (
                                                    <div className="text-center text-sm text-slate-400 py-6">
                                                        <Filter size={28} className="mx-auto mb-2 opacity-30" />
                                                        No sessions match your search or filters.
                                                    </div>
                                                ) : filteredStockTakeSessions.map(s => {
                                                    const batchCount = (s.items || []).reduce(
                                                        (n, i) => n + ((i.batches || []).length), 0
                                                    );
                                                    const statusColor = s.status === 'COMPLETED'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : s.status === 'IN_PROGRESS'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-slate-100 text-slate-600';
                                                    return (
                                                        <button
                                                            key={s.id}
                                                            onClick={() => openStockTakeSession(s.sessionId)}
                                                            className="w-full text-left p-3 bg-slate-50 hover:bg-[#FFF8E7] rounded-lg border border-slate-200 flex items-center justify-between transition-colors"
                                                        >
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-0.5">
                                                                    <span className="font-bold text-sm text-slate-900">{s.sessionId}</span>
                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${statusColor}`}>
                                                                        {s.status}
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {s.warehouseName} &bull; {(s.items || []).length} items, {batchCount} batches
                                                                </div>
                                                            </div>
                                                            <ChevronRight size={16} className="text-slate-400" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {!stockTakeLoading && openedStockTakeSession && (
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => { setOpenedStockTakeSession(null); setSelectedBatchKeys({}); }}
                                            className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                                        >
                                            <ArrowLeft size={12} /> Back to sessions
                                        </button>

                                        {(openedStockTakeSession.items || []).filter(it => (it.batches || []).length > 0).length === 0 && (
                                            <div className="text-center text-sm text-slate-500 py-6">
                                                No batched items in this session.
                                            </div>
                                        )}

                                        {(openedStockTakeSession.items || []).map(item => {
                                            if (!item.batches || item.batches.length === 0) return null;
                                            return (
                                                <div key={item.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                                                        <div className="text-sm font-bold text-slate-900">{item.productName}</div>
                                                        <div className="text-[11px] text-slate-500">Code: {item.sku}</div>
                                                    </div>
                                                    <table className="bb-nowrap-table w-full text-xs">
                                                        <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
                                                            <tr>
                                                                <th className="px-3 py-1.5 w-8"></th>
                                                                <th className="px-3 py-1.5 text-left">Batch #</th>
                                                                <th className="px-3 py-1.5 text-left">Expiry</th>
                                                                <th className="px-3 py-1.5 text-right">Qty</th>
                                                                <th className="px-3 py-1.5 text-right">Labels</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {item.batches.map(b => {
                                                                const key = `${item.id}:${b.id}`;
                                                                const sel = selectedBatchKeys[key] || { selected: false, labelCount: b.quantity || 1 };
                                                                return (
                                                                    <tr key={b.id} className="border-t border-slate-100">
                                                                        <td className="px-3 py-1.5">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={!!sel.selected}
                                                                                onChange={(e) => setSelectedBatchKeys(prev => ({
                                                                                    ...prev,
                                                                                    [key]: { ...sel, selected: e.target.checked }
                                                                                }))}
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-1.5 font-mono text-[11px]">{b.batchNumber}</td>
                                                                        <td className="px-3 py-1.5">{b.expiryDate || '—'}</td>
                                                                        <td className="px-3 py-1.5 text-right">{b.quantity}</td>
                                                                        <td className="px-3 py-1.5 text-right">
                                                                            <input
                                                                                type="number"
                                                                                min={1}
                                                                                value={sel.labelCount}
                                                                                onChange={(e) => setSelectedBatchKeys(prev => ({
                                                                                    ...prev,
                                                                                    [key]: { ...sel, labelCount: e.target.value }
                                                                                }))}
                                                                                className="w-16 border border-slate-200 rounded px-1 py-0.5 text-[11px] text-right"
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
                                <button
                                    onClick={() => setShowStockTakeModal(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                                >
                                    Close
                                </button>
                                {openedStockTakeSession && (
                                    <button
                                        onClick={loadSelectedBatchesIntoCart}
                                        className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded-lg"
                                    >
                                        Load Selected Batches
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {showSearchModal && (
                    <div className="absolute inset-0 z-50 bg-white/10 backdrop-blur-sm flex items-center justify-center p-6">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <Search className="text-[#F5C742]" size={20} />
                                        Search & Load Purchase Orders
                                    </h2>
                                    <p className="text-xs text-slate-500">Search by date, LPO number, invoice number, or vendor name</p>
                                </div>
                                <button onClick={() => setShowSearchModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="p-6 pb-2 border-b border-slate-100 space-y-4">
                                <datalist id="lpoNumbers">
                                    {lpoSuggestions.map(num => <option key={num} value={num} />)}
                                </datalist>
                                <datalist id="invoiceNumbers">
                                    {invoiceSuggestions.map(num => <option key={num} value={num} />)}
                                </datalist>

                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Calendar size={10} /> Purchase Date</label>
                                        <input
                                            type="date"
                                            className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-[#F5C742] outline-none"
                                            value={filters.startDate}
                                            onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><FileText size={10} /> LPO Number</label>
                                        <input
                                            type="text"
                                            list="lpoNumbers"
                                            placeholder="e.g. LPO-2024..."
                                            className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-[#F5C742] outline-none"
                                            value={filters.lpoNumber}
                                            onChange={e => setFilters({ ...filters, lpoNumber: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><FileText size={10} /> Invoice Number</label>
                                        <input
                                            type="text"
                                            list="invoiceNumbers"
                                            placeholder="e.g. PI-2024..."
                                            className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-[#F5C742] outline-none"
                                            value={filters.invoiceNumber}
                                            onChange={e => setFilters({ ...filters, invoiceNumber: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Filter size={10} /> Vendor Name</label>
                                        <select
                                            className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-[#F5C742] outline-none bg-white"
                                            value={filters.vendorId}
                                            onChange={e => setFilters({ ...filters, vendorId: e.target.value })}
                                        >
                                            <option value="">All Vendors</option>
                                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={applyFilters}
                                        className="flex-1 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-xs font-bold py-2 rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Search size={14} /> Search
                                    </button>
                                    <button
                                        onClick={() => {
                                            setFilters({ startDate: '', endDate: '', lpoNumber: '', invoiceNumber: '', vendorId: '' });
                                            setDisplayedPurchaseOrders(allPurchaseOrders);
                                        }}
                                        className="px-4 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <RefreshCw size={14} /> Reset Filters
                                    </button>
                                </div>
                                {displayedPurchaseOrders.length > 0 && <p className="text-right text-[10px] text-slate-400 font-bold">{displayedPurchaseOrders.length} Purchases Found</p>}
                            </div>

                            {/* Results */}
                            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-4 custom-scrollbar">
                                {poLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                        <Loader className="animate-spin text-[#F5C742]" size={32} />
                                        <span className="text-xs">Loading orders...</span>
                                    </div>
                                ) : displayedPurchaseOrders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-50">
                                        <ShoppingBag size={48} />
                                        <span className="text-sm font-medium">No purchase orders found</span>
                                    </div>
                                ) : (
                                    displayedPurchaseOrders.map(po => (
                                        <div key={po.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-bold text-slate-900">{po.lpoNumber || po.referenceNo || 'PO-' + po.id}</span>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${po.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {po.status || 'Draft'}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-500">
                                                        <div className="flex gap-1"><span className="font-semibold text-slate-700">Invoice:</span> <span className="font-mono">{po.invoiceNumber}</span></div>
                                                        <div className="flex gap-1"><span className="font-semibold text-slate-700">Ref:</span> <span className="font-mono">{po.vendorInvoiceNo || po.referenceNo || '-'}</span></div>
                                                        <div className="flex gap-1 col-span-2"><span className="font-semibold text-slate-700">Vendor:</span> <span className="font-medium text-slate-900">{po.vendorName || vendors.find(v => v.id === po.vendorId)?.name || 'Unknown'}</span></div>
                                                        <div className="flex gap-1"><span className="font-semibold text-slate-700">Date:</span> {po.invoiceDate}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => loadPoItems(po)}
                                                    className="bg-[#F5C742]/20 hover:bg-amber-200 text-amber-900 text-xs font-bold px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
                                                >
                                                    <Plus size={14} /> Load All Items
                                                </button>
                                            </div>

                                            {/* Preview of Items */}
                                            {po.items && po.items.length > 0 && (
                                                <div className="border-t border-slate-100 pt-3">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                                                            {po.items.length} Items
                                                        </p>
                                                        <p className="text-xs font-bold text-[#F5C742]">
                                                            Total: <CurrencyAmount
                                                                value={po.grandTotal || '0.00'}
                                                                currencyCode={currencyCode}
                                                                currencyLabel={currencyLabel}
                                                            />
                                                        </p>
                                                    </div>

                                                    {/* Table Header */}
                                                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 rounded-t-lg border border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                                                        <div className="col-span-5">Item</div>
                                                        <div className="col-span-2 text-center">Qty</div>
                                                        <div className="col-span-3 text-center">Barcode</div>
                                                        <div className="col-span-2 text-right">Unit Cost</div>
                                                    </div>

                                                    {/* Table Body */}
                                                    <div className="border-x border-b border-slate-200 rounded-b-lg overflow-hidden">
                                                        {po.items.map((item, idx) => {
                                                            const prod = products.find(p => p.code === item.itemCode);
                                                            const batchSummary = getPurchaseItemBatchSummary(item);

                                                            // Fallback: Show item even if product not found
                                                            const displayName = prod?.name || item.itemName || 'Unknown Item';
                                                            const displaySku = prod?.sku || item.itemCode || '-';
                                                            const displayBarcode = batchSummary?.firstBatch || item.barcode || (prod ? getBarcodeValue(prod) : null) || '-';

                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className={`grid grid-cols-12 gap-2 px-3 py-2.5 text-xs items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                                                                        } hover:bg-amber-50 transition-colors`}
                                                                >
                                                                    {/* Item Name & Image */}
                                                                    <div className="col-span-5 flex items-center gap-2">
                                                                        <div className="h-8 w-8 shrink-0 bg-white rounded border border-slate-200 flex items-center justify-center overflow-hidden">
                                                                            {prod?.image ? (
                                                                                <img
                                                                                    src={getImageUrl(prod.image)}
                                                                                    alt=""
                                                                                    className="h-full w-full object-cover"
                                                                                />
                                                                            ) : (
                                                                                <Box size={12} className="text-slate-300" />
                                                                            )}
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="font-bold text-slate-800 truncate">{displayName}</div>
                                                                            <div className="text-[9px] text-slate-500">SKU: {displaySku}</div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Quantity */}
                                                                    <div className="col-span-2 text-center">
                                                                        <span className="font-bold text-slate-700">{item.qty}</span>
                                                                        <span className="text-[10px] text-slate-500 ml-1">{item.uom}</span>
                                                                    </div>

                                                                    {/* Barcode */}
                                                                    <div className="col-span-3 text-center">
                                                                        <div className="flex flex-col items-center gap-1 min-w-0">
                                                                            <span
                                                                                className={`font-mono text-[10px] px-2 py-0.5 rounded max-w-full truncate ${batchSummary ? 'text-amber-900 bg-amber-50 border border-amber-100' : 'text-slate-600 bg-slate-100'}`}
                                                                                title={displayBarcode}
                                                                            >
                                                                                {displayBarcode}
                                                                            </span>
                                                                            {batchSummary?.count > 1 && (
                                                                                <span className="text-[9px] text-slate-400">
                                                                                    +{batchSummary.count - 1} batch labels
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Unit Cost */}
                                                                    <div className="col-span-2 text-right font-mono font-bold text-[#F5C742]">
                                                                        <CurrencyAmount
                                                                            value={item.unitCost}
                                                                            currencyCode={currencyCode}
                                                                            currencyLabel={currencyLabel}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* TEMPLATE MANAGER MODAL */}
                {
                    showTemplateManager && (
                        <div className="absolute inset-0 z-50 bg-white/10 backdrop-blur-sm flex items-center justify-center p-6">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-slate-200">
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                            <Layout className="text-[#F5C742]" size={20} />
                                            Template Manager
                                        </h2>
                                        <p className="text-xs text-slate-500">Create new templates, browse and edit existing templates</p>
                                    </div>
                                    <button onClick={() => setShowTemplateManager(false)} className="text-slate-400 hover:text-slate-600">
                                        <X size={24} />
                                    </button>
                                </div>

                                {/* Main Content */}
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    {/* Tabs/Toolbar */}
                                    <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-4 bg-white">
                                        <button
                                            onClick={() => setManagerTab('create')}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${managerTab === 'create' ? 'bg-[#F5C742] text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            <Plus size={14} /> Create Template
                                        </button>
                                        <button
                                            onClick={() => setManagerTab('browse')}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${managerTab === 'browse' ? 'bg-[#F5C742] text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            <Grid size={14} /> Browse Templates
                                        </button>
                                    </div>

                                    {/* Content Area */}
                                    <div className="flex-1 overflow-hidden bg-slate-50 p-6">
                                        {managerTab === 'browse' ? (
                                            <div className="h-full flex flex-col">
                                                {/* Search in Browse */}
                                                <div className="mb-4 flex gap-2">
                                                    <div className="relative flex-1">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                        <input
                                                            type="text"
                                                            placeholder="Search templates by name, description, size..."
                                                            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:border-[#F5C742] outline-none"
                                                        />
                                                    </div>
                                                    <div className="bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 flex items-center">
                                                        {templates.length} templates
                                                    </div>
                                                </div>

                                                {/* Grid */}
                                                <div className="grid grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pb-10">
                                                    {templates.map(t => (
                                                        <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
                                                            <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-center h-32 border border-slate-100 relative overflow-hidden">
                                                                {/* Mini Preview */}
                                                                <div className="bg-white border border-slate-300 shadow-sm flex flex-col items-center justify-center p-1"
                                                                    style={{ width: '80px', height: `${(t.height / t.width) * 80}px`, maxHeight: '100px' }}>
                                                                    <div className="w-full h-1 bg-slate-800 mb-1 opacity-20"></div>
                                                                    <div className="w-1/2 h-1 bg-slate-800 mb-1 opacity-20"></div>
                                                                    <Barcode className="opacity-20" size={24} />
                                                                </div>
                                                                {t.id === selectedTemplate && (
                                                                    <div className="absolute top-2 right-2 bg-[#F5C742] text-white p-1 rounded-full">
                                                                        <CheckCircle size={14} />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div>
                                                                <h3 className="font-bold text-slate-900 text-sm">{t.name}</h3>
                                                                <p className="text-xs text-slate-500">{t.desc}</p>
                                                            </div>

                                                            <div className="flex flex-wrap gap-1 mt-auto">
                                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-600 border border-slate-200">{t.width}x{t.height}mm</span>
                                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-600 border border-slate-200">{t.type}</span>
                                                            </div>

                                                            <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-slate-100">
                                                                <button
                                                                    onClick={() => { setSelectedTemplate(t.id); setShowTemplateManager(false); }}
                                                                    className="py-1.5 rounded-md text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700"
                                                                >
                                                                    Select
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditTemplate(t)}
                                                                    className="py-1.5 rounded-md text-xs font-bold bg-[#F5C742]/20 text-amber-900 hover:bg-amber-200 flex items-center justify-center gap-1"
                                                                >
                                                                    <Layout size={12} /> Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCopyTemplate(t)}
                                                                    className="py-1.5 rounded-md text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1"
                                                                >
                                                                    <Plus size={12} /> Copy
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-full grid grid-cols-12 gap-6">
                                                {/* Left: Attributes */}
                                                <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-0 flex flex-col h-full overflow-hidden">
                                                    <div className="p-4 border-b border-slate-100">
                                                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                            <Tag size={16} className="text-[#F5C742]" /> Select Attributes
                                                        </h3>
                                                        <p className="text-xs text-slate-500 mt-1">Check to enable fields</p>
                                                    </div>
                                                    <div className="p-4 space-y-3 overflow-y-auto">
                                                        {[
                                                            { id: 'barcode', label: 'Barcode', icon: <Barcode size={14} /> },
                                                            { id: 'qr', label: 'QR Code', icon: <Grid size={14} />, sub: 'Cannot use with Barcode' },
                                                            { id: 'name', label: 'Product Name', icon: <Tag size={14} /> },
                                                            { id: 'itemCode', label: 'Item Code', icon: <Tag size={14} /> },
                                                            { id: 'brandName', label: 'Brand Name', icon: <Tag size={14} /> },
                                                            { id: 'sku', label: 'SKU Code', icon: <Box size={14} /> },
                                                            { id: 'unit', label: 'Unit', icon: <Box size={14} /> },
                                                            { id: 'price', label: 'Selling Price', icon: <span className="font-bold text-xs">$</span> },
                                                            { id: 'company', label: 'Company Name', icon: <FileText size={14} /> },
                                                            { id: 'batchNumber', label: 'Batch No + Barcode', icon: <Barcode size={14} />, sub: 'Shows only for batch-enabled items' },
                                                            { id: 'expiryDate', label: 'Expiry Date', icon: <Calendar size={14} />, sub: 'Shows only for expiry-enabled items' },
                                                        ].map(attr => (
                                                            <div
                                                                key={attr.id}
                                                                className={`
                                                                    border rounded-lg p-3 cursor-pointer transition-all hover:bg-slate-50
                                                                    ${editingTemplate.fields?.[attr.id] ? 'border-[#F5C742] bg-[#F5C742]/10 ring-1 ring-[#F5C742]/50' : 'border-slate-200 opacity-80'}
                                                                `}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    updateEditingField(attr.id, !editingTemplate.fields?.[attr.id]);
                                                                }}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${editingTemplate.fields?.[attr.id] ? 'bg-[#F5C742] border-[#F5C742]' : 'bg-white border-slate-300'}`}>
                                                                        {editingTemplate.fields?.[attr.id] && <CheckCircle size={10} className="text-white" />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                                                                            {attr.icon} {attr.label}
                                                                        </div>
                                                                        {attr.sub && <div className="text-[9px] text-red-400 mt-0.5">{attr.sub}</div>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="p-4 border-t border-slate-100 mt-auto">
                                                        <p className="text-xs text-slate-500 text-center">{countEnabledFields(editingTemplate.fields)} attributes selected</p>
                                                    </div>
                                                </div>

                                                {/* Middle: Preview */}
                                                <div className="col-span-6 flex flex-col gap-4">
                                                    {/* Size Presets */}
                                                    <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-center gap-2">
                                                        {['Standard 40x25', 'Medium 50x30', 'Large 70x40', 'Square 40x40'].map(preset => (
                                                            <button
                                                                key={preset}
                                                                onClick={() => {
                                                                    const [type, size] = preset.split(' ');
                                                                    const [w, h] = size.split('x').map(Number);
                                                                    setEditingTemplate({ ...editingTemplate, width: w, height: h });
                                                                }}
                                                                className="px-3 py-1.5 text-[10px] font-bold border border-slate-200 rounded hover:bg-slate-50 text-slate-600"
                                                            >
                                                                {preset}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Canvas */}
                                                    <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 flex items-center justify-center p-8 relative overflow-hidden group">
                                                        <div className="absolute top-4 left-4 text-xs font-mono text-slate-500 opacity-50">
                                                            {editingTemplate.width}mm x {editingTemplate.height}mm
                                                        </div>

                                                        {/* ACTUAL LABEL RENDER - Uses shared logic now */}
                                                        <div className="flex items-center justify-center">
                                                            {(() => {
                                                                const sampleBarcode = getSampleBarcodeForFormat(editingTemplate.barcodeFormat);
                                                                return renderLabels(true, editingTemplate, [{
                                                                    product: {
                                                                        id: 'sample',
                                                                        name: 'Sample Product Name',
                                                                        code: 'SAMPLE-123',
                                                                        sku: 'SKU-001',
                                                                        brand: 'Sample Brand',
                                                                        brandName: 'Sample Brand',
                                                                        price: '99.00',
                                                                        packings: [{ isSale: true, barcode: sampleBarcode }],
                                                                        company: company?.companyName || '',
                                                                        isBatch: true,
                                                                        expiryEnabled: true
                                                                    },
                                                                    qty: 1,
                                                                    barcode: sampleBarcode,
                                                                    productBarcode: sampleBarcode,
                                                                    unit: 'PCS',
                                                                    batchNumber: 'ST-040526-WH1-STK-PRD-1',
                                                                    batchBarcode: 'ST-040526-WH1-STK-PRD-1',
                                                                    expiryDate: '2026-12-31',
                                                                    batchEnabled: true,
                                                                    expiryEnabled: true
                                                                }]);
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Summary & Save */}
                                                <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
                                                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex-1 overflow-y-auto min-h-0">
                                                        <h3 className="font-bold text-slate-800 text-sm mb-4">Template Summary</h3>

                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Template Name</label>
                                                                <input
                                                                    type="text"
                                                                    className="w-full border-b border-slate-200 py-1 text-sm font-bold text-slate-900 focus:border-[#F5C742] outline-none"
                                                                    value={editingTemplate.name}
                                                                    onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Width (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full border-b border-slate-200 py-1 text-sm font-bold text-slate-900 focus:border-[#F5C742] outline-none"
                                                                        value={editingTemplate.width}
                                                                        onChange={e => setEditingTemplate({ ...editingTemplate, width: Number(e.target.value) })}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Height (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full border-b border-slate-200 py-1 text-sm font-bold text-slate-900 focus:border-[#F5C742] outline-none"
                                                                        value={editingTemplate.height}
                                                                        onChange={e => setEditingTemplate({ ...editingTemplate, height: Number(e.target.value) })}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                        <SlidersHorizontal size={12} /> Content Size
                                                                    </label>
                                                                    <span className="text-[10px] font-bold text-slate-500">
                                                                        {Math.round(getTemplateContentScale(editingTemplate) * 100)}%
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min={MIN_CONTENT_SCALE}
                                                                    max={MAX_CONTENT_SCALE}
                                                                    step="0.05"
                                                                    className="w-full accent-[#F5C742]"
                                                                    value={getTemplateContentScale(editingTemplate)}
                                                                    onChange={e => {
                                                                        const nextScale = clampContentScale(e.target.value);
                                                                        setEditingTemplate(prev => ({
                                                                            ...prev,
                                                                            contentScale: nextScale,
                                                                            fields: {
                                                                                ...normalizeTemplateFields(prev.fields),
                                                                                [CONTENT_SCALE_FIELD]: nextScale
                                                                            }
                                                                        }));
                                                                    }}
                                                                />
                                                            </div>

                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Layout Style</label>
                                                                <select
                                                                    className="w-full border-b border-slate-200 py-1 text-sm font-bold text-slate-900 focus:border-[#F5C742] outline-none bg-white"
                                                                    value={editingTemplate.perPage}
                                                                    onChange={e => setEditingTemplate({ ...editingTemplate, perPage: Number(e.target.value) })}
                                                                >
                                                                    <option value={1}>1 Column (Single)</option>
                                                                    <option value={2}>2 Column (Double)</option>
                                                                    <option value={3}>3 Column (Triple)</option>
                                                                </select>
                                                            </div>

                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Barcode Format</label>
                                                                <select
                                                                    className="w-full border-b border-slate-200 py-1 text-sm font-bold text-slate-900 focus:border-[#F5C742] outline-none bg-white"
                                                                    value={editingTemplate.barcodeFormat || 'CODE128'}
                                                                    onChange={e => setEditingTemplate({ ...editingTemplate, barcodeFormat: e.target.value })}
                                                                >
                                                                    <option value="CODE128">Code 128 (default, alphanumeric)</option>
                                                                    <option value="EAN13">EAN-13 (13-digit retail)</option>
                                                                    <option value="EAN8">EAN-8 (8-digit short)</option>
                                                                    <option value="UPC">UPC-A (12-digit US retail)</option>
                                                                    <option value="CODE39">Code 39 (industrial)</option>
                                                                    <option value="ITF14">ITF-14 (cartons)</option>
                                                                    <option value="ITF">ITF (interleaved)</option>
                                                                    <option value="MSI">MSI</option>
                                                                    <option value="codabar">Codabar</option>
                                                                    <option value="pharmacode">Pharmacode</option>
                                                                </select>
                                                                <p className="text-[10px] text-slate-400 mt-1">
                                                                    EAN-13 needs exactly 13 digits, EAN-8 needs 8, UPC needs 12. Use Code 128 for general use.
                                                                </p>
                                                            </div>

                                                            <div className="bg-[#F5C742]/10 rounded-lg p-3 border border-[#F5C742]/20 text-xs text-amber-900">
                                                                <strong>Note:</strong> Template layouts are saved to the server and used by preview, browser print, and Zebra print.
                                                            </div>
                                                        </div>

                                                    </div>
                                                    <div className="flex flex-col gap-2 shrink-0">
                                                        <button
                                                            onClick={saveNewTemplate}
                                                            className="w-full py-3 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                                                        >
                                                            <Save size={18} /> Save Template
                                                        </button>
                                                        <button
                                                            onClick={() => setManagerTab('browse')}
                                                            className="w-full py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                                                        >
                                                            Back to Browse
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Hidden Print Area */}
                <div id="print-area" className="hidden">
                    {renderLabels(false)}
                </div>

            </div>
        </div>
    );
};

export default BarcodePrinter;
