import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    FileText, ChevronRight, ChevronLeft, Plus, Edit, Copy, Download, Upload,
    Trash2, Check, RefreshCw, Printer, Mail,
} from "lucide-react";
import toast from "react-hot-toast";
import FinancialVoucherDesigner, {
    defaultVoucherSettings, voucherTypeLabel,
} from "./FinancialVoucherDesigner";
import ChequePrintingDesigner, {
    defaultChequePrintSettings,
} from "./ChequePrintingDesigner";
import {
    getPrintTemplates, createPrintTemplate, updatePrintTemplate,
    deletePrintTemplate,
} from "../../api/printTemplateApi";

// ─── Voucher type catalog ─────────────────────────────────────────────────────

// Category names must match what the voucher pages already query via
// getTemplatesByCategory() — e.g. JournalVoucher.jsx looks up 'Journal Voucher',
// PaymentVoucher.jsx looks up 'Payment Voucher'. Don't rename without updating
// every consumer page.
const TEMPLATE_TYPES = [
    { id: "journal-voucher", category: "Journal Voucher", label: "Journal Voucher",  description: "Double-entry accounting voucher with Dr/Cr ledger entries" },
    { id: "expense-voucher", category: "Expense Voucher", label: "Expense Voucher",  description: "Expense claim voucher for operational and travel expenses" },
    { id: "receipt-voucher", category: "Receipt Voucher", label: "Receipt Voucher",  description: "Payment receipt document for money received" },
    { id: "payment-voucher", category: "Payment Voucher", label: "Payment Voucher",  description: "Payment voucher for money paid out" },
    { id: "contra-voucher",  category: "Contra Voucher",  label: "Contra Voucher",   description: "Cash-to-cash or cash-to-bank fund transfer document" },
    { id: "cheque-printing", category: "Cheque",          label: "Cheque Printing",  description: "Printable cheque template with stub for bank payments" },
];

const FINANCIAL_CATEGORIES = TEMPLATE_TYPES.map(t => t.category);
const typeMetaByCategory = (cat) => TEMPLATE_TYPES.find(t => t.category === cat);
const typeMetaByType    = (id)  => TEMPLATE_TYPES.find(t => t.id === id);

// ─── Helpers: entity ↔ settings ───────────────────────────────────────────────

function parseSettings(raw) {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch { return {}; }
}

function templateToRow(t) {
    const meta = typeMetaByCategory(t.category);
    const settings = parseSettings(t.displayOptions);
    return {
        id: t.id,
        name: t.name,
        category: t.category,
        type: meta?.id ?? "journal-voucher",
        isDefault: !!t.isDefault,
        lastModified: t.updatedAt ? String(t.updatedAt).slice(0, 10) : (t.createdAt ? String(t.createdAt).slice(0, 10) : "—"),
        primaryColor: settings.accentColor || "#F5C742",
        paperSize: t.paperSize || settings.paperSize || "A4",
        orientation: t.orientation || "portrait",
        settings,
        raw: t,
    };
}

