import JsBarcode from 'jsbarcode';
import { getImageUrl } from './urlUtils';
import {
    DEFAULT_TEMPLATE_COLUMNS,
    DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
    parsePrintTemplateObject,
    sanitizeTemplateColumns,
    sanitizeTemplateDisplayOptions
} from './printTemplateConfig';
import { generateDocFilename } from './filenameUtils';
import {
    resolveCurrencyDisplayConfig,
    UAE_DIRHAM_SYMBOL_IMAGE
} from './countryCurrencyOptions';
import { generatePickListHtml } from './pickListPrintTemplate';

const PURCHASE_TEMPLATE_CATEGORIES = new Set([
    'Local Purchase Order',
    'Goods Receipt Note',
    'Purchase Invoice',
    'Payment Voucher',
    'Goods Return Voucher',
    'Purchase Return',
    'Debit Note',
    'Customer Statement of Account',
    'Vendor Statement of Account',
    'Cheque'
]);

const LEFT_META_LABEL_PATTERNS = /^(P\.O|PO Number|Purchase Order|Account Executive|Salesperson|Sales Person|Buyer|Prepared By)$/i;
const HIDDEN_HEADER_LABEL_PATTERNS = /^(Status|Approval Status|QC Status|Posted)$/i;

const DOC_NO_LABELS = {
    'Quotation': 'Quote Number',
    'Sales Invoice': 'Invoice Number',
    'Sales Order (SO)': 'Sales Order',
    'Delivery Note (DO/DN)': 'Delivery Note',
    'Proforma Invoice (PI)': 'Proforma Invoice',
    'Sales Return': 'Credit Note',
    'Local Purchase Order': 'LPO Number',
    'Goods Receipt Note': 'GRN Number',
    'Purchase Invoice': 'Invoice Number',
    'Payment Voucher': 'Voucher Number',
    'Customer Statement of Account': 'Statement No.',
    'Vendor Statement of Account': 'Statement No.',
    'Pick List': 'Pick List Number',
    'Receipt Voucher': 'Receipt Number'
};

const DOCUMENT_TITLE_LABELS = {
    'Quotation': 'Quotation',
    'Sales Invoice': 'Sales Invoice',
    'Sales Order (SO)': 'Sales Order',
    'Delivery Note (DO/DN)': 'Delivery Note',
    'Proforma Invoice (PI)': 'Proforma Invoice',
    'Sales Return': 'Credit Note',
    'Local Purchase Order': 'Local Purchase Order',
    'Goods Receipt Note': 'Goods Receipt Note',
    'Purchase Invoice': 'Purchase Invoice',
    'Payment Voucher': 'Payment Voucher',
    'Customer Statement of Account': 'Customer Statement of Account',
    'Vendor Statement of Account': 'Vendor Statement of Account',
    'Pick List': 'Pick List',
    'Receipt Voucher': 'Receipt Voucher'
};

const PAPER_DIMENSIONS_MM = {
    A3: { width: 297, height: 420 },
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    Letter: { width: 215.9, height: 279.4 },
    Legal: { width: 215.9, height: 355.6 }
};

const resolvePaperDimensions = (paperSize = 'A4', orientation = 'Portrait') => {
    const base = PAPER_DIMENSIONS_MM[paperSize] || PAPER_DIMENSIONS_MM.A4;
    return orientation === 'Landscape'
        ? { width: base.height, height: base.width }
        : base;
};

const asNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value) => (value === null || value === undefined ? '' : String(value));

const compactValues = (...values) =>
    values
        .flat(Infinity)
        .map((value) => asText(value).trim())
        .filter(Boolean);

const firstNonEmpty = (...values) => compactValues(values)[0] || '';

const escapeHtml = (value) =>
    asText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const getTemplateDesignerSettings = (template = {}) => {
    if (template.salesDesignerSettings && typeof template.salesDesignerSettings === 'object') {
        return template.salesDesignerSettings;
    }

    if (template.purchaseDesignerSettings && typeof template.purchaseDesignerSettings === 'object') {
        return template.purchaseDesignerSettings;
    }

    const displayOptions = parsePrintTemplateObject(template.displayOptions);
    const settings = displayOptions.salesDesignerSettings || displayOptions.purchaseDesignerSettings || displayOptions.designerSettings;
    return settings && typeof settings === 'object' ? settings : {};
};

const hasDesignerLayoutSettings = (template = {}) => {
    if (
        (template.salesDesignerSettings && typeof template.salesDesignerSettings === 'object') ||
        (template.purchaseDesignerSettings && typeof template.purchaseDesignerSettings === 'object')
    ) {
        return true;
    }

    const displayOptions = parsePrintTemplateObject(template.displayOptions);
    return Boolean(displayOptions.salesDesignerSettings || displayOptions.purchaseDesignerSettings || displayOptions.designerSettings);
};

const isSalesDesignerTemplate = (template = {}) => {
    if (template.salesDesignerSettings && typeof template.salesDesignerSettings === 'object') {
        return true;
    }

    const displayOptions = parsePrintTemplateObject(template.displayOptions);
    return Boolean(displayOptions.salesDesignerSettings);
};

const isOff = (value) => value === false || value === 'false' || value === 0 || value === '0';

const pickSetting = (settings, keys, fallback = true) => {
    for (const key of keys) {
        if (settings[key] !== undefined && settings[key] !== null) {
            return !isOff(settings[key]);
        }
    }
    return fallback;
};

const sanitizeCssColor = (value, fallback) => {
    const text = asText(value).trim();
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(text)) return text;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(text)) return text;
    return fallback;
};

const sanitizeCssFontFamily = (value, fallback = "'Inter', sans-serif") => {
    const text = asText(value).trim();
    if (!text) return fallback;
    return /^[A-Za-z0-9\s"',.-]+$/.test(text) ? text : fallback;
};

const normaliseFontSize = (value, fallback = 10) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(13, Math.max(8, parsed));
};

const resolveTemplateImageUrl = (value) => resolveDocumentImageUrl(value) || '';

const buildTheme = (template = {}) => {
    const settings = getTemplateDesignerSettings(template);
    const accent = sanitizeCssColor(settings.accentColor || settings.primaryColor, '#F5C742');
    // primaryColor drives general text (title, company name, bill-to name, meta values).
    // grandTotalColor is applied only to the grand-total figure — kept separate so
    // changing the grand total colour doesn't bleed into the rest of the document.
    const primaryColor = '#111827';
    const grandTotalColor = sanitizeCssColor(
        settings.grandTotalColor,
        sanitizeCssColor(settings.primaryColor, '#111827')
    );

    return {
        accentColor: accent,
        primaryColor,
        grandTotalColor,
        borderColor: sanitizeCssColor(settings.borderColor, '#e0e0e0'),
        tableHeaderBg: sanitizeCssColor(settings.tableHeaderBg || settings.tableHeaderColor || '#f8fafc', '#f8fafc'),
        tableHeaderText: sanitizeCssColor(settings.tableHeaderText || settings.tableHeaderTextColor, '#111827'),
        totalRowBg: sanitizeCssColor(settings.totalRowBg || '#f8fafc', '#f8fafc'),
        fontFamily: sanitizeCssFontFamily(settings.fontFamily),
        fontSize: normaliseFontSize(settings.fontSize),
    };
};

const renderCurrencySymbol = (value) => {
    const currencyConfig = resolveCurrencyDisplayConfig(value);
    return escapeHtml(currencyConfig.label);
};

const renderCurrencySymbolHtml = (value) => {
    const currencyConfig = resolveCurrencyDisplayConfig(value);
    if (currencyConfig.hasImage) {
        return `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="${escapeHtml(currencyConfig.ariaLabel)}" style="height:0.85em;width:auto;display:inline-block;vertical-align:-0.07em;" />`;
    }
    return escapeHtml(currencyConfig.label);
};

const renderCurrencyCode = (value) => {
    const currencyConfig = resolveCurrencyDisplayConfig(value);
    return escapeHtml(currencyConfig.currency || currencyConfig.label);
};

// Pick currency rendering mode based on template displayOptions.currencyDisplay:
// 'symbol' (default, legacy) renders the glyph / dirham image; 'code' renders the
// alphabetic ISO code (AED / USD).
const renderCurrencyForLayout = (value, displayOptions = {}) =>
    displayOptions?.currencyDisplay === 'code'
        ? renderCurrencyCode(value)
        : renderCurrencySymbolHtml(value);

const formatNumber = (value, decimals = 2) =>
    asNumber(value).toLocaleString('en-AE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

const joinAddress = (...parts) => compactValues(parts).join(', ');

const formatDocDate = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';
        const yyyy = value.getFullYear();
        const mm = String(value.getMonth() + 1).padStart(2, '0');
        const dd = String(value.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    const text = asText(value).trim();
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : formatDocDate(parsed);
};

const toDocumentTitleCase = (value) => {
    const text = asText(value)
        .replace(/\s*\((SO|DO\/DN|PI|GRV)\)\s*/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    if (!text) return '';

    return text
        .toLowerCase()
        .replace(/\b[a-z0-9]+(?:\/[a-z0-9]+)?\b/g, (word) => (
            word
                .split('/')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join('/')
        ));
};

const resolveDocumentTitle = (template = {}, data = {}, fallback = 'Document') => (
    toDocumentTitleCase(data.title || DOCUMENT_TITLE_LABELS[template.category] || template.category || fallback)
);

const renderBatchBarcodeSvg = (batchNumber, options = {}) => {
    const value = asText(batchNumber).trim();
    if (!value) return '';
    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, value, {
            format: 'CODE128',
            displayValue: false,
            height: options.height ?? 28,
            margin: 0,
            width: options.width ?? 1.1
        });
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('style', 'width:100%;height:28px;display:block;');
        return svg.outerHTML;
    } catch (_e) {
        return `<span class="batch-barcode-fallback">${escapeHtml(value)}</span>`;
    }
};

const resolveDocumentImageUrl = (value) => {
    const imagePath = firstNonEmpty(value);
    return imagePath ? getImageUrl(imagePath) : '';
};

const resolveLogoUrl = (companyProfile = {}) => {
    const logoPath =
        companyProfile.logoUrl ||
        companyProfile.logo ||
        companyProfile.companyLogo ||
        companyProfile.logoPath ||
        '';

    return resolveDocumentImageUrl(logoPath) || null;
};

const resolveStampUrl = (companyProfile = {}) => {
    const stampPath =
        companyProfile.stampUrl ||
        companyProfile.stampPath ||
        '';

    return resolveDocumentImageUrl(stampPath) || null;
};

export const normalizeDocumentCompanyProfile = (companyProfile = {}) => {
    const address = firstNonEmpty(
        companyProfile.fullAddress,
        joinAddress(companyProfile.address, companyProfile.city, companyProfile.country),
        companyProfile.address
    );
    const currencyValue = resolveCurrencyDisplayConfig(companyProfile).label;

    return {
        ...companyProfile,
        companyName: firstNonEmpty(companyProfile.companyName, companyProfile.name, companyProfile.localName),
        localName: firstNonEmpty(companyProfile.localName),
        address,
        phone: firstNonEmpty(companyProfile.phone, companyProfile.mobile),
        email: firstNonEmpty(companyProfile.email),
        trn: firstNonEmpty(companyProfile.trn, companyProfile.taxId),
        crn: firstNonEmpty(
            companyProfile.crn,
            companyProfile.crNumber,
            companyProfile.registrationNumber,
            companyProfile.companyRegistrationNumber
        ),
        website: firstNonEmpty(companyProfile.website),
        logoUrl: resolveLogoUrl(companyProfile),
        stampUrl: resolveStampUrl(companyProfile),
        showStampInPrint: companyProfile.showStampInPrint !== false,
        showStampInEmail: companyProfile.showStampInEmail !== false,
        currency: currencyValue,
        currencySymbol: currencyValue
    };
};

const resolveCurrency = (companyProfile = {}, totals = {}, summaryAmount = {}) => {
    if (firstNonEmpty(companyProfile.currency, companyProfile.currencySymbol)) {
        return resolveCurrencyDisplayConfig(companyProfile).label;
    }

    const documentCurrency = firstNonEmpty(totals.currency, summaryAmount.currency);
    return resolveCurrencyDisplayConfig(documentCurrency || 'AED').label;
};

const formatAmountInWords = (value, currency) => {
    const amount = asNumber(value);
    const whole = Math.floor(amount);
    const fils = Math.round((amount - whole) * 100);
    return `${whole.toLocaleString('en-AE')} ${currency} and ${fils} Fils Only`;
};

const visibleWhen = (settings, keys, fallback = true) => pickSetting(settings, keys, fallback);

const buildCompanyVisibility = (settings = {}) => ({
    name: visibleWhen(settings, ['showCompanyName'], true),
    address: visibleWhen(settings, ['showCompanyAddress'], true),
    phone: visibleWhen(settings, ['showCompanyPhone'], true),
    email: visibleWhen(settings, ['showCompanyEmail'], true),
    website: visibleWhen(settings, ['showCompanyWebsite'], true),
    trn: visibleWhen(settings, ['showTRN', 'showCompanyTaxId'], true),
    crn: visibleWhen(settings, ['showCRN', 'showCompanyRegNumber'], false)
});

const buildPartyVisibility = (settings = {}) => ({
    code: visibleWhen(settings, ['showCustomerCode', 'showVendorCode'], true),
    address: visibleWhen(settings, ['showBillTo', 'showVendorCard'], true),
    phone: visibleWhen(settings, ['showCustomerPhone', 'showVendorContact', 'showVendorMobile'], true),
    email: visibleWhen(settings, ['showCustomerEmail', 'showVendorEmail'], true),
    taxId: visibleWhen(settings, ['showCustomerTRN', 'showVendorTRN'], true)
});

const applyDesignerColumnVisibility = (columns = {}, settings = {}) => ({
    ...columns,
    showIndex: visibleWhen(settings, ['colNo', 'showLineNumber'], true),
    image: visibleWhen(settings, ['colProductImage', 'showItemImage'], Boolean(columns.image)),
    showItemIdentity: visibleWhen(settings, ['colItemCode', 'showItemCode'], true),
    uom: visibleWhen(settings, ['colUOM', 'showUOM'], Boolean(columns.uom)),
    description: visibleWhen(settings, ['colDescription', 'showItemDescription'], columns.description !== false),
    qty: visibleWhen(settings, ['colQty', 'showQty'], columns.qty !== false),
    unitPrice: visibleWhen(settings, ['colUnitPrice', 'showUnitPrice'], columns.unitPrice !== false),
    taxableAmount: visibleWhen(settings, ['colTaxableAmount', 'showTaxableAmount'], Boolean(columns.taxableAmount)),
    discount: visibleWhen(settings, ['colDiscount', 'showDiscount'], Boolean(columns.discount)),
    discountPercent: visibleWhen(settings, ['colDiscount', 'showDiscountPercent'], Boolean(columns.discountPercent)),
    taxPercent: visibleWhen(settings, ['colVAT', 'showVATPercent'], Boolean(columns.taxPercent)),
    tax: visibleWhen(settings, ['colVATAmount', 'showVATAmount'], columns.tax !== false),
    total: visibleWhen(settings, ['colLineTotal', 'showLineTotal'], columns.total !== false),
    productId: visibleWhen(settings, ['colItemCode', 'showItemCode'], Boolean(columns.productId)),
    sku: visibleWhen(settings, ['colSKU', 'showSKU'], Boolean(columns.sku)),
    barcode: visibleWhen(settings, ['colBarcode', 'showBarcode'], Boolean(columns.barcode)),
    brand: visibleWhen(settings, ['colBrand', 'showBrand'], Boolean(columns.brand)),
    batchNumber: visibleWhen(settings, ['colBatchNumber', 'showBatchNo'], Boolean(columns.batchNumber)),
    location: visibleWhen(settings, ['colBinLocation', 'showBinLocation'], Boolean(columns.location)),
    lpoQty: visibleWhen(settings, ['showOrderedQty', 'colOrderedQty'], Boolean(columns.lpoQty)),
    received: visibleWhen(settings, ['showReceivedQty', 'colReceivedQty'], Boolean(columns.received)),
    accepted: visibleWhen(settings, ['showAcceptedQty', 'colAcceptedQty'], Boolean(columns.accepted)),
    expiry: visibleWhen(settings, ['showExpiry', 'colExpiry'], Boolean(columns.expiry))
});

