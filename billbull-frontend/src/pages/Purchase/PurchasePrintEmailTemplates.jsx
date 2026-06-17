import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Check,
    ChevronRight,
    Copy,
    Download,
    Edit,
    FileText,
    Mail,
    Plus,
    Printer,
    RefreshCw,
    Trash2,
    Upload
} from "lucide-react";
import toast from "react-hot-toast";
import {
    createPrintTemplate,
    deletePrintTemplate,
    getPrintTemplates,
    updatePrintTemplate
} from "../../api/printTemplateApi";
import ChequePrintingDesigner, {
    defaultChequePrintSettings
} from "../Financials/ChequePrintingDesigner";
import {
    DocumentTemplateDesigner,
    docTypeLabel
} from "./Templates/DocumentTemplateDesigner";
import { GRNTemplateDesigner } from "./Templates/GRNTemplateDesigner";
import { GRVTemplateDesigner } from "./Templates/GRVTemplateDesigner";
import { PaymentReceiptDesigner } from "./Templates/PaymentReceiptDesigner";
import VendorPaymentVoucherDesigner from "./Templates/VendorPaymentVoucherDesigner";
import {
    VendorSoATemplateDesigner,
    defaultVendorSoaTemplateSettings
} from "./Templates/VendorSoATemplateDesigner";

const TEMPLATE_TYPES = [
    {
        id: "lpo",
        category: "Local Purchase Order",
        label: "Local Purchase Order (LPO)",
        description: "Purchase order issued to vendors for goods and services",
        designer: "document",
        docType: "lpo"
    },
    {
        id: "purchase-invoice",
        category: "Purchase Invoice",
        label: "Purchase Invoice",
        description: "Vendor invoice received for purchase accounting",
        designer: "document",
        docType: "purchase-invoice"
    },
    {
        id: "grn",
        category: "Goods Receipt Note",
        label: "Goods Received Note (GRN)",
        description: "Receiving note for goods delivered by a vendor",
        designer: "grn"
    },
    {
        id: "grv",
        category: "Goods Return Voucher",
        label: "Goods Return Voucher (GRV)",
        description: "Goods return document sent back to a vendor",
        designer: "grv"
    },
    {
        id: "purchase-return",
        category: "Purchase Return",
        label: "Purchase Return",
        description: "Return note for rejected or returned supplier goods",
        designer: "document",
        docType: "purchase-return"
    },
    {
        id: "debit-note",
        category: "Debit Note",
        label: "Debit Note",
        description: "Debit adjustment issued against vendor accounts",
        designer: "document",
        docType: "debit-note"
    },
    {
        id: "vendor-payment",
        category: "Payment Voucher",
        label: "Vendor Payment Voucher",
        description: "Payment voucher issued to vendors",
        designer: "payment"
    },
    {
        id: "vendor-soa",
        category: "Vendor Statement of Account",
        label: "Vendor Statement of Account",
        description: "Periodic statement of vendor purchases and payments",
        designer: "soa"
    },
    {
        id: "cheque-printing",
        category: "Cheque",
        label: "Cheque Printing",
        description: "Printable cheque layout used for vendor payments",
        designer: "cheque"
    }
];

const CATEGORY_SET = new Set(TEMPLATE_TYPES.map((type) => type.category));
const typeMetaByType = (id) => TEMPLATE_TYPES.find((type) => type.id === id);
const typeMetaByCategory = (category) => TEMPLATE_TYPES.find((type) => type.category === category);

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

