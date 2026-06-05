import {
    DEFAULT_TEMPLATE_COLUMNS,
    DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
    parsePrintTemplateObject,
    sanitizeTemplateColumns,
    sanitizeTemplateDisplayOptions
} from './printTemplateConfig';
import { summarizePurchaseItems } from './documentSummaryUtils';

const PURCHASE_TEMPLATE_TERMS = {
    "Local Purchase Order": `1. Delivery: Goods must be delivered within the specified time frame.
2. Compliance: All goods must meet the quality standards and specifications mentioned.
3. Documentation: Original delivery note and invoice must accompany the shipment.
4. Taxes: Prices are inclusive of VAT unless stated otherwise.`,
    "Goods Receipt Note": `1. Verification: All items received are subject to final inspection and verification.
2. Discrepancies: Any shortages or damages must be noted immediately.`,
    "Purchase Invoice": `1. Payment Terms: As per the agreed credit period from the date of invoice.
2. Reconciliation: Statement of account must be provided monthly.`,
    "Payment Voucher": `1. This payment voucher confirms the payment made to the vendor.
2. All details are subject to verification.`,
    "Purchase Return": `1. Returned goods are subject to vendor confirmation and internal verification.
2. Related debit notes or adjustments must be reconciled against the vendor account.`,
    "Debit Note": `1. This debit note is issued for purchase adjustments and vendor account reconciliation.
2. Supporting purchase return or invoice references must be retained.`,
    "Goods Return Voucher": `1. Goods returned to the vendor are subject to inspection and final acceptance.
2. Inventory and account adjustments are posted according to company policy.`,
    "Vendor Statement of Account": `This is a computer-generated vendor statement and does not require a signature.`,
    "Customer Statement of Account": `This is a computer-generated customer statement and does not require a signature.`,
    "Cheque": `Cheque layout is used only for authorized payment printing.`,
};

const TEMPLATE_NAMES = {
    "Local Purchase Order": "Standard LPO",
    "Goods Receipt Note": "Standard GRN",
    "Purchase Invoice": "Standard Purchase Invoice",
    "Payment Voucher": "Standard Payment Voucher",
    "Goods Return Voucher": "Standard GRV",
    "Purchase Return": "Standard Purchase Return",
    "Debit Note": "Standard Debit Note",
    "Vendor Statement of Account": "Standard Vendor SoA",
    "Customer Statement of Account": "Standard Customer SoA",
    "Cheque": "Standard Cheque",
};

const PURCHASE_TEMPLATE_META = {
    "Local Purchase Order": {
        typeId: "lpo",
        designer: "document",
        docType: "lpo",
        label: "Local Purchase Order (LPO)",
    },
    "Purchase Invoice": {
        typeId: "purchase-invoice",
        designer: "document",
        docType: "purchase-invoice",
        label: "Purchase Invoice",
    },
    "Goods Receipt Note": {
        typeId: "grn",
        designer: "grn",
        docType: "grn",
        label: "Goods Received Note (GRN)",
    },
    "Goods Return Voucher": {
        typeId: "grv",
        designer: "grv",
        docType: "grv",
        label: "Goods Return Voucher (GRV)",
    },
    "Purchase Return": {
        typeId: "purchase-return",
        designer: "document",
        docType: "purchase-return",
        label: "Purchase Return",
    },
    "Debit Note": {
        typeId: "debit-note",
        designer: "document",
        docType: "debit-note",
        label: "Debit Note",
    },
    "Payment Voucher": {
        typeId: "vendor-payment",
        designer: "payment",
        docType: "payment-voucher",
        label: "Vendor Payment Voucher",
    },
    "Vendor Statement of Account": {
        typeId: "vendor-soa",
        designer: "soa",
        docType: "vendor-soa",
        label: "Vendor Statement of Account",
    },
    "Customer Statement of Account": {
        typeId: "customer-soa",
        designer: "soa",
        docType: "customer-soa",
        label: "Customer Statement of Account",
    },
    "Cheque": {
        typeId: "cheque-printing",
        designer: "cheque",
        docType: "cheque-printing",
        label: "Cheque Printing",
    },
};

const DOC_TYPE_LABELS = {
    quotation: "Quotation",
    "sales-order": "Sales Order",
    "sales-invoice": "Sales Invoice",
    "proforma-invoice": "Proforma Invoice",
    "credit-note": "Credit Note",
    grn: "Goods Receipt Note",
    "delivery-note": "Delivery Note",
    lpo: "Local Purchase Order",
    "purchase-invoice": "Purchase Invoice",
    "purchase-return": "Purchase Return",
    "debit-note": "Debit Note",
};

const PREVIEW_COMPANY = {
    companyName: "Sample Company LLC",
    address: "Sample Business Center, Dubai, UAE",
    phone: "+971 4 000 0000",
    email: "sample@company.test",
    trn: "100000000000000",
    currency: "AED",
    currencySymbol: "AED",
    logoUrl: null,
};

const buildPreviewImage = (label, accent, base = "#f8fafc") => {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
            <rect width="96" height="96" rx="18" fill="${base}"/>
            <rect x="18" y="18" width="60" height="60" rx="14" fill="${accent}" opacity="0.18"/>
            <circle cx="48" cy="42" r="14" fill="${accent}" opacity="0.92"/>
            <path d="M30 66h36" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
            <text x="48" y="87" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="#334155">${label}</text>
        </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const PURCHASE_TEMPLATE_CATEGORIES = [
    "Local Purchase Order",
    "Goods Receipt Note",
    "Purchase Invoice",
    "Payment Voucher",
    "Goods Return Voucher",
    "Purchase Return",
    "Debit Note",
    "Vendor Statement of Account",
    "Cheque",
];

const toNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const trimValue = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

const firstValue = (...values) => values.find((value) => trimValue(value));
const compactValues = (...values) => values.flat(Infinity).map(trimValue).filter(Boolean);
const joinValues = (...values) => compactValues(values).join(" / ");

const formatMoney = (value, decimals = 2) => toNumber(value).toFixed(decimals);

const boolFromLegacyOption = (value, fallback = false) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === false || value === 0) return false;
    if (typeof value === "string") {
        return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
};

const orientationForDesigner = (value) =>
    String(value || "portrait").toLowerCase() === "landscape" ? "landscape" : "portrait";

const docTypeLabel = (docType) => DOC_TYPE_LABELS[docType] || "Purchase Document";

const buildDocumentDesignerDefaults = (category, templateName) => {
    const meta = PURCHASE_TEMPLATE_META[category] || {};
    const docType = meta.docType || "lpo";
    const isInv = docType === "sales-invoice" || docType === "proforma-invoice" || docType === "purchase-invoice";
    const isCN = docType === "credit-note" || docType === "debit-note" || docType === "purchase-return";
    const isGRN = docType === "grn";
    const isDN = docType === "delivery-note";
    const isLPO = docType === "lpo";

    return {
        purchaseDesigner: "document",
        docType,
        templateName: templateName || `Default ${docTypeLabel(docType)}`,
        layoutStyle: "classic",
        accentColor: "#F5C742",
        primaryColor: "#1a1a2e",
        headerBg: "#1a1a2e",
        headerTextColor: "#ffffff",
        tableHeaderBg: "#f8fafc",
        tableHeaderText: "#1a1a2e",
        totalRowBg: "#f8fafc",
        borderColor: "#e2e8f0",
        grandTotalColor: "#1a1a2e",
        fontFamily: "Inter, sans-serif",
        fontSize: 9,
        paperSize: "A4",
        orientation: "portrait",
        logoUrl: "",
        stampUrl: "",
        showLogo: true,
        showCompanyLogo: true,
        showCompanyName: true,
        showCompanyAddress: true,
        showCompanyPhone: true,
        showCompanyEmail: true,
        showCompanyWebsite: true,
        showTRN: true,
        showCRN: false,
        showBillTo: true,
        showVendorCard: true,
        showShipTo: isDN || isGRN,
        showCustomerCode: true,
        showCustomerPhone: true,
        showCustomerEmail: !isGRN && !isDN,
        showCustomerTRN: isInv || isCN,
        showDocNumber: true,
        showDocDate: true,
        showDueDate: isInv || isCN,
        showValidUntil: docType === "quotation",
        showSalesperson: !isGRN,
        showPaymentTerms: isInv || docType === "quotation" || docType === "sales-order",
        showCurrency: true,
        showPOReference: docType !== "quotation",
        showDeliveryTerms: isDN || docType === "sales-order",
        showLocationStore: docType === "quotation" || docType === "sales-order",
        showWarehouseStore: isDN,
        showGrandTotalBanner: !isGRN && !isDN,
        colNo: true,
        colProductImage: !isGRN && !isDN,
        colItemCode: true,
        colDescription: true,
        colUOM: true,
        colQty: true,
        colUnitPrice: !isGRN && !isDN,
        colTaxableAmount: isInv || isCN || docType === "quotation",
        colDiscount: !isGRN && !isDN,
        colVAT: isInv || isCN,
        colVATAmount: isInv || isCN,
        colLineTotal: !isGRN && !isDN,
        colBarcode: false,
        colSKU: false,
        colBatchNumber: false,
        colBrand: false,
        colBinLocation: false,
        showTaxableTotal: isInv || isCN || docType === "quotation",
        showSubtotal: !isGRN && !isDN,
        showDiscountTotal: !isGRN && !isDN,
        showVATTotal: isInv || isCN || docType === "proforma-invoice",
        showGrandTotal: !isGRN && !isDN,
        showAmountInWords: isInv || isCN,
        showBankDetails: isInv || isCN,
        bankName: "Emirates NBD",
        bankAccount: "1012345678",
        bankIBAN: "AE07 0330 0000 0102 1450 801",
        bankSWIFT: "EBILAEAD",
        showTerms: true,
        termsText: isInv
            ? "1. Payment is due within the terms stated above.\n2. Late payments attract 2% monthly interest.\n3. Goods remain property of seller until full payment received."
            : docType === "quotation"
                ? "1. This quotation is valid for 30 days from the date of issue.\n2. Prices are subject to change without prior notice.\n3. Delivery subject to stock availability."
                : isLPO
                    ? "1. This purchase order is binding upon confirmation by vendor.\n2. Goods must match specifications and be delivered by the stated date.\n3. Any substitutions require prior written approval."
                    : isCN
                        ? "1. This debit/return note is issued per agreed terms.\n2. The corresponding credit will be applied against outstanding balances.\n3. For disputes contact accounts@company.ae."
                        : "Terms & conditions apply.",
        showCompanyStamp: true,
        showQRCode: isInv,
        showNotes: true,
        notesLabel: "Notes",
        showWatermark: false,
        watermarkText: "ORIGINAL",
        showPageNumbers: true,
    };
};