const shouldShowPurchaseMetaRow = (row, settings = {}) => {
    const label = asText(row?.label).trim().toLowerCase();
    if (!label) return false;

    if (/^date$|document date|lpo date|grn date|invoice date|voucher date/.test(label)) {
        return visibleWhen(settings, ['showDocDate', 'showLpoDate', 'showLPODate', 'showGRNDate', 'showInvoiceDate', 'showVoucherDate'], true);
    }
    if (/due date|expected delivery/.test(label)) {
        return visibleWhen(settings, ['showDueDate'], false);
    }
    if (/valid until|valid till/.test(label)) {
        return visibleWhen(settings, ['showValidUntil'], false);
    }
    if (/payment terms?/.test(label)) {
        return visibleWhen(settings, ['showPaymentTerms'], false);
    }
    if (/currency/.test(label)) {
        return visibleWhen(settings, ['showCurrency'], true);
    }
    if (/p\.?o\.?|po number|purchase order|reference|source ref|created from|doc ref|vendor invoice|supplier invoice|grn no/.test(label)) {
        return visibleWhen(settings, ['showPOReference'], true);
    }
    if (/warehouse/.test(label)) {
        return visibleWhen(settings, ['showWarehouseStore', 'showWarehouse'], false);
    }
    if (/location|store|branch/.test(label)) {
        return visibleWhen(settings, ['showLocationStore', 'showBranch'], false);
    }
    if (/buyer|account executive|salesperson|sales person|prepared by|received by|checked by/.test(label)) {
        return visibleWhen(settings, ['showSalesperson', 'showReceivedBy'], true);
    }
    if (/delivery terms?/.test(label)) {
        return visibleWhen(settings, ['showDeliveryTerms'], false);
    }

    return true;
};

const PURCHASE_DESIGNER_REFERENCE_ORDER = [
    /p\.?o\.?|po number|purchase order|reference|source ref|created from|doc ref/,
    /location|store|branch/,
    /warehouse/,
    /account executive|buyer|salesperson|sales person|prepared by|received by|checked by/,
    /payment terms?/,
    /currency/,
    /delivery terms?/
];

const sortPurchaseDesignerMetaRows = (rows = []) =>
    rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
            const aLabel = asText(a.row?.label).trim().toLowerCase();
            const bLabel = asText(b.row?.label).trim().toLowerCase();
            const aOrder = PURCHASE_DESIGNER_REFERENCE_ORDER.findIndex((pattern) => pattern.test(aLabel));
            const bOrder = PURCHASE_DESIGNER_REFERENCE_ORDER.findIndex((pattern) => pattern.test(bLabel));
            const resolvedAOrder = aOrder === -1 ? PURCHASE_DESIGNER_REFERENCE_ORDER.length : aOrder;
            const resolvedBOrder = bOrder === -1 ? PURCHASE_DESIGNER_REFERENCE_ORDER.length : bOrder;

            if (resolvedAOrder !== resolvedBOrder) return resolvedAOrder - resolvedBOrder;
            return a.index - b.index;
        })
        .map(({ row }) => row);

const resolveCompanyVars = (html, company) => {
    if (!html) return '';

    return html
        .replace(/{company_name}/g, escapeHtml(company.companyName || ''))
        .replace(/{company_address}/g, escapeHtml(company.address || ''))
        .replace(/{company_phone}/g, escapeHtml(company.phone || ''))
        .replace(/{company_email}/g, escapeHtml(company.email || ''))
        .replace(/{company_trn}/g, escapeHtml(company.trn || ''))
        .replace(/{page_number}/g, '<span class="page-num"></span>')
        .replace(/{total_pages}/g, '<span class="page-total"></span>')
        .replace(
            /{company_logo}/g,
            company.logoUrl ? `<img src="${company.logoUrl}" style="height:60px;width:auto;" alt="Company Logo" />` : ''
        )
        .replace(
            /{logo}/g,
            company.logoUrl ? `<img src="${company.logoUrl}" style="height:60px;width:auto;" alt="Company Logo" />` : ''
        );
};

const looksLikePurchasePayload = (data) =>
    data &&
    typeof data === 'object' &&
    (data.party || Array.isArray(data.headerMeta) || Array.isArray(data.references) || Array.isArray(data.paymentDetails));

const normaliseDescription = (item = {}) => {
    if (item.description && typeof item.description === 'object') {
        return {
            title: item.description.title || item.name || '-',
            details: Array.isArray(item.description.details) ? item.description.details.filter(Boolean) : []
        };
    }

    return {
        title: item.name || item.item || item.desc || '-',
        details: compactValues(
            item.remarks || item.desc || (typeof item.description === 'string' ? item.description : '')
        )
    };
};

const normaliseItem = (item = {}) => {
    const description = normaliseDescription(item);
    const qty = asNumber(item.qty ?? item.quantity ?? 0);
    const price = asNumber(item.price ?? item.unitPrice ?? item.unitCost ?? 0);
    const discountPercent = asNumber(item.disc ?? item.discount ?? item.discountPercent ?? 0);
    const taxableAmount = asNumber(
        item.taxableAmount ?? (qty * price * (1 - (discountPercent || 0) / 100))
    );
    const taxAmount = asNumber(item.taxAmt ?? item.taxAmount ?? 0);
    const total = asNumber(item.total ?? item.lineAmount ?? (taxableAmount + taxAmount));

    return {
        code: item.code || item.productId || item.itemCode || '',
        sku: item.sku || item.skuCode || '',
        barcode: item.barcode || item.itemBarcode || '',
        brand: item.brand || item.brandName || item.brand_name || '',
        detailedDesc: item.detailedDesc || item.detailedDescription || item.detailed_desc || '',
        shortDesc: item.shortDesc || item.shortDescription || item.short_desc || '',
        localName: item.localName || item.arabicName || '',
        name: item.name || item.productName || item.item || description.title || '-',
        description,
        image: resolveDocumentImageUrl(item.image || item.imageUrl || ''),
        unit: item.unit || item.uom || '',
        qty,
        price,
        taxableAmount,
        taxAmount,
        taxPercent: asNumber(item.taxPercent ?? item.taxRate ?? item.tax ?? 0),
        discountPercent,
        salesPerson: item.salesPerson || item.salesperson || item.salesPersonName || '',
        location: item.location || item.branch || item.branchName || item.locationName || '',
        batchSelections: Array.isArray(item.batchSelections) ? item.batchSelections : [],
        batchNumber: item.batchNumber || '',
        expiry: item.expiry || item.expiryDate || '',
        lpoQty: asNumber(item.lpoQty ?? item.lpo_qty ?? 0),
        received: asNumber(item.received ?? item.receivedQty ?? item.received_qty ?? 0),
        accepted: asNumber(item.accepted ?? item.acceptedQty ?? item.accepted_qty ?? 0),
        receivedBy: item.receivedBy || item.received_by || '',
        checkedBy: item.checkedBy || item.checked_by || '',
        total
    };
};

const getColumnDefaults = (category, isPurchaseDocument) => {
    const isVoucherLike = ['Payment Voucher', 'Cheque', 'Customer Statement of Account', 'Vendor Statement of Account'].includes(category);
    return isPurchaseDocument
        ? {
            ...DEFAULT_TEMPLATE_COLUMNS,
            qty: !isVoucherLike,
            unitPrice: !isVoucherLike,
            taxableAmount: !isVoucherLike,
            tax: category === 'Purchase Invoice'
        }
        : DEFAULT_TEMPLATE_COLUMNS;
};

const createColumnModel = (rawColumns = {}) => {
    const c = rawColumns;
    // QA-029: Product/Services cell stacks Item Code / SKU / Barcode / Brand /
    // Batch # / Arabic Name based on the ITEM IDENTITY checkboxes (no separate
    // columns for those). Discount % / Tax % render as standalone columns
    // only when their "(separate column)" checkbox is toggled. The Taxable
    // Amount cell shows an inline Discount sub-line when "Discount % (in
    // Taxable Amount col)" is on.
    return [
        { key: 'index', label: '#', align: 'center', width: '4%', enabled: c.showIndex !== false },
        { key: 'image', label: 'Image', align: 'center', width: '7%', enabled: Boolean(c.image) },
        { key: 'description', label: 'Product / Services', align: 'left', width: c.batchBarcode ? '16%' : '22%', enabled: c.showItemIdentity !== false },
        { key: 'details', label: 'Description of Product / Services', align: 'left', width: c.batchBarcode ? '14%' : '24%', enabled: c.description !== false },
        { key: 'uom', label: 'UOM', align: 'center', width: '6%', enabled: Boolean(c.uom) },
        { key: 'batchBarcode', label: 'Batch Barcode', align: 'center', width: '22%', enabled: Boolean(c.batchBarcode) },
        { key: 'expiry', label: 'Expiry', align: 'center', width: '8%', enabled: Boolean(c.expiry) },
        { key: 'qty', label: 'Qty', align: 'right', width: '6%', enabled: c.qty !== false },
        { key: 'unitPrice', label: 'Unit Price', align: 'right', width: '9%', enabled: c.unitPrice !== false },
        { key: 'taxableAmount', label: 'Taxable Amount', align: 'right', width: '12%', enabled: Boolean(c.taxableAmount) },
        { key: 'discountPercent', label: 'Discount %', align: 'center', width: '7%', enabled: Boolean(c.discountPercent) },
        { key: 'taxPercent', label: 'VAT %', align: 'center', width: '6%', enabled: Boolean(c.taxPercent) },
        { key: 'tax', label: 'VAT Amount', align: 'right', width: '9%', enabled: c.tax !== false },
        { key: 'total', label: 'Line Total', align: 'right', width: '9%', enabled: c.total !== false },
        { key: 'lpoQty', label: 'LPO Qty', align: 'right', width: '6%', enabled: Boolean(c.lpoQty) },
        { key: 'received', label: 'Received', align: 'right', width: '6%', enabled: Boolean(c.received) },
        { key: 'accepted', label: 'Accepted', align: 'right', width: '6%', enabled: Boolean(c.accepted) },
        { key: 'receivedBy', label: 'Received By', align: 'left', width: '10%', enabled: Boolean(c.receivedBy) },
        { key: 'checkedBy', label: 'Checked By', align: 'left', width: '10%', enabled: Boolean(c.checkedBy) },
    ].filter((col) => col.enabled);
};

const buildItemDetailLines = (item) =>
    (item.description.details || []).filter((line) => {
        const normalised = asText(line).trim().toLowerCase();
        const itemCode = asText(item.code).trim().toLowerCase();
        const itemSku = asText(item.sku).trim().toLowerCase();
        const itemBarcode = asText(item.barcode).trim().toLowerCase();
        const itemLocalName = asText(item.localName).trim().toLowerCase();

        if (!normalised) return false;
        if (itemCode && (normalised === itemCode || normalised.startsWith('code:') || normalised.startsWith('item code:') || normalised.startsWith('product id:'))) return false;
        if (itemBarcode && (normalised === itemBarcode || normalised.startsWith('barcode:') || normalised.startsWith('item barcode:'))) return false;
        if (itemSku && (normalised === itemSku || normalised.startsWith('sku:') || normalised.startsWith('sku code:'))) return false;
        if (itemLocalName && (normalised === itemLocalName || normalised.startsWith('arabic:') || normalised.startsWith('arabic name:') || normalised.startsWith('local name:'))) return false;

        return true;
    });

// QA-029: Product/Services column shows the product identity stacked.
// Each meta line (Item Code / SKU / Brand / Barcode / Batch # / Arabic Name)
// only renders when the matching checkbox is enabled in the template
// designer (printTemplateConfig column flags). The product name is always
// shown — it's the column's headline.
const buildDescriptionCell = (item, displayOptions = {}, columnOptions = {}) => {
    const showImage = displayOptions.showItemImage && !columnOptions.image && item.image;
    const productName = item.name && item.name !== '-' ? item.name : (item.description.title || '-');
    const code = asText(item.code).trim();
    const sku = asText(item.sku).trim();
    const brand = asText(item.brand).trim();
    const barcode = asText(item.barcode).trim();
    const localName = asText(item.localName).trim();

    const batchNumbers = [];
    if (asText(item.batchNumber).trim()) batchNumbers.push(asText(item.batchNumber).trim());
    if (Array.isArray(item.batchSelections)) {
        for (const sel of item.batchSelections) {
            const bn = asText(sel?.batchNumber).trim();
            if (bn && !batchNumbers.includes(bn)) batchNumbers.push(bn);
        }
    }

    const metaLines = [];
    if (columnOptions.productId && code) metaLines.push(code);
    if (columnOptions.sku && sku && sku.toLowerCase() !== code.toLowerCase()) metaLines.push(`SKU: ${sku}`);
    if (columnOptions.brand && brand) metaLines.push(`Brand: ${brand}`);
    if (columnOptions.barcode && barcode) metaLines.push(`Barcode: ${barcode}`);
    if (columnOptions.batchNumber && batchNumbers.length) metaLines.push(`Batch: ${batchNumbers.join(', ')}`);
    if (columnOptions.arabicName && localName) metaLines.push(localName);
    const itemLocation = asText(item.location).trim();
    if (columnOptions.location && itemLocation) metaLines.push(`Bin: ${itemLocation}`);

    return `
        <div class="description-wrap">
            ${showImage ? `<img src="${escapeHtml(item.image)}" class="item-thumb" alt="" />` : ''}
            <div class="description-copy">
                <div class="description-title">${escapeHtml(productName)}</div>
                ${metaLines.map((line) => `<div class="description-meta">${escapeHtml(line)}</div>`).join('')}
            </div>
        </div>
    `;
};

// QA-029: Description column = short desc (italic bullet) + detailed desc
// rendered line-by-line as bullets. The "Detailed Description" checkbox in
// the template designer gates the detailed bullets; short desc always shows
// when present.
const buildDetailsCell = (item, columnOptions = {}) => {
    const shortDesc = asText(item.shortDesc).trim();
    const detailedDesc = asText(item.detailedDesc).trim();
    const bullets = [];

    if (shortDesc) {
        bullets.push(`<li class="desc-bullet desc-bullet-short">${escapeHtml(shortDesc)}</li>`);
    }
    if (columnOptions.detailedDesc !== false && detailedDesc) {
        detailedDesc
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
                bullets.push(`<li class="desc-bullet">${escapeHtml(line)}</li>`);
            });
    }

    if (bullets.length === 0) {
        const lines = buildItemDetailLines(item);
        lines.forEach((line) => bullets.push(`<li class="desc-bullet">${escapeHtml(line)}</li>`));
    }

    const discountLine = item.discountPercent > 0
        ? `<div class="desc-discount-line">Discount N/A @ ${formatNumber(item.discountPercent, 0)}%</div>`
        : '';

    return bullets.length > 0 || discountLine
        ? `${bullets.length > 0 ? `<ul class="desc-bullets">${bullets.join('')}</ul>` : ''}${discountLine}`
        : '';
};

