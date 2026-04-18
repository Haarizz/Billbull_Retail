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
    companyName: "Northstar Retail LLC",
    address: "Al Murooj Building, Bur Dubai, Dubai, UAE",
    phone: "+971 4 555 0188",
    email: "accounts@northstarretail.ae",
    trn: "100388200100003",
    currency: "AED",
    logoUrl: null,
};

export const PURCHASE_TEMPLATE_CATEGORIES = [
    "Local Purchase Order",
    "Goods Receipt Note",
    "Purchase Invoice",
    "Payment Voucher",
];

const safeParseObject = (value) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    if (typeof value !== "string") return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

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
    const {
        layoutVariant,
        showReferenceFields,
        showWarehouseFields,
        showTotalsPanel,
        showBalancePanel,
        showSignatureBlock,
        showPaymentDetails,
        showItemTable,
        ...uiOverrides
    } = overrides || {};

    return {
        showLogo: true,
        showCompanyDetails: true,
        showCustomerDetails: true,
        showTerms: !isVoucher,
        showItemImage: false,
        partyLabel: isVoucher ? "Paid To:" : "Vendor Details:",
        ...uiOverrides,
    };
};

export const getPurchaseDefaultColumns = (category, overrides = {}) => {
    const isVoucher = category === "Payment Voucher";
    const {
        taxableAmount,
        lineAmount,
        ...uiOverrides
    } = overrides || {};

    return {
        productId: false,
        sku: false,
        arabicName: false,
        item: true,
        description: true,
        qty: !isVoucher,
        unitPrice: !isVoucher,
        discount: false,
        tax: category === "Purchase Invoice",
        total: true,
        ...uiOverrides,
    };
};

export const normalizePurchaseTemplate = (template, category = template?.category) => {
    if (!PURCHASE_TEMPLATE_CATEGORIES.includes(category)) {
        return {
            ...template,
            displayOptions: safeParseObject(template?.displayOptions),
            columns: safeParseObject(template?.columns),
        };
    }

    const rawDisplayOptions = safeParseObject(template?.displayOptions);
    const rawColumns = safeParseObject(template?.columns);
    const isLegacyPurchaseLayout = rawDisplayOptions.layoutVariant === "purchase-modern-v1";
    const displayOptions = getPurchaseDefaultDisplayOptions(
        category,
        isLegacyPurchaseLayout ? {} : rawDisplayOptions
    );
    const columns = getPurchaseDefaultColumns(
        category,
        isLegacyPurchaseLayout ? {} : rawColumns
    );

    if (!isLegacyPurchaseLayout && columns.total === undefined) {
        columns.total = rawColumns.lineAmount ?? true;
    }

    return {
        ...template,
        displayOptions,
        columns,
    };
};

export const serializeTemplateForApi = (template) => ({
    ...template,
    displayOptions: JSON.stringify(template.displayOptions || {}),
    columns: JSON.stringify(template.columns || {}),
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

const resolveCurrency = (companyProfile, vendor) =>
    firstValue(companyProfile?.currency, vendor?.currency, "AED");

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
            }
        );

        return {
            rowNo: index + 1,
            code: item.itemCode || "",
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

    const subTotal = toNumber(lpo?.subtotal || items.reduce((sum, item) => sum + item.taxableAmount, 0));
    const tax = toNumber(lpo?.tax);
    const grandTotal = toNumber(lpo?.grandTotal || subTotal + tax);
    const totals = buildTotals(
        {
            subTotal,
            tax,
            grandTotal,
            discountAmount: toNumber(lpo?.discount),
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
    const items = (grn?.items || []).map((item, index) => {
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
                }
            ),
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
        date: grn?.date,
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
    const items = (invoice?.items || []).map((item, index) => {
        const qty = toNumber(item.qty ?? item.quantity);
        const price = toNumber(item.unitCost ?? item.unitPrice ?? item.price);
        const discountAmount = toNumber(item.discountAmount);
        const taxableAmount = toNumber((qty * price) - discountAmount);
        const taxAmt = toNumber(item.taxAmount ?? item.taxAmt);
        const taxPercent = toNumber(item.taxPercent ?? item.taxRate ?? 0);
        const lineTotal = toNumber(item.lineTotal || taxableAmount + taxAmt);

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
                }
            ),
        };
    });

    const totals = buildTotals(
        {
            subTotal: toNumber(invoice?.subTotal || items.reduce((sum, item) => sum + item.taxableAmount, 0)),
            tax: toNumber(invoice?.taxTotal || items.reduce((sum, item) => sum + item.taxAmt, 0)),
            grandTotal: toNumber(invoice?.grandTotal || items.reduce((sum, item) => sum + item.total, 0)),
            amountPaid: toNumber(invoice?.amountPaid),
            balanceDue: toNumber(invoice?.balanceDue),
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
});

