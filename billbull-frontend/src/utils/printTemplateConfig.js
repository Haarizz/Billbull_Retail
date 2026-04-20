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
    arabicName: false,
    description: true,
    qty: true,
    unitPrice: true,
    discount: false,
    tax: true,
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
        arabicName: columns.arabicName !== undefined ? Boolean(columns.arabicName) : Boolean(defaults.arabicName),
        description,
        qty: columns.qty !== undefined ? columns.qty !== false : defaults.qty !== false,
        unitPrice: columns.unitPrice !== undefined ? columns.unitPrice !== false : defaults.unitPrice !== false,
        discount: columns.discount !== undefined ? Boolean(columns.discount) : Boolean(defaults.discount),
        tax: columns.tax !== undefined ? Boolean(columns.tax) : Boolean(defaults.tax),
        total: columns.total !== undefined ? columns.total !== false : defaults.total !== false
    };
};