const renderTableCell = (column, item, index, displayOptions = {}, columnOptions = {}) => {
    switch (column.key) {
        case 'index':
            return `<td class="table-cell cell-center cell-index">${index + 1}</td>`;
        case 'image':
            return `
                <td class="table-cell cell-center">
                    ${item.image
                    ? `<img src="${escapeHtml(item.image)}" class="item-thumb item-thumb-small" alt="" />`
                    : `<div class="item-thumb item-thumb-small item-thumb-placeholder"></div>`}
                </td>
            `;
        case 'description':
            return `<td class="table-cell cell-description">${buildDescriptionCell(item, displayOptions, columnOptions)}</td>`;
        case 'details':
            return `<td class="table-cell cell-details">${buildDetailsCell(item, columnOptions)}</td>`;
        case 'productId':
            return `<td class="table-cell cell-code">${escapeHtml(item.code || '-')}</td>`;
        case 'sku':
            return `<td class="table-cell cell-code">${escapeHtml(item.sku || '-')}</td>`;
        case 'barcode':
            return `<td class="table-cell cell-code cell-barcode">${escapeHtml(item.barcode || '-')}</td>`;
        case 'brand':
            return `<td class="table-cell">${escapeHtml(item.brand || '-')}</td>`;
        case 'detailedDesc':
            return `<td class="table-cell">${escapeHtml(item.detailedDesc || '-')}</td>`;
        case 'arabicName':
            return `<td class="table-cell">${escapeHtml(item.localName || '-')}</td>`;
        case 'salesPerson':
            return `<td class="table-cell">${escapeHtml(item.salesPerson || '-')}</td>`;
        case 'location':
            return `<td class="table-cell">${escapeHtml(item.location || '-')}</td>`;
        case 'batchNumber': {
            if (item.batchNumber) {
                return `<td class="table-cell">${escapeHtml(item.batchNumber)}</td>`;
            }
            const selections = Array.isArray(item.batchSelections) ? item.batchSelections : [];
            if (selections.length === 0) return '<td class="table-cell">-</td>';
            const inner = selections
                .map((s) => escapeHtml(s.batchNumber || ''))
                .filter(Boolean)
                .join('<br/>');
            return `<td class="table-cell">${inner || '-'}</td>`;
        }
        case 'batchBarcode': {
            const wrap = (svg) => `<div style="width:100%;max-width:100%;overflow:hidden;">${svg}</div>`;
            if (item.batchNumber) {
                return `<td class="table-cell cell-center">${wrap(renderBatchBarcodeSvg(item.batchNumber))}</td>`;
            }
            const selections = Array.isArray(item.batchSelections) ? item.batchSelections : [];
            if (selections.length === 0) return '<td class="table-cell cell-center">-</td>';
            const inner = selections
                .map((s) => wrap(renderBatchBarcodeSvg(s.batchNumber, { height: 22 })))
                .filter(Boolean)
                .join('<div style="height:4px;"></div>');
            return `<td class="table-cell cell-center">${inner || '-'}</td>`;
        }
        case 'expiry': {
            if (item.expiry) {
                return `<td class="table-cell cell-center">${escapeHtml(formatDocDate(item.expiry))}</td>`;
            }
            const selections = Array.isArray(item.batchSelections) ? item.batchSelections : [];
            if (selections.length === 0) return '<td class="table-cell cell-center">-</td>';
            const inner = selections
                .map((s) => escapeHtml(formatDocDate(s.expiryDate)))
                .filter(Boolean)
                .join('<br/>');
            return `<td class="table-cell cell-center">${inner || '-'}</td>`;
        }
        case 'qty':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.qty, 2)}</div>
                </td>
            `;
        case 'uom':
            return `<td class="table-cell cell-center">${escapeHtml(item.unit || '-')}</td>`;
        case 'unitPrice':
            return `<td class="table-cell cell-right">${formatNumber(item.price)}</td>`;
        case 'taxableAmount':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.taxableAmount)}</div>
                    ${columnOptions.discount && item.discountPercent > 0
                    ? `<div class="cell-sub">Discount ${formatNumber(item.discountPercent, 0)}%</div><div class="cell-sub">@ ${formatNumber((item.taxableAmount * item.discountPercent) / 100)}</div>`
                    : ''}
                </td>
            `;
        case 'discount':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'discountPercent':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'tax':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.taxAmount)}</div>
                    ${item.taxPercent > 0 ? `<div class="cell-sub">@ VAT ${formatNumber(item.taxPercent, 0)}%</div>` : ''}
                </td>
            `;
        case 'taxPercent':
            return `<td class="table-cell cell-center">${item.taxPercent > 0 ? `${formatNumber(item.taxPercent, 0)}%` : '-'}</td>`;
        case 'total':
            return `<td class="table-cell cell-right cell-strong">${formatNumber(item.total)}</td>`;
        case 'lpoQty':
            return `<td class="table-cell cell-right">${formatNumber(item.lpoQty, 0)}</td>`;
        case 'received':
            return `<td class="table-cell cell-right">${formatNumber(item.received, 0)}</td>`;
        case 'accepted':
            return `<td class="table-cell cell-right">${formatNumber(item.accepted, 0)}</td>`;
        case 'receivedBy':
            return `<td class="table-cell">${escapeHtml(item.receivedBy || '-')}</td>`;
        case 'checkedBy':
            return `<td class="table-cell">${escapeHtml(item.checkedBy || '-')}</td>`;
        default:
            return '<td class="table-cell">-</td>';
    }
};

const buildItemsTable = (layout) => {
    if (!layout.showItemTable || !layout.columnModel?.length) return '';

    const colSpan = layout.columnModel.length;
    const isPickList = layout.category === 'Pick List';

    let rows;
    if (isPickList) {
        let currentLocation = null;
        const buffer = [];
        layout.items.forEach((item, index) => {
            const loc = asText(item.location) || '-';
            if (loc !== currentLocation) {
                buffer.push(`
                    <tr class="group-header">
                        <td colspan="${colSpan}" style="background:#F5F5F5;font-weight:600;padding:6px 8px;">
                            Location: ${escapeHtml(loc)}
                        </td>
                    </tr>
                `);
                currentLocation = loc;
            }
            buffer.push(`
                <tr>
                    ${layout.columnModel.map((column) => renderTableCell(column, item, index, layout.displayOptions, layout.columnOptions)).join('')}
                </tr>
            `);
        });
        rows = buffer.join('');
    } else {
        rows = layout.items.map((item, index) => `
            <tr>
                ${layout.columnModel.map((column) => renderTableCell(column, item, index, layout.displayOptions, layout.columnOptions)).join('')}
            </tr>
        `).join('');
    }

    return `
        <section class="table-section">
            <table class="document-table">
                <thead>
                    <tr>
                        ${layout.columnModel.map((column) => `
                            <th class="${column.align === 'right' ? 'cell-right' : column.align === 'center' ? 'cell-center' : ''}" style="width:${column.width};">
                                ${escapeHtml(column.label)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${layout.items.length > 0
            ? rows
            : `<tr><td class="table-empty" colspan="${layout.columnModel.length}">No items found.</td></tr>`}
                </tbody>
            </table>
        </section>
    `;
};

const buildTotalsTable = (layout) => {
    if (!layout.showTotalsSection) return '';

    const discountAmount = asNumber(layout.totals.billDiscountAmount ?? layout.totals.discountAmount ?? 0);
    const discountPercent = asNumber(layout.totals.billDiscount ?? 0);
    const deliveryCharge = asNumber(layout.totals.deliveryCharge ?? 0);
    const roundOff = asNumber(layout.totals.roundOff ?? 0);
    const amountPaid = asNumber(layout.totals.amountPaid ?? 0);
    const balanceDue = asNumber(layout.totals.balanceDue ?? Math.max(asNumber(layout.totals.grandTotal) - amountPaid, 0));
    const currency = renderCurrencyForLayout(layout.currency, layout.displayOptions);

    const row = (label, amount, className = '') => layout.isPurchaseDesigner
        ? `
            <tr class="${className}">
                <td class="tot-label">${label}</td>
                <td class="tot-currency">${currency}</td>
                <td class="tot-amount">${formatNumber(amount)}</td>
            </tr>
        `
        : `
            <tr class="${className}">
                <td class="tot-label">${label}</td>
                <td class="tot-amount">${currency} ${formatNumber(amount)}</td>
            </tr>
        `;
    const visibility = {
        taxable: false,
        subTotal: true,
        discount: true,
        tax: true,
        deliveryCharge: true,
        roundOff: true,
        grandTotal: true,
        amountPaid: true,
        balanceDue: true,
        ...(layout.totalVisibility || {})
    };

    const rows = [
        visibility.taxable ? row('Taxable Amount', layout.totals.subTotal) : '',
        visibility.subTotal ? row('Sub Total', layout.totals.subTotal) : '',
        visibility.discount && discountAmount > 0 ? (layout.isPurchaseDesigner
            ? `
                <tr class="amount-negative">
                    <td class="tot-label">Discount${discountPercent > 0 ? ` (${formatNumber(discountPercent, 0)}%)` : ''}</td>
                    <td class="tot-currency">${currency}</td>
                    <td class="tot-amount">- ${formatNumber(discountAmount)}</td>
                </tr>
            `
            : `
                <tr class="amount-negative">
                    <td class="tot-label">Discount${discountPercent > 0 ? ` (${formatNumber(discountPercent, 0)}%)` : ''}</td>
                    <td class="tot-amount">${currency} - ${formatNumber(discountAmount)}</td>
                </tr>
            `) : '',
        visibility.tax ? row('Total VAT', layout.totals.tax) : '',
        visibility.deliveryCharge && deliveryCharge > 0 ? row('Delivery Charge', deliveryCharge) : '',
        visibility.roundOff && roundOff !== 0 ? row('Round Off', roundOff) : '',
        visibility.grandTotal ? row('Total', layout.totals.grandTotal, 'grand-total-row') : '',
        visibility.amountPaid && amountPaid > 0 ? row('Amount Paid', amountPaid) : '',
        visibility.balanceDue && amountPaid > 0 ? row('Balance Due', balanceDue, 'balance-due-row') : '',
    ].filter(Boolean).join('');

    if (!rows) return '';

    return `
        <table class="totals-table">
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
};

const buildPaymentCard = (layout) => {
    if (!layout.showPaymentDetails || !layout.paymentRows?.length) return '';

    return `
        <section class="info-card payment-card">
            <div class="card-eyebrow">Payment Details</div>
            <div class="reference-grid">
                ${layout.paymentRows.map((row) => `
                    <div class="reference-row">
                        <div class="reference-label">${escapeHtml(row.label)}</div>
                        <div class="reference-value">${escapeHtml(row.value)}</div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
};

const buildSummarySection = (layout, renderTarget = 'print') => {
    // Show notes section whenever the toggle is on, even if notes content is empty.
    const showNotes = layout.showNotesSection !== false;
    const hasNotes = showNotes;
    const hasTerms = Boolean(layout.displayOptions.showTerms !== false && layout.terms);
    const totalsTable = buildTotalsTable(layout);
    const showAmountInWords = Boolean(layout.showAmountInWords && layout.highlight?.value);
    const bankRows = Array.isArray(layout.bankRows) ? layout.bankRows.filter((row) => row?.value) : [];

    if (!showNotes && !hasTerms && !totalsTable && !showAmountInWords && bankRows.length === 0) return '';

    const notesHtml = `
        ${showAmountInWords ? `
            <div class="amount-words">In Words: ${escapeHtml(formatAmountInWords(layout.highlight.value, layout.currency))}</div>
        ` : ''}
        ${bankRows.length > 0 ? `
            <div class="bank-box">
                <div class="summary-label summary-label-bank">Bank Details</div>
                <div class="bank-grid">
                    ${bankRows.map((row) => `
                        <div class="bank-row">
                            <span>${escapeHtml(row.label)}</span>
                            <strong>${escapeHtml(row.value)}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        ${hasTerms ? `
            <div class="terms-box">
                <div class="summary-label summary-label-terms">Terms &amp; Conditions</div>
                <div class="notes-copy">${escapeHtml(layout.terms)}</div>
            </div>
        ` : ''}
        ${showNotes ? `
            <div class="summary-label">${escapeHtml(layout.notesLabel || 'Notes')}</div>
            <div class="notes-copy">${layout.notes ? escapeHtml(layout.notes) : '<span style="color:#aaa;">&mdash;</span>'}</div>
        ` : ''}
    `;

    // QA-040: Email mirrors the Print layout — totals stacked on the
    // right at the top, then Notes + Terms below on the left full-width.
    // Two rows of a presentation table since Gmail/Outlook flatten any
    // CSS flex/grid we'd otherwise use.
    if (renderTarget === 'email') {
        return `
            <table class="summary-section-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
                ${totalsTable ? `
                    <tr>
                        <td align="right" style="text-align:right;padding-bottom:12px;">
                            ${totalsTable}
                        </td>
                    </tr>
                ` : ''}
                ${(hasNotes || hasTerms) ? `
                    <tr>
                        <td align="left" style="text-align:left;padding-top:4px;">
                            ${notesHtml}
                        </td>
                    </tr>
                ` : ''}
            </table>
        `;
    }

    return `
        <section class="summary-section">
            ${totalsTable ? `<div class="summary-totals">${totalsTable}</div>` : ''}
            ${(hasNotes || hasTerms) ? `<div class="summary-notes">${notesHtml}</div>` : ''}
        </section>
    `;
};

const buildSignatureBlock = (layout) => {
    if (!layout.showSignatureBlock) return '';

    return `
        <section class="signature-card">
            <div class="card-eyebrow">Authorisation</div>
            <div class="signature-grid">
                <div class="signature-line">Prepared By</div>
                <div class="signature-line">Approved By</div>
            </div>
        </section>
    `;
};

const buildWatermark = (layout) => {
    if (layout.showWatermark) {
        return `
            <div class="document-watermark">
                <span>${escapeHtml(layout.watermarkText || 'ORIGINAL')}</span>
            </div>
        `;
    }

    if (layout.hasDesignerWatermarkToggle) return '';

    const upperStatus = asText(layout.status).toUpperCase().replace(/\s+/g, '_');

    if (!['DRAFT', 'CANCELLED', 'REJECTED'].includes(upperStatus)) {
        return '';
    }

    return `
        <div class="document-watermark">
            <span>${escapeHtml(upperStatus.replace(/_/g, ' '))}</span>
        </div>
    `;
};

const resolveLayoutDate = (layout) =>
    firstNonEmpty(
        (layout.headerRows || []).find((row) => /^date$/i.test(asText(row.label).trim()))?.value,
        new Date().toISOString().slice(0, 10)
    );


const buildStampBlock = (layout, renderTarget) => {
    const showStamp = layout.showCompanyStamp !== false && (
        renderTarget === 'email' ? layout.company.showStampInEmail : layout.company.showStampInPrint
    );
    const showQR = Boolean(layout.showQRCode);

    if (!showStamp && !showQR) return '';
    if (!showStamp && !layout.isPurchaseDesigner && !showQR) return '';

    const stampUrl = layout.stampUrl || layout.company.stampUrl;
    const stampHtml = showStamp
        ? `<div class="stamp-container">
            ${stampUrl
                ? `<img src="${escapeHtml(stampUrl)}" alt="Company Stamp" />`
                : `<div class="stamp-placeholder"><span>Company<br/>Stamp</span></div>`}
            <div class="stamp-caption">Official Stamp</div>
        </div>`
        : '';

    const qrDataUrl = showQR ? layout.qrCodeDataUrl : null;
    const qrHtml = qrDataUrl
        ? `<div class="qr-container">
            <img src="${escapeHtml(qrDataUrl)}" width="100" height="100" alt="QR Code" style="display:block;width:100px;height:100px;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />
            <div class="stamp-caption">Scan to verify</div>
        </div>`
        : '';

    if (!stampHtml && !qrHtml) return '';

    return `<div class="stamp-row">${stampHtml}${qrHtml}</div>`;
};

const buildPrintDateStamp = (layout, renderTarget) =>
    renderTarget === 'print' && layout.showPrintDateStamp !== false
        ? `<div class="print-date-stamp">Printed: ${escapeHtml(new Date().toISOString().slice(0, 10))}</div>`
        : '';

const buildPageNumbers = (layout, renderTarget) =>
    renderTarget === 'print' && layout.showPageNumbers
        ? '<div class="page-number-label">Page 1 of 1</div>'
        : '';

const buildHeaderAddon = (layout) =>
    layout.headerAddon
        ? `<div class="layout-addon layout-addon-header">${layout.headerAddon}</div>`
        : '';

const buildFooterAddon = (layout) =>
    layout.footerAddon
        ? `<div class="layout-addon layout-addon-footer">${layout.footerAddon}</div>`
        : '';

const buildGrandTotal = (layout) => {
    if (!layout.showHighlight) return '';

    return `
        <div class="grand-total-display">
            <div class="grand-total-label">${escapeHtml(layout.highlight.label || 'Grand Total')}</div>
            <div class="grand-total-value">${renderCurrencyCode(layout.currency)} ${formatNumber(layout.highlight.value)}</div>
        </div>
    `;
};

const buildLogoBlock = (layout) => {
    if (layout.displayOptions.showLogo === false) return '';
    const logoUrl = layout.logoUrl || layout.company.logoUrl;

    return logoUrl
        ? `
            <div class="company-logo">
                <img src="${escapeHtml(logoUrl)}" alt="Company Logo" />
            </div>
        `
        : `
            <div class="company-logo company-logo-fallback" aria-label="Company Logo">
                <span>G</span>
            </div>
        `;
};

const buildHeader = (layout, renderTarget = 'print') => {
    const visibleHeaderRows = (layout.headerRows || [])
        .filter((row) => !HIDDEN_HEADER_LABEL_PATTERNS.test(asText(row.label).trim()));
    const visibleReferenceRows = (layout.referenceRows || [])
        .filter((row) => !HIDDEN_HEADER_LABEL_PATTERNS.test(asText(row.label).trim()));
    const leftMetaRows = layout.isPurchaseDesigner
        ? []
        : [
            ...visibleHeaderRows,
            ...visibleReferenceRows
        ].filter((row) => LEFT_META_LABEL_PATTERNS.test(asText(row.label).trim()));
    const centerMetaRows = layout.isPurchaseDesigner
        ? visibleReferenceRows
        : visibleReferenceRows.filter((row) => !LEFT_META_LABEL_PATTERNS.test(asText(row.label).trim()));
    const centerHeaderRows = visibleHeaderRows.filter((row) => !LEFT_META_LABEL_PATTERNS.test(asText(row.label).trim()));

    const centerItems = [
        ...(layout.showDocNo === false ? [] : [{ label: layout.docNoLabel || 'Document Number', value: layout.docNo || '-' }]),
        ...centerHeaderRows,
        ...centerMetaRows
    ];

    const partyVisibility = {
        code: false,
        address: true,
        phone: true,
        email: true,
        taxId: true,
        ...(layout.partyVisibility || {})
    };
    const companyVisibility = {
        name: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        trn: true,
        crn: false,
        ...(layout.companyVisibility || {})
    };
    const customerLines = layout.party ? compactValues(
        partyVisibility.code && layout.party.code ? `Code: ${layout.party.code}` : '',
        partyVisibility.address ? layout.party.address || '' : '',
        partyVisibility.taxId && layout.party.taxId ? `${layout.partyTaxLabel || 'TRN'} : ${layout.party.taxId}` : '',
        partyVisibility.phone ? layout.party.phone || '' : '',
        partyVisibility.email ? layout.party.email || '' : ''
    ) : [];
    const shipToLines = layout.shipTo ? compactValues(
        layout.shipTo.name || '',
        layout.shipTo.address || '',
        layout.shipTo.phone || '',
        layout.shipTo.email || ''
    ) : [];

    const companyLines = compactValues(
        companyVisibility.address ? layout.company.address : '',
        companyVisibility.email ? layout.company.email : '',
        companyVisibility.phone ? layout.company.phone : '',
        companyVisibility.trn && layout.company.trn ? `TRN . ${layout.company.trn}` : '',
        companyVisibility.crn && layout.company.crn ? `CR No . ${layout.company.crn}` : '',
        companyVisibility.website ? layout.company.website : ''
    );

    const leftContent = `
        <div class="document-title">${escapeHtml(layout.title)}</div>

        ${layout.displayOptions.showCustomerDetails !== false && partyVisibility.address && layout.party ? `
            <div class="bill-to-block">
                <div class="bill-to-eyebrow">${escapeHtml(layout.partyLabel)},</div>
                <div class="bill-to-name">${escapeHtml(layout.party.name || '')}</div>
                ${customerLines.map((line) => `<div class="bill-to-line">${escapeHtml(line)}</div>`).join('')}
            </div>
        ` : ''}

        ${layout.showShipTo && shipToLines.length > 0 ? `
            <div class="bill-to-block ship-to-block">
                <div class="bill-to-eyebrow">SHIP TO</div>
                ${shipToLines.map((line) => `<div class="bill-to-line">${escapeHtml(line)}</div>`).join('')}
            </div>
        ` : ''}

        ${leftMetaRows.length > 0 ? `
            <div class="left-meta-block">
                ${leftMetaRows.map((row) => `
                    <div class="left-meta-item">
                        <div class="left-meta-label">${escapeHtml(row.label)}</div>
                        <div class="left-meta-value">${escapeHtml(row.value)}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;

    const centerItemHtml = centerItems.map((item) => `
        <div class="doc-meta-item">
            <div class="doc-meta-label">${escapeHtml(item.label)}</div>
            <div class="doc-meta-value">${escapeHtml(item.value)}</div>
        </div>
    `).join('');
    const centerContent = layout.isPurchaseDesigner
        ? `<div class="designer-meta-grid">${centerItemHtml}</div>`
        : centerItemHtml;

    const rightContent = `
        ${buildLogoBlock(layout)}

        ${layout.displayOptions.showCompanyDetails !== false ? `
            <div class="company-panel">
                ${companyVisibility.name ? `<div class="company-name">${escapeHtml(layout.company.companyName || '')}</div>` : ''}
                ${companyVisibility.name && layout.company.localName && layout.company.localName !== layout.company.companyName
                ? `<div class="company-copy company-local-name">${escapeHtml(layout.company.localName)}</div>`
                : ''}
                ${companyLines.map((line) => `<div class="company-copy">${escapeHtml(line)}</div>`).join('')}
            </div>
        ` : ''}
    `;

    // QA-040: Email clients (Gmail in particular) don't support CSS Grid and
    // have spotty Flexbox support — they reflow the three header columns
    // vertically, which is why the recipient sees Bill-To then a blank
    // middle then logo stacked instead of side-by-side. Emit a real
    // <table>-based header for the email render target; print mode keeps
    // the existing semantic <header> with grid styling.
    if (renderTarget === 'email') {
        return `
            <table class="document-header-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:16px;">
                <tr>
                    <td valign="top" align="left" width="38%" style="vertical-align:top;padding-right:8px;">
                        ${leftContent}
                    </td>
                    <td valign="top" align="right" width="32%" style="vertical-align:top;text-align:right;padding:0 8px;">
                        ${centerContent}
                    </td>
                    <td valign="top" align="right" width="30%" style="vertical-align:top;text-align:right;padding-left:8px;">
                        ${rightContent}
                    </td>
                </tr>
            </table>
        `;
    }

    return `
        <header class="document-header${layout.isPurchaseDesigner ? ' document-header-designer' : ''}">
            <div class="header-left">${leftContent}</div>
            <div class="header-center">${centerContent}</div>
            <div class="header-right">${rightContent}</div>
        </header>
    `;
};

const buildFooterBar = (layout, renderTarget, billBullLogo) => {
    if (renderTarget === 'print') {
        return '';
    }

    return `
        <footer class="document-footer">
            <div class="footer-bar">
                <div>${escapeHtml(layout.company.companyName || '')}</div>
                <div class="footer-center">Document ${escapeHtml(layout.docNo || '-')}</div>
                <div class="footer-right">${escapeHtml(layout.title)}</div>
            </div>
            ${billBullLogo
            ? `<div class="footer-brand"><img src="${billBullLogo}" alt="Powered by BillBull" /></div>`
            : ''}
        </footer>
    `;
};

const buildCoreStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        font-weight: 400;
        line-height: 1.4;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    body {
        background: #000000;
    }
    .document-shell {
        position: relative;
        width: 100%;
        max-width: 1000px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 8px;
        background: #ffffff;
        overflow: hidden;
    }
    .document-shell,
    .document-shell * {
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        font-weight: 400;
        line-height: 1.4;
        letter-spacing: 0;
    }
    .document-shell > *:not(.document-watermark) {
        position: relative;
        z-index: 1;
    }
    .document-header {
        display: grid;
        grid-template-columns: minmax(max-content, 1.25fr) minmax(140px, 0.85fr) minmax(120px, 0.75fr);
        gap: 20px;
        align-items: start;
        margin-bottom: 16px;
    }
    .document-header-designer {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 18px;
    }
    .document-header-designer .header-left {
        flex: 1 1 0;
        min-width: 0;
    }
    .document-header-designer .header-center {
        flex: 0 0 292px;
        align-self: flex-end;
    }
    .document-header-designer .header-right {
        flex: 0 0 170px;
    }
    .document-title {
        font-size: 20px;
        line-height: 1.2;
        font-weight: 700;
        margin: 0 0 24px;
        color: #000000;
        white-space: nowrap;
        word-break: keep-all;
    }
    .document-header-designer .document-title {
        margin: 0 0 14px;
        white-space: nowrap;
        word-break: keep-all;
        letter-spacing: -0.5px;
        line-height: 1.35;
    }
    .header-center {
        display: grid;
        gap: 10px;
        padding-top: 48px;
        justify-items: end;
        text-align: right;
    }
    .document-header-designer .header-center {
        display: block;
        padding-top: 0;
        padding-bottom: 2px;
        justify-items: stretch;
        text-align: left;
    }
    .designer-meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(118px, 1fr));
        gap: 10px 20px;
        align-items: start;
    }
    .header-right {
        display: grid;
        gap: 10px;
        justify-items: end;
        text-align: right;
        align-self: start;
        padding-top: 0;
    }
    .company-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        max-width: 120px;
        max-height: 96px;
        background: transparent;
    }
    .company-logo img {
        width: auto;
        max-width: 120px;
        max-height: 96px;
        object-fit: contain;
        border: 0;
        border-radius: 0;
    }
    .company-logo-fallback {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        color: #ffffff;
        font-weight: 700;
    }
    .company-logo-fallback span {
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
    }
    .company-panel {
        display: grid;
        gap: 0;
        justify-items: end;
        max-width: 260px;
        text-align: right;
    }
    .document-header-designer .company-panel {
        line-height: 1.55;
    }
    .company-name,
    .company-local-name {
        font-weight: 700;
    }
    .bill-to-block {
        margin-bottom: 16px;
    }
    .bill-to-eyebrow,
    .left-meta-label,
    .doc-meta-label {
        color: #111827;
        font-weight: 700;
    }
    .bill-to-name,
    .bill-to-line,
    .left-meta-value,
    .doc-meta-value,
    .company-copy {
        color: #111827;
    }
    .bill-to-name {
        margin-top: 8px;
    }
    .document-header-designer .bill-to-block {
        margin-bottom: 12px;
    }
    .document-header-designer .bill-to-eyebrow {
        margin-bottom: 4px;
        color: #888888;
        text-transform: uppercase;
    }
    .document-header-designer .bill-to-name {
        margin: 0 0 2px;
    }
    .document-header-designer .bill-to-line {
        color: #444444;
        line-height: 1.65;
        white-space: pre-line;
    }
    .left-meta-block {
        display: grid;
        gap: 12px;
    }
    .doc-meta-item {
        display: grid;
        gap: 4px;
        justify-items: end;
    }
    .document-header-designer .doc-meta-item {
        justify-items: start;
        text-align: left;
        min-width: 0;
    }
    .document-header-designer .doc-meta-label {
        font-size: 8px;
        line-height: 1.2;
        color: #999999;
        font-weight: 500;
        text-transform: none;
    }
    .document-header-designer .doc-meta-value {
        font-size: 9px;
        line-height: 1.2;
        font-weight: 700;
        word-break: normal;
        overflow-wrap: normal;
        white-space: normal;
    }
    .grand-total-display {
        padding: 16px 0;
        text-align: right;
    }
    .document-shell-designer .grand-total-display {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        margin: 8px 0 14px;
        padding: 0;
        border-top: 0;
    }
    .grand-total-label {
        color: #111827;
        font-weight: 700;
        margin-bottom: 4px;
    }
    .document-shell-designer .grand-total-label {
        color: #888888;
        font-weight: 600;
        margin: 0 0 2px;
    }
    .grand-total-value {
        color: #000000;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
    }
    .document-shell-designer .grand-total-value {
        font-weight: 800;
        line-height: 1;
    }
    .layout-addon {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed #e0e0e0;
        color: #334155;
    }
    .content-stack {
        display: grid;
        gap: 16px;
    }
    .document-shell-designer .content-stack {
        display: block;
    }
    .info-card,
    .signature-card {
        border-top: 1px solid #e0e0e0;
        padding-top: 8px;
    }
    .payment-card {
        grid-column: 1 / -1;
    }
    .card-eyebrow {
        color: #6b7280;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 8px;
    }
    .reference-grid {
        display: grid;
        gap: 4px;
    }
    .reference-row {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 10px;
    }
    .reference-label {
        color: #6b7280;
        font-weight: 700;
        text-transform: uppercase;
    }
    .reference-value {
        color: #111827;
        font-weight: 700;
        word-break: break-word;
    }
    .table-section {
        width: 100%;
    }
    .document-shell-designer .table-section {
        margin-bottom: 16px;
    }
    .document-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        border-top: 1px solid #e0e0e0;
    }
    .document-shell-designer .document-table {
        border-top: 0;
        margin-bottom: 0;
    }
    .document-table thead {
        display: table-row-group;
    }
    .document-table thead th {
        padding: 7px 5px;
        background: #ffffff;
        color: #111827;
        font-weight: 700;
        text-align: left;
        border-bottom: 1px solid #e0e0e0;
        white-space: nowrap;
        word-break: keep-all;
        overflow-wrap: normal;
    }
    .document-shell-designer .document-table thead th {
        padding: 6px 8px;
        font-size: 0.944em;
        text-align: center;
        border-bottom: 0;
    }
    .document-table thead th.cell-right {
        text-align: right;
    }
    .document-table thead th.cell-center {
        text-align: center;
    }
    .document-table tbody tr {
        page-break-inside: avoid;
    }
    .table-cell {
        padding: 9px 5px;
        color: #111827;
        vertical-align: top;
        border-bottom: 1px solid #e0e0e0;
        word-break: normal;
        overflow-wrap: break-word;
    }
    .document-shell-designer .table-cell {
        padding: 5px 8px;
    }
    .table-empty {
        padding: 16px 8px;
        text-align: center;
        color: #9ca3af;
        border-bottom: 1px solid #e0e0e0;
    }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .cell-right,
    .cell-center,
    .cell-code {
        word-break: normal;
        overflow-wrap: normal;
        white-space: nowrap;
    }
    .cell-index {
        color: #111827;
        vertical-align: top;
        white-space: nowrap;
        min-width: 18px;
        padding-left: 3px;
        padding-right: 3px;
        line-height: 1.2;
    }
    .cell-code {
        font-size: 9px;
        line-height: 1.2;
        white-space: nowrap;
    }
    .cell-barcode {
        letter-spacing: -0.01em;
    }
    .cell-strong { font-weight: 700; }
    .cell-unit,
    .cell-sub {
        color: #111827;
        margin-top: 4px;
    }
    .cell-description {
        min-width: 0;
    }
    .description-wrap {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
    }
    .item-thumb {
        width: 64px;
        height: 64px;
        max-width: 64px;
        max-height: 64px;
        object-fit: contain;
        flex: 0 0 64px;
        background: transparent;
    }
    .item-thumb-small {
        width: 42px;
        height: 42px;
        max-width: 42px;
        max-height: 42px;
        flex-basis: 42px;
    }
    .item-thumb-placeholder {
        display: inline-block;
        border: 1px solid #f5c74266;
        border-radius: 4px;
        background: #f5c74222;
    }
    .description-copy {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .description-title {
        color: #111827;
        font-weight: 700;
        margin-bottom: 2px;
    }
    .description-line,
    .desc-detail-line {
        color: #111827;
        margin-top: 1px;
    }
    .description-meta {
        color: #6b7280;
        font-size: 0.9em;
        margin-top: 1px;
    }
    .desc-bullets {
        margin: 0;
        padding-left: 1.1em;
        list-style: disc outside;
    }
    .document-shell-designer .desc-bullets {
        padding-left: 0;
        list-style: none;
    }
    .desc-bullet {
        color: #111827;
        margin: 0 0 2px 0;
        line-height: 1.35;
    }
    .document-shell-designer .desc-bullet {
        color: #444444;
        line-height: 1.6;
    }
    .document-shell-designer .desc-bullet::before {
        content: "· ";
    }
    .desc-bullet-short {
        color: #4b5563;
        font-style: italic;
    }
    .desc-discount-line {
        margin-top: 4px;
        color: #e11d48;
        font-size: 0.89em;
        font-weight: 600;
    }
    .summary-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-top: 16px;
    }
    .document-shell-designer .summary-section {
        display: block;
        padding-top: 0;
    }
    .summary-notes {}
    .summary-label {
        color: #9ca3af;
        font-weight: 700;
        margin-bottom: 8px;
    }
    .amount-words {
        margin: 0 0 14px;
        text-align: right;
        color: #374151;
    }
    .bank-box,
    .terms-box {
        margin-bottom: 12px;
        border-radius: 6px;
        padding: 10px 14px;
    }
    .bank-box {
        border: 1px solid #bae6fd;
        background: #f0f9ff;
    }
    .terms-box {
        border: 1px solid #fde68a;
        background: #fffbeb;
    }
    .document-shell-designer .terms-box {
        margin-bottom: 12px;
    }
    .summary-label-bank {
        color: #075985;
    }
    .summary-label-terms {
        color: #92400e;
        margin-top: 0;
    }
    .bank-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 24px;
    }
    .bank-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
    }
    .bank-row span {
        color: #64748b;
    }
    .bank-row strong {
        color: #111827;
        font-weight: 700;
        text-align: right;
    }
    .notes-copy {
        color: #111827;
        white-space: pre-wrap;
    }
    .notes-copy-empty {
        min-height: 58px;
    }
    .summary-totals {
        display: flex;
        justify-content: flex-end;
    }
    .document-shell-designer .summary-totals {
        margin-bottom: 8px;
    }
    .totals-table {
        width: auto;
        border-collapse: collapse;
    }
    .totals-table td {
        padding: 5px 0;
        border: 0;
    }
    .document-shell-designer .totals-table {
        min-width: 260px;
    }
    .document-shell-designer .totals-table td {
        padding-top: 3px;
        padding-bottom: 3px;
    }
    .tot-label {
        color: #111827;
        font-weight: 700;
        text-align: right;
        padding-right: 12px;
        white-space: nowrap;
    }
    .document-shell-designer .tot-label {
        color: #888888;
        font-weight: 400;
        padding-right: 16px;
    }
    .tot-amount {
        color: #111827;
        text-align: right;
        font-weight: 700;
        min-width: 80px;
        white-space: nowrap;
    }
    .document-shell-designer .tot-amount {
        min-width: 110px;
    }
    .tot-currency {
        color: #111827;
        text-align: right;
        font-weight: 700;
        min-width: 42px;
        white-space: nowrap;
        padding-left: 12px !important;
        padding-right: 10px !important;
    }
    .document-shell-designer .tot-currency {
        min-width: 100px;
        padding-left: 0 !important;
        padding-right: 0 !important;
    }
    .grand-total-row td {
        padding-top: 6px;
        font-weight: 700;
        font-size: 11px;
    }
    .document-shell-designer .grand-total-row td {
        padding-top: 6px;
        padding-bottom: 6px;
    }
    .document-shell-designer .grand-total-row .tot-label,
    .document-shell-designer .grand-total-row .tot-currency {
        color: #111827;
        font-weight: 700;
    }
    .document-shell-designer .grand-total-row .tot-amount {
        font-weight: 800;
    }
    .balance-due-row td {
        font-weight: 700;
    }
    .amount-negative td {
        color: #b91c1c;
    }
    .signature-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 16px;
    }
    .signature-line {
        padding-top: 8px;
        border-top: 1px solid #9ca3af;
        text-align: center;
        color: #4b5563;
    }
    .document-footer {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #e0e0e0;
        color: #6b7280;
    }
    .footer-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
    }
    .footer-center {
        flex: 1;
        text-align: center;
    }
    .footer-right {
        text-align: right;
    }
    .footer-brand {
        display: flex;
        justify-content: flex-end;
        margin-top: 6px;
    }
    .footer-brand img {
        width: auto;
        height: 14px;
        opacity: 0.62;
    }
    .document-watermark {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 9;
        overflow: hidden;
    }
    .document-watermark span {
        transform: rotate(-35deg);
        opacity: 0.07;
        color: #111827;
        font-weight: 900;
        font-size: 90px;
        line-height: 1;
        letter-spacing: 8px;
        white-space: nowrap;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .print-date-stamp {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #e0e0e0;
        color: #6b7280;
        text-align: left;
    }
    .stamp-row {
        display: flex;
        align-items: flex-end;
        gap: 20px;
        margin-top: 10px;
    }
    .stamp-container {
        text-align: center;
        width: fit-content;
    }
    .stamp-container img {
        width: 90px;
        height: 90px;
        object-fit: contain;
        opacity: 0.85;
    }
    .stamp-placeholder {
        width: 90px;
        height: 90px;
        border-radius: 50%;
        border: 2px dashed #f5c742;
        background: #f5c7420d;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #b08a00;
        font-weight: 700;
        line-height: 1.4;
    }
    .qr-container {
        text-align: center;
        width: fit-content;
    }
    .qr-container svg {
        display: block;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .stamp-caption {
        margin-top: 4px;
        color: #94a3b8;
        font-size: 7px;
    }
    .page-number-label {
        margin-top: 8px;
        text-align: right;
        color: #cbd5e1;
        font-size: 7px;
    }
    .page-num::before { content: counter(page); }
    .page-total::before { content: counter(pages); }
    @media (max-width: 720px) {
        .document-header,
        .signature-grid {
            grid-template-columns: 1fr;
        }
        .document-title {
            margin-bottom: 16px;
        }
        .header-center,
        .header-right {
            padding-top: 0;
            text-align: left;
            justify-items: start;
        }
        .company-panel {
            justify-items: start;
        }
        .doc-meta-item,
        .header-right,
        .summary-totals {
            text-align: left;
            justify-items: start;
            justify-content: flex-start;
        }
        .tot-label {
            text-align: left;
            padding-right: 14px;
        }
        .footer-bar {
            flex-direction: column;
            align-items: flex-start;
        }
        .footer-center,
        .footer-right {
            text-align: left;
        }
    }
`;

const buildTemplateThemeStyles = (layout) => {
    const theme = layout.theme || buildTheme();
    const mutedBorder = theme.borderColor;
    const mutedBorderSoft = theme.borderColor.startsWith('#') ? `${theme.borderColor}18` : theme.borderColor;
    const accentSoft = theme.accentColor.startsWith('#') ? `${theme.accentColor}22` : theme.accentColor;

    return `
        .document-shell,
        .document-shell * {
            font-family: ${theme.fontFamily};
            font-size: ${theme.fontSize}px;
        }
        .document-title {
            color: ${theme.primaryColor};
            font-size: ${theme.fontSize + (layout.isPurchaseDesigner ? 17 : 10)}px;
        }
        .company-name,
        .company-local-name,
        .bill-to-name,
        .doc-meta-value,
        .reference-value,
        .cell-strong {
            color: ${theme.primaryColor};
        }
        .grand-total-value {
            color: ${theme.grandTotalColor || theme.primaryColor};
            font-size: ${theme.fontSize + (layout.isPurchaseDesigner ? 22 : 7)}px;
        }
        .document-shell-designer .grand-total-display {
            border-top: 0;
        }
        .document-header-designer .company-name {
            font-size: ${theme.fontSize + 3}px;
            font-weight: 700;
        }
        .document-header-designer .bill-to-name {
            font-size: ${theme.fontSize + 1}px;
            font-weight: 700;
        }
        .document-header-designer .doc-meta-value,
        .document-header-designer .left-meta-value,
        .document-header-designer .company-copy,
        .document-header-designer .bill-to-line {
            font-size: ${theme.fontSize}px;
        }
        .document-header-designer .bill-to-eyebrow,
        .document-header-designer .doc-meta-label {
            font-size: ${theme.fontSize - 1}px;
        }
        .document-header-designer .doc-meta-value {
            overflow-wrap: normal;
            word-break: normal;
        }
        .document-header-designer .cell-strong {
            font-size: ${theme.fontSize}px;
        }
        .company-logo-fallback {
            background: ${accentSoft};
            border: ${layout.isPurchaseDesigner ? '3px' : '2px'} solid ${theme.accentColor};
            color: ${theme.accentColor};
            ${layout.isPurchaseDesigner ? 'width: 72px; height: 72px;' : ''}
        }
        .company-logo-fallback span {
            color: ${theme.accentColor};
            ${layout.isPurchaseDesigner ? 'font-size: 32px; font-weight: 900;' : ''}
        }
        .company-logo img {
            ${layout.isPurchaseDesigner ? 'max-width: 120px; max-height: 72px;' : ''}
        }
        .document-table,
        .document-table thead th,
        .table-cell,
        .table-empty,
        .info-card,
        .signature-card,
        .totals-table td {
            border-color: ${mutedBorder};
        }
        .document-table thead th {
            background: ${theme.tableHeaderBg};
            color: ${theme.tableHeaderText};
        }
        .document-table tbody tr:nth-child(even) {
            background: ${layout.isPurchaseDesigner ? '#fafafa' : 'transparent'};
        }
        .document-shell-designer .table-cell {
            border-bottom-color: ${mutedBorderSoft};
        }
        .totals-table .grand-total-row td,
        .totals-table .balance-due-row td {
            background: ${theme.totalRowBg};
        }
        .signature-line {
            border-top-color: ${theme.accentColor};
        }
        ${layout.isPurchaseDesigner ? '' : `.grand-total-display { border-top: 2px solid ${theme.accentColor}; }`}
        .stamp-placeholder {
            border-color: ${theme.accentColor};
            background: ${accentSoft};
            color: ${theme.accentColor};
        }
        .item-thumb-placeholder {
            border-color: ${theme.accentColor};
            background: ${accentSoft};
        }
        .document-watermark span {
            color: ${theme.accentColor};
        }
    `;
};

const buildPrintStyles = (paperSize = 'A4', orientation = 'Portrait', layout = {}) => {
    const resolvedPaperSize = paperSize || 'A4';
    const resolvedOrientation = orientation || 'Portrait';
    const page = resolvePaperDimensions(resolvedPaperSize, resolvedOrientation);
    const shellPadding = layout.isPurchaseDesigner ? '28px 32px' : '12mm';

    return `
        @page {
            size: ${resolvedPaperSize} ${resolvedOrientation};
            margin: 0;
        }
        html,
        body {
            width: ${page.width}mm;
            min-height: ${page.height}mm;
        }
        body {
            background: #000000;
            padding: 0;
        }
        .document-shell {
            width: ${page.width}mm;
            min-height: ${page.height}mm;
            height: auto;
            max-width: none;
            margin: 0 auto;
            padding: ${shellPadding};
            border-radius: 0;
            background: #ffffff;
        }
        .document-footer {
            position: static;
        }
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            html,
            body {
                width: ${page.width}mm;
                min-height: ${page.height}mm;
                background: #ffffff;
            }
            body {
                padding: 0;
            }
            .document-shell {
                width: ${page.width}mm;
                min-height: ${page.height}mm;
                height: auto;
                margin: 0;
                padding: ${shellPadding};
                border-radius: 0;
                box-shadow: none;
            }
            /* Force 3-column header layout — prevents the responsive breakpoint
               from collapsing columns on narrow paper sizes like A4 */
            .document-header {
                grid-template-columns: minmax(max-content, 1.25fr) minmax(140px, 0.85fr) minmax(120px, 0.75fr) !important;
                gap: 20px !important;
            }
            .document-header-designer {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                gap: 16px !important;
                margin-bottom: 18px !important;
            }
            .document-header-designer .header-left {
                flex: 1 1 0 !important;
                min-width: 0 !important;
            }
            .document-header-designer .header-center {
                flex: 0 0 292px !important;
                align-self: flex-end !important;
            }
            .document-header-designer .header-right {
                flex: 0 0 170px !important;
            }
            .signature-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
            .document-title {
                margin-bottom: 24px !important;
            }
            .document-header-designer .document-title {
                margin-bottom: 14px !important;
                white-space: nowrap !important;
                word-break: keep-all !important;
                line-height: 1.35 !important;
            }
            .document-table thead {
                display: table-row-group !important;
            }
            .header-center {
                padding-top: 48px !important;
                text-align: right !important;
                justify-items: end !important;
            }
            .document-header-designer .header-center {
                display: block !important;
                padding-top: 0 !important;
                padding-bottom: 2px !important;
                text-align: left !important;
                justify-items: stretch !important;
            }
            .document-header-designer .designer-meta-grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(118px, 1fr)) !important;
                gap: 10px 20px !important;
            }
            .document-header-designer .doc-meta-item {
                text-align: left !important;
                justify-items: start !important;
            }
            .header-right {
                padding-top: 0 !important;
                text-align: right !important;
                justify-items: end !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
                gap: 5px !important;
            }
            .company-logo {
                display: flex !important;
                justify-content: flex-end !important;
                align-items: flex-end !important;
                width: 100% !important;
                max-width: none !important;
            }
            .company-logo img {
                display: block !important;
                max-width: 120px !important;
                max-height: 80px !important;
                object-fit: contain !important;
                margin-left: auto !important;
            }
            .company-logo-fallback {
                margin-left: auto !important;
            }
            .company-panel {
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
                text-align: right !important;
                width: 100% !important;
            }
            .company-name,
            .company-local-name,
            .company-copy {
                text-align: right !important;
            }
            .doc-meta-item {
                text-align: right !important;
                justify-items: end !important;
            }
            .summary-totals {
                justify-content: flex-end !important;
            }
            .tot-label {
                text-align: right !important;
                padding-right: 12px !important;
            }
            .footer-bar {
                flex-direction: row !important;
                align-items: center !important;
            }
            .footer-center,
            .footer-right {
                text-align: right !important;
            }
        }
    `;
};

// QA-040: email mode renders on a soft canvas with breathing room around the
// content (mirrors the print preview's paper feel), but without a dark
// outer border. Works equally well in Gmail's reading pane and in the
// in-app preview iframe.
const buildEmailStyles = () => `
    body {
        background: #f5f6f7;
        padding: 24px;
        margin: 0;
    }
    .document-shell {
        width: auto;
        max-width: 1000px;
        margin: 0 auto;
        padding: 32px;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    /* Email clients ignore CSS Grid / Flex on these blocks — force block
       layout so the right column stacks: logo on top, company address
       lines below it (mirrors the print layout). */
    .company-logo,
    .company-panel,
    .company-panel * {
        display: block !important;
    }
    .company-logo {
        text-align: right;
        margin-left: auto;
        margin-bottom: 8px;
    }
    .company-logo img {
        display: inline-block !important;
    }
    .company-panel {
        text-align: right;
        max-width: 260px;
        margin-left: auto;
    }
    /* Force the totals table to sit on the right inside its email cell
       (juice inlines display:flex which Gmail flattens — without this
       the totals would slide back to the left of the row). */
    .totals-table {
        margin-left: auto !important;
        width: auto !important;
    }
    .totals-table td.tot-label,
    .totals-table td.tot-amount {
        padding: 4px 0 4px 16px !important;
    }
`;

const enrichItems = (items, documentSalesPerson = '', documentLocation = '', category = '') => {
    const enriched = items.map((item) => ({
        ...item,
        salesPerson: firstNonEmpty(item.salesPerson, documentSalesPerson),
        location: firstNonEmpty(item.location, documentLocation)
    }));

    if (category !== 'Pick List') return enriched;

    const flattened = [];
    for (const item of enriched) {
        const selections = Array.isArray(item.batchSelections) ? item.batchSelections : [];
        if (selections.length === 0) {
            flattened.push({
                ...item,
                location: item.location || documentLocation || '-',
                batchNumber: '',
                expiry: ''
            });
        } else {
            for (const sel of selections) {
                flattened.push({
                    ...item,
                    location: sel.binCode || item.location || documentLocation || '-',
                    batchNumber: sel.batchNumber || '',
                    expiry: sel.expiryDate || '',
                    qty: sel.quantity != null ? asNumber(sel.quantity) : item.qty
                });
            }
        }
    }

    flattened.sort((a, b) => {
        const locCmp = asText(a.location).localeCompare(asText(b.location));
        if (locCmp !== 0) return locCmp;
        return asText(a.batchNumber).localeCompare(asText(b.batchNumber));
    });

    return flattened;
};

const normalisePurchaseLayout = (template, data, companyProfile, renderTarget, options = {}) => {
    const company = normalizeDocumentCompanyProfile(companyProfile);
    const designerSettings = getTemplateDesignerSettings(template);
    const isSalesDesigner = isSalesDesignerTemplate(template);
    const templateLogoUrl = resolveTemplateImageUrl(designerSettings.logoUrl || designerSettings.companyLogoUrl);
    const templateStampUrl = resolveTemplateImageUrl(designerSettings.stampUrl || designerSettings.stampImage);
    const companyVisibility = buildCompanyVisibility(designerSettings);
    const partyVisibility = buildPartyVisibility(designerSettings);
    const theme = buildTheme(template);
    const displayOptions = sanitizeTemplateDisplayOptions(
        template.displayOptions,
        {
            ...DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
            showTerms: template.category !== 'Payment Voucher'
        }
    );
    const columnOptions = applyDesignerColumnVisibility(
        sanitizeTemplateColumns(template.columns, getColumnDefaults(template.category, true)),
        designerSettings
    );
    const columnModel = createColumnModel(columnOptions);
    const currency = resolveCurrency(company, data.totals || {}, data.summaryAmount || {});
    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter((row) => row?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter((row) => row?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter((row) => row?.value) : [];
    const documentSalesPerson = firstNonEmpty(
        data.meta?.salesPerson,
        data.meta?.salesperson,
        headerMeta.find((row) => /buyer|prepared by|salesperson|sales person/i.test(asText(row.label)))?.value,
        references.find((row) => /buyer|prepared by|salesperson|sales person/i.test(asText(row.label)))?.value
    );
    const documentLocation = firstNonEmpty(
        data.meta?.location,
        data.meta?.branch,
        data.meta?.branchName,
        headerMeta.find((row) => /location|warehouse|branch/i.test(asText(row.label)))?.value,
        references.find((row) => /location|warehouse|branch/i.test(asText(row.label)))?.value
    );
    const showDocNo = pickSetting(
        designerSettings,
        ['showDocNumber', 'showInvoiceNumber', 'showGRNNumber', 'showLpoNumber', 'showLPONumber', 'showVoucherNumber', 'showReceiptNumber'],
        true
    );
    const showDate = pickSetting(
        designerSettings,
        ['showDocDate', 'showInvoiceDate', 'showGRNDate', 'showLpoDate', 'showLPODate', 'showVoucherDate', 'showReceiptDate'],
        true
    );

    const headerRows = [
        ...(showDate ? [{ label: 'Date', value: data.date || '-' }] : []),
        ...headerMeta.filter((row) => /due date|expected delivery|valid/i.test(asText(row.label)))
    ]
        .filter((row) => row?.value)
        .filter((row) => shouldShowPurchaseMetaRow(row, designerSettings));

    const referenceRows = sortPurchaseDesignerMetaRows([
        ...headerMeta.filter((row) => !/due date|expected delivery|valid/i.test(asText(row.label))),
        ...references,
        visibleWhen(designerSettings, ['showCurrency'], true) ? { label: 'Currency', value: currency } : null
    ]
        .filter((row) => row?.value)
        .filter((row) => shouldShowPurchaseMetaRow(row, designerSettings)));

    const items = enrichItems(
        Array.isArray(data.items) ? data.items.map(normaliseItem) : [],
        documentSalesPerson,
        documentLocation,
        template.category
    );
    const summaryLabel = data.summaryAmount?.label || (asNumber(data.totals?.balanceDue) > 0 ? 'Balance Due' : 'Grand Total');
    const summaryValue = data.summaryAmount?.value ?? (
        summaryLabel.toLowerCase().includes('balance')
            ? data.totals?.balanceDue
            : data.totals?.grandTotal
    );
    const totals = {
        subTotal: asNumber(data.totals?.subTotal),
        tax: asNumber(data.totals?.tax),
        grandTotal: asNumber(data.totals?.grandTotal ?? data.summaryAmount?.value),
        amountPaid: asNumber(data.totals?.amountPaid),
        balanceDue: asNumber(data.totals?.balanceDue),
        billDiscount: asNumber(data.totals?.billDiscount),
        billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount),
        deliveryCharge: asNumber(data.totals?.deliveryCharge),
        roundOff: asNumber(data.totals?.roundOff)
    };
    const totalVisibility = {
        taxable: pickSetting(designerSettings, ['showTaxableTotal'], false),
        subTotal: pickSetting(designerSettings, ['showSubtotal'], true),
        discount: pickSetting(designerSettings, ['showDiscountTotal', 'showDiscount'], true),
        tax: pickSetting(designerSettings, ['showVATTotal', 'showTaxTotal'], true),
        deliveryCharge: pickSetting(designerSettings, ['showDeliveryCharge'], true),
        roundOff: pickSetting(designerSettings, ['showRoundOff'], true),
        grandTotal: pickSetting(designerSettings, ['showGrandTotal', 'showTotalReturn', 'showTotalReceivedBold'], true),
        amountPaid: pickSetting(designerSettings, ['showAmountPaid', 'showTotalReceivedBold'], true),
        balanceDue: pickSetting(designerSettings, ['showBalanceDue', 'showRemainingBalance'], true),
    };

    return {
        title: resolveDocumentTitle(template, data, 'Purchase Document'),
        category: template.category || '',
        docNo: asText(data.docNo || ''),
        docNoLabel: DOC_NO_LABELS[template.category] || 'Document Number',
        status: asText(data.status || ''),
        company,
        currency,
        isPurchaseDesigner: true,
        logoUrl: templateLogoUrl || company.logoUrl,
        stampUrl: templateStampUrl || company.stampUrl,
        companyVisibility,
        partyVisibility,
        theme,
        showDocNo,
        partyLabel: isSalesDesigner
            ? (template.category === 'Receipt Voucher' ? 'Received From' : 'Bill To')
            : template.category === 'Payment Voucher'
                ? 'Paid To'
                : template.category === 'Local Purchase Order'
                    ? 'Bill To'
                    : 'Vendor',
        party: data.party || null,
        shipTo: data.shipTo || null,
        showShipTo: pickSetting(designerSettings, ['showShipTo'], false),
        referenceRows,
        paymentRows: paymentDetails,
        headerRows,
        items,
        columnOptions,
        columnModel,
        totals,
        notes: asText(data.notes || ''),
        terms: asText(template.termsContent || designerSettings.termsText || designerSettings.termsConditions || ''),
        displayOptions,
        totalVisibility,
        showNotesSection: pickSetting(designerSettings, ['showNotes', 'showNote'], true),
        notesLabel: asText(designerSettings.notesLabel || 'Notes'),
        showAmountInWords: pickSetting(designerSettings, ['showAmountInWords'], false),
        bankRows: pickSetting(designerSettings, ['showBankDetails'], false)
            ? [
                { label: 'Bank', value: designerSettings.bankName },
                { label: 'Account', value: designerSettings.bankAccount },
                { label: 'IBAN', value: designerSettings.bankIBAN },
                { label: 'SWIFT / BIC', value: designerSettings.bankSWIFT },
            ].filter((row) => row.value)
            : [],
        showItemTable: items.length > 0 && pickSetting(designerSettings, ['showItemsTable', 'showItemTable'], true),
        showTotalsSection: !data.hideTotalsTable && (totals.grandTotal > 0 || totals.amountPaid > 0),
        showHighlight: summaryValue !== undefined && summaryValue !== null && asNumber(summaryValue) > 0 &&
            pickSetting(designerSettings, ['showGrandTotalBanner', 'showSummaryBar', 'showTotalReceivedBold'], true),
        showPaymentDetails: paymentDetails.length > 0,
        showSignatureBlock: pickSetting(designerSettings, ['showSignatures', 'showSignatureStrip', 'showReceivedByLine'], false),
        showCompanyStamp: pickSetting(designerSettings, ['showCompanyStamp', 'showStamp'], false),
        showQRCode: pickSetting(designerSettings, ['showQRCode', 'showQR'], false),
        qrCodeDataUrl: options.qrCodeDataUrl || null,
        showPageNumbers: pickSetting(designerSettings, ['showPageNumbers'], false),
        showPrintDateStamp: pickSetting(designerSettings, ['showGeneratedBy'], false),
        showWatermark: pickSetting(designerSettings, ['showWatermark'], false),
        hasDesignerWatermarkToggle: Object.prototype.hasOwnProperty.call(designerSettings, 'showWatermark'),
        watermarkText: asText(designerSettings.watermarkText || 'ORIGINAL'),
        highlight: {
            label: summaryLabel,
            value: asNumber(summaryValue)
        },
        headerAddon: resolveCompanyVars(template.headerContent, company),
        footerAddon: resolveCompanyVars(template.footerContent, company),
        renderTarget
    };
};

const normaliseSalesDesignerLayout = (template, data, companyProfile, renderTarget, options = {}) => {
    const company = normalizeDocumentCompanyProfile(companyProfile);
    const designerSettings = getTemplateDesignerSettings(template);
    const templateLogoUrl = resolveTemplateImageUrl(designerSettings.logoUrl || designerSettings.companyLogoUrl);
    const templateStampUrl = resolveTemplateImageUrl(designerSettings.stampUrl || designerSettings.stampImage);
    const companyVisibility = buildCompanyVisibility(designerSettings);
    const partyVisibility = buildPartyVisibility(designerSettings);
    const theme = buildTheme(template);
    const displayOptions = sanitizeTemplateDisplayOptions(template.displayOptions, DEFAULT_TEMPLATE_DISPLAY_OPTIONS);
    const columnOptions = applyDesignerColumnVisibility(
        sanitizeTemplateColumns(template.columns, getColumnDefaults(template.category, false)),
        designerSettings
    );
    const columnModel = createColumnModel(columnOptions);
    const currency = resolveCurrency(company, data.totals || {}, {});
    const customer = data.customer || {};
    const documentSalesPerson = firstNonEmpty(
        data.meta?.salesPerson, data.meta?.salesperson, data.meta?.accountExecutive
    );
    const documentLocation = firstNonEmpty(
        data.meta?.locationStore, data.meta?.location, data.meta?.branch, data.meta?.branchName, data.meta?.warehouse
    );
    const items = enrichItems(
        Array.isArray(data.items) ? data.items.map(normaliseItem) : [],
        documentSalesPerson,
        documentLocation,
        template.category
    );
    const totals = {
        subTotal: asNumber(data.totals?.subTotal),
        tax: asNumber(data.totals?.tax),
        grandTotal: asNumber(data.totals?.grandTotal),
        amountPaid: asNumber(data.totals?.amountPaid),
        balanceDue: asNumber(data.totals?.balanceDue),
        billDiscount: asNumber(data.totals?.billDiscount),
        billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount),
        deliveryCharge: asNumber(data.totals?.deliveryCharge),
        roundOff: asNumber(data.totals?.roundOff)
    };
    const totalVisibility = {
        taxable: pickSetting(designerSettings, ['showTaxableTotal'], false),
        subTotal: pickSetting(designerSettings, ['showSubtotal'], true),
        discount: pickSetting(designerSettings, ['showDiscountTotal', 'showDiscount'], true),
        tax: pickSetting(designerSettings, ['showVATTotal', 'showTaxTotal'], true),
        deliveryCharge: pickSetting(designerSettings, ['showDeliveryCharge'], true),
        roundOff: pickSetting(designerSettings, ['showRoundOff'], true),
        grandTotal: pickSetting(designerSettings, ['showGrandTotal'], true),
        amountPaid: pickSetting(designerSettings, ['showAmountPaid'], true),
        balanceDue: pickSetting(designerSettings, ['showBalanceDue', 'showRemainingBalance'], true),
    };

    const showDocNo = pickSetting(designerSettings,
        ['showDocNumber', 'showInvoiceNumber', 'showOrderNumber', 'showQuoteNumber'], true);
    const showDate = pickSetting(designerSettings,
        ['showDocDate', 'showInvoiceDate', 'showOrderDate', 'showQuoteDate'], true);

    const headerRows = [
        showDate ? { label: 'Date', value: data.date || '-' } : null,
        pickSetting(designerSettings, ['showDueDate'], false) && firstNonEmpty(data.meta?.dueDate, data.meta?.validTill)
            ? { label: 'Due Date', value: firstNonEmpty(data.meta?.dueDate, data.meta?.validTill) }
            : null,
        pickSetting(designerSettings, ['showValidUntil'], false) && data.meta?.validTill
            ? { label: data.meta?.validTillLabel || 'Valid Until', value: data.meta.validTill }
            : null,
    ].filter(Boolean);

    const linkedQuotation = firstNonEmpty(data.meta?.linkedQuotation, data.meta?.quotationNo, data.meta?.quotationNumber);
    const linkedSalesOrder = firstNonEmpty(data.meta?.linkedSalesOrder, data.meta?.salesOrderNo, data.meta?.salesOrderNumber);
    const linkedSalesInvoice = firstNonEmpty(data.meta?.linkedSalesInvoice, data.meta?.salesInvoiceNo, data.meta?.salesInvoiceNumber, data.meta?.linkedInvoice);
    const hasExplicitLinks = Boolean(linkedQuotation || linkedSalesOrder || linkedSalesInvoice);

    const poRefValue = data.meta?.poNumber || (!hasExplicitLinks && data.meta?.reference) || '';
    const poRefLabel = data.meta?.poNumber ? 'P.O Number' : 'Reference';

    const referenceRows = [
        pickSetting(designerSettings, ['showPOReference'], true) && poRefValue
            ? { label: poRefLabel, value: poRefValue } : null,
        pickSetting(designerSettings, ['showSalesperson', 'showReceivedBy'], true) && documentSalesPerson
            ? { label: 'Account Executive', value: documentSalesPerson } : null,
        pickSetting(designerSettings, ['showPaymentTerms'], false) && (data.meta?.paymentTerm || data.meta?.paymentTerms)
            ? { label: 'Payment Terms', value: data.meta.paymentTerm || data.meta.paymentTerms } : null,
        pickSetting(designerSettings, ['showDeliveryTerms'], false) && data.meta?.deliveryTerms
            ? { label: 'Delivery Terms', value: data.meta.deliveryTerms } : null,
        pickSetting(designerSettings, ['showLocationStore'], false) && firstNonEmpty(data.meta?.locationStore, data.meta?.location)
            ? { label: 'Location / Store', value: firstNonEmpty(data.meta?.locationStore, data.meta?.location) } : null,
        pickSetting(designerSettings, ['showWarehouseStore', 'showBranch'], false) && firstNonEmpty(data.meta?.warehouse, data.meta?.branchName)
            ? { label: 'Warehouse / Store', value: firstNonEmpty(data.meta?.warehouse, data.meta?.branchName) } : null,
        visibleWhen(designerSettings, ['showCurrency'], false) ? { label: 'Currency', value: currency } : null,
        columnOptions.quotationNo && linkedQuotation ? { label: 'Quotation No.', value: linkedQuotation } : null,
        columnOptions.salesOrderNo && linkedSalesOrder ? { label: 'Sales Order No.', value: linkedSalesOrder } : null,
        columnOptions.salesInvoiceNo && linkedSalesInvoice ? { label: 'Sales Invoice No.', value: linkedSalesInvoice } : null,
    ].filter(Boolean);

    const summaryValue = totals.balanceDue > 0 ? totals.balanceDue : totals.grandTotal;
    const shipToAddress = firstNonEmpty(
        customer.shipToAddress, customer.shippingAddress,
        data.meta?.shipToAddress, data.meta?.shippingAddress
    );

    return {
        title: resolveDocumentTitle(template, data, 'Document'),
        category: template.category || '',
        docNo: asText(data.docNo || ''),
        docNoLabel: DOC_NO_LABELS[template.category] || 'Document Number',
        status: asText(data.meta?.status || ''),
        company,
        currency,
        isPurchaseDesigner: true,
        logoUrl: templateLogoUrl || company.logoUrl,
        stampUrl: templateStampUrl || company.stampUrl,
        companyVisibility,
        partyVisibility,
        theme,
        showDocNo,
        partyLabel: asText(data.meta?.partyLabel || 'Bill To'),
        party: {
            name: firstNonEmpty(customer.name, customer.customerName, 'Unknown Customer'),
            code: firstNonEmpty(customer.code, customer.customerCode),
            address: firstNonEmpty(customer.address, customer.billingAddress),
            phone: firstNonEmpty(customer.phone, customer.mobile),
            email: firstNonEmpty(customer.email),
            taxId: firstNonEmpty(customer.trn, customer.taxId)
        },
        shipTo: shipToAddress ? {
            name: firstNonEmpty(data.meta?.shipToName),
            address: shipToAddress,
            phone: firstNonEmpty(data.meta?.shipToPhone),
            email: firstNonEmpty(data.meta?.shipToEmail),
        } : null,
        showShipTo: pickSetting(designerSettings, ['showShipTo'], false),
        referenceRows,
        paymentRows: [],
        headerRows,
        items,
        columnOptions,
        columnModel,
        totals,
        totalVisibility,
        notes: asText(data.meta?.notes || ''),
        notesLabel: asText(designerSettings.notesLabel || 'Notes'),
        terms: asText(template.termsContent || designerSettings.termsText || designerSettings.termsConditions || ''),
        displayOptions,
        showNotesSection: pickSetting(designerSettings, ['showNotes', 'showNote'], true),
        showAmountInWords: pickSetting(designerSettings, ['showAmountInWords'], false),
        bankRows: pickSetting(designerSettings, ['showBankDetails'], false)
            ? [
                { label: 'Bank', value: designerSettings.bankName },
                { label: 'Account', value: designerSettings.bankAccount },
                { label: 'IBAN', value: designerSettings.bankIBAN },
                { label: 'SWIFT / BIC', value: designerSettings.bankSWIFT },
            ].filter((row) => row.value)
            : [],
        showItemTable: items.length > 0 && pickSetting(designerSettings, ['showItemsTable', 'showItemTable'], true),
        showTotalsSection: totals.grandTotal > 0 || totals.amountPaid > 0,
        showHighlight: summaryValue > 0 && pickSetting(designerSettings, ['showGrandTotalBanner', 'showSummaryBar'], true),
        showPaymentDetails: false,
        showSignatureBlock: pickSetting(designerSettings, ['showSignatures', 'showSignatureStrip'], false),
        showCompanyStamp: pickSetting(designerSettings, ['showCompanyStamp', 'showStamp'], false),
        showQRCode: pickSetting(designerSettings, ['showQRCode', 'showQR'], false),
        qrCodeDataUrl: options.qrCodeDataUrl || null,
        showPageNumbers: pickSetting(designerSettings, ['showPageNumbers'], false),
        showPrintDateStamp: pickSetting(designerSettings, ['showGeneratedBy'], false),
        showWatermark: pickSetting(designerSettings, ['showWatermark'], false),
        hasDesignerWatermarkToggle: Object.prototype.hasOwnProperty.call(designerSettings, 'showWatermark'),
        watermarkText: asText(designerSettings.watermarkText || 'ORIGINAL'),
        highlight: {
            label: totals.balanceDue > 0 ? 'Balance Due' : 'Grand Total',
            value: asNumber(summaryValue)
        },
        headerAddon: resolveCompanyVars(template.headerContent, company),
        footerAddon: resolveCompanyVars(template.footerContent, company),
        renderTarget
    };
};

const normaliseGenericLayout = (template, data, companyProfile, renderTarget) => {
    const company = normalizeDocumentCompanyProfile(companyProfile);
    const displayOptions = sanitizeTemplateDisplayOptions(template.displayOptions);
    const columnOptions = sanitizeTemplateColumns(template.columns, getColumnDefaults(template.category, false));
    const columnModel = createColumnModel(columnOptions);
    const currency = resolveCurrency(company, data.totals || {}, {});
    const customer = data.customer || {};
    const documentSalesPerson = firstNonEmpty(data.meta?.salesPerson, data.meta?.salesperson, data.meta?.accountExecutive);
    const documentLocation = firstNonEmpty(data.meta?.location, data.meta?.branch, data.meta?.branchName, data.meta?.warehouse);
    const items = enrichItems(
        Array.isArray(data.items) ? data.items.map(normaliseItem) : [],
        documentSalesPerson,
        documentLocation,
        template.category
    );
    const totals = {
        subTotal: asNumber(data.totals?.subTotal),
        tax: asNumber(data.totals?.tax),
        grandTotal: asNumber(data.totals?.grandTotal),
        amountPaid: asNumber(data.totals?.amountPaid),
        balanceDue: asNumber(data.totals?.balanceDue),
        billDiscount: asNumber(data.totals?.billDiscount),
        billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount),
        deliveryCharge: asNumber(data.totals?.deliveryCharge),
        roundOff: asNumber(data.totals?.roundOff)
    };
    const highlightValue = totals.balanceDue > 0 ? totals.balanceDue : totals.grandTotal;
    // QA-031: pull each linked source-doc number out as its own labeled row
    // (toggled per template). Fall back to data.meta.reference as a free-text
    // catch-all when no individual links are passed.
    const linkedQuotation = firstNonEmpty(data.meta?.linkedQuotation, data.meta?.quotationNo, data.meta?.quotationNumber);
    const linkedSalesOrder = firstNonEmpty(data.meta?.linkedSalesOrder, data.meta?.salesOrderNo, data.meta?.salesOrderNumber);
    const linkedSalesInvoice = firstNonEmpty(data.meta?.linkedSalesInvoice, data.meta?.salesInvoiceNo, data.meta?.salesInvoiceNumber, data.meta?.linkedInvoice);
    const hasExplicitLinks = Boolean(linkedQuotation || linkedSalesOrder || linkedSalesInvoice);

    const referenceRows = [
        data.meta?.poNumber ? { label: 'P.O Number', value: data.meta.poNumber } : null,
        columnOptions.salesPerson && documentSalesPerson ? { label: 'Sales Person', value: documentSalesPerson } : null,
        columnOptions.quotationNo && linkedQuotation ? { label: 'Quotation No.', value: linkedQuotation } : null,
        columnOptions.salesOrderNo && linkedSalesOrder ? { label: 'Sales Order No.', value: linkedSalesOrder } : null,
        columnOptions.salesInvoiceNo && linkedSalesInvoice ? { label: 'Sales Invoice No.', value: linkedSalesInvoice } : null,
        // Suppress the catch-all Reference row when explicit links rendered —
        // avoids the duplicate "SO: X | PI: Y | SI: Z" string we used to jam in.
        !hasExplicitLinks && data.meta?.reference ? { label: 'Reference', value: data.meta.reference } : null,
        columnOptions.location && documentLocation ? { label: 'Location / Branch', value: documentLocation } : null
    ].filter(Boolean);

    return {
        title: resolveDocumentTitle(template, data, 'Document'),
        category: template.category || '',
        docNo: asText(data.docNo || ''),
        docNoLabel: DOC_NO_LABELS[template.category] || 'Document Number',
        status: asText(data.meta?.status || ''),
        company,
        currency,
        partyLabel: asText(data.meta?.partyLabel || 'Bill To'),
        party: {
            name: firstNonEmpty(customer.name, customer.customerName, 'Unknown Customer'),
            code: firstNonEmpty(customer.code, customer.customerCode),
            address: firstNonEmpty(customer.address, customer.billingAddress),
            phone: firstNonEmpty(customer.phone, customer.mobile),
            email: firstNonEmpty(customer.email),
            taxId: firstNonEmpty(customer.trn, customer.taxId)
        },
        referenceRows,
        paymentRows: [],
        headerRows: [
            { label: 'Date', value: data.date || '-' },
            ...(data.meta?.validTill ? [{ label: data.meta.validTillLabel || 'Due Date', value: data.meta.validTill }] : [])
        ],
        items,
        columnOptions,
        columnModel,
        totals,
        notes: asText(data.meta?.notes || ''),
        terms: asText(template.termsContent || ''),
        displayOptions,
        showItemTable: items.length > 0,
        showTotalsSection: totals.grandTotal > 0 || totals.amountPaid > 0,
        showHighlight: highlightValue > 0,
        showPaymentDetails: false,
        showSignatureBlock: false,
        highlight: {
            label: totals.balanceDue > 0 ? 'Balance Due' : 'Grand Total',
            value: highlightValue
        },
        headerAddon: resolveCompanyVars(template.headerContent, company),
        footerAddon: resolveCompanyVars(template.footerContent, company),
        renderTarget
    };
};

const buildLayout = (template, data, options = {}, renderTarget = 'print') => {
    const companyProfile = options.companyProfile || {};

    if (PURCHASE_TEMPLATE_CATEGORIES.has(template?.category) || looksLikePurchasePayload(data)) {
        return normalisePurchaseLayout(template, data, companyProfile, renderTarget, options);
    }

    if (hasDesignerLayoutSettings(template)) {
        return normaliseSalesDesignerLayout(template, data, companyProfile, renderTarget, options);
    }

    return normaliseGenericLayout(template, data, companyProfile, renderTarget);
};

const titleCaseStatementType = (type) => {
    const text = asText(type).trim();
    if (!text) return '-';

    return text
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const normalizeStatementRows = (data = {}) => {
    const rows = Array.isArray(data.statementRows)
        ? data.statementRows
        : Array.isArray(data.statement?.entries)
            ? data.statement.entries
            : Array.isArray(data.entries)
                ? data.entries
                : [];

    return rows.map((row, index) => {
        const type = firstNonEmpty(row.type, row.entryType);
        return {
            rowNo: row.rowNo || index + 1,
            date: firstNonEmpty(row.date, row.transactionDate),
            type,
            typeLabel: firstNonEmpty(row.typeLabel, titleCaseStatementType(type)),
            documentNo: firstNonEmpty(row.documentNo, row.docNo),
            description: firstNonEmpty(row.description, titleCaseStatementType(type)),
            reference: firstNonEmpty(row.reference, row.ref),
            debit: asNumber(row.debit),
            credit: asNumber(row.credit),
            balance: asNumber(row.balance ?? row.runningBalance),
            status: firstNonEmpty(row.status),
        };
    });
};

const isStatementRowVisible = (row, settings = {}, statementKind = 'vendor') => {
    const type = `${row.type || ''} ${row.typeLabel || ''} ${row.description || ''}`.toLowerCase();
    const isOpening = /opening/.test(type);
    const isPdc = /pdc|post[-\s]?dated|cheque|check/.test(type);

    if (isOpening) return pickSetting(settings, ['showOpeningBalance'], true);
    if (isPdc) return pickSetting(settings, ['showPDC', 'showPdc'], true);

    if (statementKind === 'customer') {
        const isSale = /invoice|sale|sales|debit/.test(type) || (row.debit > 0 && row.credit === 0);
        const isReceipt = /payment|receipt|voucher|credit/.test(type) || (row.credit > 0 && row.debit === 0);

        if (isSale) return pickSetting(settings, ['showSales', 'showPurchases'], true);
        if (isReceipt) return pickSetting(settings, ['showReceipts', 'showPayments'], true);
        return true;
    }

    const isPurchase = /invoice|purchase|bill|grn|goods receipt|lpo/.test(type) || (row.credit > 0 && row.debit === 0);
    const isPayment = /payment|receipt|voucher/.test(type) || (row.debit > 0 && row.credit === 0);

    if (isPurchase) return pickSetting(settings, ['showPurchases'], true);
    if (isPayment) return pickSetting(settings, ['showPayments'], true);

    return true;
};

const renderVendorStatementHtml = (template = {}, data = {}, options = {}, renderTarget = 'print') => {
    const isCustomerStatement = template?.category === 'Customer Statement of Account' || data.statementKind === 'customer';
    const partyLabel = isCustomerStatement ? 'Customer' : 'Vendor';
    const documentLabel = isCustomerStatement ? 'Customer Statement of Account' : 'Vendor Statement of Account';
    const company = normalizeDocumentCompanyProfile(options.companyProfile || {});
    const settings = getTemplateDesignerSettings(template);
    const displayOptions = sanitizeTemplateDisplayOptions(template.displayOptions, DEFAULT_TEMPLATE_DISPLAY_OPTIONS);
    const paperSize = ['A3', 'A4', 'A5', 'Letter', 'Legal'].includes(firstNonEmpty(settings.paperSize, settings.pageSize, template.paperSize))
        ? firstNonEmpty(settings.paperSize, settings.pageSize, template.paperSize)
        : 'A4';
    const orientation = /landscape/i.test(firstNonEmpty(settings.orientation, template.orientation))
        ? 'landscape'
        : 'portrait';
    const rawMargins = settings.margins && typeof settings.margins === 'object' ? settings.margins : {};
    const marginValue = (side, fallback) => {
        const parsed = Number(rawMargins[side]);
        return Number.isFinite(parsed) ? Math.max(4, Math.min(40, parsed)) : fallback;
    };
    const margins = {
        top: marginValue('top', 14),
        right: marginValue('right', 12),
        bottom: marginValue('bottom', 14),
        left: marginValue('left', 12),
    };
    const accentColor = sanitizeCssColor(settings.accentColor || settings.primaryColor, '#F5C742');
    const headerBg = sanitizeCssColor(settings.headerBg || settings.headerBackgroundColor, '#1e293b');
    const borderColor = sanitizeCssColor(settings.borderColor, '#dbe2ea');
    const fontFamily = sanitizeCssFontFamily(settings.fontFamily, "'Inter', Arial, sans-serif");
    const baseFontSize = Math.min(16, Math.max(11, Number(settings.fontSize) || 13));
    const showBorder = pickSetting(settings, ['showBorder'], true);
    const showLogo = pickSetting(settings, ['showLogo', 'showCompanyLogo'], true);
    const showQuickSummary = pickSetting(settings, ['showQuickSummary'], true);
    const showOpeningBalance = pickSetting(settings, ['showOpeningBalance'], true);
    const showPurchases = pickSetting(settings, ['showPurchases', 'showSales'], true);
    const showPayments = pickSetting(settings, ['showPayments', 'showReceipts'], true);
    const showClosingBalance = pickSetting(settings, ['showClosingBalance'], true);
    const companyVisibility = buildCompanyVisibility(settings);
    const partyVisibility = buildPartyVisibility(settings);
    const logoUrl = showLogo
        ? (resolveTemplateImageUrl(settings.logoUrl || settings.companyLogoUrl) || company.logoUrl)
        : '';
    const party = data.party || {};
    const statement = data.statement || {};
    const rows = normalizeStatementRows(data).filter((row) => isStatementRowVisible(row, settings, isCustomerStatement ? 'customer' : 'vendor'));
    const currency = resolveCurrency(company, data.totals || {}, data.summaryAmount || {});
    const currencyHtml = renderCurrencyForLayout(currency, displayOptions);
    const openingBalance = asNumber(statement.openingBalance ?? data.totals?.openingBalance);
    const totalDebit = asNumber(statement.totalDebit ?? data.totals?.totalDebit ?? data.totals?.amountPaid);
    const totalCredit = asNumber(statement.totalCredit ?? data.totals?.totalCredit ?? data.totals?.subTotal);
    const closingBalance = asNumber(statement.closingBalance ?? data.totals?.closingBalance ?? data.totals?.balanceDue);
    const positiveLabel = firstNonEmpty(data.positiveBalanceLabel, 'Cr');
    const negativeLabel = firstNonEmpty(data.negativeBalanceLabel, 'Dr');
    const startDate = firstNonEmpty(statement.startDate, data.startDate);
    const endDate = firstNonEmpty(statement.endDate, data.endDate);
    const generatedOn = firstNonEmpty(statement.generatedOn, data.date, formatDocDate(new Date()));
    const periodText = [startDate, endDate].filter(Boolean).join(' to ') || '-';
    const footerText = firstNonEmpty(
        template.termsContent,
        settings.footerText,
        isCustomerStatement
            ? 'This is a computer-generated customer statement and does not require a signature.'
            : 'This is a computer-generated vendor statement and does not require a signature.'
    );

    const formatAmountHtml = (value, includeCurrency = false, emptyDash = true) => {
        const amount = asNumber(value);
        if (emptyDash && amount === 0) return '-';
        return `${includeCurrency ? `${currencyHtml} ` : ''}${formatNumber(Math.abs(amount))}`;
    };
    const formatBalanceHtml = (value) => {
        const amount = asNumber(value);
        return `${currencyHtml} ${formatNumber(Math.abs(amount))} ${amount >= 0 ? positiveLabel : negativeLabel}`;
    };
    const companyLines = [
        companyVisibility.address && company.address,
        companyVisibility.phone && company.phone ? `Phone: ${company.phone}` : '',
        companyVisibility.email && company.email ? `Email: ${company.email}` : '',
        companyVisibility.website && company.website,
        companyVisibility.trn && company.trn ? `TRN: ${company.trn}` : '',
        companyVisibility.crn && company.crn ? `CRN: ${company.crn}` : '',
    ].filter(Boolean);
    const partyLines = [
        partyVisibility.code && party.code ? `Code: ${party.code}` : '',
        partyVisibility.address && party.address,
        partyVisibility.phone && party.phone ? `Phone: ${party.phone}` : '',
        partyVisibility.email && party.email ? `Email: ${party.email}` : '',
        partyVisibility.taxId && party.taxId ? `TRN / Tax ID: ${party.taxId}` : '',
    ].filter(Boolean);
    const summaryCards = [
        showOpeningBalance ? { label: 'Opening Balance', value: openingBalance, suffix: openingBalance >= 0 ? positiveLabel : negativeLabel } : null,
        isCustomerStatement
            ? (showPurchases ? { label: data.debitSummaryLabel || 'Total Sales', value: totalDebit } : null)
            : (showPurchases ? { label: data.creditSummaryLabel || 'Total Purchases', value: totalCredit } : null),
        isCustomerStatement
            ? (showPayments ? { label: data.creditSummaryLabel || 'Total Receipts', value: totalCredit } : null)
            : (showPayments ? { label: data.debitSummaryLabel || 'Total Payments', value: totalDebit } : null),
        showClosingBalance ? { label: 'Closing Balance', value: closingBalance, suffix: closingBalance >= 0 ? positiveLabel : negativeLabel, strong: true } : null,
    ].filter(Boolean);
    const documentTitle = generateDocFilename(
        documentLabel,
        data.docNo,
        party.name,
        endDate || generatedOn,
        currency
    );
    const pageCss = renderTarget === 'print'
        ? `@page { size: ${paperSize} ${orientation}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }`
        : '';

    const styles = `
        ${pageCss}
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        body {
            margin: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: ${fontFamily};
            font-size: ${baseFontSize}px;
            line-height: 1.45;
        }
        .soa-shell {
            width: 100%;
            max-width: ${renderTarget === 'email' ? '860px' : 'none'};
            margin: 0 auto;
            background: #ffffff;
            border: ${showBorder ? `1px solid ${borderColor}` : '0'};
            overflow: hidden;
        }
        .soa-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(240px, 0.9fr);
            gap: 24px;
            align-items: start;
            padding: 24px 28px;
            background: ${headerBg};
            color: #ffffff;
        }
        .company-logo {
            display: block;
            max-width: 142px;
            max-height: 58px;
            object-fit: contain;
            margin-bottom: 12px;
            background: #ffffff;
            border-radius: 6px;
            padding: 4px;
        }
        .company-name {
            font-size: ${Math.max(16, baseFontSize + 4)}px;
            font-weight: 800;
            margin-bottom: 7px;
        }
        .company-line,
        .statement-meta {
            color: rgba(255, 255, 255, 0.82);
            font-size: ${Math.max(10, baseFontSize - 2)}px;
        }
        .title-block {
            text-align: right;
        }
        .statement-title {
            margin: 0 0 12px;
            font-size: ${Math.max(22, baseFontSize + 11)}px;
            line-height: 1.1;
            letter-spacing: 0;
            font-weight: 800;
            text-transform: uppercase;
        }
        .statement-pill {
            display: inline-block;
            margin-bottom: 10px;
            border-radius: 999px;
            background: ${accentColor};
            color: #111827;
            padding: 5px 11px;
            font-weight: 800;
            font-size: ${Math.max(10, baseFontSize - 3)}px;
            text-transform: uppercase;
        }
        .content {
            padding: 24px 28px 22px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 260px;
            gap: 18px;
            margin-bottom: 18px;
        }
        .info-card {
            border: 1px solid ${borderColor};
            border-radius: 8px;
            padding: 14px 16px;
            background: #ffffff;
        }
        .card-label {
            color: #64748b;
            font-size: ${Math.max(9, baseFontSize - 3)}px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .vendor-name {
            font-size: ${Math.max(15, baseFontSize + 2)}px;
            font-weight: 800;
            color: #111827;
            margin-bottom: 5px;
        }
        .muted-line {
            color: #475569;
            font-size: ${Math.max(10, baseFontSize - 1)}px;
            margin-top: 3px;
        }
        .balance-value {
            color: #111827;
            font-size: ${Math.max(19, baseFontSize + 7)}px;
            font-weight: 900;
            margin-top: 2px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(${Math.max(1, summaryCards.length)}, minmax(0, 1fr));
            border: 1px solid ${borderColor};
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 18px;
        }
        .summary-cell {
            padding: 12px 14px;
            border-left: 1px solid ${borderColor};
            background: #ffffff;
        }
        .summary-cell:first-child { border-left: 0; }
        .summary-label {
            color: #64748b;
            font-size: ${Math.max(9, baseFontSize - 3)}px;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }
        .summary-value {
            margin-top: 6px;
            color: #111827;
            font-size: ${Math.max(16, baseFontSize + 4)}px;
            font-weight: 850;
        }
        .summary-value.strong {
            color: ${accentColor};
        }
        .summary-suffix {
            margin-top: 2px;
            color: #64748b;
            font-size: ${Math.max(9, baseFontSize - 3)}px;
            font-weight: 800;
            text-transform: uppercase;
        }
        .soa-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: ${Math.max(8, baseFontSize - 4)}px;
        }
        .soa-table th {
            background: ${accentColor};
            color: #111827;
            border: 1px solid ${borderColor};
            padding: 6px 5px;
            font-size: ${Math.max(7, baseFontSize - 5)}px;
            font-weight: 850;
            text-transform: uppercase;
            text-align: left;
            line-height: 1.18;
            overflow-wrap: normal;
            word-break: normal;
        }
        .soa-table td {
            border: 1px solid ${borderColor};
            padding: 6px 5px;
            color: #334155;
            vertical-align: top;
            line-height: 1.22;
            overflow-wrap: anywhere;
            word-break: normal;
        }
        .soa-table .num,
        .soa-table .amount {
            text-align: right;
            white-space: nowrap;
        }
        .soa-table .date-cell,
        .soa-table .doc-cell {
            white-space: nowrap;
            overflow-wrap: normal;
        }
        .soa-table .debit { color: ${isCustomerStatement ? '#dc2626' : '#15803d'}; }
        .soa-table .credit { color: ${isCustomerStatement ? '#15803d' : '#c2410c'}; }
        .soa-table .balance { color: #111827; font-weight: 800; }
        .type-badge {
            display: block;
            border-radius: 4px;
            background: transparent;
            color: #334155;
            padding: 0;
            font-size: ${Math.max(7, baseFontSize - 5)}px;
            font-weight: 800;
            line-height: 1.15;
            text-transform: none;
            overflow-wrap: normal;
            word-break: normal;
        }
        .closing-row td {
            background: #f8fafc;
            font-weight: 850;
            color: #111827;
        }
        .empty-row td {
            padding: 18px 10px;
            text-align: center;
            color: #94a3b8;
        }
        .footer-note {
            margin-top: 18px;
            border-top: 1px solid ${borderColor};
            padding-top: 12px;
            text-align: center;
            color: #64748b;
            font-size: ${Math.max(10, baseFontSize - 2)}px;
        }
        .billbull-footer {
            margin-top: 8px;
            text-align: center;
            color: #94a3b8;
            font-size: ${Math.max(9, baseFontSize - 3)}px;
        }
        .billbull-footer img {
            max-height: 18px;
            width: auto;
            vertical-align: middle;
        }
        @media print {
            html, body {
                overflow: visible !important;
                height: auto !important;
            }
            .soa-shell {
                border: ${showBorder ? `1px solid ${borderColor}` : '0'};
                break-inside: auto;
            }
            .soa-header {
                grid-template-columns: minmax(0, 1fr) minmax(240px, 0.9fr) !important;
            }
            .info-grid {
                grid-template-columns: minmax(0, 1fr) 260px !important;
            }
            .summary-grid {
                grid-template-columns: repeat(${Math.max(1, summaryCards.length)}, minmax(0, 1fr)) !important;
            }
            .title-block {
                text-align: right !important;
            }
            .info-card,
            .summary-grid,
            tr {
                break-inside: avoid;
            }
        }
        @media screen and (max-width: 760px) {
            .soa-header,
            .info-grid,
            .summary-grid {
                grid-template-columns: 1fr;
            }
            .title-block {
                text-align: left;
            }
        }
    `;

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(documentTitle)}</title>
            <style>${styles}</style>
        </head>
        <body>
            <div class="soa-shell">
                <header class="soa-header">
                    <div>
                        ${logoUrl ? `<img class="company-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.companyName || 'Company Logo')}" />` : ''}
                        ${companyVisibility.name ? `<div class="company-name">${escapeHtml(company.companyName || 'Company')}</div>` : ''}
                        ${companyLines.map((line) => `<div class="company-line">${escapeHtml(line)}</div>`).join('')}
                    </div>
                    <div class="title-block">
                        <div class="statement-pill">${escapeHtml(data.status || 'Generated')}</div>
                        <h1 class="statement-title">Statement of Account</h1>
                        <div class="statement-meta"><strong>Period:</strong> ${escapeHtml(periodText)}</div>
                        <div class="statement-meta"><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
                        ${data.docNo ? `<div class="statement-meta"><strong>Statement No:</strong> ${escapeHtml(data.docNo)}</div>` : ''}
                    </div>
                </header>

                <main class="content">
                    <section class="info-grid">
                        <div class="info-card">
                            <div class="card-label">${escapeHtml(partyLabel)}</div>
                            <div class="vendor-name">${escapeHtml(party.name || statement.accountName || partyLabel)}</div>
                            ${partyLines.map((line) => `<div class="muted-line">${escapeHtml(line)}</div>`).join('')}
                        </div>
                        <div class="info-card">
                            <div class="card-label">Balance Summary</div>
                            <div class="balance-value">${formatBalanceHtml(closingBalance)}</div>
                            <div class="muted-line">Currency: ${currencyHtml}</div>
                        </div>
                    </section>

                    ${showQuickSummary && summaryCards.length > 0 ? `
                        <section class="summary-grid">
                            ${summaryCards.map((card) => `
                                <div class="summary-cell">
                                    <div class="summary-label">${escapeHtml(card.label)}</div>
                                    <div class="summary-value ${card.strong ? 'strong' : ''}">${formatAmountHtml(card.value, true, false)}</div>
                                    ${card.suffix ? `<div class="summary-suffix">${escapeHtml(card.suffix)}</div>` : ''}
                                </div>
                            `).join('')}
                        </section>
                    ` : ''}

                    <section>
                        <table class="soa-table">
                            <colgroup>
                                <col style="width:9%;" />
                                <col style="width:9%;" />
                                <col style="width:13%;" />
                                <col style="width:22%;" />
                                <col style="width:13%;" />
                                <col style="width:11%;" />
                                <col style="width:10%;" />
                                <col style="width:13%;" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Document No.</th>
                                    <th>Description</th>
                                    <th>Reference</th>
                                    <th style="text-align:right;">${escapeHtml(data.debitColumnLabel || 'Debit')}</th>
                                    <th style="text-align:right;">${escapeHtml(data.creditColumnLabel || 'Credit')}</th>
                                    <th style="text-align:right;">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length > 0 ? rows.map((row) => `
                                    <tr>
                                        <td class="date-cell">${escapeHtml(formatDocDate(row.date) || '-')}</td>
                                        <td><span class="type-badge">${escapeHtml(row.typeLabel || '-')}</span></td>
                                        <td class="doc-cell">${escapeHtml(row.documentNo || '-')}</td>
                                        <td>${escapeHtml(row.description || '-')}</td>
                                        <td>${escapeHtml(row.reference || '-')}</td>
                                        <td class="amount debit">${formatAmountHtml(row.debit)}</td>
                                        <td class="amount credit">${formatAmountHtml(row.credit)}</td>
                                        <td class="amount balance">${formatBalanceHtml(row.balance)}</td>
                                    </tr>
                                `).join('') : `
                                    <tr class="empty-row">
                                        <td colspan="8">No transactions recorded in this period.</td>
                                    </tr>
                                `}
                                ${showClosingBalance ? `
                                    <tr class="closing-row">
                                        <td colspan="5" class="num">Closing Totals</td>
                                        <td class="amount debit">${formatAmountHtml(totalDebit, false, false)}</td>
                                        <td class="amount credit">${formatAmountHtml(totalCredit, false, false)}</td>
                                        <td class="amount balance">${formatBalanceHtml(closingBalance)}</td>
                                    </tr>
                                ` : ''}
                            </tbody>
                        </table>
                    </section>

                    <div class="footer-note">${escapeHtml(footerText)}</div>
                    <div class="billbull-footer">
                        ${options.billBullLogo
                            ? `<img src="${escapeHtml(options.billBullLogo)}" alt="BillBull" />`
                            : 'Generated by BillBull ERP'}
                    </div>
                </main>
            </div>
        </body>
        </html>
    `;
};

