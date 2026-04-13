import React, { useState, useEffect } from 'react';
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
    FaTimes,
    FaSave,
    FaCode,
    FaListUl,
    FaSlidersH,
    FaToggleOn,
    FaAlignLeft,
    FaImage,
    FaTrash,
    FaArrowLeft,
    FaExclamationTriangle,
    FaCheckCircle
} from 'react-icons/fa';
import logo from '../../assets/NEST Logo Final.png';
import { getPrintTemplates, createPrintTemplate, updatePrintTemplate, deletePrintTemplate, setDefaultTemplate } from '../../api/printTemplateApi';

const COMPANY_DETAILS = {
    name: "New Extreme Sports Trading LLC",
    address: "M1 Office, Al Harthi Building, Rolla Street, Bur Dubai, Dubai - U.A.E",
    email: "admin@extremesportstrading.com",
    phone: "04 393 9169",
    trn: "100014932600003"
};

const defaultTemplates = [
    {
        category: "Local Purchase Order",
        name: "Standard LPO",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. Delivery: Goods must be delivered within the specified time frame.
2. Compliance: All goods must meet the quality standards and specifications mentioned.
3. Documentation: Original delivery note and invoice must accompany the shipment.
4. Taxes: Prices are inclusive of VAT unless stated otherwise.`,
        footerContent: "",
        displayOptions: JSON.stringify({
            showLogo: true,
            showCompanyDetails: true,
            showCustomerDetails: true,
            showTerms: true,
            showItemImage: false
        }),
        columns: JSON.stringify({
            productId: false, sku: false, arabicName: false,
            item: true,
            description: true,
            qty: true,
            unitPrice: true,
            discount: true,
            tax: true,
            total: true
        })
    },
    {
        category: "Goods Receipt Note",
        name: "Standard GRN",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. Verification: All items received are subject to final inspection and verification.
2. Discrepancies: Any shortages or damages must be noted immediately.`,
        footerContent: "",
        displayOptions: JSON.stringify({
            showLogo: true,
            showCompanyDetails: true,
            showCustomerDetails: true,
            showTerms: true,
            showItemImage: false
        }),
        columns: JSON.stringify({
            productId: false, sku: false, arabicName: false,
            item: true,
            description: true,
            qty: true,
            unitPrice: false,
            discount: false,
            tax: false,
            total: false
        })
    },
    {
        category: "Purchase Invoice",
        name: "Standard Purchase Invoice",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. Payment Terms: As per the agreed credit period from the date of invoice.
2. Reconciliation: Statement of account must be provided monthly.`,
        footerContent: "",
        displayOptions: JSON.stringify({
            showLogo: true,
            showCompanyDetails: true,
            showCustomerDetails: true,
            showTerms: true,
            showItemImage: false
        }),
        columns: JSON.stringify({
            productId: false, sku: false, arabicName: false,
            item: true,
            description: true,
            qty: true,
            unitPrice: true,
            discount: true,
            tax: true,
            total: true
        })
    },
    {
        category: "Payment Voucher",
        name: "Standard Payment Voucher",
        isDefault: true,
        paperSize: "A4",
        orientation: "Portrait",
        headerContent: "",
        termsContent: `1. This payment voucher confirms the payment made to the vendor.
2. All details are subject to verification.`,
        footerContent: `Thank you for your business.`,
        displayOptions: JSON.stringify({
            showLogo: true,
            showCompanyDetails: true,
            showCustomerDetails: true,
            showTerms: true,
            showItemImage: false
        }),
        columns: JSON.stringify({
            productId: false, sku: false, arabicName: false,
            item: true,
            description: true,
            qty: true,
            unitPrice: true,
            discount: false,
            tax: false,
            total: true
        })
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

const TemplateDesigner = ({ category, onCancel, onSave, initialData }) => {
    // --- STATE MANAGEMENT ---
    const [showPreview, setShowPreview] = useState(false);

    // Basic Settings
    const [templateName, setTemplateName] = useState(initialData?.name || `New ${category.title} Template`);
    const [paperSize, setPaperSize] = useState(initialData?.paperSize || 'A4');
    const [orientation, setOrientation] = useState(initialData?.orientation || 'Portrait');

    // Content
    const [headerContent, setHeaderContent] = useState(initialData?.headerContent || '');
    const [termsContent, setTermsContent] = useState(initialData?.termsContent || '');
    const [footerContent, setFooterContent] = useState(initialData?.footerContent || '');

    // Display Options
    const [displayOptions, setDisplayOptions] = useState(initialData?.displayOptions || {
        showLogo: true,
        showCompanyDetails: true,
        showCustomerDetails: true,
        showTerms: true,
        showItemImage: false
    });

    // Table Columns
    const [columns, setColumns] = useState(initialData?.columns || {
        productId: false,
        sku: false,
        arabicName: false,
        item: true,
        description: true,
        qty: true,
        unitPrice: true,
        discount: false,
        tax: true,
        total: true
    });

    const handleDisplayOptionChange = (key) => {
        setDisplayOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleColumnChange = (key) => {
        setColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = () => {
        const templateData = {
            id: initialData?.id, // ID is undefined for new templates
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
        };
        onSave(templateData);
    };

    // Helper for Paper Dimensions
    const getPaperStyle = () => {
        const dimensions = {
            'A3': { width: '297mm', height: '420mm' },
            'A4': { width: '210mm', height: '297mm' },
            'A5': { width: '148mm', height: '210mm' },
            'Letter': { width: '216mm', height: '279mm' },
            'Legal': { width: '216mm', height: '356mm' }
        };

        const base = dimensions[paperSize] || dimensions['A4'];
        const isLandscape = orientation === 'Landscape';

        const width = isLandscape ? base.height : base.width;
        const height = isLandscape ? base.width : base.height;

        return {
            width: '100%',
            maxWidth: width,
            minHeight: height,
            aspectRatio: `${width.replace('mm', '')}/${height.replace('mm', '')}`
        };
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 text-slate-800 font-sans">
            {/* Header / Breadcrumbs */}
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Vendors & Purchases &gt; Print & Email Templates &gt; Template Designer
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
                                    <span className="text-sm text-gray-700 font-medium">Show Vendor Details</span>
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
                            <p className="text-xs text-gray-500 mb-3">Select columns to display in item table:</p>
                            <div className="space-y-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-1">Product Details</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.productId}
                                        onChange={() => handleColumnChange('productId')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Product ID</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.sku}
                                        onChange={() => handleColumnChange('sku')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">SKU</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.arabicName}
                                        onChange={() => handleColumnChange('arabicName')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Arabic Name</span>
                                </label>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-1">Line Item</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.item}
                                        onChange={() => handleColumnChange('item')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Item</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.description}
                                        onChange={() => handleColumnChange('description')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Description</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.qty}
                                        onChange={() => handleColumnChange('qty')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Qty</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.unitPrice}
                                        onChange={() => handleColumnChange('unitPrice')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Unit Price</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.discount}
                                        onChange={() => handleColumnChange('discount')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Discount</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.tax}
                                        onChange={() => handleColumnChange('tax')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Tax</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={columns.total}
                                        onChange={() => handleColumnChange('total')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Total</span>
                                </label>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="flex-[2] space-y-6">

                        {/* Header Section */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-2 text-yellow-600">
                                <FaCode />
                                <h3 className="font-bold text-gray-900 text-sm">Header Section</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">Enter custom HTML for header (optional). Variables: &#123;company_name&#125;, &#123;company_address&#125;, &#123;logo&#125;</p>
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
                                <h3 className="font-bold text-gray-900 text-sm">Footer Section</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">Enter custom HTML for footer (optional). Variables: &#123;page_number&#125;, &#123;total_pages&#125;, &#123;company_phone&#125;, &#123;company_email&#125;</p>
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
                                <div className="flex items-center gap-2 mb-4 text-yellow-600">
                                    <FaEye />
                                    <h3 className="font-bold text-gray-900 text-sm">Live Preview</h3>
                                </div>

                                {/* Dynamic Paper Mockup */}
                                <div
                                    className="border border-gray-300 shadow-lg mx-auto bg-white p-8 relative transition-all duration-300 ease-in-out flex flex-col"
                                    style={getPaperStyle()}
                                >

                                    {/* Header Content (if any) */}
                                    {headerContent && (
                                        <div className="mb-4 text-sm" dangerouslySetInnerHTML={{ __html: headerContent }} />
                                    )}

                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-8 border-b border-gray-200 pb-6">
                                        <div className="flex items-center gap-4">
                                            {displayOptions.showLogo && (
                                                <div className="w-16 h-16 flex items-center justify-center">
                                                    <img src={logo} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                                                </div>
                                            )}
                                            {displayOptions.showCompanyDetails && (
                                                <div>
                                                    <h2 className="font-bold text-lg text-slate-800">New Extreme Sports Trading LLC</h2>
                                                    <p className="text-xs text-gray-500">M1 Office, Al Harthi Building, Rolla Street, Bur Dubai, Dubai - U.A.E</p>
                                                    <p className="text-xs text-gray-500">Email: admin@extremesportstrading.com | Phone: 04 393 9169</p>
                                                    <p className="text-xs text-gray-500">TRN: 100014932600003</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <h1 className="text-2xl font-bold text-gray-900">{category.title}</h1>
                                            <p className="text-sm text-gray-500">Date: {new Date().toLocaleDateString()}</p>
                                            <p className="text-sm text-gray-500">Ref: PO-2024-001</p>
                                        </div>
                                    </div>

                                    {/* Vendor Details */}
                                    {displayOptions.showCustomerDetails && (
                                        <div className="mb-8">
                                            <h3 className="font-bold text-sm text-slate-800 mb-1">Vendor:</h3>
                                            <div className="text-sm text-gray-600">
                                                <p className="font-semibold">Vendor Name</p>
                                                <p>Vendor Address Line 1</p>
                                                <p>City, State, Zip</p>
                                                <p>Phone: +1 234 567 890</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Table */}
                                    <div className="mb-8 flex-1">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 border-y border-gray-200">
                                                <tr className="text-left text-gray-600">
                                                    {columns.productId && <th className="py-2 px-2 font-semibold text-center">Product ID</th>}
                                                    {columns.sku && <th className="py-2 px-2 font-semibold">SKU</th>}
                                                    {columns.arabicName && <th className="py-2 px-2 font-semibold text-right">Arabic Name</th>}
                                                    {columns.item && <th className="py-2 px-2 font-semibold">Item</th>}
                                                    {columns.description && <th className="py-2 px-2 font-semibold">Description</th>}
                                                    {columns.qty && <th className="py-2 px-2 font-semibold text-right">Qty</th>}
                                                    {columns.unitPrice && <th className="py-2 px-2 font-semibold text-right">Unit Price</th>}
                                                    {columns.discount && <th className="py-2 px-2 font-semibold text-right">Discount</th>}
                                                    {columns.tax && <th className="py-2 px-2 font-semibold text-right">Tax</th>}
                                                    {columns.total && <th className="py-2 px-2 font-semibold text-right">Total</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {[1, 2, 3].map((i) => (
                                                    <tr key={i}>
                                                        {columns.productId && <td className="py-2 px-2 text-center text-gray-400 font-mono text-xs">{100 + i}</td>}
                                                        {columns.sku && <td className="py-2 px-2 text-gray-400 font-mono text-xs">SKU-{i}00</td>}
                                                        {columns.arabicName && <td className="py-2 px-2 text-gray-700 text-right" dir="rtl">منتج نموذجي</td>}
                                                        {columns.item && <td className="py-2 px-2 text-gray-700">
                                                            {!columns.description && displayOptions.showItemImage ? (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="min-w-[24px] w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-[8px]"><FaImage /></div>
                                                                    <span>Sample Item</span>
                                                                </div>
                                                            ) : 'Sample Item'}
                                                        </td>}
                                                        {columns.description && <td className="py-2 px-2 text-gray-500">
                                                            {displayOptions.showItemImage ? (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="min-w-[24px] w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-[8px]"><FaImage /></div>
                                                                    <span>Sample Description</span>
                                                                </div>
                                                            ) : 'Sample Description'}
                                                        </td>}
                                                        {columns.qty && <td className="py-2 px-2 text-right text-gray-700">10.00</td>}
                                                        {columns.unitPrice && <td className="py-2 px-2 text-right text-gray-700">100.00</td>}
                                                        {columns.discount && <td className="py-2 px-2 text-right text-gray-700">0.00</td>}
                                                        {columns.tax && <td className="py-2 px-2 text-right text-gray-700">5.00</td>}
                                                        {columns.total && <td className="py-2 px-2 text-right font-medium text-gray-900">1050.00</td>}
                                                    </tr>
                                                ))}
                                            </tbody>
                                            {columns.total && (
                                                <tfoot className="border-t border-gray-200">
                                                    <tr>
                                                        <td colSpan={Object.values(columns).filter(Boolean).length - 1} className="py-2 px-2 text-right font-bold text-gray-800">Total:</td>
                                                        <td className="py-2 px-2 text-right font-bold text-gray-900">3150.00</td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>

                                    {/* Terms */}
                                    {displayOptions.showTerms && termsContent && (
                                        <div className="mb-4 border-t border-gray-200 pt-4">
                                            <h3 className="font-bold text-sm text-slate-800 mb-2">Terms & Conditions</h3>
                                            <div className="text-xs text-gray-500 whitespace-pre-wrap">{termsContent}</div>
                                        </div>
                                    )}

                                    {/* Footer Content */}
                                    {footerContent && (
                                        <div className="mt-4 border-t border-gray-200 pt-4 text-xs text-center text-gray-400" dangerouslySetInnerHTML={{ __html: footerContent }} />
                                    )}

                                </div>
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
                    Vendors & Purchases &gt;
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

const PurchasePrintEmailTemplates = () => {
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState(null);

    // State for all templates loaded from backend
    const [allTemplates, setAllTemplates] = useState([]);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const data = await getPrintTemplates();

            // Filter for purchase categories or seeding
            const purchaseCategories = [
                "Local Purchase Order",
                "Goods Receipt Note",
                "Purchase Invoice",
                "Purchase Return",
                "Payment Voucher"
            ];

            const purchaseData = data.filter(t => purchaseCategories.includes(t.category));

            // Auto-seed if empty for these categories
            if (purchaseData.length === 0) {
                console.log("No purchase templates found. Seeding defaults...");
                await seedDefaultTemplates();
                return;
            }

            // Parse JSON fields
            const parsedData = purchaseData.map(t => {
                let displayOptions = {};
                try {
                    displayOptions = typeof t.displayOptions === 'string' ? JSON.parse(t.displayOptions) : t.displayOptions;
                } catch (e) {
                    console.error("Error parsing displayOptions", e);
                }

                let columns = {};
                try {
                    columns = typeof t.columns === 'string' ? JSON.parse(t.columns) : t.columns;
                } catch (e) {
                    console.error("Error parsing columns", e);
                }

                return {
                    ...t,
                    displayOptions: displayOptions || {},
                    columns: columns || {}
                };
            });
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
            loadTemplates();
        } catch (error) {
            console.error("Error seeding default templates:", error);
        }
    };

    const categoryTemplates = [
        { title: "Local Purchase Order", description: "Standard LPO print template", icon: FaFileInvoice },
        { title: "Goods Receipt Note", description: "Inventory receipt confirmation", icon: FaTruck },
        { title: "Purchase Invoice", description: "Vendor invoice record", icon: FaFileInvoiceDollar },
        { title: "Purchase Return", description: "Debit note / return voucher", icon: FaUndo, disabled: true }
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
        const payload = {
            category: template.category,
            name: `${template.name} - Copy`,
            isDefault: false,
            paperSize: template.paperSize,
            orientation: template.orientation,
            headerContent: template.headerContent,
            termsContent: template.termsContent,
            footerContent: template.footerContent,
            displayOptions: JSON.stringify(template.displayOptions),
            columns: JSON.stringify(template.columns)
        };

        try {
            const savedTemplate = await createPrintTemplate(payload);
            const parsedTemplate = {
                ...savedTemplate,
                displayOptions: JSON.parse(savedTemplate.displayOptions),
                columns: JSON.parse(savedTemplate.columns)
            };
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
            const payload = {
                ...templateData,
                displayOptions: JSON.stringify(templateData.displayOptions),
                columns: JSON.stringify(templateData.columns)
            };

            let savedTemplate;
            if (templateData.id && allTemplates.some(t => t.id === templateData.id)) {
                savedTemplate = await updatePrintTemplate(templateData.id, payload);
                const parsedTemplate = {
                    ...savedTemplate,
                    displayOptions: JSON.parse(savedTemplate.displayOptions),
                    columns: JSON.parse(savedTemplate.columns)
                };
                setAllTemplates(prev => prev.map(t => t.id === parsedTemplate.id ? parsedTemplate : t));
            } else {
                const { id, ...createPayload } = payload;
                savedTemplate = await createPrintTemplate(createPayload);
                const parsedTemplate = {
                    ...savedTemplate,
                    displayOptions: JSON.parse(savedTemplate.displayOptions),
                    columns: JSON.parse(savedTemplate.columns)
                };
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
            const updatedTemplate = await setDefaultTemplate(template.id, template);
            const parsedTemplate = {
                ...updatedTemplate,
                displayOptions: JSON.parse(updatedTemplate.displayOptions),
                columns: JSON.parse(updatedTemplate.columns)
            };

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
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Vendors & Purchases &gt; <span className="text-gray-900">Print & Email Templates</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-yellow-500"><FaFileAlt /></span>
                    Purchase Print & Email Templates
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Design and customize templates for LPOs, GRNs, and other purchase documents
                </p>
            </div>

            <div className="p-8 flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {categoryTemplates.map((template, index) => (
                        <TemplateCard
                            key={index}
                            {...template}
                            onClick={() => setSelectedCategory(template)}
                        />
                    ))}
                </div>

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

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-3 text-blue-800 font-semibold">
                        <FaLightbulb />
                        <h3 className="text-sm">Email & Print Tips</h3>
                    </div>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1 ml-1">
                        <li>Templates are automatically used when emailing or printing purchase documents</li>
                        <li>Set a default template for LPOs and GRNs for consistent branding with vendors</li>
                        <li>Use HTML/CSS for advanced customization of headers and footers</li>
                        <li>Preview templates before saving to ensure correct formatting</li>
                    </ul>
                </div>
            </div>

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

export default PurchasePrintEmailTemplates;
