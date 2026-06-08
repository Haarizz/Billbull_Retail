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

const LEFT_META_LABEL_PATTERNS = /^(P\.O|PO Number|Purchase Order|Buyer|Prepared By)$/i;
const HIDDEN_HEADER_LABEL_PATTERNS = /^(Status|Approval Status|QC Status|Posted)$/i;
const RIGHT_META_FORCE_PATTERNS = /^(Sales Person|Salesperson|Account Executive|Amount in Words)$/i;

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
    'Sales Invoice': 'Tax Invoice',
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

const clampColorByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const parseCssColor = (value) => {
    const text = asText(value).trim();
    if (!text) return null;

    const hexMatch = text.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3 || hex.length === 4) {
            const [r, g, b, a = 'f'] = hex.split('');
            return {
                r: parseInt(r + r, 16),
                g: parseInt(g + g, 16),
                b: parseInt(b + b, 16),
                a: parseInt(a + a, 16) / 255
            };
        }
        if (hex.length === 6 || hex.length === 8) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
            };
        }
    }

    const rgbMatch = text.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
    if (rgbMatch) {
        return {
            r: clampColorByte(Number(rgbMatch[1])),
            g: clampColorByte(Number(rgbMatch[2])),
            b: clampColorByte(Number(rgbMatch[3])),
            a: rgbMatch[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgbMatch[4])))
        };
    }

    return null;
};

const toRgbaCss = ({ r, g, b, a = 1 }) =>
    `rgba(${clampColorByte(r)}, ${clampColorByte(g)}, ${clampColorByte(b)}, ${Math.max(0, Math.min(1, Number(a))).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')})`;

const boostPrintFill = (value, fallback, { minAlpha = 1, darken = 0.06 } = {}) => {
    const parsed = parseCssColor(value) || parseCssColor(fallback);
    if (!parsed) {
        return fallback;
    }

    const brightness = (parsed.r + parsed.g + parsed.b) / 3;
    const darkenRatio = brightness >= 245 ? darken : brightness >= 225 ? darken * 0.65 : 0;
    const alpha = Math.max(parsed.a ?? 1, minAlpha);

    return toRgbaCss({
        r: parsed.r * (1 - darkenRatio),
        g: parsed.g * (1 - darkenRatio),
        b: parsed.b * (1 - darkenRatio),
        a: alpha
    });
};

