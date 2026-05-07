// Centralised customer resolution for sales-document conversions and edits.
//
// Sales documents store the customer in different shapes — Quotation only stores
// `customer` (name); Sales Order, Invoice, Delivery Note store `customerCode` +
// `customerName`. When the user converts one document into another (or reopens an
// existing document), the destination form needs the FULL customer master record
// (phone, balance, TRN, savedAddresses, payTerms, creditStatus, …) to render the
// CustomerShippingPanel correctly.
//
// resolveCustomer walks the customer list using id → code → name with a final
// fuzzy fallback for legacy quotations whose `customer` string contains both name
// and code. resolveDefaultShippingAddress mirrors the address fallback chain that
// every page was duplicating inline.

export function resolveCustomer({ customerId, customerCode, customerName } = {}, customersList = []) {
    if (!Array.isArray(customersList) || customersList.length === 0) return null;

    if (customerId != null && String(customerId).trim() !== '') {
        const byId = customersList.find(c => c && String(c.id) === String(customerId));
        if (byId) return byId;
    }
    if (customerCode) {
        const byCode = customersList.find(c => c && c.code === customerCode);
        if (byCode) return byCode;
    }
    if (customerName) {
        const byExactName = customersList.find(c => c && c.name === customerName);
        if (byExactName) return byExactName;
        // Legacy fallback: Quotation.customer used to embed both name and code.
        const fuzzy = customersList.find(c =>
            c && (
                (c.name && customerName.includes(c.name)) ||
                (c.code && customerName.includes(c.code))
            )
        );
        if (fuzzy) return fuzzy;
    }
    return null;
}

export function resolveDefaultShippingAddress(customer) {
    if (!customer) return '';
    const defaultAddr = (customer.savedAddresses || []).find(a => a && a.isDefault);
    if (defaultAddr) {
        return [defaultAddr.address1, defaultAddr.address2, defaultAddr.city, defaultAddr.country]
            .filter(Boolean)
            .join(', ');
    }
    return (
        customer.defaultShippingAddress ||
        customer.shippingAddress ||
        customer.billingAddress ||
        customer.address ||
        ''
    );
}

// Hydrate a destination form's customer state from a source-document payload.
// Returns the full customer record (or a thin fallback object preserving whatever
// identifier we have) plus the shipping address — preferring a passed-through
// shippingAddress, otherwise the customer's default address.
export function hydrateCustomerFromSource(source = {}, customersList = [], { fallbackName } = {}) {
    const matched = resolveCustomer(
        {
            customerId: source.customerId,
            customerCode: source.customerCode,
            customerName: source.customerName ?? source.customer ?? fallbackName,
        },
        customersList
    );

    const customer = matched || {
        id: source.customerId ?? null,
        code: source.customerCode ?? '',
        name: source.customerName ?? source.customer ?? fallbackName ?? '',
    };

    const shippingAddress =
        (typeof source.shippingAddress === 'string' && source.shippingAddress.trim() !== '')
            ? source.shippingAddress
            : resolveDefaultShippingAddress(customer);

    return { customer, shippingAddress };
}