export const buildPurchasePreviewData = (category, companyProfile = {}) => {
    const previewCompany = getPurchasePreviewCompany(companyProfile);
    const previewVendor = {
        name: "Galaxy Supplies LLC",
        code: "VND-1008",
        address: "Shop 14, Al Fahidi Street, Dubai, UAE",
        primaryPhone: "+971 50 641 1180",
        email: "sales@galaxysupplies.ae",
        taxId: "100422511200003",
    };

    switch (category) {
        case "Goods Receipt Note":
            return buildGrnPrintData(
                {
                    grnNo: "GRN-2026-0018",
                    date: "2026-04-18",
                    vendor: previewVendor.name,
                    status: "POSTED",
                    qcStatus: "QC_COMPLETED",
                    docRef: "LPO-2026-0012",
                    warehouseName: "Main Warehouse",
                    zoneName: "Inbound",
                    locatorName: "A-12",
                    binName: "BIN-04",
                    items: [
                        { code: "ITM-001", name: "Wireless Scanner", uom: "Unit", received: 2, unitCost: 780, total: 1560, remarks: "Packed and verified" },
                        { code: "ITM-002", name: "Retail Tag Printer", uom: "Unit", received: 1, unitCost: 1420, total: 1420 },
                    ],
                },
                previewVendor,
                previewCompany
            );
        case "Purchase Invoice":
            return buildPurchaseInvoicePrintData(
                {
                    invoiceNumber: "PINV-2026-0041",
                    invoiceDate: "2026-04-18",
                    vendorName: previewVendor.name,
                    vendorInvoiceNo: "SUP-INV-8842",
                    dueDate: "2026-05-18",
                    sourceType: "AGAINST_GRN",
                    referenceNo: "GRN-2026-0018",
                    warehouseName: "Main Warehouse",
                    amountPaid: 1200,
                    balanceDue: 4800,
                    status: "POSTED",
                    items: [
                        { itemCode: "ITM-001", itemName: "DART Retail ERP Software", qty: 1, uom: "User License", unitCost: 2300, taxPercent: 5, taxAmount: 115, lineTotal: 2415, remarks: "Server software license" },
                        { itemCode: "ITM-002", itemName: "DART Wholesale Trading Module", qty: 1, uom: "User License", unitCost: 1420, taxPercent: 5, taxAmount: 71, lineTotal: 1491 },
                        { itemCode: "ITM-003", itemName: "Zebra ZD220 USB Printer", qty: 1, uom: "Unit", unitCost: 780, taxPercent: 5, taxAmount: 39, lineTotal: 819 },
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
                    voucherNumber: "PV-2026-0009",
                    paymentDate: "2026-04-18",
                    vendorName: previewVendor.name,
                    paymentMode: "BANK_TRANSFER",
                    referenceNumber: "TXN-884119",
                    bankAccount: "ADCB - 110220401",
                    amount: 1800,
                    allocated: 1800,
                    unallocated: 0,
                    status: "POSTED",
                    notes: "Partial settlement against April invoice.",
                    invoiceId: 41,
                },
                previewVendor,
                previewCompany,
                { invoiceNumber: "PINV-2026-0041" }
            );
        case "Local Purchase Order":
        default:
            return buildLpoPrintData(
                {
                    lpoNumber: "LPO-2026-0012",
                    lpoDate: "2026-04-18",
                    vendorName: previewVendor.name,
                    warehouseName: "Main Warehouse",
                    expectedDeliveryDate: "2026-04-22",
                    buyerAssigned: "Operations Team",
                    referenceDocument: "AUTO-REPLENISH-12",
                    createdFrom: "Auto Min/Max",
                    approvalStatus: "APPROVED",
                    status: "APPROVED",
                    items: [
                        { itemCode: "ITM-001", itemName: "Wireless Scanner", uom: "Unit", quantity: 2, unitPrice: 780, lineTotal: 1560, remarks: "Black finish" },
                        { itemCode: "ITM-002", itemName: "Retail Tag Printer", uom: "Unit", quantity: 1, unitPrice: 1420, lineTotal: 1420 },
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
