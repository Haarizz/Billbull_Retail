import React, { useState, useEffect, useMemo } from 'react';
import {
    FaFileAlt,
    FaFileInvoice,
    FaTruck,
    FaClipboardList,
    FaFileInvoiceDollar,
    FaUndo,
    FaCog,
    FaDownload,
    FaUpload,
    FaLightbulb,
    FaPlus,
    FaEdit,
    FaCopy,
    FaEye,
    FaSave,
    FaCode,
    FaListUl,
    FaSlidersH,
    FaToggleOn,
    FaAlignLeft,
    FaTrash,
    FaArrowLeft,
    FaExclamationTriangle,
    FaCheckCircle
} from 'react-icons/fa';
import { getCompanyProfile } from '../../api/companyProfileApi';
import { getPrintTemplates, createPrintTemplate, updatePrintTemplate, deletePrintTemplate, setDefaultTemplate } from '../../api/printTemplateApi';
import DocumentPreviewCanvas from '../../components/DocumentPreviewCanvas';
import { useCompany } from '../../context/CompanyContext';
import { generateEmailHtml, generatePrintHtml } from '../../utils/printGenerator';
import {
    DEFAULT_TEMPLATE_COLUMNS,
    DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
    sanitizeTemplateColumns,
    sanitizeTemplateDisplayOptions
} from '../../utils/printTemplateConfig';

const PREVIEW_COMPANY = {
    companyName: "Sample Company LLC",
    address: "Sample Business Center, Dubai, UAE",
    email: "sample@company.test",
    phone: "+971 4 000 0000",
    trn: "100000000000000",
    currencySymbol: "AED",
    logoUrl: null,
};

const PREVIEW_CUSTOMER = {
    name: "Sample Customer LLC",
    address: "Sample Customer Address, Dubai, UAE",
    trn: "100000000000111",
    phone: "+971 50 000 0001",
};

const PREVIEW_ITEMS = [
    {
        name: "Nike Air Max 270 — Black / White",
        description: { title: "Nike Air Max 270 — Black / White", details: ["Size: UK 9", "Color: Black/White", "SKU: NK-AM270-BW-09"] },
        unit: "Pair", qty: 3, price: 420, taxableAmount: 1260, taxAmt: 63, taxPercent: 5, total: 1323,
    },
    {
        name: "Adidas Ultraboost 22",
        description: { title: "Adidas Ultraboost 22", details: ["Size: UK 10", "Color: Core Black", "SKU: AD-UB22-BK-10"] },
        unit: "Pair", qty: 2, price: 580, taxableAmount: 1160, taxAmt: 58, taxPercent: 5, total: 1218,
    },
    {
        name: "Puma RS-X Reinvention",
        description: { title: "Puma RS-X Reinvention", details: ["Size: UK 8", "Color: White/Red"] },
        unit: "Pair", qty: 1, price: 310, taxableAmount: 310, taxAmt: 15.5, taxPercent: 5, total: 325.5,
    },
];

