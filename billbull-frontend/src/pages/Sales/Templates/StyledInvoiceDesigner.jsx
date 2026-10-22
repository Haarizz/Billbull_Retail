import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    AlignLeft,
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    Download,
    Eye,
    FileText,
    Loader2,
    Palette,
    Printer,
    RotateCcw,
    Save,
    Search,
    Type
} from "lucide-react";
import toast from "react-hot-toast";
import CompanyContext from "@billbull/shared/context/CompanyContext";
import BranchContext from "@billbull/shared/context/BranchContext";
import {
    downloadPdfViaServer,
    generatePrintHtmlAsync,
    printHtml,
    renderPdfViaServer
} from "@billbull/shared/utils/printGenerator";
import { applyTaxAwareDisplayOptions } from "@billbull/shared/pages/Sales/POS/posPrintUtils";
import {
    STYLED_INVOICE_COLORS,
    STYLED_INVOICE_SECTIONS,
    defaultStyledInvoiceSettings,
    resolveStyledInvoiceColors,
    salesInvoiceLayoutStyleMeta
} from "@billbull/shared/utils/salesInvoiceStyledLayouts";
import { buildDocumentHeaderProfile } from "../../../utils/branchPrintProfile";

// Designer for the styled Sales Invoice layouts (Minimal Bilingual, Column
// Bilingual, Elegant).
//
// The preview is built exactly the way SalesInvoice.jsx builds a real print:
// same renderer (generatePrintHtmlAsync), same branch header profile
// (buildDocumentHeaderProfile), same no-tax filter (applyTaxAwareDisplayOptions).
// "Print view" sends that HTML to the same server PDF endpoint Download PDF
// uses, and "Test print" hands it to the same printHtml() the Print button
// calls — so what the designer shows is what the invoice prints.

const SAMPLE_COMPANY = {
    companyName: "Your Company LLC",
    localName: "شركتك ذ.م.م",
    address: "Building 123, Business Bay, Dubai, UAE",
    phone: "+971 4 555 0148",
    email: "accounts@example.ae",
    trn: "100000000000003",
    crn: "CN-1234567",
    currency: "AED",
    bankName: "Emirates NBD",
    bankIban: "AE07 0331 2345 6789 0123 456"
};

const SAMPLE_LINES = [
    { name: "Pro Annual License", localName: "ترخيص برو - سنوي", price: 2900 },
    { name: "Setup, Onboarding & Training", localName: "التثبيت والإعداد والتدريب", desc: "Remote onboarding, 2 sessions", price: 500, disc: 10 },
    { name: "Annual Support & Maintenance", localName: "الدعم والصيانة السنوية", price: 600 },
    { name: "Barcode Scanner – Wireless", localName: "ماسح الباركود اللاسلكي", price: 420 },
    { name: "Thermal Receipt Printer 80mm", localName: "طابعة إيصالات حرارية", price: 690 },
    { name: "Cash Drawer – Heavy Duty", localName: "درج نقدي", price: 380 }
];

const round2 = (value) => Math.round(value * 100) / 100;

