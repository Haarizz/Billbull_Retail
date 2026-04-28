import React, { useEffect, useMemo, useState } from 'react';
import {
    FaFileAlt,
    FaFileInvoice,
    FaClipboardList,
    FaTruck,
    FaFileInvoiceDollar,
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
import billBullLogo from '../../assets/billBullLogo.png';
import { getCompanyProfile } from '../../api/companyProfileApi';
import {
    createPrintTemplate,
    deletePrintTemplate,
    getPrintTemplates,
    setDefaultTemplate,
    updatePrintTemplate
} from '../../api/printTemplateApi';
import DocumentPreviewCanvas from '../../components/DocumentPreviewCanvas';
import { useCompany } from '../../context/CompanyContext';
import { generateEmailHtml, generatePrintHtml } from '../../utils/printGenerator';
import {
    buildPurchasePreviewData,
    getDefaultPurchaseTemplates,
    normalizePurchaseTemplate,
    PURCHASE_TEMPLATE_CATEGORIES,
    serializeTemplateForApi
} from '../../utils/purchasePrintUtils';

const PURCHASE_CATEGORY_META = [
    { title: 'Local Purchase Order', description: 'Vendor purchase order template', icon: FaClipboardList },
    { title: 'Goods Receipt Note', description: 'Goods receipt confirmation template', icon: FaTruck },
    { title: 'Purchase Invoice', description: 'Vendor purchase invoice template', icon: FaFileInvoiceDollar },
    { title: 'Payment Voucher', description: 'Vendor payment voucher template', icon: FaFileInvoice }
];

const formatTemplateDate = (template) => {
    const rawValue =
        template?.lastModified ||
        template?.updatedAt ||
        template?.updatedDate ||
        template?.modifiedDate ||
        template?.createdAt ||
        template?.createdDate;

    if (!rawValue) return new Date().toISOString().split('T')[0];

    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) {
        return String(rawValue).split('T')[0];
    }

    return parsedDate.toISOString().split('T')[0];
};

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

