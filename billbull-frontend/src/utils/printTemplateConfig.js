const parseTemplateObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const isFalseOption = (value) => value === false || value === 'false' || value === 0 || value === '0';
const isTrueOption = (value) => value === true || value === 'true' || value === 1 || value === '1';

const findDefinedColumnValue = (columns, keys) => {
    for (const key of keys) {
        if (columns[key] !== undefined) return columns[key];
    }
    return undefined;
};

const readColumnFlag = (columns, keys, fallback = false) => {
    const value = findDefinedColumnValue(columns, keys);
    return value !== undefined ? isTrueOption(value) : Boolean(fallback);
};

const readColumnNotFalse = (columns, keys, fallback = true) => {
    const value = findDefinedColumnValue(columns, keys);
    return value !== undefined ? !isFalseOption(value) : fallback !== false;
};

export const DEFAULT_TEMPLATE_DISPLAY_OPTIONS = Object.freeze({
    showLogo: true,
    showCompanyDetails: true,
    showCustomerDetails: true,
    showTerms: true,
    showItemImage: false
});

export const DEFAULT_TEMPLATE_COLUMNS = Object.freeze({
    productId: false,
    sku: false,
    barcode: false,
    brand: false,
    detailedDesc: false,
    arabicName: false,
    description: true,
    qty: true,
    unitPrice: true,
    taxableAmount: false,
    discount: false,
    discountPercent: false,
    tax: true,
    taxPercent: false,
    salesPerson: false,
    location: false,
    batchNumber: false,
    batchBarcode: false,
    expiry: false,
    total: true,
    lpoQty: false,
    received: false,
    accepted: false,
    receivedBy: false,
    checkedBy: false
});

export const parsePrintTemplateObject = parseTemplateObject;

export const sanitizeTemplateDisplayOptions = (
    rawDisplayOptions,
    defaults = DEFAULT_TEMPLATE_DISPLAY_OPTIONS
) => {
    const options = parseTemplateObject(rawDisplayOptions);

    return {
        showLogo: options.showLogo !== undefined ? Boolean(options.showLogo) : Boolean(defaults.showLogo),
        showCompanyDetails: options.showCompanyDetails !== undefined
            ? Boolean(options.showCompanyDetails)
            : Boolean(defaults.showCompanyDetails),
        showCustomerDetails: options.showCustomerDetails !== undefined
            ? Boolean(options.showCustomerDetails)
            : Boolean(defaults.showCustomerDetails),
        showTerms: options.showTerms !== undefined ? Boolean(options.showTerms) : Boolean(defaults.showTerms),
        showItemImage: options.showItemImage !== undefined
            ? Boolean(options.showItemImage)
            : Boolean(defaults.showItemImage)
    };
};

export const sanitizeTemplateColumns = (
    rawColumns,
    defaults = DEFAULT_TEMPLATE_COLUMNS
) => {
    const columns = parseTemplateObject(rawColumns);
    const description = readColumnNotFalse(columns, ['description', 'item'], defaults.description);

    return {
        productId: readColumnFlag(columns, ['productId', 'itemCode', 'item_code', 'productCode', 'code'], defaults.productId),
        sku: readColumnFlag(columns, ['sku', 'skuCode', 'SKU'], defaults.sku),
        barcode: readColumnFlag(columns, ['barcode', 'itemBarcode', 'barCode'], defaults.barcode ?? false),
        brand: readColumnFlag(columns, ['brand', 'brandName', 'brand_name'], defaults.brand ?? false),
        detailedDesc: readColumnFlag(columns, ['detailedDesc', 'detailedDescription', 'detailed_desc'], defaults.detailedDesc ?? false),
        arabicName: readColumnFlag(columns, ['arabicName', 'localName'], defaults.arabicName),
        description,
        qty: readColumnNotFalse(columns, ['qty', 'quantity'], defaults.qty),
        unitPrice: readColumnNotFalse(columns, ['unitPrice', 'price', 'sellingPrice'], defaults.unitPrice),
        taxableAmount: readColumnFlag(columns, ['taxableAmount'], defaults.taxableAmount ?? false),
        discount: readColumnFlag(columns, ['discount'], defaults.discount),
        discountPercent: readColumnFlag(columns, ['discountPercent', 'discPercent'], defaults.discountPercent ?? false),
        tax: readColumnNotFalse(columns, ['tax', 'vat'], defaults.tax),
        taxPercent: readColumnFlag(columns, ['taxPercent', 'vatPercent'], defaults.taxPercent ?? false),
        salesPerson: readColumnFlag(columns, ['salesPerson', 'salesperson'], defaults.salesPerson ?? false),
        location: readColumnFlag(columns, ['location', 'branch'], defaults.location ?? false),
        batchNumber: readColumnFlag(columns, ['batchNumber', 'batchNo'], defaults.batchNumber ?? false),
        batchBarcode: readColumnFlag(columns, ['batchBarcode'], defaults.batchBarcode ?? false),
        expiry: readColumnFlag(columns, ['expiry', 'expiryDate'], defaults.expiry ?? false),
        total: readColumnNotFalse(columns, ['total', 'lineTotal'], defaults.total),
        lpoQty: readColumnFlag(columns, ['lpoQty', 'lpo_qty', 'lpoQuantity'], defaults.lpoQty ?? false),
        received: readColumnFlag(columns, ['received', 'receivedQty'], defaults.received ?? false),
        accepted: readColumnFlag(columns, ['accepted', 'acceptedQty'], defaults.accepted ?? false),
        receivedBy: readColumnFlag(columns, ['receivedBy', 'received_by'], defaults.receivedBy ?? false),
        checkedBy: readColumnFlag(columns, ['checkedBy', 'checked_by'], defaults.checkedBy ?? false)
    };
};