function buildPayload({ category, name, isDefault, settings, voucherType }) {
    const isCheque = voucherType === "cheque-printing";
    return {
        category,
        name: name || (settings.templateName) || `New ${voucherTypeLabel(voucherType)}`,
        isDefault: !!isDefault,
        paperSize: isCheque ? `${settings.widthMm || 216}x${settings.heightMm || 96}mm` : (settings.paperSize || "A4"),
        orientation: "portrait",
        displayOptions: JSON.stringify(settings),
        columns: "[]",
        headerContent: "",
        termsContent: settings.termsText || "",
        footerContent: "",
    };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancialsPrintEmailTemplates() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedType, setSelectedType] = useState(null);

    // Voucher designer state
    const [showDesigner, setShowDesigner] = useState(false);
    const [designerType, setDesignerType] = useState("journal-voucher");
    const [designerSettings, setDesignerSettings] = useState({});
    const [designerTemplateName, setDesignerTemplateName] = useState("");
    const [editingTemplate, setEditingTemplate] = useState(null);

    // Cheque designer state
    const [showChequeDesigner, setShowChequeDesigner] = useState(false);
    const [chequeSettings, setChequeSettings] = useState({});
    const [chequeTemplateName, setChequeTemplateName] = useState("");

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getPrintTemplates();
            const rows = (all || [])
                .filter(t => FINANCIAL_CATEGORIES.includes(t.category))
                .map(templateToRow);
            setTemplates(rows);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load templates");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const getTemplatesByType = (typeId) => templates.filter(t => t.type === typeId);

    // ── Open designers ────────────────────────────────────────────────────────

    const openDesigner = (typeId, row = null) => {
        const meta = typeMetaByType(typeId);
        if (typeId === "cheque-printing") {
            const initial = row?.settings && Object.keys(row.settings).length
                ? row.settings
                : defaultChequePrintSettings(row?.name || "New Cheque Template");
            setChequeTemplateName(row?.name || initial.templateName || "New Cheque Template");
            setChequeSettings(initial);
            setEditingTemplate(row);
            setShowChequeDesigner(true);
            return;
        }
        const initial = row?.settings && Object.keys(row.settings).length
            ? row.settings
            : defaultVoucherSettings(typeId);
        setDesignerType(typeId);
        setDesignerTemplateName(row?.name || initial.templateName || `New ${meta?.label} Template`);
        setDesignerSettings(initial);
        setEditingTemplate(row);
        setShowDesigner(true);
    };

    // ── Save handlers ─────────────────────────────────────────────────────────

    const persistSave = async (typeId, settings) => {
        const meta = typeMetaByType(typeId);
        const payload = buildPayload({
            category: meta.category,
            name: settings.templateName,
            isDefault: editingTemplate?.isDefault ?? false,
            settings,
            voucherType: typeId,
        });
        try {
            if (editingTemplate?.id) {
                await updatePrintTemplate(editingTemplate.id, payload);
                toast.success(`${payload.name} updated`);
            } else {
                await createPrintTemplate(payload);
                toast.success(`${payload.name} created`);
            }
            await refresh();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save template");
        }
    };

    const handleVoucherSave = async (settings) => {
        await persistSave(designerType, settings);
        setShowDesigner(false);
        setEditingTemplate(null);
    };

    const handleChequeSave = async (settings) => {
        await persistSave("cheque-printing", settings);
        setShowChequeDesigner(false);
        setEditingTemplate(null);
    };

    // ── Row actions ───────────────────────────────────────────────────────────

    const handleDuplicate = async (row) => {
        const meta = typeMetaByType(row.type);
        const newSettings = { ...row.settings, templateName: `${row.name} (Copy)` };
        const payload = buildPayload({
            category: meta.category,
            name: newSettings.templateName,
            isDefault: false,
            settings: newSettings,
            voucherType: row.type,
        });
        try {
            await createPrintTemplate(payload);
            toast.success("Template duplicated");
            await refresh();
        } catch {
            toast.error("Failed to duplicate");
        }
    };

    const handleDelete = async (row) => {
        if (row.isDefault) { toast.error("Cannot delete default template"); return; }
        if (!window.confirm(`Delete "${row.name}"?`)) return;
        try {
            await deletePrintTemplate(row.id);
            toast.success("Template deleted");
            await refresh();
        } catch {
            toast.error("Failed to delete");
        }
    };

    const handleSetDefault = async (row) => {
        try {
            const sameType = templates.filter(t => t.type === row.type);
            await Promise.all(sameType.map(t => {
                const meta = typeMetaByType(t.type);
                return updatePrintTemplate(t.id, buildPayload({
                    category: meta.category,
                    name: t.name,
                    isDefault: t.id === row.id,
                    settings: t.settings,
                    voucherType: t.type,
                }));
            }));
            toast.success("Default template updated");
            await refresh();
        } catch {
            toast.error("Failed to set default");
        }
    };

    const handleExport = (row) => {
        const exportData = {
            name: row.name, category: row.category, type: row.type,
            paperSize: row.paperSize, orientation: row.orientation,
            settings: row.settings,
        };
        const uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`;
        const a = document.createElement("a");
        a.href = uri;
        a.download = `${row.name.replace(/\s+/g, "_")}.json`;
        a.click();
        toast.success("Template exported");
    };

    const stats = useMemo(() => ({
        total: templates.length,
        defaults: templates.filter(t => t.isDefault).length,
        custom: templates.filter(t => !t.isDefault).length,
        types: TEMPLATE_TYPES.length,
    }), [templates]);

    // ── Designer renders ──────────────────────────────────────────────────────

    if (showChequeDesigner) {
        return (
            <ChequePrintingDesigner
                templateName={chequeTemplateName}
                initialSettings={chequeSettings}
                onClose={() => { setShowChequeDesigner(false); setEditingTemplate(null); }}
                onSave={handleChequeSave}
            />
        );
    }

    if (showDesigner) {
        return (
            <FinancialVoucherDesigner
                voucherType={designerType}
                templateName={designerTemplateName}
                initialSettings={designerSettings}
                onClose={() => { setShowDesigner(false); setEditingTemplate(null); }}
                onSave={handleVoucherSave}
            />
        );
    }

    // ── Type drill-down view ──────────────────────────────────────────────────

    if (selectedType) {
        const typeTemplates = getTemplatesByType(selectedType);
        const typeInfo = typeMetaByType(selectedType);

        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="max-w-[1800px] mx-auto p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <button
                                    onClick={() => setSelectedType(null)}
                                    className="hover:text-slate-900 flex items-center gap-1"
                                >
                                    <span>Financials</span>
                                    <ChevronRight className="h-4 w-4" />
                                    <span>Print & Email Templates</span>
                                </button>
                                <ChevronRight className="h-4 w-4" />
                                <span className="text-slate-900 font-medium">{typeInfo.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedType(null)} className="hover:bg-slate-200 p-1 rounded-full transition-colors" title="Go back">
                                    <ChevronLeft className="h-6 w-6 text-slate-600" />
                                </button>
                                <FileText className="h-6 w-6 text-[#F5C742]" />
                                <h1 className="text-3xl font-semibold text-[#1E1E1E]">
                                    {typeInfo.label} Templates
                                </h1>
                            </div>
                            <p className="text-sm text-slate-600">{typeInfo.description}</p>
                        </div>
                        <button
                            onClick={() => openDesigner(selectedType)}
                            className="inline-flex items-center bg-[#F5C742] hover:bg-[#F5C742]/90 text-black text-sm font-medium rounded-md px-4 py-2"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Create New Template
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-center py-12 text-slate-500">Loading…</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {typeTemplates.map(template => (
                                <div key={template.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
                                    <div className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-lg mb-2">{template.name}</h3>
                                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                                    {template.isDefault && <span className="inline-block bg-[#F5C742] text-black text-xs font-medium rounded px-2 py-0.5">Default</span>}
                                                    <span className="inline-block border border-gray-300 text-xs font-medium rounded px-2 py-0.5">{template.paperSize}</span>
                                                </div>
                                            </div>
                                            <div
                                                className="w-16 h-16 rounded-lg flex items-center justify-center"
                                                style={{ backgroundColor: `${template.primaryColor}20` }}
                                            >
                                                <FileText className="h-8 w-8" style={{ color: template.primaryColor }} />
                                            </div>
                                        </div>

                                        <div className="space-y-2 text-sm text-slate-600 mb-4">
                                            <div className="flex items-center justify-between">
                                                <span>Last modified:</span>
                                                <span className="font-medium">{template.lastModified}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span>Paper size:</span>
                                                <span className="font-medium">{template.paperSize}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span>Orientation:</span>
                                                <span className="font-medium capitalize">{template.orientation}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button onClick={() => openDesigner(template.type, template)} className="flex-1 inline-flex items-center justify-center border border-gray-300 hover:bg-gray-50 text-sm rounded-md px-3 py-1.5">
                                                <Edit className="h-3 w-3 mr-1" />
                                                Edit
                                            </button>
                                            <button onClick={() => handleDuplicate(template)} title="Duplicate" className="inline-flex items-center justify-center border border-gray-300 hover:bg-gray-50 text-sm rounded-md px-2 py-1.5">
                                                <Copy className="h-3 w-3" />
                                            </button>
                                            <button onClick={() => handleExport(template)} title="Export" className="inline-flex items-center justify-center border border-gray-300 hover:bg-gray-50 text-sm rounded-md px-2 py-1.5">
                                                <Download className="h-3 w-3" />
                                            </button>
                                            {!template.isDefault && (
                                                <button onClick={() => handleDelete(template)} title="Delete" className="inline-flex items-center justify-center border border-gray-300 text-red-600 hover:bg-red-50 hover:border-red-300 text-sm rounded-md px-2 py-1.5">
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>

                                        {!template.isDefault && (
                                            <button
                                                onClick={() => handleSetDefault(template)}
                                                className="w-full mt-2 inline-flex items-center justify-center text-[#F5C742] hover:bg-[#F5C742]/10 text-sm rounded-md px-3 py-1.5"
                                            >
                                                <Check className="h-3 w-3 mr-1" />
                                                Set as Default
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {typeTemplates.length === 0 && (
                                <div className="col-span-full">
                                    <div className="bg-white border-dashed border-2 border-gray-300 rounded-lg py-16 text-center">
                                        <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                                        <h3 className="font-semibold text-lg mb-2">No templates yet</h3>
                                        <p className="text-sm text-slate-600 mb-4">
                                            Create your first {typeInfo.label.toLowerCase()} template
                                        </p>
                                        <button
                                            onClick={() => openDesigner(selectedType)}
                                            className="inline-flex items-center bg-[#F5C742] hover:bg-[#F5C742]/90 text-black text-sm font-medium rounded-md px-4 py-2"
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Create Template
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Main Dashboard ────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            <div className="max-w-[1800px] mx-auto p-6 space-y-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>Financials</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className="text-slate-900 font-medium">Print & Email Templates</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Printer className="h-6 w-6 text-[#F5C742]" />
                        <h1 className="text-3xl font-semibold text-[#1E1E1E]">
                            Print & Email Templates
                        </h1>
                    </div>
                    <p className="text-sm text-slate-600">
                        Design professional templates for financial vouchers, receipts, and cheque printing with live preview
                    </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { label: "Total Templates", value: stats.total, color: "blue" },
                        { label: "Default Templates", value: stats.defaults, color: "green" },
                        { label: "Custom Templates", value: stats.custom, color: "purple" },
                        { label: "Voucher Types", value: stats.types, color: "orange" },
                    ].map((stat, i) => {
                        const colorBg = { blue: "bg-blue-100", green: "bg-green-100", purple: "bg-purple-100", orange: "bg-orange-100" }[stat.color];
                        const colorFg = { blue: "text-blue-600", green: "text-green-600", purple: "text-purple-600", orange: "text-orange-600" }[stat.color];
                        return (
                            <div key={i} className="bg-white border border-gray-200 rounded-lg p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">{stat.label}</p>
                                        <p className="text-2xl font-bold mt-1">{stat.value}</p>
                                    </div>
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorBg}`}>
                                        <FileText className={`h-6 w-6 ${colorFg}`} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Template Types Grid */}
                <div>
                    <h2 className="text-xl font-semibold mb-4">Voucher Templates</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {TEMPLATE_TYPES.map(type => {
                            const typeTemplates = getTemplatesByType(type.id);
                            const defaultTemplate = typeTemplates.find(t => t.isDefault);

                            return (
                                <button
                                    key={type.id}
                                    onClick={() => setSelectedType(type.id)}
                                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-[#F5C742] transition-all text-left group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-3 rounded-lg bg-[#F5C742]/10 group-hover:bg-[#F5C742]/20 transition-colors">
                                            <FileText className="h-6 w-6 text-[#F5C742]" />
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-[#F5C742] transition-colors" />
                                    </div>

                                    <h3 className="font-semibold text-base mb-1">{type.label}</h3>
                                    <p className="text-xs text-slate-600 mb-3 leading-relaxed">{type.description}</p>

                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-500">
                                            {typeTemplates.length} template{typeTemplates.length !== 1 ? "s" : ""}
                                        </span>
                                        {defaultTemplate && (
                                            <span className="inline-block border border-gray-300 text-xs rounded px-2 py-0.5">
                                                {defaultTemplate.paperSize}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-[#F5C742] hover:bg-[#F5C742]/5 transition-all text-left">
                            <div className="p-3 rounded-lg bg-blue-50">
                                <Upload className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Import Template</p>
                                <p className="text-xs text-slate-600">Upload from JSON file</p>
                            </div>
                        </button>

                        <button className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-[#F5C742] hover:bg-[#F5C742]/5 transition-all text-left">
                            <div className="p-3 rounded-lg bg-green-50">
                                <Download className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Export All Templates</p>
                                <p className="text-xs text-slate-600">Download as backup</p>
                            </div>
                        </button>

                        <button
                            onClick={refresh}
                            className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-[#F5C742] hover:bg-[#F5C742]/5 transition-all text-left"
                        >
                            <div className="p-3 rounded-lg bg-purple-50">
                                <RefreshCw className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Refresh</p>
                                <p className="text-xs text-slate-600">Reload templates from server</p>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Feature Tips */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-blue-200 bg-blue-50 rounded-lg p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Printer className="h-5 w-5 text-blue-600" />
                            Template Features
                        </h3>
                        <ul className="space-y-2 text-sm text-blue-900">
                            {[
                                "Live print preview with zoom controls",
                                "Per-voucher section and field toggles",
                                "Signature strip with stamp placeholder",
                                "Cheque printing with MICR stub",
                            ].map(f => (
                                <li key={f} className="flex items-start gap-2">
                                    <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <span>{f}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="border border-green-200 bg-green-50 rounded-lg p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Mail className="h-5 w-5 text-green-600" />
                            Email & Print Tips
                        </h3>
                        <ul className="space-y-2 text-sm text-green-900">
                            {[
                                "Templates auto-apply when emailing vouchers",
                                "Use variables like {number}, {recipient} in emails",
                                "PDFs automatically attached to outgoing emails",
                                "Set one template as default per voucher type",
                            ].map(f => (
                                <li key={f} className="flex items-start gap-2">
                                    <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <span>{f}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
