import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    Search, Filter, Download, Upload, Plus, MoreHorizontal, ChevronDown, Users, Wallet, MapPin, Phone, Mail,
    FileText, CreditCard, Truck, Building, Save, X, CheckCircle2, AlertCircle, File, Edit, Trash2, Eye,
    Calendar, DollarSign, Image as ImageIcon, UserPlus, History, Tag, Camera, XCircle, Clock, Paperclip, Printer, Share2, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import SearchableDropdown from '../../components/SearchableDropdown'; // ✅ Import Searchable Dropdown

import StatementPrintPreview from '../../components/StatementPrintPreview';
import CurrencyAmount, { CurrencySymbol } from '../../components/CurrencyAmount';
import PaginationFooter from '../../components/common/PaginationFooter';

// --- API IMPORTS ---
import { getAllCustomers, getCustomerById, createCustomer, deleteCustomer, getOpeningInvoicesByCustomerCode, getNextCustomerCode } from '../../api/customerledgerApi';
import { fetchStatementOfAccount } from '../../api/financialsApi';
// ✅ Import Warehouse API
import { getWarehouses } from '../../api/warehouseApi';
// ✅ Import Sales Payment & Invoice API
import { getAllSalesPayments, saveSalesPayment, getNextSalesPaymentNumber, getSalesPaymentStats } from '../../api/salesPaymentApi';
import { getAllSalesInvoices } from '../../api/salesInvoiceApi';
import { getBankAccounts } from '../../api/ledgerApi';
import { getSalesSettings } from '../../api/salesSettingsApi';
import { useBranch } from '../../context/BranchContext';
import { useCompany } from '../../context/CompanyContext';
import {
    getCountryOptions,
    getCurrencyOptions,
    normalizeCountryValue,
    normalizeCurrencyValue,
    withFallbackOption
} from '../../utils/countryCurrencyOptions';
import { formatDisplayDate } from '../../utils/dateUtils';
import ExportDropdown from '../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { generateSOAFilename } from '../../utils/filenameUtils';
import { STATEMENT_EXPORT_COLUMNS, formatStatementEntryType, mapStatementEntriesForExport } from '../../utils/statementUtils';
import { isAutoNumberingEnabled } from '../../utils/salesNumbering';
import { getTemplatesByCategory } from '../../api/printTemplateApi';
import { generatePrintHtmlAsync, printHtml } from '../../utils/printGenerator';
import {
    normalizePurchaseTemplate,
    buildReceiptVoucherPrintData,
    buildCustomerSoaPrintData,
    resolvePurchasePrintTemplate
} from '../../utils/purchasePrintUtils';
import { buildDocumentHeaderProfile } from '../../utils/branchPrintProfile';
import billBullLogo from '../../assets/billBullLogo.png';
// QA-040: shared email modal
import SendDocumentEmailModal from '../../components/SendDocumentEmailModal';
import { sendReceiptVoucherEmail } from '../../api/receiptVoucherApi';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const CUSTOMER_COLUMNS = [
    { header: 'S.No.', key: 'sNo', width: 8 },
    { header: 'Code', key: 'code', width: 15 },
    { header: 'Customer Name', key: 'name', width: 30 },
    { header: 'Group', key: 'group', width: 15 },
    { header: 'Contact', key: 'contact', width: 20 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Balance', key: 'balance', width: 15 },
    { header: 'Status', key: 'status', width: 12 }
];

const getOpeningInvoiceOutstanding = (invoice = {}) => {
    const source = invoice.outstanding !== undefined && invoice.outstanding !== null && invoice.outstanding !== ''
        ? invoice.outstanding
        : invoice.amount;
    const value = Number(source || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
};

const getOpeningInvoiceOriginalAmount = (invoice = {}) => {
    const source = invoice.amount !== undefined && invoice.amount !== null && invoice.amount !== ''
        ? invoice.amount
        : invoice.openingBalanceAmount;
    const value = Number(source || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
};

const createDefaultReceiptVoucherTemplate = () => normalizePurchaseTemplate({
    category: 'Receipt Voucher',
    name: 'Default Receipt Voucher',
    isDefault: true,
    paperSize: 'A4',
    orientation: 'Portrait',
    headerContent: '',
    footerContent: '',
    termsContent: 'Received with thanks the amount stated above. This receipt is valid after cheque or bank-transfer clearance.',
    displayOptions: {
        showLogo: true,
        showCompanyDetails: true,
        showCustomerDetails: true,
        showTerms: false,
        showItemImage: false,
        salesDesigner: 'payment',
        salesDesignerSettings: {
            templateName: 'Default Receipt Voucher',
            salesDesigner: 'payment',
            docType: 'receipt',
            accentColor: '#F5C742',
            primaryColor: '#F5C742',
            headerBg: '#1e293b',
            borderColor: '#dbe2ea',
            fontFamily: 'Inter, sans-serif',
            fontSize: 9,
            paperSize: 'A4',
            orientation: 'portrait',
            showLogo: true,
            showCompanyLogo: true,
            showCompanyName: true,
            showCompanyAddress: true,
            showCompanyPhone: true,
            showCompanyEmail: true,
            showTRN: true,
            showBillTo: true,
            showCustomerName: true,
            showCustomerCode: true,
            showCustomerPhone: true,
            showCustomerEmail: true,
            showCustomerTRN: true,
            showReceiptNumber: true,
            showReceiptDate: true,
            showDocNumber: true,
            showDocDate: true,
            showStatusBadge: true,
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
            showGeneratedBy: true,
            showReceivedByLine: true,
        }
    },
    columns: {
        qty: false,
        unitPrice: false,
        taxableAmount: false,
        tax: false,
        discount: false,
        total: false,
    }
}, 'Receipt Voucher');

const resolveReceiptVoucherPrintTemplate = (templates = []) => {
    const selectedTemplate = Array.isArray(templates)
        ? (templates.find((template) => template?.isDefault) || templates[0])
        : null;
    const normalizedTemplate = selectedTemplate
        ? normalizePurchaseTemplate({ ...selectedTemplate, category: 'Receipt Voucher' }, 'Receipt Voucher')
        : createDefaultReceiptVoucherTemplate();
    const displayOptions = { ...(normalizedTemplate.displayOptions || {}) };
    const designerSettings = {
        ...(displayOptions.salesDesignerSettings || displayOptions.designerSettings || {}),
    };

    if (designerSettings.showCustomerName !== false) {
        designerSettings.showBillTo = true;
        displayOptions.showCustomerDetails = true;
    }

    return {
        ...normalizedTemplate,
        displayOptions: {
            ...displayOptions,
            salesDesigner: displayOptions.salesDesigner || 'payment',
            salesDesignerSettings: designerSettings,
            designerSettings,
        },
    };
};

// ==========================================
// 1. ADD ADDRESS MODAL (Nested)
// ==========================================

const AddAddressModal = ({ isOpen, onClose, onSave, initialData }) => {
    const createDefaultAddressData = () => ({
        name: '',
        address1: '',
        address2: '',
        city: 'Dubai',
        state: '',
        postalCode: '',
        country: 'United Arab Emirates',
        mapLink: ''
    });
    const [addressData, setAddressData] = useState(createDefaultAddressData);
    const countryOptions = useMemo(() => withFallbackOption(
        getCountryOptions(),
        normalizeCountryValue(addressData.country)
    ), [addressData.country]);

    useEffect(() => {
        const defaultData = createDefaultAddressData();
        setAddressData({
            ...defaultData,
            ...(initialData || {}),
            country: normalizeCountryValue(initialData?.country || defaultData.country)
        });
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const isEditing = !!initialData;

    const handleSubmit = () => {
        if (!addressData.name || !addressData.address1 || !addressData.city) {
            alert("Please fill in all required address fields.");
            return;
        }
        onSave(addressData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Shipping Address' : 'Add Shipping Address'}</h3>
                        <p className="text-xs text-slate-500">{isEditing ? 'Update delivery address details' : 'Create a new delivery address for this customer'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Address Name <span className="text-red-500">*</span></label>
                        <input type="text" value={addressData.name} onChange={e => setAddressData({ ...addressData, name: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                        <input type="text" value={addressData.address1} onChange={e => setAddressData({ ...addressData, address1: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Address Line 2</label>
                        <input type="text" value={addressData.address2} onChange={e => setAddressData({ ...addressData, address2: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">City <span className="text-red-500">*</span></label>
                            <input type="text" value={addressData.city} onChange={e => setAddressData({ ...addressData, city: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">State</label>
                            <input type="text" value={addressData.state} onChange={e => setAddressData({ ...addressData, state: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Postal Code</label>
                            <input type="text" value={addressData.postalCode} onChange={e => setAddressData({ ...addressData, postalCode: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Country</label>
                        <SearchableDropdown
                            options={countryOptions}
                            value={addressData.country}
                            onChange={(value) => setAddressData((prev) => ({ ...prev, country: value }))}
                            placeholder="Search country"
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Google Maps Pin (Optional)</label>
                        <input type="text" value={addressData.mapLink} onChange={e => setAddressData({ ...addressData, mapLink: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm">{isEditing ? 'Save Changes' : 'Add Address'}</button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 2. ADD INVOICE MODAL (Nested)
// ==========================================

const AddInvoiceModal = ({ isOpen, onClose, onSave, initialData }) => {
    const defaultData = { number: '', date: '', amount: '', outstanding: '', remarks: '' };
    const [invoiceData, setInvoiceData] = useState(defaultData);

    useEffect(() => {
        setInvoiceData(initialData || defaultData);
    }, [isOpen]);

    if (!isOpen) return null;

    const isEditing = !!initialData;

    const handleSubmit = () => {
        if (!invoiceData.number || !invoiceData.amount) {
            alert("Invoice Number and Amount are required.");
            return;
        }
        onSave(invoiceData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Opening Invoice' : 'Add Opening Invoice'}</h3>
                        <p className="text-xs text-slate-500">{isEditing ? 'Update invoice details' : 'Record an opening balance invoice'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Invoice Number <span className="text-red-500">*</span></label>
                        <input type="text" value={invoiceData.number} onChange={e => setInvoiceData({ ...invoiceData, number: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Invoice Date</label>
                        <input type="date" value={invoiceData.date} onChange={e => setInvoiceData({ ...invoiceData, date: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Invoice Amount <span className="text-red-500">*</span></label>
                        <input type="number" value={invoiceData.amount} onChange={e => setInvoiceData({ ...invoiceData, amount: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Outstanding Amount</label>
                        <input type="number" value={invoiceData.outstanding} onChange={e => setInvoiceData({ ...invoiceData, outstanding: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
                        <textarea value={invoiceData.remarks} onChange={e => setInvoiceData({ ...invoiceData, remarks: e.target.value })} rows="3" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] resize-none"></textarea>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm">{isEditing ? 'Save Changes' : 'Add Invoice'}</button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 3. ADD CONTACT PERSON MODAL (Nested)
// ==========================================

const AddContactModal = ({ isOpen, onClose, onSave, initialData }) => {
    const defaultData = { name: '', designation: '', phone: '', email: '', whatsapp: '', gender: '', notes: '', isAccountContact: false };
    const [contactData, setContactData] = useState(defaultData);

    useEffect(() => {
        setContactData(initialData || defaultData);
    }, [isOpen]);

    if (!isOpen) return null;

    const isEditing = !!initialData;

    const handleSubmit = () => {
        if (!contactData.name || !contactData.phone) {
            alert("Name and Phone are required.");
            return;
        }
        onSave(contactData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Contact Person' : 'Add Contact Person'}</h3>
                        <p className="text-xs text-slate-500">{isEditing ? 'Update contact person details' : 'Add a new contact person for this customer'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Name <span className="text-red-500">*</span></label>
                            <input type="text" value={contactData.name} onChange={e => setContactData({ ...contactData, name: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Designation</label>
                            <input type="text" value={contactData.designation} onChange={e => setContactData({ ...contactData, designation: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Phone <span className="text-red-500">*</span></label>
                            <input type="text" value={contactData.phone} onChange={e => setContactData({ ...contactData, phone: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                            <input type="email" value={contactData.email} onChange={e => setContactData({ ...contactData, email: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">WhatsApp</label>
                            <input type="text" value={contactData.whatsapp} onChange={e => setContactData({ ...contactData, whatsapp: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Gender</label>
                            <div className="relative">
                                <select value={contactData.gender} onChange={e => setContactData({ ...contactData, gender: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none">
                                    <option value="">Select gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                        <textarea value={contactData.notes} onChange={e => setContactData({ ...contactData, notes: e.target.value })} rows="2" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] resize-none"></textarea>
                    </div>
                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={contactData.isAccountContact} onChange={e => setContactData({ ...contactData, isAccountContact: e.target.checked })} className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742] border-slate-300" />
                            <span className="text-sm text-slate-700">Accounts Contact (Receives invoices and statements)</span>
                        </label>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm">{isEditing ? 'Save Changes' : 'Add Contact'}</button>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// 4. MAIN ADD / EDIT CUSTOMER MODAL
// ==========================================

const AddCustomerModal = ({ isOpen, onClose, customerToEdit, onSaveCustomer }) => {
    const { defaultBranchName } = useBranch();
    const { company } = useCompany();
    const currency = company?.currency || 'AED';
    const defaultCurrency = normalizeCurrencyValue(company?.currency || 'AED');
    const [activeTab, setActiveTab] = useState('general');
    const [customerAutoNumbering, setCustomerAutoNumbering] = useState(true);

    // --- Nested Modal States ---
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [editingAddressIdx, setEditingAddressIdx] = useState(null);
    const [editingInvoiceIdx, setEditingInvoiceIdx] = useState(null);
    const [editingContactIdx, setEditingContactIdx] = useState(null);

    // --- Photo Upload & Camera States ---
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraError, setCameraError] = useState('');

    // ✅ WAREHOUSE LIST STATE
    const [warehouseList, setWarehouseList] = useState([]);

    const fileInputRef = useRef(null);
    const docInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const createInitialFormState = () => ({
        code: '',
        name: '',
        localName: '',
        group: '',
        trn: '',
        status: 'Active',
        mobile: '',
        phone: '',
        email: '',
        whatsapp: '',
        country: 'United Arab Emirates',
        city: 'Dubai',
        postalCode: '',
        payMode: 'Cash',
        payTerms: 'Immediate',
        creditLimitDays: '',
        creditLimitAmount: '',
        maxCreditInvoices: '',
        discountLimitPercent: '',
        discountLimitAmount: '',
        creditStatus: 'Good',
        blockCredit: false,
        priceList: 'Default',
        currency: defaultCurrency,
        salesman: '',
        taxGroup: 'Standard VAT 5%',
        branch: defaultBranchName || '',
        warehouse: '',
        billingAddress: '',
        shippingAddress: '',
        notes: '',
        savedAddresses: [],
        openingInvoices: [],
        contactPersons: [],
        documents: []
    });
    const normalizeSavedAddress = (address = {}) => ({
        ...address,
        country: normalizeCountryValue(address.country || '')
    });
    const normalizeCustomerFormData = (data = {}) => ({
        ...data,
        country: normalizeCountryValue(data.country || ''),
        currency: normalizeCurrencyValue(data.currency || ''),
        savedAddresses: (data.savedAddresses || []).map(normalizeSavedAddress),
        openingInvoices: data.openingInvoices || [],
        contactPersons: data.contactPersons || [],
        documents: data.documents || []
    });
    const [formData, setFormData] = useState(createInitialFormState);
    const countryOptions = useMemo(() => withFallbackOption(
        getCountryOptions(),
        normalizeCountryValue(formData.country)
    ), [formData.country]);
    const currencyOptions = useMemo(() => withFallbackOption(
        getCurrencyOptions(),
        normalizeCurrencyValue(formData.currency),
        (value) => ({ value, label: value, displayLabel: value })
    ), [formData.currency]);

    // ✅ FETCH WAREHOUSES ON MOUNT
    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const data = await getWarehouses();
                setWarehouseList(data);
            } catch (error) {
                console.error("Error fetching warehouses", error);
            }
        };
        fetchWarehouses();
    }, []);

    // ✅ SYNC FORM STATE WHEN EDITING
    useEffect(() => {
        if (isOpen && customerToEdit) {
            const initialFormState = createInitialFormState();
            const normalizedCustomer = normalizeCustomerFormData(customerToEdit);
            setFormData({
                ...initialFormState,
                ...normalizedCustomer,
                savedAddresses: normalizedCustomer.savedAddresses,
                openingInvoices: normalizedCustomer.openingInvoices,
                contactPersons: normalizedCustomer.contactPersons,
                documents: normalizedCustomer.documents
            });
            setAvatarPreview(customerToEdit.avatar || null);
        } else if (isOpen && !customerToEdit) {
            setFormData(createInitialFormState());
            setAvatarPreview(null);
            setActiveTab('general');
        }
    }, [customerToEdit, defaultBranchName, defaultCurrency, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const loadNumbering = async () => {
            try {
                const settings = await getSalesSettings();
                const autoEnabled = isAutoNumberingEnabled(settings, 'CUSTOMER');
                if (cancelled) return;
                setCustomerAutoNumbering(autoEnabled);

                if (!customerToEdit) {
                    if (autoEnabled) {
                        const nextCode = await getNextCustomerCode();
                        if (!cancelled) setFormData(prev => ({ ...prev, code: nextCode || '' }));
                    } else {
                        setFormData(prev => ({ ...prev, code: '' }));
                    }
                }
            } catch (err) {
                if (!cancelled) setCustomerAutoNumbering(true);
            }
        };

        loadNumbering();
        return () => {
            cancelled = true;
        };
    }, [customerToEdit, isOpen]);

    useEffect(() => {
        if (!isOpen || customerToEdit || !defaultBranchName) {
            return;
        }

        setFormData((prev) => (
            prev.branch
                ? prev
                : { ...prev, branch: defaultBranchName }
        ));
    }, [customerToEdit, defaultBranchName, isOpen]);

    // --- VALIDATION LOGIC ---
    const isFormValid = useMemo(() => {
        // 1. General Tab Requirements
        if (!formData.name?.trim()) return false;
        if (!formData.group) return false;
        if (!customerAutoNumbering && !formData.code?.trim()) return false;

        // 2. Contact Tab Requirements
        if (!formData.mobile?.trim()) return false;

        // 3. Photo Tab Requirement (Mandatory) -> NOW OPTIONAL
        // if (!avatarPreview) return false;

        return true;
    }, [formData, avatarPreview, customerAutoNumbering]);

    const handleMainSave = () => {
        if (!isFormValid) return;
        const normalized = normalizeCustomerFormData(formData);
        onSaveCustomer({
            ...normalized,
            balance: normalized.openingInvoices.reduce((sum, invoice) => sum + getOpeningInvoiceOutstanding(invoice), 0),
            avatar: avatarPreview
        });
    };

    const navItems = [
        { id: 'general', label: 'General Information', icon: Users },
        { id: 'contact', label: 'Contact Details', icon: Phone },
        { id: 'financial', label: 'Financial & Credit', icon: Wallet },
        { id: 'defaults', label: 'Price List & Defaults', icon: Tag },
        { id: 'shipping', label: 'Shipping Address', icon: Truck },
        { id: 'opening', label: 'Opening Balances', icon: DollarSign },
        { id: 'documents', label: 'Documents', icon: FileText },
        { id: 'persons', label: 'Contact Persons', icon: UserPlus },
        { id: 'photo', label: 'Customer Photo', icon: ImageIcon },
        { id: 'notes', label: 'Notes & Tags', icon: File },
        { id: 'activity', label: 'Activity Log', icon: History },
    ];

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    // --- Handlers for Nested Modals ---
    const handleSaveAddress = (data) => {
        if (editingAddressIdx !== null) {
            setFormData(prev => {
                const updated = [...prev.savedAddresses];
                updated[editingAddressIdx] = data;
                return { ...prev, savedAddresses: updated };
            });
            setEditingAddressIdx(null);
        } else {
            setFormData(prev => ({ ...prev, savedAddresses: [...prev.savedAddresses, data] }));
        }
    };

    const handleSetDefaultAddress = (idx) => {
        setFormData(prev => ({
            ...prev,
            savedAddresses: prev.savedAddresses.map((addr, i) => ({
                ...addr,
                isDefault: i === idx
            }))
        }));
    };

    const handleSaveInvoice = (data) => {
        const outstanding = data.outstanding !== undefined && data.outstanding !== null && data.outstanding !== ''
            ? data.outstanding
            : data.amount;
        const normalizedInvoice = {
            ...data,
            outstanding,
            openingBalanceAmount: data.openingBalanceAmount || outstanding
        };

        if (editingInvoiceIdx !== null) {
            setFormData(prev => {
                const updated = [...prev.openingInvoices];
                updated[editingInvoiceIdx] = normalizedInvoice;
                return { ...prev, openingInvoices: updated };
            });
            setEditingInvoiceIdx(null);
        } else {
            setFormData(prev => ({ ...prev, openingInvoices: [...prev.openingInvoices, normalizedInvoice] }));
        }
    };

    const handleSaveContact = (data) => {
        if (editingContactIdx !== null) {
            setFormData(prev => {
                const updated = [...prev.contactPersons];
                updated[editingContactIdx] = data;
                return { ...prev, contactPersons: updated };
            });
            setEditingContactIdx(null);
        } else {
            setFormData(prev => ({ ...prev, contactPersons: [...prev.contactPersons, data] }));
        }
    };

    const handleDeleteAddress = (idx) => {
        setFormData(prev => ({ ...prev, savedAddresses: prev.savedAddresses.filter((_, i) => i !== idx) }));
    };

    const handleDeleteInvoice = (idx) => {
        setFormData(prev => ({ ...prev, openingInvoices: prev.openingInvoices.filter((_, i) => i !== idx) }));
    };

    const handleDeleteContact = (idx) => {
        setFormData(prev => ({ ...prev, contactPersons: prev.contactPersons.filter((_, i) => i !== idx) }));
    };

    // --- Document Upload Handler ---
    const handleDocumentUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("File size must be under 2MB");
            return;
        }
        if (file.type !== "application/pdf") {
            alert("Only .pdf files are allowed");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            const newDoc = {
                name: file.name,
                size: (file.size / 1024).toFixed(2) + ' KB',
                date: new Date().toISOString().split('T')[0],
                type: 'PDF',
                fileContent: base64String
            };
            setFormData(prev => ({ ...prev, documents: [...prev.documents, newDoc] }));
        };
        reader.readAsDataURL(file);
        if (docInputRef.current) docInputRef.current.value = '';
    };

    const deleteDocument = (index) => {
        const updatedDocs = formData.documents.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, documents: updatedDocs }));
    }

    // --- Photo Handlers ---
    const handleAvatarFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert("File size must be under 2MB"); return; }
        if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) { alert("Only PNG and JPG files are allowed"); return; }
        setAvatarFile(file);

        const reader = new FileReader();
        reader.onloadend = () => setAvatarPreview(reader.result);
        reader.readAsDataURL(file);
    };

    const startCamera = async () => {
        setIsCameraOpen(true);
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) {
            console.error("Camera Error:", err);
            setCameraError("Could not access camera. Please check permissions.");
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);

            const dataUrl = canvasRef.current.toDataURL('image/jpeg');
            setAvatarPreview(dataUrl);
            canvasRef.current.toBlob((blob) => setAvatarFile(blob), 'image/jpeg');
            stopCamera();
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraOpen(false);
    };

    const removePhoto = () => {
        setAvatarPreview(null);
        setAvatarFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };


    if (!isOpen) return null;

    const renderContent = () => {
        switch (activeTab) {
            case 'general': return (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                            <Users className="text-[#F5C742]" size={18} />
                            <h3 className="text-sm font-semibold text-slate-700">General Information</h3>
                            <span className="text-xs text-slate-400 ml-auto">Basic customer details</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Customer Code <span className="text-red-500">*</span></label><input type="text" name="code" value={formData.code} onChange={handleInputChange} readOnly={customerToEdit || customerAutoNumbering} placeholder={customerAutoNumbering ? 'Auto generated' : 'Enter customer code'} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 text-slate-700 read-only:bg-slate-50 read-only:text-slate-500 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Customer Group <span className="text-red-500">*</span></label><div className="relative"><select name="group" value={formData.group} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-700"><option value="">Select group</option><option value="Retail">Retail</option><option value="Wholesale">Wholesale</option><option value="VIP">VIP</option><option value="Corporate">Corporate</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Customer Name <span className="text-red-500">*</span></label><input name="name" value={formData.name} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Local Name (Optional)</label><input name="localName" value={formData.localName} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] text-right" /></div>
                            <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1.5">Address</label><textarea name="billingAddress" value={formData.billingAddress} onChange={handleInputChange} rows="2" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] resize-none"></textarea></div>
                            <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1.5">Tax Registration Number (TRN)</label><input name="trn" value={formData.trn} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label><div className="relative"><select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none"><option value="Active">Active</option><option value="Inactive">Inactive</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                        </div>
                    </div>
                </div>
            );
            case 'contact': return (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                            <Phone className="text-[#F5C742]" size={18} />
                            <h3 className="text-sm font-semibold text-slate-700">Contact Details</h3>
                            <span className="text-xs text-slate-400 ml-auto">Phone, email, and location information</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Mobile Number <span className="text-red-500">*</span></label><input name="mobile" value={formData.mobile} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Phone (Optional)</label><input name="phone" value={formData.phone} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Email (Optional)</label><input name="email" value={formData.email} onChange={handleInputChange} type="email" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">WhatsApp (Optional)</label><input name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Country (Optional)</label>
                                <SearchableDropdown
                                    options={countryOptions}
                                    value={formData.country}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, country: value }))}
                                    placeholder="Search country"
                                    className="w-full"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-slate-500 mb-1.5">City</label><input name="city" value={formData.city} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div><div><label className="block text-xs font-medium text-slate-500 mb-1.5">Postal Code</label><input name="postalCode" value={formData.postalCode} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div></div>
                        </div>
                    </div>
                </div>
            );
            case 'financial': return (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                            <Wallet className="text-[#F5C742]" size={18} />
                            <h3 className="text-sm font-semibold text-slate-700">Financial & Credit Settings</h3>
                            <span className="text-xs text-slate-400 ml-auto">Payment terms and credit limits</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Default Payment Mode</label><div className="relative"><select name="payMode" value={formData.payMode} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none"><option>Cash</option><option>Credit</option><option>Bank Transfer</option><option>Card Payment</option><option>Cheque</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Payment Terms</label><div className="relative"><select name="payTerms" value={formData.payTerms} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none"><option>Immediate</option><option>Net 30 Days</option><option>Net 45 Days</option><option>Net 60 Days</option><option>Net 90 Days</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Credit Limit (Days)</label><input name="creditLimitDays" value={formData.creditLimitDays} onChange={handleInputChange} type="number" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Credit Limit (Amount)</label><input name="creditLimitAmount" value={formData.creditLimitAmount} onChange={handleInputChange} type="number" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1.5">Max Credit Invoices</label><input name="maxCreditInvoices" value={formData.maxCreditInvoices} onChange={handleInputChange} type="number" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Discount % Limit</label><input name="discountLimitPercent" value={formData.discountLimitPercent} onChange={handleInputChange} type="number" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Discount Amount Limit</label><input name="discountLimitAmount" value={formData.discountLimitAmount} onChange={handleInputChange} type="number" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1.5">Credit Status</label><div className="relative"><select name="creditStatus" value={formData.creditStatus} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none"><option>Good</option><option>Restricted</option><option>Blocked</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                            <div className="md:col-span-2 mt-2"><label className="flex items-center gap-2 cursor-pointer"><input name="blockCredit" checked={formData.blockCredit} onChange={handleInputChange} type="checkbox" className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742] border-slate-300" /><span className="text-sm text-slate-700">Block Credit (Customer must pay cash)</span></label></div>
                        </div>
                    </div>
                </div>
            );
            case 'defaults': return (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                            <Tag className="text-[#F5C742]" size={18} />
                            <h3 className="text-sm font-semibold text-slate-700">Price List & Defaults</h3>
                            <span className="text-xs text-slate-400 ml-auto">Default settings for sales transactions</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Price List</label><div className="relative"><select name="priceList" value={formData.priceList} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none"><option>Default</option><option>Standard</option><option>VIP</option><option>Wholesale</option><option>Retail</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Default Currency</label>
                                <SearchableDropdown
                                    options={currencyOptions}
                                    value={formData.currency}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
                                    placeholder="Search currency"
                                    className="w-full"
                                />
                            </div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Default Salesman</label><input name="salesman" value={formData.salesman} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Default Tax Group</label><input name="taxGroup" value={formData.taxGroup} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>
                            <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Default Branch</label><input name="branch" value={formData.branch} onChange={handleInputChange} type="text" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" /></div>

                            {/* ✅ UPDATED WAREHOUSE DROPDOWN */}
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Default Warehouse</label>
                                <div className="relative">
                                    <select
                                        name="warehouse"
                                        value={formData.warehouse}
                                        onChange={handleInputChange}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 appearance-none focus:outline-none focus:border-[#F5C742]"
                                    >
                                        <option value="">Select Warehouse</option>
                                        {warehouseList.map((wh) => (
                                            <option key={wh.id} value={wh.name}>{wh.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                            {/* ----------------------------- */}

                        </div>
                    </div>
                </div>
            );

            case 'shipping':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[300px]">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Truck className="text-[#F5C742]" size={18} />
                                        <h3 className="text-sm font-semibold text-slate-700">Shipping Addresses</h3>
                                    </div>
                                    <p className="text-xs text-slate-400">Manage multiple delivery addresses</p>
                                </div>
                                <button
                                    onClick={() => setIsAddressModalOpen(true)}
                                    className="px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 flex items-center gap-2"
                                >
                                    <Plus size={14} /> Add Address
                                </button>
                            </div>

                            {formData.savedAddresses.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3">
                                    {formData.savedAddresses.map((addr, idx) => (
                                        <div key={idx} className={`p-3 border rounded flex justify-between items-start group transition-all ${addr.isDefault ? 'border-yellow-300 bg-yellow-50/60' : 'border-slate-100 bg-slate-50'}`}>
                                            <div className="flex items-start gap-2">
                                                <MapPin size={14} className={`mt-0.5 flex-shrink-0 ${addr.isDefault ? 'text-yellow-500' : 'text-slate-400'}`} />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-bold text-sm text-slate-700">{addr.name}</div>
                                                        {addr.isDefault && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-yellow-400 text-slate-900 rounded">
                                                                ★ Default
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500">{addr.address1}, {addr.city}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!addr.isDefault && (
                                                    <button
                                                        onClick={() => handleSetDefaultAddress(idx)}
                                                        title="Set as Default"
                                                        className="p-1.5 text-slate-400 hover:text-yellow-500 rounded hover:bg-yellow-50 flex items-center gap-1 text-xs font-medium"
                                                    >
                                                        ☆ Default
                                                    </button>
                                                )}
                                                <button onClick={() => { setEditingAddressIdx(idx); setIsAddressModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"><Edit size={14} /></button>
                                                <button onClick={() => handleDeleteAddress(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 border-t border-slate-50 pt-6">
                                    <div className="text-slate-200 mb-3">
                                        <MapPin size={48} strokeWidth={1} />
                                    </div>
                                    <p className="text-sm text-slate-500 mb-1">No shipping addresses added yet</p>
                                    <p
                                        className="text-xs text-slate-400 cursor-pointer hover:underline"
                                        onClick={() => setIsAddressModalOpen(true)}
                                    >
                                        Click "Add Address" to create one
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'opening':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[350px]">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <DollarSign className="text-[#F5C742]" size={18} />
                                        <h3 className="text-sm font-semibold text-slate-700">Opening Balance</h3>
                                    </div>
                                    <p className="text-xs text-slate-400">Track opening invoices and balances</p>
                                </div>
                                <button
                                    onClick={() => setIsInvoiceModalOpen(true)}
                                    className="px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 flex items-center gap-2"
                                >
                                    <Plus size={14} /> Add Invoice
                                </button>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex justify-between items-center mb-8">
                                <span className="text-sm font-medium text-blue-800">Total Opening Balance</span>
                                <span className="text-xl font-bold text-blue-700">
                                    <CurrencyAmount value={formData.openingInvoices.reduce((acc, curr) => acc + getOpeningInvoiceOutstanding(curr), 0)} currency={currency} />
                                </span>
                            </div>

                            {formData.openingInvoices.length > 0 ? (
                                <div className="space-y-2">
                                    {formData.openingInvoices.map((inv, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 border border-slate-100 rounded text-sm group">
                                            <div>
                                                <div className="font-bold text-slate-700">{inv.number}</div>
                                                <div className="text-xs text-slate-400">{formatDisplayDate(inv.date)}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CurrencyAmount value={getOpeningInvoiceOutstanding(inv)} currency={currency} className="font-mono text-slate-800" />
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingInvoiceIdx(idx); setIsInvoiceModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"><Edit size={14} /></button>
                                                    <button onClick={() => handleDeleteInvoice(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <div className="text-slate-200 mb-4">
                                        <FileText size={48} strokeWidth={1} />
                                    </div>
                                    <p className="text-sm text-slate-500 mb-1">No opening invoices added</p>
                                    <p
                                        className="text-xs text-slate-400 cursor-pointer hover:underline"
                                        onClick={() => setIsInvoiceModalOpen(true)}
                                    >
                                        Click "Add Invoice" to create one
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'documents':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[300px]">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <FileText className="text-[#F5C742]" size={18} />
                                        <h3 className="text-sm font-semibold text-slate-700">Documents</h3>
                                    </div>
                                    <p className="text-xs text-slate-400">Upload and manage customer documents (Max 2MB, PDF only)</p>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="file"
                                        ref={docInputRef}
                                        className="hidden"
                                        accept="application/pdf"
                                        onChange={handleDocumentUpload}
                                    />
                                    <button
                                        onClick={() => docInputRef.current?.click()}
                                        className="px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 flex items-center gap-2"
                                    >
                                        <Upload size={14} /> Upload Document
                                    </button>
                                </div>
                            </div>

                            {formData.documents.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3">
                                    {formData.documents.map((doc, idx) => (
                                        <div key={idx} className="p-3 border border-slate-100 rounded bg-slate-50 flex justify-between items-center group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-red-100 rounded text-red-500">
                                                    <FileText size={20} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-slate-700">{doc.name}</div>
                                                    <div className="text-xs text-slate-500">{doc.size} • {formatDisplayDate(doc.date)}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {/* View/Download Button */}
                                                <a
                                                    href={doc.fileContent}
                                                    download={doc.name}
                                                    className="text-slate-400 hover:text-blue-600 p-2 opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Download"
                                                >
                                                    <Download size={16} />
                                                </a>
                                                {/* Delete Button */}
                                                <button
                                                    onClick={() => deleteDocument(idx)}
                                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 border-t border-slate-50 pt-6">
                                    <div className="text-slate-200 mb-4">
                                        <FileText size={48} strokeWidth={1} />
                                    </div>
                                    <p className="text-sm text-slate-500 mb-1">No documents uploaded yet</p>
                                    <p
                                        className="text-xs text-slate-400 cursor-pointer hover:underline"
                                        onClick={() => docInputRef.current?.click()}
                                    >
                                        Click "Upload Document" to add one
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'persons':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[300px]">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <UserPlus className="text-[#F5C742]" size={18} />
                                        <h3 className="text-sm font-semibold text-slate-700">Contact Persons</h3>
                                    </div>
                                    <p className="text-xs text-slate-400">Manage key contact persons</p>
                                </div>
                                <button
                                    onClick={() => setIsContactModalOpen(true)}
                                    className="px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 flex items-center gap-2"
                                >
                                    <Plus size={14} /> Add Contact
                                </button>
                            </div>

                            {formData.contactPersons.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {formData.contactPersons.map((person, idx) => (
                                        <div key={idx} className="p-4 border border-slate-200 rounded-lg hover:shadow-sm transition-shadow bg-white group">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-sm">{person.name}</h4>
                                                    <p className="text-xs text-slate-500">{person.designation || 'No Designation'}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {person.isAccountContact && (
                                                        <div className="bg-yellow-50 text-yellow-700 text-[10px] px-2 py-0.5 rounded border border-yellow-200 font-medium">
                                                            Accounts
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                                                        <button onClick={() => { setEditingContactIdx(idx); setIsContactModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"><Edit size={13} /></button>
                                                        <button onClick={() => handleDeleteContact(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 size={13} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-1 mt-3">
                                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                                    <Phone size={12} className="text-slate-400" /> {person.phone}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                                    <Mail size={12} className="text-slate-400" /> {person.email || '-'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 border-t border-slate-50 pt-6">
                                    <div className="text-slate-200 mb-4">
                                        <UserPlus size={48} strokeWidth={1} />
                                    </div>
                                    <p className="text-sm text-slate-500 mb-1">No contact persons added yet</p>
                                    <p
                                        className="text-xs text-slate-400 cursor-pointer hover:underline"
                                        onClick={() => setIsContactModalOpen(true)}
                                    >
                                        Click "Add Contact" to create one
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'photo':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[400px]">
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <ImageIcon className="text-[#F5C742]" size={18} />
                                    <h3 className="text-sm font-semibold text-slate-700">Customer Photo</h3>
                                </div>
                                <p className="text-xs text-slate-400">Upload customer photo for identification <span className="text-slate-400">(Optional)</span></p>
                            </div>

                            <div className="flex flex-col items-center justify-center py-6 border-t border-slate-50 pt-10">
                                {/* Hidden File Input */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleAvatarFileChange}
                                    accept="image/png, image/jpeg, image/jpg"
                                    className="hidden"
                                />

                                {/* Camera View */}
                                {isCameraOpen ? (
                                    <div className="flex flex-col items-center gap-4 mb-4">
                                        <div className="w-64 h-64 bg-black rounded-lg overflow-hidden relative border-2 border-[#F5C742]">
                                            {/* Video element */}
                                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                                            <canvas ref={canvasRef} className="hidden"></canvas>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={capturePhoto} className="px-4 py-2 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 flex items-center gap-2">
                                                <Camera size={16} /> Capture
                                            </button>
                                            <button onClick={stopCamera} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-md hover:bg-slate-300">
                                                Cancel
                                            </button>
                                        </div>
                                        {cameraError && <p className="text-xs text-red-500 mt-2">{cameraError}</p>}
                                    </div>
                                ) : (
                                    /* Image Preview or Placeholder */
                                    <div className="flex flex-col items-center gap-4">
                                        <div className={`w-48 h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center bg-slate-50 overflow-hidden relative group transition-colors ${!avatarPreview ? 'border-red-200' : 'border-slate-200 hover:border-[#F5C742]'}`}>
                                            {avatarPreview ? (
                                                <>
                                                    <img src={avatarPreview} alt="Customer Preview" className="w-full h-full object-cover" />
                                                    <button
                                                        onClick={removePhoto}
                                                        className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                                                        title="Remove Photo"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <ImageIcon className="text-slate-300 mb-2" size={48} strokeWidth={1} />
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase">Optional</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-3 mt-2">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="px-4 py-2 bg-[#F5C742] text-slate-900 text-sm font-bold rounded-md hover:bg-yellow-400 flex items-center gap-2 shadow-sm"
                                            >
                                                <Upload size={16} /> Upload Photo
                                            </button>
                                            <button
                                                onClick={startCamera}
                                                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-50 flex items-center gap-2"
                                            >
                                                <Camera size={16} /> Take Photo
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">Recommended: Square image, min 400x400px</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );

            case 'notes':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[300px]">
                            <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                                <File className="text-[#F5C742]" size={18} />
                                <h3 className="text-sm font-semibold text-slate-700">Notes & Tags</h3>
                                <span className="text-xs text-slate-400 ml-auto">Additional information and classification</span>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Notes</label>
                                    <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows="3" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] resize-none"></textarea>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-2">Customer Tags</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['VIP', 'Frequent Buyer', 'Discount Allowed', 'Wholesaler', 'High Return Rate', 'Fraud Watchlist'].map(tag => (
                                            <span key={tag} className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-600 cursor-pointer hover:bg-slate-200 border border-slate-200">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'activity':
                return (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[300px]">
                            <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                                <History className="text-[#F5C742]" size={18} />
                                <h3 className="text-sm font-semibold text-slate-700">Activity Log</h3>
                                <span className="text-xs text-slate-400 ml-auto">Complete history of all changes</span>
                            </div>

                            {customerToEdit ? (
                                <div className="pl-2">
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center border border-yellow-100">
                                                <Clock size={14} className="text-yellow-600" />
                                            </div>
                                        </div>
                                        <div className="flex-1 pb-8">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="text-sm font-semibold text-slate-800">Customer Record</h4>
                                                    <p className="text-xs text-slate-500 mt-0.5">{customerToEdit.name} ({customerToEdit.code})</p>
                                                    {customerToEdit.salesman && (
                                                        <p className="text-[10px] text-slate-400 mt-1">Salesman: {customerToEdit.salesman}</p>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-slate-400">{customerToEdit.status || 'Active'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <History size={32} className="mb-3 opacity-30" />
                                    <p className="text-sm">No activity recorded yet</p>
                                    <p className="text-xs mt-1">Activity will appear here once the customer is saved</p>
                                </div>
                            )}

                        </div>
                    </div>
                );

            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">

            {/* Nested Modals */}
            <AddAddressModal isOpen={isAddressModalOpen} onClose={() => { setIsAddressModalOpen(false); setEditingAddressIdx(null); }} onSave={handleSaveAddress} initialData={editingAddressIdx !== null ? formData.savedAddresses[editingAddressIdx] : null} />
            <AddInvoiceModal isOpen={isInvoiceModalOpen} onClose={() => { setIsInvoiceModalOpen(false); setEditingInvoiceIdx(null); }} onSave={handleSaveInvoice} initialData={editingInvoiceIdx !== null ? formData.openingInvoices[editingInvoiceIdx] : null} />
            <AddContactModal isOpen={isContactModalOpen} onClose={() => { setIsContactModalOpen(false); setEditingContactIdx(null); }} onSave={handleSaveContact} initialData={editingContactIdx !== null ? formData.contactPersons[editingContactIdx] : null} />

            <div className="bg-[#F7F7FA] w-full h-full md:w-[98%] md:h-[98%] md:rounded-lg shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <div>
                        <div className="text-xs text-slate-500 mb-1">Customer Ledger  {customerToEdit ? 'Edit Customer' : 'New Customer'}</div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Users className="text-[#F5C742]" size={24} />
                            {customerToEdit ? 'Edit Customer' : 'New Customer'}
                        </h2>
                        <p className="text-xs text-slate-500">Create a new customer with complete details</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                            <X size={16} /> Cancel
                        </button>
                        <button
                            onClick={handleMainSave}
                            disabled={!isFormValid}
                            className={`px-6 py-2 rounded-md text-sm font-bold shadow-sm flex items-center gap-2 transition-colors ${isFormValid
                                ? 'bg-[#F5C742] text-slate-900 hover:bg-yellow-400'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                }`}
                            title={!isFormValid ? "Please complete all required fields" : "Save Customer"}
                        >
                            <Save size={16} /> Save
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                    {/* Sidebar Navigation */}
                    <div className="w-full lg:w-64 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto p-4 custom-scrollbar">
                        <div className="space-y-1">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-md transition-colors ${activeTab === item.id
                                        ? 'bg-[#F5C742] text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                        }`}
                                >
                                    <item.icon size={16} className={activeTab === item.id ? 'text-slate-900' : 'text-slate-400'} />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#F7F7FA]">
                        <div className="max-w-4xl mx-auto">
                            {renderContent()}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// ==========================================
// 5. NEW VIEWS (Receive Money, SoA, Debtors)
// ==========================================

const ReceiveMoneyView = () => {
    const { company } = useCompany();
    const { branches: availableBranches, activeBranch } = useBranch();
    const currency = company?.currency || 'AED';
    const [isLoading, setIsLoading] = useState(false);
    const [isReceiptPrinting, setIsReceiptPrinting] = useState(false);

    // Data States
    const [customers, setCustomers] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [payments, setPayments] = useState([]);
    const [salesSettings, setSalesSettings] = useState(null);
    const paymentAutoNumbering = isAutoNumberingEnabled(salesSettings, 'SALES_PAYMENT');

    // Form States
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [nextPaymentNo, setNextPaymentNo] = useState('');

    // ✅ NEW: Received Amount & Cheque Date
    const [receivedAmount, setReceivedAmount] = useState('');
    const [chequeDate, setChequeDate] = useState('');
    const [bankAccount, setBankAccount] = useState('');
    const [lastSavedPayment, setLastSavedPayment] = useState(null);
    // QA-040: Send-Email modal state for Receipt Voucher
    const [isReceiptEmailOpen, setIsReceiptEmailOpen] = useState(false);
    const [bankAccounts, setBankAccounts] = useState([]);

    // Selection & Settlement States
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedInvoices, setSelectedInvoices] = useState({}); // Map: invoiceNo -> boolean
    const [settleAmounts, setSettleAmounts] = useState({}); // Map: invoiceNo -> amount

    // QA-002: opening invoices for the selected customer
    const [openingInvoices, setOpeningInvoices] = useState([]);

    // Load Data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [custData, invData, paymentData, nextNo, settingsData] = await Promise.all([
                getAllCustomers(),
                getAllSalesInvoices(),
                getAllSalesPayments(),
                getNextSalesPaymentNumber().catch(() => ''),
                getSalesSettings().catch(() => null)
            ]);

            setCustomers(custData || []);
            setInvoices(invData || []);
            setPayments(paymentData || []);
            if (settingsData) setSalesSettings(settingsData);
            setNextPaymentNo(settingsData && !isAutoNumberingEnabled(settingsData, 'SALES_PAYMENT') ? '' : nextNo);
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setIsLoading(false);
        }
        getBankAccounts().then(data => setBankAccounts(Array.isArray(data) ? data : [])).catch(() => {});
    };

    // Filtered Data
    const customerInvoices = useMemo(() => {
        if (!selectedCustomer) return [];

        // Regular sales invoices with outstanding balance
        const salesInvs = invoices
            .filter(inv =>
                inv.customerCode === selectedCustomer.code &&
                (inv.balance > 0 || !inv.amountPaid || inv.amountPaid < inv.invoiceTotal)
            )
            .map(inv => ({ ...inv, _isOpening: false }));

        // QA-002: opening invoices mapped to the same shape as sales invoices
        const openingInvs = openingInvoices
            .filter(oi => {
                const outstanding = getOpeningInvoiceOutstanding(oi);
                return outstanding > 0;
            })
            .map(oi => {
                const amount = getOpeningInvoiceOriginalAmount(oi);
                const outstanding = getOpeningInvoiceOutstanding(oi);
                return {
                    id: `opening-${oi.id}`,
                    invoiceNumber: oi.number,
                    invoiceDate: oi.date,
                    customerCode: selectedCustomer.code,
                    invoiceTotal: amount,
                    amountPaid: amount - outstanding,
                    balance: outstanding,
                    status: 'OPENING',
                    _isOpening: true,
                };
            });

        return [...openingInvs, ...salesInvs];
    }, [selectedCustomer, invoices, openingInvoices]);

    const customerPayments = useMemo(() => {
        if (!selectedCustomer) return payments.slice(0, 10);
        return payments.filter(p => p.customerCode === selectedCustomer.code).slice(0, 20);
    }, [selectedCustomer, payments]);

    const customerBalance = useMemo(() => {
        return customerInvoices.reduce((sum, inv) => sum + ((inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0)))), 0);
    }, [customerInvoices]);

    const totalToSettle = useMemo(() => {
        return Object.keys(selectedInvoices).reduce((sum, invoiceNo) => {
            if (selectedInvoices[invoiceNo]) {
                return sum + (parseFloat(settleAmounts[invoiceNo]) || 0);
            }
            return sum;
        }, 0);
    }, [selectedInvoices, settleAmounts]);

    // Handlers
    const handleSelectCustomer = async (custCode) => {
        const cust = customers.find(c => c.code === custCode);
        setSelectedCustomer(cust || null);
        setSelectedInvoices({});
        setSettleAmounts({});
        setOpeningInvoices([]);

        // QA-002: fetch opening invoices for this customer so they appear in the outstanding list
        if (cust) {
            try {
                const data = await getOpeningInvoicesByCustomerCode(cust.code);
                setOpeningInvoices(data || []);
            } catch (err) {
                console.error('Failed to load opening invoices:', err);
                setOpeningInvoices([]);
            }
        }
    };

    const handleInvoiceSelection = (inv, isSelected) => {
        const newSelected = { ...selectedInvoices, [inv.invoiceNumber]: isSelected };
        setSelectedInvoices(newSelected);

        if (isSelected) {
            setSettleAmounts(prev => ({
                ...prev,
                [inv.invoiceNumber]: (inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0)))
            }));
        } else {
            const newAmounts = { ...settleAmounts };
            delete newAmounts[inv.invoiceNumber];
            setSettleAmounts(newAmounts);
        }
    };

    const handleSelectAll = (e) => {
        const isSelected = e.target.checked;
        const newSelected = {};
        const newAmounts = {};

        if (isSelected) {
            customerInvoices.forEach(inv => {
                newSelected[inv.invoiceNumber] = true;
                newAmounts[inv.invoiceNumber] = (inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0)));
            });
        }

        setSelectedInvoices(newSelected);
        setSettleAmounts(newAmounts);
    };

    const handleSettleAmountChange = (invoiceNo, value, maxAmount) => {
        let val = parseFloat(value) || 0;
        if (val > maxAmount) val = maxAmount;
        if (val < 0) val = 0;

        setSettleAmounts(prev => ({
            ...prev,
            [invoiceNo]: val
        }));
    };

    // ✅ NEW: Auto-Allocation Logic
    const handleAutoAllocate = (amount) => {
        const totalReceived = parseFloat(amount) || 0;
        setReceivedAmount(amount);

        if (totalReceived <= 0) {
            setSettleAmounts({});
            setSelectedInvoices({});
            return;
        }

        let remaining = totalReceived;
        const newSettleAmounts = {};
        const newSelectedInvoices = {};

        // Sort by Due Date ascending (closest/soonest due date first — pay most urgent first), nulls last
        const sortedInvoices = [...customerInvoices].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });

        for (const inv of sortedInvoices) {
            if (remaining <= 0) break;

            const balance = (inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0)));
            const allocateAmount = Math.min(remaining, balance);

            newSettleAmounts[inv.invoiceNumber] = allocateAmount;
            newSelectedInvoices[inv.invoiceNumber] = true;
            remaining -= allocateAmount;
        }

        setSettleAmounts(newSettleAmounts);
        setSelectedInvoices(newSelectedInvoices);
    };

    const handleSavePayment = async () => {
        if (!selectedCustomer) return alert("Please select a customer.");
        if (totalToSettle <= 0) return alert("Please select invoices to settle.");

        try {
            setIsLoading(true);
            const invoicesToPay = Object.keys(selectedInvoices).filter(k => selectedInvoices[k]);
            if (!paymentAutoNumbering && !nextPaymentNo.trim()) {
                alert("Please enter a receipt number.");
                return;
            }
            if (!paymentAutoNumbering && invoicesToPay.length > 1) {
                alert("Manual receipt numbering supports one settlement at a time. Please save one invoice, then enter the next receipt number.");
                return;
            }

            // Generate a separate payment record for each selected invoice
            // This loop mimics "settling multiple" by creating individual backend records
            // since the backend might expect 1:1 payment-invoice mapping.
            let lastSavedPayment = null;

            for (const invNo of invoicesToPay) {
                const amount = settleAmounts[invNo];
                const inv = customerInvoices.find(i => i.invoiceNumber === invNo);
                if (!inv || amount <= 0) continue;

                const balance = (inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0)));
                let status = 'COMPLETED';
                if (amount < balance) status = 'PARTIAL';

                const payload = {
                    paymentNumber: paymentAutoNumbering ? null : nextPaymentNo.trim(),
                    paymentDate: paymentDate,
                    paymentType: 'RECEIVED',
                    customerCode: selectedCustomer.code,
                    customerName: selectedCustomer.name,
                    linkedInvoice: invNo,
                    invoiceAmount: inv.invoiceTotal,
                    invoiceBalance: balance,
                    amount: amount,
                    paymentMode: paymentMode,
                    referenceNumber: referenceNo,
                    bankName: paymentMode !== 'Cash' ? bankAccount : null,
                    notes: notes,
                    status: status,
                    chequeDate: paymentMode === 'Cheque' ? chequeDate : null
                };

                lastSavedPayment = await saveSalesPayment(payload);
            }
            if (lastSavedPayment?.paymentNumber) {
                setNextPaymentNo(lastSavedPayment.paymentNumber);
            }
            setLastSavedPayment(lastSavedPayment);

            alert("Payments recorded successfully!");

            // Reset
            await loadData();
            if (selectedCustomer?.code) {
                const refreshedOpeningInvoices = await getOpeningInvoicesByCustomerCode(selectedCustomer.code);
                setOpeningInvoices(refreshedOpeningInvoices || []);
            }
            setSelectedInvoices({});
            setSettleAmounts({});
            setReferenceNo('');
            setNotes('');
            setReceivedAmount('');
            setChequeDate('');
            setBankAccount('');

        } catch (error) {
            console.error("Error saving payments:", error);
            const message = error?.response?.data?.message || error?.response?.data || "Failed to save payments.";
            alert(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrintReceipt = async () => {
        if (!lastSavedPayment) {
            toast.error("Please record a payment first, then print the receipt.");
            return;
        }

        const loadingToast = toast.loading('Preparing receipt print layout...');
        setIsReceiptPrinting(true);

        try {
            const templates = await getTemplatesByCategory('Receipt Voucher').catch(() => []);
            const template = resolveReceiptVoucherPrintTemplate(templates);
            const receiptForPrint = {
                ...lastSavedPayment,
                customerCode: lastSavedPayment.customerCode || selectedCustomer?.code,
                customerName: lastSavedPayment.customerName || selectedCustomer?.name,
            };
            const printData = buildReceiptVoucherPrintData(receiptForPrint, selectedCustomer, company);
            const html = await generatePrintHtmlAsync(template, printData, {
                companyProfile: buildDocumentHeaderProfile({
                    company,
                    branches: availableBranches || [],
                    branchId: lastSavedPayment?.branchId ?? activeBranch?.id,
                }),
                billBullLogo,
            });
            printHtml(html);
        } catch (err) {
            console.error('Failed to print receipt', err);
            toast.error(err?.response?.data?.message || err?.message || 'Failed to generate receipt print layout');
        } finally {
            toast.dismiss(loadingToast);
            setIsReceiptPrinting(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {/* LEFT COLUMN - MAIN FORM & TABLE (66%) */}
            <div className="lg:col-span-2 space-y-6">

                {/* 1. Customer Selection & Balance Card */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Customer <span className="text-red-500">*</span></label>
                    <div className="mb-6">
                        <SearchableDropdown
                            options={customers.map(c => ({
                                value: c.code,
                                label: `${c.code} - ${c.name}`,
                                subtitle: c.phone || 'No Phone'
                            }))}
                            value={selectedCustomer?.code || ''}
                            onChange={(val) => handleSelectCustomer(val)}
                            placeholder="Search or Select Customer..."
                            className="w-full"
                        />
                    </div>

                    {selectedCustomer && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-100 p-2.5 rounded-full text-blue-600">
                                    <DollarSign size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-blue-800">Outstanding Balance</p>
                                    <CurrencyAmount value={customerBalance} currency={currency} className="text-2xl font-bold text-blue-600" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Outstanding Invoices Table */}
                {selectedCustomer && (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-yellow-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <FileText size={16} className="text-yellow-600" /> Outstanding Invoices
                                </h3>
                                <p className="text-xs text-slate-500">Select invoices to settle in this payment</p>
                            </div>
                            <button
                                onClick={(e) => { e.target.checked = true; handleSelectAll(e); }}
                                className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
                            >
                                Select All
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500" /></th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice No</th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase">Invoice Date</th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase">Due Date</th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Invoice Amount</th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right">Outstanding</th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-center">Status</th>
                                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right w-40">Amount to Settle</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {customerInvoices.length > 0 ? (
                                        customerInvoices.map(inv => {
                                            const balance = (inv.balance != null ? inv.balance : (inv.invoiceTotal - (inv.amountPaid || 0)));
                                            const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();

                                            return (
                                                <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${selectedInvoices[inv.invoiceNumber] ? 'bg-yellow-50/50' : ''}`}>
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!selectedInvoices[inv.invoiceNumber]}
                                                            onChange={(e) => handleInvoiceSelection(inv, e.target.checked)}
                                                            className="rounded border-slate-300 text-yellow-500 focus:ring-yellow-500 w-4 h-4 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-700">{inv.invoiceNumber}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDisplayDate(inv.invoiceDate)}</td>
                                                    <td className="px-4 py-3 text-xs">
                                                        <span className={isOverdue ? "text-red-500 font-bold" : "text-slate-500"}>{formatDisplayDate(inv.dueDate)}</span>
                                                        {isOverdue && <span className="block text-[9px] text-red-400">Overdue</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-medium"><CurrencyAmount value={inv.invoiceTotal} currency={currency} /></td>
                                                    <td className="px-4 py-3 text-right font-bold text-orange-600"><CurrencyAmount value={balance} currency={currency} /></td>
                                                    <td className="px-4 py-3 text-center">
                                                        {inv._isOpening
                                                            ? <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">Opening</span>
                                                            : isOverdue
                                                                ? <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">Overdue</span>
                                                                : <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">Current</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {selectedInvoices[inv.invoiceNumber] ? (
                                                            <input
                                                                type="number"
                                                                value={settleAmounts[inv.invoiceNumber] || ''}
                                                                onChange={(e) => handleSettleAmountChange(inv.invoiceNumber, e.target.value, balance)}
                                                                className="w-full text-right text-xs font-bold border border-slate-300 rounded px-2 py-1.5 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
                                                                placeholder="0.00"
                                                            />
                                                        ) : (
                                                            <button
                                                                onClick={() => handleInvoiceSelection(inv, true)}
                                                                className="text-xs text-yellow-600 font-bold hover:underline"
                                                            >
                                                                Settle Full
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="8" className="px-4 py-12 text-center text-slate-400">
                                                <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                                                No outstanding invoices found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT COLUMN - PAYMENT DETAILS & HISTORY (33%) */}
            <div className="space-y-6">

                {/* 3. Payment Details Card */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[#F5C742]"></div>
                    <div className="p-5">
                        <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Wallet className="text-[#F5C742]" size={18} /> Payment Entry
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Receipt Date <span className="text-red-500">*</span></label>
                                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                            </div>

                            {/* ✅ NEW: Received Amount Input */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Received Amount (Auto-Allocate) <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs"><CurrencySymbol currency={currency} /></span>
                                    <input
                                        type="number"
                                        value={receivedAmount}
                                        onChange={(e) => handleAutoAllocate(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-10 pr-3 py-2 text-sm font-bold border border-slate-200 rounded focus:border-[#F5C742] outline-none"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Entering amount automatically selects oldest invoices.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Receipt No.</label>
                                    <input
                                        type="text"
                                        value={nextPaymentNo}
                                        onChange={(e) => setNextPaymentNo(e.target.value)}
                                        readOnly={paymentAutoNumbering}
                                        placeholder={paymentAutoNumbering ? 'Auto generated' : 'Enter receipt number'}
                                        className="w-full text-xs border border-slate-200 rounded px-3 py-2 text-slate-700 read-only:bg-slate-50 read-only:text-slate-500 focus:outline-none focus:border-[#F5C742]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Method</label>
                                    <select value={paymentMode} onChange={(e) => { setPaymentMode(e.target.value); setBankAccount(''); }} className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white">
                                        <option>Cash</option>
                                        <option>Bank Transfer</option>
                                        <option>Cheque</option>
                                        <option>Card</option>
                                    </select>
                                </div>
                            </div>

                            {paymentMode !== 'Cash' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Bank Account <span className="text-red-500">*</span></label>
                                    <select value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none bg-white">
                                        <option value="">Select Bank Account...</option>
                                        {bankAccounts.map(acc => (
                                            <option key={acc.id} value={acc.name}>{acc.code} — {acc.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {paymentMode === 'Cheque' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Cheque Date <span className="text-red-500">*</span></label>
                                    <input
                                        type="date"
                                        value={chequeDate}
                                        onChange={(e) => setChequeDate(e.target.value)}
                                        className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Reference / Cheque No.</label>
                                <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="e.g. TXN-123456" className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                                <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter payment notes..." className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:border-yellow-400 outline-none resize-none"></textarea>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-sm font-bold text-slate-600">Total Settlement</span>
                                    <CurrencyAmount value={totalToSettle} currency={currency} className="text-xl font-bold text-[#F5C742]" />
                                </div>

                                <button
                                    onClick={handleSavePayment}
                                    disabled={isLoading || !selectedCustomer || totalToSettle <= 0}
                                    className={`w-full bg-[#F5C742] text-slate-900 font-bold py-3 rounded-md hover:bg-yellow-400 transition-colors shadow-sm flex items-center justify-center gap-2 ${isLoading || totalToSettle <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Save size={16} /> {isLoading ? 'Processing...' : 'Record Payment'}
                                </button>

                                <button
                                    onClick={handlePrintReceipt}
                                    disabled={!lastSavedPayment || isReceiptPrinting}
                                    className={`w-full mt-3 bg-white border border-slate-200 text-slate-600 font-bold py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-xs ${!lastSavedPayment || isReceiptPrinting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isReceiptPrinting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Printer size={14} />} {isReceiptPrinting ? 'Preparing...' : 'Print Receipt'}
                                </button>
                                <button
                                    onClick={() => setIsReceiptEmailOpen(true)}
                                    disabled={!lastSavedPayment}
                                    className={`w-full mt-2 bg-white border border-slate-200 text-slate-600 font-bold py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-xs ${!lastSavedPayment ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Mail size={14} /> Email Receipt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* QA-040: Send Receipt Voucher Email */}
                <SendDocumentEmailModal
                    isOpen={isReceiptEmailOpen}
                    onClose={() => setIsReceiptEmailOpen(false)}
                    category="Receipt Voucher"
                    docId={lastSavedPayment?.id}
                    docNumber={lastSavedPayment?.paymentNumber || lastSavedPayment?.voucherId}
                    customerEmail={selectedCustomer?.email || ''}
                    docLabel="Receipt Voucher"
                    companyProfile={company}
                    apiFn={sendReceiptVoucherEmail}
                    buildPayload={() => buildReceiptVoucherPrintData(lastSavedPayment, selectedCustomer, company)}
                />

                {/* 4. Recent Transactions Panel */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                    <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Recent Payments</h3>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {customerPayments.length > 0 ? (
                            customerPayments.map((payment, i) => (
                                <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-100 transition-colors">
                                    <div className="mt-0.5 min-w-[24px]">
                                        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                            <CheckCircle2 size={12} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="font-bold text-slate-800 text-xs truncate">{payment.customerName || 'Unknown'}</p>
                                            <CurrencyAmount value={payment.amount || 0} currency={currency} className="text-xs font-bold text-emerald-600 px-1.5 py-0.5 bg-emerald-50 rounded" />
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <p className="text-[10px] text-slate-500">{payment.paymentNumber} • {payment.mode}</p>
                                            <p className="text-[10px] text-slate-400">{payment.paymentDate}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 text-slate-400">
                                <FileText size={24} className="mx-auto mb-1 opacity-20" />
                                <p className="text-[10px]">No recent transactions</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

const CustomerSOAView = ({ customers = [] }) => {
    const { company } = useCompany();
    const { branches: availableBranches, activeBranch } = useBranch();
    const currency = company?.currency || 'AED';
    const defaultStartDate = `${new Date().getFullYear()}-01-01`;
    const defaultEndDate = new Date().toISOString().split('T')[0];

    const [selectedCustomerCode, setSelectedCustomerCode] = useState('');
    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [statementData, setStatementData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

    useEffect(() => {
        if (customers.length > 0 && !selectedCustomerCode) {
            setSelectedCustomerCode(customers[0].code);
        }
    }, [customers, selectedCustomerCode]);

    const handleGenerateStatement = async () => {
        if (!selectedCustomerCode || !startDate || !endDate) return;
        setIsLoading(true);
        try {
            const data = await fetchStatementOfAccount('CUSTOMER', selectedCustomerCode, startDate, endDate);
            setStatementData(data);
        } catch (error) {
            console.error("Failed to load SoA", error);
            setStatementData(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedCustomerCode) {
            handleGenerateStatement();
        }
    }, [selectedCustomerCode]);

    const handlePrint = async () => {
        if (!selectedCustomerCode || !startDate || !endDate) {
            toast.error('Select a customer and statement period first.');
            return;
        }

        const loadingToast = toast.loading('Preparing Customer SOA print layout...');
        setIsPrinting(true);

        try {
            const [freshStatement, templates] = await Promise.all([
                fetchStatementOfAccount('CUSTOMER', selectedCustomerCode, startDate, endDate),
                getTemplatesByCategory('Customer Statement of Account').catch(() => [])
            ]);
            setStatementData(freshStatement);

            const defaultTemplate = resolvePurchasePrintTemplate('Customer Statement of Account', templates);
            const printData = buildCustomerSoaPrintData(
                freshStatement,
                selectedCustomerDetails || { code: selectedCustomerCode },
                company,
                { startDate, endDate }
            );
            const html = await generatePrintHtmlAsync(defaultTemplate, printData, {
                companyProfile: buildDocumentHeaderProfile({
                    company,
                    branches: availableBranches || [],
                    branchId: activeBranch?.id,
                }),
                billBullLogo,
            });

            printHtml(html);
        } catch (error) {
            console.error('Failed to print Customer SOA', error);
            toast.error(error?.response?.data?.message || error?.message || 'Failed to generate Customer SOA print layout');
        } finally {
            toast.dismiss(loadingToast);
            setIsPrinting(false);
        }
    };

    const handleExportExcel = () => {
        if (!statementData) return;
        const filename = generateSOAFilename(
            selectedCustomerDetails?.name || 'Customer',
            selectedCustomerDetails?.code || selectedCustomerCode || 'N/A',
            startDate,
            endDate,
            currency
        );

        exportToExcel(mapStatementEntriesForExport(statementData), STATEMENT_EXPORT_COLUMNS, filename);
    };

    const selectedCustomerDetails = useMemo(
        () => customers.find((customer) => customer.code === selectedCustomerCode) || null,
        [customers, selectedCustomerCode]
    );

    return (
        <div className="space-y-6">
            {/* Filter & Action Bar */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm print:hidden">
                <h3 className="text-sm font-semibold text-[#F5C742] flex items-center gap-2 mb-4 uppercase tracking-wide">
                    <FileText className="h-4 w-4" /> Generate Statement of Account
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">Select Customer *</label>
                        <div className="relative">
                            <select
                                value={selectedCustomerCode}
                                onChange={(e) => setSelectedCustomerCode(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white">
                                {customers.map(c => (
                                    <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">From Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">To Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                        />
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={handleGenerateStatement} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-md shadow-sm flex items-center gap-2">
                        {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        Generate Statement
                    </button>
                    <button onClick={handlePrint} disabled={isPrinting || isLoading || !selectedCustomerCode} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-md shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isPrinting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
                    </button>
                    <button onClick={handleExportExcel} disabled={!statementData} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-md shadow-sm flex items-center gap-2 disabled:opacity-50">
                        <Download className="h-4 w-4" /> Export Excel
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Opening Balance</div>
                    <div className="text-xl font-bold text-slate-800">
                        <CurrencyAmount value={statementData?.openingBalance || 0} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Total Sales ({statementData?.entries?.filter(e => e.type === 'INVOICE').length || 0})</div>
                    <div className="text-xl font-bold text-green-600">
                        <CurrencyAmount value={statementData?.totalDebit || 0} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Closing Balance</div>
                    <div className="text-xl font-bold text-orange-600">
                        <CurrencyAmount value={statementData?.closingBalance || 0} currency={currency} />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden print:hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 font-semibold text-xs uppercase">Date</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase">Type</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase">Document No.</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase">Description</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase">Reference</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase text-right">Debit</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase text-right">Credit</th>
                            <th className="px-6 py-3 font-semibold text-xs uppercase text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading ? (
                            <tr>
                                <td colSpan="8" className="px-6 py-12 text-center text-slate-400">Loading statement...</td>
                            </tr>
                        ) : statementData && statementData.entries && statementData.entries.length > 0 ? (
                            statementData.entries.map((entry, idx) => (
                                <tr key={idx}>
                                    <td className="px-6 py-3 text-slate-600">{entry.transactionDate}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 border rounded text-[10px] ${entry.type === 'INVOICE' ? 'text-blue-600 bg-blue-50 border-blue-100' :
                                            (entry.type || '').includes('PAYMENT') ? 'text-green-600 bg-green-50 border-green-100' :
                                                entry.type === 'OPENING_BALANCE' ? 'text-orange-700 bg-orange-50 border-orange-100' :
                                                'text-slate-500 bg-slate-50'
                                            }`}>{formatStatementEntryType(entry.type)}</span>
                                    </td>
                                    <td className="px-6 py-3 text-slate-600">{entry.documentNo || '-'}</td>
                                    <td className="px-6 py-3 text-slate-600">{entry.description || formatStatementEntryType(entry.type)}</td>
                                    <td className="px-6 py-3 text-slate-500">{entry.reference || '-'}</td>
                                    <td className="px-6 py-3 text-right text-red-600">{entry.debit > 0 ? entry.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                                    <td className="px-6 py-3 text-right text-green-600">{entry.credit > 0 ? entry.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                                    <td className="px-6 py-3 text-right font-bold text-slate-800">{Math.abs(entry.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {entry.runningBalance >= 0 ? 'Dr' : 'Cr'}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="8" className="px-6 py-12 text-center text-slate-400">No transactions found for the selected period.</td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot className="bg-[#FFF8E6] font-bold text-slate-800">
                        <tr>
                            <td colSpan="5" className="px-6 py-3 text-right">Closing Balance</td>
                            <td className="px-6 py-3 text-right text-red-600">{statementData?.totalDebit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                            <td className="px-6 py-3 text-right text-green-600">{statementData?.totalCredit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                            <td className="px-6 py-3 text-right text-xl">{statementData?.closingBalance ? Math.abs(statementData.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} {statementData?.closingBalance >= 0 ? 'Dr' : 'Cr'}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <StatementPrintPreview
                statementData={statementData}
                party={selectedCustomerDetails}
                partyLabel="Customer"
                statementLabel="Statement of Account"
                startDate={startDate}
                endDate={endDate}
                debitSummaryLabel={`Total Sales (${statementData?.entries?.filter((entry) => entry.type === 'INVOICE').length || 0})`}
                creditSummaryLabel="Total Receipts"
                debitColumnLabel="Debit"
                creditColumnLabel="Credit"
                positiveBalanceLabel="Dr"
                negativeBalanceLabel="Cr"
                emptyMessage="No transactions found for the selected period."
            />
        </div>
    );
};

// ==========================================
// 6. SUB-COMPONENTS (Stats & Cards)
// ==========================================

const StatCard = ({ label, value, subtext, icon: Icon, bgClass, iconColor }) => (
    <div className={`bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between h-28 hover:shadow-md transition-shadow`}>
        <div className="flex flex-col justify-center h-full">
            <span className="text-xs font-medium text-slate-500 mb-2">{label}</span>
            <div className="text-2xl font-bold text-slate-800">{value}</div>
            {subtext && <div className="text-[10px] text-slate-400 mt-1">{subtext}</div>}
        </div>
        <div className={`w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center`}>
            <Icon className={iconColor} size={20} />
        </div>
    </div>
);

// ==========================================
// 7. MAIN PAGE COMPONENT
// ==========================================

const CustomerLedger = () => {
    const { company } = useCompany();
    const currency = company?.currency || 'AED';
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState(null);

    const [activeView, setActiveView] = useState("Customer List");
    const [viewingPhotoUrl, setViewingPhotoUrl] = useState(null);

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGroup, setFilterGroup] = useState('All Groups');
    const [filterStatus, setFilterStatus] = useState('All Status');

    // Customer Data State (Empty init, API fetch)
    const [customers, setCustomers] = useState([]);

    // Fetch Customers on Mount
    useEffect(() => {
        loadCustomers();
    }, []);

    const loadCustomers = async () => {
        try {
            const res = await getAllCustomers();

            // 🔥 SAFETY CHECK
            const data = Array.isArray(res) ? res : [];

            const formatted = data.map(c => ({
                ...c,
                group: c.groupType || 'Unassigned',
                status: c.status || 'Active',
                contact: c.mobile || c.phone || '',
                location: [c.city, c.country].filter(Boolean).join('\n'),
                balance: Number(c.balance || 0),
                totalSales: Number(c.totalSales || 0),
            }));

            setCustomers(formatted);
        } catch (err) {
            console.error("Failed to load customers", err);
            setCustomers([]); // 🔥 NEVER leave it undefined
        }
    };

    // ✅ Handle Save New Customer (Integrated with API)
    const handleSaveNewCustomer = async (customerData) => {
        try {
            await createCustomer(customerData);

            // 🔥 ALWAYS reload from database
            await loadCustomers();

            handleCloseModal();
        } catch (error) {
            console.error("Failed to save customer", error);
            alert("Customer not saved to database");
        }
    };

    // ✅ Handle Delete Customer
    const handleDeleteCustomer = async (id, name) => {
        if (window.confirm(`Are you sure you want to delete ${name}?`)) {
            try {
                await deleteCustomer(id);
                await loadCustomers();
            } catch (error) {
                console.error("Failed to delete", error);
                const msg = error.response?.data?.message || "Could not delete customer";
                alert(`Failed to delete customer.\n\n${msg}\n\nIf the customer has existing records, please deactivate them instead.`);
            }
        }
    }

    // ✅ Handle Edit Click
    const handleEditClick = async (customer) => {
        try {
            const data = await getCustomerById(customer.id);
            // The API returns the full customer details with nested arrays
            setCustomerToEdit(data);
            setIsAddModalOpen(true);
        } catch (error) {
            console.error("Failed to load full customer details", error);
            alert("Failed to load customer details. Opening with partial data.");
            setCustomerToEdit(customer);
            setIsAddModalOpen(true);
        }
    }

    // ✅ Handle Close Modal
    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        // Small delay to prevent UI flicker when resetting form
        setTimeout(() => {
            setCustomerToEdit(null);
        }, 300);
    }


    // Derived state for Filtering
    const filteredCustomers = useMemo(() => {
        return customers.filter(cust => {
            const search = searchTerm.toLowerCase();

            const matchesSearch =
                cust.name?.toLowerCase().includes(search) ||
                cust.code?.toLowerCase().includes(search) ||
                cust.email?.toLowerCase().includes(search) ||
                cust.contact?.toLowerCase().includes(search);

            const matchesGroup =
                filterGroup === 'All Groups' || cust.group === filterGroup;

            const matchesStatus =
                filterStatus === 'All Status' || cust.status === filterStatus;

            return matchesSearch && matchesGroup && matchesStatus;
        });
    }, [customers, searchTerm, filterGroup, filterStatus]);

    // Client-side pagination for the customer list.
    const LIST_PAGE_SIZE = 30;
    const [listPage, setListPage] = useState(0);
    useEffect(() => { setListPage(0); }, [searchTerm, filterGroup, filterStatus]);
    const pagedCustomers = useMemo(
        () => filteredCustomers.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
        [filteredCustomers, listPage]
    );


    // RENDER FUNCTION FOR ACTIVE VIEW
    const renderActiveView = () => {
        switch (activeView) {
            case 'Receive Money':
                return <ReceiveMoneyView />;
            case 'Customer SoA':
                return <CustomerSOAView customers={customers} />;

            case 'Customer List':
            default:
                return (
                    <div className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard label="Total Customers" value={customers.length} icon={Users} bgClass="bg-blue-50" iconColor="text-blue-500" />
                            <StatCard label="Active Customers" value={customers.filter(c => c.status === 'Active').length} icon={CheckCircle2} bgClass="bg-emerald-50" iconColor="text-emerald-500" />
                            <StatCard label="Total Receivables" value={<CurrencyAmount value={customers.reduce((acc, curr) => acc + (curr.balance || 0), 0)} currency={currency} />} icon={DollarSign} bgClass="bg-yellow-50" iconColor="text-yellow-600" />
                            <StatCard label="Credit Customers" value={customers.filter(c => c.group !== 'Cash').length} icon={CreditCard} bgClass="bg-orange-50" iconColor="text-orange-500" />
                        </div>

                        {/* Filters & Search */}
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by name, code, email, or mobile..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742] placeholder:text-slate-400"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <select
                                        value={filterGroup}
                                        onChange={(e) => setFilterGroup(e.target.value)}
                                        className="pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 appearance-none min-w-[140px] focus:outline-none focus:border-[#F5C742]"
                                    >
                                        <option>All Groups</option><option>Retail</option><option>Wholesale</option><option>VIP</option><option>Corporate</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 appearance-none min-w-[140px] focus:outline-none focus:border-[#F5C742]"
                                    >
                                        <option>All Status</option><option>Active</option><option>Inactive</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* Customer Table */}
                        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-4 font-semibold text-xs uppercase whitespace-nowrap text-center w-12">S.No.</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Code</th>
                                            <th className="px-2 py-4 font-semibold text-xs uppercase whitespace-nowrap text-center">Photo</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Customer Name</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Group</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Contact</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Location</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap text-right">Balance</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Credit Status</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap">Status</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase whitespace-nowrap text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredCustomers.length > 0 ? (
                                            pagedCustomers.map((cust, index) => (
                                                <tr key={cust.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-3 py-4 whitespace-nowrap text-xs font-mono text-slate-400 font-medium text-center align-top pt-5">{index + 1}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-slate-500 align-top pt-5">{cust.code}</td>

                                                    <td className="px-2 py-4 whitespace-nowrap align-top pt-4 text-center">
                                                        <div
                                                            className={`w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden mx-auto flex items-center justify-center ${cust.avatar ? 'cursor-pointer hover:border-[#F5C742]' : ''}`}
                                                            onClick={() => cust.avatar && setViewingPhotoUrl(cust.avatar)}
                                                        >
                                                            {cust.avatar ? (
                                                                <img src={cust.avatar} alt={cust.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <ImageIcon size={18} className="text-slate-300" />
                                                            )}
                                                        </div>
                                                    </td>

                                                    <td className="px-6 py-4 whitespace-nowrap align-top pt-4">
                                                        <div className="font-medium text-slate-800">{cust.name}</div>
                                                        {cust.localName && <div className="text-xs text-slate-400 font-arabic mt-0.5">{cust.localName}</div>}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap align-top pt-5">
                                                        <span className="px-2 py-1 rounded border border-slate-200 text-[10px] font-medium text-slate-600 bg-white">{cust.group}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap align-top pt-4">
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-600"><Phone size={12} className="text-slate-400" /> {cust.contact}</div>
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1"><Mail size={12} className="text-slate-400" /> {cust.email}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap align-top pt-4">
                                                        <div className="text-xs text-slate-700 leading-tight">{cust.location && cust.location.split('\n').map((line, i) => <div key={i}>{line}</div>)}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right align-top pt-4">
                                                        <div className="font-bold text-orange-500 text-xs"><CurrencyAmount value={cust.balance || 0} currency={currency} /></div>
                                                        {cust.totalSales > 0 && <div className="text-[10px] text-slate-400 mt-1">Total: <CurrencyAmount value={cust.totalSales} currency={currency} /></div>}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap align-top pt-5">
                                                        <span className={`flex w-fit items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cust.creditStatus === 'Good' ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-orange-100 text-orange-600 border-orange-200'}`}>
                                                            {cust.creditStatus === 'Good' && <CheckCircle2 size={10} />}{cust.creditStatus}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap align-top pt-5">
                                                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${cust.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{cust.status}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right align-top pt-4">
                                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleEditClick(cust)}
                                                                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteCustomer(cust.id, cust.name)}
                                                                className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="11" className="px-6 py-12 text-center text-slate-400 text-sm">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <Search size={32} strokeWidth={1.5} className="mb-2 text-slate-300" />
                                                        No customers found matching your filters.
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <PaginationFooter
                                    page={listPage}
                                    size={LIST_PAGE_SIZE}
                                    totalElements={filteredCustomers.length}
                                    totalPages={Math.ceil(filteredCustomers.length / LIST_PAGE_SIZE)}
                                    onPageChange={setListPage}
                                />
                            </div>
                            <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 bg-white">
                                <div>Showing {filteredCustomers.length} of {customers.length} customers</div>
                                <div className="text-slate-400 italic">Last updated: {new Date().toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                )
        }
    }


    return (
        <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative">

            {/* IMAGE VIEWER MODAL OVERLAY */}
            {viewingPhotoUrl && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setViewingPhotoUrl(null)}
                >
                    <div className="relative max-w-full max-h-full">
                        <img
                            src={viewingPhotoUrl}
                            alt="Customer Full View"
                            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain bg-white"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button
                            className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors"
                            onClick={() => setViewingPhotoUrl(null)}
                        >
                            <X size={32} />
                        </button>
                    </div>
                </div>
            )}

            {/* ADD CUSTOMER MODAL */}
            <AddCustomerModal
                isOpen={isAddModalOpen}
                onClose={handleCloseModal}
                customerToEdit={customerToEdit}
                onSaveCustomer={handleSaveNewCustomer}
            />

            <main className="flex-1 flex flex-col w-full">
                <div className="p-4 md:p-6 space-y-6">

                    {/* Header */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 print:hidden">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Customers & Sales  Customer Ledger</div>
                            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <Users className="text-[#F5C742]" size={28} />
                                Customer Ledger
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">Manage customers, receive payments, and view statements</p>
                        </div>

                        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                            <ExportDropdown
                                onExportExcel={() => exportToExcel(
                                    filteredCustomers.map((cust, index) => ({ ...cust, sNo: index + 1 })),
                                    CUSTOMER_COLUMNS,
                                    'Customers'
                                )}
                                onExportPdf={() => exportToPDF(
                                    filteredCustomers.map((cust, index) => ({ ...cust, sNo: index + 1 })),
                                    CUSTOMER_COLUMNS,
                                    'Customer List',
                                    'Customers'
                                )}
                            />
                            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                                <Upload size={16} /> Import
                            </button>
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm transition-colors"
                            >
                                <Plus size={16} /> Add New Customer
                            </button>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="bg-white border border-slate-200 rounded-lg p-1 inline-flex shadow-sm overflow-x-auto max-w-full print:hidden">
                        {[
                            { id: 'Customer List', icon: Users },
                            { id: 'Receive Money', icon: Wallet },
                            { id: 'Customer SoA', icon: FileText }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveView(tab.id)}
                                className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === tab.id ? 'bg-[#F5C742] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <tab.icon size={14} />
                                {tab.id}
                            </button>
                        ))}
                    </div>

                    {/* Dynamic Content Area */}
                    {renderActiveView()}

                </div>
            </main>
        </div>
    );
};

export default CustomerLedger;
