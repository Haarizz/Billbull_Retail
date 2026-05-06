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
};

const TEMPLATE_NAMES = {
    "Local Purchase Order": "Standard LPO",
    "Goods Receipt Note": "Standard GRN",
    "Purchase Invoice": "Standard Purchase Invoice",
    "Payment Voucher": "Standard Payment Voucher",
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

const formatMoney = (value, decimals = 2) => toNumber(value).toFixed(decimals);

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
    const isVoucher = category === "Payment Voucher";
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
    const isVoucher = category === "Payment Voucher";
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
        return {
            ...template,
            displayOptions: sanitizeTemplateDisplayOptions(template?.displayOptions),
            columns: sanitizeTemplateColumns(template?.columns),
        };
    }

    const displayOptions = getPurchaseDefaultDisplayOptions(
        category,
        parsePrintTemplateObject(template?.displayOptions)
    );
    const columns = getPurchaseDefaultColumns(
        category,
        parsePrintTemplateObject(template?.columns)
    );

    return {
        ...template,
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
            displayOptions: getPurchaseDefaultDisplayOptions(category),
            columns: getPurchaseDefaultColumns(category),
        },
        category
    );
};

export const resolvePurchasePrintTemplate = (category, templates = []) => {
    const categoryTemplates = Array.isArray(templates)
        ? templates.filter((template) => template?.category === category)
        : [];

    const selectedTemplate =
        categoryTemplates.find((template) => template?.isDefault) ||
        categoryTemplates[0];

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
        const discountValue = (qty * price * discountPercent) / 100;
        const lineTotal = toNumber(item.lineTotal || (qty * price) - discountValue);
        const description = buildDescriptionLines(
            {
                name: item.itemName,
                desc: item.remarks,
                image: item.image,
            },
            {
                code: item.itemCode,
                sku: item.sku,
                localName: item.localName,
            }
        );

        return {
            rowNo: index + 1,
            code: item.itemCode || "",
            sku: item.sku || "",
            localName: item.localName || "",
            name: item.itemName || "",
            desc: item.remarks || "",
            unit: item.uom || "PCS",
            qty,
            price,
            taxableAmount: lineTotal,
            taxAmt: 0,
            total: lineTotal,
            image: item.image || "",
            description,
        };
    });

    const itemSummary = summarizePurchaseItems(lpo?.items || []);
    const hasItemRows = items.length > 0;
    const subTotal = hasItemRows
        ? Math.max(itemSummary.preDiscountSubtotal, toNumber(lpo?.subtotal))
        : toNumber(lpo?.subtotal);
    const discountAmount = hasItemRows
        ? Math.max(itemSummary.discountTotal, toNumber(lpo?.discount))
        : toNumber(lpo?.discount);
    const tax = hasItemRows
        ? Math.max(itemSummary.tax, toNumber(lpo?.tax))
        : toNumber(lpo?.tax);
    const grandTotal = hasItemRows
        ? Math.max(itemSummary.grandTotal, toNumber(lpo?.grandTotal))
        : toNumber(lpo?.grandTotal || subTotal + tax);
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

    return {
        title: "LOCAL PURCHASE ORDER",
        docNo: firstValue(lpo?.lpoNumber, lpo?.id),
        date: firstValue(lpo?.lpoDate, lpo?.date),
        status: firstValue(lpo?.status, "DRAFT"),
        party: resolveParty(vendor, lpo?.vendorName),
        headerMeta: [
            { label: "Expected Delivery", value: lpo?.expectedDeliveryDate },
            { label: "Payment Terms", value: vendor?.payTerms || lpo?.paymentTerms },
            { label: "Approval Status", value: firstValue(lpo?.approvalStatus, lpo?.status) },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Warehouse", value: lpo?.warehouseName },
            { label: "Buyer", value: lpo?.buyerAssigned },
            { label: "Reference", value: lpo?.referenceDocument },
            { label: "Created From", value: lpo?.createdFrom },
        ].filter((item) => trimValue(item.value)),
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
        const qty = toNumber(item.received ?? item.quantity ?? item.qty);
        const price = toNumber(item.unitCost ?? item.price);
        const taxableAmount = toNumber(item.total || qty * price);

        return {
            rowNo: index + 1,
            code: item.code || "",
            name: item.name || "",
            desc: item.remarks || "",
            unit: item.uom || item.unit || "PCS",
            qty,
            price,
            taxableAmount,
            taxAmt: 0,
            total: taxableAmount,
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
            localName: item.localName || "",
        };
    });

    const subTotal = toNumber(grn?.totalValue || items.reduce((sum, item) => sum + item.total, 0));
    const totals = buildTotals(
        {
            subTotal,
            tax: 0,
            grandTotal: subTotal,
        },
        companyProfile,
        vendor
    );

    const location = [grn?.warehouseName, grn?.zoneName, grn?.locatorName, grn?.binName]
        .filter((value) => trimValue(value))
        .join(" / ");

    return {
        title: "GOODS RECEIPT NOTE",
        docNo: firstValue(grn?.grnNo, grn?.id),
        date: grn?.date || grn?.grnDate,
        status: firstValue(grn?.status, "DRAFT"),
        party: resolveParty(vendor, firstValue(grn?.vendor, grn?.vendorName)),
        headerMeta: [
            { label: "Doc Ref", value: grn?.docRef },
            { label: "QC Status", value: grn?.qcStatus },
            { label: "Posted", value: grn?.posted ? "Yes" : "No" },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Warehouse", value: grn?.warehouseName },
            { label: "Location", value: location },
            { label: "Source Ref", value: firstValue(grn?.lpoNumber, grn?.lpo, grn?.docRef) },
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
        const price = toNumber(item.unitCost ?? item.unitPrice ?? item.price ?? item.cost);
        const discountAmount = toNumber(item.discountAmount);
        const taxableAmount = toNumber(
            item.taxableAmount ??
            item.netCost ??
            item.net ??
            item.amount ??
            ((qty * price) - discountAmount)
        );
        const taxAmt = toNumber(item.taxAmount ?? item.taxAmt);
        const taxPercent = toNumber(item.taxPercent ?? item.taxRate ?? 0);
        const lineTotal = toNumber(
            item.lineTotal ??
            item.total ??
            item.amountTotal ??
            (taxableAmount + taxAmt)
        );

        return {
            rowNo: index + 1,
            code: item.itemCode || "",
            name: item.itemName || "",
            desc: item.remarks || "",
            unit: item.uom || "PCS",
            qty,
            price,
            taxableAmount,
            taxAmt,
            taxPercent,
            total: lineTotal,
            image: item.image || "",
            description: buildDescriptionLines(
                {
                    name: item.itemName,
                    desc: item.remarks,
                    barcode: item.barcode,
                    image: item.image,
                },
                {
                    code: item.itemCode,
                    sku: item.sku,
                    localName: item.localName,
                }
            ),
            sku: item.sku || "",
            localName: item.localName || "",
        };
    });

    const itemSummary = summarizePurchaseItems(invoice?.items || []);
    const hasItemRows = items.length > 0;
    const totals = buildTotals(
        {
            subTotal: hasItemRows
                ? Math.max(itemSummary.preDiscountSubtotal, toNumber(invoice?.subTotal))
                : toNumber(invoice?.subTotal),
            tax: hasItemRows
                ? Math.max(itemSummary.tax, toNumber(invoice?.taxTotal))
                : toNumber(invoice?.taxTotal),
            grandTotal: hasItemRows
                ? Math.max(itemSummary.grandTotal, toNumber(invoice?.grandTotal))
                : toNumber(invoice?.grandTotal),
            amountPaid: toNumber(invoice?.amountPaid),
            balanceDue: toNumber(invoice?.balanceDue),
            discountAmount: hasItemRows
                ? Math.max(itemSummary.discountTotal, toNumber(invoice?.discountTotal))
                : toNumber(invoice?.discountTotal),
        },
        companyProfile,
        vendor
    );

    const summaryValue = totals.balanceDue > 0 ? totals.balanceDue : totals.grandTotal;
    const summaryLabel = totals.balanceDue > 0 ? "Balance Due" : "Grand Total";

    return {
        title: "PURCHASE INVOICE",
        docNo: firstValue(invoice?.invoiceNumber, invoice?.id),
        date: invoice?.invoiceDate || invoice?.date,
        status: firstValue(invoice?.status, "DRAFT"),
        party: resolveParty(vendor, invoice?.vendorName || invoice?.vendor),
        headerMeta: [
            { label: "Due Date", value: invoice?.dueDate },
            { label: "Vendor Invoice No", value: invoice?.vendorInvoiceNo },
            { label: "Invoice Date", value: invoice?.vendorInvoiceDate },
            { label: "Source Type", value: invoice?.sourceType },
        ].filter((item) => trimValue(item.value)),
        references: [
            { label: "Reference", value: invoice?.referenceNo },
            { label: "GRN No", value: invoice?.grnNo },
            { label: "Warehouse", value: invoice?.warehouseName },
        ].filter((item) => trimValue(item.value)),
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
        party: resolveParty(vendor, voucher?.vendorName || voucher?.vendor),
        headerMeta: [
            { label: "Voucher No", value: firstValue(voucher?.voucherNumber, voucher?.id) },
            { label: "Status", value: voucher?.status },
        ].filter((item) => trimValue(item.value)),
        references: [
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