const ActionCard = ({ icon: Icon, title, description, colorClass = 'text-blue-600 bg-blue-50' }) => (
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
    const [showPreview, setShowPreview] = useState(false);

    const baseTemplate = useMemo(
        () => normalizePurchaseTemplate(initialData || { category: category.title }, category.title),
        [initialData, category.title]
    );

    const [templateName, setTemplateName] = useState(baseTemplate?.name || `New ${category.title} Template`);
    const [paperSize, setPaperSize] = useState(baseTemplate?.paperSize || 'A4');
    const [orientation, setOrientation] = useState(baseTemplate?.orientation || 'Portrait');
    const [headerContent, setHeaderContent] = useState(baseTemplate?.headerContent || '');
    const [termsContent, setTermsContent] = useState(baseTemplate?.termsContent || '');
    const [footerContent, setFooterContent] = useState(baseTemplate?.footerContent || '');
    const [displayOptions, setDisplayOptions] = useState(baseTemplate?.displayOptions || {
        showLogo: true,
        showCompanyDetails: true,
        showCustomerDetails: true,
        showTerms: true,
        showItemImage: false
    });
    const [columns, setColumns] = useState(baseTemplate?.columns || {
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

    const previewTemplate = useMemo(() => normalizePurchaseTemplate({
        ...baseTemplate,
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
        isDefault: initialData?.isDefault || false
    }, category.title), [baseTemplate, category.title, columns, displayOptions, footerContent, headerContent, initialData?.id, initialData?.isDefault, orientation, paperSize, templateName, termsContent]);

    const previewHtml = useMemo(() => generatePrintHtml(
        previewTemplate,
        buildPurchasePreviewData(category.title, previewCompany),
        {
            companyProfile: previewCompany,
            billBullLogo
        }
    ), [previewTemplate, category.title, previewCompany]);

    const previewEmailHtml = useMemo(() => generateEmailHtml(
        previewTemplate,
        buildPurchasePreviewData(category.title, previewCompany),
        {
            companyProfile: previewCompany,
            billBullLogo
        }
    ), [previewTemplate, category.title, previewCompany]);

    const handleDisplayOptionChange = (key) => {
        setDisplayOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleColumnChange = (key) => {
        setColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = () => {
        onSave({
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
            isDefault: initialData?.isDefault || false
        });
    };

    const CategoryIcon = category.icon;

    return (
        <div className="flex flex-col h-full bg-gray-50 text-slate-800 font-sans">
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Vendors &amp; Purchases &gt; Print &amp; Email Templates &gt; Template Designer
                </div>
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-yellow-500"><CategoryIcon /></span>
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

            <div className="p-8 flex-1 overflow-auto">
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-6">
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

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4 text-yellow-600">
                                <FaToggleOn />
                                <h3 className="font-bold text-gray-900 text-sm">Display Options</h3>
                            </div>
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!displayOptions.showLogo}
                                        onChange={() => handleDisplayOptionChange('showLogo')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Company Logo</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={displayOptions.showCompanyDetails !== false}
                                        onChange={() => handleDisplayOptionChange('showCompanyDetails')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Company Details</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!displayOptions.showCustomerDetails}
                                        onChange={() => handleDisplayOptionChange('showCustomerDetails')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Vendor Details</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!displayOptions.showTerms}
                                        onChange={() => handleDisplayOptionChange('showTerms')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Terms &amp; Conditions</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!displayOptions.showItemImage}
                                        onChange={() => handleDisplayOptionChange('showItemImage')}
                                        className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Show Item Images</span>
                                </label>
                            </div>
                        </div>

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
                                    <input type="checkbox" checked={!!columns.productId} onChange={() => handleColumnChange('productId')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Item Code</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.sku} onChange={() => handleColumnChange('sku')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">SKU</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.barcode} onChange={() => handleColumnChange('barcode')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Item Barcode</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.arabicName} onChange={() => handleColumnChange('arabicName')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Arabic Name</span>
                                </label>

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Quantities & Pricing</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.qty} onChange={() => handleColumnChange('qty')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Qty</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.unitPrice} onChange={() => handleColumnChange('unitPrice')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Unit Price</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.taxableAmount} onChange={() => handleColumnChange('taxableAmount')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Taxable Amount</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={columns.total !== false} onChange={() => handleColumnChange('total')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Line Total</span>
                                </label>

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Discount & Tax</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.discount} onChange={() => handleColumnChange('discount')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Discount % (in Taxable Amount col)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.discountPercent} onChange={() => handleColumnChange('discountPercent')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Discount % (separate column)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.tax} onChange={() => handleColumnChange('tax')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">VAT Amount</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.taxPercent} onChange={() => handleColumnChange('taxPercent')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Tax % (separate column)</span>
                                </label>

                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Document / Line Info</p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.salesPerson} onChange={() => handleColumnChange('salesPerson')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Sales Person</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!columns.location} onChange={() => handleColumnChange('location')} className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400" />
                                    <span className="text-sm text-gray-700 font-medium">Location / Branch</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="flex-[2] space-y-6">
                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                            <h3 className="text-sm font-bold text-blue-900">System-Controlled Layout</h3>
                            <p className="mt-2 text-xs leading-6 text-blue-800">
                                Purchase documents now render through a fixed layout system: document header, vendor and reference cards, structured item columns, totals, terms, and footer stay consistent while the fields below add supporting content inside those regions.
                            </p>
                        </div>

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
                            />
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-2 text-yellow-600">
                                <FaAlignLeft />
                                <h3 className="font-bold text-gray-900 text-sm">Terms &amp; Conditions</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">Enter terms and conditions</p>
                            <textarea
                                value={termsContent}
                                onChange={(e) => setTermsContent(e.target.value)}
                                className="w-full h-32 text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-yellow-400"
                                placeholder="1. Goods once received are subject to final verification..."
                            />
                        </div>

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
                            />
                        </div>

                        {showPreview && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-in fade-in slide-in-from-bottom-4">
                                <DocumentPreviewCanvas
                                    printHtml={previewHtml}
                                    emailHtml={previewEmailHtml}
                                    paperSize={paperSize}
                                    orientation={orientation}
                                    subtitle="Print preview uses an A4 paper canvas and email preview uses the same structured layout in a responsive wrapper."
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
    const CategoryIcon = category.icon;

    return (
        <div className="flex flex-col h-full bg-gray-50 text-slate-800 font-sans">
            <div className="px-8 py-5 border-b border-gray-200 bg-white">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                    Vendors &amp; Purchases &gt;
                    <span className="cursor-pointer hover:text-yellow-600" onClick={onBack}> Print &amp; Email Templates </span>
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
                            <span className="text-yellow-500"><CategoryIcon /></span>
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
                        templates.map((template) => (
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
                                            <p>Last modified: {formatTemplateDate(template)}</p>
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
    const { company } = useCompany();
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState(null);
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
            const purchaseTemplates = data
                .filter((template) => PURCHASE_TEMPLATE_CATEGORIES.includes(template.category))
                .map((template) => normalizePurchaseTemplate(template, template.category));

            const missingCategories = PURCHASE_TEMPLATE_CATEGORIES.filter(
                (category) => !purchaseTemplates.some((template) => template.category === category)
            );

            if (missingCategories.length > 0) {
                const defaultsToCreate = getDefaultPurchaseTemplates()
                    .filter((template) => missingCategories.includes(template.category));

                for (const template of defaultsToCreate) {
                    await createPrintTemplate(template);
                }

                const refreshedData = await getPrintTemplates();
                setAllTemplates(
                    refreshedData
                        .filter((template) => PURCHASE_TEMPLATE_CATEGORIES.includes(template.category))
                        .map((template) => normalizePurchaseTemplate(template, template.category))
                );
                return;
            }

            setAllTemplates(purchaseTemplates);
        } catch (error) {
            console.error('Error loading purchase templates:', error);
        }
    };

    const categoryTemplates = PURCHASE_CATEGORY_META.map((category) => ({
        ...category,
        count: allTemplates.filter((template) => template.category === category.title).length
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
        try {
            const duplicatePayload = serializeTemplateForApi({
                ...normalizePurchaseTemplate(template, template.category),
                id: undefined,
                name: `${template.name} - Copy`,
                isDefault: false
            });

            const { id, ...createPayload } = duplicatePayload;
            await createPrintTemplate(createPayload);
            await loadTemplates();
        } catch (error) {
            console.error('Error duplicating purchase template:', error);
            alert('Failed to duplicate template');
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
            setShowDeleteModal(false);
            setTemplateToDelete(null);
            await loadTemplates();
        } catch (error) {
            console.error('Error deleting purchase template:', error);
            alert('Failed to delete template');
        }
    };

    const handleSaveTemplate = async (templateData) => {
        try {
            const normalizedTemplate = normalizePurchaseTemplate(templateData, templateData.category);
            const payload = serializeTemplateForApi(normalizedTemplate);

            if (templateData.id && allTemplates.some((template) => template.id === templateData.id)) {
                await updatePrintTemplate(templateData.id, payload);
            } else {
                const { id, ...createPayload } = payload;
                await createPrintTemplate(createPayload);
            }

            setIsCreating(false);
            setEditingTemplate(null);
            await loadTemplates();
        } catch (error) {
            console.error('Error saving purchase template:', error);
            alert('Failed to save template');
        }
    };

    const handleSetDefault = async (template) => {
        try {
            await setDefaultTemplate(template.id, serializeTemplateForApi({
                ...normalizePurchaseTemplate(template, template.category),
                isDefault: true
            }));
            await loadTemplates();
        } catch (error) {
            console.error('Error setting purchase default template:', error);
            alert('Failed to set default template');
        }
    };

    if (isCreating && selectedCategory) {
        return (
            <TemplateDesigner
                category={selectedCategory}
                initialData={editingTemplate}
                previewCompany={previewCompanyProfile}
                onSave={handleSaveTemplate}
                onCancel={() => {
                    setIsCreating(false);
                    setEditingTemplate(null);
                }}
            />
        );
    }

    if (selectedCategory) {
        const templates = allTemplates.filter((template) => template.category === selectedCategory.title);
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
                    onClose={() => {
                        setShowDeleteModal(false);
                        setTemplateToDelete(null);
                    }}
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
                    Vendors &amp; Purchases &gt; <span className="text-gray-900">Print &amp; Email Templates</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-yellow-500"><FaFileAlt /></span>
                    Print &amp; Email Templates
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Design and customize templates for purchase orders, GRNs, vendor invoices, and payment vouchers
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
                        <h3 className="text-sm">Email &amp; Print Tips</h3>
                    </div>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1 ml-1">
                        <li>Templates are automatically used when printing or emailing purchase documents</li>
                        <li>Set a default template for each purchase document type to keep layouts consistent</li>
                        <li>Use HTML and CSS in headers and footers for advanced vendor-facing formatting</li>
                        <li>Preview templates before saving to confirm the print layout matches sales-style output</li>
                    </ul>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setTemplateToDelete(null);
                }}
                onConfirm={confirmDelete}
                title="Delete Template?"
                message="Are you sure you want to delete this template? This action cannot be undone and may affect documents using this template."
            />
        </div>
    );
};

export default PurchasePrintEmailTemplates;