const buildGrnDesignerDefaults = (templateName) => ({
    purchaseDesigner: "grn",
    docType: "grn",
    templateName: templateName || "Default GRN Template",
    fontFamily: "DM Sans",
    fontSize: "11",
    fontColor: "#0f1923",
    headerFontSize: "22",
    accentColor: "#F5C742",
    primaryColor: "#0f1923",
    backgroundColor: "#FFFFFF",
    headerBackgroundColor: "#F5C742",
    footerBackgroundColor: "#0f1923",
    tableHeaderColor: "#0f1923",
    tableHeaderBg: "#0f1923",
    tableHeaderText: "#ffffff",
    totalRowBg: "#f8fafc",
    borderColor: "#dde2e8",
    companyDetailsAlign: "left",
    vendorDetailsAlign: "left",
    tableHeaderAlign: "left",
    showCompanyLogo: true,
    showLogo: true,
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showCompanyWebsite: true,
    showCompanyTaxId: true,
    showCompanyRegNumber: true,
    showGRNNumber: true,
    showDocNumber: true,
    showGRNDate: true,
    showDocDate: true,
    showBranch: true,
    showWarehouse: true,
    showStatusBadge: true,
    showVendorCard: true,
    showVendorName: true,
    showVendorCode: true,
    showVendorContact: true,
    showVendorMobile: true,
    showVendorTRN: true,
    showPOCard: true,
    showLPONumber: true,
    showSupplierInvoice: true,
    showDeliveryNote: true,
    showVehicleNo: true,
    showReceivedBy: true,
    showSummaryBar: true,
    showGrandTotalBanner: true,
    showItemsTable: true,
    showLineNumber: true,
    showItemDescription: true,
    showBarcode: true,
    showOrderedQty: true,
    showReceivedQty: true,
    showAcceptedQty: true,
    showDamagedQty: true,
    showBatchNo: true,
    showExpiry: true,
    showBinLocation: true,
    showBatchTable: true,
    showDamageTable: true,
    showQCTable: true,
    showInventoryImpact: true,
    showNotes: true,
    notesText: "",
    showSignatures: true,
    showPreparedBy: true,
    showWarehouseIncharge: true,
    showQCOfficer: true,
    showVendorRep: true,
    showDocFooter: true,
    showTerms: true,
    showTermsConditions: true,
    termsConditions: "1. Goods received subject to inspection and acceptance.\n2. Any discrepancy must be reported within 24 hours.\n3. This GRN is not a payment authorization.",
    showQRCode: true,
    showStamp: true,
    showCompanyStamp: true,
    stampImage: "",
    showWatermark: false,
    watermarkText: "RECEIVED",
    watermarkOpacity: "0.1",
    showPageNumbers: true,
    paperSize: "A4",
    orientation: "portrait",
});

const buildPaymentDesignerDefaults = (templateName) => ({
    purchaseDesigner: "payment",
    docType: "payment-voucher",
    templateName: templateName || "Default Payment Voucher",
    accentColor: "#F5C742",
    primaryColor: "#1a1a2e",
    grandTotalColor: "#1a1a2e",
    tableHeaderBg: "#f8fafc",
    tableHeaderText: "#1a1a2e",
    totalRowBg: "#f8fafc",
    borderColor: "#e2e8f0",
    fontFamily: "Inter, sans-serif",
    fontSize: 9,
    paperSize: "A4",
    orientation: "portrait",
    showLogo: true,
    showCompanyLogo: true,
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showTRN: true,
    showDocNumber: true,
    showVoucherNumber: true,
    showDocDate: true,
    showVoucherDate: true,
    showStatusBadge: true,
    showVendorCard: true,
    showVendorName: true,
    showVendorCode: true,
    showVendorContact: true,
    showVendorMobile: true,
    showVendorTRN: true,
    showItemsTable: false,
    showGrandTotalBanner: true,
    showTotalReceivedBold: true,
    showAmountPaid: true,
    showBalanceDue: false,
    showTerms: false,
    showTermsConditions: false,
    showNote: true,
    showNotes: true,
    showCompanyStamp: true,
    showQRCode: false,
    showGeneratedBy: true,
    showReceivedByLine: true,
});

const buildVendorSoaDesignerDefaults = (templateName) => ({
    purchaseDesigner: "soa",
    docType: "vendor-soa",
    templateName: templateName || "Default Vendor Statement of Account",
    primaryColor: "#F5C742",
    accentColor: "#F5C742",
    headerBg: "#1e293b",
    fontFamily: "Inter",
    fontSize: "13",
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 14, right: 12, bottom: 14, left: 12 },
    showLogo: true,
    showCompanyLogo: true,
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showCompanyWebsite: true,
    showTRN: true,
    showBorder: true,
    showVendorCard: true,
    showVendorName: true,
    showVendorCode: true,
    showVendorContact: true,
    showVendorEmail: true,
    showVendorTRN: true,
    showQuickSummary: true,
    showOpeningBalance: true,
    showPurchases: true,
    showPayments: true,
    showPDC: true,
    showClosingBalance: true,
    showPageNumbers: false,
    footerText: PURCHASE_TEMPLATE_TERMS["Vendor Statement of Account"],
    emailSubject: "Vendor Statement of Account - {vendor}",
    emailBody: "Dear {vendor},\n\nPlease find attached your Statement of Account for the period {period}.\n\nIf you have any questions, please feel free to contact us.\n\nBest regards,\n{company}",
});

const buildCustomerSoaDesignerDefaults = (templateName) => ({
    salesDesigner: "soa",
    docType: "customer-soa",
    templateName: templateName || "Default Customer Statement of Account",
    primaryColor: "#F5C742",
    accentColor: "#F5C742",
    headerBg: "#1e293b",
    fontFamily: "Inter",
    fontSize: "13",
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 14, right: 12, bottom: 14, left: 12 },
    showLogo: true,
    showCompanyLogo: true,
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showCompanyWebsite: true,
    showTRN: true,
    showBorder: true,
    showBillTo: true,
    showCustomerName: true,
    showCustomerCode: true,
    showCustomerPhone: true,
    showCustomerEmail: true,
    showCustomerTRN: true,
    showQuickSummary: true,
    showOpeningBalance: true,
    showSales: true,
    showReceipts: true,
    showPDC: true,
    showClosingBalance: true,
    showPageNumbers: false,
    footerText: PURCHASE_TEMPLATE_TERMS["Customer Statement of Account"],
    emailSubject: "Customer Statement of Account - {customer}",
    emailBody: "Dear {customer},\n\nPlease find attached your Statement of Account for the period {period}.\n\nIf you have any questions, please feel free to contact us.\n\nBest regards,\n{company}",
});

const buildDesignerDefaultsForCategory = (category, templateName) => {
    const meta = PURCHASE_TEMPLATE_META[category] || {};
    if (meta.designer === "grn") return buildGrnDesignerDefaults(templateName);
    if (meta.designer === "payment") return buildPaymentDesignerDefaults(templateName);
    if (category === "Customer Statement of Account") return buildCustomerSoaDesignerDefaults(templateName);
    if (meta.designer === "soa") return buildVendorSoaDesignerDefaults(templateName);
    return buildDocumentDesignerDefaults(category, templateName);
};

const hasValue = (value) => value !== null && value !== undefined && value !== "";