const scaleCssSize = (value, multiplier = 1) => {
    const text = asText(value).trim();
    const match = text.match(/^(-?\d*\.?\d+)([a-z%]+)$/i);
    if (!match) {
        return `calc(${text} * ${multiplier})`;
    }

    const scaled = Number(match[1]) * multiplier;
    return `${Number(scaled.toFixed(3))}${match[2]}`;
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

const renderCurrencySymbolHtml = (value, imgHeight = '0.85em', options = {}) => {
    const currencyConfig = resolveCurrencyDisplayConfig(value);
    if (currencyConfig.hasImage) {
        if (options.inheritColor) {
            const width = scaleCssSize(imgHeight, 1.28);
            return `<span role="img" aria-label="${escapeHtml(currencyConfig.ariaLabel)}" style="display:inline-block;height:${imgHeight};width:${width};vertical-align:-0.08em;background-color:currentColor;-webkit-mask-image:url('${UAE_DIRHAM_SYMBOL_IMAGE}');mask-image:url('${UAE_DIRHAM_SYMBOL_IMAGE}');-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain;"></span>`;
        }
        return `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="${escapeHtml(currencyConfig.ariaLabel)}" style="height:${imgHeight};width:auto;display:inline-block;vertical-align:-0.07em;" />`;
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
const renderCurrencyForLayout = (value, displayOptions = {}, imgHeight = '0.85em') =>
    displayOptions?.currencyDisplay === 'code'
        ? renderCurrencyCode(value)
        : renderCurrencySymbolHtml(value, imgHeight);

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

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertHundreds = (n) => {
    if (n === 0) return '';
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertHundreds(n % 100) : '');
};

const numberToWords = (num) => {
    if (!Number.isFinite(num) || num < 0) return 'Zero';
    if (num === 0) return 'Zero';
    const parts = [];
    const n = Math.floor(num);
    if (n >= 1000000) { parts.push(convertHundreds(Math.floor(n / 1000000)) + ' Million'); }
    if (n % 1000000 >= 1000) { parts.push(convertHundreds(Math.floor((n % 1000000) / 1000)) + ' Thousand'); }
    if (n % 1000 > 0) { parts.push(convertHundreds(n % 1000)); }
    return parts.join(' ');
};

const CURRENCY_UNITS = {
    AED: { main: 'Dirhams', sub: 'Fils' }, USD: { main: 'Dollars', sub: 'Cents' },
    EUR: { main: 'Euros', sub: 'Cents' }, GBP: { main: 'Pounds', sub: 'Pence' },
    INR: { main: 'Rupees', sub: 'Paise' }, SAR: { main: 'Riyals', sub: 'Halalas' },
    QAR: { main: 'Riyals', sub: 'Dirhams' }, KWD: { main: 'Dinars', sub: 'Fils' },
    BHD: { main: 'Dinars', sub: 'Fils' }, OMR: { main: 'Rials', sub: 'Baisa' },
    JOD: { main: 'Dinars', sub: 'Fils' }, EGP: { main: 'Pounds', sub: 'Piastres' },
    AUD: { main: 'Dollars', sub: 'Cents' }, CAD: { main: 'Dollars', sub: 'Cents' },
    SGD: { main: 'Dollars', sub: 'Cents' }, HKD: { main: 'Dollars', sub: 'Cents' },
    MYR: { main: 'Ringgit', sub: 'Sen' }, PKR: { main: 'Rupees', sub: 'Paisa' },
    NPR: { main: 'Rupees', sub: 'Paisa' }, LKR: { main: 'Rupees', sub: 'Cents' },
    BDT: { main: 'Taka', sub: 'Poisha' }, NGN: { main: 'Naira', sub: 'Kobo' },
    KES: { main: 'Shillings', sub: 'Cents' }, ZAR: { main: 'Rand', sub: 'Cents' },
    CHF: { main: 'Francs', sub: 'Rappen' }, TRY: { main: 'Lira', sub: 'Kurus' },
    CNY: { main: 'Yuan', sub: 'Jiao' }, JPY: { main: 'Yen', sub: 'Sen' },
    PHP: { main: 'Pesos', sub: 'Centavos' }, THB: { main: 'Baht', sub: 'Satang' },
    MXN: { main: 'Pesos', sub: 'Centavos' }, BRL: { main: 'Reais', sub: 'Centavos' },
    RUB: { main: 'Rubles', sub: 'Kopeks' }, NOK: { main: 'Kroner', sub: 'Ore' },
    SEK: { main: 'Kronor', sub: 'Ore' }, DKK: { main: 'Kroner', sub: 'Ore' },
};

const formatAmountInWords = (value, currency) => {
    const amount = asNumber(value);
    const whole = Math.floor(amount);
    const sub = Math.round((amount - whole) * 100);
    const units = CURRENCY_UNITS[String(currency || '').toUpperCase()] || { main: String(currency || 'Units'), sub: 'Cents' };
    const mainWords = numberToWords(whole) || 'Zero';
    const result = sub > 0
        ? `${mainWords} ${units.main} and ${numberToWords(sub)} ${units.sub} Only`
        : `${mainWords} ${units.main} Only`;
    return result;
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
    const grossAmount = qty * price;
    const discountAmount = asNumber(
        item.discountAmount ?? item.discountAmt ?? item.lineDiscount ?? (grossAmount * (discountPercent || 0) / 100)
    );
    const taxableAmount = asNumber(
        item.taxableAmount ?? (grossAmount - discountAmount)
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
        discountAmount,
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
    const columns = [
        { key: 'index', label: '#', compactLabel: '#', align: 'center', weight: 0.45, enabled: c.showIndex !== false },
        { key: 'image', label: 'Image', compactLabel: 'Image', align: 'center', weight: 0.78, enabled: Boolean(c.image) },
        { key: 'description', label: 'Product / Services', compactLabel: 'Product / Services', align: 'left', weight: c.batchBarcode ? 1.95 : 2.45, enabled: c.showItemIdentity !== false },
        { key: 'details', label: 'Description of Product / Services', compactLabel: 'Description of Product / Services', align: 'left', weight: c.batchBarcode ? 2.35 : 3.15, enabled: c.description !== false },
        { key: 'uom', label: 'UOM', compactLabel: 'UOM', align: 'center', weight: 0.52, enabled: Boolean(c.uom) },
        { key: 'batchBarcode', label: 'Batch Barcode', compactLabel: 'Batch Barcode', align: 'center', weight: 2.15, enabled: Boolean(c.batchBarcode) },
        { key: 'expiry', label: 'Expiry', compactLabel: 'Expiry', align: 'center', weight: 0.82, enabled: Boolean(c.expiry) },
        { key: 'qty', label: 'Qty', compactLabel: 'Qty', align: 'right', weight: 0.5, enabled: c.qty !== false },
        { key: 'unitPrice', label: 'Unit Price', compactLabel: 'Unit Price', align: 'right', weight: 0.86, enabled: c.unitPrice !== false },
        { key: 'taxableAmount', label: 'Taxable Amount', compactLabel: 'Taxable Amount', align: 'right', weight: 1.05, enabled: Boolean(c.taxableAmount) },
        { key: 'discountPercent', label: 'Discount %', compactLabel: 'Discount %', align: 'center', weight: 0.78, enabled: Boolean(c.discountPercent) },
        { key: 'taxPercent', label: 'VAT %', compactLabel: 'VAT %', align: 'center', weight: 0.55, enabled: Boolean(c.taxPercent) },
        { key: 'tax', label: 'VAT Amount', compactLabel: 'VAT Amount', align: 'right', weight: 0.92, enabled: c.tax !== false },
        { key: 'total', label: 'Line Total', compactLabel: 'Line Total', align: 'right', weight: 0.92, enabled: c.total !== false },
        { key: 'lpoQty', label: 'LPO Qty', compactLabel: 'LPO Qty', align: 'right', weight: 0.72, enabled: Boolean(c.lpoQty) },
        { key: 'received', label: 'Received', compactLabel: 'Received', align: 'right', weight: 0.82, enabled: Boolean(c.received) },
        { key: 'accepted', label: 'Accepted', compactLabel: 'Accepted', align: 'right', weight: 0.82, enabled: Boolean(c.accepted) },
        { key: 'receivedBy', label: 'Received By', compactLabel: 'Received By', align: 'left', weight: 1.08, enabled: Boolean(c.receivedBy) },
        { key: 'checkedBy', label: 'Checked By', compactLabel: 'Checked By', align: 'left', weight: 1.08, enabled: Boolean(c.checkedBy) },
    ].filter((col) => col.enabled);

    const compactHeaders = columns.length >= 10;
    const headerDensity = columns.length >= 12
        ? 'dense-3'
        : columns.length >= 10
            ? 'dense-2'
            : columns.length >= 8
                ? 'dense-1'
                : 'normal';
    const totalWeight = columns.reduce((sum, col) => sum + (col.weight || 1), 0) || 1;

    return columns.map((col) => ({
        ...col,
        label: col.label,
        width: `${(((col.weight || 1) / totalWeight) * 100).toFixed(2)}%`,
        compactHeaders,
        headerDensity
    }));
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
                    ${columnOptions.discount && !columnOptions.discountPercent && item.discountPercent > 0
                    ? `<div class="cell-sub">Discount ${formatNumber(item.discountPercent, 0)}%</div><div class="cell-sub">@ ${formatNumber(item.discountAmount)}</div>`
                    : ''}
                </td>
            `;
        case 'discount':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'discountPercent':
            return `
                <td class="table-cell cell-center cell-discount">
                    <div>${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</div>
                    ${item.discountPercent > 0 ? `<div class="cell-sub">@ ${formatNumber(item.discountAmount)}</div>` : ''}
                </td>
            `;
        case 'tax':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.taxAmount)}</div>
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
    const compactHeaders = layout.columnModel.some((column) => column.compactHeaders);
    const headerDensity = layout.columnModel[0]?.headerDensity || 'normal';

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
            <table class="document-table${compactHeaders ? ' document-table-compact' : ''}${headerDensity !== 'normal' ? ` document-table-${headerDensity}` : ''}">
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

const buildTotalsTable = (layout, amountInWordsText = null) => {
    if (!layout.showTotalsSection) return '';

    const discountAmount = asNumber(layout.totals.billDiscountAmount ?? layout.totals.discountAmount ?? 0);
    const discountPercent = asNumber(layout.totals.billDiscount ?? 0);
    const deliveryCharge = asNumber(layout.totals.deliveryCharge ?? 0);
    const roundOff = asNumber(layout.totals.roundOff ?? 0);
    const amountPaid = asNumber(layout.totals.amountPaid ?? 0);
    const balanceDue = asNumber(layout.totals.balanceDue ?? Math.max(asNumber(layout.totals.grandTotal) - amountPaid, 0));
    const currency = renderCurrencySymbolHtml(layout.currency);

    const row = (label, amount, className = '') => `
            <tr class="${className}">
                <td class="tot-label">${label}</td>
                <td class="tot-currency">${currency}</td>
                <td class="tot-amount">${formatNumber(amount)}</td>
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

    // Order matches ClassicPreview exactly:
    // SubTotal → Discount → Taxable → VAT → Delivery → RoundOff → Total → AmountPaid → BalanceDue
    const rows = [
        visibility.subTotal ? row('Sub Total', layout.totals.subTotal) : '',
        visibility.discount && discountAmount > 0 ? `
                <tr class="amount-negative">
                    <td class="tot-label">Discount${discountPercent > 0 ? ` (${formatNumber(discountPercent, 0)}%)` : ''}</td>
                    <td class="tot-currency">${currency}</td>
                    <td class="tot-amount">- ${formatNumber(discountAmount)}</td>
                </tr>
            ` : '',
        visibility.taxable ? row('Taxable Amount', layout.totals.subTotal - discountAmount) : '',
        visibility.tax ? row('Total VAT', layout.totals.tax) : '',
        visibility.deliveryCharge && deliveryCharge > 0 ? row('Delivery Charge', deliveryCharge) : '',
        visibility.roundOff && roundOff !== 0 ? row('Round Off', roundOff) : '',
        visibility.grandTotal ? row('Total', layout.totals.grandTotal, 'grand-total-row') : '',
        visibility.amountPaid && amountPaid > 0 ? row('Amount Paid', amountPaid) : '',
        visibility.balanceDue && amountPaid > 0 ? row('Balance Due', balanceDue, 'balance-due-row') : '',
    ].filter(Boolean).join('');

    if (!rows) return '';

    // The "amount in words" row spans the full table so it stays visually
    // aligned with the totals column rather than spanning the whole page.
    const colSpan = 3;
    const wordsRow = amountInWordsText
        ? `<tr><td colspan="${colSpan}" class="tot-words">${escapeHtml(amountInWordsText)}</td></tr>`
        : '';

    return `
        <table class="totals-table">
            <tbody>
                ${rows}
                ${wordsRow}
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
    const showAmountInWords = Boolean(layout.showAmountInWords && layout.highlight?.value);
    const amountInWordsText = showAmountInWords
        ? `In Words: ${formatAmountInWords(layout.highlight.value, layout.currency)}`
        : null;
    const totalsTable = buildTotalsTable(layout, amountInWordsText);
    const bankRows = Array.isArray(layout.bankRows) ? layout.bankRows.filter((row) => row?.value) : [];

    if (!showNotes && !hasTerms && !totalsTable && bankRows.length === 0) return '';

    const notesHtml = `
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
            ${totalsTable ? `<div class="footer-group-atomic summary-totals">${totalsTable}</div>` : ''}
            ${(hasNotes || hasTerms) ? `<div class="footer-group-atomic summary-notes">${notesHtml}</div>` : ''}
        </section>
    `;
};

const buildSignatureBlock = (layout) => {
    if (!layout.showSignatureBlock) return '';

    return `
        <section class="footer-group-atomic signature-card">
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

    return `<div class="footer-group-atomic stamp-row">${stampHtml}${qrHtml}</div>`;
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

const buildGrandTotal = (layout, renderTarget = 'print') => {
    if (!layout.showHighlight) return '';
    // Cap-height of Inter/Arial digits ≈ 73% of em-square.
    // Use absolute px so the image size is never affected by em inheritance
    // issues in print iframe contexts (where em always resolves to body 9px).
    const gtFontPx = (layout.theme?.fontSize || 9) + 22;
    const imgPx = Math.round(gtFontPx * 0.73);
    const currHtml = renderCurrencySymbolHtml(layout.currency, `${imgPx}px`, {
        inheritColor: renderTarget === 'print'
    });
    return `
        <div class="grand-total-display">
            <div class="grand-total-label">${escapeHtml(layout.highlight.label || 'Grand Total')}</div>
            <div class="grand-total-value">${currHtml} ${formatNumber(layout.highlight.value)}</div>
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
        ].filter((row) => {
            const label = asText(row.label).trim();
            return LEFT_META_LABEL_PATTERNS.test(label) && !RIGHT_META_FORCE_PATTERNS.test(label);
        });
    const centerMetaRows = layout.isPurchaseDesigner
        ? visibleReferenceRows
        : visibleReferenceRows.filter((row) => {
            const label = asText(row.label).trim();
            return !LEFT_META_LABEL_PATTERNS.test(label) || RIGHT_META_FORCE_PATTERNS.test(label);
        });
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
                <div class="bill-to-name"><span class="bill-to-name-text">${escapeHtml(layout.party.name || '')}</span></div>
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
    const centerContent = (layout.isPurchaseDesigner || layout.isSalesDesigner)
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

    const headerExtraClass = layout.isPurchaseDesigner ? ' document-header-designer'
        : layout.isSalesDesigner ? ' document-header-sales' : '';
    return `
        <header class="document-header${headerExtraClass}">
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
        display: flex;
        flex-direction: column;
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
        display: grid;
        grid-template-columns: 27fr 33fr 40fr;
        grid-template-rows: auto;
        align-items: start;
        gap: 0 16px;
        margin-bottom: 18px;
    }
    .document-header-designer .header-left {
        grid-column: 1;
        min-width: 0;
        overflow: hidden;
        word-break: break-word;
        overflow-wrap: break-word;
    }
    .document-header-designer .header-center {
        grid-column: 2;
        min-width: 0;
        padding-top: 64px;
        word-break: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
    }
    .document-header-designer .header-right {
        grid-column: 3;
        min-width: 0;
        word-break: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
    }
    /* Sales designer header — fixed 27/33/40 grid so long names never
       collapse or expand adjacent columns. Mirrors ClassicPreview proportions. */
    .document-header-sales {
        display: grid;
        grid-template-columns: 27fr 33fr 40fr;
        grid-template-rows: auto;
        align-items: start;
        gap: 0 16px;
        margin-bottom: 18px;
    }
    .document-header-sales .header-left {
        grid-column: 1;
        min-width: 0;
        overflow: hidden;
        word-break: break-word;
        overflow-wrap: break-word;
    }
    .document-header-sales .header-center {
        grid-column: 2;
        min-width: 0;
        /* Padding-top clears the document title (≈20px text + 14px margin)
           and the bill-to eyebrow + customer name line (≈30px) so the meta
           grid always starts below the primary identity lines in col 1 & col 3.
           No align-self:end — we want a fixed offset from the top, not bottom-anchoring,
           so the block stays stable regardless of content length in adjacent columns. */
        padding-top: 64px;
        padding-bottom: 2px;
        text-align: left;
        word-break: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
    }
    .document-header-sales .header-right {
        grid-column: 3;
        min-width: 0;
        word-break: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
    }
    .document-header-sales .document-title {
        margin: 0 0 14px;
        white-space: nowrap;
        word-break: keep-all;
        letter-spacing: -0.5px;
        line-height: 1.35;
    }
    .document-header-sales .company-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 8.5px;
        letter-spacing: -0.3px;
    }
    .document-header-sales .doc-meta-item {
        justify-items: start;
        text-align: left;
        min-width: 0;
        overflow: hidden;
    }
    .document-header-sales .doc-meta-label {
        font-size: 8px;
        line-height: 1.2;
        color: #999999;
        font-weight: 500;
    }
    .document-header-sales .doc-meta-value {
        font-size: 9px;
        line-height: 1.2;
        font-weight: 700;
        word-break: break-word;
        overflow-wrap: break-word;
        white-space: normal;
    }
    .document-header-sales .bill-to-eyebrow {
        margin-bottom: 4px;
        color: #888888;
        text-transform: uppercase;
    }
    .document-header-sales .bill-to-name {
        margin: 0 0 2px;
        font-weight: 700;
        white-space: nowrap;
        word-break: keep-all;
        overflow-wrap: normal;
        overflow: visible;
    }
    .document-header-sales .bill-to-name-text {
        display: inline-block;
        max-width: 100%;
        white-space: nowrap;
        font-weight: 700;
        transform-origin: left center;
        word-break: break-word;
        overflow-wrap: break-word;
    }
    .document-header-sales .bill-to-line {
        color: #444444;
        line-height: 1.65;
        white-space: pre-line;
        word-break: break-word;
        overflow-wrap: break-word;
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
        text-align: right;
        word-break: break-word;
        overflow-wrap: break-word;
    }
    .document-header-designer .company-panel {
        line-height: 1.55;
    }
    .company-name,
    .company-local-name {
        font-weight: 700;
        word-break: break-word;
        overflow-wrap: break-word;
        white-space: normal;
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
        font-weight: 700;
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
        word-break: break-word;
        overflow-wrap: break-word;
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
        font-size: 31px;
        font-weight: 800;
        line-height: 1.2;
    }
    .grand-total-value img {
        height: 0.88em;
        width: auto;
        vertical-align: middle;
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
        flex: 1;
    }
    .document-shell-designer .content-stack {
        display: block;
    }
    /* Footer block keeps totals/bank/terms/stamp together and sits at the
       bottom of the page via margin-top:auto inside the flex-column shell. */
    .document-footer-group {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: auto;
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
    .document-table.document-table-compact thead th {
        white-space: nowrap;
        word-break: normal;
        overflow-wrap: normal;
        line-height: 1.05;
        letter-spacing: 0;
        font-size: 0.84em;
        padding: 6px 4px;
    }
    .document-shell-designer .document-table.document-table-compact thead th {
        font-size: 0.78em;
        padding-left: 4px;
        padding-right: 4px;
    }
    .document-table.document-table-dense-1 thead th {
        font-size: 0.8em;
        padding-left: 4px;
        padding-right: 4px;
    }
    .document-table.document-table-dense-2 thead th {
        font-size: 0.72em;
        padding-left: 3px;
        padding-right: 3px;
    }
    .document-table.document-table-dense-3 thead th {
        font-size: 0.64em;
        font-weight: 600;
        padding: 5px 2px;
    }
    .document-shell-designer .document-table.document-table-dense-1 thead th {
        font-size: 0.74em;
    }
    .document-shell-designer .document-table.document-table-dense-2 thead th {
        font-size: 0.66em;
    }
    .document-shell-designer .document-table.document-table-dense-3 thead th {
        font-size: 0.58em;
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
    .document-table.document-table-compact .table-cell {
        padding-left: 4px;
        padding-right: 4px;
    }
    .document-table.document-table-dense-2 .table-cell,
    .document-table.document-table-dense-3 .table-cell {
        padding-left: 3px;
        padding-right: 3px;
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
    .tot-words {
        padding: 6px 0 0 0 !important;
        border-top: 1px solid #e5e7eb !important;
        font-style: italic;
        color: #374151;
        font-size: 0.88em;
        text-align: right;
        white-space: normal;
        word-break: break-word;
        line-height: 1.4;
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
        .header-right {
            text-align: left;
            justify-items: start;
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
    const zebraRowBg = (layout.isPurchaseDesigner || layout.isSalesDesigner) ? '#fafafa' : 'transparent';
    const printTableHeaderBg = boostPrintFill(theme.tableHeaderBg, '#f1f5f9', { minAlpha: 1, darken: 0.07 });
    const printTotalRowBg = boostPrintFill(theme.totalRowBg, '#f1f5f9', { minAlpha: 1, darken: 0.07 });
    const printAccentSoft = boostPrintFill(accentSoft, theme.accentColor, { minAlpha: 0.18, darken: 0.05 });
    const printZebraRowBg = zebraRowBg;
    const printBankBg = '#f0f9ff';
    const printTermsBg = '#fffbeb';
    const printSalesThumbSize = layout.isSalesDesigner ? 32 : 42;

    return `
        .document-shell,
        .document-shell * {
            font-family: ${theme.fontFamily};
            font-size: ${theme.fontSize}px;
        }
        .document-title {
            color: ${theme.primaryColor};
            font-size: ${theme.fontSize + 17}px;
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
            font-size: ${theme.fontSize + 22}px;
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
            background: ${zebraRowBg};
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
        ${(layout.isPurchaseDesigner || layout.isSalesDesigner) ? '' : `.grand-total-display { border-top: 2px solid ${theme.accentColor}; }`}
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
        ${layout.showRowLines === false ? `
        .document-table { border-top: 0; }
        .document-table thead th { border-bottom: 0; }
        .table-cell, .table-empty { border-bottom: 0; }
        ` : ''}
        @media print {
            .document-table thead th {
                background: ${printTableHeaderBg} !important;
                box-shadow: inset 0 0 0 9999px ${printTableHeaderBg} !important;
            }
            ${printZebraRowBg === 'transparent' ? '' : `
            .document-table tbody tr:nth-child(even) > td {
                background: ${printZebraRowBg} !important;
                box-shadow: inset 0 0 0 9999px ${printZebraRowBg} !important;
            }
            `}
            .totals-table .grand-total-row td,
            .totals-table .balance-due-row td {
                background: ${printTotalRowBg} !important;
                box-shadow: inset 0 0 0 9999px ${printTotalRowBg} !important;
            }
            .bank-box {
                background: ${printBankBg} !important;
                box-shadow: inset 0 0 0 9999px ${printBankBg} !important;
            }
            .terms-box {
                background: ${printTermsBg} !important;
                box-shadow: inset 0 0 0 9999px ${printTermsBg} !important;
            }
            .item-thumb-small {
                width: ${printSalesThumbSize}px !important;
                height: ${printSalesThumbSize}px !important;
                max-width: ${printSalesThumbSize}px !important;
                max-height: ${printSalesThumbSize}px !important;
                flex-basis: ${printSalesThumbSize}px !important;
            }
            .item-thumb-placeholder {
                background: ${printAccentSoft} !important;
                box-shadow: inset 0 0 0 9999px ${printAccentSoft} !important;
            }
        }
    `;
};

const buildPrintStyles = (paperSize = 'A4', orientation = 'Portrait', layout = {}) => {
    const resolvedPaperSize = paperSize || 'A4';
    const resolvedOrientation = orientation || 'Portrait';
    const page = resolvePaperDimensions(resolvedPaperSize, resolvedOrientation);
    const shellPadding = layout.isPurchaseDesigner ? '28px 32px' : '12mm';
    // Strategy: @page handles top+bottom margins on every page (incl. continuation).
    // Shell padding handles left+right, plus a small cloned top buffer for rows
    // that start on a continuation page when browser print margins are tight.
    // Purchase-designer keeps its own padding without @page adjustment.
    const pageTopBottom = layout.isPurchaseDesigner ? '0' : '12mm';
    const continuousPageTop = layout.isPurchaseDesigner ? '0' : '26mm';
    const continuationInnerGap = layout.isPurchaseDesigner ? '0' : '4mm';
    const shellPaddingPrint = layout.isPurchaseDesigner ? '28px 32px' : `${continuationInnerGap} 12mm 0 12mm`;

    return `
        @page {
            size: ${resolvedPaperSize} ${resolvedOrientation};
            margin: ${continuousPageTop} 0 ${pageTopBottom} 0;
        }
        @page :first {
            margin-top: ${pageTopBottom};
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
                min-height: unset;
                background: #ffffff;
            }
            body {
                padding: 0;
            }
            .document-shell {
                width: ${page.width}mm;
                min-height: unset;
                height: auto;
                margin: 0;
                padding: ${shellPaddingPrint};
                border-radius: 0;
                box-shadow: none;
                -webkit-box-decoration-break: clone;
                box-decoration-break: clone;
                display: block !important;
                overflow: visible !important;
            }
            /* Switch from grid to block so the browser can break the items
               table naturally mid-row, keeping the summary/totals section
               after ALL item rows (on the last page). */
            .content-stack {
                display: block !important;
                overflow: visible !important;
                flex: 1 !important;
            }
            .content-stack > * {
                margin-bottom: 16px;
            }
            /* Explicitly allow page breaks inside the table and between rows */
            .table-section,
            .document-table {
                page-break-inside: auto !important;
                break-inside: auto !important;
                overflow: visible !important;
            }
            .document-table tbody tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            /* Keep summary/totals with whatever content precedes them on the
               last page — never break right before summary */
            .summary-section {
                page-break-before: auto !important;
                break-before: auto !important;
            }
            /* Force 3-column header layout — prevents the responsive breakpoint
               from collapsing columns on narrow paper sizes like A4 */
            .document-header {
                grid-template-columns: minmax(max-content, 1.25fr) minmax(140px, 0.85fr) minmax(120px, 0.75fr) !important;
                gap: 20px !important;
            }
            .document-header-designer {
                display: grid !important;
                grid-template-columns: 27fr 33fr 40fr !important;
                gap: 0 16px !important;
                align-items: start !important;
                margin-bottom: 18px !important;
            }
            .document-header-designer .header-left {
                grid-column: 1 !important;
                min-width: 0 !important;
                overflow: hidden !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
            }
            .document-header-designer .header-center {
                grid-column: 2 !important;
                min-width: 0 !important;
                align-self: end !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                overflow: hidden !important;
            }
            .document-header-designer .header-right {
                grid-column: 3 !important;
                min-width: 0 !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                overflow: hidden !important;
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
                padding-top: 64px !important;
                padding-bottom: 2px !important;
                text-align: left !important;
                justify-items: stretch !important;
            }
            .document-header-designer .designer-meta-grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 10px 20px !important;
            }
            .document-header-designer .doc-meta-item {
                text-align: left !important;
                justify-items: start !important;
            }
            /* Sales designer print overrides — fixed 27/33/40 grid, mirrors ClassicPreview */
            .document-header-sales {
                display: grid !important;
                grid-template-columns: 27fr 33fr 40fr !important;
                gap: 0 16px !important;
                align-items: start !important;
                margin-bottom: 18px !important;
            }
            .document-header-sales .header-left {
                grid-column: 1 !important;
                min-width: 0 !important;
                overflow: hidden !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
            }
            .document-header-sales .header-center {
                grid-column: 2 !important;
                min-width: 0 !important;
                padding-top: 64px !important;
                padding-bottom: 2px !important;
                text-align: left !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                overflow: hidden !important;
            }
            .document-header-sales .header-right {
                grid-column: 3 !important;
                min-width: 0 !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                overflow: hidden !important;
            }
            .document-header-sales .designer-meta-grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 10px 20px !important;
            }
            .document-header-sales .doc-meta-item {
                text-align: left !important;
                justify-items: start !important;
            }
            .document-header-sales .bill-to-name {
                white-space: nowrap !important;
                word-break: keep-all !important;
                overflow-wrap: normal !important;
                overflow: visible !important;
            }
            .document-header-sales .bill-to-name-text {
                font-weight: 700 !important;
            }
            /* Footer area (totals + bank + terms + signature + stamp/QR):
               The JS spacer (injected before print) pushes it toward the
               bottom margin of the final page.
               break-inside:avoid keeps all footer sections together. */
            .document-footer-group {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            /* Each atomic footer group (totals, bank/terms/notes, signature,
               stamp/QR) must never be split across pages. */
            .footer-group-atomic {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            /* Spacer div injected by JS to push footer to the bottom margin */
            .footer-push-spacer {
                display: block;
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
            .tot-words {
                text-align: right !important;
                white-space: normal !important;
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
            /* Fix 4: watermark on every page — switch from absolute (page 1 only)
               to fixed so the browser repeats it across all printed pages */
            .document-watermark {
                position: fixed !important;
                inset: 0 !important;
            }
            /* Fix 3: prevent long company/customer/branch names from overflowing
               or clipping — let them wrap gracefully in print */
            .company-name,
            .company-copy {
                white-space: normal !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                overflow: visible !important;
                text-overflow: unset !important;
            }
            .document-header-sales .company-name {
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .bill-to-name {
                white-space: normal !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
            }
            .bill-to-line {
                white-space: pre-line !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
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
    .totals-table td.tot-currency,
    .totals-table td.tot-amount {
        padding: 4px 0 4px 8px !important;
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
        notes: asText(data.notes || data.meta?.notes || ''),
        terms: asText(template.termsContent || designerSettings.termsText || designerSettings.termsConditions || ''),
        displayOptions,
        totalVisibility,
        showNotesSection: pickSetting(designerSettings, ['showNotes', 'showNote'], true),
        notesLabel: asText(designerSettings.notesLabel || 'Notes'),
        showAmountInWords: pickSetting(designerSettings, ['showAmountInWords'], false),
        // Bank details: branch (company profile) is the source of truth; the
        // template designer fields are only a fallback. Section renders whenever
        // any value resolves, unless the template explicitly disables it.
        bankRows: pickSetting(designerSettings, ['showBankDetails'], true) !== false
            ? [
                { label: 'Bank', value: firstNonEmpty(company.bankName, designerSettings.bankName) },
                { label: 'Account', value: firstNonEmpty(company.bankAccountNumber, designerSettings.bankAccount) },
                { label: 'IBAN', value: firstNonEmpty(company.bankIban, designerSettings.bankIBAN) },
                { label: 'SWIFT / BIC', value: firstNonEmpty(company.bankSwift, designerSettings.bankSWIFT) },
            ].filter((row) => row.value)
            : [],
        showItemTable: items.length > 0 && pickSetting(designerSettings, ['showItemsTable', 'showItemTable'], true),
        showTotalsSection: !data.hideTotalsTable && (totals.grandTotal > 0 || totals.amountPaid > 0),
        showHighlight: summaryValue !== undefined && summaryValue !== null && asNumber(summaryValue) > 0 &&
            pickSetting(designerSettings, ['showGrandTotalBanner', 'showSummaryBar', 'showTotalReceivedBold'], true),
        showPaymentDetails: paymentDetails.length > 0,
        showSignatureBlock: pickSetting(designerSettings, ['showSignatures', 'showSignatureStrip', 'showReceivedByLine'], false),
        // Default showCompanyStamp to true when a stamp image is available (branch or template),
        // so branch stamps render automatically without requiring a saved template toggle.
        showCompanyStamp: pickSetting(designerSettings, ['showCompanyStamp', 'showStamp'], Boolean(templateStampUrl || company.stampUrl)),
        showQRCode: pickSetting(designerSettings, ['showQRCode', 'showQR'], false),
        qrCodeDataUrl: options.qrCodeDataUrl || null,
        showPageNumbers: pickSetting(designerSettings, ['showPageNumbers'], false),
        showPrintDateStamp: pickSetting(designerSettings, ['showGeneratedBy'], false),
        showWatermark: pickSetting(designerSettings, ['showWatermark'], false),
        hasDesignerWatermarkToggle: Object.prototype.hasOwnProperty.call(designerSettings, 'showWatermark'),
        watermarkText: asText(designerSettings.watermarkText || 'ORIGINAL'),
        showRowLines: pickSetting(designerSettings, ['showRowLines'], true),
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
    if (template.category === 'Quotation') {
        partyVisibility.code = false;
    }
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
        isPurchaseDesigner: false,
        isSalesDesigner: true,
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
        // Bank details: branch (company profile) is the source of truth; the
        // template designer fields are only a fallback. Section renders whenever
        // any value resolves, unless the template explicitly disables it.
        bankRows: pickSetting(designerSettings, ['showBankDetails'], true) !== false
            ? [
                { label: 'Bank', value: firstNonEmpty(company.bankName, designerSettings.bankName) },
                { label: 'Account', value: firstNonEmpty(company.bankAccountNumber, designerSettings.bankAccount) },
                { label: 'IBAN', value: firstNonEmpty(company.bankIban, designerSettings.bankIBAN) },
                { label: 'SWIFT / BIC', value: firstNonEmpty(company.bankSwift, designerSettings.bankSWIFT) },
            ].filter((row) => row.value)
            : [],
        showItemTable: items.length > 0 && pickSetting(designerSettings, ['showItemsTable', 'showItemTable'], true),
        showTotalsSection: totals.grandTotal > 0 || totals.amountPaid > 0,
        showHighlight: summaryValue > 0 && pickSetting(designerSettings, ['showGrandTotalBanner', 'showSummaryBar'], true),
        showPaymentDetails: false,
        showSignatureBlock: pickSetting(designerSettings, ['showSignatures', 'showSignatureStrip'], false),
        showCompanyStamp: pickSetting(designerSettings, ['showCompanyStamp', 'showStamp'], Boolean(templateStampUrl || company.stampUrl)),
        showQRCode: pickSetting(designerSettings, ['showQRCode', 'showQR'], false),
        qrCodeDataUrl: options.qrCodeDataUrl || null,
        showPageNumbers: pickSetting(designerSettings, ['showPageNumbers'], false),
        showPrintDateStamp: pickSetting(designerSettings, ['showGeneratedBy'], false),
        showWatermark: pickSetting(designerSettings, ['showWatermark'], false),
        hasDesignerWatermarkToggle: Object.prototype.hasOwnProperty.call(designerSettings, 'showWatermark'),
        watermarkText: asText(designerSettings.watermarkText || 'ORIGINAL'),
        showRowLines: pickSetting(designerSettings, ['showRowLines'], true),
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

// ─────────────────────────────────────────────────────────────────────────
// Goods Receipt Note — dedicated renderer mirroring the GRN Template Designer
// preview (GRNTemplateDesigner.jsx > GRNPreview). The generic document layout
// can't reproduce the gold/dark header, receiving-summary pills, batch/QC
// tables and inventory-impact cards, so the GRN category renders here instead.
// ─────────────────────────────────────────────────────────────────────────
const isGrnDesignerTemplate = (template = {}) => {
    const settings = getTemplateDesignerSettings(template);
    return settings.purchaseDesigner === 'grn' || settings.docType === 'grn';
};

const renderGrnReceiptHtml = (template, data, options = {}, _renderTarget = 'print') => {
    const s = getTemplateDesignerSettings(template);
    const company = normalizeDocumentCompanyProfile(options.companyProfile || {});
    const meta = data.grnMeta || {};
    const party = data.party || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const summary = meta.summary || {};

    const on = (key, fallback = true) => pickSetting(s, [key], fallback);
    const txt = (v) => escapeHtml(asText(v).trim());

    const fontFamily = sanitizeCssFontFamily(s.fontFamily === 'DM Sans' ? "'DM Sans', sans-serif" : s.fontFamily, "'DM Sans', sans-serif");
    const fontSizePt = (() => {
        const n = Number(s.fontSize);
        return Number.isFinite(n) ? Math.min(13, Math.max(8, n)) : 11;
    })();
    const fontColor = sanitizeCssColor(s.fontColor, '#0f1923');
    const headerBg = sanitizeCssColor(s.headerBackgroundColor || s.accentColor, '#F5C742');
    const footerBg = sanitizeCssColor(s.footerBackgroundColor, '#0f1923');
    const tableHeaderColor = sanitizeCssColor(s.tableHeaderColor || s.tableHeaderBg, '#0f1923');
    const bgColor = sanitizeCssColor(s.backgroundColor, '#FFFFFF');
    const headerFontSize = (() => {
        const n = Number(s.headerFontSize);
        return Number.isFinite(n) ? Math.min(40, Math.max(12, n)) : 22;
    })();

    const paperSize = (template.paperSize || s.paperSize || 'A4');
    const orientation = (template.orientation || s.orientation || 'portrait');

    const currencyConfig = resolveCurrencyDisplayConfig(company);
    const currencyLabel = renderCurrencySymbolHtml(company);

    // ── header logo ──
    const logoUrl = company.logoUrl;
    const logoHtml = on('showCompanyLogo')
        ? (logoUrl
            ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:42px;height:42px;border-radius:8px;object-fit:contain;background:rgba(0,0,0,0.06);flex-shrink:0;" />`
            : `<div style="width:38px;height:38px;background:rgba(0,0,0,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;color:#0f1923;">${txt((company.companyName || 'G').charAt(0))}</div>`)
        : '';

    const companyContact = [
        on('showCompanyAddress') && company.address ? `<div style="color:rgba(0,0,0,0.75);font-weight:600;">${txt(company.companyName)}</div><div>${txt(company.address)}</div>` : (on('showCompanyName') && company.companyName ? `<div style="color:rgba(0,0,0,0.75);font-weight:600;">${txt(company.companyName)}</div>` : ''),
        on('showCompanyPhone') && company.phone ? `<div>${txt(company.phone)}</div>` : '',
        on('showCompanyEmail') && company.email ? `<div>${txt(company.email)}</div>` : '',
        on('showCompanyWebsite') && company.website ? `<div>${txt(company.website)}</div>` : '',
        on('showCompanyTaxId', true) && company.trn ? `<div><strong style="color:rgba(0,0,0,0.75);">TRN:</strong> ${txt(company.trn)}</div>` : '',
        on('showCompanyRegNumber', false) && company.crn ? `<div><strong style="color:rgba(0,0,0,0.75);">Reg:</strong> ${txt(company.crn)}</div>` : '',
    ].filter(Boolean).join('');

    const headerMetaRow = (label, value) => `
        <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.1);color:rgba(0,0,0,0.7);">
            <span style="color:rgba(0,0,0,0.45);">${escapeHtml(label)}</span>
            <span style="font-weight:500;font-family:monospace;">${txt(value)}</span>
        </div>`;

    const headerMetaRows = [
        on('showGRNNumber') && data.docNo ? headerMetaRow('GRN No', data.docNo) : '',
        on('showGRNDate') && data.date ? headerMetaRow('GRN Date', formatDocDate(data.date)) : '',
        on('showBranch') && meta.branchName ? headerMetaRow('Branch', meta.branchName) : '',
        on('showWarehouse') && meta.warehouse ? headerMetaRow('Warehouse', meta.warehouse) : '',
    ].filter(Boolean).join('');

    const statusText = asText(data.status).trim();
    const posted = meta.posted || statusText.toUpperCase() === 'POSTED';
    const statusBadge = on('showStatusBadge') && statusText ? `
        <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.2);color:#0f1923;border-radius:20px;padding:4px 12px;font-size:10.5px;font-weight:500;margin-top:8px;align-self:flex-end;">
            <span style="width:7px;height:7px;border-radius:50%;background:${posted ? '#0d7a4e' : '#b45309'};display:inline-block;"></span>
            ${escapeHtml(statusText.replace(/_/g, ' '))}
        </div>` : '';

    const sectionLabel = (text) => `
        <div style="font-size:9.5px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:#6b7a8a;margin:20px 0 8px;display:flex;align-items:center;gap:8px;">
            ${escapeHtml(text)}
            <span style="flex:1;height:1px;background:#dde2e8;display:block;"></span>
        </div>`;

    const kv = (k, v, mono = false) => `
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;padding:4px 0;border-bottom:1px solid #dde2e8;gap:8px;">
            <span style="color:#6b7a8a;white-space:nowrap;flex-shrink:0;">${escapeHtml(k)}</span>
            <span style="font-weight:500;color:${mono ? '#1040b0' : '#0f1923'};text-align:right;${mono ? 'font-family:monospace;font-size:11px;' : ''}">${txt(v)}</span>
        </div>`;

    // ── Vendor & Purchase Reference ──
    const vendorRows = [
        on('showVendorName') && party.name ? kv('Vendor Name', party.name) : '',
        on('showVendorCode') && party.code ? kv('Vendor Code', party.code, true) : '',
        on('showVendorMobile') && party.phone ? kv('Mobile', party.phone, true) : '',
        on('showVendorContact', false) && party.email ? kv('Email', party.email) : '',
        on('showVendorTRN') && party.taxId ? kv('TRN', party.taxId, true) : '',
    ].filter(Boolean).join('');

    const poRows = [
        on('showLPONumber') && meta.lpoNumber ? kv('LPO No', meta.lpoNumber, true) : '',
        on('showSupplierInvoice') && meta.supplierInvoice ? kv('Supplier Invoice', meta.supplierInvoice, true) : '',
        on('showDeliveryNote') && meta.deliveryNote ? kv('Delivery Note', meta.deliveryNote, true) : '',
        on('showVehicleNo') && meta.vehicleNo ? kv('Vehicle No', meta.vehicleNo, true) : '',
        on('showReceivedBy') && meta.receivedBy ? kv('Received By', meta.receivedBy) : '',
    ].filter(Boolean).join('');

    const vendorCard = on('showVendorCard') && vendorRows ? `
        <div style="background:#f4f6f8;border:1px solid #dde2e8;border-radius:10px;padding:14px 16px;">
            <div style="font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#1a56db;margin-bottom:10px;">Vendor Details</div>
            ${vendorRows}
        </div>` : '';
    const poCard = on('showPOCard') && poRows ? `
        <div style="background:#f4f6f8;border:1px solid #dde2e8;border-radius:10px;padding:14px 16px;">
            <div style="font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#1a56db;margin-bottom:10px;">Purchase Reference</div>
            ${poRows}
        </div>` : '';
    const vendorSection = (vendorCard || poCard) ? `
        ${sectionLabel('Vendor & Purchase Reference')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${vendorCard}${poCard}</div>` : '';

    // ── Receiving Summary pills ──
    const pill = (label, value, sub, colors) => `
        <div style="background:${colors.bg};border:1px solid ${colors.border};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;align-items:center;gap:3px;">
            <span style="font-size:9.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${colors.fg};">${escapeHtml(label)}</span>
            <span style="font-size:28px;font-weight:600;line-height:1;color:${colors.fg};font-family:monospace;">${formatNumber(value, 0)}</span>
            <span style="font-size:10px;color:#6b7a8a;">${escapeHtml(sub)}</span>
        </div>`;
    const summaryPills = [
        on('showOrderedQtyPill') && summary.ordered ? pill('Ordered Qty', summary.ordered, 'Total units on LPO', { bg: '#e8f0fe', border: '#93b4f5', fg: '#1a56db' }) : '',
        on('showReceivedQtyPill') ? pill('Received Qty', summary.received, 'Accepted & entered', { bg: '#e6f7f0', border: '#9de8c8', fg: '#0d7a4e' }) : '',
        on('showPendingQtyPill') && summary.pending ? pill('Pending Qty', summary.pending, 'Short delivery', { bg: '#fef3c7', border: '#fbbf24', fg: '#b45309' }) : '',
        on('showDamagedQtyPill') && summary.damaged ? pill('Damaged Qty', summary.damaged, 'Rejected / returned', { bg: '#fde8e8', border: '#f4a0a0', fg: '#be2d2d' }) : '',
    ].filter(Boolean);
    const summarySection = on('showSummaryBar') && summaryPills.length ? `
        ${sectionLabel('Receiving Summary')}
        <div style="display:grid;grid-template-columns:repeat(${summaryPills.length}, 1fr);gap:10px;">${summaryPills.join('')}</div>` : '';

    // ── Items table (columns gated by toggle + data presence) ──
    const anyBarcode = items.some((it) => asText(it.barcode).trim());
    const anyOrdered = items.some((it) => asNumber(it.ordered) > 0);
    const anyDamaged = items.some((it) => asNumber(it.damaged) > 0);
    const anyBatch = items.some((it) => asText(it.batchNumber).trim());
    const anyExpiry = items.some((it) => asText(it.expiry).trim());
    const anyBin = items.some((it) => asText(it.binLocation).trim());

    const cols = [
        { key: 'n', show: on('showLineNumber'), th: '#', align: 'center', width: '28px' },
        { key: 'desc', show: on('showItemDescription'), th: 'Item Description', align: 'left' },
        { key: 'barcode', show: on('showBarcode') && anyBarcode, th: 'Barcode', align: 'center' },
        { key: 'ordered', show: on('showOrderedQty') && anyOrdered, th: 'Ordered', align: 'right' },
        { key: 'received', show: on('showReceivedQty'), th: 'Received', align: 'right' },
        { key: 'damaged', show: on('showDamagedQty') && anyDamaged, th: 'Damaged', align: 'right' },
        { key: 'batch', show: on('showBatchNo') && anyBatch, th: 'Batch No', align: 'center' },
        { key: 'expiry', show: on('showExpiry') && anyExpiry, th: 'Expiry', align: 'center' },
        { key: 'bin', show: on('showBinLocation') && anyBin, th: 'Bin Loc', align: 'left' },
    ].filter((c) => c.show);

    const headerAlign = (s.tableHeaderAlign === 'center' || s.tableHeaderAlign === 'right') ? s.tableHeaderAlign : 'left';
    const itemHeadCells = cols.map((c) => {
        const align = c.key === 'desc' ? headerAlign : c.align;
        return `<th style="padding:9px 10px;text-align:${align};font-size:9.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;${c.width ? `width:${c.width};` : ''}">${escapeHtml(c.th)}</th>`;
    }).join('');

    const itemRows = items.map((it, i) => {
        const cellFor = (c) => {
            switch (c.key) {
                case 'n':
                    return `<td style="padding:10px;text-align:center;color:#a0aab4;font-size:10px;">${escapeHtml(String(it.rowNo || i + 1).padStart(2, '0'))}</td>`;
                case 'desc': {
                    const idLine = [it.code && `${txt(it.code)}`, it.sku && it.sku !== it.code ? `SKU: ${txt(it.sku)}` : ''].filter(Boolean).join(' · ');
                    return `<td style="padding:10px;vertical-align:top;">
                        <div style="font-weight:600;font-size:12px;color:#0f1923;">${txt(it.name) || '-'}</div>
                        ${idLine ? `<div style="font-family:monospace;font-size:10px;color:#1040b0;margin-top:1px;">${idLine}</div>` : ''}
                        ${it.desc ? `<div style="font-size:10px;color:#6b7a8a;margin-top:1px;">${txt(it.desc)}</div>` : ''}
                    </td>`;
                }
                case 'barcode':
                    return `<td style="padding:10px;text-align:center;vertical-align:top;">
                        ${it.barcode ? `<div style="width:80px;margin:0 auto;">${renderBatchBarcodeSvg(it.barcode, { height: 22 })}</div><div style="font-family:monospace;font-size:9px;color:#6b7a8a;margin-top:2px;">${txt(it.barcode)}</div>` : '-'}
                    </td>`;
                case 'ordered':
                    return `<td style="padding:10px;text-align:right;font-family:monospace;color:#3b4a58;">${formatNumber(it.ordered, 0)}</td>`;
                case 'received':
                    return `<td style="padding:10px;text-align:right;font-family:monospace;font-weight:600;color:#0d7a4e;">${formatNumber(it.received, 0)}</td>`;
                case 'damaged': {
                    const d = asNumber(it.damaged);
                    const color = d === 0 ? '#0d7a4e' : d <= 2 ? '#b45309' : '#be2d2d';
                    return `<td style="padding:10px;text-align:right;font-family:monospace;font-weight:600;color:${color};">${formatNumber(d, 0)}</td>`;
                }
                case 'batch':
                    return `<td style="padding:10px;text-align:center;font-family:monospace;font-size:10.5px;color:#3b4a58;">${txt(it.batchNumber) || '-'}</td>`;
                case 'expiry':
                    return `<td style="padding:10px;text-align:center;font-family:monospace;font-size:10.5px;color:#3b4a58;">${it.expiry ? escapeHtml(formatDocDate(it.expiry)) : '-'}</td>`;
                case 'bin':
                    return `<td style="padding:10px;font-family:monospace;font-size:10.5px;color:#3b4a58;">${txt(it.binLocation) || '-'}</td>`;
                default:
                    return '<td style="padding:10px;">-</td>';
            }
        };
        return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafbfc'};border-bottom:1px solid #dde2e8;">${cols.map(cellFor).join('')}</tr>`;
    }).join('');

    const itemsSection = on('showItemsTable') && cols.length ? `
        ${sectionLabel('Item Details')}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid #dde2e8;border-radius:10px;overflow:hidden;">
            <thead><tr style="background:${tableHeaderColor};color:#fff;">${itemHeadCells}</tr></thead>
            <tbody>${itemRows || `<tr><td colspan="${cols.length}" style="padding:14px;text-align:center;color:#a0aab4;">No items found.</td></tr>`}</tbody>
        </table>` : '';

    // ── Batch & Expiry Control ──
    const batchItems = items.filter((it) => asText(it.batchNumber).trim());
    const batchSection = on('showBatchTable') && batchItems.length ? `
        ${sectionLabel('Batch & Expiry Control')}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid #9de8c8;border-radius:10px;overflow:hidden;">
            <thead><tr style="background:#0d7a4e;">${['Item', 'Batch No', 'Qty', 'Expiry Date', 'Status'].map((h) => `<th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;">${h}</th>`).join('')}</tr></thead>
            <tbody>${batchItems.map((it, i) => `
                <tr style="background:${i % 2 === 0 ? '#fff' : '#f0fdf8'};border-bottom:1px solid #c3f0dc;">
                    <td style="padding:9px 12px;">${txt(it.name)}</td>
                    <td style="padding:9px 12px;font-family:monospace;font-size:10.5px;">${txt(it.batchNumber)}</td>
                    <td style="padding:9px 12px;font-family:monospace;font-size:10.5px;">${formatNumber(it.received, 0)}</td>
                    <td style="padding:9px 12px;font-family:monospace;font-size:10.5px;">${it.expiry ? escapeHtml(formatDocDate(it.expiry)) : '-'}</td>
                    <td style="padding:9px 12px;"><span style="background:#e6f7f0;color:#0d7a4e;border:1px solid #9de8c8;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">Good</span></td>
                </tr>`).join('')}</tbody>
        </table>` : '';

    // ── Damage & Shortage ──
    const damageItems = items.filter((it) => asNumber(it.shortage) > 0 || asNumber(it.damaged) > 0);
    const damageSection = on('showDamageTable') && damageItems.length ? `
        ${sectionLabel('Damage & Shortage Report')}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid #f4a0a0;border-radius:10px;overflow:hidden;">
            <thead><tr style="background:#be2d2d;">${['Item', 'Ordered', 'Received', 'Shortage', 'Damage', 'Notes'].map((h) => `<th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;">${h}</th>`).join('')}</tr></thead>
            <tbody>${damageItems.map((it) => `
                <tr style="border-bottom:1px solid #fcd5d5;">
                    <td style="padding:9px 12px;">${txt(it.name)}</td>
                    <td style="padding:9px 12px;">${formatNumber(it.ordered, 0)}</td>
                    <td style="padding:9px 12px;">${formatNumber(it.received, 0)}</td>
                    <td style="padding:9px 12px;color:#b45309;font-weight:600;">${formatNumber(it.shortage, 0)}</td>
                    <td style="padding:9px 12px;color:#be2d2d;font-weight:600;">${formatNumber(it.damaged, 0)}</td>
                    <td style="padding:9px 12px;color:#3b4a58;font-size:11px;">${txt(it.qcRemarks) || '-'}</td>
                </tr>`).join('')}</tbody>
        </table>` : '';

    // ── QC / Inspection ──
    const qcItems = items.filter((it) => asText(it.qcStatus).trim() || asText(it.checkedBy).trim());
    const qcBadge = (status) => {
        const v = asText(status).toLowerCase();
        const pass = /pass|good|ok|accept|complete/.test(v);
        return pass
            ? `<span style="background:#e6f7f0;color:#0d7a4e;border:1px solid #9de8c8;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">${txt(status) || 'Passed'}</span>`
            : `<span style="background:#fef3c7;color:#b45309;border:1px solid #fbbf24;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">${txt(status) || 'Partial'}</span>`;
    };
    const qcSection = on('showQCTable') && qcItems.length ? `
        ${sectionLabel('QC / Inspection Report')}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid #93b4f5;border-radius:10px;overflow:hidden;">
            <thead><tr style="background:#1a56db;">${['Item', 'QC Status', 'Checked By', 'Remarks'].map((h) => `<th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;">${h}</th>`).join('')}</tr></thead>
            <tbody>${qcItems.map((it, i) => `
                <tr style="background:${i % 2 === 0 ? '#fff' : '#f0f5ff'};border-bottom:1px solid #d0dffb;">
                    <td style="padding:9px 12px;">${txt(it.name)}</td>
                    <td style="padding:9px 12px;">${qcBadge(it.qcStatus || meta.qcStatus)}</td>
                    <td style="padding:9px 12px;">${txt(it.checkedBy) || txt(meta.checkedBy) || '-'}</td>
                    <td style="padding:9px 12px;font-size:11px;color:#3b4a58;">${txt(it.qcRemarks) || '-'}</td>
                </tr>`).join('')}</tbody>
        </table>` : '';

    // ── Valuation (preserve financial totals from the legacy print) ──
    const totals = data.totals || {};
    const valuationSection = asNumber(totals.grandTotal) > 0 ? `
        ${sectionLabel('Valuation Summary')}
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tbody>
                <tr><td style="padding:5px 0;color:#6b7a8a;">Sub Total</td><td style="padding:5px 0;text-align:right;font-family:monospace;">${currencyLabel} ${formatNumber(totals.subTotal)}</td></tr>
                ${asNumber(totals.tax) > 0 ? `<tr><td style="padding:5px 0;color:#6b7a8a;">Total VAT</td><td style="padding:5px 0;text-align:right;font-family:monospace;">${currencyLabel} ${formatNumber(totals.tax)}</td></tr>` : ''}
                <tr style="border-top:2px solid #0f1923;"><td style="padding:7px 0;font-weight:700;">Received Value</td><td style="padding:7px 0;text-align:right;font-family:monospace;font-weight:700;font-size:14px;">${currencyLabel} ${formatNumber(totals.grandTotal)}</td></tr>
            </tbody>
        </table>` : '';

    // ── Inventory Impact ──
    const impactCard = (label, value, sub, big) => `
        <div style="background:#0f1923;border-radius:10px;padding:14px 16px;color:#fff;display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:9.5px;color:rgba(255,255,255,0.5);letter-spacing:1px;text-transform:uppercase;">${escapeHtml(label)}</div>
            <div style="font-size:${big ? '22px' : '15px'};font-weight:600;font-family:monospace;color:#6ee7b7;margin-top:${big ? '0' : '4px'};">${value}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.45);">${escapeHtml(sub)}</div>
        </div>`;
    const impactSection = on('showInventoryImpact') && posted ? `
        ${sectionLabel('Inventory Impact Summary')}
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">
            ${impactCard('Total Items Received', formatNumber(summary.received, 0), 'Units entered into live stock', true)}
            ${impactCard('Total Batches Created', String(meta.batchCount || 0), 'Batch records updated in ERP', true)}
            ${impactCard('Warehouse Updated', txt(meta.warehouse) || '-', meta.location ? txt(meta.location) : 'Stock posted', false)}
        </div>` : '';

    // ── Notes / Terms ──
    const notesText = firstNonEmpty(data.notes, s.notesText);
    const notesSection = on('showNotes') && notesText ? `
        ${sectionLabel('Warehouse Notes & Remarks')}
        <div style="background:#f4f6f8;border:1px solid #dde2e8;border-left:4px solid #1a56db;border-radius:0 6px 6px 0;padding:12px 16px;font-size:12px;color:#3b4a58;line-height:1.7;">${txt(notesText)}</div>` : '';

    const termsText = firstNonEmpty(template.termsContent, s.termsConditions);
    const termsSection = on('showTermsConditions', s.showTerms !== false) && termsText ? `
        ${sectionLabel('Terms & Conditions')}
        <div style="background:#f4f6f8;border:1px solid #dde2e8;border-radius:6px;padding:12px 16px;font-size:11px;color:#6b7a8a;white-space:pre-wrap;">${txt(termsText)}</div>` : '';

    // ── Signatures ──
    const sigs = [
        on('showPreparedBy') && { role: 'Prepared By', name: meta.receivedBy || '' },
        on('showWarehouseIncharge') && { role: 'Warehouse Incharge', name: '' },
        on('showQCOfficer') && { role: 'QC Officer', name: meta.checkedBy || '' },
        on('showVendorRep') && { role: 'Vendor Delivery', name: '' },
    ].filter(Boolean);
    const signatureSection = on('showSignatures') && sigs.length ? `
        ${sectionLabel('Authorization & Signatures')}
        <div style="display:grid;grid-template-columns:repeat(${sigs.length}, 1fr);gap:12px;">
            ${sigs.map((sig) => `
                <div style="text-align:center;">
                    <div style="height:56px;border-bottom:2px solid #a0aab4;position:relative;margin-bottom:8px;"></div>
                    <div style="font-size:10px;font-weight:600;color:#0f1923;text-transform:uppercase;letter-spacing:0.8px;">${escapeHtml(sig.role)}</div>
                    <div style="font-size:11px;color:#6b7a8a;margin-top:2px;">${txt(sig.name) || '&nbsp;'}</div>
                </div>`).join('')}
        </div>` : '';

    // ── QR + Stamp ──
    const qrDataUrl = on('showQRCode') ? options.qrCodeDataUrl : null;
    const stampUrl = company.stampUrl;
    const showStamp = on('showStamp') && company.showStampInPrint !== false;
    const qrStampSection = (qrDataUrl || showStamp) ? `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;">
            <div>${qrDataUrl ? `
                <div style="border:1px solid #dde2e8;padding:8px;display:inline-block;border-radius:6px;text-align:center;">
                    <img src="${escapeHtml(qrDataUrl)}" width="64" height="64" style="display:block;width:64px;height:64px;-webkit-print-color-adjust:exact;print-color-adjust:exact;" alt="QR" />
                    <div style="font-size:9px;color:#6b7a8a;margin-top:4px;">Scan to verify</div>
                </div>` : ''}</div>
            ${showStamp ? `
                <div style="display:flex;flex-direction:column;align-items:center;">
                    ${stampUrl
                ? `<img src="${escapeHtml(stampUrl)}" alt="Stamp" style="width:72px;height:72px;object-fit:contain;" />`
                : `<div style="width:64px;height:64px;border:2px dashed #a0aab4;border-radius:50%;display:flex;align-items:center;justify-content:center;"><span style="font-size:9px;color:#a0aab4;text-align:center;letter-spacing:0.5px;text-transform:uppercase;">Company<br/>Stamp</span></div>`}
                    <div style="font-size:9px;color:#a0aab4;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Official Stamp</div>
                </div>` : ''}
        </div>` : '';

    // ── Doc footer bar ──
    const generatedDate = new Date().toISOString().slice(0, 10);
    const footerSection = on('showDocFooter') ? `
        <div style="background:${footerBg};padding:12px 24px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:10px;color:#5a7a96;">
                <strong style="color:#8ca4bc;font-weight:500;">${txt(data.docNo)}</strong> · ${txt(company.companyName)}<br/>
                Generated: ${escapeHtml(generatedDate)}
            </div>
            <div style="font-size:10px;color:#5a7a96;text-align:right;">
                <strong style="color:#8ca4bc;font-weight:500;">${txt(meta.warehouse) || txt(meta.branchName) || ''}</strong><br/>
                ${on('showPageNumbers') ? 'Page 1 of 1 · ' : ''}Confidential — Internal Use Only
            </div>
        </div>` : '';

    // ── Watermark ──
    const watermark = on('showWatermark', false) ? `
        <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:${Number(s.watermarkOpacity) || 0.1};font-size:72pt;font-weight:bold;color:#cccccc;transform:rotate(-45deg);z-index:0;">${txt(s.watermarkText || 'RECEIVED')}</div>` : '';

    const documentTitle = generateDocFilename(
        'Goods Receipt Note',
        data.docNo,
        party.name,
        formatDocDate(data.date) || generatedDate,
        currencyConfig.label
    );

    const pageSizeCss = `${paperSize} ${String(orientation).toLowerCase() === 'landscape' ? 'landscape' : 'portrait'}`;

    const styles = `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @page { size: ${pageSizeCss}; margin: 0; }
        html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: ${bgColor}; }
        .grn-doc {
            background: ${bgColor};
            font-family: ${fontFamily};
            font-size: ${fontSizePt}pt;
            color: ${fontColor};
            line-height: 1.5;
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            position: relative;
        }
        table { page-break-inside: auto; }
        tr, .grn-section { page-break-inside: avoid; }
        @media print { .grn-doc { box-shadow: none; max-width: 100%; } }
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${styles}</style>
</head>
<body>
    <div class="grn-doc">
        ${watermark}
        <div style="background:${headerBg};display:grid;grid-template-columns:1fr auto;align-items:stretch;position:relative;z-index:1;">
            <div style="padding:24px 28px;display:flex;flex-direction:column;gap:6px;text-align:${s.companyDetailsAlign || 'left'};">
                ${logoHtml || on('showCompanyName') ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                    ${logoHtml}
                    ${on('showCompanyName') && company.companyName ? `<div><div style="font-size:${headerFontSize}px;font-weight:600;color:#0f1923;letter-spacing:-0.5px;">${txt(company.companyName)}</div></div>` : ''}
                </div>` : ''}
                <div style="font-size:11px;color:rgba(0,0,0,0.6);line-height:1.7;margin-top:4px;">${companyContact}</div>
            </div>
            <div style="background:rgba(0,0,0,0.12);padding:24px 28px;display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;min-width:260px;">
                <div style="font-size:14px;font-weight:600;color:rgba(0,0,0,0.65);letter-spacing:3px;text-transform:uppercase;text-align:right;line-height:1.3;">
                    <div style="font-size:9px;letter-spacing:2px;color:rgba(0,0,0,0.45);margin-bottom:2px;">ERP Document</div>
                    Goods Receipt<br/>Note
                </div>
                <div style="width:100%;margin-top:10px;">${headerMetaRows}</div>
                ${statusBadge}
            </div>
        </div>

        <div style="padding:0 24px 24px;position:relative;z-index:1;">
            <div class="grn-section">${vendorSection}</div>
            <div class="grn-section">${summarySection}</div>
            <div class="grn-section">${itemsSection}</div>
            <div class="grn-section">${batchSection}</div>
            <div class="grn-section">${damageSection}</div>
            <div class="grn-section">${qcSection}</div>
            <div class="grn-section">${valuationSection}</div>
            <div class="grn-section">${impactSection}</div>
            <div class="grn-section">${notesSection}</div>
            <div class="grn-section">${termsSection}</div>
            <div class="grn-section">${signatureSection}</div>
            ${qrStampSection}
        </div>

        ${footerSection}
    </div>
</body>
</html>`;
};
// ─────────────────────────────────────────────────────────────────────────────
// Footer Placement Script — injected into print HTML to dynamically position
// the entire footer cluster at the bottom of the final page or push it to a new page.
// ─────────────────────────────────────────────────────────────────────────────
const buildFooterPlacementScript = (paperSize = 'A4', orientation = 'Portrait') => {
    const page = resolvePaperDimensions(paperSize, orientation);
    // Convert mm → px at 96 dpi CSS reference pixels
    const pageHeightPx = Math.round(page.height * (96 / 25.4));
    // Shell padding (12 mm each side at 96 dpi)
    const shellPaddingPx = Math.round(12 * (96 / 25.4));

    return `<script>
(function () {
    'use strict';
    function fitSingleLineHeaderText() {
        var nodes = document.querySelectorAll('.document-header-sales .bill-to-name-text');
        nodes.forEach(function (node) {
            var container = node.closest('.bill-to-name');
            if (!container) return;

            node.style.transform = '';
            container.style.whiteSpace = 'nowrap';

            var available = container.clientWidth;
            var required = node.scrollWidth;
            if (!available || !required || required <= available) return;

            node.style.transform = 'scaleX(' + (available / required).toFixed(4) + ')';
        });
    }

    function run() {
        try {
            fitSingleLineHeaderText();

            var spacer   = document.getElementById('footer-push-spacer');
            var footer   = document.querySelector('.document-footer-group');
            var shell    = document.querySelector('.document-shell');
            var spacer  = document.getElementById('footer-push-spacer');
            var footer  = document.querySelector('.document-footer-group');
            var shell   = document.querySelector('.document-shell');
            if (!spacer || !footer || !shell) return;

            // Reset spacer so all measurements reflect natural layout
            spacer.style.height = '0px';

            // Force a synchronous reflow after resetting spacer
            // (getBoundingClientRect already forces reflow, but make intent explicit)
            var _ = spacer.getBoundingClientRect();

            var rawPageH = ${pageHeightPx};

            // @page margins (mm → px at 96 dpi):
            //   first page : top 12mm + bottom 12mm  = 24mm
            //   continuation: top 26mm + bottom 12mm = 38mm
            // offsetFromShellTop is measured from the shell's own top edge, which
            // is already below the @page top margin.  So usableH must represent how
            // many CSS-px of *shell content* fit per page — i.e. rawPageH minus only
            // the @page top+bottom margins.  Do NOT subtract shell left/right padding
            // here; that is already baked into the rendered positions we measure.
            //
            // We use the first-page margins (24 mm) for page 0 and continuation
            // margins (38 mm) for every subsequent page.  For the spacer-fit test we
            // care about the page the spacer is currently on, so we pick the right
            // margin set after determining pageIndex.
            var MM   = 96 / 25.4;
            var page0MarginsPx = Math.round(24 * MM);   // first page  12+12 mm
            var pageNMarginsPx = Math.round(38 * MM);   // continuation 26+12 mm

            // Usable shell-content height per page
            var usableH0 = rawPageH - page0MarginsPx;   // page 0
            var usableHN = rawPageH - pageNMarginsPx;   // pages 1+
            if (usableH0 < 200) { usableH0 = rawPageH * 0.82; }
            if (usableHN < 200) { usableHN = rawPageH * 0.82; }

            var shellRect  = shell.getBoundingClientRect();
            var spacerRect = spacer.getBoundingClientRect();
            var footerH    = footer.getBoundingClientRect().height;

            // The shell has padding:12mm on screen but padding-bottom:0 in @media print.
            // The spacer height we set is consumed in screen layout, but the browser
            // renders the final print using print CSS where that bottom padding is gone.
            // Subtract the screen shell bottom-padding so the spacer doesn't overshoot.
            var shellBottomPadPx = parseFloat(getComputedStyle(shell).paddingBottom) || 0;

            // Distance from shell top to the spacer (natural layout, no added height)
            var offsetFromShellTop = spacerRect.top - shellRect.top;

            // Determine which page the spacer falls on by accumulating page heights
            var pageIndex   = 0;
            var accumulated = usableH0;
            while (offsetFromShellTop >= accumulated) {
                pageIndex++;
                accumulated += usableHN;
            }

            // usableH for the page the spacer is on
            var usableH    = pageIndex === 0 ? usableH0 : usableHN;

            // Start of the current page (in shell-content coordinates)
            var pageStart  = pageIndex === 0
                ? 0
                : usableH0 + (pageIndex - 1) * usableHN;

            // How much of that page is already consumed above the spacer
            var usedOnPage = offsetFromShellTop - pageStart;

            // How much room is left on this page after the spacer.
            // Subtract shell screen bottom-padding because it disappears in @media print,
            // so it must not count as available space for content.
            var remaining  = usableH - usedOnPage - shellBottomPadPx;
            if (remaining < 0) remaining = 0;

            if (remaining >= footerH) {
                // Footer fits — just fill the gap so footer sits at the page bottom
                var gap = remaining - footerH;
                spacer.style.height = (gap > 0 ? gap : 0) + 'px';
            } else {
                // Footer does not fit; push it to the next page and bottom-align it
                var spaceOnNextPage = usableHN - footerH;
                if (spaceOnNextPage < 0) spaceOnNextPage = 0;
                spacer.style.height = (remaining + spaceOnNextPage) + 'px';
            }
        } catch (e) {
            // silently fall back — footer flows naturally after the table
        }
    }
    // Run after fonts/images settle; also hook beforeprint for the dialog path
    if (document.readyState === 'complete') {
        setTimeout(run, 120);
    } else {
        window.addEventListener('load', function () { setTimeout(run, 120); });
    }
    window.addEventListener('beforeprint', run);
})();
<\/script>`;
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

    const footerScript = renderTarget === 'print'
        ? buildFooterPlacementScript(template.paperSize || 'A4', template.orientation || 'Portrait')
        : '';

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
                ${buildGrandTotal(layout, renderTarget)}
                <main class="content-stack">
                    ${buildPaymentCard(layout)}
                    ${buildItemsTable(layout)}
                    <div class="footer-push-spacer" id="footer-push-spacer"></div>
                    <div class="document-footer-group">
                        ${buildSummarySection(layout, renderTarget)}
                        ${buildSignatureBlock(layout)}
                        ${buildStampBlock(layout, renderTarget)}
                        ${buildPrintDateStamp(layout, renderTarget)}
                        ${buildPageNumbers(layout, renderTarget)}
                    </div>
                </main>
                ${buildFooterBar(layout, renderTarget, options.billBullLogo)}
                ${buildFooterAddon(layout)}
                ${buildWatermark(layout)}
            </div>
            ${footerScript}
        </body>
        </html>
    `;
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer Payment Receipt — mirrors PaymentReceiptPreview in
// PaymentReceiptDesigner.jsx. Triggered for 'Receipt Voucher' category.
// ─────────────────────────────────────────────────────────────────────────────
const defaultPaymentReceiptSettings = () => ({
    accentColor: '#F5C742', fontFamily: 'Inter, sans-serif', fontSize: 9, paperSize: 'A4',
    showLogo: true, showStatusBadge: true,
    showCustomerName: true, showCustomerCode: true, showCustomerAddress: true,
    showCustomerPhone: true, showCustomerEmail: false, showCustomerTRN: false, showVATNumber: true,
    showReceiptNumber: true, showReceiptDate: true, showReceiptSession: true,
    showInvoiceCount: true, showAccountCurrency: true, showBankAccount: true,
    showInvoiceStatus: true, showInvoiceDate: true, showInvoiceTotal: true,
    showOutstanding: true, showReceivedNow: true, showBalanceAfter: true, showLinkedSO: true,
    showTotalOutstanding: true, showDiscountAllowed: true, showRemainingBalance: true, showTotalReceivedBold: true,
    showPaymentMethod: true, showChequeRef: true, showDepositedTo: true, showChequeDate: true,
    showNote: true, showCompanyStamp: true, showQRCode: false, stampUrl: '',
    showGeneratedBy: true, showReceivedByLine: true,
    showCompanyName: true, showCompanyAddress: true, showCompanyPhone: true, showCompanyEmail: true, showTRN: true,
});

const renderCustomerPaymentReceiptHtml = (template, data, options = {}) => {
    const raw = getTemplateDesignerSettings(template);
    const s = { ...defaultPaymentReceiptSettings(), ...raw };
    const co = normalizeDocumentCompanyProfile(options.companyProfile || {});
    const f = Number(s.fontSize) || 9;
    const gold = s.accentColor || '#F5C742';
    const paper = resolvePaperDimensions(s.paperSize || template?.paperSize || 'A4', 'Portrait');
    const esc = escapeHtml;
    const fmt = (n) => Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Use plain currency label (e.g. "AED") to match the designer preview — avoid
    // the dirham image which breaks inline table cell layout.
    const currLabel = esc(renderCurrencySymbol(co));

    const r = data.receiptData || {};
    const cust = data.customerData || {};
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const sum = data.summary || {};
    const pay = data.payment || {};

    // Logo: designer-uploaded URL takes priority, then company profile logo, then initial circle
    const resolvedLogoUrl = resolveTemplateImageUrl(s.logoUrl) || co.logoUrl || '';
    const logoHtml = s.showLogo
        ? (resolvedLogoUrl
            ? `<img src="${esc(resolvedLogoUrl)}" alt="Logo" style="height:72px;object-fit:contain;" />`
            : `<div style="width:72px;height:72px;border-radius:50%;background:${gold}22;border:3px solid ${gold};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:${gold};">${esc((co.companyName || 'G').charAt(0))}</div>`)
        : '';

    const metaItems = [
        s.showReceiptNumber && r.receiptNumber ? ['Receipt No.', r.receiptNumber] : null,
        s.showReceiptDate && r.date ? ['Date', r.date] : null,
        s.showReceiptSession && r.session ? ['Receipt Session', r.session] : null,
        s.showInvoiceCount && r.invoiceCount ? ['Invoices', r.invoiceCount] : null,
        s.showAccountCurrency && r.account ? ['Account', r.account] : null,
        s.showBankAccount && r.bankAccount ? ['Cash / Bank', r.bankAccount] : null,
    ].filter(Boolean);

    const metaGridHtml = metaItems.length > 0
        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;align-self:flex-end;padding-bottom:2px;">${metaItems.map(([lbl, val]) =>
            `<div><p style="margin:0;font-size:${f - 1}px;color:#999;font-weight:500;">${esc(lbl)}</p><p style="margin:1px 0 0;font-size:${f}px;font-weight:700;color:#1a1a2e;">${esc(val)}</p></div>`
        ).join('')
        }</div>`
        : '';

    const thStyle = `padding:5px 8px;font-size:${f - 0.5}px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #e2e8f0;background:#f8fafc;white-space:nowrap;`;

    const invoiceRows = invoices.map((inv, i) => {
        const statusColor = (inv.status || '').toLowerCase().includes('full') ? '#059669' : '#d97706';
        const statusBg = (inv.status || '').toLowerCase().includes('full') ? '#ecfdf5' : '#fffbeb';
        const statusBorder = (inv.status || '').toLowerCase().includes('full') ? '#6ee7b7' : '#fcd34d';
        const tdBase = `padding:6px 8px;font-size:${f}px;color:#374151;border-bottom:1px solid ${gold}18;vertical-align:top;`;
        const tdRight = `${tdBase}text-align:right;`;
        return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
            <td style="${tdBase}">
                ${s.showInvoiceStatus && inv.status ? `<span style="display:inline-block;margin-bottom:2px;font-size:${f - 1.5}px;font-weight:600;color:${statusColor};background:${statusBg};border:1px solid ${statusBorder};border-radius:10px;padding:0 6px;">${esc(inv.status)}</span><br/>` : ''}
                <span style="font-weight:600;color:#1d4ed8;font-size:${f}px;">${esc(inv.ref || '—')}</span>
                ${s.showLinkedSO && inv.soRef ? `<div style="color:#94a3b8;font-size:${f - 1.5}px;margin-top:1px;">SO: ${esc(inv.soRef)}</div>` : ''}
            </td>
            ${s.showInvoiceDate ? `<td style="${tdRight}color:#64748b;">${esc(inv.date || '')}</td>` : ''}
            ${s.showInvoiceTotal ? `<td style="${tdRight}"><div style="color:#94a3b8;font-size:${f - 1}px;">${currLabel}</div><div>${fmt(inv.total)}</div></td>` : ''}
            ${s.showOutstanding ? `<td style="${tdRight}"><div style="color:#94a3b8;font-size:${f - 1}px;">${currLabel}</div><div>${fmt(inv.outstanding)}</div></td>` : ''}
            ${s.showReceivedNow ? `<td style="${tdRight}"><div style="color:${gold};font-size:${f - 1}px;font-weight:600;">${currLabel}</div><div style="font-weight:700;color:#1a1a2e;">${fmt(inv.received)}</div></td>` : ''}
            ${s.showBalanceAfter ? `<td style="${tdRight}">${Number(inv.balance) > 0 ? `<span style="font-weight:600;">${fmt(inv.balance)}</span>` : `<span style="color:#94a3b8;">${currLabel} 0.00</span>`}</td>` : ''}
        </tr>`;
    }).join('');

    // Stamp: use uploaded image if stampUrl is set, otherwise show dashed placeholder
    const stampHtml = s.showCompanyStamp ? `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            ${s.stampUrl
            ? `<img src="${esc(s.stampUrl)}" alt="stamp" style="width:88px;height:88px;object-fit:contain;" />`
            : `<div style="width:88px;height:88px;border-radius:50%;border:2px dashed ${gold};background:${gold}0d;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                       <span style="font-size:${f - 1}px;color:#92400e;font-weight:700;text-align:center;line-height:1.4;">Company<br/>Stamp</span>
                   </div>`
        }
            <span style="font-size:${f - 2}px;color:#94a3b8;">Official Stamp</span>
        </div>` : '';

    // QR placeholder (actual QR is passed in via options.qrCodeDataUrl when enabled)
    const qrHtml = s.showQRCode ? `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            ${options.qrCodeDataUrl
            ? `<img src="${esc(options.qrCodeDataUrl)}" style="width:52px;height:52px;" />`
            : `<div style="width:52px;height:52px;background:#1a1a2e;border-radius:4px;"></div>`
        }
            <span style="font-size:${f - 2}px;color:#94a3b8;">Scan to verify</span>
        </div>` : '';

    const now = new Date();
    const generatedStr = `${now.toLocaleDateString('en-AE')} ${now.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}`;
    const generatedUser = co.email || '';

    const fontFamily = s.fontFamily || 'Inter, sans-serif';
    const needsInterImport = /\bInter\b/i.test(fontFamily);

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Payment Receipt ${esc(r.receiptNumber || '')}</title>
${needsInterImport ? `<link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>` : ''}
<style>
@page { size: ${paper.cssSize}; margin: 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { font-family: ${esc(fontFamily)}; font-size: ${f}px; color: #1a1a2e; background: #fff; }
table { width: 100%; border-collapse: collapse; }
</style></head>
<body style="padding:0;min-height:100%;">
<!-- PAGE WRAPPER: flex column so footer group sticks to bottom -->
<div style="font-family:${esc(fontFamily)};font-size:${f}px;background:#fff;color:#1a1a2e;padding:0 32px 28px 32px;min-height:calc(100vh - 24mm);display:flex;flex-direction:column;">

  <!-- BODY CONTENT (grows to fill available space) -->
  <div style="flex:1;padding-top:28px;">

    <!-- HEADER: 3 columns — Customer | Meta | Logo + Company -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:16px;">

      <!-- COL 1: Title + Status + Customer -->
      <div style="flex:1;">
        <h1 style="font-size:${f + 11}px;font-weight:700;color:#1a1a2e;margin:0 0 4px 0;letter-spacing:-0.3px;white-space:nowrap;">Customer Payment Receipt</h1>
        ${s.showStatusBadge && r.status ? `<div style="margin-bottom:12px;"><span style="background:${gold}22;color:#92400e;border:1px solid ${gold}88;font-size:${f - 1}px;font-weight:600;padding:2px 10px;border-radius:12px;">${esc(r.status)}</span></div>` : ''}
        ${s.showCustomerName && cust.name ? `<div>
          <p style="font-weight:700;font-size:${f - 0.5}px;margin-bottom:4px;color:#888;letter-spacing:.5px;text-transform:uppercase;">Customer</p>
          <p style="font-weight:700;font-size:${f + 1}px;margin-bottom:2px;">${esc(cust.name)}</p>
          ${s.showCustomerCode && cust.code ? `<p style="color:#64748b;font-size:${f - 0.5}px;margin:1px 0;">${esc(cust.code)}</p>` : ''}
          ${s.showCustomerAddress && cust.address ? `<p style="white-space:pre-line;line-height:1.65;color:#444;margin:2px 0 0;">${esc(cust.address)}</p>` : ''}
          ${s.showCustomerPhone && cust.phone ? `<p style="margin-top:2px;color:#555;">${esc(cust.phone)}</p>` : ''}
          ${s.showCustomerEmail && cust.email ? `<p style="margin-top:1px;color:#555;">${esc(cust.email)}</p>` : ''}
          ${s.showCustomerTRN && cust.trn ? `<p style="margin-top:1px;color:#64748b;font-size:${f - 0.5}px;">TRN: ${esc(cust.trn)}</p>` : ''}
          ${s.showVATNumber && cust.crn ? `<p style="margin-top:1px;color:#64748b;font-size:${f - 0.5}px;">CR: ${esc(cust.crn)}</p>` : ''}
        </div>` : ''}
      </div>

      <!-- COL 2: Receipt meta grid -->
      ${metaGridHtml}

      <!-- COL 3: Logo + Company (right-aligned) -->
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
        ${logoHtml}
        ${s.showCompanyName && co.companyName ? `<div style="text-align:right;line-height:1.55;">
          <p style="font-weight:700;font-size:${f + 1}px;color:#1a1a2e;margin:0;white-space:nowrap;">${esc(co.companyName)}</p>
          ${s.showCompanyAddress && co.address ? `<p style="margin:0;color:#555;white-space:pre-line;">${esc(co.address)}</p>` : ''}
          ${s.showCompanyPhone && co.phone ? `<p style="margin:0;">${esc(co.phone)}</p>` : ''}
          ${s.showCompanyEmail && co.email ? `<p style="margin:0;">${esc(co.email)}</p>` : ''}
          ${s.showTRN && co.trn ? `<p style="margin:0;color:#666;">TRN · ${esc(co.trn)}</p>` : ''}
        </div>` : ''}
      </div>
    </div>

    <!-- INVOICE TABLE LABEL -->
    <div style="font-size:${f - 0.5}px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Invoices included in this receipt</div>

    <!-- INVOICE TABLE -->
    <table style="margin-bottom:12px;">
      <thead>
        <tr>
          <th style="${thStyle}text-align:left;">Invoice ref.</th>
          ${s.showInvoiceDate ? `<th style="${thStyle}text-align:right;">Invoice date</th>` : ''}
          ${s.showInvoiceTotal ? `<th style="${thStyle}text-align:right;">Invoice total</th>` : ''}
          ${s.showOutstanding ? `<th style="${thStyle}text-align:right;">Outstanding</th>` : ''}
          ${s.showReceivedNow ? `<th style="${thStyle}text-align:right;color:#92400e;">Received now</th>` : ''}
          ${s.showBalanceAfter ? `<th style="${thStyle}text-align:right;">Balance after</th>` : ''}
        </tr>
      </thead>
      <tbody>${invoiceRows}</tbody>
    </table>

  </div><!-- end flex:1 body content -->

  <!-- FOOTER GROUP: pushed to bottom via margin-top:auto -->
  <div style="margin-top:auto;">

    <!-- SUMMARY (right-aligned) -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
      <table style="min-width:300px;border-collapse:collapse;font-size:${f}px;">
        <tbody>
          ${s.showTotalOutstanding ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:right;">Total outstanding</td><td style="padding:3px 0 3px 12px;text-align:right;font-weight:600;">${currLabel} ${fmt(sum.totalOutstanding)}</td></tr>` : ''}
          ${s.showDiscountAllowed ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:right;">Discount allowed</td><td style="padding:3px 0 3px 12px;text-align:right;color:#e11d48;">${currLabel} —${fmt(sum.discount || 0)}</td></tr>` : ''}
          ${s.showRemainingBalance ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:right;">Remaining balance</td><td style="padding:3px 0 3px 12px;text-align:right;font-weight:600;">${currLabel} ${fmt(sum.remaining)}</td></tr>` : ''}
          ${s.showTotalReceivedBold ? `<tr style="background:${gold}18;"><td style="padding:6px 16px 6px 0;font-weight:700;text-align:right;font-size:${f + 1}px;">Total received now</td><td style="padding:6px 0 6px 12px;text-align:right;font-weight:800;font-size:${f + 2}px;color:#1a1a2e;">${currLabel} ${fmt(sum.totalReceived)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>

    <!-- PAYMENT DETAILS -->
    ${s.showPaymentMethod && pay.method ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 32px;margin-bottom:14px;font-size:${f}px;border-top:1px solid ${gold}30;padding-top:10px;">
      <div style="display:flex;gap:10px;"><span style="color:#94a3b8;min-width:90px;">Payment method</span><span style="font-weight:600;">${esc(pay.method)}</span></div>
      ${s.showChequeRef && pay.chequeRef ? `<div style="display:flex;gap:10px;"><span style="color:#94a3b8;min-width:90px;">Cheque no. / ref.</span><span style="font-weight:600;">${esc(pay.chequeRef)}</span></div>` : '<div></div>'}
      ${s.showDepositedTo && pay.depositedTo ? `<div style="display:flex;gap:10px;"><span style="color:#94a3b8;min-width:90px;">Deposited to</span><span style="font-weight:600;">${esc(pay.depositedTo)}</span></div>` : ''}
      ${s.showChequeDate && pay.chequeDate ? `<div style="display:flex;gap:10px;"><span style="color:#94a3b8;min-width:90px;">Cheque date</span><span style="font-weight:600;">${esc(pay.chequeDate)}</span></div>` : ''}
    </div>` : ''}

    <!-- NOTE -->
    ${s.showNote && data.note ? `<div style="background:${gold}14;border:1px solid ${gold}66;border-radius:4px;padding:7px 12px;font-size:${f}px;color:#374151;margin-bottom:16px;">${esc(data.note)}</div>` : ''}

    <!-- STAMP + QR -->
    ${(s.showCompanyStamp || s.showQRCode) ? `
    <div style="display:flex;align-items:flex-end;gap:20px;margin-bottom:14px;">
      ${stampHtml}
      ${qrHtml}
    </div>` : ''}

    <!-- FOOTER STRIP -->
    ${(s.showGeneratedBy || s.showReceivedByLine) ? `
    <div style="border-top:2px solid ${gold};padding-top:7px;display:flex;justify-content:space-between;align-items:center;font-size:${f - 0.5}px;color:#64748b;">
      <div>${s.showGeneratedBy ? `BillBull ERP · Generated: ${esc(generatedStr)}${generatedUser ? ` · User: ${esc(generatedUser)}` : ''}` : ''}</div>
      ${s.showReceivedByLine ? `<div style="display:flex;align-items:center;gap:6px;">Received by: <span style="border-bottom:1px solid #94a3b8;display:inline-block;min-width:90px;">&nbsp;</span></div>` : ''}
    </div>` : ''}

  </div><!-- end footer group -->

</div><!-- end page wrapper -->
</body></html>`;
};

export const generateDocumentPrintHtml = (template, data, options = {}) => {
    if (template?.category === 'Pick List') {
        return generatePickListHtml(template, data, options);
    }
    if (template?.category === 'Vendor Statement of Account' || template?.category === 'Customer Statement of Account') {
        return renderVendorStatementHtml(template, data, options, 'print');
    }
    if (template?.category === 'Goods Receipt Note' && isGrnDesignerTemplate(template)) {
        return renderGrnReceiptHtml(template, data, options, 'print');
    }
    if (template?.category === 'Receipt Voucher' && data?.receiptData) {
        return renderCustomerPaymentReceiptHtml(template, data, options);
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
    if (template?.category === 'Goods Receipt Note' && isGrnDesignerTemplate(template)) {
        return renderGrnReceiptHtml(template, data, options, 'email');
    }
    if (template?.category === 'Receipt Voucher' && data?.receiptData) {
        return renderCustomerPaymentReceiptHtml(template, data, options);
    }
    return buildDocumentHtml(template, data, options, 'email');
};