// Builds print data with the same shape and money fields SalesInvoice.jsx sends.
const buildSampleInvoice = (scenario) => {
    const taxRate = scenario === "no-tax" ? 0 : 5;
    const lineCount = scenario === "long" ? 24 : 3;
    const items = Array.from({ length: lineCount }, (_, index) => {
        const base = SAMPLE_LINES[index % SAMPLE_LINES.length];
        const qty = index % 4 === 3 ? 2 : 1;
        const gross = qty * base.price;
        const discountAmount = round2(gross * (base.disc || 0) / 100);
        const taxableAmount = gross - discountAmount;
        const taxAmt = round2(taxableAmount * taxRate / 100);
        return {
            code: String(index + 1).padStart(2, "0"),
            name: index >= SAMPLE_LINES.length ? `${base.name} (${Math.floor(index / SAMPLE_LINES.length) + 1})` : base.name,
            localName: base.localName,
            desc: base.desc || "",
            unit: "PCS",
            qty,
            price: base.price,
            disc: base.disc || 0,
            discountAmount,
            tax: taxRate,
            taxAmt,
            taxableAmount,
            total: round2(taxableAmount + taxAmt)
        };
    });
    const subTotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = items.reduce((sum, item) => sum + item.discountAmount, 0);
    const tax = round2(items.reduce((sum, item) => sum + item.taxAmt, 0));
    const taxable = subTotal - discount;
    const grandTotal = round2(taxable + tax);
    return {
        title: taxRate > 0 ? "Tax Invoice" : "Sales Invoice",
        docNo: "INV-2026-0734",
        date: "2026-10-09",
        vatMode: "EXCLUSIVE",
        customer: {
            name: "Green Mart Retail LLC",
            address: "Shop 42, Al Quoz Industrial 3, Dubai, UAE",
            shippingAddress: "Warehouse 7, Al Quoz Industrial 4, Dubai, UAE",
            phone: "+971 50 555 0198",
            email: "accounts@greenmart.ae",
            trn: "200053827000003"
        },
        items,
        totals: {
            subTotal,
            taxableAmount: taxable,
            tax,
            grandTotal,
            itemDiscountAmount: discount,
            footerDiscountAmount: 0,
            billDiscountAmount: discount,
            discountAmount: discount,
            currency: "AED"
        },
        meta: {
            status: "Unpaid",
            paymentMode: "Credit",
            paymentTerm: "Net 30 Days",
            dueDate: "2026-11-08",
            poNumber: "PO-2026-0391",
            linkedDeliveryNote: "DN-2026-0118",
            location: "Dubai – Main Branch",
            notes: "Please quote the invoice number on your payment.",
            amountPaid: 1000
        }
    };
};

const SCENARIOS = [
    { id: "tax", label: "Tax invoice" },
    { id: "no-tax", label: "No-tax invoice" },
    { id: "long", label: "Long invoice (24 lines)" }
];

const FONT_OPTIONS = {
    "minimal-bilingual": [
        { label: "Inter", value: "Inter, 'Helvetica Neue', Arial, sans-serif" },
        { label: "DM Sans", value: "'DM Sans', Arial, sans-serif" },
        { label: "Arial", value: "Arial, Helvetica, sans-serif" },
        { label: "Georgia", value: "Georgia, 'Times New Roman', serif" }
    ],
    "column-bilingual": [
        { label: "Arial", value: "Arial, 'Helvetica Neue', sans-serif" },
        { label: "Inter", value: "Inter, 'Helvetica Neue', Arial, sans-serif" },
        { label: "DM Sans", value: "'DM Sans', Arial, sans-serif" }
    ],
    elegant: [
        { label: "Arial", value: "Arial, Helvetica, sans-serif" },
        { label: "Helvetica", value: "Helvetica, sans-serif" },
        { label: "Inter", value: "Inter, sans-serif" },
        { label: "Georgia", value: "Georgia, serif" },
        { label: "Times New Roman", value: "'Times New Roman', serif" },
        { label: "Courier New", value: "'Courier New', monospace" }
    ]
};

const ACCENT_PRESETS = {
    "minimal-bilingual": ["#0f766e", "#0d9488", "#0369a1", "#1d4ed8", "#7c3aed", "#b91c1c", "#c2410c", "#374151", "#047857", "#0e7490"],
    "column-bilingual": ["#0f766e", "#0d9488", "#0369a1", "#1d4ed8", "#7c3aed", "#b91c1c", "#b45309", "#374151", "#047857", "#0e7490"],
    elegant: ["#080808", "#1D4ED8", "#7C3AED", "#DC2626", "#059669", "#B45309", "#0F172A", "#374151"]
};

const PANELS = [
    { id: "style", label: "Style", icon: Palette },
    { id: "sections", label: "Sections", icon: AlignLeft },
    { id: "typography", label: "Typography", icon: Type }
];

// A4 at 96 dpi, and the printable height per sheet: the layouts print with a
// 12mm top/bottom @page margin and pad the same 12mm in on screen.
const MM = 96 / 25.4;
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PAGE_MARGIN_PX = 12 * MM;
const PRINTABLE_HEIGHT_PX = (297 - 24) * MM;

const isOn = (settings, key) => settings[key] !== false;

