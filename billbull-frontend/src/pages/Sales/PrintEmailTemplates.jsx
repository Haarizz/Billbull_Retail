import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    Barcode,
    Check,
    ChevronRight,
    Copy,
    Download,
    Edit,
    FileText,
    Mail,
    Plus,
    Printer,
    Receipt,
    RefreshCw,
    RotateCcw,
    Settings,
    Trash2,
    Truck,
    Upload
} from "lucide-react";
import toast from "react-hot-toast";
import {
    createPrintTemplate,
    deletePrintTemplate,
    getPrintTemplates,
    updatePrintTemplate
} from "../../api/printTemplateApi";
import {
    DEFAULT_TEMPLATE_COLUMNS,
    DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
    sanitizeTemplateColumns,
    sanitizeTemplateDisplayOptions
} from "../../utils/printTemplateConfig";
import { DocumentTemplateDesigner } from "../Purchase/Templates/DocumentTemplateDesigner";
import { GRVTemplateDesigner } from "../Purchase/Templates/GRVTemplateDesigner";
import { PaymentReceiptDesigner } from "../Purchase/Templates/PaymentReceiptDesigner";
import {
    Badge,
    Button,
    Card,
    CardContent
} from "../Purchase/Templates/PurchaseTemplateUI";
import { InvoiceOverlayDesigner } from "./Templates/InvoiceOverlayDesigner";
import { PickListDesigner, defaultPickListSettings } from "./Templates/PickListDesigner";

const TEMPLATE_TYPES = [
    {
        id: "quotation",
        category: "Quotation",
        label: "Quotation",
        description: "Customer quotation template",
        designer: "document",
        docType: "quotation",
        icon: FileText
    },
    {
        id: "sales-order",
        category: "Sales Order (SO)",
        label: "Sales Order (SO)",
        description: "Sales order confirmation template",
        designer: "document",
        docType: "sales-order",
        icon: FileText
    },
    {
        id: "delivery-note",
        category: "Delivery Note (DO/DN)",
        label: "Delivery Note (DN)",
        description: "Delivery/dispatch note template",
        designer: "document",
        docType: "delivery-note",
        icon: Truck
    },
    {
        id: "pick-list",
        category: "Pick List",
        label: "Pick List",
        description: "Warehouse pick list grouped by location, with batch barcodes",
        designer: "pick-list",
        icon: Barcode
    },
    {
        id: "proforma-invoice",
        category: "Proforma Invoice (PI)",
        label: "Proforma Invoice (PI)",
        description: "Proforma invoice template",
        designer: "document",
        docType: "proforma-invoice",
        icon: FileText
    },
    {
        id: "sales-invoice",
        category: "Sales Invoice",
        label: "Sales Invoice",
        description: "Final sales invoice template",
        designer: "document",
        docType: "sales-invoice",
        icon: FileText
    },
    {
        id: "receipt",
        category: "Receipt Voucher",
        aliases: ["Payment Receipt", "Payment Voucher"],
        label: "Receipt Voucher",
        description: "Customer payment receipt voucher template",
        designer: "payment",
        icon: Receipt
    },
    {
        id: "credit-note",
        category: "Sales Return",
        aliases: ["Credit Note"],
        label: "Credit Note",
        description: "Credit note template",
        designer: "document",
        docType: "credit-note",
        icon: RotateCcw
    },
    {
        id: "grv",
        category: "Goods Return Voucher",
        label: "Goods Return (GRV)",
        description: "Goods return voucher template",
        designer: "grv",
        icon: RotateCcw
    }
];

const OVERLAY_TYPES = [
    {
        id: "sales-invoice-preprinted",
        category: "Sales Invoice - Pre-printed Form",
        label: "Pre-printed Form",
        description: "Upload pre-printed invoice stationery and position data fields for values-only printing",
        designer: "overlay",
        mode: "preprinted",
        parentType: "sales-invoice",
        icon: FileText
    },
    {
        id: "sales-invoice-letterhead",
        category: "Sales Invoice - Letterhead Print",
        label: "Letterhead Print",
        description: "Upload company letterhead and place invoice fields over the branded page",
        designer: "overlay",
        mode: "letterhead",
        parentType: "sales-invoice",
        icon: FileText
    }
];