const getDesignerSettings = (template, meta) => {
    const displayOptions = parseSettings(template.displayOptions);
    const columns = parseSettings(template.columns);
    const stored = displayOptions.purchaseDesignerSettings || displayOptions.designerSettings;
    if (stored && typeof stored === "object") {
        return {
            ...stored,
            templateName: stored.templateName || template.name,
            paperSize: stored.paperSize || template.paperSize || "A4",
            orientation: stored.orientation || String(template.orientation || "portrait").toLowerCase()
        };
    }

    return {
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
        showVendorCard: displayOptions.showCustomerDetails !== false,
        showCustomerName: displayOptions.showCustomerDetails !== false,
        showTerms: displayOptions.showTerms !== false,
        showTermsConditions: displayOptions.showTerms !== false,
        showItemImage: !!displayOptions.showItemImage,
        colProductImage: !!displayOptions.showItemImage,
        colItemCode: !!columns.productId,
        colSKU: !!columns.sku,
        colBarcode: !!columns.barcode,
        colBrand: !!columns.brand,
        colDescription: columns.description !== false,
        showShortDescription: columns.shortDesc !== false,
        showDetailedDescription: !!columns.detailedDesc,
        colQty: columns.qty !== false,
        colUnitPrice: columns.unitPrice !== false,
        colTaxableAmount: !!columns.taxableAmount,
        colDiscount: !!columns.discount,
        colVAT: columns.tax !== false,
        colVATAmount: !!columns.tax,
        colLineTotal: columns.total !== false,
        showOrderedQty: !!columns.lpoQty,
        showReceivedQty: !!columns.received,
        showBatchNo: !!columns.batchNumber,
        showExpiry: !!columns.expiry,
        showTotalReturn: columns.total !== false,
        docType: meta?.docType
    };
};

const templateToRow = (template) => {
    const meta = typeMetaByCategory(template.category);
    const settings = getDesignerSettings(template, meta);
    return {
        id: template.id,
        name: template.name,
        category: template.category,
        type: meta?.id || "lpo",
        isDefault: !!template.isDefault,
        lastModified: formatDate(template),
        primaryColor: settings.accentColor || settings.primaryColor || "#F5C742",
        paperSize: template.paperSize || settings.paperSize || settings.pageSize || "A4",
        orientation: template.orientation || settings.orientation || "Portrait",
        settings,
        raw: template
    };
};

const defaultSettingsFor = (typeId, name) => {
    const meta = typeMetaByType(typeId);
    if (typeId === "cheque-printing") {
        return defaultChequePrintSettings(name || "Default Cheque Template");
    }
    if (typeId === "vendor-soa") {
        return defaultVendorSoaTemplateSettings(name || "Default Vendor Statement of Account");
    }
    return {
        templateName: name || `Default ${meta?.label || "Purchase"} Template`,
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
        showBillTo: true,
        showVendorCard: true,
        showCustomerName: true,
        showTerms: typeId !== "vendor-payment" && typeId !== "cheque-printing" && typeId !== "vendor-soa",
        showTermsConditions: typeId !== "vendor-payment" && typeId !== "cheque-printing" && typeId !== "vendor-soa",
        colDescription: true,
        showShortDescription: true,
        showDetailedDescription: true,
        colQty: typeId !== "vendor-payment" && typeId !== "cheque-printing",
        colUnitPrice: typeId !== "vendor-payment" && typeId !== "cheque-printing",
        colVAT: typeId === "purchase-invoice",
        colLineTotal: true,
        emailSubject: `${meta?.label || "Purchase Document"} #{number} from {company_name}`,
        emailBody: `Dear {vendor_name},\n\nPlease find attached ${meta?.label || "the document"} #{number}.\n\nBest regards,\n{company_name}`
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
    showCustomerDetails: settings.showBillTo ?? settings.showShipTo ?? settings.showVendorCard ?? settings.showCustomerName ?? typeId !== "cheque-printing",
    showTerms: typeId === "vendor-soa" ? false : (settings.showTerms ?? settings.showTermsConditions ?? false),
    showItemImage: settings.colProductImage ?? settings.showItemImage ?? false
});