const buildDocumentHtml = (template, data, options = {}, renderTarget = 'print') => {
    const layout = buildLayout(template, data, options, renderTarget);
    const shellClasses = [
        'document-shell',
        layout.isPurchaseDesigner ? 'document-shell-designer' : ''
    ].filter(Boolean).join(' ');
    const styles = renderTarget === 'email'
        ? `${buildCoreStyles()}${buildTemplateThemeStyles(layout)}${buildEmailStyles()}`
        : `${buildCoreStyles()}${buildTemplateThemeStyles(layout)}${buildPrintStyles(template.paperSize || 'A4', template.orientation || 'Portrait', layout)}`;

    const documentTitle = generateDocFilename(
        layout.title,
        layout.docNo,
        layout.party?.name,
        resolveLayoutDate(layout),
        layout.currency
    );

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(documentTitle)}</title>
            <style>${styles}</style>
        </head>
        <body>
            <div class="${shellClasses}">
                ${buildHeader(layout, renderTarget)}
                ${buildHeaderAddon(layout)}
                ${buildGrandTotal(layout)}
                <main class="content-stack">
                    ${buildPaymentCard(layout)}
                    ${buildItemsTable(layout)}
                    ${buildSummarySection(layout, renderTarget)}
                    ${buildSignatureBlock(layout)}
                    ${buildStampBlock(layout, renderTarget)}
                    ${buildPrintDateStamp(layout, renderTarget)}
                    ${buildPageNumbers(layout, renderTarget)}
                </main>
                ${buildFooterBar(layout, renderTarget, options.billBullLogo)}
                ${buildFooterAddon(layout)}
                ${buildWatermark(layout)}
            </div>
        </body>
        </html>
    `;
};

export const generateDocumentPrintHtml = (template, data, options = {}) => {
    if (template?.category === 'Pick List') {
        return generatePickListHtml(template, data, options);
    }
    if (template?.category === 'Vendor Statement of Account' || template?.category === 'Customer Statement of Account') {
        return renderVendorStatementHtml(template, data, options, 'print');
    }
    return buildDocumentHtml(template, data, options, 'print');
};

export const generateDocumentEmailHtml = (template, data, options = {}) => {
    if (template?.category === 'Pick List') {
        return generatePickListHtml(template, data, options);
    }
    if (template?.category === 'Vendor Statement of Account' || template?.category === 'Customer Statement of Account') {
        return renderVendorStatementHtml(template, data, options, 'email');
    }
    return buildDocumentHtml(template, data, options, 'email');
};