const ALL_TYPES = [...TEMPLATE_TYPES, ...OVERLAY_TYPES];
const CATEGORY_SET = new Set(ALL_TYPES.flatMap((type) => [type.category, ...(type.aliases || [])]));

const typeMetaByType = (id) => ALL_TYPES.find((type) => type.id === id);
const typeMetaByCategory = (category) =>
    ALL_TYPES.find((type) => type.category === category || (type.aliases || []).includes(category));

const parseSettings = (raw) => {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

const formatDate = (template) => {
    const raw = template.updatedAt || template.updatedDate || template.modifiedDate || template.createdAt || template.createdDate;
    if (!raw) return "-";
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? String(raw).slice(0, 10) : parsed.toISOString().slice(0, 10);
};

const toApiOrientation = (value) => {
    const raw = String(value || "portrait").toLowerCase();
    return raw === "landscape" ? "Landscape" : "Portrait";
};

const categoryDefaultsForColumns = (typeId) => {
    const isReceipt = typeId === "receipt";
    const isPickList = typeId === "pick-list";
    const isDelivery = typeId === "delivery-note";
    const isOrder = typeId === "sales-order";
    const isInvoice = typeId === "sales-invoice";
    const isCredit = typeId === "credit-note";
    const isGRV = typeId === "grv";

    return {
        ...DEFAULT_TEMPLATE_COLUMNS,
        discount: !isReceipt && !isDelivery && !isPickList,
        tax: !isReceipt && !isOrder && !isDelivery && !isPickList,
        total: !isReceipt && !isDelivery && !isPickList,
        unitPrice: !isReceipt && !isDelivery && !isPickList,
        taxableAmount: isInvoice || isCredit || typeId === "quotation" || typeId === "proforma-invoice",
        barcode: isPickList,
        brand: false,
        taxPercent: isInvoice || isCredit,
        discountPercent: false,
        location: isPickList,
        batchNumber: isPickList || isGRV,
        batchBarcode: isPickList,
        expiry: isPickList,
        quotationNo: isDelivery || isInvoice || isPickList,
        salesOrderNo: isDelivery || isInvoice || isPickList,
        salesInvoiceNo: isDelivery || isPickList
    };
};

const defaultTermsFor = (typeId) => {
    switch (typeId) {
        case "quotation":
            return "1. This quotation is valid for 30 days from the date of issue.\n2. Prices are subject to change without prior notice.\n3. Delivery is subject to stock availability.";
        case "sales-order":
            return "1. This sales order is subject to final stock allocation.\n2. Any cancellation must be approved before dispatch.\n3. Delivery terms apply as agreed with the customer.";
        case "delivery-note":
            return "1. Goods received in good condition.\n2. Any discrepancies must be reported within 24 hours.\n3. Please sign and stamp this document on receipt.";
        case "proforma-invoice":
            return "1. This proforma invoice is not a final tax invoice.\n2. Goods will be dispatched after payment confirmation.\n3. Prices are valid for 15 days unless otherwise stated.";
        case "sales-invoice":
            return "Payment is due within the agreed credit terms. Please use the invoice number as your payment reference.";
        case "credit-note":
            return "This credit note is issued against the referenced sales transaction and may be applied against outstanding invoices or carried forward on the customer account.";
        case "grv":
            return "Returned goods are held in quarantine pending QC sign-off. Credit will be issued after inspection and approval.";
        case "receipt":
            return "Received with thanks the amount stated above. This receipt is valid after cheque or bank-transfer clearance.";
        case "pick-list":
            return "Pick the items from the indicated bin or location. Scan batch barcodes where applicable before dispatch.";
        default:
            return "Terms and conditions apply.";
    }
};

const defaultSettingsFor = (typeId, name) => {
    const meta = typeMetaByType(typeId);
    const baseName = name || `Default ${meta?.label || "Sales"} Template`;

    if (typeId === "pick-list") {
        return defaultPickListSettings(baseName);
    }

    const isOverlay = meta?.designer === "overlay";
    const isReceipt = typeId === "receipt";
    const isPickLike = typeId === "pick-list";
    const isDelivery = typeId === "delivery-note";
    const isInvoice = typeId === "sales-invoice" || typeId === "proforma-invoice";
    const isCredit = typeId === "credit-note";

    if (isOverlay) {
        return {
            templateName: baseName,
            mode: meta.mode,
            paperSize: "A4",
            orientation: "portrait",
            printOnlyValues: meta.mode === "preprinted",
            showGrid: true,
            gridSize: 5,
            snapToGrid: true
        };
    }

    return {
        templateName: baseName,
        docType: meta?.docType,
        accentColor: "#F5C742",
        primaryColor: "#F5C742",
        paperSize: "A4",
        orientation: "portrait",
        showLogo: true,
        showCompanyLogo: true,
        showCompanyName: true,
        showCompanyAddress: true,
        showCompanyPhone: true,
        showCompanyEmail: true,
        showTRN: true,
        showBillTo: !isReceipt,
        showCustomerName: true,
        showCustomerCode: true,
        showCustomerPhone: true,
        showCustomerEmail: isInvoice || isCredit,
        showCustomerTRN: isInvoice || isCredit,
        showShipTo: isDelivery,
        showTerms: !isReceipt,
        showTermsConditions: !isReceipt,
        showBankDetails: isInvoice || isCredit,
        showQRCode: typeId === "sales-invoice",
        showGrandTotalBanner: !isDelivery && !isPickLike && !isReceipt,
        colProductImage: typeId === "quotation" || isInvoice,
        colItemCode: true,
        colSKU: false,
        colBarcode: false,
        colBrand: false,
        colDescription: true,
        colQty: !isReceipt,
        colUnitPrice: !isReceipt && !isDelivery,
        colTaxableAmount: isInvoice || isCredit || typeId === "quotation",
        colDiscount: !isReceipt && !isDelivery,
        colVAT: isInvoice || isCredit,
        colVATAmount: isInvoice || isCredit,
        colLineTotal: !isReceipt && !isDelivery,
        showSubtotal: !isReceipt && !isDelivery,
        showDiscountTotal: !isReceipt && !isDelivery,
        showVATTotal: isInvoice || isCredit,
        showGrandTotal: !isReceipt && !isDelivery,
        showAmountInWords: isInvoice || isCredit,
        termsText: defaultTermsFor(typeId),
        emailSubject: `${meta?.label || "Sales Document"} #{number} from {company_name}`,
        emailBody: `Dear {customer_name},\n\nPlease find attached ${meta?.label || "the document"} #{number}.\n\nBest regards,\n{company_name}`
    };
};

const getDesignerSettings = (template, meta) => {
    const displayOptions = parseSettings(template.displayOptions);
    const columns = parseSettings(template.columns);
    const stored = displayOptions.salesDesignerSettings || displayOptions.designerSettings || displayOptions.purchaseDesignerSettings;

    if (stored && typeof stored === "object") {
        return {
            ...stored,
            templateName: stored.templateName || template.name,
            docType: stored.docType || meta?.docType,
            mode: stored.mode || meta?.mode,
            paperSize: stored.paperSize || template.paperSize || "A4",
            orientation: stored.orientation || String(template.orientation || "portrait").toLowerCase()
        };
    }

    return {
        ...defaultSettingsFor(meta?.id, template.name),
        templateName: template.name,
        paperSize: template.paperSize || "A4",
        orientation: String(template.orientation || "portrait").toLowerCase(),
        accentColor: displayOptions.accentColor || displayOptions.primaryColor || "#F5C742",
        primaryColor: displayOptions.primaryColor || displayOptions.accentColor || "#F5C742",
        showLogo: displayOptions.showLogo !== false,
        showCompanyLogo: displayOptions.showLogo !== false,
        showCompanyName: displayOptions.showCompanyDetails !== false,
        showCompanyAddress: displayOptions.showCompanyDetails !== false,
        showBillTo: displayOptions.showCustomerDetails !== false,
        showCustomerName: displayOptions.showCustomerDetails !== false,
        showTerms: displayOptions.showTerms !== false,
        showTermsConditions: displayOptions.showTerms !== false,
        showItemImage: !!displayOptions.showItemImage,
        colProductImage: !!displayOptions.showItemImage,
        currencyDisplay: displayOptions.currencyDisplay === "code" ? "code" : "symbol",
        colItemCode: !!columns.productId,
        colSKU: !!columns.sku,
        colBarcode: !!columns.barcode,
        colBrand: !!columns.brand,
        colDescription: columns.description !== false,
        colQty: columns.qty !== false,
        colUnitPrice: columns.unitPrice !== false,
        colTaxableAmount: !!columns.taxableAmount,
        colDiscount: !!columns.discount,
        colVAT: columns.tax !== false,
        colVATAmount: !!columns.tax,
        colLineTotal: columns.total !== false,
        showBatchNo: !!columns.batchNumber,
        showExpiry: !!columns.expiry,
        showWarehouse: !!columns.location,
        docType: meta?.docType,
        mode: meta?.mode,
        termsText: template.termsContent || defaultTermsFor(meta?.id)
    };
};

const templateToRow = (template) => {
    const meta = typeMetaByCategory(template.category);
    if (!meta) return null;

    const settings = getDesignerSettings(template, meta);
    return {
        id: template.id,
        name: template.name,
        category: template.category,
        type: meta.id,
        isDefault: !!template.isDefault,
        lastModified: formatDate(template),
        primaryColor: settings.accentColor || settings.primaryColor || "#F5C742",
        paperSize: template.paperSize || settings.paperSize || settings.pageSize || "A4",
        orientation: template.orientation || settings.orientation || "Portrait",
        settings,
        raw: template
    };
};

const buildRendererDisplayOptions = (settings = {}, typeId) => ({
    showLogo: settings.showLogo ?? settings.showCompanyLogo ?? true,
    showCompanyDetails: [
        settings.showCompanyName,
        settings.showCompanyAddress,
        settings.showCompanyPhone,
        settings.showCompanyEmail,
        settings.showCompanyWebsite,
        settings.showTRN,
        settings.showCRN,
        settings.showCompanyTaxId,
        settings.showCompanyRegNumber
    ].some((value) => value !== false),
    showCustomerDetails: settings.showBillTo ?? settings.showShipTo ?? settings.showCustomerName ?? typeId !== "receipt",
    showTerms: settings.showTerms ?? settings.showTermsConditions ?? typeId !== "receipt",
    showItemImage: settings.colProductImage ?? settings.showItemImage ?? false,
    currencyDisplay: settings.currencyDisplay === "code" ? "code" : "symbol"
});

const buildRendererColumns = (settings = {}, typeId) => {
    const isVoucherLike = ["receipt", "sales-invoice-preprinted", "sales-invoice-letterhead"].includes(typeId);
    const defaults = categoryDefaultsForColumns(typeId);

    return sanitizeTemplateColumns({
        productId: !!settings.colItemCode,
        sku: !!settings.colSKU,
        barcode: !!(settings.colBarcode || settings.showBarcode),
        brand: !!settings.colBrand,
        detailedDesc: !!settings.colDescription,
        description: settings.colDescription !== false && settings.showItemDescription !== false,
        qty: settings.colQty ?? settings.colQtyRequired ?? settings.showReceivedQty ?? !isVoucherLike,
        unitPrice: settings.colUnitPrice ?? !isVoucherLike,
        taxableAmount: !!settings.colTaxableAmount,
        discount: !!settings.colDiscount,
        tax: settings.colVAT ?? settings.showVATTotal ?? defaults.tax,
        taxPercent: !!settings.colVAT,
        total: settings.colLineTotal ?? settings.showTotalReturn ?? !isVoucherLike,
        batchNumber: !!(settings.colBatchNumber || settings.colBatch || settings.showBatchNo),
        batchBarcode: !!settings.colSubBarcode,
        expiry: !!settings.showExpiry,
        location: !!(settings.showWarehouse || settings.showBranchOutlet || settings.colBinLocation || settings.colSubBinLocation),
        quotationNo: !!settings.showQuotationRef || defaults.quotationNo,
        salesOrderNo: !!settings.showSalesOrderRef || defaults.salesOrderNo,
        salesInvoiceNo: !!settings.showSalesInvoiceRef || defaults.salesInvoiceNo
    }, defaults);
};

const buildPayload = ({ typeId, name, isDefault, settings }) => {
    const meta = typeMetaByType(typeId);
    const designerSettings = {
        ...defaultSettingsFor(typeId, name),
        ...settings,
        templateName: settings.templateName || name || `Default ${meta.label}`
    };
    const displayOptions = sanitizeTemplateDisplayOptions(
        {
            ...DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
            ...buildRendererDisplayOptions(designerSettings, typeId)
        },
        DEFAULT_TEMPLATE_DISPLAY_OPTIONS
    );

    return {
        category: meta.category,
        name: designerSettings.templateName || name || `Default ${meta.label}`,
        isDefault: !!isDefault,
        paperSize: designerSettings.paperSize || designerSettings.pageSize || "A4",
        orientation: toApiOrientation(designerSettings.orientation),
        headerContent: designerSettings.headerContent || "",
        termsContent: designerSettings.termsText || designerSettings.termsConditions || designerSettings.footerText || defaultTermsFor(typeId),
        footerContent: designerSettings.footerContent || "",
        displayOptions: JSON.stringify({
            ...displayOptions,
            primaryColor: designerSettings.primaryColor || designerSettings.accentColor || "#F5C742",
            accentColor: designerSettings.accentColor || designerSettings.primaryColor || "#F5C742",
            salesDesigner: meta.designer,
            salesDesignerSettings: designerSettings
        }),
        columns: JSON.stringify(buildRendererColumns(designerSettings, typeId))
    };
};

const CARD_FRAME = "rounded-xl border border-[#DDE3EA] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.13)]";
const ICON_TILE = "flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF8DC] text-[#D99A00]";
const PAGE_BG = "bg-[#F6F7F9]";

const enforceSingleDefaultPerType = async (rows) => {
    const byType = rows.reduce((acc, row) => {
        if (!acc[row.type]) acc[row.type] = [];
        acc[row.type].push(row);
        return acc;
    }, {});

    let changed = false;
    for (const typeRows of Object.values(byType)) {
        const defaultRows = typeRows.filter((row) => row.isDefault);
        if (defaultRows.length <= 1) continue;

        changed = true;
        for (const row of defaultRows.slice(1)) {
            await updatePrintTemplate(row.id, buildPayload({
                typeId: row.type,
                name: row.name,
                isDefault: false,
                settings: row.settings
            }));
        }
    }

    return changed;
};

export default function PrintEmailTemplates() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedType, setSelectedType] = useState(null);
    const [activeDesigner, setActiveDesigner] = useState(null);
    const [designerSettings, setDesignerSettings] = useState({});
    const [designerTemplateName, setDesignerTemplateName] = useState("");
    const [editingTemplate, setEditingTemplate] = useState(null);
    const importInputRef = useRef(null);

    const refresh = useCallback(async ({ seedMissing = false } = {}) => {
        setLoading(true);
        try {
            const all = await getPrintTemplates();
            const rows = (all || [])
                .filter((template) => CATEGORY_SET.has(template.category))
                .map(templateToRow)
                .filter(Boolean);

            if (await enforceSingleDefaultPerType(rows)) {
                const refreshed = await getPrintTemplates();
                setTemplates(
                    (refreshed || [])
                        .filter((template) => CATEGORY_SET.has(template.category))
                        .map(templateToRow)
                        .filter(Boolean)
                );
                return;
            }

            if (seedMissing) {
                const missingTypes = TEMPLATE_TYPES.filter(
                    (type) => !rows.some((row) => row.type === type.id)
                );

                if (missingTypes.length > 0) {
                    await Promise.all(missingTypes.map((type) => createPrintTemplate(buildPayload({
                        typeId: type.id,
                        name: `Default ${type.label}`,
                        isDefault: true,
                        settings: defaultSettingsFor(type.id, `Default ${type.label}`)
                    }))));

                    const refreshed = await getPrintTemplates();
                    setTemplates(
                        (refreshed || [])
                            .filter((template) => CATEGORY_SET.has(template.category))
                            .map(templateToRow)
                            .filter(Boolean)
                    );
                    return;
                }
            }

            setTemplates(rows);
        } catch (error) {
            console.error("Failed to load sales templates", error);
            toast.error("Failed to load sales templates");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh({ seedMissing: true });
    }, [refresh]);

    const getTemplatesByType = (typeId) => templates.filter((template) => template.type === typeId);

    const openDesigner = (typeId, row = null) => {
        const meta = typeMetaByType(typeId);
        const settings = row?.settings && Object.keys(row.settings).length
            ? row.settings
            : defaultSettingsFor(typeId, row?.name || `New ${meta.label} Template`);
        const templateName = row?.name || settings.templateName || `New ${meta.label} Template`;

        setActiveDesigner(typeId);
        setDesignerSettings({ ...settings, templateName, docType: settings.docType || meta.docType, mode: settings.mode || meta.mode });
        setDesignerTemplateName(templateName);
        setEditingTemplate(row);
    };

    const closeDesigner = () => {
        setActiveDesigner(null);
        setEditingTemplate(null);
        setDesignerSettings({});
        setDesignerTemplateName("");
    };

    const persistSave = async (typeId, settings) => {
        const payload = buildPayload({
            typeId,
            name: settings.templateName || designerTemplateName,
            isDefault: editingTemplate?.isDefault ?? getTemplatesByType(typeId).length === 0,
            settings
        });

        try {
            if (editingTemplate?.id) {
                await updatePrintTemplate(editingTemplate.id, payload);
                toast.success(`${payload.name} updated`);
            } else {
                await createPrintTemplate(payload);
                toast.success(`${payload.name} created`);
            }
            closeDesigner();
            await refresh();
        } catch (error) {
            console.error("Failed to save sales template", error);
            toast.error("Failed to save template");
        }
    };

    const handleDuplicate = async (row) => {
        const payload = buildPayload({
            typeId: row.type,
            name: `${row.name} (Copy)`,
            isDefault: false,
            settings: { ...row.settings, templateName: `${row.name} (Copy)` }
        });

        try {
            await createPrintTemplate(payload);
            toast.success("Template duplicated");
            await refresh();
        } catch (error) {
            console.error("Failed to duplicate sales template", error);
            toast.error("Failed to duplicate template");
        }
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`Delete "${row.name}"?`)) return;

        try {
            await deletePrintTemplate(row.id);
            toast.success("Template deleted");
            await refresh();
        } catch (error) {
            console.error("Failed to delete sales template", error);
            toast.error("Failed to delete template");
        }
    };

    const handleSetDefault = async (row) => {
        try {
            const sameType = getTemplatesByType(row.type);
            for (const template of sameType.filter((template) => template.id !== row.id)) {
                await updatePrintTemplate(template.id, buildPayload({
                    typeId: template.type,
                    name: template.name,
                    isDefault: false,
                    settings: template.settings
                }));
            }
            await updatePrintTemplate(row.id, buildPayload({
                typeId: row.type,
                name: row.name,
                isDefault: true,
                settings: row.settings
            }));
            toast.success("Default template updated");
            await refresh();
        } catch (error) {
            console.error("Failed to set sales template default", error);
            toast.error("Failed to set default template");
        }
    };

    const handleExportAll = () => {
        const anchor = document.createElement("a");
        anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(templates, null, 2))}`;
        anchor.download = "sales_print_templates.json";
        anchor.click();
        toast.success("Templates exported");
    };

    const handleImport = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        try {
            const content = await file.text();
            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : [data];

            for (const item of items) {
                const meta = typeMetaByType(item.type) || typeMetaByCategory(item.category);
                if (!meta) continue;
                await createPrintTemplate(buildPayload({
                    typeId: meta.id,
                    name: item.name || `Imported ${meta.label}`,
                    isDefault: false,
                    settings: item.settings || defaultSettingsFor(meta.id, item.name)
                }));
            }

            toast.success("Templates imported");
            await refresh();
        } catch (error) {
            console.error("Failed to import sales template", error);
            toast.error("Invalid template file");
        }
    };

    if (activeDesigner) {
        const meta = typeMetaByType(activeDesigner);
        const commonProps = {
            templateName: designerTemplateName,
            initialSettings: designerSettings,
            onClose: closeDesigner,
            onSave: (settings) => persistSave(activeDesigner, settings)
        };

        if (meta.designer === "document") {
            return <DocumentTemplateDesigner docType={meta.docType} {...commonProps} />;
        }
        if (meta.designer === "grv") return <GRVTemplateDesigner {...commonProps} />;
        if (meta.designer === "payment") return <PaymentReceiptDesigner {...commonProps} />;
        if (meta.designer === "pick-list") return <PickListDesigner {...commonProps} />;
        if (meta.designer === "overlay") {
            return <InvoiceOverlayDesigner mode={meta.mode} {...commonProps} />;
        }
    }

    const renderTemplateCard = (row) => {
        const meta = typeMetaByType(row.type);
        const Icon = meta?.icon || FileText;

        return (
            <Card key={row.id} className={`${CARD_FRAME} overflow-hidden transition hover:border-[#C9D2DD] hover:shadow-[0_6px_18px_rgba(15,23,42,0.10)]`}>
                <CardContent className="flex min-h-[150px] flex-col p-0">
                    <div className="flex flex-1 gap-3 p-4">
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-bold text-slate-950">{row.name}</h3>
                                {row.isDefault && (
                                    <span className="rounded bg-[#F5C742] px-1.5 py-0.5 text-[10px] font-bold leading-4 text-black">Default</span>
                                )}
                            </div>
                            <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-slate-600">
                                <p>Last modified: <span className="font-medium text-slate-700">{row.lastModified}</span></p>
                                <p>Paper: <span className="font-medium text-slate-700">{row.paperSize} ({String(row.orientation || "Portrait")})</span></p>
                            </div>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300">
                            <Icon className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 border-t border-[#E5EAF0] bg-white px-4 py-2.5">
                        <Button size="sm" variant="outline" onClick={() => openDesigner(row.type, row)} className="h-8 flex-1 border-[#CBD5E1] bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Edit className="h-3 w-3" />
                            Edit
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => handleDuplicate(row)} title="Duplicate" className="h-8 w-8 border-[#CBD5E1] bg-white text-slate-700 hover:bg-slate-50">
                            <Copy className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => handleDelete(row)} title="Delete" className="h-8 w-8 border-red-200 bg-white text-red-600 hover:bg-red-50">
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                    <div className="border-t border-[#EEF2F6] bg-white px-4 pb-2.5">
                        {row.isDefault ? (
                            <div className="flex h-7 items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold text-[#A16207]">
                                <Check className="h-3 w-3" />
                                Current Default
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => handleSetDefault(row)}
                                className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold text-slate-700 hover:bg-[#FFF8DC] hover:text-[#A16207]"
                            >
                                <Check className="h-3 w-3" />
                                Set as Default
                            </button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderOverlayCard = (overlay) => {
        const overlayTemplates = getTemplatesByType(overlay.id);
        const isPreprinted = overlay.mode === "preprinted";
        const Icon = isPreprinted ? Printer : FileText;

        return (
            <Card key={overlay.id} className={`${CARD_FRAME} overflow-hidden transition hover:border-[#C9D2DD] hover:shadow-[0_6px_18px_rgba(15,23,42,0.10)]`}>
                <CardContent className="flex min-h-[150px] flex-col p-0">
                    <div className="flex flex-1 gap-3 p-4">
                        <div className="min-w-0 flex-1">
                            <div className="mb-3 flex items-center gap-2">
                                <div className={ICON_TILE}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Overlay</span>
                            </div>
                            <h3 className="text-sm font-bold text-slate-950">{overlay.label}</h3>
                            <p className="mt-1 text-xs leading-4 text-slate-600">{overlay.description}</p>
                            <p className="mt-3 text-[11px] font-medium text-slate-500">
                                {overlayTemplates.length} template{overlayTemplates.length === 1 ? "" : "s"}
                            </p>
                        </div>
                    </div>

                    <div className="border-t border-[#E5EAF0] bg-white px-4 py-2.5">
                        <Button onClick={() => openDesigner(overlay.id)} className="h-8 w-full bg-[#F5C742] text-xs font-bold text-black hover:bg-[#e6b932]">
                            <Plus className="h-3.5 w-3.5" />
                            Create {overlay.label}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderTypeCard = (type) => {
        const Icon = type.icon || FileText;
        const typeTemplates = getTemplatesByType(type.id);

        return (
            <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type.id)}
                className={`${CARD_FRAME} group flex min-h-[184px] flex-col p-6 text-left transition hover:-translate-y-0.5 hover:border-[#F5C742] hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)]`}
            >
                <div className="mb-4 flex items-start justify-between">
                    <div className={ICON_TILE}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:text-slate-700" />
                </div>
                <h3 className="text-base font-bold text-slate-950">{type.label}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{type.description}</p>
                <p className="mt-auto text-xs font-medium text-slate-500">
                    {typeTemplates.length} template{typeTemplates.length === 1 ? "" : "s"}
                </p>
            </button>
        );
    };

    const HeaderTitle = ({ children, subtitle, detail = false, action = null }) => (
        <header className="border-b border-[#DDE3EA] bg-white px-7 py-5">
            <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                <span>Sales</span>
                <ChevronRight className="h-3 w-3" />
                <span className={detail ? "text-slate-600" : "font-semibold text-slate-950"}>Print & Email Templates</span>
                {detail && (
                    <>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-semibold text-slate-950">{children}</span>
                    </>
                )}
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        {detail && (
                            <button
                                type="button"
                                onClick={() => setSelectedType(null)}
                                className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                                aria-label="Back to template types"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        )}
                        <div className={ICON_TILE}>
                            <FileText className="h-5 w-5" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{children}</h1>
                    </div>
                    {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
                </div>
                {action}
            </div>
        </header>
    );

    if (selectedType) {
        const typeTemplates = getTemplatesByType(selectedType);
        const typeInfo = typeMetaByType(selectedType);
        const overlayTypes = OVERLAY_TYPES.filter((type) => type.parentType === selectedType);

        return (
            <div className={`min-h-screen ${PAGE_BG}`}>
                <HeaderTitle
                    detail
                    subtitle={typeInfo.description}
                    action={(
                        <Button onClick={() => openDesigner(selectedType)} className="h-9 rounded-md bg-[#F5C742] px-4 font-bold text-black hover:bg-[#e6b932]">
                            <Plus className="h-4 w-4" />
                            Create New Template
                        </Button>
                    )}
                >
                    {typeInfo.label} Templates
                </HeaderTitle>

                <main className="space-y-7 p-7">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {typeTemplates.map(renderTemplateCard)}
                        {typeTemplates.length === 0 && (
                            <Card className={`${CARD_FRAME} border-dashed`}>
                                <CardContent className="py-14 text-center">
                                    <FileText className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                                    <h3 className="mb-2 text-base font-bold text-slate-950">No templates created yet</h3>
                                    <p className="mb-5 text-sm text-slate-600">Create your first {typeInfo.label.toLowerCase()} template</p>
                                    <Button onClick={() => openDesigner(selectedType)} className="bg-[#F5C742] font-bold text-black hover:bg-[#e6b932]">
                                        <Plus className="h-4 w-4" />
                                        Create Template
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {overlayTypes.length > 0 && (
                        <section className="space-y-4">
                            <div>
                                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-950">Additional Print Modes</h2>
                                <p className="mt-1 text-sm text-slate-600">Create pre-printed and letterhead invoice layouts with the same card style.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {overlayTypes.map(renderOverlayCard)}
                            </div>
                        </section>
                    )}
                </main>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${PAGE_BG}`}>
            <HeaderTitle subtitle="Design and customize templates for sales orders, invoices, and other customer documents">
                Print & Email Templates
            </HeaderTitle>

            <main className="space-y-7 p-7">
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {TEMPLATE_TYPES.map(renderTypeCard)}
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-950">Quick Actions</h2>
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => importInputRef.current?.click()}
                            className={`${CARD_FRAME} flex h-[68px] items-center gap-4 px-4 text-left transition hover:border-blue-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.1)]`}
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                <Upload className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-950">Import Template</p>
                                <p className="text-xs text-slate-600">Upload from file</p>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={handleExportAll}
                            disabled={templates.length === 0}
                            className={`${CARD_FRAME} flex h-[68px] items-center gap-4 px-4 text-left transition hover:border-green-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.1)] disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600">
                                <Download className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-950">Export Templates</p>
                                <p className="text-xs text-slate-600">Download all templates</p>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => refresh({ seedMissing: true })}
                            disabled={loading}
                            className={`${CARD_FRAME} flex h-[68px] items-center gap-4 px-4 text-left transition hover:border-purple-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.1)] disabled:cursor-wait disabled:opacity-70`}
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                                {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Settings className="h-5 w-5" />}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-950">Global Settings</p>
                                <p className="text-xs text-slate-600">Configure defaults</p>
                            </div>
                        </button>
                        <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
                    </div>
                </section>

                <section className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
                    <div className="flex items-center gap-2 font-bold">
                        <Mail className="h-4 w-4" />
                        Email & Print Tips
                    </div>
                    <p className="mt-2 text-blue-800">
                        Templates are automatically used when emailing or printing sales documents. Set one default per document type for the live sales pages.
                    </p>
                </section>
            </main>
        </div>
    );
}