const buildRendererColumns = (settings = {}, typeId) => {
    const isVoucherLike = typeId === "vendor-payment" || typeId === "cheque-printing" || typeId === "vendor-soa";
    return {
        productId: !!settings.colItemCode,
        sku: !!settings.colSKU,
        barcode: !!(settings.colBarcode || settings.showBarcode),
        brand: !!settings.colBrand,
        shortDesc: settings.showShortDescription !== false,
        detailedDesc: !!settings.showDetailedDescription,
        description: settings.colDescription !== false && settings.showItemDescription !== false,
        qty: settings.colQty ?? settings.showReceivedQty ?? !isVoucherLike,
        unitPrice: settings.colUnitPrice ?? !isVoucherLike,
        taxableAmount: !!settings.colTaxableAmount,
        discount: !!settings.colDiscount,
        tax: settings.colVAT ?? settings.showVATTotal ?? typeId === "purchase-invoice",
        taxPercent: !!settings.colVAT,
        total: settings.colLineTotal ?? settings.showTotalReturn ?? !isVoucherLike,
        lpoQty: !!settings.showOrderedQty,
        received: !!settings.showReceivedQty,
        accepted: !!settings.showAcceptedQty,
        batchNumber: !!(settings.colBatchNumber || settings.showBatchNo),
        expiry: !!settings.showExpiry,
        location: !!settings.showBinLocation
    };
};

const buildPayload = ({ typeId, name, isDefault, settings }) => {
    const meta = typeMetaByType(typeId);
    const designerSettings = {
        ...defaultSettingsFor(typeId, name),
        ...settings,
        templateName: settings.templateName || name || `Default ${meta.label}`
    };
    const displayOptions = {
        ...buildRendererDisplayOptions(designerSettings, typeId),
        purchaseDesigner: meta.designer,
        purchaseDesignerSettings: designerSettings
    };

    const paperSize = typeId === "cheque-printing"
        ? `${designerSettings.widthMm || 216}x${designerSettings.heightMm || 96}mm`
        : designerSettings.paperSize || designerSettings.pageSize || "A4";

    return {
        category: meta.category,
        name: designerSettings.templateName || name || `Default ${meta.label}`,
        isDefault: !!isDefault,
        paperSize,
        orientation: toApiOrientation(designerSettings.orientation),
        headerContent: designerSettings.headerContent || "",
        termsContent: designerSettings.termsText || designerSettings.termsConditions || designerSettings.footerText || "",
        footerContent: designerSettings.footerContent || "",
        displayOptions: JSON.stringify(displayOptions),
        columns: JSON.stringify(buildRendererColumns(designerSettings, typeId))
    };
};

const iconBg = {
    blue: ["bg-blue-100", "text-blue-600"],
    green: ["bg-green-100", "text-green-600"],
    purple: ["bg-purple-100", "text-purple-600"],
    orange: ["bg-orange-100", "text-orange-600"]
};