// Sized with inline styles: the app's global button rules otherwise stretch a
// Tailwind-sized switch and push the knob outside the track.
function Switch({ value, onChange, label }) {
    return (
        <span
            role="switch"
            tabIndex={0}
            aria-checked={value}
            aria-label={label}
            onClick={(e) => {
                e.stopPropagation();
                onChange(!value);
            }}
            onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(!value);
                }
            }}
            style={{
                position: "relative",
                display: "inline-block",
                flexShrink: 0,
                width: 36,
                height: 20,
                borderRadius: 10,
                background: value ? "#F5C742" : "#D1D5DB",
                cursor: "pointer",
                transition: "background 0.2s"
            }}
        >
            <span
                style={{
                    position: "absolute",
                    top: 3,
                    left: value ? 19 : 3,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s"
                }}
            />
        </span>
    );
}

function FieldLabel({ children }) {
    return <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{children}</p>;
}

function SectionGroup({ title, toggles, settings, open, onToggleOpen, onChange }) {
    const onCount = toggles.filter(([key]) => isOn(settings, key)).length;
    const allOn = onCount === toggles.length;
    return (
        <div className="overflow-hidden rounded-lg border border-gray-200">
            <div
                role="button"
                tabIndex={0}
                onClick={onToggleOpen}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleOpen();
                    }
                }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 ${open ? "bg-[#FFF8E7]" : "bg-white hover:bg-gray-50"}`}
            >
                {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                <span className="flex-1 text-xs font-bold text-gray-700">{title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${onCount === 0 ? "bg-gray-100 text-gray-400" : "bg-white text-[#A16207]"}`}>
                    {onCount}/{toggles.length}
                </span>
                <Switch
                    label={`${allOn ? "Hide" : "Show"} all in ${title}`}
                    value={allOn}
                    onChange={() => onChange(Object.fromEntries(toggles.map(([key]) => [key, !allOn])))}
                />
            </div>
            {open && (
                <div className="border-t border-gray-100 px-3 py-1">
                    {toggles.map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
                            <span className="text-xs text-gray-600">{label}</span>
                            <Switch label={label} value={isOn(settings, key)} onChange={(value) => onChange({ [key]: value })} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// One section's colour slots. A slot the template has not set shows its
// effective colour (often the accent) and keeps following it until changed.
function ColorGroup({ title, slots, settings, colors, open, onToggleOpen, onChange, onReset }) {
    const customCount = slots.filter(([key]) => settings[key]).length;
    return (
        <div className="overflow-hidden rounded-lg border border-gray-200">
            <div
                role="button"
                tabIndex={0}
                onClick={onToggleOpen}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleOpen();
                    }
                }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${open ? "bg-[#FFF8E7]" : "bg-white hover:bg-gray-50"}`}
            >
                {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                <span className="flex-1 text-xs font-bold text-gray-700">{title}</span>
                <span className="flex -space-x-1">
                    {slots.slice(0, 4).map(([key]) => (
                        <span key={key} className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ background: colors[key] }} />
                    ))}
                </span>
                {customCount > 0 && (
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#A16207]">{customCount} custom</span>
                )}
            </div>
            {open && (
                <div className="border-t border-gray-100 px-3 py-1">
                    {slots.map(([key, label, fallback]) => {
                        const custom = Boolean(settings[key]);
                        const effective = colors[key];
                        return (
                            <div key={key} className="flex items-center gap-2 border-b border-gray-50 py-1.5 last:border-0">
                                <span className="flex-1 text-xs text-gray-600">
                                    {label}
                                    {!custom && fallback === "accent" && (
                                        <span className="ml-1 rounded bg-gray-100 px-1 text-[9px] font-semibold uppercase text-gray-400">accent</span>
                                    )}
                                </span>
                                <input
                                    type="color"
                                    value={effective.length === 7 ? effective : "#000000"}
                                    onChange={(e) => onChange({ [key]: e.target.value })}
                                    className="h-6 w-6 cursor-pointer rounded border border-gray-200 p-0"
                                    aria-label={`${title} ${label} colour`}
                                />
                                <input
                                    value={custom ? settings[key] : effective}
                                    onChange={(e) => onChange({ [key]: e.target.value })}
                                    className={`h-6 w-[70px] rounded border border-gray-200 px-1.5 font-mono text-[10px] focus:outline-none ${custom ? "text-gray-700" : "text-gray-400"}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => onReset([key])}
                                    disabled={!custom}
                                    title="Reset to default"
                                    className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function StyledInvoiceDesigner({ layoutStyle, templateName, initialSettings = {}, onClose, onSave }) {
    const style = salesInvoiceLayoutStyleMeta(layoutStyle);
    const company = useContext(CompanyContext)?.company;
    const branchContext = useContext(BranchContext);
    const branches = useMemo(() => branchContext?.branches || [], [branchContext?.branches]);

    const [settings, setSettings] = useState(() => ({
        ...defaultStyledInvoiceSettings(layoutStyle, templateName),
        ...initialSettings,
        templateName: templateName || initialSettings.templateName || style?.label,
        layoutStyle,
        paperSize: "A4",
        orientation: "portrait",
        paperLocked: true
    }));
    const [savedSnapshot] = useState(() => JSON.stringify(settings));
    const [activePanel, setActivePanel] = useState("sections");
    const [zoom, setZoom] = useState(1);
    const [scenario, setScenario] = useState("tax");
    const [branchId, setBranchId] = useState(
        () => branchContext?.activeBranch?.id ?? branchContext?.defaultBranch?.id ?? null
    );
    const [viewMode, setViewMode] = useState("live");
    const [previewHtml, setPreviewHtml] = useState("");
    const [previewHeight, setPreviewHeight] = useState(A4_HEIGHT_PX);
    const [pdfUrl, setPdfUrl] = useState("");
    const [pdfState, setPdfState] = useState("idle");
    const [busyAction, setBusyAction] = useState("");
    const [sectionQuery, setSectionQuery] = useState("");
    const sectionGroups = STYLED_INVOICE_SECTIONS[layoutStyle] || [];
    const [openGroups, setOpenGroups] = useState(() => new Set(sectionGroups.slice(0, 1).map(([group]) => group)));
    const iframeRef = useRef(null);

    const colorGroups = STYLED_INVOICE_COLORS[layoutStyle] || [];
    const [openColorGroups, setOpenColorGroups] = useState(() => new Set());

    const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }));
    // Removing the key (rather than storing the default) lets the slot keep
    // following the accent / body text colour.
    const resetColors = (keys) => setSettings((prev) => {
        const next = { ...prev };
        keys.forEach((key) => delete next[key]);
        return next;
    });
    const isDirty = JSON.stringify(settings) !== savedSnapshot;

    const companyProfile = useMemo(() => {
        if (!company?.companyName) return SAMPLE_COMPANY;
        return buildDocumentHeaderProfile({ company, branches, branchId });
    }, [company, branches, branchId]);

    // The exact template + data pair a real print of this sample would use.
    const buildPrintHtml = async () => {
        const sample = buildSampleInvoice(scenario);
        const template = applyTaxAwareDisplayOptions({
            category: "Sales Invoice",
            name: settings.templateName,
            templateType: "FULL",
            paperSize: "A4",
            orientation: "Portrait",
            columns: "{}",
            termsContent: settings.termsText || "",
            displayOptions: JSON.stringify({ salesDesigner: "document", salesDesignerSettings: settings })
        }, sample.totals.tax > 0);
        return generatePrintHtmlAsync(template, sample, { companyProfile });
    };

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const html = await buildPrintHtml();
                if (!cancelled) setPreviewHtml(html);
            } catch (error) {
                console.error("Styled invoice preview failed", error);
            }
        }, 150);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // buildPrintHtml reads exactly these inputs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings, scenario, companyProfile]);

    // Print view: the same server PDF Download PDF produces, re-rendered after
    // edits settle.
    useEffect(() => {
        if (viewMode !== "print" || !previewHtml) return undefined;
        let cancelled = false;
        setPdfState("loading");
        const timer = setTimeout(async () => {
            try {
                const blob = await renderPdfViaServer(previewHtml, "invoice-preview");
                if (cancelled) return;
                setPdfUrl(URL.createObjectURL(blob));
                setPdfState("ready");
            } catch (error) {
                console.error("Print preview failed", error);
                if (!cancelled) setPdfState("error");
            }
        }, 700);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [viewMode, previewHtml]);

    // Frees each rendered PDF once it is replaced or the designer closes.
    useEffect(() => () => {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    }, [pdfUrl]);

    // The sheet grows past one A4 when content overflows, so size the frame to it.
    const syncPreviewHeight = () => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc?.documentElement) return;
        setPreviewHeight(Math.max(A4_HEIGHT_PX, doc.documentElement.scrollHeight));
    };

    const contentHeight = Math.max(0, previewHeight - 2 * PAGE_MARGIN_PX);
    const approxPages = Math.max(1, Math.ceil((contentHeight - 2) / PRINTABLE_HEIGHT_PX));
    const pageBreaks = Array.from({ length: approxPages - 1 }, (_, index) => PAGE_MARGIN_PX + (index + 1) * PRINTABLE_HEIGHT_PX);

    const runAction = async (action) => {
        setBusyAction(action);
        try {
            const html = await buildPrintHtml();
            if (action === "print") {
                printHtml(html);
            } else {
                await downloadPdfViaServer(html, `${settings.templateName || "Invoice"} - sample`);
            }
        } catch (error) {
            console.error(`Template ${action} failed`, error);
            toast.error(action === "print" ? "Test print failed" : "Could not create the PDF");
        } finally {
            setBusyAction("");
        }
    };

    const handleClose = () => {
        if (isDirty && !window.confirm("Discard your unsaved changes to this template?")) return;
        onClose();
    };

    const query = sectionQuery.trim().toLowerCase();
    const visibleGroups = sectionGroups
        .map(([group, toggles]) => [
            group,
            query && !group.toLowerCase().includes(query)
                ? toggles.filter(([, label]) => label.toLowerCase().includes(query))
                : toggles
        ])
        .filter(([, toggles]) => toggles.length > 0);
    const toggleGroup = (group) => setOpenGroups((previous) => {
        const next = new Set(previous);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        return next;
    });
    const allExpanded = sectionGroups.every(([group]) => openGroups.has(group));

    const fonts = FONT_OPTIONS[layoutStyle] || [];
    const accents = ACCENT_PRESETS[layoutStyle] || [];
    const sectionColors = resolveStyledInvoiceColors(layoutStyle, settings, settings.accentColor);
    const customColorKeys = colorGroups.flatMap(([, slots]) => slots.map(([key]) => key)).filter((key) => settings[key]);
    const selectClass = "h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]";
    const toolButton = "flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100"
                        aria-label="Back to templates"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="h-5 w-px bg-gray-200" />
                    <div>
                        <p className="text-[11px] text-gray-400">Sales Invoice · A4 · Portrait</p>
                        <h1 className="text-sm font-bold text-gray-800">
                            {settings.templateName}
                            {isDirty && <span className="ml-2 text-[10px] font-semibold text-[#A16207]">• Unsaved</span>}
                        </h1>
                    </div>
                    <span className="ml-2 rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-2 py-0.5 text-[10px] font-bold text-[#A16207]">
                        {style?.label}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onSave(settings)}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-[#F5C742] px-4 text-xs font-bold text-black hover:bg-[#e6b932]"
                    >
                        <Save className="h-3.5 w-3.5" /> Save Template
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
                    <div className="flex shrink-0 border-b border-gray-200">
                        {PANELS.map((panel) => {
                            const Icon = panel.icon;
                            return (
                                <button
                                    key={panel.id}
                                    type="button"
                                    onClick={() => setActivePanel(panel.id)}
                                    className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[11px] font-semibold transition-all ${
                                        activePanel === panel.id
                                            ? "border-[#F5C742] text-gray-800"
                                            : "border-transparent text-gray-400 hover:text-gray-600"
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {panel.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        {activePanel === "style" && (
                            <>
                                <div>
                                    <FieldLabel>Template Name</FieldLabel>
                                    <input
                                        value={settings.templateName}
                                        onChange={(e) => update({ templateName: e.target.value })}
                                        className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Accent Color</FieldLabel>
                                    <div className="mb-2 grid grid-cols-5 gap-2">
                                        {accents.map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                title={color}
                                                onClick={() => update({ accentColor: color })}
                                                className="flex h-8 w-full items-center justify-center rounded-lg border-2 transition-all"
                                                style={{ background: color, borderColor: settings.accentColor === color ? "#F5C742" : "transparent" }}
                                            >
                                                {settings.accentColor === color && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={settings.accentColor}
                                            onChange={(e) => update({ accentColor: e.target.value })}
                                            className="h-8 w-8 cursor-pointer rounded-lg border border-gray-200 p-0.5"
                                        />
                                        <input
                                            value={settings.accentColor}
                                            onChange={(e) => update({ accentColor: e.target.value })}
                                            className="h-8 flex-1 rounded-lg border border-gray-200 px-2 font-mono text-xs focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {colorGroups.length > 0 && (
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <FieldLabel>Section Colors</FieldLabel>
                                            {customColorKeys.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => resetColors(customColorKeys)}
                                                    className="mb-2 text-[10px] font-semibold text-[#A16207] hover:underline"
                                                >
                                                    Reset all
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            {colorGroups.map(([group, slots]) => (
                                                <ColorGroup
                                                    key={group}
                                                    title={group}
                                                    slots={slots}
                                                    settings={settings}
                                                    colors={sectionColors}
                                                    open={openColorGroups.has(group)}
                                                    onToggleOpen={() => setOpenColorGroups((previous) => {
                                                        const next = new Set(previous);
                                                        if (next.has(group)) next.delete(group);
                                                        else next.add(group);
                                                        return next;
                                                    })}
                                                    onChange={update}
                                                    onReset={resetColors}
                                                />
                                            ))}
                                        </div>
                                        <p className="mt-2 text-[11px] leading-4 text-gray-400">
                                            Colors marked <span className="font-semibold">accent</span> follow the accent color until you change them.
                                        </p>
                                    </div>
                                )}
                                {layoutStyle === "column-bilingual" && (
                                    <>
                                        <div>
                                            <FieldLabel>Tagline</FieldLabel>
                                            <input
                                                value={settings.tagline || ""}
                                                onChange={(e) => update({ tagline: e.target.value })}
                                                placeholder="e.g. SMART RETAIL. SIMPLE BUSINESS."
                                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                                            />
                                        </div>
                                        <div>
                                            <FieldLabel>Footer Message</FieldLabel>
                                            <input
                                                value={settings.thankYouText || ""}
                                                onChange={(e) => update({ thankYouText: e.target.value })}
                                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                                            />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <FieldLabel>Terms &amp; Conditions</FieldLabel>
                                    <textarea
                                        rows={5}
                                        value={settings.termsText || ""}
                                        onChange={(e) => update({ termsText: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                                    />
                                </div>
                                <p className="rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] px-3 py-2 text-[11px] leading-4 text-[#7c5a00]">
                                    Company name, Arabic name, logo, TRN, address and bank details come from
                                    Company Settings and the invoice's branch. VAT rows hide automatically on
                                    invoices that carry no tax.
                                </p>
                            </>
                        )}

                        {activePanel === "sections" && (
                            <>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                                    <input
                                        value={sectionQuery}
                                        onChange={(e) => setSectionQuery(e.target.value)}
                                        placeholder="Find a section…"
                                        className="h-8 w-full rounded-lg border border-gray-200 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] leading-4 text-gray-400">Number, title, lines and grand total always print.</p>
                                    {!query && (
                                        <button
                                            type="button"
                                            onClick={() => setOpenGroups(allExpanded ? new Set() : new Set(sectionGroups.map(([group]) => group)))}
                                            className="shrink-0 text-[10px] font-semibold text-[#A16207] hover:underline"
                                        >
                                            {allExpanded ? "Collapse all" : "Expand all"}
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {visibleGroups.map(([group, toggles]) => (
                                        <SectionGroup
                                            key={group}
                                            title={group}
                                            toggles={toggles}
                                            settings={settings}
                                            open={Boolean(query) || openGroups.has(group)}
                                            onToggleOpen={() => toggleGroup(group)}
                                            onChange={update}
                                        />
                                    ))}
                                    {visibleGroups.length === 0 && (
                                        <p className="py-6 text-center text-xs text-gray-400">No section matches “{sectionQuery}”.</p>
                                    )}
                                </div>
                            </>
                        )}

                        {activePanel === "typography" && (
                            <div>
                                <FieldLabel>Font Family</FieldLabel>
                                <div className="space-y-1.5">
                                    {fonts.map((font) => (
                                        <button
                                            key={font.value}
                                            type="button"
                                            onClick={() => update({ fontFamily: font.value })}
                                            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-all ${
                                                settings.fontFamily === font.value
                                                    ? "border-[#F5C742] bg-[#FFF8E7]"
                                                    : "border-gray-200 hover:border-gray-300"
                                            }`}
                                            style={{ fontFamily: font.value }}
                                        >
                                            <span className={settings.fontFamily === font.value ? "font-semibold text-gray-800" : "text-gray-600"}>
                                                {font.label}
                                            </span>
                                            {settings.fontFamily === font.value && <Check className="h-3.5 w-3.5 text-gray-700" />}
                                        </button>
                                    ))}
                                </div>
                                {layoutStyle !== "elegant" && (
                                    <p className="mt-3 text-xs text-gray-400">Arabic text always uses Tahoma for correct RTL rendering.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-1 flex-col overflow-hidden bg-gray-100">
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
                        <div className="flex rounded-lg border border-gray-200 p-0.5">
                            {[["live", "Live", Eye], ["print", "Print view", FileText]].map(([mode, label, Icon]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setViewMode(mode)}
                                    className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${
                                        viewMode === mode ? "bg-[#F5C742] text-black" : "text-gray-500 hover:text-gray-800"
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" /> {label}
                                </button>
                            ))}
                        </div>
                        <select value={scenario} onChange={(e) => setScenario(e.target.value)} className={selectClass} title="Sample invoice">
                            {SCENARIOS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                        {company?.companyName && branches.length > 1 && (
                            <select
                                value={branchId ?? ""}
                                onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
                                className={selectClass}
                                title="Branch header to preview"
                            >
                                <option value="">Company header</option>
                                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                            </select>
                        )}
                        {viewMode === "live" && (
                            <span className="text-[11px] text-gray-400">≈ {approxPages} page{approxPages === 1 ? "" : "s"}</span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            {viewMode === "live" && (
                                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1">
                                    <button
                                        type="button"
                                        onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
                                        className="flex h-5 w-5 items-center justify-center text-base leading-none text-gray-400 hover:text-gray-700"
                                        aria-label="Zoom out"
                                    >−</button>
                                    <span className="w-9 text-center text-xs font-semibold text-gray-600">{Math.round(zoom * 100)}%</span>
                                    <button
                                        type="button"
                                        onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}
                                        className="flex h-5 w-5 items-center justify-center text-base leading-none text-gray-400 hover:text-gray-700"
                                        aria-label="Zoom in"
                                    >+</button>
                                </div>
                            )}
                            <button type="button" onClick={() => runAction("print")} disabled={Boolean(busyAction)} className={toolButton}>
                                {busyAction === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                Test print
                            </button>
                            <button type="button" onClick={() => runAction("pdf")} disabled={Boolean(busyAction)} className={toolButton}>
                                {busyAction === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                Sample PDF
                            </button>
                        </div>
                    </div>

                    {viewMode === "live" ? (
                        <div className="flex flex-1 items-start justify-center overflow-auto p-8">
                            <div style={{ position: "relative", width: A4_WIDTH_PX * zoom, height: previewHeight * zoom, flexShrink: 0 }}>
                                <iframe
                                    ref={iframeRef}
                                    title="Invoice preview"
                                    srcDoc={previewHtml}
                                    onLoad={syncPreviewHeight}
                                    style={{
                                        width: A4_WIDTH_PX,
                                        height: previewHeight,
                                        border: 0,
                                        background: "#fff",
                                        boxShadow: "0 4px 40px rgba(0,0,0,0.12)",
                                        transform: `scale(${zoom})`,
                                        transformOrigin: "top left"
                                    }}
                                />
                                {pageBreaks.map((top, index) => (
                                    <div
                                        key={top}
                                        style={{ position: "absolute", left: 0, right: 0, top: top * zoom, borderTop: "2px dashed #F59E0B", pointerEvents: "none" }}
                                    >
                                        <span className="absolute -top-2.5 right-1 rounded bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                                            ≈ page {index + 2}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="relative flex-1">
                            {pdfUrl && (
                                <iframe title="Print preview" src={`${pdfUrl}#view=FitH`} className="h-full w-full border-0" />
                            )}
                            {pdfState === "loading" && (
                                <div className="absolute right-4 top-3 flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs text-gray-600 shadow">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering the printed pages…
                                </div>
                            )}
                            {pdfState === "error" && (
                                <div className="absolute inset-x-0 top-10 mx-auto max-w-md rounded-lg border border-red-200 bg-white p-4 text-center text-sm text-red-700 shadow">
                                    The print preview could not be generated on the server. Use <strong>Test print</strong> to
                                    check the output through the browser instead.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default StyledInvoiceDesigner;