const toOptionalNumber = (value) => {
    if (!hasValue(value)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const firstNumber = (...values) => {
    for (const value of values) {
        const parsed = toOptionalNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
};

const buildLineAmounts = ({
    qty,
    unitPrice,
    netUnitPrice,
    discountPercent = 0,
    taxPercent = 0,
    explicitDiscountAmount,
    explicitTaxableAmount,
    explicitTaxAmount,
    explicitLineTotal,
    lineTotalIsTaxable = false,
}) => {
    const resolvedQty = toNumber(qty);
    const grossUnitPrice = firstNumber(unitPrice, netUnitPrice) ?? 0;
    const effectiveUnitPrice = firstNumber(netUnitPrice, unitPrice) ?? 0;
    const grossAmount = resolvedQty * grossUnitPrice;
    const effectiveAmount = resolvedQty * effectiveUnitPrice;

    let discountAmount = firstNumber(explicitDiscountAmount);
    if (discountAmount === null) {
        discountAmount = grossAmount > effectiveAmount
            ? grossAmount - effectiveAmount
            : grossAmount * (toNumber(discountPercent) / 100);
    }

    let taxableAmount = firstNumber(explicitTaxableAmount);
    const storedTaxAmount = firstNumber(explicitTaxAmount);
    const storedLineTotal = firstNumber(explicitLineTotal);

    if (taxableAmount === null && lineTotalIsTaxable && storedLineTotal !== null) {
        taxableAmount = storedLineTotal;
    }

    if (taxableAmount === null && storedLineTotal !== null && storedTaxAmount !== null) {
        taxableAmount = Math.max(0, storedLineTotal - storedTaxAmount);
    }

    if (taxableAmount === null) {
        taxableAmount = Math.max(0, effectiveAmount || (grossAmount - discountAmount));
    }

    const taxAmount = storedTaxAmount !== null
        ? storedTaxAmount
        : taxableAmount * (toNumber(taxPercent) / 100);

    const lineTotal = lineTotalIsTaxable || storedLineTotal === null
        ? taxableAmount + taxAmount
        : storedLineTotal;

    return {
        qty: resolvedQty,
        price: effectiveUnitPrice,
        grossUnitPrice,
        discountAmount,
        taxableAmount,
        taxAmt: taxAmount,
        taxPercent: toNumber(taxPercent),
        total: lineTotal,
    };
};

const defined = (value) => value !== undefined && value !== null;

const pickDefined = (...values) => values.find(defined);

const isTemplateDefault = (template) => template?.isDefault === true || template?.default === true;

const hasStoredDesignerSettings = (template) => {
    if (template?.salesDesignerSettings && typeof template.salesDesignerSettings === "object") {
        return true;
    }
    if (template?.purchaseDesignerSettings && typeof template.purchaseDesignerSettings === "object") {
        return true;
    }
    const displayOptions = parsePrintTemplateObject(template?.displayOptions);
    return Boolean(displayOptions.purchaseDesignerSettings || displayOptions.salesDesignerSettings || displayOptions.designerSettings);
};

const templateModifiedTime = (template) => {
    const raw = template?.updatedAt || template?.updatedDate || template?.modifiedDate || template?.createdAt || template?.createdDate;
    const parsed = raw ? Date.parse(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
};

const choosePreferredTemplate = (templates = []) =>
    [...templates].sort((a, b) => {
        const defaultRank = Number(isTemplateDefault(b)) - Number(isTemplateDefault(a));
        if (defaultRank) return defaultRank;

        const designerRank = Number(hasStoredDesignerSettings(b)) - Number(hasStoredDesignerSettings(a));
        if (designerRank) return designerRank;

        const modifiedRank = templateModifiedTime(b) - templateModifiedTime(a);
        if (modifiedRank) return modifiedRank;

        return toNumber(b?.id) - toNumber(a?.id);
    })[0];

const normalizeDesignerSettings = (settings = {}, template = {}, category = template?.category) => {
    const meta = PURCHASE_TEMPLATE_META[category] || {};
    const name = firstValue(settings.templateName, template?.name, TEMPLATE_NAMES[category], meta.label, `${category} Template`);

    return {
        ...settings,
        templateName: name,
        paperSize: firstValue(settings.paperSize, settings.pageSize, template?.paperSize, "A4"),
        orientation: orientationForDesigner(settings.orientation || template?.orientation),
        purchaseDesigner: settings.purchaseDesigner || meta.designer,
        docType: settings.docType || meta.docType,
    };
};

const applyLegacyRendererOptionsToDesignerSettings = (
    settings,
    template = {},
    category,
    rawDisplayOptions = {},
    rawColumns = {}
) => {
    const showCompanyDetails = boolFromLegacyOption(rawDisplayOptions.showCompanyDetails, true);
    const showCustomerDetails = boolFromLegacyOption(rawDisplayOptions.showCustomerDetails, true);
    const showLogo = boolFromLegacyOption(rawDisplayOptions.showLogo, true);
    const showTerms = boolFromLegacyOption(rawDisplayOptions.showTerms, settings.showTerms !== false);
    const showItemImage = boolFromLegacyOption(rawDisplayOptions.showItemImage, false);
    const termsText = firstValue(
        template?.termsContent,
        settings.termsText,
        settings.termsConditions,
        PURCHASE_TEMPLATE_TERMS[category]
    );

    return normalizeDesignerSettings(
        {
            ...settings,
            accentColor: rawDisplayOptions.accentColor || rawDisplayOptions.primaryColor || settings.accentColor,
            primaryColor: rawDisplayOptions.primaryColor || rawDisplayOptions.accentColor || settings.primaryColor,
            showLogo,
            showCompanyLogo: showLogo,
            showCompanyName: showCompanyDetails,
            showCompanyAddress: showCompanyDetails,
            showVendorCard: showCustomerDetails,
            showBillTo: showCustomerDetails,
            showCustomerName: showCustomerDetails,
            showTerms,
            showTermsConditions: showTerms,
            termsText,
            termsConditions: termsText,
            showItemImage,
            colProductImage: showItemImage,
            colItemCode: boolFromLegacyOption(rawColumns.productId, false),
            colSKU: boolFromLegacyOption(rawColumns.sku, false),
            colBarcode: boolFromLegacyOption(rawColumns.barcode, false),
            colBrand: boolFromLegacyOption(rawColumns.brand, false),
            colDescription: boolFromLegacyOption(rawColumns.description, true),
            colQty: boolFromLegacyOption(rawColumns.qty, true),
            colUnitPrice: boolFromLegacyOption(rawColumns.unitPrice, category !== "Goods Receipt Note"),
            colTaxableAmount: boolFromLegacyOption(rawColumns.taxableAmount, false),
            colDiscount: boolFromLegacyOption(rawColumns.discount, false),
            colVAT: boolFromLegacyOption(rawColumns.tax, category === "Purchase Invoice"),
            colVATAmount: boolFromLegacyOption(rawColumns.tax, category === "Purchase Invoice"),
            colLineTotal: boolFromLegacyOption(rawColumns.total, true),
            showOrderedQty: boolFromLegacyOption(rawColumns.lpoQty, false),
            showReceivedQty: boolFromLegacyOption(rawColumns.received, category === "Goods Receipt Note"),
            showAcceptedQty: boolFromLegacyOption(rawColumns.accepted, false),
            showBatchNo: boolFromLegacyOption(rawColumns.batchNumber, false),
            colBatchNumber: boolFromLegacyOption(rawColumns.batchNumber, false),
            showExpiry: boolFromLegacyOption(rawColumns.expiry, false),
            showBinLocation: boolFromLegacyOption(rawColumns.location, false),
            colBinLocation: boolFromLegacyOption(rawColumns.location, false),
            showTaxableTotal: boolFromLegacyOption(rawColumns.taxableAmount, settings.showTaxableTotal === true),
            showVATTotal: boolFromLegacyOption(rawColumns.tax, settings.showVATTotal === true),
            showGrandTotal: boolFromLegacyOption(rawColumns.total, settings.showGrandTotal !== false),
            templateName: firstValue(template?.name, settings.templateName),
        },
        template,
        category
    );
};

const getDesignerSettings = (template, category = template?.category, rawDisplayOptions, rawColumns) => {
    if (template?.purchaseDesignerSettings && typeof template.purchaseDesignerSettings === "object") {
        return normalizeDesignerSettings(template.purchaseDesignerSettings, template, category);
    }
    const displayOptions = rawDisplayOptions || parsePrintTemplateObject(template?.displayOptions);
    const settings = displayOptions.purchaseDesignerSettings || displayOptions.salesDesignerSettings || displayOptions.designerSettings;
    if (settings && typeof settings === "object") {
        return normalizeDesignerSettings(settings, template, category);
    }

    if (!PURCHASE_TEMPLATE_CATEGORIES.includes(category)) return {};

    return applyLegacyRendererOptionsToDesignerSettings(
        buildDesignerDefaultsForCategory(category, template?.name),
        template,
        category,
        displayOptions,
        rawColumns || parsePrintTemplateObject(template?.columns)
    );
};

const displayOptionsFromDesignerSettings = (settings = {}) => {
    if (!settings || Object.keys(settings).length === 0) return {};

    const companyFields = [
        settings.showCompanyName,
        settings.showCompanyAddress,
        settings.showCompanyPhone,
        settings.showCompanyEmail,
        settings.showCompanyWebsite,
        settings.showCompanyTaxId,
        settings.showTRN,
    ].filter(defined);

    return {
        showLogo: pickDefined(settings.showLogo, settings.showCompanyLogo),
        showCompanyDetails: companyFields.length ? companyFields.some(Boolean) : undefined,
        showCustomerDetails: pickDefined(
            settings.showBillTo,
            settings.showVendorCard,
            settings.showVendorName,
            settings.showCustomerName
        ),
        showTerms: pickDefined(settings.showTerms, settings.showTermsConditions),
        showItemImage: pickDefined(settings.colProductImage, settings.showItemImage),
    };
};

const columnsFromDesignerSettings = (settings = {}, category) => {
    if (!settings || Object.keys(settings).length === 0) return {};

    const isVoucher = category === "Payment Voucher" || category === "Cheque" || category === "Vendor Statement of Account";

    return {
        productId: pickDefined(settings.colItemCode, settings.showItemCode),
        sku: pickDefined(settings.colSKU, settings.showSKU),
        barcode: pickDefined(settings.colBarcode, settings.showBarcode),
        brand: pickDefined(settings.colBrand, settings.showBrand),
        detailedDesc: pickDefined(settings.colDescription, settings.showDetailedDescription),
        arabicName: pickDefined(settings.colArabicName, settings.showArabicName),
        description: pickDefined(settings.colDescription, settings.showItemDescription, true),
        qty: pickDefined(settings.colQty, settings.showReceivedQty, settings.showQty, !isVoucher),
        unitPrice: pickDefined(settings.colUnitPrice, settings.showUnitPrice, !isVoucher),
        taxableAmount: pickDefined(settings.colTaxableAmount, settings.showTaxableAmount),
        discount: pickDefined(settings.colDiscount, settings.showDiscount),
        discountPercent: pickDefined(settings.colDiscount, settings.showDiscountPercent),
        tax: pickDefined(settings.colVAT, settings.showVATTotal, settings.showVATAmount, category === "Purchase Invoice"),
        taxPercent: pickDefined(settings.colVAT, settings.showVATPercent),
        total: pickDefined(settings.colLineTotal, settings.showTotalReturn, settings.showGrandTotal, !isVoucher),
        lpoQty: pickDefined(settings.showOrderedQty, settings.colOrderedQty),
        received: pickDefined(settings.showReceivedQty, settings.colReceivedQty),
        accepted: pickDefined(settings.showAcceptedQty, settings.colAcceptedQty),
        receivedBy: pickDefined(settings.showReceivedBy, settings.colReceivedBy),
        checkedBy: pickDefined(settings.showCheckedBy, settings.colCheckedBy),
        batchNumber: pickDefined(settings.colBatchNumber, settings.showBatchNo),
        expiry: pickDefined(settings.showExpiry, settings.colExpiry),
        location: pickDefined(settings.showBinLocation, settings.showLocationStore, settings.showWarehouseStore),
    };
};

const dropUndefined = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

const buildDescriptionLines = (item, vendorItemMeta = {}) => {
    const lines = [
        firstValue(item.name, item.itemName, item.desc, item.description, "Unnamed Item"),
    ];

    const secondary = [
        firstValue(item.desc, item.description),
        vendorItemMeta.code && `Code: ${vendorItemMeta.code}`,
        vendorItemMeta.sku && `SKU: ${vendorItemMeta.sku}`,
        vendorItemMeta.localName && vendorItemMeta.localName,
        item.remarks && `Remarks: ${item.remarks}`,
        item.barcode && `Barcode: ${item.barcode}`,
    ].filter(Boolean);

    return {
        title: lines[0],
        details: secondary,
    };
};

export const getPurchaseDefaultDisplayOptions = (category, overrides = {}) => {
    const isVoucher = category === "Payment Voucher" || category === "Cheque" || category === "Vendor Statement of Account" || category === "Customer Statement of Account";
    return sanitizeTemplateDisplayOptions(
        {
            ...DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
            showTerms: !isVoucher,
            showItemImage: !isVoucher,
            ...overrides
        },
        {
            ...DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
            showTerms: !isVoucher,
            showItemImage: !isVoucher
        }
    );
};

export const getPurchaseDefaultColumns = (category, overrides = {}) => {
    const isVoucher = category === "Payment Voucher" || category === "Cheque" || category === "Vendor Statement of Account" || category === "Customer Statement of Account";
    return sanitizeTemplateColumns(
        {
            ...DEFAULT_TEMPLATE_COLUMNS,
            qty: !isVoucher,
            unitPrice: !isVoucher,
            taxableAmount: !isVoucher,
            tax: category === "Purchase Invoice",
            ...overrides
        },
        {
            ...DEFAULT_TEMPLATE_COLUMNS,
            qty: !isVoucher,
            unitPrice: !isVoucher,
            taxableAmount: !isVoucher,
            tax: category === "Purchase Invoice"
        }
    );
};

export const normalizePurchaseTemplate = (template, category = template?.category) => {
    if (!PURCHASE_TEMPLATE_CATEGORIES.includes(category)) {
        const rawDisplayOptions = parsePrintTemplateObject(template?.displayOptions);
        const rawColumns = parsePrintTemplateObject(template?.columns);
        const designerSettings = rawDisplayOptions.salesDesignerSettings || rawDisplayOptions.purchaseDesignerSettings || rawDisplayOptions.designerSettings;

        return {
            ...template,
            displayOptions: {
                ...sanitizeTemplateDisplayOptions(rawDisplayOptions),
                ...(rawDisplayOptions.salesDesigner ? { salesDesigner: rawDisplayOptions.salesDesigner } : {}),
                ...(rawDisplayOptions.purchaseDesigner ? { purchaseDesigner: rawDisplayOptions.purchaseDesigner } : {}),
                ...(designerSettings ? { designerSettings } : {}),
                ...(rawDisplayOptions.salesDesignerSettings ? { salesDesignerSettings: rawDisplayOptions.salesDesignerSettings } : {}),
                ...(rawDisplayOptions.purchaseDesignerSettings ? { purchaseDesignerSettings: rawDisplayOptions.purchaseDesignerSettings } : {}),
            },
            columns: sanitizeTemplateColumns(rawColumns),
        };
    }

    const rawDisplayOptions = parsePrintTemplateObject(template?.displayOptions);
    const rawColumns = parsePrintTemplateObject(template?.columns);
    const designerSettings = getDesignerSettings(template, category, rawDisplayOptions, rawColumns);
    const displayOptions = getPurchaseDefaultDisplayOptions(
        category,
        {
            ...rawDisplayOptions,
            ...dropUndefined(displayOptionsFromDesignerSettings(designerSettings))
        }
    );
    const columns = getPurchaseDefaultColumns(
        category,
        {
            ...rawColumns,
            ...dropUndefined(columnsFromDesignerSettings(designerSettings, category))
        }
    );

    return {
        ...template,
        category,
        name: template?.name || TEMPLATE_NAMES[category] || `${category} Template`,
        paperSize: template?.paperSize || designerSettings.paperSize || designerSettings.pageSize || "A4",
        orientation: template?.orientation || designerSettings.orientation || "Portrait",
        termsContent: template?.termsContent || designerSettings.termsText || designerSettings.termsConditions || PURCHASE_TEMPLATE_TERMS[category] || "",
        purchaseDesigner: rawDisplayOptions.purchaseDesigner || designerSettings.purchaseDesigner,
        purchaseDesignerSettings: designerSettings,
        displayOptions,
        columns,
    };
};

export const serializeTemplateForApi = (template) => ({
    ...template,
    displayOptions: JSON.stringify(getPurchaseDefaultDisplayOptions(template?.category, template?.displayOptions)),
    columns: JSON.stringify(getPurchaseDefaultColumns(template?.category, template?.columns)),
});

export const getDefaultPurchaseTemplates = () =>
    PURCHASE_TEMPLATE_CATEGORIES.map((category) => ({
        category,
        name: TEMPLATE_NAMES[category],
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: PURCHASE_TEMPLATE_TERMS[category] || "",
        footerContent: "",
        displayOptions: JSON.stringify(getPurchaseDefaultDisplayOptions(category)),
        columns: JSON.stringify(getPurchaseDefaultColumns(category)),
    }));

export const getDefaultPurchaseTemplate = (category) => {
    const fallbackTemplate = getDefaultPurchaseTemplates().find(
        (template) => template.category === category
    );
    const statementDesignerSettings = category === "Customer Statement of Account"
        ? buildCustomerSoaDesignerDefaults(TEMPLATE_NAMES[category])
        : null;

    return normalizePurchaseTemplate(
        fallbackTemplate || {
            category,
            name: TEMPLATE_NAMES[category] || `${category} Template`,
            isDefault: true,
            paperSize: "A4",
            orientation: "Portrait",
            headerContent: "",
            termsContent: PURCHASE_TEMPLATE_TERMS[category] || "",
            footerContent: "",
            displayOptions: statementDesignerSettings
                ? {
                    ...getPurchaseDefaultDisplayOptions(category),
                    showTerms: false,
                    salesDesigner: "soa",
                    salesDesignerSettings: statementDesignerSettings,
                }
                : getPurchaseDefaultDisplayOptions(category),
            columns: getPurchaseDefaultColumns(category),
        },
        category
    );
};

export const resolvePurchasePrintTemplate = (category, templates = []) => {
    const categoryTemplates = Array.isArray(templates)
        ? templates.filter((template) => template?.category === category)
        : [];

    const selectedTemplate = choosePreferredTemplate(categoryTemplates);

    return selectedTemplate
        ? normalizePurchaseTemplate(selectedTemplate, category)
        : getDefaultPurchaseTemplate(category);
};

const resolveCurrency = (companyProfile, vendor) =>
    firstValue(companyProfile?.currencySymbol, companyProfile?.currency, vendor?.currency, "AED");

const resolveParty = (vendor, fallbackName) => ({
    name: firstValue(vendor?.name, vendor?.vendorName, fallbackName, "Unknown Vendor"),
    code: firstValue(vendor?.code, vendor?.vendorCode, vendor?.vendorId),
    address: firstValue(vendor?.address),
    phone: firstValue(vendor?.primaryPhone, vendor?.mobile, vendor?.contact, vendor?.secondaryPhone),
    email: firstValue(vendor?.email, vendor?.secondaryEmail),
    taxId: firstValue(vendor?.taxId, vendor?.trn),
});

export const findVendorRecord = (vendors, ...candidates) => {
    if (!Array.isArray(vendors) || vendors.length === 0) return null;

    const normalizedCandidates = candidates
        .flatMap((candidate) => {
            if (!candidate) return [];
            if (typeof candidate === "object") {
                return [
                    candidate.vendorId,
                    candidate.vendorCode,
                    candidate.vendorName,
                    candidate.vendor,
                    candidate.name,
                ];
            }
            return [candidate];
        })
        .map((value) => trimValue(value).toLowerCase())
        .filter(Boolean);

    return vendors.find((vendor) =>
        normalizedCandidates.some((candidate) =>
            [
                trimValue(vendor?.id),
                trimValue(vendor?.code),
                trimValue(vendor?.name),
                trimValue(vendor?.vendorName),
                trimValue(vendor?.vendorCode),
            ]
                .map((value) => value.toLowerCase())
                .includes(candidate)
        )
    ) || null;
};

const buildTotals = (totals, companyProfile, vendor) => {
    const currency = resolveCurrency(companyProfile, vendor);
    return {
        currency,
        subTotal: toNumber(totals?.subTotal),
        tax: toNumber(totals?.tax),
        grandTotal: toNumber(totals?.grandTotal),
        amountPaid: toNumber(totals?.amountPaid),
        balanceDue: toNumber(totals?.balanceDue),
        discountAmount: toNumber(totals?.discountAmount),
    };
};

const buildSummaryAmount = (label, value, companyProfile, vendor) => ({
    label,
    value: toNumber(value),
    currency: resolveCurrency(companyProfile, vendor),
});

export const buildLpoPrintData = (lpo, vendor, companyProfile) => {
    const items = (lpo?.items || []).map((item, index) => {
        const qty = toNumber(item.quantity ?? item.qty);
        const price = toNumber(item.unitPrice ?? item.price);
        const discountPercent = toNumber(item.discountPercent ?? item.disc);
        const taxPercent = toNumber(item.purchaseTax ?? item.taxPercent ?? item.tax ?? 0);
        const itemCode = firstValue(item.itemCode, item.code, item.productCode, item.productId);
        const rawDescription = typeof item.description === "string" ? item.description : "";
        const itemName = firstValue(item.itemName, item.name, item.productName, rawDescription, item.detailedDesc);
        const itemRemarks = firstValue(item.remarks, item.shortDesc, item.shortDescription, item.desc, rawDescription);
        const itemSku = firstValue(item.sku, item.skuCode);
        const itemLocalName = firstValue(item.localName, item.arabicName);
        const itemImage = firstValue(item.image, item.imageUrl);
        const itemBarcode = firstValue(item.barcode, item.itemBarcode);
        const amounts = buildLineAmounts({
            qty,
            unitPrice: price,
            discountPercent,
            taxPercent,
            explicitDiscountAmount: item.discountAmount,
            explicitTaxableAmount: item.taxableAmount,
            explicitTaxAmount: item.taxAmt ?? item.taxAmount,
            explicitLineTotal: item.lineTotal,
            lineTotalIsTaxable: true,
        });
        const description = buildDescriptionLines(
            {
                name: itemName,
                desc: itemRemarks,
                image: itemImage,
                barcode: itemBarcode,
            },
            {
                code: itemCode,
                sku: itemSku,
                localName: itemLocalName,
            }
        );

        return {
            rowNo: index + 1,
            code: itemCode || "",
            sku: itemSku || "",
            localName: itemLocalName || "",
            shortDesc: firstValue(item.shortDesc, item.shortDescription, itemRemarks) || "",
            detailedDesc: firstValue(item.detailedDesc, item.detailedDescription, itemRemarks) || "",
            name: itemName || "",
            desc: itemRemarks || "",
            unit: item.uom || "PCS",
            qty: amounts.qty,
            price: amounts.price,
            taxableAmount: amounts.taxableAmount,
            discountPercent,
            discountAmount: amounts.discountAmount,
            taxAmt: amounts.taxAmt,
            taxPercent: amounts.taxPercent,
            total: amounts.total,
            image: itemImage || "",
            description,
            barcode: itemBarcode || "",
            brand: item.brand || item.brandName || "",
            location: firstValue(
                item.binLocation, item.bin, item.binName,
                item.locatorName, item.locator,
                item.zoneName, item.zone,
                item.warehouseName
            ) || "",
        };
    });

    const itemSummary = summarizePurchaseItems(lpo?.items || []);
    const hasItemRows = items.length > 0;
    const subTotal = toNumber(lpo?.subtotal ?? lpo?.subTotal) || (hasItemRows ? itemSummary.taxableSubtotal : 0);
    const discountAmount = toNumber(lpo?.discount ?? lpo?.discountTotal) || (hasItemRows ? itemSummary.discountTotal : 0);
    const tax = toNumber(lpo?.tax ?? lpo?.taxTotal ?? lpo?.taxAmount) || (hasItemRows ? itemSummary.tax : 0);
    const grandTotal = toNumber(lpo?.grandTotal ?? lpo?.total) || subTotal + tax;
    const totals = buildTotals(
        {
            subTotal,
            tax,
            grandTotal,
            discountAmount,
        },
        companyProfile,
        vendor
    );
    const expectedDeliveryDate = firstValue(lpo?.expectedDeliveryDate, lpo?.dueDate, lpo?.eta);
    const validUntil = firstValue(lpo?.validUntil, lpo?.validTill, lpo?.validityDate, expectedDeliveryDate);
    const paymentTerms = firstValue(
        lpo?.paymentTerms,
        lpo?.paymentTerm,
        vendor?.payTerms,
        vendor?.paymentTerms,
        vendor?.creditTerms
    );
    const locationStore = firstValue(
        lpo?.locationName,
        lpo?.location,
        lpo?.branchCode,
        lpo?.branchName
    );
    const warehouseStore = joinValues(
        firstValue(lpo?.warehouseName, lpo?.warehouse?.name, typeof lpo?.warehouse === "string" ? lpo.warehouse : ""),
        firstValue(lpo?.zoneName, lpo?.zone?.name, typeof lpo?.zone === "string" ? lpo.zone : ""),
        firstValue(lpo?.locatorName, lpo?.locator?.name, typeof lpo?.locator === "string" ? lpo.locator : ""),
        firstValue(lpo?.binName, lpo?.bin?.name, typeof lpo?.bin === "string" ? lpo.bin : "")
    );
    const deliveryAddress = firstValue(
        lpo?.shippingAddress,
        lpo?.shipToAddress,
        lpo?.deliveryAddress,
        lpo?.deliveryLocation,
        warehouseStore,
        locationStore
    );
    const deliveryTerms = firstValue(
        lpo?.deliveryTerms,
        lpo?.deliveryTerm,
        lpo?.incoterm,
        lpo?.purchaseType
    );
    const accountExecutive = firstValue(
        lpo?.accountExecutive,
        lpo?.salesperson,
        lpo?.salesPerson,
        lpo?.buyerAssigned,
        lpo?.preparedBy,
        lpo?.approvedBy
    );
    const poReference = firstValue(
        lpo?.referenceDocument,
        lpo?.poNumber,
        lpo?.poReference,
        lpo?.sourceReference,
        lpo?.createdFrom
    );

    return {
        title: "LOCAL PURCHASE ORDER",
        docNo: firstValue(lpo?.lpoNumber, lpo?.id),
        date: firstValue(lpo?.lpoDate, lpo?.date),
        status: firstValue(lpo?.status, "DRAFT"),
        party: resolveParty(vendor, lpo?.vendorName),
        shipTo: deliveryAddress ? {
            // Only use explicit shipToName — warehouse name is already part of deliveryAddress
            name: firstValue(lpo?.shipToName),
            address: deliveryAddress,
            phone: firstValue(lpo?.shipToPhone, lpo?.deliveryPhone),
            email: firstValue(lpo?.shipToEmail, lpo?.deliveryEmail),
        } : null,
        headerMeta: [
            { label: "Due Date", value: expectedDeliveryDate },
            { label: "Valid Until", value: validUntil },
            { label: "Payment Terms", value: paymentTerms },
            { label: "Delivery Terms", value: deliveryTerms },
            { label: "Approval Status", value: firstValue(lpo?.approvalStatus, lpo?.status) },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "P.O. Number", value: poReference },
            { label: "Location / Store", value: locationStore },
            { label: "Warehouse / Store", value: warehouseStore },
            { label: "Account Executive", value: accountExecutive },
        ].filter((item) => trimValue(item.value)),
        meta: {
            location: locationStore,
            warehouse: warehouseStore,
            branchName: lpo?.branchName,
            salesPerson: accountExecutive,
        },
        items,
        totals,
        summaryAmount: buildSummaryAmount("Grand Total", grandTotal, companyProfile, vendor),
        notes: firstValue(lpo?.notes),
        paymentDetails: [],
    };
};

export const buildGrnPrintData = (grn, vendor, companyProfile) => {
    const items = (grn?.items || []).map((rawItem, index) => {
        const item = rawItem || {};
        const qty = toNumber(item.accepted ?? item.acceptedQty ?? item.received ?? item.quantity ?? item.qty);
        const taxPercent = toNumber(item.purchaseTax ?? item.taxPercent ?? item.tax ?? 0);
        const amounts = buildLineAmounts({
            qty,
            unitPrice: item.unitCost ?? item.price,
            netUnitPrice: item.netCost,
            discountPercent: item.discountPercent ?? item.disc,
            taxPercent,
            explicitTaxableAmount: item.taxableAmount ?? item.netAmount,
            explicitTaxAmount: item.taxAmt ?? item.taxAmount,
            explicitLineTotal: item.total ?? item.lineTotal,
            lineTotalIsTaxable: true,
        });

        const orderedQty = toNumber(item.lpoQty ?? item.lpo_qty ?? item.orderedQty ?? item.ordered ?? 0);
        const receivedQty = toNumber(item.received ?? item.receivedQty ?? item.received_qty ?? qty);
        const acceptedQty = toNumber(item.accepted ?? item.acceptedQty ?? item.accepted_qty ?? qty);
        const damagedQty = toNumber(
            item.damaged ?? item.damagedQty ?? item.rejected ?? item.rejectedQty ?? Math.max(receivedQty - acceptedQty, 0)
        );
        const batchNumber = firstValue(
            item.batchNumber, item.batchNo, item.batch,
            ...(Array.isArray(item.batchSelections) ? item.batchSelections.map((b) => b?.batchNumber) : [])
        );
        const expiry = firstValue(
            item.expiry, item.expiryDate, item.expDate,
            ...(Array.isArray(item.batchSelections) ? item.batchSelections.map((b) => b?.expiryDate) : [])
        );
        const binLocation = firstValue(
            item.binLocation, item.bin, item.binName, item.binCode,
            item.locatorName, item.locator, item.location
        );

        return {
            rowNo: index + 1,
            code: item.code || "",
            name: item.name || "",
            desc: item.remarks || "",
            unit: item.uom || item.unit || "PCS",
            qty: amounts.qty,
            price: amounts.price,
            taxableAmount: amounts.taxableAmount,
            discountPercent: toNumber(item.discountPercent ?? item.disc),
            discountAmount: amounts.discountAmount,
            taxAmt: amounts.taxAmt,
            taxPercent: amounts.taxPercent,
            total: amounts.total,
            image: item.image || "",
            description: buildDescriptionLines(
                {
                    name: item.name,
                    desc: item.remarks,
                    barcode: item.barcode,
                    image: item.image,
                },
                {
                    code: item.code,
                    sku: item.sku,
                    localName: item.localName,
                }
            ),
            sku: item.sku || "",
            barcode: firstValue(item.barcode, item.itemBarcode) || "",
            localName: item.localName || "",
            shortDesc: item.shortDesc || "",
            detailedDesc: item.detailedDesc || "",
            lpoQty: orderedQty,
            ordered: orderedQty,
            received: receivedQty,
            accepted: acceptedQty,
            damaged: damagedQty,
            shortage: Math.max(orderedQty - receivedQty, 0),
            batchNumber: batchNumber || "",
            expiry: expiry || "",
            binLocation: binLocation || "",
            qcStatus: firstValue(item.qcStatus, item.qc, item.inspectionStatus) || "",
            qcRemarks: firstValue(item.qcRemarks, item.inspectionRemarks, item.remarks) || "",
            receivedBy: item.receivedBy || grn?.receivedBy || '',
            checkedBy: item.checkedBy || grn?.checkedBy || '',
        };
    });

    const subTotal = toNumber(grn?.subtotal ?? grn?.subTotal ?? grn?.taxableAmount) ||
        items.reduce((sum, item) => sum + item.taxableAmount, 0);
    const tax = toNumber(grn?.taxAmount ?? grn?.taxTotal ?? grn?.tax) ||
        items.reduce((sum, item) => sum + item.taxAmt, 0);
    const grandTotal = toNumber(grn?.grandTotal ?? grn?.totalValue ?? grn?.value) || (subTotal + tax);
    const totals = buildTotals(
        {
            subTotal,
            tax,
            grandTotal,
        },
        companyProfile,
        vendor
    );

    const location = [grn?.warehouseName || grn?.warehouse, grn?.zoneName, grn?.locatorName, grn?.binName]
        .filter((value) => trimValue(value))
        .join(" / ");

    const warehouseName = firstValue(grn?.warehouseName, grn?.warehouse);
    const totalOrdered = items.reduce((sum, item) => sum + item.ordered, 0);
    const totalReceived = items.reduce((sum, item) => sum + item.received, 0);
    const totalDamaged = items.reduce((sum, item) => sum + item.damaged, 0);
    const totalPending = items.reduce((sum, item) => sum + item.shortage, 0);
    const batchNumbers = items.map((item) => item.batchNumber).filter(Boolean);
    const grnMeta = {
        branchName: firstValue(grn?.branchName, companyProfile?.branchName),
        warehouse: warehouseName,
        location,
        lpoNumber: firstValue(grn?.lpoNumber, grn?.lpo),
        supplierInvoice: firstValue(grn?.supplierInvoice, grn?.vendorInvoiceNo, grn?.invoiceNo),
        deliveryNote: firstValue(grn?.deliveryNote, grn?.dnNumber, grn?.dn),
        vehicleNo: firstValue(grn?.vehicleNo, grn?.vehicleNumber, grn?.vehicle),
        receivedBy: firstValue(grn?.receivedBy),
        checkedBy: firstValue(grn?.checkedBy),
        qcStatus: firstValue(grn?.qcStatus),
        posted: Boolean(grn?.posted) || trimValue(grn?.status).toUpperCase() === 'POSTED',
        packages: grn?.packageCount != null ? String(grn.packageCount) : '',
        summary: {
            ordered: totalOrdered,
            received: totalReceived,
            pending: totalPending,
            damaged: totalDamaged,
        },
        batchCount: new Set(batchNumbers).size,
    };

    return {
        title: "GOODS RECEIPT NOTE",
        grnMeta,
        docNo: firstValue(grn?.grnNo, grn?.idDisplay, grn?.id),
        date: grn?.date || grn?.grnDate,
        status: firstValue(grn?.status, "DRAFT"),
        party: resolveParty(vendor, firstValue(grn?.vendor, grn?.vendorName)),
        headerMeta: [
            { label: "Doc Ref", value: grn?.docRef },
            { label: "QC Status", value: grn?.qcStatus },
            { label: "Posted", value: grn?.posted ? "Yes" : "No" },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Warehouse", value: grn?.warehouseName || grn?.warehouse },
            { label: "Location", value: location },
            { label: "Source Ref", value: firstValue(grn?.lpoNumber, grn?.lpo, grn?.docRef) },
            { label: "Packages", value: grn?.packageCount != null ? String(grn.packageCount) : null },
            { label: "Received By", value: grn?.receivedBy },
            { label: "Checked By", value: grn?.checkedBy },
        ].filter((item) => trimValue(item.value)),
        items,
        totals,
        summaryAmount: buildSummaryAmount("Received Value", totals.grandTotal, companyProfile, vendor),
        notes: firstValue(grn?.notes),
        paymentDetails: [],
    };
};

export const buildPurchaseInvoicePrintData = (invoice, vendor, companyProfile) => {
    const items = (invoice?.items || []).map((rawItem, index) => {
        const item = rawItem || {};
        const qty = toNumber(item.qty ?? item.quantity);
        const taxPercent = toNumber(item.taxPercent ?? item.taxRate ?? item.tax ?? 0);
        const amounts = buildLineAmounts({
            qty,
            unitPrice: item.unitCost ?? item.unitPrice ?? item.price ?? item.cost,
            netUnitPrice: item.netCost,
            discountPercent: item.discountPercent ?? item.disc ?? item.discount,
            taxPercent,
            explicitDiscountAmount: item.discountAmount,
            explicitTaxableAmount: item.taxableAmount ?? item.net ?? item.amount,
            explicitTaxAmount: item.taxAmount ?? item.taxAmt,
            explicitLineTotal: item.lineTotal ?? item.total ?? item.amountTotal,
        });

        return {
            rowNo: index + 1,
            code: item.itemCode || item.code || "",
            name: item.itemName || item.name || "",
            desc: item.remarks || "",
            unit: item.uom || "PCS",
            qty: amounts.qty,
            price: amounts.price,
            taxableAmount: amounts.taxableAmount,
            discountPercent: toNumber(item.discountPercent ?? item.disc ?? item.discount),
            discountAmount: amounts.discountAmount,
            taxAmt: amounts.taxAmt,
            taxPercent: amounts.taxPercent,
            total: amounts.total,
            image: item.image || "",
            description: buildDescriptionLines(
                {
                    name: item.itemName || item.name,
                    desc: item.remarks,
                    barcode: item.barcode,
                    image: item.image,
                },
                {
                    code: item.itemCode || item.code,
                    sku: item.sku,
                    localName: item.localName,
                }
            ),
            sku: item.sku || "",
            barcode: item.barcode || "",
            brand: item.brand || item.brandName || "",
            localName: item.localName || "",
            shortDesc: item.shortDesc || "",
            detailedDesc: item.detailedDesc || "",
        };
    });

    const itemSummary = summarizePurchaseItems(invoice?.items || []);
    const hasItemRows = items.length > 0;
    const totals = buildTotals(
        {
            subTotal: hasItemRows
                ? (toNumber(invoice?.subTotal) || itemSummary.taxableSubtotal)
                : toNumber(invoice?.subTotal),
            tax: hasItemRows
                ? (toNumber(invoice?.taxTotal) || itemSummary.tax)
                : toNumber(invoice?.taxTotal),
            grandTotal: hasItemRows
                ? (toNumber(invoice?.grandTotal) || itemSummary.grandTotal)
                : toNumber(invoice?.grandTotal),
            amountPaid: toNumber(invoice?.amountPaid),
            balanceDue: toNumber(invoice?.balanceDue),
            discountAmount: hasItemRows
                ? (toNumber(invoice?.discountTotal) || itemSummary.discountTotal)
                : toNumber(invoice?.discountTotal),
        },
        companyProfile,
        vendor
    );

    const summaryValue = totals.balanceDue > 0 ? totals.balanceDue : totals.grandTotal;
    const summaryLabel = totals.balanceDue > 0 ? "Balance Due" : "Grand Total";

    const warehouseStore = joinValues(
        firstValue(invoice?.warehouseName, invoice?.warehouse?.name, typeof invoice?.warehouse === "string" ? invoice.warehouse : ""),
        firstValue(invoice?.zoneName, invoice?.zone?.name, typeof invoice?.zone === "string" ? invoice.zone : ""),
        firstValue(invoice?.locatorName, invoice?.locator?.name, typeof invoice?.locator === "string" ? invoice.locator : ""),
        firstValue(invoice?.binName, invoice?.bin?.name, typeof invoice?.bin === "string" ? invoice.bin : "")
    );
    const locationStore = joinValues(
        firstValue(invoice?.branchName, invoice?.branch?.name, typeof invoice?.branch === "string" ? invoice.branch : ""),
        firstValue(invoice?.locationName, invoice?.location?.name, typeof invoice?.location === "string" ? invoice.location : "")
    );
    const deliveryAddress = firstValue(
        invoice?.shippingAddress,
        invoice?.shipToAddress,
        invoice?.deliveryAddress,
        warehouseStore,
        locationStore
    );

    return {
        title: "PURCHASE INVOICE",
        docNo: firstValue(invoice?.invoiceNumber, invoice?.id),
        date: invoice?.invoiceDate || invoice?.documentDate || invoice?.date,
        status: firstValue(invoice?.status, "DRAFT"),
        party: resolveParty(vendor, invoice?.vendorName || invoice?.vendor),
        shipTo: deliveryAddress ? {
            name: firstValue(invoice?.shipToName),
            address: deliveryAddress,
            phone: firstValue(invoice?.shipToPhone, invoice?.deliveryPhone),
            email: firstValue(invoice?.shipToEmail, invoice?.deliveryEmail),
        } : null,
        headerMeta: [
            { label: "Due Date", value: invoice?.dueDate },
            { label: "Vendor Invoice No", value: invoice?.vendorInvoiceNo },
            { label: "Invoice Date", value: invoice?.vendorInvoiceDate },
            { label: "Source Type", value: invoice?.sourceType || invoice?.source },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Reference", value: invoice?.referenceNo || invoice?.refNo },
            { label: "GRN No", value: invoice?.grnNo },
            { label: "Warehouse", value: warehouseStore },
            { label: "Location", value: locationStore },
        ].filter((item) => trimValue(item.value)),
        meta: {
            location: locationStore,
            warehouse: warehouseStore,
            branchName: invoice?.branchName,
        },
        items,
        totals,
        summaryAmount: buildSummaryAmount(summaryLabel, summaryValue, companyProfile, vendor),
        notes: firstValue(invoice?.notes),
        paymentDetails: [],
    };
};

export const buildPaymentVoucherPrintData = (voucher, vendor, companyProfile, linkedInvoice) => {
    const amount = toNumber(voucher?.amount);
    const totals = buildTotals(
        {
            subTotal: amount,
            tax: 0,
            grandTotal: amount,
        },
        companyProfile,
        vendor
    );

    const invoiceReference =
        firstValue(
            linkedInvoice?.invoiceNumber,
            linkedInvoice?.id,
            voucher?.invoiceId ? `Invoice #${voucher.invoiceId}` : ""
        );

    return {
        title: "PAYMENT VOUCHER",
        docNo: firstValue(voucher?.voucherNumber, voucher?.id),
        date: voucher?.paymentDate || voucher?.date,
        status: firstValue(voucher?.status, "PENDING_APPROVAL"),
        hideTotalsTable: true,
        party: resolveParty(vendor, voucher?.vendorName || voucher?.vendor),
        headerMeta: [
            { label: "Voucher No", value: firstValue(voucher?.voucherNumber, voucher?.id) },
            { label: "Status", value: voucher?.status },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "LPO Reference", value: voucher?.lpoId ? String(voucher.lpoId) : null },
            { label: "Invoice Ref", value: invoiceReference },
            { label: "Reference No", value: voucher?.referenceNumber || voucher?.ref },
        ].filter((item) => trimValue(item.value)),
        items: [],
        totals,
        summaryAmount: buildSummaryAmount("Amount Paid", amount, companyProfile, vendor),
        notes: firstValue(voucher?.notes),
        paymentDetails: [
            { label: "Payment Mode", value: voucher?.paymentMode || voucher?.mode },
            { label: "Reference Number", value: voucher?.referenceNumber || voucher?.ref },
            { label: "Bank Account", value: voucher?.bankAccount },
            { label: "Cheque Date", value: voucher?.chequeDate },
            { label: "Invoice Reference", value: invoiceReference },
            { label: "Allocated", value: voucher?.allocated ? formatMoney(voucher.allocated) : "" },
            { label: "Unallocated", value: voucher?.unallocated ? formatMoney(voucher.unallocated) : "" },
        ].filter((item) => trimValue(item.value)),
    };
};

const formatStatementType = (type) => {
    const text = trimValue(type);
    if (!text) return "";
    return text
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

export const buildVendorSoaPrintData = (statement, vendor, companyProfile, options = {}) => {
    const safeStatement = statement || {};
    const openingBalance = toNumber(safeStatement.openingBalance);
    const totalDebit = toNumber(safeStatement.totalDebit);
    const totalCredit = toNumber(safeStatement.totalCredit);
    const closingBalance = toNumber(safeStatement.closingBalance);
    const generatedOn = firstValue(options.generatedOn, new Date().toISOString().slice(0, 10));
    const periodText = [options.startDate, options.endDate].filter(Boolean).join(" to ");
    const party = resolveParty(vendor, safeStatement.accountName);
    const currency = resolveCurrency(companyProfile, vendor);
    const statementRows = (Array.isArray(safeStatement.entries) ? safeStatement.entries : []).map((entry, index) => {
        const type = firstValue(entry?.type);

        return {
            rowNo: index + 1,
            date: firstValue(entry?.transactionDate, entry?.date),
            type,
            typeLabel: formatStatementType(type),
            documentNo: firstValue(entry?.documentNo),
            description: firstValue(entry?.description, formatStatementType(type)),
            reference: firstValue(entry?.reference),
            debit: toNumber(entry?.debit),
            credit: toNumber(entry?.credit),
            balance: toNumber(entry?.runningBalance),
            status: firstValue(entry?.status),
        };
    });

    return {
        title: "VENDOR STATEMENT OF ACCOUNT",
        docNo: firstValue(
            options.statementNo,
            options.statementNumber,
            safeStatement.statementNo,
            [party.code || party.name || "VENDOR", options.endDate || generatedOn].filter(Boolean).join("-")
        ),
        date: generatedOn,
        status: firstValue(options.status, "GENERATED"),
        hideTotalsTable: true,
        party,
        headerMeta: [
            { label: "Statement Period", value: periodText },
            { label: "From Date", value: options.startDate },
            { label: "To Date", value: options.endDate },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Account Code", value: firstValue(safeStatement.accountCode, party.code) },
            { label: "Generated On", value: generatedOn },
        ].filter((item) => trimValue(item.value)),
        items: [],
        totals: {
            currency,
            subTotal: totalCredit,
            tax: 0,
            grandTotal: Math.abs(closingBalance),
            amountPaid: totalDebit,
            balanceDue: Math.abs(closingBalance),
            openingBalance,
            closingBalance,
            totalDebit,
            totalCredit,
        },
        summaryAmount: buildSummaryAmount("Closing Balance", Math.abs(closingBalance), companyProfile, vendor),
        notes: firstValue(options.notes),
        statement: {
            accountCode: firstValue(safeStatement.accountCode, party.code),
            accountName: firstValue(safeStatement.accountName, party.name),
            startDate: options.startDate,
            endDate: options.endDate,
            generatedOn,
            openingBalance,
            closingBalance,
            totalDebit,
            totalCredit,
            entries: statementRows,
        },
        statementRows,
        debitSummaryLabel: "Total Payments",
        creditSummaryLabel: "Total Purchases",
        debitColumnLabel: "Debit (Payment)",
        creditColumnLabel: "Credit (Invoice)",
        positiveBalanceLabel: "Cr",
        negativeBalanceLabel: "Dr",
    };
};

export const buildCustomerSoaPrintData = (statement, customer, companyProfile, options = {}) => {
    const safeStatement = statement || {};
    const openingBalance = toNumber(safeStatement.openingBalance);
    const totalDebit = toNumber(safeStatement.totalDebit);
    const totalCredit = toNumber(safeStatement.totalCredit);
    const closingBalance = toNumber(safeStatement.closingBalance);
    const generatedOn = firstValue(options.generatedOn, new Date().toISOString().slice(0, 10));
    const periodText = [options.startDate, options.endDate].filter(Boolean).join(" to ");
    const party = {
        name: firstValue(customer?.name, customer?.customerName, safeStatement.accountName, "Unknown Customer"),
        code: firstValue(customer?.code, customer?.customerCode, safeStatement.accountCode),
        address: firstValue(customer?.billingAddress, customer?.address, customer?.location),
        phone: firstValue(customer?.contact, customer?.mobile, customer?.phone, customer?.primaryPhone, customer?.secondaryPhone),
        email: firstValue(customer?.email),
        taxId: firstValue(customer?.trn, customer?.taxId),
    };
    const currency = resolveCurrency(companyProfile, customer);
    const statementRows = (Array.isArray(safeStatement.entries) ? safeStatement.entries : []).map((entry, index) => {
        const type = firstValue(entry?.type);

        return {
            rowNo: index + 1,
            date: firstValue(entry?.transactionDate, entry?.date),
            type,
            typeLabel: formatStatementType(type),
            documentNo: firstValue(entry?.documentNo),
            description: firstValue(entry?.description, formatStatementType(type)),
            reference: firstValue(entry?.reference),
            debit: toNumber(entry?.debit),
            credit: toNumber(entry?.credit),
            balance: toNumber(entry?.runningBalance),
            status: firstValue(entry?.status),
        };
    });

    return {
        title: "CUSTOMER STATEMENT OF ACCOUNT",
        statementKind: "customer",
        docNo: firstValue(
            options.statementNo,
            options.statementNumber,
            safeStatement.statementNo,
            [party.code || party.name || "CUSTOMER", options.endDate || generatedOn].filter(Boolean).join("-")
        ),
        date: generatedOn,
        status: firstValue(options.status, "GENERATED"),
        hideTotalsTable: true,
        party,
        headerMeta: [
            { label: "Statement Period", value: periodText },
            { label: "From Date", value: options.startDate },
            { label: "To Date", value: options.endDate },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Account Code", value: firstValue(safeStatement.accountCode, party.code) },
            { label: "Generated On", value: generatedOn },
        ].filter((item) => trimValue(item.value)),
        items: [],
        totals: {
            currency,
            subTotal: totalDebit,
            tax: 0,
            grandTotal: Math.abs(closingBalance),
            amountPaid: totalCredit,
            balanceDue: Math.abs(closingBalance),
            openingBalance,
            closingBalance,
            totalDebit,
            totalCredit,
        },
        summaryAmount: buildSummaryAmount("Closing Balance", Math.abs(closingBalance), companyProfile, customer),
        notes: firstValue(options.notes),
        statement: {
            accountCode: firstValue(safeStatement.accountCode, party.code),
            accountName: firstValue(safeStatement.accountName, party.name),
            startDate: options.startDate,
            endDate: options.endDate,
            generatedOn,
            openingBalance,
            closingBalance,
            totalDebit,
            totalCredit,
            entries: statementRows,
        },
        statementRows,
        debitSummaryLabel: "Total Sales",
        creditSummaryLabel: "Total Receipts",
        debitColumnLabel: "Debit (Invoice)",
        creditColumnLabel: "Credit (Receipt)",
        positiveBalanceLabel: "Dr",
        negativeBalanceLabel: "Cr",
    };
};

export const buildReceiptVoucherPrintData = (payment, customer, companyProfile) => {
    const amount = toNumber(payment?.amount);
    const receiptNo = firstValue(payment?.paymentNumber, payment?.receiptNumber, payment?.voucherId, payment?.paymentNo, payment?.id);
    const receiptDate = firstValue(payment?.paymentDate, payment?.date);
    const paymentMode = firstValue(payment?.paymentMode, payment?.mode);
    const referenceNumber = firstValue(payment?.referenceNumber, payment?.reference, payment?.ref);
    const bankAccount = firstValue(payment?.bankName, payment?.bankAccount);
    const invoiceReference = firstValue(payment?.linkedInvoice, payment?.invoiceNo, payment?.invoiceNumber);
    const totals = buildTotals(
        { subTotal: amount, tax: 0, grandTotal: amount, amountPaid: amount, balanceDue: 0 },
        companyProfile,
        null
    );

    const party = {
        name: firstValue(payment?.customerName, customer?.name, 'Unknown Customer'),
        code: firstValue(payment?.customerCode, customer?.code),
        address: firstValue(customer?.address),
        phone: firstValue(customer?.phone, customer?.contact, customer?.mobile, customer?.primaryPhone),
        email: firstValue(customer?.email),
        taxId: firstValue(customer?.taxId, customer?.trn),
    };

    return {
        title: "RECEIPT VOUCHER",
        docNo: receiptNo,
        date: receiptDate,
        status: firstValue(payment?.status, "COMPLETED"),
        hideTotalsTable: true,
        party,
        headerMeta: [
            { label: "Receipt No", value: receiptNo },
            { label: "Status", value: payment?.status },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Invoice Reference", value: invoiceReference },
            { label: "Reference No", value: referenceNumber },
        ].filter((item) => trimValue(item.value)),
        items: [],
        totals,
        summaryAmount: buildSummaryAmount("Amount Received", amount, companyProfile, null),
        notes: firstValue(payment?.notes),
        paymentDetails: [
            { label: "Payment Mode", value: paymentMode },
            { label: "Reference Number", value: referenceNumber },
            { label: "Bank Account", value: bankAccount },
            { label: "Cheque Date", value: payment?.chequeDate },
            { label: "Invoice Reference", value: invoiceReference },
        ].filter((item) => trimValue(item.value)),
    };
};

export const getPurchasePreviewCompany = (companyProfile = {}) => ({
    ...PREVIEW_COMPANY,
    ...companyProfile,
    currency: companyProfile?.currency || PREVIEW_COMPANY.currency,
    currencySymbol: companyProfile?.currencySymbol || companyProfile?.currency || PREVIEW_COMPANY.currencySymbol,
});

export const buildPurchasePreviewData = (category, companyProfile = {}) => {
    const previewCompany = getPurchasePreviewCompany(companyProfile);
    const previewVendor = {
        name: "Sample Vendor LLC",
        code: "VND-SAMPLE-01",
        address: "Sample Vendor Address, Dubai, UAE",
        primaryPhone: "+971 50 000 0002",
        email: "vendor@sample.test",
        taxId: "100000000000222",
    };

    switch (category) {
        case "Goods Receipt Note":
            return buildGrnPrintData(
                {
                    grnNo: "GRN-SAMPLE-0001",
                    date: "2026-04-18",
                    vendor: previewVendor.name,
                    status: "POSTED",
                    qcStatus: "Completed",
                    docRef: "LPO-SAMPLE-0001",
                    warehouseName: "Sample Warehouse",
                    zoneName: "Inbound Area",
                    locatorName: "A-01",
                    binName: "BIN-01",
                    items: [
                        {
                            code: "ITM-SAMPLE-01",
                            sku: "GRN-SKU-01",
                            localName: "منتج تجريبي 01",
                            name: "Product Name Sample 01",
                            uom: "Pcs",
                            received: 2,
                            unitCost: 780,
                            total: 1560,
                            remarks: "Sample packed item",
                            image: buildPreviewImage("GRN 1", "#2563eb")
                        },
                        {
                            code: "ITM-SAMPLE-02",
                            sku: "GRN-SKU-02",
                            localName: "منتج تجريبي 02",
                            name: "Product Name Sample 02",
                            uom: "Pcs",
                            received: 1,
                            unitCost: 1420,
                            total: 1420,
                            remarks: "Sample standard item",
                            image: buildPreviewImage("GRN 2", "#0f766e")
                        },
                    ],
                },
                previewVendor,
                previewCompany
            );
        case "Purchase Invoice":
            return buildPurchaseInvoicePrintData(
                {
                    invoiceNumber: "PINV-SAMPLE-0001",
                    invoiceDate: "2026-04-18",
                    vendorName: previewVendor.name,
                    vendorInvoiceNo: "V-INV-SAMPLE-001",
                    dueDate: "2026-05-18",
                    sourceType: "Against GRN",
                    referenceNo: "GRN-SAMPLE-0001",
                    warehouseName: "Sample Warehouse",
                    amountPaid: 1200,
                    balanceDue: 4800,
                    status: "POSTED",
                    items: [
                        {
                            itemCode: "ITM-SAMPLE-01",
                            sku: "PINV-SKU-01",
                            localName: "منتج فاتورة 01",
                            itemName: "Product Name Sample 01",
                            qty: 1,
                            uom: "License",
                            unitCost: 2300,
                            taxPercent: 5,
                            taxAmount: 115,
                            lineTotal: 2415,
                            remarks: "Sample licensed item",
                            image: buildPreviewImage("PI 1", "#1d4ed8")
                        },
                        {
                            itemCode: "ITM-SAMPLE-02",
                            sku: "PINV-SKU-02",
                            localName: "منتج فاتورة 02",
                            itemName: "Product Name Sample 02",
                            qty: 1,
                            uom: "License",
                            unitCost: 1420,
                            taxPercent: 5,
                            taxAmount: 71,
                            lineTotal: 1491,
                            remarks: "Sample module item",
                            image: buildPreviewImage("PI 2", "#2563eb")
                        },
                        {
                            itemCode: "ITM-SAMPLE-03",
                            sku: "PINV-SKU-03",
                            localName: "منتج فاتورة 03",
                            itemName: "Product Name Sample 03",
                            qty: 1,
                            uom: "Pcs",
                            unitCost: 780,
                            taxPercent: 5,
                            taxAmount: 39,
                            lineTotal: 819,
                            remarks: "Sample hardware item",
                            image: buildPreviewImage("PI 3", "#0f766e")
                        },
                    ],
                    subTotal: 4500,
                    taxTotal: 225,
                    grandTotal: 5025,
                },
                previewVendor,
                previewCompany
            );
        case "Payment Voucher":
            return buildPaymentVoucherPrintData(
                {
                    voucherNumber: "PV-SAMPLE-0001",
                    paymentDate: "2026-04-18",
                    vendorName: previewVendor.name,
                    paymentMode: "Bank Transfer",
                    referenceNumber: "REF-SAMPLE-001",
                    bankAccount: "Sample Bank - 100200300",
                    amount: 1800,
                    allocated: 1800,
                    unallocated: 0,
                    status: "POSTED",
                    notes: "Sample payment entry for preview only.",
                    invoiceId: 41,
                },
                previewVendor,
                previewCompany,
                { invoiceNumber: "PINV-SAMPLE-0001" }
            );
        case "Local Purchase Order":
        default:
            return buildLpoPrintData(
                {
                    lpoNumber: "LPO-SAMPLE-0001",
                    lpoDate: "2026-04-18",
                    vendorName: previewVendor.name,
                    warehouseName: "Sample Warehouse",
                    expectedDeliveryDate: "2026-04-22",
                    buyerAssigned: "Sample Buyer",
                    referenceDocument: "REF-SAMPLE-001",
                    createdFrom: "Manual Entry",
                    approvalStatus: "APPROVED",
                    status: "APPROVED",
                    items: [
                        {
                            itemCode: "ITM-SAMPLE-01",
                            sku: "LPO-SKU-01",
                            localName: "منتج شراء 01",
                            itemName: "Product Name Sample 01",
                            uom: "Pcs",
                            quantity: 2,
                            unitPrice: 780,
                            lineTotal: 1560,
                            remarks: "Sample black finish",
                            image: buildPreviewImage("LPO 1", "#2563eb")
                        },
                        {
                            itemCode: "ITM-SAMPLE-02",
                            sku: "LPO-SKU-02",
                            localName: "منتج شراء 02",
                            itemName: "Product Name Sample 02",
                            uom: "Pcs",
                            quantity: 1,
                            unitPrice: 1420,
                            lineTotal: 1420,
                            remarks: "Sample standard finish",
                            image: buildPreviewImage("LPO 2", "#0f766e")
                        },
                    ],
                    subtotal: 2980,
                    tax: 0,
                    grandTotal: 2980,
                },
                previewVendor,
                previewCompany
            );
    }
};