export default function PurchasePrintEmailTemplates() {
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
                .map(templateToRow);

            if (seedMissing) {
                const missingTypes = TEMPLATE_TYPES.filter(
                    (type) => !rows.some((row) => row.type === type.id)
                );
                if (missingTypes.length > 0) {
                    try {
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
                        );
                        return;
                    } catch (seedError) {
                        console.warn("Failed to seed default purchase templates", seedError);
                    }
                }
            }

            setTemplates(rows);
        } catch (error) {
            console.error("Failed to load purchase templates", error);
            toast.error("Failed to load purchase templates");
        } finally {
            setLoading(false);
        }
    }, []);

    const hasSeeded = useRef(false);
    useEffect(() => {
        if (hasSeeded.current) return;
        hasSeeded.current = true;
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
        setDesignerSettings({ ...settings, templateName });
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
            console.error("Failed to save purchase template", error);
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
            console.error("Failed to duplicate purchase template", error);
            toast.error("Failed to duplicate template");
        }
    };

    const handleDelete = async (row) => {
        if (row.isDefault) {
            toast.error("Cannot delete a default template");
            return;
        }
        if (!window.confirm(`Delete "${row.name}"?`)) return;
        try {
            await deletePrintTemplate(row.id);
            toast.success("Template deleted");
            await refresh();
        } catch (error) {
            console.error("Failed to delete purchase template", error);
            toast.error("Failed to delete template");
        }
    };

    const handleSetDefault = async (row) => {
        try {
            const sameType = getTemplatesByType(row.type);
            await Promise.all(sameType.map((template) => updatePrintTemplate(template.id, buildPayload({
                typeId: template.type,
                name: template.name,
                isDefault: template.id === row.id,
                settings: template.settings
            }))));
            toast.success("Default template updated");
            await refresh();
        } catch (error) {
            console.error("Failed to set purchase template default", error);
            toast.error("Failed to set default template");
        }
    };

    const handleExport = (row) => {
        const exportData = {
            name: row.name,
            category: row.category,
            type: row.type,
            paperSize: row.paperSize,
            orientation: row.orientation,
            settings: row.settings
        };
        const anchor = document.createElement("a");
        anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`;
        anchor.download = `${row.name.replace(/\s+/g, "_")}.json`;
        anchor.click();
        toast.success("Template exported");
    };

    const handleExportAll = () => {
        const anchor = document.createElement("a");
        anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(templates, null, 2))}`;
        anchor.download = "purchase_print_templates.json";
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
            console.error("Failed to import purchase template", error);
            toast.error("Invalid template file");
        }
    };

    const stats = useMemo(() => ({
        total: templates.length,
        defaults: templates.filter((template) => template.isDefault).length,
        custom: templates.filter((template) => !template.isDefault).length,
        types: TEMPLATE_TYPES.length
    }), [templates]);

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
        if (meta.designer === "grn") return <GRNTemplateDesigner {...commonProps} />;
        if (meta.designer === "grv") return <GRVTemplateDesigner {...commonProps} />;
        if (meta.designer === "payment") return <VendorPaymentVoucherDesigner {...commonProps} />;
        if (meta.designer === "cheque") return <ChequePrintingDesigner {...commonProps} />;
        if (meta.designer === "soa") {
            return (
                <VendorSoATemplateDesigner
                    onBack={closeDesigner}
                    editingTemplate={{
                        id: editingTemplate?.id,
                        name: designerTemplateName,
                        isDefault: editingTemplate?.isDefault ?? false,
                        settings: designerSettings
                    }}
                    onSave={(settings) => persistSave(activeDesigner, settings)}
                />
            );
        }
    }

    if (selectedType) {
        const typeTemplates = getTemplatesByType(selectedType);
        const typeInfo = typeMetaByType(selectedType);

        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="mx-auto max-w-[1800px] space-y-6 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                                <button
                                    type="button"
                                    onClick={() => setSelectedType(null)}
                                    className="flex items-center gap-1 hover:text-slate-900"
                                >
                                    <span>Vendors & Purchases</span>
                                    <ChevronRight className="h-4 w-4" />
                                    <span>Print & Email Templates</span>
                                </button>
                                <ChevronRight className="h-4 w-4" />
                                <span className="font-medium text-slate-900">{typeInfo.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <FileText className="h-6 w-6 text-[#F5C742]" />
                                <h1 className="text-3xl font-semibold text-[#1E1E1E]">{typeInfo.label} Templates</h1>
                            </div>
                            <p className="text-sm text-slate-600">{typeInfo.description}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openDesigner(selectedType)}
                            className="inline-flex items-center rounded-md bg-[#F5C742] px-4 py-2 text-sm font-medium text-black hover:bg-[#F5C742]/90"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Create New Template
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-12 text-center text-slate-500">Loading...</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                            {typeTemplates.map((template) => (
                                <div key={template.id} className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg">
                                    <div className="mb-4 flex items-start justify-between">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-lg font-semibold">{template.name}</h3>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {template.isDefault && <span className="rounded bg-[#F5C742] px-2 py-0.5 text-xs font-medium text-black">Default</span>}
                                                <span className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium">{template.paperSize}</span>
                                            </div>
                                        </div>
                                        <div
                                            className="flex h-16 w-16 items-center justify-center rounded-lg"
                                            style={{ backgroundColor: `${template.primaryColor}20` }}
                                        >
                                            <FileText className="h-8 w-8" style={{ color: template.primaryColor }} />
                                        </div>
                                    </div>

                                    <div className="mb-4 space-y-2 text-sm text-slate-600">
                                        <div className="flex justify-between gap-4"><span>Last modified:</span><span className="font-medium">{template.lastModified}</span></div>
                                        <div className="flex justify-between gap-4"><span>Paper size:</span><span className="font-medium">{template.paperSize}</span></div>
                                        <div className="flex justify-between gap-4"><span>Designer:</span><span className="font-medium capitalize">{typeInfo.designer}</span></div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openDesigner(template.type, template)}
                                            className="inline-flex flex-1 items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                                        >
                                            <Edit className="mr-1 h-3 w-3" />
                                            Edit
                                        </button>
                                        <button type="button" onClick={() => handleDuplicate(template)} title="Duplicate" className="rounded-md border border-gray-300 p-2 hover:bg-gray-50"><Copy className="h-3 w-3" /></button>
                                        <button type="button" onClick={() => handleExport(template)} title="Export" className="rounded-md border border-gray-300 p-2 hover:bg-gray-50"><Download className="h-3 w-3" /></button>
                                        {!template.isDefault && (
                                            <button type="button" onClick={() => handleDelete(template)} title="Delete" className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                                        )}
                                    </div>

                                    {!template.isDefault && (
                                        <button
                                            type="button"
                                            onClick={() => handleSetDefault(template)}
                                            className="mt-2 inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-sm text-[#B88A1A] hover:bg-[#F5C742]/10"
                                        >
                                            <Check className="mr-1 h-3 w-3" />
                                            Set as Default
                                        </button>
                                    )}
                                </div>
                            ))}

                            {typeTemplates.length === 0 && (
                                <div className="col-span-full rounded-lg border-2 border-dashed border-gray-300 bg-white py-16 text-center">
                                    <FileText className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                                    <h3 className="mb-2 text-lg font-semibold">No templates yet</h3>
                                    <p className="mb-4 text-sm text-slate-600">Create your first {typeInfo.label.toLowerCase()} template.</p>
                                    <button
                                        type="button"
                                        onClick={() => openDesigner(selectedType)}
                                        className="inline-flex items-center rounded-md bg-[#F5C742] px-4 py-2 text-sm font-medium text-black hover:bg-[#F5C742]/90"
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create Template
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
            <div className="mx-auto max-w-[1800px] space-y-6 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>Vendors & Purchases</span>
                            <ChevronRight className="h-4 w-4" />
                            <span className="font-medium text-slate-900">Print & Email Templates</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Printer className="h-6 w-6 text-[#F5C742]" />
                            <h1 className="text-3xl font-semibold text-[#1E1E1E]">Print & Email Templates</h1>
                        </div>
                        <p className="text-sm text-slate-600">
                            Design professional templates for purchase orders, invoices, GRN/GRV, vendor payments, SoA, and cheques.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => refresh()}
                        className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50"
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {[
                        { label: "Total Templates", value: stats.total, color: "blue" },
                        { label: "Default Templates", value: stats.defaults, color: "green" },
                        { label: "Custom Templates", value: stats.custom, color: "purple" },
                        { label: "Document Types", value: stats.types, color: "orange" }
                    ].map((stat) => {
                        const [bg, fg] = iconBg[stat.color];
                        return (
                            <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">{stat.label}</p>
                                        <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                                    </div>
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${bg}`}>
                                        <FileText className={`h-6 w-6 ${fg}`} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div>
                    <h2 className="mb-4 text-xl font-semibold">Document Templates</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {TEMPLATE_TYPES.map((type) => {
                            const typeTemplates = getTemplatesByType(type.id);
                            const defaultTemplate = typeTemplates.find((template) => template.isDefault);
                            const subtitle = type.designer === "document" && type.docType ? docTypeLabel(type.docType) : type.label;

                            return (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setSelectedType(type.id)}
                                    className="group rounded-lg border border-gray-200 bg-white p-6 text-left transition-all hover:border-[#F5C742] hover:shadow-lg"
                                >
                                    <div className="mb-4 flex items-start justify-between">
                                        <div className="rounded-lg bg-[#F5C742]/10 p-3 transition-colors group-hover:bg-[#F5C742]/20">
                                            <FileText className="h-6 w-6 text-[#F5C742]" />
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-gray-400 transition-colors group-hover:text-[#F5C742]" />
                                    </div>
                                    <h3 className="mb-1 text-base font-semibold">{type.label}</h3>
                                    <p className="mb-3 text-xs leading-relaxed text-slate-600">{type.description}</p>
                                    <div className="flex items-center justify-between gap-3 text-xs">
                                        <span className="text-slate-500">
                                            {typeTemplates.length} template{typeTemplates.length !== 1 ? "s" : ""}
                                        </span>
                                        {defaultTemplate && (
                                            <span className="rounded border border-gray-300 px-2 py-0.5">
                                                {defaultTemplate.paperSize || subtitle}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-6">
                    <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => importInputRef.current?.click()}
                            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-[#F5C742] hover:bg-[#F5C742]/5"
                        >
                            <div className="rounded-lg bg-blue-50 p-3"><Upload className="h-5 w-5 text-blue-600" /></div>
                            <div><p className="text-sm font-medium">Import Template</p><p className="text-xs text-slate-600">Upload a JSON template file</p></div>
                        </button>
                        <button
                            type="button"
                            onClick={handleExportAll}
                            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-[#F5C742] hover:bg-[#F5C742]/5"
                        >
                            <div className="rounded-lg bg-green-50 p-3"><Download className="h-5 w-5 text-green-600" /></div>
                            <div><p className="text-sm font-medium">Export All Templates</p><p className="text-xs text-slate-600">Download purchase template backup</p></div>
                        </button>
                        <button
                            type="button"
                            onClick={() => refresh({ seedMissing: true })}
                            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-[#F5C742] hover:bg-[#F5C742]/5"
                        >
                            <div className="rounded-lg bg-purple-50 p-3"><RefreshCw className="h-5 w-5 text-purple-600" /></div>
                            <div><p className="text-sm font-medium">Reset Missing Defaults</p><p className="text-xs text-slate-600">Restore any missing document types</p></div>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
                        <h3 className="mb-3 flex items-center gap-2 font-semibold">
                            <Printer className="h-5 w-5 text-blue-600" />
                            Template Features
                        </h3>
                        <ul className="space-y-2 text-sm text-blue-900">
                            {["Live document previews with granular field toggles", "Separate designers for GRN, GRV, vendor payments, SoA, and cheques", "Colors, fonts, signatures, QR codes, and stamp placeholders", "Default template selection per purchase document type"].map((item) => (
                                <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span>{item}</span></li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-6">
                        <h3 className="mb-3 flex items-center gap-2 font-semibold">
                            <Mail className="h-5 w-5 text-green-600" />
                            Email & Print Tips
                        </h3>
                        <ul className="space-y-2 text-sm text-green-900">
                            {["Templates are stored through the existing print-template API", "Core LPO, GRN, purchase invoice, and payment voucher prints keep using the current renderer", "Use variables like {vendor_name} in email content", "Export templates before major layout changes for an easy rollback"].map((item) => (
                                <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span>{item}</span></li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
