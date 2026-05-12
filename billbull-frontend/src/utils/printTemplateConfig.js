const parseTemplateObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
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
    total: true
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
    const description = columns.description !== undefined
        ? columns.description !== false
        : columns.item !== undefined
            ? columns.item !== false
            : defaults.description !== false;

    return {
        productId: columns.productId !== undefined ? Boolean(columns.productId) : Boolean(defaults.productId),
        sku: columns.sku !== undefined ? Boolean(columns.sku) : Boolean(defaults.sku),
        barcode: columns.barcode !== undefined ? Boolean(columns.barcode) : Boolean(defaults.barcode ?? false),
        arabicName: columns.arabicName !== undefined ? Boolean(columns.arabicName) : Boolean(defaults.arabicName),
        description,
        qty: columns.qty !== undefined ? columns.qty !== false : defaults.qty !== false,
        unitPrice: columns.unitPrice !== undefined ? columns.unitPrice !== false : defaults.unitPrice !== false,
        taxableAmount: columns.taxableAmount !== undefined ? Boolean(columns.taxableAmount) : Boolean(defaults.taxableAmount ?? false),
        discount: columns.discount !== undefined ? Boolean(columns.discount) : Boolean(defaults.discount),
        discountPercent: columns.discountPercent !== undefined ? Boolean(columns.discountPercent) : Boolean(defaults.discountPercent ?? false),
        tax: columns.tax !== undefined ? Boolean(columns.tax) : Boolean(defaults.tax),
        taxPercent: columns.taxPercent !== undefined ? Boolean(columns.taxPercent) : Boolean(defaults.taxPercent ?? false),
        salesPerson: columns.salesPerson !== undefined ? Boolean(columns.salesPerson) : Boolean(defaults.salesPerson ?? false),
        location: columns.location !== undefined ? Boolean(columns.location) : Boolean(defaults.location ?? false),
        batchNumber: columns.batchNumber !== undefined ? Boolean(columns.batchNumber) : Boolean(defaults.batchNumber ?? false),
        batchBarcode: columns.batchBarcode !== undefined ? Boolean(columns.batchBarcode) : Boolean(defaults.batchBarcode ?? false),
        expiry: columns.expiry !== undefined ? Boolean(columns.expiry) : Boolean(defaults.expiry ?? false),
        total: columns.total !== undefined ? columns.total !== false : defaults.total !== false
    };
};