const buildPreviewImage = (label, accent, base = '#f8fafc') => {
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

const getSalesDefaultDisplayOptions = (overrides = {}) =>
    sanitizeTemplateDisplayOptions(overrides, DEFAULT_TEMPLATE_DISPLAY_OPTIONS);

const getSalesDefaultColumns = (category, overrides = {}) => {
    const categoryDefaults = {
        ...DEFAULT_TEMPLATE_COLUMNS,
        discount: !['Sales Invoice', 'Delivery Note (DO/DN)'].includes(category),
        tax: category !== 'Sales Order (SO)' && category !== 'Delivery Note (DO/DN)',
        total: category !== 'Delivery Note (DO/DN)',
        unitPrice: category !== 'Delivery Note (DO/DN)',
        taxableAmount: category !== 'Delivery Note (DO/DN)',
        barcode: false,
        discountPercent: false,
        taxPercent: false,
        salesPerson: false,
        location: false
    };

    return sanitizeTemplateColumns(overrides, categoryDefaults);
};

const normalizeSalesTemplate = (template, category = template?.category) => ({
    ...template,
    displayOptions: getSalesDefaultDisplayOptions(template?.displayOptions),
    columns: getSalesDefaultColumns(category, template?.columns)
});

const serializeSalesTemplate = (template) => ({
    ...template,
    displayOptions: JSON.stringify(getSalesDefaultDisplayOptions(template?.displayOptions)),
    columns: JSON.stringify(getSalesDefaultColumns(template?.category, template?.columns))
});

const buildSalesPreviewData = (category, companyProfile = {}) => {
    const titles = {
        "Quotation": "QUOTATION",
        "Sales Invoice": "TAX INVOICE",
        "Sales Order (SO)": "SALES ORDER",
        "Delivery Note (DO/DN)": "DELIVERY NOTE",
        "Proforma Invoice (PI)": "PROFORMA INVOICE",
        "Sales Return": "CREDIT NOTE",
    };
    const docNos = {
        "Quotation": "QT-SAMPLE-0001",
        "Sales Invoice": "INV-SAMPLE-0001",
        "Sales Order (SO)": "SO-SAMPLE-0001",
        "Delivery Note (DO/DN)": "DN-SAMPLE-0001",
        "Proforma Invoice (PI)": "PI-SAMPLE-0001",
        "Sales Return": "CR-SAMPLE-0001",
    };
    const previewCustomer = {
        code: "CUST-SAMPLE-01",
        name: "Sample Customer LLC",
        address: "Sample Customer Address, Dubai, UAE",
        trn: "100000000000111",
        phone: "+971 50 000 0001",
        email: "accounts@samplecustomer.test",
    };
    const previewItems = [
        {
            code: "ITM-SAMPLE-01",
            sku: "SAL-SKU-01",
            barcode: "6912345678901",
            localName: "منتج مبيعات 01",
            name: "Product Name Sample 01",
            description: { title: "Product Name Sample 01", details: ["Color: Sample Black", "Size: Standard", "Sku: SKU-SAMPLE-01"] },
            image: buildPreviewImage("INV 1", "#2563eb"),
            unit: "Pcs", qty: 3, price: 420, taxableAmount: 1260, taxAmt: 63, taxPercent: 5, discountPercent: 0,
            salesPerson: "Demo User", location: "Main Showroom", total: 1323,
        },
        {
            code: "ITM-SAMPLE-02",
            sku: "SAL-SKU-02",
            barcode: "6912345678902",
            localName: "منتج مبيعات 02",
            name: "Product Name Sample 02",
            description: { title: "Product Name Sample 02", details: ["Variant: Standard", "Sku: SKU-SAMPLE-02"] },
            image: buildPreviewImage("INV 2", "#0f766e"),
            unit: "Pcs", qty: 2, price: 580, taxableAmount: 1160, taxAmt: 58, taxPercent: 5, discountPercent: 10,
            salesPerson: "Demo User", location: "Main Showroom", total: 1218,
        },
        {
            code: "ITM-SAMPLE-03",
            sku: "SAL-SKU-03",
            barcode: "6912345678903",
            localName: "منتج مبيعات 03",
            name: "Product Name Sample 03",
            description: { title: "Product Name Sample 03", details: ["Specification: Demo Item", "Sku: SKU-SAMPLE-03"] },
            image: buildPreviewImage("INV 3", "#1d4ed8"),
            unit: "Pcs", qty: 1, price: 310, taxableAmount: 310, taxAmt: 15.5, taxPercent: 5, discountPercent: 0,
            salesPerson: "Demo User", location: "Warehouse A", total: 325.5,
        },
    ];
    return {
        title: titles[category] || category,
        docNo: docNos[category] || "DOC-SAMPLE-0001",
        date: "2026-04-18",
        customer: previewCustomer,
        items: previewItems,
        totals: {
            subTotal: 2730,
            tax: 136.5,
            grandTotal: 2866.5,
            currency: companyProfile?.currencySymbol || companyProfile?.currency || "AED",
            billDiscount: 0,
            billDiscountAmount: 0,
            amountPaid: category === "Sales Invoice" ? 1000 : 0,
            balanceDue: category === "Sales Invoice" ? 1866.5 : 0,
        },
        meta: {
            status: "POSTED",
            paymentTerm: "NET 30",
            validTill: "2026-05-18",
            validTillLabel: category === "Quotation" ? "Valid Until" : "Due Date",
            reference: "SO-SAMPLE-0001",
            location: "DXB-01",
            salesPerson: "Demo User",
            poNumber: "PO-SAMPLE-001",
            accountExecutive: "Mr. Demo User",
            notes: "Thank you for your business.",
        },
    };
};

const defaultTemplates = [
    {
        category: "Quotation",
        name: "Standard Quotation",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. Validity: This quotation is valid for 30 days from the date of issue.
2. Payment Terms: 50% advance payment required to confirm the order. Balance due upon delivery.
3. Delivery: Delivery will be made within 7-10 business days after order confirmation.
4. Taxes: All applicable taxes will be charged as per government regulations.
5. Warranty: Standard manufacturer warranty applies to all products.`,
        footerContent: "",
        displayOptions: JSON.stringify(getSalesDefaultDisplayOptions()),
        columns: JSON.stringify(getSalesDefaultColumns("Quotation"))
    },
    {
        category: "Sales Invoice",
        name: "Standard Invoice",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `PAYMENT INSTRUCTION:
Please transfer the total amount to the registered company bank account.
Use the invoice number as your payment reference.
Late payments may be subject to finance charges as per the agreed customer terms.`,
        footerContent: "",
        displayOptions: JSON.stringify(getSalesDefaultDisplayOptions()),
        columns: JSON.stringify(getSalesDefaultColumns("Sales Invoice"))
    },
    {
        category: "Sales Order (SO)",
        name: "Standard Sales Order",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. Acceptance: This order is subject to acceptance by the seller.
2. Prices: Prices are subject to change without notice prior to shipment.
3. Cancellations: Orders cannot be cancelled after 24 hours of placement.`,
        footerContent: "",
        displayOptions: JSON.stringify(getSalesDefaultDisplayOptions()),
        columns: JSON.stringify(getSalesDefaultColumns("Sales Order (SO)"))
    },
    {
        category: "Delivery Note (DO/DN)",
        name: "Standard Delivery Note",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. Goods received in good condition.
2. Any discrepancies must be reported within 24 hours of receipt.
3. Title to goods remains with the seller until full payment is received.`,
        footerContent: "",
        displayOptions: JSON.stringify(getSalesDefaultDisplayOptions()),
        columns: JSON.stringify(getSalesDefaultColumns("Delivery Note (DO/DN)"))
    },
    {
        category: "Proforma Invoice (PI)",
        name: "Standard Proforma Invoice",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. This is a proforma invoice and not a final tax invoice.
2. Goods will be dispatched only after receipt of 100% advance payment.
3. Prices are valid for 15 days from the date of this proforma invoice.`,
        footerContent: "",
        displayOptions: JSON.stringify(getSalesDefaultDisplayOptions()),
        columns: JSON.stringify(getSalesDefaultColumns("Proforma Invoice (PI)"))
    }
];

const TemplateCard = ({ title, description, count, icon: Icon, onClick, disabled }) => (
    <div
        onClick={!disabled ? onClick : undefined}
        className={`bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-shadow group relative ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:shadow-md cursor-pointer'
            }`}
    >
        {disabled && (
            <div className="absolute top-3 right-3 bg-gray-200 text-gray-500 text-[10px] font-bold px-2 py-1 rounded-full">
                COMING SOON
            </div>
        )}
        <div className="flex justify-between items-start mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${disabled ? 'bg-gray-100 text-gray-400' : 'bg-yellow-50 text-yellow-600 group-hover:bg-yellow-100'
                }`}>
                <Icon size={18} />
            </div>
            {!disabled && <span className="text-gray-400 group-hover:text-gray-600 transition-colors">&gt;</span>}
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-4 h-10">{description}</p>
        <div className="text-xs font-medium text-gray-400">
            {disabled ? 'Feature unavailable' : `${count} ${count === 1 ? 'template' : 'templates'}`}
        </div>
    </div>
);

const ActionCard = ({ icon: Icon, title, description, colorClass = "text-blue-600 bg-blue-50" }) => (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
            <Icon size={18} />
        </div>
        <div>
            <h4 className="font-medium text-sm text-gray-900">{title}</h4>
            <p className="text-xs text-gray-500">{description}</p>
        </div>
    </div>
);

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/10">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md transform transition-all scale-100">
                <div className="flex items-center gap-3 text-red-600 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <FaExclamationTriangle size={20} />
                    </div>
                    <h3 className="text-lg font-bold">{title}</h3>
                </div>

                <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                    {message}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-sm text-sm"
                    >
                        Delete Template
                    </button>
                </div>
            </div>
        </div>
    );
};

const TemplateDesigner = ({ category, onCancel, onSave, initialData, previewCompany }) => {
    const baseTemplate = useMemo(
        () => normalizeSalesTemplate(initialData || { category: category.title }, category.title),
        [initialData, category.title]
    );

    const [showPreview, setShowPreview] = useState(false);

    const [templateName, setTemplateName] = useState(baseTemplate?.name || `New ${category.title} Template`);
    const [paperSize, setPaperSize] = useState(baseTemplate?.paperSize || 'A4');
    const [orientation, setOrientation] = useState(baseTemplate?.orientation || 'Portrait');

    const [headerContent, setHeaderContent] = useState(baseTemplate?.headerContent || '');
    const [termsContent, setTermsContent] = useState(baseTemplate?.termsContent || '');
    const [footerContent, setFooterContent] = useState(baseTemplate?.footerContent || '');

    const [displayOptions, setDisplayOptions] = useState(
        baseTemplate?.displayOptions || getSalesDefaultDisplayOptions()
    );

    const [columns, setColumns] = useState(
        baseTemplate?.columns || getSalesDefaultColumns(category.title)
    );

    const previewHtml = useMemo(() => {
        const template = normalizeSalesTemplate({
            category: category.title,
            paperSize,
            orientation,
            headerContent,
            footerContent,
            termsContent,
            displayOptions,
            columns,
        }, category.title);

        return generatePrintHtml(template, buildSalesPreviewData(category.title, previewCompany), {
            companyProfile: previewCompany,
        });
    }, [category.title, paperSize, orientation, headerContent, footerContent, termsContent, displayOptions, columns, previewCompany]);

    const previewEmailHtml = useMemo(() => {
        const template = normalizeSalesTemplate({
            category: category.title,
            paperSize,
            orientation,
            headerContent,
            footerContent,
            termsContent,
            displayOptions,
            columns,
        }, category.title);

        return generateEmailHtml(template, buildSalesPreviewData(category.title, previewCompany), {
            companyProfile: previewCompany,
        });
    }, [category.title, paperSize, orientation, headerContent, footerContent, termsContent, displayOptions, columns, previewCompany]);

    const handleDisplayOptionChange = (key) => {
        setDisplayOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleColumnChange = (key) => {
        setColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = () => {
        const templateData = normalizeSalesTemplate({
            id: initialData?.id,
            category: category.title,
            name: templateName,
            paperSize,
            orientation,
            headerContent,
            termsContent,
            footerContent,
            displayOptions,
            columns,
            lastModified: new Date().toISOString().split('T')[0],
            isDefault: initialData?.isDefault || false
        }, category.title);

        onSave(templateData);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 text-slate-800 font-sans">
            {/* Header / Breadcrumbs */}
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Sales &gt; Print & Email Templates &gt; Template Designer
                </div>
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-yellow-500"><category.icon /></span>
                        {initialData ? 'Edit' : 'New'} {category.title} Template
                    </h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className={`flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-bold transition-colors ${showPreview ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        >
                            <FaEye size={14} /> {showPreview ? 'Hide Preview' : 'Preview'}
                        </button>
                        <button
                            onClick={onCancel}
                            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-slate-900 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                        >
                            <FaSave size={14} /> Save Template
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-8 flex-1 overflow-auto">
                <div className="flex flex-col lg:flex-row gap-6">

                    {/* LEFT COLUMN */}
                    <div className="flex-1 space-y-6">

                        {/* Basic Settings */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4 text-yellow-600">
                                <FaSlidersH />
                                <h3 className="font-bold text-gray-900 text-sm">Basic Settings</h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Template Name</label>
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Paper Size</label>
                                    <select
                                        value={paperSize}
                                        onChange={(e) => setPaperSize(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-yellow-400"
                                    >
                                        <option>A3</option>
                                        <option>A4</option>
                                        <option>A5</option>
                                        <option>Letter</option>
                                        <option>Legal</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Orientation</label>
                                    <select
                                        value={orientation}
                                        onChange={(e) => setOrientation(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-yellow-400"
                                    >
                                        <option>Portrait</option>
                                        <option>Landscape</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Display Options */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4 text-yellow-600">
                                <FaToggleOn />
                                <h3 className="font-bold text-gray-900 text-sm">Display Options</h3>
                            </div>
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={displayOptions.showLogo}
                                        onChange={() => handleDisplayOptionChange('showLogo')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Company Logo</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={displayOptions.showCompanyDetails}
                                        onChange={() => handleDisplayOptionChange('showCompanyDetails')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Company Details</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={displayOptions.showCustomerDetails}
                                        onChange={() => handleDisplayOptionChange('showCustomerDetails')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Customer Details</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={displayOptions.showTerms}
                                        onChange={() => handleDisplayOptionChange('showTerms')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Terms & Conditions</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={displayOptions.showItemImage}
                                        onChange={() => handleDisplayOptionChange('showItemImage')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Item Images</span>
                                </label>
                            </div>
                        </div>

                        {/* Table Columns */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4 text-yellow-600">
                                <FaListUl />
                                <h3 className="font-bold text-gray-900 text-sm">Table Columns</h3>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">Select columns to display in the item table:</p>
                            <div className="space-y-3">

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-1">Item Identity</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.description !== false} onChange={() => handleColumnChange('description')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Description of Product / Services</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.productId} onChange={() => handleColumnChange('productId')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Item Code</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.sku} onChange={() => handleColumnChange('sku')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">SKU</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.barcode} onChange={() => handleColumnChange('barcode')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Item Barcode</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.arabicName} onChange={() => handleColumnChange('arabicName')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Arabic Name</span>
                                </label>

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Quantities & Pricing</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.qty} onChange={() => handleColumnChange('qty')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Qty</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.unitPrice} onChange={() => handleColumnChange('unitPrice')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Unit Price</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.taxableAmount} onChange={() => handleColumnChange('taxableAmount')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Taxable Amount</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.total} onChange={() => handleColumnChange('total')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Line Total</span>
                                </label>

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Discount & Tax</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.discount} onChange={() => handleColumnChange('discount')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Discount % (in Taxable Amount col)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.discountPercent} onChange={() => handleColumnChange('discountPercent')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Discount % (separate column)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.tax} onChange={() => handleColumnChange('tax')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">VAT Amount</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.taxPercent} onChange={() => handleColumnChange('taxPercent')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Tax % (separate column)</span>
                                </label>

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Document / Line Info</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.salesPerson} onChange={() => handleColumnChange('salesPerson')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Sales Person</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.location} onChange={() => handleColumnChange('location')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Location / Branch</span>
                                </label>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="flex-2 space-y-6">

                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                            <h3 className="text-sm font-bold text-blue-900">System-Controlled Layout</h3>
                            <p className="mt-2 text-xs leading-6 text-blue-800">
                                Document structure is now layout-driven. Date blocks, company details, party cards, item table, totals, and footer stay consistent, while the fields below add supporting content inside those fixed regions.
                            </p>
                        </div>

                        {/* Header Section */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-2 text-yellow-600">
                                <FaCode />
                                <h3 className="font-bold text-gray-900 text-sm">Header Add-on</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">Optional HTML rendered inside the system header area. Variables: &#123;company_name&#125;, &#123;company_address&#125;, &#123;logo&#125;</p>
                            <textarea
                                value={headerContent}
                                onChange={(e) => setHeaderContent(e.target.value)}
                                className="w-full h-32 text-sm border border-gray-300 rounded-lg p-3 font-mono text-slate-600 focus:outline-none focus:border-yellow-400 bg-gray-50"
                                placeholder="<div>...</div>"
                            ></textarea>
                        </div>

                        {/* Terms & Conditions */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-2 text-yellow-600">
                                <FaAlignLeft />
                                <h3 className="font-bold text-gray-900 text-sm">Terms & Conditions</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">Enter terms and conditions</p>
                            <textarea
                                value={termsContent}
                                onChange={(e) => setTermsContent(e.target.value)}
                                className="w-full h-32 text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-yellow-400"
                                placeholder="1. Goods once sold will not be taken back..."
                            ></textarea>
                        </div>

                        {/* Footer Section */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-2 text-yellow-600">
                                <FaCode />
                                <h3 className="font-bold text-gray-900 text-sm">Footer Add-on</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">Optional HTML rendered near the standard footer bar. Variables: &#123;page_number&#125;, &#123;total_pages&#125;, &#123;company_phone&#125;, &#123;company_email&#125;</p>
                            <textarea
                                value={footerContent}
                                onChange={(e) => setFooterContent(e.target.value)}
                                className="w-full h-32 text-sm border border-gray-300 rounded-lg p-3 font-mono text-slate-600 focus:outline-none focus:border-yellow-400 bg-gray-50"
                                placeholder="<div>...</div>"
                            ></textarea>
                        </div>

                        {/* Live Preview Section */}
                        {showPreview && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-4">
                                <DocumentPreviewCanvas
                                    printHtml={previewHtml}
                                    emailHtml={previewEmailHtml}
                                    paperSize={paperSize}
                                    orientation={orientation}
                                    subtitle="Print preview is rendered on a paper canvas, and email preview uses the same structured layout in a responsive format."
                                />
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

const TemplateDetailView = ({ category, templates, onBack, onCreate, onEdit, onDuplicate, onDelete, onSetDefault }) => {
    return (
        <div className="flex flex-col h-full bg-gray-50 text-slate-800 font-sans">
            {/* Header / Breadcrumbs */}
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Sales &gt;
                    <span className="cursor-pointer hover:text-yellow-600" onClick={onBack}> Print & Email Templates </span>
                    &gt; <span className="text-gray-900">{category.title}</span>
                </div>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
                            title="Go Back"
                        >
                            <FaArrowLeft size={16} />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="text-yellow-500"><category.icon /></span>
                            {category.title} Templates
                        </h1>
                    </div>
                    <button
                        onClick={onCreate}
                        className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-slate-900 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                        <FaPlus size={14} /> Create New Template
                    </button>
                </div>
                <p className="text-gray-500 mt-1 text-sm">{category.description}</p>
            </div>

            {/* Content Area */}
            <div className="p-8 flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.length === 0 ? (
                        <div className="col-span-full text-center py-10 text-gray-500">
                            <div className="mb-4 bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-gray-400">
                                <FaFileAlt size={24} />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">No templates found</h3>
                            <p className="text-sm">Create a new template to get started.</p>
                        </div>
                    ) : (
                        templates.map(template => (
                            <div key={template.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col relative group">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-900 text-lg">{template.name}</h3>
                                            {template.isDefault && (
                                                <span className="bg-yellow-400 text-xs font-bold px-2 py-0.5 rounded text-slate-900">Default</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-2 space-y-1">
                                            <p>Last modified: {template.lastModified}</p>
                                            <p>Paper: {template.paperSize} ({template.orientation})</p>
                                        </div>
                                    </div>
                                    <div className="text-gray-300">
                                        <FaFileAlt size={40} />
                                    </div>
                                </div>

                                <div className="mt-auto flex gap-3 pt-6">
                                    <button
                                        onClick={() => onEdit(template)}
                                        className="flex-1 flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        <FaEdit size={14} /> Edit
                                    </button>
                                    {!template.isDefault && (
                                        <button
                                            onClick={() => onSetDefault(template)}
                                            className="w-10 flex items-center justify-center border border-gray-300 rounded-lg py-2 text-gray-600 hover:bg-gray-50 transition-colors"
                                            title="Set as Default"
                                        >
                                            <FaCheckCircle size={14} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDuplicate(template)}
                                        className="w-10 flex items-center justify-center border border-gray-300 rounded-lg py-2 text-gray-600 hover:bg-gray-50 transition-colors"
                                        title="Duplicate"
                                    >
                                        <FaCopy size={14} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(template.id)}
                                        className="w-10 flex items-center justify-center border border-red-200 rounded-lg py-2 text-red-600 hover:bg-red-50 transition-colors"
                                        title="Delete"
                                    >
                                        <FaTrash size={14} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const PrintEmailTemplates = () => {
    const { company } = useCompany();
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState(null);

    // State for all templates loaded from backend
    const [allTemplates, setAllTemplates] = useState([]);
    const [previewCompanyProfile, setPreviewCompanyProfile] = useState(company || null);

    useEffect(() => {
        loadTemplates();
    }, []);

    useEffect(() => {
        if (company) {
            setPreviewCompanyProfile(company);
            return;
        }

        let isActive = true;
        getCompanyProfile()
            .then((res) => {
                if (isActive) {
                    setPreviewCompanyProfile(res.data || null);
                }
            })
            .catch(() => {});

        return () => {
            isActive = false;
        };
    }, [company]);

    const loadTemplates = async () => {
        try {
            const data = await getPrintTemplates();

            // Auto-seed if empty
            if (data.length === 0) {
                await seedDefaultTemplates();
                return;
            }

            const parsedData = data.map((template) => normalizeSalesTemplate(template, template.category));
            setAllTemplates(parsedData);
        } catch (error) {
            console.error("Error loading templates:", error);
        }
    };

    const seedDefaultTemplates = async () => {
        try {
            for (const template of defaultTemplates) {
                await createPrintTemplate(template);
            }
            // Reload after seeding
            const data = await getPrintTemplates();
            const parsedData = data.map((template) => normalizeSalesTemplate(template, template.category));
            setAllTemplates(parsedData);
        } catch (error) {
            console.error("Error seeding default templates:", error);
        }
    };

    const categoryTemplates = [
        { title: "Quotation", description: "Customer quotation template", icon: FaFileAlt },
        { title: "Sales Order (SO)", description: "Sales order confirmation template", icon: FaClipboardList },
        { title: "Delivery Note (DO/DN)", description: "Delivery/dispatch note template", icon: FaTruck },
        { title: "Proforma Invoice (PI)", description: "Proforma invoice template", icon: FaFileAlt },
        { title: "Sales Invoice", description: "Final sales invoice template", icon: FaFileInvoiceDollar },
        { title: "Credit Note", description: "Credit note template", icon: FaUndo, disabled: true },
        { title: "Goods Return Voucher (GRV)", description: "Goods return voucher template", icon: FaUndo, disabled: true }
    ].map(cat => ({
        ...cat,
        count: allTemplates.filter(t => t.category === cat.title).length
    }));

    const handleCreateNew = () => {
        setEditingTemplate(null);
        setIsCreating(true);
    };

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setIsCreating(true);
    };

    const handleDuplicate = async (template) => {
        const payload = serializeSalesTemplate({
            category: template.category,
            name: `${template.name} - Copy`,
            isDefault: false,
            paperSize: template.paperSize,
            orientation: template.orientation,
            headerContent: template.headerContent,
            termsContent: template.termsContent,
            footerContent: template.footerContent,
            displayOptions: template.displayOptions,
            columns: template.columns,
        });

        try {
            const savedTemplate = await createPrintTemplate(payload);
            const parsedTemplate = normalizeSalesTemplate(savedTemplate, savedTemplate.category);
            setAllTemplates(prev => [...prev, parsedTemplate]);
        } catch (error) {
            console.error("Error duplicating template:", error);
            alert("Failed to duplicate template");
        }
    };

    const handleDelete = (id) => {
        setTemplateToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!templateToDelete) return;

        try {
            await deletePrintTemplate(templateToDelete);
            setAllTemplates(prev => prev.filter(t => t.id !== templateToDelete));
            setShowDeleteModal(false);
            setTemplateToDelete(null);
        } catch (error) {
            console.error("Error deleting template:", error);
            alert("Failed to delete template");
        }
    };

    const handleSaveTemplate = async (templateData) => {
        try {
            const normalizedTemplate = normalizeSalesTemplate(templateData, templateData.category);
            const payload = serializeSalesTemplate(normalizedTemplate);

            let savedTemplate;
            if (templateData.id && allTemplates.some(t => t.id === templateData.id)) {
                savedTemplate = await updatePrintTemplate(templateData.id, payload);
                const parsedTemplate = normalizeSalesTemplate(savedTemplate, savedTemplate.category);
                setAllTemplates(prev => prev.map(t => t.id === parsedTemplate.id ? parsedTemplate : t));

            } else {
                const { id, ...createPayload } = payload;
                savedTemplate = await createPrintTemplate(createPayload);
                const parsedTemplate = normalizeSalesTemplate(savedTemplate, savedTemplate.category);
                setAllTemplates(prev => [...prev, parsedTemplate]);
            }

            setIsCreating(false);
            setEditingTemplate(null);
        } catch (error) {
            console.error("Error saving template:", error);
            alert("Failed to save template");
        }
    };

    const handleSetDefault = async (template) => {
        try {
            const updatedTemplate = await setDefaultTemplate(
                template.id,
                serializeSalesTemplate({
                    ...normalizeSalesTemplate(template, template.category),
                    isDefault: true
                })
            );

            const parsedTemplate = normalizeSalesTemplate(updatedTemplate, updatedTemplate.category);

            setAllTemplates(prev => prev.map(t => {
                if (t.id === parsedTemplate.id) {
                    return parsedTemplate;
                } else if (t.category === parsedTemplate.category) {
                    return { ...t, isDefault: false };
                }
                return t;
            }));

        } catch (error) {
            console.error("Error setting default template:", error);
            alert("Failed to set default template");
        }
    };

    if (isCreating && selectedCategory) {
        return (
            <TemplateDesigner
                category={selectedCategory}
                initialData={editingTemplate}
                previewCompany={previewCompanyProfile}
                onSave={handleSaveTemplate}
                onCancel={() => { setIsCreating(false); setEditingTemplate(null); }}
            />
        );
    }

    if (selectedCategory) {
        const templates = allTemplates.filter(t => t.category === selectedCategory.title);
        return (
            <>
                <TemplateDetailView
                    category={selectedCategory}
                    templates={templates}
                    onBack={() => setSelectedCategory(null)}
                    onCreate={handleCreateNew}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onSetDefault={handleSetDefault}
                />
                <ConfirmationModal
                    isOpen={showDeleteModal}
                    onClose={() => { setShowDeleteModal(false); setTemplateToDelete(null); }}
                    onConfirm={confirmDelete}
                    title="Delete Template?"
                    message="Are you sure you want to delete this template? This action cannot be undone and may affect documents using this template."
                />
            </>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 text-slate-800 font-sans">
            {/* Header / Breadcrumbs */}
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Sales &gt; <span className="text-gray-900">Print & Email Templates</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-yellow-500"><FaFileAlt /></span>
                    Print & Email Templates
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Design and customize templates for sales orders, invoices, and other procurement documents
                </p>
            </div>

            {/* Content Area */}
            <div className="p-8 flex-1 overflow-auto">

                {/* Templates Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {categoryTemplates.map((template, index) => (
                        <TemplateCard
                            key={index}
                            {...template}
                            onClick={() => setSelectedCategory(template)}
                        />
                    ))}
                </div>

                {/* Quick Actions */}
                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <ActionCard
                        icon={FaUpload}
                        title="Import Template"
                        description="Upload from file"
                        colorClass="text-blue-600 bg-blue-50"
                    />
                    <ActionCard
                        icon={FaDownload}
                        title="Export Templates"
                        description="Download all templates"
                        colorClass="text-green-600 bg-green-50"
                    />
                    <ActionCard
                        icon={FaCog}
                        title="Global Settings"
                        description="Configure defaults"
                        colorClass="text-purple-600 bg-purple-50"
                    />
                </div>

                {/* Tips Section */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-3 text-blue-800 font-semibold">
                        <FaLightbulb />
                        <h3 className="text-sm">Email & Print Tips</h3>
                    </div>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1 ml-1">
                        <li>Templates are automatically used when emailing or printing documents</li>
                        <li>Set a default template for each document type for consistent branding</li>
                        <li>Use HTML/CSS for advanced customization of headers and footers</li>
                        <li>Preview templates before saving to ensure correct formatting</li>
                    </ul>
                </div>

            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => { setShowDeleteModal(false); setTemplateToDelete(null); }}
                onConfirm={confirmDelete}
                title="Delete Template?"
                message="Are you sure you want to delete this template? This action cannot be undone and may affect documents using this template."
            />
        </div>
    );
};

export default PrintEmailTemplates;
